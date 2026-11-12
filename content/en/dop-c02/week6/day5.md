# Day 5 - Week 6 Review + 12 Scenario Practice Problems

📅 Date: Week 6 (Day 5)  
Topic: Container CI/CD Integration Scenario Review

---

## Week 6 Core Concept Map

Week 6 covers container image management (ECR) through orchestrator deployment (ECS/EKS) to fully abstracted platform (App Runner)—entire container CI/CD stack. Core flow is "Build → Store → Deploy → Scale → Observe," and AWS service selection criteria at each layer is exam core.

```
Code change
  ↓
CodeBuild (build + image creation)
  ↓
ECR (store + scan + lifecycle)
  ↓
┌──────────────────────────────────────┐
│  Deployment Target Selection         │
│  ECS Rolling     → imagedefinitions  │
│  ECS Blue/Green  → taskdef+appspec   │
│  EKS GitOps      → manifests repo    │
│  App Runner      → source/image      │
└──────────────────────────────────────┘
  ↓
Auto Scaling (Capacity Provider / HPA / Karpenter)
  ↓
Observe (Container Insights / Prometheus / Security Hub)
```

> 💡 **Related Theory: Abstraction Spectrum**
>
> Container platforms arrange by abstraction level:
>
> ```
> Low Abstraction (High Control)  →  High Abstraction (Low Operations)
> EC2 → ECS EC2 → ECS Fargate → App Runner → Lightsail Containers
> ```
>
> When exam keywords "small operations team," "no infrastructure knowledge," "fast launch" appear, choose spectrum right. Conversely, "fine network control," "custom runtime," "GPU workload" lean spectrum left.
>
> **Trap**: Lightsail Containers looks spectrum far-right but **lacks auto-scaling**. For traffic-variable services, choose App Runner.

---

## Week 6 Core Comparison Summary Table

### 1. ECR Scanning Methods Comparison

| Item | Basic Scanning | Enhanced Scanning |
|------|---------------|-------------------|
| Engine | AWS native | Amazon Inspector |
| Target | OS packages | OS + language dependencies (npm/pip/gem) |
| Trigger | Push once | Push + CONTINUOUS_SCAN (ongoing) |
| Security Hub | Not integrated | Integrated (Finding auto-creation) |
| SBOM | Not supported | Supported |
| Cost | Free | Inspector charge |
| Exam Keyword | "Simple vulnerability check" | "Dependency CVE," "continuous monitoring," "Security Hub" |

### 2. ECS Deployment Method File Requirements

| Deployment Method | CodePipeline Output | Core File | Selection Criteria |
|-----------|-------------------|-----------|-----------|
| Rolling (CodePipeline ECS) | imagedefinitions.json | `[{"name":"app","imageUri":"..."}]` | Simple, downtime allowed |
| Blue/Green (CodeDeploy) | taskdef.json + appspec.yaml + imageDetail.json | `<IMAGE1_NAME>` placeholder | Zero-downtime, traffic control |

> 💡 **Related Theory: Rolling vs Blue/Green Internal Mechanisms**
>
> Rolling: CodePipeline directly manipulates ECS Service `desired count`, single orchestrator (ECS) replacing Tasks. Blue/Green: CodeDeploy manages ALB Target Group switching—separate orchestrator layer exists.
>
> ```
> Rolling:   CodePipeline → ECS Service API (direct)
> Blue/Green: CodePipeline → CodeDeploy → ALB (Target Group switch) → ECS
> ```
>
> Blue/Green's `appspec.yaml` `TaskDefinition: <TASK_DEFINITION>` is placeholder where CodeDeploy injects new Task Definition ARN. `imageDetail.json` image URI is where CodeBuild substitutes actual URI into `<IMAGE1_NAME>` placeholder. Understanding this two-stage substitution prevents file-content problems.

### 3. ECS Auto Scaling Mechanisms

| Method | API | Metric | Use Scenario |
|--------|-----|--------|--------------|
| Target Tracking | Application Auto Scaling | CPU/memory/ALBRequestCountPerTarget | General web API |
| Step Scaling | Application Auto Scaling | CloudWatch Alarm | Non-linear traffic pattern |
| Scheduled Action | Application Auto Scaling | Time-based | Predictable peaks (Black Friday) |
| Capacity Provider | ECS-specific | FARGATE/FARGATE_SPOT | Cost optimization (Spot blending) |

