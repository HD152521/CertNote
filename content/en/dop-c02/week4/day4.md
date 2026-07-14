# Day 4 - ECS Blue/Green + CodeDeploy Traffic Shift: The Logic of Two Target Groups

ECS has three deployment controllers. The default `ECS` controller performs Rolling Update. The `CODE_DEPLOY` controller performs Blue/Green. `EXTERNAL` is controlled by external systems like App Mesh or Argo Rollouts. On the exam, "ECS Blue/Green" always means the `CODE_DEPLOY` controller. Get this distinction wrong and all subsequent answers are wrong.

The physical implementation of ECS Blue/Green is "two Target Groups + ALB Listener." Current Task Set registers with Blue Target Group, new Task Set with Green Target Group. Traffic switches via ALB Listener weight changes. The concept is identical to Lambda Alias weighted routing, but the layer is one level deeper — there are additional components like ALB, Target Group, Task Set, and their relationships create the deployment flow.

Today we cover the complete ECS deployment process — controller selection → deployment flow → AppSpec Hooks → CodePipeline integration → IMAGE1_NAME substitution → Fargate/EC2 differences.

> 💡 **Day 4's core framework**: In ECS Blue/Green questions, if you don't understand "which component plays which role," all options look plausible. Production Listener controls traffic, Test Listener allows pre-validation, AppSpec Hook Lambda acts as gate at each phase. Distinguishing the roles of these three layers is the exam core.

---

## ECS Deployment Controller 3-Way Comparison

| Controller | Deployment Method | Traffic Control Layer | Auto-Rollback Mechanism |
|-----------|------------------|----------------------|------------------------|
| `ECS` (default) | Rolling Update | ECS internal (MinHealthy/MaxPercent) | Deployment Circuit Breaker |
| `CODE_DEPLOY` | Blue/Green | ALB Listener + two Target Groups | CodeDeploy Alarm-based |
| `EXTERNAL` | Custom | App Mesh, Argo Rollouts, etc. | Custom |

**Absolute rule**: Once you specify the controller when creating an ECS Service, **it cannot be changed later**. To switch from Rolling to Blue/Green, you must delete the Service and recreate it. If the exam asks "how to switch existing ECS Service from Rolling to Blue/Green," the answer is "Service must be recreated."

> 🔍 **Going deeper**: The `EXTERNAL` controller is a mode where AWS doesn't intervene in traffic control at all. Task Set creation/deletion is done directly by the user via API, and traffic is controlled by App Mesh virtual router or Argo Rollouts. Used for multi-cluster service mesh environments or advanced Canary (header-based, user-segment-based). DOP-C02 primarily tests the difference between `ECS` and `CODE_DEPLOY`.

---

## ECS Rolling Update: Circuit Breaker Auto-Rollback

Auto-rollback is possible even in ECS's own Rolling Update without CodeDeploy.

```bash
aws ecs update-service \
  --cluster prod \
  --service myapp \
  --task-definition myapp:43 \
  --deployment-configuration \
    "minimumHealthyPercent=100,maximumPercent=200,
     deploymentCircuitBreaker={enable=true,rollback=true}"
```

**Parameter meanings:**
- `minimumHealthyPercent=100`: During deployment, maintain minimum 100% Tasks Healthy (zero downtime)
- `maximumPercent=200`: Allow up to 200% increase in Task count (launch new Tasks first)
- `deploymentCircuitBreaker.enable=true`: If new Tasks fail Health Check consecutively, mark deployment failed
- `deploymentCircuitBreaker.rollback=true`: On deployment failure, auto-rollback to previous Task Definition

**Surge pattern (minimumHealthyPercent=100, maximumPercent=200):**
```
Initial: 4 Tasks (old version) [100%]
     ↓
Phase 1: 8 Tasks (4 old + 4 new) [200%] — wait for new Task Health Check
     ↓
Phase 2: 4 Tasks (new version) [100%] — terminate old Tasks
```

Zero downtime but temporary 2× EC2 (or Fargate) cost.

