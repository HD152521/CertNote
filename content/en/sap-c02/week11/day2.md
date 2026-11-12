# Day 2 - Detection Trinity: Internal Operations of Macie·GuardDuty·Inspector and Threat Detection

The biggest pitfall when first designing security detection in the cloud is the misconception that "all security services look the same." Macie, GuardDuty, and Inspector are not distinguishable by name alone in what they detect, and the SAP-C02 exam is designed to exploit exactly this confusion. The key is that three services **see completely different data in completely different ways**. Macie looks at **the content of data** (is there a card number in the S3 object), GuardDuty looks at **abnormal behavior** (is the account doing something it doesn't normally do), and Inspector looks at **software defects** (does this EC2 have a known vulnerability).

If you embed these three in your mind as a triangle of "content · behavior · defects," nearly every detection problem on the exam will be solved. Today we'll organize the internal operating principles of each service (ML classification, threat intelligence, CVE matching) and the integration pattern where they're tied together via Security Hub and EventBridge to become an automated response pipeline.

## At a Glance — What to Check, Where to Check, and How to Check

| Service | Detection Target (Where) | Detection Content (What) | Detection Method (How) |
|---------|----------------|----------------|------------------|
| **Macie** | S3 Objects | Sensitive Data (PII·PCI·Credentials) | ML-Based Content Classification |
| **GuardDuty** | Account·Network·Runtime | Anomalous Behavior·Malicious Communication·Breach | Log Analysis + Threat Intel + ML |
| **Inspector** | EC2·ECR·Lambda | CVE·Software Vulnerabilities·Network Exposure | CVE Database Matching |

The three services have **non-overlapping data sources**. Macie reads S3 object bytes, GuardDuty reads VPC Flow Logs·CloudTrail·DNS logs, and Inspector reads software inventory. This "input difference" is the key that determines the correct answer.

## Macie — Reading What's Inside S3 with ML

Macie's essence is a **data classifier**. It samples and scans S3 bucket objects to determine whether they contain sensitive data using machine learning and pattern matching. AWS's pre-trained **managed data identifiers** recognize dozens of types including credit card numbers, US SSNs, AWS credentials, passport numbers, and medical information, and you can also define **custom identifiers** with regex and keywords.

- **Sensitivity Score (0~100)**: Each bucket receives a score based on the amount and types of sensitive data found, prioritizing action.
- **Bucket Inventory**: Automatically evaluates encryption, public access, and sharing status of all S3 buckets (whether data is exposed in structure).
- **Organization Integration**: Scan S3 across all accounts in bulk from delegated administrator account.

> 💡 **Related Theory**: The fact that Macie "does not read entire objects but samples them" is the core of the cost/accuracy tradeoff. If you scan every byte of a petabyte bucket each time, costs explode. Macie extracts representative samples based on object type/size for classification, and charges based on **scanned data volume (in GB)**. This is the principle of **sampling** from statistics — rather than a census of the entire population (all objects), estimation using representative samples. In practice, "establish a baseline with a one-time full scan, then automatically scan only new/changed objects afterward" is the pattern to control costs. In the exam, "Macie cost optimization" is oriented toward "limiting scan scope to new/sensitive-estimated buckets."

> ⚠️ **Trap**: "Does S3 contain sensitive data" is Macie, "Is there suspicious access to S3" is **GuardDuty S3 Protection**. Both look at S3 but in different dimensions — Macie examines **object content** (presence of card numbers), GuardDuty S3 Protection detects **abnormal access behavior** (bulk GetObject from abnormal IP, API use that's not normally used). When both appear together in exam options, distinguish as "content inspection = Macie, behavior anomaly = GuardDuty."

## GuardDuty — Catching Abnormal Behavior with Threat Intel and ML

GuardDuty is a **threat detection** service that analyzes logs AWS already collects without agent installation. The three primary data sources are **VPC Flow Logs** (network metadata), **CloudTrail** (API call records), and **DNS Logs** (domain lookups). Combined with AWS threat intelligence (lists of known malicious IPs, domains, cryptocurrency mining pools) and ML comparing to "this account's normal behavioral baseline," it detects anomalies.

Finding categories: **Recon** (port scanning, reconnaissance), **UnauthorizedAccess** (abnormal login, credential theft suspicion), **Backdoor** (C2 server communication), **Trojan**, **CryptoCurrency** (mining pool communication), **Impact** (data breach suspicion), etc.

Beyond the basics, **opt in to Protection modules** to expand detection scope (each charged separately):

- **S3 Protection**: S3 data event analysis — abnormal access behavior
- **Malware Protection**: Snapshot EC2/EBS disk and scan for malware — **no agent required**
- **EKS Protection**: Kubernetes audit logs (Audit) + runtime (Runtime) monitoring
- **RDS Protection**: Anomaly detection in RDS login activity
- **Lambda Protection**: Lambda network activity anomalies

> 🔍 **Deeper Dive**: The way GuardDuty's ML anomaly detection works is **behavioral baselining**. Over the first days to weeks, it learns the account's normal patterns (which regions, which time periods, which APIs, which IAM principals call them) to create a baseline. After that, it flags behavior that deviates statistically significantly from the baseline (API use from regions not normally used, large data downloads at 3 AM) as "anomalous." This **anomaly detection** differs from signature-based detection (only catches known patterns) — it can even catch brand new attacks never seen before as "different from normal." Tradeoff: false positives occur before baseline learning completes or when normal behavior changes rapidly.

> 📚 **Case Study**: The 2019 Capital One breach involved an SSRF (Server-Side Request Forgery) vulnerability that bypassed WAF to steal IAM role credentials from EC2 instance metadata (IMDS), then used that permission to leak over 100 million customer data records from S3 buckets. The attacker performed bulk `ListBuckets`·`GetObject` using the stolen credentials — exactly the kind of behavior GuardDuty's **UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration** and abnormal data access patterns could catch. The lesson: vulnerabilities (SSRF) are caught by Inspector and code review, while abnormal behavior after credential theft is caught by GuardDuty — multi-layered defense is necessary. No single service can break this chain. (Afterward, AWS made SSRF-based metadata theft structurally harder with IMDSv2.)

> 🔍 **Deeper Dive**: GuardDuty Malware Protection's "no-agent" implementation is clever. Traditional antivirus requires agent installation on each host (operational burden, performance impact), but GuardDuty **takes an EBS volume snapshot of the EC2 with suspicious findings and scans it in AWS-managed environments**. It doesn't consume host CPU, requires no agent deployment/patching, and even if an attacker breaches the host, it's hard to interfere with scanning in a separate environment. Tradeoff: scanning is at the snapshot point in time, not real-time, and snapshot costs are incurred each scan.

## Inspector — Matching Known Software Defects to CVE

Inspector (v2) is a **vulnerability assessment** service. It collects software inventory from EC2·ECR (container images)·Lambda and **matches against the CVE (Common Vulnerabilities and Exposures) database**. It's like checking "does the OpenSSL version installed on this instance correspond to CVE-2014-0160 (Heartbleed)?"

- **EC2**: Continuous scanning of OS and installed packages via SSM Agent. When a new CVE is disclosed, automatically re-evaluates without additional scanning.
- **ECR**: Scan on container image push + periodic rescanning (OS packages and library vulnerabilities inside the image).
- **Lambda**: Function code and layer dependency vulnerabilities + (optional) security flaws in code itself.
- **Risk Score**: Adjusts priority by reflecting CVSS base score with environment context (network exposure, exploit availability).

> 💡 **Related Theory**: CVE is the **open vulnerability identification system** MITRE started in 1999. Each vulnerability receives a unique ID `CVE-year-serial` (e.g., CVE-2021-44228, Log4Shell) so the world uses the same language for vulnerabilities. Severity is standardized by **CVSS (Common Vulnerability Scoring System, 0~10)** (NIST's NVD manages scoring). Inspector's value comes from the fact that no human can manually check "thousands of packages × daily deluge of new CVEs" — it automatically collects inventory and continuously checks against NVD/vendor feeds. In the exam, "automatic detection of missed patches and known vulnerabilities" is Inspector, while "actual patch application of detected vulnerabilities" is Systems Manager Patch Manager (complementary relationship).

> ⚠️ **Trap**: The misconception that "Inspector applies patches." Inspector **detects and assesses only** ("this instance has this CVE"). The actual **patch application** is the job of **Systems Manager Patch Manager**. If exam scenario is "find vulnerabilities," it's Inspector; if "automatically patch found vulnerabilities," it's Patch Manager (+ EventBridge integration). They're complementary, not replacements.

> 📚 **Case Study**: When Log4Shell (CVE-2021-44228) erupted in December 2021, nearly all servers using Java's Log4j logging library were exposed to remote code execution. The problem was knowing "where in our infrastructure does vulnerable Log4j version exist" — it was buried in thousands of container images, EC2s, and Lambda dependencies. Organizations with GuardDuty v2 enabled could **automatically identify all affected resources (EC2·ECR images·Lambda layers) without additional scanning** as soon as the new CVE was registered in NVD. Lesson: the first step in vulnerability response is "knowing where it is," and continuous scanning + automatic re-evaluation determines 0-day response speed.

## Integration — Collecting via Security Hub and Automated Response via EventBridge

The Findings from the three services are unmanageable if viewed separately. That's why **Security Hub** collects all Findings in the **ASFF (AWS Security Finding Format)** standard schema, and **EventBridge** triggers automated response (Lambda·SNS·Step Functions) using Findings as triggers.

```
Macie Finding     ─┐
GuardDuty Finding ─┼──▶ Security Hub (ASFF Integration) ──▶ EventBridge Rule ──▶ Lambda / SNS / SOAR
Inspector Finding ─┘                                                        (Isolation·Snapshot·Notification)
```

In a multi-account environment, the **Organization delegated administrator** in one place activates and manages all detection services across all accounts. New accounts are automatically included when added.

> 🎯 **Scenario**: "When GuardDuty detects suspected credential theft on an EC2 (InstanceCredentialExfiltration), immediately isolate that EC2 without human intervention and create a forensic snapshot to alert the security team." → **GuardDuty Finding → EventBridge Rule → Lambda**. Lambda performs: (1) Replace EC2 with isolated security group (block all traffic), (2) Create EBS snapshot (preserve forensic evidence), (3) Notify security team via SNS. Collect Findings via Security Hub for visibility, and in multi-account deployments, operate in bulk from delegated administrator. This "detection → automatic isolation/evidence preservation → notification" is the standard SOAR (cloud security automation) pattern.

> 🔍 **Deeper Dive**: Why is ASFF important? GuardDuty·Inspector·Macie·third parties (F5, Crowdstrike, etc.) each produce Findings in different formats. To feed these into SIEM or automation, you need to standardize formats — Security Hub normalizes all to ASFF (JSON standard schema). Thanks to this, a single EventBridge rule consistently handles Findings from different sources, and when sending to Splunk or external SIEM, you only need to parse one format. This is the **canonical schema** pattern in data integration — reducing N sources × M consumers to N+M integration (avoiding N×M adapter hell).

## Summary

The detection trinity is a triangle of "content · behavior · defect" — **Macie** classifies the **content** (sensitive data) of S3 objects with ML, **GuardDuty** catches **behavior** (anomalies, malicious communication) of accounts and networks with threat intel and ML, and **Inspector** assesses **defects** (CVEs) of software via database matching. The point that data sources don't overlap (S3 bytes vs logs vs inventory) determines the correct answer. They're integrated via Security Hub in ASFF and automated response via EventBridge.

SAP exam frequent mappings: (1) "Whether credit card number·SSN stored in S3" → **Macie**, (2) "Abnormal S3 access behavior" → **GuardDuty S3 Protection** (not Macie), (3) "EC2 ↔ malicious IP communication·credential theft" → **GuardDuty**, (4) "Automatic CVE detection in EC2·containers·Lambda" → **Inspector v2**, (5) "Apply patches to detected vulnerabilities" → **Patch Manager** (not Inspector), (6) "EKS runtime suspected behavior" → **GuardDuty EKS Protection**, (7) "EC2 malware scan without agent" → **GuardDuty Malware Protection**, (8) "Integrate all account Findings" → **Security Hub + delegated administrator**. Next day we'll look at integrated monitoring (Security Hub·Detective·Audit Manager) that collects these Findings.

---

## 📝 Practice Questions

**Question 1.** You want to automatically detect and classify whether sensitive data such as credit card numbers or SSNs has ever been stored in S3 buckets, and prioritize buckets by a per-bucket sensitivity score. Which is the most appropriate?

A) GuardDuty S3 Protection

B) Macie

C) Inspector v2

