# Day 5 - Integrated Security: Encryption·Detection·Unified Monitoring·Edge Defense in One Scenario

AWS security doesn't end with a single service. Everything we saw in Week 11 **stacks into 4 layers** — **encryption (KMS·CloudHSM)**, **detection (Macie·GuardDuty·Inspector)**, **unified monitoring (Security Hub·Detective·Audit Manager)**, **edge defense (WAF·Shield·Firewall Manager·Network Firewall·DNS Firewall)**. Production-grade security only completes when these 4 layers combine organically. And SAP-C02 exam security scenarios **almost always have multiple layers appearing simultaneously in one question** — "encrypt the data (L1), detect threats (L2), investigate incidents (L3), defend the edge (L4)."

Today we integrate these 4 layers into one scenario for review, and nail down the most frequently conflicting traps in Pro exams (Macie vs GuardDuty vs Inspector, Shield Standard vs Advanced, Network Firewall vs DNS Firewall, Security Hub vs Detective vs Audit Manager) with keyword → correct answer mapping. The core is "similar names, different roles."

## 4-Layer Security Big Picture

```
[Internet]
    │
─── L4 Edge Defense ──────────────────────────────────
   Route 53(DNS Firewall) → CloudFront(WAF+Shield) → ALB(WAF)
   → VPC(Network Firewall) / Firewall Manager(Org bulk)
    │
─── L1 Encryption ────────────────────────────────────
   KMS(Envelope Encryption·MRK) / CloudHSM(FIPS L3) — protect data at rest·in transit
    │
─── L2 Detection ──────────────────────────────────────
   Macie(S3 content) / GuardDuty(behavior) / Inspector(vulnerabilities)
    │
─── L3 Unified Monitoring ─────────────────────────────
   Security Hub(current posture) / Detective(past investigation) / Audit Manager(compliance proof)
   ── Foundation: Config(setting evaluation) + CloudTrail(API logs)
```

> 💡 **Related Theory**: This 4-layer structure implements security's **defense in depth** principle. NIST SP 800-53 and cyber kill chain models commonly emphasize — assuming single controls are always penetrable, you stack multiple independent layers so if one layer breaks, the next blocks. The 2019 Capital One breach paradoxically proves this: WAF misconfiguration (L4) → SSRF stealing IMDS credentials → bulk S3 exfiltration. If GuardDuty (L2, anomalous behavior detection) and stricter IAM least privilege had worked together, the chain would have been broken. Pro exams ask "multiple layers in one scenario" for this reason — real-world security doesn't end with one layer.

## Layer 1: Encryption — KMS · CloudHSM

| Type | Key Ownership | Auto Rotation | Core Use |
|------|---------|----------------|-----------|
| AWS Managed Key | AWS | 1yr auto (forced) | Service default encryption |
| Customer Managed Key (CMK) | Customer | Activatable | Policy·rotation·audit control |
| Multi-Region Key (MRK) | Customer | Possible | Cross-Region DR·decryption |
| Imported (BYOK) | Customer(external) | **Not possible** | Key origin control·compliance |
| CloudHSM-backed | Customer(dedicated HSM) | Possible | FIPS 140-2 L3·single tenant |

Key reaffirmation — KMS uses **envelope encryption**. The master key (CMK) never leaves HSM, the DEK received via `GenerateDataKey` locally encrypts actual data, and only the encrypted DEK is stored with data. Permissions check with **Key Policy (root) + IAM delegation + Grant (temporary)** triple-check.

> 🔍 **Deeper Dive**: Choosing KMS key type is trading "control vs operational burden." AWS Managed Key has 0 operational burden but nearly no policy/rotation control. CMK gives full control but comes with $1/month per key and policy management responsibility. BYOK completely controls key origin but sacrifices auto rotation. CloudHSM gives single tenant/FIPS L3 but carries cluster operations (HA, backup, user management) burden. The exam asks about this trade-off balance point — "policy/audit control" means CMK, "external creation+expiry" means BYOK, "single tenant+L3" means CloudHSM, no special requirements means defaults are best.