> 💡 **Related theory**: Circuit Breaker is a software pattern derived from electrical circuit breakers. Netflix's Hystrix popularized it in 2012, and Martin Fowler's three states (Closed/Open/Half-Open) are standard. ECS Deployment Circuit Breaker applies this pattern at the deployment level. "New version repeatedly fails (Open) → stop deployment → restore previous version (Closed)." Half-Open state corresponds to retrying after CloudWatch Alarm clears.

---

## ECS Blue/Green Deployment Flow: 7-Step Understanding

```
ECS Blue/Green with CodeDeploy
==================================================

Initial state:
ALB Production Listener (443) → TG-Blue (Task Set 1, current version) [100%]
ALB Test Listener (8443, optional) → TG-Green (disconnected)

Step 1: CreateDeployment (CodeDeploy creates Green Task Set)
  → Create Green Task Set based on new Task Definition
  → Tasks register with TG-Green
  → Wait for Health Check to pass (fail immediately if not)

Step 2: BeforeInstall Hook (optional)
  → Pre-preparation before Green Task Set creation

Step 3: AfterAllowTestTraffic Hook (after Test Listener connection)
  → ALB Test Listener (8443) → TG-Green connected
  → Hook Lambda directly tests new version on port 8443
  → Report success/failure

Step 4: BeforeAllowTraffic Hook
  → Final validation immediately before Production traffic shift

Step 5: Production traffic shift
  → ALB Production Listener: TG-Blue(90%) + TG-Green(10%)  [Canary]
  → Monitor alarms → TG-Green(100%)

Step 6: AfterAllowTraffic Hook
  → Integrated validation after shift completes

Step 7: Termination Wait Time (default 1 hour)
  → Preserve Blue Task Set → instant rollback possible within this period

Step 8: Blue Task Set termination
```

**Precise role of Test Listener:**
- Optional (Blue/Green works without it)
- If present, `AfterAllowTestTraffic` Hook becomes available
- Internal test traffic accesses new Task Set directly on port 8443
- Separate validation channel before Production exposure

> ⚠️ **Pitfall**: "Test Listener is mandatory for ECS Blue/Green" is wrong. Test Listener is optional. If present, `AfterAllowTestTraffic` Hook allows separate pre-production validation, but Blue/Green works normally without it. DOP-C02 frequently tests this distinction.

> 📚 **Case study**: In 2022, Lyft published a case: after switching from ECS Rolling Update to CODE_DEPLOY Blue/Green, deployment rollback time dropped from average 8 minutes to 45 seconds. The key was Termination Wait Time set to 1 hour preserving Blue Task Set, enabling one-click Stop+Rollback from CodeDeploy console for instant recovery. Rolling Update's rollback starts a new deployment with the previous Task Definition, taking time.

---

## AppSpec ECS Details: Hook Order and Role

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:ap-northeast-2:123456789:task-definition/myapp:42"
        LoadBalancerInfo:
          ContainerName: "web"          # Container name (must match taskdef containerDefinitions[].name)
          ContainerPort: 80             # Container port
        PlatformVersion: "LATEST"
        NetworkConfiguration:
          AwsvpcConfiguration:
            Subnets: ["subnet-a", "subnet-b"]
            SecurityGroups: ["sg-xyz"]
            AssignPublicIp: "DISABLED"
        CapacityProviderStrategy:
          - CapacityProvider: FARGATE_SPOT
            Weight: 1
Hooks:
  - BeforeInstall: "arn:aws:lambda:...:function:BeforeInstallHook"
  - AfterInstall: "arn:aws:lambda:...:function:AfterInstallHook"
  - AfterAllowTestTraffic: "arn:aws:lambda:...:function:TestHook"
  - BeforeAllowTraffic: "arn:aws:lambda:...:function:BeforeProdHook"
  - AfterAllowTraffic: "arn:aws:lambda:...:function:AfterProdHook"
