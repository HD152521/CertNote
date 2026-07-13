# Day 1 - Container Orchestration Crossroads: The Real Criteria for Choosing ECS, EKS, Fargate

If you've ever clicked "Create ECS" somewhere in the console, two questions immediately come to mind: "Why not use EKS?", "What's the difference from Fargate?" On the surface, all three look like "tools for running containers," but when you receive your billing statement, the difference can be hundreds of dollars per month. The SAP exam presents scenarios with all three services, averaging 3-4 questions per domain, but surface-level keyword matching won't get you even halfway there.

This article examines why ECS, EKS, and Fargate evolved into their current forms, how the control plane and data plane diverge, and where the branching occurs depending on scenarios. Including App Runner, ECS/EKS Anywhere, we aim to draw a single map of the "AWS container family." If you recall this map before the exam, any scenario narrows down to one of four answers.

## Why Container Orchestration Was Necessary — Historical Context

Before Docker arrived in 2013, server deployment meant "work dependent on a specific server." If you installed ruby 2.6, python 3.7, and node 12 on one server simultaneously, dependency hell began, and "it works on my laptop but not on the server" was the daily norm. Docker solved this problem by layering image and layer concepts on top of LXC (Linux Containers) and Union FS, but the moment you spin up 30 containers on one server, a new problem emerges. It becomes difficult to track which containers are dead and which are alive, and if one server dies, all 30 containers on it disappear at once.

In 2014, Google open-sourced its Borg system experience as Kubernetes (K8s). AWS released ECS the same year, creating its own orchestrator because K8s hadn't yet reached version 1.0 officially. Later, as K8s became the de facto standard, AWS announced EKS in 2017 at re:Invent, declaring "we now offer K8s as a managed service." Fargate, announced at the same event, answered the market demand: "I don't want to worry about nodes at all," providing a serverless data plane.

> 💡 **Related Theory**: Container orchestration is fundamentally a **scheduling problem** for distributed systems. How do you place m jobs on n nodes? This reduces to an NP-hard multi-dimensional bin packing problem. K8s' basic scheduler solves it with heuristics combining priorityFunction and predicate filters, while Karpenter goes further by dynamically selecting node types. Theoretical background is available in Tannenbaum's *Distributed Systems* chapter 6.3 and Google's Borg paper (2015 EuroSys, "Large-scale cluster management at Google with Borg").

> 🔍 **Deeper Dive**: The biggest design philosophy difference between ECS and K8s is **API richness**. K8s has 30+ resource types — Pod, Deployment, Service, ConfigMap, Secret, Ingress, CRD, etc. — all declarative YAML. ECS ends at four concepts: Cluster, Task Definition, Service, Task. The learning curve difference translates directly to operational burden. In SAP exams, when "minimize operational burden" and "AWS-focused" keywords appear together, the answer is almost always ECS; when "portability" and "K8s standard" keywords appear, it's almost always EKS.

## Responsibility Map: ECS, EKS, Fargate

The initial confusion about these three services stems from **Fargate not being a separate orchestrator**. Fargate is a "data plane option" you can use instead of nodes, available for both ECS and EKS.

```
        ┌─────────────────────────────────────────┐
        │  Control Plane                           │
        │  ├─ ECS: AWS managed, free              │
        │  └─ EKS: AWS managed, $0.10/h           │
        └─────────────────────────────────────────┘
                          │
                          │ Task placement decision
                          ▼
        ┌─────────────────────────────────────────┐
        │  Data Plane — 3 options                 │
        │  ├─ EC2 Launch Type (user manages nodes)│
        │  ├─ Fargate Launch Type (serverless)    │
        │  └─ ECS Anywhere / EKS Anywhere (on-prem)
        └─────────────────────────────────────────┘
```

| Dimension | ECS | EKS | Fargate |
|-----------|-----|-----|---------|
| Control plane cost | Free | $0.10/h (~$73/month) | N/A (option) |
| API standard | AWS proprietary | Kubernetes (CNCF) | Depends on ECS/EKS API |
| Learning curve | Low | High (kubectl, YAML, CRD) | Same as ECS/EKS |
| Portability | AWS-dependent | Multi-cloud possible | AWS-dependent |
| Data plane options | EC2, Fargate, Anywhere | EC2 (Managed/Self), Fargate, Anywhere | (itself) |
| Spot integration | EC2 Spot, Fargate Spot | EC2 Spot, Fargate Spot, Karpenter | Fargate Spot |
| Startup time | Tens of seconds to 1 minute | Tens of seconds to 1 minute | 30-60s (including image pull) |

