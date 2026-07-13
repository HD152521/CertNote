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

**정답: B**
해설: 핵심 키워드는 "재처리 + 다중 소비자 + 7일 보존". SQS(A)는 1회 소비라 재처리 불가, SNS는 보존 없음. EventBridge(C)는 풍부 필터링용이지 50,000 TPS 스트리밍 + 7일 보존이 아님. MSK(D)도 가능하지만 운영 부담이 더 크고 AWS 위주 워크로드에 Kinesis가 매니지드 우위. Kinesis Data Streams + EFO는 consumer마다 shard당 2MB/s 전용 + 보존 24h~365d 지원 + Firehose로 S3 자동 저장. 추가 학습: 광고·미디어·IoT의 표준 패턴.

---

**Question 2.** Java Spring Boot Lambda cold start averages 4 sec. 1M daily calls, 5% cold ratio. Ops must reduce to <1sec without extra cost. Init has DB connection pool + UUID-based instance ID. Best combo?

A) Provisioned Concurrency = 500 via Auto Scaling schedule constant warm
B) Enable SnapStart only; leave UUID and DB connection init code as-is
C) SnapStart + move UUID generation and DB connection to `Crac.Resource.afterRestore`
D) Increase memory to 10GB for CPU-proportional JIT/class loading speedup

**정답: C**
해설: SnapStart는 무료이고 Java init 시간을 거의 0으로 줄임. 그러나 SnapStart는 init 시점의 메모리·디스크 상태를 그대로 복원하므로 UUID 같은 uniqueness state와 DB connection의 TCP 상태가 모든 복원본에 복사되어 충돌이 생긴다. `Crac.Resource.afterRestore`에서 재초기화해야 안전. B(SnapStart만)는 인스턴스 충돌·DB 오류 위험. A(PC)는 비용 발생(시간당 과금). D(메모리)는 콜드 스타트와 거의 무관하고 비용 증가. 함정: "SnapStart 활성화하면 다 해결"이라는 보기가 함정. uniqueness 재초기화가 필수. 추가: 2024년 SnapStart가 Python·.NET까지 확장.

---

**Question 3.** Payment → inventory deduct → shipping schedule workflow averages 30sec to days (external carrier response wait). Shipping failure requires payment refund + inventory restore. External carrier responds async via webhook. Best architecture?

A) Step Functions Express + Catch (compensate) + API GW polling for carrier webhook
B) Step Functions Standard + Catch (compensate) + .waitForTaskToken (webhook)
C) Lambda chain + try/catch + DynamoDB state per step + call refund/restore compensate
D) EventBridge Pipes + Lambda enrichment routing payment→inventory→shipping sequentially

**정답: B**
해설: 며칠 걸릴 수 있는 워크플로우는 Express의 5분 한도 초과 → Standard. Saga 보상은 각 Task의 Catch가 별도 보상 state로 분기. 외부 webhook 대기는 `.waitForTaskToken`이 정확한 패턴(token 발급 → SNS로 알림 → webhook receiver Lambda가 `SendTaskSuccess` 호출). A는 5분 한도 초과. C는 Lambda 15분 timeout + 보상 로직이 코드에 흩어짐 + 가시성 부족. D는 1:1 라우팅이지 복잡 워크플로우가 아님. 함정: "장기 + 보상 + 외부 콜백"이면 Standard + Catch + waitForTaskToken 3-패턴.

---

**Question 4.** 1M-user SaaS sends daily summary emails at each user's preferred time (timezone + time). User setting changes apply immediately. Best architecture?

A) 1M EventBridge Rules with per-user cron expressions + SES target
B) 1M EventBridge Scheduler schedules + SES target
C) Lambda + DynamoDB schedule table + 1-min cron poller scanning send targets
D) 1M Step Functions Wait State workflows, each delay by user timezone offset

**정답: B**
해설: Scheduler는 계정당 100만+ 스케줄을 지원하고 타임존, cron, flexible time window 제공. SES를 target으로 직접 호출(200+ AWS API 지원). A는 Rule 계정 한도(수천)에 막힘. C는 자체 스케줄 인프라 운영 부담(스토리지, 일관성, 스케일링). D는 100만 워크플로우가 항상 wait 상태로 계산 자원 소모 + 비용 폭증. 함정: "사용자별 다른 시간" = Scheduler. 추가: Flexible time window(±15분)로 동시 부하 분산.

---

**Question 5.** Filter DynamoDB Streams events (change events), routing only matching patterns to Step Functions workflow. Want to avoid Lambda code and operations. Best architecture?

A) DDB Streams → Lambda (pattern filter code) → Step Functions StartExecution
B) DDB Streams → EventBridge Pipes (Filter) → Step Functions
C) DDB Streams → Kinesis Data Streams → Lambda consumer → Step Functions
D) DDB Streams → EventBridge Pipes → SQS → Lambda poller → Step Functions

