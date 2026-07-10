# Day 4 - WAF, Shield, GuardDuty, Inspector, Macie: The 5 Pillars of Cloud Security Operations

The first realization you hit when designing cloud security is that "one line of defense is never enough." Back in the on-premises days of the 1990s, a single perimeter firewall dividing outside from inside was "almost all" of security. In the cloud, that boundary itself has blurred. An API Gateway is exposed to the outside world, but the Lambda behind it may live inside a VPC; S3 is a global service with no perimeter at all. In this environment, security has to be **defense in depth** — multiple layers each blocking a different kind of attack, so that when one layer is breached, the next one catches what got through.

AWS delivers its security services split across four roles: "prevention ↔ detection ↔ analysis ↔ integration." **WAF, Shield, and Network Firewall** handle prevention; **GuardDuty, Inspector, and Macie** handle detection; **Detective** handles post-incident analysis; and **Security Hub** consolidates results and scores compliance. In this article we'll look at which attack each of these five pillars answers, why they were split apart instead of unified into one, and the scenarios you run into most often in practice.

## WAF: The Layer-7 Firewall That Blocks HTTP/HTTPS Application-Layer Attacks

Traditional firewalls (Security Groups, NACLs, Network Firewall) filter traffic on Layer-4-and-below information like IP, port, and protocol. But a SQL injection sneaks in through legitimate ports 80/443 inside a perfectly legitimate GET/POST request, so a Layer-4 firewall can't catch it. Blocking these application-layer attacks is the job of the WAF (Web Application Firewall).

AWS WAF launched in 2015 and was completely redesigned as WAFv2 in 2019, which is the structure we have today. Its three core concepts are **Web ACL, Rule, and Statement**. A Web ACL is a policy container attached to a protected resource (CloudFront, ALB, API Gateway, AppSync, Cognito User Pool, App Runner). Inside it are multiple Rules, and each Rule is made up of a statement (the condition) and an action (Allow / Block / Count / CAPTCHA / Challenge).

```
[ WAFv2 evaluation flow ]

Internet Request
   │
   ▼
CloudFront (or ALB / API Gateway)
   │
   ▼
WAF Web ACL
   │
   ├─ Rule #1 (priority 1): Geo block (allow only KR, US, JP)
   │     └─ Block if country NOT IN [KR, US, JP]
   │
   ├─ Rule #2 (priority 2): IP allowlist (corporate IPs)
   │     └─ Allow if source IP in trusted-ips set
   │
   ├─ Rule #3 (priority 3): AWS Managed Rule - SQLi
   │     └─ Block if request matches SQL injection pattern
   │
   ├─ Rule #4 (priority 4): AWS Managed Rule - XSS
   │
   ├─ Rule #5 (priority 5): Rate-based rule
   │     └─ Block if IP > 2000 requests / 5 min
   │
   └─ Default Action: Allow
   │
   ▼
Backend (Lambda / EC2 / ECS)
```

A Rule's priority determines evaluation order, and the action of the first rule that matches is the final decision. So an allowlist like "corporate IPs always pass" goes at a low priority number (i.e., high precedence), with the blocking rules behind it. Get the ordering wrong and it behaves the opposite of what you intended.

| Rule Type | Description | Cost |
|----------|------|------|
| **Managed Rules - AWS** | AWS-provided sets: OWASP Top 10, Bot, IP reputation, etc. | Free ~ $10/month |
| **Managed Rules - Marketplace** | Provided by third-party security vendors | Per vendor |
| **Custom Rules** | Hand-written (Statement DSL) | $5 per Web ACL + $1 per Rule |
| **Rate-based Rules** | Request-count threshold per IP in a 5-min window | Counted as a Custom Rule |
| **Bot Control** | Automatic good-bot/bad-bot classification, CAPTCHA | $10/month + additional cost |
| **Account Takeover Prevention (ATP)** | Protects the login endpoint (credential-stuffing detection) | $10/month + additional |
| **Fraud Control** | Protects the sign-up endpoint (fake-account detection) | $10/month + additional |

WAFv2's real strength is **AWS Managed Rules**. AWS provides standard rule sets — OWASP Top 10, bots, IP reputation, Anonymous IP (VPN/Tor) — for free (or at low cost), so a company turning on WAF for the first time doesn't need to write every rule by hand. Just enabling the recommended Managed Rules blocks 90%+ of standard attacks. When you see the keyword "automatically block OWASP attacks" on the exam, the answer is AWS Managed Rules.

