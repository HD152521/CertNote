# Day 5 - Week 8 Comprehensive Review and 12 Scenario Problems

Week 8 descended through every layer of VPC as a virtual data center. First, we saw VPC's emergence replacing EC2-Classic and Security Group/NACL's stateful/stateless separation. Second, we observed traffic through Flow Logs, Traffic Mirroring, and Reachability Analyzer's three abstraction levels. Third, we explored three ways to meet outside — NAT GW, VPC Endpoint, PrivateLink. Fourth, we connected multiple VPCs and on-premises — Transit Gateway, VPN, Direct Connect, Route 53.

This section doesn't recap those four — instead it **synthesizes exam-frequent scenario decision trees into 12 problems**. Real operator decisions — "should I add SG or modify NACL now," "NAT GW costs spike, where to cut first," "go Active-Active or Pilot Light DR" — practicing these decision trees helps both exam passing and operations.

## Week 8 Core Summary in 12 One-Liners

The 12 most-frequent facts from four previous essays summarized:

1. **SG = Stateful, NACL = Stateless** — NACL requires explicit ephemeral port (1024-65535) bidirectional
2. **Each subnet reserves 5 IPs** (/28 leaves usable 11)
3. **Public/Private essence is route table's IGW route presence** (subnet itself has no attribute)
4. **Flow Logs record metadata only** — 169.254.x.x AWS internal traffic unrecorded
5. **Traffic Mirroring supports Nitro instances only** — VXLAN encapsulation copies
6. **Reachability Analyzer simulates**, NAA scans broad-scale
7. **NAT GW is AZ-bound** — 1 per AZ + route to own AZ
8. **Gateway Endpoint = S3/DDB only + free**, Interface = PrivateLink + paid
9. **VPC Peering non-transitive**, TGW transitive
10. **VPN = immediate & cheap**, **DX = consistent & high-bandwidth** (DX itself unencrypted)
11. **Route 53 8 policies** — Latency (performance), Geolocation (regulation), Failover (DR)
12. **Resolver Inbound = on-premises→VPC**, Outbound = VPC→on-premises

## 4 Core Comparison Tables

Four most-frequent comparisons operators face in exams:

**Three Observation Tools**

| Item | Flow Logs | Traffic Mirroring | Reachability Analyzer |
|------|-----------|-------------------|-----------------------|
| Data | Metadata 5-tuple | Actual packets (payload) | Policy graph simulation |
| Abstraction | L3/L4 | L7 | Policy evaluation |
| Cost | Storage volume | Traffic replication | Per-analysis |
| Target | ENI/Subnet/VPC | Nitro ENI only | Between two resources |
| Question answered | Who talks to whom how much | What flows | Can reach |

**Multi-VPC Connectivity**

| Item | VPC Peering | Transit Gateway |
|------|-------------|-----------------|
| Topology | Mesh (N×N) | Hub-and-Spoke (N) |
| Transitive | No | Yes |
| Cost | Data transfer only | Attachment per-hour + data |
| Management | N(N-1)/2 complex | N simple |
| Suitable scale | 2-5 VPCs | 5+ VPCs |

**Two VPC Endpoint Types**

| Item | Gateway | Interface (PrivateLink) |
|------|---------|-------------------------|
| Services | S3, DynamoDB only | Almost all AWS + company |
| Cost | **Free** | Per-hour + per-GB |
| Mechanism | Route table prefix list | Private IP on ENI |
| Routing | Route Table entry | DNS resolution |
| Cross-Account | No | Yes |

**On-Premises Connectivity**

| Item | Site-to-Site VPN | Direct Connect |
|------|------------------|----------------|
| Medium | Internet + IPsec | Dedicated optical cable |
| Bandwidth | ~1.25 Gbps per tunnel | 1/10/100 Gbps |
| Latency | Variable | Consistent, low |
| Setup | Immediate (hours) | Weeks to months |
| Encryption | Built-in (IPsec) | None (MACsec separate) |
| Cost | Cheap | Expensive |

---

## 📝 12 Scenario Problems

