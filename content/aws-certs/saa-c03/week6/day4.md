# Day 29 - 컨테이너: ECS, EKS, Fargate, ECR

컨테이너는 2013년 Docker가 등장하면서 애플리케이션 배포를 바꿨다. "내 로컬에서는 되는데 서버에서는 안 된다"는 문제의 근본 원인인 환경 불일치를 컨테이너 이미지라는 불변의 실행 단위로 해결했다. 하지만 컨테이너 수십 개, 수백 개를 어떻게 관리하는가라는 새로운 문제가 등장했다. 이것이 컨테이너 오케스트레이션의 영역이다. AWS는 자체 오케스트레이터인 ECS와 Kubernetes 표준을 따르는 EKS, 그리고 두 가지 모두에서 동작하는 서버리스 실행 엔진 Fargate를 제공한다.

> 💡 **관련 이론 — Linux 컨테이너 격리 원리**: 컨테이너의 격리는 Linux 커널의 두 가지 기능 위에 구축된다. **namespaces**는 프로세스가 볼 수 있는 자원을 제한한다 — PID(프로세스 트리), Network(네트워크 인터페이스), Mount(파일시스템), UTS(호스트명), IPC(프로세스 간 통신), User(UID/GID) namespace가 조합되어 컨테이너를 만든다. **cgroups(Control Groups)**는 CPU, 메모리, I/O, 네트워크 대역폭을 컨테이너 단위로 제한한다. Docker는 이 커널 기능 위에 편리한 이미지 빌드·배포 레이어를 추가한 것이다. 2015년 OCI(Open Container Initiative) 표준이 제정되어 컨테이너 이미지 형식과 런타임이 표준화됐고, 이후 containerd, CRI-O 등 다양한 런타임이 생겨났다.

## 컨테이너 vs VM — 격리 수준의 차이

컨테이너와 VM은 모두 격리된 실행 환경을 제공하지만 격리 레이어가 다르다. VM은 하드웨어를 가상화해서 각 VM이 독립된 커널을 가진다. 컨테이너는 호스트 OS 커널을 공유하면서 Linux namespaces와 cgroups로 프로세스를 격리한다.

| 항목 | VM | 컨테이너 | Fargate (MicroVM) |
|------|-----|-----------|-------------------|
| 격리 수준 | 커널 완전 분리 | 커널 공유, namespace 격리 | 커널 분리 + 경량 VMM |
| 시작 속도 | 수십 초~분 단위 | 수 밀리초~초 단위 | ~125ms (Firecracker) |
| 자원 오버헤드 | 높음 (Guest OS 필요) | 낮음 (커널 공유) | 중간 (경량 VMM) |
| 같은 호스트 공유 가능 | O (Hypervisor 분리) | O (namespace 분리) | 태스크당 전용 VM |
| 커널 취약점 영향 | 없음 | 있음 (공유 커널) | 없음 |

Lambda의 Firecracker MicroVM은 이 중간 지점이다. 커널을 공유하지 않아 VM 수준 격리를 갖지만, Rust로 작성된 경량 VMM 덕분에 ~125ms 시작 속도로 컨테이너에 근접한다. Fargate 역시 Firecracker 위에서 동작하므로 EC2 기반 ECS보다 강한 보안 격리를 제공한다.

> 🔍 **더 깊이 — 컨테이너 런타임 표준화 과정**: 2014년 Docker 독점 시대에서 2015년 CNCF(Cloud Native Computing Foundation) 설립과 함께 표준화가 시작됐다. OCI(Open Container Initiative)가 이미지 스펙과 런타임 스펙을 정의했고, Kubernetes는 2020년 Docker를 컨테이너 런타임으로 deprecated 처리하고 CRI(Container Runtime Interface)로 교체했다. 현재 Kubernetes의 기본 런타임은 containerd다. AWS EKS도 1.24 버전부터 containerd를 기본으로 사용한다. 이 변화는 SAA-C03 시험에 직접 출제되지 않지만, EKS 노드 업그레이드 시 호환성 문제로 나타날 수 있다.

## ECR — 컨테이너 이미지 레지스트리

Amazon Elastic Container Registry(ECR)는 Docker 이미지와 OCI 아티팩트를 저장하는 완전 관리형 레지스트리다. DockerHub의 AWS 버전이지만, IAM을 통한 접근 제어, KMS 암호화, VPC 엔드포인트, Cross-Region 복제 등 엔터프라이즈 기능이 통합된다.

