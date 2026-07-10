# Day 3 - Cognito: Peeling User Authentication Off Into a Cloud Service

Any developer who has built their own membership system knows the feeling: authentication and authorization look simple at first, then slowly grow into a monster. In the beginning it seems like "email + bcrypt password + JWT" is all you need, but soon the demands pile up one after another — password policies, password-reset emails, MFA, social login (Google, Facebook, Apple), enterprise SSO (SAML, Okta, AD), device trust, threat detection, login attempt throttling, token refresh, refresh-token rotation, GDPR consent management, session expiry. The result is that your homegrown auth code ends up more complex than your payment system, and over 70% of security incidents blow up right here.

The category that split this problem out into SaaS is **identity-as-a-service**, and companies/services like Auth0 (2013), Okta (2009), and Firebase Auth (2016) built this market. AWS started Cognito in July 2014 as part of the mobile SDK, then in July 2016 locked in its current shape — the split between **User Pool** (a user directory) and **Identity Pool** (issuing AWS credentials). The division of labor between the two is the single biggest trap on both the exam and the job, and you can only solve SAA's security-domain authn/authz scenarios if you're precise about the difference between "cases that use only one of them" and "cases that combine both."

## User Pool vs Identity Pool: Two Pools Answering Different Questions

The first thing that confuses people when they meet Cognito is "why are there two pools?" — and it's because the two pools answer completely different questions.

- **User Pool** deals with "who is this user?" It handles sign-up, sign-in, password policy, MFA, email/SMS verification, and external IdP federation, and on success it issues three kinds of **JWTs (JSON Web Tokens)** — ID Token, Access Token, Refresh Token. These tokens are used by *your* backend — API Gateway, AppSync, ALB — to identify the user.
- **Identity Pool** (Federated Identities) deals with "what AWS permissions do we temporarily grant this user?" It takes a User Pool JWT or a token from another IdP (Google, Facebook, Apple, SAML), calls **STS (`AssumeRoleWithWebIdentity`)**, and hands the user temporary credentials for an IAM Role. That lets a mobile app call AWS APIs directly — S3 uploads, DynamoDB writes, and so on.

If you boil the difference down to one sentence: **"User Pool mints JWTs for your API; Identity Pool mints temporary credentials for AWS APIs."**

| Dimension | User Pool | Identity Pool |
|------|-----------|--------------|
| Output | JWT (ID/Access/Refresh) | STS temporary credentials (AccessKey/SecretKey/SessionToken) |
| Called by | API Gateway / AppSync / ALB / your backend | AWS APIs (S3, DynamoDB, Kinesis, etc.) |
| User storage | Has its own directory | None (maps identities from an external IdP) |
| External IdP | SAML, OIDC, Google, Facebook | Cognito User Pool, Google, Facebook, Apple, SAML, OIDC, Developer Authenticated Identities |
| MFA | Supported | No MFA of its own |
| Pricing | MAU-based (first 50,000 MAU/month free) | Nearly free (charged only for STS calls) |

```
[ The most common combined pattern ]

Mobile App
   │ 1) Sign in via Hosted UI or SDK
   ▼
User Pool ── (optional) external IdP federation (Google / SAML / Okta)
   │ JWT (ID/Access/Refresh)
   │
   ├─ 2-A) Pass JWT to API Gateway → JWT Authorizer verifies → invoke Lambda
   │
   └─ 2-B) Hand JWT to Identity Pool
              │ AssumeRoleWithWebIdentity
              ▼
           STS → temporary credentials
              │
              ▼
           Direct S3 PUT / direct DynamoDB write
```

A common mistake is "trying to do direct S3 uploads with User Pool alone." A JWT is a credential that's only valid against the API *you* built, and AWS's S3 API requires a SigV4 signature — so you can't just carry a JWT and call it. For a mobile client to call S3 directly, it must go through an Identity Pool to get temporary IAM credentials. Conversely, "authenticating your backend with Identity Pool alone" is also impossible. Identity Pool has no user directory of its own, so there's no password policy, no MFA, no email verification.

