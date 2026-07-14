# Day 2 - ECS Automatic Deployment: From Task Definition Update to Auto Scaling

The two most common blocking points when first configuring ECS deployment automation are: one, "I pushed a new image to ECR but ECS Service doesn't automatically update," and two, "Rolling and Blue/Green deployments require CodeBuild to generate different files, but what exactly is different?" Today, starting from these two pain points, we cover the complete ECS operational automation from Task Definition refresh to Auto Scaling and ECS Exec.

## Core of ECS Deployment Automation: Task Definition Update Flow

ECS Service manages "which Task Definition revision to execute." Deploying a new image ultimately means registering a new Task Definition revision and updating the ECS Service to use that revision.

**Manual Method (for understanding)**:
```bash
# 1. Push new image
docker push 111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123

# 2. Get current Task Definition
aws ecs describe-task-definition --task-definition checkout-prod \
  --query 'taskDefinition' > current-taskdef.json

# 3. Replace image URI + register new revision
NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://new-taskdef.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)

# 4. Update ECS Service
aws ecs update-service \
  --cluster prod \
  --service checkout-service \
  --task-definition $NEW_TASK_DEF_ARN
```

CodePipeline + CodeBuild automates these 4 steps.

## Rolling Deployment vs Blue/Green Deployment: File Format Differences

CodePipeline's ECS Deploy Action has two modes, and CodeBuild must output different files for each mode.

### Rolling Deployment (Amazon ECS Provider)

```
CodeBuild → imagedefinitions.json → Pipeline ECS Action
```

`imagedefinitions.json` format:
```json
[
  {"name": "checkout", "imageUri": "111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123"},
  {"name": "envoy-proxy", "imageUri": "840364872350.dkr.ecr.ap-northeast-2.amazonaws.com/aws-appmesh-envoy:v1.29"}
]
```

- `name` field must exactly match the container name in Task Definition
- Multiple containers can be updated simultaneously
- CodePipeline ECS Action reads this file, replaces image URIs in Task Definition, auto-registers new revision + updates Service

### Blue/Green Deployment (CodeDeploy ECS Provider)

```
CodeBuild → taskdef.json + appspec.yaml + imageDetail.json → Pipeline ECS(Blue/Green) Action
```

`imageDetail.json` format:
```json
{"ImageURI": "111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123"}
```

`taskdef.json` (image URI uses placeholder):
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

CodePipeline ECS(Blue/Green) Action substitutes `<IMAGE1_NAME>` with imageDetail.json's ImageURI and `<TASK_DEFINITION>` with newly registered Task Definition ARN.

> 💡 **Related Theory**: Blue/Green deployment's theoretical foundation is **zero-downtime replacement**. The existing environment (Blue) is maintained while the new environment (Green) is completely prepared, then traffic is switched instantaneously via ALB Target Group replacement. On failure, immediate rollback to Blue is possible (Target Group replacement again). Rolling gradually replaces without downtime, but rollback is slower (new Tasks must be replaced with previous version). When deployment speed is critical, use Rolling; when rollback speed matters, use Blue/Green.

## Creating Correct Files in buildspec.yml

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
      # For Rolling deployment
      - printf '[{"name":"%s","imageUri":"%s"}]' "$CONTAINER_NAME" "$IMAGE_URI" > imagedefinitions.json
      # For Blue/Green deployment
      - printf '{"ImageURI":"%s"}' "$IMAGE_URI" > imageDetail.json

artifacts:
  files:
    - imagedefinitions.json
    - imageDetail.json
    - appspec.yaml
    - taskdef.json
