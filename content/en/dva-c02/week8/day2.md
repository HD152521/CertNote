# Day 2 - CodeDeploy: Making the Most Dangerous Moment, Deployment, Safe

When is the most dangerous moment in a running service? Traffic spike? Database failure? Statistics consistently show the answer across Google's SRE book and Microsoft Azure DevOps retrospectives is **"immediately after deployment."** Over 70% of incidents occur within minutes to hours after a new version enters production. The reason is simple — the fact that deployment is complete means "a change that was invisible until now has suddenly been exposed to users."

CodeDeploy is a tool that makes that dangerous moment safe. "Don't change everything at once; change little by little, validate as you go, and be able to immediately roll back if problems occur." DVA-C02 exam features CodeDeploy heavily with 3-5 questions almost every session, and within that, **differences by deployment target (EC2 vs Lambda vs ECS)**, **distinction between Blue/Green vs Canary vs Linear**, and **lifecycle hook order in appspec.yml** are consistent high-frequency topics.

## CodeDeploy's Design Philosophy: View Deployment as "Orchestration"

The problem CodeDeploy solves is not "copy files to server" but "safely coordinate state transitions across multiple nodes." This distinction matters. Simple file copying ends with `rsync` or `scp`, but production deployment involves 7+ sequenced steps: ① redirect traffic briefly ② stop existing process ③ receive new files ④ install dependencies ⑤ start process ⑥ health check ⑦ restore traffic. If any single step fails, later steps cannot proceed, and across multiple instances, all must progress in consistent order.

> 💡 **Related theory**: This kind of "stepwise state transition across multiple nodes" is called a **distributed state machine** in distributed systems theory. CodeDeploy models each deployment as one state machine — each instance has states `Pending → InProgress → Succeeded/Failed`, and lifecycle hooks are triggers for each state transition. Google's Borg/Kubernetes Deployment controller and HashiCorp's Nomad all follow the same pattern. CodeDeploy's differentiation is treating "user-defined script execution at each hook" as a first-class citizen.

> 🔍 **Going deeper**: CodeDeploy Agent polls the CodeDeploy control plane every 1 minute ("any new deployments?"). It's short polling, not HTTP long-polling, for three reasons: ① simpler agent implementation ② load balancing AWS servers ③ recovery during brief network outages. The downside is "average 30-second delay from deployment start command to actual start." When "why doesn't CodeDeploy start immediately?" appears on exam, this polling model is the answer.

## Three Deployment Target Types: Essential Differences

CodeDeploy supports three targets — EC2/on-premises, Lambda, ECS — with completely different internal operations. Though sharing the "CodeDeploy" name, they are essentially three separate services.

| Dimension | EC2/On-Premises | Lambda | ECS |
|-----------|---------|--------|-----|
| Agent Required | ✅ CodeDeploy Agent | ❌ (Lambda alias) | ❌ (ECS service handles) |
| Deployment Unit | Files + scripts | Function version + alias weighting | Task definition revision |
| Deployment Strategy | In-Place / Blue-Green | Canary / Linear / AllAtOnce | Blue-Green only |
| Traffic Switching Mechanism | ALB Target Group swap (B/G) or none (In-Place) | Lambda alias routing-config | ALB Target Group swap |
| appspec Format | YAML (files + hooks) | YAML/JSON (Resources + Hooks) | JSON (TaskDefinition + LoadBalancerInfo) |
| Rollback Mechanism | Redeploy previous revision | Alias weighting restore | Reconnect previous target group |

> ⚠️ **Trap**: The question "how to use In-Place deployment with ECS via CodeDeploy?" is a trap. **ECS supports only Blue-Green with CodeDeploy**. ECS's own rolling update capability is a separate mechanism that ECS service handles directly without CodeDeploy. On exam, "CodeDeploy with ECS Blue-Green" is correct, but "CodeDeploy with ECS In-Place" doesn't exist.

## EC2 Deployment Lifecycle: How Exactly 10 Steps Flow

The core of EC2 deployment is the lifecycle hooks. CodeDeploy Agent executes each step sequentially, and if any user-defined script at a step fails, the entire deployment fails.

