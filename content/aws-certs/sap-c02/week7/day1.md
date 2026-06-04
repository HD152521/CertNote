# Day 31 - 컨테이너 오케스트레이션의 분기점: ECS, EKS, Fargate 선택의 진짜 기준

콘솔 어딘가에서 "ECS 만들기"를 누른 적이 있다면, 곧바로 떠오르는 질문이 두 개 있다. "왜 EKS를 안 쓰지?", "이거 Fargate랑 무슨 차이지?" 표면적으로는 셋 다 "컨테이너를 띄우는 도구"로 보이는데, 비용 청구서를 받아보면 한 달에 수백 달러씩 차이가 난다. SAP 시험은 이 세 가지가 들어간 시나리오를 한 도메인당 평균 3~4문제씩 출제하는데, 표면적인 키워드 매칭으로는 절반도 못 맞춘다.

이 글에서는 ECS·EKS·Fargate가 왜 이런 형태로 진화했고, 컨트롤 플레인과 데이터 플레인이 어떻게 갈리며, 시나리오에 따라 어디서 분기가 나는지를 본다. App Runner와 ECS/EKS Anywhere까지 포함해서 "AWS 컨테이너 가족"의 지도를 한 장 그리는 것이 목표다. 시험 직전에 이 지도를 떠올리면 어떤 시나리오를 만나도 답이 4번 중 하나로 좁혀진다.

## 컨테이너 오케스트레이션이 왜 필요했나 — 역사적 배경

2013년 도커가 등장하기 전까지 서버 배포는 "특정 서버에 의존하는 작업"이었다. 한 서버 위에 ruby 2.6, python 3.7, node 12를 동시에 깔아두면 의존성 지옥이 시작됐고, "내 노트북에서는 되는데 서버에서는 안 된다"가 일상이었다. 도커가 LXC(Linux Container)와 Union FS 위에 이미지·레이어 개념을 얹어서 이 문제를 해결했지만, 한 서버에 컨테이너 30개를 띄우는 순간 새로운 문제가 생긴다. 누가 죽었는지 누가 살았는지 추적하기 어렵고, 서버 한 대가 죽으면 그 위에 있던 컨테이너 30개가 한꺼번에 사라진다.

2014년 구글이 Borg 시스템의 경험을 오픈소스화한 것이 Kubernetes(K8s)다. AWS는 같은 해 ECS를 출시했는데, K8s가 아직 정식 1.0이 안 나온 시점이라 자체 오케스트레이터로 만들었다. 그 뒤로 K8s가 사실상의 표준이 되자 AWS는 2017년 re:Invent에서 EKS를 발표해 "이제 K8s도 매니지드로 제공한다"고 선언한다. 같은 행사에서 발표된 Fargate는 "노드를 아예 신경 쓰고 싶지 않다"는 시장 요구에 답한 서버리스 데이터 플레인이다.

> 💡 **관련 이론**: 컨테이너 오케스트레이션은 분산 시스템의 **scheduling 문제**다. m개의 잡을 n개의 노드에 어떻게 배치할 것인가 — 이는 NP-hard인 multi-dimensional bin packing 문제로 환원된다. K8s의 기본 스케줄러는 priorityFunction + predicate filter라는 휴리스틱으로 풀고, Karpenter는 한 발 더 나아가 노드 타입까지 동적으로 선택한다. 이론적 배경은 Tannenbaum의 *Distributed Systems* 6.3장과 구글 Borg 논문(2015 EuroSys, "Large-scale cluster management at Google with Borg")에서 확인할 수 있다.

> 🔍 **더 깊이**: ECS와 K8s의 가장 큰 설계 철학 차이는 **API의 풍부함**이다. K8s는 Pod·Deployment·Service·ConfigMap·Secret·Ingress·CRD 등 30+ 종류의 리소스를 가지고, 모든 게 declarative YAML이다. ECS는 Cluster·Task Definition·Service·Task 4개만 알면 끝난다. 학습 곡선의 차이는 곧 운영 부담의 차이로 이어진다. SAP 시험에서 "운영 부담 최소화" + "AWS 위주" 키워드가 같이 나오면 거의 ECS가 답이고, "이식성" + "K8s 표준" 키워드가 나오면 EKS가 답이다.

