# Day 1 - Why Availability Zones and Regions Split Along the Cost Called "Physical Distance"

When you first learn cloud, you memorize a one-line formula: "Multi-AZ is high availability, Multi-Region is disaster recovery." But this formula states only the outcome, not the reason. Why does AWS bother placing multiple Availability Zones inside a single region, and why did it design the distance between those AZs to be "far enough, but not too far"? Hidden in the answer to that question is the most fundamental trade-off of distributed systems — **you cannot optimize physical distance, data consistency, and fault isolation all at once**.

An AZ is a cluster of one or more data centers with independent power, cooling, and networking. AZs within the same region are usually tens of kilometers apart, and that distance is not accidental — it's a precisely calculated value. Too close (same building, same substation) and a fire, power outage, or flood could hit two AZs at once, rendering isolation meaningless. Too far and the inter-AZ fiber round-trip latency grows, so **synchronous replication** like RDS Multi-AZ eats into write performance. Light travels about 5 microseconds per km through fiber, so an AZ 100km away adds 1ms just for the round trip. AWS picked a distance between these two that is "far enough that one disaster can't strike both AZs at once, yet close enough for synchronous replication to tolerate." Inter-region distances (thousands of km) blow completely past this synchronous-replication budget, so Multi-Region is inherently asynchronous. This is the true root of the "AZ is HA, Region is DR" formula.

This article follows how two numbers called RTO/RPO, the physical boundaries of AZs and regions, and the resilience services AWS built on top of those boundaries form one coherent design language. The resilience domain of the SAA exam looks like table memorization, but it's really a design problem: deciding "the blast radius of failure this workload must survive" and choosing the isolation level and replication mode to match.

## Why Are RTO and RPO Two Independent Axes?

The first two acronyms that come up when discussing resilience are RTO and RPO. **RTO (Recovery Time Objective)** is "the allowable time from failure to service recovery" — the upper bound on downtime. **RPO (Recovery Point Objective)** is "how far behind the failure point the recovery point may be" — the width of data you can afford to lose. Beginners often lump the two together, but they are entirely independent axes solved by entirely different technologies.

RPO is determined by the **replication method**. Back up once a day and your RPO is up to 24 hours (data from yesterday's backup until today's failure vanishes). Asynchronously replicate transaction logs every 5 minutes and your RPO is about 5 minutes. Synchronous replication (a write succeeds only after it commits on both sides) drives RPO close to 0, but because of the distance/latency budget seen above, it's only realistic between nearby AZs. RTO, on the other hand, is determined by the **degree of automation in the recovery procedure**. Building and booting fresh infrastructure from backups takes hours (high RTO); switching traffic to a warm standby takes minutes or seconds (low RTO).

> 💡 **Related theory**: Trying to drive both RTO and RPO to 0 runs into a wall in distributed systems theory. The **CAP theorem** says you cannot simultaneously guarantee Consistency and Availability during a network Partition. Bind two regions with synchronous replication to chase RPO 0 (strong consistency), and when one region is partitioned you must block writes, so availability drops (RTO worsens). That's why between distant regions you usually concede a little consistency (asynchronous replication, RPO of seconds) and choose availability. Going a step further, the **PACELC theorem** holds that "even in normal times without a partition (Else), you must choose between Latency and Consistency" — synchronous replication increases write latency even in normal operation because it waits for remote commits. The RTO/RPO trade-off is ultimately CAP/PACELC translated into business language.

> ⚠️ **Pitfall**: Treat RTO and RPO as one lump and you'll get exam questions wrong. The scenario "RPO of 1 hour is fine, but RTO must be under 5 minutes" is common — it means you can lose an hour of data but the service must recover fast. Here, expensive synchronous replication (RPO 0) is overkill; the correct answer is asynchronous replication + rapid automatic failover. Conversely, if "RPO 0 is mandatory," you must swallow the cost and go with synchronous replication (Multi-AZ, Aurora) or Active-Active.

## How Multi-AZ Creates "No Downtime Even When One AZ Dies"

The core of Multi-AZ high availability is **replicating state across multiple AZs in advance, and scattering stateless compute across multiple AZs**. Splitting these two layers makes each service's behavior crisp.