```
In-Place Deployment (7 steps)
====================
1. ApplicationStop        [user script]   Stop existing app
2. DownloadBundle         [agent]         Download revision from S3/GitHub
3. BeforeInstall          [user script]   Pre-install work (backup, etc.)
4. Install                [agent]         Copy files from appspec.yml
5. AfterInstall           [user script]   Post-install work (permissions, config)
6. ApplicationStart       [user script]   Start app
7. ValidateService        [user script]   Health check

Blue-Green Deployment (additional steps)
==========================
Blue instance: 1~7 + BeforeBlockTraffic → BlockTraffic → AfterBlockTraffic
Green instance: 1~7 + BeforeAllowTraffic → AllowTraffic → AfterAllowTraffic
```

> 🔍 **Going deeper**: `DownloadBundle` and `Install` are non-customizable agent-internal steps. Without knowing this, questions like "why couldn't I pre-fetch files in BeforeInstall?" come up often. The bundle is packaged as zip/tar and agent unpacks it to `/opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/deployment-archive`. BeforeInstall can access the unpacked directory, but that's before copying to destination (e.g., `/var/www/html`).

> 💡 **Related theory**: This lifecycle model traces to systemd unit's ExecStartPre/ExecStart/ExecStartPost pattern or Docker's entrypoint/healthcheck pattern. The thought of "explicitly separating service start/stop/validation into hooks" flowing from Init system era (SysV init → systemd) into cloud deployment tools. Kubernetes's readiness/liveness probe does exactly the same work as ValidateService.

```yaml
version: 0.0
os: linux

files:
  - source: build/         # Path within unpacked directory
    destination: /var/www/myapp
  - source: nginx.conf
    destination: /etc/nginx/conf.d/myapp.conf

file_exists_behavior: OVERWRITE   # DISALLOW | OVERWRITE | RETAIN
                                  # DISALLOW: fail if file exists (safe)
                                  # OVERWRITE: overwrite unconditionally
                                  # RETAIN: keep existing, copy new only

permissions:
  - object: /var/www/myapp
    pattern: "**"
    owner: nginx
    group: nginx
    mode: 644
    type:
      - file
  - object: /var/www/myapp/bin
    pattern: "**"
    mode: 755
    type:
      - file

hooks:
  ApplicationStop:
    - location: scripts/stop.sh
      timeout: 60
      runas: root
  BeforeInstall:
    - location: scripts/backup.sh
      timeout: 30
  AfterInstall:
    - location: scripts/configure.sh
      timeout: 120
  ApplicationStart:
    - location: scripts/start.sh
      timeout: 60
  ValidateService:
    - location: scripts/healthcheck.sh
      timeout: 30
```

> ⚠️ **Trap**: The `ApplicationStop` hook runs **the script from the previous revision**. That is, v1 → v2 deployment: ApplicationStop runs the script that was in v1. A new script added in v2 first runs as ApplicationStop in the **next** deployment. This is a frequent source of confusion and appears once per exam.

## Deployment Configuration: Is AllAtOnce Really Dangerous?

CodeDeploy's "Deployment Configuration" determines how many instances deploy simultaneously.

| Configuration | Simultaneous Deploy | "Success" Criteria | Exam Keyword |
|--------|----------|-------------|-------------|
| `CodeDeployDefault.AllAtOnce` | All instances | 1+ success | "Fastest deployment" |
| `CodeDeployDefault.HalfAtATime` | 50% | 50%+ healthy | "Balanced" |
| `CodeDeployDefault.OneAtATime` | 1 instance | All success | "Safest progressive" |
| Custom: `Min Healthy Hosts = 75%` | Deploy 25% simultaneously | 75%+ healthy | Large fleet gradual |

> 🔍 **Going deeper**: AllAtOnce's "1 success means deployment success" contradicts intuition. The reason is CodeDeploy's philosophy: "deployment status" and "service availability" are separate. The deployment itself is done, and having even 1 instance receive the new version means the intended work is complete — whether the service remains available is a separate question answered by CloudWatch Alarm. This separation rarely appears on exam directly but is a trap during operations.

> 📚 **Case study**: Netflix uses "Rolling Red/Black" pattern in its own Spinnaker deployment tool, which is essentially CodeDeploy's OneAtATime + strict ValidateService: one instance gets new version → 1-5 minutes of traffic → observe metrics → succeed, go to next; fail, rollback immediately. The same effect can be created with CodeDeploy's OneAtATime + CloudWatch Alarm + Auto Rollback combination.

