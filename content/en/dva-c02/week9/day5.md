# Day 5 - Week 9 Review: Security Is Not a Single Setting but the Sum of Layers

Over the week we went through KMS, Secrets Manager, Parameter Store, Cognito, WAF, Shield, and ACM in turn. At first glance they feel like a list of unrelated services, but in reality they are cross-sections of the **defense in depth** layers that a single request passes through as it travels from the internet to the application's data. Shield absorbs DDoS, WAF filters malicious HTTP patterns, Cognito proves identity, ACM's TLS wraps the transport, Secrets Manager guards stored secrets, and KMS guards the keys that unlock those secrets. If you can picture this order in your head, Week 9's questions usually reduce to a single question: "at which layer should this be blocked?"

The DVA-C02 security section is hard not because of the concepts themselves but because of **the subtle boundaries between two similar services**. Secrets Manager and Parameter Store both store secrets but differ in whether they offer automatic rotation, and User Pool and Identity Pool are both Cognito but one handles authentication and the other authorization. Shield Standard and Advanced both stop DDoS but differ in cost protection. This review draws those boundary lines sharply once more, points out why real security incidents blew up when these boundaries were ignored, and then finishes with exam-style scenarios.

## Redrawing the Defense Layers as the Journey of One Request

If you follow a single user HTTP request from entering the system to reading data and leaving, it becomes natural to see where this week's services come in. When traffic arrives at a CloudFront edge, **Shield** first absorbs volumetric attacks (SYN flood, UDP reflection). Next, **WAF** inspects the L7 content of the request (SQL injection strings, XSS payloads, abnormally frequent IPs) against rules. The request that passes is forwarded to the origin inside a TLS tunnel established with a certificate issued by **ACM**. The application verifies the **Cognito** JWT carried in the request to confirm "who is this," and if it needs to access an AWS resource such as S3, it receives IAM temporary credentials through the Identity Pool. Finally, the DB password is fetched from **Secrets Manager**, decrypted with the **KMS** key that encrypted that secret.

This structure is exactly the classic information security principle of **defense in depth**. This concept, which originates from the U.S. National Security Agency (NSA)'s information assurance model, stacks independent defensive layers so that the failure of a single line of defense does not lead to total collapse. The key is that each layer handles a **different threat model**: Shield guards availability, WAF guards integrity against injection attacks, Cognito/IAM guard authentication and authorization, and KMS guards confidentiality. When you see how the CIA triad (Confidentiality, Integrity, Availability) is distributed across the layers, it becomes clear why no single service can solve all of security.

> ⚠️ **Pitfall**: The exam often asks "where do you block this threat?" and lays adjacent layers as wrong answers. If it asks whether you can block SQL injection with a NACL or a Security Group, the answer is No: NACLs/SGs operate at L3/L4 (IPs and ports), while SQL injection hides inside the HTTP payload (L7), so only WAF can see it. Conversely, blocking an entire country's IP range can be done with WAF's Geo match too, but for pure IP blocking, a NACL is cheaper and faster. The habit of first judging "which OSI layer is this problem in" is the way to avoid this trap.

## Secret Storage: The Fork Between Secrets Manager and Parameter Store

The pair that is easy to confuse this week is Secrets Manager and Parameter Store. Both keep sensitive values safe and encrypt with KMS, but the decisive difference is **automatic rotation**. Secrets Manager has a built-in Lambda function that periodically replaces RDS, Redshift, and DocumentDB credentials by itself and reflects the new password in both the DB and the secret store at the same time. Parameter Store has no such rotation feature; it specializes in storing values and querying them hierarchically, and standard parameters are **free**.

| Item | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| Automatic rotation | Built in (integrated with RDS, etc.) | None |
| Cost | $0.40/month per secret + API | Standard free / Advanced $0.05 |
| Size limit | 64KB | Standard 4KB / Advanced 8KB |
| Encryption | KMS required | KMS only for SecureString |
| Hierarchy | Limited | `/app/prod/db/...` path tree |
| Cross-reference | — | CloudFormation `{{resolve:ssm:...}}` |

The secret to Secrets Manager's automatic rotation working without downtime lies in the **strategy of alternating between two sets of secrets**. The RDS rotation Lambda goes through four steps (`createSecret` → `setSecret` → `testSecret` → `finishSecret`). The Single-User strategy changes one user's password, so a brief gap can arise at the moment of change, whereas the **Alternating-Users** strategy keeps two DB users and updates one while the other is active before switching, so there is effectively no downtime. If the exam says "no downtime is needed during rotation," Alternating-Users is the answer. This four-step model is implemented with the secret's `AWSCURRENT`/`AWSPENDING`/`AWSPREVIOUS` stage labels, which provide a safety net for rolling back to `AWSPREVIOUS` if rotation fails.

