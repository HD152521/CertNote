# Day 4 - Four Eyes Detecting Threats, and How to Bring Them Together

Almost every security incident ends with "there were signs, but no one saw them." SSH brute force attempts were logged for days but no one watched those logs; credit card numbers sat in plaintext in S3 but no one opened that bucket; an unpatched EC2 instance ran for six months carrying a known CVE but no one scanned it. The essence of a breach is "time that could have been detected but wasn't." The security industry has a metric for measuring this - **MTTD (Mean Time To Detect)**, the average detection time. IBM's 2023 Cost of a Data Breach report said it took an average of 277 days to identify and contain a breach. That means attackers walked around inside the house for nine months.

AWS's four security detection tools - GuardDuty, Inspector, Macie, Security Hub - exist to shrink this "time of not seeing." Each looks at a different place. GuardDuty watches network and API behavior, Inspector watches software vulnerabilities, Macie watches the sensitivity of the data itself, and Security Hub gathers what these three saw onto one screen. This article follows the inner workings of how each of the four tools sees what it sees - how it catches threats without an agent, how it matches against the CVE database, and how ML picks out credit card numbers.

## GuardDuty - How to See Threats Without Agents

GuardDuty's biggest selling point is "no agent." Without installing anything on an instance, three clicks in the console turn on threat detection for the whole account. How is this possible? The secret is that GuardDuty does not look into the workload directly; it analyzes **metadata streams AWS already has**.

There are three core data sources. **VPC Flow Logs** record who communicated with whom on which port (headers only, no packet contents), **CloudTrail** records who called which API, and **DNS Logs** (Route 53 Resolver) record which domains an instance looked up. These three are data that was already flowing inside AWS before GuardDuty was turned on - GuardDuty does not separately enable or store these logs but intercepts and analyzes the streams directly from the AWS backbone. That is why it works regardless of the user's Flow Logs/CloudTrail settings and does not incur log storage costs in the user's account.

The analysis engine has two axes. The first is **Threat Intelligence** - it matches against lists of known malicious IPs and domains maintained by AWS, CrowdStrike, Proofpoint, and others. If an instance looks up a Bitcoin mining pool or a known C&C (Command and Control) server domain, it is caught immediately. The second is **machine-learning-based anomaly detection** - after learning this account's normal behavior patterns, it scores behavior that deviates from them (for example, suddenly creating many EC2 instances in a Region that is normally unused, or a root login from a country never seen before).

GuardDuty's ML anomaly detection is the cloud implementation of the "anomaly-based" approach, one of the two branches of intrusion detection systems (IDS). IDS has traditionally split into two methods - **signature-based** (matching against a database of known attack patterns, the same principle as antivirus) and **anomaly-based** (establish a baseline of normal and alert when behavior deviates from it). GuardDuty's Threat Intel corresponds to the signature-based approach and its ML baselining to the anomaly-based approach. The classic difficulty of anomaly-based detection is false positives - mistaking normal but rare behavior for an attack. This concept was established in Dorothy Denning's 1987 paper "An Intrusion-Detection Model," and almost every modern IDS/SIEM operates on a combination of these two axes.

The name of a GuardDuty finding is itself information. It follows a naming scheme of the form `ThreatType:Resource/DetailedAction`.

| Finding example | Meaning | Data source |
|---|---|---|
| `UnauthorizedAccess:EC2/SSHBruteForce` | SSH brute force attack | VPC Flow Logs |
| `Recon:EC2/PortProbeUnprotectedPort` | Port scan reconnaissance from outside | VPC Flow Logs |
| `CryptoCurrency:EC2/BitcoinTool.B!DNS` | Communication with a cryptocurrency mining domain | DNS Logs |
| `Backdoor:EC2/C&CActivity.B!DNS` | Communication with a C&C server | DNS Logs |
| `IAMUser:RootCredentialUsage` | Root credential usage | CloudTrail |
| `Exfiltration:S3/AnomalousBehavior` | Abnormal bulk S3 data exfiltration | CloudTrail S3 Data Events |

