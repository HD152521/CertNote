# Day 4 - Route 53 Advanced: Health Check Algorithms, DNSSEC, Geoproximity Math, Hybrid DNS Resolver

In SAP-C02, Route 53 isn't just a "DNS service." It's the brain of global traffic routing, the link in hybrid DNS, and a security layer via DNSSEC. If Day 2 covered keyword mapping for 7 routing policies, today dissects the algorithms actually running inside—Health Check decision logic, Geoproximity Bias mathematics, Resolver endpoint internal operation. Without algorithm-level understanding when "why this policy" is questioned, you waver between similar options.

## Route 53 Health Check: 3 Types and Internal Decision Logic

Route 53 Health Check appears simple: poll endpoint, good response = Healthy, bad = Unhealthy. SAP exams question the internal algorithm.

### Endpoint Health Check

Basic type. Route 53's worldwide Health Checker locations (us-east-1, eu-west-1, ap-southeast-1, etc., ~15 regions) send direct requests to target endpoint (IP or domain).

Decision logic:
- Each Health Checker independently sends requests
- Default: if **≥18% of Health Checkers** report Healthy, overall status is Healthy
- Threshold configurable 1~10

```
Health Checker Locations (15):
us-east-1, us-west-1, us-west-2, eu-west-1, eu-west-2,
eu-west-3, eu-central-1, ap-southeast-1, ap-southeast-2,
ap-northeast-1, ap-northeast-2, ap-northeast-3,
sa-east-1, ca-central-1, ap-south-1

Default decision:
Healthy Checkers >= 3 (18% of 15) → Overall Healthy
Healthy Checkers < 3 → Overall Unhealthy
```

> 💡 **Related Theory**: Distributed Health Check design is lightweight **Byzantine Fault Tolerance**. Single monitor failure might be monitor's network issue. Quorum-based decision distinguishes "monitor fault" from "real service fault." 18% threshold marks Unhealthy only when "inaccessible from most regions," reducing false positives.

**Private Endpoint Health Check Limitation**: Route 53 Health Checkers come from public internet. Can't reach private VPC resources (private IPs, internet-disconnected instances).

Solution: **Integrate with CloudWatch Alarm**. CloudWatch collects internal metrics; Alarm state (OK/ALARM) becomes Health Check decision basis.

```
[VPC Private EC2]
    │
    │ CloudWatch Agent → CW Metric
    ▼
CloudWatch Alarm (CPU > 90% → ALARM)
    │
    ▼
Route 53 Health Check (CloudWatch Alarm integrated)
    │ ALARM = Unhealthy, OK = Healthy
    ▼
Route 53 Failover routing works
```

> ⚠️ **Pitfall**: Failover routing records without Health Check on private endpoints mean Route 53 can't judge status; Primary dying doesn't trigger failover. Private environments must use CloudWatch Alarm integration.

### Calculated Health Check (Calculated)

Combines multiple child Health Checks via logical operations to determine parent status.

```
Calculated HC (overall service decision)
    ├── HC-A: API Server (AND required)
    ├── HC-B: DB Server (AND required)
    └── HC-C: CDN Server (OR one alive is enough)

Configuration: "HC-A AND HC-B Healthy AND ≥1 HC-C Healthy → Overall Healthy"
```

**Maximum 256 child Health Checks** combinable. Supports AND/OR/NOT operations.

In SAP scenarios, Calculated Health Check maps to "only send Route 53 traffic when all tiers healthy."

> 🔍 **Deeper Dive**: Using Calculated HC enables tricks in Failover routing: "intentionally switch traffic to other region" by forcing parent HC Unhealthy. Service actually alive but disable child HC in Calculated, making parent Unhealthy triggers Route 53 Secondary switch. Planned maintenance pattern: switch traffic without downing service.

### CloudWatch Alarm Health Check

