# Day 5 - Week 6 Synthesis: Integrated Review of Secrets, Storage, and Sensitive Data Scenarios

This week covered the second axis of data protection: secrets (Secrets Manager), storage security (S3 encryption, access control, and exposure prevention), certificates (ACM), and sensitive data classification (Macie). Today we weave the individual services into *scenarios* and review them the way the exam actually asks (combining several controls to satisfy a single requirement). The point is not "what does each service do" but "which combination is the right answer for which requirement."

## Integrated Mental Model: Four Layers of Data Protection

```
[1. Discovery and classification]  Macie → "what is where" (sensitivity labeling)
       ↓
[2. Encryption at rest] SSE-KMS / DSSE-KMS / Object Lock → "protection at rest + immutability"
       ↓
[3. Access control]  Bucket policy / Access Point / BPA / VPC endpoint → "who accesses, from where"
       ↓
[4. Channel and secrets] ACM (TLS) + Secrets Manager (credential rotation) → "protection in transit + credential lifecycle"
```

These four layers are the data-plane implementation of *defense in depth*. Even if one layer is breached (for example, credential theft), the next layer blocks: even if S3 is accessed with a stolen key, the KMS key policy refuses decryption (layer 2), the VPC endpoint condition blocks external paths (layer 3), and Object Lock Compliance physically prevents data deletion (layer 2). The point is to stack *multiple controls that fail independently* rather than relying on a single control.

### The Whole Picture of Control Placement

```
                        ┌──────────── Organization boundary (Organizations) ────────────┐
                        │  SCP: ceiling on the whole account's permissions              │
                        │  aws:PrincipalOrgID / aws:ResourceOrgID                       │
                        └───────────────────┬───────────────────────────────────────────┘
                                            │
   [Discovery]   Macie ──finding──→ EventBridge ──→ Lambda automated remediation
                 IAM Access Analyzer ──list of externally exposed resources
                                            │
   [Path]        VPC endpoint (policy) ──→ S3 / Secrets Manager / KMS
                 aws:SourceVpce Deny blocks other paths
                                            │
   [Authorization] IAM ∩ bucket policy ∩ AP policy      (explicit Deny wins)
                                            │
   [Encryption]  SSE-KMS (+Bucket Key) / DSSE-KMS   ← KMS key policy = second gate
                 Secrets Manager (CMK) ← only the rotation Lambda can Decrypt
                                            │
   [Immutability] Versioning → Object Lock → separate backup account
                                            │
   [Evidence]    CloudTrail management/data events · server access logs · Security Hub
```

The glue that joins the layers in this picture is **condition keys** and **EventBridge**. Condition keys make static controls bite each other (reject uploads without encryption, reject access from outside the VPC), and EventBridge connects detection and response dynamically. Most exam scenarios reduce to the question "which layer of this picture is empty?"

Applying the 2019 Capital One breach to this four-layer model makes it clear why each layer is needed. The attacker used SSRF to obtain role credentials from EC2 metadata and read S3 data. The bucket was not public and the data was encrypted, but because it was a *normal API call by a principal with legitimate permissions*, layer 3 (access control) stayed open as is. Tracing this incident back through this week's controls goes like this: if the S3 permissions granted to the role had been minimal, the readable scope would have been narrow (layer 3); if the SSE-KMS key policy had not allowed that role's `kms:Decrypt`, it would have been blocked at decryption (layer 2); if the bucket policy had an `aws:SourceVpce` condition, that path would not have worked in the first place (layer 3); and if CloudTrail S3 data events had been on, the bulk reads would have been noticed much sooner (visibility). It is a situation where any single layer would have reduced the damage, which is why defense in depth does not mean "layering several is good" but **"design on the premise that one will be breached."**

## Scenario 1: Rotating DB Credentials + Zero Downtime

**Requirement**: Automatically rotate the RDS master password every 30 days with zero authentication failures. The rotation Lambda accesses a DB in a private subnet.

**Combination**:
- Secrets Manager + alternating-users rotation strategy → zero downtime
- Place the rotation Lambda in the same VPC as the DB + a VPC endpoint (or NAT) for Secrets Manager → secures the API call path
- Encrypt the secret with a CMK → allow only the rotation Lambda role to Decrypt via the key policy
- The application uses a caching client to minimize GetSecretValue calls

> ⚠️ **Trap summary**: single-user can cause momentary authentication failures → alternating-users + master secret reference. If the rotation Lambda cannot reach Secrets Manager from inside the VPC, rotation times out. ARN policies need the `-*` suffix wildcard.

**Diagnostic order** (when rotation fails silently):

