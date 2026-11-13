# Day 3 - EKS CI/CD: Why GitOps Was Born, and How ArgoCD and Flux Changed Kubernetes

📅 Date: Week 6 (Day 3)
🎯 Topic: Modern GitOps patterns for Kubernetes: pull-based deployment, Helm/Kustomize, IRSA, Karpenter
⏱️ Study time: about 90 minutes

---

In 2017, Alexis Richardson, an engineer at Weaveworks, first used the word "GitOps" while describing a recurring problem his team faced. The problem was simple. When the operations team changed the state of a Kubernetes cluster directly with `kubectl apply`, a few days later nobody could be sure what state the actual cluster was in. Someone had urgently edited a ConfigMap, and someone else had changed a Deployment's replica count. This is called drift: the phenomenon where the declarative specification and the actual system state quietly diverge. Richardson's solution was strikingly clear: "Make Git the single source of truth, and let the cluster watch Git and converge itself." That is the core insight of GitOps.

But to understand GitOps, you first need to understand why the approach it aims to replace, push-based deployment, becomes a problem at K8s scale. Having the CI/CD system fire `kubectl` directly at the cluster works well for small teams. The problems show up as the number of clusters grows, the team grows, and security audit requirements appear. The CI server must hold the cluster's admin credentials, and the very fact that these credentials are stored in GitHub Actions, Jenkins, or CodeBuild becomes an attack surface. In the Kubernetes community, Kelsey Hightower put this problem as "there is no reason your CI should be inside the production cluster's trust boundary."

GitOps flips this trust boundary. CI builds the image and pushes it to the registry. That is where it ends. The deployment decision is expressed by committing a declarative specification to the Git repository, and a GitOps operator inside the cluster (ArgoCD or Flux) periodically polls Git and compares it with the current cluster state. If there is a difference, the operator calls the Kubernetes API directly to converge it. The CI server does not need to hold cluster credentials.

---

## Push-Based vs Pull-Based: The Trust Boundary Sits in a Different Place

In push-based deployment, CodeBuild or GitHub Actions runs `aws eks update-kubeconfig` and fires `helm upgrade` or `kubectl apply` directly at the cluster. This means the CI system is inside the cluster's trust boundary. When the system is small, this has the advantage of simplicity, but it becomes a problem when any one of the following three conditions arises.

First, the number of clusters grows. Pushing to 10 clusters requires 10 sets of credentials, and you have to manage a different IAM Role or kubeconfig for each. Second, security audits begin. A SOC2 or PCI-DSS assessor asks "who has access to the production cluster?" An answer of "the CI server has admin credentials" is unfavorable. Third, drift cannot be detected after it occurs. A setting changed directly with `kubectl edit` is not tracked until the next deployment.

Pull-based GitOps redefines the trust boundary around the Git repository. The cluster operator only needs permission to read Git. The exposure of credentials in the reverse direction, from outside into the cluster, disappears.

**The core GitOps security principle**: the CI server never writes to the cluster directly. It only declares "cluster state = Git state." The cluster converges itself to Git.

---

## ArgoCD Internal Architecture: Separation of Roles Across 4 Components

ArgoCD is not a single process. Four core components have clearly separated responsibilities. Understanding this structure makes it natural to see which component you scale in a high-availability setup.

**argocd-application-controller** is the heart of ArgoCD. This controller is a textbook implementation of the Kubernetes Controller Pattern. It periodically compares the `desired state` (manifests rendered from Git) with the `live state` (the actual Kubernetes API state) and computes the difference, that is, the diff. When `automated.selfHeal: true` is set, this controller triggers a sync automatically. This component keeps state, so by default it runs as a single instance, but in large environments running thousands of Applications it supports sharding.

**argocd-repo-server** fetches manifests from the Git repository and renders them. It renders Helm Charts with `helm template`, runs Kustomize, or parses plain YAML. This component is stateless, so it scales horizontally with ease. When the Git polling load increases, you add repo-servers.