> 📚 **Case Study**: A fintech imported keys created from their own HSM into KMS via BYOK, keeping key material permanently in their HSM (AWS can't permanently recover; KMS only caches, deletes on expiry). Advantage: key origin fully controlled. Disadvantage: no auto rotation — had to manually re-import each rotation. Lesson: BYOK is trading control gain for operational burden and loss of auto rotation.

> ⚠️ **Trap**: "Grant permissions with IAM Policy only" is wrong. Without IAM delegation in Key Policy to account root, IAM permissions are ineffective. Also "immediately delete key" isn't possible — KMS enforces 7-30 day PendingDeletion grace (key deletion = permanent data loss).

## Layer 2: Detection Trinity — Content · Behavior · Defects

| Service | Sees | Data Source | Method |
|--------|------|------------|------|
| **Macie** | S3 object **content** (PII/PCI) | S3 object bytes | ML content classification |
| **GuardDuty** | Account·network **behavior** | VPC FL·CloudTrail·DNS | Threat intel + ML |
| **Inspector v2** | Software **defects** (CVE) | EC2·ECR·Lambda inventory | CVE database matching |

These three have **non-overlapping data sources** — Macie is object bytes, GuardDuty is logs, Inspector is inventory. This difference determines the correct answer.

> 🎯 **Scenario**: "Does S3 bucket contain credit card numbers" → **Macie** (content inspection). "EC2 communicates with known malicious IP" → **GuardDuty** (network behavior). "EC2 OS missing patch CVE scan" → **Inspector v2** (vulnerability DB). "Abnormal access behavior to S3" → **GuardDuty S3 Protection** (not Macie — it's behavior, not content).

> 🔍 **Deeper Dive**: GuardDuty's Protection modules are opt-in with separate billing each — S3 Protection (access anomalies), Malware Protection (EBS snapshot scan, no agent required), EKS Protection (Kubernetes audit+runtime), RDS Protection (DB login anomalies), Lambda Protection (network anomalies). In exams, "EKS runtime suspicious behavior" means EKS Protection, "EC2 malware scan without agent" means Malware Protection. GuardDuty's agent-less operation comes from "analyzing logs AWS already collects."

> 📚 **Case Study**: When Log4Shell (CVE-2021-44228) hit in December 2021, "where in our infrastructure is vulnerable Log4j" itself was the challenge. Organizations with Inspector v2 enabled could **automatically identify all affected resources (EC2, ECR images, Lambda layers) without additional scanning** as soon as the new CVE registered in NVD. Lesson: vulnerability response's first step is "knowing where it is," and continuous scanning + auto re-evaluation determines 0-day response speed. But Inspector detects only; Patch Manager applies patches.

> ⚠️ **Trap**: The misconception that "Inspector applies patches." Inspector **detects and assesses only** ("this instance has this CVE"). **Patch application** is **Systems Manager Patch Manager's** job (complementary). "Find vulnerability" = Inspector, "patch found" = Patch Manager.

## Layer 3: Unified Monitoring — Current · Past · Proof

| Service | Tense | Role |
|--------|------|------|
| **Security Hub** | Current | CSPM·standards checks (CIS/PCI/NIST) + Finding integration (ASFF) |
| **Detective** | Past | Graph-based incident investigation·root cause |
| **Audit Manager** | Proof | Auto-collect compliance evidence·audit reports |

Security Hub asks "are we meeting standards now," Detective asks "how did this incident happen," Audit Manager asks "how do we prove compliance." All three use **Config (setting evaluation)** and **CloudTrail (API logs)** as data foundations.

> 💡 **Related Theory**: Security Hub belongs to **CSPM (Cloud Security Posture Management)** category (third-party: Wiz, Prisma Cloud, Lacework). CSPM's essence is "configuration drift detection + standards violation identification." Many Security Hub standards checks are implemented internally as **Config Rules**, so Config being inactive makes checks show "No data" — frequent exam trap. Config is the evaluation engine; Security Hub is the layer above aggregating and standardizing results from security perspective.

> 🔍 **Deeper Dive**: Audit Manager's decisive difference from Security Hub is **point-in-time vs continuous**. Security Hub sees "right now." Audits demand "sustained compliance during the period" — you can't fix settings just before audit and prove compliance. Audit needs timestamp evidence that controls worked throughout the period. Audit Manager accumulates evidence over time. "Real-time checks" = Security Hub, "period evidence+reports" = Audit Manager.

> 📚 **Case Study**: A healthcare SaaS wasted 3-4 weeks per HIPAA audit having engineers manually capture evidence. After enabling Audit Manager's HIPAA framework, control-mapped evidence from CloudTrail, Config, Security Hub **automatically accumulated with timestamps**, report generation became one button click. Prep time dropped to days. Lesson: audit cost is "proving compliance (evidence collection)," not "maintaining controls."

## Layer 4: Edge and DDoS Defense — Blocking by Layer

| Service | Layer | Targets | Core |
|--------|------|-----------|------|
| **WAF** | L7 | CloudFront·ALB·APIGW·AppSync·App Runner·Cognito | OWASP Managed Rule·Rate-Based |
| **Shield Standard** | L3/L4 | All AWS resources (free) | volumetric/protocol auto mitigation |
| **Shield Advanced** | L3-7 | Designated resources ($3,000/month~) | L7+Cost Protection+SRT 24/7 |
| **Firewall Manager** | Policy | Organization-wide | bulk deployment·auto·drift correction |
| **Network Firewall** | L3-7 | VPC internal | IDS/IPS·TLS Inspection (Suricata) |
| **DNS Firewall** | DNS | VPC-egress queries | block malicious domains (name-based) |

> 💡 **Related Theory**: DDoS divides by OSI layer — Volumetric/Protocol (L3/L4, Shield), Application (L7, Shield Advanced+WAF Rate-Based). Following the principle "block at lower layers before reaching higher layers," Shield absorbs volumetric attacks at AWS edge to prevent application reach. The exam's first question is always "what layer is this attack?"

> 🎯 **Scenario**: "L7 HTTP flood DDoS + auto scale-out cost spike + no specialist during attack" → **Shield Advanced** (L7 protection + Cost Protection waives charges + SRT 24/7). Standard lacks L7 protection+Cost Protection. WAF alone lacks auto DDoS mitigation and cost protection.

> 📚 **Case Study**: In 2020, AWS Shield mitigated record-scale DDoS (approx 2.3 Tbps CLDAP reflection amplification). Such massive volumetric attacks can't be absorbed by single data centers and need AWS's global edge capacity (tens of Tbps). Lesson: volumetric DDoS defense's essence is "absorption capacity exceeding attack," hardest for individuals to build themselves.

> ⚠️ **Trap**: Firewall Manager vs SCP vs Config. **Firewall Manager** = proactively deploy security policies (WAF/Shield/SG/NWF), **SCP** = forbid actions (denial guardrails), **Config** = assess non-compliance. "Org-wide WAF policy + new accounts auto" is Firewall Manager.

## Security Keyword → Answer Mapping (Pre-Exam Memorization Table)

| Keyword | Answer | Layer |
|--------|--------|--------|
| "Envelope encryption·large data + KMS" | GenerateDataKey + DEK | L1 |
| "Multi-Region same-key decrypt·DR" | MRK | L1 |
| "External-created key + expiry + no-rotation" | Imported(BYOK) | L1 |
| "FIPS 140-2 L3 + single tenant" | CloudHSM / Custom Key Store | L1 |
| "Permission via IAM only" | Wrong (Key Policy delegation required) | L1 |
| "Delete key immediately" | Impossible (7~30d PendingDeletion) | L1 |
| "S3 content PII/card numbers" | Macie | L2 |
| "S3 abnormal access behavior" | GuardDuty S3 Protection | L2 |
| "EC2 ↔ malicious IP·credential theft" | GuardDuty | L2 |
| "EC2·ECR·Lambda CVE detection" | Inspector v2 | L2 |
| "Apply patches to detected vulnerabilities" | Patch Manager | L2 |
| "EKS runtime suspected behavior" | GuardDuty EKS Protection | L2 |
| "EC2 malware scan without agent" | GuardDuty Malware Protection | L2 |
| "CIS/PCI standards auto-check + integration" | Security Hub | L3 |
| "Incident timeline graph investigation" | Detective | L3 |
| "HIPAA audit evidence auto-collect·report" | Audit Manager | L3 |
| "Resource non-compliance auto-evaluation" | Config Rule | L3 |
| "CloudTrail event SQL query" | CloudTrail Lake | L3 |
| "OWASP immediate protection + minimal ops" | WAF Managed Rule Groups | L4 |
| "L7 DDoS + Cost Protection + SRT" | Shield Advanced | L4 |
| "Org-wide WAF/SG policy auto" | Firewall Manager | L4 |
| "VPC internal IDS/IPS + TLS Inspection" | Network Firewall | L4 |
| "VPC internal malicious domain blocking" | DNS Firewall | L4 |
| "Block specific country" | WAF Geo Match | L4 |
| "Single IP L7 flood/brute force" | WAF Rate-Based | L4 |
| "EC2 access without SSH" | SSM Session Manager | - |
| "Auto-rotate Secrets" | Secrets Manager | - |

## Summary

AWS security combines 4 layers (encryption → detection → unified monitoring → edge defense). Within each layer, similar names serve different roles — Macie (content) vs GuardDuty (behavior) vs Inspector (defects), Security Hub (current) vs Detective (past) vs Audit Manager (proof), Shield Standard (L3/4) vs Advanced (L7+cost protection), Network Firewall (VPC traffic) vs DNS Firewall (domain names). Pro exams have multiple layers appearing simultaneously, so you need keyword → answer mapping memorized for instant recall and training to think of all 4 layers at once.

Next week (Week 12) is **Cost Optimization Deep-Dive** — Savings Plans math, Compute Optimizer, Cost Explorer, hidden cost areas like S3·NAT Gateway.

---

## 📝 Practice Questions

**Question 1.** You must build a DR environment in which a multi-Region RDS snapshot can be decrypted in both Regions. You want to restore immediately without additional KMS calls or re-encryption, and to control key access permissions separately for each Region.

A) Cross-Region Copy + re-encrypt every time

B) Multi-Region Key (Primary + Replica)

