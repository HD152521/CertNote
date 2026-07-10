# Day 4 - Containers: ECS, EKS, Fargate, ECR

Containers changed application deployment when Docker arrived in 2013. The environment mismatch that is the root cause of "it works on my machine but not on the server" was solved by making the container image an immutable unit of execution. But a new problem emerged: how do you manage dozens or hundreds of containers? That is the domain of container orchestration. AWS offers its own orchestrator, ECS; EKS, which follows the Kubernetes standard; and Fargate, a serverless execution engine that works with both.

> 💡 **Related theory — how Linux container isolation works**: Container isolation is built on top of two Linux kernel features. **namespaces** restrict which resources a process can see — PID (process tree), Network (network interfaces), Mount (filesystem), UTS (hostname), IPC (inter-process communication), and User (UID/GID) namespaces combine to form a container. **cgroups (Control Groups)** cap CPU, memory, I/O, and network bandwidth per container. Docker adds a convenient image build-and-distribute layer on top of these kernel features. In 2015 the OCI (Open Container Initiative) standard was established, standardizing the container image format and runtime, and afterward various runtimes such as containerd and CRI-O emerged.

## Container vs VM — Differences in Isolation Level

Containers and VMs both provide isolated execution environments, but the isolation layer differs. A VM virtualizes the hardware so that each VM has its own independent kernel. A container shares the host OS kernel while isolating processes with Linux namespaces and cgroups.

| Aspect | VM | Container | Fargate (MicroVM) |
|--------|-----|-----------|-------------------|
| Isolation level | Full kernel separation | Shared kernel, namespace isolation | Kernel separation + lightweight VMM |
| Startup speed | Tens of seconds to minutes | Milliseconds to seconds | ~125ms (Firecracker) |
| Resource overhead | High (needs a Guest OS) | Low (shared kernel) | Medium (lightweight VMM) |
| Can share the same host | O (Hypervisor separation) | O (namespace separation) | Dedicated VM per task |
| Impact of kernel vulnerabilities | None | Present (shared kernel) | None |

Lambda's Firecracker MicroVM sits at this midpoint. It doesn't share the kernel, so it has VM-level isolation, but thanks to a lightweight VMM written in Rust it starts in ~125ms, close to a container. Fargate also runs on top of Firecracker, so it provides stronger security isolation than EC2-based ECS.

> 🔍 **Going deeper — how container runtimes were standardized**: From the era of Docker's dominance in 2014, standardization began in 2015 with the founding of the CNCF (Cloud Native Computing Foundation). The OCI (Open Container Initiative) defined an image spec and a runtime spec, and in 2020 Kubernetes deprecated Docker as a container runtime and replaced it with the CRI (Container Runtime Interface). Today Kubernetes' default runtime is containerd. AWS EKS also uses containerd by default from version 1.24 onward. This change is not directly tested on the SAA-C03 exam, but it can surface as a compatibility issue during EKS node upgrades.

## ECR — The Container Image Registry

Amazon Elastic Container Registry (ECR) is a fully managed registry that stores Docker images and OCI artifacts. It's the AWS version of DockerHub, but with integrated enterprise features: access control through IAM, KMS encryption, VPC endpoints, and Cross-Region replication.

**Image Scanning**: Automatically scans for CVE vulnerabilities on image push. Basic Scanning (free) uses the open-source Clair engine. Enhanced Scanning integrates with Amazon Inspector v2 to leverage a broader vulnerability database (CVE, CIS benchmarks). If a vulnerability is found in the CI/CD pipeline, you can configure a deployment gate to block it.

**Lifecycle Policy**: Automatically deletes old images. Rules like "keep only the 10 most recent tagged images" or "delete untagged images older than 90 days" manage storage cost.

**Cross-Region/Cross-Account Replication**: In multi-region deployments, replicate so that each region pulls images from a nearby ECR. This optimizes deployment speed and cost (data transfer).

**VPC Endpoint support**: If you set up a VPC Interface Endpoint (PrivateLink) for ECR, you can pull images without going over the internet. This is especially important for Fargate tasks in a private subnet — ECR access is possible without the internet, which strengthens security and reduces NAT Gateway cost.

