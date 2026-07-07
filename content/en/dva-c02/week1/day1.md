# Day 1 - AWS from a Developer's Perspective: Regions, Infrastructure, and the Boundary of Responsibility

When you join a new company and get your first AWS console access, you usually run into two questions right away. One is "Which region should I create this in?", and the other is "Is this something we have to manage, or does AWS take care of it?" If the SAA exam answers these questions with "How do you design this as an architect?", the DVA exam answers them with "How do you, as a developer, put your code and builds on top of it?" Same infrastructure map, different vantage point.

In this article, we dig into AWS's global infrastructure only as deep as a developer needs — but deep enough to reach the point where SDK calls and endpoint selection get serious. The goal is not to memorize exam keywords, but to truly understand why `region_name` is needed when creating a `boto3` client, how IAM roles enter into the behavior of your code, and which AZ a Lambda function actually runs in.

## The Development Paradigm Shift Created by Cloud Computing

On March 14, 2006, S3 launched to general availability and the era of cloud computing began. Before then, for a developer to ship a new feature, they had to go through four steps — (1) server quotes, (2) data center colocation contracts, (3) OS and middleware installation, (4) deployment — and it took weeks at best. S3, and EC2 which came the following year (August 2006), cut this cycle down to minutes. The real change AWS created was not "we rent out servers" but the model of "**Infrastructure as API**". Once infrastructure became a resource callable from code, the entire set of modern DevOps practices — CI/CD, IaC, Auto Scaling — became possible.

Academically, NIST SP 800-145 (2011) codified this as the five essential characteristics of cloud computing: (1) on-demand self-service, (2) broad network access, (3) resource pooling, (4) rapid elasticity, (5) measured service. When you see keywords like "cost model, scalability, agility" on the DVA exam, identify which of these five aspects is being asked.

> 💡 **Related theory**: Viewed through the lens of distributed systems theory, "Infrastructure as API" leads naturally to **declarative configuration** (Kubernetes, Terraform, CloudFormation). Instead of imperatively saying "create N servers", you declaratively write "the desired end state is N servers", and the system runs a reconciliation loop to converge on that state. This pattern originates from logic programming like Prolog in the 1980s and Cisco IOS configuration in the 1990s, and Kubernetes made it the industry standard in 2014. CloudFormation, SAM, and CDK — all of which you meet in the DVA exam — are different implementations of the same philosophy.

You also need to memorize the three deployment models (Public / Private / Hybrid), but on the actual exam they almost always appear as scenarios. "Keep the on-premises SAP as-is and move only the new microservices to the cloud" — that's Hybrid. "Some data cannot leave the premises due to financial regulations" — the answer is Outposts or Hybrid.

## Regions, AZs, Edge: How a Developer Chooses an Endpoint

AWS's global infrastructure is a three-tier structure: **Region > AZ > Edge Location**. The reason this structure matters to developers is that it determines where a single line of an SDK call goes.

```python
import boto3

# Explicit region specification — determines the endpoint
s3 = boto3.client('s3', region_name='ap-northeast-2')

# Uses the AWS_REGION environment variable or the default region in ~/.aws/config
ddb = boto3.client('dynamodb')
```

Here, when you write `region_name='ap-northeast-2'`, the SDK sends HTTPS requests to the endpoint `s3.ap-northeast-2.amazonaws.com`. If you specify the wrong region, you either create data in a different region (cost and legal issues) or fail to find the resource at all (`NoSuchBucket` error). So when a DVA scenario asks "why is our code getting a 404?", the first suspects should be `region_name` or `endpoint_url`.

| Infrastructure tier | Count (2026) | What it means to a developer |
|-----------|------|-----------|
| **Region** | 34 | The unit that determines data location, pricing, and endpoint URL |
| **Availability Zone** | 3+ per region | Where EC2/Lambda actually run, the fail-over unit for Multi-AZ DBs |
| **Edge Location** | 600+ | CloudFront cache, Lambda@Edge execution points |
| **Local Zones** | 30+ | 1-2ms ultra-low latency. Media, gaming, real-time ML inference |
| **Wavelength** | Carrier 5G edge | Autonomous driving, industrial IoT |
| **Outposts** | AWS racks in customer DCs | Satisfies data sovereignty + AWS APIs simultaneously |

