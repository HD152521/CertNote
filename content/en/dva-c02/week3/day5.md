# Day 5 - Week 3 Review: Sharpening Your Instincts With Comprehensive Lambda Scenarios

The Lambda we covered in Week 3 is not a simple "serverless function". The Firecracker MicroVM execution model, the reliability models of the three invocation styles, the deployment lifecycle of versions, aliases, and layers, and the four layers of concurrency control — all of these are a single system, organically connected.

Today, rather than memorizing, we redraw the whole map with the question "why was it designed this way?" Then we check our real-exam instincts with 12 scenario questions in the form that actually appears on the test.

## Lambda Core Specs at a Glance

```
Execution environment
├── Runtimes: Python 3.12/3.11/3.10, Node.js 20/18, Java 21/17/11/8
│          Go 1.x, .NET 8/6, Ruby 3.3, Custom Runtime
├── Memory: 128MB – 10,240MB (64MB steps, 1,769MB = 1 vCPU)
├── Timeout: 1s – 900s (15 min)
├── /tmp: 512MB – 10,240MB
├── Environment variables: 4KB total
└── Deployment
    ├── Direct ZIP: 50MB
    ├── ZIP via S3: 250MB (uncompressed)
    ├── Container image: 10GB
    └── Layers: up to 5, code+layers total 250MB

Payload
├── Synchronous (request/response): 6MB
├── Asynchronous: 256KB
└── Response Streaming: 20MB

Concurrency
├── Account/region default: 1,000 (increase can be requested)
├── Initial burst: 500–3,000 (by region)
└── Additional per minute: +500
```

## The Three Invocation Styles: Starting Again From Design Principles

Lambda's three invocation styles were each born from a different reliability requirement.

**Synchronous invocation** started from "requests that need an immediate response". When API Gateway receives an HTTP request, the client is waiting for a response. If Lambda fails, API Gateway immediately returns an error to the client. Retry is the client's decision. **Simple, but no durability.**

**Asynchronous invocation** was born from "cases where you must not lose the event". The event that a file was uploaded to S3 is held durably by the Lambda service until it is processed. If it fails after 2 retries, it goes to a DLQ for later analysis. **High durability, no immediate response.**

**ESM polling** came from "workers that consume a queue/stream". SQS or Kinesis already holds the data durably. It is natural for Lambda to actively poll and process it. **Leverages the durability of the queue/stream as-is.**

```
Invocation style → use-case mapping

API Gateway → Lambda (synchronous)
   → RESTful API, real-time lookups, synchronous processing

S3 event → Lambda (asynchronous)
   → file processing, image resizing, upload triggers

SNS → Lambda (asynchronous, fan-out)
   → distribute events to multiple processing functions

EventBridge → Lambda (asynchronous, event bus)
   → event pattern matching, scheduled execution

SQS → Lambda (ESM, load balancing)
   → order processing, email sending, async work queues

Kinesis → Lambda (ESM, ordering guarantee)
   → clickstream analysis, real-time aggregation, time-series processing

DynamoDB Streams → Lambda (ESM, change reaction)
   → search index sync, cache refresh, audit logs
```

## Versions, Aliases, and Layers: The Similarity to Git

The easiest way to understand Lambda's deployment model is the Git analogy.

```
Git                    Lambda
────────────────────────────────────────
commit hash           version number (immutable)
HEAD                  $LATEST (mutable)
branch pointer        alias (mutable pointer)
Git Tag               version + Description
.npmignore            layer (shared dependencies)
```

Like `git checkout feature-branch`, changing an alias moves traffic to a different version. Like `git merge --ff-only`, canary deployment enables a gradual merge 10% at a time.

## Concurrency Control: Organized by Layer

| Layer | Where set | Cost | Cold start | Purpose |
|------|----------|------|------------|------|
| Account limit | AWS Support ticket | - | - | Overall ceiling |
| Reserved Concurrency | Function | None | No effect | Per-function isolation/ceiling |
| Provisioned Concurrency | Version/alias | Yes | Removed | Cold-start fix |
| Burst limit | Region-fixed | - | - | Scale-out rate limit |

**Shared responsibility relationships:**
- Reserved=300: this function runs up to 300, and 300 is deducted from the remaining functions
- Provisioned=20 on Reserved=300: of the 300, 20 are always warm, the remaining 280 cold-start on demand

## The Error-Handling Decision Tree

