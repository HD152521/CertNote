# Day 5 - Week 6 Review: Serverless + Containers Combined

The theme of Week 6 was "managed compute." AWS keeps absorbing more of the burden of running servers yourself, and we trace the spectrum from Lambda (fully serverless) through Fargate (serverless containers) to ECS/EKS (orchestration), sorting out each service's position and trade-offs. On the SAA-C03 exam this topic is tested along two axes: "which service do you choose" and "how do you connect them."

**The spectrum of operational burden**: EC2 (fully managed by you) → ECS/EKS + EC2 (node management) → ECS/EKS + Fargate (orchestration only) → Lambda (functions only). Moving to the right, operational burden shrinks and the AWS abstraction layer gets thicker. From a cost optimization standpoint, the right side is not always better: the steadier and higher the traffic, the cheaper EC2 or containers can be compared with Lambda. The selection criteria are "traffic pattern" and "the team's operational capability."

## Week 6 Core Services at a Glance

| Service | Core role | Exam points |
|--------|---------|-----------|
| Lambda | Event-driven function execution | Cold start vs Provisioned Concurrency, Reserved vs Provisioned, awsvpc VPC networking |
| API Gateway REST | Rich API features | API Key + Usage Plan, Mapping Templates, AWS service integration, mTLS |
| API Gateway HTTP | Low-cost HTTP API | JWT Authorizer, Lambda integration, 70% cheaper than REST |
| API Gateway WebSocket | Real-time two-way | connectionId, $connect/$disconnect/$default, server push |
| Step Functions Standard | Long-running orchestration | Up to 1 year, exactly-once, waitForTaskToken, billed per state transition |
| Step Functions Express | High-throughput workflows | Up to 5 min, at-least/most-once, billed per execution count, 100K req/s |
| AppSync | Managed GraphQL | Subscription (real-time), Pipeline Resolver, N+1 DataLoader |
| ECR | Container image registry | Image scanning, Lifecycle Policy, 3 VPC Endpoints |
| ECS | AWS-native orchestrator | Task Role vs Execution Role, awsvpc mode, Blue/Green |
| EKS | Managed Kubernetes | IRSA, Managed/Self-Managed/Fargate Profiles |
| Fargate | Serverless container execution | Firecracker MicroVM isolation, Spot 70% savings |

## Lambda Core Review

**Lambda specs quick reference**:

| Item | Value |
|------|-----|
| Maximum execution time | 15 minutes |
| Maximum memory | 10,240 MB (10 GB) |
| Maximum concurrent executions (Region) | Default 1,000 (can be increased) |
| Burst Concurrency | 500-3,000/min (varies by Region) |
| Deployment package (ZIP) | 50 MB (zipped), 250 MB (unzipped) |
| Deployment package (Container) | Up to 10 GB |
| Environment variables | 4 KB |
| /tmp storage | 512 MB to 10 GB |
| Provisioned Concurrency | Configurable (pre-warmed execution environments) |

