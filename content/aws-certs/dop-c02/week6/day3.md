# Day 3 - EKS CI/CD: GitOps가 탄생한 이유, 그리고 ArgoCD와 Flux가 Kubernetes를 바꾼 방식

📅 날짜: Week 6 (Day 3)
🎯 주제: Kubernetes 환경의 모던 GitOps 패턴 — Pull-based 배포, Helm/Kustomize, IRSA, Karpenter
⏱️ 학습 시간: 약 90분

---

2017년 Weaveworks의 엔지니어 Alexis Richardson은 팀이 겪던 반복적인 문제를 설명하면서 "GitOps"라는 단어를 처음 사용했다. 문제는 간단했다. 운영 팀이 Kubernetes 클러스터 상태를 직접 `kubectl apply`로 변경하면, 며칠 후 실제 클러스터가 어떤 상태인지 아무도 확신할 수 없었다. 누군가 긴급하게 ConfigMap을 수정했고, 다른 누군가는 Deployment의 replica 수를 바꿨다. 이것을 Drift라고 한다 — 선언적 명세와 실제 시스템 상태가 조용히 벌어지는 현상. Richardson의 해법은 놀랍도록 명확했다. "Git을 진실의 단일 출처로 만들어라. 그리고 클러스터가 스스로 Git을 보고 자신을 수렴시키게 하라." 이것이 GitOps의 핵심 통찰이다.

그러나 GitOps를 이해하려면 먼저 그것이 대체하려는 방식, 즉 Push-based 배포가 왜 K8s 규모에서 문제가 되는지를 이해해야 한다. CI/CD 시스템이 직접 클러스터에 `kubectl`을 날리는 방식은 작은 팀에선 잘 작동한다. 문제는 클러스터 수가 늘어나고, 팀이 커지고, 보안 감사 요구가 생기면서 드러난다. CI 서버는 클러스터의 admin 자격 증명을 가져야 하고, 이 자격 증명이 GitHub Actions, Jenkins, CodeBuild에 저장되어 있다는 것 자체가 공격 표면이 된다. Kubernetes 커뮤니티에서 Kelsey Hightower는 이 문제를 "너의 CI가 프로덕션 클러스터의 신뢰 경계 안에 있어야 하는 이유가 없다"고 표현했다.

GitOps는 이 신뢰 경계를 뒤집는다. CI는 이미지를 빌드하고 레지스트리에 올린다. 거기까지다. 배포 결정은 Git 저장소에 선언적 명세를 커밋하는 것으로 표현되고, 클러스터 내부에 있는 GitOps 오퍼레이터(ArgoCD 혹은 Flux)가 Git을 주기적으로 폴링하여 현재 클러스터 상태와 비교한다. 차이가 있으면 오퍼레이터가 직접 Kubernetes API를 호출하여 수렴시킨다. CI 서버는 클러스터 자격 증명을 가질 필요가 없다.

---

## Push-based vs Pull-based: 신뢰 경계의 위치가 다르다

Push-based 배포에서 CodeBuild나 GitHub Actions는 `aws eks update-kubeconfig`를 실행하고 `helm upgrade`나 `kubectl apply`를 클러스터에 직접 날린다. 이것은 CI 시스템이 클러스터의 신뢰 경계 안에 있다는 것을 의미한다. 시스템이 작을 때는 이것이 단순함의 장점을 갖지만, 다음 세 가지 조건 중 하나가 생기면 문제가 된다.

첫째, 클러스터 수가 늘어난다. 10개 클러스터에 Push하려면 10벌의 자격 증명이 필요하다. 각각 다른 IAM Role이나 Kubeconfig를 관리해야 한다. 둘째, 보안 감사가 시작된다. SOC2나 PCI-DSS 심사관은 "누가 프로덕션 클러스터에 접근 권한을 갖고 있는가"를 질문한다. CI 서버가 admin 자격을 가진다는 답은 불리하다. 셋째, Drift 발생 후 감지가 불가능하다. 누군가 `kubectl edit`으로 직접 변경한 설정은 다음 배포 전까지 추적되지 않는다.

Pull-based GitOps는 신뢰 경계를 Git 저장소 주변으로 재정의한다. 클러스터 오퍼레이터는 Git을 읽을 권한만 있으면 된다. 역방향 — 외부에서 클러스터로 — 의 자격 증명 노출이 사라진다.

💡 **GitOps 핵심 보안 원리**: CI 서버는 클러스터에 직접 쓰지 않는다. "클러스터 상태 = Git 상태"라는 선언만 한다. 클러스터가 자신을 Git에 맞춰 수렴시킨다.

---

## ArgoCD 내부 아키텍처: 4개 컴포넌트의 역할 분리

ArgoCD는 단일 프로세스가 아니다. 4개의 핵심 컴포넌트가 명확하게 분리된 책임을 갖는다. 이 구조를 이해하면 ArgoCD가 왜 고가용성 구성에서 어떤 컴포넌트를 스케일하는지 자연스럽게 알 수 있다.

**argocd-application-controller**는 ArgoCD의 심장이다. 이 컨트롤러는 Kubernetes Controller Pattern의 전형적인 구현체다. `desired state` (Git에서 렌더링한 manifests)와 `live state` (실제 Kubernetes API 상태)를 주기적으로 비교하여 차이, 즉 Diff를 계산한다. `automated.selfHeal: true`가 설정된 경우 이 컨트롤러가 자동으로 sync를 트리거한다. 이 컴포넌트는 상태를 유지하므로 기본적으로 단일 인스턴스로 실행되지만, 수천 개 Application을 운영하는 대규모 환경에서는 샤딩(sharding)을 지원한다.

