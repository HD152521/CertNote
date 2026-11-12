# Day 5 - Week 7 Review: Serverless CI/CD Summary

📅 Date: Week 7 (Day 5)  
Topic: Serverless Deployment Patterns and Orchestration

---

To sum up this week in a single sentence: "**CI/CD for serverless workloads has to be viewed as one bundle, from the choice of IaC tool through the deployment strategy to workflow orchestration**." The SAM (Day 1), Serverless Framework and CDK (Day 2), Lambda Version, Alias, and CodeDeploy Canary (Day 3), and Step Functions (Day 4) we covered up to yesterday are all different faces of the same picture. Scenario questions on the exam are almost always built by combining two or three tools, so the ability to match precisely where each tool shines and where it is weak is what decides whether you pass.

Today we reorganize the five core axes of this week and run a comprehensive check with 12 scenario questions that resemble real exam patterns. The goal goes beyond memorizing plain facts: it is to memorize the mapping of "which keyword in this scenario calls which answer."

## Reviewing the Five Axes

### Axis 1: Choosing an IaC Tool — Decided by Workload Character and Team Language

| Scenario keyword | Suitable tool | Reason |
|------------------|--------------|------|
| "Only Lambda + API Gateway + DynamoDB, YAML" | **SAM** | Optimizes 6 serverless resource types through a CFN Macro, low learning curve |
| "200 Lambdas, multiple stages, rich plugins" | **Serverless Framework** | Node plugin ecosystem (but review the v4 license) |
| "Lambda + EKS + RDS + OpenSearch + TS team" | **CDK** | L2 abstractions for all AWS resources + grant methods + in-house L3 library |
| "Multi-cloud (AWS+GCP+Azure)" | **Terraform** | Cloud-agnostic through the Provider model |
| "Keep CFN governance (StackSets, Drift) as is + simplify serverless" | **SAM** | Compatible with every CFN feature |
| "9,000 in-house stacks + need a standard pattern library" | **CDK** | Reusable abstractions through L3 Constructs |

### Axis 2: Lambda Deployment — The Version/Alias Model

Core proposition: **A Version is an immutable snapshot; an Alias is a mutable pointer.** It is the same idea as a Git commit/branch or a Docker image digest/tag.

```
publish-version  →  V7 (immutable, never changes)
update-alias --function-version 7  →  live points at V7
```

| Feature | Behavior |
|------|------|
| `$LATEST` | Mutable working copy, no weighted routing, no PC |
| Version number | Immutable; only the resource policy and PC can be changed |
| Alias weighted | Primary + 1 additional only (at most 2-way) |
| API Gateway integration | `${stageVariables.alias}` + `add-permission --qualifier <alias>` |
| CodeDeploy Canary | `AutoPublishAlias` + `DeploymentPreference`, one line |

### Axis 3: Cold Start Mitigation — Telling PC and SnapStart Apart Precisely

| Technique | Applicable runtimes | Cost | Effect |
|------|--------------|------|------|
| Provisioned Concurrency | All runtimes | Billed for active time | Zero cold starts (within PC capacity) |
| SnapStart | Java 11/17/21, Python 3.12+, .NET 8+ (zip only) | Free for Java, paid for Py/.NET | Init time reduced by 90% |
| Reserved Concurrency | All | Free | Concurrency limit (unrelated to cold starts) |
| ARM architecture | Compatible runtimes | 20% cheaper | Init 10-20% faster |

### Axis 4: Step Functions — Standard vs Express

| Item | Standard | Express |
|------|----------|---------|
| Duration | 1 year | 5 minutes |
| Guarantee | Exactly-once | At-least-once |
| Synchronous invocation | Not possible | Possible (StartSyncExecution) |
| TaskToken | ✅ | ❌ |
| Pricing | Per state transition | Per invocation + execution time |
| Use | Deployment workflows, human approval | API backends, IoT, ETL |

### Axis 5: The Integrated Flow — In One Picture

