# Day 5 - Week 8 Comprehensive Review: Running Entire CI/CD Pipeline Head-to-Toe

At the start of this week, "five Code* services" felt overwhelming. By week's end, five services reveal themselves as five steps in one flow. CodeCommit receives code, CodeBuild builds it, CodeDeploy deploys it, CodePipeline connects them all, Elastic Beanstalk abstracts everything at once. Running through this flow seamlessly in your head means DVA-C02's CI/CD domain is essentially conquered.

This article is not mere recap. **Deep comparison of each service revisited**, **week's trickiest traps lined up**, and **12 real-exam scenario questions** for verification. Final check is not "get answer right" but "can you explain why other options fail?"

## Five Services' Essence in One Line

Understanding each service's core problem-solving goal in one line clarifies why each exists.

| Service | Problem Solved | Core Abstraction |
|---------|-------------|------------|
| **CodeCommit** | "Enterprise-compliant IAM-integrated Git hosting" | Repository = IAM resource |
| **CodeBuild** | "Finish CI with one buildspec, no build infrastructure management" | Build = ephemeral container |
| **CodeDeploy** | "Break deployment's danger into small steps with validation" | Deploy = lifecycle hooks |
| **CodePipeline** | "Auto-connect tools in sequence with conditions" | Pipeline = stage + action |
| **Elastic Beanstalk** | "Auto-configure full infrastructure from code alone" | Environment = CloudFormation stack |

> 💡 **Related theory**: These five services' separation is system-level "Single Responsibility Principle" application. Rather than monolithic everything, each owns one responsibility, connects via well-defined interfaces (IAM, S3 artifacts, EventBridge). This enables using any service standalone (CodeBuild without CodePipeline, deploy via GitHub Actions).

## 25 Most Confusing Concept Pairs

Most-frequently-mixed concept pairs throughout this week, lined up for final verification.

| A | B | Critical Difference |
|---|---|----------|
| CodeCommit | GitHub | IAM integration vs OAuth/PAT |
| CodeCommit Triggers | Notifications | SNS/Lambda vs AWS Chatbot(Slack/Chime) |
| buildspec.yml | appspec.yml | CodeBuild build definition vs CodeDeploy deploy |
| install | pre_build | Runtime/dependency install vs pre-build work (test, auth) |
| build | post_build | Main build vs post-build cleanup/push |
| `variables` | `parameter-store` | Plaintext vs SSM SecureString(KMS) |
| `parameter-store` | `secrets-manager` | Manual rotation vs automatic |
| BUILD_GENERAL1_* | BUILD_LAMBDA_* | EC2 container vs Firecracker microVM |
| Cache LOCAL | Cache S3 | Host reuse only vs permanent sharing |
| In-Place | Blue/Green | Same instance file replace vs new environment |
| AllAtOnce | OneAtATime | Fast/risky vs slow/safe |
| Canary | Linear | 10% pause then 100% vs gradual increase |
| ApplicationStop | ApplicationStart | Previous revision script vs current revision |
| ValidateService | AfterAllowTraffic | In-Place validation vs Blue/Green post-shift |
| EC2 CodeDeploy | ECS CodeDeploy | In-Place or B/G vs Blue/Green only |
| ECS rolling | ECS CodeDeploy B/G | ECS service itself vs CodeDeploy orchestration |
| Pipeline V1 | V2 | Simple stage/action vs variables+filtering+modes |
| SUPERSEDED | QUEUED | New run cancels old vs ordered execution |
| runOrder same | runOrder different | Parallel vs sequential |
| Source category | Invoke category | Fetch code vs execute function |
| Manual Approval | Lambda Invoke validation | Person decision vs automatic |
| Beanstalk Rolling | Immutable | Same ASG sequential vs new ASG wholesale |
| Beanstalk Web | Worker | ALB+HTTP vs SQS Daemon+background |
| .ebextensions | .platform | AL1 traditional vs AL2/AL2023 recommended |
| Beanstalk Blue/Green | Traffic Splitting | Manual URL swap vs ALB weighted auto |

## Week's 20 Key Traps

Frequent exam traps lined up individually; each is standalone testable.

