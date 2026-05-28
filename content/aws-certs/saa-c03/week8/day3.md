# Day 38 - Cognito: 사용자 인증을 클라우드 서비스로 분리하기

자체 회원 시스템을 만들어 본 개발자라면 누구나 알겠지만, 인증·인가는 처음에는 단순해 보이다가 점점 괴물이 되어 가는 영역이다. 처음엔 "이메일 + bcrypt 비밀번호 + JWT"만 있으면 충분한 것 같지만, 곧 비밀번호 정책, 비밀번호 재설정 메일, MFA, 소셜 로그인(Google·Facebook·Apple), 기업 SSO(SAML·Okta·AD), 디바이스 신뢰, 위협 탐지, 로그인 시도 제한, 토큰 갱신, refresh token 회전, GDPR 동의 관리, 세션 만료 같은 요구가 차례차례 쌓인다. 그 결과 자체 회원 시스템 코드가 결제 시스템보다 더 복잡해지고, 보안 사고의 70% 이상이 이 영역에서 터진다.

이 문제를 SaaS로 분리한 게 **identity-as-a-service** 카테고리이고 Auth0(2013), Okta(2009), Firebase Auth(2016) 같은 회사·서비스가 이 시장을 만들었다. AWS는 2014년 7월 모바일 SDK의 일부로 Cognito를 시작했다가 2016년 7월에 현재 형태인 **User Pool**(사용자 디렉터리)와 **Identity Pool**(AWS 자격증명 발급)의 분리 구조를 확정했다. 둘의 분업이 헷갈리는 게 시험·실무 양쪽의 가장 큰 함정이고, "둘 중 어느 하나만 쓰는 케이스"와 "둘을 조합하는 케이스"의 구분이 정확해야 SAA 보안 도메인의 인증·인가 시나리오를 풀 수 있다.

## User Pool vs Identity Pool: 두 개의 풀이 답하는 다른 질문

처음 Cognito를 접하면 가장 헷갈리는 게 "왜 풀이 두 개냐"인데, 두 풀이 답하는 질문이 완전히 다르기 때문이다.

- **User Pool** 은 "이 사용자가 누구인지" 를 다룬다. 회원 가입·로그인·비밀번호 정책·MFA·이메일/SMS 검증·외부 IdP 연합을 처리하고, 성공하면 **JWT(JSON Web Token)** 세 종류(ID Token, Access Token, Refresh Token)를 발급한다. 이 토큰은 우리가 만든 API Gateway·AppSync·ALB 같은 백엔드에서 사용자를 식별하는 데 쓰인다.
- **Identity Pool**(Federated Identities) 은 "이 사용자에게 어떤 AWS 권한을 임시로 줄 것인가" 를 다룬다. User Pool JWT 또는 다른 IdP(Google, Facebook, Apple, SAML) 토큰을 받아 **STS(AssumeRoleWithWebIdentity)** 를 호출하고, 사용자에게 IAM Role의 임시 자격증명을 발급한다. 그러면 모바일 앱이 직접 S3 업로드, DynamoDB 쓰기 같은 AWS API를 호출할 수 있다.

두 풀의 차이를 한 문장으로 정리하면 **"User Pool은 우리 API용 JWT를 만들고, Identity Pool은 AWS API용 임시 자격증명을 만든다"** 이다.

| 차원 | User Pool | Identity Pool |
|------|-----------|--------------|
| 출력 | JWT(ID/Access/Refresh) | STS 임시 자격증명(AccessKey/SecretKey/SessionToken) |
| 호출 대상 | API Gateway / AppSync / ALB / 우리 백엔드 | AWS API(S3, DynamoDB, Kinesis 등) |
| 사용자 저장 | 자체 디렉터리 보유 | 보유 안 함(외부 IdP의 ID를 매핑) |
| 외부 IdP | SAML, OIDC, Google, Facebook | Cognito User Pool, Google, Facebook, Apple, SAML, OIDC, 개발자 인증 |
| MFA | 지원 | 자체 MFA 없음 |
| 가격 | MAU 기반 (월 50,000 MAU 무료) | 거의 무료 (STS 호출만 과금) |

