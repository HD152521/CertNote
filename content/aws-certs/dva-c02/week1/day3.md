# Day 3 - IAM 심화: STS, 정책 조건, 리소스 기반 정책

📅 날짜: 2026년 5월 19일 (화요일)  
🎯 주제: IAM 고급 기능  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS STS(Security Token Service)의 역할과 동작 방식을 이해한다
- IAM 정책 조건(Condition)을 활용할 수 있다
- 자격 증명 기반 정책과 리소스 기반 정책의 차이를 구분한다
- AWS Organizations와 서비스 제어 정책(SCP)을 이해한다

---

## 📖 이론 내용

### 1. AWS STS (Security Token Service)

STS는 IAM 역할을 수임(Assume)할 때 임시 보안 자격 증명을 발급하는 서비스입니다.

**임시 자격 증명 구성:**
- **액세스 키 ID**: 임시 접근 식별자
- **시크릿 액세스 키**: 임시 비밀 키
- **세션 토큰**: 임시 자격 증명임을 나타내는 토큰
- **만료 시간**: 최소 15분 ~ 최대 12시간 (기본 1시간)

**STS 주요 API:**
- `AssumeRole`: 다른 계정 또는 같은 계정의 역할 수임
- `AssumeRoleWithWebIdentity`: 웹 자격 증명으로 역할 수임 (Google, Facebook 등)
- `AssumeRoleWithSAML`: SAML을 통한 역할 수임 (기업 SSO)
- `GetSessionToken`: MFA 인증 후 임시 자격 증명 발급

### 2. 역할 수임 (Assume Role) 플로우

```
계정 A의 사용자 --> STS AssumeRole --> 계정 B의 역할
                                           |
                                           v
                              임시 자격 증명 반환
                              (AccessKey + SecretKey + Token)
                                           |
                                           v
                              계정 B의 리소스 접근
```

### 3. IAM 정책 조건 (Condition)

조건을 사용하면 특정 상황에서만 권한을 적용할 수 있습니다.

**주요 조건 키:**

```json
{
  "Condition": {
    "StringEquals": {
      "aws:RequestedRegion": "ap-northeast-2"
    },
    "Bool": {
      "aws:MultiFactorAuthPresent": "true"
    },
    "IpAddress": {
      "aws:SourceIp": ["203.0.113.0/24", "198.51.100.0/24"]
    },
    "DateGreaterThan": {
      "aws:CurrentTime": "2026-01-01T00:00:00Z"
    },
    "StringLike": {
      "s3:prefix": "home/${aws:username}/*"
    }
  }
}
```

**조건 연산자 유형:**
| 유형 | 연산자 | 설명 |
|------|--------|------|
| 문자열 | StringEquals, StringLike | 문자열 비교 |
| 숫자 | NumericEquals, NumericGreaterThan | 숫자 비교 |
| 날짜 | DateEquals, DateGreaterThan | 날짜/시간 비교 |
| 불리언 | Bool | True/False 비교 |
| IP | IpAddress, NotIpAddress | IP 주소 비교 |
| ARN | ArnEquals, ArnLike | ARN 비교 |

### 4. 자격 증명 기반 정책 vs 리소스 기반 정책

#### 자격 증명 기반 정책 (Identity-based Policy)
- IAM 사용자, 그룹, 역할에 연결
- "내가 어떤 리소스에 무엇을 할 수 있는가?"

#### 리소스 기반 정책 (Resource-based Policy)
- AWS 리소스에 직접 연결 (S3 버킷 정책, SQS 큐 정책 등)
- "누가 이 리소스에 무엇을 할 수 있는가?"
- **⭐ 교차 계정 접근에 필수**

