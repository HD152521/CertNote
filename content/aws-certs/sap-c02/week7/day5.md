# Day 35 - Week 7 종합 — 컨테이너 시나리오 12문항으로 굳히기

한 주 동안 ECS·EKS·Fargate·Karpenter·IRSA·Service Connect까지 컨테이너 영역의 거의 모든 빌딩 블록을 봤다. 이제 SAP 시험이 실제로 이 블록을 어떻게 조합해 한 문제로 만드는지를 본다. 시험의 컨테이너 영역 출제는 단일 서비스 지식이 아니라 **블록의 조합**을 묻는다. "멀티 계정 + EKS + 비용 + 하이브리드"가 한 문항에 동시에 등장하고, 키워드 매칭만으로는 절반도 안 맞는다. 도메인 1(조직·신뢰성), 도메인 2(아키텍처·복원력), 도메인 3(보안·비용)이 컨테이너라는 공통 토대 위에서 어떻게 분기하는지가 핵심이다.

이 글은 12문항의 시나리오를 통해 한 주를 굳히는 시간이다. 각 문항은 단순 사실 확인이 아니라 **분기 판단**을 요구한다. 같은 시나리오의 한 문장만 바꾸면 정답이 다른 보기로 옮겨가는 패턴이 SAP의 전형이고, 그 분기점을 해설에서 명시한다. 마지막에 Week 7 전체 매핑을 한 장으로 정리한다.

## Week 7 한눈에 — 의사결정 트리

```
Q1. 컨테이너 워크로드 시작
     │
     ├─ 단순 배포·운영 0이 최우선?
     │     └─ Yes → App Runner
     │     └─ No  → 아래
     │
     ├─ K8s 표준 호환·멀티 클라우드 이식성?
     │     └─ Yes → EKS
     │     └─ No  → ECS
     │
     ▼
Q2. 데이터 플레인 선택
     │
     ├─ 운영 부담 최소? → Fargate
     ├─ Bin Packing·고밀도? → EC2 Launch Type
     └─ 온프레미스? → Anywhere

Q3. 노드 오토스케일링 (EKS)
     ├─ 빠른 스케일·Bin Packing·Spot 자동? → Karpenter
     └─ ASG 기반 단순? → Cluster Autoscaler

Q4. Pod별 권한
     ├─ 다중 클러스터 권한 재사용? → Pod Identity
     ├─ OIDC 표준 호환? → IRSA
     └─ 노드 단일 권한 OK? → Instance Profile (anti-pattern)

Q5. 비용 최적화
     ├─ 24/7 일정 부하 → EC2 + Compute SP
     ├─ 가변 + 운영 0 → Fargate Spot + Compute SP
     ├─ 짧고 빈번 → Lambda
     └─ ARM 호환 → Graviton +20% 절감

Q6. 서비스 간 통신
     ├─ 풀 메시(mTLS·카나리) → App Mesh
     ├─ ECS 가벼운 메시 → Service Connect
     └─ 디스커버리만 → Cloud Map
```

이 트리가 머릿속에 그려지면 12문항을 풀면서 자기 답이 어느 가지에서 갈렸는지 확인할 수 있다.

## 시나리오 12문항

---

**문제 1.** 한 글로벌 핀테크가 AWS·GCP·온프레미스 3개 환경에 동일한 K8s 워크로드를 배포한다. AWS에서는 컨트롤 플레인 운영(etcd 백업, 버전 업그레이드)의 부담을 줄이고, 동일한 매니페스트를 다른 환경에도 그대로 적용할 수 있어야 한다. 가장 적합한 조합은?

A) ECS Fargate + Capacity Provider
B) EKS + Managed Node Group (또는 EKS Auto Mode)
C) App Runner + GitHub 자동 배포
D) ECS Anywhere