**Cold start mitigation strategies**: Language choice (Python/Node.js are fast, Java/C# are slow), increasing memory (CPU is allocated proportionally), Provisioned Concurrency (keeps warm environments), Lambda SnapStart (snapshot restore for Java 11+, up to 10× improvement).

**Reserved vs Provisioned Concurrency**:
- Reserved: "Reserve up to N concurrent executions for this function" — other functions cannot use this capacity. For isolation. Does not fix cold starts.
- Provisioned: "Always keep N warm execution environments" — 0ms cold start. Incurs additional cost.

> ⚠️ **Trap — Lambda VPC and internet access**: When you attach Lambda to a VPC (awsvpc mode), it cannot access the internet by default. It can reach resources inside the VPC (RDS, ElastiCache), but external APIs and AWS Public Endpoints (the default DynamoDB and S3 endpoints) are blocked. Solutions: a private subnet + NAT Gateway (internet access), or a VPC Gateway/Interface Endpoint (AWS service access). Lambda's Hyperplane ENI has solved the ENI creation delay problem since 2019, but the NAT Gateway cost still exists.

## Criteria for Choosing an API Gateway Type

**Comparing the 3 API Gateway types**:

| Feature | REST API | HTTP API | WebSocket API |
|------|---------|---------|---------------|
| Base cost | High | ~70% cheaper than REST | Based on connection time + messages |
| API Key + Usage Plan | Yes | No | No |
| Lambda Authorizer | Yes | Yes | Yes |
| JWT Authorizer (external OIDC) | No | Yes | No |
| Mapping Templates (VTL) | Yes | No | No |
| Direct AWS service integration | Yes (DDB, SNS, SQS, etc.) | No | No |
| Response Caching | Yes | No | No |
| mTLS client authentication | Yes | No | No |
| Real-time WebSocket | No | No | Yes |
| Best use | Enterprise APIs, partner integrations | Internal microservices, mobile backends | Chat, games, real-time dashboards |

**Lambda Authorizer caution**: The default caching TTL is 300 seconds. Setting the TTL to 0 invokes the Authorizer Lambda on every request, increasing cost and latency. Set the TTL appropriately, but when permissions must be revoked immediately (token blacklist), TTL 0 is needed. You must understand this trade-off.

**Server → client push with the WebSocket API**: Store the connectionId in `$connect`, and when the server POSTs to the Callback URL (`execute-api.region.amazonaws.com/{stage}/@connections/{connectionId}`), the message is pushed to the client. Server push is impossible without the connectionId.

**Going deeper — REST API vs HTTP API decision tree**:

```
Need API Keys + usage limits for external partners?
  → REST API (Usage Plan)

Integrate AWS services (DynamoDB, SQS) directly without Lambda?
  → REST API (AWS Service Integration + Mapping Templates)

JWT authentication from an external OIDC provider (Auth0, Okta)?
  → HTTP API (JWT Authorizer)

Simple Lambda/HTTP backend, cost optimization?
  → HTTP API

Real-time two-way communication?
  → WebSocket API
```

## Criteria for Choosing Step Functions

**Standard vs Express decision criteria**:
- Does execution run longer than 5 minutes? → Standard is required
- Is exactly-once processing needed? (payments, inventory deduction) → Standard
- High throughput of thousands to hundreds of thousands per second? → Express (100K/s, 1M concurrent executions)
- Store logs in CloudWatch and minimize cost? → Express (billed per execution count, no charge for state transitions)

**The waitForTaskToken pattern — workflows involving people**:

1. Step Functions passes the taskToken from the Task State to SQS/SNS/EventBridge
2. A person in charge approves or rejects
3. The processing system calls `SendTaskSuccess(taskToken)` or `SendTaskFailure(taskToken)`
4. Step Functions receives the result and moves on to the next state

If you do not set `HeartbeatSeconds`, the task waits up to the maximum execution time (the 1-year quota). If you set it, the task fails with `States.HeartbeatTimeout` when no `SendTaskHeartbeat` arrives within HeartbeatSeconds, and you must handle it with a `Catch` block.

**The power of Distributed Map**: Run 10,000 parallel child workflows to process large amounts of data in S3 in parallel. `ToleratedFailurePercentage` allows some failures, and `ResultWriter` stores results in S3 to get around the 256KB state data limit.

**Going deeper — the Saga pattern and compensating transactions**: In a microservices environment, distributed transactions spanning multiple services cannot use 2PC (2-Phase Commit), because it creates tight coupling between services and reduces availability. The Saga pattern, proposed by Garcia-Molina in 1987, processes each step as a local transaction and, on failure, cancels the already-completed steps in reverse order with compensating transactions. In Step Functions, you implement a Saga with `Retry` (exponential backoff retries) and `Catch` + `States.ALL` (catching all error types). Because a compensating transaction can itself fail, idempotency is important.

## Criteria for Choosing a Container Service

**ECS vs EKS vs Fargate decision tree**:

```
Need the Kubernetes standard (multi-cloud, open-source ecosystem)?
  → EKS

Need GPU / specialized instances?
  → ECS/EKS + EC2 Launch Type

Minimize node management burden, simple service deployment?
  → ECS + Fargate

Need strong kernel-level security isolation (regulated industry)?
  → Fargate (Firecracker MicroVM)

Complex deployment patterns (CRD, Operator, Helm)?
  → EKS

Run only some workloads serverless in EKS?
  → EKS + Fargate Profiles (but no DaemonSets)
```

**Two patterns for IAM permissions**:
- ECS: Task Role (application code permissions) + Task Execution Role (agent permissions)
- EKS: IRSA (IAM Roles for Service Accounts) — per-Pod IAM Role based on OIDC tokens

Both patterns share the same principle: "grant IAM permissions per workload, not at the instance/node level."

> ⚠️ **Collected traps — commonly confused concepts**:
>
> 1. **Task Role vs Task Execution Role**: The Execution Role is for the ECS agent to pull from ECR + send CW logs. The Task Role is for the container code to call S3/DDB. Swapping them causes permission errors.
>
> 2. **Fargate networking mode**: Fargate supports only `awsvpc` mode. `bridge` and `host` are not possible.
>
> 3. **3 ECR VPC Endpoints**: `ecr.api` + `ecr.dkr` + `S3 Gateway Endpoint`. If any one is missing, image pulls from a private subnet fail.
>
> 4. **IRSA vs Instance Profile**: In EKS, if you set only the node Instance Profile, every Pod on the same node gets the same permissions — you need IRSA for per-Pod control.
>
> 5. **Standard vs Express**: Payment processing (exactly-once, over 5 minutes) = Standard. Order status lookup (high throughput, under 5 minutes) = Express.

## Integrated Architecture — Mixing Serverless + Containers

```
[ User request flow ]

Mobile/Web Client
      │
      ├─ REST/JSON ──→ API Gateway (REST) ──→ Lambda ──→ DynamoDB / S3
      │                                             └──→ SQS → Lambda (async processing)
      │
      ├─ GraphQL ───→ AppSync ──→ DynamoDB / Lambda / OpenSearch
      │              (Real-time Push via Subscription ↓ Client)
      │
      └─ WebSocket → API Gateway (WS) ──→ Lambda ($connect, $default)
                                              └──→ DynamoDB (store connectionId)
                                              └──→ Push to other clients

[ Backend container service ]

ALB → ECS Fargate (awsvpc mode)
        │ Task Role (S3, DynamoDB permissions)
        └──→ RDS Proxy → Aurora Multi-AZ

[ Orchestration ]

EventBridge (schedule / events)
      └──→ Step Functions (Standard)
              ├─ Lambda (each step)
              ├─ ECS Fargate Task (batch processing)
              ├─ waitForTaskToken (human approval)
              └─ Distributed Map (large-scale parallel S3 processing)
```

**Case study — e-commerce order processing system**: A typical exam scenario. Order creation (API GW → Lambda → DDB) → payment processing (Step Functions Standard, Saga pattern, exactly-once) → inventory deduction (Lambda → DDB) → shipping request (SQS → ECS Fargate) → real-time shipment tracking updates (AppSync Subscription → Mobile App). Each step has a reason a different service is optimal: payment must be exactly-once, so Standard Step Functions; shipping handling is batch-like, so Fargate; real-time status notifications use AppSync Subscription.

**Case study — media processing pipeline**: Upload a video to S3 → EventBridge → Step Functions Distributed Map (10,000 chunks processed in parallel, each chunk transcoded by Lambda) → store the results with ResultWriter in S3 → distribute through CloudFront CDN. In this architecture, the Distributed Map in Standard Step Functions can do large-scale parallel processing without AWS Batch or EMR, and when processing fails, it can tolerate some failures with ToleratedFailurePercentage and then reprocess.

## A DR Perspective — Availability Design of the Week 6 Services

| Service | Built-in HA | Additional DR considerations |
|--------|---------|----------------|
| Lambda | Automatic (multi-AZ execution) | Monitor concurrency limits, configure a DLQ |
| API Gateway | Automatic (HA within the Region) | Multi-Region: Route 53 + API GW in each Region |
| Step Functions | Automatic (service-level HA) | Standard: execution history kept 1 year, Express: CloudWatch log retention |
| AppSync | Automatic (HA within the Region) | Multi-Region: integrate with Global DynamoDB Tables |
| ECS Fargate | Multi-AZ subnet configuration | ALB + spread tasks across at least 2 AZs, mix Fargate Spot + On-Demand |
| EKS | AWS-managed HA control plane | Multi-AZ node groups, automatic etcd backups |
| ECR | Automatic (S3-based durability) | Keep images in the DR Region too with cross-Region replication |

**Going deeper — Lambda Destinations vs DLQ**: Both are Lambda failure-handling mechanisms, but their purposes differ. A DLQ (Dead Letter Queue) sends the failed event to SQS or SNS when an asynchronous invocation fails. Lambda Destinations are more powerful: they can handle both success and failure (a DLQ handles only failure), support 4 target types (SQS, SNS, Lambda, EventBridge), and include the function response and context information in addition to the original event. In general, Lambda Destinations are recommended over a DLQ. Failure handling for Event Source Mapping (SQS, Kinesis, DDB Streams) must be configured separately, and `ReportBatchItemFailures` supports partial batch success.

---

## 📝 Practice Questions

**Question 1.** A Lambda function normally handles only a small number of requests, but every day at 9 AM hundreds of users connect at the same time and cold starts cause it to violate the response latency SLA. What is the best solution?

A) Set Reserved Concurrency high to block interference from other functions
B) Configure Provisioned Concurrency and scale up at 8:55 AM with Application Auto Scaling
C) Raise the Lambda function's memory to the maximum (10GB) to shorten initialization time
D) Migrate the Lambda function to EC2

