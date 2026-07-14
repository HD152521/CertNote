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

## 📝 연습 문제

**문제 1.** CodeDeploy 배포가 진행 중일 때 ASG가 스케일 아웃하면, 새로 추가된 EC2 인스턴스의 코드 버전은?

A) 구 버전으로 시작하고 다음 배포까지 유지
B) CodeDeploy가 자동으로 진행 중인 배포의 동일 revision을 새 인스턴스에 적용
C) 배포가 즉시 실패 처리됨
D) 새 인스턴스는 Deployment Group에서 제외됨

**정답: B**
해설: CodeDeploy와 ASG가 통합되면, ASG에 새 인스턴스가 추가될 때 CodeDeploy가 이를 감지해 현재 진행 중인 배포의 동일 revision을 자동 적용한다. 이 자동 동기화 덕분에 배포 중 스케일 아웃이 발생해도 클러스터 전체가 일관된 버전을 유지한다. 이것은 별도의 AutoScaling 배포 이벤트로 처리되어 콘솔에서 볼 수 있다.

---

**문제 2.** CodeDeploy Agent를 모든 EC2에 자동 설치하고 최신 버전으로 유지하는 가장 좋은 방법은?

A) 모든 AMI에 Agent를 미리 설치 (AMI Pipeline으로 주기 업데이트)
B) SSM State Manager Association: `AWS-ConfigureAWSPackage` + `AWSCodeDeployAgent` + 30일 주기 schedule
C) User Data 스크립트로 설치 (AMI 변경 없이 업데이트 불가)
D) Lambda로 매일 SSM Run Command 실행

**정답: B**
해설: SSM State Manager는 "desired state"를 정의하면 지속적으로 그 상태를 유지한다. 새 인스턴스에 자동 설치되고, 주기(30일)마다 최신 버전으로 업데이트된다. AMI 굽기(A)는 Agent 업데이트마다 새 AMI를 만들어야 해서 유지보수 부담이 크다. User Data(C)는 업데이트가 어렵다.

---

**문제 3.** EC2/On-Premises AppSpec Hook의 실행 순서로 올바른 것은?

A) BeforeInstall → Install → AfterInstall → ApplicationStop → ApplicationStart → ValidateService
B) ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService
C) ApplicationStart → BeforeInstall → Install → AfterInstall → ValidateService
D) Install → BeforeInstall → AfterInstall → ApplicationStop → ApplicationStart

**정답: B**
해설: EC2/On-Premises AppSpec Hook의 고정 순서는 ApplicationStop(기존 앱 종료) → DownloadBundle(자동) → BeforeInstall(설치 전 준비) → Install(자동 파일 복사) → AfterInstall(설치 후 설정) → ApplicationStart(새 앱 시작) → ValidateService(검증)이다. `ApplicationStop`은 이전 revision의 스크립트가 실행된다는 점이 중요하다.

---

**문제 4.** AppSpec Hook 스크립트의 `exit 0` 강제(항상 성공 반환)가 위험한 이유는?

A) 스크립트가 더 느려진다
B) CodeDeploy가 실패를 감지하지 못해 잘못된 버전이 배포된 상태로 자동 롤백이 일어나지 않는다
C) IAM 권한 오류를 숨긴다
D) S3 업로드 실패를 유발한다

**정답: B**
해설: CodeDeploy는 Hook 스크립트의 exit code로 성공/실패를 판단한다. 항상 0을 반환하면 헬스체크가 실패해도, 앱이 제대로 시작 안 해도 CodeDeploy는 배포가 성공했다고 처리한다. 자동 롤백 트리거(DEPLOYMENT_FAILURE)가 동작하지 않는다. 실패는 반드시 비0 exit code로 정직하게 보고해야 한다.

---

**문제 5.** On-Premises 서버에 CodeDeploy로 배포할 때 Blue/Green을 사용할 수 없는 이유는?

A) On-Premises Agent 버전이 낮아서
B) AWS가 On-Premises 인프라를 직접 제어해 새 인스턴스를 생성할 수 없기 때문
C) 네트워크 속도 제한 때문
D) IAM 권한 부족 때문

**정답: B**
해설: Blue/Green의 핵심은 "새 환경을 AWS가 자동 생성"하는 것이다. EC2/ASG는 AWS가 생성/종료를 제어할 수 있지만, 온프레미스 서버는 AWS의 제어 범위 밖이다. 따라서 In-place만 가능하다. 온프레미스에서 Blue/Green과 유사한 효과를 내려면 별도의 인프라 자동화(Terraform + 자체 로드밸런서)를 구축해야 한다.

---

**문제 6.** ASG의 `Launch` 프로세스가 Suspend된 상태에서 EC2 Blue/Green 배포를 시작하면 어떻게 되는가?

A) 배포가 더 빠르게 완료된다
B) 새 Green 인스턴스를 생성할 수 없어 Blue/Green 배포 자체가 진행되지 않는다
C) In-place로 자동 전환된다
D) CodeDeploy가 Suspend를 자동 해제한다

**정답: B**
해설: EC2 Blue/Green은 새 ASG(또는 인스턴스)를 생성하는 것이 핵심이다. ASG의 `Launch` 프로세스가 Suspend(일시 정지)되면 새 인스턴스 생성이 안 된다. 배포 트러블슈팅 시 ASG의 Suspended Processes 확인이 1순위 체크 항목이다. `Resume` 후 배포를 재시도해야 한다.

---

**문제 7.** Termination Wait Time(종료 대기 시간)을 2일로 설정했다. 이것이 의미하는 비용 영향은?

A) 배포 비용이 2배가 된다
B) 트래픽 시프트 완료 후 2일 동안 구 Blue 인스턴스가 그대로 실행되며 EC2 비용이 2일치 추가 발생한다
C) 비용 영향 없음
D) 새 Green 인스턴스 비용만 발생한다

**정답: B**
해설: Termination Wait Time 동안 Blue(구) 인스턴스와 Green(새) 인스턴스가 동시에 실행된다. 트래픽은 Green만 받지만 Blue EC2도 계속 과금된다. 2일이면 Blue 인스턴스 비용이 2일치 더 발생한다. 안전망과 비용의 트레이드오프 — 대부분 30분~1시간이 표준적인 균형점이다.

---
