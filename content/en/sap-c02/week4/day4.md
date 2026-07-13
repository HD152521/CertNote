# Day 4 - EKS Anywhere, ECS Anywhere, Hybrid Containers: Extending Orchestration Boundaries

Container orchestration is central to cloud-native, but not all workloads can run only in public clouds. Enterprise situations frequently require data to reside in specific facilities due to regulations, maximize existing on-premises infrastructure, or run containers in network-isolated environments. AWS provides three approaches to this problem. EKS Anywhere (AWS-quality Kubernetes on-premises), ECS Anywhere (on-premises servers as ECS cluster nodes), and EKS on Outposts (AWS hardware and managed Kubernetes at customer facilities). Today we deeply cover each service's architecture, control plane and data plane separation, operational complexity, and SAP-C02 scenario selection criteria.

## Kubernetes Architecture Review: Control Plane and Data Plane

To understand EKS/ECS Anywhere, first understand container orchestrator structure.

**Control Plane**: The brain of the cluster. Comprises API server (processes kubectl requests), etcd (stores cluster state), scheduler (decides Pod placement on nodes), and controller manager (detects node failures, maintains ReplicaSet).

**Data Plane**: Worker nodes where containers actually run. Includes kubelet (node agent), kube-proxy (network rules), and container runtime (containerd, CRI-O).

In EKS, AWS fully manages the control plane. Users manage only worker nodes (EC2, Fargate, managed node groups). In EKS Anywhere, customers directly operate the control plane on their hardware.

