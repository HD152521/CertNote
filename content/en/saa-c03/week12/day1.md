# Day 1 - Why the Security Domain Converges on a Single One-Line Algorithm Called "Policy Evaluation Order"

On the SAA exam, the security domain (Domain 1) carries the largest weight at 30% of the total. Yet many test-takers approach this domain as "memorizing service names like IAM, KMS, WAF, and GuardDuty" and then collapse on the scenario questions. The reason is simple. What the exam asks is not a service name but a verdict: **"Is this request allowed or blocked, and why?"** And that verdict almost always reduces to a single algorithm — the IAM policy evaluation logic. Reviewing the security domain properly means mapping 25 keywords to services while simultaneously understanding the three axes beneath that mapping: **evaluation order, trust boundaries, and the encryption hierarchy**.

This article re-weaves Domain 1 not as a flat memorization table but as a flow: "When a single request arrives at AWS, in what order does it pass through the checkpoints?" We follow that inspection chain from identity (who are you) to authorization (what may you do), to encryption (how is data protected), to network boundaries (how far in can you come), and finally to detection and response (what went wrong). Most of the exam's traps come from muddling the **priority rules** that decide which stage of this chain beats another.

> 💡 **Related theory**: At the root of security design lies the classic information-security model, the **CIA Triad** (Confidentiality, Integrity, Availability). These three axes were established in 1970s US Department of Defense security research and are the taproot of modern security standards. Mapping AWS's security services onto these axes brings the whole field into focus — KMS, encryption, and IAM handle confidentiality; Object Lock, signing, and hashing handle integrity; Shield, Multi-AZ, and backups handle availability. Overlay **Defense in Depth** (layered defense, borrowed by the NSA from military strategy) and **Zero Trust** (the "never trust, always verify" model defined by NIST SP 800-207), and it becomes clear why AWS stacks SG, NACL, WAF, and IAM in multiple layers. Even if a single line of defense is breached, the next layer holds.

## IAM Policy Evaluation Begins With a Single Rule: "An Explicit Deny Beats Everything"

The process by which IAM decides whether to allow a request works counter to intuition. Many people think "if there is even one Allow, it's permitted," but the actual algorithm is stricter. When a single request comes in, AWS evaluates, in order: **① Is there an explicit Deny → if so, block immediately**, ② Does the SCP (organizational guardrail) permit it, ③ Is it within the intersection of the Resource policy, Permission Boundary, and Session policy, ④ Is there an explicit Allow in the Identity policy. Among these, an **explicit Deny outranks any Allow** — if one policy Allows and another Denies, the result is unconditionally Deny. The default is an "implicit deny," and without an Allow, access is automatically blocked.

Understanding this evaluation order lines up Domain 1's identity and authorization keywords in a single row. **IAM** is the core of users, roles, and policies. An **SCP** (Service Control Policy) is a ceiling draped over the entire organization — if the SCP blocks something, it doesn't matter that an account admin granted an Allow (a guardrail). A **Permission Boundary** is a ceiling on an individual user/role, a safeguard that prevents a delegated administrator from granting more than their own permissions. **STS** is the engine that issues temporary credentials, and on top of it sit **IAM Identity Center** for employee SSO, **Cognito User Pools** for application-user login (JWT issuance), and **Cognito Identity Pools**, which exchange those users for temporary roles that can access AWS resources.

> 🔍 **Going deeper**: The internal principle by which an EC2 instance accesses S3 without hardcoding access keys in the code lives in the **Instance Metadata Service (IMDS)**. When you attach an IAM Role to EC2, AWS plants temporary credentials (a key + session token issued by STS, usually auto-rotated every 6 hours) at the metadata endpoint on the link-local address 169.254.169.254. The SDK queries this endpoint automatically to obtain the key, so no secret remains in the code. The crux for both the exam and practice here is **IMDSv2** — v1 was a plain HTTP GET, so metadata could be exfiltrated via SSRF (Server-Side Request Forgery) attacks, but v2 is a **session-oriented** scheme that returns data only after you first obtain a session token via PUT, making it hard to bypass with SSRF. The 2019 Capital One incident was precisely this IMDSv1 + SSRF combination that leaked 100 million customer records, which is why AWS has since pushed to make IMDSv2 the default and enforced.

