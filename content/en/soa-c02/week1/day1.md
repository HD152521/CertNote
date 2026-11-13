# Day 1 - AWS Infrastructure Through an Operator's Eyes: Regions, AZs, and the Boundary of Responsibility

3:12 AM, your phone vibrates. A PagerDuty alert: "us-east-1 API Gateway 5xx rate above 30%, duration 4m." You log in to the console and open the Region selector. Only us-east-1 is red, and ap-northeast-2 is fine. But 99% of our company's users are in Korea. Why did a US Region failure set off our alarm? To find the answer, you need to know which component of our infrastructure is tied to which Region, and where IAM, Route 53, and CloudFront, which say "Global" at the top right of the console, actually run.

SOA-C02, the exam for the operator, asks less "which service is what" and more "where do you look when a failure happens," "how do you roll back when a change goes wrong," and "where do you start digging when costs spike." The starting point is the map of AWS infrastructure and the shared responsibility model. Only when these two pictures are firmly lodged in your head do you get a feel for in what order to search CloudWatch, CloudTrail, Config, and the Health Dashboard. Over the 12 weeks we will repeat the same line of thinking. Today is the first picture.

## Regions: The Unit Where Data Sovereignty, Price, and Service Launch Schedules Diverge

A Region is not simply "a city with data centers." **Data sovereignty, hourly price, service availability timing, compliance certifications, and control plane dependencies** all diverge at the Region level. As of 2025, AWS operates 34 commercial Regions worldwide (separately, 2 GovCloud, 2 China, and 1 Secret), and each Region has at least 3 Availability Zones (AZs). A new Region launch is planned over a long horizon, often called "a capital decision similar to building one nuclear reactor" (2 to 3 years on average).

From an operator's standpoint, there are five dimensions to look at when choosing a Region.

| Dimension | Operator considerations |
|------|-----------------|
| **Latency** | End user ↔ Region RTT. Measure with CloudPing.info, Route 53 latency records, and the Global Accelerator dashboard |
| **Service availability** | New services launch in the order us-east-1 → other Regions (usually a 6-month to 1-year gap). The launch schedule is in the `aws.amazon.com/about-aws/global-infrastructure/regional-product-services/` comparison table |
| **Price** | The same EC2 has a different unit price per Region. Seoul is usually 10-20% more expensive than Virginia. Also, Data Transfer Out differs by Region too, and even transfer between AZs within the same Region costs \$0.01/GB in each direction |
| **Compliance** | The certified Regions differ by regulation: GDPR (EU Regions), K-ISMS (Seoul), PCI-DSS, HIPAA, FedRAMP, IRAP, and so on. Download per-Region certificates from AWS Artifact |
| **Data sovereignty** | The Personal Information Protection Act Article 28-2 (overseas transfer of personal information), GDPR Article 44, China's Cybersecurity Law Article 37, and others restrict taking data out of certain regions |

The us-east-1 outage of December 7, 2021. As an AWS internal network auto-scaling system ran away, the us-east-1 control plane (EC2 API, STS, the IAM console, Cognito, Connect) was paralyzed for nearly 9 hours. The interesting point is that Netflix, Disney+, Slack, Robinhood, and Ring (an Amazon-owned IoT subsidiary) all went down together **even though EC2 instances in other Regions were running fine**. There are three reasons. First, **the STS global endpoint (sts.amazonaws.com) was actually an alias that called us-east-1** (today you can force Regional endpoints, but the SDK default is still the global one). Second, the IAM console and the Route 53 control plane are in us-east-1, so even operators in other Regions experienced "cannot log in to the console." Third, many companies' CI/CD pipelines were calling us-east-1 ECR without caching. [AWS official post-incident summary](https://aws.amazon.com/message/12721/). Lesson for operators: **even a service labeled global can be tied to a specific Region internally.** If you do not know this and assume "it is global, so it must be safe," you get an incident.