> 💡 **Related Theory**: etcd is a distributed key-value store storing all Kubernetes cluster state. It maintains replication via the Raft consensus algorithm (Ongaro's paper, 2014). Production etcd clusters must comprise at least 3 nodes (1 Leader + 2 Followers) to maintain quorum. In EKS, etcd is replicated in AWS-managed infrastructure, but in EKS Anywhere, customers directly own etcd node availability and backup.

## EKS Anywhere: Standard Kubernetes Anywhere

EKS Anywhere is a solution for deploying and operating Kubernetes clusters on-premises, based on **EKS-D (EKS Distro)**, developed by AWS and open-sourced. EKS-D is the identical Kubernetes version, patches, and component builds AWS uses in public EKS.

```
[EKS Anywhere Architecture]

Customer Data Center:
┌─────────────────────────────────────────────────────┐
│  Control Plane (Customer Operated)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │API Server│ │etcd x3   │ │Scheduler │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  Worker Nodes (Customer Hardware)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Node 1    │ │Node 2    │ │Node 3    │            │
│  │kubelet   │ │kubelet   │ │kubelet   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
          │ Optional connection
          ↓
    AWS Region (EKS Connector, ECR, CloudWatch, etc.)
```

**Supported Infrastructure**: VMware vSphere (most common), Bare Metal, AWS Snow Family, Nutanix, CloudStack, Apache CloudStack.

The most important characteristic of EKS Anywhere is **air-gapped (physically isolated) environment support**. Kubernetes clusters can operate in environments with no internet or AWS connectivity at all. In air-gap mode, local container registries (Harbor, etc.) replace ECR public registry, and Kubernetes updates occur from local mirrors.

> 🔍 **Deeper Dive**: The primary EKS Anywhere installation tool is the **eksctl anywhere** CLI. This tool reads cluster configuration (YAML-based cluster spec) and uses the Cluster API (CAPI) framework to automatically provision Kubernetes nodes on specified infrastructure (vSphere, bare metal, etc.). CAPI is a CNCF project providing Kubernetes-native infrastructure management declaratively. This approach makes EKS Anywhere more than a simple Kubernetes installer—a declarative cluster management tool integrable with GitOps.

### EKS Anywhere Operational Support: Curated Packages

Operating EKS Anywhere clusters requires supplementary tools like monitoring, logging, network policies, and security scanning. AWS provides **EKS Anywhere Curated Packages** offering validated builds of these tools.

Example included packages:
- **Harbor**: Private container registry (essential for air-gap)
- **Emissary Ingress**: Kubernetes Ingress controller
- **Prometheus + Grafana**: Monitoring
- **Cert-Manager**: TLS certificate automation
- **MetalLB**: LoadBalancer service implementation for on-premises

> 📚 **Case Study**: Defense contractor Raytheon Technologies operates EKS Anywhere on air-gap networks. Kubernetes clusters must operate on military-specification networks with completely blocked internet access. Harbor configured as local registry, Prometheus as monitoring stack. Through EKS-D, they use identical Kubernetes versions as AWS EKS while operating completely independently without external connectivity. Occasional connections enable EKS Connector for AWS console cluster status checks.

## ECS Anywhere: AWS Scheduling, Execution On-Premises

ECS Anywhere adopts fundamentally different architecture from EKS Anywhere. **Control plane is AWS-managed ECS**, **data plane is customer on-premises servers**. Installing SSM Agent and ECS Agent on on-premises servers registers them as "External Instances" in ECS clusters.

```
AWS Region:
┌──────────────────────────────────────┐
│  ECS Control Plane (AWS Managed)      │
│  Cluster management, task scheduling  │
└─────────────────────────┬────────────┘
                      │ SSM Hybrid Activation
                      │ (Connection via internet/VPN/DX required)
                      ▼
Customer Data Center:
┌──────────────────────────────────────┐
│  External Instance (on-premises server)│
│  ┌─────────────┐ ┌──────────────┐   │
│  │ SSM Agent   │ │  ECS Agent   │   │
│  └─────────────┘ └──────────────┘   │
│  Docker container execution           │
└──────────────────────────────────────┘
```

ECS Anywhere's advantage is full compatibility with AWS ECS API. Execute tasks on-premises with `aws ecs run-task --launch-type EXTERNAL`, collect metrics via CloudWatch Container Insights, and monitor on-premises task status from ECS console. Existing ECS workflows and tools work unchanged.

> ⚠️ **Pitfall**: ECS Anywhere always requires AWS connectivity. SSM Agent and ECS Agent periodically communicate with AWS to report task status and receive new task instructions. When disconnected, existing running containers continue executing but new task launches, task termination, and status monitoring become impossible. For air-gap environments, use EKS Anywhere instead of ECS Anywhere.

> 💡 **Related Theory**: ECS task scheduling supports three strategies: **Binpack, Random, Spread**. Binpack concentrates tasks on fewer hosts maximizing resource utilization. Spread distributes tasks evenly minimizing single-host failure impact. These scheduling strategies apply to External Instances in ECS Anywhere too, with task placement based on on-premises server CPU/memory capacity.

## EKS on Outposts: AWS-Managed Kubernetes at Customer Facilities

EKS on Outposts runs EKS control plane and worker nodes on Outposts hardware. Two deployment modes exist.

**Extended Cluster**: EKS control plane resides in AWS region with worker nodes (EC2 instances) placed on Outposts. With control plane in AWS region, if Service Link breaks, new Pod scheduling becomes impossible. Existing running Pods continue operating.

**Local Cluster**: The EKS control plane itself is deployed on Outposts. Even if Service Link breaks, the cluster operates fully autonomously. For control plane high availability, 3 control plane instances deploy on Outposts.

| Item | Extended Cluster | Local Cluster |
|------|-----------------|---------------|
| Control Plane Location | AWS Region | Outposts |
| Service Link Dependency | High | Low (minimized) |
| Management Complexity | Low | Medium |
| Network Disconnection Resilience | Low | High |
| Cost | Low | Outposts additional instance costs |

> 🎯 **Scenario**: A South Korean defense contractor containerized military logistics systems. Some data must be processed only on military networks, with Kubernetes running on Outposts in military data centers. The AWS team didn't want to directly operate K8s control planes. Choosing EKS on Outposts Local Cluster places the control plane on Outposts, managed by AWS. In military data center network disconnection situations, Local Cluster operates autonomously.

## Deep Comparison of Three Services

| Item | EKS Anywhere | ECS Anywhere | EKS on Outposts |
|------|-------------|-------------|-----------------|
| Control Plane Location | Customer hardware | AWS region | AWS region (Extended) or Outposts (Local) |
| Control Plane Management | Customer direct | AWS fully managed | AWS fully managed |
| Air-gap Support | Supported | Not supported | Local Cluster partially supported |
| Standard | CNCF Kubernetes | ECS proprietary | CNCF Kubernetes |
| Hardware | Customer owned (vSphere, Bare Metal) | Customer owned (any OS) | AWS Outposts hardware |
| AWS Connectivity Requirement | Optional | Required | Service Link (some features) |
| Operational Complexity | High (includes CP operation) | Low (CP is AWS) | Medium (hardware management needed) |
| Cost | Subscription (if supported) + hardware | ECS task charges | Outposts + EKS charges |

## EKS Connector: Single Window for All Kubernetes

EKS Connector is functionality for visualizing EKS Anywhere or other Kubernetes distributions (GKE, AKS, On-Prem K8s) in AWS console. Installing Connector agent on clusters displays cluster information, workload status, and namespaces in EKS console.

```
GKE Cluster (GCP)
    │ EKS Connector agent
AKS Cluster (Azure)
    │ EKS Connector agent
EKS Anywhere Cluster
    │ EKS Connector agent
                └──────────────> AWS EKS Console (single window)
```

Connector provides read-only visibility. You cannot make direct changes from AWS console to other clouds' Kubernetes clusters. Multi-cloud operations teams use it for monitoring multiple clusters from single console.

> 🔍 **Deeper Dive**: EKS Connector operates via outbound connections. Agents within clusters connect to AWS through AWS Systems Manager Session Manager. Even if firewalls block inbound connections, if outbound HTTPS is allowed, EKS Connector works. This pattern mirrors how SSM Agent manages EC2 instances via Session Manager.

## SSM Hybrid: Integrated AWS Management of On-Premises Servers

**SSM Hybrid Activation**, the foundational technology for ECS Anywhere, sees broader use. On-premises servers, virtual machines, and other cloud EC2 instances can be registered as AWS Systems Manager management targets.

```bash
# Create SSM Hybrid Activation
aws ssm create-activation \
  --iam-role "SSMServiceRole" \
  --registration-limit 50 \
  --description "OnPrem Servers" \
  --region ap-northeast-2

# Output: ActivationId, ActivationCode

# Run on on-premises server (Linux)
sudo amazon-ssm-agent -register \
  -code ${ActivationCode} \
  -id ${ActivationId} \
  -region ap-northeast-2

# After registration: Patch, inventory, Session Manager available in SSM Fleet Manager
```

On-premises servers registered via SSM Hybrid are managed from AWS console Fleet Manager identically to EC2 instances. Automate OS patches via Patch Manager, access terminals via Session Manager without SSH, and collect installed software inventories via Inventory.

## AWS Fargate vs On-Premises Containers

| Item | AWS Fargate | ECS Anywhere | EKS Anywhere |
|------|-------------|-------------|-------------|
| Infrastructure Management | Fully serverless | Customer server management | Customer server + K8s CP |
| Location | AWS Region | On-premises | On-premises |
| Operational Burden | Minimal | Medium | High |
| Regulated Data Sovereignty | Not satisfied (AWS region) | Possible to satisfy | Possible to satisfy |
| Air-gap | Not possible | Not possible | Possible |

> 💡 **Related Theory**: Fargate's "serverless container" model, announced by AWS in 2017, allows users to specify only CPU and memory size without node management, letting AWS automatically allocate infrastructure. Fargate bills by vCPU, making it cost-effective for intermittent workloads. Conversely, fixed-traffic long-running containers are more cost-effective with EC2 node groups. For enterprises already owning on-premises hardware, ECS/EKS Anywhere models pay only additional orchestration costs without hardware.

## Comparison with Other Clouds

| Item | AWS EKS Anywhere | GCP Anthos | Azure Arc |
|------|----------------|-----------|-----------|
| Kubernetes Standard | EKS-D (Upstream K8s) | GKE on-prem | Standard K8s |
| Control Plane Location | Customer infrastructure | Google Cloud or customer | Azure |
| Air-gap | Supported | Supported | Supported |
| Non-Container Management | Limited | VMs, databases included | VMs, data services included |
| Pricing Model | Subscription + open-source | Subscription | Azure Arc data services charges |

> 📚 **Case Study**: Google Anthos, launched in 2019, entered the market earlier than AWS EKS Anywhere. Anthos provides broader platform integration beyond Kubernetes, including VMs, databases, and service mesh (Anthos Service Mesh = Istio). AWS EKS Anywhere focuses on container orchestration, emphasizing simplicity and EKS compatibility as strengths. While Anthos's broad service scope offers advantages, it carries reputation for higher operational complexity.

## Hands-On CLI: ECS Anywhere and EKS Anywhere Configuration

```bash
# === ECS Anywhere Setup ===

# 1. Create ECS cluster
aws ecs create-cluster --cluster-name hybrid-cluster

# 2. Create SSM Hybrid Activation
ACTIVATION=$(aws ssm create-activation \
  --iam-role "AmazonEC2ContainerServiceforEC2Role" \
  --registration-limit 10 \
  --region ap-northeast-2 \
  --output json)

ACTIVATION_CODE=$(echo $ACTIVATION | jq -r '.ActivationCode')
ACTIVATION_ID=$(echo $ACTIVATION | jq -r '.ActivationId')

# 3. Execute on on-premises server (Linux)
curl -o /tmp/ecs-anywhere-install.sh \
  https://amazon-ecs-agent.s3.amazonaws.com/ecs-anywhere-install-latest.sh

sudo bash /tmp/ecs-anywhere-install.sh \
  --region ap-northeast-2 \
  --cluster hybrid-cluster \
  --activation-id $ACTIVATION_ID \
  --activation-code $ACTIVATION_CODE

# 4. Execute External task (runs on-premises)
aws ecs run-task \
  --cluster hybrid-cluster \
  --task-definition my-task:1 \
  --launch-type EXTERNAL \
  --count 2

# === EKS Anywhere Setup ===

# After eksctl anywhere installation
eksctl anywhere create cluster \
  -f cluster.yaml  # vSphere or bare metal cluster spec

# cluster.yaml example (vSphere)
cat > cluster.yaml << 'EOF'
apiVersion: anywhere.eks.amazonaws.com/v1alpha1
kind: Cluster
metadata:
  name: prod-onprem-cluster
spec:
  kubernetesVersion: "1.28"
  controlPlaneConfiguration:
    count: 3
    endpoint:
      host: "192.168.1.10"
    machineGroupRef:
      name: cp-machine-group
  workerNodeGroupConfigurations:
  - count: 5
    machineGroupRef:
      name: worker-machine-group
EOF

# Register EKS Connector (EKS Anywhere → AWS console visualization)
eksctl register cluster \
  --name prod-onprem-cluster \
  --provider EKS_ANYWHERE \
  --region ap-northeast-2
```

## SAP-C02 Scenario Selection Guide

When hybrid container problems appear on the exam, ask these questions in order.

1. **Is it an air-gap (internet/AWS connection-free) environment?** → YES: EKS Anywhere
2. **Should AWS manage the control plane?** → YES: ECS Anywhere or EKS on Outposts
3. **Is data sovereignty + AWS-managed K8s required?** → EKS on Outposts
4. **Are you using existing ECS and adding on-premises nodes?** → ECS Anywhere
5. **Do you have in-house K8s operations teams needing standard Kubernetes?** → EKS Anywhere

Internalizing this decision tree lets you correctly answer 4 out of 5 SAP-C02 hybrid container scenario questions at first judgment.

---

## 📝 연습 문제

**문제 1.** 방위산업체가 군용 네트워크에서 컨테이너 기반 물류 시스템을 운영한다. 군 보안 규정으로 인터넷 접근이 완전히 차단된 에어갭 환경이다. 자체 Kubernetes 운영팀이 있으며, AWS EKS와 호환되는 Kubernetes를 사용해야 한다. 가장 적합한 솔루션은?

A) AWS ECS Anywhere (AWS 연결 필수)
B) AWS EKS Anywhere (에어갭 지원)
C) EKS on Outposts (Service Link 연결 필요)
D) AWS Fargate

