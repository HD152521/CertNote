# Day 4 - IAM Identity Center, Permission Set, 통합 결제: 멀티 계정 SSO의 표준

200명 직원이 80개 AWS 계정에 접근해야 한다. 한 직원이 평균 10개 계정에 다른 권한으로 들어간다. 이걸 IAM User로 만들면 200 × 10 = 2,000개 IAM User. 직원이 한 명 퇴사하면 80개 계정을 일일이 돌며 10개 권한을 모두 회수해야 한다. 그 사이 하나라도 빼먹으면 보안 사고. 이 운영 부담이 멀티 계정 환경의 가장 큰 적이었다.

2017년 AWS는 이 문제를 풀기 위해 **AWS SSO**를 출시했고, 2022년 이름을 **IAM Identity Center**로 바꿨다. Pro 시험에서 "멀티 계정 SSO" 또는 "직원 SSO" 키워드가 보이면 99% IDC가 정답이다.

오늘은 IAM Identity Center의 구조, Permission Set의 작동 원리, SCIM 자동 동기화, 외부 IdP(Okta·Azure AD) 통합, CLI v2 SSO, 그리고 Consolidated Billing의 효과까지 본다. 또 한 가지 자주 헷갈리는 함정 — **IDC vs Cognito**의 차이도 정리한다.

## IAM Identity Center의 본질

- 구 이름: AWS Single Sign-On (AWS SSO, 2017~2022)
- 현재 이름: IAM Identity Center (2022 rename)
- **멀티 계정 SSO 표준 솔루션** (Pro 시험 단골)
- AWS Organizations와 통합
- 자체 디렉터리 또는 외부 IdP(Okta, Azure AD/Entra ID, Google Workspace, AD) 통합
- 콘솔 + CLI v2 + 모든 AWS 서비스 SDK 지원
- **무료** (IDC 자체는 과금 없음, 단 AD Connector 등 부속 서비스는 별도)

> 💡 **관련 이론**: SSO는 1990년대 SAML(Security Assertion Markup Language)에서 시작했다. SAML 2.0은 2005년 OASIS 표준, XML 기반 어셔션을 교환해 한 번의 로그인으로 여러 서비스 접근. 2010년대에 OIDC(OpenID Connect, JWT 기반)와 OAuth 2.0이 모바일·SPA 친화적이라 부상. IDC는 SAML 2.0과 OIDC를 모두 지원해 양쪽 IdP 생태계와 호환된다. SCIM(RFC 7644, 2015)은 사용자·그룹 자동 동기화 표준으로, IDC가 외부 IdP에서 사용자 변경을 자동 반영하는 메커니즘.

> 🔍 **더 깊이**: IDC는 이전 AWS SSO 시절에 **AWS Managed Microsoft AD**의 일부 기능을 사용했지만, 2022 rebrand 이후 별도 백엔드로 분리됐다. 내부적으로는 (1) Cognito User Pool 변형, (2) STS AssumeRole API의 wrapper, (3) Permission Set 추상화 레이어로 동작. Permission Set이 부착되면 백엔드에서 각 멤버 계정에 `AWSReservedSSO_<PermissionSet>_<random>` IAM Role을 자동 생성하고, 사용자가 SSO 포털에서 계정 선택 시 그 Role을 AssumeRole한다.

## 핵심 구성 요소

```
External IdP (Okta)        OR     Internal Directory (IDC built-in / AD)
        │                                   │
        ▼ SAML + SCIM                       ▼
        ┌──────────────────────────────────┐
        │    IAM Identity Center           │
        │    (Org Management Account에 설치)│
        │                                  │
        │    Users / Groups                │
        │    Permission Sets (권한 묶음)   │
        └──────────────────────────────────┘
                  │
                  ▼ 매핑
        Account A  Account B  Account C
        (AWSReservedSSO_* Role 자동 생성)
```

## Permission Set 구조

Permission Set = 권한 묶음의 추상화.

