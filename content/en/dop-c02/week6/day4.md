# Day 4 - App Runner and ECS Copilot: The Spectrum of Container Operations Abstraction

ECS and EKS are powerful but operationally complex. Task Definition, Service, ALB Target Group, Security Group, IAM Role—running one ECS service properly requires managing dozens of AWS resources. Does a startup or small team need all this for a single web API?

App Runner answers "no." "Give me source code or image; I handle the rest"—builds, deployment, load balancing, SSL, auto-scaling, monitoring—AWS completely manages. ECS Copilot is the middle ground: keep full ECS control while hiding complex resource configuration behind CLI abstraction.

Today we understand the abstraction spectrum and develop exam ability to immediately judge "which service for which situation?"

> 💡 **Related Theory**: Container service abstraction spectrum applies infrastructure software engineering's **abstraction layer** concept. Low level (EKS EC2) provides maximum control and maximum complexity; high level (App Runner) provides minimum control and minimum complexity. "Good level" doesn't exist—"appropriate level for requirements" is the selection criterion. Like Unix philosophy's "single tools doing one thing well in combination," AWS container services provide layered abstraction levels where users choose appropriate layer.

## AWS App Runner: "You Deploy, We Handle Everything"

App Runner, launched 2021, is fully-managed container PaaS (Platform-as-a-Service). Developers point to Dockerfile or source code; App Runner handles building (source-based), running images, HTTPS endpoint creation, auto-scaling configuration automatically.

**Two Source Types**:

First, ECR image-based. Already-built container images pulled directly from ECR and executed. CI/CD pipeline builds images and pushes to ECR; App Runner detects new image and auto-deploys.

Second, GitHub source-based. Point to GitHub repository; App Runner builds directly in internal build system. Deployment defined via `apprunner.yaml`.

| Source Type | Pull | Build Provider |
|-------------|------|----------|
| ECR Private | Image directly | External CI/CD |
| ECR Public | Image directly | External CI/CD |
| GitHub | Source code | App Runner internal |

```bash
# Create App Runner Service from ECR image
aws apprunner create-service \
  --service-name checkout-api \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "111.dkr.ecr.ap-northeast-2.amazonaws.com/checkout:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "8080",
        "RuntimeEnvironmentVariables": {"LOG_LEVEL": "INFO"},
        "RuntimeEnvironmentSecrets": {
          "DB_PASSWORD": "arn:aws:secretsmanager:ap-northeast-2:111:secret:prod/checkout/db"
        }
      }
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::111:role/AppRunnerECRAccessRole"
    }
  }' \
  --instance-configuration '{
    "Cpu": "1 vCPU",
    "Memory": "2 GB",
    "InstanceRoleArn": "arn:aws:iam::111:role/AppRunnerInstanceRole"
  }' \
  --auto-scaling-configuration-arn "arn:aws:apprunner:ap-northeast-2:111:autoscalingconfiguration/standard/1/..."
```

`AutoDeploymentsEnabled: true` is key. Every time new image is pushed to ECR, App Runner auto-triggers Rolling update. No CodePipeline needed—"ECR push → auto-deploy" is possible.

**Two Role Distinction**:

`AuthenticationConfiguration.AccessRoleArn`: App Runner service itself uses this Role pulling images from ECR. `build.apprunner.amazonaws.com` assumes this Role. Use `AWSAppRunnerServicePolicyForECRAccess` managed policy.

`InstanceConfiguration.InstanceRoleArn`: Container application code uses this Role calling AWS APIs. S3 access, Secrets Manager reads, DynamoDB queries, etc. require permissions granted to this role. ECS's Task Role equivalent.

> 💡 **Related Theory**: App Runner's two-Role distinction is identical to ECS's Task Execution Role vs Task Role pattern. "Service pulling images" permission (AccessRole = Task Execution Role) and "application accessing AWS services" permission (InstanceRole = Task Role) are separated. This separation implements least privilege principle—image pull permission doesn't automatically grant DynamoDB access, and DynamoDB permission doesn't automatically grant ECR cross-image pull.