```
1. CloudTrail: is there a RotationFailed event?  → if not, rotation was never triggered at all
2. Lambda logs: at which step is the exception?
      createSecret / finishSecret fails → Lambda ↔ Secrets Manager path/permissions
      setSecret / testSecret fails      → Lambda ↔ DB path / DB user permissions
3. Check permissions: PutSecretValue, UpdateSecretVersionStage, kms:Decrypt/GenerateDataKey
4. Check the network: interface VPC endpoint + private DNS + SG 443
```

```bash
aws secretsmanager describe-secret --secret-id prod/db/mysql \
  --query '{Enabled:RotationEnabled,Last:LastRotatedDate,Next:NextRotationDate}'
aws secretsmanager rotate-secret --secret-id prod/db/mysql --rotate-immediately
```

## Scenario 2: Immutable Retention of Regulated Data

**Requirement**: Retain audit logs for 7 years, with deletion impossible even for the root account. A dual-encryption regulation applies.

**Combination**:
- Versioning + Object Lock **Compliance mode** (7 years) → not even root can delete
- **DSSE-KMS** → satisfies the dual-encryption regulation
- A `aws:SecureTransport:false` Deny in the bucket policy → protection in transit
- MFA Delete overlaps with Compliance mode (Compliance is already absolutely immutable)

> 🎯 Key distinction: "principals with authority must be able to bypass (operational flexibility)" → Governance. "No one can ever" → Compliance. "Dual-encryption regulation" → DSSE-KMS (otherwise SSE-KMS).

Add one more layer on top and ransomware is covered too: put the backup in a **separate account** and apply Object Lock in that account. Even if the production account is completely taken over, the retained versions in the backup account cannot be touched.

![Immutable retention structure that cross-replicates a production account bucket to a backup account and locks it with Object Lock](/diagrams/s3-cross-account-backup.svg)

> ⚠️ **Trap summary**: Object Lock must be enabled at **bucket creation time** (post-hoc enabling is an exceptional procedure). Versioning is a prerequisite, and objects within the retention period are **not deleted even by lifecycle policy**; when retention and cost optimization conflict, retention wins. Compliance can only **extend** the period and cannot shorten or release it, so do verification with Governance and move only production to Compliance.

## Scenario 3: Data Exfiltration Prevention

**Requirement**: Ensure the data in the company's confidential bucket can never leave the company VPC.

**Combination**:
- Create an S3 gateway VPC endpoint
- Bucket policy: `aws:SourceVpce` StringNotEquals Deny → blocks every path other than the designated endpoint
- VPC endpoint policy: `aws:ResourceOrgID` condition → this endpoint reaches only our organization's buckets
- Build a *data perimeter* with two-way sealing

A data perimeter is a combination of trusted identities (PrincipalOrgID) + trusted resources (ResourceOrgID) + trusted networks (SourceVpce). Any one alone is incomplete.

Remembering separately what each of the three axes blocks helps avoid wrong answers.

| Axis | What it blocks | What it cannot block | Condition keys |
|----|---------|----------------|---------|
| Trusted identities | External accounts reading our bucket | Our employees copying to an external bucket | `aws:PrincipalOrgID` |
| Trusted resources | Our principals writing to external buckets | Entry from outside into our bucket | `aws:ResourceOrgID`, `s3:ResourceAccount` |
| Trusted networks | Traffic over paths outside our control | Abuse within the controlled path | `aws:SourceVpce`, `aws:SourceIp` |

You must apply both the bucket policy side (filters what comes in) and the VPC endpoint policy/SCP side (filters what goes out) for both directions to close.

```json
{
  "Sid": "EndpointAllowsOnlyOrgBuckets",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceOrgID": "o-abcd1234ef",
      "aws:PrincipalOrgID": "o-abcd1234ef"
    }
  }
}
```

If you omit the **AWS service principal exception** when putting an organization-boundary Deny, legitimate paths such as CloudTrail log delivery, S3 replication, and Config snapshots are cut together. The practical standard is to evaluate `aws:PrincipalIsAWSService` with `BoolIfExists` to exclude service principals. Also, a request going through a VPC endpoint has no public source IP, so an `aws:SourceIp` condition does not match; an office IP allow list and a VPC endpoint condition must be opened as separate Statements.

## Scenario 4: High Traffic + KMS Cost and Throttling

**Requirement**: KMS ThrottlingException and a cost spike on an SSE-KMS bucket.

**Combination**: **Enable the S3 Bucket Key**: replace per-object KMS calls with bucket-level key derivation to cut calls by 99%. (DSSE-KMS is not compatible with Bucket Keys, so it is unsuitable here.)

