# Day 2 - ECS Automated Deployment: From Task Definition Updates to Auto Scaling

When setting up ECS deployment automation for the first time, people get stuck at two points most often. One is "I pushed a new image to ECR but the ECS Service did not update automatically," and the other is "they say CodeBuild has to generate a different file for Rolling and Blue/Green deployments, so what exactly is different?" Today we start with these two points and then cover the whole of ECS operations automation, including Auto Scaling, Capacity Providers, and ECS Exec.

## The Core of ECS Deployment Automation: The Task Definition Update Flow

An ECS Service manages "which Task Definition revision to run." Deploying a new image is ultimately the process of registering a new Task Definition revision and updating the ECS Service to use that revision.

**Manual approach (a foundation for understanding)**:
```bash
# 1. Push the new image
docker push 111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123

# 2. Get the current Task Definition
aws ecs describe-task-definition --task-definition checkout-prod \
  --query 'taskDefinition' > current-taskdef.json

# 3. Replace the image URI + register a new revision
# (after editing current-taskdef.json)
NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://new-taskdef.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)

# 4. Update the ECS Service
aws ecs update-service \
  --cluster prod \
  --service checkout-service \
  --task-definition $NEW_TASK_DEF_ARN
```

CodePipeline + CodeBuild automate these 4 steps.

## Rolling Deployment vs Blue/Green Deployment: The Difference in File Formats

The CodePipeline ECS Deploy Action has two modes, and the files CodeBuild must output differ in each mode.

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

- The `name` field must exactly match the container name in the Task Definition
- Multiple containers can be updated at once
- The CodePipeline ECS Action reads this file, replaces the image URI in the Task Definition, automatically registers a new revision, and updates the Service

### Blue/Green Deployment (CodeDeploy ECS Provider)

```
CodeBuild → taskdef.json + appspec.yaml + imageDetail.json → Pipeline ECS (Blue/Green) Action
```

`imageDetail.json` format:
```json
{"ImageURI": "111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:abc123"}
```

`taskdef.json` (uses a placeholder for the image URI):
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

The CodePipeline ECS (Blue/Green) Action replaces `<IMAGE1_NAME>` with the ImageURI from imageDetail.json, and replaces `<TASK_DEFINITION>` with the newly registered Task Definition ARN.

> The theoretical basis of Blue/Green deployment is **Zero-Downtime Replacement**. While keeping the existing environment (Blue), you fully prepare the new environment (Green) and then switch traffic instantly by swapping the ALB Target Group. If it fails, you can roll back to Blue immediately (by swapping the Target Group again). Rolling replaces gradually without service interruption but rollback is slow (the new Tasks must be changed back to the previous version). If deployment time matters, choose Rolling; if rollback time matters, choose Blue/Green.

## Generating the Right Files in buildspec.yml

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

> ⚠️ **Trap**: The container name in `taskdef.json` must exactly match the `name` field in `imagedefinitions.json`. If they do not match, a "Container name not found in task definition" error occurs. Also, in a Blue/Green deployment the image URI in `taskdef.json` must use the `<IMAGE1_NAME>` placeholder; if you hardcode the real URI, CodePipeline will not substitute it.

> The difference in file formats between Rolling and Blue/Green comes from the difference in how the two Providers work internally. With the ECS Rolling Provider, CodePipeline calls the ECS API directly to register the Task Definition and update the Service; it is simple API-call automation. With the Blue/Green Provider, CodeDeploy handles the orchestration: CodeDeploy manages the ALB Target Group swap, the deployment hooks (Lambda), the traffic shift percentage, and rollback. For this reason Blue/Green needs `appspec.yaml`, because CodeDeploy reads the deployment hooks and ALB settings from this file. The `<IMAGE1_NAME>` placeholder is replaced by CodePipeline with the real URI from `imageDetail.json`.

> Netflix's ECS deployment strategy. While operating hundreds of ECS services, Netflix differentiates the deployment method by the importance of the service. Critical Path services such as an API Gateway use Blue/Green deployment (instant rollback possible), and internal background jobs (batch processing, email sending) use Rolling deployment (faster deployment). The selection criterion is "is rollback speed more important than deployment speed?" With Blue/Green, rollback is a Target Group swap that takes seconds, but with Rolling a rolling deployment back to the previous image is needed, which takes minutes.

