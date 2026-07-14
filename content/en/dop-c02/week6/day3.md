# Day 3 - EKS CI/CD: Why GitOps Was Born, and How ArgoCD and Flux Changed Kubernetes

📅 Date: Week 6 (Day 3)
🎯 Topic: Modern GitOps Patterns in Kubernetes Environment — Pull-based Deployment, Helm/Kustomize, IRSA, Karpenter
⏱️ Study Time: Approximately 90 minutes

---

In 2017, Alexis Richardson from Weaveworks described a recurring problem his team faced while introducing the term "GitOps." The problem was simple. When operations teams directly changed Kubernetes cluster state using `kubectl apply`, nobody could be sure what the actual cluster state was a few days later. Someone urgently modified a ConfigMap. Another modified Deployment replica count. This is called Drift—the quiet divergence between declared specification and actual system state. Richardson's solution was surprisingly clear: "Make Git the single source of truth. Have the cluster look at Git and self-converge." This is GitOps's core insight.

However, understanding GitOps requires first understanding the method it replaces—push-based deployment—and why it becomes problematic at K8s scale. When CI/CD systems directly `kubectl` the cluster, this works fine for small teams. Problems emerge as cluster count grows, teams expand, and security audits appear. The CI server must hold cluster admin credentials, and storing these in GitHub Actions, Jenkins, or CodeBuild becomes an attack surface. Kubernetes community member Kelsey Hightower expressed this: "Your CI doesn't need to be inside the trust boundary of your production cluster."

GitOps inverts this trust boundary. CI builds images and pushes to registry—that's it. Deployment decisions are expressed by committing declarative specification to Git. A GitOps operator inside the cluster (ArgoCD or Flux) periodically polls Git, comparing current cluster state. On differences, the operator calls Kubernetes API directly to converge. CI servers don't need cluster credentials.

---

## Push-based vs Pull-based: Different Trust Boundary Locations

Push-based deployment: CodeBuild or GitHub Actions run `aws eks update-kubeconfig` and hit the cluster with `helm upgrade` or `kubectl apply`. This means CI systems live inside the cluster's trust boundary. Small systems enjoy simplicity advantage, but one of these three conditions creates problems:

First, cluster count increases. Ten clusters require ten sets of credentials. Second, security audits begin. SOC2 or PCI-DSS auditors ask "who has access to production clusters?" CI server holding admin credentials is unfavorable. Third, post-drift detection is impossible. Manual changes via `kubectl edit` go untracked until next deployment.

Pull-based GitOps redefines trust boundary around Git repository. Cluster operators need only read permission to Git. Backward—cluster to external—credential exposure disappears.

💡 **GitOps Core Security Principle**: CI servers don't write directly to clusters. They only declare "cluster state = Git state." Clusters self-converge to Git.

---

## ArgoCD Internal Architecture: Role Separation of 4 Components

ArgoCD is not a single process. Four core components have clearly separated responsibilities. Understanding this architecture reveals why specific components scale in high-availability setups.

**argocd-application-controller** is ArgoCD's heart. This controller is a textbook Kubernetes Controller Pattern implementation. It periodically compares `desired state` (manifests rendered from Git) vs `live state` (actual Kubernetes API state), computing Diff. When `automated.selfHeal: true`, this controller auto-triggers sync. Stateful by nature, normally single-instance, but large environments (thousands of Applications) support sharding.

**argocd-repo-server** fetches and renders manifests from Git. Executes `helm template` on Helm Charts, runs Kustomize, or parses plain YAML. Stateless, freely horizontally scalable. When Git polling load increases, scale up repo-server.

**argocd-server** is gRPC/HTTP API server. ArgoCD CLI and web UI access Application state, manually trigger sync, apply RBAC policy through this server. Stateless, horizontally scalable. Large multi-team environments distribute UI load.

**Redis** caches Application state. Stores application-controller's computed Diff results and live state cache, reducing repetitive Kubernetes API calls. Redis restart doesn't break ArgoCD but loses cache, so initial load is heavy.

