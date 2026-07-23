# Day 5 - Week 5 Review: Global Architecture Integrated Scenarios

Reflecting on Week 5's 5 days, one axis runs through: **How to route global users to correct region/endpoint, auto or manually switch on failure, all within budget.** DR strategies (Day 1), Route 53 7 routing types (Day 2), CloudFront advanced (Day 3), Global Accelerator, Route 53 Health Check/DNSSEC/Resolver (Day 4). These five layers learned independently but exam combines them into single scenarios.

Today isn't repetition. Compress each concept's decision tree, mathematically organize most-frequent trade-off comparison mistakes, finish with 12 complex enterprise scenarios.

## DR Strategy Integration: Aurora Global RPO/RTO Mathematics

Revisit DR strategy numbers. Understanding "why this number" matters beyond memorization.

| Strategy | RTO | RPO | Cost Ratio | Key Mechanism |
|------|-----|-----|---------|-------------|
| Backup & Restore | Hours to days | Backup interval | ~5% | S3 snapshots, EC2+RDS provisioning on restore |
| Pilot Light | 30 min to 2 hours | Minutes | ~15-25% | DB replication always on, app servers wait in AMI |
| Warm Standby | Minutes to 30 min | Minutes | ~30-50% | Scaled-down full stack always running |
| Active-Active | ~0 | ~0 | ~100%+ | Both regions serve simultaneously |

### Aurora Global Database Mathematics

Aurora Global Database positions between Pilot Light and Warm Standby as DR tool.

**RPO**: Aurora Global uses **async replication**, Replication Lag typically **<1 second**. Thus RPO ~1 second. Large write storms (e.g., batch inserts millions) can increase Lag to seconds/tens of seconds.

**RTO**: Managed Planned Failover vs Unplanned Failover differences exist.
- **Managed Planned Failover** (planned switch): Aurora fully syncs Secondary with Primary before promotion. RTO ~seconds. Zero data loss.
- **Unplanned Failover** (Primary region failure): Manual Secondary promotion needed. `promote-read-replica-db-cluster` API or console. RTO ~1 min (DB promotion) + app reconnection.

```bash
# Aurora Global Unplanned Failover: promote Secondary to new Primary
aws rds promote-read-replica-db-cluster \
  --db-cluster-identifier secondary-cluster-ap-northeast-2 \
  --region ap-northeast-2

# After promotion, change app connection string to Secondary cluster endpoint
```

**Replication Lag Monitoring**: Use `AuroraGlobalDBReplicationLag` CloudWatch metric as DR decision basis. Can condition R53 ARC Safety Rule: "Lag > 5 seconds, forbid failover."

> 💡 **Related Theory**: Aurora Global Database async replication based on **WAL (Write-Ahead Logging)**. Aurora compatible PostgreSQL streams WAL segments to Secondary region. Streaming occurs directly at Aurora Storage Layer so overhead lower and Lag shorter than DB engine-level replication (MySQL binlog-based). Aurora Global Database's <1 second Lag superior to general RDS Cross-Region Read Replica (seconds/tens of seconds).

### R53 ARC Safety Rule: Auto Failover Safety Guards

Auto failover fast but risky. Real incident: "Auto failover while DB Replication Lag large loses 5 minutes data." R53 ARC prevents via manual switch + SafetyRule.

```
R53 ARC SafetyRule Example:
MUST_EXIST: After switch, minimum 1 cell must stay ACTIVE
           → prevent complete traffic blackout

ASSERTION: Allow switch only when Aurora Lag < 3 seconds
          → control data loss threshold
```

SafetyRule two types: **Gating Control** + **Assertion Control**:
- Gating Control: prerequisite evaluated before other Routing Control on/off
- Assertion Control: quantity-based conditions guaranteeing min/max ACTIVE state

> 📚 **Case Study**: Amazon internal systems origin. 2019 Amazon Shopping Cart service auto-failover caused Secondary data inconsistency. After, Amazon adopted "human confirms DB Lag, switch manually when safe" principle, becoming R53 ARC design philosophy. ARC product of "automation isn't always correct" lesson.

