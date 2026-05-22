# Day 2 - IAM·STS·Identity Federation 복습 심화

📅 날짜: Week 1 (Day 2)
🎯 주제: Pro 수준의 IAM·STS·페더레이션 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- IAM 정책 평가 로직(Explicit Deny > Allow)을 완전히 이해한다
- STS AssumeRole·Cross-Account·SAML·OIDC 페더레이션 패턴을 구분한다
- Permission Boundary, Session Policy, SCP의 상호작용을 설명한다
- 자격 증명 누수 방지 전략(IAM Roles Anywhere, IRSA, Roles for EC2)을 안다

---

## 🧩 사전 지식 (CS 기초)

- **AAA (Authentication·Authorization·Accounting)**: 인증·인가·감사. IAM은 앞 두 가지, CloudTrail이 마지막.
- **JWT (JSON Web Token)**: OIDC 페더레이션에서 ID 토큰 형태로 쓰이는 서명된 토큰.
- **PKI (Public Key Infrastructure)**: IAM Roles Anywhere가 외부 X.509 인증서를 신뢰하는 기반.
- **Principle of Least Privilege**: 최소 권한 원칙 — Pro 시험 단골.
- **Trust Policy vs Permission Policy**: Role에는 둘 다 필요. Trust는 "누가 이 Role을 맡을 수 있는가", Permission은 "Role이 무엇을 할 수 있는가".

---

## 📖 이론 내용

### 1. IAM 정책 평가 로직 (⭐ 시험 핵심)

요청은 다음 순서로 평가된다.

1. **Default Deny** — 시작은 거부.
2. **Explicit Deny** — 어디든 명시적 Deny가 있으면 즉시 거부 (SCP, IAM Policy, Resource Policy, Permission Boundary 어디든).
3. **Explicit Allow** — Allow가 있어야 허용.
4. **Permission Boundary, Session Policy, SCP** 의 교집합 안에서만 유효.

> 💡 **암기 팁**: "Deny는 단 한 곳만 있어도 끝, Allow는 모든 곳에 있어야 함" (교집합).

### 2. STS와 AssumeRole 패턴

STS(Security Token Service)는 임시 자격 증명(액세스 키 + 시크릿 + 세션 토큰)을 발급한다.

| API | 용도 |
|-----|------|
| `AssumeRole` | 다른 AWS 계정·서비스의 Role 맡기 |
| `AssumeRoleWithSAML` | 기업 IdP (AD FS, Okta) SAML 2.0 페더레이션 |
| `AssumeRoleWithWebIdentity` | OIDC (Google, Cognito, GitHub Actions OIDC) |
| `GetSessionToken` | MFA 강제용 임시 자격 증명 |
| `GetFederationToken` | 사용자 정의 페더레이션 브로커 |

**Cross-Account 패턴** — 가장 시험 빈출:

```
Account A (User)       Account B (Resource)
   |                       |
   |  sts:AssumeRole       |
   +---------------------->|  Trust Policy: A 신뢰
   |                       |  Permission Policy: S3 등
   |<----- 임시 자격 ------+
```

### 3. 페더레이션 — SAML vs OIDC vs Identity Center

| 방식 | 표준 | 사용 사례 |
|------|------|-----------|
| **SAML 2.0** | XML | 기업 AD/Okta, 콘솔 + CLI 모두 |
| **OIDC (Web Identity)** | JSON/JWT | 모바일·웹앱, GitHub Actions, EKS IRSA |
| **AWS IAM Identity Center** (구 SSO) | SAML+SCIM 통합 | 멀티 계정·SSO 표준 (Pro 정답 빈출) |

> ⚠️ **함정**: "100개 계정·SAML IdP·콘솔 로그인 통합" → 항상 **IAM Identity Center**가 정답. 옛 방식 SAML+계정별 Role 매핑은 운영 부담 큼.

### 4. Permission Boundary · Session Policy · SCP

