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

### Scenario 1: On-Premises Downtime Minimization

A company deploys with CodeDeploy to 80 servers in its data center. Requirements: maintain service availability during deployment, and automatic rollback on failure.

**A)** CodeDeploy Blue/Green + new ASG  
**B)** CodeDeploy In-place, OneAtATime, CloudWatch Alarm-based automatic rollback  
**C)** ECS Rolling + Circuit Breaker  
**D)** Lambda Canary10Percent5Minutes  

**Answer: B**

On-Premises supports In-place only. Blue/Green is possible only on AWS infrastructure (because provisioning of new instances must be under AWS control). OneAtATime deploys one at a time so the remaining servers keep serving traffic. With a CloudWatch Alarm + automatic rollback configured, the previous Revision is redeployed immediately upon detecting failure.

---

### Scenario 2: Lambda High-Risk Deployment Automation

You are updating a payment-processing Lambda function. Requirements: expose 10% for 5 minutes, then go to 100% if nothing is wrong, and roll back automatically and immediately if the 5xx error rate exceeds 1%.

**A)** SAM `AutoPublishAlias: live` + `DeploymentPreference: Canary10Percent5Minutes` + CloudWatch Alarm  
**B)** Manually adjust Alias weights in the Lambda console  
**C)** ECS Blue/Green with CodeDeploy  
**D)** CodePipeline + Manual Approval + manual Lambda deployment  

**Answer: A**

SAM AutoPublishAlias handles the entire process automatically: publish a new Version → create/update the Alias → create the CodeDeploy Application/Deployment Group → run the deployment. If you connect a CloudWatch Alarm to the Alarms field of DeploymentPreference, an automatic rollback occurs when the alarm enters ALARM state. Manual adjustment (B) does not satisfy the automation requirement.

---

### Scenario 3: ECS Pre-Validation Deployment

Before deploying a new version to an ECS Fargate service, the QA team wants to access it on a separate port for pre-validation and then switch traffic.

**A)** ECS Rolling Update (deployment_controller=ECS)  
**B)** ECS Blue/Green (deployment_controller=CODE_DEPLOY) + Test Listener (port 8080) + AfterAllowTestTraffic Hook  
**C)** Lambda Blue/Green  
**D)** EC2 In-place + BeforeInstall Hook  

**Answer: B**

The Test Listener is an optional feature of ECS Blue/Green that makes the new Task Set reachable on a specific port or path. The QA team validates through the Test Listener URL, the AfterAllowTestTraffic Hook Lambda reports the automated validation result, and when it passes, Production Listener traffic switches to the new Task Set. Rolling Update (A) does not support this pre-validation pattern.

---

### Scenario 4: In-place Deployment During ASG Scale-out

While an In-place deployment is in progress on an EC2 ASG, Auto Scaling adds 2 instances because of a traffic surge. How do the newly added instances behave?

**A)** They run the previous version of the code until the next deployment  
**B)** CodeDeploy automatically installs the Revision currently in progress onto the new instances  
**C)** They are terminated immediately because of a health check failure  
**D)** ASG scale-out is blocked during deployment  

**Answer: B**

When CodeDeploy and the ASG are integrated, the CodeDeploy Agent is included in the ASG Launch Template and the Auto Sync mechanism is enabled. When a new instance starts through scale-out, CodeDeploy detects it and automatically installs the Revision currently being deployed. Thanks to this, even if scale-out occurs during a deployment, no version mismatch arises between instances.

---

### Scenario 5: Cause of a Lambda Hook Deployment Failure

The `BeforeAllowTraffic` Hook Lambda ran, but the CodeDeploy deployment fails with a timeout. Looking at CloudWatch Logs, the Hook Lambda terminated normally. What is the most likely cause?

**A)** The Hook Lambda has insufficient memory  
**B)** The Hook Lambda IAM Role lacks the `codedeploy:PutLifecycleEventHookExecutionStatus` permission  
**C)** The Lambda Concurrency Limit was exceeded  
**D)** The VPC configuration prevents access to the CodeDeploy endpoint  

**Answer: B**

This is the most common cause when a deployment times out even though the Hook Lambda terminated normally. CodeDeploy requires the Hook Lambda to report the result (Succeeded/Failed) directly by calling the `PutLifecycleEventHookExecutionStatus` API. Without this report, CodeDeploy waits until the default timeout (1 hour) and then fails the deployment. A VPC problem (D) is also possible, but since the question confirms a "normal termination," B is the exact cause.

---

### Scenario 6: Minimum-Cost Implementation of ECS Automatic Rollback

In a Rolling Update of an ECS Fargate service, you want the service to automatically return to its previous state if new Tasks fail repeatedly. Additional AWS service costs must be minimized.

**A)** Introduce CodeDeploy Blue/Green + connect a CloudWatch Alarm  
**B)** Enable the ECS Deployment Circuit Breaker (`enable=true, rollback=true`)  
**C)** A Lambda function that polls ECS events, detects failure, and calls UpdateService  
**D)** CloudWatch Events + Step Functions workflow  

**Answer: B**

The ECS Deployment Circuit Breaker is a feature within the ECS service configuration and has no extra cost. CodeDeploy Blue/Green (A) incurs CodeDeploy costs plus an additional Target Group and the cost of running a second Task Set. Lambda polling (C) adds Lambda execution cost and complexity. The Circuit Breaker is simply enabled in the service settings, and it automatically calculates the failure threshold to decide whether to roll back.

---

### Scenario 7: Immediate Rollback After a Blue/Green Deployment

After an EC2 Blue/Green deployment completes, a serious bug is found in production. 45 minutes of Termination Wait Time remain. What is the fastest way to roll back?

