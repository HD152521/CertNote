# Day 25 - S3 고급 기능 + Week 5 종합 복습

Week 5의 마지막 날이다. S3 이벤트 알림, Presigned URL, 정적 웹사이트 호스팅이라는 세 가지 고급 기능을 마저 살펴보고, 그 다음 지난 4일간 배운 S3 전체를 시험 관점에서 정리한다. S3는 DVA-C02에서 가장 많은 문제가 나오는 서비스 중 하나다. 단순 암기가 아니라 "왜 그렇게 동작하는가"를 이해하면 변형 문제에서도 흔들리지 않는다.

## S3 이벤트 알림 — 파일이 도착할 때 무슨 일이 일어나는가

S3 이벤트 알림은 "버킷에서 특정 일이 발생했을 때 누군가에게 알려라"는 패턴이다. 이 패턴은 서버리스 아키텍처의 핵심이다 — S3에 파일이 올라오면 Lambda가 자동으로 실행되고, 이미지 리사이징, 문서 변환, 데이터 검증이 일어난다.

지원하는 이벤트 유형:
- `s3:ObjectCreated:*` — PUT, POST, COPY, 멀티파트 완료 모두 포함
- `s3:ObjectCreated:Put` — PUT만
- `s3:ObjectRemoved:*` — 삭제 및 삭제 마커 생성
- `s3:ObjectRestore:*` — Glacier 복원 시작/완료
- `s3:Replication:*` — 복제 실패, 미완료 등

직접 연결 대상 3종: Lambda 함수, SQS 큐, SNS 주제.

**Amazon EventBridge를 경유하는 방법**이 2021년 추가됐고, 이 방식이 현재 가장 권장된다. 이유는 이벤트 아카이빙, 재생(replay), 18개 이상의 대상(Step Functions, Kinesis, API Gateway, CodePipeline 등), 세밀한 이벤트 패턴 필터링(접두사, 접미사, 크기 조건 등)이 가능하기 때문이다.

직접 연결(Lambda/SQS/SNS)은 대상이 이미 명확하고 간단한 경우, EventBridge는 유연성이 필요한 경우를 선택 기준으로 삼으면 된다.

> 💡 **관련 이론**: S3 이벤트 알림은 이벤트 기반 아키텍처(EDA, Event-Driven Architecture)의 전형적인 구현이다. 2003년 Amazon의 내부 SOA(Service-Oriented Architecture) 전환 이후, AWS 서비스들은 이벤트로 소통하는 것을 기본 설계 원칙으로 삼는다. S3 이벤트는 최소 한 번 전달(at-least-once)을 보장하지만 중복 전달이 가능하다 — Lambda나 SQS 컨슈머에서 멱등성(Idempotency)을 보장해야 하는 이유다.

> ⚠️ **함정**: S3 이벤트 알림은 "최소 한 번(at-least-once)" 전달이지 "정확히 한 번(exactly-once)"이 아니다. 같은 PUT에 대해 Lambda가 두 번 호출될 수 있다. Lambda 내에서 멱등 처리(이미 처리된 파일인지 확인하는 DynamoDB 항목 등)를 구현해야 한다.

## Presigned URL — IAM 권한을 URL에 담는 방법

Presigned URL은 생성자의 IAM 자격증명을 사용해 서명된 임시 URL이다. URL을 받은 사람은 해당 URL이 유효한 동안 생성자의 권한으로 S3 작업을 수행할 수 있다.

```python
import boto3
from datetime import datetime, timedelta

s3 = boto3.client('s3')

# 1. 비공개 파일 임시 공유 (GET)
download_url = s3.generate_presigned_url(
    'get_object',
    Params={
        'Bucket': 'my-private-bucket',
        'Key': 'confidential/report-2026.pdf'
    },
    ExpiresIn=3600  # 1시간 유효
)

# 2. 클라이언트가 서버를 통하지 않고 직접 S3에 업로드 (PUT)
upload_url = s3.generate_presigned_url(
    'put_object',
    Params={
        'Bucket': 'my-upload-bucket',
        'Key': f'user-uploads/{user_id}/avatar.jpg',
        'ContentType': 'image/jpeg'
    },
    ExpiresIn=300  # 5분 유효
)

# 3. POST 형식 Presigned URL (HTML form 업로드)
response = s3.generate_presigned_post(
    Bucket='my-bucket',
    Key='uploads/${filename}',  # 변수 사용 가능
    Fields={'Content-Type': 'image/jpeg'},
    Conditions=[
        ['content-length-range', 1, 10 * 1024 * 1024]  # 최대 10MB
    ],
    ExpiresIn=600
)
```