| 구분 | 적용 대상 | 효과 |
|------|-----------|------|
| **SCP** | OU/계정 단위 | 계정 내 모든 Principal의 최대 권한 한계 (Org 차원) |
| **Permission Boundary** | IAM User/Role | 그 Principal의 최대 권한 한계 |
| **Session Policy** | `AssumeRole` 호출 시 | 해당 세션 동안의 한계 |
| **Identity Policy** | User/Group/Role 부착 | 부여 권한 |
| **Resource Policy** | S3 버킷·KMS·SNS 등 | 리소스 측 허용/거부 |

> 💡 **암기**: SCP/Boundary/Session은 "최대 한계(ceiling)" — 권한을 부여하는 게 아니라 제한한다.

### 5. 자격 증명 누수 방지 전략

- **EC2 Instance Profile**: EC2에서 직접 키 보관 금지. 항상 Role.
- **IRSA (IAM Roles for Service Accounts)**: EKS Pod에 Role 부여. OIDC 기반.
- **ECS Task Role**: 컨테이너 단위 권한.
- **Lambda Execution Role**: Lambda 함수 권한.
- **IAM Roles Anywhere**: 온프레미스 워크로드에 X.509 인증서로 임시 자격 부여 — 하이브리드 정답.
- **AWS Secrets Manager / Parameter Store**: DB 비밀번호·API 키 회전.

> ⚠️ **함정**: "온프레미스 서버에서 AWS API 호출, 액세스 키 회전 필요" → 답: **IAM Roles Anywhere**.

---

## 🧠 알아두면 좋은 심화 이론

### 정책 조건 키 (자주 출제)

| 조건 키 | 의미 | 활용 |
|---------|------|------|
| `aws:PrincipalOrgID` | 호출자가 특정 Org 소속 | Cross-Account 정책 |
| `aws:SourceVpc` / `aws:SourceVpce` | 특정 VPC/Endpoint에서만 | 데이터 유출 방지 |
| `aws:MultiFactorAuthPresent` | MFA 세션만 | 민감 작업 강제 |
| `aws:RequestedRegion` | 특정 리전만 | SCP로 데이터 주권 |
| `aws:ResourceTag/Key` | 태그 기반 ABAC | 동적 권한 |

### ABAC vs RBAC

- **RBAC**: Role 단위 권한. 팀 늘면 Role 폭증.
- **ABAC**: 태그(속성) 기반. `Project=Alpha` 태그에 매핑. **확장성 좋음** → Pro에선 ABAC가 자주 정답.

### Cross-Reference

- **Week 2**: SCP·Identity Center 본격 학습
- **Week 7**: EKS IRSA
- **Week 11**: KMS Key Policy + Grant

---

## 🏗️ 아키텍처 다이어그램 — Cross-Account + ABAC

```
Org Root
  |
  +-- OU Security
  |     +-- Account: Audit (CloudTrail 수집)
  |
  +-- OU Workloads
        +-- Account: Prod
        |     IAM Role "DevOpsRole" (Trust: Identity Center)
        |     Tag: Env=Prod
        +-- Account: Dev
              IAM Role "DevOpsRole" (Trust: Identity Center)
              Tag: Env=Dev

사용자 (IAM Identity Center)
   |
   |  SSO 로그인 → 권한 세트 "DevOps" 선택
   v
AssumeRole (자동) → Prod or Dev 계정 Role
   ABAC: aws:PrincipalTag/Team == ResourceTag/Team 일치 시만 허용
```

---

## ⭐ 핵심 포인트

1. ⭐ **Explicit Deny 우선**, 그 후 Allow 교집합
2. ⭐ **Cross-Account**: Trust Policy + Permission Policy 둘 다 필요
3. ⭐ **IAM Identity Center**는 멀티 계정 SSO의 표준 정답
4. ⭐ **IAM Roles Anywhere**는 온프레미스 워크로드 자격 증명의 정답
5. ⭐ **Permission Boundary**는 권한 부여가 아니라 **최대 한계**

---

## 💻 실제 예시 - Cross-Account Role