Health Checker doesn't reach endpoint directly; reads CloudWatch Alarm state (OK, ALARM, INSUFFICIENT_DATA) for judgment.

| CloudWatch Alarm State | Health Check Result |
|----------------------|------------------|
| OK | Healthy |
| ALARM | Unhealthy |
| INSUFFICIENT_DATA | Default: Healthy (configurable) |

Setting INSUFFICIENT_DATA to Unhealthy triggers failover even when CloudWatch agent dies. Conservative configuration.

## DNSSEC: RFC 4033-4035 Reality

DNSSEC (DNS Security Extensions) adds digital signature to DNS responses preventing **DNS spoofing (Cache Poisoning)**. RFC 4033 (2005) defines overall framework, RFC 4034 defines record formats, RFC 4035 defines protocol operation.

### Why DNSSEC Needed: Kaminsky Attack

2008's Dan Kaminsky-discovered DNS Cache Poisoning attack revealed fundamental DNS vulnerability. Attacker injecting forged response into DNS cache redirects users to phishing. Even HTTPS fails if DNS connects to wrong IP before certificate error.

```
Regular DNS (no DNSSEC):
Client → DNS Resolver → Authoritative NS
             ↑
             Attacker can inject forged response

DNSSEC Applied:
Client → DNS Resolver → Authoritative NS (signed response)
             Resolver validates signature → detect forgery, return SERVFAIL
```

### Route 53 DNSSEC Operation Structure

Route 53 handles two DNSSEC roles.

**1. DNSSEC Signing (Protect Hosted Zone)**

Route 53 adds signature to hosted domain's DNS records.

Components:
- **KSK (Key Signing Key)**: Top key signing zone's ZSK. Created as AWS KMS customer-managed key (CMK). Uses `ECC_NIST_P256` algorithm
- **ZSK (Zone Signing Key)**: Key signing actual DNS records (A, CNAME, etc.). Route 53 auto-manages
- **DS Record**: KSK hash registered at parent domain (domain registrar). Establish trust chain

```bash
# Enable Route 53 DNSSEC signing
aws route53 create-key-signing-key \
  --caller-reference "ksk-2026-01" \
  --hosted-zone-id Z1234567890ABC \
  --key-management-service-arn arn:aws:kms:us-east-1:111122223333:key/mrk-abc123 \
  --name "MyKSK" \
  --status ACTIVE

aws route53 enable-hosted-zone-dnssec \
  --hosted-zone-id Z1234567890ABC

# Register DS record at parent domain (via domain registrar console)
aws route53 get-dnssec \
  --hosted-zone-id Z1234567890ABC
```

> 📚 **Case Study**: 2020 Amazon Route 53 DNSSEC signing GA. AWS integrates KMS protecting KSK at HSM level. CloudTrail audits all KSK uses. Misconfiguring DNSSEC in operations (DS record registered at parent but signing disabled) makes entire domain SERVFAIL, blocking all users. Prevention: Route 53 console enforces "enable first, register DS second."

**2. DNSSEC Validation (Resolver Level)**

Route 53 Resolver validates DNSSEC signature querying external domains. Setting `DO (DNSSEC OK)` bit returns validation result as `AD (Authenticated Data)` bit.

> 💡 **Related Theory**: DNSSEC's Chain of Trust concept equals PKI certificate chains. From root DNS (IANA DNSSEC-signed) to TLD (.com, .kr) to Authoritative NS, each level's DS records validate child ZSK. Broken chain anywhere results in validation failure (BOGUS) returning SERVFAIL. "Deployed DNSSEC, some domains suddenly inaccessible" incidents stem from this.

## Geolocation vs Geoproximity: Bias Mathematics

Both policies "route based on user location" but function fundamentally differently.

### Geolocation: Rule-Based Mapping

```
Client IP → Country/Continent determination → Apply predefined mapping table

Configuration Example:
KR → ap-northeast-2 ALB
DE → eu-central-1 ALB
US → us-east-1 ALB
Default → us-east-1 ALB (all unmapped countries)
```

