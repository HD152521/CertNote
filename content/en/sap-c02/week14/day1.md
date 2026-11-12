# Day 1 - Four DR Strategies and RTO/RPO Mapping — History of Disaster Recovery, Physics of Sync/Async Replication, Cloud DR Economics

On August 14, 2003, the Northeast Blackout struck the northeastern US and Canada, leaving 50 million people without power. Many companies depending solely on their own datacenters stopped operations—but financial institutions with geographically distant DR sites survived. This event embedded "DR is not IT's insurance but the core of Business Continuity" across the industry. Twenty years later, AWS commoditized DR by replacing what would cost hundreds of millions in on-premises building a second datacenter with a few API calls.

In SAP-C02 exams, understanding DR as "turning on backups" stays at SAA level. Pro's core is the decision-making skill: choosing a strategy that precisely meets **RTO (Recovery Time Objective) and RPO (Recovery Point Objective)**—two numbers defined by business—while minimizing cost. Today we decompose why the four DR strategies organize into this spectrum, how sync/async replication obeys physical law, and how cloud inverted DR's economics.

## RTO and RPO — Two Numbers That Decide Everything

DR design starts with two time metrics. **RTO (Recovery Time Objective)** is "maximum time allowed from failure to service recovery," and **RPO (Recovery Point Objective)** is "time span of data loss tolerable during failure." RTO points to the **future after failure** on the timeline, while RPO points to the **past before failure**. RTO 1 hour + RPO 5 minutes means "recover within 1 hour, but up to 5 minutes of data loss is acceptable."

These two numbers aren't set arbitrarily by IT but are outputs of **BIA (Business Impact Analysis)**. Only when business specifies "loss per minute of downtime," can you justify spending 10x more to achieve RTO of 1 minute instead of 10 minutes.

> 💡 **Related Theory**: RTO/RPO are formally defined in **ISO 22301** (Business Continuity Management System standard). ISO 22301 mandates deriving MTPD (Maximum Tolerable Period of Disruption) through BIA, then setting RTO within it. NIST SP 800-34 (Federal IT Emergency Planning Guide) uses the same RTO/RPO/WRT framework. WA Framework's Reliability pillar question (REL13: "how do you plan disaster recovery?") borrows these standard terms. In exams, "data loss business tolerates" immediately maps to RPO; "service recovery time" maps to RTO.

