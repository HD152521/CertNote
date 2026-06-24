# Day 4 - EKS Anywhere, ECS Anywhere, 하이브리드 컨테이너: 오케스트레이션의 경계 확장

컨테이너 오케스트레이션은 클라우드 네이티브의 핵심이지만, 모든 워크로드가 퍼블릭 클라우드에서만 실행될 수는 없다. 규제로 인해 데이터가 특정 시설에 있어야 하거나, 기존 온프레미스 인프라를 최대한 활용해야 하거나, 네트워크가 단절된 환경에서도 컨테이너를 운영해야 하는 상황이 실제 엔터프라이즈에서 빈번하게 발생한다. AWS는 이 문제에 대해 세 가지 접근법을 제공한다. EKS Anywhere(온프레미스에 AWS 품질의 Kubernetes), ECS Anywhere(온프레미스 서버를 ECS 클러스터의 노드로), EKS on Outposts(AWS 하드웨어와 AWS 관리 Kubernetes를 고객 시설에). 오늘은 각 서비스의 아키텍처, 제어 평면과 데이터 평면의 분리, 운영 복잡성, SAP-C02 시나리오 선택 기준을 깊이 다룬다.

## Kubernetes 아키텍처 복습: 제어 평면과 데이터 평면

EKS/ECS Anywhere를 이해하려면 컨테이너 오케스트레이터의 구조를 먼저 이해해야 한다.

**제어 평면(Control Plane)**: 클러스터의 두뇌. API 서버(kubectl 요청 처리), etcd(클러스터 상태 저장), 스케줄러(어느 노드에 Pod를 배치할지 결정), 컨트롤러 매니저(노드 실패 감지, ReplicaSet 유지)로 구성된다.

**데이터 평면(Data Plane)**: 실제 컨테이너가 실행되는 워커 노드. kubelet(노드 에이전트), kube-proxy(네트워크 규칙), 컨테이너 런타임(containerd, CRI-O)이 포함된다.

EKS에서 제어 평면은 AWS가 완전 관리한다. 사용자는 워커 노드(EC2, Fargate, 관리형 노드 그룹)만 관리한다. EKS Anywhere에서는 제어 평면도 고객이 자신의 하드웨어에서 직접 운영한다.

> 💡 **관련 이론**: etcd는 분산 키-값 스토어로 Kubernetes 클러스터의 모든 상태를 저장한다. Raft 합의 알고리즘(Diego Ongaro의 논문, 2014)으로 복제를 유지한다. 프로덕션 etcd 클러스터는 최소 3개 노드(1 Leader + 2 Follower)로 구성해 과반수(quorum)를 유지해야 한다. EKS에서는 etcd가 AWS 관리 인프라에 복제되지만, EKS Anywhere에서는 고객이 etcd 노드의 가용성과 백업을 직접 책임진다.

## EKS Anywhere: 표준 Kubernetes를 어디서나

EKS Anywhere는 AWS가 개발하고 오픈소스로 공개한 **EKS-D(EKS Distro)**를 기반으로 온프레미스에 Kubernetes 클러스터를 배포하고 운영하는 솔루션이다. EKS-D는 AWS가 퍼블릭 EKS에서 사용하는 것과 동일한 Kubernetes 버전, 패치, 컴포넌트 빌드다.

```
[EKS Anywhere 아키텍처]

고객 데이터센터:
┌─────────────────────────────────────────────────────┐
│  Control Plane (고객 운영)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │API 서버  │ │etcd x3   │ │스케줄러  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  Worker Nodes (고객 하드웨어)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Node 1    │ │Node 2    │ │Node 3    │            │
│  │kubelet   │ │kubelet   │ │kubelet   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
          │ 선택적 연결
          ↓
    AWS 리전 (EKS Connector, ECR, CloudWatch 등)
```

**지원 인프라**: VMware vSphere(가장 일반적), Bare Metal, AWS Snow Family, Nutanix, CloudStack, Apache CloudStack.