## ECS, EKS, Fargate의 책임 분담 지도

세 서비스의 관계를 처음 보면 헷갈리는 이유는 **Fargate가 별도의 오케스트레이터가 아니기 때문**이다. Fargate는 ECS와 EKS 양쪽에서 "노드 대신 쓸 수 있는 데이터 플레인 옵션"이다.

```
        ┌─────────────────────────────────────────┐
        │  컨트롤 플레인 (Control Plane)            │
        │  ├─ ECS: AWS 매니지드, 무료              │
        │  └─ EKS: AWS 매니지드, $0.10/h           │
        └─────────────────────────────────────────┘
                          │
                          │ 작업 배치 결정
                          ▼
        ┌─────────────────────────────────────────┐
        │  데이터 플레인 (Data Plane) — 3가지 옵션  │
        │  ├─ EC2 Launch Type (사용자 노드 관리)    │
        │  ├─ Fargate Launch Type (서버리스)       │
        │  └─ ECS Anywhere / EKS Anywhere (온프레)  │
        └─────────────────────────────────────────┘
```

| 차원 | ECS | EKS | Fargate |
|------|-----|-----|---------|
| 컨트롤 플레인 비용 | 무료 | 시간당 $0.10 (월 ~$73) | 해당 없음 (옵션) |
| API 표준 | AWS 독자 | Kubernetes (CNCF) | ECS/EKS API에 의존 |
| 학습 곡선 | 낮음 | 높음 (kubectl, YAML, CRD) | ECS/EKS와 동일 |
| 이식성 | AWS 종속 | 멀티 클라우드 가능 | AWS 종속 |
| 데이터 플레인 선택지 | EC2, Fargate, Anywhere | EC2(Managed/Self), Fargate, Anywhere | (자기 자신) |
| Spot 통합 | EC2 Spot, Fargate Spot | EC2 Spot, Fargate Spot, Karpenter | Fargate Spot |
| 시작 시간 | 수십 초 ~ 1분 | 수십 초 ~ 1분 | 30-60초 (이미지 Pull 포함) |

> 🎯 **시나리오**: "한 금융사가 AWS·온프레미스·GCP를 동시에 운영한다. 컨테이너 워크로드의 이식성이 중요하고, 어떤 환경에서든 동일한 매니페스트로 배포할 수 있어야 한다. 운영팀은 컨트롤 플레인 패치와 etcd 백업 같은 K8s 운영 부담을 피하고 싶다. 어느 조합이 적합한가?" — 답은 **EKS + Karpenter + IRSA**. ECS는 AWS 독자 API라 이식성이 깨지고, App Runner는 멀티 클라우드 매니페스트 호환이 안 된다. EKS가 K8s 표준이면서 컨트롤 플레인은 AWS가 매니지드해주는 정확한 교집합이다.

## ECS 핵심 구성: 단순함의 미학

ECS는 4개의 개념만 알면 끝난다. **Cluster → Service → Task → Task Definition**.

- **Task Definition**: 컨테이너 이미지, vCPU/메모리, 환경 변수, IAM Role(`taskRoleArn`), 볼륨 마운트, 로그 설정을 JSON으로 정의한 "blueprint". Docker Compose 파일과 비슷하지만 Fargate·EC2 모두에 매핑된다.
- **Task**: Task Definition의 실행 인스턴스. 1개 Task = 1개 이상의 컨테이너(보통은 메인 + 사이드카).
- **Service**: 원하는 Task 개수(desired count)를 유지하는 컨트롤러. ALB Target Group 연동, Deployment 전략(Rolling/Blue-Green via CodeDeploy), Auto Scaling을 담당.
- **Cluster**: 위 모든 걸 묶는 논리 단위. 한 클러스터에 EC2 Launch Type과 Fargate Launch Type을 섞을 수 있다.

여기서 핵심은 **Task IAM Role**(=`taskRoleArn`)과 **Task Execution Role**(=`executionRoleArn`)의 차이다. 헷갈리면 시험에서 한두 문제 잃는다.