> 🔍 **Going deeper**: AWS service endpoints come in three main kinds. **Regional endpoints** (e.g., `dynamodb.ap-northeast-2.amazonaws.com`) are the most common form, routed to different infrastructure per region. **Global endpoints** (e.g., `iam.amazonaws.com`, `s3.amazonaws.com`) reach global services without a region. **FIPS endpoints** (e.g., `dynamodb-fips.us-east-1.amazonaws.com`) use FIPS 140-2 validated cryptographic modules and are intended for US government and financial customers. You can switch to them automatically with the SDK environment variable `AWS_USE_FIPS_ENDPOINT=true`.

After the us-east-1 EBS outage in April 2011, AWS established the principle that every new region is built with at least 3 AZs. Before then, an AZ was more or less a different rack within the same facility, but this incident forced the definition of an AZ as "**a group of one or more DCs with physically independent power, cooling, and networking**". Inter-AZ latency is usually within 1-2ms, which makes synchronous replication like RDS Multi-AZ possible, but AZs are kept far enough apart (several km to tens of km) that a fire or power outage cannot spread between them.

> 📚 **Case study**: The S3 us-east-1 outage of February 28, 2017. An operator made a typo in a billing debugging command and took down more servers than intended, sending the index subsystem into a full restart. Stripe, Slack, Trello, IFTTT, Coursera, and Quora were down for 4 hours, and since the AWS Status Page itself depended on S3, the absurd situation of "there's an outage but the status board shows green" unfolded. AWS subsequently split the Status Page across multiple regions. [AWS official post-mortem](https://aws.amazon.com/message/41926/). The lesson for developers is clear: **a system that depends on a single region dies together with any service in that region.**

## Where Is an AZ, Really: The Difference Between ZoneName and ZoneId

This comes up often on the exam and is a common trap in practice too. Given two AWS accounts at the same company, `ap-northeast-2a` in account A and `ap-northeast-2a` in account B are **physically different AZs**. AWS deliberately shuffles the mapping per account to prevent load concentration from "everyone creating things in a first".

```bash
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId]' \
  --output table

# Output:
# ap-northeast-2a   apne2-az1
# ap-northeast-2b   apne2-az2
# ap-northeast-2c   apne2-az3
# ap-northeast-2d   apne2-az4
```

The `ZoneId` (`apne2-az1`) points to the same physical AZ across all accounts. If you want to save cross-AZ data transfer costs when connecting to a partner via VPC peering or PrivateLink, you must match by `ZoneId`. If you pair a-to-a based on ZoneName alone, it is often actually cross-AZ.

> ⚠️ **Trap**: When you create your VPC subnet in `ap-northeast-2a`, it is easy to assume that putting the partner's PrivateLink in the same "a" automatically lands in the same physical AZ. Wrong. PrivateLink's endpoint network interfaces are assigned an AZ per ENI, and if the two accounts' AZ mappings differ, the traffic flows cross-AZ and incurs an additional $0.01 per GB. Similar costs arise after an RDS Multi-AZ failover if the client sits in a different AZ.

## Edge Locations Are Not Just Caches

Edge locations perform four different jobs across 600+ PoPs (Points of Presence): **CloudFront** (HTTP/HTTPS caching and TLS termination), **Route 53** (authoritative DNS responses), **Global Accelerator** (TCP/UDP Anycast acceleration), and **AWS WAF/Shield** (edge DDoS filtering). What developers must know is the difference between CloudFront and Global Accelerator.

| Dimension | CloudFront | Global Accelerator |
|------|-----------|---------------------|
| OSI layer | L7 (HTTP/HTTPS) | L4 (TCP/UDP) |
| Caching | Yes | No |
| Anycast IP | No (DNS based) | Yes (2 static IPs) |
| Suitable workloads | Static and dynamic web content | Gaming, MQTT, VoIP, WebRTC |
| Failover time | Minutes (DNS TTL) | Seconds (BGP rerouting) |

> 💡 **Related theory**: The two static IPs provided by Global Accelerator are based on **BGP Anycast**. When the same IP is advertised via BGP from multiple edges, the client's ISP routes to the nearest edge according to the BGP best-path algorithm (RFC 4271) using factors like AS_PATH length and local preference. DNS changes propagate on the order of minutes because of the client resolver's TTL cache, but BGP propagates within seconds via KEEPALIVE/UPDATE messages between routers. This is the mechanism by which Global Accelerator guarantees "failover in seconds".

CloudFront Functions and Lambda@Edge are also frequently confused. **CloudFront Functions** run directly at 600+ edges with cold starts under 100μs, but are limited to 2MB memory and 1ms execution time. They only support JavaScript ES5.1 and cannot make external API calls. Simple viewer request header modification and A/B test routing are about the extent of what they can do. **Lambda@Edge** runs at 13 Regional Edge Caches with access to the full Node.js and Python runtimes, but cold starts are in the tens of milliseconds. If you need DynamoDB lookups or external API calls, you must go with Lambda@Edge.

## The Shared Responsibility Model: How Far a Developer Is Responsible for Their Own Code

The most common misconception among developers new to the cloud is "AWS will take care of security too, right?" In reality, there is a clear division: **AWS = Security OF the Cloud / Customer = Security IN the Cloud**. More importantly, **the responsibility boundary moves up and down depending on the abstraction level of the service you choose**.

```
Managed ↑                                     AWS responsibility ↑
  ┌─────────────────────────────┐
  │ S3 / DynamoDB / Lambda      │  ← Customer only owns data classification, IAM permissions
  │ RDS / ECS Fargate           │  ← + Customer owns network/SG configuration
  │ ECS on EC2 / EKS Self       │  ← + Customer owns container runtime, node OS patching
  │ EC2 + EBS (IaaS)            │  ← Customer owns OS, middleware, and the entire app
  └─────────────────────────────┘
Managed ↓                                     Customer responsibility ↑
```

Even for the same "DB query", with RDS the engine patching, backups, and OS are AWS's responsibility, while query writing, index design, and SG configuration are the customer's. If you install MySQL directly on EC2, OS patching also falls down to the customer. With Lambda, even runtime security patching is AWS's responsibility, and the customer only needs to worry about code vulnerabilities and IAM permissions. Memorize the principle that **as the abstraction level goes up, the responsibility boundary moves up** and half of the exam questions solve themselves.

> 📚 **Case study**: The Capital One data breach of July 2019. The perpetrator was former AWS employee Paige Thompson, but the cause was not AWS infrastructure — it was **an SSRF vulnerability in the WAF operated by Capital One plus IAM role exposure via EC2 IMDSv1**. The attacker used SSRF to access `http://169.254.169.254/latest/meta-data/iam/security-credentials/`, stole temporary credentials, and used them to read the card application data of 106 million people from S3 buckets. As a direct consequence, AWS released **IMDSv2** (session-token based) in November 2019. [DOJ indictment](https://www.justice.gov/usao-edva/press-release/file/1188626/download).

> 🔍 **Going deeper**: IMDSv2 operates in two steps. (1) A `PUT /latest/api/token` request with the `X-aws-ec2-metadata-token-ttl-seconds` header obtains a session token. (2) Metadata requests present the token via the `X-aws-ec2-metadata-token` header. SSRF attackers can usually only issue HTTP GETs, so they cannot send the PUT and cannot obtain a token. IMDSv2 also forces the IP TTL to 1 (or hop limit 1), so it cannot escape outside the container network. When creating an EC2 instance, setting `MetadataOptions.HttpTokens=required` forcibly disables IMDSv1.

> 💡 **Related theory**: The shared responsibility model dovetails precisely with NIST SP 800-145's service models (IaaS / PaaS / SaaS). Of the NIST CSF's five functions (Identify, Protect, Detect, Respond, Recover), Identify and Protect remain almost entirely in the customer's domain. AWS provides tools on top like GuardDuty, Inspector, and Macie, but turning them on and setting policies is the customer's job. ISO 27017 (cloud security) and ISO 27018 (cloud privacy) also codify responsibility areas on top of the same model.

## The 4 Domains the DVA Exam Asks About

Unlike SAA, DVA-C02 puts its weight on **security, deployment, and troubleshooting from the developer's perspective**.

| Domain | Weight | Key keywords |
|--------|------|------|
| Development | 32% | Lambda, API Gateway, DynamoDB, SDK, SAM |
| Security | 26% | IAM, KMS, Cognito, Secrets Manager |
| Deployment | 24% | CodePipeline, CodeBuild, CodeDeploy, Beanstalk, CloudFormation |
| Troubleshooting | 18% | CloudWatch, X-Ray, CloudTrail |

If SAA asks "how do you design it", DVA asks "**how do you build, deploy, and debug it in code**". For example, given the scenario "Lambda is slow due to cold starts", "provision a warming pool" suffices for SAA, but DVA requires answering down to code and option names: "attach Provisioned Concurrency to an alias, and on changes, shift traffic with CodeDeploy Canary 10Percent5Minutes".

## Poking Around Directly with the CLI

```bash
# 1) All currently available regions
aws ec2 describe-regions --output table

# 2) AZs in the Seoul region — view ZoneName and ZoneId together
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State,ZoneType]' \
  --output table

# 3) Which account/user/role the current credentials map to
aws sts get-caller-identity
```

`get-caller-identity` is the starting point of debugging. When you wonder "why does it say I don't have permission?", it should be the first thing you type. Looking at the ARN tells you at a glance whether you are an IAM user, which role you assumed, and which account you are in.

## Wrapping Up

There are two pictures we saw today. First, AWS operates on a three-tier **Region > AZ > Edge** infrastructure, and for developers this structure directly determines where the SDK sends its requests. Second, on top of that, the responsibility for security and operations is divided — **AWS from the concrete floor up to the hypervisor, the customer above that** — and the boundary moves up and down depending on which service you choose.

In the next article, we look at the four core entities of IAM — User, Group, Role, Policy — which decide "who is allowed to do what" on top of this foundation. Recalling that the direct cause of the Capital One incident was IAM configuration, the reason developers must deeply understand IAM comes naturally.

---

## 📝 연습 문제

**문제 1.** When a boto3 client is created with `s3 = boto3.client('s3')`, how is the region determined?

A) It is always fixed to us-east-1
B) It searches the `AWS_REGION` environment variable → `AWS_DEFAULT_REGION` → the default profile in `~/.aws/config`, in that order
C) The nearest region is automatically selected
D) S3 is a global service, so the region is irrelevant

