# Day 1 - VPC Subnet Routing: The Path a Packet Takes to Reach the Internet

There's a moment where you launch a single EC2 instance and SSH just won't connect. You've even opened the security group to 0.0.0.0/0, and still nothing. You peer into the route table and there's no path to the internet gateway. This one-line mystery is the rite of passage everyone goes through when they first meet a VPC. A single missing route, and the entire traffic flow is blocked — this is the double edge of the determinism a VPC gets from being built on top of SDN (Software Defined Networking). "Deterministic" means "predictable," but it also means "get one line wrong and it breaks consistently."

A VPC is not simply "my virtual network." When it launched in 2009, AWS had until then offered EC2 instances only with public IPs (EC2-Classic). That is, every instance was directly exposed to the internet, and the security group was the only line of defense. VPC flipped this model, taking it toward "isolated by default; you must explicitly open things for outside communication." From December 2013, EC2-Classic was no longer offered to new accounts, and in 2022 EC2-Classic was fully retired. This transition was a fundamental change in the security model — *default deny* became the default of cloud networking, and that paradigm was transplanted directly into GCP and Azure. Today we'll draw, in one breath, the foundations of that new model — VPC, subnets, and route tables.

## VPC: An Isolated Private Network

A VPC is **a virtual network isolated at the account and region level**. You can create multiple VPCs within a region, and each VPC has its own CIDR block (IPv4 and IPv6).

| Property | Constraint |
|------|------|
| Region scope | Exists in only one region (can span multiple AZs) |
| Account isolation | No automatic communication with other accounts (needs Peering/TGW) |
| CIDR block | /16 ~ /28, up to 5 blocks by default |
| AZ distribution | Subnets are per-AZ; the VPC itself is region-scoped |
| Default limit | 5 VPCs per region (increase can be requested) |

Choosing the CIDR block really matters. Once created it's hard to change, and if the IPs overlap with another internal network or another VPC, Peering and TGW won't work. AWS recommends carving out an allocation table within the **RFC 1918 private IP ranges** (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) so that **the entire company avoids IP collisions**. 100/64 (`100.64.0.0/10`) is defined for CGNAT in RFC 6598 and is commonly used as a Pod-only secondary CIDR in AWS EKS.

> 📚 **Case study**: In 2018, a multinational company tried to merge the VPCs of two companies after an M&A, but both were using `10.0.0.0/16`, making Peering impossible. In the end it took 6 months to migrate one side's entire workload to a new CIDR. The lesson: **CIDR planning requires company-wide IP governance**. AWS launched **IPAM (IP Address Manager)** in 2021 to help with exactly this. In a similar case, during a 2019 global integration project at a large Korean enterprise, the three head-office VPCs in Korea, China, and the US were each using different `172.16.0.0/12` subnets, and communication only became possible after introducing TGW. A more recent example: in 2022 a global SaaS company faced a 6-month migration due to a Pod CIDR collision when adopting EKS — because the default VPC CNI pulls IPs from the node subnet, a `/24` subnet was exhausted before it even reached 60 nodes.

> 💡 **Related theory**: RFC 1918 (1996) is the standard that defined the private IP ranges. Before it, every IP was a public IP, and internet routing was gradually becoming saturated. RFC 1918, together with NAT (RFC 3022, 2001), is the decisive standard that extended the age of IPv4 exhaustion by more than 30 years. All private communication in an AWS VPC sits on top of this model. CIDR itself is a notation defined in RFC 4632 (2006), which resolved the inefficiency of the earlier classful (Class A/B/C) routing. CIDR notation (`10.0.0.0/16`) explicitly states the prefix length in bits, which cut router routing-table sizes by more than half, and this was the decisive invention that kept the IPv4 routing table from exploding during the internet's rapid growth in the late 1990s.

> 🔍 **Going deeper**: VPC CIDR design actually has to account for "current workloads + expansion over the next 5 years + the possibility of acquiring another company." Large organizations use a *hierarchical IPAM* approach that carves up the entire `10.0.0.0/8` in 4-bit chunks and allocates them to regions, environments, and teams. For example: `10.0.0.0/12` = us-east-1, `10.16.0.0/12` = eu-west-1, and within each region again allocate `/16`s per environment. This way you write fewer prefixes into route tables (summarization is possible), and IP collisions are automatically avoided when issuing new VPCs. AWS IPAM automates this hierarchical model.