**Image Scanning**: 이미지 push 시 자동으로 CVE 취약점을 스캔. Basic Scanning(무료)은 오픈소스 Clair 엔진 사용. Enhanced Scanning은 Amazon Inspector v2와 통합해 더 광범위한 취약점 데이터베이스(CVE, CIS 벤치마크)를 활용한다. CICD 파이프라인에서 취약점이 발견되면 배포 게이트를 구성해 차단할 수 있다.

**Lifecycle Policy**: 오래된 이미지를 자동으로 삭제. "최근 10개 tagged 이미지만 유지", "90일 이상 된 untagged 이미지 삭제" 같은 규칙으로 스토리지 비용을 관리한다.

**Cross-Region/Cross-Account Replication**: 멀티 리전 배포에서 각 리전이 가까운 ECR에서 이미지를 pull하도록 복제. 배포 속도와 비용(데이터 전송)을 최적화한다.

**VPC Endpoint 지원**: ECR에 VPC Interface Endpoint(PrivateLink)를 설정하면 인터넷을 거치지 않고 이미지를 pull할 수 있다. 프라이빗 서브넷의 Fargate 태스크에 특히 중요하다 — 인터넷 없이 ECR 접근이 가능해 보안이 강화되고 NAT Gateway 비용이 줄어든다.

> ⚠️ **함정 — ECR VPC Endpoint 2개 필요**: ECR은 VPC Endpoint 설정 시 두 개의 Endpoint가 필요하다. `com.amazonaws.region.ecr.api`(ECR API 호출용)와 `com.amazonaws.region.ecr.dkr`(이미지 레이어 전송용). S3 Gateway Endpoint도 함께 설정해야 한다 — ECR 이미지 레이어가 실제로 S3에 저장되기 때문이다. 셋 중 하나라도 빠지면 프라이빗 서브넷에서 이미지 pull이 실패한다.

## ECS — AWS 네이티브 컨테이너 오케스트레이터

Amazon Elastic Container Service(ECS)는 AWS가 2014년 출시한 자체 컨테이너 오케스트레이터다. Kubernetes와 다른 독자적인 개념 모델을 사용한다.

### ECS 핵심 개념

**Task Definition(태스크 정의)**: 컨테이너 실행 방법을 JSON으로 정의하는 청사진. 하나 이상의 컨테이너를 포함하며, 각 컨테이너의 이미지, CPU, 메모리, 포트, 환경변수, 볼륨 마운트, 로깅 설정, IAM 역할을 지정한다. 버전 관리(Revision)가 가능하며, 배포는 Task Definition Revision 번호로 관리된다.

**Task(태스크)**: Task Definition의 실행 인스턴스. 1개 이상의 컨테이너가 같은 네트워크와 스토리지를 공유하면서 함께 실행된다. Kubernetes의 **Pod**에 해당한다.

**Service(서비스)**: "이 Task Definition으로 N개의 Task를 항상 실행 상태로 유지하라"는 선언. 태스크가 실패하면 자동으로 새 태스크를 시작한다. 롤링 배포, Blue/Green 배포를 관리하며 ALB/NLB와 연동된다.

**Cluster(클러스터)**: 태스크와 서비스를 실행하는 논리적 그룹. EC2 인스턴스들의 풀 또는 Fargate 용량.

> 💡 **ECS와 Kubernetes 개념 대응표**:
>
> | ECS 개념 | Kubernetes 개념 | 설명 |
> |---------|-----------------|------|
> | Task Definition | Pod Spec (Deployment 템플릿) | 컨테이너 실행 청사진 |
> | Task | Pod | 실행 단위 (컨테이너 묶음) |
> | Service | Deployment + Service | 원하는 상태 유지 + 로드밸런싱 |
> | Cluster | Cluster / Namespace | 논리적 격리 단위 |
> | Task Role | IRSA (Pod IAM) | 컨테이너 AWS 권한 |
> | Task Execution Role | kubelet credential | 에이전트 AWS 권한 |
> | Fargate | Fargate / Virtual Kubelet | 서버리스 실행 엔진 |

### EC2 Launch Type vs Fargate

| 항목 | EC2 Launch Type | Fargate |
|------|----------------|---------|
| 인프라 관리 | 고객 (AMI 선택, 패치, ASG) | AWS |
| 비용 모델 | EC2 인스턴스 단가 | 태스크 vCPU + 메모리 초당 과금 |
| 격리 수준 | 여러 태스크가 같은 EC2 공유 | 태스크별 전용 Firecracker MicroVM |
| GPU 지원 | O (p/g/inf 인스턴스) | X |
| Windows 컨테이너 | O | O |
| Spot 활용 | O (EC2 Spot) | O (Fargate Spot, 최대 70% 절감) |
| ENI 제한 | 인스턴스 타입당 최대 ENI 수 제한 | 없음 |
| 적합한 경우 | 대형 클러스터, GPU, 높은 밀도 | 운영 단순화, 소규모, 변동 트래픽 |

