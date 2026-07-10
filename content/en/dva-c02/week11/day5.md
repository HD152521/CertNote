# Day 55 - Week 11 Review + Practice Questions (Messaging)

📅 Date: July 30, 2026 (Thursday)  
🎯 Topic: Comprehensive Messaging Services Review  
⏱️ Study Time: Approximately 90 minutes

---

## 🎯 Learning Objectives

- Consolidate key concepts of SQS, SNS, Kinesis, Step Functions
- Practice exam scenarios with messaging services

---

## 📖 Week 11 Key Summary

### Messaging Service Selection Guide
```
Order guarantee + exactly-once: SQS FIFO
High throughput + no order needed: SQS Standard
One message to multiple consumers: SNS (fanout)
Real-time data streaming: Kinesis Data Streams
ETL → S3/Redshift: Kinesis Firehose
Complex workflows: Step Functions
GraphQL + Real-time: AppSync
```

### Core Numbers to Memorize
```
SQS message max size: 256KB
SQS max retention: 14 days
SQS FIFO throughput: 300 messages/sec (3000 with batching)
SQS VisibilityTimeout default: 30 seconds
Kinesis shard write: 1MB/s or 1000 RPS
Kinesis shard read: 2MB/s
Kinesis default retention: 24 hours (max 365 days)
Firehose minimum latency: 1 minute
```

---

## Architecture Diagram

```
Messaging Service Selection Architecture
================================

[Event Source]
     |
     +-- Order/duplicate crucial? → SQS FIFO
     |
     +-- High throughput? → SQS Standard
     |
     +-- Multiple consumers simultaneously? → SNS → multiple SQS
     |
     +-- Real-time streaming? → Kinesis Data Streams
     |
     +-- ETL pipeline? → Kinesis Firehose → S3
     |
     +-- Complex workflow? → Step Functions
     |
     +-- GraphQL API? → AppSync
```

---

## 🧠 Week 11 Exam Traps & Acronyms

### Confusing Comparisons

| A | B | Key Difference |
|---|---|------|
| SQS Standard | SQS FIFO | Unlimited·no order vs 300/s·order·dedup |
| SQS | SNS | Pull·single vs Push·multiple |
| SNS | EventBridge | Pub/Sub vs event filter·routing |
| Kinesis Data Streams | SQS | Multi-consumer·replay vs single·consume-and-gone |
| Kinesis | Firehose | Direct processing vs auto S3·1min+ |
| Kinesis Provisioned | On-Demand | Direct shard vs auto 200MB/s |
| Classic Fan-Out | Enhanced Fan-Out | Shared 2MB/s vs per-consumer 2MB/s |
| KPL | KCL | Producer·Java vs Consumer·checkpoint |
| Step Functions Standard | Express | 1year·exactly-once·cheap vs 5min·at-least-once·fast |
| Map | Distributed Map | Parallel vs large-scale (thousands) |
| .sync | .waitForTaskToken | Wait completion vs external callback |
| AppSync | API Gateway | GraphQL·multi-source vs REST·single |
| SQS Long Polling | Short Polling | 20sec wait vs immediate |
| Visibility Timeout | Message Retention | Hide during processing vs retain in queue |
| SNS DLQ | Lambda DLQ | SNS delivery failure vs Lambda async failure |

### Week 11 Exam Traps (18 points)

1. **SQS 256KB limit** — Exceed with Extended Client (S3)
2. **SQS retention 60 seconds~14 days, default 4 days**
3. **SQS visibility timeout default 30 sec, max 12 hours**
4. **SQS FIFO 300 msg/s (batching 3000)**, high-throughput 70000
5. **Long Polling = WaitTimeSeconds 1~20**
6. **DLQ same type only** (FIFO ↔ FIFO)
7. **SNS retention none** — Lost on delivery failure (set DLQ)
8. **SNS message body filtering requires option**
9. **SNS FIFO only subscribes SQS FIFO**
10. **Kinesis shard write 1 MB/s · 1000 RPS**, read 2 MB/s
11. **Enhanced Fan-Out = per-consumer dedicated 2 MB/s** (cost ↑)
12. **Kinesis retention 24 hours ~ 365 days** (Streams), Firehose no retention
13. **Firehose minimum 60 second latency**, not real-time
14. **Kinesis On-Demand 200 MB/s limit**
15. **Step Functions Standard max 1 year, Express 5 min**
16. **Distributed Map = large-scale S3 files·JSON array**
17. **.waitForTaskToken = external system response wait**
18. **AppSync = GraphQL + WebSocket (real-time subscription)**

### Week 11 Acronyms Summary

| Acronym | Full Name |
|--------|--------|
| **SQS** | Simple Queue Service |
| **SNS** | Simple Notification Service |
| **DLQ** | Dead Letter Queue |
| **KDS** | Kinesis Data Streams |
| **KDF** | Kinesis Data Firehose |
| **KCL** | Kinesis Client Library |
| **KPL** | Kinesis Producer Library |
| **KDA** | Kinesis Data Analytics |
| **EFO** | Enhanced Fan-Out |
| **FIFO** | First In First Out |
| **ESM** | Event Source Mapping |
| **MSK** | Managed Streaming for Apache Kafka |
| **Saga** | Distributed transaction compensation pattern |
| **APNs / FCM** | Apple/Google Push Services |
| **ETL** | Extract Transform Load |
| **TPS / RPS** | Transactions/Requests Per Second |

