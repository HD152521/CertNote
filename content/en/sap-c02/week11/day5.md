# Day 5 - Security Wrap-Up: Encryption, Detection, Unified Monitoring, and Edge Defense in One Scenario

AWS security doesn't end with a single service. Everything we saw in Week 11 stacks into **4 layers**: **encryption (KMS, CloudHSM)**, **detection (Macie, GuardDuty, Inspector)**, **unified monitoring (Security Hub, Detective, Audit Manager)**, and **edge defense (WAF, Shield, Firewall Manager, Network Firewall, DNS Firewall)**. Production-grade security is complete only when these four are organically combined. And security scenarios on the SAP-C02 exam almost always have **several layers appear in a single question at once** - "encrypt the data (L1), detect threats (L2), investigate incidents (L3), and defend the edge (L4)."

Today we review these 4 layers bundled into one scenario, and nail down the traps that collide most often on the Pro exam (Macie vs GuardDuty vs Inspector, Shield Standard vs Advanced, Network Firewall vs DNS Firewall, Security Hub vs Detective vs Audit Manager) as keyword → answer mappings. The key is that "similar names are different roles."

## The Big Picture of the 4 Security Layers

```
[Internet]
    │
─── L4 Edge defense ──────────────────────────────────
   Route 53 (DNS Firewall) → CloudFront (WAF+Shield) → ALB (WAF)
   → VPC (Network Firewall) / Firewall Manager (Org-wide bulk)
    │
─── L1 Encryption ────────────────────────────────────
   KMS (envelope encryption, MRK) / CloudHSM (FIPS L3) - protects data at rest and in transit
    │
─── L2 Detection ─────────────────────────────────────
   Macie (S3 content) / GuardDuty (behavior) / Inspector (vulnerabilities)
    │
─── L3 Unified monitoring ────────────────────────────
   Security Hub (current posture) / Detective (past investigation) / Audit Manager (compliance proof)
   ── Foundation: Config (configuration evaluation) + CloudTrail (API logs)
```

This 4-layer structure is an implementation of the security principle of **defense in depth**. What NIST SP 800-53 and the cyber kill chain model both emphasize is that - on the premise that any single control will be breached - you stack several independent layers so that even if one layer is breached, the next one blocks. The 2019 Capital One breach ironically proves this: WAF misconfiguration (L4) → SSRF to steal IMDS credentials → mass S3 exfiltration. If GuardDuty (L2, anomalous behavior detection) and stricter IAM least privilege had worked together, the chain would have been broken. This is why the Pro exam asks about "several layers in one scenario" - real-world security doesn't end with one layer.

## Layer 1: Encryption - KMS and CloudHSM

| Type | Key owner | Automatic rotation | Core use |
|------|---------|----------------|-----------|
| AWS Managed Key | AWS | Automatic every 1 year (mandatory) | Default service encryption |
| Customer Managed Key (CMK) | Customer | Can be enabled | Policy, rotation, and audit control |
| Multi-Region Key (MRK) | Customer | Possible | Cross-Region DR, decryption |
| Imported (BYOK) | Customer (external) | **Not possible** | Control of key origin, compliance |
| CloudHSM-backed | Customer (dedicated HSM) | Possible | FIPS 140-2 L3, single tenant |

Core reconfirmation - KMS works through **envelope encryption**. The master key (CMK) never leaves the HSM, the DEK obtained via `GenerateDataKey` encrypts the actual data locally, and only the encrypted DEK is stored with the data. Permissions are a triple check of **Key Policy (root) + IAM delegation + Grant (temporary)**.

Choosing a KMS key type is a trade of "control vs operational burden." An AWS Managed Key has zero operational burden but almost no policy or rotation control. A CMK gives full control but comes with $1 per key per month and the responsibility of managing policy. BYOK gives full control of the key origin but gives up automatic rotation. CloudHSM gives single tenancy and FIPS L3 but carries a large burden of cluster operations (HA, backup, user management). The exam asks about the balance point of this trade - "policy and audit control" means CMK, "externally generated + expiry" means BYOK, "single tenant + L3" means CloudHSM, and if there is no special requirement, the default is best.

(Hypothetical case) A fintech imported a key generated in its own HSM into KMS using BYOK. The advantage was that the key material was permanently kept in its own HSM so AWS could not permanently retain it (KMS keeps only a cache and deletes it on expiry). The disadvantage was that automatic rotation didn't work, so it had to re-import manually at every rotation. Lesson: BYOK is a trade that gains control at the cost of operational burden and automatic rotation.

