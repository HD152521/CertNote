# Day 4 - ECS Blue/Green + CodeDeploy 트래픽 시프트

📅 날짜: Week 4 (Day 4)
🎯 주제: ECS 컨테이너 배포의 무중단 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ECS Service의 배포 컨트롤러 종류(ECS/CODE_DEPLOY/EXTERNAL) 차이
- CodeDeploy ECS Blue/Green의 두 Target Group 패턴
- Test Listener를 활용한 사전 검증
- 트래픽 시프트 중 Task Set 관리

---

## 🧩 사전 지식 (CS 기초)

- **ECS Service**: 원하는 Task 수를 유지하는 추상화. Auto Scaling 가능.
- **Task Set**: ECS Service 내부의 Task 그룹. Blue/Green에서 두 Task Set 사이 트래픽 분배.
- **Target Group**: ALB가 트래픽을 보내는 대상 그룹. 컨테이너 IP/포트 등록.
- **Health Check Grace Period**: 새 Task 시작 후 healthcheck 무시 기간.
- **Listener Rule**: ALB가 트래픽을 어떤 Target Group으로 보낼지 결정.

---

## 📖 이론 내용

### 1. ECS 배포 컨트롤러 3가지

| 컨트롤러 | 배포 방식 | 트래픽 시프트 |
|----------|-----------|----------------|
| **ECS** (기본) | Rolling update | ECS가 점진적 교체 |
| **CODE_DEPLOY** | Blue/Green | CodeDeploy + 두 Target Group |
| **EXTERNAL** | 사용자 정의 | App Mesh, Argo Rollouts 등 외부 |

> 💡 시험에서 "ECS Blue/Green" → CODE_DEPLOY 컨트롤러. "Rolling" → ECS 컨트롤러.

### 2. ECS Rolling Update (기본)

- `minimumHealthyPercent`: 배포 중 유지할 최소 Task 비율 (예: 50%)
- `maximumPercent`: 배포 중 최대 Task 비율 (예: 200%)
- 예: 100% min + 200% max → Surge 패턴 (새 Task 먼저, 구 Task 종료)
- 예: 50% + 100% → 구 Task 일부 종료 후 새 Task

설정만으로 가능. CodeDeploy 불필요. 자동 롤백은 ECS 자체 회로 차단기(circuit breaker)로 가능.

### 3. CodeDeploy ECS Blue/Green

**구성 요소:**
- ECS Service (deployment controller=CODE_DEPLOY)
- ALB Listener (Production Listener)
- Test Listener (선택, 다른 포트)
- Target Group Blue
- Target Group Green
- CodeDeploy Application + Deployment Group

**배포 흐름:**
1. 새 Task Definition 등록
2. CodeDeploy Deployment 시작
3. Green Task Set 생성 → Green Target Group 등록
4. Health check 통과
5. **(선택) Test Listener에 Green 노출** → `AfterAllowTestTraffic` Hook
6. Production Listener의 트래픽 시프트 (Canary/Linear/AllAtOnce)
7. `BeforeAllowTraffic` Hook → 시프트 → `AfterAllowTraffic` Hook
8. Termination wait time 후 Blue Task Set 종료

### 4. AppSpec ECS 상세

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

### 5. CodePipeline ECS Blue/Green Action

CodePipeline의 "Amazon ECS (Blue/Green)" 액션 입력:
- **TaskDefinitionTemplateArtifact**: `taskdef.json`
- **AppSpecTemplateArtifact**: `appspec.yaml`
- **Image1ArtifactName / Image1ContainerName**: 컨테이너 이미지 URI 치환
- 파이프라인이 자동으로 `<TASK_DEFINITION>` 플레이스홀더 치환

```json
// taskdef.json
{
  "family": "myapp",
  "containerDefinitions": [{
    "name": "web",
    "image": "<IMAGE1_NAME>",
    "portMappings": [{"containerPort": 80}],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/myapp",
        "awslogs-region": "ap-northeast-2",
        "awslogs-stream-prefix": "web"
      }
    }
  }]
}
```

### 6. ECS Deployment Circuit Breaker

ECS 자체의 자동 롤백 메커니즘 (CodeDeploy 없이도):