**S3 버킷 정책 예시:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:root"
      },
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::my-bucket",
        "arn:aws:s3:::my-bucket/*"
      ]
    }
  ]
}
```

### 5. 권한 경계 (Permissions Boundary)

- IAM 엔티티가 가질 수 있는 최대 권한을 설정
- 권한 경계가 없는 권한은 사용 불가
- 실제 유효 권한 = 자격 증명 기반 정책 AND 권한 경계

### 6. AWS Organizations & SCP

**AWS Organizations**: 여러 AWS 계정을 중앙에서 관리
**서비스 제어 정책(SCP)**: 조직 수준에서 최대 권한 정의
- SCP는 루트 계정 포함 모든 계정에 적용
- SCP는 권한을 부여하지 않고 최대 권한만 제한
- **⭐ SCP + 자격 증명 정책 = 실제 유효 권한**

---

## 🧠 알아두면 좋은 심화 이론

### STS 임시 자격 증명 - 세션 시간 정확히 (시험 함정)

| API | 기본 | 최대 | 비고 |
|-----|------|------|------|
| `AssumeRole` | 1시간 | **12시간** | 역할의 `MaxSessionDuration` 설정값까지 |
| `AssumeRoleWithSAML` | 1시간 | 12시간 | SAML 페더레이션 |
| `AssumeRoleWithWebIdentity` | 1시간 | 12시간 | OIDC(Google/Facebook 등) |
| `GetSessionToken` | 12시간 | **36시간** | IAM 사용자만 (MFA 강제용) |
| `GetFederationToken` | 12시간 | 36시간 | 페더레이션 사용자 |

> ⚠️ **함정**: "AssumeRole 최대 시간"으로 자주 출제. 정답은 **12시간**. 또한 **역할 체인(Role Chaining)**(역할 A → AssumeRole 역할 B) 시 최대 1시간으로 강제 제한됨.

### 신뢰 정책 vs 권한 정책 - 헷갈리는 핵심

| 구분 | Trust Policy | Permission Policy |
|------|--------------|-------------------|
| 역할 | "**누가** 이 역할을 수임할 수 있나?" | "이 역할로 **무엇을** 할 수 있나?" |
| `Principal` 필드 | 있음 (필수) | 없음 |
| 부착 위치 | 역할 자체에만 1개 | 여러 정책 부착 가능 |

```json
// 신뢰 정책 (Trust Policy) - 누가 수임할 수 있는지
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::111111111111:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "Unique-ID-12345" }
    }
  }]
}
```

### ExternalId - "혼동된 대리인 문제(Confused Deputy)" 방지

- 3자 통합(SaaS, MSP)에서 필수
- 다른 고객 계정이 ARN만 알아도 무단 AssumeRole 못 하게 막음
- SaaS 측이 ExternalId를 알아야만 호출 가능 → 시험 빈출 시나리오

> ⚠️ **함정**: 3rd-party가 내 계정에 접근할 역할 만들 때 무조건 ExternalId 추가가 정답.

### 페더레이션 유형 (3가지 - 시험에 자주 비교됨)

| 유형 | API | 사용 사례 |
|------|-----|-----------|
| **SAML 2.0** | `AssumeRoleWithSAML` | 기업 SSO (Active Directory, Okta) |
| **OIDC / Web Identity** | `AssumeRoleWithWebIdentity` | 모바일/웹앱 - Google, Facebook, Cognito |
| **Custom Identity Broker** | `AssumeRole` + 자체 토큰 발급 | 자체 ID 시스템 |

### SCP 동작 정확히 (시험 함정 다수)

```
유효 권한 = SCP ∩ Permissions Boundary ∩ Session Policy ∩ Identity Policy
                (모두 Allow 있어야 함, Deny는 어디든 우선)
```

- ❌ SCP는 **권한을 부여하지 않음** — 절대 보기 함정
- ❌ SCP가 Allow지만 IAM에서 Deny면 거부
- ❌ SCP가 Deny면 root 계정조차 막힘 (마스터 계정 제외)
- ✅ SCP는 기본적으로 `FullAWSAccess` 첨부됨 — 직접 만들면 deny-list 형태

### 리소스 기반 정책 지원 서비스 (모두 외우기)

✅ **지원**: S3 (버킷 정책), SQS, SNS, Lambda, KMS, ECR, Secrets Manager, API Gateway, EFS, EventBridge, IAM 역할(신뢰 정책)
❌ **미지원**: EC2, RDS, DynamoDB(IAM만), CloudWatch, Auto Scaling

> ⚠️ **함정**: DynamoDB는 리소스 기반 정책이 없음. 교차 계정 접근 시 무조건 IAM 역할 + AssumeRole 패턴 필요.

### 실무 사례 - 교차 계정 접근 패턴 3가지

**1) Hub-and-Spoke (중앙 ID 계정)**
```
[ID 계정] (사람 사용자만)
    ↓ AssumeRole
