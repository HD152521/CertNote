# Day 4 - ECS Blue/Green + CodeDeploy 트래픽 시프트: 두 Target Group의 논리

ECS의 배포 컨트롤러는 세 종류다. 기본 `ECS` 컨트롤러는 Rolling Update를 한다. `CODE_DEPLOY` 컨트롤러는 Blue/Green을 한다. `EXTERNAL`은 App Mesh나 Argo Rollouts 같은 외부 시스템이 제어한다. 시험에서 "ECS Blue/Green"이 나오면 반드시 `CODE_DEPLOY` 컨트롤러다. 이 구분을 틀리면 다음 보기 전체가 틀린다.

ECS Blue/Green의 물리적 구현은 "두 Target Group + ALB Listener"다. Blue Target Group에 현재 Task Set, Green Target Group에 새 Task Set이 등록된다. ALB Listener의 가중치 변경으로 트래픽이 전환된다. Lambda Alias의 가중치 시프트와 개념은 같지만, 레이어가 한 단계 더 깊다 — ALB, Target Group, Task Set이라는 추가 구성 요소들이 있고, 이들의 관계가 배포의 흐름을 만든다.

오늘은 컨트롤러 선택 → 배포 흐름 → AppSpec Hook → CodePipeline 통합 → IMAGE1_NAME 치환 → Fargate/EC2 차이까지 ECS 배포의 전 과정을 다룬다.

> 💡 **Day 4의 핵심 프레임**: ECS Blue/Green 문제에서 "어떤 구성 요소가 어떤 역할을 하는가"를 모르면 보기가 모두 그럴듯해 보인다. Production Listener가 트래픽을 제어하고, Test Listener가 사전 검증을 허용하고, AppSpec Hook Lambda가 각 단계에서 게이트 역할을 한다. 이 세 레이어의 역할 구분이 시험의 핵심이다.

---

## ECS 배포 컨트롤러 3종 비교

| 컨트롤러 | 배포 방식 | 트래픽 제어 레이어 | 자동 롤백 메커니즘 |
|----------|-----------|-----------------|-----------------|
| `ECS` (기본) | Rolling Update | ECS 내부 (MinHealthy/MaxPercent) | Deployment Circuit Breaker |
| `CODE_DEPLOY` | Blue/Green | ALB Listener + 두 Target Group | CodeDeploy Alarm 기반 |
| `EXTERNAL` | 사용자 정의 | App Mesh, Argo Rollouts 등 | 사용자 정의 |

**절대 규칙**: ECS Service 생성 시 컨트롤러를 지정하면 **이후 변경 불가능**. Rolling → Blue/Green으로 바꾸려면 Service를 삭제하고 재생성해야 한다. 시험에서 "기존 ECS Service를 Rolling에서 Blue/Green으로 전환하는 방법"이 나오면 "Service 재생성 필요"가 정답이다.

> 🔍 **더 깊이**: `EXTERNAL` 컨트롤러는 AWS가 트래픽 제어에 전혀 개입하지 않는 모드다. Task Set 생성/삭제는 사용자가 직접 API로 수행하고, 트래픽은 App Mesh의 가상 라우터나 Argo Rollouts가 제어한다. 멀티클러스터 서비스 메시 환경이나 고급 Canary(헤더 기반, 사용자 세그먼트 기반)가 필요할 때 사용한다. DOP-C02 시험에서는 주로 `ECS`와 `CODE_DEPLOY` 차이를 묻는다.

---

## ECS Rolling Update: Circuit Breaker 자동 롤백

CodeDeploy 없이도 ECS 자체의 Rolling Update에서 자동 롤백이 가능하다.

```bash
aws ecs update-service \
  --cluster prod \
  --service myapp \
  --task-definition myapp:43 \
  --deployment-configuration \
    "minimumHealthyPercent=100,maximumPercent=200,
     deploymentCircuitBreaker={enable=true,rollback=true}"
```

**파라미터 의미:**
- `minimumHealthyPercent=100`: 배포 중에도 최소 100% Task가 Healthy 유지 (다운타임 없음)
- `maximumPercent=200`: 최대 200%까지 Task 수 증가 허용 (새 Task 먼저 띄움)
- `deploymentCircuitBreaker.enable=true`: 새 Task가 연속 Health Check 실패 시 배포 실패 처리
- `deploymentCircuitBreaker.rollback=true`: 배포 실패 시 이전 Task Definition으로 자동 롤백

**Surge 패턴 (minimumHealthyPercent=100, maximumPercent=200):**
```
초기: Task 4개 (구 버전) [100%]
     ↓
단계 1: Task 8개 (구 4 + 신 4) [200%] — 신 Task Health Check 대기
     ↓
단계 2: Task 4개 (신 버전) [100%] — 구 Task 종료
```

