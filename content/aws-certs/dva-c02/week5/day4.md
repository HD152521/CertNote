# Day 4 - S3 성능 최적화: 멀티파트 업로드, 전송 가속화, 접두사 설계

S3가 "무한 확장"이라고 광고하지만, 실제로는 어떻게 사용하느냐에 따라 성능이 수십 배 차이가 난다. 잘못된 접두사 설계로 핫 파티션을 만들거나, 단일 PUT으로 대용량 파일을 올리다 네트워크 오류로 처음부터 다시 시작하거나, 전 세계 사용자가 단일 리전 S3를 인터넷을 통해 접근하는 경우 — 이 모든 상황에서 S3는 병목이 된다. 이 day에서는 S3 성능의 수학적 한도를 이해하고, 그 한도를 최대한 활용하는 설계 패턴을 파고든다.

## S3의 처리량 한도 — 접두사 단위의 독립적 한도

S3의 처리량은 **접두사(Prefix) 단위**로 독립적으로 적용된다. 구체적으로:
- 접두사당 초당 3,500 PUT/COPY/POST/DELETE
- 접두사당 초당 5,500 GET/HEAD

"접두사"란 객체 키에서 파일명을 제외한 앞부분이다. `photos/2026/01/image.jpg`에서 접두사는 `photos/2026/01/`다.

왜 접두사 단위인가? S3 내부적으로 데이터는 파티션에 분산 저장되며, 같은 접두사를 가진 객체들은 같은 파티션에 배치되는 경향이 있다. 접두사를 다양하게 만들면 S3가 내부적으로 여러 파티션에 분산 저장할 수 있고, 각 파티션의 한도가 독립적으로 적용된다.

```
[단일 접두사 패턴 - 성능 낮음]
s3://bucket/uploads/file1.jpg    → 3,500 PUT/s 한도 공유
s3://bucket/uploads/file2.jpg
s3://bucket/uploads/file3.jpg

[다중 접두사 패턴 - 성능 높음]
s3://bucket/a/uploads/file.jpg  → 3,500 PUT/s 독립
s3://bucket/b/uploads/file.jpg  → 3,500 PUT/s 독립
s3://bucket/c/uploads/file.jpg  → 3,500 PUT/s 독립
→ 합산 10,500 PUT/s 가능
```

> 🔍 **더 깊이**: S3 내부의 파티션 분할 메커니즘은 2012년 Amazon이 특허 출원한 분산 해시 기반 키-밸류 스토리지에 기반한다. 과거(2018년 이전)에는 알파벳 순서가 같은 키들이 같은 파티션에 몰리는 문제가 있어서 키 앞에 랜덤 해시 prefix를 붙이는 것이 권장됐다(`abc123/uploads/file.jpg`). 2018년부터 S3가 자동 파티션 분할(Automatic Partitioning)을 도입하면서 이런 해킹이 더 이상 필요없어졌다. 하지만 이미 많은 시험 자료에 "랜덤 prefix 추가"가 정답으로 나와 있어 혼동이 생긴다 — 현재는 다양한 prefix를 사용하는 것이 권장이지 랜덤 문자를 앞에 붙이는 게 아니다.

## Burst Capacity — 일시적 트래픽 급증 처리

S3는 접두사당 처리량 한도를 초과하는 요청에 즉시 throttling하지 않는다. 일정 시간 미사용된 용량을 누적했다가 갑작스러운 트래픽 급증에 사용하는 **Burst Capacity** 메커니즘이 있다.

Burst Capacity의 동작 원리: 미사용 용량은 최대 **300초(5분)** 치까지 누적된다. 트래픽이 급증하면 이 누적된 용량을 먼저 소진한 후 throttling이 시작된다. 별도 설정이 필요없고 자동으로 동작한다.

실무적 함의: 1시간에 한 번 대량 파일을 올리는 배치 작업이 있다면, Burst Capacity 덕분에 한도를 일시적으로 초과할 수 있다. 하지만 지속적으로 한도를 초과한다면 접두사를 분산시키거나 S3에 직접 올리지 않고 SQS를 거쳐 순차 처리하는 패턴이 필요하다.

## 멀티파트 업로드 — 대용량 파일 업로드의 표준

단일 PUT 요청으로 업로드할 수 있는 최대 크기는 **5GB**다. 5TB 객체를 올리려면 반드시 Multipart Upload를 사용해야 한다.

Multipart Upload의 3단계:

```
1. CreateMultipartUpload
   → UploadId 발급 (이 ID로 이후 작업 식별)

2. UploadPart (병렬로 N번)
   → 각 파트에 1~10,000 번호 부여
   → 파트 크기: 최소 5MB (마지막 파트 예외), 최대 5GB
   → 각 파트 완료 시 ETag 반환

3. CompleteMultipartUpload
   → 파트 번호 + ETag 목록 제출
   → S3가 파트들을 합쳐 단일 객체 완성
   → 성공 시 최종 ETag 반환
```

Multipart의 핵심 이점은 세 가지다. 첫째, **병렬 업로드** — 10개 파트를 동시에 올리면 이론적으로 10배 속도 향상이 가능하다. 둘째, **부분 재전송** — 네트워크 오류로 5번 파트가 실패해도 1~4번과 6~N번은 다시 올릴 필요 없다. 셋째, **스트리밍 업로드** — 파일 크기를 미리 알 수 없을 때도 파트 단위로 업로드를 시작할 수 있다(마지막 파트는 어떤 크기든 가능).

| 제약 | 값 |
|------|-----|
| 파트 최소 크기 | 5MB (마지막 파트 제외) |
| 파트 최대 크기 | 5GB |
| 파트 최대 개수 | 10,000개 |
| 최대 객체 크기 | 5TB |
| 권장 시작 크기 | 100MB 이상 |
| 단일 PUT 최대 | 5GB |

> ⚠️ **함정**: 완료되지 않은 멀티파트 업로드는 S3에 "중간 파트"로 영구히 저장되며 저장 비용이 계속 발생한다. 어플리케이션이 크래시하거나 업로드를 취소해도 이미 업로드된 파트들은 자동으로 정리되지 않는다. **수명 주기 정책에 `AbortIncompleteMultipartUpload`를 반드시 추가**해야 한다. "7일 후 미완료 멀티파트 자동 삭제" 같은 규칙이 없으면 비용이 조용히 쌓인다.

```python
import boto3
from boto3.s3.transfer import TransferConfig

s3 = boto3.client('s3')

config = TransferConfig(
    multipart_threshold=1024 * 25,  # 25MB 이상이면 멀티파트
    max_concurrency=10,              # 최대 10개 병렬 스레드
    multipart_chunksize=1024 * 25,  # 파트 크기 25MB
    use_threads=True
)

# boto3 transfer manager가 자동으로 멀티파트 처리
s3.upload_file(
    'large_file.zip',
    'my-bucket',
    'uploads/large_file.zip',
    Config=config
)
```

boto3의 `TransferManager`는 임계값 이상의 파일을 자동으로 멀티파트로 처리한다. 직접 CreateMultipartUpload API를 호출할 필요 없다.

## 바이트 범위 가져오기(Byte-Range Fetches) — 병렬 다운로드

HTTP Range 헤더를 사용하면 객체의 특정 바이트 범위만 요청할 수 있다. 이를 활용한 3가지 패턴:

**병렬 다운로드**: 10GB 파일을 1GB씩 10개 범위로 나누어 동시 다운로드 → 이론적 10배 속도
**파일 헤더 조회**: 첫 수백 바이트만 다운로드해서 파일 타입/메타데이터 확인
**중단된 다운로드 재개**: 끊긴 지점부터 이어받기

```python
# Range 헤더로 파일의 첫 1KB만 다운로드
response = s3.get_object(
    Bucket='my-bucket',
    Key='large-video.mp4',
    Range='bytes=0-1023'
)
file_header = response['Body'].read()

# 병렬 다운로드: 10MB~20MB 구간
response = s3.get_object(
    Bucket='my-bucket',
    Key='large-file.bin',
    Range='bytes=10485760-20971519'
)
```

> 💡 **관련 이론**: HTTP Range Request는 RFC 7233에 정의된 표준이다. S3는 이 표준을 완전히 지원하며, 동시에 여러 Range 요청을 보내는 것도 허용된다. 이 기법은 P2P 다운로드 클라이언트(BitTorrent, 다운로드 매니저)에서 수십 년간 사용된 기술을 HTTP로 구현한 것이다. S3의 병렬 Range 다운로드는 이론적으로 단일 접두사 한도인 5,500 GET/s 이내에서 자유롭게 사용할 수 있다.

## S3 Transfer Acceleration — 엣지 경유 업로드 가속

Transfer Acceleration은 CloudFront 엣지 네트워크를 활용해 업로드 속도를 높인다. 클라이언트는 가장 가까운 CloudFront 엣지 로케이션에 업로드하고, 엣지에서 AWS 내부 백본 네트워크를 통해 목적지 S3 버킷으로 전달된다.

