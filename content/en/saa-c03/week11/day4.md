# Day 4 - Why Migration Is Decided by "How You Can't Move It" More Than "What You're Moving"

When you first look at cloud migration tools, DMS, SCT, Snow Family, DataSync, and MGN blur together into similar "moving tools." But the real axis dividing them isn't "what you move (DB, server, file)" but **"what trips you up during the move."** The enemy of database migration is **downtime**, the enemy of large-file migration is **network bandwidth**, and the enemy of server migration is **state inconsistency during transit**. Each tool is specialized to solve its specific constraint. The reason the SAA exam endlessly varies migration questions is that the ability to read the scenario's "constraint keyword" and pick the right tool is precisely an architect's judgment.

This article starts from the big picture of migration strategy (the 7 Rs), then follows, through internal behavior, how each tool solves which constraint — how DMS's CDC creates zero-downtime cutover, where the network break-even point between Snow and DataSync lies, and why MGN and DRS are different services even though they use the same block replication.

## The 7 Rs: Before Moving, First Ask "Is It Worth Moving?"

AWS's migration strategy is organized as the **7 Rs** — Retire, Retain, Relocate, Rehost, Repurchase, Replatform, Refactor. This order matters because the best migration is often **not moving at all**. Systems no longer in use should be Retired, and those that must stay on-prem for regulatory or technical reasons should be Retained. If you do move, start with the simplest Rehost (lift-and-shift, move it as-is), and effort and risk grow as you go to lightly-tweaked Replatform (e.g., DB to managed RDS) and fully-rewritten Refactor.

> 💡 **Related theory**: The 7 Rs are a decision frame for handling **technical debt** in software evolution. Lift-and-shift (Rehost) moves the debt to the cloud as-is — fast, but it brings the inefficiency along. Refactor moves while paying down the debt — you gain cloud-native benefits (serverless, managed, auto-scaling) but it's expensive and risky. Real large-scale migrations almost always use a **phased approach** — first Rehost to quickly empty the data center (relieving time/contract pressure), then progressively Refactor the highest-value systems once they're in the cloud. "Move first and iterate" beats "perfect in one shot" as an evolutionary strategy that reduces risk. The SAA usually makes Rehost/Replatform the correct answer under the conditions "minimum downtime + minimum effort."

## DMS: Neutralizing the Enemy Called Downtime with CDC

The real difficulty of database migration isn't the data copy itself but that **the source keeps changing even while you copy**. You can't stop the operational DB for the hours it takes to copy hundreds of GB, so once the copy finishes you must catch up on the changes accumulated in between. **DMS (Database Migration Service)** solves this with **Full Load + CDC (Change Data Capture)**. It first copies all current data (Full Load), then reads the changes during and after from the source DB's transaction logs and continuously applies them to the target (CDC). Once the source and target are near-real-time synchronized, at that moment you just switch the application connection to the target — downtime shrinks to within minutes.

DMS handles two kinds of migration. **Homogeneous (same engine)** — Oracle→Oracle, MySQL→MySQL keeps the schema intact, so DMS alone is enough. **Heterogeneous (different engine)** — when the engine changes like Oracle→Aurora PostgreSQL, table structures, stored procedures, and data types are incompatible, so you first convert the schema and code with **SCT (Schema Conversion Tool)** and then move the data with DMS.