**argocd-server** is the gRPC/HTTP API server. The argocd CLI and the web UI use this server to look up Application state, trigger syncs manually, and apply RBAC policies. This component is also stateless and can scale horizontally, and in large team environments it can spread the UI access load.

**Redis** acts as a cache of Application state. It stores the diff results computed by the application-controller and a cache of the live state to reduce repeated Kubernetes API calls. If Redis restarts, ArgoCD keeps working, but the cache is gone, so the initial load becomes heavy.

```
ArgoCD internal flow:
────────────────────────────────────────────
  [Git Repository]
        │ (1m interval polling)
        ▼
  [repo-server]  ── Helm/Kustomize rendering
        │ rendered manifests
        ▼
  [application-controller]
        │ compare desired state vs live state
        │ (consult Redis cache)
        ├─ No diff → Synced
        └─ Diff → auto-sync? → call Kubernetes API
        
  [argocd-server] ← handles CLI/WebUI requests (RBAC applied)
────────────────────────────────────────────
```

**Kubernetes Controller Pattern**: ArgoCD uses the same pattern as Kubernetes' own control-loop philosophy. Just as the Deployment Controller inside kube-controller-manager reconciles `desired replicas vs actual replicas`, ArgoCD's application-controller reconciles `desired manifests (Git) vs live state (K8s API)`. This pattern is a practical implementation of the "eventual consistency" that Leslie Lamport discusses in distributed systems theory.

---

## Flux v2 Toolkit: A Set of Composable Controllers, Not a Single Tool

Flux v1 was a single process. Flux v2 was completely redesigned as the GitOps Toolkit and split into 5 independent controllers. This design decision is more faithful to the Unix philosophy (one tool does one thing, and they are composable) than a "one does it all" approach.

**source-controller** is responsible for "where to fetch from." It supports Git Repositories, Helm Repositories, and OCI Repositories (Helm Charts or Kustomize packaged as OCI artifacts). When you define a `GitRepository` resource, the source-controller polls Git periodically, and when it detects a change, it turns the downloaded archive into a local artifact that other controllers can reference.

**kustomize-controller** handles the `Kustomization` CRD. It runs Kustomize on the artifact provided by the source-controller and applies the result to the cluster.

**helm-controller** handles the `HelmRelease` CRD. It installs or upgrades a Helm Chart with the specified values. Because it manages Helm release state as a Kubernetes CRD, you check status with `kubectl get helmrelease` rather than `helm list`.

**notification-controller** reports cluster events to external systems. It sends sync results to Slack, Teams, PagerDuty, the GitHub Status API, and so on.

**image-automation-controller** is a distinctive Flux feature. It polls a registry such as ECR, and when it detects a new image tag, it creates a commit that automatically updates the manifest in the Git repository. When the source-controller detects this commit, the kustomize-controller or helm-controller applies the new image to the cluster. It is a fully automated GitOps loop.

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
  prune: true         # Delete resources that disappeared from Git
  interval: 5m
  timeout: 3m
  healthChecks:       # Verify the deployment succeeded
    - apiVersion: apps/v1
      kind: Deployment
      name: myapp
      namespace: prod