The stateless layer is easy. Stretch an **Auto Scaling Group** across subnets in multiple AZs, and even if one AZ disappears entirely, the ASG spins up new instances in other AZs to restore target capacity. An **Elastic Load Balancer** inherently places nodes in multiple AZs and sends traffic only to healthy targets, so instances in a dead AZ drop out of health checks and are automatically bypassed. Here, ELB's **Cross-Zone Load Balancing** matters — it must be on for traffic to spread evenly across targets in all AZs even when instances are unevenly distributed (ALB is on by default, NLB is off by default, which is an exam point).

The stateful layer diverges by replication mode. **RDS Multi-AZ** **synchronously replicates** every write on the primary DB to a standby in another AZ, and if the primary dies, it automatically switches the DNS endpoint to the standby (usually 60–120 seconds) — the standby is a pure standby copy that normally takes no read traffic (read distribution is the separate job of a Read Replica). **Aurora** goes further: it sits atop distributed storage that replicates data 6 ways across 3 AZs, so even if one AZ vanishes the storage survives and failover usually finishes within 30 seconds. **EFS** is inherently a regional service that distributes data across multiple AZs, and **S3** replicates objects across at least 3 AZs in the Standard class (only One Zone-IA is single-AZ, making it vulnerable to AZ failure — a perennial exam trap).

> 🔍 **Going deeper**: "Why does RDS Multi-AZ failover take about 60 seconds rather than instantly (0 seconds)" resolves once you know the internal behavior. AWS begins failover only after detecting the primary's failure through **consecutive health-check failures** — a safeguard to avoid unnecessary failover on a brief network blip. After detection, it promotes the standby to the new primary and repoints the IP that the RDS endpoint (CNAME) resolves to at the new instance. Here **client-side DNS caching** is the hidden gotcha — if the application or JVM caches DNS results for a long time, it keeps trying to connect to the dead primary even after the endpoint changes. So to receive RDS failover quickly, the practical pattern is to set a short DNS TTL (e.g., 5 seconds) on the connection pool. Aurora mitigates this problem with the **cluster endpoint**, making promotion faster.

> 📚 **Case study**: The large-scale AWS us-east-1 outage on December 7, 2021, laid bare the danger of single-region dependence. An automated scaling activity of internal network devices ran away and overloaded the internal network, which paralyzed the control plane of core APIs like EC2, DynamoDB, and Lambda for hours. The crucial lesson is that **even if the data plane (already-running instances) is alive, automatic recovery halts when the control plane (creating new instances, scaling, API calls) is dead**. Even workloads scattered across Multi-AZ can't recover if "the API that launches new instances" is blocked. After this incident, many companies re-examined their architectures to avoid placing global dependencies in us-east-1, and the recognition that "a region, too, is a failure domain" spread widely.

## What Does Multi-Region Buy, and What Does It Give Up?

The moment you cross a region boundary, the era of synchronous replication ends. Thousands of km of distance force round-trip latencies of tens to hundreds of ms, and you can't wait out that latency on every single write. So the data layer of Multi-Region is almost always **asynchronous replication**, or a special design that resolves conflicts cleverly.

- **S3 Cross-Region Replication (CRR)**: Asynchronously replicates objects to a bucket in another region. Most complete within minutes, but there's no guarantee (turn on S3 RTC for a 15-minute SLA). Same-region replication is SRR, used for compliance and log aggregation.
- **DynamoDB Global Tables**: Creates an **Active-Active, writable-everywhere** NoSQL across multiple regions. Conflicts are auto-resolved by **last-writer-wins**, and replication lag is usually under 1 second. When the keyword "5-region active-active NoSQL" appears, it's almost always the answer.
- **Aurora Global Database**: One region is primary (writes), up to 5 regions are read-only replicas. With dedicated replication infrastructure, replication lag is usually under 1 second, and on a regional failure you can usually promote a secondary region to writable within a minute.
- **RDS Cross-Region Read Replica**: A simple asynchronous read replica. Higher replication lag and slower promotion than Aurora Global, but used with non-Aurora RDS engines.

