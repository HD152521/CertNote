# Day 4 - The Four Eyes That Detect Threats, and How to Bring Them Together

Security incidents almost always end with "there were signs, but nobody saw them." SSH brute-forcing was logged for days but nobody looked at those logs, credit card numbers were sitting in S3 in plaintext but nobody opened that bucket, and an unpatched EC2 instance ran for six months carrying a known CVE but nobody scanned it. The essence of a breach is "time when detection was possible but not performed." The security industry has a metric to measure this — **MTTD (Mean Time To Detect)**, the mean time to detect. IBM's 2023 Cost of a Data Breach report found it took an average of 277 days to identify and contain a breach. That means an attacker roamed around the house for nine months.

AWS's four security detection tools — GuardDuty, Inspector, Macie, and Security Hub — exist to shorten this "time of not seeing." Each looks at a different place. GuardDuty looks at network and API behavior, Inspector looks at software vulnerabilities, Macie looks at the sensitivity of the data itself, and Security Hub gathers what those three see on one screen. This post follows the inner workings of what and "how" each of the four tools sees — how they catch threats without agents, how they match against the CVE database, and how ML picks out credit card numbers.

## GuardDuty — How to See Threats Without an Agent

GuardDuty's biggest selling point is "no agent." You don't need to install anything on instances; three clicks in the console turn on threat detection for the entire account. How is this possible? The secret is that GuardDuty doesn't look into the workload directly but analyzes **metadata streams that AWS already has**.

There are three core data sources. **VPC Flow Logs** hold who communicated with whom over which port (headers only, no packet contents), **CloudTrail** holds who called which APIs, and **DNS Logs** (Route 53 Resolver) hold which domains instances looked up. These three were already flowing inside AWS before GuardDuty was turned on — GuardDuty doesn't separately enable or store these logs, but intercepts the streams directly from the AWS backbone and analyzes them. So it works regardless of the user's Flow Logs/CloudTrail settings and incurs no log storage cost in the user's account.

The analysis engine has two axes. The first is **Threat Intelligence** — it matches against lists of known malicious IPs and domains maintained by AWS, CrowdStrike, Proofpoint, and others. If an instance looks up a Bitcoin mining pool or a known C&C (Command and Control) server domain, it is caught immediately. The second is **machine-learning-based anomaly detection** — after learning this account's normal behavior patterns, it scores behavior that deviates from them (for example, suddenly creating a large number of EC2 instances in a Region never used before, or a Root login from a country never seen).

GuardDuty's ML anomaly detection is the cloud implementation of the "anomaly-based" approach, one of the two branches of intrusion detection systems (IDS). IDSs traditionally split into two methods — **signature-based** (matching against a database of known attack patterns, the same principle as antivirus) and **anomaly-based** (establishing a baseline of normal and alerting when behavior deviates). GuardDuty's Threat Intel corresponds to signature-based, and its ML baselining corresponds to anomaly-based. The classic difficulty of anomaly-based is false positives — mistaking normal but rare behavior for an attack. This concept was established in Dorothy Denning's 1987 paper "An Intrusion-Detection Model," and almost all modern IDS/SIEM operate on a combination of these two axes.

The name of a GuardDuty finding is itself information. It follows a naming scheme of the structure `ThreatType:Resource/DetailedAction`.

| Example finding | Meaning | Data source |
|---|---|---|
| `UnauthorizedAccess:EC2/SSHBruteForce` | SSH brute-force attack | VPC Flow Logs |
| `Recon:EC2/PortProbeUnprotectedPort` | Port-scan reconnaissance from outside | VPC Flow Logs |
| `CryptoCurrency:EC2/BitcoinTool.B!DNS` | Communication with a cryptocurrency mining domain | DNS Logs |
| `Backdoor:EC2/C&CActivity.B!DNS` | Communication with a C&C server | DNS Logs |
| `IAMUser:RootCredentialUsage` | Root credential usage | CloudTrail |
| `Exfiltration:S3/AnomalousBehavior` | Abnormal bulk S3 data exfiltration | CloudTrail S3 Data Events |

