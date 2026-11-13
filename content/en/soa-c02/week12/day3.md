# Day 3 - Rereading Domains 5 and 6: The Packet's Road and the Bill's Road

Grouping Domain 5 (Networking and Content Delivery, 18%) with Domain 6 (Cost and Performance, 12%) isn't only because of their exam weight (30% combined). They ask the same question in different units: **where does the traffic flow (networking), and how much money does that flow convert into (cost)?** On AWS, data transfer cost always comes from "which path it took": whether it went through NAT, crossed an AZ, crossed a Region, or was cached by CloudFront. So if you don't know the network topology you can't read the bill, and if you don't know the bill you'll draw the topology wrong.

Instead of memorizing the SG/NACL table again, this article digs into which checkpoints a packet passes as it crosses a VPC, what stateful and stateless mean at the memory-structure level, why NAT and Endpoint costs split the way they do, and what game theory the commitment discount models rest on.

## The Packet's Road Through a VPC - The Order of Checkpoints Is the Order of Troubleshooting

VPC troubleshooting is hard because a packet passes **several checkpoints in order** on its way from source to destination. If any one of them blocks it, communication fails, and if you don't know which one blocked it you end up fixing the wrong place. Once you know the order of the checkpoints, troubleshooting becomes systematic.

An inbound packet coming from outside to an EC2 instance passes roughly this order:

```
Internet
  │
  ▼
[IGW] ── Internet gateway (public IP required)
  │
  ▼
[Route Table] ── Is there a route to the destination?
  │
  ▼
[NACL inbound] ── Subnet boundary, stateless, evaluated in number order
  │
  ▼
[Security Group inbound] ── Instance boundary, stateful, allow only
  │
  ▼
[EC2 instance] ── The OS firewall (iptables, etc.) is yet another separate layer
```

This order matters because it becomes the decision tree for troubleshooting. If "I can't connect to the EC2 instance," ask from the top: does it have a public IP? Is there a route in the route table? Does the NACL block that port? Does the SG allow it? If the response isn't coming back, suspect the NACL **outbound** (ephemeral port). Walking through the checkpoints in order narrows down where it is blocked.

> 💡 **Related theory**: This multi-layer inspection structure is an implementation of the network security principle of **Defense in Depth**. This concept, which comes from military strategy, says "don't rely on a single line of defense; put multiple independent layers in place." The NACL (subnet) and the SG (instance) deliberately operate at **different layers with different models**, so that if one is misconfigured the other can still block. The NACL casts a coarse net over the whole subnet (for example, blocking a specific malicious IP range), while the SG does precise per-instance allowing. If the two used the same model, defense in depth would be pointless. The differences (stateless vs stateful, deny possible vs allow only) are what make the two layers independent.

## Stateful vs Stateless - The Memory Called the Connection Tracking Table

SG = stateful and NACL = stateless are within the exam scope, but if you understand "what stateful means" at the memory level, the ephemeral port trap resolves itself.

The "state" in stateful refers to the **connection tracking table**. A Security Group remembers outgoing connections. When an EC2 instance sends a request outward, the SG records "this connection went out" in the table, and when the response comes back it consults the table and **allows it automatically**. That is why an SG only needs inbound allow rules, with no separate outbound rule for the responses. It tracks connection state.

The stateless NACL doesn't have this table. The NACL judges **each packet independently**, with no memory of what connections existed before. So the response (outbound) to a request that came in inbound must be **explicitly allowed**. And the port that response leaves from is the **ephemeral port (temporary port, usually 1024-65535)**. When a client connects to a server, it uses an arbitrary port in this range as its source port, so the server's response goes back to that ephemeral port. Because the NACL is stateless, if you don't explicitly allow this outbound ephemeral range, you get a "half-open communication" failure where requests arrive but responses can't leave.

| | Security Group | NACL |
|---|---------------|------|
| State | Stateful (connection tracking) | Stateless (per-packet independent) |
| Response handling | Automatically allowed | Must be explicitly allowed (ephemeral) |
| Rules | Allow only | Allow + Deny |
| Evaluation | All rules combined | Lowest number first, first match applies |
| Applied to | Instance (ENI) | Subnet |