```
   ┌─ Source (Git) ──→ CodePipeline ──→ CodeBuild (sam build) ──→ CFN Deploy ──┐
   │                                                                                                         ↓
   │                                                                                Publish new Lambda Version V7
   │                                                                                                         ↓
   │                                                              CodeDeploy: Alias 'live' weighted (V6:90, V7:10)
   │                                                                                                         ↓
   │                                                              Wait 5 min + monitor CloudWatch Alarm
   │                                                                                                         ↓
   │                                                                            ┌─ Alarm OK → V7:100
   │                                                                            └─ Alarm → V6:100 (rollback)
   │
   └─ Complex flow → delegate to Step Functions
      ├─ AWS SDK Service Integration (call directly, without Lambda)
      ├─ TaskToken (human approval, external systems)
      └─ Distributed Map (large-scale parallelism)
```

## Easily Confused Comparisons

| A | B | Distinguishing keyword |
|---|---|----------------|
| SAM | CDK | YAML, serverless-specific vs general-purpose code, all of AWS |
| SAM | Serverless Framework | AWS-native, OSS vs multi-cloud, v4 commercial |
| Standard SFn | Express SFn | 1 year, exactly-once vs 5 minutes, at-least-once |
| Provisioned Concurrency | Reserved Concurrency | Warm-up, paid vs limit, free |
| Lambda zip | Container Image | 250MB, Layers possible vs 10GB, no Layers, no SnapStart |
| `$LATEST` | Version number | Mutable, no PC vs immutable, PC possible |
| Alias weighted | Version 100% | Canary in two steps vs All-at-once |
| Inline Map | Distributed Map | 40 concurrent, affects parent history vs 10,000 concurrent, child executions |
| `.sync` integration | `.waitForTaskToken` | Automatically waits for completion vs waits for an external callback |
| sam deploy | sam sync | Standard CFN path vs development speed-up, drift risk |

> Every comparison in this table is a classic trade-off model. System design principles such as the CAP theorem (Eric Brewer, 2000), PACELC (Daniel Abadi, 2010), and Conway's Law (1968) apply equally to IaC and workflow tools. For example, the exactly-once guarantee of Standard SFn is a consistency guarantee that gives up some availability and performance, while the at-least-once guarantee of Express is the opposite trade. Exam scenarios almost always ask "which trade-off matters more?"

> 🎯 **Scenario**: A question may appear on the exam that asks you to draw the following picture by combining this week's five tools — "Synthesize Lambda + DynamoDB + API Gateway with CDK → CodePipeline Source/Build → deploy with SAM Canary → monitor for 30 minutes → sequential multi-Region deployment with human approval through Step Functions." You may be asked which service is responsible at each step of this flow.

> A case presented at AWS Summit Seoul in 2023 by a fintech company: it ran 1,500 Lambdas with a mix of CDK and SAM. Simple serverless (API + Lambda + Dynamo) used SAM, complex infrastructure (Lambda + EKS + OpenSearch + Step Functions) used CDK, and the deployment workflow was separated out into CodePipeline + Step Functions. By matching the strength of each tool precisely, deployment time dropped by 70%. On the exam, the answer to "how do you combine several tools?" is "separate them according to each tool's strengths" — trying to do everything with one tool is an anti-pattern.

## Key Pitfalls

> ⚠️ **Pitfall 1**: Omitting `add-permission --qualifier` makes API Gateway return 403 when it calls an Alias. A permission on the Function ARN only allows `$LATEST`.

> ⚠️ **Pitfall 2**: With SnapStart, every invocation generates the same UUID/random value. You must re-initialize in the `afterRestore` hook of `org.crac.Resource`.

> **Pitfall 3**: SAM Policy Templates are broad (including GSI/LSI). For PCI/HIPAA, write `Statement` directly to restrict to exact ARNs.

> **Pitfall 4**: `sam sync --watch` bypasses CFN, which causes drift. In production, the next regular deploy overwrites the changes.

