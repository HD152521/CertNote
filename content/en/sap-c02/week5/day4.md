# Day 4 - Route 53 Deep Dive: Health Check Algorithms, DNSSEC, Geoproximity Math, and Resolver Hybrid DNS

On the SAP-C02 exam, Route 53 is not a simple "DNS service." It is the brain of global traffic routing, the link in hybrid DNS, and even a security layer through DNSSEC. If Day 22 covered the keyword mapping of the seven routing policies, today we dissect the algorithms that actually run inside them — the Health Check decision logic, the Geoproximity Bias math, and the internal workings of Resolver endpoints. When the exam asks "why this policy," without algorithm-level understanding you waver between two similar options.

## Route 53 Health Checks: Three Types and the Internal Decision Logic

On the surface, a Route 53 Health Check is simple. Poll an endpoint; if the response is good it's Healthy, if bad it's Unhealthy. But the SAP exam asks about the internal algorithm.

### Endpoint Health Check

This is the most basic type. Requests are sent directly to the target endpoint (IP or domain) from Route 53's Health Checker locations around the world (about 15 Regions, including us-east-1, eu-west-1, ap-southeast-1).

Decision logic:
- Each Health Checker sends requests independently
- By default, if **18% or more** of the Health Checkers judge it Healthy, the overall status is aggregated as Healthy
- The threshold can be set between 1 and 10

```
Health Checker locations (15):
us-east-1, us-west-1, us-west-2, eu-west-1, eu-west-2,
eu-west-3, eu-central-1, ap-southeast-1, ap-southeast-2,
ap-northeast-1, ap-northeast-2, ap-northeast-3,
sa-east-1, ca-central-1, ap-south-1

Default decision:
Healthy Checker count >= 3 (18% of 15) → overall Healthy
Healthy Checker count < 3 → overall Unhealthy
```

The distributed Health Check design is a lightweight version of **Byzantine Fault Tolerance**. If a single monitor reports a failure, it could be a network problem with the monitor itself. Deciding by majority (quorum) lets you distinguish "monitor failure" from "actual service failure." The 18% threshold is designed to reduce false positives by judging Unhealthy only when "it is unreachable from most Regions."

**Constraint of a Private Endpoint Health Check**: Route 53 Health Checkers come from the public internet. They can't reach private resources inside a VPC (private IPs, instances not connected to the internet) directly.

The solution: **integrate with a CloudWatch Alarm**. CloudWatch collects internal metrics, and the Alarm state (OK/ALARM) is used as the Health Check's decision criterion.

```
[Private EC2 in the VPC]
    │
    │ CloudWatch Agent → CW Metric
    ▼
CloudWatch Alarm (CPU > 90% → ALARM)
    │
    ▼
Route 53 Health Check (CloudWatch Alarm integration)
    │ ALARM = Unhealthy, OK = Healthy
    ▼
Route 53 Failover routing kicks in
```

> ⚠️ **Pitfall**: If you create a Failover routing record on a Private Endpoint without a Health Check, Route 53 can't know the status, so Failover doesn't trigger even if the Primary actually dies. In a private environment you must use CloudWatch Alarm integration.

### Calculated Health Check

It combines the statuses of several child Health Checks with logical operations to determine the parent status.

```
Calculated HC (overall service decision)
    ├── HC-A: API server (AND required)
    ├── HC-B: DB server (AND required)
    └── HC-C: CDN server (OR — only one needs to be alive)

Setting: "Overall Healthy if HC-A AND HC-B are Healthy and at least 1 of HC-C is Healthy"
```

**Up to 256 child Health Checks** can be combined. AND/OR/NOT operations are supported.

In SAP scenarios, the Calculated Health Check maps to the requirement "in a multi-tier application, have Route 53 send traffic only when every tier is healthy."

With a Calculated HC, in Failover routing you can use a trick to force the parent HC to Unhealthy when you "deliberately want to shift traffic to another Region." The actual service is alive, but if you disable one child HC in the Calculated HC to make the parent Unhealthy, Route 53 switches to the Secondary. This is a pattern for shifting only the traffic during planned maintenance without taking the service down.

