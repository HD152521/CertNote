# Day 16 - S3: 객체 스토리지의 내부 구조, 일관성 모델의 진화, 그리고 대규모 운영 패턴

S3는 2006년 AWS 최초의 서비스로 출시됐을 때, 외부 개발자들이 "파일을 HTTP로 저장할 수 있다"는 사실만으로 혁명적이라고 느꼈다. 그러나 17년이 지난 지금 S3는 단순한 파일 저장소가 아니다. 분산 객체 스토리지 시스템으로서 Dynamo(Amazon의 내부 키-값 DB)의 설계 원리 위에서 동작하고, 2020년에는 일관성 모델까지 완전히 바꿨다.

이 글에서는 S3의 내부 동작 원리(데이터가 어떻게 분산·복제되는지), 일관성 모델이 왜 2020년에야 강한 일관성을 달성했는지, 멀티파트 업로드의 정확한 API 시퀀스, 버전 관리의 내부 동작, Presigned URL의 서명 메커니즘까지 다룬다.

## S3의 탄생 배경: 왜 파일 시스템이 아닌 객체 스토리지인가

2000년대 초 Amazon.com은 급증하는 데이터를 어떻게 저장할지 근본적인 문제에 직면했다. 전통적인 파일 시스템(NFS, SAN)은 수평 확장이 어렵고, RAID 어레이는 용량 한계가 있었다. 더 근본적인 문제는 파일 시스템의 "부분 수정(random write)" 기능이 대규모 분산 환경에서 일관성 관리를 엄청나게 복잡하게 만든다는 것이었다.

객체 스토리지의 핵심 설계 결정은 **불변성(Immutability)**이다. 객체는 통째로 쓰고(PUT), 통째로 읽고(GET), 통째로 삭제한다(DELETE). 부분 수정이 없다. 이 제약이 오히려 대규모 분산 스토리지를 단순하게 만든다. 복제본 간 부분 수정 동기화라는 가장 어려운 문제를 제거하기 때문이다.

S3의 내부 구조는 2007년 Amazon의 Dynamo 논문(DeCandia et al., SOSP 2007)에서 설명한 분산 키-값 시스템의 원리를 따른다. 버킷 이름과 키가 결합되어 해시 공간에서 위치가 결정되고, 그 위치를 담당하는 스토리지 서버가 데이터를 저장한다. 11개의 9(99.999999999%)라는 내구성은 여러 시설·서버·드라이브에 걸친 복제로 달성된다.

> 💡 **관련 이론**: S3의 내구성 설계는 **Reed-Solomon 에러 정정 코드**와 **일관된 해싱(Consistent Hashing)** 원리를 활용한다. Reed-Solomon은 원본 데이터를 k개의 데이터 청크와 m개의 패리티 청크로 나눠서, m개의 청크가 손실되어도 복구할 수 있다. Dynamo 논문에서 설명하는 가상 노드(Virtual Node) 기반 Consistent Hashing은 스토리지 서버 추가/제거 시 데이터 재배치를 최소화한다. S3는 이를 수백 PB 규모로 운영하고 있다.

> 📚 **사례**: 2006년 S3 출시 당시 AWS의 Andy Jassy가 공개한 바에 따르면, 첫 번째 고객 중 하나는 Smugmug(사진 공유 서비스)였다. Smugmug는 기존 NetApp SAN 스토리지를 모두 S3로 이전해 수백만 달러의 스토리지 비용을 절감했다. 이 사례가 "클라우드 스토리지"라는 개념의 실증 사례가 됐다.

## 버킷·키·객체: 추상화의 의미

**버킷 이름의 글로벌 유일성**은 DNS 호스트네임으로 변환되기 때문이다. S3 객체의 기본 URL은 `https://bucket-name.s3.region.amazonaws.com/key`다. 버킷 이름이 DNS 서브도메인이 되므로 전 세계에서 유일해야 한다. 데이터는 버킷 생성 시 선택한 리전에만 저장된다. "글로벌 이름 + 리전 데이터"라는 이중 구조다.