```
[ 가장 흔한 혼합 패턴 ]

Mobile App
   │ 1) Hosted UI 또는 SDK로 로그인
   ▼
User Pool ── (옵션) 외부 IdP 연합 (Google / SAML / Okta)
   │ JWT(ID/Access/Refresh)
   │
   ├─ 2-A) JWT를 API Gateway에 전달 → JWT Authorizer 검증 → Lambda 호출
   │
   └─ 2-B) JWT를 Identity Pool에 넘김
              │ AssumeRoleWithWebIdentity
              ▼
           STS → 임시 자격증명
              │
              ▼
           S3 직접 PUT / DynamoDB 직접 쓰기
```

흔한 실수는 "User Pool만으로 S3 직접 업로드를 시키려는 것"이다. JWT는 우리가 만든 API에서만 유효한 자격증명이고, AWS의 S3 API는 SigV4 서명을 요구하므로 JWT를 그대로 들고 호출할 수 없다. 모바일 클라이언트가 S3를 직접 호출하려면 반드시 Identity Pool을 거쳐 임시 IAM 자격증명을 받아야 한다. 반대로 "Identity Pool만으로 우리 백엔드 인증"도 불가능하다. Identity Pool은 자체 사용자 디렉터리가 없어서 비밀번호 정책·MFA·이메일 검증 같은 게 없다.

> 💡 **관련 이론**: 이 분업은 OAuth2의 "authorization server"(누구인지를 발급)와 "STS"(권한을 임시 위임)의 분리를 그대로 따른다. User Pool은 OAuth2/OIDC 표준의 authorization server 역할이고, Identity Pool은 SAML 진영의 STS와 비슷한 역할을 한다. 둘을 하나로 합쳐버리면 Auth0이나 Firebase Auth처럼 단순해지지만, "AWS 리소스에 IAM Role 단위로 세밀하게 권한 부여"라는 AWS의 핵심 가치를 잃는다.

> 🔍 **더 깊이**: Cognito Identity Pool이 호출하는 STS API는 `AssumeRoleWithWebIdentity`인데, 이건 사실 Cognito 전용이 아니라 OIDC 표준이다. AWS는 GitHub Actions, GitLab CI, Kubernetes Pod(IRSA) 같은 외부 시스템에서도 같은 API를 쓰게 해서 "외부 OIDC IdP의 JWT를 신뢰하고 IAM Role 부여"를 일반화했다. Cognito Identity Pool은 이 패턴을 모바일/웹 SDK로 감싼 wrapper에 가깝다.

## 토큰 3종과 토큰 검증의 함정

User Pool이 발급하는 세 토큰의 역할이 시험에 가장 자주 나온다.

| 토큰 | 형식 | 용도 | 기본 수명 |
|------|------|------|----------|
| ID Token | JWT (서명) | "사용자 = 누구인지" (이름·이메일·custom attributes) | 1시간 (5분~24시간 조정 가능) |
| Access Token | JWT (서명) | "어떤 권한을 가졌는지" (scope, group) | 1시간 |
| Refresh Token | 불투명 문자열 | ID/Access Token 재발급 | 30일 기본 (1시간~10년) |

ID Token은 사용자의 신원(claims)을 담고 백엔드에서 "누구의 요청인지" 식별에 쓴다. Access Token은 OAuth2 표준 토큰으로 권한 범위(scope)와 그룹(cognito:groups)을 담는다. API Gateway의 JWT Authorizer는 둘 다 받을 수 있지만, 일반적으로 Access Token이 표준이다. Refresh Token은 만료된 토큰을 새로 받기 위한 토큰이고, 클라이언트는 이걸 안전하게 보관해야 한다(모바일은 Keychain/Keystore, 웹은 HttpOnly Secure Cookie 권장).

