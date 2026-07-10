# Day 1 - Lambda: What It Really Means to Run Code Without a Server

When Lambda was announced at re:Invent 2014, many developers asked, "So is this a replacement for EC2?" No. Lambda does not replace EC2. Lambda answers a completely different question: "I don't want to decide when and where this code runs. I just want the code to run whenever an event happens." The essence of Lambda is eliminating the entire process of provisioning servers, managing the OS, planning capacity, and patching.

There really are servers behind it. Lambda being serverless means the user doesn't manage the servers — not that there are no physical servers. Internally, AWS runs Lambda functions in isolated execution environments using a microVM technology called Firecracker. NIST SP 800-145 classifies cloud services into IaaS/PaaS/SaaS, but Lambda is FaaS (Function as a Service), a new abstraction layer that goes beyond this classification.

## The Execution Model — The Physics of Cold Starts and Warm Starts

When a Lambda function is invoked for the first time, or invoked again after sitting idle for a long time, AWS has to prepare a new Execution Environment. That process is the Cold Start.

What happens during a cold start:
1. AWS allocates one Firecracker MicroVM slot from the Lambda service fleet
2. It downloads the function code package from S3 and places it into the execution environment
3. It initializes the runtime (Node.js, Python, Java, etc.)
4. It runs the initialization code outside the handler (`import`s, global variables, DB connections, etc.)
5. Only then is the handler function invoked

The time up through step 4 is the cold start latency. It varies by language. Python/Node.js is usually 100-500ms, Java is 1-3 seconds (JVM initialization), Go is tens of ms, and .NET is a few hundred ms.

After a cold start, the execution environment is **reused**. When the same environment handles the next request, steps 3-4 are skipped, so it's fast. This is the Warm Start. While the execution environment is being reused, the `/tmp` directory (512MB-10GB) also persists, so it can be used to cache files.

```
[First invocation - cold start]
Time 0: request arrives
   │ MicroVM allocation + code download
   │ runtime initialization
   │ initialization code runs (DB connection, imports, etc.)
   ▼
Time ~500ms (Java: ~2000ms): handler runs
   ▼
Time ~600ms: response returned

[Second invocation - warm start (execution environment reused)]
Time 0: request arrives
   │ (MicroVM/runtime/initialization skipped)
   ▼
Time ~5ms: handler runs
   ▼
Time ~10ms: response returned
```

Techniques for minimizing cold starts:
- **Minimize package size**: fewer dependencies means less code-download time
- **Optimize initialization code**: remove unnecessary work from the code outside the handler
- **Runtime choice**: Go, Python, and Node.js have shorter cold starts than Java and .NET
- **Provisioned Concurrency**: keep a specified number of instances in a warmed-up state
- **Lambda SnapStart** (Java): save a memory snapshot at the point initialization completes, cutting the cold start down to a few hundred ms

> 💡 **Firecracker MicroVM and the isolation guarantee** — Lambda's Firecracker MicroVM is a technology AWS open-sourced in 2018. It creates isolated execution environments far more lightly and quickly (starting within 125ms) than traditional QEMU/KVM-based VMs. Firecracker uses the KVM hypervisor directly while minimizing the device emulation it needs. It's thanks to this isolation that a Lambda function cannot read another function's memory or kill its process. According to data disclosed at AWS re:Invent 2019, AWS can start millions of Firecracker MicroVMs per second. Firecracker is written in Rust and has a design philosophy that prizes memory safety and a minimal attack surface.

> 🔍 **Lambda SnapStart — a fundamental fix for cold starts** — Lambda SnapStart (for Java, launched in 2022) solves the cold-start problem in a fundamentally different way. When the function is deployed, it runs the initialization phase (steps 1-4) and saves the memory and disk state at that point as a snapshot. Later, when a cold start is needed, instead of initializing from scratch on a new MicroVM, it restores the saved snapshot. This can cut Java's 3-second cold start down to a few hundred ms. However, on snapshot restore, things like `UUID.randomUUID()`, the current time, and random number generation may return the values captured at snapshot time, so they must be re-initialized via a separate restore hook (`@SnapStartRestore`).

## Trigger Types — The Difference Between Synchronous, Asynchronous, and Polling

There are three patterns for invoking Lambda. This difference determines error handling, retries, and DLQ (Dead Letter Queue) behavior.

### Synchronous Invocation

