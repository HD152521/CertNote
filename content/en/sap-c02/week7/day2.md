# Day 2 - Inside EKS — Node Groups, IRSA, Karpenter Set the Operations Standard

The first time someone runs `kubectl get nodes` on an EKS cluster, they pause briefly. Where's the control plane? Why did two nodes suddenly appear? Why does each Pod consume an ENI slot? Using managed K8s doesn't make K8s disappear. Only the ugliest operational parts—etcd backups, control plane patches—shift to AWS. SAP exams target this "remainder." How Managed Node Groups auto-drain, which STS API IRSA calls, how Karpenter provisions EC2 without ASG—these appear as one to two questions per domain.

This article dissects EKS' data plane into three layers: **how to launch nodes (node groups), how to grant permissions to Pods (IRSA·Pod Identity), how to auto-adjust node count per demand (Karpenter)**. We layer in how Addons like VPC CNI and EBS CSI enter as managed components. We're watching yesterday's ECS·EKS·Fargate map zoom into EKS' interior.

## Three Node Group Types — Same Cluster, Different Operating Models

One EKS cluster can attach multiple node group types mixed. Three varieties exist, differing by "how far AWS takes responsibility."

```
[EKS Control Plane (AWS managed, $0.10/h)]
              │
              ▼
┌────────────────────────────────────────────────┐
│ Managed Node Group                             │
│  ├─ Launch Template (instance type·AMI·SG)    │
│  ├─ AWS auto-creates and manages ASG          │
│  └─ Node drain, rolling updates automatic     │
├────────────────────────────────────────────────┤
│ Self-Managed Node Group                        │
│  ├─ User directly writes ASG, Launch Template │
│  ├─ AMI patching, draining all user responsibility
│  └─ Custom OS, special kernels, GPU driver pinning possible
├────────────────────────────────────────────────┤
│ Fargate Profile                                │
│  ├─ No nodes (Pod-per-micro-VM)               │
│  ├─ Pod matching via Selector (namespace+label)
│  └─ DaemonSet, HostPath, GPU unsupported      │
└────────────────────────────────────────────────┘
```

**Managed Node Group (MNG)** is the standard. Users specify instance type (t3.medium, m5.xlarge, etc.), AMI type (EKS Optimized AL2023 or Bottlerocket), and desired/min/max count. AWS creates the ASG behind the scenes and automates lifecycle. On node replacement, it automatically calls `kubectl drain` respecting PodDisruptionBudget, rolling updates handled via one command. **Self-Managed Node Group** requires users to implement all that automation directly via ASG and SSM Patch Manager. Use it only when pinning GPU driver versions or using non-standard AMIs like RHEL or Ubuntu Pro.

**Fargate Profile** eliminates nodes entirely. Pods matching namespace + label selector each run in their own Firecracker micro-VM. Operational burden approaches zero, but lack of node concept means DaemonSet (one per node guaranteed) doesn't work, HostPath volumes, GPU, and some EBS dynamic provisioning are restricted. Usually, system Pods like `kube-system` stay on MNG, with business workloads partly shifted to Fargate Profile.

> 💡 **Related Theory**: Managed Node Group's node replacement flow follows **K8s graceful shutdown standard** exactly: ① `Cordon` blocks new Pod scheduling → ② `Drain` sends `SIGTERM` to existing Pods → ③ Execute `preStop` hooks → ④ Wait `terminationGracePeriodSeconds` (default 30s) → ⑤ `SIGKILL`. This flow meets PodDisruptionBudget (PDB) constraints, pausing before moving to the next Pod. AWS' MNG automates all stages, but misconfigured PDB can trap node replacement in an infinite loop.

> 🔍 **Deeper Dive**: EKS Optimized AMI splits two ways: **Amazon Linux 2023 (AL2023)** based and **Bottlerocket** based. Bottlerocket is AWS' minimal container-only OS—no SSH, read-only root filesystem, updates atomic image-wise (A/B partitions). Inspired by ChromeOS and CoreOS, this philosophy views container hosts as "container-only appliances," not "general servers," with a tiny attack surface. Finance and healthcare increasingly adopt it as security regulations tighten.