IAM, Route 53 (public hosted zones), CloudFront, WAF (the part attached to CloudFront), Organizations, and the AWS Account itself are shown as "Global," but internally their control planes are in us-east-1, and the edge or Region-level data planes cache and replicate that data. That is, when us-east-1 dies, **write operations** such as creating new IAM users, changing policies, and changing Route 53 records **are blocked**. On the other hand, data plane operations that call EC2 in other Regions with already-issued IAM credentials, DNS responses for already-deployed Route 53 records, and cached responses from CloudFront edges survive. This is called "control plane/data plane separation," a core architectural principle that Werner Vogels (AWS CTO) emphasizes in the re:Invent keynote every year. In SOA-C02 scenarios, a question such as "how do you keep operating even during a us-east-1 outage?" often tests this separation.

Isolation between Regions is the largest-scale implementation of the **bulkhead pattern** (Michael Nygard, "Release It!", 2007). Like a ship design that places bulkheads so that the whole ship does not sink when one compartment floods, bulkheads are placed explicitly so that a control plane failure in one Region does not propagate to other Regions. Also, Chapter 22 of the Google SRE Book (Beyer et al., 2016), "Addressing Cascading Failures," covers the same principle: "define failure domains clearly, and design fault tolerance on top of them." AWS's Region isolation is the result of raising that failure domain to the geographic level.

## Availability Zones (AZs): The Operator's First Isolation Tool

An AZ is a **group of one or more physically and logically independent data centers** within the same Region. AZs are connected by low-latency fiber within 1 to 2 ms, so synchronous replication is possible, yet they are separated enough that a power, cooling, or network failure in one AZ does not spread to another (usually several km to tens of km, outside the radius of impact of tornadoes and floods). Even data centers within the same AZ use separate power and cooling, and each data center has N+1 redundancy with diesel generators + UPS + dual power grids.

Three principles for handling AZs from the operator's perspective:

1. **Spread all stateful resources across at least 2 AZs**: RDS Multi-AZ, Aurora cluster (automatically spread across 3 AZs), ElastiCache replication group, MSK brokers, OpenSearch domain
2. **Spread all stateless workloads evenly across AZs with an ASG**: specify 3 or more in the ASG's `AvailabilityZones` parameter + enable `AZRebalance`
3. **Do not tie operations themselves to an AZ**: bastions, jump hosts, NAT GW, ALB target groups, and ECS services are all placed per AZ

```
[Region: ap-northeast-2 (Seoul)]
   │
   ├─ AZ-a (apne2-az1)  ┐
   ├─ AZ-b (apne2-az2)  ├─ Synchronous replication possible (RTT 1-2ms)
   ├─ AZ-c (apne2-az3)  │  Multi-AZ RDS / ASG spread / NLB Cross-Zone
   └─ AZ-d (apne2-az4)  ┘  Aurora cluster automatic 6-way replication
```

> ⚠️ **Pitfall**: A NAT Gateway is an AZ-level resource. If the NAT GW in AZ-a dies, the private subnets in AZ-a lose internet access. If you create a NAT GW in only 1 AZ in the name of saving cost, it becomes the single point of failure operators meet most often. **One NAT GW per AZ** is the standard, and that way, when one AZ fails, the private subnets in the other AZs stay healthy. For the same reason, **in the era of NAT Instances (EC2-based NAT) you had to build self-healing yourself with an ASG.** The NAT GW is a managed service where AWS does that for you. Another trap: if you do not create a VPC Endpoint, even S3 and DynamoDB traffic goes through the NAT GW and incurs a \$0.045/GB data processing charge. A Gateway Endpoint (S3/DynamoDB) is free, so turning it on is the standard.

Traffic between AZs is **automatically encrypted on the AWS backbone** (since 2022, all new EC2 instance types are Nitro-based, so they use hardware-accelerated AEAD encryption). The same applies within the same AZ. Therefore, even if the operator does not apply TLS at the application level, plaintext does not flow on the wire. However, compliance audits (PCI-DSS, HIPAA) often require application-layer encryption separately, so applying both is the standard.

