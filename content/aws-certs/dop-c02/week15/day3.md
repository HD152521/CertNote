# Day 3 - 대규모 ECS/EKS 운영: 100+ 마이크로서비스를 떠받치는 스케줄링·GitOps·비용의 원리

컨테이너 플랫폼이 십여 개 서비스에서 백여 개로 자라면, 운영의 무게중심이 "컨테이너를 어떻게 띄우나"에서 "수백 개를 어떻게 일관되게, 싸게, 안전하게 굴리나"로 옮겨간다. 그러면 세 가지 통증이 동시에 온다. **스케줄링**(트래픽이 출렁일 때 노드를 얼마나 빨리, 어떤 종류로 띄울 것인가), **드리프트**(누가 무엇을 배포했고 클러스터의 실제 상태가 의도한 상태와 일치하는가), **비용**(피크에 맞춰 깐 노드가 새벽엔 놀고 있다). 오늘은 100개 넘는 마이크로서비스, 피크 10만 RPS, 서울·도쿄 Active-Active, 그리고 "전년 대비 20% 비용 감축"이라는 현실적 압박을 받는 조직을 놓고, Karpenter·GitOps·Pod Identity·Container Insights·Graviton/Spot이 이 세 통증을 어떻게 푸는지 — 그 밑에 깔린 스케줄링 이론과 선언적 시스템 이론을 함께 판다.

DOP 시험에서 이 영역은 "분 단위가 아닌 초 단위로 다양한 인스턴스를 동적으로 띄우려면", "매니페스트 변경을 Git revert 한 번으로 롤백하려면", "신규 EKS에서 OIDC 셋업 없이 파드별 IAM을 주려면", "컨테이너 비용을 30~40% 줄이려면" 같은 시나리오로 반복 등장한다. 각 선택지가 Karpenter·GitOps·Pod Identity·Graviton/Spot 중 무엇을 건드리는지 읽어내면 답이 보인다.

## ECS Fargate vs EKS — 추상화 수준의 선택

플랫폼 선택의 본질은 "운영 부담을 얼마나 AWS에 떠넘기고, 제어를 얼마나 손에 쥘 것인가"의 trade-off다.

| 워크로드 특성 | 선택 | 이유 |
|---------------|------|------|
| 단순 웹/배치, 운영 부담 최소 | **ECS Fargate** | 노드 관리 없음, 서버리스 컨테이너 |
| 커스텀 스케줄러·풍부한 Service Mesh·생태계 | **EKS** | 쿠버네티스 표준, 제어 강함 |
| 비용 민감 대규모 long-running | **EKS + Karpenter + Spot** | 세밀한 노드 비용 최적화 |
| 매우 짧은 작업 | **Lambda 또는 Fargate** | 호출당 과금, 유휴 비용 0 |

이 조직은 혼합 전략을 쓴다 — 세밀한 제어가 필요한 결제계는 EKS, 단순한 일반계 70%는 ECS Fargate.

> 💡 **관련 이론**: 이 선택은 **추상화의 비용(cost of abstraction)** 원리의 적용이다. Fargate는 노드를 추상화해 운영 부담을 없애지만, 그 대가로 노드 수준 최적화(인스턴스 타입 선택, Spot 세밀 제어, 커널 튜닝)의 손잡이를 빼앗는다. EKS는 손잡이를 다 주지만 컨트롤 플레인 업그레이드·CNI·애드온·노드 관리라는 운영 세금을 물린다. CS 일반 원리로 "추상화는 공짜가 아니다 — 편의를 얻으면 제어를 잃는다"는 leaky abstraction의 역(逆)이다. 성숙한 조직은 워크로드별로 추상화 수준을 다르게 고른다: 비용·제어가 결정적인 소수(결제)엔 낮은 추상화(EKS+노드 제어), 운영 단순성이 중요한 다수(일반 웹)엔 높은 추상화(Fargate). 한 가지 도구로 전부를 덮으려는 시도가 오히려 안티패턴이다.