## CloudFront + Global Accelerator Selection Formula

Final organization of two most-confused services.

```
Selection Algorithm:
1. UDP protocol?
   YES → AGA (CloudFront doesn't support UDP)

2. Need 2 static IPs? (firewall whitelist, BYOIP)
   YES → AGA

3. Caching critical? (static content, Cache Hit Rate > 50%)
   YES → CloudFront

4. Need WAF / Signed URL / Signed Cookies / FLE / Lambda@Edge?
   YES → CloudFront

5. Need immediate failover bypassing DNS cache?
   YES → AGA (bypass Route 53 DNS cache, packet-level switch)

6. Basic HTTP API, no caching/static IP needed?
   → Route 53 LBR cheapest
```

**Cost Comparison (100GB traffic/month)**:
- Route 53 LBR: $0.0000004 per query → 1M queries = $0.40
- CloudFront: Data Transfer Out $0.085/GB × 100GB = $8.50 (add Origin fees without cache)
- AGA: fixed $18/month + $0.015~0.035/GB × 100GB = $20~$21.50

Small traffic makes AGA $18 fixed cost burden, but static IP + packet-level switch requirement leaves no choice.

> 🔍 **Deeper Dive**: CloudFront + AGA combo pattern. When both static IP (AGA Anycast) + HTTP caching (CloudFront) needed, place AGA frontend forwarding to CloudFront Origin. Whitelist AGA IP at corporate firewall, CloudFront handles WAF/caching/Lambda@Edge. Hybrid SaaS pattern needing both "static IP enterprise customers + public CDN."

## Route 53 Health Check Comprehensive Summary

| Health Check Type | Suitable Scenario | Constraint |
|------------------|-------------|------|
| Endpoint (HTTP/S/TCP) | Poll public endpoints directly | Can't reach private resources |
| CloudWatch Alarm integration | Private resources, complex metrics | CW Alarm design needed |
| Calculated HC | Overall multi-tier app status | Child HC design complexity |

Failover routing: Primary Health Check becoming Unhealthy switches all queries to Secondary. Must guarantee "Secondary also Healthy." Attach Health Check to Secondary too; if Secondary Unhealthy, Route 53 won't switch and returns Primary (lesser evil).

> ⚠️ **Pitfall Lesson**: If Route 53 feels slow to switch due to DNS cache, sum Health Check detection time (default 30-second interval, 3 consecutive failures = 90 seconds) + DNS TTL. Default adds up to 90 + 300 = 390 seconds (6.5 minutes). Fast switching needs Health Check interval 10 seconds (Fast) and TTL ≤60 seconds.

## Savings Plans Cost Calculation Integrated Review

DR and global architecture cost optimization belongs SAP domain 4 (continuous improvement).

**Compute Savings Plans vs EC2 Instance Savings Plans**:

| Item | Compute Savings Plans | EC2 Instance Savings Plans |
|-----|----------------------|--------------------------|
| Commitment | 1 or 3 years | 1 or 3 years |
| Discount | up to 66% (vs On-Demand) | up to 72% |
| Flexibility | EC2 + Fargate + Lambda | EC2 specific Family only |
| Region change | Possible | Impossible (region-locked) |
| Instance family change | Possible | Impossible |
| DR scenario fitness | Applies even after region switch | May not apply if DR region different |

DR environments risking region changes = **Compute Savings Plans** safer. Switching us-east-1 to us-west-2 on failover still applies Compute Savings Plans.

**Cost Calculation Example**:
```
Current: m5.xlarge On-Demand 10 × $0.192/hour × 720 hours = $1,382/month

Compute Savings Plans 1 year:
30% discount → $0.134/hour
Savings: $1,382 - ($0.134 × 10 × 720) = $1,382 - $965 = $417/month saved

Compute Savings Plans 3 years:
50% discount → $0.096/hour
Savings: $1,382 - ($0.096 × 10 × 720) = $1,382 - $691 = $691/month saved
```

