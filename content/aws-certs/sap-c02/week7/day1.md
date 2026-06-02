# Day 31 - ECS vs EKS vs Fargate 선택 기준

📅 날짜: Week 7 (Day 1)
🎯 주제: 컨테이너 오케스트레이션 의사결정
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ECS·EKS·Fargate의 책임 분담을 정확히 이해한다
- 시나리오별 컨테이너 플랫폼 선택 기준을 습득한다
- 데이터 플레인(EC2 Launch Type vs Fargate Launch Type)의 트레이드오프를 안다
- ECS Anywhere·EKS Anywhere·App Runner와의 관계를 정리한다

---

## 🧩 사전 지식 (CS 기초)

- **컨트롤 플레인 vs 데이터 플레인**: 컨트롤 플레인은 스케줄러·API 서버(어디서 어떻게 실행할지 결정), 데이터 플레인은 실제 컨테이너가 실행되는 노드들.
- **컨테이너 오케스트레이션**: 컨테이너 배포·스케일링·헬스체크·롤링 업데이트를 자동화.
- **사이드카 패턴**: 메인 컨테이너 옆에 로깅·프록시·시크릿 페치 컨테이너를 함께 배포해 책임 분리.
- **클러스터·서비스·태스크**: ECS의 핵심 단위. EKS에서는 Pod·Deployment·Service.
- **OCI(Open Container Initiative)**: 컨테이너 이미지·런타임 표준. ECS·EKS 모두 OCI 호환.

---

## 📖 이론 내용

### 1. 세 서비스의 한 줄 정의

| 서비스 | 정의 | 컨트롤 플레인 |
|--------|------|--------------|
| **ECS** | AWS 독자 오케스트레이터 | AWS 매니지드 (무료) |
| **EKS** | Kubernetes 매니지드 | $0.10/h (클러스터당) |
| **Fargate** | 서버리스 데이터 플레인 | ECS·EKS에서 모두 사용 가능 |

핵심: **Fargate는 별도 오케스트레이터가 아니라 "데이터 플레인 옵션"**. ECS-on-Fargate 또는 EKS-on-Fargate로 사용한다.

### 2. ECS 핵심 구성

- **Task Definition**: 컨테이너 이미지·CPU·메모리·환경 변수·IAM Role·볼륨 정의 (JSON)
- **Task**: Task Definition의 실행 인스턴스
- **Service**: 원하는 Task 수 유지 + ALB 연결 + Deployment 전략
- **Cluster**: 논리 그룹 (EC2 또는 Fargate 용량)

### 3. EKS 핵심 구성

- **Pod**: 하나 이상의 컨테이너 묶음 (가장 작은 단위)
- **Deployment**: Pod의 desired state 관리
- **Service**: ClusterIP/NodePort/LoadBalancer로 Pod 노출
- **Node Group**: 워커 노드 그룹 (Managed/Self-Managed/Fargate Profile)
- **IRSA (IAM Roles for Service Accounts)**: ServiceAccount → IAM Role 매핑 (Pod별 권한)

### 4. Launch Type 비교 (ECS 기준)

| 항목 | EC2 Launch Type | Fargate Launch Type |
|------|----------------|---------------------|
| 노드 관리 | 사용자 | AWS |
| 비용 모델 | EC2 시간 | vCPU·메모리 초 단위 |
| 시작 시간 | 빠름 (이미 워밍업) | 약 30-60초 |
| GPU·고밀도 | 가능 | 제한적(GPU는 베타) |
| ENI | 공유 또는 awsvpc | Task당 ENI 1개 |
| 운영 부담 | 큼 (패치·AMI) | 작음 |
| 비용 효율 | 일정 사용량·예측 시 우위 | Spiky 워크로드 우위 |

### 5. 시나리오별 선택

| 시나리오 | 권장 | 이유 |
|---------|------|------|
| Kubernetes 표준·멀티클라우드 | **EKS** | 이식성 |
| AWS 위주·운영 단순화 | **ECS** | 무료·간단 |
| 트래픽 가변·서버 관리 싫음 | **Fargate** | 서버리스 |
| 고밀도 GPU·ML 트레이닝 | **EKS + EC2 GPU 노드** | GPU 지원 |
| 매우 작은 마이크로서비스 1개 | **App Runner** | 더 간단 |
| 온프레미스에서 ECS 사용 | **ECS Anywhere** | 하이브리드 |

