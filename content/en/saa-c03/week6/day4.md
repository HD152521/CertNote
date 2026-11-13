# Day 4 - Containers: ECS, EKS, Fargate, ECR

Containers changed application deployment when Docker appeared in 2013. The root cause of "it works on my machine but not on the server" is environment mismatch, and containers solved it with an immutable unit of execution: the container image. But that created a new problem: how do you manage dozens or hundreds of containers? That is the domain of container orchestration. AWS offers its own orchestrator, ECS; EKS, which follows the Kubernetes standard; and Fargate, a serverless execution engine that works with both.

**Related theory — how Linux container isolation works**: Container isolation is built on two Linux kernel features. **Namespaces** limit which resources a process can see: PID (process tree), Network (network interfaces), Mount (filesystem), UTS (hostname), IPC (inter-process communication), and User (UID/GID) namespaces combine to form a container. **cgroups (Control Groups)** limit CPU, memory, I/O, and network bandwidth per container. Docker adds a convenient image build and distribution layer on top of these kernel features. In 2015 the OCI (Open Container Initiative) standard was established, standardizing the container image format and runtime, and various runtimes such as containerd and CRI-O have emerged since.

## Containers vs VMs — Differences in Isolation Level

Both containers and VMs provide isolated execution environments, but the isolation layer differs. A VM virtualizes the hardware, so each VM has its own independent kernel. A container shares the host OS kernel and isolates processes with Linux namespaces and cgroups.

| Item | VM | Container | Fargate (MicroVM) |
|------|-----|-----------|-------------------|
| Isolation level | Fully separate kernel | Shared kernel, namespace isolation | Separate kernel + lightweight VMM |
| Startup speed | Tens of seconds to minutes | A few milliseconds to seconds | ~125ms (Firecracker) |
| Resource overhead | High (Guest OS required) | Low (shared kernel) | Medium (lightweight VMM) |
| Can share the same host | Yes (Hypervisor separation) | Yes (namespace separation) | Dedicated VM per task |
| Impact of kernel vulnerabilities | None | Yes (shared kernel) | None |

Lambda's Firecracker MicroVM sits in between. It does not share a kernel, so it has VM-level isolation, but thanks to a lightweight VMM written in Rust, its ~125ms startup speed comes close to containers. Fargate also runs on Firecracker, so it provides stronger security isolation than EC2-based ECS.

**Going deeper — how container runtimes were standardized**: The era of Docker's monopoly in 2014 gave way to standardization with the founding of the CNCF (Cloud Native Computing Foundation) in 2015. The OCI (Open Container Initiative) defined the image spec and runtime spec, and in 2020 Kubernetes deprecated Docker as a container runtime and replaced it with the CRI (Container Runtime Interface). Today the default Kubernetes runtime is containerd. AWS EKS also uses containerd by default starting with version 1.24. This change is not tested directly on the SAA-C03 exam, but it can show up as a compatibility problem when upgrading EKS nodes.

## ECR — Container Image Registry

Amazon Elastic Container Registry (ECR) is a fully managed registry that stores Docker images and OCI artifacts. It is AWS's version of DockerHub, but it integrates enterprise features such as IAM access control, KMS encryption, VPC endpoints, and cross-Region replication.

**Image Scanning**: Automatically scans for CVE vulnerabilities when an image is pushed. Basic Scanning (free) uses the open-source Clair engine. Enhanced Scanning integrates with Amazon Inspector v2 to use a broader vulnerability database (CVE, CIS benchmarks). If a vulnerability is found in a CI/CD pipeline, you can configure a deployment gate to block the release.

**Lifecycle Policy**: Automatically deletes old images. Rules such as "keep only the 10 most recent tagged images" or "delete untagged images older than 90 days" help you manage storage costs.

**Cross-Region/Cross-Account Replication**: In multi-Region deployments, replicate images so that each Region pulls from a nearby ECR. This optimizes deployment speed and cost (data transfer).