A **Rate-based Rule** automatically blocks any IP whose request count in a 5-minute window exceeds a threshold. It's the first line of defense against brute force, scraping, and layer-7 DDoS. Set the threshold comfortably above normal traffic but low enough to catch suspicious spikes (typically 2,000–10,000 per IP per 5 minutes).

> 💡 **Related theory**: Because WAF operates at OSI Layer 7 (Application), its precise name is an L7 firewall. A Layer-4 firewall (SG, NACL) can't see the payload — it only sees the 5-tuple (src/dst IP, src/dst port, protocol). An L7 WAF inspects HTTP headers, method, URI, and even the body, so it can block application-layer attacks like SQLi, XSS, path traversal, and bot user-agents. The trade-off is that inspecting the full payload adds a little latency over a Layer-4 firewall (usually 1–2ms), and placing it at an edge like CloudFront can dramatically reduce the load on your origin.

> 🔍 **Going deeper**: A WAF Web ACL has two scopes — `CLOUDFRONT` (global, managed only in us-east-1) and `REGIONAL` (ALB / API Gateway / AppSync, etc., per region). A WAF attached to CloudFront inspects at the edge and blocks malicious traffic before it ever reaches the origin, which is the most effective placement. Put WAF only on the ALB and traffic gets inspected after it has already entered the region, costing more in both money and latency. The best practice is "CloudFront + WAF up front, ALB as the second line of defense."

## Shield: L3/L4 DDoS Defense and Shield Advanced's Cost Protection

DDoS (Distributed Denial of Service) attacks generally split into two types: L3/L4 (SYN flood, UDP reflection, ICMP) and L7 (HTTP flood). WAF handles only L7; Shield handles L3/L4. The two are complementary, not substitutes.

**Shield Standard** is applied free of charge to every AWS customer. It's automatically built into CloudFront, Route 53, ALB, NLB, and AWS Global Accelerator, and it auto-mitigates common L3/L4 DDoS attacks like SYN floods and UDP reflection. No configuration and no cost.

**Shield Advanced** ($3,000/month + data processing fees) is the enterprise tier and adds the following:

| Feature | Description |
|------|------|
| **24/7 DDoS Response Team (DRT)** | Direct line to AWS security engineers during a large-scale attack |
| **Cost Protection** | AWS refunds scale-out costs on ELB/CloudFront/R53/EC2 caused by DDoS |
| **Application Layer DDoS (L7) Protection** | WAF Managed Rules included automatically (free for Shield Advanced subscribers) |
| **Real-time Notifications** | CloudWatch alerts when a DDoS attack starts/ends |
| **Health-based Detection** | Attack detection based on Route 53/ELB health checks |
| **Global Threat Dashboard** | View DDoS trends across all of AWS |

Shield Advanced's biggest draw is **cost protection**. When a DDoS attack lands, your ALB auto-scales out and CloudFront traffic explodes, and your AWS bill can spike to 100x normal. Shield Advanced subscribers get that extra cost refunded by AWS, so you're protected from the "DDoS bill bomb." The $3,000/month is steep, but for "attack-prone" workloads like payment processing, media streaming, and gaming, it's worth it as insurance.

```
[ DDoS defense layers ]

L3/L4 SYN flood, UDP reflection
   ▼
Shield Standard (automatic, free)
   ├─ CloudFront / Route 53 / ALB / NLB / Global Accelerator
   │
   └─ Larger attack → Shield Advanced
            ├─ DRT 24/7 support
            └─ Cost Protection

L7 HTTP flood, slowloris, bot scraping
   ▼
WAF Rate-based Rule + AWS Managed Rules
   │
   ▼ (Shield Advanced subscribers)
   └─ Shield Application Layer DDoS Auto-Mitigation
```

> ⚠️ **Pitfall**: When you see the keywords "large-scale DDoS + cost protection" on the exam, the answer is always Shield Advanced. Shield Standard is free but only partially mitigates large attacks and has no cost protection. A Rate-based Rule (WAF) handles L7 only, so it's not a standalone solution for L3/L4.

> 📚 **Case study**: In February 2020, AWS Shield mitigated a **2.3 Tbps** UDP reflection DDoS aimed at a single customer. It was the largest DDoS attack publicly disclosed at the time and was officially recorded in the AWS Shield Threat Landscape Report. Blocking an attack of that scale with your own infrastructure is effectively impossible, which is why putting CloudFront + Shield at the perimeter became the standard pattern for cloud security.