### 4. EKS vs ECS Deployment Comparison

| Item | ECS | EKS |
|------|-----|-----|
| CodeDeploy Support | Supported (Blue/Green) | Not supported |
| Preferred Deployment | CodePipeline + CodeDeploy | GitOps (ArgoCD/Flux) |
| Permission Management | Task Role (IAM) | IRSA / Pod Identity |
| Auto-scaling Nodes | ECS Capacity Provider | Cluster Autoscaler / Karpenter |
| Configuration File Format | imagedefinitions / taskdef | Kubernetes Manifest YAML |

### 5. App Runner Core Distinction

| Role | IAM Role | Purpose |
|------|----------|---------|
| ECR image pull | Access Role | ECR auth, assumed by AWS |
| App code AWS API call | Instance Role | S3/DynamoDB, etc app runtime |

> 💡 **Related Theory: App Runner Two IAM Role Separation Principle**
>
> Access Role is assumed by App Runner service (AWS control plane) pulling images from ECR. This is ECS Task Execution Role equivalent. Instance Role is assumed by application code executing in container calling AWS SDK—ECS Task Role equivalent.
>
> This separation practices Principle of Least Privilege. ECR pull permission separated from app code execution permission means app code vulnerability doesn't compromise ECR access.

### 6. GitOps Tool Comparison

| Item | ArgoCD | Flux |
|------|--------|------|
| Operation | Git → Cluster (Pull) | Git → Cluster (Pull) |
| selfHeal | syncPolicy.automated.selfHeal | Default-enabled |
| UI | Web dashboard | CLI-centered |
| Auto Image Update | argocd-image-updater | Flux Image Automation |
| Exam Preference | Scenario problems frequent | Comparison problems frequent |

> 🔍 **Deep Dive: GitOps Pull Model Security Advantage**
>
> Traditional Push deployment (CI/CD → kubectl apply): Pipeline must directly hold cluster API access (kubeconfig). This poses exposure risk; compromised pipeline exposes entire cluster.
>
> GitOps Pull model: ArgoCD/Flux runs inside cluster, periodically polls Git. Pipeline only needs Git commit permission; cluster credentials stay internal, never exposed. Git commit history automatically becomes deployment audit log (Audit Trail).
>
> ```
> Push model: CI/CD → [kubeconfig required] → Kubernetes API
> Pull model: CI/CD → Git Repo ← ArgoCD (cluster internal)
> ```
>
> IRSA (IAM Roles for Service Accounts) enables ArgoCD or Flux to access ECR or manipulate AWS resources at Pod level in this model. OIDC provider connects EKS cluster with IAM for ServiceAccount → IAM Role mapping.

---

## Core Trigger Pattern Summary

> ⚠️ **Trap: ECR Image Tag Mutability**
>
> Setting `imageTagMutability: IMMUTABLE` in ECR prevents re-pushing with same tag. This is intentional security policy, but causes CI/CD push failure when using `latest` tag or branch name as tag.
>
> Correct pattern: **IMMUTABLE + unique tag usage** (commit SHA, build number, timestamp)
>
> ```
> # Wrong pattern (fails in IMMUTABLE environment)
> docker tag myapp:latest 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:latest
>
> # Correct pattern
> docker tag myapp:latest 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:${CODEBUILD_RESOLVED_SOURCE_VERSION}
> ```
>
> Exam trap: "Image redeployed but ECS doesn't fetch latest" → `force-new-deployment` might be needed, but root cause is unchanged tag. IMMUTABLE + unique tag is root solution.

> 💡 **Related Theory: ECR Lifecycle Policy and Storage Cost Optimization**
>
> ECR charges $0.10/GB/month. Active CI/CD pipelines push dozens daily, so storage cost grows linearly without Lifecycle Policy.
>
> Lifecycle Policy priority rules:
> - Lower numbers evaluated first (priority 1 → 2 → ...)
> - `tagStatus: tagged` + `tagPrefixList` preserves specific tag patterns
> - `countType: sinceImagePushed` deletes by days
> - `countType: imageCountMoreThan` retains by count
>
> ```json
> {
>   "rules": [
>     {
>       "rulePriority": 1,
>       "description": "Preserve production tag forever",
>       "selection": {"tagStatus": "tagged", "tagPrefixList": ["prod-"]},
>       "action": {"type": "expire"}
>     },
>     {
>       "rulePriority": 2,
>       "description": "Delete untagged after 1 day",
>       "selection": {"tagStatus": "untagged", "countType": "sinceImagePushed", "countNumber": 1},
>       "action": {"type": "expire"}
>     }
>   ]
> }
> ```

