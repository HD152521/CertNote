# Day 5 - Week 13 Comprehensive Review: Tying Together High Availability, Multi-Region, DR, and Resilience Validation

Week 13 addressed "how do you design systems that survive failures, and how do you validate that survival actually works?" There is one single insight threading through this entire week — **availability isn't "preventing failures from occurring" but "assuming failure will occur, designing tolerance through replication, quorum, and failover, and validating that tolerance through experiments."** From single AZ to multi-AZ, from single region to multi-region, from backup to Active-Active, and from "it should work" belief to FIS chaos experiments — the week's flow progressively assumes stronger failures and validates more rigorously.

Today we re-weave the four days' core concepts and comprehensively check understanding through scenario problems of the type actually seen on the DOP exam. The exam's pitfalls almost always lie in "subtle trade-off differences between similar-looking choices" — synchronous vs. asynchronous, single reader vs. multi-master, keeping infrastructure on vs. off by default, Compliance Mode vs. Governance Mode. We clarify these boundaries again.

## Four Axes Threading Through the Week

### Day 1 — Multi-AZ: Distributed Principles of Replication and Quorum

Replication is **the RPO-latency trade-off between synchronous and asynchronous**, positioned on CAP/PACELC coordinates. RDS Multi-AZ uses **block-level physical synchronous replication** so Standby acts like a shadow disk—unable to serve reads—while Read Replica uses **logical asynchronous replication** able to serve reads from its own query engine — this physical/logical difference explains "why one can't read and the other can." Aurora internalizes replication to storage via **6-copy/3-AZ quorum (4/6 writes, 3/6 reads, AZ+1 fault model)** and "log is database" design, ahead of traditional DBs. RTO depends on "recovery candidates being hot and data copying not needed," and RDS Proxy hides failover from clients through connection pooling.

### Day 2 — Multi-Region: DNS, Global Replication, Encryption Boundaries

Multi-region must **accept asynchronous replication due to speed of light**, and handling that conflicts/inconsistency is the essence. Route 53 is **DNS-based GSLB** (7 routing policies + quorum health checks) but limited by DNS cache TTL delays, while **Global Accelerator** with anycast fixed IPs handles immediate failover. Data replication is a **single reader (Aurora Global, no conflicts) vs. multi-master (DynamoDB Global Tables, LWW)** trade-off, and LWW carries silent lost update risks from clock skew. **KMS Multi-Region Keys** share the same key material across regions giving replicated ciphertexts portability, and **Route 53 ARC** provides safe DR toggling through control/data plane separation.

### Day 3 — DR 4 Strategies: Economics of RTO, RPO, and Cost

DR is not "how fast" but **using BIA to decide RTO/RPO and balance against cost** (ISO 22301), an economic problem. The 4 strategies are a **spectrum of "how much to keep on by default"** — Backup & Restore (nothing on, cheapest and slowest but IaC shortens RTO) → Pilot Light (data only, app off, path unvalidated) → Warm Standby (scaled-down instance, path validated) → Active-Active (full capacity both, RTO 0 but expensive and needs full-capacity planning for "half down, all throughput"). AWS Backup unifies policy with tags, and **Vault Lock Compliance Mode makes immutable backups with WORM to stop ransomware**.

### Day 4 — Resilience Validation: Resilience Hub and FIS

Untested recovery doesn't work. **Chaos Engineering** (originating Netflix Chaos Monkey) applies scientific method (steady state → hypothesis → failure injection → validation) to reliability. **FIS** implements chaos management with Targets (blast radius dial: ALL/COUNT/PERCENT), Actions, and Stop Conditions (safety belt), while **Resilience Hub** quantifies RTO/RPO goal gaps. EventBridge Scheduler + FIS automates periodic iteration, and Game Day (people/one-time) and Chaos (system/periodic) complement each other.

## Critical Boundaries at a Glance — Exam Pitfalls Organized

| Confusing Pair | Decisive Difference |
|---|---|
| RDS Multi-AZ Standby vs Read Replica | Physical sync (can't read) vs logical async (can read) |
| Aurora vs Aurora Global | Single region 6-copy(30s) vs multi-region async(<1m promote) |
| Aurora Global vs DDB Global Tables | Single reader (no conflicts) vs multi-master (LWW) |
| Route 53 Failover vs Global Accelerator | DNS (cache TTL delay) vs anycast IP (immediate) |
| Pilot Light vs Warm Standby | App off (unvalidated) vs scaled-down instance (validated) |
| Vault Lock Governance vs Compliance | Authority can override vs root cannot (WORM) |
| Backtrack vs PITR | In-place rewind (MySQL, 72h) vs restore to new cluster |
| Game Day vs Chaos | People/one-time vs system/periodic automated |

## 🧠 Scenario Problems

**Problem 1.** A global gaming service uses UDP traffic and must failover instantly to another region if one dies—without client DNS cache delays. Simultaneously, clients should know only 2 fixed IPs. Most appropriate?

A) Route 53 Failover Routing + short TTL (e.g., 10s) to accelerate cache expiration for faster failover