1. **CodeCommit stopped new signups July 2024** — yet still appears on exams
2. **Git Credentials separate from console password** — separate issuance required
3. **Credential Helper generates new SigV4 per git operation** — EC2 profile auto-auth
4. **CodeBuild fresh container per build** — startup 10-30s, LOCAL cache host-reuse only
5. **`variables` is plaintext** — `secrets-manager` for true secrets
6. **Docker in CodeBuild needs `privileged: true`** — DinD pattern
7. **CodeBuild VPC mode adds +30s startup** — internet outbound gone, endpoints required
8. **post_build runs even on build failure** — check `CODEBUILD_BUILD_SUCCEEDING` to branch
9. **exported-variables flow to pipeline** — `#{BuildVariables.X}` syntax
10. **EC2 CodeDeploy needs Agent** — Lambda/ECS don't
11. **ECS is Blue/Green only with CodeDeploy** — no In-Place
12. **ApplicationStop runs previous revision script** — new script applies next deploy
13. **AllAtOnce "success" = 1+ instance success** — availability separate concern
14. **Canary vs Linear: one jump vs gradual** — core Lambda deploy distinction
15. **Lambda hooks must report status via API** — no report = 1hr timeout
16. **Pipeline V2 filtering CodeStar-only** — CodeCommit uses EventBridge
17. **Artifact bucket must match pipeline region** — cross-region needs separate buckets
18. **Manual Approval 7-day auto-reject** — immutable timeout
19. **Beanstalk RDS inside = deletes together** — production RDS external mandatory
20. **Worker has no ALB** — SQS Daemon direct to app

## DVA-C02 Five Deep-Dive Topics

Topics frequently appearing with depth beyond surface mention.

### 1. Firecracker and Lambda Compute Isolation

BUILD_LAMBDA compute type (late 2023) runs builds on Firecracker microVM — AWS open-sourced KVM-based monitor (2018) achieving sub-100ms boot and 5MB memory footprint. Different from Docker's namespace + cgroup (kernel shared) — Firecracker's KVM (each VM owns kernel) provides hardware-level isolation. Why Lambda internally isolates customers' code safely on shared hosts.

### 2. DynamoDB Partition and Hot Partition Handling

CodeBuild saving results to DynamoDB, Lambda + DynamoDB common combination — hot partition problems appear on exams. DynamoDB distributes by partition key hash, but all writes to one partition key throttle that partition. Solutions: ① write sharding (append suffix) ② Adaptive Capacity on ③ partition key redesign.

### 3. API Gateway and SigV4

API Gateway with IAM auth requires all requests SigV4-signed. CodeBuild calling API Gateway automatically signs (boto3/aws-sdk handles). Lambda to API Gateway scenarios common on exam.

### 4. SQS at-least-once and Beanstalk Worker

Beanstalk Worker's SQS Daemon exposes SQS **at-least-once delivery** to application directly. Same message processes 2+ times possible; application must ensure idempotency. Message ID/deduplication ID in DynamoDB standard pattern.

### 5. X-Ray Sampling and CI/CD Cost

Application with X-Ray instrumentation during build; sampling rule matters for cost. Default: "1 request/second + 5% additional sampling." When "X-Ray cost reduction" appears, sampling rule tuning is answer.

## Full CI/CD Flow End-to-End

All services together in production-grade CI/CD.

```
[Developer] git push origin feature/new-api
              │
              ▼
[CodeCommit (or GitHub via Code Connection)]
              │
              │ EventBridge immediate trigger
              ▼
[CodePipeline V2 "myapp-pipeline"]
   │
   ├── Stage 1: Source
   │     Action: CodeCommit Source (output: SourceOutput)
   │
   ├── Stage 2: Validate (parallel, runOrder=1)
   │     Action A: CodeBuild "lint" (input: SourceOutput)
   │     Action B: CodeBuild "security-scan" (Snyk, Bandit)
   │     Action C: CodeBuild "unit-test" (output: TestReport)
   │
   ├── Stage 3: Build
   │     Action: CodeBuild "build"
   │             - install: nodejs 20, docker
   │             - pre_build: ECR login, IMAGE_TAG export
   │             - build: docker build & push to ECR
   │             - post_build: imagedefinitions.json
   │             (output: BuildOutput with imagedefinitions.json)
   │
   ├── Stage 4: Deploy-Staging
   │     Action: ECS CodeDeploy Blue/Green
   │             - Deploy Green tasks with new definition
   │             - Smoke test via ALB Test Listener
   │             - Production Listener swap
   │             - Keep Blue 5min for rollback insurance
   │
   ├── Stage 5: Integration Test
   │     Action: CodeBuild "integration-test"
   │             - Staging endpoint Postman/Pytest
   │
   ├── Stage 6: Manual Approval
   │     Action: Manual Approval
   │             - SNS → Slack via Chatbot
   │             - 7-day timeout
   │
   └── Stage 7: Deploy-Production
         Action: ECS CodeDeploy Blue/Green
                 - Lambda hook BeforeAllowTraffic: contract test
                 - Canary 10% 10min → 100%
                 - CloudWatch Alarm violation triggers auto-rollback
```

