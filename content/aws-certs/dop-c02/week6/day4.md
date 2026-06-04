# Day 4 - App Runner와 ECS Copilot: 컨테이너 운영 추상화의 스펙트럼

ECS와 EKS는 강력하지만 운영 복잡도가 높다. Task Definition, Service, ALB Target Group, Security Group, IAM Role—ECS 하나를 제대로 운영하려면 수십 개의 AWS 리소스를 관리해야 한다. 스타트업이나 작은 팀이 웹 API 하나를 배포하는 데 이 모든 것이 필요한가?

App Runner는 이 질문에 "아니오"로 답하는 서비스다. "소스 코드나 이미지를 주면 나머지는 내가 알아서"—빌드, 배포, 로드 밸런싱, SSL, Auto Scaling, 모니터링을 AWS가 완전히 관리한다. ECS Copilot은 그 중간 지점이다—ECS의 완전한 제어권을 유지하면서 복잡한 리소스 설정을 CLI 추상화로 숨긴다.

오늘은 이 추상화 스펙트럼을 이해하고, 시험에서 "어떤 상황에 어떤 서비스를 선택하는가"를 즉각 판단하는 능력을 기른다.

> 💡 **관련 이론**: 컨테이너 서비스의 추상화 스펙트럼은 소프트웨어 공학의 **추상화 계층(Abstraction Layer)** 개념의 인프라 적용이다. 낮은 레벨(EKS EC2)은 최대 제어권과 최대 복잡도를, 높은 레벨(App Runner)은 최소 제어권과 최소 복잡도를 제공한다. 어느 레벨이 "좋은가"가 아니라 "어떤 요구사항에 맞는가"가 선택 기준이다. Unix 철학의 "한 가지 일을 잘 하는 도구들의 조합"처럼, AWS 컨테이너 서비스는 서로 다른 추상화 수준의 레이어를 제공하고 사용자가 적합한 레이어를 선택한다.

## AWS App Runner: "배포만 하세요, 나머지는 우리가"

App Runner는 2021년 출시된 완전 관리형 컨테이너 PaaS(Platform-as-a-Service)다. 개발자가 Dockerfile이나 소스 코드를 가리키면, App Runner가 빌드(소스 기반의 경우) → 이미지 실행 → HTTPS 엔드포인트 생성 → Auto Scaling 구성을 자동으로 처리한다.

**Source 유형 두 가지**:

첫째, ECR 이미지 기반. 이미 빌드된 컨테이너 이미지를 ECR에서 직접 가져와 실행한다. CI/CD 파이프라인에서 이미지를 빌드하고 ECR에 push하면, App Runner가 새 이미지를 감지해 자동 배포한다.

둘째, GitHub 소스 기반. GitHub 리포지토리를 가리키면 App Runner가 내부 빌드 시스템에서 직접 빌드하고 배포한다. `apprunner.yaml`로 빌드 명령을 정의한다.

| Source Type | Pull | 빌드 주체 |
|-------------|------|----------|
| ECR Private | 이미지 직접 | 외부 CI/CD |
| ECR Public | 이미지 직접 | 외부 CI/CD |
| GitHub | 소스 코드 | App Runner 내부 |

```bash
# ECR 이미지 기반 App Runner Service 생성
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

`AutoDeploymentsEnabled: true`가 핵심이다. ECR에 새 이미지가 push될 때마다 App Runner가 자동으로 Rolling 업데이트를 실행한다. CodePipeline 없이도 "ECR push → 자동 배포"가 가능하다.

**두 가지 Role의 구분**:

`AuthenticationConfiguration.AccessRoleArn`: App Runner 서비스 자체가 ECR에서 이미지를 pull할 때 사용하는 Role. `build.apprunner.amazonaws.com`이 이 Role을 AssumeRole한다. `AWSAppRunnerServicePolicyForECRAccess` 관리형 정책을 사용한다.

`InstanceConfiguration.InstanceRoleArn`: 컨테이너 내 애플리케이션 코드가 AWS API를 호출할 때 사용하는 Role. S3 접근, Secrets Manager 읽기, DynamoDB 쿼리 등에 필요한 권한을 부여한다. ECS의 Task Role과 동일한 역할이다.

> 💡 **관련 이론**: App Runner의 두 Role 구분은 ECS의 Task Execution Role과 Task Role 구분과 동일한 패턴이다. "서비스가 이미지를 가져오는 권한"(AccessRole = Task Execution Role)과 "애플리케이션이 AWS 서비스에 접근하는 권한"(InstanceRole = Task Role)을 분리한다. 이 분리가 최소 권한 원칙의 구현이다—이미지 pull 권한이 있는 Role이 DynamoDB를 읽을 수 없어야 하고, DynamoDB를 읽는 Role이 ECR에서 다른 이미지를 pull할 수 없어야 한다.

## App Runner Auto Scaling: MaxConcurrency 기반

App Runner의 Auto Scaling은 ECS의 CPU/메모리 기반 스케일링과 다르다. **MaxConcurrency**—하나의 인스턴스가 동시에 처리하는 최대 요청 수—를 기준으로 스케일링한다.

```bash
# Auto Scaling 구성 생성
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name high-concurrency \
  --max-concurrency 100 \
  --max-size 25 \
  --min-size 2