> 🔍 **Deeper Dive**: RTO and RPO are independent. A system can have RPO≈0 (can't lose any transaction) but RTO of hours (okay to recover slowly)—e.g., nighttime batch accounting settlement must preserve every trade (RPO≈0) but only needs recovery by next business morning (RTO hours). Conversely, catalog reads prioritize RTO≈0 (must be instant) but tolerate RPO of minutes (re-sync price changes). Exams separate these two numbers to create traps. When "RPO 0" appears, think sync replication or Active-Active; when "RTO hours allowed," think cost-saving room (Backup & Restore).

## Four Strategies — A Spectrum of "How Much Infrastructure Stays On"

The 2021 AWS DR whitepaper organizes DR into four tiers. The essence is simple: **how much infrastructure does the DR region keep running normally?** The percentage (0% to 100%) determines both cost and RTO simultaneously.

| Strategy | RTO | RPO | Cost | DR Region State | Suitable Workloads |
|----------|-----|-----|------|-----------------|-------------------|
| **Backup & Restore** | Hours to days | Hours | ★ | 0%(data only) | Dev, staging, non-critical |
| **Pilot Light** | 10 min–hours | Minutes | ★★ | DB only active, apps cold | Medium importance |
| **Warm Standby** | Minutes–30 min | Seconds–minutes | ★★★ | Scaled-down full stack always running | Mission-critical |
| **Multi-Site Active-Active** | 0–seconds | 0–seconds | ★★★★ | 100%, both process traffic | Finance, payments, gaming |

> 🔍 **Deeper Dive**: Don't memorize the four—understand this one sentence: **"capacity and RTO are inversely proportional; capacity and cost are proportional."** Backup & Restore keeps 0% compute in DR region, cheapest but RTO longest (infrastructure built from scratch). Multi-Site runs 100%, cost nearly 2x but RTO approaches 0 (traffic already flowing). The critical difference between Pilot Light and Warm Standby is **"whether app servers run"**—Pilot Light keeps only DB hot, apps cold (AMI prepared); Warm Standby keeps a reduced app stack always up. Warm Standby only "scales out," but Pilot Light must "start apps," yielding longer RTO.

### Backup & Restore — Lowest-Cost Baseline

Regular snapshots (EBS, RDS) and S3 Cross-Region Replication send only data to the DR region; on failure, rebuild entire infrastructure via IaC (CloudFormation, Terraform). Cost is essentially storage only, but infrastructure provisioning plus data recovery takes hours.

> 📚 **Case Study**: The **February 28, 2017 AWS S3 us-east-1 massive outage** (4 hours) started when an engineer mistyped a command, causing mass removal of S3 billing subsystem servers. Countless services (Trello, Quora, Slack partial) depending solely on single-region S3 backup went down simultaneously. Lesson is clear: **backups must be isolated to different regions (or accounts)**. Same-region backup disappears with the region. In exams, "guard against region-wide failure" signals Cross-Region requirement.

### Pilot Light — DB Hot, Apps Cold

Named after airplane pilot light—a small flame keeping the engine ready. DR region keeps DB (Aurora Global Reader, DDB Global Table) always on continuously replicating data, but app servers exist only as AMI/Launch Template (not running). On failure, raise ASG min capacity to start apps and Route 53 switches traffic.

### Warm Standby — Scaled-Down Stack Always Running

DR region runs the **entire stack at reduced capacity** always. App servers already run, so on failure, scale out ASG to production level—RTO is just the scaling time.

### Multi-Site Active-Active — Both Regions Processing Traffic

Both regions process production traffic. Aurora Global (write forwarding) or DDB Global Tables keep data bidirectional sync, Route 53 Latency/Weighted or Global Accelerator distributes traffic. One region dies, the other already processes traffic—RTO approaches 0. Trade-off: data consistency design complexity (conflict resolution) and nearly 2x cost.

> 🎯 **Scenario**: "A global payment company promises 99.99% SLA (annual downtime ~53 minutes). What DR strategy?" — Answer: **Multi-Site Active-Active + Aurora Global (or DDB Global) + Route 53**. 4 nines leave only ~53 minutes annual downtime, so Pilot Light or Warm Standby needing minutes to tens of minutes recovery is practically impossible. 2x cost justified since payment minute-downtime loss exceeds it. In exams, "99.99%+ SLA + global" signals Multi-Site.

## Sync vs Async Replication — The Physics Law Determining RPO

DR strategy RPO ultimately depends on **data replication method**. Replication method is bound by the physics of light speed.

**Synchronous replication** waits until write reaches primary and all copies, receives confirmation (ack), then returns success to client. RPO becomes 0 but round-trip latency (RTT) to copies adds to every write. **Asynchronous replication** returns success immediately after primary write, sending copies later. Writes are fast but if primary dies, unsent data is lost—RPO > 0.

The key is **distance**. us-east-1 (Virginia) and us-west-2 (Oregon) are ~4,000km apart; light round-trip through fiber takes physically ~40ms alone. Sync replication across regions adds this 40ms to every write, collapsing throughput. Therefore **sync replication is only practical across AZs (few km, 1-2ms latency); cross-region is almost always async**.

> 💡 **Related Theory**: This is the physical root of CAP Theorem and PACELC trade-offs. CAP says "during partition (P), choose Consistency (C) or Availability (A)." PACELC goes further: "even without partition (Else), choose between Latency (L) and Consistency (C)." Cross-region sync replication chooses strong Consistency (C), tolerating Latency (L). Async trades latency for Consistency (eventual). Aurora uses cross-region async (storage-level) and within-region sync specifically because of this latency-consistency balance. In exams, "cross-region RPO 0" is nearly impossible or hides massive latency cost.

> ⚠️ **Pitfall**: Don't memorize "RPO 0 = always sync replication." DDB Global Tables are **async** Active-Active but operationally RPO approaches 0—all regions accept writes, so one region dying means data already written elsewhere. Aurora Global's secondary is read-only (single-region writes), RPO usually sub-1-second (not zero). In exams, "RPO 0 + dual-region writes" is DDB Global Tables; "RPO 1 second + global SQL" is Aurora Global.

## Cloud Inverted DR Economics

On-premises, DR meant **building a second datacenter**. It buried hundreds of millions in "insurance" on buildings, servers, cooling, staff that never saw production traffic—only large enterprises and finance could afford genuine DR. Cloud fundamentally changed this.

| Aspect | On-Premises DR | Cloud DR |
|--------|----------------|----------|
| **Initial Investment** | Build second datacenter (CAPEX) | Zero (provision when needed) |
| **Idle Cost** | 100% resource cost always | Pilot Light only DB cost |
| **DR Testing** | Can't validate without real failure | FIS, Game Days regularly |
| **Scaling** | Limited to pre-purchased capacity | Auto Scaling unlimited on failure |
| **Shorten RTO** | Buy more hardware | Change to Warm/Multi-Site (config) |

The core: **"Stop guessing capacity"** (WA general principle) shines brightest in DR. On-premises had to pre-buy entire production capacity for DR region, but cloud runs Pilot Light—DB on, apps off—then Auto Scales explosively only on failure—near-zero idle cost while meeting RTO.

> 🔍 **Deeper Dive**: This economic shift enables cloud DR to **recycle DR sites as cost-saving opportunity**. E.g., Warm Standby's reduced DR stack normally runs batch/analytics, or Multi-Site's dual regions via Latency Routing serve users from the nearer region **simultaneously achieving DR and performance optimization**. Impossible on-premises: "dual-use of DR resources." In exams, "use DR region normally for cost efficiency" signals Active-Active.

## Route 53-Based Failover Orchestration

DR's final puzzle: "detect failure and route traffic to DR." AWS standard is **Route 53 Failover Routing + Health Check**. Attach Health Check to primary record; when unhealthy, DNS automatically switches to Secondary (DR).

- **Failover Routing**: Primary/Secondary redundancy. Auto-switch on Health Check failure.
- **Latency Routing**: Route to fastest region (Multi-Site suitable).
- **Weighted Routing**: Distribute by weight (gradual switchover, canary).
- **Geolocation**: Based on user location (data sovereignty).

> ⚠️ **Pitfall**: DNS Failover has hidden **TTL delay** trap. Even if Route 53 changes record, clients and intermediate resolvers cache the old IP for TTL duration—switching isn't instant. RTO requiring seconds needs more than DNS Failover alone; **Global Accelerator** (anycast IP, fixed endpoint bypassing DNS cache) or Active-Active needed. In exams, "RTO 0–seconds + bypass DNS cache" signals Global Accelerator; "RTO minutes acceptable" signals Route 53 Failover.

## Summary

DR is **business defines RTO/RPO → choose one of four strategies meeting both at lowest cost → implement via Route 53 and replication**. Four strategies (Backup & Restore, Pilot Light, Warm Standby, Multi-Site) spectrum is "how much infrastructure stays on"; capacity and RTO inversely proportional, cost proportional. RPO determined by sync (within-AZ, RPO 0) or async (cross-region, RPO>0) replication, rooted in light-speed physics and CAP/PACELC.

SAP exam frequent mappings: (1) "RTO 24hrs, minimize cost" → **Backup & Restore**, (2) "DB always replicate, apps stopped" → **Pilot Light**, (3) "Reduced stack always, minutes RTO" → **Warm Standby**, (4) "99.99% SLA, dual-region traffic" → **Multi-Site Active-Active**, (5) "RPO 0 + dual-region writes" → **DDB Global Tables**, (6) "Global SQL, RPO 1 second" → **Aurora Global**, (7) "Auto-switch DR traffic" → **Route 53 Failover + Health Check**, (8) "RTO seconds, bypass DNS cache" → **Global Accelerator**. Next day digs into backup infrastructure (AWS Backup, Vault Lock, Cross-Region Copy) to tool level.

---

## 📝 Practice Questions

**Question 1.** A development team is designing DR for a staging environment. The business SLA is very lenient, with an RTO of 24 hours and an RPO of 12 hours, and the team has been told to minimize cost. What is the most appropriate strategy?

A) Multi-Site Active-Active

