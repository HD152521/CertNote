# Day 3 - NAT Gateway, VPC Endpoint, PrivateLink — Three Ways VPC Meets the Outside

After creating a VPC and placing instances in private subnets, a new question immediately arises: "How does this instance communicate with the outside world?" The first trap is that there's not one answer but three. Depending on where traffic goes, you must choose between NAT Gateway, VPC Endpoint, or PrivateLink. Choosing wrong results in 10x costs or weakened security.

The most common shock to operators' bills is NAT Gateway data processing charges. $0.045/GB seems modest, but in an ETL environment sending 1TB daily to S3, NAT GW alone costs $1,350 monthly. The same traffic diverted to Gateway Endpoint costs $0. Knowing just this one fact solves 30% of SOA exam scenarios. This section follows why each of the three methods exists, what traffic goes where, and the cost-security-operation trade-offs.

## Three Paths for External Communication — Determined by Traffic Destination

Private subnet EC2 outbound traffic divides into three based on destination:

| Destination | Tool | Cost | Security |
|--------|------|------|------|
| External Internet (any URL) | NAT Gateway → IGW | Per-hour + per-GB (expensive) | Standard (SNAT) |
| AWS Services (S3, DynamoDB) | Gateway Endpoint | **Free** | Within AWS backbone |
| AWS Services (others) | Interface Endpoint (PrivateLink) | Per-hour + per-GB | Within AWS backbone |
| Company/third-party services (other VPC/account) | PrivateLink + Endpoint Service | Per-hour + per-GB | Within AWS backbone |

First operational principle: **Never let traffic to AWS services pass through NAT GW.** Divert it through Gateway Endpoint (S3/DDB) or Interface Endpoint (others) to optimize both cost and security. Second principle: **When calling services in other VPCs/accounts, use PrivateLink**. Communication stays within AWS backbone, bypassing the Internet.

## NAT Gateway — Operational Simplicity Created by Managed Service, and New Traps