Each finding carries a **severity score (0.1 to 8.9+)**. Here is a trap that shows up on the exam - this score is not on a 1-10 scale. 0.1-3.9 is Low, 4.0-6.9 is Medium, and 7.0-8.9 is High (values closer to 10 are sometimes labeled Critical, but the practical upper bound is in the 8.9 range). If you set up automated response with an EventBridge rule and want to catch "severity 7 and above only," you filter from 7.0.

DNS-based findings (with the `!DNS` suffix) only see queries that go through the VPC's default DNS resolver (Route 53 Resolver, AmazonProvidedDNS). If an instance changes `/etc/resolv.conf` to an external DNS such as 8.8.8.8, those queries do not pass through the Route 53 Resolver, so GuardDuty cannot see them. This is why sophisticated malware deliberately uses external DNS or DNS-over-HTTPS (DoH). So blocking the use of external DNS itself with Route 53 Resolver DNS Firewall becomes a complementary measure to close GuardDuty's blind spot. One more thing: when the same threat repeats, GuardDuty does not keep creating new findings but updates the existing finding - this grouping cycle is called finding aggregation, and it prevents a flood of notifications for the same kind of threat.

The 2019 Capital One breach was one of the largest financial breaches in the United States, in which credit card application data of about 106 million people was leaked. The cause was a misconfigured WAF being abused through an SSRF (Server-Side Request Forgery) attack to steal IAM role credentials from an EC2 instance's metadata service (IMDSv1), and those credentials were then used to read an entire S3 bucket. What deserves attention is the detection failure more than the breach itself - the attack happened in March 2019, but the company became aware of it four months later in July, and even then only through an outside tip. Had GuardDuty's `Exfiltration:S3/AnomalousBehavior` (abnormal bulk S3 access) or Recon findings been enabled and notifications sent through EventBridge, detection time would have been cut to a few days. After this incident, AWS began strongly recommending IMDSv2 (session token required).

## Inspector - How to Match Software Against the CVE Database

If GuardDuty looks at "bad behavior happening now," Inspector looks at "weaknesses that have not yet been exploited but could be." The two differ in timing. Inspector collects the versions of software packages installed in EC2, ECR images, and Lambda functions and matches those versions against a database to see whether known vulnerabilities (CVEs) exist.

The core concepts are **CVE and CVSS**. A CVE (Common Vulnerabilities and Exposures) is a globally common identifier attached to each discovered vulnerability - written with a year and a serial number, like `CVE-2021-44228`. This identifier is managed by MITRE, and every security tool points to the same vulnerability by the same number. CVSS (Common Vulnerability Scoring System) is the standard that scores how dangerous that vulnerability is from 0.0 to 10.0. Inspector adds contextual weights to this CVSS base score, such as "is this vulnerability actually being exploited (exploit available)" and "is it reachable over the network (network reachability)," to produce its own risk score.

The strength of this naming is that Inspector does not invent CVEs. Inspector pulls from the NVD (National Vulnerability Database) and each OS vendor's security advisories and mechanically matches them against the collected package versions. How does it collect the package list on EC2? The **SSM Agent** does that job. Inspector does not install its own agent but rides on the Inventory feature of the SSM Agent already installed on EC2 - so instances without the SSM Agent, or not registered with SSM, are not scanned.

The fact that Inspector "does not test the vulnerability directly but only matches package versions" puts it in **SCA (Software Composition Analysis)**, one of the two paradigms of security scanning. Security scanning splits broadly into two branches - **DAST** (Dynamic Application Security Testing, which finds vulnerabilities by actually attacking a running app) and **SCA/SAST** (which statically analyzes code and dependencies to find known vulnerable versions). Inspector is the latter. Because it does not actually attempt attacks, there is no risk of breaking the instance and it is fast, but it has the limitation that "this version has a CVE" does not necessarily mean "it is exploitable in my environment" (the vulnerable function may not actually be on a call path). To bridge this gap, Inspector adds network reachability analysis and evaluates "is it actually reachable from outside" as well.

Behavior differs by scan target.