### CloudWatch Alarm Health Check

Instead of Health Checkers reaching the endpoint directly, it reads the CloudWatch Alarm's state (OK, ALARM, INSUFFICIENT_DATA) to decide.

| CloudWatch Alarm state | Health Check result |
|----------------------|------------------|
| OK | Healthy |
| ALARM | Unhealthy |
| INSUFFICIENT_DATA | Default: Healthy (changeable in settings) |

If you set the INSUFFICIENT_DATA state to Unhealthy, Failover also triggers when the CloudWatch agent dies. It's a more conservative setting.

## DNSSEC: The Substance of RFC 4033-4035

DNSSEC (DNS Security Extensions) is a protocol that adds digital signatures to DNS responses to prevent **DNS spoofing (cache poisoning)**. RFC 4033 (2005) defines the overall framework, RFC 4034 the record formats, and RFC 4035 the protocol operation.

### Why DNSSEC Is Needed: The Kaminsky Attack

The DNS cache poisoning attack discovered by Dan Kaminsky in 2008 exposed a fundamental vulnerability of DNS. If an attacker injects a forged response into a DNS cache server, users are redirected to a phishing site. Even with HTTPS, if the connection goes to the wrong IP at the DNS level, the connection has already started before a certificate error appears.

```
Regular DNS (no DNSSEC):
Client → DNS resolver → authoritative NS
              ↑
              attacker can inject a forged response

With DNSSEC:
Client → DNS resolver → authoritative NS (signed response)
              resolver validates the signature → SERVFAIL if forgery is detected
```

### How Route 53 DNSSEC Works

Route 53 takes on two DNSSEC roles.

**1. DNSSEC signing (protecting the hosted zone)**

It adds signatures to the DNS records of domains Route 53 hosts.

Components:
- **KSK (Key Signing Key)**: The top-level key that signs the zone's ZSK. Created with an AWS KMS customer managed key (CMK). Uses the `ECC_NIST_P256` algorithm
- **ZSK (Zone Signing Key)**: The key that signs the actual DNS records (A, CNAME, etc.). Managed automatically by Route 53
- **DS Record**: A hash of the KSK registered with the parent domain (the domain registrar). Links the chain of trust

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

# Register the DS record with the parent domain (in the domain registrar's console)
aws route53 get-dnssec \
  --hosted-zone-id Z1234567890ABC
```

Amazon Route 53 DNSSEC signing became GA in 2020. AWS integrates with KMS to protect the KSK at the hardware security module (HSM) level. Every KSK use is audited with CloudTrail. In actual operation, if DNSSEC is misconfigured (the DS record is registered with the parent but signing is disabled), the entire domain gets SERVFAIL and all users lose access. To prevent this, the Route 53 console enforces the order "enable first, then register the DS."

**2. DNSSEC validation (at the resolver level)**

The Route 53 Resolver validates DNSSEC signatures when querying external domains. If you set the `DO (DNSSEC OK)` bit, the validation result is returned in the `AD (Authenticated Data)` bit.

DNSSEC's Chain of Trust is the same concept as a PKI certificate chain. From the root DNS (signed by IANA for DNSSEC) through the TLD (.com, .kr) to the authoritative NS, each level's DS record validates the ZSK below it. If any one link in the chain breaks, validation fails (BOGUS) and SERVFAIL is returned. This is the cause of incidents like "after DNSSEC was introduced, suddenly some domains don't open."

## Geolocation vs Geoproximity: The Bias Math

Both policies are "routing based on user location," but they work fundamentally differently.

### Geolocation: Rule-Based Mapping

```
Client IP → determine country/continent → apply a predefined mapping table

