# Day 3 - Large-Scale ECS/EKS Operations: Scheduling, GitOps, Cost Principles for 100+ Microservices

When container platforms grow from a dozen services to over a hundred, operational weight shifts. No longer "how do we run a container?" but "how do we consistently, cheaply, safely run hundreds?" Three pains strike simultaneously. **Scheduling** (when traffic surges, how fast and what instance type do we spin?), **drift** (who deployed what and does actual state match intent?), **cost** (peak-capacity nodes sit idle at night). Today: realistic org with 100+ microservices, 100k peak RPS, Seoul·Tokyo Active-Active, "20% cost cut YoY" pressure. Karpenter·GitOps·Pod Identity·Container Insights·Graviton/Spot solve all three, grounded in scheduling theory and declarative-system thinking.

In DOP exams: "spin diverse instances in seconds not minutes", "rollback manifest with one git revert", "give pod IAM without OIDC setup", "cut container costs 30-40%." Each hinges on Karpenter·GitOps·Pod Identity·Graviton/Spot understanding.

## ECS Fargate vs EKS — Choosing Abstraction Level

Platform choice is fundamentally "how much operational burden to AWS, how much control to keep?" trade-off.

| Workload trait | Choice | Why |
|---|---|---|
| Simple web/batch, minimal ops | **ECS Fargate** | Node-free, serverless containers |
| Custom scheduler, rich Service Mesh, ecosystem | **EKS** | Kubernetes standard, strong control |
| Cost-sensitive large long-running | **EKS + Karpenter + Spot** | Fine-grained node cost optimization |
| Very short jobs | **Lambda or Fargate** | Per-invocation billing, zero idle cost |

This org uses hybrid — meticulous control for billing (EKS), simple general (70%) on Fargate.

> 💡 **Related theory**: This choice is **cost of abstraction.** Fargate abstracts nodes, eliminating operational burden, but forfeits node-level optimization (instance pick, Spot fine control, kernel tuning). EKS hands all control, but levies ops tax (control plane upgrade, CNI, addons, node mgmt). "Abstraction costs — trade control for convenience." Mature orgs vary abstraction by workload: critical few get low abstraction (EKS+node control), many others get high (Fargate). One-tool-fits-all is anti-pattern.

## Karpenter — Rethinking Scheduling

EKS's classic **Cluster Autoscaler (CA)** relies on ASG. Pods pending? CA bumps ASG desired capacity; ASG spins pre-defined instance types. Problems: (1) ASG middle layer = slow (minutes), (2) instance type locked in ASG = inflexible.

**Karpenter** (AWS open-source 2021) flips this. **Bypass ASG; examine pending pods' real resource needs; call EC2 API directly to spin nodes.** Real-time bin-packing (which instance mix fits and cheapest), dynamic mix of On-Demand·Spot·Graviton.

| Trait | Cluster Autoscaler | Karpenter |
|---|---|---|
| Node group | ASG required | EC2 direct, no ASG |
| Speed | Minutes | Seconds |
| Instance choice | Pre-fixed (ASG) | Dynamic (pod-need based) |
| Spot handling | Possible | More flexible (interruptibility) |
| Empty node cleanup | Slow | Aggressive consolidation |

> 🔍 **Deeper**: Karpenter's core is **bin-packing optimization.** Classic CS NP-hard — "pack varied-size objects into min bins." Karpenter watches pending pods' CPU/memory/GPU, solves "what instance combo best fits and cheapest?" as a heuristic. **Consolidation** further: as time passes, defragment scattered nodes — if pod-set on two half-full nodes fits one, consolidate and kill the empty node (memory compaction analogy). CA is scalar control (resize ASG up/down); Karpenter is combinatorial (which node types, how many, where). Exam: "fast scale + varied instances + Spot flex" → Karpenter.

Combined with **Pod Disruption Budget** (limit concurrent pod kills) and **Topology Spread Constraints** (spread pods evenly across AZs/nodes) for resilience during Spot interruptions.

## GitOps — Cluster State = Git Single Truth

100 services deploying via `kubectl apply` loses change history and drifts goal state. **GitOps** inverts this: **Git repo is cluster goal state single truth.** Agent (Argo CD/Flux) continuously reconciles cluster to that state.

```
GitHub (App Repo)            GitHub (Manifests Repo)
      │                              │
      │ CodePipeline/Actions         │ Argo CD watch + reconcile
      ▼                              ▼
  Build → Image to ECR ─► Manifest Image Tag bump ─► EKS auto-reflect
```

Core: **build ≠ deploy.** App build (CodePipeline/Actions) → image to ECR. Deployment is separate manifest repo; Argo reconciles. Rollback: **one `git revert`** — manifest back to prior commit, Argo auto-reverts cluster.

