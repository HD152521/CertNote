# Day 2 - The Detection Trio: How Macie, GuardDuty, and Inspector Work Inside, and Where Their Boundaries Lie

When you first design security detection in the cloud, the biggest trap is the illusion that "security services all look alike." From their names alone, Macie, GuardDuty, and Inspector do not tell you what they detect, and the SAP-C02 exam aims precisely at this confusion. The key is that the three services look at **completely different data, in completely different ways**. Macie looks at **the content of data** (is there a card number inside this S3 object?), GuardDuty at **behavioral anomalies** (is this account doing something it doesn't usually do?), and Inspector at **software flaws** (does this EC2 instance have a known vulnerability?).

If you drive this triangle of "content, behavior, flaws" into your head, nearly every detection question on the exam is solved. Today we organize each service's internal operating principle (ML classification, threat intelligence, CVE matching) and the integration pattern in which they are tied together with Security Hub and EventBridge into an automated response pipeline.

## At a Glance — What, Where, and How Each One Looks

| Service | Detection target (where) | Detection content (what) | Detection method (how) |
|--------|----------------|----------------|------------------|
| **Macie** | S3 objects | Sensitive data such as PII, PCI, credentials | ML-based content classification |
| **GuardDuty** | Accounts, network, runtime | Anomalous behavior, malicious communication, compromise | Log analysis + threat intel + ML |
| **Inspector** | EC2, ECR, Lambda | CVEs, software vulnerabilities, network exposure | CVE database matching |

The three services' **data sources do not overlap**. Macie reads the bytes of S3 objects, GuardDuty reads VPC Flow Logs, CloudTrail, and DNS logs, and Inspector reads the software inventory. This "difference in input" is the key that separates the answers.

## Macie — Reads What Is Inside S3 with ML

The essence of Macie is a **data classifier**. It samples and scans the objects in S3 buckets and determines, with machine learning and pattern matching, whether sensitive data is inside. The **managed data identifiers** that AWS has pre-trained recognize dozens of types, including credit card numbers, U.S. SSNs, AWS credentials, passport numbers, and medical information, and you can also define **custom identifiers** with regular expressions and keywords.

- **Sensitivity score (0 to 100)**: scores each bucket by the amount and kind of sensitive data found, to set priorities.
- **Bucket inventory**: automatically evaluates the encryption, public access, and sharing status of all S3 buckets (whether the structure allows data to be exposed).
- **Organization integration**: scans S3 across all accounts in bulk from the delegated administrator account.

The fact that Macie "samples rather than reading every object" is the heart of the cost-accuracy tradeoff. If you scanned every byte of a petabyte bucket each time, cost would explode. Macie extracts a representative sample according to object type and size to classify, and it bills **by the amount of data scanned (GB)**. This is the statistical principle of **sampling**: estimating from a representative sample instead of a full census of the population (all objects). In practice, you control cost with the pattern "take a baseline with a one-time full scan, then automatically scan only new and changed objects afterward." On the exam, for "Macie cost optimization," the answer direction is "limit the scan scope to new buckets or buckets presumed sensitive."

> ⚠️ **Pitfall**: "Is there sensitive data in S3?" is Macie, while "Is there suspicious access to S3?" is **GuardDuty S3 Protection**. Both look at S3 but on different dimensions: Macie looks at **the content of objects** (whether a card number exists), and GuardDuty S3 Protection looks at **anomalies in access behavior** (bulk GetObject from an unusual IP, APIs not normally used). When the two appear together in the exam options, split them as "content inspection = Macie, behavioral anomaly = GuardDuty."

## GuardDuty — Catches Behavior Unlike the Usual with Threat Intel and ML

GuardDuty is a **threat detection** service that analyzes logs AWS already collects, without installing any agent. It has three default data sources: **VPC Flow Logs** (network metadata), **CloudTrail** (API call records), and **DNS Logs** (domain lookups). It combines these with AWS's threat intelligence (lists of known malicious IPs and domains and cryptocurrency mining pools) and uses ML to compare against "this account's usual behavior baseline" to detect anomalies.

Finding categories: **Recon** (port scanning, reconnaissance), **UnauthorizedAccess** (abnormal logins, suspected credential theft), **Backdoor** (communication with a C2 server), **Trojan**, **CryptoCurrency** (communication with mining pools), **Impact** (suspected data exfiltration), and so on.

Beyond the defaults, you **opt in to Protection modules** to widen the detection scope (each billed separately):

- **S3 Protection**: analyzes S3 data events, for abnormal access behavior
- **Malware Protection**: snapshots EC2/EBS disks and scans for malware, with **no agent required**
- **EKS Protection**: Kubernetes audit logs (Audit) + runtime (Runtime) monitoring
- **RDS Protection**: anomaly detection on RDS login activity
- **Lambda Protection**: anomalies in Lambda network activity

The way GuardDuty's ML anomaly detection works is **behavioral baselining**. For the first few days to few weeks, it learns the account's normal patterns (from which Region, at what time of day, which APIs, called by which IAM principal) to build a baseline. After that, it flags behavior that deviates statistically far from the baseline (using an IAM key from a Region not normally used, bulk data download at 3 a.m.) as an "anomaly." This is the strength of **anomaly detection**, which differs from signature-based detection (which catches only known patterns): it can catch even a brand-new attack never seen before as "unlike the usual." The tradeoff: false positives occur before the baseline is learned or when normal behavior changes abruptly.

The 2019 Capital One breach was an incident in which an SSRF (Server-Side Request Forgery) attack through a misconfigured WAF stole IAM role credentials from the EC2 instance metadata (IMDS), and with those privileges about 106 million customers' data was exfiltrated from S3 buckets. The attacker used the stolen credentials to perform bulk `ListBuckets` and `GetObject` that the role did not normally do, which is exactly the behavior that GuardDuty's **UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration** and abnormal data access patterns can catch. The lesson: you need multi-layered defense in which the vulnerability (SSRF) is handled by Inspector and code review, and abnormal behavior after credential theft is handled by GuardDuty. No single service breaks this chain. (Afterward, AWS made SSRF-based metadata theft structurally harder with IMDSv2.)

The "no agent required" implementation of GuardDuty Malware Protection is clever. Traditional antivirus requires installing an agent on each host (operational burden, performance impact), whereas GuardDuty **takes an EBS volume snapshot of the EC2 instance where a suspicious Finding occurred and scans it in an AWS-managed environment**. It uses none of the host's CPU, has no agent deployment or patching, and even if an attacker compromises the host it is hard for them to interfere with the scan itself (it is inspected in a separate environment). The tradeoff: it is a point-in-time snapshot inspection, not real time, and snapshot cost is incurred each time you scan.

## Inspector — Matches Known Software Flaws Against CVEs

Inspector (v2) is a **vulnerability assessment** service. It collects the software inventory of EC2, ECR (container images), and Lambda and compares it against the **CVE (Common Vulnerabilities and Exposures) database**. It is matching like "does the OpenSSL version installed on this instance correspond to CVE-2014-0160 (Heartbleed)?"

- **EC2**: continuously scans the OS and installed packages through the SSM Agent. When a new CVE is published, it re-evaluates automatically without an additional scan.
- **ECR**: scans when a container image is pushed + rescans periodically (vulnerabilities in OS packages and libraries inside the image).
- **Lambda**: dependency vulnerabilities in function code and layers + (optionally) security flaws in the code itself.
- **Risk Score**: adjusts priority by reflecting environmental context (network exposure, existence of an exploit) in the CVSS base score.

CVE is a **public vulnerability identification scheme** that MITRE started in 1999. Each vulnerability is assigned a unique ID of the form `CVE-year-number` (for example, CVE-2021-44228, Log4Shell) so the whole world refers to vulnerabilities in the same language. Severity is standardized by **CVSS (Common Vulnerability Scoring System, 0 to 10)** (NIST's NVD manages the scores). Inspector's value comes from the fact that people cannot manually cross-check "thousands of packages × new CVEs pouring in every day": it collects the inventory automatically and continuously compares it against NVD/vendor feeds. On the exam, "automatically detecting missing patches and known vulnerabilities" is Inspector, and "actually applying patches for detected vulnerabilities" is Systems Manager Patch Manager (a complementary relationship).

> ⚠️ **Pitfall**: The misconception that "Inspector applies patches." Inspector **only detects and assesses** ("this instance has this CVE"). The actual **patch application** is the job of **Systems Manager Patch Manager**. If an exam scenario says "find the vulnerabilities," it is Inspector, and if it says "automatically patch the vulnerabilities found," it is Patch Manager (+ integration via EventBridge). The two are complementary, not substitutes.

When Log4Shell (CVE-2021-44228) broke in December 2021, almost every server using Java's Log4j logging library was exposed to remote code execution. The problem was knowing, in itself, "where in our infrastructure a vulnerable Log4j version is installed": it was buried in the dependencies of thousands of container images, EC2 instances, and Lambda functions. Organizations that had Inspector v2 turned on could identify all affected resources (EC2, ECR images, Lambda layers) **automatically without an additional scan** as soon as the new CVE was registered in the NVD. The lesson: the first step of vulnerability response is "knowing where it is," and continuous scanning plus automatic re-evaluation determines the speed of 0-day response.

## Integration — Gather with Security Hub and Respond Automatically with EventBridge

Operating on the Findings of the three services by looking at each separately is impossible. So **Security Hub** consolidates all Findings into the standard schema **ASFF (AWS Security Finding Format)**, and **EventBridge** uses a Finding as a trigger to launch automated response (Lambda, SNS, Step Functions).

```
Macie Finding     ─┐
GuardDuty Finding ─┼──▶ Security Hub (ASFF integration) ──▶ EventBridge Rule ──▶ Lambda / SNS / SOAR
Inspector Finding ─┘                                                        (isolate, snapshot, notify)
```

In a multi-account environment, you enable and manage the detection services of all accounts in bulk from a single **Organization delegated administrator**. When a new account is added, it is included automatically.

> 🎯 **Scenario**: "When GuardDuty detects suspected credential theft on an EC2 instance (InstanceCredentialExfiltration), immediately isolate that EC2 instance with no human involvement, take a snapshot for forensics, and notify the security team." → **GuardDuty Finding → EventBridge Rule → Lambda**. The Lambda (1) replaces the EC2 instance's security group with an isolation security group (blocking all traffic), (2) creates an EBS snapshot (preserving forensic evidence), and (3) notifies the security team through SNS. Aggregate Findings in Security Hub for visibility, and in a multi-account setup operate in bulk from the delegated administrator. This "detect → automatic isolation and evidence preservation → notify" is the standard pattern of cloud security automation (SOAR).

Why does ASFF matter? GuardDuty, Inspector, Macie, and third parties (F5, CrowdStrike, and so on) each emit Findings in a different format. To feed them into a SIEM or automation you must unify the format, and Security Hub normalizes them all to ASFF (a JSON standard schema). Thanks to this, a single EventBridge rule can handle Findings from different sources consistently, and when sending to Splunk or an external SIEM you only have to parse one format. This is the **canonical schema** pattern of data integration: it reduces N sources × M consumers to N+M integrations (avoiding the N×M adapter hell).

## Wrapping Up

The detection trio is the triangle of "content, behavior, flaws": **Macie** classifies the **content** of S3 objects (sensitive data) with ML, **GuardDuty** catches the **behavior** of accounts and networks (anomalies, malicious communication) with threat intel and ML, and **Inspector** assesses software **flaws** (CVEs) by database matching. The fact that the data sources do not overlap (S3 bytes vs logs vs inventory) separates the answers. They are integrated into ASFF with Security Hub and respond automatically through EventBridge.

SAP exam mapping: (1) "whether card numbers or SSNs are stored in S3" → **Macie**, (2) "abnormal S3 access behavior" → **GuardDuty S3 Protection** (not Macie), (3) "EC2 ↔ malicious IP communication, credential theft" → **GuardDuty**, (4) "automatic CVE detection for EC2, containers, Lambda" → **Inspector v2**, (5) "applying patches for detected vulnerabilities" → **Patch Manager** (not Inspector), (6) "suspicious EKS runtime behavior" → **GuardDuty EKS Protection**, (7) "malware scanning of EC2 without an agent" → **GuardDuty Malware Protection**, (8) "consolidating Findings from all accounts" → **Security Hub + delegated administrator**. The next day looks at the integrated monitoring that gathers these Findings (Security Hub, Detective, Audit Manager).

---

## 📝 Practice Questions

**Question 1.** You want to automatically detect and classify whether sensitive data such as credit card numbers or SSNs has ever been stored in S3 buckets, and prioritize with a per-bucket sensitivity score. What is the most suitable?

A) GuardDuty S3 Protection

B) Macie