B) AWS Global Accelerator — 2 anycast fixed IPs + health check-based instant re-routing

C) CloudFront distribution + Origin Failover to auto-switch to healthy region origin at edge

D) Route 53 Latency Routing + health check to route to lowest-latency, healthy region

**Answer: B**

Explanation: Route 53-based failover changes the response IP itself, causing delays equal to DNS cache TTL (limitations of A and D), and can't meet UDP/fixed IP requirements. Global Accelerator provides 2 fixed IPs advertised via anycast globally, and on backend region failure, health check-based re-routing is instant—the IP doesn't change so DNS cache is irrelevant for immediate failover. Supports TCP/UDP (L4) matching gaming traffic. CloudFront (C) is for HTTP/HTTPS content caching, unsuitable for UDP.

---

**Problem 2.** Payment system needs RTO 0, RPO 0 or near it, cost almost unconstrained. Must accept simultaneous writes across two regions. Data layer configuration and critical validation risks?

A) Aurora Global Database (single reader) — secondary is read-only but no conflicts, safest consistency

B) DynamoDB Global Tables (multi-master, LWW) + Route 53 Latency Routing, but "silent lost updates on simultaneous same-key writes" and "one region must handle 100% throughput" must be validated

C) RDS Multi-AZ + Read Replica across regions for write in one region, read in another

D) S3 CRR (Cross-Region Replication) bidirectional for both regions to accept simultaneous writes

**Answer: B**

Explanation: Simultaneous writes across regions need multi-master, so DynamoDB Global Tables fits (Aurora Global has read-only secondary, no simultaneous write capability—limitation of A). Two critical validations: First, Global Tables uses LWW to resolve conflicts; clock skew can cause the actual latest write to lose and cause silent lost update—"simultaneous same-key writes" is an anti-pattern. Second, if one region dies, the survivor must handle 100% traffic, requiring each region configured at full capacity (cascading failure prevention). RDS Multi-AZ (C) is single region; S3 CRR (D) is object replication.

---

**Problem 3.** Traditional RDS Multi-AZ system experienced growing read load. Attempted to offload reads to Standby but found it impossible. Reason and correct solution?

A) Standby is in another region preventing cross-region reads — move Standby to same region/AZ

B) Multi-AZ Standby is block-level physical replication with no independent query engine, so can't read — add Read Replica (logical async replication) or switch to Multi-AZ DB Cluster (readable standby)

C) Standby endpoint missing IAM/SG read permissions — add read permissions and security group rules

D) Promote Standby to separate read instance and distribute read traffic

**Answer: B**

Explanation: Traditional Multi-AZ Standby mirrors storage blocks directly (physical replication), so no independent query engine—a "shadow disk" that can't serve reads. For read distribution, either add Read Replica (separate endpoint, reads enabled) via binlog/WAL logical async replication, or switch to Multi-AZ DB Cluster (2022+, <35s failover bonus with readable standby). Region (A), permissions (C) aren't the cause, and Standby promote (D) is failover, not read distribution.

---

**Problem 4.** Aurora MySQL operator accidentally ran a large UPDATE. Need to rewind entire cluster to 5 minutes ago fastest. Separately, "specific table from 30 days ago"—what's the difference?

A) Both restore from snapshot to new cluster, extracting needed time/table points

B) Full rewind to 5 min ago: Backtrack (in-place, max 72h), specific table from 30 days: PITR/snapshot restore (new cluster). Backtrack MySQL-only, activation-after-only

C) Both via Backtrack in-place rewind—5 min and 30 days within window

D) Both via Read Replica promote to separate instance with data from that point

**Answer: B**

Explanation: Aurora Backtrack (MySQL compatible) rewinds the cluster in-place to a time point without creating new instances—fastest for "oops a minute ago" (max 72h window, post-activation only, PostgreSQL unavailable). "30 days ago" or "specific table only" is outside Backtrack scope, requiring PITR or snapshot restore to new cluster. Use cases diverge; confusion is exam pitfall. Lumping via snapshot (A) misses fast in-place rewind; Read Replica promote (D) isn't recovery.

