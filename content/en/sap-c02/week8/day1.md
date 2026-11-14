# Day 1 - Lambda Advanced: Concurrency, Cold Starts, and SnapStart's Internal Operations

When you first launch a Lambda function, everything feels magical. You upload code as a zip or point to a container image, and someone else automatically spins it up and scales it. But the moment traffic suddenly surges 10x in production, questions emerge: "Why did my response time jump from 50ms yesterday to 5 seconds today?" The answer is almost always one of three things: concurrency limits, cold starts, or VPC ENI exhaustion.

In the SAP-C02 exam, Lambda is the centerpiece of the serverless domain. Simple "event → function execution" problems rarely appear. Most questions focus on operational perspectives: "What's the most cost-efficient way to handle traffic spikes?", "How do I reduce cold starts without additional cost?", "How do I avoid ENI explosion when Lambda accesses RDS Proxy inside VPC?" Today, we examine the internal operations that create these operational challenges.

## Firecracker and Lambda Execution Model — Why Micro VMs Were Chosen Over Containers

Many resources call Lambda a "container service," but technically it's not. Each function instance runs on a **Firecracker** micro VM atop its own Virtual Machine Monitor (VMM). Firecracker, which AWS open-sourced in 2018, was built to replace QEMU and reduced boot time to approximately 125ms.

Why micro VMs instead of containers (cgroups + namespaces)? The core reason is **isolation strength in multi-tenant environments**. Hundreds of customer functions can run side-by-side on a single bare metal server, but container-only isolation cannot prevent side-channel attacks (e.g., Spectre, Meltdown) due to kernel sharing. Firecracker runs on KVM while radically minimizing the device model, reducing VM boot overhead to container-like levels.

> 💡 **Related Theory**: Firecracker is detailed in the NSDI 2020 paper "Firecracker: Lightweight Virtualization for Serverless Applications." The key insight is that a minimal VMM (under 20,000 lines of Rust code) minimizes attack surface. The same technology powers Fargate, so "Lambda and Fargate are different abstractions over essentially the same isolation technology" is an accurate mental model. From a CS perspective, Lambda provides a stateless function abstraction while Fargate provides a stateful container abstraction, leading to different use cases.

> 🔍 **Deeper Dive**: Firecracker doesn't create new micro VMs for every invocation. AWS maintains a pool of **Slots** (pre-warmed micro VMs) on **Workers** (bare metal EC2 instances). When a cold start request arrives, AWS retrieves a Slot, injects function code, and executes init. Cold start time thus decomposes into: (1) Slot allocation — nearly 0 (2) Code download and decompression — proportional to zip/image size (3) Runtime bootup — Java JVM is heaviest (4) Init code execution — user responsibility. In exam questions asking "how to reduce cold start," the correct answer typically targets one of (2), (3), or (4).

## Breaking Down the Three Types of Concurrency

Concurrency is one of Lambda's most confusing concepts. The same word is used with three different meanings.

| Type | Meaning | Impact |
|------|---------|--------|
| **Account Concurrency Limit (Unreserved)** | A shared pool per region across all functions. Default 1,000 (soft limit). | One runaway function throttles others |
| **Reserved Concurrency** | Reserve part of the pool for a specific function. Also acts as an upper limit. | Isolation + upper bound |
| **Provisioned Concurrency (PC)** | Maintain N pre-warmed (initialized) instances. | Zero cold start, but costs apply |

Reserved and PC can be used together. For example, "this function is Reserved=200, PC=50" means 50 instances are always warm, traffic above that scales up to 150 cold, and requests exceeding 200 are throttled.

> ⚠️ **Trap**: Exam options often say "Setting Reserved Concurrency means only N instances can run." More precisely, **it guarantees N concurrent executions while acting as an upper limit**. Reserved=10 means at most 10 simultaneous executions; beyond that is throttled. Overlooking the "upper limit" aspect leads to incorrect scenario analysis.

> 📚 **Case Study**: In 2019, a fintech company experienced Lambda payment processing throttling due to a nighttime batch function traffic spike. Both functions shared the same account concurrency pool (1,000); the batch function occupied 950 during one hour, leaving only 50 for payment processing, causing a ~30% payment failure rate. The fix: assign Reserved=500 to the payment function for isolation. The SAP exam's "one function affects another" scenario follows exactly this pattern.

## Cold Start — Decomposing Causes Reveals Solutions

Lambda cold start time is cumulative, not a single number. By AWS official data, a Java 11 Lambda cold start breaks down as:

- **AWS Side** (code download + Slot allocation + runtime bootup): 100~600ms
- **Init Code** (user code class loading, DB connection pool initialization, etc.): 1~5 seconds (Java baseline)
- **First Handler Execution**: 200~1,000ms (JIT warmup)

The largest component is **Init Code**. A Java Spring Boot function can lose 2~3 seconds loading thousands of classes. SnapStart is the tool to address this.

**SnapStart's Operating Principle:**
1. When publishing a function version, AWS executes Init once.
2. At that moment, AWS captures and encrypts the micro VM memory and disk state as a snapshot.
3. On the next cold start, instead of re-executing init, the snapshot is restored via the **CRaC (Coordinated Restore at Checkpoint)** mechanism.
4. After restoration, the handler executes immediately.

> 💡 **Related Theory**: CRaC is an official OpenJDK project that standardizes checkpoint and restore of Java JVM process state. It's based on CRIU (Checkpoint/Restore In Userspace), a Linux kernel feature. SnapStart adopted CRaC, first for Java, then extended to Python and .NET in 2024. The core model follows a general distributed systems optimization pattern: **"initialize once, run infinitely."**

> 🔍 **Deeper Dive**: For Java managed runtimes SnapStart carries no additional cost because AWS benefits from better compute efficiency (Python and .NET incur snapshot cache and restore charges). Executing init on every cold start costs more CPU, memory, and network than restoring a pre-built snapshot from page cache. However, a pitfall exists: the snapshot **copies memory and disk state identically**, so random seeds, unique IDs, and DB connection TCP states created during init are identical across all restorations. That's why SnapStart guidelines emphasize "don't generate uniqueness state during init," and provide Crac.Resource interface hooks for beforeCheckpoint/afterRestore.

> ⚠️ **Trap**: Enabling SnapStart breaks the stateless function assumption. For example, if init generates a UUID.randomUUID() as an instance ID for cache keys, all SnapStart restorations get the same ID, causing cache collisions. The exam doesn't ask directly, but it's a common real-world pitfall worth knowing.

## VPC Integration and Hyperplane ENI — Before and After 2019

Lambda functions accessing RDS or ElastiCache inside VPC require VPC integration. Before 2019, Lambda VPC integration was notoriously problematic: each new concurrent execution **attached a new ENI**, and ENI creation took 10~15 seconds. With 100 concurrent executions, 100 ENIs were created, hitting VPC ENI limits (typically ~5,000 per subnet), causing function timeouts.

In September 2019, AWS completely redesigned this with the **Hyperplane ENI** architecture. Hyperplane is an AWS internal network virtualization layer (also powering VPC, NAT GW, NLB) operating as follows:

1. On first use of a function and VPC/Subnet/SG combination, a single cross-account ENI is created.
2. That ENI is **shared** by function instances. Even 100 concurrent executions typically end with just a few ENIs.
3. When the function becomes inactive, the ENI persists briefly before garbage collection.

This change made VPC Lambda cold starts nearly identical to non-VPC cold starts. Exam questions like "how do I avoid ENI explosion with Lambda VPC integration" are now rare, but understanding "ENI count per function is not proportional to concurrency" remains operationally important.

> 🔍 **Deeper Dive**: Hyperplane acts as a distributed NAT/LB layer inside AWS, similar to systems like **Andromeda**. NLB, PrivateLink, Lambda VPC ENI, NAT Gateway, and S3 Gateway Endpoint all run on Hyperplane. This means Lambda VPC integration "uses subnet IPs but actual traffic routes through Hyperplane" is the architectural insight. The AWS re:Invent 2019 session "A Serverless Journey: AWS Lambda Under the Hood" is the best primary source.

> 🎯 **Scenario**: "A company sends 500 queries/second from a Lambda to a VPC RDS PostgreSQL with max_connections=200. When concurrent executions grow to 1,000, 'too many connections' errors appear. Best solution?" — Answer: **RDS Proxy**. The Lambda → RDS Proxy → RDS pattern applies connection multiplexing (pooling), binding 1,000 Lambda instances to ~50 RDS connections. Additionally, RDS Proxy provides IAM auth and connection holding during failover. Exam keywords "Lambda + RDS + concurrency + connection error" almost always point to RDS Proxy.

## Asynchronous Invocation's Retry Model and Destinations

Lambda invocations come in three types — synchronous, asynchronous, and stream-based — each with different retry models.