> 🔍 **Deep Dive: Karpenter vs Cluster Autoscaler Selection Criteria**
>
> Cluster Autoscaler: ASG-unit node add/remove. ASG predefined instance types/AZ combinations limit flexibility. Pod request mismatching ASG instance type causes scale-out failure or inefficiency.
>
> Karpenter: Analyzes pending Pod resource request, **selecting real-time optimal instance type**. Bypasses ASG, directly calls EC2 RunInstances. Average scale speed ~30-60 seconds vs Cluster Autoscaler's 2-4 minutes.
>
> ```
> Cluster Autoscaler:
>   Pod pending → ASG query → Launch Template-based instance type (fixed)
>
> Karpenter:
>   Pod pending → Pod resource/selector analysis → optimal instance type calculation → EC2 direct provisioning
> ```
>
> **Exam selection**: "Various instance types," "fast scale," "Spot optimization" → Karpenter. "Existing ASG reuse," "simple config" → Cluster Autoscaler.

> 📚 **Case: Netflix's Deployment Strategy Differentiation**
>
> Netflix differentiates deployment strategy by microservice importance. Critical Path services (payment, user auth) use Blue/Green for seconds-level rollback guarantee. Background services (recommendation, A/B testing) use Rolling to save cost.
>
> This strategy stems from trade-off analysis: "Applying same deployment policy everywhere chooses either excessive cost or insufficient safety." When "rollback speed critical" keyword appears in exam, choose Blue/Green; "cost reduction" priority → Rolling.

> 📚 **Case: Notion's App Runner Migration**
>
> Notion migrated ECS Fargate internal microservices to App Runner. Motivation: "New service deployment manual configuration (Task Definition, Service, Load Balancer, Target Group, security group) consumed operational burden."
>
> Post App Runner: New service addition time shortened from 1-2 days to 1-2 hours. However, VPC Connector (outbound) and Private Ingress (inbound) setup required separate configuration understanding.

> ⚠️ **Trap: VPC Connector vs Private Ingress Confusion**
>
> App Runner's VPC connectivity has two independent settings confusing on exam:
>
> ```
> VPC Connector (outbound):
>   App Runner → VPC resources (RDS, ElastiCache, internal ALB)
>   Config: VpcConnectorConfiguration
>   Use: App accessing VPC DB
>
> Private Ingress (inbound):
>   VPC internal → App Runner service
>   Config: IngressConfiguration.IsPubliclyAccessible = false
>   Use: VPC-internal-only private API
> ```
>
> Exam trap pattern: "VPC-internal-only access?" → Private Ingress (not VPC Connector). "App Runner accessing VPC RDS?" → VPC Connector (not Private Ingress).

> 🎯 **Scenario: Early-Stage Startup Infrastructure Selection**
>
> Situation: 3-developer startup, 5 backend APIs, no operations staff, 6-month launch goal.
>
> Optimal config:
> - App Runner (deployment target)—no ECS/EKS operations knowledge needed
> - ECR (image store)—App Runner native integration
> - Access Role (ECR pull) + Instance Role (DynamoDB access) separation
> - VPC Connector for RDS access, RDS Proxy for connection pooling
> - Enhanced Scanning for dependency CVE auto-detection
>
> Should NOT choose:
> - EKS: Kubernetes operations expert needed
> - Lightsail Containers: No auto-scaling—traffic spike causes outage
> - EC2: AMI management, patching, scaling all manual

> 🎯 **Scenario: Large-Scale EKS Multi-team GitOps Environment**
>
> Situation: 20 teams, 3 EKS clusters (dev/staging/prod), independent team deployment with prod approval requirement.
>
> Optimal config:
> - ArgoCD ApplicationSet auto-creates Application per team
> - dev/staging: syncPolicy.automated.selfHeal: true (auto-sync)
> - prod: manual sync + Slack notification (approval then ArgoCD UI Sync)
> - IRSA per team ServiceAccount minimal-permission IAM Role mapping
> - ECR Repository Policy cross-account pull allowance per team
> - argocd-image-updater auto-updates dev environment image tags
>
> This config makes Git single source of truth; ArgoCD selfHeal auto-corrects drift; all changes auditable via Git commit.