> ⚠️ **Pitfall — ECR needs 2 VPC Endpoints**: ECR requires two endpoints when setting up a VPC Endpoint: `com.amazonaws.region.ecr.api` (for ECR API calls) and `com.amazonaws.region.ecr.dkr` (for transferring image layers). You must also set up an S3 Gateway Endpoint — because ECR image layers are actually stored in S3. If even one of the three is missing, image pulls from a private subnet fail.

## ECS — The AWS-Native Container Orchestrator

Amazon Elastic Container Service (ECS) is AWS's own container orchestrator, launched in 2014. It uses a proprietary conceptual model that differs from Kubernetes.

### ECS Core Concepts

**Task Definition**: A blueprint that defines how to run containers, expressed as JSON. It contains one or more containers, and for each container it specifies the image, CPU, memory, ports, environment variables, volume mounts, logging configuration, and IAM role. Version control (Revision) is supported, and deployments are managed by Task Definition Revision number.

**Task**: A running instance of a Task Definition. One or more containers run together, sharing the same network and storage. It corresponds to a Kubernetes **Pod**.

**Service**: A declaration that says "always keep N Tasks of this Task Definition running." If a task fails, it automatically starts a new one. It manages rolling deployments and Blue/Green deployments and integrates with ALB/NLB.

**Cluster**: A logical group that runs tasks and services. A pool of EC2 instances or Fargate capacity.

> 💡 **ECS-to-Kubernetes concept mapping**:
>
> | ECS concept | Kubernetes concept | Description |
> |---------|-----------------|------|
> | Task Definition | Pod Spec (Deployment template) | Container execution blueprint |
> | Task | Pod | Unit of execution (bundle of containers) |
> | Service | Deployment + Service | Desired-state maintenance + load balancing |
> | Cluster | Cluster / Namespace | Logical isolation unit |
> | Task Role | IRSA (Pod IAM) | Container AWS permissions |
> | Task Execution Role | kubelet credential | Agent AWS permissions |
> | Fargate | Fargate / Virtual Kubelet | Serverless execution engine |

### EC2 Launch Type vs Fargate

| Aspect | EC2 Launch Type | Fargate |
|--------|----------------|---------|
| Infrastructure management | Customer (AMI selection, patching, ASG) | AWS |
| Cost model | EC2 instance unit price | Per-second billing for task vCPU + memory |
| Isolation level | Multiple tasks share the same EC2 | Dedicated Firecracker MicroVM per task |
| GPU support | O (p/g/inf instances) | X |
| Windows containers | O | O |
| Spot usage | O (EC2 Spot) | O (Fargate Spot, up to 70% savings) |
| ENI limits | Max ENI count limited per instance type | None |
| When it fits | Large clusters, GPU, high density | Operational simplicity, small scale, variable traffic |

Fargate's isolation strength: each Fargate task runs on top of a separate lightweight VM (Firecracker). Multiple tasks don't share the same host kernel, so security isolation is stronger than the EC2 Launch Type. This is why regulated industries (finance, healthcare) prefer Fargate.

> 📚 **Case study — Airbnb's move to Fargate**: Airbnb eliminated the cost of managing idle EC2 nodes by moving its CI/CD build pipeline to Fargate. Fargate tasks start within seconds according to build demand and shut down automatically after builds finish, so only actual usage time is billed. Compared to an EC2-based build farm, they reported saving tens of hours per week of infrastructure management time. Applying Fargate Spot to build workers to cut cost by an additional 70% is also worth noting.

## Networking Modes — Why awsvpc Is the Standard

An ECS task's networking mode is one of three: `bridge`, `host`, or `awsvpc`.

**bridge mode**: Docker's default bridge network. Containers share the host IP and are distinguished by dynamic port mapping (32768-61000). Multiple tasks can use the same container port on the same EC2, but ALB dynamic port mapping configuration is complex.

**awsvpc mode**: Each task gets its own independent ENI (Elastic Network Interface) and private IP. You can apply a Security Group directly to a task. It is Fargate's only networking mode and the modern approach recommended even for the EC2 Launch Type.