JWT는 클라이언트가 가지고 다니는 토큰이라 "발급 후 변경할 수 없다"는 특성이 있다. 즉 사용자가 권한을 잃었거나 비밀번호를 바꿔도, 이미 발급된 JWT는 만료 전까지 유효하다. 이게 JWT의 가장 큰 함정이고, Cognito가 제공하는 해결책은 두 가지다. ① **토큰 수명을 짧게**(예: 5~15분) 설정하고 frequent refresh. ② **GlobalSignOut API** 로 사용자의 모든 refresh token을 즉시 무효화. 단 GlobalSignOut은 발급된 ID/Access Token까지는 무효화하지 못하므로, 정말 즉시 차단이 필요하면 백엔드에 token blocklist를 두는 추가 레이어가 필요하다.

```
[ JWT 검증 흐름 ]

API Gateway / 백엔드
   │ Authorization: Bearer eyJraWQ...
   │
   ▼
1) 헤더에서 kid 추출
2) Cognito JWKS endpoint 호출 (한 번 fetch + 캐시)
   https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json
3) kid에 해당하는 public key 조회
4) JWT 서명 검증 (RS256)
5) claims 확인:
   - iss = https://cognito-idp.<region>.amazonaws.com/<userPoolId>
   - exp > 현재 시각
   - aud = 우리 앱의 App Client ID
   - token_use = "id" 또는 "access"
```

JWKS endpoint를 매 요청마다 호출하면 안 된다(latency + Cognito 한도). 표준은 "JWKS를 한 번 fetch해 메모리에 캐시하고, kid mismatch 시에만 재조회"다. AWS는 JWKS를 거의 바꾸지 않지만 키 회전이 일어날 수 있어서 "kid를 못 찾으면 한 번 재조회 후 그래도 못 찾으면 에러" 패턴이 권장된다.

> ⚠️ **함정**: 시험에 "API Gateway에서 JWT 검증"이라는 키워드가 보이면, REST API에는 **Cognito User Pool Authorizer**(REST 전용), HTTP API에는 **JWT Authorizer**(범용 OIDC)가 답이다. HTTP API의 JWT Authorizer는 Cognito 외 다른 OIDC IdP(Auth0, Okta)도 받을 수 있어서 더 유연하지만, Cognito 그룹 기반 라우팅 같은 기능은 좀 다르다. 두 API 타입의 차이를 헷갈리지 말 것.

## 외부 IdP 연합: 소셜 로그인부터 엔터프라이즈 SAML까지

User Pool의 가장 강력한 기능 중 하나가 **외부 IdP 연합** 이다. 사용자가 Google이나 Facebook으로 "Sign in with X"로 로그인하면, User Pool이 그 IdP의 토큰을 받아 자체 사용자 디렉터리에 매핑하고 우리만의 JWT를 발급한다. 즉 우리 백엔드는 Google IdP를 직접 통합할 필요 없이 Cognito만 신경 쓰면 된다.

연합 방식은 두 가지다.

- **OIDC**(OpenID Connect): Google, Facebook, Apple, Microsoft 등 대부분의 소셜 로그인. 토큰 형식이 JWT 기반.
- **SAML 2.0**: 기업 SSO 표준. Okta, AD FS, OneLogin, Azure AD가 SAML IdP 역할. 토큰 형식이 XML 기반.

```
[ B2B 엔터프라이즈 SSO 시나리오 ]

Employee (회사 직원)
   │ Hosted UI에서 "Sign in with Company SSO"
   ▼
User Pool (App Client: web-app)
   │ SAML AuthnRequest 생성
   ▼
회사 Okta / Azure AD (SAML IdP)
   │ 사번/비밀번호 + MFA
   │ SAML Assertion (XML)
   ▼
User Pool ── attribute mapping (email, dept, employee_id)
   │ Cognito User 자동 생성/업데이트
   │ JWT 발급
   ▼
앱 / API Gateway
```

