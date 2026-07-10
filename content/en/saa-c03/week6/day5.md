# Day 5 - Week 6 Review: Serverless + Containers, Put Together

The theme of Week 6 was "managed compute." The direction is AWS absorbing more and more of the burden of running servers yourself — following the spectrum from Lambda (fully serverless) to Fargate (serverless containers) to ECS/EKS (orchestration), we'll lay out where each service sits and its trade-offs. On the SAA-C03 exam, this topic shows up along two axes: "which service do you choose?" and "how do you wire them together?"

> 💡 **The operational-burden spectrum**: EC2 (fully self-managed) → ECS/EKS + EC2 (you manage nodes) → ECS/EKS + Fargate (orchestration only) → Lambda (functions only). The further right you go, the less operational burden and the thicker the AWS abstraction layer. From a cost-optimization standpoint, right isn't always better — the more steady and high your traffic, the cheaper EC2 or containers can be compared to Lambda. The selection criteria are "traffic pattern" and "your team's operational capacity."

## Week 6's Key Services at a Glance

| Service | Core role | Exam points |
|---------|-----------|-------------|
| Lambda | Event-driven function execution | Cold start vs Provisioned Concurrency, Reserved vs Provisioned, awsvpc VPC networking |
| API Gateway REST | Rich API features | API Key + Usage Plan, Mapping Templates, AWS service integration, mTLS |
| API Gateway HTTP | Low-cost HTTP API | JWT Authorizer, Lambda integration, ~70% cheaper than REST |
| API Gateway WebSocket | Real-time bidirectional | connectionId, $connect/$disconnect/$default, server push |
| Step Functions Standard | Long-running orchestration | Up to 1 year, exactly-once, waitForTaskToken, state-transition billing |
| Step Functions Express | High-throughput workflows | Up to 5 min, at-least/at-most-once, per-execution billing, 100K req/s |
| AppSync | Managed GraphQL | Subscription (real-time), Pipeline Resolver, N+1 DataLoader |
| ECR | Container image registry | Image scan, Lifecycle Policy, 3 VPC Endpoints |
| ECS | AWS-native orchestrator | Task Role vs Execution Role, awsvpc mode, Blue/Green |
| EKS | Managed Kubernetes | IRSA, Managed/Self-Managed/Fargate Profiles |
| Fargate | Serverless container execution | Firecracker MicroVM isolation, Spot 70% savings |

## Lambda Core Review

> 💡 **Lambda spec quick reference**:
>
> | Item | Value |
> |------|-------|
> | Max execution time | 15 minutes |
> | Max memory | 10,240 MB (10 GB) |
> | Max concurrency (region) | Default 1,000 (can be increased) |
> | Burst Concurrency | 500-3,000/min (varies by region) |
> | Deployment package (ZIP) | 50 MB (compressed), 250 MB (uncompressed) |
> | Deployment package (Container) | Up to 10 GB |
> | Environment variables | 4 KB |
> | /tmp storage | 512 MB – 10 GB |
> | Provisioned Concurrency | Configurable (warmed execution environments) |

