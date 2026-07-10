# Day 3 - Why Data Transfer Becomes the Hidden 30% of the Bill

Someone analyzing cloud cost for the first time almost always focuses only on EC2 and S3 storage charges. Then they see the "Data Transfer" line on the bill and get a shock — in some workloads, data transfer accounts for more than 30% of total cost. What's even more baffling is that **it's not intuitively visible where this cost comes from**. Two EC2 instances merely exchanged data, yet a per-GB charge is applied for the sole reason that the two were in different Availability Zones (AZs). Data transfer cost is the direct result of AWS's network's physical structure — regions, AZs, the internet boundary — being reflected right onto the price sheet, and you can only reduce it once you can picture this geography in your head.

The underlying principle is simple. **Data coming into AWS (inbound/ingress) is generally free, and data going out (outbound/egress) is charged.** This isn't just an AWS quirk but an industry-wide practice: by making it "easy to bring data in and expensive to take it out," it produces a lock-in effect that ties workloads to the provider's cloud — this egress fee was long a target of industry criticism, and it's the backdrop for AWS, Google, and Azure successively announcing "free egress when fully migrating to another cloud" policies since 2024. Instead of memorizing a transfer-cost table, this article follows the reasoning — "why the AZ boundary becomes money," "how a Gateway Endpoint drives NAT cost to zero," "how CloudFront inverts the transfer unit price" — to cover the network axis of the SAA cost domain.

## Why the AZ Boundary Becomes Money

Let's start from the most confusing point. Even within the same region (e.g., ap-northeast-2), communication between two instances in the same AZ is free, but if they're **in different AZs, both directions carry a per-GB charge**. The question "why, when it's the same region?" resolves once you understand what an AZ is.

An Availability Zone (AZ) is not a logical concept but **a physically separated data center (or data center cluster)**. The AZs of the same region are several km apart so that a fire or power outage in one building doesn't affect another AZ — this is the physical basis of Multi-AZ high availability. But this physical separation requires a **dedicated fiber network** connecting the AZs, and operating that infrastructure incurs real cost. AWS passes this cost onto inter-AZ traffic as a per-GB charge. In other words, the AZ boundary fee is the price of "physical separation for high availability." High availability and cost are two sides of the same coin.

> 💡 **Related theory**: This is the fundamental trade-off of distributed systems, exposed as cost. Replicating data across multiple AZs raises durability and availability (surviving even if one AZ dies), but replication traffic and inter-AZ synchronization cost come with it. Just as the CAP theorem says "under partition tolerance you can't have both consistency and availability fully at once," from an infrastructure-cost view you also can't simultaneously maximize "physical separation (availability) and reduced communication cost." Buy availability with Multi-AZ and an inter-AZ transfer bill follows; save cost with a single AZ and you're wholly exposed to that AZ's failure.

> ⚠️ **Pitfall**: The ELB's **Cross-Zone Load Balancing** is directly tangled up with this cost. With cross-zone on, the load balancer distributes traffic evenly to targets in all AZs, and this process generates inter-AZ traffic. ALB has cross-zone on by default and doesn't separately bill inter-AZ charges, but **NLB has cross-zone off by default, and turning it on incurs inter-AZ data transfer charges**. The scenario "traffic is skewed to one AZ on an NLB" can be caused by cross-zone being off, and you should know the trade-off that turning it on improves balance but creates inter-AZ cost. If you're cost-sensitive, the fundamental fix is to design your topology so communication completes within the same AZ.

## The Principle by Which a Gateway Endpoint Drives NAT Cost to Zero

Consider an EC2 in a private subnet accessing S3. A private subnet can't go out directly through the internet gateway, so it usually reaches S3 through a **NAT Gateway** over the internet. But this path has two layers of cost — the NAT Gateway's hourly charge + a per-GB processing charge for data passing through the NAT. Reading and writing large amounts of data to S3 makes NAT processing cost explode.