The 2021 Codecov supply chain breach dramatically shows why secret management matters. Attackers tampered with Codecov's Bash Uploader script and siphoned out the credentials, tokens, and keys of many customers that had been exposed in plaintext in CI environment variables. The root of the damage was that the affected companies had left AWS keys and GitHub tokens sitting in environment variables. If those secrets had been in Secrets Manager and rotated automatically on a short cycle, the leaked values would already have been invalidated and the damage limited. The core lesson of this incident is "don't leave secrets in plaintext in environment variables or code; keep them in a store that can rotate."

## Authentication and Authorization: User Pool Is "Who Are You," Identity Pool Is "What Can You Do"

The one sentence that separates Cognito's two pools is this: **the User Pool handles authentication, and the Identity Pool handles authorization**. The User Pool handles sign-up, login, and MFA, and on success issues three kinds of JWTs (ID, Access, and Refresh Tokens). These tokens are merely proof of identity, "this person is verified user_a," and are not authority to directly access S3 or DynamoDB. To touch AWS resources, you must submit that JWT to the Identity Pool and exchange it for **IAM temporary credentials**.

| Token | Information contained | Use |
|------|-----------|------|
| **ID Token** | User attributes (email, name, etc.) | Confirming user identity, the default for the REST API Cognito Authorizer |
| **Access Token** | Scopes, groups | API access permission, the HTTP API JWT Authorizer |
| **Refresh Token** | (opaque) | Reissuing expired ID/Access Tokens, up to 10 years |

Cognito's JWTs follow the internet standard **RFC 7519 (JSON Web Token)**. A token is a Base64URL string of three parts, `header.payload.signature`, joined by dots, and the signature is made with the User Pool's asymmetric key (RS256). The verifier obtains the public key from the JWKS (JSON Web Key Set) endpoint that Cognito publishes and checks the signature, and thanks to this structure **you do not need to call Cognito to verify**: if you cache just the public key, you can verify the signature, expiry, and issuer even offline. This is the key reason JWTs are better than session tokens for scalability. The higher-level standard that defines the authentication layer is **OpenID Connect (OIDC)**, and the Cognito User Pool acts as an OIDC-compatible IdP.

The Cognito Authorizer on a REST API (API Gateway) accepts the **ID Token** by default, whereas the JWT Authorizer on an HTTP API usually verifies the **Access Token**. This subtle difference is easily used as a wrong-answer option. The ID Token focuses on "who are you" (user attributes), and the Access Token on "what can you do" (scope, groups). By OAuth 2.0's original design philosophy, using the Access Token for API authorization is the standard, so the HTTP API's default of the Access Token is closer to the standard. In addition, the User Pool can insert custom logic into the authentication flow (domain whitelisting, injecting custom claims into tokens, and so on) through **11 kinds of Lambda triggers** such as PreSignUp, PostConfirmation, and PreTokenGeneration.

Do not confuse the login flows `USER_SRP_AUTH` and `USER_PASSWORD_AUTH`. SRP (Secure Remote Password, of the **RFC 2945** family) never sends the password over the network and authenticates in a way close to a zero-knowledge proof, so it is more secure. `USER_PASSWORD_AUTH` transmits the password (over TLS), so it is used only in limited situations such as legacy migration. If asked for "the most secure authentication flow," it is SRP.

## Edge Defense: The Division of Labor Between WAF and Shield

WAF and Shield both block "malicious traffic from outside," but they target different threats. **WAF looks at L7 content**, and **Shield looks at L3/L4 volume**. WAF filters SQL injection, XSS, malformed request patterns, and excessive request frequency (rate-based rules) with rules, while Shield absorbs DDoS that exhausts bandwidth or connection tables with massive packets.

| Item | Shield Standard | Shield Advanced |
|------|-----------------|-----------------|
| Cost | Free (automatic) | $3,000/month + data |
| Defense layers | L3/L4 | L3/L4/L7 |
| Cost protection | None | Credits for DDoS spike costs |
| Response team | None | SRT (Shield Response Team) 24/7 |
| WAF integration | Separate | Integrated, automatic rules |