Each finding carries a **severity score (0.1~8.9+)**. A trap that appears on the exam — this score is not a 1-10 scale. 0.1~3.9 is Low, 4.0~6.9 is Medium, and 7.0~8.9 is High (the closer to 10 it is sometimes labeled Critical, but the practical upper limit is in the 8.9 range). When you set up automated response with an EventBridge rule and want to catch "only severity 7 and above," you filter from 7.0.

DNS-based findings (the `!DNS` suffix) see only queries that go through the VPC's default DNS resolver (Route 53 Resolver, AmazonProvidedDNS). If an instance changes `/etc/resolv.conf` to an external DNS such as 8.8.8.8, those queries don't pass through the Route 53 Resolver, so GuardDuty can't see them. This is why sophisticated malware deliberately uses external DNS or DNS-over-HTTPS (DoH). So blocking the use of external DNS itself with Route 53 Resolver DNS Firewall becomes the complementary measure to close GuardDuty's blind spot. One more thing: when GuardDuty creates findings and the same threat repeats, it doesn't keep creating new findings but updates the existing one — this grouping cycle is called finding aggregation, and it prevents alert floods for the same kind of threat.

The 2019 Capital One breach was one of the largest US financial breaches, in which the credit application data of about 106 million people was leaked. The cause was a misconfigured WAF exploited with an SSRF (Server-Side Request Forgery) attack to steal IAM role credentials from an EC2 instance's metadata service (IMDSv1), and with those credentials an S3 bucket was read in its entirety. What stands out is the failure of detection more than the breach itself — the attack occurred in March 2019, but the company became aware of it four months later in July, and even then through an external tip. If GuardDuty's `Exfiltration:S3/AnomalousBehavior` (abnormal bulk S3 access) or a Recon finding had been enabled and sent a notification via EventBridge, the detection time would have shrunk to days. After this incident, AWS began strongly recommending IMDSv2 (session token required).

## Inspector — How to Match Software Against the CVE Database

If GuardDuty sees "bad behavior happening now," Inspector sees "weaknesses that haven't happened yet but could." The two differ in timing. Inspector collects the versions of software packages installed inside EC2, ECR images, and Lambda functions, and matches them against a database to see whether those versions have known vulnerabilities (CVEs).

The core concepts are **CVE and CVSS**. A CVE (Common Vulnerabilities and Exposures) is a globally common identifier attached to each discovered vulnerability — written with a year and serial number like `CVE-2021-44228`. This identifier is managed by MITRE, and all security tools point to the same vulnerability with the same number. CVSS (Common Vulnerability Scoring System) is the standard that scores how dangerous that vulnerability is from 0.0 to 10.0. Inspector adds contextual weights to this CVSS base score — such as "is this vulnerability actually being exploited (exploit available)" and "is it reachable over the network (network reachability)" — to produce its own risk score.

The power of this naming is that Inspector doesn't invent CVEs. Inspector takes the NVD (National Vulnerability Database) and each OS vendor's security advisories and mechanically matches them against the collected package versions. How does it collect the package list on EC2? The **SSM Agent** does that. Inspector doesn't install its own agent but rides on the Inventory feature of the SSM Agent already installed on EC2 — so instances without the SSM Agent or not registered with SSM aren't scanned.

The fact that Inspector "doesn't test the vulnerability directly but only matches package versions" corresponds to **SCA (Software Composition Analysis)**, one of the two paradigms of security scanning. Security scanning has two main branches — **DAST** (Dynamic Application Security Testing, actually attacking a running app to find vulnerabilities) and **SCA/SAST** (statically analyzing code and dependencies to find known vulnerable versions). Inspector is the latter. Since it doesn't attempt real attacks, there is no risk of wrecking the instance and it's fast, but it has the limitation that the fact "this version has a CVE" doesn't mean "it is exploitable in my environment" (the vulnerable function may not actually be on a call path). To bridge this gap, Inspector adds network reachability analysis to also evaluate "is it actually reachable from outside."

Behavior differs by scan target.

| Target | Collection method | Trigger | What it sees |
|---|---|---|---|
| **EC2** | SSM Agent Inventory | Continuous (re-evaluated when packages change or a new CVE is published) | OS packages + network reachability |
| **ECR images** | Image layer analysis | Automatic on push + periodic rescans | OS packages + language dependencies |
| **Lambda** | Function code + layers | Automatic on deploy | Dependency packages + code vulnerabilities |