C) Inspector v2

D) Config Rule

**Answer: B**
Explanation: Macie scans the content of S3 objects with ML to classify sensitive data such as PII, PCI, and credentials and assigns a per-bucket sensitivity score (0 to 100). A (GuardDuty S3 Protection) detects "anomalies in access behavior" (bulk downloads from an unusual IP, etc.), not object content, so it is not content inspection. C (Inspector) is CVE vulnerability scanning of EC2, ECR, and Lambda. D (Config Rule) is resource configuration evaluation, not object content classification. Trap: "sensitive data in S3 content" = Macie, "S3 access behavior anomaly" = GuardDuty.

---

**Question 2.** You must detect anomalous behavior such as an EC2 instance communicating with a known malicious IP and IAM credentials being used from a Region not normally used, without installing an agent. What is the most suitable?

A) Inspector v2

B) GuardDuty

C) Macie

D) AWS WAF

**Answer: B**
Explanation: GuardDuty analyzes VPC Flow Logs, CloudTrail, and DNS logs and detects anomalies with AWS threat intelligence (malicious IP lists) + ML behavioral baselining. No agent installation is needed. A (Inspector) is software vulnerability (CVE) assessment, not network or behavioral anomaly detection. C (Macie) is S3 data classification. D (WAF) is L7 web request filtering, not account or network behavior analysis. Trap: "malicious IP communication, abnormal behavior, no agent" = GuardDuty.

