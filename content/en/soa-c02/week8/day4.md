# Day 4 - Transit Gateway, VPN, Direct Connect, Route 53 — The Big Picture of Multi-VPC and Hybrid

When a company first enters the cloud, one VPC suffices. But soon they separate dev/stage/prod, create VPCs per team, acquire companies with their own VPCs, and connect on-premises datacenters. At some point, operators must decide how 5, 20, 50 VPCs communicate. The tools they meet then are Transit Gateway, VPN, Direct Connect, Route 53.

The difficulty with these tools is that without understanding what trade-off each solves, you end up with wrong combinations. Connecting 20 VPCs with VPC Peering requires 190 connections; running operations on a single Direct Connect circuit and facing downtime from circuit failure happens somewhere every year. Route 53's 8 routing policies, similar-sounding, let operators mis-choose and accidentally route some users to a slow region. This section follows the problem each tool solves and the traps they harbor.

## Two Patterns to Connect VPCs — Mesh vs Hub-and-Spoke

Essentially two ways to connect multiple VPCs:

**Mesh topology** — Connect all VPC pairs directly with VPC Peering. N VPCs need N(N-1)/2 connections. 5 VPCs = 10 connections, 10 = 45, 20 = 190. Add one VPC and every existing N needs new connections; management burden grows quadratically.

**Hub-and-Spoke topology** — Central hub (Transit Gateway) connects every VPC once. N VPCs need N connections. Add one VPC = add one connection. All communication paths go through hub, centralizing policy there.

| Aspect | VPC Peering (Mesh) | Transit Gateway (Hub-Spoke) |
|------|--------------------|-----------------------------|
| Connection count (N VPCs) | N(N-1)/2 | N |
| Transitive | No (A↔B, B↔C exists but A→C impossible) | Yes (all reachable via hub) |
| Routing policy | Distributed per-VPC | Centralized at hub |
| Cost | Data transfer only | Per-hour attachment + data transfer |
| Bandwidth | Unlimited per VPC | 50 Gbps per TGW (per attachment) |
| Suitable scale | 2-5 VPCs | 5+ VPCs |

> 💡 **Related Theory**: Hub-and-Spoke vs Mesh trade-off is a classic 1980s telecommunications network design topic. AT&T operated US national telephone network in mesh through 1960s, switched to hub-and-spoke + dynamic routing in 1970s — connection count hitting N² became operationally unsustainable. Airlines' hub-airport model follows same thinking. AWS Transit Gateway brought this industry standard directly to the cloud. Downside: hub could become SPOF, but TGW is AZ multi-replicated so survives single-AZ failure.

### VPC Peering's Decisive Limit — Non-Transitive

The most frequent trap with VPC Peering: A↔B peering exists and B↔C peering exists, but A can't directly communicate with C. **Peering is non-transitive**. For A to communicate with C, separate A↔C peering is needed.

Why this design? Security isolation. If A peering with B automatically meant "allow communication with all B's peers," B's trust domain expands to A's. Implicit trust transitivity is a common security incident source, so AWS intentionally blocks transitivity.

Transit Gateway is the opposite. **Transitive is default**, and you block it by explicitly separating TGW Route Tables. TGW routing model decides which Route Table each attachment associates with; only routes in that table are visible. Policies like "Prod VPC communicates only with Shared Services VPC, isolated from Dev VPC" are expressed in two Route Tables.

```
TGW Route Table Configuration Example
============================
  Prod VPC ──┐
  Shared VPC ┼──── "Prod RT" (Shared only)
             │
  Dev VPC ──┴──── "Dev RT" (Shared only, Prod isolated)
```

> ⚠️ **Trap**: VPC Peering's non-transitivity is exam-frequent, but operations harbor subtler traps. Say "VPC A calls VPC B's ALB." If ALB is internal scheme, it responds with VPC B's private IP and peering works. If ALB is internet-facing, ALB's public IP embeds in response, forcing client (VPC A) to detour via Internet — peering doesn't solve it. In operations, always using internal ALB and private DNS for cross-VPC calls is the safe pattern.

## Inside Transit Gateway — Route Table and Propagation

New operators get confused: "Why multiple Route Tables, and what's the difference between Association and Propagation?"