> 📚 **Case study**: The July 2019 Capital One data breach is the most-cited incident in cloud security history. An external attacker (a former AWS employee) succeeded with an SSRF attack through a misconfigured WAF and extracted the IAM Role's temporary credentials from the EC2 instance's IMDSv1. Because those credentials had excessively broad permissions (over-privilege, a violation of least privilege), the attacker could read entire S3 buckets, and roughly 106 million credit-card application records were exposed. The lesson is threefold — ① block the SSRF path with IMDSv2, ② grant IAM Roles **only least privilege**, and ③ a single firewall misconfiguration (WAF/SG) can bring down the whole chain. This is why the SAA exam repeatedly asks "EC2 should use a Role, not hardcoded keys."

## Encryption Is Layered by the Envelope Structure of "Who Holds the Key"

Encryption keywords get confusing because KMS, CloudHSM, Secrets Manager, and Parameter Store look similar. But they each take a different layer within a single structure called **envelope encryption**. Envelope encryption means the actual data is encrypted with a fast symmetric key (the DEK, Data Encryption Key), and that DEK itself is in turn encrypted with a master key (CMK/KEK) and stored alongside the data. To decrypt the data, you ask KMS to "unwrap this encrypted DEK," decrypt the data with the returned plaintext DEK, then immediately wipe it from memory. This avoids the inefficiency of encrypting large data directly with KMS (KMS only processes up to 4KB directly) while gaining the safety that the master key never leaves KMS.

Within this structure, each service's place is fixed. A **KMS CMK** is a multi-tenant service that manages master keys. **CloudHSM** is a dedicated (single-tenant) hardware security module certified to FIPS 140-2 Level 3, used when regulation requires keys to sit on customer-dedicated hardware. **Secrets Manager** stores DB passwords and API keys and, as its differentiator, even performs **automatic rotation** (periodic replacement via Lambda). **Parameter Store** stores configuration values and SecureStrings but has no automatic rotation, making it simpler and cheaper. On the S3 side, **SSE-S3** (AWS-managed keys) and **SSE-KMS** (customer KMS keys, controlled by key policy) diverge, and if KMS call costs become a burden, **S3 Bucket Keys** reduce the number of calls.

> 💡 **Related theory**: Envelope encryption applies cryptography's **key hierarchy** principle to the cloud. If you encrypt all data directly with one master key, exposure of that key endangers everything, and rotating the key requires re-encrypting all data. Separating a DEK per datum, by contrast, means master-key rotation only needs to re-wrap the DEK (no data re-encryption), and the master key is used only inside the HSM/KMS, minimizing its exposure surface. This pattern — protecting data with a symmetric key (AES-256, fast) and protecting that key with a more securely held key — recurs throughout security systems, from TLS session-key exchange to disk encryption (LUKS). It is a universal design.

> ⚠️ **Pitfall**: SSE-KMS is not "turn on KMS encryption for the bucket and you're done." For a different account or role to read that object, **the KMS key policy must also name that principal** — opening the bucket policy alone is not enough. Accessing an encrypted object requires **both** ① S3 permission on the object and ② `kms:Decrypt` permission on the KMS key that wrapped it. On the exam, when a scenario reads "can't access a cross-account encrypted S3 object," the answer is almost always "add the target account/role to the KMS key policy." Likewise, a perennial trap: if automatic rotation is needed, it must be Secrets Manager, not Parameter Store.

## Network Boundaries Split Along the Combination of Stateful vs. Stateless and Allow-Only vs. Deny-Capable

The core of network-security keywords is knowing exactly **the difference between Security Groups and NACLs**. Both filter traffic, but their operating models are opposites. A **Security Group** is a **stateful** firewall operating at the instance (ENI) level; you can only write Allow rules (no Deny), and the response to an inbound request is automatically permitted without a rule. A **NACL** (Network ACL), by contrast, is a **stateless** filter at the subnet level; you can write **both** Allow and Deny, but you must specify inbound and outbound separately, and response traffic also needs its own rule. So when a requirement reads "block a specific malicious IP," the answer is unconditionally NACL — because SG has no Deny rule at all.

