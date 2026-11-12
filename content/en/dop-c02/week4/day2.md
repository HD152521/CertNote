# Day 2 - EC2/On-Prem Deployment + Auto Scaling Integration: The Intersection of Instance Lifecycle and Deployment

Auto Scaling automatically adds and removes instances based on traffic. CodeDeploy deploys code to instances. The complexity that emerges when these two systems operate simultaneously is the "scale-out during deployment" scenario. If the old version gets installed when a new instance comes up, the cluster ends up in a mixed state. CodeDeploy solves this problem with automatic synchronization.

On-Premises deployment is a different dimension of the problem. To deploy code to servers that AWS doesn't control requires an agent, and for that agent to access AWS APIs requires credentials. How safely and automatically you manage these credentials is the design crux.

Today we connect the entire lifecycle of EC2 deployment — from Agent installation through AppSpec Hook design, ASG integration, Auto Scaling Rolling updates, Circuit Breaker, and On-Premises registration — into one cohesive flow.

> 💡 **Day 2's core decision framework**: When "auto-rollback" appears in CodeDeploy questions, you must distinguish between two layers. (1) EC2 Rolling Update's Deployment Group Circuit Breaker — failure detection during the deployment phase. (2) CloudWatch Alarm-based auto-rollback — problem detection during operations after deployment. These two have different trigger times.

---

## CodeDeploy Complete Architecture: Component Relationships

```
[CodePipeline / AWS CLI / Console]
        │
        ▼
[CodeDeploy Application]
  │
  ├─ [Deployment Group]
  │     ├─ EC2 instances (tag-based or ASG)
  │     ├─ On-Premises instances (registered IAM credentials)
  │     ├─ Deployment Configuration (deployment speed)
  │     ├─ Auto Rollback Configuration (alarm-based)
  │     └─ Load Balancer (traffic blocking/restoration)
  │
  └─ [Deployment]
        ├─ Revision (deployment bundle from S3 or GitHub)
        └─ AppSpec (deployment procedure + Hook scripts)
```

The CodeDeploy Agent runs on each EC2/On-Prem instance and polls the CodeDeploy API waiting for deployment commands. When a new deployment command arrives, it downloads the bundle from S3 and executes Hook scripts in order according to AppSpec.

> 🔍 **Going deeper**: CodeDeploy Agent's polling model is Pull-based, not Push-based. The instance periodically requests the CodeDeploy endpoint to check if new jobs are available. The advantage of this model is that instances even behind a firewall (including On-Premises) can work with just outbound connectivity. EC2 within VPC accesses the endpoint via VPC Endpoint (`com.amazonaws.region.codedeploy`) or NAT Gateway.

---

## CodeDeploy Agent Installation and Management

To use CodeDeploy on EC2, each instance must have the Agent installed. The Agent polls the CodeDeploy API and waits for new deployment commands.

**Method 1: User Data (simple but hard to update)**
```bash
#!/bin/bash
yum update -y
yum install -y ruby wget
cd /tmp
wget https://aws-codedeploy-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/install
chmod +x ./install
./install auto
systemctl enable codedeploy-agent
systemctl start codedeploy-agent
```

**Method 2: SSM Distributor + State Manager (recommended)**
```bash
# State Manager Association for automatic installation + periodic updates
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets "Key=tag:CodeDeploy,Values=enabled" \
  --parameters "action=Install,name=AWSCodeDeployAgent" \
  --schedule-expression "rate(30 days)"
```

Advantages of SSM Distributor approach:
- When new instances launch with tag (`CodeDeploy=enabled`), automatically install
- Every 30 days, automatically update to latest version
- Tag-based targeting controls deployment targets
- Agent installation status can be monitored in SSM Compliance view

