# Day 5 - Week 10 Comprehensive Review: Backup, DR, HA as One Picture

Week 10 's throughline was one question: **"When original disappears, where do we restart?"** And answer split two axes—**how much we can lose (RPO)** and **how fast we recover (RTO)**. Backup is RPO reduction game; availability/DR is RTO reduction game. All tools this week were choices on these two axes, at what cost reaching what point.

This review doesn't list concepts; rather **reweaves why tools diverge.** Then new scenarios in exams become solvable by asking "RPO or RTO problem? Same region or cross-region? Data or workload?"—tool reverse-engineered.

## Week 10 at a Glance

| Day | Topic | One-line Essence |
|-----|-------|-----------------|
| 1 | EBS Snapshot / AMI / DLM | Incremental, block-sharing backups remembering only changes |
| 2 | AWS Backup / Vault Lock | Multi-service backup even creator can't delete |
| 3 | RDS Multi-AZ / Read Replica / Aurora | Choice between sync (HA) and async (read/DR) |
| 4 | S3 Replication / Storage Gateway / DRS | Three ways to move objects, files, workloads |

## RPO and RTO—Two Axes Through Week 10

All recovery design reduces to two numbers. **RPO (Recovery Point Objective)** is "how much past data can we lose"—gap between last backup/replication and disaster moment. **RTO (Recovery Time Objective)** is "how long can disaster-to-recovery-complete take." Smaller numbers, steeper cost curves. RPO 0 (zero data loss) demands sync replication (Multi-AZ); minute-level RTO demands immediately-bootable copies (DRS, Aurora Global); both burn money always.

| Tool | RPO | RTO | Cost Nature |
|------|-----|-----|-----------|
| Daily Snapshot/Backup | max 24 hours | Restore time (10s min~hrs) | Cheap (storage only) |
| RDS Multi-AZ | 0 (sync) | 60~120s auto | Medium (Standby always) |
| Cross-Region Read Replica | Minutes | Manual promote | Medium (RR always) |
| Aurora Global Database | < 1s | < 1 min promote | High (multi-region) |
| S3 CRR (+RTC) | Minutes (15min SLA) | Replication arrival time | Transfer+storage |
| DRS (CDP) | Seconds | Minutes launch | Low (Staging small offline) |

This table solves 90% of exam scenarios. "No data loss" → RPO 0 → Multi-AZ. "Region failure, 1-min recovery" → Aurora Global DB. "Min offline cost + minute recovery" → DRS. Read RPO/RTO requirements and cost constraints; tools nearly auto-decide.

## Pattern 1: DLM vs AWS Backup—Lightness vs Integration Fork

Same "auto backup" but boundaries clear. **DLM** is EBS volume/AMI-**only** lightweight scheduler, tag-based snapshot creation, retention/Cross-Region replication automation, policy itself free. **AWS Backup** is multi-service unified platform covering RDS, DynamoDB, EFS, FSx, S3, with Backup Audit Manager compliance validation too. EBS-only? DLM. Multiple services + audit? AWS Backup.

## Pattern 2: Three WORM Locks—Same Model, Different Resources