[Dev 계정] [Staging 계정] [Prod 계정]
```

**2) 리소스 공유 (S3 크로스 계정)**
```
Account A: 자격 증명 정책으로 s3:GetObject 허용
Account B: 버킷 정책으로 Principal=Account A 허용
(객체 소유권 주의 — Object Ownership 설정)
```

**3) 서비스 통합 (Lambda → 다른 계정 SQS)**
```
Lambda 실행 역할: sqs:SendMessage 허용
SQS 큐 정책: Principal=Lambda 역할 ARN 허용
```

### 정책 변수 (Policy Variables) - 동적 정책

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::company-bucket/home/${aws:username}/*"
}
```

자주 쓰는 변수: `${aws:username}`, `${aws:userid}`, `${aws:PrincipalTag/<key>}`, `${aws:SourceIp}`, `${aws:CurrentTime}`

> 💡 ABAC 구현의 핵심: 태그 기반 정책 변수 사용.

### 관련 서비스 Cross-Reference

- **STS ↔ Cognito Identity Pool** → [Week 9 Day 3] (앱 → AWS 임시 자격)
- **신뢰 정책 ↔ EC2 인스턴스 프로파일** → [Week 2 Day 1]
- **SCP ↔ AWS Organizations Service Control** → [실무에서 보안팀이 관리]
- **리소스 기반 정책 ↔ KMS 키 정책** → [Week 9 Day 1] (이중 권한 모델 가장 중요)

---

## 아키텍처 다이어그램

```
STS 역할 수임 프로세스
================================

계정 A (111111111111)          계정 B (222222222222)
+--------------------+         +--------------------+
|                    |         |                    |
|  개발자 사용자     |  1.AssumeRole  역할 정의    |
|  (Alice)          |-------->|  (CrossAccountRole) |
|                    |         |  신뢰 정책:         |
|                    |         |  Principal:         |
|                    |         |    Account:111111   |
|                    |  2.임시자격증명             |
|                    |<--------|  AccessKey          |
|                    |         |  SecretKey          |
|                    |         |  SessionToken       |
|  3. 임시 자격증명으로|         |                    |
|  계정 B 리소스 접근  |-------->|  S3 버킷           |
|                    |         |  DynamoDB 테이블    |
+--------------------+         +--------------------+

정책 유형별 적용 방식
================================

                    [자격 증명 기반 정책]
                    사용자/역할에 연결
                           |
                           v
사용자 A ---[Allow S3:*]---+--> S3 버킷
                           |    (리소스 기반 정책으로
[리소스 기반 정책]          |     추가 교차계정 허용)
버킷에 연결                |
Principal: Account B -----+
Allow: s3:GetObject

유효 권한 계산
================================

AWS Organizations SCP
       AND
자격 증명 기반 정책
       AND
권한 경계 (있는 경우)
       AND
리소스 기반 정책
       =
최종 유효 권한
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **STS 임시 자격 증명**: 만료 시간 15분~12시간, 액세스 키+시크릿 키+세션 토큰 구성
2. ⭐ **교차 계정 접근**: 리소스 기반 정책 + 자격 증명 기반 정책 모두 필요
3. ⭐ **명시적 Deny 항상 우선**: 어떤 정책에서도 명시적 Deny가 있으면 최종 거부
4. ⭐ **SCP는 권한을 부여하지 않음**: 최대 권한만 제한, 실제 권한은 IAM 정책이 부여
5. ⭐ **권한 경계**: 위임 관리 시 관리자가 사용자에게 줄 수 있는 최대 권한 설정

---

## 💻 실제 예시 - STS 역할 수임

```bash
# 다른 역할 수임하기
aws sts assume-role \
  --role-arn arn:aws:iam::222222222222:role/CrossAccountRole \
  --role-session-name MySession \
  --duration-seconds 3600

# MFA와 함께 임시 자격 증명 발급
aws sts get-session-token \
  --serial-number arn:aws:iam::111111111111:mfa/alice \
  --token-code 123456 \
  --duration-seconds 7200