```

**ECS AppSpec Hook characteristics:**
- Unlike EC2 AppSpec, Hooks specify **Lambda function ARN** directly (not script path)
- Each Hook Lambda must report result via `PutLifecycleEventHookExecutionStatus`
- Without report, deployment fails on Timeout (default 3600 seconds)

**Each Hook's role:**

| Hook | Timing | Common use |
|------|--------|------------|
| `BeforeInstall` | Before Green Task Set creation | Pre-preparation (rarely used) |
| `AfterInstall` | After Green Task Set created, before Test Listener connection | Task state validation |
| `AfterAllowTestTraffic` | After Test Listener → TG-Green connected | Integration test on port 8443 |
| `BeforeAllowTraffic` | Immediately before Production traffic shift | Final validation, cache warming |
| `AfterAllowTraffic` | After Production traffic shift completes | Smoke test, monitoring verification |

> 🔍 **Going deeper**: ECS AppSpec Hook Lambda serves the same role as EC2 AppSpec Shell scripts, but Lambda's timeout is capped at 15 minutes. Integration tests exceeding 15 minutes (e.g., database migration validation) use an async pattern: Hook Lambda triggers Step Functions and reports completion when it receives the signal. Alternatively, set Hook Timeout to 3600 seconds (1 hour) and have Lambda poll for external system completion.

---

## CodePipeline and ECS Blue/Green Integration: IMAGE1_NAME Substitution Flow

```
[Source: ECR Push event]
    │
    ▼
[CodeBuild]
  1. Build image and push to ECR
  2. Create artifacts:
     - taskdef.json (contains IMAGE1_NAME placeholder)
     - appspec.yaml
     - imagedefinitions.json
    │
    ▼
[ECS (Blue/Green) Deploy Action]
  - TaskDefinitionTemplateArtifact: taskdef.json
  - AppSpecTemplateArtifact: appspec.yaml
  - Image1ArtifactName: BuildArtifact
  - Image1ContainerName: web
    │
Pipeline automatically substitutes imageUri from imagedefinitions.json
into <IMAGE1_NAME> location in taskdef.json
    │
    ▼
Register new Task Definition Revision
    │
    ▼