## Karpenter — 스케줄링을 재발명하다

EKS의 전통적 오토스케일러인 **Cluster Autoscaler(CA)**는 ASG(Auto Scaling Group)를 전제로 동작한다. 파드가 뜰 자리가 없으면 CA가 ASG의 desired capacity를 늘리고, ASG가 사전 정의된 인스턴스 타입으로 노드를 띄운다. 문제는 (1) ASG라는 중간 계층을 거쳐 느리고(분 단위), (2) 인스턴스 타입이 ASG에 사전 고정돼 유연하지 않다는 것이다.

**Karpenter**(AWS가 2021년 오픈소스로 발표)는 이 구조를 갈아엎는다. ASG를 거치지 않고 **펜딩 파드의 실제 리소스 요구를 보고 EC2 API로 직접 노드를 띄운다.** 어떤 인스턴스 타입이 그 파드들에 가장 잘 맞고 가장 싼지를 실시간으로 계산해(bin-packing), On-Demand·Spot·Graviton을 동적으로 섞는다.

| 항목 | Cluster Autoscaler | Karpenter |
|------|-------------------|-----------|
| 노드 그룹 | ASG 필수 | ASG 없이 EC2 직접 |
| 스케줄링 속도 | 분 단위 | 초 단위 |
| 인스턴스 선택 | 사전 정의(ASG 고정) | 동적(파드 요구 기반) |
| Spot 처리 | 가능 | 더 유연(중단 처리·다양화) |
| 빈 노드 정리 | 느림 | 적극적 consolidation |

> 🔍 **더 깊이**: Karpenter의 핵심은 **bin-packing 최적화**다. 이는 CS의 고전 NP-hard 문제 — "크기가 다른 물건들을 최소 개수의 상자에 채워라" — 의 실시간 근사다. Karpenter는 펜딩 파드들의 CPU·메모리·GPU 요구를 보고, "이 파드들을 담을 가장 비용 효율적인 인스턴스 조합"을 휴리스틱으로 푼다. 게다가 **consolidation**으로 시간이 지나며 단편화된 노드를 재배치한다 — 절반만 찬 노드 두 개의 파드를 한 노드로 모으고 빈 노드를 종료해 비용을 줄인다(메모리 컴팩션과 같은 발상). CA가 "ASG 사이즈를 올리고 내리는" 단순 스칼라 제어라면, Karpenter는 "어떤 종류의 노드를 몇 개, 어떻게 배치"까지 푸는 조합 최적화다. 시험에서 "빠른 스케일 + 다양한 인스턴스 동적 선택 + Spot 유연 활용"이라는 단서 조합은 거의 항상 Karpenter를 가리킨다.

회복성을 위해 **Pod Disruption Budget(PDB)**(동시에 죽일 수 있는 파드 수 제한)과 **Topology Spread Constraints**(파드를 AZ·노드에 고르게 분산)를 함께 건다 — Spot 중단이나 노드 consolidation 중에도 서비스가 끊기지 않게 하는 안전장치다.

## GitOps — 클러스터 상태를 Git이 단일 진실로

100개 서비스의 배포를 `kubectl apply`로 사람이 직접 하면, 누가 무엇을 언제 바꿨는지 추적할 수 없고 클러스터 실제 상태가 의도와 어긋나는 드리프트가 쌓인다. **GitOps**가 이를 뒤집는다 — **Git 저장소가 클러스터의 목표 상태를 선언하는 단일 진실(single source of truth)**이 되고, 에이전트(Argo CD/Flux)가 클러스터를 그 상태로 끊임없이 수렴시킨다.

```
GitHub (App Repo)            GitHub (Manifests Repo)
      │                              │
      │ CodePipeline/Actions         │ Argo CD가 watch + reconcile
      ▼                              ▼
  Build → Image to ECR ─► Manifest의 Image Tag bump ─► EKS에 자동 반영
```

