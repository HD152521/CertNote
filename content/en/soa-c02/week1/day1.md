# Day 1 - AWS Infrastructure Through an Operator's Eyes: Regions, AZs, and the Boundary of Responsibility

3:12 AM, your phone buzzes. A PagerDuty alert: "us-east-1 API Gateway 5xx rate exceeded 30%, duration 4m." You log into the console and open the region selector. Only us-east-1 is red; ap-northeast-2 looks fine. But 99% of your company's users are in Korea. Why did a US region outage trigger our alarm? To find the answer, you need to know which components of your infrastructure are tied to which region — and where IAM, Route 53, and CloudFront, labeled "Global" in the top-right of the console, actually run.

SOA-C02, the operator's exam, asks less about "which service is what" and more about "where do you look when something breaks," "how do you roll back a bad change," and "where do you start digging when costs spike." The starting point for all of that is the AWS infrastructure map and the shared responsibility model. Only when these two pictures are firmly fixed in your head will you have an instinct for the order in which to comb through CloudWatch, CloudTrail, Config, and the Health Dashboard. We will repeat the same thought process for 12 weeks. Today is the first picture.

## Regions: The Unit Where Data Sovereignty, Pricing, and Service Launch Schedules Diverge

A region is not simply "a city with a data center." **Data sovereignty, hourly pricing, service availability timing, compliance certifications, and control plane dependencies** all split along region boundaries. As of 2025, AWS operates 34 commercial regions worldwide (plus 2 GovCloud, 2 China, and 1 Secret region separately), and each region has at least 3 Availability Zones (AZs). Launching a new region is a long-horizon decision often described as "a capital commitment comparable to building a nuclear power plant" (typically 2-3 years).

From an operator's perspective, there are five dimensions to consider when choosing a region.

| Dimension | Operator Considerations |
|------|-----------------|
| **Latency** | End user ↔ region RTT. Measure with CloudPing.info, Route 53 latency records, Global Accelerator dashboard |
| **Service availability** | New services launch in us-east-1 first, then other regions (usually 6 months to 1 year later). Launch schedules are on the comparison table at `aws.amazon.com/about-aws/global-infrastructure/regional-product-services/` |
| **Pricing** | The same EC2 instance costs differently per region. Seoul is typically 10-20% more expensive than Virginia. Data Transfer Out also varies by region, and cross-AZ transfer within the same region costs \$0.01/GB per direction |
| **Compliance** | Certified regions differ per regulation: GDPR (EU regions), K-ISMS (Seoul), PCI-DSS, HIPAA, FedRAMP, IRAP, etc. Download per-region certificates from AWS Artifact |
| **Data sovereignty** | Article 28-2 of Korea's Personal Information Protection Act (cross-border transfer of personal data), GDPR Article 44, Article 37 of China's Cybersecurity Law, and similar laws restrict moving data outside specific territories |

> 📚 **Case study**: The December 7, 2021 us-east-1 outage. AWS's internal network auto-scaling system ran away, paralyzing the us-east-1 control plane (EC2 API, STS, IAM console, Cognito, Connect) for nearly 9 hours. The interesting part is that **even though EC2 instances in other regions kept running fine**, Netflix, Disney+, Slack, Robinhood, and Ring (Amazon's own IoT subsidiary) all went down together. There were three reasons. First, **the STS global endpoint (sts.amazonaws.com) was actually an alias that called us-east-1** (regional endpoints can now be enforced, but the SDK default is still global). Second, the IAM console and Route 53 control planes live in us-east-1, so operators in other regions also experienced "can't log into the console." Third, many companies' CI/CD pipelines were calling us-east-1 ECR without caching. [AWS official postmortem](https://aws.amazon.com/message/12721/). Operator lesson: **even a service labeled global may be tied to a specific region internally**. If you assume "it's global, so it must be safe" without knowing this, you will have an incident.