> 🔍 **Going deeper**: The secret to how CDC captures changes "with almost no load on the source DB" is that **it reads the transaction logs**. A relational DB writes every change to a log before commit (Oracle's redo log, MySQL's binlog, PostgreSQL's WAL) for crash recovery. CDC reads this already-existing log from the tail and reconstructs INSERT/UPDATE/DELETE, so it tracks changes without firing heavy queries at the source tables. This is the same **log-based replication** principle used by RDS Read Replicas and Kafka-based event sourcing. So to use CDC with DMS you must enable the log (binlog/WAL, etc.) on the source DB and set a sufficient retention period — skip this and Full Load works but CDC can't catch up on changes. SCT leaves items it can't convert (engine-specific features) in a report for manual rewriting, and that manual work is the true cost of Heterogeneous migration.

> 📚 **Case study**: Amazon's internal "Oracle exodus" project — moving thousands of Oracle databases to Aurora, DynamoDB, and RDS across 2018–2019 — is famous. The key was not a simple lift but picking the right engine per workload (relational to Aurora, key-value to DynamoDB), converting schemas with SCT, and moving data with DMS. There are two lessons. First, most of the cost of a large Heterogeneous migration goes not into data movement but into **rewriting stored procedures, triggers, and engine-specific SQL** — the manual work of moving Oracle PL/SQL to PostgreSQL PL/pgSQL was the bottleneck. Second, "breaking DB engine lock-in" itself had strategic value, greatly reducing long-term cost and licensing. When you see "Oracle→Aurora PostgreSQL, minimum downtime" on the exam, SCT + DMS (Full Load + CDC) is the reflexive answer.

## Snow vs. DataSync: The Physical Law of Network Bandwidth

The enemy when moving large data is the **network**. There's inescapable arithmetic here — data volume and available bandwidth determine transfer time, and past a certain point, **physically loading data onto a truck and shipping it is faster than sending it over the internet**. Sending 100TB over a 100Mbps line takes theoretically over 90 days (effective bandwidth is even lower). Loading the same data into a Snowball and shipping it takes a few days. This break-even point is the boundary between Snow and DataSync.

**DataSync** is the online transfer tool for **when the network is sufficient**. It moves and replicates files from sources like NFS, SMB, HDFS, S3, and other object storage to targets like S3, EFS, and FSx — with auto-scheduling, post-transfer integrity verification, and bandwidth throttling (so it eats less of the line during business hours). It's used not just for one-time migration but for continuous synchronization too.

**Snow Family** is the offline transfer tool for **when the network is insufficient or absent**. AWS ships you physical devices; you load data onto them and ship them back to AWS, and AWS loads the data into S3 at its data center.

| Device | Capacity | Characteristics |
|------|------|------|
| **Snowcone** | About 8TB | Smallest and lightest, edge/small volume |
| **Snowball Edge Storage Optimized** | About 80TB | Petabyte scale uses multi-device clusters |
| **Snowball Edge Compute Optimized** | Includes compute (EC2/GPU) | Processing at disconnected edges too |
| **Snowmobile** | Up to 100PB (truck) | Exabyte-scale whole-data-center relocation |

> ⚠️ **Pitfall**: Snow vs. DataSync splits by **network availability and data volume**. "10TB + sufficient network (e.g., a high-bandwidth dedicated line)" favors DataSync for online transfer within days, while "10TB + insufficient/absent network (remote site, low bandwidth)" points to Snowball. Big data alone doesn't unconditionally mean Snow — with high bandwidth like Direct Connect, even large data can be faster via DataSync. The key in the scenario is to **multiply line speed by data volume to estimate transfer time**, and when "can't send it in time" appears, it's Snow.

> 🔍 **Going deeper**: Snowball Edge isn't just a storage box — the **Compute Optimized** model packs EC2, Lambda, and even a GPU inside, so it **processes data in a disconnected environment too**. This is an edge-computing scenario like ships, oil fields, military bases, or disaster sites where the internet is absent or unstable — pre-process and infer on sensor data on-site, then ship back only the results (or everything) to AWS. Also, all Snow devices have **hardware encryption (in transit and at rest)** by default, with keys managed by AWS KMS, so even if a device is lost in transit the data isn't exposed — a design that blocks theft/loss threats with encryption, given the nature of physical shipping. Snowball solves not just "slow network" but the more extreme constraint of "a place with no network at all."

## MGN and DRS: Same Block Replication, Different Purpose

**MGN (Application Migration Service, formerly CloudEndure Migration)**, which moves whole servers, replicates the source server's disks **in real time at the block level** and keeps them in an AWS staging area, then boots EC2 instances from that data when ready. It's the automation tool for **lift-and-shift (Rehost)** that brings the OS, application, and config over as-is, used to move data centers of hundreds of servers to EC2 without code changes.

Here it's easy to confuse **DRS (Elastic Disaster Recovery)**. The two share the same CloudEndure-lineage block-level real-time replication technology but their **purposes are opposite** — MGN is for **migration**, discarding the source once moved (one-time, cutover). DRS is for **disaster recovery**, keeping the source running while maintaining replication around the clock and failing over only on failure (continuous, standby in normal times). "Permanently relocate a data center to AWS" is MGN; "keep operations running and prepare for DR" is DRS.

> ⚠️ **Pitfall**: Don't mix up the roles of MGN, DRS, and DMS. **DMS moves database data** (schema/table level, CDC), while **MGN moves the whole server** (OS/disk-block level). To move only the DB, DMS is right; to move the whole server the DB sits on, it's MGN. Also, mistaking Storage Gateway for a migration tool is a common error — **Storage Gateway is permanent hybrid storage (using the cloud like an extended disk from on-prem)**, not a one-time migration tool. If you'll move and be done, it's DataSync; if it's a permanent on-prem-to-cloud cache, it's Storage Gateway.

## Comparing Other Clouds' Migration Tools

| Constraint/target | AWS | Azure | GCP |
|-----------|-----|-------|-----|
| DB migration | DMS + SCT | Azure Database Migration Service | Database Migration Service |
| Server lift-and-shift | MGN | Azure Migrate | Migrate to Virtual Machines |
| Online file transfer | DataSync | Azure File Sync / AzCopy | Storage Transfer Service |
| Offline large volume | Snowball / Snowmobile | Azure Data Box / Data Box Heavy | Transfer Appliance |

All three clouds solve the same problem — **the physical law of network bandwidth** — the same way: providing an online transfer tool paired with an offline physical device (Data Box, Transfer Appliance). This is evidence that migration's core constraint comes not from the kind of cloud but from physics (the speed of light, line capacity). CDC-based zero-downtime DB migration and block-replication-based server lift-and-shift also use nearly identical patterns across the three clouds — only the tool names differ; the constraint to solve is the same.

## Getting Hands-On with the CLI

```bash
# Create a DMS Replication Instance
aws dms create-replication-instance \
  --replication-instance-identifier saa-dms \
  --replication-instance-class dms.t3.medium --allocated-storage 50

# DMS Task: Full Load + CDC (zero-downtime cutover)
aws dms create-replication-task \
  --replication-task-identifier orders-migration \
  --source-endpoint-arn arn:... --target-endpoint-arn arn:... \
  --migration-type full-load-and-cdc \
  --table-mappings file://mappings.json

# DataSync Task: on-prem NFS → S3 (with bandwidth throttling)
aws datasync create-task --source-location-arn arn:... \
  --destination-location-arn arn:... --name saa-sync \
  --options BytesPerSecond=104857600

# Create a Snowball Edge job (offline large volume)
aws snowball create-job --job-type IMPORT \
  --snowball-type EDGE_S --resources S3Resources=... \
  --address-id ADID... --role-arn arn:... --kms-key-arn arn:...

# Check MGN source server replication state (server lift-and-shift)
aws mgn describe-source-servers
```

## Wrapping Up

Migration tool choice is decided not by "what you move" but by **"what trips you up."** ① The **7 Rs** first ask about Retire/Retain before moving, and manage risk stepwise Rehost→Replatform→Refactor. ② **DMS** neutralizes the enemy of downtime with Full Load + CDC (log-based replication), and if the engine differs, first converts schema and code with SCT — that manual rewrite being the true cost. ③ **Snow vs. DataSync** splits by the physical law of network bandwidth — estimate transfer time by line speed × data volume, and if you exceed the break-even go offline (Snow), if not go online (DataSync) — and Snowball Edge Compute even solves processing at disconnected edges. ④ **MGN and DRS** use the same block replication but diverge in purpose into migration (one-time) and DR (continuous), and Storage Gateway is permanent hybrid, not migration. The exam asks for the ability to map the scenario's constraint keyword to a tool.

In the next article, we'll synthesize this week's resilience, DR, and migration and cement keyword mapping with the composite scenario questions that appear on the actual exam.

---

## 📝 연습 문제

**문제 1.** A company wants to move an on-premises Oracle database to Aurora PostgreSQL while minimizing downtime during migration to within a few minutes. What is the most appropriate approach?

A) DMS Full Load + CDC, with SCT for schema pre-conversion
B) Load a DB backup into a Snowball and ship it
C) Copy the data files with DataSync
D) Lift-and-shift the whole server with MGN