**Operating Principle**: Completely deterministic. Same country users always route to same endpoint. **Policy**, not performance.

Without Default record, unmapped country users receive NODATA response.

> ⚠️ **Pitfall**: Geolocation judges country by user's DNS Resolver IP. VPN users classified to VPN endpoint country. Korean user on US VPN routes to us-east-1. Performance degrades but Route 53 operates normally.

### Geoproximity: Distance + Bias Mathematics

Geoproximity routes based on **geographic distance** between user and endpoint, adjusting each endpoint's "influence radius" via **Bias** value.

```
Default (Bias = 0):
  User routes to geographically closest endpoint

Bias + (1~99): expand that endpoint's influence radius
  Bias +50 expands radius ~50%

Bias - (1~99): shrink that endpoint's influence radius
  Bias -50 shrinks radius ~50%
```

**Bias Mathematical Meaning**: Bias controls endpoint's "geographic gravity." With ap-northeast-2 (Seoul) Bias +50, even Japan East users geographically closer to ap-northeast-1 (Tokyo) might route to Seoul. Bias isn't simple distance addition/subtraction but shifts Voronoi diagram (Voronoi Diagram) boundaries.

```
No Bias (default):
──────────────────
Seoul  │  Tokyo
      │ (boundary = perpendicular bisector)

Seoul Bias +50:
────────────────────────
    Seoul     │  Tokyo
             │ (boundary shifts toward Tokyo)
```

> 💡 **Related Theory**: Voronoi Diagram (Georgy Voronoy, 1908) partitions plane into closest regions for n points. Geoproximity without Bias, multiple regions partition each user to closest—simplest Voronoi division. Bias changes each region's "center weight" shifting boundaries, creating Weighted Voronoi.

**Geoproximity Prerequisite**: Must use Route 53 **Traffic Flow**. Can't configure Geoproximity via regular record UI.

**AWS Region Endpoints vs Custom Coordinates**:
- AWS regions (ap-northeast-2, etc.) have coordinates auto-set by Route 53
- On-premises datacenters require manual latitude/longitude input

> 🔍 **Deeper Dive**: Can Geolocation and Geoproximity coexist? Mixing both policies in one Hosted Zone isn't recommended. But real-world scenarios need "mostly Geoproximity (distance-based optimization), force specific countries Geolocation (data sovereignty)." Can build composite policy in Traffic Flow with Geolocation evaluated first, falling through to Geoproximity if unmapped.

## Route 53 Resolver: Hybrid DNS Architecture

In hybrid environments connecting on-premises and AWS VPC, DNS resolution is bidirectional. Must resolve "AWS domains from on-premises" and "on-premises domains from AWS VPC." Route 53 Resolver is managed service solving bidirectionality.

### Inbound Endpoint: On-Premises → AWS Direction

On-premises DNS server needs resolve AWS domains (e.g., `app.internal.example.com`), forwards queries to Route 53 Resolver (DNS Forwarding).

```
[On-Premises Server]
    DNS Query: app.internal.example.com
        │
        ▼ (Direct Connect / VPN)
[Route 53 Resolver Inbound Endpoint]
    ENI in VPC (per-AZ IP assignment)
    Example: 10.0.1.254 (AZ-a), 10.0.2.254 (AZ-b)
        │
        ▼
[Route 53 Private Hosted Zone]
    app.internal.example.com → 10.0.5.100
        │
        ▼ Response
[On-Premises Server]
```

Inbound Endpoint configuration:
- Creates ENIs in minimum 2 AZs (high availability)
- On-premises DNS server sets conditional forwarding to these IPs

### Outbound Endpoint: AWS → On-Premises Direction

VPC EC2 needs resolve on-premises domains (e.g., `db.corp.internal`), Route 53 Resolver forwards queries to on-premises DNS.