Configuration example:
KR → ap-northeast-2 ALB
DE → eu-central-1 ALB
US → us-east-1 ALB
Default → us-east-1 ALB (all countries without a mapping)
```

**Operating principle**: Fully deterministic. Users in the same country always go to the same endpoint. It is a **policy**, not performance.

Without a Default record, users in unmapped countries get a NODATA response.

> ⚠️ **Pitfall**: Geolocation determines the country based on the user's DNS resolver IP. A VPN user is classified as the country of the VPN endpoint. If a Korean user uses a US VPN, they are routed to us-east-1. This degrades performance, but from Route 53's perspective it's normal operation.

### Geoproximity: Distance + Bias Math

Geoproximity routes based on the **geographic distance** between the user and the endpoint, while adjusting each endpoint's "radius of influence" with a **Bias** value.

```
Default (Bias = 0):
  Users are routed to the geographically nearest endpoint

Bias + (1~99): expands that endpoint's radius of influence
  Bias +50 increases the radius by about 50%

Bias - (1~99): shrinks that endpoint's radius of influence
  Bias -50 decreases the radius by about 50%
```

**The mathematical meaning of Bias**: Bias adjusts an endpoint's "geographic gravity." If you give Seoul (ap-northeast-2) a Bias of +50, users in eastern Japan, who are geographically closer to Tokyo (ap-northeast-1), can also be routed to Seoul. Bias is not a bias value added to or subtracted from the straight-line distance; it is the concept of moving the boundary lines of a Voronoi diagram.

```
No Bias (default):
──────────────────
Seoul  │  Tokyo
      │ (the boundary is the perpendicular bisector of the two endpoints)

Seoul Bias +50:
────────────────────────
    Seoul     │  Tokyo
             │ (the boundary moves toward Tokyo)
```

A Voronoi diagram (Georgy Voronoy, 1908) is a geometric structure that partitions the plane into regions closest to each of n points. In Geoproximity, with several Regions and no Bias, each user is classified to the nearest Region — this is the simplest Voronoi partition. Bias changes each Region's "central weight" to move the boundaries, creating a Weighted Voronoi diagram.

**Geoproximity prerequisite**: You must use Route 53 **Traffic Flow**. Geoproximity can't be configured in the regular record editing UI.

**AWS Region endpoints vs custom coordinates**:
- For AWS Regions (ap-northeast-2, etc.), Route 53 sets the coordinates automatically
- For on-premises data centers, you enter the latitude and longitude directly

Can you use Geolocation and Geoproximity at the same time? Mixing the two policies in the same Hosted Zone is not recommended. However, in practice, when you need "mostly Geoproximity (distance-based optimization), with forced Geolocation for specific countries due to data sovereignty," you can build a composite policy in Traffic Flow. In this case, configure it so that Geolocation is evaluated first and, if there is no mapping, it passes on to Geoproximity.

## Route 53 Resolver: Hybrid DNS Architecture

In a hybrid environment where on-premises and an AWS VPC are connected, DNS resolution is a two-way problem. You must "resolve on-premises domains from AWS" and "resolve AWS VPC domains from on-premises." Route 53 Resolver is the managed service that solves both directions.

### Inbound Endpoint: On-Premises → AWS Direction

When an on-premises DNS server tries to resolve a domain inside AWS (for example, `app.internal.example.com`), the on-premises DNS server forwards the query to the Route 53 Resolver (DNS forwarding).

```
[On-premises server]
    DNS query: app.internal.example.com
        │
        ▼ (Direct Connect / VPN)
[Route 53 Resolver Inbound Endpoint]
    ENIs in the VPC (an IP assigned per subnet)
    e.g.: 10.0.1.254 (AZ-a), 10.0.2.254 (AZ-b)
        │
        ▼
[Route 53 Private Hosted Zone]
    app.internal.example.com → 10.0.5.100
        │
        ▼ response
[On-premises server]
```

Inbound Endpoint configuration:
- ENIs are created in at least 2 AZs in the VPC (high availability)
- Configure conditional forwarding to these IPs on the on-premises DNS server

### Outbound Endpoint: AWS → On-Premises Direction

When an EC2 instance in the VPC tries to resolve an on-premises domain (for example, `db.corp.internal`), the Route 53 Resolver forwards the query to the on-premises DNS server.

```
[EC2 in the VPC]
    DNS query: db.corp.internal
        │
        ▼