```
ArgoCD Internal Flow:
────────────────────────────────────────────
  [Git Repository]
        │ (1m interval polling)
        ▼
  [repo-server]  ── Helm/Kustomize rendering
        │ rendered manifests
        ▼
  [application-controller]
        │ desired state vs live state comparison
        │ (Redis cache reference)
        ├─ No Diff → Synced
        └─ Diff exists → auto-sync? → Kubernetes API call
        
  [argocd-server] ← CLI/WebUI request handling (RBAC applied)
────────────────────────────────────────────
```

🔍 **Kubernetes Controller Pattern**: ArgoCD uses the same philosophy as Kubernetes itself. Just as Deployment Controller within kube-controller-manager reconciles `desired replicas vs actual replicas`, ArgoCD's application-controller reconciles `desired manifests (Git) vs live state (K8s API)`. This pattern is Leslie Lamport's practical implementation of "eventual consistency" from distributed systems theory.

---

## Flux v2 Toolkit: Composable Controller Collection, Not Monolith

Flux v1 was a single process. Flux v2 completely redesigned as GitOps Toolkit, splitting into 5 independent controllers. This design decision was faithful to Unix philosophy—each tool does one thing well, composable together.

**source-controller** manages "where to fetch from." Supports Git Repository, Helm Repository, OCI Repository (Helm Charts or Kustomize packaged as OCI artifacts). Define `GitRepository` resource; source-controller periodically polls Git, detecting changes and making downloaded archive available as local artifact for other controllers.

**kustomize-controller** processes `Kustomization` CRD. Executes Kustomize on artifact source-controller provides, applies to cluster.

**helm-controller** processes `HelmRelease` CRD. Installs or upgrades Helm Chart with specified values. Manages Helm release state as Kubernetes CRD, so check status with `kubectl get helmrelease` instead of `helm list`.

**notification-controller** notifies external systems of cluster events. Sends sync results to Slack, Teams, PagerDuty, GitHub Status API, etc.

**image-automation-controller** is Flux's unique feature. Polls container registries, detecting new image tags, auto-updates manifests repo with commit updating image tag. When source-controller detects commit, kustomize-controller or helm-controller reflects new image to cluster. Complete automated GitOps loop.

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
    name: github-pat  # PAT or SSH key

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
  prune: true         # Delete resources removed from Git
  interval: 5m
  timeout: 3m
  healthChecks:       # Validate deployment success
    - apiVersion: apps/v1
      kind: Deployment
      name: myapp
      namespace: prod
```

📚 **Flux vs ArgoCD Selection Criteria**: ArgoCD's powerful UI and RBAC suit multi-tenant environments where multiple teams share one ArgoCD. Flux is lighter, more Kubernetes-native, suitable for "platform team without UI." Real-world uses both simultaneously or runs only argocd-image-updater from Flux on top of ArgoCD.

---

## Helm: Design Philosophy of Kubernetes Package Manager

Helm was born from simple need. Deploying one application to Kubernetes requires multiple YAMLs: Deployment, Service, ConfigMap, Ingress, ServiceAccount, HorizontalPodAutoscaler. These YAMLs relate to each other; some values differ per environment (dev/staging/production). Helm packages these correlated YAML bundles as Charts, externalizing variable parts as values.

Helm Chart comprises three key files. `Chart.yaml` holds metadata (name, version, dependencies). `values.yaml` defines defaults. `templates/` contains Kubernetes manifest templates written in Go template syntax.

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
# values.yaml (defaults)
replicaCount: 2
image:
  repository: 111222333.dkr.ecr.ap-northeast-2.amazonaws.com/myapp
  tag: "latest"      # Override during deployment with --set image.tag=<SHA>
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
  enabled: false     # Use external RDS when false

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

Helm deployment command is `helm upgrade --install`. `--install` creates if missing, upgrades if exists, idempotent for CI.

```bash
# Per-environment values file + image tag override
helm upgrade --install myapp ./chart \
  --namespace prod \
  --create-namespace \
  --values values.prod.yaml \
  --set image.tag=${CODEBUILD_RESOLVED_SOURCE_VERSION} \
  --wait \           # Wait for Pods to be Ready (validates rollout)
  --timeout 5m \
  --atomic           # Auto-rollback on failure
