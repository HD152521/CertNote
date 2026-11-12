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

## 📝 Practice Questions

**Question 1.** A defense contractor runs a container-based logistics system on a military network. It is an air-gapped environment in which internet access is completely blocked by military security regulations. It has its own Kubernetes operations team and must use Kubernetes compatible with AWS EKS. What is the most appropriate solution?

A) AWS ECS Anywhere (AWS connectivity required)
B) AWS EKS Anywhere (supports air-gapped environments)
C) EKS on Outposts (Service Link connectivity required)
D) AWS Fargate

**Answer: B**
Explanation: EKS Anywhere is the only AWS solution for operating Kubernetes in an air-gapped environment. It is based on EKS-D, is compatible with standard Kubernetes, and can operate without external connectivity by using Harbor as a local container registry. ECS Anywhere (A) always requires AWS connectivity. EKS on Outposts (C) requires AWS Outposts hardware and a Service Link connection. Fargate (D) runs only in AWS Regions.

---

**Question 2.** A retailer runs microservices on AWS ECS. Some processing must handle customer data only on premises because of the personal information protection law. It has no Kubernetes expertise and wants to keep its existing ECS operating model as much as possible. What is an appropriate solution?

A) EKS Anywhere (on-premises K8s)
B) ECS Anywhere (add on-premises ECS nodes)
C) EKS on Outposts
D) Fargate + VPC Endpoint (process data only inside AWS)

**Answer: B**
Explanation: ECS Anywhere adds on-premises servers to an ECS cluster as External nodes while keeping the existing ECS operating model. You can run tasks on premises while continuing to use existing ECS task definitions, the console, and the CLI. Under the condition of having no K8s expertise, EKS Anywhere (A) or EKS on Outposts (C) is not suitable. Fargate + VPC Endpoint (D) runs in an AWS Region and therefore does not meet the on-premises processing requirement.

---

**Question 3.** A pharmaceutical company runs its on-premises GMP (good manufacturing practice quality control) system as containers on AWS Outposts. The network at the manufacturing facility where Outposts is installed is occasionally unstable, so the AWS Service Link can be disconnected. Even in this situation, the Kubernetes cluster must operate autonomously. What is an appropriate configuration?

A) EKS on Outposts Extended Cluster
B) EKS on Outposts Local Cluster
C) ECS Anywhere (installed on Outposts)
D) EKS Anywhere (vSphere mode)

**Answer: B**
Explanation: In an EKS on Outposts Local Cluster, the Kubernetes control plane (API server, etcd, scheduler) is placed on Outposts. Even if the Service Link is disconnected, the local control plane keeps working, so Pod scheduling, auto-healing, and scaling continue normally. In an Extended Cluster (A), the control plane is in the AWS Region, so new Pods cannot be scheduled when the Service Link is cut. In ECS Anywhere (C), the control plane is in AWS, so new tasks cannot be started when connectivity is lost. EKS Anywhere (D) is deployed on infrastructure owned directly by the customer rather than on Outposts hardware, and it is not AWS-managed.

---

**Question 4.** A company with a multicloud strategy operates AWS EKS, GKE (GCP), and on-premises Kubernetes at the same time. The operations team wants to monitor all clusters from a single dashboard. What is the way to do this in the AWS console without adopting a separate tool?

A) AWS CloudWatch Container Insights (supports AWS clusters only)
B) EKS Connector (connect external K8s clusters to the EKS console)
C) Centralize with Prometheus + Grafana
D) Integrate multicloud with AWS Control Tower

**Answer: B**
Explanation: EKS Connector makes external K8s clusters such as EKS Anywhere, GKE, AKS, and on-premises Kubernetes visible in the AWS EKS console. When you install the Connector agent on each cluster, the cluster status, workloads, and namespaces are displayed in the EKS console. CloudWatch Container Insights (A) supports only container services within AWS (EKS, ECS, Fargate). Prometheus + Grafana (C) are tools outside AWS and do not meet the condition "without adopting a separate tool." Control Tower (D) is an AWS multi-account governance tool, not a multicloud Kubernetes visibility tool.

---

**Question 5.** A retailer wants to run an inventory management container on the server in each of its 500 stores nationwide. The store servers run a mix of Windows and Linux, and it wants to manage all store containers from a central ECS cluster. AWS connectivity is available. What is the most appropriate solution?

A) Create 500 EC2 instances, one for each store
B) ECS Anywhere (register the store servers as External Instances)
C) EKS Anywhere (a K8s cluster per store)
D) AWS Outposts Servers (deploy a 1U server per store)

**Answer: B**
Explanation: ECS Anywhere supports the SSM Agent and the ECS Agent on both Windows and Linux. If you register the 500 store servers with SSM Hybrid Activation, they are managed as External Instances of the central ECS cluster. Deploying new versions, adjusting scale, and monitoring task status can all be handled from a single ECS console. 500 EC2 instances (A) are cloud EC2, not AWS hardware installed in the stores, so they cannot use the on-premises store servers. EKS Anywhere (C) means operating a separate Kubernetes cluster at each of the 500 stores, which is a very heavy operational burden. Outposts Servers (D) is a service in which AWS ships hardware directly to the stores, and the cost is much higher than using the existing store servers.

---

**Question 6.** Between EKS Anywhere and ECS Anywhere, which service more directly fits the requirement "want an AWS-managed control plane but run containers on on-premises hardware"?

A) EKS Anywhere
B) ECS Anywhere
C) Both services meet it equally
D) EKS on Outposts

**Answer: B**
Explanation: In ECS Anywhere, the control plane is in AWS ECS (fully managed) and the data plane (container execution) is on on-premises servers. It exactly satisfies "AWS-managed control plane + on-premises execution." With EKS Anywhere (A), the customer must also operate the control plane. EKS on Outposts (D) requires AWS Outposts hardware and does not use on-premises servers the customer already owns. Under the condition of using existing servers as they are, ECS Anywhere is the most direct answer.