**Presigned URL의 핵심 특성들:**

만료 시간: IAM 사용자 기반이면 최대 7일, **IAM 역할(STS 임시 자격증명) 기반이면 최대 12시간**(STS 토큰 만료 시간에 제한됨). 시험에서 "최대 7일"이 아닌 "최대 1시간"이 맞는 경우가 있는데 — IAM 역할로 Lambda나 EC2에서 생성했다면 STS 토큰 TTL(최대 12시간)이 제한이 된다.

생성자 권한: URL을 생성한 시점에 생성자가 해당 작업 권한을 가지고 있어야 한다. 생성 시점에 권한이 있었더라도, 이후 IAM 정책 변경으로 권한이 제거되면 URL도 작동을 멈춘다.

PUT Presigned URL 패턴: 서버가 URL을 생성해서 클라이언트에게 전달하고, 클라이언트가 직접 S3에 파일을 업로드한다. 서버는 파일 데이터를 처리하지 않아 대역폭 부하가 없다. 파일 업로드가 완료되면 클라이언트가 서버에 완료 알림을 보내고, 서버는 S3 이벤트나 DynamoDB 메타데이터를 확인한다.

> 🔍 **더 깊이**: Presigned URL의 서명은 AWS SigV4(Signature Version 4) 알고리즘으로 생성된다. SigV4는 HMAC-SHA256을 사용하며 요청의 HTTP 메서드, 버킷/키, 만료 시간, 허용된 헤더 등이 서명에 포함된다. URL을 변조하면 서명 검증에서 실패한다. SDK의 `generate_presigned_url`이 이 복잡한 과정을 추상화해준다.

## 정적 웹사이트 호스팅 — HTTP만 지원하는 근본 이유

S3 정적 웹사이트는 비용 효율적이지만 중요한 제약이 있다: **HTTP만 지원한다**. S3 자체에 TLS 인증서를 설치할 수 없다. HTTPS를 제공하려면 CloudFront + ACM(AWS Certificate Manager) 조합이 필수다.

왜 HTTP만인가? S3는 웹 서버가 아니라 오브젝트 스토리지다. TLS handshake, 인증서 관리, SNI(Server Name Indication) 같은 HTTPS의 복잡한 요소들은 CloudFront나 ALB 같은 Layer 7 서비스의 역할이다. AWS는 이를 서비스별 역할 분리 원칙으로 유지한다.

정적 웹사이트 URL 형식(두 가지 모두 시험에 나옴):
```
http://bucket-name.s3-website-region.amazonaws.com
http://bucket-name.s3-website.region.amazonaws.com
```

정적 웹사이트 + HTTPS 아키텍처:
```
[사용자 브라우저]
      ↕ HTTPS (ACM 인증서)
[CloudFront 배포]
      ↕ HTTP (S3 웹사이트 엔드포인트)
      또는
      ↕ S3 오리진 + OAC (권장)
[S3 버킷]
```

CloudFront + OAC 방식(권장)에서는 버킷을 퍼블릭으로 열지 않아도 된다. CloudFront만 버킷에 접근하고 사용자에게 HTTPS로 서빙한다.

> ⚠️ **함정**: S3 정적 웹사이트 호스팅과 일반 S3 버킷의 퍼블릭 URL은 다르다. 웹사이트 호스팅을 활성화한 버킷의 웹사이트 엔드포인트(`s3-website`)는 HTML 파일을 브라우저로 렌더링한다. 일반 S3 URL(`s3.amazonaws.com`)은 파일을 다운로드(Content-Disposition: attachment)로 처리할 수 있다. 정적 웹사이트 기능을 켜야 index.html을 기본 문서로 서빙하고 에러 페이지를 설정할 수 있다.