### 6. App Runner

- 완전 매니지드 컨테이너 PaaS
- 소스(GitHub) 또는 이미지(ECR) → URL 자동 부여
- 운영 부담이 ECS Fargate보다도 더 낮음 ("배포만 신경"수준)
- 단점: VPC 통합·고급 네트워킹·Service Discovery 제한, 가격 ECS Fargate보다 비쌈
- 시나리오: "내부 도구·작은 백엔드를 운영비 최소로"

### 7. ECS Anywhere / EKS Anywhere

- **ECS Anywhere**: 온프레 서버를 ECS Cluster의 외부 인스턴스로 등록. 컨트롤 플레인은 AWS 클라우드.
- **EKS Anywhere**: 온프레 단독 K8s 클러스터(컨트롤 플레인도 온프레). EKS-D(EKS Distro) 사용.
- 시험 함정: ECS Anywhere는 **컨트롤 플레인이 AWS**, EKS Anywhere는 **컨트롤 플레인이 온프레**.

### 8. Service Discovery·로드 밸런싱

- **ALB Target Group**: ECS Service·EKS Service 둘 다 연동
- **NLB**: TCP·UDP·정적 IP
- **Cloud Map**: ECS Service Connect의 백본 (Service Registry)
- **AWS App Mesh**: Envoy 사이드카 기반 Service Mesh (mTLS·트래픽 미러링·관찰성)

---

## 🧠 알아두면 좋은 심화 이론

### ECS Capacity Provider

- ECS 작업을 어디에 배치할지 추상화
- **FARGATE** + **FARGATE_SPOT** + **EC2 ASG** 혼합 가능
- 가중치로 Fargate vs Spot 비율 조절 → 비용 최적화

### EKS Fargate Profile

- Pod의 namespace·label에 매칭되는 것만 Fargate에 배치
- 시스템 Pod(kube-system)는 EC2, 워크로드는 Fargate 패턴

### Bottlerocket OS

- AWS가 만든 컨테이너 전용 미니 OS (불변 인프라)
- EKS·ECS 노드 AMI로 권장 — 보안 표면적↓, 부팅 빠름

### ECS Exec

- `aws ecs execute-command`로 컨테이너에 SSH 없이 셸 접속
- SSM Session Manager 백본 사용

---

## 🏗️ 아키텍처 다이어그램 — ECS Fargate + Capacity Provider

```
[ALB]
   │ HTTPS
   ▼
[ECS Service (Fargate)]
   │
   ├─ Capacity Provider: FARGATE (weight 1)
   ├─ Capacity Provider: FARGATE_SPOT (weight 4) ← 비용 최적화
   │
   ▼
[Task: app + Envoy 사이드카(App Mesh)]
   │
   ├─ Cloud Map → service.local
   └─ ECR → Image Pull
```

---

## ⭐ 핵심 포인트

1. ⭐ **Fargate = 데이터 플레인 옵션**, ECS·EKS 두 곳에서 사용
2. ⭐ ECS = 무료·간단 / EKS = K8s·이식성 / Fargate = 서버리스
3. ⭐ App Runner = 운영 부담 최소, VPC·기능은 제한
4. ⭐ ECS Anywhere(컨트롤 플레인 AWS) vs EKS Anywhere(컨트롤 플레인 온프레)
5. ⭐ Capacity Provider로 Fargate + Spot 혼합 → 비용↓
6. ⭐ EKS IRSA로 Pod별 IAM 권한 부여
7. ⭐ ECS Exec로 SSH 없는 디버깅

---

## 💻 실제 예시 - ECS Fargate Service 생성 (CLI)

```bash
# Task Definition 등록
aws ecs register-task-definition \
  --family myapp \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 256 --memory 512 \
  --execution-role-arn arn:aws:iam::xxx:role/ecsTaskExecutionRole \
  --container-definitions file://container.json

# Service 생성 (FARGATE + FARGATE_SPOT 혼합)
aws ecs create-service \
  --cluster prod \
  --service-name myapp-svc \
  --task-definition myapp \
  --desired-count 4 \
  --capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=1 \
    capacityProvider=FARGATE_SPOT,weight=4 \
  --load-balancers targetGroupArn=arn:...:tg,containerName=app,containerPort=80
```