Fargate의 격리 강점: 각 Fargate 태스크는 별도의 경량 VM(Firecracker) 위에서 실행된다. 여러 태스크가 같은 호스트 커널을 공유하지 않아 보안 격리가 EC2 Launch Type보다 강하다. 규제 산업(금융, 의료)에서 Fargate를 선호하는 이유다.

> 📚 **사례 — Airbnb Fargate 전환**: Airbnb는 CI/CD 빌드 파이프라인을 Fargate로 전환하면서 유휴 EC2 노드 관리 비용을 제거했다. 빌드 수요에 따라 수초 내에 Fargate 태스크가 시작되고, 빌드 완료 후 자동 종료되어 실제 사용 시간만 과금된다. EC2 기반 빌드 팜 대비 인프라 관리 시간을 주당 수십 시간 절감했다고 밝혔다. Fargate Spot을 빌드 워커에 적용해 비용을 추가 70% 절감한 것도 주목할 만한 점이다.

## 네트워킹 모드 — awsvpc가 표준인 이유

ECS 태스크의 네트워킹 모드는 `bridge`, `host`, `awsvpc` 세 가지다.

**bridge 모드**: Docker의 기본 브리지 네트워크. 컨테이너는 호스트 IP를 공유하고 동적 포트 매핑(32768-61000)으로 구분된다. 여러 태스크가 같은 EC2에서 동일 컨테이너 포트를 사용 가능하지만, ALB의 동적 포트 매핑 설정이 복잡하다.

**awsvpc 모드**: 각 태스크가 독립적인 ENI(Elastic Network Interface)와 프라이빗 IP를 가진다. 태스크에 직접 Security Group을 적용할 수 있다. Fargate의 유일한 네트워킹 모드이자 EC2 Launch Type에서도 권장되는 현대적 방식.

awsvpc의 이점:
- 태스크 수준 보안 그룹 — "이 ECS 서비스만 RDS에 접근" 설정 가능
- 태스크마다 독립 IP — ALB Target Group을 IP 타입으로 등록
- VPC Flow Logs에서 태스크별 트래픽 추적 가능
- Secrets Manager, SSM Parameter Store에 태스크별 접근 제어

ALB와 ECS 연결: awsvpc 모드에서 ALB Target Group을 IP 타입으로 생성하고, ECS 서비스가 태스크 시작/종료 시 자동으로 Target Group에 IP를 등록/해제한다.

> 🔍 **더 깊이 — awsvpc 모드의 ENI 제한**: awsvpc 모드에서 각 태스크에 ENI가 생성되므로, EC2 인스턴스당 최대 ENI 수에 제한이 걸릴 수 있다. 예를 들어 `m5.large`는 ENI 3개, `m5.xlarge`는 4개, `m5.24xlarge`는 15개까지 지원한다. 따라서 EC2 Launch Type + awsvpc 모드에서는 인스턴스 타입에 따라 한 호스트에서 실행할 수 있는 태스크 수가 제한된다. AWS가 이를 해결하기 위해 **ENI Trunking**(trunk ENI 1개가 최대 120개 branch ENI를 지원)을 제공하지만, 인스턴스 타입 제한이 있다. Fargate는 이 제한이 없다 — 각 태스크가 별도의 MicroVM이므로.

## IAM 권한 — Task Role과 Task Execution Role

ECS에서 IAM 권한은 두 레이어로 나뉜다. 이 두 개를 혼동하면 권한 오류가 발생한다.

**Task Execution Role**: ECS 에이전트(컨트롤 플레인)가 태스크를 시작하는 데 필요한 권한. ECR에서 이미지를 pull하고, CloudWatch Logs에 로그를 쓰고, Secrets Manager에서 비밀값을 읽어 컨테이너 환경변수에 주입한다.

```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:GetDownloadUrlForLayer",
    "ecr:BatchGetImage",
    "logs:CreateLogStream",
    "logs:PutLogEvents",
    "secretsmanager:GetSecretValue",
    "ssm:GetParameters",
    "kms:Decrypt"
  ]
}
```