[Route 53 Resolver] (default VPC DNS: 169.254.169.253)
    Check the Resolver Rule:
    corp.internal → forward to on-premises DNS 10.100.0.53
        │
        ▼ (Direct Connect / VPN)
[Route 53 Resolver Outbound Endpoint]
    Sends the query with an ENI in the VPC as the source
        │
        ▼
[On-premises DNS server 10.100.0.53]
        │
        ▼ response
[EC2 in the VPC] → db.corp.internal = 10.100.50.30
```

**Types of Resolver Rules**:
- **Forwarding Rule**: Forwards a specific domain to specified DNS servers
- **System Rule**: Handles AWS built-in domains (amazonaws.com, ec2.internal)
- **Recursive Rule**: Recursively resolves domains that match neither of the above via public DNS

```bash
# Create an Outbound Endpoint + Forwarding Rule
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

# Associate the Rule with a VPC
aws route53resolver associate-resolver-rule \
  --resolver-rule-id rslvr-rr-XXXXXXXXXX \
  --vpc-id vpc-XXXXXXXXXX
```

A hybrid cloud design case in the financial sector. A large Korean financial group operates 30 AWS accounts while keeping its on-premises Active Directory (AD DS). The AD domain (finance.corp.internal) can be resolved only on-premises, and endpoints such as RDS and ElastiCache in AWS VPCs can be resolved only from AWS Private Hosted Zones. They configured two-way DNS resolution with a combination of Route 53 Resolver Inbound + Outbound Endpoints + Forwarding Rules. Connected via a Direct Connect Transit Gateway, the DNS query path doesn't traverse the internet.

Creating Resolver Endpoints in at least 2 AZs for high availability is standard, but since DNS queries themselves are stateless, on a single-AZ failure they switch over automatically to the ENIs in the other AZ. The source IP of an Outbound Endpoint is the private IP assigned to the ENI. You must add this IP to the DNS (UDP/TCP 53) allow list in the on-premises firewall. In many hybrid environments, incidents occur where DNS forwarding fails because of a missing firewall rule.

## The Complete Hybrid DNS Design Pattern

The full-stack pattern recommended in real enterprises:

```
[On-premises Active Directory DNS]
    corp.internal authoritative server
    ├── VPC domains (*.internal.aws) forwarded to the Route 53 Inbound EP
    └── Everything else resolved recursively by itself

[Direct Connect / VPN]

[Route 53 Resolver]
    ├── Inbound Endpoint (2 AZ): the target that on-premises queries
    ├── Outbound Endpoint (2 AZ): the VPC sends queries to on-premises
    └── Resolver Rules:
        corp.internal → on-premises DNS IP
        (default) → public recursion

[Route 53 Private Hosted Zone]
    internal.aws (VPC associated)
    ├── app.internal.aws → 10.0.5.100
    └── db.internal.aws → rds.ap-northeast-2.rds.amazonaws.com (CNAME)

[Route 53 Public Hosted Zone]
    example.com (for internet users)
    ├── Geolocation routing
    ├── Health Check integration
    └── DNSSEC signing enabled
```

> 🎯 **Scenario**: A global manufacturer connected its Seoul on-premises data center and AWS ap-northeast-2 (3 VPCs) with Direct Connect. Requirements: (1) On-premises Linux servers must resolve the ECS service discovery domains inside AWS. (2) EC2 instances in the AWS VPCs must resolve the on-premises Oracle RAC (rac01.mfg.corp). (3) Internet users access through CloudFront. Design: an Inbound Endpoint (on-premises→AWS direction), an Outbound Endpoint + Forwarding Rule (AWS→on-premises), and a Public Hosted Zone + CloudFront (internet users). All DNS paths bypass the internet via Direct Connect.

## Multi-Value Answer in Depth: Why It Is Not an Alternative to ELB

Multi-Value Answer (MVA) looks like it distributes traffic across several IPs in an environment without an ELB, but it is actually client-side load balancing.

```
Client DNS query:
app.example.com (Multi-Value Answer)
    ↓
