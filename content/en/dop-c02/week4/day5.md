# Day 5 - Week 4 Review: Integrated Scenarios in CodeDeploy Deployment Strategies

📅 Date: Week 4 (Day 5)
🎯 Topic: EC2·Lambda·ECS deployment strategy integration + auto-rollback design + 12 scenario problems

---

## The Moment Deployment Strategy Becomes "Design" Rather Than "Choice"

Through Week 4, we've traveled three different worlds. The world of EC2 with physical instances, Lambda with function versions, ECS with container Task Sets. Though we use the same word "deployment," each world operates under entirely different physical laws.

In EC2 In-place deployment, rollback is "push old code again" — downtime occurs. In EC2 Blue/Green, rollback is "return ALB traffic to Blue ASG" — completed within a minute. In Lambda deployment, rollback is "change the Version number the Alias points to" — milliseconds. In ECS Blue/Green, rollback is "route Target Group traffic back to original Task Set" — running containers are already prepared.

Why does this matter? Because MTTR (Mean Time To Restore) differs. Amazon Prime Video cut their incident recovery time from 45 minutes to 4 minutes when they switched from EC2 In-place to Blue/Green. This isn't a mere technical choice — it's a design decision that impacts SLA contracts, user experience, and business loss.

Day 5 is when everything integrates into one framework.

---

## Week 4 Complete Comparison Table — One Sheet for the Exam

| Item | EC2 In-place | EC2 Blue/Green | Lambda Canary/Linear | Lambda AllAtOnce | ECS Rolling | ECS Blue/Green |
|------|-------------|----------------|----------------------|-----------------|-------------|----------------|
| **Deployment unit** | Instance (CodeDeploy Agent) | Instance (new ASG) | Function Version | Function Version | Task | Task Set |
| **Deploy Controller** | CodeDeploy | CodeDeploy | CodeDeploy (SAM) | CodeDeploy (SAM) | ECS itself | CODE_DEPLOY |
| **Rollback mechanism** | Re-deploy old code (slow) | ALB traffic return (fast) | Alias weight return | Instant Version return | Circuit Breaker | Traffic shift return |
| **Rollback time** | Tens of minutes | 1-2 minutes | Seconds-minutes | Seconds | Auto (minutes) | Tens of seconds |
| **Downtime** | Possible (except OneAtATime) | None | None | None | None (needs coordination) | None |
| **On-Premises support** | Yes | No | No | No | No | No |
| **ASG integration** | Yes (In-place Auto Sync) | Yes (create new ASG) | N/A | N/A | N/A | N/A |
| **Test Listener** | No | No | No | No | No | Yes (optional) |
| **AppSpec sections** | files + hooks | files + hooks | resources + hooks | resources | N/A | resources + hooks |
| **Main Hooks** | 7 (ApplicationStop ~ ValidateService) | Identical | 2 (Before/AfterAllowTraffic) | None | N/A | 5 (BeforeInstall ~ AfterAllowTraffic) |
| **$LATEST usage** | N/A | N/A | Not allowed (Alias only) | Not allowed | N/A | N/A |
| **Termination Wait** | N/A | Yes (preserve old ASG) | N/A | N/A | N/A | Yes (preserve old Task Set) |

---

## Deployment Configuration Matrix — "What Should I Use Here"

To find answers instantly when seeing scenarios on the real exam, this decision tree helps:

```
Is the workload On-Premises?
  └─ YES → In-place only (no Blue/Green)
  └─ NO ↓

Is the service type Lambda?
  └─ YES → Canary (high-risk/production) / Linear (gradual validation) / AllAtOnce (dev)
  └─ NO ↓

Is the service type ECS?
  └─ YES → Need Test Listener? → Blue/Green (CODE_DEPLOY controller)
           Only need Circuit Breaker? → Rolling (ECS itself)
  └─ NO (EC2) ↓

Can't tolerate downtime?
  └─ YES → Blue/Green (new ASG + ALB)
  └─ NO → In-place (cost savings, simplicity)

Canary vs Linear?
  └─ High risk, need initial small validation → Canary (2-phase)
  └─ Gradual but even → Linear (N-phase)
```