> 💡 **Related theory**: This division of labor follows OAuth2's separation between the "authorization server" (which issues who-you-are) and "STS" (which temporarily delegates permissions). User Pool plays the OAuth2/OIDC authorization-server role, while Identity Pool plays a role similar to STS in the SAML world. Merge the two into one and you get something as simple as Auth0 or Firebase Auth — but you lose AWS's core value proposition: "fine-grained permission granting to AWS resources at the IAM Role level."

> 🔍 **Going deeper**: The STS API that a Cognito Identity Pool calls is `AssumeRoleWithWebIdentity`, and this is actually not Cognito-specific — it's an OIDC standard. AWS lets external systems like GitHub Actions, GitLab CI, and Kubernetes Pods (IRSA) use the same API, generalizing the pattern of "trust a JWT from an external OIDC IdP and grant an IAM Role." A Cognito Identity Pool is closer to a wrapper that packages this pattern behind a mobile/web SDK.

## The Three Tokens and the Traps of Token Verification

The roles of the three tokens a User Pool issues come up most often on the exam.

| Token | Format | Purpose | Default lifetime |
|------|------|------|----------|
| ID Token | JWT (signed) | "Who the user is" (name, email, custom attributes) | 1 hour (tunable 5 min – 24 hours) |
| Access Token | JWT (signed) | "What permissions they hold" (scope, group) | 1 hour |
| Refresh Token | Opaque string | Reissue ID/Access Tokens | 30 days default (1 hour – 10 years) |

The ID Token carries the user's identity (claims) and is used by the backend to identify "whose request is this." The Access Token is the OAuth2-standard token and carries permission scopes and groups (`cognito:groups`). API Gateway's JWT Authorizer can accept either, but the Access Token is the standard choice. The Refresh Token is the token used to obtain fresh tokens once they expire, and the client must store it securely (Keychain/Keystore on mobile, an HttpOnly Secure Cookie on the web are recommended).

Because a JWT is a token the client carries around, it has the property that "it can't be changed after issuance." That is, even if a user loses permissions or changes their password, an already-issued JWT stays valid until it expires. This is the biggest trap of JWTs, and Cognito offers two remedies. ① Set **short token lifetimes** (e.g., 5–15 minutes) with frequent refresh. ② Use the **GlobalSignOut API** to immediately invalidate all of a user's refresh tokens. Note that GlobalSignOut cannot invalidate already-issued ID/Access Tokens — so if you truly need instant cutoff, you need an extra layer: a token blocklist at the backend.

```
[ JWT verification flow ]

API Gateway / backend
   │ Authorization: Bearer eyJraWQ...
   │
   ▼
1) Extract kid from the header
2) Call the Cognito JWKS endpoint (fetch once + cache)
   https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json
3) Look up the public key matching the kid
4) Verify the JWT signature (RS256)
5) Check claims:
   - iss = https://cognito-idp.<region>.amazonaws.com/<userPoolId>
   - exp > current time
   - aud = your app's App Client ID
   - token_use = "id" or "access"
```

Don't call the JWKS endpoint on every request (latency + Cognito limits). The standard is "fetch the JWKS once, cache it in memory, and re-fetch only on a kid mismatch." AWS almost never changes the JWKS, but key rotation can happen, so the recommended pattern is "if you can't find the kid, re-fetch once, and if you still can't find it, error out."

> ⚠️ **Pitfall**: When you see the keyword "JWT verification at API Gateway" on the exam, the answer is a **Cognito User Pool Authorizer** for REST APIs (REST-only) and a **JWT Authorizer** for HTTP APIs (general OIDC). The HTTP API's JWT Authorizer can also accept other OIDC IdPs beyond Cognito (Auth0, Okta), making it more flexible, but features like Cognito group-based routing work a bit differently. Don't confuse the two API types.

