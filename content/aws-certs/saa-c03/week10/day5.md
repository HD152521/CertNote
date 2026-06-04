# Day 50 - Week 10 종합: 비용 최적화를 하나의 사고 체계로 묶기

한 주 동안 비용을 네 축으로 나눠 봤다 — 컴퓨팅(Day 1), 스토리지(Day 2), 네트워크(Day 3), 거버넌스(Day 4). 시험을 앞두고 이걸 다시 떠올릴 때 흔히 빠지는 함정은 "각 서비스의 할인 옵션을 따로따로 암기"하는 것이다. 그러면 문제에서 키워드 하나만 비틀어도 무너진다. 비용 도메인(SAA 전체의 약 20%)을 제대로 다루려면 개별 옵션이 아니라 **그 뒤에 깔린 하나의 사고 체계**를 잡아야 한다. 그 체계의 핵심은 이것이다 — **비용 최적화는 워크로드의 속성(안정성·접근빈도·거리·책임주체)을 가격 모델에 매핑하는 작업**이다. 약정 가능하면 SP/RI, 내결함성 있으면 Spot, 접근빈도 모르면 Intelligent-Tiering, 거리가 멀면 CloudFront, 책임 분리가 필요하면 태그. 모두 같은 사고의 변주다.

이 글은 네 축을 가로지르는 "비용 최적화된 풀스택"을 하나로 조립한 뒤, 시험에 반복되는 키워드-정답 매핑을 압축하고, 12개의 시나리오 문제로 실전 감각을 점검한다. 각 문제는 단순 암기가 아니라 "왜 다른 옵션이 틀렸는가"까지 파고들어, 시험장에서 비슷하지만 다른 보기를 만났을 때 흔들리지 않게 만든다.

## 네 축을 하나의 아키텍처로 조립하기

비용 최적화의 진짜 모습은 단일 선택이 아니라 계층적 결합이다. 글로벌 사용자를 받는 전형적인 웹 서비스를 비용 관점에서 끝까지 최적화하면 이렇게 된다.

```
[ 비용 최적화된 풀스택 ]

  전 세계 사용자
       │
  CloudFront (엣지 캐시 + origin→edge 무료 전송 + 낮은 egress 단가)
       │ 가격 클래스로 지역 조절, Origin Shield로 히트율 ↑
       ▼
  ALB (cross-zone 기본 활성, Same-AZ 우선 토폴로지로 AZ 간 비용 억제)
       │
  ECS Fargate / EC2 (Graviton ARM으로 40% 가성비)
       │  ├─ 24/7 베이스라인 → Compute SP 3년 (~66% 할인)
       │  ├─ 예측 변동분    → Compute SP 1년
       │  ├─ 내결함 배치    → Spot (capacity-optimized + 다양화)
       │  └─ 짧은 스파이크   → On-Demand
       │  + Compute Optimizer로 각 계층 right-sizing
       ▼
  데이터 계층
   ├─ RDS/Aurora → Reserved Instance (SP 미적용!)
   ├─ DynamoDB   → On-Demand 또는 Provisioned + Gateway Endpoint(무료)
   └─ S3 → Intelligent-Tiering (패턴 불명) / Lifecycle (패턴 명확)
            + Bucket Keys(KMS 99%↓) + Gateway Endpoint(무료) + 멀티파트 정리

  [ VPC 내부 ]
   ├─ S3/DDB Gateway Endpoint (무료, NAT 우회)
   └─ SSM/ECR Interface Endpoint (사용량 클 때만, 사설 운영)

  [ 거버넌스 — Organizations 관리 계정 ]
   ├─ Consolidated Billing (볼륨 할인 합산 + SP/RI 공유)
   ├─ Cost Explorer (가시화·예측·이상탐지) / CUR → S3 → Athena (세밀 분석)
   ├─ Budgets + Actions (한도 초과 시 자동 차단)
   ├─ Cost Anomaly Detection (ML 급증 감지)
   ├─ Cost Allocation Tags (부서·프로젝트 분리)
   └─ SCP 가드레일 (비싼 인스턴스·리전 차단)

  [ 추천 도구 협업 ]
   Trusted Advisor (거친 청소) → Compute Optimizer (정밀 조정) → Storage Lens (S3 도메인)
```

