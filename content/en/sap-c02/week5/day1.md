# Day 1 - Multi-Region Architecture: Why Global Distribution Is Difficult

The most romantically appealing concept to engineers designing distributed systems for the first time is "multi-region." Yet in practice, you quickly realize the hard truth: **the moment data exists in multiple places simultaneously, everything becomes difficult.** Clocks fall out of sync, networks break, transactions fragment. Leslie Lamport's 1980s observation becomes reality: "A distributed system is one in which the failure of a computer you didn't even know existed can render your computer unusable."

The real reason to study AWS multi-region is not "how do you turn on these services." **You must understand why these constraints arise and what trade-offs you must accept** so you can distinguish correct from incorrect answers in SAP-C02 scenarios. Today we start from the fundamentals.

## Why Multi-Region: Four Motivations

There are four main reasons to choose multi-region. The first step in SAP scenarios is identifying which is the primary driver in each case.

| Motivation | Scenario Hint | Selected Pattern |
|------|-------------|------------|
| **Disaster Recovery (DR)** | "Prepare for full region failure", "RTO/RPO specified" | Choose from DR 4 strategies |
| **Minimize Latency** | "Global users", "closest region" | Active-Active + Route 53 LBR |
| **Data Sovereignty** | "GDPR", "EU data stays in EU", "data residency" | Independent stack per region, Geolocation routing |
| **Compliance** | "Financial regulation", "government audit", "region isolation required" | Region-specific account + SCP |

> 💡 **Related Theory**: CAP Theorem (Brewer, 2000) states that distributed systems cannot simultaneously guarantee all three of Consistency, Availability, and Partition tolerance perfectly. Multi-region makes network partitioning inevitable, so P is always maintained; ultimately you choose between C and A. This is why DynamoDB Global Tables chooses AP (eventual consistency). Aurora Global Database maintains strong consistency with a single Primary, moving closer to CP.

> 🔍 **Deeper Dive**: In practice, PACELC (Abadi, 2012) is more realistic than CAP's binary choice between C and A. PACELC describes trade-offs between A vs C during Partition, and Latency vs Consistency during normal operation. Aurora Global's sub-second replication delay represents "sacrificing Latency to increase Consistency" under the PACELC framework.

## DR Strategy 4 Types: Understanding RTO/RPO Through Mathematics

The difference between "memorizing" and "understanding" the 4 DR strategies becomes apparent in scenario variation questions. Think of each strategy's cost, RTO, and RPO as trade-off curves.

| Strategy | RTO | RPO | Cost Index | Key Mechanism |
|------|-----|-----|----------|------------|
| **Backup & Restore** | Hours to days | Backup interval (hourly) | 1x | Store snapshots in S3, then restore |
| **Pilot Light** | 30 minutes to 2 hours | Minutes | 3~5x | Keep only DB replication, turn off app servers |
| **Warm Standby** | Minutes to 30 minutes | Minutes | 10~20x | Operate a scaled-down full stack continuously |
| **Multi-Site Active-Active** | ~0 (immediate) | ~0 (real-time) | 50~100x | Both regions process traffic simultaneously |

> 📚 **Case Study**: 2017 Amazon S3 us-east-1 outage. An AWS engineer mistakenly applied a maintenance script to a larger subsystem, causing rapid server reduction and S3 indexing service shutdown. Many services using S3 as Origin went down together. After this incident, AWS reemphasized Control Plane isolation and the Pilot Light pattern's importance. Lesson: storing everything in a single region means unexpected operational mistakes become total failures.

### Backup & Restore Internal Operation

S3 Cross-Region Replication (CRR) asynchronously replicates objects between S3 buckets. With Replication Time Control (RTC) enabled, it guarantees SLA that most objects replicate within 15 minutes. For databases, RDS snapshots are manually or automatically copied to other regions. Disaster recovery procedure:
1. Pre-prepare VPC, subnets, and security groups in target region (via Infrastructure as Code)
2. Restore RDS instance from latest snapshot
3. Launch instances from EC2 AMI
4. Switch DNS

Restoration time stretches not because of simple "copying" but because of **instance initialization, data hydration, and application startup** in sequence.

### Pilot Light: Keeping Only the Core Running

Pilot Light takes its name from a gas stove's pilot light—always burning at minimum. Typically only DB replication stays on while application tier (EC2, ECS) has only AMI prepared and is shut down or runs minimal instances. During failure, expand the Auto Scaling group and switch DNS.

