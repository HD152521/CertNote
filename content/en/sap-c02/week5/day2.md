# Day 2 - 7 Route 53 Routing Policies: DNS Determines Architecture

If you only know DNS as "converting domain names to IPs," you understand less than half of Route 53. AWS designed Route 53 not as a simple DNS resolver but as a **traffic routing engine**. The 7 routing policies each use different algorithms to decide which endpoint to respond with. In SAP-C02, if you can't precisely distinguish these 7 types, you make mistakes like choosing Geolocation for "closest region" problems or Latency for "country-based isolation" problems.

Today we understand **why each policy works the way it does—at the level of internal algorithms and DNS protocol**—and complete the reasoning for scenario judgment.

## DNS Protocol Fundamentals: The Layer Route 53 Operates On

Route 53 acts as **Authoritative DNS**. When a user enters `app.example.com`:

1. User OS → queries **Recursive Resolver** (ISP or Google 8.8.8.8)
2. Recursive Resolver → traces NS (Name Server) records → reaches **Route 53 Name Server**
3. Route 53 evaluates routing policy → returns IP
4. Recursive Resolver → caches result during TTL → returns to user

The critical point here: **Route 53's routing policies aren't real-time due to Recursive Resolver caching.** With 300-second TTL, the same IP gets cached for 5 minutes. Even if you switch failover policies, clients continue using the old IP until TTL expires. This is the fundamental limitation of DNS-based failover.

> 💡 **Related Theory**: DNS TTL optimization is a "stability vs speed of change" trade-off. Long TTL (3600 seconds) reduces query volume and improves cache efficiency, but record changes propagate slowly. Short TTL (10 seconds) allows fast changes but causes frequent queries from all clients, increasing cost and latency. If failover is anticipated, maintain low TTL during normal operation (60~120 seconds) or use RFC 8767's recommended two-step strategy: "lower TTL before urgent changes, then raise it back afterward."

> 🔍 **Deeper Dive**: Route 53 supports EDNS0 Client Subnet (ECS, RFC 7871). Standard DNS queries only transmit Recursive Resolver IP, but ECS tells Route 53 the actual client's subnet (/24 or /32). This foundation enables Latency-Based Routing and Geolocation to determine actual user location more accurately. However, not all Recursive Resolvers support ECS, so it's not 100% accurate.

## 7 Routing Policies: Algorithm-Level Understanding

### 1. Simple (Simple)

Most basic. One record returns one or multiple IPs. When multiple IPs are entered, Route 53 returns them in random order. Health Check not available (standalone).

**When**: Single endpoint, no health check needed, no load balancing required.

### 2. Weighted (Weighted)

Create multiple records with the same name, each assigned **weight (0~255)**. Each time a request arrives, returns IPs at weight ratio. Example: record A (weight=90) + B (weight=10) → 90%:10% ratio.

**Internal Algorithm**: Calculate total weight sum, draw random number in 0~sum range, return record matching interval. weight=0 receives no traffic (but allows blocking without deleting record).

**When**: A/B testing, canary deployment, Blue/Green traffic switching.

> ⚠️ **Pitfall**: Weighted routing is not "exact ratio." Clients that cache DNS responses continue to the same IP during TTL, so actual server traffic ratio may differ from configuration weight. For precise traffic distribution, use ALB Target Group Weight or API Gateway Stage Variable for more precision.

### 3. Latency-Based Routing (LBR)

Route 53 manages a **latency database across multiple regions**. Based on Recursive Resolver location (or client location with ECS), determines which AWS region has least delay and returns that region's record.

**Critical Misconception Correction**: LBR is based on **measured network latency**, not geographic distance. Singapore, physically farther than Tokyo, might be faster. Route 53 periodically updates its own latency measurement data for routing decisions.

**When**: Automatically route global users to fastest region, no data sovereignty constraints.

### 4. Failover (Failover)

Create two records, Primary and Secondary, connect Health Checks. When Primary fails, automatically switch to Secondary. Core of Active-Passive DR.

**Health Check Integration**: Route 53 Health Check continuously polls Primary. When failure threshold is exceeded (default 3 consecutive failures), marks Unhealthy and starts returning Secondary IP.

**Failover Speed Calculation**: Health Check interval 30 seconds × failure threshold 3 = maximum 90 seconds before switch starts. With 60-second TTL, DNS propagation takes maximum 90+60=150 seconds (2.5 minutes).

> 💡 **Related Theory**: TCP SYN-based Health Check vs HTTP Health Check. HTTP checks status code, detecting application-layer failures (non-200 OK responses). TCP only checks port connection success, potentially false-positive if app dies but TCP stack lives. Critical systems must use HTTP(S) Health Check + response body validation (String Match).

