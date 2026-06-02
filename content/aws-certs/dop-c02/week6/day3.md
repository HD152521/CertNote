# Day 3 - EKS CI/CD - Helm, ArgoCD, Flux (GitOps)

📅 날짜: Week 6 (Day 3)
🎯 주제: Kubernetes 환경의 모던 GitOps 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Push-based vs Pull-based(GitOps) 배포 비교
- Helm Chart vs Kustomize 선택
- ArgoCD vs Flux 운영 차이
- EKS Pod Identity / IRSA 활용
- Karpenter로 노드 자동 프로비저닝

---

## 🧩 사전 지식 (CS 기초)

- **Kubernetes Resource**: Deployment / Service / Ingress / ConfigMap / Secret.
- **Helm**: K8s 패키지 매니저. values.yaml 템플릿.
- **Kustomize**: YAML overlay 도구. 환경별 patch 적용.
- **GitOps**: Git이 단일 진실의 출처. 클러스터가 Git 상태와 sync.
- **Drift Detection**: 실제 상태와 선언적 상태의 차이 감지.

---

## 📖 이론 내용

### 1. EKS 배포 방식 4가지

| 방식 | 특징 | 시험 빈도 |
|------|------|-----------|
| **CodeBuild → kubectl apply** | 단순, 직관적 | 자주 |
| **CodeDeploy** | EKS 직접 미지원 (ECS와 다름) | 함정 |
| **ArgoCD GitOps** | Pull-based, 보안성 ↑ | 자주 |
| **Flux GitOps** | 가벼움, Toolkit 구조 | 종종 |
| **Helm + CodePipeline** | helm upgrade 자동화 | 자주 |

### 2. Helm Chart 기본

```yaml
# Chart.yaml
apiVersion: v2
name: myapp
version: 0.1.0
type: application

# values.yaml
replicaCount: 3
image:
  repository: 111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp
  tag: "abc1234"
service:
  type: ClusterIP
  port: 80

# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-myapp
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
```

배포:
```bash
helm upgrade --install myapp ./chart \
  --namespace prod \
  --set image.tag=abc1234 \
  -f values.prod.yaml
```

### 3. ArgoCD GitOps

**아키텍처:**
```
Git Repository (manifests/Helm/Kustomize)
        ↑                              ↓
        │ (commit)                     │ (continuous sync)
        │                              │
   CI Pipeline (image build)    ArgoCD Controller (in cluster)
                                       │
                                       ▼
                                  Kubernetes API
                                       │
                                       ▼
                                  Pods/Services
```

**ArgoCD Application 예:**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  destination:
    server: https://kubernetes.default.svc
    namespace: prod
  source:
    repoURL: https://github.com/my-org/manifests
    path: prod/myapp
    targetRevision: main
  syncPolicy:
    automated:
      prune: true       # Git에서 삭제된 리소스도 제거
      selfHeal: true    # Drift 자동 수정
    syncOptions:
      - CreateNamespace=true
```

**GitOps의 핵심 이점:**
- 클러스터 자격 증명이 CI 측에 없음 (보안)
- Git 히스토리 = 배포 히스토리 (감사)
- Drift 자동 수정
- 멀티 클러스터 단일 진실 출처

### 4. Flux v2 (Toolkit)

Flux는 단일 도구가 아닌 Toolkit:
- **source-controller**: Git 저장소, Helm, OCI 모니터링
- **kustomize-controller**: Kustomize 적용
- **helm-controller**: Helm 릴리스 관리
- **notification-controller**: 알림 처리
- **image-automation-controller**: 이미지 태그 자동 업데이트

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: myapp
  namespace: flux-system
spec:
  url: https://github.com/my-org/manifests
  ref: {branch: main}
  interval: 1m
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp-prod
spec:
  sourceRef: {kind: GitRepository, name: myapp}
  path: ./prod
  prune: true
  interval: 5m
```

### 5. IRSA (IAM Roles for Service Accounts)

Pod에 IAM Role 매핑:
1. EKS Cluster OIDC Provider 등록
2. IAM Role 생성 + Trust Policy (`token.actions.githubusercontent.com` 대신 EKS OIDC)
3. ServiceAccount에 annotation `eks.amazonaws.com/role-arn: arn:aws:iam::...:role/...`
4. Pod이 SA를 사용 시 자동 STS 토큰 발급

**EKS Pod Identity (2023+)**: IRSA의 단순화 버전. OIDC 등록 불필요, 자체 권한 관리.