## GuardDuty: Behavior-Based Threat Detection

GuardDuty is an ML-based threat detection service launched in November 2017. It ingests CloudTrail logs, VPC Flow Logs, and DNS query logs, analyzes behavioral patterns, and generates a finding whenever it spots suspicious activity. The difference from a signature-based IDS is that it detects "abnormal behavior" rather than "known attack patterns."

The threat categories GuardDuty detects fall broadly into four groups.

| Category | Examples |
|----------|------|
| **Account compromise** | root login from a known malicious IP, API calls from an unusual region, suspected IAM key leak |
| **Instance compromise** | EC2 communicating with a known C&C server, cryptomining patterns, abnormal outbound traffic |
| **Bucket compromise** | Unauthorized S3 access, abnormal download patterns |
| **EKS / Malware** | Container escape attempts, malware on EBS (S3 Malware Protection / EBS Malware Protection options) |

Additional data sources include **EKS Audit Logs, S3 Data Events, RDS Login Events, Lambda Network Activity, and EBS Malware Scan** — each carries extra cost but significantly widens coverage. EBS Malware Scan, released in 2023, automatically snapshots an EBS volume and scans the files inside it whenever GuardDuty flags a suspicious EC2.

GuardDuty's output is a **finding**, with severity rated Low (0.1–3.9), Medium (4.0–6.9), or High (7.0–8.9). A finding is published to EventBridge immediately, so the standard pattern is to consume it and trigger automated response (SNS alert, Lambda to isolate the instance, SSM to patch).

```
[ GuardDuty + automated response pattern ]

CloudTrail / VPC Flow / DNS / EKS Audit / RDS Login
   │
   ▼
GuardDuty (ML analysis)
   │ Finding generated
   ▼
EventBridge rule (severity >= 7.0)
   │
   ├─ SNS → SecOps Slack / PagerDuty alert
   ├─ Lambda → move suspect EC2 to a quarantine SG
   ├─ Lambda → disable the IAM key
   └─ Step Functions → kick off a Detective analysis workflow
```

> 🔍 **Going deeper**: GuardDuty pulls in the logs it analyzes automatically, without you having to enable them. Even if you never turned on CloudTrail or VPC Flow Logs, GuardDuty receives its own separate stream internally. That's a real strength: operationally it needs almost no setup, and the data storage cost is included in GuardDuty's price (discarded immediately after analysis). That said, the standard practice is to still enable CloudTrail/VPC Flow Logs separately for after-the-fact investigation.

> 📚 **Case study**: In 2019, a fintech startup accidentally committed an IAM key to GitHub. Within 30 minutes a bot found the key, spun up EC2 instances en masse in us-east-1, and started cryptomining. GuardDuty caught the "RunInstances spike in an unusual region" as a finding within 5 minutes, and EventBridge → Lambda automatically disabled the IAM key and terminated the mining instances, capping the damage at around $200. Without automated response, the bill is usually in the tens to hundreds of thousands of dollars.

## Inspector: Vulnerability Scanning

If GuardDuty is "behavior-based threat detection," Inspector is "static vulnerability scanning." It compares packages installed on EC2 instances, ECR container images, and Lambda functions against the CVE database to find known vulnerabilities. It was completely redesigned as Inspector v2 in November 2021, making automatic, continuous scanning the default.

| Scan Target | Method | Frequency |
|----------|------|------|
| **EC2** | Collects package inventory via the SSM Agent | On new instance launch, on package change, on new CVE disclosure |
| **ECR images** | Automatic scan on push + rescan during retention period | On push + on new CVE disclosure |
| **Lambda** | Scans the function's dependency packages | On deploy + on new CVE disclosure |

Inspector v2's strength is that it automatically re-evaluates "whether already-deployed resources are affected by a new CVE." For example, the moment Log4Shell (CVE-2021-44228) was disclosed, Inspector rescanned every image already in ECR and instantly flagged the affected ones. No need to manually rescan every image.

Inspector findings are classified by severity (Critical, High, Medium, Low, Informational) and come with a CVSS score plus context like "is there a fixed version" and "is there an exploitable network path." **Network Reachability** analysis, for EC2, automatically evaluates "whether this instance is reachable from the internet," so that even for the same CVE, an internet-exposed instance is weighted as more dangerous.