> ⚠️ **Pitfall**: A VPC CIDR *cannot be shrunk* once created. It *can be expanded* by adding up to 4 secondary CIDRs, but you can't change the primary. That's why the standard is to grab a `/16` (65,536 IPs) up front, and a small VPC like a `/24` will quickly leave you full of regret once you adopt EKS. Also, `198.18.0.0/15` (RFC 2544 benchmarking) and `169.254.0.0/16` (link-local) are used internally by AWS, so you can't use them as a VPC CIDR.

## Subnets: IP Slices Inside an AZ

A subnet is a smaller slice of a VPC's CIDR, and it is **always bound to a single AZ**. A subnet cannot span two AZs — this is why the AZ is the fundamental unit of isolation. For the same reason, an ELB appears to "select AZs" rather than "select subnets," but internally it binds one subnet per AZ.

```
VPC: 10.0.0.0/16  (65,536 IPs)
 ├── Subnet A: 10.0.1.0/24 (AZ-a, Public)   — 256 IPs
 ├── Subnet B: 10.0.2.0/24 (AZ-b, Public)
 ├── Subnet C: 10.0.11.0/24 (AZ-a, Private)
 ├── Subnet D: 10.0.12.0/24 (AZ-b, Private)
 └── Subnet E: 10.0.21.0/24 (AZ-a, DB)
```

Of each subnet's IPs, AWS reserves 5.

| IP | Purpose |
|----|------|
| `.0` | Network address |
| `.1` | VPC router |
| `.2` | DNS server (`VpcCidr + 2`) |
| `.3` | Reserved for future use |
| `.255` | Broadcast (not used) |

So a `/24` subnet can actually allocate only 256 - 5 = 251 IPs. In environments where EKS nodes create an ENI per Pod, these IPs are exhausted quickly, so you either grab a larger subnet like a `/22` or use Custom CNI mode (secondary CIDR + Pod-only subnet).

> 🔍 **Going deeper**: That `.2` is the VPC DNS resolver comes up often on the exam; precisely, it's `VpcCidr.AmazonProvidedDNS` (e.g., `10.0.0.2`). This DNS resolver is simultaneously reachable at 169.254.169.253 (a link-local IP), and both point to the same backend. If you create a Route 53 Resolver Inbound/Outbound Endpoint, you can forward this resolver bidirectionally with on-premises DNS. And that `.3` has been "reserved for future use" in the same state for nearly a decade; it's understood that AWS left room to introduce features like IPv4 multicast down the road.

> 💡 **Related theory**: Subnet mask arithmetic was first defined in RFC 950 (1985), and evolved into variable-length prefixes with CIDR (Classless Inter-Domain Routing) in RFC 1519 (1993). VPC subnet division follows this standard directly. Memorize subnet sizing as `2^(32-prefix) - 5` (5 AWS reservations) and it's fast on the exam. `/28`=11, `/27`=27, `/26`=59, `/25`=123, `/24`=251, `/23`=507, `/22`=1019, `/21`=2043, `/20`=4091, `/16`=65,531.

### Public vs Private Subnets

There is no explicit "Public subnet" toggle. **A subnet is Public if its route table has a path to the IGW (`0.0.0.0/0 → igw-xxxx`).** That's all. Also, the instance must have a **Public IP** (or EIP) attached for inbound traffic to reach it from outside.

```
Conditions for a Public subnet:
1. Route table: 0.0.0.0/0 → IGW
2. Public IP or EIP on the instance
3. SG/NACL allow
```

All three must be satisfied to communicate with the outside. If even one is missing, it won't work. When troubleshooting, this 3-item checklist is the fastest diagnosis.