Start CodeDeploy Blue/Green deployment
```

**taskdef.json (with placeholder):**
```json
{
  "family": "myapp",
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789:role/myappTaskRole",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [{
    "name": "web",
    "image": "<IMAGE1_NAME>",
    "portMappings": [{"containerPort": 80, "protocol": "tcp"}],
    "environment": [
      {"name": "ENV", "value": "prod"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/myapp",
        "awslogs-region": "ap-northeast-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

**imagedefinitions.json (created by CodeBuild):**
```json
[{
  "name": "web",
  "imageUri": "123456789.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:abc1234f"
}]
```

Pipeline substitutes `imageUri` from `imagedefinitions.json` into `<IMAGE1_NAME>` location in `taskdef.json`, registers new Task Definition Revision, then starts CodeDeploy deployment.

**Example CodeBuild buildspec for image build and artifact creation:**
```yaml
version: 0.2
phases:
  pre_build:
    commands:
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
  build:
    commands:
      - docker build -t $ECR_URI/myapp:$IMAGE_TAG .
  post_build:
    commands:
      - docker push $ECR_URI/myapp:$IMAGE_TAG
      - printf '[{"name":"web","imageUri":"%s"}]' "$ECR_URI/myapp:$IMAGE_TAG" > imagedefinitions.json
artifacts:
  files:
    - imagedefinitions.json
    - taskdef.json
    - appspec.yaml
```

> 🔍 **Going deeper**: ECS requires the `image` field in Task Definition to always have a concrete image URI (including tag). The `latest` tag doesn't cause ECS to auto-pull new images — for a new deployment to use a new image, a new Task Definition Revision must be registered. CodePipeline's `<IMAGE1_NAME>` substitution pattern automates this. Each build gets a unique git SHA-based tag reflected in the new Task Definition.

> ⚠️ **Pitfall**: The placeholder in `taskdef.json` must be exactly `<IMAGE1_NAME>` format (with angle brackets). Other formats (e.g., `${IMAGE_NAME}`, `IMAGE_PLACEHOLDER`) won't be recognized by the Pipeline Action, so substitution won't occur. If the exam asks "why IMAGE1_NAME wasn't substituted," checking the placeholder format is the first diagnostic step.

---

## ECS Canary/Linear: CODE_DEPLOY Controller Support

Unlike Lambda, ECS also supports Canary/Linear Deployment Configurations.

**ECS supported Deployment Configurations:**
```bash
# Canary pattern (ECS)
CodeDeployDefault.ECSCanary10Percent5Minutes
CodeDeployDefault.ECSCanary10Percent15Minutes

# Linear pattern (ECS)
CodeDeployDefault.ECSLinear10PercentEvery1Minutes
CodeDeployDefault.ECSLinear10PercentEvery3Minutes

# All at once
CodeDeployDefault.ECSAllAtOnce
```

ECS Canary behavior:
- Shift first 10% traffic to Green Target Group
- Monitor for 5 minutes (or 15 minutes)
- If no alarms, switch remaining 90%

```bash
aws deploy create-deployment-group \
  --application-name MyApp-ECS \
  --deployment-group-name prod \
  --deployment-config-name CodeDeployDefault.ECSCanary10Percent5Minutes \
  --service-role-arn arn:aws:iam::...:role/CodeDeployECSRole \
  --ecs-services "clusterName=prod,serviceName=myapp" \
  --load-balancer-info "targetGroupPairInfoList=[{
    targetGroups=[{name=TG-Blue},{name=TG-Green}],
    prodTrafficRoute={listenerArns=[arn:...prodListener]},
    testTrafficRoute={listenerArns=[arn:...testListener]}
  }]" \
  --blue-green-deployment-configuration \
    "terminateBlueInstancesOnDeploymentSuccess={action=TERMINATE,terminationWaitTimeInMinutes=60}" \
  --auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM" \
  --alarm-configuration "enabled=true,alarms=[{name=Prod5xx}]"
```

> 💡 **Related theory**: Traffic shift in ECS Blue/Green is implemented via ALB's **weighted Target Group routing**. ALB Listener Rule's `forward` action specifies weights for two Target Groups. CodeDeploy automatically updates these weights per Canary/Linear schedule. The concept is identical to Lambda Alias weighted routing, but the implementation layer is deeper: ALB → TG → Task Set.

---

## Fargate vs EC2 Container Instance: Deployment Perspective

| Item | Fargate | EC2 (Container Instance) |
|------|---------|-------------------------|
| Instance management | None (AWS-managed) | ASG + Capacity Provider required |
| Task isolation | Strong (separate VM-based) | Weak (shared host possible) |
| Spot support | FARGATE_SPOT | EC2 Spot Instance |
| Blue/Green support | CODE_DEPLOY identical | CODE_DEPLOY identical |
| Cold start | Longer (includes image pull) | Shorter (uses layer cache) |
| Deployment method | Task Definition Revision update | Task Definition Revision update |

From a deployment perspective, Fargate and EC2 Container Instance behave identically — in both cases, deployment is triggered by Task Definition Revision change, and CodeDeploy performs identical Blue/Green for both.

**FARGATE_SPOT + Blue/Green caution:**
```yaml
# AppSpec can specify Capacity Provider
CapacityProviderStrategy:
  - CapacityProvider: FARGATE_SPOT
    Weight: 3
  - CapacityProvider: FARGATE
    Weight: 1
    Base: 1  # Guarantee minimum 1 FARGATE
```

FARGATE_SPOT can experience Spot interruptions, so if Green Task Set shrinks suddenly from Spot interruption during deployment, it leads to Health Check failure. For critical deployments in Blue/Green, `Base: 1` guarantees minimum stable FARGATE Tasks.

> 📚 **Case study**: A team configured ECS Blue/Green with only FARGATE_SPOT for cost savings. During Canary 10% shift, a Spot interruption caused Green Task Set Health Check to fail, auto-rolling back deployment. The new version had no issues — the infrastructure did. Solution: guarantee minimum FARGATE Tasks with `Base: 1`, or reduce FARGATE_SPOT percentage for critical deployments.

---

## ECS Service Rollback Scenarios

| Situation | During Termination Wait | After Wait Completes |
|-----------|--------------------------|----------------------|
| Bug discovered after deployment | CodeDeploy Stop+Rollback (instant, uses Blue Task Set) | Re-deploy with previous Task Definition (takes time) |
| Canary alarm triggers | Auto-rollback (CodeDeploy) | No auto-rollback (already 100% switched) |
| No Blue Task Set | Rollback impossible (re-deploy needed) | — |

Discovering issues before Termination Wait ends enables instant rollback. This is why Wait Time should be set appropriately.

**Instant rollback CLI:**
```bash
# Stop deployment + rollback
aws deploy stop-deployment \
  --deployment-id d-XXXXXXXXX \
  --auto-rollback-enabled
```

> 🎯 **Scenario**: A team completed ECS Blue/Green deployment 30 minutes ago. Termination Wait Time is set to 60 minutes. Memory leaks discovered in new version. What's the fastest recovery now? Answer: **CodeDeploy Stop+Rollback** — Blue Task Set still alive, so ALB traffic can switch to Blue instantly. After 60 minutes, Blue Task Set would be terminated, requiring new CodeDeploy deployment with previous Task Definition number (takes minutes).

---

## Summary: ECS Deployment Decision Flow

```
ECS deployment strategy selection
====================
Need fast rollback?
    └─ YES → CODE_DEPLOY controller (Blue/Green)
              ├─ Canary: validate small traffic first
              ├─ Linear: gradual switch
              └─ AllAtOnce: dev/test environments only

Auto-rollback sufficient?
    └─ YES → ECS controller (Rolling) + Circuit Breaker
              ├─ Set minimumHealthyPercent/maximumPercent
              └─ deploymentCircuitBreaker.rollback=true

Need pre-validation channel?
    └─ YES → Test Listener (8443) + AfterAllowTestTraffic Hook
    └─ NO  → Blue/Green works without Test Listener

CODE_DEPLOY vs ECS controller decision:
    CODE_DEPLOY: instant rollback, traffic shift control, Hook validation
    ECS(Rolling): simplicity, no CodeDeploy needed, Circuit Breaker sufficient
```

---

## 📝 연습 문제

**문제 1.** ECS Service에서 Blue/Green 배포를 사용하려면 어떤 deployment controller를 설정해야 하는가?

A) `ECS`
B) `CODE_DEPLOY`
C) `EXTERNAL`
D) `FARGATE`