> 💡 **Related Theory**: Savings Plans structure similar to finance **Futures Contracts**. Commit future computing use at fixed price, receive discount. Spot Instance opposite: "cheaply buy spare capacity at spot market." Optimal cost combining both — Savings Plans cover base load, Spot handles bursts.

## Well-Architected 6 Pillar Checklist: Global Architecture Application

| Pillar | Global Architecture Checkpoint | Key Services |
|--------|------------------------|-----------|
| Operational Excellence | Automate DR Runbook, periodic failover drills | R53 ARC, SSM Runbook |
| Security | CloudFront + WAF, DNSSEC, OAC, FLE | WAF, Shield, KMS |
| Reliability | Multi-Region, Health Check, Calculated HC | Route 53, AGA, Aurora Global |
| Performance Efficiency | CloudFront cache hit rate, AGA backbone | CloudFront, Global Accelerator |
| Cost Optimization | Savings Plans, Reserved, CloudFront vs AGA choice | Cost Explorer, Savings Plans |
| Sustainability | Operate only necessary regions, clean unused resources | Trusted Advisor, Compute Optimizer |

> 🔍 **Deeper Dive**: 2022 AWS Well-Architected adds 6th Pillar "Sustainability." SAP-C02 explicitly addresses this. Global architecture sustainability optimization core: "don't operate more regions than needed." If Active-Active exceeds RTO/RPO requirements, reducing to Warm Standby lowers resource usage and aligns with sustainability.

## Key Comparison Matrix Final Edition

### DR Strategy Decision Tree

```
RTO > 4 hours, RPO > 1 hour?
  YES → Backup & Restore (cheapest)

RTO 30 min to 4 hours, RPO minutes?
  "Only replicate DB, quick app start via AMI"
  YES → Pilot Light

RTO minutes to 30 min?
  "Full stack must always run at small scale"
  YES → Warm Standby

RTO ~0, simultaneous serving?
  YES → Active-Active (most expensive)
```

### Route 53 + CloudFront + AGA Integrated Decision Tree

```
Route users to correct region?
  Data sovereignty enforce → Geolocation
  Performance optimize → Latency-Based Routing
  Distance + traffic adjust → Geoproximity (Traffic Flow)
  DR Primary/Secondary → Failover

Endpoint acceleration needed additionally?
  HTTP + cache + WAF → CloudFront
  UDP / static IP / DNS-bypass failover → AGA
  Both → AGA frontend + CloudFront backend

Failover within region?
  HTTP error-based instant retry → CloudFront Origin Failover
  Health Check-based region switch → Route 53 / AGA
  Manual safe switch → R53 ARC Routing Control
```

---

## 📝 Scenario 12 Questions

**Question 1.** Global fintech company operates Aurora Global Database us-east-1 (Primary) and ap-northeast-2 (Secondary). Must limit data loss to 5 seconds on failure. Operations team monitoring DB Replication Lag wants block auto-failover if Lag spikes. Most suitable configuration?

A) Route 53 Failover Health Check (auto switch)
B) R53 ARC Safety Rule forbidding failover if AuroraGlobalDBReplicationLag > 5 sec + manual Routing Control
C) CloudWatch Alarm → Lambda → Route 53 record auto-change
D) Replace DB with DynamoDB Global Tables

**정답: B**
해설: "Lag-conditional failover block + manual switch" = R53 ARC. SafetyRule Assertion Control sets Lag condition; actual switch human-operated via Routing Control. Auto Failover (A, C) can't recognize Lag state, causing data loss > 5 sec. D requires Aurora OLTP to DynamoDB refactor, unrelated to scenario.

---

**Question 2.** E-commerce wants European users in eu-west-1, Asian users in ap-northeast-2. When both healthy, each region serves its users; if one fails, other handles all. Route 53 configuration?

A) Geolocation alone (EU→eu-west-1, AS→ap-northeast-2, no Default)
B) Weighted (50:50)
C) Geolocation + Health Check integration (Primary Geolocation + Failover Default record on Health Check failure)
D) Latency-Based Routing