**키(Key)**는 계층적 경로처럼 보이지만(`data/2025/january/report.csv`) 실제로는 단순한 문자열이다. S3에는 디렉토리 개념이 없다. `/` 문자를 포함한 키를 prefix로 필터링해서 "폴더처럼" 보여주는 것이 콘솔과 SDK가 하는 트릭이다. `ListObjectsV2` API에서 `Delimiter=/`와 `Prefix=data/2025/`를 조합하면 해당 "폴더"의 내용을 볼 수 있다.

이 가상 폴더 구조가 S3 성능에 영향을 미쳤던 역사가 있다. 초기 S3는 키를 사전순으로 파티셔닝했다. 모든 키가 `logs/2025-01-01/`로 시작하면 같은 파티션에 몰려 I/O가 집중됐다. 과거 가이드에서 "키에 랜덤 prefix를 추가하라"고 했던 이유다. 그러나 2018년부터 S3는 자동 파티셔닝을 지원하며 초당 3,500 PUT/DELETE와 5,500 GET 요청을 버킷 prefix별로 자동으로 분산한다. 현재는 의도적인 키 분산이 불필요하다.

```
[ S3 객체 크기 제한 ]

단일 PutObject:    최대 5GB
멀티파트 업로드:   최대 5TB (파트당 최소 5MB, 파트 수 최대 10,000)
객체 최대 크기:    5TB

권장:
- 100MB 미만: 단일 PutObject
- 100MB ~ 5GB: 멀티파트 권장
- 5GB 초과: 멀티파트 필수
```

> 🔍 **더 깊이**: 멀티파트 업로드의 정확한 API 시퀀스는 3단계다. ① `CreateMultipartUpload` → Upload ID 발급. ② `UploadPart` (파트 번호 1-10,000, 각 최소 5MB) × N번, 병렬로 가능. ③ `CompleteMultipartUpload` → 파트 번호 순서와 ETag 목록을 제출하면 S3가 조합. 중간에 실패하면 해당 파트만 재업로드하면 된다. `AbortMultipartUpload`나 수명 주기 정책으로 미완료 파트를 정리해야 한다. 미완료 파트는 완료된 객체처럼 과금된다.

## S3 일관성 모델의 진화: 왜 2020년이었나

S3 출시부터 2020년 11월까지, S3는 **최종 일관성(Eventually Consistent)** 모델을 사용했다. PUT 후 즉시 GET하면 구버전이 반환될 수 있었고, 삭제 후 LIST에 여전히 객체가 나타날 수 있었다. 개발자들이 삭제 후 "조금 기다리는" 코드를 짜야 했던 이유다.

왜 강한 일관성이 처음부터 불가능했는가. 분산 시스템 이론의 CAP 정리(Brewer, 2000)에 따르면 분산 시스템은 Consistency, Availability, Partition Tolerance 중 두 가지만 동시에 달성할 수 있다. S3는 수백만 명이 동시에 사용하는 글로벌 시스템이므로 Availability와 Partition Tolerance를 우선시했다. 강한 일관성을 제공하려면 쓰기 시 모든 복제본에 동기적으로 반영해야 해서 레이턴시가 높아진다.

2020년 12월, AWS는 S3의 **모든 작업에 강한 일관성(Strong Consistency)**을 발표했다. PUT/DELETE 후 즉시 GET하면 최신 데이터를 반환하고, LIST도 최신 상태를 반영한다. 이것이 가능해진 이유는 S3의 내부 인덱스 시스템을 재설계해서 추가 레이턴시 없이 일관성을 보장하는 방법을 찾았기 때문이다.

> 💡 **관련 이론**: S3의 강한 일관성은 PACELC 정리(Abadi, 2012)의 관점에서 "네트워크 파티션이 없을 때 레이턴시(L)를 희생하지 않고 일관성(C)을 달성"한 사례다. 내부적으로는 각 객체의 메타데이터를 담당하는 메타데이터 서비스에서 Paxos 또는 유사한 합의 프로토콜을 사용해 원자적(atomic) 업데이트를 보장하는 것으로 추정된다. AWS는 상세 구현을 공개하지 않았다.

## 버전 관리: 내부 동작과 비용 함정

버전 관리를 활성화하면 같은 키에 PUT이 이루어질 때마다 새 버전 ID가 생성되고 이전 버전은 보존된다. 삭제(DELETE) 시에는 실제로 데이터를 지우지 않고 "Delete Marker"라는 특수 객체를 최신 버전으로 추가한다. `GetObject`가 Delete Marker를 만나면 404를 반환한다. 이전 버전에 접근하려면 버전 ID를 명시해야 한다.