In February 2020, AWS disclosed that it had absorbed with Shield the largest DDoS attack on record at the time, reaching up to 2.3 Tbps. This attack was amplified with a CLDAP (Connection-less LDAP) reflection technique, in which the attacker spoofs the source IP as the victim and sends small requests to LDAP servers, and the servers pour responses dozens of times larger onto the victim. The key lesson is that volumetric attacks like this **cannot be stopped by an individual application on its own**; you need absorption capacity at the AWS backbone level. This is why Shield attaches in front of edge services like CloudFront, ALB, and Route 53 rather than EC2, and it is also a basic principle of DDoS defense: "gather traffic at the edge and absorb it."

WAF's **rate-based rule** counts the number of requests from the same IP over a 5-minute sliding window and blocks when a threshold is exceeded. A point often missed here is that WAF **does not attach directly to the HTTP API (API Gateway v2)**: it attaches to REST API (v1), ALB, CloudFront, and AppSync, but HTTP API is not a supported target. So to protect an HTTP API with WAF, you need the workaround of placing CloudFront in front. Also, besides Block, WAF rule actions have a **Count** mode, used to record only the match count without blocking so you can safely measure false positives before applying a new rule in production.

## Transport Encryption: ACM's Region Constraint and the No-Install Principle

ACM issues and automatically renews public SSL/TLS certificates for free. Two things are exam points. First, **a certificate used with CloudFront must be issued in us-east-1 (N. Virginia)**, because CloudFront is a global service and reads certificates only from us-east-1, where the global control plane is. Regional services like ALB use a certificate issued in that Region. Second, **an ACM public certificate cannot be installed directly on EC2**: because the private key is blocked from being extracted, it can be used only by attaching it to AWS managed services such as CloudFront, ALB, and API Gateway.

ACM's design of not allowing the private key to be exported is exactly the same **key isolation** philosophy as KMS not letting you extract key material in Day 41. If a certificate's private key never touches the user's hands, the surface for leakage disappears. TLS itself is defined by the internet standard **RFC 8446 (TLS 1.3)**: in the handshake the server proves its identity with a certificate and agrees on a session key through key exchange, and ACM automates the lifecycle of that certificate (issuance, validation, renewal). If you need a certificate for internal-only use, you operate a private certificate authority with **ACM Private CA** ($400/month) to support scenarios like mTLS.

> ⚠️ **Pitfall**: An option saying "install the ACM certificate on the EC2 web server" is wrong. To terminate TLS on EC2 you have to install a certificate yourself in nginx or similar, which is impossible with an ACM public certificate. The correct pattern is to put an ALB in front of EC2 and attach the ACM certificate to the ALB. Remembering "it can only be attached to managed services" avoids this trap.

## Macie and GuardDuty: Two Directions of Detection

Finally, we touch on the detection layer of data protection. **Macie finds sensitive data (PII) inside S3** with machine learning, and **GuardDuty detects threat activity across the account** (abnormal API calls, communication with known malicious IPs, cryptomining patterns) using CloudTrail, VPC Flow Logs, and DNS logs. One looks at "what is stored" (data-centric), the other at "what is happening" (behavior-centric).

The 2019 Capital One breach was a large incident in which the personal information of about 106 million people leaked. The cause was a misconfigured WAF abused in an SSRF (Server-Side Request Forgery) attack, which stole IAM credentials from the EC2 instance's metadata service. The attacker used those credentials to pull out the data in S3 buckets wholesale. This incident delivers lessons at several layers at once: the misconfiguration of WAF rules, excessive IAM permissions, and the point that if GuardDuty had flagged the abnormal bulk S3 access and Macie had flagged in advance that the bucket held PII, detection and blocking would have been faster. AWS introducing Instance Metadata Service v2 (IMDSv2, which requires a session token) after this incident was also to strengthen SSRF defense.

## Wrapping Up

Week 9's seven services are not cards to memorize separately but checkpoints placed along the road a single request takes from the internet to the data. Shield guards the volume, WAF the content, Cognito the identity, IAM the permissions, ACM the transport, Secrets Manager the secrets, and KMS the keys to those secrets. The exam traps always hide at the boundary between two adjacent services: User Pool vs Identity Pool, Secrets Manager vs Parameter Store, Shield Standard vs Advanced, WAF L7 vs NACL L4. If you can say in one sentence at which threat model, which OSI layer, and which cost model each boundary splits, most of the scenarios below become instant answers.

---

## 📝 Practice Questions

**Question 1.** A mobile app signs users in with Cognito, and then that user must upload photos directly to their own S3 folder. What is the correct flow?

A) Put the ID Token issued by the User Pool in the Authorization header and call PutObject directly to S3 without SigV4

B) Sign in with the User Pool → submit the JWT to the Identity Pool → IAM temporary credentials → direct S3 access

C) Receive all uploads through a Lambda proxy and PutObject to S3 on the user's behalf with the Lambda execution role's IAM permissions