엔터프라이즈 SSO 시나리오가 시험에 자주 나오는데, 정답은 거의 항상 "User Pool + 외부 SAML IdP"다. 흔한 함정은 "회사 직원이 사내 시스템에 로그인하는 시나리오에 Identity Pool 단독"을 고르는 것인데, Identity Pool은 자체 디렉터리가 없으니 User Pool이 반드시 앞에 있어야 한다. 또 다른 함정은 "Cognito vs IAM Identity Center" 구분인데, **Cognito는 외부 앱 사용자(customer-facing app), IAM Identity Center는 직원의 AWS 콘솔 SSO** 가 표준 분업이다. "직원이 AWS 콘솔/CLI에 SSO"는 IAM Identity Center, "직원이 우리가 만든 SaaS에 SSO"는 Cognito User Pool + SAML이다.

> 📚 **사례**: 2021년 Okta가 회사를 분리한 Atlassian Confluence 마이그레이션에서 Cognito User Pool + SAML 패턴이 대규모로 쓰였다. 기존 Confluence 자체 인증을 그대로 두면서 새 시스템(AWS 기반)에서도 같은 직원이 SSO로 들어올 수 있게 하기 위해 Cognito가 SAML 어댑터 역할을 했다. 점진적 마이그레이션 패턴으로 회자된다.

## Lambda Triggers: 로그인 흐름에 코드를 끼워 넣기

User Pool의 또 다른 강력한 기능이 **Lambda Triggers** 다. 로그인 흐름의 각 단계(가입 전, 가입 후, 인증 전, 인증 후, 토큰 발급 전 등)에 사용자 정의 Lambda를 호출할 수 있어서, "회사 도메인 이메일만 가입 허용", "로그인 시 사용자 정보를 자체 DB와 동기화", "JWT에 custom claim 추가" 같은 요구를 코드로 처리할 수 있다.

| Trigger | 시점 | 흔한 용도 |
|---------|------|----------|
| PreSignUp | 가입 직전 | 도메인 검증 ("@mycompany.com만 허용"), 외부 IdP 자동 confirm |
| PostConfirmation | 이메일/SMS 검증 완료 후 | 사용자 정보를 DynamoDB에 복제, 환영 메일 발송 |
| PreAuthentication | 로그인 직전 | IP 차단, custom validation |
| PostAuthentication | 로그인 성공 후 | 로그인 이력 기록, 사용자 정보 갱신 |
| PreTokenGeneration | JWT 발급 직전 | custom claim 추가 (예: tenant_id), group 동적 부여 |
| Custom Auth | 비밀번호 없는 인증 흐름 | passwordless, magic link, OTP |
| Migrate User | 기존 시스템에서 점진 이동 | 옛 DB에서 비밀번호 검증 후 Cognito로 이전 |

```python
# PreSignUp Lambda: 회사 도메인 이메일만 허용
def lambda_handler(event, context):
    email = event["request"]["userAttributes"]["email"]
    if not email.endswith("@mycompany.com"):
        raise Exception("Only @mycompany.com emails allowed")
    # 외부 IdP에서 온 사용자는 자동 confirm
    if event["triggerSource"].startswith("PreSignUp_ExternalProvider"):
        event["response"]["autoConfirmUser"] = True
        event["response"]["autoVerifyEmail"] = True
    return event
```

가장 운영적으로 중요한 Trigger는 **Migrate User** 다. 기존 자체 회원 시스템에서 Cognito로 점진적 마이그레이션할 때, 사용자가 처음 Cognito에 로그인 시도하면 Cognito에 사용자가 없다. Migrate User Lambda가 호출되어 옛 DB에서 비밀번호를 검증하고, 성공하면 사용자를 Cognito에 자동 생성한다. 사용자는 비밀번호를 재설정하지 않고도 자연스럽게 Cognito 사용자가 된다. 빅뱅 마이그레이션이 위험한 대규모 서비스에서 거의 표준 패턴이다.