**Cold-start mitigation strategies**: language choice (Python/Node.js are fast, Java/C# are slow), more memory (CPU is allocated proportionally), Provisioned Concurrency (keep warmed environments), Lambda SnapStart (Java 11+ snapshot restore, up to 10× improvement).

**Reserved vs Provisioned Concurrency**:
- Reserved: "reserve up to N concurrent executions for this function" — no other function can use that capacity. For isolation. Does not fix cold starts.
- Provisioned: "always keep N warmed execution environments" — cold start is 0ms. Incurs extra cost.

> ⚠️ **Pitfall — Lambda in a VPC and internet access**: When you attach Lambda to a VPC (awsvpc mode), it has no internet access by default. It can reach resources inside the VPC (RDS, ElastiCache), but external APIs and AWS public endpoints (the default DynamoDB, S3 endpoints) are blocked. Fixes: private subnet + NAT Gateway (for internet access), or a VPC Gateway/Interface Endpoint (for AWS service access). Lambda's Hyperplane ENI fixed the ENI-creation latency problem back in 2019, but the NAT Gateway cost is still there.

## Choosing an API Gateway Type

> 💡 **The 3 API Gateway types compared**:
>
> | Feature | REST API | HTTP API | WebSocket API |
> |---------|----------|----------|---------------|
> | Base cost | High | ~70% cheaper than REST | Connection time + messages |
> | API Key + Usage Plan | O | X | X |
> | Lambda Authorizer | O | O | O |
> | JWT Authorizer (external OIDC) | X | O | X |
> | Mapping Templates (VTL) | O | X | X |
> | Direct AWS service integration | O (DDB, SNS, SQS, etc.) | X | X |
> | Response Caching | O | X | X |
> | mTLS client authentication | O | X | X |
> | WebSocket real-time | X | X | O |
> | Best for | Enterprise APIs, partner integration | Internal microservices, mobile backends | Chat, gaming, real-time dashboards |

**Lambda Authorizer caveat**: the caching TTL defaults to 300 seconds. Setting TTL to 0 invokes the Authorizer Lambda on every request, which raises cost and latency. Set the TTL sensibly, but when authorization must be revocable immediately (a token blacklist), TTL 0 is required — you need to understand this trade-off.

**WebSocket API server → client push**: store the connectionId on `$connect`, and when the server POSTs to the Callback URL (`execute-api.region.amazonaws.com/{stage}/@connections/{connectionId}`), the message is pushed to the client. Without the connectionId, server push is impossible.

> 🔍 **Going deeper — REST API vs HTTP API decision tree**:
>
> ```
> Need API Key + usage limits for external partners?
>   → REST API (Usage Plan)
>
> Integrate AWS services (DynamoDB, SQS) directly without Lambda?
>   → REST API (AWS Service Integration + Mapping Templates)
>
> JWT auth with an external OIDC provider (Auth0, Okta)?
>   → HTTP API (JWT Authorizer)
>
> Simple Lambda/HTTP backend, cost-optimized?
>   → HTTP API
>
> Real-time bidirectional communication?
>   → WebSocket API
> ```

## Choosing a Step Functions Type

**Standard vs Express decision criteria**:
- Does execution run longer than 5 minutes? → Standard required
- Do you need exactly-once processing? (payments, inventory decrement) → Standard
- Thousands to hundreds of thousands of executions per second, high throughput? → Express (100K/s, 1M concurrent executions)
- Store logs in CloudWatch and minimize cost? → Express (per-execution billing, no state-transition billing)

> 💡 **The waitForTaskToken pattern — human-in-the-loop workflows**:
>
> 1. Step Functions passes a taskToken from the Task State to SQS/SNS/EventBridge
> 2. The assignee approves or rejects
> 3. The processing system calls `SendTaskSuccess(taskToken)` or `SendTaskFailure(taskToken)`
> 4. Step Functions receives the result and advances to the next state
>
> If you don't set `HeartbeatSeconds`, the task waits indefinitely. If you do set it, when no `SendTaskHeartbeat` arrives within HeartbeatSeconds the task fails with `States.HeartbeatTimeout` — which you must handle with a `Catch` block.

**The power of Distributed Map**: run 10,000 parallel child workflows to process large datasets in S3 in parallel. Use `ToleratedFailurePercentage` to tolerate some failures, and `ResultWriter` to store results in S3, working around the 256KB state-data limit.

> 🔍 **Going deeper — the Saga pattern and compensating transactions**: In a microservices environment, a distributed transaction spanning multiple services can't use 2PC (Two-Phase Commit) — it creates tight coupling between services and degrades availability. The Saga pattern, proposed by Garcia-Molina in 1987, has each step handled as a local transaction, and on failure it undoes the already-completed steps in reverse order via compensating transactions. In Step Functions you implement Saga with `Retry` (exponential-backoff retries) and `Catch` + `States.ALL` (catching all error types). Because a compensating transaction can itself fail, idempotency matters.

## Choosing a Container Service

> 💡 **ECS vs EKS vs Fargate decision tree**:
>
> ```
> Need Kubernetes standard (multi-cloud, open-source ecosystem)?
>   → EKS
>
> Need GPU / specialized instances?
>   → ECS/EKS + EC2 Launch Type
>
> Minimize node-management burden, simple service deployment?
>   → ECS + Fargate
>
> Need strong kernel-level security isolation (regulated industries)?
>   → Fargate (Firecracker MicroVM)
>
> Complex deployment patterns (CRD, Operator, Helm)?
>   → EKS
>
> Run only some EKS workloads serverless?
>   → EKS + Fargate Profiles (but no DaemonSets)
> ```

**The two IAM permission patterns**:
- ECS: Task Role (permissions for application code) + Task Execution Role (permissions for the agent)
- EKS: IRSA (IAM Roles for Service Accounts) — per-Pod IAM Role based on OIDC tokens

Both patterns share the same principle: "grant IAM permissions per workload, not per instance/node."

> ⚠️ **Pitfall collection — commonly confused concepts**:
>
> 1. **Task Role vs Task Execution Role**: the Execution Role lets the ECS agent pull from ECR and ship logs to CloudWatch. The Task Role lets the container code call S3/DDB. Swap the two and you get permission errors.
>
> 2. **Fargate's networking mode**: Fargate supports `awsvpc` mode only. `bridge` and `host` are not available.
>
> 3. **The 3 ECR VPC Endpoints**: `ecr.api` + `ecr.dkr` + `S3 Gateway Endpoint`. Miss even one and image pulls from a private subnet fail.
>
> 4. **IRSA vs Instance Profile**: on EKS, if you only set the node's Instance Profile, every Pod on that node shares the same permissions — you need IRSA for per-Pod control.
>
> 5. **Standard vs Express**: payment processing (exactly-once, over 5 minutes) = Standard. Order-status lookups (high throughput, under 5 minutes) = Express.

## Integrated Architecture — Serverless + Container Mix

```
[ User request flows ]

Mobile/Web Client
      │
      ├─ REST/JSON ──→ API Gateway (REST) ──→ Lambda ──→ DynamoDB / S3
      │                                             └──→ SQS → Lambda (async processing)
      │
      ├─ GraphQL ───→ AppSync ──→ DynamoDB / Lambda / OpenSearch
      │              (real-time push via Subscription ↓ Client)
      │
      └─ WebSocket → API Gateway (WS) ──→ Lambda ($connect, $default)
                                              └──→ DynamoDB (store connectionId)
                                              └──→ Push to other clients

[ Backend container services ]

ALB → ECS Fargate (awsvpc mode)
        │ Task Role (S3, DynamoDB permissions)
        └──→ RDS Proxy → Aurora Multi-AZ

[ Orchestration ]

EventBridge (schedule / events)
      └──→ Step Functions (Standard)
              ├─ Lambda (each step)
              ├─ ECS Fargate Task (batch processing)
              ├─ waitForTaskToken (human approval)
              └─ Distributed Map (large-scale parallel processing over S3)
```

> 📚 **Case study — an e-commerce order-processing system**: a classic scenario that shows up on the exam often. Order creation (API GW → Lambda → DDB) → payment processing (Step Functions Standard, Saga pattern, exactly-once) → inventory decrement (Lambda → DDB) → shipping request (SQS → ECS Fargate) → real-time shipment-tracking updates (AppSync Subscription → Mobile App). There's a reason a different service is optimal at each step — payment needs exactly-once, so Standard Step Functions; shipping processing has a batch nature, so Fargate; real-time status notifications, so AppSync Subscription.

> 📚 **Case study — a media processing pipeline**: video uploaded to S3 → EventBridge → Step Functions Distributed Map (10,000 chunks processed in parallel, each chunk transcoded by Lambda) → completed results stored in S3 via ResultWriter → distributed over a CDN with CloudFront. In this architecture, Standard Step Functions' Distributed Map enables large-scale parallel processing without AWS Batch or EMR, and on processing failures you can tolerate some failures with ToleratedFailurePercentage and then reprocess.

## The DR Angle — Availability Design of Week 6's Services

| Service | Built-in HA | Additional DR considerations |
|---------|-------------|------------------------------|
| Lambda | Automatic (multi-AZ execution) | Monitor concurrency limits, configure a DLQ |
| API Gateway | Automatic (in-region HA) | Multi-region: Route 53 + an API GW per region |
| Step Functions | Automatic (service-level HA) | Standard: execution history retained 1yr, Express: CloudWatch log retention |
| AppSync | Automatic (in-region HA) | Multi-region: integrate a Global DynamoDB Table |
| ECS Fargate | Multi-AZ subnet configuration | ALB + tasks spread across at least 2 AZs, mix Fargate Spot + On-Demand |
| EKS | Control plane is AWS-managed HA | Multi-AZ node groups, automatic etcd backups |
| ECR | Automatic (S3-based durability) | Cross-Region replication keeps images in the DR region too |

> 🔍 **Going deeper — Lambda Destinations vs DLQ**: both are Lambda failure-handling mechanisms, but they serve different purposes. A DLQ (Dead Letter Queue) sends the failure event to SQS or SNS when an asynchronous invocation fails. Lambda Destinations is more powerful — it can handle both success and failure (a DLQ handles failure only), supports 4 targets (SQS, SNS, Lambda, EventBridge), and includes the function response and context information in addition to the original event. In general, Lambda Destinations is recommended over a DLQ. Failure handling for Event Source Mappings (SQS, Kinesis, DDB Streams) must be configured separately, and `ReportBatchItemFailures` supports partial-batch success.

---

## 📝 연습 문제

**문제 1.** A Lambda function normally handles a small volume of requests, but every day at 9 AM hundreds of users connect simultaneously and the cold-start-induced response latency violates the SLA. What is the most suitable solution?

A) Set Reserved Concurrency high to block interference from other functions
B) Configure Provisioned Concurrency and use Application Auto Scaling to scale up at 8:55 AM
C) Raise the Lambda function's memory to the maximum (10GB) to shorten initialization time
D) Migrate the Lambda function to EC2

