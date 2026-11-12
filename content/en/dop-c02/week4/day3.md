# Day 3 - Lambda Deployment: Linear/Canary/AllAtOnce and the Math of Aliases

Lambda deployment has no instances. There's no concept of "spinning up a new server"; instead, there are **versions** of function code and **Aliases** that point to those versions. Blue/Green's "traffic shift" is implemented here as a change in Alias weighted routing.

This simplicity is its strength. Rollback is just reversing the Alias weight to the previous version — completed in seconds. There's no need to terminate new servers or reconfigure load balancers. But behind this simplicity lies a mathematical understanding of "exactly how much traffic goes to which version." That's the difference between Canary and Linear, and it's the most frequently confused topic on the exam.

Today we cover the complete Lambda deployment picture — Version/Alias relationships, Deployment Configuration math, Pre/Post Hook design, SAM integration, and Provisioned Concurrency cost models.

> 💡 **Day 3's core framework**: Lambda deployment strategy choice is a function of two variables — (1) how long it takes to detect failure, (2) the scope of impact if failure occurs. Fast detection → Canary; need gradual load observation → Linear. With this judgment framework, exam answers become clear.

---

## Lambda Deployment Complete Architecture

```
[sam deploy / aws lambda update-function-code]
        │
        ▼
[Publish new Lambda Version (publish-version)]
   → Immutable snapshot (code + config + env vars fixed)
        │
        ▼
[Update Alias (update-alias)]
   → routing-config: Primary 90% + Secondary(new) 10%
        │
        ▼
[CodeDeploy Deployment Group monitors]
   → Auto-adjust weights per Canary/Linear schedule
   → Execute Pre/Post Hook Lambda
   → Monitor CloudWatch Alarms
        │
   ┌────┴────┐
   │         │
Success    Alarm triggered
   │         │
100% shift  Immediate rollback (Alias → old Version 100%)
```

> 🔍 **Going deeper**: Lambda Version is an immutable snapshot. After `publish-version`, code, runtime, environment variables, memory, and timeout are all fixed. This immutability guarantees that "other changes don't pollute the deployment." Conversely, `$LATEST` is a mutable pointer always pointing to the latest state, so if someone changes code during deployment, deployment results vary. Canary deployment must only use Version, never `$LATEST`.

---

## Lambda Version and Alias Relationship

```bash
# 1. Publish new Version after code change
aws lambda publish-version \
  --function-name MyFn \
  --description "v2.1.0 - fixed checkout bug"
# → Version 6 created (immutable snapshot)

# 2. Check current Alias (currently Version 5: 100%)
aws lambda get-alias --function-name MyFn --name live

# 3. Start Canary (10% to Version 6)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \
  --routing-config AdditionalVersionWeights='{"6": 0.1}'
# Alias "live" → Version 5: 90%, Version 6: 10%

# 4. Full switch
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 6
  # No routing-config → Version 6: 100%
```

**Core constraints:**
- Only **one Version** can be added via `routing-config` per Alias
- Primary(function-version) + Secondary(routing-config) = maximum 2 Versions
- "Simultaneous A/B/C test with three versions" is not possible with single Alias
- `$LATEST` cannot be used in routing-config (mutable pointer)

**Alias ARN structure:**
```
arn:aws:lambda:ap-northeast-2:123456789:function:MyFn:live
                                                        ^^^^
                                                        Alias name
```

Callers only need to know the Alias ARN. Version switching happens transparently.

> 💡 **Related theory**: Lambda Alias weighted routing is **stochastic branching**. Each invocation independently generates a random number and selects the Version based on weights. With 10% Canary, on average 10% goes to the new version, but exactly 100 out of 1000 invocations isn't guaranteed. It's statistically 10%. This is why the answer to "exactly 10% of users affected during Canary 10% period?" is "no, statistically 10%." Session stickiness is not built-in by default.