> 🔍 **더 깊이**: PreTokenGeneration Lambda는 multi-tenant SaaS에서 핵심적이다. 사용자가 속한 tenant_id, role, feature flag를 JWT에 custom claim으로 박으면, 백엔드는 별도 DB 조회 없이 JWT만 보고 권한을 결정할 수 있다. 단 JWT 크기가 너무 커지면 HTTP 헤더 한도(8KB 일반적)에 걸리므로, claim을 너무 많이 박지 말고 핵심만 넣는 게 베스트 프랙티스다. 큰 권한 데이터는 백엔드 캐시(예: Redis)에 두고 JWT에는 reference만 두는 패턴이 더 안전하다.

## Advanced Security와 적응형 인증

User Pool의 Advanced Security Features(추가 비용)는 ML 기반 위협 탐지를 제공한다. 핵심 기능 세 가지가 있다.

- **Compromised Credentials Detection**: 사용자가 입력한 비밀번호가 알려진 유출 비밀번호 데이터베이스(Have I Been Pwned 류)에 있는지 확인. 일치하면 가입 차단 또는 강제 변경.
- **Adaptive Authentication**: 로그인 시도의 위험도(IP 평판, 디바이스, 지역, 시간)를 ML로 평가해 risk score(Low/Medium/High)를 매김. 위험도에 따라 MFA를 자동 요구하거나 차단.
- **Risk-based Actions**: risk score별로 자동 동작 설정(예: High면 차단, Medium이면 MFA 요구).

```
[ 적응형 인증 흐름 ]

사용자 로그인 시도
   │ IP, device fingerprint, geolocation
   ▼
Cognito ML 모델
   │ risk score 계산 (Low/Medium/High)
   ├─ Low → 정상 로그인
   ├─ Medium → MFA 추가 요구
   └─ High → 로그인 차단 + 알림
```

MFA 옵션도 세 가지를 지원한다 — SMS, TOTP(Google Authenticator 등), 그리고 2023년 추가된 **WebAuthn/Passkeys**(생체인증, 하드웨어 키). SMS MFA는 비용·SIM swap 공격 위험이 있어 TOTP 또는 WebAuthn이 권장된다.

> ⚠️ **함정**: "사용자 로그인 시 위험도 평가해 MFA 자동 요구" 시나리오에 GuardDuty를 고르는 실수가 많은데, GuardDuty는 AWS 계정/리소스 위협 탐지(VPC Flow, CloudTrail 분석)이지 사용자 로그인 위협 탐지가 아니다. 사용자 인증 위협 탐지는 Cognito Advanced Security다.

## 다른 IdP 서비스와의 비교

Cognito의 설계를 다른 identity 서비스와 나란히 놓으면 trade-off가 선명해진다.

| 서비스 | 모델 | AWS 통합 | 가격 | 운영 부담 |
|--------|------|---------|------|----------|
| **Cognito User Pool** | 사용자 디렉터리 + JWT | 깊음 (API GW/ALB/AppSync 통합) | MAU 기반 (50K 무료) | 낮음 |
| **Cognito Identity Pool** | STS Role 발급 | AWS 자격증명 직접 발급 | 거의 무료 | 낮음 |
| **IAM Identity Center** | 직원 SSO + AWS 콘솔 | AWS 콘솔/CLI 전용 | 무료 (액티브 디렉터리 추가비) | 낮음 |
| **Auth0 / Okta CIC** | identity SaaS | 외부 SaaS 통합 | MAU 기반 (Cognito보다 비쌈) | 매우 낮음 |
| **Firebase Auth** | identity SaaS | Google 생태계 | 무료 + 일부 유료 | 매우 낮음 |
| **자체 구현(Passport.js)** | 코드 직접 | 자유 | 인프라 비용만 | 매우 높음 |
| **Keycloak (자체 운영)** | 오픈소스 OIDC/SAML | 유연 | 인프라 비용 | 높음 |