| Role | 용도 | 누가 사용 |
|------|------|----------|
| **Task Execution Role** | ECR 이미지 Pull, CloudWatch Logs 쓰기, Secrets Manager에서 환경 변수 가져오기 | ECS 에이전트 (인프라 작업) |
| **Task Role** | Task 안의 애플리케이션 코드가 AWS API 호출(DynamoDB Put, S3 Get 등) | 애플리케이션 코드 |

> ⚠️ **함정**: "ECS Task가 S3에 접근하는데 권한 오류가 난다"는 시나리오의 답은 거의 **Task Role**에 S3 권한이 빠진 것이다. Execution Role에 S3 권한을 줘도 동작 안 한다(앱이 호출하는 것이지 ECS 에이전트가 호출하는 게 아니므로). 또 반대로 "ECR에서 이미지 Pull이 안 된다"는 Execution Role 문제다.

## EKS 핵심 구성: K8s 위에 AWS를 얹는 법

EKS는 본질적으로 매니지드 K8s라서 K8s 개념(Pod, Deployment, Service, Ingress, ConfigMap, Secret, ServiceAccount, CRD)을 그대로 쓴다. 그 위에 AWS가 4가지 통합 레이어를 추가한다.

1. **컨트롤 플레인**: API Server, etcd, controller-manager, scheduler를 AZ 3개에 분산 배치해 매니지드 제공. 사용자는 etcd 백업·버전 업그레이드를 직접 안 해도 된다.
2. **노드 그룹(Node Group)**: 워커 노드를 묶는 단위. Managed Node Group(AWS가 ASG·드레인 자동화), Self-Managed Node Group(사용자가 직접 운영), Fargate Profile(노드 없음, Pod별 micro VM).
3. **IRSA / Pod Identity**: K8s ServiceAccount를 IAM Role과 매핑. 자세한 건 다음 day에서.
4. **EKS Add-ons**: VPC CNI, CoreDNS, kube-proxy, EBS CSI Driver, AWS Load Balancer Controller 등을 매니지드 형태로 설치·업데이트.

EKS의 시간당 $0.10는 월 약 $73이다. 클러스터 하나당이고, 노드 수와 무관하다. "운영팀이 클러스터를 100개 띄우려고 한다"는 시나리오에서는 이 비용이 무시 못 할 수준이 된다(월 $7,300). 그래서 SAP에서는 "수십 개의 작은 워크로드 → 여러 ECS Cluster" vs "통합 EKS 1개 + Namespace로 격리"의 트레이드오프가 자주 등장한다.

