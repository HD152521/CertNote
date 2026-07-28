# Day 5 - Week 8 Comprehensive — 12 Serverless & Event Architecture Scenarios

Week 8 examined how serverless and event-driven architecture collaborate. Lambda (cold start, concurrency, VPC ENI), Step Functions (state machine, Saga, Distributed Map), EventBridge (Bus, Pipes, Scheduler), AppSync (GraphQL + Subscription), SQS/SNS/Kinesis/MSK (messaging, streaming) — six domains appear independent but production nearly always combines two or three. That's exactly what SAP-C02 exams target. "Lambda alone isn't enough," "Step Functions alone isn't enough" — the ability to identify keyword combinations and judge which tool combination fits best matters.

Today consolidates week 8 into 12 comprehensive scenarios. Each scenario asks not single tools but complex patterns, and explanations clarify why answers are correct and alternatives wrong using SAP exam decision criteria. Re-reading these scenarios before the exam redraws the entire domain's decision tree in your mind.

## Week 8 Core Summary

### Lambda (Day 1)
- **Firecracker micro VMs**, warmed in **Slot pool**, cold start is 4 stages: download/runtime/init/JIT
- **3 concurrency types**: Account limit (1,000) / Reserved (isolation+ceiling) / Provisioned (warm, cost)
- **SnapStart** (CRaC-based): Java/Python/.NET, **free**, watch init uniqueness
- **Hyperplane ENI** (2019~): VPC integration shares ENI, **RDS Proxy** solves connection surge
- **Async retry** 2x + **Destinations** (SNS/SQS/EB/Lambda)
- **Function URL** (bypass API GW), **Container Image 10GB** + lazy loading, **Graviton2 ARM 20%↓**
- **Burst Concurrency** limit (us-east-1=3,000) → Predictable spikes use PC + Auto Scaling

### Step Functions (Day 2)
- Distributed persistent state machine, **Saga** = Catch + separate compensate branch
- **Standard** (1yr, per-transition) vs **Express** (5min, per-invocation+time) — split by frequency/duration
- **7 State types** + **Distributed Map** (10K parallel + S3 ItemReader)
- Integration 3 patterns: Request-Response / **.sync** (wait for job) / **.waitForTaskToken** (external callback)
- **Retry + Catch**: exponential backoff + JitterStrategy (2023)
- Visual Workflow Studio + auto IAM generation

### EventBridge (Day 3)
- **3 Bus types**: Default (AWS) / Custom (domain) / Partner (SaaS)
- **Rule = Pattern + max 5 Targets**, JSON deep-field matching + **API Destination** external HTTPS
- **Pipes**: SQS/Kinesis/DDB Stream/MQ/MSK → Filter → Enrich → Target, code-free
- **Scheduler**: 1M+ schedules, time zone, flexible window, 200+ direct API calls
- **Schema Registry** + **Archive/Replay** — evolution management + time travel
- **SNS vs EventBridge**: simple fan-out, high throughput vs rich filtering, diverse targets

### AppSync + Messaging (Day 4)
- **AppSync GraphQL**: schema-first + direct resolver (DDB without Lambda) + **Subscription** (WebSocket) + 5 auth modes
- **SQS Standard** (unlimited TPS) vs **FIFO** (300 TPS, order+dedup 5min) + High Throughput FIFO
- **Visibility Timeout**, **Long Polling**, **DLQ + maxReceiveCount**
- **SNS Fan-out + Message Filtering** + **FIFO Topic** (2020)
- **Kinesis Data Streams**: replay + multi-consumer, **Shard + Partition Key**, **EFO**
- **Firehose** (60–900s buffer + Lambda transform), **MSK** (Kafka portability)
- **Lambda ESM**: BatchSize, **ReportBatchItemFailures** partial batch

## Decision Tree — Scenario Keywords → Tool Mapping

