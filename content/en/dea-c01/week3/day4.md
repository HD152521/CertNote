# Day 4 - Ingestion Architecture Patterns: Lambda Architecture and Event-Driven Ingestion

We've covered streaming processing (Day 1), reliability (Day 2), and CDC replication (Day 3) as individual technologies. Today we step back to see **how to weave them into one system**. In data engineering, "which service?" matters less than "how do we arrange the pieces?" Same components become robust pipelines or brittle spaghetti based on topology.

Today we cover two axes: first, processing architecture handling batch and stream together (Lambda vs Kappa); second, loose coupling via event-driven ingestion (EventBridge, SQS, SNS).

## Lambda Architecture: Dual Paths for Batch and Stream

**Lambda Architecture** (unrelated to AWS Lambda service) is a pattern sending same data down two paths.

```
                         ┌─→ [Batch Layer] ──→ [Batch View] ─┐
[Raw Data] ──→ branch ──→ │                                    ├─→ [Serving Layer] → queries
                         └─→ [Speed Layer] ──→ [Realtime View]┘
```

| Layer | Role | Trait |
|------|------|-------|
| Batch Layer | Reprocess all data periodically | Accurate but slow (completeness) |
| Speed Layer | Process recent data in real-time | Fast but approximate (low latency) |
| Serving Layer | Merge both views, answer queries | Unified answers to users |

The idea: Speed Layer rapidly approximates "just-arrived data" for immediate display. Meanwhile Batch Layer precisely reprocesses all data to produce the truth. Over time, batch results override realtime approximations. "Recent is fast, history is accurate" — both covered.

AWS implementation:

```
Batch Layer  : S3(raw) → Glue/EMR Spark → S3(batch view) → Athena/Redshift
Speed Layer  : Kinesis → Managed Flink → DynamoDB/OpenSearch(realtime view)
Serving Layer: Athena/Redshift + realtime view merged for responses
```

> 💡 **Related theory**: Lambda Architecture proposed by Nathan Marz (Storm founder) ~2011. Core insight: "Batch layer corrects all mistakes (human fault-tolerance)." Even with realtime bugs, preserving raw data and full batch reprocessing eventually converges to truth. Immutable master dataset + recalculation is the safety net.

> ⚠️ **Pitfall**: Lambda's biggest cost is **implementing same logic twice** — once for batch (Spark), once for realtime (Flink). If they diverge subtly, debugging becomes hell. The alternative eliminating duplication is **Kappa Architecture**.

## Kappa Architecture: Simplify to Single Stream

```
[Raw Data] ──→ [Stream(Kinesis/Kafka)] ──→ [Stream Processor(Flink)] ──→ [Serving]
                       │
                  (on reprocess: reset offset to start, replay)
```

Kappa says "everything is a stream. Batch is just a bounded stream." Single logic means simpler maintenance. But full reprocessing requires data retained long enough in stream (Kinesis max 365d, Kafka unlimited possible). Beyond retention, you need separate storage anyway.

| Aspect | Lambda | Kappa |
|--------|--------|-------|
| Paths | Batch + stream dual | Stream single |
| Logic duplication | Yes (implement twice) | No |
| Reprocess | Batch recalculate | Stream replay |
| Simplicity | Low | High |
| Best for | Heavy batch + realtime | Realtime-first, simplify |

## Event-Driven Ingestion: Three Tools for Loose Coupling

Another axis: **lowering coupling between components**. Direct producer-to-consumer calls (tight coupling) mean consumer failure blocks producer. **Messaging layer** decouples both (loose coupling). AWS's three tools — SQS, SNS, EventBridge — differ in role.

| Service | Model | Core Trait |
|--------|-------|-----------|
| SQS | Queue (1:1, point-to-point) | One message, one consumer; buffering·retries |
| SNS | Pub/Sub (1:N, fan-out) | One message, many subscribers simultaneously |
| EventBridge | Event Bus (routing) | Content-based rules route events selectively |

```
SQS  : Producer → [Queue] → Consumer          (buffer + load leveling)
SNS  : Producer → [Topic] → Subscribers A,B,C (simultaneous fan-out)
EventBridge: Multiple sources → [Bus] → rule matching → multiple targets (schema-aware routing)
```

Three tools complement each other. Most famous pattern: **SNS → SQS fan-out**.

```
                    ┌─→ [SQS Queue A] → Payment Lambda
[Order SNS Topic] ──→ ├─→ [SQS Queue B] → Inventory Lambda
                    └─→ [SQS Queue C] → Analytics Lambda
```

One order event published to SNS replicates to three SQS queues. Each consumer independently ingests from its queue; if one consumer slows (or dies), others and SNS publishing unaffected. SNS fan-out + SQS buffering/retries (+DLQ) combined.