---

**Question 3.** You need to continuously and automatically detect known CVE vulnerabilities across hundreds of container images (ECR), EC2 instances, and Lambda functions, with automatic re-evaluation without an additional scan when a new CVE is published. What is the most suitable?

A) GuardDuty

B) Inspector v2

C) Macie

D) Systems Manager Patch Manager

**Answer: B**
Explanation: Inspector v2 continuously compares the software inventory of EC2, ECR, and Lambda against the CVE database, and when a new CVE is registered in the NVD it automatically re-evaluates affected resources without an additional scan. A (GuardDuty) is behavior and threat detection, not CVE assessment. C (Macie) is S3 data. D (Patch Manager) is a tool that "applies" patches, not one that "detects and assesses" vulnerabilities. Trap: "automatic CVE detection and re-evaluation" = Inspector, "applying patches" = Patch Manager.

---

**Question 4.** You must detect suspicious runtime behavior of Pods in an EKS cluster (privilege escalation attempts, suspicious process execution). What is the most suitable?

A) Inspector ECR scanning

B) GuardDuty EKS Protection (Runtime Monitoring)

C) Macie

D) Config

**Answer: B**
Explanation: GuardDuty EKS Protection analyzes Kubernetes audit logs (Audit) and runtime (Runtime Monitoring) to detect suspicious runtime behavior of Pods. A (Inspector ECR) scans images for static CVE vulnerabilities but cannot see runtime behavior. C (Macie) is S3 data. D (Config) is configuration evaluation. Trap: "EKS image vulnerabilities (static)" = Inspector ECR, "EKS runtime behavior (dynamic)" = GuardDuty EKS Protection.