Benefits of awsvpc:
- Task-level security groups — you can configure "only this ECS service can access RDS"
- An independent IP per task — register the ALB Target Group as IP type
- Per-task traffic tracking in VPC Flow Logs
- Per-task access control to Secrets Manager and SSM Parameter Store

Connecting ALB and ECS: in awsvpc mode you create the ALB Target Group as IP type, and the ECS service automatically registers/deregisters IPs in the Target Group when tasks start/stop.

> 🔍 **Going deeper — ENI limits in awsvpc mode**: In awsvpc mode an ENI is created for each task, so you can hit the max ENI count per EC2 instance. For example, `m5.large` supports up to 3 ENIs, `m5.xlarge` up to 4, and `m5.24xlarge` up to 15. As a result, with EC2 Launch Type + awsvpc mode the number of tasks you can run on one host is limited by the instance type. To address this, AWS provides **ENI Trunking** (one trunk ENI supports up to 120 branch ENIs), but there are instance-type limits. Fargate doesn't have this limit — because each task is a separate MicroVM.

## IAM Permissions — Task Role and Task Execution Role

In ECS, IAM permissions are split into two layers. Confusing the two leads to permission errors.

**Task Execution Role**: The permissions the ECS agent (control plane) needs to start a task. It pulls the image from ECR, writes logs to CloudWatch Logs, and reads secrets from Secrets Manager to inject them into container environment variables.

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

**Task Role**: The permissions the application code inside the container uses to call AWS services. The permission for "this ECS task to read an S3 bucket and write to DynamoDB" must live in the Task Role.

```
[ ECS agent ]
       │ Task Execution Role
       │ - pull the image from ECR
       │ - send logs to CloudWatch
       │ - read secrets from Secrets Manager (before container start)
       ▼
[ Task (container) ]
       │ Task Role
       │ - S3 GetObject/PutObject
       │ - DynamoDB PutItem/GetItem
       │ - SNS Publish, SQS SendMessage
       ▼
[ AWS services ]
```

> ⚠️ **Pitfall — EC2 Instance Profile contamination**: When running ECS on the EC2 Launch Type, an EC2 Instance Profile also exists. If a Task Role is not set, the AWS SDK inside the container may use the Instance Profile's credentials. When that happens, every task on the same host ends up with the same instance permissions — a violation of the Principle of Least Privilege. You must always set the Task Role to fit each individual service, and control things so that credentials are issued only through the ECS agent metadata endpoint (`169.254.170.2`). Fargate has no Instance Profile at all, so this problem doesn't arise.

## EKS — A Managed Service on Top of the Kubernetes Standard

Amazon Elastic Kubernetes Service (EKS) is a service where AWS manages the Kubernetes control plane (etcd, API Server, Controller Manager, Scheduler). The customer manages only the worker nodes and the application Pods.

**Why Kubernetes gets chosen**:
- A vendor-independent standard — the same API as GCP GKE, Azure AKS, and on-premises
- A vast open-source ecosystem (Istio, ArgoCD, Prometheus, Helm, Karpenter)
- Support for complex deployment patterns (CRD, Operator pattern, Horizontal Pod Autoscaler)
- Multi-cloud/hybrid strategies

**Why ECS gets chosen**:
- A simpler conceptual model, a lower learning curve
- Deeper native integration with AWS services
- No control plane cost (EKS is $0.10 per cluster per hour)
- Teams with high familiarity with AWS tooling

### IRSA — Granting IAM Permissions Per Pod

For a Pod in EKS to call AWS services, it needs IAM permissions. If you use the EC2 Instance Profile, every Pod on the same node gets the same permissions — the same problem as ECS's Instance Profile contamination. IRSA (IAM Roles for Service Accounts) solves this.

How IRSA works:
1. Register the EKS cluster's OIDC Provider URL with IAM
2. Create a Kubernetes Service Account and specify the IAM Role ARN as an annotation
3. Assign the Service Account to the Pod
4. When the Pod calls an AWS API, the EKS Pod Identity Webhook automatically injects an OIDC token
5. The AWS SDK uses the token to call STS `AssumeRoleWithWebIdentity`
6. STS issues temporary credentials → the Pod calls AWS services with the permissions of the specified IAM Role

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

