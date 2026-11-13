# Day 4 - The Anatomy of Hidden Costs - S3 Storage Tiers, Data Transfer Pricing Structure, and the NAT Gateway Trap

There is a part engineers almost always get wrong when estimating cloud costs. They predict "compute" costs like EC2 and RDS well, but the costs of **data transfer** flowing between them and of **storage tiers** are invisible, so they get left out. Yet when you open the real bill, it is common for a single NAT Gateway to cost more than RDS, or for Cross-AZ traffic to take up 20% of the total. This "hidden cost" is exactly the area SAP-C02 asks about relentlessly: anyone can optimize compute, but designing the cost of data flow is the architect's job.

Today we take apart the three branches where cost leaks, namely the economics of S3 storage tiers, the directional structure of AWS network pricing, and the double billing of the NAT Gateway, down to their internal principles, and sort out the savings patterns and anti-patterns for each.

## S3 Storage Tiers - A Trade Between Access Frequency and Cost

The core of S3 cost is a structure that trades storage unit price against retrieval cost depending on "how often and how fast you pull data out." Keeping rarely used data in Standard is waste, and keeping frequently used data in Glacier lets retrieval cost eat the storage savings.

| Class | Minimum storage | Retrieval cost | Availability model | Suited for |
|--------|----------|-----------|-------------|------|
| Standard | - | None | Multi-AZ | Frequent access |
| **Intelligent-Tiering** | - | None (monitoring fee) | Multi-AZ | Unknown pattern |
| Standard-IA | 30 days | Per GB | Multi-AZ | A few times a month |
| One Zone-IA | 30 days | Per GB | **Single AZ** | Regenerable data |
| Glacier Instant Retrieval | 90 days | Per GB (instant) | Multi-AZ | Once a quarter, needed instantly |
| Glacier Flexible Retrieval | 90 days | Per GB (minutes to hours) | Multi-AZ | Once a year, waiting OK |
| Glacier Deep Archive | 180 days | Per GB (12+ hours) | Multi-AZ | Long-term regulatory retention |

The most important trap is the **minimum storage duration**. If you put an object in Standard-IA and delete it after 10 days, you pay for 30 days of storage (an early deletion charge). So moving short-lived, frequently changing data to IA is actually a loss.

This structure is exactly the same principle as the **memory hierarchy** in computer architecture. Like CPU cache (fast and expensive) → RAM → SSD → tape (slow and cheap), S3 also forms a hierarchy of Standard (fast and expensive) → IA → Glacier (slow and cheap). In both cases "locality of reference" is the key: data you'll use again soon goes in the fast tier, data you'll rarely use goes in the slow tier. The cache miss penalty of the memory hierarchy shows up in S3 as retrieval cost and latency. Intelligent-Tiering is, in effect, the software version of a "hardware cache controller" that automates this tier movement.

The **economics of Intelligent-Tiering** have a subtle break-even point. A per-object monthly monitoring fee applies (about $0.0025 per 1,000 objects), and **objects under 128KB are not eligible for automatic tier movement** (they are also exempt from the monitoring fee but get no IA savings). So applying Intelligent-Tiering to hundreds of millions of small objects (for example, thumbnails, log fragments) can let the monitoring fee offset the storage savings. Conversely, for large objects with erratic access patterns (media files, etc.) it is almost always a gain. On the exam, "unknown pattern + large objects" is Intelligent-Tiering, but "a huge number of small objects" may be a trap.

> ⚠️ **Pitfall**: One Zone-IA stores in a single AZ, so if that AZ is lost the data is gone. "Put all backups in One Zone-IA to cut cost" is an anti-pattern: you must not put non-regenerable originals in One Zone. Use One Zone-IA only for "copies that can be regenerated because the original is elsewhere" (for example, a cache of a replica from another Region, or intermediate transcoding outputs).

## Lifecycle and Storage Lens - Automating Tier Movement and Visibility

You can't move objects manually. A **Lifecycle policy** automatically runs "N days after creation → IA, M days → Glacier, K days → expire." One item people often forget here is **Incomplete Multipart Upload Cleanup**. When a multipart upload fails midway, partial chunks keep being stored and cost accumulates invisibly. Putting a "clean up incomplete multipart uploads after 7 days" rule in Lifecycle is standard.