> ⚠️ **Pitfall**: `$LATEST` cannot be used in routing-config on Alias. `$LATEST` is a mutable pointer always pointing to the latest code, different from Version which is an immutable snapshot. Canary deployment must create immutable Versions with `publish-version` first. If you see "$LATEST for Canary deployment" on the exam, it's always wrong.

---

## Deployment Configuration Math: Canary vs Linear

**Traffic distribution by time:**

| Config | 0 min | 1 min | 2 min | 5 min | 10 min | 20 min | Full switch time |
|--------|-------|-------|-------|-------|--------|--------|------------------|
| `LambdaAllAtOnce` | **100%** | — | — | — | — | — | 0 min |
| `LambdaCanary10Percent5Minutes` | 10% | 10% | 10% | **100%** | — | — | After 5 min |
| `LambdaCanary10Percent30Minutes` | 10% | 10% | 10% | 10% | 10% | 10% | **After 30 min** |
| `LambdaLinear10PercentEvery1Minute` | 10% | 20% | 30% | 50% | **100%** | — | 10 min |
| `LambdaLinear10PercentEvery10Minutes` | 10% | 10% | 10% | 10% | 20% | 30% | **100 min** |

**Canary logic**: Only 2 phases. Observe a small percentage (10%) for specified time, if no issues, switch all remaining (90%) at once. Suitable for "fast go/no-go decision."

**Linear logic**: N phases. Increment evenly to reach 100%. Suitable for "observe gradual load increase, validate at each step."

```
Canary10Percent5Minutes:          Linear10PercentEvery1Minute:
                                  
100% │         ████               100% │          █
     │         █                       │         ██
 10% │ ████████                    50% │        ███
     │                                 │    ██████
     └─────────────────────            └────────────────────
     0     5 min                      0   5 min  10 min
     
     [2 phases: observe then switch]   [10 phases: even increment]
```

**Custom Deployment Configuration:**
```bash
aws deploy create-deployment-config \
  --deployment-config-name MyCanary5Percent10Min \
  --compute-platform Lambda \
  --traffic-routing-config \
    "type=TimeBasedCanary,timeBasedCanary={canaryPercentage=5,canaryInterval=10}"

# Linear Custom:
aws deploy create-deployment-config \
  --deployment-config-name MyLinear20Percent5Min \
  --compute-platform Lambda \
  --traffic-routing-config \
    "type=TimeBasedLinear,timeBasedLinear={linearPercentage=20,linearInterval=5}"
```

> 🔍 **Going deeper**: The choice between Canary and Linear is a **Risk Tolerance vs Validation Speed** trade-off. For a financial transaction function, you want to validate sufficiently over Canary 10% 30 minutes — observe small traffic for long. For a static content transformation function, Linear 10%/1min to complete in 10 minutes is sufficient. Consider both "how long it takes to detect failure" and "scope of impact if failure occurs." For functions where failure appears immediately (synchronous API), Canary is more fitting; for functions where failure accumulates (batch processing), Linear is better.

> 📚 **Case study**: In 2021, Stripe Engineering adopted Canary10Percent30Minutes for payment processing Lambda. During 30 minutes observation, 10% of actual payment transactions get processed by the new version. CloudWatch monitors `PaymentErrors` custom metric during this period, auto-rollback if threshold exceeded. After launch, 4 auto-rollbacks occurred, all automatically recovered within 30 minutes. Given the high cost of payment system failures, the 30-minute observation window was justified.

---

## Pre/Post Traffic Hook: Automatic Validation Gate

Hook placement:
```
[Before traffic shift starts]
    BeforeAllowTraffic (= PreTraffic Hook)
        → Smoke test directly on new Version
        → If failed, rollback without traffic shift
[Traffic shift]
[After traffic shift completes]
    AfterAllowTraffic (= PostTraffic Hook)
        → Validate with real traffic
        → If failed, rollback to previous Version
```