## App Runner Auto Scaling: MaxConcurrency-Based

App Runner's auto-scaling differs from ECS Fargate's CPU/memory-based. **MaxConcurrency**—maximum simultaneous requests per instance—is the scaling basis.

```bash
# Create auto-scaling configuration
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name high-concurrency \
  --max-concurrency 100 \
  --max-size 25 \
  --min-size 2
```

Operation: When total simultaneous requests across all running instances approaches `MaxConcurrency × instance count`, new instances start. With `MaxConcurrency=100` and 2 running instances, hitting 200 concurrent requests triggers scale-out.

Setting `min-size=0` scales to 0 instances when no traffic—cost becomes $0, but first request experiences Cold Start. `min-size=1` always keeps minimum instance ready, eliminating Cold Start.

> 🔍 **Deep Dive**: App Runner's MaxConcurrency-based scaling specializes in "concurrency." Web APIs can have low CPU yet high latency with many simultaneous requests—50% CPU handling 1000 concurrent requests means each request has long response time. MaxConcurrency uses this latency increase as scaling signal. I/O-bound workloads like Go goroutine or Node.js event loop make concurrency more important than CPU. App Runner selecting MaxConcurrency as primary metric reflects web API workload characteristics.

## App Runner VPC Integration: Connector and Private Ingress

Initial App Runner was internet-only isolated from VPC. Two features overcome this:

**VPC Connector (Outbound)**:

Enables App Runner instances to outbound-connect to VPC resources (RDS, ElastiCache, internal services). App Runner → VPC direction. Inbound from VPC to App Runner still needs public internet endpoint (without Private Ingress).

```bash
# Create VPC Connector
VPC_CONNECTOR_ARN=$(aws apprunner create-vpc-connector \
  --vpc-connector-name checkout-vpc-connector \
  --subnets subnet-private-1 subnet-private-2 \
  --security-groups sg-apprunner-access \
  --query 'VpcConnector.VpcConnectorArn' --output text)

# Attach VPC Connector to Service
aws apprunner update-service \
  --service-arn arn:aws:apprunner:...:service/checkout-api \
  --network-configuration "{
    \"EgressConfiguration\": {
      \"EgressType\": \"VPC\",
      \"VpcConnectorArn\": \"${VPC_CONNECTOR_ARN}\"
    }
  }"
```

**Private Ingress (Inbound, 2023+)**:

Restrict App Runner Service access to VPC internals only. VPC Endpoint + VPC Ingress Connection configured. Suitable for internal microservices requiring no public internet endpoint.

```bash
# Create VPC Ingress Connection
aws apprunner create-vpc-ingress-connection \
  --service-arn arn:aws:apprunner:...:service/checkout-api \
  --vpc-ingress-connection-name checkout-private-ingress \
  --ingress-vpc-configuration '{
    "VpcId": "vpc-abc123",
    "VpcEndpointId": "vpce-xyz456"
  }'
```

> ⚠️ **Trap**: App Runner VPC Connector is **unidirectional outbound only**. VPC Connector enables App Runner → VPC, not VPC → App Runner. Even with VPC Connector, VPC internal servers can't directly HTTP-request App Runner Service—they access through public internet endpoint (Private Ingress required for private access). Private Ingress configuration lets VPC Endpoint access; public endpoint must disable—choose one.

## App Runner vs ECS Fargate vs EKS: Abstraction Level Selection Criteria

| Criterion | App Runner | ECS Fargate | EKS |
|------|------------|-------------|-----|
| **Abstraction Level** | Highest | Middle | Lowest |
| **Setup Time** | Minutes | Hours | Days |
| **Customization** | Limited | Rich | Unlimited |
| **Cost (small scale)** | Cheap (usage-based) | Middle | Expensive (control plane $73/month) |
| **Non-HTTP Workloads** | Not supported | Supported | Supported |
| **VPC Integration** | VPC Connector (outbound) | Full integration | Full integration |
| **Scaling Metric** | MaxConcurrency | CPU/memory/ALB RPS | HPA (CPU/memory/custom) |
| **Suitable Workload** | Simple web API | General containers | Complex microservices, ML, Stateful |
| **Blue/Green Deployment** | Built-in (automatic) | CodeDeploy required | ArgoCD/Flux |