**S3 Storage Lens** analyzes storage patterns at the bucket and prefix level across the organization to identify "unused, duplicate, small objects, and non-optimal classes." CUR looks at cost, and Storage Lens looks at storage efficiency.

## Data Transfer Pricing - Direction and Boundaries Set the Price

The first principle of AWS network pricing: **incoming (ingress) is mostly free, outgoing (egress) is charged**. The second principle: **the more boundaries you cross, the more expensive**: within the same AZ (free) < same Region, different AZ < Cross-Region < internet.

| Path | Price |
|------|------|
| Within the same AZ (private IP) | Free |
| Same Region, different AZ | Charged in both directions (per GB, on both the sending and receiving side) |
| VPC ↔ S3/DynamoDB (Gateway Endpoint) | **Free** |
| VPC Peering (same AZ) | Free |
| VPC Peering (different AZ) | Cross-AZ price |
| Egress to the internet | Charged (most expensive, tapering after the first tier) |
| Cross-Region | Charged |

The asymmetry of "egress is charged, ingress is free" is not just a pricing policy but ties into the **economics of cloud lock-in**. If putting data into the cloud is free but pulling it out is expensive, it becomes advantageous for data to stay in the cloud (data is pulled into the cloud like gravity and stays: "data gravity"). When regulators viewed this egress cost as a lock-in tool and raised concerns, in 2024 AWS introduced a policy of "free data transfer out to the internet when leaving AWS entirely." In the exam context, "egress is charged during normal operation" is still the key.

The point that **Cross-AZ traffic is billed in both directions** is the one most often missed. When you send 1GB to a different AZ in the same Region, a per-GB charge applies on both the sending and receiving sides (typically about $0.02/GB combined). Multi-AZ RDS synchronous replication, traffic from an ALB to targets in another AZ, and distributed caches (for example, Cross-AZ Redis replication) generate surprisingly large costs. To reduce this, place things so they communicate within the same AZ whenever possible (while considering, for example, the Cross-Zone Load Balancing trade-off of an ALB), but you must weigh availability against cost: cramming everything into one AZ makes you vulnerable to an AZ failure, so the answer depends on the workload's availability requirements.

## NAT Gateway - The Champion of the Most Common Hidden Cost

A NAT Gateway is used when resources in a private subnet communicate outbound to the internet. The problem is **double billing**: an hourly charge (billed just for running) plus a throughput charge (per GB) apply together.

- Hourly: about $0.045/hour → about $32 a month (x the number of AZs if one per AZ)
- Throughput: about $0.045/GB

The key insight is that **"routing even traffic bound for AWS services through NAT is pure waste."** If a Lambda in a private subnet uploads 100GB to S3 through NAT, the throughput charge applies, but S3 is an AWS internal service, so there is no reason to go through NAT.

```
[Private subnet]
   ├─▶ [S3 Gateway Endpoint]      Free    ← dedicated to S3 and DynamoDB
   ├─▶ [DynamoDB Gateway Endpoint] Free
   ├─▶ [Interface Endpoint: KMS, SQS, SNS, ECR, Logs...] Hourly + data (usually cheaper than NAT)
   └─▶ [NAT Gateway] → Internet    Double billing   ← only for truly external communication
```

The difference between a **Gateway Endpoint and an Interface Endpoint** is that the internal behavior differs. A Gateway Endpoint (S3 and DynamoDB only) works by **adding a prefix list to the route table**: packets are routed directly over the AWS backbone instead of through NAT/IGW. It has no additional infrastructure, so it is **completely free**. An Interface Endpoint (most other services) works by **planting an ENI (PrivateLink) in the subnet**: each ENI carries an hourly charge + a data processing charge, but for large traffic it is usually cheaper than NAT's throughput charge. On the exam, for "S3/DynamoDB" the answer is Gateway (free), and for "other AWS services" it is Interface.

(Hypothetical example) A SaaS company's ECS Tasks upload 100GB of data to S3 every day, and all traffic went through a NAT Gateway. The NAT throughput charge alone came to about $4,500 a month. After tracing the cause and adding an **S3 Gateway Endpoint**, S3 traffic bypassed NAT and went straight over the AWS backbone, and that cost fell to **$0**: one routing line saved about $54,000 a year. Lesson: when the volume of AWS service calls (especially S3 and DynamoDB) from private subnets is large, before suspecting NAT, first checking whether a Gateway Endpoint exists is FinOps check number 1.