> ⚠️ **Pitfall**: It's easy to mistakenly believe there's a separate "Public subnet" object, but that's only how the AWS console UI displays it; in reality it's determined by the combination of the IGW route in the route table + the instance's Public IP. On the exam, a question like "how do you change a Public subnet to Private via route table changes?" comes up, and the answer is "change the default route (`0.0.0.0/0`) to a NAT GW." However, the Public IP of an already-running instance won't change, so to truly isolate it you must also release the EIP and turn off Auto-assign Public IP.

> 📚 **Case study**: In 2020, a US SaaS company placed its production DB in a subnet named "Private" and believed it was safe, but it turned out the route table contained an IGW route, so it was effectively Public. Because auto-assign Public IP was off, it wasn't directly visible from outside, but a temporary EC2 that received an auto Public IP during debugging created a 5-minute window of external exposure. The lesson: **the route table, not the name, is the truth**. The AWS Config Rule `subnet-auto-assign-public-ip-disabled` automatically detects mistakes like this.

## Route Tables: The Fork in the Packet's Road

A route table is a mapping that defines "for a packet headed to a given destination CIDR, which gateway to send it to." Each subnet is associated with exactly one route table, and if there's no explicit association it uses the VPC's **main route table**.

```
Destination          Target
10.0.0.0/16          local              ← inside the VPC (automatic, cannot delete)
0.0.0.0/0            igw-xxxxx          ← Public subnet
0.0.0.0/0            nat-xxxxx          ← Private subnet (via NAT)
10.1.0.0/16          pcx-xxxxx          ← VPC Peering
172.16.0.0/12        tgw-xxxxx          ← Transit Gateway
0.0.0.0/0            vgw-xxxxx          ← Site-to-Site VPN
```

The **Longest Prefix Match** rule applies. The more specific (longer prefix) route wins. For example, if both `10.0.0.0/8 → tgw-xx` and `10.0.5.0/24 → nat-xx` exist at once, the `/24` wins.

> 🔍 **Going deeper**: Longest Prefix Match is a universal algorithm of IP routing, and inside a router it's usually implemented with a **Patricia Trie** or **Multibit Trie** data structure. Since the AWS VPC router operates on top of SDN (Software-Defined Network), it has no hardware constraints like the TCAM of a physical router, but there is a limit of 50 routes per route table (1000 on request). If you need too many prefixes, you either split routing domains with a Transit Gateway or bundle them into a single entry using a prefix list. The VPC data plane is implemented in a distributed fashion on top of the AWS Nitro System, and the routing decision mapped to each ENI is handled directly on the host node (it's called the Mapping Service). Parts of this Mapping Service were revealed in the 2017 SIGCOMM paper "A retrospective on the design of Amazon's Virtual Private Cloud," which shows how AWS layers hundreds of thousands of VPCs on top of a single physical network.

> 💡 **Related theory**: VPC routing is not BGP. **Static routing** is the default, and BGP appears only through Transit Gateway / Direct Connect / VPN. The advantages of static routing are simplicity and determinism; the disadvantage is that there's no automatic failover — if the NAT GW in the route table dies, packets simply vanish. This is why the NAT high-availability pattern (per-AZ NAT) is needed. BGP is defined in RFC 4271 and is the de facto standard protocol of internet routing, but it was deliberately kept out of the VPC interior — because in the SDN model a central controller decides routing. GCP's VPC similarly has a global control plane decide routing, while Azure VNet uses a more traditional route-table model.

> 📚 **Case study**: In 2020, a SaaS company ran with only a Single-AZ NAT Gateway, and when that AZ hit an outage, outbound was blocked for all Private subnets. The ALB was alive, but the backend couldn't reach external APIs (Stripe, Twilio), and payments failed for 30 minutes. As a follow-up, they standardized on per-AZ NAT GWs + per-AZ route tables. This pattern is the exam's correct answer for "NAT high availability." Also, the 2021 Fastly CDN outage that affected a large part of the global internet for an hour was caused not by BGP but by *a single line in a VCL configuration file*, again showing that "determinism of routing and configuration" is a double-edged sword.