**정답: B**
Provisioned Concurrency prepares warmed execution environments in advance, making cold start 0ms. With Application Auto Scaling, you can automatically increase Provisioned Concurrency at 8:55 AM and reduce it after the peak. Reserved Concurrency (A) is for isolation and does not fix cold starts. Increasing memory (C) reduces cold starts but isn't a fundamental fix.

---

**문제 2.** You provide an API to external SaaS partners, and you must limit usage to 10,000 requests per month per partner, block requests when exceeded, and provide a per-partner usage dashboard. What is the most suitable API Gateway type and feature?

A) HTTP API + Lambda Authorizer
B) REST API + Usage Plan + API Key
C) WebSocket API + $connect handler
D) HTTP API + JWT Authorizer

**정답: B**
API Key and Usage Plan are features unique to REST API. In a Usage Plan you configure Throttle (per-second request limit) and Quota (total request count limit per period), and associate a per-partner API Key. Usage Plans also provide per-partner usage-tracking data. HTTP API (A, D) does not support API Key and Usage Plan. WebSocket (C) is for real-time bidirectional communication.

---

**문제 3.** In an order-processing system, three steps — payment billing, inventory decrement, and shipping request — must run in order. Payment billing must run exactly once, and if any step fails, the previous steps must be undone (refund, inventory restore). What is the most suitable architecture?