> 💡 **Related theory**: The secret to how DynamoDB Global Tables takes writes in multiple regions simultaneously without breaking into "split-brain (both sides holding different truths)" is **pre-defining the conflict-resolution rule**. Last-writer-wins is the simple rule that each write carries a timestamp and the latest one wins. This is the **eventual consistency** model of distributed systems — it accepts that "values may differ per region for a moment, but once replication converges they'll be identical in the end." The price of giving up strong consistency is the availability of every region always accepting writes (the AP choice). Aurora Global, conversely, funnels writes to one region to preserve consistency (single writer), and if that region dies it pays the procedural cost of promotion (RTO about 1 minute) — same Multi-Region, but a different side of CAP was chosen.

> ⚠️ **Pitfall**: "Multi-AZ gives you disaster recovery" is the most common wrong answer. Multi-AZ is isolation within the same region, so it's powerless against a disaster covering an entire region (the earlier us-east-1 case) or a region-level regulatory requirement. **DR must cross the region boundary** — whether Cross-Region backup, Aurora Global, or CRR. When you see "survive a regional failure" on the exam, filter out every Multi-AZ option as wrong.

## Active-Active vs. Active-Passive, and Resilience Governance

How to route traffic on top of Multi-Region is the next decision. **Active-Active** has both regions taking user traffic simultaneously — you get the fastest recovery (near-0 RTO) and normal-time load balancing, but bidirectional data synchronization and conflict resolution are hard and the cost is doubled. **Active-Passive** has one side primary and the other on standby — data flows in only one direction so it's simple and cheap, but failover incurs some RTO. Rather than reaching for Active-Active and suffering conflict and consistency bugs, the practical instinct is that Active-Passive is enough for most workloads.

You should also know the governance services that underpin all these decisions. **AWS Backup** backs up EBS, EFS, RDS, DynamoDB, S3, and more from one console by policy, and bundles in Cross-Region and Cross-Account copies. **AWS Elastic Disaster Recovery (DRS)** replicates servers in real time at the block level and boots them as EC2 in another region on failure — a cost-efficient Pilot Light tool. **Resilience Hub** assesses an application's resilience, scores whether it meets RTO/RPO targets, and recommends improvements.

> 📚 **Case study**: The S3 us-east-1 outage on February 28, 2017, showed that "even Active-Passive is dangerous when bound to one region." While debugging the billing system, an engineer's command-input typo removed more S3 subsystem servers than intended, and restarting the index and placement systems took hours. What stung more was that even the status icons on AWS's own Service Health Dashboard depended on S3 and couldn't display the outage — a lesson in **circular dependency: a recovery tool must not depend on the thing that's failing**. In this incident, places like Netflix that had long designed for multi-region Active-Active were less affected, while countless single-region-dependent SaaS went down together. The first question of DR design must be "does my recovery path share fate with the failure?"

## Comparing Other Clouds' Resilience Boundaries

Relativizing AWS's AZ/region model makes design choices crisper.

| Dimension | AWS | Azure | GCP |
|------|-----|-------|-----|
| Zone unit | Availability Zone | Availability Zone (+ Availability Set) | Zone |
| Intra-region isolation | 3+ AZs recommended | AZ + availability set/scale set | Zone (about 3 per region) |
| Global DB | Aurora Global, DynamoDB Global Tables | Cosmos DB (multi-region, multi-master) | Spanner (global strong consistency) |
| Global traffic | Route 53 + CloudFront | Traffic Manager + Front Door | Cloud DNS + Cloud Load Balancing (anycast) |

GCP **Spanner** is especially contrasting — it provides **strong consistency** globally via atomic clocks (TrueTime), trying not to give up CAP's consistency. In exchange it's that much more expensive and specialized. Azure **Cosmos DB** is multi-master, close to DynamoDB Global Tables, and is distinctive in letting you pick from 5 consistency levels so the customer tunes "consistency vs. latency" with a slider. Each cloud chose to solve the same Multi-Region problem at a different point on CAP.

## Getting Hands-On with the CLI

```bash
# Enable RDS Multi-AZ (create synchronous standby)
aws rds modify-db-instance --db-instance-identifier orders-db \
  --multi-az --apply-immediately

# Configure S3 Cross-Region Replication
aws s3api put-bucket-replication --bucket prod-src \
  --replication-configuration file://crr.json

# Add a region to a DynamoDB Global Table (Active-Active)
aws dynamodb update-table --table-name Orders \
  --replica-updates 'Create={RegionName=us-east-1}'

# Create an Aurora Global Database (primary + secondary region)
aws rds create-global-cluster --global-cluster-identifier orders-global \
  --source-db-cluster-identifier arn:aws:rds:ap-northeast-2:...:cluster:orders

# Turn on ELB Cross-Zone Load Balancing (NLB is off by default)
aws elbv2 modify-target-group-attributes --target-group-arn arn:... \
  --attributes Key=load_balancing.cross_zone.enabled,Value=true
```