이 그림에서 읽어야 할 메시지는 "비용은 한 곳에서 줄이는 게 아니라 모든 계층에서 동시에 줄인다"는 것이다. CloudFront로 전송을, SP로 컴퓨팅을, Intelligent-Tiering으로 스토리지를, 태그·Budgets로 책임과 통제를 — 네 축이 한 아키텍처 안에서 맞물린다.

> 💡 **관련 이론**: 이 계층적 결합은 **포트폴리오 이론**과 닮았다. 투자에서 위험-수익 특성이 다른 자산을 섞어 전체 포트폴리오를 최적화하듯, 비용 최적화는 안정성-할인-유연성 특성이 다른 가격 모델(SP·Spot·On-Demand)을 섞어 전체 지출을 최소화하면서 가용성 위험을 통제한다. "전부 Spot"이나 "전부 On-Demand" 같은 단일 선택은 포트폴리오로 치면 한 종목에 몰빵하는 것과 같아 비효율적이다. 워크로드를 분해해 각 조각에 맞는 모델을 입히는 분산이 핵심이다.

## 키워드-정답 매핑 압축표

시험은 결국 시나리오 속 키워드를 정답 서비스로 빠르게 변환하는 능력을 본다. 한 주의 핵심을 키워드 트리거로 압축한다.

| 시나리오 키워드 | 1순위 정답 | 헷갈리는 오답과 이유 |
|----------------|-----------|---------------------|
| 24/7 + 패밀리/리전 자유 | **Compute SP** | EC2 SP는 패밀리 고정, RI는 타입 고정 |
| 24/7 + 패밀리 고정 + 더 깊은 할인 | **EC2 Instance SP** | Compute SP보다 할인 깊지만 유연성 낮음 |
| RDS/Redshift/ElastiCache 약정 | **Reserved Instance** | SP는 이들에 적용 안 됨 |
| 내결함 배치 + 90% 절감 | **Spot** | RI는 약정 낭비, On-Demand는 비쌈 |
| Spot 인터럽션 줄이기 | **capacity-optimized + 다양화** | lowest-price는 회수 잦아짐 |
| 코드 변경 최소 + 단가 ↓ | **Graviton** | 인터프리터/컨테이너 워크로드 신호 |
| ML 기반 right-sizing | **Compute Optimizer** | TA는 규칙 기반 낭비 식별 |
| 유휴 EIP/미연결 EBS 식별 | **Trusted Advisor** | Compute Optimizer 아님 |
| S3 접근 패턴 모름 | **Intelligent-Tiering** | IA는 최소 보관·검색비 위험 |
| 재생성 가능 + 단일 AZ OK | **One Zone-IA** | 내구성 요건 있으면 부적합 |
| 7년 규제 보관 최저가 | **Glacier Deep Archive** | 즉시 검색 필요하면 Instant |
| 거의 안 꺼내지만 꺼낼 땐 즉시 | **Glacier Instant Retrieval** | Flexible/Deep은 검색 지연 큼 |
| SSE-KMS 호출 비용 ↓ | **S3 Bucket Keys** | SSE-S3는 KMS 기능 상실 |
| NAT로 S3/DDB 트래픽 폭증 | **S3/DDB Gateway Endpoint(무료)** | Interface EP는 ENI 비용 |
| 글로벌 정적 콘텐츠 전송비 ↓ | **CloudFront** | S3 직접은 비쌈 |
| 사설 접근(비S3/DDB) | **Interface Endpoint** | 사용량 클 때만 비용 이득 |
| 다수 VPC 확장 연결 | **Transit Gateway** | 소수면 Peering이 저렴 |
| 세분화 청구 + Athena 분석 | **CUR → S3** | Cost Explorer는 빠른 시각화 |
| 빠른 비용 그래프·예측 | **Cost Explorer** | CUR은 원본 데이터 |
| 예산 초과 자동 차단 | **Budgets Actions** | 알림만이면 Budgets/SNS |
| ML 비용 급증 탐지 | **Cost Anomaly Detection** | Budgets는 고정 임계 |
| 부서별 비용 분리 | **Cost Allocation Tags** | 활성화 시점부터 소급 없음 |
| 멀티 계정 커스텀 청구 | **Billing Conductor** | 리셀러·내부 차지백 |