A) SQS FIFO → Lambda chain → each Lambda synchronously invokes the next Lambda
B) Step Functions Standard + Saga pattern (compensating transactions via Retry + Catch)
C) Step Functions Express (high throughput, cost-efficient)
D) EventBridge event chain (each service publishes and subscribes to events)

**정답: B**
Exactly-once guarantee for payment billing → Step Functions Standard (exactly-once, not at-least-once). Compensating transactions on failure (refund, inventory restore) → Saga pattern (Catch + compensating-transaction states). Express (C) is at-least-once, so payment could run more than once. An SQS Lambda chain (A) makes exact execution order and compensating-transaction management complex. An EventBridge chain (D) makes execution-state tracking and compensation difficult.

---

**문제 4.** You are building a real-time collaborative document-editing service. When multiple users edit the same document, one user's changes must be delivered to the other users immediately. What is the most suitable AWS architecture?

A) REST API Gateway + client polling (check for changes every 1 second)
B) API Gateway WebSocket + Lambda (store connectionId on $connect, push to all connections on change)
C) AppSync GraphQL + Subscription
D) SNS + clients doing HTTP Long Polling

**정답: C 또는 B**
AppSync GraphQL Subscription (C) provides managed real-time WebSocket connections and can automatically push DynamoDB changes to clients. It has less infrastructure to manage and unifies GraphQL queries with real-time. API Gateway WebSocket (B) is also valid, but you have to implement connectionId management and push logic yourself. Polling (A, D) isn't real-time and involves many unnecessary requests.