> ⚠️ **Pitfall**: "Granting KMS permissions with an IAM Policy alone" is wrong. If the Key Policy lacks IAM delegation to the account root, IAM permissions are void. Also "immediate key deletion" is impossible - KMS enforces a 7-30 day PendingDeletion grace period (because key deletion = permanent data loss).

## Layer 2: The Three Detection Musketeers - Content, Behavior, Flaws

| Service | Looks at | Data source | Method |
|--------|------|------------|------|
| **Macie** | The **content** of S3 objects (PII/PCI) | S3 object bytes | ML content classification |
| **GuardDuty** | The **behavior** of accounts and networks | VPC FL, CloudTrail, DNS | Threat intel + ML |
| **Inspector v2** | The **flaws** (CVEs) of software | EC2, ECR, Lambda inventory | CVE database matching |

These three **don't overlap in data sources** - Macie uses object bytes, GuardDuty uses logs, Inspector uses inventory. This difference decides the answer.

> 🎯 **Scenario**: "Has a credit card number ever been stored in an S3 bucket" → **Macie** (content inspection). "EC2 is communicating with a known malicious IP" → **GuardDuty** (network behavior). "Scan for CVEs from missing EC2 OS patches" → **Inspector v2** (vulnerability DB). "Abnormal access behavior to S3" → **GuardDuty S3 Protection** (not Macie - it's behavior, not content).

GuardDuty's Protection modules are opt-in and each costs extra - S3 Protection (access anomalies), Malware Protection (EBS snapshot scanning, no agent required), EKS Protection (Kubernetes audit + runtime), RDS Protection (DB login anomalies), Lambda Protection (network anomalies). On the exam, "suspicious EKS runtime behavior" is EKS Protection, and "scan EC2 for malware without an agent" is Malware Protection. The secret to how GuardDuty works without an agent is that it "analyzes logs AWS already collects."

When Log4Shell (CVE-2021-44228) broke in 2021, simply knowing "where in our infrastructure there is a vulnerable Log4j" was a challenge in itself. Organizations that had Inspector v2 turned on automatically identified affected EC2 instances, ECR images, and Lambda functions as soon as the new CVE was registered in the NVD, without additional scanning. Lesson: the first step of vulnerability response is "knowing where it is," and continuous scanning + automatic re-evaluation decides the speed of 0-day response. However, Inspector only detects, and applying patches is the job of Patch Manager.

> ⚠️ **Pitfall**: The misconception that "Inspector applies patches." Inspector only detects and assesses. Applying patches is Systems Manager **Patch Manager** (a complementary relationship). "Finding vulnerabilities" = Inspector, "patching what was found" = Patch Manager.

## Layer 3: Unified Monitoring - Present, Past, Proof

| Service | Tense | Role |
|--------|------|------|
| **Security Hub** | Present | CSPM, standards checks (CIS/PCI/NIST) + Finding consolidation (ASFF) |
| **Detective** | Past | Graph-based incident investigation, root cause |
| **Audit Manager** | Proof | Automatic compliance evidence collection, audit reports |

Security Hub is "are we meeting the standards right now," Detective is "how did this incident happen," and Audit Manager is "how do we prove compliance." All three use **Config (configuration evaluation)** and **CloudTrail (API logs)** as their data foundation.

Security Hub belongs to the **CSPM (Cloud Security Posture Management)** category (third-party: Wiz, Prisma Cloud, Lacework). CSPM handles "configuration drift detection + identifying standards violations." Many of Security Hub's standards checks are implemented internally as **Config Rules**, so if Config is disabled, the checks show "No data" - an easy trap to use. Config is the evaluation engine and Security Hub is the security aggregation and standardization layer on top of it.

The decisive point where Audit Manager differs from Security Hub is **point-in-time vs continuous**. Security Hub looks at "this very moment." An audit demands evidence of "continuous compliance over a period" - fixing things the day before the audit won't do; you need timestamped evidence that controls worked throughout the quarter. That's why Audit Manager accumulates CloudTrail and Config evidence over time. "Real-time check" = Security Hub, "period evidence + report" = Audit Manager.

(Hypothetical case) A healthcare SaaS spent 3-4 weeks every time as engineers manually captured HIPAA audit evidence. With the Audit Manager HIPAA framework, evidence per control was collected and accumulated automatically, cutting preparation to a few days. Lesson: the cost of an audit lies not in "complying with controls" but in "proving compliance (collecting evidence)."

## Layer 4: Edge and DDoS Defense - Blocking by Layer

| Service | Layer | Applies to | Key point |
|--------|------|-----------|------|
| **WAF** | L7 | CloudFront, ALB, APIGW, AppSync, App Runner, Cognito | OWASP Managed Rules, Rate-Based |
| **Shield Standard** | L3/L4 | All AWS resources (free) | Automatic mitigation of volumetric/protocol attacks |
| **Shield Advanced** | L3-7 | Designated resources ($3,000/month~) | L7 + Cost Protection + SRT 24/7 |
| **Firewall Manager** | Policy | Entire Organization | Bulk, automatic deployment, drift remediation |
| **Network Firewall** | L3-7 | Inside the VPC | IDS/IPS, TLS Inspection (Suricata) |
| **DNS Firewall** | DNS | Queries originating from the VPC | Blocks malicious domains (name-based) |

DDoS is divided by OSI layer - Volumetric/Protocol (L3/L4, Shield), Application (L7, Shield Advanced + WAF Rate-Based). Following the principle "don't push to a higher layer what can be blocked at a lower layer," Shield absorbs volumetric attacks at the AWS edge and blocks them before they reach the application. The exam's first question is always "which layer is this attack?"

> 🎯 **Scenario**: "L7 HTTP flood DDoS + surging auto scale-out charges + no expert during the attack" → **Shield Advanced** (L7 protection + Cost Protection charge waiver + SRT 24/7). Standard has no L7 protection + no Cost Protection. WAF alone has no automatic DDoS mitigation or cost protection.

In 2020, AWS Shield mitigated a roughly 2.3 Tbps CLDAP reflection amplification DDoS (among the largest on record at the time). Such huge volumetric attacks cannot be absorbed by a single data center and can only be stopped by AWS's global edge capacity (tens of Tbps). Lesson: the essence of volumetric DDoS defense is "absorption capacity larger than the attack," and it is the area hardest for an individual company to build on its own.

Firewall Manager vs SCP vs Config. **Firewall Manager** = actively deploys security policies (WAF/Shield/SG/NWF), **SCP** = prohibits actions (deny guardrails), **Config** = evaluates non-compliance. "Org-wide WAF policy + automatic for new accounts" is Firewall Manager.

## Security Keyword → Answer Mapping (Memorization Table Right Before the Exam)

| Keyword | Answer | Layer |
|--------|------|--------|
| "Envelope encryption, large data + KMS" | GenerateDataKey + DEK | L1 |
| "Multi-Region decryption with the same key, DR" | MRK | L1 |
| "Externally generated key + expiry + no rotation" | Imported (BYOK) | L1 |
| "FIPS 140-2 L3 + single tenant" | CloudHSM / Custom Key Store | L1 |
| "KMS permissions with IAM only" | Wrong (Key Policy delegation required) | L1 |
| "Immediate key deletion" | Impossible (7-30 day PendingDeletion) | L1 |
| "PII/card numbers in S3 content" | Macie | L2 |
| "Abnormal S3 access behavior" | GuardDuty S3 Protection | L2 |
| "EC2 ↔ malicious IP, credential theft" | GuardDuty | L2 |
| "Detect EC2, ECR, Lambda CVEs" | Inspector v2 | L2 |
| "Apply patches for detected vulnerabilities" | Patch Manager | L2 |
| "Suspicious EKS runtime behavior" | GuardDuty EKS Protection | L2 |
| "Scan EC2 for malware without an agent" | GuardDuty Malware Protection | L2 |
| "Automatic CIS/PCI standards evaluation + consolidation" | Security Hub | L3 |
| "Incident timeline graph investigation" | Detective | L3 |
| "Automatic HIPAA audit evidence + report" | Audit Manager | L3 |
| "Automatic evaluation of resource non-compliance" | Config Rule | L3 |
| "SQL query of CloudTrail events" | CloudTrail Lake | L3 |
| "Immediate OWASP protection + minimal operations" | WAF Managed Rule Groups | L4 |
| "L7 DDoS + Cost Protection + SRT" | Shield Advanced | L4 |
| "Org-wide WAF/SG policy automation" | Firewall Manager | L4 |
| "IDS/IPS inside the VPC + TLS Inspection" | Network Firewall | L4 |
| "Block malicious domains inside the VPC" | DNS Firewall | L4 |
| "Block specific countries" | WAF Geo Match | L4 |
| "Single-IP L7 flood/brute force" | WAF Rate-Based | L4 |
| "EC2 access without human SSH" | SSM Session Manager | - |
| "Automatic secrets rotation" | Secrets Manager | - |

## Summary

AWS security is a combination of 4 layers (encryption → detection → unified monitoring → edge defense). Even within each layer, similar names play different roles - Macie (content) vs GuardDuty (behavior) vs Inspector (flaws), Security Hub (present) vs Detective (past) vs Audit Manager (proof), Shield Standard (L3/4) vs Advanced (L7 + cost protection), Network Firewall (VPC traffic) vs DNS Firewall (domain names). Since the Pro exam has several layers appear in one scenario, you need to train yourself to memorize keyword → answer mappings to the level of instant recall and to recall all 4 layers at once.

Next week (Week 12) is **advanced cost optimization** - the math of Savings Plans, Compute Optimizer, Cost Explorer, and hidden cost areas like S3 and NAT Gateway.

---

## 📝 Practice Questions

**Question 1.** You must build a DR environment that decrypts multi-Region RDS snapshots in both Regions. You want to restore immediately without extra KMS calls or re-encryption, and to control key access permissions separately per Region.

A) Cross-Region Copy + re-encrypt every time