```
Error in Lambda?
    │
    ├── Synchronous invocation?
    │       → immediate error response (HTTP 200 + FunctionError header)
    │       → retry: caller's responsibility
    │       → DLQ: none
    │
    ├── Asynchronous invocation?
    │       → Lambda service retries after 1 minute (1st)
    │       → retries after 2 minutes (2nd)
    │       → final failure → DLQ or Destinations OnFailure
    │       → event age up to 6 hours
    │
    └── ESM polling?
            ├── SQS?
            │       → message returns after visibility timeout
            │       → maxReceiveCount exceeded → SQS DLQ
            │       → isolate partial failures with ReportBatchItemFailures
            │
            └── Kinesis/DDB Streams?
                    → default infinite retry (shard block risk!)
                    → setting MaximumRetryAttempts is essential
                    → isolate with BisectBatchOnFunctionError
                    → handle final failure with OnFailure Destination
```

## The Cold-Start Optimization Decision

```
Is cold start a problem?
    │
    ├── Java function?
    │       → SnapStart (free, needs a version)
    │
    ├── Strict response SLA (p99 < 100ms)?
    │       → Provisioned Concurrency (incurs cost)
    │
    ├── Large package size (>50MB)?
    │       → separate into layers
    │       → container image (leverage Lambda SnapStart)
    │
    ├── Slow import of large libraries?
    │       → lazy import (import only when needed)
    │       → increase memory (CPU scales with it → faster INIT)
    │
    └── VPC Lambda?
            → greatly improved after Hyperplane ENI
            → if still slow, single-AZ subnet → multi-AZ
```

## Focused Review of Exam Traps

**Trap 1**: Provisioned Concurrency cannot be set on `$LATEST`.
→ You must publish a version or create an alias and set it on that.

**Trap 2**: SnapStart's snapshot is created when a version is published.
→ It does not work on `$LATEST`. After a code change, you must publish a version.

**Trap 3**: Kinesis ESM's default retry is infinite.
→ If you don't explicitly set `MaximumRetryAttempts`, the shard can be blocked permanently.

**Trap 4**: A VPC-attached Lambda cannot access the internet directly, even in a public subnet.
→ Needs a NAT Gateway + private subnet.

**Trap 5**: Lambda alias weights support only 2 versions.
→ A three-way split is not possible.

**Trap 6**: The SQS DLQ and the Lambda DLQ are different concepts.
→ SQS-Lambda ESM failure is the SQS DLQ; S3/SNS asynchronous failure is the Lambda DLQ.

**Trap 7**: An API key is not authentication.
→ It's for usage tracking and limiting.

**Trap 8**: A Lambda container image cannot use layers.

**Trap 9**: /tmp is shared with the next invocation in the same execution environment.
→ Be careful with sensitive data. It's not shared if the execution environment differs.

**Trap 10**: Asynchronous retries are 2, at 1-minute/2-minute intervals.
→ Not infinite.

## Mapping DVA-C02 Exam Domains to Lambda

| Domain | Lambda-related keywords |
|--------|-------------------|
| Development (32%) | runtimes, handler, event structure, context object, layers |
| Security (26%) | Execution Role, Function Policy, VPC, IMDSv2, environment variable encryption |
| Deployment (24%) | versions, aliases, CodeDeploy, SnapStart, SAM, CloudFormation |
| Troubleshooting (18%) | CloudWatch metrics, X-Ray tracing, cold-start diagnosis |

---

## 📝 Week 3 종합 시나리오 문제

**문제 1.** A payment API Lambda function shows high latency during traffic surges. CloudWatch `ConcurrentExecutions` is in the normal range, and `Duration` P99 exceeds 3,000ms. What is the most likely cause and solution?

A) VPC ENI creation delay makes every invocation slow → detach Lambda from the VPC — after Hyperplane ENI there's no hot-path ENI creation, and ConcurrentExecutions is normal, so the cause doesn't match  
B) During surges, new execution environments are created, causing cold starts → set Provisioned Concurrency  
C) Insufficient memory causes GC/swap → raise MemorySize to 10GB — if memory were insufficient, you'd first see OOM errors and Max Memory Used saturation, but there's no such sign  
D) It's queued at the Reserved Concurrency ceiling → remove the Reserved setting — but then the Throttles metric should rise, whereas only Duration P99 spikes, which doesn't match the symptom  