EKS Anywhere의 가장 중요한 특성은 **Air-Gapped(에어갭, 물리적 격리) 환경 지원**이다. 인터넷이나 AWS 연결이 전혀 없는 환경에서도 Kubernetes 클러스터를 운영할 수 있다. 에어갭 모드에서는 ECR 퍼블릭 레지스트리 대신 로컬 컨테이너 레지스트리(Harbor 등)를 사용하고, Kubernetes 업데이트도 로컬 미러에서 이루어진다.

> 🔍 **더 깊이**: EKS Anywhere를 설치하는 주요 도구는 **eksctl anywhere** CLI다. 이 도구는 클러스터 구성(YAML 기반 클러스터 스펙)을 읽고 Cluster API(CAPI) 프레임워크를 사용해 지정된 인프라(vSphere, 베어메탈 등)에 Kubernetes 노드를 자동으로 프로비저닝한다. CAPI는 CNCF 프로젝트로 Kubernetes-native 방식으로 인프라를 선언적으로 관리한다. 이 접근법이 EKS Anywhere를 단순 Kubernetes 설치 도구가 아니라 GitOps와 통합 가능한 선언적 클러스터 관리 도구로 만든다.

### EKS Anywhere 운영 지원: Curated Packages

EKS Anywhere 클러스터를 운영하려면 모니터링, 로깅, 네트워크 정책, 보안 스캔 같은 부가 도구가 필요하다. AWS는 **EKS Anywhere Curated Packages**로 이러한 도구들의 검증된 빌드를 제공한다.

포함된 패키지 예시:
- **Harbor**: 프라이빗 컨테이너 레지스트리 (에어갭 환경 필수)
- **Emissary Ingress**: Kubernetes Ingress 컨트롤러
- **Prometheus + Grafana**: 모니터링
- **Cert-Manager**: TLS 인증서 자동화
- **MetalLB**: 온프레미스 환경의 LoadBalancer 서비스 구현

> 📚 **사례**: 방산 업체 Raytheon Technologies가 EKS Anywhere를 에어갭 네트워크에서 운영한다. 군사 규격 네트워크에서 인터넷 접근이 완전 차단된 상태로 Kubernetes 클러스터를 운영해야 했다. Harbor를 로컬 레지스트리로, Prometheus를 모니터링 스택으로 구성했다. EKS-D를 통해 AWS EKS와 동일한 Kubernetes 버전을 사용하면서도 외부 연결 없이 완전 자체 운영이 가능했다. 가끔 연결이 허용될 때 EKS Connector를 통해 AWS 콘솔에서 클러스터 상태를 확인한다.

## ECS Anywhere: AWS가 스케줄링, 실행은 온프레미스

ECS Anywhere는 EKS Anywhere와 근본적으로 다른 아키텍처를 채택한다. **제어 평면은 AWS 관리 ECS**, **데이터 평면은 고객 온프레미스 서버**다. 온프레미스 서버에 SSM Agent와 ECS Agent를 설치하면 그 서버가 ECS 클러스터의 "External Instance"로 등록된다.

```
AWS 리전:
┌──────────────────────────────────────┐
│  ECS Control Plane (AWS Managed)      │
│  클러스터 관리, 태스크 스케줄링        │
└─────────────────────┬────────────────┘
                      │ SSM Hybrid Activation
                      │ (인터넷 또는 VPN/DX 통해 연결 필요)
                      ▼
고객 데이터센터:
┌──────────────────────────────────────┐
│  External Instance (온프레미스 서버)  │
│  ┌─────────────┐ ┌──────────────┐   │
│  │ SSM Agent   │ │  ECS Agent   │   │
│  └─────────────┘ └──────────────┘   │
│  Docker 컨테이너 실행                 │
└──────────────────────────────────────┘
```

ECS Anywhere의 장점은 AWS ECS API와 완전 호환된다는 점이다. `aws ecs run-task --launch-type EXTERNAL`로 태스크를 온프레미스에 실행하고, CloudWatch Container Insights로 메트릭을 수집하며, ECS 콘솔에서 온프레미스 태스크 상태를 확인한다. 기존 ECS 워크플로와 도구를 그대로 사용할 수 있다.