**VPC Endpoint support**: If you set up a VPC Interface Endpoint (PrivateLink) for ECR, you can pull images without going through the internet. This is especially important for Fargate tasks in private subnets: ECR access without internet strengthens security and reduces NAT Gateway costs.

> ⚠️ **Trap — ECR needs 2 VPC Endpoints**: When setting up VPC Endpoints for ECR, you need two endpoints: `com.amazonaws.region.ecr.api` (for ECR API calls) and `com.amazonaws.region.ecr.dkr` (for transferring image layers). You must also set up an S3 Gateway Endpoint, because ECR image layers are actually stored in S3. If any one of the three is missing, image pulls from a private subnet fail.

## ECS — The AWS-Native Container Orchestrator

Amazon Elastic Container Service (ECS) is AWS's own container orchestrator, launched in 2014. It uses its own conceptual model, different from Kubernetes.

### ECS Core Concepts

**Task Definition**: A blueprint, defined in JSON, for how to run containers. It contains one or more containers and specifies each container's image, CPU, memory, ports, environment variables, volume mounts, logging configuration, and IAM role. It supports versioning (Revisions), and deployments are managed by Task Definition Revision number.

**Task**: A running instance of a Task Definition. One or more containers run together, sharing the same network and storage. It corresponds to a Kubernetes **Pod**.

**Service**: A declaration that says "always keep N Tasks running from this Task Definition." If a task fails, it automatically starts a new one. It manages rolling deployments and Blue/Green deployments and integrates with ALB/NLB.

**Cluster**: A logical group that runs tasks and services. It is a pool of EC2 instances or Fargate capacity.

**ECS-to-Kubernetes concept mapping table**:

| ECS concept | Kubernetes concept | Description |
|---------|-----------------|------|
| Task Definition | Pod Spec (Deployment template) | Container execution blueprint |
| Task | Pod | Unit of execution (group of containers) |
| Service | Deployment + Service | Maintains desired state + load balancing |
| Cluster | Cluster / Namespace | Logical isolation unit |
| Task Role | IRSA (Pod IAM) | Container AWS permissions |
| Task Execution Role | kubelet credential | Agent AWS permissions |
| Fargate | Fargate / Virtual Kubelet | Serverless execution engine |

### EC2 Launch Type vs Fargate

| Item | EC2 Launch Type | Fargate |
|------|----------------|---------|
| Infrastructure management | Customer (AMI selection, patching, ASG) | AWS |
| Cost model | EC2 instance pricing | Per-second billing on task vCPU + memory |
| Isolation level | Multiple tasks share the same EC2 | Dedicated Firecracker MicroVM per task |
| GPU support | Yes (p/g/inf instances) | No |
| Windows containers | Yes | Yes |
| Spot usage | Yes (EC2 Spot) | Yes (Fargate Spot, up to 70% savings) |
| ENI limits | Maximum number of ENIs limited per instance type | None |
| Best suited for | Large clusters, GPU, high density | Simplified operations, small scale, variable traffic |

Fargate's isolation strength: each Fargate task runs on its own lightweight VM (Firecracker). Multiple tasks do not share the same host kernel, so security isolation is stronger than with the EC2 Launch Type. This is why regulated industries (finance, healthcare) prefer Fargate.

**Case study — Airbnb's move to Fargate**: Airbnb moved its CI/CD build pipeline to Fargate and eliminated the cost of managing idle EC2 nodes. Fargate tasks start within seconds according to build demand and terminate automatically after the build finishes, so you are billed only for actual usage time. They reported saving dozens of hours per week of infrastructure management time compared with an EC2-based build farm. Applying Fargate Spot to build workers for an additional 70% cost reduction is also worth noting.

## Networking Modes — Why awsvpc Is the Standard

ECS tasks have three networking modes: `bridge`, `host`, and `awsvpc`.

**bridge mode**: Docker's default bridge network. Containers share the host IP and are distinguished by dynamic port mapping (32768-61000). Multiple tasks on the same EC2 instance can use the same container port, but configuring the ALB's dynamic port mapping is complicated.