## Wrapping Up

Resilience is a design problem where a single variable — "physical distance" — determines consistency, latency, isolation, and cost all at once. ① An **AZ** is designed close enough for synchronous replication to tolerate yet far enough that one disaster can't strike both at once, so Multi-AZ provides RPO-0 high availability within the same region. ② A **region** exceeds the synchronous-replication budget, so Multi-Region is inherently asynchronous, and S3 CRR, DynamoDB Global Tables, and Aurora Global each solve it with a different CAP choice. ③ **RTO and RPO** are independent axes — RPO is set by replication mode, RTO by the degree of recovery automation. ④ **Active-Active vs. Active-Passive** is a trade of recovery speed against simplicity and cost, and AWS Backup, DRS, and Resilience Hub bind it into governance. The exam repeatedly asks for the ability to map "the blast radius this workload must survive" onto isolation level and replication mode.

In the next article, we'll see how AWS's **4-tier DR strategy (from Backup-Restore to Active-Active)**, built on top of this isolation and replication, incrementally trades off RTO/RPO/cost, and how you should map scenario keywords to each tier.

---

## 📝 연습 문제

**문제 1.** A company must have zero downtime for database writes even during a single-AZ failure, with zero data loss (RPO 0). What is the most appropriate configuration?

A) RDS Cross-Region Read Replica
B) RDS Multi-AZ (synchronous standby)
C) DB backup to S3 One Zone-IA
D) DynamoDB Global Tables

**정답: B**

해설: RDS Multi-AZ **synchronously replicates** every write on the primary to a standby in another AZ, so it guarantees RPO 0, and on a primary failure it recovers near-uninterrupted via automatic failover (about 60–120 seconds). A Cross-Region Read Replica (A) uses asynchronous replication, so it's not RPO 0 and has no automatic failover. One Zone-IA (C) is single-AZ storage, so it's actually more vulnerable to AZ failure. DynamoDB Global Tables (D) is Active-Active NoSQL, not a replacement for an RDS workload, and its cross-region replication is eventually consistent (not RPO 0). The key signal is "synchronous replication for RPO 0."

---

**문제 2.** An architect must design a service to continue in another region even when the entire us-east-1 region is paralyzed. Which of the following does NOT satisfy this requirement?

A) Configuring a secondary region with Aurora Global Database
B) Distributing across 3 AZs with RDS Multi-AZ
C) S3 Cross-Region Replication
D) DynamoDB Global Tables

**정답: B**

해설: RDS Multi-AZ is AZ isolation **within the same region**, so it's powerless against a whole-region failure — it's an HA tool, not a DR tool. To survive a region-level incident like the 2021 us-east-1 outage, you absolutely need replication that crosses the region boundary. Aurora Global (A), CRR (C), and DDB Global Tables (D) all provide cross-region replication so the service can continue in a secondary region. When you see "whole-region failure," filter out every Multi-AZ option as wrong.

---

**문제 3.** A global game company wants to run player profiles across 5 regions as a low-latency NoSQL that can be **read and written in all regions simultaneously**. What is the most appropriate choice?

A) Aurora Global Database
B) DynamoDB Global Tables
C) RDS Cross-Region Read Replica
D) ElastiCache Global Datastore

**정답: B**

해설: DynamoDB Global Tables provides **Active-Active, writable-everywhere** NoSQL across multiple regions, auto-resolves conflicts with last-writer-wins, and typically keeps replication lag under 1 second. Aurora Global (A) allows writes in only one region (single writer), so it doesn't fit "write in all regions simultaneously." A Cross-Region Read Replica (C) is a read-only copy. ElastiCache Global Datastore (D) is a cache layer, not a durable profile store, and it also takes writes only in the primary region. "Multi-region simultaneous-write NoSQL" = Global Tables.

---

**문제 4.** After an RDS Multi-AZ failover, the application keeps trying to connect to the dead instance for a while. What is the most likely cause and remedy?