## External IdP Federation: From Social Login to Enterprise SAML

One of User Pool's most powerful features is **external IdP federation**. When a user signs in with "Sign in with X" via Google or Facebook, User Pool receives that IdP's token, maps it into its own user directory, and issues *your own* JWT. In other words, your backend doesn't have to integrate the Google IdP directly — it only has to care about Cognito.

There are two federation modes.

- **OIDC** (OpenID Connect): most social logins — Google, Facebook, Apple, Microsoft, etc. Token format is JWT-based.
- **SAML 2.0**: the enterprise SSO standard. Okta, AD FS, OneLogin, and Azure AD act as SAML IdPs. Token format is XML-based.

```
[ B2B enterprise SSO scenario ]

Employee (company staff)
   │ "Sign in with Company SSO" in the Hosted UI
   ▼
User Pool (App Client: web-app)
   │ Generate SAML AuthnRequest
   ▼
Company Okta / Azure AD (SAML IdP)
   │ Employee ID/password + MFA
   │ SAML Assertion (XML)
   ▼
User Pool ── attribute mapping (email, dept, employee_id)
   │ Auto-create/update Cognito User
   │ Issue JWT
   ▼
App / API Gateway
```

Enterprise SSO scenarios show up frequently on the exam, and the answer is almost always "User Pool + external SAML IdP." A common trap is choosing "Identity Pool alone" for a scenario where "company employees log into an internal system" — but Identity Pool has no directory of its own, so a User Pool must always sit in front of it. Another trap is the "Cognito vs IAM Identity Center" distinction: the standard division of labor is **Cognito for external app users (customer-facing apps), IAM Identity Center for employee SSO into the AWS console**. "Employees SSO into the AWS console/CLI" is IAM Identity Center; "employees SSO into the SaaS we built" is Cognito User Pool + SAML.

> 📚 **Case study**: In the 2021 Atlassian Confluence migration where Okta split off a company, the Cognito User Pool + SAML pattern was used at scale. To leave the existing Confluence's own authentication in place while letting the same employees also come into the new (AWS-based) system via SSO, Cognito acted as the SAML adapter. It's frequently cited as a pattern for gradual migration.

## Lambda Triggers: Injecting Code Into the Login Flow

Another powerful User Pool feature is **Lambda Triggers**. You can invoke a custom Lambda at each stage of the login flow (before sign-up, after sign-up, before authentication, after authentication, before token generation, etc.), letting you handle demands like "only allow company-domain emails to sign up," "sync user info to your own DB on login," or "add a custom claim to the JWT" in code.

| Trigger | When it fires | Common uses |
|---------|------|----------|
| PreSignUp | Just before sign-up | Domain validation ("only allow @mycompany.com"), auto-confirm external IdP users |
| PostConfirmation | After email/SMS verification | Replicate user info to DynamoDB, send a welcome email |
| PreAuthentication | Just before login | IP blocking, custom validation |
| PostAuthentication | After successful login | Record login history, refresh user info |
| PreTokenGeneration | Just before JWT issuance | Add custom claims (e.g., tenant_id), dynamically assign groups |
| Custom Auth | Passwordless auth flows | passwordless, magic link, OTP |
| Migrate User | Gradual move from an existing system | Verify the password against the old DB, then migrate the user to Cognito |

```python
# PreSignUp Lambda: only allow company-domain emails
def lambda_handler(event, context):
    email = event["request"]["userAttributes"]["email"]
    if not email.endswith("@mycompany.com"):
        raise Exception("Only @mycompany.com emails allowed")
    # auto-confirm users coming from an external IdP
    if event["triggerSource"].startswith("PreSignUp_ExternalProvider"):
        event["response"]["autoConfirmUser"] = True
        event["response"]["autoVerifyEmail"] = True
    return event
```