On top of this sit application-layer defense and detection services. **WAF** blocks L7 (HTTP) attacks (SQL injection, XSS) and integrates with CloudFront, ALB, API Gateway, AppSync, and Cognito. **Shield** is L3/L4 DDoS defense (Standard is free; Advanced is paid + SLA + DRT support). The detection trio has cleanly divided roles — **GuardDuty** analyzes logs (VPC Flow, DNS, CloudTrail) with ML to catch **threat behavior**, **Inspector** scans **OS/software vulnerabilities (CVEs)** on EC2/containers, and **Macie** auto-classifies and detects **PII (personal data)** in S3. Gathering them onto one screen is **Security Hub** (unified scoring/compliance), digging into an incident as a graph is **Detective**, and enforcing WAF/SG rules across the whole organization is **Firewall Manager**.

> 🔍 **Going deeper**: The precise meaning of "SG is stateful" is that it maintains a **connection tracking** table. When an instance opens an outbound connection, AWS's hypervisor-level firewall remembers that connection's 5-tuple (source/destination IP/port, protocol) and lets the response packets through without checking the inbound rules. This is why SG "auto-permits responses." A NACL has no such state table and compares every packet against the rule table (applying the first match in rule-number order), so if you don't explicitly write an outbound Allow for the response ports (usually ephemeral ports 1024–65535), the response is blocked. This stateless nature makes NACL configuration finicky, which is why the standard practice is to use NACLs only for broad blocking (Deny on specific CIDRs) and leave fine-grained control to SGs.

> ⚠️ **Pitfall**: "Treating GuardDuty / Inspector / Macie as the same thing" is Domain 1's biggest trap. Distinguish them instantly by scenario keyword — "abnormal API calls, cryptomining, communication with known malicious IPs" is **GuardDuty** (threats), "unpatched CVEs / software vulnerabilities on EC2" is **Inspector** (vulnerabilities), "is there sensitive data like credit-card or national-ID numbers in S3" is **Macie** (PII). And all three only detect; they do not auto-block — blocking must be wired up by triggering Lambda via EventBridge or by connecting Security Hub automation.

## Data Protection and the Priority Rule — Why Does Block Public Access Beat Everything

Domain 1's final axis is "safeguards that keep you from accidentally exposing data." **S3 Block Public Access (BPA)** is the archetype, and its power lies in the fact that **even if an IAM policy or bucket policy allows public, BPA unconditionally blocks it when enabled**. That is, BPA is a final blocking layer laid on top of policy evaluation, so even if someone accidentally opens a bucket to public, data doesn't leak. WORM (Write Once Read Many) regulatory requirements are met with **S3 Object Lock** (or Glacier Vault Lock), which locks objects as undeletable/unchangeable for a set period. Enforcing encryption in transit is done with the bucket policy's `aws:SecureTransport` condition (deny HTTP, allow HTTPS only), and multi-region key sharing is solved with a **KMS Multi-Region Key**.

The core here is the consistent principle running through the entire security domain: **"explicit blocks and global guardrails beat individual allows."** An SCP beats account permissions, an explicit Deny beats an Allow, and BPA beats a bucket policy. The exam loves traps that ask this priority in reverse — something like "I allowed public via the bucket policy, so why is access blocked?"

> 💡 **Related theory**: This "block-first" design is the implementation of security engineering's **fail-safe defaults** principle. One of the 8 security-design principles laid out by Saltzer and Schroeder in 1975, it means "the default for an access decision must be denial, and permissions must be granted explicitly." IAM's implicit deny (blocked if no policy), BPA's unconditional block, and the whitelist model of NACL/SG all follow this principle. The opposite model (default allow, block only exceptions) leads straight to exposure if you miss a single rule, which is dangerous in a cloud environment with thousands of configuration items. This is why AWS consistently adopts "default deny + explicit allow + global blocking layer."