The AZ isolation design is an implementation of the distributed-systems principle called **failure domain isolation**. The same concept appears in Google's "Borg" paper (Verma et al., 2015 EuroSys) and Microsoft's "Service Fabric" white paper. The key is to "clearly define the smallest unit across which failures propagate, and design replication and failover on top of it." AWS's AZ is the result of raising that smallest unit to the physical data center level. From the viewpoint of the CAP theorem (Brewer 2000, Gilbert & Lynch 2002), Multi-AZ within the same Region is a trade-off that chooses CP (Consistency + Partition tolerance), and Cross-Region asynchronous replication chooses AP. From the viewpoint of PACELC (Abadi 2012), AWS's Multi-AZ is closer to a system that "gives up some consistency for latency when there is no Partition (PA/EL)."

The Tokyo Region AZ outage of August 23, 2019. In one AZ of ap-northeast-1, a bug in the cooling system control software overheated some servers, and EC2 and EBS were affected. At that time, **workloads that had been spread multi-AZ with an ASG survived, and everything tied to a single AZ went down.** Companies that ran RDS Single-AZ had the DB die along with it and took hours to recover. After this incident, AWS began announcing "AZ-level maintenance events" more actively through PHD.

## ZoneId vs ZoneName: A Trap Only Operators Know

When you call `describe-availability-zones`, two identifiers come out.

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

**ZoneName is shuffled per account.** That is, `ap-northeast-2a` in our account and `ap-northeast-2a` in a partner's account can be different physical AZs. On the other hand, **ZoneId (apne2-az1) is the same in every account.** Why shuffle? To keep all traffic from piling into zone a alone when AWS tells every account "create in zone a first." It is a clever trick that forces traffic distribution.

Why does this matter to an operator? When **connecting with another account via VPC Peering or PrivateLink**, if you want to "place them in the same AZ to save cross-AZ cost and latency," you must match by ZoneId. If you match by ZoneName only, they actually attach to different physical AZs, latency grows by 1 ms, and data transfer cost is incurred. In SOA-C02 scenario questions, a question such as "how do you reduce cross-AZ cost between two accounts?" tests this ZoneId matching.

## Edge and Special Infrastructure: 4 Things Operators Should Know

In the operator exam, edge infrastructure usually appears in the form "how do you reduce latency in this scenario?" or "where should you apply the WAF rules?"

| Infrastructure | Location | Main services | When operators use it |
|--------|------|-------------|------------------|
| **Edge Location** | 600+ PoPs | CloudFront, Route 53, WAF, Shield, Global Accelerator | Caching static and dynamic content, DNS, DDoS defense |
| **Regional Edge Cache** | 13 | CloudFront second-tier cache, Lambda@Edge | Reducing origin load |
| **Local Zones** | 30+ cities | EC2, EBS, ECS, RDS (some) | Ultra-low-latency workloads under 10 ms (gaming, VFX, AR/VR) |
| **Wavelength** | Carrier 5G | EC2, EBS | Direct connection to mobile 5G devices (autonomous driving, industrial IoT) |
| **Outposts** | Customer DC | EC2, EBS, S3, RDS, EKS | Data sovereignty and hybrid (finance, healthcare, government) |

During the COVID traffic surge of 2020, thanks to the **Open Connect Appliances (OCAs)** installed directly inside ISP networks, Netflix's traffic barely rode the ISP backbone. AWS has a similar concept: **CloudFront edges peer directly with ISP networks** (in Seoul, directly connected to KT, LG U+, and SKB alike). That is why simply turning on CloudFront makes user ↔ origin traffic bypass the ISP backbone. At the same time, origin shield (GA in 2020) funnels all edge cache misses into a single Regional Edge Cache, reducing origin load another step.

CloudFront Functions and Lambda@Edge both run at the edge but in different locations. **CloudFront Functions** run directly at the 600+ edge PoPs and respond with a cold start under 100 μs, but have the constraints of 2 MB memory, 1 ms execution time, and JavaScript ES5 only. **Lambda@Edge** runs at the 13 Regional Edge Caches and can use the full Node.js and Python runtimes, but has cold starts on the order of tens of ms. In SOA-C02, answering "URL rewrite, header manipulation?" → CloudFront Functions and "image resize, token verification?" → Lambda@Edge is almost always right.

