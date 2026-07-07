# Day 3 - The Anatomy of a VPC: What Route Tables Really Decide

If a VPC was a "box inside a box" at the SAA level, at the Pro level it is **a distributed system where six decision points operate simultaneously**. If you write down every decision point a single packet passes through as it flows from EC2 to S3, it looks like this.

```
[EC2 ENI] → [Security Group OUT] → [NACL OUT (subnet)] → [Route Table]
        → [IGW/NAT GW/VPC Endpoint] → [transit path]
        → [destination NACL IN] → [destination SG IN] → [arrival]
```

If the packet is blocked at any one of these 8 stages, it disappears. And SGs are stateful, NACLs are stateless, and route tables follow longest prefix match — you have to run all of these rules in your head at the same time. Today we unfold the SAA-level VPC picture one more time, but pinpoint exactly **where the Pro exam traps come from**.

## CIDR Design: Draw It Wrong Once and Regret It Forever

The first decision in a VPC is the CIDR block. AWS supports `/16` through `/28` and recommends RFC 1918 private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). But **if you draw this wrong, it will collide a year later when you try to merge with another VPC**.

| VPC CIDR | Available IPs | Suitable Scale |
|----------|------------|-----------|
| /16 | 65,536 | Large-enterprise single-region standard |
| /20 | 4,096 | Mid-sized company |
| /24 | 256 | Small scale or dev/test |
| /28 | 16 | Exam/experimentation |

> ⚠️ **Trap**: A company uses `10.0.0.0/16` for its headquarters VPC and then also assigns `10.0.0.0/16` to its overseas branch VPC. The moment they later try to merge them with Transit Gateway, routing becomes impossible due to the CIDR conflict. AWS **refuses Peering and TGW attachments outright when there is CIDR overlap**. That's why in Pro multi-account scenarios the correct answer is to manage the company-wide CIDR pool with **IPAM (IP Address Manager, launched in 2021)** from the very start.

> 🔍 **Deeper dive**: In an AWS VPC, each subnet reserves 5 IPs. For example, in a `10.0.1.0/24` subnet, the number of usable IPs is 256 - 5 = 251. Reserved IPs: `10.0.1.0` (network), `10.0.1.1` (VPC router), `10.0.1.2` (VPC DNS), `10.0.1.3` (reserved for future use), `10.0.1.255` (broadcast). If you don't know this and calculate "I can launch 16 EC2 instances in a /28 subnet," in reality only 11 are possible and you get an unexpected failure.

### Secondary CIDRs and the Egress-Only IGW

A VPC can additionally attach up to 4 **secondary CIDRs** (added in 2017). However, a secondary is only possible within the same RFC 1918 range as the primary, and is typically used to expand when IPs run short.