The most operationally important trigger is **Migrate User**. When you're gradually migrating from an existing homegrown membership system to Cognito, the first time a user tries to log into Cognito, the user doesn't exist there yet. The Migrate User Lambda is invoked, verifies the password against the old DB, and on success auto-creates the user in Cognito. The user becomes a Cognito user naturally, without ever having to reset their password. It's practically the standard pattern for large-scale services where a big-bang migration is too risky.

> 🔍 **Going deeper**: The PreTokenGeneration Lambda is central in multi-tenant SaaS. If you stamp the user's tenant_id, role, and feature flags into the JWT as custom claims, the backend can decide permissions from the JWT alone, with no separate DB lookup. Just be aware that if the JWT grows too large it can hit HTTP header limits (commonly 8KB), so the best practice is not to stuff too many claims — include only the essentials. A safer pattern for large permission data is to keep it in a backend cache (e.g., Redis) and put only a reference in the JWT.

## Advanced Security and Adaptive Authentication

User Pool's Advanced Security Features (extra cost) provide ML-based threat detection. There are three core capabilities.

- **Compromised Credentials Detection**: checks whether the password a user entered appears in a known breached-password database (Have I Been Pwned and the like). On a match, block sign-up or force a change.
- **Adaptive Authentication**: uses ML to evaluate the risk of a login attempt (IP reputation, device, region, time) and assigns a risk score (Low/Medium/High). Based on the risk, it automatically requires MFA or blocks.
- **Risk-based Actions**: configure automatic actions per risk score (e.g., block on High, require MFA on Medium).

```
[ Adaptive authentication flow ]

User login attempt
   │ IP, device fingerprint, geolocation
   ▼
Cognito ML model
   │ compute risk score (Low/Medium/High)
   ├─ Low → normal login
   ├─ Medium → require additional MFA
   └─ High → block login + alert
```

MFA options come in three flavors too — SMS, TOTP (Google Authenticator and the like), and, added in 2023, **WebAuthn/Passkeys** (biometrics, hardware keys). SMS MFA carries cost and SIM-swap attack risk, so TOTP or WebAuthn is recommended.

> ⚠️ **Pitfall**: Many people mistakenly pick GuardDuty for the "evaluate login risk and auto-require MFA" scenario, but GuardDuty is AWS account/resource threat detection (analyzing VPC Flow, CloudTrail) — not user-login threat detection. User-authentication threat detection is Cognito Advanced Security.

## Comparison With Other IdP Services

Placing Cognito's design side by side with other identity services makes the trade-offs sharp.

| Service | Model | AWS integration | Pricing | Operational burden |
|--------|------|---------|------|----------|
| **Cognito User Pool** | User directory + JWT | Deep (API GW/ALB/AppSync integration) | MAU-based (50K free) | Low |
| **Cognito Identity Pool** | Issues STS Roles | Issues AWS credentials directly | Nearly free | Low |
| **IAM Identity Center** | Employee SSO + AWS console | AWS console/CLI only | Free (extra cost for Active Directory) | Low |
| **Auth0 / Okta CIC** | Identity SaaS | External SaaS integration | MAU-based (pricier than Cognito) | Very low |
| **Firebase Auth** | Identity SaaS | Google ecosystem | Free + some paid | Very low |
| **Roll your own (Passport.js)** | Hand-written code | Total freedom | Infra cost only | Very high |
| **Keycloak (self-hosted)** | Open-source OIDC/SAML | Flexible | Infra cost | High |

Cognito's strengths are its integration with the AWS ecosystem (especially API Gateway JWT Authorizer, AppSync Auth, and ALB authentication) and its free tier (50K MAU). Its weaknesses are that UI customization is less free than Auth0/Okta, and the Hosted UI is somewhat rough around the edges. So a SaaS where "top-tier user experience" is the crux goes to Auth0/Okta, while "building fast inside the AWS ecosystem" points to Cognito.

## Getting Hands-On With the CLI