> 🎯 **Scenario**: "A global fintech runs AWS, on-premises, and GCP simultaneously. Container workload portability is critical—they need identical manifests deployable in any environment. The ops team wants to avoid K8s operational burdens like control plane patching and etcd backups. Which combination fits?" — **EKS + Karpenter + IRSA**. ECS is AWS-proprietary so portability breaks; App Runner doesn't support multi-cloud manifest compatibility. EKS is the exact intersection: K8s standard while AWS manages the control plane.

## ECS Core Architecture: The Beauty of Simplicity

ECS requires knowing just four concepts: **Cluster → Service → Task → Task Definition**.

- **Task Definition**: A JSON blueprint defining container image, vCPU/memory, environment variables, IAM Role (`taskRoleArn`), volume mounts, and logging. Similar to Docker Compose but maps to both Fargate and EC2.
- **Task**: A running instance of a Task Definition. One Task = one or more containers (typically main + sidecars).
- **Service**: A controller maintaining desired Task count. Handles ALB Target Group integration, deployment strategies (Rolling/Blue-Green via CodeDeploy), and auto-scaling.
- **Cluster**: A logical unit wrapping all of the above. A single cluster can mix EC2 and Fargate launch types.

The key distinction is **Task IAM Role** (= `taskRoleArn`) vs. **Task Execution Role** (= `executionRoleArn`). Confusing them costs one or two exam questions.

| Role | Purpose | Used by |
|------|---------|---------|
| **Task Execution Role** | ECR image pull, CloudWatch Logs write, fetch environment variables from Secrets Manager | ECS agent (infrastructure work) |
| **Task Role** | Application code making AWS API calls (DynamoDB Put, S3 Get, etc.) | Application code inside Task |

> ⚠️ **Trap**: "ECS Task has S3 access permission error" usually means **Task Role** is missing S3 permissions. Adding S3 to Execution Role won't work (the app calls it, not the ECS agent). Conversely, "ECR image pull fails" is an Execution Role issue.

## EKS Core Architecture: Layering AWS on Top of K8s

EKS is essentially managed K8s, so it uses K8s concepts directly (Pod, Deployment, Service, Ingress, ConfigMap, Secret, ServiceAccount, CRD). AWS adds four integration layers on top.

1. **Control Plane**: API Server, etcd, controller-manager, scheduler distributed across 3 AZs and managed. Users don't handle etcd backups or version upgrades.
2. **Node Groups**: Units bundling worker nodes. Managed Node Group (AWS automates ASG/draining), Self-Managed Node Group (user operates), Fargate Profile (no nodes, Pod-per-micro-VM).
3. **IRSA / Pod Identity**: Maps K8s ServiceAccount to IAM Role. Details in the next day.
4. **EKS Add-ons**: VPC CNI, CoreDNS, kube-proxy, EBS CSI Driver, AWS Load Balancer Controller, etc., managed and updated.

EKS' $0.10/hour is roughly $73/month per cluster, regardless of node count. "An ops team wants to spin up 100 clusters" becomes $7,300/month — not ignorable. SAP frequently features the tradeoff: "dozens of small workloads → multiple ECS clusters" vs. "unified EKS + namespace isolation."

> 📚 **Case Study**: On March 2, 2019, part of the EKS us-east-1 cluster's API Server became unresponsive. Root cause: etcd quorum loss during control plane upgrade. AWS auto-recovered, but for ~2 hours, some clusters experienced `kubectl` command failures. The lesson: **data plane (Pods on nodes) keeps running even if the control plane dies**. Already-scheduled Pods continue; only new scheduling and rolling updates are blocked. Production operations can survive control plane outages in "new deployments paused, existing traffic maintained" mode. [See AWS Status History](https://health.aws.amazon.com/health/status).