> ⚠️ **Pitfall**: The ephemeral port trap that comes from the NACL's stateless nature is easy to hit both on the exam and in practice. For example, if you allow 80 (HTTP) in the NACL inbound and only allow 80 in the outbound, incoming requests pass but the server's response (going out to the client's ephemeral port 1024-65535) is blocked, and communication fails. The reverse direction works the same way. So when using a NACL you must always allow the ephemeral port range in the outbound (or inbound) as well. The SG is stateful, so it doesn't have this problem. When the exam says "the SG was configured correctly but communication broke after touching the NACL," it is almost certainly a missing ephemeral port.

## NAT Gateway and VPC Endpoint - Same "Private Internet," but the Costs Diverge

There are several ways for an instance in a private subnet to reach AWS services (S3, etc.), and that choice is the cost. If you don't know this cost structure, you won't see the NAT charge leaking away every month.

A **NAT Gateway** lets a private subnet make **outbound** connections to the internet (or to AWS services reached over an internet path). Its cost has two components: a fixed hourly charge plus a **per-GB charge for processed data**. This per-GB charge is the trap. If a private instance downloads large volumes from S3, all that traffic goes through the NAT and is billed per GB, so the more S3 transfer there is, the more the NAT bill snowballs.

A **VPC Gateway Endpoint** is **dedicated** to S3 and DynamoDB. It adds an endpoint route to the route table so traffic to S3/DDB flows directly over the AWS internal network without passing through NAT. Decisively, it is **free**: no hourly charge and no data processing charge. So when "private instances use a lot of S3 and the NAT cost is a burden," a Gateway Endpoint is almost always the answer.

A **VPC Interface Endpoint (PrivateLink)** supports almost every AWS service. It creates an ENI (Elastic Network Interface) in your subnet to give a private entry point to that service. It has an hourly charge plus a per-GB charge (more expensive than Gateway), but to use services other than S3/DDB (SSM, Secrets Manager, ECR, etc.) without internet exposure, this is the only way.

| | NAT Gateway | Gateway Endpoint | Interface Endpoint |
|---|------------|------------------|--------------------|
| Target | The internet in general (outbound) | S3 and DynamoDB only | Most AWS services |
| Cost | Hourly + per GB (expensive) | **Free** | Hourly + per GB |
| Implementation | NAT device | Route table entry | Subnet ENI |
| Key use | General internet outbound | S3/DDB cost savings | Private access to other services |

AWS data transfer cost is determined by "how many boundaries are crossed." Within the same AZ is usually free, crossing an AZ (cross-AZ) costs a small amount per GB, crossing a Region costs more, and going out to the internet (egress) is the most expensive. The reason the NAT Gateway is expensive lies here too: NAT puts traffic on the internet egress path and adds a processing charge on top. So the big principle of cost-optimized architecture is "keep traffic inside the boundary": S3 inside the VPC via a Gateway Endpoint, service-to-service communication within the same AZ, and global delivery via the CloudFront cache to reduce origin egress. When the exam asks about "reducing data transfer cost," the answer is almost always the choice that "crosses fewer boundaries" (Gateway Endpoint, CloudFront, same-AZ placement).

## CloudFront and Global Accelerator - Both Are "Edge," but They Solve Different Problems

CloudFront and Global Accelerator both use AWS's edge network (PoPs worldwide), but **what they accelerate** is exactly opposite. Grasp this difference and the scenarios sort themselves out.

**CloudFront** **caches content**. It copies HTTP/HTTPS content (images, video, static files, API responses) to edge PoPs near users. Users get it from a nearby cache instead of traveling to a distant origin, so it is fast and the origin load drops. The essence of CloudFront is the **cache**, so the more cacheable (mostly static) the content, the bigger the effect.

**Global Accelerator** **does not cache.** Instead it **optimizes the network path**. It receives the user's traffic at the nearest edge and sends it to the destination Region over AWS's private backbone network. Instead of the congested public path of the internet, it takes AWS's dedicated highway. There are two key differences: (1) it supports **both TCP and UDP** (CloudFront is HTTP/S only), and (2) it provides **static Anycast IPs** for fast failover. So traffic that can't be cached and where latency and stability matter, such as game servers (UDP), IoT, and real-time communication, goes to Global Accelerator.

| | CloudFront | Global Accelerator |
|---|-----------|--------------------|
| Core mechanism | Content caching | Network path optimization |
| Protocol | HTTP/HTTPS only | Both TCP and UDP |
| IP | Domain-based | 2 static Anycast IPs |
| Suited workloads | Static/cacheable content | Games, real-time, non-HTTP |
| Failover | Origin failure handling | Fast switching between Regions |

For static site security, CloudFront + OAC (Origin Access Control) has become almost the standard pattern. The older OAI (Origin Access Identity) forced only CloudFront to access the S3 origin, but it had limits with SSE-KMS encryption and support in some Regions and features. In 2022 AWS announced OAC, which replaces it with a SigV4 signing-based approach and supports KMS-encrypted objects and all S3 features. The pattern is the same: keep the S3 bucket fully private, and only CloudFront accesses it by sending requests signed with OAC. Users can't open the S3 URL directly and receive content only through CloudFront. When the SOA exam asks "an S3 static site where direct S3 access must be blocked and content served only through CloudFront," OAC + a bucket policy is the answer, and OAI is classified as "outdated (legacy)."

## The Game Theory of Commitment Discounts - Why AWS Buys Future Usage

Domain 6's commitment discounts (Savings Plans, Reserved Instances) get confusing if you memorize them as a table, but once you know **why the discount is given**, the choice becomes clear. The core is that this is a kind of **trade**: the user commits to future usage, and AWS gives a discount in return for that predictability.

From AWS's standpoint, the most expensive thing is **uncertainty**. If you don't know who will use how much and when, you must always keep spare capacity empty (idle hardware = cost). When a user promises "I will definitely use $X per hour for 1 or 3 years," AWS can plan that much capacity in advance and returns that predictability as a discount. **The stronger the commitment (longer term, less flexibility), the bigger the discount**: this is the principle running through every commitment model.

| Model | Flexibility | Discount | What you commit to |
|------|--------|------|-----------|
| **Compute Savings Plans** | Highest | Medium | Hourly $ amount (anywhere across EC2/Fargate/Lambda) |
| **EC2 Instance Savings Plans** | Medium | Large | Hourly $ within a specific family and Region |
| **Standard RI** | Low | Largest | Fixed specific instance attributes |
| **Convertible RI** | Medium | Medium | Family can be exchanged |

Flexibility and discount are **inversely proportional**. Compute SP is the most flexible because you commit only an hourly amount while freely using "EC2, Fargate, or Lambda, any Region or family," but its discount is medium. Standard RI is tied to a specific instance type, so flexibility is low, but the discount is the largest. The selection criterion is "how stably predictable is my workload?" If you're sure you'll run the same c5.xlarge all year, take the maximum discount with Standard RI; if the workload changes often, buy flexibility with Compute SP.

Commitment discounts have the same structure as a financial **forward contract**: you buy future usage now at a fixed price. And Spot Instances sit at the opposite end as a **spot market**. Spot sells AWS's spare capacity at a variable price according to real-time supply and demand, so it is up to 90% cheaper, but it is reclaimed with 2 minutes' notice when the capacity is needed. Commitments (forward) and Spot (spot) distribute risk in exactly opposite ways: with a commitment the user bears usage risk and gets price stability, while with Spot the user bears reclamation risk and gets a price discount. Practical optimization mixes the two: cover the stable baseline load with Savings Plans, and handle elastic, reclamation-tolerant (stateless, checkpointed) load with Spot. Capacity Reservation is another axis: it is not a discount but insurance that "guarantees the capacity itself," where the price is On-Demand but you buy the certainty that capacity will be there when you need it.

## Wrapping Up

Domains 5 and 6 are one question: "where does traffic flow, and how much does that cost?" Network topology is the cost structure.

In summary, five points. (1) A packet passes checkpoints in the order IGW → Route Table → NACL → SG, and troubleshooting narrows down in that order. NACL and SG are deliberately different layers and models, as defense in depth. (2) Stateful (SG) automatically allows responses via a connection tracking table, while stateless (NACL) judges packets independently, so ephemeral port responses must be explicitly allowed. (3) NAT is expensive at hourly + per GB, and moving S3/DDB to the free Gateway Endpoint is the standard answer; the cost optimization principle is "cross fewer boundaries." (4) CloudFront is content caching (HTTP/S), Global Accelerator is path optimization (TCP/UDP + Anycast IP); they solve different problems. (5) Commitment discounts are "a trade that turns predictability into a discount": the stronger the commitment, the bigger the discount and the smaller the flexibility. Savings Plans (forward) and Spot (spot market) distribute risk in opposite ways, so you mix them.

The next article is a 50-question mock exam across the 6 domains, putting the depth built so far up against the exam format.

---

## 📝 Practice Questions

**Question 1.** HTTP access from outside to an EC2 instance (in a public subnet) fails. The SG inbound allows 80 and the route table is fine, yet it is blocked. Which checkpoint should you suspect next, and why?

A) IAM policy

