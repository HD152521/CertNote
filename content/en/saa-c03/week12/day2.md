# Day 2 - Why the Resilience Domain Reduces to Two Variables: "Blast Radius and Replication Mode"

On the SAA exam, resilience architecture (Domain 2) accounts for 26%. If the security domain was a verdict problem — "is this request allowed?" — the resilience domain is a radius problem: **"how far does this failure spread, and how much can I afford to lose?"** The reason test-takers who merely memorize formulas like "Multi-AZ is HA, Multi-Region is DR" get stuck on scenarios is that what the exam asks is not a formula but **"onto which isolation level and replication mode do you map the blast radius this workload must survive?"** Reviewing resilience properly means mapping keywords to services while seeing how the two variables beneath them — **the failure isolation unit (AZ/Region) and the replication mode (synchronous/asynchronous)** — simultaneously determine RTO, RPO, and cost.

This article re-weaves Domain 2 into five flows: compute resilience (how to scatter stateless), data resilience (how to replicate state), the 4 DR tiers (how to trade off cost and recovery speed), traffic routing (where to send on failure), and decoupling (how to pry components apart). Most of the exam's traps come from **confusing the isolation unit and the replication mode** — "mistaking Multi-AZ for DR," "mistaking asynchronous replication for strong consistency."

> 💡 **Related theory**: Every resilience trade-off reduces to the distributed-systems **CAP theorem** — during a network Partition you cannot simultaneously guarantee Consistency and Availability. RDS Multi-AZ's synchronous replication chooses consistency (CP) to gain RPO 0 but is only possible between nearby AZs, while DynamoDB Global Tables' multi-region writes choose availability (AP) and accept eventual consistency. Going a step further, the **PACELC theorem** holds that "even in normal times without a partition (Else), you must choose between Latency and Consistency" — synchronous replication increases write latency even in normal operation because it waits for remote commits. Every choice among RTO/RPO/cost is ultimately CAP/PACELC translated into business language.

## Compute Resilience Is the Simple Principle of "Scattering Stateless Across Multiple AZs"

The first layer of resilience is compute. Stateless compute is easy to replicate — with no state, replicate the same instance across multiple AZs and if one dies the rest take over. Stretch an **Auto Scaling Group (ASG)** across subnets in multiple AZs, and even if one AZ vanishes entirely, the ASG spins up new instances in other AZs to restore target capacity. Connecting an **ELB Health Check** to the ASG matters here, because the ASG by default watches only EC2 status checks (hardware level); to catch cases where the application is dead but the OS is alive, you must **explicitly enable the ELB health check**.

Let's line up the finer keywords too. A **Lifecycle Hook** pauses an instance briefly before it terminates (Terminating:Wait) to perform graceful shutdown such as log uploads or connection draining. **Capacity Rebalancing** launches a replacement instance in advance, before a Spot instance receives its 2-minute reclamation warning, to mitigate interruption. **Fargate** runs containers serverlessly without EC2 management, shifting operational burden and patching responsibility to AWS.

> 🔍 **Going deeper**: The internal reason the ASG's health check splits into two kinds is that **the failure layers differ**. The EC2 status check watches system status as the hypervisor sees it (host hardware, network reachability) and instance status (whether the OS booted). But even if the OS is up fine, if the application process hangs or port 8080 stops responding, the EC2 check considers this "healthy." So you must pull the ALB/NLB **target-group health check** (which periodically probes an actual HTTP path or port) into the ASG's decision criterion, so that application-level failures are also judged "unhealthy" and instances are replaced. Omitting this setting produces a silent failure where "the health check passes but users get 503s" — a trap that fires often in practice.

> ⚠️ **Pitfall**: **If a NAT Gateway is in only one AZ, an AZ failure cuts internet for private subnets in other AZs too.** A NAT GW is an AZ-scoped resource, so if you place a NAT only in AZ-A and AZ-B's route table points at that NAT, then when AZ-A dies, the outbound internet (patching, external APIs) for AZ-B instances is paralyzed along with it. For true resilience you must **place a NAT Gateway in each AZ** and have that AZ's route table point at its own AZ's NAT. When you see "private-subnet internet resilience" on the exam, per-AZ NAT is the answer.

