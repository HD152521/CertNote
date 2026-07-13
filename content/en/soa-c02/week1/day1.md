# Day 1 - AWS Infrastructure Through an Operator's Eyes: Regions, AZs, and the Boundary of Responsibility

At 3:12 AM, the phone vibrates. PagerDuty alert: "us-east-1 API Gateway 5xx ratio exceeds 30%, duration 4m." You open the console and expand the region selector. Only us-east-1 is red; ap-northeast-2 looks fine. But 99% of your company's service users are in Korea. Why did a US region outage trigger an alarm affecting us? To answer that, you need to understand which component of your infrastructure is tied to which region, and whether the "Global" labels in the upper right of the console—IAM, Route 53, CloudFront—actually operate in a specific region behind the scenes.

The SOA-C02 exam, an operator's test, doesn't ask "what service does this do?" but rather "where do I look when something breaks?", "how do I roll back when a change goes wrong?", and "where do I start digging when costs spike?" The starting point is the map of AWS infrastructure and the shared responsibility model. Once these two diagrams are locked in your head, you'll know in which order to check CloudWatch, CloudTrail, Config, and Health Dashboard. We'll repeat the same thought process for 12 weeks. Today is the first diagram.

## Regions: Where Data Sovereignty, Pricing, and Service Launch Schedules Diverge

A region is not simply "a city where there's a data center." **Data sovereignty, hourly pricing, service availability timing, compliance certifications, and control plane dependencies all split by region.** As of 2025, AWS operates 34 commercial regions globally (plus 2 GovCloud, 2 China, and 1 Secret region separately), and each region has a minimum of 3 availability zones (AZs). New region launches are often described as "similar in scale to building a nuclear power plant"—something to think about for 2–3 years on average.

From an operator's perspective, when choosing a region, you need to consider five dimensions:

| Dimension | Operator Consideration |
|-----------|------------------------|
| **Latency** | End user ↔ Region RTT. Measure with CloudPing.info, Route 53 latency record, Global Accelerator dashboard |
| **Service Availability** | New services roll out in us-east-1 first, then other regions (typically 6 months to 1 year apart). Launch schedules are at \ws.amazon.com/about-aws/global-infrastructure/regional-product-services/\ comparison table |
| **Pricing** | The same EC2 instance costs differently by region. Seoul is typically 10–20% more expensive than Virginia. However, Data Transfer Out also varies by region, and even AZ-to-AZ transfers within the same region incur \.01/GB per direction |
| **Compliance** | Regulatory certifications vary by region: GDPR (EU regions), K-ISMS (Seoul), PCI-DSS, HIPAA, FedRAMP, IRAP. Download region-specific certificates from AWS Artifact |
| **Data Sovereignty** | Laws like Article 28-2 of the Personal Information Protection Act (international data transfer), GDPR Article 44, and China's Cybersecurity Law Article 37 restrict data export outside certain regions |