> 💡 **Related theory**: GitOps applies **closed-loop control (feedback control)** from control theory to deployment. Kubernetes core is reconciliation loop — "observe state, desired state, compute error, apply actions to converge error to zero." GitOps pulls desired state source up to Git. This is **declarative vs imperative** essence. Imperative ("kubectl apply", manual scripts) is humans managing procedure. Declarative ("this is what it should be") is system managing convergence. Result: (1) Git is audit log (who, when, what via PR), (2) drift auto-corrects (Argo reverts manual changes), (3) rollback is `git revert`.

## ECS Fargate Deployment — Blue/Green + IaC

ECS Fargate's 70% uses different orchestration. Traffic shift is **CodeDeploy Blue/Green + ALB Listener** — new Task set (Green), ALB gradually shifts traffic, once safe, tear down Blue. Task Definition is CDK IaC'd, parameterized per environment; inter-service talk via App Mesh or lighter **ECS Service Connect**.

> ⚠️ **Gotcha**: ECS deployment controller types confuse easily. Default is **Rolling Update (ECS native)** — incrementally replace old Tasks. Simple but weak rollback and traffic shift. **Blue/Green is CodeDeploy controller** (`deployment-controller type=CODE_DEPLOY`), needs ALB's two Target Groups (Blue/Green) and Listener. Exam: "ECS Canary/Linear shift + fast rollback" → CodeDeploy Blue/Green, not Rolling.

## Pod Identity — IRSA's Successor Standard

EKS pods calling AWS APIs (e.g., billing pod → DynamoDB) need pod-level IAM credentials. Long standard was **IRSA (IAM Roles for Service Accounts)** — cluster gets OIDC Provider, ServiceAccount annotated with IAM Role, pod assumes via OIDC token.

Problem: OIDC setup complexity per cluster, accumulated burden. **EKS Pod Identity** (2023) simplifies — no OIDC setup, just Pod Identity Agent add-on, direct `create-pod-identity-association` wiring namespace·ServiceAccount·Role.

```bash
aws eks create-pod-identity-association \
  --cluster-name prod \
  --namespace billing --service-account svc-billing \
  --role-arn arn:aws:iam::ACCT:role/BillingPodRole
```

> 💡 **Related theory**: IRSA → Pod Identity reflects **credential ephemeral-ization + simplification**, cloud identity's consistent direction (Roles Anywhere yesterday). IRSA is federation power but ops-heavy, per-cluster OIDC Provider in Role trust policy scales poorly. Pod Identity abstracts federation behind AWS-managed layer, same Role across many clusters (trust policy just `pods.eks.amazonaws.com`). Essence: "static node creds (all pods share) → pod-level ephemeral creds" granularity gain, Pod Identity achieves ops-free.

## Container Observability — Three-Piece Suite

Hundreds of containers need consistent metric/log/trace collection. Standard trio:

- **Container Insights**: ECS/EKS cluster/node/pod/task metrics auto-collected to CloudWatch.
- **ADOT Collector (AWS Distro for OpenTelemetry)**: DaemonSet-deployed, metrics/traces to CloudWatch·Managed Prometheus. OpenTelemetry standard → vendor-neutral.
- **FireLens (Fluent Bit)**: Sidecar container logs **simultaneous fan-out** (CloudWatch, Kinesis, S3, OpenSearch, etc.).

> 🔍 **Deeper**: This trio is observability's three pillars — **metrics·logs·traces.** Evolved from 1990s SNMP → 2010s Google Dapper (tracing)·Prometheus (metrics)·Twitter Zipkin → 2019 **OpenTelemetry** (unified SDK+wire format). ADOT uses OpenTelemetry standard — same instrumentation code, any backend (CloudWatch, Prometheus, Datadog, Grafana). FireLens uses Fluent Bit (lightweight) for fan-out routing (needed; metrics to different destinations for different purposes). "Metrics = what + how much, Logs = what event, Traces = where slow."

## Cost Optimization — Graviton·Spot Are Core Levers

"20% cut" pressure: single highest lever is **compute unit cost.**

| Item | Action | Effect |
|---|---|---|
| Nodes | Karpenter + Spot + Graviton | 30-40% ↓ compute |
| Unused pods | VPA right-sizing | Remove over-allocation |
| Idle clusters | Nightly shrink (EventBridge→Lambda) | Non-prod savings |
| ECR image pile | Lifecycle Policy auto-delete | Storage ↓ |
| Fargate Spot | Non-critical workloads | Fargate unit↓ |
| Visibility | Kubecost / Cost Categories | Accountability |