D) Config Rule

**Answer: B**

**Explanation:** Macie uses ML to scan the contents of S3 objects, classifies sensitive data such as PII, PCI, and credentials, and assigns each bucket a sensitivity score (0-100). A (GuardDuty S3 Protection) detects "anomalies in access behavior" (for example, a large number of GetObject calls from an abnormal IP), not object contents — it is not content inspection. C (Inspector) scans EC2, ECR, and Lambda for CVE vulnerabilities. D (Config Rule) evaluates resource configuration and does not classify object contents. Trap: "sensitive data in S3 contents" = Macie; "anomalous S3 access behavior" = GuardDuty.

---

**Question 2.** You must detect anomalous behavior, such as an EC2 instance communicating with a known malicious IP or IAM credentials being used in a Region that is not normally used, without installing any agent. Which is the most appropriate?

A) Inspector v2

B) GuardDuty

C) Macie

D) AWS WAF

**Answer: B**

**Explanation:** GuardDuty analyzes VPC Flow Logs, CloudTrail, and DNS logs and detects anomalies using AWS threat intelligence (malicious IP lists) plus ML behavioral baselining. No agent installation is required. A (Inspector) assesses software vulnerabilities (CVEs) and does not detect network or behavioral anomalies. C (Macie) classifies S3 data. D (WAF) filters L7 web requests and does not analyze account or network behavior. Trap: "malicious IP communication + abnormal behavior + no agent" = GuardDuty.