## Data Resilience Splits by "Which Mode You Replicate State In"

For the state layer, replication mode is everything. **RDS Multi-AZ** **synchronously replicates** every write on the primary to a standby in another AZ, guaranteeing RPO 0, and on a primary failure automatically switches the DNS endpoint to the standby (about 60–120 seconds) — the standby is a pure standby copy that takes no reads. A **Read Replica** is an **asynchronous** copy for read scaling and is unsuited to reads that need strong consistency (replication lag exists). **Aurora** sits atop distributed storage that replicates data 6 ways across 3 AZs, so even if one AZ vanishes the data survives. Crossing regions, it splits into **Aurora Global Database** (dedicated replication infrastructure, replication lag usually under 1 second, single writer) and **DynamoDB Global Tables** (multi-region simultaneous writes = Active-Active, conflicts resolved by last-writer-wins).

Let's organize the storage and messaging layers too. **S3 Standard** replicates objects across at least 3 AZs (only One Zone-IA is single-AZ, a trap), and **CRR** (Cross-Region Replication) is asynchronous cross-region replication. Messaging, whose essence is asynchrony and retries, gains resilience via **SQS** (isolating failed messages with a DLQ) and **Kinesis Data Streams** (retaining the stream so it's replayable).

> 💡 **Related theory**: The secret to how DynamoDB Global Tables takes writes in multiple regions simultaneously without breaking into split-brain (each side holding a different truth) is **pre-defining the conflict-resolution rule**. Last-writer-wins is the rule that each write carries a timestamp and the latest one wins — the price of accepting the **eventual consistency** model ("values may differ per region for a moment, but once replication converges they'll be identical in the end") is gaining the availability (AP) of every region always accepting writes. Aurora Global, conversely, funnels writes to one region to preserve consistency (single writer), and if that region dies it pays the procedural cost of promotion (RTO about 1 minute). Same Multi-Region, but a different side of CAP was chosen.

> ⚠️ **Pitfall**: **"A Read Replica provides strong consistency"** is a perennial wrong answer. A Read Replica uses asynchronous replication, so during the replication lag (usually tens of ms to a few seconds) its value can differ from the primary. When you must immediately and accurately read data you just wrote (read-after-write), you must read from the primary, not a Read Replica. Likewise, **DynamoDB's GSI (Global Secondary Index) provides only eventual consistency** (no strongly-consistent reads). When you see "strong consistency required," filter out every asynchronous-replica option as wrong.

## The 4 DR Tiers Are a Spectrum That "Trades Off Cost and Recovery Speed in Steps"

DR against region-level disaster is standardized into 4 tiers, each lowering RTO/RPO in exchange for raising cost. **Backup & Restore** keeps only Cross-Region snapshots/backups and rebuilds infrastructure on failure — cheapest, but RTO/RPO are in hours (h). **Pilot Light** synchronizes data to another region in real time but keeps the application off (only the pilot flame lit) — RTO/RPO drop to minutes and cost is medium. **Warm Standby** keeps even the application running at all times at reduced scale — since you only need to scale up on failure, RTO is shorter (RPO in seconds). **Active-Active** has both regions taking full-scale traffic simultaneously — RTO/RPO are near-0 but cost is doubled.

The core of this spectrum is that **the looser the required RTO/RPO, the cheaper the tier you should pick**. "RPO 1 hour, RTO several hours + cost-sensitive" is Backup & Restore; "RTO ~0, RPO ~0 + cost-insensitive" is Active-Active. **AWS Elastic Disaster Recovery (DRS)** replicates servers at the block level in real time, a cost-efficient Pilot Light tool.

