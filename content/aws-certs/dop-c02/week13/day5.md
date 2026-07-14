# Day 5 - Week 13 Comprehensive Review: High Availability, Multi-Region, DR, and Resilience Verification Together

Week 13 addressed "how to design systems that survive failures, and how to verify they actually work?" One insight threads through the week: **availability isn't preventing failures but designing to tolerate them via quorum/replication/failover and validating that tolerance with experiments.** From single AZ to multi-AZ, single region to multi-region, backup to Active-Active, and "fingers crossed" to FIS chaos—the week progressed by assuming increasingly severe failures and validating increasingly rigorously. 

Today we retie the four days' core threads and synthesize via DOP exam-style scenario problems. Exam pitfalls almost always lie in "subtle tradeoff differences between similar-looking options"—sync vs. async, single-leader vs. multi-master, running continuously for RTO vs. not, Compliance Mode vs. Governance Mode. We sharpen these boundaries again.

## Four Axes Threading the Week

### Day 1—Multi-AZ: Distributed Principles of Replication and Quorum

Replication is a **sync/async tradeoff between RPO and latency**, positioned on CAP/PACELC coordinates. RDS Multi-AZ is **physical block-level synchronous replication** where Standby acts like a shadow disk with no reads, while Read Replica is **logical asynchronous replication** with its own query engine allowing reads—this physical/logical difference explains "why one can't read, the other can." Aurora sinks replication to storage with **6-copy/3-AZ quorum (4/6 write, 3/6 read, AZ+1 fault model)** and "log is database" design, outpacing traditional DBs. RTO principle: "the shorter when failover candidate is already running and no data copy needed," with RDS Proxy hiding failover via connection pooling.

### Day 2—Multi-Region: DNS, Global Replication, Encryption Boundaries

Multi-region must **accept async replication due to light speed**, with conflicts/inconsistency handling as the essence. Route 53 is **DNS-based GSLB** (7 policies + quorum health checks) but hits DNS cache TTL delay limits; **anycast-IP Global Accelerator** handles instant failover. Data replication trades off **single-leader (Aurora Global, no conflicts) vs. multi-master (DynamoDB Global Tables, LWW)**; LWW risks silent lost updates via clock skew. **KMS Multi-Region Key** shares key material cross-region for replicated-ciphertext portability, and Route 53 ARC provides safe DR toggling via control/data-plane separation.

### Day 3—Four DR Strategies: Economics of RTO, RPO, Cost

DR is not "how fast" but an **economics problem: BIA sets RTO/RPO, weighed against cost** (ISO 22301). Four strategies are a **spectrum of "keep running normally"**: Backup & Restore (nothing, cheapest/slowest but IaC shortens RTO) → Pilot Light (data only, app off, path unvalidated) → Warm Standby (scaled-down always, path validated) → Active-Active (full capacity both, RTO~0 but expensive and "half dying means survivor absorbs 100%" capacity needed). AWS Backup unifies via tags, and **Vault Lock Compliance Mode's WORM-immutable backups block ransomware**.

### Day 4—Resilience Verification: Resilience Hub and FIS

Untested recovery doesn't work. **Chaos Engineering** (Netflix Chaos Monkey origin) applies **scientific method (steady state→hypothesis→inject failure→verify)** to reliability. **FIS** implements this as managed service with Targets (blast radius dial: ALL/COUNT/PERCENT), Actions, and Stop Conditions (safety belt). **Resilience Hub** quantifies RTO/RPO target-vs-actual gaps, improvements, costs. EventBridge Scheduler + FIS auto-loops measure-experiment-improve, and Game Day (humans, one-time) and Chaos (systems, periodic) are complementary.

## Key Boundaries at a Glance—Exam Pitfalls Summarized

| Confusing Pair | Decisive Difference |
|-------------|-------------|
| RDS Multi-AZ Standby vs Read Replica | Physical sync (no read) vs. logical async (read OK) |
| Aurora vs Aurora Global | Single-region 6-copy (30s) vs. multi-region async (<1min promote) |
| Aurora Global vs DDB Global Tables | Single-leader (no conflict) vs. multi-master (LWW) |
| Route 53 Failover vs Global Accelerator | DNS (cache TTL delay) vs. anycast IP (instant) |
| Pilot Light vs Warm Standby | App off (unvalidated) vs. scaled-down always (validated) |
| Vault Lock Governance vs Compliance | Privilege-holder override possible vs. root can't (WORM) |
| Backtrack vs PITR | In-place rewind (MySQL,72h) vs. new cluster restore |
| Game Day vs Chaos | Humans, one-time vs. systems, periodic auto |