**정답: B**
해설: 에어갭 환경에서 Kubernetes를 운영하는 유일한 AWS 솔루션이 EKS Anywhere다. EKS-D 기반으로 표준 Kubernetes와 호환되고, Harbor를 로컬 컨테이너 레지스트리로 사용해 외부 연결 없이 운영 가능하다. ECS Anywhere(A)는 AWS 연결이 항상 필요하다. EKS on Outposts(C)는 AWS Outposts 하드웨어가 필요하고 Service Link 연결이 필요하다. Fargate(D)는 AWS 리전에서만 실행된다.

---

**문제 2.** 유통 기업이 AWS ECS로 마이크로서비스를 운영한다. 일부 처리가 개인정보보호법으로 고객 데이터를 온프레미스에서만 처리해야 한다. Kubernetes 전문 인력이 없으며 기존 ECS 운영 방식을 최대한 유지하고 싶다. 적합한 솔루션은?

A) EKS Anywhere (온프레미스 K8s)
B) ECS Anywhere (온프레미스 ECS 노드 추가)
C) EKS on Outposts
D) Fargate + VPC Endpoint (데이터를 AWS 내에서만 처리)

**정답: B**
해설: 기존 ECS 운영 방식을 유지하면서 온프레미스 서버를 ECS 클러스터에 External 노드로 추가하는 것이 ECS Anywhere다. 기존 ECS 태스크 정의, 콘솔, CLI를 그대로 사용하면서 태스크를 온프레미스에서 실행할 수 있다. K8s 전문 인력이 없는 조건에서 EKS Anywhere(A)나 EKS on Outposts(C)는 적합하지 않다. Fargate + VPC Endpoint(D)는 AWS 리전에서 실행되므로 온프레미스 처리 요건을 충족하지 않는다.