D) Upload only through a backend behind API Gateway + a Cognito Authorizer and block direct S3 access

**Answer: B**

Explanation: The User Pool handles authentication (who are you) and only issues a JWT; it does not grant access to AWS resources. To access S3 directly, you must submit that JWT to the Identity Pool and exchange it for IAM temporary credentials. A) is impossible because S3 does not understand a JWT; S3 requires SigV4-signed IAM credentials. C) and D) work but do not satisfy the "direct access" requirement and add an unnecessary intermediate layer. Remember that the Identity Pool's role is "an authorization broker that turns a JWT into IAM credentials."

---

**Question 2.** You must rotate RDS production credentials every 30 days with **no downtime**. What is the most suitable configuration?

A) Parameter Store SecureString + EventBridge schedule

B) Secrets Manager + Single-User rotation strategy

C) Secrets Manager + Alternating-Users rotation strategy

D) Implement the password change logic directly with Lambda

**Answer: C**

Explanation: Parameter Store has no automatic rotation feature at all, so A) is out. Secrets Manager has built-in rotation, and with **Single-User** a brief gap can arise at the moment of switching because one user's password is changed, while **Alternating-Users** updates two DB users in turn so there is effectively no downtime. Since "no downtime" is the key requirement, C) is the answer. D) is an anti-pattern that reimplements the four rotation steps (createSecret/setSecret/testSecret/finishSecret) and the rollback safety net yourself.

---

**Question 3.** A web application is under SQL injection and XSS attacks. What is the most suitable service to detect and block them?

A) Security Group

B) Network ACL

C) AWS WAF

D) Shield Standard

**Answer: C**

Explanation: SQL injection and XSS are attacks that hide inside the HTTP request body/parameters (L7). A Security Group (L4, stateful) and a NACL (L3/L4 IPs and ports) look only at a packet's IP and port, so they cannot inspect payload content. Shield absorbs volumetric DDoS (L3/L4), an availability attack, and is not a tool for blocking injection attacks. Only WAF inspects HTTP-layer content with rules and blocks SQL/XSS patterns. If you first judge "which OSI layer is this attack in," the answer is immediate.

---

**Question 4.** You want to encrypt a 15MB configuration file with KMS and store it in S3. What is the correct approach?

A) Encrypt the file directly with the `kms:Encrypt` API

B) Get a data key with `GenerateDataKey` and envelope-encrypt locally

C) Store the whole file in Secrets Manager

D) Store it in a Parameter Store standard parameter

**Answer: B**

Explanation: The direct encryption limit of `kms:Encrypt` is 4KB, so it cannot be used for 15MB (A is out). With envelope encryption, you call `GenerateDataKey` to receive a plaintext DEK and an encrypted DEK at the same time, encrypt the file locally with the plaintext DEK, and then discard the plaintext DEK. C) The Secrets Manager limit is 64KB, so it cannot hold 15MB. D) Parameter Store standard is 4KB and even Advanced is 8KB, so it is impossible. For encrypting large data, envelope encryption is always the answer.

---

**Question 5.** When you attach a Cognito Authorizer to a REST API (API Gateway v1), which token does it verify by default?

A) Access Token

B) ID Token

C) Refresh Token

D) IAM temporary credentials

**Answer: B**

Explanation: The REST API's Cognito Authorizer verifies the **ID Token** by default (centered on user identity attributes). The HTTP API (v2)'s JWT Authorizer, on the other hand, usually verifies the Access Token (centered on scopes and groups). The difference in defaults between the two is an exam favorite. C) The Refresh Token is for reissuing expired tokens and is not used directly for API authorization. D) IAM temporary credentials are issued by the Identity Pool and are not something an Authorizer verifies.

---

**Question 6.** You want to apply HTTPS to a CloudFront distribution. In which Region must the ACM certificate be issued, and can it be installed directly on EC2?

A) The Region the distribution belongs to / installable

B) us-east-1 / not installable

C) Any Region / installable

D) us-west-2 / not installable

**Answer: B**

Explanation: CloudFront is a global service and reads certificates only from **us-east-1**, where the global control plane is. So a certificate issued in another Region cannot be attached to CloudFront. Also, an ACM public certificate has its private key blocked from extraction, so it **cannot be installed directly on EC2**; it can be used only by attaching it to managed services such as CloudFront, ALB, and API Gateway. If you need TLS on EC2, put an ALB in front and attach the ACM certificate to the ALB.

---

**Question 7.** A DDoS attack caused Auto Scaling to expand massively and the bill spiked. How do you get that extra cost protected with credits?

