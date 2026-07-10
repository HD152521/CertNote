# Day 5 - Threading Resilience, DR, and Migration Onto a Single Decision Tree

This week covered three topics: "how do you endure failure, how do you recover from disaster, and how do you move workloads." On the surface they look separate, but the three converge on one question — **"what is the worst this system must survive, and how much will you spend to survive it."** Is it a single-AZ failure or a whole-region blackout? Can you not lose even one second of data, or is an hour tolerable? Is what blocks the move downtime or bandwidth? Reading these constraints precisely and mapping them to the right-cost tool is the essence of SAA Domain 2 (Resilience). This article compresses the week's core into a decision tree, then burns that mapping into muscle memory with the kind of compound scenarios the real exam throws at you.

## The Three Axes That Run Through the Whole Week

Every decision this week ultimately sits on three axes.

**First, the blast radius of failure sets the isolation level.** If you must stay up even when one AZ dies, that's Multi-AZ (synchronous replication within the same region, RPO 0). If you must survive even a whole-region blackout, that's Multi-Region (asynchronous replication, DR). "Multi-AZ is not DR" was the week's biggest trap — Day 1's 2021 us-east-1 incident showed that "a region, too, is a failure unit."

**Second, RTO and RPO set the DR tier and the cost.** RPO (data you can afford to lose) is decided by the replication method; RTO (tolerable downtime) is decided by how ready your compute is. The smaller both get, the higher you climb toward the expensive end of the DR spectrum (Backup-Restore → Pilot Light → Warm Standby → Active-Active). Day 2's core point was that "a design exceeding the required resilience is itself a waste" — for loose RTO/RPO, a cheap tier is enough.

**Third, the kind of constraint sets the tool.** Where to send traffic is solved by Route 53 routing policies (Day 3); how to move a workload is solved by migration tools (Day 4). For low DB downtime it's DMS+CDC, for low bandwidth on large files it's Snow vs. DataSync, and for server relocation the tool is MGN.

### The Core Comparisons That Are Easy to Confuse

| Comparison | Left | Right | Deciding criterion |
|------|------|--------|-------------|
| Multi-AZ vs. Multi-Region | HA (synchronous, RPO 0) | DR (asynchronous) | Blast radius (AZ or region) |
| Aurora Global vs. Cross-Region RR | Single writer, promotion ~1 min | Asynchronous read replica | Promotion speed, dedicated replication infrastructure |
| DynamoDB Global Tables vs. Aurora Global | Multi-region simultaneous writes (AP) | Single-region writes (consistency) | Number of writable regions |
| Pilot Light vs. Warm Standby | App OFF, DB replicating | Scaled-down full stack ON | Compute readiness |
| DMS vs. MGN | DB data (CDC) | Whole server (block) | Unit being moved |
| MGN vs. DRS | One-time migration | Continuous DR | Purpose (relocation or recovery) |
| DataSync vs. Storage Gateway | Migration/replication (one-time or periodic) | Permanent hybrid cache | Temporary or permanent |
| Snow vs. DataSync | Offline (insufficient network) | Online (sufficient bandwidth) | Transfer time = line speed × data volume |
| Alias vs. CNAME | Root domain OK, free | Not allowed at zone apex | Zone apex constraint |
| Latency vs. Geolocation | Fastest region | User location (regulation, language) | Speed or location |

> 💡 **Related theory**: Beneath all these comparisons lies the **CAP/PACELC** we saw on Day 1. In Multi-Region, choosing "simultaneous writes across regions" (DynamoDB Global Tables) is the AP choice — conceding consistency to gain availability; choosing "writes in one region only" (Aurora Global) preserves consistency but pays the procedural RTO of failover. The 4 DR tiers, too, are ultimately CAP translated into business language: trading cost against "how fast and how accurately you recover during a partition or failure." This is exactly why resilience design is solved by reasoning rather than memorization — it's a consistent logic that weighs cost against endurance on top of the fundamental constraints of distributed systems.

> ⚠️ **Pitfall**: Here are the week's four recurring traps bundled together. ① **Mistaking Multi-AZ for DR** — an AZ is isolation within the same region, so it's powerless against a regional failure. ② **Confusing RTO with RPO** — they are independent axes, so the scenario "RPO is loose but RTO is tight" is common. ③ **CNAME on a root domain** — impossible due to the zone apex constraint; Alias is the answer. ④ **Keeping backups in the same account as production** — the hand that deleted production deletes the backups too (Code Spaces). The instant you spot any of these four, you should reflexively filter out the wrong answers.