---

**Problem 5.** Lambda serverless app fails with RDS "too many connections" on traffic spike, and DB failover disconnects all—connection storm erupts. Solve both in one go, standard approach?

A) Upsize DB instance class to increase max_connections limit, handle more concurrent connections

B) RDS Proxy — pools/multiplexes connections, suppressing actual DB connection count, maintains client connections during failover to mitigate storm

C) Cap Lambda reserved concurrency to 1, tightly binding simultaneous DB connection opens

D) Add Read Replica to distribute read connections, easing Primary connection pressure

**Answer: B**

Explanation: Lambda's concurrent execution environment opens connections; spike exhausts max_connections; on failover, hundreds of connections reattempt simultaneously, connection-storming new Primary down. RDS Proxy pools/multiplexes between client-DB (managed PgBouncer/HikariCP), suppresses actual DB connections, and maintains client connections during failover to mitigate storm — solves both at once. Upsize (A) isn't root fix; concurrency=1 (C) kills throughput; Read Replica (D) is read distribution, not connection/storm solution.

---

**Problem 6.** Finance regulation mandates backups remain unmodifiable within retention period—root user cannot delete or alter to stop ransomware erasing backups. Correct setup?

A) AWS Backup Vault Lock — Governance Mode enforces retention but permits authorized IAM roles to override

B) AWS Backup Vault Lock — Compliance Mode (WORM, root + everyone barred from deletion within retention)

C) IAM policy explicit Deny on backup deletion (`backup:DeleteRecoveryPoint`) blocks deletion

D) Cross-account backup copy to isolated account's vault against originating account damage

**Answer: B**

Explanation: Vault Lock Compliance Mode enforces WORM (Write Once Read Many)—root included nobody deletes/modifies within retention—truly immutable state (ransomware "delete backups first" defeated, matching SEC 17a-4 compliance like S3 Object Lock Compliance Mode). Governance Mode (A) permits authorized IAM override—"oops prevention" tier, doesn't meet root-exception requirement. IAM Deny (C) changes on privilege escalation; Cross-Account copy (D) alone doesn't guarantee immutability of the copy (target vault needs Vault Lock too).

---

**Problem 7.** Tier 3 non-critical workload, minimize DR cost. All infrastructure Terraform-coded, RTO allows hours. Most appropriate strategy and why?

A) Active-Active — full capacity both regions 24/7 for near-zero RTO, safest choice

B) Backup & Restore — no infrastructure kept on in DR region, minimal cost; IaC + automated backup restore achieves hourly RTO

C) Warm Standby — scaled-down permanent in DR region, validates path, scales on disaster

D) Pilot Light — replicate data only, app tier off, cost-RTO compromise

**Answer: B**

Explanation: Cost minimization first, hours RTO acceptable → Backup & Restore wins—DR region infrastructure off saves most. IaC (Terraform) entire infra coded makes "deploy stack + restore backup" automation hit hourly RTO (immutable infra: rebuild from code+data). Active-Active (A), Warm Standby (C), Pilot Light (D) all keep on-going infrastructure—higher cost, misaligned with "minimize."

---

**Problem 8.** Automate Pilot Light DR activation into code. Correct stages and tools?

A) Engineer manually via console memory/experience step-by-step

B) Step Functions/SSM Runbook: "Read Replica promote → ASG desired 0→N → ALB health wait → Route 53/ARC failover → alert" coded/drill-validated

C) Wiki runbook docs, follow on incident

D) Shorten Backup interval to cut activate-time data loss

**Answer: B**

Explanation: Pilot Light activation: promote Read Replica, scale app tier (ASG 0→N), wait health, Route 53/ARC failover, alert. Code as Step Functions or SSM Automation Runbook → deterministic, repeatable; periodic drill validates—"app tier usually off so unvalidated" Pilot Light risk (path decay) prevented. Manual (A)/docs (C) risk error/unvalidated; shorter Backup (D) unrelated.

---

**Problem 9.** 30% random production EC2 instances, 5 min CPU load, validate Auto Scaling self-heal, halt+rollback if real disaster looms. FIS config?

A) Target ALL + CPU-Stress(PT5M) for full scenario at once, no Stop Condition

B) Target PERCENT(30) + Action CPU-Stress(PT5M) + Stop Condition(CloudWatch P99/error Alarm)

