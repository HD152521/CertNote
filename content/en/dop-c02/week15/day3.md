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

## 📝 연습 문제

**문제 1.** EKS에서 트래픽 급변에 분 단위가 아닌 초 단위로 대응하고, ASG에 고정된 타입이 아니라 파드 요구에 맞는 다양한 인스턴스를 동적으로 띄우며 Spot도 유연하게 쓰려면?

A) Cluster Autoscaler

B) Karpenter — ASG를 거치지 않고 펜딩 파드의 실제 요구를 보고 EC2 API로 직접 노드를 띄우며, bin-packing 최적화와 consolidation으로 인스턴스 타입을 동적 선택한다

C) ASG Scheduled Action

D) Spot Fleet 단독

**정답: B**

해설: Cluster Autoscaler는 ASG를 전제로 분 단위로 동작하고 인스턴스 타입이 ASG에 사전 고정된다. Karpenter는 ASG 없이 EC2를 직접 띄우며 펜딩 파드 요구 기반 bin-packing(NP-hard 근사)으로 가장 싸고 잘 맞는 인스턴스 조합을 실시간 선택하고, consolidation으로 단편화 노드를 재배치한다. "빠른 스케일 + 다양한 인스턴스 동적 선택 + Spot 유연"은 Karpenter를 가리킨다. Scheduled Action(C)·Spot Fleet 단독(D)은 동적 스케줄링이 아니다.

---

**문제 2.** GitOps(Argo CD/Flux)의 핵심 동작 원리로 가장 정확한 것은?

A) kubectl apply를 자동화하는 스크립트일 뿐이다

B) Git 저장소가 클러스터 목표 상태의 단일 진실이 되고, 에이전트가 현재 상태와 목표 상태의 차이를 0으로 수렴시키는 폐루프 제어(reconciliation)를 돌려, 드리프트를 자동 교정하고 롤백을 git revert로 만든다

C) 빌드와 배포를 하나의 파이프라인에 합친다

D) CloudFormation의 별칭이다

**정답: B**

해설: GitOps는 제어 이론의 폐루프 제어를 배포에 적용한 것이다 — 쿠버네티스의 reconciliation loop의 목표 상태 출처를 Git으로 끌어올린다. 결과로 Git이 완전한 감사 로그가 되고, 콘솔에서 손으로 바꿔도 에이전트가 되돌리며(드리프트 자동 교정), 롤백이 git revert가 된다. 선언적 패러다임의 정수다. 단순 스크립트(A)·빌드 합침(C, 오히려 빌드/배포 분리가 핵심)·CloudFormation 별칭(D)은 틀리다.

---

**문제 3.** 신규 EKS 클러스터에서 OIDC Provider 셋업 없이 파드별 IAM 자격 증명을 부여하는 현재 권장 표준은?

A) 모든 파드가 노드의 Instance Profile을 공유

B) EKS Pod Identity — Pod Identity Agent 애드온을 깔고 namespace/ServiceAccount/Role을 직접 연결(association)하며, OIDC 셋업이 불필요하고 같은 Role을 여러 클러스터에서 재사용하기 쉽다

C) IAM User 키를 파드에 주입

D) STS GetSessionToken 수동 호출

**정답: B**

해설: IRSA는 클러스터마다 OIDC Provider를 세우고 IAM 신뢰 정책에 OIDC ARN을 박아야 해 클러스터가 늘면 부담이 커진다. EKS Pod Identity는 OIDC 셋업 없이 애드온 + association으로 파드별 IAM을 부여하며, 신뢰 정책에 `pods.eks.amazonaws.com`만 두면 돼 Role 재사용이 쉽다 — 신원 간소화의 후속 표준이다. 노드 프로파일 공유(A)는 최소 권한 위배, IAM User 키(C)·수동 STS(D)는 안티패턴이다.

---

**문제 4.** ECS Fargate에서 Canary/Linear 트래픽 시프트와 즉시 롤백이 필요한 Blue/Green 배포를 하려면?

A) 기본 ECS Rolling Update로 충분하다

B) 서비스의 deployment-controller를 CODE_DEPLOY로 지정하고 CodeDeploy Blue/Green + ALB의 두 Target Group/Listener를 구성한다

C) Route 53 Weighted Routing만 쓴다

D) Lambda Alias를 쓴다

**정답: B**

해설: ECS 기본 Rolling Update는 기존 Task를 점진 교체할 뿐 빠른 롤백·세밀한 트래픽 시프트 제어가 약하다. Blue/Green은 CodeDeploy 컨트롤러(`deployment-controller type=CODE_DEPLOY`)를 지정하고 ALB의 두 Target Group(Blue/Green)과 Listener를 요구한다 — 이것이 Canary/Linear 시프트와 즉시 롤백을 준다. Rolling(A)은 그 제어가 없고, Route 53 Weighted(C)·Lambda Alias(D)는 ECS 컨테이너 배포의 표준 트래픽 시프트가 아니다.