**Task Role**: 컨테이너 안의 애플리케이션 코드가 AWS 서비스를 호출하는 권한. "이 ECS 태스크가 S3 버킷을 읽고 DynamoDB에 쓰는" 권한이 Task Role에 있어야 한다.

```
[ ECS 에이전트 ]
       │ Task Execution Role
       │ - ECR에서 이미지 pull
       │ - CloudWatch에 로그 전송
       │ - Secrets Manager에서 비밀값 읽기 (컨테이너 시작 전)
       ▼
[ 태스크 (컨테이너) ]
       │ Task Role
       │ - S3 GetObject/PutObject
       │ - DynamoDB PutItem/GetItem
       │ - SNS Publish, SQS SendMessage
       ▼
[ AWS 서비스 ]
```

> ⚠️ **함정 — EC2 Instance Profile 오염**: EC2 Launch Type에서 ECS를 실행할 때 EC2 Instance Profile도 존재한다. Task Role이 설정되지 않으면 컨테이너 안의 AWS SDK가 Instance Profile의 자격증명을 사용할 수 있다. 이렇게 되면 같은 호스트의 모든 태스크가 동일한 인스턴스 권한을 갖게 된다 — 최소 권한 원칙(Principle of Least Privilege) 위반이다. Task Role을 항상 개별 서비스에 맞게 설정하고, ECS 에이전트 메타데이터 엔드포인트(`169.254.170.2`)를 통해서만 자격증명이 발급되도록 제어해야 한다. Fargate는 Instance Profile 자체가 없어서 이 문제가 발생하지 않는다.

## EKS — Kubernetes 표준 위의 관리형 서비스

Amazon Elastic Kubernetes Service(EKS)는 Kubernetes 컨트롤 플레인(etcd, API Server, Controller Manager, Scheduler)을 AWS가 관리하는 서비스다. 고객은 워커 노드와 애플리케이션 Pod만 관리한다.

**Kubernetes가 선택되는 이유**:
- 벤더 독립적 표준 — GCP GKE, Azure AKS, 온프레미스와 동일한 API
- 방대한 오픈소스 생태계 (Istio, ArgoCD, Prometheus, Helm, Karpenter)
- 복잡한 배포 패턴 지원 (CRD, Operator 패턴, Horizontal Pod Autoscaler)
- 멀티 클라우드/하이브리드 전략

**ECS가 선택되는 이유**:
- 더 단순한 개념 모델, 낮은 학습 곡선
- AWS 서비스와 더 깊은 네이티브 통합
- 컨트롤 플레인 비용 없음 (EKS는 클러스터당 시간당 $0.10)
- AWS 도구 친숙도가 높은 팀

### IRSA — Pod별 IAM 권한 부여

EKS에서 Pod가 AWS 서비스를 호출하려면 IAM 권한이 필요하다. EC2 Instance Profile을 사용하면 같은 노드의 모든 Pod가 같은 권한을 갖게 된다 — ECS의 Instance Profile 오염 문제와 동일하다. IRSA(IAM Roles for Service Accounts)가 이를 해결한다.

IRSA 동작 방식:
1. EKS 클러스터의 OIDC Provider URL을 IAM에 등록
2. Kubernetes Service Account를 만들고 IAM Role ARN을 어노테이션으로 지정
3. Pod에 Service Account를 할당
4. Pod가 AWS API를 호출하면, EKS Pod Identity Webhook이 OIDC 토큰을 자동 주입
5. AWS SDK가 토큰을 사용해 STS `AssumeRoleWithWebIdentity` 호출
6. STS가 임시 자격증명 발급 → Pod가 지정된 IAM Role의 권한으로 AWS 서비스 호출

```yaml
# Kubernetes Service Account with IRSA
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader-sa
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::111122223333:role/s3-reader-role
---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  serviceAccountName: s3-reader-sa
  containers:
  - name: app
    image: my-app:latest
```

이 구성으로 `my-app` Pod만 S3 읽기 권한을 갖고, 같은 노드의 다른 Pod는 해당 권한이 없다.

> 💡 **관련 이론 — OIDC와 Web Identity Federation**: IRSA의 기반은 OIDC(OpenID Connect, RFC 8485)와 STS Web Identity Federation이다. OIDC는 OAuth 2.0 위에 구축된 인증 레이어로, EKS가 각 Pod의 Service Account에 대해 JWT 형태의 OIDC 토큰을 발급한다. IAM의 신뢰 정책(Trust Policy)에 OIDC Provider ARN과 `sub` 조건(특정 namespace의 특정 service account)을 명시하면, 해당 조건을 만족하는 토큰만 AssumeRole이 허용된다. 이 메커니즘은 Lambda의 실행 역할, EC2의 Instance Profile과 같은 원리지만 Kubernetes 환경에 맞게 확장된 것이다. 2023년 AWS는 더 간단한 **EKS Pod Identity**를 출시했는데, OIDC 설정 없이 EKS 네이티브 API로 Pod에 IAM Role을 직접 연결할 수 있다.