**정답: B**
해설: If no region is specified, boto3 searches environment variables and configuration files according to a priority order. The exact order is: (1) `region_name` in the client constructor, (2) the `AWS_REGION` environment variable, (3) the `AWS_DEFAULT_REGION` environment variable, (4) the `region` value of the active profile in `~/.aws/config`. If none of these yield a region, it raises `NoRegionError`. S3 bucket names live in a global namespace, but the data is stored in a specific region, so a region specification is required (exceptionally, the `s3.amazonaws.com` global endpoint also exists, but since 2020 region-aware endpoints have been recommended).

---

**문제 2.** A company is using IAM roles on EC2 instances via IMDSv1. The security team has demanded that IMDSv2 be enforced to defend against SSRF attacks. What is the most accurate action?

A) Remove the IAM role
B) Set the instance metadata options to `HttpTokens=required`
C) Move the instance to a different region
D) Block 169.254.169.254 in the Security Group

**정답: B**
해설: Setting `MetadataOptions.HttpTokens=required` rejects any request that has not obtained a token via PUT. Since SSRF attackers can typically only issue GETs, metadata access is blocked. A would prevent the application from using IAM permissions, C is unrelated to the IMDSv1 problem, and D fails because 169.254.169.254 is a link-local address and cannot be controlled by SGs (SGs operate only on ENIs). Additionally, setting `HttpPutResponseHopLimit=1` can also block metadata access from container networks.