```
"Cold start + zero cost"                    → SnapStart (Java/Python/.NET)
"Cold start + predictable traffic"          → Provisioned Concurrency + Auto Scaling
"Lambda + DB connection too many"           → RDS Proxy
"One function impacting others"             → Reserved Concurrency
"Java/Python Lambda 20%↓ cost"              → Graviton2 ARM switch
"ML model 1GB+ Lambda"                      → Container Image (10GB limit)

"Long-term workflow + compensate"           → Step Functions Standard + Catch
"High frequency, short workflow"            → Step Functions Express
"Human approval / external callback"        → .waitForTaskToken
"Wait for ECS/EMR/Glue job complete"       → .sync
"1M S3 objects in parallel"                 → Distributed Map + Express child

"1M user schedules"                         → EventBridge Scheduler
"SaaS partner event receive"                → EventBridge Partner Bus
"Queue → workflow, code-free"               → EventBridge Pipes
"Event replay, reprocess"                   → EventBridge Archive + Replay
"Rich filter + diverse targets"             → EventBridge Custom Bus + Rule

"GraphQL + real-time + mobile + auth"       → AppSync + Cognito
"Order + dedup payment queue"               → SQS FIFO
"Simple fan-out + very high throughput"     → SNS Topic + SQS subscription
"Replay + multi-consumer"                   → Kinesis Data Streams + EFO
"Auto-save to S3/Redshift/OpenSearch"       → Kinesis Firehose
"Kafka standard + portability"              → MSK
"Isolate failed after 5 retries"            → DLQ + maxReceiveCount
"Batch partial failure retry only"          → Lambda ESM ReportBatchItemFailures
```

## SAP Exam Common Traps Summary

1. **Task Role vs Task Execution Role** (ECS/Fargate) — App permissions in Task Role, infra (ECR Pull, Logs) in Execution Role
2. **EventBridge DLQ vs Lambda Destinations** — EB DLQ for invoke failure, Lambda business logic failure uses Lambda Destinations
3. **SQS FIFO "exactly-once"** — Precisely: idempotency within 5-min dedup window; application-level idempotency still recommended
4. **Standard vs Express cost** — Express isn't always cheaper. Rarely-run long workflows cost less with Standard
5. **Reserved Concurrency** — Both isolation AND ceiling
6. **SNS doesn't persist messages** — Retention needed? → SQS subscription or EventBridge Archive
7. **Pipes vs Step Functions** — 1:1 routing is Pipes, complex workflow is Step Functions, often Pipes→SF combo
8. **SnapStart uniqueness trap** — Random numbers, UUIDs, DB connection state created at init get copied to all restored instances

---

## 📝 Scenario 12 Questions

---

**Question 1.** Global OTT service receives 50,000 viewer events/sec: (1) instant real-time recommendation model (2) 7-day raw event S3 preservation for ML retraining (3) analytics hourly aggregation for BI dashboard. Three downstream must process simultaneously without latency impact. Best architecture?

A) SNS Topic + 3 SQS subscriptions, each queue 14-day retention + DLQ, consumer polling
B) Kinesis Data Streams + Enhanced Fan-Out (3 consumers) + Firehose
C) EventBridge Bus + 3 Rules, each with input transformer + 7-day Archive/Replay
D) MSK + 3 Kafka Consumer Groups, EBS gp3 7-day retention.ms

**Answer: B**
Explanation: The key phrases are "reprocessing + multiple consumers + 7-day retention." SQS (A) delivers each message once, so reprocessing is impossible, and SNS retains nothing. EventBridge (C) is built for rich filtering, not 50,000 TPS streaming with 7-day retention. MSK (D) would work but carries a heavier operational burden, and for an AWS-centric workload Kinesis has the managed advantage. Kinesis Data Streams + EFO gives each consumer a dedicated 2 MB/s per shard, supports 24 h to 365 d retention, and Firehose persists to S3 automatically. Further study: this is the standard pattern in advertising, media, and IoT.

---

**Question 2.** Java Spring Boot Lambda cold start averages 4 sec. 1M daily calls, 5% cold ratio. Ops must reduce to <1sec without extra cost. Init has DB connection pool + UUID-based instance ID. Best combo?

A) Provisioned Concurrency = 500 via Auto Scaling schedule constant warm
B) Enable SnapStart only; leave UUID and DB connection init code as-is
C) SnapStart + move UUID generation and DB connection to `Crac.Resource.afterRestore`
D) Increase memory to 10GB for CPU-proportional JIT/class loading speedup

**Answer: C**
Explanation: SnapStart is free and cuts Java init time to nearly zero. But SnapStart restores the exact memory and disk state captured at init, so uniqueness state such as a UUID and the TCP state of a DB connection are copied into every restored instance, causing collisions. Re-initializing in `Crac.Resource.afterRestore` is the safe approach. B (SnapStart alone) risks instance-ID collisions and DB errors. A (PC) incurs cost (billed hourly). D (memory) has almost no bearing on cold start and raises cost. Trap: the option claiming "just enable SnapStart and everything is solved" is the trap — re-initializing uniqueness state is mandatory. Note: in 2024 SnapStart expanded to Python and .NET.

---

**Question 3.** Payment → inventory deduct → shipping schedule workflow averages 30sec to days (external carrier response wait). Shipping failure requires payment refund + inventory restore. External carrier responds async via webhook. Best architecture?