A) The standby isn't synchronized — restart replication
B) Client-side DNS caching is excessively long — shorten the connection pool's DNS TTL
C) Cross-Zone Load Balancing is disabled — enable it
D) RDS doesn't support Multi-AZ — switch to Aurora

**정답: B**

해설: RDS failover works by repointing the IP that the endpoint (CNAME) resolves to at the new primary, so if the application or JVM caches DNS results for a long time, it can't see the changed IP and keeps connecting to the dead instance. The remedy is to set a short DNS TTL (e.g., 5 seconds) on the connection pool and runtime. A is wrong because a synchronous standby is already up to date at failover, C is an ELB setting unrelated to DB failover, and D misdiagnoses the cause (RDS does support Multi-AZ). This is a textbook case where cache-invalidation timing dictates recovery speed in distributed systems.

---

**문제 5.** A team wants to make RPO 0 between two **regions** via synchronous replication. What is the fundamental problem with this approach?

A) AWS technically doesn't support cross-region synchronous replication at all, so it's impossible
B) Latency from inter-region distance slows every write, and availability drops on a partition (the CAP trade-off)
C) It costs nothing, so there's no problem
D) It's automatically solved by Multi-AZ

**정답: B**

해설: Inter-region distance (thousands of km) forces round-trip latencies of tens to hundreds of ms, so if synchronous replication makes every write wait for a remote commit, write latency grows fatally (PACELC's normal-time consistency-latency trade-off). Moreover, by the CAP theorem, preserving strong consistency during a network partition means blocking writes, sacrificing availability. That's why Multi-Region usually chooses availability with asynchronous replication (RPO of seconds). A is an exaggeration (technical attempts are possible but impractical), C is plainly wrong, and D is wrong because Multi-AZ doesn't solve region-level problems.

---

**문제 6.** A cost-sensitive company wants to prepare for regional failure but tolerates an RPO of 1 hour and an RTO of several hours. What is the most cost-effective starting point for DR?

A) Full-stack Active-Active across two regions
B) Cross-Region snapshots/backups + recover on failure (Backup & Restore)
C) RDS Multi-AZ
D) Synchronously replicate all data

**정답: B**

해설: A loose target of RPO 1 hour and RTO several hours is well served by the cheapest Backup & Restore (copy Cross-Region snapshots, then rebuild infrastructure on failure). Active-Active (A) is the top-priced option for near-0 RTO/RPO and is overkill for the requirement, Multi-AZ (C) isn't for regional-failure protection, and synchronous replication (D) is impractical and expensive across regions. The key is "loose RTO/RPO + cost-sensitive = pick the cheapest tier." Over-engineering beyond the required resilience level is itself a waste.

---

**문제 7.** Instances were placed across two AZs behind an NLB, but traffic isn't evenly distributed because instances are concentrated in one AZ. What is the most appropriate action?

A) Enable Cross-Zone Load Balancing on the NLB
B) Consolidate all instances into one AZ
C) ALB lacks this feature, so keep only the NLB
D) Replace with Route 53 Weighted

**정답: A**

해설: NLB has Cross-Zone Load Balancing **off by default**, so each AZ's load balancer node sends traffic only to targets in its own AZ, and if instance distribution is uneven, traffic becomes uneven too. Enabling it spreads traffic evenly across targets in all AZs (ALB is on by default). B goes the opposite direction and harms availability, C is the reverse of the truth (ALB is on by default), and D can't solve an instance-level distribution problem with DNS weighting. The exam point is that the NLB's default differs from the ALB's.

---

## 📌 Key Takeaways

Resilience is a design problem where physical distance determines consistency, latency, isolation, and cost all at once. An AZ is designed close enough for synchronous replication to tolerate yet far enough that one disaster can't strike both at once, so Multi-AZ provides RPO-0 HA within the same region. A region exceeds the synchronous-replication budget, so Multi-Region is inherently asynchronous, and S3 CRR, DynamoDB Global Tables (Active-Active, last-writer-wins), and Aurora Global (single writer, promotion RTO about 1 minute) each solve it with a different CAP/PACELC choice. RTO (recovery automation) and RPO (replication mode) are independent axes, and "Multi-AZ is not DR" is the key pitfall. The 2021 us-east-1 and 2017 S3 incidents left the lesson that a region, too, is a failure domain and that a recovery path must not share fate with the failure.