---

**문제 5.** 컨테이너 로그를 CloudWatch·Kinesis·S3·OpenSearch 등 여러 목적지로 동시에 분기(fan-out) 라우팅하려면?

A) CloudWatch Agent

B) FireLens(Fluent Bit) 사이드카

C) X-Ray

D) Container Insights

**정답: B**

해설: FireLens는 Fluent Bit(경량 로그 프로세서)를 사이드카로 띄워 컨테이너 로그를 여러 목적지로 동시에 fan-out 라우팅한다 — 실시간 분석은 Kinesis, 장기 보관은 S3, 검색은 OpenSearch처럼. Container Insights(D)는 메트릭, X-Ray(C)는 트레이스, CloudWatch Agent(A)는 단일 목적지 중심이라 다목적지 분기에는 FireLens가 표준이다.

---

**문제 6.** "전년 대비 20% 비용 감축" 압박에서 컨테이너 컴퓨트 비용을 30~40% 줄이는 단일 최고의 액션과 그 함정은?

A) Reserved Instance만 구매한다

B) Graviton(arm64) 노드 그룹 + Spot 적용 — Graviton은 RISC 기반 전력 효율로 단가가 낮으나 x86 비호환이라 멀티 아키텍처 이미지(buildx)가 필요하고, Spot은 2분 통보 회수가 있어 PDB·Topology Spread와 함께 써야 한다

C) Region을 옮긴다

D) S3 IA로 전환한다

**정답: B**

해설: Graviton은 ARM(RISC) 기반으로 와트당 성능·비용이 우수하고 AWS 자체 설계로 가격을 낮춰 30~40% 절감을 준다. 단 ARM64는 x86과 바이너리 비호환이라 멀티 아키텍처 이미지 빌드가 필요하고 일부 네이티브 의존성이 미지원일 수 있다. Spot은 최대 90% 할인이지만 2분 통보 회수가 있어 PDB·Topology Spread·Karpenter 중단 처리와 함께 써야 안전하다. RI 단독(A)·Region 이동(C)·S3 IA(D)는 컨테이너 컴퓨트 단가의 핵심 레버가 아니다.

---

**문제 7.** ECS Fargate와 EKS를 워크로드별로 다르게 고르는(혼합) 것이 단일 도구로 전부를 덮는 것보다 나은 근본 이유는?

A) AWS가 혼합 사용에 할인을 주기 때문

B) 추상화는 공짜가 아니라 편의(운영 단순성)를 얻으면 제어(노드 최적화)를 잃는 trade-off이므로, 비용·제어가 결정적인 소수엔 낮은 추상화(EKS+노드 제어)를, 운영 단순성이 중요한 다수엔 높은 추상화(Fargate)를 고르는 것이 최적이기 때문

C) EKS가 항상 더 싸기 때문

D) Fargate가 항상 더 안전하기 때문

**정답: B**

해설: Fargate는 노드를 추상화해 운영 부담을 없애지만 노드 수준 최적화(인스턴스 타입·Spot 세밀 제어)의 손잡이를 빼앗고, EKS는 제어를 다 주지만 컨트롤 플레인·CNI·노드 관리라는 운영 세금을 물린다 — "추상화는 공짜가 아니다." 그래서 워크로드별로 추상화 수준을 다르게(결제=EKS, 일반 웹=Fargate) 고르는 혼합이 성숙한 패턴이다. 할인(A)·EKS가 항상 저렴(C)·Fargate가 항상 안전(D)은 근거 없는 일반화다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, ECS Fargate vs EKS는 추상화 수준(편의 vs 제어)의 선택이며 워크로드별 혼합이 성숙한 패턴이다. 둘째, Karpenter는 ASG를 거치지 않고 EC2 직접 + bin-packing 최적화 + consolidation으로 초 단위·동적 인스턴스 선택·Spot 유연 활용을 달성한다. 셋째, GitOps는 Git을 단일 진실로 두는 폐루프 제어(reconciliation)로 드리프트 자동 교정과 git revert 롤백을 주며 빌드/배포를 분리한다. 넷째, EKS Pod Identity가 IRSA의 OIDC 셋업 부담을 없앤 신원 간소화 후속 표준이고, ECS Blue/Green은 CodeDeploy 컨트롤러를 요구한다. 다섯째, Container Insights·ADOT·FireLens가 관찰성 3종(메트릭·로그·트레이스, OpenTelemetry 표준)이며, Graviton(RISC 전력 효율)+Spot이 비용 30~40% 절감의 핵심 레버다(buildx·PDB 주의).