A) Step Functions Express + Catch (compensate) + API GW polling for carrier webhook
B) Step Functions Standard + Catch (compensate) + .waitForTaskToken (webhook)
C) Lambda chain + try/catch + DynamoDB state per step + call refund/restore compensate
D) EventBridge Pipes + Lambda enrichment routing payment→inventory→shipping sequentially

**Answer: B**
Explanation: A workflow that can run for days exceeds the Express 5-minute limit, so Standard is required. Saga compensation branches from each Task’s Catch into a separate compensating state. Waiting on an external webhook is exactly the `.waitForTaskToken` pattern (issue a token → notify via SNS → the webhook receiver Lambda calls `SendTaskSuccess`). A exceeds the 5-minute limit. C runs into the Lambda 15-minute timeout, scatters compensation logic across code, and lacks visibility. D is 1:1 routing, not a complex workflow. Trap: "long-running + compensation + external callback" means the three-part pattern Standard + Catch + waitForTaskToken.

---

**Question 4.** 1M-user SaaS sends daily summary emails at each user's preferred time (timezone + time). User setting changes apply immediately. Best architecture?

A) 1M EventBridge Rules with per-user cron expressions + SES target
B) 1M EventBridge Scheduler schedules + SES target
C) Lambda + DynamoDB schedule table + 1-min cron poller scanning send targets
D) 1M Step Functions Wait State workflows, each delay by user timezone offset

**Answer: B**
Explanation: Scheduler supports 1M+ schedules per account and offers time zones, cron, and a flexible time window. It invokes SES directly as a target (200+ AWS APIs supported). A hits the per-account Rule limit (thousands). C means operating your own scheduling infrastructure (storage, consistency, scaling). D leaves 1M workflows permanently in a wait state, consuming compute resources and exploding cost. Trap: "a different time per user" = Scheduler. Note: the flexible time window (±15 min) spreads out simultaneous load.

---

**Question 5.** Filter DynamoDB Streams events (change events), routing only matching patterns to Step Functions workflow. Want to avoid Lambda code and operations. Best architecture?

A) DDB Streams → Lambda (pattern filter code) → Step Functions StartExecution
B) DDB Streams → EventBridge Pipes (Filter) → Step Functions
C) DDB Streams → Kinesis Data Streams → Lambda consumer → Step Functions
D) DDB Streams → EventBridge Pipes → SQS → Lambda poller → Step Functions

**Answer: B**
Explanation: Pipes composes exactly this pattern (Source = DDB Stream + Filter + Target = Step Functions) as a managed, code-free configuration. A adds Lambda operational burden (code deployment, error handling, logging, cost). C and D insert extra infrastructure and raise complexity. Trap: when "without code" is the keyword, the answer is Pipes. Further study: the Pipes enrichment stage can transform through Lambda, API Destination, or API Gateway in addition to targeting Step Functions, and both input and output use EventBridge pattern matching.

---

**Question 6.** E-commerce fans out OrderPlaced event to 5 downstream (analytics, shipping, CRM, alerts, audit). Throughput 5,000/sec. Each downstream processes at own pace; failed messages permanently isolated for analysis. Best architecture?

A) EventBridge Custom Bus + 5 Rules (same pattern match) + DLQ per target
B) SNS Topic + 5 SQS subscriptions + each SQS's DLQ
C) Kinesis Data Streams + 5 Consumers (EFO) + retry on consumer failure
D) Lambda fan-out function sync-calls 5 downstream, failures to SQS

**Answer: B**
Explanation: Simple fan-out with very high throughput is precisely SNS’s sweet spot. SQS subscriptions let each downstream poll at its own pace, and DLQs permanently isolate failures. A (EventBridge) would also work, but five rules matching the same pattern cost more per event and have lower throughput limits. C is for reprocessing and time-series analysis, not optimal fan-out. D is tightly coupled. Trap: "simple fan-out + high throughput" means SNS; "rich filtering + diverse targets" means EventBridge. Note: set each SQS visibility timeout to processing time × 1.5–2 and maxReceiveCount to 5–10.

---

**Question 7.** Lambda function connects to RDS PostgreSQL inside VPC. Concurrent executions spike to 1,500, getting "FATAL: too many connections". RDS max_connections=200. Best fix?

A) Upgrade RDS instance class to max_connections=2,000 + Multi-AZ read distribution
B) Lambda Reserved Concurrency = 200 to cap DB connections ≤ max_connections
C) Introduce RDS Proxy; Lambda connects to Proxy
D) Remove Lambda VPC integration, expose PostgreSQL on public endpoint