---

**문제 3.** 제약회사가 온프레미스 GMP(의약품 제조 품질 관리) 시스템을 AWS Outposts에서 컨테이너로 운영한다. Outposts가 설치된 제조시설의 네트워크가 간혹 불안정해 AWS Service Link가 단절될 수 있다. 이 상황에서도 Kubernetes 클러스터가 자율적으로 동작해야 한다. 적합한 구성은?

A) EKS on Outposts Extended Cluster
B) EKS on Outposts Local Cluster
C) ECS Anywhere (Outposts에 설치)
D) EKS Anywhere (vSphere 모드)

**정답: B**
해설: EKS on Outposts Local Cluster는 Kubernetes 제어 평면(API 서버, etcd, 스케줄러)이 Outposts에 배치된다. Service Link가 끊어져도 로컬 제어 평면이 계속 작동해 Pod 스케줄링, 오토힐링, 스케일링이 정상 동작한다. Extended Cluster(A)는 제어 평면이 AWS 리전에 있어 Service Link 단절 시 새 Pod 스케줄링이 불가능하다. ECS Anywhere(C)는 제어 평면이 AWS에 있어 연결 단절 시 새 태스크 시작이 불가능하다. EKS Anywhere(D)는 Outposts 하드웨어가 아닌 고객 직접 소유 인프라에 배포하는 것이고, AWS Managed가 아니다.