---

## Week 6 Core Keywords → Answer Mapping

> 💡 **Related Theory: DOP-C02 Exam Keyword Recognition Pattern**
>
> DOP-C02 exams emphasize keyword recognition. Specific words immediately map to answer service/setting:
>
> | Keyword | Answer Service/Config |
> |---------|---------------------|
> | "npm/pip dependency CVE" | ECR Enhanced Scanning |
> | "Continuous monitoring," "Security Hub" | Enhanced Scanning + CONTINUOUS_SCAN |
> | "Docker Hub Rate Limit" | ECR Pull Through Cache |
> | "Same tag re-push prevention" | imageTagMutability: IMMUTABLE |
> | "ECS zero-downtime" | Blue/Green (CodeDeploy) |
> | "imagedefinitions.json" | ECS Rolling deployment |
> | "appspec.yaml," "taskdef.json" | ECS Blue/Green deployment |
> | "Self-healing," "Git source truth" | ArgoCD/Flux GitOps |
> | "Cluster operator arbitrary change auto-recovery" | selfHeal: true |
> | "ECR image → EKS auto-deploy" | argocd-image-updater |
> | "Pod-level minimum permission" | IRSA |
> | "Spot 80% + On-Demand guarantee" | Capacity Provider Strategy (base/weight) |
> | "Operations 1 person, fast launch" | App Runner |
> | "Lightsail auto-scaling" | Impossible—exam trap |
> | "VPC → App Runner access" | Private Ingress (not VPC Connector) |
> | "App Runner → VPC DB" | VPC Connector |
> | "ECR pull + app code permission separation" | Access Role + Instance Role |

---

## Week 6 Core Checklist

**ECR**
- [ ] Basic vs Enhanced Scanning (OS-only vs dependency+continuous)
- [ ] SBOM, Security Hub integration Enhanced-only
- [ ] Lifecycle Policy priority evaluation order (lower number first)
- [ ] imageTagMutability: IMMUTABLE → same tag re-push impossible
- [ ] Pull Through Cache → Docker Hub Rate Limit solution
- [ ] Cross-Region Replication: per-region ECR independent (manual config needed)

**ECS Deployment**
- [ ] Rolling: `imagedefinitions.json` → `[{"name":"container","imageUri":"image"}]`
- [ ] Blue/Green: `taskdef.json` + `appspec.yaml` + `imageDetail.json`
- [ ] imageDetail.json URI → taskdef.json `<IMAGE1_NAME>` substitution
- [ ] `force-new-deployment` → same tag image force-redeploy
- [ ] ECS Exec: Task Definition enableExecuteCommand + Task Role + Service update (3 elements)

**ECS Auto Scaling**
- [ ] Application Auto Scaling API (Target Tracking / Step / Scheduled)
- [ ] ALBRequestCountPerTarget → leading CPU indicator (web API recommended)
- [ ] Capacity Provider: base = minimum guarantee, weight = ratio
- [ ] FARGATE_SPOT: 2-minute warning before reclaim → Spot-safe workload only

**EKS GitOps**
- [ ] EKS no CodeDeploy → GitOps or helm upgrade
- [ ] ArgoCD: syncPolicy.automated.selfHeal: true, prune: true
- [ ] argocd-image-updater: ECR push → manifests repo auto-commit → ArgoCD sync
- [ ] IRSA: EKS OIDC + IAM Role → ServiceAccount mapping (Pod-level permission)
- [ ] Karpenter: no ASG; optimal instance type direct provisioning

**App Runner**
- [ ] Access Role: ECR pull (Task Execution Role equivalent)
- [ ] Instance Role: app code AWS API (Task Role equivalent)
- [ ] MaxConcurrency: concurrent request count-based scale (not CPU-based)
- [ ] VPC Connector: outbound (App Runner → VPC)
- [ ] Private Ingress: inbound (VPC → App Runner)
- [ ] Lightsail Containers: no auto-scaling

---