## Integrated Architecture: The Picture Where Every Piece of the Week Meets

```
[ Multi-Region DR + Migration, Integrated ]

  ┌─ Region A (Primary, production) ───────────┐
  │  Route 53 Alias(example.com) → CloudFront  │
  │     → ALB → ECS(Auto Scaling, multi-AZ)    │
  │     → Aurora Global Writer (RPO ~1s)       │
  │  S3 (Standard, 3+ AZ) ──CRR──▶ Region B    │
  │  AWS Backup → Vault Lock(WORM) + separate  │
  │               account                       │
  └────────────────────────────────────────────┘
                    │ asynchronous replication
                    ▼
  ┌─ Region B (DR, Warm Standby) ──────────────┐
  │  ALB(always on) → ECS(scaled down,         │
  │                   scale up on failure)      │
  │  Aurora Global Reader (~1 min promotion    │
  │                        on failure)          │
  └────────────────────────────────────────────┘

  Route 53 Failover/ARC: Primary unhealthy → Secondary
   (Health Check + ARC Readiness continuously verify readiness)

  [ Migration inbound paths ]
   On-prem DB(Oracle) ─SCT+DMS(CDC)─▶ Aurora
   On-prem 200 VMs  ─MGN(block replication)─▶ EC2
   On-prem files(NFS) ─DataSync(ample bandwidth)─▶ S3
   Petabytes offline ─Snowball Edge Cluster─▶ S3
```

This single diagram contains every concept of the week — Multi-AZ HA (multi-AZ ECS), Multi-Region DR (Aurora Global + CRR), the Warm Standby tier, Route 53 Alias/Failover/ARC, immutable backups, and the four migration paths. The exam's compound questions usually peel off one piece of this picture and ask "what should you choose here."

> 📚 **Case study**: Netflix's chaos engineering, which we saw on Day 2, is the final piece that turns this integrated architecture from "a document into a verified system." No matter how meticulously you draw it, until you actually kill Region A you can't know whether Region B's ECS truly scales up, whether Aurora promotion truly finishes in a minute, or whether ARC Readiness truly catches a shortfall. The week's operational philosophy — "a backup you haven't tested is not a backup, and a DR you haven't drilled is not DR" — is what breathes life into this picture. The reason SAA is an architect certification is precisely that it asks not for a mere list of services but for the judgment to make "does this design truly endure" verifiable.

## 📝 시나리오 연습 문제

**문제 1.** A global fintech must keep serving even during a whole-region failure, with an RTO of 30 seconds and RPO near 0. Cost is secondary. What is the most appropriate architecture?

A) Backup & Restore + Cross-Region snapshots
B) Pilot Light (DB replication + app OFF)
C) Warm Standby (scaled-down full stack)
D) Multi-Site Active-Active (Aurora Global + DynamoDB Global Tables + Route 53)

**정답: D**

해설: RTO 30 seconds and RPO near 0 are met only by Active-Active, the fastest end of the DR spectrum — both regions take traffic simultaneously, so even if one dies the switchover delay is near zero. Backup-Restore (A) takes hours to days of RTO, Pilot Light (B) takes minutes to tens of minutes to boot and scale the app, and Warm Standby (C) takes several minutes to scale up — none can hit 30 seconds. "Cost secondary + extremely tight RTO/RPO" = Active-Active. When the requirement points to the expensive end, don't hesitate — pick the top tier.

---

**문제 2.** A company is designing DR for an internal reporting system with an RTO of 12 hours and RPO of 6 hours, minimizing cost. What is the appropriate strategy?

A) Multi-Site Active-Active
B) Warm Standby
C) Pilot Light
D) Backup & Restore

**정답: D**

해설: The very loose target of RTO 12 hours and RPO 6 hours is well served by the cheapest Backup & Restore — you keep Cross-Region snapshots and rebuild infrastructure fresh on failure. This is the exact opposite end from Question 1. Active-Active (A) and Warm Standby (B) are high-cost options for minute-scale RTO and are overkill, and Pilot Light (C) also incurs continuous replication cost, which is unnecessary hot data when RPO is 6 hours. "Loose RTO/RPO + minimal cost = the lowest tier." The Day 2 principle that over-provisioned design is waste is the key.

---

**문제 3.** A game company wants to run player inventory across 5 regions worldwide as a low-latency NoSQL that is **read and written in all regions simultaneously**. What is the appropriate service?

A) Aurora Global Database
B) DynamoDB Global Tables
C) RDS Cross-Region Read Replica
D) ElastiCache for Redis

**정답: B**