> ⚠️ **함정**: ECS Anywhere는 항상 AWS와 연결이 필요하다. SSM Agent와 ECS Agent가 주기적으로 AWS와 통신해 태스크 상태를 보고하고 새 태스크 지시를 받는다. 연결이 끊어지면 기존 실행 중인 컨테이너는 계속 실행되지만 새 태스크 시작, 태스크 종료, 상태 모니터링이 불가능해진다. 에어갭 환경에서는 ECS Anywhere가 아닌 EKS Anywhere를 사용해야 한다.

> 💡 **관련 이론**: ECS의 태스크 스케줄링은 **Binpack, Random, Spread** 세 가지 전략을 지원한다. Binpack은 가능한 적은 수의 호스트에 태스크를 집중해 리소스 활용을 최대화한다. Spread는 태스크를 고르게 분산해 단일 호스트 장애 시 영향을 최소화한다. ECS Anywhere에서 External Instance에도 이 스케줄링 전략이 적용되며, 온프레미스 서버의 CPU/메모리 용량을 기반으로 태스크가 배치된다.

## EKS on Outposts: AWS Managed Kubernetes를 고객 시설에

EKS on Outposts는 Outposts 하드웨어 위에서 EKS 제어 평면과 워커 노드를 실행한다. 두 가지 배포 모드가 있다.

**Extended Cluster**: EKS 제어 평면은 AWS 리전에 있고, 워커 노드(EC2 인스턴스)만 Outposts에 배치된다. 제어 평면이 AWS 리전에 있으므로 Service Link가 끊어지면 새 Pod 스케줄링이 불가능하다. 기존 실행 중인 Pod는 계속 동작한다.

**Local Cluster**: EKS 제어 평면 자체가 Outposts에 배치된다. Service Link가 끊어져도 클러스터가 완전히 자율적으로 동작한다. 제어 평면 고가용성을 위해 Outposts 위에 3개 제어 평면 인스턴스가 배포된다.

| 항목 | Extended Cluster | Local Cluster |
|------|-----------------|---------------|
| 제어 평면 위치 | AWS 리전 | Outposts |
| Service Link 의존성 | 높음 | 낮음(최소화) |
| 관리 복잡성 | 낮음 | 중간 |
| 네트워크 단절 내성 | 낮음 | 높음 |
| 비용 | 낮음 | Outposts 추가 인스턴스 비용 |

> 🎯 **시나리오**: 한국 방위산업체가 군용 물류 시스템을 컨테이너화했다. 일부 데이터가 군 네트워크에서만 처리되어야 하고, 군 데이터센터에 설치된 Outposts 위에서 Kubernetes가 실행되어야 한다. AWS 관리팀이 K8s 제어 평면 운영을 직접 담당하고 싶지 않다. EKS on Outposts Local Cluster를 선택하면 제어 평면까지 Outposts에 있고 AWS가 관리한다. 군 데이터센터의 네트워크 단절 상황에서도 Local Cluster가 자율적으로 동작한다.

## 세 서비스 심층 비교표

| 항목 | EKS Anywhere | ECS Anywhere | EKS on Outposts |
|------|-------------|-------------|-----------------|
| 제어 평면 위치 | 고객 하드웨어 | AWS 리전 | AWS 리전(Extended) or Outposts(Local) |
| 제어 평면 관리 | 고객 직접 | AWS 완전 관리 | AWS 완전 관리 |
| 에어갭 지원 | 지원 | 미지원 | Local Cluster 부분 지원 |
| 표준 | CNCF Kubernetes | ECS 독자 | CNCF Kubernetes |
| 하드웨어 | 고객 소유 (vSphere, Bare Metal) | 고객 소유 (어떤 OS든) | AWS Outposts 하드웨어 |
| AWS 연결 요구 | 선택적 | 필수 | Service Link (일부 기능) |
| 운영 복잡성 | 높음 (CP 운영 포함) | 낮음 (CP는 AWS) | 중간 (하드웨어 관리 필요) |
| 비용 | 구독료(지원 받을 경우) + 하드웨어 | ECS 태스크 요금 | Outposts + EKS 요금 |

