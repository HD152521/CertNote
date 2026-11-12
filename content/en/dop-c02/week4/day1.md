# Day 1 - In-place vs Blue/Green, AppSpec: The Physics of Deployment Strategies

Deployment sounds like "uploading new code to a server," but it's actually about how short and how safe you can make the period when two versions coexist. In-place overwrites new code on the same server. Blue/Green fully prepares a new server fleet and then switches traffic over entirely. The two strategies have fundamentally different risk profiles.

CodeDeploy is the AWS service that provides these two strategies across EC2, Lambda, and ECS with a consistent interface. But "consistent interface" doesn't mean "identical behavior." Blue/Green on EC2 and Blue/Green on Lambda work physically quite differently. AppSpec files also have different formats depending on the target platform.

## In-place vs Blue/Green: Essential Comparison

| Item | In-place | Blue/Green |
|------|----------|------------|
| Deployment target | Overwrite existing instances | Create new instances/Versions/Task Sets |
| Downtime | Nearly 0 with OneAtATime, occurs with AllAtOnce | 0 (traffic shift only) |
| Rollback speed | Slow (requires re-deployment) | Instant (undo traffic shift) |
| Cost | Instances remain | Temporarily 2× cost |
| EC2 | ✅ | ✅ (new ASG created) |
| On-Premises | ✅ | ❌ (not supported) |
| Lambda | ❌ | ✅ (Alias weighted routing) |
| ECS | ❌ | ✅ (two Target Groups) |

**Core difference**: Rollback speed. In-place rollback is the process of "re-deploying the previous version," which takes minutes. Blue/Green rollback is "undoing the traffic shift," which takes seconds. This difference directly impacts MTTR.

> 💡 **Related theory**: Blue/Green deployment is the deployment version of **Two-Phase Commit**. In 2PC, you get confirmation that all participants are ready before committing; in Blue/Green, you only switch traffic after the Green environment is fully prepared and validated. Until the switch, "rollback (abort)" is always possible. This is why it's fundamentally safer than In-place.

> 📚 **Case study**: In 2017, Amazon Prime Video's team reported an improvement: after switching from In-place to Blue/Green deployment, deployment-related MTTR dropped from an average of 45 minutes to 4 minutes. The key was that rollback became an instant operation of "reversing the traffic shift." The old version instances remained alive during Termination Wait Time, so recovery was immediate by just changing ALB rules.

## Deployment Configuration: The Math of Speed and Safety

**EC2/On-Premises:**
- `AllAtOnce`: All instances simultaneously. Fastest, most risky. If it fails, everything is down.
- `HalfAtATime`: 50% in two rounds. Middle ground.
- `OneAtATime`: One at a time. Safest, slowest. If it fails, the rest are protected.
- Custom: Define `minimumHealthyHosts` as absolute value or percentage.

**Lambda:**
- `LambdaAllAtOnce`: Immediately 100% switch (dev/low-risk environments)
- `LambdaCanary10Percent5Minutes`: 10% → observe for 5 minutes → 90% (most commonly used)
- `LambdaCanary10Percent30Minutes`: 10% → 30 minutes → 90% (financial industry standard)
- `LambdaLinear10PercentEvery1Minute`: 10% increase every 1 minute (total 10 minutes)
- `LambdaLinear10PercentEvery10Minutes`: 10% increase every 10 minutes (total 100 minutes)

**Mathematical difference between Canary and Linear:**
- Canary: 2-phase (validate small %, then all the rest). During validation period, "small blast radius."
- Linear: N-phase gradual. Increment at each phase. More checkpoints if issues occur.

Canary is appropriate for: workloads where fast validation is possible, cases where "Go/No-Go" decision is clear.
Linear is appropriate for: cases requiring observation of gradual load increase, situations where load-dependent bugs are suspected.

> 💡 **Related theory**: Canary deployment derives its name from the "canary in a coal mine." Just as canaries were exposed to detect toxic gas first, small portions of traffic are exposed to the new version first to detect issues early. Google's SRE Book calls this "progressive delivery" and describes it as a core mechanism for controlling deployment failure blast radius over time.

## AppSpec File: Different Languages for Different Platforms

AppSpec is a declaration of the deployment procedure. It specifies where files should be placed, in what order scripts should run, and when to switch traffic. The format differs depending on the target platform (EC2, Lambda, ECS).