### 6. Karpenter (vs Cluster Autoscaler)

| 항목 | Cluster Autoscaler (CA) | Karpenter |
|------|--------------------------|-----------|
| 노드 생성 단위 | ASG (사전 정의된 인스턴스 타입) | 임의 인스턴스 타입 (Pending Pod 요구에 맞춤) |
| 속도 | 분 단위 | 초~수십 초 |
| 인스턴스 선택 | 제한적 | 최적 cost/perf 자동 선택 |
| Spot | 지원 | 강력 (자동 fallback) |

**Karpenter NodePool 예:**
```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-cpu
          operator: In
          values: ["4", "8", "16"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
      nodeClassRef:
        name: default
  limits:
    cpu: "1000"
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s
```

### 7. EKS 배포 패턴 결정 트리

```
보안 우선? (CI에 클러스터 자격 노출 X)
  Yes → GitOps (ArgoCD/Flux)
  No → Push (Helm/kubectl from CodeBuild)

복잡한 multi-tenant 정책 필요?
  Yes → ArgoCD (UI, RBAC 풍부)
  No → Flux (가벼움)

이미 Helm 표준?
  Yes → Helm + ArgoCD HelmChart
  No → Kustomize 검토
```

---

## 🧠 알아두면 좋은 심화 이론

### CodePipeline + EKS 직접 통합

CodePipeline에 EKS 전용 Deploy Provider 없음. 패턴:
- CodeBuild 안에서 `aws eks update-kubeconfig` + `helm upgrade`
- 또는 Lambda Invoke Action으로 K8s API 호출
- 또는 ArgoCD가 별도 동기화

### Image Updater (ArgoCD)

`argocd-image-updater`가 ECR을 폴링 → 새 이미지 발견 시 manifests 저장소에 commit → ArgoCD가 자동 sync.
완전 자동 GitOps 흐름.

### Helm vs Kustomize 비교

| 항목 | Helm | Kustomize |
|------|------|-----------|
| 템플릿 엔진 | Go template | YAML overlay |
| 변수 처리 | values.yaml | patches |
| 학습 곡선 | 중간 | 낮음 |
| 패키지 공유 | Helm Hub | Git 저장소 |
| ArgoCD 지원 | ✅ | ✅ |

### Pod Disruption Budget (PDB)

배포/노드 교체 중 가용성 보장:
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
spec:
  minAvailable: 2   # 최소 2개 Pod 항상 유지
  selector:
    matchLabels: {app: myapp}
```

Karpenter consolidation, CA, deployment 모두 존중.

### Admission Controller 통합

- OPA Gatekeeper / Kyverno: Policy as Code (이미지 서명 검증, 보안 정책)
- AWS Verified Permissions와 통합 가능

### 관련 서비스 Cross-Reference

- **IRSA / OIDC** → Week 2 Day 2
- **App Runner / Copilot** → Week 6 Day 4
- **EKS Observability** → Week 11 Day 4
- **Container Signing** → Week 2 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
EKS GitOps Architecture
==================================================

  Developer
      │
      │ git push to app repo
      ▼
  GitHub: app-source-repo
      │
      │ CI builds image
      ▼
  CodeBuild ─► ECR push (tag = git SHA)
      │
      │ Optional: argocd-image-updater commits new tag
      ▼
  GitHub: manifests-repo (declarative state)
      │
      │ ArgoCD watches
      ▼
  EKS Cluster
   ├─ argocd-server (UI/API)
   ├─ argocd-application-controller (sync)
   ├─ argocd-repo-server (manifest rendering)
   │
   ├─ kube-apiserver
   │     │
   │     ▼
   │  Pods / Services / Ingress
   │
   ├─ Karpenter (node autoscaler)
   ├─ AWS Load Balancer Controller
   ├─ ExternalDNS
   ├─ AWS for Fluent Bit (logs)
   └─ ADOT (metrics → CloudWatch / Prometheus)

  IAM via IRSA:
   ServiceAccount(myapp) → annotation role-arn
   Pod assumes role via OIDC
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ EKS는 CodeDeploy 미지원 — Helm/kubectl/GitOps 사용
2. ⭐ GitOps = 클러스터→Git pull, CI 측에 클러스터 자격 노출 X
3. ⭐ IRSA / Pod Identity가 Pod별 IAM 권한의 표준
4. ⭐ Karpenter는 임의 인스턴스 타입 + Spot fallback이 강점
5. ⭐ ArgoCD `selfHeal: true`가 Drift 자동 수정

---

## 💻 실제 예시 - ArgoCD GitOps 셋업

```bash
# 1) ArgoCD 설치
helm repo add argo https://argoproj.github.io/argo-helm
helm upgrade --install argocd argo/argo-cd -n argocd --create-namespace

