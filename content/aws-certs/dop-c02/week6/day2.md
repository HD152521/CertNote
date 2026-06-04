# Day 2 - ECS 자동 배포: Task Definition 갱신에서 Auto Scaling까지

ECS 배포 자동화를 처음 구성할 때 가장 많이 막히는 지점이 두 곳이다. 하나는 "새 이미지를 ECR에 push했는데 ECS Service가 자동으로 업데이트되지 않는다"이고, 다른 하나는 "Rolling과 Blue/Green 배포에서 CodeBuild가 다른 파일을 생성해야 한다는데 정확히 뭐가 다른가"다. 오늘은 이 두 지점부터 시작해서 Auto Scaling, Capacity Provider, ECS Exec까지 ECS 운영 자동화의 전체를 다룬다.

## ECS 배포 자동화의 핵심: Task Definition 갱신 흐름

ECS Service는 "어떤 Task Definition revision을 실행할 것인가"를 관리한다. 새 이미지를 배포하는 것은 결국 새 Task Definition revision을 등록하고 ECS Service가 그 revision을 사용하도록 업데이트하는 과정이다.

**수동 방식 (이해를 위한 기반)**:
```bash
# 1. 새 이미지 push
docker push 111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123

# 2. 현재 Task Definition 가져오기
aws ecs describe-task-definition --task-definition checkout-prod \
  --query 'taskDefinition' > current-taskdef.json

# 3. 이미지 URI 교체 + 새 revision 등록
# (current-taskdef.json 편집 후)
NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://new-taskdef.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)

# 4. ECS Service 업데이트
aws ecs update-service \
  --cluster prod \
  --service checkout-service \
  --task-definition $NEW_TASK_DEF_ARN
```

이 4단계를 CodePipeline + CodeBuild가 자동화한다.

## Rolling 배포 vs Blue/Green 배포: 파일 형식의 차이

CodePipeline의 ECS Deploy Action은 두 가지 모드가 있고, 각 모드에서 CodeBuild가 출력해야 하는 파일이 다르다.

### Rolling 배포 (Amazon ECS Provider)

```
CodeBuild → imagedefinitions.json → Pipeline ECS Action
```

`imagedefinitions.json` 형식:
```json
[
  {"name": "checkout", "imageUri": "111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123"},
  {"name": "envoy-proxy", "imageUri": "840364872350.dkr.ecr.ap-northeast-2.amazonaws.com/aws-appmesh-envoy:v1.29"}
]
```

- `name` 필드가 Task Definition의 컨테이너 이름과 정확히 일치해야 한다
- 여러 컨테이너를 한 번에 업데이트 가능
- CodePipeline ECS Action이 이 파일을 읽어 Task Definition의 이미지 URI를 교체하고 새 revision을 자동 등록 + Service 업데이트

### Blue/Green 배포 (CodeDeploy ECS Provider)

```
CodeBuild → taskdef.json + appspec.yaml + imageDetail.json → Pipeline ECS(Blue/Green) Action
```

`imageDetail.json` 형식:
```json
{"ImageURI": "111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123"}
```

`taskdef.json` (이미지 URI에 플레이스홀더 사용):
```json
{
  "family": "checkout-prod",
  "containerDefinitions": [
    {
      "name": "checkout",
      "image": "<IMAGE1_NAME>",
      "portMappings": [{"containerPort": 8080}],
      "environment": [
        {"name": "ENVIRONMENT", "value": "prod"}
      ],
      "secrets": [
        {"name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:111:secret:prod/checkout/db-password"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/checkout-prod",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "networkMode": "awsvpc",
  "executionRoleArn": "arn:aws:iam::111:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::111:role/checkout-task-role"
}
```