A) Shield Standard

B) Shield Advanced

C) WAF rate-based rule

D) Stronger CloudFront caching

**Answer: B**

Explanation: **Only Shield Advanced provides credits** for scaling cost spikes caused by DDoS ($3,000/month). Standard is free but has no cost protection or SRT support. C) A WAF rate-based rule helps mitigate the attack itself by reducing L7 request frequency but has nothing to do with cost reimbursement. D) Caching only reduces origin load and is not a bill-protection feature. If you see the keyword "DDoS cost protection," Shield Advanced is the answer.

---

**Question 8.** You want to put WAF in front of an HTTP API (API Gateway v2) to block SQL injection. However, WAF cannot be connected directly. What is the correct solution?

A) Block with a NACL instead of the HTTP API

B) Put CloudFront in front of the HTTP API and connect WAF to CloudFront

C) Replace it with Shield Advanced

D) Add a Security Group rule

**Answer: B**

Explanation: WAF attaches to REST API (v1), ALB, CloudFront, and AppSync but is **not directly connectable to an HTTP API (v2)**. So to protect an HTTP API with WAF, you use the workaround pattern of putting a CloudFront distribution in front and connecting WAF to CloudFront. A, D) NACLs/SGs see only up to L4, so they cannot stop L7 SQL injection. C) Shield is for DDoS and is not a tool for blocking injection attacks. The incompatibility of "HTTP API + WAF" is a frequently appearing trap.

---

**Question 9.** What is the most secure Cognito authentication flow, in which the password is not transmitted over the network?

A) `USER_PASSWORD_AUTH`

B) `ADMIN_USER_PASSWORD_AUTH`

C) `USER_SRP_AUTH`

D) `CUSTOM_AUTH`

**Answer: C**

Explanation: `USER_SRP_AUTH` uses the SRP (Secure Remote Password) protocol to authenticate without sending the password over the network. The client and server exchange only proofs, not the password itself, so it is the most secure. A, B) The `*_PASSWORD_AUTH` family transmits the password (over TLS), so it is used only in limited legacy and administrator scenarios. D) `CUSTOM_AUTH` is a flow that implements a custom challenge with Lambda triggers and is not a standard flow that guarantees "no password transmission."

---

**Question 10.** You want to automatically discover whether customer personal information (PII) has been accidentally stored in an S3 bucket. What is the suitable service?

A) GuardDuty

B) Macie

C) Inspector

D) Config

**Answer: B**

Explanation: **Macie** scans S3 objects with machine learning and automatically identifies PII and sensitive data such as credit card numbers and national ID numbers (data-centric detection). A) GuardDuty detects account behavior-based threats such as abnormal API calls and communication with malicious IPs and does not classify data content. C) Inspector scans EC2/containers for vulnerabilities and CVEs. D) Config tracks resource configuration compliance. For "discovering PII in S3," Macie is the answer.

---

**Question 11.** Regulations require that encryption keys be kept on **dedicated hardware** and that even AWS cannot access the key material. You also want to keep compatibility with the existing KMS API. What is the suitable choice?

A) KMS Customer Managed Key

B) KMS AWS Managed Key

C) Connect CloudHSM as a KMS custom key store

D) Store the key in Secrets Manager

**Answer: C**

Explanation: KMS default keys run on multi-tenant HSMs (logical isolation), so they alone cannot meet the strong regulatory requirement of "dedicated hardware + not accessible even by AWS" (A and B are out). CloudHSM is single-tenant dedicated hardware (FIPS 140-2 Level 3), and connecting it as a KMS **custom key store** lets you keep the key material on dedicated hardware while still using the familiar KMS API as is, satisfying both requirements at once. D) Secrets Manager is a secret storage service, not key-isolating hardware.

---

**Question 12.** You want to safely measure whether a newly created WAF rule wrongly blocks legitimate traffic (false positives) before applying it in production. What is the most suitable method?

A) Set the rule action to Block and watch the logs

B) Set the rule action to Count and watch the match count

C) Leave the rule disabled and set a CloudWatch alarm

D) Verify with Shield Advanced instead

**Answer: B**

Explanation: The **Count** mode of a WAF rule action does not block traffic and only records the number of requests that matched the rule. The standard operating pattern is to run the new rule in Count first to measure how many legitimate requests it catches (the false positive rate), and then promote it to Block once it is confirmed safe. A) is risky because it would block real users during the validation stage. C) A disabled rule produces no match statistics. D) Shield is for DDoS and has nothing to do with validating WAF rules. For "safely validating a WAF rule," Count mode is the answer.
