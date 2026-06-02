# Day 4 - App Runner / Copilot - 컨테이너 추상화

📅 날짜: Week 6 (Day 4)
🎯 주제: 단순 컨테이너 서비스의 자동 배포
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS App Runner의 운영 모델 (Build/Deploy/Scale)을 이해한다
- ECS Copilot CLI로 빠른 ECS 환경 부트스트랩
- Lightsail Containers와의 차이
- 추상화 수준에 따른 시험 선택 기준

---

## 🧩 사전 지식 (CS 기초)

- **PaaS (Platform-as-a-Service)**: 인프라 추상화 + 자동 스케일링.
- **Source-to-deploy**: 소스만 제공하면 자동 빌드+배포.
- **Concurrency Limit**: 단일 인스턴스가 처리하는 동시 요청 수.
- **Cold start**: 0에서 시작하는 첫 요청 지연.

---

## 📖 이론 내용

### 1. AWS App Runner

**핵심 특징:**
- 완전 관리형 컨테이너 PaaS
- 소스 코드(GitHub) 또는 컨테이너 이미지(ECR) 직접 배포
- HTTPS 엔드포인트 자동 (사용자 도메인 매핑)
- VPC Connector로 RDS 접근
- Auto Scaling (1~25 인스턴스 기본, 확장 가능)
- 시간당 + 요청당 과금
- Provisioned vs Active 시간 구분

**Source 종류:**
| Source Type | Pull | 빌드 |
|-------------|------|------|
| ECR (Private) | 이미지 직접 | 외부에서 빌드 |
| ECR Public | 이미지 직접 | 외부에서 빌드 |
| GitHub | 소스 자동 빌드 | App Runner 내부 빌드러너 |

**자동 배포 구성:**
```bash
aws apprunner create-service \
  --service-name myapp \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "8080",
        "RuntimeEnvironmentVariables": {"LOG_LEVEL": "INFO"},
        "RuntimeEnvironmentSecrets": {"DB_PASS": "arn:aws:secretsmanager:...:secret:prod/db"}
      }
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::...:role/AppRunnerECRAccessRole"
    }
  }' \
  --instance-configuration '{
    "Cpu": "1 vCPU", "Memory": "2 GB",
    "InstanceRoleArn": "arn:aws:iam::...:role/AppRunnerInstanceRole"
  }' \
  --auto-scaling-configuration-arn arn:aws:apprunner:...:autoscalingconfiguration/...
```

**Auto Deployments**: ECR에 새 이미지 푸시되면 자동 배포. 또는 GitHub commit.

### 2. App Runner Auto Scaling

```bash
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name standard \
  --max-concurrency 100 \
  --max-size 25 --min-size 1
```

- `MaxConcurrency`: 인스턴스당 동시 요청 수
- 요청량이 초과하면 새 인스턴스 시작
- Min size 0 가능 (Cold start 발생)

### 3. App Runner vs ECS Fargate vs EKS

| 기준 | App Runner | ECS Fargate | EKS |
|------|------------|-------------|-----|
| 추상화 | 가장 높음 | 중간 | 가장 낮음 |
| 셋업 시간 | 분 | 시간 | 일 |
| 커스터마이징 | 제한적 | 풍부 | 무제한 |
| 비용 (소규모) | 저렴 | 중간 | 비쌈 (control plane $73/월) |
| HTTP 외 워크로드 | 미지원 | 지원 | 지원 |
| VPC 통합 | VPC Connector (단방향 outbound) | 완전 통합 | 완전 통합 |
| 적합 워크로드 | 웹 API, 마이크로서비스 | 일반 컨테이너 | 복잡 마이크로서비스, ML, Stateful |

> 💡 시험에서 "단순 웹 API, 운영 부담 최소" → App Runner. "복잡한 통신·정책" → EKS.

### 4. ECS Copilot CLI

ECS 추상화 도구 (오픈소스). Manifest 기반:

```bash
# 앱 초기화
copilot app init my-store

# 환경 추가
copilot env init --name prod

# 서비스 추가 (자동으로 ALB, ECS Service, Task Definition 생성)
copilot svc init --svc-type "Load Balanced Web Service" --name api --dockerfile ./Dockerfile

# 배포
copilot svc deploy --name api --env prod

# 파이프라인 자동 생성
copilot pipeline init
copilot pipeline deploy
```

**Manifest 예 (`copilot/api/manifest.yml`):**
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
count: 2
network:
  vpc:
    placement: 'private'
secrets:
  DB_PASS: /myapp/prod/db-pass
storage:
  databases:
    - name: orders
      engine: PostgreSQL
```

내부적으로 CloudFormation을 생성/관리.

### 5. Lightsail Containers

- 가장 단순한 컨테이너 호스팅 (정액제)
- Auto Scaling 미지원
- 시험에는 잘 안 나옴 — 함정 답으로 자주 등장

### 6. App2Container

기존 .NET/Java 앱을 컨테이너로 자동 변환 + ECR + ECS/EKS 배포 옵션. 마이그레이션 시나리오.

---

## 🧠 알아두면 좋은 심화 이론

### App Runner VPC Connector

- 단방향 outbound만 — App Runner Pod이 VPC 안의 RDS/ElastiCache 접근 가능
- VPC 내부에서 App Runner Pod에 직접 접근은 불가 (Public endpoint만)
- Private App Runner 옵션(2023+): VPC Endpoint를 통한 사설 접근

### App Runner Private Service

```bash
aws apprunner create-vpc-ingress-connection \
  --service-arn arn:aws:apprunner:...:service/myapp \
  --ingress-vpc-configuration '{
    "VpcId": "vpc-abc",
    "VpcEndpointId": "vpce-xyz"
  }'