---

**문제 3.** How is the AZ in which a Lambda function runs determined?

A) The developer specifies the AZ in the function definition
B) AWS automatically selects among available AZs and the developer has no control
C) A Lambda attached to a VPC runs in the AZs of the specified subnets, while a non-VPC Lambda is distributed internally by AWS
D) It always runs in the first AZ of the region

**정답: C**
해설: Lambda has no option to directly specify an AZ at function creation. A Lambda unrelated to any VPC (the default) is automatically distributed across the AWS-managed multi-AZ Lambda environment. A Lambda attached to a VPC (via `VpcConfig`) runs in the AZs of the subnets where its ENIs were created, so **you must specify subnets in multiple AZs to survive a single-AZ failure**. If you specify only a single-AZ subnet, Lambda invocations fail when that AZ goes down. Before 2019, VPC Lambda cold starts took 10+ seconds due to ENI creation, but with the introduction of Hyperplane ENIs in September 2019, the ENI is created only on the first invocation and reused thereafter.

---

**문제 4.** Between Global Accelerator and CloudFront, which fits the following scenario? "We must provide an MQTT-based IoT messaging service to users worldwide."

A) CloudFront (suitable for accelerating all global traffic)
B) Global Accelerator (TCP/UDP acceleration; MQTT is TCP-based)
C) Route 53 Geolocation (geography-based distribution)
D) Direct Connect (dedicated lines for all users)

