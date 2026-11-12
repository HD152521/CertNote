# Day 5 - Week 5 Synthesis: Integrated Review of Encryption and Key Management Scenarios

This week covered the first pillar of data protection: *encryption and key management*. KMS key types and dual permission models (Day 1), envelope encryption with data keys and encryption contexts (Day 2), key policies, grants, cross-account, and ViaService (Day 3), transit/at-rest encryption and key rotation (Day 4). Today we integrate these into one decision framework. Exams ask less about fragments and more about *"for this data protection requirement, which key, which permission, and which encryption location do I choose?"* The core framework is **key control level × permission mechanism × encryption location (transit/rest/layer)** in three dimensions.

## Integrated Decision Matrix: Requirement → Choice

| Requirement/Scenario | Core Choice | Reason |
|-----------|-----------|------|
| Edit key policy, control rotation, cross-account sharing | Customer managed key | AWS managed keys have fixed policies |
| External party needs to encrypt without KMS permission | Asymmetric key (public distributed) | Private key stays in KMS |
| Digital signing/verification | Asymmetric key (SIGN_VERIFY) | Private signs, public verifies |
| Large data encryption | Envelope encryption (GenerateDataKey) | KMS 4KB limit |
| Separate key creation from encryption actor | GenerateDataKeyWithoutPlaintext | Minimize plaintext exposure |
| Bind ciphertext to specific context | Encryption context (AAD) | Integrity + permission conditions |
| Temporary, granular, revocable permission | Grant | Prevent policy bloat |
| Restrict key usage to specific service | `kms:ViaService` condition | Block direct calls |
| Cross-account key use | Key policy allow + user account IAM | Both sides required |
| Organization-level key guardrails | SCP + `aws:PrincipalOrgID` | Block deletion/external sharing |
| Force S3 transit encryption | `aws:SecureTransport` Deny | Block HTTP at source |
| Encrypt existing unencrypted RDS/EBS | Snapshot → encrypted copy → restore | No toggle available |
| Regular rotation without ops burden | Symmetric CMK auto-rotation | Transparent key material update |
| Rotate asymmetric/BYOK keys | Manual (new key + alias update) | Auto-rotation unsupported |
| Reduce KMS API cost/throttling | S3 Bucket Key / DEK caching | Reduce call frequency |
| Immediate, reversible key neutralization | Key disable | Deletion is irreversible/delayed |

> 💡 **Related Theory**: This matrix's foundation is the principle *"whoever controls the key controls the data."* Encryption algorithms are standardized and fixed, so security design variables are almost entirely *key ownership, access, lifetime, and usage path*. The exam's "best" answer usually precisely satisfies the required control level while minimizing operational burden and exposure surface.

## Integrated Scenarios

> 🎯 **Scenario A — Multitenant SaaS Data Protection**: "Store large tenant files in S3. Isolate decryption by tenant, manage KMS costs, audit all key use, rotate keys regularly." Answer: (1) **SSE-KMS** + customer managed key (audit/control), (2) **encryption context** `tenant=<id>` per object with `kms:EncryptionContext:tenant` condition in IAM/key policy for tenant isolation, (3) **S3 Bucket Key** to reduce KMS call costs/throttling, (4) **auto key rotation** for burden-free regular rotation, (5) **CloudTrail** to audit all KMS use. Four days of concepts cooperate in one design.

> 🎯 **Scenario B — Cross-Account Data Sharing + Governance**: "Security account owns/manages KMS key; workload accounts use data encrypted with it, but regular accounts cannot delete the key or change policy." Answer: (1) Security account **key policy** allows `Decrypt`/`GenerateDataKey` to workload account roles + workload accounts **IAM** allows operations on key ARN (both sides), (2) `aws:PrincipalOrgID` limits to organization members, (3) **SCP** denies regular accounts' `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy`, (4) management access restricted to security team role. Three-layer governance: key policy (fine-grained) + IAM (delegation) + SCP (guardrail).

