# Day 5 - Week 7 Wrap-Up — Cementing It with 12 Container Scenario Questions

Over the week we looked at nearly every building block of the container domain, from ECS, EKS, Fargate, Karpenter, and IRSA to Service Connect. Now we see how the SAP exam actually combines these blocks into a single question. The exam's container questions do not ask about single-service knowledge but about **combinations of blocks**. "Multi-account + EKS + cost + hybrid" appears in a single question at the same time, and keyword matching alone does not get you even half. The key is how Domain 1 (organizational complexity and reliability), Domain 2 (architecture and resilience), and Domain 3 (security and cost) branch out on the common foundation of containers.

This article is the time to cement the week through 12 scenario questions. Each question demands not simple fact-checking but **branching judgment**. The pattern where changing a single sentence of the same scenario moves the correct answer to a different option is typical of SAP, and the explanations spell out those branch points. At the end, we organize the whole Week 7 mapping on one page.

## Week 7 at a Glance — Decision Tree

```
Q1. Starting a container workload
     │
     ├─ Is simple deployment and zero operations the top priority?
     │     └─ Yes → App Runner
     │     └─ No  → below
     │
     ├─ K8s standard compatibility / multi-cloud portability?
     │     └─ Yes → EKS
     │     └─ No  → ECS
     │
     ▼
Q2. Choosing the data plane
     │
     ├─ Minimal operational burden? → Fargate
     ├─ Bin packing / high density? → EC2 Launch Type
     └─ On-premises? → Anywhere

Q3. Node autoscaling (EKS)
     ├─ Fast scaling / bin packing / automatic Spot? → Karpenter
     └─ Simple ASG-based? → Cluster Autoscaler

Q4. Per-Pod permissions
     ├─ Reuse permissions across multiple clusters? → Pod Identity
     ├─ OIDC standard compatibility? → IRSA
     └─ A single node-level permission is OK? → Instance Profile (anti-pattern)

Q5. Cost optimization
     ├─ 24/7 steady load → EC2 + Compute SP
     ├─ Variable + zero operations → Fargate Spot + Compute SP
     ├─ Short and frequent → Lambda
     └─ ARM compatible → Graviton +20% savings

Q6. Service-to-service communication
     ├─ Full mesh (mTLS, canary) → App Mesh
     ├─ Lightweight mesh for ECS → Service Connect
     └─ Discovery only → Cloud Map
```

Once this tree is drawn in your head, you can check as you solve the 12 questions which branch your own answer diverged on.

## 12 Scenario Questions

---

**Question 1.** A global fintech deploys the same K8s workload to three environments: AWS, GCP, and on-premises. On AWS it wants to reduce the burden of operating the control plane (etcd backup, version upgrades), and it must be able to apply the same manifests as they are to the other environments. What is the most suitable combination?

A) ECS Fargate + Capacity Provider
B) EKS + Managed Node Group (or EKS Auto Mode)
C) App Runner + GitHub automatic deployment
D) ECS Anywhere

**Answer: B**
Explanation: You must break down two keywords. "K8s standard + multi-cloud portability" = EKS (the K8s API). "Minimal control plane operational burden" = an AWS-managed control plane = EKS. A and D use AWS-proprietary APIs, so portability breaks. C is a PaaS with no K8s manifest compatibility. Branch judgment: if the same scenario changes to "operate on AWS only, minimal operational burden," ECS Fargate becomes the answer. Additionally: to reduce operational burden even further, consider EKS Auto Mode (2024).

---

**Question 2.** A company operates 30 EKS clusters. Pods in each cluster must access S3 and DynamoDB with least privilege per Pod. What is the method that makes it easy to reuse the same IAM Role across all clusters?

A) Grant permissions to the EC2 Instance Profile
B) IRSA (IAM Roles for Service Accounts)
C) EKS Pod Identity
D) Inject the Access Key Secret through Pod environment variables

**Answer: C**
Explanation: "Per-Pod IAM" is satisfied by both IRSA and Pod Identity, but "reusing permissions across multiple clusters" is the decisive branch. IRSA registers an OIDC Provider per cluster in IAM and the Trust Policy is also per cluster. Pod Identity trusts a single principal (`pods.eks.amazonaws.com`) so the same Role can be reused in all clusters. A makes all Pods on a node share the permissions, violating least privilege. D risks key exposure. Branch: if "OIDC standard compatibility / multi-cloud friendliness" is emphasized, IRSA is the answer.

---

**Question 3.** An EKS cluster with variable traffic. It must satisfy all of the following: (1) scale-out within 1 minute, (2) optimal instance type chosen each time according to Pod requests, (3) automatic handling of Spot mix, (4) automatic consolidation when node utilization is low. Which tool is suitable?