```

> ⚠️ **Trap**: Container name in `taskdef.json` must exactly match the `name` field in `imagedefinitions.json`. Mismatch causes "Container name not found in task definition" error. Also in Blue/Green deployment, `taskdef.json` image URI must use `<IMAGE1_NAME>` placeholder—hardcoding actual URI prevents CodePipeline from substituting.

> 💡 **Related Theory**: File format differences stem from internal operation differences of the two Providers. ECS Rolling Provider lets CodePipeline directly call ECS APIs to register Task Definition and update Service—pure API automation. Blue/Green Provider uses CodeDeploy orchestration—CodeDeploy manages Target Group replacement, deployment hooks (Lambda), traffic transition ratios, and rollback. This is why Blue/Green requires `appspec.yaml`—CodeDeploy reads deployment hooks and ALB settings from this file. The `<IMAGE1_NAME>` placeholder is substituted by CodePipeline with actual URI from `imageDetail.json`.

> 📚 **Case Study**: Netflix's ECS deployment strategy. Netflix operates hundreds of ECS services, differentiating deployment methods by service criticality. Critical Path services like API Gateway use Blue/Green deployment (instant rollback possible), while internal background jobs (batch processing, email sending) use Rolling deployment (faster deployment). The selection criterion is "Is rollback speed more important than deployment speed?" Blue/Green rollback via Target Group replacement takes seconds, while Rolling requires re-deploying with previous image, taking minutes.

## ECS Service Auto Scaling: How Application Auto Scaling Works

ECS Auto Scaling uses **Application Auto Scaling** service, not AWS EC2 Auto Scaling. Application Auto Scaling handles scaling for ECS, DynamoDB, Aurora, SageMaker Endpoints, and other services.

```bash
# 1. Register ECS Service as scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "service/prod-cluster/checkout-service" \
  --min-capacity 2 \
  --max-capacity 50

# 2. Target Tracking policy (maintain CPU 70%)
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

# 3. ALB request-count based Target Tracking (more responsive)
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

# 4. Scheduled Scaling (prepare for lunch traffic)
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

**Scaling Type Comparison**:

| Type | Operation | Use Case |
|------|-----------|-----------|
| Target Tracking | Adjust metric to target value (PID controller-like) | CPU 70%, 1000 req/Target |
| Step Scaling | Different adjustment amounts by threshold excess | "CPU 80% → +5 instances, CPU 90% → +10 instances" |
| Scheduled | Time-based pre-scaling | Daily lunch time, Monday morning |

> 🔍 **Deep Dive**: Application Auto Scaling's Target Tracking is a simplified version of **PID Controller (proportional-integral-derivative control)** from control theory. It calculates error (difference between current CPU and 70% target) and determines adjustment amount. AWS implements only the P (proportional) term with ScaleIn/Out Cooldown to prevent overshooting. Full PID Controller would be more sophisticated but simple Target Tracking suffices for most web services. For rapid bursts (e.g., flash sales), Scheduled Scaling pre-scaling is more effective than Target Tracking—Target Tracking takes 1-3 minutes to react.

## Capacity Provider Strategy: Combining Spot and On-Demand

Capacity Provider determines infrastructure (Fargate On-Demand, Fargate Spot, EC2 ASG) where ECS Tasks run. Strategy defines the ratio of these infrastructure combinations.

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

Calculation method:
- `base: 2` for FARGATE → first 2 Tasks are always On-Demand FARGATE
- Remaining Tasks: distributed by weight ratio
  - FARGATE weight=1, FARGATE_SPOT weight=4 → total 5 units: On-Demand 1/5(20%), Spot 4/5(80%)
- If 10 Tasks: 2 On-Demand(base) + ratio → roughly 2 additional On-Demand + 6 Spot

```bash
# Apply Capacity Provider Strategy to ECS Service
aws ecs create-service \
  --cluster prod-cluster \
  --service-name checkout-service \
  --task-definition checkout-prod:10 \
  --desired-count 5 \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=2 \
    capacityProvider=FARGATE_SPOT,weight=4

# Update existing service
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=2 \
    capacityProvider=FARGATE_SPOT,weight=4 \
  --force-new-deployment
```