> 📚 **Case Study**: December 7, 2021, us-east-1 outage. AWS's internal network auto-scaling system went haywire, crippling the us-east-1 control plane (EC2 API, STS, IAM console, Cognito, Connect) for nearly 9 hours. What's striking: **EC2 instances in other regions kept running, yet Netflix, Disney+, Slack, Robinhood, and Ring (Amazon IoT subsidiary) all went down together.** Three reasons. First, **the STS global endpoint (sts.amazonaws.com) was actually an alias pointing to us-east-1** (now you can force region-specific endpoints, but SDK defaults still call global). Second, the IAM console and Route 53 control plane live in us-east-1, so operators in other regions couldn't even "log into the console." Third, many companies' CI/CD pipelines were calling us-east-1 ECR without caching. [AWS's official postmortem.](https://aws.amazon.com/message/12721/) Operator lesson: **"Global" services may still be tied to a specific region internally.** Assume "global means safe" and you'll have an incident.

> 🔍 **Deeper Dive**: IAM, Route 53 (public hosted zones), CloudFront, WAF (CloudFront-attached), Organizations, and AWS Accounts themselves are labeled "Global," but their control planes actually live in us-east-1, with region-specific data planes caching and replicating that data. In other words, if us-east-1 goes down, **write operations like creating IAM users, changing policies, and modifying Route 53 records get blocked.** Data plane operations—like calling EC2 in another region with an already-issued IAM credential, DNS responses from already-deployed Route 53 records, and cache hits from CloudFront edges—survive. This is "control plane / data plane separation," a core architecture principle Werner Vogels (AWS CTO) emphasizes every year at re:Invent keynotes. SOA-C02 scenarios like "how do you keep operating even if us-east-1 goes down?" often test this separation.

> 💡 **Related Theory**: Cross-region isolation is an implementation of the **bulkhead pattern** (Michael Nygard, *Release It!*, 2007). Just as a ship's watertight compartments prevent one flooded section from sinking the whole vessel, AWS explicitly isolates regions so that a control plane failure in one doesn't spread to another. Google SRE Book (Beyer et al., 2016) Chapter 22, "Addressing Cascading Failures," covers the same principle: "Define failure domains clearly, then design fault tolerance on top of them." AWS's region isolation is that principle applied at geographic scale. By the CAP theorem (Brewer 2000, Gilbert & Lynch 2002), Multi-AZ within a region is CP (Consistency + Partition tolerance), while cross-region async replication is AP (trade-off). PACELC (Abadi 2012) suggests AWS Multi-AZ is more like a "PA/EL" system—when there's no partition, it sacrifices some consistency for lower latency.

> 📚 **Case Study**: August 23, 2019, Tokyo region AZ outage. In ap-northeast-1, a HVAC control software bug caused some servers in one AZ to overheat, affecting EC2 and EBS. **Workloads spread across multi-AZ with ASG survived; those locked to a single AZ all went down.** Companies running RDS Single-AZ lost their databases too, taking hours to recover. After this incident, AWS started proactively notifying "AZ-level maintenance events" via PHD.

## ZoneId vs ZoneName: A Trap Only Operators Know

When you call \describe-availability-zones\, two identifiers come back:

\\\ash
aws ec2 describe-availability-zones --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId]' --output table
\\\

\\\
+-------------------+-----------+
| ap-northeast-2a   | apne2-az1 |
| ap-northeast-2b   | apne2-az2 |
| ap-northeast-2c   | apne2-az3 |
| ap-northeast-2d   | apne2-az4 |
+-------------------+-----------+
\\\

**ZoneName is shuffled per account.** Your account's \p-northeast-2a\ might be a different physical AZ than your partner's \p-northeast-2a\. In contrast, **ZoneId (apne2-az1) is identical across all accounts.** Why shuffle? To prevent all traffic from funneling to "zone a" when AWS tells everyone "create resources in zone a first." It forces traffic distribution.

Why does this matter to an operator? **When connecting to another account via VPC Peering or PrivateLink**, if you want to "place instances in the same AZ to save cross-AZ costs and latency," you must match by ZoneId. Matching only by ZoneName means you're actually connecting to different physical AZs, adding an extra ms of latency and incurring data transfer charges. SOA-C02 scenario questions like "how do you minimize cross-AZ transfer costs between two accounts?" test whether you know about ZoneId matching.

## Edge and Special Infrastructure: Four Things Operators Need to Know

Edge infrastructure in the operator's exam usually appears as "to reduce latency in this scenario?" or "where should I apply the WAF rule?" questions.

| Infrastructure | Location | Key Services | Operator Use Case |
|--------|----------|-----------------|------------------|
| **Edge Location** | 600+ PoP | CloudFront, Route 53, WAF, Shield, Global Accelerator | Cache static/dynamic content, DNS, DDoS mitigation |
| **Regional Edge Cache** | 13 locations | CloudFront secondary cache, Lambda@Edge | Reduce origin load |
| **Local Zones** | 30+ cities | EC2, EBS, ECS, RDS (partial) | Sub-10ms ultra-low latency workloads (gaming, VFX, AR/VR) |
| **Wavelength** | 5G ISP networks | EC2, EBS | Mobile 5G direct connection (autonomous vehicles, industrial IoT) |
| **Outposts** | Customer DC | EC2, EBS, S3, RDS, EKS | Data sovereignty, hybrid (finance, healthcare, government) |