The invoker sends a request to Lambda and waits until the result comes back. Since the invoker has to receive and handle the response, retrying on a Lambda error is the **invoker's responsibility**. The AWS Lambda service itself does not retry.

Representative services: API Gateway, ALB, Cognito, CloudFront (Lambda@Edge), direct SDK invocation.

```python
# Synchronous invocation example
import boto3
lambda_client = boto3.client('lambda')
response = lambda_client.invoke(
    FunctionName='my-function',
    InvocationType='RequestResponse',  # synchronous
    Payload=b'{"key": "value"}'
)
result = response['Payload'].read()
```

### Asynchronous Invocation

The invoker sends an event to Lambda and immediately gets an ACK. Lambda puts the event into an internal event queue, and the invoker does not wait for the result. On a Lambda failure, it **automatically retries up to 2 times** (3 attempts total). If it still fails after the retries, the event is sent to a DLQ (Dead Letter Queue — SQS or SNS) or routed to the On-Failure target of Lambda Destinations.

Representative services: S3 events, SNS, EventBridge, SES, AWS IoT, CodeCommit.

### Event Source Mapping (Polling)

The Lambda service polls the source directly and delivers batches to the Lambda function. There is no invoker; the Lambda service continuously watches the source in the middle.

Representative services: SQS, Kinesis Data Streams, DynamoDB Streams, MSK (Managed Kafka), Amazon MQ.

Error handling differs per source:
- **SQS**: failed messages return to the queue after the visibility timeout. After the max retries, they go to a DLQ. With `ReportBatchItemFailures`, you can retry only the failed items.
- **Kinesis/DynamoDB Streams**: retries continue from the starting sequence number of the failed batch. By default it doesn't stop until the records expire. With `bisectBatchOnFunctionError`, you can isolate the problem item by repeatedly halving the failed range.

| Invocation type | Waits for result | Retry | DLQ support | Representative sources |
|-----------|---------|-------|---------|---------|
| Synchronous | O | Invoker's responsibility | X (implement it yourself) | API GW, ALB |
| Asynchronous | X | Automatic, 2 times | O (SQS/SNS) | S3, SNS, EventBridge |
| Event source mapping | X (polling) | Varies by source | O (per source) | SQS, Kinesis, DDB Streams |

> ⚠️ **S3 event notifications are asynchronous invocations** — "S3 invokes Lambda synchronously" — wrong. S3 event notifications invoke Lambda asynchronously. S3 sends the event to Lambda and doesn't wait for a response. So in an S3 → Lambda pipeline, if the Lambda fails, AWS Lambda automatically retries twice and then routes to a DLQ or On-Failure Destination. S3 doesn't receive the error directly. By contrast, API Gateway → Lambda is a synchronous invocation, so a Lambda error is passed directly to the client through API Gateway.

> 💡 **Ordering guarantees and parallelism in event source mapping** — Event source mapping for an SQS Standard queue processes in batches with no ordering guarantee. An SQS FIFO queue guarantees ordering per message group ID and is processed in parallel per group ID. Kinesis and DynamoDB Streams guarantee ordering per shard/partition. Since one Lambda execution context processes each shard sequentially, the number of shards is the limit on Lambda parallelism. To increase the number of parallel Lambda executions, you have to increase the number of Kinesis shards (Resharding).

## Concurrency Control — The Difference Between Reserved and Provisioned

Concurrency means the number of Lambda function instances running at the same time. An AWS account has a default concurrency limit of 1000 per region (a soft limit, which you can request to increase). All functions in the account share these 1000.

**Reserved Concurrency**: "reserves" concurrency for a specific function. For example, if you set Reserved Concurrency = 100 on function A, then 100 of the account-wide 1000 are dedicated to this function. Other functions can't use these 100, and function A throttles (429 TooManyRequestsException) any requests beyond 100.

Role: it **protects** an important function (so a spike from another function can't steal my function's concurrency) and at the same time **limits the excessive use** of an important function (preventing DB overload). **It does not reduce cold starts.**

**Provisioned Concurrency**: keeps a pre-specified number of execution environments in a "warmed-up" state. It prepares instances that can respond immediately with no cold start. Use it for high-performance Lambdas behind API Gateway where cold-start latency can't be tolerated.