**정답: B**
해설: 두 가지 키워드를 분해해야 한다. "K8s 표준 + 멀티 클라우드 이식성" = EKS(K8s API). "컨트롤 플레인 운영 부담 최소" = AWS 매니지드 컨트롤 플레인 = EKS. A·D는 AWS 독자 API라 이식성이 깨짐. C는 PaaS로 K8s 매니페스트 호환 없음. 분기 판단: 같은 시나리오에서 "AWS에서만 운영, 운영 부담 최소"로 바뀌면 ECS Fargate가 답이 된다. 추가: 운영 부담을 더 줄이려면 EKS Auto Mode(2024) 검토.

---

**문제 2.** 한 회사가 EKS 클러스터를 30개 운영한다. 각 클러스터의 Pod이 S3·DynamoDB에 Pod별 최소 권한으로 접근해야 한다. 동일한 IAM Role을 모든 클러스터에서 재사용하기 쉬운 방법은?

A) EC2 Instance Profile에 권한 부여
B) IRSA (IAM Roles for Service Accounts)
C) EKS Pod Identity
D) Pod 환경 변수로 Access Key Secret 주입

**정답: C**
해설: "Pod별 IAM"은 IRSA·Pod Identity 둘 다 만족하지만, "다중 클러스터 권한 재사용"이 결정적 분기다. IRSA는 클러스터마다 OIDC Provider를 IAM에 등록하고 Trust Policy도 클러스터별. Pod Identity는 단일 principal(`pods.eks.amazonaws.com`)을 신뢰해 같은 Role을 모든 클러스터에서 재사용 가능. A는 노드 위의 모든 Pod이 권한 공유로 최소 권한 위반. D는 키 노출 위험. 분기: "OIDC 표준 호환·멀티 클라우드 친화"가 강조되면 IRSA가 답.

---

**문제 3.** 가변 트래픽의 EKS 클러스터. 다음을 모두 만족해야 한다. ① 스케일아웃 1분 이내 ② Pod requests에 따라 인스턴스 타입 매번 최적 선택 ③ Spot 혼합 자동 처리 ④ 노드 활용률 낮을 때 자동 통합. 어떤 도구가 적합한가?

A) Cluster Autoscaler + ASG
B) Horizontal Pod Autoscaler만
C) Karpenter
D) EKS Managed Node Group + Spot Allocation

**정답: C**
해설: Karpenter만 네 요구를 모두 만족. ASG를 건너뛰고 EC2 Fleet API로 직접 프로비저닝, NodePool에 다양한 인스턴스 후보군 선언, capacity-type spot/on-demand 둘 다 허용, Consolidation으로 노드 통합. CA는 ASG에 묶여 인스턴스 타입 고정·통합 약함. HPA는 Pod 수 조정으로 노드와 다른 레이어. MNG는 ASG 기반이라 Karpenter의 통합·재배치 없음. 분기: "ASG 기반 단순 패턴만 OK"면 CA가 답.

---

**문제 4.** ECS Fargate 백오피스 API. 평균 5 Task로 충분하지만 캠페인 때 30 Task까지 폭증. 1년 약정 가능, 일부 Task 회수 허용. 비용 최적 구성은?

A) FARGATE On-Demand 100% + EC2 Instance Savings Plans
B) FARGATE_SPOT 100%
C) Compute Savings Plans 5 Task 약정 + Capacity Provider(base=2 FARGATE + FARGATE_SPOT 80%)
D) EC2 Launch Type + Reserved Instance

**정답: C**
해설: 두 트래픽 특성(안정 5 Task baseline + 가변 spike)을 두 할인 레버로 매칭. SP로 baseline 약정, 그 위 가변은 Spot. base=2로 Spot 회수 시 최소 가용성. A는 EC2 Instance SP가 Fargate에 적용 안 됨. B는 전부 Spot이라 동시 회수 위험. D는 EC2 RI는 가변 spike에 비효율. 함정: Spot과 SP를 같이 못 쓴다는 오해. 둘은 다른 자원에 적용되어 공존.

---

**문제 5.** 한 미디어 스타트업이 코드 한 줄 푸시로 자동 빌드·배포·HTTPS 엔드포인트까지 운영 부담 없이 받고 싶다. 사이드카·서비스 메시·고급 VPC 통합은 불필요. 어느 서비스가 가장 적합한가?

