# Day 5 - Week 9 Recap: Security Is Not One Setting but a Stack of Layers

Over five days we've seen KMS, Secrets Manager, Parameter Store, Cognito, WAF, Shield, ACM — seemingly unconnected services. But they're actually one picture: the **defense-in-depth** layers a single request traverses from the internet through to application data. Shield absorbs DDoS, WAF filters malicious HTTP patterns, Cognito proves identity, ACM wraps transport, Secrets Manager protects passwords, KMS guards the keys that unlock those passwords. Once you can sketch this path in your head, nearly every Week 9 problem collapses to "at which layer do I stop this?"

DVA-C02's security is tough not because concepts are hard but because **the boundary between two similar services is subtle**. Secrets Manager and Parameter Store both store secrets KMS-encrypted — the real difference is auto-rotation. User Pool and Identity Pool are both Cognito — one handles authentication, the other authorization. Shield Standard and Advanced both stop DDoS — the dividing line is cost protection. This recap sharpens those boundaries, ties a real security incident to why that boundary matters, then finishes with scenario questions.

## Defense Layers Traced Through One Request

Watching one HTTP request's journey from internet to data reveals where this week's services sit.

Traffic arrives at CloudFront edge; **Shield** absorbs volumetric attacks (SYN flood, UDP reflection). Next, **WAF** inspects L7 content — SQL strings, XSS payloads, abnormal IP request rates — against rules. Passing requests travel through **ACM**-terminated TLS tunnel to origin. Application validates the request's **Cognito** JWT ("who is this?"), confirms identity. If the app needs AWS resources, it swaps JWT to Identity Pool for IAM temp credentials. Finally, to read a DB password, it fetches from **Secrets Manager**, decrypts the secret's **KMS**-encrypted DEK locally, and connects. Each layer handles different threat model: Shield → availability, WAF → integrity/injection, Cognito → authentication, KMS → confidentiality.

> 💡 **Related theory**: This is **defense in depth (CIA)** from the NSA's Information Assurance model. A single weak link mustn't topple the whole structure. CIA (Confidentiality, Integrity, Availability) splits across layers: Shield protects Availability (DDoS), WAF protects Integrity (prevent tampering injection attacks), Cognito/IAM protect Authentication/Authorization, KMS protects Confidentiality (keep data encrypted). Each layer addresses a different threat — no single service solves all.

> ⚠️ **Trap**: Exams love offering adjacent-layer answers as wrong options. Can NACL/Security Group block SQL injection? No — they're L3/L4 (IP/port), SQL is L7 (inside HTTP). Can WAF stop pure-IP DDoS? No — CIDR floods are L3/L4 volume, WAF doesn't see "volume," only request content. "Which OSI layer?" is the first filter that kills half the wrong answers.

## Secret Storage: Secrets Manager vs Parameter Store Boundary

This week's most-confused pair. Both store sensitive values, KMS-encrypted, yet differ sharply on **auto-rotation**.

| Item | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| Auto Rotation | Built-in (RDS integration) | None |
| Cost | $0.40/secret/month + API | Standard free / Advanced $0.05 |
| Size | 64KB | Standard 4KB / Advanced 8KB |
| Encryption | KMS mandatory | SecureString only KMS |
| Hierarchy | Limited | `/app/prod/db/...` tree |
| Cross-reference | — | CloudFormation `{{resolve:ssm:...}}` |

> 🔍 **Going deeper**: Secrets Manager rotation's zero-downtime trick is **alternating users**. RDS rotation Lambda runs four steps: create new secret under `AWSPENDING`, set in DB, test connection, promote `AWSPENDING` → `AWSCURRENT`. Using two DB users (rotate one while the other stays active) ensures clients with cached old passwords still connect for one rotation cycle. If **testSecret fails**, rotation stops and `AWSCURRENT` reverts — the system never goes broken. This "validate-then-promote" pattern makes rotation safe.

> 📚 **Case study**: 2021 Codecov breach. Attackers modified a Bash upload script to steal CI env-var secrets (API keys, tokens, GitHub creds) in plaintext. Victims had secrets hard-coded in env vars, no rotation. If instead they'd used Secrets Manager with 1-month auto-rotation, stolen values would auto-expire, limiting damage. "Don't put secrets in env vars, use auto-rotated service" is the lesson.

## Authentication vs Authorization: User Pool's "Who" vs Identity Pool's "What"

The clearest sentence: **User Pool = authentication (who), Identity Pool = authorization (what-you-can-do).**

User Pool issues three JWT types:
- **ID Token** (user attributes) — "this is user john@example.com, admin group"
- **Access Token** (scopes/groups) — "this token grants API access scope read_user"
- **Refresh Token** (opaque) — "use me to renew expiring tokens"

