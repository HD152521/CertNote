# Day 3 - Lambda Versions and Aliases: A Mutable Pointer on Top of Immutable Snapshots

Anyone who has operated Lambda functions has asked questions like these at least once. "I just deployed new function code, so which version will the in-flight invocations finish on?" Or "How do I change the function code that API Gateway calls within 5 seconds?" Or "If 5xx errors suddenly spike during a canary deployment, how do I roll back immediately?" The answers to all these questions point to one place. Two abstractions: **Lambda Versions and Aliases**.

The design philosophy of this model is simple. **A Version is an immutable snapshot**, and **an Alias is a mutable pointer to that snapshot.** It is essentially the same as the relationship between a Git commit hash and a branch, or between a Docker image's sha256 digest and its tag. Once code is published (`publish-version`), that Version never changes. A deployment is defined as "create a new Version and change what the Alias points to." This structure makes weighted routing, instant rollback, and multi-environment operations come naturally.

Today we look at the internal behavior of these two concepts and the edge cases that often appear as traps on the exam. CodeDeploy Canary, Provisioned Concurrency, API Gateway Stage Variables, and even SnapStart - all of them sit on top of the Version/Alias model.

## Why a Version Is Truly Immutable

```bash
# Upload new code to $LATEST
aws lambda update-function-code --function-name MyFn --zip-file fileb://app.zip

# Publish a Version (at this moment the code+config snapshot of $LATEST is frozen as V7)
aws lambda publish-version --function-name MyFn
# {"FunctionName": "MyFn", "Version": "7", "CodeSha256": "abc...", ...}

# Try to change V7's environment variables
aws lambda update-function-configuration \
  --function-name MyFn:7 \
  --environment 'Variables={NEW=value}'
# ❌ An error occurred (InvalidParameterValueException): Lambda was unable to configure your environment variables. Reason: The role defined for the function cannot ...
# More precisely: ResourceConflictException: Cannot modify a published version
```

The moment a Version is published, its code (`CodeSha256`), environment variables, memory, timeout, runtime, and Layer references - all of its configuration - are frozen. After that, the only things you can change for that Version are the **Resource Policy** and the **Provisioned Concurrency configuration**.

Why does this immutability matter? Because of **reproducibility** and **rollback safety**. You need a guarantee that invoking V6, deployed yesterday, again today runs in the identical code and environment, so that a comparison like "it worked on V6 yesterday but broke on V7 today" is possible. If Versions were mutable, debugging would become hell.

> The immutable snapshot model is the same pattern as the **persistent data structure** of functional programming (Chris Okasaki, 1996). Git commits, Docker image digests, AWS AMI IDs, S3 object versions, and Kubernetes ReplicaSets all share the same idea. The core is the principle "never change what you have made once; a change creates a new object." If this breaks, consistency and debuggability in distributed systems collapse. A Lambda Version is the enforcement mechanism of this principle.

> `$LATEST` is an unversioned mutable working copy. Version numbers increase as positive integers starting from 1, and a number once used is never recycled (even after `delete-function --qualifier 5`, V5 remains permanently missing). This is the same guarantee as a Git commit hash never being reused once created, even after garbage collection. The `CodeSha256` field is the SHA-256 of the zip contents; publishing identical code twice gives the same sha256 but different Version numbers. This can be used for idempotency verification such as CI reruns.

## Alias: The Cloud Version of a Symbolic Link

```bash
# Create an Alias - a 'live' pointer to V5
aws lambda create-alias \
  --function-name MyFn \
  --name live \
  --function-version 5

# Use the Alias when invoking
aws lambda invoke \
  --function-name MyFn:live \
  --payload '{}' out.json
# V5 runs internally

# Change what the Alias points to (instant traffic shift)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 6
# V6 runs from the next invocation
```

An Alias is the same abstraction as a Unix symbolic link, a Git branch, or a DNS CNAME. The actual target is elsewhere, and the Alias is just one line of name→target mapping. Because the cost of change is nearly zero (updating one line of metadata), a **traffic shift within tens of milliseconds** is possible.

The most important application is **Weighted Routing**.

```bash
# 90% to V5, 10% to V6 (Canary)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \
  --routing-config 'AdditionalVersionWeights={"6"=0.1}'
```

The invoker inside the Lambda service generates a random number for each request and routes to V5 or V6 according to the weights. This process is **stateless**, so even the same user can reach a different Version on each request (sticky routing is not possible).