## Blue-Green: The Luxury of Running Two Complete Environments

In-Place deployment replaces files on the same instance. Fast, cheap, but rollback is hard — previous files already gone. Blue-Green **boots an entirely new ASG** and deploys v2 on new instances, then ALB Target Group swaps to new ASG. If something goes wrong, swap back to the original ASG — done.

```
[ALB] ──── Production Listener (port 80)
   │           │
   │           ├── Target Group "blue"  ← ASG-blue (v1, 3 instances)
   │           │
   │           └── Target Group "green" ← ASG-green (v2, 3 instances) [NEW]
   │
   └── [During deployment, Listener Rule switches to green]
```

Blue-Green trade-offs:

| Item | Value |
|------|-------|
| Infrastructure Cost | 2x during validation period |
| Rollback Time | Seconds (Target Group swap only) |
| Deployment Time vs In-Place | Slightly longer (ASG provisioning + warmup) |
| Stateful Workload Suitability | Low (instances change, EBS data lost) |

> ⚠️ **Trap**: "What happens to the original (Blue) ASG after Blue-Green deployment?" appears on exam. Two options: ① **Terminate immediately** ② **Wait N minutes then terminate**. The latter keeps Blue alive briefly for fast rollback insurance, usually 5 minutes to 1 hour.

> 💡 **Related theory**: "Blue-Green" terminology was established in Jez Humble and David Farley's 2010 book *Continuous Delivery*. Before that the same pattern existed under various names (Red-Black, A-B switch), but using neutral colors meant neither side was "the old one" — just a label. CodeDeploy, Spinnaker, Argo Rollouts, Flagger all use the same terminology.

## Lambda Deployment: Traffic Sliced via Alias's routing-config

Lambda works completely differently from EC2. Rather than copying files, **publish a new function version and adjust traffic percentage via alias's routing-config**.

```python
# Lambda alias traffic splitting (Boto3)
import boto3
lambda_client = boto3.client('lambda')

# Set alias 'live' so v1 gets 90%, v2 gets 10%
lambda_client.update_alias(
    FunctionName='my-function',
    Name='live',
    FunctionVersion='1',                # Base version
    RoutingConfig={
        'AdditionalVersionWeights': {
            '2': 0.1                    # v2 gets 10%
        }
    }
)
```

CodeDeploy's Lambda deployment automates this update_alias call on a predefined schedule. 9 pre-defined configurations that appear every exam:

| Configuration | First Shift | Wait Until Second | Full Shift Complete |
|---------------|-------------|---------------------|---------------|
| `LambdaAllAtOnce` | 100% | - | Immediately |
| `LambdaCanary10Percent5Minutes` | 10% | 5 min | After 5 min |
| `LambdaCanary10Percent10Minutes` | 10% | 10 min | After 10 min |
| `LambdaCanary10Percent15Minutes` | 10% | 15 min | After 15 min |
| `LambdaCanary10Percent30Minutes` | 10% | 30 min | After 30 min |
| `LambdaLinear10PercentEvery1Minute` | 10% | +10% every 1 min | After 10 min |
| `LambdaLinear10PercentEvery2Minutes` | 10% | +10% every 2 min | After 20 min |
| `LambdaLinear10PercentEvery3Minutes` | 10% | +10% every 3 min | After 30 min |
| `LambdaLinear10PercentEvery10Minutes` | 10% | +10% every 10 min | After 100 min |

> 🔍 **Going deeper**: **Canary vs Linear difference** is exam core. Canary is "hold 10% at N minutes for monitoring, then jump to 90% in one move" — 2-stage transition. Linear is "10%, 20%, 30%..." incrementing evenly every N minutes. Canary is fast with concentrated risk; Linear is gradual. Canary suits quick validation → full deploy; Linear suits A/B testing.

> 💡 **Related theory**: "Canary" terminology comes from 19-20th century miners carrying canaries into coal mines to detect toxic gas leaks — canaries were more sensitive than humans and died first, signaling danger. In software, canary release means "expose new version to subset of users, detect problems early before full rollout." Netflix documented this in detail in 2014 *Netflix Tech Blog*, making it industry standard.

