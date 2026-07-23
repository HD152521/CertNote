# Day 5 - Week 7 Synthesis — Container Scenario Practice 12 Questions

Week covered nearly every building block: ECS, EKS, Fargate, Karpenter, IRSA, Service Connect. Now see how SAP actually combines these. Container exam output isn't single-service knowledge but **block combinations**. "Multi-account + EKS + cost + hybrid" lands simultaneously in one question; keyword-matching fails halfway. How domains 1 (org, reliability), 2 (architecture, resilience), 3 (security, cost) branch atop container foundation—that's the key.

This article strengthens the week via 12 scenarios. Each requires **branching judgments**, not fact retrieval. SAP's hallmark: change one sentence, answer shifts to different option. This post highlights those branches. Closes with Week 7 entire mapping one-pager.

## Week 7 at a Glance — Decision Tree

```
Q1. Container workload start
     │
     ├─ Zero-ops paramount?
     │     └─ Yes → App Runner
     │     └─ No  → Next
     │
     ├─ K8s standard, multi-cloud portability?
     │     └─ Yes → EKS
     │     └─ No  → ECS
     │
     ▼
Q2. Data plane choice
     │
     ├─ Minimum ops burden? → Fargate
     ├─ Bin packing, high-density? → EC2 Launch Type
     └─ On-prem? → Anywhere

Q3. Node auto-scaling (EKS)
     ├─ Fast scale, bin-pack, Spot auto? → Karpenter
     └─ ASG-based simple? → Cluster Autoscaler

Q4. Pod-per-IAM
     ├─ Multi-cluster role reuse? → Pod Identity
     ├─ OIDC standard compatible? → IRSA
     └─ Single node permission OK? → Instance Profile (anti-pattern)

Q5. Cost optimization
     ├─ 24/7 steady load → EC2 + Compute SP
     ├─ Variable + zero ops → Fargate Spot + Compute SP
     ├─ Short, frequent → Lambda
     └─ ARM compatible → Graviton +20% savings

Q6. Inter-service comms
     ├─ Full mesh (mTLS, canary) → App Mesh
     ├─ ECS lightweight mesh → Service Connect
     └─ Discovery only → Cloud Map
```

Visualize this tree, then check where your answers branch during 12 questions.

## 12 Scenario Questions

---

**문제 1.** A global fintech deploys identical K8s workloads across AWS, GCP, on-premises. AWS must minimize control plane ops (etcd backup, upgrades); identical manifests must work across environments. Most fitting combo?

A) ECS Fargate + Capacity Provider
B) EKS + Managed Node Group (or EKS Auto Mode)
C) App Runner + GitHub auto-deploy
D) ECS Anywhere

**정답: B**
Decompose two keywords: "K8s standard + multi-cloud portability" = EKS (K8s API). "Minimize control plane ops" = AWS-managed control plane = EKS. A/D: AWS-proprietary APIs break portability. C: PaaS, no K8s manifest compatibility. Branching: same scenario "AWS-only ops, minimize burden" → ECS Fargate answers. Bonus: further reduce ops via EKS Auto Mode (2024).

---

**문제 2.** Company operates 30 EKS clusters. Pods access S3, DynamoDB with per-Pod least privilege. Easiest way to reuse identical IAM Role across all clusters?

A) EC2 Instance Profile permissions
B) IRSA (IAM Roles for Service Accounts)
C) EKS Pod Identity
D) Pod environment variables with Access Key

**정답: C**
"Pod-per-IAM" satisfies both IRSA and Pod Identity; "multi-cluster role reuse" is decisive branch. IRSA: per-cluster OIDC registration, per-cluster Trust Policy. Pod Identity: single principal (`pods.eks.amazonaws.com`), identical Role reused all clusters. A: all Pods on node share permissions, violates least privilege. D: key exposure risk. Branching: "OIDC standard compliant, multi-cloud friendly" emphasized → IRSA answers.

---

**문제 3.** EKS cluster with variable traffic. Must satisfy all: ① scale-out <1min ② dynamically select instance type per Pod requests ③ auto-handle Spot ④ auto-consolidate underutilized nodes. Which tool?

A) Cluster Autoscaler + ASG
B) Horizontal Pod Autoscaler only
C) Karpenter
D) EKS Managed Node Group + Spot