---

**문제 5.** You deploy an ECS Fargate service in a private subnet, and the container must pull images from ECR without internet access. What components are required?

A) Just configure a NAT Gateway to reach ECR over the internet
B) Configure only a single `com.amazonaws.region.ecr.dkr` VPC Endpoint
C) `ecr.api` Interface Endpoint + `ecr.dkr` Interface Endpoint + S3 Gateway Endpoint
D) Use ECR Public Registry to access without VPC Endpoints

**정답: C**
Private VPC access to ECR requires all three Endpoints. `ecr.api` is for ECR API calls (authentication, image metadata), `ecr.dkr` is for Docker image-layer transfer, and the S3 Gateway Endpoint is essential because ECR stores image layers in S3. Miss any one and image pulls fail. A goes over the internet, so it doesn't meet the requirement.

---

**문제 6.** In an EKS cluster, the payment-service Pod must access only Secrets Manager, and the log-collection Pod must access only CloudWatch. When the two Pods run on the same node, how do you grant IAM permissions per Pod?

A) Grant both permissions to the EC2 node's Instance Profile
B) Set IAM access keys in each Pod's environment variables
C) Use IRSA to attach a separate IAM Role to each Pod's Service Account
D) Store IAM credentials in a Kubernetes Secret

**정답: C**
IRSA lets each Pod use an independent IAM Role via OIDC tokens. Even on the same node, each Pod has only the permissions of the Role attached to its Service Account. A gives every Pod on the node both permissions, violating least privilege. B and D risk credential exposure and don't auto-rotate.

---

**문제 7.** A million new files are uploaded to an S3 bucket every night. Each file must be processed independently and the result stored in DynamoDB, and if the processing failure rate exceeds 5%, the entire job must be halted and an alert sent. What is the most suitable architecture?

A) EventBridge schedule → Lambda (sequential processing)
B) S3 event → SQS → Lambda (parallel processing, 1 million)
C) Step Functions Standard + Distributed Map (ToleratedFailurePercentage=5)
D) AWS Batch + ECS Fargate

**정답: C**
Step Functions Distributed Map runs up to 10,000 parallel child workflows and can take an S3 file list directly as input. With `ToleratedFailurePercentage=5`, it treats the entire execution as failed when the failure rate exceeds 5%, and can trigger an alert via CloudWatch Events. A processes sequentially, so a million files takes far too long. B (SQS + Lambda) is also possible, but controlling the failure-rate threshold is complex. D is suitable for batch computing but requires you to implement the failure-rate control logic yourself.

---

**문제 8.** In an insurance-claims processing system, when a customer submits a claim, a reviewer must approve or reject it within 5 business days. If the reviewer doesn't respond, an escalation email must be sent. What is the most suitable way to implement this workflow?

A) SQS + Lambda (check the DLQ every 5 days)
B) Step Functions Standard + waitForTaskToken + HeartbeatSeconds (5 days) + Catch (States.HeartbeatTimeout → escalation)
C) Run a notification Lambda after 5 days with an EventBridge scheduler
D) Step Functions Express + waitForTaskToken