**argocd-repo-server**는 Git 저장소에서 manifests를 가져와 렌더링하는 역할을 한다. Helm Chart를 `helm template`으로 렌더링하거나, Kustomize를 실행하거나, 단순 YAML을 파싱한다. 이 컴포넌트는 stateless이므로 수평 확장이 자유롭다. Git 폴링 부하가 증가하면 repo-server를 늘린다.

**argocd-server**는 gRPC/HTTP API 서버다. argocd CLI와 웹 UI가 이 서버를 통해 Application 상태를 조회하고, sync를 수동으로 트리거하고, RBAC 정책을 적용한다. 이 컴포넌트도 stateless이므로 수평 확장이 가능하며, 대규모 팀 환경에서 UI 접속 부하를 분산할 수 있다.

**Redis**는 Application 상태 캐시 역할을 한다. application-controller가 계산한 Diff 결과와 live state 캐시를 저장하여 반복적인 Kubernetes API 호출을 줄인다. Redis가 재시작되면 ArgoCD는 동작하지만 캐시가 사라지므로 초기 로드가 무거워진다.

```
ArgoCD 내부 흐름:
────────────────────────────────────────────
  [Git Repository]
        │ (1m interval polling)
        ▼
  [repo-server]  ── Helm/Kustomize 렌더링
        │ rendered manifests
        ▼
  [application-controller]
        │ desired state vs live state 비교
        │ (Redis 캐시 참조)
        ├─ Diff 없음 → Synced
        └─ Diff 있음 → auto-sync? → Kubernetes API 호출
        
  [argocd-server] ← CLI/WebUI 요청 처리 (RBAC 적용)
────────────────────────────────────────────
```

🔍 **Kubernetes Controller Pattern**: ArgoCD는 Kubernetes 자체의 컨트롤 루프 철학과 동일한 패턴을 사용한다. kube-controller-manager 내부의 Deployment Controller가 `desired replicas vs actual replicas`를 조정하듯, ArgoCD의 application-controller는 `desired manifests (Git) vs live state (K8s API)`를 조정한다. 이 패턴은 Leslie Lamport가 분산 시스템 이론에서 말하는 "eventual consistency"의 실용적 구현이다.

---

## Flux v2 Toolkit: 단일 도구가 아닌 Composable Controller 모음

Flux v1은 단일 프로세스였다. Flux v2는 GitOps Toolkit이라는 이름으로 완전히 재설계되어 5개의 독립적인 컨트롤러로 분리되었다. 이 설계 결정은 "하나가 다 하는" 방식보다 Unix 철학 — 하나의 도구는 하나의 일만, 조합 가능하게 — 에 충실하다.

**source-controller**는 "어디서 가져올 것인가"를 담당한다. Git Repository, Helm Repository, OCI Repository (OCI 아티팩트로 패키징된 Helm Chart나 Kustomize)를 지원한다. `GitRepository` 리소스를 정의하면 source-controller가 주기적으로 Git을 폴링하고, 변경이 감지되면 다운로드한 아카이브를 다른 컨트롤러가 참조할 수 있는 local artifact로 만든다.

**kustomize-controller**는 `Kustomization` CRD를 처리한다. source-controller가 제공한 artifact에서 Kustomize를 실행하여 클러스터에 적용한다.

**helm-controller**는 `HelmRelease` CRD를 처리한다. Helm Chart를 지정된 values로 설치하거나 업그레이드한다. Helm의 릴리스 상태를 Kubernetes CRD로 관리하므로, `helm list`가 아닌 `kubectl get helmrelease`로 상태를 확인한다.

**notification-controller**는 클러스터 이벤트를 외부 시스템에 알린다. Slack, Teams, PagerDuty, GitHub Status API 등에 sync 결과를 전송한다.

**image-automation-controller**는 Flux의 독특한 기능이다. ECR 같은 레지스트리를 폴링하여 새 이미지 태그를 감지하면, Git 저장소의 manifest를 자동으로 업데이트하는 commit을 생성한다. 이 commit이 source-controller에 의해 감지되면 kustomize-controller나 helm-controller가 새 이미지를 클러스터에 반영한다. 완전 자동화된 GitOps 루프다.

```yaml
# Flux GitRepository
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: myapp-manifests
  namespace: flux-system
spec:
  url: https://github.com/my-org/k8s-manifests
  ref:
    branch: main
  interval: 1m
  secretRef:
    name: github-pat  # PAT 또는 SSH key

---
# Flux Kustomization
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp-prod
  namespace: flux-system
spec:
  sourceRef:
    kind: GitRepository
    name: myapp-manifests
  path: ./overlays/prod
  prune: true         # Git에서 사라진 리소스 삭제
  interval: 5m
  timeout: 3m
  healthChecks:       # 배포 성공 여부 검증
    - apiVersion: apps/v1
      kind: Deployment
      name: myapp
      namespace: prod
```

📚 **Flux vs ArgoCD 선택 기준**: ArgoCD는 UI와 RBAC이 강력하여 여러 팀이 하나의 ArgoCD를 공유하는 multi-tenant 환경에 적합하다. Flux는 더 가볍고, K8s-native하며, "UI가 없어도 되는 플랫폼 팀"에 적합하다. 실무에서는 두 가지를 동시에 사용하거나, ArgoCD 위에 Flux의 image-automation-controller만 사용하는 하이브리드 패턴도 존재한다.

---

## Helm: Kubernetes 패키지 매니저의 설계 철학