Week 10 saw "issuer can't unlock" immutable storage thrice. All same WORM model (1990s finance regulation's physical WORM optical disc ancestry) applied to different resources.

| Lock | Target | Governance | Compliance |
|------|--------|-----------|-----------|
| Snapshot Lock | EBS Snapshot | Authorized can unlock | Permanent can't unlock |
| Backup Vault Lock | AWS Backup vault | Authorized can unlock | Permanent after cooling-off (3 days) |
| S3 Object Lock | S3 object | Authorized can unlock | Permanent during retention |

Key commonality: **Compliance mode neither root nor AWS can unlock.** "Admin can't delete" means "attacker can't delete"—ransomware defense and regulatory WORM essence. Governance is mistake-prevention guardrail (authorized can unlock).

> 🔍 **Deeper Dive**: Why all three Locks mandate Versioning or equivalent immutable version tracking: immutability means "lock specific version," not "lock key." Same-key overwrites break "unchangeable" promise; each write needs unique version ID (version-ID) and individual lock for WORM. S3 Object Lock requiring Versioning, EBS Snapshot inherently version-immutable, Backup recovery points with unique IDs—all same reason. Regulatory audit proving "post-creation unchanged" requires not just unchangeable flag but "each version uniquely identified·locked"—immutable version chain proves no tampering.

> 📚 **Case Study**: That Compliance modes consistently demand "after cooling-off even issuer can't" seems overkill but defines pass/fail in real regulatory audits. Finance/medical auditors ask "can admin delete if deciding to?" Possible (Governance) means changeable, WORM-unqualified. Compliance mode third-party (Cohasset Associates) validates SEC 17a-4/FINRA/CFTC compliance, providing legal audit submission grounds. "Inconveniently undeletable" is regulation trust price; three Locks' shared design lets you choose convenience (Governance) or regulation (Compliance) per resource.

## Pattern 3: Multi-AZ vs Read Replica—Sync/Async Determines All

Week's most-asked and most-wrong point. Similar surfaces, opposite underneath.

| | Multi-AZ | Read Replica |
|--|----------|--------------|
| Purpose | Availability (HA) | Read scale + Cross-Region DR |
| Replication | Sync (ack-wait, RPO 0) | Async (lag possible) |
| Client Reads | No (Standby standby) | Yes (separate endpoint) |
| Cross-Region | No (same region) | Yes |
| Failure Response | Auto failover (endpoint persists) | Manual promote (link breaks) |

Wrong patterns: Read Replica for "availability," Multi-AZ for "read distribution." Multi-AZ Standby can't even read; Read Replica async means not RPO 0. Need both? Use together.

## Pattern 4: Same Region vs Cross-Region—DR Boundary Line

Most-asked trap: **Multi-AZ isn't DR.** Survives single-AZ failure within region but helpless region-wide (sync can't cross regions). Region DR needs separate tools.

```
Same Region (AZ failure prep)         Cross-Region (region failure prep = DR)
─────────────────────────            ───────────────────────────────────
RDS Multi-AZ (sync)                   Cross-Region Read Replica (RDS)
Multi-AZ DB Cluster                   Aurora Global Database (RPO<1s)
S3 (auto multi-AZ)                    S3 Cross-Region Replication
EBS Snapshot                          DLM/Backup Cross-Region Copy
                                      DRS (workload failover)
```

## Pattern 5: Data vs Workload—What Recovers

S3 Replication, DLM, AWS Backup **replicate/preserve data.** Separate work rebuilds servers from that data. **DRS** **entire workload** (OS/apps/data) bootable elsewhere within minutes. "Datacenter to AWS failover, minimize offline cost" is DRS. "S3 objects to another region" is CRR. "Keep on-prem app, S3 backend only" is Storage Gateway.

> 💡 **Related Theory**: Week 10's meta-pattern: "separate state(state) and change(change), time becomes controllable." EBS incremental snapshots (base + change blocks), PITR (base + transaction logs), Aurora Backtrack (log rewind), S3 Versioning (version chain) all manage data as "basis + post-changes," not "copy entire state each time." This separation enables arbitrary-point restoration, block sharing, fast rewind. Functional persistent data structures, Git, event sourcing use identical principle—immutable snapshots for state, append-only logs for change lets past reconstruction freely.

---

## 📝 12 Scenario Problems

**Problem 1.** Operator deregistered dozens unused golden AMIs but storage costs barely dropped. Cause and fix?

A) AMI deletion is async, background cleanup takes days, snapshots auto-reclaimed later
B) AMI deregister removes boot recipe only, EBS snapshots stay, must delete separately or use DLM
C) AMI itself has no storage charge; snapshot costs are standard-rate, won't drop
D) Terminating EC2 instances launched from AMI auto-cleans related snapshots

**Answer: B**

Explanation: AMI holds no data, only EBS snapshot references + device-mapping metadata (boot recipe). Deregister removes only recipe; snapshot data remains, charged per GB. Golden AMI version-by-version creation and deletion accumulates unused snapshots—classic cost trap. Delete snapshots explicitly or use DLM cleanup.