Role: **eliminates cold starts**. Adds cost (you're always billed for the warmed-up instances, even with no requests).

```
[Reserved Concurrency = 100 setting]
Account total concurrency: 1000
Dedicated to function A: 100 (other functions cannot access)
Function A's 101st concurrent request: throttled (429)
Shared by the rest: 900

[Provisioned Concurrency = 10 setting]
10 instances kept always warmed up (cost incurred continuously)
Requests 0-10: handled immediately with no cold start
11th concurrent request: handled with a new-instance cold start
```

| Aspect | Reserved Concurrency | Provisioned Concurrency |
|------|---------------------|------------------------|
| Purpose | Concurrency isolation + upper limit | Eliminate cold starts |
| Cost | The reservation itself is free (throttling only) | Warmed-up instances always billed |
| Cold start | Not reduced | Eliminated for the configured count |
| Scaling | Automatic (within the limit) | Automatic within the limit + guaranteed PC range |
| Auto Scaling integration | X | O (Application Auto Scaling) |

> 💡 **The serverless paradigm and the paradox of Provisioned Concurrency** — The cost structure of Provisioned Concurrency clashes oddly with the serverless paradigm. Serverless espouses "pay only for what you use," but Provisioned Concurrency incurs cost regardless of whether it's used. It's similar to buying an EC2 instance as a Reserved Instance. The trade-off: predictable response latency vs. cost efficiency. When a performance SLA stipulates a P99 latency (e.g., "99% of requests within 100ms"), Provisioned Concurrency may be the only way to meet that SLA. By integrating Application Auto Scaling to raise Provisioned Concurrency only during peak hours, you can optimize cost.

> 🔍 **Burst Concurrency and scaling speed** — Lambda's concurrency initially increases only in a limited way during a sudden traffic spike. The initial Burst Limit varies by region but is usually 500-3000. Beyond this limit, it grows by an additional 500 per minute. In other words, if traffic suddenly spikes 1000×, it can take several minutes for Lambda to reach the concurrency it needs to handle everything. Unexpected traffic spikes cause throttling. In the case of SQS event source mapping, messages Lambda didn't process remain in the queue, so they're processed later without loss.

## Lambda Networking — The Boundary Between the VPC and the Internet

A Lambda function runs by default outside a VPC managed by AWS. In this state it can reach the internet, but it cannot reach private resources inside the customer's VPC (RDS, ElastiCache, private EC2, etc.).

When you connect Lambda to the customer's VPC (VPC Configuration), the Lambda execution environment is assigned an ENI (Elastic Network Interface) and gets a private IP in the designated subnet. Now it can reach resources inside the VPC. In this state, however, internet access follows the subnet's routing rules.

```
[Default Lambda (outside the VPC — AWS Managed VPC)]
Lambda → internet O (direct)
Lambda → RDS in customer VPC X

[Lambda + VPC connection (private subnet)]
Lambda → RDS O (same VPC, private communication)
Lambda → internet X (no IGW in the private subnet)

[Lambda + VPC connection + NAT Gateway]
Lambda (private subnet)
    → NAT GW (public subnet) → IGW → internet O
    → RDS O (direct within the VPC)
```

An important pitfall: even if you place Lambda in a public subnet, the ENI does not get a public IP. A Lambda ENI always has only a private IP. Even with a public subnet + IGW routing, Lambda cannot get out to the internet. It must go through a NAT Gateway.

VPC Lambda cost considerations:
- NAT Gateway: a per-GB data-processing charge + an hourly charge
- Using VPC Endpoints: AWS services like DynamoDB and S3 can be reached through a VPC Gateway Endpoint without a NAT GW → cost savings

> 🔍 **Hyperplane ENI and improved cold starts** — The reason cold starts used to be extremely long in the old Lambda + VPC setup was that a new ENI was created for each function instance. Creating an ENI took several seconds. In 2019, AWS introduced the "Hyperplane ENI" to fix this. The Hyperplane ENI is a shared ENI-pool approach for VPC-connected Lambda functions, so there's no longer any need to create a new ENI on cold start. Today the cold start of a VPC Lambda is almost no different from a non-VPC Lambda. Hyperplane is AWS's internal network virtualization system, and VPC peering, Transit Gateway, PrivateLink, and others are also built on top of it.

> 📚 **Coinbase Lambda performance analysis case** — In 2021, Coinbase published a blog on the performance analysis of its Lambda-based backend architecture. On the cryptocurrency trading platform, API latency became unpredictable at the P99 level, and the analysis found that Lambda cold starts were the main cause. After applying Provisioned Concurrency, they reported that P99 latency dropped by 75%. In particular, applying SnapStart and Provisioned Concurrency together on Java-based Lambdas was effective. Coinbase additionally switched to the `arm64` architecture, improving performance by another 20% at the same cost.

## Lambda Destinations — More Flexible Error Handling Than a DLQ

The traditional way to handle failed events in an asynchronous Lambda function was the DLQ (Dead Letter Queue). A DLQ sends failed events to an SQS queue or an SNS topic.

Lambda Destinations (launched in 2019) is more flexible than a DLQ. For both success and failure, you can specify the next target.

Supported targets: SQS, SNS, EventBridge, **another Lambda function**.

Differences from a DLQ:
- A DLQ handles only failure events. Destinations handles both success and failure.
- A DLQ can only be SQS/SNS. Destinations can be SQS/SNS/EventBridge/Lambda.
- The Destinations payload includes the original event + the function execution result + error information, all together.
- A DLQ is a function setting; Destinations can be granular per function event-invoke configuration (per-trigger).

```
Asynchronous Lambda function
       │
       ├─ Success → On-Success Destination
       │          ├─ EventBridge (trigger the next workflow)
       │          ├─ SQS (record success)
       │          └─ Lambda (follow-up processing)
       │
       └─ Failure (after 2 retries) → On-Failure Destination
                                    ├─ SQS DLQ (manual reprocessing)
                                    ├─ SNS (alert — dev team email)
                                    ├─ EventBridge (conditional routing)
                                    └─ Lambda (attempt automatic recovery)
```

## Spec Limits and Cost Structure

Lambda's key spec limits come up often on the exam, so they need to be memorized.

| Item | Limit |
|------|------|
| Max execution time | 15 minutes |
| Memory | 128MB - 10,240MB (in 64MB increments) |
| /tmp storage | 512MB - 10,240MB |
| Max package size (ZIP, upload) | 50MB |
| Max package size (unzipped) | 250MB |
| Container image size | Up to 10GB |
| Concurrency per account (default) | 1000 (increasable) |
| Environment variables | Up to 4KB |
| Max payload (synchronous) | 6MB (request) / 6MB (response) |
| Max payload (asynchronous) | 256KB |
| Max number of layers | 5 |
| Max layer size (unzipped) | 250MB (function + all layers combined) |

Cost structure: number of requests × rate + execution time (ms) × memory (GB) × rate. The first 1 million requests/month and the first 400,000 GB-seconds/month are free (permanent free tier).

Choosing the ARM (Graviton2/Graviton3) architecture is about 20% cheaper than x86 and gives more performance for the same cost. For most Node.js and Python functions, switching to ARM is cost-effective.

Comparison with other FaaS (Function as a Service) offerings:

| Item | AWS Lambda | GCP Cloud Functions | Azure Functions |
|------|-----------|--------------------|-----------------| 
| Max execution time | 15 minutes | 60 min (HTTP), 10 min (Background) | 230s (default), unlimited (Premium) |
| Memory | 128MB-10GB | 128MB-16GB | 128MB-14GB |
| Cold start minimization | Provisioned Concurrency, SnapStart | Min Instances | Premium Plan (always warm) |
| Container image | O (10GB) | O | O |
| Local testing | SAM CLI, LocalStack | Functions Framework | Azure Functions Core Tools |
| Triggers | 200+ event sources | 30+ | 10+ bindings |

> ⚠️ **The practical implication of Lambda's 15-minute limit** — Although "Lambda runs up to 15 minutes" is allowed, Lambda isn't always the right fit for work that fills the full 15 minutes. Work that's hard to re-run on failure — like DB migrations or large-file processing — is safer on ECS Fargate or a Step Functions + Lambda combination. Since Lambda is stateless, work that fails needs logic to track how far it got before retrying. Long-running work: ECS/Fargate. Complex error handling and retries: Step Functions. Event responses processable within 15 minutes: Lambda.

## Hands-On With Lambda's Core Operations via the CLI

```bash
# Create a Lambda function (ARM + VPC + environment variables)
aws lambda create-function \
  --function-name prod-api-handler \
  --runtime python3.12 \
  --architectures arm64 \
  --role arn:aws:iam::111122223333:role/lambda-execution-role \
  --handler app.handler \
  --zip-file fileb://function.zip \
  --memory-size 512 \
  --timeout 30 \
  --vpc-config SubnetIds=subnet-private-a,subnet-private-b,SecurityGroupIds=sg-lambda \
  --environment Variables='{DB_HOST=prod-proxy.cluster-xxx.ap-northeast-2.rds.amazonaws.com}'

# Publish a Lambda version (Provisioned Concurrency applies only to a version or Alias)
aws lambda publish-version --function-name prod-api-handler

# Configure Provisioned Concurrency (20 on version 1)
aws lambda put-provisioned-concurrency-config \
  --function-name prod-api-handler \
  --qualifier 1 \
  --provisioned-concurrent-executions 20

# Configure Reserved Concurrency (whole function)
aws lambda put-function-concurrency \
  --function-name prod-api-handler \
  --reserved-concurrent-executions 200

# Configure Lambda Destinations (for asynchronous invocation)
aws lambda put-function-event-invoke-config \
  --function-name prod-processor \
  --maximum-retry-attempts 2 \
  --maximum-event-age-in-seconds 3600 \
  --destination-config '{
    "OnSuccess": {"Destination": "arn:aws:sqs:ap-northeast-2:111:success-queue"},
    "OnFailure": {"Destination": "arn:aws:sqs:ap-northeast-2:111:dlq"}
  }'

# SQS event source mapping (batch processing + partial failure handling)
aws lambda create-event-source-mapping \
  --function-name prod-processor \
  --event-source-arn arn:aws:sqs:ap-northeast-2:111:orders-queue \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures

# DynamoDB Streams event source mapping (bisect on error)
aws lambda create-event-source-mapping \
  --function-name ddb-stream-processor \
  --event-source-arn arn:aws:dynamodb:ap-northeast-2:111:table/Orders/stream/xxx \
  --starting-position LATEST \
  --batch-size 100 \
  --bisect-batch-on-function-error \
  --destination-config '{"OnFailure":{"Destination":"arn:aws:sqs:ap-northeast-2:111:stream-dlq"}}'

# Enable SnapStart (Java runtime)
aws lambda update-function-configuration \
  --function-name java-api-handler \
  --snap-start ApplyOn=PublishedVersions

# Monitor Lambda execution time and errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=prod-api-handler \
  --start-time 2025-05-26T00:00:00Z \
  --end-time 2025-05-26T23:59:59Z \
  --period 300 \
  --statistics Sum
```

## Wrapping Up

Lambda is the simplest model of "run code when an event happens." Behind that simplicity lie the isolation guarantee of the Firecracker MicroVM, the physics of cold starts, the three invocation models of synchronous/asynchronous/polling, the Reserved vs. Provisioned distinction in concurrency, and the networking rules when connecting to a VPC.

On the exam, a Lambda question almost always asks about one of these. "How do you eliminate cold starts?" → Provisioned Concurrency. "You need to reach RDS inside a VPC and call an external API at the same time?" → private subnet + NAT Gateway. "How do you track failures when S3 event processing fails?" → DLQ or Lambda Destinations. "How do you keep a function from stealing another function's concurrency?" → Reserved Concurrency.

Tomorrow we cover API Gateway, which stands in front of Lambda. We'll understand from the internal structure the difference between the three kinds — REST, HTTP, WebSocket — and why API Keys and Usage Plans are only possible on REST.

---

## 📝 연습 문제

**문제 1.** A Lambda function handles a user-authentication API behind API Gateway. There's an SLA that must guarantee P99 response latency within 100ms. It uses the Java runtime, so the cold start reaches 2-3 seconds. What is the most suitable solution?

A) Change the runtime to Python (reduces cold start)
B) Apply Provisioned Concurrency to warm up function instances in advance
C) Set Reserved Concurrency high
D) Increase memory to 10,240MB