**Answer: B**
Provisioned Concurrency prepares warm execution environments in advance, making the cold start 0ms. With Application Auto Scaling, you can automatically increase Provisioned Concurrency at 8:55 AM and reduce it after the peak. Reserved Concurrency (A) is for isolation and does not fix cold starts. Increasing memory (C) reduces cold start time but is not a fundamental fix.

---

**Question 2.** You are providing an API to external SaaS partners. You must limit each partner to 10,000 requests per month, block requests when the limit is exceeded, and provide a per-partner usage dashboard. What is the best API Gateway type and feature?

A) HTTP API + Lambda Authorizer
B) REST API + Usage Plan + API Key
C) WebSocket API + $connect handler
D) HTTP API + JWT Authorizer

**Answer: B**
API Keys and Usage Plans are features unique to REST API. In a Usage Plan you set Throttle (requests per second limit) and Quota (total requests per period limit), and associate them with per-partner API Keys. A Usage Plan also provides per-partner usage tracking data. HTTP API (A, D) does not support API Keys and Usage Plans. WebSocket (C) is for real-time two-way communication.

---

**Question 3.** In an order processing system, three steps (payment charge, inventory deduction, shipping request) must run in order. The payment charge must run exactly once, and if any step fails, the previous steps must be canceled (refund, inventory restoration). What is the best architecture?