## The Shared Responsibility Model: Redrawn from the Operator's Viewpoint

**AWS = Security OF the Cloud / Customer = Security IN the Cloud.** Everyone memorizes this one line, but when you list what an operator actually has to do every day in "my area of responsibility," your feel for solving exam scenarios changes.

What an operator actually has to do daily, weekly, and quarterly:

| Frequency | Task | Tool |
|------|------|------|
| Daily | Check CloudWatch alarms, check cost anomalies | CloudWatch, Cost Anomaly Detection |
| Weekly | Review IAM permissions (Last Accessed), review security group rules | Access Analyzer, Credential Report |
| Monthly | Apply OS patches, review KMS key rotation | SSM Patch Manager, KMS |
| Quarterly | Backup restore drills, DR simulation | AWS Backup, Route 53 ARC |
| Once a year | Security audit, renew compliance certifications | Audit Manager, Artifact |

The Capital One incident of July 2019. Card application data of 106 million people was leaked. The cause was not the AWS infrastructure but **an SSRF vulnerability in the customer's WAF + exposure of IAM credentials via EC2 metadata v1 (IMDSv1) + an overly broad IAM role permission**. The attacker (Paige Thompson, a former AWS employee) accessed `http://169.254.169.254/latest/meta-data/iam/security-credentials/` through SSRF, stole temporary credentials, and used that authority to pull data out of S3 buckets. The key point is that **there was no problem in AWS's area of responsibility, but the incident occurred in the customer's area of responsibility (WAF configuration, IAM permission scope, use of IMDSv1)**. [DOJ indictment](https://www.justice.gov/usao-edva/press-release/file/1188626/download). Right after this incident (November 2019), AWS released IMDSv2 (session-token based), and enforcing `HttpTokens=required` starting with new EC2 instances became the standard for operators. Afterward, Capital One was fined 80 million dollars in civil penalties by the US Office of the Comptroller of the Currency (OCC) in 2020, and in 2022 agreed to pay a separate 190 million dollars in a class-action settlement.