Helm이 생겨난 이유는 단순하다. 하나의 애플리케이션을 Kubernetes에 배포하려면 Deployment, Service, ConfigMap, Ingress, ServiceAccount, HorizontalPodAutoscaler 등 다수의 YAML이 필요하다. 이 YAML들은 서로 연관되어 있고, 환경마다(개발/스테이징/프로덕션) 일부 값이 달라진다. Helm은 이 연관된 YAML 묶음을 Chart로 패키징하고, 가변 부분을 values로 외부화한다.

Helm Chart는 세 가지 핵심 파일로 구성된다. `Chart.yaml`은 메타데이터(이름, 버전, 의존성)를 담는다. `values.yaml`은 기본값을 정의한다. `templates/` 디렉터리는 Go template 문법으로 작성된 Kubernetes manifest 템플릿을 담는다.

```yaml
# Chart.yaml
apiVersion: v2
name: myapp
version: 1.3.0
appVersion: "2.5.1"
description: My application Helm chart
dependencies:
  - name: postgresql
    version: "12.x.x"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled

---
# values.yaml (기본값)
replicaCount: 2
image:
  repository: 111222333.dkr.ecr.ap-northeast-2.amazonaws.com/myapp
  tag: "latest"      # 배포 시 --set image.tag=<SHA>로 override
  pullPolicy: Always
resources:
  requests:
    cpu: "250m"
    memory: "512Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
postgresql:
  enabled: false     # 외부 RDS 사용 시 false

---
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

Helm의 배포 명령은 `helm upgrade --install`이다. `--install`은 릴리스가 없으면 설치, 있으면 업그레이드를 수행하므로 CI에서 idempotent하게 사용할 수 있다.

```bash
# 환경별 values file + 이미지 태그 override
helm upgrade --install myapp ./chart \
  --namespace prod \
  --create-namespace \
  --values values.prod.yaml \
  --set image.tag=${CODEBUILD_RESOLVED_SOURCE_VERSION} \
  --wait \           # Pod이 Ready 될 때까지 대기 (롤아웃 검증)
  --timeout 5m \
  --atomic           # 실패 시 자동 롤백
```

`--atomic` 플래그는 Helm 3에서 추가된 중요한 기능이다. 업그레이드가 `--timeout` 내에 완료되지 않으면 자동으로 이전 릴리스로 롤백한다. ECS의 Blue/Green 롤백에 해당하는 기능을 Helm이 자체적으로 제공하는 것이다.

⚠️ **Helm vs Kustomize 선택 함정**: Helm은 강력하지만 Go template 디버깅이 어렵다. Kustomize는 순수 YAML overlay 방식으로 학습 곡선이 낮다. ArgoCD는 두 가지를 모두 지원하므로, 새 프로젝트는 Kustomize로 시작해서 공유 패키지가 필요해지면 Helm으로 전환하는 것이 권장 패턴이다.

---

## Kustomize: YAML 파일을 복사하지 않고 환경별 차이를 표현하는 방법

Kustomize의 핵심 개념은 "base + overlay"다. 공통 Kubernetes manifest를 base에 두고, 환경별 차이(환경 변수, 이미지 태그, 리소스 제한, 레플리카 수)를 overlay에서 patch로 표현한다. YAML 파일을 환경별로 복사하는 대신, 차이만 기술한다.

```
k8s-manifests/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   └── service.yaml
├── overlays/
│   ├── dev/
│   │   ├── kustomization.yaml
│   │   └── replica-patch.yaml
│   ├── staging/
│   │   ├── kustomization.yaml
│   │   └── replica-patch.yaml
│   └── prod/
│       ├── kustomization.yaml
│       ├── replica-patch.yaml
│       └── resource-patch.yaml
```

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: prod
resources:
  - ../../base
images:
  - name: myapp
    newName: 111222333.dkr.ecr.ap-northeast-2.amazonaws.com/myapp
    newTag: abc1234def  # CI가 이 값을 kustomize edit set image로 업데이트
patches:
  - path: replica-patch.yaml
  - path: resource-patch.yaml

---
# overlays/prod/replica-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 5  # prod만 5개
```

Kustomize의 `images` 섹션은 CI/CD 파이프라인에서 특히 유용하다. `kustomize edit set image myapp=111.dkr.ecr.../myapp:${GIT_SHA}` 명령 하나로 특정 overlay의 이미지 태그를 업데이트하고 Git에 커밋할 수 있다. 이것이 image-automation-controller가 수행하는 작업의 수동 버전이다.

---

## IRSA vs EKS Pod Identity: Kubernetes에서 AWS 권한을 Pod 단위로 부여하는 두 가지 방법

Kubernetes Pod이 AWS 서비스에 접근해야 하는 상황은 매우 흔하다. S3에서 파일을 읽거나, DynamoDB에 쓰거나, Secrets Manager에서 비밀을 가져오거나. 초기 접근법은 노드의 EC2 Instance Profile을 사용하는 것이었다. 노드의 IAM Role에 필요한 권한을 부여하면 그 노드에서 실행되는 모든 Pod이 그 권한을 사용할 수 있었다. 이것은 명백한 최소 권한 위반이다. 결제 서비스 Pod과 로그 수집기 Pod이 같은 노드에서 실행될 때, 로그 수집기도 결제 시스템의 DynamoDB에 접근할 수 있게 된다.

**IRSA (IAM Roles for Service Accounts)**는 이 문제를 OIDC 기반으로 해결한다. EKS 클러스터는 OIDC Provider URL을 가지며, IAM에 이 Provider를 등록하면 EKS가 발급하는 Service Account 토큰을 AWS가 신뢰할 수 있게 된다. 동작 원리는 다음과 같다.