`appspec.yaml`:
```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "<TASK_DEFINITION>"
        LoadBalancerInfo:
          ContainerName: "checkout"
          ContainerPort: 8080
        PlatformVersion: "LATEST"
Hooks:
  - BeforeInstall: "arn:aws:lambda:ap-northeast-2:111:function:PreDeployValidation"
  - AfterInstall: "arn:aws:lambda:ap-northeast-2:111:function:PostDeploySmoke"
  - AfterAllowTestTraffic: "arn:aws:lambda:ap-northeast-2:111:function:TrafficValidation"
  - BeforeAllowTraffic: "arn:aws:lambda:ap-northeast-2:111:function:FinalValidation"
  - AfterAllowTraffic: "arn:aws:lambda:ap-northeast-2:111:function:PostCutover"
```

CodePipeline ECS(Blue/Green) Action이 `<IMAGE1_NAME>`을 imageDetail.json의 ImageURI로 치환하고, `<TASK_DEFINITION>`을 새로 등록된 Task Definition ARN으로 치환한다.

> 💡 **관련 이론**: Blue/Green 배포의 이론적 기반은 **무중단 교체(Zero-Downtime Replacement)**다. 기존 환경(Blue)을 유지한 채 새 환경(Green)을 완전히 준비한 후, 트래픽 스위치를 ALB Target Group 교체로 순간적으로 전환한다. 실패 시 Blue로 즉시 롤백이 가능하다(다시 Target Group 교체). Rolling은 서비스 중단 없이 점진적으로 교체하지만 롤백이 느리다(새 Task를 다시 이전 버전으로 바꿔야 함). 배포 시간이 중요하면 Rolling, 롤백 시간이 중요하면 Blue/Green이다.

## buildspec.yml에서 올바른 파일 생성하기

```yaml
version: 0.2

env:
  variables:
    ECR_REGISTRY: "111111111111.dkr.ecr.ap-northeast-2.amazonaws.com"
    CONTAINER_NAME: "checkout"
  exported-variables:
    - IMAGE_TAG
    - IMAGE_URI

phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - export IMAGE_URI="${ECR_REGISTRY}/checkout:${IMAGE_TAG}"

  build:
    commands:
      - docker build -t $IMAGE_URI .

  post_build:
    commands:
      - docker push $IMAGE_URI
      # Rolling 배포용
      - printf '[{"name":"%s","imageUri":"%s"}]' "$CONTAINER_NAME" "$IMAGE_URI" > imagedefinitions.json
      # Blue/Green 배포용
      - printf '{"ImageURI":"%s"}' "$IMAGE_URI" > imageDetail.json

artifacts:
  files:
    - imagedefinitions.json
    - imageDetail.json
    - appspec.yaml
    - taskdef.json
```

> ⚠️ **함정**: `taskdef.json`에서 컨테이너 이름이 `imagedefinitions.json`의 `name` 필드와 정확히 일치해야 한다. 불일치하면 "Container name not found in task definition" 오류가 발생한다. 또한 Blue/Green 배포에서 `taskdef.json`의 이미지 URI는 반드시 `<IMAGE1_NAME>` 플레이스홀더를 사용해야 한다—실제 URI를 하드코딩하면 CodePipeline이 치환하지 않는다.

> 💡 **관련 이론**: Rolling과 Blue/Green 배포의 파일 형식 차이는 두 Provider의 내부 동작 방식 차이에서 온다. ECS Rolling Provider는 CodePipeline이 직접 ECS API를 호출해 Task Definition을 등록하고 Service를 업데이트한다—단순한 API 호출 자동화다. Blue/Green Provider는 CodeDeploy가 오케스트레이션을 담당한다—CodeDeploy가 ALB Target Group 교체, 배포 훅(Lambda), 트래픽 전환 비율, 롤백을 모두 관리한다. 이 때문에 Blue/Green은 `appspec.yaml`이 필요하다—CodeDeploy가 이 파일로 배포 훅과 ALB 설정을 읽는다. `<IMAGE1_NAME>` 플레이스홀더는 CodePipeline이 `imageDetail.json`의 실제 URI로 치환한다.