## Week 5 전체 복습 — DVA-C02 핵심 정리

### S3 기본 스펙 (반드시 암기)
```
최대 객체 크기:     5TB
단일 PUT 최대:      5GB (초과 시 멀티파트 필수)
멀티파트 최소:      100MB 권장, 5GB 이상 필수
파트 최소 크기:     5MB (마지막 파트 제외)
파트 최대 개수:     10,000개
접두사당 처리량:    PUT 3,500/s, GET 5,500/s
내구성:             11 nines (모든 클래스 동일)
Standard 가용성:    99.99%
One Zone-IA 가용성: 99.5%
```

### 스토리지 클래스 핵심 비교

| 클래스 | 최소 보관 | 즉시 검색 | AZ | 핵심 사용 사례 |
|--------|----------|----------|-----|-------------|
| Standard | 없음 | ✅ | 3+ | 자주 접근 |
| Intelligent-Tiering | 없음 | ✅* | 3+ | 불규칙 접근 |
| Standard-IA | 30일 | ✅ | 3+ | 월 1회 미만 |
| One Zone-IA | 30일 | ✅ | 1 | 재생성 가능 |
| Glacier Instant | 90일 | ✅ | 3+ | 분기 1회 |
| Glacier Flexible | 90일 | ❌(1분~12시간) | 3+ | 연 1~2회 |
| Glacier Deep Archive | 180일 | ❌(12~48시간) | 3+ | 장기 규제 |

*Intelligent-Tiering에서 Archive Access 티어 활성화 시 복구 지연 발생.

### 버전 관리 핵심 포인트

```
상태: Unversioned → Enabled → Suspended (비활성화 불가)
삭제 = 삭제 마커 추가 (진짜 삭제 아님)
진짜 삭제 = DELETE + 버전 ID 명시
MFA Delete: 루트 계정만 설정/해제 가능
비용 함정: 이전 버전도 전부 저장 비용 발생
해결: NoncurrentVersionExpiration 수명 주기 규칙
```

### 암호화 방식 요약

```
SSE-S3:    AWS 완전 관리, 기본값, 무료, 감사 로그 없음
SSE-KMS:   KMS 키 정책, CloudTrail 감사, KMS API 한도 주의
           → S3 Bucket Key로 최대 99% KMS 비용 절감
DSSE-KMS:  이중 암호화, FIPS 140-3 Level 3, 정부/국방
SSE-C:     고객이 키 제공, HTTPS 필수, AWS에 키 미저장
CSE:       클라이언트가 직접 암호화, 최고 보안
```

### 복제 핵심

```
CRR: 다른 리전 → 재해 복구, 지연 시간 최적화
SRR: 같은 리전 → 개발/스테이징 분리, 로그 집계
요건: 양쪽 모두 버전 관리 활성화 필수
기존 객체: Batch Replication 별도 사용
삭제 마커: 기본 미복제 (선택 활성화)
RTC: 99.99%를 15분 내 복제 보장 (유료 SLA)
```

### 보안 계층 우선순위

```
① 계정/버킷 수준 Block Public Access (최우선)
② 명시적 Deny (버킷 정책, SCP)
③ 리소스 기반 Allow (버킷 정책) + IAM Allow
④ ACL (Bucket Owner Enforced 설정 시 무시)
```

### 이벤트 알림 vs EventBridge

```
직접 연결 (Lambda/SQS/SNS): 단순, 빠름, 대상 3종
EventBridge 경유: 유연, 18개+ 대상, 아카이빙, 재생, 세밀한 필터
현재 권장: EventBridge 경유
```

## Week 5 시험 함정 20가지