해설: DynamoDB Global Tables provides Active-Active NoSQL writable from every region, auto-resolves conflicts with last-writer-wins, and typically keeps replication lag under 1 second. Aurora Global (A) allows writes in one region only (single writer), so it doesn't fit "simultaneous writes in all regions," a Cross-Region RR (C) is a read-only copy, and ElastiCache (D) is a cache, not a durable inventory store. "Multi-region simultaneous-write NoSQL" = Global Tables. Understanding that this is an AP design — conceding consistency to choose availability under CAP — makes it certain.

---

**문제 4.** A research institution must move 200 TB of data from a remote, low-bandwidth region to S3. Over the network it would take months. What is the appropriate method?

A) DataSync
B) Snowball Edge Storage Optimized (cluster)
C) DMS
D) S3 Transfer Acceleration

**정답: B**

해설: Transferring 200 TB online over low bandwidth takes months, so offline physical devices are the answer — Snowball Edge Storage Optimized holds about 80 TB per device, so 200 TB is handled by a multi-device cluster. DataSync (A) and Transfer Acceleration (D) ride the network, so they're meaningless when the line is the bottleneck, and DMS (C) is a DB migration tool. The Day 4 judgment is key: estimate transfer time from line speed × data volume, and once you cross the break-even point, choose Snow.

---

**문제 5.** A company wants to connect the root domain `shop.com` to a CloudFront distribution, but the CNAME setting is rejected. What is the correct solution?

A) Route 53 Alias record
B) Enter the CloudFront IP directly in an A record
C) Force-add a CNAME at the zone apex
D) Weighted routing

**정답: A**

해설: You cannot place a CNAME at the zone apex (root domain) — it conflicts with the mandatory SOA and NS records. A Route 53 Alias behaves like an A record and points at AWS resources like CloudFront, sidestepping this constraint, and it's free. B is impossible because CloudFront IPs are dynamic, C is rejected as a standards violation, and D is a traffic-distribution policy and irrelevant. "Root domain + AWS resource" = Alias. This is Day 3's core trap.

---

**문제 6.** A SaaS wants to route worldwide users to the **region with the lowest network latency**. What is the appropriate Route 53 policy?

A) Geolocation
B) Latency
C) Weighted
D) Geoproximity

**정답: B**

해설: Latency routing measures the actual network latency from the user to each region and sends them to the fastest one. Geolocation (A) is based on geographic location, so near borders it can miss a region that's faster over the network; Weighted (C) is weighted distribution; and Geoproximity (D) tunes with location + bias, so "lowest latency" isn't its purpose. The distinction between "fastest / lowest latency" = Latency and "which country / regulation, language" = Geolocation is an exam regular.

---

**문제 7.** A financial company needs backups to be tamper-proof for regulatory compliance, so that **not even the root user can delete them** within the retention period. What is the appropriate control?

A) Deny deletion with an IAM policy
B) AWS Backup Vault Lock (Compliance mode)
C) S3 bucket policy
D) MFA Delete

**정답: B**

해설: AWS Backup Vault Lock's Compliance mode locks backups as WORM so that within the retention period not even root can delete or alter them, meeting immutable-backup requirements for regulation and ransomware defense. An IAM policy (A) and an S3 bucket policy (C) can be bypassed or changed by a privileged principal (especially root), and MFA Delete (D) merely requires MFA to delete S3 objects — it's not the immutability that enforces retention. "Tamper-proof, not even root can delete" = Vault Lock. This is the Day 2 lesson that modern DR assumes even ransomware and insider deletion.

---

**문제 8.** A team wants to permanently relocate 200 VMs from an on-premises data center to AWS EC2 without code changes. What is the appropriate tool?

A) AWS DMS
B) AWS Application Migration Service (MGN)
C) AWS DataSync
D) AWS Elastic Disaster Recovery (DRS)

**정답: B**

해설: The automation tool for lift-and-shift (Rehost) — moving a server, OS and application whole, to EC2 without code changes — is MGN, which does block-level real-time replication and then boots as EC2. DMS (A) moves only DB data, DataSync (C) moves only files, and DRS (D) uses the same block replication but its purpose is disaster recovery (the source keeps running, failing over only on failure), which differs from "permanent relocation." MGN = one-time migration, DRS = continuous DR is the key distinction.

---

**문제 9.** A company wants to lower DR cost while continuously replicating data to another region and keeping app servers normally off, then booting them quickly on failure. What is the combination of this strategy and the service that automates it?