---

**Question 5.** When GuardDuty detects suspected EC2 credential theft, you must immediately isolate that EC2 instance with no human involvement, create a forensic snapshot, and send a notification to the security team. What configuration is this?

A) GuardDuty Finding → SNS only

B) GuardDuty Finding → EventBridge Rule → Lambda (isolation SG swap + snapshot + SNS)

C) Macie → Security Hub

D) Inspector → Patch Manager

**Answer: B**
Explanation: An EventBridge Rule receives the GuardDuty Finding as a trigger and runs a Lambda that swaps the EC2 instance to an isolation security group, takes an EBS snapshot to preserve evidence, and notifies through SNS, which is the standard SOAR pattern of detect → automatic isolation and evidence preservation → notify. A (SNS only) only notifies, with no automatic isolation or evidence preservation. C and D are unrelated to the scenario (automatic response to EC2 credential theft). Trap: "automatic isolation and evidence preservation after detection" is EventBridge → Lambda automation.

---

**Question 6.** In an Organization of 50 accounts, you want to enable GuardDuty, Inspector, and Macie in all accounts in bulk, have new accounts included automatically, and manage all Findings in a single console. What is the most suitable configuration?

A) Enable each service manually in every account

B) Organization delegated administrator + Security Hub integration

C) Export each account's Findings to S3 and ETL them

D) Enable only CloudTrail

**Answer: B**
Explanation: Each detection service's Organization delegated administrator can enable and manage all accounts in bulk with new accounts included automatically, and Security Hub consolidates all Findings into ASFF so you see them in a single console. A is impractical for manually managing 50 accounts and does not include new accounts automatically. C has weak integration and automation and a large operational burden. D (CloudTrail) is just an API log, not detection or integration. Trap: "multi-account bulk + new accounts automatic + integrated console" is delegated administrator + Security Hub.

---

**Question 7.** You want to check the EBS disks of EC2 instances for malware without installing an agent on the instances and without affecting host performance. What is the most suitable?

A) Install the ClamAV agent on each EC2 instance

B) GuardDuty Malware Protection

C) Inspector v2

D) Macie

**Answer: B**
Explanation: GuardDuty Malware Protection takes a snapshot of the EBS volume of the EC2 instance where a suspicious Finding occurred and scans it for malware in an AWS-managed environment, with no agent on the host and no CPU impact. A carries the burden of installing and managing an agent, which conflicts with the requirement ("without an agent"). C (Inspector) is CVE vulnerability assessment, not malware scanning. D (Macie) is S3 data classification. Trap: "malware scanning of EC2 without an agent" is GuardDuty Malware Protection.