**Problem 1.** Custom NACL has inbound 80 allowed but HTTP requests arrive while responses don't. Why?

A) Internet Gateway not attached to VPC, response packets can't route out
B) NACL is stateless so ephemeral port (1024-65535) outbound must be explicit
C) Security Group outbound changed from default, blocking response
D) Public subnet route table lacks 0.0.0.0/0 → IGW route, dropping return traffic

**Answer: B**

Explanation: NACL's most common trap. SG is stateful with connection tracking auto-passing responses; NACL tracks no state. When client requests via port 80, source port is OS-allocated ephemeral (Linux 32768-60999, Windows 49152-65535); server response goes to that ephemeral port. NACL outbound must allow 1024-65535 full range — narrower ranges break specific OS/flows. This is the fundamental SG/NACL difference.

---

**Problem 2.** Private EC2 sends 1TB daily to S3, NAT GW costs spike. Best solution?

A) Add NAT GW per AZ, distribute load (single unit cost unchanged, total same)
B) Gateway Endpoint (S3) — free, bypasses AWS backbone
C) Replace NAT GW with self-managed NAT Instance (no traffic cost, just EC2 cost)
D) Move instances to public subnet with public IPs, access S3 via IGW directly

**Answer: B**

Explanation: S3/DynamoDB bypass via Gateway Endpoint (free). 1TB/day = monthly NAT GW $1,350 (data $0.045/GB × 30,000GB); Gateway Endpoint $0. Traffic stays AWS backbone internally, enhancing security. Endpoint Policy can restrict reachable buckets, preventing data exfiltration. NAT GW expansion spends more; NAT Instance adds operational burden without reducing traffic costs.

---

**Problem 3.** Private VPC (Internet blocked), using SSM Session Manager. Required setup?

A) Add NAT GW for instances to reach public SSM endpoint via outbound Internet (violates Internet-blocked requirement)
B) Three Interface Endpoints (ssm, ssmmessages, ec2messages) + Private DNS enabled
C) Create one Gateway Endpoint for S3/DDB to route SSM Agent traffic via prefix list
D) Connect on-premises Site-to-Site VPN and route SSM API through proxy there

**Answer: B**

Explanation: SSM uses all three channels — ssm (API), ssmmessages (bidirectional messaging), ec2messages (Agent communication). All three must be Interface type for Session operation. Gateway Endpoint supports S3/DDB only, not SSM. Private DNS enablement is standard; instances call default SSM domain without code change, resolving to endpoint's private IP. Need CloudWatch Logs endpoint for output; ECR pulling needs ecr.api + ecr.dkr + S3 Gateway Endpoint — private environment endpoint lists typically 5-10.

---

**Problem 4.** Private EC2 fails external API calls. First tool to use?

A) Install Wireshark on instance, capture actual packets, analyze which hop loses response
B) Reachability Analyzer simulate EC2 → IGW (or NAT GW) path
C) Inspector scan instance vulnerabilities for network stack CVEs
D) GuardDuty check if external API calls hit malicious IP block rules

**Answer: B**

Explanation: Connectivity troubleshooting's priority-one tool. Analyzes policy graph (SG, NACL, Route Table, IGW) without sending packets, presenting per-hop decision rationale in 30 seconds — specific blocks like "SG-dest inbound 80 missing." Wireshark needs flowing packets (if not flowing, that's the issue) — unsuitable. Inspector/GuardDuty are security tools, not connectivity diagnostics. Manual SG→NACL→Route Table→IGW check takes 30 minutes; Reachability Analyzer does it in 30 seconds.

---

**Problem 5.** Company runs 20 VPCs + on-premises integrated network. Most efficient tool?

A) VPC Peering all pairs (190) with separate VPN per VPC to on-premises
B) Transit Gateway central hub + VPN/Direct Connect for on-premises
C) Interconnect all VPCs with Site-to-Site VPN tunnels, same for on-premises
D) Single Direct Connect circuit with 20 VPC VIFs, connecting all VPCs and on-premises

**Answer: B**