```

`--atomic` flag, added in Helm 3, is important. If upgrade doesn't complete within `--timeout`, automatically rolls back to previous release. Equivalent to ECS Blue/Green rollback but implemented with Kubernetes and Helm native mechanisms.

⚠️ **Helm vs Kustomize Selection Trap**: Helm is powerful but Go template debugging is hard. Kustomize uses pure YAML overlay approach with lower learning curve. ArgoCD supports both, so recommended pattern is starting new projects with Kustomize, switching to Helm when sharing packages needed.

---

## Kustomize: Expressing Environment Differences Without YAML Copy

Kustomize's core concept is "base + overlay." Keep common Kubernetes manifests in base; express environment differences (environment variables, image tags, resource limits, replica counts) as patches in overlay. Instead of copying YAML files per environment, describe differences only.

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
    newTag: abc1234def  # CI updates this value via kustomize edit set image
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
  replicas: 5  # prod only has 5
```

Kustomize's `images` section is particularly useful in CI/CD pipelines. Single command `kustomize edit set image myapp=111.dkr.ecr.../myapp:${GIT_SHA}` updates specific overlay's image tag and commits to Git. This is the manual version of what image-automation-controller does.

---

## IRSA vs EKS Pod Identity: Two Methods for Granting AWS Permissions at Pod Level

Kubernetes Pods often need AWS service access. Read files from S3, write to DynamoDB, fetch secrets from Secrets Manager. Early approach used node EC2 Instance Profile. Assigning needed permissions to node IAM Role meant all Pods on that node had those permissions. This clearly violates least privilege. Bill payment Pod and log collector Pod running on same node—log collector could access payment DynamoDB.

**IRSA (IAM Roles for Service Accounts)** solves this with OIDC. EKS clusters have OIDC Provider URLs. Registering this Provider in IAM lets AWS trust ServiceAccount tokens issued by EKS. Operation is:

1. Register EKS cluster OIDC Provider URL to AWS IAM
2. Create IAM Role; specify specific Namespace and ServiceAccount in Trust Policy as Subject
3. Add `eks.amazonaws.com/role-arn` annotation to Kubernetes ServiceAccount
4. When Pod uses ServiceAccount, EKS mounts OIDC token to Pod
5. Pod's AWS SDK calls STS `AssumeRoleWithWebIdentity` with token to get temporary credentials

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

**EKS Pod Identity** (launched November 2023) is IRSA simplified. No separate OIDC Provider registration needed. Instead, `eks:CreatePodIdentityAssociation` API directly connects ServiceAccount to IAM Role. AWS provides tokens via EKS Pod Identity Agent (DaemonSet). Largest difference from IRSA: Trust Policy setup unnecessary—IAM Role's Trust Policy only needs `eks.amazonaws.com` as Principal.

```bash
# EKS Pod Identity setup (much simpler than IRSA)
aws eks create-pod-identity-association \
  --cluster-name prod-cluster \
  --namespace prod \
  --service-account myapp-sa \
  --role-arn arn:aws:iam::111222333:role/MyAppRole
```

🔍 **IRSA vs Pod Identity Exam Point**: IRSA supported since EKS 1.13; widely used in existing clusters. Pod Identity requires EKS 1.24+; simpler setup advantage. Exams frequently ask IRSA's 3-step process: OIDC Provider registration → Trust Policy → ServiceAccount annotation.

---

## Karpenter: Scheduling-Aware Node Provisioner

Cluster Autoscaler (CA), appearing in 2016, is traditional reactive node autoscaler. Operation is reactive. When Pod becomes Pending, CA checks currently configured Auto Scaling Groups and adds one instance type from that ASG. This approach's constraint is clear: ASG must be pre-configured with specific instance types. Using `m5.xlarge` ASG, if Pending Pod needs more memory, CA can't add larger instances.