> ⚠️ **Pitfall**: The exam keyword "automatically scan EC2 OS/package vulnerabilities" points to Inspector. GuardDuty is behavior-based (e.g., communication with malicious IPs, abnormal API calls), not a static vulnerability scanner. The point that the two are complementary rather than substitutes comes up on the exam often.

## Macie: Automatic Sensitive-Data Detection Inside S3

Macie scans objects stored in S3 buckets and uses ML to classify whether they contain **PII (Personally Identifiable Information)** — credit card numbers, national ID numbers, driver's licenses, passport numbers, AWS credentials, and so on. Launched in 2017, it saw real adoption after a 90% price cut in May 2020.

Macie's operating model has two stages.

1. **Bucket inventory**: Automatically analyzes every S3 bucket's public status, encryption status, and policy to identify "risky buckets" (e.g., a public-read bucket that may contain PII).
2. **Object content analysis**: Scans the objects in buckets you explicitly enable and uses ML to detect PII patterns.

Macie detects over 100 data types (US SSN, EU GDPR PII, AWS keys, OAuth tokens, medical codes, etc.). You can also add your own patterns via custom regex or keywords. Findings are delivered to EventBridge and can trigger automatic quarantine, notification, or DLP policies.

| Compliance | Macie Use |
|--------------|-----------|
| GDPR | Verify EU PII resides only in EU regions |
| PCI DSS | Verify card numbers stay inside the PCI scope |
| HIPAA | Track the location of medical info (MRN, ICD codes) |
| Korea's PIPA | Detect exposure of national ID numbers |

> 🔍 **Going deeper**: Macie's content scan runs about $1 per 1GB of objects, while the inventory is very cheap ($0.10/account/month + a small per-object cost). So "scan every object every day" is a cost bomb, and the standard pattern is to ① keep the inventory always on and ② run content scans on "new objects only" or via "periodic sampling." You can also use EventBridge to trigger "new object uploaded to S3 → scan immediately."

> 📚 **Case study**: In 2022, a healthcare company adopted Macie and discovered a case where "patient medical records were mistakenly stored in a PCI-scope bucket." HIPAA and PCI DSS are supposed to be separate scopes, but a developer had accidentally stored them in the same bucket, and it went undetected for 6 months. Macie detected both ICD codes and card numbers in the same bucket and raised an alarm, and it was handled immediately with quarantine + a compliance report.

## Detective and Security Hub: Analysis and Integration

Once GuardDuty generates a finding, you have to dig into "what's the root cause of this finding?" — and the service that automates this post-incident analysis is **Detective**. Detective integrates GuardDuty findings, VPC Flow Logs, and CloudTrail into a graph DB to visualize "when did this IAM Role first appear, which instances was it attached to, which APIs did it call." The goal is to cut security incident analysis time from hours to minutes.

**Security Hub** consolidates the results of all of AWS's security services (GuardDuty, Inspector, Macie, Config, IAM Access Analyzer, Firewall Manager, Health, etc.) and third-party security tools (Splunk, Palo Alto, CrowdStrike, etc.) into a single dashboard. It then automatically evaluates against standards like the **CIS AWS Foundations Benchmark, PCI DSS, and AWS Foundational Security Best Practices** and assigns a compliance score.

```
[ Integrated security operations ]

Detection:
  GuardDuty (threats)
  Inspector (vulnerabilities)
  Macie (PII)
  Config (configuration changes)
  IAM Access Analyzer (misconfigured permissions)
  Firewall Manager (org-wide guardrails)
       │
       ▼
   Security Hub (integration + compliance score)
       │
       ├─ EventBridge → SNS / Lambda / Step Functions (automated response)
       │
       └─ Detective (post-incident analysis)
              └─ graph visualization to trace root cause
```

Don't leave out **Firewall Manager** for org-wide operations. It's a tool that applies WAF Web ACL, Shield Advanced, Security Group, Network Firewall, and Route 53 Resolver DNS Firewall policies uniformly across an entire AWS Organization. Guardrails like "enforce the same WAF Web ACL on every account's ALB" become possible. It's practically essential for enterprises with dozens to hundreds of accounts.

> ⚠️ **Pitfall**: On the exam, "consolidate security scores across multiple accounts" is Security Hub, "root cause analysis" is Detective, and "org-wide WAF/Shield rollout" is Firewall Manager. The three services look similar but play different roles.

## Hands-On With the CLI