```
[VPC EC2]
    DNS Query: db.corp.internal
        │
        ▼
[Route 53 Resolver] (default VPC DNS: 169.254.169.253)
    Check Resolver Rule:
    corp.internal → forward to on-premises DNS 10.100.0.53
        │
        ▼ (Direct Connect / VPN)
[Route 53 Resolver Outbound Endpoint]
    VPC ENI as query source
        │
        ▼
[On-Premises DNS Server 10.100.0.53]
        │
        ▼ Response
[VPC EC2] → db.corp.internal = 10.100.50.30
```

**Resolver Rule Types**:
- **Forwarding Rule**: Forward specific domain to designated DNS server
- **System Rule**: Handle AWS built-in domains (amazonaws.com, ec2.internal)
- **Recursive Rule**: Non-matching domains recursive resolve via public DNS

```bash
# Create Outbound Endpoint + Forwarding Rule
aws route53resolver create-resolver-endpoint \
  --creator-request-id "outbound-ep-2026" \
  --direction OUTBOUND \
  --security-group-ids sg-0123456789abcdef0 \
  --ip-addresses \
    SubnetId=subnet-aaa,Ip=10.0.1.100 \
    SubnetId=subnet-bbb,Ip=10.0.2.100 \
  --name "CorpDNS-Outbound"

# Forwarding Rule: corp.internal → on-premises DNS
aws route53resolver create-resolver-rule \
  --creator-request-id "rule-corp-internal" \
  --rule-type FORWARD \
  --name "forward-corp-internal" \
  --domain-name "corp.internal" \
  --target-ips Ip=10.100.0.53,Port=53 Ip=10.100.0.54,Port=53 \
  --resolver-endpoint-id rslvr-out-XXXXXXXXXX

# Associate Rule to VPC
aws route53resolver associate-resolver-rule \
  --resolver-rule-id rslvr-rr-XXXXXXXXXX \
  --vpc-id vpc-XXXXXXXXXX
```

> 📚 **Case Study**: Financial sector hybrid cloud. Major Korean financial group operates 30 AWS accounts maintaining on-premises Active Directory. AD domain (finance.corp.internal) resolvable only on-premises; AWS VPC RDS, ElastiCache endpoints resolvable only in AWS Private Hosted Zone. Combined Route 53 Resolver Inbound + Outbound Endpoint + Forwarding Rule enables bidirectional DNS. Direct Connect Transit Gateway connection ensures DNS query paths bypass internet.

> 🔍 **Deeper Dive**: Resolver Endpoint best practice creates minimum 2 AZs for high availability, but DNS queries themselves are stateless. Single AZ failure auto-switches to other AZ ENI. Outbound Endpoint's source IP is ENI-assigned private IP. On-premises firewall must add this IP to DNS (UDP/TCP 53) allowlist. Common hybrid environment incidents: DNS forwarding fails due to missing firewall rules.

## Complete Hybrid DNS Design Pattern

Recommended full-stack pattern for actual enterprise:

```
[On-Premises Active Directory DNS]
    corp.internal authority server
    ├── VPC domains (*.internal.aws) forward to Route 53 Inbound EP
    └── Others handle own recursion

[Direct Connect / VPN]

[Route 53 Resolver]
    ├── Inbound Endpoint (2 AZ): target for on-prem queries
    ├── Outbound Endpoint (2 AZ): source VPC queries to on-prem
    └── Resolver Rules:
        corp.internal → on-premises DNS IP
        (default) → public recursion

[Route 53 Private Hosted Zone]
    internal.aws (connected to VPC)
    ├── app.internal.aws → 10.0.5.100
    └── db.internal.aws → rds.ap-northeast-2.rds.amazonaws.com (CNAME)

[Route 53 Public Hosted Zone]
    example.com (internet users)
    ├── Geolocation routing
    ├── Health Check integration
    └── DNSSEC signing enabled
```