> ⚠️ **Trap**: An Alias's weighted routing allows only **1 primary + 1 additional**. That is, one Alias can point to at most 2 Versions at the same time. A 3-way split such as "V5 70%, V6 20%, V7 10%" is impossible. If a scenario like "distribute traffic across 3 Versions simultaneously" appears on the exam, the answer is one of three: (1) split into two-stage Canaries (V5→V6, then V6→V7), (2) use an Application Load Balancer with weighted target groups, or (3) Route 53 weighted routing. This single constraint is the structural reason CodeDeploy Canary proceeds only "one step at a time."

> 🎯 **Scenario**: "An Alias 'prod' points to V10. You want to deploy V11 and verify it with 5% of traffic for 30 minutes. How do you configure it?" - The answer is `update-alias --function-version 10 --routing-config 'AdditionalVersionWeights={"11"=0.05}'`, then after 30 minutes `--function-version 11 --routing-config '{}'`. These two steps can be automated in one line with CodeDeploy `Canary5Percent30Minutes`.

## How CodeDeploy Shifts an Alias

When a SAM function with `AutoPublishAlias` + `DeploymentPreference` is deployed, CodeDeploy performs the following sequence.

```
1. CFN updates the Lambda function code (→ $LATEST updated)
2. CFN calls publish-version → V7 created
3. CFN creates a CodeDeploy Deployment
4. CodeDeploy runs the PreTraffic Hook Lambda
   ↓ On failure → deployment halts, V6 stays
5. CodeDeploy sets Alias weighted routing
   live: V6=90%, V7=10%
6. CloudWatch Alarm monitoring (5/30 min)
   ↓ Alarm fires → live: V6=100%, V7=0% (rollback)
7. Wait time ends → live: V6=0%, V7=100%
8. CodeDeploy runs the PostTraffic Hook Lambda
   ↓ On failure → rollback
9. Deployment complete, V6 preserved as history
```

Every step of this flow operates on the **mutability of the Alias**. Each traffic shift is just a single `update-alias` API call, and a rollback is just a call to the same API with different parameters.

```yaml
# SAM Template - the complete Canary + Hook + Alarm setup
GetOrderFn:
  Type: AWS::Serverless::Function
  Properties:
    AutoPublishAlias: live
    DeploymentPreference:
      Type: Canary10Percent5Minutes
      PreTraffic: !Ref PreTrafficHook
      PostTraffic: !Ref PostTrafficHook
      Alarms:
        - !Ref ErrorRateAlarm
        - !Ref P99LatencyAlarm
      Role: !GetAtt CodeDeployServiceRole.Arn

ErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    MetricName: Errors
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref GetOrderFn
      - Name: Resource
        Value: !Sub '${GetOrderFn}:live'   # ← Separated per Alias!
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 2
    Threshold: 1
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
```

> Lambda CloudWatch metrics by default have only the `FunctionName` dimension, but adding the `Resource` dimension yields metrics separated per Alias/Version, in the form `MyFn:live`, `MyFn:7`. This dimension is essential for viewing the error rates of the old and new Versions separately during a Canary deployment. The additional cost is the standard rate per metric (first 10,000 free, then $0.30/metric). A PostTraffic Hook often queries these separated metrics to write code that checks whether the new Version's P99 latency is under 1.5x that of the existing one.

> In 2021, an e-commerce company deployed with Canary10Percent5Minutes, but the Error Alarm did not fire within 5 minutes, and after a 100% shift a memory leak blew up in the following time window. The causes were (1) the leak was gradual, so it did not reach the threshold within 5 minutes, and (2) the Alarm used a 1-minute average, so it caught only spikes and not cumulative patterns. Afterward the team extended to `Canary10Percent30Minutes` and added a check of the memory usage trend in the PostTraffic Hook. Lesson: set the Canary duration based on the slowest failure pattern in the scenario.

## Two Ways API Gateway Points to an Alias

This is the most commonly tested pattern in API Gateway → Lambda integration.

**Method 1: Stage Variable pattern (REST API)**

```
Integration URI:
arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/
arn:aws:lambda:ap-northeast-2:111:function:MyFn:${stageVariables.lambdaAlias}/invocations
```

```bash
# Set a variable on the deployed API Stage 'prod'
aws apigateway update-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --patch-operations 'op=replace,path=/variables/lambdaAlias,value=live'
```