```bash
# Account B에 Role 생성 (Trust = Account A)
aws iam create-role --role-name DataReader \
  --assume-role-policy-document file://trust.json

# trust.json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::111111111111:root"},
    "Action": "sts:AssumeRole",
    "Condition": {"StringEquals": {"sts:ExternalId": "Alpha-2026"}}
  }]
}

# Account A에서 Assume
aws sts assume-role \
  --role-arn arn:aws:iam::222222222222:role/DataReader \
  --role-session-name analytics \
  --external-id Alpha-2026
```

---

## 📝 연습 문제

**문제 1.** 한 사용자에게 Identity Policy로 `s3:*` Allow가 부여되어 있고, Permission Boundary에는 `s3:GetObject`만 Allow되어 있다. SCP는 `s3:*` Allow. 사용자가 `s3:PutObject`를 호출하면?

A) 허용됨 (Identity Policy 우선)
B) 거부됨 (Permission Boundary로 한계)
C) 허용됨 (SCP가 우선)
D) Deny가 없어서 허용됨

**정답: B**
해설: Permission Boundary는 최대 한계. 교집합이 `s3:GetObject`만이라 PutObject는 거부.

---

**문제 2.** 100개 AWS 계정·Okta SAML·콘솔 SSO·CLI 모두 통합. 가장 적합한 솔루션은?

A) 각 계정에 SAML IdP 등록
B) IAM Identity Center + Okta 통합
C) Cognito User Pool
D) Direct Connect + AD Connector

**정답: B**
해설: Identity Center가 멀티 계정 SSO 표준. 콘솔·CLI 다 지원.

---

**문제 3.** 온프레미스 데이터센터의 100개 서버가 AWS API를 호출. 액세스 키 정기 회전이 부담. 가장 적절한 방법은?

A) IAM User + Access Key 회전 자동화
B) STS GetSessionToken을 스크립트로 매시간
C) IAM Roles Anywhere + X.509 인증서
D) AWS Directory Service

**정답: C**
해설: Roles Anywhere가 온프레미스 PKI 기반 임시 자격 발급.

---

**문제 4.** EKS Pod별로 다른 S3 권한을 부여하려면?

A) Node IAM Role에 모든 권한
B) Pod에 액세스 키 환경변수
C) IRSA (IAM Roles for Service Accounts)
D) HostNetwork + Instance Profile

**정답: C**
해설: IRSA가 ServiceAccount-Role 매핑으로 Pod 단위 권한 부여.

---

**문제 5.** SCP에서 `aws:RequestedRegion`을 `ap-northeast-2`로만 허용하면?

A) 모든 계정 사용자가 도쿄 리전만 사용 가능
B) 해당 OU/계정의 사용자가 서울 리전 외에서는 작업 불가
C) 글로벌 서비스도 차단됨
D) 효과 없음

**정답: B**
해설: SCP는 OU/계정 범위에 적용. 글로벌 서비스(IAM 등)는 SCP에서 별도 예외 처리 필요.

---

**문제 6.** 1000명 개발자, 프로젝트별 권한 분리 필요. 매번 Role 만들고 정책 작성은 부담. 어떤 접근?

A) RBAC — Role을 1000개 생성
B) Group 1000개 생성
C) ABAC — 태그 기반 권한
D) Permission Boundary 1000개

**정답: C**
해설: ABAC = 태그 기반 = 확장성 좋음. Role 하나에 조건키로 동적 권한.

---

## 📌 오늘의 요약

1. 평가: Default Deny → Explicit Deny 우선 → Allow 교집합
2. Cross-Account = Trust Policy + Permission Policy 두 개
3. 페더레이션: SAML(기업), OIDC(웹앱·IRSA), **Identity Center(멀티 계정 표준)**
4. SCP·Permission Boundary·Session Policy는 "최대 한계", 권한 부여 X
5. 온프레미스 자격 = **Roles Anywhere**, EKS Pod = **IRSA**, 확장성 = **ABAC**