An **S3 Gateway Endpoint** bypasses this path entirely. When you create a Gateway Endpoint, a special route (a prefix list) to S3 is added to the VPC's **route table**, so S3 traffic flows **directly to S3 over the AWS internal backbone**, not through a NAT or internet gateway. Since it doesn't traverse the internet, NAT processing cost becomes zero, and since traffic doesn't leave the AWS network, no data transfer charge is incurred either. Crucially, the **Gateway Endpoint itself is completely free** — no hourly charge, no GB charge. Only two services, S3 and DynamoDB, provide this free Gateway Endpoint.

> 🔍 **Going deeper**: Gateway Endpoints and Interface Endpoints work fundamentally differently. A **Gateway Endpoint** (S3/DynamoDB only) works by adding a route to the route table, so it uses no ENI, no IP, and is free. An **Interface Endpoint** (PrivateLink, most other services) works by creating an actual ENI (elastic network interface) in the subnet and assigning it a private IP, so it costs an **hourly ENI charge + a per-GB processing charge**. So the proposition "using a VPC Endpoint always reduces cost" is false — an Interface Endpoint can actually be more expensive than NAT when traffic is low. An Interface Endpoint yields a cost benefit only for security (not exposing traffic to the internet) or high-usage services (high-volume SSM/ECR, etc.).

> ⚠️ **Pitfall**: The exam frequently twists the simplistic formula "VPC Endpoint = cost savings." For traffic to S3/DynamoDB, the free Gateway Endpoint is the obvious answer, but installing an Interface Endpoint for another service (e.g., a small number of Secrets Manager calls) can make the hourly ENI charge exceed the NAT savings. The key discriminators are "① Is it S3/DDB (free Gateway)? ② Is the traffic volume large enough to justify the ENI fixed cost?"

## How CloudFront Inverts the Transfer Unit Price

When serving static content (images, videos, JS) to global users, letting them download directly from S3 makes data-transfer-out (DTO) cost grow in proportion to the number of users. Putting **CloudFront** in front reduces cost, and this is the result of two overlapping mechanisms.

First, **caching**. CloudFront caches content at edge locations worldwide, so the second and later requests for the same file are handled at the edge without reaching the S3 origin. As origin fetches to S3 drop, S3 request cost and S3→internet transfer drop together. Second, the **structural difference in transfer unit price**. Data transfer on the S3→CloudFront segment (origin→edge) is **free**, and the unit price going out from CloudFront to users is generally cheaper than S3 going directly to the internet, and at high usage you can even get commitment discounts. As a result, an inversion occurs where "via CloudFront" becomes cheaper than "direct S3."

CloudFront's **Price Class** is also a cost lever. It's split into All (all edges worldwide) / 200 (excluding some of North America, Europe, and Asia) / 100 (North America and Europe only), and if users are concentrated in a specific region, you use a lower class with fewer edges to reduce cost — at the expense of higher latency for far-away users. **Origin Shield** places one more central cache layer between the edges and the origin, preventing the redundancy of multiple edges each fetching the same content from the origin, raising cache hit rate and further reducing origin requests.

> 📚 **Case study**: The most famous case of data transfer cost threatening a business is **Dropbox's de-clouding (2016)**. Dropbox initially stored user files in AWS S3, but as it grew to hundreds of millions of users, storage and transfer costs became enormous. Ultimately it built its own data centers (Magic Pocket) and moved most data off AWS, disclosing savings of about $75 million in operating cost over two years. There are two lessons — ① data transfer and storage cost can grow so enormous at scale that owning your own infrastructure becomes rational, and ② nevertheless, for most companies the capital and operational burden of building your own data center is larger, so reducing it within AWS with CloudFront, Endpoints, and topology is the realistic answer. Even Dropbox left some cold storage on AWS.

