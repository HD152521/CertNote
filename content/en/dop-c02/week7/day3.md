# Day 3 - Lambda Versions and Aliases: A Mutable Pointer on Top of Immutable Snapshots

Anyone who has operated Lambda functions has probably asked questions like these at least once. "I just deployed new function code; which version do in-flight invocations finish on?" Or "How do I change the function code that API Gateway calls within 5 seconds?" Or "If 5xx errors suddenly spike during a canary deployment, how do I roll back immediately?" The answers to all of these point to one place: the two abstractions called **Lambda Version and Alias**.

The design philosophy of this model is simple. **A Version is an immutable snapshot**, and **an Alias is a mutable pointer to that snapshot**. This is essentially the same as the relationship between a Git commit hash and a branch, or between a Docker image's tag and its sha256 digest. Once code is published (`publish-version`), that Version never changes. A deployment is defined as "create a new Version and change what the Alias points to." This structure makes weighted routing, instant rollback, and multi-environment operation come naturally.

Today we look at the inner workings of these two concepts and the edge cases that often show up as exam traps. CodeDeploy Canary, Provisioned Concurrency, API Gateway Stage Variables, and SnapStart all sit on top of the Version/Alias model.

## Why a Version Is Truly Immutable

```bash
# Upload new code to $LATEST
aws lambda update-function-code --function-name MyFn --zip-file fileb://app.zip

# Publish a Version (at this moment the code + configuration snapshot of $LATEST is frozen as V7)
aws lambda publish-version --function-name MyFn
# {"FunctionName": "MyFn", "Version": "7", "CodeSha256": "abc...", ...}

# Try to change V7's environment variables
aws lambda update-function-configuration \
  --function-name MyFn:7 \
  --environment 'Variables={NEW=value}'
# ❌ An error occurred (InvalidParameterValueException): Lambda was unable to configure your environment variables. Reason: The role defined for the function cannot ...
# More precisely: ResourceConflictException: Cannot modify a published version
```

The moment a Version is published, everything is frozen: the code (`CodeSha256`), environment variables, memory, timeout, runtime, and Layer references. After that, the only things you can still change for that Version are the **Resource Policy** and the **Provisioned Concurrency configuration**.

Why does this immutability matter? Because of **reproducibility** and **rollback safety**. Only if there is a guarantee that calling yesterday's V6 again today runs in the same code and environment can you make the comparison "it worked on V6 yesterday but broke on V7 today." If Versions were mutable, debugging would be hell.

> The immutable snapshot model is the same pattern as the functional programming **persistent data structure** (Chris Okasaki, 1996). Git commits, Docker image digests, AWS AMI IDs, S3 object versions, and Kubernetes ReplicaSets all share the same idea. The key is the principle that "what has been created is never changed, and a change creates a new object." If this principle breaks, the consistency and debuggability of a distributed system collapse. The Lambda Version is the enforcement mechanism for this principle.

> `$LATEST` is an unversioned mutable working copy. Version numbers increase as positive integers starting from 1, and a number that has been used is never recycled (even after `delete-function --qualifier 5`, V5 stays permanently a gap). This is the same guarantee as a Git commit hash never being reused once created, even after garbage collection. The `CodeSha256` field is the SHA-256 of the zip contents, so publishing the same code twice yields the same sha256 but different Version numbers. This can be used for idempotency checks such as CI re-runs.

## Alias: The Cloud Version of a Symbolic Link

```bash
# Create an Alias — a 'live' pointer to V5
aws lambda create-alias \
  --function-name MyFn \
  --name live \
  --function-version 5

# Use the Alias when invoking
aws lambda invoke \
  --function-name MyFn:live \
  --payload '{}' out.json
# V5 runs internally

# Change what the Alias points to (traffic shifts immediately)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 6
# V6 runs from the next invocation
```

An Alias is the same kind of abstraction as a Unix symbolic link, a Git branch, or a DNS CNAME. The real target lives elsewhere, and the Alias is a single line of name -> target mapping. Because the cost of a change is nearly zero (updating one line of metadata), **traffic can be shifted within tens of milliseconds**.

