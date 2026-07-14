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

## 📝 연습 문제

**문제 1.** "단순 웹 API, 3인 팀, 인프라 전문가 없음, 자동 스케일링 필요"라는 시나리오의 가장 적절한 서비스는?

A) EC2 + ALB + Auto Scaling Group  
B) ECS Fargate + Application Auto Scaling  
C) AWS App Runner  
D) Lightsail Containers  

**정답: C**  
해설: App Runner가 추상화 최상위이며 인프라 설정 없이 자동 스케일링을 지원한다. Lightsail Containers(D)는 Auto Scaling을 지원하지 않으므로 시험 함정 답이다. ECS Fargate(B)는 Task Definition, ALB, Target Group 등 복잡한 설정이 필요하다.

---

**문제 2.** App Runner Service가 ECR에 새 이미지 push 시 자동으로 배포되도록 설정하는 방법은?

A) EventBridge Rule로 ECR push 이벤트 감지 후 Lambda에서 apprunner:UpdateService 호출  
B) Service 생성 시 `AutoDeploymentsEnabled: true` 설정  
C) CodePipeline의 ECR Source Action 연결  
D) CloudWatch Events로 ECR push 이벤트 모니터링  

**정답: B**  
해설: App Runner의 AutoDeploymentsEnabled가 ECR 이미지 변경을 자동으로 감지해 배포를 트리거한다. 추가적인 Lambda나 EventBridge 설정이 필요 없다. GitHub 소스 기반에서는 GitHub 커밋을 자동 감지한다.

---

**문제 3.** App Runner에서 VPC 안의 RDS PostgreSQL에 접근하려면 어떤 구성이 필요한가?

A) VPC Peering 설정  
B) VPC Connector 생성 + Service에 연결 (아웃바운드 전용)  
C) NAT Gateway를 통한 우회  
D) Lambda 프록시 함수 생성  

**정답: B**  
해설: VPC Connector가 App Runner에서 VPC 내부 리소스(RDS, ElastiCache)로의 아웃바운드 연결을 제공한다. VPC Connector는 단방향—App Runner → VPC 방향만 가능하다. VPC에서 App Runner로의 인바운드는 Private Ingress(VPC Ingress Connection)를 사용해야 한다.

---

**문제 4.** App Runner의 Auto Scaling이 ECS Fargate와 다른 핵심 차이는?

A) App Runner는 메모리 기반, ECS는 CPU 기반  
B) App Runner는 MaxConcurrency(인스턴스당 동시 요청 수) 기반, ECS는 CPU/메모리/ALB RPS 기반  
C) App Runner는 수동 스케일링만 지원  
D) App Runner는 스케일 인(축소)을 지원하지 않음  

**정답: B**  
해설: App Runner의 Auto Scaling 기본 지표는 MaxConcurrency—하나의 인스턴스가 처리하는 동시 요청 수다. 현재 동시 요청이 MaxConcurrency × 인스턴스 수를 초과하면 새 인스턴스가 시작된다. ECS는 Application Auto Scaling을 통해 CPU, 메모리, ALB 요청 수 등 다양한 지표를 사용한다.

---

**문제 5.** ECS Copilot CLI의 `copilot pipeline init`이 자동으로 생성하는 것은?

A) Terraform 파일  
B) CodePipeline + CodeBuild 구성이 담긴 CloudFormation 스택  
C) GitHub Actions 워크플로우 파일  
D) Kubernetes Helm Chart  

**정답: B**  
해설: Copilot은 내부적으로 CloudFormation을 사용한다. `copilot pipeline init`은 `copilot/pipelines/<name>/manifest.yml`을 생성하고, `copilot pipeline deploy`로 이를 CodePipeline + CodeBuild CloudFormation 스택으로 배포한다. 이 파이프라인이 git push 시 자동으로 `copilot svc deploy`를 실행해 ECS Service를 업데이트한다.

---

**문제 6.** App Runner의 AccessRole과 InstanceRole의 차이는?

A) AccessRole은 로그 수집, InstanceRole은 ECR pull  
B) AccessRole은 ECR에서 이미지를 pull하는 App Runner 서비스 자체의 권한, InstanceRole은 컨테이너 내 애플리케이션 코드가 AWS API를 호출하는 권한  
C) AccessRole과 InstanceRole은 동일한 역할  
D) AccessRole은 VPC Connector 접근, InstanceRole은 CloudWatch 로그 쓰기  

**정답: B**  
해설: AccessRole(=ECS Task Execution Role)은 `build.apprunner.amazonaws.com`이 AssumeRole해서 ECR에서 이미지를 pull하는 데 사용한다. InstanceRole(=ECS Task Role)은 컨테이너 내에서 실행되는 애플리케이션 코드가 S3, DynamoDB, Secrets Manager 등 AWS 서비스에 접근할 때 사용한다. 두 Role을 혼동하면 이미지를 pull하는 Role에 애플리케이션 권한을 과도하게 부여하는 보안 취약점이 생긴다.

---

**문제 7.** "온프레미스 서버에서 실행 중인 Java 애플리케이션을 최소 코드 변경으로 ECS Fargate로 마이그레이션"하는 AWS 서비스는?

A) AWS Migration Hub  
B) App2Container  
C) ECS Copilot  
D) AWS Server Migration Service  

**정답: B**  
해설: App2Container는 실행 중인 Java(.NET도 지원) 프로세스를 분석해 Dockerfile과 ECS/EKS 배포 설정을 자동 생성하는 도구다. 서버에 App2Container를 설치하고 `analyze` → `containerize` → `generate app-deployment` 순서로 실행하면 컨테이너화와 ECR push, CloudFormation 스택 생성까지 자동화된다. "레거시 앱 컨테이너화 마이그레이션"이라는 키워드에는 App2Container가 답이다.