B) Warm Standby

C) Pilot Light

D) Backup & Restore

**Answer: D**

Explanation: When a lenient target of RTO 24 hours and RPO 12 hours is given together with an instruction to "minimize cost," the answer is Backup & Restore, which keeps 0% compute running in the DR Region. If you only send data over with periodic snapshots and CRR and recreate the infrastructure with IaC during a failure, it takes several hours but easily fits within the 24-hour RTO. A, B, and C all provide a faster RTO but incur idle-resource cost in proportion, which is over-engineering that wastes money on an RTO that does not need to be met. Trap: Pro thinking is choosing the cheapest strategy that can meet the requirement, and exceeding the RTO target by a wide margin is a waste of cost.

---

**Question 2.** A company tried to set up **synchronous cross-Region replication (RPO 0)** for a database between the DR Region us-west-2 and the production Region us-east-1, and write throughput dropped sharply. What is the most accurate cause?

A) The instance specifications in us-west-2 are insufficient

B) The round-trip latency of a distance of about 4,000 km is added to every write

C) KMS encryption slows down replication

D) The Route 53 TTL is too long

**Answer: B**

Explanation: Synchronous replication completes a write only after receiving acks from all replicas, so the round-trip time (RTT) between the primary and the replicas is added to every write latency. us-east-1 ↔ us-west-2 is about 4,000 km, so the physical round trip of light alone is about 40 ms, and network overhead on top of that adds tens of ms to each write. This is why synchronous cross-Region replication is impractical and asynchronous replication is almost always used (the latency-versus-consistency trade-off of CAP/PACELC). A wrongly assumes a specification problem, and C and D are unrelated to the essence of the throughput drop. Trap: when "cross-Region RPO 0" is required, suspect a large latency cost.