| Invocation Model | Caller | Retries |
|----------|--------|---------|
| **Synchronous (Sync)** | API GW, ALB, Function URL, direct invoke | Caller's responsibility (Lambda doesn't retry) |
| **Asynchronous (Async)** | S3 Event, SNS, EventBridge | Lambda auto-retries 2x (3 total attempts) |
| **Stream Poll** | SQS/Kinesis/DDB Streams | ESM retries + DLQ/PartialBatch |

Failure handling for async invocations uses two approaches: **DLQ** (legacy, function execution failures only) and **Destinations** (2019, routes success and failure). Destinations are recommended, supporting four targets (Lambda, SNS, SQS, EventBridge).

> 📚 **Case Study**: In 2020, an e-commerce company ran an S3 → Lambda (image resize) pipeline with DLQ but struggled tracking "at which stage and with what input did failure occur?" Switching to Destinations, sending OnFailure to EventBridge, the failure event contained original input + response payload + execution context, simplifying analysis. DLQ preserves only the payload without context.

## Function URL — Bypassing API Gateway for Simple HTTPS

Function URL, launched in 2022, provides direct HTTPS endpoints to Lambda functions. Access is possible without API Gateway via https://<id>.lambda-url.<region>.on.aws. Authentication is NONE or IAM (AWS_IAM). CORS and CloudFront front-end are supported.

When to use:
- **Single function not worth API GW overhead** (simple webhook receiver, status endpoint, etc.)
- **Wanting to reduce API GW costs** (API GW costs $3.50/M per invocation; Function URL has no per-invocation cost — only Lambda invocation charges)
- **Caching behind CloudFront**

When not to use:
- API GW features needed (API keys, throttle, JWT validation)
- Non-REST protocols like WebSocket or SOAP
- Routing multiple functions under one domain

> ⚠️ **Trap**: Function URL supports only IAM authentication, not Cognito User Pool integration. JWT-based user authentication requires API GW + Cognito Authorizer. In exams, "Cognito user auth + Lambda" scenarios almost always point to API GW.

## Lambda Packaging — Layer vs Container Image

Function packaging supports two approaches.

| Method | Size Limit | Use Case |
|--------|-----------|----------|
| **zip + Layer** | zip 50MB (direct) / 250MB unzipped (S3), 5 layers max | General functions + shared libraries |
| **Container Image (OCI)** | 10GB | ML models, large binaries (ffmpeg, headless Chrome), existing container workflows |

Container Image pushes to ECR, then Lambda unpacks the image into the micro VM. The 10GB limit is large, but cold start can be longer (image pull time). However, Lambda uses **layer-wise lazy loading**, downloading only what's needed for first execution, reducing startup. This is detailed in the SOSP 2023 paper "Faster Cold Starts for Lambda with On-Demand Code Loading."

> 🔍 **Deeper Dive**: Lambda doesn't use the ECR original directly; instead, AWS stores the image in an internal distributed cache with **block-level deduplication**. If 10,000 functions use the same base image (e.g., public.ecr.aws/lambda/python:3.11), storage is consumed only once. During cold start, the entire image is not downloaded; only blocks needed for function execution are lazy-fetched. This enables even 10GB images to start first invocation in 200~500ms.

## Graviton2/3 (ARM) — 20% Savings Nearly Free

Lambda supports two architectures: x86_64 and arm64. arm64 (Graviton2) is ~20% cheaper and 19% faster. Without compatibility issues, ARM is almost always the answer.

When ARM cannot be used:
- Native binaries (x86-only .so/.dll) in libraries
- Some ML inference libraries (especially NVIDIA CUDA dependent)
- Container images not built multi-arch

Most Node.js/Python/Go/Java functions migrate to ARM unchanged. In SAP exams, "cost optimization" + "Lambda" keywords make ARM migration the first candidate.

## Lambda Burst Concurrency — The Limit on Sudden Traffic

Lambda doesn't scale to its concurrency limit (e.g., 1,000) instantly from 0. A **Burst Concurrency** initial spike limit exists, varying by region:
- us-east-1, us-west-2, eu-west-1: 3,000 burst
- ap-northeast-1, eu-central-1 and other major regions: 1,000 burst
- Other new regions: 500 burst

Beyond this, scaling increases +500 per minute gradually. So a workload needing 0 → 5,000 concurrent executions in under 5 minutes will face throttling (HTTP 429) for the first few minutes. To avoid this, pre-warm with Provisioned Concurrency.