A) ECS Fargate + ALB
B) EKS + ArgoCD
C) App Runner
D) Elastic Beanstalk

**정답: C**
해설: App Runner는 GitHub 또는 ECR을 가리키면 빌드·배포·도메인·자동 스케일링까지 일괄 제공하는 PaaS. A는 운영 부담 더 큼(ALB·TG·Service Definition). B는 K8s + GitOps로 운영 부담 매우 큼. D는 EC2 기반의 더 무거운 옵션. 함정: "ECS Fargate가 더 싸지 않냐"는 단가 함정. App Runner는 운영 부담 감소 대가로 단가 약간 더 비싸지만, 단순 백엔드 1개라면 손익분기점에서 우위.

---

**문제 6.** 한 핀테크가 ECS Fargate 마이크로서비스 30개를 운영한다. ① 모든 통신 mTLS ② 새 버전 5% 트래픽 카나리 ③ 서비스별 서킷 브레이커. 가장 적합한 조합은?

A) ALB Weighted Target Group + ACM Public Certificate
B) AWS App Mesh + ACM Private CA
C) Cloud Map만
D) Route 53 Weighted Routing

**정답: B**
해설: 풀 메시 기능 세 가지(mTLS·가중치 카나리·서킷 브레이커)는 App Mesh의 영역. ACM Private CA로 단명 인증서 자동 회전, Virtual Router로 5% 가중치, Virtual Node에 서킷 브레이커. A는 ACM Public이 외부 도메인용, ALB는 서킷 브레이커 없음. C는 디스커버리만, 메시 기능 없음. D는 DNS 레벨 가중치라 1% 단위 제어·서킷 브레이커 불가. 실무 메모: App Mesh EOL(2026.9) 이후 신규는 Istio가 표준이지만 SAP 시험은 출제 시점 기준.

---

**문제 7.** ECS Cluster 안 마이크로서비스 간 ① 서비스 디스커버리 자동 ② Envoy 사이드카 자동 주입 ③ CloudWatch 메트릭 자동 ④ 운영 부담 최소. 가중치 카나리는 불필요. 어떤 서비스가 적합한가?

A) App Mesh
B) ECS Service Connect
C) Cloud Map + 수동 클라이언트 LB
D) ALB per Service

**정답: B**
해설: Service Connect는 ECS Service 옵션 한 블록으로 Envoy 자동 주입·Cloud Map 자동 등록·재시도·메트릭 기본 제공. A는 풀 메시로 운영 부담 더 큼. C는 모든 통합 수동. D는 30개 서비스면 ALB 30개로 비용·운영 부담 큼. 분기: 가중치 카나리·mTLS·서킷 브레이커가 필요하면 App Mesh가 답.

---

**문제 8.** 한 제조사가 공장 100개에 산업용 게이트웨이 컨테이너 워크로드를 운영한다. 일부 공장은 며칠씩 인터넷이 끊긴다. 컨트롤 플레인이 공장 내부에서 자율 동작해야 한다. 가장 적합한 서비스는?

A) ECS Anywhere
B) EKS Anywhere
C) AWS Outposts
D) Snowball Edge

**정답: B**
해설: "인터넷 끊겨도 컨트롤 플레인 자율 동작" = 컨트롤 플레인이 온프레에 있어야 함. EKS Anywhere(EKS-D 기반) 정확히 그 모델. A는 컨트롤 플레인이 AWS 클라우드라 인터넷 단절 시 신규 배포·스케일링 정지. C는 AWS 하드웨어를 고객 시설에 두지만 컨트롤 플레인 호출은 AWS 리전 필요. D는 데이터 전송 디바이스로 무관. 분기: "온프레에서 ECS와 같은 관리 도구 사용"이면 ECS Anywhere(컨트롤 플레인 AWS).

---

**문제 9.** EKS 1.22 → 1.24 업그레이드. 가장 정확한 절차는?

