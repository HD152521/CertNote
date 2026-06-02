# Day 25 - S3: 이벤트 알림, 프리사인 URL, 정적 웹사이트

📅 날짜: 2026년 6월 18일 (목요일)  
🎯 주제: S3 고급 기능 및 Week 5 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 이벤트 알림으로 자동화 워크플로우를 구성한다
- 프리사인 URL로 임시 접근을 부여한다
- S3를 정적 웹사이트 호스팅에 활용한다

---

## 📖 이론 내용

### 1. S3 이벤트 알림

S3에서 특정 이벤트 발생 시 자동으로 알림 전송합니다.

**이벤트 유형:**
- `s3:ObjectCreated:*` (PUT, POST, COPY, 멀티파트 완료)
- `s3:ObjectRemoved:*` (Delete, DeleteMarkerCreated)
- `s3:ObjectRestore:*` (Glacier 복원)

**대상:**
- Lambda 함수
- SQS 큐
- SNS 주제
- **⭐ EventBridge**: 모든 이벤트 → 더 많은 필터링 옵션, 더 많은 대상

**EventBridge 권장 이유**: 이벤트 아카이빙, 재실행, 세밀한 필터링, 18개+ 대상 지원

### 2. 프리사인 URL (Pre-signed URL)

IAM 자격 증명으로 임시 접근 URL 생성:

```python
import boto3
s3 = boto3.client('s3')

# 다운로드 URL (GET)
url = s3.generate_presigned_url(
    'get_object',
    Params={'Bucket': 'my-bucket', 'Key': 'file.pdf'},
    ExpiresIn=3600  # 1시간
)

# 업로드 URL (PUT)
upload_url = s3.generate_presigned_url(
    'put_object',
    Params={'Bucket': 'my-bucket', 'Key': 'upload.jpg'},
    ExpiresIn=300   # 5분
)
```

**특징:**
- 생성한 사용자의 권한이 URL에 적용
- 만료 시간: 기본 1시간, 최대 7일
- **⭐ PUT 프리사인 URL**: 클라이언트가 서버 통하지 않고 직접 S3 업로드
- 생성자 권한이 없으면 URL도 작동 안 함

### 3. S3 정적 웹사이트 호스팅

S3를 웹 서버로 사용하여 HTML, CSS, JS 파일 호스팅:

**설정 방법:**
```bash
# 정적 웹사이트 호스팅 활성화
aws s3api put-bucket-website \
  --bucket my-website-bucket \
  --website-configuration '{
    "IndexDocument": {"Suffix": "index.html"},
    "ErrorDocument": {"Key": "error.html"}
  }'

# 퍼블릭 읽기 허용 버킷 정책
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-website-bucket/*"
  }]
}
```

**URL 형식:**
```
http://bucket.s3-website-ap-northeast-2.amazonaws.com
```

**⭐ HTTPS**: S3 정적 웹사이트는 HTTP만 지원 → **CloudFront + ACM 필요**

---

## 아키텍처 다이어그램

```
S3 이벤트 알림 아키텍처
================================

사용자 파일 업로드
        |
        v
[S3 버킷]
        |
        | ObjectCreated 이벤트
        v
[Amazon EventBridge]
        |
        +---> Lambda (이미지 리사이즈)
        |
        +---> SQS (비동기 처리)
        |
        +---> SNS (알림)
        |
        +---> Step Functions (워크플로우)

프리사인 URL 흐름
================================

[클라이언트]
    1. "업로드 URL 주세요"
        |
        v
[API Gateway + Lambda]
    2. presigned URL 생성
        |
        v
[클라이언트]
    3. presigned URL 수신
        |
        | 4. 직접 S3에 업로드! (서버 통하지 않음)
        v
[S3 버킷]

HTTPS 웹사이트 구성
================================

[CloudFront 배포]
  - ACM 인증서 (HTTPS)
  - 오리진: S3 버킷
  - OAC로 S3 직접 접근 차단
        |
        v
[S3 정적 웹사이트]
  index.html, style.css, app.js
```

---

## ⭐ 핵심 포인트

1. ⭐ **프리사인 URL 최대 7일**: IAM 역할 기반은 만료 시간 최대 1시간
2. ⭐ **PUT 프리사인 URL**: 클라이언트 직접 S3 업로드, 서버 부하 없음
3. ⭐ **정적 웹사이트 HTTPS**: CloudFront + ACM 필요
4. ⭐ **EventBridge**: S3 이벤트를 가장 유연하게 라우팅
5. ⭐ **생성자 권한**: 프리사인 URL은 생성자가 권한 없으면 작동 안 함

---

## 🧠 Week 5 시험 함정 & 약어