> 🔍 **Deeper dive**: IAM, Route 53 (public hosted zones), CloudFront, WAF (the CloudFront-attached portion), Organizations, and the AWS account itself are displayed as "Global," but internally their control planes live in us-east-1, with edge or per-region data planes caching and replicating that data. In other words, if us-east-1 goes down, **write operations are blocked** — creating new IAM users, changing policies, modifying Route 53 records. Meanwhile, data plane operations survive: calling EC2 in other regions with already-issued IAM credentials, DNS responses for already-deployed Route 53 records, cache responses from CloudFront edges. This is called "control plane / data plane separation," and it's a core architectural principle that Werner Vogels (AWS CTO) emphasizes in his re:Invent keynote every year. In SOA-C02 scenarios, questions like "how do you keep operating during a us-east-1 outage?" frequently test this separation.

> 💡 **Related theory**: Cross-region isolation is the largest-scale implementation of the **bulkhead pattern** (Michael Nygard, *Release It!*, 2007). Like ship design that adds bulkheads so one flooded compartment doesn't sink the whole vessel, explicit barriers prevent one region's control plane failure from propagating to another. Chapter 22 of the Google SRE Book (Beyer et al., 2016), "Addressing Cascading Failures," covers the same principle: "define your failure domains clearly and design fault tolerance on top of them." AWS's region isolation is the result of elevating that failure domain to the geographic level.

## Availability Zones (AZs): The Operator's First Isolation Tool

An AZ is a **physically and logically independent group of one or more data centers** within the same region. AZs are connected by low-latency fiber with RTT under 1-2ms, enabling synchronous replication, yet they are separated far enough (usually a few to tens of kilometers, outside the impact radius of tornadoes and floods) that a power, cooling, or network failure in one AZ doesn't spread to another. Even data centers within the same AZ use separate power and cooling, and each DC has N+1 redundancy with diesel generators, UPS, and dual power grids.

Three operator principles for handling AZs:

1. **Distribute every stateful resource across at least 2 AZs**: RDS Multi-AZ, Aurora clusters (auto-distributed across 3 AZs), ElastiCache replication groups, MSK brokers, OpenSearch domains
2. **Distribute every stateless workload evenly across AZs via ASG**: specify 3 or more in the ASG's `AvailabilityZones` parameter + enable `AZRebalance`
3. **Keep operations itself untied from any single AZ**: bastions, jump hosts, NAT GWs, ALB target groups, ECS services — all placed per AZ

```
[Region: ap-northeast-2 (Seoul)]
   │
   ├─ AZ-a (apne2-az1)  ┐
   ├─ AZ-b (apne2-az2)  ├─ Synchronous replication possible (RTT 1-2ms)
   ├─ AZ-c (apne2-az3)  │  Multi-AZ RDS / ASG distribution / NLB Cross-Zone
   └─ AZ-d (apne2-az4)  ┘  Aurora cluster automatic 6-way replication
```

> ⚠️ **Pitfall**: A NAT Gateway is an AZ-scoped resource. If the NAT GW in AZ-a dies, the private subnets in AZ-a lose internet access. Creating a NAT GW in only one AZ to save money becomes the single point of failure operators encounter most often. **One NAT GW per AZ** is the standard, so that when one AZ fails, the private subnets in other AZs stay healthy. For the same reason, **back in the NAT Instance (EC2-based NAT) era, you had to build self-healing yourself with an ASG**. The NAT GW is the managed service where AWS does that for you. Another pitfall: if you don't create VPC Endpoints, even S3 and DynamoDB traffic goes through the NAT GW and incurs a \$0.045/GB data processing charge. Gateway Endpoints (S3/DynamoDB) are free, so enabling them is standard practice.

> 🔍 **Deeper dive**: Cross-AZ traffic is **automatically encrypted on the AWS backbone** (since 2022, all new EC2 instance types are Nitro-based with hardware-accelerated AEAD encryption). The same applies within a single AZ. So even if an operator doesn't apply TLS at the application level, no plaintext flows on the wire. However, compliance audits (PCI-DSS, HIPAA) often separately require application-layer encryption, so applying both is the standard.