# 2) ArgoCD가 사설 GitHub repo 접근하도록 PAT 또는 SSH 키 시크릿 등록

# 3) Application 정의
kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  destination:
    server: https://kubernetes.default.svc
    namespace: prod
  source:
    repoURL: https://github.com/my-org/manifests
    path: prod/myapp
    targetRevision: main
    helm:
      valueFiles: ["values.prod.yaml"]
  syncPolicy:
    automated: {prune: true, selfHeal: true}
EOF

# 4) IRSA로 Pod에 ECR Pull 권한
eksctl create iamserviceaccount \
  --cluster prod \
  --namespace prod \
  --name myapp-sa \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly \
  --approve

# 5) Karpenter NodePool (위 예시) 적용
kubectl apply -f nodepool.yaml
```

---

## 📝 연습 문제

**문제 1.** EKS 배포에 CodeDeploy를 사용하려 한다. 옳은 설명은?

A) CodeDeploy는 EKS도 ECS처럼 지원
B) CodeDeploy는 EKS 직접 미지원 — Helm/kubectl/GitOps 사용
C) EKS Blue/Green을 CodeDeploy로 자동 처리
D) CodePipeline이 자동 변환

**정답: B**
해설: CodeDeploy는 EC2/On-Prem/Lambda/ECS만. EKS는 별도.

---

**문제 2.** "CI 시스템에 EKS admin 자격 증명을 두고 싶지 않다." 가장 적절한 해법은?

A) Pull-based GitOps (ArgoCD/Flux) — 클러스터가 Git에서 상태를 가져옴
B) IAM User 발급
C) Kubernetes ServiceAccount 토큰 공유
D) Lambda 호출

**정답: A**
해설: GitOps의 핵심 보안 이점.

---

**문제 3.** Karpenter가 Cluster Autoscaler보다 우월한 점은?

A) 더 비싸다
B) Pending Pod 요구에 맞는 임의 인스턴스 타입 자동 선택 + Spot fallback + 빠른 프로비저닝
C) Multi-Region 지원
D) Helm 통합

**정답: B**
해설: Karpenter의 본질적 차별점.

---

**문제 4.** IRSA의 핵심 작동 원리는?

A) Pod에 IAM User 마운트
B) EKS OIDC Provider를 IAM에 등록 → ServiceAccount annotation으로 IAM Role 매핑 → Pod이 STS AssumeRoleWithWebIdentity로 자격 증명
C) 노드 EC2 Role을 모든 Pod이 공유
D) Lambda Authorizer

**정답: B**
해설: OIDC + ServiceAccount + AssumeRole 체인.

---

**문제 5.** ArgoCD `syncPolicy.automated.selfHeal: true`의 효과는?

A) Pod 자동 재시작
B) 사람이 클러스터에서 직접 변경한 Drift를 Git 상태로 자동 되돌림
C) ECR pull 자동
D) Node 자동 추가

**정답: B**
해설: GitOps의 self-healing — Git이 truth.

---

**문제 6.** Helm Chart의 values.yaml의 역할은?

A) IAM 정책
B) 템플릿에 주입할 변수 (replicaCount, image.tag 등)
C) Pod Disruption Budget
D) Karpenter NodePool

**정답: B**
해설: 환경별 차이를 values로 캡슐화.

---

**문제 7.** EKS의 image updater가 새 이미지를 감지하면?

A) 이미지를 ECR에서 삭제
B) manifests 저장소에 새 태그로 commit → ArgoCD가 자동 sync → Pod 교체
C) CodePipeline 자동 시작
D) Lambda 호출

**정답: B**
해설: GitOps의 자동 이미지 갱신 흐름.

---

## 📌 오늘의 요약

1. EKS 배포는 CodeDeploy 미지원 — Helm/kubectl/GitOps 사용
2. GitOps(ArgoCD/Flux)는 클러스터→Git pull, CI 측 자격 노출 없음
3. IRSA / Pod Identity로 Pod별 IAM 권한 부여
4. Karpenter는 임의 인스턴스 타입 자동 선택 + Spot
5. ArgoCD selfHeal로 Drift 자동 수정