**Must-know considerations for Fargate Spot**:
- Spot instance reclaimed 2 minutes before: SIGTERM delivered
- ECS Agent sends SIGTERM to container; after `stopTimeout`(default 30s), SIGKILL
- Application must handle SIGTERM and perform graceful shutdown (complete in-flight HTTP requests, cleanup DB connections)
- Suitable only for stateless workloads—state must be in external storage (RDS, ElastiCache, S3)

```python
# Python FastAPI graceful shutdown example
import signal
import asyncio

class GracefulShutdown:
    def __init__(self):
        self.shutdown = False
        signal.signal(signal.SIGTERM, self._handle_sigterm)
    
    def _handle_sigterm(self, signum, frame):
        self.shutdown = True
        # Logic to wait for in-flight requests to complete
        asyncio.get_event_loop().create_task(self._graceful_exit())
    
    async def _graceful_exit(self):
        # Start rejecting new requests
        # Wait up to 25s for in-flight requests (30s SIGKILL - 5s margin)
        await asyncio.sleep(25)
```

> 📚 **Case Study**: 2020 Lyft's ECS Fargate Spot adoption. Lyft adopted Fargate Spot for irregular batch jobs (data processing, report generation), reducing compute costs by 60%. The key was designing jobs with **checkpoint** pattern—save progress to S3 when Spot reclaimed, new Task restarts from checkpoint. This pattern appears as "Spot usage + fault-tolerant design" keyword in DOP-C02 scenarios.

## ECS Exec: Container Debugging Without Bastion

ECS Exec allows direct access to running containers through AWS Systems Manager Session Manager. No SSH Bastion needed, works without EC2 instances.

**Activation Requirements (all three necessary)**:

1. Task Definition has `enableExecuteCommand: true`
2. Task Role has SSM Session Manager permissions
3. Service updated to create new Tasks

```bash
# 1. Add SSM permissions to Task Role
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

# 2. Enable enableExecuteCommand in Task Definition (new revision needed)
# CloudFormation:
# Properties:
#   EnableExecuteCommand: true

# 3. Update Service (doesn't apply to existing Tasks, only new ones)
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --enable-execute-command \
  --force-new-deployment

# 4. Access container
aws ecs execute-command \
  --cluster prod-cluster \
  --task arn:aws:ecs:ap-northeast-2:111:task/prod-cluster/abc123 \
  --container checkout \
  --interactive \
  --command "/bin/sh"
```

> ⚠️ **Trap**: ECS Exec can only be enabled while Tasks are running. Setting `--enable-execute-command` on Service doesn't apply to already-running Tasks—`--force-new-deployment` creates new Tasks with ECS Exec Agent. Also, without VPC Endpoints, accessing SSM APIs requires internet, so for ECS Exec in Private Subnets, VPC Endpoints for `ssm.amazonaws.com`, `ssmmessages.amazonaws.com`, `s3.amazonaws.com` are required.

> 💡 **Related Theory**: ECS Auto Scaling's ALB RequestCountPerTarget metric is often a better scaling signal than CPU/Memory. The problem with CPU-based scaling is "high CPU = system already under stress"—reaction is late. ALB request count increases before CPU rises (requests accumulate before CPU processing delays). Setting 1000 requests/target means "each Task handles avg 1000 RPS," and this target auto-adjusts Task count. For predictable traffic (lunch hour spike), Scheduled Action + Target Tracking combination is most effective—Scheduled pre-scales and Target Tracking fine-tunes.

> 🎯 **Scenario**: E-commerce service predicting Black Friday traffic. Currently 5 Tasks handle 1,000 RPS; 50,000 RPS expected on Black Friday. Problem: Target Tracking alone can't react fast enough (1-3 min scale-out time) to sudden surge. Solution: (1) Schedule MinCapacity=100 10 min before event, (2) Target Tracking fine-tunes actual traffic, (3) Schedule MinCapacity=5 after event, (4) Capacity Provider Strategy with base=10 On-Demand + Spot ratio for cost optimization. Predictive pre-scaling beats reactive scaling for traffic spikes.

