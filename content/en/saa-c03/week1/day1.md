# Day 1 - The Map of AWS Infrastructure: Regions, AZs, and the Promise Called Shared Responsibility

When you first open the AWS console, there's a region selector like "Seoul" pinned in the top-right corner, and some services say "Global" while others only work after you pick a region. If you've ever gotten stuck wondering what the difference is, that's exactly the first question a solutions architect has to answer.

In this article we'll draw the physical map of how AWS's global infrastructure is layered, and then sort out where "AWS's responsibility" and "my responsibility" split on top of it. The goal is not memorizing keywords for the exam, but truly understanding why our service survived (or didn't) when us-east-1 went down at 3 AM. Once that understanding accumulates, exam questions follow naturally.

## A Region Is Not Just a "Location" — It's a Cluster of Data Centers

If you understand an AWS Region only as "the name of a city with data centers," you're seeing half the picture. Each region is **an isolated infrastructure unit composed of 3 or more Availability Zones (AZs)**, and each AZ in turn consists of 1 or more physical data centers (DCs). In other words, `ap-northeast-2` (Seoul) is not a single building but a network of dozens of data centers distributed across 4 AZs.

Why was it designed this way? When S3 first launched in 2006, AWS started with a single region (Northern Virginia, later named `us-east-1`). Back then even the concept of a "region" was vague, and an AZ was just a different rack inside the same facility. Then on April 21, 2011, an EBS network failure occurred in us-east-1, taking down Reddit, Quora, and Foursquare for several days. That incident forced the concept of "physical isolation" onto AWS, and every region since has been built on the principle of **at least 3 AZs with independent power, cooling, and networking**.

| Component | Count (as of 2025) | Design Meaning |
|-----------|------|-----------|
| **Region** | 34 | The unit that determines data sovereignty / pricing / service availability |
| **Availability Zone (AZ)** | 3+ per region | Physical isolation. The minimum unit of HA design |
| **Edge Location** | 600+ | CloudFront / Route 53 / Global Accelerator |
| **Local Zones** | 30+ | Ultra-low latency within 1-2ms (gaming, media, ML inference) |
| **Wavelength Zone** | Telecom 5G edge | For mobile 5G devices |
| **Outposts** | Customer data centers | On-premises regulation / hybrid |

> 📚 **Case study**: On February 28, 2017, at 9:37 AM Pacific time, an operator in S3 us-east-1 made a typo in a command while debugging the billing system, taking far more servers offline at once than intended. As a result, the index subsystem went into a full restart, and for 4 hours Stripe, Slack, Trello, IFTTT, Coursera, Quora, and others went down. The AWS Status Page itself depended on S3, so we even ended up in a situation where "there's an outage right now, but the status page shows green." An incident that showed how single-region dependence can shake half the internet. [AWS official post-mortem](https://aws.amazon.com/message/41926/).

## The Real Meaning of Availability Zones: The Boundary of Isolation and Synchronous Replication

If you simply understand an AZ as "one data center," you'll get exam questions wrong and cause major incidents in practice. An AZ is **a physically independent set of 1 or more DCs**, and even the DCs within the same AZ use separate power and cooling. AZs are connected by dedicated low-latency fiber averaging 60μs ~ 2ms, close enough for synchronous replication, yet far enough apart (usually several km to tens of km) that a fire or power outage in one AZ doesn't spread to another.

> 🔍 **Going deeper**: The fact that inter-AZ latency is typically 1-2ms is the core constraint of RDS Multi-AZ design. RDS Multi-AZ performs **synchronous physical replication** between Primary and Standby. That is, for a client to receive a commit, the Primary must wait until it gets a write ack from the Standby. With an inter-AZ RTT of 1-2ms, the additional latency per transaction ends there, but if you tried synchronous replication between regions (e.g., Seoul ↔ Tokyo, RTT ~35ms), OLTP workloads would become practically impossible. This is why "inter-region replication is asynchronous (e.g., Aurora Global Database, RDS Cross-Region Read Replica)" is the default.

> 💡 **Related theory**: This trade-off is directly tied to the CAP theorem of distributed systems (Brewer, 2000 PODC keynote; formalized by Gilbert & Lynch, 2002 SIGACT News). Multi-AZ is an explicit trade-off of "choosing CP (Consistency + Partition tolerance) within the same region, but AP (Availability + Partition tolerance) between regions." This is why Aurora Global Database promises ~1 second RPO between regions while imposing the constraint that "writes happen only in the primary region." Also, viewed through the PACELC theorem (Abadi, 2012), AWS is closer to a PA/EL system that "gives up some consistency for latency even when there is no network partition."

```
                    [ AWS Global Infrastructure ]
                              |
        +---------------------+---------------------+
        |                     |                     |
   [Region: ap-northeast-2 (Seoul)]            [Region: us-east-1]
        |
   +----+----+----+----+
   |    |    |    |
  AZ-a AZ-b AZ-c AZ-d
   |    |    |    |
  DCs  DCs  DCs  DCs  ← each AZ is 1 or more physical DCs
                       ← each DC has independent power & networking
   Synchronous replication possible (1-2ms RTT)
```

Comparing with other clouds' isolation models makes AWS's design philosophy clearer.

| Dimension | AWS | GCP | Azure |
|------|-----|-----|-------|
| Geographic location | Region | Region | Geography |
| Isolation unit | **Availability Zone** (3+ per region) | **Zone** (usually 3 per region) | **Availability Zone** (only some regions guarantee 3) |
| Wide-area group | (none) | (none) | Region Pair (automatic pairing) |
| AZ naming | Per-account mapping (`ap-northeast-2a` ≠ the neighboring account's `ap-northeast-2a`) | Same for all accounts (`us-central1-a`) | Numeric mapping in some regions (`1`, `2`, `3`) |
| Single-DC API | (limited) Outposts, Local Zones | (none) | Availability Set (rack-level isolation) |

The reason AWS maps AZs to different physical AZs per account is **traffic distribution**. If every customer decided to "create in zone a first," the load would concentrate on a, so AWS deliberately shuffles per account. Therefore, to place resources in the same AZ across two accounts, you must compare `ZoneId` (e.g., `apne2-az1`), not `ZoneName`.

> ⚠️ **Pitfall**: The answer choice "an AZ is exactly one data center" appears frequently on the exam. It's wrong. An AZ is a logical isolation unit grouping 1 or more DCs. Another frequent trap is ZoneName vs ZoneId. When designing cross-company VPC peering or PrivateLink, matching by AZ name alone commonly lands you in a different physical AZ, causing cost and latency spikes.

> 📚 **Case study**: On August 23, 2019, in one AZ of the AWS Tokyo region (`ap-northeast-1`), a bug in the cooling system control software caused some servers to overheat, affecting EC2 and EBS. The lessons from this incident were twofold. First, **Single-AZ deployments take down RDS and EBS at the same time** (because the storage is tied to one AZ). Second, **AZ distribution in an Auto Scaling Group is your insurance**. At the time, workloads configured multi-AZ in an ASG survived, while everything pinned to a single AZ went down.

## Edge Locations: Beyond Content Caching

Edge locations are not merely CDN cache points. Through more than 600 edge PoPs (Points of Presence), AWS does 4 different things.

1. **CloudFront**: HTTP/HTTPS static and dynamic content caching. TLS termination happens here too.
2. **Route 53**: Authoritative responses for global DNS handled at the edge.
3. **Global Accelerator**: Pulls TCP/UDP traffic into the nearest edge and forwards it over the AWS backbone. Provides 2 Anycast IPs.
4. **AWS WAF / Shield**: Filters DDoS and malicious traffic at the edge.

CloudFront and Global Accelerator are frequently confused, but they fundamentally operate at different layers. CloudFront is **OSI L7 (understands HTTP semantics and caches)**, Global Accelerator is **OSI L4 (accelerates the TCP/UDP packets themselves)**. So whenever you see non-HTTP traffic like game servers, MQTT, VoIP, or WebRTC signaling, it's almost always Global Accelerator.

> 🔍 **Going deeper**: CloudFront Functions and Lambda@Edge both run at the edge, but in different places. **CloudFront Functions** execute directly at the 600+ edge PoPs and respond with sub-100μs cold starts, but have constraints of 2MB memory and 1ms execution time. **Lambda@Edge** runs at 13 Regional Edge Caches and can use the full Node.js/Python runtimes, but cold starts are on the order of tens of ms. The difference between the two illustrates the trade-off of "how heavy a workload you can run at the edge."

> 💡 **Related theory**: The static Anycast IPs provided by Global Accelerator are based on BGP Anycast. When the same IP is advertised from multiple edges, the client's ISP routes to the nearest edge according to BGP's best-path algorithm (AS_PATH length, local preference, etc.). Thanks to this structure, **traffic can be rerouted within seconds** without waiting for DNS TTLs. This contrasts with Route 53-based failover, which takes minutes due to DNS cache TTLs.

## Special Infrastructure: The Real Purposes of Outposts, Local Zones, and Wavelength

Distinguishing these three by keyword is fast for the exam, but if you understand why they exist, you'll never confuse them.

**Outposts** is a service that places actual AWS hardware racks in the customer's data center. Why is it needed? Korea's financial sector must keep some data in domestic in-house facilities under Article 14 of the Electronic Financial Supervision Regulation, and Europe gained constraints on using US clouds after the GDPR Schrems II ruling (EU court, 2020). In such regulatory environments you want "data inside our building" while still "operating via AWS APIs." The answer is Outposts.

**Local Zones** are mini-regions connected to the same backbone as a large region but geographically placed close to major cities. They exist in cities like LA, Miami, and Las Vegas, and offer only basic services like EC2, EBS, and ECS. They were built for workloads where **users immediately notice when latency exceeds 10ms**, such as film post-production (VFX), cloud game streaming, and AR/VR.

**Wavelength** is edge data centers inside the 5G networks of telecom carriers (Verizon, KDDI, Vodafone, SK Telecom, etc.). Since traffic reaches compute resources straight from the base station without traversing the 5G core network, it's used for applications that "interact directly with the physical world," such as autonomous vehicle perception processing and industrial IoT.

> 💡 **Memory tip**: Inside HQ = O(utposts), city = L(ocal Zones), 5G = W(avelength). But on the exam, look at the scenario's "latency requirement" and "data location constraint" together, rather than the keyword alone.

## The Shared Responsibility Model: The Contract Between AWS and the Customer

The most common misconception among cloud newcomers is "Doesn't AWS take care of security for us too?" In reality there is a clear division: **AWS = Security OF the Cloud / Customer = Security IN the Cloud**. From the concrete floor up to the hypervisor is AWS; everything above is the customer's responsibility — that's nearly exact.

Let's first see why this model is needed. In traditional on-premises, everything was the customer's responsibility (servers, network, OS, apps — all of it). In SaaS, nearly everything is the vendor's responsibility (if Gmail goes down, it's Google's fault). The cloud sits in between, and **the responsibility boundary shifts depending on which service you use**. With EC2 (IaaS), everything from the OS up is the customer; with RDS (PaaS), AWS handles up through DB engine patching; with fully managed services like Lambda or S3, AWS's responsibility extends even higher.

```
Managed ↑                                      AWS responsibility ↑
  ┌─────────────────────────────┐
  │ S3 / DynamoDB / Lambda      │  ← only data classification & permissions are the customer's
  │ RDS / ECS Fargate           │  ← + network/firewall settings are the customer's
  │ ECS on EC2 / EKS Self       │  ← + container runtime, node OS patching are the customer's
  │ EC2 + EBS (IaaS)            │  ← OS, middleware, apps — all the customer's
  └─────────────────────────────┘
Managed ↓                                      Customer responsibility ↑
```

| Responsibility Area | AWS | Customer |
|-----------|-----|------|
| Physical facilities / hardware | ✅ | - |
| Hypervisor / host OS | ✅ | - |
| Guest OS patching (EC2) | - | ✅ |
| Managed service OS / engine patching (RDS/Lambda) | ✅ | - |
| Network traffic protection (SG / NACL) | - | ✅ |
| Data classification / encryption key policies | - | ✅ |
| IAM users / permissions / policies | - | ✅ |
| Inter-AZ traffic encryption (infrastructure) | ✅ | - |
| Application code vulnerabilities | - | ✅ |

> 📚 **Case study**: In July 2019, Capital One suffered a breach exposing the card application data of 106 million people. The perpetrator was former AWS employee Paige Thompson, but the cause wasn't AWS itself — it was **an SSRF vulnerability in the WAF Capital One operated + IAM role exposure via the EC2 Instance Metadata Service (IMDSv1)**. The attacker used SSRF to access `http://169.254.169.254/latest/meta-data/iam/security-credentials/`, stole temporary credentials, and read S3 buckets with them. AWS fulfilled its infrastructure responsibility, but the incident occurred in the "customer responsibility area" (WAF configuration, the IAM role's permission scope, IMDSv1 usage). [DOJ indictment PDF](https://www.justice.gov/usao-edva/press-release/file/1188626/download). As a direct consequence of this incident, AWS released **IMDSv2** (session-token based) in November 2019.

> 🔍 **Going deeper**: IMDSv2 works in two steps. ① Send a `PUT /latest/api/token` request with the `X-aws-ec2-metadata-token-ttl-seconds` header to receive a session token. ② Present the token via the `X-aws-ec2-metadata-token` header on metadata requests. Since SSRF attackers can typically only issue HTTP GETs, they can't send the PUT, can't obtain a token, and consequently metadata access is blocked. At the same time, IMDSv2 requests enforce an IP TTL of 1 (or hop limit 1), so access is only possible from within the instance and can't escape outside the container network.

> 💡 **Related theory**: The shared responsibility model dovetails precisely with the cloud service model classification (IaaS / PaaS / SaaS) in NIST SP 800-145. Among the 5 functions of the NIST CSF (Cybersecurity Framework) — Identify, Protect, Detect, Respond, Recover — Identify and Protect remain almost entirely in the customer's domain. AWS provides tools on top (GuardDuty, Inspector, Macie, etc.), but turning them on and setting the policies is the customer's job. ISO 27017 (cloud security) and ISO 27018 (cloud privacy) also codify responsibility areas on top of this model.

## The Well-Architected Framework: Not Just a Checklist

AWS has distilled good cloud design into 6 pillars. It began as an internal best-practices document in 2012, was published externally in 2015, and became 6 pillars when Sustainability was added in 2021.

1. **Operational Excellence** — IaC, automation, change management, observability
2. **Security** — least privilege, security at every layer, data protection, incident response
3. **Reliability** — self-healing, Multi-AZ, distribution, backup & DR
4. **Performance Efficiency** — right-sizing, going global, serverless, data patterns
5. **Cost Optimization** — the right pricing model, removing unused resources, measurable costs
6. **Sustainability** — minimizing carbon footprint, region selection, efficient workloads

This almost exactly matches the SAA exam's domain weighting (design resilience 26%, high performance 24%, security 30%, cost optimization 20%). So for scenario questions, rather than "which answer is right," first figure out "**which Pillar is this scenario asking about**" and the answer reveals itself. For example, a scenario like "an analytics job used only at night" is asking about Cost Optimization, and the answer lies toward Spot or Scheduled Scaling. If "the service must stay up even when one AZ dies," it's asking about Reliability and the answer is a Multi-AZ + ASG + ELB combination.

> 💡 **Memory tip**: Take the initials — **O-S-R-P-C-S**. But rather than rote memorization, practicing the mapping "**scenario keyword → Pillar → solution pattern**" matters more.

## Checking It Yourself with the CLI — The Fastest Way to Make It Stick

Memorizing by words alone fades. Typing it out even once in the CLI makes a difference.

```bash
# 1) List all available regions
aws ec2 describe-regions --output table

# 2) AZ information for the Seoul region — view ZoneName and ZoneId together
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State,ZoneType]' \
  --output table
```

The output looks like this.

```
+-------------------+-----------+-----------+-----------------------+
| ap-northeast-2a   | apne2-az1 | available | availability-zone     |
| ap-northeast-2b   | apne2-az2 | available | availability-zone     |
| ap-northeast-2c   | apne2-az3 | available | availability-zone     |
| ap-northeast-2d   | apne2-az4 | available | availability-zone     |
+-------------------+-----------+-----------+-----------------------+
```

`ZoneName` is shuffled per account, but `ZoneId` is identical across all accounts. So when peering VPCs with a partner and "wanting to co-locate in the same AZ to save cross-AZ costs," you must match by ZoneId. Also, if `ZoneType` shows `local-zone` or `wavelength-zone`, it means that region supports special infrastructure.

## Wrapping Up

Today we saw two pictures. First, AWS operates on a 3-tier infrastructure of **Region > AZ > Edge**, and each tier has different levels of isolation and latency characteristics. Second, on top of that infrastructure, the responsibility for security and operations splits by the promise: **AWS from the concrete floor up to the hypervisor, the customer above that**. Using managed services moves that boundary upward and shrinks customer responsibility accordingly — but "data classification and IAM permissions" never shrink.

These two pictures form the backdrop for every domain of the SAA exam. In the next article, we'll look at the 4 core IAM entities — User, Group, Role, Policy — which decide "who gets to do what" on top of this infrastructure map. Recalling that the direct cause of the Capital One incident was an IAM configuration, it should be naturally clear why this topic matters.

---

## 📝 연습 문제

**문제 1.** A company must run some workloads inside its headquarters data center but also wants to use AWS managed services. What is the most suitable solution?

A) Wavelength Zone
B) Local Zones
C) Outposts
D) Using a Region directly