> 📚 **Case study**: The countless "S3 bucket exposure" incidents repeated since 2017 — Verizon (14 million customer records), Accenture (internal credentials), a US Department of Defense contractor (several TB of intelligence-gathering data), and others — all shared a common cause: buckets accidentally set to public-read. These happened so frequently that AWS introduced **Block Public Access** in 2018 and later shifted policy to enable BPA by default on new buckets. The lesson is that "security must be designed on the assumption of human error" — far more effective than educating people to write policies correctly is placing a final blocking layer so that even a badly written policy doesn't cause exposure. This is the backdrop for BPA appearing on the SAA exam as "beats the policy."

## Comparing Other Clouds' Security Models

Relativizing AWS's security services sharpens the keyword mapping.

| Category | AWS | Azure | GCP |
|------|-----|-------|-----|
| Identity & authorization | IAM + STS | Entra ID (formerly AAD) + RBAC | Cloud IAM |
| Organizational guardrail | SCP | Azure Policy / Management Group | Organization Policy |
| Key management | KMS / CloudHSM | Key Vault / Managed HSM | Cloud KMS / Cloud HSM |
| Secrets management & rotation | Secrets Manager | Key Vault Secrets | Secret Manager |
| Threat detection | GuardDuty | Microsoft Defender for Cloud | Security Command Center |
| Unified security score | Security Hub | Defender for Cloud | Security Command Center |

All three clouds share the same skeleton: "policy-based access control + key management + threat detection + a unified dashboard." The difference is naming and integration style — Azure bundles both detection and scoring into a single Defender for Cloud, whereas AWS splits things finely into GuardDuty (detection), Inspector (vulnerabilities), Macie (data), and Security Hub (integration) so each can be turned on and off individually. This modularity is why the AWS exam asks so precisely "which signal word maps to which service."

> 🔍 **Going deeper**: Behind every security-domain decision lies the **Shared Responsibility Model**. AWS is responsible for "security of the cloud" — physical data centers, the hypervisor, managed-service infrastructure — while the customer is responsible for "security in the cloud" — IAM configuration, encryption choices, SG rules, patching. This boundary moves with the service's abstraction level. With EC2 (IaaS), OS patching and the firewall are all the customer's; with RDS (managed), OS and DB-engine patching are AWS's; with Lambda/S3 (serverless/managed), the customer is responsible only for code, data, and access policies. When the exam asks "whose responsibility is this security task?", solve it with this sliding rule: **the more managed the service, the larger AWS's responsibility**.

## Checking It Yourself with the CLI

```bash
# Evaluate whether a specific request is allowed/denied with the IAM policy simulator
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/AppRole \
  --action-names s3:GetObject --resource-arns arn:aws:s3:::my-bucket/*

# Turn on S3 Block Public Access (global block)
aws s3api put-public-access-block --bucket my-bucket \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Configure Secrets Manager automatic rotation (30-day cycle)
aws secretsmanager rotate-secret --secret-id prod/db/password \
  --rotation-lambda-arn arn:aws:lambda:...:function:RotateFn \
  --rotation-rules AutomaticallyAfterDays=30

# Enforce IMDSv2 on EC2 (SSRF defense)
aws ec2 modify-instance-metadata-options --instance-id i-0abc \
  --http-tokens required --http-endpoint enabled

# Enable GuardDuty
aws guardduty create-detector --enable
```

## Wrapping Up

The security domain looks like memorizing 25 keywords, but it is really a structure of three axes stacked on a single evaluation principle: **"explicit blocks and global guardrails beat individual allows."** ① **Identity and authorization** are ordered by the IAM evaluation sequence (explicit Deny > SCP > Boundary > Allow), and EC2 eliminates hardcoded keys with Role + IMDSv2. ② **Encryption** is layered via envelope encryption (KMS master key > DEK); automatic rotation is Secrets Manager, FIPS L3 is CloudHSM, and multi-region is KMS MRK. ③ **Network and detection** split along the difference between SG (stateful, Allow-only) and NACL (stateless, Deny-capable), and the division of labor among GuardDuty (threats), Inspector (vulnerabilities), and Macie (PII). Over all of these decisions, the Shared Responsibility Model lays down the sliding rule "the more managed, the more it's AWS's responsibility." Capital One and the repeated S3 exposure incidents prove in reality why "least privilege and a final blocking layer" are exam regulars.

