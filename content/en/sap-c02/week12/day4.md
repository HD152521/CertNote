# Day 4 - Hidden Cost Anatomy — S3 Storage Tiers, Data Transfer Fee Structure, NAT Gateway Traps

There is one area where engineers almost always get cloud cost estimates wrong. They predict "compute" costs such as EC2 and RDS well, but the costs of the **data transfer** and **storage tiers** that flow between them are invisible, so they get left out. Yet when you open the actual bill, it is common to find a single NAT Gateway costing more than RDS, or Cross-AZ traffic accounting for 20% of the total. This "hidden cost" is exactly the area SAP-C02 asks about relentlessly — anyone can optimize compute, but designing the cost of data flow is the architect's job.

Today we dissect the three channels through which cost leaks — the economics of S3 storage tiers, the directional structure of AWS network pricing, and the double charging of NAT Gateway — down to their internal principles, and organize the savings patterns and anti-patterns of each.

## S3 Storage Tiers — Trading Access Frequency Against Cost

The core of S3 cost is a structure that exchanges storage unit price against retrieval cost depending on "how often and how quickly you pull data out." Leaving rarely used data in Standard is a waste, and putting frequently used data in Glacier lets retrieval cost eat up the storage savings.

| Class | Minimum duration | Retrieval cost | Availability model | Best for |
|--------|----------|-----------|-------------|------|
| Standard | - | None | Multi-AZ | Frequent access |
| **Intelligent-Tiering** | - | None (monitoring fee) | Multi-AZ | Unknown pattern |
| Standard-IA | 30 days | Per GB | Multi-AZ | A few times a month |
| One Zone-IA | 30 days | Per GB | **Single AZ** | Reproducible data |
| Glacier Instant Retrieval | 90 days | Per GB (immediate) | Multi-AZ | Once a quarter, needed immediately |
| Glacier Flexible Retrieval | 90 days | Per GB (minutes to hours) | Multi-AZ | Once a year, waiting is OK |
| Glacier Deep Archive | 180 days | Per GB (12+ hours) | Multi-AZ | Long-term regulatory retention |

The most important trap is the **minimum storage duration**. If you put an object in Standard-IA and delete it after 10 days, you must pay for 30 days of storage (early deletion charge). So moving short-lived, frequently changing data to IA is actually a loss.

This structure follows exactly the same principle as the **memory hierarchy** in computer architecture. Just as CPU cache (fast and expensive) → RAM → SSD → tape (slow and cheap), S3 forms a hierarchy of Standard (fast and expensive) → IA → Glacier (slow and cheap). In both cases "locality of reference" is the key — data that will be used again soon goes in the fast tier, and data that will almost never be used goes in the slow tier. The cache miss penalty of the memory hierarchy appears in S3 as retrieval cost and latency. Intelligent-Tiering is, so to speak, the software version of a "hardware cache controller" that automates this tier movement.

The **economics of Intelligent-Tiering** has a subtle break-even point. A per-object monthly monitoring fee applies (about $0.0025 per 1,000 objects), and **objects under 128KB are not eligible for automatic tier movement** (they are exempt from the monitoring fee, but they also get none of the IA savings). So if you apply Intelligent-Tiering to hundreds of millions of small objects (for example, thumbnails or log fragments), the monitoring fee can cancel out the storage savings. Conversely, for large objects with erratic access patterns (such as media files) it is almost always a gain. On the exam, "unknown pattern + large objects" has Intelligent-Tiering as the answer, but "a huge number of small objects" can be a trap.

> ⚠️ **Trap**: One Zone-IA stores data in a single AZ, so if that AZ is lost the data disappears. "Put all backups in One Zone-IA to cut cost" is an anti-pattern — you must not put irreplaceable originals in One Zone. Use One Zone-IA only for "copies that can be regenerated because the original lives elsewhere" (for example, a cache of a replica in another Region, or intermediate transcoding outputs).

## Lifecycle and Storage Lens — Automation and Visibility of Tier Movement

You cannot move objects by hand. A **Lifecycle policy** automatically runs "N days after creation → IA, M days → Glacier, K days → expire." There is one item that is often forgotten here — **Incomplete Multipart Upload Cleanup**. When a multipart upload fails midway, the partial chunks keep being stored and cost accumulates invisibly. Adding a rule to Lifecycle that "cleans up incomplete multipart uploads after 7 days" is the standard.