A) Control Plane을 1.22 → 1.24로 한 번에 업그레이드
B) 노드 그룹을 먼저 1.24로 올린 뒤 Control Plane
C) Control Plane을 1.22 → 1.23 → 1.24로 단계적, 각 단계마다 노드 그룹·Addon 호환 확인 후 EBS CSI Driver Addon 설치(1.23+ 필수)
D) 새 1.24 클러스터를 만들고 워크로드 마이그레이션

**정답: C**
해설: EKS는 마이너 한 단계씩만 업그레이드 가능하고, 노드 그룹은 Control Plane과 ±1 마이너까지 허용. A는 EKS API 거부. B는 노드가 Control Plane보다 앞서면 호환 깨짐. D는 가능하지만 운영 부담·다운타임 큼. 함정: 1.23부터 in-tree EBS 플러그인 제거로 EBS CSI Driver Addon이 사실상 필수. 빠뜨리면 PVC 영원히 Pending. 핀테크 사례에서 결제 시스템 일부 지연 발생.

---

**문제 10.** EKS Pod의 CPU·메모리는 충분한데 새 Pod이 더 이상 스케줄링 안 된다. 노드 자원 외 다른 한계에 걸린 듯하다. 가장 운영 부담 적은 해결책은?

A) 더 큰 인스턴스로 노드 그룹 교체
B) VPC CNI Prefix Delegation 활성화
C) Calico CNI로 교체
D) Custom Networking 구성

**정답: B**
해설: 증상은 ENI 슬롯 고갈. AWS VPC CNI는 Pod에 VPC IP 직접 할당하는데, 인스턴스의 ENI 슬롯 한도(t3.medium ~17개)에 걸린다. Prefix Delegation은 ENI에 /28(16 IP) 할당해 슬롯 16배. 환경 변수 한 줄(`ENABLE_PREFIX_DELEGATION=true`)로 적용. A는 가능하지만 노드 교체·비용. C는 CNI 교체로 VPC SG·라우팅 통합 깨짐. D는 별도 서브넷·라우팅 설계 필요. 분기: VPC 서브넷 IP 고갈이면 Custom Networking이 답.

---

**문제 11.** 한 SaaS가 머신러닝 추론 워크로드(평균 100ms, 시간당 5만 회 호출, 메모리 3GB). 비용 최적 컴퓨트는?

A) Lambda
B) Fargate On-Demand
C) Fargate Spot
D) EC2 + Reserved Instance

**정답: A**
해설: 1ms 단위 청구 Lambda가 짧고 빈번한 호출에 최적. 100ms × 5만 = 5,000초/시간 = 약 1.4 시간 분량만 청구. Fargate(B·C)는 최소 1분 청구 + 미사용 시간도 Task가 떠 있으면 비용. EC2(D)는 1대 24시간 청구로 가장 비쌈. 함정: 메모리 3GB가 Lambda 한도(10GB) 안. 한도 초과·cold start 민감이면 Fargate가 답. Provisioned Concurrency로 cold start도 거의 제거 가능.

---

**문제 12.** 한 회사가 EC2와 Fargate를 동시 운영하고, 마이그레이션 중 워크로드를 EC2에서 Fargate로 이전할 예정. 1년 약정 할인을 받되 두 서비스에 모두 적용되고 마이그레이션 중에도 할인이 유지되어야 한다. 어떤 약정?

A) EC2 Instance Savings Plans
B) Compute Savings Plans
C) Standard Reserved Instance
D) Convertible Reserved Instance

**정답: B**
해설: Compute SP만 EC2 + Fargate + Lambda에 동시 적용, 마이그레이션 중 약정 한도 안에서 자동 따라감. A는 EC2 family·region 고정으로 Fargate 적용 불가. C·D는 RI로 EC2 전용. 추가: Compute SP 할인율(~66%)은 EC2 Instance SP(~72%)보다 약간 낮지만 유연성 premium. SP는 자동 적용이라 별도 인스턴스 지정 불필요. 함정: 단순 단가 비교로 EC2 Instance SP를 고르면 Fargate에 미적용.