### 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| Standard-IA | One Zone-IA | 3AZ vs 1AZ |
| Glacier Instant | Glacier Flexible | 즉시 vs 분~시간 |
| Glacier Flexible | Deep Archive | 90일·시간 vs 180일·시간/일 |
| Intelligent-Tiering | S-IA | 자동 vs 수동 분류 |
| SSE-S3 | SSE-KMS | 무료·자동 vs 감사·세밀 |
| SSE-KMS | SSE-C | AWS 키 vs 고객 키 |
| Bucket Key | KMS Key | 비용 ↓ vs 일반 |
| CRR | SRR | 다른 리전 vs 같은 리전 |
| OAI | OAC | 레거시 vs 현재 권장 |
| Gateway Endpoint | Interface Endpoint | 무료·S3/DDB vs 비용·전체 |
| ACL | 버킷 정책 | 레거시 vs 권장 |
| Object Lock Governance | Compliance | IAM 권한이면 가능 vs 절대 불가 |
| Presigned URL | Bucket Policy 공개 | 임시·개별 vs 영구·전체 |
| EventBridge mode | S3 Event Notification | 풍부 vs 단순 |
| S3 Select | Athena | 단일 객체 SQL vs 다중·복잡 |
| Versioning Suspended | Disabled | 일시 중지 vs 비활성화 (불가) |

### Week 5 시험 함정 15가지

1. **버킷 이름은 글로벌 유일**, 점(`.`) 포함 시 HTTPS 인증서 문제
2. **2020+ 강력한 일관성** (eventual consistency 아님)
3. **One Zone-IA는 AZ 장애 시 데이터 손실**
4. **IA·Glacier 최소 보관 기간** (30/90/180일) — 조기 삭제도 과금
5. **Glacier Deep Archive 최소 객체 40KB**, IA는 128KB
6. **버전 관리 비활성화 불가** — Suspended만
7. **삭제 = 삭제 마커**, 영구 삭제는 버전 ID 명시
8. **MFA Delete = 루트 계정만**
9. **복제는 양쪽 버전 관리 필수**, 기존 객체는 Batch Replication
10. **2023+ 모든 새 객체 자동 SSE-S3 암호화**
11. **SSE-KMS는 KMS API 한도** → Bucket Key로 99% 절감
12. **신규 버킷 BPA 4개 모두 ON** + Bucket Owner Enforced (ACL 비활성)
13. **OAI는 레거시, OAC가 현재 권장**
14. **단일 PUT 5GB**, 그 이상은 멀티파트 필수
15. **정적 웹사이트는 HTTP만** → HTTPS는 CloudFront + ACM

### Week 5 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **S3** | Simple Storage Service |
| **IA** | Infrequent Access |
| **CRR / SRR** | Cross/Same Region Replication |
| **RTC** | Replication Time Control |
| **MRAP** | Multi-Region Access Point |
| **OAC / OAI** | Origin Access Control / Identity |
| **BPA** | Block Public Access |
| **SSE** | Server-Side Encryption |
| **CSE** | Client-Side Encryption |
| **DSSE** | Dual-layer SSE |
| **CMK** | Customer Master Key (KMS) |
| **ACL** | Access Control List |
| **WORM** | Write Once Read Many (Object Lock) |
| **TTFB** | Time To First Byte |
| **MPU** | Multipart Upload |
| **ETag** | Entity Tag (객체 해시) |

---

## 📝 Week 5 종합 연습문제

**문제 1.** 비공개 S3 객체를 외부에 임시로 공유하는 방법은?

A) 버킷 퍼블릭으로 설정  
B) 파트너 IAM 사용자 생성  
C) 프리사인 URL 생성  
D) ACL 설정  

**정답: C** - 프리사인 URL은 만료 시간이 있는 임시 URL로 안전하게 공유 가능합니다.

---

**문제 2.** S3 정적 웹사이트에서 HTTPS를 제공하려면?

A) S3 자체 SSL 설정  
B) CloudFront + ACM 인증서  
C) Route 53 SSL  
D) ALB + ACM  

**정답: B** - S3 정적 웹사이트는 HTTP만 지원합니다. HTTPS는 CloudFront + ACM이 필요합니다.

---

**문제 3.** S3 이벤트 알림을 가장 유연하게 라우팅하려면?

A) Lambda 직접 연결  
B) SQS 큐  
C) Amazon EventBridge  
D) SNS 주제  

**정답: C** - EventBridge는 세밀한 필터링과 18개+ 대상 지원으로 가장 유연합니다.

---

**문제 4.** 클라이언트가 서버 없이 직접 S3에 업로드하는 방법은?

A) S3 Transfer Acceleration  
B) 멀티파트 업로드  
C) PUT 프리사인 URL  
D) S3 게이트웨이 엔드포인트  

**정답: C** - PUT 프리사인 URL을 생성하면 클라이언트가 서버 통하지 않고 직접 S3에 업로드할 수 있습니다.

---

**문제 5.** S3 이벤트 알림이 지원하는 대상이 아닌 것은?

A) Lambda 함수  
B) SQS 큐  
C) RDS 데이터베이스  
D) SNS 주제  

**정답: C** - S3 이벤트 알림은 Lambda, SQS, SNS, EventBridge를 지원합니다. RDS는 직접 대상이 되지 않습니다.

---

## 📌 오늘의 요약

1. S3 이벤트 알림: Lambda, SQS, SNS, EventBridge, EventBridge가 가장 유연
2. 프리사인 URL: 생성자 권한 기반, 만료 시간 최대 7일, PUT으로 직접 업로드 가능
3. 정적 웹사이트: 버킷 공개 필요, HTTP만 지원, HTTPS는 CloudFront + ACM
4. Week 5 핵심: 스토리지 클래스, 버전 관리, 수명 주기, 암호화, 성능 최적화
5. S3는 DVA-C02 시험에서 매우 중요한 서비스이므로 모든 개념을 완벽히 숙지