| Target | Collection method | Trigger | What it examines |
|---|---|---|---|
| **EC2** | SSM Agent Inventory | Continuous (re-evaluated on package change/new CVE publication) | OS packages + network reachability |
| **ECR images** | Image layer analysis | Automatic on push + periodic rescan | OS packages + language dependencies |
| **Lambda** | Function code + layers | Automatic on deployment | Dependency packages + code vulnerabilities |

What matters especially is that scanning is **continuous**. Inspector v2 does not scan once and finish; when a new CVE is published to the NVD, it automatically re-evaluates resources it already scanned. An image that was clean yesterday may suddenly show a finding today because of a newly published CVE - this is normal behavior.

Log4Shell (`CVE-2021-44228`) in December 2021 was a remote code execution vulnerability in the Java logging library Log4j, and it received a perfect CVSS score of 10.0 in an all-time-great incident. A single log string (`${jndi:ldap://...}`) was enough to execute arbitrary code on a server, and because Log4j was installed in almost every Java application in the world, the entire internet entered a patching war within days. This is where SCA tools proved their value - for people to find by hand "where in our environment is there a vulnerable Log4j version" was impossible, and tools like Inspector automatically scanned ECR images and Lambda layers and immediately listed the artifacts containing `CVE-2021-44228`. Right after the incident, AWS urgently added dedicated Log4Shell detection to Inspector. The incident etched in the reason SCA exists: "dependencies I did not use directly are also my attack surface."

> ⚠️ **Pitfall**: Do not confuse Inspector v1 with v2. The old Inspector (classic, v1) required users to install a separate agent themselves, create an assessment template, and run it manually. The current standard on the exam and in practice is **Inspector v2**, which rides on the SSM Agent, scans continuously with no separate installation, and covers not only EC2 but also ECR and Lambda. If a question describes "install an agent separately and run scans manually," that is likely a trap choice pointing to the old v1.

## Macie - How ML Picks Out Credit Card Numbers

If GuardDuty looks at behavior and Inspector looks at software, Macie looks at **the content of the data itself**. It finds out whether credit card numbers, Social Security numbers (SSN), passport numbers, or even accidentally committed AWS access keys are sitting in plaintext inside S3 buckets. This is a fundamentally different kind of scan from the previous two tools - it must read the body (content) of objects, not metadata.

How does it know a number is a credit card number? In two steps. First, it finds candidates through **regular expression + keyword pattern matching**. A credit card number has the shape of a 16-digit number, and an SSN has the shape `NNN-NN-NNNN`. Second, stopping there would cause an explosion of false positives - not every 16-digit number in the world is a credit card. So Macie adds **checksum validation**. A credit card number is valid only if it passes a validation formula called the **Luhn algorithm**. The probability that a random 16-digit number passes Luhn validation by chance is 1 in 10, so this validation alone filters out 90% of false positives. Add ML-based classification that also looks at context (are words like "card" or "expiry" nearby?) and accuracy rises further.

The Luhn algorithm (the modulo 10 algorithm) is a checksum formula devised in 1954 by IBM's Hans Peter Luhn, and it is used not only for credit cards but also for IMEI (mobile phone identification numbers) and for national ID numbers in some countries. The operation is simple - double every second digit from the right (if the doubled value exceeds 9, add its digits), and if the total is divisible by 10, the number is valid. This is not a cryptographic security mechanism but a **detection code that catches simple input errors (typos, transposed digits)**. Similar families include modulo 11 for ISBNs and modulo 10 for barcodes. Macie uses it to distinguish "candidates with the right shape" from "numbers that are actually valid" and reduce false positives - a security tool's credibility depends on how much it reduces false positives.

Macie's cost structure matters both on the exam and in practice. Macie **bills in proportion to the amount of data scanned**. Scanning a petabyte-scale data lake in full makes costs explode. So Macie provides two cost-saving mechanisms - first, an option to sample and scan only part of a bucket. Second, the **automated sensitive data discovery** mode, which, instead of reading everything every time, intelligently samples objects to draw a low-cost map of "which buckets are risky," and then precisely scans only the risky buckets.