A) Cluster Autoscaler + ASG
B) Horizontal Pod Autoscaler only
C) Karpenter
D) EKS Managed Node Group + Spot Allocation

**Answer: C**
Explanation: Only Karpenter satisfies all four requirements. It skips the ASG and provisions directly with the EC2 Fleet API, declares a diverse candidate set of instance types in the NodePool, allows both spot and on-demand capacity-type, and consolidates nodes with Consolidation. CA is tied to the ASG, with fixed instance types and weak consolidation. HPA adjusts the number of Pods, a different layer from nodes. MNG is ASG-based, so it has no Karpenter-style consolidation and relocation. Branch: if "only a simple ASG-based pattern is OK," CA is the answer.

---

**Question 4.** An ECS Fargate back-office API. An average of 5 Tasks is enough, but it spikes to 30 Tasks during campaigns. A 1-year commitment is possible, and some Task interruption is tolerable. What is the cost-optimal configuration?

A) FARGATE On-Demand 100% + EC2 Instance Savings Plans
B) FARGATE_SPOT 100%
C) A Compute Savings Plans commitment for 5 Tasks + Capacity Provider (base=2 FARGATE + FARGATE_SPOT 80%)
D) EC2 Launch Type + Reserved Instance

**Answer: C**
Explanation: It matches the two traffic characteristics (a stable 5-Task baseline + variable spikes) to two discount levers. Commit the baseline with SP, and handle the variable portion above it with Spot. base=2 provides minimum availability when Spot is interrupted. A fails because EC2 Instance SP does not apply to Fargate. B is all Spot, so there is a risk of simultaneous interruption. D fails because EC2 RI is inefficient for variable spikes. Trap: the misconception that Spot and SP cannot be used together. They apply to different resources and coexist.

---

**Question 5.** A media startup wants automatic build, deployment, and an HTTPS endpoint from a single code push, with no operational burden. Sidecars, service mesh, and advanced VPC integration are unnecessary. Which service is most suitable?

A) ECS Fargate + ALB
B) EKS + ArgoCD
C) App Runner
D) Elastic Beanstalk

**Answer: C**
Explanation: App Runner is a PaaS that provides build, deployment, domain, and automatic scaling in one go when you point it at GitHub or ECR. A has a greater operational burden (ALB, TG, Service Definition). B has a very large operational burden with K8s + GitOps. D is a heavier EC2-based option. Trap: the unit-price trap of "isn't ECS Fargate cheaper?" App Runner has a slightly higher unit price in exchange for reduced operational burden, but for a single simple backend it comes out ahead at the break-even point.

---

**Question 6.** A fintech runs 30 ECS Fargate microservices. (1) mTLS for all communication, (2) 5% traffic canary for new versions, (3) per-service circuit breakers. What is the most suitable combination?

A) ALB Weighted Target Group + ACM Public Certificate
B) AWS App Mesh + ACM Private CA
C) Cloud Map only
D) Route 53 Weighted Routing

**Answer: B**
Explanation: The three full-mesh features (mTLS, weighted canary, circuit breaker) are App Mesh territory. ACM Private CA rotates short-lived certificates automatically, a Virtual Router provides the 5% weight, and a Virtual Node provides the circuit breaker. In A, ACM Public is for external domains and ALB has no circuit breaker. C is discovery only, with no mesh features. D is DNS-level weighting, so 1%-granularity control and circuit breakers are not possible. Practical note: after App Mesh EOL (September 2026), Istio is the standard for new work, but the SAP exam goes by the point in time it was written.

---

**Question 7.** Between microservices in an ECS Cluster: (1) automatic service discovery, (2) automatic Envoy sidecar injection, (3) automatic CloudWatch metrics, (4) minimal operational burden. Weighted canary is unnecessary. Which service is suitable?

A) App Mesh
B) ECS Service Connect
C) Cloud Map + manual client LB
D) ALB per Service

**Answer: B**
Explanation: Service Connect provides automatic Envoy injection, automatic Cloud Map registration, retries, and metrics by default through one block of ECS Service options. A is a full mesh with a larger operational burden. C makes every integration manual. D means 30 ALBs for 30 services, with a large cost and operational burden. Branch: if weighted canary, mTLS, and circuit breakers are needed, App Mesh is the answer.

---

**Question 8.** A manufacturer runs industrial gateway container workloads at 100 factories. Some factories lose internet for days at a time. The control plane must operate autonomously inside the factory. Which service is most suitable?

A) ECS Anywhere
B) EKS Anywhere
C) AWS Outposts
D) Snowball Edge