The most important application is **Weighted Routing**.

```bash
# 90% to V5, 10% to V6 (Canary)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \
  --routing-config 'AdditionalVersionWeights={"6"=0.1}'
```

The invoker inside the Lambda service generates a random number for each request and routes to V5 or V6 according to the weights. This process is **stateless**, so even the same user can reach a different Version on every request (sticky routing is not possible).

> ⚠️ **Trap**: Alias weighted routing allows only **1 primary + 1 additional** Version. That is, an Alias can point to at most 2 Versions at the same time. A 3-way split such as "V5 70%, V6 20%, V7 10%" is impossible. If the exam presents a scenario like "distribute traffic across 3 Versions at once," the answer is one of (1) split it into two Canary stages (V5->V6, then V6->V7), (2) use an Application Load Balancer weighted target group, or (3) use Route 53 weighted routing. This single constraint is the structural reason CodeDeploy Canary proceeds only "one step at a time."

> 🎯 **Scenario**: "An Alias 'prod' points to V10. We deploy V11 and want to verify it with 5% of traffic for 30 minutes. How do we configure this?" The answer is `update-alias --function-version 10 --routing-config 'AdditionalVersionWeights={"11"=0.05}'`, then 30 minutes later `--function-version 11 --routing-config '{}'`. These two steps can be automated in a single line with CodeDeploy `Canary5Percent30Minutes`.

## How CodeDeploy Shifts the Alias

When a SAM function with `AutoPublishAlias` + `DeploymentPreference` is deployed, CodeDeploy performs the following sequence.

```
1. CFN updates the Lambda function code (-> $LATEST is updated)
2. CFN calls publish-version -> V7 is created
3. CFN creates a CodeDeploy Deployment
4. CodeDeploy runs the PreTraffic Hook Lambda
   ↓ On failure -> deployment stops, V6 is kept
5. CodeDeploy sets Alias weighted routing
   live: V6=90%, V7=10%
6. CloudWatch Alarm monitoring (5/30 minutes)
   ↓ Alarm fires -> live: V6=100%, V7=0% (rollback)
7. Wait time ends -> live: V6=0%, V7=100%
8. CodeDeploy runs the PostTraffic Hook Lambda
   ↓ On failure -> rollback
9. Deployment complete, V6 is preserved in history
```

Every step of this flow works on top of the **mutability of the Alias**. Each traffic shift is a single `update-alias` API call, and a rollback is just another call to the same API with different parameters.

```yaml
# SAM Template — the complete Canary + Hook + Alarm setup
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
        Value: !Sub '${GetOrderFn}:live'   # <- split per Alias!
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 2
    Threshold: 1
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
```

> Lambda CloudWatch Metrics have only the `FunctionName` dimension by default, but adding the `Resource` dimension produces separate metrics per Alias/Version, such as `MyFn:live` and `MyFn:7`. To see the error rates of the old and new Versions separately during a Canary deployment, this dimension is essential. The extra cost is the standard rate per metric (the first 10,000 free, then $0.30/metric). A PostTraffic Hook often queries these separated metrics and contains code that checks whether the new Version's P99 latency is under 1.5 times the previous one.

> In 2021, an e-commerce company deploying with Canary10Percent5Minutes had no Error Alarm fire within the 5 minutes, shifted to 100%, and then had a memory leak explode in the following hours. The causes were (1) the leak was gradual and did not reach the threshold within 5 minutes, and (2) the Alarm used a 1-minute average, so it caught only spikes and missed the cumulative pattern. Afterward the team lengthened the deployment to `Canary10Percent30Minutes` and changed the PostTraffic Hook to also check the memory usage trend. The lesson: set the Canary duration based on the slowest failure pattern in the scenario.

## Two Ways API Gateway Points to an Alias

This is the most commonly tested pattern for the API Gateway -> Lambda integration.

**Method 1: The Stage Variable pattern (REST API)**

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

This pattern makes it possible to use a **different Alias per Stage**. The `dev` Stage uses `lambdaAlias=staging`, and the `prod` Stage uses `lambdaAlias=live`. When the function code changes, there is no need to redeploy API Gateway; the Alias shift takes effect immediately.