## IRSA — Refined Temporary Credentials Layered on OIDC

If EKS Pods need to call S3 or DynamoDB, the worst answer is "give permissions to the Node Instance Profile." All Pods on that node share permissions, with infinite blast radius. The 2019 Capital One breach was fundamentally SSRF, accessing the node's metadata endpoint (169.254.169.254) to steal EC2 Instance Profile credentials. K8s safety demands **per-Pod** IAM Role mapping, and AWS' standard for that is **IRSA (IAM Roles for Service Accounts)**.

IRSA's operation is one sentence: **OIDC + STS AssumeRoleWithWebIdentity**.

```
1. EKS cluster creation grants OIDC Provider URL
   (example: oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE)
2. Operators register that OIDC URL as IAM Identity Provider
3. IAM Role Trust Policy:
     "Tokens from this OIDC where sub == system:serviceaccount:ns:sa-name"
4. K8s ServiceAccount annotation:
     eks.amazonaws.com/role-arn: arn:aws:iam::123:role/s3-read
5. When Pod uses that SA, AWS SDK reads Projected ServiceAccount Token
   from /var/run/secrets/eks.amazonaws.com/serviceaccount/token
6. SDK calls STS:AssumeRoleWithWebIdentity → temporary keys issued → calls service
```

Key: step 4's ServiceAccount annotation and step 6's **AssumeRoleWithWebIdentity** API. This API exchanges OAuth 2.0 OIDC tokens for IAM temporary credentials—a standard flow also used in GitHub Actions OIDC auth and GCP Workload Identity Federation. AWS typically sets token TTL to 1 hour, with SDK auto-refresh.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/s3-read
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      serviceAccountName: s3-reader   # ← This single line is IRSA's entirety
      containers:
        - name: app
          image: my/app:1
```

> 💡 **Related Theory**: AssumeRoleWithWebIdentity descends from OAuth 2.0's **Token Exchange** (RFC 8693)—a pattern exchanging single-use tokens from external IdP for internal permission tokens. In K8s, ServiceAccount Token plays the external token role. **Projected ServiceAccount Token**, introduced in K8s 1.21, lets you specify audience and expirationSeconds, so tokens misrouted elsewhere are rejected. This audience validation is IRSA's security cornerstone, identical to OIDC standard `aud` claim validation.

> 🔍 **Deeper Dive**: When IRSA launched (2019), clusters required manual OIDC Provider registration in IAM. 100 clusters meant 100 registrations; each IAM Role's Trust Policy was cluster-specific. **EKS Pod Identity** (2023) skips OIDC—EKS Auth API directly proves Pod identity to STS. Trust Policy trusts a single principal `pods.eks.amazonaws.com`, so the same Role reuses across clusters. Downside: depends on EKS Auth API, so OIDC Federation's standardness and portability favor IRSA. SAP accepts both as "Pod-per-IAM" answers, but if scenarios emphasize "standard OIDC" or "multi-cloud compatibility," IRSA wins; if "multi-EKS role reuse" or "simplified," Pod Identity wins.

| Aspect | IRSA | Pod Identity |
|--------|------|--------------|
| Trust model | OIDC Provider per cluster | EKS Auth API (single principal) |
| Trust Policy writing | Per-cluster | Single policy reused |
| Standard compatibility | OIDC standard (multi-cloud friendly) | EKS-only |
| Token issuance path | sts:AssumeRoleWithWebIdentity | EKS Auth → STS |
| Introduction | 2019 | 2023 |
| Fargate support | Yes | Yes |

> 📚 **Case Study**: 2023, Datadog operated 1,000+ K8s clusters. IRSA's per-cluster OIDC registration became too cumbersome, so they built their own IAM Federation layer. After EKS Pod Identity's announcement, they migrated some clusters and cut operational code by nearly half, per KubeCon 2024. Multi-cluster role reuse is Pod Identity's real value.

## Karpenter — Direct Provisioning Bypassing ASG

Traditional K8s node autoscaling uses **Cluster Autoscaler (CA)**. Pending Pods appear, CA selects a fitting ASG, increments desired count, ASG launches EC2, K8s registers nodes. It works but has two weaknesses. First, ASG instance types are fixed—an m5.large ASG spawns only m5.large nodes. Second, node startup spans ASG → EC2 → cloud-init → K8s join, taking minutes.

**Karpenter** (2021 v0.5, 2023 v1 GA, 2024 1.0) solves both differently.

```
[Pending Pod appears]
      │
