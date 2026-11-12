# Day 4 - Four Eyes Detecting Threats, and How to Bring Them Together

Almost every security incident ends with "there were signs, but no one saw them." SSH brute force attempts were logged for days but no one watched those logs. Credit card numbers sat unencrypted in S3 but no one opened that bucket. An unpatched EC2 instance carried a known CVE for six months but no one scanned. The essence of a breach is "the time it was detectable but not detected." The security industry measures this with one metric: **MTTD (Mean Time To Detect)**, average detection time. IBM's 2023 Data Breach Cost Report found that identifying and containing breaches took an average of 277 days. Attackers had nine months inside.

AWS's four threat detection tools—GuardDuty, Inspector, Macie, Security Hub—exist to shrink this "unseen time." Each looks at a different place. GuardDuty watches network and API behavior, Inspector watches software vulnerabilities, Macie watches the sensitivity of data itself, and Security Hub brings what all three see onto one screen. This article traces the internal mechanics of how each tool "sees"—how it catches threats without agents, how it cross-references against CVE databases, how ML picks out credit card numbers. Understanding the mechanism builds immunity to exam traps.

## GuardDuty—How to See Threats Without Agents

GuardDuty's biggest selling point is "no agents." Three clicks in the console and you turn on threat detection across an entire account, with nothing to install on instances. How? The secret is that GuardDuty doesn't peer directly into workloads; instead, it analyzes **metadata streams AWS already has**.

Three core data sources feed it: **VPC Flow Logs** capture who talked to whom on which port (headers only, no packet contents), **CloudTrail** logs every API call, and **DNS Logs** (Route 53 Resolver) track which domains instances query. All three flowed through AWS internals even before GuardDuty was enabled—GuardDuty doesn't activate or store these logs separately; it intercepts the streams directly from AWS's backbone. That's why GuardDuty works regardless of the user's Flow Logs/CloudTrail settings, and why it doesn't add logging costs to the customer account.

The analysis engine runs on two axes. First is **Threat Intelligence**—comparison against lists of known malicious IPs and domains managed by AWS, CrowdStrike, Proofpoint, and others. If an instance queries a Bitcoin mining pool or known C&C (Command and Control) server domain, it's caught instantly. Second is **ML-based anomaly detection**—GuardDuty learns the account's normal behavior patterns, then scores deviations (e.g., massive EC2 creation in an unfamiliar region, root login from an unseen country).

> 💡 **Related Theory**: GuardDuty's ML anomaly detection is a cloud implementation of one branch of Intrusion Detection Systems (IDS)—the "anomaly-based" approach. Historically, IDS splits into two modes: **signature-based** (comparison against a database of known attack patterns, like antivirus) and **anomaly-based** (establish a baseline of normal, alert on deviation). GuardDuty's Threat Intel is signature-based; ML baselinining is anomaly-based. The classic problem with anomaly-based detection is false positives—normal but rare behavior mistaken for attack. This concept was formalized in Dorothy Denning's 1987 paper "An Intrusion-Detection Model," and almost all modern IDS/SIEM operate as a combination of these two axes.

GuardDuty findings are named by their structure itself: `ThreatType:Resource/DetailedAction`.

| Finding Example | Meaning | Data Source |
|---|---|---|
| `UnauthorizedAccess:EC2/SSHBruteForce` | SSH brute force attack | VPC Flow Logs |
| `Recon:EC2/PortProbeUnprotectedPort` | External port scanning reconnaissance | VPC Flow Logs |
| `CryptoCurrency:EC2/BitcoinTool.B!DNS` | Cryptocurrency mining domain communication | DNS Logs |
| `Backdoor:EC2/C&CActivity.B!DNS` | Communication with C&C server | DNS Logs |
| `IAMUser:RootCredentialUsage` | Root credential usage | CloudTrail |
| `Exfiltration:S3/AnomalousBehavior` | Anomalous high-volume S3 data exfiltration | CloudTrail S3 Data Events |

Each finding gets a **severity score (0.1~8.9+)**. A common exam trap: this scale is not 1–10. Low is 0.1–3.9, Medium is 4.0–6.9, High is 7.0–8.9 (Critical scale near 10, but the practical ceiling is 8.9). When filtering with EventBridge "severity 7 and above," start filtering at 7.0.

> 🔍 **Deeper Dive**: DNS-based findings (the `!DNS` suffix) only see queries that traverse the VPC's default DNS resolver (Route 53 Resolver, AmazonProvidedDNS). If an instance rewrites `/etc/resolv.conf` to an external resolver like 8.8.8.8, that query bypasses Route 53 Resolver and GuardDuty doesn't see it. Sophisticated malware deliberately uses external DNS or DNS-over-HTTPS (DoH) for this reason. So blocking external DNS usage itself via Route 53 Resolver DNS Firewall is the complementary defense against GuardDuty's blind spot. Additionally, when GuardDuty generates findings, if the same threat repeats, it doesn't keep generating new findings—it updates the existing one. This bundling cycle is called finding aggregation, preventing alert floods from repeated threats.

## Wrapping Up

Next article we'll tie together all the security and encryption tools covered this week into exam scenarios, solidifying which keywords point to which answers in real test questions.

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