This pattern lets each **Stage use a different Alias**. The `dev` Stage has `lambdaAlias=staging`, and the `prod` Stage has `lambdaAlias=live`. When the function code changes, there is no need to redeploy API Gateway - the Alias shift is reflected immediately.

**Method 2: Referencing the Alias ARN directly (HTTP API or static integration)**

```bash
aws apigatewayv2 create-integration \
  --api-id xyz \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:...:MyFn:live \
  --payload-format-version 2.0
```

In this case the Integration's URI itself is the Alias ARN. To change it, you have to update the Integration itself.

> ⚠️ **Trap**: For API Gateway to invoke Lambda, a **resource-based policy** is needed on the Lambda side, added with the `add-permission` API. The `--qualifier` flag is the key.

```bash
# ❌ Wrong way - permission only on the Function ARN
aws lambda add-permission \
  --function-name MyFn \
  --statement-id api-gw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com

# ✅ Correct way - permission on the Alias
aws lambda add-permission \
  --function-name MyFn \
  --qualifier live \
  --statement-id api-gw-invoke-live \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn 'arn:aws:execute-api:ap-northeast-2:111:abc123/*/GET/orders/*'
```

Permissions on the Function ARN apply only to `$LATEST` invocations. Alias invocations (MyFn:live) need a separate resource policy. If you add it through "Add trigger" in the console without knowing this, API Gateway grants the permission with the exact qualifier, but with manual CLI/CFN you must specify it explicitly. On the exam, the answer to an "API Gateway invocation is denied" scenario is almost always this missing qualifier.

## Provisioned Concurrency: The Cost vs. Effect of Warm-Up

PC is a feature that "keeps N containers pre-warmed."

```bash
# Set 10 PC on Alias 'live'
aws lambda put-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier live \
  --provisioned-concurrent-executions 10
```

PC can be set at the **Version or Alias** level, but not on `$LATEST`. Placing PC on a mutable target would invalidate the warm-up on every code change, making it meaningless.

| Item | Reserved Concurrency | Provisioned Concurrency |
|------|----------------------|--------------------------|
| Purpose | Set a concurrent execution limit (protect other functions) | Pre-warming (eliminate cold starts) |
| Cost | Free | Proportional to active time ($0.0000041667/GB-s) |
| Cold Start | No effect (throttled when the limit is reached) | Eliminated (within PC capacity) |
| Scope | Function | Alias or Version |
| When the limit is reached | 429 Throttle | Falls back to a normal cold start (the request is still processed) |
| Auto Scaling | Not possible | Application Auto Scaling possible |

```bash
# Auto-adjust PC with Target Tracking (target 70% utilization)
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --resource-id function:MyFn:live \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --min-capacity 5 --max-capacity 100

aws application-autoscaling put-scaling-policy \
  --service-namespace lambda \
  --resource-id function:MyFn:live \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --policy-name pc-target-util \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 0.7,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "LambdaProvisionedConcurrencyUtilization"
    }
  }'
```

> What happens when a Canary deployment occurs while PC is enabled? The answer is "**both Versions must have PC**." SAM `DeploymentPreference` automatically pre-allocates PC to the new Version before starting the shift. Without automatic allocation, the new Version would suffer full cold starts the moment it received traffic, defeating the point of the Canary. The result is that during the deployment, **PC cost temporarily doubles** (PC 10 on V5 and PC 10 on V6 simultaneously). For cost-sensitive workloads, this is a reason to hesitate over PC.

> When PC usage exceeds PC capacity, the excess is handled as normal cold starts and invocations are not rejected (this is where it differs from Reserved). So even if 100 concurrent invocations arrive at a function configured with 5 PC, the first 5 are handled without cold starts and the remaining 95 with normal cold starts. Understand precisely that PC is a "warm boost," not a throttle. On the exam, an option saying "PC also acts as a limit" is used as a wrong answer.

## SnapStart: The Cold Start Revolution for Java

SnapStart, announced at re:Invent 2022, is a feature that **pre-creates a memory snapshot of the JVM init phase**.

```yaml
# SAM
Properties:
  SnapStart:
    ApplyOn: PublishedVersions
```

```bash
# CLI
aws lambda update-function-configuration \
  --function-name MyJavaFn \
  --snap-start ApplyOn=PublishedVersions
```

After enabling it, when you publish a new Version, Lambda does the following in the background.