> 📚 **사례**: 2019년 3월 2일, EKS us-east-1에서 일부 클러스터의 API Server가 응답 불능 상태에 빠진 사건이 있다. 원인은 컨트롤 플레인 업그레이드 중 etcd quorum loss. AWS가 자동 복구했지만 약 2시간 동안 일부 클러스터에서 `kubectl` 명령이 실패했다. 이 사건의 교훈은 **데이터 플레인(노드 위의 Pod)은 컨트롤 플레인이 죽어도 계속 동작**한다는 점이다. 이미 스케줄링된 Pod는 노드 위에서 그대로 돌고, 새로 스케줄링·롤링 업데이트만 막힌다. 그래서 production 운영에서는 컨트롤 플레인 장애 동안 "신규 배포 정지, 기존 트래픽 유지" 모드로 버틸 수 있다. [AWS Status History 참고](https://health.aws.amazon.com/health/status).

## Launch Type: EC2 vs Fargate의 진짜 트레이드오프

같은 ECS Service라도 EC2 Launch Type과 Fargate Launch Type은 비용·운영·기능 측면에서 완전히 다르다.

| 항목 | EC2 Launch Type | Fargate Launch Type |
|------|----------------|---------------------|
| 노드 관리 | 사용자 (AMI 패치, capacity provider, ASG) | AWS |
| 비용 모델 | EC2 시간 + EBS | vCPU-초 + 메모리-초 |
| 시작 시간 | 빠름 (이미 워밍업된 노드) | 30-60초 (micro VM 부팅 + 이미지 Pull) |
| GPU·고밀도 | 가능 (P, G, Inf 인스턴스) | GPU는 일부 리전 only |
| Daemon Set | 가능 | 불가 (Fargate는 노드 개념 없음) |
| ENI | 공유 또는 awsvpc 모드 | Task당 ENI 1개 강제 |
| 운영 부담 | 큼 (패치·AMI·ASG) | 작음 |
| 비용 효율 | 일정 사용량·고밀도에 유리 | Spiky 워크로드에 유리 |
| 사이드카 자유도 | 무제한 | 메모리·CPU 한도 안에서 |

> 🔍 **더 깊이**: Fargate가 매번 micro VM을 부팅하는 이유는 **하드웨어 레벨 격리**가 필요하기 때문이다. AWS는 Firecracker라는 자체 마이크로 VMM(Virtual Machine Monitor)을 만들어서 사용한다. KVM 위에 동작하지만 전통적인 QEMU 대신 minimal device model만 제공해 부팅 시간이 125ms 수준이다. Firecracker 논문(NSDI 2020 — "Firecracker: Lightweight Virtualization for Serverless Applications")이 공개되어 있고, 같은 기술이 Lambda에도 쓰인다. 이 격리 덕분에 Fargate는 멀티테넌트 환경에서도 다른 고객의 컨테이너 옆에서 안전하게 실행된다.

> 💡 **관련 이론**: EC2 Launch Type의 비용 효율은 **Bin Packing**의 효과다. 한 m5.xlarge(4 vCPU, 16GB)에 0.25 vCPU Task를 16개 띄우면 노드 단가가 분산된다. Fargate는 Task별 독립 micro VM이라 Bin Packing이 안 되고, 각 Task의 vCPU·메모리를 그대로 청구한다. 그래서 "0.25 vCPU 짜리 Task를 1000개 띄우는 시나리오"는 EC2가 압도적으로 싸지만, "트래픽 가변 + Spiky"는 Fargate가 우위다. 경험적인 분기점은 평균 노드 사용률이 **40%를 넘느냐**다. 40% 이상으로 꾸준히 채울 수 있으면 EC2 + SP, 그 이하면 Fargate가 일반적으로 유리하다.

## 다른 클라우드의 컨테이너 서비스와 비교

AWS ECS·EKS·Fargate가 어떤 위치인지 GCP·Azure와 비교하면 윤곽이 더 선명해진다.

| 차원 | AWS | GCP | Azure |
|------|-----|-----|-------|
| 매니지드 K8s | EKS | GKE (Autopilot/Standard) | AKS |
| K8s 컨트롤 플레인 비용 | $0.10/h | Standard 무료, Autopilot 무료 | 무료 (Free tier) |
| 서버리스 컨테이너 | Fargate, App Runner | Cloud Run, GKE Autopilot | Container Apps, Container Instances |
| 독자 오케스트레이터 | ECS | (없음) | (없음) |
| 온프레 확장 | ECS Anywhere, EKS Anywhere | Anthos | Azure Arc, AKS HCI |
| 자동 노드 프로비저닝 | Karpenter (오픈소스) | GKE Autopilot 내장 | AKS Node Auto-provisioning (Preview) |

GCP의 GKE Autopilot이 가장 "운영 부담 0" 방향에 가깝고, AWS는 EKS Auto Mode(2024년 말)로 같은 방향으로 따라갔다. Azure AKS는 K8s에 집중하고 독자 오케스트레이터는 만들지 않았다. AWS가 ECS를 계속 유지하는 이유는 "K8s가 너무 무겁다"는 시장 일부 수요 때문이다.

> 📚 **사례**: 2022년 Snapchat 모기업 Snap이 일부 워크로드를 GCP에서 AWS로 마이그레이션할 때, GCP의 GKE에서 EKS로 옮기는 작업이 가장 큰 비용·기간 항목이었다. 매니페스트는 그대로 가져왔지만 IAM 통합(Workload Identity → IRSA), Ingress(GCP Load Balancer → AWS ALB Controller), Persistent Volume(GCP PD → EBS) 매핑을 모두 다시 짜야 했다. K8s가 표준이어도 클라우드 통합 레이어는 표준화되지 않았다는 교훈.

## App Runner: 운영 부담을 더 낮춘 선택지

ECS Fargate조차 "VPC, ALB, Service, Task Definition을 다 만들어야 한다"는 부담이 있다. App Runner(2021년 GA)는 그 위 한 단계 더 추상화된 PaaS다. GitHub 저장소 또는 ECR 이미지를 가리키면 자동 빌드·배포·URL 부여까지 끝난다. Heroku의 AWS 버전이라고 보면 정확하다.

- **장점**: VPC·ALB·Service 구성 불필요, 0→N 자동 스케일링, 일시 정지 모드(요청 없을 때 0으로 축소).
- **단점**: VPC 내부 리소스 접근에 추가 설정 필요(VPC Connector), 고급 네트워킹·서비스 메시 통합 제한, Fargate보다 vCPU·메모리당 단가가 더 비쌈.

시나리오 키워드로 정리하면:

- "GitHub Push → 자동 배포" + "운영 부담 최소" + "단일 서비스" → **App Runner**
- "마이크로서비스 10개 + ALB + Service Discovery" → **ECS Fargate**
- "K8s 표준 + 멀티 클라우드" → **EKS**

> ⚠️ **함정**: "ECS Fargate보다 App Runner가 항상 더 싸다"는 보기는 오답이다. App Runner는 운영 단가가 더 비싸고, 다만 운영 부담이 낮다. 트래픽이 많은 production에서는 ECS Fargate + Capacity Provider 조합이 더 저렴할 수 있다.

## ECS Anywhere vs EKS Anywhere: 컨트롤 플레인의 위치가 다르다

하이브리드 환경에서 자주 헷갈리는 두 서비스다. 이름이 비슷해서 같은 패턴 같지만 정반대의 구조다.

| 항목 | ECS Anywhere | EKS Anywhere |
|------|--------------|--------------|
| 컨트롤 플레인 위치 | **AWS 클라우드** | **온프레미스** (고객 인프라) |
| 데이터 플레인 위치 | 온프레미스 | 온프레미스 |
| 인터넷 연결 | 컨트롤 플레인 호출을 위해 필요 | 에어갭(완전 격리) 환경 지원 |
| 라이선스 | 외부 인스턴스당 시간 과금 | EKS Distro 무료 + 지원 별도 |
| 사용처 | "AWS에 있는 ECS와 같이 관리" | "온프레미스에서 K8s 운영, 일관성 위해 EKS-D" |
| 비교: ECS on Outposts | 컨트롤 플레인 AWS, 노드 Outposts (AWS 하드웨어) | (해당 없음) |

> 🎯 **시나리오**: "한 제조사가 공장 100개에 산업용 IoT 게이트웨이를 운영한다. 일부 공장은 인터넷이 끊겨도 워크로드가 자율적으로 동작해야 한다. 어느 옵션이 적합한가?" — **EKS Anywhere**. 컨트롤 플레인이 온프레에 있어 에어갭 환경에서도 동작한다. ECS Anywhere는 컨트롤 플레인 호출이 필요하므로 인터넷 단절 시 신규 배포·스케일링이 정지된다.

> 🔍 **더 깊이**: EKS Anywhere는 내부적으로 **EKS Distro (EKS-D)**라는 오픈소스 K8s 배포판을 쓴다. AWS가 EKS에서 검증한 K8s + 컴포넌트(coredns, etcd, kube-proxy, CNI) 조합을 그대로 패키징해 공개한 것. 그래서 같은 K8s 버전·동일 동작을 클라우드와 온프레에서 보장한다. 이 모델은 GCP의 Anthos(GKE on-prem)와 같은 발상이다. Anthos는 GKE를 GCP에서 운영하는 컨트롤 플레인까지 묶어주지만, EKS Anywhere는 컨트롤 플레인까지 온프레에 둔다는 점이 다르다.

## Capacity Provider: Fargate Spot으로 비용을 70% 줄이기

ECS Service를 만들 때 "이 작업을 어디에 배치할지"를 추상화하는 게 Capacity Provider다. 3종류가 있다.

- **FARGATE**: 표준 Fargate (On-Demand)
- **FARGATE_SPOT**: Fargate Spot (최대 70% 할인, 2분 SIGTERM 후 회수)
- **EC2 ASG**: 사용자가 만든 ASG (Spot Fleet 포함 가능)

이 셋을 가중치(weight)와 베이스(base)로 혼합한다. 예를 들어 base=2, FARGATE weight=1, FARGATE_SPOT weight=4로 설정하면:

- 첫 2개 Task는 무조건 FARGATE (base)
- 그 이후로는 FARGATE 20%, FARGATE_SPOT 80% 비율로 배치

이렇게 하면 최소 2개의 안정적 Task로 가용성을 보장하면서, 나머지는 Spot으로 비용을 60-70% 줄일 수 있다. SAP에서 "비용 효율 + 가용성 둘 다 만족" 시나리오의 가장 흔한 정답 패턴이다.

> 📚 **사례**: 2023년 Pinterest는 일부 백엔드 워크로드를 ECS Fargate + Fargate Spot 80% 혼합으로 전환해 컨테이너 인프라 비용을 약 40% 절감했다고 발표했다. Spot 중단에 대비해 `STOPTIMEOUT` 환경 변수를 60초로 늘리고 SIGTERM 핸들러로 in-flight 요청을 graceful drain하는 패턴을 사용했다. AWS re:Invent 2023 발표.

## ECS Exec: SSH 없이 컨테이너에 들어가기

운영 중에 "이 컨테이너 안에 들어가서 디버깅하고 싶다"는 요구가 늘 생긴다. 전통적으로는 SSH 키를 노드에 박아넣고 `docker exec`로 들어갔지만, 이는 보안적으로 끔찍하다. ECS Exec(2021)는 SSM Session Manager를 백본으로 SSH 없이 직접 컨테이너 셸 접속을 제공한다.

```bash
aws ecs execute-command \
  --cluster prod \
  --task <task-id> \
  --container app \
  --interactive \
  --command "/bin/sh"
```

내부 동작은 ECS Agent 안에 SSM Agent를 같이 띄워서, SSM이 SSH 대체 채널 역할을 한다. 모든 세션은 CloudTrail에 기록되고, 옵션으로 S3·CloudWatch Logs에 세션 내용을 풀로 저장할 수 있다. 감사·규제 환경에서 필수.

## 정리하며

오늘 본 그림은 한 장의 지도다. **컨트롤 플레인은 ECS(AWS 독자, 무료) 또는 EKS(K8s 표준, 시간당 $0.10)** 중에서 고르고, **데이터 플레인은 EC2(노드 직접 관리, 비용 우위) / Fargate(서버리스, 운영 부담 0) / Anywhere(온프레)** 중에서 고른다. 그리고 더 단순한 PaaS가 필요하면 App Runner가 한 단계 위에 있다.

다음 day에서는 EKS 내부의 노드 그룹, IRSA, Karpenter를 깊이 본다. EKS는 SAP에서 도메인 1·2·3 전반에 흩어져 출제되고, 특히 IRSA와 Karpenter가 단골 출제 영역이다. 오늘 그린 지도가 그 안에서 어떻게 채워지는지가 다음 글의 주제다.

---

## 📝 연습 문제

**문제 1.** 한 글로벌 핀테크가 AWS·GCP·온프레미스 데이터센터에 동일한 K8s 워크로드를 배포한다. 운영팀은 클러스터 컨트롤 플레인 운영(etcd 백업, 버전 업그레이드)의 부담을 AWS에서만큼은 줄이고 싶다. 이 요구를 가장 잘 만족하는 조합은?

A) ECS Fargate
B) EKS + Managed Node Group
C) App Runner
D) ECS Anywhere