**Answer: B**
Explanation: "The control plane operates autonomously even when the internet is down" = the control plane must be on-premises. EKS Anywhere (based on EKS-D) is exactly that model. In A the control plane is in the AWS cloud, so new deployments and scaling stop when the internet is cut. C places AWS hardware at the customer's facility, but control plane calls require the AWS Region. D is a data transfer device and irrelevant. Branch: if it is "use management tools like ECS on-premises," then ECS Anywhere (control plane in AWS).

---

**Question 9.** Upgrading EKS 1.22 → 1.24. What is the most accurate procedure?

A) Upgrade the Control Plane from 1.22 to 1.24 in one step
B) Upgrade the node groups to 1.24 first, then the Control Plane
C) Upgrade the Control Plane in stages 1.22 → 1.23 → 1.24, checking node group and Addon compatibility at each step, and install the EBS CSI Driver Addon (required from 1.23+)
D) Create a new 1.24 cluster and migrate the workloads

**Answer: C**
Explanation: EKS can upgrade only one minor version at a time, and node groups are permitted up to ±1 minor from the Control Plane. A is rejected by the EKS API. In B, if the nodes get ahead of the Control Plane, compatibility breaks. D is possible but carries large operational burden and downtime. Trap: from 1.23, the in-tree EBS plugin is removed, so the EBS CSI Driver Addon is effectively mandatory. If you miss it, the PVC stays Pending forever. In a fintech case, part of the payment system experienced delays.

---

**Question 10.** An EKS Pod has enough CPU and memory, but new Pods can no longer be scheduled. It looks like it hit a limit other than node resources. What is the solution with the least operational burden?

A) Replace the node group with a larger instance
B) Enable VPC CNI Prefix Delegation
C) Replace with the Calico CNI
D) Configure Custom Networking

**Answer: B**
Explanation: The symptom is ENI slot exhaustion. The AWS VPC CNI assigns VPC IPs directly to Pods, and it hits the instance's ENI slot limit (about 17 for t3.medium). Prefix Delegation assigns a /28 (16 IPs) to the ENI, giving 16 times the slots. It is applied with a single environment variable line (`ENABLE_PREFIX_DELEGATION=true`). A is possible but costs node replacement and money. C replaces the CNI, breaking VPC SG and routing integration. D requires separate subnet and routing design. Branch: if VPC subnet IP exhaustion is the problem, Custom Networking is the answer.

---

**Question 11.** A SaaS has a machine learning inference workload (average 100ms, 50,000 calls per hour, 3GB memory). What is the cost-optimal compute?

A) Lambda
B) Fargate On-Demand
C) Fargate Spot
D) EC2 + Reserved Instance

**Answer: A**
Explanation: Lambda, billed in 1ms increments, is optimal for short and frequent invocations. 100ms × 50,000 = 5,000 seconds per hour = only about 1.4 hours' worth is billed. Fargate (B, C) bills a minimum of 1 minute, and you pay even for unused time while the Task is up. EC2 (D) is the most expensive, billing one instance for 24 hours. Trap: 3GB memory is within Lambda's limit (10GB). If the limit is exceeded or cold start is a concern, Fargate is the answer. Provisioned Concurrency can nearly eliminate cold start as well.

---

**Question 12.** A company runs EC2 and Fargate at the same time and plans to move workloads from EC2 to Fargate during migration. It wants a 1-year commitment discount, but it must apply to both services and the discount must be maintained during the migration. Which commitment?

A) EC2 Instance Savings Plans
B) Compute Savings Plans
C) Standard Reserved Instance
D) Convertible Reserved Instance

**Answer: B**
Explanation: Only Compute SP applies to EC2 + Fargate + Lambda simultaneously, automatically following within the commitment limit during migration. A fixes the EC2 family and Region, so it cannot apply to Fargate. C and D are RIs, EC2 only. Additionally: the Compute SP discount rate (~66%) is slightly lower than EC2 Instance SP (~72%), but that is the flexibility premium. SP applies automatically, so no separate instance designation is needed. Trap: choosing EC2 Instance SP on a simple unit-price comparison means it does not apply to Fargate.

---

## The SAP-Specific Perspective — Viewing Containers Through Multi-Account, Multi-Region, 7R, and the WA 6 Pillars

The SAP exam's container domain is not simply "which service do you use" but is **combined with SAP-specific perspectives**. Multi-account, Multi-Region, 7R migration, and the Well-Architected 6 Pillars are layered one at a time onto the same EKS and ECS scenarios, so keyword matching alone does not yield the answer.

### Multi-Account — Containers on Top of Organizations, SCP, and Control Tower