> 🔍 **Going deeper**: "Why does RDS Multi-AZ failover take about 60 seconds rather than instantly (0 seconds)" resolves through the internal behavior and **client-side DNS caching**. AWS begins failover only after detecting the primary's failure via consecutive health-check failures (a safeguard against unnecessary failover on a brief blip), then promotes the standby and repoints the IP that the RDS endpoint (CNAME) resolves to at the new instance. Here, if the application or JVM caches DNS results for a long time, it keeps connecting to the dead primary even after the endpoint changes. So to receive failover quickly, the practical standard is to set a short DNS TTL (e.g., 5 seconds) on the connection pool. Aurora mitigates this problem with the cluster endpoint, making promotion faster (usually within 30 seconds).

> 📚 **Case study**: The large-scale AWS us-east-1 outage on December 7, 2021, seared in that "a region, too, is a failure unit." An automated scaling activity of internal network devices ran away and overloaded the internal network, paralyzing the **control plane** of core APIs like EC2, DynamoDB, and Lambda for hours. The lesson is that **even if the data plane (already-running instances) is alive, automatic recovery halts when the control plane (creating new instances, scaling, API calls) is dead** — even workloads scattered across Multi-AZ can't recover if "the API that launches new instances" is blocked. After this incident, many companies removed single-region dependence on us-east-1 and re-examined Multi-Region DR. This is the real-world backdrop for "Multi-AZ is not DR" being an exam regular.

## Traffic Routing and Decoupling — Where to Flow the Failure and How to Pry Things Apart

On top of Multi-Region, how to route traffic is the next decision. **Route 53 routing policies** split by keyword — "fastest region for the user" is **Latency**, "different content/regulation by location" is **Geolocation**, "canary deployment / traffic %" is **Weighted**, and "primary-backup automatic switch" is **Failover** (tied to health checks). If you need finer failover control, **Route 53 Application Recovery Controller (ARC)** lets you toggle routing controls manually and explicitly.

Another axis of resilience is **decoupling**. Connect components directly and one death cascades into collapse, but place a buffer between them and they're isolated. **SQS** separates producers and consumers with a queue to absorb surges, **SNS Fanout** (SNS → multiple SQS) sprays one event to many subscribers, **EventBridge** does rule-based event routing, **Step Functions** does workflow orchestration, and **Pipes** connects source-to-target without code. This decoupling is the key pattern that keeps "one component's failure from spreading to the whole."

> 💡 **Related theory**: The safety of decoupling and retries rests on the distributed-systems concept of **idempotency**. Because the network is unreliable (one of the 8 fallacies of distributed computing), messages can be delivered more than once — SQS standard queues in particular are "at-least-once" delivery, so the same message can arrive twice. Therefore consumers must be designed so that processing the same message twice yields the same result (idempotent) — e.g., using an order ID to prevent duplicate processing. Also, **if the SQS visibility timeout is shorter than actual processing time**, a message being processed times out, becomes visible again, and another consumer processes it in duplicate. So set the visibility timeout generously above processing time. Combined with exponential backoff on retries, this safely handles transient failures.

> ⚠️ **Pitfall**: **Using standard SNS/SQS when ordering is required** is a common wrong answer. SNS standard and SQS standard don't guarantee order (best-effort), so if strict order is needed it must be the **SNS FIFO + SQS FIFO** combination. Also, don't confuse "Pilot Light" with Warm Standby — Pilot Light is a state where **only data is synchronized and the application is off (OFF)**, so on failure the app must boot and scale, giving it a longer RTO than Warm Standby. Keyword "lowest cost + data always current" is Pilot Light; "always running at reduced scale" is Warm Standby.

## Comparing Other Clouds' Resilience Models

| Category | AWS | Azure | GCP |
|------|-----|-------|-----|
| Availability zone | Availability Zone | Availability Zone | Zone |
| Global RDB | Aurora Global Database | Cosmos DB / SQL Geo-Replication | Cloud Spanner (global strong consistency) |
| Global NoSQL Active-Active | DynamoDB Global Tables | Cosmos DB (multi-master) | Firestore / Bigtable replication |
| Global traffic routing | Route 53 | Traffic Manager / Front Door | Cloud DNS / Cloud Load Balancing |
| Message decoupling | SQS / SNS / EventBridge | Service Bus / Event Grid | Pub/Sub |