- AWS Managed Policy + Customer Managed Policy + Inline Policy 조합 가능
- Account+Group+Permission Set 매핑 시 **자동으로 그 계정에 IAM Role 생성** (`AWSReservedSSO_<PermissionSet>_<random>`)
- 세션 길이 1~12시간 설정
- Permission Boundary 부착 가능

**대표 Permission Set 예시**:

| Permission Set | 권한 | 세션 |
|----------------|------|------|
| `AdministratorAccess` | 전체 권한 | 1h (강력 권장) |
| `PowerUserAccess` | IAM·결제 제외 | 4h |
| `ReadOnlyAccess` | 조회만 | 8h |
| `Billing` | 결제만 | 1h |
| `DataScientist` | S3, SageMaker, Athena 등 | 4h |
| `DevOps` | 배포·운영 | 4h |

> 🎯 **시나리오**: "한 보안팀이 관리자(Admin) 권한 사용을 최소화하려고 한다. 어떤 IDC 설정?" — 답: **AdministratorAccess Permission Set의 세션 길이를 1시간으로 단축 + MFA 강제 + 모든 사용 CloudTrail 알림**. 짧은 세션은 토큰 탈취 시 영향 최소화. 평소엔 PowerUserAccess로, 관리 작업 시에만 Admin 권한 일시 사용 패턴(break-glass).

## 사용자 → 계정 매핑 흐름

```
Okta 사용자 (developers 그룹)
   │
   ▼  SAML 로그인
IDC 포털 (https://d-xxxx.awsapps.com/start)
   │
   ▼  계정 + Permission Set 선택
sts:AssumeRole (자동) → 해당 계정의 IAM Role
   │
   ▼
콘솔 또는 CLI 사용 (세션 만료 시 자동 갱신)
```

## 외부 IdP 통합

| IdP | 사용자 동기화 | 인증 프로토콜 |
|-----|----------------|----------------|
| **Okta** | SCIM 자동 동기화 | SAML 2.0 |
| **Azure AD / Entra ID** | SCIM | SAML 또는 OIDC |
| **Google Workspace** | SCIM 또는 SAML만 | SAML |
| **AWS Managed Microsoft AD** | 직접 통합 | Kerberos |
| **AD Connector** | 온프레미스 AD 연결 | LDAP → SAML |
| **JumpCloud, OneLogin** | SCIM | SAML |

> ⚠️ **함정**: "온프레미스 AD 사용 + AWS 콘솔 SSO" → AD Connector 또는 AWS Managed AD + IAM Identity Center. AD Connector는 단순 proxy라 AD를 직접 보지 않고 IDC가 AD를 LDAP로 조회. AWS Managed AD는 AWS에 완전한 AD를 새로 만드는 것 — 마이그레이션 필요 시 후자.

> 🔍 **더 깊이**: SCIM(RFC 7644)은 사용자·그룹 변경 이벤트를 IdP에서 SP(Service Provider)로 push하는 표준이다. Okta에서 사용자 비활성화 → 5분 안에 IDC도 비활성화 → AWS 콘솔 접근 차단. 만약 SCIM이 아니라 JIT(Just-in-Time) provisioning이라면 다음 로그인 시도 시점에 동기화되므로, 이미 로그인한 세션은 만료까지 유지된다. 보안 사고 시 SCIM이 압도적으로 빠름.

> 📚 **사례**: 2020년 Twilio 사고. 직원의 Okta 자격증명이 phishing으로 유출되면서 공격자가 Twilio의 일부 시스템에 접근했다. 사고 후 Twilio는 (1) FIDO2 하드웨어 토큰 강제, (2) IDC 세션 길이 단축, (3) 의심스러운 IP에서 로그인 시 자동 차단을 도입했다. 같은 패턴이 클라우드 환경의 SSO 보안 표준이 됐다.

## CLI v2 SSO 흐름