## Launch Type: EC2 vs. Fargate — Real Tradeoffs

Same ECS Service, but EC2 and Fargate Launch Types differ completely in cost, operations, and capabilities.

| Aspect | EC2 Launch Type | Fargate Launch Type |
|--------|----------------|---------------------|
| Node management | User (AMI patching, capacity provider, ASG) | AWS |
| Cost model | EC2 hours + EBS | vCPU-seconds + memory-seconds |
| Startup time | Fast (pre-warmed nodes) | 30-60s (micro-VM boot + image pull) |
| GPU/high-density | Possible (P, G, Inf instances) | GPU in select regions only |
| Daemon Set | Possible | Not possible (no node concept in Fargate) |
| ENI | Shared or awsvpc mode | One ENI per Task (forced) |
| Operational burden | High (patching, AMI, ASG) | Low |
| Cost efficiency | Favors steady, high-density use | Favors spiky workloads |
| Sidecar flexibility | Unlimited | Within memory/CPU limits |

> 🔍 **Deeper Dive**: Fargate boots a micro-VM each time because **hardware-level isolation** is required. AWS built Firecracker, its own micro-VMM (Virtual Machine Monitor). Running on KVM but providing only a minimal device model instead of full QEMU, boot time is ~125ms. The Firecracker paper (NSDI 2020 — "Firecracker: Lightweight Virtualization for Serverless Applications") is public, and the same technology powers Lambda. This isolation ensures Fargate safely runs next to other customers' containers in multi-tenant environments.

> 💡 **Related Theory**: EC2 Launch Type's cost efficiency comes from **bin packing**. Running 16 × 0.25 vCPU Tasks on one m5.xlarge (4 vCPU, 16GB) spreads the node cost. Fargate's Task-per-micro-VM model prevents bin packing; each Task's vCPU and memory are billed separately. "Running 1,000 × 0.25 vCPU Tasks" is vastly cheaper on EC2, but "variable + spiky" favors Fargate. The practical breakpoint: average node utilization over **40%**. Consistently above 40%, EC2 + SP typically wins; below, Fargate generally wins.

## Container Services Comparison with Other Clouds

AWS ECS, EKS, and Fargate in context with GCP and Azure clarifies positioning.

| Dimension | AWS | GCP | Azure |
|-----------|-----|-----|-------|
| Managed K8s | EKS | GKE (Autopilot/Standard) | AKS |
| K8s control plane cost | $0.10/h | Standard free, Autopilot free | Free (Free tier) |
| Serverless containers | Fargate, App Runner | Cloud Run, GKE Autopilot | Container Apps, Container Instances |
| Proprietary orchestrator | ECS | (none) | (none) |
| On-premises extension | ECS Anywhere, EKS Anywhere | Anthos | Azure Arc, AKS HCI |
| Auto node provisioning | Karpenter (open source) | GKE Autopilot built-in | AKS Node Auto-provisioning (Preview) |

GCP's GKE Autopilot is closest to "zero operational burden," and AWS caught up with EKS Auto Mode (late 2024). Azure focused on K8s without building a proprietary orchestrator. AWS maintains ECS because part of the market finds K8s "too heavy."

