# Day 3 - Cognito: Why Authentication and Authorization Split Into Two Pools

Almost every developer building web and mobile apps hits the same sequence of mistakes: first hardcoding passwords plaintext in user tables, learning hashing and using bcrypt, then implementing password reset, email verification, MFA, social login, token expiry, refresh-token rotation — eventually asking "why am I building all this?" Authentication and authorization are security's most fragile domains; homegrown systems almost always have gaps somewhere. Amazon Cognito manages this entire "don't build it yourself" realm as a service.

Cognito is tricky in DVA-C02 because **two separate components (User Pool and Identity Pool) coexist with confusing names**. They solve completely different problems — User Pool "handles login and issues identity JWT," while Identity Pool "swaps that identity JWT for AWS resource access credentials (IAM temporary credentials)." Understanding this split solves most Cognito questions. This article explores why they separated, what each of the three JWT types does, and how Lambda triggers extend the auth flow.

## Authentication and Authorization Are Different Problems, So Two Pools

OAuth and OpenID Connect study hits a core concept: **authentication and authorization differ**. **Authentication** is "is this person really user@example.com?" **Authorization** is "can this person write to S3?" Issuing a passport (authentication) and issuing a visa (authorization) are different acts.

Cognito split these two into separate services.

| Aspect | User Pool | Identity Pool |
|------|-----------|---------------|
| Solves | Authentication (who are you?) | Authorization (what can you access?) |
| Input | username/password, social login | User Pool JWT (or external IdP token) |
| Output | **JWT tokens** (3 types) | **IAM temporary credentials** (STS) |
| Used For | API Gateway auth, user directory | S3·DynamoDB SDK direct access |
| Guest | No | Yes (unauthenticated role) |

> 💡 **Related theory**: This reflects the structure of the OAuth 2.0 / OIDC specs. OIDC says "ID Token proves identity"; OAuth 2.0 says "Access Token authorizes resource access" — they're separate specs because they're separate concerns. User Pool acts as OIDC IdP (issuer of identity), Identity Pool as token-to-AWS-credential exchanger. AWS physically split them so "JWT-only apps" use User Pool alone, while "direct AWS resource access" apps add Identity Pool. This design lets each component do one thing well.

> ⚠️ **Trap**: The most frequent exam trap swaps these two. "Mobile app uploads files to S3 directly" needs **Identity Pool** (JWT → IAM credential → S3 direct access). User Pool JWT alone cannot call S3 SDK — JWT is an ID card, not AWS credentials. Conversely, "user login/signup + API Gateway token validation" is **User Pool**.

## Three JWTs: ID Card, Access Ticket, Refresh Right

User Pool login success returns three token types. Distinguishing them is frequent on exams.

| Token | Contents | Purpose | Default Expiry |
|------|-----------|---------|----------|
| **ID Token** | User identity (sub, email, name, groups) | "Prove this person's identity" | 1 hour |
| **Access Token** | OAuth scope, user identifier | "What actions are authorized?" | 1 hour |
| **Refresh Token** | (opaque) | Renew ID/Access tokens | 30 days (configurable 1 day–10 years) |

```json
// ID Token payload (decoded)
{
  "sub": "a1b2c3d4-...",
  "email": "user@example.com",
  "cognito:groups": ["Admin"],
  "iss": "https://cognito-idp.ap-northeast-2.amazonaws.com/<poolId>",
  "aud": "<appClientId>",
  "token_use": "id",
  "exp": 1721000000
}
```

> 🔍 **Going deeper**: JWT (JSON Web Token) is `Header.Payload.Signature` — three Base64URL parts joined by dots. Header and payload are **just encoding, not encryption** — anyone can decode and read. Security comes from Signature. Cognito signs with RS256 (RSA asymmetric) using a private key, and verifiers get the public key from Cognito's published JWKS (`/.well-known/jwks.json`) to verify. Asymmetry means verifiers need only the public key; Cognito holds the private key alone. So "can I put a password in JWT?" is a firm No — payload is plaintext-readable. Putting sensitive data there exposes it. The `token_use` claim ("id" vs "access") matters for validation.

> ⚠️ **Trap**: API Gateway's **Cognito Authorizer** defaults to **ID Token**, while HTTP API's **JWT Authorizer** typically validates **Access Token** (scope-aware). This token-type difference is exam gold. REST API + Cognito Authorizer = ID Token; HTTP API + JWT Authorizer = Access Token. Token mismatch fails validation.

## User Pool Auth Flow: SRP Doesn't Send Passwords Over Network

User Pool supports multiple auth flows; the recommended `USER_SRP_AUTH` never transmits the password itself.

| Flow | Behavior |
|------|------|
| **USER_SRP_AUTH**(recommended) | SRP protocol — password never sent over network |
| **USER_PASSWORD_AUTH** | Password sent directly (TLS required), legacy-migration only |
| **ADMIN_USER_PASSWORD_AUTH** | Backend (admin-privileged) auth |
| **REFRESH_TOKEN_AUTH** | Refresh token to renew ID/Access tokens |
| **CUSTOM_AUTH** | Lambda trigger defines custom challenge |

