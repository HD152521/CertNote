# Day 2 - CodeDeploy: Making the Riskiest Moment, Deployment, Safe

When is the riskiest moment for a service in operation? A traffic surge? A database failure? Google's SRE book explains that about 70% of service outages come from changes to a running system. So the riskiest moment is **"right after a deployment."** The reason is simple: the very fact that a deployment has finished means "changes that were invisible until now have all been exposed to users at once."

CodeDeploy is the tool that makes that risky moment safe. It carries out a deployment so that "you don't change everything at once, but little by little, verifying as you go, and able to revert immediately if a problem occurs." CodeDeploy is a major area on the DVA-C02 exam. In particular you need to know **the differences by deployment target (EC2 vs Lambda vs ECS)**, **the distinction between Blue/Green, Canary, and Linear**, and **the order of the lifecycle hooks in appspec.yml**.

## CodeDeploy's Design Philosophy: Treating Deployment as "Orchestration"

The problem CodeDeploy tries to solve is not "copy files to a server" but "safely coordinate the state transitions that happen across multiple nodes." This difference matters. Simple file copying ends with `rsync` or `scp`, but a production deployment is an ordered job of seven or more steps: ① briefly take traffic out, ② stop the existing process, ③ fetch the new files, ④ install dependencies, ⑤ start the process, ⑥ run a health check, ⑦ put traffic back in. If even one step fails, you must not move on to the next, and the steps must proceed in a consistent order across multiple instances.

CodeDeploy models each deployment as a state machine. Each instance has the states `Pending → InProgress → Succeeded/Failed`, and lifecycle hooks become the trigger of each state transition. What sets CodeDeploy apart is that it treats "running user-defined scripts at each hook" as a first-class citizen.

The CodeDeploy Agent polls the CodeDeploy control plane from the EC2 instance every minute ("Is there a new deployment?"). This is a short-polling model rather than HTTP long-polling, for the reasons of ① simplicity of the agent implementation, ② spreading the load on AWS servers, and ③ resilience to temporary network disconnections. The downside is "an average 30-second delay from the deployment start command to the actual start." The answer to the question "Why doesn't CodeDeploy start immediately?" is this polling model.

## The Fundamental Difference Between the Three Deployment Targets

CodeDeploy supports three targets, EC2/on-premises, Lambda, and ECS, and their internal behavior is completely different. They use the same name "CodeDeploy," but they are actually closer to three separate services.