> 💡 **Related theory**: **Graviton (AWS ARM64)** cost-power win flows from ISA philosophy. ARM is RISC (Reduced Instruction Set) — simple uniform instructions, high transistor-per-watt efficiency. Originally mobile (battery life), translates datacenter to per-watt performance and cost. AWS designs in-house (2018 Graviton1 → 2020 Graviton2 → 3·4), margin cut, price drop. 30-40% gain roots here. Gotcha: ARM64 ≠ x86 binary-compatible, **multi-arch image build (docker buildx)** needed; some native deps might not have ARM support. **Spot** is different — AWS spare capacity rented 90% off, 2min eviction notice. Pair with PDB·Topology Spread·Karpenter interruption handling for safety.

> 🎯 **Scenario**: "100+ microservices, peak 100k RPS, 20% YoY cut. Billing: precise control needed; general: simple. Want: ①seconds-scale diverse instance spin + Spot ②git revert rollback ③new EKS, pod IAM no OIDC ④compute 30%+ cut." → ① EKS Karpenter + Spot/Graviton/On-Demand mix (billing: On-Demand keep), PDB·Topology Spread. ② Manifest repo + Argo CD, rollback = git revert. ③ EKS Pod Identity. ④ Graviton arm64 nodes + Spot + Fargate Spot (non-critical), VPA right-size, ECR Lifecycle. General 70% = ECS Fargate + CodeDeploy Blue/Green. Observability = Container Insights + ADOT + FireLens.

## Summary

Today covered five. First, **ECS Fargate vs EKS is abstraction trade-off**, hybrid per-workload is mature. Second, **Karpenter = no ASG + EC2 direct + bin-packing + consolidation** = seconds scale, diverse instances, dynamic. Third, **GitOps = Git single truth + closed-loop reconcile** = drift auto-fix + git revert rollback (build/deploy split). Fourth, **Pod Identity = IRSA post-standard**, ECS Blue/Green = CodeDeploy controller. Fifth, **Container Insights·ADOT·FireLens = observability trio** (metrics/logs/traces, OpenTelemetry standard), **Graviton + Spot = 30-40% cost cut** (RISC efficiency, spare capacity hire).

Next: system running well; when it breaks, **serverless incident auto-response** at scale.

---

## 📝 Practice Questions

**Question 1.** In EKS, how can you respond to traffic swings in seconds rather than minutes, dynamically launch a variety of instances matching pod requirements instead of fixed types in an ASG, and use Spot flexibly?

A) Cluster Autoscaler

B) Karpenter — launches nodes directly through the EC2 API based on the actual requirements of pending pods without going through an ASG, and dynamically selects instance types with bin-packing optimization and consolidation

C) ASG Scheduled Action

D) Spot Fleet alone

**Answer: B**

Explanation: Cluster Autoscaler presupposes an ASG, operates on a minute scale, and instance types are fixed in advance in the ASG. Karpenter launches EC2 directly without an ASG, selects the cheapest well-fitting instance combination in real time through bin-packing based on pending pod requirements (an NP-hard approximation), and relocates fragmented nodes with consolidation. "Fast scaling + dynamic selection of diverse instances + flexible Spot" points to Karpenter. A Scheduled Action (C) or Spot Fleet alone (D) is not dynamic scheduling.

---

**Question 2.** Which statement MOST accurately describes the core operating principle of GitOps (Argo CD/Flux)?

A) It is just a script that automates kubectl apply

B) The Git repository becomes the single source of truth for the cluster's desired state, and an agent runs a closed-loop control (reconciliation) that converges the difference between the current and desired state to zero, automatically correcting drift and turning rollback into git revert

C) It merges build and deployment into a single pipeline

D) It is an alias for CloudFormation

**Answer: B**

Explanation: GitOps applies closed-loop control from control theory to deployment — it lifts the source of the desired state in Kubernetes' reconciliation loop up to Git. As a result, Git becomes a complete audit log, the agent reverts even manual changes made in the console (automatic drift correction), and rollback becomes git revert. It is the essence of the declarative paradigm. A simple script (A), merging build (C; in fact separating build and deployment is the key), and a CloudFormation alias (D) are wrong.

---

**Question 3.** In a new EKS cluster, what is the currently recommended standard for granting per-pod IAM credentials without setting up an OIDC Provider?

A) All pods share the node's Instance Profile

B) EKS Pod Identity — install the Pod Identity Agent add-on and directly associate namespace/ServiceAccount/Role; no OIDC setup is needed and the same Role is easy to reuse across multiple clusters

C) Inject IAM User keys into pods

D) Manually call STS GetSessionToken

**Answer: B**

Explanation: IRSA requires setting up an OIDC Provider for each cluster and embedding the OIDC ARN in the IAM trust policy, which becomes a burden as clusters multiply. EKS Pod Identity grants per-pod IAM through an add-on + association without OIDC setup, and only `pods.eks.amazonaws.com` needs to be in the trust policy, making Role reuse easy — it is the successor standard for identity simplification. Sharing the node profile (A) violates least privilege, and IAM User keys (C) and manual STS (D) are anti-patterns.