## Transfer Cost Reduction Patterns - CloudFront and Direct Connect

When sending large amounts of content out to the internet, **CloudFront** is key. Traffic from S3 to CloudFront (origin fetch) is free, egress from CloudFront to users has a lower unit price than direct S3 egress, and caching reduces origin calls themselves. For large, sustained transfers with on-premises, **Direct Connect** is cheaper and more stable than internet egress.

> 🎯 **Scenario**: "Serve static assets from S3 to users worldwide while minimizing transfer cost." → **CloudFront + S3**. S3 → CloudFront origin fetch is free, CloudFront cache hits reduce both S3 calls and egress, and responding from an edge near the user also reduces latency. Exposing S3 directly has a high egress unit price and no caching, so it is disadvantageous in both cost and latency. Global Accelerator is for static IPs and TCP/UDP acceleration, not a tool for caching static content or cutting cost.

## Trade-off Comparison Table: 6 Outbound Paths from a Private Subnet

For the single requirement "must get out from a private subnet," there are six paths. Each has a different pricing structure and constraints, so when the qualifier changes, the answer changes.

| Path | Fixed charge | Traffic charge | Availability | Usable from on-premises | Constraints |
|------|-----------|-------------|--------|---------------------|------|
| **NAT Gateway** | Hourly (per AZ) | Per-GB processing | Managed redundancy within an AZ | — | Double billing, must be placed per AZ |
| **NAT Instance (EC2)** | Instance cost | **No processing charge** | You must configure it yourself | — | Bandwidth tied to instance type, self-operated |
| **Gateway Endpoint** (S3, DynamoDB) | **None** | **None** | Routing-based, no management needed | **Not possible** | S3/DynamoDB only, inside the VPC only |
| **Interface Endpoint** (PrivateLink) | Hourly (per ENI/AZ) | Per-GB processing | ENI placed per AZ | **Possible** (via DX/VPN) | Separate endpoint per service |
| **Egress-only IGW** (IPv6 only) | **None** | Data transfer charges only | Managed | — | IPv6 outbound only |
| **Centralized egress** (TGW + NAT) | TGW attachment + NAT hourly | TGW processing + NAT processing (**stacked**) | High | Possible | Charges apply twice |

> ⚠️ **Pitfall**: The cell in the table that most often appears on the exam is **"a Gateway Endpoint can't be used from on-premises."** A Gateway Endpoint works by putting a prefix list in the VPC route table, so on-premises traffic coming in over Direct Connect or VPN can't use that routing. So when the requirement "access S3 over a private path from on-premises" appears, the answer is not the free Gateway Endpoint but an **Interface Endpoint for S3**. Someone who memorized "S3 means Gateway, always" gets it wrong exactly here.

NAT Instances are still considered in small environments for the reason of "no processing charge." But the trade-offs are clear. (1) The instance type determines the bandwidth ceiling, so growing traffic needs vertical scaling, (2) you have to turn off the source/destination check, and (3) there is no automatic replacement on failure, so you must build Auto Scaling and a routing switchover script yourself. That is, **you buy savings on processing charges at the price of operational burden**. On the exam, when "LEAST operational overhead" is attached, the NAT Instance is wrong, and it is a candidate only when conditions overlap such as "MOST cost-effective + very large traffic + staff available to operate."

## Architecture Diagram: A Structure That Gathers Egress in a Multi-Account Environment

Once there are dozens of accounts, the "NAT Gateway per AZ in every VPC" structure becomes the main cost culprit. 20 VPCs x 3 AZs = the hourly charge of 60 NATs goes out as a fixed cost regardless of traffic. So the centralized egress pattern appears.