B) Multi-Region Key (Primary + Replica)

C) AWS Managed Key

D) Import BYOK separately into each of the two Regions

**Answer: B**
Explanation: An MRK replicates the same key material to several Regions and has the same key ID, so ciphertext from one Region can be decrypted directly by the Replica in another Region. Access control is also separated through per-Region Key Policies. A is Region-bound and inefficient. C offers no policy or rotation control and is Region-bound. D makes the two imported keys different keys, so the same ciphertext cannot be decrypted on both sides, and automatic rotation is also impossible. Pitfall: "Cross-Region decryption with the same key + DR" is MRK.

---

**Question 2.** You must automatically detect and classify whether card numbers or SSNs have ever been stored in S3 buckets, and prioritize sensitivity per bucket.

A) Inspector v2

B) Macie

C) GuardDuty S3 Protection

D) Config Rule

**Answer: B**
Explanation: Macie scans S3 object content with ML to classify PII/PCI and assign sensitivity scores. A (Inspector) handles CVE vulnerabilities for EC2, ECR, and Lambda. C (GuardDuty S3 Protection) detects "anomalies in access behavior," not content inspection. D (Config) evaluates configuration, not object content classification. Pitfall: "sensitive data in S3 content" = Macie, "S3 access behavior anomalies" = GuardDuty.