## 12 Real-World Scenario Practice Problems

### Problem 1

You are trying to pull an ECR Private image in an EKS cluster, but the Pod is in `ImagePullBackOff` state. Which is the most appropriate cause and fix?

A) Add `ecr:GetAuthorizationToken` and `ecr:BatchGetImage` permissions to the EKS Node IAM Role, or grant ECR permissions to the ServiceAccount through IRSA. For cross-account ECR, add the source account to the ECR Repository Policy

B) Increase the Pod CPU/memory Limit

C) Add GPU instances to the Karpenter NodePool

D) Modify the Helm Chart's values.yaml

**Answer: A**

Explanation: `ImagePullBackOff` is first and foremost caused by insufficient image pull permission. In EKS, ECR access uses either the Node IAM Role (shared by all Pods) or IRSA (individual per-Pod permissions). For cross-account ECR, you must additionally allow the source account explicitly in the ECR Repository Policy. A typo in the image name or a nonexistent tag shows the same symptom, so also verify the URI.

---

### Problem 2

When a commit occurs in the GitHub manifests repository, it must be reflected automatically in EKS, and resources changed arbitrarily by a cluster operator must also be restored automatically. What is the most appropriate configuration?

A) CodePipeline → automatic `helm upgrade`

B) Set `syncPolicy.automated: {selfHeal: true, prune: true}` on the ArgoCD Application

C) EventBridge + Lambda → `kubectl apply`

D) CodeDeploy EC2 deployment group

**Answer: B**

Explanation: To keep Git as the Single Source of Truth and automatically restore the cluster when its state drifts from Git, you need the GitOps Pull model. ArgoCD's `selfHeal: true` automatically resyncs when the cluster state differs from Git, and `prune: true` also deletes from the cluster resources that were deleted from Git. The CodePipeline/Lambda approaches are Push models and lack continuous drift detection and automatic recovery.

---

### Problem 3

When an image is pushed to ECR, the EKS Pods must be replaced with the new image automatically. What is the configuration of a fully automated GitOps pipeline?

A) ECR push → `argocd-image-updater` commits the new image tag to the manifests repository → ArgoCD syncs automatically → Pods replaced

B) A Lambda polls the ECR API every minute → runs `kubectl set image` when a new image is detected

C) Run `helm upgrade` directly in CodeBuild

D) ECR Event → SNS → CodeDeploy trigger

**Answer: A**

Explanation: `argocd-image-updater` monitors the ECR repository and, on detecting a new image tag, automatically creates a commit that updates the image tag in the Kubernetes manifests repository. ArgoCD then detects the commit and syncs automatically, replacing the Pods. With this approach Git remains the single source of truth, and the deployment history is auditable through Git commits.

---

### Problem 4

The Cluster Autoscaler uses only specific instance types, causing frequent Pod scheduling failures. What is the most appropriate fix?

A) Configure a Mixed Instances Policy on the ASG that includes additional instance types, or replace it with Karpenter to dynamically select the instance type best suited to the Pod request

B) Force a migration to Fargate only

C) Call the EC2 `RunInstances` API directly from Lambda

D) Use Spot Instance Blocks

**Answer: A**

Explanation: For the instance-type restriction of EC2-based Cluster Auto Scaling in ECS, the best options are to allow diverse types with an ASG Mixed Instances Policy or, with EKS, to replace it with Karpenter. Karpenter analyzes the resource request of pending Pods and directly provisions the optimal instance type without an ASG. Its scaling speed is also about 2-4 times faster than the Cluster Autoscaler.

---

### Problem 5

You must continuously monitor npm dependencies for CVEs and automatically create Findings in AWS Security Hub when they are found. Which ECR configuration is most appropriate?

A) Enable Enhanced Scanning, `scanFrequency: CONTINUOUS_SCAN`, integrate Inspector and Security Hub

B) Enable Basic Scanning, with a manual review every week

C) Poll `describe-image-scan-findings` with Lambda and send to Security Hub manually

D) Use Amazon GuardDuty alone

**Answer: A**

Explanation: ECR Enhanced Scanning uses Amazon Inspector as its engine and detects CVEs not only in OS packages but also in language dependencies such as npm, pip, and gem. `CONTINUOUS_SCAN` monitors continuously by rescanning existing images whenever a new CVE is discovered, not only when an image is pushed. Inspector is natively integrated with Security Hub and sends Findings automatically. Basic Scanning detects only OS packages and is not integrated with Security Hub.

