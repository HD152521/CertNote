# Day 3 - IAM 심화: STS, 정책 평가 로직, 권한 경계

📅 날짜: Week 1 (Day 3)
🎯 주제: IAM의 의사결정 흐름과 임시 자격증명
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- IAM 정책 평가 로직(Explicit Deny → Allow → 암묵적 Deny)을 설명한다
- STS 4대 AssumeRole API를 구분한다
- Permission Boundary, SCP, Session Policy의 차이를 안다

---

## 🧩 사전 지식 (CS 기초)

- **Deny-by-default**: 명시 허용이 없으면 거부. AWS IAM의 기본.
- **임시 자격증명**: 만료 시간이 있는 토큰. STS가 발급.
- **연합(Federation)**: 외부 IdP(예: AD, Google, SAML)와 신뢰 관계 맺기.
- **OIDC**: OAuth2 기반 ID 토큰. EKS Service Account ↔ IAM Role 매핑에 사용.
- **권한 상한선(Boundary)**: "여기까지만"이라는 천장. 부여가 아니라 제한.

---

## 📖 이론 내용

### 1. IAM 정책 평가 흐름

```
  Request → 1) Explicit Deny 있나? → 있으면 즉시 Deny
            2) SCP/Boundary가 허용 못함? → 즉시 Deny
            3) Explicit Allow 있나? → 있으면 Allow
            4) 그 외 → 암묵적 Deny
```

> ⭐ **명시적 Deny가 항상 이긴다.** Allow 100개가 있어도 Deny 하나면 끝.

다중 정책이 있을 때 평가 순서:
1. 같은 계정 내: Identity + Resource + SCP + Boundary + Session 모두 Allow + 어떤 Deny도 없어야 통과
2. 크로스 계정: 양쪽 계정 모두 Allow 필요 (one side allow는 부족)

### 2. STS — 임시 자격증명 4총사

| API | 용도 |
|-----|------|
| **AssumeRole** | 같은/다른 계정의 Role 빌리기 (기본) |
| **AssumeRoleWithSAML** | SAML 2.0 IdP(예: AD FS, Okta SAML) 연동 |
| **AssumeRoleWithWebIdentity** | OIDC IdP(Google, Facebook, Cognito) 연동. EKS IRSA의 핵심 |
| **GetFederationToken** | IAM 사용자 자격으로 임시 토큰 발급 (콘솔 SSO 미지원) |
| **GetSessionToken** | MFA 강제용. 단기 토큰 |

기본 만료: AssumeRole 1시간(15분~12시간 설정 가능), GetSessionToken 12시간(루트는 1시간).

### 3. 권한 경계 (Permission Boundary)

- User/Role의 **최대 권한 천장**.
- 부여하는 게 아니라 **상한**을 만든다.
- 시나리오: 개발자가 IAM 작업은 가능하되, 자기보다 강한 권한을 만들 수 없게 함.

### 4. SCP (Service Control Policy)

- Organizations의 OU/계정 단위 **천장**.
- 계정의 모든 사용자/Role에 적용.
- **루트 사용자도 우회 못함**.
- Allow를 주는 게 아님(허용 목록만 만든다).

### 5. IAM Access Analyzer

- 외부에 노출된 리소스 자동 감지 (S3, IAM Role, KMS, Lambda, SQS, Secrets Manager, EBS Snapshot 등)
- 사용 안 한 권한 분석 → 최소권한 추천

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **SCP** | Organizations 천장 | 회사 전체 보안 가드레일 |
| **Permission Boundary** | 사용자/Role 천장 | 위임된 관리자 시나리오 |
| **Session Policy** | AssumeRole 시 부여 | 임시로 더 좁히기 |
| **ABAC (태그 기반)** | 사용자 태그 = 리소스 태그면 허용 | 멀티프로젝트 / 멀티팀 확장성 |
| **Cross-account Role** | 계정 A의 Role을 계정 B 사용자가 AssumeRole | 콘솔 Switch Role |
| **IRSA (EKS)** | OIDC + AssumeRoleWithWebIdentity | EKS Pod별 IAM 권한 |

> ⚠️ **함정**: "사용자에게 admin 권한이 있는데 작업 실패" → ① SCP에 막혔는지 ② Permission Boundary에 막혔는지 ③ 리소스 정책이 명시 Deny인지 ④ 키 정책(KMS)이 막는지.

> 💡 **암기 팁**: Boundary는 *부여가 아니다, 천장이다*. SCP는 *조직 천장*, Boundary는 *사용자 천장*, Session Policy는 *세션 천장*.

### 관련 서비스 Cross-Reference

- SCP → **Day 4 Organizations**
- KMS 키 정책 평가 → **Week 8**
- S3 + 계정 간 정책 → **Week 4**
- EKS IRSA → **Week 6 컨테이너**

---

## 🏗️ 아키텍처 다이어그램