---

**Question 3.** You must continuously and automatically detect known CVEs in EC2, container images (ECR), and Lambda, with automatic re-evaluation without extra scanning when new CVEs are published.

A) Inspector v2

B) Patch Manager

C) GuardDuty

D) Macie

**Answer: A**
Explanation: Inspector v2 continuously matches EC2, ECR, and Lambda inventory against the CVE DB and automatically re-evaluates when new CVEs are registered. B (Patch Manager) "applies" patches rather than "detecting and assessing" vulnerabilities (a complementary relationship). C (GuardDuty) detects behavior and threats, not CVE evaluation. D (Macie) is for S3 data. Pitfall: "automatic CVE detection and re-evaluation" = Inspector, "applying patches" = Patch Manager.

---

**Question 4.** You must detect anomalous behavior without an agent, such as EC2 communicating with a known malicious IP and IAM credentials being used from a Region that is not normally used.

A) Inspector v2

B) GuardDuty

C) Macie

D) WAF

**Answer: B**
Explanation: GuardDuty analyzes VPC FL, CloudTrail, and DNS and detects anomalies with threat intelligence (malicious IPs) + ML behavior baselining, and requires no agent. A is CVE evaluation, C is S3 data, and D is an L7 web filter. Pitfall: "communication with malicious IPs, abnormal behavior, no agent" = GuardDuty.

---

**Question 5.** Across 30 accounts, you want to automatically check compliance with the CIS and PCI standards and consolidate GuardDuty, Inspector, and Macie Findings into a single dashboard.

A) Trusted Advisor

B) Security Hub (Org delegated administrator)

C) Audit Manager

D) Detective

**Answer: B**
Explanation: Security Hub automatically checks the CIS, PCI, and NIST standards, consolidates all security Findings into ASFF, and manages all accounts through an Org delegated administrator. A is a general best-practice check, not a security standards consolidation hub. C collects audit evidence, not real-time checks or a dashboard. D is incident investigation. Pitfall: "automatic standards checks + Finding consolidation dashboard" = Security Hub.

---

**Question 6.** GuardDuty detected suspected EC2 credential theft. You must investigate deeply with a timeline graph to determine since when this instance communicated with which resources using which credentials, and identify the root cause.

A) Manual search in the CloudTrail console

B) Detective

C) X-Ray

D) Macie