**정답: C**
해설: Outposts places AWS hardware inside the customer's data center and lets you use the same APIs/services. The key signals are regulatory/sovereignty keywords like "inside headquarters" and "data cannot leave the premises." Wavelength is telecom 5G edge (not the customer's DC), Local Zones are city-level mini-regions operated by AWS (not the customer's DC), and using a Region directly sends data out to AWS facilities, failing the regulatory requirement. In practice, also evaluate whether a **Direct Connect + keeping the headquarters data center** combination might be cheaper before adopting Outposts.

---

**문제 2.** Which of the following is AWS's responsibility when operating an EC2 instance?

A) Guest OS patching
B) Security group configuration
C) Hypervisor security
D) Checking application code for vulnerabilities

**정답: C**
해설: The hypervisor and everything below it are AWS's responsibility. Guest OS patching, SG/NACL, and application code are all the customer's responsibility. The key point is that EC2 is IaaS, so OS patching also falls to the customer. If you moved the same workload to ECS Fargate, container host OS patching would shift to AWS; move it to Lambda and AWS takes responsibility up through the runtime. In other words, understand the principle "as the service abstraction level rises, the responsibility boundary moves up" and every such question becomes solvable.

---

**문제 3.** To provide the most consistent global latency for a TCP/UDP-based global game server, you should use?