**awsvpc mode**: Each task gets its own ENI (Elastic Network Interface) and private IP. You can apply a Security Group directly to a task. It is the only networking mode for Fargate and also the recommended modern approach for the EC2 Launch Type.

Benefits of awsvpc:
- Task-level security groups — you can set "only this ECS service can access RDS"
- An independent IP per task — register the ALB Target Group as the IP type
- Per-task traffic can be tracked in VPC Flow Logs
- Per-task access control to Secrets Manager and SSM Parameter Store

Connecting ALB and ECS: In awsvpc mode, create the ALB Target Group as the IP type, and the ECS service automatically registers and deregisters IPs in the Target Group as tasks start and stop.

**Going deeper — ENI limits in awsvpc mode**: In awsvpc mode an ENI is created for each task, so you can hit the maximum number of ENIs per EC2 instance. For example, `m5.large` supports 3 ENIs, `m5.xlarge` supports 4, and `m5.24xlarge` supports up to 15. So with the EC2 Launch Type + awsvpc mode, the number of tasks one host can run is limited by instance type. AWS provides **ENI Trunking** (one trunk ENI supports up to 120 branch ENIs) to address this, but it has instance type restrictions. Fargate has no such limit, because each task is a separate MicroVM.

## IAM Permissions — Task Role and Task Execution Role

In ECS, IAM permissions are split into two layers. Confusing the two causes permission errors.

**Task Execution Role**: The permissions the ECS agent (control plane) needs to start a task. It pulls images from ECR, writes logs to CloudWatch Logs, and reads secrets from Secrets Manager to inject them into container environment variables.

```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:GetDownloadUrlForLayer",
    "ecr:BatchGetImage",
    "logs:CreateLogStream",
    "logs:PutLogEvents",
    "secretsmanager:GetSecretValue",
    "ssm:GetParameters",
    "kms:Decrypt"
  ]
}
```

**Task Role**: The permissions the application code inside the container uses to call AWS services. Permissions such as "this ECS task reads an S3 bucket and writes to DynamoDB" must be in the Task Role.

```
[ ECS agent ]
       │ Task Execution Role
       │ - Pull images from ECR
       │ - Send logs to CloudWatch
       │ - Read secrets from Secrets Manager (before container start)
       ▼
[ Task (container) ]
       │ Task Role
       │ - S3 GetObject/PutObject
       │ - DynamoDB PutItem/GetItem
       │ - SNS Publish, SQS SendMessage
       ▼
[ AWS services ]
```

> ⚠️ **Trap — EC2 Instance Profile contamination**: When you run ECS with the EC2 Launch Type, an EC2 Instance Profile also exists. If no Task Role is set, the AWS SDK inside the container can use the Instance Profile's credentials. In that case every task on the same host gets the same instance permissions, which violates the Principle of Least Privilege. Always set a Task Role tailored to each service, and control things so that credentials are issued only through the ECS agent metadata endpoint (`169.254.170.2`). Fargate has no Instance Profile at all, so this problem does not occur.

## EKS — A Managed Service on the Kubernetes Standard

Amazon Elastic Kubernetes Service (EKS) is a service in which AWS manages the Kubernetes control plane (etcd, API Server, Controller Manager, Scheduler). Customers manage only the worker nodes and application Pods.

**Why Kubernetes is chosen**:
- A vendor-neutral standard — the same API as GCP GKE, Azure AKS, and on-premises
- A vast open-source ecosystem (Istio, ArgoCD, Prometheus, Helm, Karpenter)
- Support for complex deployment patterns (CRDs, the Operator pattern, Horizontal Pod Autoscaler)
- Multi-cloud/hybrid strategy

**Why ECS is chosen**:
- A simpler conceptual model and lower learning curve
- Deeper native integration with AWS services
- No control plane cost (EKS costs $0.10 per cluster per hour)
- Teams already familiar with AWS tools