**정답: B**
해설: CloudFront is centered on HTTP/HTTPS L7 caching, so it cannot handle MQTT (TCP 1883/8883). Route 53 Geolocation only branches DNS responses without accelerating the traffic itself, and failover takes minutes due to DNS TTL. Direct Connect is a dedicated line between a specific site and AWS, so it doesn't fit global user distribution. Global Accelerator pulls traffic to the nearest edge via BGP Anycast and forwards it over the AWS backbone, guaranteeing consistent latency for both TCP and UDP. Since two static IPs are guaranteed, it is also well suited for hardcoding IPs into IoT device firmware.

---

**문제 5.** A developer created an S3 bucket in us-east-1, but SDK calls from ap-northeast-2 have latency exceeding 200ms. What is the most appropriate improvement?

A) Move the S3 bucket from us-east-1 to ap-northeast-2 (impossible)
B) Create another bucket with the same name in ap-northeast-2 (impossible; globally unique)
C) Create a replica in ap-northeast-2 with S3 Cross-Region Replication and have clients access the bucket in the nearer region
D) Enable S3 Transfer Acceleration, which automatically selects the nearest region

**정답: C**
해설: An S3 bucket's region is fixed at creation and cannot be moved, and names are globally unique so the same name cannot be created in another region. You can create a differently named replica with CRR (Cross-Region Replication), or use **Multi-Region Access Points** (launched December 2020) to have a single global endpoint automatically route to the nearest regional bucket. D's S3 Transfer Acceleration routes through CloudFront edges onto the backbone, so latency improves, but it is not "automatic region selection". It also adds $0.04 per GB on uploads.

---

**문제 6.** Which of the following is NOT in the "customer responsibility" area?

A) SQL injection vulnerabilities in Lambda function code
B) MySQL engine security patches on an RDS instance
C) S3 bucket policy configuration
D) Guest OS patching on EC2

**정답: B**
해설: RDS is PaaS, so patching the DB engine is AWS's responsibility. However, the customer can choose when patches are applied via the maintenance window. A is a code vulnerability, always the customer's responsibility. C is IAM/resource policy, always the customer's responsibility. D: since EC2 is IaaS, OS patching is the customer's responsibility (conversely, if you move the same workload to ECS Fargate, even container host OS patching shifts to AWS). Memorize this pattern as "the higher the abstraction level, the higher the responsibility boundary moves" and you can solve all the variations on the exam.

---

**문제 7.** You are connecting PrivateLink to a partner via VPC peering. Both accounts placed subnets in `ap-northeast-2a`, yet traffic flows cross-AZ. What is the cause and the fix?

A) It is an AWS bug and you should open a support ticket
B) `ZoneName` maps to different physical AZs per account, so you must compare and match using `ZoneId` (`apne2-az1`, etc.)
C) VPC peering always operates cross-AZ
D) The regions must be made the same (they already are)

**정답: B**
해설: AWS deliberately shuffles the AZ mapping per account to prevent load concentration from "everyone creating in a first". Account A's `ap-northeast-2a` (`apne2-az1`) and account B's `ap-northeast-2a` (`apne2-az3`) are physically different AZs. Check the ZoneId with `aws ec2 describe-availability-zones` and place subnets in the same ZoneId to land in the same physical AZ. Cross-AZ data transfer costs $0.01 per GB ($0.02 round-trip) and accumulates quickly with high-volume traffic, so recognizing this trap matters in practice.