다운타임 없지만 일시적으로 EC2(또는 Fargate) 비용이 2배 발생한다.

> 💡 **관련 이론**: Circuit Breaker는 전기 회로 차단기에서 유래한 소프트웨어 패턴이다. Netflix의 Hystrix가 2012년 대중화했고, Martin Fowler가 정의한 세 상태(Closed/Open/Half-Open)가 표준이다. ECS Deployment Circuit Breaker는 이 패턴을 배포 수준에 적용한다. "새 버전이 반복적으로 실패(Open) → 배포 중단 → 이전 버전으로 복원(Closed)"이다. Half-Open 상태는 CloudWatch Alarm 해제 후 다시 시도하는 경우에 해당한다.

---

## ECS Blue/Green 배포 흐름: 7단계 이해

```
ECS Blue/Green with CodeDeploy
==================================================

초기 상태:
ALB Production Listener (443) → TG-Blue (Task Set 1, 현재 버전) [100%]
ALB Test Listener (8443, 선택) → TG-Green (미연결)

Step 1: CreateDeployment (CodeDeploy가 Green Task Set 생성)
  → 새 Task Definition 기반으로 Green Task Set 생성
  → Task들이 TG-Green에 등록
  → Health Check 통과 대기 (실패 시 즉시 실패 처리)

Step 2: BeforeInstall Hook (선택)
  → Green Task Set 생성 전 사전 준비

Step 3: AfterAllowTestTraffic Hook (Test Listener 연결 후)
  → ALB Test Listener (8443) → TG-Green 연결
  → Hook Lambda가 8443 포트로 새 버전 직접 테스트
  → 성공/실패 보고

Step 4: BeforeAllowTraffic Hook
  → Production 트래픽 시프트 직전 최종 검증

Step 5: Production 트래픽 시프트
  → ALB Production Listener: TG-Blue(90%) + TG-Green(10%)  [Canary]
  → 알람 모니터링 → TG-Green(100%)

Step 6: AfterAllowTraffic Hook
  → 시프트 완료 후 통합 검증

Step 7: Termination Wait Time (기본 1시간)
  → Blue Task Set 보존 → 이 기간 내 즉시 롤백 가능

Step 8: Blue Task Set 종료
```

**Test Listener의 정확한 역할:**
- 선택 사항 (없어도 Blue/Green 동작)
- 있으면 `AfterAllowTestTraffic` Hook이 사용 가능해짐
- 내부 테스트 트래픽이 8443 포트로 새 Task Set에 직접 접근
- 프로덕션 트래픽 노출 전 별도 검증 채널

> ⚠️ **함정**: "Test Listener는 Blue/Green 배포에 필수"라는 보기는 틀리다. Test Listener는 선택 사항이다. 있으면 `AfterAllowTestTraffic` Hook을 쓸 수 있어서 프로덕션 노출 전 별도 검증이 가능해지지만, 없어도 Blue/Green 배포 자체는 정상 동작한다. DOP-C02에서 이 구분을 자주 묻는다.

> 📚 **사례**: 2022년 Lyft 공개 사례: 기존 ECS Rolling Update에서 CODE_DEPLOY Blue/Green으로 전환 후, 배포 롤백 시간이 평균 8분에서 45초로 단축됐다. 핵심은 Termination Wait Time 1시간 설정으로 Blue Task Set이 보존되어 있어, 문제 발견 즉시 CodeDeploy 콘솔에서 Stop+Rollback 한 번으로 복원이 가능했다는 것이다. Rolling Update의 롤백은 이전 Task Definition으로 새 배포를 시작하는 것이라 시간이 걸렸다.

---

## AppSpec ECS 상세: Hook 순서와 역할

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:ap-northeast-2:123456789:task-definition/myapp:42"
        LoadBalancerInfo:
          ContainerName: "web"          # 컨테이너 이름 (taskdef의 containerDefinitions[].name과 일치)
          ContainerPort: 80             # 컨테이너 포트
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

**ECS AppSpec Hook 특징:**
- EC2 AppSpec과 달리 Hook이 **Lambda 함수 ARN**을 직접 지정 (스크립트 경로가 아님)
- 각 Hook Lambda도 `PutLifecycleEventHookExecutionStatus`로 결과를 보고해야 함
- 보고 없으면 Timeout(기본 3600초) 후 배포 실패

**각 Hook의 역할:**

| Hook | 시점 | 일반적 용도 |
|------|------|------------|
| `BeforeInstall` | Green Task Set 생성 전 | 사전 준비 (거의 사용 안 함) |
| `AfterInstall` | Green Task Set 생성 후, Test Listener 연결 전 | Task 상태 검증 |
| `AfterAllowTestTraffic` | Test Listener → TG-Green 연결 후 | 8443 포트로 통합 테스트 |
| `BeforeAllowTraffic` | Production 트래픽 시프트 직전 | 최종 검증, 캐시 워밍 |
| `AfterAllowTraffic` | Production 트래픽 시프트 완료 후 | 스모크 테스트, 모니터링 확인 |

