# Day 3 - 대규모 ECS/EKS 운영 케이스

📅 날짜: Week 15 (Day 3)
🎯 주제: 100+ 마이크로서비스를 운영하는 컨테이너 플랫폼 케이스
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ECS Fargate vs EKS 선택 기준과 혼합 운영 전략 이해
- GitOps(Argo CD/Flux)와 CodePipeline의 역할 분리
- 대규모 클러스터의 노드 비용/관찰성/보안 자동화

---

## 🧩 사전 지식 (CS 기초)

- **Cluster Autoscaling**: 노드 수를 워크로드에 맞춰 자동 조정.
- **HPA/VPA**: 파드 수평/수직 오토스케일.
- **Sidecar**: 메인 컨테이너 옆에 같이 뜨는 보조 컨테이너(로그, 프록시).

---

## 📖 시나리오

**회사 프로필:**
- 100+ 마이크로서비스, 트래픽 피크 10만 RPS
- 결제계는 EKS(세밀 제어), 일반계는 ECS Fargate
- 멀티 리전(서울/도쿄) Active-Active
- 팀: 60명 개발자, 6명 SRE
- 비용 최적화 압박 (전년 대비 20% 감축)

### 1. 플랫폼 선택 기준

| 워크로드 특성 | 선택 |
|---------------|------|
| 단순 웹/배치, 운영 부담 최소 | **ECS Fargate** |
| 커스텀 스케줄러, Service Mesh 풍부 | **EKS** |
| 비용 민감 대규모 long-running | **EKS + Karpenter + Spot** |
| 매우 짧은 작업 | **Lambda 또는 Fargate** |

### 2. EKS 노드 전략

- **Karpenter** 도입 → Cluster Autoscaler 대비 빠른 스케줄링
- On-Demand + Spot 혼합 (결제계는 On-Demand 비율 유지)
- Graviton(arm64) 노드 그룹 별도 → 30~40% 비용 절감
- Pod Disruption Budget(PDB) + Topology Spread Constraints

### 3. GitOps 도입

```
GitHub (App Repo)            GitHub (Manifests Repo)
      │                              │
      │ CodePipeline                 │ Argo CD watches
      ▼                              ▼
  Build → Image to ECR ─► Manifests bump (Image Tag) ─► EKS
```

- 애플리케이션 빌드는 **CodePipeline/GitHub Actions**
- 매니페스트는 별도 레포에 Argo CD가 reconcile
- 롤백은 Git revert → 자동 재배포

### 4. ECS Fargate 영역

- 100+ 서비스 중 70%가 단순 Fargate 서비스
- CodeDeploy Blue/Green + ALB Listener 트래픽 시프트
- Task Definition은 CDK로 IaC → 환경별 파라미터화
- App Mesh 또는 ECS Service Connect

### 5. 관찰성

- **Container Insights** 활성화 (ECS/EKS)
- **ADOT Collector** DaemonSet → CloudWatch + Managed Prometheus
- **FireLens(Fluent Bit)** 사이드카로 로그 전송
- **X-Ray ADOT 통합** End-to-End Trace
- Grafana Managed로 대시보드 통합

### 6. 보안

- EKS: Pod Identity (IRSA → Pod Identity 진화) → 파드별 IAM
- Image: ECR Scan + Inspector + Image Signing(Cosign + Signer)
- RBAC + OPA Gatekeeper / Kyverno로 정책 강제
- Network: VPC CNI + Security Group for Pods
- Secrets: External Secrets Operator로 Secrets Manager 동기화

### 7. 비용 최적화

| 항목 | 액션 |
|------|------|
| 노드 | Karpenter + Spot + Graviton |
| 미사용 파드 | VPA 권고 적용 |
| Idle 클러스터 | 야간 환경 자동 축소 (EventBridge → Lambda) |
| ECR 이미지 누적 | Lifecycle Policy로 자동 삭제 |
| Fargate Spot | 비핵심 워크로드 적용 |
| 가시화 | Kubecost / AWS Cost Categories |

---

## 🧠 알아두면 좋은 심화 이론

### Karpenter vs Cluster Autoscaler

| 항목 | CA | Karpenter |
|------|----|-----------|
| 노드 그룹 | ASG 필수 | ASG 없이 직접 |
| 스케줄링 속도 | 분 단위 | 초 단위 |
| 인스턴스 선택 | 사전 정의 | 동적 |
| Spot 처리 | 가능 | 더 유연 |

시험에는 "빠른 스케일 + 다양한 인스턴스 동적 선택" → Karpenter가 정답.

### IRSA → Pod Identity

- IRSA: OIDC Provider + 어노테이션 기반
- Pod Identity: 어소시에이션 직접, OIDC 셋업 불필요, EKS Add-on
- 신규 클러스터는 **Pod Identity 권장**