```
 ┌──────────────────────────────────────────────────────────────┐
 │  Network account (Infrastructure OU)                          │
 │                                                              │
 │   ┌────────────────── Egress VPC ────────────────────┐       │
 │   │  AZ-a: NAT GW ──┐                                │       │
 │   │  AZ-b: NAT GW ──┼──► Internet Gateway ──► Internet│       │
 │   │  AZ-c: NAT GW ──┘                                │       │
 │   │                                                  │       │
 │   │  ┌── Central Interface Endpoints (PrivateLink) ─┐ │       │
 │   │  │   KMS · SQS · SNS · ECR · Logs · SSM         │ │       │
 │   │  │   + shared Route 53 Private Hosted Zone      │ │       │
 │   │  └───────────────────────────────────────────┘    │       │
 │   └──────────────────────┬───────────────────────────┘       │
 │                          │                                   │
 │                  ┌───────▼────────┐                          │
 │                  │ Transit Gateway│  (shared to other accounts via RAM) │
 │                  └───┬────────┬───┘                          │
 └──────────────────────┼────────┼──────────────────────────────┘
                        │        │
      ┌─────────────────▼──┐  ┌──▼──────────────────┐
      │ Workload account A  │  │ Workload account B   │
      │  Spoke VPC          │  │  Spoke VPC           │
      │  ┌───────────────┐  │  │  ┌───────────────┐  │
      │  │ S3 Gateway EP │  │  │  │ S3 Gateway EP │  │  ◄── Free, each VPC
      │  │ (free, a must)│  │  │  │ (free, a must)│  │      must have its own
      │  └───────────────┘  │  │  └───────────────┘  │
      │  Default route → TGW│  │  Default route → TGW│
      └─────────────────────┘  └─────────────────────┘

  ▼ Points where charges apply (watch for stacking)
  Spoke → TGW            : TGW attachment hourly + processing per GB
  TGW → Egress VPC       : (inside the same TGW)
  Egress VPC NAT → Internet : NAT hourly + NAT processing per GB + internet egress
  Note: S3 and DynamoDB traffic must never be put on this path.
     Place a free Gateway Endpoint in each Spoke VPC so it bypasses both TGW and NAT.
```

Centralized egress is **not unconditionally cheaper**. A per-GB processing charge applies to all traffic passing through TGW, and the NAT processing charge applies on top of that. So the traffic unit price actually goes up. The point where this pattern pays off is on the **fixed charge side**: the hourly charge of 20 VPCs x 3 AZs = 60 NATs shrinks to 3 NATs. So the decision criterion is clear. **If there are many VPCs and each VPC has little traffic, centralization is advantageous; if there are few VPCs and very large traffic, distributed NAT is advantageous.** On top of this comes the non-cost benefit that "centralization lets you do security inspection (firewall, IDS) in one place," so in regulated environments it is adopted even while accepting the traffic charges.

The most expensive mistake when building the centralized structure is **forgetting the S3 Gateway Endpoint in each Spoke VPC**. A Gateway Endpoint is a per-VPC resource, so it must be created in each account and VPC and can't be shared. If you miss it, S3 traffic goes through TGW (processing charge) and then NAT (processing charge) on its way out, so traffic that should have cost 0 gets charged twice.

## The Order for Reducing NAT and Transfer Costs Step by Step

Cost reduction is not a matter of "what should we turn off" but "what should we look at first." Start with what has the lowest risk relative to its effect.

```
Step 1  Measure - first pin down where it leaks
   ├── Query CUR with Athena to isolate only the NAT throughput and data transfer line items
   ├── Aggregate top destination IPs and ports passing the NAT ENI with VPC Flow Logs
   └── Rationale: a NAT bill tells you only "how much," not "where to."
             Without Flow Logs you can't pinpoint the savings target.

Step 2  Add Gateway Endpoints (zero risk, immediate effect)
   ├── Check that every VPC has S3 and DynamoDB Gateway Endpoints
   ├── Applied just by adding to the route table, no application changes
   └── Rationale: free, easy to revert, and the biggest effect. Always priority 1.

Step 3  Introduce Interface Endpoints selectively (only for high-traffic services)
   ├── Start with the AWS services that ranked at the top in Step 1's aggregation
   ├── ECR, CloudWatch Logs, SSM, and KMS are common top items
   └── Rationale: Interface Endpoints have an hourly ENI charge. Creating them
             for every low-traffic service is actually a loss. Calculate the break-even before adding.

Step 4  Adjust architecture placement (minimize Cross-AZ)
   ├── Place things to communicate within the same AZ, weighing against availability needs
   ├── Review individually options that carry charges, like NLB's cross-zone setting
   └── Rationale: from here on there is a trade-off with availability.
             Cramming into one AZ for cost alone leaves you fully exposed to an AZ failure.

Step 5  Large structural changes (centralized egress, introducing CloudFront)
   ├── If there are many VPCs/accounts, consider TGW-based centralized egress
   ├── Put large content going out to the internet behind CloudFront
   └── Rationale: big effect, but it changes the network structure so the risk is high.
             Start only after capturing all the savings available from Steps 1-4.
```