**Method 2: Referencing the Alias ARN directly (HTTP API or static integration)**

```bash
aws apigatewayv2 create-integration \
  --api-id xyz \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:...:MyFn:live \
  --payload-format-version 2.0
```

In this case the Integration's URI itself is the Alias ARN. To change it, you must update the Integration itself.

> ⚠️ **Trap**: For API Gateway to invoke Lambda, a **resource-based policy** is needed on the Lambda side, and it is added with the `add-permission` API. The `--qualifier` flag is the key.

```bash
# ❌ Wrong way — permission on the Function ARN only
aws lambda add-permission \
  --function-name MyFn \
  --statement-id api-gw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com

# ✅ Right way — permission on the Alias
aws lambda add-permission \
  --function-name MyFn \
  --qualifier live \
  --statement-id api-gw-invoke-live \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn 'arn:aws:execute-api:ap-northeast-2:111:abc123/*/GET/orders/*'
```

A permission on the Function ARN applies only to `$LATEST` invocations. Invoking the Alias (MyFn:live) needs a separate resource policy. If you add it through "Add trigger" in the console, API Gateway grants the permission with the exact qualifier for you, but with manual CLI/CFN you must specify it explicitly. On the exam, the answer to the scenario "API Gateway calls are denied" is almost always this missing qualifier.

## Provisioned Concurrency: The Cost vs. Effect of Warm-Up

PC is a feature that "keeps N containers warm in advance."

```bash
# Set 10 PC on the Alias 'live'
aws lambda put-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier live \
  --provisioned-concurrent-executions 10
```

PC can be configured at the **Version or Alias** level, but not on `$LATEST`. If PC were placed on a mutable target, the warm-up would be invalidated by every code change and would be meaningless.

| Item | Reserved Concurrency | Provisioned Concurrency |
|------|----------------------|--------------------------|
| Purpose | Set a concurrent execution limit (protect other functions) | Pre-warming (eliminate cold starts) |
| Cost | Free | Proportional to active time ($0.0000041667/GB-s) |
| Cold Start | No effect (throttled when the limit is reached) | Eliminated (within PC capacity) |
| Applies to | Function | Alias or Version |
| When the limit is reached | 429 Throttle | Falls back to ordinary cold starts (the request is still processed) |
| Auto Scaling | Not possible | Application Auto Scaling possible |

```bash
# Adjust PC automatically with Target Tracking (target 70% utilization)
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

> What happens when a Canary deployment occurs while PC is on? The answer is "**both Versions must have PC**." SAM `DeploymentPreference` automatically pre-allocates PC to the new Version before starting the shift. Without automatic allocation, the new Version would suffer full cold starts as soon as it received traffic, defeating the purpose of the Canary. The result is that **PC cost temporarily doubles** during the deployment (PC 10 on V5 and PC 10 on V6 at the same time). For cost-sensitive workloads, this is a reason to hesitate over PC.

> When PC usage exceeds PC capacity, the overflow is handled as ordinary cold starts and the invocations are not rejected (this is the difference from Reserved). So even if 100 concurrent invocations arrive at a function with 5 PC, the first 5 are served without cold starts and the remaining 95 are served as ordinary cold starts. Understand precisely that PC is a "warm-up boost," not a throttle. As an exam trap, the option "PC also acts as a limit" is used as a wrong answer.

## SnapStart: The Cold Start Revolution for Java

SnapStart, announced at re:Invent 2022, is a feature that creates a **memory snapshot of the JVM init phase** in advance.

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

When you publish a new Version after enabling it, Lambda does the following in the background.

1. Runs the function's init phase in a temporary microVM (for example, initializing Spring Boot's ApplicationContext)
2. Captures a snapshot of memory and disk state -> encrypts it and stores it in a distributed fashion
3. Subsequent invocations start from a snapshot restore -> the init phase is skipped

The effect is dramatic. The cold start of a Spring Boot Lambda drops from 5~10 seconds to **300~500ms** (about a 90% reduction).

| Item | Value |
|------|-----|
| Supported runtimes | Java 11/17/21, Python 3.12+, .NET 8+ (added in late 2024) |
| Supported packages | zip only (Container Image not supported) |
| Java cost | Free |
| Python/.NET cost | $0.0000015625/GB-s (snapshot cache) + restore time billing |
| Compatibility constraint | Cannot be used together with Provisioned Concurrency |

> SnapStart is the same idea as the **image-based persistence** of Self/Smalltalk in the 1980s. It saves the whole program execution state (memory pages, CPU registers) and restores it to skip the start-up time. In modern times, VMware's vMotion, Google's zigzag (snapshot-based cold boot), and CRIU (Checkpoint/Restore in Userspace for Linux) follow the same pattern. SnapStart exposes the snapshot capability of the Firecracker MicroVM to Lambda.

> The **uniqueness assumption violation** caused by SnapStart: because it is a snapshot restore, the results of `random.seed()`, `UUID.randomUUID()`, and `Instant.now()` from the init phase start out identical in every invocation. This is a serious security problem (predictable token generation). The fix is a **Runtime Hook**.

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
        // Right before the snapshot — close DB connections, clear caches
    }

    @Override
    public void afterRestore(org.crac.Context<? extends Resource> context) {
        // Right after the snapshot restore — reset the random seed, re-establish connections
        SecureRandom.getInstanceStrong();  // new entropy pool
    }
}
```