---

## SAP 특화 관점 — 멀티 계정·Multi-Region·7R·WA 6 Pillar에서 컨테이너 보기

SAP 시험의 컨테이너 영역은 단순 "어떤 서비스를 쓰는가"가 아니라 **SAP 특화 관점과 결합**되어 출제된다. 같은 EKS·ECS 시나리오에 멀티 계정·Multi-Region·7R 마이그레이션·Well-Architected 6 Pillar가 한 겹씩 얹혀서, 키워드 매칭만으로는 정답이 안 나오는 구조다.

### 멀티 계정 — Organizations·SCP·Control Tower 위 컨테이너

대기업은 EKS·ECS 클러스터를 **계정별로 분리**해 운영한다. dev·staging·prod 각자 계정, 데이터팀·결제팀 각자 계정. 이때 ECR 이미지를 어떻게 공유하고, IAM Role을 어떻게 cross-account로 묶는지가 SAP의 단골 시나리오다.

**핵심 패턴 세 가지**:

1. **ECR Cross-Account Pull**: 중앙 "shared-services" 계정의 ECR에 모든 이미지를 푸시하고, 다른 계정의 ECS Task Execution Role 또는 EKS Node Role이 cross-account pull. ECR Repository Policy로 다른 계정 principal 허용.
2. **IRSA Cross-Account**: EKS 클러스터가 A 계정, S3 버킷이 B 계정. IRSA가 매핑한 IAM Role이 B 계정의 Role을 sts:AssumeRole로 chain 호출.
3. **SCP로 컨테이너 정책 강제**: Organizations SCP로 "EKS 클러스터는 반드시 IAM Roles Anywhere 비활성화", "ECS Task Definition은 반드시 awslogs driver만 허용" 같은 가드레일을 모든 계정에 강제.

> 🎯 **시나리오**: "한 기업이 Control Tower 위에 30개 계정 운영. dev·staging·prod 각자 EKS 클러스터를 가지고, 컨테이너 이미지는 중앙 계정에서만 빌드·배포. 운영팀은 모든 계정의 EKS Pod이 외부 인터넷으로 이미지를 직접 pull하지 못하게 강제하고 싶다. 어떤 조합?" — 답은 **중앙 계정 ECR + Repository Policy로 cross-account pull 허용 + SCP로 외부 레지스트리 차단 + 각 계정 VPC Endpoint(ECR·S3)**. SCP는 IAM의 권한 거부를 강제하는 가드레일이고, VPC Endpoint는 트래픽이 AWS 내부로만 흐르게 한다.

### Multi-Region — Active/Active vs Active/Passive 컨테이너 아키텍처

컨테이너 워크로드의 Multi-Region 패턴은 두 갈래다.

| 패턴 | 구조 | 적합 |
|------|------|------|
| **Active/Active** | 두 리전에 동일 ECS/EKS 클러스터, Route 53 Latency-based Routing | 글로벌 사용자·낮은 지연 |
| **Active/Passive** | 한 리전 운영, 다른 리전 Pilot Light 또는 Warm Standby | DR·낮은 RTO/RPO |

**ECR Cross-Region Replication**이 두 패턴 모두의 기반이다. 한 리전에 push하면 자동으로 다른 리전 ECR로 복제되어, DR 리전에서 즉시 이미지 사용 가능. **EKS는 자체 cross-region replication이 없으므로** Workload 매니페스트는 GitOps(ArgoCD·Flux)로 두 리전에 동기화하는 패턴이 표준.

데이터 레이어가 가장 어려운 부분이다. **DynamoDB Global Tables**(동기 multi-region), **Aurora Global Database**(비동기 < 1초 지연), **S3 Cross-Region Replication**(비동기) 중 워크로드의 일관성 요구에 맞춰 선택한다.