Route 53 response:
10.0.1.100 (Healthy)
10.0.1.101 (Healthy)
10.0.1.102 (Unhealthy — excluded)
= returns up to 8 IPs (Unhealthy ones excluded)

Client behavior:
Picks one at random from the received IP list → connects
```

**Why it is not an ELB alternative**:
1. The client's DNS cache can stick to one IP for the TTL
2. There is no session persistence (Sticky Session)
3. There are no L7 features (header modification, SSL termination, path-based routing)
4. There is no Circuit Breaker to block connections when a server is overloaded

MVA is "simple DNS round-robin + automatic exclusion of unhealthy servers." It has far fewer features than ELB, but the cost and operational complexity are also far lower.

MVA must be integrated with Health Checks to exclude unhealthy servers. If you configure MVA without Health Checks, the IPs of dead servers are also returned. If the exam says "distribute across several IPs without an ELB + exclude unhealthy instances," you must confirm the "MVA + Health Check combination."

## TTL Strategy: Lower Before a Change, Raise After

The TTL of a Route 53 record is the DNS cache duration. The strategy of lowering the TTL in advance when you have a change planned falls within the SAP exam scope.

```
Normal times:
  TTL = 300 seconds (5 minutes) — lower DNS server load, high cache hit ratio

24~48 hours before a planned change:
  TTL → lowered to 60 seconds (wait until the old TTL of 300 seconds expires)

Execute the change:
  Change the DNS record (swap the IP, switch Regions, etc.)
  → most clients get the new record within 60 seconds

After the change stabilizes:
  TTL → restored to 300 seconds