> 💡 **Related theory — OIDC and Web Identity Federation**: The foundation of IRSA is OIDC (OpenID Connect, RFC 8485) and STS Web Identity Federation. OIDC is an authentication layer built on top of OAuth 2.0, and EKS issues a JWT-form OIDC token for each Pod's Service Account. If you specify the OIDC Provider ARN and a `sub` condition (a specific service account in a specific namespace) in IAM's Trust Policy, only tokens that satisfy that condition are allowed to AssumeRole. This mechanism follows the same principle as Lambda's execution role and EC2's Instance Profile, but extended to fit the Kubernetes environment. In 2023 AWS released the simpler **EKS Pod Identity**, which lets you attach an IAM Role directly to a Pod via a native EKS API without OIDC setup.

### EKS Node Types

| Aspect | Managed Node Groups | Self-Managed | Fargate Profiles |
|------|--------------------|--------------|----|
| Node patching/upgrade | AWS-assisted (rolling) | Manual | AWS (per task) |
| ASG management | AWS | Manual | None (On-Demand) |
| Custom AMI | Limited support | Full support | Not possible |
| GPU / Neuron | O (p/g/inf instances) | O | X |
| DaemonSet execution | O | O | X |
| Spot instances | O | O | X (no Fargate Spot) |
| Cost | EC2 cost | EC2 cost | vCPU+memory per second |

Fargate Profiles run Pods that match a specific Kubernetes Namespace and Label Selector on Fargate. DaemonSets, HostNetwork Pods, and Stateful workloads (some PersistentVolumes) are not supported on Fargate.

> 📚 **Case study — Shopify's EKS + Karpenter**: To handle Black Friday traffic spikes, Shopify adopted Karpenter (an open-source node autoscaler) on EKS. Compared to the existing Cluster Autoscaler, node provisioning was 3× faster, and by selecting the needed instance types (including Spot) in real time, they achieved a 30% cost reduction. At traffic peaks, hundreds of nodes are added within minutes and scaled down automatically afterward. Karpenter was donated to the CNCF in 2023.

## Deployment Strategies — Rolling, Blue/Green, Canary

**Rolling update (default)**: The default deployment method for an ECS Service. It starts new tasks one at a time while terminating old tasks. You control the number of concurrently existing tasks with `minimumHealthyPercent` (minimum ratio of existing tasks to keep) and `maximumPercent` (maximum total task ratio).

Example: with `desiredCount=4`, `minimumHealthyPercent=50`, and `maximumPercent=200`, 2 to 8 tasks can exist concurrently during deployment.

**Blue/Green (CodeDeploy integration)**: Fully deploy the new version (Green) in parallel with the existing version (Blue), then switch traffic with an ALB Listener Rule. After verification, terminate Blue, or roll back with one click if a problem is found.

**Canary**: A variant of Blue/Green. Shift traffic gradually (10% → 25% → 50% → 100%). CodeDeploy monitors a CloudWatch Alarm and automatically rolls back if the error rate exceeds a threshold. Real-environment testing of the new version is possible.

> 🔍 **Going deeper — comparing ECS deployment strategies**:
>
> | Deployment method | Downtime | Rollback speed | Infra cost | Complexity |
> |---------|---------|---------|-----------|-------|
> | Rolling (default) | None | Slow (reverse rolling) | No extra | Low |
> | Blue/Green | None | Fast (traffic switch) | 2× tasks temporarily | Medium |
> | Canary | None | Automatic (CloudWatch) | 2× tasks temporarily | High |
>
> For cases where rollback matters, like financial systems or payment services, use Blue/Green. When the impact of a new feature is uncertain, use Canary. For ordinary service updates, Rolling is a good fit.

## Comparison With Other Clouds