**Answer: C**
Explanation: RDS Proxy provides connection multiplexing (pooling), so 1,500 Lambdas collapse onto roughly 50 RDS connections. It also adds IAM authentication and connection holding during failover. A is not a fundamental fix relative to the added cost and DB load (Lambda concurrency can grow further still). B sacrifices availability. D makes RDS unreachable. Trap: "not enough connections" + Lambda + RDS almost always means RDS Proxy — a perennial SAP exam item. Note: supports Aurora and RDS MySQL/PostgreSQL/MariaDB/SQL Server, with automatic Secrets Manager integration.

---

**Question 8.** Mobile chat app uses GraphQL backend, receives message real-time push. Cognito user auth, DynamoDB storage, offline sync needed. Best backend?

A) API Gateway REST + Lambda + WebSocket API + DynamoDB message/connection ID management
B) AppSync GraphQL + Cognito User Pool + DynamoDB direct resolver + Amplify DataStore
C) ALB + ECS Fargate Service + Socket.io + Cognito JWT verify middleware
D) IoT Core MQTT + device shadow for offline message sync

**Answer: B**
Explanation: AppSync delivers managed GraphQL + WebSocket subscriptions + Cognito integration + DynamoDB direct resolvers (no Lambda) + Amplify DataStore offline sync in a single service. A means operating two separate APIs (REST and WebSocket) and stitching them together on the client. C adds infrastructure operations plus Cognito integration code. D (IoT Core) is for device pub/sub, not user chat. Trap: the keyword combination "GraphQL + real-time + mobile + Cognito" almost always means AppSync. Note: calling DynamoDB through a direct resolver removes Lambda cold starts and cuts cost.

---

**Question 9.** 1M CSV files in S3, each processed by Lambda. Per-file time 5–30 sec. Results aggregate to different S3 bucket. Best pattern?

A) Map state (inline, concurrent 40) iterates S3 object list, invokes Lambda
B) Step Functions Distributed Map + Express child + ItemReader/ResultWriter
C) AWS Batch submit 1M tasks + Fargate Spot + array job parallel
D) Orchestrator Lambda chunks 1M files, recursively calls child Lambdas

**Answer: B**
Explanation: Distributed Map runs 10,000 child executions in parallel, sources S3 listings/CSV/JSONL directly through ItemReader, and aggregates results to S3 automatically with ResultWriter. Express child executions optimize cost and speed. A is capped at 40 concurrent iterations, far too slow for 1M items. C (AWS Batch) pays a container boot cost per task that is far larger than Lambda for 5–30 second jobs, plus queueing and scheduling overhead. D hits the Lambda 15-minute timeout and payload limits, with poor visibility into recursive invocations. Trap: "massive parallelism + S3 source + aggregated results" almost always means Distributed Map. The pattern where children invoke ECS Fargate tasks (.sync) is also common.

---

**Question 10.** Black Friday sale starts; Lambda concurrent execution spikes 0→5,000 in 5 minutes. us-east-1 burst limit 3,000. Must handle without throttle; exact start time known. Best architecture?

A) Reserved Concurrency = 5,000 to isolate concurrency from other functions
B) Application Auto Scaling + Provisioned Concurrency to 5,000 30 min before sale
C) Increase function memory to 10GB to shrink needed concurrency via higher per-instance throughput
D) Switch to Function URL to bypass API Gateway overhead, reduce latency

**Answer: B**
Explanation: The Burst Concurrency limit (3,000) is an initial-ramp constraint separate from the function concurrency limit. Getting from 0 to 5,000 within 5 minutes requires pre-warming with Provisioned Concurrency. Adjusting PC on an Application Auto Scaling schedule (for example, every Friday at 19:30) reduces operational burden. A (Reserved) is a ceiling, not pre-warming, so it still hits the burst limit. C only slightly reduces cold start. D is irrelevant. Trap: "predictable traffic spike" almost always means PC + Auto Scaling. PC is billed hourly, but avoiding throttling and getting consistent latency is worth more. Note: drop PC to 10 after the sale ends to save cost.

---

**Question 11.** Global SaaS receives Stripe webhook + Shopify webhook simultaneously, routes amount > $1,000 to Step Functions workflow, rest to Lambda. Avoid webhook receiver operations. Best architecture?

A) API Gateway + Lambda webhook receiver validates signatures, retries, branches by amount
B) EventBridge Partner Bus (Stripe + Shopify) + Rule (amount > 1000) + SF/Lambda targets
C) SNS HTTPS subscription receives webhook, message filter policy branches by amount
D) ECS Fargate webhook proxy validates signatures, branches to SQS