[Karpenter Controller analyzes Pod requests, affinity]
      │
      │ Pod requests 4 vCPU, 8GB, spot, zone-a
      ▼
[Selects optimal instance from NodePool, EC2NodeClass candidates]
   - Example: c6i.xlarge spot $0.03/h vs m5.xlarge spot $0.04/h
   - "Large enough, cheapest" rule
      │
      ▼
[EC2 Fleet API direct call] ← Bypasses ASG
      │
[Node boot, K8s join]
      │
[Pod scheduled] — typically 30-60s
      │
[Idle node detected → Consolidation unifies, terminates] ← Continuous cost optimization
```

Core difference: bypasses ASG, and **selects instance types dynamically each time**. Karpenter evaluates EC2 Spot Price, On-Demand Price, and availability zones in real-time, choosing the cheapest fit for that moment. c6i.xlarge Spot was cheapest yesterday; today m6a.xlarge Spot might be. Cluster Autoscaler bound to ASG lacks this flexibility.

**Consolidation** is another strength. Pods decrease, spread across 4 nodes—Karpenter consolidates to 2, cutting costs. Consolidation respects PDB, leaving `do-not-disrupt` annotated Pods untouched. This behavior uses K8s' graceful shutdown standard, applying without code changes.

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
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
```

One NodePool declares "c·m·r series, 4·8·16 vCPU, Spot preferred, consolidate if underutilized." ASG can't express this flexibility.

> 💡 **Related Theory**: Karpenter's instance selection is a **multi-dimensional bin packing** heuristic. Exact optimal is NP-hard, but Karpenter uses a greedy "large enough, cheapest" strategy deciding in tens of ms. Google's Borg cell scheduler paper (EuroSys 2015) uses similar greedy + priority function approaches. Not theoretically optimal, but practically sub-optimal yields enough cost savings.

> 🔍 **Deeper Dive**: Karpenter is a **CNCF Sandbox project**, AWS-led but designed for Azure and GCP compatibility. Azure released Karpenter Provider for Azure GA in 2024; GCP implementation progresses actively. Interesting K8s ecosystem shift—"autoscalers standardize too." SAP exams still feature AWS Provider scenarios only, but adopting Karpenter reduces multi-cloud migration burden.

> 📚 **Case Study**: 2023, Adobe switched some EKS workloads from Cluster Autoscaler to Karpenter, cutting node provisioning time from average 3 minutes to 40 seconds. Spot mixing cut compute costs ~30%; Consolidation auto-reduced nodes 60% during low-traffic nighttime. AWS re:Invent 2023 CON402 presentation.

| Aspect | Cluster Autoscaler | Karpenter |
|--------|---------------------|-----------|
| Node provisioning | Via ASG | EC2 Fleet API direct |
| Instance type | ASG-fixed | Optimal-selected per request |
| Scale-out speed | 1-3 minutes | 30s-1min |
| Spot mixing | ASG direct setting | NodePool capacity-type only |
| Node consolidation | Weak (scale-down only) | Strong (rebalance + consolidate) |
| Multi-instance family | Hard (multiple ASGs) | Single NodePool sufficient |

## VPC CNI and Pod IP Slot Competition