> 📚 **Case Study**: In 2022, Snap (Snapchat's parent) migrated some workloads from GCP to AWS. GCP's GKE-to-EKS migration was the largest cost and time item. Manifests transferred intact, but IAM integration (Workload Identity → IRSA), Ingress (GCP Load Balancer → AWS ALB Controller), and Persistent Volume mapping (GCP PD → EBS) all had to be rewritten. K8s is a standard, but cloud integration layers aren't.

## App Runner: Further Reducing Operational Burden

Even ECS Fargate requires "building VPC, ALB, Service, Task Definition." App Runner (GA 2021) abstracts one level higher — a PaaS. Point to a GitHub repo or ECR image, and auto build/deploy/URL provisioning completes. Think of it as Heroku for AWS.

- **Advantages**: No VPC/ALB/Service setup needed, 0→N auto-scaling, suspend mode (shrink to 0 when idle).
- **Disadvantages**: Accessing internal VPC resources needs extra setup (VPC Connector), limited advanced networking/service mesh integration, higher per-vCPU/memory cost than Fargate.

By scenario keywords:

- "GitHub Push → auto-deploy" + "minimize ops" + "single service" → **App Runner**
- "10 microservices + ALB + Service Discovery" → **ECS Fargate**
- "K8s standard + multi-cloud" → **EKS**

> ⚠️ **Trap**: "App Runner is always cheaper than ECS Fargate" is wrong. App Runner's operational cost is higher; only the operational burden is lower. High-traffic production may favor ECS Fargate + Capacity Provider.

## ECS Anywhere vs. EKS Anywhere: Control Plane Location Differs

Two frequently confused services in hybrid environments. Similar names, opposite structures.

| Aspect | ECS Anywhere | EKS Anywhere |
|--------|--------------|--------------|
| Control plane location | **AWS cloud** | **On-premises** (customer infrastructure) |
| Data plane location | On-premises | On-premises |
| Internet connectivity | Required for control plane calls | Supports air-gapped (fully isolated) |
| Licensing | Billed per external instance hour | EKS Distro free + support separate |
| Use case | "Manage alongside AWS ECS" | "Operate K8s on-prem, EKS-D for consistency" |
| Comparison: ECS on Outposts | Control plane AWS, nodes Outposts (AWS hardware) | (N/A) |

> 🎯 **Scenario**: "A manufacturer operates 100 factory gateways. Some factories have internet outages spanning days; workloads must operate autonomously. Which option fits?" — **EKS Anywhere**. Control plane on-premises works in air-gapped environments. ECS Anywhere needs control plane calls, so internet loss halts new deployments and scaling.

> 🔍 **Deeper Dive**: EKS Anywhere internally uses **EKS Distro (EKS-D)**, an open-source K8s distribution. AWS packages the K8s version and components (coredns, etcd, kube-proxy, CNI) validated for EKS, ensuring identical versions and behavior cloud and on-prem. This pattern mirrors GCP's Anthos (GKE on-prem). Anthos bundles the GKE-operated control plane into on-prem; EKS Anywhere keeps the control plane on-premises.

## Capacity Provider: Cut Costs 70% with Fargate Spot

Capacity Provider abstracts "where to place this task" for an ECS Service. Three types exist:

- **FARGATE**: Standard Fargate (On-Demand)
- **FARGATE_SPOT**: Fargate Spot (up to 70% discount, 2-minute SIGTERM before reclamation)
- **EC2 ASG**: User-created ASG (Spot Fleet possible)

Mix these with weight and base. Example: base=2, FARGATE weight=1, FARGATE_SPOT weight=4:

- First 2 Tasks always get FARGATE (base)
- After that, 20% FARGATE, 80% FARGATE_SPOT ratio

This guarantees minimal availability with 2 stable Tasks while reducing 60-70% costs via Spot for the rest. SAP's "cost efficiency + availability both" scenarios frequently feature this answer.

> 📚 **Case Study**: In 2023, Pinterest shifted some backend workloads to ECS Fargate + 80% Fargate Spot mix, reducing container infrastructure costs ~40%. They increased `STOPTIMEOUT` to 60 seconds and implemented SIGTERM handlers for graceful in-flight request draining. AWS re:Invent 2023 presentation.

## ECS Exec: Debug Containers Without SSH

Operations inevitably demand "get into this container for debugging." Historically, SSH keys were embedded in nodes for `docker exec`, a security nightmare. ECS Exec (2021) provides SSH-free direct container shell access using SSM Session Manager as the backbone.

```bash
aws ecs execute-command \
  --cluster prod \
  --task <task-id> \
  --container app \
  --interactive \
  --command "/bin/sh"
```

Internally, the ECS Agent embeds SSM Agent, letting SSM act as an SSH replacement channel. All sessions log to CloudTrail, with optional full session storage in S3/CloudWatch Logs. Essential for audit and regulated environments.

## Summary

Today's map is a single chart: **Control Plane: choose ECS (AWS proprietary, free) or EKS (K8s standard, $0.10/h)**. **Data Plane: pick EC2 (direct node management, cost advantage) / Fargate (serverless, zero ops burden) / Anywhere (on-prem)**. For simpler PaaS needs, App Runner sits one level higher.

Tomorrow we drill into EKS node groups, IRSA, and Karpenter. EKS spreads across domains 1–3 in SAP, with IRSA and Karpenter as frequent exam topics. How this map fills in is next.

---

## 📝 연습 문제

**문제 1.** 한 글로벌 핀테크가 AWS·GCP·온프레미스 데이터센터에 동일한 K8s 워크로드를 배포한다. 운영팀은 클러스터 컨트롤 플레인 운영(etcd 백업, 버전 업그레이드)의 부담을 AWS에서만큼은 줄이고 싶다. 이 요구를 가장 잘 만족하는 조합은?

A) ECS Fargate
B) EKS + Managed Node Group
C) App Runner
D) ECS Anywhere