> ⚠️ **Pitfall**: Remember that Macie's billing model differs from GuardDuty's and Inspector's. GuardDuty bills by the volume of events analyzed (the number of Flow Logs/CloudTrail events) and Inspector by the number of resources scanned, but **Macie bills by the bytes of data scanned**. So a scenario like "we turned Macie on unfiltered for an S3 bucket holding tens of TB of logs" is a classic cost bomb. If the exam asks "identify risky buckets while controlling the cost of sensitive data scanning," the answer is "automated sensitive data discovery (sampling), then precisely scan only the high-risk buckets."

## Security Hub - How to Gather Scattered Findings into One Language

The fourth tool differs in nature from the first three. Security Hub does not detect threats on its own. Instead, it **gathers in one place the findings produced by GuardDuty, Inspector, Macie, IAM Access Analyzer, Config, and third-party tools such as Palo Alto and Splunk, unifies them into one language, and scores them against security standards.** It plays the role of cloud security's SIEM (Security Information and Event Management).

The core mechanism is **ASFF (AWS Security Finding Format)**. The problem is that each tool expresses findings in its own way - a GuardDuty finding, an Inspector finding, and a third-party tool's alert differ in field names, severity scales, and time formats. If you gather them as they are, comparing them on one screen is impossible. ASFF is a standard format that normalizes all findings into the same JSON schema (the same field names, the same severity system, the same resource notation). Every integrated tool converts its findings to ASFF and sends them to Security Hub, so whatever the source, they can be handled with the same filters and the same dashboard.

The problem ASFF solves is the classic **"canonicalization"** problem in data integration. It is the principle that to handle heterogeneous data from multiple sources in one system, you must convert it to a common representation; the Common Event Format (CEF) in log integration, STIX/TAXII in security information exchange, and SNMP MIBs in network management all share the same idea. The key insight is that "if N tools talk to each other in M formats, N×M converters are needed, but if everyone converts only to one standard format, N converters suffice." ASFF is this hub standard of the AWS security ecosystem, which is why Security Hub can serve as the SIEM's "integration point."

Security Hub's second function is **automated security standards evaluation**. It does not stop at gathering findings; it automatically scores whether the account configuration conforms to industry security standards.

| Standard | Nature | Representative checks |
|---|---|---|
| **AWS FSBP** (Foundational Security Best Practices) | AWS's own best practices | S3 public access blocking, root MFA, enforced encryption |
| **CIS AWS Foundations Benchmark** | Industry-consensus security baseline | IAM password policy, CloudTrail enabled |
| **PCI-DSS** | Credit card processing regulation | Card data encryption and access control |
| **NIST 800-53** | US government security controls | Mapping of a broad range of control items |

This standards evaluation is implemented internally with Config Rules - so turning on a Security Hub standard activates many Config Rules behind the scenes, and enabling Config becomes a prerequisite.

The third is **multi-account, multi-Region integration**. With Organizations integration, you designate a Delegated Administrator (usually a dedicated Audit account) and see the findings of all member accounts from one account. Furthermore, turning on Cross-Region Aggregation gathers findings from multiple Regions into one Region - this is the core of governance for global enterprises to see the security posture of dozens of accounts and several Regions on a single dashboard.

Security Hub's automated response usually goes through EventBridge. Security Hub publishes new findings (or finding state changes) as EventBridge events, matches them with rules, and automates the response with Lambda or SSM Automation. For this pattern, AWS provides a solution called **Automated Security Response on AWS** (formerly SHARR), a prebuilt set of runbooks - standard remediations such as "when public S3 access is found, automatically turn on Block Public Access" or "automatically remove an exposed security group rule" can be applied with one button. If the exam says "remediate findings automatically instead of having people handle each one," this EventBridge → SSM/Lambda path is the skeleton of the correct answer.

## The Picture of the Four Tools Running Together

To summarize, each tool looks at a different layer, and Security Hub threads them together.

```
[GuardDuty]  Threats in network/API behavior   ── Flow Logs/CloudTrail/DNS
[Inspector]  Known vulnerabilities in software ── SSM Agent / images / code
[Macie]      Sensitivity of data content       ── S3 object bodies
[Access Analyzer] Externally exposed resources ── resource policy analysis
[Config]     Compliance of configuration       ── resource setting changes
        │  each converts to ASFF
        ▼
[Security Hub] ── integration + standards evaluation + scoring
        │
        ▼ EventBridge
   ┌────┴─────┐
[Lambda]  [SSM Automation]
   - Isolate suspicious instances (swap SG)
   - Deactivate exposed IAM keys
   - Block public S3
   - SNS notification
```