If you forget this hook, you get the terrible bug of the same UUID being produced on every call. On the exam, the answer to the scenario "the same token is generated after enabling SnapStart" is to add a Runtime Hook.

## Version Pruning: Managing Ever-Growing Versions

If you deploy 5 times a day with CodeDeploy Canary, you have 1,800 Versions after a year. Lambda has a 75GB Version limit per function, so large functions reach the limit quickly.

```bash
# Identify and delete Versions unused for 90+ days
# (look up the last invocation time from CloudWatch Logs)
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
    removalPolicy: cdk.RemovalPolicy.RETAIN,   // or DESTROY to clean up automatically
    description: 'Deployed by CDK',
    provisionedConcurrentExecutions: 5,
  },
});
```

With `RemovalPolicy.DESTROY`, the previous Version is deleted on every new deployment. However, for rollback possibilities, prod is recommended to use RETAIN plus a separate cleanup Lambda.

> In 2020, a SaaS team accumulated 10,000 Versions on a single function, and new deployments failed with `CodeStorageExceededException`. The limit was 75GB (default) and each Version averaged 8MB, so the limit was reached at around 9,300 Versions. They recovered by requesting a limit increase from AWS Support plus an emergency Version cleanup. The lessons are (1) monitor the Version limit (the `CloudWatch FunctionVersions` metric) and (2) an automatic pruning pipeline is essential.

## Function URLs and Aliases

Function URLs, released in 2022, expose Lambda directly over HTTP without API Gateway.

```bash
aws lambda create-function-url-config \
  --function-name MyFn \
  --qualifier live \
  --auth-type AWS_IAM \
  --cors '{"AllowOrigins":["https://example.com"],"AllowMethods":["GET","POST"]}'
```

With `--qualifier live`, you can create a URL per Alias. The resulting URL is `https://<unique-id>.lambda-url.ap-northeast-2.on.aws`. Each of several Aliases can have its own URL, which makes for a natural Blue/Green pattern.

> 🎯 **Scenario**: "How do we expose a single Lambda over HTTPS without API Gateway and separate prod and canary onto different URLs?" The answer is to create two Function URLs, one on the `prod` Alias and one on the `canary` Alias. Clients distribute across the two URLs with weighted DNS (Route 53) or CloudFront origin failover. Cost and latency are lower than with API Gateway, but features such as API Keys, throttling, and request validation are missing.

## Summary