**S3 Storage Lens** analyzes storage patterns per bucket and prefix across the organization to identify "unused, duplicated, small-object, and non-optimal-class" data. CUR looks at cost, and Storage Lens looks at storage efficiency.

## Data Transfer Pricing — Direction and Boundaries Set the Price

The first principle of AWS network pricing: **incoming traffic (ingress) is generally free, and outgoing traffic (egress) is charged**. The second principle: **the more boundaries you cross, the more expensive it gets** — within the same AZ (free) < a different AZ in the same Region < Cross-Region < the internet.

| Path | Charge |
|------|------|
| Within the same AZ (private IP) | Free |
| Same Region, different AZ | Charged in both directions (per GB, on both the sending and receiving side) |
| VPC ↔ S3/DynamoDB (Gateway Endpoint) | **Free** |
| VPC Peering (same AZ) | Free |
| VPC Peering (different AZ) | Cross-AZ charge |
| Egress to the internet | Charged (most expensive, with tiered discounts after the first tier) |
| Cross-Region | Charged |

The asymmetry of "egress is charged, ingress is free" is not just a pricing policy but is tied to the **economics of cloud lock-in**. If getting data into the cloud is free but getting it out is expensive, the longer data stays in the cloud, the better it is for the provider (data is pulled into the cloud and stays there like gravity — "data gravity"). After regulators began treating this egress cost as a lock-in tool, AWS introduced in 2024 a policy of "free egress when leaving AWS completely" (free data transfer out to the internet when leaving AWS). In the exam context, "egress is charged during normal operation" is still the key point.