```bash
aws ecs update-service \
  --cluster prod \
  --service myapp \
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true}"
```

- 새 Task의 연속 실패 감지 시 이전 Task Definition으로 자동 롤백
- Rolling update에서만 동작 (Blue/Green은 CodeDeploy 자동 롤백 사용)

---

## 🧠 알아두면 좋은 심화 이론

### Fargate vs EC2 배포 차이

- Fargate: 인스턴스 관리 없음, Task 단위 과금, Spot 가능
- EC2 (Container Instance): ASG 관리 + Capacity Provider
- 배포 자체는 동일 — Task Definition 갱신

### Capacity Provider Strategy 변경

배포 중 Capacity Provider Strategy를 바꾸려면 ECS는 새 Task Set 생성 필요 → CodeDeploy Blue/Green이 자연스러움.

### App Mesh 통합 시 트래픽 시프트

App Mesh Virtual Node의 weight를 시프트 → 더 세밀한 제어 (요청별, 헤더별)
CodeDeploy 트래픽 시프트와 결합 가능.

### CodeDeploy ECS와 Service Discovery (Cloud Map)

- 기존 Service Discovery namespace에 두 Task Set이 동시 등록 가능
- Health check가 통과한 Task만 노출
- DNS 캐시 TTL이 짧아야 시프트 효과적

### 시험 빈출 — Task Definition Revision

- 새 Image 푸시 → 새 Task Definition Revision 등록
- ECS Service가 `LATEST` 자동 추적 안 함 (명시적 revision 지정)
- CodePipeline이 `<IMAGE1_NAME>` 치환으로 매번 새 revision 생성

### 관련 서비스 Cross-Reference

- **ECR** → Week 6 Day 1
- **ECS 자동 배포** → Week 6 Day 2
- **App Mesh / Service Mesh** → Week 11 Day 4
- **ECS Capacity Provider** → Week 6 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
ECS Blue/Green Deployment
==================================================

   ALB
   ├─ Production Listener (port 443)
   │  └─ Rule: forward to TG-Blue (current)
   └─ Test Listener (port 8443)
      └─ Rule: forward to TG-Green (new)

   ECS Service (CODE_DEPLOY controller)
   ├─ Task Set 1 (Blue, TD revision 41) — 100% production traffic
   └─ Task Set 2 (Green, TD revision 42) — 0% production, 100% test

   Step 1: CreateDeployment
     → CodeDeploy creates Task Set 2 (Green)
     → Registers tasks in TG-Green
     → Wait for healthy
     → AfterAllowTestTraffic Hook runs (smoke test via Test Listener)
     → BeforeAllowTraffic Hook
     → Listener Rule traffic shift:
          TG-Blue: 90%, TG-Green: 10%   (5min wait, monitor alarm)
          TG-Blue: 0%, TG-Green: 100%
     → AfterAllowTraffic Hook
   Step 2: TerminationWaitTime (default 1h)
     → Blue Task Set kept running for instant rollback
   Step 3: Cleanup
     → Blue Task Set terminated
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ ECS Service의 deployment controller가 CODE_DEPLOY일 때만 Blue/Green
2. ⭐ Blue/Green = 두 Target Group + (선택) Test Listener
3. ⭐ AppSpec ECS는 TaskDefinition + LoadBalancerInfo + Hooks
4. ⭐ CodePipeline ECS(Blue/Green) Action이 `<IMAGE1_NAME>` 치환
5. ⭐ Rolling update에는 Circuit Breaker로 자동 롤백, Blue/Green은 CodeDeploy 자동 롤백

---

## 💻 실제 예시 - ECS Blue/Green 전체 파이프라인