```
일반 업로드 경로:
[서울 클라이언트] → 퍼블릭 인터넷 → [us-east-1 S3]
(지연 시간 높음, 패킷 손실 가능성)

Transfer Acceleration 경로:
[서울 클라이언트] → AWS 서울 엣지(최적화된 경로) → AWS 백본 → [us-east-1 S3]
(내부 네트워크 = 낮은 지연, 높은 안정성)
```

활성화 방법: 버킷 단위로 설정, 추가 비용 발생(GB당 $0.04). URL은 `bucket.s3-accelerate.amazonaws.com`으로 변경된다.

언제 사용하는가: ① 전 세계 사용자가 단일 리전 버킷에 업로드할 때, ② 장거리 업로드에서 네트워크 불안정성이 문제일 때. 같은 리전 내 업로드에는 효과 없다.

## Transfer Acceleration vs CloudFront vs Multi-Region Access Point 비교

| 기능 | Transfer Acceleration | CloudFront | MRAP |
|------|----------------------|-----------|------|
| 주목적 | 글로벌 → 단일 버킷 업로드 가속 | 콘텐츠 다운로드 캐싱 | 가장 가까운 리전 자동 라우팅 |
| 캐싱 | ❌ | ✅ | ❌ |
| 방향 | 업로드 중심 | 다운로드 중심 | 업로드+다운로드 |
| 버킷 수 | 1개 | 1개 (오리진) | 여러 리전 여러 버킷 |
| 비용 | GB당 $0.04 추가 | 요청 + 데이터 전송 | 리전 간 데이터 전송 |
| 설정 복잡도 | 낮음 | 중간 | 높음 |

MRAP(Multi-Region Access Point)는 2021년 출시된 기능으로, 여러 리전의 버킷을 묶어 글로벌 엔드포인트 하나로 접근하게 한다. 요청은 자동으로 가장 가까운 리전의 버킷으로 라우팅된다. CRR(Cross-Region Replication)과 함께 사용하면 글로벌 Active-Active 패턴을 구현할 수 있다.

## S3 Select — SQL로 필요한 데이터만 가져오기

10GB CSV 파일에서 특정 조건의 행 100개만 필요한 상황을 생각해보자. 일반적인 방법은 10GB를 전부 다운로드한 후 클라이언트에서 필터링하는 것이다. S3 Select는 S3 서비스 측에서 SQL을 실행하여 필터링된 결과만 반환한다.

```sql
-- S3 Select SQL 예시: CSV에서 나이 30 이상인 사용자만
SELECT s.name, s.email 
FROM s3object s 
WHERE CAST(s.age AS INTEGER) > 30
```

지원 형식: CSV, JSON, Parquet (GZIP/BZIP2 압축도 지원). 비용: 스캔한 GB + 반환한 GB 기준 과금.

제한사항: 단순 SELECT/WHERE만 지원하고 JOIN, GROUP BY, 서브쿼리 등은 불가. 복잡한 쿼리가 필요하면 Amazon Athena를 사용해야 한다.

> 📚 **사례**: 2022년 한 글로벌 전자상거래 기업이 판매 로그를 S3에 저장하고 매일 특정 카테고리의 판매 데이터만 추출했다. 기존에는 100GB 파일을 전부 다운로드해서 Spark 클러스터에서 처리했는데, S3 Select로 전환 후 다운로드 크기가 평균 2GB로 줄었다(95% 감소). S3 API 비용이 늘었지만 EC2 처리 비용과 데이터 전송 비용이 크게 줄어 전체 비용이 40% 감소했다.

## CloudFront + S3 Origin Access Control — 비공개 S3 보안 배포

정적 웹사이트나 다운로드 파일을 CloudFront를 통해 배포할 때, S3 버킷을 퍼블릭으로 열면 CloudFront를 우회한 직접 접근이 가능해진다. OAC(Origin Access Control)는 CloudFront만 S3에 접근할 수 있게 제한하는 메커니즘이다.

| 항목 | OAI (구방식) | OAC (신방식, 권장) |
|------|------------|-----------------|
| 출시 | 2020년 이전 | 2022년 |
| SigV4 지원 | ❌ | ✅ |
| SSE-KMS 지원 | ❌ | ✅ |
| 모든 S3 리전 | 부분적 | ✅ 전체 |
| 신규 구현 | ⚠️ 마이그레이션 권장 | ✅ 권장 |

