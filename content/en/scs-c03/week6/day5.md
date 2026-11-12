# Day 5 - Week 6 Integration: Secrets, Storage, and Sensitive Data Scenario Review

This week we covered the second axis of data protection — secrets (Secrets Manager), storage security (S3 encryption, access control, exposure prevention), certificates (ACM), and sensitive information classification (Macie). Today we integrate individual services into *scenarios*, reviewing in the way exams actually test — combining multiple controls to satisfy one requirement. The key is not "what does each service do" but "which combination is correct for this requirement."

## Integrated Mental Model: Four Layers of Data Protection

```
[1. Discovery·Classification]  Macie → "Where is what" (sensitivity labeling)
       ↓
[2. Rest Encryption] SSE-KMS / DSSE-KMS / Object Lock → "Protect dormant state + immutability"
       ↓
[3. Access Control]  Bucket policy / Access Point / BPA / VPC Endpoint → "Who, from where"
       ↓
[4. Channel·Secrets] ACM(TLS) + Secrets Manager(credential rotation) → "Protect in-transit + lifecycle"
```

> 💡 **Related Theory**: These four layers implement *defense in depth* on the data plane. If any one layer is breached (e.g., credential compromise), the next layer holds — compromised keys accessing S3 face KMS key policy denying decryption (layer 2), VPC endpoint condition blocking external paths (layer 3), and Object Lock Compliance physically preventing deletion (layer 2). The principle is not single-point reliance but *overlapping independent-failure controls*.

## Scenario 1: Rotating DB Credential + Zero Downtime

**Requirement**: Auto-rotate RDS master password every 30 days with zero auth failures. Rotation Lambda accesses private subnet DB.

**Combination**:
- Secrets Manager + alternating-users rotation strategy → zero downtime
- Deploy rotation Lambda in same VPC as DB + Secrets Manager VPC endpoint (or NAT) → API call path secured
- Encrypt secret with CMK → key policy grants Decrypt to rotation Lambda role only
- App uses caching client, minimizing GetSecretValue calls

> ⚠️ **Pitfall summary**: single-user risks brief auth failures → use alternating-users + master secret reference. Rotation Lambda not reaching Secrets Manager from VPC → timeout. ARN policy requires `-*` suffix wildcard.

## Scenario 2: Immutable Regulatory Data Retention

**Requirement**: Retain audit logs for 7 years, deletion impossible even by root. Dual-encryption regulation applies.

**Combination**:
- Versioning + Object Lock **Compliance Mode** (7 years) → even root cannot delete
- **DSSE-KMS** → satisfies dual-encryption regulation
- Bucket policy Deny `aws:SecureTransport:false` → in-transit protection
- MFA Delete redundant with Compliance (Compliance already absolute immutability)

> 🎯 Key distinction: "Authorized user can bypass for operational flexibility" → Governance. "Absolutely no one" → Compliance. "Dual-encryption regulation" → DSSE-KMS (else SSE-KMS).

## Scenario 3: Exfiltration Prevention

**Requirement**: Company confidential bucket data never leaves company VPC.

**Combination**:
- Create S3 gateway VPC endpoint
- Bucket policy: `aws:SourceVpce` StringNotEquals Deny → block all paths except specified endpoint
- VPC endpoint policy: `aws:ResourceOrgID` condition → endpoint only accesses our org buckets
- Bidirectional lock constructs *data perimeter*

> 💡 Data perimeter is trusted identity (PrincipalOrgID) + trusted resource (ResourceOrgID) + trusted network (SourceVpce) combined. None alone is sufficient.

## Scenario 4: High Traffic + KMS Cost/Throttle

**Requirement**: SSE-KMS bucket sees KMS ThrottlingException and cost explosion.

**Combination**: **Enable S3 Bucket Key** — replace per-object KMS calls with bucket-level key derivation, reducing calls by 99%. (Note: DSSE-KMS is not compatible with Bucket Key, so inappropriate here.)

## Scenario 5: Sensitive Data Discovery → Auto-Response

**Requirement**: PII uploaded to public bucket → instant detection and remediation.

**Combination**:
- Macie sensitive data detection + bucket security posture assessment → generate findings
- EventBridge rule catches findings → Lambda applies BPA and fixes policy
- Security Hub multi-account aggregation
- (Macie S3-only — DB PII is out of scope)

## Scenario 6: Cross-Account Secret + Certificates

**Requirement**: Account B app reads account A secret. App serves via ACM certificate HTTPS.

**Combination**:
- Secret: CMK encryption + resource policy (account B allowed) + KMS key policy (account B Decrypt) + account B IAM policy → three-policy intersection
- TLS: ALB + ACM public certificate (DNS validation, auto renewal). CloudFront requires us-east-1 issuance.

## Quick Decision Table