Exam selection criteria:
- "Simple web API, minimal operations, fast launch" → App Runner
- "Complex communication, policy, Stateful, non-HTTP protocol" → EKS
- "Full ECS control, relatively simple deployment" → ECS Fargate
- "No auto-scaling needed, most simple, fixed-price" → Lightsail Containers (frequently exam trap answer; lacks auto-scaling)

> 📚 **Case Study**: Notion's App Runner adoption. 2022, Notion migrated internal microservices to App Runner. Reason: small teams consumed time with ECS complexity (Task Definition revision management, ALB rule, Target Group connection). Post App Runner, new microservice deployment time shortened from 1-2 days to 1-2 hours. However, complex service mesh and sidecar-requiring services remained on EKS—App Runner supports single container only.

## ECS Copilot CLI: ECS's User-Friendly Abstraction

ECS Copilot (2020 GA), AWS open-source CLI tool, defines entire ECS environment via Manifest file and deploys via CLI commands. Internally generates and manages CloudFormation.

```bash
# App initialization (Organizations/App level)
copilot app init my-store

# Add environment (VPC, ECS cluster auto-created)
copilot env init --name prod --profile prod-aws-profile

# Add service (ALB, ECS Service, Task Definition auto-created)
copilot svc init \
  --svc-type "Load Balanced Web Service" \
  --name api \
  --dockerfile ./Dockerfile

# Deploy
copilot svc deploy --name api --env prod

# Auto-generate pipeline (CodePipeline + CodeBuild)
copilot pipeline init
copilot pipeline deploy
```

**Manifest File** (`copilot/api/manifest.yml`):

```yaml
name: api
type: Load Balanced Web Service

image:
  build: Dockerfile
  port: 8080

http:
  path: '/'
  healthcheck: '/health'

cpu: 256
memory: 512
count: 2  # Or count: {range: 2-10, cpu_percentage: 70} (Auto Scaling)

network:
  vpc:
    placement: 'private'

secrets:
  DB_PASSWORD: /myapp/prod/db-pass  # SSM Parameter Store

storage:
  databases:
    - name: orders
      engine: PostgreSQL  # Aurora Serverless auto-created + connected
```

Copilot auto-creates:
- VPC (subnets, Internet Gateway, NAT Gateway)
- ECS cluster
- ALB + Target Group + Listener Rule
- ECS Service + Task Definition
- CloudWatch Log Group
- IAM Roles (Task Execution Role + Task Role)
- Security Groups
- CodePipeline + CodeBuild (pipeline init execution)

> 🔍 **Deep Dive**: Copilot's internals resemble AWS CDK—"Infrastructure as Intent" pattern. Developers declare "this service is HTTP API running port 8080 intent"; Copilot generates concrete CloudFormation resources achieving this intent. CDK uses TypeScript for infrastructure; Copilot uses YAML Manifest. Key difference: Copilot specializes in "ECS service deployment"—specific domain gives simpler code than generic tools (CDK, Terraform) for ECS.

Copilot Pipeline structure:
```
GitHub main push
    ↓
CodePipeline (created by copilot pipeline deploy)
    ↓
CodeBuild (docker build + copilot svc deploy)
    ├── staging deployment (manual approval)
    └── production deployment
```

`copilot/pipelines/*/manifest.yml`:
```yaml
name: my-store-pipeline
version: 1
source:
  provider: GitHub
  properties:
    branch: main
    repository: https://github.com/my-org/my-store
stages:
  - name: test
    test_commands:
      - make test
  - name: prod
    requires_approval: true
```