```yaml
# Lambda appspec.yml
version: 0.0
Resources:
  - MyLambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: my-function
        Alias: live
        CurrentVersion: 1
        TargetVersion: 2

Hooks:
  - BeforeAllowTraffic: pre-traffic-validation-fn      # Validation before receiving traffic
  - AfterAllowTraffic: post-traffic-validation-fn      # Validation after shift complete
```

Hooks must call `PutLifecycleEventHookExecutionStatus` API at the end to report Succeeded/Failed. Without it, deployment hangs until timeout (default 1 hour).

```python
def lambda_handler(event, context):
    # event contains deploymentId and lifecycleEventHookExecutionId
    deployment_id = event['DeploymentId']
    hook_execution_id = event['LifecycleEventHookExecutionId']

    # Validation logic (smoke test, contract test, etc.)
    success = run_smoke_test()

    codedeploy = boto3.client('codedeploy')
    codedeploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=hook_execution_id,
        status='Succeeded' if success else 'Failed'
    )
```

> ⚠️ **Trap**: If BeforeAllowTraffic hook fails, new version traffic goes immediately to 0% (instant rollback). If AfterAllowTraffic hook fails, the shift is already complete but automatically rolls back to previous version — both hooks are auto-rollback triggers. When "Lambda deployment validation failure" appears on exam, consider both hooks and auto-rollback together.

## CloudWatch Alarm Based Auto-Rollback

If error rate spikes during or after deployment, automatic rollback is desired. CodeDeploy integrates with CloudWatch Alarm.

```yaml
# DeploymentGroup config (CloudFormation excerpt)
DeploymentGroup:
  AutoRollbackConfiguration:
    Enabled: true
    Events:
      - DEPLOYMENT_FAILURE        # Deployment itself fails
      - DEPLOYMENT_STOP_ON_ALARM  # Alarm triggers stop
      - DEPLOYMENT_STOP_ON_REQUEST # User manual stop
  AlarmConfiguration:
    Enabled: true
    Alarms:
      - Name: lambda-error-rate-high
      - Name: lambda-duration-high
    IgnorePollAlarmFailure: false
```

> 🔍 **Going deeper**: `IgnorePollAlarmFailure` at `false` means deployment fail-stops if CloudWatch alarm status cannot be queried. Conservative for safety but blocks deployment during CloudWatch downtime. At `true`, deployment continues if alarm check fails — availability first. Neither is universally correct; both are valid based on operational policy.

## ECS Blue-Green: Swap Target Group Entirely

ECS with CodeDeploy is always Blue-Green. Mechanism resembles EC2 Blue-Green but **task definition revision** is the unit, not instances.

```
[ALB Production Listener:80]
       │
       ├── Target Group "blue"  ← ECS Service's Blue Tasks (revision N)
       │
       └── Target Group "green" ← ECS Service's Green Tasks (revision N+1) [NEW]

[ALB Test Listener:8080]    ← Separate Listener for validating Green during deploy
       │
       └── Target Group "green"
```

Deployment flow:

1. CodeDeploy starts tasks with new task definition on ECS service (Green)
2. All Green tasks reach healthy state, then Production listener shifts to Green
3. (Optional) Blue tasks stay alive N minutes (fast rollback insurance)
4. After time passes, terminate Blue tasks

> ⚠️ **Trap**: For ECS Blue-Green, ① **2 ALB Target Groups** required ② Production + (optional) Test Listener configuration ③ ECS service `deploymentController.type` must be `CODE_DEPLOY` ④ appspec.json specifies task definition + load balancer info. Missing any one causes deployment start itself to fail. When "ECS Blue-Green prerequisites" appears on exam, all 4 are required answers.

```json
{
  "version": 0.0,
  "Resources": [
    {
      "TargetService": {
        "Type": "AWS::ECS::Service",
        "Properties": {
          "TaskDefinition": "arn:aws:ecs:...:task-definition/myapp:42",
          "LoadBalancerInfo": {
            "ContainerName": "app",
            "ContainerPort": 80
          },
          "PlatformVersion": "LATEST"
        }
      }
    }
  ],
  "Hooks": [
    { "BeforeInstall": "pre-validation-fn" },
    { "AfterInstall": "post-task-up-fn" },
    { "AfterAllowTestTraffic": "smoke-test-fn" },
    { "BeforeAllowTraffic": "final-check-fn" },
    { "AfterAllowTraffic": "post-deploy-fn" }
  ]
}
```