**정답: B**
해설: 키워드 두 개를 분해해야 한다. "K8s 표준 + 멀티 클라우드 이식성" → EKS(K8s API), "컨트롤 플레인 운영 부담 최소" → AWS가 매니지드 → EKS 컨트롤 플레인. ECS(A, D)는 AWS 독자 API라 이식성이 깨진다. App Runner(C)는 K8s 매니페스트와 호환되지 않는 PaaS다. 추가 학습 포인트: 이식성을 더 끌어올리려면 IRSA 대신 Workload Identity Federation을 표준화하거나, External Secrets Operator로 비밀 관리도 추상화하는 패턴이 흔하다.

---

**문제 2.** ECS Task가 시작될 때 ECR에서 이미지 Pull은 잘 되는데, 애플리케이션 코드가 S3 GetObject를 호출하면 AccessDenied가 발생한다. 원인은?

A) Task Execution Role에 S3 권한이 없음
B) Task Role에 S3 권한이 없음
C) VPC Endpoint 미설정
D) 보안 그룹에서 443 차단

**정답: B**
해설: 이미지 Pull이 정상이라는 사실은 Task Execution Role의 ECR/CloudWatch 권한이 잘 설정되어 있다는 의미. 애플리케이션 코드의 AWS API 호출은 **Task Role**(=`taskRoleArn`)을 사용한다. Execution Role과 Task Role을 혼동하면 시험에서 한 문제 잃는다. A는 인프라 작업 권한이라 무관. C(VPC Endpoint)는 latency·비용 최적화이지 권한 문제는 아니고, 미설정이어도 NAT 통해 동작은 한다. D(보안 그룹)는 아예 연결 자체가 안 되어 timeout 에러가 났을 것. 추가: 동일 패턴이 EKS에서는 Node Role vs IRSA로 나타난다.