IPv6 is a separate track. AWS allocates a free `/56` IPv6 block to every VPC, but IPv6 traffic does not go through a NAT Gateway — it goes through an **Egress-Only Internet Gateway** (NAT was originally a mechanism to solve IPv4 address scarcity, so it's unnecessary for IPv6).

## The True Identity of a Subnet: AZ Affinity and 1:1 Route Table Mapping

A subnet is **bound to a single AZ** and has one route table attached. Multiple subnets can share the same route table, but one subnet cannot have two route tables.

```
VPC (10.0.0.0/16)
├── ap-northeast-2a
│   ├── Public Subnet  10.0.1.0/24  → Route Table: PublicRT
│   └── Private Subnet 10.0.11.0/24 → Route Table: PrivateRT-A
├── ap-northeast-2b
│   ├── Public Subnet  10.0.2.0/24  → Route Table: PublicRT
│   └── Private Subnet 10.0.12.0/24 → Route Table: PrivateRT-B
└── ap-northeast-2c
    ├── Public Subnet  10.0.3.0/24  → Route Table: PublicRT
    └── Private Subnet 10.0.13.0/24 → Route Table: PrivateRT-C
```

The distinction between a Public Subnet and a Private Subnet is not a separate toggle in the console — it is simply **whether the route table points to an IGW or a NAT GW**.

| Type | Definition | Used for |
|------|------|--------|
| Public | Route table has `0.0.0.0/0 → IGW` | ELB, NAT GW, Bastion |
| Private | `0.0.0.0/0 → NAT GW` or no route | EC2 App, DB |
| Isolated | No external route (VPC-internal only) | Stricter DBs, ML training |

> 💡 **Related theory**: Route tables operate on the **longest prefix match** algorithm. If two routes exist for the same packet destination, the more specific prefix (longer mask) wins. Example: with `10.0.0.0/16 → VPC local` + `10.0.5.0/24 → TGW`, a packet for `10.0.5.10` goes to the TGW. This is the fundamental principle of internet routing protocols like BGP and IS-IS, and AWS route tables follow the same principle.

### Per-AZ Separation: NAT Gateways Are AZ-local

A commonly missed trap. **A NAT Gateway is an AZ-local resource**, so the proper approach is to place one per AZ. If you route every Private Subnet to a single AZ's NAT Gateway, all outbound traffic is cut off when that AZ goes down.

```
✗ Wrong design:
   Private Subnet A → NAT GW (AZ-a)
   Private Subnet B → NAT GW (AZ-a)  ← If AZ-a dies, B's outbound is also cut
   Private Subnet C → NAT GW (AZ-a)

✓ Correct design:
   Private Subnet A → NAT GW (AZ-a)
   Private Subnet B → NAT GW (AZ-b)
   Private Subnet C → NAT GW (AZ-c)
```

> 📚 **Case study**: In 2017, a fintech startup ran production with only a single-AZ NAT Gateway. One night, a power outage in AZ-a killed the NAT Gateway, cutting off all external API calls (Stripe, Twilio, etc.) from every Private Subnet. The EC2 instances in the same AZ couldn't fail over automatically either, resulting in 30 minutes of downtime. They then switched to per-AZ NAT Gateways + Multi-AZ ASG. Operating costs went up by $0.045/hour × 3 AZs = an additional $97.2/month — negligible compared to the cost of downtime.

## Security Group vs NACL: The Two Most Frequently Confused

| Item | Security Group | NACL (Network ACL) |
|------|----------------|---------------------|
| Scope | ENI (instance) | Subnet |
| State | **Stateful** (return traffic auto-allowed) | **Stateless** (must be explicit both ways) |
| Evaluation | All rules evaluated, allow only | Numbered order, allow/deny |
| Default behavior | inbound deny, outbound allow | inbound deny, outbound deny |
| Rule count | 60 inbound + 60 outbound (expandable) | 20 in + 20 out (soft limit up to 40) |

The most frequently confused point is **stateful vs stateless**. SG being stateful means the return of a packet that came inbound is automatically allowed without checking outbound rules. Conversely, NACLs are stateless, so return traffic must also be explicitly allowed in the outbound rules.

```
[Client] → TCP SYN  → [EC2:80]
[Client] ← TCP SYN-ACK ← [EC2:80]   ← SG: auto-allowed, NACL: outbound 1024-65535 must be explicit
[Client] → TCP ACK  → [EC2:80]
```

> 🔍 **Deeper dive**: The NACL return port range is the **ephemeral port** range. Linux uses 32768–60999 and Windows uses 49152–65535, but AWS recommends the safe full range of **1024-65535**. If the NACL outbound only allows 80 and 443, the return SYN-ACK arrives on an ephemeral port and gets blocked — this is a common cause of the "the SG is fine but packets aren't going through" phenomenon.

> 💡 **Related theory**: The stateful firewall is a concept first commercialized by Check Point in FireWall-1 in 1992. Traditional stateless packet filters had to inspect every packet individually, but stateful firewalls maintain a connection table keyed by the TCP 5-tuple (src IP, src port, dst IP, dst port, protocol) to automatically match return packets. AWS SGs work on the same principle. Note that the connection table consumes memory, so there is a limit to how many connections a single EC2 instance can maintain concurrently (typically hundreds of thousands).

> 🎯 **Scenario**: "An EC2 instance built from a custom AMI can't be pinged from outside. The SG has ICMP All Allow. What's the problem?" — The answer is usually (1) the NACL blocks ICMP, (2) the OS firewall (iptables/firewalld) blocks it, or (3) 169.254.169.254 going to instance metadata rejects ICMP (a security feature). A missing NACL rule is the most common.

## VPC Endpoints: The Two Branches of Private Traffic

By default, going from EC2 to S3 traverses the internet (IGW). Even for S3 in the same region, going through the IGW means (1) cost, (2) security risk, (3) increased latency. So you create a private path with a **VPC Endpoint**.

| Type | Communication method | Supported services | Cost |
|------|-----------|-------------|------|
| Gateway Endpoint | Route table entry | S3, DynamoDB only | Free |
| Interface Endpoint | ENI + DNS | 100+ AWS services | $0.01/hour + data |
| Gateway Load Balancer Endpoint | GLB + ENI | Security appliances | $0.0125/hour + data |

> 🔍 **Deeper dive**: A Gateway Endpoint adds a special routing entry called a **prefix list** to the route table. It is expressed like `pl-12345` and internally auto-tracks and updates all IP ranges for S3 and DynamoDB. An Interface Endpoint, by contrast, uses the **PrivateLink** mechanism to create an ENI directly in the VPC, and AWS automatically hijacks DNS with a Route 53 Private Hosted Zone (answering `s3.ap-northeast-2.amazonaws.com` with the ENI IP).

> 📚 **Case study**: A financial firm discovered that all EC2 → S3 traffic was leaving via the IGW. Monthly data transfer costs exceeded $30,000. After adding a Gateway Endpoint, the same traffic became free. It also resolved the issue where the security team had been flagged in PCI-DSS audits because "S3 traffic traversed the internet." Trade-off: Interface Endpoints (100+ services) have an hourly cost, so with low traffic, IGW + NAT can be cheaper. The break-even point is typically 100–200 GB per month.

### PrivateLink and VPC Endpoint Services

PrivateLink is a feature to "expose a service I built to other VPCs." If you put a service behind an NLB and register it as an Endpoint Service, other accounts and VPCs can access it via an Interface Endpoint. It is **the standard way for SaaS companies to make their service usable inside customer VPCs**.

```
[Provider VPC]              [Consumer VPC]
  NLB → Service              Interface Endpoint
   ↑                              ↓
   └── PrivateLink ──────────────┘
```

Snowflake, Datadog, and MongoDB Atlas all connect to customer VPCs via PrivateLink.

## DNS and Hostnames: Name Resolution Inside the VPC

A VPC has two DNS options.

- `enableDnsSupport` (default true): allows use of the AWS DNS server (`x.x.x.2`) inside the VPC
- `enableDnsHostnames` (default true for default VPC): gives EC2 instances a public DNS name like `ec2-1-2-3-4.ap-northeast-2.compute.amazonaws.com`

> ⚠️ **Trap**: When you create a custom VPC, `enableDnsHostnames` defaults to false. If you don't turn it on, Private Hosted Zones (Route 53) won't work, or the automatic DNS hijack of Interface Endpoints won't work. In Pro scenarios, half of the "I created the Endpoint but EC2 still gets responses via public DNS" problems come down to this toggle.

## Flow Logs: Making Invisible Packets Visible

VPC Flow Logs record the 5-tuple and outcome (ACCEPT/REJECT) of every packet traversing an ENI. They can be delivered to CloudWatch Logs or S3.

```
2 123456789012 eni-abc 10.0.1.5 192.168.1.10 8080 443 6 20 4500 1612345678 1612345738 ACCEPT OK
^             ^         ^         ^            ^    ^   ^ ^  ^    ^          ^          ^      ^
version       account   src       dst          spt  dpt p pkt byte start      end       action status
```

> 🔍 **Deeper dive**: Flow Logs record **all traffic, not a sample**. However, they do not capture packet contents (payload) — only metadata. They also aggregate at 1-minute intervals, so it's not real-time monitoring. They're suited for post-incident security analysis and traffic pattern analysis. A prime use case is GuardDuty analyzing Flow Logs to detect anomalous traffic.

> 🎯 **Scenario**: "A company suspects abnormal outbound traffic in its production VPC. How to diagnose?" — Answer: enable Flow Logs → analyze with Athena/CloudWatch Insights → GuardDuty does automatic pattern matching. Capturing directly with tcpdump on EC2 would mean inspecting 100 instances one by one — a huge operational burden.

## SG References and Cross-VPC Communication

In SG inbound/outbound rules, you can specify the source/destination as **another SG ID instead of a CIDR**.

```
SG-Web (attached to ALB): inbound 80/443 from 0.0.0.0/0
SG-App (attached to EC2): inbound 8080 from sg-web   ← SG ID reference instead of CIDR
SG-DB  (attached to RDS): inbound 3306 from sg-app   ← chained SG reference
```

This pattern is **the standard for 3-tier architectures**. Even as EC2 instances scale up, every ENI belonging to SG-Web is automatically allowed access on 8080, so no IP management is needed.

> 📚 **Case study**: A company operated an ALB → EC2 → RDS structure with CIDR-based SGs and had to update the SGs every time EC2 IPs changed due to Auto Scaling. Switching to SG ID references eliminated the operational burden. Note that SG ID references only work within the same region and same VPC or Peered VPCs, and do not work across a TGW (some scenarios became possible in 2022, but with constraints).

## Wrapping Up

A VPC is not a "box inside a box" — it is **the cooperation of 8 decision points**. For a single packet to flow, the SG, NACL, Route Table, IGW/NAT/Endpoint, and DNS must all agree. Manage CIDR company-wide with IPAM from the first stroke, one NAT GW per AZ, Gateway Endpoints for S3 and DynamoDB, Interface Endpoints for the other 100+ services, and SG ID references for SGs — these five principles cover 80% of the VPC scenarios on the Pro exam.

In the next article we look at EC2, EBS, ELB, and Auto Scaling — the things that actually do computing on top of this network — at Pro depth. In particular, the four Auto Scaling policy types come up on nearly every exam, so etch them into your head in advance.

---

## 📝 연습 문제

**문제 1.** A company has 3 Private Subnets across Multi-AZ and calls external APIs. To minimize cost while ensuring availability, how should NAT Gateways be placed?

A) Place a single NAT Gateway in AZ-a and use it from all subnets
B) One NAT Gateway per AZ (3 total) + each Private Subnet uses the NAT in its own AZ
C) Operate NAT Instances yourself
D) Connect directly via the Internet Gateway