```
[ 버전 관리 내부 동작 ]

키: "data/report.pdf"

상태 1 (업로드):
  VersionID: v1  ← 최신, 1MB

상태 2 (재업로드):
  VersionID: v2  ← 최신, 1.5MB
  VersionID: v1  ← 이전 버전, 1MB

상태 3 (DELETE):
  VersionID: Delete Marker  ← 최신 (실제 내용 없음)
  VersionID: v2  ← 이전, 1.5MB
  VersionID: v1  ← 이전, 1MB
  → GetObject("data/report.pdf") → 404

상태 4 (Delete Marker 삭제):
  VersionID: v2  ← 최신 (복구됨)
  VersionID: v1  ← 이전
```

버전 관리의 비용 함정은 오래된 버전들이 모두 과금된다는 것이다. 10번 업데이트된 100MB 파일은 1GB를 차지한다. 수명 주기 정책(Lifecycle Policy)으로 N일 이전 버전을 자동 만료시키는 것이 필수다.

**MFA Delete**: 버전 관리 활성화·비활성화와 영구 삭제(버전 ID를 명시한 DELETE)에 MFA를 요구한다. 랜섬웨어 공격이나 실수로 인한 데이터 삭제를 방지하는 최후 방어선이다.

> ⚠️ **함정**: 버전 관리는 활성화(Enabled) 후 비활성화(Disabled) 불가, 오직 정지(Suspended)만 가능하다. 정지 상태에서는 신규 객체에 버전 ID가 부여되지 않지만, 기존 버전들은 유지된다. 버전 관리를 완전히 끄고 싶으면 새 버킷을 만들어야 한다.

## Object Lock: WORM 스토리지

Object Lock은 객체를 **Write Once, Read Many(WORM)** 방식으로 보호한다. 법적 증거 보관, 금융 레코드, 의료 데이터 장기 보관 같이 데이터 수정·삭제가 법적으로 금지된 경우에 쓰인다.

두 가지 모드:
- **Governance Mode**: 특별 권한(`s3:BypassGovernanceRetention`)이 있는 IAM 사용자는 잠금 해제 가능. 일반 사용자는 불가.
- **Compliance Mode**: **root 계정 포함 누구도 잠금 해제·삭제 불가**. 보유 기간이 지나야 삭제 가능.

보유 정책:
- **Retention Period**: 특정 날짜까지 잠금 (날짜 또는 기간으로 설정)
- **Legal Hold**: 날짜 없이 무기한 잠금 (소송 홀드, 별도 권한으로 해제)

> 📚 **사례**: 금융 서비스 업계는 SEC Rule 17a-4(미국 증권거래위원회 규정)에 따라 거래 기록을 최소 3-6년간 수정 불가 상태로 보관해야 한다. AWS S3 Object Lock Compliance 모드는 이 요구를 충족하며, Cohasset Associates가 S3 Object Lock이 SEC Rule 17a-4와 CFTC Rule 1.31을 준수함을 인증했다.

## S3 Replication: CRR과 SRR의 차이

**CRR(Cross-Region Replication)**: 다른 리전의 버킷으로 복제. DR(재해 복구), 컴플라이언스, 글로벌 지연 최소화에 쓴다.

**SRR(Same-Region Replication)**: 같은 리전 내 다른 버킷으로 복제. 로그 집계(여러 계정의 로그를 한 버킷으로), 개발/프로덕션 데이터 동기화에 쓴다.

복제는 **버전 관리가 양쪽 버킷 모두에 활성화**되어야 동작한다. 복제 규칙 활성화 이전에 존재하던 객체는 복제되지 않는다(소급 적용 없음). **S3 Batch Replication**으로 기존 객체를 일괄 복제할 수 있다.

**RTC(Replication Time Control)**: 99.99%의 객체를 15분 이내에 복제하는 SLA를 제공한다. 추가 비용이 있지만, "RPO 15분"이라는 명확한 보장이 필요한 규제 환경에서 필수다.