**정답: B**

해설: Provisioned Concurrency keeps a specified number of Lambda execution environments always in an initialized state, eliminating cold starts. To satisfy a P99 100ms SLA, even the 99th-percentile request must be handled with no cold start. For A, Python has a shorter cold start than Java but can't eliminate it entirely, and for Java, SnapStart is also a valid option. For C, Reserved Concurrency reserves a concurrency limit; it doesn't eliminate cold starts. For D, increasing memory also increases CPU proportionally so execution can be faster, but it doesn't fundamentally solve the cold start.

---

**문제 2.** A Lambda function receives and processes events asynchronously from an SNS topic. When the function still fails after 3 attempts, how should you configure it to reprocess the event or send an alert?

A) Send it directly to SQS with try-catch inside the Lambda function
B) Configure an SQS DLQ on the Lambda function and set it to move to the DLQ after 3 retries
C) Set Lambda Destinations' On-Failure to SQS (after the automatic 2 retries)
D) Detect Lambda errors with CloudWatch Events and re-invoke

**정답: C**

해설: An asynchronous Lambda does 2 automatic retries by default (3 attempts total). If you set SQS as the On-Failure for Lambda Destinations, the event that failed even after all retries is automatically delivered to SQS. Destinations includes not only the original event but also the execution context and error information, enabling more detailed debugging. B is also a valid approach with a DLQ, but Destinations provides richer information and can also handle the success case, making it more flexible. For A, handling it inside the function raises code complexity and doesn't leverage the DLQ's retry benefits.