```
[ 정책 평가 천장 구조 ]

   조직 SCP   ────────────────────────  Org 천장
        ↓
   Permission Boundary  ────────────── User/Role 천장
        ↓
   Identity Policy  ─────────────────── 실제 부여
        ↓
   Session Policy  ─────────────────── 세션 동안 천장
        ↓
   Resource Policy  ────────────────── 리소스 쪽 허용

   ※ Allow는 모든 충(層)의 교집합. Deny는 어디서 나와도 차단.


[ Cross-Account AssumeRole 흐름 ]

  Account A (Dev)
   └─ User: dev1
        │  sts:AssumeRole
        ▼
  Account B (Prod)
   └─ Role: ReadOnlyAuditor
        ├─ Trust: principal = arn:aws:iam::A:user/dev1
        └─ Permission: ec2:Describe*, s3:List*
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Explicit Deny가 항상 이긴다.** 한 정책이라도 Deny면 즉시 거부.
2. ⭐ **SCP는 천장 / Boundary는 천장 / Session Policy는 천장.** 셋 다 부여 아님.
3. ⭐ **STS는 임시 자격증명.** EC2 Role도 내부적으로 STS 사용.
4. ⭐ **Cross-Account**: 양쪽 계정 모두 허용이 있어야 한다.
5. ⭐ **OIDC = EKS IRSA / SAML = AD/Okta 엔터프라이즈 연동.**

---

## 💻 실제 예시 - AWS CLI

```bash
# 다른 계정의 Role을 AssumeRole
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ReadOnlyAuditor \
  --role-session-name dev1-session \
  --duration-seconds 3600

# 결과의 임시 키로 환경 변수 설정 후 호출
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
aws s3 ls

# IAM Access Analyzer 분석기 생성
aws accessanalyzer create-analyzer \
  --analyzer-name org-public-finder --type ACCOUNT
```

**출력 예시:**
```
{
  "Credentials": {
    "AccessKeyId": "ASIA...",
    "SecretAccessKey": "...",
    "SessionToken": "...",
    "Expiration": "2026-06-01T12:00:00Z"
  },
  "AssumedRoleUser": {
    "Arn": "arn:aws:sts::111122223333:assumed-role/ReadOnlyAuditor/dev1-session"
  }
}
```

---

## 📝 연습 문제

**문제 1.** 한 사용자에게 AdministratorAccess가 부여되어 있는데 EC2 종료 시도가 거부된다. 원인으로 가장 가능성 높은 것은?

A) IAM 사용자에게 MFA가 비활성화됨
B) SCP에 ec2:TerminateInstances Deny가 걸려 있음
C) EC2 보안 그룹이 차단함
D) 키 페어가 만료됨

**정답: B**
해설: 계정 전체 SCP는 천장이라 IAM Admin도 막을 수 있다. Boundary나 명시 Deny 정책도 후보.

---

**문제 2.** EKS Pod별로 IAM 권한을 분리해서 부여하려면 가장 적합한 STS API는?

A) AssumeRole
B) AssumeRoleWithSAML
C) AssumeRoleWithWebIdentity (OIDC)
D) GetSessionToken

**정답: C**
해설: EKS IRSA는 ServiceAccount의 OIDC 토큰으로 AssumeRoleWithWebIdentity 호출.

---

**문제 3.** 회사가 위임된 관리자(개발팀 리더)에게 IAM 사용자 생성 권한은 주되, 그 사용자가 admin 권한을 가지지 못하게 막고 싶다. 가장 적절한 도구는?

A) SCP
B) Permission Boundary
C) Session Policy
D) MFA

**정답: B**
해설: Boundary는 사용자/Role의 최대 권한을 천장으로 막는다. SCP도 가능하나 사용자 단위 위임 시나리오는 Boundary가 정답.

---

**문제 4.** Cross-account S3 접근에 대한 설명으로 옳은 것은?

A) 한쪽 계정만 허용해도 동작한다
B) 양쪽 계정 모두 허용 필요 (Identity + Resource)
C) Organizations 가입 필요
D) STS 사용 불가

**정답: B**
해설: 크로스 계정은 양쪽 계정 모두 명시 허용이 있어야 한다.

---

**문제 5.** IAM Access Analyzer가 탐지할 수 있는 항목이 아닌 것은?

A) 외부에 노출된 S3 버킷
B) 외부에 노출된 IAM Role
C) 사용되지 않는 권한
D) EC2 보안 그룹의 0.0.0.0/0 규칙

**정답: D**
해설: SG 분석은 별도 도구(Trusted Advisor, Inspector). Access Analyzer는 리소스 기반 정책의 외부 노출 + 미사용 권한 분석.

---

## 📌 오늘의 요약

1. 평가 흐름: Explicit Deny → SCP/Boundary 통과 → Explicit Allow → 암묵 Deny.
2. STS는 임시 자격증명. EC2 Role, EKS IRSA, SAML 연동 등 모든 임시 인증의 중심.
3. SCP/Boundary/Session Policy는 부여가 아니라 **천장**.
4. 크로스 계정 접근은 양쪽 모두 허용 필요.
5. Access Analyzer = 외부 노출 + 미사용 권한 탐지.