Cognito의 강점은 AWS 생태계와의 통합(특히 API Gateway JWT Authorizer, AppSync Auth, ALB authentication)과 무료 tier(50K MAU)다. 약점은 Auth0/Okta 대비 UI 커스터마이징 자유도가 떨어지고, Hosted UI가 다소 투박하다는 점이다. 그래서 "최고급 사용자 경험"이 핵심인 SaaS는 Auth0/Okta로 가고, "AWS 생태계 안에서 빠르게 구축"이 우선이면 Cognito가 답이다.

## CLI로 직접 만져보기

```bash
# User Pool 생성 (MFA 옵션, 강한 비밀번호 정책)
aws cognito-idp create-user-pool \
  --pool-name saa-users \
  --mfa-configuration OPTIONAL \
  --auto-verified-attributes email \
  --policies '{"PasswordPolicy":{"MinimumLength":12,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true,"TemporaryPasswordValidityDays":3}}' \
  --schema 'Name=email,AttributeDataType=String,Required=true,Mutable=false' \
  --user-pool-add-ons AdvancedSecurityMode=ENFORCED

# App Client (no secret = SPA/mobile)
aws cognito-idp create-user-pool-client \
  --user-pool-id ap-northeast-2_XXXXXXXXX \
  --client-name web-app \
  --no-generate-secret \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --callback-urls "https://myapp.com/callback" \
  --logout-urls "https://myapp.com/logout" \
  --supported-identity-providers COGNITO Google \
  --token-validity-units '{"AccessToken":"minutes","IdToken":"minutes","RefreshToken":"days"}' \
  --access-token-validity 15 \
  --id-token-validity 15 \
  --refresh-token-validity 30

# 외부 IdP 추가 (Google)
aws cognito-idp create-identity-provider \
  --user-pool-id ap-northeast-2_XXXXXXXXX \
  --provider-name Google \
  --provider-type Google \
  --provider-details '{"client_id":"...","client_secret":"...","authorize_scopes":"openid email profile"}' \
  --attribute-mapping '{"email":"email","name":"name"}'

# Identity Pool 생성 (User Pool 토큰만 허용)
aws cognito-identity create-identity-pool \
  --identity-pool-name saa-id-pool \
  --no-allow-unauthenticated-identities \
  --cognito-identity-providers ProviderName=cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_XXXXXXXXX,ClientId=YYYYYYYYY

# Identity Pool에 IAM Role 매핑
aws cognito-identity set-identity-pool-roles \
  --identity-pool-id ap-northeast-2:zzzzzzzz \
  --roles authenticated=arn:aws:iam::111:role/CognitoAuthRole

# 토큰 검증용 JWKS endpoint
curl https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_XXXXXXXXX/.well-known/jwks.json

# 강제 로그아웃 (사용자의 모든 refresh token 무효화)
aws cognito-idp admin-user-global-sign-out \
  --user-pool-id ap-northeast-2_XXXXXXXXX \
  --username user@example.com
```

## 정리하며

Cognito의 핵심은 **User Pool(누구인지 + JWT) ↔ Identity Pool(AWS Role 임시 위임)** 의 분리다. 두 풀이 답하는 질문이 다르고, 모바일이 S3에 직접 업로드 같은 시나리오는 둘을 조합해야 한다. JWT는 발급 후 즉시 무효화가 어려우니 짧은 수명 + refresh 패턴이 표준이고, GlobalSignOut으로 refresh token만 차단할 수 있다. 외부 IdP 연합은 User Pool에 OIDC(소셜) 또는 SAML(기업) IdP를 추가하면 되고, B2B 엔터프라이즈 SSO 시나리오의 정답은 거의 항상 "User Pool + SAML IdP"다. Lambda Triggers로 로그인 흐름에 사용자 정의 코드를 끼워 넣을 수 있고, Migrate User Trigger는 기존 시스템에서 점진적 마이그레이션의 표준 도구다. Advanced Security는 ML 기반 위협 탐지 + 적응형 MFA를 제공한다.