> 🔍 **더 깊이**: ECS AppSpec의 Hook Lambda는 EC2 AppSpec의 Shell 스크립트와 동일한 역할을 하지만, Lambda의 특성상 타임아웃이 최대 15분으로 제한된다. 15분이 넘는 통합 테스트(예: 데이터베이스 마이그레이션 검증)는 Hook Lambda에서 Step Functions을 트리거하고, 완료 신호를 받아 CodeDeploy에 보고하는 비동기 패턴을 사용한다. 또는 Hook Timeout을 3600초(1시간)로 설정하고 Lambda에서 외부 시스템 완료를 polling하는 방법도 있다.

---

## CodePipeline과 ECS Blue/Green 통합: IMAGE1_NAME 치환 흐름

```
[Source: ECR Push 이벤트]
    │
    ▼
[CodeBuild]
  1. 이미지 빌드 및 ECR push
  2. 아티팩트 생성:
     - taskdef.json (IMAGE1_NAME 플레이스홀더 포함)
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
Pipeline이 imagedefinitions.json의 imageUri를
taskdef.json의 <IMAGE1_NAME> 위치에 자동 치환
    │
    ▼
새 Task Definition Revision 등록
    │
    ▼
CodeDeploy Blue/Green 배포 시작
```

**taskdef.json (플레이스홀더 포함):**
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

**imagedefinitions.json (CodeBuild가 생성):**
```json
[{
  "name": "web",
  "imageUri": "123456789.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:abc1234f"
}]
```

Pipeline이 `imagedefinitions.json`의 `imageUri`를 `taskdef.json`의 `<IMAGE1_NAME>` 자리에 치환하고, 새 Task Definition Revision을 등록한 후 CodeDeploy 배포를 시작한다.

**CodeBuild의 이미지 빌드 및 아티팩트 생성 buildspec 예:**
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

> 🔍 **더 깊이**: ECS는 Task Definition의 `image` 필드에 항상 구체적인 이미지 URI(태그 포함)를 써야 한다. `latest` 태그는 ECS가 새 이미지를 자동으로 pull하지 않기 때문에 사실상 의미가 없다 — 새 배포가 새 이미지를 쓰려면 반드시 새 Task Definition Revision을 등록해야 한다. CodePipeline의 `<IMAGE1_NAME>` 치환 패턴이 이 문제를 자동화한다. 빌드마다 고유한 git SHA 기반 태그가 새 Task Definition에 반영된다.

> ⚠️ **함정**: `taskdef.json`에서 플레이스홀더는 반드시 `<IMAGE1_NAME>` 형식이어야 한다 (꺾쇠 괄호 포함). 다른 형식(예: `${IMAGE_NAME}`, `IMAGE_PLACEHOLDER`)은 Pipeline Action이 인식하지 못해 치환이 발생하지 않는다. 시험에서 "IMAGE1_NAME이 치환되지 않는 이유"가 나오면 플레이스홀더 형식을 확인하는 것이 첫 번째 체크 항목이다.

---

## ECS Canary/Linear: CODE_DEPLOY 컨트롤러 지원 여부

Lambda와 달리 ECS에서도 Canary/Linear Deployment Configuration이 지원된다.

**ECS 지원 Deployment Configurations:**
```bash
# Canary 패턴 (ECS용)
CodeDeployDefault.ECSCanary10Percent5Minutes
CodeDeployDefault.ECSCanary10Percent15Minutes

# Linear 패턴 (ECS용)
CodeDeployDefault.ECSLinear10PercentEvery1Minutes
CodeDeployDefault.ECSLinear10PercentEvery3Minutes

# All at once
CodeDeployDefault.ECSAllAtOnce
```

ECS Canary의 동작:
- 첫 10% 트래픽을 Green Target Group으로 시프트
- 5분(또는 15분) 모니터링
- 알람 없으면 나머지 90% 전환

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

> 💡 **관련 이론**: ECS Blue/Green에서의 트래픽 시프트는 ALB의 **가중 Target Group 라우팅**으로 구현된다. ALB Listener Rule의 `forward` action에 두 Target Group의 가중치를 지정한다. CodeDeploy가 이 가중치를 Canary/Linear 스케줄에 따라 자동으로 업데이트한다. Lambda Alias의 weighted routing과 개념은 같지만, 구현 레이어가 ALB → TG → Task Set으로 한 단계 더 깊다.

---

## Fargate vs EC2 Container Instance: 배포 관점