**정답: B**
해설: A global fintech deploys identical K8s workloads across AWS, GCP, and on-premises data centers. The ops team wants to minimize control plane operational burden (etcd backup, version upgrades) on AWS. Which combination best meets this requirement?

Two keywords to decompose: "K8s standard + multi-cloud portability" → EKS (K8s API), "minimize control plane ops burden" → AWS-managed → EKS control plane. ECS (A, D) is AWS-proprietary, breaking portability. App Runner (C) is incompatible with K8s manifests. Advanced learning: further portability through standardizing with Workload Identity Federation instead of IRSA, or abstracting secrets management via External Secrets Operator.

---

**문제 2.** ECS Task가 시작될 때 ECR에서 이미지 Pull은 잘 되는데, 애플리케이션 코드가 S3 GetObject를 호출하면 AccessDenied가 발생한다. 원인은?

A) Task Execution Role에 S3 권한이 없음
B) Task Role에 S3 권한이 없음
C) VPC Endpoint 미설정
D) 보안 그룹에서 443 차단

**정답: B**
An ECS Task pulls images from ECR successfully, but application code calling S3 GetObject encounters AccessDenied. Root cause?

Image pull success means Task Execution Role's ECR/CloudWatch permissions are configured correctly. Application code's AWS API calls use **Task Role** (= `taskRoleArn`). Confusing Task Role and Execution Role costs exam points. A addresses infrastructure ops, irrelevant here. C (VPC Endpoint) is latency/cost optimization; missing it doesn't break functionality (NAT works). D (security group) would cause timeout, not AccessDenied. Bonus: same pattern in EKS appears as Node Role vs. IRSA.

---

**문제 3.** 한 미디어 스타트업이 코드 한 줄 푸시로 자동 빌드·배포·HTTPS 엔드포인트 부여까지 되는 가장 운영 부담이 적은 옵션을 찾는다. 사이드카·서비스 메시·고급 VPC 통합은 필요 없다. 어느 서비스가 적합한가?

A) ECS Fargate + ALB
B) EKS + ArgoCD
C) App Runner
D) Elastic Beanstalk

**정답: C**
A media startup seeks minimal-ops auto-build, deploy, and HTTPS endpoint with a single code push. Sidecars, service mesh, advanced VPC integration aren't needed. Which service fits?

App Runner is the simplest PaaS—point to GitHub repo or ECR image, and build/deploy/domain/auto-scaling are all handled. A requires more ops (ALB, Target Group, Service Definition manual setup). B is heavy (K8s + GitOps). D (Beanstalk) is heavier and EC2-based; App Runner is newer and simpler for containers. Trap: "isn't EC2 Fargate cheaper?" Yes, but App Runner trades higher per-unit cost for lower ops burden. SAP emphasizes ops burden over cost here.

---

**문제 4.** 트래픽이 매우 변동성 높고 새벽엔 거의 0인 ECS 백오피스 API. 가용성 일부 보장 + 비용 절감 둘 다 원한다. 어떤 Capacity Provider 구성?

A) FARGATE 100%
B) FARGATE_SPOT 100%
C) base=2 FARGATE, weight FARGATE=1 + FARGATE_SPOT=4
D) EC2 Launch Type + Reserved Instance

**정답: C**
An ECS back-office API has highly variable traffic, nearly zero at dawn. Want both some availability and cost savings. Which Capacity Provider setup?