**Hook Lambda implementation (BeforeAllowTraffic):**
```python
import boto3, json, os

deploy = boto3.client('codedeploy')
fn_client = boto3.client('lambda')

def handler(event, context):
    """BeforeAllowTraffic Hook: smoke test new version before traffic shift"""
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    target_fn = event.get('FunctionName', os.environ.get('TARGET_FUNCTION'))
    target_ver = event.get('TargetVersion')

    try:
        # Invoke new Version directly (via Version ARN, not Alias)
        resp = fn_client.invoke(
            FunctionName=f'{target_fn}:{target_ver}',
            InvocationType='RequestResponse',
            Payload=json.dumps({'action': 'smoke-test'})
        )
        payload = json.loads(resp['Payload'].read())
        
        ok = (resp['StatusCode'] == 200 and 
              'FunctionError' not in resp and
              payload.get('status') == 'ok')
        
        status = 'Succeeded' if ok else 'Failed'

    except Exception as e:
        print(f"Hook error: {e}")
        status = 'Failed'

    # Report result — without this API call, deployment fails on Timeout
    deploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_id,
        status=status
    )
    return {'status': status}
```

**IAM permissions the Hook Lambda must have:**
```json
{
  "Effect": "Allow",
  "Action": [
    "codedeploy:PutLifecycleEventHookExecutionStatus",
    "lambda:InvokeFunction"
  ],
  "Resource": "*"
}
```

Without `PutLifecycleEventHookExecutionStatus`, the Hook cannot report its result to CodeDeploy. CodeDeploy treats the Hook as unresponsive and deployment fails on Timeout (default 3600 seconds).

**AfterAllowTraffic Hook pattern:**
```python
def handler(event, context):
    """AfterAllowTraffic: validate after real traffic processing"""
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    
    # Query real error metrics from CloudWatch
    cw = boto3.client('cloudwatch')
    resp = cw.get_metric_statistics(
        Namespace='AWS/Lambda',
        MetricName='Errors',
        Dimensions=[
            {'Name': 'FunctionName', 'Value': os.environ['TARGET_FN']},
            {'Name': 'Resource', 'Value': f"{os.environ['TARGET_FN']}:live"}
        ],
        StartTime=datetime.utcnow() - timedelta(minutes=5),
        EndTime=datetime.utcnow(),
        Period=300,
        Statistics=['Sum']
    )
    
    error_count = sum(d['Sum'] for d in resp['Datapoints'])
    status = 'Succeeded' if error_count < 10 else 'Failed'
    
    boto3.client('codedeploy').put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_id,
        status=status
    )
```

> ⚠️ **Pitfall**: The Hook Lambda's execution result (success/failure) and the result reported via `PutLifecycleEventHookExecutionStatus` are separate. Even if Hook Lambda terminates normally (exit 0), if `PutLifecycleEventHookExecutionStatus` is not called, CodeDeploy doesn't know the Hook result. You must report `Succeeded` or `Failed` via API call. Hook Lambda execution timeout (15 min) is shorter than CodeDeploy Hook Timeout (3600 sec), so complete reporting before Lambda timeout.

> 💡 **Related theory**: Pre/Post Hook is the **Deployment Gate** pattern. "If the automated quality gate doesn't pass, don't proceed to the next step." This corresponds to "validation automation" in CALMS's Automation axis. Instead of manual post-deployment verification, the Hook validates automatically and auto-rolls back on failure. This pattern directly reduces DORA's Change Failure Rate.

---

## SAM/CDK Integration: Automation with AutoPublishAlias