In the next article, we'll re-weave Domain 2, resilience architecture, the same way — not by keywords but by the principle of "blast radius and replication mode."

---

## 📝 연습 문제

**문제 1.** An IAM user has an Identity policy granting read permission on an S3 bucket. However, the SCP of the organization the user belongs to explicitly Denies that S3 action. What is the result?

A) The Identity policy's Allow takes precedence, so access is permitted
B) The SCP's explicit Deny takes precedence, so access is blocked
C) The two conflict, so it's decided after administrator approval
D) If a bucket policy exists, it makes the final decision

**정답: B**

해설: In IAM policy evaluation, an **explicit Deny takes precedence over any Allow**, and an SCP is a guardrail (ceiling) draped over the entire organization, so even if an in-account Identity policy grants an Allow, an SCP Deny blocks it unconditionally. The evaluation order is explicit Deny → SCP permission → Boundary/Resource/Session intersection → Identity Allow. A has the evaluation order backwards, C is wrong because IAM has no such conflict-approval mechanism, and D is wrong because a bucket policy cannot beat an explicit Deny or SCP either. Key signal: "SCP Denies" = every Allow above it is void.

---

**문제 2.** An EC2 application needs to access S3. What is the most recommended approach for security, and what defense should be applied alongside it?

A) Hardcode access keys in the code and manage them via environment variables
B) Attach an IAM Role to the instance and enforce IMDSv2
C) Open the bucket to public-read and access it without keys
D) Route access through a NAT Gateway to bypass permission needs

**정답: B**

해설: When EC2 calls an AWS API, attach an **IAM Role (instance profile)** instead of hardcoding access keys, so IMDS automatically provides temporary credentials. On top of that you must **enforce IMDSv2** to prevent SSRF attacks from stealing the credentials from metadata — the 2019 Capital One incident leaked 100 million records precisely via IMDSv1 + SSRF. A risks key exposure, C exposes all data, and D is an irrelevant network path (NAT does not provide authentication). "EC2 → API = Role + IMDSv2" is a security-domain regular answer.

---

**문제 3.** A company wants to encrypt large data stored in S3 with KMS while reducing KMS API call costs. Additionally, another account must read these encrypted objects. What are the two necessary actions?

A) Enable S3 Bucket Keys + add the target account to the KMS key policy
B) Switch to SSE-S3 + modify only the bucket policy
C) Move the key to CloudHSM and modify the bucket policy
D) Store the key in Parameter Store and add an IAM user

**정답: A**

해설: KMS call-cost reduction is solved with **S3 Bucket Keys**, which reduce per-object KMS calls to a bucket-level key. Cross-account access requires **naming the target account/role in the KMS key policy**, because reading an encrypted object requires both the S3 permission and `kms:Decrypt` permission. B's SSE-S3 doesn't use a customer KMS key, so it doesn't fit key-policy control or the Bucket Keys cost model; C's CloudHSM is overkill absent a FIPS L3 dedicated-HSM requirement; and D is unrelated to KMS master-key management. "Cross-account encrypted object = add to KMS key policy" is the crux.

---

**문제 4.** A security team wants to detect, respectively, (1) whether EC2 has unpatched CVEs, (2) whether someone is abnormally communicating for cryptomining, and (3) whether S3 contains PII like national-ID numbers. What is the correct combination of services?

A) (1) GuardDuty (2) Inspector (3) Config
B) (1) Inspector (2) GuardDuty (3) Macie
C) (1) Macie (2) Inspector (3) GuardDuty
D) (1) Config (2) Macie (3) Inspector

**정답: B**