핵심은 **빌드와 배포의 분리**다. 애플리케이션 빌드는 CodePipeline/GitHub Actions가 하고 이미지를 ECR에 올린다. 배포는 별도 매니페스트 레포에 Argo CD가 reconcile한다. 롤백은 **Git revert 한 번** — 매니페스트를 이전 커밋으로 되돌리면 Argo CD가 자동으로 클러스터를 그 상태로 되돌린다.

> 💡 **관련 이론**: GitOps는 **제어 이론의 폐루프 제어(closed-loop control)**를 배포에 적용한 것이다. 쿠버네티스의 핵심 자체가 reconciliation loop — "현재 상태(observed)와 목표 상태(desired)의 차이를 계산해 0으로 수렴시키는" 제어기 — 이고, GitOps는 그 목표 상태의 출처를 Git으로 끌어올린다. 이는 **선언적(declarative) vs 명령적(imperative)**의 정수다. 명령적 배포(`kubectl apply`, 수동 스크립트)는 "어떻게 바꿀지"의 절차를 사람이 책임지지만, 선언적 GitOps는 "무엇이어야 하는지"만 선언하고 수렴은 시스템이 책임진다. 그 결과 (1) Git이 완전한 감사 로그가 되고(누가·언제·무엇을 PR로), (2) 드리프트가 자동 교정되며(누가 콘솔에서 손으로 바꿔도 Argo가 되돌림), (3) 롤백이 `git revert`라는 일상 동작이 된다. "변경의 출처를 버전 관리로, 수렴을 에이전트로"가 GitOps의 두 기둥이다.

## ECS Fargate 영역 — Blue/Green과 IaC

일반계 70%를 맡는 ECS Fargate에서는 다른 도구 조합이 표준이다. 트래픽 시프트는 **CodeDeploy Blue/Green + ALB Listener** — 새 Task 집합(Green)을 띄우고 ALB 리스너의 트래픽을 점진적으로 옮긴 뒤, 문제가 없으면 Blue를 내린다. Task Definition은 CDK로 IaC화해 환경별로 파라미터화하고, 서비스 간 통신은 App Mesh 또는 더 가벼운 **ECS Service Connect**로 잇는다.

> ⚠️ **함정**: ECS의 배포 컨트롤러 타입을 혼동하기 쉽다. 기본은 **Rolling Update(ECS 자체)**로, 기존 Task를 점진 교체한다 — 간단하지만 빠른 롤백·트래픽 시프트 제어가 약하다. **Blue/Green은 CodeDeploy 컨트롤러**(`deployment-controller type=CODE_DEPLOY`)를 지정해야만 동작하며, ALB의 두 Target Group(Blue/Green)과 Listener를 요구한다. 시험에서 "ECS에서 Canary/Linear 트래픽 시프트와 즉시 롤백"을 원하면 답은 CodeDeploy Blue/Green이지 기본 Rolling이 아니다. 반대로 "최소 설정으로 점진 교체"면 Rolling으로 충분하다.

## Pod Identity — IRSA의 후속 표준

EKS에서 파드가 AWS API(예: 결제 파드가 DynamoDB)를 호출하려면 파드별 IAM 자격 증명이 필요하다. 오랫동안 표준은 **IRSA(IAM Roles for Service Accounts)**였다 — 클러스터에 OIDC Provider를 세우고, ServiceAccount에 IAM Role을 어노테이션으로 연결하면, 파드가 OIDC 토큰으로 그 Role을 AssumeRole한다.

문제는 IRSA의 셋업 복잡성이다 — 클러스터마다 OIDC Provider를 만들고 IAM에 신뢰 관계를 등록해야 하며, 클러스터가 많으면 이 작업이 누적된다. **EKS Pod Identity**(2023년 출시)가 이를 단순화한다 — OIDC 셋업 없이 EKS Add-on(Pod Identity Agent)을 깔고, `create-pod-identity-association`으로 namespace·ServiceAccount·Role을 **직접 연결**한다.