---

**Question 3.** You must continuously and automatically detect known CVE vulnerabilities across hundreds of container images (ECR), EC2 instances, and Lambda functions, and have them automatically re-evaluated without additional scans when a new CVE is published. Which is the most appropriate?

A) GuardDuty

B) Inspector v2

C) Macie

D) Systems Manager Patch Manager

**Answer: B**

**Explanation:** Inspector v2 continuously matches the software inventory of EC2, ECR, and Lambda against the CVE database, and when a new CVE is registered in the NVD it automatically re-evaluates the affected resources without additional scans. A (GuardDuty) is behavior/threat detection, not CVE assessment. C (Macie) is for S3 data. D (Patch Manager) is a tool that "applies" patches, not one that "detects and assesses" vulnerabilities. Trap: "automatic CVE detection and re-evaluation" = Inspector; "applying patches" = Patch Manager.

---

**Question 4.** You must detect suspicious runtime behavior of Pods (privilege escalation attempts, execution of suspicious processes) in an EKS cluster. Which is the most appropriate?

A) Inspector ECR scanning

B) GuardDuty EKS Protection (Runtime Monitoring)

C) Macie

D) Config

**Answer: B**

**Explanation:** GuardDuty EKS Protection analyzes Kubernetes audit logs (Audit) and runtime activity (Runtime Monitoring) to detect suspicious runtime behavior of Pods. A (Inspector ECR) statically scans images for CVE vulnerabilities but cannot see runtime behavior. C (Macie) is for S3 data. D (Config) evaluates configuration. Trap: "EKS image vulnerabilities (static)" = Inspector ECR; "EKS runtime behavior (dynamic)" = GuardDuty EKS Protection.