1. EKS 클러스터의 OIDC Provider URL을 AWS IAM에 등록한다.
2. IAM Role을 생성하고 Trust Policy에서 특정 Namespace와 ServiceAccount를 Subject로 지정한다.
3. Kubernetes ServiceAccount에 `eks.amazonaws.com/role-arn` annotation을 추가한다.
4. Pod이 이 ServiceAccount를 사용하면, EKS는 Pod에 OIDC 토큰을 마운트한다.
5. Pod의 AWS SDK가 이 토큰으로 STS `AssumeRoleWithWebIdentity`를 호출하여 임시 자격 증명을 얻는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::111222333:oidc-provider/oidc.eks.ap-northeast-2.amazonaws.com/id/EXAMPLE"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "oidc.eks.ap-northeast-2.amazonaws.com/id/EXAMPLE:sub":
          "system:serviceaccount:prod:myapp-sa",
        "oidc.eks.ap-northeast-2.amazonaws.com/id/EXAMPLE:aud":
          "sts.amazonaws.com"
      }
    }
  }]
}
```

**EKS Pod Identity** (2023년 11월 출시)는 IRSA의 단순화 버전이다. OIDC Provider를 별도로 등록할 필요가 없다. 대신 `eks:CreatePodIdentityAssociation` API로 ServiceAccount와 IAM Role을 직접 연결한다. AWS는 EKS Pod Identity Agent (DaemonSet)를 통해 토큰을 제공한다. IRSA와의 가장 큰 차이는 Trust Policy 설정이 불필요하다는 점 — IAM Role의 Trust Policy에 `eks.amazonaws.com`을 Principal로 지정하기만 하면 된다.

```bash
# EKS Pod Identity 설정 (IRSA보다 훨씬 단순)
aws eks create-pod-identity-association \
  --cluster-name prod-cluster \
  --namespace prod \
  --service-account myapp-sa \
  --role-arn arn:aws:iam::111222333:role/MyAppRole
```

🔍 **IRSA vs Pod Identity 시험 포인트**: IRSA는 EKS 1.13부터 지원되며 기존 클러스터에서 널리 사용된다. Pod Identity는 EKS 1.24+ 필요, 더 단순한 설정이 장점. 시험에서는 IRSA의 OIDC Provider 등록 → Trust Policy → ServiceAccount annotation 3단계를 묻는 문제가 자주 출제된다.

---

## Karpenter: 스케줄링-인식 노드 프로비저너

Cluster Autoscaler(CA)는 2016년에 등장한 전통적인 노드 오토스케일러다. 작동 방식은 반응적이다. Pod이 Pending 상태가 되면 CA는 현재 구성된 Auto Scaling Group(ASG)을 확인하고, 그 ASG의 인스턴스 타입 중 하나를 추가한다. 이 접근의 제약은 명확하다. ASG는 사전에 특정 인스턴스 타입으로 구성되어야 한다. `m5.xlarge` ASG를 사용 중인데 Pending Pod이 더 큰 메모리를 요구하면, CA는 더 큰 인스턴스를 추가하지 못한다.

Karpenter는 2021년 AWS가 오픈소스로 공개한 노드 프로비저너로, ASG를 우회하여 EC2 API를 직접 호출한다. 핵심 차별점은 스케줄링 인식(scheduling-aware)이라는 특성이다. Karpenter는 Pending Pod의 리소스 요청(CPU, 메모리), Node Selector, Affinity, Toleration을 직접 분석하여 그 Pod들을 한 번에 스케줄링할 수 있는 최적의 EC2 인스턴스 타입을 선택한다. 수십 가지 인스턴스 타입을 후보로 두고 비용과 가용성을 고려하여 실시간으로 선택한다.

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: general-purpose
spec:
  template:
    metadata:
      labels:
        workload-type: general
    spec:
      requirements:
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]      # Compute, Memory, Memory-optimized
        - key: karpenter.k8s.aws/instance-cpu
          operator: In
          values: ["4", "8", "16", "32"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"] # Spot 우선, 없으면 On-Demand
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  limits:
    cpu: "1000"
    memory: "4000Gi"
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s              # 30초 후 빈 노드 제거

---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  role: KarpenterNodeRole
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: prod-cluster
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: prod-cluster
```

Karpenter의 Consolidation 기능은 CA에 없는 독특한 기능이다. 클러스터에 여러 소형 노드가 낮은 사용률로 실행 중일 때, Karpenter는 그 Pod들을 더 적은 수의 노드에 재배치할 수 있는지 시뮬레이션한다. 가능하면 기존 노드를 drain하고 새 노드를 더 효율적으로 프로비저닝한다. 이것은 단순한 스케일 다운이 아니라 빈 자리 채우기 최적화다.

📚 **Karpenter와 Fargate Spot 유사점**: Week 6 Day 2에서 다룬 Fargate Spot의 SIGTERM 2분 warning처럼, Karpenter Spot 노드도 EC2 Spot Interruption Notice를 받으면 노드를 drain하고 Pod을 다른 노드로 재스케줄한다. `karpenter.sh/do-not-disrupt: "true"` annotation을 Pod에 추가하면 Karpenter의 자발적 disruption(Consolidation)을 방지할 수 있다.

---

## CodeDeploy가 EKS를 지원하지 않는 이유

이것은 시험에서 함정으로 자주 출제된다. ECS에서 CodeDeploy Blue/Green이 매우 잘 작동하기 때문에, 수험생들은 EKS에서도 동일하게 작동한다고 가정한다. 그러나 CodeDeploy는 EKS를 지원하지 않는다.

이유는 설계 철학의 차이에서 온다. CodeDeploy는 AWS가 제공하는 관리형 배포 서비스로, 배포 메커니즘을 CodeDeploy Agent가 담당한다. ECS에서는 ECS 서비스 자체가 CodeDeploy와 통합되어 있다. Kubernetes는 자체적인 Rolling Update, Deployment 롤아웃 메커니즘을 가지며, 이것은 Kubernetes control plane 내부에서 완결된다. CodeDeploy Agent를 K8s 클러스터에 추가하는 것은 이 아키텍처와 맞지 않는다.

