# Day 9 - IAM Identity Center, Permission Set, 통합 결제

📅 날짜: Week 2 (Day 4)
🎯 주제: 멀티 계정 SSO·권한 세트·청구 통합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- IAM Identity Center (구 AWS SSO)의 구조와 흐름을 안다
- Permission Set와 Group의 관계를 이해한다
- 외부 IdP(Okta, Azure AD) 통합 패턴을 안다
- Consolidated Billing의 효과와 한계를 안다

---

## 🧩 사전 지식 (CS 기초)

- **SSO (Single Sign-On)**: 한 번 로그인으로 여러 서비스 접근.
- **SCIM (System for Cross-domain Identity Management)**: 사용자·그룹 자동 동기화 표준.
- **Permission Set**: AWS Identity Center 고유 개념 — 권한 묶음 + 계정별 자동 IAM Role 생성.
- **Just-in-Time Provisioning**: 사용자 첫 로그인 시 자동 계정 권한 부여.

---

## 📖 이론 내용

### 1. IAM Identity Center 개요

- 구 이름: AWS Single Sign-On (AWS SSO)
- **멀티 계정 SSO 표준 솔루션** (Pro 시험 단골)
- AWS Org와 통합
- 자체 디렉터리 또는 외부 IdP(Okta, Azure AD, Google Workspace, AD) 통합
- 콘솔 + CLI(v2) 모두 지원

### 2. 핵심 구성 요소

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
        (Role 자동 생성)
```

### 3. Permission Set 구조

- AWS Managed Policy + Customer Managed Policy + Inline Policy 조합
- Account+Group+Permission Set 매핑 시 **자동으로 그 계정에 IAM Role 생성** (`AWSReservedSSO_<PermissionSet>_<random>`)
- 세션 길이 1~12시간 설정
- Permission Boundary 부착 가능

**대표 Permission Set 예시**:
- `AdministratorAccess` (전체 권한)
- `PowerUserAccess` (IAM·결제 제외)
- `ReadOnlyAccess`
- `Billing`
- `DataScientist` (S3, SageMaker, Athena 등)

### 4. 사용자 → 계정 매핑 흐름

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
콘솔 또는 CLI 사용
```

### 5. 외부 IdP 통합

| IdP | 사용자 동기화 |
|-----|----------------|
| **Okta** | SCIM 자동 동기화 |
| **Azure AD / Entra ID** | SCIM |
| **Google Workspace** | SCIM 또는 SAML만 |
| **AWS Managed Microsoft AD** | 직접 통합 |
| **AD Connector** | 온프레미스 AD 연결 |

> ⚠️ **함정**: "온프레미스 AD 사용 + AWS 콘솔 SSO" → AD Connector 또는 AWS Managed AD + IAM Identity Center.

### 6. CLI v2 SSO 흐름

```bash
aws configure sso
# Start URL: https://d-xxxx.awsapps.com/start
# Region: ap-northeast-2
# 브라우저 자동 열림 → 인증
# 계정·역할 선택
# Profile 이름 저장
```

이후:
```bash
aws s3 ls --profile dev-account
# 자동으로 SSO 토큰 사용
```

### 7. Consolidated Billing

- Org Management 계정이 모든 멤버 계정의 청구 합산
- **RI·Savings Plans 공유** — 안 쓴 SP를 다른 계정이 사용
- **데이터 전송 등급 할인** 합산
- 단일 청구서 + 비용 카테고리·태그 기반 분리

> 💡 **암기**: Org 가입만으로 자동 적용. 별도 설정 X.

**한계**:
- 멤버 계정에서 결제 정보·청구서 못 봄 (관리 계정에서 IAM 권한 부여 필요)
- 환불·크레딧은 Org Management로 일원화

---

## 🧠 알아두면 좋은 심화 이론

### Attribute-Based Access Control (ABAC) + IDC

- IDC가 IdP의 사용자 속성(예: Department, CostCenter)을 SAML Attribute로 전파
- IAM Role 세션 태그 → 리소스 태그 매칭으로 동적 권한
- 신규 사용자 추가 시 권한 매핑 변경 필요 없음 → 확장성

### IAM Identity Center vs Cognito

| | IDC | Cognito |
|---|-----|---------|
| 대상 | **직원·관리자** (콘솔·CLI) | **고객 사용자** (앱 회원가입) |
| 사용처 | 멀티 계정 SSO | 소셜 로그인, 앱 인증 |