## 🧠 Scenario Problems

**Problem 1.** A global gaming service uses UDP traffic. When one region dies, it must failover instantly to another region, regardless of client DNS cache. Clients should know only 2 fixed IPs. Best fit?

A) Route 53 Failover Routing + short TTL (e.g., 10s) to accelerate cache expiration

B) AWS Global Accelerator — 2 anycast fixed IPs + health-check-based instant rerouting

C) CloudFront distribution + Origin Failover to auto-switch to healthy-region origin at edge

D) Route 53 Latency Routing + health check to route to lowest-latency healthy region

**Answer: B**

Explanation: Route 53-based failover changes response IPs, delaying by client DNS cache TTL (A, D limitation); doesn't satisfy UDP/fixed IP requirement. Global Accelerator provides 2 anycast fixed IPs advertised globally; on backend-region failure, health-check-based instant reroute—IP doesn't change, so failover ignores client DNS cache and is instant. Supports TCP/UDP (L4) for gaming. CloudFront (C) is HTTP/HTTPS content caching, unfit for UDP.

---

**Problem 2.** Payment system needs RTO~0, RPO~0, cost mostly unconstrained. Must accept writes from both regions simultaneously. Data-layer config and mandatory risk-validation?

A) Aurora Global Database (single-leader) — secondary read-only but no conflicts, safest consistency

B) DynamoDB Global Tables (multi-master, LWW) + Route 53 Latency Routing, but MUST validate "silent lost updates from clock skew on simultaneous same-key writes" and "surviving region absorbs 100% traffic capacity"

C) RDS Multi-AZ + cross-region Read Replica for writes in one region, reads in other

D) S3 CRR bidirectional to support simultaneous writes in both regions

**Answer: B**

Explanation: Simultaneous writes from both regions needs multi-master, so DynamoDB Global Tables fits (Aurora Global is single-leader, secondary read-only, can't do both-region writes—A limitation). BUT two must-validates: First, Global Tables use LWW-conflict resolution, but clock skew can cause truly-latest write to lose, creating silent lost updates; simultaneous same-key updates across regions are anti-pattern. Second, if one region dies, survivor must handle 100% traffic, so each must be sized for full capacity (or cascading failure). RDS Multi-AZ (C) is single-region; S3 CRR (D) is object replication.

---

**Problem 3.** Traditional RDS Multi-AZ system read load grew. Tried spreading reads to Standby but impossible. Reason and correct fix?

A) Standby is different region, cross-region read blocked — move Standby to same region/AZ

B) Multi-AZ Standby is block-level physical replication, lacks independent query engine, no reads — add Read Replica (logical async replication) or switch to Multi-AZ DB Cluster (readable standbys)

C) Standby endpoint missing read IAM/SG permissions — add read permissions and SG rules

D) Promote Standby to independent read instance, distribute read traffic

**Answer: B**

Explanation: Traditional Multi-AZ Standby mirrors storage blocks: physical replication, no query engine, "shadow disk" = no reads. For read distribution, add Read Replica (binlog/WAL logical async replication, separate endpoint, reads OK) or switch to Multi-AZ DB Cluster (2022+, readable standbys, <35s failover bonus). Not region (A), permissions (C), or promote (D).

---

**Problem 4.** Aurora MySQL: operator accidentally ran massive UPDATE. Fastest way to roll back entire cluster to 5 minutes ago? Also separately: "restore only specific table from 30 days ago"—what's the difference?

A) Both: snapshot restore to new cluster, extract needed point/table and apply

B) 5-min full rewind: Backtrack (in-place, max 72h). 30-day specific-table: PITR/snapshot restore (new cluster). Backtrack MySQL-only, post-activation only

C) Both: Backtrack in-place rewind—handle both 5-min and 30-day within window

D) Both: promote Read Replica to instance with target time, separate recovery

**Answer: B**

Explanation: Aurora Backtrack (MySQL-compatible) rewinds cluster in-place (no new cluster, fastest "oops 5 min ago")—max 72h window, post-activation only, PostgreSQL unavailable. For "30 days ago" or "one table only," use PITR or snapshot restore to new cluster—outside Backtrack scope. Two use cases diverge; confusion is exam trap. Not blanket snapshot (A), both Backtrack (C), or Read Replica promote (D).