> 📚 **Case Study**: During the 2020 COVID traffic surge, Netflix benefited from **Open Connect Appliances (OCA)** installed directly inside ISP networks—traffic bypassed ISP backbones almost entirely. AWS does something similar: **CloudFront edges peer directly with ISP networks** (in Seoul, that's KT, LG U+, and SK Broadband all connected). When an operator enables CloudFront, user ↔ origin traffic automatically avoids ISP backbones. Simultaneously, Origin Shield (GA in 2020) funnels all edge cache misses into a single Regional Edge Cache, reducing origin load by another level.

> 🔍 **Deeper Dive**: CloudFront Functions and Lambda@Edge both run at the edge but in different locations. **CloudFront Functions** execute directly in 600+ edge PoPs with sub-100μs cold starts but are limited to 2MB memory, 1ms execution, and JavaScript ES5 only. **Lambda@Edge** runs in 13 Regional Edge Caches, supports full Node.js and Python runtimes, but has tens-of-millisecond cold starts. In SOA-C02: "URL rewrite, header manipulation?" → CloudFront Functions. "Image resize, token validation?" → Lambda@Edge. You'll almost always be right.

## Shared Responsibility Model: Redrawing It from an Operator's Perspective

**AWS = Security OF the Cloud / Customer = Security IN the Cloud.** Everyone memorizes that line, but when you sit down and list out what an operator actually does every day in their "responsibility zone," your instinct for exam scenarios shifts.

What operators actually do daily, weekly, and quarterly:

| Cadence | Task | Tool |
|---------|------|------|
| Daily | Check CloudWatch alarms, spot cost anomalies | CloudWatch, Cost Anomaly Detection |
| Weekly | Review IAM permissions (Last Accessed), audit security group rules | Access Analyzer, Credential Report |
| Monthly | Apply OS patches, review KMS key rotation | SSM Patch Manager, KMS |
| Quarterly | Backup restore drills, DR simulation | AWS Backup, Route 53 ARC |
| Annually | Security audit, compliance certification renewal | Audit Manager, Artifact |

> 📚 **Case Study**: July 2019, Capital One incident. 106 million credit card application records exposed. The cause wasn't AWS infrastructure—it was **the customer's WAF with an SSRF vulnerability + EC2 metadata v1 (IMDSv1) leaking IAM credentials + overly broad IAM role permissions.** The attacker (former AWS employee Paige Thompson) accessed \http://169.254.169.254/latest/meta-data/iam/security-credentials/\ via SSRF, stole temporary credentials, and extracted 30TB from 700+ S3 buckets. **AWS's responsibility layer had no issues; the incident occurred in the customer responsibility layer (WAF config, IAM permission scope, IMDSv1 usage).** This is the crux. [DOJ charging document.](https://www.justice.gov/usao-edva/press-release/file/1188626/download) AWS released IMDSv2 (session-token based) shortly after (November 2019), and operators now enforce \HttpTokens=required\ on new EC2 instances as standard. Capital One paid \ million in fines to the OCC.

> 🔍 **Deeper Dive**: You enforce IMDSv2 via SSM Document \AWS-EnforceEC2InstanceMetadataServiceV2\ or Launch Template \MetadataOptions.HttpTokens=required\. More aggressively, use an SCP enforcing \ws:RequestTag/MetadataV2=required\ on \RunInstances\, or Config rule \ec2-imdsv2-check\ to flag non-compliant instances. Set **hop limit to 1** simultaneously—metadata traffic can't escape the container (can't cross Docker's default bridge interface docker0). This is a three-layer defense pattern against an operator accidentally launching an IMDSv1 instance.

> ⚠️ **Pitfall**: "Managed services handle security too"—a false assumption. Using Lambda or RDS still means **you** own data classification, IAM permissions, encryption key policies, network access controls, and backup policies. AWS patches Lambda's Python runtime and RDS's database engine; you decide when to apply those patches (Maintenance Window), how traffic is handled during that window, and whether client connection pools reconnect after a Standby failover. RDS Snapshots have a default retention of 1–35 days; beyond that, you must export manually—a detail frequently missed.

> 💡 **Related Theory**: The shared responsibility model aligns exactly with NIST SP 800-145's cloud service model taxonomy (IaaS / PaaS / SaaS). Of NIST CSF's five functions (Identify, Protect, Detect, Respond, Recover), Identify and Protect largely remain with the customer. ISO 27017 (Cloud Security) and ISO 27018 (Cloud Privacy) codify this responsibility split. In Korea, KISA's "Cloud Security Guide" (2023 revision) follows the same division, and K-ISMS-P certification audits require you to submit this responsibility matrix.

## The Operator's First Tool: AWS Health Dashboard

How does an operator learn fastest that us-east-1 is down? Twitter search? Downdetector? A Slack message from a colleague? All fast, none reliable. The operator's standard answer: **AWS Health Dashboard** and **AWS Health API**.

Health splits into two layers:

- **Service Health Dashboard (health.aws.amazon.com/health/status)**: Uniform view for all users—region and service-level notices. Usually 1–30 minute lag. Updates when AWS decides "customers are impacted."
- **Personal Health Dashboard (PHD) / AWS Health API**: Filters to events **affecting your account's resources only.** Upcoming EC2 instance reboots, EBS volume status issues, RDS maintenance windows, ACM certificate expiration warnings—they show here. Generally surfaces before the SHD.

Operators wire PHD events into EventBridge for automation:

\\\ash
# Query Health API for ongoing events
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" \
  --region us-east-1

# Organization-wide events (from management account)
aws health describe-events-for-organization \
  --filter "eventStatusCodes=open"
\\\

> 🔍 **Deeper Dive**: AWS Health API is hosted in only two places—us-east-1 and us-west-2—with automatic failover. If us-east-1 goes down, the SDK automatically retries to the us-west-2 endpoint (built into SDKs since 2023). To receive Health events via EventBridge without gaps, create rules for the \ws.health\ source in **both us-east-1 and us-west-2.** For organization-wide visibility, also enable **AWS Health Organizational View** in your management account; that needs a service-linked role (\AWSServiceRoleForHealth_Organizations\). Piping Health events to ServiceNow or PagerDuty follows the EventBridge → SNS → external webhook pattern.

## Operator Scenario Patterns You'll See on the Exam

SOA-C02 prioritizes **situation → which tool to respond with?** over abstract concepts. That's why we'll repeat the same thought flow throughout this 12-week guide.

\\\
[Symptom]                       [1st Check]          [2nd Check]
──────────────────────────────────────────────────────────────────
EC2 unresponsive               → CloudWatch metric   → EC2 status check
RDS write failure              → RDS events          → CloudWatch RDS logs
S3 403                         → CloudTrail          → Bucket Policy / IAM
Lambda timeout                 → CloudWatch Logs     → X-Ray
Cost spike                     → Cost Explorer       → CloudTrail (writes)
Outage post-deploy             → Deploy history      → Config Timeline
Suspected security incident    → GuardDuty           → CloudTrail Lake
Auto-scaling not triggering    → ASG activity        → Scaling policy + metric
\\\

This table is the skeleton of operator thinking. When an exam question asks "which tool should you check first?", this table is your answer.

## Wrapping Up

Today's two diagrams: First, AWS infrastructure is built on **three layers of isolation: Region > AZ > Edge,** and operators decide every day which resources to place at which layer. Second, security and operations responsibility split cleanly into **AWS handles hardware through hypervisor; everything above is yours**—and an operator's daily work happens in that "above" zone. As Capital One showed, even when AWS runs flawlessly, if we misconfigure security groups, IAM, and IMDSv1, 106 million people's data leaks. That's cloud operations reality.

Tomorrow we dive into **IAM**, the region of the above layer that breaks most often and causes incidents most frequently. Like Capital One, it ultimately came down to IAM permission scope + IMDSv1—the place operators look past most.

---

## 📝 연습 문제

**문제 1.** A SysOps operator wants to change IAM permissions and modify Route 53 records in another region during a us-east-1 outage. Is this operation possible?

A) Yes. IAM and Route 53 are global services, so they're unaffected by any regional outage
B) Yes. But you must explicitly specify \--region\ in the AWS CLI
C) No. The control planes of IAM and Route 53 are located in us-east-1, so write operations may be blocked
D) Yes. But you must wait for CloudFront cache to expire