### EKS Fargate Profile

```bash
eksctl create fargateprofile \
  --cluster myeks \
  --name fp-app \
  --namespace app-ns \
  --labels run-on=fargate
```

---

## 📝 연습 문제

**문제 1.** 회사는 멀티 클라우드 이식성을 중시하고 Kubernetes를 표준으로 채택하고 있다. 운영팀이 컨트롤 플레인 운영 부담을 줄이고 싶다. 어떤 서비스를 사용해야 하나?

A) ECS Fargate
B) EKS
C) App Runner
D) Lambda

**정답: B**
해설: Kubernetes 표준 = EKS. 컨트롤 플레인을 AWS가 매니지드한다. ECS는 AWS 독자 API라 멀티 클라우드 이식성이 낮다.

---

**문제 2.** 작은 내부 백엔드 API 하나를 GitHub Push만으로 자동 빌드·배포하고 싶다. 운영 부담을 최소화한다. 어떤 옵션?

A) ECS on EC2
B) EKS on Fargate
C) App Runner
D) Beanstalk

**정답: C**
해설: App Runner는 GitHub/ECR 소스로 컨테이너 PaaS를 제공한다. 운영 부담이 가장 낮다.

---

**문제 3.** 트래픽이 매우 가변적이고 새벽엔 거의 없는 API. 노드 운영을 피하면서 비용을 줄이고 싶다.

A) ECS on EC2 Reserved Instance
B) ECS on Fargate + Fargate Spot (Capacity Provider)
C) EKS on EC2 Self-Managed
D) Lambda Provisioned Concurrency

**정답: B**
해설: Spiky 워크로드 + 노드 관리 회피 = Fargate. Capacity Provider로 Fargate + Spot 혼합해 비용을 더 줄인다.

---

**문제 4.** 온프레 서버를 ECS Cluster의 외부 인스턴스로 등록해서 통합 관리하고 싶다. 컨트롤 플레인은 AWS에 둔다. 적합한 서비스는?

A) ECS Anywhere
B) EKS Anywhere
C) Outposts
D) Snowball Edge

**정답: A**
해설: ECS Anywhere는 컨트롤 플레인이 AWS에 있고 데이터 플레인을 온프레 서버로 확장한다. EKS Anywhere는 컨트롤 플레인까지 온프레에 있다.

---

**문제 5.** EKS Pod이 S3 버킷에 접근할 때 가장 안전한 방법은?

A) Node IAM Role에 S3 권한 부여
B) Pod에 액세스 키 환경변수
C) IRSA(IAM Roles for Service Accounts)
D) S3 버킷 정책에 0.0.0.0/0 허용

**정답: C**
해설: IRSA는 Pod별로 IAM Role을 부여해 최소 권한을 달성한다. Node Role은 Node 위의 모든 Pod이 공유해 권한이 과대해진다.

---

**문제 6.** ECS 작업 배치 전략 중 가용 영역에 균등 분산하면서 인스턴스 부하도 분산하려면?

A) binpack
B) random
C) spread by attribute:ecs.availability-zone + spread by instanceId
D) one-per-host

**정답: C**
해설: spread 전략을 AZ와 instanceId 두 차원으로 적용해 균등 분산을 달성한다.

---

**문제 7.** ECS 컨테이너에 SSH 없이 셸로 들어가 디버깅하고 싶다. 어떤 기능을 사용하나?

A) Session Manager
B) ECS Exec
C) Cloud9
D) AppStream

**정답: B**
해설: ECS Exec는 SSM Session Manager를 백본으로 컨테이너에 직접 셸 접속을 지원한다.

---

## 📌 오늘의 요약

1. ECS = AWS 독자·무료 컨트롤 플레인, EKS = K8s·시간당 요금
2. Fargate = 서버리스 데이터 플레인 (ECS·EKS 모두 적용)
3. App Runner = 운영 최소·기능 제한, ECS Fargate보다 비쌈
4. ECS Anywhere(컨트롤 플레인 AWS) ≠ EKS Anywhere(컨트롤 플레인 온프레)
5. Capacity Provider로 Spot 혼합 → 비용↓
6. IRSA로 Pod별 IAM, ECS Exec로 SSH 없는 디버깅