A) SQS FIFO → Lambda chain → each Lambda synchronously invokes the next Lambda
B) Step Functions Standard + Saga pattern (compensating transactions with Retry + Catch)
C) Step Functions Express (high throughput, cost-effective)
D) EventBridge event chain (each service publishes and subscribes to events)

**Answer: B**
Exactly-once guarantee for the payment charge → Step Functions Standard (exactly-once, not at-least-once). Compensating transactions on failure (refund, inventory restoration) → Saga pattern (Catch + compensating transaction states). Express (C) is at-least-once, so the payment could run more than once. An SQS Lambda chain (A) makes exact execution order and compensating transaction management complex. An EventBridge chain (D) makes tracking execution state and compensation difficult.

---

**Question 4.** You are building a real-time collaborative document editing service. When multiple users edit the same document, one user's changes must be delivered to the other users immediately. What is the best AWS architecture?

A) REST API Gateway + client polling (checking for changes every second)
B) API Gateway WebSocket + Lambda (store the connectionId in $connect, push to all connections on change)
C) AppSync GraphQL + Subscription
D) SNS + client HTTP Long Polling

**Answer: C or B**
AppSync GraphQL Subscription (C) provides managed real-time WebSocket connections and can automatically push DynamoDB changes to clients. It requires little infrastructure management and integrates GraphQL queries with real-time. API Gateway WebSocket (B) is also valid, but you must implement connectionId management and push logic yourself. Polling (A, D) is not real-time and generates many unnecessary requests.