EKS' default networking is **AWS VPC CNI**. Unlike other K8s distributions' Calico or Flannel, it assigns VPC IPs directly to Pods. Advantage: VPC security groups and NACLs apply directly to Pods; routing is identical to EC2. Disadvantage: **Pod IPs consume the node's ENI slots**.

Each EC2 instance type has ENI count limits and per-ENI IP limits. For example, t3.medium supports 3 ENIs × 6 IPs = roughly 17 Pod IPs maximum (minus node itself). m5.large supports ~29. This limit prevents densely packing small instances.

Solution: **Prefix Delegation**. ENIs receive /28 prefixes (16 IPs) instead of single IPs, multiplying per-ENI IPs by 16. t3.medium goes from 17 to 110. Enable with one environment variable; VPC subnet must have sufficient IP slack.

```bash
kubectl set env daemonset aws-node -n kube-system \
  ENABLE_PREFIX_DELEGATION=true
```

Other EKS-specific networking options include **Custom Networking** (allocate Pod IPs from separate subnets, avoiding main subnet exhaustion), **Security Groups for Pods** (assign SGs per-Pod, some instance types only), and **IPv6 mode**.

> ⚠️ **Trap**: SAP's "EKS Pods stop scheduling, nodes have resources" scenario almost always means **Pod IP slot exhaustion**. Surfaces show CPU/memory available, but ENI slots maxed so new Pods can't get IPs. Solutions: ① enable Prefix Delegation, ② larger instances, ③ Custom Networking. Least ops burden: ①.

## EKS Addons — Next Generation Managed K8s Components

K8s is essentially a blank canvas—DNS, networking, storage, load balancers all require external components. EKS provides these as **EKS Addons**, managed form.

| Addon | Role | Alternative |
|-------|------|-------------|
| **VPC CNI** | Pod networking (Pod IP = VPC IP) | Calico, Cilium |
| **CoreDNS** | Cluster internal DNS | Same (CoreDNS standard) |
| **kube-proxy** | Service → Pod IP routing | iptables/ipvs |
| **EBS CSI Driver** | EBS PersistentVolume dynamic provisioning | (Required) |
| **EFS CSI Driver** | EFS mount | FSx for Lustre CSI |
| **AWS Load Balancer Controller** | Ingress → ALB, Service → NLB auto-create | (De facto standard) |
| **EKS Pod Identity Agent** | Pod Identity credential issuance | IRSA |
| **CloudWatch Container Insights** | Metrics, logs integration | Prometheus + Grafana |

EBS CSI Driver became **de facto required** since EKS 1.23 removed in-tree EBS plugin. PVC needing EBS Volume auto-creation/attachment requires CSI Driver Addon installed. Missing during cluster upgrade halts PV creation, collapsing stateful workloads like databases and caches.

```bash
aws eks create-addon \
  --cluster-name prod \
  --addon-name aws-ebs-csi-driver \
  --service-account-role-arn arn:aws:iam::123:role/eks-ebs-csi
```

> 📚 **Case Study**: 2023, a fintech upgraded EKS from 1.22 to 1.23 forgetting EBS CSI Driver Addon installation. Existing Pods ran fine; new StatefulSet deployment caused PVC stuck Pending forever, delaying part of the payment system. AWS' official upgrade checklist states "EBS CSI required 1.23+," but ops team skipped impact assessment. Later, the company mandated ADR (Architecture Decision Record) review for all EKS cluster upgrades.

## EKS Upgrade — One Minor Version at a Time, Nodes ±1