> 📚 **사례**: 2021년 12월 us-east-1 대규모 장애 때, Multi-Region Active/Active 구조였던 회사들(Netflix·Stripe 일부)은 트래픽을 us-west-2로 자동 전환해 영향을 최소화했다. 단일 리전 ECS만 운영했던 회사들은 짧게는 4시간, 길게는 9시간 동안 서비스 중단을 겪었다. SAP에서 "단일 리전 장애에도 RTO 5분 이내"가 강조되면 Active/Active + Route 53 Health Check가 표준 답.

> 🔍 **더 깊이**: Multi-Region 컨테이너의 비용은 무시할 수 없다. 두 리전에 같은 워크로드를 띄우면 인프라 비용이 약 2배. 이걸 줄이려면 **Pilot Light**(DB·minimal 인프라만 standby) 또는 **Warm Standby**(작은 규모로 운영)로 활성도를 낮춘다. RTO/RPO 요구가 분 단위까지 허용되면 Pilot Light가 비용 효율, 초 단위 RTO면 Active/Active.

### 7R 마이그레이션 전략에서 컨테이너의 위치

AWS 마이그레이션의 7R 프레임워크는 다음과 같다.

| R | 의미 | 컨테이너 매칭 |
|---|------|--------------|
| **Retire** | 폐기 | - |
| **Retain** | 그대로 유지 | - |
| **Rehost** | Lift & Shift (변경 없이 이전) | EC2 그대로 이전 |
| **Relocate** | VMware → AWS VMC | - |
| **Repurchase** | SaaS로 교체 | - |
| **Replatform** | 작은 수정으로 이전 | **컨테이너화 (Docker)** |
| **Refactor** | 아키텍처 재설계 | **마이크로서비스 + ECS/EKS** |

컨테이너는 Replatform과 Refactor의 핵심 도구다. 모놀리식 .war 파일을 Tomcat 컨테이너로 감싸서 ECS에 올리면 Replatform, 모놀리식을 30개 마이크로서비스로 쪼개 EKS에 올리면 Refactor.

> 🎯 **시나리오**: "한 기업이 온프레 모놀리식 Java 애플리케이션(.war + Tomcat)을 AWS로 이전한다. 코드 변경은 최소화하되 운영 부담을 줄이고 싶다. 어떤 7R 전략과 서비스 조합?" — 답은 **Replatform + ECS Fargate**. Dockerfile로 Tomcat + .war를 감싸서 컨테이너화하고, ECS Fargate에 올린다. EC2 Rehost는 운영 부담이 그대로 남고, EKS Refactor는 코드 변경이 크다.

> ⚠️ **함정**: "Lift & Shift = ECS Fargate"는 오답 패턴이다. 컨테이너화는 Lift & Shift가 아니라 Replatform이다. Lift & Shift는 변경 없이 옮기는 것이고, 컨테이너화는 최소한 Dockerfile 작성·이미지 빌드 변경이 필요하다.

### Well-Architected 6 Pillar에서 컨테이너 결정 매핑

| Pillar | 컨테이너 결정 |
|--------|--------------|
| **운영 우수성 (Operational Excellence)** | App Runner·Fargate·EKS Auto Mode로 운영 부담 최소화, ECS Exec로 SSH 없는 디버깅 |
| **보안 (Security)** | IRSA·Pod Identity로 Pod별 최소 권한, ACM Private CA + App Mesh로 mTLS, ECR Image Scanning |
| **신뢰성 (Reliability)** | Multi-AZ 분산, ALB Health Check, Multi-Region Active/Active, PodDisruptionBudget |
| **성능 효율 (Performance Efficiency)** | Karpenter로 적절한 인스턴스 자동 선택, Graviton·Inferentia로 적합 컴퓨트 |
| **비용 최적화 (Cost Optimization)** | Fargate Spot·Compute SP·Bin Packing 조합, 사용률 모니터링 |
| **지속 가능성 (Sustainability)** | Graviton(전력 효율 +20%), 사용률 향상으로 유휴 자원 감축, ARM 마이그레이션 |