---

**문제 3.** 한 미디어 스타트업이 코드 한 줄 푸시로 자동 빌드·배포·HTTPS 엔드포인트 부여까지 되는 가장 운영 부담이 적은 옵션을 찾는다. 사이드카·서비스 메시·고급 VPC 통합은 필요 없다. 어느 서비스가 적합한가?

A) ECS Fargate + ALB
B) EKS + ArgoCD
C) App Runner
D) Elastic Beanstalk

**정답: C**
해설: App Runner는 GitHub 저장소 또는 ECR 이미지만 지정하면 빌드·배포·도메인·자동 스케일링까지 일괄 제공하는 가장 단순한 PaaS다. A는 운영 부담이 더 크다(ALB, Target Group, Service Definition 직접 구성). B는 K8s + GitOps라 운영 부담이 매우 큼. D(Beanstalk)는 EC2 기반의 더 무거운 옵션이고 컨테이너 PaaS로는 App Runner가 더 새롭고 단순. 함정: "ECS Fargate가 더 싸지 않냐"는 함정이 있는데, App Runner는 운영 부담을 줄이는 대가로 단가가 약간 더 비싸다. SAP는 "운영 부담 최소"가 강조되면 단가가 아닌 운영 부담으로 답을 골라야 한다.

---

**문제 4.** 트래픽이 매우 변동성 높고 새벽엔 거의 0인 ECS 백오피스 API. 가용성 일부 보장 + 비용 절감 둘 다 원한다. 어떤 Capacity Provider 구성?