> ⚠️ **Pitfall**: In Pilot Light, DNS switching alone doesn't complete recovery. If the standby region's EC2 instances don't exist, Auto Scaling takes 10–20 minutes to boot new instances. The 30-minute RTO figure includes this boot time. If scenarios require RTO "within 15 minutes," Pilot Light is borderline—Warm Standby is safer.

### Warm Standby: A Scaled-Down Full Stack

Warm Standby operates a complete stack in the standby region at reduced capacity. Example: if production runs m5.2xlarge × 10, standby runs m5.large × 2. During failure, Auto Scaling expands to match production capacity. Since all services are already running, RTO is on the order of minutes.

### Multi-Site Active-Active: The Most Complex Pattern

Active-Active means both regions simultaneously process real traffic. This requires:
- **Data Tier**: Master-master replication (DynamoDB Global Tables) or single write region + read replicas (Aurora Global Database)
- **Compute Tier**: Independent Auto Scaling groups and ECS clusters per region
- **DNS Tier**: Route 53 Latency or Geolocation routing
- **Session/State**: Redis ElastiCache Global Datastore or DynamoDB session storage

> 🔍 **Deeper Dive**: Master-master write conflict in Active-Active. DynamoDB Global Tables uses Last-Write-Wins (LWW) strategy. If both regions simultaneously modify the same item, the write with the later timestamp wins. This becomes problematic: a user writes balance $100 → $80 in Seoul, and simultaneously writes $100 → $90 in Tokyo. When the writes collide with 1ms difference, the final value becomes $80 or $90, but there's no way to know "which is correct." This is why financial systems can't use Global Tables directly. Solution: Aurora Global Database with single Primary write region only; Secondaries read-only.

## Data Replication Service-Specific Internal Mechanisms

Understanding how each service differs in replication lets you immediately select the appropriate service in scenarios.

| Service | Replication Method | RPO | Consistency Model | Write Direction |
|--------|---------|-----|-----------|---------|
| **S3 CRR** | Asynchronous event-based | 15 min (RTC) / hours | Eventual consistency | One-way (bidirectional optional) |
| **DynamoDB Global Tables** | Asynchronous Kinesis-based | 1~2 seconds | Eventual consistency (LWW) | Master-master |
| **Aurora Global Database** | Storage-level Redo log async | <1 second | Strong consistency (single Primary) | Primary write-only |
| **RDS Cross-Region Read Replica** | Asynchronous binlog/WAL | Seconds | Eventual consistency | One-way (promote for DR) |
| **EFS Replication** | Asynchronous | ~1 minute | Eventual consistency | One-way |
| **ElastiCache Global Datastore** | Asynchronous | ~1 second | Eventual consistency | Primary write |

> 💡 **Related Theory**: Aurora Global Database's innovation is **storage-level replication**. Traditional RDS sends binlog from Primary to Replica (logical replication), requiring 4 steps: query processing + log generation + transmission + re-execution, causing seconds of delay. Aurora Global has storage nodes directly stream Redo logs over the network, almost eliminating Primary compute overhead and delivering via dedicated replication network (< 1 second). This is the physical mechanism enabling "RPO < 1 second."

## Route 53 ARC (Application Recovery Controller)

Route 53 ARC is a "switchboard" for safely controlling multi-region failover. Standard Route 53 Failover routing automatically switches when Health Check fails; ARC's Routing Control lets engineers **intentionally** switch traffic.

**Why isn't automatic always better?** When it's unclear if a failure is real or just a network momentary delay, automatic failover causes "flapping"—if the original region briefly recovers then fails again, traffic bounces back and forth, creating worse user experience. ARC Routing Control prevents this via a safety cluster.

ARC's internal structure:
- **Control Panel**: Zookeeper-based consensus cluster distributed across 5+ AZs
- **Routing Control**: On/off switches (connected to Route 53 Health Checks)
- **Safety Rule**: Minimum N controls must remain on before others can turn off (prevents complete blackout during failover)

> 🎯 **Scenario**: A global payment platform operates us-east-1 and eu-west-1 in Active-Active. If us-east-1 shows failure signs and "automatically" switches, false positives are possible. The SRE team judges and manually presses the switch to change, with Safety Rule enforcing "at least one region always receives traffic." This is the ARC Routing Control use case.

## Traffic Distribution: Route 53 vs CloudFront vs Global Accelerator

All three services relate to global routing but operate at completely different layers.

