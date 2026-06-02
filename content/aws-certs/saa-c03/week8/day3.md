# Day 38 - Cognito: User Pool, Identity Pool

📅 날짜: Week 8 (Day 3)
🎯 주제: 사용자 인증/인가
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- User Pool vs Identity Pool 차이를 안다
- 외부 IdP / Federation 흐름을 이해한다
- AppSync / API Gateway와의 연동을 안다

---

## 🧩 사전 지식 (CS 기초)

- **OIDC / OAuth2**: JWT 토큰 기반 인증·인가. ID Token / Access Token / Refresh Token.
- **SAML**: 엔터프라이즈 SSO 프로토콜.
- **Hosted UI**: AWS가 제공하는 로그인 페이지 위젯.
- **TIA (Token Identity Assertion)**: 토큰으로 자기 신원을 증명.

---

## 📖 이론 내용

### 1. User Pool

- **사용자 디렉터리** (가입·로그인·MFA·암호 정책·이메일/SMS 확인).
- **JWT 발급** (ID/Access/Refresh).
- **외부 IdP 연합**: SAML(엔터프라이즈) / OIDC(Google/Facebook 등).
- **App Client + Hosted UI** 옵션.
- **Lambda Triggers**: PreSignUp, PreAuthentication, PostAuthentication 등.

### 2. Identity Pool (Federated Identities)

- **AWS 자격증명 발급** (Cognito Identity).
- 인증/비인증 사용자에게 IAM Role을 임시 부여 (STS).
- User Pool 토큰이나 다른 IdP 토큰을 받아 STS로 교환.

### 3. 두 풀의 흐름

```
[User Pool 단독] — 사용자 등록·로그인·JWT 발급
   App → User Pool 로그인 → JWT → API Gateway / AppSync

[Identity Pool 단독] — AWS 리소스에 직접 호출
   App → External IdP (Google) → Identity Pool → IAM Role → S3 직접

[혼합] — 가장 흔함
   App → User Pool 로그인 → JWT → Identity Pool → IAM Role → AWS API
```

### 4. 보안 옵션

- **MFA** (SMS / TOTP / WebAuthn).
- **Adaptive Authentication**(위험 점수).
- **Advanced Security** (위협 탐지, 위험 액션).
- **Compromised Credentials Check**.

### 5. 토큰 종류

| 토큰 | 용도 | 수명 |
|------|------|------|
| **ID Token** | 사용자 정보(JWT) | 1시간 디폴트 |
| **Access Token** | 리소스 호출 | 1시간 |
| **Refresh Token** | 재발급 | 30일 디폴트 |

### 6. AWS 통합

- **API Gateway**: Cognito User Pool Authorizer / JWT Authorizer (HTTP API).
- **AppSync**: Cognito Auth.
- **ALB**: Cognito 인증 통합(엔터프라이즈 SSO).

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **User Pool 그룹** | 그룹별 IAM Role 매핑 | 권한 분리 |
| **Custom Attributes** | 가입 시 추가 필드 | 사용자 프로필 |
| **Device Tracking** | 디바이스 기억 | UX |
| **Migration Trigger** | 기존 디렉터리 마이그레이션 | 점진 전환 |
| **SecretHash** | App Client Secret 사용 시 필수 | 함정 |

> ⚠️ **함정**: "B2B 엔터프라이즈 SSO(AD/Okta SAML)" + 모바일 → User Pool에 IdP로 SAML 연합 ✅.

> 💡 **암기 팁**: 로그인·JWT = User Pool / AWS Role 부여 = Identity Pool.

### 관련 서비스 Cross-Reference

- API GW JWT Authorizer → Week 6
- IAM Role + STS → Week 1
- IAM Identity Center vs Cognito → Cognito는 앱 사용자 / Identity Center는 직원

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 모바일 앱 ]

  Mobile App
    │ Hosted UI 로그인
    ▼
  Cognito User Pool ── (옵션) Google/SAML 연합
    │ JWT (ID/Access)
    ▼
  API Gateway (JWT Authorizer) → Lambda → DDB

[ S3 직접 접근 ]

  Mobile App → User Pool 로그인 → Identity Pool
                                    │ STS AssumeRoleWithWebIdentity
                                    ▼
                                 IAM Role
                                    │
                                    ▼
                                  S3 / DynamoDB 등
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **User Pool = 디렉터리·JWT** / **Identity Pool = AWS Role 발급**.
2. ⭐ 외부 IdP 연합은 User Pool에 IdP 설정.
3. ⭐ MFA / Advanced Security로 강화.
4. ⭐ API GW(JWT) / AppSync / ALB와 통합.
5. ⭐ B2B SSO도 User Pool + SAML.

---

## 💻 실제 예시 - AWS CLI

```bash
# User Pool 생성
aws cognito-idp create-user-pool --pool-name saa-users \
  --mfa-configuration OPTIONAL \
  --policies 'PasswordPolicy={MinimumLength=12,RequireUppercase=true,RequireNumbers=true,RequireSymbols=true}'

# App Client
aws cognito-idp create-user-pool-client --user-pool-id ... \
  --client-name web --no-generate-secret \
  --allowed-o-auth-flows code --allowed-o-auth-scopes openid email

# Identity Pool
aws cognito-identity create-identity-pool --identity-pool-name saa-id \
  --allow-unauthenticated-identities false \
  --cognito-identity-providers ProviderName=cognito-idp.ap-northeast-2.amazonaws.com/POOL,ClientId=CLIENT
```

---

## 📝 연습 문제

**문제 1.** 모바일 사용자가 S3에 직접 업로드, IAM Role 임시 부여:

A) User Pool 단독 B) Identity Pool C) IAM 사용자 D) Lambda Authorizer

**정답: B**.

---

**문제 2.** API GW HTTP API에 JWT 검증:

A) Lambda Authorizer만 B) JWT Authorizer(Cognito User Pool) C) API Key D) IAM

**정답: B**.

---

**문제 3.** 회사 직원 AD/Okta로 사용자 앱 로그인:

A) IAM Identity Center B) User Pool + SAML IdP C) Identity Pool 단독 D) Cognito Sync

**정답: B**.

---

**문제 4.** 사용자 가입 시 회사 이메일만 허용:

A) PostAuthentication Lambda B) PreSignUp Lambda Trigger C) Identity Pool 정책 D) IAM

**정답: B**.

---

**문제 5.** User Pool ↔ Identity Pool 통합 흐름:

A) User Pool JWT → Identity Pool → STS Role B) Identity Pool 토큰 → User Pool C) 직접 STS만 D) IAM 사용자 키

**정답: A**.

---

## 📌 오늘의 요약

1. User Pool = 디렉터리·로그인·JWT.
2. Identity Pool = STS Role 발급.
3. SAML/OIDC 연합도 User Pool에 설정.
4. MFA / Advanced Security / Lambda Triggers로 보안 강화.
5. API GW(JWT) / AppSync / ALB와 표준 통합.