## ECS Service Auto Scaling: How Application Auto Scaling Works

ECS Auto Scaling uses the **Application Auto Scaling** service, not AWS EC2 Auto Scaling. Application Auto Scaling is a unified scaling service that handles scaling for many services besides ECS, such as DynamoDB, Aurora, and SageMaker Endpoints.

```bash
# 1. Register the ECS Service as a scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "service/prod-cluster/checkout-service" \
  --min-capacity 2 \
  --max-capacity 50

# 2. Target Tracking policy (maintain a CPU target of 70%)
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

# 3. Target Tracking based on ALB request count (more responsive)
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

**Comparison of scaling types**:

| Type | How it works | Use case |
|------|-----------|-----------|
| Target Tracking | Keeps a metric at a target value (like a PID controller) | CPU 70%, requests 1000/Target |
| Step Scaling | Different adjustment amounts depending on how far the threshold is exceeded | "CPU 80% → +5, CPU 90% → +10" |
| Scheduled | Time-based pre-scaling | Every lunch, Monday morning |

> Target Tracking in Application Auto Scaling is a simplified version of the **PID Controller (proportional-integral-derivative controller)** from control theory. It computes the error between the measured value (current CPU) and the target value (70%) to determine the adjustment amount. AWS implements only the P (proportional) term as a simple proportional control and adds ScaleIn/Out Cooldown to prevent overshooting (excessive scaling). Implementing a real PID Controller would be more sophisticated, but for most web services simple Target Tracking is enough. For fast bursts (e.g., a flash sale), scaling out in advance with Scheduled Scaling is more effective than Target Tracking, because Target Tracking takes 1-3 minutes to react.

## Capacity Provider Strategy: Combining Spot and On-Demand

A Capacity Provider determines the infrastructure on which ECS Tasks run (Fargate On-Demand, Fargate Spot, EC2 ASG). The Strategy defines the ratio of this infrastructure mix.

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

How to calculate:
- FARGATE with `base: 2` → the first 2 Tasks are always On-Demand FARGATE
- Additional Tasks after that: distributed by weight ratio
  - FARGATE weight=1, FARGATE_SPOT weight=4 → out of 5 total units, On-Demand is 1/5 (20%) and Spot is 4/5 (80%)
- Result: with 10 Tasks → 2 On-Demand (base) + 6.4 On-Demand (by ratio) + 1.6... no, that's not right
- **Exact calculation**: the 2 base Tasks are On-Demand. For the remaining 8, the weight ratio is 1:4 → 1.6 On-Demand → rounded = 2, 6.4 Spot → 6. In practice, Tasks are allocated one by one to match the ratio.

```bash
# Apply a Capacity Provider Strategy to an ECS Service
aws ecs create-service \
  --cluster prod-cluster \
  --service-name checkout-service \
  --task-definition checkout-prod:10 \
  --desired-count 5 \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=2 \
    capacityProvider=FARGATE_SPOT,weight=4

# Update an existing service
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=2 \
    capacityProvider=FARGATE_SPOT,weight=4 \
  --force-new-deployment
```

**Essential considerations when using Fargate Spot**:
- SIGTERM is delivered 2 minutes before the Spot capacity is reclaimed
- The ECS Agent sends SIGTERM to the Task, and once `stopTimeout` (default 30 seconds) passes, SIGKILL
- The application must perform a graceful shutdown when it receives SIGTERM (finish in-flight HTTP requests, clean up DB connections)
- Suitable only for stateless workloads: the 12-factor app principle of keeping state in external storage (RDS, ElastiCache, S3)

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
        # Logic to wait for in-flight requests to finish
        asyncio.get_event_loop().create_task(self._graceful_exit())
    
    async def _graceful_exit(self):
        # Start rejecting new requests
        # Wait up to 25 seconds for in-flight requests to finish (before the 30-second SIGKILL)
        await asyncio.sleep(25)
```

> The 2020 case of Lyft adopting ECS Fargate Spot. Lyft adopted Fargate Spot for irregular batch jobs (data processing, report generation) and cut compute cost by 60%. The key was designing the jobs in a **checkpoint** style: when Spot capacity is reclaimed, the progress state is saved to S3, and a new Task is implemented to restart from the checkpoint. This pattern can appear in DOP-C02 under the keywords "Spot usage + fault-tolerant design."

## ECS Exec: Debugging Containers Without a Bastion