---

**Question 5.** You deploy an ECS Fargate service in a private subnet, and the containers must pull images from ECR without internet access. What components are required?

A) Just set up a NAT Gateway and access ECR over the internet
B) Set up only the `com.amazonaws.region.ecr.dkr` VPC Endpoint
C) `ecr.api` Interface Endpoint + `ecr.dkr` Interface Endpoint + S3 Gateway Endpoint
D) Use the ECR Public Registry and access it without VPC Endpoints

**Answer: C**
Private VPC access to ECR requires all three Endpoints. `ecr.api` is for ECR API calls (authentication, image metadata), `ecr.dkr` is for transferring Docker image layers, and the S3 Gateway Endpoint is required because ECR stores image layers in S3. If any one is missing, image pulls fail. A goes over the internet, so it does not meet the requirement.

---

**Question 6.** In an EKS cluster, the payment service Pod must access only Secrets Manager, and the log collection Pod must access only CloudWatch. When the two Pods run on the same node, how do you grant IAM permissions per Pod?

A) Grant both permissions to the EC2 node Instance Profile
B) Set an IAM access key in each Pod's environment variables
C) Use IRSA to attach a separate IAM Role to each Pod's Service Account
D) Store IAM credentials in a Kubernetes Secret

**Answer: C**
IRSA lets each Pod use an independent IAM Role through an OIDC token. Even on the same node, each Pod has only the permissions of the Role attached to its own Service Account. A gives every Pod on the same node both permissions, violating least privilege. B and D risk credential exposure and do not auto-rotate.

---

**Question 7.** One million new files are uploaded to an S3 bucket every night. Each file must be processed independently and the results stored in DynamoDB, and if the processing failure rate exceeds 5%, the entire job must stop and send a notification. What is the best architecture?

A) EventBridge schedule → Lambda (sequential processing)
B) S3 event → SQS → Lambda (parallel processing, 1 million)
C) Step Functions Standard + Distributed Map (ToleratedFailurePercentage=5)
D) AWS Batch + ECS Fargate

**Answer: C**
Step Functions Distributed Map runs up to 10,000 parallel child workflows and can take an S3 file listing directly as input. With `ToleratedFailurePercentage=5`, the whole execution is treated as failed when the failure rate exceeds 5%, and you can trigger a notification through CloudWatch Events. A processes sequentially, so 1 million files takes far too long. B, SQS + Lambda, is also possible, but controlling a failure rate threshold is complex. D suits batch computing, but you would have to implement the failure rate control logic yourself.

---

**Question 8.** In an insurance claims processing system, when a customer submits a claim, a reviewer must approve or reject it within 5 business days. If the reviewer does not respond, an escalation email must be sent. What is the best way to implement this workflow?

A) SQS + Lambda (check the DLQ every 5 days)
B) Step Functions Standard + waitForTaskToken + HeartbeatSeconds (5 days) + Catch (States.HeartbeatTimeout → escalation)
C) Run a notification Lambda 5 days later with EventBridge Scheduler
D) Step Functions Express + waitForTaskToken