B) NACL - it is evaluated before the SG (at the subnet boundary) and is stateless, so if it blocks inbound 80 or doesn't allow the outbound ephemeral port (1024-65535) the response leaves through, communication fails

C) KMS key

D) Route 53

**Answer: B**

Explanation: An inbound packet passes inspection in the order IGW → Route Table → NACL → SG. If the SG and route are fine, you should suspect the NACL ahead of them. The NACL is stateless, so besides allowing inbound it must also explicitly allow the outbound ephemeral port range (1024-65535) that the response leaves through. If this is omitted, requests arrive but responses can't leave, a half-open communication failure. The SG is stateful and has no such problem, so "the SG is right but it's blocked" is the classic case of a missing NACL ephemeral port.

---

**Question 2.** Instances in a private subnet download several TB from S3 every day, and the NAT Gateway data processing charge has spiked. What is the most effective fix?

A) Replace the NAT Gateway with a larger one

B) Add an S3 VPC Gateway Endpoint - a free endpoint dedicated to S3/DDB, so traffic flows directly over the AWS internal network without passing through NAT and the per-GB charge disappears

C) Move the instances to a public subnet

D) Add an Interface Endpoint (PrivateLink)

**Answer: B**

Explanation: A NAT Gateway bills hourly + per GB of processed data, so if all large S3 transfers pass through NAT, the bill snowballs. S3 and DynamoDB support Gateway Endpoints, which are free: adding a route to the route table sends S3 traffic straight over the AWS internal network without NAT. An Interface Endpoint (D) also supports S3 but bills hourly + per GB, so for plain cost savings the Gateway Endpoint is superior. The cost optimization principle is to make traffic "cross fewer boundaries (internet egress)," and the Gateway Endpoint does exactly that.