> ⚠️ **함정**: 가장 자주 틀리는 세 쌍을 다시 강조한다. ① **SP vs RI** — "RDS/Redshift/ElastiCache"가 보이면 무조건 RI, 나머지 EC2 컴퓨팅은 SP. ② **Gateway vs Interface Endpoint** — S3/DDB면 무료 Gateway, 다른 서비스면 ENI 비용 드는 Interface. ③ **Cost Explorer vs CUR** — "Athena/세밀/SQL"이면 CUR, "빠른 그래프/예측"이면 Cost Explorer. 이 세 쌍의 경계만 정확해도 비용 문제의 절반이 풀린다.

> 📚 **사례**: 한 주 내내 본 비용 사고들을 한 줄로 묶으면 교훈이 선명하다. **Lyft**(Spot으로 ML 비용 절감 — 인터럽션을 정상으로 가정한 설계), **Dropbox**(탈클라우드로 7,500만 달러 절감 — 전송·저장 비용이 규모에서 거대해짐), **빌 쇼크**(노출 키·실수로 하룻밤 수만 달러 — Budgets Actions·Anomaly Detection이 방어막), **FinOps 운동**(비용은 엔지니어 모두의 책임 — 태그·Budgets·가시화로 문화 전환). 비용 최적화는 일회성 청소가 아니라 설계 단계부터 운영까지 이어지는 지속적 규율이라는 게 공통 메시지다.

## 헷갈리기 쉬운 비교 정리

| 비교 항목 | A | B | 판별 키워드 |
|----------|---|---|-----------|
| Compute SP vs EC2 Instance SP | 패밀리/리전 자유(~66%) | 패밀리 고정·더 깊은 할인(~72%) | "자유롭게 변경" vs "고정 대신 더 싸게" |
| SP vs RI | EC2/Fargate/Lambda | RDS/Redshift/ElastiCache | 서비스 이름 |
| Spot capacity-optimized vs lowest-price | 회수 최소화 | 최저가(회수 잦음) | "인터럽션 줄이기" |
| Intelligent-Tiering vs Lifecycle | 패턴 모름·자동 | 패턴 명확·규칙 | "예측 가능?" |
| Glacier Instant vs Flexible vs Deep | 즉시(ms) | 분~시간 | 검색 속도 요건 |
| Gateway vs Interface Endpoint | S3/DDB 무료 | 그 외·ENI 비용 | 대상 서비스 |
| CloudFront vs S3 직접 | 캐시·낮은 egress | 사용자 비례 비용 ↑ | "글로벌 전송비" |
| Cost Explorer vs CUR | 빠른 시각화·예측 | 세밀 원본·Athena | "SQL 세밀 분석?" |
| Budgets vs Anomaly Detection | 고정 임계 | ML 패턴 | "변동 큰 비용?" |
| Trusted Advisor vs Compute Optimizer | 규칙 기반 낭비 | ML right-sizing | "최적 크기 추천?" |

> 🔍 **더 깊이**: 이 표 전체를 관통하는 메타 패턴이 하나 있다 — AWS 비용 도구는 거의 모두 **"불확실성을 누가 떠안는가"**로 갈린다. Spot은 회수 불확실성을 고객이 떠안는 대신 90% 할인, SP는 미래 사용 불확실성을 고객이 약정으로 제거하는 대가로 할인, Intelligent-Tiering은 접근 패턴 불확실성을 AWS가 떠안고 소액 수수료를 받음, Budgets는 미래 비용 불확실성을 한도로 통제. 비용 문제를 만나면 "이 시나리오에서 어떤 불확실성이 핵심이고, 그걸 누가 떠안는 게 합리적인가"를 물으면 정답 구조가 보인다.

## 시나리오 연습 문제 12

**문제 1.** 한 회사가 24/7로 도는 웹 서버 플릿을 운영하며, 향후 신세대 인스턴스·OS·리전으로 자유롭게 옮길 가능성이 있다. 최대 할인을 받으면서 이 유연성을 유지하려면?