```bash
# 1) ECS Service (Blue/Green controller)
aws ecs create-service \
  --cluster prod \
  --service-name myapp \
  --task-definition myapp:1 \
  --desired-count 4 \
  --launch-type FARGATE \
  --deployment-controller type=CODE_DEPLOY \
  --load-balancers "targetGroupArn=arn:...TG-Blue,containerName=web,containerPort=80" \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-a,subnet-b],securityGroups=[sg],assignPublicIp=DISABLED}"

# 2) CodeDeploy Application
aws deploy create-application \
  --application-name MyApp-ECS \
  --compute-platform ECS

aws deploy create-deployment-group \
  --application-name MyApp-ECS \
  --deployment-group-name prod \
  --deployment-config-name CodeDeployDefault.ECSCanary10Percent5Minutes \
  --service-role-arn arn:aws:iam::...:role/CodeDeployECSRole \
  --ecs-services "clusterName=prod,serviceName=myapp" \
  --load-balancer-info "targetGroupPairInfoList=[{targetGroups=[{name=TG-Blue},{name=TG-Green}],prodTrafficRoute={listenerArns=[arn:...prodListener]},testTrafficRoute={listenerArns=[arn:...testListener]}}]" \
  --blue-green-deployment-configuration "terminateBlueInstancesOnDeploymentSuccess={action=TERMINATE,terminationWaitTimeInMinutes=60}" \
  --auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM" \
  --alarm-configuration "enabled=true,alarms=[{name=Prod5xx}]"
```

---

## 📝 연습 문제

**문제 1.** ECS Service의 Blue/Green 배포가 필요하다. deployment controller 설정은?

A) ECS
B) CODE_DEPLOY
C) EXTERNAL
D) FARGATE_SPOT

**정답: B**
해설: CODE_DEPLOY 컨트롤러만 Blue/Green 지원.

---

**문제 2.** ECS Rolling update에서 자동 롤백을 활성화하려면?

A) Circuit Breaker (`deploymentCircuitBreaker.rollback=true`)
B) CodeDeploy를 추가
C) Lambda로 모니터링
D) ECS Task 자동 종료

**정답: A**
해설: Rolling에는 Circuit Breaker, Blue/Green에는 CodeDeploy 자동 롤백.

---

**문제 3.** ECS Blue/Green의 Test Listener 용도는?

A) 비용 측정
B) 프로덕션 트래픽 시프트 전 새 Task Set에 사전 트래픽 노출 → AfterAllowTestTraffic Hook으로 검증
C) 로깅
D) 디버깅

**정답: B**
해설: Test Listener는 사전 검증의 핵심.

---

**문제 4.** CodePipeline ECS(Blue/Green) Action의 `<IMAGE1_NAME>` 플레이스홀더는?

A) Lambda 함수 이름
B) taskdef.json 안에서 ECR 이미지 URI로 자동 치환
C) Target Group 이름
D) ECS Service 이름

**정답: B**
해설: Pipeline이 ImageDefinitions 산출물의 이미지 URI를 치환.

---

**문제 5.** ECS Blue/Green Deployment Group에 필수가 아닌 것은?

A) 두 Target Group
B) Production Listener
C) Test Listener
D) CodeDeploy Service Role

**정답: C**
해설: Test Listener는 선택. 가장 자주 출제되는 트릭.

---

**문제 6.** Rolling update에서 minimumHealthyPercent=100, maximumPercent=200의 의미는?

A) 항상 100% Healthy + 일시적으로 200%까지 확장 → 새 Task 먼저 띄우고 구 Task 제거 (Surge)
B) 50%만 유지
C) 즉시 종료
D) 비용 절감

**정답: A**
해설: Surge 패턴. 100% 가용성 보장하지만 일시적 비용 2배.

---

**문제 7.** ECS Blue/Green 배포 후 즉시 롤백하려면?

A) 새 배포 시작
B) Termination Wait Time이 지나지 않았다면 CodeDeploy 콘솔/CLI에서 Stop Deployment + Rollback
C) Lambda 호출
D) ALB 수동 재구성

**정답: B**
해설: Wait time 동안 Blue Task Set이 살아 있어 즉시 롤백 가능.

---

## 📌 오늘의 요약

1. ECS Blue/Green = deployment controller CODE_DEPLOY + 두 Target Group
2. Test Listener로 사전 검증 가능 (AfterAllowTestTraffic Hook)
3. Rolling update + Circuit Breaker로 자동 롤백 (Blue/Green 없이도)
4. CodePipeline의 `<IMAGE1_NAME>` 치환으로 자동 이미지 갱신
5. Termination Wait Time 동안 즉시 롤백 가능 — 안전망