---

**Problem 2.** Company wants unified backup for RDS/EBS/DynamoDB/EFS, auto-verify "all prod resources backed up," generate compliance reports. Appropriate config?

A) Separate DLM policy per resource type, tag-based snapshots, auto Cross-Region replication
B) AWS Backup Backup Plan + Backup Audit Manager Framework
C) EventBridge schedule Lambda calling each service snapshot API, results to DynamoDB
D) Manual periodic snapshots, track in spreadsheet

**Answer: B**

Explanation: DLM is EBS/AMI-only. AWS Backup unifies multiple services in one Backup Plan and Backup Audit Manager Controls (BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN etc.) continuously evaluate unprotected resources, retention, Cross-Region copy, auto-generating compliance reports.

---

**Problem 3.** Ransomware attacker steals operations account admin, deletes backups. Regulation mandates issuer-undeletable backups. Strongest structure?

A) Deny DeleteObject in operations account IAM, SCP organization-level API block
B) Cross-Account separate central vault with Compliance Vault Lock
C) Hourly backup frequency so recent recovery point survives, RPO tiny
D) All users forced MFA, MFA Delete on deletions

**Answer: B**

Explanation: Operations account breach bypasses that account's IAM. Cross-Account central vault with Compliance Lock means no operations permission, not even central root, can delete retention-period recovery points. "Admin can't delete" means "attacker can't delete"—ransomware defense + regulatory WORM essence.

---

**Problem 4.** Wrong DELETE at 2:30 PM, must restore RDS before then. Yesterday dawn snapshot only loses day's data. Needed feature?

A) Restore yesterday snapshot, manually re-input post-snapshot changes from app logs
B) Point-in-Time Recovery (PITR)—base snapshot + transaction log replay, new instance arbitrary second
C) Multi-AZ failover, promote Standby to pre-DELETE state
D) Promote Read Replica with replication lag still not reflecting DELETE, independent instance

**Answer: B**

Explanation: PITR combines base snapshots + continuous transaction logs (binlog/WAL), restoring pre-moment snapshot then replaying logs to designated second, reconstructing arbitrary point. Always new resource so original preserved; wrong point time permits retry. Works within auto-backup retention (1~35 days).

---

**Problem 5.** "Single AZ failure, no data loss, automatic recovery" goal. Exact RDS feature?

A) Read Replica in different AZ, promote on failure
B) Multi-AZ—sync to Standby in different AZ, RPO 0, auto failover
C) Short-interval auto snapshots, restore from latest on AZ failure
D) Cross-Region Read Replica, switch to other-region copy on failure

**Answer: B**

Explanation: Multi-AZ sync-replicates all commits to different-AZ Standby waiting for ack before completion; Primary death preserves last commit, RPO 0. Auto-promotes Standby. Read Replica (A) async/read-scale; Cross-Region RR (D) region DR manual promote.

---

**Problem 6.** DB read load (analytics/reports) surges mid-operation. Cost-effectively distribute reads?

A) Vertically scale DB to bigger instance type, throughput increases together
B) Add Read Replica, separate endpoint distributes reads
C) Enable Multi-AZ, distribute analytics/reports to Standby
D) Higher-frequency auto snapshots, restore separate instance for analysis

**Answer: B**

Explanation: Read Replica async-replicates read-only copy, separate endpoint distributes reads exactly. Multi-AZ Standby unreachable to clients, no read distribution. Upsizing costs more, can't separate read/write.

---

**Problem 7.** Global users need fast reads from nearby regions + region DR (RPO<1s). Most fit?

A) RDS Multi-AZ different-AZ Standby, HA+fast failover
B) Aurora Global Database—up to 5 Secondary regions, storage-layer replication RPO<1s/RTO<1min
C) Multiple Read Replicas single region, Route 53 latency routing nearest
D) DynamoDB Multi-AZ, global read+region DR

**Answer: B**