### EKS 노드 타입

| 항목 | Managed Node Groups | Self-Managed | Fargate Profiles |
|------|--------------------|--------------|----|
| 노드 패치/업그레이드 | AWS 지원 (롤링) | 직접 | AWS (태스크별) |
| ASG 관리 | AWS | 직접 | 없음 (On-Demand) |
| 커스텀 AMI | 제한적 지원 | 완전 지원 | 불가 |
| GPU / Neuron | O (p/g/inf 인스턴스) | O | X |
| DaemonSet 실행 | O | O | X |
| Spot 인스턴스 | O | O | X (Fargate Spot 없음) |
| 비용 | EC2 비용 | EC2 비용 | vCPU+메모리 초당 |

Fargate Profiles는 특정 Kubernetes Namespace와 Label Selector와 매칭되는 Pod를 Fargate로 실행한다. DaemonSet, HostNetwork Pod, Stateful workload(PersistentVolume 일부)는 Fargate 미지원.

> 📚 **사례 — Shopify의 EKS + Karpenter**: Shopify는 블랙프라이데이 트래픽 폭증을 처리하기 위해 EKS에 Karpenter(오픈소스 node autoscaler)를 도입했다. 기존 Cluster Autoscaler 대비 노드 프로비저닝 속도가 3배 빠르고, 실시간으로 필요한 인스턴스 타입(Spot 포함)을 선택해 30% 비용 절감을 달성했다. 트래픽 피크 시 수백 개의 노드가 수분 내에 추가되고, 피크 이후 자동으로 축소된다. Karpenter는 2023년 CNCF에 기부됐다.

## 배포 전략 — Rolling, Blue/Green, Canary

**Rolling 업데이트 (기본)**: ECS Service의 기본 배포 방식. 새 태스크를 하나씩 시작하면서 구 태스크를 종료한다. `minimumHealthyPercent`(기존 태스크 최소 유지 비율)와 `maximumPercent`(최대 총 태스크 비율)로 동시에 존재하는 태스크 수를 제어.

예: `desiredCount=4`, `minimumHealthyPercent=50`, `maximumPercent=200`이면 배포 중 2~8개 태스크가 동시 존재 가능.

**Blue/Green (CodeDeploy 통합)**: 새 버전(Green)을 기존 버전(Blue)과 병렬로 완전히 배포한 뒤, ALB Listener Rule로 트래픽을 전환한다. 검증 후 Blue를 종료하거나, 문제 발견 시 원클릭 롤백.

**Canary**: Blue/Green의 변형. 트래픽을 점진적으로 전환(10% → 25% → 50% → 100%). CodeDeploy가 CloudWatch Alarm을 모니터링하여 에러율이 임계치를 넘으면 자동 롤백. 새 버전의 실환경 테스트가 가능하다.

> 🔍 **더 깊이 — ECS 배포 전략 비교**:
>
> | 배포 방식 | 다운타임 | 롤백 속도 | 인프라 비용 | 복잡도 |
> |---------|---------|---------|-----------|-------|
> | Rolling (기본) | 없음 | 느림 (역순 Rolling) | 추가 없음 | 낮음 |
> | Blue/Green | 없음 | 빠름 (트래픽 전환) | 2× 태스크 일시 | 중간 |
> | Canary | 없음 | 자동 (CloudWatch) | 2× 태스크 일시 | 높음 |
>
> 금융 시스템이나 결제 서비스처럼 롤백이 중요한 경우 Blue/Green. 새 기능의 영향이 불확실한 경우 Canary. 일반적인 서비스 업데이트는 Rolling이 적합하다.

## 다른 클라우드와의 비교

| 항목 | AWS ECS/EKS | GCP Cloud Run/GKE | Azure Container Apps/AKS |
|------|-------------|-------------------|--------------------------|
| 서버리스 컨테이너 | Fargate | Cloud Run (HTTP 자동 스케일링) | Container Apps |
| K8s 관리형 | EKS | GKE Autopilot | AKS |
| 자체 오케스트레이터 | ECS | — | — |
| 컨트롤 플레인 비용 | EKS $0.10/hr | GKE 무료 (Zone) | AKS 무료 |
| 이미지 레지스트리 | ECR | Artifact Registry | ACR (Azure Container Registry) |
| IAM 통합 | Task Role / IRSA | Workload Identity | Managed Identity (Pod) |
| 서비스 메시 | AWS App Mesh / Istio | Cloud Service Mesh / Istio | KEDA + Dapr |