> 💡 **Related theory**: CloudFront's caching is the network version of computer science's universal principles of **locality of reference** and **cache tiering**. Just as a CPU keeps frequently used data in the L1 cache close to the core, a CDN keeps frequently requested content at the edge close to the user. Origin Shield adds one more layer (an L2 equivalent) to further reduce access to the origin (a main-memory equivalent). The same thinking — "amortize expensive long-distance access through a nearby cache" — recurs across CPU, network, and storage.

## The Cost of Multi-Account and Multi-VPC Connectivity

Connecting across VPCs and across accounts also has its own cost structures. **VPC Peering** directly connects two VPCs, and traffic between the same AZ within the same region is free, but inter-region peering carries an inter-region transfer charge. **Transit Gateway (TGW)** is a central router that bundles dozens to hundreds of VPCs in a hub-and-spoke, but in exchange for convenience it carries a **per-GB data processing charge for traffic passing through the TGW** — so "connect just two VPCs" favors near-free Peering, while "connect many VPCs scalably" chooses TGW for management convenience. **PrivateLink** is used to securely expose one specific service to another VPC/account, and like an Interface Endpoint it costs ENI and GB charges.

> 🔍 **Going deeper**: AWS has continually adjusted its transfer-fee policy — for instance, making **inter-AZ data transfer within a region free in some scenarios in late 2024** — but for the exam and most workloads, it's safe to keep the default premise that "inter-AZ, inter-region, and internet egress incur cost." The details of policy change, but the big picture that **the farther the physical distance, the more expensive** (same AZ < different AZ < different region < internet) doesn't change — with just this hierarchy in your head, you can reason about which topology is cheaper.

## Cost-Saving Patterns Roundup

The standard patterns for reducing data transfer cost, in one line each:

| Scenario | Solution | Key reason |
|----------|--------|-----------|
| S3/DDB traffic spike through NAT GW | S3/DDB **Gateway Endpoint** (free) | Bypass NAT/internet, direct via AWS backbone |
| Global users downloading static content | **CloudFront** | Cache + free origin→edge + lower egress price |
| Excessive inter-AZ traffic | Complete communication within same AZ, review NLB cross-zone | Avoid AZ boundary fee |
| Private access to a small-volume AWS service | Interface Endpoint if traffic large, keep NAT if small | Compare ENI fixed cost vs savings |
| Scalable connection of many VPCs | TGW (convenience) vs Peering (cheap few connections) | Processing fee vs management convenience |
| Inter-region replication cost | CRR only the data truly needed | Reduce inter-region transfer charge |

> ⚠️ **Pitfall**: When you see the keyword "minimize data transfer cost," the top-of-mind first candidates should reflexively be the **S3/DDB Gateway Endpoint (free)** and **CloudFront**. Conversely, for the security keyword "privately, without exposing traffic to the internet," it's **Interface Endpoint/PrivateLink**. When both requirements (cost vs private) overlap, for S3/DDB a Gateway Endpoint satisfies both, but for other services you must accept the Interface Endpoint's ENI cost to get private access.

## Hands-on with the CLI

```bash
# S3 Gateway Endpoint (free) — attach to private subnet route tables
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b \
  --vpc-endpoint-type Gateway

# DynamoDB Gateway Endpoint (free)
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.dynamodb \
  --route-table-ids rtb-private-a rtb-private-b \
  --vpc-endpoint-type Gateway

# Interface Endpoint (PrivateLink) — ENI/GB charges, only when usage is high
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.ssm \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-a subnet-b \
  --security-group-ids sg-endpoints

# CloudFront distribution (price class 100 = North America/Europe only, cost saving)
aws cloudfront create-distribution --distribution-config '{
  "CallerReference":"saa-2026","Comment":"static assets",
  "Enabled":true,"PriceClass":"PriceClass_100",
  "Origins":{"Quantity":1,"Items":[{"Id":"s3-origin",
    "DomainName":"my-saa-bucket-2026.s3.amazonaws.com",
    "S3OriginConfig":{"OriginAccessIdentity":""}}]},
  "DefaultCacheBehavior":{"TargetOriginId":"s3-origin",
    "ViewerProtocolPolicy":"redirect-to-https",
    "MinTTL":3600}}'

# Enable NLB Cross-Zone (better inter-AZ balance, inter-AZ transfer fee trade-off)
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn arn:aws:elasticloadbalancing:...:loadbalancer/net/my-nlb \
  --attributes Key=load_balancing.cross_zone.enabled,Value=true
```