> 💡 **Related theory**: Cognito JWT follows **RFC 7519** (Base64-only encoding, not encrypted) + **RFC 2945 SRP** (password never sent). Verifying requires Cognito's public key from JWKS endpoint. SRP means even TLS termination points never see plaintext passwords. User Pool is **OIDC-compliant IdP**, Identity Pool is **STS token-to-credential** exchange. OAuth 2.0 designed this split — separate concerns → separate specs.

> 🔍 **Going deeper**: REST API's Cognito Authorizer validates **ID Token** (identity focus), while HTTP API's JWT Authorizer validates **Access Token** (scope/permission focus). This token-type difference trips exams. Also, Identity Pool **role mapping** (Rules-based or Token-based) checks JWT `cognito:groups` and assumes different IAM roles — Admin group → AdminRole, Users → UserRole. Same app, different permissions per group via role mapping.

## Edge Defense: WAF and Shield's Separate Jobs

Both defend the edge but at different OSI layers, against different threat natures.

**Shield (L3/L4)**: Absorbs protocol attacks — SYN flood (fill connection table), UDP reflection (amplification). Volume-based; request content irrelevant. Standard free (auto-applied). Advanced ($3,000/month) adds cost refund and **Shield Response Team** — humans adjusting WAF rules real-time during large attacks.

**WAF (L7)**: Parses HTTP/HTTPS, applies rules to content — SQLi patterns, XSS, rate-per-IP, geo. Content-aware; volume immaterial. Deploy new rules in **Count mode** (observe), verify false positive rate, then **Block** to enforce. L7 awareness means WAF attaches only to HTTP-aware services (CloudFront, ALB, REST API, AppSync) — not HTTP API or NLB.

> 📚 **Case study**: 2020 AWS blocked 2.3Tbps DDoS via Shield — CLDAP reflection amplification. Attacker spoofed victim's IP, asked LDAP servers questions, got huge responses. Amplified reflection takes network-edge absorption (Shield); no single app can absorb terabit-scale. That's why Shield sits at CloudFront/ALB tier, not on EC2.

## Transport Encryption: ACM's Region and EC2 Trap

ACM issues free SSL/TLS certs, auto-renews, **but key isolation prevents EC2 direct install.**

- CloudFront HTTPS → cert issued in **us-east-1** (CloudFront control plane there)
- ALB HTTPS → cert issued in **that ALB's region**
- EC2 TLS → **ACM won't work** — use Let's Encrypt or separate cert

ACM attaches to AWS-managed endpoints (CloudFront, ALB, API Gateway, Cognito, etc.) where AWS internally manages the key. EC2 direct install would need key file export — violates key isolation.

## Data Confidentiality: KMS and Key Isolation

KMS **never exports key material**. `kms:Encrypt` and `kms:Decrypt` run inside AWS; users never touch the key itself. 4KB direct-encryption limit is by design — KMS is "protect small secrets," not "encrypt terabytes."

Envelope encryption solves this: `GenerateDataKey` returns both plaintext DEK and encrypted DEK in one call. Encrypt large data locally with plaintext DEK (no API), then discard DEK. Storage: [encrypted data + encrypted DEK]. Decryption: decrypt DEK via KMS, decrypt data locally. **KMS's cryptographic boundary never breaks.**

Key policy is the final authority — IAM delegation statement required, or key locks. Multi-region keys and key rotation (add backing key, keep ARN) are also points.

## Detective Layer: Macie and GuardDuty

After incidents, detect what happened.

**Macie**: ML scans S3 for PII (credit cards, SSNs) — data-centric.
**GuardDuty**: CloudTrail/VPC Flow/DNS anomalies (weird API calls, coin mining) — behavior-centric.

Different data → different tools.

## Wrapping Up

Week 9 services are not independent cards but layers of one defense stack. Each OSI layer, each threat model (availability/integrity/authentication/confidentiality), each component of a secret's lifecycle is guarded. The boundaries (Secrets Manager auto-rotation vs Parameter Store cost, User Pool auth vs Identity Pool access, Shield Standard cost-less vs Advanced cost-protected, WAF L7 vs NACL L4) are exam trap cores. Know those boundaries as "which threat model" and most questions answer themselves.

---

## 📝 연습 문제

**문제 1.** Mobile app user logs in via Cognito, then uploads to S3 folder directly. Correct flow?

A) User Pool JWT to S3 Authorization header (no SigV4)
B) User Pool login → Identity Pool swap JWT for IAM temp credentials → S3 direct
C) Lambda proxy all uploads; Lambda role calls S3
D) API Gateway + Cognito Authorizer only; no direct S3