---

**문제 3.** A Lambda function must call both an RDS in the customer VPC's private subnet and an external payment API (internet). How should you configure it?

A) Placing Lambda in a VPC public subnet gives access to both RDS and the internet
B) Place Lambda in a VPC private subnet, and add a NAT Gateway in a public subnet for internet access
C) Keep Lambda outside the VPC and enable a public endpoint on RDS
D) Split Lambda into two, one inside the VPC and one outside

**정답: B**

해설: A Lambda's VPC ENI always has only a private IP. Even if you place it in a public subnet, internet access through an IGW does not work. The private subnet + NAT Gateway path is the standard way for a VPC Lambda to reach the internet. Since RDS is inside the VPC, it's accessible privately from a Lambda in the same VPC. For C, an RDS public endpoint carries a large security risk. For D, complexity is high and there's communication overhead between the two functions.

---

**문제 4.** A Lambda function receives events in batches from DynamoDB Streams and processes them. When some items in a batch fail to process, how do you retry only the failed items without reprocessing the successful ones?

A) Fail the entire batch and retry
B) Use ReportBatchItemFailures in the function response and return the sequence numbers of the failed items
C) Set the batch size to 1 to process one item at a time
D) Set up an SQS DLQ

**정답: B**

해설: Using the `ReportBatchItemFailures` response type lets the Lambda function include in its response the sequence numbers of the specific failed items. The Lambda service retries from those items and doesn't reprocess the already-successful ones. A reprocesses successful items too via a full retry, causing duplicates. C greatly reduces throughput and loses the benefit of batch processing. For D, you can use an On-Failure Destination in DynamoDB Streams event source mapping, but an SQS DLQ isn't directly supported in this context.