> **Pitfall 5**: PC cannot be set on `$LATEST`, only on an Alias/Version. During a Canary both Versions have PC, so cost temporarily doubles.

> **Pitfall 6**: Container Image Lambda cannot use Layers or SnapStart. Include every dependency in the Dockerfile.

> **Pitfall 7**: Alias weighted routing supports only primary + 1 additional. For 3-way you need an ALB target group or Route 53 weighted records.

> **Pitfall 8**: Step Functions Express does not support TaskToken. A human-approval workflow must use Standard.

---

## 📝 Practice Questions

**Question 1.** A SaaS team runs 200 Lambda functions with Serverless Framework v3, and the annual cost of the v4 commercial license is a burden. What is the most reasonable migration path?

A) Move to Terraform — rewrite everything in HCL, discard all existing CFN StackSets/drift governance assets, and build new tfstate locking infrastructure (S3 + DynamoDB)
B) Move to SAM or CDK — both are Apache 2.0 OSS and keep CFN governance (StackSets, drift)
C) Pin to v3 permanently — avoids the upgrade cost, but the end of security patches and new runtime support accumulates long-term operational risk
D) Develop an in-house IaC tool — no license cost, but you must maintain the entire synthesis, deployment, and rollback engine yourself

**Answer: B**
Explanation: SLS v4 (February 2023) applies a commercial license to companies with annual revenue of $2 million or more. In a similar case, Terraform also switched to BSL in August 2023, but the community responded with the OpenTofu fork. For AWS-only workloads, both SAM (familiar YAML) and CDK (code abstraction) are free. SLS yml and SAM templates have similar structures, so migration is relatively simple. C is a security risk, D is unrealistic, and A is a heavy burden because it discards CFN assets.

---

**Question 2.** You want to bring the P99 latency of a Java Spring Boot Lambda function (1 GB memory, 80 MB package, 8-second init) under 1 second while also minimizing cost. What is the most effective combination?

A) Keep 100 units of provisioned concurrency always on — cold starts become 0, but active-time billing runs 24 hours a day, which violates the cost-minimization requirement
B) Enable SnapStart + reinitialize SecureRandom in the runtime hook (`afterRestore`) → reduced to 300 to 500 ms at no cost
C) Rewrite Java entirely in Node.js — init gets faster, but you give up the Spring ecosystem and take on months of refactoring plus regression risk
D) Set reserved concurrency to 100 — it only guarantees a concurrency limit and the 8-second init itself stays the same, so P99 latency does not improve

**Answer: B**
Explanation: SnapStart takes a memory snapshot of the JVM init phase and cuts init time by 90%. It is free for Java zip packages. However, uniqueness assumption violations (the same random seed) must be reinitialized with a runtime hook. PC (A) has the same effect but bills for active time. C is a huge refactoring, and D is a limit setting unrelated to cold starts. After adopting SnapStart, latency drops 95% with no change in cost.

---

**Question 3.** You must transform and aggregate 50 million JSON objects (average 50 KB) in an S3 data lake every day. A 1% failure rate is tolerable, and operational burden must be minimized. What is the most suitable pattern?

A) Run a Spark on EMR cluster permanently — throughput is sufficient, but the operational burden of provisioning, tuning, and patching the cluster is large and the fixed cost is excessive for a daily batch
B) Step Functions Distributed Map + ItemReader: S3 listObjectsV2 + ProcessorConfig: DISTRIBUTED/EXPRESS + ToleratedFailurePercentage: 1
C) Invoke Lambda directly 50 million times, once per object — you would have to implement concurrency limits, throttling, partial failure tracking, and retry orchestration yourself
D) Discover the schema with a Glue crawler and then process — a crawler is a tool for creating catalog metadata and is unsuitable for transforming and aggregating 50 million objects

