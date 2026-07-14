# Day 5 - Week 7 Review: Serverless CI/CD Summary

📅 Date: Week 7 (Day 5)  
Topic: Serverless Deployment Patterns and Orchestration

---

## Week 7 Core Concept Map

Week 7 covers serverless deployment patterns distinct from container orchestration. Lambda, SAM, CodeDeploy for serverless CI/CD; API Gateway, EventBridge, SQS/SNS for event-driven architecture; X-Ray, CloudWatch for observability. Unlike container platforms requiring infrastructure thinking, serverless demands traffic-switching and version management strategies.

```
Function Code Change
  ↓
SAM Build / Package
  ↓
Publish Version (immutable snapshot)
  ↓
Update Alias with Traffic Weight
  ↓
CodeDeploy Canary (10% → 50% → 100%)
  ↓
Pre/Post Traffic Hooks (Integration Tests)
  ↓
Monitor via X-Ray / CloudWatch
```

> 💡 **Serverless Deployment Philosophy**: Versions immutable; Aliases mutable pointers. Traffic shifting built-in via alias weight. Canary deployments automatic—no infrastructure switching needed.

---

## Week 7 Core Comparison Tables

### Lambda Versioning vs Containers

| Aspect | Lambda Versions | Containers (ECS/EKS) |
|--------|-----------------|-------------------|
| Deployment Model | Version (immutable) → Alias (mutable) | Rolling or Blue/Green |
| Traffic Shift | Alias weight immediate | ALB Target Group or CodeDeploy |
| Rollback | Alias point previous version | Scale previous Task group up |
| State | Stateless (timeout enforced) | Stateful allowed (long-running) |
| Cost Predictability | Pay per 100ms execution | Baseline + per-request |

### SAM vs Terraform/CloudFormation

| Aspect | SAM | Terraform | Raw CloudFormation |
|--------|-----|-----------|-------------------|
| Verbosity | Low (Lambda-optimized shortcuts) | Medium (provider-agnostic) | High (verbose) |
| Learning Curve | Low (AWS-native) | Medium (learn Terraform) | High (CloudFormation syntax) |
| AWS Feature Support | Good (evolves slower) | Excellent (faster updates) | Complete (AWS-native) |
| Portability | AWS-only | Multi-cloud | AWS-only |

### Serverless Event Sources

| Source | Use Case | Delivery |
|--------|----------|----------|
| API Gateway | HTTP requests | Synchronous |
| SQS | Decoupled queue | Event Source Mapping (polling) |
| SNS | Pub/Sub broadcasting | Push-based |
| EventBridge | Event filtering/routing | Event pattern matching |
| S3 | File operations | Event notification |
| DynamoDB Streams | Change data capture | Automatic triggers |

> 💡 **Event Source Selection Criteria**:
> - **API Gateway**: HTTP APIs needing transformation, throttling, caching
> - **SQS**: Producer-consumer decoupling, dead-letter queue
> - **SNS**: Same message multiple independent subscribers
> - **EventBridge**: Complex event filtering, cross-service routing
> - **S3**: Image processing, file archival triggered by upload

---

## Core Serverless Patterns

### 1. Canary Deployment Pattern
Version 1 (current) ← → Version 2 (canary 10% traffic)
BeforeAllowTraffic hook validates new version. On pass: increase weight. On fail: rollback automatic.

### 2. Event-Driven Workflow
S3 upload → EventBridge → Lambda → DynamoDB → SNS notification. Each service independent; asynchronous; scalable.

### 3. CQRS (Command Query Responsibility Segregation)
Command: API → SQS → Lambda writes to database
Query: API → ElastiCache/read replica reads. Separation allows independent scaling.

### 4. Lambda Layers for Shared Code
Multiple functions share common libraries without duplication. Layer versioning separate from function versioning.

---

## Week 7 vs Week 6 Deployment Comparison

| Dimension | Week 6 (Container) | Week 7 (Serverless) |
|-----------|-------------------|-------------------|
| **Versioning** | Task Definition revision | Lambda Version |
| **Traffic Shift** | ALB Target Group or CodeDeploy | Alias weight routing |
| **Orchestration** | ECS/EKS cluster state | Lambda invocation model |
| **Rollback** | Scale previous Task group | Alias revert version |
| **Complexity** | Higher (cluster, networking, compute) | Lower (function-focused) |
| **Cost Model** | Baseline + per-request | Per-100ms execution |
| **Ideal Workload** | Long-running, stateful | Event-driven, short-lived |

> 🎯 **Exam Strategy**: 
> - Container questions → focus on CALMS, DORA, orchestration tools (ECS/EKS, ArgoCD/Flux, CodeDeploy)
> - Serverless questions → focus on version/alias, canary, event sources, SAM
> - Deployment questions → "zero-downtime" → Blue/Green; "traffic gradual shift" → canary alias weight
> - Cost optimization → "compute baseline high" → containers; "pay-per-use" → serverless