IMDSv2 is enforced with the SSM Document `AWS-EnforceEC2InstanceMetadataServiceV2` or `MetadataOptions.HttpTokens=required` in a Launch Template. More strongly, use an SCP to enforce the `aws:RequestTag/MetadataV2=required` condition on `RunInstances`, or detect non-compliant instances with the Config rule `ec2-imdsv2-check`. And if you also set **hop limit 1**, metadata traffic cannot leave outside the container (it cannot cross the docker0 interface of Docker's default bridge network). It is a three-layer defense pattern that prevents an operator from accidentally launching an instance with IMDSv1.

> ⚠️ **Pitfall**: The trap of "it is a managed service, so AWS is responsible for security too." Even if you use Lambda or RDS, **data classification, IAM permissions, encryption key policies, network access control, and backup policies** are always the customer's responsibility. AWS patches the OS and DB engine of RDS, but deciding the Maintenance Window in which to apply that patch, planning how to handle traffic during that time, and confirming that the client connection pool reconnects even when failing over to the Standby are the operator's job. Also, the default retention of RDS Snapshots is 1 to 35 days, so keeping them longer requires exporting them separately, which is often overlooked.

The shared responsibility model fits exactly with the cloud service model (IaaS / PaaS / SaaS) classification of NIST SP 800-145. Of the 5 functions of the NIST CSF (Cybersecurity Framework) (Identify, Protect, Detect, Respond, Recover), Identify and Protect almost entirely remain in the customer's domain. ISO 27017 (cloud security) and ISO 27018 (cloud privacy) also codify areas of responsibility on top of this model. In Korea, KISA's "Cloud Security Guide" (2023 revised edition) follows the same split, and this responsibility split table must be submitted during K-ISMS-P certification review.

## The Operator's First Tool: AWS Health Dashboard

How do you find out fastest whether us-east-1 is down? A Twitter search? Downdetector? A colleague's Slack? All are fast but low in reliability. The operator's standard answer is the **AWS Health Dashboard** and the **AWS Health API**.

Health is divided into two layers.

- **Service Health Dashboard (health.aws.amazon.com/health/status)**: Region and service-level announcements shown identically to all users. Usually a 1-30 minute delay. It is updated when AWS judges that "customers are affected"
- **Personal Health Dashboard (PHD) / AWS Health API**: filters only events that **affect your account's resources**. Scheduled EC2 instance restarts, EBS volume status problems, RDS maintenance notices, and Certificate Manager expirations appear here. It generally appears earlier than the SHD

Operators receive PHD events through EventBridge and connect them to automation.

```bash
# Query ongoing events with the Health API
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" \
  --region us-east-1

# Organization-wide events (from the management account)
aws health describe-events-for-organization \
  --filter "eventStatusCodes=open"
```

The AWS Health API is hosted in only two places, us-east-1 and us-west-2, and **fails over automatically**. If us-east-1 dies, the SDK automatically retries against the us-west-2 endpoint (built into the SDK since 2023). To receive Health events in EventBridge, you must create an `aws.health` source rule in both us-east-1 and us-west-2 to receive them without omission. To see things at the Organization level, you must turn on **AWS Health Organizational View**, and this requires the management account's service-linked role (`AWSServiceRoleForHealth_Organizations`). Sending Health events to ServiceNow or PagerDuty also follows the standard EventBridge → SNS → external webhook pattern.

## Operator Scenario Patterns on the Exam

SOA-C02 is less about abstract concepts and more the pattern of **situation → which tool and how to respond?** So we will repeat the same line of thinking throughout this book.

```
[Symptom]                       [1st check]            [2nd check]
─────────────────────────────────────────────────────────────────
EC2 not responding           → CloudWatch metric  → EC2 status check
RDS write failures           → RDS events         → CloudWatch RDS logs
S3 403                       → CloudTrail        → Bucket Policy / IAM
Lambda timeout               → CloudWatch Logs   → X-Ray
Cost spike                   → Cost Explorer     → CloudTrail (writes)
Failure after deployment     → Deploy history    → Config Timeline
Suspected security incident  → GuardDuty         → CloudTrail Lake
Scale-out not occurring      → ASG activity      → Scaling policy + metric
```

This table is the basic skeleton of the operator's line of thinking. From Week 2 onward, as we dig deep into each service, this pattern gains flesh. When a question asks "which tool should you look at first?", this table is the answer.

## Summary

There are two pictures we saw today. First, AWS infrastructure is built on a 3-layer isolation of **Region > AZ > Edge**, and an operator decides every day which resource to place in which layer. Second, security and operations responsibility is divided by a clear boundary: **AWS is responsible from the hardware up to the hypervisor, and everything above that belongs to the customer**, and the operator's daily life happens in that "above" area. As the Capital One incident shows, even when AWS is doing its job well, if we misconfigure the WAF, IAM, and IMDSv1, the data of 106 million people leaks, and that is the reality of cloud operations.

Tomorrow we get into **IAM**, the part of that upper area that breaks most often and causes incidents most often. Just as the Capital One incident began with a WAF misconfiguration (SSRF) and grew into a major leak because of IMDSv1 and an overly broad IAM permission scope, this is the number one place where incidents happen while operators are not looking.

---

## 📝 Practice Questions

**Question 1.** A SysOps operator wants to change IAM permissions and modify Route 53 records from another Region during a us-east-1 outage. Is this operation possible?

A) Possible. IAM and Route 53 are global services, so they are unaffected by any Region failure
B) Possible. But you must specify `--region` in the AWS CLI
C) Not possible. The control planes of IAM and Route 53 are located in us-east-1, so write operations can be blocked
D) Possible. But you have to wait until the CloudFront cache expires