| Requirement Keyword | Answer |
|---------------------|--------|
| DB password auto-rotation | Secrets Manager + Lambda rotation |
| Zero-downtime rotation | alternating-users strategy |
| Rotation unnecessary, cost-minimal simple secret | Parameter Store SecureString |
| Cross-account secret | CMK + resource policy + KMS key policy |
| Key access separation and audit needed | SSE-KMS |
| Dual-encryption regulation | DSSE-KMS |
| Do not entrust key to AWS | SSE-C |
| KMS cost/throttle mitigation | S3 Bucket Key |
| Root cannot delete within retention | Object Lock Compliance |
| Authorized user can override retention | Object Lock Governance |
| Block accidental public exposure | Block Public Access |
| Enforce only specific key encryption | Bucket policy conditional Deny |
| Force HTTPS | aws:SecureTransport:false Deny |
| Prevent exfil outside VPC | aws:SourceVpce Deny + endpoint policy |
| Split giant bucket policy | S3 Access Point |
| Continuously detect external exposure | IAM Access Analyzer |
| S3 PII detection/classification | Macie |
| Unattended TLS renewal | ACM + DNS validation |
| EC2 direct TLS termination | ALB+ACM or Private CA export |

> 🔍 **Deeper Dive**: Exam traps often are "similar but subtly wrong" choices. SSE-KMS vs DSSE-KMS (look for dual-encryption keyword), Governance vs Compliance (override possible or not), single vs alternating (downtime or not), Macie S3-only (DB answer is wrong), ACM public cert EC2 non-installable, CloudFront cert requires us-east-1 — mastering these boundaries separates pass from fail. Everyone knows "what does it do," but "when is this and when is that" is Specialty depth.

---

## 📝 Practice Questions

**Question 1.** Audit logs must be retained for 7 years, and deletion within the retention period must be absolutely impossible even if root credentials are stolen in a breach. In addition, regulation requires a double encryption layer. What is the correct combination?

A) SSE-S3 + Object Lock Governance + versioning  
B) DSSE-KMS + Object Lock Compliance + versioning  
C) SSE-KMS + MFA Delete + versioning  
D) SSE-C + Object Lock Governance  

**Answer: B**  
Explanation: "Not deletable even by root" is satisfied only by Object Lock Compliance (which requires versioning), and the "double encryption regulation" is satisfied by DSSE-KMS. Governance is unsuitable because those with bypass permission can delete, MFA Delete still allows a root user who holds MFA to delete, and SSE-S3/SSE-C are not double encryption.

---

**Question 2.** You want to prevent data in a confidential company bucket from leaving the VPC network controlled by the company. What is the most complete combination?

A) Enable only Block Public Access  
B) Add an aws:SourceVpce StringNotEquals Deny to the bucket policy, and in the VPC endpoint policy allow only organization buckets using the ResourceOrgID condition  
C) Encrypt with SSE-KMS  
D) Scan the bucket with Macie  

**Answer: B**  
Explanation: The data perimeter is completed by two-way containment: the bucket policy uses `aws:SourceVpce` to enforce "my bucket is accessible only through this endpoint," and the endpoint policy uses `aws:ResourceOrgID` to make "this endpoint go only to our organization's buckets." BPA only blocks public access and cannot enforce the VPC path, encryption does not block exfiltration paths, and Macie is a detection tool.

---

**Question 3.** You want to automatically rotate the RDS master password, the rotation Lambda must reach the DB in a private subnet, and there must be no authentication failures during rotation. Which two key elements, if missing, cause the rotation to fail?

A) The alternating-users strategy, and placing the Lambda in the DB VPC with a Secrets Manager VPC endpoint (or NAT) provided  
B) The single-user strategy and placement in a public subnet  
C) Switching to Parameter Store and MFA  
D) DSSE-KMS and Object Lock  

**Answer: A**  
Explanation: Zero-downtime rotation is achieved with the alternating-users strategy, and for private DB access plus Secrets Manager API calls, the rotation Lambda must be placed in the same VPC with a Secrets Manager VPC endpoint (or NAT) provided. If either one is missing, rotation fails or authentication failures occur. Single-user risks momentary failures, Parameter Store does not support rotation, and DSSE/Object Lock are unrelated to rotation.

---

**Question 4.** In a very high-traffic bucket that uses SSE-KMS, KMS ThrottlingException errors and a cost spike occur at the same time. There is no double encryption regulation. What is the optimal solution?

A) Switch to DSSE-KMS  
B) Enable the S3 Bucket Key  
C) Switch to SSE-C  
D) Disable encryption  

**Answer: B**  
Explanation: The S3 Bucket Key obtains a bucket-level key from KMS once and S3 derives object data keys locally, reducing KMS calls by up to 99% and solving throttling and cost at the same time. DSSE-KMS increases KMS calls and is incompatible with the Bucket Key, SSE-C imposes a heavy key management burden, and disabling encryption is a security violation.

---

**Question 5.** An application in Account B must read a Secrets Manager secret in Account A. Which policy configuration is required in full?

A) Only Account B's IAM policy  
B) Secret resource policy (allow Account B) + CMK key policy (allow Account B Decrypt) + Account B IAM policy (GetSecretValue and Decrypt)  
C) Bucket policy and BPA  
D) Encrypt the secret with an AWS managed key and use only a resource policy  

**Answer: B**  
Explanation: Cross-account secret access is authorized by the intersection of three policies: the secret resource policy allows Account B, the secret is encrypted with a CMK whose key policy allows Account B's Decrypt, and the Account B IAM policy grants GetSecretValue and kms:Decrypt. With only an IAM policy, the resource and key policies block access, and an AWS managed key cannot have its key policy edited, so it cannot allow cross-account decryption. Bucket policy/BPA are S3 controls and are irrelevant.

---