C) AWS Managed Key

D) Import BYOK separately into each of the two Regions

**Answer: B**

**Explanation:** An MRK replicates the same key material across multiple Regions and has the same key ID, so ciphertext from one Region is decrypted directly by the Replica in another Region. Access control is also separated through per-Region Key Policies. A is Region-bound and inefficient. C cannot control policy or rotation and is Region-bound. D makes the two imported keys different keys, so the same ciphertext cannot be decrypted on both sides, and automatic rotation is also impossible. Trap: "same-key decryption across Regions + DR" is MRK.

---

**Question 2.** You must automatically detect and classify whether card numbers or SSNs have ever been stored in S3 buckets and prioritize buckets by sensitivity.

A) Inspector v2

B) Macie

C) GuardDuty S3 Protection

D) Config Rule

**Answer: B**

**Explanation:** Macie uses ML to scan the contents of S3 objects, classifies PII/PCI, and assigns sensitivity scores. A (Inspector) covers CVE vulnerabilities in EC2, ECR, and Lambda. C (GuardDuty S3 Protection) detects "anomalies in access behavior" and is not content inspection. D (Config) evaluates configuration and does not classify object contents. Trap: "sensitive data in S3 contents" = Macie; "anomalous S3 access behavior" = GuardDuty.

---

**Question 3.** You must continuously and automatically detect known CVEs in EC2, container images (ECR), and Lambda, and have them automatically re-evaluated without additional scans when a new CVE is published.