**정답: B**  
해설: The pattern where `ConcurrentExecutions` is normal but P99 Duration suddenly spikes is a textbook sign of cold starts. During a traffic surge, new execution environments are created and the INIT phase (runtime boot + code loading + global initialization) is added. The solution is to secure pre-initialized instances with Provisioned Concurrency. A is not an ENI problem since ConcurrentExecutions is already in the normal range. C: if memory were insufficient, the `MemorySize` metric and `OOM` errors would appear. D: removing Reserved does not fix cold starts.

---

**문제 2.** When an image is uploaded to S3, Lambda generates a thumbnail and saves it to the `thumbnails/` directory of the same bucket. In operation, you discover Lambda is stuck in an infinite loop. What is the cause and solution?

A) Thumbnail generation doesn't finish within the timeout, so the same object is reprocessed → raise the timeout to 900s — even with a longer timeout, the loop remains as long as the output triggers the input event again  
B) When a file is saved to the `thumbnails/` directory, a new S3 event fires and Lambda is invoked again → add a suffix filter (`*.jpg`) to the event notification and save the thumbnail with a different extension, or separate input/output buckets  
C) Insufficient concurrency causes events to pile up in the retry queue and be invoked repeatedly → raise Reserved Concurrency to 1000 — increasing concurrency doesn't resolve the recursive structure where the output creates a new event  
D) The execution role lacks `s3:PutObject`, so the save is retried repeatedly → grant S3 full access to the role — if permission were the issue, it would fail immediately with AccessDenied rather than loop forever  

**정답: B**  
해설: Original image (`.jpg`) upload → Lambda runs → save `thumbnails/thumb.jpg` → new S3:ObjectCreated event fires → Lambda re-invoked → infinite loop. There are two solutions. ① Completely separate input/output buckets (cleanest). ② If you must use the same bucket, set a prefix filter on the event notification (the source directory name, without `/`), and when Lambda saves the thumbnail, use a different prefix or extension so it doesn't trigger the event. A, C, and D are all unrelated to this problem.

---

**문제 3.** In an order processing system, Lambda polls SQS to process orders. The batch size is 100, and one order failed due to an external API timeout. The remaining 99 also got reprocessed. How do you fix it?

A) Set a maxReceiveCount-based DLQ on the SQS queue to isolate failed messages — a DLQ only works after final failure and doesn't prevent the reprocessing of the other 99  
B) Set the ESM's asynchronous retry count to 0 to turn off retries — SQS ESM is not asynchronous invocation, and this setting doesn't isolate partial failures  
C) Enable `ReportBatchItemFailures` and implement Lambda to return only the failed message IDs in `batchItemFailures`  
D) Reduce the batch size from 100 to 1 to process messages one at a time — partial failure disappears, but invocation count grows 100× and it's inefficient  

**정답: C**  
해설: In SQS ESM, reprocessing the whole batch when only some fail is the default behavior. Enabling `ReportBatchItemFailures` lets Lambda return only the failed message IDs in `batchItemFailures`, and the Lambda service returns only those messages to SQS. The 99 that succeeded are deleted. A works only after final failure, so it's not a direct solution. D works but reduces throughput 100× and is inefficient.

---

**문제 4.** You're running Java Spring Boot on Lambda. Cold starts reach 3–5 seconds, violating the API response SLA. What is the cost-effective solution?

A) Maximize memory to 10GB to increase vCPU and accelerate INIT — CPU gets faster, but JVM class loading dominates, so the 3–5s cold start doesn't shrink enough and memory cost spikes  
B) Enable Lambda SnapStart and deploy via a version/alias  
C) Set Provisioned Concurrency to 1,000 to always keep warm instances — it works, but 1,000 PC far exceeds real traffic, so the cost is enormous  
D) Switch the runtime from Java to Node.js to reduce boot time — cold start improves, but it requires a full code rewrite, a large-scale refactor  

**정답: B**  
해설: SnapStart saves a snapshot of a Java function's JVM-initialized state at version publish, cutting cold starts by 90%+. It's free (only the S3 cost of storing the snapshot) and used together with versions/aliases. A speeds up CPU but doesn't greatly reduce JVM class loading time, cutting it from 3–5s to only about 1–2s. C is effective but 1,000 PC incurs enormous cost and is far more than actual traffic. D: swapping the runtime requires a large-scale refactor.

---

**문제 5.** You stored a DB password in a Lambda function's environment variables. The security team pointed out that this is encrypted only with the default KMS-managed key, so other teams in the account could potentially access it. What is the most effective solution?