1. **버킷 이름 글로벌 유일** — 같은 리전 내가 아니라 전 세계 유일
2. **점 포함 버킷 이름** — 기술적 유효하지만 HTTPS 인증서 와일드카드 깨짐
3. **S3는 2020년부터 Strong Consistency** — "eventual"이라고 하면 틀림
4. **One Zone-IA는 AZ 장애 시 데이터 손실 가능** — 재생성 가능 데이터만
5. **최소 보관 기간은 조기 삭제해도 과금** — IA 30일, Glacier 90일, Deep Archive 180일
6. **Glacier Deep Archive 최소 객체 크기 40KB** — IA는 128KB
7. **버전 관리 비활성화 불가** — Suspended로만 가능
8. **삭제 = 삭제 마커** — 영구 삭제는 버전 ID 명시 필요
9. **MFA Delete = 루트 계정만** — 관리자 IAM 사용자도 불가
10. **복제 = 양쪽 버전 관리 필수** — 기존 객체는 Batch Replication
11. **2023+ 모든 신규 객체 SSE-S3 기본 암호화** — "암호화 여부?" → "항상 예"
12. **SSE-KMS KMS API 한도** → Bucket Key로 99% 절감
13. **신규 버킷 Block Public Access 4개 기본 ON + Bucket Owner Enforced**
14. **OAI 레거시, OAC 현재 권장** — SSE-KMS 객체 CloudFront 서빙 = OAC 필수
15. **단일 PUT 최대 5GB** — 초과 시 멀티파트 필수
16. **멀티파트 미완료 파트 저장 비용** → AbortIncompleteMultipartUpload 수명 주기 규칙
17. **정적 웹사이트 HTTP만** → HTTPS는 CloudFront + ACM 필수
18. **Presigned URL IAM 역할 기반은 최대 12시간** — STS 토큰 TTL 제한
19. **EventBridge가 이벤트 알림에서 가장 유연** — 18개+ 대상, 아카이빙, 재생
20. **S3 Select는 단일 파일, 간단한 SQL만** — 복잡한 쿼리는 Athena

## Week 5 약어 정리

| 약어 | 풀네임 | 핵심 포인트 |
|------|--------|-----------|
| S3 | Simple Storage Service | 객체 스토리지 |
| IA | Infrequent Access | 30일 최소 |
| CRR/SRR | Cross/Same Region Replication | 양쪽 버전 관리 필수 |
| RTC | Replication Time Control | 15분 SLA |
| MRAP | Multi-Region Access Point | 글로벌 단일 엔드포인트 |
| OAC/OAI | Origin Access Control/Identity | OAC가 현재 권장 |
| BPA | Block Public Access | 최우선 보안 레이어 |
| SSE | Server-Side Encryption | 서버 측 암호화 |
| CSE | Client-Side Encryption | 클라이언트 측 암호화 |
| DSSE | Dual-layer SSE | 이중 암호화 |
| WORM | Write Once Read Many | Object Lock |
| MPU | Multipart Upload | 100MB+ 권장 |
| ETag | Entity Tag | 객체 무결성 해시 |
| CORS | Cross-Origin Resource Sharing | 브라우저 직접 S3 접근 시 필요 |
| ACM | AWS Certificate Manager | HTTPS 인증서 관리 |

## 📝 Week 5 종합 연습 문제

**문제 1.** 회사의 의료 영상 데이터를 규정상 10년 보존해야 한다. 처음 1년은 자주 접근하고, 이후 접근이 거의 없다가 감사 시 즉시 조회가 필요하다. 가장 비용 효율적인 수명 주기 설계는?

A) Standard로 10년 저장
B) Standard → 1년 후 Glacier Deep Archive
C) Standard → 30일 후 Standard-IA → 1년 후 Glacier Instant Retrieval → 10년 후 삭제
D) Intelligent-Tiering으로 10년 저장

**정답: C**
해설: 첫 달은 Standard, 30일 후 Standard-IA로 저장 비용 절감, 1년 후 Glacier Instant Retrieval로 더 큰 비용 절감 — Glacier Instant는 밀리초 내 즉시 검색이 가능해 "즉시 조회" 요건을 충족한다. Glacier Flexible Retrieval이나 Deep Archive는 복구에 시간이 필요해 즉시 조회 요건에 맞지 않는다. A는 비용 최적화 없음. B의 Glacier Deep Archive는 12~48시간 복구. D의 Intelligent-Tiering은 자동이지만 Archive 티어 활성화 시 즉시 검색이 안 될 수 있고, 10년 동안 모니터링 비용이 누적된다.

---

**문제 2.** 모바일 앱 사용자가 프로필 사진을 업로드해야 한다. 서버가 대용량 파일 데이터를 처리하는 부하를 피하고 싶다. 가장 적합한 아키텍처는?