Explanation: 20×19/2=190 Peering is management hell; new VPC = new peerings with all 20 existing. TGW hub-and-spoke manages 20 attachments, transitive routing reaches all VPCs. Route Table separation centralizes prod-dev isolation at hub. On-premises via VPN (immediate, cheap) or DX (consistent, large-scale) attachment to same TGW. Same logic as AT&T switching 1970s national telephone network mesh to hub-and-spoke.

---

**Problem 6.** Multi-Region environment, auto-route users to fastest (minimum latency) region?

A) Weighted Routing, assign per-region weight to distribute traffic ratio
B) Latency-based Routing
C) Geolocation Routing map users by country/continent to nearest region
D) Failover Routing switch to Secondary if Primary unhealthy

**Answer: B**

Explanation: Latency-based answers AWS-measured minimum latency region. User from Korea; if Tokyo region's latency is lower at that moment, sends to Tokyo — performance optimization. Geolocation is country/continent basis, latency-irrelevant (Korean user always to Korea, even if Korea region temporarily slow) — regulation/localization use (e.g., "EU users always to EU region"). Similar-looking, different intent.

---

**Problem 7.** Multi-AZ private subnet HA external communication configuration?

A) Single NAT GW in one AZ, all AZs' private subnets share it via routing
B) One NAT GW per AZ + each AZ's private route table points to own AZ NAT
C) Single NAT Instance in Auto Scaling group (min/max 1), auto-recovery HA
D) Direct Internet Gateway routing for private subnets, no NAT needed

**Answer: B**

Explanation: NAT GW is AZ-bound. Single AZ placement causes: ① That AZ failure cuts other AZs' external communication too (multi-AZ principle broken), ② cross-AZ traffic incurs $0.01/GB additional charge. Standard: one NAT GW per AZ + separate route tables per AZ pointing to own AZ NAT. Solves both availability and cost. Single NAT GW + multi-AZ private subnets is the most common anti-pattern.

---

**Problem 8.** Security team needs actual HTTP headers and body from suspicious instance for IDS analysis?

A) Enable Flow Logs, filter 5-tuple (srcAddr, dstAddr, port, protocol) suspicious flows
B) Traffic Mirroring (Mirror Source = ENI, Target = NLB → Suricata/Zeek analysis instances)
C) Reachability Analyzer simulate suspicious instance paths to see what traffic reaches
D) GuardDuty threat detection results identify malicious communication patterns

**Answer: B**

Explanation: Core need: "actual packet payload." Flow Logs record metadata (5-tuple + bytes/action) only, no HTTP headers/body. Traffic Mirroring VXLANs encapsulates ENI packets copying verbatim. NLB on receiving side load-balances across analysis instances, avoiding SPOF. Downside: Nitro instances only, replication traffic costs added — Mirror Filter narrowing to suspicious protocols is operational standard.

---

**Problem 9.** B2B SaaS exposes service to customer VPCs without Internet; some customer CIDRs overlap own company. Which technology?

A) VPC Peering with customers, ask overlapping CIDR owners to reassign
B) AWS PrivateLink: NLB + Endpoint Service + Consumer Endpoint
C) Transit Gateway shared via RAM, Route Table exposes only company service VPC
D) Per-customer Site-to-Site VPN, NAT transforms conflicting CIDRs

**Answer: B**

Explanation: PrivateLink is precise use case. ① CIDR conflict irrelevant — Consumer calls own private IP endpoint, ignoring Provider CIDR. ② No Internet exposure — AWS backbone only. ③ Allowed Principals whitelist per-customer access. Snowflake, MongoDB Atlas, Confluent Cloud all follow. VPC Peering/TGW fails on CIDR conflicts. VPN requires router config negotiation per customer — unrealistic at SaaS scale.

---

**Problem 10.** Running on Direct Connect alone; need high availability for circuit failure. AWS recommended pattern?

A) Single DX guarantees SLA, BGP tuning shortens reconvergence time only
B) Two DX circuits different locations (High Resilience) or DX + VPN Hybrid
C) Two circuits on different DX device same location for device-level redundancy
D) Double DX bandwidth, absorb single failure with residual capacity