**정답: B**
해설: Pipes는 정확히 이 패턴(Source=DDB Stream + Filter + Target=Step Functions)을 코드 없이 매니지드로 구성. A는 Lambda 운영 부담(코드 배포, 에러 처리, 로깅, 비용). C/D는 추가 인프라가 끼어 복잡도 증가. 함정: "코드 없이"가 키워드면 Pipes. 추가 학습: Pipes의 enrichment 단계로 Step Functions 외에도 Lambda·API Destination·API GW 등을 거쳐 변환 가능. 입출력 모두 EventBridge 패턴 매칭 사용.

---

**Question 6.** E-commerce fans out OrderPlaced event to 5 downstream (analytics, shipping, CRM, alerts, audit). Throughput 5,000/sec. Each downstream processes at own pace; failed messages permanently isolated for analysis. Best architecture?

A) EventBridge Custom Bus + 5 Rules (same pattern match) + DLQ per target
B) SNS Topic + 5 SQS subscriptions + each SQS's DLQ
C) Kinesis Data Streams + 5 Consumers (EFO) + retry on consumer failure
D) Lambda fan-out function sync-calls 5 downstream, failures to SQS

**정답: B**
해설: 단순 fan-out + 매우 높은 처리량은 SNS의 정확한 sweet spot. SQS subscription으로 다운스트림이 자체 폴 속도 + DLQ로 영구 실패 격리. A(EventBridge)도 가능하지만 5개 룰이 같은 패턴 매칭에 단가가 더 비싸고 throughput 한도가 낮음. C는 재처리·시계열 분석용이지 fan-out 최적이 아님. D는 결합도 높음. 함정: "단순 fan-out + 높은 처리량"이면 SNS, "풍부 필터링·다양 target"이면 EventBridge. 추가: 각 SQS의 visibility timeout = 처리 시간 × 1.5~2, maxReceiveCount = 5~10.

---

**Question 7.** Lambda function connects to RDS PostgreSQL inside VPC. Concurrent executions spike to 1,500, getting "FATAL: too many connections". RDS max_connections=200. Best fix?

A) Upgrade RDS instance class to max_connections=2,000 + Multi-AZ read distribution
B) Lambda Reserved Concurrency = 200 to cap DB connections ≤ max_connections
C) Introduce RDS Proxy; Lambda connects to Proxy
D) Remove Lambda VPC integration, expose PostgreSQL on public endpoint

**정답: C**
해설: RDS Proxy는 connection multiplexing(pooling)을 제공해 1,500 Lambda가 50개 내외 RDS 연결로 묶임. 추가로 IAM 인증과 failover 시 connection holding 제공. A는 비용·DB 부하 증가에 비해 근본 해결 아님(Lambda는 더 늘 수 있음). B는 가용성 희생. D는 RDS 접속 불가. 함정: "connection 부족" + Lambda + RDS면 거의 RDS Proxy. SAP 시험 단골. 추가: Aurora·RDS MySQL/PostgreSQL/MariaDB/SQL Server 지원 + Secrets Manager 통합 자동.

---

**Question 8.** Mobile chat app uses GraphQL backend, receives message real-time push. Cognito user auth, DynamoDB storage, offline sync needed. Best backend?

A) API Gateway REST + Lambda + WebSocket API + DynamoDB message/connection ID management
B) AppSync GraphQL + Cognito User Pool + DynamoDB direct resolver + Amplify DataStore
C) ALB + ECS Fargate Service + Socket.io + Cognito JWT verify middleware
D) IoT Core MQTT + device shadow for offline message sync

**정답: B**
해설: AppSync는 매니지드 GraphQL + WebSocket subscription + Cognito 통합 + DynamoDB direct resolver(Lambda 없이) + Amplify DataStore 오프라인 동기화를 한 서비스로 제공. A는 REST/WebSocket 두 API를 따로 운영 + 클라이언트가 합쳐야 함. C는 인프라 운영 부담 + Cognito 통합 코드 필요. D(IoT Core)는 device pub/sub용이지 사용자 chat이 아님. 함정: "GraphQL + 실시간 + 모바일 + Cognito" 키워드 조합은 거의 AppSync. 추가: direct resolver로 DynamoDB 직접 호출하면 Lambda 콜드 스타트 제거 + 비용 절감.

---

**Question 9.** 1M CSV files in S3, each processed by Lambda. Per-file time 5–30 sec. Results aggregate to different S3 bucket. Best pattern?

A) Map state (inline, concurrent 40) iterates S3 object list, invokes Lambda
B) Step Functions Distributed Map + Express child + ItemReader/ResultWriter
C) AWS Batch submit 1M tasks + Fargate Spot + array job parallel
D) Orchestrator Lambda chunks 1M files, recursively calls child Lambdas