## Wrapping Up

Data transfer cost is AWS's network's physical geography reflected onto the price sheet. ① The basic principle is **inbound free, outbound charged**, and the farther the distance the more expensive (same AZ < different AZ < different region < internet). ② The **AZ boundary fee** is the infrastructure cost of connecting physically separated data centers, the price of high availability — directly tangled with NLB cross-zone. ③ The **S3/DDB Gateway Endpoint** adds a route to the route table to bypass NAT/internet and is completely free, making it the answer to "NAT cost spike." ④ The **Interface Endpoint** costs ENI/GB charges, so "VPC Endpoint = always savings" is false and it's a benefit only when usage is high. ⑤ **CloudFront** becomes cheaper than direct S3 download through caching, free origin→edge transfer, and a lower egress unit price, and you tune it further with price classes and Origin Shield. The exam repeatedly tests distinguishing the keywords "minimize transfer" (Gateway Endpoint/CloudFront) vs "private access" (Interface Endpoint).

In the next article we look at the governance layer that reports, forecasts, and controls all these costs after the fact — how Cost Explorer, Budgets, CUR, and Cost Allocation Tags implement FinOps's visibility, accountability, and automation.

---

## 📝 연습 문제

**문제 1.** EC2 instances in a private subnet read and write large amounts of data to S3, and the NAT Gateway's data processing cost has spiked. What is the most effective cost-saving measure?

A) Create an Interface Endpoint (PrivateLink) for S3
B) Create an S3 Gateway Endpoint
C) Replace the NAT Gateway with a NAT Instance
D) Build a Direct Connect

**정답: B**

해설: An S3 Gateway Endpoint adds an S3 route to the route table so traffic goes directly over the AWS backbone instead of NAT/internet, and the endpoint itself is completely free, driving NAT processing cost to zero. An Interface Endpoint (A) can be used for S3 too but costs ENI/GB charges, making it more expensive than the free Gateway Endpoint. A NAT Instance (C) only adds management burden while the traffic cost structure stays the same. Direct Connect (D) is for on-premises connectivity — an overkill solution.

---

**문제 2.** A company serves static images/videos stored in S3 to global users, and data-transfer-out (DTO) cost is exploding in proportion to user growth. What is the most suitable way to reduce cost?

A) Replicate the S3 bucket to multiple regions and serve directly
B) Place CloudFront in front of S3
C) Use a NAT Gateway with price class set to All
D) Enable S3 Transfer Acceleration

**정답: B**

해설: CloudFront reduces S3 origin requests via edge caching, transfer on S3→CloudFront is free, and the CloudFront→user egress unit price is cheaper than direct S3, making it cheaper than "direct S3." A actually increases replication and transfer cost, C is a wrong choice since NAT has no price-class concept, and D is an upload (inbound) acceleration feature unrelated to reducing download transfer cost.

---

**문제 3.** Two EC2 instances communicate within the same region, yet an unexpected data transfer charge is being billed. What is the most likely cause?

A) The two instances are in different AZs
B) A charge was applied to inbound traffic
C) Same-AZ communication is always charged
D) VPC Peering is disabled

**정답: A**

해설: Even within the same region, communication between instances in different AZs is charged per GB in both directions — because an AZ is a physically separated data center and the infrastructure cost of connecting them is passed on. B is wrong (inbound is generally free), C is also wrong (same-AZ communication is free), and D is irrelevant to communication within a single VPC. If cost-sensitive, design your topology so communication completes within the same AZ.

---

**문제 4.** An architect assumed "using a VPC Endpoint always saves cost" and installed an Interface Endpoint for a Secrets Manager that is only called a little, but cost went up. Why?