A) FARGATE 100%
B) FARGATE_SPOT 100%
C) base=2 FARGATE, weight FARGATE=1 + FARGATE_SPOT=4
D) EC2 Launch Type + Reserved Instance

**정답: C**
해설: base=2로 안정적 Fargate Task 2개를 항상 유지(Spot 회수에도 끊김 방지) + 그 위 트래픽은 80% Spot으로 비용 절감. A는 비용 면에서 최악. B는 모든 Task가 Spot이라 동시 회수 시 서비스 중단 위험. D는 트래픽이 0인 새벽에도 EC2 비용이 발생하므로 가변 워크로드에 부적합. 추가 학습 포인트: Spot 중단 대비로 `STOPTIMEOUT`을 60~120초로 늘리고 SIGTERM 핸들러를 구현해야 한다.

---

**문제 5.** 한 제조사가 100개 공장의 산업용 게이트웨이에서 컨테이너 워크로드를 운영한다. 일부 공장은 며칠씩 인터넷이 끊긴다. 컨트롤 플레인은 공장 내부에서 동작해야 한다. 적합한 서비스는?

A) ECS Anywhere
B) EKS Anywhere
C) Outposts
D) Snowball Edge

**정답: B**
해설: "인터넷 끊겨도 컨트롤 플레인 자율 동작" = 컨트롤 플레인이 온프레에 있어야 함. EKS Anywhere가 정확히 이 모델(컨트롤 플레인 + 데이터 플레인 모두 온프레). ECS Anywhere(A)는 컨트롤 플레인이 AWS 클라우드라 인터넷 끊기면 신규 배포·스케일링 불가. Outposts(C)는 AWS 하드웨어를 고객 시설에 두지만 컨트롤 플레인 호출은 여전히 AWS 리전 필요. Snowball Edge(D)는 데이터 전송용 디바이스라 무관. 추가: EKS Anywhere는 내부적으로 EKS-D(EKS Distro) 오픈소스 K8s를 쓰며, 같은 K8s 버전을 클라우드/온프레에서 일관되게 보장한다.