A) Base64-encode the password before storing it in the environment variable to prevent plaintext exposure — Base64 is not encryption; anyone can decode it, so there's no security benefit  
B) Move it to AWS Secrets Manager, or encrypt the environment variable with a per-team customer-managed KMS key (CMK)  
C) Delete the environment variable and hardcode the password as a constant in the code, then restrict repository access — embedding the secret in source exposes it more broadly via git history and deployment packages  
D) Remove KMS decrypt permission from the execution role to block other teams' access — this blocks environment variable decryption and makes the function itself non-functional  

**정답: B**  
해설: Environment variables encrypted with the default AWS-managed key (`aws/lambda`) can be seen by anyone in the account with Lambda permissions. Encrypting with a per-team customer-managed KMS key (CMK) lets you restrict access via the key policy. Going further, Secrets Manager provides automatic rotation, audit logs, cross-account sharing, and fine-grained access control, making it more suitable for a DB password. A: Base64 is not encryption. C makes security worse. D: removing KMS permission makes the function stop working entirely.

---

**문제 6.** A team set Reserved Concurrency of 500 on a Lambda function. The account-wide concurrency limit is 1,000. The next day, another team's function got throttled due to a sharp traffic increase. What is the cause?

A) A code defect in the other team's function leaked concurrent executions, causing throttling — it's not a code problem but the structural cause that the shared pool was deducted  
B) The Reserved Concurrency setting of 500 shrank the account shared pool to 500, so the other functions could use only 500 in total  
C) Lambda concurrency limits are allocated independently per function/team, so one function's reservation doesn't affect another — in reality they share a single account/region pool  
D) The other team's function had no Provisioned Concurrency, so it couldn't withstand the burst — the absence of PC is only a cold-start issue, not a cause of throttling  

**정답: B**  
해설: Reserved Concurrency is deducted from the account-wide pool. If one function reserves 500 out of the 1,000 account limit, all remaining functions share 500. During a traffic surge, if the other functions collectively exceed 500, throttling occurs. This is the intended behavior of Lambda Reserved Concurrency, but setting a large value without planning can affect other teams. You should allocate Reserved by service importance and manage things so the total doesn't exceed the account limit.

---

**문제 7.** A Lambda function polls Kinesis Data Streams, and in CloudWatch the `IteratorAge` metric is continuously increasing. What does it mean and how do you respond?

A) Insufficient function memory delays processing, raising the metric → increase MemorySize — memory can be one factor, but the root of rising IteratorAge is the throughput gap where consumption can't keep up with production  
B) Lambda is processing Kinesis stream records slower than they're produced → increase ParallelizationFactor, increase shard count, optimize the processing logic  
C) The Kinesis stream record retention period expired, growing the lag → extend retention to 7 days — retention is only the data-expiry point and is unrelated to IteratorAge (unprocessed lag)  
D) The ESM execution role lacks Kinesis read permission → grant KinesisFullAccess — if permission were lacking, polling would fail entirely rather than lag gradually increasing  

**정답: B**  
해설: `IteratorAge` is the difference between the current time and the Put time of the record being processed from Kinesis. If this value increases, it means Lambda can't process data in real time and is falling behind. Response: ① Raise `ParallelizationFactor` to increase the number of parallel Lambdas per shard (1–10). ② Increase the number of Kinesis shards (split shard) to expand parallel processing capacity. ③ Optimize the Lambda execution time itself to raise processing speed. If a single failing record is blocking the shard, set `MaximumRetryAttempts` and `BisectBatchOnFunctionError`.

---

**문제 8.** Several Lambda functions use the same pandas and numpy libraries. Each function's ZIP size reaches 200MB, making deployment slow. How do you improve it?

A) Merge all functions into one large Lambda to package the dependencies just once — breaks single responsibility, increases complexity and blast radius, and deployment gets heavier  
B) Separate pandas and numpy into a Lambda Layer, and have each function contain only business logic  
C) Convert all functions to container images (up to 10GB) and bake the libraries into the base image — it works but is overkill vs a layer, and container images can't also use a Layer  
D) Lower the function memory setting to reduce the deployment package size — MemorySize is a runtime resource and is entirely unrelated to ZIP size  

**정답: B**  
해설: A Lambda Layer separates common libraries so multiple functions can share them. Publish a pandas+numpy layer once, and each function's ZIP contains only business logic, shrinking to a few KB to a few MB. This greatly improves deployment speed, and since layers are cached, it also helps Lambda cold starts. A violates single responsibility and increases complexity. C is a solution but is overkill vs a layer, and containers can't use layers. D: memory and package size are unrelated.

