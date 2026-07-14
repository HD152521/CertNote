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

## 📝 연습 문제

**문제 1.** EC2 Blue/Green 배포에서 롤백이 In-place보다 빠른 근본 이유는?

A) EC2 인스턴스가 더 빠르기 때문
B) Blue/Green은 구 인스턴스(Blue)가 Termination Wait Time 동안 살아있어, 롤백이 ALB 트래픽 전환만으로 즉시 가능하기 때문
C) CodeDeploy Agent가 더 최신 버전이기 때문
D) S3 아티팩트가 더 작기 때문

**정답: B**
해설: Blue/Green의 핵심 이점이 즉시 롤백이다. 구 인스턴스(Blue ASG)가 Termination Wait Time 동안 그대로 유지되므로, 문제 발생 시 ALB Target Group 가중치만 Blue로 되돌리면 수초 내 복원된다. In-place는 롤백을 위해 이전 버전 아티팩트를 다시 다운로드하고 설치하는 전체 배포 과정을 반복해야 한다.

---

**문제 2.** Lambda AppSpec에서 `BeforeAllowTraffic` Hook이 "Failed" 상태를 반환하면 어떻게 되는가?

A) 트래픽 시프트를 10%만 진행하고 멈춤
B) 트래픽 시프트 자체가 시작되지 않고 배포가 실패 처리됨, 자동 롤백 설정 시 구 버전 유지
C) Hook을 무시하고 배포를 계속 진행
D) 다음 Hook으로 넘어감

**정답: B**
해설: `BeforeAllowTraffic`은 트래픽 시프트 이전에 실행된다. 이 Hook이 Failed를 반환하면 Alias 가중치 변경이 일어나지 않는다 — 실사용자 트래픽은 여전히 구 버전을 받는 상태로 배포가 종료된다. 자동 롤백이 설정돼 있으면 배포 실패 이벤트로 롤백 처리된다.

---

**문제 3.** EC2 AppSpec에서 Hook 실행 순서로 올바른 것은?

A) BeforeInstall → ApplicationStop → Install → ApplicationStart → ValidateService
B) ApplicationStop → DownloadBundle → BeforeInstall → Install → AfterInstall → ApplicationStart → ValidateService
C) ApplicationStart → ValidateService → BeforeInstall → ApplicationStop
D) Install → BeforeInstall → ApplicationStop → ApplicationStart

**정답: B**
해설: EC2 AppSpec Hook 순서는 반드시 암기해야 하는 시험 빈출 항목이다. Stop → Download → BeforeInstall → Install → AfterInstall → Start → Validate. "내리고, 받고, 준비하고, 설치하고, 정리하고, 올리고, 확인한다"는 논리적 순서다. 첫 배포에는 ApplicationStop이 건너뛰어진다.

---

**문제 4.** Lambda Canary 배포에서 `CodeDeployDefault.LambdaCanary10Percent5Minutes`와 `LambdaLinear10PercentEvery1Minute`의 차이는?

A) Canary는 10% → 5분 후 90%, Linear는 1분마다 10%씩 증가해 10분에 100%
B) 동일하다
C) Canary는 EC2 전용, Linear는 Lambda 전용
D) Canary는 AllAtOnce와 동일

**정답: A**
해설: Canary는 2단계다. 10%를 5분 관찰한 뒤 문제없으면 남은 90%를 즉시 전환한다. Linear는 매 1분마다 10%씩 점진 증가해 10분에 100%에 도달한다. Canary가 적합한 경우: 빠른 Go/No-Go 판단이 가능할 때. Linear가 적합한 경우: 점진적 부하 증가를 관찰해야 할 때.

---

**문제 5.** On-Premises 서버에 CodeDeploy로 Blue/Green 배포를 설정하려 한다. 가능한가?

A) 가능하다, 동일한 방식으로 동작한다
B) 불가능하다. On-Premises는 CodeDeploy In-place만 지원한다
C) VPN 연결이 있으면 가능하다
D) CodeDeploy Agent 최신 버전을 설치하면 가능하다

**정답: B**
해설: On-Premises 인스턴스는 EC2처럼 CodeDeploy가 새 인스턴스를 자동 생성할 수 없다. Blue/Green은 새 환경을 프로비저닝하는 것이 전제인데, 온프레미스 서버는 AWS가 제어하지 않는다. 따라서 On-Premises는 In-place 배포만 지원한다. 이것은 시험에서 매우 자주 나오는 함정 문제다.

---

**문제 6.** EC2 Blue/Green의 Termination Wait Time을 1시간으로 설정한 의미는?

A) 배포 시작까지 1시간 기다린다
B) 트래픽 100% 시프트 완료 후 1시간 동안 구 인스턴스를 보존 — 이 기간에 롤백하면 즉시 구 버전으로 복원 가능
C) Hook 실행에 최대 1시간을 허용한다
D) 알람 모니터링을 1시간 동안 한다

**정답: B**
해설: Termination Wait Time은 "트래픽이 100% 새 버전으로 넘어간 후, 구 인스턴스(Blue)를 몇 시간 동안 살려둘 것인가"다. 이 기간 동안 문제가 발견되면 CodeDeploy 콘솔이나 CLI에서 Stop + Rollback을 실행하면 트래픽이 즉시 구 버전으로 복원된다. 1시간 후에는 구 인스턴스가 자동 종료된다(비용 절감).

---

**문제 7.** "배포 중 5xx가 1% 초과하면 자동 롤백"을 구현하는 가장 적절한 방법은?

A) PreTrafficHook에서 매 분마다 5xx를 체크하는 루프를 실행
B) CloudWatch Alarm(5xx > 1%) 생성 → Deployment Group의 alarm-configuration에 등록 → auto-rollback events에 DEPLOYMENT_STOP_ON_ALARM 포함
C) X-Ray를 활성화하면 자동으로 롤백된다
D) Lambda Destination으로 실패 이벤트를 처리

**정답: B**
해설: CodeDeploy의 자동 롤백은 CloudWatch Alarm과 직접 통합된다. ALB의 `HTTPCode_Target_5XX_Count` 메트릭으로 Alarm을 만들고, Deployment Group에 이 Alarm을 등록하면, 배포 중 Alarm이 ALARM 상태가 되는 순간 CodeDeploy가 자동으로 배포를 중단하고 롤백을 실행한다. PreTrafficHook(A)은 배포 시작 전 1회 검증이라 배포 중 지속 모니터링이 아니다.

---