> 💡 **Related theory**: SRP (Secure Remote Password) is a **PAKE (Password-Authenticated Key Exchange)** from 1998 Stanford. The core idea: client and server prove they share a password without ever exchanging it — based on discrete-log math. Server stores only a verifier, not the password itself — even if server DB is breached, passwords don't leak directly. TLS already encrypts transmission, but SRP defends even if the TLS termination point (load balancer, proxy) momentarily sees plaintext. Defense in depth: multiple independent layers.

## Lambda Triggers: Inject Code Into the Auth Lifecycle

Cognito's real flexibility comes from embedding Lambda at key points in authentication. Eleven trigger types exist; exam asks "which trigger at which point?"

| Trigger | When | Common Use |
|--------|------|-----------|
| `PreSignUp` | Before signup completes | Email domain validation, auto-approve |
| `PostConfirmation` | After email/SMS confirmation | Add user to app DB, welcome email |
| `PreAuthentication` | At login attempt | Blocklist check |
| `PostAuthentication` | After login success | Audit log, record last login |
| `PreTokenGeneration` | Before JWT generation | Add custom claims, inject groups |
| `DefineAuthChallenge` etc | Custom auth flow | OTP, CAPTCHA challenges |
| `UserMigration` | At login/password reset | Gradual migration from legacy IdP |
| `CustomMessage` | Before message send | Customize email/SMS text |

```python
# PreSignUp trigger — corporate-email-only signup + auto-approve
def lambda_handler(event, context):
    email = event['request']['userAttributes'].get('email', '')
    if not email.endswith('@mycompany.com'):
        raise Exception("Company email only.")
    # Auto-approve corporate domain without email verification
    event['response']['autoConfirmUser'] = True
    event['response']['autoVerifyEmail'] = True
    return event   # Must return event for flow to continue
```

> 🔍 **Going deeper**: `UserMigration` trigger enables **seamless migration from legacy auth to Cognito without downtime**. Instead of bulk-importing all users, on first Cognito login attempt, Cognito calls UserMigration Lambda. Lambda tries authenticating with the old system; if successful, instantly creates that user in User Pool. Users self-migrate one login at a time — no mass password resets, no big-bang cutover. Old system slowly empties as users log in. This "usage-driven gradual migration" beats "cutover migration" every time.

> 📚 **Case study**: A team put all user permissions in ID Token claims, making the JWT 8KB+. Some browsers and proxies enforce 8KB header-size limits — requests started failing with 401 intermittently. JWTs travel in headers per-request, so claims must stay minimal — IDs and groups, with heavy permission data looked up server-side. Tokens are ID cards, not permission databases.

## Identity Pool: Converting JWT to AWS Credentials in Two Steps

Even with User Pool JWT, you cannot call S3 or DynamoDB SDK — AWS SDK requires IAM credentials. Identity Pool bridges this in two steps.

```python
import boto3
ci = boto3.client('cognito-identity')

# 1) GetId — present JWT, receive Identity ID
logins = {'cognito-idp.ap-northeast-2.amazonaws.com/<poolId>': id_token}
identity_id = ci.get_id(IdentityPoolId='ap-northeast-2:<poolId>', Logins=logins)['IdentityId']

# 2) GetCredentialsForIdentity — get STS temporary credentials
creds = ci.get_credentials_for_identity(IdentityId=identity_id, Logins=logins)['Credentials']

# Now call S3 directly with IAM credentials
s3 = boto3.client('s3',
    aws_access_key_id=creds['AccessKeyId'],
    aws_secret_access_key=creds['SecretKey'],
    aws_session_token=creds['SessionToken'])
```

> 🔍 **Going deeper**: Internally, Identity Pool credentials issue via STS `AssumeRoleWithWebIdentity`. Present a web identity token (JWT), STS validates it and assumes an IAM role mapped to Identity Pool, returning temporary credentials. The key is **role mapping** — all authenticated users get the same role (Default), or JWT claims split them across different roles (Rules-based or `cognito:preferred_role` Token-based). For example, Admin group → AdminRole, regular users → UserRole, letting you split S3 prefix or DynamoDB access per group within the same app. This is how "group info in JWT becomes IAM permissions."

Guest (unauthenticated) access is Identity Pool-only. Issue unauth-role creds to unauthenticated users for limited read-only S3 access, etc.

## External IdP Federation

User Pool can host its own user directory, but it can also federate external IdPs (Google, Facebook, Apple, SAML 2.0, OIDC). When a user logs in via Google, that identity mirrors into User Pool (just-in-time provisioning), and the app receives a normal Cognito JWT — the app sees one consistent token interface regardless of login source.