GCP GKE Autopilot은 노드 관리가 필요 없다는 점에서 AWS Fargate + EKS와 가장 가깝다. 2023년 기준 GKE 컨트롤 플레인이 Zone 클러스터는 무료라는 점이 EKS 대비 비용 우위다.

> 📚 **사례 — Netflix EKS 마이그레이션**: Netflix는 2018년부터 단계적으로 ECS에서 EKS로 마이그레이션을 진행했다. 수천 개의 마이크로서비스가 동작하는 환경에서 Kubernetes의 CRD(Custom Resource Definition)와 Operator 패턴을 활용해 Netflix 특유의 배포 요구사항(자동 카나리, 지역별 배포, 카오스 엔지니어링 훅)을 추상화했다. Spinnaker(Netflix 오픈소스 CD 플랫폼)와 EKS의 통합이 핵심이었다. 현재 Netflix의 수십만 컨테이너가 EKS 위에서 운영된다.

## CLI로 ECS Fargate 서비스 배포

```bash
# ECR 레포지토리 생성 (이미지 스캔 + KMS 암호화)
aws ecr create-repository \
  --repository-name prod/my-app \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=KMS,kmsKey=arn:aws:kms:...

# ECR 로그인 및 이미지 push
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  111122223333.dkr.ecr.ap-northeast-2.amazonaws.com

docker build -t my-app:latest .
docker tag my-app:latest 111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/prod/my-app:latest
docker push 111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/prod/my-app:latest

# ECR 이미지 스캔 결과 확인 (Enhanced Scanning)
aws ecr describe-image-scan-findings \
  --repository-name prod/my-app \
  --image-id imageTag=latest \
  --query 'imageScanFindings.findings[?severity==`CRITICAL`]'

# ECS 클러스터 생성 (Fargate + Fargate Spot 혼합)
aws ecs create-cluster \
  --cluster-name prod-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=1 \
    capacityProvider=FARGATE_SPOT,weight=4

# Task Definition 등록 (Secrets Manager 연동)
aws ecs register-task-definition \
  --family prod-task \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 512 \
  --memory 1024 \
  --execution-role-arn arn:aws:iam::111:role/ecsTaskExecutionRole \
  --task-role-arn arn:aws:iam::111:role/prod-task-role \
  --container-definitions '[{
    "name": "app",
    "image": "111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/prod/my-app:latest",
    "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
    "secrets": [{
      "name": "DB_PASSWORD",
      "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:111:secret:prod/db-password"
    }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/prod-task",
        "awslogs-region": "ap-northeast-2",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3
    }
  }]'

# ECS Service 생성 (ALB 연결 + Blue/Green 배포)
aws ecs create-service \
  --cluster prod-cluster \
  --service-name prod-service \
  --task-definition prod-task:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-private-a", "subnet-private-b"],
      "securityGroups": ["sg-ecs-tasks"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --load-balancers '[{
    "targetGroupArn": "arn:aws:elasticloadbalancing:...:targetgroup/prod-tg",
    "containerName": "app",
    "containerPort": 8080
  }]' \
  --deployment-controller type=CODE_DEPLOY \
  --deployment-configuration minimumHealthyPercent=50,maximumPercent=200

# ECS Service Auto Scaling (CPU 70% 기준)
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/prod-cluster/prod-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 20

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/prod-cluster/prod-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 60,
    "ScaleOutCooldown": 30
  }'

# IRSA를 위한 EKS OIDC Provider 등록
eksctl utils associate-iam-oidc-provider \
  --region ap-northeast-2 \
  --cluster prod-eks \
  --approve

# IRSA Service Account 생성 (S3 읽기 권한)
eksctl create iamserviceaccount \
  --name s3-reader-sa \
  --namespace production \
  --cluster prod-eks \
  --attach-policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve \
  --override-existing-serviceaccounts
```

> ⚠️ **함정 — Fargate Spot 중단 대비**: Fargate Spot은 최대 70% 저렴하지만 AWS가 용량 회수 시 2분 전에 SIGTERM을 보내고 태스크를 중단한다. 상태 유지(stateful) 작업에는 사용하면 안 되고, 중단 시 재시도가 자연스러운 배치 작업이나 Spot 중단 시 Fargate(On-Demand)로 자동 전환되는 Capacity Provider Strategy를 구성해야 한다. ECS Capacity Provider Strategy에서 `base=1`을 On-Demand Fargate에 설정하면 최소 1개 태스크는 항상 On-Demand로 보장되고, 나머지는 Spot으로 실행된다.