**정답: C**
해설: Geolocation fixed per-country mapping. Normally EU→eu-west-1, AS→ap-northeast-2; if eu-west-1 fails, EU record's Health Check Unhealthy, Route 53 fallbacks to Default (ap-northeast-2). A without Default record returns NODATA on failure or unmapped users. D performance-based unsuitable for data sovereignty.

---

**Question 3.** Media company operates HLS streaming via CloudFront. Paid subscribers only, needing authentication for hundreds of .ts segments after login. Most efficient CloudFront access control?

A) Issue Signed URL per .ts file
B) Issue Signed Cookies at login (auto-include all subsequent .ts requests)
C) CloudFront Functions validate JWT all requests
D) S3 bucket policy IP whitelist

**정답: B**
해설: HLS hundreds-thousands .ts segments need per-file Signed URL as inefficient. Signed Cookies issued once at login auto-include all requests, covering entire content directory. C CloudFront Functions can't call external systems (no network calls), needing Lambda@Edge, costing per segment. D IP whitelist fails on user IP change.

---

**Question 4.** Global game operates UDP-based multiplayer server; B2B partners must whitelist server IP in firewalls. Simultaneously protect from attacks. Most suitable?

A) CloudFront + AWS WAF
B) Global Accelerator + AWS Shield Advanced
C) Route 53 LBR + ALB + WAF
D) API Gateway + Lambda@Edge

**정답: B**
해설: UDP + static IP (firewall whitelist) = AGA mandatory. CloudFront no UDP support. AGA + Shield Advanced absorbs L3/L4 DDoS at PoP from AGA Anycast IP. CloudFront WAF L7, inapplicable to UDP. Route 53 LBR no static IP.

---

**Question 5.** Financial firm executes Aurora Global Database Managed Planned Failover (Primary: us-east-1 → Secondary: ap-northeast-2). ap-northeast-2 new Primary. Data loss occurred?

A) Yes. Managed Planned Failover still async-replication-based, losing <1 second Replication Lag at switch
B) No. Managed Planned Failover waits complete Secondary sync before switch, zero data loss
C) Yes. Aurora Storage Layer fixed ~1 second data loss (RPO ~1 sec) always occurs
D) Switch fails mid-transaction conflict, must manually promote Secondary then retry

**정답: B**
해설: Aurora Global Managed Planned Failover syncs Secondary fully with Primary before demoting Primary and promoting Secondary. RPO = 0, no data loss. Unplanned (disaster, Primary dies suddenly) loses Replication Lag data. This difference frequently tested.

---

**Question 6.** SaaS runs 100 EC2 in us-east-1 On-Demand. Stable traffic, 1-year same-scale forecast. No instance family change. Max cost savings option?

A) Compute Savings Plans 1 year
B) EC2 Instance Savings Plans 1 year
C) Spot Instances
D) Reserved Instances (3-year All Upfront)

**정답: B**
해설: Fixed instance family + 1-year + max savings = EC2 Instance Savings Plans higher discount than Compute (72% vs 66%). No family change means higher discount with stricter commitment. Spot unsuitablefor 100 stateful production (interruption risk). RI 3-year too long, only 1-year needed.

---

**Question 7.** Difference between CloudFront Origin Failover and Route 53 Failover?

A) CloudFront Origin Failover handles global region switching; Route 53 Failover only AZ within region
B) CloudFront Origin Failover immediate per-request retry on HTTP codes; Route 53 Failover after DNS TTL
C) Both identical: detect Health Check failure then change DNS record
D) Route 53 Failover bypasses client DNS cache faster than CloudFront

**정답: B**
해설: CloudFront Origin Failover immediately retries request to Secondary on Primary 5xx/timeout. Per-request, millisecond switch. Route 53 Failover: Health Check detects failure (tens seconds), changes DNS, but client TTL cache means full switch takes minutes. Same CloudFront Distribution Origin switch = CloudFront Origin Failover; global region change = Route 53 Failover.