```bash
# WAFv2 Web ACL (CloudFront scope = us-east-1)
aws wafv2 create-web-acl --name saa-acl --scope CLOUDFRONT \
  --default-action Allow={} \
  --visibility-config 'SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=acl' \
  --rules '[{
    "Name":"AWSManagedRulesCommonRuleSet","Priority":1,
    "Statement":{"ManagedRuleGroupStatement":{"VendorName":"AWS","Name":"AWSManagedRulesCommonRuleSet"}},
    "OverrideAction":{"None":{}},
    "VisibilityConfig":{"SampledRequestsEnabled":true,"CloudWatchMetricsEnabled":true,"MetricName":"common"}
  },{
    "Name":"RateLimit","Priority":2,
    "Statement":{"RateBasedStatement":{"Limit":2000,"AggregateKeyType":"IP"}},
    "Action":{"Block":{}},
    "VisibilityConfig":{"SampledRequestsEnabled":true,"CloudWatchMetricsEnabled":true,"MetricName":"rate"}
  }]'

# Register an ALB with Shield Advanced
aws shield create-protection \
  --name "prod-alb" \
  --resource-arn arn:aws:elasticloadbalancing:...

# Enable GuardDuty + turn on all data sources
aws guardduty create-detector --enable \
  --data-sources '{"S3Logs":{"Enable":true},"Kubernetes":{"AuditLogs":{"Enable":true}},"MalwareProtection":{"ScanEc2InstanceWithFindings":{"EbsVolumes":true}}}'

# Enable Inspector v2 (EC2 + ECR + Lambda, all)
aws inspector2 enable \
  --resource-types EC2 ECR LAMBDA

# Enable Macie + a content scan job
aws macie2 enable-macie
aws macie2 create-classification-job \
  --job-type ONE_TIME \
  --name "prod-bucket-scan" \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111","buckets":["my-bucket"]}]}'

# Enable Security Hub + CIS/AFSBP standards
aws securityhub enable-security-hub --enable-default-standards

# Firewall Manager org-wide WAF policy
aws fms put-policy --policy '{
  "PolicyName":"org-waf",
  "ResourceType":"AWS::ElasticLoadBalancingV2::LoadBalancer",
  "SecurityServicePolicyData":{"Type":"WAFV2","ManagedServiceData":"..."}
}'

# GuardDuty finding → EventBridge → SNS automation
aws events put-rule --name guardduty-high \
  --event-pattern '{"source":["aws.guardduty"],"detail-type":["GuardDuty Finding"],"detail":{"severity":[{"numeric":[">=",7]}]}}'
```

## Wrapping Up

AWS's security service ecosystem has a four-stage structure: "prevention → detection → analysis → integration." **WAF** (L7 application layer) and **Shield** (L3/L4 DDoS) handle prevention; **GuardDuty** (behavior), **Inspector** (vulnerabilities), and **Macie** (PII) handle detection; **Detective** handles post-incident analysis; and **Security Hub** handles integration and compliance scoring. The divisions most often confused on the exam are ① WAF vs Shield (L7 vs L3-L4), ② GuardDuty vs Inspector (behavior vs vulnerability), ③ Security Hub vs Detective (integrated score vs root cause), and ④ Shield Standard vs Advanced (free automatic vs large-scale + cost protection). Get the keyword mapping right and you can breeze through security-domain scenario questions. In practice, the standard pattern isn't a single service but a pipeline: "detection (GuardDuty) → EventBridge → automated response (Lambda) → post-incident analysis (Detective)."

In the next article, we'll bring this week's security services together in a scenario-based synthesis. We'll look at how KMS, Secrets Manager, Cognito, WAF, and GuardDuty cooperate within a single architecture, and work through the 12 scenarios that show up most often in the SAA exam's security domain (30% weighting).

---

## 📝 연습 문제

**문제 1.** A company's web app is being hit with SQL injection and XSS attacks. What is the most suitable blocking solution?

A) Shield Standard
B) WAF + AWS Managed Rules (CommonRuleSet, SQLi, XSS) on CloudFront/ALB
C) Network Firewall
D) Security Group

**정답: B**

해설: SQLi and XSS are L7 application-layer attacks, so WAF is the answer, and AWS Managed Rules cover the OWASP Top 10 almost verbatim. Shield (A) is for L3/L4 DDoS only and can't block SQLi. Network Firewall (C) is for inspecting L3-L7 traffic inside a VPC, not a dedicated tool for standard web-attack defense. SG (D) is a Layer-4-and-below firewall, so it can't inspect payloads.

---

**문제 2.** A fintech company is worried about a large-scale DDoS attack and also fears the AWS bill bomb such an attack could cause. What is the most suitable solution?