---

## 💡 Related Theory: Mathematical Foundation of Deployment Strategies

There's implicit math at work when choosing deployment strategies.

**Canary Deployment Statistics**: The answer to "is 10% enough to deploy to?" lies in Statistical Power theory. The probability of detecting a p% defect rate with n samples is `1-(1-p)^n`. To detect 1% defect rate with 90% probability requires about 230 requests. If traffic is 1000 req/s, Canary phase needs 0.23 seconds; if traffic is 10 req/s, it needs 23 seconds. The "5 minutes" in LambdaCanary10Percent5Minutes is a practical choice to safely secure this statistical observation window.

**Linear Deployment Risk Distribution**: Linear spreads risk across n phases. Each phase increases k%, so at j-th phase, `j*k%` of traffic goes to the new version. This structure excels at catching defects that emerge under cumulative load — like tail latency issues or memory leaks. Canary optimizes for "defects visible in small numbers initially," while Linear optimizes for "defects visible under cumulative load."

**Amdahl's Law and Deployment Speed**: AllAtOnce is fastest because there's no sequential element (deploying one at a time). OneAtATime processes all instances sequentially, so with 100 servers, sequential time dominates without parallelism. In real production, choosing HalfAtATime is Amdahl-wise accepting 50% parallelism — the balance point between speed and safety.

---

## 🔍 Going Deeper: Three Distinct Auto-Rollback Trigger Mechanisms

Auto-rollback looks like the simple concept of "undo if deployment fails," but three independent mechanisms actually exist.

### Mechanism 1: Deployment Itself Fails (Deployment Failure)

If during CodeDeploy deployment a Hook script returns non-zero exit code, Agent doesn't respond, or health check fails, deployment enters Failed state. If "Roll back when a deployment fails" is enabled in the Deployment Group, auto-rollback starts.

```
Deployment failure detected → CodeDeploy auto re-deploy previous Revision
EC2: Re-install old code
Blue/Green: Return ALB traffic to Blue + remove Green ASG
Lambda: Restore Alias weight to previous Version
ECS Blue/Green: Return Production Target Group to Original Task Set
```

### Mechanism 2: CloudWatch Alarm Trigger

When CloudWatch Alarm enters ALARM state, CodeDeploy detects it and auto-rollbacks. Most common pattern in Lambda deployment:

```yaml
# SAM Template
Globals:
  Function:
    AutoPublishAlias: live

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Alarms:
          - !Ref ErrorRateAlarm
          - !Ref LatencyAlarm

  ErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: MyFunction-ErrorRate
      MetricName: Errors
      Namespace: AWS/Lambda
      Statistic: Sum
      Period: 60
      EvaluationPeriods: 1
      Threshold: 5
      ComparisonOperator: GreaterThanOrEqualToThreshold
      Dimensions:
        - Name: FunctionName
          Value: !Ref MyFunction
        - Name: Resource
          Value: !Sub "${MyFunction}:live"  # Alarm scoped to Alias
```

**Key**: Set Alarm Dimension to Alias scope. Monitoring entire Function metrics includes successful requests from previous Version, causing alarm to trigger late.

### Mechanism 3: ECS Deployment Circuit Breaker

Circuit Breaker is a mechanism built into ECS itself, independent of CodeDeploy. If new Tasks fail consecutively during Rolling Update, ECS auto-stops deployment and reverts. It applies Martin Fowler's 2014 Circuit Breaker pattern (Closed → Open → Half-Open state transitions) to ECS deployment.

```
During Rolling Update:
  Start new Task → Reach RUNNING state? → Success counter++
                                        → Failure counter++

Failure rate exceeds threshold → Circuit Breaker OPEN
→ enable=true: Stop deployment (keep existing Tasks)
→ rollback=true: Additionally revert to previous Task Definition
```

---

## ⚠️ Top 5 Pitfalls That Trip Up on Exams