A) 클라이언트 → 서버 → S3 순차 업로드
B) 서버에서 PUT Presigned URL 생성 → 클라이언트가 해당 URL로 S3에 직접 업로드
C) S3 Transfer Acceleration으로 클라이언트가 직접 업로드
D) CloudFront를 업로드 경로로 사용

**정답: B**
해설: PUT Presigned URL 패턴은 서버가 URL을 생성하고 클라이언트가 그 URL로 S3에 직접 업로드한다. 서버는 파일 바이트를 처리하지 않아 대역폭 부하가 없다. URL에는 버킷, 키, 만료 시간, 허용된 ContentType 등이 서명으로 포함되어 무단 업로드를 방지한다. 업로드 완료 후 S3 이벤트 알림으로 Lambda를 트리거해 이미지 리사이징 등의 후처리를 할 수 있다. 이 패턴은 소셜 미디어, 파일 공유 서비스 등의 표준 업로드 아키텍처다.

---

**문제 3.** AWS Organizations에서 모든 S3 버킷에서 Block Public Access를 강제로 유지하고 싶다. 어떤 서비스를 사용하는가?

A) 버킷별로 수동으로 Block Public Access 설정
B) SCP(Service Control Policy)로 Block Public Access 비활성화 작업 거부
C) Lambda + EventBridge로 Block Public Access 비활성화 감지 시 자동 재활성화
D) AWS Config Rule로 비준수 버킷 탐지

**정답: B**
해설: SCP를 사용하면 Organization 내 모든 계정에서 Block Public Access를 끄는 API 호출 자체를 거부할 수 있다. 예를 들어 `s3:PutBucketPublicAccessBlock` 액션에 Deny 조건을 걸면 누구도 Block Public Access를 변경할 수 없다. C의 Lambda + EventBridge 패턴은 사후 감지와 수정으로, 변경과 수정 사이의 시간 간격이 있어 보안 공백이 생긴다. D의 AWS Config는 탐지만 하고 자동 수정에는 추가 Lambda가 필요하다. B가 예방적(Preventive) 제어로 가장 강력하다.

---

**문제 4.** S3 이벤트 알림을 통해 객체 업로드 시 Lambda를 호출하는 아키텍처에서, 같은 파일이 짧은 시간 내에 두 번 Lambda를 트리거했다. 이 현상의 원인과 해결책은?

A) Lambda 구성 오류 — 동시성 한도 증가
B) S3 이벤트 알림은 at-least-once 전달이므로 정상 동작 — Lambda 내 멱등 처리 구현
C) S3 버킷 정책 오류 — 정책 수정
D) 이벤트 필터 누락 — ObjectCreated:Put 이벤트만 필터링

**정답: B**
해설: S3 이벤트 알림은 at-least-once 전달을 보장하며, 드물게 중복 전달이 발생할 수 있다. 이것은 설계된 동작이며 버그가 아니다. 해결책은 Lambda 함수 내에서 멱등 처리를 구현하는 것이다 — 처리할 파일의 S3 ETag나 버전 ID를 DynamoDB에 기록하고, 이미 처리된 이벤트는 조용히 건너뛰는 방식이다. 이벤트 필터링은 이벤트 타입을 제한하지만 중복 전달 문제를 해결하지 못한다.

---

**문제 5.** 글로벌 서비스를 제공하는 회사가 S3에서 정적 웹 애플리케이션을 호스팅한다. HTTPS 필수, 글로벌 최적화, SEO를 위한 커스텀 도메인이 요구사항이다. 어떤 아키텍처가 맞는가?

A) S3 정적 웹사이트 + Route 53만으로 충분
B) S3 버킷 (웹사이트 호스팅 활성화, 퍼블릭) + CloudFront + ACM + Route 53
C) S3 버킷 (OAC) + CloudFront + ACM + Route 53
D) EC2 웹 서버 + S3 정적 파일 저장