> 📚 **사례**: Netflix의 ECS 배포 전략. Netflix는 수백 개의 ECS 서비스를 운영하면서 서비스의 중요도에 따라 배포 방식을 차별화한다. API Gateway와 같은 Critical Path 서비스는 Blue/Green 배포(즉시 롤백 가능)를 사용하고, 내부 백그라운드 작업(배치 처리, 이메일 발송)은 Rolling 배포(더 빠른 배포)를 사용한다. "롤백 속도가 배포 속도보다 중요한가"가 선택 기준이다. Blue/Green은 롤백이 Target Group 교체로 수초이지만, Rolling은 이전 이미지로 다시 Rolling 배포가 필요해 수분이 걸린다.

## ECS Service Auto Scaling: Application Auto Scaling의 작동 방식

ECS Auto Scaling은 AWS EC2 Auto Scaling이 아니라 **Application Auto Scaling** 서비스를 사용한다. Application Auto Scaling은 ECS 외에도 DynamoDB, Aurora, SageMaker Endpoint 등 여러 서비스의 스케일링을 담당하는 통합 스케일링 서비스다.

```bash
# 1. ECS Service를 확장 가능한 대상으로 등록
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "service/prod-cluster/checkout-service" \
  --min-capacity 2 \
  --max-capacity 50

# 2. Target Tracking 정책 (CPU 70% 목표 유지)
aws application-autoscaling put-scaling-policy \
  --policy-name checkout-cpu-target-tracking \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "service/prod-cluster/checkout-service" \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'

# 3. ALB 요청 수 기반 Target Tracking (더 반응성이 높음)
aws application-autoscaling put-scaling-policy \
  --policy-name checkout-alb-target-tracking \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "service/prod-cluster/checkout-service" \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 1000.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/prod-alb/abc123/targetgroup/checkout-tg/xyz456"
    }
  }'

# 4. Scheduled Scaling (점심 트래픽 대비)
aws application-autoscaling put-scheduled-action \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "service/prod-cluster/checkout-service" \
  --scheduled-action-name lunch-scale-out \
  --schedule "cron(0 11 * * ? *)" \
  --scalable-target-action MinCapacity=10,MaxCapacity=50

aws application-autoscaling put-scheduled-action \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "service/prod-cluster/checkout-service" \
  --scheduled-action-name lunch-scale-in \
  --schedule "cron(0 14 * * ? *)" \
  --scalable-target-action MinCapacity=2,MaxCapacity=50
```

**스케일링 유형 비교**:

| 유형 | 작동 방식 | 사용 사례 |
|------|-----------|-----------|
| Target Tracking | 지표를 목표값에 맞춤 (PID controller처럼) | CPU 70%, 요청수 1000/Target |
| Step Scaling | 임계값 초과 정도에 따라 다른 조정량 | "CPU 80% → +5개, CPU 90% → +10개" |
| Scheduled | 시간 기반 사전 스케일링 | 매일 점심, 월요일 오전 |

> 🔍 **더 깊이**: Application Auto Scaling의 Target Tracking은 제어 이론의 **PID Controller(비례-적분-미분 제어기)**를 단순화한 버전이다. 측정값(현재 CPU)과 목표값(70%) 사이의 오차(error)를 계산해 조정량을 결정한다. AWS는 P(비례) 항만 구현한 단순 비례 제어에 ScaleIn/Out Cooldown을 더해 오버슈팅(과도한 스케일링)을 방지한다. 실제 PID Controller를 구현하면 더 정교하지만 대부분의 웹 서비스에서는 단순 Target Tracking으로 충분하다. 빠른 버스트(e.g., 플래시 세일)에는 Scheduled Scaling으로 미리 스케일 아웃하는 것이 Target Tracking보다 효과적이다—Target Tracking이 반응하는 데 1~3분이 걸리기 때문이다.

## Capacity Provider Strategy: Spot과 On-Demand의 조합