| Aspect | AWS ECS/EKS | GCP Cloud Run/GKE | Azure Container Apps/AKS |
|------|-------------|-------------------|--------------------------|
| Serverless containers | Fargate | Cloud Run (HTTP autoscaling) | Container Apps |
| Managed K8s | EKS | GKE Autopilot | AKS |
| Own orchestrator | ECS | — | — |
| Control plane cost | EKS $0.10/hr | GKE free (Zone) | AKS free |
| Image registry | ECR | Artifact Registry | ACR (Azure Container Registry) |
| IAM integration | Task Role / IRSA | Workload Identity | Managed Identity (Pod) |
| Service mesh | AWS App Mesh / Istio | Cloud Service Mesh / Istio | KEDA + Dapr |

GCP GKE Autopilot is closest to AWS Fargate + EKS in that it requires no node management. As of 2023, the fact that the GKE control plane is free for Zone clusters is a cost advantage over EKS.

> 📚 **Case study — Netflix's EKS migration**: Netflix carried out a phased migration from ECS to EKS starting in 2018. In an environment running thousands of microservices, it used Kubernetes' CRD (Custom Resource Definition) and Operator pattern to abstract Netflix's particular deployment requirements (automated canaries, per-region deployment, chaos-engineering hooks). The integration of Spinnaker (Netflix's open-source CD platform) with EKS was central. Today hundreds of thousands of Netflix containers run on top of EKS.

## Deploying an ECS Fargate Service via the CLI

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

# Create an ECS cluster (mixed Fargate + Fargate Spot)
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

# Create an ECS Service (ALB connection + Blue/Green deployment)
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

# ECS Service Auto Scaling (based on CPU 70%)
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

> ⚠️ **Pitfall — preparing for Fargate Spot interruptions**: Fargate Spot is up to 70% cheaper, but when AWS reclaims capacity it sends a SIGTERM 2 minutes ahead and interrupts the task. You must not use it for stateful work; use it for batch jobs where a retry on interruption is natural, or configure a Capacity Provider Strategy that automatically switches to Fargate (On-Demand) on a Spot interruption. If you set `base=1` on On-Demand Fargate in the ECS Capacity Provider Strategy, at least 1 task is always guaranteed On-Demand, and the rest run on Spot.

## Wrapping Up

AWS container services are structured as layers: ECR (image storage) → ECS or EKS (orchestration) → Fargate or EC2 (execution environment). The selection criteria are clear.

- **Operational simplicity first**: ECS + Fargate. AWS-optimized teams, no need for Kubernetes.
- **Need the Kubernetes standard**: EKS. Multi-cloud, complex orchestration requirements.
- **GPU/special instances**: ECS/EKS + EC2 Launch Type. Fargate doesn't support GPU.
- **IAM permissions**: ECS grants least privilege per Pod/task with Task Role; EKS with IRSA.
- **Security isolation first**: Fargate (Firecracker MicroVM, no shared kernel).

Tomorrow we review all of week 6, cementing the selection criteria for Lambda, API Gateway, Step Functions, and containers with scenario questions.

---

## 📝 연습 문제

**문제 1.** A development team is building an application on Kubernetes and plans to deploy the same workload on-premises, on GCP GKE, and on AWS. Which is the most suitable container orchestration service on AWS?

A) Amazon ECS — AWS-only but simple and fast
B) Amazon EKS — Kubernetes-standard, guaranteeing multi-cloud/on-premises portability
C) AWS Fargate alone — run containers directly without orchestration
D) Install Kubernetes directly on EC2 — full control

**정답: B**
EKS is compatible with upstream Kubernetes, so the same YAML manifests can be used on GKE, on-premises, and EKS with minimal modification. ECS is an AWS-only concept, so it has no portability. D carries a heavy control-plane management burden. Fargate alone has no orchestration layer.

---

**문제 2.** An ECS Fargate task needs to read files from an S3 bucket and store the processing results in DynamoDB. What is the correct way to grant these permissions?

A) Add S3 read and DynamoDB write permissions to the Instance Profile of the EC2 instance where the ECS cluster runs
B) Hardcode an AWS Access Key and Secret Key into the task container's environment variables
C) Grant S3 read and DynamoDB write permissions to the Task Definition's Task Role
D) Add S3 read and DynamoDB write permissions to the Task Execution Role

**정답: C**
The Task Role is the permission the application code inside the container uses to call AWS services. The Task Execution Role (D) is the permission for the ECS agent to pull the image from ECR and send logs — different from the application code's AWS access. A is wrong because Fargate has no EC2 instance. B is wrong because hardcoding is a serious security risk.