다음 글에서는 사용자 인증 이후의 보안 — 외부에서 들어오는 공격을 탐지·차단하는 서비스들(WAF, Shield, GuardDuty, Inspector, Macie, Security Hub)을 본다. Cognito가 "정당한 사용자가 들어오는 길"을 다룬다면 다음 주제는 "악의적인 트래픽이 들어오는 길"을 다루고, 둘을 합쳐야 완성된 보안 도메인이 된다.

---

## 📝 연습 문제

**문제 1.** 한 모바일 앱이 인증된 사용자에게 S3 버킷에 직접 이미지를 업로드할 권한을 임시로 부여해야 한다. 가장 적합한 솔루션은?

A) User Pool 단독 + S3 presigned URL
B) Identity Pool로 STS Role 부여 + S3 직접 업로드 (User Pool + Identity Pool 조합 권장)
C) IAM 사용자 키를 앱에 박기
D) S3 버킷 정책으로 Public Write 허용

**정답: B**

해설: 모바일이 S3 API를 직접 호출하려면 SigV4 서명 가능한 IAM 자격증명이 필요하고, 이걸 발급하는 게 Identity Pool이다. 사용자 인증은 User Pool로 처리하고 그 JWT를 Identity Pool에 넘겨 STS AssumeRoleWithWebIdentity로 임시 자격증명을 받는 게 표준 흐름이다. A의 presigned URL도 가능하지만 "직접 업로드 권한"이라는 요구에는 Identity Pool이 맞다. C는 보안 최악, D는 데이터 유출.

---

**문제 2.** 한 회사가 SaaS 앱에 직원이 회사 Okta SAML SSO로 로그인하게 만들고 싶다. 가장 적합한 구성은?

A) IAM Identity Center
B) Cognito User Pool에 SAML IdP로 Okta 등록
C) Cognito Identity Pool 단독
D) ALB authentication + OIDC

**정답: B**

해설: "사용자가 SaaS 앱에 SSO" 시나리오는 Cognito User Pool + 외부 SAML IdP(Okta/Azure AD/AD FS)가 표준이다. IAM Identity Center(A)는 직원이 AWS 콘솔/CLI에 SSO하는 용도이지 외부 앱 사용자 인증용이 아니다. C는 사용자 디렉터리가 없으므로 단독 불가. D는 ALB 앞단 인증으로 일부 가능하지만 일반 SaaS 인증 패턴은 User Pool + SAML이 정석.

---

**문제 3.** 한 API Gateway HTTP API가 Cognito User Pool 발급 JWT를 검증해야 한다. 가장 적합한 방식은?

A) Lambda Authorizer로 매 요청마다 직접 검증
B) JWT Authorizer 구성 (Cognito User Pool issuer + Audience 지정)
C) IAM Auth 사용
D) API Key 사용

**정답: B**

해설: HTTP API에는 JWT Authorizer가 네이티브로 있고, Cognito User Pool의 issuer URL과 App Client ID(audience)를 설정하면 자동으로 JWKS 캐시 + 서명 검증 + claim 확인을 처리한다. Lambda Authorizer(A)는 가능하지만 직접 JWKS 캐시·검증 코드를 작성해야 해 부담이 크다. C·D는 JWT 검증과 무관.

---

**문제 4.** 한 사용자가 비밀번호 유출이 의심된다. 이 사용자의 모든 활성 세션을 즉시 끊고 싶다. 가장 적절한 조치는?

A) User Pool 삭제 후 재생성
B) AdminUserGlobalSignOut으로 refresh token 무효화 + 비밀번호 강제 변경
C) 백엔드 코드만 재배포
D) 사용자에게 이메일로 안내만 발송