> 🎯 **Scenario**: Global manufacturer connects Seoul on-premises datacenter and AWS ap-northeast-2 (3 VPCs) via Direct Connect. Requirements: (1) On-premises Linux servers resolve AWS ECS service discovery domains. (2) AWS VPC EC2 resolve on-premises Oracle RAC (rac01.mfg.corp). (3) Internet users access via CloudFront. Design: Inbound Endpoint (on-prem→AWS), Outbound Endpoint + Forwarding Rule (AWS→on-prem), Public Hosted Zone + CloudFront (internet users). All DNS paths bypass internet via Direct Connect.

## Multi-Value Answer Advanced: Why Not ALB Alternative

Multi-Value Answer (MVA) appears load-balancing multiple IPs without ELB, but actually does client-side load balancing.

```
Client DNS Query:
app.example.com (Multi-Value Answer)
    ↓
Route 53 Response:
10.0.1.100 (Healthy)
10.0.1.101 (Healthy)
10.0.1.102 (Unhealthy — excluded)
= return up to 8 IPs (Unhealthy excluded)

Client Behavior:
Pick one IP randomly from received list → connect
```

**Why Not ALB Alternative**:
1. Client DNS cache may stick to one IP during TTL
2. No Sticky Session (session persistence)
3. No L7 features (header modification, SSL termination, path-based routing)
4. No Circuit Breaker blocking connections under server overload

MVA is "simple DNS round-robin + auto-exclude unhealthy servers." Far fewer features than ELB but lower cost and operational complexity.

> ⚠️ **Pitfall**: MVA must integrate Health Check to exclude unhealthy servers. Without Health Check, MVA returns dead server IPs. Exams: "exclude unhealthy instances + distribute multiple IPs without ELB" requires "MVA + Health Check combination."

## TTL Strategy: Lower Before Change, Raise After

Route 53 record TTL is DNS cache duration. Strategy lowering TTL before planned changes frequently appears in SAP exams.

```
Normal:
  TTL = 300 seconds (5 minutes) — reduce DNS load, high cache hit rate

24-48 Hours Before Change:
  Lower TTL → 60 seconds (wait for existing 300-second TTL expiration)

Execute Change:
  Change DNS record (IP replacement, region switch, etc.)
  → most clients receive new record within 60 seconds

After Stable:
  Restore TTL → 300 seconds
```

DR scenario: "Route 53 Failover conversion slow" usually means DNS changes without lowering TTL.

---

## 📝 연습 문제

**문제 1.** Company configured Route 53 Failover routing with Primary (us-east-1 ALB) and Secondary (us-west-2 ALB). Primary dies, Secondary should auto-switch. But ALB is inside VPC, no public IP. How configure Route 53 Health Check?

A) Route 53 Health Checker directly polls ALB DNS
B) Integrate CloudWatch Alarm (ALB Target Group Unhealthy Host Count > 0) to Health Check
C) Attach public IP to ALB, configure Health Check
D) Private ALB doesn't need Health Check

**정답: B**
해설: If ALB has internet-accessible domain, A works. But "VPC internal, no public IP" means Health Checker can't reach. CloudWatch Alarm (ALB HealthyHostCount or UnhealthyHostCount) integrated to Health Check is private endpoint standard pattern.

---

**문제 2.** Multinational firm: Korean users must process in ap-northeast-2, German users in eu-central-1 (GDPR + K-ISMS data sovereignty). Which Route 53 routing policy?

A) Latency-Based Routing (fastest region)
B) Geolocation (country-based enforce mapping)
C) Geoproximity (distance-based + Bias adjustment)
D) Weighted (50:50 distribution)

**정답: B**
해설: Data sovereignty enforces "legally permitted region," not "fastest region." Geolocation completely deterministically routes by country/continent. Latency-Based might send Korean users to Japan. Geoproximity also distance-based, unsuitable data sovereignty enforcement. Add Default record to Geolocation mapping for country-unmapped user fallback.