```bash
aws configure sso
# Start URL: https://d-xxxx.awsapps.com/start
# Region: ap-northeast-2
# 브라우저 자동 열림 → 인증
# 계정·역할 선택
# Profile 이름 저장

# 이후 사용
aws s3 ls --profile dev-account
# 자동으로 SSO 토큰 사용

# 토큰 갱신 (만료 시)
aws sso login --profile dev-account
```

> 🔍 **더 깊이**: CLI v2의 SSO는 device authorization grant(OIDC RFC 8628)를 사용한다. CLI가 verification URL과 user code를 표시하고, 사용자가 브라우저에서 인증하면 CLI가 token endpoint에서 access token을 받는다. 이 방식의 장점은 (1) CLI가 사용자 비밀번호를 절대 보지 못하고, (2) MFA가 자연스럽게 동작하며, (3) 브라우저의 SSO 세션을 재사용할 수 있다는 것. 단점은 첫 인증 시 브라우저 필수. headless CI에서는 부적합 — CI에서는 OIDC + AssumeRoleWithWebIdentity 패턴 (GitHub Actions 등).

## ABAC + IDC: 동적 권한의 끝판왕

IDC가 IdP의 사용자 속성(예: Department, CostCenter)을 SAML Attribute로 전파 → IAM Role 세션 태그 → 리소스 태그 매칭으로 동적 권한 부여.

```
[Okta 사용자]
  속성: Department = "DataScience", Project = "AlphaModel"
       │
       ▼ SAML
[IDC] → Permission Set의 IAM Role assume 시 세션 태그 부여:
       aws:PrincipalTag/Department = DataScience
       aws:PrincipalTag/Project = AlphaModel
       │
       ▼
[IAM Policy in Role]:
  Effect: Allow
  Action: s3:GetObject
  Resource: arn:aws:s3:::data-*
  Condition:
    StringEquals:
      aws:ResourceTag/Project: ${aws:PrincipalTag/Project}
```

신규 사용자 추가나 신규 프로젝트 생성 시 IAM 정책 수정 불필요 — IdP에서 속성만 부여하면 끝.

> 💡 **관련 이론**: ABAC(Attribute-Based Access Control)은 NIST SP 800-162 (2014)에서 형식화된 모델. RBAC(Role-Based)은 "역할이 권한을 가진다", ABAC은 "주체·자원·환경 속성의 조합이 권한을 결정". RBAC은 N개 역할 × M개 권한의 곱셈 폭발이 발생하지만, ABAC은 속성 조합으로 동적 계산. 100+ 프로젝트가 있는 조직에서 ABAC이 결정적으로 우월하다.

> 🎯 **시나리오**: "한 회사가 100개 프로젝트를 운영하며 각 프로젝트마다 분리된 S3 버킷·EC2를 둔다. 사용자는 자기 프로젝트의 리소스에만 접근 가능. RBAC으로는 100개 Role × N명 = 폭발. 어떻게?" — 답: **ABAC + IDC**. IdP에서 사용자 속성에 Project 부여 → IAM Role 세션 태그로 전파 → 리소스 태그와 매칭으로 동적 권한. 한 개의 ABAC 정책으로 100개 프로젝트 모두 처리.

## IAM Identity Center vs Cognito: 절대 헷갈리지 말 것

| | IDC | Cognito |
|---|-----|---------|
| 대상 | **직원·관리자** (콘솔·CLI) | **고객 사용자** (앱 회원가입) |
| 사용처 | 멀티 계정 SSO | 소셜 로그인, 앱 인증 |
| 인증 흐름 | SAML/OIDC + STS AssumeRole | OAuth 2.0 + JWT |
| 가격 | 무료 | 사용자당 월 $0.0055 |
| 핵심 기능 | Permission Set, 다중 AWS 계정 | User Pool, Identity Pool, Social Login |

> ⚠️ **함정**: "B2C 앱의 고객 회원가입을 IAM Identity Center로" 같은 보기는 100% 함정. 고객 인증은 Cognito. 직원·관리자 SSO만 IDC. 이 한 줄로 시험 한 문제는 거의 무조건 푼다.