## 정리하며

AWS 컨테이너 서비스는 ECR(이미지 저장) → ECS 또는 EKS(오케스트레이션) → Fargate 또는 EC2(실행 환경)라는 레이어로 구성된다. 선택 기준은 명확하다.

- **운영 단순화 우선**: ECS + Fargate. AWS에 최적화된 팀, Kubernetes 불필요.
- **Kubernetes 표준 필요**: EKS. 멀티 클라우드, 복잡한 오케스트레이션 요구사항.
- **GPU/특수 인스턴스**: ECS/EKS + EC2 Launch Type. Fargate는 GPU 미지원.
- **IAM 권한**: ECS는 Task Role, EKS는 IRSA로 Pod/태스크 단위 최소 권한 부여.
- **보안 격리 우선**: Fargate (Firecracker MicroVM, 공유 커널 없음).

내일은 6주차 전체를 복습하며 Lambda, API Gateway, Step Functions, 컨테이너의 선택 기준을 시나리오 문제로 굳힌다.

---

## 📝 연습 문제

**문제 1.** 개발팀이 Kubernetes 기반으로 애플리케이션을 개발하고 있으며 온프레미스, GCP GKE, AWS에 동일 워크로드를 배포할 예정이다. AWS에서 가장 적합한 컨테이너 오케스트레이션 서비스는?

A) Amazon ECS — AWS 전용이지만 단순하고 빠르다
B) Amazon EKS — Kubernetes 표준으로 멀티 클라우드/온프레미스 이식성 보장
C) AWS Fargate 단독 — 오케스트레이션 없이 직접 컨테이너 실행
D) EC2에 직접 Kubernetes 설치 — 완전한 제어권

**정답: B**
EKS는 업스트림 Kubernetes와 호환되므로 동일한 YAML 매니페스트를 GKE, 온프레미스, EKS에서 최소 수정으로 사용할 수 있다. ECS는 AWS 전용 개념이라 이식성이 없다. D는 컨트롤 플레인 관리 부담이 크다. Fargate 단독은 오케스트레이션 레이어가 없다.

---

**문제 2.** ECS Fargate 태스크가 S3 버킷에서 파일을 읽고 처리 결과를 DynamoDB에 저장해야 한다. 이 권한을 올바르게 부여하는 방법은?

A) ECS 클러스터가 실행되는 EC2 인스턴스의 Instance Profile에 S3 읽기와 DynamoDB 쓰기 권한 추가
B) 태스크 컨테이너의 환경변수에 AWS Access Key와 Secret Key를 하드코딩
C) Task Definition의 Task Role(태스크 역할)에 S3 읽기와 DynamoDB 쓰기 권한을 부여
D) Task Execution Role에 S3 읽기와 DynamoDB 쓰기 권한 추가

**정답: C**
Task Role은 컨테이너 안의 애플리케이션 코드가 AWS 서비스를 호출하는 권한이다. Task Execution Role(D)은 ECS 에이전트가 ECR에서 이미지를 pull하고 로그를 전송하는 권한으로 애플리케이션 코드의 AWS 접근과 다르다. A는 Fargate에는 EC2 인스턴스가 없다. B는 하드코딩은 보안 위험이 크다.

---

**문제 3.** ECS Fargate 서비스에서 ALB를 통해 트래픽을 처리한다. 각 태스크가 포트 8080을 사용하고, ALB Target Group에 태스크를 자동으로 등록/해제하려면 어떤 네트워킹 모드를 사용해야 하는가?

A) bridge 모드 (동적 포트 매핑으로 호스트 포트를 랜덤 할당)
B) host 모드 (컨테이너 포트를 호스트 포트에 직접 바인딩)
C) awsvpc 모드 (각 태스크에 ENI와 전용 IP 할당, Target Group IP 타입)
D) overlay 모드 (Docker Swarm 네트워크)

**정답: C**
Fargate는 awsvpc 모드만 지원한다. awsvpc 모드에서 각 태스크는 자체 ENI와 프라이빗 IP를 가지고, ALB Target Group을 IP 타입으로 설정하면 ECS 서비스가 태스크 시작 시 자동으로 IP를 등록하고 종료 시 해제한다. A와 B는 EC2 Launch Type에서만 사용 가능하다. D는 ECS에서 지원하지 않는다.