```

**Flux vs ArgoCD selection criteria**: ArgoCD has a strong UI and RBAC, so it suits multi-tenant environments where several teams share one ArgoCD. Flux is lighter and more K8s-native, and suits "platform teams that don't need a UI." In practice, people use both at the same time, and there is also a hybrid pattern that uses only Flux's image-automation-controller on top of ArgoCD.

---

## Helm: The Design Philosophy of the Kubernetes Package Manager

The reason Helm exists is simple. Deploying one application to Kubernetes requires many YAML files: Deployment, Service, ConfigMap, Ingress, ServiceAccount, HorizontalPodAutoscaler, and more. These YAML files are related to each other, and some values differ per environment (dev/staging/production). Helm packages this related set of YAML as a Chart and externalizes the variable parts as values.

A Helm Chart consists of three core files. `Chart.yaml` holds metadata (name, version, dependencies). `values.yaml` defines default values. The `templates/` directory holds Kubernetes manifest templates written in Go template syntax.

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
  tag: "latest"      # Override at deploy time with --set image.tag=<SHA>
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
  enabled: false     # false when using an external RDS
 
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

Helm's deployment command is `helm upgrade --install`. `--install` installs the release if it doesn't exist and upgrades it if it does, so you can use it idempotently in CI.

```bash
# Per-environment values file + image tag override
helm upgrade --install myapp ./chart \
  --namespace prod \
  --create-namespace \
  --values values.prod.yaml \
  --set image.tag=${CODEBUILD_RESOLVED_SOURCE_VERSION} \
  --wait \           # Wait until Pods are Ready (rollout verification)
  --timeout 5m \
  --atomic           # Automatic rollback on failure
```

The `--atomic` flag is an important feature added in Helm 3. If the upgrade does not complete within `--timeout`, it automatically rolls back to the previous release. Helm provides on its own the equivalent of ECS's Blue/Green rollback.

⚠️ **Helm vs Kustomize selection pitfall**: Helm is powerful, but Go templates are hard to debug. Kustomize uses plain YAML overlays and has a low learning curve. ArgoCD supports both, so the recommended pattern is to start a new project with Kustomize and switch to Helm when you need a shared package.

---

## Kustomize: Expressing Per-Environment Differences Without Copying YAML Files

Kustomize's core concept is "base + overlay." You put the common Kubernetes manifests in the base and express per-environment differences (environment variables, image tags, resource limits, replica counts) as patches in overlays. Instead of copying YAML files per environment, you describe only the differences.

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
    newTag: abc1234def  # CI updates this value with kustomize edit set image
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
  replicas: 5  # 5 only in prod
```

Kustomize's `images` section is especially useful in CI/CD pipelines. A single command, `kustomize edit set image myapp=111.dkr.ecr.../myapp:${GIT_SHA}`, can update the image tag of a specific overlay and commit it to Git. This is the manual version of what the image-automation-controller does.

---

## IRSA vs EKS Pod Identity: Two Ways to Grant AWS Permissions Per Pod in Kubernetes

It is very common for a Kubernetes Pod to need access to AWS services: reading files from S3, writing to DynamoDB, or fetching secrets from Secrets Manager. The early approach was to use the node's EC2 Instance Profile. If you granted the needed permissions to the node's IAM Role, every Pod running on that node could use them. This is a clear violation of least privilege. When a payment service Pod and a log collector Pod run on the same node, the log collector can also access the payment system's DynamoDB.

**IRSA (IAM Roles for Service Accounts)** solves this problem based on OIDC. An EKS cluster has an OIDC Provider URL, and when you register this Provider in IAM, AWS can trust the Service Account tokens issued by EKS. It works as follows.

1. Register the EKS cluster's OIDC Provider URL in AWS IAM.
2. Create an IAM Role and specify a particular Namespace and ServiceAccount as the Subject in the Trust Policy.
3. Add the `eks.amazonaws.com/role-arn` annotation to the Kubernetes ServiceAccount.
4. When a Pod uses this ServiceAccount, EKS mounts an OIDC token into the Pod.
5. The Pod's AWS SDK uses this token to call STS `AssumeRoleWithWebIdentity` and obtain temporary credentials.

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

**EKS Pod Identity** (released in November 2023) is a simplified version of IRSA. You don't need to register an OIDC Provider separately. Instead, you link a ServiceAccount to an IAM Role directly with the `eks:CreatePodIdentityAssociation` API. AWS delivers tokens through the EKS Pod Identity Agent (a DaemonSet). The biggest difference from IRSA is that no Trust Policy setup is needed: you only specify `eks.amazonaws.com` as the Principal in the IAM Role's Trust Policy.