**정답: C**
해설: 모든 요구사항을 충족하는 아키텍처는 C다. OAC를 사용하면 S3 버킷을 퍼블릭으로 열 필요 없이 CloudFront만 접근을 허용한다(B의 퍼블릭 버킷보다 보안상 우수). CloudFront는 HTTPS(ACM 인증서), 글로벌 캐싱, Route 53 커스텀 도메인 연결을 모두 지원한다. S3 정적 웹사이트 자체(A)는 HTTP만 지원하고 CloudFront 없이는 HTTPS가 불가능하다. EC2 웹 서버(D)는 불필요한 복잡도를 더한다.

---

**문제 6.** S3 버킷에서 수명 주기 정책이 "30일 후 Standard-IA로, 90일 후 Glacier Flexible로 전환"으로 설정되어 있다. 50일째 되는 날 객체를 삭제했다. 청구되는 요금은?

A) 50일치 Standard + 20일치 Standard-IA
B) 50일치 Standard + 30일치 Standard-IA (IA 최소 보관 30일)
C) 50일치 Standard만 청구
D) 90일치 Standard-IA (Glacier 전환 조건 충족 시까지)

**정답: B**
해설: Standard는 최소 보관 기간이 없으므로 30일치만 청구된다. Standard-IA로 전환된 것은 30일째이고, 50일째에 삭제됐으므로 IA로 저장된 기간은 20일이다. 그러나 Standard-IA의 최소 보관 기간은 30일이므로, 실제로는 20일을 저장했지만 30일치 IA 비용이 청구된다. 즉 Standard 30일 + Standard-IA 30일(최소) = B가 정답이다. 조기 삭제 과금은 IA, Glacier, Deep Archive 모두에 적용된다.

---

**문제 7.** 개발팀이 S3에 저장된 Lambda 배포 패키지를 다른 AWS 계정의 Lambda가 접근해야 한다. S3 버킷을 퍼블릭으로 열지 않고 가장 안전하게 접근 권한을 부여하는 방법은?

A) Presigned URL로 배포 패키지를 공유
B) 버킷 정책에서 다른 계정 ARN을 Principal로 지정해 Allow
C) S3를 퍼블릭으로 열고 IP 화이트리스트 적용
D) CRR로 다른 계정 리전에 복제

**정답: B**
해설: 버킷 정책에서 다른 계정의 Lambda 실행 역할 ARN을 Principal로 지정하면 퍼블릭으로 열지 않고 교차 계정 접근이 가능하다. 리소스 기반 정책(버킷 정책)은 IAM 사용자가 없는 다른 계정에도 권한을 부여할 수 있는 S3의 강점이다. Presigned URL은 임시이고 만료된다. 퍼블릭 + IP 화이트리스트는 IP 스푸핑 위험이 있다. CRR은 데이터 복제이지 접근 제어가 아니다.

---

**문제 8.** 2024년 기준 모든 S3 신규 버킷의 기본 설정으로 올바른 것은?

A) 퍼블릭 접근 허용, 암호화 비활성화, ACL 활성화
B) Block Public Access 모두 비활성화, SSE-S3 기본 암호화, ACL 활성화
C) Block Public Access 4개 모두 활성화, SSE-S3 기본 암호화, Bucket Owner Enforced(ACL 비활성화)
D) Block Public Access 1개만 활성화, 암호화 선택 사항, Object Writer 소유권

**정답: C**
해설: 2023년 이후 모든 신규 S3 버킷의 기본값은 ① Block Public Access 4개 옵션 모두 활성화, ② SSE-S3(AES-256) 기본 암호화, ③ Object Ownership = Bucket Owner Enforced(ACL 비활성화)다. 이 세 가지 기본값은 "안전한 기본 설정(Secure by Default)" 원칙의 구현이다. 정적 웹사이트 호스팅을 위해 퍼블릭 접근이 필요하면 명시적으로 Block Public Access를 끄고 버킷 정책을 작성해야 한다.

---

**문제 9.** S3 버킷에 수십억 개의 객체가 있고, 전체 객체 중 SSE-KMS 암호화가 적용되지 않은 객체를 찾아서 일괄 암호화 적용해야 한다. 어떤 방법이 적합한가?