Capacity Provider는 ECS Task가 실행될 인프라(Fargate On-Demand, Fargate Spot, EC2 ASG)를 결정한다. Strategy는 이 인프라 조합의 비율을 정의한다.

```json
{
  "capacityProviderStrategy": [
    {
      "capacityProvider": "FARGATE",
      "weight": 1,
      "base": 2
    },
    {
      "capacityProvider": "FARGATE_SPOT",
      "weight": 4,
      "base": 0
    }
  ]
}
```

계산 방법:
- `base: 2`의 FARGATE → 처음 2개 Task는 무조건 On-Demand FARGATE
- 이후 추가 Task: weight 비율로 분배
  - FARGATE weight=1, FARGATE_SPOT weight=4 → 총 5 unit 중 On-Demand 1/5(20%), Spot 4/5(80%)
- 결과: Task가 10개면 → 2개 On-Demand(base) + 6.4개 On-Demand(비율) + 1.6개... 아니라
- **정확한 계산**: base 2개는 On-Demand. 나머지 8개는 weight 비율 = 1:4 → On-Demand 1.6개 → 반올림 = 2개, Spot 6.4개 → 6개. 실제로는 Task별로 비율에 맞게 배분.

```bash
# ECS Service에 Capacity Provider Strategy 적용
aws ecs create-service \
  --cluster prod-cluster \
  --service-name checkout-service \
  --task-definition checkout-prod:10 \
  --desired-count 5 \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=2 \
    capacityProvider=FARGATE_SPOT,weight=4

# 기존 서비스 업데이트
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=2 \
    capacityProvider=FARGATE_SPOT,weight=4 \
  --force-new-deployment
```

**Fargate Spot 사용 시 필수 고려사항**:
- Spot 인스턴스 회수 2분 전 SIGTERM 전달
- ECS Agent가 Task에 SIGTERM을 보내고 `stopTimeout`(기본 30초)이 지나면 SIGKILL
- 애플리케이션이 SIGTERM을 받으면 graceful shutdown을 수행해야 함 (진행 중인 HTTP 요청 완료, DB 연결 정리)
- Stateless 워크로드에만 적합 — 상태를 외부 저장소(RDS, ElastiCache, S3)에 두는 12-factor app 원칙

```python
# Python FastAPI graceful shutdown 예시
import signal
import asyncio

class GracefulShutdown:
    def __init__(self):
        self.shutdown = False
        signal.signal(signal.SIGTERM, self._handle_sigterm)
    
    def _handle_sigterm(self, signum, frame):
        self.shutdown = True
        # 진행 중인 요청 완료 대기 로직
        asyncio.get_event_loop().create_task(self._graceful_exit())
    
    async def _graceful_exit(self):
        # 새 요청 거부 시작
        # 진행 중인 요청이 완료될 때까지 최대 25초 대기 (30초 SIGKILL 전)
        await asyncio.sleep(25)
```

> 📚 **사례**: 2020년 Lyft의 ECS Fargate Spot 도입 사례. Lyft는 비정기 배치 작업(데이터 처리, 리포트 생성)에 Fargate Spot을 도입해 컴퓨트 비용을 60% 절감했다. 핵심은 작업을 **체크포인트(checkpoint)** 방식으로 설계한 것—Spot 회수 시 진행 상태를 S3에 저장하고, 새 Task가 체크포인트에서 재시작하도록 구현했다. 이 패턴이 DOP-C02에서 "Spot 사용 + 내결함성 설계"라는 키워드로 자주 등장한다.

## ECS Exec: Bastion 없이 컨테이너 디버깅

ECS Exec는 AWS Systems Manager Session Manager를 통해 실행 중인 컨테이너에 직접 접속하는 기능이다. SSH Bastion이 필요 없고, EC2 인스턴스 없이도 동작한다.

**활성화 조건 (셋 다 필요)**:

1. Task Definition에 `enableExecuteCommand: true`
2. Task Role에 SSM Session Manager 권한
3. Service 업데이트로 새 Task 생성

```bash
# 1. Task Role에 SSM 권한 추가
aws iam put-role-policy \
  --role-name checkout-task-role \
  --policy-name ECSExecPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ],
      "Resource": "*"
    }]
  }'

# 2. Task Definition에 enableExecuteCommand 활성화 (새 revision 등록 필요)
# CloudFormation:
# Properties:
#   EnableExecuteCommand: true

# 3. Service 업데이트 (기존 Task에는 적용 안 됨, 새 Task에만)
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --enable-execute-command \
  --force-new-deployment

# 4. 컨테이너 접속
aws ecs execute-command \
  --cluster prod-cluster \
  --task arn:aws:ecs:ap-northeast-2:111:task/prod-cluster/abc123 \
  --container checkout \
  --interactive \
  --command "/bin/sh"
```

> ⚠️ **함정**: ECS Exec는 Task가 실행 중인 상태에서만 활성화할 수 있다. `--enable-execute-command`를 Service에 설정해도 이미 실행 중인 Task에는 적용되지 않는다—`--force-new-deployment`로 새 Task를 생성해야 한다. 또한 VPC Endpoint가 없는 환경에서는 인터넷을 통해 SSM API에 접근해야 하므로, Private Subnet에서 ECS Exec를 사용하려면 `ssm.amazonaws.com`, `ssmmessages.amazonaws.com`, `s3.amazonaws.com` VPC Endpoint가 필요하다.

> 💡 **관련 이론**: ECS Auto Scaling의 ALB RequestCountPerTarget 메트릭은 CPU/Memory보다 더 좋은 스케일링 시그널인 경우가 많다. CPU 기반 스케일링의 문제는 "CPU가 높아지는 시점 = 이미 시스템이 압박받는 시점"이다—반응이 늦다. 반면 ALB 요청 수는 CPU 상승 이전에 증가한다(요청이 몰리고 CPU 처리가 지연되기 전에). 1000 requests/target 목표를 설정하면 "각 Task가 평균 1000 RPS를 처리한다"는 의미이며, 이 목표를 유지하도록 Task 수가 자동 조정된다. 트래픽 패턴이 예측 가능한 서비스(점심 시간 트래픽 급증)는 Scheduled Action + Target Tracking 조합이 가장 효과적이다—Scheduled가 미리 스케일 아웃하고 Target Tracking이 세밀하게 조정한다.

> 🎯 **시나리오**: 한 전자상거래 서비스가 블랙프라이데이 트래픽을 예측하고 있다. 평상시 Task 5개로 1,000 RPS를 처리하고, 블랙프라이데이에는 50,000 RPS가 예상된다. 문제: Target Tracking만으로는 트래픽이 갑자기 급증할 때 스케일 아웃 반응 시간(1-3분) 동안 서비스가 과부하된다. 해결: (1) 블랙프라이데이 10분 전 Scheduled Action으로 MinCapacity=100으로 미리 스케일 아웃, (2) Target Tracking이 실제 트래픽에 맞게 세밀 조정, (3) 이벤트 종료 후 Scheduled Action으로 MinCapacity=5로 복원, (4) Capacity Provider Strategy로 base=10 On-Demand + Spot 비율로 비용 최적화. 사전 스케일링(Predictive Scaling)이 반응형 스케일링보다 트래픽 급증 시 더 효과적이다.

## Container Insights: ECS 운영 가시성

Container Insights는 ECS 클러스터, 서비스, Task 수준의 메트릭을 CloudWatch에 자동 수집하는 기능이다.

```bash
# 클러스터 수준에서 활성화
aws ecs update-cluster-settings \
  --cluster prod-cluster \
  --settings name=containerInsights,value=enabled
```