```bash
# EKS Pod Identity setup (much simpler than IRSA)
aws eks create-pod-identity-association \
  --cluster-name prod-cluster \
  --namespace prod \
  --service-account myapp-sa \
  --role-arn arn:aws:iam::111222333:role/MyAppRole
```

**IRSA vs Pod Identity exam points**: IRSA has been supported since EKS 1.13 and is widely used in existing clusters. Pod Identity requires EKS 1.24+, and its advantage is simpler setup. The exam includes questions that ask about the 3 steps of IRSA: OIDC Provider registration → Trust Policy → ServiceAccount annotation.

---

## Karpenter: A Scheduling-Aware Node Provisioner

Cluster Autoscaler (CA), which appeared in 2016, is the traditional node autoscaler. It works reactively. When a Pod becomes Pending, CA checks the currently configured Auto Scaling Group (ASG) and adds one of that ASG's instance types. The limitation of this approach is clear: an ASG must be configured with specific instance types in advance. If you are using an `m5.xlarge` ASG and a Pending Pod requires more memory, CA cannot add a larger instance.

Karpenter is a node provisioner that AWS open-sourced in 2021, and it bypasses ASGs and calls the EC2 API directly. Its key differentiator is that it is scheduling-aware. Karpenter directly analyzes the Pending Pods' resource requests (CPU, memory), Node Selectors, Affinity, and Tolerations, and chooses the optimal EC2 instance type that can schedule those Pods all at once. It keeps dozens of instance types as candidates and chooses among them in real time, considering cost and availability.

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
          values: ["spot", "on-demand"] # Spot first, On-Demand if unavailable
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
    consolidateAfter: 30s              # Remove empty nodes after 30 seconds

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

Karpenter's Consolidation feature is something CA does not have. When several small nodes are running at low utilization in the cluster, Karpenter simulates whether those Pods can be repacked onto fewer nodes. If so, it drains the existing nodes and provisions new nodes more efficiently. This is not a simple scale-down but a bin-packing optimization that fills empty gaps.

**Karpenter and Fargate Spot similarities**: Just like the 2-minute SIGTERM warning for Fargate Spot covered in Week 6 Day 2, a Karpenter Spot node that receives an EC2 Spot Interruption Notice drains the node and reschedules the Pods onto other nodes. Adding the `karpenter.sh/do-not-disrupt: "true"` annotation to a Pod prevents Karpenter's voluntary disruption (Consolidation).

---

## Why CodeDeploy Does Not Support EKS

This is used as a pitfall on the exam. Because CodeDeploy Blue/Green works so well with ECS, test takers assume it works the same way with EKS. But CodeDeploy does not support EKS.

The reason comes from a difference in design philosophy. CodeDeploy is a managed deployment service provided by AWS, in which the CodeDeploy Agent handles the deployment mechanism. In ECS, the ECS service itself is integrated with CodeDeploy. Kubernetes has its own Rolling Update and Deployment rollout mechanism, and it is completed inside the Kubernetes control plane. Adding a CodeDeploy Agent to a K8s cluster does not fit this architecture.

There are three ways to implement Blue/Green-like deployment on EKS. First, Argo Rollouts: a separate controller in the ArgoCD ecosystem that implements Canary and Blue/Green strategies as Kubernetes-native CRDs. Second, switching between two Deployments at the Service level together with Helm's `--atomic`. Third, weighted target group routing in the AWS Load Balancer Controller: conceptually the same as CodeDeploy Blue/Green but implemented in Kubernetes.

⚠️ **Exam pitfall**: the correct answer to the question "How do you use CodeDeploy with EKS?" is "CodeDeploy does not support EKS." Don't confuse it with ECS.

---

## ArgoCD Image Updater: A Fully Automated GitOps Loop

