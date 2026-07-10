# Day 4 - Final Review 4: Messaging, Containers, Architecture Patterns

📅 Date: August 12, 2026 (Wednesday)  
🎯 Topic: Final Review of Messaging/Containers + Architecture Patterns  
⏱️ Study Time: Approximately 120 minutes

---

## 🎯 Learning Objectives

- Complete final review of Messaging, Containers, and Architecture Patterns
- Solve scenario-based architecture selection questions

---

## 📖 Final Core Summary

### Messaging Service Selection Guide
```
SQS Standard: High throughput, no order/duplicate guarantee
SQS FIFO: Order guaranteed, deduplication, 300/second
SNS: Push, multiple subscribers simultaneously, fan-out pattern
Kinesis Streams: Real-time streaming, multiple Consumers, 24 hour retention
Kinesis Firehose: ETL, S3/Redshift/OpenSearch, 1 minute delay
Step Functions: Workflow orchestration, retry/parallel
AppSync: GraphQL, real-time subscriptions, offline support
```

### Core Numbers
```
SQS: 256KB, 14 days, FIFO 300/s, VisibilityTimeout 30sec
Kinesis: Shard 1MB/s write, 2MB/s read, 24 hour default retention
SNS: Multiple subscription targets, Push method
```

### Container/IaC Core Memory Anchors
```
ECS Fargate: Serverless, awsvpc mode
executionRole: ECR pull, CloudWatch Logs
taskRole: Container app access to AWS services
ECR: Vulnerability scan, lifecycle policy
CloudFormation: Change Set (review), !ImportValue (cross-stack)
SAM: Transform required, sam local (Docker needed)
CDK: Programming language → CloudFormation conversion
```

---

## Architecture Pattern Summary

```
Pattern 1: Serverless REST API
================================
[Client] → [API Gateway] → [Lambda] → [DynamoDB]
                                    ↘ [ElastiCache]
Auth: Cognito Authorizer

Pattern 2: Event-Driven Async Processing
================================
[Service A] → [SQS] → [Lambda B]
                  ↘ (on failure) [DLQ]

Pattern 3: Fan-Out
================================
[S3 Upload] → [SNS] → [SQS1] → [Lambda: Resize]
                    → [SQS2] → [Lambda: Analyze]
                    → [Lambda: Notify]

Pattern 4: Streaming Pipeline
================================
[Data Source] → [Kinesis Streams] → [Lambda: Real-time]
                                  → [Firehose] → [S3]

Pattern 5: Full CI/CD
================================
[Git Push] → [CodePipeline]
  → [CodeBuild: Test/Build]
  → [Manual Approval]
  → [CodeDeploy: Deploy]
     (Canary for Lambda, Blue/Green for EC2)
```

---

## 🧠 Scenario → Answer Mapping (Core Exam Patterns)

### Messaging Scenario → Service

| Scenario | Answer |
|----------|--------|
| "Async job queue, decoupling" | **SQS Standard** |
| "Exactly once, in order" | **SQS FIFO** |
| "Simultaneous notification to multiple systems" | **SNS** |
| "S3 → multiple Lambda" | **SNS fan-out** or **EventBridge** |
| "Real-time clickstream collection" | **Kinesis Data Streams** |
| "Stream → S3 automatically" | **Kinesis Firehose** |
| "Kafka compatible" | **MSK** |
| "Complex multi-step workflow" | **Step Functions Standard** |
| "Fast workflow within 5 min" | **Step Functions Express** |
| "GraphQL + real-time subscriptions" | **AppSync** |
| "1-year workflow" | **Step Functions Standard** |
| "Wait for external system response" | **.waitForTaskToken** |
| "Keep Kinesis data 365 days" | Retention setting or Firehose → S3 |
| "Lambda idempotent processing" | DDB idempotency or SQS FIFO dedup |

### Container·IaC Scenario

| Scenario | Answer |
|----------|--------|
| "Containers without EC2" | **Fargate** |
| "Cost-reduced containers" | **Fargate Spot** |
| "Kubernetes standard" | **EKS** |
| "On-premises ECS" | **ECS Anywhere** |
| "ECS → S3 permission" | **taskRole** |
| "ECR pull permission" | **executionRole** |
| "Safe CFN update" | **Change Set** |
| "CFN resource protection" | **DeletionPolicy: Retain** |
| "Multi-account IaC deployment" | **Stack Set** |
| "Reusable CFN" | **Nested Stack** |
| "SAM local serverless" | `sam local invoke` + Docker |
| "Programming language IaC" | **CDK** |
| "Lambda Canary deployment" | **CodeDeploy + SAM/CodePipeline** |

### Data·DB Scenario

| Scenario | Answer |
|----------|--------|
| "Relational + auto-rotate credentials" | RDS + Secrets Manager |
| "NoSQL + microsecond cache" | DynamoDB + **DAX** |
| "File sharing across multiple EC2" | **EFS** |
| "High-performance ephemeral disk" | Instance Store |
| "Global active-active DB" | **Aurora Global** or **DDB Global Tables** |
| "S3 auto PII detection" | **Macie** |
| "S3 100M objects batch" | S3 Batch Operations |
| "Clean old S3 objects" | Lifecycle Policy |
| "CRR + KMS" | **Multi-Region Key** |
| "One source, various views" | **S3 Object Lambda** |
| "Different permissions per team" | **S3 Access Points** |