---

### Problem 6

Pulling public images on EKS nodes fails because of the Docker Hub Rate Limit. What is the most appropriate solution?

A) Configure ECR Pull Through Cache — proxy Docker Hub, Quay, and the Kubernetes Container Registry through ECR for internal pulls

B) Set `imagePullPolicy: Never` to reduce image pull frequency

C) Diversify IPs with additional NAT Gateways

D) Increase the number of nodes to spread out pull requests

**Answer: A**

Explanation: ECR Pull Through Cache is a feature that caches external registries such as Docker Hub, Quay, the Kubernetes Container Registry, and ECR Public in front of ECR. It fetches from the external registry only on the first pull and thereafter returns the cached image from ECR. Beyond solving the Rate Limit problem, it also has the added benefits of reduced network latency and unified IAM-based access control.

---

### Problem 7

An EKS Pod must access only a specific S3 bucket, and other Pods must not access the same bucket. What is the most appropriate configuration?

A) Grant full S3 access to the EC2 IAM Role of all EKS nodes

B) Map an IAM Role that allows only that S3 bucket to a specific ServiceAccount through IRSA

C) Inject an IAM User Access Key into Pod environment variables

D) Bypass S3 access through Lambda

**Answer: B**

Explanation: IRSA (IAM Roles for Service Accounts) maps a Kubernetes ServiceAccount to an IAM Role to implement Pod-level least privilege. If you register the EKS OIDC provider in IAM and set the ServiceAccount as a condition in the IAM Role's trust policy, only Pods using that ServiceAccount can assume that IAM Role. Granting permissions to the node EC2 Role means all Pods on the same node share the permission, violating the principle of least privilege.

---

### Problem 8

A team operating 5 simple REST APIs has 3 developers and no infrastructure expert. What is the deployment configuration with the lowest operational burden?

A) EKS + Helm + ArgoCD (full GitOps)

B) App Runner (automatic deployment from a source repository or ECR image, automatic scaling)

C) An ECS EC2-based cluster

D) EC2 Auto Scaling Group + Nginx

**Answer: B**

Explanation: App Runner abstracts the load balancer, Task Definition, service discovery, and Auto Scaling configuration, so you only specify the image URI and it deploys automatically and scales automatically with traffic. It has lower operational complexity than Fargate, and EKS requires specialized Kubernetes operations knowledge. Note, however, that Lightsail Containers have no Auto Scaling, so they are not suitable for APIs with traffic fluctuation.

---

### Problem 9

In an ECS Service, you want to use Spot as much as possible, but for service stability at least 2 Tasks must always be guaranteed on On-Demand. What is the Capacity Provider Strategy configuration?

A) Use only `FARGATE_SPOT`

B) `[{capacityProvider: "FARGATE", base: 2, weight: 1}, {capacityProvider: "FARGATE_SPOT", base: 0, weight: 4}]`

C) Use only `FARGATE` (no Spot)

D) Use only the EC2 Capacity Provider

**Answer: B**

Explanation: In a Capacity Provider Strategy, `base` is the minimum number of Tasks to run on that provider, and `weight` determines the ratio. `FARGATE base: 2` means exactly 2 Tasks will run on On-Demand. The remaining Tasks are distributed in the `weight` ratio (FARGATE 1 : FARGATE_SPOT 4). For example, with 10 Tasks in total, that is 2 FARGATE (base) + about 2 FARGATE (weight) + about 6 FARGATE_SPOT (weight).

---

### Problem 10

You replaced the `latest` tag image in an ECS Service, but ECS does not pull the new image. What is the most appropriate fix?

A) Delete and recreate the ECS Service

B) `aws ecs update-service --cluster my-cluster --service my-service --force-new-deployment`

C) Terminate the ECS Tasks manually to induce a restart

D) Delete the image from ECR and push it again

**Answer: B**

Explanation: If the image tag has not changed, ECS does not replace Tasks even when a new image exists. `--force-new-deployment` starts new Tasks even without an image change, forcing ECS to pull the latest image from ECR. The root fix is to use unique tags such as the commit SHA in the CI/CD pipeline and remove the dependency on `latest`. Setting ECR `imageTagMutability: IMMUTABLE` is also recommended alongside.