**Attachment**: Connect VPC, VPN, Direct Connect Gateway, another TGW to TGW. Each attachment **associates** with exactly one Route Table (determines which RT's routes it sees).

**Propagation**: Which Route Tables should this attachment's routes broadcast to. An attachment can propagate to multiple Route Tables.

Separating these concepts is powerful. Example:

```
Attachment    │ Associated RT │ Propagated to RT
──────────────┼───────────────┼──────────────────
Prod VPC      │ Prod RT       │ Prod RT, Shared RT
Dev VPC       │ Dev RT        │ Dev RT, Shared RT
Shared VPC    │ Shared RT     │ Prod RT, Dev RT, Shared RT
```

Interpretation: Prod VPC sees only Prod RT routes (Shared VPC routes propagate there, Dev VPC routes absent so isolated). Shared VPC propagates to all RTs, communicating with both Prod and Dev. Dev and Prod have separate RTs with no routes to each other, so direct communication impossible.

This pattern is the most common multi-account configuration — all access Shared Services VPC (auth servers, package mirrors, monitoring), prod and dev remain isolated.

> 🔍 **Deeper Dive**: TGW uses **BGP** to exchange routing info. VPC attachment is static, but VPN/DXGW attachments receive dynamic routes via BGP. AWS-side BGP ASN defaults to 64512 (2-byte private ASN); to use 32-bit ASN, choose from 4200000000-4294967294 range. Establish BGP peer with on-premises router; both advertise their routes. One BGP operations trap: **AS path prepending** manipulates route preference — when same prefix arrives via two circuits, deliberately lengthen one to prioritize the other. Standard technique for DX-two-circuits active-active load balancing.

## VPN — Encrypted Tunnel on Internet

Site-to-Site VPN creates IPsec tunnel between on-premises router and AWS's VGW (or TGW). Uses Internet as medium but packets are encrypted for safety.

Internal structure:
- On-premises router (**Customer Gateway**, CGW) ↔ AWS **Virtual Private Gateway** (VGW) or TGW
- AWS automatically provides **two IPsec tunnels** (for HA, each endpoint in different AZ)
- Choose static routing or BGP dynamic routing

Core costs: two components — $0.05 per VPN Connection per-hour, plus data transmission (outbound) per-GB. Sufficient for small sites at tens of monthly dollars; unsuitable for large traffic.

| Aspect | VPN | Direct Connect |
|------|-----|----------------|
| Medium | Internet + IPsec | Dedicated optical cable |
| Bandwidth | About 1.25 Gbps per tunnel | 1G / 10G / 100G |
| Latency | Variable (Internet path) | Consistent, low |
| Setup | Immediate (hours) | Weeks to months |
| Cost | Cheap | Expensive (circuit + port) |
| Encryption | IPsec built-in | None (separate MACsec) |
| Use case | Temporary, small-scale, backup | Consistent performance, large-scale, SLA required |

### VPN's Single Tunnel Limit

AWS VPN single tunnel maxes around 1.25 Gbps. Two tunnels active-active give ~2.5 Gbps. Beyond that, **Multiple VPN connections + ECMP** (Equal-Cost Multi-Path) increases throughput; TGW supports ECMP so attaching multiple VPNs to TGW enables auto load balancing. Still can't match Direct Connect's 10/100 Gbps.

> 📚 **Case Study**: 2020 pandemic remote work surge hit many companies' VPN limits. AWS Client VPN (or SSL VPN layered over Site-to-Site VPN) couldn't accept users due to concurrent connection limits. AWS's answer: ECMP + scaling-out — distribute across many small connections instead of one large. Doesn't appear deep in exams but is core VPN design decision in operations.

## Direct Connect — Consistency of Dedicated Circuits

Direct Connect (DX) lays dedicated optical cable between on-premises and AWS. Bypasses Internet so latency is consistent (usually 1-5ms addition), bandwidth is consistent (SLA guaranteed), and costs efficiently for large traffic.

### Connection Types

| Type | Description | Bandwidth |
|------|------|--------|
| **Dedicated Connection** | AWS provides 1 physical circuit directly | 1G / 10G / 100G |
| **Hosted Connection** | AWS Partner splits their DX circuit and resells to customer | 50M / 100M / 200M / 300M / 400M / 500M / 1G / 2G / 5G / 10G |

Dedicated for large enterprises installing circuits directly at AWS Direct Connect Location; Hosted for SMBs through Partners (e.g., Equinix, KT, LG U+). Hosted is typical choice — faster setup and small bandwidths to start.

### Virtual Interface (VIF)

Create virtual interfaces over DX circuit. Three types:

| VIF | Purpose |
|-----|------|
| **Private VIF** | Communicate with specific VPC (attach to VGW) |
| **Public VIF** | Communicate with AWS public services (S3, DynamoDB) — essentially all public AWS endpoints |
| **Transit VIF** | Direct Connect Gateway → multiple VPCs/regions (with TGW) |

Operations standard: Transit VIF + DXGW + TGW combination. One DX circuit accesses multiple regions and VPCs.

### DX's HA — Standard Pattern Avoiding SPOF

Single DX circuit is an obvious SPOF. Backhoe-cutting optical cable happens somewhere yearly. AWS recommended HA pattern has 4 levels:

| Resilience Level | Configuration | Availability |
|------------------|------|--------|
| **Development** | Single circuit | Low |
| **High Resilience** | 2 circuits at different DX Location | Survives one location failure |
| **Maximum Resilience** | 2 circuits at 2 different locations × 2 devices = 4 circuits | Survives most single failures |
| **Hybrid** | DX + VPN backup | Auto-failover to VPN on DX failure (reduced bandwidth) |

Most operations use High Resilience (two circuits different locations) for cost-efficiency. Maximum Resilience for strict-SLA industries like finance. Hybrid pattern (DX + VPN backup) reduces circuit cost to one while VPN auto-failover on DX failure prevents downtime — just reduced bandwidth.

> ⚠️ **Trap**: Direct Connect is **not encrypted by default**. Dedicated circuit makes external eavesdropping difficult, but compliance requiring "encryption in transit" (HIPAA, some PCI areas) needs extra steps. Two options: ① **MACsec** (L2 encryption, 100G DX only), ② **VPN over Direct Connect** (layer IPsec VPN over DX). Exam trap: "DX is encrypted" as answer option.

## Route 53 — DNS and 8 Routing Policies

Route 53 isn't just DNS but a **routing policy engine**. When one domain has multiple IPs, 8 policies determine which IP to answer.

### 8 Policies At a Glance

| Policy | Decision Basis | Use Case |
|--------|-----------|-----------|
| **Simple** | Single IP (or multiple IPs in random order) | Most basic |
| **Weighted** | Weight ratio distribution | Canary deployment, A/B testing |
| **Latency-based** | AWS-measured minimum latency region | Global user optimization |
| **Geolocation** | User country/continent | Content localization, regulatory compliance |
| **Geoproximity** | Location + bias (specific region weight adjustment) | Requires Traffic Flow |
| **Failover** | Primary Health check → Secondary auto | DR failover |
| **Multivalue Answer** | Return up to 8 IPs simultaneously + Health Check | Simple LB substitute |
| **IP-based** | Client CIDR based | Different response per ISP |

Operators most confuse **Latency-based vs Geolocation**. Both seem "location-based" but differ.

- **Latency-based**: AWS-measured actual network latency minimum region. User from Korea accessing, if Tokyo region's latency happens lower at that moment, sends to Tokyo. **Performance optimization**.
- **Geolocation**: User's IP mapped to country/continent via GeoIP DB, then sent to endpoint mapped to that location. "EU users always EU region (GDPR compliance)" — **regulation & localization**.

Want performance? Latency. Want regulation? Geolocation. They often give different answers.

### Failover Routing's TTL Trap

Failover routing is simple: attach Health Check to Primary record — if Health normal, answer Primary; if abnormal, answer Secondary.

Problem: **DNS TTL cache** prevents immediate failover. If TTL is 300 seconds, clients and ISP DNS resolvers cache response max 5 minutes — Health Check catching failure immediately doesn't switch traffic for 5 minutes. DR environments standard: set TTL to 60 seconds or less.

Plus, some ISPs **violate RFC 2181 and ignore TTL**, caching longer (to reduce DNS resolver load). So "Failover is immediate" becomes "Failover is TTL + some users extra delay" model.

> 💡 **Related Theory**: DNS TTL and availability trade-off defined in RFC 1035 (1987) and RFC 2181 (1997). Short TTL gives fast propagation but increases authoritative server load; long TTL reduces load but slow change reflection. AWS circumvented this with **Global Accelerator** — advertises static IP via BGP Anycast instead of DNS, so routing change propagates in BGP updates (seconds) not DNS TTL (minutes). Failover completes in 1-2 seconds, not waiting 5 minutes. For strict DR requirements, consider Global Accelerator over Route 53 Failover.

### Three Types of Health Check

Route 53 Health Check supports three modes:

1. **Endpoint Health Check**: Monitor HTTP/HTTPS/TCP response from IP/domain. Most common.
2. **Calculated Health Check**: Combine multiple Health Checks (AND/OR). "Healthy only when both DB and cache are healthy."
3. **CloudWatch Alarm-based**: Convert CloudWatch Alarm state to Health Check. Trigger failover based on metrics (e.g., "5xx rate ≥5% = unhealthy").

Third is most flexible for operators. Can trigger failover based on ALB's 5xx metric or RDS's connection metric. Deeper health determination than simple HTTP ping.

## Route 53 Resolver — VPC and On-Premises DNS Integration

Hybrid environments need bidirectional DNS queries:

| Direction | Tool | Purpose |
|------|------|------|
| VPC → On-Premises | **Outbound Endpoint** | EC2 resolves `intranet.corp.local` |
| On-Premises → VPC | **Inbound Endpoint** | On-premises server resolves `internal.example.com` (Private Hosted Zone) |

**Outbound Endpoint** creates 2 ENIs in VPC (usually different AZs), define Resolver Rule: "specific domain forwards to on-premises DNS server." EC2 querying `intranet.corp.local`, Resolver sees rule and forwards query to on-premises DNS server beyond VPN/DX.

**Inbound Endpoint** reverses this — on-premises can query VPC's Private Hosted Zone. ENI gets private IP assigned; on-premises DNS server sets conditional forwarder to that IP.

These two concepts solve most hybrid DNS problems. Exam question "how does on-premises resolve VPC internal ALB domain?" — Inbound Endpoint is the answer.

> 🔍 **Deeper Dive**: Route 53 Resolver internally is same component as VPC's `.2` IP (AmazonProvidedDNS). That DNS resolver auto-enabling when creating VPC is actually a Route 53 Resolver instance. Adding Endpoint is essentially "expose this resolver to outside by allocating ENI." So if VPC's `enableDnsSupport` is off, Resolver Endpoint won't work.

## Multi-Region DR — Active-Active vs Active-Passive

Multi-Region availability strategy splits into two patterns:

**Active-Active Multi-Region**:
- Both regions handle operations traffic
- Latency-based Routing lets users reach nearest region
- Cost 2x (infrastructure operates both sides)
- RTO almost 0 (one region fails, other auto-handles all traffic)
- Bidirectional data replication needed (DynamoDB Global Tables, S3 Cross-Region Replication, Aurora Global Database)

**Active-Passive (DR)**:
- Primary region handles all traffic, Secondary standby
- Failover Routing + Health Check auto-switch
- Cost reduction via Pilot Light (minimal resources) or Warm Standby (reduced operations)
- RTO minutes to tens of minutes (Secondary scale-up time + DNS TTL)
- Unidirectional data replication (Primary → Secondary)

Most companies start Active-Passive due to cost. Evolve to Active-Active if SLA requires 99.99%+ or many global users. Both strategies involve Route 53 as routing component, Health Check making failover decision.

> 📚 **Case Study**: 2017 AWS S3 us-east-1 outage affected many, but Netflix barely impacted. Why? Netflix runs Multi-Region Active-Active with Route 53 + Global Accelerator combination, immediately shifting traffic to different region. Companies with single region or Active-Passive took 30 minutes-2 hours to failover, causing long downtime. Post-incident, AWS emphasized "Region-level isolation," strengthened failover automation with Route 53 Application Recovery Controller (2020 launch).

## Summary

Multi-VPC and hybrid big picture compresses to four decisions:

① **5+ VPCs = Transit Gateway**. Avoid VPC Peering's N² management burden. Route Table separation controls prod-dev isolation from hub.

② **On-premises connection decided by traffic**. Temporary, small-scale = VPN (immediate, cheap); consistent large-scale = Direct Connect (install takes time, expensive); safe HA = DX 2 circuits + VPN backup.

③ **Route 53 policy decided by intent**. Performance = Latency, regulation = Geolocation, DR = Failover. Similar-looking, different answers.

④ **DR is RTO vs cost trade-off**. Active-Active: 2x cost, RTO 0; Active-Passive: cost savings, RTO minutes. Route 53 + Global Accelerator + Multi-Region data replication: core building blocks.

Next synthesizes all Week 8 content as scenario questions. From VPC basics through multi-region DR, operator decision trees in 12 items.

---

## 📝 Practice Problems

**Problem 1.** Company operates 20 VPCs + on-premises datacenter as integrated network. Most efficient tool?

A) VPC Peering all pairs directly (190 peerings)
B) Transit Gateway central hub + VPN or Direct Connect for on-premises
C) Separate VPN per VPC
D) Direct Connect only