GCP **Spanner** is contrasting — it provides strong consistency globally via atomic clocks (TrueTime), trying not to give up CAP's consistency, but is that much more expensive and specialized. Azure **Cosmos DB** is distinctive in letting you pick from 5 consistency levels on a slider so the customer tunes "consistency vs. latency." Each cloud solves the same Multi-Region problem at a different point on CAP.

> 🔍 **Going deeper**: The 4 DR tiers in fact share a root with the recovery-strategy spectrum defined in **NIST SP 800-34** (the federal contingency-planning guide for information systems). The traditional DR terms cold site (backup only), warm site (partial infrastructure), and hot site (full redundancy) have been cloud-ified into AWS's Backup & Restore, Pilot Light/Warm Standby, and Active-Active. The difference is that in the cloud, "you pay almost nothing for turned-off infrastructure" — a traditional hot site pays full cost for idle hardware, but AWS Pilot Light pays only for data replication and spins up compute at failure time, achieving the same RTO far more cheaply. This is the core of how cloud DR changed the economics.

## Checking It Yourself with the CLI

```bash
# Enable the ELB health check on the ASG (detect application-level failures)
aws autoscaling update-auto-scaling-group --auto-scaling-group-name web-asg \
  --health-check-type ELB --health-check-grace-period 120

# Enable RDS Multi-AZ (synchronous standby)
aws rds modify-db-instance --db-instance-identifier orders-db \
  --multi-az --apply-immediately

# Add a region to a DynamoDB Global Table (Active-Active)
aws dynamodb update-table --table-name Orders \
  --replica-updates 'Create={RegionName=us-west-2}'

# Route 53 Failover record (Primary-Backup)
aws route53 change-resource-record-sets --hosted-zone-id Z123 \
  --change-batch file://failover.json

# Adjust SQS visibility timeout (prevent duplicate processing)
aws sqs set-queue-attributes --queue-url https://sqs.../orders \
  --attributes VisibilityTimeout=300
```

## Wrapping Up

The resilience domain (26%) looks like keyword memorization, but it's a design problem where two variables — **the failure isolation unit (AZ/Region) and the replication mode (synchronous/asynchronous)** — simultaneously determine RTO, RPO, and cost. ① **Compute** scatters stateless across multiple AZs with an ASG, with enabling the ELB health check and per-AZ NAT as the keys. ② **Data** is all about the distinction between synchronous (Multi-AZ, RPO 0) and asynchronous (Read Replica, CRR, Global Tables), and Read Replicas are unsuited to strong consistency. ③ The **4 DR tiers** are a cost↔recovery-speed spectrum, so the looser the RTO/RPO, the cheaper the tier you pick. ④ **Routing** is Route 53 policy keyword matching; **decoupling** is backed by idempotency and visibility timeout. The 2021 us-east-1 incident proves in reality the key trap: "a region, too, is a failure unit, and Multi-AZ is not DR."

In the next article, we'll re-weave Domain 3, high-performance architecture, by the principle "the latency-throughput trade-off and how close you keep data to the user."

---

## 📝 연습 문제

**문제 1.** A company requires both RPO 0 and RTO ~0, and cost is no object. It must have zero downtime even during a region failure. What is the most appropriate DR pattern?

A) Backup & Restore B) Pilot Light C) Warm Standby D) Active-Active

**정답: D**

해설: **Active-Active** has both regions taking full-scale traffic simultaneously, so even if one region dies it provides zero downtime with near-0 RTO/RPO — the most expensive, matching the "cost is no object" condition. Backup & Restore (A) has RTO/RPO in hours, Pilot Light (B) has the app off so booting takes time, and Warm Standby (C) is reduced scale so scale-up takes time. "RTO ~0 / RPO ~0 / cost-insensitive" is the answer signal for Active-Active. Conversely, cost-sensitive + loose targets means picking the cheapest tier.