## Container Insights: ECS Operational Visibility

Container Insights automatically collects metrics at ECS cluster, service, and Task levels to CloudWatch.

```bash
# Enable at cluster level
aws ecs update-cluster-settings \
  --cluster prod-cluster \
  --settings name=containerInsights,value=enabled
```

Collected metrics:
- `CpuUtilized`, `CpuReserved`, `MemoryUtilized`, `MemoryReserved` (at Task/Service/Cluster levels)
- `NetworkRxBytes`, `NetworkTxBytes`
- `StorageReadBytes`, `StorageWriteBytes`
- `RunningTaskCount`, `DesiredTaskCount`, `PendingTaskCount`
- `DeploymentCount`

Collection cost: CloudWatch custom metrics charge ($0.30/metric/month) + CloudWatch Logs charge. Even small clusters add tens of dollars monthly—cost estimation needed before enabling.

Real-time analysis via CloudWatch Logs Insights:
```
# Find Tasks with memory utilization > 90%
fields @timestamp, ServiceName, TaskId, MemoryUtilized, MemoryReserved
| filter Type="Task" and (MemoryUtilized / MemoryReserved * 100) > 90
| sort @timestamp desc
| limit 20
```

## force-new-deployment: Deploying New Images with Same Tag

Used when keeping image tag fixed (like `latest`) and changing only content. Task Definition revision unchanged; new Tasks created and image re-pulled.

```bash
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --force-new-deployment
```

This approach conflicts with IMMUTABLE tags principle. **Recommended pattern**: Always use commit SHA-based tags; new images get new tags. Task Definition revision then precisely tracks which image is used, eliminating dependency on `--force-new-deployment`.

## Real-World Architecture: Complete CodePipeline + ECS Flow

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
  │     ├── imagedefinitions.json generation
  │     └── outputs: BuildArtifact
    ↓
Stage: Test
  ├── Action: IntegrationTest (CodeBuild)
  │     └── staging environment smoke test
    ↓
Stage: Deploy-Staging
  ├── Action: DeployStaging (ECS Rolling)
  │     └── imagedefinitions.json → staging ECS Service update
    ↓
Stage: Approve
  ├── Action: ManualApproval → SNS → Chatbot → Slack
    ↓
Stage: Deploy-Prod
  ├── beforeEntry: CloudWatch Alarm Check (error rate < 1%)
  ├── Action: DeployProd (ECS Blue/Green via CodeDeploy)
  │     ├── taskdef.json + appspec.yaml + imageDetail.json
  │     └── ALB Target Group replacement (zero-downtime)
  └── onSuccess: PostDeploy Health Check (5min)
```

> 🎯 **Scenario**: E-commerce payment service on ECS Fargate. Requirements: (1) zero-downtime prod deployment, (2) auto-scale on traffic spike, (3) cost optimization with Spot, (4) no transaction loss on Spot reclamation. Design: Blue/Green deployment (CodeDeploy Action) for zero-downtime. Capacity Provider Strategy base=2 On-Demand + Spot 4:1 ratio. Fargate Spot SIGTERM handling: reject new payment requests (HTTP 503) + complete in-flight transactions within 25s. DB transactions use Aurora ACID for automatic rollback on Spot reclamation.

## Summary

ECS deployment automation's core is the file format difference between deployment modes. Rolling uses `imagedefinitions.json`; Blue/Green uses `taskdef.json + appspec.yaml + imageDetail.json` with `<IMAGE1_NAME>` placeholder. Auto Scaling adjusts ECS Service DesiredCount via Application Auto Scaling. Capacity Provider Strategy's base+weight determines On-Demand/Spot ratio. ECS Exec requires three simultaneous conditions: Task Definition enableExecuteCommand + Task Role + Service update.

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