## EKS Connector: 모든 Kubernetes를 단일 창에서

EKS Connector는 EKS Anywhere나 다른 Kubernetes 배포판(GKE, AKS, On-Prem K8s)을 AWS 콘솔에서 가시화하는 기능이다. Connector 에이전트를 클러스터에 설치하면 클러스터 정보, 워크로드 상태, 네임스페이스가 EKS 콘솔에 표시된다.

```
GKE 클러스터 (GCP)
    │ EKS Connector 에이전트
AKS 클러스터 (Azure)
    │ EKS Connector 에이전트
EKS Anywhere 클러스터
    │ EKS Connector 에이전트
                └──────────────> AWS EKS 콘솔 (단일 창)
```

Connector는 읽기 전용 가시화를 제공한다. 다른 클라우드의 Kubernetes 클러스터에 AWS 콘솔에서 직접 변경을 가할 수 없다. 멀티클라우드 운영팀이 여러 클러스터를 단일 콘솔에서 모니터링하는 용도다.

> 🔍 **더 깊이**: EKS Connector는 아웃바운드 연결 기반으로 동작한다. 클러스터 내 에이전트가 AWS Systems Manager Session Manager를 통해 AWS에 연결한다. 방화벽이 인바운드 연결을 차단해도 아웃바운드 HTTPS만 허용하면 EKS Connector가 동작한다. 이 패턴은 SSM Agent가 EC2 인스턴스를 Session Manager로 관리하는 것과 동일한 원리다.

## SSM Hybrid: 온프레미스 서버의 AWS 통합 관리

ECS Anywhere의 기반 기술인 **SSM Hybrid Activation**은 더 넓은 용도로 사용된다. 온프레미스 서버, 가상 머신, 다른 클라우드 EC2를 AWS Systems Manager의 관리 대상으로 등록할 수 있다.

```bash
# SSM Hybrid Activation 생성
aws ssm create-activation \
  --iam-role "SSMServiceRole" \
  --registration-limit 50 \
  --description "OnPrem Servers" \
  --region ap-northeast-2

# 출력: ActivationId, ActivationCode

# 온프레미스 서버에서 (Linux)
sudo amazon-ssm-agent -register \
  -code ${ActivationCode} \
  -id ${ActivationId} \
  -region ap-northeast-2

# 등록 후: SSM Fleet Manager에서 패치, 인벤토리, Session Manager 사용 가능
```

SSM Hybrid로 등록된 온프레미스 서버는 AWS 콘솔의 Fleet Manager에서 EC2 인스턴스와 동일하게 관리된다. Patch Manager로 OS 패치를 자동화하고, Session Manager로 SSH 없이 터미널에 접근하며, Inventory로 설치된 소프트웨어 목록을 수집한다.

## AWS Fargate vs 온프레미스 컨테이너

| 항목 | AWS Fargate | ECS Anywhere | EKS Anywhere |
|------|-------------|-------------|-------------|
| 인프라 관리 | 완전 serverless | 고객 서버 관리 | 고객 서버 + K8s CP |
| 위치 | AWS 리전 | 온프레미스 | 온프레미스 |
| 운영 부담 | 최소 | 중간 | 높음 |
| 규제 데이터 주권 | 미충족(AWS 리전) | 충족 가능 | 충족 가능 |
| Air-gap | 불가 | 불가 | 가능 |

> 💡 **관련 이론**: Fargate의 "Serverless 컨테이너" 모델은 AWS가 2017년 발표한 것으로, 사용자가 노드 관리 없이 CPU와 메모리 크기만 지정하면 AWS가 자동으로 인프라를 할당한다. Fargate는 vCPU 단위로 과금되므로 간헐적 워크로드에서 비용 효율이 높다. 반면 고정 트래픽의 긴 실행 컨테이너는 EC2 노드 그룹이 더 비용 효율적이다. 온프레미스 하드웨어를 이미 소유한 기업에서는 ECS/EKS Anywhere가 하드웨어 비용 없이 추가 오케스트레이션 비용만 지불하는 모델이다.

