# Day 5 - Week 7 Review: All the Pieces of Serverless CI/CD in One Picture

If we sum up this week in one sentence, it is: "**CI/CD for serverless workloads has to be viewed as a single package, from choosing the IaC tool to the deployment strategy to workflow orchestration.**" SAM (Day 1), Serverless Framework and CDK (Day 2), Lambda Versions, Aliases, and CodeDeploy Canary (Day 3), and Step Functions (Day 4) are all different faces of the same picture. Scenario questions on the exam almost always combine two or three tools, so the ability to match precisely where each tool shines and where it is weak is what decides whether you pass.

Today we reorganize the five core axes of this week and run a comprehensive check with 12 scenario questions that resemble real exam patterns. The goal goes beyond memorizing plain facts: it is to memorize the mapping of "which keyword in this scenario calls which answer."

## Summary of the Five Axes

### Axis 1: Choosing an IaC Tool - Decided by Workload Nature and Team Language

| Scenario keyword | Suitable tool | Reason |
|------------------|--------------|------|
| "Only Lambda + API Gateway + DynamoDB, YAML" | **SAM** | CFN Macro optimizes 6 serverless resource types, low learning curve |
| "200 Lambda functions, multi-stage, rich plugins" | **Serverless Framework** | Node plugin ecosystem (but review the v4 license) |
| "Lambda + EKS + RDS + OpenSearch + TS team" | **CDK** | L2 abstractions for all AWS resources + grant methods + in-house L3 libraries |
| "Multi-cloud (AWS+GCP+Azure)" | **Terraform** | Cloud-agnostic through the Provider model |
| "Keep CFN governance (StackSets, Drift) as is + simplify serverless" | **SAM** | Compatible with every CFN feature |
| "9,000 in-house stacks + need a standard pattern library" | **CDK** | Reusable abstractions through L3 Constructs |

### Axis 2: Lambda Deployment - The Version/Alias Model

Core proposition: **a Version is an immutable snapshot, an Alias is a mutable pointer**. Same idea as Git commit/branch, Docker image digest/tag.

```
publish-version  →  V7 (immutable, never changes)
update-alias --function-version 7  →  live points to V7
```

| Feature | Behavior |
|------|------|
| `$LATEST` | Mutable working copy, no weighted routing, no PC |
| Version number | Immutable; only resource policy and PC can be changed |
| Alias weighted | primary + 1 additional only (max 2-way) |
| API Gateway integration | `${stageVariables.alias}` + `add-permission --qualifier <alias>` |
| CodeDeploy Canary | `AutoPublishAlias` + `DeploymentPreference` in one line |

### Axis 3: Cold Start Mitigation - Telling PC and SnapStart Apart Precisely

| Technique | Applicable runtimes | Cost | Effect |
|------|--------------|------|------|
| Provisioned Concurrency | All runtimes | Billed for active time | Zero cold start (within PC capacity) |
| SnapStart | Java 11/17/21, Python 3.12+, .NET 8+ (zip only) | Free for Java, paid for Py/.NET | Init time reduced by 90% |
| Reserved Concurrency | All | Free | Concurrency limit (unrelated to cold start) |
| ARM architecture | Compatible runtimes | 20% cheaper | Init 10-20% faster |

### Axis 4: Step Functions - Standard vs Express

| Item | Standard | Express |
|------|----------|---------|
| Duration | 1 year | 5 minutes |
| Guarantee | Exactly-once | At-least-once |
| Synchronous invocation | Not possible | Possible (StartSyncExecution) |
| TaskToken | ✅ | ❌ |
| Pricing | Per state transition | Per invocation + execution time |
| Use | Deployment workflows, human approval | API backends, IoT, ETL |

### Axis 5: Integrated Flow - In One Picture

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
   └─ Complex flows → delegate to Step Functions
      ├─ AWS SDK Service Integration (call directly without Lambda)
      ├─ TaskToken (human approval, external systems)
      └─ Distributed Map (large-scale parallelism)