> 💡 **Related theory**: AZ isolation design implements the distributed systems principle of **failure domain isolation**. The same concept appears in Google's "Borg" paper (Verma et al., 2015 EuroSys) and Microsoft's "Service Fabric" whitepaper. The core idea: "clearly define the smallest unit across which failures propagate, then design replication and failover on top of it." AWS's AZ elevates that smallest unit to the physical data center level. Through the lens of the CAP theorem (Brewer 2000, Gilbert & Lynch 2002), Multi-AZ within a region chooses CP (Consistency + Partition tolerance), while cross-region asynchronous replication is the AP trade-off. Through PACELC (Abadi 2012), AWS Multi-AZ is closer to a system that "when there is no partition, gives up some consistency for latency (PA/EL)."

> 📚 **Case study**: The August 23, 2019 Tokyo region AZ failure. In one AZ of ap-northeast-1, a bug in the cooling system control software caused some servers to overheat, affecting EC2 and EBS. At the time, **workloads distributed multi-AZ via ASG survived, while everything pinned to a single AZ went down**. Companies running RDS Single-AZ lost their databases too and took hours to recover. After this incident, AWS began announcing "AZ-level maintenance events" more proactively via PHD.

## ZoneId vs ZoneName: A Trap Only Operators Know

Calling `describe-availability-zones` returns two identifiers.

```bash
aws ec2 describe-availability-zones --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId]' --output table
```

```
+-------------------+-----------+
| ap-northeast-2a   | apne2-az1 |
| ap-northeast-2b   | apne2-az2 |
| ap-northeast-2c   | apne2-az3 |
| ap-northeast-2d   | apne2-az4 |
+-------------------+-----------+
```

**ZoneName is shuffled per account.** That means your account's `ap-northeast-2a` and a partner's account's `ap-northeast-2a` may be different physical AZs. In contrast, **ZoneId (apne2-az1) is identical across all accounts**. Why shuffle? If AWS told every account "create in zone a first," all traffic would pile into a single zone. Shuffling is a clever trick to force traffic distribution.

Why does this matter to operators? When you **connect to another account via VPC Peering or PrivateLink** and want to "co-locate in the same AZ to save cross-AZ cost and latency," you must match on ZoneId. If you match only by ZoneName, you may actually land in different physical AZs, adding 1ms of latency and incurring data transfer charges. SOA-C02 scenario questions like "how do you reduce cross-AZ costs between two accounts?" are testing this ZoneId matching.

## Edge and Special Infrastructure: 4 Things Operators Must Know

On the operator exam, edge infrastructure usually appears as "how do you reduce latency in this scenario?" or "where should you apply the WAF rules?"

| Infrastructure | Location | Key Services | When Operators Use It |
|--------|------|-------------|------------------|
| **Edge Location** | 600+ PoPs | CloudFront, Route 53, WAF, Shield, Global Accelerator | Static/dynamic content caching, DNS, DDoS protection |
| **Regional Edge Cache** | 13 locations | CloudFront second-tier cache, Lambda@Edge | Reducing origin load |
| **Local Zones** | 30+ cities | EC2, EBS, ECS, RDS (partial) | Sub-10ms ultra-low-latency workloads (gaming, VFX, AR/VR) |
| **Wavelength** | Carrier 5G | EC2, EBS | Direct connection to mobile 5G devices (autonomous driving, industrial IoT) |
| **Outposts** | Customer DC | EC2, EBS, S3, RDS, EKS | Data sovereignty & hybrid (finance, healthcare, government) |

> 📚 **Case study**: During the 2020 COVID traffic surge, Netflix barely touched ISP backbones thanks to **Open Connect Appliances (OCA)** installed directly inside ISP networks. AWS uses a similar concept: **CloudFront edges peer directly with ISP networks** (in Seoul, direct connections to KT, LG U+, and SKB). This is why simply enabling CloudFront lets user ↔ origin traffic bypass the ISP backbone. Meanwhile, Origin Shield (GA in 2020) funnels all edge cache misses through a single Regional Edge Cache, cutting origin load by another level.