A) CloudFront + Lambda@Edge
B) Global Accelerator
C) Route 53 Geolocation
D) Direct Connect

**정답: B**
해설: CloudFront is centered on HTTP/HTTPS L7 caching and can't handle non-HTTP traffic. Lambda@Edge also operates only in an HTTP context. Route 53 Geolocation merely returns different DNS answers based on the user's geographic location — **it does not accelerate the traffic itself** (and failover takes minutes due to DNS TTLs). Direct Connect is a dedicated line between a specific site and AWS, which doesn't fit a globally distributed user scenario. Global Accelerator pulls traffic into the nearest edge via BGP Anycast and forwards it over the AWS backbone, guaranteeing consistent latency for both TCP and UDP.

---

**문제 4.** Which statement about S3 is correct?

A) S3 buckets are a global service, so data is replicated globally
B) S3 bucket names are a global namespace, but data is stored in a specific region
C) S3 data is automatically replicated to all regions
D) S3 is tied to an Availability Zone

**정답: B**
해설: Because S3 bucket names resolve as DNS hostnames (`bucket-name.s3.region.amazonaws.com`), **only the name is globally unique**, and the actual data is stored in the region chosen at creation. To replicate data to another region you must separately configure **Cross-Region Replication (CRR)** or a **Multi-Region Access Point**. S3 automatically distributes data across multiple AZs within one region (the secret behind 11 9's durability), but it isn't tied to an AZ — it's abstracted within the region. Note that until 2020, S3 didn't guarantee read-after-write consistency in some scenarios, but since December 2020 it provides **strong read-after-write consistency**.

---

**문제 5.** Which of the following is NOT a pillar of the Well-Architected Framework?

A) Reliability
B) Sustainability
C) Compliance
D) Operational Excellence