### IRSA — Granting IAM Permissions per Pod

For a Pod in EKS to call AWS services, it needs IAM permissions. If you use the EC2 Instance Profile, every Pod on the same node gets the same permissions, which is the same as the Instance Profile contamination problem in ECS. IRSA (IAM Roles for Service Accounts) solves this.

How IRSA works:
1. Register the EKS cluster's OIDC Provider URL in IAM
2. Create a Kubernetes Service Account and specify the IAM Role ARN as an annotation
3. Assign the Service Account to the Pod
4. When the Pod calls an AWS API, the EKS Pod Identity Webhook automatically injects an OIDC token
5. The AWS SDK uses the token to call STS `AssumeRoleWithWebIdentity`
6. STS issues temporary credentials, and the Pod calls AWS services with the permissions of the specified IAM Role

```yaml
# Kubernetes Service Account with IRSA
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader-sa
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::111122223333:role/s3-reader-role
---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  serviceAccountName: s3-reader-sa
  containers:
  - name: app
    image: my-app:latest
```

With this configuration, only the `my-app` Pod has S3 read permission, and other Pods on the same node do not.

**Related theory — OIDC and Web Identity Federation**: IRSA is based on OIDC (OpenID Connect, RFC 8485) and STS Web Identity Federation. OIDC is an authentication layer built on top of OAuth 2.0, and EKS issues an OIDC token in JWT form for each Pod's Service Account. If you specify the OIDC Provider ARN and a `sub` condition (a specific service account in a specific namespace) in the IAM trust policy, AssumeRole is allowed only for tokens that satisfy that condition. This mechanism works on the same principle as Lambda's execution role and EC2's Instance Profile, but extended for Kubernetes environments. In 2023 AWS released the simpler **EKS Pod Identity**, which lets you attach an IAM Role directly to a Pod through the EKS native API without any OIDC setup.

### EKS Node Types

| Item | Managed Node Groups | Self-Managed | Fargate Profiles |
|------|--------------------|--------------|----|
| Node patching/upgrades | AWS-assisted (rolling) | Manual | AWS (per task) |
| ASG management | AWS | Manual | None (On-Demand) |
| Custom AMI | Limited support | Full support | Not possible |
| GPU / Neuron | Yes (p/g/inf instances) | Yes | No |
| Running DaemonSets | Yes | Yes | No |
| Spot instances | Yes | Yes | No (no Fargate Spot) |
| Cost | EC2 cost | EC2 cost | Per-second vCPU + memory |

Fargate Profiles run Pods that match a specific Kubernetes Namespace and Label Selector on Fargate. DaemonSets, HostNetwork Pods, and stateful workloads (some PersistentVolumes) are not supported on Fargate.

**Case study — Shopify's EKS + Karpenter**: To handle Black Friday traffic spikes, Shopify adopted Karpenter (an open-source node autoscaler) on EKS. Compared with the existing Cluster Autoscaler, node provisioning was 3 times faster, and by choosing the needed instance types (including Spot) in real time they achieved a 30% cost reduction. At peak traffic, hundreds of nodes are added within minutes and then scaled down automatically after the peak. Karpenter was donated to the CNCF in 2023.

## Deployment Strategies — Rolling, Blue/Green, Canary

**Rolling update (default)**: The default deployment method for an ECS Service. It starts new tasks one at a time while terminating old ones. `minimumHealthyPercent` (the minimum percentage of existing tasks to keep) and `maximumPercent` (the maximum percentage of total tasks) control how many tasks exist at the same time.

Example: with `desiredCount=4`, `minimumHealthyPercent=50`, and `maximumPercent=200`, between 2 and 8 tasks can exist at the same time during deployment.

**Blue/Green (CodeDeploy integration)**: Deploy the new version (Green) fully in parallel with the existing version (Blue), then switch traffic with an ALB Listener Rule. After verification, terminate Blue, or roll back with one click if a problem is found.