**정답: B**
해설: The keywords are "availability + cost minimization." A is cheaper but all outbound is cut off on an AZ failure. B adds $0.045/hour × 3 AZs = about $97/month but secures availability. C carries heavy operational burden. D violates the definition of a Private Subnet. Trade-off: to cut costs further, use a single NAT for dev environments and multi-AZ NAT only for production.

---

**문제 2.** An EC2 instance cannot connect to RDS in the same VPC. The SG allows 3306 inbound on RDS. What else should be checked?

A) The EC2 instance's outbound SG rules
B) Both NACL inbound and outbound, including ephemeral ports
C) The 0.0.0.0/0 route in the Route Table
D) Whether an Internet Gateway is attached

**정답: B**
해설: SGs are stateful so outbound is automatically allowed, making A irrelevant. RDS is VPC-internal communication, so IGW (D) and default route (C) are irrelevant. NACLs are stateless, so ephemeral ports (1024-65535) must also be explicitly allowed outbound. Common trap: when the NACL outbound only allows 80/443, the RDS return SYN-ACK gets blocked.

---

**문제 3.** A company's S3 traffic goes through a NAT Gateway and incurs cost. The most efficient solution?

A) Add an Interface Endpoint
B) Add a Gateway Endpoint
C) Set up VPC Peering
D) Enable S3 Transfer Acceleration