Two secondary but exam-relevant additions. **Firewall Manager** is a tool that centrally enforces WAF, Shield Advanced, and security group policies across Organizations - for example, automatically attaching standard WAF rules when a new ALB is created. **WAF** is an L7 (HTTP) firewall that blocks SQL Injection, XSS, and bots, and **Shield** is DDoS protection split into Standard (free, automatic L3/L4) and Advanced (paid, sophisticated L7 protection + a 24/7 response team). The layer differs in that GuardDuty detects "threats that have already come in," whereas WAF and Shield are perimeter defenses that "block before they come in."

## 📌 Key Takeaways

Memorize the four tools in one sentence - **GuardDuty looks at behavior (threats), Inspector at software (vulnerabilities), and Macie at data (sensitive information), and Security Hub gathers these three in ASFF and measures them against standards.** And every automated response rides the same skeleton: "security tool → EventBridge → Lambda/SSM Automation."

Remembering how each tool works helps you avoid the traps. GuardDuty watches AWS's internal metadata streams without an agent, but only Runtime Monitoring needs an agent, and using external DNS creates a blind spot. Inspector v2 rides on the SSM Agent and continuously matches CVEs, so when a new CVE is published, past resources can show findings again. Macie bills by data volume, so an unfiltered full scan is a cost bomb, and you should narrow down to risky buckets first with sampling-based automated discovery. Security Hub does not detect on its own but only gathers and standardizes, and its standards evaluation is implemented with Config Rules, so Config is a prerequisite.

In the next article, we review the entire set of security and encryption tools covered this week by tying them together in scenarios. From KMS key management to how the four tools divide detection, we cement through questions which keywords point to which answers on the real exam.

---

## 📝 Practice Questions

**Question 1.** An EC2 instance is performing DNS lookups of a known cryptocurrency mining pool domain. How can you detect this automatically without installing an agent?

A) Scan for OS vulnerabilities with Inspector v2
B) Enable GuardDuty, and the `CryptoCurrency:EC2/BitcoinTool.B!DNS` finding is automatically generated through DNS Logs analysis
C) Scan the instance disk for sensitive data with Macie
D) Check the instance tags with a Config Rule

**Answer: B**

---

**Question 2.** A new CVE was published to the NVD yesterday. An ECR image that was scanned with Inspector v2 a week ago and judged "clean" suddenly shows a Critical finding today. What is the correct interpretation of this behavior?

A) Inspector malfunctioned, so ignore the finding
B) Inspector v2 scans continuously, so when a new CVE is published it automatically re-evaluates existing resources; this is normal behavior
C) It is a sign that someone tampered with the image
D) The image must be pushed again for the scan to be updated

**Answer: B**

Explanation: The key characteristic of Inspector v2 is continuous scanning. It does not end with a single scan; when a new CVE is added from the NVD or vendor advisories, it automatically re-evaluates the EC2, ECR, and Lambda resources it has already scanned. So an image that was clean until yesterday showing a finding today because of a new CVE is not a bug but intended behavior. During the Log4Shell (CVE-2021-44228) incident, this continuous scanning proved its value by automatically listing "where in our environment are the vulnerable versions."

---

**Question 3.** In an 80 TB S3 data lake run by a data analytics team, a company wants to find buckets at risk of exposing credit card numbers while controlling scan cost. What is the most appropriate approach?

A) Precisely scan all 80 TB at once with Macie
B) Draw a risk map of buckets at low cost with Macie's automated sensitive data discovery (sampling), then precisely scan only the high-risk buckets
C) Scan the S3 buckets with GuardDuty
D) Scan S3 objects with Inspector

**Answer: B**

