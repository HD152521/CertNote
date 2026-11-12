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

## 📝 Practice Questions

**Question 1.** Which deployment controller must be configured to use a Blue/Green deployment on an ECS service?

A) `ECS`
B) `CODE_DEPLOY`
C) `EXTERNAL`
D) `FARGATE`

**Answer: B**
Explanation: ECS Blue/Green must use the `CODE_DEPLOY` controller. The default `ECS` controller supports only rolling updates. `EXTERNAL` is used when an external system such as App Mesh controls traffic. `FARGATE` is a launch type, not a controller. Also remember that once the controller is specified when creating an ECS service, it cannot be changed afterward.

---

**Question 2.** How do you implement automatic rollback in an ECS rolling update?

A) Additionally create a CodeDeploy application
B) Set `deploymentCircuitBreaker={enable=true,rollback=true}`
C) Periodically check the status with a Lambda function
D) Use CloudFormation rollback

**Answer: B**
Explanation: ECS own deployment circuit breaker is the automatic rollback mechanism for rolling updates. If new tasks fail health checks consecutively, the circuit breaker detects this and automatically rolls back to the previous task definition. Adding CodeDeploy (A) would switch to Blue/Green, which changes the controller. CloudFormation rollback (D) is a rollback of infrastructure provisioning, not a deployment rollback.

---

**Question 3.** What is the role of the test listener in an ECS Blue/Green deployment?

A) Reducing load balancer cost
B) Exposing test traffic on a separate port to the new task set before production traffic is exposed, for pre-validation
C) Performing health checks on the Blue task set
D) Reporting deployment completion to CodeDeploy

**Answer: B**
Explanation: The test listener is optional, but if present, the `AfterAllowTestTraffic` hook lets you validate the new task set separately before it receives production traffic. For example, test the new version on port 8443 that only the internal team can access, and once validation is complete, proceed with the production traffic shift. A Blue/Green deployment works normally even without a test listener.

---

**Question 4.** What is the role of the `<IMAGE1_NAME>` placeholder in the CodePipeline ECS (Blue/Green) action?

A) Specifies the ECS cluster name
B) It is automatically replaced with the actual ECR image URI at the container image URI position in taskdef.json
C) Specifies the target group name
D) Specifies the CodeDeploy application name

**Answer: B**
Explanation: The imageUri value in the `imagedefinitions.json` generated by CodeBuild is substituted through the pipeline at the `<IMAGE1_NAME>` position in `taskdef.json`. Thanks to this automatic substitution, a new image tag (usually the git SHA) is reflected in the task definition on every build, a new revision is registered, and the Blue/Green deployment starts. The placeholder format must be exactly `<IMAGE1_NAME>`.

---

**Question 5.** In an ECS Blue/Green deployment, 45 minutes of the 60-minute termination wait time have passed. A serious bug was found in the new version. What is the fastest way to restore service?

A) Start a new deployment with the previous task definition (takes 15 to 20 minutes)
B) Stop Deployment + Rollback that deployment from the CodeDeploy console or CLI → instantly restores the Blue task set
C) Reduce the ECS service desired count to 0 and then restore
D) Manually change the ALB listener rule to the Blue target group

**Answer: B**
Explanation: The 60-minute termination wait time has not yet ended, so the Blue task set is still alive. CodeDeploy Stop Deployment + Rollback instantly switches ALB traffic to the Blue target group and terminates the Green task set. Restoration within tens of seconds is possible. If the wait time has passed and the Blue task set has already been terminated, B is not possible and A (redeploying with the previous task definition) is needed.

---

**Question 6.** What is the behavior of `minimumHealthyPercent=100, maximumPercent=200` in an ECS rolling update?

A) Replace half at a time (terminate 50% of old, then start 50% of new)
B) Keep the old tasks and launch the new tasks first (200% total), then terminate the old tasks after the new tasks pass health checks (surge pattern)
C) Replace all tasks at once
D) Replace one at a time in sequence

**Answer: B**
Explanation: `minimumHealthyPercent=100` means at least 100% of tasks must be healthy even during the deployment. `maximumPercent=200` means the number of tasks can grow to at most 200%. The result is a surge pattern: "launch all the new tasks (200%), then remove the old tasks after validation (returning to 100%)." It deploys without downtime, but EC2/Fargate cost is temporarily doubled.

---

**Question 7.** Which of the following is not required in an ECS Blue/Green deployment group configuration?

A) Two target groups (Blue, Green)
B) Production Listener
C) Test Listener
D) CodeDeploy Service Role

**Answer: C**
Explanation: The test listener is optional. The production listener (which switches traffic between the two target groups) and the two target groups are the core components of Blue/Green and are therefore required. The CodeDeploy service role is required for permission to call the ECS and ALB APIs. The test listener is an optional feature for pre-validating the new version on an additional port. This distinction appears repeatedly on the exam.

---