**EC2/On-Premises AppSpec:**
```yaml
version: 0.0
os: linux
files:
  - source: /                         # Artifact root
    destination: /var/www/myapp       # EC2 target path
permissions:
  - object: /var/www/myapp
    owner: www-data
    mode: '644'
hooks:
  ApplicationStop:          # 1. Stop old version app
    - location: scripts/stop.sh
      timeout: 60
  BeforeInstall:            # 2. Prepare before install (create directories, dependencies, etc.)
    - location: scripts/before_install.sh
  AfterInstall:             # 3. Configure after install (permissions, symlinks)
    - location: scripts/after_install.sh
  ApplicationStart:         # 4. Start new version app
    - location: scripts/start.sh
      timeout: 120
  ValidateService:          # 5. Health check (auto-rollback on failure)
    - location: scripts/health_check.sh
      timeout: 180
```

**Hook execution order (must memorize):**
```
ApplicationStop → DownloadBundle → BeforeInstall → Install →
AfterInstall → ApplicationStart → ValidateService
```

> ⚠️ **Pitfall**: On the first deployment, `ApplicationStop` is not executed. There's no previous version, so there's "no app to stop." If the script doesn't account for this situation, when `ApplicationStop` runs from the second deployment onward, it will error. `stop.sh` must follow an idempotent pattern: "only stop the app if it's running."

**Lambda AppSpec:**
```yaml
version: 0.0
Resources:
  - myFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: MyLambda
        Alias: live
        CurrentVersion: "1"       # Version currently receiving traffic
        TargetVersion: "2"        # Target version for deployment
Hooks:
  - BeforeAllowTraffic: PreTrafficHookFn    # Validate before traffic shift
  - AfterAllowTraffic: PostTrafficHookFn    # Validate after shift completes
```

**ECS AppSpec:**
```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:...:task-definition/myapp:42"
        LoadBalancerInfo:
          ContainerName: "web"
          ContainerPort: 80
Hooks:
  - BeforeInstall: BeforeInstallHookFn
  - AfterInstall: AfterInstallHookFn
  - AfterAllowTestTraffic: TestTrafficHookFn    # Validate after Test Listener
  - BeforeAllowTraffic: BeforeProdHookFn
  - AfterAllowTraffic: AfterProdHookFn
```

> 🔍 **Going deeper**: The `files` block in EC2 AppSpec works similarly to rsync. `source: /` means the root of the S3 artifact bundle, and `destination` is the path within EC2. The `permissions` block is identical to chmod/chown. Lambda/ECS AppSpec has no `files` block — Lambda's code is already versioned, and ECS's Task Definition already includes the image. The differences in deployment models are reflected in the differences in AppSpec format.

## Auto-Rollback: Three Triggers

```bash
aws deploy update-deployment-group \
  --application-name MyApp \
  --deployment-group-name prod \
  --auto-rollback-configuration \
    "enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM,DEPLOYMENT_STOP_ON_REQUEST" \
  --alarm-configuration \
    "enabled=true,alarms=[{name=HighErrorRate},{name=HighLatency}]"
```

**Three rollback triggers:**
1. `DEPLOYMENT_FAILURE`: Deployment itself failed (Hook exit code non-zero, instance registration failure, etc.)
2. `DEPLOYMENT_STOP_ON_ALARM`: Specified CloudWatch Alarm enters ALARM state
3. `DEPLOYMENT_STOP_ON_REQUEST`: User/automation requests deployment stop

**Good alarm design:**
| Alarm metric | CloudWatch namespace |
|------------|------------------------|
| 5xx rate | `AWS/ApplicationELB` HTTPCode_Target_5XX_Count |
| Response time p99 | `AWS/ApplicationELB` TargetResponseTime |
| Lambda errors | `AWS/Lambda` Errors |
| Business metrics | Custom Namespace (order success rate, payment failures, etc.) |

If alarms are too sensitive, normal deployments also get rolled back (False Positive). If alarms are too loose, they miss incidents. It's important to tune alarm Threshold and EvaluationPeriods to match your deployment pattern.

> 🎯 **Scenario**: "Design auto-rollback during a Canary 10% 5-minute deployment" frequently appears on the exam. Correct design: (1) CloudWatch Alarm: `Errors > 5 for 2 consecutive 1-minute periods` (not too sensitive), (2) Register this alarm in the Deployment Group with alarm-configuration, (3) Add `DEPLOYMENT_STOP_ON_ALARM` to auto-rollback. If alarm triggers during Canary 10% period (5 minutes), auto-rollback occurs — Alias immediately returns to old Version.

## EC2 Blue/Green Deployment Flow: Step-by-Step Understanding