> 🎯 **Scenario**: "Black Friday sale happens once monthly; 50x traffic surge in 5 minutes. Lambda must handle without throttle." — Answer: **Use Application Auto Scaling to increase Provisioned Concurrency on schedule**. Raise PC=2000 30 minutes before sale start, then reduce PC=10 after. PC charges per-hour, but throttle avoidance and consistent latency are worth more.

## Summary

On the surface, Lambda promises "just write code and it runs," but production operations are shaped by micro VM isolation, Hyperplane ENI, CRaC snapshots, and concurrency pooling, all determining cost and latency. Frequently tested exam scenarios map to four categories: "cold start (SnapStart vs PC vs init optimization)," "concurrency isolation (Reserved)," "VPC + DB connections (RDS Proxy)," and "ARM migration."

Next day, we'll see Step Functions, which lets you chain Lambda functions into workflows. The key next topic is how Step Functions supplements Lambda's limits (15-minute timeout, simple retry model).

---

## 📝 Practice Questions

**Question 1.** The cold start of a Java 17 Spring Boot-based Lambda function averages 4 seconds. The operations team wants to reduce it to 1 second or less at no additional cost. What is the most appropriate method?

A) Set Provisioned Concurrency = 100
B) Enable SnapStart + remove uniqueness state in init
C) Raise memory to 10 GB
D) Switch to a Function URL

**Answer: B**
Explanation: "At no additional cost" is the key. Provisioned Concurrency (A) is billed hourly. SnapStart has no additional cost on Java managed runtimes (Python/.NET are also supported, but incur cache and restore charges). Snapshot restore based on CRaC brings init time close to 0. However, if you create uniqueness state in init (random seeds, UUIDs, the TCP state of DB connections), it is replicated to every restored copy and causes collisions, so you must reinitialize it in beforeCheckpoint/afterRestore through the Crac.Resource interface. C increases cost, and D is unrelated to cold starts. Additional note: SnapStart applies only to published versions and does not apply to $LATEST.

---

**Question 2.** A payment processing Lambda function is throttled because of traffic spikes from another analytics batch Lambda. Both functions run in the same AWS account. How can you guarantee and isolate a minimum of 500 concurrent executions for the payment function?

A) Raise the account concurrency limit to 5,000
B) Set Reserved Concurrency = 500 on the payment function
C) Move the payment function to a separate account
D) Set Provisioned Concurrency = 0 on the analytics function

**Answer: B**
Explanation: Reserved Concurrency reserves part of the concurrency pool for a function and also acts as an upper limit. If you reserve 500 for the payment function, it is guaranteed up to 500 even if other functions surge. A (raising the limit) merely enlarges the pool and does not solve the distribution problem. C has too much operational burden. D is an option for reducing the analytics function's cold starts and has nothing to do with concurrency isolation. Trap: Reserved is not only isolation but also a cap. Additional note: for a very important function, combining Reserved + Provisioned achieves both isolation and zero cold starts.

---

**Question 3.** A Lambda function connects to RDS PostgreSQL in a VPC. As concurrent executions rise to 1,500, a "FATAL: too many connections" error occurs. RDS max_connections is 200. What is the most appropriate solution?

A) Increase the RDS instance class to raise max_connections to 2,000
B) Limit Lambda Reserved Concurrency to 200
C) Introduce RDS Proxy and have Lambda connect to the Proxy
D) Remove the Lambda VPC integration

**Answer: C**
Explanation: RDS Proxy provides connection multiplexing (pooling), so 1,500 Lambda invocations are bundled into roughly 50 RDS connections. It also supports IAM authentication and connection holding during failover, which improves availability. A is not a fundamental fix relative to the cost and DB load increase (Lambda can scale even further). B sacrifices availability (throttling occurs). D makes RDS connections impossible altogether. Trap: when you see "connection shortage," the answer is almost always RDS Proxy. It is a staple SAP exam pattern. Additional note: Proxy supports Aurora and RDS MySQL/PostgreSQL/MariaDB/SQL Server, and IAM authentication + Secrets Manager integration is automatic.

---

**Question 4.** In an S3 → Lambda asynchronous invocation pipeline, you want to analyze the original payload, response, and execution context of failed events. What is the most appropriate configuration?

A) DLQ(SQS)
B) Destinations OnFailure → EventBridge
C) X-Ray tracing only
D) CloudWatch Logs Insights