A) Inspector v2

B) Patch Manager

C) GuardDuty

D) Macie

**Answer: A**

**Explanation:** Inspector v2 continuously matches the inventory of EC2, ECR, and Lambda against the CVE DB and automatically re-evaluates when a new CVE is registered. B (Patch Manager) "applies" patches and does not "detect and assess" vulnerabilities (they are complementary). C (GuardDuty) is behavior/threat detection, not CVE assessment. D (Macie) is for S3 data. Trap: "automatic CVE detection and re-evaluation" = Inspector; "applying patches" = Patch Manager.

---

**Question 4.** You must detect anomalous behavior, such as EC2 communicating with a known malicious IP or IAM credentials being used in a Region that is not normally used, without an agent.

A) Inspector v2

B) GuardDuty

C) Macie

D) WAF

**Answer: B**

**Explanation:** GuardDuty analyzes VPC Flow Logs, CloudTrail, and DNS, detects anomalies using threat intelligence (malicious IPs) + ML behavioral baselining, and needs no agent. A is CVE assessment, C is S3 data, and D is an L7 web filter. Trap: "malicious IP communication + abnormal behavior + no agent" = GuardDuty.

---

**Question 5.** Across 30 accounts, you want to automatically check compliance with the CIS and PCI standards and consolidate GuardDuty, Inspector, and Macie Findings into a single dashboard.