# 응답 예시 구조
# {
#   "Credentials": {
#     "AccessKeyId": "ASIAXXX...",
#     "SecretAccessKey": "wJalrXUt...",
#     "SessionToken": "AQoXnyc4...",
#     "Expiration": "2026-05-19T12:00:00Z"
#   }
# }

# 임시 자격 증명으로 호출자 확인
export AWS_ACCESS_KEY_ID=ASIAXXX...
export AWS_SECRET_ACCESS_KEY=wJalrXUt...
export AWS_SESSION_TOKEN=AQoXnyc4...
aws sts get-caller-identity
```

**조건부 정책 예시 - MFA 필수 적용:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyWithoutMFA",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

---

## 📝 연습 문제

**문제 1.** STS(Security Token Service)가 발급하는 임시 자격 증명의 구성 요소가 아닌 것은?

A) 액세스 키 ID  
B) 시크릿 액세스 키  
C) 영구 비밀번호  
D) 세션 토큰  

**정답: C**  
해설: STS가 발급하는 임시 자격 증명은 액세스 키 ID, 시크릿 액세스 키, 세션 토큰, 만료 시간으로 구성됩니다. 영구 비밀번호는 포함되지 않습니다.

---

**문제 2.** 계정 A의 Lambda 함수가 계정 B의 S3 버킷에 접근하려고 합니다. 필요한 설정은?

A) 계정 A에서 자격 증명 기반 정책만 설정  
B) 계정 B의 S3 버킷에 리소스 기반 정책만 설정  
C) 계정 A의 자격 증명 기반 정책 + 계정 B의 S3 버킷 정책 모두 설정  
D) IAM 사용자의 액세스 키를 S3 버킷 설정에 직접 입력  

**정답: C**  
해설: 교차 계정 접근의 경우, 소스 계정(계정 A)에서는 자격 증명 기반 정책으로 접근 허용, 대상 계정(계정 B)에서는 리소스 기반 정책으로 접근 허용이 모두 필요합니다.

---

**문제 3.** 서비스 제어 정책(SCP)에 대한 설명으로 올바른 것은?

A) SCP는 IAM 사용자에게 직접 권한을 부여한다  
B) SCP는 조직 내 계정의 최대 권한을 제한한다  
C) SCP가 허용한 작업은 반드시 허용된다  
D) SCP는 루트 계정에는 적용되지 않는다  

**정답: B**  
해설: SCP는 조직 내 계정들이 사용할 수 있는 최대 권한을 제한합니다. SCP는 권한을 부여하지 않으며, 실제 권한은 IAM 정책이 부여합니다. SCP는 루트 계정을 포함한 모든 계정에 적용됩니다.

---

**문제 4.** IAM 정책에서 특정 IP 주소에서만 S3 접근을 허용하려면 어떤 조건 키를 사용해야 하는가?

A) aws:SourceIp  
B) aws:RequestedRegion  
C) aws:PrincipalAccount  
D) s3:LocationConstraint  

**정답: A**  
해설: `aws:SourceIp` 조건 키를 사용하면 특정 IP 주소 또는 IP 주소 범위에서의 요청만 허용/거부할 수 있습니다.

---

**문제 5.** 권한 경계(Permissions Boundary)의 목적은?

A) 사용자에게 추가 권한을 부여하기 위해  
B) IAM 사용자가 가질 수 있는 최대 권한을 제한하기 위해  
C) 다중 계정 간 권한을 공유하기 위해  
D) 리소스 기반 정책을 대체하기 위해  

**정답: B**  
해설: 권한 경계는 관리자가 IAM 사용자에게 위임할 수 있는 최대 권한의 범위를 설정합니다. 실제 유효 권한은 자격 증명 기반 정책과 권한 경계의 교집합입니다.

---

## 📌 오늘의 요약

1. STS는 AssumeRole을 통해 임시 자격 증명(액세스 키+시크릿 키+세션 토큰)을 발급한다
2. 교차 계정 접근은 소스 계정의 자격 증명 정책 + 대상 리소스의 리소스 기반 정책이 모두 필요하다
3. 정책 조건(Condition)으로 IP, 시간, MFA 여부 등 세밀한 접근 제어가 가능하다
4. SCP는 조직 수준에서 최대 권한을 제한하며, 권한을 부여하지는 않는다
5. 권한 경계는 사용자에게 위임 가능한 최대 권한의 상한선을 설정한다