**Answer: B**
Explanation: Distributed Map (2022) is the exact answer. A Spark cluster (A) has a large operational burden. Direct Lambda invocation (C) is weak on throttling, concurrency limits, and error handling. A Glue crawler (D) is for schema discovery and is unsuitable for transformation. Strengths of Distributed Map: (1) MaxConcurrency of 10,000, (2) child workflows are Express and therefore cheap, (3) efficiency through ItemBatcher, (4) partial failure tolerance through ToleratedFailurePercentage, (5) automatic saving to S3 through ResultWriter. As in an advertising company case, it cuts cost by 60% compared with Spark.

---

**Question 4.** An API Gateway REST API points to the Lambda alias `live`, and every code change triggers an API redeployment, which makes operations cumbersome. What is the cleanest configuration?

A) Stage variable `lambdaAlias=live` + `${stageVariables.lambdaAlias}` in the integration URI + `add-permission --qualifier live`
B) Create a new API Gateway for every deployment
C) Switch to a Lambda function URL
D) Add CloudFront

**Answer: A**
Explanation: The stage variable pattern (the most commonly tested) is the exact answer. If you use `${stageVariables.alias}` in the integration URI, routing changes just by changing the stage variable, without redeploying the API. In one API, you can also separate environments, with the dev stage using `lambdaAlias=staging` and the prod stage using `lambdaAlias=live`. A missing `--qualifier` is the most common cause of 403 errors. B is inefficient, C is a different pattern, and D is unrelated.

---

**Question 5.** A team passed all integration tests with sam local invoke and then deployed to production. Lambda is immediately throttled and API Gateway returns 5xx errors after a 30-second timeout. What is the most likely cause?

A) A logic bug in the Lambda handler code — if all integration tests passed locally, a code bug does not explain why the same code is immediately throttled only in production
B) When connecting to RDS Proxy inside a VPC, ENI creation takes 8 to 10 seconds. Locally it uses the host network, so this latency is not emulated
C) The execution IAM role is missing — without permissions it would fail immediately with AccessDenied rather than lead to throttling followed by a 30-second timeout
D) An API Gateway integration configuration error — if the mapping were wrong, it would most likely have shown up earlier at the local sam local invoke stage

**Answer: B**
Explanation: This is exactly the 2020 fintech case. sam local reproduces the Lambda Runtime API accurately with an RIE-based Docker container, but it does not emulate (1) cold start time, (2) VPC ENI creation, (3) IAM role deny policies, or (4) the Lambda CPU ratio. Lesson: local is for logic validation, and integration tests must always run in a dev/staging cloud environment. The fix is optimizing RDS Proxy + provisioned concurrency + VPC endpoints. A/C/D are unrelated to the scenario.

---

**Question 6.** You must include an ML model (2.5 GB) in a Lambda zip package, which exceeds the zip limit. What is the most suitable packaging method?

A) Split it across 4 Lambda layers (not possible because of the 250 MB per-layer limit)
B) Lambda container image (10 GB limit) + your own ECR repository + DockerImageFunction
C) Download from S3 at runtime every time (cold start of 10+ seconds)
D) Mount EFS (operationally complex)

**Answer: B**
Explanation: This is the core use case of Lambda container images, launched in December 2020. The 10 GB limit and the ability to include your own OS tools. ARM builds use `docker buildx --platform linux/arm64`. In CDK, use `lambda.DockerImageFunction.fromImageAsset()`. However, container images cannot use layers, do not support SnapStart, and have a cold start 2 to 3 times that of zip. A is insufficient because 250 MB × 4 = 1 GB, C causes a cold start explosion and download costs, and D adds EFS cost and complexity.

---

**Question 7.** In a CodePipeline deploying sequentially us-east-1 → eu-west-1 → ap-northeast-2, when the alarm at the EUW1 stage fires, USE1 and EUW1 must be rolled back in reverse order. What is the most suitable configuration?