**Answer: B**
Explanation: A Partner Bus is a managed channel in which AWS integrates directly with the SaaS partner, so you receive events with no webhook infrastructure of your own. EventBridge Rule’s rich JSON field matching handles conditional branching such as amount > 1000. A carries webhook receiver operational burden (security, authentication, retries, scaling). C fails because SNS is an outbound publishing service and cannot directly receive a SaaS’s inbound HTTPS webhook, and its message filtering is attribute-based, unsuited to matching arbitrary SaaS JSON bodies. D means running your own infrastructure. Trap: "SaaS partner events" almost always means Partner Bus. Note: major SaaS vendors including Stripe, Shopify, Datadog, Auth0, and MongoDB Atlas are registered and can be enabled from the console in one step.

---

**Question 12.** Fintech receives payment transactions in SQS, Lambda processes. Batch size=10; one failure triggers full batch retry (default), but idempotent-broken downstream causes duplicates. Retry only failed messages?

A) Set BatchSize=1
B) Shorten Visibility Timeout
C) Enable ReportBatchItemFailures in Lambda ESM + function returns failed message IDs
D) Send to DLQ immediately

**Answer: C**
Explanation: ReportBatchItemFailures is the Lambda ESM partial batch response feature. When the function responds with `batchItemFailures: [{itemIdentifier: "msg-id-X"}, ...]`, Lambda retries only the failed messages and acks the rest (deleting them from the queue). A (BatchSize=1) is very inefficient and raises cost. B is irrelevant. D is isolation after maxReceiveCount is exceeded. Trap: "batch processing + partial failure + prevent duplicate processing" means ReportBatchItemFailures. Note: Kinesis and DDB Streams ESM have the same feature; for SQS the response format differs slightly, so check the docs.

---

## 📌 Week 8 At a Glance

```
[Client]
   │ GraphQL
   ▼
[AppSync] ──Subscription(WebSocket)── Real-time mobile/web
   │ Mutation, direct resolver
   ▼
[DynamoDB] ──Streams──► [EventBridge Pipes]
                          │ Filter
                          ▼
                  [EventBridge Custom Bus]
                          │ Rule
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  [Step Functions]    [SNS Topic]     [Kinesis Data Streams]
   ├─ Standard (1yr)   │ Fan-out       │ Retention 24h~365d
   ├─ Express (5min)   │ Filtering     │ EFO multi-consumer
   ├─ Saga(Catch)      └─ 5 SQS        │
   ├─ Distributed Map                   │
   ├─ .sync (job wait)                  ▼
   └─ .waitForTaskToken (external callback) [Firehose] ──► S3/Redshift

[Lambda]
 ├─ Concurrency 3 types (account/Reserved/Provisioned)
 ├─ SnapStart (Java/Python/.NET, free)
 ├─ Hyperplane ENI (VPC), RDS Proxy connection
 ├─ Destinations (OnSuccess/OnFailure → SNS/SQS/EB/Lambda)
 ├─ Container Image 10GB (block-level lazy loading)
 └─ Graviton2 ARM 20%↓

[EventBridge Scheduler] ──► 1M+ user schedules
[EventBridge Partner Bus] ──► Stripe/Shopify/Datadog direct
[EventBridge Archive + Replay] ──► Event reprocessing
[Schema Registry] ──► Evolution management + code binding
```

## Pre-Exam Checklist

- [ ] Can explain Lambda cold start 4 stages (download/runtime/init/JIT)
- [ ] Understand SnapStart mechanics (CRaC snapshot + restore) and uniqueness trap
- [ ] Explain Reserved vs Provisioned vs account limit in one sentence
- [ ] Know how RDS Proxy solves connection surge
- [ ] Standard vs Express pricing model and split criteria
- [ ] When to use .sync vs .waitForTaskToken
- [ ] Distributed Map ItemReader/ResultWriter + Express child
- [ ] EventBridge 3 Bus types + Rule + 5 Target limit
- [ ] Pipes 4 stages: Source/Filter/Enrich/Target
- [ ] Scheduler vs CloudWatch Rule cron limits
- [ ] SNS vs EventBridge decision (simple fan-out vs rich filter)
- [ ] SQS Standard vs FIFO + High Throughput FIFO
- [ ] Visibility Timeout, Long Polling, DLQ + maxReceiveCount
- [ ] Kinesis Shard + Partition Key + EFO
- [ ] Lambda ESM ReportBatchItemFailures partial batch

Next week (Week 9): **Data Architecture** — Data Lake (S3 + Lake Formation + Glue), Redshift (RA3 + AQUA + Spectrum), EMR (Spark/Hive on EC2/EKS), Athena (Iceberg + federated query), MSK Connect, Lakeformation permission model, Migration to Data Lakehouse.