**Answer: B**

Explanation: Single DX is obvious SPOF. AWS HA pattern 4 levels — Development (1), High Resilience (2 different locations), Maximum Resilience (4), Hybrid (DX + VPN backup). **Two different locations** most cost-efficient common choice. Same-location 2 circuits can't survive location failure (backhoe, power, fire) — pointless. Hybrid reduces circuit cost to one; VPN auto-failover prevents downtime on DX failure (reduced bandwidth only).

---

**Problem 11.** Operator analyzes NAT GW costs via Flow Logs finding "which instance sends most data outbound." Most efficient method?

A) CloudWatch Logs Insights query `stats sum(bytes) by srcAddr | sort desc | limit 10`
B) S3 Flow Logs (Parquet) Athena query `SELECT instance_id, sum(bytes)/1e9 as gb GROUP BY instance_id ORDER BY gb DESC`
C) Check GuardDuty alarms
D) Check VPC console metrics only

**Answer: B**

Explanation: Large-scale analysis S3 Parquet + Athena overwhelmingly efficient. 1TB Flow Logs monthly: CloudWatch Logs $530 vs S3 Parquet $25 (20x difference); Parquet column compression makes Athena scans 5-10x fewer bytes, query costs drop proportionally. Hive-compatible partitioning (year/month/day/hour) skips other partitions on time-range queries. Logs Insights for real-time alarms/debugging; Athena for long-term analysis/reports. Operations typically use both storage.

---

**Problem 12.** Company policy: "EC2 in VPC access only company-owned S3 buckets, never external accounts." Which tool enforces?

A) Security Group restrict S3 IPs
B) Gateway Endpoint + Endpoint Policy with `aws:PrincipalAccount` or `s3:ResourceAccount` condition
C) NACL S3 deny
D) NAT GW Policy

**Answer: B**

Explanation: Endpoint Policy adds extra constraints to endpoint API calls. `aws:PrincipalAccount=123456789012` condition permits only our account credentials, or `s3:ResourceAccount=123456789012` permits only our account resources. SG IP-based, unsuitable for dynamic-IP services like S3. NAT GW has no Policy concept. NACL IP deny impractical for S3. Endpoint Policy layers on IAM Policy — "must have IAM permission AND match endpoint policy to pass" — powerful data exfiltration prevention. Exam trap: "Endpoint Policy grants IAM-absent permissions."

---

### 2 Additional Scenario Problems

**Problem 13.** Company set up Multi-Region Active-Passive DR. Route 53 Failover on Primary ALB failure works, but due to **DNS TTL 300s + some ISPs additional caching**, RTO exceeds 7 minutes. Reduce RTO to 1-2 seconds?

A) Set Route 53 record TTL to 0, eliminate resolver caching, propagate failover instantly
B) Switch to AWS Global Accelerator (BGP Anycast static IP, bypasses DNS TTL)
C) Add NAT GW to Secondary region, reduce failover path outbound latency
D) Replace ALB with NLB for static IP, shorten health check intervals to accelerate switch

**Answer: B**

Explanation: DNS TTL is RFC 1035/2181 caching period; setting to 0 doesn't stop some resolvers (ISP DNS) enforcing minimum caching (usually 30-60s) by their own policy. Route 53 Failover's fundamental limit. Global Accelerator is different model — AWS BGP Anycast advertises 2 static IPs globally, routing to per-region endpoints. Primary region fails; AWS backbone BGP routing table update redirects traffic in 1-2 seconds, TTL-independent. Strict RTO requirement: standard for finance, gaming.

---

**Problem 14.** Operator attached Prod VPC and Dev VPC to Transit Gateway. Policy requires "Prod communicates with Shared Services VPC only, isolated from Dev." How to configure?

A) Add VPC Peering only between Prod and Shared, detach Dev from TGW for separate connection and isolation
B) Separate TGW Route Tables — Prod RT (Shared propagates), Dev RT (Shared propagates), mutual isolation
C) Prod VPC Security Group inbound explicitly deny Dev VPC CIDR for isolation
D) Split TGW into two (one Prod, one Dev), attach Shared VPC to both