```

In a DR scenario, if "the switchover is slow after Route 53 Failover," it is mostly a case where the DNS change was made without lowering the TTL.

---

## 📝 Practice Questions

**Question 1.** A company configured Route 53 Failover routing with a Primary (us-east-1 ALB) and a Secondary (us-west-2 ALB). If the Primary dies, it must switch automatically to the Secondary. However, the ALB is inside the VPC and has no public IP. How do you configure the Route 53 Health Check?

A) The Route 53 Health Checker polls the ALB's DNS directly
B) Integrate a CloudWatch Alarm (ALB Target Group Unhealthy Host Count > 0) with the Health Check
C) Attach a public IP to the ALB and configure the Health Check
D) An internal ALB doesn't need a Health Check

**Answer: B**
Explanation: Route 53 Health Checkers poll endpoints from the public internet. But if the ALB has a domain reachable from the internet, A would also work. However, if the question says "inside the VPC, no public IP," the Health Checker can't reach it. Integrating a CloudWatch Alarm (the ALB's HealthyHostCount or UnhealthyHostCount) with the Health Check is the standard pattern for private endpoints.

---

**Question 2.** A multinational company must process Korean users' data in ap-northeast-2 and German users' data in eu-central-1 without exception (GDPR + K-ISMS data sovereignty). Which Route 53 routing policy should it use?

A) Latency-Based Routing (to the fastest Region)
B) Geolocation (forced country-based mapping)
C) Geoproximity (distance-based + Bias adjustment)
D) Weighted (50:50 split)

**Answer: B**
Explanation: Data sovereignty enforces "the legally permitted Region," not "the fastest Region." Geolocation routes fully deterministically based on country/continent. Latency-Based is performance-based, so Korean users could go to a Japan Region. Geoproximity is also distance-based and thus unsuitable for enforcing data sovereignty. You should add a Default record to Geolocation to set a fallback for users in unmapped countries to make it complete.

---

**Question 3.** In a Route 53 Geoproximity policy, you set a Bias of +50 on ap-northeast-2 (Seoul). Where are users in eastern Japan (near Tokyo) routed?

A) Always to ap-northeast-1 (Tokyo) — because it is geographically closer
B) To Seoul — the Bias +50 expands the radius of influence so it can cover eastern Japan
C) Split 50:50 between the two Regions
D) Fall back to the Default record

**Answer: B**
Explanation: Geoproximity's Bias adjusts an endpoint's geographic radius of influence. Setting Bias +50 on ap-northeast-2 increases the Seoul Region's "gravity" so that nearby eastern Japan users can also be routed to Seoul. Conversely, setting Bias -50 on ap-northeast-1 can achieve the same effect. Route 53 Traffic Flow is required for Geoproximity configuration.

---

**Question 4.** A company wants to enable Route 53 DNSSEC on the example.com hosted zone. What is the correct order of the enablement procedure?

A) Register the DS record with the domain registrar → create the KSK in Route 53 and enable signing
B) Create the KSK in Route 53 and enable signing → register the DS record with the domain registrar
C) DNSSEC completes automatically with one toggle in the Route 53 console
D) The DS record is automatically propagated to the parent domain

**Answer: B**
Explanation: You must enable signing in Route 53 first and then register the DS record. In the opposite order, the moment you register the DS record the validator looks for signatures but finds none, causing SERVFAIL. The KSK is created with a KMS CMK, and after `enable-hosted-zone-dnssec` you must check the DS record value in the console and enter it manually at the domain registrar. If you also registered the domain with Route 53, Route 53 handles the DS registration automatically.

---

**Question 5.** An on-premises Linux server (10.100.1.50) must resolve the private DNS (mydb.cluster-xyz.ap-northeast-2.rds.amazonaws.com) of an RDS instance in an AWS VPC. What configuration is needed?

A) Statically enter the AWS RDS IP in the on-premises DNS server
B) Create a Route 53 Resolver Inbound Endpoint → set up conditional forwarding of the `.rds.amazonaws.com` domain to the Inbound EP IPs in the on-premises DNS
C) Create a Route 53 Resolver Outbound Endpoint
D) AWS can't resolve private DNS from on-premises

**Answer: B**
Explanation: DNS resolution in the on-premises → AWS direction is handled by the Inbound Endpoint. The Inbound EP creates ENIs in the VPC, and the on-premises DNS server conditionally forwards the `.rds.amazonaws.com` domain to the Inbound EP's IPs. On-premises server → on-premises DNS → Inbound EP → Route 53 Private Hosted Zone or AWS internal DNS → RDS private IP response. Direct Connect or a VPN must exist as the network path.

---

**Question 6.** Between Route 53 Multi-Value Answer and an ALB, which is suitable for "distributing connections according to real-time server load and maintaining sessions (Sticky Session)"?

A) Multi-Value Answer — Route 53 is aware of server load and distributes accordingly
B) ALB — L7 features + Sticky Session + server-load-aware load balancing
C) Multi-Value Answer + CloudWatch integration can maintain sessions
D) Both provide the same functionality

**Answer: B**
Explanation: Multi-Value Answer returns several IPs at the DNS level, and the client picks one at random. Server-load awareness, Sticky Sessions, real-time connection distribution, and L7 path-based routing are all ALB features. MVA is not an alternative to ELB but a DNS-level solution for "when you need simple distribution without an ELB." On the SAP exam, when both options appear, if the requirement includes Sticky Sessions or real-time load awareness, the ALB is the answer.

---

**Question 7.** A company's Calculated Health Check suddenly switched to Unhealthy. Of the 3 child Health Checks, 2 are Healthy and 1 is Unhealthy. The Calculated HC's current threshold is set to "all 3 of 3 Healthy." The service is actually operating normally. What is the problem?

A) A Route 53 bug
B) The threshold is too high — it should be lowered from "3 of 3" to "2 of 3"
C) A Calculated HC supports at most 2 child HCs
D) You must first manually change the Unhealthy child HC to Healthy

**Answer: B**
Explanation: If the Calculated Health Check's threshold is "3 of 3," the whole becomes Unhealthy as soon as any one child HC becomes Unhealthy. If the actual service is operating normally, it is appropriate to lower the threshold to "2 of 3" and decide by majority. One may intermittently become Unhealthy due to a network problem of a particular Health Checker itself, and if a full Failover triggers then, it's a false positive. Threshold design is one of the most important decisions in Health Check configuration.

---