**"Measure → free (Gateway EP) → selective paid (Interface EP) → placement → structure."** The order is the order of effect relative to risk. On the exam, when a requirement like "reduce cost immediately with minimal change" appears, the Gateway Endpoint corresponding to Step 2 is the answer candidate.

## Real Artifacts: Lifecycle Policy and Endpoint Policy

### S3 Lifecycle - Tier Movement and Incomplete Multipart Cleanup in One Policy

```json
{
  "Rules": [
    {
      "ID": "logs-tiering-and-expiry",
      "Filter": { "Prefix": "logs/" },
      "Status": "Enabled",
      "Transitions": [
        { "Days": 30,  "StorageClass": "STANDARD_IA" },
        { "Days": 90,  "StorageClass": "GLACIER_IR" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    },
    {
      "ID": "cleanup-old-versions",
      "Filter": { "Prefix": "" },
      "Status": "Enabled",
      "NoncurrentVersionTransitions": [
        { "NoncurrentDays": 30, "StorageClass": "GLACIER_IR" }
      ],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 180 }
    }
  ]
}
```

It is extremely common for a bucket to lack the second rule's **noncurrent version cleanup**. With Versioning on, old versions of overwritten or deleted objects remain as they are and keep being billed. They don't appear in the console's object list, so it shows up as the phenomenon of "the object count stays the same but storage cost keeps rising." If you turn on Versioning, a noncurrent version expiration rule must go in as a set.

**The Lifecycle transition itself carries a request charge** (billed per 1,000 transitions). So moving hundreds of millions of small objects to IA can let the transition request charge exceed the storage savings. On top of that comes the **minimum billable object size of 128KB** rule for Standard-IA and One Zone-IA: even if you put a 10KB object in IA, it is billed as 128KB. The conclusion is one: **small objects should be merged, not moved down a tier.** The standard approach is to compress and merge log fragments into large objects and then move them down a tier, and the basis for this judgment comes from S3 Storage Lens's average object size metric.

### Creating VPC Endpoints and the Endpoint Policy

```bash
# Create an S3 Gateway Endpoint - attach it to route tables (free)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc123 \
  --vpc-endpoint-type Gateway \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b rtb-private-c \
  --policy-document file://s3-endpoint-policy.json

# Create an Interface Endpoint for ECR - plants ENIs in the subnets (hourly + per GB)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc123 \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.ap-northeast-2.ecr.dkr \
  --subnet-ids subnet-a subnet-b subnet-c \
  --security-group-ids sg-endpoint \
  --private-dns-enabled

# Which endpoints exist in the current VPC (savings check item 1)
aws ec2 describe-vpc-endpoints \
  --filters Name=vpc-id,Values=vpc-0abc123 \
  --query 'VpcEndpoints[].{Type:VpcEndpointType,Service:ServiceName}' \
  --output table
```

```json
// s3-endpoint-policy.json - through this endpoint only our organization's buckets are accessible
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowOwnOrgBucketsOnly",
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
    "Resource": "*",
    "Condition": {
      "StringEquals": { "aws:ResourceOrgID": "o-exampleorgid" }
    }
  }]
}
```

An endpoint policy shows its real value not in cost but in **blocking data exfiltration**. If you attach a policy like the one above to a Gateway Endpoint, even if a compromised instance tries to copy internal data to an attacker-owned external S3 bucket, that request is denied at the endpoint. Close the internet path by blocking NAT, then put an organization condition on the only remaining S3 path, the endpoint, and the exfiltration path disappears structurally. It is a rare design where both sides win: a Gateway Endpoint introduced for cost optimization also serves as a security control point.

## When the Qualifier Changes, the Answer Changes

For the single situation "a private subnet workload accesses S3," we change only the qualifier and condition.