**SAM template.yaml:**
```yaml
Transform: AWS::Serverless-2016-10-31

Resources:
  CheckoutFn:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src/checkout/
      Handler: app.handler
      Runtime: python3.11
      Architectures: [arm64]
      Tracing: Active                    # Enable X-Ray automatically
      AutoPublishAlias: live             # Auto-publish Version + create Alias per deployment
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Hooks:
          PreTraffic: !Ref PreTrafficCheck
          PostTraffic: !Ref PostTrafficCheck
        Alarms:
          - !Ref ErrorRateAlarm
          - !Ref P99LatencyAlarm

  PreTrafficCheck:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src/hooks/
      Handler: pre.handler
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - codedeploy:PutLifecycleEventHookExecutionStatus
                - lambda:InvokeFunction
              Resource: '*'

  ErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: CheckoutFn-ErrorRate
      Namespace: AWS/Lambda
      MetricName: Errors
      Dimensions:
        - Name: FunctionName
          Value: !Ref CheckoutFn
        - Name: Resource
          Value: !Sub '${CheckoutFn}:live'   # Alias-level metric
      Statistic: Sum
      Period: 60
      EvaluationPeriods: 2
      Threshold: 5
      ComparisonOperator: GreaterThanThreshold
      TreatMissingData: notBreaching
```

What `AutoPublishAlias: live` does (in order):
1. When `sam deploy` runs, auto-publish new Lambda Version
2. Update Alias "live" to new Version (adjust weights via routing-config)
3. If `DeploymentPreference` present, auto-create CodeDeploy Application + Deployment Group
4. Auto-execute Canary/Linear deployment
5. Auto-rollback if Alarms trigger

One line (`AutoPublishAlias`) automates Version management, Alias management, CodeDeploy integration, and alarm-based rollback.

**CDK equivalent:**
```python
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_codedeploy as codedeploy
from aws_cdk import aws_cloudwatch as cloudwatch

fn = lambda_.Function(self, 'CheckoutFn', ...)
alias = lambda_.Alias(self, 'LiveAlias',
    alias_name='live',
    version=fn.current_version
)
deployment_group = codedeploy.LambdaDeploymentGroup(self, 'DG',
    alias=alias,
    deployment_config=codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES,
    alarms=[error_rate_alarm],
    auto_rollback=codedeploy.AutoRollbackConfig(
        deployment_in_alarm=True,
        stopped_deployment=True
    )
)
```

> 📚 **Case study**: A team previously deployed Lambda by calling `$LATEST` directly. When deployment errors occurred, 100% switch already happened, taking 10 minutes to recover. After switching to SAM `AutoPublishAlias` + Canary10Percent5Minutes, when the same error occurred, auto-rollback happened after 5 minutes, affecting only 10% of traffic. The remaining 90% was processed normally by the old version.

---

## Provisioned Concurrency and Deployment: Cost Pitfall

Provisioned Concurrency (PC) pre-warms Lambda execution environments to remove cold starts.

**PC cost structure during Canary deployment:**
```bash
# Pre-configure PC on new Version 6
aws lambda put-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier 6 \
  --provisioned-concurrent-executions 10

# Wait for PC to be ready
aws lambda get-provisioned-concurrency-config \
  --function-name MyFn --qualifier 6
# Wait until Status: READY

# Then start Alias Canary
```

**PC cost per deployment phase:**

| Phase | Version 5 (old) | Version 6 (new) | Cost |
|-------|-----------------|-----------------|------|
| Before Canary starts | PC 10 | None | Normal |
| Canary in progress | PC 10 (90%) | PC 10 warming (10%) | **~2x** |
| After 100% switch | PC removed | PC 10 kept | Normal |
| Old Version PC cleanup | Manual delete (`delete-provisioned-concurrency-config`) | — | — |

After full switch, you must manually delete the old version's PC. It doesn't auto-delete.

```bash
# Delete old version PC after switch completes
aws lambda delete-provisioned-concurrency-config \
  --function-name MyFn \
  --qualifier 5
```

> 💡 **Related theory**: The cost model of Provisioned Concurrency + Canary deployment is the same logic as EC2 Blue/Green's "temporary 2× instance cost." While two versions are active simultaneously, both incur costs. The difference is EC2 is instance-based, Lambda PC is "warmed execution environment" based. Longer Canary period means more accumulated additional cost. Canary30Minutes means 30 min of additional PC cost; Canary5Minutes means only 5 min.