**A)** Manually increase the EC2 Blue ASG in the AWS console and change the ALB target group  
**B)** Select "Stop and roll back deployment" in the CodeDeploy console  
**C)** Create a new Launch Template with the previous AMI and update the ASG  
**D)** Switch traffic to the previous ELB after the DNS TTL expires  

**Answer: B**

This is exactly the moment the key advantage of Blue/Green deployment is for. During the Termination Wait Time, the Blue ASG (the previous version) is still alive. If you run "Stop and roll back" in CodeDeploy, ALB traffic returns to the Blue ASG immediately. Manual operation (A) takes time and risks errors. A new Launch Template (C) requires new-instance boot time. A DNS change (D) is delayed by the length of the TTL.

---

### Scenario 8: AppSpec Hook Order and the First Deployment

On the first EC2 In-place deployment, the ApplicationStop Hook raises an "app is not running" error and the deployment fails. What is the solution?

**A)** Add a script to BeforeInstall that starts the app first  
**B)** Modify the ApplicationStop script to return exit 0 even when the app is not running  
**C)** Remove the ApplicationStop Hook from the AppSpec  
**D)** Use OneAtATime instead of AllAtOnce  

**Answer: B**

On the first deployment ApplicationStop should be skipped when there is no previous deployment, but if the script itself returns an "error if there is no app," the deployment fails. The correct pattern is a defensive script that checks whether the app is running, terminates it only if it is, and returns exit 0 if it is not. Removing the Hook (C) causes the problem that the app is not terminated properly in later deployments.

---

### Scenario 9: Lambda Alias Weight Configuration Error

A team tries to set the weights `$LATEST:0.1, Version-5:0.9` on a Lambda Alias. Why does this configuration fail?

**A)** Because the weights sum to more than 1.0  
**B)** Because $LATEST cannot be included in routing-config (the weight setting)  
**C)** Because an Alias can point to at most 3 Versions  
**D)** Because Version-5 does not exist  

**Answer: B**

The routing-config of a Lambda Alias allows only published Version numbers. $LATEST is a special pointer to the latest code under development and cannot be included in Alias weighted routing. The correct configuration takes the form `Version-6:0.1, Version-5:0.9`. In addition, an Alias can include at most two Versions in its routing-config (1 primary Version + 1 additional Version).

---

### Scenario 10: CodePipeline ECS Blue/Green Image Substitution

You are configuring automated ECS Blue/Green deployment with CodePipeline. Every time a new image is pushed to ECR, you want the ECS service to update automatically to the new image.

**A)** Run `aws ecs update-service --force-new-deployment` directly in buildspec.yml  
**B)** CodePipeline ECS (Blue/Green) Action + the `<IMAGE1_NAME>` placeholder in `taskdef.json` + `imagedefinitions.json`  
**C)** Call the `UpdateService` API directly from a Lambda Action  
**D)** Update the Task Definition with a CloudFormation Action  

**Answer: B**

The `<IMAGE1_NAME>` placeholder in `taskdef.json` is a special string recognized by the CodePipeline ECS (Blue/Green) Action. When the build stage records the container name and image URI in `imagedefinitions.json`, in the deploy stage CodePipeline replaces `<IMAGE1_NAME>` with the actual image URI, creates a new Task Definition, and then starts the CodeDeploy Blue/Green deployment. A direct `update-service` (A) bypasses Blue/Green, and a direct Lambda call (C) makes the automation incomplete.

---

### Scenario 11: Choosing Between Canary and Linear

You are deploying a payment-service Lambda. That function has a history of memory usage growing as load accumulates. Which deployment strategy is appropriate?

**A)** LambdaCanary10Percent5Minutes (10%, observe for 5 minutes, then 100%)  
**B)** LambdaLinear10PercentEvery1Minute (increase by 10% every 1 minute, reaching 100% in 10 minutes)  
**C)** LambdaAllAtOnce (100% immediately)  
**D)** ECS Rolling Update  

**Answer: B**

Defects that show up under cumulative load (such as memory leaks) are caught better by Linear's gradual increase than by Canary's one-off small exposure. LambdaLinear10PercentEvery1Minute raises traffic by 10% over 10 minutes, so at each step you can monitor the memory-usage growth pattern with CloudWatch and automatically roll back if an anomaly is detected. Canary (A) switches to 100% if no anomaly shows within 5 minutes, which is risky.

---

### Scenario 12: Provisioned Concurrency + Canary Cost

You set Provisioned Concurrency (PC) of 100 units on a Lambda function and run a Canary deployment. During the Canary stage of the deployment (10% of traffic to the new Version), what is the cost impact?

**A)** The same as the existing cost, because PC is set only on the new Version  
**B)** PC is needed on both Versions, so PC cost temporarily becomes ~2x  
**C)** PC is automatically disabled during the Canary  
**D)** There is no impact, because PC is set on the Alias  

**Answer: B**

PC is set per Version. During a Canary deployment, both the Old Version (90%) and the New Version (10%) must respond without cold starts, so PC must be set on both Versions. This means PC cost roughly doubles during the Canary period (for example, 5 minutes for LambdaCanary10Percent5Minutes). After the deployment completes, the PC of the Old Version is released. This temporary cost increase can become a cost that is hard to ignore for high-traffic, high-PC functions.

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
- **Day 5**: CodePipeline integration scenario problems (12 problems)

If deployment strategy was "where to deploy," pipeline is "in what order, under what conditions, to which account." Knowledge from Week 4 integration of deployment strategies integrates into a bigger picture in Week 5.