> 💡 **Related Theory**: ECS Copilot's Manifest approach is **declarative deployment** implementation. Declare "what you want" (final state); tool determines "how to achieve it" (procedure). Kubernetes YAML manifests follow same philosophy. Opposite is imperative deployment—step-by-step API calls (`aws ecs create-service`, `aws elbv2 create-listener`). Declarative approach automatically computes difference between current state and desired state, applying only necessary changes. Copilot using CloudFormation internally—CloudFormation itself is declarative IaC tool—explains why.

## App Runner Monitoring and Observability

App Runner auto-integrates CloudWatch and X-Ray.

CloudWatch Metrics (auto-collected):
- `ActiveInstances`: currently running instances
- `RequestLatency`: response time (P50, P75, P99)
- `4xxStatusRate`, `5xxStatusRate`: HTTP error rate
- `HttpRequestCount`: total requests

X-Ray integration:
```bash
aws apprunner update-service \
  --service-arn arn:aws:apprunner:...:service/checkout-api \
  --observability-configuration '{
    "ObservabilityEnabled": true,
    "ObservabilityConfigurationArn": "arn:aws:apprunner:...:observabilityconfiguration/DefaultConfiguration"
  }'
```

CloudWatch Logs:
- `/aws/apprunner/<service>/<id>/application`: application logs (stdout/stderr)
- `/aws/apprunner/<service>/<id>/system`: App Runner system logs (deployment, scaling)

> 🎯 **Scenario**: Startup launching first web API. 3-person team, no infrastructure expert. Requirements: (1) fast deployment, (2) auto-scale on traffic, (3) automatic HTTPS, (4) PostgreSQL database. Options: ECS Fargate (requires Task Definition, ALB, Target Group, Security Group configuration), App Runner (point to image; auto-handle rest). Choice: App Runner + VPC Connector for RDS access. ECR image push auto-deploys. MaxConcurrency=50 for scaling. HTTPS automatic. Six months later, team grows and complex microservice architecture needed; Copilot-based ECS Fargate transition and finer control adoption becomes natural evolutionary path.

## App2Container: Containerizing Legacy Apps

App2Container automates containerization of Java/.NET applications running on EC2 or on-premises servers. Analyzes running server processes, auto-generating Dockerfile and ECS/EKS deployment configuration.

```bash
# App2Container analysis (runs on application server)
sudo app2container analyze --application-id java-app-1234

# Containerize + ECR Push
sudo app2container containerize --application-id java-app-1234

# Generate ECS Task Definition + CloudFormation
sudo app2container generate app-deployment --application-id java-app-1234
```

On exam, "on-premises Java app container migration" keyword → App2Container is answer.

## Summary

App Runner is optimal for "simple web API + minimal operations." AutoDeploymentsEnabled provides ECR push auto-deploy; MaxConcurrency-based auto-scaling; VPC Connector for RDS access. Two-Role separation (AccessRole = ECR pull, InstanceRole = app AWS API) implements least privilege.

ECS Copilot abstracts ECS Fargate's CloudFormation complexity behind Manifest YAML. Prefix `copilot pipeline deploy` generates CodePipeline. Can directly modify Copilot-generated CloudFormation stacks.

Selection: "HTTP API + minimal operations" → App Runner. "ECS + simple config" → Copilot. "Complex orchestration, sidecars, service mesh" → EKS. Lightsail Containers lack auto-scaling—frequent exam trap answer.

---

## 📝 Practice Questions

**Question 1.** Which service is most appropriate for the scenario "a simple web API, a team of 3, no infrastructure expert, automatic scaling required"?

A) EC2 + ALB + Auto Scaling Group  
B) ECS Fargate + Application Auto Scaling  
C) AWS App Runner  
D) Lightsail Containers  

**Answer: C**  
Explanation: App Runner is the topmost level of abstraction and supports automatic scaling without infrastructure configuration. Lightsail Containers (D) does not support auto scaling, so it is the exam trap answer. ECS Fargate (B) requires complex configuration such as a task definition, ALB, and target groups.