> ⚠️ **Pitfall**: Old version's Provisioned Concurrency doesn't auto-delete after deployment completes. You must manually execute `delete-provisioned-concurrency-config`, or if Lambda Application Auto Scaling manages PC, update the schedule. Forgetting this means unused old version PC keeps getting charged.

---

## CloudWatch Alarm Design: Alias-level Metrics

Lambda metrics aggregate at function-level, specific Version, or Alias level.

```bash
# Alias-level Alarm (suitable for Canary deployment monitoring)
aws cloudwatch put-metric-alarm \
  --alarm-name "MyFn-live-ErrorRate" \
  --namespace "AWS/Lambda" \
  --metric-name "Errors" \
  --dimensions "Name=FunctionName,Value=MyFn" "Name=Resource,Value=MyFn:live" \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching
```

`Resource=MyFn:live` counts only errors from invocations via Alias "live". During Canary 10%, errors from the new version are also included. If errors exceed threshold, alarm triggers → auto-rollback.

**Combine multiple conditions with Composite Alarm:**
```bash
# Combine error rate alarm + P99 latency alarm with OR
aws cloudwatch put-composite-alarm \
  --alarm-name "MyFn-live-Composite" \
  --alarm-rule "ALARM(MyFn-live-ErrorRate) OR ALARM(MyFn-live-P99Latency)"
```

Connecting Composite Alarm to Deployment Group enables "rollback if either error rate or latency exceeds threshold."

> 🔍 **Going deeper**: Lambda metric Dimension design is key to Canary deployment monitoring. If you only specify `FunctionName=MyFn`, the entire Function's errors are counted. If you specify `FunctionName=MyFn, Resource=MyFn:live`, only invocations through the Alias are counted. If 5 Alias-level errors occur during Canary 10%, statistically about 1 (10%) are new version-related. Consider this in alarm threshold design — lower Canary percentage means new version errors get diluted in Alias metrics.

---

## Summary: Lambda Deployment Decision Tree

```
Lambda deployment strategy selection
=====================
Can failure be detected immediately (synchronous API, instant error)?
    ├─ YES + short observation fine → LambdaCanary10Percent5Minutes
    ├─ YES + sufficient observation needed → LambdaCanary10Percent30Minutes
    └─ NO (delayed failure, batch) → LambdaLinear10PercentEvery1Minute
    
    AllAtOnce: dev/test environments only, production forbidden

Traffic too low to have enough samples?
    └─ Supplement with Hook + direct new Version invocation for smoke test

Must have no cold starts (PC configured)?
    └─ Configure PC on new Version before Canary → must manually delete old Version PC after switch

Automating from CodePipeline?
    └─ SAM AutoPublishAlias + DeploymentPreference is optimal combination
```

---

## 📝 Practice Questions

**Question 1.** What is the mechanism by which traffic is actually shifted in a Lambda canary deployment?

A) A new Lambda function is created and a load balancer distributes traffic across the two functions
B) The alias weighted routing config — one alias routes between two versions according to a weight ratio
C) Route 53 weighted records
D) Switching an API Gateway stage variable

**Answer: B**
Explanation: Lambda Blue/Green is implemented with the alias `AdditionalVersionWeights`, without any infrastructure change. The same alias ("live") distributes invocations between version 5 (90%) and version 6 (10%). Callers only need to know the alias ARN, and the version switch happens transparently. Creating a new function (A) or Route 53 (C) is not a Lambda deployment mechanism.

---

**Question 2.** In a `LambdaCanary10Percent5Minutes` deployment, what is the traffic distribution at 3 minutes in?

A) 30% new version, 70% old version
B) 10% new version, 90% old version (during the 5-minute observation period)
C) 50% new version
D) 100% new version (already fully shifted)