---

**문제 3.** An ECS Fargate service handles traffic through an ALB. Each task uses port 8080, and to automatically register/deregister tasks in the ALB Target Group, which networking mode should you use?

A) bridge mode (randomly assigns host ports via dynamic port mapping)
B) host mode (binds the container port directly to the host port)
C) awsvpc mode (assigns an ENI and dedicated IP to each task, Target Group IP type)
D) overlay mode (Docker Swarm network)

**정답: C**
Fargate supports only awsvpc mode. In awsvpc mode each task gets its own ENI and private IP, and if you set the ALB Target Group to IP type, the ECS service automatically registers the IP when a task starts and deregisters it when the task stops. A and B are usable only with the EC2 Launch Type. D is not supported by ECS.

---

**문제 4.** In an EKS cluster, a payment-processing Pod and a log-collection Pod run on the same node. Only the payment-processing Pod should access AWS Secrets Manager, while the log-collection Pod should access only CloudWatch Logs. What is the most secure way to grant different IAM permissions to each Pod?

A) Grant both permissions on the EC2 node's Instance Profile
B) Use IRSA (IAM Roles for Service Accounts) to attach different IAM Roles to each Pod's Service Account
C) Set a per-Pod IAM Access Key in environment variables
D) Separate the nodes and apply a different Instance Profile to each node

**정답: B**
IRSA is the standard way to grant IAM permissions per Pod in EKS. By attaching an independent IAM Role to each Pod's Service Account, each Pod holds only its own Role's permissions even on the same node. A gives every Pod on the same node both permissions, violating the Principle of Least Privilege. C risks credential exposure. D — separating nodes is costly and doesn't scale.

---

**문제 5.** A company is containerizing a legacy Java monolith as it moves to microservices. The operations team has no Kubernetes experience and wants to deploy to production quickly without managing nodes. What is the most suitable combination of AWS services?

A) EKS + Managed Node Groups
B) ECS + Fargate
C) ECS + EC2 Launch Type
D) EKS + Fargate

**정답: B**
There is no Kubernetes experience and no desire to manage nodes. ECS has a simpler conceptual model, and Fargate requires no node management. The ECS + Fargate combination has the least operational burden while enabling fast production deployment. A and D have a Kubernetes learning curve. C requires managing EC2 nodes directly.

---

**문제 6.** A financial services company needs strong security isolation in its container environment for PCI DSS compliance. Kernel-level isolation is required between containers that process data for different customers. Which execution environment meets this requirement?

A) ECS + EC2 Launch Type + bridge networking mode
B) ECS + EC2 Launch Type + awsvpc networking mode
C) ECS + Fargate (Firecracker MicroVM-based)
D) EKS + Managed Node Groups + DaemonSet

**정답: C**
Fargate runs each task in a Firecracker MicroVM, so it is fully isolated at the kernel level. Because it doesn't share the host kernel with other tasks, a kernel vulnerability cannot affect other tasks. A and B share the same kernel among multiple tasks on top of EC2. D also shares the same kernel among Pods on top of EC2 nodes. When kernel-level isolation is an explicit requirement, Fargate is the correct answer.

---

**문제 7.** You want to run an ECS service in a private subnet and pull images from ECR without going over the internet. What combination of VPC Endpoints is required?

A) Set up only com.amazonaws.region.ecr.dkr
B) com.amazonaws.region.ecr.api + com.amazonaws.region.ecr.dkr + S3 Gateway Endpoint
C) com.amazonaws.region.ecr.api + S3 Gateway Endpoint
D) Access ECR over the internet through a NAT Gateway

**정답: B**
ECR VPC Endpoints require all three. `ecr.api` is needed for ECR API calls (authentication, image metadata), and `ecr.dkr` for Docker image layer transfer. The S3 Gateway Endpoint is required because ECR stores the actual image layers in S3. If even one of these is missing, image pulls from a private subnet fail. D can go over the internet through a NAT Gateway but does not satisfy the security requirement (not traversing the internet).

---