> 💡 **관련 이론**: WA 6 Pillar는 트레이드오프 프레임워크이고, 한 결정이 여러 Pillar에 영향을 준다. 예를 들어 Karpenter Spot 100%로 가면 비용 효율은 ⭐⭐⭐인데 신뢰성은 ⭐로 떨어진다. SAP 시험은 "비용과 신뢰성 둘 다"라고 명시하면 base=2 + Spot 80% 같은 균형 구성이 답이 된다. 한 Pillar만 최대화하는 답은 거의 오답.

## Week 7 비교 매트릭스 — 두 서비스가 헷갈릴 때

| A | B | 결정 기준 (어느 쪽?) |
|---|---|----------------------|
| **ECS** vs **EKS** | "K8s 표준·멀티 클라우드 이식" → EKS, "AWS 위주·단순" → ECS |
| **Fargate** vs **EC2 Launch Type** | "운영 0·가변" → Fargate, "고밀도·24/7" → EC2 + SP |
| **Cluster Autoscaler** vs **Karpenter** | "ASG 단순" → CA, "빠름·통합·Spot 자동" → Karpenter |
| **IRSA** vs **Pod Identity** | "OIDC 표준·멀티 클라우드" → IRSA, "다중 클러스터 재사용" → Pod Identity |
| **Cloud Map** vs **Service Connect** | "디스커버리만" → Cloud Map, "ECS + Envoy·메트릭" → Service Connect |
| **Service Connect** vs **App Mesh** | "가벼움" → Service Connect, "mTLS·카나리·서킷" → App Mesh |
| **App Runner** vs **ECS Fargate** | "PaaS·운영 0" → App Runner, "세밀 제어·메시" → ECS Fargate |
| **ECS Anywhere** vs **EKS Anywhere** | "컨트롤 플레인 AWS" → ECS Anywhere, "컨트롤 플레인 온프레·에어갭" → EKS Anywhere |
| **EC2 Instance SP** vs **Compute SP** | "최대 할인·EC2만" → EC2 SP, "유연성·다중 서비스" → Compute SP |
| **Lambda** vs **Fargate** | "<5분 짧고 빈번" → Lambda, "분~시간 단위 가변" → Fargate |

## Week 7 한눈에 정리

```
오케스트레이션 ──► ECS(AWS 독자) / EKS(K8s 표준) / App Runner(PaaS)
데이터 플레인  ──► EC2 Launch / Fargate / Fargate Spot / Anywhere
스케일러       ──► HPA(Pod) / Karpenter(Node, 권장) / Cluster Autoscaler
Pod 권한       ──► IRSA(OIDC) / Pod Identity(다중 클러스터)
디스커버리·메시 ──► Cloud Map(레지스트리) / Service Connect(ECS) / App Mesh(풀)
하이브리드     ──► ECS Anywhere(컨트롤 AWS) / EKS Anywhere(컨트롤 온프레) / Outposts
비용 절감 레버 ──► Fargate Spot(-70%) + Compute SP(-66%) + Graviton(-20%)
업그레이드     ──► EKS 한 마이너씩, 노드 ±1, EBS CSI 1.23+ 필수
```

## 다음 주 예고

Week 8은 **서버리스 심화**다. Lambda 고급(레이어·extension·Provisioned Concurrency), Step Functions(워크플로 오케스트레이션), EventBridge(이벤트 라우팅), DLQ·재시도 전략, 이벤트 기반 마이크로서비스 아키텍처를 다룬다. 오늘 본 Lambda vs Fargate vs EC2 분기 판단이 Week 8 시작점이 된다. ECS·EKS의 한 단계 더 위(혹은 한 단계 더 가벼운 곳)에서 무슨 일이 일어나는지가 다음 주의 주제다.

한 주 동안 컨테이너 영역의 빌딩 블록을 모두 봤다. 시험에서 보기 4개 중 한두 개를 즉시 제외할 수 있는 감각이 생겼다면 충분하다. 나머지는 시나리오의 키워드 두세 개를 분해해서 정답 후보를 좁히는 훈련이고, 그게 다음 모의고사·시험에서 점수로 직결된다.