ECS Exec is a feature that connects directly to a running container through AWS Systems Manager Session Manager. No SSH Bastion is needed, and it works even without EC2 instances.

**Activation conditions (all three are required)**:

1. `enableExecuteCommand: true` in the Task Definition
2. SSM Session Manager permissions on the Task Role
3. A Service update to create new Tasks

```bash
# 1. Add SSM permissions to the Task Role
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

# 2. Enable enableExecuteCommand in the Task Definition (a new revision must be registered)
# CloudFormation:
# Properties:
#   EnableExecuteCommand: true

# 3. Update the Service (does not apply to existing Tasks, only to new Tasks)
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --enable-execute-command \
  --force-new-deployment

# 4. Connect to the container
aws ecs execute-command \
  --cluster prod-cluster \
  --task arn:aws:ecs:ap-northeast-2:111:task/prod-cluster/abc123 \
  --container checkout \
  --interactive \
  --command "/bin/sh"
```

> ⚠️ **Trap**: ECS Exec cannot be enabled on a Task that is already running. Even if you set `--enable-execute-command` on the Service, it does not apply to Tasks that are already running; you must create new Tasks with `--force-new-deployment`. Also, in an environment without VPC Endpoints you must reach the SSM API over the internet, so to use ECS Exec in a private subnet you need the `ssm.amazonaws.com`, `ssmmessages.amazonaws.com`, and `s3.amazonaws.com` VPC Endpoints.

> The ALB RequestCountPerTarget metric for ECS Auto Scaling is often a better scaling signal than CPU/Memory. The problem with CPU-based scaling is that "the moment CPU rises = the moment the system is already under pressure," so the reaction is late. ALB request counts, on the other hand, rise before CPU rises (before requests pile up and CPU processing is delayed). Setting a target of 1000 requests/target means "each Task handles 1000 RPS on average," and the number of Tasks is adjusted automatically to maintain this target. For services with predictable traffic patterns (a lunchtime traffic surge), the combination of a Scheduled Action + Target Tracking is most effective: Scheduled scales out in advance and Target Tracking fine-tunes.

> 🎯 **Scenario**: An e-commerce service is anticipating Black Friday traffic. Normally 5 Tasks handle 1,000 RPS, and 50,000 RPS is expected on Black Friday. Problem: with Target Tracking alone, when traffic surges suddenly, the service is overloaded during the scale-out reaction time (1-3 minutes). Solution: (1) 10 minutes before Black Friday, scale out in advance with a Scheduled Action to MinCapacity=100, (2) Target Tracking fine-tunes to actual traffic, (3) after the event ends, restore MinCapacity=5 with a Scheduled Action, (4) optimize cost with a Capacity Provider Strategy of base=10 On-Demand + a Spot ratio. Pre-scaling (Predictive Scaling) is more effective than reactive scaling during a traffic surge.

## Container Insights: ECS Operational Visibility

Container Insights is a feature that automatically collects ECS cluster-, service-, and Task-level metrics into CloudWatch.

```bash
# Enable at the cluster level
aws ecs update-cluster-settings \
  --cluster prod-cluster \
  --settings name=containerInsights,value=enabled
```

Metrics collected:
- `CpuUtilized`, `CpuReserved`, `MemoryUtilized`, `MemoryReserved` (at each of the Task/Service/Cluster levels)
- `NetworkRxBytes`, `NetworkTxBytes`
- `StorageReadBytes`, `StorageWriteBytes`
- `RunningTaskCount`, `DesiredTaskCount`, `PendingTaskCount`
- `DeploymentCount`

Collection cost: CloudWatch custom metric pricing ($0.30/metric/month) + CloudWatch Logs pricing. Even a small cluster can add tens of dollars per month, so estimate the cost before enabling it.

Real-time analysis with CloudWatch Logs Insights:
```
# Find Tasks with memory utilization of 90% or more
fields @timestamp, ServiceName, TaskId, MemoryUtilized, MemoryReserved
| filter Type="Task" and (MemoryUtilized / MemoryReserved * 100) > 90
| sort @timestamp desc
| limit 20
```

## force-new-deployment: Deploying a New Image Under the Same Tag

It is used in the pattern of keeping the image tag fixed, such as `latest`, changing only the contents, and redeploying. It creates new Tasks without changing the Task Definition revision, so the image is pulled again.