A) Three CFN deploy actions, one per Region, + Manual Approval, with an operator manually rolling back USE1 and EUW1 in reverse order in the console when the alarm fires — human intervention violates the RTO
B) A Step Functions action + ASL that accumulates deploymentIds in each Region's ResultPath + checks the alarm with a Choice + automatically chains RollbackEUW1 → RollbackUSE1 in reverse order with Catch
C) Implement all three-Region deployment, alarm checking, and reverse rollback logic inline in a single Lambda function — branching, retries, and reverse compensating transactions become tangled in code, making debugging and observability impossible
D) Split into three independent pipelines, one per Region — each pipeline is unaware of the others, so sequential dependency between Regions and reverse rollback of USE1 when EUW1 fails cannot be expressed

**Answer: B**
Explanation: Complex branching and reverse rollback are classic strengths of Step Functions. CodePipeline is optimized for simple linear flows, and delegating branching logic such as automatic reverse rollback to SF is the standard. It can be expressed as a typed workflow with CDK + SF. Call directly without Lambda through AWS SDK service integrations (`arn:aws:states:::aws-sdk:codedeploy:createDeployment`). A violates the RTO because of manual human rollback, C explodes complexity and cannot be debugged, and D cannot express dependencies between Regions.

---

**Question 8.** For a production deployment, a three-step approval of the security team → the DevOps team → automatic deployment, with automatic cancellation if there is no response within 7 days at each step, and notifications through Slack interactive messages. What is the most suitable workflow engine and pattern?

A) Three CodePipeline ManualApprovalActions serially for the security team, DevOps, and deployment steps — approval works, but you would have to implement the 7-day auto-cancel timer and the Slack interactive message authentication callback flow separately
B) Standard Step Functions + `.waitForTaskToken` three times + SNS→Slack→Lambda (SendTaskSuccess) + TimeoutSeconds: 604800
C) Express Step Functions + StartSyncExecution for three-step approval — Express does not support TaskToken and has a 5-minute maximum execution, so a 7-day wait is impossible
D) Trigger the approval steps by cron with EventBridge Scheduler — it is a scheduled-execution tool and cannot express waiting for human approval, callbacks, or reverse branching

**Answer: B**
Explanation: Only Standard supports TaskToken; Express does not (C is wrong). A 7-day timeout is a strength of Standard (Express has a 5-minute limit). The pattern is Slack interactive message → Lambda → `SendTaskSuccess(token, output)`. It is a cloud implementation of capability-based security (Henry Levy, 1984). CodePipeline ManualApprovalAction (A) is also possible, but (1) the Slack notification and authentication flow is complex and (2) branching and rollback are weaker than in SF. EventBridge Scheduler (D) is unsuitable because it is for scheduled execution.

---

**Question 9.** A team is using `sam sync --watch` in a production environment. A few days later, the next regular `sam deploy` overwrote all of the hotswap changes. What is the most accurate explanation of the cause?

A) sam sync patches code directly with the `update-function-code` API → the CFN stack state and the actual state diverge (drift) → the next sam deploy overwrites the changes based on the CFN state and the hotswap disappears
B) A runtime bug in the Lambda function code itself invalidated the hotswap changes — a code bug has no causal relationship with a regular deployment overwriting changes
C) A Region mismatch between the sync target and the deploy target applied the changes to a different function — in a workflow using the same profile and stack, there is no structural reason for the Regions to diverge
D) A conflict between multiple Lambda layer versions rolled back the code — a layer version conflict only causes a deployment failure and does not silently revert hotswap changes

**Answer: A**
Explanation: This is an intended limitation of sam sync (2021). It is explicitly a development-acceleration tool and is prohibited in production. The same pattern is `cdk deploy --hotswap`. Because it bypasses CloudFormation's ChangeSet/rollback tracking, it defeats the change history and approval workflow. The fixes are (1) in production use sam deploy + CodeDeploy Canary, (2) explicit protection such as `sam deploy --no-disable-rollback`, and (3) remove the sam sync permission from the production IAM. B/C/D are not factual.

---