| Dimension | EC2/On-premises | Lambda | ECS |
|------|---------------|--------|-----|
| Agent required | ✅ CodeDeploy Agent | ❌ (uses Lambda's own aliases) | ❌ (handled by the ECS service) |
| Deployment unit | Files + scripts | Function version + alias weights | Task definition revision |
| Deployment strategy | In-Place / Blue/Green | Canary / Linear / AllAtOnce | Blue/Green only |
| Traffic shifting mechanism | ALB Target Group swap (B/G) or no change (In-Place) | Lambda alias routing-config | ALB Target Group swap |
| appspec format | YAML (files + hooks sections) | YAML/JSON (Resources + Hooks sections) | JSON (TaskDefinition + LoadBalancerInfo) |
| Rollback mechanism | Redeploy the previous revision | Restore the alias weights | Reconnect the previous target group |

> ⚠️ **Trap**: A question like "How do you use an In-Place deployment on ECS?" is a trap. **With CodeDeploy, ECS supports only Blue/Green.** ECS's own rolling update feature does not use CodeDeploy; it is a separate mechanism that the ECS service performs directly. If "ECS Blue/Green with CodeDeploy" appears on the exam it is a correct answer, but "ECS In-Place with CodeDeploy" does not exist.

## The EC2 Deployment Lifecycle: Exactly How Do the 10 Steps Flow?

The core of an EC2 deployment is the lifecycle hooks. The CodeDeploy Agent runs each step in order, and if a user-defined script fails in any step, the entire deployment is marked as failed.

```
In-Place deployment (7 steps)
====================
1. ApplicationStop        [user script]   Stop the existing app
2. DownloadBundle         [agent]         Download the revision from S3/GitHub
3. BeforeInstall          [user script]   Pre-install work (backups, etc.)
4. Install                [agent]         Copy the files section of appspec.yml
5. AfterInstall           [user script]   Post-install work (permissions, configuration)
6. ApplicationStart       [user script]   Start the app
7. ValidateService        [user script]   Health check

Blue/Green deployment (additional steps)
==========================
Blue instance: 1~7 + BeforeBlockTraffic → BlockTraffic → AfterBlockTraffic
Green instance: 1~7 + BeforeAllowTraffic → AllowTraffic → AfterAllowTraffic
```

`DownloadBundle` and `Install` are internal agent steps that cannot be customized by the user. If you don't know this, it's easy to misunderstand, thinking "I tried to fetch the files in advance in BeforeInstall but it didn't work." The bundle is packaged as zip/tar, and the agent unpacks it to `/opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/deployment-archive`. BeforeInstall can access that unpacked directory, but it is the state just before files are copied to the destination (for example `/var/www/html`).

ValidateService plays the same role as Kubernetes' readiness/liveness probe.

```yaml
version: 0.0
os: linux

files:
  - source: build/         # Path inside the unpacked directory
    destination: /var/www/myapp
  - source: nginx.conf
    destination: /etc/nginx/conf.d/myapp.conf

file_exists_behavior: OVERWRITE   # DISALLOW | OVERWRITE | RETAIN
                                  # DISALLOW: fail if an existing file is present (safe)
                                  # OVERWRITE: overwrite unconditionally
                                  # RETAIN: keep existing files, copy only new ones

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

The `ApplicationStop` hook runs the **script from the previous revision**. That is, when deploying v1 → v2, the ApplicationStop script that was in v1 runs. Some people don't know this and say, "I added a new feature in ApplicationStop but it didn't run," but a script added in this deployment is first run as ApplicationStop at **the next deployment**. This is a subtle behavior that appears on the exam.

## Deployment Configurations: Is AllAtOnce Really Dangerous?

CodeDeploy's "Deployment Configuration" determines how many instances are deployed to at the same time.

| Configuration | Concurrent deployment | "Success" criterion | Exam keyword |
|------|----------|-------------|-------------|
| `CodeDeployDefault.AllAtOnce` | All instances | Deployment success if at least 1 succeeds | "Fastest deployment" |
| `CodeDeployDefault.HalfAtATime` | 50% | At least 50% healthy | "Balanced" |
| `CodeDeployDefault.OneAtATime` | 1 | All instances succeed | "Safest gradual" |
| Custom: `Min Healthy Hosts = 75%` | Only 25% deploy concurrently | At least 75% healthy | Gradual for large fleets |

AllAtOnce's definition that "the deployment itself is a success even if only one succeeds" goes against intuition. The reason is CodeDeploy's philosophy that "deployment status" and "service availability" are separate. The deployment itself is finished, and if even one instance in the fleet received the new version, the intended job is complete. Whether the service is available as a result is a separate matter, which you must judge with CloudWatch Alarms. This becomes a trap in operations.

Netflix uses a "Rolling Red/Black" pattern in its own deployment tool Spinnaker, which is essentially the same as a pattern that verifies CodeDeploy's OneAtATime + ValidateService very strictly. Deploy the new version to one instance → let it receive traffic for 1-5 minutes while watching metrics → if healthy, move to the next instance, and if unhealthy, roll back immediately. You can produce almost the same effect with CodeDeploy's combination of OneAtATime + CloudWatch Alarm + Auto Rollback.

## Blue/Green: The Luxury of Spinning Up Two Whole Environments

An In-Place deployment replaces the files on the same instance. It is fast and costs nothing extra, but rollback is hard because the previous files are already gone. Blue/Green **spins up a whole new ASG**, deploys v2 to the new instances, and swaps the ALB Target Group to the new ASG. If something goes wrong, you just swap back to the original ASG and you're done.

```
[ALB] ──── Production Listener (port 80)
   │           │
   │           ├── Target Group "blue"  ← ASG-blue (v1, 3 instances)
   │           │
   │           └── Target Group "green" ← ASG-green (v2, 3 instances) [new]
   │
   └── [As the deployment proceeds, the Listener Rule switches to green]
```

The trade-offs of Blue/Green:

| Item | Value |
|------|-----|
| Infrastructure cost | 2x during the validation period |
| Rollback time | A few seconds (just a Target Group swap) |
| Deployment time vs In-Place | Slightly longer (ASG provisioning + Warmup) |
| Suitability for stateful workloads | Low (instances change, so EBS data is lost) |

"What happens to the original (Blue) ASG after a Blue/Green deployment?" appears on the exam. There are two options: ① **terminate immediately** (Terminate original instances immediately) or ② **terminate after a specified time** (Wait N minutes then terminate). The latter acts as a safety net: keeping Blue alive briefly even after the swap allows a fast rollback. It is usually set somewhere between 5 minutes and 1 hour.

## Lambda Deployment: Slicing Traffic with the Alias routing-config

Lambda is a completely different mechanism from EC2. It doesn't copy files anywhere; it **publishes a new version of the function and adjusts the traffic ratio with the alias routing-config**.

```python
# Lambda alias traffic split (Boto3)
import boto3
lambda_client = boto3.client('lambda')

# Configure alias 'live' so v1 receives 90% and v2 receives 10%
lambda_client.update_alias(
    FunctionName='my-function',
    Name='live',
    FunctionVersion='1',                # Primary version
    RoutingConfig={
        'AdditionalVersionWeights': {
            '2': 0.1                    # v2 gets 10%
        }
    }
)
```

CodeDeploy's Lambda deployment automates this update_alias call on a predefined schedule. There are 9 predefined configurations.

| Configuration | First shift percentage | Wait until the second shift | Full shift point |
|---------------|-------------|---------------------|---------------|
| `LambdaAllAtOnce` | 100% | - | Immediately |
| `LambdaCanary10Percent5Minutes` | 10% | 5 minutes | After 5 minutes |
| `LambdaCanary10Percent10Minutes` | 10% | 10 minutes | After 10 minutes |
| `LambdaCanary10Percent15Minutes` | 10% | 15 minutes | After 15 minutes |
| `LambdaCanary10Percent30Minutes` | 10% | 30 minutes | After 30 minutes |
| `LambdaLinear10PercentEvery1Minute` | 10% | +10% every 1 minute | After 10 minutes |
| `LambdaLinear10PercentEvery2Minutes` | 10% | +10% every 2 minutes | After 20 minutes |
| `LambdaLinear10PercentEvery3Minutes` | 10% | +10% every 3 minutes | After 30 minutes |
| `LambdaLinear10PercentEvery10Minutes` | 10% | +10% every 10 minutes | After 100 minutes |

**The difference between Canary and Linear** is the heart of the exam. Canary is a two-step shift: "hold 10% for N minutes and watch, then go to 90% all at once." You monitor for problems at the first 10%, then go to the whole with one big decision. Linear increases evenly every N minutes: "10%, 20%, 30%, ...". Canary is fast but carries the risk of concentrating on one side, whereas Linear is slow and gradual. Linear suits cases that need A/B testing, and Canary suits cases that need quick validation followed by a full deployment.

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
  - BeforeAllowTraffic: pre-traffic-validation-fn      # Validate before receiving traffic
  - AfterAllowTraffic: post-traffic-validation-fn      # Validate after the shift completes
```

The Lambda function called from a hook must call the `PutLifecycleEventHookExecutionStatus` API at the end to report Succeeded/Failed. If it doesn't, the deployment stays stuck until the timeout (default 1 hour).

```python
def lambda_handler(event, context):
    # The event contains deploymentId and lifecycleEventHookExecutionId
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

If the BeforeAllowTraffic hook fails, it rolls back immediately with 0% of traffic on the new version. If the AfterAllowTraffic hook fails, it automatically rolls back to the previous version even though the shift has already finished. In other words, both hooks become automatic rollback triggers. If "behavior when validation fails during a Lambda deployment" appears on the exam, look at these two hooks and automatic rollback together.

## Automatic Rollback Based on CloudWatch Alarms

If the error rate spikes during or right after a deployment, you want to roll back automatically. CodeDeploy is integrated with CloudWatch Alarms.

```yaml
# DeploymentGroup settings (CloudFormation excerpt)
DeploymentGroup:
  AutoRollbackConfiguration:
    Enabled: true
    Events:
      - DEPLOYMENT_FAILURE        # The deployment itself failed
      - DEPLOYMENT_STOP_ON_ALARM  # Stopped because an alarm fired
      - DEPLOYMENT_STOP_ON_REQUEST # Manual stop by the user
  AlarmConfiguration:
    Enabled: true
    Alarms:
      - Name: lambda-error-rate-high
      - Name: lambda-duration-high
    IgnorePollAlarmFailure: false
```

If `IgnorePollAlarmFailure` is `false`, the deployment fail-stops when the alarm status can't be retrieved from CloudWatch. It is conservative from a safety standpoint, but deployments get blocked during a temporary CloudWatch outage. If set to `true`, the deployment simply proceeds when the alarm lookup fails, which favors availability. Neither is the right answer; it depends on the operational policy.

## ECS Blue/Green: Swapping the Whole Target Group

With CodeDeploy, ECS supports only Blue/Green. The principle is similar to EC2 Blue/Green, but the unit is not an instance but the **Task definition revision**.

```
[ALB Production Listener:80]
       │
       ├── Target Group "blue"  ← Blue Tasks of the ECS Service (revision N)
       │
       └── Target Group "green" ← Green Tasks of the ECS Service (revision N+1) [new]

[ALB Test Listener:8080]    ← A separate Listener for validating Green during the deployment
       │
       └── Target Group "green"
```

The deployment flow:

1. CodeDeploy launches tasks (Green) in the ECS service with the new task definition
2. Once all Green tasks are healthy, the Production listener is switched to Green
3. (Optional) Keep the Blue tasks alive for a specified time (a safety net for fast rollback)
4. After the time elapses, terminate the Blue tasks

To use ECS Blue/Green you need four things.

- **2** ALB Target Groups
- A Production Listener and (optionally) a Test Listener configured
- The ECS service's `deploymentController.type` set to `CODE_DEPLOY`
- An appspec.json file specifying the task definition + load balancer info

If even one is missing, the deployment fails to start at all. If "prerequisites for ECS Blue/Green" appears on the exam, all four of these are the answer.

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
|------|-----------|-----------|---------------|----------------|
| Hosting | AWS managed | self-hosted | Kubernetes-native | self-hosted/SaaS |
| Targets | EC2/Lambda/ECS | Multi-cloud + K8s | K8s only | Multi + strong with .NET |
| Canary | Native only for Lambda, partial fleet deployment for EC2 | Rich (automated analysis) | Rich (Prometheus integration) | Limited |
| Learning curve | Low | Very high | Medium | Low |
| IAM integration | Native | OIDC possible | K8s ServiceAccount | External integration |

## CodeDeploy Agent Operations Tips

```bash
# Install on Amazon Linux 2
sudo yum install -y ruby wget
wget https://aws-codedeploy-${REGION}.s3.${REGION}.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Manage with systemd
sudo systemctl enable codedeploy-agent
sudo systemctl start codedeploy-agent
sudo systemctl status codedeploy-agent

# Log locations (essential for debugging)
tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log
tail -f /opt/codedeploy-agent/deployment-root/deployment-logs/codedeploy-agent-deployments.log

# All hook logs for a specific deployment
ls /opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/logs/
```

The agent is written in Ruby, so Ruby must be installed for it to work. If a minimal container image has no Ruby, the agent installation fails.

## Summary

The essence of CodeDeploy is "breaking the risky moment of deployment into several small steps and embedding validation and rollback mechanisms in each step." It implements the same philosophy in different ways: with lifecycle hooks on EC2, with alias weights on Lambda, and with a task definition swap on ECS.

In the next post we look at the orchestrator that flows all these steps automatically: **CodePipeline**. We cover how to manage the entire flow, from detecting source changes through build, test, approval, and deployment, as code, and we touch on multi-Region and multi-account pipeline patterns.

---

## 📝 Practice Questions

**Question 1.** Which of the following are all the required prerequisites for using CodeDeploy with EC2?

A) Install the CodeDeploy Agent on EC2
B) Grant S3 download permission to the EC2 instance profile
C) Pre-create 2 ALB Target Groups
D) Create a CodeDeploy service role

**Answer: A, B, D**

Explanation: A) The Agent is a prerequisite for EC2 deployment. Without it, polling itself doesn't happen. B) Since the bundle is downloaded from S3, the instance needs S3 read permission (IAM instance profile + `s3:GetObject`). D) The CodeDeploy service role is required for CodeDeploy to operate the EC2/ASG/ALB in the user's account. C) Two Target Groups are needed only for **Blue-Green**, and **In-Place** needs only one. On the exam, "required conditions for EC2 deployment" is usually A+D, and "additional conditions for Blue-Green" is C.

---

**Question 2.** You are switching a Lambda function to a new version and want to **send only 10% of traffic for the first 10 minutes and then shift the rest all at once**. Which deployment configuration fits?

A) `LambdaLinear10PercentEvery1Minute`
B) `LambdaCanary10Percent10Minutes`
C) `LambdaCanary10Percent5Minutes`
D) `LambdaAllAtOnce`

**Answer: B**

Explanation: The Canary pattern is a two-step shift: "hold the first N% for M minutes and watch, then go to 100% all at once." The condition in the question is "10% for 10 minutes," so it is `LambdaCanary10Percent10Minutes`. A) Linear increases evenly by +10% every minute and reaches 100% after 10 minutes, but that is gradual growth rather than "shifting the rest all at once." C) It holds for only 5 minutes, so the time condition doesn't match. D) AllAtOnce goes to 100% immediately with no gradual shift. The distinction between Canary and Linear is the heart of the exam.

---

**Question 3.** Among the lifecycle hooks in appspec.yml, which one **always runs even if the new version fails**? (For EC2 In-Place)

A) ApplicationStop
B) AfterInstall
C) ValidateService
D) ApplicationStart

**Answer: A**

Explanation: The key is that ApplicationStop runs the **script from the previous revision**. Even if any step of the new revision fails, ApplicationStop has already run before it (it is the very first step). Also, if ApplicationStop fails, that instance's deployment is marked as failed, but the other steps are not affected. B/C/D are all later steps and are skipped if an earlier step fails. If "the special nature of ApplicationStop" appears on the exam, "runs the previous revision's script" is the answer.

---

**Question 4.** You want to configure a Blue-Green deployment with CodeDeploy for an ECS service. Which is NOT a required prerequisite?

A) 2 ALB Target Groups
B) Set the ECS service's deploymentController.type to CODE_DEPLOY
C) Install the CodeDeploy Agent on the ECS containers
D) Specify the TaskDefinition and LoadBalancerInfo in appspec.json

**Answer: C**

Explanation: ECS **does not need the CodeDeploy Agent**. The ECS service handles the task definition change and the target group switch, and CodeDeploy takes charge of that orchestration. The Agent is needed only for EC2/on-premises deployments. A) Blue-Green by definition needs two environments (target groups). B) You must change the deployment controller to CODE_DEPLOY for CodeDeploy to operate the ECS service (the default is ECS rolling). D) appspec.json holds the information by which CodeDeploy connects ECS and the ALB. "Install the Agent on ECS" is always a wrong answer.

---

**Question 5.** During an In-Place deployment to an EC2 fleet of 100 instances, the CloudWatch Alarm `ErrorRate > 5%` fires. What setting is required for automatic rollback to work?

A) Include DEPLOYMENT_STOP_ON_ALARM in the DeploymentGroup's AutoRollbackConfiguration.Events
B) Create a Lambda function to stop manually when the alarm fires
C) Change the ASG's termination policy
D) Add alarm permissions to the S3 bucket policy

**Answer: A**

Explanation: CodeDeploy stops the deployment when a CloudWatch Alarm registered in AlarmConfiguration goes into the ALARM state, and if `DEPLOYMENT_STOP_ON_ALARM` is in AutoRollbackConfiguration.Events, it automatically rolls back to the previous revision. Both settings must be enabled for real automatic rollback. B) A manual Lambda is not automatic. C) The ASG termination policy is the priority for terminating instances and is unrelated to this question. D) S3 permissions are irrelevant. If "alarm during deployment → automatic rollback" appears on the exam, this combination of two settings is the answer.

---

**Question 6.** You configured the original ASG to be **terminated after 5 minutes** following a CodeDeploy Blue-Green deployment. What is the meaning of those 5 minutes?

A) The time for the new ASG to warm up
B) A safety net for fast rollback (the original ASG is alive, so just swapping back returns immediately)
C) The time to wait for the DNS TTL to expire
D) A cooldown for instance cost optimization

**Answer: B**

Explanation: The option of keeping the original ASG for a period after the swap completes in a Blue-Green deployment acts as a **fast rollback safety net**. If a problem is found within 5 minutes, you can return immediately without reprovisioning instances, simply by pointing the ALB listener rule back to the original target group. After 5 minutes the original instances are terminated, and from then on rolling back requires launching new instances. A) Warmup happens before the swap. C) The ALB handles DNS TTL on its own. D) Cooldown is an ASG scaling policy term and is unrelated. On the exam, the meaning of "Blue-Green termination wait time" is the answer.

---

**Question 7.** Which of the following is **not** a CodeDeploy deployment target?

A) Amazon EC2 Auto Scaling Group
B) AWS Lambda function
C) Amazon ECS service
D) Amazon RDS DB instance

**Answer: D**

Explanation: CodeDeploy's official deployment targets are only three: EC2/on-premises (including ASGs), Lambda, and ECS. RDS is a database service with a different notion of deployment, and schema migrations use separate tools like Flyway/Liquibase or RDS's own blue/green deployment feature (added in 2022, unrelated to CodeDeploy). A is a form of EC2. B and C are explicitly supported. When "not a CodeDeploy target" appears on the exam, a data service like RDS/DynamoDB/S3 almost always shows up as the wrong answer.

---