---

**Question 5.** When GuardDuty detects a suspected EC2 credential theft, it must immediately isolate that EC2 instance, create a forensic snapshot, and notify the security team without human intervention. Which configuration should you use?

A) GuardDuty Finding → SNS only

B) GuardDuty Finding → EventBridge Rule → Lambda (replace with isolation SG + snapshot + SNS)

C) Macie → Security Hub

D) Inspector → Patch Manager

**Answer: B**

**Explanation:** An EventBridge Rule receives the GuardDuty Finding as a trigger and runs a Lambda function that replaces the EC2 instance's security group with an isolation security group, takes an EBS snapshot to preserve evidence, and notifies through SNS — the standard SOAR pattern of detection → automatic isolation and evidence preservation → notification. A (SNS only) only sends a notification, with no automatic isolation or evidence preservation. C and D are unrelated to the scenario (automatic response to EC2 credential theft). Trap: "automatic isolation and evidence preservation after detection" is EventBridge → Lambda automation.

---

**Question 6.** In an Organization of 50 accounts, you want to enable GuardDuty, Inspector, and Macie across all accounts at once, have new accounts included automatically, and manage all Findings in a single console. Which is the most appropriate configuration?

A) Manually enable each service in every account

B) Organization delegated administrator + Security Hub integration