Large enterprises operate EKS and ECS clusters **separated by account**: dev, staging, and prod each in their own account, and the data team and payments team in theirs. How to share ECR images and how to tie IAM Roles together cross-account at that point are favorite SAP scenarios.

**Three core patterns**:

1. **ECR Cross-Account Pull**: Push all images to the ECR of a central "shared-services" account, and the ECS Task Execution Role or EKS Node Role in other accounts pulls cross-account. Allow the other accounts' principals with the ECR Repository Policy.
2. **IRSA Cross-Account**: The EKS cluster is in account A and the S3 bucket is in account B. The IAM Role that IRSA maps chains into a Role in account B with sts:AssumeRole.
3. **Enforcing container policy with SCPs**: Enforce guardrails such as "EKS clusters must have IAM Roles Anywhere disabled" or "ECS Task Definitions may only allow the awslogs driver" across all accounts with Organizations SCPs.

> 🎯 **Scenario**: "A company operates 30 accounts on top of Control Tower. dev, staging, and prod each have their own EKS cluster, and container images are built and deployed only from the central account. The operations team wants to enforce that EKS Pods in all accounts cannot pull images directly from the external internet. Which combination?" — The answer is **central account ECR + Repository Policy allowing cross-account pull + SCP blocking external registries + VPC Endpoints (ECR, S3) in each account**. An SCP is a guardrail that enforces denial of IAM permissions, and a VPC Endpoint makes traffic flow only inside AWS.

### Multi-Region — Active/Active vs Active/Passive Container Architecture

Multi-Region patterns for container workloads fall into two branches.

| Pattern | Structure | Suitable for |
|------|------|------|
| **Active/Active** | Identical ECS/EKS clusters in two Regions, Route 53 Latency-based Routing | Global users, low latency |
| **Active/Passive** | One Region operating, another Region as Pilot Light or Warm Standby | DR, low RTO/RPO |

**ECR Cross-Region Replication** is the foundation of both patterns. A push to one Region is automatically replicated to the ECR of another Region, so the DR Region can use the images immediately. **EKS has no cross-region replication of its own**, so the standard pattern is to synchronize workload manifests to both Regions with GitOps (ArgoCD, Flux).

The data layer is the hardest part. Choose among **DynamoDB Global Tables** (multi-region, active-active), **Aurora Global Database** (asynchronous, < 1 second lag), and **S3 Cross-Region Replication** (asynchronous) according to the workload's consistency requirements.

> 📚 **Case**: During the major us-east-1 outage in December 2021, companies with a Multi-Region Active/Active structure (some of Netflix and Stripe) automatically shifted traffic to us-west-2 and minimized the impact. Companies that ran ECS in a single Region only suffered service outages from as short as 4 hours to as long as 9 hours. When SAP emphasizes "RTO within 5 minutes even for a single-Region failure," Active/Active + Route 53 Health Check is the standard answer.

> 🔍 **Going deeper**: The cost of Multi-Region containers cannot be ignored. Running the same workload in two Regions roughly doubles infrastructure cost. To reduce this, lower the activity level with **Pilot Light** (only the DB and minimal infrastructure on standby) or **Warm Standby** (running at a small scale). If the RTO/RPO requirement tolerates minutes, Pilot Light is cost-efficient; if the RTO is in seconds, Active/Active.

### The Place of Containers in the 7R Migration Strategies

The AWS migration 7R framework is as follows.

| R | Meaning | Container mapping |
|---|------|--------------|
| **Retire** | Decommission | - |
| **Retain** | Keep as is | - |
| **Rehost** | Lift & Shift (move without changes) | Move EC2 as is |
| **Relocate** | VMware → AWS VMC | - |
| **Repurchase** | Replace with SaaS | - |
| **Replatform** | Move with small modifications | **Containerization (Docker)** |
| **Refactor** | Redesign the architecture | **Microservices + ECS/EKS** |

Containers are the core tool of Replatform and Refactor. Wrapping a monolithic .war file in a Tomcat container and putting it on ECS is Replatform, and splitting the monolith into 30 microservices and putting them on EKS is Refactor.

> 🎯 **Scenario**: "A company is moving an on-premises monolithic Java application (.war + Tomcat) to AWS. It wants to minimize code changes while reducing operational burden. Which 7R strategy and service combination?" — The answer is **Replatform + ECS Fargate**. Wrap Tomcat + .war in a Dockerfile to containerize it and put it on ECS Fargate. EC2 Rehost leaves the operational burden as is, and EKS Refactor involves large code changes.