---

**문제 6.** 한 회사가 EKS Pod에서 S3에 접근해야 한다. 운영팀은 "Pod별로 최소 권한"을 달성하고 싶다. 가장 안전한 방법은?

A) 워커 노드 Instance Profile에 S3 권한 부여
B) Pod 환경 변수로 AWS Access Key Secret 주입
C) IRSA (IAM Roles for Service Accounts) 또는 EKS Pod Identity
D) S3 버킷 정책에 노드 IP 허용

**정답: C**
해설: A는 노드 위의 모든 Pod이 권한을 공유하므로 최소 권한 위반(blast radius 큼). B는 키 회전 어렵고 코드/로그에 키가 노출될 위험. D는 IAM이 아닌 IP 기반이라 이동 가능한 EKS 환경에 부적합하고 최소 권한 모델이 아니다. C가 정답으로, IRSA는 ServiceAccount → IAM Role 매핑을 OIDC 기반으로 안전하게 수행한다. Pod Identity는 IRSA의 후속(2023)으로 더 간단한 신뢰 모델. 추가 학습: 2019년 Capital One 사고도 EC2 Instance Profile 과대 권한이 직접 원인이었다.

---

**문제 7.** ECS 컨테이너 안에서 디버깅을 위해 셸에 접속해야 한다. 회사 보안 정책은 SSH 키 사용을 금지하고, 모든 세션을 감사 로깅해야 한다. 가장 적합한 방법은?

A) 노드에 SSH 키를 배포하고 docker exec
B) Bastion Host + SSM Port Forwarding
C) ECS Exec (`aws ecs execute-command`)
D) Cloud9 IDE 연결

**정답: C**
해설: ECS Exec는 SSM Session Manager를 백본으로 SSH 없이 컨테이너 셸 접속을 제공하고 모든 세션이 CloudTrail에 기록된다. 추가로 S3·CloudWatch Logs에 세션 내용을 저장 가능. A는 SSH 키 정책 위반. B는 노드 OS 접근일 뿐 컨테이너 내부가 아니고 운영 부담도 크다. D(Cloud9)는 IDE이고 컨테이너 직접 접속용이 아니다. 추가: ECS Exec를 켜려면 Task Definition에 `enableExecuteCommand=true` + Task Role에 `ssmmessages:*` 권한이 필요하다.

---

## 📌 오늘의 요약

1. **ECS = AWS 독자·무료**, **EKS = K8s 표준·$0.10/h**, **Fargate = 데이터 플레인 옵션**(별도 오케스트레이터 아님)
2. ECS의 4개 개념: Cluster / Service / Task / Task Definition + **Task Role**(앱) vs **Execution Role**(인프라)
3. EC2 Launch Type은 Bin Packing으로 단가 우위, Fargate는 Spiky·운영 부담 0에서 우위
4. **Capacity Provider**로 FARGATE + FARGATE_SPOT 혼합 → 가용성 + 비용 둘 다
5. **App Runner**는 PaaS, **ECS/EKS Anywhere**는 하이브리드(컨트롤 플레인 위치가 다름)
6. **ECS Exec**으로 SSH 없는 디버깅, 모든 세션이 CloudTrail에 기록