Especially important is that it is **continuous** scanning. Inspector v2 doesn't scan once and finish; when a new CVE is published to the NVD, it automatically re-evaluates resources it had already scanned. An image that was clean yesterday can suddenly show a finding today because of a newly published CVE — this is normal behavior.

Log4Shell (`CVE-2021-44228`) in December 2021 was a remote code execution vulnerability in the Java logging library Log4j that received a perfect CVSS score of 10.0, an all-time event. A single log string (`${jndi:ldap://...}`) was enough to execute arbitrary code on a server, and Log4j was installed in almost every Java application in the world, so within days the entire internet entered a patching war. What proved its value then were SCA tools — it was impossible for people to hunt down "where in our environment is a vulnerable Log4j version" one by one, and tools like Inspector automatically scanned ECR images and Lambda layers and immediately listed the artifacts with `CVE-2021-44228` embedded. AWS urgently added dedicated Log4Shell detection to Inspector right after the incident. This event stamped in the reason SCA exists: "even dependencies I didn't use directly are my attack surface."

> ⚠️ **Pitfall**: Don't confuse Inspector v1 and v2. The old Inspector (classic, v1) was a method where the user installed a separate agent themselves, created assessment templates, and ran them manually. The standard on the current exam and in practice is **Inspector v2**, which rides on the SSM Agent, scans continuously with no separate installation, and looks not only at EC2 but also at ECR and Lambda. If a question includes a description like "install the agent separately and run the scan manually," it is likely a trap option pointing to the old v1.

## Macie — How ML Picks Out Credit Card Numbers

If GuardDuty sees behavior and Inspector sees software, Macie sees **the content of the data itself**. It finds whether credit card numbers, Social Security numbers (SSN), passport numbers, and even accidentally committed AWS Access Keys are sitting in plaintext inside S3 buckets. This is a fundamentally different kind of scan from the previous two tools — it must read the object's content, not metadata.

How does it know something is a credit card number? Two stages. First, it finds candidates with **regex + keyword pattern matching**. A credit card number has the form of 16 digits, and an SSN has the form `NNN-NN-NNNN`. Second, if you stop there, false positives explode — not every 16-digit number in the world is a credit card. So Macie adds **checksum validation**. A credit card number is valid only if it passes a validation formula called the **Luhn algorithm**. The chance that a random 16-digit number passes Luhn validation by accident is 1/10, so this check alone filters out 90% of false positives. Adding ML-based classification that also looks at context (are there words like "card" and "expiry" nearby) raises accuracy further.

The Luhn algorithm (the modulo-10 algorithm) is a checksum formula devised by IBM's Hans Peter Luhn in 1954 and is used not only for credit cards but also for IMEI (mobile phone identifiers) and the national ID numbers of some countries. The operation is simple — double every other digit from the right (if the doubled value exceeds 9, add its digits), and if the total sum is divisible by 10 it is valid. This is not a cryptographic security mechanism but a **detection code that catches simple input errors (typos, transposed digits)**. Similar families include modulo 11 for ISBN and modulo 10 for barcodes. The reason Macie uses it is to distinguish "candidates that match the form" from "numbers that are actually valid" to reduce false positives — the credibility of a security tool depends on how much it reduces false positives.

Macie's cost structure matters both on the exam and in practice. Macie **charges in proportion to the amount of data scanned**. Scanning a petabyte-scale data lake in its entirety makes cost explode. So Macie has two cost-saving devices — first, an option to scan by sampling only part of a bucket. Second, the **automated sensitive data discovery** mode, which instead of reading everything each time, intelligently samples objects to draw a map of "which buckets are risky" at low cost, and then precisely scans only the risky buckets.

> ⚠️ **Pitfall**: Remember that Macie's billing model differs from GuardDuty's and Inspector's. GuardDuty bills by the volume of events analyzed (Flow Logs/CloudTrail event counts) and Inspector by the number of resources scanned, but **Macie bills by the bytes of data scanned**. So the scenario "Macie was turned on without filters for an S3 bucket holding tens of TB of logs" is the classic cost bomb. If the exam says "identify risky buckets while controlling the cost of sensitive data scanning," the answer is "automated sensitive data discovery (sampling), then precise scans of only the high-risk buckets."