```

동작 원리: 모든 실행 중인 인스턴스의 동시 요청 합계가 `MaxConcurrency × 인스턴스 수`에 근접하면 새 인스턴스가 추가된다. `MaxConcurrency=100`으로 2개 인스턴스가 실행 중이면, 200 concurrent requests가 오면 스케일 아웃이 트리거된다.

`min-size=0`으로 설정하면 트래픽이 없을 때 인스턴스를 0개로 줄여 비용이 0이 된다—단 첫 요청에 Cold Start 지연이 발생한다. `min-size=1` 이상이면 항상 최소 1개 인스턴스가 준비 상태로 유지되어 Cold Start가 없다.

> 🔍 **더 깊이**: App Runner의 MaxConcurrency 기반 스케일링은 "동시성(Concurrency)"에 특화된 모델이다. 웹 API는 CPU 사용률이 낮아도 동시 요청이 많으면 레이턴시가 증가한다—CPU 50%인데 1,000개 동시 요청을 처리하면 각 요청의 응답 시간이 길어진다. MaxConcurrency는 이 레이턴시 증가를 스케일링 시그널로 사용한다. Go의 goroutine, Node.js의 event loop처럼 I/O-bound 워크로드는 CPU보다 동시성이 더 중요한 지표다. App Runner가 MaxConcurrency를 기본 지표로 선택한 것은 웹 API 워크로드의 특성을 반영한 설계다.

## App Runner VPC 통합: Connector와 Private Ingress

초기 App Runner는 인터넷에서만 접근 가능했고 VPC와 격리되어 있었다. 이 한계를 극복하기 위한 두 가지 기능이 추가됐다.

**VPC Connector (Outbound)**:

App Runner 인스턴스에서 VPC 내부 리소스(RDS, ElastiCache, 내부 서비스)로의 아웃바운드 연결을 가능하게 한다. App Runner → VPC 방향이다. VPC에서 App Runner로의 인바운드는 여전히 공개 인터넷 엔드포인트를 통해야 한다.

```bash
# VPC Connector 생성
VPC_CONNECTOR_ARN=$(aws apprunner create-vpc-connector \
  --vpc-connector-name checkout-vpc-connector \
  --subnets subnet-private-1 subnet-private-2 \
  --security-groups sg-apprunner-access \
  --query 'VpcConnector.VpcConnectorArn' --output text)

# Service에 VPC Connector 연결
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

VPC 내부에서만 App Runner Service에 접근하도록 제한한다. VPC Endpoint + VPC Ingress Connection으로 구성한다. 공개 인터넷 엔드포인트가 없는 내부 마이크로서비스에 적합하다.

```bash
# VPC Ingress Connection 생성
aws apprunner create-vpc-ingress-connection \
  --service-arn arn:aws:apprunner:...:service/checkout-api \
  --vpc-ingress-connection-name checkout-private-ingress \
  --ingress-vpc-configuration '{
    "VpcId": "vpc-abc123",
    "VpcEndpointId": "vpce-xyz456"
  }'
```

> ⚠️ **함정**: App Runner VPC Connector는 **단방향 아웃바운드**다. VPC Connector가 있어도 VPC 내부 서버가 App Runner 서비스에 직접 HTTP 요청을 보내는 것은 공개 인터넷 엔드포인트를 통해야 한다(Private Ingress 없이). Private Ingress를 설정하면 VPC Endpoint를 통해 비공개 접근이 가능하지만, 이 경우 공개 엔드포인트는 비활성화해야 한다—둘 중 하나를 선택해야 한다. 시험 함정: "App Runner에서 VPC 안의 RDS에 접근"은 VPC Connector(O), "VPC 안에서 App Runner로 접근"은 Private Ingress(O), "VPC Peering"은 틀림(X).

## App Runner vs ECS Fargate vs EKS: 추상화 레벨 선택 기준