OAC 설정 후 버킷 정책에서 CloudFront 서비스 주체를 허용하고 나머지는 거부하면, 퍼블릭 인터넷에서 S3 URL로 직접 접근하면 403이 반환된다.

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "cloudfront.amazonaws.com"
    },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/ABCDEF"
      }
    }
  }]
}
```

> ⚠️ **함정**: 시험 자료가 2022년 이전에 작성됐다면 "CloudFront + S3 비공개 배포"의 답으로 OAI가 나온다. 2022년 이후에는 OAC가 권장이며 SSE-KMS 암호화 객체도 CloudFront로 서빙할 수 있다. 시험 문제에서 "CloudFront가 SSE-KMS 암호화된 S3 객체를 서빙해야 한다"는 조건이 있으면 OAC가 유일한 답이다.

## S3 Athena와의 결합 — 데이터 레이크 패턴

S3 Select가 단일 객체에 대한 간단한 필터링이라면, Amazon Athena는 수천 개의 S3 파일을 분산 쿼리 엔진(Presto/Trino 기반)으로 처리하는 서비스다.

| 항목 | S3 Select | Amazon Athena |
|------|-----------|---------------|
| 범위 | 단일 객체 | 다중 파일, 가상 테이블 |
| SQL | SELECT/WHERE만 | 완전한 SQL (JOIN, GROUP BY, HAVING, 서브쿼리) |
| 실행 위치 | S3 서비스 내 | 별도 Athena 엔진 |
| 과금 | 스캔 + 반환 GB | 스캔 GB당 $5 |
| 사용 | 단순 필터링 | 데이터 레이크 분석 |

"수억 개의 S3 객체에서 SQL로 복잡한 분석" → Athena. "하나의 10GB 파일에서 일부 행만 추출" → S3 Select.

S3 + Athena + Glue Data Catalog 조합이 AWS 데이터 레이크의 표준 아키텍처다. Parquet나 ORC 형식으로 저장하면 Athena 스캔 비용을 대폭 줄일 수 있다(컬럼 기반 형식이라 필요한 컬럼만 읽음).

S3의 성능 최적화는 단순히 "빠르게"가 아니라 처리량·지연시간·비용의 균형을 맞추는 설계 문제다. 멀티파트, Transfer Acceleration, Byte-Range, S3 Select, CloudFront OAC — 각 도구가 어떤 상황에서 최적인지를 이해하면 시험의 시나리오 문제를 자연스럽게 풀 수 있다.

## 📝 연습 문제

**문제 1.** 5GB를 초과하는 S3 객체를 업로드할 때 반드시 사용해야 하는 방법은? 그리고 멀티파트 업로드에서 각 파트의 최소 크기는? (단, 마지막 파트 제외)

A) 단일 PUT으로 업로드 가능, 파트 최소 1MB
B) Multipart Upload 필수, 파트 최소 5MB
C) Transfer Acceleration 필수, 파트 최소 10MB
D) Presigned URL 필수, 파트 최소 100MB

**정답: B**
해설: 단일 PUT의 최대 크기는 5GB다. 5GB 초과 시 Multipart Upload를 사용해야 하며, 각 파트(마지막 파트 제외)의 최소 크기는 5MB다. 5MB 미만 파트는 CompleteMultipartUpload 시 오류가 발생한다. 최대 파트 개수는 10,000개이며 객체 최대 크기는 5TB다. Transfer Acceleration과 Presigned URL은 파트 크기와 무관한 별도 기능이다.

---

**문제 2.** 전 세계 여러 국가의 사용자가 us-east-1의 S3 버킷에 대용량 파일을 업로드하는 애플리케이션이 있다. 업로드 속도를 개선하는 가장 적절한 방법은?

A) 각 국가마다 별도 S3 버킷 생성 후 CRR로 복제
B) S3 Transfer Acceleration 활성화
C) CloudFront를 업로드 경로에 추가
D) 모든 사용자를 us-east-1에 가까운 VPN으로 연결

**정답: B**
해설: Transfer Acceleration은 CloudFront 엣지 네트워크를 활용해 전 세계 어디서든 가장 가까운 엣지까지만 퍼블릭 인터넷을 거치고, 이후 AWS 백본 네트워크로 빠르게 버킷까지 전달한다. 각 국가마다 버킷 생성(A)은 과도한 관리 복잡도를 만든다. CloudFront는 캐싱 기반 다운로드 가속이지 업로드에는 적합하지 않다. VPN은 비용과 복잡도가 높다.

---

**문제 3.** S3 Select에 대한 올바른 설명은?

A) 여러 S3 버킷의 파일을 JOIN해서 조회할 수 있다
B) 단일 객체 내에서 SQL로 필터링하여 필요한 데이터만 반환한다
C) GROUP BY와 집계 함수를 완전히 지원한다
D) 다운로드 비용 없이 무료로 사용 가능하다

**정답: B**
해설: S3 Select는 단일 객체(CSV, JSON, Parquet) 내에서 간단한 SQL(SELECT/WHERE)을 실행하여 필요한 데이터만 반환한다. 전체 파일을 다운로드하는 대신 필터링된 결과만 전송하므로 네트워크 비용과 처리 비용이 줄어든다. JOIN이나 복잡한 집계는 Amazon Athena를 사용해야 한다. 비용은 스캔한 GB + 반환한 GB로 계산된다.

---

**문제 4.** S3 접두사 설계에 대한 올바른 설명은?

A) 모든 파일을 같은 접두사 아래 저장하면 S3가 자동으로 파티션을 분산한다
B) 접두사당 PUT 3,500/s, GET 5,500/s 한도가 독립 적용되므로 다양한 접두사를 사용하면 전체 처리량이 증가한다
C) 접두사는 성능과 무관하며 순수하게 조직화 목적으로만 사용된다
D) 접두사를 늘리면 S3 저장 비용이 증가한다

**정답: B**
해설: S3의 처리량 한도는 접두사(Prefix) 단위로 독립적으로 적용된다. 10개의 서로 다른 접두사를 사용하면 이론적으로 35,000 PUT/s, 55,000 GET/s가 가능하다. 과거에는 알파벳 순서로 몰리는 핫 파티션 문제가 있었지만, 2018년 이후 S3의 자동 파티션 분할로 해결됐다. 접두사 수는 저장 비용과 무관하다.

---

**문제 5.** CloudFront와 S3를 결합하여 비공개 콘텐츠를 배포할 때 현재(2024년) 권장되는 방법은?

A) S3 버킷을 퍼블릭으로 설정하고 CloudFront에 캐싱 설정
B) OAI(Origin Access Identity) 사용
C) OAC(Origin Access Control) 사용
D) CloudFront 대신 API Gateway를 S3 프록시로 사용

**정답: C**
해설: OAC(Origin Access Control)은 2022년 출시된 현재 권장 방식이다. OAI(Origin Access Identity)는 레거시이며 SSE-KMS 암호화 객체를 서빙할 수 없고 일부 리전에서만 지원됐다. OAC는 SigV4 서명을 지원하고 SSE-KMS 객체도 CloudFront로 서빙할 수 있으며 모든 리전에서 사용 가능하다. 시험에서 "SSE-KMS 암호화된 S3 콘텐츠를 CloudFront로 서빙"이라는 조건이 있으면 OAC가 유일한 정답이다.

---

**문제 6.** 미완료된 멀티파트 업로드로 인한 불필요한 S3 비용을 방지하는 방법은?

A) 멀티파트 업로드를 사용하지 않는다
B) 수명 주기 정책에 AbortIncompleteMultipartUpload 규칙 추가
C) 멀티파트 업로드 시 자동 완료 플래그 설정
D) S3 Intelligent-Tiering으로 스토리지 클래스 변경

**정답: B**
해설: 멀티파트 업로드를 시작했지만 완료하지 않은 경우, 이미 업로드된 파트들은 자동으로 삭제되지 않고 계속 저장 비용이 발생한다. 수명 주기 정책에 `AbortIncompleteMultipartUpload`를 설정하면 지정한 일수(예: 7일) 후 미완료 멀티파트 업로드의 파트들이 자동으로 삭제된다. 이것은 버전 관리 활성화 버킷에서 이전 버전을 자동 삭제하는 `NoncurrentVersionExpiration`과 함께 S3 비용 관리의 필수 설정이다.

---

**문제 7.** 100GB 크기의 로그 파일 중 특정 IP 주소의 로그만 추출해야 한다. 전체 파일을 EC2로 다운로드하지 않고 처리하는 가장 효율적인 방법은?

A) S3 Glacier Select로 Glacier에 저장 후 조회
B) S3 Select를 사용하여 S3 서비스 측에서 IP 필터링
C) CloudFront 로그 분석 기능 사용
D) S3 Inventory로 파일 목록을 받아 Athena로 분석

**정답: B**
해설: S3 Select는 CSV, JSON, Parquet 형식의 단일 파일에 SQL을 적용하여 필요한 데이터만 반환한다. 100GB 파일 전체를 다운로드하는 대신, WHERE 절로 특정 IP의 로그만 추출하면 네트워크 전송량과 처리 시간을 대폭 줄일 수 있다. S3 Glacier Select는 Glacier에 저장된 파일에 대한 유사 기능이지만, 이 시나리오는 일반 S3에 있는 파일이다. S3 Inventory는 파일 목록/메타데이터 조회용이다. Athena는 복수 파일이나 복잡한 쿼리에 적합하다.

---