---

## 📝 Week 11 Comprehensive Practice Questions

**문제 1.** When processing payment transactions exactly once and in order?

A) SQS Standard queue  
B) SQS FIFO queue  
C) SNS  
D) Kinesis  

**정답: B** - FIFO queue guarantees order and exactly-once processing (deduplication).

---

**문제 2.** To analyze millions of user click events in real-time and store in S3?

A) SQS → Lambda → S3  
B) Kinesis Data Streams → analytics → Firehose → S3  
C) SNS → SQS → S3  
D) DynamoDB Streams → S3  

**정답: B** - Kinesis Data Streams optimized for high-volume streaming, Firehose easily delivers to S3.

---

**문제 3.** When one S3 upload event triggers 3 Lambda functions simultaneously?

A) Set S3 event directly to each Lambda  
B) S3 → SNS → 3 Lambda subscriptions  
C) S3 → SQS → Lambda  
D) S3 → EventBridge → 3 Lambda  

**정답: B or D** - SNS fanout or EventBridge can deliver single event to multiple Lambda simultaneously. Exam standard: B is the fanout pattern.

---

**문제 4.** To isolate messages that failed 3 times in SQS?

A) SQS filter policy  
B) DLQ setting (maxReceiveCount=3)  
C) Increase VisibilityTimeout  
D) Disable long polling  

**정답: B** - DLQ with maxReceiveCount=3 moves failed messages to DLQ.

---

**문제 5.** When orchestrating multiple Lambda in sequence with rollback on failure?

A) Lambda chain (Lambda directly invokes Lambda)  
B) Step Functions  
C) SQS workflow  
D) EventBridge rule chain  

**정답: B** - Step Functions manages workflow state and supports error handling, retry, compensation transactions.

---

**문제 6.** Most significant difference between Kinesis Data Streams and SQS?

A) Speed difference  
B) Kinesis allows multiple consumers to read simultaneously; data retained  
C) Cost difference  
D) Region restriction  

**정답: B** - Kinesis retains data so multiple consumers read independently; SQS message consumed and gone.

---

**문제 7.** For mobile app using GraphQL with real-time updates?

A) API Gateway REST API  
B) API Gateway WebSocket  
C) AWS AppSync  
D) Kinesis Firehose  

**정답: C** - AppSync provides fully managed GraphQL and real-time subscriptions (WebSocket).

---

**문제 8.** To deliver SNS messages with premium customer info only to specific SQS?

A) SQS message filter  
B) SNS filter policy  
C) Lambda intermediate processing  
D) IAM policy  

**정답: B** - SNS filter policy delivers messages to specific subscribers based on attributes.

---

**문제 9.** What is Lambda's recommended visibility timeout with Kinesis integration?

A) Same as Lambda timeout  
B) 2x Lambda timeout  
C) 6x Lambda timeout  
D) 12x Lambda timeout  

**정답: C** - For Kinesis, recommend 6x or more Lambda timeout to prevent duplicate processing.

---

**문제 10.** Standard Lambda execution time limit with Step Functions?

A) 5 minutes  
B) 15 minutes  
C) 1 hour  
D) Unlimited (via Step Functions)  

**정답: D** - Step Functions Standard can orchestrate up to 1 year; each Task (Lambda) still 15 min, but overall workflow unlimited.

---

**문제 11.** When Kinesis shard reaches write capacity (1MB/s)?

A) Automatic scaling  
B) Request ProvisionedThroughputExceededException error  
C) Increase shard count or use On-Demand  
D) Data loss  

**정답: C** - Kinesis Provisioned throws exception; must increase shards or switch to On-Demand mode.

---

**문제 12.** AppSync best data source for millisecond-latency DynamoDB query?

A) Lambda resolver  
B) Direct DynamoDB data source (AppSync native)  
C) RDS Proxy  
D) HTTP endpoint  

**정답: B** - AppSync native DynamoDB resolver is optimized for direct CRUD without Lambda overhead.

---

**문제 13.** SNS message lost on Lambda delivery failure?

A) Auto-move to SQS  
B) Retry then lost (set Lambda DLQ or Destinations)  
C) Auto-move to DLQ  
D) Email admin  

**정답: B** - SNS retries then loses message; must configure Lambda Destinations or SNS DLQ for Lambda.

---

**문제 14.** What determines partition into same Kinesis shard?

A) Consumer ID  
B) Partition Key  
C) Timestamp  
D) Random  

**정답: B** - Same partition key → same shard; allows ordering guarantees per partition.

---

**문제 15.** Step Functions Express vs Standard - when to choose Express?

A) Long-running workflows (days/months)  
B) Need exactly-once guarantee  
C) Short frequent event processing  
D) Human approval workflows  

**정답: C** - Express: short (5 min max), high throughput, at-least-once. Standard: long, exactly-once, cheap.

---

## 📌 Today's Summary

1. SQS: Standard (unlimited/unordered) vs FIFO (300/s, order/dedup)
2. SNS: Push, fanout, filter policy for selective delivery
3. Kinesis: Large-scale streaming, multiple consumers, shard-based
4. Firehose: Serverless ETL, 1-minute latency, S3/Redshift/OpenSearch
5. Step Functions: Workflow orchestration, retry, parallel execution
6. AppSync: GraphQL, real-time subscriptions, multi-source queries