| 기준 | App Runner | ECS Fargate | EKS |
|------|------------|-------------|-----|
| **추상화 수준** | 가장 높음 | 중간 | 가장 낮음 |
| **셋업 시간** | 분 | 시간 | 일 |
| **커스터마이징** | 제한적 | 풍부 | 무제한 |
| **비용 (소규모)** | 저렴 (사용량 기반) | 중간 | 비쌈 (control plane $73/월) |
| **HTTP 외 워크로드** | 미지원 | 지원 | 지원 |
| **VPC 통합** | VPC Connector (아웃바운드) | 완전 통합 | 완전 통합 |
| **스케일링 기준** | MaxConcurrency | CPU/메모리/ALB RPS | HPA (CPU/메모리/커스텀) |
| **적합 워크로드** | 단순 웹 API | 일반 컨테이너 | 복잡 마이크로서비스, ML, Stateful |
| **Blue/Green 배포** | 내장 (자동) | CodeDeploy 필요 | ArgoCD/Flux |

시험 선택 기준:
- "단순 웹 API, 운영 부담 최소, 빠른 시작" → App Runner
- "복잡한 통신, 정책, Stateful, HTTP 외 프로토콜" → EKS
- "ECS의 완전한 제어권, 상대적으로 단순한 배포" → ECS Fargate
- "자동 스케일링 없어도 됨, 가장 단순하고 정액제" → Lightsail Containers (시험 함정 답으로 자주 등장, 자동 스케일링 미지원)

> 📚 **사례**: Notion의 App Runner 도입 경험. Notion은 2022년 내부 마이크로서비스 중 일부를 App Runner로 이전했다. 이유는 소규모 팀이 ECS의 복잡한 설정(Task Definition revision 관리, ALB 규칙, Target Group 연결)에 소비하는 시간을 줄이기 위해서였다. App Runner 도입 후 새 마이크로서비스 배포 시간이 1-2일에서 1-2시간으로 단축됐다. 그러나 복잡한 서비스 메시, 사이드카 컨테이너가 필요한 서비스는 EKS를 유지했다—App Runner는 단일 컨테이너 서비스만 지원하기 때문이다.

## ECS Copilot CLI: ECS의 사용자 친화 추상화

ECS Copilot(2020년 GA)은 AWS가 제공하는 오픈소스 CLI 도구로, ECS 환경 전체를 Manifest 파일로 정의하고 CLI 명령으로 배포한다. 내부적으로 CloudFormation을 생성하고 관리한다.

```bash
# 앱 초기화 (Organizations/App 레벨)
copilot app init my-store

# 환경 추가 (VPC, ECS 클러스터 자동 생성)
copilot env init --name prod --profile prod-aws-profile

# 서비스 추가 (ALB, ECS Service, Task Definition 자동 생성)
copilot svc init \
  --svc-type "Load Balanced Web Service" \
  --name api \
  --dockerfile ./Dockerfile

# 배포
copilot svc deploy --name api --env prod

# 파이프라인 자동 생성 (CodePipeline + CodeBuild)
copilot pipeline init
copilot pipeline deploy
```

**Manifest 파일** (`copilot/api/manifest.yml`):

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
count: 2  # 또는 count: {range: 2-10, cpu_percentage: 70} (Auto Scaling)

network:
  vpc:
    placement: 'private'

secrets:
  DB_PASSWORD: /myapp/prod/db-pass  # SSM Parameter Store

storage:
  databases:
    - name: orders
      engine: PostgreSQL  # Aurora Serverless 자동 생성 + 연결
```

Copilot이 자동으로 생성하는 것:
- VPC (서브넷, Internet Gateway, NAT Gateway)
- ECS 클러스터
- ALB + Target Group + Listener Rule
- ECS Service + Task Definition
- CloudWatch Log Group
- IAM Role (Task Execution Role + Task Role)
- Security Group
- CodePipeline + CodeBuild (pipeline init 실행 시)

> 🔍 **더 깊이**: Copilot의 내부 구조는 AWS CDK와 유사한 "Infrastructure as Intent" 패턴이다. 개발자가 "이 서비스는 HTTP API이고 포트 8080에서 실행된다"는 의도를 선언하면, Copilot이 그 의도를 달성하기 위한 구체적인 CloudFormation 리소스를 생성한다. CDK가 TypeScript로 인프라를 정의한다면, Copilot은 YAML Manifest로 정의한다. 중요한 차이는 Copilot이 "ECS 서비스 배포"라는 특정 도메인에 특화되어 있다는 점이다—범용 인프라 정의 도구(CDK, Terraform)보다 ECS 서비스 배포에서 더 적은 코드로 더 많은 것을 자동화한다.

Copilot Pipeline 구조:
```
GitHub main push
    ↓
CodePipeline (copilot pipeline deploy로 생성)
    ↓
CodeBuild (docker build + copilot svc deploy)
    ├── 스테이징 배포 (수동 승인)
    └── 프로덕션 배포
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