### Service Mesh

- **App Mesh(곧 EOS 경향)**: ECS/EKS 통합, X-Ray 연계
- **VPC Lattice**: 멀티 클러스터/VPC mesh 대체 (시험 출제 ↑)
- **Istio**: 풀 컨트롤, 운영 부담 큼

---

## 🏗️ 아키텍처 다이어그램

```
Large-Scale Container Platform
==================================================

  App Repo ─► CodePipeline ─► CodeBuild ─► ECR
                                            │
                                            ▼
                                   Manifests Repo bump
                                            │
                                            ▼
                                  Argo CD (EKS in-cluster)
                                            │
                                            ▼
   ┌──────────────────────────┐    ┌──────────────────────────┐
   │ EKS Cluster (결제계)     │    │ ECS Fargate (일반계)     │
   │ - Karpenter              │    │ - Service Connect        │
   │ - IRSA/Pod Identity      │    │ - CodeDeploy Blue/Green  │
   │ - PDB/HPA/VPA            │    │ - FireLens               │
   │ - External Secrets Op.   │    │ - Container Insights     │
   └──────────────┬───────────┘    └─────────────┬────────────┘
                  │                              │
                  ▼                              ▼
            ADOT + Container Insights + X-Ray + Prometheus
                              │
                              ▼
                      CloudWatch + Managed Grafana
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Karpenter가 대규모 스케줄링 + 비용 최적화 표준
2. ⭐ GitOps(Argo/Flux)로 매니페스트와 빌드 파이프라인 분리
3. ⭐ EKS Pod Identity가 IRSA의 후속, 신규 권장
4. ⭐ Container Insights + ADOT + FireLens = 컨테이너 관찰성 3종
5. ⭐ Graviton + Spot + Fargate Spot 조합으로 컨테이너 비용 30~40% 절감

---

## 💻 AWS CLI 예시

```bash
# 1) EKS 클러스터 + Karpenter 설치 (Helm)
helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --namespace karpenter --create-namespace \
  --set "settings.clusterName=prod" \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=arn:aws:iam::ACCT:role/Karpenter"

# 2) Pod Identity Association
aws eks create-pod-identity-association \
  --cluster-name prod \
  --namespace billing --service-account svc-billing \
  --role-arn arn:aws:iam::ACCT:role/BillingPodRole

# 3) ECS Fargate Service (CodeDeploy Blue/Green)
aws ecs create-service \
  --cluster fargate-prod --service-name api \
  --task-definition api:42 --desired-count 5 \
  --deployment-controller type=CODE_DEPLOY \
  --load-balancers ...

# 4) Container Insights 활성화
aws ecs update-cluster-settings \
  --cluster fargate-prod --settings name=containerInsights,value=enabled

# 5) ECR Lifecycle Policy
aws ecr put-lifecycle-policy --repository-name api \
  --lifecycle-policy-text file://lifecycle.json
```

---

## 📝 연습 문제 (Pro 시나리오형 6문항)

**1.** EKS에서 분 단위가 아닌 초 단위로 다양한 인스턴스 타입을 동적으로 띄우려면?
A) Cluster Autoscaler B) **Karpenter**
C) ASG Scheduled Action D) Spot Fleet
**정답: B**

**2.** 매니페스트 변경을 Git revert 한 번으로 자동 롤백시키는 표준?
A) CodeDeploy Manual B) Lambda Hook
C) **GitOps (Argo CD/Flux)**
D) CloudFormation Drift
**정답: C**

**3.** 신규 EKS에서 OIDC 셋업 없이 파드 IAM을 부여하는 방법?
A) IRSA B) **EKS Pod Identity**
C) Instance Profile만 D) AssumeRoleWithWebIdentity
**정답: B**

**4.** ECS Fargate 100개 서비스의 트래픽 시프트 표준?
A) Lambda Alias B) **CodeDeploy Blue/Green + ALB Listener**
C) Route 53 Weighted D) ECS rolling only
**정답: B**

**5.** 컨테이너 로그를 CloudWatch + Kinesis + S3에 동시에 분기?
A) CloudWatch Agent B) **FireLens(Fluent Bit) 사이드카**
C) Logstash D) X-Ray
**정답: B**

**6.** 컨테이너 비용 30~40% 절감 최우선 액션 1개?
A) Reserved Instance B) **Graviton(arm64) + Spot 노드 그룹**
C) Region 이동 D) S3 IA
**정답: B**

---

## 📌 오늘의 요약

1. ECS Fargate는 단순 운영, EKS는 세밀 제어/Mesh
2. Karpenter = 차세대 노드 오토스케일러
3. GitOps로 매니페스트와 빌드 분리, 롤백은 Git revert
4. Pod Identity가 IRSA의 후속 표준
5. Container Insights + ADOT + FireLens가 관찰성 3종