---

**Problem 5.** Serverless Lambda app fails with "too many connections" on traffic spike; DB failover drops all connections, causing connection storm. One-stop fix?

A) Upsize DB instance class to raise max_connections limit, accommodate more simultaneous connections

B) RDS Proxy — pool/multiplex connections, suppress actual DB connection count, maintain client connections on failover, reduce storm

C) Limit Lambda reserved concurrency to 1, tightly cap simultaneous DB connection opens

D) Add Read Replica, distribute read connections, relieve Primary connection pressure

**Answer: B**

Explanation: Lambda's concurrent instances each open connections, spike exhausts max_connections; failover causes hundreds to reconnect, storm crashing new Primary. RDS Proxy (between clients/DB) pools/multiplexes connections (managed PgBouncer/HikariCP equivalent), suppressing actual DB connections, maintaining client connections on failover, reducing storm—solves both issues at once. Upsizing (A) doesn't solve root; concurrency=1 (C) kills throughput; Read Replica (D) spreads reads, not connection/storm itself.

---

**Problem 6.** Financial regulation: backups must be absolutely undeletable/unmodifiable within retention, not even root. Correct config?

A) AWS Backup Vault Lock Governance Mode—force retention, allow select IAM override

B) AWS Backup Vault Lock Compliance Mode—WORM, root can't delete within retention

C) IAM policy explicit Deny on backup:DeleteRecoveryPoint blocks deletion

D) Cross-account copy to isolated vault to protect against source compromise

**Answer: B**

Explanation: Compliance Mode = WORM (Write Once Read Many) = unbreakable within retention, even root, true immutability—ransomware's "delete backups first" counter and financial (SEC 17a-4 class) requirement. Governance (A) = privilege-holder override possible = "mistake prevention" level, can't meet root-exemption requirement. IAM Deny (C) = changed if rights stolen; Cross-Account (D) only = copy's immutability not guaranteed (needs Vault Lock there too).

---

**Problem 7.** Tier 3 non-critical workload: DR cost minimize. Infrastructure all Terraform-coded. RTO tolerates hours. Best strategy and why?

A) Active-Active — full capacity both regions always, RTO~0, safest choice

B) Backup & Restore — no infra in DR region, cheapest; IaC automates stack deploy + restore, RTO achievable hours

C) Warm Standby — scaled-down always in DR, path validated, scale up on failure

D) Pilot Light — data only always, app tier off, cost-RTO compromise

**Answer: B**

Explanation: Cost-minimize + RTO hours = Backup & Restore (no always-on DR infra, cheapest). With full IaC (Terraform), "stack deploy → restore" auto-simplifies, RTO hours achievable (data+code = reproducible, immutable infra philosophy). Active-Active (A), Warm Standby (C), Pilot Light (D) all keep infra running = more cost, incompatible with "cost minimize."

---

**Problem 8.** Auto-activate Pilot Light DR procedure via code. Correct steps and tools?

A) Engineer manually executes remembered steps in console on disaster

B) Step Functions/SSM Runbook codes "Read Replica promote → ASG desired 0→N → ALB health wait → Route 53/ARC failover → alert" and validate periodically via drill

C) Wiki runbook documents all steps for console execution on incident

D) Shorten Backup frequency to minimize restore data loss on activation

**Answer: B**

Explanation: Pilot Light activation: promote data spark (Read Replica), crank app tier (ASG 0→N), wait for health, failover traffic (Route 53/ARC), alert. Code via Step Functions/SSM = deterministic/repeatable, periodic drill validates ("app tier off = unvalidated" risk of Pilot Light directly addressed, path-rot prevention). Manual (A), wiki (C) = error/unvalidated risk; frequent Backup (D) = unrelated to failover procedure.

---

**Problem 9.** EC2 production: inject 5-min CPU stress on random 30%, verify Auto Scaling self-heal, stop immediately if stress becomes real disaster. FIS config?

A) Target SelectionMode ALL + CPU-Stress(PT5M) for full-scale worst-case validation once, no Stop Condition

B) Target PERCENT(30) + CPU-Stress(PT5M) + Stop Condition(CloudWatch P99/error-rate Alarm)

C) Action Terminate random 30%, verify ASG instance-replacement self-heal

D) Operator manually runs load generator on 30% instances, manually stop if issues

**Answer: B**