## Consolidated Billing의 효과와 한계

| 효과 | 설명 |
|------|------|
| **단일 청구서** | CFO·회계 단순화 |
| **볼륨 할인 합산** | 모든 계정 사용량 합쳐 단계별 할인 (S3 storage tier, CloudFront data transfer) |
| **RI·Savings Plans 공유** | Management/Org 단위 공유, 안 쓴 SP를 다른 계정이 사용 |
| **데이터 전송 등급 할인** | 전체 outbound 합산 |

**한계**:
- 멤버 계정에서 결제 정보·청구서 못 봄 (관리 계정에서 IAM 권한 부여 필요)
- 환불·크레딧은 Org Management로 일원화
- 일부 marketplace 구독은 멤버 계정 단위

> 🔍 **더 깊이**: RI/SP Sharing은 기본 ON. Billing Console에서 "Linked Account Sharing" 토글로 끌 수 있다. 끄면 각 멤버 계정이 자기 RI만 쓰게 됨. 보통 켜둔다 — 한 계정이 야간에 안 쓰는 RI를 다른 계정이 주간에 활용해 전사 효율 극대화. 단, 부서별 비용 정확히 분리하고 싶다면 끄는 게 명확.

> 🎯 **시나리오**: "한 회사가 80개 계정 운영, 일부 부서는 24/7, 일부는 9-18시만. RI 비용을 최소화하려면?" — 답: **Consolidated Billing의 RI Sharing ON 유지 + Compute Savings Plans 1년**. 야간에 사용 안 한 SP를 다른 부서가 자동 활용. Compute SP는 EC2·Fargate·Lambda 모두 적용되어 가장 유연.

## CLI로 직접 보기

```bash
# Permission Set 생성
aws sso-admin create-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --name DevOpsAccess \
  --session-duration PT4H

# AWS Managed Policy 부착
aws sso-admin attach-managed-policy-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --permission-set-arn arn:aws:sso:::permissionSet/xxx \
  --managed-policy-arn arn:aws:iam::aws:policy/PowerUserAccess

# 계정 + 그룹 + Permission Set 매핑
aws sso-admin create-account-assignment \
  --instance-arn arn:aws:sso:::instance/ssoins-xxx \
  --target-id 111111111111 --target-type AWS_ACCOUNT \
  --permission-set-arn arn:aws:sso:::permissionSet/xxx \
  --principal-type GROUP --principal-id <okta-group-uuid>

# IDC 인스턴스 조회
aws sso-admin list-instances
```

## 정리하며

오늘 본 그림은 셋이다. 첫째, **IAM Identity Center는 멀티 계정 SSO의 표준**이고 Permission Set이 IAM Role을 자동 생성한다. 둘째, **외부 IdP는 SCIM으로 자동 동기화**되어 직원 퇴사 즉시 모든 계정 권한 회수. 셋째, **IDC는 직원, Cognito는 고객** — 절대 헷갈리지 말 것.

Consolidated Billing은 Org 가입만으로 자동 적용되며 RI/SP 공유로 전사 비용 효율을 극대화한다. ABAC + IDC 조합은 100+ 프로젝트 환경에서 IAM 정책 폭증을 막는 표준 패턴.

다음 글에서는 1주차와 같은 형식으로 **Week 2 통합 시나리오 12문항**을 풀어본다. Organizations·SCP·Control Tower·IDC가 한 시나리오에서 동시에 작동하는 Pro 난이도 문제다.

---

## 📝 연습 문제

**문제 1.** 100개 AWS 계정 + Okta IdP + 콘솔/CLI SSO 통합. 가장 적합한?

A) 각 계정에 SAML IdP 등록
B) IAM Identity Center + Okta (SCIM + SAML)
C) Cognito Hosted UI
D) Direct Connect + AD

**정답: B**
해설: 멀티 계정 SSO = IDC. Okta는 SCIM(사용자 동기화) + SAML(인증)로 통합. 100개 계정 일괄 관리. C는 고객용. D는 네트워크 도구.