### Security Scenario

| Scenario | Answer |
|----------|--------|
| "Auto rotate DB password" | **Secrets Manager** |
| "Encrypt 100KB data with KMS" | **Envelope Encryption** |
| "Auto JWT validation (REST API)" | **Cognito Authorizer** |
| "Auto JWT validation (HTTP API)" | **JWT Authorizer** |
| "External JWT (Auth0/Okta)" | **Lambda Authorizer** or JWT Authorizer (HTTP API) |
| "Defend SQL injection" | **WAF** |
| "DDoS cost protection" | **Shield Advanced** |
| "Force S3 HTTPS" | `aws:SecureTransport=false` Deny |
| "Direct SSL cert on EC2" | ACM not possible — external cert |
| "Multi-account guardrails" | **SCP (Organizations)** |
| "Max delegatable permission to user" | **Permissions Boundary** |
| "Prevent Confused Deputy" | **ExternalId** |

### Monitoring·Debug Scenario

| Scenario | Answer |
|----------|--------|
| "Which service is slow?" | **X-Ray** |
| "Query slow analysis" | **Performance Insights** (RDS) |
| "EC2 memory monitoring" | **CloudWatch Agent** |
| "Root login instant detect" | CloudTrail → EventBridge → SNS |
| "24/7 API availability monitor" | **Synthetics** |
| "Log pattern → alarm" | **Metric Filter** |
| "ML-based anomaly detection" | **Anomaly Detection** |
| "Multi-account unified dashboard" | **Cross-Account Dashboard** |
| "API GW Latency vs IntegrationLatency gap large?" | API GW own latency |

### Cost Optimization Scenario

| Scenario | Answer |
|----------|--------|
| "Predictable EC2" | **Reserved** or **Savings Plan** |
| "Fault-tolerant + 90% savings" | **Spot** |
| "ARM compatible + 40% savings" | **Graviton** |
| "SSE-KMS cost ↑" | **S3 Bucket Key** |
| "DDB throttle + cost savings" | **DAX** + proper RCU |
| "Lambda cold start free" | **SnapStart** (Java/Python/.NET) |
| "API GW cost savings" | **HTTP API** |
| "S3 very infrequent access" | **Glacier Deep Archive** |
| "Low EBS usage with data retention" | **gp3** (20% ↓ vs gp2) |

---

## 📝 Final Mock Exam - Part 4

**문제 1.** Collect click events from millions of users in real-time and analyze in multiple systems?

A) SQS  
B) SNS  
C) Kinesis Data Streams  
D) EventBridge  

**정답: C** - Kinesis Data Streams supports high-volume real-time streaming with multiple simultaneous Consumers.

---

**문제 2.** Microservice A processes asynchronously without waiting for B's response?

A) Lambda A synchronously calls Lambda B  
B) Lambda A → SQS → Lambda B  
C) Direct API Gateway connection  
D) Data sharing through DynamoDB  

**정답: B** - SQS async communication loosely couples services so Lambda A doesn't wait for response.

---

**문제 3.** ECS task retrieves password from Secrets Manager during execution?

A) Add permission to executionRoleArn  
B) Add permission to taskRoleArn  
C) Hardcode in environment variable  
D) Inject via CloudFormation parameter  

**정답: B** - taskRole is for container app code to access AWS services.

---

**문제 4.** Process payment → send email → update inventory in sequence with retry on failure?

A) SQS chain  
B) Lambda chain (direct Lambda calls)  
C) Step Functions  
D) Kinesis  

**정답: C** - Step Functions manages sequential execution, error handling, and auto-retry visually.

---

**문제 5.** Manage VPC separately and reference from other CloudFormation stacks?

A) Manually pass VPC ID as parameter  
B) Export from Outputs and reference with !ImportValue  
C) Include all in same stack  
D) Cross-stack reference not possible  

**정답: B** - Export name in Outputs section, then !ImportValue in other stack.

---

**문제 6.** Handle S3 upload for image resize, metadata analysis, admin notification simultaneously?

A) Set S3 event directly to each Lambda  
B) S3 → SNS → multiple SQS → each Lambda  
C) S3 → Kinesis → Lambda  
D) S3 → EventBridge → 3 Lambda  

**정답: B or D** - Fan-out pattern. Either SNS to multiple SQS (B) or EventBridge to multiple Lambda (D).

---

**문제 7.** Deploy new Beanstalk version without downtime, safest strategy?

A) All at once  
B) Rolling  
C) Immutable  
D) Blue/Green  

**정답: C** - Immutable deploys new version to new ASG, validates, then swaps — safest.

---

**문제 8.** What is actually created when CDK app is deployed?

A) Terraform plan  
B) CloudFormation stack  
C) ECS task  
D) Lambda layer  

**정답: B** - CDK converts code to CloudFormation template and creates CloudFormation stack on `cdk deploy`.

---

## 📌 Today's Summary

1. SQS (queue/async) vs SNS (fan-out/Push) vs Kinesis (streaming/multi-Consumer)
2. Step Functions: Complex workflows, retry, parallel, error handling
3. ECS: taskRole (app permission), executionRole (infrastructure permission)
4. CDK: Programming language → CloudFormation, cdk synth/deploy
5. Key Pattern: Fan-out (SNS→SQS), Async (SQS), Workflow (Step Functions)