> ⚠️ **Pitfall**: The `local` route cannot be deleted, and its priority is *always highest*. That is, an IP inside the VPC CIDR cannot be diverted to any other target. So a workload that lives in the same VPC but that you want to isolate must be split into a separate VPC or blocked with SG/NACL. For the same reason, a PrivateLink endpoint that has an IP inside the VPC CIDR could tangle routing, so AWS runs a conflict check when creating the endpoint.

## Default VPC vs a VPC You Build Yourself

A new AWS account gets a **default VPC** auto-created in each region. It has a Public subnet in every AZ, an internet gateway attached, and instances automatically receive a Public IP. It's good for quick experiments but dangerous for production — because all subnets are Public, a security group mistake becomes immediate internet exposure.

The practical standard is to use **a VPC you build yourself**. Many organizations delete the default VPC or prohibit its use via an SCP. One of Control Tower's guardrails being "Disallow internet access through the default VPC" is for the same reason.

> ⚠️ **Pitfall**: "The difference between a default VPC and a custom VPC" comes up often on the exam. Core point: in a default VPC every subnet is Public, while in a custom VPC everything is Private and isolated until explicitly configured. Also, once you delete a default VPC you can't recreate it from the console and must request it from AWS Support. You can't recreate it via the AWS CLI either, and `aws ec2 create-default-vpc` only works under limited conditions.

> 📚 **Case study**: In 2019, a startup running an API server in a default VPC accidentally opened port 22 to `0.0.0.0/0` in the SG, and within 5 minutes was detected by scanning bots and subjected to a brute-force SSH attack. The incident hit within the first 30 minutes of production, and the post-mortem conclusion was "we shouldn't have used the default VPC." The same accident recurs repeatedly in GCP and Azure default VPC/VNets.

## VPC and IPv6

IPv6 is increasingly becoming standard in AWS. AWS auto-assigns a `/56` block, or you can bring your own BYOIP. In IPv6, **every address is globally unique**, so NAT is unnecessary. Instead, you use an **Egress-Only Internet Gateway** (an IGW that allows only outbound).

```
IPv4 Private:  Instance → NAT GW → IGW → Internet
IPv6:          Instance → Egress-Only IGW → Internet (reverse blocked)
```

> 🔍 **Going deeper**: NAT disappearing in IPv6 isn't a technical advance — it's the original design philosophy of IPv6. IPv4 NAT is an address-scarcity workaround, not a security mechanism. People mistake "NAT for security" because inbound happens to be blocked, but real security is handled by the firewall (SG/NACL). The Egress-Only IGW is ultimately just a stateful firewall. That IPv6 achieves the same security level without NAT is a core design principle of IPv6 (RFC 4864, "Local Network Protection for IPv6"). That said, because it's harder for operators to statically manage IPv6 addresses, IPv6 NPT (Network Prefix Translation, RFC 6296) was proposed, but AWS didn't adopt it.

> 💡 **Related theory**: The side effects NAT had on internet architecture were catalogued in RFC 2663 (1999). It broke the end-to-end principle (Saltzer, Reed, Clark 1984), made bidirectional communication asymmetric, and made P2P protocol design difficult. IPv6's abolition of NAT is a return to that principle. Still, from an operational standpoint IPv6 adoption remains slow, because many operators misperceived NAT as a security layer. As of 2023 the global IPv6 adoption rate is about 45% (Google's statistics), and the share of AWS internal workloads using IPv6 is estimated at around 20%. From 2024, AWS began charging $0.005 per hour for new Public IPv4 addresses, and this is becoming economic pressure that accelerates IPv6 adoption.

> ⚠️ **Pitfall**: An IPv6-only subnet is *incompatible with some AWS services themselves*. RDS only began supporting IPv6 endpoints in 2024, and some third-party SaaS still have no IPv6 endpoint. So the reality is that the standard is running *dual-stack* (IPv4 + IPv6) and migrating gradually. AWS also recommends starting with dual-stack.

## CIDR Design Patterns

AWS's **standard 3-Tier VPC pattern**:

```
VPC: 10.0.0.0/16

AZ-a:
  Public  10.0.0.0/24    (Bastion, ALB, NAT GW)
  Private 10.0.10.0/24   (App, ECS, Lambda VPC ENI)
  DB      10.0.20.0/24   (RDS, ElastiCache)

AZ-b:
  Public  10.0.1.0/24
  Private 10.0.11.0/24
  DB      10.0.21.0/24

AZ-c:
  Public  10.0.2.0/24
  Private 10.0.12.0/24
  DB      10.0.22.0/24
```

The key points are **use 3 or more AZs**, **separate subnets by tier**, and **absolutely block internet access for the DB tier**. This 3-tier pattern is a standard recommendation of the W-AF Reliability/Security Pillar and is the background topology of nearly every SAA scenario question. Larger organizations sometimes extend it to 4-tier (Public / App / Data / Management).

> 🔍 **Going deeper**: The 3-tier architecture itself originated in the *Multi-tier Application Architecture* of the late 1990s. It's a model that physically separates Presentation (web) / Application (business logic) / Data into three layers so each layer's scaling and security are independent. VPC subnet design is exactly this architecture carried over into network isolation. The same model is expressed as NetworkPolicy in Kubernetes and as mTLS + AuthorizationPolicy in service meshes (Istio, Linkerd). In cloud-native environments, *namespace per environment + NetworkPolicy* implements the same isolation more granularly.

> 💡 **Related theory**: This pattern is a direct implementation of *Defense in Depth* (NSA Information Assurance). External → ALB → App → DB — even if one layer is breached, the next layer blocks. The same principle touches the "No read up, no write down" of the *Bell-LaPadula Model* (military security, 1973). In the cloud, you allow only one direction — external internet → Public (L7 firewall) → Private (app) → DB — and block the DB from going out to the public internet directly (e.g., NACL outbound block).

## Hands-On: Creating a VPC

```bash
# 1) Create the VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=prod}]'

# 2) Create a subnet (AZ-a Public)
aws ec2 create-subnet --vpc-id vpc-xxx --cidr-block 10.0.0.0/24 \
  --availability-zone ap-northeast-2a

# 3) Create and attach an Internet Gateway
aws ec2 create-internet-gateway
aws ec2 attach-internet-gateway --vpc-id vpc-xxx --internet-gateway-id igw-xxx

# 4) Create a Public Route Table + add a route
aws ec2 create-route-table --vpc-id vpc-xxx
aws ec2 create-route --route-table-id rtb-xxx \
  --destination-cidr-block 0.0.0.0/0 --gateway-id igw-xxx

# 5) Associate the subnet ↔ route table
aws ec2 associate-route-table --subnet-id subnet-xxx --route-table-id rtb-xxx
```

These 5 steps are the minimum condition for "EC2 being reachable over SSH." If even one step is missing, packets are blocked. In practice, you codify this into CloudFormation or Terraform/CDK and deploy it in one shot. Also, because not all steps are idempotent (e.g., attaching an already-attached IGW again errors out), you should always manage state through IaC in production.

## Wrapping Up

A VPC is isolation, a subnet is an IP slice bound to an AZ, and a route table is the fork in the packet's road. The difference between Public and Private ultimately comes down to nothing more than whether the route table has an IGW route. Once this one line is lodged in your head, the next article's NAT Gateway and Bastion Host follow naturally. When solving VPC scenarios on the exam, the fast order is to first recall "what entry must exist in the route table," and only then look at SG and NACL. This routing-first way of thinking is also the fastest diagnostic path in real-world troubleshooting — when tracing "where did the packet stop," look in the order routing → gateway → NACL → SG → instance OS firewall, and 95% of cases are solved within 5 minutes.

---

## 📝 연습 문제

**문제 1.** You launched an EC2 in a new subnet but it has no internet. The SG is fully open. What should you check first?

A) IAM Role permissions
B) Whether the route table has a `0.0.0.0/0 → igw-xxx` route and whether a Public IP is assigned to the instance
C) The S3 Endpoint
D) DNS server settings

**정답: B**
해설: Check which of the 3 conditions for a Public subnet (IGW route, Public IP, SG/NACL) is missing. Even with the SG open, if there's no routing the packet itself can't leave. The diagnostic order is always the five steps "routing → Public IP → SG → NACL → DNS." VPC Reachability Analyzer automates this diagnosis for you.