**Canary**: A variant of Blue/Green. Traffic is shifted gradually (10% → 25% → 50% → 100%). CodeDeploy monitors CloudWatch Alarms and automatically rolls back if the error rate exceeds a threshold. This allows testing the new version in the real environment.

**Going deeper — comparing ECS deployment strategies**:

| Deployment method | Downtime | Rollback speed | Infrastructure cost | Complexity |
|---------|---------|---------|-----------|-------|
| Rolling (default) | None | Slow (reverse Rolling) | No extra | Low |
| Blue/Green | None | Fast (traffic switch) | 2× tasks temporarily | Medium |
| Canary | None | Automatic (CloudWatch) | 2× tasks temporarily | High |

Use Blue/Green when rollback matters, as in financial systems or payment services. Use Canary when the impact of a new feature is uncertain. Rolling is appropriate for ordinary service updates.

## Comparison with Other Clouds

| Item | AWS ECS/EKS | GCP Cloud Run/GKE | Azure Container Apps/AKS |
|------|-------------|-------------------|--------------------------|
| Serverless containers | Fargate | Cloud Run (HTTP auto scaling) | Container Apps |
| Managed K8s | EKS | GKE Autopilot | AKS |
| Own orchestrator | ECS | — | — |
| Control plane cost | EKS $0.10/hr | GKE free (Zonal) | AKS free |
| Image registry | ECR | Artifact Registry | ACR (Azure Container Registry) |
| IAM integration | Task Role / IRSA | Workload Identity | Managed Identity (Pod) |
| Service mesh | AWS App Mesh / Istio | Cloud Service Mesh / Istio | KEDA + Dapr |

GCP GKE Autopilot is closest to AWS Fargate + EKS in that it requires no node management. As of 2023, the GKE control plane is free for Zonal clusters, which is a cost advantage over EKS.

**Case study — Netflix's EKS migration**: Starting in 2018, Netflix migrated from ECS to EKS in stages. In an environment running thousands of microservices, they used Kubernetes CRDs (Custom Resource Definitions) and the Operator pattern to abstract Netflix-specific deployment requirements (automated canaries, regional deployments, chaos engineering hooks). Integrating Spinnaker (Netflix's open-source CD platform) with EKS was key. Today hundreds of thousands of Netflix containers run on EKS.

## Deploying an ECS Fargate Service with the CLI

```bash
# Create an ECR repository (image scanning + KMS encryption)
aws ecr create-repository \
  --repository-name prod/my-app \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=KMS,kmsKey=arn:aws:kms:...

# Log in to ECR and push the image
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  111122223333.dkr.ecr.ap-northeast-2.amazonaws.com

docker build -t my-app:latest .
docker tag my-app:latest 111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/prod/my-app:latest
docker push 111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/prod/my-app:latest

# Check ECR image scan results (Enhanced Scanning)
aws ecr describe-image-scan-findings \
  --repository-name prod/my-app \
  --image-id imageTag=latest \
  --query 'imageScanFindings.findings[?severity==`CRITICAL`]'

# Create an ECS cluster (mix of Fargate + Fargate Spot)
aws ecs create-cluster \
  --cluster-name prod-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=1 \
    capacityProvider=FARGATE_SPOT,weight=4

# Register a Task Definition (Secrets Manager integration)
aws ecs register-task-definition \
  --family prod-task \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 512 \
  --memory 1024 \
  --execution-role-arn arn:aws:iam::111:role/ecsTaskExecutionRole \
  --task-role-arn arn:aws:iam::111:role/prod-task-role \
  --container-definitions '[{
    "name": "app",
    "image": "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/prod/my-app:latest",
    "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
    "secrets": [{
      "name": "DB_PASSWORD",
      "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:111:secret:prod/db-password"
    }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/prod-task",
        "awslogs-region": "ap-northeast-2",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3
    }
  }]'

# Create an ECS Service (ALB attached + Blue/Green deployment)
aws ecs create-service \
  --cluster prod-cluster \
  --service-name prod-service \
  --task-definition prod-task:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-private-a", "subnet-private-b"],
      "securityGroups": ["sg-ecs-tasks"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --load-balancers '[{
    "targetGroupArn": "arn:aws:elasticloadbalancing:...:targetgroup/prod-tg",
    "containerName": "app",
    "containerPort": 8080
  }]' \
  --deployment-controller type=CODE_DEPLOY \
  --deployment-configuration minimumHealthyPercent=50,maximumPercent=200

# ECS Service Auto Scaling (target CPU 70%)
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/prod-cluster/prod-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 20

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/prod-cluster/prod-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 60,
    "ScaleOutCooldown": 30
  }'

# Register the EKS OIDC Provider for IRSA
eksctl utils associate-iam-oidc-provider \
  --region ap-northeast-2 \
  --cluster prod-eks \
  --approve

# Create an IRSA Service Account (S3 read permission)
eksctl create iamserviceaccount \
  --name s3-reader-sa \
  --namespace production \
  --cluster prod-eks \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve \
  --override-existing-serviceaccounts
```