> 💡 **Related theory**: This "unified token interface across multiple IdPs" is the essence of **federation**. Without federation, apps handle Google, Apple, and custom login each differently — code explodes by N. With User Pool as broker, the app handles one token type. You can mix SAML (enterprise SSO) and OIDC (social) in one pool, supporting B2B and B2C simultaneously — User Pool abstracts the identity source.

## Wrapping Up

Cognito splits into two because authentication and authorization are different. User Pool handles login and issues three JWT types (identity, access, refresh), while Identity Pool exchanges JWT for STS temporary credentials for AWS resource access. JWT is Base64-encoded plaintext (no encryption), so never put secrets in it. Eleven Lambda triggers extend the auth lifecycle. Identity Pool role mapping turns JWT claims into IAM permissions — this architecture is exam trap bedrock.

Next we look at the defense layer **before requests reach the app** — WAF, Shield, ACM — which guard traffic at the edge.

---

## 📝 연습 문제

**문제 1.** Mobile app user logs in via Cognito, then uploads photos to their S3 folder directly. Correct flow?

A) Pass User Pool ID Token to S3 Authorization header without SigV4
B) User Pool login → Identity Pool JWT exchange → IAM temporary credentials → S3 direct access
C) All uploads route through Lambda proxy; Lambda's role calls S3 on behalf
D) Require API Gateway + Cognito Authorizer backend; no direct S3 access

**정答: B**

해설: User Pool JWT alone cannot call S3 SDK — AWS SDK requires IAM credentials. Swap JWT for Identity Pool IAM temp credentials, then call S3 directly. Role mapping splits user folders by ID. A) S3 does not recognize JWT; it expects SigV4 IAM signature. C·D) Possible but miss the "direct access" requirement. Identity Pool = "JWT → IAM credentials → direct AWS access."

---

**문제 2.** API Gateway **REST API** with Cognito Authorizer requires which token type?

A) Refresh Token
B) Access Token
C) ID Token
D) IAM temporary credentials

**정答: C**

해설: REST API Cognito Authorizer defaults to **ID Token** (user identity attributes). HTTP API's JWT Authorizer typically validates Access Token (scope-aware). This difference is exam gold. A) Refresh Token renews; not used for direct API auth. D) IAM credentials come from Identity Pool, not Authorizer validation.

---

**문제 3.** Signup must accept only @mycompany.com email and auto-approve. Which trigger?

A) `PostAuthentication` Lambda
B) `PreSignUp` Lambda
C) Identity Pool role mapping
D) API Gateway Authorizer

**정答: B**

해설: `PreSignUp` runs **before** signup completes, can validate domain and set `autoConfirmUser`/`autoVerifyEmail`. A) PostAuthentication is post-login, not signup validation. C) Role mapping splits permissions, not signup. D) Authorizer validates API requests, not signup.

---

**문제 4.** Can you put passwords or other sensitive data in JWT ID Token?

A) Yes, JWT is encrypted and safe
B) No; JWT payload is Base64, anyone can decode — secrets expose plaintext
C) Yes, but only in Access Token
D) No; JWT is 100-byte limited

**정答: B**

해説: JWT is `Header.Payload.Signature`, where header/payload are **Base64-only** (encoding, not encryption) — anyone decodes to plaintext. Only Signature (RS256) is secure. So sensitive data leaks if added. Keep tokens to IDs and groups; backend looks up heavy permission data. Tokens are ID cards, not databases.

---

**문제 5.** Migrate legacy auth users to Cognito without downtime. Best method?

A) CSV import all users at once
B) `UserMigration` Lambda — first login auto-migrates from legacy system
C) `PreTokenGeneration` trigger
D) Identity Pool guest access

**正답: B**

해説: `UserMigration` fires when "user not found" — Lambda tries legacy auth; on success, creates user in User Pool on the spot. Users self-migrate one login at a time — no downtime, no bulk reset. A) CSV import cannot move passwords; all users must reset. C) PreTokenGeneration customizes claims, not migration. D) Guest roles unrelated.

---

**문제 6.** Identity Pool admin role, regular users role split. Implementation?

A) User Pool MFA setting
B) Identity Pool role mapping (Rules-based or Token-based)
C) PreSignUp trigger
D) KMS Grant

**정答: B**

해說: Identity Pool role mapping checks JWT claims like `cognito:groups` and assumes different IAM roles per group — Admin → AdminRole, Users → UserRole. S3 prefix access then varies by role. A) MFA strengthens auth, not permission split. C) PreSignUp is signup validation. D) KMS is for key permissions.

---

**문제 7.** User Pool supports Google, Apple, self login. What token does the app receive?

A) Varying formats per IdP; app must branch
B) Same Cognito JWT regardless of IdP source (federation abstraction)
C) Social login returns provider token; self login returns JWT
D) No tokens; IdP auth only

**正答: B**

해説: Federated IdPs mirror into User Pool (JIT provisioning). App always receives **same Cognito JWT** structure — IdP source abstracted away. SAML + OIDC + custom all become one token interface.