> 🔍 **Going deeper**: Why add SQS to SNS instead of SNS alone? SNS pushes immediately; consumer downtime causes message loss after limited retries. SQS in between safely buffers messages for consumer recovery. SNS handles "simultaneous distribution," SQS handles "durable buffering."

## EventBridge: Content-Based Routing and Schema

EventBridge is smarter than SNS routing. It inspects *event content* and routes only matching rules to targets.

```json
// EventBridge Rule: route only orders with amount >1000 to fraud-check
{
  "source": ["myapp.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": {
    "amount": [{ "numeric": [">", 1000] }]
  }
}
```

Pattern matching means consumers get "relevant events" only. AWS service events (S3 object creation, EC2 state change) flow through EventBridge, so "file arrives in S3 → start Glue Job" event-driven pipelines often use it. **Schema Registry** registers/discovers event structures; **Pipes** directly connect source (e.g., SQS, DynamoDB Stream) and target with transformation/filter.

| Decision | Best Service |
|----------|--------------|
| Simple buffering/load leveling, 1:1 | SQS |
| Broadcast one message to many, low-latency fan-out | SNS (or SNS→SQS) |
| Content-based routing, AWS events, schema | EventBridge |

> 🎯 **Scenario**: E-commerce "order created" triggers payment, inventory, email, and analytics simultaneously. Setup: (1) Order service publishes `OrderPlaced` to EventBridge → (2) Rules route to payment/inventory (SQS queues, durable), email (SNS, immediate), analytics (Firehose→S3) → (3) Each SQS consumer independently processes, failures to DLQ. Components unaware of each other, loose coupling is key.

> 💡 **Related theory**: Event-Driven Architecture (EDA) core value is **temporal and spatial decoupling**. Producer doesn't know consumers or if they're alive (spatial). Consumer downtime doesn't block — messages buffer, process later (temporal). This "bulkhead" prevents part of system failure spreading system-wide.

## Summary: Arranging Pieces into Shape

Two key points: Processing-wise, Lambda catches accuracy and latency in dual paths but pays logic duplication cost; Kappa simplifies to stream replay but depends on retention. Connection-wise, combine SQS (buffering, 1:1), SNS (fan-out, 1:N), EventBridge (content routing) at right places for loose coupling. SNS→SQS fan-out and EventBridge routing are exam/production staples. Tomorrow: Week 3 comprehensive review.

---

## 📝 Practice Problems

**Problem 1.** Supply both "recent as fast approximation" and "all data accurate" to same query. Which architecture?

A) Lambda Architecture  
B) Kappa Architecture  
C) Single SQS queue  
D) Single RDS instance  

**Answer: A**  
Explanation: Lambda runs Speed Layer (realtime approximation) and Batch Layer (full accurate recompute) in parallel, merging at Serving Layer. "Recent fast, history accurate" both covered. Kappa removes batch, simplifying to stream but trading off full-history reprocess capability.

---

**Problem 2.** Lambda Architecture: cost of implementing same aggregation logic twice (Spark + Flink) becomes unmanageable. Alternative eliminating duplication and reprocess method?

A) Lambda, batch rerun  
B) 3-tier, cache invalidate  
C) Kappa, stream replay from beginning  
D) Microservices, service restart  

**Answer: C**  
Explanation: Kappa removes batch layer, unifying to stream processing with single logic. Full reprocess via stream offset reset and replay. Trade-off: needs long retention, or separate storage for older data.

---

**Problem 3.** Single "order created" event must reach payment, inventory, analytics simultaneously; each must survive temporary downtime without message loss. Best pattern?

A) One SQS queue, three consumers  
B) EventBridge without Lambda chaining  
C) Direct synchronous consumer calls  
D) SNS topic → three SQS queues fan-out, each consumer ingests own queue  

**Answer: D**  
Explanation: SNS→SQS is standard. SNS fans to three queues (1:N), each SQS buffers durably (survives downtime), each consumer independent. Single SQS queue limits to one consumer per message (no fan-out).

---

**Problem 4.** "New S3 object → trigger specific Glue Job" and route by object content (prefix, size) to different targets. Best service?

A) SQS Standard queue  
B) Amazon EventBridge (content-based rules)  
C) Kinesis Data Firehose  
D) DynamoDB Streams  

**Answer: B**  
Explanation: EventBridge receives S3 events, matches patterns (content-based rules), routes selectively. SQS is simple queue, Firehose for delivery, DynamoDB Streams for table changes.

---

**Problem 5.** Why add SQS to SNS instead of SNS alone in fan-out?

A) Consumer downtime → messages buffer in SQS, reprocess after recovery  
B) SNS more expensive  
C) SQS auto-encrypts  
D) SNS doesn't support JSON  

**Answer: A**  
Explanation: SNS pushes immediately, consumer downtime causes loss. SQS in between buffers safely, enabling recovery. SNS="broadcast," SQS="durable buffer" complementary roles.

---