---

**Question 3.** A media company wants to **always run** the same full stack as production in the DR Region at **reduced capacity** and recover within minutes by scaling out with Auto Scaling during a failure. What is this strategy?

A) Backup & Restore

B) Pilot Light

C) Warm Standby

D) Multi-Site Active-Active

**Answer: C**

Explanation: The definition of Warm Standby is "keep the full stack (including app servers) running at reduced capacity in the DR Region at all times, and reach production level by scaling out during a failure." Because the app servers are already running and only scale-out time is needed, the RTO is a few minutes. B (Pilot Light) keeps only the DB running and the app is cold (only an AMI is prepared), so the app must be started from scratch and the RTO is longer — "whether the app servers are always running" is the decisive difference between the two. A runs nothing in the DR Region, and D has both sides receiving traffic. Trap: "the full stack running at all times in miniature" is the direct-answer keyword for Warm Standby.

---

**Question 4.** A global gaming company requires 99.99% availability and simultaneous writes in both Regions for its matchmaking service. What is the most appropriate DR and data configuration?

A) Backup & Restore + S3 CRR

B) Pilot Light + Aurora Read Replica

C) Warm Standby + RDS Multi-AZ

D) Multi-Site Active-Active + DynamoDB Global Tables

**Answer: D**

Explanation: A 99.99% SLA (about 53 minutes of downtime per year) is practically impossible with Pilot Light or Warm Standby, which take several minutes during a failure, and only Multi-Site Active-Active, in which both Regions already receive traffic, brings the RTO close to 0. For "simultaneous writes in both Regions," DynamoDB Global Tables, which is multi-master, is the answer (the secondary of Aurora Global is read-only). A, B, and C all have an RTO of minutes or more and cannot meet a four-nines SLA, and the Read Replica in B does not support writes in both Regions. Trap: "99.99% + writes in both Regions" is the direct-answer combination of Multi-Site + DDB Global Tables.

---

**Question 5.** A company configured DR failover with Route 53 Failover Routing, but during an actual failure some users still connected to the dead primary for several minutes. What is the most accurate cause and the solution that reduces RTO to seconds?

A) Increase the Health Check interval

B) DNS TTL caching is the cause, and Global Accelerator bypasses DNS caching

C) Delete the Secondary record

D) Move Route 53 to another Region

**Answer: B**

Explanation: Even if Route 53 switches the record to the Secondary, if clients and intermediate DNS resolvers cache the previous IP for the TTL, the failover is delayed by that amount of time — this is the inherent limitation of DNS-based failover. If RTO must be in seconds, use Global Accelerator's anycast static IPs. Clients always see the same IP, and endpoints are switched instantly inside the AWS network, so they are unaffected by DNS caching. A actually slows detection, and C and D are unrelated. Trap: "failover delay caused by DNS caching + RTO in seconds" is the signal for Global Accelerator.

---

**Question 6.** To reduce cost, a company does not want to leave its DR Region idle during normal operation and wants to use it to serve user traffic as well. What is the most appropriate approach?

A) Switch to Backup & Restore

B) Run a larger DB only in Pilot Light

C) Use Multi-Site Active-Active, tying both Regions together with Latency Routing to achieve DR and performance optimization at the same time

D) Delete the DR Region

**Answer: C**

Explanation: The key difference between the economics of cloud DR and on-premises DR is that DR resources can be used for two purposes. If you run both Regions as production with Multi-Site Active-Active and serve users from the closer Region with Route 53 Latency Routing, you get DR (the other side absorbs the load if one fails) and performance optimization (lower latency) at the same time — idle resources disappear. A and B make the DR Region even more idle, and D gives up DR. Trap: "using the DR Region during normal operation as well" is the signal for an Active-Active configuration.

---

**Question 7.** What is the most accurate description of the relationship between RTO and RPO?

A) RTO and RPO must always have the same value

B) RTO is the future time until recovery after a failure and RPO is the past time of acceptable data loss before the failure, so they are independent of each other

C) If RPO is 0, RTO must also be 0

D) RTO means data loss and RPO means recovery time

**Answer: B**

Explanation: On the timeline, RTO (Recovery Time Objective) refers to the future after the failure (the time allowed until recovery), and RPO (Recovery Point Objective) refers to the past before the failure (the time span of data that may be lost), and they are independent of each other. There are real cases, such as a nightly-batch accounting system, where RPO ≈ 0 (all transactions preserved) but RTO is several hours (recovery by the next business day). C wrongly couples the two, and D swaps the definitions of RTO and RPO. Trap: you must distinguish precisely "acceptable data loss" = RPO and "recovery time" = RTO, and the two vary independently.

---