---

**Question 2.** How do you configure an App Runner service to deploy automatically when a new image is pushed to ECR?

A) Detect the ECR push event with an EventBridge rule and call apprunner:UpdateService from Lambda  
B) Set `AutoDeploymentsEnabled: true` when creating the service  
C) Connect an ECR source action in CodePipeline  
D) Monitor the ECR push event with CloudWatch Events  

**Answer: B**  
Explanation: App Runner AutoDeploymentsEnabled automatically detects ECR image changes and triggers a deployment. No additional Lambda or EventBridge configuration is needed. For GitHub source-based services, it automatically detects GitHub commits.

---

**Question 3.** What configuration is needed to access an RDS PostgreSQL database inside a VPC from App Runner?

A) Set up VPC peering  
B) Create a VPC connector + attach it to the service (outbound only)  
C) Work around it through a NAT gateway  
D) Create a Lambda proxy function  

**Answer: B**  
Explanation: A VPC connector provides outbound connectivity from App Runner to resources inside the VPC (RDS, ElastiCache). A VPC connector is one-way — only the App Runner → VPC direction is possible. For inbound from the VPC to App Runner, you must use private ingress (a VPC ingress connection).

---

**Question 4.** What is the key difference between App Runner auto scaling and ECS Fargate?

A) App Runner is memory-based, ECS is CPU-based  
B) App Runner is based on MaxConcurrency (the number of concurrent requests per instance), while ECS is based on CPU/memory/ALB RPS  
C) App Runner supports only manual scaling  
D) App Runner does not support scale in  

**Answer: B**  
Explanation: The default auto scaling metric of App Runner is MaxConcurrency — the number of concurrent requests a single instance handles. When current concurrent requests exceed MaxConcurrency × the number of instances, a new instance is started. ECS uses various metrics through Application Auto Scaling, such as CPU, memory, and the number of ALB requests.

---

**Question 5.** What does `copilot pipeline init` of the ECS Copilot CLI create automatically?

A) Terraform files  
B) A CloudFormation stack containing the CodePipeline + CodeBuild configuration  
C) A GitHub Actions workflow file  
D) Kubernetes Helm Chart  

**Answer: B**  
Explanation: Copilot uses CloudFormation internally. `copilot pipeline init` generates `copilot/pipelines/<name>/manifest.yml`, and `copilot pipeline deploy` deploys it as a CodePipeline + CodeBuild CloudFormation stack. This pipeline automatically runs `copilot svc deploy` on git push to update the ECS service.

---

**Question 6.** What is the difference between the App Runner AccessRole and InstanceRole?

A) AccessRole is for log collection, InstanceRole is for ECR pull  
B) AccessRole is the permission of the App Runner service itself to pull images from ECR, and InstanceRole is the permission for application code in the container to call AWS APIs  
C) AccessRole and InstanceRole are the same role  
D) AccessRole is for VPC connector access, InstanceRole is for writing CloudWatch logs  

**Answer: B**  
Explanation: The AccessRole (= the ECS task execution role) is assumed by `build.apprunner.amazonaws.com` and used to pull images from ECR. The InstanceRole (= the ECS task role) is used when application code running in the container accesses AWS services such as S3, DynamoDB, and Secrets Manager. If you confuse the two roles, a security vulnerability arises from granting excessive application permissions to the role that pulls images.

---

**Question 7.** Which AWS service migrates "a Java application running on an on-premises server to ECS Fargate with minimal code changes"?

A) AWS Migration Hub  
B) App2Container  
C) ECS Copilot  
D) AWS Server Migration Service  

**Answer: B**  
Explanation: App2Container is a tool that analyzes running Java (and also .NET) processes and automatically generates a Dockerfile and ECS/EKS deployment configuration. If you install App2Container on the server and run `analyze` → `containerize` → `generate app-deployment` in order, containerization, the ECR push, and even CloudFormation stack creation are automated. For the keyword "legacy app containerization migration," the answer is App2Container.