EKS에서 Blue/Green과 유사한 배포를 구현하려면 세 가지 방법이 있다. 첫째, Argo Rollouts — ArgoCD 생태계의 별도 컨트롤러로, Canary와 Blue/Green 전략을 Kubernetes native CRD로 구현한다. 둘째, Helm의 `--atomic`과 함께 두 개의 Deployment를 Service 레벨에서 전환. 셋째, AWS Load Balancer Controller의 weighted target group routing — CodeDeploy Blue/Green과 개념적으로 동일하지만 Kubernetes에서 구현된다.

⚠️ **시험 함정**: "EKS에 CodeDeploy를 사용하려면 어떻게 해야 하는가?" 라는 질문의 정답은 "CodeDeploy는 EKS를 지원하지 않는다"다. ECS와 혼동하지 말 것.

---

## ArgoCD Image Updater: 완전 자동화 GitOps 루프

일반적인 GitOps 흐름에서 이미지 태그 업데이트는 수동 단계가 포함된다. CI가 이미지를 ECR에 푸시한 후, 누군가(또는 CI의 다른 단계)가 manifests 저장소의 YAML을 업데이트하고 커밋해야 한다. ArgoCD Image Updater는 이 단계를 자동화한다.

Image Updater는 `ImageUpdatePolicy` CRD를 통해 ArgoCD Application에 연결된다. ECR, Docker Hub, GitHub Container Registry 등을 주기적으로 폴링하여 새 이미지 태그를 감지한다. 감지 방식은 여러 가지다 — 최신 semver, 특정 regex 패턴, 특정 prefix 등. 새 태그를 감지하면 Git 저장소에 직접 commit을 생성하거나, ArgoCD Application의 parameter를 업데이트한다. ArgoCD가 이 변경을 감지하고 sync를 수행한다.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
  annotations:
    argocd-image-updater.argoproj.io/image-list: myapp=111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp
    argocd-image-updater.argoproj.io/myapp.update-strategy: newest-build
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
```

🎯 **완전 자동화 GitOps 흐름 정리**:
1. 개발자가 코드 커밋 → CodeBuild 트리거
2. CodeBuild: 이미지 빌드 → ECR에 Push (태그: `git SHA`)
3. Image Updater: ECR 폴링 → 새 태그 감지 → manifests repo에 commit
4. ArgoCD: manifests 변경 감지 → sync → K8s API 호출 → Pod 업데이트
5. Drift가 생기면 selfHeal이 자동으로 이전 상태로 복원

---

## Pod Disruption Budget: 배포와 스케일링 중 가용성 보장

Kubernetes에서 노드 업그레이드, Karpenter Consolidation, Deployment 롤아웃 중 특정 Pod이 동시에 종료되면 서비스 중단이 발생할 수 있다. Pod Disruption Budget(PDB)은 이를 방지하는 정책이다.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
  namespace: prod
spec:
  minAvailable: 2      # 최소 2개 Pod는 항상 Running 상태 유지
  selector:
    matchLabels:
      app: myapp
```

또는 `maxUnavailable`로 표현할 수 있다:

```yaml
spec:
  maxUnavailable: 1    # 동시에 최대 1개만 disruption 허용
```

PDB는 Karpenter, Cluster Autoscaler, `kubectl drain`, Deployment rolling update 모두 존중한다. Karpenter가 Consolidation을 시도할 때 PDB를 위반하는 disruption은 실행되지 않는다. 이것은 ArgoCD/Flux를 통한 GitOps 배포 중에도 적용된다 — 롤아웃 중 `maxUnavailable: 1`이라면, ArgoCD는 Kubernetes Deployment의 롤아웃 전략을 따르고, Deployment의 롤아웃 전략은 PDB를 고려한다.

---

## 실제 사례: Weaveworks 자사 프로덕션 GitOps

Weaveworks가 GitOps 개념을 만든 회사이므로, 자사 프로덕션 환경이 GitOps의 첫 번째 대규모 실사례가 되었다. 2017년에 공개된 사례에서 Weaveworks는 단일 클러스터에서 시작하여 GitOps로 전환하면서 얻은 구체적인 수치를 공유했다. 배포 빈도가 주 1회에서 일 수십 회로 증가했고, 롤백 시간이 수 시간에서 수 분으로 단축되었다. 가장 중요한 것은 Drift 감지 — 주말에 누군가 긴급 핫픽스를 `kubectl edit`으로 적용한 후 Monday에 정기 배포가 그것을 덮어쓰는 문제가 완전히 사라졌다. selfHeal이 Drift를 즉시 되돌리기 때문이다.

2021년 공개된 Codefresh 벤치마크는 ArgoCD와 Flux의 실제 성능 비교를 제공했다. 1000개 Application 기준, ArgoCD는 API 서버와 app-controller의 메모리 사용량이 높았지만, 웹 UI와 RBAC 기능에서 우위였다. Flux는 메모리 효율이 좋았지만 UI가 없었다. 이 벤치마크가 플랫폼 팀에서 "ArgoCD vs Flux" 선택 기준으로 널리 인용된다.

💡 **Spotify 사례**: Spotify는 ArgoCD를 사용하여 1000개 이상의 Kubernetes 서비스를 관리한다. 흥미로운 점은 ArgoCD ApplicationSet — 하나의 템플릿으로 여러 클러스터에 동일한 Application을 생성하는 CRD — 을 사용하여 멀티 리전 배포를 관리한다는 것이다. DOP-C02 시험에서는 ApplicationSet보다 기본 Application과 syncPolicy가 중요하지만, ApplicationSet은 multi-cluster 문제의 실무 해법으로 알아두면 좋다.