> 🔍 **Deeper dive**: CloudFront Functions and Lambda@Edge both run at the edge, but in different places. **CloudFront Functions** execute directly at 600+ edge PoPs and respond with sub-100μs cold starts, but with constraints: 2MB memory, 1ms execution time, JavaScript ES5 only. **Lambda@Edge** runs at the 13 Regional Edge Caches and can use full Node.js/Python runtimes, but cold starts are in the tens of milliseconds. On SOA-C02: "URL rewrites, header manipulation?" → CloudFront Functions; "image resizing, token validation?" → Lambda@Edge — answer this way and you'll almost always be right.

## The Shared Responsibility Model: Redrawn from the Operator's Viewpoint

**AWS = Security OF the Cloud / Customer = Security IN the Cloud**. Everyone memorizes this one line, but if you enumerate what an operator actually has to do daily in "my area of responsibility," your feel for exam scenarios changes.

What operators actually do daily, weekly, and quarterly:

| Cadence | Task | Tools |
|------|------|------|
| Daily | Check CloudWatch alarms, check cost anomalies | CloudWatch, Cost Anomaly Detection |
| Weekly | Review IAM permissions (Last Accessed), review security group rules | Access Analyzer, Credential Report |
| Monthly | Apply OS patches, review KMS key rotation | SSM Patch Manager, KMS |
| Quarterly | Backup restore drills, DR simulation | AWS Backup, Route 53 ARC |
| Annually | Security audit, compliance certification renewal | Audit Manager, Artifact |

> 📚 **Case study**: The July 2019 Capital One breach. Card application data for 106 million people was exfiltrated. The cause was not AWS infrastructure but **an SSRF vulnerability in the customer's WAF + IAM credential exposure via EC2 metadata v1 (IMDSv1) + overly broad IAM role permissions**. The attacker (former AWS employee Paige Thompson) used SSRF to reach `http://169.254.169.254/latest/meta-data/iam/security-credentials/`, stole temporary credentials, and pulled 30TB of data from more than 700 S3 buckets. **Nothing was wrong in AWS's area of responsibility; the incident occurred in the customer's area** (WAF configuration, IAM permission scope, use of IMDSv1) — that is the key point. [DOJ indictment](https://www.justice.gov/usao-edva/press-release/file/1188626/download). Right after this incident (November 2019), AWS released IMDSv2 (session-token based), and enforcing `HttpTokens=required` on new EC2 instances became the operator standard. Capital One paid a \$190 million fine to the OCC.

> 🔍 **Deeper dive**: Enforce IMDSv2 with the SSM Document `AWS-EnforceEC2InstanceMetadataServiceV2` or Launch Template `MetadataOptions.HttpTokens=required`. Stronger still: use an SCP forcing the `aws:RequestTag/MetadataV2=required` condition on `RunInstances`, or detect non-compliant instances with the Config rule `ec2-imdsv2-check`. And if you set **hop limit 1** alongside, metadata traffic cannot escape outside containers (it can't cross the docker0 interface of Docker's default bridge network). This is a triple-defense pattern that stops operators from accidentally launching instances with IMDSv1.

> ⚠️ **Pitfall**: The trap of "it's a managed service, so AWS is responsible for security too." Even with Lambda or RDS, **data classification, IAM permissions, encryption key policies, network access control, and backup policies** are always the customer's responsibility. AWS patches the RDS OS and DB engine, but choosing the Maintenance Window in which to apply the patch, planning traffic handling during that window, and verifying that client connection pools reconnect after failover to the standby are the operator's job. Also frequently missed: RDS snapshots have a default retention of 1-35 days, so keeping them longer requires a separate export.

> 💡 **Related theory**: The shared responsibility model maps precisely onto the cloud service model classification (IaaS / PaaS / SaaS) of NIST SP 800-145. Of the five functions of the NIST CSF (Cybersecurity Framework) — Identify, Protect, Detect, Respond, Recover — Identify and Protect remain almost entirely in the customer's domain. ISO 27017 (cloud security) and ISO 27018 (cloud privacy) also codify responsibility areas on top of this model. In Korea, KISA's Cloud Security Guide (2023 revision) follows the same split, and the responsibility matrix must be submitted during K-ISMS-P certification audits.