**정답: C**
Karpenter alone satisfies all four. Bypasses ASG, EC2 Fleet API direct provisioning, NodePool lists diverse instance candidates, capacity-type spot/on-demand both allowed, Consolidation unifies nodes. CA bound to ASG—fixed instance types, weak consolidation. HPA adjusts Pod count, different layer from nodes. MNG ASG-based, lacks Karpenter unification/rebalancing. Branching: "ASG-based simple patterns only" → CA answers.

---

**문제 4.** ECS Fargate back-office API. 5 Tasks average, spikes to 30 during campaigns. 1-year commitment possible, some Task reclamation tolerable. Cost-optimal config?

A) FARGATE On-Demand 100% + EC2 Instance SP
B) FARGATE_SPOT 100%
C) Compute SP 5-Task commitment + Capacity Provider (base=2 FARGATE + FARGATE_SPOT 80%)
D) EC2 Launch Type + Reserved Instance

**정답: C**
Two traffic profiles (steady 5-baseline + variable spike) matched two discount levers: SP anchors baseline, Spot handles variable. base=2 ensures minimum availability on Spot reclamation. A: EC2 Instance SP doesn't apply to Fargate. B: all Spot risks simultaneous reclamation outage. D: EC2 RI inefficient against spike variability. Trap: Spot and SP can't coexist—false. Different resources, naturally coexist.

---

**문제 5.** Media startup wants single-line code push → auto-build, deploy, HTTPS endpoint, zero ops burden. No sidecars, service mesh, advanced VPC integration needed. Which service?

A) ECS Fargate + ALB
B) EKS + ArgoCD
C) App Runner
D) Elastic Beanstalk

**정답: C**
App Runner: point to GitHub or ECR, build/deploy/domain/auto-scaling bundled PaaS. A: bigger ops burden (ALB, TG, Service Definition). B: K8s + GitOps huge ops. D: EC2-based, heavier. Trap: "ECS Fargate cheaper?" Yes, but App Runner trades per-unit cost for ops reduction; simple single backend favors App Runner's breakeven.

---

**문제 6.** Fintech runs 30 ECS Fargate microservices. Must satisfy all: ① all comms mTLS ② canary new versions 5% traffic ③ per-service circuit breaker. Most fitting combo?

A) ALB Weighted Target Group + ACM Public Cert
B) AWS App Mesh + ACM Private CA
C) Cloud Map only
D) Route 53 Weighted Routing

**정답: B**
Three full-mesh features (mTLS, weighted canary, circuit breaker) = App Mesh domain. ACM Private CA short-lived auto-rotation, Virtual Router 5% weighting, Virtual Node circuit breaker. A: ACM Public external-domain, ALB lacks circuit breaker. C: discovery only, no mesh features. D: DNS-level weighting—1% granularity, no circuit breaker. Operations: App Mesh EOL (2026.9) → new adoption standard Istio; SAP asks era-correct.

---

**문제 7.** ECS Cluster inter-microservice: ① auto-discovery ② auto Envoy sidecar ③ auto CloudWatch metrics ④ minimum ops. Weighted canary unnecessary. Which service?

A) App Mesh
B) ECS Service Connect
C) Cloud Map + manual client LB
D) ALB per Service

**정답: B**
Service Connect: single ECS Service block enables Envoy auto-inject, Cloud Map auto-register, retries, metrics standard. A: full mesh bigger ops. C: all manual. D: 30 services = 30 ALBs, cost and ops burden high. Branching: weighted canary, mTLS, circuit breaker needed → App Mesh answers.

---

**문제 8.** Manufacturer operates 100 factory gateways. Some internet-down for days. Control plane must operate autonomously inside factory. Most fitting service?

A) ECS Anywhere
B) EKS Anywhere
C) AWS Outposts
D) Snowball Edge

**정답: B**
"Internet-down, control plane autonomous" = control plane on-prem. EKS Anywhere (EKS-D based) exactly that model. A: control plane AWS cloud—internet loss halts deployments/scaling. C: AWS hardware customer facility, control plane calls still need region. D: data transfer device, irrelevant. Branching: "on-prem use ECS-like tools" → ECS Anywhere (control plane AWS).