**Answer: B**
Explanation: Detective consolidates VPC FL, CloudTrail, and GuardDuty Findings to build a behavior graph and visualizes entity relationships and the time axis to help with root cause investigation (you can jump straight from a Finding). A is a manual join, so it is slow and easy to miss things. C is application distributed tracing. D is for S3 data. Pitfall: "incident timeline, relationship visualization, root cause" = Detective.

---

**Question 7.** You were hit by an L7 HTTP flood DDoS, you want a waiver of the surging auto scale-out charges it caused, and you need 24/7 expert support during the attack.

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based only

D) CloudFront only

**Answer: B**
Explanation: Shield Advanced provides all of L7 DDoS protection + Cost Protection (charge waiver) + SRT 24/7. A is free but covers only L3/4, with no L7, Cost Protection, or SRT. C helps somewhat with L7 mitigation but has no cost protection or expert support. D is caching and distribution, not DDoS cost protection. Pitfall: the three keywords "L7 DDoS + Cost Protection + SRT" are exclusive to Shield Advanced.

---

**Question 8.** You must apply IDS/IPS to traffic inside the VPC and also decrypt and inspect encrypted traffic (TLS Inspection).

A) WAF

B) Network Firewall

C) Shield

D) GuardDuty

**Answer: B**
Explanation: Network Firewall is an L3-7 IDS/IPS based on Suricata rules that inspects traffic inside the VPC inline and supports TLS Inspection. A (WAF) covers only edge L7 web, not the whole VPC or TLS Inspection. C (Shield) is DDoS defense. D (GuardDuty) is log-based detection, not inline IPS or TLS Inspection. Pitfall: "IDS/IPS inside the VPC + TLS Inspection" = Network Firewall.

---

**Question 9.** You want to block EC2 instances in the VPC from reaching malware C2 servers or known malicious domains at the name resolution stage.

A) Block IPs with NACLs

B) WAF

C) Route 53 Resolver DNS Firewall

D) Security Group

**Answer: C**
Explanation: DNS Firewall blocks DNS queries originating from the VPC using a malicious domain list, stopping access to C2 and malicious domains at the name resolution stage. A and D (NACL/SG) are IP-based, and malicious domains' IPs change constantly, so they are unsuitable. B (WAF) is an inbound L7 web filter, not outbound DNS blocking. Pitfall: "block malicious domains (name-based)" = DNS Firewall.

---

**Question 10.** In a 500-account Organization, you want to apply the same WAF Managed Rule to every internet-facing ALB, apply it automatically to new accounts and resources, and automatically detect and remediate if someone turns WAF off.

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**Answer: B**
Explanation: Firewall Manager deploys WAF, Shield, SG, and Network Firewall policies in bulk at the Org level, applies them automatically to new accounts and resources, and automatically remediates drift. A (Config) is mainly about evaluating non-compliance, not actively deploying. C (SCP) prohibits actions (deny), not deploying policies. D (Control Tower) is landing zone governance. Pitfall: "multi-account security policy deployment + automatic for new + drift remediation" = Firewall Manager.

---

**Question 11.** You need FIPS 140-2 Level 3 key management in a single-tenant dedicated HSM, while the development team wants to keep using the existing KMS API (`Encrypt`/`Decrypt`) as is.

A) Plain KMS CMK (multi-tenant)

B) KMS Custom Key Store + CloudHSM

C) Secrets Manager

D) Imported Key Material

**Answer: B**
Explanation: A Custom Key Store keeps the KMS API while storing the actual keys only in the customer's dedicated CloudHSM (single tenant, FIPS L3). A is multi-tenant, so it falls short of the single-tenant L3 requirement. C is a secrets store, not HSM key management. D stores imported keys in KMS's multi-tenant HSM too, so it falls short of the single-tenant requirement. Pitfall: "single tenant + FIPS L3 + keep the KMS API" = Custom Key Store + CloudHSM.

---

**Question 12.** For an annual HIPAA audit, you must automatically collect per-control evidence (access logs, encryption settings, backup policies, etc.) across the audit period and generate a report for submission to the auditor.

A) Security Hub

B) Audit Manager

C) Detective

D) Config

**Answer: B**
Explanation: Audit Manager automatically collects and accumulates CloudTrail, Config, and Security Hub evidence per control of frameworks such as HIPAA and generates audit reports. A (Security Hub) is a point-in-time standards check, not period evidence accumulation or report automation. C (Detective) is incident investigation. D (Config) is an evaluation engine (it serves as an evidence source), not report packaging. Pitfall: "automatic audit evidence collection + report" = Audit Manager, "real-time check" = Security Hub.