A) Trusted Advisor

B) Security Hub (Org delegated administrator)

C) Audit Manager

D) Detective

**Answer: B**

**Explanation:** Security Hub automatically checks the CIS, PCI, and NIST standards, consolidates all security Findings in ASFF, and manages all accounts through the Org delegated administrator. A performs general best-practice checks and is not an integrated hub for security standards. C collects audit evidence and is not a real-time check or dashboard. D is for incident investigation. Trap: "automatic standards checks + consolidated Finding dashboard" = Security Hub.

---

**Question 6.** GuardDuty detected suspected credential theft on an EC2 instance. You must investigate in depth with a time-series graph — since when, with which credentials, and with which resources this instance communicated — to identify the root cause.

A) Manual search in the CloudTrail console

B) Detective

C) X-Ray

D) Macie

**Answer: B**

**Explanation:** Detective consolidates VPC Flow Logs, CloudTrail, and GuardDuty Findings to build a behavior graph and visualizes entity relationships and the time axis to help investigate the root cause (you can jump to it directly from a Finding). A is slow and easy to miss things because of manual joins. C is application distributed tracing. D is for S3 data. Trap: "incident time series, relationship visualization, root cause" = Detective.

---

**Question 7.** You are under an L7 HTTP flood DDoS attack, want to be exempted from the surge in auto scale-out charges it causes, and need 24/7 expert support during the attack.

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based only

D) CloudFront only

**Answer: B**

**Explanation:** Shield Advanced provides L7 DDoS protection + Cost Protection (charge waiver) + 24/7 SRT. A is free but covers only L3/4, with no L7, Cost Protection, or SRT. C helps somewhat with L7 mitigation but has no cost protection or expert support. D is caching and distribution, not DDoS cost protection. Trap: the three keywords "L7 DDoS + Cost Protection + SRT" belong exclusively to Shield Advanced.

---

**Question 8.** You must apply IDS/IPS to traffic inside the VPC and also decrypt and inspect encrypted traffic (TLS Inspection).

A) WAF

B) Network Firewall

C) Shield

D) GuardDuty

**Answer: B**

**Explanation:** Network Firewall is a Suricata rule-based L3-7 IDS/IPS that inspects traffic inside the VPC inline and supports TLS Inspection. A (WAF) covers only edge L7 web traffic and cannot cover VPC-wide traffic or TLS Inspection. C (Shield) is DDoS protection. D (GuardDuty) is log-based detection, not inline IPS or TLS Inspection. Trap: "IDS/IPS inside the VPC + TLS Inspection" = Network Firewall.