```bash
aws eks create-pod-identity-association \
  --cluster-name prod \
  --namespace billing --service-account svc-billing \
  --role-arn arn:aws:iam::ACCT:role/BillingPodRole
```

> 💡 **관련 이론**: IRSA에서 Pod Identity로의 진화는 **신원의 단명화·간소화**라는 클라우드 신원의 일관된 방향의 한 장면이다(어제 본 IAM Roles Anywhere와 같은 가족). IRSA는 OIDC 신뢰 연합(federation)을 직접 노출해 강력하지만 셋업이 무겁고, IAM Role 신뢰 정책에 클러스터별 OIDC Provider ARN을 일일이 박아야 해 클러스터가 늘면 Role 정책이 복잡해진다. Pod Identity는 이 연합을 AWS가 관리하는 추상화 뒤로 숨겨, 같은 Role을 여러 클러스터에서 재사용하기 쉽게 만든다(신뢰 정책에 `pods.eks.amazonaws.com` 서비스 주체만 두면 됨). 본질은 "정적 노드 자격 증명(인스턴스 프로파일을 모든 파드가 공유) → 파드별 단명 자격 증명"이라는 최소 권한의 입자도(granularity) 향상이며, Pod Identity는 그것을 운영 부담 없이 달성한다. 시험에서 "신규 EKS, OIDC 셋업 없이 파드 IAM"이면 답은 Pod Identity다.

## 컨테이너 관찰성 — 3종 세트

수백 개 컨테이너의 상태를 보려면 메트릭·로그·트레이스를 일관되게 수집해야 한다. 표준 조합은 세 가지다.

- **Container Insights**: ECS/EKS의 클러스터·노드·파드·태스크 수준 메트릭을 CloudWatch에 자동 수집.
- **ADOT Collector(AWS Distro for OpenTelemetry)**: DaemonSet으로 떠서 메트릭·트레이스를 CloudWatch·Managed Prometheus로 전송. OpenTelemetry 표준 기반이라 벤더 종속이 약하다.
- **FireLens(Fluent Bit)**: 사이드카로 컨테이너 로그를 CloudWatch·Kinesis·S3·OpenSearch 등으로 **동시 분기** 라우팅.

> 🔍 **더 깊이**: 이 3종이 곧 관찰성(observability)의 세 기둥 — **메트릭·로그·트레이스** — 의 컨테이너 구현이다. 이 세 신호는 1990년대 SNMP 모니터링에서 출발해, 2010년대 Google의 Dapper 논문(분산 트레이싱)과 Twitter Zipkin·Prometheus가 각각을 발전시켰고, 2019년 **OpenTelemetry**(OpenTracing + OpenCensus 통합)가 트레이스·메트릭을 하나의 표준 SDK·와이어 포맷으로 묶으면서 통합됐다. ADOT가 OpenTelemetry 표준을 쓰는 것이 핵심 — 벤더(CloudWatch·Prometheus·Datadog·Grafana) 종속 없이 같은 계측 코드로 어디든 보낼 수 있다. FireLens가 Fluent Bit(경량 로그 프로세서)를 쓰는 이유도 같다: 로그를 한 곳이 아니라 여러 목적지(실시간 분석은 Kinesis, 장기 보관은 S3, 검색은 OpenSearch)로 동시에 보내는 fan-out 라우팅이 필요하기 때문이다. "메트릭은 무엇이 얼마나, 로그는 무슨 일이, 트레이스는 어디서 느려지는가"를 답한다.

## 비용 최적화 — Graviton·Spot이 핵심 레버

"전년 대비 20% 감축" 같은 압박에서 단일 최고 레버는 **컴퓨트 단가**다.