## The Operator's First Tool: AWS Health Dashboard

How do you learn fastest that us-east-1 is down? Searching Twitter? Downdetector? A colleague's Slack? All fast, but low reliability. The operator's standard answer is the **AWS Health Dashboard** and the **AWS Health API**.

Health splits into two layers.

- **Service Health Dashboard (health.aws.amazon.com/health/status)**: Region/service-level announcements shown identically to all users. Usually delayed 1-30 minutes. Updated when AWS judges there is "customer impact"
- **Personal Health Dashboard (PHD) / AWS Health API**: Filters to only events **affecting resources in your account**. Scheduled EC2 instance restarts, EBS volume health issues, RDS maintenance notices, and Certificate Manager expirations show up here. Generally appears before the SHD

Operators receive PHD events via EventBridge and wire them into automation.

```bash
# Query in-progress events via the Health API
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" \
  --region us-east-1

# Organization-wide events (from the management account)
aws health describe-events-for-organization \
  --filter "eventStatusCodes=open"
```

> 🔍 **Deeper dive**: The AWS Health API is hosted in only two places — us-east-1 and us-west-2 — and **fails over automatically**. If us-east-1 goes down, the SDK automatically retries against the us-west-2 endpoint (built into SDKs since 2023). To receive Health events in EventBridge without gaps, create `aws.health` source rules in both us-east-1 and us-west-2. For organization-level visibility, enable **AWS Health Organizational View**, which requires the management account's service-linked role (`AWSServiceRoleForHealth_Organizations`). Sending Health events to ServiceNow or PagerDuty follows the standard EventBridge → SNS → external webhook pattern.

## Operator Scenario Patterns That Appear Frequently on the Exam

SOA-C02 is less about abstract concepts and more about the **situation → which tool, and how do you respond?** pattern. That's why this entire book repeats the same thought process.

```
[Symptom]                       [First check]         [Second check]
─────────────────────────────────────────────────────────────────
EC2 not responding           → CloudWatch metric  → EC2 status check
RDS write failure            → RDS events        → CloudWatch RDS logs
S3 403                       → CloudTrail        → Bucket Policy / IAM
Lambda timeout               → CloudWatch Logs   → X-Ray
Cost spike                   → Cost Explorer     → CloudTrail (writes)
Failure after deployment     → Deploy history    → Config Timeline
Suspected security incident  → GuardDuty         → CloudTrail Lake
Auto scaling not triggering  → ASG activity      → Scaling policy + metric
```

This table is the basic skeleton of the operator's thought process. From Week 2 onward, as we dig deep into each service, this pattern gains flesh. When the exam asks "which tool should you check first," this table is the answer.

## Wrapping Up

Today we drew two pictures. First, AWS infrastructure is built on a 3-layer isolation of **Region > AZ > Edge**, and operators decide every day which resources go in which layer. Second, security and operational responsibility split along a clear boundary — **AWS from the hardware to the hypervisor, and the customer above that** — and the operator's daily work happens in that "above" area. As the Capital One incident showed, even when AWS is doing its job well, if we misconfigure SGs, IAM, or IMDSv1, the data of 106 million people leaks. That is the reality of cloud operations.

Tomorrow we go into the part of that upper area that breaks most often and causes the most incidents: **IAM**. Just as the root cause of Capital One was ultimately IAM permission scope + IMDSv1, this is the number one place where incidents happen while operators aren't looking.

---

## 📝 연습 문제

**문제 1.** A SysOps operator wants to change IAM permissions and modify Route 53 records from another region during a us-east-1 outage. Is this possible?

A) Yes. IAM and Route 53 are global services, so they are unaffected by any regional outage
B) Yes, as long as `--region` is explicitly specified in the AWS CLI
C) No. The control planes for IAM and Route 53 are located in us-east-1, so write operations may be blocked
D) Yes, but you must wait until the CloudFront cache expires