> 📚 **Case study**: Airbnb 2019 InfoQ presentation shared CI/CD evolution. Started Jenkins monolith → microserviced per-team pipelines → standardized "deploy board" abstraction. Lesson: pipeline itself too diverse = operational burden, standardized template essential. AWS CodePipeline + CloudFormation achieves this — CFN pipeline template reusable, all new services inherit same structure.

## Three Cloud Equivalents Mapping

| AWS | GCP | Azure |
|-----|-----|-------|
| CodeCommit | Cloud Source Repositories | Azure Repos |
| CodeBuild | Cloud Build | Azure Pipelines (Build) |
| CodeDeploy | (Coming, Cloud Deploy in progress) | Azure Pipelines (Release) |
| CodePipeline | Cloud Build triggers + Cloud Deploy | Azure Pipelines |
| Elastic Beanstalk | App Engine / Cloud Run | Azure App Service |
| CodeArtifact | Artifact Registry | Azure Artifacts |

> 💡 **Related theory**: GCP started unified (Cloud Build) then split deploy. Azure has awkward GitHub Actions + Azure Pipelines coexistence. AWS separates four tools, CodePipeline glues them — "each tool value standalone, combined synergy" philosophy vs others.

## Wrapping Up

CI/CD's not mystical. Core: "release steps manual once, then automatic thereafter" — that one promise through five services. Each service owns one responsibility, well-defined interfaces connect them.

DVA-C02 pre-exam checkpoint: ① five services' 1-line role mapping ② CodeDeploy strategies' trade-offs ③ Lambda deploy 9 pre-defined configs ④ Beanstalk 6 deployment strategies ⑤ V2 pipeline features. Explain all five in 30 seconds = 80% exam coverage achieved.

Next week, data security axis begins — IAM, KMS, Secrets Manager, DynamoDB encryption — DVA-C02's other core pillar.

---

## 📝 12 Comprehensive Scenario Practice Questions

**문제 1.** A fintech company needs ① security scan (Snyk) ② unit tests ③ lint **in parallel** in one stage, all **must pass** before next stage. CodePipeline config?

A) Separate stages sequentially
B) One stage, runOrder 1, 2, 3
C) One stage, runOrder 1 for all
D) Separate pipelines, aggregate via EventBridge

**정답: C**

해설: Same `runOrder=1` in one stage = parallel execution, all must succeed for stage success. A) Separate stages always sequential. B) Different runOrder = sequential (1→2→3). D) Separate pipelines don't provide unified pass gate. Parallel validation in one stage is C.

---

**문제 2.** Lambda payment function, **10% traffic 10min then 100%**, CloudWatch `ErrorRate > 1%` auto-rollback. Best config?

A) `LambdaCanary10Percent10Minutes` + Auto Rollback DEPLOYMENT_STOP_ON_ALARM
B) `LambdaLinear10PercentEvery1Minute` + Auto Rollback DEPLOYMENT_FAILURE
C) `LambdaAllAtOnce` + post-monitoring
D) `LambdaCanary10Percent5Minutes` + Manual Approval

**정답: A**

해설: "10% 10min then switch" = Canary exact match. Auto-rollback on Alarm = DEPLOYMENT_STOP_ON_ALARM. B) Linear is gradual increase ≠ "then switch," DEPLOYMENT_FAILURE doesn't trigger on Alarm. C/D don't match requirements. Canary + Alarm combo is answer.

---

**문제 3.** ECS Fargate Blue/Green CodeDeploy. Which is NOT mandatory?

A) ECS service deploymentController.type = CODE_DEPLOY
B) ALB 2 Target Groups + 2 Listeners
C) appspec.json with TaskDefinition + LoadBalancerInfo
D) Fargate task container has CodeDeploy Agent sidecar

**정답: D**

해설: ECS handles everything, Agent unnecessary. A/B/C all mandatory. D always trap — "ECS + Agent" almost always wrong answer on exam.

---

**문제 4.** CodeBuild accessing private subnet Aurora, currently fails. Solution?

A) Make Aurora public
B) VPC mode + subnet + security group + ECR/S3/Secrets endpoint
C) Lambda wrapper
D) Manual EC2 bastion run

**정답: B**