**Answer: B**

Explanation: TGW's core strength is Route Table separation for hub-based policy control. Each attachment associates with one RT (determines route visibility), propagates to multiple RTs (broadcasts own routes). Prod attachment associates Prod RT + Shared attachment propagates to Prod RT means Prod sees Shared routes only, Dev routes absent → auto-isolation. Dev similarly configured. SG blocking is per-instance control — high ops cost, human error prone. Two TGWs breaks hub-and-spoke simplicity, cost 2x. This RT separation pattern is multi-account standard configuration.

---

## Integrated Decision Tree — Tool Selection Quick Reference by Scenario

Organizing frequent operational decisions as tree. Exam scenarios also follow this logic for faster answers:

**"Must communicate externally"**

```
Where does traffic go?
├── Any external URL (e.g., external SaaS API)
│   └── NAT Gateway (1 per AZ, route to own AZ)
├── S3 or DynamoDB
│   └── Gateway Endpoint (free)
├── Other AWS services (SSM, ECR, Logs, etc.)
│   └── Interface Endpoint (PrivateLink, paid, Private DNS enabled)
└── Other VPC/account company/third-party service
    └── PrivateLink Endpoint Service (NLB + Allowed Principals)
```

**"Connectivity issue"**

```
What to know?
├── Can reach? Where blocked? (1:1)
│   └── Reachability Analyzer (simulation, 30s)
├── Which instances exposed externally? (broad-scale)
│   └── Network Access Analyzer + Access Scope
├── Who talks to whom how much? (traffic analysis)
│   └── Flow Logs + Logs Insights/Athena
└── Need actual packet payload (security analysis)
    └── Traffic Mirroring → Suricata/Zeek
```

**"Connect multiple VPCs"**

```
How many VPCs? On-premises connection needed?
├── 2-3 VPCs, no on-premises
│   └── VPC Peering (note: non-transitive — A↔B, B↔C exists but A→C needs separate)
├── 5+ VPCs or on-premises integration
│   └── Transit Gateway (hub-and-spoke + RT separation for policy control)
└── B2B SaaS model (possible CIDR conflicts)
    └── PrivateLink
```

**"Connect on-premises"**

```
What are requirements?
├── Immediate, cheap, temporary/small-scale
│   └── Site-to-Site VPN (Internet + IPsec, ~1.25Gbps/tunnel)
├── Consistent bandwidth, low latency, large-scale traffic (SLA)
│   └── Direct Connect (1/10/100Gbps, installation weeks, expensive)
├── Avoid single DX circuit SPOF
│   └── High Resilience: 2 circuits different locations
└── Reduce DX cost while fallback on failure
    └── Hybrid: 1 DX + VPN backup
```

**"Multi-Region DR"**

```
RTO vs Cost trade-off?
├── RTO 0, cost 2x OK, global users
│   └── Active-Active + Latency-based Routing + bidirectional data replication
│       (DynamoDB Global Tables, S3 CRR, Aurora Global DB)
├── RTO minutes to tens of minutes, cost reduction
│   └── Active-Passive (Pilot Light/Warm Standby) + Failover Routing
│       + Health Check + short TTL (60s)
└── Sub-second failover regardless of DNS TTL
    └── Global Accelerator (BGP Anycast, 1-2s failover)
```

---

## Next Week Preview — Week 9 Security Operations

Week 9 is **security operations** — KMS, Secrets Manager, GuardDuty, Security Hub. Core of security/compliance exam's 16% weight.

- Day 1: KMS — Key Policy, Grant, Rotation, CloudHSM placement
- Day 2: Secrets Manager auto-rotation, Cross-Region Replication, Parameter Store comparison
- Day 3: IAM Access Analyzer and Trusted Advisor security checks
- Day 4: GuardDuty (anomaly detection), Security Hub (integration), Inspector (vulnerabilities), Macie (data classification)
- Day 5: Week 9 comprehensive + scenario problems

This week VPC was "network boundary"; next week is "data, credential, threat boundary." Combined, two weeks complete the big picture of operations security.