Explanation: Aurora Global Database replicates Primary changes via dedicated infra to max 5 Secondary region storage, enabling tens-ms read to nearby regions + region DR (60s promote). Storage-layer replication beats instance-level RDS Cross-Region RR in lag/RTO.

---

**Problem 8.** Lambda connection surge to RDS exceeds max-connections limit. Root fix?

A) Upsize DB instance, lift max_connections ceiling
B) RDS Proxy—connection pool, multiplexing few real connections
C) Enable Multi-AZ, distribute connections to Standby
D) Add Read Replica, spread connections to replicas

**Answer: B**

Explanation: Lambda functions explosive scaling opens thousands direct DB connections (Connection Storm). RDS Proxy pooling caps actual connections at pool size, reuses, plus Secrets Manager+fast failover. Upsizing doesn't keep pace with Lambda scale; not root fix.

---

**Problem 9.** Company auto-replicates S3 data to another region's DR. Required prerequisite?

A) Run DataSync task periodically, sync objects to other-region bucket
B) S3 Cross-Region Replication + both-side Versioning + IAM Role
C) Storage Gateway File Gateway caches/uploads to other-region bucket
D) Lifecycle Policy transitions objects to other-region Glacier tier

**Answer: B**

Explanation: S3 CRR is standard; both Versioning required. Replication system manages each version unique ID idempotently, Versioning prerequisite. Post-enable new objects auto-replicate; existing needs Batch Replication backfill.

---

**Problem 10.** Datacenter to AWS DR failover possible, minimize offline cost, minute-level recovery RTO. Which tool?

A) S3 Replication to other-region, rebuild servers from that data on disaster
B) AWS Elastic Disaster Recovery (DRS)—block-level CDP, Staging small offline, real-size launch on failover
C) Storage Gateway backup on-prem volumes, restore to EC2
D) DataSync periodically transfer on-prem files, use for recovery

**Answer: B**

Explanation: DRS block-level CDP entire servers, RPO seconds, Staging (cheap t3.small + EBS) offline minimizes cost, failover launches real-size minutes' RTO. S3 Replication (A) data-only; workload failover needs DRS.

---

**Problem 11.** Regulation mandates S3 objects 5-year unchangeable/undeletable. Which feature and prerequisite?

A) Bucket/IAM policy deny DeleteObject/PutObject to all
B) S3 Object Lock Compliance + 5yr retention, Versioning required
C) Cross-Region Replication, preserve if one side changes
D) Glacier Deep Archive, cold tier 5-year storage discourages modify

**Answer: B**

Explanation: S3 Object Lock Compliance mode root-untouchable retention duration WORM, satisfies SEC 17a-4/HIPAA, defends ransomware/insider deletion. Locks specific version so Versioning mandatory. IAM (A) bypassed on privilege theft, can't guarantee immutability. Snapshot/Vault Lock WORM model.

---

**Problem 12.** DR failover new volume from big EBS snapshot, first IO slow, recovery delayed. Cost-aware fix?

A) Re-create snapshot, fill all blocks in new fully-hydrated snapshot, rebuild volume
B) Fast Snapshot Restore (FSR) failover-target AZ only, pre-hydrate
C) Change volume type gp2→gp3, lift baseline IOPS/throughput
D) Bigger instance type, higher EBS bandwidth absorbs initial IO

**Answer: B**

Explanation: Snapshot volume lazy-loads blocks on first access from backup storage, slow first IO. FSR pre-hydrates snapshot in specific AZ, max performance from first IO. FSR billed per snapshot×AZ/hour, so selective enable on actual failover target AZ is cost-optimization answer.

---

## 🔮 Week 11 Preview

Week 11 is **Performance·Cost Optimization**—operators' daily work. Compute Optimizer right-sizing, Trusted Advisor's 5 check categories, Cost Explorer/Budgets/Cost Allocation Tags for visibility, Savings Plans/Reserved Instances/Spot for cost cuts. Week 10 was stability—"lose nothing, recover fast"; Week 11 is efficiency—"same stability, cheaper."