We saw four pictures today. First, **a Version is an immutable snapshot and an Alias is a mutable pointer**, the same idea as Git's commit/branch, which guarantees reproducibility and rollback safety. Second, the **Alias weighted routing constraint of primary + 1 secondary** is the cause of CodeDeploy Canary's "one step at a time" structure. Third, **the qualifier is mandatory for API Gateway integration**: a Function ARN permission alone leads to denied Alias invocations. Fourth, **Provisioned Concurrency and SnapStart** are the two standard solutions to cold starts, but they are not compatible with each other, and SnapStart requires care about uniqueness assumptions.

In the next post, we look at patterns for orchestrating multiple Lambda functions with Step Functions and EventBridge. The era of the monolithic Lambda that crammed all the logic into one function is over, and now it is the era of workflow engines managing the flow between functions.

---

## 📝 Practice Questions

**Question 1.** What is the purpose of configuring throttling in API Gateway?

A) Limiting Lambda function execution time  
B) Limiting the API request rate to defend against DDoS and control cost  
C) Caching API responses  
D) Managing the CORS policy  

**Answer: B**
Explanation: Throttling limits the request rate per account or per method. It defends against malicious requests and prevents cost explosions by limiting Lambda concurrent executions.

---

**Question 2.** What if multiple different systems must process the same message?

A) Store the message in an SQS queue  
B) Publish to an SNS topic and have each system subscribe  
C) Call an external API from Lambda each time  
D) Store the message in S3  

**Answer: B**
Explanation: The SNS pub/sub pattern is suited to cases where multiple subscribers independently receive one message. With SQS, only one consumer processes a message.

---

**Question 3.** What if Lambda needs to handle asynchronous work?

A) Synchronous invocation from API Gateway  
B) SQS queue → EventBridge pattern  
C) Map an SQS queue as the event source for Lambda, or subscribe to an SNS topic  
D) Polling S3  

**Answer: C**
Explanation: A Lambda event source mapping polls SQS, or an SNS topic subscription automatically triggers Lambda. This is the standard for asynchronous processing.

---

**Question 4.** How many versions can a Lambda alias's weighted routing point to at the same time?

A) 1 (primary only)  
B) 2 (primary + 1 additional)  
C) 3  
D) Unlimited — possible as long as the weights sum to 1.0  

**Answer: B**
Explanation: An alias can have `function-version` (primary) plus at most one additional version in `routing-config.AdditionalVersionWeights`. That is, a maximum 2-way split. A 3-way split such as "V5 70%, V6 20%, V7 10%" is not possible. This is the structural reason CodeDeploy Canary proceeds only "one step at a time." If you need a 3-way split, use an ALB weighted target group or Route 53 weighted routing. It is a frequent exam trap: answering "multiple versions can be distributed" is wrong.

---

**Question 5.** A Java Spring Boot Lambda function has an 8-second cold start that ruins P95 latency. What is the most effective solution?

A) Increase reserved concurrency  
B) Enable SnapStart + reset uniqueness with runtime hooks  
C) Use a Lambda layer  
D) Change the architecture to ARM (20% improvement)  

**Answer: B**
Explanation: SnapStart takes a memory snapshot of the JVM init phase and skips the init time, which accounts for 80 to 90% of the cold start. 8 seconds → 300 to 500 ms. Because Spring Boot's ApplicationContext initialization happens in the init phase, the effect is largest. However, parts that need uniqueness guarantees, such as random seeds and UUIDs, must be re-initialized in the `afterRestore` hook (otherwise every invocation generates the same UUID). A is a limit setting and unrelated to cold starts, C has a negligible effect, and D gives partial improvement but is not the primary solution.

---

**Question 6.** API Gateway invokes the Lambda alias `MyFn:live` and gets 403/Permission denied. What is the most likely cause?

A) A bug in the Lambda code  
B) `aws lambda add-permission` was run without `--qualifier live` → the permission applies only to the function ARN, and alias invocations are denied  
C) The IAM role is missing  
D) The VPC configuration is missing  

**Answer: B**
Explanation: Lambda resource policies are evaluated by ARN exactness. A permission on `arn:aws:lambda:...:MyFn` (unqualified) allows only `$LATEST` and unqualified invokes; invoking `arn:aws:lambda:...:MyFn:live` (qualified) requires a separate permission. This is a very common troubleshooting point on the exam and in practice. The console's "Add trigger" automatically grants a permission that includes the qualifier, but it is easy to miss when writing by hand with the CLI/CFN. The fix is to specify `add-permission --qualifier live`.