```bash
# Create a User Pool (MFA optional, strong password policy)
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

# Add an external IdP (Google)
aws cognito-idp create-identity-provider \
  --user-pool-id ap-northeast-2_XXXXXXXXX \
  --provider-name Google \
  --provider-type Google \
  --provider-details '{"client_id":"...","client_secret":"...","authorize_scopes":"openid email profile"}' \
  --attribute-mapping '{"email":"email","name":"name"}'

# Create an Identity Pool (accept User Pool tokens only)
aws cognito-identity create-identity-pool \
  --identity-pool-name saa-id-pool \
  --no-allow-unauthenticated-identities \
  --cognito-identity-providers ProviderName=cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_XXXXXXXXX,ClientId=YYYYYYYYY

# Map IAM Roles to the Identity Pool
aws cognito-identity set-identity-pool-roles \
  --identity-pool-id ap-northeast-2:zzzzzzzz \
  --roles authenticated=arn:aws:iam::111:role/CognitoAuthRole

# JWKS endpoint for token verification
curl https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_XXXXXXXXX/.well-known/jwks.json

# Force sign-out (invalidate all of a user's refresh tokens)
aws cognito-idp admin-user-global-sign-out \
  --user-pool-id ap-northeast-2_XXXXXXXXX \
  --username user@example.com
```

## Wrapping Up

The core of Cognito is the split between **User Pool (who you are + JWT) ↔ Identity Pool (temporary delegation of an AWS Role)**. The two pools answer different questions, and scenarios like "a mobile app uploading directly to S3" require combining both. A JWT is hard to invalidate instantly after issuance, so the standard is short lifetimes + a refresh pattern, with GlobalSignOut able to cut off only refresh tokens. For external IdP federation, you just add an OIDC (social) or SAML (enterprise) IdP to the User Pool, and the answer to B2B enterprise SSO scenarios is almost always "User Pool + SAML IdP." Lambda Triggers let you inject custom code into the login flow, and the Migrate User trigger is the standard tool for gradual migration from an existing system. Advanced Security provides ML-based threat detection + adaptive MFA.

In the next article we'll look at security *after* user authentication — the services that detect and block attacks coming in from outside (WAF, Shield, GuardDuty, Inspector, Macie, Security Hub). If Cognito handles "the path legitimate users come in by," the next topic handles "the path malicious traffic comes in by," and you need both together to make a complete security domain.

---

## 📝 연습 문제

**문제 1.** A mobile app needs to temporarily grant authenticated users permission to upload images directly to an S3 bucket. What is the most suitable solution?

A) User Pool alone + S3 presigned URL
B) Grant an STS Role via Identity Pool + direct S3 upload (User Pool + Identity Pool combination recommended)
C) Bake IAM user keys into the app
D) Allow Public Write via the S3 bucket policy

**정답: B**

해설: For a mobile client to call the S3 API directly, it needs IAM credentials capable of SigV4 signing, and Identity Pool is what issues those. The standard flow is to handle user authentication with User Pool and hand that JWT to Identity Pool to get temporary credentials via STS `AssumeRoleWithWebIdentity`. The presigned URL in A is also possible, but for a requirement of "direct upload permission," Identity Pool is the fit. C is a security disaster, and D is a data leak.

---

**문제 2.** A company wants its employees to log into a SaaS app via the company's Okta SAML SSO. What is the most suitable configuration?

A) IAM Identity Center
B) Register Okta as a SAML IdP in a Cognito User Pool
C) Cognito Identity Pool alone
D) ALB authentication + OIDC

**정답: B**

해설: The "users SSO into a SaaS app" scenario is standardly Cognito User Pool + an external SAML IdP (Okta/Azure AD/AD FS). IAM Identity Center (A) is for employees to SSO into the AWS console/CLI, not for authenticating external app users. C can't stand alone because it has no user directory. D is partially possible as front-of-ALB authentication, but the canonical SaaS auth pattern is User Pool + SAML.

---