> 💡 **관련 이론**: CRR은 **비동기 복제(Asynchronous Replication)**다. 원본 버킷에 PUT이 성공하면 클라이언트에 즉시 응답하고, 복제는 백그라운드에서 진행된다. 이는 RDS Cross-Region Read Replica와 동일한 원리다. "복제 전에 원본 리전이 완전히 다운되면" RPO > 0이 된다. RTC를 쓰면 그 RPO를 최대 15분으로 제한한다.

## Presigned URL: 서명 메커니즘

Presigned URL은 S3 객체에 임시 접근 권한을 부여하는 서명된 URL이다. IAM 자격증명으로 서명된 URL에는 만료 시간이 내장되어 있다.

```
Presigned URL 구조:
https://bucket.s3.amazonaws.com/key
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKID/20260520/ap-northeast-2/s3/aws4_request
  &X-Amz-Date=20260520T120000Z
  &X-Amz-Expires=3600
  &X-Amz-Signature=[HMAC-SHA256 서명]
```

서명은 AWS Signature Version 4(SigV4) 알고리즘을 사용한다. 요청 파라미터, 헤더, 날짜, 리전, 서비스, 비밀 키가 HMAC-SHA256으로 해싱되어 서명이 생성된다. S3는 요청 수신 시 동일한 계산을 반복해서 서명을 검증한다.

중요한 제약: **IAM 역할로 Presigned URL을 발급하면 역할의 임시 자격증명이 만료되면 URL도 사용 불가**가 된다. IAM 역할의 세션 토큰 유효 시간(최대 12시간)이 URL의 만료 시간과 독립적이므로, 역할 세션이 더 짧게 만료될 수 있다. Presigned URL의 실질적 최대 만료는 IAM 역할 세션 시간의 작은 값이다.

```bash
# Presigned URL 발급 (기본 서명은 요청자 자격증명 사용)
aws s3 presign s3://my-bucket/data/report.pdf \
  --expires-in 3600 \
  --region ap-northeast-2

# 업로드용 Presigned URL (AWS SDK Python)
import boto3
s3 = boto3.client('s3')
url = s3.generate_presigned_url(
    'put_object',
    Params={'Bucket': 'my-bucket', 'Key': 'uploads/file.pdf'},
    ExpiresIn=300,  # 5분
    HttpMethod='PUT'
)
```

> 🔍 **더 깊이**: Presigned URL을 직접 S3 버킷으로 업로드하는 패턴("Direct Browser Upload")은 서버를 거치지 않아 서버 비용과 대역폭을 절감한다. 클라이언트가 API 서버에 Presigned URL 발급을 요청 → API 서버가 Presigned PUT URL을 반환 → 클라이언트가 그 URL로 S3에 직접 PUT → S3가 완료 후 이벤트 알림으로 처리 파이프라인 트리거. 이 패턴에서 S3 CORS 설정이 필요하다. 브라우저가 `PUT` 전에 `OPTIONS` preflight를 보내기 때문이다.

## S3 이벤트 알림: EventBridge vs 기본 알림

S3 이벤트는 두 채널로 보낼 수 있다.

**기본 이벤트 알림**: S3 → SNS/SQS/Lambda로 직접 전송. 설정이 간단하고 레이턴시가 낮다. 단, 단일 목적지만 지정 가능하고 필터가 prefix/suffix로만 제한된다.

**EventBridge 통합**: S3 → EventBridge → 여러 목적지. EventBridge의 규칙(Rule)으로 이벤트 유형별로 다른 처리를 정의할 수 있다. Archive, Replay, 여러 타겟, 세밀한 필터링이 가능하다.

```
[ S3 이벤트 + EventBridge 패턴 ]

S3 ObjectCreated:
  → EventBridge Rule 1 (key가 "uploads/*.jpg"):
      - Lambda (썸네일 생성)
      - SQS (처리 큐)
  → EventBridge Rule 2 (key가 "reports/*.pdf"):
      - Lambda (PDF 파싱)
      - SNS (알림 발송)
```

> ⚠️ **함정**: "S3 이벤트를 여러 다른 처리 시스템으로 팬아웃하고 싶다" → 기본 S3 알림으로는 목적지 하나만 가능. EventBridge를 사용하면 여러 규칙과 여러 타겟으로 분기 가능. 또는 S3 → SNS → 여러 SQS 구독으로 팬아웃하는 패턴도 있다.