C) Export each account's Findings to S3 and run ETL

D) Enable CloudTrail only

**Answer: B**

**Explanation:** From the Organization delegated administrator of each detection service, you can enable and manage all accounts at once, new accounts are included automatically, and Security Hub consolidates all Findings in ASFF so they can be viewed in a single console. A is impractical because it requires manually managing 50 accounts and does not include new accounts automatically. C has weak consolidation and automation and a heavy operational burden. D (CloudTrail) is merely an API log, not detection or consolidation. Trap: "multi-account bulk enablement + automatic new accounts + consolidated console" is delegated administrator + Security Hub.

---

**Question 7.** You must scan the EBS disks of EC2 instances for malware without installing an agent on the instances and without affecting host performance. Which is the most appropriate?

A) Install a ClamAV agent on each EC2 instance

B) GuardDuty Malware Protection

C) Inspector v2

D) Macie

**Answer: B**

**Explanation:** GuardDuty Malware Protection takes a snapshot of the EBS volumes of the EC2 instance for which a suspicious Finding was raised and scans it for malware in an AWS-managed environment — no agent is needed on the host and there is no CPU impact. A adds the burden of installing and managing agents and conflicts with the requirement ("without an agent"). C (Inspector) assesses CVE vulnerabilities and is not a malware scanner. D (Macie) classifies S3 data. Trap: "agentless EC2 malware scanning" is GuardDuty Malware Protection.

---

## 📌 Today's Summary

Today's core: detection services have non-overlapping data sources — **content (Macie on S3 bytes), behavior (GuardDuty on logs), defects (Inspector on software inventory)**. Macie detects sensitive data in S3; GuardDuty detects anomalies and malicious behavior in account/network actions; Inspector detects software vulnerabilities by CVE matching. Don't confuse S3 content inspection (Macie) with S3 access anomalies (GuardDuty S3 Protection), or vulnerability detection (Inspector) with patch application (Patch Manager). Security Hub collects all Findings in ASFF standard format, and EventBridge automates response. In multi-account environments, use delegated administrator + Security Hub for unified management.