---

## DOP-C02 Keyword Mapping for Week 7

| Keyword | Answer |
|---------|--------|
| "Lambda version 불변" | Publish version creates immutable snapshot |
| "Lambda 무중단 배포" | Use Alias with traffic weight |
| "Lambda 자동 롤백" | CodeDeploy canary + BeforeAllowTraffic hook |
| "Serverless infrastructure as code" | AWS SAM templates |
| "Lambda 의존성 공유" | Lambda Layers |
| "큰 Lambda 함수 (>50MB)" | Container image package type |
| "Cold start 제거" | Provisioned Concurrency |
| "단순 마이크로서비스 API" | HTTP API (비용 저렴) |
| "복잡 API 변환" | REST API (feature 풍부) |
| "Event-driven 분리" | SQS or EventBridge |
| "Pub/Sub 다중 구독자" | SNS topic |
| "분산 추적 병목 파악" | X-Ray |
| "Lambda 에러 자동 알림" | CloudWatch Metric Alarm |

---

## Real-World Scenario Summary

### Scenario 1: Startup E-commerce
Tech: API Gateway → Lambda (checkout) → DynamoDB (orders) + SNS (notification)
Deployment: SAM template → CodeDeploy canary → 10% version 2 → Monitor → 100%
Rollback: Alias reverts version 1 (seconds)

### Scenario 2: Data Pipeline
S3 upload → EventBridge → Lambda (extract) → RDS (write) → CloudWatch metric
Cost: Pay per Lambda execution; no baseline cost; scales to zero

### Scenario 3: Multi-Service Broadcast
Order service → SNS → Email notification, SMS notification, Analytics Lambda independently process
Deployment: Each subscribing Lambda has own SAM template; independent versions/aliases

---

## Critical Exam Gaps Filled This Week

✅ Lambda versioning as immutable snapshots
✅ Alias as mutable traffic pointer
✅ Canary deployment via alias weight + hooks
✅ SAM as serverless IaC (vs CloudFormation verbosity)
✅ Event sources (SQS vs SNS vs EventBridge vs S3)
✅ Provisioned Concurrency for cold-start elimination
✅ Container images for large Lambda payloads
✅ X-Ray for distributed tracing
✅ CloudWatch for cost analysis and alerting

---

## Two-Week Container + Serverless Integration Pattern

Production systems often mix container and serverless:

```
API Request → API Gateway → Lambda (validation)
             ↓
       Lambda publishes event → EventBridge
             ↓
       Event routes to: 
         • Lambda (quick processing)
         • SQS → ECS Task (heavy computation)
         • SNS → Multiple subscribers
             ↓
       Observe → X-Ray (Lambda), Container Insights (ECS), CloudWatch (both)
```

This hybrid pattern captures benefits of both: serverless for event-driven, cost-efficient paths; containers for long-running or complex workloads.

---

## Final DOP-C02 Strategy

**Weeks 1-5**: CALMS, DORA, Well-Architected Framework, DevOps fundamentals
**Week 6**: Container CI/CD (ECR, ECS, EKS) - 40% of exam
**Week 7**: Serverless CI/CD (Lambda, SAM, CodeDeploy canary) - 20% of exam
**Remaining (Weeks 8-12)**: Infrastructure, compliance, security, monitoring - 40% of exam

**Exam Approach**:
1. Scenario recognition: "Container" vs "Serverless" vs "Hybrid"
2. Deployment pattern: "Blue/Green" vs "Canary" vs "Rolling"
3. Cost model: "Baseline" vs "Usage-based"
4. Service selection: Match requirement to CALMS/DORA axis
5. Trade-offs: Complexity vs Control vs Cost

---

## Completion Checklist

**Week 7 Topics**:
- [ ] Lambda versions (immutable snapshots) vs Aliases (mutable pointers)
- [ ] SAM templates (Serverless Application Model)
- [ ] CodeDeploy canary for Lambda (traffic weight shifting)
- [ ] Pre/post-traffic validation hooks
- [ ] Lambda Layers for dependency sharing
- [ ] Container image support (>50MB) for Lambda
- [ ] Execution Role (function's AWS permissions)
- [ ] Reserved/Provisioned Concurrency
- [ ] API Gateway (HTTP vs REST)
- [ ] EventBridge (event routing/filtering)
- [ ] SQS (queue) vs SNS (pub/sub)
- [ ] X-Ray (distributed tracing)
- [ ] CloudWatch Logs Insights for cost analysis
- [ ] Custom metrics for DORA measurement

All Week 7 complete!

---

Next Steps for DOP-C02 Preparation:
- Weeks 8-10: Infrastructure security (IAM policies, KMS, Secrets Manager, VPC)
- Week 11: Compliance and audit (CloudTrail, Config, Systems Manager)
- Week 12: Full-exam simulation and review
