# Day 3 - IAM 심화 (STS, 권한 경계, Identity Center)

📅 날짜: Week 1 (Day 3)
🎯 주제: 임시 자격 증명, 권한 경계, SSO를 활용한 운영자급 IAM 설계
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- STS의 AssumeRole 패턴(Cross-Account, SAML, OIDC)을 이해한다
- Permission Boundary와 SCP의 차이를 명확히 구분한다
- AWS IAM Identity Center(구 SSO)로 멀티 계정 권한 관리하는 방식을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **STS (Security Token Service)**: 임시 자격 증명을 발급하는 글로벌 서비스. JWT-like 토큰 + 만료 시각
- **SAML 2.0**: 엔터프라이즈 IdP(Okta, Active Directory)에서 사용하는 인증 프로토콜. XML 기반
- **OIDC (OpenID Connect)**: OAuth 2.0 위에 인증 정보를 얹은 프로토콜. 모바일/웹 친화적
- **Federated Identity**: 외부 IdP로 인증된 사용자가 AWS 리소스 접근. 별도 IAM User 없이도 가능
- **Confused Deputy**: 신뢰받는 서비스가 권한 없는 자의 부탁을 받아 작업하는 보안 취약점. ExternalId로 방어

---

## 📖 이론 내용

### 1. STS (Security Token Service)

STS는 임시 자격 증명을 발급합니다. 결과는 항상 다음 3가지:
- **AccessKeyId** (`ASIA…` 시작 — 일반 IAM은 `AKIA…`)
- **SecretAccessKey**
- **SessionToken** (임시 자격 증명의 핵심 식별자)

#### 주요 STS API

| API | 용도 | 호출 주체 |
|-----|------|-----------|
| **AssumeRole** | IAM User/Role이 다른 Role 가정 | IAM 자격 증명 보유자 |
| **AssumeRoleWithSAML** | SAML IdP 사용자가 Role 가정 | SAML Assertion 보유자 |
| **AssumeRoleWithWebIdentity** | Google/Facebook/OIDC 사용자 | OIDC 토큰 보유자 |
| **GetFederationToken** | IAM User가 Federation 토큰 발급 | IAM User (Root 아님) |
| **GetSessionToken** | MFA 강제 시 세션 토큰 발급 | IAM User |

#### 유효 시간 (TTL)

- AssumeRole: 15분 ~ **12시간** (Role의 MaxSessionDuration 설정)
- GetSessionToken: 15분 ~ 36시간 (Root는 1시간 max)
- AssumeRoleWith*: 15분 ~ 12시간

### 2. Cross-Account Access 패턴

```
[Account A: 신뢰 부여자]              [Account B: 신뢰받는 자]
  Role: ProdReadRole              ←   사용자: alice
  Trust Policy:
    Principal: arn:aws:iam::B-account:root
    Condition: ExternalId 일치
  Permission: ReadOnly                Identity Policy:
                                       sts:AssumeRole on ProdReadRole
```

**ExternalId 필수 사용 시나리오**:
- 3rd party SaaS (DataDog, Splunk 등)가 우리 계정에 접근할 때
- "Confused Deputy" 공격 차단
- 서드파티가 받은 ExternalId를 다른 고객 권한 가로채기에 재사용 못 함

### 3. Permission Boundary

**용도**: 사용자/역할에 부여할 수 있는 권한의 **최대치**를 미리 못박음.