해설: VPC mode enables private access. Trade-off: startup +30s, internet outbound gone, each service needs endpoint. A) Public is insecurity. C) Unnecessary complexity. D) Defeats automation. VPC mode + endpoints is standard.

---

**문제 5.** Beanstalk production downtime-free, fastest rollback, capacity never drops, 2x cost OK. Strategy?

A) Rolling
B) Rolling with Additional Batch
C) Immutable
D) All at once

**정답: C**

해설: Immutable meets all: no downtime ✓, fast rollback (delete new ASG) ✓, capacity maintained (old ASG untouched) ✓, 2x cost (temp) ✓. A) Capacity drops. B) Rollback is redeploy. D) Has downtime. Immutable satisfies all four.

---

**문제 6.** Source account pipeline → Prod account ECS. Mandatory?

A) Source pipeline role sts:AssumeRole → Prod role
B) Prod CrossAccountDeployRole trusting Source
C) Artifact CMK cross-account policy
D) Artifact bucket policy Prod read
E) ECS container CodeDeploy Agent

**정답: A, B, C, D (exclude E)**

해설: Cross-account chain A+B+C+D all essential. E) ECS never needs Agent. Missing any one breaks deployment. Four-part chain is standard cross-account pattern.

---

**문제 7.** Beanstalk Worker SQS messages occasionally **process twice**. Root cause and fix?

A) SQS at-least-once is normal; application must idempotency-check
B) Beanstalk SQS Daemon bug
C) ASG over-scaled
D) Set visibility timeout 0

**정답: A**

해설: SQS Standard delivers at-least-once; Daemon passes to application unchanged. Application must detect duplicate (message ID in DynamoDB). B) Not bug. C) Unrelated. D) Makes duplication worse. Idempotency on application side is answer.

---

**문제 8.** Pipeline fails on production deploy; auto-create JIRA incident. Best pattern?

A) CodeStar Notifications → Slack → manual JIRA
B) EventBridge (FAILED detection) → Lambda → JIRA REST API
C) CloudWatch Logs Insight 5min polling
D) Console JIRA integration

**정답: B**

해설: "Complex conditional automation" = EventBridge + Lambda standard. A) Manual step. C) Polling inefficient. D) No console option. EventBridge + Lambda is event-driven automation pattern.

---

**문제 9.** CodeBuild IMAGE_TAG dynamic value → CodeDeploy in next stage. Mechanism?

A) buildspec.yml `env.variables`
B) buildspec.yml `env.exported-variables` → `#{BuildVariables.IMAGE_TAG}`
C) DynamoDB store/retrieve
D) S3 file pass

**정답: B**

해설: `exported-variables` standard inter-stage variable passing. Build exports → pipeline captures → deploy references. A) Static only. C/D) Possible but extra overhead. Exported-variables is standard.

---

**문제 10.** EC2 fleet 100, deployment + CloudWatch `ErrorRate > 5%` alarm. Auto-rollback setup?

A) AlarmConfiguration + DEPLOYMENT_STOP_ON_ALARM in AutoRollbackConfiguration.Events
B) CloudWatch directly CodeDeploy API
C) Lambda on alarm
D) ASG health check type ELB

**정답: A**

해설: Two settings required: ① alarm registered ② auto-rollback event triggered on alarm. B) CloudWatch can't call CodeDeploy API. C) Manual complexity. D) Unrelated. Both settings together = auto-rollback answer.

---

**문제 11.** Beanstalk environment external RDS, auto-rotate password 30-day. Setup?

A) .ebextensions plaintext, manual update
B) Secrets Manager auto-rotation, application fetches via SDK
C) S3 file rotation
D) Hardcode in user data

**정답: B**

해설: Secrets Manager native auto-rotation + Lambda. Application dynamic fetch via SDK = new password instant use. A) Plaintext, manual. C) Rotation hard to automate. D) Rotation impossible. Secrets Manager auto-rotate + SDK fetch is pattern.

---

**문제 12.** CodeBuild Java unit test results (JUnit XML) visualization in console?

A) `artifacts.files` + artifact name
B) `reports` section, file-format JUNITXML
C) `cache.paths` LOCAL_CUSTOM_CACHE
D) `env.exported-variables` JUNIT_XML

**정답: B**

해설: `reports` section processes tests separately, console visualizes. JUnit, Cucumber, TestNG, NUnit, Visual Studio TRX supported. A) Artifacts = general output. C) Cache is dependency. D) Variables = passing values. Reports section is test visualization.

```yaml
reports:
  jest_reports:
    files:
      - 'junit.xml'
    file-format: JUNITXML
    base-directory: 'test-results'
```