## Security Hub — How to Gather Scattered Findings in One Language

The fourth tool differs in nature from the previous three. Security Hub doesn't detect threats itself. Instead, it **gathers in one place, unifies in one language, and scores against security standards** the findings that GuardDuty, Inspector, Macie, IAM Access Analyzer, Config, and third-party tools such as Palo Alto and Splunk each produced. It plays the role of cloud security's SIEM (Security Information and Event Management).

The core mechanism is **ASFF (AWS Security Finding Format)**. The problem is that each tool expresses findings in its own way — a GuardDuty finding, an Inspector finding, and a third-party tool's alert all differ in field names, severity scales, and time formats. If you gather them as they are, comparison on one screen is impossible. ASFF is the standard format that normalizes all findings into the same JSON schema (the same field names, the same severity scheme, the same resource notation). Every integrated tool converts its findings to ASFF and sends them to Security Hub, so regardless of source they can be handled with the same filters and the same dashboard.

The problem ASFF solves is the classic data-integration problem of **"canonicalization."** The principle is that to handle heterogeneous data from multiple sources in one system you must convert it to a common representation, and the Common Event Format (CEF) in log integration, STIX/TAXII in security information exchange, and the SNMP MIB in network management all share the same idea. The key insight is that "if N tools talk to each other in M formats you need N×M converters, but if everyone converts only to one standard format, N converters are enough." ASFF is this hub standard of the AWS security ecosystem, and that is why Security Hub can serve as the "integration point" of a SIEM.

Security Hub's second function is **automated security standard evaluation**. It doesn't stop at gathering findings; it automatically scores whether the account's configuration conforms to industry security standards.

| Standard | Nature | Representative check items |
|---|---|---|
| **AWS FSBP** (Foundational Security Best Practices) | AWS's own best practices | S3 public blocking, root MFA, enforced encryption |
| **CIS AWS Foundations Benchmark** | Industry-consensus security criteria | IAM password policy, CloudTrail enabled |
| **PCI-DSS** | Credit card processing regulation | Card data encryption and access control |
| **NIST 800-53** | US government security controls | Broad mapping of control items |

This standards evaluation is implemented internally with Config Rules — so turning on a Security Hub standard activates many Config Rules behind the scenes, and enabling Config becomes a prerequisite.

The third is **multi-account, multi-Region integration**. When integrated with Organizations, you designate a Delegated Administrator (usually a dedicated Audit account) to see the findings of all member accounts from one account. Furthermore, turning on Cross-Region Aggregation gathers findings from multiple Regions into one Region — the core of governance for a global company to see the security posture of dozens of accounts and several Regions on a single dashboard.

Security Hub's automated response usually goes through EventBridge. Security Hub publishes a new finding (or a finding status change) as an EventBridge event, matches it with a rule, and automates the response with Lambda or SSM Automation. For this pattern AWS provides a pre-built bundle of Runbooks called **Automated Security Response on AWS** (formerly SHARR) — standard remediations such as "if public S3 access is found, automatically turn on Block Public Access" and "automatically remove the exposed security group rule" are enabled at the push of a button. If the exam says "automatically remediate findings without people handling each one," this EventBridge → SSM/Lambda path is the skeleton of the answer.

## The Picture of the Four Tools Running Together

To sum up, each tool looks at a different layer, and Security Hub threads them together.

```
[GuardDuty]  threats in network/API behavior    ── Flow Logs/CloudTrail/DNS
[Inspector]  known vulnerabilities in software  ── SSM Agent / images / code
[Macie]      sensitivity of data content        ── S3 object body
[Access Analyzer] externally exposed resources  ── resource policy analysis
[Config]     configuration compliance           ── resource setting changes
        │  each converts to ASFF
        ▼
[Security Hub] ── integration + standards evaluation + scoring
        │
        ▼ EventBridge
   ┌────┴─────┐
[Lambda]  [SSM Automation]
   - isolate a suspect instance (swap the SG)
   - disable an exposed IAM key
   - block a public S3 bucket
   - SNS notification
```