---

**문제 9.** EKS 1.22 → 1.24 upgrade. Most accurate procedure?

A) Control Plane 1.22 → 1.24 one step
B) Node groups first to 1.24, then Control Plane
C) Control Plane 1.22 → 1.23 → 1.24 step-wise, each stage check node/Addon compatibility, install EBS CSI Driver Addon (1.23+ mandatory)
D) New 1.24 cluster, migrate workloads

**정답: C**
EKS one minor version at a time; node groups tolerate Control Plane ±1 minor. A: EKS API rejected. B: nodes ahead of Control Plane breaks compatibility. D: possible but ops burden, downtime high. Trap: 1.23 removed in-tree EBS plugin—EBS CSI Driver Addon de facto required. Miss it → PVC Pending forever. Fintech case: payment system delays.

---

**문제 10.** EKS Pod CPU·memory sufficient; new Pods stop scheduling. Limit beyond node resources. Minimum-ops solution?

A) Replace node group with larger instances
B) Enable VPC CNI Prefix Delegation
C) Switch to Calico CNI
D) Configure Custom Networking

**정답: B**
Symptom: ENI slot exhaustion. AWS VPC CNI assigns VPC IPs directly; instance ENI limits (t3.medium ~17). Prefix Delegation assigns /28 (16 IPs) per ENI, multiplies slots 16×. Single environment variable (`ENABLE_PREFIX_DELEGATION=true`) applies. A: possible but node replacement, cost increase. C: CNI swap breaks VPC SG, routing integration. D: needs separate subnet, routing design. Branching: VPC subnet IP exhaustion → Custom Networking answers.

---

**문제 11.** SaaS ML inference workload: 100ms average, 50k/hour calls, 3GB memory. Most cost-efficient compute?

A) Lambda
B) Fargate On-Demand
C) Fargate Spot
D) EC2 + Reserved Instance

**정답: A**
Lambda's 1ms billing dominates short, frequent calls. 100ms × 50k = 5,000s/hour = ~1.4hours billed time. Fargate (B/C): 1-minute floor + Task overhead while idle = higher. EC2 (D): 1 instance × 24h always-on = most expensive. Trap: 3GB within Lambda 10GB limit. Exceed or cold-start sensitive → Fargate wins. Bonus: Lambda Provisioned Concurrency nearly eliminates cold-start.

---

**문제 12.** Company simultaneously operates EC2 and Fargate, planning EC2-to-Fargate migration. Needs 1-year commitment discount applying both, commitment persists during migration. Which commitment?

A) EC2 Instance Savings Plans
B) Compute Savings Plans
C) Standard Reserved Instance
D) Convertible Reserved Instance

**정답: B**
Only Compute SP applies across EC2 + Fargate + Lambda, auto-tracks through migration. A: EC2 Instance SP (family, region fixed) excludes Fargate. C/D: RI EC2-only. Bonus: Compute SP discount (~66%) slightly lower than EC2 Instance SP (~72%) but flexibility premium. SP auto-applies, needs no instance specification. Trap: simple price-list-only view chooses EC2 Instance SP—wrong, excludes Fargate.

---

## SAP-Specific Perspective — Multi-Account, Multi-Region, 7R, WA 6 Pillar Container Mapping

Container exam isn't just "which service" but **combined with SAP-specific views**. Same EKS/ECS scenario has multi-account, multi-region, 7R migration, Well-Architected 6 Pillar layered; keyword-matching alone fails.

### Multi-Account — Organizations, SCP, Control Tower Atop Containers

Enterprises operate EKS/ECS clusters **per-account**: dev/staging/prod separate, data-team/billing-team separate. How to share ECR images, cross-account IAM Roles—SAP's canonical scenario.

**Three core patterns**:

1. **ECR Cross-Account Pull**: Central "shared-services" account ECR holds all images; other accounts' ECS Task Execution Role or EKS Node Role cross-account pull. ECR Repository Policy grants other account principals.
2. **IRSA Cross-Account**: EKS Cluster in account A, S3 bucket in B. IRSA-mapped IAM Role chains sts:AssumeRole to B's Role.
3. **SCP Enforces Container Policy**: Organizations SCP mandates across all accounts "EKS clusters disable IAM Roles Anywhere," "ECS Task Definition only awslogs driver allowed" guardrails.