> 💡 **관련 이론**: ECS Copilot의 Manifest 방식은 **선언적 배포(Declarative Deployment)**의 구현이다. "무엇을 원하는가"(최종 상태)를 선언하고, 도구가 "어떻게 달성할 것인가"(절차)를 결정한다. Kubernetes의 YAML 매니페스트와 동일한 철학이다. 반대는 명령형 배포(Imperative)—`aws ecs create-service`, `aws elbv2 create-listener` 같은 단계별 API 호출. 선언적 방식은 현재 상태와 원하는 상태의 차이를 자동으로 계산해 필요한 변경만 적용한다. Copilot이 내부적으로 CloudFormation을 사용하는 이유도 CloudFormation 자체가 선언적 IaC 도구이기 때문이다.

## App Runner 모니터링과 관찰성

App Runner는 CloudWatch와 X-Ray와 자동 통합된다.

CloudWatch 메트릭 (자동 수집):
- `ActiveInstances`: 현재 실행 중인 인스턴스 수
- `RequestLatency`: 요청 응답 시간 (P50, P75, P99)
- `4xxStatusRate`, `5xxStatusRate`: HTTP 에러율
- `HttpRequestCount`: 총 요청 수

X-Ray 통합:
```bash
aws apprunner update-service \
  --service-arn arn:aws:apprunner:...:service/checkout-api \
  --observability-configuration '{
    "ObservabilityEnabled": true,
    "ObservabilityConfigurationArn": "arn:aws:apprunner:...:observabilityconfiguration/DefaultConfiguration"
  }'
```

CloudWatch Logs:
- `/aws/apprunner/<service>/<id>/application`: 애플리케이션 로그 (stdout/stderr)
- `/aws/apprunner/<service>/<id>/system`: App Runner 시스템 로그 (배포, 스케일링)

> 🎯 **시나리오**: 스타트업이 첫 웹 API를 런칭한다. 팀은 3명이고 인프라 전문가가 없다. 요구사항: (1) 빠른 배포, (2) 트래픽에 따라 자동 스케일링, (3) HTTPS 자동, (4) 데이터베이스는 RDS PostgreSQL. 고려 옵션: ECS Fargate(Task Definition, ALB, Target Group, Security Group 설정 필요), App Runner(소스만 가리키면 됨). 선택: App Runner + VPC Connector로 RDS 접근. ECR에 이미지 push하면 자동 배포. MaxConcurrency=50으로 스케일링. HTTPS는 자동. 6개월 후 팀이 성장하고 복잡한 마이크로서비스 아키텍처가 필요해지면, Copilot으로 ECS Fargate로 이전하고 더 세밀한 제어를 활용하는 단계적 진화 경로가 자연스럽다.

## App2Container: 레거시 앱의 컨테이너화

App2Container는 EC2나 온프레미스 서버에서 실행 중인 Java/.NET 애플리케이션을 자동으로 컨테이너화하는 도구다. 서버에서 실행 중인 프로세스를 분석하고 Dockerfile과 ECS/EKS 배포 설정을 자동 생성한다.

```bash
# App2Container 분석 (애플리케이션 서버에서 실행)
sudo app2container analyze --application-id java-app-1234

# 컨테이너화 + ECR Push
sudo app2container containerize --application-id java-app-1234

# ECS Task Definition + CloudFormation 생성
sudo app2container generate app-deployment --application-id java-app-1234
```

시험에서 "온프레미스 Java 앱을 컨테이너로 마이그레이션"이라는 키워드가 나오면 App2Container가 답이다.

## 정리하며

App Runner는 "단순 웹 API + 운영 부담 최소"의 시나리오에 최적이다. AutoDeploymentsEnabled로 ECR push 시 자동 배포, MaxConcurrency 기반 Auto Scaling, VPC Connector로 RDS 접근을 지원한다. 두 Role(AccessRole = ECR pull용, InstanceRole = 앱 코드의 AWS API 접근용)의 구분이 최소 권한 원칙을 실현한다.

ECS Copilot은 ECS Fargate를 사용하면서 CloudFormation 복잡성을 숨기는 선언적 도구다. 내부적으로 CloudFormation을 생성하므로 Copilot 생성 스택을 직접 수정할 수 있다. `copilot pipeline init`으로 CodePipeline 파이프라인까지 자동 생성된다.

선택 기준: "HTTP API + 운영 최소" → App Runner. "ECS + 단순한 설정" → Copilot. "복잡한 오케스트레이션, 사이드카, 서비스 메시" → EKS. Lightsail Containers는 자동 스케일링이 없어서 시험 함정 답으로 자주 등장한다.

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