A) Shield Standard
B) Shield Advanced (includes DRT support + Cost Protection + L7 Auto-Mitigation)
C) WAF Rate-based Rule only
D) Route 53 Failover

**정답: B**

해설: Shield Advanced's core value is cost protection. AWS refunds the ELB/CloudFront/Route 53/EC2 scale-out costs caused by DDoS, so you're protected from a bill bomb. 24/7 DRT support and automatic L7 mitigation are also included. Standard (A) is free but has no cost protection. A Rate-based Rule (C) handles L7 only. D is not a DDoS solution.

---

**문제 3.** A company enabled GuardDuty and got a high-severity finding: "EC2 communicating with a known cryptomining pool." You want to automatically isolate the instance and alert SecOps within 5 minutes. What is the most suitable automation pattern?

A) GuardDuty → manual daily review
B) GuardDuty → EventBridge rule (severity >= 7) → Lambda (swap to a quarantine SG) + SNS (SecOps)
C) Turn off GuardDuty and monitor directly
D) Enable CloudTrail only

**정답: B**

해설: A GuardDuty finding is published to EventBridge immediately, so the standard pattern is a severity-threshold-based rule that triggers Lambda to swap the instance into a quarantine SG (or terminate it) and alert SecOps via SNS. Manual review (A, C) can't meet the 5-minute SLA, and D doesn't even perform detection.

---

**문제 4.** A company wants to automatically detect and classify which objects in its S3 buckets contain PII like credit card numbers and national ID numbers. What is the most suitable service?

A) GuardDuty
B) Macie
C) Inspector
D) Config

**정답: B**

해설: Macie analyzes S3 object content with ML and automatically classifies over 100 PII patterns. It's used for GDPR, PCI DSS, HIPAA, and PIPA compliance. GuardDuty (A) is behavior-based threat detection, Inspector (C) is vulnerability scanning, and Config (D) is configuration evaluation — none of them do content classification.

---

**문제 5.** A company wants to automatically evaluate whether a newly disclosed CVE affects the OS packages on 1,000 EC2 instances. What is the most suitable service?

A) GuardDuty
B) Inspector v2 (automatic/continuous scanning of EC2 + ECR + Lambda)
C) Macie
D) Security Hub

**정답: B**

해설: Inspector v2 collects EC2 package inventory via the SSM Agent and automatically compares it against the CVE database. When a new CVE is disclosed, it immediately re-evaluates every affected instance. It also weights internet-exposed instances via Network Reachability analysis. GuardDuty (A) is behavior-based, not a static vulnerability scanner.

---

**문제 6.** An enterprise runs 50 AWS accounts and wants to enforce the same WAF Web ACL on every account's ALB. What is the most suitable service?

A) Manually configure WAF on each account
B) Apply org-wide WAF policy uniformly with AWS Firewall Manager
C) Check daily with Lambda
D) Security Hub

**정답: B**

해설: Firewall Manager is a dedicated service that applies WAF Web ACL, Shield Advanced, Security Group, Network Firewall, and Route 53 Resolver DNS Firewall policies uniformly across an entire AWS Organization. It also auto-applies to new accounts/resources. A explodes operational overhead, C makes consistency hard to guarantee, and D is an integrated dashboard, not a policy-enforcement tool.

---

**문제 7.** After a GuardDuty finding, you want to trace the root cause by visualizing, in a graph, "when this IAM Role first appeared, which instances it was attached to, and which APIs it called." What is the most suitable service?

A) CloudTrail Insights
B) Detective
C) Security Hub
D) Config

**정답: B**

해설: Detective is a dedicated service that integrates GuardDuty findings, VPC Flow Logs, and CloudTrail into a graph DB to visualize the root cause of a security incident. You can see the time axis, relationships between entities, and API call frequency on a single screen, cutting analysis time from hours to minutes. Security Hub (C) is an integrated score/dashboard, not root-cause graph analysis.

---

해설 보강: AWS's 5 security pillars are cleanly divided as "WAF (L7 prevention), Shield (L3/L4 DDoS), GuardDuty (behavior detection), Inspector (vulnerabilities), Macie (PII)," and mapping the exam keywords precisely gets you to the answer fast. In practice, the standard is to build not a single service but a pipeline: GuardDuty → EventBridge → Lambda automated response → Detective analysis → Security Hub integrated score. Also keep in mind that Firewall Manager is the one and only answer for org-wide guardrails.