**정답: C**
해설: Even services labeled "Global" — IAM, Route 53 (public zones), CloudFront, Organizations — have their control planes in us-east-1. During a us-east-1 outage, write operations such as creating IAM users or modifying Route 53 records can be blocked. Read operations and data plane calls using already-issued credentials survive. The December 2021 outage demonstrated this structure clearly. Assuming "it's global, so it's safe" leads to incidents.

---

**문제 2.** To cut costs, an operator configured all private subnets in a VPC to use a single NAT Gateway in one AZ. What is the problem with this design?

A) NAT GW is a global resource, so there is no problem
B) If the NAT GW in AZ-a dies, private subnets in other AZs also lose internet access
C) If the NAT GW in AZ-a dies, only AZ-a private subnets lose internet access
D) NAT GW automatically fails over to another AZ, so there is no problem

**정답: B**
해설: A NAT GW is an AZ-scoped resource with no automatic failover. If the route tables of private subnets in other AZs point to the NAT GW in AZ-a, then when the AZ-a NAT GW fails, traffic from AZ-b and AZ-c is blocked too. The standard is **one NAT GW per AZ + each private subnet's route table pointing to the NAT GW in its own AZ**. If cost is a concern, self-hosting a NAT Instance like Fck-NAT can reduce the \$0.045/GB processing fee, but it comes with operational burden.

---

**문제 3.** Which of the following is NOT part of the "customer responsibility" area?

A) Minimizing the permission scope of IAM roles
B) Applying security patches to the Lambda runtime (Python 3.12)
C) Configuring security group rules for an RDS instance
D) Checking Lambda function code for vulnerabilities

**정답: B**
해설: Security patches for the Lambda runtime itself are AWS's responsibility. However, migrating to a new version when a runtime is deprecated is the customer's responsibility. The other three are all customer responsibilities. For RDS, patching the OS and DB engine is AWS's job, but deciding when to apply the patch via the Maintenance Window is the customer's.

---

**문제 4.** An operations team wants to prevent credential theft via EC2 instance metadata (SSRF). What is the most effective combination?

A) Block 169.254.169.254 in the SG
B) Enforce IMDSv2 + hop limit 1 + Config rule `ec2-imdsv2-check`
C) Don't attach an IAM role to the instance
D) Block the metadata IP in the NACL

**정답: B**
해설: 169.254.169.254 is a link-local address, so it cannot be blocked with SGs or NACLs (link-local traffic is handled at the hypervisor level, not the route table). IMDSv2 requires obtaining a session token via PUT, while SSRF typically allows only GET. Hop limit 1 blocks leakage outside containers. The Config rule automatically detects non-compliant instances. Not attaching an IAM role breaks the SDK entirely, so it's unrealistic.

---

**문제 5.** You want to receive AWS Health events via EventBridge for automation. What is the operator's standard pattern for receiving them without gaps?

A) Create a rule only in us-east-1
B) Create rules in every region
C) Create rules in both us-east-1 and us-west-2
D) Just enabling the Personal Health Dashboard receives them automatically

**정답: C**
해설: The AWS Health API runs active-active in us-east-1 and us-west-2 with automatic failover. You must create EventBridge rules in both regions to avoid gaps. For organization-wide visibility, also enable Organizational View in the management account.

---

**문제 6.** You want to place EC2 instances in the same AZ across two AWS accounts to minimize cross-AZ data transfer costs (\$0.01/GB × 2). What is the correct method?

A) Select `ap-northeast-2a` in both accounts
B) Match the ZoneId (e.g., `apne2-az1`) identically on both sides
C) Putting both accounts in the same Organization matches them automatically
D) Share the AZ via AWS Resource Access Manager

**정답: B**
해설: ZoneName (e.g., `ap-northeast-2a`) is shuffled per account, so `2a` in two accounts may not be the same physical AZ. **ZoneId (`apne2-az1`) is identical across all accounts**, so you must match on ZoneId to avoid cross-AZ costs. Both values are visible via `describe-availability-zones`.