## Scenario 5: Sensitive Data Discovery → Automated Response

**Requirement**: If PII is uploaded to a public bucket, detect it immediately and make the bucket private.

**Combination**:
- Macie sensitive data discovery + bucket security posture assessment → generates a finding
- An EventBridge rule catches the finding → Lambda applies BPA and corrects the policy
- Multi-account aggregation with Security Hub
- (Macie is S3-only; PII in databases is out of scope)

## Scenario 6: Cross-Account Secret + Certificate

**Requirement**: An app in account B reads a secret in account A, and the app serves HTTPS with an ACM certificate.

**Combination**:
- Secret: CMK encryption + resource policy (allow account B) + KMS key policy (account B Decrypt) + account B IAM policy → intersection of three policies
- TLS: ALB + ACM public certificate (DNS validation, automatic renewal). For CloudFront, issue it in us-east-1.

```
[ Three gates ]
Account B role ──GetSecretValue──→ ┌ Account B IAM policy
                                   ├ Account A secret resource policy
                                   └ Account A CMK key policy (kms:Decrypt)
  If the error points to KMS, it is the third; if it points to Secrets Manager, the first two.
```

## Scenario 7: Serving a Static Site Without Making It Public

**Requirement**: Serve a static website to the internet but never make the S3 bucket public.

**Combination**:
- Keep all four BPA switches + Object Ownership `BucketOwnerEnforced`
- Access the origin with CloudFront + **OAC** (Origin Access Control)
- The bucket policy allows the `cloudfront.amazonaws.com` service principal but limits it to a **specific distribution** with an `AWS:SourceArn` condition

If you omit the `AWS:SourceArn` condition, you get a confused deputy problem in which any CloudFront distribution can use this bucket as its origin. An answer that picks the older OAI for a new configuration is wrong (OAC supports SSE-KMS origins).

## Scenario 8: Converting Millions of Already-Stored Objects to SSE-KMS

**Requirement**: Convert all existing SSE-S3 objects to SSE-KMS based on a specific CMK.

**Combination**:
- Change bucket default encryption to SSE-KMS → applies **only to objects arriving from now on**
- Rewrite all existing objects with the **S3 Batch Operations Copy job**
- Afterward, to prevent recurrence, add a conditional Deny to the bucket policy (reject if not SSE-KMS + reject if not the specified key)
- If traffic is high, enable the Bucket Key as well

The choice "changing default encryption automatically converts existing objects too" is wrong. The encryption method is determined **when the object is written again**.

## Scenario 9: Serving the Same Data at Different Sensitivity Per Role

**Requirement**: Provide results with personal information masked to the analytics team and the original to the audit team. Do not increase data copies.

**Combination**:
- **S3 Object Lambda Access Point**: a Lambda transforms the GetObject response to mask it
- The analytics team role accesses only through the Object Lambda AP, and the audit team role through a standard AP
- The bucket policy Denies direct access where `s3:DataAccessPointArn` is `Null` to block bypass

> 🎯 An answer that "copies the data into two sets and masks one" is inferior because copies increase and the exfiltration surface and consistency problems grow.

## Scenario 10: Immediate Response to Leaked Credentials

**Requirement**: Signs of a compromised developer account. You must decide the response order for secrets and data.

**Combination (the order is the answer)**:
1. Cut off the suspect principal's permissions: modify the role trust policy, invalidate sessions
2. **Immediately rotate secrets** that may have been exposed (`rotate-secret --rotate-immediately`)
3. Determine the actual scope of reads/downloads with CloudTrail (for S3, **data events** must be on to confirm)
4. Forcibly terminate existing sessions on the target services (DB, etc.), and if needed narrow the decrypting principals through the KMS key policy

"Delete the secret" is wrong. Deletion has no immediate effect because of the recovery window and only stops the application. **The antidote to a leak is not deletion but rotation.**

## Perspective for Reading Logs and Results

Scenario questions include a type that asks "what should have been turned on?" The key is not to confuse the question each tool answers.

| Tool | Question it answers | Default |
|------|-------------|--------|
| CloudTrail management events | Who changed bucket policy, BPA, and encryption settings, and when | On |
| CloudTrail **data events** | Who read which object | **Off** (separate setup and billing) |
| S3 server access logs | Which request received which response code | Off |
| IAM Access Analyzer | Are there resources accessible from outside the organization | Enabled separately |
| AWS Config | Does the configuration comply with the rules (encryption, BPA, etc.) | Enabled separately |
| GuardDuty | Is the access pattern different from usual | Enabled separately |
| Macie | Is there sensitive data in it | Enabled separately |

