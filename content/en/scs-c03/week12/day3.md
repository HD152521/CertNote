# Day 3 - Integrated Review Domains 5 & 6: Data Protection ↔ Security Foundations and Governance

Domains 5 (Data Protection, ~18%) and 6 (Security Foundations and Governance, ~14%) close the exam's arc. Relationship: **Domain 5 asks "how do we encrypt/isolate/retain data?" while Domain 6 asks "how do we enforce that across organization scale?"** Specialty answers take a control working in one account and propagate it organization-wide. Today we bind KMS-centric data protection with Organizations-centric enforcement into one control-propagation model.

## Data Protection: KMS as the Center

| Key Type | Possession | Rotation | Use Case |
|---|---|---|---|
| AWS managed | AWS | Auto (1yr) | Free, service default |
| Customer managed (CMK) | Customer (policy/grant) | Optional auto/manual | Control needed |
| Imported key material | Customer bring (BYOK) | Manual re-import | Source control |
| CloudHSM-backed custom key store | Customer HSM (FIPS L3) | — | Regulated, dedicated |

> 💡 **Core**: KMS uses *envelope encryption*. Master key (KEK) encrypts data key (DEK); bulk data encrypts with local DEK. `GenerateDataKey` returns plaintext DEK (immediate use, memory-only) and encrypted DEK (stored with data). So we don't send bulk to KMS repeatedly, yet KMS controls keys. "Why not encrypt directly?" → envelope encryption.

### KMS Access: Key Policy vs IAM vs Grant

KMS access: **key policy is primary authority** (unlike IAM alone). Core rules:
- Key policy must trust account root for IAM policies to delegate.
- **Grant**: Temporary, granular delegation (service uses key on user's behalf). Expirable, revocable.
- Key deletion: Not immediate — *7-30 day wait*. Before completion, *disable* to revert.

### Data Protection Tools

- **S3 Object Lock (WORM)** + MFA Delete + versioning → Prevent tampering/deletion (ransomware/regulation).
- **Bucket policy `aws:SecureTransport`** → Force TLS (reject plain HTTP).
- **ACM** → Issue certificates, auto-renewal (CloudFront = us-east-1 only).
- **Macie** → S3 sensitive data discovery (Domain 1 connection).
- **RDS/EBS/EFS encryption** → Specify KMS key at creation (later difficult → snapshot re-encrypt).

> 🎯 **Scenario A**: "Regulation requires keys solely owned/controlled, S3 encrypted by that key, audit key usage." Answer: **CloudHSM-backed KMS custom key store** (sole ownership, FIPS L3) → S3 SSE-KMS (policy controls access) → CloudTrail KMS API (Decrypt/GenerateDataKey) audit. Key ownership + control + audit = trinity.

## Governance: Enforce Control Org-Scale

| Tool | Role |
|---|---|
| AWS Organizations | Multi-account structure, OUs, consolidated billing foundation |
| SCP | OU/account permission ceiling (guardrail) |
| Control Tower | Landing zone, guardrails, account factory auto |
| AWS Config | Config compliance evaluation, history, auto-remediation |
| Conformance Pack | Config rules bundled, org-deployed |
| Firewall Manager | WAF/SG/Shield policy org-wide enforce |
| Service Catalog | Approved infra products self-service |
| RAM | Cross-account resource share |

> 💡 **Spirit**: Governance = *preventive (SCP denial) + detective (Config evaluation) + responsive (auto-remediation)* guardrail combo. **SCP = prevent** (can't do), **Config = detect** (spot violations), **auto-remediation = respond** (fix). Control Tower packages these.

### SCP Guardrail Examples

- Block root use, deny off-region, deny CloudTrail disable, deny untagged resource creation, deny non-approved instance types. **Ceiling only, not granting**.

> 🎯 **Scenario B**: "Org-wide: (1) S3 buckets encrypt+TLS-enforce, (2) CloudTrail unstoppable, (3) violations auto-discovered and auto-corrected." Answer: (1) **Config Conformance Pack** org-deploy `s3-bucket-server-side-encryption`+`s3-bucket-ssl-requests-only` + auto-remediate, (2) **SCP** deny `cloudtrail:StopLogging`/`DeleteTrail` (prevent), (3) Config non-compliant → EventBridge → SSM/Lambda auto-correct (respond). Preventive+detective+responsive org-scale.

## Dual-Domain Mental Model

```
[Data Protection: One Account]        [Governance: Org-Scale]
KMS (envelope, policy)  ──┐
SSE-KMS / TLS force      ├──► Correct controls  ──► SCP (prevent) ────────┐
Object Lock (WORM)       │                        Config (detect+fix) ──┼─► All accounts
RDS/EBS encrypt          ┘                        Control Tower      │   auto-propagate
Audit: CloudTrail(KMS API) + Config(history)      Firewall Manager ──┘
```

Drift is the real exam point: correctly encrypted/locked once doesn't persist if someone disables or new account comes bare. Mature: Control Tower auto-applies guardrails, Config constantly evaluates drift, SCP makes violation impossible.

## 📝 Practice Questions

**Question 1.** Due to regulatory requirements, the organization must solely own and control the key material (a dedicated FIPS 140-2 Level 3 HSM), encrypt S3 with that key, and audit key usage. What is the most appropriate combination?

A) SSE-S3 + default key + Macie  
B) A CMK in a CloudHSM-backed KMS custom key store + S3 SSE-KMS + auditing KMS API calls with CloudTrail  
C) Use only SSE-C (customer-provided keys)  
D) AWS managed key + automatic rotation  

**Answer: B**

---

**Question 2.** What is the name of the approach in which KMS issues data keys instead of directly encrypting large S3 objects, and why is it used?

A) Symmetric key rotation — cost savings  
B) Envelope encryption — KMS encrypts the data key (DEK) with the master key, and the actual data is encrypted locally with the plaintext DEK, so large data is not sent to KMS while KMS still controls the key  
C) Client-side hashing — ensuring integrity  
D) TLS tunneling — transport protection  

**Answer: B**

---

**Question 3.** We want to ensure that no one in any account of the organization can turn off CloudTrail. What is the most effective preventive control?

A) Only detect after the fact with a Config rule  
B) Deny `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` with an SCP so it is impossible in the first place  
C) Manually attach policies to each IAM user  
D) Monitor with GuardDuty  

**Answer: B**

---

**Question 4.** We want to deny plaintext HTTP access to an S3 bucket and allow only TLS. What is the correct method?

A) Set the bucket to public  
B) Add a condition to the bucket policy that Denies when `aws:SecureTransport` is false  
C) Block port 80 with a NACL  
D) Turning on only SSE-KMS automatically enforces TLS  

**Answer: B**

---

**Question 5.** We want to quickly build a landing zone where standard guardrails (logging, encryption, Region restriction) are automatically applied to newly added accounts as well. What is the most appropriate service?

A) Manually configure Config and SCPs in each account  
B) AWS Control Tower — automatically apply controls to new accounts with a landing zone, guardrails, and Account Factory  
C) Use only CloudFormation StackSets  
D) Use only IAM Identity Center  

**Answer: B**

---

**Question 6.** You mistakenly requested deletion of a KMS CMK and then realized that data encrypted with that key still remains. What is the correct action to prevent data loss?

A) Immediately create a new key and replace it with the same ID  
B) Key deletion has a 7 to 30 day waiting period, so cancel the deletion within that period or revert it to disabled  
C) Give up, since the data cannot be recovered  
D) Modify the IAM policy  

**Answer: B**

---