## Transfer Acceleration: 글로벌 업로드 가속

Transfer Acceleration은 S3 버킷으로의 업로드 경로에 CloudFront 엣지 로케이션을 삽입한다. 서울의 사용자가 `bucket.s3-accelerate.amazonaws.com`으로 업로드하면, 가장 가까운 엣지 로케이션(예: 김포 PoP)까지는 공용 인터넷, 이후로는 AWS 백본망을 통해 목적지 리전(예: us-east-1)으로 전달된다.

대륙 간 업로드(한국 → us-east-1)에서 효과적이다. 같은 리전 내에서는 효과가 없거나 오히려 느릴 수 있다. Transfer Acceleration 엔드포인트를 사용하면 추가 비용이 발생하므로, 실제 개선 효과가 있을 때만 사용한다.

## S3 Object Lambda: 객체 접근 시 변환

S3 Object Lambda는 `GetObject` 요청을 가로채서 Lambda로 데이터를 변환한 후 클라이언트에 반환한다. 실시간 데이터 변환이 필요하지만 원본 데이터를 변경하고 싶지 않을 때 유용하다.

패턴: 
- PII(개인 식별 정보) 마스킹: CSV 파일의 주민번호 열을 `****`로 대체해서 반환
- 이미지 리사이징: 원본 고해상도 이미지를 클라이언트 요청 크기로 동적 변환
- 압축/해제: gzip 압축된 파일을 해제해서 반환

```
[ S3 Object Lambda 흐름 ]

클라이언트 → S3 Object Lambda Access Point
                     ↓ (GetObject 가로챔)
              Lambda 함수 (변환 처리)
                     ↓ (WriteGetObjectResponse)
              S3 원본 버킷 (실제 데이터)
                     ↓ (변환된 결과)
클라이언트 ← (변환된 데이터)
```

## 다른 클라우드와의 S3 비교

| 기능 | AWS S3 | GCP Cloud Storage | Azure Blob Storage |
|------|--------|-------------------|-------------------|
| 일관성 | Strong (2020.12~) | Strong (원래부터) | Strong |
| 객체 최대 크기 | 5TB | 5TB | 4.77TB (195GB for block) |
| 버전 관리 | O | O | O |
| 객체 잠금(WORM) | O (Object Lock) | O (Retention Policy) | O (Immutable Storage) |
| 이벤트 알림 | SNS/SQS/Lambda/EventBridge | Pub/Sub | Event Grid |
| 전송 가속 | Transfer Acceleration | 기본 고속 (글로벌 네트워크) | N/A |
| 쿼리 기능 | S3 Select / Athena | BigQuery | Blob Storage + Azure Synapse |

GCP Cloud Storage는 처음부터 강한 일관성을 제공했다. 이것이 GCP가 "S3보다 일관성이 확실하다"고 마케팅하던 포인트였으나, AWS가 2020년 따라잡았다.

## CLI로 이해 굳히기

```bash
# 버킷 생성 (서울 리전)
aws s3api create-bucket \
  --bucket my-saa-bucket-$(date +%s) \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# 버전 관리 활성화
aws s3api put-bucket-versioning \
  --bucket my-bucket \
  --versioning-configuration Status=Enabled

# MFA Delete 활성화 (root 계정에서만 가능)
aws s3api put-bucket-versioning \
  --bucket my-bucket \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::123456789012:mfa/root-account-mfa-device 123456"

# 버전 목록 조회
aws s3api list-object-versions --bucket my-bucket --prefix data/

# 수명 주기 정책 (미완료 멀티파트 + 오래된 버전 자동 삭제)
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "clean-multipart",
        "Status": "Enabled",
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
      },
      {
        "ID": "expire-old-versions",
        "Status": "Enabled",
        "NoncurrentVersionExpiration": {"NoncurrentDays": 30}
      }
    ]
  }'

# Object Lock 설정 (Compliance 모드, 7년)
aws s3api put-object-retention \
  --bucket compliance-bucket \
  --key financial-records/2025/q4.csv \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2032-12-31T00:00:00Z"}'

# CRR 복제 규칙 설정
aws s3api put-bucket-replication \
  --bucket source-bucket \
  --replication-configuration '{
    "Role": "arn:aws:iam::123456789012:role/replication-role",
    "Rules": [{
      "Status": "Enabled",
      "Destination": {
        "Bucket": "arn:aws:s3:::dest-bucket-us-east-1",
        "ReplicationTime": {"Status": "Enabled", "Time": {"Minutes": 15}},
        "Metrics": {"Status": "Enabled", "EventThreshold": {"Minutes": 15}}
      }
    }]
  }'
```