**Answer: B**
Explanation: Lambda Destinations (2019) route the success/failure results of asynchronous invocations to SNS/SQS/EventBridge/Lambda and send a rich event that includes the **original input + response payload + execution context**. A DLQ (A) is a legacy approach that keeps only the payload without the context. X-Ray (C) is distributed tracing but does not route failed events. CloudWatch Logs (D) is for after-the-fact searching, not automatic routing. Trap: "asynchronous + failure analysis" means Destinations. Additional note: if both Destinations and a DLQ are configured, Destinations takes precedence.

---

**Question 5.** An ML inference function includes 1.8 GB of PyTorch model weights. This exceeds the 250 MB unzipped limit of zip-based Lambda. It must also operate properly at 100 concurrent executions. What is the most appropriate packaging?

A) Spread across 5 Lambda Layers to secure 1.25 GB
B) Package as a Container Image (OCI), up to 10 GB
C) Store only the model externally with an EFS mount
D) Download the model from S3 on every invocation

**Answer: B**
Explanation: A Container Image can be up to 10 GB, and cold starts are also fast thanks to lazy block-level loading from ECR (200-500 ms on the first invocation). A is impossible because the limit is 5×50 MB = 250 MB. C (EFS) is possible, but EFS mount latency and cost are added, and the container image is the standard. D incurs download time and traffic costs on every invocation, and cold starts explode. Trap: for ML models, the answer is almost always a Container Image. Additional note: AWS Deep Learning Containers provide PyTorch/TensorFlow base images to reduce the build burden, and Lambda's block-level dedup also makes storage cost efficient.

---

**Question 6.** When a Black Friday sale starts, Lambda surges from 0 to 5,000 concurrent executions within 5 minutes. The us-east-1 burst limit is 3,000, and after that it grows gradually by +500 per minute. How can you absorb the traffic without throttling?

A) Set Reserved Concurrency = 5,000
B) Preset PC to 5,000 with Application Auto Scaling starting 30 minutes before the sale
C) Increase function memory to 10 GB
D) Change to a Function URL

**Answer: B**
Explanation: The burst limit (3,000) is an initial surge limit separate from the function concurrency limit. To go from 0 to 5,000 within 5 minutes, you must warm up in advance with PC. Application Auto Scaling supports schedule-based PC adjustment (for example, every Friday at 19:30), reducing the operational burden. A (Reserved) is an upper limit and does not pre-launch anything, so it is still blocked by the burst limit. C only slightly reduces cold starts. D is unrelated. Trap: for a "predictable traffic spike" scenario, the answer is almost always PC + Auto Scaling.

---

**Question 7.** A Lambda function runs Python 3.11 and uses only NumPy/Pandas. The operations team wants a 20% cost reduction. What is the simplest change?

A) Cut memory in half
B) Switch to the Graviton2 (arm64) architecture
C) Introduce Provisioned Concurrency
D) Switch to a Container Image

**Answer: B**
Explanation: Graviton2 (arm64) provides about a 20% price discount + 19% performance improvement with almost no code changes. Python 3.11 + NumPy/Pandas behave identically on ARM (arm64 wheels are available on PyPI). With A (reducing memory), execution time grows and cost can actually increase (memory is proportional to CPU). C increases cost. D is unrelated to the architecture. Trap: Lambda Power Tuning is a tool that finds the optimal memory/CPU point, but its savings are not as large as an architecture change. Additional note: the cases where ARM does not work are dependence on x86-only native binaries (.so) or on CUDA.

---

## 📌 Today's Summary

1. **Firecracker micro VM** isolation, warmed up from a slot pool → cold start decomposition (download/runtime/Init/JIT)
2. **Three kinds of concurrency**: account limit (1,000 default) / Reserved (isolation + cap) / Provisioned (warm, incurs cost)
3. **SnapStart** (CRaC-based) — Java (no extra cost)/Python/.NET (cache and restore charges), watch init uniqueness
4. **Hyperplane ENI** (2019~) — ENIs are shared for VPC integration, **RDS Proxy** resolves connection surges
5. **Asynchronous retries**: 2 automatic retries + rich routing with **Destinations** (SNS/SQS/EB/Lambda)
6. **Function URL** — simple HTTPS that bypasses API GW, IAM authentication only
7. **Container Image 10 GB** + block-level lazy loading, **Graviton2 ARM 20% savings**
8. **Burst Concurrency** limit (us-east-1 = 3,000) → for predictable spikes, PC + Auto Scaling