Karpenter, open-sourced by AWS in 2021, bypasses ASG and calls EC2 API directly. Core differential is scheduling-aware characteristic. Karpenter directly analyzes Pending Pod resource requests (CPU, memory), Node Selector, Affinity, Toleration, choosing optimal EC2 instance type simultaneously scheduling all Pods. From dozens of candidate instance types considering cost and availability, it selects real-time.

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
          values: ["spot", "on-demand"] # Spot preferred, On-Demand fallback
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
    consolidateAfter: 30s              # Remove empty nodes after 30s

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

Karpenter's Consolidation is unique to CA. When cluster runs several small nodes at low utilization, Karpenter simulates whether Pods can be rebinned to fewer nodes. If possible, drains existing nodes and reprovisioning more efficiently. This is not simple scale-down but empty-space fill optimization.

📚 **Karpenter and Fargate Spot Similarity**: Similar to Fargate Spot's SIGTERM 2-minute warning (Week 6 Day 2), Karpenter Spot nodes receive EC2 Spot Interruption Notice, draining node and rescheduling Pods elsewhere. Add `karpenter.sh/do-not-disrupt: "true"` annotation to Pod to prevent Karpenter's voluntary disruption (Consolidation).

---

## Why CodeDeploy Doesn't Support EKS

This is frequently set up as exam trap. Because CodeDeploy Blue/Green works excellently with ECS, exam takers assume identical function on EKS. CodeDeploy doesn't support EKS.

Reason stems from design philosophy differences. CodeDeploy is AWS-managed deployment service with CodeDeploy Agent handling deployment mechanism. ECS has native CodeDeploy integration. Kubernetes has its own Rolling Update and Deployment rollout mechanisms, completed inside Kubernetes control plane. Adding CodeDeploy Agent to K8s cluster conflicts with this architecture.

Three methods implement Blue/Green-like deployment on EKS. First, Argo Rollouts—separate controller in ArgoCD ecosystem implementing Canary and Blue/Green strategies as Kubernetes-native CRD. Second, Helm's `--atomic` with two Deployments switched at Service level. Third, AWS Load Balancer Controller's weighted target group routing—conceptually identical to CodeDeploy Blue/Green but implemented in Kubernetes.

⚠️ **Exam Trap**: "How to use CodeDeploy on EKS?" Answer is "CodeDeploy doesn't support EKS." Don't confuse with ECS.

---

## ArgoCD Image Updater: Complete Automated GitOps Loop

General GitOps flow has manual image tag update step. After CI pushes image to ECR, someone (or CI differently) must update manifests repo YAML and commit. ArgoCD Image Updater automates this step.

Image Updater connects to ArgoCD Application via `ImageUpdatePolicy` CRD. Periodically polls ECR, Docker Hub, GitHub Container Registry, etc., detecting new image tags. Detection methods vary—latest semver, specific regex pattern, specific prefix, etc. On detecting new tag, creates commit directly to Git repo or updates ArgoCD Application parameter. ArgoCD detects change and syncs.

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

🎯 **Complete Automated GitOps Flow Summary**:
1. Developer commits code → CodeBuild triggered
2. CodeBuild: builds image → pushes to ECR (tag: `git SHA`)
3. Image Updater: polls ECR → detects new tag → commits to manifests repo
4. ArgoCD: detects manifest change → syncs → calls K8s API → updates Pod
5. Drift occurs: selfHeal automatically restores previous state

---

## Pod Disruption Budget: Guaranteeing Availability During Deployment and Scaling

During Kubernetes node upgrade, Karpenter Consolidation, or Deployment rollout, simultaneous Pod termination can cause service interruption. Pod Disruption Budget (PDB) prevents this.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
  namespace: prod
spec:
  minAvailable: 2      # Keep minimum 2 Pods always Running
  selector:
    matchLabels:
      app: myapp
```

Or express with `maxUnavailable`:

```yaml
spec:
  maxUnavailable: 1    # Maximum 1 simultaneous disruption