### 5. Geolocation (Geolocation)

Routes based on user's **country or continent**. Rules like "Korean users → Seoul region, German users → Ireland region."

**Key Difference from LBR**:
- LBR: "What's fastest?" (performance-based)
- Geolocation: "Which country?" (location-based)

If a Korean user uses VPN appearing as US IP, LBR sends to US region, but Geolocation can still classify as Korea (ECS-based actual location).

**Default Record Required**: If no Default record for unmapped countries, returns NXDOMAIN.

**When**: GDPR and other data sovereignty, region-specific content/language differences, regulations permitting only specific regions.

### 6. Geoproximity (Geoproximity)

Routes based on geographic distance but adds **bias** to arbitrarily adjust boundaries. Available only in Traffic Flow.

- Bias +50: expand routing boundary for that region (more users routed here)
- Bias -50: shrink boundary

**When**: Adjust geographic distribution more flexibly than Geolocation's "country-unit" boundaries. Example: adjust Seoul-Tokyo boundary by latitude with bias.

> ⚠️ **Pitfall**: Geoproximity requires Traffic Flow; can't be configured without it. Traffic Flow adds monthly billing. In exams, if "most cost-efficient geographic routing," Geolocation works without Traffic Flow.

### 7. Multi-Value Answer (Multi-Value Answer)

Returns up to 8 IPs, with Health Check attached to each. Unhealthy IPs automatically excluded from responses.

**Difference from Simple**: Simple always returns all IPs (including Unhealthy), Multi-Value returns only Healthy IPs.
**Difference from ELB**: Multi-Value is DNS-level distribution, ELB is connection-level distribution. Multi-Value provides simple distribution without load balancer.

**When**: Distribute multiple EC2 IPs without ELB and still need health checks. Legacy systems with "no ELB" constraint.

## 7 Policies Comparison: Instant Scenario Judgment

| Routing Policy | Decision Basis | Health Check | Representative Scenario |
|-----------|---------|------------|------------|
| Simple | None (simple return) | ❌ | Single endpoint |
| Weighted | Weight ratio | ✅ | Canary, A/B testing |
| Latency-Based | Measured latency | ✅ | Global performance optimal |
| Failover | Primary/Secondary Health | ✅ | DR Active-Passive |
| Geolocation | Country/continent | ✅ | Data sovereignty, region-specific content |
| Geoproximity | Geographic distance + Bias | ✅ | Fine geographic boundary adjustment |
| Multi-Value | Multiple IPs (Healthy only) | ✅ | Multiple distribution without ELB |

> 🎯 **Scenario**: "Company operates ap-northeast-2 and us-east-1, wants East Asia users in Seoul and North America users in Virginia. However, by regulation, Korean user data must exist only in Seoul." — Answer: Geolocation. Reason: LBR is performance-based, so even Korean users might route to us-east-1 if momentarily faster, violating data sovereignty. Geolocation ensures Korean IPs always route to Seoul, guaranteeing data sovereignty.

## Alias vs CNAME: apex domain problem

DNS standard (RFC 1034) forbids using CNAME records at Zone Apex (root domain, e.g., `example.com`). Zone Apex must have SOA and NS records, but CNAME overrides all that domain's records to point to alias target.

AWS created **Alias records** to circumvent this restriction. Alias is AWS-specific functionality outside DNS standards.

| Item | Alias | CNAME |
|-----|-------|-------|
| Zone Apex usage | ✅ | ❌ (RFC forbidden) |
| Pointing to AWS resource | ✅ free query | ❌ (CNAME possible, but not at apex) |
| Target | ALB, CloudFront, S3 Website, API GW, GA, etc. | Any domain |
| TTL | AWS auto-manages | User-configured |
| Health Check evaluation | ✅ EvaluateTargetHealth | ❌ |

Set `EvaluateTargetHealth=true` to automatically skip Alias records when ALB or CloudFront is unhealthy. Used with Failover policy, Route 53 can detect ALB-level failures.

> 💡 **Related Theory**: RFC 2181 forbids adding other records to records that contain CNAME ("CNAME and other data"). Zone Apex must have NS and SOA, so CNAME at apex breaks the entire domain. AWS Alias internally treats this as A record, allowing apex to point to ALB without violating standards.

## Health Check 4 Types: Algorithms and Usage

### Endpoint Health Check

Polls directly via HTTP/HTTPS/TCP. Configuration options:
- **Interval**: 10 seconds (fast, additional cost) or 30 seconds (default)
- **Failure threshold**: 1~10 (default 3)
- **String matching**: Check specific string in first 5,120 bytes of response body

Route 53 Health Check **polls simultaneously from ~10 PoPs worldwide**. When 18% fail (~3 PoPs), marks Unhealthy. Distributed judgment, not single point of failure, so more accurate for regional network failures.