NAT Gateway appeared in December 2015. Before that, NAT Instance (EC2 with NAT software) was the only option, and operators had to handle HA, scaling, and patching themselves. NAT GW solved two things by making it AWS-managed: ① Auto-scaling from 5 Gbps to 100 Gbps, ② AZ-level availability (AWS's responsibility).

Internal operation is SNAT (Source NAT) + connection tracking. When private instance (10.0.10.5) sends a packet to external 8.8.8.8, NAT GW rewrites the source IP to its own Elastic IP (e.g., 52.0.0.10) and sends it to IGW. When response returns 8.8.8.8 → 52.0.0.10:43321, connection tracking table sends it back to the original instance (10.0.10.5).

### The Secret of AZ Dependency

NAT GW is bound to an AZ when created, based on its subnet. If you have multi-AZ private subnets but place NAT GW in only one AZ, two problems occur:

First, **AZ failure propagation**. If NAT GW in AZ-a dies, EC2 in AZ-b also loses external communication — the route table points to AZ-a's NAT. AWS's "one AZ dies but others survive" multi-AZ principle breaks.

Second, **cross-AZ data transfer charges**. Traffic from AZ-b instance to AZ-a NAT GW incurs additional $0.01/GB cross-AZ charge. Combined with NAT GW's own $0.045/GB processing cost, it becomes $0.055/GB — 22% more expensive.

Standard pattern: **One NAT GW per AZ, with each AZ's private route table pointing to its own AZ's NAT**. Route tables must also be created per-AZ (not shared). This is the pattern most frequently checked in both exams and operations.

> 📚 **Case Study**: 2020 Slack partial outage post-mortem highlighted NAT GW connection tracking limits. AWS explicitly documents NAT GW has ~55,000 simultaneous connections per destination (precisely, port usage limit per source IP × dest IP × dest port combination). Slack hit this limit with too many concurrent connections to the same external service behind a single NAT GW; new connection SYNs failed with ENOTCONN or timeout. Solutions: ① NAT GW sharding across multiple instances, ② Multi-IP NAT GW (2021 introduction — multiple EIPs per NAT GW). This depth doesn't appear in exams but becomes a debugging clue in large-scale operations.

> ⚠️ **Trap**: NAT GW **cannot have Security Groups attached**. NACL applies to the subnet where NAT GW exists, so NACL control is possible, but SG is not. NAT Instance is EC2, so SG is possible — this difference frequently appears in exam questions.

### NAT Instance — Legacy but Sometimes the Answer

NAT Instance has been replaced by NAT GW in almost all cases, but in two scenarios it's still the answer:

① **When port forwarding is needed**. NAT GW only supports SNAT — it can't perform DNAT (forwarding new inbound connections to internal instances). When operators "need to expose private servers externally but ALB is overkill," NAT Instance with iptables DNAT is the answer.

② **Cost-minimized environments**. NAT GW costs $0.045/hour + $0.045/GB. In dev/test environments with minimal traffic, t3.nano NAT Instance ($0.005/hour) is 1/9 the cost of NAT GW ($0.045/hour). However, you bear operational burden directly (HA, patching, AMI management).

One well-known NAT Instance trap: **You must disable Source/Destination Check**. EC2's default behavior is "reject packets where it's not src/dst," but NAT forwards other instances' packets, so this check must be disabled. `aws ec2 modify-instance-attribute --instance-id i-xxx --no-source-dest-check`.

## VPC Endpoint — Gateway vs Interface, Two Inventions with Time Gap

VPC Endpoint was introduced in two stages: **Gateway Endpoint** (S3-only) in May 2015, **Interface Endpoint** (PrivateLink) in 2017. The similar names cause confusion, but internal implementation is completely different.

### Gateway Endpoint — Routing Table Trick

Gateway Endpoint is essentially **a special routing entry**. When you add an entry like `pl-xxxxx → vpce-xxxxx` (S3 IP range expressed as prefix list) to a route table, traffic to that range goes through the endpoint instead of IGW. The endpoint routes packets within AWS backbone.

Supported services: **Only S3 and DynamoDB**. The reason these two have Gateway Endpoint while others don't is that traffic patterns overwhelm (nearly every workload uses one or both), so AWS decided to keep them free. Not creating Gateway for other services is likely due to prefix list management burden.

**Free** is decisive. When S3 traffic going through NAT GW instead uses Gateway Endpoint: ① No hourly NAT GW cost, ② No per-GB NAT GW processing cost, ③ No cross-AZ traffic, ④ Flow only through AWS backbone. It's common for a single endpoint creation to save hundreds or thousands monthly.

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-abc \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --vpc-endpoint-type Gateway \
  --route-table-ids rtb-priv-a rtb-priv-b
```

> 🔍 **Deeper Dive**: Creating Gateway Endpoint automatically adds an entry like `Destination: pl-78a54011, Target: vpce-1a2b3c4d` to the route table. `pl-xxx` is a prefix list — AWS-managed IP range collection, an abstraction combining all S3 or DynamoDB regional endpoint IPs. When AWS adds new IP ranges, the prefix list auto-updates and routing auto-reflects. This mechanism mirrors BGP prefix aggregation concepts.

### Interface Endpoint — Putting Private IP on ENI

Interface Endpoint is a different approach. **Create ENI in subnet and assign private IP**. That ENI acts as the AWS service's private endpoint. No route table modification; DNS resolution lets instances calling service domain (e.g., `ssm.ap-northeast-2.amazonaws.com`) resolve to the endpoint's private IP.

**Private DNS** option is key. When enabled, AWS auto-registers Route 53 Private Hosted Zone so standard service domains resolve to the endpoint's private IP. When disabled, you must call the endpoint's unique DNS name (e.g., `vpce-xxx.ssm.ap-northeast-2.vpce.amazonaws.com`) directly — code changes required. Usually Private DNS is enabled as standard.

Supported services are overwhelmingly many — SSM, SNS, SQS, CloudWatch Logs, Lambda, ECR, KMS, Secrets Manager, etc. Essentially all AWS services. Cost: $0.01/hour per endpoint (proportional to available AZs) + $0.01/GB. Per-GB cheaper than NAT GW ($0.045 vs $0.01), but fixed hourly charge means NAT GW might actually be cheaper for low-traffic scenarios.

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-abc \
  --service-name com.amazonaws.ap-northeast-2.ssm \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-priv-a subnet-priv-b \
  --security-group-ids sg-endpoint \
  --private-dns-enabled
```

### SSM Session Manager — Standard Setup for Private Environments

To use SSM Session Manager in a private VPC (Internet blocked), you need **three Interface Endpoints**. This is an exam favorite.

| Endpoint | Role |
|----------|------|
| `com.amazonaws.{region}.ssm` | SSM API calls (Session start/end) |
| `com.amazonaws.{region}.ssmmessages` | Session Manager's bidirectional message channel |
| `com.amazonaws.{region}.ec2messages` | SSM Agent ↔ Service communication (legacy channel) |

Three are needed because SSM's internal architecture separates into three channels. Operators often fall into the trap of creating `ssm` only and stopping — Session won't open. Add `ecr.api` and `ecr.dkr` if pulling container images from ECR, and `logs` for CloudWatch Logs sending. Private environment endpoint lists typically grow to 5-10.

> 💡 **Related Theory**: Interface Endpoint's private DNS works by auto-creating Route 53 Private Hosted Zone. So both VPC's `enableDnsHostnames` and `enableDnsSupport` must be on — the exact use of those two toggles from Day 1 lives here. Manually creating a new VPC leaves `enableDnsHostnames` off by default, causing the common incident of creating Interface Endpoint but DNS resolution failing — effectively unusable. New VPC creation should reflexively enable both.

## PrivateLink — B2B SaaS's Internet Bypass

PrivateLink extends the same mechanism (Interface Endpoint) to **expose company services**. After launch in 2017, it became the standard pattern for B2B SaaS and multi-account environments.

Configuration consists of three components:

```
[Provider Account / VPC]
  ┌─────────────────────────┐
  │  NLB (front of service) │
  │     │                    │
  │     ▼                    │
  │  Endpoint Service        │ ← Register with AWS (vpce-svc-xxx)
  │  Allowed Principals:     │ ← Which accounts allowed
  │    arn:...:111122223333  │
  │    arn:...:222233334444  │
  └──────────┬──────────────┘
             │ AWS Backbone
  ┌──────────┴──────────────┐
  ▼                          ▼
[Consumer A VPC]      [Consumer B VPC]
  Interface Endpoint    Interface Endpoint
  (private IP)          (private IP)
  Auto Private DNS
```

Each part:

1. **NLB**: Front of company services (usually backend microservice cluster). PrivateLink supports NLB only — not ALB (ALB support started 2023 but exam basis is NLB).
2. **Endpoint Service**: Register NLB as VPC Endpoint Service. Identifier `vpce-svc-xxx` is issued.
3. **Allowed Principals**: Whitelist which AWS accounts/IAM users can connect to this endpoint.
4. **Consumer VPC Endpoint**: Create Interface Endpoint in customer account, set `service-name` to `vpce-svc-xxx`. Communicate directly with NLB via private IP.

### Why NLB Only — Not ALB?

When PrivateLink initially launched with NLB-only support, the reason was **connection isolation**. ALB is L7 reverse proxy performing TLS termination, header modification, path routing — the ALB is the connection's endpoint. Traffic reaching ALB becomes a new connection from provider's ALB IP to backend.

NLB is closer to L4 pass-through, preserving client IP (more explicit with Proxy Protocol option). PrivateLink's core value is "consumer calls provider's service using its own private IP," and this model aligns more naturally with L4 NLB. ALB support was added in 2023, but NLB remains standard.

### VPC Peering vs PrivateLink — What's Different?

Both are "communicating with another VPC," but models are completely different:

| Item | VPC Peering | PrivateLink |
|------|-------------|-------------|
| Exposure unit | Entire VPC (all instances) | Single service (behind NLB) |
| Routing | Modify both route tables | DNS-based, no routing changes |
| CIDR conflict | **Connection impossible if conflicts** | Irrelevant (each has private IP) |
| Direction | Bidirectional (both can initiate) | Unidirectional (Consumer → Provider only) |
| Use case | Same company multi-VPC | B2B SaaS, external exposure |
| Cost | Data transfer only | Per-hour + per-GB |

PrivateLink's decisive advantage: **CIDR conflict irrelevance**. Consumer VPC `10.0.0.0/16`, Provider VPC also `10.0.0.0/16` — works fine. Consumer calls endpoint's private IP (allocated from its subnet) without needing to know Provider's CIDR. B2B SaaS can't control hundreds of customers' VPC CIDRs, so this trait is decisive.

> 📚 **Case Study**: Large SaaS like Snowflake, MongoDB Atlas, Confluent Cloud all connect customer VPCs via PrivateLink. Previously they either accessed via Internet or used VPC Peering per customer — the latter required CIDR conflict negotiation per customer, making operations hellish. Post-PrivateLink, "create one Endpoint Service, add customer account ID to whitelist" became standard. As of 2024, the PrivateLink catalog lists thousands of services (AWS Marketplace SaaS integration standard).

## Endpoint Policy — Final Safety Net

Both Gateway and Interface Endpoints have **Endpoint Policy**. Same JSON format as IAM Policy, but restricts "which API calls are possible through this endpoint."

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": ["arn:aws:s3:::my-app-bucket/*"],
    "Condition": {
      "StringEquals": {"aws:PrincipalAccount": "123456789012"}
    }
  }]
}
```

This policy's effect: Through this endpoint, only objects in `my-app-bucket` accessible, only with our account's credentials. Other accounts' buckets or other permissions auto-denied. Powerful tool for data exfiltration prevention.

Operational pattern: ① Default Endpoint Policy is very open: `"Effect":"Allow","Action":"*","Resource":"*"`, ② If company policy requires "prevent sending data to S3 buckets outside our account," add endpoint policy with `aws:PrincipalAccount` or `s3:ResourceAccount` condition, ③ Bucket Policy's `aws:SourceVpce` condition enables reverse direction (permit access from specific endpoint only).

> ⚠️ **Trap**: Endpoint Policy is an **additional constraint layered on top of IAM Policy**. IAM allows + Endpoint Policy allows = pass. IAM denies, Endpoint Policy allows = still denied. So Endpoint Policy can't grant permissions lacking in IAM. Exam trap: choosing "Endpoint Policy grants IAM-absent permissions" as answer.

## Cost Reduction Priority — Order to Cut NAT GW Bills

When NAT GW costs spike in operations, check in this order:

1. **S3/DynamoDB traffic going through NAT GW?** → Add Gateway Endpoint (free). Usually 30-70% immediate savings.
2. **ECR traffic (container image pulling) through NAT GW?** → ECR Interface Endpoint (`ecr.api`, `ecr.dkr`) + S3 Gateway Endpoint (for layer downloads). Often large but easily overlooked.
3. **CloudWatch Logs ingest through NAT GW?** → Add `logs` Interface Endpoint.
4. **SSM/Secrets Manager calls** → Add respective Interface Endpoint.
5. **External SaaS calls (large data)** → Check if PrivateLink available, if not, accept as NAT traffic.

The ECR trap is especially common. Container images typically 100MB-1GB; cluster of 100 pulling same image generates 100GB NAT traffic. ECR Interface Endpoint ($0.01/hour) immediately saves costs.

> 🔍 **Deeper Dive**: ECR image pull traffic splits in two parts. Metadata (manifest) via ECR API, actual image layers from S3. So creating ECR Interface Endpoint only without S3 Gateway Endpoint means layer download traffic still goes through NAT GW. Create both for complete bypass. AWS official documentation states "ECR Endpoint requires S3 Endpoint too," but operators frequently miss this.

## Comparison with Other Clouds

| Item | AWS | GCP | Azure |
|------|-----|-----|-------|
| Private instance external communication | NAT Gateway | Cloud NAT | NAT Gateway |
| AWS service private connection | VPC Endpoint (Gateway + Interface) | Private Google Access + PSC | Private Endpoint |
| Company service external exposure | PrivateLink | Private Service Connect | Private Link Service |
| Free endpoint | S3, DynamoDB | None | None |

GCP's Private Service Connect and Azure's Private Link Service use nearly identical PrivateLink model, showing AWS PrivateLink became industry standard. Difference: AWS alone provides free Gateway Endpoint for S3/DynamoDB — since traffic share is so overwhelming, cost policy difference directly translates to operational cost difference.

## Summary

Three ways VPC meets outside — NAT Gateway, VPC Endpoint, PrivateLink — determined by traffic destination. External Internet → NAT GW; AWS services → Endpoint; other VPC/account services → PrivateLink. Choosing wrong lets NAT GW handle everything, multiplying costs 10x.

Three absolute principles: ① **One NAT GW per AZ**, route to same AZ, ② **Bypass S3/DynamoDB with Gateway Endpoint** (free), ③ **SSM private environment needs 3 Interface Endpoints**. These three appear most frequently in both exams and operations.

Next, we'll see the bigger picture connecting multiple VPCs and on-premises — Transit Gateway, VPN, Direct Connect, Route 53. Having solved single-VPC external communication, next is "how to operate multiple VPCs as one network."

---

## 📝 Practice Problems

**Problem 1.** EC2 in private subnet sends large data to S3 and DynamoDB, NAT GW costs spike. Most appropriate solution?

A) Add more NAT GW capacity
B) Add Gateway Endpoint (S3/DDB only, free)
C) Switch to NAT Instance
D) Bypass with VPN

**Answer: B**

Explanation: Gateway Endpoint supports only S3 and DynamoDB — free option. Traffic flows only through AWS backbone, bypassing NAT GW — zero hourly cost, zero per-GB processing cost. Single endpoint creation often saves hundreds or thousands monthly in high-traffic environments. More NAT GW just spends more cost; NAT Instance adds operational burden without saving NAT itself. VPN unsuitable for S3 access. Gateway Endpoint with Endpoint Policy also restricts reachable buckets, strengthening security.

---

**Problem 2.** You need SSM Session Manager in private VPC (Internet blocked). Required setup?

A) Add NAT GW
B) Three Interface Endpoints: ssm, ssmmessages, ec2messages
C) One Gateway Endpoint
D) VPC Peering to another VPC

**Answer: B**

Explanation: SSM Session Manager uses all three channels — ssm (API calls), ssmmessages (bidirectional messaging), ec2messages (SSM Agent communication). All three must be Interface type (PrivateLink) for Session normal operation. Creating only ssm and seeing Session won't open is common trap. Gateway Endpoint supports S3/DDB only, unusable for SSM. Private environment sending CloudWatch Logs output requires `logs` endpoint too; ECR image pulling requires `ecr.api` + `ecr.dkr` + S3 Gateway Endpoint — private environment endpoint lists typically grow to 5-10.

---

**Problem 3.** Configure external communication for multi-AZ private subnets with high availability?

A) One NAT GW in one AZ, shared by all AZs
B) One NAT GW per AZ, each AZ's private route table points to its own AZ's NAT
C) One NAT Instance + manual failover
D) Internet Gateway alone sufficient

**Answer: B**

Explanation: NAT GW is AZ-bound. Single AZ placement causes two problems: ① That AZ failure cuts external communication for other AZs too (multi-AZ principle violated), ② Cross-AZ traffic incurs additional $0.01/GB charge. Standard: one NAT GW per AZ + separate route tables per AZ pointing to own AZ NAT — solves both availability and cost. Single NAT GW with multi-AZ routing is the most common anti-pattern.

---

**Problem 4.** B2B SaaS company needs to expose service to customer VPCs without Internet, customer CIDR ranges vary with some overlapping your own. Which technology?

A) VPC Peering (CIDR conflict is problem)
B) AWS PrivateLink: NLB + Endpoint Service + Consumer Endpoint
C) Transit Gateway sharing
D) Site-to-Site VPN per customer

**Answer: B**

Explanation: PrivateLink is precise use case. ① CIDR conflict irrelevant — Consumer calls its private IP endpoint; needn't know Provider's CIDR. ② No Internet exposure — only AWS backbone communication. ③ Whitelist per customer (Allowed Principals) for access control. Snowflake, MongoDB Atlas, Confluent Cloud all use same pattern. VPC Peering fails on CIDR conflicts; TGW same issue. VPN requires router config negotiation per customer — unrealistic for SaaS scale.

---

**Problem 5.** Created NAT Instance but external traffic forwarding fails. Most common cause?

A) Damaged AMI
B) Source/Destination Check enabled — must be disabled
C) Security Group blocking
D) Public IP not assigned

**Answer: B**

Explanation: Classic NAT Instance trap. EC2's default behavior: "reject packets where it's not src/dst," but NAT forwards other instances' (private subnet instances') packets through itself to outside. So Source/Destination Check must be disabled. `aws ec2 modify-instance-attribute --instance-id i-xxx --no-source-dest-check`. NAT GW is AWS-managed so this setting is handled internally; operators never worry about it.

---

**Problem 6.** Company policy requires "EC2 in VPC access only company-owned S3 buckets, never external account buckets." Which tool enforces this?

A) Security Group to restrict S3 IPs
B) Gateway Endpoint + Endpoint Policy with `aws:PrincipalAccount` or `s3:ResourceAccount` condition
C) NAT GW Policy
D) NACL S3 deny

**Answer: B**

Explanation: Endpoint Policy adds extra constraints to API calls through endpoint. `aws:PrincipalAccount=123456789012` condition permits only our account credentials, or `s3:ResourceAccount=123456789012` permits only our account's owned resources. SG is IP-based, impractical for dynamic-IP services like S3. NAT GW has no Policy concept. NACL IP deny also impractical for S3. Endpoint Policy layers on top of IAM Policy — "must have IAM permission AND match endpoint policy to pass" — powerful data exfiltration prevention safety net.

---

**Problem 7.** ECR container image pulling spikes NAT GW costs. Most complete solution?

A) Add ECR Interface Endpoint only
B) Add **both ECR Interface Endpoint (`ecr.api`, `ecr.dkr`) AND S3 Gateway Endpoint**
C) Replace NAT GW with larger bandwidth
D) Switch to ECS Fargate

**Answer: B**

Explanation: ECR image pull splits into two parts — manifest via ECR API (`ecr.api`), actual image layer data from **S3**. Creating only ECR Interface Endpoint without S3 Gateway Endpoint bypasses manifest but actual layer traffic (most bytes) still goes through NAT GW. AWS official docs state "ECR Endpoint requires S3 Endpoint too" but frequently overlooked. In container environments, this combination is one of largest NAT GW cost reduction effects.

---