**Trap — Preparing for Fargate Spot interruptions**: Fargate Spot is up to 70% cheaper, but when AWS reclaims capacity it sends SIGTERM 2 minutes in advance and then stops the task. Do not use it for stateful work. Use it for batch jobs where retrying after an interruption is natural, or configure a Capacity Provider Strategy that falls back to Fargate (On-Demand) when Spot is interrupted. In the ECS Capacity Provider Strategy, setting `base=1` on On-Demand Fargate guarantees that at least 1 task always runs On-Demand, and the rest run on Spot.

## Summary

AWS container services are organized in layers: ECR (image storage) → ECS or EKS (orchestration) → Fargate or EC2 (execution environment). The selection criteria are clear.

- **Simplified operations first**: ECS + Fargate. A team optimized for AWS, no Kubernetes needed.
- **Kubernetes standard required**: EKS. Multi-cloud, complex orchestration requirements.
- **GPU/specialized instances**: ECS/EKS + EC2 Launch Type. Fargate does not support GPU.
- **IAM permissions**: Task Role for ECS, IRSA for EKS, granting least privilege at the Pod/task level.
- **Security isolation first**: Fargate (Firecracker MicroVM, no shared kernel).

Tomorrow we review all of Week 6 and solidify the selection criteria for Lambda, API Gateway, Step Functions, and containers with scenario questions.

---

## 📝 Practice Questions

**Question 1.** A development team is building an application on Kubernetes and plans to deploy the same workload on-premises, on GCP GKE, and on AWS. Which container orchestration service is the best fit on AWS?

A) Amazon ECS — AWS-only but simple and fast
B) Amazon EKS — the Kubernetes standard guarantees multi-cloud/on-premises portability
C) AWS Fargate alone — run containers directly without orchestration
D) Install Kubernetes directly on EC2 — full control

**Answer: B**
EKS is compatible with upstream Kubernetes, so you can use the same YAML manifests on GKE, on-premises, and EKS with minimal changes. ECS is an AWS-only concept and has no portability. D carries a heavy burden of managing the control plane. Fargate alone has no orchestration layer.

---

**Question 2.** An ECS Fargate task must read files from an S3 bucket and store the processing results in DynamoDB. What is the correct way to grant these permissions?

A) Add S3 read and DynamoDB write permissions to the Instance Profile of the EC2 instances the ECS cluster runs on
B) Hardcode an AWS Access Key and Secret Key in the task container's environment variables
C) Grant S3 read and DynamoDB write permissions to the Task Role in the Task Definition
D) Add S3 read and DynamoDB write permissions to the Task Execution Role

**Answer: C**
The Task Role is the permission the application code inside the container uses to call AWS services. The Task Execution Role (D) is the permission for the ECS agent to pull images from ECR and send logs, which is different from the application code's AWS access. For A, Fargate has no EC2 instances. For B, hardcoding is a major security risk.

---