---

**Question 3.** A company serves a UDP-based multiplayer game server worldwide and needs low latency + fast failover on Region failure + static IPs (for client configuration). Which service fits?

A) CloudFront - with edge caching

B) Global Accelerator - accelerates TCP/UDP over the AWS private backbone, simplifies client configuration with 2 static Anycast IPs, and provides fast failover between Regions

C) Route 53 Latency Routing

D) ALB Cross-Region

**Answer: B**

Explanation: CloudFront is dedicated to HTTP/HTTPS content caching, so it can't handle UDP game traffic. Global Accelerator is a service that doesn't cache but optimizes the network path; it supports both TCP and UDP and sends traffic over the AWS private backbone to reduce latency. It provides 2 static Anycast IPs so clients can hardcode the IPs, and on a backend Region failure it switches quickly to another Region based on health checks. For global acceleration of games, real-time, and non-HTTP workloads, Global Accelerator is the answer.

---

**Question 4.** You are certain to run the same 20 c5.xlarge instances in one Region all year with no change, and you want the maximum discount. Which commitment fits best?

A) Compute Savings Plans

B) Standard Reserved Instances - fixed to specific instance attributes so flexibility is low, but the discount is the largest

C) Spot Instances

D) Capacity Reservation

**Answer: B**

Explanation: For commitment discounts, "flexibility and discount are inversely proportional." If the workload is fully predictable (same type, Region, and quantity fixed), Standard RI, which gives up flexibility for the maximum discount, is optimal. Compute SP (A) is free across any family, Region, or service, but its discount is medium accordingly, so for an unchanging workload there's no reason to pay extra for flexibility. Spot (C) carries reclamation risk and is unsuitable for stable operation, and Capacity Reservation (D) is a capacity guarantee, not a discount (the price is On-Demand). The standard approach is to buy a big discount with a stronger commitment the higher the predictability.