| Condition/qualifier | Answer direction | Why |
|--------------|-----------|-----|
| **MOST cost-effective, only from inside the VPC** | **S3 Gateway Endpoint** | Completely free. No hourly charge, no per-GB charge |
| **Private access from on-premises via DX** | **S3 Interface Endpoint** | Gateway Endpoints don't apply to on-premises traffic |
| **LEAST operational overhead** | Gateway Endpoint | One routing entry. No ENIs or SGs to manage |
| **Must also block data exfiltration** | Gateway Endpoint + **endpoint policy** | Narrow the path, then put conditions on that path |
| **Large-scale distribution to global users + lower cost** | **CloudFront + S3** | Free origin fetch + cache reduces origin calls and egress at once |
| **Workloads in another Region read frequently** | Consider CRR or **CloudFront** | Replicating or caching once can be cheaper than repeated Cross-Region transfer |
| **Publicly sharing a large dataset externally** | **Requester Pays** | Shifts download egress cost to the requester |

**"Inside the VPC means Gateway, on-premises means Interface, internet means CloudFront."** Just find where the source is in the prompt and the three branches split immediately.

> 🎯 **Scenario**: "Workloads in several accounts each make heavy calls to CloudWatch Logs and ECR. NAT processing charges have spiked. What is the MOST cost-effective improvement?" Answer: **introduce Interface Endpoints only for the services with the highest call volume**, and if there are many accounts and VPCs, put central Interface Endpoints in the Network account and share them with Private Hosted Zones. The option "create Interface Endpoints for every AWS service" is the trap here: the hourly ENI charge is multiplied by the number of AZs, making low-traffic services more expensive than NAT. In a question with a cost qualifier, **"all of them" is on the wrong side**.

## Wrapping Up

The 3 major axes of hidden cost are **S3 storage tiers (access frequency vs retrieval cost), data transfer (direction and boundaries), and the NAT Gateway (double billing)**. For S3, like a memory hierarchy, put frequently used data in the fast tier and rare data in the slow tier while respecting minimum storage durations, and automate unknown patterns and large objects with Intelligent-Tiering. For data transfer, the same AZ is free, Cross-AZ is billed in both directions, and internet egress is the most expensive; bypass the NAT Gateway with S3/DynamoDB Gateway Endpoints (free) and Interface Endpoints, and cut internet distribution cost with CloudFront.

SAP exam mapping: (1) "unknown pattern + automatic optimization + large objects" → **Intelligent-Tiering**, (2) "private Lambda → S3 cost 0" → **S3 Gateway Endpoint**, (3) "private access to other AWS services" → **Interface Endpoint (PrivateLink)**, (4) "global static content + lower cost" → **CloudFront + S3**, (5) "low-cost storage of regenerable copies" → **One Zone-IA**, (6) "accumulating incomplete multipart cost" → **Lifecycle Cleanup rule**, (7) "non-regenerable backups in One Zone" → anti-pattern (wrong). The next day is a comprehensive review of all of Week 12 cost optimization.

---

## 📝 Practice Questions

**Question 1.** You store large media objects whose access patterns are completely unpredictable and want cost optimized automatically. What is the best storage class?

A) Standard-IA

B) S3 Intelligent-Tiering

C) Glacier Deep Archive

D) One Zone-IA

**Answer: B**
Explanation: Intelligent-Tiering monitors each object's access pattern and moves it automatically to the appropriate tier (Frequent → Infrequent → Archive) with no retrieval cost (only a monitoring fee). It fits "unknown pattern + large objects" exactly. A suits cases where the pattern is clearly "a few times a month," and a wrong fit incurs retrieval costs. C is for long-term retention that is rarely pulled and is unsuitable for instant access. D is single-AZ so availability is low. Trap: "unknown pattern + automatic" is Intelligent-Tiering, but with a huge number of small (under 128KB) objects, the monitoring fee can be a loss.

---

**Question 2.** A Lambda in a private subnet uploads large amounts of data to S3 every day, and the NAT Gateway throughput charge is excessive. How do you reduce the cost to nearly 0?

A) Add a NAT Gateway in each AZ

B) Add an S3 Gateway Endpoint to the VPC so S3 traffic bypasses NAT

C) Connect directly through the Internet Gateway

D) Add an S3 Interface Endpoint

**Answer: B**
Explanation: An S3 Gateway Endpoint adds a prefix list to the route table to route S3 traffic directly over the AWS backbone instead of NAT/IGW, and it is completely free. The NAT throughput charge disappears. A increases cost further. C breaks the private subnet security model and doesn't solve the cost problem. D is possible, but for S3 and DynamoDB the free Gateway Endpoint is more suitable (Interface has hourly + data charges). Trap: S3/DynamoDB use the free Gateway Endpoint, and other services use Interface Endpoints.