In a typical GitOps flow, updating the image tag includes a manual step. After CI pushes the image to ECR, someone (or another CI stage) must update the YAML in the manifests repository and commit it. ArgoCD Image Updater automates this step.

Image Updater connects to an ArgoCD Application through the `ImageUpdatePolicy` CRD. It periodically polls ECR, Docker Hub, GitHub Container Registry, and others to detect new image tags. There are several detection methods: the latest semver, a specific regex pattern, a specific prefix, and so on. When it detects a new tag, it either creates a commit directly in the Git repository or updates the ArgoCD Application's parameters. ArgoCD detects this change and performs the sync.

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

🎯 **Summary of the fully automated GitOps flow**:
1. A developer commits code → CodeBuild is triggered
2. CodeBuild: builds the image → pushes to ECR (tag: `git SHA`)
3. Image Updater: polls ECR → detects the new tag → commits to the manifests repo
4. ArgoCD: detects the manifests change → sync → calls the K8s API → Pods are updated
5. If drift occurs, selfHeal automatically restores the previous state

---

## Pod Disruption Budget: Guaranteeing Availability During Deployment and Scaling

In Kubernetes, if certain Pods are terminated at the same time during a node upgrade, Karpenter Consolidation, or a Deployment rollout, a service outage can occur. A Pod Disruption Budget (PDB) is the policy that prevents this.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
  namespace: prod
spec:
  minAvailable: 2      # Always keep at least 2 Pods in Running state
  selector:
    matchLabels:
      app: myapp
```

Or you can express it with `maxUnavailable`:

```yaml
spec:
  maxUnavailable: 1    # Allow at most 1 disruption at a time
```

PDBs are respected by Karpenter, Cluster Autoscaler, `kubectl drain`, and Deployment rolling updates alike. When Karpenter attempts Consolidation, a disruption that would violate the PDB is not executed. This also applies during GitOps deployments through ArgoCD/Flux: if `maxUnavailable: 1` during a rollout, ArgoCD follows the Kubernetes Deployment's rollout strategy, and the Deployment's rollout strategy takes the PDB into account.

---

## A Real Case: Weaveworks' Own Production GitOps

Because Weaveworks is the company that created the GitOps concept, its own production environment became the first large-scale real-world example of GitOps. In a case published in 2017, Weaveworks shared concrete numbers from starting with a single cluster and moving to GitOps. Deployment frequency rose from once a week to dozens of times a day, and rollback time dropped from hours to minutes. Most important was drift detection: the problem where someone applied an urgent hotfix with `kubectl edit` over the weekend and the regular Monday deployment overwrote it disappeared completely, because selfHeal reverts drift immediately.

A Codefresh benchmark published in 2021 provided a real performance comparison of ArgoCD and Flux. At 1000 Applications, ArgoCD showed higher memory usage in the API server and app-controller, but it was ahead in web UI and RBAC features. Flux was memory-efficient but had no UI. This benchmark is widely cited by platform teams as a criterion for choosing between "ArgoCD vs Flux."

**Spotify case**: Spotify uses ArgoCD to manage more than 1000 Kubernetes services. What is interesting is that it manages multi-Region deployment with ArgoCD ApplicationSet, a CRD that creates the same Application across multiple clusters from a single template. On the DOP-C02 exam, the basic Application and syncPolicy matter more than ApplicationSet, but it is good to know ApplicationSet as the practical solution to the multi-cluster problem.

---

## Admission Controllers and Policy as Code

If GitOps controls "what to deploy" through Git, an Admission Controller controls "which deployments are allowed" in the cluster. OPA Gatekeeper and Kyverno are the representative implementations.

Example policy: "Every container in the Production namespace must use only signed images." Expressed as a Kyverno ClusterPolicy:

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

With this policy in place, when ArgoCD tries to sync with an unsigned image, the Kubernetes API server asks Kyverno for validation through an Admission Webhook, and if Kyverno returns Deny, the Pod is not created. ArgoCD's sync fails and a warning is raised.

This connects to the ECR image signing (Sigstore, cosign) from Week 6 Day 1. Having Kyverno verify at cluster entry the images signed in ECR is the end-to-end image integrity architecture.

**DOP-C02 connection**: image signing (ECR + cosign) → ECR Enhanced Scanning (Inspector) → Kyverno/OPA Admission Control → ArgoCD/Flux deployment. This whole chain is the "container security pipeline," and it can appear as a Security domain question on DOP-C02.

---

## EKS CI/CD Pattern Decision Tree

```
[Choosing an EKS deployment strategy]
│
├─ Don't want to expose cluster credentials to CI?
│      Yes → GitOps (ArgoCD or Flux)
│      No  → Push-based (CodeBuild + Helm/kubectl)
│
├─ [If you chose GitOps]
│      Multiple teams share one GitOps server? + need a UI?
│             Yes → ArgoCD
│             No  → Flux (lighter and K8s-native)
│
├─ [Choosing a templating tool]
│      Need a shared package? Publish charts to a Helm hub?
│             Yes → Helm
│             Only need per-environment overlays? → Kustomize
│
├─ [Node provisioning]
│      Arbitrary instance types + Spot + fast scaling?
│             Yes → Karpenter
│             Is simple ASG-based enough?
│             Yes → Cluster Autoscaler
│
└─ [Pod IAM permissions]
       New cluster (EKS 1.24+)? → EKS Pod Identity (simpler)
       Existing cluster / already using IRSA? → Keep IRSA