**문제 3.** An API Gateway HTTP API needs to verify JWTs issued by a Cognito User Pool. What is the most suitable approach?

A) Verify directly on every request with a Lambda Authorizer
B) Configure a JWT Authorizer (specify the Cognito User Pool issuer + Audience)
C) Use IAM Auth
D) Use an API Key

**정답: B**

해설: HTTP APIs have a native JWT Authorizer, and if you set the Cognito User Pool's issuer URL and App Client ID (audience), it automatically handles JWKS caching + signature verification + claim checks. A Lambda Authorizer (A) is possible but burdensome because you'd have to write the JWKS caching and verification code yourself. C and D are unrelated to JWT verification.

---

**문제 4.** A user's password is suspected to be compromised. You want to immediately terminate all of that user's active sessions. What is the most appropriate action?

A) Delete and recreate the User Pool
B) Invalidate refresh tokens with AdminUserGlobalSignOut + force a password change
C) Just redeploy the backend code
D) Just send the user an email notice

**정답: B**

해설: AdminUserGlobalSignOut immediately invalidates all of that user's refresh tokens. However, already-issued ID/Access Tokens remain valid until they expire, so the shorter the token lifetime (e.g., 5–15 minutes), the faster the cutoff. Additionally, forcing a password change requires a new password on the next login. If you truly need instant cutoff, the standard is to add a token blocklist layer at the backend as well.

---

**문제 5.** A company wants to allow only company-domain emails (`@mycompany.com`) at sign-up. What is the most appropriate approach?

A) Validate the email domain in a PreSignUp Lambda Trigger and throw an exception on mismatch
B) Block it with an IAM policy
C) A PostAuthentication Lambda Trigger
D) Just show the user an informational message

**정답: A**

해설: A PreSignUp Lambda Trigger is invoked right before sign-up, so it can validate the email domain and throw an exception to block sign-up when it doesn't match. B can't affect the user sign-up flow. C runs after authentication, so sign-up is already complete. D has no enforcement power. Users coming in from an external IdP also invoke PreSignUp, so you can block them the same way.

---

**문제 6.** A SaaS wants to gradually migrate from its existing homegrown membership system (MySQL + bcrypt) to a Cognito User Pool. How can users move over naturally without resetting their passwords?

A) Use a Migrate User Lambda Trigger to verify against the old DB on first login and auto-create in Cognito
B) Send a password-reset email to all users
C) Keep the homegrown system as-is
D) Create everyone as IAM users

**정답: A**

해설: The Migrate User Trigger was designed for exactly this scenario. The first time a user tries to log into Cognito, the user doesn't exist there, so the Migrate User Lambda is invoked; the Lambda verifies the password with a bcrypt comparison against the old DB and, on success, auto-creates the user in Cognito. The user moves over to Cognito naturally without a password reset. It's the standard pattern for large-scale services where a big-bang migration is too risky.

---

**문제 7.** A company wants to automatically require MFA for login attempts from risky IPs, regions, or devices. What is the most suitable feature?

A) GuardDuty
B) Adaptive Authentication in Cognito Advanced Security Features
C) A WAF Rate-based Rule
D) An IAM MFA policy

**정답: B**

해설: Adaptive Authentication in Cognito Advanced Security uses ML to evaluate the risk of a login attempt, assigns a risk score, and automatically requires additional MFA at Medium or above (or blocks at High). GuardDuty (A) is AWS account/resource threat detection, not user-authentication threat detection. C is traffic rate limiting, and D is for IAM users (employees), not app users.

---

해설 보강: On the exam, Cognito's most frequent trap is the "User Pool vs Identity Pool distinction." User authentication and JWT issuance → User Pool; credentials for calling AWS APIs directly → Identity Pool; need both → combine them. For external SSO (SAML/OIDC), adding the IdP to the User Pool is the answer, and remember the precise division of labor: IAM Identity Center is exclusively for employee SSO into the AWS console.