**Answer: B**

Explanation: 20×19/2 = 190 VPC Peerings is management hell. Add VPC = new peerings with all existing 20. TGW hub-and-spoke manages 20 attachments only, transitive routing makes all VPCs reachable. Route Table separation centralizes policy like "prod-dev isolation" at hub. On-premises connects via VPN attachment (immediate, cheap) or Direct Connect Gateway attachment (consistent, large-scale) to same TGW. Same logic as AT&T switching 1970s national telephone network from mesh to hub-and-spoke.

---

**Problem 2.** Company requires consistent 10Gbps bandwidth and low latency (<5ms) between on-premises datacenter and AWS. VPN insufficient?

A) Multiple VPNs with ECMP
B) Direct Connect (10G Dedicated or Hosted Connection)
C) Internet Gateway bandwidth upgrade
D) Multi-Region

**Answer: B**

Explanation: Single VPN tunnel maxes ~1.25Gbps and routes via Internet so latency varies. Multiple tunnels with ECMP difficult to guarantee 10Gbps consistent bandwidth and low latency SLA. Direct Connect correct answer — dedicated optical cable guarantees consistent bandwidth and latency; 1G/10G/100G options available. Installation takes weeks-months and expensive, so immediate requirements suggest temporary VPN while DX installation runs parallel.