A) AWS Lambda로 모든 객체를 순회하며 암호화 상태 확인
B) S3 Inventory로 암호화 상태 보고서 생성 → Athena로 미암호화 객체 필터링 → S3 Batch Operations로 SSE-KMS 복사 적용
C) S3 Storage Class Analysis 보고서로 암호화 상태 확인
D) CloudTrail로 PUT 이벤트를 역추적해 암호화 여부 확인

**정답: B**
해설: 수십억 객체에 대한 대규모 작업은 S3 Inventory + Athena + S3 Batch Operations의 조합이 정답이다. S3 Inventory는 정기적으로 버킷의 모든 객체 목록과 메타데이터(암호화 상태 포함)를 CSV/Parquet으로 생성한다. Athena로 "ServerSideEncryption이 aws:kms가 아닌" 객체를 필터링해 목록을 만든 후, 이 목록을 S3 Batch Operations의 manifest로 사용해 SSE-KMS 적용 복사 작업을 실행한다. Lambda로 수십억 객체를 직접 순회하면 시간과 비용이 엄청나다. Storage Class Analysis는 암호화 상태를 제공하지 않는다.

---

**문제 10.** 다음 시나리오에서 올바른 해결책을 선택하라. "회사는 파트너사가 특정 S3 버킷에 파일을 업로드해야 한다. 파트너는 AWS 계정이 없다."

A) IAM 사용자를 생성하고 Access Key를 파트너에게 전달
B) S3 버킷을 퍼블릭으로 설정
C) 파트너용 PUT Presigned URL을 주기적으로 생성하여 전달
D) VPC Peering으로 파트너 네트워크 연결

**정답: C**
해설: AWS 계정이 없는 외부 파트너에게 S3 접근을 부여할 때 PUT Presigned URL이 가장 안전하고 간단하다. 만료 시간을 설정해 유효 기간을 제한하고, 특정 키(파일명)와 ContentType까지 제한할 수 있다. IAM 사용자 생성(A)은 파트너에게 장기 자격증명을 제공하는 것으로 자격증명 관리 부담이 생긴다. 퍼블릭 버킷(B)은 보안상 매우 나쁘다. VPC Peering(D)은 파트너가 AWS 계정과 VPC를 가져야 한다.

---

**문제 11.** S3 버킷 A(us-east-1)에서 버킷 B(ap-northeast-2)로 CRR을 설정했다. 버킷 A에서 객체를 삭제 마커 없이 직접 영구 삭제(버전 ID 명시)했다. 버킷 B에서는?

A) 해당 객체가 자동으로 삭제된다
B) 해당 객체는 버킷 B에 그대로 유지된다
C) 삭제 마커가 복제된다
D) 복제가 실패하고 알림이 발생한다

**정답: B**
해설: S3 복제는 기본적으로 삭제 작업을 복제하지 않는다 — 데이터 보호 목적이다. 버킷 A에서 특정 버전을 영구 삭제해도 버킷 B에는 그 버전이 그대로 남아 있다. 삭제 마커도 기본적으로 복제되지 않는다(선택적으로 활성화 가능). 이 설계는 실수나 악의적 삭제가 복제를 통해 전파되는 것을 방지한다. 양방향 복제에서 삭제 마커 복제를 활성화하면 교차 삭제 위험이 생긴다 — 신중하게 설정해야 한다.

---

**문제 12.** 다음 중 S3 Access Point에 대한 올바른 설명으로 모두 맞는 것은?

A) Access Point는 별도 버킷을 생성한다
B) VPC 전용 Access Point로 인터넷에서의 접근을 차단할 수 있다
C) Access Point는 버킷당 최대 1개만 생성 가능하다
D) 각 Access Point는 자체 독립적인 정책과 DNS 이름을 가진다

**정답: B와 D**
해설: Access Point는 새 버킷을 만들지 않고 기존 버킷 위에 가상 입구를 만든다(A 틀림). 버킷당 최대 10,000개의 Access Point를 생성할 수 있다(C 틀림). VPC 전용 Access Point를 설정하면 해당 Access Point로의 접근이 지정한 VPC 내에서만 허용되며 인터넷 접근이 차단된다(B 맞음). 각 Access Point는 고유한 DNS 이름(`<name>-<account-id>.s3-accesspoint.<region>.amazonaws.com`)과 독립적인 버킷 정책을 가진다(D 맞음).

---
