# Day 3 - Tagging Strategy, Resource Organization

Tagging: cost allocation (project, team, environment), automation (backup frequency, tagging policy via Config), governance (quota enforcement), security (data classification). Standardized tag schemas across organization.

Tag enforcement: AWS Config evaluates resources for required tags. Resource Groups organize by tags. Cost allocation reports by tag. API automation uses tags for resource discovery.

---

## Practice Problems

**Question 1.** HTTP access from outside to an EC2 instance (in a public subnet) fails. The SG inbound allows 80 and the route table is normal, yet it is blocked. What checkpoint should be suspected next, and why?

A) IAM policy
B) NACL: it is evaluated before the SG (at the subnet boundary) and is stateless, so communication fails if it blocks inbound 80 or does not allow the outbound ephemeral ports (1024-65535) used for the response
C) KMS key
D) Route 53

**Answer: B**

Explanation: An inbound packet is inspected in the order IGW → Route Table → NACL → SG. If the SG and routes are normal, you should suspect the NACL in front of them. Because the NACL is stateless, you must explicitly allow not only inbound but also the outbound ephemeral port range (1024-65535) used for the response. If this is missed, you get a half-open communication failure where requests come in but responses cannot go out. The SG is stateful and does not have this problem, so "the SG is right but it is blocked" is the classic case of a missing NACL ephemeral port.

---

**Question 2.** Instances in a private subnet download several TB from S3 every day, and the NAT Gateway's data processing charges have surged. What is the most effective solution?

A) Replace the NAT Gateway with a larger one
B) Add an S3 VPC Gateway Endpoint: a free endpoint dedicated to S3/DDB; traffic flows directly inside AWS without passing through NAT, so the per-GB charge disappears
C) Move the instances to a public subnet
D) Add an Interface Endpoint (PrivateLink)

**Answer: B**

Explanation: A NAT Gateway is billed hourly plus per GB of data processed, so if all large S3 transfers pass through NAT, the charges snowball. S3 and DynamoDB support Gateway Endpoints, which are free: add a route to the route table so that S3 traffic goes directly over the AWS internal network without NAT. An Interface Endpoint (D) also supports S3, but it has hourly plus per-GB charges, so for simple cost reduction the Gateway endpoint is superior. The principle of cost optimization is to have traffic "cross the boundary (internet egress) less," and the Gateway Endpoint does exactly that.

---

**Question 3.** A company serves a UDP-based multiplayer game server worldwide and needs low latency + fast failover during a Region outage + static IPs (for client configuration). Which service is suitable?

A) CloudFront, with edge caching
B) Global Accelerator: accelerates TCP/UDP over the AWS private backbone, simplifies client configuration with 2 static Anycast IPs, and provides fast failover between Regions
C) Route 53 Latency Routing
D) ALB Cross-Region

**Answer: B**

Explanation: CloudFront is dedicated to HTTP/HTTPS content caching, so it cannot handle UDP game traffic. Global Accelerator does not cache; it optimizes the network path, supports both TCP and UDP, and reduces latency by sending traffic over the AWS private backbone. It provides 2 static Anycast IPs so clients can hardcode the IPs, and when a backend Region fails it quickly switches to another Region based on health checks. For global acceleration of games, real-time, and non-HTTP workloads, Global Accelerator is the answer.

---

**Question 4.** A company is certain it will run 20 identical c5.xlarge instances in one Region, unchanged, all year round. It wants the maximum discount. What is the most suitable commitment?

A) Compute Savings Plans
B) Standard Reserved Instances: fixed to specific instance attributes so flexibility is low, but the discount is the largest
C) Spot Instances
D) Capacity Reservation

**Answer: B**

Explanation: In commitment discounts, "flexibility and discount are inversely related." When the workload is completely predictable (same type, Region, and quantity fixed), Standard RI, which gives up flexibility for the maximum discount, is optimal. Compute SP (A) is free across any family, Region, or service, but the discount is moderate to that extent, so for an unchanging workload there is no reason to pay extra for flexibility. Spot (C) has reclamation risk and is unsuitable for stable operation, and Capacity Reservation (D) is not a discount but a capacity guarantee (the price is On-Demand). The standard is that the higher the predictability, the more discount you buy with a stronger commitment.

---

**Question 5.** A company has a stateless batch workload that can resume from a checkpoint if interrupted. It wants to save as much cost as possible. It also has a separate stable baseline service that always runs. What is the cost-optimal combination?

A) All Standard RI
B) Cover the baseline with Savings Plans and handle the interruption-tolerant batch with Spot: mix commitments (price stability) and Spot (up to 90% discount, reclamation risk) according to workload characteristics
C) All Spot
D) All On-Demand

**Answer: B**

Explanation: Commitments (a forward contract) and Spot (a spot market) allocate risk in opposite ways: a commitment promises usage and gains price stability, while Spot takes on reclamation risk and gains up to a 90% discount. So the optimal approach is to cover the stable, always-running baseline load with Savings Plans to secure a predictable discount, and to run the elastic load that can tolerate interruption (stateless, with checkpoints) on Spot to get the extreme discount. With all Spot (C), the service is cut off if the baseline is reclaimed, and with all RI (A), a commitment is wasted on the elastic load. The key is to mix different pricing models according to workload characteristics.

---

**Question 6.** A company serves an S3 static website through CloudFront and wants to completely block users from accessing the S3 URL directly, so that content is received only through CloudFront. What is the currently recommended standard?

A) OAI (Origin Access Identity)
B) OAC (Origin Access Control) + S3 bucket policy: enforces that only CloudFront can access S3 based on SigV4 signing, and supports KMS-encrypted objects and all S3 features
C) Signed URL only
D) S3 Block Public Access only

**Answer: B**

Explanation: OAC is the current standard that replaced OAI in 2022; being SigV4-based, it supports SSE-KMS encrypted objects and all Regions and features. If you keep the S3 bucket fully private and use the bucket policy to "allow only CloudFront requests through OAC," users cannot open the S3 URL directly and receive content only via CloudFront. OAI (A) is classified as legacy and has restrictions such as with KMS. Block Public Access alone (D) is incomplete because the CloudFront access path is not configured. The current answer for "block direct S3 access + CloudFront only" is OAC.

---

**Question 7.** Communication between two EC2 instances fails, and you want to quickly identify which of the SG/NACL/route is blocking it without generating actual traffic. What is the most suitable tool?

A) VPC Flow Logs: analyze actual traffic logs
B) Reachability Analyzer: statically analyzes the path between two resources based on SG/NACL/route configuration and reports which component blocks it
C) Traffic Mirroring
D) ping

**Answer: B**

Explanation: Reachability Analyzer does not send actual packets; it statically analyzes the configuration of SGs, NACLs, route tables, endpoints, and so on to pinpoint whether the destination is reachable from the source and, if blocked, exactly which component (which SG rule, which NACL, and so on) blocks it. VPC Flow Logs (A) are allow/deny metadata after actual traffic has occurred, so they do not meet the requirement to "diagnose in advance without generating traffic," and Traffic Mirroring (C) mirrors packet payloads, which is excessive. Configuration-based static path diagnosis is the unique role of Reachability Analyzer.

---