---

**Problem 3.** Multi-Region environment, auto-route users to fastest (minimum latency) region. Which Route 53 policy?

A) Weighted
B) Latency-based Routing
C) Geolocation
D) Failover

**Answer: B**

Explanation: Latency-based answers AWS-measured minimum latency region. User from Korea, if Tokyo region's latency happens lower at that moment, sends to Tokyo — **performance optimization** purpose. Geolocation based on country/continent so latency-irrelevant (Korean user always to Korea region, even if Korea region temporarily slow) — regulation and localization use (e.g., "EU users always to EU region"). Different intent, different policies.

---

**Problem 4.** Primary region ALB down, auto-switch to Secondary region ALB?

A) Latency-based Routing
B) Failover Routing + Health Check (Health Check on Primary record)
C) Weighted Routing
D) Simple Routing + manual change

**Answer: B**

Explanation: Failover Routing's precise use case. Health Check on Primary record — if healthy, answer Primary; if unhealthy, answer Secondary. Set TTL to 60 seconds or less for fast failover (default 300 = 5 minutes cache). Some ISPs violate RFC 2181, ignoring TTL and caching longer, so "instant 100% failover" isn't guaranteed — for stricter RTO, Global Accelerator (BGP Anycast 1-2s failover) is the answer.

---

**Problem 5.** Route 53 return different IP by ISP (KT users get A, SKT users get B)?