C) Action: Terminate 30% random, validating ASG self-replace

D) Operator directly runs load generator on 30%, halts manually if trouble

**Answer: B**

Explanation: 30% random = PERCENT(30) SelectionMode, CPU = AWSFIS-Run-CPU-Stress, stop on trouble = CloudWatch Alarm Stop Condition — "small radius + fast stop" multi-layer defense. ALL+no-Stop (A) is full impact, undefended; all-Terminate (C) differs from intent (validate CPU, not termination), excessive; manual (D) no reproducibility/automation/safe halt.

---

**Problem 10.** Frequent code/infra changes; resilience silently breaks (regression). Best operational pattern to prevent?

A) Quarterly engineer manual resilience config review, gap-documented

B) EventBridge Scheduler periodic FIS chaos + Resilience Hub/CloudWatch collection → measure-experiment-improve loop automated

C) Respond to real incidents, apply learnings to next design

D) Add tighter CloudWatch alarms on resilience metrics for early regression detection

**Answer: B**

Explanation: Code/infra changes break yesterday's resilience today—validation must be periodic, not one-shot. EventBridge Scheduler runs FIS weekly, Resilience Hub/CloudWatch collect → automated measure-experiment-improve catches regression early. Quarterly manual (A) low frequency; post-hoc (C) not validation; alarm-only (D) doesn't inject/validate.

---

**Problem 11.** Measure actual resilience against RTO/RPO goals (AZ failure RTO 600s) and auto-receive improvement proposals with cost impact. Best service?

A) CloudWatch Dashboard — visualize RTO/RPO metrics, spot goal misses visually

B) AWS Resilience Hub — analyzes workload, presents goal gaps by fault type (Hardware/Software/AZ/Region), recommends improvements+costs, FIS validates

C) AWS Config — evaluate resilience-related resource config (Multi-AZ check) via rules, flag non-compliance

D) FIS alone — inject failure, measure recovery time, check goal hit directly

**Answer: B**

Explanation: Resilience Hub analyzes workload, evaluates policy (Hardware/Software/AZ/Region RTO/RPO) achievability, presents gaps/recommendations/cost, FIS validates—quantifies Well-Architected Reliability Pillar ("can't measure, can't improve"). Dashboard (A) visualization only; Config (C) compliance tracking; FIS solo (D) injects but doesn't measure-vs-goal/advise.

---

**Problem 12.** Global users served from lowest-latency region by default, one region dies → auto-serve only healthy regions, data async-replicated (relational DB, writes single location). Right combo?

A) Route 53 Simple + RDS Single-AZ single region, manual failover on disaster

B) Route 53 Latency Routing + health check + Aurora Global Database (single reader async <1s, secondary promote on disaster)

C) Route 53 Weighted 50:50 + DynamoDB Global Tables traffic split, multi-master replication

D) Global Accelerator anycast + S3 CRR instant failover, data replicated objects

**Answer: B**

Explanation: "Lowest-latency + auto-exclude on fail" = Latency Routing + health check; "relational DB, single writer, async replicate" = Aurora Global (single reader, secondary read-only, <1s async, promote~1min on fail) perfect fit. Simple+Single-AZ (A) no distribution/HA; Weighted 50:50 (C) ignores latency, DDB is NoSQL not "relational"; Global Accelerator+S3 (D) not relational DB replication.

---

## 📌 Week 13 Final Summary

This week's conclusion is singular — **availability isn't preventing failure but designing tolerance assuming failure and validating that tolerance experimentally.** Day 1 built single-region HA via replication/quorum (Aurora 6-copy/3-AZ, CAP/PACELC); Day 2 expanded to multi-region via async global replication (Aurora Global single reader vs DDB Global Tables multi-master LWW) plus DNS/anycast routing and KMS MRK encryption boundary; Day 3 set DR 4 strategies ("how much kept on by default" spectrum) via BIA RTO/RPO economics and Vault Lock WORM immutable backups; Day 4 solved "untested recovery fails" via Netflix-origin chaos engineering, FIS (blast radius + Stop Condition), and Resilience Hub (quantification). Exam success hinges on reading subtle boundaries: sync/async, single reader/multi-master, Pilot Light/Warm Standby, Governance/Compliance Mode, Game Day/Chaos.

## 🔜 Week 14 Preview

**Security Automation — GuardDuty, Security Hub, Config, Audit Manager**

> 💪 Week 13 complete! You've internalized the mindset: don't fear failure, design failure in, validate rigorously.