We add two secondary items that also appear on the exam. **Firewall Manager** is a tool that centrally enforces WAF, Shield Advanced, and security group policies across Organizations — for example, automatically attaching standard WAF rules when a new ALB is created. **WAF** is an L7 (HTTP) firewall that blocks SQL injection, XSS, and bots, and **Shield** is DDoS protection split into Standard (free, automatic L3/L4) and Advanced (paid, sophisticated L7 defense + a 24/7 response team). If GuardDuty detects "threats that have already come in," WAF and Shield are perimeter defenses that "block before they come in," a different layer.

## Wrap-Up

Memorize the four tools in one sentence — **GuardDuty sees behavior (threats), Inspector sees software (vulnerabilities), Macie sees data (sensitive information), and Security Hub gathers these three in ASFF and measures them against standards.** And all automated response rides the same skeleton: "security tool → EventBridge → Lambda/SSM Automation."

Remembering each tool's operating principle helps you avoid traps. GuardDuty looks at AWS-internal metadata streams without an agent, but only Runtime Monitoring needs an agent, and using external DNS creates a blind spot. Inspector v2 rides on the SSM Agent and continuously matches CVEs, so when a new CVE is published, past resources may show findings again. Macie bills by data volume, so an unfiltered full scan is a cost bomb, and you should narrow down to risky buckets first with sampling-based automated discovery. Security Hub doesn't detect on its own but only gathers and standardizes, and its standards evaluation is implemented with Config Rules, so Config is a prerequisite.

In the next post, we review all the security and encryption tools covered this week tied together as scenarios. From KMS key management to the division of detection among the four tools, we cement as practice questions which keywords point to which answers on the real exam.

---

## 📝 Practice Questions

**Question 1.** An EC2 instance is looking up a known cryptocurrency mining pool domain via DNS. How do you detect this automatically without installing an agent?

A) Scan OS vulnerabilities with Inspector v2
B) Turn on GuardDuty, and a `CryptoCurrency:EC2/BitcoinTool.B!DNS` finding is automatically issued from DNS Logs analysis
C) Scan the instance disk for sensitive data with Macie
D) Check the instance tags with a Config Rule

**Answer: B**

Explanation: GuardDuty detects threats by analyzing VPC Flow Logs, CloudTrail, and DNS Logs without an agent. Communication with a cryptocurrency mining domain is a representative DNS-based finding matched against the Threat Intelligence DB. One caveat: if the instance uses external DNS (for example, 8.8.8.8) or DoH, it doesn't go through the Route 53 Resolver and becomes a GuardDuty blind spot, so block external DNS with DNS Firewall to compensate. Inspector looks at vulnerabilities (weaknesses that haven't happened yet) and Macie looks at data content, so they are at a different layer from this scenario.

---

**Question 2.** A new CVE was published to the NVD yesterday. An ECR image that received a "clean" verdict from an Inspector v2 scan a week ago suddenly shows a Critical finding today. What is the correct interpretation of this behavior?

A) It's an Inspector malfunction, so ignore the finding
B) Inspector v2 scans continuously, so when a new CVE is published it automatically re-evaluates existing resources — it's normal behavior
C) It's a sign that someone tampered with the image
D) You must push the image again for the scan to refresh

**Answer: B**

Explanation: The key characteristic of Inspector v2 is continuous scanning. It doesn't end with one scan; when a new CVE is added to the NVD/vendor advisories, it automatically re-evaluates the EC2, ECR, and Lambda resources it had already scanned. So an image that was clean until yesterday showing a finding today because of a new CVE is intended behavior, not a bug. During the Log4Shell (CVE-2021-44228) incident, this continuous scanning proved its value by automatically listing "where in our environment are vulnerable versions."

---

**Question 3.** In an 80TB S3 data lake run by the data analytics team, you need to find buckets at risk of credit card number exposure while controlling scan cost. What is the most appropriate approach?

A) Precisely scan all 80TB at once with Macie
B) Draw a low-cost map of risky buckets with Macie's automated sensitive data discovery (sampling), then precisely scan only the high-risk buckets
C) Scan the S3 buckets with GuardDuty
D) Scan the S3 objects with Inspector

**Answer: B**