```bash
aws ecs update-service \
  --cluster prod-cluster \
  --service checkout-service \
  --force-new-deployment
```

This approach conflicts with the IMMUTABLE tag principle. **Recommended pattern**: always use a commit-SHA-based tag and use a new tag for every new image. This way you can trace exactly which image a Task Definition revision uses, and you do not have to depend on `--force-new-deployment`.

## Real-World Architecture: The Full CodePipeline + ECS Flow

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
  │     ├── generate imagedefinitions.json
  │     └── outputs: BuildArtifact
    ↓
Stage: Test
  ├── Action: IntegrationTest (CodeBuild)
  │     └── staging environment smoke test
    ↓
Stage: Deploy-Staging
  ├── Action: DeployStaging (ECS Rolling)
  │     └── imagedefinitions.json → update the staging ECS Service
    ↓
Stage: Approve
  ├── Action: ManualApproval → SNS → Chatbot → Slack
    ↓
Stage: Deploy-Prod
  ├── beforeEntry: CloudWatch Alarm Check (error rate < 1%)
  ├── Action: DeployProd (ECS Blue/Green via CodeDeploy)
  │     ├── taskdef.json + appspec.yaml + imageDetail.json
  │     └── ALB Target Group swap (zero-downtime)
  └── onSuccess: PostDeploy Health Check (5 minutes)