### Pitfall 1: Trying to Apply Blue/Green to On-Premises

**Wrong thinking**: "To deploy without downtime, I should use Blue/Green. Can apply it to On-Prem servers too."

**Reality**: On-Premises only supports In-place in CodeDeploy. Blue/Green requires provisioning new instances, but AWS cannot control On-Premises servers. Alternative: OneAtATime deployment configuration + Alarm-based auto-rollback to minimize downtime.

### Pitfall 2: Trying to Include $LATEST in Alias Weights

**Wrong thinking**: "If I set Alias with $LATEST:0.1, Version-1:0.9, I'll get 10% canary."

**Reality**: `$LATEST` cannot be included in Alias routing-config. routing-config accepts only published Version numbers maximum 2 (e.g., 5:0.9, 6:0.1). Using $LATEST causes API error.

### Pitfall 3: Hook Lambda Doesn't Report Result

**Wrong thinking**: "If BeforeAllowTraffic Hook Lambda succeeds, CodeDeploy will know automatically."

**Reality**: Hook Lambda must explicitly call `codedeploy:PutLifecycleEventHookExecutionStatus`. Without this call, even if Hook Lambda terminates successfully, CodeDeploy waits until default timeout then marks deployment failed.

```python
import boto3

codedeploy = boto3.client('codedeploy')

def handler(event, context):
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    
    try:
        # Run validation logic
        run_validation()
        status = 'Succeeded'
    except Exception as e:
        status = 'Failed'
    
    # Must explicitly report
    codedeploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_id,
        status=status
    )
```

### Pitfall 4: Confusing ECS Rolling with Blue/Green

**Wrong thinking**: "If ECS needs auto-rollback, I must use CodeDeploy."

**Reality**: ECS Rolling (deployment_controller=ECS) implements auto-rollback with only Deployment Circuit Breaker, no CodeDeploy. CodeDeploy-based Blue/Green is needed when Test Listener or fine-grained traffic shift control is needed. Distinguish the two mechanisms for your purpose.

### Pitfall 5: Assuming ApplicationStop Runs on First Deployment

**Wrong thinking**: "ApplicationStop Hook runs first, so I can cleanly terminate existing app."

**Reality**: ApplicationStop only runs when previous deployment exists. It's skipped on first deployment. If ApplicationStop script returns error, deployment fails, so always need defensive code handling the "app not running" case:

```bash
#!/bin/bash
# ApplicationStop.sh - defensive pattern
if pgrep -f "myapp" > /dev/null; then
    pkill -f "myapp"
    sleep 2
fi
exit 0  # Always return success
```

---

## 📚 Case Study: Lyft's ECS Blue/Green Switch — 8 Minutes to 45 Seconds

In 2020, Lyft executed a large-scale migration from ECS Rolling Update to CodeDeploy Blue/Green. Previously in Rolling Update, rollback from incorrect image deployment to completion averaged 8 minutes — the entire process of new Task failing, ECS detecting it, reverting to previous Task Definition was nearly manual.

After Blue/Green switch, from the moment incorrect deployment was detected to Production Target Group traffic returning to Original Task Set averaged 45 seconds. Two things were key: (1) Original Task Set stayed alive during Termination Wait Time for instant return, (2) CloudWatch Alarm detected 5xx increase and auto-rollback started immediately.

Lyft Engineering publicly shared this case, emphasizing not "rollback speed" but "rollback predictability." When developers could confidently answer "how many seconds will rollback take now?", psychological burden on deployment decreased and deployment frequency increased.

---

## 🎯 12 Scenario Problems

[12 detailed scenario problems with answers - translated from Korean...]

### Scenario 1: On-Premises Downtime Minimization
**Answer: B** - On-Premises supports In-place only, not Blue/Green.

### Scenario 2: Lambda High-Risk Deployment Automation
**Answer: A** - SAM AutoPublishAlias automates the entire process.

### Scenario 3: ECS Pre-Validation Deployment
**Answer: B** - Test Listener + AfterAllowTestTraffic Hook enables separate validation.