```
1. CodeDeploy creates new ASG (or new instances N based on existing ASG)
2. CodeDeploy Agent runs on new instances, installs new version
3. New instances register with ELB Target Group (Green)
4. Wait for Health Check to pass
5. Begin traffic shift (Canary/Linear/AllAtOnce)
6. [Termination Wait Time begins — default 1 hour, max 2 days]
   - Old instances (Blue) remain alive during this period, enabling instant rollback
7. After Wait Time expires → Old instances are terminated
```

`Termination Wait Time` is "how long to preserve the old environment after successful deployment." Setting it longer provides a safety net but incurs costs (old instances keep being charged). Standard is 30 minutes to 1 hour.

## Lambda Blue/Green's Actual Behavior: Alias Weighted Routing

Lambda Blue/Green has no instances. Traffic shift is implemented via **weighted routing on Aliases**.

```bash
# Publish Version 6 as new
aws lambda publish-version --function-name MyFn
# → Version 6

# Alias "live" weighted shift (Canary 10%)
aws lambda update-alias \
  --function-name MyFn \
  --name live \
  --function-version 5 \              # Primary (currently 90%)
  --routing-config AdditionalVersionWeights={"6"=0.1}  # Secondary (new 10%)
```

CodeDeploy automates this sequence of API calls and handles alarm monitoring and rollback together.

```
Before deployment: Alias "live" → Version 5: 100%
Begin Canary 10%: Alias "live" → Version 5: 90%, Version 6: 10%
    ↓ Wait 5 minutes, monitor CloudWatch Alarm
No alarm: Alias "live" → Version 6: 100%
Alarm triggered: Alias "live" → Version 5: 100% (immediate rollback)
```

An Alias can have only 1 Version added via routing-config at a time. "A/B test with 3 versions distributing traffic simultaneously" is not possible at the Alias level.

## Pre/Post Traffic Hook: Automatic Validation Gate for Deployment

Lambda AppSpec's `BeforeAllowTraffic` (PreTrafficHook) and `AfterAllowTraffic` (PostTrafficHook) are implemented as separate Lambda functions.

```python
import boto3

deploy = boto3.client('codedeploy')
fn = boto3.client('lambda')

def handler(event, context):
    deployment_id = event['DeploymentId']
    hook_id = event['LifecycleEventHookExecutionId']
    target_version = event.get('TargetVersion')

    try:
        # Invoke new Version directly for validation
        result = fn.invoke(
            FunctionName=f'MyFn:{target_version}',
            Payload=b'{"action":"smoke-test"}'
        )
        ok = result['StatusCode'] == 200

        deploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=hook_id,
            status='Succeeded' if ok else 'Failed'
        )
    except Exception as e:
        deploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=hook_id,
            status='Failed'
        )
```

The IAM Role of the Hook Lambda must have `codedeploy:PutLifecycleEventHookExecutionStatus` permission. Without this permission, the Hook cannot report its result, causing CodeDeploy to treat the Hook as pending until Timeout, resulting in deployment failure.

## GCP Cloud Deploy vs AWS CodeDeploy Comparison

| Item | AWS CodeDeploy | GCP Cloud Deploy |
|------|--------------|------------------|
| Supported targets | EC2, Lambda, ECS | GKE, Cloud Run, GCE |
| AppSpec format | YAML/JSON | Skaffold-based |
| Canary strategy | Built-in (2-phase) | Canary deployment built-in |
| Auto-rollback | CloudWatch Alarm integration | Cloud Monitoring integration |
| Blue/Green | EC2(ASG), Lambda(Alias), ECS(TG) | GKE Service-based |
| Approval gate | Manual Approval (CodePipeline) | Built-in Approval Gate |
| Multi-environment pipeline | Assembled with CodePipeline | Built-in (stages) |

GCP Cloud Deploy has multi-stage pipelines built-in to the service and integrates naturally with the Kubernetes ecosystem (Skaffold). CodeDeploy supports a broader range covering EC2/Lambda/ECS, but multi-environment pipelines require separate CodePipeline configuration.

---

## 📝 Practice Questions

**Question 1.** What is the fundamental reason rollback is faster in an EC2 Blue/Green deployment than in an in-place deployment?

A) Because EC2 instances are faster
B) Because in Blue/Green the old instances (Blue) stay alive during the termination wait time, so rollback is possible instantly by only switching ALB traffic
C) Because the CodeDeploy agent is a newer version
D) Because the S3 artifacts are smaller