**정답: C**
해설: During a us-east-1 outage, write operations like creating IAM users or modifying Route 53 records may be blocked because the control planes of IAM, Route 53 (public zone), CloudFront, and Organizations live in us-east-1. Read operations and data plane calls using already-issued credentials survive. The December 2021 outage demonstrated this architecture clearly. Assuming "global = safe" leads to incidents.

---

**문제 2.** An operator minimizes costs by having all private subnets in a VPC use only one NAT Gateway in a single AZ. What's wrong with this design?

A) NAT GW is a global resource, so there's no issue
B) If NAT GW in AZ-a dies, private subnets in other AZs also lose internet
C) If NAT GW in AZ-a dies, only AZ-a private subnets lose internet
D) NAT GW automatically fails over to another AZ, so there's no issue

**정답: B**
해설: NAT GW is an AZ-scoped resource with no automatic failover. If private subnet route tables in other AZs point to AZ-a's NAT GW and it dies, traffic from AZ-b and AZ-c also gets blocked. The standard: **one NAT GW per AZ + each private subnet's route table points to its own AZ's NAT GW.** If cost is a concern, Fck-NAT or self-hosted NAT Instances cut the \.045/GB processing fee, but add operational overhead.

---

**문제 3.** Which of the following does NOT fall under "customer responsibility"?