A) An Interface Endpoint has an hourly ENI charge + GB processing charge, so it can be more expensive than NAT for low-volume traffic
B) An Interface Endpoint is S3-only and was applied incorrectly
C) A missing Endpoint Policy incurred extra charges
D) Secrets Manager doesn't support Endpoints

**정답: A**

해설: An Interface Endpoint (PrivateLink) creates an ENI in the subnet and costs an hourly charge plus a GB processing charge. When traffic is low, this fixed cost exceeds the NAT savings, making it more expensive. "VPC Endpoint = always savings" is a wrong formula, and the only free one is the S3/DDB Gateway Endpoint. B is wrong (Interface supports many services), C is not a cost cause, and D is also wrong (Secrets Manager supports Interface Endpoints).

---

**문제 5.** A team runs an NLB and has a problem where traffic is skewed to targets in a specific AZ. When enabling cross-zone load balancing, what should you know from a cost standpoint?

A) NLB cross-zone is on by default, so nothing changes
B) Enabling NLB cross-zone incurs inter-AZ data transfer charges
C) Cross-zone is only possible on ALB
D) Enabling cross-zone lowers availability

**정답: B**

해설: NLB has cross-zone load balancing off by default, and enabling it distributes traffic evenly to targets in all AZs — improving balance but incurring inter-AZ data transfer charges in the process (the difference being that ALB has cross-zone on by default and doesn't separately bill inter-AZ charges). A is wrong for NLB, C is also wrong (NLB supports cross-zone too), and D is the opposite — better balance is favorable for availability.

---

**문제 6.** A company wants to connect and route 50+ VPCs scalably from a central point. When management convenience and scalability take priority over cost, what is suitable?

A) Full-mesh all VPCs with 1:1 VPC Peering
B) Hub-and-spoke connection with Transit Gateway
C) Connect each VPC via a detour over the internet
D) Merge all VPCs into one

**정답: B**

해설: Transit Gateway is a central router that bundles many VPCs in a hub-and-spoke; it carries a per-GB data processing charge but removes the management complexity of full-mesh Peering (N VPCs need N(N-1)/2 connections), giving scalability and management convenience. A is nearly unmanageable at 50 VPCs as the number of connections explodes, C is bad for both security and cost, and D is inappropriate from an isolation/blast-radius standpoint. "Few VPCs, low-cost connection" means Peering; "many VPCs, scalable connection" means TGW.

---

**문제 7.** A service's users are concentrated only in North America and Europe, and it wants to reduce CloudFront cost further. What is the appropriate action?

A) Change the price class to PriceClass_All
B) Set the price class to PriceClass_100 (North America/Europe)
C) Remove CloudFront and serve directly from S3
D) Disable Origin Shield

**정답: B**

해설: CloudFront price class 100 uses only North America/Europe edges to reduce cost — since users are concentrated in those regions, not using far-away edges means no latency penalty. PriceClass_All (A) uses all edges worldwide for the highest cost, C loses the caching and free-origin-transfer benefits and can actually be more expensive, and D — turning off Origin Shield lowers cache hit rate, which can increase origin requests and cost.

---

## 📌 Key Takeaways

Data transfer cost is the network's physical geography (AZ, region, internet boundary) turned into a price sheet. Inbound free, outbound charged is the default, and the farther the distance the more expensive. The AZ boundary fee is the infrastructure cost of connecting physically separated data centers and the price of high availability, tangled with NLB cross-zone. The S3/DDB Gateway Endpoint bypasses NAT/internet by routing and is completely free, making it the answer to "NAT cost spike," while the Interface Endpoint is a benefit only when usage is high due to ENI/GB charges. CloudFront becomes cheaper than direct S3 via caching, free origin transfer, and a lower egress unit price, tuned by price class. The exam tests your ability to distinguish the keywords "minimize transfer" (Gateway EP/CloudFront) and "private access" (Interface EP/PrivateLink).