Explanation: Random 30% = SelectionMode PERCENT(30) blast-radius control; CPU = AWSFIS-Run-CPU-Stress 5 min; disaster-stop = CloudWatch Alarm Stop Condition—"small radius + fast stop" multi-layer defense. ALL+no-stop (A) = full impact, no safety; full Terminate (C) = wrong intent (not CPU stress) and excessive; manual (D) = no repeatability/auto-stop/safety-rollback.

---

**Problem 10.** Code/infra change frequently. Prevent resilience silently breaking over time (regression). Best pattern?

A) Quarterly engineer manual resilience-config audit, document gaps

B) EventBridge Scheduler runs FIS chaos periodically, results feed Resilience Hub/CloudWatch for auto-measured-experiment-improve loop

C) Respond to real failures, incorporate experience into next design

D) Add more CloudWatch alarms on resilience metrics for early-regression detection

**Answer: B**

Explanation: Code/infra change = yesterday-resilient breaks today; validation must repeat, not one-off. EventBridge Scheduler runs FIS experiments (e.g., weekly), results Resilience Hub + CloudWatch auto-loop = early regression catch. Quarterly manual (A) = infrequent; post-incident (C) = not validation; alarms only (D) = no inject/verify.

---

**Problem 11.** Measure actual resilience vs. RTO/RPO targets (e.g., AZ-failure RTO 600s). Auto-receive improvement recommendations and cost impact. Best fit?

A) CloudWatch Dashboard — visualize RTO/RPO metrics, see goal-miss visually

B) AWS Resilience Hub — analyze workload, show per-fault-type (Hardware/Software/AZ/Region) gap, improvements, costs; FIS-verify

C) AWS Config — evaluate resilience-related resource config (Multi-AZ yes/no), detect non-compliance

D) FIS alone — inject failures, measure actual recovery time, directly verify RTO/RPO

**Answer: B**

Explanation: Resilience Hub analyzes workload config, assesses set resilience policy actually met, gaps per-fault-type, concrete improvements + costs, verifies via FIS = Well-Architected Reliability Pillar quantified ("can't improve what you can't measure"). CloudWatch (A) = metrics viz; Config (C) = config-compliance; FIS (D) = fault-inject but no measurement/recommendations.

---

**Problem 12.** Global users: normally lowest-latency region, if region dies auto-exclude and only healthy respond, data via async cross-region replication (relational DB, writes single source). Correct combination?

A) Route 53 Simple + RDS Single-AZ, manual failover on disaster

B) Route 53 Latency Routing + health check + Aurora Global Database (single-leader async <1s, secondary promote on failure)

C) Route 53 Weighted 50:50 + DynamoDB Global Tables, even distribution, multi-master replication

D) Global Accelerator (anycast IP) + S3 CRR, instant failover, object replication

**Answer: B**

Explanation: "Lowest-latency region + auto-exclude on failure" = Latency Routing + health check. "Relational DB, single-write, cross-region async replication" = Aurora Global (single-leader, secondary read-only, <1s async, promote secondary ~1min). Simple+Single (A) = no distribution/HA; Weighted 50:50 (C) = ignores latency, DDB is NoSQL not relational; GA+S3 CRR (D) = not relational-DB replication.

---

## 📌 Week 13 Final Summary

One conclusion: **availability is not preventing failures but designing to tolerate them via quorum/replication/failover, validating tolerance via experiments.** Day 1 built single-region HA via replication/quorum (Aurora 6-copy/3-AZ, CAP/PACELC). Day 2 extended multi-region via async global replication (Aurora Global single-leader vs. DDB Global Tables multi-master LWW), DNS/anycast routing, KMS MRK crypto boundaries. Day 3 set four-DR-strategy spectrum via BIA (RTO/RPO economics, "keep running normally" spectrum) and Vault Lock WORM-immutable backups. Day 4 productized Netflix-origin chaos engineering via FIS (blast radius + Stop Condition) and Resilience Hub (quantified) to squarely address "untested recovery doesn't work." Exams hinge on discerning subtle tradeoff boundaries: sync/async, single-leader/multi-master, Pilot Light/Warm Standby, Governance/Compliance, Game Day/Chaos.

## 🔜 Week 14 Preview

**Security Automation — GuardDuty, Security Hub, Config, Audit Manager**

> 💪 Week 13 complete! You've internalized the mindset: don't fear failures; embed them into design premises and validate via experiments.