**정답: B**
waitForTaskToken is a pattern that waits for a response from an external system or a human. Step Functions Standard can wait up to 1 year (Express has a 5-minute limit — D is wrong). Setting `HeartbeatSeconds` to 5 business days raises a `States.HeartbeatTimeout` error when there's no response, and you invoke an escalation Lambda via `Catch`. A makes 5-day-interval polling complex and state management difficult. C is simple but can't track workflow state.

---

**문제 9.** A startup is launching its initial service, and a 3-person backend team with no Kubernetes experience wants to deploy a container-based API server. Fast launch and minimal operational burden are the priorities. What is the most suitable service combination?

A) EKS + Managed Node Groups + Helm
B) ECS + Fargate + ALB
C) ECS + EC2 Launch Type + ASG
D) EKS + Fargate Profiles

**정답: B**
ECS has a simpler conceptual model than Kubernetes, and Fargate requires no node management. The integration between ALB and ECS Service makes traffic distribution and auto scaling easy to set up. A and D come with a Kubernetes learning curve. C requires managing EC2 nodes (ASG) yourself, which is a heavy operational burden.

---

**문제 10.** A fintech company provides a multi-tenant API. Each tenant has its own DynamoDB table and S3 bucket, and the Lambda function must access only the correct resources per tenant. It must also prevent Lambda cold starts to minimize API response latency. What is the most suitable design?

A) Deploy a separate Lambda function per tenant + set Provisioned Concurrency on each function
B) A single Lambda function + pass tenant ID via environment variables + access DynamoDB via EC2 Instance Profile + Provisioned Concurrency
C) A single Lambda function + switch to per-tenant IAM Roles at runtime via STS AssumeRole + Provisioned Concurrency
D) Deploy a per-tenant ECS Fargate service + isolate with Task Role

**정답: C**
In a single Lambda function, identify the tenant from an API Key or JWT claim, then get the per-tenant IAM Role via STS `AssumeRole` to access only that tenant's DynamoDB and S3. Provisioned Concurrency prevents cold starts. A becomes unmanageable — with hundreds to thousands of tenants you'd have thousands of Lambda functions. B's Instance Profile can access every tenant's resources, so isolation fails. D — a per-tenant Fargate service — is very costly.

---

**문제 11.** A Lambda function is invoked asynchronously to process images. It must capture failed image events for reprocessing, and for successfully processed images it must start a follow-on pipeline via a separate EventBridge bus. What is the most suitable configuration?

A) Set a DLQ (Dead Letter Queue) to SQS to handle only failure events
B) Configure Lambda Destinations: success → EventBridge, failure → SQS
C) Inside the Lambda, use try/catch to put-events to EventBridge on success and send-message to SQS on failure
D) Analyze failure patterns with CloudWatch Logs Insights and reprocess manually

**정답: B**
Lambda Destinations can handle both success and failure. On success it starts the follow-on pipeline via EventBridge, and on failure it puts the event into a reprocessing queue via SQS. A DLQ (A) can handle only failures and can't set a success target. C is possible but embeds infrastructure routing logic in application code, making it complex to manage. D isn't automation.

---

**문제 12.** A company is optimizing its AWS serverless services and is reviewing the following workloads: (1) 50,000 order-status lookups per second (each lookup completing within 3 seconds), (2) 100 large report generations per month (each report taking 20 minutes). If using Step Functions, which type should each use?

A) (1) Standard, (2) Standard
B) (1) Express, (2) Standard
C) (1) Express, (2) Express
D) (1) Standard, (2) Express

**정답: B**
(1) Order-status lookups: 50,000/s high throughput + completes within 3 seconds → Express (supports 100K req/s, the 5-minute limit is plenty, and per-execution billing is cheaper than Standard at high throughput). (2) Report generation: takes 20 minutes → exceeds Express's 5-minute limit → Standard required. Standard can run up to 1 year and is well suited to tracking report completion. D (Standard + Express) tries to process the 20-minute report with Express, exceeding the limit.

---