> 🎯 **Scenario**: When "data exfiltration is suspected. Confirm which objects were actually exfiltrated" comes up, the premise of the answer is **CloudTrail S3 data events**. If they were not turned on, you can only know up to "when the policy changed" and can never know "what was read." The correct pattern is not to enable it on all buckets because of cost but to narrow the scope to sensitive buckets/prefixes.

## Quick Decision Table

| Requirement keyword | Answer |
|------------|------|
| Automatic DB password rotation | Secrets Manager + Lambda rotation |
| Zero-downtime rotation | alternating-users strategy |
| Simple secret with no rotation needed, minimum cost | Parameter Store SecureString |
| Cross-account secret | CMK + resource policy + KMS key policy |
| Key access separation and audit needed | SSE-KMS |
| Dual-encryption regulation | DSSE-KMS |
| Do not entrust the key to AWS | SSE-C |
| Ease KMS cost and throttling | S3 Bucket Key |
| Retention where even root cannot delete | Object Lock Compliance |
| Retention allowing principals with authority to bypass | Object Lock Governance |
| Block unintended public exposure | Block Public Access |
| Enforce encryption with only a specific key | Bucket policy conditional Deny |
| Enforce HTTPS | aws:SecureTransport:false Deny |
| Prevent exfiltration outside the VPC | aws:SourceVpce Deny + endpoint policy |
| Split a giant bucket policy | S3 Access Point |
| Continuously detect externally exposed buckets | IAM Access Analyzer |
| S3 PII detection and classification | Macie |
| Unattended TLS certificate renewal | ACM + DNS validation |
| Direct TLS termination on EC2 | ALB+ACM or Private CA export |
| External CA certificate uploaded to ACM | **Not** automatically renewed - expiry monitoring required |
| mTLS / IoT device certificates | Private CA + CRL/OCSP revocation |
| Serve a static site without making it public | CloudFront + OAC (+ `AWS:SourceArn` condition) |
| Convert the encryption method of existing objects | S3 Batch Operations Copy |
| Provide masked views per role | S3 Object Lambda Access Point |
| Block direct bucket access (force APs) | `s3:DataAccessPointArn` Null Deny |
| Track which objects were read | CloudTrail **data events** (enabled in advance) |
| Response to credential leak | **Immediate rotation**, not deletion |
| Ransomware that even deletes backups | Separate account + Object Lock + versioning |
| Data transfer to accounts outside the organization | `aws:ResourceOrgID` (endpoint policy/SCP) |
| Service principal exception when applying a policy Deny | `aws:PrincipalIsAWSService` BoolIfExists |

### Confusing Pairs Summarized

| Pair | The one-line divider |
|----|---------------|
| SSE-KMS vs DSSE-KMS | Does the question contain the regulatory wording "two independent encryption layers"? |
| Governance vs Compliance | Is it "cannot be bypassed even by principals with authority, including root"? |
| single vs alternating | Is it "zero authentication failures, zero downtime"? |
| Secrets Manager vs Parameter Store | Are rotation and cross-account needed, or is cost the priority? |
| Access Analyzer vs Macie | Does it ask about the exposure *path* or the data *content*? |
| Config vs GuardDuty | Is it configuration compliance or anomalous behavior? |
| BPA vs bucket policy | Is it blocking public exposure (guardrail) or fine-grained authorization? |
| OAC vs OAI | For a new configuration, always OAC (supports SSE-KMS origins) |
| `StringNotEquals` vs `...IfExists` | Must it deny when the header is **absent**, or not? |

The exam's traps are usually "similar but subtly wrong" choices. SSE-KMS vs DSSE-KMS (presence of the dual-encryption regulatory keyword), Governance vs Compliance (whether bypass is possible), single vs alternating (whether zero downtime), Macie being limited to S3 (DB is wrong), the inability to install an ACM public certificate directly on EC2, and issuing CloudFront certificates in us-east-1: distinguishing these boundaries precisely is what separates the passing line from the failing line. Everyone knows "what it does," but "when it is this and when it is that" is the depth of the Specialty.

## 📌 Key Takeaways

Every control this week converges on a single question: **"When this layer is breached, what blocks next?"** Secrets reduce the effective lifetime of a leak through rotation, encryption creates a second authorization gate in the form of the KMS key policy, access control nails down path and method with conditional Denies, immutability leaves data behind even after permissions have completely collapsed, and visibility answers what happened when all of these have failed. What the exam asks in scenarios is ultimately this too: finding *which layer is empty* in the requirement sentence and choosing the control that fills that layer. People who memorize service names waver in front of similar choices, but people who know the layers do not.

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