base=2 maintains 2 stable Fargate Tasks (Spot reclamation won't cause outage) + 80% Spot above that for cost reduction. A is worst cost-wise. B risks simultaneous Spot reclamation and outage. D incurs EC2 costs even at zero dawn traffic, poor for variable loads. Bonus: extend `STOPTIMEOUT` to 60-120s and implement SIGTERM handlers for Spot termination readiness.

---

**문제 5.** 한 제조사가 100개 공장의 산업용 게이트웨이에서 컨테이너 워크로드를 운영한다. 일부 공장은 며칠씩 인터넷이 끊긴다. 컨트롤 플레인은 공장 내부에서 동작해야 한다. 적합한 서비스는?

A) ECS Anywhere
B) EKS Anywhere
C) Outposts
D) Snowball Edge

**정답: B**
A manufacturer operates container workloads on 100 factory gateways. Some factories go internet-down for days. Control plane must operate inside the factory. Which service fits?

"Internet down, control plane autonomous" = control plane must be on-prem. EKS Anywhere is exactly this (control plane + data plane both on-prem). ECS Anywhere (A) has cloud-based control plane; internet loss halts new deployments/scaling. Outposts (C) puts AWS hardware in customer facilities but still requires region control plane contact. Snowball Edge (D) is for data transfer, irrelevant. Bonus: EKS Anywhere uses EKS-D (EKS Distro) open-source K8s internally, ensuring identical versions and behavior cloud and on-prem.

---

**문제 6.** 한 회사가 EKS Pod에서 S3에 접근해야 한다. 운영팀은 "Pod별로 최소 권한"을 달성하고 싶다. 가장 안전한 방법은?

A) 워커 노드 Instance Profile에 S3 권한 부여
B) Pod 환경 변수로 AWS Access Key Secret 주입
C) IRSA (IAM Roles for Service Accounts) 또는 EKS Pod Identity
D) S3 버킷 정책에 노드 IP 허용

**정답: C**
An EKS Pod needs S3 access. The ops team wants "minimum permissions per Pod." Safest method?

A shares permissions across all Pods on the node, violating least privilege (large blast radius). B has key rotation challenges, risks key exposure in code/logs. D uses IP-based access control (not IAM), unfit for mobile EKS Pods, not least-privilege. C is correct: IRSA maps ServiceAccount → IAM Role via OIDC safely. Pod Identity is IRSA's successor (2023), simpler trust model. Bonus: 2019 Capital One breach was partly due to overpowered EC2 Instance Profiles.

---

**문제 7.** ECS 컨테이너 안에서 디버깅을 위해 셸에 접속해야 한다. 회사 보안 정책은 SSH 키 사용을 금지하고, 모든 세션을 감사 로깅해야 한다. 가장 적합한 방법은?

A) 노드에 SSH 키를 배포하고 docker exec
B) Bastion Host + SSM Port Forwarding
C) ECS Exec (`aws ecs execute-command`)
D) Cloud9 IDE 연결

**정답: C**
Must debug by shelling into an ECS container. Company security forbids SSH keys; all sessions must be audit-logged. Most suitable method?

ECS Exec provides SSH-free container shell via SSM Session Manager, with all sessions logged to CloudTrail. Optional S3/CloudWatch Logs full session storage. A violates SSH policy. B accesses node OS, not container internals, high ops burden. D (Cloud9) is an IDE, not container shell access. Bonus: enable ECS Exec by setting `enableExecuteCommand=true` in Task Definition and granting Task Role `ssmmessages:*` permissions.

---

## 📌 오늘의 요약

1. **ECS = AWS proprietary·free**, **EKS = K8s standard·$0.10/h**, **Fargate = data plane option** (not a separate orchestrator)
2. ECS's 4 concepts: Cluster / Service / Task / Task Definition + **Task Role** (app) vs. **Execution Role** (infrastructure)
3. EC2 Launch Type wins on per-unit cost via bin packing, Fargate wins on spiky/zero ops burden
4. **Capacity Provider** mixes FARGATE + FARGATE_SPOT → availability + cost reduction
5. **App Runner** is PaaS, **ECS/EKS Anywhere** is hybrid (different control plane locations)
6. **ECS Exec** enables SSH-free debugging, all sessions logged to CloudTrail