A) Backup & Restore — AWS Backup
B) Pilot Light — AWS Elastic Disaster Recovery (DRS)
C) Warm Standby — Auto Scaling
D) Active-Active — Route 53

**정답: B**

해설: "Data continuously replicated (hot), app normally off (cold), booted quickly on failure" is the definition of Pilot Light, and AWS DRS economically automates it via block-level real-time replication (minute-scale RTO). Backup & Restore (A) doesn't continuously replicate data — it only keeps backups; Warm Standby (C) doesn't turn the app off — a scaled-down version is always on; and Active-Active (D) runs both sides as full stacks simultaneously. The difference between Pilot Light and Warm Standby is "is the app on," a Day 2 trap.

---

**문제 10.** An architect wants to switch regional traffic immediately and **explicitly, without relying on health checks**, during failover in a multi-region Active-Active setup, while continuously verifying the secondary region's readiness. What is the appropriate tool?

A) Route 53 Failover policy alone
B) Route 53 Application Recovery Controller (ARC)
C) CloudWatch Alarm
D) GuardDuty

**정답: B**

해설: Route 53 ARC lets an operator switch "100%/0% regional traffic" instantly via routing controls without relying on health checks, and it continuously verifies the secondary region's capacity, quota, and configuration readiness with Readiness Checks. It runs as a 5-region cluster, so control stays alive even during a failure. The Failover policy alone (A) is health-check-based and therefore not explicit control, CloudWatch Alarm (C) is threshold alerting, and GuardDuty (D) is threat detection — both unrelated to failover control. "Explicit, health-check-independent failover + readiness verification" = ARC.

---

**문제 11.** A company wants to move an Oracle database to Aurora PostgreSQL, minimizing downtime to within a few minutes. But after the migration starts, CDC can't catch up with the changes. What is the combination of the correct approach and the root cause of the problem?

A) Use SCT+DMS (Full Load + CDC) / the source DB's transaction log is disabled or its retention is too short
B) Use Snowball / insufficient network bandwidth
C) Use DataSync / no schedule configured
D) Use MGN / block replication failed

**정답: A**

해설: Oracle → Aurora PostgreSQL is a heterogeneous migration across different engines, so you first convert the schema with SCT and then switch over without downtime using DMS's Full Load + CDC. CDC reconstructs changes by reading the source's transaction log (redo/WAL), so if that log is disabled or its retention period is too short, it can't catch up with the changes — the fix is to enable the log and extend its retention. B, C, and D are not the tools or causes for zero-downtime DB migration. This is a compound question that asks both the correct tool for "different engines + minimal downtime" and the CDC = log-based replication principle together.

---

**문제 12.** A company needs RDS writes to be uninterrupted with RPO 0 even during a single-AZ failure, and at the same time needs the service to continue in another region even during a whole-region us-east-1 failure. What is the most appropriate combination?

A) RDS Multi-AZ only — a synchronous standby within the same region covers both AZ and region failures
B) Cross-Region Read Replica only — an asynchronous read replica in another region, promoted on failure
C) RDS Multi-AZ (for AZ failure, synchronous RPO 0) + Aurora Global or Cross-Region replication (for regional failure)
D) Backup & Restore only — keep Cross-Region snapshots periodically and restore in another region on failure

**정답: C**

해설: Uninterrupted through AZ failure with RPO 0 is met by synchronous Multi-AZ (HA within the same region), and a whole-region failure can only be survived with replication that crosses the region boundary (Aurora Global Database or Cross-Region replication) — the two requirements are different isolation levels, so you must combine them. Multi-AZ alone (A) is powerless against a regional failure, Cross-Region RR alone (B) is asynchronous so it isn't RPO 0 and has no automatic AZ failover, and Backup-Restore alone (D) provides neither RPO 0 nor zero interruption. This is Day 1's core point: when you're required to have "AZ HA + region DR simultaneously," you must layer the two mechanisms.

---

## 📌 Today's Summary + Next Week Preview

1. Resilience, DR, and migration converge on one question — "the worst you must survive × the cost you'll spend." Blast radius sets isolation (AZ/region), RTO/RPO set the DR tier, and the kind of constraint sets the migration tool.
2. The four traps: mistaking Multi-AZ for DR / confusing RTO and RPO / CNAME on a root domain / keeping backups in the same account as production. The instant you spot these, they filter out the wrong answers.
3. Beneath it all lies CAP/PACELC, so resilience is solved not by memorization but by reasoning that weighs "consistency, availability, latency, cost."
4. Next week: **final review + full mock exam + exam D-Day checklist** — integrating every domain to solidify your exam-day instincts.
</content>
</invoke>