```

VPC 내부에서만 접근 가능한 App Runner 서비스 — 내부 마이크로서비스 적합.

### App Runner Observability

- CloudWatch Logs 자동 통합 (App + Service 로그)
- X-Ray 통합 (활성화 시)
- Metrics: ActiveInstances, RequestLatency, 4xx/5xx

### Copilot의 환경 변수 처리

`copilot/<svc>/addons/*.yml` 에 CloudFormation 정의 → 자동 통합. RDS, S3 버킷 등 의존 리소스 자동 생성 + Service에 환경 변수 주입.

### App Runner 비용 모델

- Active 시간 (트래픽 처리 중): vCPU × 시간 + GB × 시간
- Provisioned 시간 (트래픽 없음, 인스턴스 유지): 더 낮은 요율
- Min size 0이면 cold start이지만 비용 0

### 관련 서비스 Cross-Reference

- **CodePipeline ECR Source** → Week 5 Day 1
- **VPC Endpoint** → Week 8 Day 1
- **Secrets Manager** → Week 9 Day 4
- **ECS** → Week 6 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
App Runner Deployment
==================================================

  Developer
      │
      │ docker push
      ▼
  ECR Private Repository
      │
      │ (event detected by App Runner)
      ▼
  App Runner Service (auto-deploy enabled)
      │
      │ Pull new image → Rolling update
      ▼
  App Runner Managed Fleet
   ├─ Instance 1 (1 vCPU, 2GB)
   ├─ Instance 2
   └─ ...
        │
        │ (auto-scale based on MaxConcurrency)
        │
        ▼
   HTTPS endpoint (myapp.ap-northeast-2.awsapprunner.com)
   or custom domain
        │
        ▼
   Optional VPC Connector → RDS in VPC
   Optional Private Ingress → VPC Endpoint

Comparison:
   App Runner   <Higher abstraction>
   ECS Fargate
   EKS Fargate
   ECS EC2
   EKS EC2     <Lower abstraction>
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ App Runner는 가장 추상화 높은 컨테이너 PaaS — 단순 웹 API 적합
2. ⭐ Auto Deployments로 ECR 푸시 자동 배포
3. ⭐ VPC Connector(outbound) vs Private Ingress(inbound) 구분
4. ⭐ Copilot CLI는 ECS Service Catalog 같은 추상화 — 내부적으로 CFN
5. ⭐ Lightsail은 시험 함정 답으로 자주 등장 — 자동 스케일링 X

---

## 💻 실제 예시 - App Runner 자동 배포

```bash
# 1) ECR Repository 생성 (Day 1 참조)
aws ecr create-repository --repository-name myapp

# 2) App Runner Access Role (ECR Pull용)
aws iam create-role --role-name AppRunnerECRAccessRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "build.apprunner.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam attach-role-policy --role-name AppRunnerECRAccessRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess

# 3) App Runner Service 생성 (auto-deploy 활성)
aws apprunner create-service --cli-input-json file://service.json
# service.json: AutoDeploymentsEnabled=true, ImageIdentifier=ECR URI:latest

# 4) ECR에 새 이미지 푸시 → App Runner 자동 감지 → Rolling 배포
docker push 111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:latest

# 5) Auto Scaling Configuration
aws apprunner create-auto-scaling-configuration \
  --auto-scaling-configuration-name spike-friendly \
  --max-concurrency 50 \
  --max-size 25 --min-size 2

aws apprunner update-service \
  --service-arn arn:aws:apprunner:...:service/myapp \
  --auto-scaling-configuration-arn arn:aws:apprunner:...:autoscalingconfiguration/spike-friendly
```

---

## 📝 연습 문제

**문제 1.** "단순 웹 API, 운영 부담 최소, 자동 스케일링" 시나리오의 가장 적절한 서비스는?

A) EC2 + ALB
B) ECS Fargate
C) AWS App Runner
D) Lightsail Containers (Auto Scaling 미지원이므로 함정)

**정답: C**
해설: App Runner가 추상화 최상위 + 자동 스케일링.

---

**문제 2.** App Runner Service가 ECR 새 이미지에 자동 반응하려면?

A) Lambda 트리거 추가
B) `AutoDeploymentsEnabled: true` 설정
C) EventBridge Rule
D) CodePipeline 추가

**정답: B**
해설: Auto Deployments가 App Runner 표준.

---

**문제 3.** App Runner에서 VPC 안의 RDS에 접근하려면?

A) VPC Peering
B) VPC Connector (outbound)
C) Lambda 우회
D) NAT Gateway

**정답: B**
해설: VPC Connector가 표준.

---

**문제 4.** ECS Copilot CLI의 본질은?

A) 새 서비스
B) CloudFormation 템플릿 자동 생성 + ECS 추상화 도구 (manifest.yml)
C) Lambda 함수
D) EKS Helm 대체

**정답: B**
해설: Copilot은 ECS+CFN의 사용자 친화 추상화.

---

**문제 5.** App Runner와 ECS Fargate 중 선택 기준은?

A) App Runner는 항상 더 비싸다
B) 단순 HTTP API + 운영 최소 → App Runner / 복잡 통신·정책 → ECS+
C) Fargate는 GPU 지원
D) App Runner는 Spot 지원

**정답: B**
해설: 추상화 수준이 결정 기준.

---

**문제 6.** App Runner Private Ingress의 용도는?

A) Public 트래픽 처리
B) VPC 내부 마이크로서비스 간 통신용 — Public endpoint 없음
C) NAT 대체
D) S3 접근

**정답: B**
해설: Private Service 옵션. 2023+ 기능.

---

**문제 7.** App Runner의 Auto Scaling 기준 지표는?

A) CPU 사용률
B) MaxConcurrency (인스턴스당 동시 요청 수)
C) Memory 사용률
D) ALB Request Count

**정답: B**
해설: App Runner는 MaxConcurrency 기반 — ECS와 다름.

---

## 📌 오늘의 요약

1. App Runner = 가장 추상화 높은 컨테이너 PaaS, 단순 웹 API 적합
2. Auto Deployments로 ECR 푸시 자동 배포
3. VPC Connector(outbound) + Private Ingress(inbound 2023+)
4. Copilot CLI = ECS+CFN 사용자 친화 추상화
5. Lightsail은 자동 스케일링 X — 함정 답