---

**Question 5.** You have a stateless batch workload that can resume from a checkpoint even if interrupted, and you want to save as much cost as possible. There is also a separate stable baseline service that always runs. What is the cost-optimal combination?

A) All Standard RI

B) Cover the baseline with Savings Plans and handle the interruption-tolerant batch with Spot - mix commitments (price stability) and Spot (up to 90% discount, reclamation risk) to match workload characteristics

C) All Spot

D) All On-Demand

**Answer: B**

Explanation: Commitments (forward contracts) and Spot (spot market) distribute risk in opposite ways: a commitment promises usage and gets price stability, while Spot bears reclamation risk and gets up to 90% off. So the optimal approach is to cover the stable, always-running baseline load with Savings Plans to lock in a predictable discount, and run the elastic load that can tolerate interruption (stateless, checkpointed) on Spot for the extreme discount. All Spot (C) would cut the service off if the baseline is reclaimed, and all RI (A) wastes a commitment on elastic load. The key is mixing different pricing models by workload characteristics.

---

**Question 6.** You serve an S3 static website through CloudFront and want to completely block users from accessing the S3 URL directly so they receive content only through CloudFront. What is the currently recommended standard?

A) OAI (Origin Access Identity)

B) OAC (Origin Access Control) + S3 bucket policy - forces only CloudFront to access S3 using SigV4 signing, and supports KMS-encrypted objects and all S3 features

C) Signed URLs only

D) S3 Block Public Access only

**Answer: B**

Explanation: OAC is the current standard that replaced OAI in 2022; being SigV4 signing-based, it supports SSE-KMS encrypted objects and all Regions and features. If you keep the S3 bucket fully private and use a bucket policy to "allow only CloudFront requests made through OAC," users can't open the S3 URL directly and receive content only via CloudFront. OAI (A) is classified as outdated (legacy) and has constraints with KMS and others. Block Public Access alone (D) is incomplete because it leaves out configuring the CloudFront access path. The current answer for "block direct S3 access + CloudFront only" is OAC.

---

**Question 7.** Two EC2 instances can't communicate, and you want to quickly identify whether the SG, NACL, or route is blocking it without generating actual traffic. Which tool fits best?

A) VPC Flow Logs - analyze real traffic logs

B) Reachability Analyzer - statically analyzes the path between two resources based on SG/NACL/route configuration and reports which component blocks it

C) Traffic Mirroring

D) ping

**Answer: B**

Explanation: Reachability Analyzer sends no real packets; it statically analyzes the configuration of SGs, NACLs, route tables, endpoints, and so on to pinpoint whether the destination is reachable from the source and, if blocked, exactly which component (which SG rule, which NACL, etc.) blocks it. VPC Flow Logs (A) are allow/deny metadata after real traffic has occurred, so they don't fit the "diagnose ahead of time without sending traffic" requirement, and Traffic Mirroring (C) mirrors packet payloads, which is overkill. Configuration-based static path diagnosis is the unique role of Reachability Analyzer.

---

## 📌 Today's Summary

1. A packet is inspected in the order IGW → Route Table → NACL → SG, and troubleshooting narrows down in that order. NACL/SG are deliberately different layers and models as defense in depth
2. Stateful (SG) = connection tracking table automatically allows responses; stateless (NACL) = per-packet independent judgment, so the ephemeral port (1024-65535) response must be explicitly allowed
3. NAT is expensive at hourly + per GB, and S3/DDB are split off to the free Gateway Endpoint; the cost optimization principle is "cross fewer boundaries (minimize internet egress and cross-AZ)"
4. CloudFront = content caching (HTTP/S), Global Accelerator = path optimization (TCP/UDP + static Anycast IPs). For S3 protection, OAC is the current standard (OAI is legacy)
5. Commitment discount = a trade that turns predictability into a discount (strong commitment = big discount = low flexibility). Savings Plans (forward) and Spot (spot market) are opposite on risk, so mix them