---

**문제 2.** How many IPs in a `/24` subnet can actually be assigned to instances?

A) 256
B) 254
C) 251
D) 255

**정답: C**
해설: 256 minus AWS's 5 reserved (`.0`, `.1`, `.2`, `.3`, `.255`) equals 251. This differs from a normal network's -2 (network/broadcast). Workloads like EKS and Fargate create many ENIs and thus need larger subnets. Numbers worth memorizing: `/28`=11, `/27`=27, `/26`=59, `/25`=123, `/24`=251.

---

**문제 3.** Which statement about the relationship between a VPC and a subnet is correct?

A) A subnet can span multiple AZs
B) A VPC can span multiple regions
C) A subnet is bound to a single AZ
D) Subnets within the same VPC cannot route to each other

**정답: C**
해설: Subnet = AZ is the fundamental unit of isolation. A VPC is region-scoped. Subnets within the same VPC route automatically (`local`). This `local` route cannot be deleted — isolation inside a VPC is only possible via SG/NACL. So "completely isolating two subnets within the same VPC" is impossible via routing and requires SG/NACL or a separate VPC.

---

**문제 4.** A route table has these two routes: `10.0.0.0/16 → local`, `10.0.5.0/24 → pcx-abc`. Where does a packet destined for `10.0.5.10` go?

A) To local
B) To the Peering Connection
C) It's dropped
D) To the IGW

**정답: A**
해설: This is a trick question. In theory LPM says the `/24` should win, but **the VPC's internal CIDR (`local`) always takes priority**. If `10.0.5.0/24` is inside the VPC CIDR (`10.0.0.0/16`), `local` wins. That's why an IP inside the same VPC cannot be diverted to another target. This is exactly why "isolation inside the same VPC is done with SG/NACL, not routing." Only if `pcx-abc`'s destination were outside the VPC CIDR would LPM then apply.

---

**문제 5.** Why do you use an Egress-Only Internet Gateway?

A) To replace IPv4 NAT
B) To allow only outbound for IPv6 instances while blocking inbound
C) To replace a VPN gateway
D) For private S3 access

**정답: B**
해설: IPv6 has no NAT, so EIGW is used when you want outbound-only. It acts as a firewall that policy-enforces the inbound block. The "Local Network Protection for IPv6" principle of RFC 4864 is the theoretical backdrop of this scenario. EIGW doesn't apply to IPv4 instances, so for those you still use a NAT GW.

---

**문제 6.** A company wants to merge two VPCs after an M&A, but both are `10.0.0.0/16`. What is the most appropriate approach?

A) Just connect them with VPC Peering
B) Migrate one VPC to a new CIDR, then use Peering or TGW
C) Just add a Transit Gateway
D) Resolve the IP conflict with a NAT Gateway

**정답: B**
해설: Overlapping CIDRs can't be routed via Peering/TGW. It's a cost created by the absence of IP governance. Adopting IPAM is the after-the-fact answer. In reality, migration cost is so high that it's common to use a temporary workaround exposing only some services via PrivateLink. Another workaround is placing a NAT instance in between and disguising the CIDR with SNAT, but it's operationally complex and rarely used.

---

**문제 7.** In EKS, Pods consume ENIs and exhaust subnet IPs. What is the most appropriate action?

A) Change to a smaller subnet
B) Expand the subnet to `/22` or apply Custom CNI mode
C) Add a NAT Gateway
D) Issue more EIPs

**정답: B**
해설: EKS's default VPC CNI uses a Secondary IP per Pod ENI, so IP consumption is heavy. The standard fix is to enlarge the subnet or use the Custom Networking pattern that separately allocates a Pod-only CIDR (e.g., CGNAT 100.64.0.0/10). Larger clusters can also be solved with IPv6 mode (IP per Pod) or prefix delegation. The *prefix delegation* feature launched in 2021 assigns a `/28` prefix per ENI instead of an IP, increasing the number of usable Pod IPs per node by 16x.
