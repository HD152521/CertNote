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

## 📝 연습 문제

**문제 1.** Lambda Canary 배포에서 실제로 트래픽이 시프트되는 메커니즘은?

A) 새 Lambda 함수가 생성되어 Load Balancer가 두 함수로 분배
B) Alias의 weighted routing config — 하나의 Alias가 두 Version 사이 가중치 비율로 라우팅
C) Route 53 가중 레코드
D) API Gateway Stage Variable 전환

**정답: B**
해설: Lambda Blue/Green은 인프라 변경 없이 Alias의 `AdditionalVersionWeights`로 구현된다. 같은 Alias("live")가 Version 5(90%)와 Version 6(10%)으로 호출을 분배한다. 호출자는 Alias ARN만 알면 되고 버전 전환은 투명하게 일어난다. 새 함수 생성(A)이나 Route 53(C)은 Lambda 배포 메커니즘이 아니다.

---

**문제 2.** `LambdaCanary10Percent5Minutes` 배포에서 3분이 지난 시점의 트래픽 분배는?

A) 30% 새 버전, 70% 구 버전
B) 10% 새 버전, 90% 구 버전 (5분 관찰 기간 중)
C) 50% 새 버전
D) 100% 새 버전 (이미 완전 전환)

**정답: B**
해설: Canary는 2단계다. 처음 10%를 지정한 시간(5분) 동안 관찰한다. 3분은 5분 관찰 기간 중이므로 여전히 10%/90% 분배다. 5분이 지나고 알람이 없으면 그때 100%로 전환된다. Linear와 혼동하지 않는 것이 핵심이다. Linear10PercentEvery1Minute이었다면 3분 후 30%가 된다.

---

**문제 3.** PreTrafficHook이 `PutLifecycleEventHookExecutionStatus`를 호출하지 않고 함수가 정상 종료되면?

A) 배포가 성공으로 처리된다
B) CodeDeploy는 Hook 결과를 받지 못해 대기 상태를 유지하다 Timeout(기본 3600초) 후 배포 실패 처리
C) 자동으로 Succeeded로 처리된다
D) 배포가 즉시 롤백된다

**정답: B**
해설: CodeDeploy는 Hook 함수의 Lambda 실행 결과(성공/실패)가 아니라, Hook 함수가 `PutLifecycleEventHookExecutionStatus` API를 호출하여 보고하는 결과를 기다린다. 이 API 호출이 없으면 CodeDeploy는 Hook이 응답하지 않는 것으로 보고, 설정된 Timeout(기본 3600초)까지 기다린 후 배포 실패로 처리한다.

---

**문제 4.** SAM `AutoPublishAlias: live`가 자동으로 처리하는 것은?

A) IAM Role 생성만
B) Lambda Version 게시 + Alias 생성/업데이트 + CodeDeploy Application/Deployment Group 자동 생성 + 배포 실행
C) CloudWatch Alarm 생성만
D) ECR 이미지 push만

**정답: B**
해설: `AutoPublishAlias`는 SAM이 제공하는 강력한 추상화다. `sam deploy` 실행 시 자동으로: (1) 새 Lambda Version 게시, (2) 지정한 이름의 Alias 생성 또는 업데이트, (3) `DeploymentPreference`가 있으면 CodeDeploy Application + Deployment Group 자동 생성, (4) Canary/Linear 배포 자동 실행. 개발자가 CodeDeploy API를 직접 다루지 않아도 된다.

---

**문제 5.** Provisioned Concurrency가 설정된 Lambda를 Canary 10% 30분으로 배포하는 중 비용 영향은?

A) 배포 중 비용 변화 없음
B) 30분 동안 구 버전(90%)과 새 버전(10%) 양쪽 모두 PC 비용 발생 — 일시적으로 PC 비용이 약 2배
C) 새 버전 PC만 비용 발생
D) PC가 자동 비활성화되어 비용 없음

**정답: B**
해설: Canary 기간 동안 두 Version이 동시에 활성화되므로, 두 Version 모두 PC(워밍업된 실행 환경)를 유지해야 한다. 30분의 Canary 기간 동안 PC 비용이 약 2배 발생한다. 새 버전으로 100% 전환 완료 후 구 버전 PC를 수동으로 해제해야 정상 비용으로 돌아온다. 자동 해제되지 않는다.

---

**문제 6.** 한 Lambda Alias에서 동시에 트래픽을 받을 수 있는 최대 Version 수는?

A) 무제한
B) 2개 (Primary + Secondary 1개)
C) 5개
D) 10개

**정답: B**
해설: Lambda Alias의 `routing-config.AdditionalVersionWeights`에는 단 하나의 추가 Version만 지정할 수 있다. Primary(function-version)과 Secondary(routing-config) 합쳐 최대 2개다. A/B/C 세 버전 동시 테스트는 단일 Alias로 불가능하다. 시험에서 "세 버전 동시 테스트" 요구사항이 나오면 별도 Alias를 여러 개 만들거나 Application Load Balancer의 가중치 라우팅을 사용하는 대안을 검토해야 한다.

---

**문제 7.** Canary 배포 10분 경과 후 CloudWatch Alarm이 ALARM 상태가 됐다. CodeDeploy의 자동 동작은?

A) 10분을 더 기다린 후 판단
B) 배포를 즉시 중단하고 Alias 가중치를 구 Version 100%로 복원 (즉시 롤백)
C) 새 버전으로 100% 전환 후 알람 해제를 기다림
D) SNS로 알림만 발송

**정답: B**
해설: Deployment Group의 `auto-rollback-configuration`에 `DEPLOYMENT_STOP_ON_ALARM`이 설정되어 있고, 배포 중 연결된 CloudWatch Alarm이 ALARM 상태가 되면 CodeDeploy는 즉시 배포를 중단하고 Alias 가중치를 이전 Version(100%)으로 복원한다. 이것이 "자동 롤백"의 실제 동작이다. 롤백 완료까지 수초면 충분하다 — Alias 가중치 변경만으로 트래픽이 즉시 구 버전으로 전환된다.

---