**정답: B**
해설: ECS Blue/Green은 반드시 `CODE_DEPLOY` 컨트롤러다. 기본 `ECS` 컨트롤러는 Rolling Update만 지원한다. `EXTERNAL`은 App Mesh 등 외부 시스템이 트래픽을 제어할 때 사용한다. `FARGATE`는 컨트롤러가 아니라 Launch Type이다. ECS Service 생성 시 컨트롤러를 지정하면 이후 변경이 불가능하다는 것도 기억해야 한다.

---

**문제 2.** ECS Rolling Update에서 자동 롤백을 구현하는 방법은?

A) CodeDeploy Application을 추가로 생성
B) `deploymentCircuitBreaker={enable=true,rollback=true}` 설정
C) Lambda 함수로 상태를 주기적으로 체크
D) CloudFormation Rollback 사용

**정답: B**
해설: ECS 자체의 Deployment Circuit Breaker가 Rolling Update의 자동 롤백 메커니즘이다. 새 Task가 연속적으로 Health Check를 실패하면 Circuit Breaker가 이를 감지하고 이전 Task Definition으로 자동 롤백한다. CodeDeploy(A)를 추가하면 Blue/Green으로 전환되어 컨트롤러가 달라진다. CloudFormation Rollback(D)는 인프라 프로비저닝 롤백이지 배포 롤백이 아니다.

---

**문제 3.** ECS Blue/Green 배포에서 Test Listener의 역할은?

A) 로드밸런서 비용 절감
B) 프로덕션 트래픽 노출 전 새 Task Set에 별도 포트로 테스트 트래픽을 노출해 사전 검증
C) Blue Task Set의 Health Check 수행
D) CodeDeploy에 배포 완료 보고