EKS Control Plane upgrades **one minor version at a time only** (1.27 → 1.28; 1.29 as two steps is impossible). Node groups tolerate **±1 minor version difference** from Control Plane. Control Plane 1.28 means nodes must be 1.27·1.28·1.29 (or 1.27·1.28 if 1.29 doesn't exist yet).

Typical upgrade flow:

```
1. Check Addon compatibility versions (VPC CNI, CoreDNS, kube-proxy)
2. Control Plane 1.27 → 1.28
3. Upgrade Addons (to 1.28-compatible versions)
4. Node Groups 1.27 → 1.28 (MNG auto-rolling, Self-Managed manual)
5. Repeat for next minor version
```

K8s releases a new minor version quarterly; security patches usually last ~14 months. EKS supports slightly longer, but typically two to three upgrades per year are needed. Further reducing ops burden: **EKS Auto Mode** (GA 2024), a new model where AWS manages not just control plane but nodes and Addons too.

> 🎯 **Scenario**: "A company operates 50 EKS clusters. Each must upgrade quarterly; ops team is understaffed. They want AWS to handle nodes and Addons. Which option fits?" — **EKS Auto Mode**. Control Plane, nodes, Addons, Karpenter all become AWS-managed; users manage Workload YAML only. Slightly higher per-unit cost, but ROI on 50 cluster ops quickly pays for itself.

## Comparison with Other Managed K8s

Positioning EKS objectively requires comparing GCP's GKE and Azure's AKS.

| Dimension | EKS | GKE | AKS |
|-----------|-----|-----|-----|
| Control Plane cost | $0.10/h | Standard $0.10/h, Autopilot included | Free (Free tier), $0.10/h (Uptime SLA) |
| Auto mode | EKS Auto Mode (2024) | GKE Autopilot (2021) | AKS Automatic (Preview) |
| Auto node provisioning | Karpenter (open source, separate install) | NAP (Node Auto-Provisioning) built-in | AKS Node Auto-Provisioning (Preview) |
| Pod-per-IAM | IRSA, Pod Identity | Workload Identity Federation | Azure AD Workload Identity |
| Latest K8s support | Usually 1-2 quarters behind | Fastest (Rapid Channel) | 1-2 quarters behind |
| Control Plane SLA | 99.95% | 99.5% (Standard), 99.95% (Autopilot) | 99.95% (Uptime SLA) |

GCP's GKE Autopilot led toward "zero ops burden"; AWS caught up with EKS Auto Mode 2024. Azure's basic Free tier is price-friendliest; K8s operational maturity is relatively lower.

> 📚 **Case Study**: 2022, Spotify migrated some workloads from GKE to EKS. Workload Identity Federation to IRSA migration was the largest cost item. Both use OIDC but the sub claim format differs subtly, requiring ServiceAccount manifest annotation rewrites. K8s is standard; cloud integration layers aren't—a consistent lesson.

## EKS Anywhere — Pushing Control Plane On-Premises

Yesterday we touched EKS Anywhere briefly—an option keeping EKS' control plane on-premises. Internally, it uses **EKS Distro (EKS-D)**, AWS' open-source K8s distribution packaging K8s + components (coredns, etcd, kube-proxy, CNI) validated for EKS. Same K8s version guaranteed identical behavior cloud and on-prem.

Deployable on VMware vSphere, Bare Metal, Snow, Nutanix; supports air-gapped (fully isolated) environments. Downside: users handle all operations (control plane upgrade, etcd backup). Only meaningful for "gateways across 100 factories," "defense/finance isolated environments." General workloads always favor EKS (cloud) simpler.

## Summary

Today we dissected EKS' data plane into three parts: **node groups** position where Pods run, **IRSA and Pod Identity** safely grant Pod-per-IAM, **Karpenter** dynamically adjusts node count and type. We standard: **VPC CNI Prefix Delegation** multiplies IP slots, **EBS CSI Addon** handles persistent volumes.

Tomorrow we examine Fargate's billing structure and cost optimization. Across ECS and EKS, Fargate's true per-unit cost, how Compute Savings Plans mix with Graviton and Spot to run the same workload at half price.

---

## 📝 연습 문제

**문제 1.** EKS Pod이 S3에 접근해야 한다. 운영팀은 Pod별 최소 권한을 표준으로 유지하면서 클러스터를 30개 이상 운영한다. 같은 IAM Role을 여러 클러스터에서 재사용하기 쉬운 방법은?

A) EC2 Instance Profile에 S3 권한 부여
B) IRSA (IAM Roles for Service Accounts)
C) EKS Pod Identity
D) Secrets Manager로 액세스 키 주입