> 🎯 **Scenario C — External Partner Encryption + Signing**: "Partner without KMS permissions must encrypt data and send it to us; partner must verify integrity of our issued documents." Answer: (1) Partner encryption with **asymmetric key (encryption/decryption)** — distribute public key, only we decrypt with private key, (2) Document signing with **asymmetric key (SIGN_VERIFY)** — we sign with private key, partner verifies with public key. Impossible with symmetric keys.

## Frequently Confused Distinctions

**Key policy vs IAM vs grant** — key policy is required/permanent/resource-based (primary permission source), IAM is identity-based (if delegated), grant is temporary/granular/programmatic. Cross-account needs both key policy and IAM.

**GenerateDataKey vs Encrypt** — large data uses envelope encryption (GenerateDataKey + local encryption), only small secrets ≤4KB use `Encrypt` directly.

**Encryption context is not encrypted** — AAD for integrity and permission conditions only; never put secrets (logged plaintext in CloudTrail).

**At-rest vs in-transit encryption** — SSE-KMS/EBS/RDS are at-rest; TLS enforcement (aws:SecureTransport/force_ssl/redirect-to-https) is in-transit. Separate and both needed.

**Auto-rotation vs manual rotation** — auto updates key material only (identifier retained, symmetric CMK), doesn't re-encrypt old data. Manual creates new key + updates alias (asymmetric/BYOK).

**Disable vs deletion** — disable is immediate/reversible; deletion is 7-30 day wait/irreversible (crypto-shredding).

**SSE-S3 vs SSE-KMS** — SSE-S3 means S3 manages keys (no audit/control); SSE-KMS means KMS control, CloudTrail audit, cross-account possible.

> ⚠️ **Trap Collection**:
> - Delete key policy's `Enable IAM User Permissions` statement orphans the key.
> - Cross-account: set only key policy or only IAM, missing one side.
> - Put secrets in encryption context, exposed plaintext in CloudTrail.
> - Expect "toggle to encrypt" for unencrypted RDS/EBS (snapshot path needed).
> - Think auto-rotation re-encrypts existing data (it doesn't).
> - Try auto-rotation on asymmetric/BYOK keys (unsupported).
> - Choose deletion to immediately neutralize suspect key (disable is reversible).
> - Expect single-region-key encrypted data to decrypt cross-region without multi-region keys.

## Visibility: Prove Your Encryption

Data protection must also be *proven*. **CloudTrail** logs all KMS operations (Encrypt/Decrypt/GenerateDataKey/grant changes/key policy changes), **AWS Config** continuously evaluates encryption compliance (`encrypted-volumes`, `s3-bucket-server-side-encryption-enabled`, `rds-storage-encrypted`), and **Security Hub** aggregates non-compliance findings. Turning on a control is the start; verifying and auditing it with data is what operational security is. Next week (Data Protection 2: Secrets Manager, certificates, S3 advanced protection) follows.

## One-Line Summary Checklist

- [ ] For governance (policy, rotation, cross-account), chose customer managed key
- [ ] Large data uses envelope encryption; external encryption/signing uses asymmetric
- [ ] Encryption context binds context and conditions, no secrets
- [ ] Temporary/granular permissions use grant; restricted paths use `kms:ViaService`
- [ ] Cross-account configures both key policy and IAM
- [ ] Transit encryption *enforced* (HTTP blocked); at-rest defaults enabled
- [ ] Regular rotation configured correctly: auto (symmetric) or manual (asymmetric/BYOK)
- [ ] Suspect keys use disable (reversible); all KMS use audited via CloudTrail/Config

---

## 📝 Practice Questions

**Question 1.** A multi-tenant SaaS stores large per-tenant files in S3. Which design satisfies per-tenant decryption isolation, KMS cost management, full auditing, and regular rotation?

A) SSE-S3 + a separate KMS key for each object  
B) SSE-KMS (customer managed key) + per-object encryption context `tenant=<id>` with a `kms:EncryptionContext` condition + S3 Bucket Key + automatic rotation + CloudTrail  
C) Clients upload in plaintext and control access with IAM only  
D) All tenants share an AWS managed key  

