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

## 📝 Practice Questions

**Question 1.** What combination of files must CodeBuild output for an ECS Blue/Green deployment?

A) imagedefinitions.json only
B) taskdef.json + appspec.yaml + imageDetail.json (the image URI is the `<IMAGE1_NAME>` placeholder in taskdef.json)
C) buildspec.yml + Dockerfile
D) template.yaml + parameters.json

**Answer: B**
Explanation: A Blue/Green deployment (the CodeDeploy ECS provider) requires three files. Use the `<IMAGE1_NAME>` placeholder at the container image URI position in `taskdef.json`, and put the actual image URI in `imageDetail.json`. `appspec.yaml` defines the CodeDeploy deployment hooks (BeforeInstall, AfterInstall, and so on) and the ALB configuration. A rolling deployment needs only `imagedefinitions.json`.

---

**Question 2.** How do you implement the requirement "on weekdays raise the minimum task count to 10 at 9 AM and reduce it back to 2 at 6 PM" with ECS service auto scaling?

A) Create hourly alarms with CloudWatch alarms
B) Set a cron schedule with an Application Auto Scaling scheduled action
C) Run Lambda every hour to call update-service
D) Manually change the ECS service desiredCount every day

**Answer: B**
Explanation: A scheduled action is the exact tool for this requirement. MinCapacity=10 at `cron(0 0 * * MON-FRI *)` (UTC 00:00 = KST 09:00), and MinCapacity=2 at `cron(0 9 * * MON-FRI *)` (UTC 09:00 = KST 18:00). When target tracking and scheduled actions are used together, the scheduled action raises MinCapacity to guarantee the minimum task count, and target tracking handles additional scaling on top of that to match the actual load.

---

**Question 3.** With the capacity provider strategy `FARGATE base=2, weight=1; FARGATE_SPOT weight=4` and 10 tasks running, what is the distribution of On-Demand and Spot?

A) 5 On-Demand, 5 Spot
B) 2 On-Demand (base) + the remaining 8 split 1:4 → about 4 On-Demand (2+1.6), about 6 Spot
C) 2 On-Demand, 8 Spot
D) All On-Demand

**Answer: B**
Explanation: base=2 guarantees that the first 2 tasks are always On-Demand. The remaining 8 are distributed in the weight ratio 1:4 — 8/(1+4)=1.6 On-Demand, 6.4 Spot. After rounding, about 2 On-Demand and about 6 Spot. In total about 4 On-Demand and about 6 Spot. AWS maintains a "roughly targeted ratio" rather than an exact ratio, so the actual distribution may differ slightly.

---

**Question 4.** When trying to connect to a running container with ECS Exec, the error "ExecuteCommandAgent is not running" occurs. What is the most likely cause?

A) The task role lacks permissions
B) enableExecuteCommand was set in the task definition, but the service was not updated with --enable-execute-command, or new tasks were not created with --force-new-deployment
C) There is no VPC endpoint
D) The ECS cluster version is too old

**Answer: B**
Explanation: The ECS Exec agent is initialized when a task starts. Even if you set enableExecuteCommand on the service, it does not apply to existing tasks that are already running. You must replace the existing tasks with `--force-new-deployment` so that new tasks start with the ECS Exec agent. A missing enableExecuteCommand in the task definition (which also needs to be checked) or a missing ssmmessages permission in the task role can also be causes, but the specific error "Agent is not running" often appears when new tasks have not yet been created.

---

**Question 5.** In an ECS rolling deployment, new tasks have started but the old tasks are not terminated, so more tasks than the desired count are running. Which ECS service setting controls this behavior?

A) maximumPercent and minimumHealthyPercent
B) desiredCount
C) Capacity Provider Strategy
D) enableExecuteCommand

**Answer: A**
Explanation: `maximumPercent` (default 200%) is the maximum percentage of running tasks during a deployment, and `minimumHealthyPercent` (default 100%) is the minimum percentage of healthy tasks that must be maintained during a deployment. With the default settings, a service with desired=4 can run at most 8 tasks (200%) and at least 4 tasks (100%) during a deployment. To optimize cost, lower maximumPercent to 150%; if availability is the priority, lower minimumHealthyPercent so that more new tasks can be started first and old tasks replaced quickly.

---

**Question 6.** You pushed a new version to ECR with the same image tag (`latest`), but the ECS service is not updated automatically. What is the command to force an update manually?

A) aws ecs update-service --task-definition :latest
B) aws ecs update-service --cluster prod --service checkout --force-new-deployment
C) aws ecs start-task
D) aws ecs run-task

**Answer: B**
Explanation: `--force-new-deployment` forces the ECS service to start new tasks without changing the task definition. When new tasks start they pull the image again, so the newly pushed `latest` image in ECR is used. This approach goes against the IMMUTABLE tag principle (since a different image is used with the same tag), but it is used in urgent situations that need a quick hotfix deployment without changing the tag. In the long term, using commit SHA-based tags is recommended.

---

**Question 7.** What design prevents loss of payment transactions when an ECS Fargate Spot task is suddenly reclaimed?

A) Use only On-Demand instead of Fargate Spot
B) Implement graceful shutdown logic that rejects new requests on receiving SIGTERM and exits after in-flight transactions complete + DB transactions are rolled back automatically through ACID guarantees
C) Save data to local disk before the task terminates
D) Detect the Spot reclamation with CloudWatch Events and recover manually

**Answer: B**
Explanation: Two minutes before a Fargate Spot reclamation, SIGTERM is delivered to the container through the ECS agent. The application handles SIGTERM to (1) respond 503 to new HTTP requests → the load balancer routes to other tasks, (2) wait up to 25 seconds (stopTimeout 30 seconds minus a 5-second margin) for in-flight transactions to complete, and (3) DB transactions either complete or are rolled back automatically through the ACID guarantees of the RDBMS. Local disk (C) disappears when the task terminates, so it has no persistence.

---