> 🎯 **Scenario**: "Enterprise on Control Tower runs 30 accounts. dev/staging/prod each have EKS cluster; container images built/pushed only from central account. Ops team prevents all accounts' EKS Pods from direct external registry pulls. Fitting combo?" — **Central account ECR + Repository Policy grant cross-account pull + SCP block external registries + VPC Endpoint (ECR, S3) per-account**. SCP enforces IAM deny guardrails; VPC Endpoint ensures traffic flows AWS-internal only.

### Multi-Region — Active/Active vs. Active/Passive Container Architecture

Container Multi-Region patterns split two ways:

| Pattern | Structure | Fits |
|---------|-----------|------|
| **Active/Active** | Identical ECS/EKS clusters both regions, Route 53 Latency-based Routing | Global users, low latency |
| **Active/Passive** | One region ops, other Pilot Light or Warm Standby | DR, low RTO/RPO |

**ECR Cross-Region Replication** underpins both. Push to one region, auto-replicate to other ECR; DR region immediately uses images. **EKS lacks native cross-region replication**, so Workload manifests sync via GitOps (ArgoCD, Flux) across regions.

Data layer hardest: **DynamoDB Global Tables** (sync multi-region), **Aurora Global Database** (<1s async lag), **S3 Cross-Region Replication** (async)—choose per workload consistency.

> 📚 **Case Study**: December 2021 us-east-1 outage, Multi-Region Active/Active companies (Netflix, Stripe subset) auto-failed over to us-west-2, minimizing impact. Single-region ECS only: 4-9 hour downtime. SAP emphasizes "5-minute RTO even single-region failure" → Active/Active + Route 53 Health Check standard.

> 🔍 **Deeper Dive**: Multi-region container cost non-negligible. Two regions = ~2× infrastructure cost. Reduce via **Pilot Light** (DB, minimal standby infra) or **Warm Standby** (smaller scale). RTO/RPO allowing minute-scale → Pilot Light cost-efficient; second-scale RTO → Active/Active.

### 7R Migration Strategy: Container's Position

AWS' 7R framework:

| R | Meaning | Container Match |
|---|---------|-----------------|
| **Retire** | Decommission | - |
| **Retain** | Keep as-is | - |
| **Rehost** | Lift & Shift (unchanged move) | EC2 unchanged move |
| **Relocate** | VMware → AWS VMC | - |
| **Repurchase** | Replace SaaS | - |
| **Replatform** | Minor mods before move | **Containerize (Docker)** |
| **Refactor** | Redesign architecture | **Microservices + ECS/EKS** |

Containers core to Replatform and Refactor. Wrap monolithic .war Tomcat in container → ECS = Replatform. Split monolith to 30 microservices, EKS = Refactor.

> 🎯 **Scenario**: "Enterprise migrates on-prem Java monolith (.war + Tomcat) to AWS. Minimize code changes, reduce ops burden. Which 7R strategy and service combo?" — **Replatform + ECS Fargate**. Dockerfile wraps Tomcat + .war, ECS Fargate runs it. EC2 Rehost keeps ops burden; EKS Refactor huge code changes.

> ⚠️ **Trap**: "Lift & Shift = ECS Fargate" is wrong-answer pattern. Containerization is Replatform, not Lift & Shift. Lift & Shift unchanged; containerization needs Dockerfile, image build changes minimum.

### Well-Architected 6 Pillar Container Decision Mapping

| Pillar | Container Decision |
|--------|-------------------|
| **Operational Excellence** | App Runner, Fargate, EKS Auto Mode minimize ops; ECS Exec SSH-less debug |
| **Security** | IRSA, Pod Identity per-Pod least privilege; ACM Private CA + App Mesh mTLS; ECR Image Scanning |
| **Reliability** | Multi-AZ spread, ALB Health Check, Multi-Region Active/Active, PodDisruptionBudget |
| **Performance Efficiency** | Karpenter auto-selects fit instances; Graviton, Inferentia pick right compute |
| **Cost Optimization** | Fargate Spot, Compute SP, Bin Packing combo; monitor utilization |
| **Sustainability** | Graviton (+20% power efficiency), improve utilization reduce idle, ARM migration |