---

## Admission Controller와 Policy as Code

GitOps가 "무엇을 배포할 것인가"를 Git으로 제어한다면, Admission Controller는 "어떤 배포가 허용되는가"를 클러스터에서 제어한다. OPA Gatekeeper와 Kyverno가 대표적인 구현체다.

Policy 예시: "모든 Production namespace의 Container는 반드시 서명된 이미지만 사용해야 한다." 이 정책을 Kyverno ClusterPolicy로 표현하면:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-image-signature
      match:
        any:
        - resources:
            kinds: ["Pod"]
            namespaces: ["prod"]
      verifyImages:
        - imageReferences: ["111.dkr.ecr.ap-northeast-2.amazonaws.com/*"]
          attestors:
            - entries:
                - keys:
                    publicKeys: |-
                      -----BEGIN PUBLIC KEY-----
                      ...
                      -----END PUBLIC KEY-----
```

이 정책이 있으면, ArgoCD가 서명되지 않은 이미지로 sync를 시도할 때 Kubernetes API 서버가 Admission Webhook을 통해 Kyverno에 검증을 요청하고, Kyverno가 Deny를 반환하면 Pod이 생성되지 않는다. ArgoCD의 sync가 실패하고 경고가 발생한다.

이것은 Week 6 Day 1의 ECR 이미지 서명 (Sigstore, cosign)과 연결된다. ECR에서 서명한 이미지를 Kyverno가 클러스터 진입 시점에 검증하는 것이 End-to-End 이미지 무결성 보장 아키텍처다.

🔍 **DOP-C02 연결점**: 이미지 서명(ECR + cosign) → ECR Enhanced Scanning(Inspector) → Kyverno/OPA Admission Control → ArgoCD/Flux 배포. 이 chain 전체가 "컨테이너 보안 파이프라인"이며, DOP-C02의 Security 도메인 문제로 자주 출제된다.

---

## EKS CI/CD 패턴 결정 트리

```
[EKS 배포 전략 선택]
│
├─ 클러스터 자격 증명을 CI에 노출하고 싶지 않다?
│      Yes → GitOps (ArgoCD 또는 Flux)
│      No  → Push-based (CodeBuild + Helm/kubectl)
│
├─ [GitOps 선택 시]
│      멀티 팀이 하나의 GitOps 서버를 공유? + UI 필요?
│             Yes → ArgoCD
│             No  → Flux (더 가볍고 K8s-native)
│
├─ [템플릿 도구 선택]
│      공유 패키지 필요? Helm Hub에 chart 배포?
│             Yes → Helm
│             환경별 overlay만 필요? → Kustomize
│
├─ [노드 프로비저닝]
│      임의 인스턴스 타입 + Spot + 빠른 스케일?
│             Yes → Karpenter
│             단순 ASG 기반으로 충분?
│             Yes → Cluster Autoscaler
│
└─ [Pod IAM 권한]
       신규 클러스터 (EKS 1.24+)? → EKS Pod Identity (더 단순)
       기존 클러스터 / 기존 IRSA 사용 중? → IRSA 유지
```

---

## 아키텍처 다이어그램: 완전한 EKS GitOps 파이프라인

```
EKS GitOps 전체 아키텍처 (DOP-C02 관점)
════════════════════════════════════════════════════════════════

Developer
    │
    │ (1) git push → feature branch
    ▼
GitHub / CodeCommit (app-source-repo)
    │
    │ (2) PR → merge to main → CodePipeline trigger
    ▼
CodeBuild (CI Stage)
    ├─ Docker image build
    ├─ ECR push (tag: git SHA abc1234)
    ├─ ECR Enhanced Scanning (Inspector)
    └─ cosign image signing

    │ (3) image-automation OR manual: manifests repo commit
    ▼
GitHub / CodeCommit (k8s-manifests-repo)
    ├─ overlays/prod/kustomization.yaml  ← image tag 업데이트
    └─ base/ (공통 K8s 리소스)

    │ (4) ArgoCD polls every 1m
    ▼
┌─────────────────────────────────────────────────────────┐
│  EKS Cluster (prod)                                     │
│                                                         │
│  [argocd namespace]                                     │
│   ├─ repo-server   (Kustomize 렌더링)                   │
│   ├─ app-controller (desired vs live 비교, sync 실행)  │
│   ├─ argocd-server  (UI/API, RBAC)                     │
│   └─ redis          (상태 캐시)                         │
│                                                         │
│  [prod namespace]                                       │
│   ├─ Deployment (myapp) — IRSA/Pod Identity로 ECR Pull │
│   ├─ Service (ClusterIP)                                │
│   ├─ Ingress (AWS ALB Controller)                       │
│   └─ HPA (CPU 70%)                                      │
│                                                         │
│  [karpenter namespace]                                  │
│   └─ NodePool (spot + on-demand, c/m/r family)         │
│                                                         │
│  [kyverno]                                              │
│   └─ ClusterPolicy: require-signed-images              │
│                                                         │
│  IRSA/Pod Identity:                                     │
│   SA(myapp) → IAM Role → S3, DynamoDB, SM 접근         │
└─────────────────────────────────────────────────────────┘
                │
                │ Karpenter: EC2 Fleet API 직접 호출
                ▼
            EC2 Spot / On-Demand (최적 인스턴스 자동 선택)