## Comparison with Other Deployment Tools

| Dimension | CodeDeploy | Spinnaker | Argo Rollouts | Octopus Deploy |
|-----------|-----------|-----------|---------------|----------------|
| Hosting | AWS managed | self-hosted | Kubernetes-native | self-hosted/SaaS |
| Targets | EC2/Lambda/ECS | Multicloud + K8s | K8s only | Multi + .NET strong |
| Canary | Lambda native, EC2 via fleet partial | Rich (auto analysis) | Rich (Prometheus integration) | Limited |
| Learning Curve | Low | Very high | Medium | Low |
| IAM Integration | Native | OIDC possible | K8s ServiceAccount | External integration |

> 📚 **Case study**: In 2017, GitLab publicly shared the db1.cluster.gitlab.com incident where a database operator accidentally deleted production backup with wrong command. GitLab subsequently added the "5-person rule" (5 people review) on all production changes, but more fundamentally added safety gates to the deployment tool itself. CodeDeploy's ValidateService and BeforeAllowTraffic hooks automate this kind of safety gate — rather than people validating each time, a validation script must automatically pass before proceeding.

## CodeDeploy Agent Operations Tips

```bash
# Amazon Linux 2 installation
sudo yum install -y ruby wget
wget https://aws-codedeploy-${REGION}.s3.${REGION}.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Manage with systemd
sudo systemctl enable codedeploy-agent
sudo systemctl start codedeploy-agent
sudo systemctl status codedeploy-agent

# Log locations (debugging essential)
tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log
tail -f /opt/codedeploy-agent/deployment-root/deployment-logs/codedeploy-agent-deployments.log

# All hook logs for specific deployment
ls /opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/logs/
```

> 🔍 **Going deeper**: Agent is written in Ruby. Reason: in 2014 at launch, many AWS operational tools were Ruby-based (OpsWorks' Chef also Ruby). Recent discussion on Go/Rust rewrites exists but hasn't happened due to compatibility. Ruby dependency requirement is occasionally a trap — missing Ruby in minimal container image causes agent install failure.

## Wrapping Up

CodeDeploy's essence is "break deployment's dangerous moment into small steps, embed validation and rollback mechanisms at each step." On EC2 via lifecycle hooks, on Lambda via alias weighting, on ECS via task definition swap — the same philosophy implemented differently across three targets.

Next article covers the orchestrator flowing all these steps automatically — **CodePipeline**. How to manage source change detection through build, test, approval, and deployment in code, including multi-region and multi-account pipeline patterns.

---

## 📝 연습 문제

**문제 1.** What are the mandatory prerequisites to use CodeDeploy with EC2 instances?

A) CodeDeploy Agent installation on EC2
B) Grant S3 download permission to EC2 instance profile
C) Pre-create 2 ALB Target Groups
D) Create CodeDeploy service role

**정답: A, B, D**

해설: A) Agent is essential for EC2 deployment — without it, polling itself doesn't happen. B) Must download bundle from S3, so instance needs S3 read permission (IAM instance profile + `s3:GetObject`). D) CodeDeploy service role is essential for CodeDeploy to manipulate user EC2/ASG/ALB. C) 2 Target Groups are **Blue-Green only** — In-Place needs just 1. On exam, "EC2 deployment prerequisites" typically A+D, while "Blue-Green extra prerequisites" adds C.

---

**문제 2.** When transitioning Lambda function to new version, you want to **send only 10% traffic for 10 minutes then switch remaining in one move**. Best deployment configuration?

A) `LambdaLinear10PercentEvery1Minute`
B) `LambdaCanary10Percent10Minutes`
C) `LambdaCanary10Percent5Minutes`
D) `LambdaAllAtOnce`

**정답: B**