```

## Easily Confused Comparison Table

| A | B | Distinguishing keyword |
|---|---|----------------|
| SAM | CDK | YAML serverless-specialized vs general-purpose code, all of AWS |
| SAM | Serverless Framework | AWS-native, OSS vs multi-cloud, v4 commercial |
| Standard SFn | Express SFn | 1 year, exactly-once vs 5 minutes, at-least-once |
| Provisioned Concurrency | Reserved Concurrency | Warm-up, paid vs limit, free |
| Lambda zip | Container Image | 250MB, Layers possible vs 10GB, no Layers, no SnapStart |
| `$LATEST` | Version number | Mutable, no PC vs immutable, PC possible |
| Alias weighted | Version 100% | Canary in two stages vs All-at-once |
| Inline Map | Distributed Map | 40 concurrent, affects parent history vs 10K concurrent, child executions |
| `.sync` integration | `.waitForTaskToken` | Waits for automatic completion vs waits for external callback |
| sam deploy | sam sync | Standard CFN path vs development speed-up, drift risk |

> Every comparison in this table is a classic trade-off model. System design principles such as the CAP theorem (Eric Brewer, 2000), PACELC (Daniel Abadi, 2010), and Conway's law (1968) apply equally to IaC and workflow tools. For example, Standard SFn's exactly-once is a consistency guarantee that gives up some availability/performance, while Express's at-least-once is the opposite trade. Exam scenarios almost always ask "which trade-off matters more."

> 🎯 **Scenario**: A question may appear on the exam that combines this week's five tools into the following picture: "Synthesize Lambda+DynamoDB+API Gateway with CDK → CodePipeline Source/Build → deploy with SAM Canary → 30 minutes of monitoring → sequential multi-Region deployment with human approval through Step Functions." Questions may ask which service is responsible at each step of this flow.

> A case presented at AWS Summit Seoul in 2023 by a fintech company: it ran 1,500 Lambdas with a mix of CDK and SAM. Simple serverless (API + Lambda + Dynamo) used SAM, complex infrastructure (Lambda + EKS + OpenSearch + Step Functions) used CDK, and the deployment workflow was separated out into CodePipeline + Step Functions. By matching the strength of each tool precisely, deployment time dropped by 70%. On the exam, the answer to "how do you combine several tools?" is "separate them according to each tool's strengths" - trying to do everything with one tool is an anti-pattern.

## Key Pitfalls Summary

> ⚠️ **Pitfall 1**: Forgetting `add-permission --qualifier` causes a 403 when API Gateway invokes an Alias. A Function ARN permission only allows `$LATEST`.

> ⚠️ **Pitfall 2**: With SnapStart, every invocation generates the same UUID/random value. You must reinitialize in the `afterRestore` hook of `org.crac.Resource`.

> **Pitfall 3**: SAM Policy Templates are broad (including GSI/LSI). For PCI/HIPAA, write the `Statement` directly to restrict to exact ARNs.

> **Pitfall 4**: `sam sync --watch` bypasses CFN, so drift occurs. In production, the next regular deploy overwrites the changes.

> **Pitfall 5**: PC cannot be set on `$LATEST`, only on an Alias/Version. During a Canary both Versions have PC, so cost temporarily doubles.

> **Pitfall 6**: Container Image Lambda cannot use Layers or SnapStart. Include all dependencies in the Dockerfile.

> **Pitfall 7**: Alias weighted routing supports only primary + 1 additional. For 3-way you need an ALB target group or Route 53 weighted records.

> **Pitfall 8**: Step Functions Express does not support TaskToken. A human-approval workflow must use Standard.

---

## 🧠 12 Comprehensive Scenario Questions

### Scenario 1

**Question 1.** A SaaS team runs 200 Lambda functions with Serverless Framework v3, and the annual cost of the v4 commercial license is a burden. What is the most reasonable migration path?

A) Move to Terraform - rewrite everything in HCL, discard all existing CFN StackSets/drift governance assets, and build new tfstate locking infrastructure (S3+DynamoDB)
B) Move to SAM or CDK - both are Apache 2.0 OSS and keep CFN governance (StackSets, drift)
C) Pin to v3 permanently - avoids the upgrade cost, but the end of security patches and new runtime support accumulates long-term operational risk
D) Develop an in-house IaC tool - no license cost, but you must maintain the entire synthesis, deployment, and rollback engine yourself

**Answer: B**
Explanation: SLS v4 (February 2023) applies a commercial license to companies with annual revenue of $2 million or more. In a similar case, Terraform also switched to BSL in August 2023, but the community responded with the OpenTofu fork. For AWS-only workloads, both SAM (familiar YAML) and CDK (code abstraction) are free. SLS yml and SAM templates have similar structures, so migration is relatively simple. C is a security risk, D is unrealistic, and A is a heavy burden because it discards CFN assets.

---

### Scenario 2

**Question 2.** You want to bring the P99 latency of a Java Spring Boot Lambda (1GB memory, 80MB package, 8-second init) under 1 second, while also minimizing cost. What is the most effective combination?

A) Keep 100 Provisioned Concurrency always on - cold start becomes 0, but active-time billing runs 24 hours a day, which violates the cost-minimization requirement
B) Enable SnapStart + reinitialize SecureRandom in the Runtime Hook (`afterRestore`) → reduced to 300-500ms, free of charge
C) Rewrite Java entirely in Node.js - init gets faster, but you give up the Spring ecosystem and take on months of refactoring + regression risk
D) Set Reserved Concurrency 100 - it only guarantees a concurrency limit; the 8-second init itself stays the same, so P99 latency does not improve

**Answer: B**
Explanation: SnapStart takes a memory snapshot of the JVM init phase and cuts init time by 90%. It is free for Java zip packages. However, uniqueness assumption violations (the same random seed) must be reinitialized with a runtime hook. PC (A) has the same effect but bills for active time. C is a huge refactoring, and D is a limit setting unrelated to cold starts. After adopting SnapStart, latency drops 95% with no change in cost.

---

### Scenario 3

**Question 3.** You must transform and aggregate 50 million JSON objects (average 50KB) in an S3 data lake every day. A 1% failure rate is tolerable, and operational burden must be minimal. What is the most suitable pattern?

A) Run a Spark on EMR cluster permanently - throughput is sufficient, but the operational burden of cluster provisioning, tuning, and patching is large, and the fixed cost is excessive for a daily batch
B) Step Functions Distributed Map + ItemReader: S3 listObjectsV2 + ProcessorConfig: DISTRIBUTED/EXPRESS + ToleratedFailurePercentage: 1
C) Invoke Lambda directly 50 million times, once per object - you would have to implement concurrency limits, throttling, partial-failure tracking, and retry orchestration entirely yourself
D) Discover the schema with a Glue Crawler, then process - a Crawler is a tool that generates catalog metadata, so it is unsuitable for transforming and aggregating 50 million objects

**Answer: B**
Explanation: Distributed Map (2022) is the exact answer. A Spark cluster (A) has a large operational burden. Direct Lambda invocation (C) is weak on throttling, concurrency limits, and error handling. A Glue crawler (D) is for schema discovery and is unsuitable for transformation. Strengths of Distributed Map: (1) MaxConcurrency of 10,000, (2) child workflows are Express and therefore cheap, (3) efficiency through ItemBatcher, (4) partial failure tolerance through ToleratedFailurePercentage, (5) automatic saving to S3 through ResultWriter. As in an advertising company case, it cuts cost by 60% compared with Spark.

---

### Scenario 4

**Question 4.** An API Gateway REST API points to the Lambda Alias `live`, but every code change triggers an API redeployment, making operations cumbersome. What is the cleanest configuration?

A) Stage Variable `lambdaAlias=live` + `${stageVariables.lambdaAlias}` in the Integration URI + `add-permission --qualifier live`
B) Create a new API Gateway for every deployment
C) Switch to a Lambda Function URL
D) Add CloudFront

**Answer: A**
Explanation: The Stage Variable pattern (the most commonly tested) is the exact answer. If you use `${stageVariables.alias}` in the Integration URI, you can change routing just by changing the Stage Variable without redeploying the API. Also, within one API the dev Stage can use `lambdaAlias=staging` and the prod Stage `lambdaAlias=live` to separate environments. A missing `--qualifier` is the most common cause of 403. B is inefficient, C is a different pattern, and D is unrelated.

---

### Scenario 5

**Question 5.** A team passed all integration tests with sam local invoke and then deployed to production. Lambda was throttled immediately and API Gateway returned 5xx after a 30-second timeout. What is the most likely cause?

A) A logic bug in the Lambda handler code - if all integration tests passed locally, the same code being throttled immediately only in production cannot be explained by a code bug
B) Creating the ENI when connecting to RDS Proxy inside a VPC takes 8-10 seconds. Locally it runs on the host network, so this latency is not emulated
C) Missing execution IAM Role - without permissions it would fail immediately with AccessDenied, not lead to throttling and then a 30-second timeout
D) API Gateway integration misconfiguration - if the mapping were wrong, it would most likely have surfaced first at the local sam local invoke stage

**Answer: B**
Explanation: Exactly a 2020 fintech case. sam local reproduces the Lambda Runtime API accurately with an RIE-based Docker container, but (1) cold start time, (2) VPC ENI creation, (3) IAM Role deny policies, and (4) the Lambda CPU ratio are not emulated. Lesson: local is for logic verification; integration tests must run in a dev/staging cloud environment. The fix is RDS Proxy + Provisioned Concurrency + VPC endpoint optimization. A/C/D are unrelated to the scenario.

---

### Scenario 6

**Question 6.** You must include an ML model (2.5GB) in a Lambda zip package. It exceeds the zip limit. What is the most suitable packaging method?

A) Split into 4 Lambda Layers (not possible, since the limit per Layer is 250MB)
B) Lambda Container Image (10GB limit) + your own ECR repository + DockerImageFunction
C) Download from S3 at runtime every time (10+ seconds of cold start)
D) Mount EFS (operationally complex)

**Answer: B**
Explanation: The core use case of Lambda Container Image, released in December 2020. 10GB limit + you can include your own OS tools. For ARM builds use `docker buildx --platform linux/arm64`. In CDK use `lambda.DockerImageFunction.fromImageAsset()`. However, Containers cannot use Layers, do not support SnapStart, and cold starts are 2-3 times longer than zip. A is insufficient since 250MB x 4 = 1GB, C causes a surge in cold start and download cost, and D adds EFS cost and complexity.

---

### Scenario 7

**Question 7.** In a CodePipeline sequential deployment us-east-1 → eu-west-1 → ap-northeast-2, if an alarm fires at the EUW1 stage, USE1 and EUW1 must be rolled back in reverse order. What is the most suitable configuration?

A) 3 CFN Deploy Actions, one per Region + Manual Approval, with an operator manually rolling back USE1 and EUW1 in reverse order from the console when an alarm fires - human intervention violates the RTO
B) Step Functions Action + ASL that accumulates deploymentId in each Region's ResultPath + Choice for the alarm check + Catch for automatic reverse RollbackEUW1 → RollbackUSE1
C) Implement 3-Region deployment, alarm checking, and reverse rollback logic all inline in a single Lambda - branching, retries, and reverse compensating transactions get tangled in code, making debugging and observability impossible
D) Split into 3 independent Pipelines, one per Region - each pipeline is unaware of the others, so it cannot express sequential cross-Region dependency or reverse rollback of USE1 when EUW1 fails

**Answer: B**
Explanation: Complex branching and reverse rollback are a classic strength of Step Functions. CodePipeline is best for simple linear flows; delegating branching logic such as automatic reverse rollback to SF is the standard. It can be expressed as a typed workflow with CDK + SF. Use the AWS SDK Service Integration (`arn:aws:states:::aws-sdk:codedeploy:createDeployment`) to call directly without Lambda. A violates the RTO because of manual rollback, C blows up complexity and cannot be debugged, and D cannot express cross-Region dependencies.

---

### Scenario 8

**Question 8.** For a production deployment there is a 3-stage approval: security team → DevOps team → automatic deployment. If there is no response within 7 days at each stage it is automatically canceled, and notification is through a Slack interactive message. What is the most suitable workflow engine and pattern?

A) Chain 3 CodePipeline ManualApprovalActions for the security team, DevOps, and deployment stages - approval works, but the 7-day auto-cancel timer and the authenticated callback flow for Slack interactive messages must be implemented separately
B) Standard Step Functions + `.waitForTaskToken` 3 times + SNS→Slack→Lambda (SendTaskSuccess) + TimeoutSeconds: 604800
C) Express Step Functions + StartSyncExecution handling the 3-stage approval - Express does not support TaskToken and has a 5-minute maximum execution, so waiting 7 days is impossible
D) EventBridge Scheduler triggering the approval stages by cron - it is a periodic execution tool, so it cannot express waiting for human approval, callbacks, or reverse branching

**Answer: B**
Explanation: Only Standard supports TaskToken; Express does not (C is wrong). A 7-day timeout is a strength of Standard (Express has a 5-minute limit). The pattern is Slack interactive message → Lambda → `SendTaskSuccess(token, output)`. It is a cloud implementation of capability-based security (Henry Levy, 1984). CodePipeline ManualApprovalAction (A) is also possible, but (1) the Slack notification and authentication flow is complex, and (2) branching and rollback expression is weaker than SF. EventBridge Scheduler (D) is unsuitable because it is for periodic execution.

---

### Scenario 9

**Question 9.** A team is using `sam sync --watch` in the production environment. A few days later the next regular `sam deploy` overwrote all the hotswap changes. What is the most accurate explanation of the cause?

A) sam sync patches code directly with the `update-function-code` API → the CFN stack state and reality diverge (drift) → the next sam deploy overwrites the changes based on the CFN state, so the hotswap disappears
B) A runtime bug in the Lambda function code itself invalidated the hotswap changes - a code bug has no causal relationship with a regular deployment overwriting changes
C) A Region mismatch between the sync target and the deploy target applied it to a different function - in a workflow using the same profile and stack there is no structural reason for the Regions to diverge
D) Conflicts between multiple Lambda Layer versions rolled the code back - Layer version conflicts only cause deployment failures; they do not silently revert hotswap changes

**Answer: A**
Explanation: This is an intended limitation of sam sync (2021). It is explicitly for development speed-up and prohibited in production. The same pattern applies to `cdk deploy --hotswap`. It bypasses CloudFormation's ChangeSet/Rollback tracking, which neutralizes change history and approval workflows. Remedies are (1) use sam deploy + CodeDeploy Canary for production, (2) explicit protection such as `sam deploy --no-disable-rollback`, (3) remove sam sync permission from production IAM. B/C/D are not facts.

---

### Scenario 10

**Question 10.** A company manages 1,500 Lambda functions with CDK. Each team keeps writing similar function patterns (Lambda + DynamoDB + API Gateway + IAM grant + X-Ray + Powertools) over and over. How do you ensure operational standardization and reusability?

A) Have all teams share and use only SAM Policy Templates - IAM policy boilerplate shrinks, but there is no reusable unit that abstracts the whole Lambda+Dynamo+API+X-Ray pattern, so the repeated writing remains
B) Write an in-house L3 Construct library - publish a Construct such as `StandardApiFunction` that abstracts the standard pattern (security, tagging, logging, tracing)
C) Put CloudFormation YAML templates in a shared folder and copy them - copy-paste based, so patterns drift, and when the standard changes you must fix 1,500 places one by one
D) Consolidate the 1,500 function codebases into a single monorepo - it only gathers code in one place without abstraction and just increases coupling between teams

**Answer: B**
Explanation: Liberty Mutual's 9,000-Stack case (2022). A CDK L3 Construct is a validated pattern bundling several L2s. Published as an in-house `@mycorp/standard-constructs` package, every team can deploy the standard pattern in 5 minutes. SAM (A) lacks an abstraction tool, so it cannot achieve the same effect. CFN YAML (C) lacks code abstraction. A monorepo (D) increases organizational coupling. The essential value of CDK is not simply "infrastructure as code" but that you can build a **reusable infrastructure abstraction library**.

---

### Scenario 11

**Question 11.** A team runs production with CDK Pipelines and `selfMutation: true` enabled. One day they pushed a wrong pipeline definition and deployed a pipeline that broke self-mutation. The next execution started with the broken pipeline and cannot recover normally. What is the most appropriate prevention and recovery strategy?

A) Permanently disable selfMutation - prevents broken-pipeline incidents, but gives up the core value of GitOps "the pipeline is code too" automatic updating entirely
B) Maintain Break-glass IAM permissions + manually roll back the pipeline definition from the console + validate in advance with `cdk diff` on feature branches + separated per-Stage testing
C) Wait for recovery through an AWS Support case alone - depends on external response time so the RTO cannot be controlled, and it does not prevent self-mutation from recurring
D) Delete and recreate the Pipeline every time an incident occurs - it recovers, but bootstrap, permissions, and artifacts are reset each time, so cost, downtime, and human error balloon

**Answer: B**
Explanation: A well-known anti-pattern of self-mutating GitOps. Stripe had a similar incident in 2021. Defenses are (1) maintain Break-glass IAM (an emergency role that can modify things from the console bypassing CDK), (2) always review `cdk diff` on feature branches, (3) validate in Staging first and then apply to prod, (4) include `cdk synth` validation in the Pipeline's `Test` stage. A gives up the value of selfMutation, C takes a long time, and D blows up cost and complexity.

---

### Scenario 12

**Question 12.** A payment company designs its payment-processing workflow as follows: validation (50ms) → authentication (100ms) → charge (150ms) → recording (50ms). A synchronous response through API Gateway is required, at 500 calls per second. What is the most suitable workflow engine and invocation pattern?

A) Implement all 4 stages inline in a single Lambda
B) Express Step Functions + StartSyncExecution + API Gateway AWS service integration (target `arn:aws:apigateway:...:states:action/StartSyncExecution`)
C) Standard Step Functions + StartExecution + result polling
D) Step Functions is unsuitable - inline Lambda is always faster

**Answer: B**
Explanation: Express + StartSyncExecution (2019) is the synchronous workflow pattern. Expressing multi-step logic that finishes within 5 minutes as a workflow gives you (1) automatic visualization, retries, and error handling, (2) automatic per-step metrics, (3) the ability to call things like DynamoDB Put directly through AWS SDK Integration without Lambda, and (4) a reasonable cost at 500 calls per second. Inline Lambda (A) is also possible but makes debugging, retries, and visualization difficult. Standard (C) is asynchronous only and unsuitable for an API backend. D is a wrong assertion.

---

## 📌 Week 7 Summary

Finally, let's recap the core of the five axes you learned this week.

1. **IaC tool choice** is decided by workload nature and team language. SAM for AWS-only serverless, CDK for diverse AWS resources, Terraform for multi-cloud. For Serverless Framework, reviewing the v4 license is mandatory.

2. **A Lambda Version is an immutable snapshot, an Alias is a mutable pointer**. Same idea as Git commit/branch. Weighted routing is possible only with primary + 1 additional - the structural reason CodeDeploy Canary works "one step at a time."

3. The two standards of **cold start mitigation** - Provisioned Concurrency (warm-up, paid) vs SnapStart (Java/Python/.NET zip only, init time reduced by 90%). Reserved Concurrency is a limit setting and unrelated to cold start.

4. **Step Functions**: choose Standard/Express by invocation frequency x execution time. AWS SDK Service Integration calls 200+ services without Lambda. TaskToken integrates humans and external systems. Distributed Map runs 10K concurrent child workflows.

5. The **integrated flow** is the combination of CodePipeline + CodeBuild + CFN/SAM Deploy + CodeDeploy Canary + Step Functions. Separating them according to each service's strengths is the standard pattern. Trying to do everything with one tool is an anti-pattern.

---

## 🔜 Next Week Preview (Week 8)

**Advanced IaC - Going Deep on CloudFormation/CDK/Terraform**

- Day 1: Advanced CloudFormation - Nested Stack, Cross-Stack, writing your own Macro
- Day 2: StackSets - multi-account/Region governance
- Day 3: Internals of Drift Detection, Change Set, and Custom Resource
- Day 4: Advanced CDK Pipelines + CDK ↔ Terraform integration + cdktf
- Day 5: 12 comprehensive scenario questions

If this week's theme was "which tool to use," next week's is "how to operate that tool in depth." Applying policies to 100 accounts at once with StackSets, catching manual changes with Drift Detection, and integrating resources CFN doesn't know about with Custom Resources - the real territory of enterprise IaC unfolds.

---
