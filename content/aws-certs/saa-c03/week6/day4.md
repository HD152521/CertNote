# Day 29 - 컨테이너: ECS, Fargate, EKS, ECR

📅 날짜: Week 6 (Day 4)
🎯 주제: AWS 컨테이너 옵션
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ECS / EKS / Fargate / ECR 역할을 안다
- EC2 launch type vs Fargate를 비용·운영성 trade-off로 본다
- 서비스/태스크/태스크 정의 개념을 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **컨테이너 vs VM**: 컨테이너는 OS 커널 공유, 더 가볍고 빠름.
- **오케스트레이터**: 컨테이너 스케줄·복구·스케일을 책임짐(K8s, ECS).
- **태스크 = 1개 이상의 컨테이너 인스턴스**, 보통 1 Task = 1 Pod 등가.

---

## 📖 이론 내용

### 1. AWS 컨테이너 옵션 4종

| 서비스 | 역할 |
|--------|-----|
| **ECR** | Container Registry (Docker / OCI) |
| **ECS** | AWS 고유 오케스트레이터 |
| **EKS** | Managed Kubernetes |
| **Fargate** | 서버리스 컨테이너 실행 (ECS/EKS의 launch type) |

### 2. ECS 구성요소

- **Task Definition**: 컨테이너 JSON 정의(이미지·CPU·Mem·Port·Role).
- **Task**: 정의의 인스턴스.
- **Service**: 원하는 Task 개수 유지, 롤링 배포.
- **Cluster**: 논리 그룹.
- **Launch Type**: EC2 / Fargate.

### 3. EC2 vs Fargate

| 항목 | EC2 Launch | Fargate |
|------|------------|---------|
| 인프라 관리 | 고객 (AMI, 패치, ASG) | AWS |
| 비용 | EC2 단가 | 태스크 vCPU·Mem 단가 |
| 격리 | 다중 태스크 같은 호스트 | 태스크별 micro-VM |
| 사용 사례 | 큰 클러스터·GPU 필요 | 가변·소규모·운영 단순화 |

### 4. EKS 핵심

- **컨트롤 플레인 관리형**(시간당 비용).
- **워커 노드**: EC2 / Fargate / Managed Node Groups.
- **IRSA (IAM Roles for Service Accounts)** — Pod별 IAM Role.
- **Fargate Profile** — namespace/label로 Fargate 실행.

### 5. 네트워킹

- **awsvpc 모드** (Fargate 디폴트): 태스크마다 ENI → SG를 태스크에 부여.
- **bridge / host** 모드 (EC2 launch).

### 6. 서비스 디스커버리

- **Service Connect** (ECS 새 기능)
- **Cloud Map** (DNS 기반 디스커버리)
- ALB Target Group(가장 흔함)

### 7. 배포 전략

- **Rolling**: ECS Service 기본.
- **Blue/Green** with CodeDeploy: 무중단.
- **Canary** via CodeDeploy.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Task IAM Role** | 태스크에 IAM 권한 부여 | EC2 Instance Profile과 별개 |
| **Capacity Provider** | EC2/Fargate/Spot 혼합 자동 | 비용 + 가용성 |
| **ECS Anywhere / EKS Anywhere** | 온프레미스에서도 ECS/EKS | 하이브리드 |
| **App Mesh** | Service Mesh(레거시) → 대안 검토 | 시험 가벼움 |
| **ECR Cross-Region Replication** | 이미지 복제 | 멀티 리전 배포 |

> ⚠️ **함정**: "운영 노드 패치/스케일 관리 부담 ↓" → **Fargate**. EC2 launch는 ASG로 직접 관리.

> 💡 **암기 팁**: ECS = AWS, EKS = K8s, Fargate = 두 launch type 공유. 이미지 저장은 ECR.

### 관련 서비스 Cross-Reference

- ALB 동적 포트 → Week 3
- IAM Role → Week 1
- CodeDeploy → Pro 시험에서 더 깊이
- VPC awsvpc 모드 → Week 2

---

## 🏗️ 아키텍처 다이어그램

```
[ ECS Fargate 표준 ]

  ALB → Target Group (IP mode)
              │
              ▼
   ECS Service (desired=4)
      │ awsvpc mode (각 태스크 ENI + SG)
      ▼
   Fargate Tasks ── ECR Image
              ├─ Task Role: S3:GetObject, DDB:*
              └─ CloudWatch Logs


[ EKS + IRSA ]

  Pod (ServiceAccount)
    │ OIDC 토큰
    ▼
  STS AssumeRoleWithWebIdentity
    │
    ▼
  IAM Role (per ServiceAccount)
    │
    ▼
  AWS API (S3 / DDB / ...)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Fargate = 서버리스 컨테이너**. 운영 단순화 정답.
2. ⭐ ECS = AWS 고유, EKS = K8s 표준.
3. ⭐ **Task IAM Role**이 컨테이너 → AWS 접근 정답.
4. ⭐ ALB Target Group **IP 타입** + awsvpc 모드 표준.
5. ⭐ **IRSA**가 EKS Pod 단위 IAM.

---

## 💻 실제 예시 - AWS CLI

```bash
# ECR 리포지토리
aws ecr create-repository --repository-name saa-app \
  --image-scanning-configuration scanOnPush=true

# 도커 푸시 (로그인)
aws ecr get-login-password | docker login --username AWS \
  --password-stdin 111122223333.dkr.ecr.ap-northeast-2.amazonaws.com

# ECS Fargate 서비스
aws ecs create-cluster --cluster-name saa-cluster
aws ecs register-task-definition --cli-input-json file://taskdef.json
aws ecs create-service --cluster saa-cluster --service-name saa-svc \
  --task-definition saa-task --desired-count 4 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-...],securityGroups=[sg-...],assignPublicIp=DISABLED}"
```

---

## 📝 연습 문제

**문제 1.** 노드 OS 패치 부담 없이 컨테이너 실행:

A) ECS EC2 launch B) ECS Fargate C) EKS EC2 노드그룹 D) EC2

**정답: B**.

---

**문제 2.** K8s 표준 호환:

A) ECS B) EKS C) Fargate D) ECR

**정답: B**.

---

**문제 3.** Pod별로 다른 IAM 권한:

A) EC2 Instance Profile B) IRSA C) Task IAM Role D) IAM 사용자

**정답: B**.

---

**문제 4.** ECS 태스크가 S3에 접근:

A) Instance Profile만 B) Task Role C) Pod Role D) AccessKey

**정답: B**.

---

**문제 5.** ECS + ALB에서 동일 호스트의 여러 태스크가 동적 포트로 등록:

A) bridge + dynamic port mapping B) host C) awsvpc (각 태스크 ENI) D) overlay

**정답: C** (현대적 권장). 레거시는 A.

---

## 📌 오늘의 요약

1. ECR / ECS / EKS / Fargate 4축이 컨테이너.
2. Fargate가 운영 단순화 정답.
3. Task Role (ECS) / IRSA (EKS)로 권한 분리.
4. awsvpc 모드 + ALB IP TG가 현대 표준.
5. Capacity Provider로 Spot+On-Demand 혼합.