---

### Problem 11

An App Runner service must access an RDS PostgreSQL inside a VPC. At the same time, this App Runner service must be inaccessible from the internet and reachable only through an ALB inside the VPC. What is the correct configuration?

A) Set up outbound (App Runner → RDS) with a VPC Connector, and inbound (VPC → App Runner) with Private Ingress

B) Setting only a VPC Connector handles both outbound and inbound

C) Block internet sources in the security group

D) Deploy App Runner directly into a VPC subnet

**Answer: A**

Explanation: App Runner's VPC connectivity is configured independently per direction. The VPC Connector is outbound-only, used when App Runner accesses RDS, ElastiCache, an internal ALB, and so on inside the VPC. Private Ingress is inbound-only; when set with `IngressConfiguration.IsPubliclyAccessible: false`, the App Runner service is not exposed to the internet and becomes accessible only from inside the VPC. The two settings are independent and must be configured separately.

---

### Problem 12

You want to containerize an existing Java monolithic application and migrate it to ECS. What is the most appropriate tool to automatically generate the container image and ECS Task Definition without modifying code?

A) AWS App2Container (a2c) — analyzes a running Java application and automatically generates a Dockerfile, ECS Task Definition, and CloudFormation template

B) AWS CDK — define infrastructure as code to create an ECS stack

C) Elastic Beanstalk — deploy a legacy Java app directly

D) AWS Migration Hub — a migration tracking dashboard

**Answer: A**

Explanation: App2Container (a2c) analyzes Java (.war/.jar) and .NET applications running on EC2 or on-premises and automatically generates every artifact needed for containerization. Containerization is possible without code changes, and it also generates a CloudFormation template for ECS (Fargate/EC2) or EKS deployment. ECS Copilot is used when developing a new service from scratch, while App2Container is used for migrating existing legacy apps.

---

## The 4-Step Troubleshooting of Container CI/CD Based on CloudTrail

> **Methodology for Diagnosing Container CI/CD Failures**
>
> Most container CI/CD pipeline failures are in one of four layers: permissions (IAM), images (ECR), deployment configuration (Task Definition/Manifest), and network (VPC/Security Group).
>
> **4-step diagnostic process:**
>
> 1. **Check CloudTrail** → filter `AccessDenied` events
>    - ECR: `ecr:GetAuthorizationToken`, `ecr:BatchGetImage` failures
>    - ECS: `ecs:RegisterTaskDefinition`, `ecs:UpdateService` failures
>    - 90% of permission errors can be diagnosed at this step
>
> 2. **Check the ECR image** → tag existence, digest match
>    - `aws ecr describe-images --repository-name my-app`
>    - With IMMUTABLE set, check for attempts to re-push the same tag
>
> 3. **Check ECS Service Events** → console Service → Events tab
>    - `Task failed ELB health checks` → app startup error or port mismatch
>    - `CannotPullContainerError` → ECR permission or VPC network problem
>    - `ResourceInitializationError` → Task Role permission or Secrets Manager access failure
>
> 4. **Container Insights / CloudWatch Logs** → check app-level errors
>    - Check stack traces in the `/ecs/{service-name}` log group
>    - OOMKilled → memory Limit needs to be increased

---

## Week 6 Completion Check

- ECR: scanning (Basic/Enhanced), Lifecycle Policy, IMMUTABLE tags, Pull Through Cache, KMS encryption
- ECS: Rolling vs Blue/Green file formats, Auto Scaling (Application Auto Scaling + Capacity Provider), ECS Exec
- EKS: GitOps (ArgoCD/Flux), IRSA, Karpenter vs Cluster Autoscaler, argocd-image-updater
- App Runner: Access Role vs Instance Role, VPC Connector (outbound) vs Private Ingress (inbound), MaxConcurrency scaling
- ECS Copilot: Manifest YAML → automatic CloudFormation generation (Infrastructure as Intent)
- App2Container: legacy Java/.NET → ECS containerization migration tool
- Lightsail Containers: no Auto Scaling — exam trap

---

Next Week Preview (Week 7): Serverless CI/CD — AWS SAM, Lambda versions/aliases, CodeDeploy Canary, Step Functions workflow orchestration