| 항목 | 액션 | 효과 |
|------|------|------|
| 노드 | Karpenter + Spot + Graviton | 컴퓨트 30~40% ↓ |
| 미사용 파드 | VPA 권고로 right-sizing | 과할당 제거 |
| Idle 클러스터 | 야간 환경 자동 축소(EventBridge→Lambda) | 비프로덕션 절감 |
| ECR 이미지 누적 | Lifecycle Policy 자동 삭제 | 스토리지 ↓ |
| Fargate Spot | 비핵심 워크로드 적용 | Fargate 단가 ↓ |
| 가시화 | Kubecost / Cost Categories | 책임 추적 |

> 💡 **관련 이론**: **Graviton(AWS ARM64 프로세서)**이 비용·전력에서 우위인 근본 이유는 ISA(명령어 집합 구조) 철학의 차이다. ARM은 RISC(Reduced Instruction Set Computing) 계열로, 단순·균일한 명령어로 트랜지스터당 전력 효율이 높다 — 본래 모바일에서 배터리 수명을 위해 진화한 특성이 데이터센터에선 와트당 성능과 비용으로 환산된다. AWS가 자체 설계(2018년 Graviton1, 2020년 Graviton2, 이후 3·4)해 마진을 줄이고 가격을 낮췄다. 30~40% 절감의 정체가 이것이다. 다만 함정: ARM64는 x86과 바이너리 호환이 안 되므로 **멀티 아키텍처 이미지 빌드(docker buildx)**가 필요하고, 일부 네이티브 의존성(특정 라이브러리)이 ARM 미지원일 수 있다. **Spot**은 다른 메커니즘 — AWS의 여유 용량을 최대 90% 할인으로 빌리되 2분 통보 후 회수될 수 있다 — 이라, PDB·Topology Spread·Karpenter의 Spot 중단 처리와 함께 써야 안전하다. "비용 30~40% 단일 액션"의 답은 거의 항상 Graviton+Spot 조합이다.

> 🎯 **시나리오**: "100+ 마이크로서비스, 피크 10만 RPS, 전년 대비 20% 비용 감축 압박. 결제계는 세밀 제어 필요, 일반계는 단순. 요구: ①트래픽 급변에 초 단위로 다양한 인스턴스를 동적으로 띄우고 Spot 활용 ②매니페스트 롤백을 Git 한 번으로 ③신규 EKS에서 OIDC 없이 파드 IAM ④컨테이너 비용 30%+ 절감." → ① EKS에 Karpenter + Spot/Graviton/On-Demand 혼합(결제계는 On-Demand 비율 유지), PDB·Topology Spread로 안전. ② 매니페스트 레포 + Argo CD GitOps, 롤백은 git revert. ③ EKS Pod Identity Association. ④ Graviton(arm64) 노드 그룹 + Spot + Fargate Spot(비핵심), VPA right-sizing, ECR Lifecycle Policy. 일반계 70%는 ECS Fargate + CodeDeploy Blue/Green. 관찰성은 Container Insights + ADOT + FireLens.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **ECS Fargate vs EKS는 추상화 수준의 선택**이며 — 편의 vs 제어 — 워크로드별로 다르게 고르는 혼합이 성숙한 패턴이다. 둘째, **Karpenter가 ASG를 거치지 않고 EC2 직접 + bin-packing 최적화**로 초 단위·동적 인스턴스 선택·consolidation을 달성한다. 셋째, **GitOps가 Git을 단일 진실로 두는 폐루프 제어**로 드리프트 자동 교정과 git revert 롤백을 준다(빌드/배포 분리). 넷째, **Pod Identity가 IRSA의 OIDC 셋업 부담을 없앤** 신원 간소화의 후속 표준이며, ECS는 Blue/Green에 CodeDeploy 컨트롤러가 필요하다. 다섯째, **Container Insights·ADOT·FireLens가 관찰성 3종**(메트릭·로그·트레이스, OpenTelemetry 표준)이고, **Graviton(RISC 전력 효율) + Spot**이 비용 30~40% 절감의 핵심 레버다.

다음 글에서는 이렇게 운영되는 시스템에서 사고가 났을 때 사람 없이 복구하는 **서버리스 대규모 인시던트 자동 대응**을 깊이 본다.

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