---

**Question 9.** You want to prevent EC2 instances in the VPC from reaching malware C2 servers or known malicious domains by blocking at the name resolution stage.

A) Block IPs with a NACL

B) WAF

C) Route 53 Resolver DNS Firewall

D) Security Group

**Answer: C**

**Explanation:** DNS Firewall blocks DNS queries originating from the VPC using malicious domain lists, preventing access to C2 and malicious domains at the name resolution stage. A and D (NACL/SG) are IP-based, and the IPs of malicious domains change constantly, so they are unsuitable. B (WAF) filters inbound L7 web requests and does not block outbound DNS. Trap: "blocking malicious domains (name-based)" = DNS Firewall.

---

**Question 10.** You want to apply the same WAF Managed Rule to all internet-facing ALBs in a 500-account Organization, have it applied automatically to newly added accounts and resources, and have it automatically detected and remediated if someone turns off WAF.

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**Answer: B**

**Explanation:** Firewall Manager deploys WAF, Shield, SG, and Network Firewall policies across the Organization at once, applies them automatically to new accounts and resources, and automatically remediates drift. A (Config) is primarily about evaluating noncompliance, not active deployment. C (SCP) prohibits actions (deny) and does not deploy policies. D (Control Tower) is landing zone governance. Trap: "multi-account security policy deployment + automatic for new + drift remediation" = Firewall Manager.

---

**Question 11.** You need FIPS 140-2 Level 3 key management on a single-tenant dedicated HSM, while the development team wants to keep using the existing KMS APIs (`Encrypt`/`Decrypt`).

A) Plain KMS CMK (multi-tenant)

B) KMS Custom Key Store + CloudHSM

C) Secrets Manager

D) Imported Key Material

**Answer: B**

**Explanation:** A Custom Key Store keeps the KMS API while storing the actual key only in the customer's dedicated CloudHSM (single-tenant, FIPS L3). A is multi-tenant and does not meet the single-tenant L3 requirement. C is a secret store, not HSM key management. D fails the single-tenant requirement because imported keys are also stored in KMS's multi-tenant HSMs. Trap: "single-tenant + FIPS L3 + keep the KMS API" = Custom Key Store + CloudHSM.

---

**Question 12.** For an annual HIPAA audit, you must automatically collect evidence for each control (access logs, encryption settings, backup policies, and so on) over the audit period and generate a report for submission to the auditor.

A) Security Hub

B) Audit Manager

C) Detective

D) Config

**Answer: B**

**Explanation:** Audit Manager automatically collects and accumulates CloudTrail, Config, and Security Hub evidence for each control of frameworks such as HIPAA and generates audit reports. A (Security Hub) is a point-in-time standards check and does not accumulate evidence over a period or automate reports. C (Detective) is for incident investigation. D (Config) is an evaluation engine (serving as an evidence source) and does not package reports. Trap: "automatic audit evidence collection + report" = Audit Manager; "real-time checks" = Security Hub.

---

## 📌 Today's Summary

AWS security combines 4 organic layers: **L1 Encryption** (KMS·CloudHSM protect data, MRK for multi-region), **L2 Detection** (Macie content·GuardDuty behavior·Inspector defects, non-overlapping data sources), **L3 Unified Monitoring** (Security Hub current·Detective past·Audit Manager proof, all grounded in Config + CloudTrail), **L4 Edge Defense** (Shield DDoS·WAF L7·Network Firewall VPC·DNS Firewall domains). Each layer handles one piece, similar names mean different roles. Pro exams combine all 4 layers into single scenarios — practice keyword-to-answer mapping at instant-recall speed and thinking about all 4 together.

Next week: **Cost Optimization Deep-Dive** — Savings Plans mechanics, Compute Optimizer, Cost Explorer, hidden costs.