The fact that **Cross-AZ traffic is charged in both directions** is the one most often missed. When you send 1GB to a different AZ in the same Region, a per-GB charge applies to both the sending side and the receiving side (typically about $0.02/GB combined). Synchronous replication of Multi-AZ RDS, traffic from an ALB to targets in other AZs, and distributed caches (for example, Cross-AZ Redis replication) create surprisingly large costs. To reduce this, place resources so they communicate within the same AZ where possible (for example, considering the trade-off of ALB's Cross-Zone Load Balancing), but you must weigh availability against cost — packing everything into the same AZ makes you vulnerable to an AZ failure, so the right answer depends on the workload's availability requirements.

## NAT Gateway — The Champion of Hidden Costs

NAT Gateway is used when resources in a private subnet communicate outbound to the internet. The problem is the **double charge** — an hourly charge (billed just for running) plus a throughput charge (per GB) are applied together.

- Hourly: about $0.045/hour → about $32 a month (multiplied by the number of AZs if you have one per AZ)
- Throughput: about $0.045/GB

The key insight is that **"if traffic to AWS services also goes through NAT, it is pure waste."** If a Lambda in a private subnet uploads 100GB to S3 through NAT, a throughput charge applies — but S3 is an AWS-internal service, so there is no reason to go through NAT.

```
[Private subnet]
   ├─▶ [S3 Gateway Endpoint]      Free    ← S3 and DynamoDB only
   ├─▶ [DynamoDB Gateway Endpoint] Free
   ├─▶ [Interface Endpoint: KMS, SQS, SNS, ECR, Logs...] Hourly + data (usually cheaper than NAT)
   └─▶ [NAT Gateway] → Internet    Double charge   ← only for truly external communication
```

The difference between **Gateway Endpoint and Interface Endpoint** is that their internal workings differ. A Gateway Endpoint (S3 and DynamoDB only) works by **adding a prefix list to the route table** — packets are routed directly over the AWS backbone instead of through NAT/IGW. There is no additional infrastructure, so it is **completely free**. An Interface Endpoint (most of the other services) works by **planting an ENI (PrivateLink) in the subnet** — each ENI carries an hourly charge plus a processed-data charge, but for heavy traffic it is usually cheaper than NAT's throughput charge. On the exam, "S3/DynamoDB" means Gateway (free), and "any other AWS service" means Interface is the answer.

(Hypothetical case) A SaaS company had ECS Tasks uploading 100GB of data to S3 every day, and all of the traffic went through the NAT Gateway. The NAT throughput charge alone came to about $4,500 a month. After tracing the cause and adding an **S3 Gateway Endpoint**, the S3 traffic bypassed NAT and went directly over the AWS backbone, and that cost dropped to **$0** — about $54,000 a year saved by adding a single route. Lesson: when a private subnet makes heavy calls to AWS services (especially S3 and DynamoDB), before suspecting NAT itself, checking whether a Gateway Endpoint exists is the number 1 FinOps check.

## Transfer Cost Reduction Patterns — CloudFront and Direct Connect

When sending large volumes of content out to the internet, **CloudFront** is the key. Traffic from S3 to CloudFront (origin fetch) is free, egress from CloudFront to users has a lower unit price than direct S3 egress, and caching reduces the origin calls themselves. For large, sustained transfers with on-premises, **Direct Connect** is cheaper and more stable than internet egress.

> 🎯 **Scenario**: "Serve static assets in S3 to users around the world while minimizing transfer cost." → **CloudFront + S3**. The S3 → CloudFront origin fetch is free, CloudFront cache hits reduce both S3 calls and egress, and responding from an edge close to the user also reduces latency. Exposing S3 directly has a higher egress unit price and no caching, so it is worse on both cost and latency. Global Accelerator is for static IPs and TCP/UDP acceleration, not a tool for caching static content or reducing cost.

## Trade-off Comparison Table: Six Outbound Paths from a Private Subnet

There is one requirement — "a private subnet must reach outside" — and six paths for it. Each has a different pricing structure and constraints, so when the qualifier changes, the answer changes too.

| Path | Fixed charge | Traffic charge | Availability | Usable from on-premises | Constraints |
|------|-----------|-------------|--------|---------------------|------|
| **NAT Gateway** | Hourly (per AZ) | Per-GB processing | Managed redundancy within an AZ | — | Double charge, must be placed in each AZ |
| **NAT Instance (EC2)** | Instance cost | **No processing charge** | Must be configured yourself | — | Bandwidth tied to the instance type, self-operated |
| **Gateway Endpoint** (S3, DynamoDB) | **None** | **None** | Routing-based, no management needed | **Not possible** | S3 and DynamoDB only, within the VPC only |
| **Interface Endpoint** (PrivateLink) | Hourly (per ENI/AZ) | Per-GB processing | An ENI placed in each AZ | **Possible** (via DX/VPN) | A separate endpoint per service |
| **Egress-only IGW** (IPv6 only) | **None** | Data transfer charge only | Managed | — | IPv6 outbound only |
| **Centralized egress** (TGW + NAT) | TGW attachment + NAT hourly | TGW processing + NAT processing (**stacked**) | High | Possible | Charges apply twice |

> ⚠️ **Trap**: The cell in this table that most often appears on the exam is **"Gateway Endpoint is not usable from on-premises."** Because a Gateway Endpoint works by putting a prefix list into the VPC route table, on-premises traffic arriving over Direct Connect or VPN cannot use that routing. So when the requirement is "access S3 over a private path from on-premises," the answer is not the free Gateway Endpoint but the **Interface Endpoint for S3**. Someone who memorized "S3 means Gateway, always" gets it wrong exactly here.

NAT Instance is still considered in small environments because it has "no processing charge." But the trade-offs are clear. (1) The instance type determines the bandwidth ceiling, so you need to scale vertically as traffic grows, (2) you must turn off the source/destination check, and (3) there is no automatic replacement on failure, so you have to build Auto Scaling or route-switching scripts yourself. In other words, **you buy the saving on processing charges with operational burden**. On the exam, when "LEAST operational overhead" is attached, NAT Instance is a wrong answer, and it becomes a candidate only when the conditions "MOST cost-effective + very large traffic + operations staff available" overlap.

## Architecture Diagram: A Structure for Pooling Egress in a Multi-Account Environment

Once there are dozens of accounts, the structure of "a NAT Gateway per AZ in every VPC" becomes the main cost culprit. 20 VPCs × 3 AZs = 60 NAT gateways whose hourly charges go out as a fixed cost regardless of traffic. That is why the centralized egress pattern appears.

```
 ┌──────────────────────────────────────────────────────────────┐
 │  Network account (Infrastructure OU)                          │
 │                                                              │
 │   ┌────────────────── Egress VPC ────────────────────┐       │
 │   │  AZ-a: NAT GW ──┐                                │       │
 │   │  AZ-b: NAT GW ──┼──► Internet Gateway ──► Internet│       │
 │   │  AZ-c: NAT GW ──┘                                │       │
 │   │                                                  │       │
 │   │  ┌── Central Interface Endpoint (PrivateLink) ┐   │       │
 │   │  │   KMS · SQS · SNS · ECR · Logs · SSM      │    │       │
 │   │  │   + Route 53 Private Hosted Zone sharing   │    │       │
 │   │  └───────────────────────────────────────────┘    │       │
 │   └──────────────────────┬───────────────────────────┘       │
 │                          │                                   │
 │                  ┌───────▼────────┐                          │
 │                  │ Transit Gateway│  (shared to other accounts via RAM)│
 │                  └───┬────────┬───┘                          │
 └──────────────────────┼────────┼──────────────────────────────┘
                        │        │
      ┌─────────────────▼──┐  ┌──▼──────────────────┐
      │ Workload account A  │  │ Workload account B   │
      │  Spoke VPC          │  │  Spoke VPC           │
      │  ┌───────────────┐  │  │  ┌───────────────┐  │
      │  │ S3 Gateway EP │  │  │  │ S3 Gateway EP │  │  ◄── Free; each VPC
      │  │ (free, required)│ │  │  │ (free, required)│ │      must have its own
      │  └───────────────┘  │  │  └───────────────┘  │
      │  Default route → TGW │  │  Default route → TGW │
      └─────────────────────┘  └─────────────────────┘

  ▼ Points where charges apply (watch for stacking)
  Spoke → TGW            : TGW attachment hourly + processing per GB
  TGW → Egress VPC       : (inside the same TGW)
  Egress VPC NAT → Internet : NAT hourly + NAT processing per GB + internet egress
  Note: S3 and DynamoDB traffic must never be sent over this path.
     Put a free Gateway Endpoint in each Spoke VPC so it bypasses both TGW and NAT.
```

Centralized egress is **not unconditionally cheaper**. A per-GB processing charge applies to all traffic passing through the TGW, and on top of it the NAT processing charge applies again. That is, the traffic unit price actually goes up. The point where this pattern pays off is on the **fixed-charge side** — the hourly charges of 20 VPCs × 3 AZs = 60 NAT gateways shrink to 3 NAT gateways. So the decision criterion is clear. **If there are many VPCs and each VPC has little traffic, centralization is advantageous; if there are few VPCs and the traffic is very large, distributed NAT is advantageous.** On top of this comes the non-cost benefit that "centralization lets you perform security inspection (firewall, IDS) in one place," so in regulated environments it is adopted even at the price of the traffic charges.

The most expensive mistake when building a centralized structure is **forgetting the S3 Gateway Endpoint in each Spoke VPC**. A Gateway Endpoint is a per-VPC resource, so it must be created separately for each account and VPC and cannot be shared. If you miss it, S3 traffic goes out over the TGW (processing charge) and through NAT (processing charge), so traffic that should have cost nothing is charged twice.

## The Order for Reducing NAT and Transfer Costs Step by Step

Cost reduction is not a question of "what should we turn off" but of "what should we look at first." Go from what has the lowest risk relative to its effect.

```
Step 1  Measure — first pin down where it is leaking
   ├── Query CUR with Athena to isolate only the NAT throughput and data transfer line items
   ├── Aggregate the top destination IPs and ports passing through the NAT ENI with VPC Flow Logs
   └── Rationale: The NAT bill tells you only "how much," not "to where."
             Without Flow Logs you cannot identify what to cut.

Step 2  Add Gateway Endpoints (zero risk, immediate effect)
   ├── Check that every VPC has S3 and DynamoDB Gateway Endpoints
   ├── Applied just by adding to the route table, no application change
   └── Rationale: It is free, easy to roll back, and has the biggest effect. Always priority 1.

Step 3  Selectively introduce Interface Endpoints (only high-traffic services)
   ├── Start with the AWS services that ranked at the top in the Step 1 aggregation
   ├── ECR, CloudWatch Logs, SSM, and KMS are common top items
   └── Rationale: An Interface Endpoint has an hourly ENI charge. Creating them
             even for low-traffic services is actually a loss. Calculate the break-even before adding.

Step 4  Adjust architecture placement (minimize Cross-AZ)
   ├── Place resources to communicate within the same AZ, weighed against availability requirements
   ├── Review options that carry charges individually, such as the NLB cross-zone setting
   └── Rationale: From here on there is a trade-off with availability.
             Packing everything into one AZ for cost alone leaves you exposed to an AZ failure.

Step 5  Large structural changes (centralized egress, adopting CloudFront)
   ├── If there are many VPCs and accounts, consider TGW-based centralized egress
   ├── Put high-volume content going out to the internet behind CloudFront
   └── Rationale: The effect is large, but it changes the network structure, so the risk is high.
             Start only after capturing all the savings available from Steps 1-4.
```

**"Measure → free (Gateway EP) → selective paid (Interface EP) → placement → structure."** The order is the order of effect relative to risk. On the exam, when a requirement like "reduce cost immediately with minimal change" appears, the Gateway Endpoint corresponding to Step 2 is the answer candidate.

## In Practice: Lifecycle Policy and Endpoint Policy

### S3 Lifecycle — Tier Movement and Incomplete Multipart Cleanup in One Policy

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

It is extremely common to find buckets missing the **noncurrent version cleanup** in the second rule. When Versioning is on, the old versions of overwritten or deleted objects remain and keep being billed. They do not appear in the console's object list, so it shows up as a phenomenon where "the object count stays the same but only the storage cost keeps rising." If you turn on Versioning, add the noncurrent version expiration rule as a set.

**A request charge applies to the Lifecycle transition itself** (charged per 1,000 transitions). So when you move hundreds of millions of small objects to IA, the transition request charges can exceed the storage savings. On top of this comes the **minimum billable object size of 128KB** rule for Standard-IA and One Zone-IA — even if you put a 10KB object in IA, it is billed as 128KB. The conclusion is one: **small objects should not be moved down a tier but merged.** The standard approach is to compress and merge log fragments into large objects and then move them down a tier, and the basis for this judgment comes from the average object size metric in S3 Storage Lens.

### Creating a VPC Endpoint and the Endpoint Policy

```bash
# Create an S3 Gateway Endpoint — attach it to route tables (free)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0abc123 \
  --vpc-endpoint-type Gateway \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b rtb-private-c \
  --policy-document file://s3-endpoint-policy.json

# Create an Interface Endpoint for ECR — plants ENIs in the subnets (hourly + per GB)
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
// s3-endpoint-policy.json — through this endpoint, only our organization's buckets are accessible
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

The endpoint policy shows its true value not in cost but in **blocking data exfiltration**. If you attach a policy like the one above to a Gateway Endpoint, even if a compromised instance tries to copy internal data to an attacker-owned external S3 bucket, that request is denied at the endpoint. By blocking NAT you close the internet path, and by putting an organization condition on the one remaining S3 path, the endpoint, the exfiltration path structurally disappears. It is a rare design where both sides benefit: a Gateway Endpoint introduced for cost optimization also serves as a security control point.

## When the Qualifier Changes, the Answer Changes

Take the single situation "a private subnet workload accesses S3" and change only the qualifiers and conditions.

| Condition / qualifier | Answer direction | Why |
|--------------|-----------|-----|
| **MOST cost-effective, within the VPC only** | **S3 Gateway Endpoint** | Completely free. No hourly or per-GB charge |
| **Private access from on-premises via DX** | **S3 Interface Endpoint** | A Gateway Endpoint does not apply to on-premises traffic |
| **LEAST operational overhead** | Gateway Endpoint | One route entry. No ENI or SG to manage |
| **Must also block data exfiltration** | Gateway Endpoint + **endpoint policy** | Narrow the path, then put a condition on that path |
| **Mass distribution to global users + lower cost** | **CloudFront + S3** | Free origin fetch + cache reduces origin calls and egress at the same time |
| **A workload in another Region reads frequently** | Consider CRR or **CloudFront** | One replication or cache can be cheaper than repeated Cross-Region transfer |
| **Publicly sharing a large dataset externally** | **Requester Pays** | Shifts the download egress cost to the requester |

**"Inside the VPC, Gateway; from on-premises, Interface; from the internet, CloudFront."** Just find where the source is in the passage and the three branches split immediately.

> 🎯 **Scenario**: "Workloads in multiple accounts each make heavy calls to CloudWatch Logs and ECR. NAT processing charges have surged. What is the MOST cost-effective improvement?" — Answer: **introduce Interface Endpoints only for the services with the highest call volume**, and if there are many accounts and VPCs, put central Interface Endpoints in the Network account and share them with a Private Hosted Zone. Here, the option "create Interface Endpoints for all AWS services" is the trap — the hourly ENI charge is multiplied by the number of AZs, so for low-traffic services it becomes more expensive than NAT. In a question with a cost qualifier, **"all of them" leans toward the wrong answer**.

## Wrap-Up

The three major axes of hidden cost are **S3 storage tiers (access frequency vs retrieval cost), data transfer (direction and boundaries), and NAT Gateway (double charging)**. Like a memory hierarchy, put frequently used data in the fast tier and rarely used data in the slow tier while respecting the minimum storage duration, and automate unknown-pattern, large objects with Intelligent-Tiering. For data transfer, the same AZ is free, Cross-AZ is charged in both directions, and internet egress is the most expensive; bypass NAT Gateway with S3/DynamoDB Gateway Endpoints (free) and Interface Endpoints, and cut internet distribution costs with CloudFront.

SAP exam mapping: (1) "unknown pattern + automatic optimization + large objects" → **Intelligent-Tiering**, (2) "private Lambda → S3 at zero cost" → **S3 Gateway Endpoint**, (3) "private access to other AWS services" → **Interface Endpoint (PrivateLink)**, (4) "global static content + lower cost" → **CloudFront + S3**, (5) "low-cost storage of regenerable copies" → **One Zone-IA**, (6) "accumulated cost of incomplete multipart uploads" → **Lifecycle Cleanup rule**, (7) "irreplaceable backups in One Zone" → anti-pattern (wrong answer). The next day is a comprehensive review of all of Week 12's cost optimization.

---

## 📝 Practice Questions

**Question 1.** You want to store large media objects whose access patterns are completely unpredictable while optimizing cost automatically. Which storage class is the most appropriate?

A) Standard-IA
B) S3 Intelligent-Tiering
C) Glacier Deep Archive
D) One Zone-IA

**Answer: B**

**Question 2.** A Lambda function in a private subnet uploads large amounts of data to S3 every day, and the NAT Gateway data processing charges are excessive. How can you reduce the cost to nearly zero?
A) Add a NAT Gateway in each AZ
B) Add an S3 Gateway Endpoint to the VPC so that S3 traffic bypasses the NAT
C) Connect directly through an Internet Gateway
D) Add an S3 Interface Endpoint

**Answer: B**

**Explanation:** An S3 Gateway Endpoint adds a prefix list to the route table and routes S3 traffic directly over the AWS backbone instead of through the NAT/IGW, and it is completely free. The NAT data processing charge disappears. A increases cost further. C breaks the private subnet security model and does not solve the cost problem. D is possible, but for S3 and DynamoDB the free Gateway Endpoint is more appropriate (an Interface Endpoint has hourly + data charges). Trap: S3/DynamoDB use the free Gateway Endpoint, and other services use Interface Endpoints.

---

**Question 3.** You want to store intermediate outputs generated during transcoding (which can be regenerated from the original at any time) as cheaply as possible. Which class is most appropriate?
A) S3 Standard
B) One Zone-IA
C) Glacier Deep Archive
D) Standard-IA (multi-AZ)

**Answer: B**

**Explanation:** One Zone-IA stores data in a single AZ and is about 20% cheaper than multi-AZ IA, and if the data can be regenerated from the original even when it is lost with the AZ, that risk is acceptable. A is expensive because it is for frequent access. C makes immediate access difficult (the intermediate outputs may be reused soon). D is multi-AZ and therefore more expensive, and its durability is excessive for regenerable data. Trap: putting a non-regenerable original in One Zone-IA is an anti-pattern; it is suitable only for regenerable copies.

---

**Question 4.** You want to serve static web assets stored in S3 to users around the world while minimizing both data transfer cost and latency. Which is the most appropriate?
A) Make the S3 bucket public and serve directly
B) Place CloudFront in front of the S3 origin
C) S3 Transfer Acceleration
D) Global Accelerator + S3

**Answer: B**

**Explanation:** CloudFront origin fetches from S3 are free, edge cache hits reduce both origin requests and egress, and responses from the edge closest to the user also lower latency. A has a high egress rate and no caching, so it is disadvantageous in both cost and latency. C is for accelerating uploads. D (Global Accelerator) is for static IPs and TCP/UDP acceleration and is not a tool for caching static content or reducing cost. Trap: global static content + lower cost is CloudFront.

---

**Question 5.** You operate Multi-AZ RDS and a distributed cache, and data transfer cost is higher than expected. Analysis with CUR shows that cross-AZ traffic is the cause. Which statement about this cost is correct?
A) Only the receiving side is charged
B) Communication between different AZs in the same Region is charged per GB on both the sending and receiving sides
C) Communication within the same Region is always free
D) Cross-AZ is more expensive than internet egress

**Answer: B**

**Explanation:** Communication between different AZs in the same Region is charged in both directions, with a per-GB charge applied to both the sender and the receiver. Multi-AZ synchronous replication and cross-AZ cache replication create surprisingly large costs. A is wrong (it is bidirectional). C is wrong (only traffic within the same AZ is free; cross-AZ is charged). D is wrong (internet egress is generally more expensive). Trap: the fact that cross-AZ is charged in both directions is often overlooked.

---

**Question 6.** The cost of an S3 bucket keeps increasing without explanation. Investigation shows that partial chunks left behind by multipart uploads that failed midway are accumulating. What is the most appropriate solution?
A) Delete them manually with a CLI script every day
B) Add an Incomplete Multipart Upload Cleanup rule (for example, clean up after 7 days) to the Lifecycle rules
C) Create a new bucket and migrate the data
D) Only set up alerts with Storage Lens

**Answer: B**

**Explanation:** The Lifecycle Incomplete Multipart Upload Cleanup rule automatically deletes incomplete multipart uploads after the specified number of days, preventing accumulated cost. A is manual, repetitive work with a high risk of omissions. C does not address the root cause. D only provides visibility and does not clean anything up. Trap: automate the accumulation of incomplete multipart uploads with a Lifecycle Cleanup rule.

---

**Question 7.** A workload in a private subnet calls several AWS services such as KMS, SQS, and CloudWatch Logs, and all the traffic passes through a NAT Gateway, producing large data processing charges. How can you reduce the NAT cost for these services, which are not S3 or DynamoDB?
A) Add an S3 Gateway Endpoint
B) Add an Interface Endpoint (PrivateLink) for each service
C) Add more NAT Gateways
D) Connect directly through an Internet Gateway

**Answer: B**

**Explanation:** Most AWS services other than S3 and DynamoDB (KMS, SQS, SNS, ECR, Logs, and so on) are accessed privately through Interface Endpoints (PrivateLink), which bypass the NAT through an ENI. There are hourly + data charges, but for large traffic volumes they are usually cheaper than NAT data processing charges. A (Gateway Endpoint) is only for S3 and DynamoDB and cannot be used for these services. C increases cost. D breaks the private model. Trap: S3/DynamoDB = Gateway (free), everything else = Interface.

[Remaining 4 questions preserved exactly in Korean]

---

## 📌 Today's Summary

Hidden cost trinity: S3 storage tiers (access frequency vs retrieval cost), data transfer (direction and boundary determine price), NAT Gateway (double-billing time + throughput). S3 like memory hierarchy — frequent to Standard, rare to Glacier; Intelligent-Tiering automates for unknown patterns (but monitor fee adds up for tiny objects). Data transfer: same AZ free, Cross-AZ bidirectional charge, egress highest. NAT Gateway ubiquitous trap — always check S3/DynamoDB Gateway Endpoint (free) and Interface Endpoint (PrivateLink) for AWS services before NAT.