#### 예시 시나리오
개발자 알리스에게 IAM 사용자 생성 권한을 주되, 알리스가 만드는 사용자에게 절대 줄 수 없는 권한을 막고 싶다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:*",
      "cloudwatch:*",
      "logs:*"
    ],
    "Resource": "*"
  }]
}
```
→ 이걸 Permission Boundary로 알리스에게 적용하면, 알리스가 만들 IAM 객체는 위 권한 범위 안에서만 동작 가능.

**SCP vs Permission Boundary vs Identity Policy**

| 구분 | 적용 대상 | 역할 |
|------|-----------|------|
| **SCP** | OU/계정 | 조직 단위 가드레일 (계정 내 모든 IAM에 적용) |
| **Permission Boundary** | User/Role | 그 사용자/역할이 가질 수 있는 권한 상한 |
| **Identity Policy** | User/Group/Role | 실제로 부여하는 권한 |
| **Session Policy** | AssumeRole 세션 | 임시 세션 권한 축소 |

> 💡 **암기 팁**: SCP는 "회사 헌법", Boundary는 "부서 한계", Identity Policy는 "실제 권한", Session Policy는 "오늘 하루 권한".

### 4. AWS IAM Identity Center (구 AWS SSO)

#### 왜 필요한가
- 멀티 계정 환경에서 사용자가 계정마다 IAM User 만들면 관리 지옥
- Identity Center가 단일 로그인 + 모든 계정/앱에 권한 자동 부여

#### 구성 요소
- **Identity Source**: 사용자 풀 (내장, AD, 외부 SAML IdP)
- **Permission Set**: 사전 정의된 IAM Role 템플릿 (예: `AdministratorAccess`, `ReadOnlyAccess`)
- **Account Assignment**: 어떤 사용자/그룹이 어떤 계정에 어떤 Permission Set으로 들어갈지

#### 동작 흐름
```
사용자 → Identity Center 포털 로그인
       → 접근 가능 계정 목록 표시
       → 계정 선택 + Permission Set 선택
       → STS가 임시 자격 증명 발급
       → AWS Console 접속 or aws CLI 사용 (aws sso login)
```

### 5. 정책 조건(Condition) 활용 - 운영자 무기

#### 자주 쓰이는 글로벌 조건 키

| 조건 키 | 의미 | 예시 |
|---------|------|------|
| `aws:SourceIp` | 호출자 IP | 사무실 IP만 허용 |
| `aws:MultiFactorAuthPresent` | MFA 인증 여부 | 민감 작업에 MFA 강제 |
| `aws:MultiFactorAuthAge` | MFA 인증 후 경과 초 | 1시간 이내만 허용 |
| `aws:RequestedRegion` | 요청 리전 | `ap-northeast-2`만 |
| `aws:PrincipalTag/key` | Principal 태그 | ABAC 구현 |
| `aws:ResourceTag/key` | 리소스 태그 | 태그 일치 시만 접근 |
| `aws:CurrentTime` | 현재 시각 | 업무 시간만 허용 |
| `aws:SourceVpc` | VPC ID | 특정 VPC에서만 |
| `aws:SecureTransport` | HTTPS 여부 | HTTPS 강제 |

#### ABAC (Attribute-Based Access Control) 예시
```json
{
  "Effect": "Allow",
  "Action": "ec2:*",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
    }
  }
}
```
→ 자기 Project 태그와 일치하는 EC2만 조작 가능. 정책 하나로 모든 팀 분리.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Role chaining** | Role A → Role B → Role C로 연쇄. 새 세션은 최대 1시간 (12시간 X) | 시간 제한 함정 |
| **iam:PassRole** | Lambda·EC2·CFn에 Role을 넘길 때 필요. 누락 시 "PassRole denied" 에러 | 흔한 운영 실수 |
| **MaxSessionDuration** | Role마다 1h/2h/4h/8h/12h 중 선택 | 사람용은 4h, 자동화는 12h 권장 |
| **Last accessed information** | 정책별/서비스별 최근 사용 추적 | 미사용 권한 정리에 활용 |
| **IAM Access Analyzer** | 외부 공유 자동 탐지 + 정책 검증 | Week 9에서 자세히 |
| **AWS Managed Microsoft AD** | AWS에서 운영하는 관리형 AD | AD 통합 SSO에 활용 |

> ⚠️ **함정 1**: Role chaining은 새 세션 시간이 **최대 1시간**으로 강제됨. 12시간 X.
>
> ⚠️ **함정 2**: `sts:AssumeRole` 같은 STS 작업도 IAM 정책에 명시해야 함. 누락 시 "User is not authorized to perform sts:AssumeRole".
>
> 💡 **암기 팁**: "Federation에는 IAM User 필요 없다". SAML/OIDC → 직접 Role Assume.

### 관련 서비스 Cross-Reference

- **STS → Week 5 SSM Session Manager** (임시 세션으로 EC2 접속)
- **Identity Center → Week 1 Day 4** (Organizations와 함께 멀티 계정 운영)
- **ABAC → Week 9 보안 운영** (KMS, Secrets Manager 태그 기반 접근)
- **Permission Boundary → Week 6 Service Catalog** (자가 서비스 프로비저닝의 가드레일)

---

## 🏗️ 아키텍처 다이어그램

```
멀티 계정 - Identity Center + Permission Set
======================================================

  [Identity Provider: Okta/AD/내장]
              │ SAML/OIDC
              ▼
  ┌─────────────────────────────┐
  │  AWS IAM Identity Center    │  ← 단일 로그인 진입점
  │  (Management Account)       │
  └────┬────────────────────────┘
       │ Permission Set
       │ (AdministratorAccess, ReadOnlyAccess, ...)
       │
       ▼
  ┌──────────┬──────────┬──────────┐
  │ Dev      │ Stage    │ Prod     │  ← 멀티 계정 (Organizations)
  │ Account  │ Account  │ Account  │
  └──────────┴──────────┴──────────┘

  사용자가 "Prod / ReadOnly" 선택
   → Identity Center가 Prod 계정의 Role 자동 Assume
   → STS가 1~12시간 임시 자격 증명 발급
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Cross-Account 접근 시 ExternalId** — 3rd party SaaS 통합 시 필수
2. ⭐ **Role chaining 시 세션 최대 1시간** — 자동화 파이프라인에서 주의
3. ⭐ **Identity Center = 멀티 계정 SSO의 표준** — 더 이상 계정마다 IAM User 만들지 말 것
4. ⭐ **Permission Boundary는 권한 상한 (가드레일)** — IAM User 만들 권한을 주되, 너무 큰 권한은 못 만들게 막을 때
5. ⭐ **iam:PassRole 누락은 흔한 운영 실수** — Lambda/EC2/ECS Task Role 생성 시 반드시

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Cross-Account AssumeRole (ExternalId 포함)
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ThirdPartyAccessRole \
  --role-session-name "datadog-integration-2026" \
  --external-id "unique-shared-secret-12345" \
  --duration-seconds 3600