A) Minimizing IAM role permissions
B) Applying security patches to Lambda runtime (Python 3.12)
C) Setting security group rules for RDS instances
D) Scanning Lambda function code for vulnerabilities

**정답: B**
해설: Lambda runtime security patches are AWS's responsibility. However, migrating to a new runtime when an old one is deprecated is yours. The other three are entirely customer responsibility. For RDS: AWS patches the OS and DB engine; you decide when (Maintenance Window), plan traffic handling during that window, and verify connection pool reconnection after Standby failover.

---

**문제 4.** An operations team wants to prevent credential theft from EC2 metadata via SSRF. What's the most effective combination?

A) Block 169.254.169.254 in security group
B) Enforce IMDSv2 + hop limit 1 + Config rule \ec2-imdsv2-check\
C) Don't attach an IAM role to the instance
D) Block metadata IP in NACL

**정답: B**
해설: 169.254.169.254 is a link-local address—security groups and NACLs can't block link-local (the hypervisor handles it before routing tables). IMDSv2 requires a PUT to fetch a session token; SSRF typically only does GET. Hop limit 1 blocks leakage outside the container. Config rule auto-detects non-compliant instances. Removing the IAM role breaks SDK functionality—impractical.

---

**문제 5.** You want to receive AWS Health events via EventBridge for automation and not miss any. What's the operator standard pattern?

A) Create a rule in us-east-1 only
B) Create rules in all regions
C) Create rules in both us-east-1 and us-west-2
D) Just enable Personal Health Dashboard; events automatically come through

**정답: C**
해설: AWS Health API runs active-active in us-east-1 and us-west-2 with automatic failover. Create EventBridge rules in both regions to ensure no gaps. For organization-wide visibility, also enable Organizational View in your management account.

---

**문제 6.** To minimize cross-AZ data transfer costs (at \.01/GB × 2) between two AWS accounts, you want to place EC2 instances in the same AZ. The correct approach is?

A) Both accounts select \p-northeast-2a\
B) Match the ZoneId (e.g., \pne2-az1\) identically on both sides
C) Put both accounts in the same Organization; they auto-match
D) Share AZs via AWS Resource Access Manager

**정답: B**
해설: ZoneName (e.g., \p-northeast-2a\) is shuffled per account, so account A's \2a\ might not be the same physical AZ as account B's \2a\. **ZoneId (\pne2-az1\) is identical across all accounts,** so match by ZoneId to avoid cross-AZ costs. You can see both values in \describe-availability-zones\.