**Question 3.** An ECS Fargate service handles traffic through an ALB. Each task uses port 8080, and you want tasks to be registered with and deregistered from the ALB Target Group automatically. Which networking mode should you use?

A) bridge mode (randomly assigns host ports through dynamic port mapping)
B) host mode (binds the container port directly to the host port)
C) awsvpc mode (assigns an ENI and dedicated IP to each task, Target Group IP type)
D) overlay mode (Docker Swarm network)

**Answer: C**
Fargate supports only awsvpc mode. In awsvpc mode each task has its own ENI and private IP, and if you set the ALB Target Group to the IP type, the ECS service automatically registers the IP when a task starts and deregisters it when the task stops. A and B can be used only with the EC2 Launch Type. D is not supported by ECS.

---

**Question 4.** In an EKS cluster, a payment processing Pod and a log collection Pod run on the same node. Only the payment processing Pod should access AWS Secrets Manager, and the log collection Pod should access only CloudWatch Logs. What is the safest way to grant different IAM permissions to each Pod?

A) Grant both permissions to the EC2 node Instance Profile
B) Use IRSA (IAM Roles for Service Accounts) to attach a different IAM Role to each Pod's Service Account
C) Set a per-Pod IAM Access Key in environment variables
D) Separate the nodes and apply a different Instance Profile to each node

**Answer: B**
IRSA is the standard way to grant IAM permissions per Pod in EKS. By attaching an independent IAM Role to each Pod's Service Account, each Pod has only its own Role's permissions even on the same node. A gives every Pod on the same node both permissions, violating the principle of least privilege. C risks credential exposure. D, separating nodes, is costly and does not scale.

---

**Question 5.** A company wants to containerize a legacy Java monolith while converting it into microservices. The operations team has no Kubernetes experience and wants to deploy to production quickly without managing nodes. Which combination of AWS services is the best fit?

A) EKS + Managed Node Groups
B) ECS + Fargate
C) ECS + EC2 Launch Type
D) EKS + Fargate

**Answer: B**
The team has no Kubernetes experience and does not want to manage nodes. ECS has a simpler conceptual model, and Fargate removes the need for node management. The ECS + Fargate combination has the least operational burden while allowing a fast production deployment. A and D have a Kubernetes learning curve. C requires managing EC2 nodes directly.

---

**Question 6.** A financial services company needs strong security isolation in its container environment for PCI DSS compliance. Kernel-level isolation is required between containers that process different customers' data. Which execution environment meets this requirement?

A) ECS + EC2 Launch Type + bridge networking mode
B) ECS + EC2 Launch Type + awsvpc networking mode
C) ECS + Fargate (Firecracker MicroVM-based)
D) EKS + Managed Node Groups + DaemonSet

**Answer: C**
Fargate runs each task in a Firecracker MicroVM, so it is fully isolated at the kernel level. Because it does not share the host kernel with other tasks, a kernel vulnerability cannot affect other tasks. In A and B, multiple tasks on EC2 share the same kernel. In D, Pods on EC2 nodes also share the same kernel. When kernel-level isolation is an explicit requirement, Fargate is the answer.

---

**Question 7.** You want to run an ECS service in a private subnet and pull images from ECR without going over the internet. What combination of VPC Endpoints is required?

A) Set up only com.amazonaws.region.ecr.dkr
B) com.amazonaws.region.ecr.api + com.amazonaws.region.ecr.dkr + S3 Gateway Endpoint
C) com.amazonaws.region.ecr.api + S3 Gateway Endpoint
D) Access ECR over the internet through a NAT Gateway

**Answer: B**
ECR VPC Endpoints require all three. `ecr.api` is needed for ECR API calls (authentication, image metadata), and `ecr.dkr` for Docker image layer transfer. The S3 Gateway Endpoint is required because ECR actually stores image layers in S3. If any one of these is missing, image pulls from a private subnet fail. D can reach the internet through a NAT Gateway, but it does not meet the security requirement (no internet traversal).

---