---

**문제 4.** EKS 클러스터에서 결제 처리 Pod와 로그 수집 Pod가 같은 노드에서 실행된다. 결제 처리 Pod만 AWS Secrets Manager에 접근하고, 로그 수집 Pod는 CloudWatch Logs에만 접근해야 한다. 각 Pod에 다른 IAM 권한을 부여하는 가장 안전한 방법은?

A) EC2 노드 Instance Profile에 두 가지 권한을 모두 부여
B) IRSA(IAM Roles for Service Accounts)를 사용해서 각 Pod의 Service Account에 다른 IAM Role을 연결
C) 환경변수에 각 Pod별 IAM Access Key를 설정
D) 노드를 분리해서 각 노드에 다른 Instance Profile 적용

**정답: B**
IRSA는 EKS에서 Pod 단위로 IAM 권한을 부여하는 표준 방법이다. 각 Pod의 Service Account에 독립적인 IAM Role을 연결해 같은 노드에 있어도 각 Pod가 자신의 Role 권한만 갖는다. A는 같은 노드의 모든 Pod가 두 가지 권한을 모두 가지게 되어 최소 권한 원칙 위반. C는 자격증명 노출 위험. D는 노드 분리는 비용이 크고 확장성이 없다.

---

**문제 5.** 회사가 레거시 Java 모놀리스를 마이크로서비스로 전환하면서 컨테이너화하려고 한다. 운영팀의 Kubernetes 경험이 없고, 노드 관리 없이 빠르게 프로덕션에 배포하고 싶다. 가장 적합한 AWS 서비스 조합은?

A) EKS + Managed Node Groups
B) ECS + Fargate
C) ECS + EC2 Launch Type
D) EKS + Fargate

**정답: B**
Kubernetes 경험이 없고 노드 관리를 원하지 않는다. ECS는 더 단순한 개념 모델이고, Fargate는 노드 관리가 불필요하다. ECS + Fargate 조합이 운영 부담이 가장 적으면서 빠르게 프로덕션 배포가 가능하다. A와 D는 Kubernetes 학습 곡선이 있다. C는 EC2 노드를 직접 관리해야 한다.

---

**문제 6.** 금융 서비스 회사가 PCI DSS 규정 준수를 위해 컨테이너 환경에서 강한 보안 격리가 필요하다. 서로 다른 고객의 데이터를 처리하는 컨테이너 간에 커널 수준 격리가 요구된다. 어떤 실행 환경이 이 요구사항을 충족하는가?

A) ECS + EC2 Launch Type + bridge 네트워킹 모드
B) ECS + EC2 Launch Type + awsvpc 네트워킹 모드
C) ECS + Fargate (Firecracker MicroVM 기반)
D) EKS + Managed Node Groups + DaemonSet

**정답: C**
Fargate는 각 태스크를 Firecracker MicroVM에서 실행하여 커널 수준에서 완전히 격리된다. 다른 태스크와 호스트 커널을 공유하지 않으므로 커널 취약점이 다른 태스크에 영향을 줄 수 없다. A와 B는 EC2 위에서 여러 태스크가 같은 커널을 공유한다. D도 EC2 노드 위에서 Pod들이 같은 커널을 공유한다. 커널 수준 격리가 명시적 요구사항일 때는 Fargate가 정답이다.

---

**문제 7.** ECS 서비스를 프라이빗 서브넷에서 실행하고, 인터넷을 통하지 않고 ECR에서 이미지를 pull하려고 한다. 필요한 VPC Endpoint의 조합은?

A) com.amazonaws.region.ecr.dkr 하나만 설정
B) com.amazonaws.region.ecr.api + com.amazonaws.region.ecr.dkr + S3 Gateway Endpoint
C) com.amazonaws.region.ecr.api + S3 Gateway Endpoint
D) NAT Gateway를 통해 인터넷으로 ECR 접근

**정답: B**
ECR VPC Endpoint는 세 가지가 모두 필요하다. `ecr.api`는 ECR API 호출(인증, 이미지 메타데이터), `ecr.dkr`는 Docker 이미지 레이어 전송에 필요하다. S3 Gateway Endpoint는 ECR이 실제 이미지 레이어를 S3에 저장하기 때문에 필수다. 이 중 하나라도 없으면 프라이빗 서브넷에서 이미지 pull이 실패한다. D는 NAT Gateway를 통해 인터넷 경유가 가능하지만 보안 요구사항(인터넷 비통과)을 충족하지 못한다.

---