**Answer: B**
waitForTaskToken is a pattern for waiting on a response from an external system or a person. Step Functions Standard can wait up to 1 year (Express has a 5-minute limit, so D is wrong). If you set `HeartbeatSeconds` to 5 business days, a `States.HeartbeatTimeout` error occurs when there is no response, and `Catch` invokes the escalation Lambda. A requires complex 5-day interval polling and makes state management difficult. C is simple but cannot track workflow state.

---

**Question 9.** A startup is launching its initial service, and a backend team of 3 with no Kubernetes experience wants to deploy a container-based API server. Fast launch and minimal operational burden are the priorities. What is the best combination of services?

A) EKS + Managed Node Groups + Helm
B) ECS + Fargate + ALB
C) ECS + EC2 Launch Type + ASG
D) EKS + Fargate Profiles

**Answer: B**
ECS has a simpler conceptual model than Kubernetes, and Fargate removes the need for node management. Integrating ALB with the ECS Service makes traffic distribution and automatic scaling easy to set up. A and D have a Kubernetes learning curve. C requires managing EC2 nodes (ASG) directly, which is a heavy operational burden.

---

**Question 10.** A fintech company provides a multi-tenant API. Each tenant has its own DynamoDB table and S3 bucket, and the Lambda function must access only the correct resources for each tenant. In addition, Lambda cold starts must be prevented to minimize API response latency. What is the best design?

A) Deploy a separate Lambda function per tenant + configure Provisioned Concurrency on each function
B) A single Lambda function + pass the tenant ID through environment variables + access DynamoDB through an EC2 Instance Profile + Provisioned Concurrency
C) A single Lambda function + switch to a per-tenant IAM Role at runtime with STS AssumeRole + Provisioned Concurrency
D) Deploy a per-tenant ECS Fargate service + isolate with Task Roles

**Answer: C**
In a single Lambda function, identify the tenant from the API Key or JWT claims, then fetch the per-tenant IAM Role with STS `AssumeRole` and access only that tenant's DynamoDB and S3. Provisioned Concurrency prevents cold starts. A becomes thousands of Lambda functions if there are hundreds to thousands of tenants, which is unmanageable. In B, the Instance Profile can access every tenant's resources, so isolation fails. D, a Fargate service per tenant, is very costly.

---

**Question 11.** A Lambda function is invoked asynchronously to process images. You must capture the events for images that failed processing and reprocess them, and for successfully processed images start a downstream pipeline on a separate EventBridge bus. What is the best configuration?

A) Configure a DLQ (Dead Letter Queue) as SQS to handle only failed events
B) Configure Lambda Destinations: success → EventBridge, failure → SQS
C) Inside the Lambda, use try/catch to call EventBridge put-events on success and SQS send-message on failure
D) Analyze failure patterns with CloudWatch Logs Insights and reprocess manually

**Answer: B**
Lambda Destinations can handle both success and failure. On success it starts the downstream pipeline through EventBridge, and on failure it puts the event in an SQS reprocessing queue. A DLQ (A) handles only failures and cannot set a success target. C is possible, but infrastructure routing logic ends up in the application code, making it complex to manage. D is not automated.

---

**Question 12.** A company is optimizing its AWS serverless services and is reviewing the following workloads: (1) 50,000 order status lookups per second (each lookup completes within 3 seconds), (2) 100 large report generations per month (each report takes 20 minutes). If you use Step Functions, which type should you use for each?

A) (1) Standard, (2) Standard
B) (1) Express, (2) Standard
C) (1) Express, (2) Express
D) (1) Standard, (2) Express

**Answer: B**
(1) Order status lookup: high throughput of 50,000 per second + completes within 3 seconds → Express (supports 100K req/s, the 5-minute limit is sufficient, and execution-count billing is cheaper than Standard at high throughput). (2) Report generation: takes 20 minutes → exceeds Express's 5-minute maximum → Standard is required. Standard can run for up to 1 year and suits tracking report completion. D (Standard + Express) tries to handle the 20-minute report with Express, which exceeds the limit and errors out.

---