수집되는 메트릭:
- `CpuUtilized`, `CpuReserved`, `MemoryUtilized`, `MemoryReserved` (Task/Service/Cluster 각 수준)
- `NetworkRxBytes`, `NetworkTxBytes`
- `StorageReadBytes`, `StorageWriteBytes`
- `RunningTaskCount`, `DesiredTaskCount`, `PendingTaskCount`
- `DeploymentCount`

수집 비용: CloudWatch 커스텀 메트릭 요금($0.30/메트릭/월) + CloudWatch Logs 요금. 소규모 클러스터에서도 월 수십 달러가 추가될 수 있다—활성화 전 비용 추정 필요.

CloudWatch Logs Insights로 실시간 분석:
```
# 메모리 사용률 90% 이상인 Task 찾기
fields @timestamp, ServiceName, TaskId, MemoryUtilized, MemoryReserved
| filter Type="Task" and (MemoryUtilized / MemoryReserved * 100) > 90
| sort @timestamp desc
| limit 20
```

## force-new-deployment: 같은 태그의 새 이미지 배포

이미지 태그를 `latest`처럼 고정하고 내용만 바꿔서 재배포하는 패턴에서 사용된다. Task Definition revision은 변경 없이 새 Task를 생성해서 이미지를 다시 pull한다.

```bash
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --force-new-deployment
```

이 방식은 IMMUTABLE 태그 원칙과 충돌한다. **권장 패턴**: 항상 commit SHA 기반 태그를 사용하고, 새 이미지마다 새 태그를 사용. 이렇게 하면 Task Definition revision이 정확히 어떤 이미지를 사용하는지 추적 가능하고, `--force-new-deployment`에 의존하지 않아도 된다.

## 실전 아키텍처: CodePipeline + ECS 전체 흐름

```
GitHub (main push)
    ↓ CodeStar Connection Webhook
CodePipeline (V2, QUEUED)
    ↓
Stage: Source
  ├── Action: SourceCheckout → SourceArtifact
    ↓
Stage: Build  
  ├── Action: BuildAndPush (CodeBuild)
  │     ├── docker build + push to ECR
  │     ├── imagedefinitions.json 생성
  │     └── outputs: BuildArtifact
    ↓
Stage: Test
  ├── Action: IntegrationTest (CodeBuild)
  │     └── staging 환경 smoke test
    ↓
Stage: Deploy-Staging
  ├── Action: DeployStaging (ECS Rolling)
  │     └── imagedefinitions.json → staging ECS Service 업데이트
    ↓
Stage: Approve
  ├── Action: ManualApproval → SNS → Chatbot → Slack
    ↓
Stage: Deploy-Prod
  ├── beforeEntry: CloudWatch Alarm Check (error rate < 1%)
  ├── Action: DeployProd (ECS Blue/Green via CodeDeploy)
  │     ├── taskdef.json + appspec.yaml + imageDetail.json
  │     └── ALB Target Group 교체 (zero-downtime)
  └── onSuccess: PostDeploy Health Check (5분)
```

> 🎯 **시나리오**: 전자상거래 회사의 결제 서비스를 ECS Fargate로 운영 중이다. 요구사항: (1) prod 배포는 zero-downtime, (2) 트래픽 급증 시 자동 스케일, (3) 비용 최적화를 위해 Spot 사용, (4) Spot 회수 시 결제 트랜잭션 손실 없어야 함. 설계: Blue/Green 배포(ECS CodeDeploy Action)로 zero-downtime. Capacity Provider Strategy로 base=2 On-Demand + weight Spot 4:1. Fargate Spot 회수 SIGTERM 수신 시 새 결제 요청 거부(HTTP 503) + 진행 중인 트랜잭션 완료 후 종료(25초 이내). DB 트랜잭션은 Aurora의 ACID 보장으로 Spot 회수 시 자동 롤백.

## 정리하며