**정답: B**
해설: Test Listener는 선택 사항이지만, 있으면 `AfterAllowTestTraffic` Hook을 통해 프로덕션 트래픽을 받기 전에 새 Task Set을 별도로 검증할 수 있다. 예를 들어 내부 팀만 접근하는 8443 포트로 새 버전을 테스트한 후, 검증이 완료되면 프로덕션 트래픽 시프트를 진행한다. Test Listener 없이도 Blue/Green 배포는 정상 동작한다.

---

**문제 4.** CodePipeline의 ECS(Blue/Green) Action에서 `<IMAGE1_NAME>` 플레이스홀더의 역할은?

A) ECS 클러스터 이름을 지정
B) taskdef.json 내 컨테이너 이미지 URI 자리에 실제 ECR 이미지 URI로 자동 치환됨
C) Target Group 이름을 지정
D) CodeDeploy Application 이름을 지정

**정답: B**
해설: CodeBuild가 생성하는 `imagedefinitions.json`의 imageUri 값이 Pipeline을 통해 `taskdef.json`의 `<IMAGE1_NAME>` 자리에 치환된다. 이 자동 치환 덕분에 매 빌드마다 새로운 이미지 태그(보통 git SHA)가 Task Definition에 반영되어 새 Revision이 등록되고 Blue/Green 배포가 시작된다. 플레이스홀더 형식이 정확히 `<IMAGE1_NAME>`이어야 한다.

---

**문제 5.** ECS Blue/Green 배포에서 Termination Wait Time 60분 중 45분이 지났다. 새 버전에서 심각한 버그가 발견됐다. 가장 빠른 복원 방법은?

A) 이전 Task Definition으로 새 배포 시작 (15~20분 소요)
B) CodeDeploy 콘솔 또는 CLI에서 해당 배포를 Stop Deployment + Rollback → Blue Task Set으로 즉시 복원
C) ECS Service의 desired count를 0으로 줄인 후 복원
D) ALB Listener Rule을 수동으로 Blue Target Group으로 변경

**정답: B**
해설: Termination Wait Time 60분이 아직 끝나지 않았으므로 Blue Task Set이 살아있다. CodeDeploy의 Stop Deployment + Rollback은 ALB 트래픽을 Blue Target Group으로 즉시 전환하고 Green Task Set을 종료한다. 수십 초 내 복원이 가능하다. Wait Time이 지나 Blue Task Set이 이미 종료됐다면 B가 불가능하고 A(이전 Task Definition으로 재배포)가 필요하다.

---

**문제 6.** ECS Rolling Update에서 `minimumHealthyPercent=100, maximumPercent=200`의 동작은?

A) 절반씩 교체 (50% 구 버전 종료 후 50% 신 버전 시작)
B) 구 Task를 유지하며 새 Task를 먼저 띄우고(총 200%), 새 Task Health Check 통과 후 구 Task 종료 (Surge 패턴)
C) 모든 Task를 동시에 교체
D) 1개씩 순서대로 교체

**정답: B**
해설: `minimumHealthyPercent=100`은 배포 중에도 최소 100%의 Task가 Healthy해야 한다는 것이다. `maximumPercent=200`은 최대 200%까지 Task를 늘릴 수 있다. 결과적으로 "새 Task를 모두 띄우고(200%), 검증 후 구 Task를 제거(100%로 복귀)"하는 Surge 패턴이 된다. 다운타임 없이 배포되지만 일시적으로 EC2/Fargate 비용이 2배 발생한다.

---

**문제 7.** ECS Blue/Green Deployment Group 설정에서 필수가 아닌 것은?

A) 두 Target Group (Blue, Green)
B) Production Listener
C) Test Listener
D) CodeDeploy Service Role

**정답: C**
해설: Test Listener는 선택 사항이다. Production Listener(두 Target Group 사이 트래픽을 전환)와 두 Target Group은 Blue/Green의 핵심 구성 요소라 필수다. CodeDeploy Service Role은 ECS API, ALB API 호출 권한을 위해 필수다. Test Listener는 추가 포트로 새 버전을 사전 검증하는 옵션 기능이다. 이 구분이 시험에서 반복적으로 나온다.

---