## 정리하며

S3는 단순한 파일 저장소처럼 보이지만, 내부적으로는 Dynamo 논문에서 영감을 받은 분산 객체 스토리지 시스템이다. 불변 객체 모델이 대규모 분산 복제를 가능하게 하고, 2020년의 일관성 업그레이드로 개발자의 부담이 크게 줄었다.

시험에서 S3 관련 질문은 대부분 트레이드오프 선택이다. 임시 파일 공유는 Presigned URL, 멀티 대상 이벤트 처리는 EventBridge, 법적 데이터 보관은 Object Lock Compliance, 다른 리전 DR은 CRR + RTC. 각각의 "왜"를 이해하면 새로운 시나리오에서도 답이 보인다.

---

## 📝 연습 문제

**문제 1.** S3 버킷에 저장된 민감한 데이터를 외부 협력사와 공유해야 한다. 협력사에게 버킷 접근 권한을 영구 부여하지 않으면서, 24시간 동안만 특정 파일을 다운로드할 수 있게 하려면?

A) 버킷을 Public으로 설정하고 링크를 전달
B) Presigned URL을 86400초(24시간) 만료로 발급
C) 협력사 IAM 사용자를 생성하고 S3 GetObject 권한 부여
D) S3 Transfer Acceleration 활성화

**정답: B**
해설: Presigned URL은 IAM 자격증명으로 서명된 시간 제한 URL이다. 협력사에 영구 권한을 주지 않으면서 특정 파일에만 접근할 수 있다. 버킷 Public 설정은 영구적으로 모든 사람에게 접근을 허용한다. IAM 사용자 생성은 영구 자격증명을 부여하는 것이고, 나중에 회수를 잊으면 보안 문제가 된다. Transfer Acceleration은 업로드 가속용이다.

---

**문제 2.** 회사의 규정 준수팀이 특정 S3 버킷의 모든 데이터를 법적 소송이 완료될 때까지 삭제하지 못하게 해야 한다. 소송이 언제 끝날지 모른다. 가장 적합한 S3 기능은?

A) Object Lock Compliance Mode (Retention Period 1년)
B) S3 Versioning + MFA Delete
C) Object Lock Legal Hold
D) S3 Bucket Policy (Deny: s3:DeleteObject)

**정답: C**
해설: Legal Hold는 만료 날짜 없이 무기한으로 객체를 보호하고, 별도 권한(`s3:PutObjectLegalHold`)으로만 해제 가능하다. 소송 종료 시 Legal Hold를 해제하면 된다. Compliance Mode는 특정 날짜를 지정해야 하는데 소송 종료 날짜를 모른다. MFA Delete는 실수 삭제 방지이지 법적 잠금이 아니다. Bucket Policy로 삭제를 막을 수 있지만 Policy 자체를 수정하면 우회 가능하다.

---

**문제 3.** 사진 업로드 앱에서 사용자가 업로드한 고해상도 이미지를 S3에 저장하고, 업로드 즉시 여러 크기의 썸네일을 생성해 다른 S3 버킷에 저장해야 한다. 또한 이미지 업로드 이벤트를 DynamoDB에 기록하고 SNS로 관리자에게 알림을 보내야 한다. 어떤 아키텍처가 적합한가?

A) S3 이벤트 → Lambda (썸네일 생성 + DynamoDB 저장 + SNS 알림)
B) S3 이벤트 → EventBridge → Lambda (썸네일), DynamoDB Streams, SNS
C) S3 이벤트 → EventBridge → Rule 1 → Lambda(썸네일), Rule 2 → Lambda(DDB), Rule 3 → SNS
D) CloudFront → S3 → Lambda@Edge (썸네일) → DynamoDB + SNS