ECS 배포 자동화의 핵심은 두 배포 모드의 파일 형식 차이다. Rolling은 `imagedefinitions.json`, Blue/Green은 `taskdef.json + appspec.yaml + imageDetail.json(<IMAGE1_NAME> 플레이스홀더)`. Auto Scaling은 Application Auto Scaling 서비스로 ECS Service의 DesiredCount를 조정한다. Capacity Provider Strategy의 base+weight 계산이 On-Demand/Spot 비율을 결정한다. ECS Exec는 Task Definition + Task Role + Service 업데이트 세 가지가 동시에 필요하다.

---

## 📝 연습 문제

**문제 1.** ECS Blue/Green 배포에서 CodeBuild가 출력해야 하는 파일 조합은?

A) imagedefinitions.json만
B) taskdef.json + appspec.yaml + imageDetail.json (이미지 URI는 taskdef.json에 `<IMAGE1_NAME>` 플레이스홀더)
C) buildspec.yml + Dockerfile
D) template.yaml + parameters.json

**정답: B**
해설: Blue/Green 배포(CodeDeploy ECS Provider)는 세 파일이 필요하다. `taskdef.json`에서 컨테이너 이미지 URI 자리에 `<IMAGE1_NAME>` 플레이스홀더를 사용하고, `imageDetail.json`에 실제 이미지 URI를 담는다. `appspec.yaml`은 CodeDeploy 배포 훅(BeforeInstall, AfterInstall 등)과 ALB 설정을 정의한다. Rolling 배포는 `imagedefinitions.json` 하나만 필요하다.

---

**문제 2.** ECS Service Auto Scaling에서 "평일 오전 9시에 최소 Task 수를 10개로, 오후 6시에 다시 2개로 줄이는" 요구사항을 구현하는 방법은?

A) CloudWatch Alarm으로 시간별 알람 생성
B) Application Auto Scaling의 Scheduled Action으로 cron 스케줄 설정
C) Lambda를 매시간 실행해 update-service 호출
D) ECS Service의 desiredCount를 매일 수동 변경

**정답: B**
해설: Scheduled Action이 이 요구사항의 정확한 도구다. `cron(0 0 * * MON-FRI *)` (UTC 00:00 = KST 09:00)에 MinCapacity=10, `cron(0 9 * * MON-FRI *)` (UTC 09:00 = KST 18:00)에 MinCapacity=2. Target Tracking과 Scheduled Action을 함께 사용하면 Scheduled Action이 MinCapacity를 높여서 최소 Task 수를 보장하고, Target Tracking이 그 위에서 실제 부하에 맞게 추가 스케일링을 담당한다.

---

**문제 3.** Capacity Provider Strategy `FARGATE base=2, weight=1; FARGATE_SPOT weight=4`로 Task 10개가 실행 중일 때 On-Demand와 Spot의 분포는?

A) On-Demand 5개, Spot 5개
B) On-Demand 2개(base) + 나머지 8개를 1:4 비율 → On-Demand ~4개(2+1.6), Spot ~6개
C) On-Demand 2개, Spot 8개
D) 모두 On-Demand

**정답: B**
해설: base=2는 처음 2개 Task를 무조건 On-Demand로 보장한다. 나머지 8개는 weight 비율 1:4로 분배된다—8/(1+4)=1.6개 On-Demand, 6.4개 Spot. 반올림 결과 On-Demand 약 2개, Spot 약 6개. 합계 On-Demand ~4개, Spot ~6개. AWS는 정확한 비율보다 "대략적인 비율 목표"를 유지하므로 실제 분배는 약간 다를 수 있다.

---

**문제 4.** ECS Exec로 실행 중인 컨테이너에 접속하려 할 때 "ExecuteCommandAgent is not running" 오류가 발생한다. 가장 가능성 높은 원인은?

A) Task Role에 권한이 없다
B) enableExecuteCommand가 Task Definition에 설정됐지만, Service를 --enable-execute-command와 함께 업데이트하지 않았거나 --force-new-deployment로 새 Task를 생성하지 않았다
C) VPC 엔드포인트가 없다
D) ECS 클러스터 버전이 낮다