## 다른 클라우드와의 비교

| 항목 | AWS EKS Anywhere | GCP Anthos | Azure Arc |
|------|----------------|-----------|-----------|
| Kubernetes 표준 | EKS-D (Upstream K8s) | GKE on-prem | 표준 K8s |
| 제어 평면 위치 | 고객 인프라 | Google Cloud or 고객 | Azure |
| Air-gap | 지원 | 지원 | 지원 |
| 컨테이너 외 관리 | 제한적 | VM, 데이터베이스 포함 | VM, 데이터 서비스 포함 |
| 가격 모델 | 구독료 + 오픈소스 | 구독료 | Azure Arc 데이터 서비스 요금 |

> 📚 **사례**: Google Anthos는 2019년 출시돼 AWS EKS Anywhere보다 일찍 시장에 진입했다. Anthos는 Kubernetes뿐만 아니라 VM, 데이터베이스, 서비스 메시(Anthos Service Mesh = Istio)까지 통합 관리하는 더 넓은 플랫폼이다. AWS EKS Anywhere는 컨테이너 오케스트레이션에 집중해 단순성과 EKS 호환성을 강점으로 삼는다. Anthos의 광범위한 서비스 범위가 장점이지만, 그만큼 운영 복잡성도 높다는 평가가 있다.

## 실전 CLI: ECS Anywhere 및 EKS Anywhere 구성

```bash
# === ECS Anywhere 설정 ===

# 1. ECS 클러스터 생성
aws ecs create-cluster --cluster-name hybrid-cluster

# 2. SSM Hybrid Activation 생성
ACTIVATION=$(aws ssm create-activation \
  --iam-role "AmazonEC2ContainerServiceforEC2Role" \
  --registration-limit 10 \
  --region ap-northeast-2 \
  --output json)

ACTIVATION_CODE=$(echo $ACTIVATION | jq -r '.ActivationCode')
ACTIVATION_ID=$(echo $ACTIVATION | jq -r '.ActivationId')

# 3. 온프레미스 서버에서 실행 (Linux)
curl -o /tmp/ecs-anywhere-install.sh \
  https://amazon-ecs-agent.s3.amazonaws.com/ecs-anywhere-install-latest.sh

sudo bash /tmp/ecs-anywhere-install.sh \
  --region ap-northeast-2 \
  --cluster hybrid-cluster \
  --activation-id $ACTIVATION_ID \
  --activation-code $ACTIVATION_CODE

# 4. External 태스크 실행 (온프레미스에서 실행됨)
aws ecs run-task \
  --cluster hybrid-cluster \
  --task-definition my-task:1 \
  --launch-type EXTERNAL \
  --count 2

# === EKS Anywhere 설정 ===

# eksctl anywhere 설치 후
eksctl anywhere create cluster \
  -f cluster.yaml  # vSphere 또는 베어메탈 클러스터 스펙

# cluster.yaml 예시 (vSphere)
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

# EKS Connector 등록 (EKS Anywhere → AWS 콘솔 가시화)
eksctl register cluster \
  --name prod-onprem-cluster \
  --provider EKS_ANYWHERE \
  --region ap-northeast-2
```

## SAP-C02 시나리오 선택 가이드

시험에서 하이브리드 컨테이너 문제가 나오면 다음 질문을 순서대로 물어본다.

1. **에어갭(인터넷/AWS 연결 없는) 환경인가?** → YES: EKS Anywhere
2. **AWS가 제어 평면을 관리해야 하는가?** → YES: ECS Anywhere 또는 EKS on Outposts
3. **데이터 주권 + AWS 관리 K8s가 필요한가?** → EKS on Outposts
4. **기존 ECS를 사용 중이고 온프레미스 노드를 추가하는 것인가?** → ECS Anywhere
5. **자체 K8s 운영 팀이 있고 표준 Kubernetes가 필요한가?** → EKS Anywhere

이 결정 트리를 내면화하면 SAP-C02의 하이브리드 컨테이너 시나리오 5문제 중 4문제는 첫 판단에 맞출 수 있다.

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