Explanation: Macie bills in proportion to the number of bytes of data scanned, so precisely scanning all 80 TB without filtering makes cost explode. The automated sensitive data discovery mode intelligently samples objects to build, at low cost, a map of "which buckets are risky." Then running precise classification jobs only on the buckets identified as high risk catches the risk while controlling cost. GuardDuty and Inspector are not tools that look at sensitive data in the body of S3 objects.

---

**Question 4.** A company wants to view findings from GuardDuty, Inspector, Macie, IAM Access Analyzer, and a third-party Palo Alto tool in the same format on a single dashboard, and at the same time automatically score whether its accounts meet the CIS and PCI-DSS standards. Which service is it?

A) CloudWatch Dashboard
B) Security Hub: normalizes and integrates all findings in ASFF and automatically evaluates security standards
C) AWS Config alone
D) Audit Manager

**Answer: B**

Explanation: Security Hub does not detect threats itself; it normalizes the findings of multiple tools into the ASFF (AWS Security Finding Format) standard JSON schema and gathers them on one screen. At the same time, it automatically scores security standards such as FSBP, CIS, PCI-DSS, and NIST 800-53 based on Config Rules. It is therefore the only service that satisfies both requirements, "integration + standards evaluation," at once. Config looks at configuration compliance but is not a hub integrating findings from multiple tools, and Audit Manager is for collecting audit evidence.

---

**Question 5.** GuardDuty detected a suspected compromised instance with severity 8.5. A company wants to configure an automated response that immediately replaces that instance's security group with an isolation security group, without human intervention. What is the standard flow?

A) A Lambda polls GuardDuty every minute to check for findings
B) GuardDuty Finding → EventBridge Rule (filter severity 7.0 or higher) → SSM Automation Runbook `AWS-IsolateEC2InstanceFromGuardDutyFinding` (or Lambda) replaces it with an isolation SG
C) A Config Rule automatically terminates the instance
D) Inspector patches the instance

**Answer: B**

Explanation: The standard skeleton of AWS automated security response is "security tool → EventBridge → SSM Automation/Lambda." GuardDuty publishes findings as EventBridge events, and when a rule filtered by the severity score (on a scale of 0.1 to 8.9, with 7.0 and above being High) matches, an SSM Automation Runbook replaces the instance's SG with an isolation SG. AWS provides a standard Runbook such as `AWS-IsolateEC2InstanceFromGuardDutyFinding` for this purpose. Polling (A) is inefficient, less real-time, and not AWS's recommended event-driven pattern.

---

**Question 6.** While reviewing Inspector settings, the security team found an old document saying "install a separate agent, create an assessment template, and run scans manually." What is the correct explanation by current exam and practical standards?

A) That approach is the current standard, so follow it as is
B) That is the old Inspector (v1, classic) approach. The current standard, Inspector v2, rides on the SSM Agent and continuously scans EC2, ECR, and Lambda without separate installation
C) Inspector never needed an agent
D) Inspector v2 scans only EC2

**Answer: B**

Explanation: The old Inspector (v1, classic) required the user to install a dedicated agent, create an assessment template, and run it manually. The current standard, Inspector v2, rides on the Inventory of the already-installed SSM Agent, works without separate installation, and continuously scans not only EC2 but also ECR images and Lambda functions. The description "separate agent installation + manual execution" is a trap signal pointing to v1. Note, however, that v2 also presupposes the SSM Agent for collecting EC2 packages, so instances not registered with SSM are not scanned.

---

**Question 7.** A company enabled the CIS AWS Foundations Benchmark standard in Security Hub, but no standard check results are populated at all. What is the most likely missing prerequisite?

A) GuardDuty is disabled
B) AWS Config is disabled: Security Hub's security standard checks are implemented internally as Config Rules, so Config is a prerequisite
C) Macie is disabled
D) There are no WAF rules

**Answer: B**

Explanation: The automated evaluation of Security Hub's security standards (CIS, FSBP, PCI-DSS, and so on) is implemented behind the scenes as many AWS Config Rules. Therefore Config must be enabled and recording resource configuration in that Region and account for the standard checks to be populated. If Config is off, the check results remain empty even if you turn on the standard. GuardDuty and Macie are merely integration sources that each send findings to Security Hub, not prerequisites for the standard checks.

---