---

**Question 7.** Can alias weighted routing be used with `$LATEST`?

A) Yes  
B) No — versions must be positive integers (weighted routing on a mutable target is meaningless)  
C) Only supported in some Regions  
D) It can be worked around through a layer  

**Answer: B**
Explanation: `$LATEST` is a mutable working copy. Because the code changes every time, it fundamentally conflicts with the purpose of weighted routing, "comparing two different pieces of code." The Lambda API itself rejects `$LATEST` or non-numeric strings for `function-version` (`ValidationException`). PC likewise cannot be configured on `$LATEST` — code changes would invalidate the warm-up. The fix is to always create a numbered version with `publish-version` and use that.

---

**Question 8.** What is the most accurate difference between provisioned concurrency and reserved concurrency?

A) They are the same feature — only the names differ  
B) PC keeps pre-warmed containers (paid, eliminates cold starts), while reserved sets a concurrency limit (free, protects other functions)  
C) PC is free and reserved is paid  
D) Reserved eliminates cold starts and PC sets the concurrency limit  

**Answer: B**
Explanation: The exact distinction between the two concepts frequently appears on the exam. PC aims for "zero cold starts"; reserved aims to "cap this function so it cannot eat into other functions' concurrency." Invocations beyond the PC limit are handled as ordinary cold starts and are not rejected, but exceeding the reserved limit results in a 429 throttle. PC is billed per time in use, and reserved is free. Also, PC can be a subset of reserved (if PC is 10, reserved must be at least 10).

---

**Question 9.** What is the cost impact on a function with PC enabled during a canary deployment?

A) No change  
B) PC is temporarily active on both the old and new versions, so the PC cost roughly doubles (CodeDeploy allocates it automatically)  
C) PC is released automatically  
D) Cost decreases by 50%  

**Answer: B**
Explanation: During a canary shift the new version must also be warm to avoid cold starts, so SAM/CodeDeploy automatically allocates the same PC to the new version. The result is that PC cost temporarily doubles during deployment (for example, PC 10 on V5 + PC 10 on V6 = 20). When the shift completes to 100%, V5's PC is released automatically. When adopting PC for cost-sensitive workloads, you should calculate this in advance. A/C/D are not factual.

---

**Question 10.** After enabling SnapStart, a bug occurs where the same UUID is generated on every invocation. What is the cause and the fix?

A) A Lambda bug — contact AWS Support  
B) Because the snapshot is restored, the random seed from the init phase is the same in every invocation → reinitialize SecureRandom in the `afterRestore` hook of `org.crac.Resource`  
C) Upgrade the Java version to 17  
D) Add a layer  

**Answer: B**
Explanation: SnapStart is image-based persistence, so all memory state from the init phase is cloned. If `new SecureRandom()` is executed only once during init, it starts with the same entropy. You must reinitialize using a runtime hook (`org.crac.Core.getGlobalContext().register(this)`) in `afterRestore`, such as with `SecureRandom.getInstanceStrong()`. The same problem applies to DB connections, HTTP client pools, and file descriptors, all of which must be re-established through hooks. Uniqueness assumption violation is the most common security trap when adopting SnapStart.

---

**Question 11.** How do you implement Blue/Green by creating a function URL per alias?

A) A function URL can only be created for the whole function  
B) Create a URL per alias with `create-function-url-config --qualifier <alias>` → clients distribute traffic with Route 53 weighted records or CloudFront origin failover  
C) API Gateway is required  
D) Add a Lambda layer  

**Answer: B**
Explanation: A function URL (launched in 2022) can be created per version or alias with `--qualifier`. Creating a URL for each of the prod alias and the canary alias gives you two different endpoints. Client distribution is done with a Route 53 weighted record or CloudFront origin failover. It reduces latency and cost compared with API Gateway, but lacks features such as API keys, throttling, and request validation. A is not true, C is wrong because a key feature of function URLs is working without API Gateway, and D is unrelated.