**Answer: B**  
Explanation: SSE-KMS based on a customer managed key provides auditing, control, and rotation; the tenant condition on the encryption context isolates decryption per tenant; the S3 Bucket Key eases KMS call cost and throttling; automatic rotation provides regular replacement without operational burden; and CloudTrail handles full auditing. SSE-S3 has no auditing or control, plaintext upload gives up encryption at rest, and sharing an AWS managed key makes policy and isolation control impossible.

---

**Question 2.** A security account owns and manages a KMS key and workload accounts use it, but regular accounts must be prevented from deleting the key or changing its policy. What is the most appropriate combination?

A) Configure only the workload accounts' IAM policies  
B) Security account key policy allow + workload account IAM allow (both sides) + restriction with `aws:PrincipalOrgID` + SCP that Denies deletion and policy changes  
C) Replicate the key to all accounts  
D) Switch to an AWS managed key  

**Answer: B**  
Explanation: The correct answer is three-layer governance: cross-account use requires both the key policy and the using account's IAM to allow it, `aws:PrincipalOrgID` limits it to within the organization, and an SCP adds a guardrail that Denies `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy` for regular accounts. IAM alone fails because there is no delegation, and replicating the key or switching to an AWS managed key conflicts with the central control requirement.

---

**Question 3.** An external partner without KMS call permission must encrypt data and send it to us, and at the same time the partner must be able to verify the integrity of documents we issue. What is the most appropriate key configuration?

A) Share a single symmetric key  
B) An asymmetric key for encryption/decryption (public key distributed to the partner) + an asymmetric key for signing/verification (we sign with the private key, the partner verifies with the public key)  
C) SSE-S3  
D) Grant a grant to the partner's account  

**Answer: B**  
Explanation: To let the partner only encrypt without KMS call permission, use an asymmetric key (public key distributed, private key inside KMS), and for document integrity verification use an asymmetric signing key (private-key signing, public-key verification). Sharing a symmetric key exposes decryption permission as well, SSE-S3 is unrelated to external encryption and signing, and a grant is unsuitable for a partner who has no KMS call permission at all.

---

**Question 4.** Which of the following is NOT frequently cited as a *pitfall* in this week's data protection design?

A) Trying to turn on encryption for an existing unencrypted RDS instance with an "encryption toggle"  
B) Mistakenly believing that automatic rotation re-encrypts existing data with the new key  
C) Configuring *both* the key policy and the using account's IAM in a cross-account setup  
D) Putting a password in the encryption context so it is exposed in plaintext in CloudTrail  

**Answer: C**  
Explanation: Cross-account KMS access requires *both* the key policy allow and the using account's IAM allow, so configuring both is not a pitfall but the correct design. The rest are all genuinely frequent pitfalls: RDS cannot be encrypted with a toggle (it must go through a snapshot), automatic rotation does not re-encrypt existing data, and the encryption context is not encrypted, so putting secrets in it exposes them in plaintext. Because the question asks you to choose what is *not* a pitfall, the answer is configuring both sides.

---

**Question 5.** You must neutralize a customer managed key suspected of being compromised immediately, while being able to recover quickly if it turns out to be a false positive. What is the most appropriate action?

A) Schedule deletion in 7 days with `ScheduleKeyDeletion`  
B) Disable the key, revoke related grants and policies, and investigate - disable takes effect immediately and is reversible  
C) Delete only the key alias  
D) Create a multi-Region replica  

**Answer: B**  
Explanation: Disabling a key takes effect immediately and is reversible, so it suits emergency, recoverable neutralization in a suspected-compromise situation, and revoking grants and policies in parallel reduces exposure. `ScheduleKeyDeletion` is an irreversible deletion after a waiting period, so the data can never be decrypted; deleting an alias does not stop key usage; and creating a replica is unrelated to neutralization.

---