| 항목 | Fargate | EC2 (Container Instance) |
|------|---------|--------------------------|
| 인스턴스 관리 | 없음 (AWS 관리) | ASG + Capacity Provider 필요 |
| Task 격리 | 강함 (별도 VM 기반) | 약함 (같은 호스트 공유 가능) |
| Spot 지원 | FARGATE_SPOT | EC2 Spot Instance |
| Blue/Green 지원 | CODE_DEPLOY 동일 | CODE_DEPLOY 동일 |
| 콜드 스타트 | 더 김 (이미지 pull 포함) | 더 짧음 (레이어 캐시 활용) |
| 배포 방식 | Task Definition Revision 갱신 | Task Definition Revision 갱신 |

배포 관점에서 Fargate와 EC2 Container Instance는 동일하게 동작한다 — 두 경우 모두 Task Definition Revision 변경으로 배포가 트리거되고, CodeDeploy가 두 경우 모두 동일하게 Blue/Green을 수행한다.

**FARGATE_SPOT + Blue/Green 주의사항:**
```yaml
# AppSpec에서 Capacity Provider 지정 가능
CapacityProviderStrategy:
  - CapacityProvider: FARGATE_SPOT
    Weight: 3
  - CapacityProvider: FARGATE
    Weight: 1
    Base: 1  # 최소 1개는 FARGATE로 보장
```

FARGATE_SPOT은 Spot 중단이 발생할 수 있으므로, 배포 중 Green Task Set이 Spot 중단으로 갑자기 줄어들면 Health Check 실패로 이어질 수 있다. Blue/Green에서 중요한 배포라면 `Base: 1`로 최소 1개의 안정적인 FARGATE Task를 보장한다.

> 📚 **사례**: 어떤 팀이 비용 절감을 위해 FARGATE_SPOT만으로 Blue/Green 배포를 구성했다. Canary 10% 시프트 중 Spot 중단이 발생해 Green Task Set이 Health Check 실패로 배포가 자동 롤백됐다. 실제 새 버전에는 문제가 없었지만 인프라 이슈로 배포가 실패한 것이다. 해결책: `Base: 1`로 최소 FARGATE Task를 보장하거나, 중요한 배포에서는 FARGATE_SPOT 비율을 줄인다.

---

## ECS Service 롤백 시나리오별 대응

| 상황 | Termination Wait 진행 중 | Wait 완료 후 |
|------|--------------------------|-------------|
| 배포 직후 버그 발견 | CodeDeploy Stop+Rollback (즉시, Blue Task Set 활용) | 이전 Task Definition으로 새 배포 (시간 소요) |
| Canary 알람 발동 | 자동 롤백 (CodeDeploy) | 자동 롤백 없음 (이미 100% 전환) |
| Blue Task Set 없음 | 롤백 불가 (재배포 필요) | — |

Termination Wait Time이 끝나기 전에 문제를 발견하면 즉각 롤백이 가능하다. 이것이 Wait Time을 적절히 설정하는 이유다.

**즉시 롤백 CLI:**
```bash
# 배포 중단 + 롤백
aws deploy stop-deployment \
  --deployment-id d-XXXXXXXXX \
  --auto-rollback-enabled
```

> 🎯 **시나리오**: 한 팀이 ECS Blue/Green 배포 후 30분이 지났다. Termination Wait Time은 60분으로 설정되어 있다. 새 버전에서 메모리 누수가 발견됐다. 지금 가장 빠른 복원 방법은? 정답은 **CodeDeploy Stop+Rollback** — Blue Task Set이 아직 살아있으므로 ALB 트래픽을 Blue로 즉시 전환할 수 있다. 60분 이후라면 Blue Task Set이 종료되어 있으므로, 이전 Task Definition 번호로 새 CodeDeploy 배포를 시작해야 한다 (수분 소요).

---

## 마무리: ECS 배포 판단 흐름

```
ECS 배포 전략 선택
====================
빠른 롤백이 필요한가?
    └─ YES → CODE_DEPLOY 컨트롤러 (Blue/Green)
              ├─ Canary: 소수 트래픽 먼저 검증
              ├─ Linear: 점진적 전환
              └─ AllAtOnce: 개발/테스트 환경만

자동 롤백으로 충분한가?
    └─ YES → ECS 컨트롤러 (Rolling) + Circuit Breaker
              ├─ minimumHealthyPercent/maximumPercent 설정
              └─ deploymentCircuitBreaker.rollback=true

사전 검증 채널이 필요한가?
    └─ YES → Test Listener (8443) + AfterAllowTestTraffic Hook
    └─ NO  → Test Listener 없어도 Blue/Green 동작

CODE_DEPLOY vs ECS 컨트롤러 선택 기준:
    CODE_DEPLOY: 즉각 롤백, 트래픽 시프트 제어, Hook 검증
    ECS(Rolling): 단순성, CodeDeploy 불필요, Circuit Breaker로 충분
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