**EC2 IAM Instance Profile required permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:Get*", "s3:List*"],
    "Resource": [
      "arn:aws:s3:::aws-codedeploy-ap-northeast-2/*",
      "arn:aws:s3:::my-deploy-bucket/*"
    ]
  }]
}
```

This is the permission for the Agent to download deployment bundles (zip) from S3. Without this permission, you'll see S3 AccessDenied errors in each instance log, and the entire deployment will fail.

> 💡 **Related theory**: SSM Distributor + State Manager is the **Configuration Drift Prevention** pattern. When an instance deviates from the desired state (Agent installed), State Manager automatically reapplies it. This is identical to Chef/Puppet's converge concept and Kubernetes's control loop pattern. It embodies the "declare state and let the system maintain it" philosophy of declarative management. Combined with EC2 Image Builder, you can use a hybrid strategy: include Agent in AMI builds and maintain only the version with State Manager.

---

## AppSpec Hook Execution Order: EC2/On-Premises

AppSpec Hooks execute user scripts at each deployment stage. The order is fixed, and each Hook has a different purpose.

```
EC2/On-Premises AppSpec Hook Execution Order
================================================

[Deployment Lifecycle Events]

ApplicationStop         ← Terminate existing app (previous revision's script)
    │
DownloadBundle          ← Download bundle from S3 (automatic, no Hook)
    │
BeforeInstall           ← Prepare before install (create directories, backup previous)
    │
Install                 ← Copy files (automatic, no Hook)
    │
AfterInstall            ← Configure after install (create config files, set permissions)
    │
ApplicationStart        ← Start new app (systemctl start)
    │
ValidateService         ← Validate service is working (health check curl)
    │
    ▼
[Deployment succeeds] or [auto-rollback]
```

**AppSpec file example:**
```yaml
version: 0.0
os: linux
files:
  - source: /app
    destination: /opt/myapp
permissions:
  - object: /opt/myapp
    owner: appuser
    group: appgroup
    mode: "755"
hooks:
  ApplicationStop:
    - location: scripts/stop_app.sh
      timeout: 30
      runas: root
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 60
  AfterInstall:
    - location: scripts/after_install.sh
      timeout: 120
  ApplicationStart:
    - location: scripts/start_app.sh
      timeout: 60
  ValidateService:
    - location: scripts/validate.sh
      timeout: 120
```

> ⚠️ **Pitfall**: `ApplicationStop` executes the script defined in the previous revision's appspec.yml. On the first deployment, there is no previous revision, so `ApplicationStop` doesn't run. From the second deployment onward, the previous revision's stop script executes. "ApplicationStop doesn't run on first deployment" is a frequent exam pitfall question.

> 📚 **Case study**: A team added an existing app termination script (`ApplicationStop`) to a new revision deployment, but the stop script didn't run in that deployment. The reason: `ApplicationStop` references the previous revision's appspec, not the current deployment's appspec. The new stop script runs in the next deployment. Not understanding this behavior wastes debugging time.

---

## AppSpec Hook Script: Robustness Principles

```bash
#!/bin/bash
set -euo pipefail   # e: exit on error, u: undefined variable error, o pipefail: propagate pipe error

# Standardize logging
exec > >(tee -a /var/log/codedeploy-hook.log) 2>&1
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ApplicationStop started"

# Idempotency pattern: pass even if already stopped
if systemctl is-active --quiet myapp; then
    systemctl stop myapp
    echo "App stopped normally"
else
    echo "App already stopped — skipping"
fi

# ValidateService example: retry logic
for i in $(seq 1 30); do
    if curl -fs http://localhost:8080/health; then
        echo "Health check passed (attempt ${i})"
        exit 0
    fi
    sleep 2
done
echo "Health check failed within 60 seconds"
exit 1   # non-zero exit code = report failure to CodeDeploy → auto-rollback
```

**Script design principles:**
1. **Idempotent**: Executing the same script multiple times produces the same result
2. **Precise exit code**: 0 is success, non-zero is failure — CodeDeploy makes auto-rollback decision based on this
3. **Logging**: Record to `/var/log/codedeploy-hook.log` with timestamp
4. **Timeout compliance**: Complete faster than AppSpec `timeout` or exit 1

> ⚠️ **Pitfall**: The "force exit 0 to hide failures" pattern is the worst anti-pattern. If a script always returns success code, CodeDeploy doesn't detect failure, and the wrong version stays deployed without auto-rollback. Script failures must always be reported with non-zero exit code.

> 🔍 **Going deeper**: `set -euo pipefail` is the baseline for script safety. `-e` immediately terminates the script if a command fails, `-u` treats undefined variable references as errors, and `pipefail` propagates failures from the middle of pipelines. Without it, if `cmd1 | cmd2` has cmd1 fail but cmd2 succeed, the script might return 0. In CodeDeploy Hook scripts, this setting is mandatory, not optional.

---

## ASG and CodeDeploy Integration: Automatic Synchronization Mechanism

When you create a Deployment Group with an ASG as the target, CodeDeploy **continuously monitors** that ASG.

```bash
aws deploy create-deployment-group \
  --application-name MyApp \
  --deployment-group-name prod \
  --deployment-config-name CodeDeployDefault.OneAtATime \
  --service-role-arn arn:aws:iam::...:role/CodeDeployServiceRole \
  --auto-scaling-groups myapp-asg \
  --load-balancer-info "elbInfoList=[{name=myapp-tg}]" \
  --auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE"
```

**Scale-out handling flow during deployment:**
```
Deployment in progress (e.g., OneAtATime with 3 of 6 completed)
    │
ASG Scale-out event → new EC2 instance launches
    │
CodeDeploy Agent registers with Deployment Group after startup
    │
CodeDeploy detects new instance → automatically applies same revision from ongoing deployment
    │
New instance = new version InService
```

**Deployment Configuration types:**

| Configuration | Behavior | Characteristics |
|--------------|----------|-----------------|
| `OneAtATime` | Replace 1 at a time sequentially | Safest, slowest |
| `HalfAtATime` | Replace in halves | Balanced |
| `AllAtOnce` | Replace all simultaneously | Fastest, downtime risk |
| Custom | Define ratio directly | E.g., 25% × 4 rounds |

> ⚠️ **Pitfall**: "If you scale out during deployment, new instances get the old version installed" — this is a wrong answer. CodeDeploy automatically detects when new instances are added to the ASG and applies the currently-running (or most recently successful) deployment. However, this is handled as a separate deployment event called **AutoScaling deployment**. You might see two deployments (manual deployment + AutoScaling deployment) simultaneously in the console.

---

## ASG Rolling Update and Deployment Strategy: MinHealthyPercent and MaxBatchSize

**Core parameters:**
- `MinHealthyPercent`: Minimum percentage of healthy instances to maintain during deployment
- `MaxBatchSize` (or `MaxUnavailable`): Maximum number of instances that can be replaced at once

```
10 instances, MinHealthyPercent=70%, MaxBatchSize=30% configured

Phase 1: Replace 3 (30%) → maintain 7 (70%) healthy
Phase 2: Replace 3 → maintain 7 healthy
Phase 3: Replace 3 of remaining 4 → maintain 7 healthy
Phase 4: Replace last 1
```

**Surge pattern (replacement without downtime):**
```bash
aws ecs update-service \
  --deployment-configuration \
    "minimumHealthyPercent=100,maximumPercent=200"
```

`maximumPercent=200` + `minimumHealthyPercent=100` launches all new Tasks first (total 200%), validates, then removes old Tasks. Instance count temporarily doubles but there's zero downtime.

> 💡 **Related theory**: The combination of MinHealthyPercent and MaxBatchSize directly controls **Rolling Upgrade Trade-offs**. Higher MinHealthyPercent maintains high availability during deployment but slows replacement speed (limited batch size). Lower value is faster but reduces capacity. This setting connects to service SLO — unpredictable traffic makes MinHealthyPercent=100 the safe choice.

---

## Circuit Breaker: Two Layers of Auto-Rollback

CodeDeploy's auto-rollback can trigger at two different points in time.

**Layer 1: Deployment phase failure (immediate)**
```bash
--auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE"
```
If Hook scripts return non-zero exit code or deployment times out, rollback immediately.

**Layer 2: CloudWatch Alarm-based (after deployment)**
```bash
--auto-rollback-configuration \
  "enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM" \
--alarm-configuration \
  "enabled=true,alarms=[{name=Prod5xx},{name=HighLatencyAlarm}]"
```
If deployment succeeded but alarms trigger during operations, auto-rollback to previous revision.

```
Deployment flow and Circuit Breaker trigger points
=============================================

[Deployment starts]
    │
[Execute Hooks] ──failure(exit≠0)──▶ [Layer 1 Rollback] (immediate)
    │ success
[Deployment complete] ─────────────▶ [Deployment succeeds]
    │
[Operations monitoring period]
    │
[CloudWatch Alarm triggers] ────────▶ [Layer 2 Rollback] (alarmRollback)
    │ no alarm
[Fully stable]
```

> 📚 **Case study**: In 2020, an e-commerce team saw error rate on their shopping cart API jump from 2% to 15% one hour after deployment. The cause was memory leaks in the deployed code. The `ValidateService` Hook showed normal, but symptoms appeared when traffic spiked. They subsequently connected a `5xx error rate > 5%` CloudWatch Alarm to the Deployment Group, enabling auto-rollback during the 30-minute monitoring period after deployment. A case that drove home the need for Layer 2 Circuit Breaker.

> 🎯 **Scenario**: A team reported "deployments succeed but we frequently have outages within 30 minutes." Should you strengthen `ValidateService` Hook or add CloudWatch Alarm-based auto-rollback? The answer is **both, but there's an order**. First strengthen `ValidateService` to catch issues at deployment time. Issues that appear after time passes (memory leaks, concurrency issues) get caught with CloudWatch Alarm-based rollback. The two mechanisms catch failures at different times.

---

## On-Premises Instance Registration: IAM User vs STS Session

**IAM User approach (simple but weaker security):**
```bash
aws deploy register-on-premises-instance \
  --instance-name my-onprem-server-01 \
  --iam-user-arn arn:aws:iam::123456789:user/codedeploy-onprem-01 \
  --tags Key=Environment,Value=prod

# Result: Long-term IAM credentials stored in plaintext in
# /etc/codedeploy-agent/conf/codedeploy.onpremises.yml
```

Problem with this approach: Long-term credentials are stored in plaintext on server disk. If the server is compromised, credentials are also leaked.

**IAM Role + STS AssumeRole approach (recommended):**
```bash
# 1. Create On-Prem IAM Role (Trust Policy: On-Prem servers can assume)
# 2. Server periodically runs STS AssumeRole → issues temporary credentials
# 3. Update Agent config (renew before expiration)

aws sts assume-role \
  --role-arn arn:aws:iam::123456789:role/CodeDeployOnPremRole \
  --role-session-name onprem-deploy-session \
  --duration-seconds 3600
# → AccessKeyId, SecretAccessKey, SessionToken (valid 1 hour)
```

**On-Premises limitations:**
- Blue/Green deployment **not supported** — In-place only
- AWS cannot provision new instances on On-Premises
- Rollback is via re-deploying previous revision

> 🔍 **Going deeper**: On-Premises instance registration is the **hybrid cloud** pattern. Devices/servers outside AWS need credentials to access AWS APIs. The security best practice is using temporary credentials (STS) instead of long-term credentials (IAM User Access Key). AWS Systems Manager Hybrid Activations solve the same problem — install SSM Agent on On-Premises and you get all SSM capabilities (Session Manager, Patch Manager, State Manager) on-premises too. Combined, you can divide roles: CodeDeploy handles deployment, SSM handles the rest of operations.

---

## ASG Lifecycle Hook: Block Traffic Before Deployment Completes

ASG Lifecycle Hook allows you to insert custom actions before an instance enters InService state.

```
EC2_INSTANCE_LAUNCHING event
    │
[Wait: Lifecycle Hook puts instance in "pending" state]
    │ (CodeDeploy completes deployment)
CompleteLifecycleAction(CONTINUE) called
    │
Instance enters InService → registers with ELB → starts receiving traffic
```

Prevents instances from being registered with ELB and receiving traffic (old version or uninstalled state) before deployment completes. CodeDeploy natively supports this Lifecycle Hook pattern, and when you configure ELB/ALB in the Deployment Group, it automatically removes instances from ELB during deployment and re-registers them after completion.

---

## Deployment Group Tag Matching: Sophisticated Target Control

| Setting | Behavior | Example |
|---------|----------|---------|
| AND (multiple tags in single group) | Only instances matching all tags | `Env=prod AND Tier=web` |
| OR (multiple tag groups) | Include if any tag matches | `Env=prod OR Env=staging` |

```bash
# AND example: only web tier in prod environment
aws deploy create-deployment-group \
  --ec2-tag-filters \
    "Key=Environment,Value=prod,Type=KEY_AND_VALUE" \
    "Key=Tier,Value=web,Type=KEY_AND_VALUE"

# OR example: match if either prod or staging
aws deploy create-deployment-group \
  --ec2-tag-set-list \
    "[{Key=Environment,Value=prod,Type=KEY_AND_VALUE}]" \
    "[{Key=Environment,Value=staging,Type=KEY_AND_VALUE}]"
```

> 💡 **Related theory**: Tag-based Deployment Group is **Infrastructure as Code's declarative targeting**. When you declare "which instances to deploy to" via tags, the Group dynamically manages them regardless of whether new instances appear or existing ones disappear. Conversely, fixing targets by IP or instance ID requires manual updates whenever instances are replaced. Tag-based targeting aligns with IaC principles.

---

## GreenFleetProvisioningOption: Source of Blue/Green Instances

In EC2 Blue/Green, how to create Green instances:

| Option | Behavior | When to use |
|--------|----------|-----------|
| `COPY_AUTO_SCALING_GROUP` | Copy existing ASG, auto-create new ASG | Standard pattern (almost always) |
| `DISCOVER_EXISTING` | Use already-existing instances as Green | Special pre-provisioning scenarios |

`COPY_AUTO_SCALING_GROUP` is the standard in almost all cases. It copies the current ASG's Launch Template/Configuration to create a new ASG with identical instance type, network, and tags.

**Termination Wait Time (termination waiting period):**
Time to wait after traffic shift completes before terminating Blue instances.
- Default: 1 hour
- During wait: Both Blue + Green run → 2× EC2 cost
- Purpose: If issues found, immediate rollback possible (Blue still alive)
- Trade-off: Safety net ↔ Cost

> ⚠️ **Pitfall**: Setting Termination Wait Time too long significantly increases costs. If set to 2 days, Blue instances stay alive for 2 days, adding 2 days of EC2 charges. Most teams find 30 minutes to 1 hour is the balance point. If you see "set Termination Wait Time to 7 days" on the exam, it's asking about cost issues.

---

## Summary: EC2 Deployment Decision Flow

```
Is the deployment target EC2?
    ├─ Agent installation → Automatic with SSM State Manager
    ├─ Target method → Tag-based (IaC principle) or ASG
    ├─ Deployment speed → OneAtATime / HalfAtATime / Custom
    ├─ Auto-rollback → Layer 1 (Hook failure) + Layer 2 (CW Alarm)
    └─ ASG integration → Scale-out during deployment = automatic synchronization

Is it On-Premises?
    ├─ Blue/Green impossible → In-place only
    ├─ Credentials → STS temporary credentials recommended
    └─ EC2 deployment with same AppSpec Hook structure
```

---

## 📝 Practice Questions

**Question 1.** If an ASG scales out while a CodeDeploy deployment is in progress, which code version do the newly added EC2 instances get?

A) They start with the old version and keep it until the next deployment
B) CodeDeploy automatically applies the same revision as the in-progress deployment to the new instances
C) The deployment is immediately marked as failed
D) The new instances are excluded from the deployment group

**Answer: B**
Explanation: When CodeDeploy is integrated with the ASG, CodeDeploy detects when a new instance is added to the ASG and automatically applies the same revision as the in-progress deployment. Thanks to this automatic synchronization, the whole cluster keeps a consistent version even if a scale-out occurs during a deployment. This is handled as a separate AutoScaling deployment event and can be viewed in the console.

---

**Question 2.** What is the best way to automatically install the CodeDeploy agent on all EC2 instances and keep it up to date?

A) Pre-install the agent in every AMI (update periodically with an AMI pipeline)
B) SSM State Manager association: `AWS-ConfigureAWSPackage` + `AWSCodeDeployAgent` + a 30-day schedule
C) Install it with a user data script (cannot be updated without changing the AMI)
D) Run SSM Run Command daily with Lambda

**Answer: B**
Explanation: When you define a desired state, SSM State Manager continuously maintains that state. It is installed automatically on new instances and updated to the latest version every cycle (30 days). Baking AMIs (A) requires creating a new AMI for every agent update, so the maintenance burden is high. User data (C) makes updates difficult.

---

**Question 3.** What is the correct execution order of EC2/on-premises AppSpec hooks?

A) BeforeInstall → Install → AfterInstall → ApplicationStop → ApplicationStart → ValidateService
B) ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService
C) ApplicationStart → BeforeInstall → Install → AfterInstall → ValidateService
D) Install → BeforeInstall → AfterInstall → ApplicationStop → ApplicationStart

**Answer: B**
Explanation: The fixed order of EC2/on-premises AppSpec hooks is ApplicationStop (stop the existing app) → DownloadBundle (automatic) → BeforeInstall (pre-install preparation) → Install (automatic file copy) → AfterInstall (post-install configuration) → ApplicationStart (start the new app) → ValidateService (validation). It is important that for `ApplicationStop`, the script from the previous revision is executed.

---

**Question 4.** Why is forcing `exit 0` (always returning success) in an AppSpec hook script dangerous?

A) The script becomes slower
B) CodeDeploy cannot detect failures, so the wrong version stays deployed and no automatic rollback occurs
C) It hides IAM permission errors
D) It causes S3 upload failures

**Answer: B**
Explanation: CodeDeploy determines success or failure from the exit code of the hook script. If it always returns 0, CodeDeploy treats the deployment as successful even if the health check fails or the app does not start properly. The automatic rollback trigger (DEPLOYMENT_FAILURE) does not fire. Failures must always be honestly reported with a non-zero exit code.

---

**Question 5.** Why can Blue/Green not be used when deploying to on-premises servers with CodeDeploy?

A) Because the on-premises agent version is too old
B) Because AWS does not directly control on-premises infrastructure and cannot create new instances
C) Because of network speed limits
D) Because of insufficient IAM permissions

**Answer: B**
Explanation: The core of Blue/Green is that "AWS automatically creates the new environment." AWS can control the creation and termination of EC2/ASG, but on-premises servers are outside AWS control. Therefore only in-place is possible. To get an effect similar to Blue/Green on-premises, you must build separate infrastructure automation (Terraform + your own load balancer).

---

**Question 6.** What happens if you start an EC2 Blue/Green deployment while the ASG `Launch` process is suspended?

A) The deployment completes faster
B) New Green instances cannot be created, so the Blue/Green deployment itself does not proceed
C) It automatically switches to in-place
D) CodeDeploy automatically resumes the suspended process

**Answer: B**
Explanation: The core of EC2 Blue/Green is creating a new ASG (or instances). If the ASG `Launch` process is suspended, new instances cannot be created. When troubleshooting a deployment, checking the ASG suspended processes is the first item on the list. You must retry the deployment after `Resume`.

---

**Question 7.** You set the termination wait time to 2 days. What is the cost impact?

A) The deployment cost doubles
B) The old Blue instances keep running for 2 days after the traffic shift completes, incurring 2 additional days of EC2 cost
C) There is no cost impact
D) Only the cost of the new Green instances is incurred

**Answer: B**
Explanation: During the termination wait time, the Blue (old) instances and Green (new) instances run at the same time. Traffic goes only to Green, but the Blue EC2 instances are still billed. With 2 days, 2 extra days of Blue instance cost is incurred. It is a trade-off between the safety net and cost — 30 minutes to 1 hour is the typical balance point.

---