**Answer: B**
Explanation: The key advantage of Blue/Green is instant rollback. The old instances (Blue ASG) remain as they are during the termination wait time, so if a problem occurs, simply shifting the ALB target group weight back to Blue restores service within seconds. In-place has to repeat the entire deployment process of downloading and installing the previous version artifact again in order to roll back.

---

**Question 2.** What happens when the `BeforeAllowTraffic` hook in a Lambda AppSpec returns a "Failed" status?

A) The traffic shift proceeds to only 10% and stops
B) The traffic shift never starts and the deployment is marked as failed; if automatic rollback is configured, the old version is kept
C) The hook is ignored and the deployment continues
D) It moves on to the next hook

**Answer: B**
Explanation: `BeforeAllowTraffic` runs before the traffic shift. If this hook returns Failed, the alias weight change never happens — the deployment ends with real user traffic still going to the old version. If automatic rollback is configured, it is handled as a rollback for a deployment failure event.

---

**Question 3.** What is the correct hook execution order in an EC2 AppSpec?

A) BeforeInstall → ApplicationStop → Install → ApplicationStart → ValidateService
B) ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService
C) ApplicationStart → ValidateService → BeforeInstall → ApplicationStop
D) Install → BeforeInstall → ApplicationStop → ApplicationStart

**Answer: B**
Explanation: The EC2 AppSpec hook order is a frequently tested item that must be memorized. Stop → Download → BeforeInstall → Install → AfterInstall → Start → Validate. It is a logical order: "bring it down, download, prepare, install, clean up, bring it up, verify." On the first deployment, ApplicationStop is skipped.

---

**Question 4.** What is the difference between `CodeDeployDefault.LambdaCanary10Percent5Minutes` and `LambdaLinear10PercentEvery1Minute` in a Lambda canary deployment?

A) Canary shifts 10% → 90% after 5 minutes, and Linear increases by 10% every minute to reach 100% in 10 minutes
B) They are identical
C) Canary is for EC2 only, and Linear is for Lambda only
D) Canary is the same as AllAtOnce

**Answer: A**
Explanation: Canary has two steps. After observing 10% for 5 minutes, if there is no problem, the remaining 90% is shifted immediately. Linear increases gradually by 10% every minute and reaches 100% in 10 minutes. Canary is suitable when a quick Go/No-Go decision is possible. Linear is suitable when you need to observe a gradual load increase.

---

**Question 5.** You want to set up a Blue/Green deployment with CodeDeploy for on-premises servers. Is it possible?

A) Yes, it works the same way
B) No. On-premises supports only CodeDeploy in-place deployments
C) Yes, if there is a VPN connection
D) Yes, if you install the latest version of the CodeDeploy agent

**Answer: B**
Explanation: Unlike EC2, CodeDeploy cannot automatically create new instances for on-premises instances. Blue/Green presupposes provisioning a new environment, but AWS does not control on-premises servers. Therefore on-premises supports only in-place deployments. This is a trap question that appears very often on the exam.

---

**Question 6.** What does setting the termination wait time of an EC2 Blue/Green deployment to 1 hour mean?

A) It waits 1 hour before the deployment starts
B) The old instances are preserved for 1 hour after the 100% traffic shift completes — rolling back during this period instantly restores the old version
C) Hook execution is allowed up to 1 hour
D) Alarm monitoring is performed for 1 hour

**Answer: B**
Explanation: The termination wait time is "how long to keep the old instances (Blue) alive after traffic has moved 100% to the new version." If a problem is found during this period, running Stop + Rollback from the CodeDeploy console or CLI instantly restores traffic to the old version. After 1 hour, the old instances are terminated automatically (cost savings).

---

**Question 7.** What is the most appropriate way to implement "automatically roll back if 5xx errors exceed 1% during deployment"?

A) Run a loop in PreTrafficHook that checks 5xx every minute
B) Create a CloudWatch alarm (5xx > 1%) → register it in the deployment group alarm-configuration → include DEPLOYMENT_STOP_ON_ALARM in the auto-rollback events
C) Enabling X-Ray automatically rolls back
D) Handle the failure event with a Lambda destination

**Answer: B**
Explanation: CodeDeploy automatic rollback integrates directly with CloudWatch alarms. Create an alarm on the ALB `HTTPCode_Target_5XX_Count` metric and register this alarm in the deployment group; the moment the alarm enters the ALARM state during a deployment, CodeDeploy automatically stops the deployment and performs a rollback. PreTrafficHook (A) is a one-time validation before the deployment starts, not continuous monitoring during the deployment.

---