### Calculated Health Check

Combines multiple Health Checks via AND/OR logic. Example: "Healthy only if all three are Healthy: DB Health Check AND App Health Check AND CDN Health Check."

Use when expressing complex service dependencies. Can bundle up to 255 Health Checks into one Calculated.

### CloudWatch Alarm Health Check

Route 53 indirectly judges status of resources it can't poll directly (example: RDS in VPC Private Subnet). When CloudWatch Metric Alarm enters ALARM state, Health Check also becomes Unhealthy.

### Route 53 ARC Routing Control

Manual on/off switch. Engineers directly switch via console or API. Core component of ARC explained earlier.

> 📚 **Case Study**: 2021 Fastly CDN global outage. Single configuration error downed 85% of Fastly edges for ~1 hour. After this incident, many organizations began configuring Route 53 Failover as backup for direct CDN origin access. Pattern: CloudFront Origin Failover + Route 53 Failover layered so CDN failure serves directly from Origin. Lesson: single global CDN is also a failure point.

## Route 53 Resolver: Hybrid DNS Architecture

When connecting on-premises and AWS VPC via Direct Connect or VPN, DNS resolution becomes complex. On-premises DNS server (`corp.example.com`) and AWS Private Hosted Zone (`internal.example.com`) must resolve each other's domains.

```
On-Premises DNS              AWS VPC
corp.example.com ──────────────► Route 53 Private Hosted Zone
                                  internal.example.com

Route 53 Resolver
  ├── Inbound Endpoint: on-premises→AWS (corp DNS forwards)
  └── Outbound Endpoint: AWS→on-premises (VPC DNS forwards)
      └── Resolver Rule: corp.example.com → on-premises DNS IP
```

**Inbound Endpoint**: When on-premises DNS server needs to resolve certain AWS domains, forwards query to Route 53 Resolver's Inbound Endpoint IP. Route 53 responds.

**Outbound Endpoint**: When EC2 in VPC needs to resolve on-premises domains, Resolver Rule sets "forward this domain to on-premises DNS IP."

> 🔍 **Deeper Dive**: DNS in VPC defaults to +2 address of VPC CIDR (e.g., 10.0.0.2). This is Route 53 Resolver's default endpoint. Outbound Endpoint redefines this resolver for specific domains. Can stack multiple Resolver Rules in one VPC; most specific domain matching rule takes precedence.

## Route 53 DNS Firewall: DNS-Layer Security

DNS Firewall filters outbound DNS queries within VPC. Blocks connections to malicious domains (C2 servers, phishing sites) **at DNS stage**. Unlike traditional IDS/IPS blocking at packet level, DNS Firewall blocks the domain name itself.

**Operation**: EC2 or Lambda queries `malware.example.com` → DNS Firewall Rule Group checks domain in blocklist → returns NXDOMAIN or Redirect response → connection blocked before attempt.

**Managed Domain List**: AWS-managed threat intelligence-based domain list (auto-updated).

> 💡 **Related Theory**: DNS over HTTPS (DoH, RFC 8484) and DNS over TLS (DoT, RFC 7858) encrypt DNS queries preventing intermediate observation. But in enterprise environments, this encryption bypasses DNS Firewall, becoming an issue. AWS DNS Firewall operates on VPC's port 53 by default, so apps forced to use DoH/DoT can circumvent DNS Firewall. Additional security: use VPC Security Group or Network Firewall to restrict 443 (DoH)/853 (DoT) ports to specific DNS servers.

## Architecture Diagram: Layered Global Routing

```
User (Seoul)
    │ query app.example.com
    ▼
Recursive Resolver (KT DNS)
    │ includes ECS subnet
    ▼
Route 53 Authoritative
    │
    ├── Geolocation: Korea → ap-northeast-2 record selection
    │     ├── Failover Primary: ALB-Seoul (Health OK)
    │     └── Failover Secondary: S3 Static (backup page)
    │
    └── Geolocation: Default → us-east-1 record
          └── Weighted: 95% v1 + 5% v2 (canary)

Route 53 Health Check (10-second interval)
    └── Endpoint: ALB-Seoul /health → check 200 OK
         └── String Match: "healthy"

Route 53 Resolver (within VPC)
    ├── Inbound: on-premises → resolve internal.example.com
    └── Outbound Rule: corp.example.com → 192.168.1.53 (on-premises DNS)
```

> 🎯 **Scenario**: A global SaaS company operates multi-region Active-Active. "Korean users must use only ap-northeast-2 by regulation, other users select closest region, with automatic failover during regional failure. Canary deployment also required." — Configuration: Korea → Geolocation(ap-northeast-2), others → Geolocation Default → LBR. Weighted canary within each region. Failover attached to each record.