---

**Question 3.** You want to store intermediate outputs generated during transcoding (regenerable from the original at any time) as cheaply as possible. What is the best class?

A) S3 Standard

B) One Zone-IA

C) Glacier Deep Archive

D) Standard-IA (multi-AZ)

**Answer: B**
Explanation: One Zone-IA stores in a single AZ and is about 20% cheaper than multi-AZ IA, and if the data can be regenerated from the original even if the AZ is lost, that risk is acceptable. A is for frequent access and is expensive. C makes instant access hard (intermediate outputs may be reused soon). D is multi-AZ so it costs more and is excessive durability for regenerable data. Trap: putting a non-regenerable original in One Zone-IA is an anti-pattern, and it suits only regenerable copies.

---

**Question 4.** You want to serve static web assets stored in S3 to users worldwide while minimizing both data transfer cost and latency. What is the best fit?

A) Make the S3 bucket public and serve directly

B) Place CloudFront in front of the S3 origin

C) S3 Transfer Acceleration

D) Global Accelerator + S3

**Answer: B**
Explanation: CloudFront has free S3 origin fetch, edge cache hits reduce both origin calls and egress, and responding from an edge near the user also lowers latency. A has a high egress unit price and no caching, so it is disadvantageous in both cost and latency. C is for upload acceleration. D (Global Accelerator) is for static IPs and TCP/UDP acceleration, not a tool for caching static content or cutting cost. Trap: global static content + lower cost is CloudFront.

---

**Question 5.** You run multi-AZ RDS and a distributed cache, and data transfer cost is larger than expected. Analyzing with CUR shows Cross-AZ traffic is the cause. Which statement about this cost is correct?

A) Only the receiving side is charged

B) Communication between different AZs in the same Region is charged per GB on both the sending and receiving sides

C) Communication within the same Region is always free

D) Cross-AZ is more expensive than internet egress

**Answer: B**
Explanation: Communication between different AZs in the same Region is billed in both directions, with a per-GB charge on both the sending and receiving sides. Multi-AZ synchronous replication and Cross-AZ cache replication generate surprisingly large costs. A is wrong (both directions). C is wrong (only inside the same AZ is free; Cross-AZ is charged). D is wrong (internet egress is generally more expensive). Trap: the fact that Cross-AZ is billed in both directions is often missed.

---

**Question 6.** The cost of an S3 bucket keeps growing inexplicably. Investigation shows partial chunks left by failed multipart uploads are accumulating. What is the best fix?

A) Delete manually with a CLI script every day

B) Add an Incomplete Multipart Upload Cleanup rule (for example, clean up after 7 days) to Lifecycle

C) Create a new bucket and migrate the data

D) Only set up an alert with Storage Lens

**Answer: B**
Explanation: Lifecycle's Incomplete Multipart Upload Cleanup rule automatically deletes incomplete multipart uploads after the specified number of days to stop accumulating cost. A is manual, repetitive work with a high risk of omission. C doesn't fix the root cause. D gives only visibility and doesn't clean up. Trap: accumulating incomplete multipart uploads is automated with a Lifecycle Cleanup rule.

---

**Question 7.** A workload in a private subnet calls several AWS services such as KMS, SQS, and CloudWatch Logs, and all traffic goes through the NAT Gateway, producing large throughput charges. How do you reduce the NAT cost for these services, which are not S3 or DynamoDB?

A) Add an S3 Gateway Endpoint

B) Add an Interface Endpoint (PrivateLink) for each service

C) Add more NAT Gateways

D) Connect directly through an Internet Gateway

**Answer: B**
Explanation: Most AWS services other than S3 and DynamoDB (KMS, SQS, SNS, ECR, Logs, etc.) are accessed privately through Interface Endpoints (PrivateLink), bypassing NAT via ENIs. They have hourly + data charges, but for large traffic they are usually cheaper than NAT's throughput charge. A (Gateway Endpoint) is dedicated to S3 and DynamoDB, so it can't be used for these services. C increases cost. D breaks the private model. Trap: S3/DynamoDB = Gateway (free), everything else = Interface.