1. Runs the function init phase in a temporary microVM (e.g., Spring Boot ApplicationContext initialization)
2. Captures a snapshot of memory and disk state → encrypts it and stores it in a distributed fashion
3. Subsequent invocations start by restoring the snapshot → skipping the init phase

The effect is dramatic. The cold start of a Spring Boot Lambda drops from 5-10 seconds to **300-500 ms** (about a 90% reduction).

| Item | Value |
|------|-----|
| Supported runtimes | Java 11 and later, Python 3.12 and later, .NET 8 and later (per official docs, 2026-11) |
| Supported packaging | Both zip and Container Image (initially zip only) |
| Java cost | No additional cost (Java managed runtimes) |
| Python/.NET cost | Snapshot caching (minimum 3 hours per version) + per-restore charge. See the Lambda pricing page for rates |
| Compatibility constraint | Cannot be used together with Provisioned Concurrency |

> SnapStart is the same idea as the **image-based persistence** of Self/Smalltalk in the 1980s. It saves the entire program execution state (memory pages, CPU registers) and restores it to skip startup time. In modern times, VMware's vMotion, Google's zigzag (snapshot-based cold boot), and CRIU (Checkpoint/Restore in Userspace on Linux) follow the same pattern. SnapStart exposes Firecracker MicroVM's snapshot capability to Lambda.

> A **uniqueness assumption violation** caused by SnapStart - because it is a snapshot restore, the results of `random.seed()`, `UUID.randomUUID()`, and `Instant.now()` from the init phase start identically in every invocation. This is a serious security problem (predictable token generation). The fix is the **Runtime Hook**.

```java
import com.amazonaws.services.lambda.runtime.events.snapstart.*;
import org.crac.Core;
import org.crac.Resource;

public class SnapAwareHandler implements Resource {
    public SnapAwareHandler() {
        Core.getGlobalContext().register(this);
    }

    @Override
    public void beforeCheckpoint(org.crac.Context<? extends Resource> context) {
        // Right before the snapshot - close DB connections, clear caches
    }

    @Override
    public void afterRestore(org.crac.Context<? extends Resource> context) {
        // Right after snapshot restore - reset the random seed, re-establish connections
        SecureRandom.getInstanceStrong();  // new entropy pool
    }
}
```

If you forget this hook, the awful bug of getting the same UUID on every call occurs. On the exam, the answer to a "the same token is generated after enabling SnapStart" scenario is adding a Runtime Hook.

## Version Pruning: Managing Ever-Growing Versions

If you deploy 5 times a day with CodeDeploy Canary, after a year you have 1,800 Versions. Lambda has a 75 GB Version limit per function, so large functions hit the limit quickly.

```bash
# Identify and delete Versions unused for 90+ days
# (query the last invocation time from CloudWatch Logs)
LATEST_USED_VERSION=$(aws logs filter-log-events ...)

aws lambda list-versions-by-function --function-name MyFn \
  --query 'Versions[?Version!=`$LATEST`].Version' \
  --output text | tr '\t' '\n' | \
  while read v; do
    if [ "$v" -lt "$LATEST_USED_VERSION" ]; then
      aws lambda delete-function --function-name MyFn --qualifier "$v"
    fi
  done
```

CDK manages this automatically with `currentVersionOptions`:

```typescript
new lambda.Function(this, 'F', {
  // ...
  currentVersionOptions: {
    removalPolicy: cdk.RemovalPolicy.RETAIN,   // or DESTROY for automatic cleanup
    description: 'Deployed by CDK',
    provisionedConcurrentExecutions: 5,
  },
});
```

With `RemovalPolicy.DESTROY`, the previous Version is deleted on every new deployment. However, for rollback possibility, RETAIN + a separate cleanup Lambda is recommended for prod.

> In 2020, a SaaS team accumulated 10,000 Versions on a single function and new deployments failed with `CodeStorageExceededException`. The limit was 75 GB (default) and each Version averaged 8 MB, so the limit was reached at around 9,300 Versions. They recovered by requesting a limit increase from AWS Support plus an emergency Version cleanup. The lessons are (1) monitor the Version limit (the `CloudWatch FunctionVersions` metric), and (2) an automatic prune pipeline is mandatory.

## Function URLs and Aliases

Function URLs, launched in 2022, expose Lambda directly over HTTP without API Gateway.