════════════════════════════════════════════════════════════════
```

---

## 핵심 개념 요약표

| 개념 | 핵심 포인트 | 시험 함정 |
|------|------------|----------|
| GitOps | 클러스터→Git pull, CI 측 자격 불필요 | Push-based와 혼동 |
| ArgoCD selfHeal | Git 상태로 Drift 자동 복원 | prune과 selfHeal 차이 |
| Flux image-updater | ECR 폴링 → manifests commit 자동화 | ArgoCD에도 별도 Image Updater 있음 |
| Helm --atomic | 타임아웃 시 자동 롤백 | --wait 없이 --atomic 단독 사용 주의 |
| IRSA | OIDC → Trust Policy → SA annotation | Trust Policy Subject 형식 암기 |
| Pod Identity | IRSA 단순화, EKS 1.24+ | OIDC Provider 등록 불필요 |
| Karpenter | EC2 Fleet API 직접, 임의 인스턴스 | ASG 우회 = CA와 구조적 차이 |
| CodeDeploy + EKS | 미지원 | ECS와 혼동 주의 |
| PDB | 자발적 disruption 중 Pod 최소 보장 | Karpenter, drain, 롤아웃 모두 준수 |

---

## 연습 문제

**문제 1.** 팀에서 EKS CI/CD 파이프라인을 구축하려 한다. 보안 요구사항은 "CI 서버(CodeBuild)가 프로덕션 클러스터 자격 증명을 갖지 않아야 한다"는 것이다. 가장 적절한 아키텍처는?

A) CodeBuild에 EKS Admin Role을 부여하고 kubectl apply를 실행  
B) ArgoCD를 클러스터에 설치하고, CodeBuild는 manifests 저장소에만 커밋. ArgoCD가 Git을 폴링하여 sync  
C) Lambda가 CodeBuild 결과를 받아 Kubernetes API를 직접 호출  
D) CodeDeploy를 EKS와 통합하여 Blue/Green 배포  

**정답: B**

Pull-based GitOps의 핵심 보안 원리다. CodeBuild는 애플리케이션 코드 저장소와 manifests 저장소에 접근하면 충분하다. 클러스터에 대한 쓰기 권한은 클러스터 내부의 ArgoCD가 갖는다. 외부→클러스터 방향의 자격 증명 노출이 없다.

왜 다른 옵션이 틀렸는가: A는 보안 요구사항 위반. C는 Lambda도 결국 클러스터 자격 증명이 필요하다. D는 CodeDeploy가 EKS를 지원하지 않는다.

---

**문제 2.** ArgoCD Application에서 `syncPolicy.automated.selfHeal: true`와 `syncPolicy.automated.prune: true`의 차이는?

A) selfHeal은 Git 삭제 리소스를 클러스터에서 삭제, prune은 Drift를 복원  
B) selfHeal은 클러스터에서 수동 변경된 Drift를 Git 상태로 복원, prune은 Git에서 삭제된 리소스를 클러스터에서도 삭제  
C) 두 옵션은 동일한 기능  
D) selfHeal은 노드 장애 복구, prune은 Pod 재시작  

**정답: B**

`selfHeal`은 누군가 `kubectl edit`이나 `kubectl patch`로 직접 클러스터를 수정했을 때 ArgoCD가 자동으로 Git 상태로 되돌리는 기능이다. `prune`은 Git 저장소에서 특정 manifest 파일을 삭제했을 때, 그 파일로 생성된 K8s 리소스도 클러스터에서 삭제하는 기능이다. 두 옵션은 독립적이며 각각 활성화해야 한다.

왜 다른 옵션이 틀렸는가: A는 selfHeal과 prune의 역할이 뒤바뀜. C는 완전히 다른 기능. D는 Kubernetes 자체 기능(liveness probe)과 혼동.

---

**문제 3.** IRSA(IAM Roles for Service Accounts)를 설정할 때 필수 단계가 아닌 것은?

A) EKS 클러스터의 OIDC Provider URL을 IAM에 등록  
B) IAM Role의 Trust Policy에 OIDC Provider를 Federated Principal로 지정  
C) Kubernetes ServiceAccount에 `eks.amazonaws.com/role-arn` annotation 추가  
D) EC2 Instance Profile에 IAM Role 연결  

**정답: D**

IRSA는 EC2 Instance Profile을 사용하지 않는다. IRSA의 핵심은 OIDC 연동 — EKS가 ServiceAccount 토큰을 JWT로 발급하고, Pod의 AWS SDK가 이 토큰으로 STS `AssumeRoleWithWebIdentity`를 호출한다. Instance Profile은 노드 전체에 적용되는 레거시 방식이다.

왜 다른 옵션이 틀렸는가: A, B, C는 모두 IRSA의 필수 단계다. OIDC Provider 등록(A) → Trust Policy 설정(B) → SA annotation 추가(C) → Pod이 자동으로 STS AssumeRole 수행.

---

**문제 4.** Karpenter와 Cluster Autoscaler(CA)의 가장 중요한 아키텍처 차이는?

A) Karpenter는 ECS만 지원  
B) CA는 EC2 API를 직접 호출하고, Karpenter는 ASG를 통해 노드를 추가  
C) Karpenter는 EC2 Fleet API를 직접 호출하여 Pending Pod의 요구에 맞는 인스턴스 타입을 실시간 선택하고, CA는 사전 구성된 ASG의 인스턴스 타입만 사용  
D) CA는 Spot 인스턴스를 지원하지 않음  

**정답: C**

Karpenter의 핵심 혁신은 ASG를 우회하는 것이다. CA는 반드시 ASG를 통해 노드를 추가하므로, ASG에 사전 정의된 인스턴스 타입만 사용할 수 있다. Karpenter는 EC2 Fleet API를 직접 호출하므로 수십 가지 인스턴스 타입 중 Pending Pod의 요구사항에 가장 적합한 것을 실시간으로 선택한다. 이로 인해 프로비저닝 속도도 Karpenter가 훨씬 빠르다(분 단위 vs 초 단위).

왜 다른 옵션이 틀렸는가: A는 Karpenter는 EKS 전용. B는 설명이 뒤바뀜. D는 CA도 Spot ASG를 지원하지만 방식이 다름.

---

**문제 5.** Helm의 `helm upgrade --install --atomic` 명령에서 `--atomic` 플래그의 효과는?

A) 이미지를 원자적으로 빌드  
B) 업그레이드가 `--timeout` 내에 완료되지 않으면 자동으로 이전 릴리스로 롤백  
C) 여러 Helm 릴리스를 트랜잭션으로 묶어 동시 배포  
D) 클러스터의 다른 Deployment를 일시 정지  

**정답: B**

`--atomic`은 `--wait`를 암묵적으로 포함하며, 업그레이드된 Pod이 `--timeout`(기본 5분) 내에 Ready 상태가 되지 않으면 자동으로 이전 Helm 릴리스로 롤백한다. ECS Blue/Green의 자동 롤백과 개념적으로 동일하지만 Kubernetes와 Helm의 기본 메커니즘으로 구현된다.

왜 다른 옵션이 틀렸는가: A는 Helm의 개념이 아님. C는 트랜잭션 배포는 Helm이 지원하지 않음. D는 다른 Deployment에 영향을 주지 않음.

---

**문제 6.** EKS 클러스터에서 여러 Pod이 Pending 상태일 때, Karpenter는 어떤 방식으로 노드를 프로비저닝하는가?

A) 관리자가 미리 지정한 단일 인스턴스 타입으로 노드 추가  
B) Pending Pod들의 리소스 요청, Node Selector, Affinity를 분석하여 최적 인스턴스 타입을 선택하고 EC2 Fleet API로 직접 프로비저닝  
C) ASG를 통해 노드 수를 1개씩 증가  
D) Fargate 프로필을 사용하여 서버리스 Pod 실행  

**정답: B**

Karpenter는 Pending Pod들을 일괄 분석하여 최소한의 노드로 모든 Pod을 스케줄할 수 있는 인스턴스 타입 조합을 찾는다. 이 스케줄링 인식(scheduling-aware) 특성이 Karpenter의 핵심이다. CA는 Pod별로 반응하지만 Karpenter는 Pending Pod 집합을 전체적으로 최적화한다.

왜 다른 옵션이 틀렸는가: A는 CA의 동작 방식. C는 CA의 ASG 기반 점진적 확장. D는 Fargate는 별개의 서버리스 옵션으로 Karpenter와 무관.

---

**문제 7.** 팀이 ArgoCD를 통해 EKS에 배포 중이다. 운영자가 긴급 상황에서 `kubectl edit deployment myapp`으로 replica 수를 5에서 10으로 변경했다. ArgoCD Application에 `selfHeal: true`가 설정된 경우 어떤 일이 발생하는가?

A) ArgoCD가 변경을 감지하고 승인 요청을 Slack으로 전송  
B) ArgoCD가 Drift를 감지하고 Git에 정의된 replica 5로 자동 복원  
C) ArgoCD가 변경을 학습하여 Git을 자동으로 업데이트  
D) 다음 정기 배포 때까지 변경이 유지됨  

**정답: B**

`selfHeal: true`는 ArgoCD의 핵심 GitOps 기능이다. application-controller가 주기적으로(기본 3초 간격) live state를 확인하고, Git 상태와 다르면 Git 상태로 되돌린다. 운영자의 `kubectl edit` 변경은 감지 즉시(최대 몇 초 내) 자동으로 복원된다. 이것이 "Git이 진실의 단일 출처"라는 GitOps 원칙의 구체적 구현이다.

왜 다른 옵션이 틀렸는가: A는 Manual sync 설정에서의 Slack 알림과 혼동. C는 ArgoCD는 Git을 읽기만 하며 쓰지 않는다(Image Updater는 별도 도구). D는 selfHeal이 없을 때의 동작.

---

## 오늘의 요약

GitOps는 2017년 Weaveworks가 Drift 문제를 해결하기 위해 도입한 패러다임이다. 핵심은 신뢰 경계의 이동 — CI는 Git까지만 쓰고, 클러스터는 스스로 Git을 읽어 자신을 수렴시킨다. ArgoCD는 4개 컴포넌트(app-controller, repo-server, api-server, Redis)로 이 원칙을 구현한다. selfHeal은 Drift를 자동 복원하고, prune은 Git 삭제 리소스를 클러스터에서 제거한다.

Flux v2는 5개 독립 컨트롤러(source, kustomize, helm, notification, image-automation)로 구성된 Composable Toolkit이다. image-automation-controller는 ECR을 폴링하여 manifests를 자동 업데이트하는 완전 자동화 루프를 가능하게 한다.

Helm은 패키지 매니저로 values.yaml으로 환경별 차이를 외부화하고, `--atomic`으로 실패 시 자동 롤백을 제공한다. Kustomize는 base+overlay 패턴으로 YAML 복사 없이 환경별 차이를 표현한다.

IRSA는 OIDC + Trust Policy + ServiceAccount annotation의 3단계로 Pod별 IAM 권한을 부여한다. EKS Pod Identity는 OIDC 등록 없이 더 단순하게 동일한 기능을 제공한다. Karpenter는 EC2 Fleet API를 직접 호출하여 Pending Pod 요구에 최적화된 인스턴스를 선택하며, CA의 ASG 제약을 우회한다. CodeDeploy는 EKS를 지원하지 않는다 — 이것은 시험의 단골 함정이다.