해설: The three detection services have cleanly divided roles — **Inspector** scans EC2/container OS and software **vulnerabilities (CVEs)**, **GuardDuty** ML-analyzes logs to detect **threat behavior** like cryptomining and malicious-IP communication, and **Macie** auto-classifies **PII** in S3. Confusing these three is Domain 1's biggest trap. Keyword matching: "CVE/patch" → Inspector, "abnormal behavior/mining/malicious IP" → GuardDuty, "sensitive data/PII" → Macie. All three only detect; blocking must be wired via EventBridge + Lambda.

---

**문제 5.** A bucket allows public-read via its bucket policy, yet objects cannot be accessed externally. What is the most likely cause?

A) The IAM user lacks permission
B) S3 Block Public Access is enabled, voiding the bucket policy's public allow
C) The KMS key has expired
D) The NACL is blocking traffic

**정답: B**

해설: **S3 Block Public Access (BPA)** is a final blocking layer that unconditionally blocks even when a bucket policy or ACL allows public — the consistent security-domain principle that "a global block beats an individual allow." AWS introduced it after the repeated S3 exposure incidents (Verizon, Accenture, etc.) and enables it by default on new buckets. A doesn't fit an external (unauthenticated) access scenario, C is wrong because BPA would be the prior cause even for encrypted objects, and D's NACL is usually not the cause of such policy-priority issues. "Opened public via policy but it doesn't work" = suspect BPA.

---

**문제 6.** Due to regulation, a company must manage encryption keys in a FIPS 140-2 Level 3 certified environment on its own dedicated hardware. What is the appropriate service?

A) KMS CMK B) CloudHSM C) Secrets Manager D) Parameter Store

**정답: B**

해설: **CloudHSM** is a FIPS 140-2 Level 3 certified **single-tenant dedicated hardware security module**, used for regulatory requirements that keys be isolated on customer-dedicated hardware. KMS (A) is convenient but a multi-tenant managed service, so it doesn't directly satisfy a "dedicated HSM / FIPS L3" requirement (KMS is also HSM-backed but a shared model). Secrets Manager (C) and Parameter Store (D) are key-storage / secrets-management services, not HSMs. "Dedicated HSM / FIPS Level 3 / keys on my own hardware" = CloudHSM is the answer signal.

---

**문제 7.** A team wants to block traffic coming from a specific malicious IP range (CIDR) across an entire subnet. What is the appropriate tool?

A) Add a Deny rule to a Security Group
B) Add a Deny rule for that CIDR to a NACL
C) Deny the IP with an IAM policy
D) Modify the KMS key policy

**정답: B**

해설: To **block (Deny)** a specific IP, you must use a **NACL** — a subnet-level stateless filter that supports **both** Allow and Deny rules. **A Security Group allows only Allow rules and has no Deny** (A), so it cannot block an IP. An IAM policy (C) governs AWS API permissions, not network packets, and a KMS key policy (D) is unrelated to encryption permissions. "IP block / broad subnet block" = NACL Deny is the answer. The Allow-only vs. Deny-capable difference between SG and NACL is Domain 1's key distinction.

---

## 📌 Key Takeaways

The security domain (30%) is a structure of three axes stacked on a single evaluation principle: "explicit blocks and global guardrails beat individual allows." ① Identity and authorization are ordered by the IAM evaluation sequence (explicit Deny > SCP > Boundary > Identity Allow), and EC2 eliminates keys with Role + IMDSv2 (the lesson of the Capital One incident). ② Encryption is layered via envelope encryption (KMS master key > DEK); automatic rotation = Secrets Manager, FIPS L3 = CloudHSM, and cross-account encrypted objects require adding to the KMS key policy. ③ Network and detection split along the difference between SG (stateful, Allow-only) and NACL (stateless, Deny-capable), the division of labor among GuardDuty (threats), Inspector (vulnerabilities), and Macie (PII), and the fail-safe principle that BPA beats the bucket policy. Every responsibility boundary is solved with the Shared Responsibility Model's "the more managed, the more it's AWS's responsibility" rule.