---

**문제 5.** There is a payment-processing Lambda function. This function must not use up the entire account-wide concurrency limit, and at the same time a traffic spike from another, less important function must not interfere with the payment function's execution. How should you configure it?

A) Set Provisioned Concurrency on the payment function
B) Set Reserved Concurrency on the payment function
C) Add a throttling rule to the less important function
D) Increase the account's overall concurrency limit

**정답: B**

해설: Reserved Concurrency plays two roles at once. ① It isolates the set amount so other functions can't use it → guaranteeing the payment function's capacity (protecting it from other functions' spikes). ② It throttles requests beyond the set amount → preventing the payment function from monopolizing the whole limit. This achieves both "protection" and "limitation" at the same time. For A, Provisioned Concurrency is for eliminating cold starts; it doesn't provide concurrency isolation. For C, you can limit the less important function directly, but you'd have to configure it every time a new function is created. For D, raising the overall limit doesn't isolate functions from each other.

---

**문제 6.** A Lambda function processes events from Kinesis Data Streams. Throughput per shard is insufficient and you want to increase parallel processing. What should you do?

A) Increase the Lambda function's memory
B) Increase Lambda Reserved Concurrency
C) Increase the number of Kinesis shards (Resharding)
D) Reduce the batch size

**정답: C**

해설: In Lambda's Kinesis event source mapping, parallelism is determined by the number of shards. Each shard is processed by one Lambda execution context (when Enhanced Fan-Out is disabled). So to increase parallel processing, you have to add Kinesis shards. For A, increasing memory speeds up an individual function but doesn't increase parallelism. For B, Reserved Concurrency sets an upper limit; it doesn't increase parallelism. For D, reducing the batch size causes more invocations, but the one-context-per-shard limit doesn't change.

---