**정답: B**
해설: S3 and DynamoDB get Gateway Endpoints for free. Interface Endpoints (A) are for other services and have an hourly cost. C is for VPC-to-VPC communication. D is global acceleration, not a private path. Adding a Gateway Endpoint auto-registers a prefix list in the Route Table, switching S3 traffic to a private path.

---

**문제 4.** How can a SaaS make its service usable via private IPs inside customer VPCs?

A) Cross-Region VPC Peering
B) PrivateLink + Network Load Balancer + Endpoint Service
C) Transit Gateway sharing
D) Direct Connect Public VIF

**정답: B**
해설: PrivateLink is the standard pattern: the SaaS registers its service behind an NLB as an Endpoint Service, and customers access it via Interface Endpoints. Snowflake, MongoDB Atlas, and Datadog all use this approach. A and C expose bidirectional routing, making them unsuitable for the SaaS model. D is for on-premises.

---

**문제 5.** A company wants to prevent CIDR conflicts across a 200-account environment. The most efficient method?

A) Each team decides its own CIDR
B) Manage the company-wide CIDR pool with AWS IPAM (IP Address Manager)
C) Manage CIDR allocations in an Excel sheet
D) Track CIDRs with Route 53

**정답: B**
해설: IPAM launched in 2021. Integrated with Organizations, it automatically tracks, allocates, and prevents duplication of VPC CIDRs across all accounts. C is manual management prone to mistakes. Trade-off: IPAM has an additional cost (about $0.27 per IP per month), but that's negligible compared to the cost of a CIDR conflict incident in a multi-account environment.

---

**문제 6.** A company suspects the outbound traffic of its production VPC. To trace and analyze all packets?

A) Run tcpdump on EC2
B) Send VPC Flow Logs to S3 and analyze with Athena
C) Enabling GuardDuty alone is enough
D) Trace packets with CloudTrail

**정답: B**
해설: Flow Logs record the 5-tuple and outcome for all ENIs. Analyze with SQL via S3 + Athena. A is hard to apply to 100+ instances one by one. C is pattern matching, not raw data. D traces API calls, not packets.

---

**문제 7.** What is the difference between SG ID references and CIDR references?

A) SG ID references only work within the same VPC or Peered VPCs
B) CIDR references are faster
C) No difference
D) SG ID references are only possible for inbound

**정답: A**
해설: SG ID references work within the same region in the same VPC or Peered VPCs. There are some constraints when crossing a TGW. The reason they carry less operational burden than CIDRs is that even if IPs change, the rules apply automatically as long as the SG stays the same. The standard pattern for 3-tier architectures.