---

**문제 2.** An ASG instance must upload logs to S3 and clean up connections just before it terminates. What is the appropriate mechanism?

A) UserData script B) Lifecycle Hook (Terminating:Wait) C) CloudWatch alarm D) Scheduled Action

**정답: B**

해설: A **Lifecycle Hook** pauses an instance briefly before it transitions to the terminating (or starting) state (Terminating:Wait) so that graceful-shutdown work like log uploads and connection draining can run in the meantime. UserData (A) runs once at boot and doesn't fit termination-time work, a CloudWatch alarm (C) is a metric-based trigger not a pre-termination wait mechanism, and a Scheduled Action (D) merely adjusts scale at a set time. "Cleanup work before termination" = Lifecycle Hook is the answer.

---

**문제 3.** A global service needs a low-latency NoSQL that reads and writes simultaneously across multiple regions. What is the most suitable choice?

A) DocumentDB B) DynamoDB Global Tables C) Aurora Global Database D) RDS Cross-Region Read Replica

**정답: B**

해설: **DynamoDB Global Tables** is an Active-Active NoSQL writable in all regions, auto-resolving conflicts with last-writer-wins and keeping replication lag usually under 1 second. Aurora Global (C) is single-writer (writes in only one region), so it doesn't fit "simultaneous writes in all regions"; a Cross-Region Read Replica (D) is a read-only copy; and DocumentDB (A) is a MongoDB-compatible document DB, not a global multi-master model. "Multi-region simultaneous-write NoSQL" = Global Tables.

---

**문제 4.** A team wants the outbound internet (patching, external APIs) of private subnets to stay up even during an AZ failure. What is the correct design?

A) All AZs share a single NAT Gateway B) Place a NAT Gateway in each AZ and have that AZ's route point at its own NAT C) Consolidate onto one NAT Instance D) Attach an Internet Gateway directly to the private subnets

**정답: B**

해설: A NAT Gateway is an **AZ-scoped resource**, so binding all AZs to a single NAT cuts outbound internet for other AZs too when that AZ fails. For resilience you must **place a NAT GW in each AZ** and have that AZ's route table point at its own AZ's NAT. A and C create a single point of failure, and D makes a private subnet no longer private if you attach an IGW directly (a misconfiguration). "Private-subnet internet resilience" = per-AZ NAT.

---

**문제 5.** You want to route users to the region with the lowest latency to give the fastest response. What is the appropriate Route 53 policy?

A) Geolocation B) Latency C) Weighted D) Failover

**정답: B**

해설: **Latency-based routing** sends users to the fastest region based on the measured network latency between the user and each region. Geolocation (A) routes by the user's geographic location (country/continent) for regulation and content localization, which differs from "fastest" (nearest isn't always fastest); Weighted (C) distributes traffic by ratio (canary); and Failover (D) is for primary-backup switching. "Fastest region / lowest latency" = Latency is the answer signal.

---

## 📌 Key Takeaways

The resilience domain (26%) is a design problem where the failure isolation unit (AZ/Region) and replication mode (synchronous/asynchronous) simultaneously determine RTO, RPO, and cost. Compute scatters stateless across multiple AZs with an ASG, with enabling the ELB health check and per-AZ NAT as the keys, and data is all about the distinction between synchronous (Multi-AZ, RPO 0) and asynchronous (Read Replica, CRR, DDB Global Tables, eventual consistency). The 4 DR tiers (Backup-Restore → Pilot Light → Warm Standby → Active-Active) are a cost↔recovery-speed spectrum, so the looser the requirement, the cheaper the tier. Route 53 is keyword matching (Latency/Geo/Weighted/Failover), and decoupling is backed by idempotency and visibility timeout. "Multi-AZ is not DR," "Read Replica is unsuited to strong consistency," and "a single NAT is an AZ single point of failure" are the three big traps.