> 💡 **Related Theory**: WA 6 Pillar is tradeoff framework; one decision affects multiple. E.g., Karpenter Spot 100% maximizes cost (⭐⭐⭐) but reliability drops (⭐). SAP says "cost AND reliability both" → base=2 + Spot 80% balanced config answers. Single-Pillar max is rarely right.

## Week 7 Comparison Matrix — When Two Services Confuse

| A | B | Decision Criteria (Which?) |
|---|---|---------------------------|
| **ECS** vs **EKS** | "K8s standard, multi-cloud portable" → EKS; "AWS-focused, simple" → ECS |
| **Fargate** vs **EC2 Launch Type** | "Zero ops, variable" → Fargate; "high-density, 24/7" → EC2 + SP |
| **Cluster Autoscaler** vs **Karpenter** | "ASG simple" → CA; "fast, consolidate, Spot auto" → Karpenter |
| **IRSA** vs **Pod Identity** | "OIDC standard, multi-cloud" → IRSA; "multi-cluster reuse" → Pod Identity |
| **Cloud Map** vs **Service Connect** | "Discovery only" → Cloud Map; "ECS + Envoy, metrics" → Service Connect |
| **Service Connect** vs **App Mesh** | "Lightweight" → Service Connect; "mTLS, canary, circuit-breaker" → App Mesh |
| **App Runner** vs **ECS Fargate** | "PaaS, zero ops" → App Runner; "fine control, mesh" → ECS Fargate |
| **ECS Anywhere** vs **EKS Anywhere** | "Control plane AWS" → ECS Anywhere; "control plane on-prem, air-gapped" → EKS Anywhere |
| **EC2 Instance SP** vs **Compute SP** | "Max discount, EC2 only" → EC2 SP; "flexibility, multi-service" → Compute SP |
| **Lambda** vs **Fargate** | "<5min short/frequent" → Lambda; "minutes-hours variable" → Fargate |

## Week 7 At-a-Glance Summary

```
Orchestration   ──► ECS (AWS proprietary) / EKS (K8s standard) / App Runner (PaaS)
Data plane      ──► EC2 Launch / Fargate / Fargate Spot / Anywhere
Scaler          ──► HPA (Pod) / Karpenter (Node, recommended) / Cluster Autoscaler
Pod-per-IAM     ──► IRSA (OIDC) / Pod Identity (multi-cluster)
Discovery·Mesh  ──► Cloud Map (registry) / Service Connect (ECS) / App Mesh (full)
Hybrid          ──► ECS Anywhere (control AWS) / EKS Anywhere (control on-prem) / Outposts
Cost-cut levers ──► Fargate Spot (-70%) + Compute SP (-66%) + Graviton (-20%)
Upgrade         ──► EKS one minor at a time, nodes ±1, EBS CSI 1.23+ mandatory
```

## Next Week Preview

Week 8 advances **serverless**. Lambda advanced (layers, extensions, Provisioned Concurrency), Step Functions (workflow orchestration), EventBridge (event routing), DLQ, retry strategies, event-driven microservice architecture. Today's Lambda vs. Fargate vs. EC2 branching becomes Week 8's starting point. What happens one level higher (or lighter) than ECS/EKS—that's next week.

Week solidified every container building block. If exam shows 4 options and you instantly eliminate one or two, you've won. Remaining answers narrow via keyword decomposition—the skill translating to next mock exam and real test scores.

---

## 📌 오늘의 요약

1. **SAP 컨테이너 = 블록 조합**, 멀티 계정·Multi-Region·7R·WA 6 Pillar와 결합
2. **12 시나리오**로 한 주 굳히기: 분기 판단 능력이 핵심
3. **결정 트리**: 키워드 분해로 답 후보 좁히기
4. **멀티 계정**: ECR Cross-Account Pull + SCP Guardrail + VPC Endpoint
5. **Multi-Region**: Active/Active (Route 53) vs Pilot Light (비용), ECR Cross-Region + GitOps
6. **7R**: Replatform = Docker + Fargate, Refactor = Microservices + EKS
7. **WA 6 Pillar**: 트레이드오프 프레임워크, 한 Pillar만 최대는 오답