```

PDB is respected by Karpenter, Cluster Autoscaler, `kubectl drain`, Deployment rolling update. When Karpenter attempts Consolidation, PDB-violating disruption doesn't execute. ArgoCD/Flux GitOps deployment also applies—during rollout if `maxUnavailable: 1`, ArgoCD follows Kubernetes Deployment rollout strategy which considers PDB.

---

## Real Case: Weaveworks Production GitOps

Weaveworks, the company that created GitOps concept, made its production environment the first large-scale GitOps implementation. 2017 published case shared concrete numbers from switching. Deployment frequency increased from weekly to dozens daily. Rollback time shortened from hours to minutes. Most important: Drift detection—weekend emergency hotfix via `kubectl edit` followed by Monday regular deployment overwriting it completely vanished. selfHeal instantly reverts Drift.

2021 published Codefresh benchmark provided actual ArgoCD vs Flux performance comparison. At 1000 Application baseline, ArgoCD had higher API server and app-controller memory usage but excelled in web UI and RBAC features. Flux was more memory-efficient but lacked UI. This benchmark is widely cited by platform teams for "ArgoCD vs Flux" decision-making.

💡 **Spotify Case**: Spotify manages 1000+ Kubernetes services with ArgoCD. Interesting: uses ArgoCD ApplicationSet—CRD creating multiple Applications from single template—managing multi-region deployment. DOP-C02 emphasizes basic Application and syncPolicy over ApplicationSet, but ApplicationSet is practical multi-cluster solution worth knowing.

---

## Admission Controller and Policy as Code

If GitOps controls "what to deploy via Git," Admission Controller controls "which deployments are allowed in cluster." OPA Gatekeeper and Kyverno are representative implementations.

Policy example: "All Production namespace Containers must use only signed images." Expressed as Kyverno ClusterPolicy:

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

With this policy, when ArgoCD attempts syncing with unsigned image, Kubernetes API server requests verification from Kyverno via Admission Webhook. Kyverno returns Deny; Pod isn't created. ArgoCD sync fails and alerts.

This connects Week 6 Day 1's ECR image signing (Sigstore, cosign). End-to-End image integrity guarantee architecture: ECR image signing (cosign) → ECR Enhanced Scanning (Inspector) → Kyverno/OPA Admission Control → ArgoCD/Flux deployment.

🔍 **DOP-C02 Connection**: Image signing (ECR + cosign) → ECR Enhanced Scanning (Inspector) → Kyverno/OPA Admission Control → ArgoCD/Flux deployment. This entire chain is "container security pipeline," frequently appearing as Security domain DOP-C02 problems.

---

## EKS CI/CD Pattern Decision Tree

```
[EKS Deployment Strategy Selection]
│
├─ Don't want to expose cluster credentials to CI?
│      Yes → GitOps (ArgoCD or Flux)
│      No  → Push-based (CodeBuild + Helm/kubectl)
│
├─ [GitOps Selection]
│      Multiple teams share one GitOps + need UI?
│             Yes → ArgoCD
│             No  → Flux (lighter, K8s-native)
│
├─ [Template Tool Selection]
│      Need shared packages? Deploy chart to Helm Hub?
│             Yes → Helm
│             Environment overlay only? → Kustomize
│
├─ [Node Provisioning]
│      Arbitrary instance type + Spot + fast scale?
│             Yes → Karpenter
│             Simple ASG sufficient?
│             Yes → Cluster Autoscaler
│
└─ [Pod IAM Permission]
       New cluster (EKS 1.24+)? → EKS Pod Identity (simpler)
       Existing cluster / existing IRSA? → Keep IRSA
```

---

## Architecture Diagram: Complete EKS GitOps Pipeline

```
EKS GitOps Complete Architecture (DOP-C02 Perspective)
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
    ├─ overlays/prod/kustomization.yaml  ← image tag update
    └─ base/ (common K8s resources)

    │ (4) ArgoCD polls every 1m
    ▼