Explanation: Macie charges in proportion to the bytes of data scanned, so precisely scanning all 80TB without filters makes cost explode. Automated sensitive data discovery mode intelligently samples objects to create a low-cost map of "which buckets are risky." Then running precise classification jobs only on the buckets identified as high-risk catches the risk while controlling cost. GuardDuty and Inspector are not tools that look at sensitive data in S3 object bodies.

---

**Question 4.** A company wants to view findings from GuardDuty, Inspector, Macie, IAM Access Analyzer, and a third-party Palo Alto tool on one dashboard in the same format, and at the same time automatically score whether its accounts meet the CIS and PCI-DSS standards. Which service is it?

A) CloudWatch Dashboard
B) Security Hub — normalizes and integrates all findings in ASFF and automatically evaluates security standards
C) AWS Config alone
D) Audit Manager

**Answer: B**

Explanation: Security Hub doesn't detect threats itself but normalizes findings from multiple tools into the ASFF (AWS Security Finding Format) standard JSON schema and gathers them on one screen. At the same time, it automatically scores security standards such as FSBP, CIS, PCI-DSS, and NIST 800-53 based on Config Rules. So it is the only service that satisfies both requirements, "integration + standards evaluation," at once. Config looks at configuration compliance but is not a multi-tool findings integration hub, and Audit Manager is for collecting audit evidence.

---

**Question 5.** GuardDuty detected a suspected-compromise instance with severity 8.5. You want to configure an automated response that immediately replaces that instance's security group with an isolation security group without human intervention. What is the standard flow?

A) A Lambda polls GuardDuty every minute to check for findings
B) GuardDuty Finding → EventBridge Rule (severity 7.0 and above filter) → SSM Automation Runbook `AWS-IsolateEC2InstanceFromGuardDutyFinding` (or Lambda) swaps in the isolation SG
C) A Config Rule automatically terminates the instance
D) Inspector patches the instance

**Answer: B**

Explanation: The standard skeleton for AWS security automated response is "security tool → EventBridge → SSM Automation/Lambda." GuardDuty publishes a finding as an EventBridge event, and when a rule filtered by the severity score (a 0.1~8.9 scale, with 7.0 and above being High) matches, an SSM Automation Runbook replaces the instance's SG with the isolation SG. AWS provides a standard Runbook such as `AWS-IsolateEC2InstanceFromGuardDutyFinding` for this purpose. Polling (A) is inefficient and less real-time, and is not AWS's recommended event-driven pattern.

---

**Question 6.** While reviewing the Inspector configuration, the security team found an old document saying "install a separate agent, create an assessment template, and run scans manually." What is the correct explanation by current exam and practice standards?

A) That method is the current standard, so follow it as is
B) That is the old Inspector (v1, classic) method. The current standard, Inspector v2, rides on the SSM Agent and continuously scans EC2, ECR, and Lambda with no separate installation
C) Inspector never needed an agent
D) Inspector v2 scans only EC2

**Answer: B**

Explanation: The old Inspector (v1, classic) was a method where the user installed a dedicated agent, created assessment templates, and ran them manually. The current standard, Inspector v2, rides on the Inventory of the already-installed SSM Agent and works without separate installation, continuously scanning not only EC2 but also ECR images and Lambda functions. A description like "install the agent separately + run manually" is a trap signal pointing to v1. However, since v2 also presupposes the SSM Agent for collecting EC2 packages, instances not registered with SSM are not scanned.

---

**Question 7.** You enabled the CIS AWS Foundations Benchmark standard in Security Hub, but the standard check results are not populated at all. What is the most likely missing prerequisite?

A) GuardDuty is disabled
B) AWS Config is disabled — Security Hub's security standard checks are implemented internally with Config Rules, so Config is a prerequisite
C) Macie is disabled
D) There are no WAF rules

**Answer: B**

Explanation: Security Hub's automated evaluation of security standards (CIS, FSBP, PCI-DSS, etc.) is implemented behind the scenes with many AWS Config Rules. So Config must be enabled and recording resource configurations in that Region and account for the standard checks to be populated. If Config is off, the check results stay empty even when you turn on the standard. GuardDuty and Macie are merely integration sources that each send findings to Security Hub, not prerequisites of the standard checks.

---