---

**문제 9.** How does it behave when Lambda Destinations and a DLQ are configured at the same time?

A) DLQ has higher priority than Destinations, so failure events are sent only to the DLQ — the actual priority is the opposite; Destinations supersede the DLQ  
B) If Destinations OnFailure is configured, the DLQ is ignored  
C) Both settings apply, so the same failure event is duplicated to both the DLQ and Destinations — only Destinations applies, so there is no duplicate delivery  
D) The configuration conflict makes Lambda throw a ConfigurationError, requiring you to keep only one — both can be configured, and Destinations takes precedence with no conflict error  

**정답: B**  
해설: If Lambda Destinations OnFailure is configured, on the final failure of an asynchronous invocation the event is sent only to Destinations. The DLQ is a fallback for when there are no Destinations. AWS official documentation states "Destinations supersede DLQ". However, this rule differs in SQS ESM — it's the SQS queue's DLQ, not the Lambda DLQ, that applies.

---

**문제 10.** A Lambda function's code creates the DB connection inside the handler function. The operations team reports that a surge in DB connection count causes RDS Connection Limit errors. What is the most effective solution?

A) Reduce Lambda memory to suppress the number of concurrently active execution environments — memory is unrelated to connection count and only lowers throughput  
B) Move the DB connection code outside the handler (global scope), or use Amazon RDS Proxy  
C) Set Reserved Concurrency to 1 to force a single concurrent connection — it prevents the connection surge but effectively serializes processing, collapsing throughput  
D) Increase the RDS instance size to raise the max_connections limit — it only raises the limit while the inefficient connection-creation pattern remains, so it's not a root fix  

**정답: B**  
해설: Creating the DB connection inside the handler makes a new connection every invocation and closes it. With 100 concurrent executions, 100 connections are created momentarily. Connecting outside the handler (global scope) reuses the existing connection when the execution environment is reused (warm start), greatly reducing the connection count. Additionally, RDS Proxy solves the RDS Connection Limit problem even under Lambda's massive concurrency via connection pooling. C: limiting concurrency to 1 makes throughput extremely low. D is not a root fix.

---

**문제 11.** What is the maximum event age of a Lambda asynchronous invocation?

A) 1 hour  
B) 6 hours  
C) 24 hours  
D) 7 days  

**정답: B**  
해설: In Lambda asynchronous invocation, an event is held in the internal queue for up to 6 hours (21,600 seconds). If not processed within this time, it is discarded (or sent to the DLQ/Destinations if configured). You can set this value between 60 seconds and 21,600 seconds with `MaximumEventAgeInSeconds`. Lower this value when you want to discard old events that are past their usable processing window rather than send them to a DLQ.

---

**문제 12.** A Lambda function needs to access an internal on-premises database. This DB is only reachable over a VPN connection. How do you configure it?

A) Issue a Lambda Function URL and communicate with the on-premises DB through that endpoint — a Function URL is just an inbound HTTPS endpoint exposing the function to the internet, not an outbound path to the internal network  
B) Assign an Elastic IP directly to the Lambda function to pass through the VPN tunnel with a fixed IP — you can't attach an EIP to Lambda, and an outbound fixed IP is only possible via VPC+NAT  
C) Attach Lambda to a VPC, and connect the on-premises network to the VPC via Direct Connect or Site-to-Site VPN  
D) Grant appropriate IAM permissions to the Lambda execution role, and AWS will auto-configure the VPN to on-premises — IAM is only permission control and cannot create a network path  

**정답: C**  
해설: On-premises DB access needs a network path. Attach Lambda to a VPC, and from that VPC configure a routing path to the on-premises network via Direct Connect or Site-to-Site VPN. Lambda accesses the DB with a private IP through the VPC's ENI. A: a Function URL is an internet-facing endpoint, unrelated to internal DB access. B: Lambda cannot be assigned an Elastic IP outside a VPC. D: an IAM Role is AWS service permission, not a network path.

---

## Self-Assessment

| Correct count | Assessment |
|--------|------|
| 11-12 | Lambda master — ready for the DVA exam |
| 9-10 | Excellent — review the scenarios you missed |
| 7-8 | Good — reread Days 11–14 and try again |
| 5-6 | Fair — start over from Firecracker MicroVM |
| 0-4 | Needs work — all of Week 3 from the beginning |