| Service | Operating Layer | Routing Basis | Failover Speed | Caching |
|--------|---------|-----------|------------|------|
| **Route 53 LBR** | DNS (L7) | Region latency measurement | DNS TTL dependent (60~300 seconds) | ❌ |
| **CloudFront** | HTTP (L7) | Edge cache PoP | Immediate (at edge) | ✅ |
| **Global Accelerator** | BGP Anycast (L4) | Packet-level shortest path | Tens of seconds | ❌ |

> 💡 **Related Theory**: BGP Anycast uses BGP (Border Gateway Protocol, RFC 4271), the internet's routing protocol, to advertise the same IP address from multiple locations. Internet routers route via "shortest AS path," so traffic automatically flows to the AWS PoP closest to the user. Global Accelerator works on this principle. Route 53, conversely, puts a specific IP in DNS responses; once a client caches that IP, it continues using it throughout the TTL.

## Global Architecture Diagram: Active-Active

```
User (Seoul)          User (London)
      │                     │
      ▼ DNS Query            ▼ DNS Query
   Route 53 Latency-Based Routing
      │                     │
      ▼ Seoul selected       ▼ Ireland selected
 ap-northeast-2          eu-west-1
 ┌─────────────┐        ┌─────────────┐
 │ ALB         │        │ ALB         │
 │ ECS/EKS     │        │ ECS/EKS     │
 │ Aurora PG   │◄──────►│ Aurora PG   │
 │ (Primary)   │ <1sec  │ (Secondary) │
 │ DynamoDB    │◄──────►│ DynamoDB    │
 │ Global Tbl  │  LWW   │ Global Tbl  │
 └─────────────┘        └─────────────┘
      │                     │
      └──── R53 ARC ─────────┘
           (failover switch)
```

During failure: Route 53 Health Check detects ap-northeast-2 ALB failure → exclude that record → all traffic routes to eu-west-1. Aurora: promote Secondary to Primary (< 1 minute). ARC Safety Rule enforces "disable ap-northeast-2 only when eu-west-1 is alive."

> 📚 **Case Study**: Netflix's multi-region strategy (Chaos Engineering, 2011~). Netflix used Chaos Monkey to randomly terminate instances in production. Later, Chaos Kong tested shutting down entire regions. This process revealed Active-Active vulnerabilities (DynamoDB conflicts, session stickiness issues, Cassandra replication delays) and fixed them. Lesson: multi-region isn't complete from design alone. Real failure drills are needed for RTO/RPO numbers to become reality.

> 🔍 **Deeper Dive**: Aurora Global Database's Managed Planned Failover vs Unplanned Failover. Planned failover: flush all writes from Primary to Secondary before promoting Secondary to Primary, completing with RPO=0. Unplanned failover: Primary suddenly dies, Secondary promotes with ~1 second of Redo log loss. In exams, "RPO < 1 second" is Unplanned basis; "RPO = 0" is Planned basis.

## Stateful vs Stateless Design Principles

In multi-region, failure recovery speed ultimately comes down to **where state lives**.

- **Stateless components** (Lambda, ECS Task, EC2 application server): don't hold state, so instantly replaceable in any region. Multi-region optimal.
- **Stateful components** (RDS, ElastiCache, local filesystem): state must replicate to other regions. Replication delay equals RPO.

Design principle: **Externalize state as much as possible.** Store sessions in DynamoDB or ElastiCache, files in S3, configuration in SSM Parameter Store or AppConfig. The compute tier itself should be completely stateless for multi-region failover simplification.

> 💡 **Related Theory**: 12-Factor App methodology (Heroku, 2012) Factor VI "Processes": processes must be stateless, and persistent data must be stored in external Backing Services (DB, queue, cache). This principle underpins Cloud-Native design and is a prerequisite for multi-region availability.

## Cost Considerations: Monthly Estimates by DR Pattern

| Strategy | Major Cost Items | Monthly Cost Example (assuming $10K/month production us-east-1 baseline) |
|------|-------------|---------------------------------------------|
| Backup & Restore | S3 storage + data transfer | ~$200~500/month |
| Pilot Light | DB replication instance + networking | ~$1,000~2,000/month |
| Warm Standby | Scaled-down stack operating cost | ~$3,000~5,000/month |
| Active-Active | Full stack × 2 | ~$10,000+/month |

> 🎯 **Scenario**: A SaaS company specifies "RTO 4 hours, RPO 1 hour" as requirements while saying "minimize cost." This condition is achievable with Backup & Restore. If Warm Standby appears in options and you choose it just because it offers better RTO, you've ignored the "minimize cost" keyword. Pro exams always factor cost-efficiency between "good enough solutions" and "over-engineered ones."