**정답: C**
EKS Pods need S3 access. The ops team maintains Pod-per-IAM as standard while operating 30+ clusters. Easiest method to reuse the same IAM Role across clusters?

Two keywords to decompose: "Pod-per-IAM" satisfies both IRSA and Pod Identity, but "reuse Role across multiple clusters" is decisive. IRSA requires per-cluster OIDC Provider registration in IAM and per-cluster Trust Policy. Pod Identity trusts single principal (`pods.eks.amazonaws.com`) so identical Roles reuse across all clusters. A violates least privilege (all Pods share permissions). D carries key rotation and exposure risks. Advanced learning: if "standard OIDC compliance" or "multi-cloud friendly" are emphasized, IRSA becomes the answer.

---

**문제 2.** 가변 트래픽을 처리하는 EKS 클러스터에서 다음 요구를 모두 만족해야 한다. ① 스케일아웃이 1분 안에 완료 ② Pod requests를 보고 인스턴스 타입을 매번 최적 선택 ③ Spot 혼합 자동 처리 ④ 노드 활용률이 낮을 때 자동 통합. 어떤 도구가 적합한가?

A) Cluster Autoscaler + ASG
B) Horizontal Pod Autoscaler만
C) Karpenter
D) EKS Managed Node Group + Spot Allocation

**정답: C**
An EKS cluster handling variable traffic must satisfy all: ① scale-out within 1min ② dynamically select instance type per Pod requests ③ auto-handle Spot mixing ④ auto-consolidate underutilized nodes. Which tool?

Karpenter alone satisfies all four. CA bounds to ASG with fixed instance types, scale-out taking minutes. HPA adjusts Pod count, not node provisioning—different layer. MNG + Spot lacks Karpenter's consolidation and rebalancing. Trap: "Isn't Karpenter EKS-only?" No—CNCF Sandbox project works on Azure/GCP, but SAP exams cover EKS Provider scenarios only. Bonus: Karpenter Consolidation respects PDB, safe to apply.

---

**문제 3.** EKS 노드의 CPU·메모리는 충분한데 새 Pod이 더 이상 스케줄링되지 않는다. 노드 자원이 아니라 다른 한계에 걸린 것 같다. 가장 운영 부담 적은 해결책은?

A) 더 큰 인스턴스로 노드 그룹 교체
B) VPC CNI에 Prefix Delegation 활성화
C) Calico CNI로 교체
D) Custom Networking 구성

**정답: B**
EKS nodes have ample CPU/memory, but new Pods stop scheduling. Resource isn't the limit. Least ops burden solution?

Symptom is clear: AWS VPC CNI assigns VPC IPs directly to Pods, limited by each instance's ENI slot count (t3.medium ~17). Prefix Delegation assigns /28 prefixes (16 IPs) per ENI, multiplying slots 16×, e.g., t3.medium 17 → 110. Environment variable single-line change (`ENABLE_PREFIX_DELEGATION=true`) applies. A is possible but requires node replacement and cost increase. C is CNI swap causing large operational change; VPC SG/routing integration may break. D demands separate subnet/routing design. Bonus: Confirm VPC subnet has available IP space before applying Prefix Delegation.

---

**문제 4.** EKS Fargate Profile에서 다음 중 **사용 가능한** 것은?

A) DaemonSet
B) HostPath 볼륨
C) GPU 워크로드
D) IRSA를 통한 Pod별 IAM Role

**정답: D**
Which is **available** in EKS Fargate Profile?

Fargate Profile lacks node concept (micro-VM based), so A (node-guaranteed DaemonSet), B (node HostPath), C (GPU instances) all unsupported. IRSA is K8s ServiceAccount → IAM Role mapping, independent of node presence, so works identically on Fargate Profiles. Bonus: Fargate Pods use Pod Identity Agent the same way. Trap: Don't pick "Fargate means no IAM" as a wrong answer.