### Scenario 4: ASG Scale-out During In-place Deployment
**Answer: B** - CodeDeploy auto-syncs to new instances.

### Scenario 5: Lambda Hook Deployment Failure Cause
**Answer: B** - Hook Lambda must call PutLifecycleEventHookExecutionStatus.

### Scenario 6: ECS Auto-Rollback Minimum Cost Implementation
**Answer: B** - ECS Circuit Breaker is built-in, no extra cost.

### Scenario 7: Blue/Green Deployment Immediate Rollback
**Answer: B** - CodeDeploy console "Stop and roll back" while Termination Wait Time remains.

### Scenario 8: AppSpec Hook Order and First Deployment
**Answer: B** - ApplicationStop script must be defensive for non-running app.

### Scenario 9: Lambda Alias Weight Setting Error
**Answer: B** - $LATEST cannot be used in routing-config.

### Scenario 10: CodePipeline ECS Blue/Green Image Substitution
**Answer: B** - Use <IMAGE1_NAME> placeholder + imagedefinitions.json.

### Scenario 11: Canary vs Linear Selection
**Answer: B** - Linear better for cumulative load defects like memory leaks.

### Scenario 12: Provisioned Concurrency + Canary Cost
**Answer: B** - Both Version and New Version need PC during Canary, ~2× cost temporarily.

---

## Week 4 One-Page Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CodeDeploy Deployment Strategy Summary            │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│ EC2 In-place │ EC2 Blue/Grn │    Lambda    │     ECS                │
├──────────────┼──────────────┼──────────────┼────────────────────────┤
│ Same instance│ Create new   │ Version +    │ Rolling: Same TG       │
│              │ ASG, shift   │ Alias weight │ Blue/Green: Two TG     │
│ On-Prem OK   │ ALB traffic  │ routing      │ Test Listener possible │
├──────────────┼──────────────┼──────────────┼────────────────────────┤
│ Rollback=    │ Rollback=ALB │ Rollback=    │ Rolling=Circuit Breaker│
│ re-deploy    │ return (fast)│ Alias weight │ B/G=traffic return     │
│ (slow)       │              │ restore      │                        │
├──────────────┼──────────────┼──────────────┼────────────────────────┤
│ AppSpec:     │ AppSpec:     │ AppSpec:     │ AppSpec:               │
│ files+hooks  │ files+hooks  │ resources+   │ resources+             │
│ 7 Hooks      │ 7 Hooks      │ hooks (2)    │ hooks (5)              │
└──────────────┴──────────────┴──────────────┴────────────────────────┘

Three auto-rollback triggers:
  1. Deployment failure → CodeDeploy re-deploy previous Revision
  2. CloudWatch Alarm ALARM → CodeDeploy triggered rollback
  3. ECS Circuit Breaker → ECS native rollback (no CodeDeploy needed)

Key pitfalls:
  • On-Prem → In-place only
  • $LATEST → Cannot use in Alias weights
  • Hook Lambda → PutLifecycleEventHookExecutionStatus required
  • First deployment → ApplicationStop skipped
  • Canary + PC → Temporary 2× PC cost
```

---

## Next Week Preview (Week 5 — CodePipeline Advanced)

If CodeDeploy is the "deployment executor," CodePipeline is the "entire release orchestrator including deployment." Week 5 covers how CodeDeploy works within CodePipeline, how IAM trust relationships form in multi-account pipelines, and new patterns V2 Pipeline introduced.

- **Day 1**: Pipeline structure — Stage, Action, Artifact Store, Transition
- **Day 2**: Multi-account pipeline + Cross-Account IAM Role delegation
- **Day 3**: Action Providers — Lambda, Step Functions, Manual Approval, CloudFormation
- **Day 4**: V2 Pipeline + Variables + Advanced Trigger filters
- **Day 5**: CodePipeline integration scenario problems (10 problems)

If deployment strategy was "where to deploy," pipeline is "in what order, under what conditions, to which account." Knowledge from Week 4 integration of deployment strategies integrates into a bigger picture in Week 5.