---

**문제 4.** 멀티클라우드 전략을 사용하는 기업이 AWS EKS, GKE(GCP), On-Premise Kubernetes를 동시에 운영한다. 운영팀이 단일 대시보드에서 모든 클러스터를 모니터링하고 싶다. 별도 도구 도입 없이 AWS 콘솔에서 해결하는 방법은?

A) AWS CloudWatch Container Insights (AWS 클러스터만 지원)
B) EKS Connector (외부 K8s 클러스터를 EKS 콘솔에 연결)
C) Prometheus + Grafana 중앙화
D) AWS Control Tower로 멀티클라우드 통합

**정답: B**
해설: EKS Connector는 EKS Anywhere, GKE, AKS, On-Premise Kubernetes 등 외부 K8s 클러스터를 AWS EKS 콘솔에서 가시화한다. Connector 에이전트를 각 클러스터에 설치하면 클러스터 상태, 워크로드, 네임스페이스가 EKS 콘솔에 표시된다. CloudWatch Container Insights(A)는 AWS 내 컨테이너 서비스(EKS, ECS, Fargate)만 지원한다. Prometheus + Grafana(C)는 AWS 외부 도구로 "별도 도구 도입 없이"라는 조건에 맞지 않는다. Control Tower(D)는 AWS 멀티계정 거버넌스 도구이지 멀티클라우드 Kubernetes 가시화 도구가 아니다.