**정답: C**
해설: 단일 S3 이벤트를 여러 처리 시스템으로 분기하려면 EventBridge가 필요하다. EventBridge 규칙으로 동일 이벤트를 Lambda(썸네일), Lambda(DDB 저장), SNS(알림)로 병렬 전달한다. A의 단일 Lambda는 한 함수가 세 가지 일을 해서 단일 장애점(SPOF)이 되고, 관심사 분리가 안 된다. 기본 S3 이벤트 알림은 단일 목적지만 가능하다. D는 CloudFront가 불필요하고 Lambda@Edge는 이 패턴에 맞지 않는다.

---

**문제 4.** 규제 기관이 금융 거래 기록을 7년간 수정·삭제 불가 상태로 보관하도록 요구한다. AWS S3에서 root 계정을 포함한 누구도 데이터를 삭제할 수 없어야 한다. 어떻게 구성하는가?

A) S3 Object Lock Governance Mode, Retention Period 7년
B) S3 Object Lock Compliance Mode, Retention Period 7년
C) S3 Versioning + MFA Delete 활성화
D) S3 Bucket Policy: Deny s3:DeleteObject for all principals

**정답: B**
해설: Compliance Mode는 root 계정을 포함한 누구도 보유 기간 내에 객체를 삭제하거나 잠금을 해제할 수 없다. 규제 환경에서 법적 보관 요건을 충족한다. Governance Mode는 `s3:BypassGovernanceRetention` 권한을 가진 사용자가 잠금을 해제할 수 있어 "누구도 삭제 불가" 요건을 충족하지 못한다. Versioning + MFA Delete는 실수 삭제 방지이지 법적 WORM 요건과 다르다. Bucket Policy는 Policy 자체를 수정하면 우회 가능하다.

---

**문제 5.** 회사가 서울(ap-northeast-2) 리전 S3 버킷의 데이터를 도쿄(ap-northeast-1)에 DR용으로 복제한다. "99.99%의 객체가 15분 내에 복제된다"는 보장이 필요하다. 어떤 기능을 활성화해야 하는가?

A) S3 Transfer Acceleration
B) S3 Cross-Region Replication (CRR) + Replication Time Control (RTC)
C) S3 CRR + S3 Inventory
D) S3 CRR + CloudFront

**정답: B**
해설: CRR은 리전 간 복제 기능이고, RTC(Replication Time Control)는 99.99%의 객체를 15분 이내에 복제하는 SLA를 추가한다. RTC를 활성화하면 복제 진행 상황을 CloudWatch에서 모니터링할 수도 있다. Transfer Acceleration은 업로드 가속용이다. S3 Inventory는 버킷 내 객체 목록 리포트다. CloudFront는 CDN으로 복제와 무관하다.

---

**문제 6.** 개발팀이 파이썬 코드로 S3에 5.2GB 파일을 업로드하려 한다. 네트워크가 불안정해서 중간에 끊길 수 있다. 가장 안정적인 업로드 방법과, 중단된 업로드 파트의 비용을 방지하는 방법을 선택하시오.

A) 단일 PutObject + 실패 시 전체 재업로드 / 수명 주기 불필요
B) 멀티파트 업로드 + 파트 단위 재시도 / S3 수명 주기 규칙으로 불완전 멀티파트 7일 후 삭제
C) S3 Transfer Manager(고수준 SDK) + 자동 멀티파트 / 수동 파트 정리
D) S3 Select로 병렬 분할 업로드 / EventBridge로 파트 정리

**정답: B**
해설: 5.2GB는 단일 PutObject 한도(5GB)를 초과하므로 멀티파트 업로드가 필수다. 멀티파트는 파트별로 업로드하므로 네트워크 중단 시 해당 파트만 재업로드하면 된다. 수명 주기 규칙 `AbortIncompleteMultipartUpload: DaysAfterInitiation: 7`로 7일 내 완료되지 않은 파트를 자동 삭제해 비용을 방지한다. C의 Transfer Manager는 AWS SDK가 내부적으로 멀티파트를 자동 처리하는 고수준 API이지만, 수명 주기 규칙은 별도로 설정해야 한다. S3 Select는 쿼리 기능이지 업로드 기능이 아니다.