**정답: B**

해설: JWT ≠ IAM credentials. User Pool proves who (JWT). Identity Pool converts to AWS credentials. Role mapping splits folder access by user ID. A) S3 needs SigV4 IAM signature. C·D) Possible, not "direct access."

---

**문제 2.** RDS password must auto-rotate every 30 days **without downtime**. Best setup?

A) Parameter Store + EventBridge schedule
B) Secrets Manager + Single-User rotation
C) Secrets Manager + Alternating-Users rotation
D) Lambda + Parameter Store

**정답: C**

해설: Alternating-Users keeps both accounts one cycle → old-password clients still connect. Single-User swaps immediately → brief failure risk. A) Parameter Store no rotation. D) Manual Lambda is anti-pattern.

---

**문제 3.** App gets SQL injection and XSS attacks. Block at request stage. Right service?

A) Security Group
B) Network ACL
C) AWS WAF
D) Shield Standard

**정답: C**

해설: SQL/XSS are L7 payload patterns. WAF parses HTTP and filters by rules. A·B) L4 can't see L7 content. D) Shield is DDoS, not injection.

---

**문제 4.** 15MB config file encrypted with KMS, stored in S3. Correct approach?

A) `kms:Encrypt` directly
B) `GenerateDataKey` → envelope encrypt locally
C) Secrets Manager (whole file)
D) Parameter Store Standard

**정답: B**

해설: `kms:Encrypt` max 4KB. Envelope: GenerateDataKey, plaintext DEK encrypt locally, discard DEK, store [encrypted data + encrypted DEK]. C/D) Size limits too small (Secrets Manager 64KB, Parameter Store 4-8KB).

---

**문제 5.** REST API with Cognito Authorizer defaults to which token?

A) Access
B) ID
C) Refresh
D) IAM credential

**정답: B**

해설: REST API Cognito Authorizer = ID Token (identity). HTTP API JWT Authorizer = Access Token (scope).

---

**문제 6.** CloudFront HTTPS cert + region + EC2 installability?

A) Any region / installable
B) us-east-1 / not installable
C) Regional / installable
D) us-west-2 / not installable

**정답: B**

해설: CloudFront control plane in us-east-1. ACM refuses EC2 key export (key isolation).

---

**문제 7.** DDoS hits; Auto Scaling soars; bill explodes. Cost protection?

A) Shield Standard
B) Shield Advanced
C) WAF rate rule
D) CloudFront cache more

**정답: B**

해설: Shield Advanced refunds DDoS-caused cost. Standard free but no refund. WAF/cache help mitigate, not refund.

---

**문제 8.** HTTP API (v2) needs WAF for SQL injection. Direct attach fails. Solution?

A) Rebuild as REST only
B) CloudFront in front + WAF on CloudFront
C) NLB in front + WAF
D) Security Group SQL rules

**정답: B**

해설: HTTP API doesn't support WAF. Workaround: CloudFront + WAF. NLB is L4. Security Group is L4.

---

**문제 9.** Most secure Cognito auth flow (no plaintext password over network)?

A) `USER_PASSWORD_AUTH`
B) `ADMIN_USER_PASSWORD_AUTH`
C) `USER_SRP_AUTH`
D) `CUSTOM_AUTH`

**정답: C**

해설: SRP (Secure Remote Password) proves knowledge without sending password. Others transmit password (TLS only).

---

**문제 10.** S3 auto-detect PII (credit cards, SSNs) stored accidentally. Service?

A) GuardDuty
B) Macie
C) Inspector
D) Config

**정답: B**

해설: Macie ML-detects PII in S3 data. GuardDuty = anomalous behavior. Inspector = code/package CVEs. Config = configuration compliance.

---

**문제 11.** Regulations: keys on **dedicated hardware** AWS cannot access. Also want KMS API compatibility. Solution?

A) KMS Customer Managed Key
B) KMS AWS Managed Key
C) CloudHSM as KMS custom key store
D) Secrets Manager key storage

**정답: C**

해설: KMS multi-tenant (logical isolation). CloudHSM single-tenant (dedicated HW). **Custom key store** mode keeps keys on CloudHSM, exposes KMS API.

---

**문제 12.** New WAF rule deployment: test first without breaking users. Approach?

A) Block mode, monitor logs
B) Count mode, measure match rate
C) Disable rule, set alerts
D) Shield Advanced backup

**정답: B**

해설: Count mode logs matches without blocking. Verify no false positives, then promote to Block. "Safe WAF testing" = Count.