> ⚠️ **Pitfall**: "Lift & Shift = ECS Fargate" is a wrong-answer pattern. Containerization is Replatform, not Lift & Shift. Lift & Shift is moving without changes, while containerization requires at least writing a Dockerfile and changing the image build.

### Mapping Container Decisions to the Well-Architected 6 Pillars

| Pillar | Container decisions |
|--------|--------------|
| **Operational Excellence** | Minimize operational burden with App Runner, Fargate, and EKS Auto Mode; debug without SSH using ECS Exec |
| **Security** | Per-Pod least privilege with IRSA and Pod Identity, mTLS with ACM Private CA + App Mesh, ECR Image Scanning |
| **Reliability** | Multi-AZ distribution, ALB Health Check, Multi-Region Active/Active, PodDisruptionBudget |
| **Performance Efficiency** | Automatic selection of the right instance with Karpenter, suitable compute with Graviton and Inferentia |
| **Cost Optimization** | Combination of Fargate Spot, Compute SP, and bin packing; utilization monitoring |
| **Sustainability** | Graviton (+20% power efficiency), reducing idle resources by improving utilization, ARM migration |

> 💡 **Related theory**: The WA 6 Pillars are a tradeoff framework, and one decision affects several Pillars. For example, going with Karpenter Spot 100% scores ⭐⭐⭐ on cost efficiency but drops to ⭐ on reliability. When the SAP exam explicitly says "both cost and reliability," a balanced configuration such as base=2 + Spot 80% becomes the answer. An answer that maximizes only one Pillar is almost always wrong.

## Week 7 Comparison Matrix — When Two Services Look Confusingly Alike

| A | B | Decision criterion (which side?) |
|---|---|----------------------|
| **ECS** vs **EKS** | "K8s standard, multi-cloud portability" → EKS, "AWS-centric, simple" → ECS |
| **Fargate** vs **EC2 Launch Type** | "Zero operations, variable" → Fargate, "High density, 24/7" → EC2 + SP |
| **Cluster Autoscaler** vs **Karpenter** | "Simple ASG" → CA, "Fast, consolidation, automatic Spot" → Karpenter |
| **IRSA** vs **Pod Identity** | "OIDC standard, multi-cloud" → IRSA, "Reuse across multiple clusters" → Pod Identity |
| **Cloud Map** vs **Service Connect** | "Discovery only" → Cloud Map, "ECS + Envoy, metrics" → Service Connect |
| **Service Connect** vs **App Mesh** | "Lightweight" → Service Connect, "mTLS, canary, circuit breaker" → App Mesh |
| **App Runner** vs **ECS Fargate** | "PaaS, zero operations" → App Runner, "Fine-grained control, mesh" → ECS Fargate |
| **ECS Anywhere** vs **EKS Anywhere** | "Control plane in AWS" → ECS Anywhere, "Control plane on-premises, air-gapped" → EKS Anywhere |
| **EC2 Instance SP** vs **Compute SP** | "Maximum discount, EC2 only" → EC2 SP, "Flexibility, multiple services" → Compute SP |
| **Lambda** vs **Fargate** | "Under 5 minutes, short and frequent" → Lambda, "Minutes to hours, variable" → Fargate |

## Week 7 Summary at a Glance

```
Orchestration   ──► ECS (AWS-proprietary) / EKS (K8s standard) / App Runner (PaaS)
Data plane      ──► EC2 Launch / Fargate / Fargate Spot / Anywhere
Scalers         ──► HPA (Pod) / Karpenter (Node, recommended) / Cluster Autoscaler
Pod permissions ──► IRSA (OIDC) / Pod Identity (multi-cluster)
Discovery, mesh ──► Cloud Map (registry) / Service Connect (ECS) / App Mesh (full)
Hybrid          ──► ECS Anywhere (control in AWS) / EKS Anywhere (control on-premises) / Outposts
Cost levers     ──► Fargate Spot (-70%) + Compute SP (-66%) + Graviton (-20%)
Upgrades        ──► EKS one minor at a time, nodes ±1, EBS CSI required from 1.23+
```

## Preview of Next Week

Week 8 is **advanced serverless**. We cover advanced Lambda (layers, extensions, Provisioned Concurrency), Step Functions (workflow orchestration), EventBridge (event routing), DLQ and retry strategies, and event-driven microservice architecture. The Lambda vs Fargate vs EC2 branch judgment we saw today becomes the starting point of Week 8. What happens one level above ECS and EKS (or one level lighter) is next week's theme.

Over the week we have seen all the building blocks of the container domain. If you have developed the sense of immediately eliminating one or two of the four options on the exam, that is enough. The rest is training to narrow the answer candidates by breaking down two or three keywords of the scenario, and that translates directly into points on the next mock exam and the real exam.