---

**Question 4.** How can you perform a Blue/Green deployment on ECS Fargate that requires Canary/Linear traffic shifting and immediate rollback?

A) The default ECS Rolling Update is sufficient

B) Set the service's deployment-controller to CODE_DEPLOY and configure CodeDeploy Blue/Green + two Target Groups/Listeners on the ALB

C) Use only Route 53 Weighted Routing

D) Use a Lambda Alias

**Answer: B**

Explanation: The default ECS Rolling Update merely replaces existing Tasks gradually and is weak on fast rollback and fine-grained traffic shifting control. Blue/Green requires specifying the CodeDeploy controller (`deployment-controller type=CODE_DEPLOY`) and two ALB Target Groups (Blue/Green) and a Listener — this provides Canary/Linear shifting and immediate rollback. Rolling (A) lacks that control, and Route 53 Weighted (C) and a Lambda Alias (D) are not the standard traffic shifting for ECS container deployments.

---

**Question 5.** How can you route container logs simultaneously to multiple destinations such as CloudWatch, Kinesis, S3, and OpenSearch (fan-out)?

A) CloudWatch Agent

B) A FireLens (Fluent Bit) sidecar

C) X-Ray

D) Container Insights

**Answer: B**

Explanation: FireLens runs Fluent Bit (a lightweight log processor) as a sidecar to fan out container logs to multiple destinations at the same time — for example, Kinesis for real-time analysis, S3 for long-term retention, and OpenSearch for search. Container Insights (D) is for metrics, X-Ray (C) is for traces, and the CloudWatch Agent (A) is centered on a single destination, so FireLens is the standard for multi-destination fan-out.

---

**Question 6.** Under pressure to "cut costs 20% year over year," what is the single best action to reduce container compute costs by 30-40%, and what is its pitfall?

A) Only buy Reserved Instances

B) Apply Graviton (arm64) node groups + Spot — Graviton has a lower unit price due to RISC-based power efficiency, but it is not compatible with x86 so multi-architecture images (buildx) are required, and Spot has a 2-minute interruption notice so it must be used together with PDBs and Topology Spread

C) Move the Region

D) Switch to S3 IA

**Answer: B**

Explanation: Graviton is ARM (RISC)-based, with excellent performance per watt and cost, and AWS's in-house design lowers the price, yielding 30-40% savings. However, ARM64 is binary-incompatible with x86, so multi-architecture image builds are required, and some native dependencies may be unsupported. Spot offers up to 90% discount but has a 2-minute interruption notice, so it is safe only when used with PDBs, Topology Spread, and Karpenter's interruption handling. RI alone (A), moving Regions (C), and S3 IA (D) are not key levers on container compute unit price.

---

**Question 7.** What is the fundamental reason that choosing ECS Fargate and EKS differently per workload (a mix) is better than covering everything with a single tool?

A) Because AWS gives a discount for mixed usage

B) Because abstraction is not free: gaining convenience (operational simplicity) means losing control (node optimization), so it is optimal to choose a low abstraction (EKS + node control) for the few workloads where cost and control are decisive, and a high abstraction (Fargate) for the many where operational simplicity matters

C) Because EKS is always cheaper

D) Because Fargate is always more secure

**Answer: B**

Explanation: Fargate abstracts away nodes and removes the operational burden, but it takes away the knobs for node-level optimization (instance types, fine-grained Spot control), while EKS gives full control but charges an operational tax of control plane, CNI, and node management — "abstraction is not free." Therefore a mix that chooses a different level of abstraction per workload (payments = EKS, general web = Fargate) is a mature pattern. A discount (A), EKS always being cheaper (C), and Fargate always being safer (D) are baseless generalizations.

---

## 📌 Today's Summary

There are five key takeaways today. First, ECS Fargate vs EKS is a choice of level of abstraction (convenience vs control), and a per-workload mix is a mature pattern. Second, Karpenter achieves second-level response, dynamic instance selection, and flexible Spot use by launching EC2 directly without an ASG, with bin-packing optimization and consolidation. Third, GitOps is closed-loop control (reconciliation) with Git as the single source of truth, providing automatic drift correction and git revert rollback while separating build and deployment. Fourth, EKS Pod Identity is the successor standard for identity simplification that removes IRSA's OIDC setup burden, and ECS Blue/Green requires the CodeDeploy controller. Fifth, Container Insights, ADOT, and FireLens are the three pillars of observability (metrics, logs, traces; the OpenTelemetry standard), and Graviton (RISC power efficiency) + Spot is the key lever for a 30-40% cost reduction (watch out for buildx and PDBs).
