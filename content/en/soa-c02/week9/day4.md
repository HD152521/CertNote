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

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 알려진 암호화폐 채굴 풀 도메인을 DNS로 조회하고 있다. 에이전트 설치 없이 이를 자동 탐지하려면?

A) Inspector v2로 OS 취약점을 스캔한다
B) GuardDuty를 켜면 DNS Logs 분석으로 `CryptoCurrency:EC2/BitcoinTool.B!DNS` finding이 자동 발행된다
C) Macie로 인스턴스 디스크의 민감 데이터를 스캔한다
D) Config Rule로 인스턴스 태그를 검사한다

**정답: B**

---