---

**Question 8.** Company expands ap-northeast-2 service to eu-west-1. European users prefer Europe over Seoul; eu-west-1 failure fallbacks to ap-northeast-2. DNS cache delay unacceptable. Optimal configuration?

A) Route 53 Geolocation + Failover (EU→eu-west-1 Primary, ap-northeast-2 Secondary)
B) Global Accelerator (eu-west-1 100%, ap-northeast-2 standby) + AGA Health Check
C) Route 53 LBR + CloudFront Multi-Origin
D) CloudFront Lambda@Edge region routing

**정답: B**
해설: "No DNS cache delay, switch within seconds" = AGA. Packet-level region switching unfazed by DNS TTL. eu-west-1 high priority (Traffic Dial 100%), ap-northeast-2 Health Check auto-failover target. Route 53 Failover (A) has DNS TTL delay causing "minutes delay." Keyword "DNS cache delay unacceptable" signals AGA choice.

---

**Question 9.** Company applied Field-Level Encryption (FLE) to CloudFront. Credit card field must not decrypt at CloudFront edge. Who decrypts?

A) CloudFront Edge Functions (Lambda@Edge)
B) ALB
C) Origin payment service (holds RSA private key)
D) CloudFront decrypts, passes plaintext to Origin

**정답: C**
해설: FLE encrypts specified fields at CloudFront Edge with RSA public key. Encrypted data passes edge to Origin. Only RSA private-key holding Origin payment service decrypts. HTTPS Point-to-Point (decrypt each hop); FLE adds End-to-End layer.

---

**Question 10.** Enterprise Well-Architected Review identifies "Operational Excellence: DR failover runbook not documented nor automated." Most suitable AWS service automating failover Runbook?

A) AWS Config Auto Remediation
B) AWS Systems Manager Automation (Runbook)
C) AWS Lambda (direct code)
D) AWS CloudFormation (stack redeploy)

**정답: B**
해설: DR Runbook automation = SSM Automation. Integrate R53 ARC: "switch Routing Control → Aurora Failover → validate app reconnection → alert" as sequential Runbook. SSM supports API calls, script execution, parallel/branch, manual approval. Lambda possible but Runbook visualization/reusability/approval SSM stronger.

---

**Question 11.** Startup provides global SaaS. Cost paramount; currently single-region (us-east-1) 99.9% SLA. RTO 4 hours, RPO 1 hour required. Cheapest DR strategy satisfying requirements?

A) Active-Active multi-region
B) Warm Standby (us-west-2)
C) Backup & Restore (S3 snapshots, cross-region copy)
D) Pilot Light (DB replication always)

**정답: C**
해설: RTO 4hr, RPO 1hr = Backup & Restore achievable. Hourly snapshots/backups to us-west-2 = RPO 1hr. Failure: provision EC2+RDS in us-west-2 = RTO <4hr. Cost ~5% infrastructure. Warm Standby 30~50%, Active-Active 100%+. Cost paramount scenario: "meet requirements cheapest" wins.

---

**Question 12.** Company enabled DNSSEC on Route 53 Hosted Zone. After, some users get SERVFAIL response. Cause and solution?

A) Route 53 blocks old DNSSEC-unsupporting resolvers auto-triggering SERVFAIL — disable DNSSEC to fix
B) DS record not registered at registrar yet or misconfigured — verify DS record registration
C) DNSSEC only Private Hosted Zone; Public zones SERVFAIL — convert to Private
D) Auto-managed KSK expired, signature validation broken — manually rollover to new KSK console

**정답: B**
해설: DNSSEC SERVFAIL commonest cause: DS record not registered at registrar. Missing DS breaks trust chain. DNSSEC-validating resolver can't verify, classifies BOGUS, returns SERVFAIL. After activation, verify DS registered at registrar, check propagation via `dig DS example.com @8.8.8.8`. Non-DNSSEC resolvers ignore DNSSEC flag, receive normal response (A wrong). DNSSEC only Public zones in AWS (B correct).

---