## Private Hosted Zone Design

Private Hosted Zone resolves only within VPC. Not visible on the internet.

**Multiple VPC Sharing**: Connect multiple VPCs in same account or different accounts to one Private Hosted Zone. Manage `rds.internal.example.com` for DB endpoint across multiple environments (dev/stage/prod VPCs).

**Cross-Account Sharing**: Share Resolver Rules to different accounts via RAM (Resource Access Manager), or configure cross-account DNS via VPC Peering + Private Hosted Zone connection.

> 📚 **Case Study**: Airbnb's DNS-based service discovery (2016). Airbnb used Route 53 Private Hosted Zone as service registry, accessing each microservice via domain like `search-service.internal.airbnb.com`. When service moved from EC2 to ECS, IPs changed but domain persisted, requiring no code changes in other services. Lesson: DNS is a simple, powerful service discovery layer.

## Traffic Flow: GUI for Complex Routing

Route 53 Traffic Flow is a visual editor combining multiple routing policies in tree structure. Makes complex rules like three-level nesting "Geolocation → Latency → Failover" easier via GUI with version management.

| Use Traffic Flow | Use Routing Policies Directly |
|---------------------|----------------------|
| Need Geoproximity policy | Single policy sufficient |
| Multiple policies nested | Simple scenario |
| Policy version management, rollback | Infrequent changes |

Cost: $50/month per Traffic Flow policy record. Use only for complex configurations.

## 📝 연습 문제

**문제 1.** A global media company deploying a new API version initially sends only 5% of total traffic to new version. Old version 95%, new version 5%. Which routing policy is most suitable?

A) Latency-Based Routing
B) Failover
C) Weighted (95:5)
D) Geolocation

**정답: C**
해설: Traffic ratio-based distribution = Weighted. Set old version weight=95, new version weight=5. LBR is performance-based, Failover is Primary/Secondary, Geolocation is region-based—none match this scenario.

---

**문제 2.** By GDPR regulation, EU user data must store only in eu-west-1. Korean user data must store only in ap-northeast-2. Which routing policy most accurately fulfills this requirement?

A) Latency-Based Routing
B) Geolocation
C) Geoproximity
D) Multi-Value

**정답: B**
해설: Geolocation routes based on user country/continent, guaranteeing data sovereignty. LBR is performance-based; EU users might route to us-east-1 if momentarily faster, violating sovereignty. Geoproximity requires Traffic Flow + bias adjustment, not country boundaries.

---

**문제 3.** Connect ALB to `example.com` (Zone Apex). Which record type is suitable?

A) CNAME example.com → ALB DNS
B) A record Alias: example.com → ALB
C) MX record
D) AAAA record (IPv6)

**정답: B**
해설: RFC 1034 forbids CNAME at Zone Apex. AWS Alias A record circumvents DNS standard to point ALB at apex. Alias makes Route 53 internally resolve ALB DNS as A record response, supporting EvaluateTargetHealth.

---

**문제 4.** On-premises Active Directory DNS server manages `corp.example.com` domain. EC2 in AWS VPC must resolve on-premises domains (e.g., `db.corp.example.com`). Which configuration is needed?

A) Route 53 Inbound Endpoint
B) Route 53 Outbound Endpoint + Resolver Rule
C) Create Public Hosted Zone
D) VPN + Route 53 Failover

**정답: B**
해설: AWS → on-premises DNS resolution direction = Outbound Endpoint. Set Resolver Rule with `corp.example.com → on-premises DNS IP`; VPC EC2 queries for that domain forward to on-premises DNS. Inbound Endpoint is reverse direction (on-prem→AWS).

---

**문제 5.** Combine multiple Health Checks (DB Check, App Check, CDN Check individually) so that any single failure triggers full failover. Which Health Check type?

A) Endpoint Health Check (individually)
B) Calculated Health Check (AND condition)
C) CloudWatch Alarm Health Check
D) ARC Routing Control

**정답: B**
해설: Combining multiple Health Checks via AND/OR logic = Calculated Health Check. All three Healthy = Healthy (AND); any failure = Unhealthy, triggering failover. Endpoint checks only single endpoint.

---

**문제 6.** A company wants to distribute multiple EC2 instance IPs (6 total) via Route 53 without Load Balancer. Unhealthy instances should automatically exclude from traffic. Which policy is suitable?

A) Simple (return all IPs)
B) Weighted (each IP equal weight)
C) Multi-Value Answer
D) Failover

**정답: C**
해설: Multi-Value Answer returns up to 8 IPs with Health Check on each, automatically excluding Unhealthy IPs. Simple returns all IPs including Unhealthy. Weighted supports Health Check but Multi-Value's multi-value return is unique.

---