## 📝 연습 문제

**문제 1.** A global financial service operates Aurora PostgreSQL in us-east-1. It wants to set up a DR region in eu-west-1 requiring RPO < 1 second and RTO < 1 minute. Cost is not a major constraint. Which configuration is most suitable?

A) RDS Cross-Region Read Replica + manual promotion
B) Aurora Global Database + Route 53 Failover Health Check
C) DMS CDC for real-time synchronization + cutover
D) S3 snapshot backup + restore

**정답: B**
해설: Aurora Global Database achieves RPO < 1 second through storage-level replication, and promoting Secondary to Primary takes < 1 minute during failure. A has RPO of seconds to tens of seconds, not guaranteeing 1 second, with longer RTO. C is unsuitable for DR (migration tool). D fails RPO/RTO requirements.

---

**문제 2.** An e-commerce operates DynamoDB in us-east-1. It needs identical data in ap-southeast-1, with writes occurring in both regions. Conflicts are acceptable as long as "eventual convergence" occurs. Which service is suitable?

A) Aurora Global Database
B) DynamoDB Global Tables
C) ElastiCache Global Datastore
D) RDS Cross-Region Read Replica

**정답: B**
해설: Bidirectional (master-master) writes + eventual consistency (LWW) = exact DynamoDB Global Tables use case. Aurora Global has single Primary (unidirectional write). ElastiCache Global Datastore is for caching. RDS Read Replica is unidirectional.

---

**문제 3.** A company must choose a DR strategy requiring "RTO 15 minutes, RPO 5 minutes." Cost should be minimized. Which DR pattern is most suitable?

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**정답: C**
해설: Warm Standby's continuously operated scaled-down stack achieves RTO minutes to 15 minutes, RPO minutes. Pilot Light has uncertain 15-minute RTO due to app server boot time. Active-Active violates cost minimization. Backup & Restore has hours RTO, unsatisfactory.

---

**문제 4.** In multi-region Active-Active, an SRE team wants to "intentionally, safely" control region failover manually. They want to prevent flapping risk from automatic failover. Which service do they use?

A) Route 53 Failover routing (automatic Health Check)
B) Route 53 ARC (Application Recovery Controller)
C) CloudWatch Alarm + Lambda automation
D) Global Accelerator traffic dial

**정답: B**
해설: Route 53 ARC enforces via Safety Rule "must keep minimum N controls on before switching," preventing flapping and complete blackouts. Manual switches ideal for intentional failover. A is automatic switching with flapping risk. C incurs custom automation operational overhead.

---

**문제 5.** Due to GDPR, EU user data must store only in EU regions. A single codebase must operate us-east-1 (US users) and eu-west-1 (EU users). Which method guarantees data isolation?

A) DynamoDB Global Tables (auto-replicate both regions)
B) Aurora Global Database (Read Replica in eu-west-1)
C) Independent DynamoDB per region + Route 53 Geolocation routing
D) S3 Cross-Region Replication + Presigned URL

**정답: C**
해설: Both A and B replicate data to both regions, violating GDPR data residency requirements. D has S3 CRR copying data to the US, also violating requirements. C alone isolates data per region and routes EU users to eu-west-1 via Route 53 Geolocation.

---

**문제 6.** A company configured multi-region Active-Active, but rarely the same user record gets modified simultaneously in both regions, causing inconsistency. Since it's a financial system, conflicts are unacceptable. How to resolve?

A) Use DynamoDB Global Tables' LWW as-is
B) Use Aurora Global Database to allow only single Primary writes
C) Auto-merge conflicts via Lambda
D) Process all writes only from a single-AZ EC2

**정답: B**
해설: Financial system, no conflicts = single write point required. Aurora Global Database allows writes only in Primary region, Secondary read-only, making conflicts impossible. RPO < 1 second also enables disaster recovery. A allows conflicts. C has merge logic complexity and error potential. D defeats multi-region purpose.

---

**문제 7.** A game company serves global users with UDP-based matchmaking servers. us-east-1 failure must failover to ap-northeast-2 within seconds. Which service to choose?

A) Route 53 Latency-Based Routing
B) CloudFront + Lambda@Edge
C) Global Accelerator + NLB
D) API Gateway Regional endpoint

**정답: C**
해설: UDP protocol support + seconds-level failover (bypassing DNS cache) = Global Accelerator. Route 53 LBR has minutes failover due to DNS TTL. CloudFront doesn't support UDP. API Gateway HTTP-only.

---