A) Standard Reserved Instance 3년
B) Compute Savings Plan
C) EC2 Instance Savings Plan
D) Spot Instances

**정답: B**

해설: Compute SP는 시간당 지출을 약정하므로 패밀리·리전·OS·Tenancy를 자유롭게 바꿔도 할인이 따라오고 Fargate·Lambda까지 커버한다. Standard RI(A)는 특정 타입 고정이라 신세대 이전 시 약정이 죽고, EC2 SP(C)는 할인은 깊지만 패밀리·리전 고정이라 "자유 이전"에 안 맞으며, Spot(D)은 24/7 안정 워크로드에 부적합하다(회수 위험).

---

**문제 2.** 한 데이터팀이 야간에 도는 ETL 배치를 운영한다. 작업은 체크포인트로 중단·재개가 가능하고 비용 최소화가 최우선이다. 인터럽션을 줄이면서 90% 절감하려면?

A) On-Demand
B) Spot Fleet + capacity-optimized 할당 + 여러 타입/AZ 다양화
C) Reserved Instance 3년
D) Dedicated Host

**정답: B**

해설: 체크포인트 복구 가능한 내결함 배치는 Spot의 이상적 사용처(최대 90% 절감)다. capacity-optimized 할당은 회수 확률이 낮은 풀을 골라 인터럽션을 최소화하고, 다양화는 한 풀 회수 시 빠른 대체를 보장한다. On-Demand(A)는 비싸고, RI(C)는 24/7 약정이라 야간 배치엔 시간 대부분 낭비, Dedicated Host(D)는 라이선스 BYOL용이지 비용 절감 수단이 아니다.

---

**문제 3.** 한 애플리케이션의 데이터가 얼마나 자주 접근될지 예측 불가능하고 시간에 따라 패턴이 변한다. 운영 부담 없이 S3 비용을 자동 최적화하려면?

A) S3 Standard-IA
B) S3 Intelligent-Tiering
C) S3 Glacier Flexible Retrieval
D) Lifecycle 규칙으로 30일 후 IA 전환

**정답: B**

해설: 접근 패턴이 불확실하거나 변할 때는 Intelligent-Tiering이 객체별 접근을 추적해 자동으로 계층을 올리고 내리며, 검색비·최소 보관 위약금이 없어 잘못된 선택 리스크를 제거한다. Standard-IA(A)나 명시적 Lifecycle(D)은 패턴이 명확할 때 유리하지만, 불확실한 상황에서 자주 접근하면 최소 보관·검색비에 물린다. Glacier Flexible(C)은 검색 지연이 커 활성 데이터에 부적합하다.

---

**문제 4.** 프라이빗 서브넷의 EC2가 S3에 대량 데이터를 읽고 쓰는데 NAT Gateway 처리 비용이 폭증했다. 가장 효과적인 절감책은?

A) S3 Gateway Endpoint 생성
B) S3용 Interface Endpoint 생성
C) NAT Instance로 교체
D) Transit Gateway 추가

**정답: A**

해설: S3 Gateway Endpoint는 라우팅 테이블에 경로를 추가해 트래픽을 NAT·인터넷 없이 AWS 백본으로 직접 보내고 엔드포인트 자체가 무료라 NAT 처리 비용을 0으로 만든다. Interface Endpoint(B)도 가능하지만 ENI·GB 요금이 들어 무료 Gateway보다 비싸고, NAT Instance(C)는 관리 부담만 늘며, TGW(D)는 비용 처리 요금이 붙어 절감과 무관하다.

---

**문제 5.** 한 회사가 RDS PostgreSQL을 24/7로 운영하며 1년 약정으로 비용을 줄이려 한다. 어떤 옵션인가?

A) Compute Savings Plan
B) EC2 Instance Savings Plan
C) RDS Reserved Instance
D) Spot

**정답: C**

해설: Savings Plans는 EC2·Fargate·Lambda만 커버하고 RDS·Redshift·ElastiCache·OpenSearch는 Reserved Instance로만 약정한다. 따라서 RDS RI가 정답이다. A·B는 SP가 RDS에 적용 안 되므로 오답이고, D는 RDS가 Spot을 지원하지 않으며 DB를 회수 가능한 인스턴스에 올리는 것 자체가 부적절하다. "RDS"가 보이면 RI다.