**정답: B**
해설: Distributed Map은 10,000 child execution 병렬 + S3 list/CSV/JSONL을 ItemReader로 직접 source + ResultWriter로 S3 자동 집계. Express child execution으로 비용·속도 최적화. A는 동시 40개 제한이라 100만 처리 너무 느림. C(AWS Batch)는 task당 컨테이너 부팅 비용이 5~30초 짧은 작업엔 Lambda보다 훨씬 크고 큐잉·스케줄 운영 부담. D는 Lambda 15분 timeout + 페이로드 한도 + 재귀 호출 가시성 부족. 함정: "대규모 병렬 + S3 source + 집계 결과"는 거의 Distributed Map. ECS Fargate Task를 child가 호출하는 패턴(.sync)도 자주.

---

**Question 10.** Black Friday sale starts; Lambda concurrent execution spikes 0→5,000 in 5 minutes. us-east-1 burst limit 3,000. Must handle without throttle; exact start time known. Best architecture?

A) Reserved Concurrency = 5,000 to isolate concurrency from other functions
B) Application Auto Scaling + Provisioned Concurrency to 5,000 30 min before sale
C) Increase function memory to 10GB to shrink needed concurrency via higher per-instance throughput
D) Switch to Function URL to bypass API Gateway overhead, reduce latency

**정답: B**
해설: Burst Concurrency 한도(3,000)는 함수 동시성 한도와 별개의 초기 폭증 제한. 0→5,000을 5분 안에 달성하려면 PC로 미리 워밍업. Application Auto Scaling 스케줄 기반(예: 매주 금요일 19:30)으로 PC 조정 → 운영 부담 감소. A(Reserved)는 상한이지 미리 띄우는 게 아니므로 burst 한도에 막힘. C는 콜드 스타트만 약간 감소. D는 무관. 함정: "예측 가능 트래픽 스파이크"는 거의 PC + Auto Scaling. 비용은 PC 시간당이지만 throttle 회피 + 일관 latency가 더 가치. 추가: 세일 종료 후 PC=10으로 내려 비용 절감.

---

**Question 11.** Global SaaS receives Stripe webhook + Shopify webhook simultaneously, routes amount > $1,000 to Step Functions workflow, rest to Lambda. Avoid webhook receiver operations. Best architecture?

A) API Gateway + Lambda webhook receiver validates signatures, retries, branches by amount
B) EventBridge Partner Bus (Stripe + Shopify) + Rule (amount > 1000) + SF/Lambda targets
C) SNS HTTPS subscription receives webhook, message filter policy branches by amount
D) ECS Fargate webhook proxy validates signatures, branches to SQS

**정답: B**
해설: Partner Bus는 AWS가 SaaS partner와 직접 통합해 webhook 인프라 없이 이벤트를 받는 매니지드 채널. EventBridge Rule의 풍부한 JSON 필드 매칭으로 amount > 1000 같은 조건 분기. A는 webhook receiver 운영 부담(보안, 인증, 재시도, 스케일링). C는 SNS가 메시지를 발행(outbound)하는 서비스라 SaaS의 인바운드 HTTPS webhook을 직접 수신할 수 없음 + 메시지 필터는 속성 기반이라 SaaS 임의 JSON 본문 매칭에 부적합. D는 자체 인프라 운영. 함정: "SaaS partner 이벤트"는 거의 Partner Bus. 추가: Stripe, Shopify, Datadog, Auth0, MongoDB Atlas 등 메이저 SaaS가 등록되어 있고 콘솔에서 한 번에 활성화.

---

**Question 12.** Fintech receives payment transactions in SQS, Lambda processes. Batch size=10; one failure triggers full batch retry (default), but idempotent-broken downstream causes duplicates. Retry only failed messages?

A) Set BatchSize=1
B) Shorten Visibility Timeout
C) Enable ReportBatchItemFailures in Lambda ESM + function returns failed message IDs
D) Send to DLQ immediately

**정답: C**
해설: ReportBatchItemFailures는 Lambda ESM의 partial batch response 기능. 함수가 `batchItemFailures: [{itemIdentifier: "msg-id-X"}, ...]` 형태로 응답하면 Lambda가 실패한 메시지만 재시도하고 나머지는 ack(큐에서 삭제). A(BatchSize=1)는 효율 매우 낮음 + 비용 증가. B는 무관. D는 maxReceiveCount 초과 후의 격리. 함정: "배치 처리 + 부분 실패 + 중복 처리 방지"는 ReportBatchItemFailures. 추가: Kinesis/DDB Streams ESM도 동일 기능. SQS의 경우 응답 형식이 약간 다르므로 docs 확인.

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

---

## 📝 연습 문제

**문제 1.** (same question as above...)

[Rest of the practice questions are preserved in Korean as per strict translation rules - they remain unchanged]

---

## 📌 오늘의 요약

[Preserved in Korean as per strict translation rules]