**Answer: C**
Explanation: Even services marked "Global," such as IAM, Route 53 (public zone), CloudFront, and Organizations, have their control planes in us-east-1. During a us-east-1 outage, write operations such as creating IAM users and modifying Route 53 records can be blocked. Read operations and data plane calls using already-issued credentials survive. The December 2021 outage clearly showed this structure. If an operator assumes "it is global, so it is safe," an incident occurs.

---

**Question 2.** To cut costs, an operator set up all private subnets in a VPC to use a single NAT Gateway in one AZ. What is the problem with this design?

A) The NAT GW is a global resource, so there is no problem
B) If the NAT GW in AZ-a dies, the private subnets in other AZs also lose internet access
C) If the NAT GW in AZ-a dies, only the private subnets in AZ-a lose internet access
D) The NAT GW fails over automatically to another AZ, so there is no problem

**Answer: B**
Explanation: A NAT GW is an AZ-level resource with no automatic failover. If the route tables of private subnets in other AZs point to the NAT GW in AZ-a, then when the AZ-a NAT GW fails, the traffic of AZ-b and AZ-c is blocked too. The standard is **1 NAT GW per AZ + set each private subnet's route table to point to its own AZ's NAT GW**. If cost is a burden, there is also the option of cutting the \$0.045/GB processing fee by self-hosting a NAT Instance such as Fck-NAT, but operational burden comes with it.

---

**Question 3.** Which of the following does NOT fall within the "customer's area of responsibility"?

A) Minimizing the permission scope of IAM roles
B) Applying security patches to the Lambda runtime (Python 3.12)
C) Configuring security group rules for the RDS instance
D) Checking the Lambda function code for vulnerabilities

**Answer: B**
Explanation: Security patching of the Lambda runtime itself is AWS's responsibility. However, migrating to a new version when a runtime is deprecated is the customer's responsibility. The other three are all the customer's responsibility. For RDS, AWS handles OS and DB engine patches, and deciding the Maintenance Window for when to apply them is the customer's.

---

**Question 4.** An operations team wants to prevent credential theft (SSRF) through the metadata of EC2 instances. What is the most effective combination?

A) Block 169.254.169.254 in the SG
B) Enforce IMDSv2 + hop limit 1 + the Config rule `ec2-imdsv2-check`
C) Do not attach an IAM role to the instance
D) Block the metadata IP in the NACL

**Answer: B**
Explanation: 169.254.169.254 is a link-local address, so it cannot be blocked by SGs or NACLs (link-local is handled at the hypervisor level, not by route tables). IMDSv2 requires obtaining a session token with a PUT, whereas SSRF is usually limited to GET. Hop limit 1 blocks leakage outside the container. The Config rule automatically detects non-compliant instances. If you do not attach an IAM role, the SDK cannot work, which is unrealistic.

---

**Question 5.** You want to receive AWS Health events in EventBridge and automate on them. What is the operator's standard pattern for receiving them without omission?

A) Create the rule in us-east-1 only
B) Create the rule in every Region
C) Create the rule in both us-east-1 and us-west-2
D) Just turning on the Personal Health Dashboard receives them automatically

**Answer: C**
Explanation: The AWS Health API runs active-active in two places, us-east-1 and us-west-2, and fails over automatically. You must create EventBridge rules in both Regions to avoid omissions. To see the whole Organization, you must also turn on Organizational View from the management account.

---

**Question 6.** To minimize the cross-AZ data transfer cost between two AWS accounts (\$0.01/GB × 2), you want to place EC2 in the same AZ. What is the correct method?

A) Choose `ap-northeast-2a` in both accounts
B) Match the ZoneId (for example, `apne2-az1`) identically on both sides
C) Putting the two accounts in the same Organization matches them automatically
D) Share the AZ with AWS Resource Access Manager

**Answer: B**
Explanation: ZoneName (for example, `ap-northeast-2a`) is shuffled per account, so the `2a` of the two accounts may not be the same physical AZ. **ZoneId (`apne2-az1`) is the same in every account**, so you must match by ZoneId to avoid cross-AZ cost. You can check both values with `describe-availability-zones`.

---