---

**문제 6.** 한 의료 기관이 영상 데이터를 분기에 한 번만 꺼내지만, 꺼낼 때는 밀리초 단위 즉시 접근이 필요하다. 장기 저장비를 낮추되 즉시 검색이 가능한 클래스는?

A) S3 Standard
B) S3 Glacier Instant Retrieval
C) S3 Glacier Deep Archive
D) S3 One Zone-IA

**정답: B**

해설: Glacier Instant Retrieval은 Standard-IA보다 싼 저장 단가에 밀리초 즉시 접근을 제공해 "거의 안 꺼내지만 꺼낼 땐 빨라야 하는" 의료 영상에 정확히 맞는다. Standard(A)는 즉시 접근되나 저장비가 비싸고, Deep Archive(C)는 12-48시간 검색 지연으로 "즉시"에 위배되며, One Zone-IA(D)는 단일 AZ라 내구성이 중요한 의료 데이터에 부적합하고 즉시성보다 비용 구조가 다르다.

---

**문제 7.** 한 회사가 전 세계 사용자에게 S3의 정적 자산을 제공하는데 데이터 전송 비용이 사용자 증가에 비례해 폭증한다. 가장 적합한 절감책은?

A) S3를 여러 리전에 복제해 직접 서빙
B) CloudFront를 S3 앞에 배치
C) S3 Transfer Acceleration
D) NAT Gateway 추가

**정답: B**

해설: CloudFront는 엣지 캐싱으로 원본 요청을 줄이고, S3→CloudFront 전송이 무료이며, egress 단가가 S3 직접보다 저렴해 비용을 역전시킨다. 복제(A)는 전송·저장비가 오히려 늘고, Transfer Acceleration(C)은 업로드 가속 기능으로 다운로드 전송비와 무관하며, NAT(D)는 인터넷 egress 절감과 관계없다.

---

**문제 8.** 한 회사가 EC2 인스턴스의 과대 프로비저닝 여부를 ML로 분석해 최적 타입·크기를 구체적으로 추천받으려 한다. 가장 적합한 도구는?

A) Trusted Advisor
B) Compute Optimizer
C) Cost Explorer
D) CloudWatch Alarm

**정답: B**

해설: Compute Optimizer는 과거 CloudWatch 메트릭을 ML로 분석해 인스턴스별 최적 타입·크기와 예상 절감액을 추천한다(메모리는 CloudWatch Agent 필요). Trusted Advisor(A)는 규칙 기반으로 저활용 EC2 같은 명백한 낭비만 잡고 정밀 right-sizing은 못 한다 — 둘은 보완 관계다. Cost Explorer(C)는 가시화, CloudWatch Alarm(D)은 임계 알림으로 right-sizing 추천 도구가 아니다.

---

**문제 9.** 한 개발 계정에서 실험 중 비싼 리소스 폭주 위험이 있다. 비용이 예산 100%에 도달하면 사람 개입 없이 자동으로 추가 리소스 생성을 차단하려면?

A) Cost Explorer 알림
B) Budgets + Budgets Actions
C) CloudWatch Alarm + SNS
D) Trusted Advisor

**정답: B**

해설: Budgets Actions는 예산 임계 도달 시 제한적 IAM 정책을 자동 attach하거나 인스턴스를 중지해 지출을 강제로 멈춘다 — 빌 쇼크에 대한 자동 차단막이다. Cost Explorer(A)는 가시화만, CloudWatch Alarm+SNS(C)는 알림만 보낼 뿐 자동 차단을 못 하며, Trusted Advisor(D)는 실시간 강제 차단 기능이 없다.

---

**문제 10.** 한 재무팀이 시간·리소스 단위까지 세분화된 청구 데이터를 SQL로 자유롭게 분석해 커스텀 리포트를 만들려 한다. 가장 적합한 접근은?

A) Cost Explorer 그래프 캡처
B) CUR을 S3로 내보내 Athena로 쿼리
C) Budgets 데이터 추출
D) Trusted Advisor 리포트

**정답: B**