---

**문제 2.** Permission Set를 계정·그룹에 할당하면?

A) IAM User가 생성됨
B) 해당 계정에 `AWSReservedSSO_*` IAM Role 자동 생성
C) Resource Policy 갱신
D) SCP 생성

**정답: B**
해설: IDC가 백엔드에서 IAM Role을 자동 만든다. 사용자가 SSO 포털에서 계정 선택 시 그 Role을 AssumeRole. Role 이름은 `AWSReservedSSO_<PermissionSet>_<random>` 형식.

---

**문제 3.** B2C 앱의 고객 회원가입·로그인. 어떤 서비스?

A) IAM Identity Center
B) Cognito User Pool
C) IAM User
D) Directory Service

**정답: B**
해설: 고객용 인증은 Cognito. 직원=IDC, 고객=Cognito. 이 한 줄을 절대 헷갈리지 말 것.

---

**문제 4.** Consolidated Billing의 이점이 아닌 것은?

A) RI/SP 공유
B) 볼륨 할인 합산
C) 보안 강화
D) 단일 청구서

**정답: C**
해설: 결제 통합 효과지 보안 자체가 강화되지 않음 (그러나 Org 차원 SCP/CT로는 별도 강화 가능). RI/SP 공유는 기본 ON.

---

**문제 5.** Okta 직원이 퇴사해 권한을 모든 AWS 계정에서 회수해야 한다. 가장 빠른 방법은?

A) 각 계정 IAM User 삭제
B) Okta에서 비활성화 → IDC SCIM 동기화로 자동 회수 (5분 이내)
C) SCP로 차단
D) CloudTrail로 모니터링

**정답: B**
해설: Okta deactivate → SCIM이 IDC에 반영 → Role 액세스 차단. 5분 이내. JIT provisioning이라면 다음 로그인 시도 시점에 동기화되므로 SCIM이 압도적으로 빠름. 2020년 Twilio 사고 같은 phishing 위협에 대응하는 표준 패턴.

---

**문제 6.** IDC 세션 길이를 짧게 (1시간) 두는 이유는?

A) 비용 절감
B) 보안 강화 — 노출 토큰 영향 최소화 (특히 관리자 권한)
C) 성능 향상
D) IAM 정책 단순화

**정답: B**
해설: 짧은 세션 = 토큰 탈취 시 영향 최소화. 관리자 세션은 짧게(1h), 개발자 세션은 보통(4h), ReadOnly는 길게(8h)가 표준. break-glass 패턴과 결합해 평시 PowerUser, 관리 작업 시 일시 Admin.

---

**문제 7.** 한 회사가 100개 프로젝트, 각 프로젝트마다 분리된 S3·EC2. 사용자는 자기 프로젝트 리소스에만 접근. RBAC은 100 Role 폭발. 어떻게?

A) 100개 Permission Set 생성
B) ABAC + IDC (사용자 속성 → 세션 태그 → 리소스 태그 매칭)
C) 100개 OU
D) 100개 계정

**정답: B**
해설: ABAC 표준 패턴. NIST SP 800-162. IdP의 사용자 속성을 IAM Role 세션 태그로 전파. 하나의 정책으로 100개 프로젝트 모두 처리. 신규 프로젝트 추가 시 정책 수정 불필요.

---

**문제 8.** 한 회사가 80개 계정 운영, 야간에 사용 안 하는 부서가 있다. RI 비용 최소화하려면?

A) RI Sharing OFF
B) Consolidated Billing + RI Sharing ON (기본) + Compute Savings Plans
C) On-Demand만
D) Spot만

**정답: B**
해설: RI Sharing ON으로 야간 미사용 RI를 다른 부서가 자동 활용. Compute SP는 EC2·Fargate·Lambda 모두 적용되어 가장 유연. 부서별 비용 정확히 분리하고 싶을 때만 Sharing OFF.