**정답: A**

해설: Oracle→Aurora PostgreSQL is a Heterogeneous migration with a different engine, so you first convert the schema and stored procedures with SCT, then move the data with DMS's Full Load + CDC, catching up on changes in real time so downtime at cutover shrinks to minutes. Snowball (B) is for offline large-volume transfer and has no zero-downtime DB cutover mechanism, DataSync (C) is file transfer and doesn't handle DB transaction consistency, and MGN (D) is a whole-server lift so it can't do engine conversion (Oracle→PG). "Different engine + minimum downtime" = SCT + DMS (CDC).

---

**문제 2.** A research institute must move 100TB of data at a remote site (low-bandwidth satellite line) to S3. Over the network it would take months. What is the most appropriate method?

A) DataSync
B) DMS
C) Snowball Edge Storage Optimized
D) S3 Multipart Upload

**정답: C**

해설: Transferring 100TB online over low bandwidth takes months, so offline transfer via a physical device (Snowball Edge Storage Optimized, about 80TB/device, clustered for petabyte scale) is the answer. DataSync (A) and Multipart Upload (D) ride the network, so they're meaningless when the line is the bottleneck, and DMS (B) is a DB migration tool, not bulk file transfer. "Large data + insufficient network/months required" = Snow. Estimating transfer time by line speed × data volume is the key judgment.

---

**문제 3.** A company wants to **periodically synchronize** data from an on-premises NFS file server to S3, and the dedicated-line bandwidth is sufficient. What is the appropriate tool?