**Answer: B**
Explanation: Canary has two steps. The first 10% is observed for the specified time (5 minutes). Three minutes is within the 5-minute observation period, so the split is still 10%/90%. After 5 minutes pass with no alarm, it then shifts to 100%. The key is not to confuse it with Linear. With Linear10PercentEvery1Minute, it would be 30% after 3 minutes.

---

**Question 3.** What happens if a PreTrafficHook function exits normally without calling `PutLifecycleEventHookExecutionStatus`?

A) The deployment is treated as successful
B) CodeDeploy does not receive the hook result, keeps waiting, and marks the deployment as failed after the timeout (default 3600 seconds)
C) It is automatically treated as Succeeded
D) The deployment is rolled back immediately

**Answer: B**
Explanation: CodeDeploy waits not for the Lambda execution result (success/failure) of the hook function, but for the result that the hook function reports by calling the `PutLifecycleEventHookExecutionStatus` API. Without this API call, CodeDeploy considers the hook unresponsive, waits until the configured timeout (default 3600 seconds), and then treats the deployment as failed.

---

**Question 4.** What does SAM `AutoPublishAlias: live` handle automatically?

A) Only IAM role creation
B) Publishing a Lambda version + creating/updating the alias + automatically creating the CodeDeploy application/deployment group + running the deployment
C) Only CloudWatch alarm creation
D) Only the ECR image push

**Answer: B**
Explanation: `AutoPublishAlias` is a powerful abstraction provided by SAM. When you run `sam deploy`, it automatically: (1) publishes a new Lambda version, (2) creates or updates an alias with the specified name, (3) if `DeploymentPreference` is present, automatically creates a CodeDeploy application + deployment group, and (4) automatically runs the canary/linear deployment. Developers do not need to work with the CodeDeploy API directly.

---

**Question 5.** What is the cost impact while deploying a Lambda function with provisioned concurrency using Canary 10% over 30 minutes?

A) No cost change during the deployment
B) For 30 minutes, PC cost is incurred for both the old version (90%) and the new version (10%) — PC cost is temporarily about double
C) Only the new version PC is charged
D) PC is automatically deactivated, so there is no cost

**Answer: B**
Explanation: During the canary period, two versions are active at the same time, so both versions must keep PC (warmed-up execution environments). During the 30-minute canary period, PC cost is about double. After the 100% shift to the new version completes, you must manually release the old version PC to return to normal cost. It is not released automatically.

---

**Question 6.** What is the maximum number of versions that can receive traffic at the same time from one Lambda alias?

A) Unlimited
B) 2 (primary + 1 secondary)
C) 5
D) 10

**Answer: B**
Explanation: Only one additional version can be specified in the Lambda alias `routing-config.AdditionalVersionWeights`. The maximum is 2, combining the primary (function-version) and the secondary (routing-config). Testing three versions A/B/C at once is not possible with a single alias. If an exam requirement calls for "testing three versions at once," consider alternatives such as creating several separate aliases or using weighted routing on an Application Load Balancer.

---

**Question 7.** 10 minutes into a canary deployment, a CloudWatch alarm enters the ALARM state. What does CodeDeploy do automatically?

A) Waits another 10 minutes before deciding
B) Immediately stops the deployment and restores the alias weights to 100% on the old version (instant rollback)
C) Shifts 100% to the new version and waits for the alarm to clear
D) Only sends a notification through SNS

**Answer: B**
Explanation: If `DEPLOYMENT_STOP_ON_ALARM` is set in the deployment group `auto-rollback-configuration` and the associated CloudWatch alarm enters the ALARM state during the deployment, CodeDeploy immediately stops the deployment and restores the alias weights to the previous version (100%). This is the actual behavior of "automatic rollback." A few seconds are enough to complete the rollback — changing only the alias weights shifts traffic back to the old version instantly.

---