A) Geolocation
B) IP-based Routing (CIDR-based)
C) Weighted
D) Latency

**Answer: B**

Explanation: IP-based Routing decides response by client IP CIDR match. Different ISPs have different CIDRs, so KT users match KT CIDR → answer A; SKT users match SKT CIDR → answer B. Geolocation is country/continent level, can't distinguish ISP. Relatively new feature, increasingly appearing in exams. Use cases: ① ISP-specific CDN edge separation, ② reflect telecom circuit negotiation in routing.

---

**Problem 6.** Using Direct Connect, need high availability against circuit failure. AWS recommended pattern?

A) Single DX circuit with large enough bandwidth
B) Two DX circuits at same location
C) **Two DX circuits at different locations** (or DX + VPN Hybrid backup)
D) Multi-Region

**Answer: C**

Explanation: Single DX circuit is obvious SPOF. AWS recommended HA pattern: 4 levels — Development (1), High Resilience (2 different locations), Maximum Resilience (4), Hybrid (DX + VPN backup). **Two different locations** is most cost-efficient common choice. Same location 2 circuits don't survive location-level failure. Hybrid pattern reduces circuit cost to one while VPN auto-failover prevents downtime on DX failure (just reduced bandwidth). Multi-Region addresses AWS region-level failure, different problem from DX circuit failure.

---

**Problem 7.** On-premises server resolve VPC private ALB domain (`internal.example.com`)?

A) VPC Peering
B) Route 53 Resolver Inbound Endpoint + on-premises DNS conditional forwarder
C) Public Hosted Zone registration
D) Direct Connect alone sufficient

**Answer: B**

Explanation: Hybrid DNS standard configuration. VPC's Private Hosted Zone (`internal.example.com`) resolves only inside VPC — on-premises servers can't see it. **Route 53 Resolver Inbound Endpoint** creates 2 ENIs in VPC (different AZs) exposing private IPs; on-premises DNS server conditionally forwards `internal.example.com` queries to that IP enabling VPC Private Hosted Zone resolution. Reverse direction (VPC → on-premises DNS) uses Outbound Endpoint. Exam question "how does on-premises resolve VPC internal domain" → Inbound is the answer.

---