```bash
aws lambda create-function-url-config \
  --function-name MyFn \
  --qualifier live \
  --auth-type AWS_IAM \
  --cors '{"AllowOrigins":["https://example.com"],"AllowMethods":["GET","POST"]}'
```

With `--qualifier live` you can create a per-Alias URL. The resulting URL is `https://<unique-id>.lambda-url.ap-northeast-2.on.aws`. Each Alias can have its own URL, which makes a natural Blue/Green pattern.

> 🎯 **Scenario**: "How do you expose a single Lambda over HTTPS without API Gateway and separate prod and canary into different URLs?" - The answer is to create two Function URLs, one for the `prod` Alias and one for the `canary` Alias. Clients distribute across the two URLs with weighted DNS (Route 53) or CloudFront origin failover. Compared with API Gateway it saves cost and latency, but it lacks features such as API Keys, throttling, and request validation.

## Wrapping Up

Today's picture has four parts. First, **a Version is an immutable snapshot and an Alias is a mutable pointer** - the same idea as Git's commit/branch, guaranteeing reproducibility and rollback safety. Second, **the Alias weighted routing constraint of primary + 1 secondary** is the cause of CodeDeploy Canary's "one step at a time" structure. Third, **a qualifier is required for API Gateway integration** - a Function ARN permission alone rejects Alias invocations. Fourth, **Provisioned Concurrency and SnapStart** are the two standard solutions to cold starts, but they are incompatible with each other, and SnapStart requires care about the uniqueness assumption.

In the next article, we look at patterns for orchestrating multiple Lambdas with Step Functions and EventBridge. The era of monolithic Lambdas that crammed all the logic into one function is over; now workflow engines manage the flow between functions.

---

## 📝 Practice Questions

**Question 1.** How many Versions can a Lambda Alias's weighted routing point to at the same time?

A) 1 (primary only)
B) 2 (primary + 1 additional)
C) 3
D) Unlimited - possible as long as the weights sum to 1.0

**Answer: B**
Explanation: An Alias can have only `function-version` (primary) plus at most 1 additional Version in `routing-config.AdditionalVersionWeights`. That is, a maximum 2-way split. A 3-way split such as "V5 70%, V6 20%, V7 10%" is impossible. This is the structural reason CodeDeploy Canary proceeds only "one step at a time." If you need a 3-way split, use ALB weighted target groups or Route 53 weighted routing. A frequently tested trap; answering "multiple Versions can be distributed" is wrong.

---

**Question 2.** A Java Spring Boot Lambda has an 8-second cold start that ruins P95 latency. What is the most effective solution?

A) Increase Reserved Concurrency
B) Enable SnapStart + reset uniqueness with a Runtime Hook
C) Use a Lambda Layer
D) Change the architecture to ARM (20% improvement)

**Answer: B**
Explanation: SnapStart creates a memory snapshot of the JVM init phase and skips the init time that accounts for 80-90% of the cold start, cutting 8 seconds to 300-500 ms. Because Spring Boot's ApplicationContext initialization happens in the init phase, the effect is largest. However, parts that need uniqueness guarantees, such as random seeds and UUIDs, must be reinitialized in an `afterRestore` Hook (if not, the same UUID is generated on every call). A is a limit setting unrelated to cold starts, C has a negligible effect, and D gives some improvement but is not the primary solution.

---

**Question 3.** API Gateway invokes the Lambda Alias `MyFn:live` but a 403/Permission denied occurs. What is the most likely cause?

A) A Lambda code bug
B) `aws lambda add-permission` was run without `--qualifier live` → permission only on the Function ARN, Alias invocation denied
C) A missing IAM Role
D) A missing VPC configuration

**Answer: B**
Explanation: Lambda resource policies are evaluated by ARN precision. A permission on `arn:aws:lambda:...:MyFn` (unqualified) allows only `$LATEST` and unqualified invokes, while invoking `arn:aws:lambda:...:MyFn:live` (qualified) needs a separate permission. This is a very common troubleshooting point in both the exam and practice. "Add trigger" in the console automatically grants the permission with the qualifier, but it is easy to omit when writing CLI/CFN by hand. The fix is to specify `add-permission --qualifier live` explicitly.

---

**Question 4.** Is Alias weighted routing possible with `$LATEST`?

A) Possible
B) Not possible - Versions must be positive integers (weighted routing is meaningless on a mutable target)
C) Supported in only some Regions
D) Can be worked around with a Layer