---

**문제 3.** Route 53 Geoproximity sets ap-northeast-2 (Seoul) Bias +50. Where does Japan East (Tokyo area) user route?

A) Always ap-northeast-1 (Tokyo) — geographically closer
B) Seoul — Bias +50 expands influence radius covering Japan East
C) Split 50:50 between regions
D) Fall back to Default record

**정답: B**
해설: Geoproximity Bias adjusts endpoint geographic influence radius. ap-northeast-2 Bias +50 increases Seoul "gravity," potentially routing adjacent Japan East users to Seoul. Reverse ap-northeast-1 Bias -50 achieves same effect. Geoproximity requires Route 53 Traffic Flow.

---

**문제 4.** Company wants enable Route 53 DNSSEC on example.com Hosted Zone. Correct enablement order?

A) Register DS record at registrar → create KSK and enable signing in Route 53
B) Create KSK and enable signing in Route 53 → register DS record at registrar
C) DNSSEC auto-completes from single Route 53 console toggle
D) DS record auto-propagates to parent domain

**정답: B**
해설: Must enable signing first in Route 53, then register DS record. Reverse order causes SERVFAIL: DS registered, validator searches signature, finds none. KSK created as KMS CMK, after `enable-hosted-zone-dnssec` check console for DS record values, manually enter at registrar. If Route 53 also registers domain, Route 53 auto-handles DS registration.

---

**문제 5.** On-premises Linux server (10.100.1.50) must resolve AWS VPC RDS private DNS (mydb.cluster-xyz.ap-northeast-2.rds.amazonaws.com). Configuration needed?

A) On-premises DNS statically enter AWS RDS IP
B) Create Route 53 Resolver Inbound Endpoint → on-premises DNS conditional-forward `.rds.amazonaws.com` domain to Inbound EP IP
C) Create Route 53 Resolver Outbound Endpoint
D) AWS can't resolve private DNS from on-premises

**정답: B**
해설: On-premises → AWS DNS resolution = Inbound Endpoint. Inbound EP creates VPC ENI; on-premises DNS conditional-forwards `.rds.amazonaws.com` domain to Inbound EP IP. On-prem server → on-prem DNS → Inbound EP → Route 53 Private Hosted Zone or AWS internal DNS → RDS private IP response. Direct Connect or VPN must exist as network path.

---

**문서 6.** Route 53 Multi-Value Answer vs ALB: which better "distribute connections per real-time server load, maintain session (Sticky Session)"?

A) Multi-Value Answer — Route 53 understands server load, distributes
B) ALB — L7 features + Sticky Session + real-time load-balancing
C) Multi-Value Answer + CloudWatch integration enables session maintenance
D) Both provide identical functionality

**정답: B**
해설: Multi-Value Answer returns multiple IPs at DNS level; client randomly picks one. Server load awareness, Sticky Session, real-time connection distribution, L7 path-based routing all ALB features. MVA is DNS-level solution "when simple distribution without ELB needed," not ALB alternative. SAP exams: both options, Sticky Session or real-time load awareness in requirements = ALB is answer.

---

**문제 7.** Company's Calculated Health Check suddenly Unhealthy. Of 3 child Health Checks: 2 Healthy, 1 Unhealthy. Calculated HC threshold set "all 3 of 3 Healthy." Service actually operating normally. What's problem?

A) Route 53 bug
B) Threshold too high — lower "3 of 3" to "3 of 2"
C) Calculated HC supports maximum 2 child HCs only
D) Manually change Unhealthy child HC to Healthy first

**정답: B**
해설: Calculated HC threshold "3 of 3" = even one child Unhealthy makes entire status Unhealthy. If service actually normal, lower threshold to "3 of 2" for quorum decision. Single Health Checker network issue can make one intermittently Unhealthy; full failover on one Unhealthy is false positive. Threshold design is critical Health Check configuration decision.

---