```

> 🎯 **Scenario**: An e-commerce company runs its payment service on ECS Fargate. Requirements: (1) prod deployment must be zero-downtime, (2) automatic scaling during traffic surges, (3) use Spot to optimize cost, (4) no loss of payment transactions when Spot capacity is reclaimed. Design: Blue/Green deployment (ECS CodeDeploy Action) for zero-downtime. A Capacity Provider Strategy of base=2 On-Demand + Spot at weight 4:1. When a Fargate Spot reclaim SIGTERM is received, reject new payment requests (HTTP 503) + finish in-flight transactions and then exit (within 25 seconds). DB transactions are automatically rolled back on Spot reclaim thanks to Aurora's ACID guarantee.

## Wrapping Up

In ECS deployment automation, the difference in file formats between the two deployment modes is the fork in the road. Rolling uses `imagedefinitions.json`; Blue/Green uses `taskdef.json + appspec.yaml + imageDetail.json (the <IMAGE1_NAME> placeholder)`. Auto Scaling adjusts the ECS Service's DesiredCount through the Application Auto Scaling service. The base+weight calculation of the Capacity Provider Strategy determines the On-Demand/Spot ratio. ECS Exec needs all three at the same time: the Task Definition + the Task Role + a Service update.

---

## 📝 Practice Questions

**Question 1.** In an ECS Blue/Green deployment, what combination of files must CodeBuild output?

A) imagedefinitions.json only
B) taskdef.json + appspec.yaml + imageDetail.json (the image URI in taskdef.json is the `<IMAGE1_NAME>` placeholder)
C) buildspec.yml + Dockerfile
D) template.yaml + parameters.json

**Answer: B**
Explanation: A Blue/Green deployment (CodeDeploy ECS Provider) needs three files. In `taskdef.json` the container image URI is the `<IMAGE1_NAME>` placeholder, and `imageDetail.json` holds the actual image URI. `appspec.yaml` defines the CodeDeploy deployment hooks (BeforeInstall, AfterInstall, and so on) and the ALB settings. A Rolling deployment needs only one file, `imagedefinitions.json`.

---

**Question 2.** In ECS Service Auto Scaling, how do you implement the requirement "set the minimum Task count to 10 at 9 AM on weekdays and reduce it back to 2 at 6 PM"?

A) Create hourly alarms with CloudWatch Alarms
B) Set a cron schedule with an Application Auto Scaling Scheduled Action
C) Run Lambda every hour to call update-service
D) Manually change the ECS Service's desiredCount every day

**Answer: B**
Explanation: A Scheduled Action is the exact tool for this requirement: MinCapacity=10 at `cron(0 0 * * MON-FRI *)` (UTC 00:00 = KST 09:00), and MinCapacity=2 at `cron(0 9 * * MON-FRI *)` (UTC 09:00 = KST 18:00). When Target Tracking and Scheduled Actions are used together, the Scheduled Action raises MinCapacity to guarantee a minimum Task count, and Target Tracking handles additional scaling on top of that to match the actual load.

---

**Question 3.** With the Capacity Provider Strategy `FARGATE base=2, weight=1; FARGATE_SPOT weight=4`, what is the distribution of On-Demand and Spot when 10 Tasks are running?

A) 5 On-Demand, 5 Spot
B) 2 On-Demand (base) + the remaining 8 at a 1:4 ratio → On-Demand ~4 (2+1.6), Spot ~6
C) 2 On-Demand, 8 Spot
D) All On-Demand

**Answer: B**
Explanation: base=2 guarantees that the first 2 Tasks are always On-Demand. The remaining 8 are distributed at the weight ratio 1:4: 8/(1+4)=1.6 On-Demand and 6.4 Spot. After rounding, about 2 On-Demand and about 6 Spot. The total is On-Demand ~4 and Spot ~6. Since AWS maintains a "rough ratio target" rather than an exact ratio, the actual distribution may differ slightly.

---

**Question 4.** When trying to connect to a running container with ECS Exec, an "ExecuteCommandAgent is not running" error occurs. What is the most likely cause?

A) The Task Role has no permissions
B) enableExecuteCommand was set in the Task Definition, but the Service was not updated with --enable-execute-command or new Tasks were not created with --force-new-deployment
C) There is no VPC endpoint
D) The ECS cluster version is low

**Answer: B**
Explanation: The ECS Exec Agent is initialized when a Task starts. Even if you set enableExecuteCommand on the Service, it does not apply to existing Tasks that are already running. You must replace the existing Tasks with `--force-new-deployment` so that new Tasks start with the ECS Exec Agent. The cause could also be that enableExecuteCommand is missing from the Task Definition (this also needs checking) or that the Task Role lacks ssmmessages permissions, but the specific error "Agent is not running" often appears when new Tasks have not been created yet.

---

**Question 5.** In an ECS Rolling deployment, new Tasks have started but the old Tasks have not stopped, so more Tasks than the desired count are running. Which ECS Service setting controls this behavior?

A) maximumPercent and minimumHealthyPercent
B) desiredCount
C) Capacity Provider Strategy
D) enableExecuteCommand

**Answer: A**
Explanation: `maximumPercent` (default 200%) is the maximum percentage of Tasks that can run during a deployment, and `minimumHealthyPercent` (default 100%) is the minimum percentage of healthy Tasks that must be maintained during a deployment. With the default settings, a service with desired=4 can have up to 8 (200%) and at least 4 (100%) Tasks running during a deployment. To optimize cost, lower maximumPercent to 150%; if availability is the priority, lower minimumHealthyPercent so you can start more new Tasks first and replace the old Tasks quickly.

---

**Question 6.** You pushed a new version to ECR under the same image tag (`latest`), but the ECS Service did not update automatically. What is the command to force a manual update?

A) aws ecs update-service --task-definition :latest
B) aws ecs update-service --cluster prod --service checkout --force-new-deployment
C) aws ecs start-task
D) aws ecs run-task

**Answer: B**
Explanation: `--force-new-deployment` forces the ECS Service to start new Tasks without changing the Task Definition. Since the image is pulled again when a new Task starts, the `latest` image newly pushed to ECR is used. This approach goes against the IMMUTABLE tag principle (because a different image is used under the same tag), but it is used in urgent situations that need a quick hotfix deployment without changing the tag. In the long term, using commit-SHA-based tags is recommended.

---

**Question 7.** What design prevents loss of payment transactions when an ECS Fargate Spot Task is suddenly reclaimed?

A) Use only On-Demand instead of Fargate Spot
B) Implement graceful shutdown logic that rejects new requests on SIGTERM and exits after finishing in-flight transactions + DB transactions roll back automatically through the ACID guarantee
C) Save the data to the local disk before the Task terminates
D) Detect the Spot reclaim with CloudWatch Events and recover manually

**Answer: B**
Explanation: 2 minutes before Fargate Spot reclaim, SIGTERM is delivered to the container through the ECS Agent. The application handles SIGTERM to (1) respond 503 to new HTTP requests → the load balancer routes to other Tasks, (2) wait up to 25 seconds (stopTimeout 30 seconds - 5 seconds margin) for in-flight transactions to finish, and (3) DB transactions either complete or roll back automatically through the RDBMS's ACID guarantee. The local disk (C) disappears when the Task terminates, so it has no persistence.

---