**Answer: B**
Explanation: `$LATEST` is a mutable working copy. Because the code changes every time, it inherently conflicts with the purpose of weighted routing, which is to "compare two different pieces of code." The Lambda API itself rejects `$LATEST` or non-numeric strings for `function-version` (`ValidationException`). PC likewise cannot be set on `$LATEST` - code changes would invalidate the warm-up. The fix is always to create a numeric Version with `publish-version` and use that.

---

**Question 5.** Which is the most accurate difference between Provisioned Concurrency and Reserved Concurrency?

A) The same feature - only the name differs
B) PC keeps pre-warmed containers (paid, eliminates cold starts), while Reserved sets a concurrent execution limit (free, protects other functions)
C) PC is free, Reserved is paid
D) Reserved eliminates cold starts, PC sets a concurrency limit

**Answer: B**
Explanation: The exact distinction between the two concepts appears frequently on the exam. PC aims at "zero cold starts," while Reserved aims at "a limit so that this function cannot eat into other functions' concurrent execution." Invocations exceeding the PC capacity are handled as normal cold starts and are not rejected, whereas exceeding the Reserved limit results in a 429 throttle. PC is billed per usage time, and Reserved is free. Also, PC can be a subset of Reserved (if PC is 10, Reserved is at least 10).

---

**Question 6.** What is the cost impact of a Canary deployment on a function with PC enabled?

A) No change
B) PC is temporarily active on both the old and new Versions, so PC cost roughly doubles (CodeDeploy allocates it automatically)
C) PC is released automatically
D) Cost decreases by 50%

**Answer: B**
Explanation: During a Canary shift, the new Version must also be warm to avoid cold starts, so SAM/CodeDeploy automatically allocates the same PC to the new Version. The result is that PC cost temporarily doubles during the deployment (e.g., PC 10 on V5 + PC 10 on V6 = 20). When the shift completes at 100%, V5's PC is released automatically. When introducing PC for cost-sensitive workloads, this must be calculated in advance. A, C, and D are not true.

---

**Question 7.** After enabling SnapStart, a bug occurred where the same UUID is generated on every call. What are the cause and the fix?

A) A Lambda bug - open an AWS Support request
B) Because it is a snapshot restore, the init-phase random seed is the same in every invocation → reinitialize SecureRandom in the `afterRestore` Hook of `org.crac.Resource`
C) Upgrade the Java version to 17
D) Add a Layer

**Answer: B**
Explanation: SnapStart is image-based persistence, so all memory state from the init phase is duplicated. If `new SecureRandom()` runs only once during init, it starts with the same entropy. A reinitialization such as `SecureRandom.getInstanceStrong()` in `afterRestore` via a Runtime Hook (`org.crac.Core.getGlobalContext().register(this)`) is required. The same problem applies to DB connections, HTTP client pools, and file descriptors, all of which must be re-established through hooks. The uniqueness assumption violation is the most common security trap when adopting SnapStart.

---

**Question 8.** How do you implement Blue/Green by creating Function URLs per Alias?

A) Function URLs are possible only at the whole-function level
B) Create per-Alias URLs with `create-function-url-config --qualifier <alias>` → clients distribute with Route 53 weighted or CloudFront origin failover
C) API Gateway is mandatory
D) Add a Lambda Layer

**Answer: B**
Explanation: Function URLs (launched in 2022) can create per-Version or per-Alias URLs with `--qualifier`. Creating a URL for each of the prod Alias and the canary Alias yields two different endpoints. Client distribution is done with a Route 53 weighted record or CloudFront origin failover. It saves latency and cost compared with API Gateway, but lacks features such as API Keys, throttling, and request validation. A is not true, C is wrong because the key feature of Function URLs is working without API Gateway, and D is unrelated.

---

## 📌 Today's Summary

The key points of the Version/Alias model covered today are five: (1) a Version is an immutable snapshot and an Alias is a mutable pointer, guaranteeing reproducibility and rollback safety, (2) the Alias weighted routing constraint of primary + 1 secondary is the structural cause of CodeDeploy Canary's staged progression, (3) in API Gateway integration, a missing `--qualifier` is the most common cause of permission denials, (4) Provisioned Concurrency means warm-up + paid + Auto Scaling capable, while Reserved Concurrency means a concurrency limit + free, and (5) SnapStart cuts Java cold starts by 90%, but the uniqueness assumption violation must be corrected with a Runtime Hook.