---

**문제 5.** EKS 1.22에서 1.24로 업그레이드하려 한다. 가장 정확한 절차는?

A) Control Plane을 1.22 → 1.24로 한 번에 올림
B) 노드 그룹을 먼저 1.24로 올린 뒤 Control Plane 업그레이드
C) Control Plane을 1.22 → 1.23 → 1.24로 한 단계씩, 각 단계마다 노드 그룹과 Addon 호환 확인
D) 새 1.24 클러스터를 만들고 워크로드를 마이그레이션

**정답: C**
Upgrading EKS from 1.22 to 1.24. Most accurate procedure?

EKS upgrades one minor version at a time only; node groups tolerate Control Plane ±1 minor difference. A is API-rejected. B risks node ahead of Control Plane, breaking compatibility. D is possible but incurs ops burden, downtime, and SAP exams favor less burdensome standard procedures. Bonus: Each stage requires VPC CNI, CoreDNS, kube-proxy compatible version upgrade. EBS CSI Driver is de facto required 1.23+.

---

**문제 6.** 한 회사가 EKS 클러스터 50개를 운영하는데 각 클러스터를 분기마다 업그레이드하기 어렵다. 컨트롤 플레인뿐 아니라 노드·Addon 운영도 AWS에 맡기는 가장 새로운 옵션은?

A) EKS + Karpenter + IRSA
B) EKS Auto Mode
C) ECS Fargate로 전환
D) EKS Anywhere

**정답: B**
A company operates 50 EKS clusters, quarterly upgrades difficult. Wants AWS to handle not just control plane but nodes and Addons. Newest option?

**EKS Auto Mode** (GA 2024) manages Control Plane, node groups, Karpenter, core Addons—users manage Workload YAML only. A requires users operating Karpenter and Addons. C abandons K8s standard. D reverses direction, taking control plane on-premises. Bonus: Auto Mode costs slightly more, but 50-cluster ops payback happens fast.

---

**문제 7.** EKS Pod이 ECR에서 이미지 Pull은 잘 되는데, 애플리케이션 코드가 DynamoDB 호출 시 AccessDenied. 원인은?

A) Node Instance Profile에 ECR 권한이 없음
B) ServiceAccount에 매핑된 IAM Role에 DynamoDB 권한이 없음
C) VPC Endpoint 미설정
D) 보안 그룹에서 443 차단

**정답: B**
EKS Pod pulls ECR images successfully, but application code calling DynamoDB gets AccessDenied. Root cause?

Image pulls route through the node's kubelet calling ECR using Node Instance Profile—successful, so no issue there. Application code AWS API calls use **IRSA-mapped IAM Role**. Missing DynamoDB permission on ServiceAccount's mapped IAM Role. A is contradicted by successful image pull. C is latency/cost optimization, irrelevant to permissions. D would cause timeout, not AccessDenied. Bonus: same pattern appears in EKS as IRSA vs. Node Instance Profile as ECS Task Role vs. Execution Role.

---

## 📌 오늘의 요약

1. **Node group 3 types**: Managed (standard, auto) / Self-Managed (custom AMI, drivers) / Fargate Profile (no nodes)
2. **IRSA = OIDC + AssumeRoleWithWebIdentity**, **Pod Identity = EKS Auth simplified**, Pod Identity superior for multi-cluster role reuse
3. **Karpenter = ASG-bypassing + dynamic optimal instance + Consolidation**, fixes all Cluster Autoscaler weaknesses
4. **VPC CNI Prefix Delegation** multiplies Pod IP slots 16×, ENI slot exhaustion is SAP's favorite trap
5. **EBS CSI Driver Addon** de facto required EKS 1.23+, missing during upgrade leaves PVC Pending
6. **EKS Auto Mode** (2024) manages control plane, nodes, Addons entirely—multi-cluster ops breaks even fast
7. **EKS Anywhere = EKS-D based**, control plane on-premises, air-gapped support