해설: CUR은 가장 세분화된 청구 데이터를 시간·리소스 단위로 S3에 내보내고 Athena·Redshift·QuickSight로 임의 SQL 분석을 가능케 한다. Cost Explorer(A)는 빠른 시각화·예측엔 강하나 리소스 단위 자유 SQL은 못 하고, Budgets(C)·Trusted Advisor(D)는 세밀 분석 도구가 아니다. "Athena/세밀 SQL"이면 CUR이다.

---

**문제 11.** 한 팀이 Java·Node.js 컨테이너 워크로드를 ECS에서 운영하며 코드 변경을 최소화하면서 컴퓨팅 단가를 낮추려 한다. 비용이 변동하는 비핵심 부분은 중단돼도 무방하다. 가장 효과적인 결합은?

A) 전부 On-Demand x86 유지
B) Graviton 기반 Fargate + 비핵심 부분은 Fargate Spot
C) 전부 Lambda로 재작성
D) Dedicated Host로 전환

**정답: B**

해설: Graviton은 ARM 효율로 40% 가성비를 주고 Java·Node.js·컨테이너는 코드 변경 없이 멀티아키텍처 이미지로 전환된다. 중단 무방한 비핵심 부분은 Fargate Spot으로 추가 절감한다 — 두 축(아키텍처 효율 + 내결함 할인)을 결합한다. A는 비용 절감이 없고, C는 대규모 재작성이라 "최소 변경"에 반하며, D는 비용 절감 수단이 아니다.

---

**문제 12.** 한 글로벌 기업이 여러 AWS 계정을 Organizations로 운영한다. 한 계정에서 산 Compute SP를 다른 계정 사용에도 적용하고, 부서별 비용을 분리해 보고하며, 특정 OU에서 비싼 인스턴스를 못 쓰게 막으려 한다. 필요한 조합은?

A) 개별 결제 + IAM 키 분리 + NACL
B) Consolidated Billing + Cost Allocation Tags + SCP
C) Cost Explorer + Budgets + PrivateLink
D) Billing Conductor + Macie + Inspector

**정답: B**

해설: Consolidated Billing은 SP·RI를 계정 간 공유하고 볼륨 할인을 합산하며, Cost Allocation Tags는 부서별 비용을 분리하고, SCP(Service Control Policy)는 OU 단위로 비싼 인스턴스·리전을 차단하는 가드레일이다 — 세 요구에 정확히 대응한다. A는 공유·분리·차단을 모두 못 하고, C의 PrivateLink·D의 Macie·Inspector는 보안 도구로 비용 거버넌스 요구와 무관하다.

---

## 📌 핵심 요약 + 다음 주 예고

비용 도메인(약 20%)은 워크로드 속성을 가격 모델에 매핑하는 사고 체계다. **컴퓨팅**은 약정(SP/RI, RDS는 RI)·시장(Spot, capacity-optimized)·아키텍처(Graviton)·크기(Compute Optimizer)로, **스토리지**는 접근 패턴(Intelligent-Tiering vs Lifecycle)·최소 보관 함정·Bucket Keys·gp3로, **네트워크**는 Gateway Endpoint(무료)·CloudFront·AZ 토폴로지로, **거버넌스**는 Cost Explorer/CUR·Budgets Actions·Anomaly Detection·태그·Consolidated Billing으로 푼다. 모든 도구는 "불확실성을 누가 떠안는가"로 갈린다. SP vs RI, Gateway vs Interface Endpoint, Cost Explorer vs CUR — 이 세 경계만 정확해도 비용 문제의 절반이 풀린다.

다음 주(Week 11)는 비용에서 **고가용성·재해복구·마이그레이션**으로 넘어간다. Multi-AZ vs Multi-Region, RTO/RPO에 따른 DR 전략(Backup & Restore / Pilot Light / Warm Standby / Multi-Site), DMS·SCT를 통한 데이터베이스 마이그레이션, Snow 패밀리를 통한 대용량 데이터 이전을 다룬다. 비용에서 봤던 "AZ 경계 비용 = 고가용성의 대가"라는 긴장이, 다음 주엔 정면으로 "얼마나 가용하게 만들 것인가 vs 얼마를 쓸 것인가"의 설계 결정으로 확장된다.