**Question 10.** A company manages 1,500 Lambda functions with CDK. Each team repeatedly writes similar function patterns (Lambda + DynamoDB + API Gateway + IAM grant + X-Ray + Powertools). How should operational standardization and reusability be achieved?

A) All teams share and use only SAM policy templates — IAM policy boilerplate shrinks, but there is no reusable unit that abstracts the whole Lambda + DynamoDB + API + X-Ray pattern, so the repetitive writing remains
B) Write an in-house L3 construct library — publish constructs such as `StandardApiFunction` that abstract the standard pattern (security, tagging, logging, tracing)
C) Put CloudFormation YAML templates in a shared folder and copy them — copy-paste causes patterns to drift, and a standard change would require editing 1,500 places one by one
D) Consolidate the code of the 1,500 functions into a single monorepo — it only gathers code in one location, adds no abstraction, and only increases coupling between teams

**Answer: B**
Explanation: The Liberty Mutual 9,000-stack case (2022). A CDK L3 construct is a proven pattern that bundles several L2 constructs. Published as an in-house `@mycorp/standard-constructs` package, every team can deploy the standard pattern in 5 minutes. SAM (A) lacks abstraction tools and cannot achieve the same effect. CFN YAML (C) lacks code abstraction. A monorepo (D) increases organizational coupling. The essential value of CDK is not simply "infrastructure as code" but the ability to build a **library of reusable infrastructure abstractions**.

---

**Question 11.** You run production with `selfMutation: true` enabled in CDK Pipelines. One day a broken pipeline definition was pushed, and self-mutation deployed a broken pipeline. The next execution starts from the broken pipeline and normal recovery is impossible. What is the most appropriate prevention and recovery strategy?

A) Disable selfMutation permanently — it prevents broken pipeline incidents but gives up the core GitOps value of "the pipeline is also code" being updated automatically
B) Maintain break-glass IAM permissions + manually roll back the pipeline definition in the console + verify with `cdk diff` on a feature branch in advance + test each stage separately
C) Wait for recovery through an AWS Support case alone — you depend on an external response time, so you cannot control the RTO, and it does not prevent self-mutation from recurring
D) Delete and recreate the pipeline every time an incident occurs — it recovers, but bootstrap, permissions, and artifacts are reset each time, causing cost, downtime, and human error to explode

**Answer: B**
Explanation: A well-known anti-pattern of self-mutating GitOps. Stripe also had a similar incident in 2021. The defenses are (1) maintain break-glass IAM (an emergency role that can modify the pipeline bypassing CDK from the console), (2) always review `cdk diff` on a feature branch, (3) validate in staging first and then apply to prod, and (4) include `cdk synth` validation in the pipeline's `Test` stage. A gives up the value of selfMutation, C takes a long time, and D explodes cost and complexity.

---

**Question 12.** A payments company designs its payment processing workflow as follows: validation (50 ms) → authentication (100 ms) → charge (150 ms) → recording (50 ms). A synchronous response through API Gateway is required, with 500 calls per second. What is the most suitable workflow engine and invocation pattern?

A) Implement all four steps inline in a single Lambda function
B) Express Step Functions + StartSyncExecution + API Gateway AWS service integration (target `arn:aws:apigateway:...:states:action/StartSyncExecution`)
C) Standard Step Functions + StartExecution + result polling
D) Step Functions is not suitable — Lambda inline is always faster

**Answer: B**
Explanation: Express + StartSyncExecution (2019) is the synchronous workflow pattern. Expressing multi-step logic that finishes within 5 minutes as a workflow gives you (1) automatic visualization, retries, and error handling, (2) automatic per-step metrics, (3) direct calls such as a DynamoDB Put through the AWS SDK integration without Lambda, and (4) a reasonable cost at 500 calls per second. Lambda inline (A) is also possible but is hard to debug, retry, and visualize. Standard (C) is asynchronous only and unsuitable for an API backend. D is a wrong assertion.

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