**정답: B**
해설: ECS Exec Agent는 Task가 시작될 때 초기화된다. Service에 enableExecuteCommand를 설정해도 이미 실행 중인 기존 Task에는 적용되지 않는다. `--force-new-deployment`로 기존 Task를 교체해 새 Task가 ECS Exec Agent와 함께 시작되도록 해야 한다. Task Definition에 enableExecuteCommand가 없거나(이것도 확인 필요), Task Role에 ssmmessages 권한이 없는 경우도 원인이 될 수 있지만, "Agent is not running"이라는 특정 오류는 새 Task가 아직 생성되지 않은 경우에 자주 나타난다.

---

**문제 5.** ECS Rolling 배포에서 새 Task가 시작되기 시작했지만 기존 Task가 종료되지 않아 desired count보다 많은 Task가 실행 중이다. 이 동작을 제어하는 ECS Service 설정은?

A) maximumPercent와 minimumHealthyPercent
B) desiredCount
C) Capacity Provider Strategy
D) enableExecuteCommand

**정답: A**
해설: `maximumPercent`(기본 200%)는 배포 중 최대 실행 Task 비율이고, `minimumHealthyPercent`(기본 100%)는 배포 중 유지해야 하는 최소 정상 Task 비율이다. 기본 설정으로 desired=4인 서비스는 배포 중 최대 8개(200%), 최소 4개(100%) Task가 실행될 수 있다. 비용을 최적화하려면 maximumPercent를 150%로 낮추고, 가용성 우선이면 minimumHealthyPercent를 낮춰서 더 많은 새 Task를 먼저 시작하고 빠르게 이전 Task를 교체할 수 있다.

---

**문제 6.** 같은 이미지 태그(`latest`)로 새 버전을 ECR에 push했는데 ECS Service가 자동으로 업데이트되지 않는다. 수동으로 강제 업데이트하는 명령은?

A) aws ecs update-service --task-definition :latest
B) aws ecs update-service --cluster prod --service checkout --force-new-deployment
C) aws ecs start-task
D) aws ecs run-task

**정답: B**
해설: `--force-new-deployment`는 Task Definition 변경 없이 ECS Service가 새 Task를 시작하게 강제한다. 새 Task가 시작될 때 이미지를 다시 pull하므로 ECR에 새로 push된 `latest` 이미지가 사용된다. 이 방식은 IMMUTABLE 태그 원칙에 반하지만(같은 태그로 다른 이미지를 사용하므로), 태그 변경 없이 빠른 핫픽스 배포가 필요한 긴급 상황에 사용된다. 장기적으로는 commit SHA 기반 태그를 사용하는 것이 권장된다.

---

**문제 7.** ECS Fargate Spot Task가 갑자기 회수될 때 결제 트랜잭션 손실을 방지하는 설계는?

A) Fargate Spot 대신 On-Demand만 사용
B) SIGTERM 수신 시 새 요청 거부 + 진행 중인 트랜잭션 완료 후 종료하는 graceful shutdown 로직 구현 + DB 트랜잭션은 ACID 보장으로 자동 롤백
C) Task 종료 전 데이터를 로컬 디스크에 저장
D) CloudWatch Events로 Spot 회수 감지 후 수동 복구

**정답: B**
해설: Fargate Spot 회수 2분 전 SIGTERM이 ECS Agent를 통해 컨테이너에 전달된다. 애플리케이션이 SIGTERM을 처리해서 (1) 새 HTTP 요청에 503 응답 → 로드 밸런서가 다른 Task로 라우팅, (2) 진행 중인 트랜잭션 최대 25초(stopTimeout 30초 - 5초 마진) 동안 완료 대기, (3) DB 트랜잭션은 RDBMS의 ACID 보장으로 완료되거나 자동 롤백된다. 로컬 디스크(C)는 Task 종료 시 사라지므로 영속성이 없다.

---