---

**문제 5.** 소매 기업이 전국 500개 매장의 각 서버에서 재고 관리 컨테이너를 실행하려 한다. 각 매장 서버에는 Windows 또는 Linux가 혼재되어 있으며, 중앙 ECS 클러스터에서 모든 매장 컨테이너를 관리하고 싶다. AWS 연결은 가능하다. 가장 적합한 솔루션은?

A) 각 매장에 EC2 인스턴스 500개 생성
B) ECS Anywhere (매장 서버를 External Instance로 등록)
C) EKS Anywhere (매장별 K8s 클러스터)
D) AWS Outposts Servers (매장별 1U 서버 배포)

**정답: B**
해설: ECS Anywhere는 Windows와 Linux 모두 SSM Agent와 ECS Agent를 지원한다. 500개 매장 서버를 SSM Hybrid Activation으로 등록하면 중앙 ECS 클러스터의 External Instance로 관리된다. 새 버전 배포, 스케일 조정, 태스크 상태 모니터링을 단일 ECS 콘솔에서 처리할 수 있다. EC2 500개(A)는 매장에 AWS 하드웨어를 설치하는 것이 아니라 클라우드 EC2이므로 온프레미스 매장 서버를 활용하지 못한다. EKS Anywhere(C)는 500개 매장에 각자 Kubernetes 클러스터를 운영하는 것으로 운영 부담이 매우 크다. Outposts Servers(D)는 AWS가 매장에 하드웨어를 직접 배송하는 서비스로, 기존 매장 서버 활용보다 비용이 크게 높다.

---

**문제 6.** EKS Anywhere와 ECS Anywhere 중 "AWS 관리 제어 평면을 원하지만 온프레미스 하드웨어에서 컨테이너를 실행하고 싶다"는 요구사항에 더 직접적으로 맞는 서비스는?

A) EKS Anywhere
B) ECS Anywhere
C) 두 서비스 모두 동일하게 충족
D) EKS on Outposts

**정답: B**
해설: ECS Anywhere는 제어 평면이 AWS ECS(완전 관리됨)에 있고 데이터 평면(컨테이너 실행)이 온프레미스 서버에 있다. "AWS 관리 제어 평면 + 온프레미스 실행"을 정확히 충족한다. EKS Anywhere(A)는 제어 평면도 고객이 직접 운영해야 한다. EKS on Outposts(D)는 AWS Outposts 하드웨어가 필요하고, 고객이 이미 보유한 온프레미스 서버를 활용하는 것이 아니다. 기존 서버를 그대로 활용하는 조건에서 ECS Anywhere가 가장 직접적인 답이다.