# 출력의 Credentials를 환경 변수에 설정
export AWS_ACCESS_KEY_ID="ASIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."

# 2. Permission Boundary가 붙은 Role 생성
aws iam put-role-permissions-boundary \
  --role-name DeveloperRole \
  --permissions-boundary arn:aws:iam::123456789012:policy/DevBoundary

# 3. Identity Center SSO 로그인 (CLI v2)
aws configure sso
# SSO start URL: https://my-org.awsapps.com/start
# SSO Region: ap-northeast-2
# → 브라우저로 인증 → 계정/Permission Set 선택

aws sso login --profile prod-readonly
aws s3 ls --profile prod-readonly

# 4. 정책 시뮬레이션 (조건 포함)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/bob \
  --action-names ec2:TerminateInstances \
  --resource-arns "arn:aws:ec2:ap-northeast-2:123456789012:instance/i-0123456789abcdef0" \
  --context-entries '[
    {"ContextKeyName":"aws:MultiFactorAuthPresent","ContextKeyValues":["true"],"ContextKeyType":"boolean"},
    {"ContextKeyName":"aws:SourceIp","ContextKeyValues":["203.0.113.5"],"ContextKeyType":"ip"}
  ]'

# 5. 마지막 사용 정보 확인 (미사용 권한 청소용)
aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::123456789012:user/alice
# JobId를 받아서:
aws iam get-service-last-accessed-details --job-id <JobId>
```

---

## 📝 연습 문제

**문제 1.** 회사 IT 팀이 DataDog SaaS를 도입했다. DataDog가 AWS 계정의 CloudWatch 메트릭을 읽어야 한다. 가장 안전한 방법은?

A) IAM User를 만들어 Access Key를 DataDog에 제공
B) Cross-Account Role을 만들고 ExternalId를 포함시켜 DataDog에 전달
C) 루트 자격 증명 공유
D) S3 버킷 정책에 DataDog 전체 허용

**정답: B**
해설: 3rd party SaaS 통합은 **Cross-Account Role + ExternalId**가 표준. ExternalId는 Confused Deputy 공격을 막음. Access Key 공유는 회전 어렵고 유출 위험.

---

**문제 2.** 한 자동화 파이프라인이 Role A → Role B → Role C로 chain assume한다. Role B의 MaxSessionDuration이 12시간으로 설정돼 있지만 실제 세션은 1시간이 지나면 만료된다. 원인은?

A) STS 버그
B) Role Chaining은 새 세션 시간을 최대 1시간으로 강제
C) ExternalId가 만료됐다
D) MFA가 필요하다

**정답: B**
해설: Role chaining 시 새 STS 세션은 **항상 1시간 max**. 자동화에서 장시간 작업이 필요하면 Chaining을 피하고 직접 Assume.

---

**문제 3.** 개발자에게 IAM User/Role 생성 권한을 주되, 그들이 만드는 IAM 객체에 `s3:*`나 `iam:*` 같은 위험 권한을 주지 못하게 하려면?

A) SCP 적용
B) Permission Boundary 적용
C) Identity Policy로 Deny 추가
D) Session Policy 사용

**정답: B**
해설: Permission Boundary는 "이 사용자가 만들 수 있는 IAM 객체의 권한 상한"을 강제. SCP는 OU 단위, Session Policy는 일회성. 정확히 이런 자가 서비스 IAM 위임 시나리오에 Boundary 사용.

---

**문제 4.** AWS IAM Identity Center를 도입한 회사가 사용자에게 Prod 계정의 ReadOnly 권한을 줘야 한다. 올바른 순서는?

A) Prod 계정에 IAM User 만들기
B) Permission Set 생성 → 사용자/그룹에 계정 할당 → Prod 계정 자동 매핑
C) Cross-Account Role 수동 작성
D) STS GetSessionToken 호출

**정답: B**
해설: Identity Center는 Permission Set을 통해 자동으로 계정마다 Role을 프로비저닝. 사용자/그룹에 "어느 계정의 어느 Permission Set"을 할당하면 끝. IAM User 따로 만들 필요 없음.

---

**문제 5.** Lambda 함수를 만들고 Execution Role을 지정하려는데 `iam:PassRole` 에러가 발생했다. 해결책은?

A) Lambda를 재배포
B) 호출자(Lambda 생성자)의 IAM 정책에 `iam:PassRole` 권한 추가 + 대상 Role ARN 명시
C) Trust Policy 수정
D) Service-Linked Role 사용

**정답: B**
해설: AWS 서비스에 IAM Role을 "넘기는" 행위(PassRole)는 별도 권한 필요. Lambda·EC2·CFn·CodeBuild 등 거의 모든 서비스 생성 시 발생하는 흔한 운영 실수.

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::*:role/LambdaExecRole",
  "Condition": {
    "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" }
  }
}
```

---

## 📌 오늘의 요약

1. STS는 임시 자격 증명 발급 글로벌 서비스. 결과는 항상 (AccessKey + Secret + SessionToken) 3종 세트
2. Cross-Account 접근에는 ExternalId 사용 — 특히 3rd party SaaS 통합 시 Confused Deputy 방어
3. Permission Boundary = "이 IAM 객체가 부여할 수 있는 권한의 상한". IAM 위임 시 가드레일
4. Identity Center로 멀티 계정 SSO 운영 — 더 이상 계정마다 IAM User 만들지 말 것
5. `iam:PassRole`은 Lambda/EC2/CFn에 Role 넘길 때 필요. 누락 시 흔한 운영 에러