**정답: C**
해설: The 6 Pillars are Operational Excellence / Security / Reliability / Performance Efficiency / Cost Optimization / Sustainability (added in 2021). Compliance is a separate governance/audit domain; in the W-AF it's only covered within the Security Pillar as data protection and audit traceability, not an independent pillar. In practice, Compliance refers to adherence to external standards like PCI-DSS, HIPAA, and SOC 2, which AWS supports with tools like Artifact, Config, and Audit Manager.

---

**문제 6.** A company runs RDS Multi-AZ in the `ap-northeast-2` region and wants to place a read-only replica in a separate region (`ap-northeast-1`). What is the main benefit of this design?

A) Recovery from a single AZ failure
B) Region-level disaster recovery (DR) + simultaneous read traffic distribution
C) IAM permission separation
D) Improved CloudFront cache efficiency

**정답: B**
해설: The key point is that the two mechanisms protect different dimensions. **Multi-AZ is HA within the same region** (synchronous replication, automatic failover with RTO of 1-2 minutes), while a **Cross-Region Read Replica provides region-level DR + global read traffic distribution** (asynchronous replication, manual promote with RTO of minutes to tens of minutes). AZ isolation (HA) and Region isolation (DR) are separate tools addressing different dimensions of risk. If you want a stricter RPO around 1 second, you should move toward Aurora Global Database. RDS Cross-Region Read Replicas generally have an RPO of seconds to tens of seconds.