A) DataSync
B) Snowball
C) Storage Gateway (permanent cache)
D) S3 Cross-Region Replication

**정답: A**

해설: In an online environment with sufficient bandwidth, the tool that synchronizes NFS→S3 on a schedule and even verifies integrity after transfer is DataSync. Snowball (B) is the offline tool for when the network is insufficient, so it's unnecessary; Storage Gateway (C) isn't a one-time/periodic migration but a hybrid cache permanently bridging on-prem and cloud; and S3 CRR (D) is replication between S3 buckets, not handling an on-prem NFS source. "Online + periodic file sync" = DataSync.

---

**문제 4.** An enterprise wants to permanently relocate 200 virtual machines from its data center to AWS EC2 without code changes. What is the most appropriate tool?

A) DMS
B) AWS Application Migration Service (MGN)
C) DataSync
D) AWS Elastic Disaster Recovery (DRS)

**정답: B**

해설: The automation tool for lift-and-shift (Rehost) — moving servers OS-and-application-and-all to EC2 without code changes — is MGN, which does block-level real-time replication then boots as EC2. DMS (A) moves only DB data, DataSync (C) is file transfer, and DRS (D) uses the same block replication but its purpose is disaster recovery (keeping the source running and on standby), differing from "permanent relocation." MGN = one-time migration, DRS = continuous DR is the key distinction.

---

**문제 5.** An architect wants to explain the difference between MGN and DRS. What is the most accurate explanation?

A) They're identical and only the name differs
B) MGN is one-time migration (discard the source after cutover), DRS is continuous disaster recovery (keep the source running, fail over on failure)
C) MGN is DB-only, DRS is server-only
D) MGN is offline, DRS is online

**정답: B**

해설: MGN and DRS share the same CloudEndure-lineage block-level real-time replication but their purposes are opposite — MGN is for migration, a one-time cutover discarding the source after moving, and DRS is for disaster recovery, keeping the source running with replication maintained around the clock and failing over only on failure. A ignores the purpose difference, C is wrong because both are server-level (DB-only is DMS), and D is wrong because both are online block replication. "Permanent relocation = MGN, DR preparation = DRS."

---

**문제 6.** A team wants to **pre-process sensor data on-site** on a ship with no internet access, then ship it back to AWS later. What is the appropriate device?

A) Snowcone (storage only)
B) Snowball Edge Compute Optimized
C) DataSync
D) Storage Gateway

**정답: B**

해설: Snowball Edge Compute Optimized packs EC2, Lambda, and GPU inside, fitting the edge-computing scenario of processing data (inference, pre-processing) in a disconnected environment then shipping the results back to AWS. Snowcone (A) is small and storage-oriented, so it's limited for heavy on-site processing, and DataSync (C) and Storage Gateway (D) presuppose network connectivity, so they're unsuitable for "a ship with no internet." "Disconnected edge + on-site processing" = Snowball Edge Compute.

---

**문제 7.** A company started an Oracle→Aurora migration with DMS, and Full Load succeeds but CDC can't catch up on the source's changes. What is the most likely cause?

A) Aurora doesn't support CDC
B) The source DB's transaction logs (redo/binlog/WAL) are disabled or the retention period is too short
C) The Replication Instance capacity is large
D) SCT wasn't used

**정답: B**

해설: DMS's CDC reads the source DB's transaction logs (Oracle redo, MySQL binlog, PostgreSQL WAL) to reconstruct changes, so if that log is disabled or its retention is short, it can't track and replay changes. The remedy is to enable the log on the source and extend the retention period sufficiently. A is the reverse of the truth (the target is the side receiving CDC application), C is actually favorable if capacity is large, and D is wrong because SCT is a schema conversion tool unrelated to CDC operation itself. It resolves once you know the principle that CDC = log-based replication.

---

## 📌 Key Takeaways

Migration tools split not by "what you move" but by "what trips you up." The 7 Rs first ask about Retire/Retain before moving and manage risk stepwise Rehost→Replatform→Refactor. DMS neutralizes downtime with Full Load + CDC (transaction-log-based replication), and if the engine differs, first converts schema and stored procedures with SCT — that manual rewrite being the true cost of Heterogeneous (the Amazon Oracle-exodus case). Snow vs. DataSync splits by the physical law of network bandwidth — estimate transfer time by line × data volume — and Snowball Edge Compute even solves on-site processing at disconnected edges. MGN and DRS use the same block replication but diverge in purpose into one-time migration vs. continuous DR, and Storage Gateway is a permanent hybrid cache, not migration. The exam asks for the ability to map the scenario's constraint keyword to a tool.