```

---

## Architecture Diagram: A Complete EKS GitOps Pipeline

```
Full EKS GitOps architecture (DOP-C02 perspective)
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
│   ├─ app-controller (compare desired vs live, run sync) │
│   ├─ argocd-server  (UI/API, RBAC)                      │
│   └─ redis          (state cache)                       │
│                                                         │
│  [prod namespace]                                       │
│   ├─ Deployment (myapp) — ECR pull via IRSA/Pod Identity│
│   ├─ Service (ClusterIP)                                │
│   ├─ Ingress (AWS ALB Controller)                       │
│   └─ HPA (CPU 70%)                                      │
│                                                         │
│  [karpenter namespace]                                  │
│   └─ NodePool (spot + on-demand, c/m/r family)          │
│                                                         │
│  [kyverno]                                              │
│   └─ ClusterPolicy: require-signed-images               │
│                                                         │
│  IRSA/Pod Identity:                                     │
│   SA(myapp) → IAM Role → access S3, DynamoDB, SM        │
└─────────────────────────────────────────────────────────┘
                │
                │ Karpenter: calls EC2 Fleet API directly
                ▼
            EC2 Spot / On-Demand (optimal instance auto-selected)

════════════════════════════════════════════════════════════════
```

---

## Key Concepts Summary Table

| Concept | Key point | Exam pitfall |
|------|------------|----------|
| GitOps | Cluster pulls from Git, no credentials needed on the CI side | Confused with push-based |
| ArgoCD selfHeal | Automatically restores drift to the Git state | Difference between prune and selfHeal |
| Flux image-updater | Automates ECR polling → manifests commit | ArgoCD also has a separate Image Updater |
| Helm --atomic | Automatic rollback on timeout | Be careful using --atomic alone without --wait |
| IRSA | OIDC → Trust Policy → SA annotation | Memorize the Trust Policy Subject format |
| Pod Identity | Simplified IRSA, EKS 1.24+ | No OIDC Provider registration needed |
| Karpenter | Calls the EC2 Fleet API directly, arbitrary instances | Bypassing ASGs = structural difference from CA |
| CodeDeploy + EKS | Not supported | Beware of confusion with ECS |
| PDB | Guarantees a minimum number of Pods during voluntary disruption | Honored by Karpenter, drain, and rollouts alike |

---

## Practice Questions

**Question 1.** A team wants to build an EKS CI/CD pipeline. The security requirement is that "the CI server (CodeBuild) must not hold production cluster credentials." What is the most appropriate architecture?

A) Grant CodeBuild an EKS Admin Role and run kubectl apply  
B) Install ArgoCD in the cluster, and CodeBuild only commits to the manifests repository. ArgoCD polls Git and syncs  
C) Lambda receives the CodeBuild result and calls the Kubernetes API directly  
D) Integrate CodeDeploy with EKS for Blue/Green deployment  

**Answer: B**

This is the core security principle of pull-based GitOps. CodeBuild only needs access to the application code repository and the manifests repository. Write permission to the cluster is held by ArgoCD inside the cluster. There is no exposure of credentials in the outside-to-cluster direction.

Why the other options are wrong: A violates the security requirement. In C, Lambda also ultimately needs cluster credentials. In D, CodeDeploy does not support EKS.

---

**Question 2.** What is the difference between `syncPolicy.automated.selfHeal: true` and `syncPolicy.automated.prune: true` in an ArgoCD Application?

A) selfHeal deletes resources removed from Git from the cluster, and prune restores drift  
B) selfHeal restores manually changed drift in the cluster to the Git state, and prune deletes resources removed from Git from the cluster as well  
C) The two options have the same function  
D) selfHeal recovers from node failures, and prune restarts Pods  

**Answer: B**

`selfHeal` is the feature by which ArgoCD automatically reverts to the Git state when someone modifies the cluster directly with `kubectl edit` or `kubectl patch`. `prune` is the feature that, when a particular manifest file is deleted from the Git repository, also deletes the K8s resources created from that file from the cluster. The two options are independent and must each be enabled.

Why the other options are wrong: A swaps the roles of selfHeal and prune. C: they are entirely different features. D confuses them with Kubernetes' own feature (liveness probe).

---

**Question 3.** Which of the following is NOT a required step when setting up IRSA (IAM Roles for Service Accounts)?

A) Register the EKS cluster's OIDC Provider URL in IAM  
B) Specify the OIDC Provider as the Federated Principal in the IAM Role's Trust Policy  
C) Add the `eks.amazonaws.com/role-arn` annotation to the Kubernetes ServiceAccount  
D) Attach the IAM Role to an EC2 Instance Profile  

**Answer: D**

IRSA does not use an EC2 Instance Profile. The core of IRSA is OIDC federation: EKS issues the ServiceAccount token as a JWT, and the Pod's AWS SDK uses this token to call STS `AssumeRoleWithWebIdentity`. An Instance Profile is a legacy approach that applies to the entire node.

Why the other options are wrong: A, B, and C are all required steps of IRSA. Register the OIDC Provider (A) → set the Trust Policy (B) → add the SA annotation (C) → the Pod automatically performs STS AssumeRole.

---

**Question 4.** What is the most important architectural difference between Karpenter and Cluster Autoscaler (CA)?

A) Karpenter supports only ECS  
B) CA calls the EC2 API directly, and Karpenter adds nodes through an ASG  
C) Karpenter calls the EC2 Fleet API directly to choose, in real time, an instance type that fits the Pending Pods' needs, while CA uses only the instance types of pre-configured ASGs  
D) CA does not support Spot Instances  

**Answer: C**

Karpenter's core innovation is bypassing ASGs. CA must add nodes through an ASG, so it can use only the instance types predefined in the ASG. Karpenter calls the EC2 Fleet API directly, so it chooses in real time, from dozens of instance types, the one that best fits the Pending Pods' requirements. As a result, provisioning is also much faster with Karpenter (minutes vs seconds).

Why the other options are wrong: A: Karpenter is EKS-only. B has the explanation reversed. D: CA also supports Spot ASGs, but in a different way.

---

**Question 5.** In the Helm command `helm upgrade --install --atomic`, what is the effect of the `--atomic` flag?

A) Builds the image atomically  
B) Automatically rolls back to the previous release if the upgrade does not complete within `--timeout`  
C) Bundles multiple Helm releases into a transaction and deploys them at the same time  
D) Pauses other Deployments in the cluster  

**Answer: B**

`--atomic` implicitly includes `--wait`, and if the upgraded Pods do not reach the Ready state within `--timeout` (default 5 minutes), it automatically rolls back to the previous Helm release. It is conceptually the same as the automatic rollback of ECS Blue/Green, but it is implemented with the basic mechanisms of Kubernetes and Helm.

Why the other options are wrong: A is not a Helm concept. In C, Helm does not support transactional deployment. D does not affect other Deployments.

---

**Question 6.** When several Pods are Pending in an EKS cluster, how does Karpenter provision nodes?

A) Adds nodes of the single instance type specified in advance by the administrator  
B) Analyzes the Pending Pods' resource requests, Node Selectors, and Affinity to choose the optimal instance type, and provisions directly through the EC2 Fleet API  
C) Increases the node count by one at a time through an ASG  
D) Runs serverless Pods using a Fargate profile  

**Answer: B**

Karpenter analyzes the Pending Pods in a batch and finds the combination of instance types that can schedule all the Pods on the fewest nodes. This scheduling-aware characteristic is the heart of Karpenter. CA reacts Pod by Pod, but Karpenter optimizes the whole set of Pending Pods together.

Why the other options are wrong: A is how CA behaves. C is CA's gradual ASG-based expansion. D: Fargate is a separate serverless option unrelated to Karpenter.

---

**Question 7.** A team is deploying to EKS through ArgoCD. In an emergency, an operator changed the replica count from 5 to 10 with `kubectl edit deployment myapp`. If `selfHeal: true` is set on the ArgoCD Application, what happens?

A) ArgoCD detects the change and sends an approval request to Slack  
B) ArgoCD detects the drift and automatically restores the replica count of 5 defined in Git  
C) ArgoCD learns the change and automatically updates Git  
D) The change persists until the next regular deployment  

**Answer: B**

`selfHeal: true` is a core GitOps feature of ArgoCD. The application-controller periodically checks the live state (every 3 seconds by default), and if it differs from the Git state, it reverts to the Git state. The operator's `kubectl edit` change is restored automatically as soon as it is detected (within a few seconds at most). This is the concrete implementation of the GitOps principle that "Git is the single source of truth."

Why the other options are wrong: A confuses this with Slack notifications under a manual sync setup. In C, ArgoCD only reads Git and never writes to it (Image Updater is a separate tool). D is the behavior when selfHeal is not set.

---

## Today's Summary

GitOps is a paradigm that Weaveworks introduced in 2017 to solve the drift problem. The core is the shift of the trust boundary: CI writes only as far as Git, and the cluster reads Git on its own and converges itself. ArgoCD implements this principle with 4 components (app-controller, repo-server, api-server, Redis). selfHeal automatically restores drift, and prune removes from the cluster the resources deleted from Git.

Flux v2 is a Composable Toolkit made of 5 independent controllers (source, kustomize, helm, notification, image-automation). The image-automation-controller polls ECR and automatically updates manifests, enabling a fully automated loop.

Helm is a package manager that externalizes per-environment differences with values.yaml and provides automatic rollback on failure with `--atomic`. Kustomize expresses per-environment differences without copying YAML through the base+overlay pattern.

IRSA grants per-Pod IAM permissions in 3 steps: OIDC + Trust Policy + ServiceAccount annotation. EKS Pod Identity provides the same capability more simply, without OIDC registration. Karpenter calls the EC2 Fleet API directly to choose instances optimized for the Pending Pods' needs, bypassing CA's ASG constraint. CodeDeploy does not support EKS, which is a perennial exam pitfall.