┌─────────────────────────────────────────────────────────┐
│  EKS Cluster (prod)                                     │
│                                                         │
│  [argocd namespace]                                     │
│   ├─ repo-server   (Kustomize rendering)                │
│   ├─ app-controller (desired vs live comparison, sync)  │
│   ├─ argocd-server  (UI/API, RBAC)                     │
│   └─ redis          (state cache)                       │
│                                                         │
│  [prod namespace]                                       │
│   ├─ Deployment (myapp) — IRSA/Pod Identity for ECR    │
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
│   SA(myapp) → IAM Role → S3, DynamoDB, SM access       │
└─────────────────────────────────────────────────────────┘
                │
                │ Karpenter: EC2 Fleet API direct call
                ▼
            EC2 Spot / On-Demand (optimal instance auto-selection)

════════════════════════════════════════════════════════════════
```

---

## Core Concepts Summary Table

| Concept | Key Point | Exam Trap |
|---------|-----------|-----------|
| GitOps | Cluster pulls from Git; CI creds unnecessary | Confuse with push-based |
| ArgoCD selfHeal | Auto-restore Drift to Git state | Difference between prune and selfHeal |
| Flux image-updater | ECR polling → manifests commit automation | ArgoCD has separate Image Updater |
| Helm --atomic | Auto-rollback on timeout | --atomic alone without --wait caution |
| IRSA | OIDC → Trust Policy → SA annotation | Memorize Trust Policy Subject format |
| Pod Identity | IRSA simplified, EKS 1.24+ | OIDC Provider registration unnecessary |
| Karpenter | EC2 Fleet API direct, arbitrary instances | ASG bypass = structural difference from CA |
| CodeDeploy + EKS | Not supported | ECS confusion caution |
| PDB | Voluntary disruption Pod minimum guarantee | Karpenter, drain, rollout all respect |

---

## Practice Questions

**Question 1.** Team building EKS CI/CD pipeline. Security requirement: "CI server (CodeBuild) must not have production cluster credentials." Most appropriate architecture?

A) Give CodeBuild EKS Admin Role, execute kubectl apply  
B) Install ArgoCD in cluster; CodeBuild commits to manifests repo. ArgoCD polls Git for sync  
C) Lambda receives CodeBuild result, directly call Kubernetes API  
D) Integrate CodeDeploy with EKS for Blue/Green deployment  

**Answer: B**

This is pull-based GitOps core security principle. CodeBuild needs access to app code repo and manifests repo. Cluster maintains write permission internally via ArgoCD. No external→cluster credential exposure.

Why other options wrong: A violates security requirement. C also needs cluster credential. D: CodeDeploy doesn't support EKS.

---

**Question 2.** Difference between `syncPolicy.automated.selfHeal: true` and `syncPolicy.automated.prune: true` in ArgoCD Application?

A) selfHeal deletes removed Git resources from cluster; prune restores Drift  
B) selfHeal auto-restores manually-changed Drift to Git state; prune deletes resources removed from Git  
C) Both options identical  
D) selfHeal fixes node failure; prune restarts Pod  

**Answer: B**

`selfHeal` auto-reverts when someone `kubectl edit` or `kubectl patch`; ArgoCD restores Git state. `prune` deletes Kubernetes resources when manifest file deleted from Git repo. Independent settings, activate separately.

Why other wrong: A reverses roles. C completely different functions. D confuses with Kubernetes native features (liveness probe).

---

## Week 6 Summary

GitOps is paradigm introduced 2017 to solve Drift. Core: trust boundary shifted to Git. CI only pulls; cluster self-converges to Git. ArgoCD's 4 components (app-controller, repo-server, api-server, Redis) implement control loop philosophy from Kubernetes. ArgoCD selfHeal reverts Drift; prune removes deleted resources.

Flux v2 is composable toolkit (5 independent controllers). image-automation-controller enables complete automation loop.

Helm packages manifests with values.yaml for environment differentiation; `--atomic` provides auto-rollback. Kustomize uses base+overlay avoiding YAML duplication.

IRSA: OIDC + Trust Policy + SA annotation enables Pod-level IAM permission. EKS Pod Identity simplifies this. Karpenter bypasses ASG, EC2 Fleet API direct-calling, selecting optimal instance types real-time. CodeDeploy doesn't support EKS—use GitOps or Helm instead.