해설: Canary pattern is "hold N% for M minutes, then jump to 100% once" — 2-stage shift. Problem asks "10% for 10 minutes then switch rest in one move" matching `LambdaCanary10Percent10Minutes` exactly. A) Linear shifts +10% every 1 min, gradual increase ≠ "switch in one move"; B) 5 min is wrong time condition; D) AllAtOnce jumps immediately to 100%. Canary vs Linear distinction is exam core.

---

**문제 3.** Which of the following is the **most appropriate statement about EC2 ApplicationStop**?

A) It runs the newest revision's script
B) It runs the previous revision's script
C) It's skipped if previous phases succeed
D) It can only use shell scripts, not other languages

**정답: B**

해설: ApplicationStop runs **the script from the previous revision** — the earliest phase regardless of how new revision other phases fail. If ApplicationStop itself fails, that instance deployment is marked failed but subsequent phases not affected. B/C/D are all downstream and skipped if earlier phases fail. When "ApplicationStop's specialness" appears on exam, "previous revision's script runs" is the answer.

---

**문제 4.** What is NOT a mandatory prerequisite for ECS Blue-Green deployment with CodeDeploy?

A) Set ECS service's deploymentController.type to CODE_DEPLOY
B) Pre-create 2 ALB Target Groups (Production + Test)
C) Specify TaskDefinition and LoadBalancerInfo in appspec.json
D) Install CodeDeploy Agent in ECS container

**정답: D**

해설: ECS **doesn't require CodeDeploy Agent** — ECS service handles task definition swap and target group transition, CodeDeploy orchestrates. Agent is EC2/on-premises only. A) Switching deployment controller to CODE_DEPLOY lets CodeDeploy manipulate ECS service. B) Blue-Green by definition requires two environments. C) appspec.json carries CodeDeploy-ECS connection info. "ECS + Agent" answer is almost always a trap on exam.

---

**문제 5.** If CloudWatch Alarm `ErrorRate > 5%` fires during EC2 fleet (100 instances) In-Place deployment, what's needed for auto-rollback?

A) Add alarm to DeploymentGroup's AlarmConfiguration + include DEPLOYMENT_STOP_ON_ALARM in AutoRollbackConfiguration.Events
B) Register CodeDeploy stop API directly in CloudWatch Alarm action
C) Write Lambda to call stop on alarm
D) Change ASG health check type to ELB

**정답: A**

해설: CodeDeploy auto-rollback requires both settings active. ① AlarmConfiguration registers alarms for CodeDeploy to poll ② AutoRollbackConfiguration.Events with `DEPLOYMENT_STOP_ON_ALARM` triggers auto-rollback on alarm. B) CloudWatch Alarm doesn't support CodeDeploy API directly. C) Possible but inefficient with race condition risk. D) Unrelated. "Deployment + alarm → auto-rollback" is a classic exam scenario — both settings together is the answer.

---

**문제 6.** CodeDeploy Blue-Green deployment after swap, if original ASG is set to **terminate 5 minutes later**, what's the purpose?

A) New ASG warmup time
B) Fast rollback safety net (original ASG stays live for instant swap reversal if needed)
C) DNS TTL expiry wait
D) Cost optimization cooldown

**정답: B**

해설: Keeping original ASG alive after swap is **fast rollback insurance** — within 5 minutes, if problems detected, ALB listener rule can switch back, instant EC2 restoration without re-provisioning. After 5 minutes, original instances terminate; thereafter rollback requires spinning up new instances. A) Warmup before swap. C) ALB handles DNS internally. D) ASG cooldown is scale policy term, unrelated. When "Blue-Green termination wait time" appears on exam, it's the rollback insurance explanation.

---

**문제 7.** Which of the following is NOT a supported CodeDeploy deployment target?

A) Amazon EC2 Auto Scaling Group
B) AWS Lambda function
C) Amazon ECS service
D) Amazon RDS DB instance

**정답: D**

해설: CodeDeploy's official targets are EC2/on-premises (including ASG), Lambda, ECS — three only. RDS is a database service with different deployment concept; schema migration uses separate tools (Flyway/Liquibase) or RDS's own blue/green deployment (added 2022, separate from CodeDeploy). A/B/C are explicit support. When "CodeDeploy target NOT in scope" appears on exam, data services like RDS/DynamoDB/S3 are almost always the wrong answer.