**정답: B**

해설: AdminUserGlobalSignOut은 해당 사용자의 모든 refresh token을 즉시 무효화한다. 단 이미 발급된 ID/Access Token은 만료 전까지 유효하므로, 토큰 수명이 짧을수록(예: 5~15분) 빠르게 차단된다. 추가로 비밀번호 강제 변경으로 재로그인 시 새 비밀번호를 요구하게 한다. 정말 즉시 차단이 필요하면 백엔드에 token blocklist 레이어를 추가로 두는 게 표준이다.

---

**문제 5.** 한 회사가 회원 가입 시 회사 도메인 이메일(`@mycompany.com`)만 허용하려 한다. 가장 적절한 방식은?

A) PreSignUp Lambda Trigger에서 이메일 도메인 검증, 일치하지 않으면 예외
B) IAM 정책으로 차단
C) PostAuthentication Lambda Trigger
D) 사용자에게 안내 메시지만 표시

**정답: A**

해설: PreSignUp Lambda Trigger는 가입 직전에 호출되므로 이메일 도메인을 검증하고 조건에 맞지 않으면 예외를 던져 가입을 막을 수 있다. B는 사용자 가입 흐름에 영향 못 줌. C는 인증 후라 가입은 이미 완료. D는 강제력 없음. 외부 IdP에서 들어온 사용자도 PreSignUp이 호출되므로 동일하게 차단 가능하다.

---

**문제 6.** 한 SaaS가 기존 자체 회원 시스템(MySQL + bcrypt)에서 Cognito User Pool로 점진적 마이그레이션을 하려 한다. 사용자가 비밀번호를 재설정하지 않고 자연스럽게 옮겨 가게 하려면?

A) Migrate User Lambda Trigger로 첫 로그인 시 옛 DB에서 검증 후 Cognito에 자동 생성
B) 모든 사용자에게 비밀번호 재설정 메일 발송
C) 자체 시스템 그대로 유지
D) IAM 사용자로 모두 생성

**정답: A**

해설: Migrate User Trigger는 이 시나리오를 위해 설계됐다. 사용자가 처음 Cognito에 로그인 시도하면 Cognito에 사용자가 없으므로 Migrate User Lambda가 호출되고, Lambda는 옛 DB에서 bcrypt 비교로 비밀번호를 검증한 뒤 성공하면 Cognito에 사용자를 자동 생성한다. 사용자는 비밀번호 재설정 없이 자연스럽게 Cognito로 넘어간다. 빅뱅 마이그레이션이 위험한 대규모 서비스의 표준 패턴.

---

**문제 7.** 한 회사가 위험한 IP·지역·디바이스에서의 로그인 시도에 자동으로 MFA를 요구하고 싶다. 가장 적합한 기능은?

A) GuardDuty
B) Cognito Advanced Security Features의 Adaptive Authentication
C) WAF Rate-based Rule
D) IAM MFA 정책

**정답: B**

해설: Cognito Advanced Security의 Adaptive Authentication은 로그인 시도의 위험도를 ML로 평가해 risk score를 매기고, Medium 이상이면 자동으로 MFA를 추가 요구하거나 High면 차단한다. GuardDuty(A)는 AWS 계정/리소스 위협 탐지이지 사용자 인증 위협 탐지가 아니다. C는 트래픽 속도 제한, D는 IAM 사용자(직원)용이지 앱 사용자용이 아니다.

---

해설 보강: Cognito는 시험에서 "User Pool vs Identity Pool 구분"이 가장 자주 함정이다. 사용자 인증·JWT 발급이면 User Pool, AWS API 직접 호출용 자격증명이면 Identity Pool, 둘 다 필요하면 조합. 외부 SSO(SAML/OIDC)는 User Pool에 IdP 추가가 정답이고, IAM Identity Center는 직원의 AWS 콘솔 SSO 전용이라는 분업을 정확히 기억할 것.