> ⚠️ **함정**: 직원=IDC, 고객=Cognito. 헷갈리지 말 것.

### Cross-Reference

- **Week 10 (Day 1)**: Week 1 복습
- **Week 11**: 보안 거버넌스 — IDC 로그도 CloudTrail에 기록

---

## 🏗️ 아키텍처 다이어그램 — Okta + IDC + Org

```
Okta
 │   - HR 시스템과 SCIM 연동
 │   - "developers" 그룹: 100명
 │
 ▼ SAML + SCIM
IAM Identity Center (Management Account)
 │   Group: developers → Permission Set: DevOps (시간 4h)
 │   Group: admins      → Permission Set: AdminAccess (시간 1h, MFA)
 │
 ├── App-A-Prod 계정 ── AWSReservedSSO_DevOps_xxxx Role 자동
 ├── App-A-Dev 계정  ── AWSReservedSSO_DevOps_xxxx Role 자동
 └── App-B-Prod 계정 ── AWSReservedSSO_AdminAccess_xxxx Role 자동
```

---

## ⭐ 핵심 포인트

1. ⭐ **IDC가 멀티 계정 SSO 표준 정답**
2. ⭐ Permission Set = 권한 묶음 + 자동 IAM Role 생성
3. ⭐ Okta/Azure AD/Entra/Google → **SCIM** 사용자 동기화
4. ⭐ IDC = 직원·관리자 / **Cognito = 고객 사용자**
5. ⭐ Consolidated Billing은 Org 가입만으로 자동, RI/SP 공유 효과

---

## 💻 실제 예시 - Permission Set 만들기

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
```

---

## 📝 연습 문제

**문제 1.** 100개 AWS 계정 + Okta IdP + 콘솔/CLI SSO 통합. 가장 적합한?

A) 각 계정에 SAML IdP
B) IAM Identity Center + Okta (SCIM + SAML)
C) Cognito Hosted UI
D) Direct Connect + AD

**정답: B**
해설: 멀티 계정 SSO = IDC. Okta는 SCIM/SAML로 통합.

---

**문제 2.** Permission Set를 계정·그룹에 할당하면?

A) IAM User가 생성됨
B) 해당 계정에 `AWSReservedSSO_*` IAM Role 자동 생성
C) Resource Policy 갱신
D) SCP 생성

**정답: B**
해설: IDC가 백엔드에서 IAM Role을 자동 만든다.

---

**문제 3.** B2C 앱의 고객 회원가입·로그인. 어떤 서비스?

A) IAM Identity Center
B) Cognito User Pool
C) IAM User
D) Directory Service

**정답: B**
해설: 고객용 인증은 Cognito.

---

**문제 4.** Consolidated Billing의 이점이 아닌 것은?

A) RI/SP 공유
B) 볼륨 할인 합산
C) 보안 강화
D) 단일 청구서

**정답: C**
해설: 결제 통합 효과지 보안 자체가 강화되지 않음 (그러나 Org 차원 SCP/CT로는 별도 강화 가능).

---

**문제 5.** Okta 직원이 퇴사해 권한을 모든 AWS 계정에서 회수해야 한다. 가장 빠른 방법은?

A) 각 계정 IAM User 삭제
B) Okta에서 비활성화 → IDC SCIM 동기화로 자동 회수
C) SCP로 차단
D) CloudTrail로 모니터링

**정답: B**
해설: Okta deactivate → SCIM이 IDC에 반영 → Role 액세스 차단.

---

**문제 6.** IDC 세션 길이를 짧게 (1시간) 두는 이유는?

A) 비용 절감
B) 보안 강화 — 노출 토큰 영향 최소화 (특히 관리자)
C) 성능 향상
D) IAM 정책 단순화

**정답: B**
해설: 짧은 세션 = 토큰 탈취 시 영향 최소화. 관리자 세션은 짧게.

---

## 📌 오늘의 요약

1. IAM Identity Center = 멀티 계정 SSO 표준
2. Permission Set + 그룹 매핑 시 IAM Role 자동 생성
3. Okta/Azure AD/Entra → SCIM으로 사용자·그룹 동기화
4. IDC=직원, Cognito=고객
5. Consolidated Billing은 Org 가입만으로 자동, RI/SP 공유
