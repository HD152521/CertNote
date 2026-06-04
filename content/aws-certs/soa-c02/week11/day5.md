# Day 5 - Week 11 복습, 비용·성능 운영을 하나의 의사결정 흐름으로

Week 11에서 다룬 도구들 — Compute Optimizer, Trusted Advisor, Cost Explorer, Budgets, Savings Plans, Spot — 은 따로 보면 제각각이지만, 실전에서는 하나의 흐름으로 연결된다. 비용 최적화는 무작위로 도구를 꺼내 쓰는 게 아니라 **순서가 있는 파이프라인**이다. 먼저 그릇 크기를 맞추고(Right Sizing), 다음에 안정 사용량을 약정으로 깎고, 변동분을 Spot으로 처리하고, 그 전체를 분석·통제·점검한다. 이 순서를 거꾸로 하면 — 예컨대 Right Sizing 전에 약정부터 걸면 — 잘못된 크기를 3년간 약정하는 비싼 실수를 한다.

이 글은 Week 11을 두 축으로 정리한다. 첫째는 각 도구의 역할을 한 문장으로 압축하고 "출제 키워드 → 정답 서비스" 매핑을 굳히는 것, 둘째는 도구들이 어떻게 한 의사결정 흐름으로 엮이는지 보는 것이다. 그 다음 실전 시나리오 12문항으로 감각을 점검한다. 시험에서 비용·성능 문제는 대개 "이 상황에 가장 적합한 도구 하나"를 고르는 형태이고, 그 선택은 도구의 **고유 영역**을 정확히 알 때 갈린다.

## Week 11 한 문장 요약과 키워드 매핑

| Day | 핵심 도구 | 한 문장 |
|-----|-----------|---------|
| Day 1 | **Compute Optimizer** | 14일치 메트릭을 ML로 분석해 EC2/ASG/EBS/Lambda의 Right Sizing을 권장 |
| Day 2 | **Trusted Advisor** | 다섯 카테고리(비용/성능/보안/내결함성/한도)로 모범 사례를 자동 점검 |
| Day 3 | **Cost Explorer / Budgets / Tag** | 비용을 다차원 분석·예산 통제·태그 분배 |
| Day 4 | **SP / RI / Spot** | 안정 baseline은 약정 할인, 무상태 변동분은 Spot |

시험은 상황 키워드로 도구를 가린다. 이 매핑이 핵심이다.

| 출제 키워드 | 정답 |
|-------------|------|
| "인스턴스/볼륨 크기 권장", "right sizing", "over-provisioned 식별" | Compute Optimizer |
| "비용·성능·보안·내결함성을 한 번에 자동 점검" | Trusted Advisor |
| "서비스 한도(쿼터) 80% 도달 경고" | Trusted Advisor Service Limits |
| "비용을 서비스·계정·프로젝트별로 분해·시각화" | Cost Explorer |
| "팀/프로젝트별 비용 grouping" | Cost Allocation Tag + Cost Explorer |
| "예산 임계 도달 시 자동으로 차단(EC2 stop, IAM/SCP)" | AWS Budgets + Budgets Action |
| "비용이 평소 패턴 대비 비정상 spike (ML 탐지)" | Cost Anomaly Detection |
| "시간·리소스 단위 raw 데이터 + SQL 분석" | CUR + Athena |
| "패밀리·리전 자유로운 약정", "워크로드 변동" | Compute Savings Plans |
| "특정 패밀리 고정, 최대 할인" | EC2 Instance SP / Standard RI |
| "RDS·Redshift·ElastiCache 약정" | Reserved Instances (SP 미지원) |
| "무상태 배치, 회수 견딤, 최대 할인" | Spot + capacityOptimized |
| "Spot 회수 2분 알림 처리" | EventBridge → Lambda / Lifecycle Hook |
| "특정 AZ에 용량 보장 (할인 아님)" | EC2 Capacity Reservation |
| "AWS 측 호스트 retirement/유지보수 알림" | Personal Health Dashboard |
| "약정 실제 사용률/덮는 비율 점검" | Cost Explorer Utilization / Coverage |

> 💡 **관련 이론**: 이 도구 분류의 밑바탕은 운영의 **OODA 루프**(Observe-Orient-Decide-Act)다. 관측(Observe)은 CloudWatch·Cost Explorer·CUR이, 판단(Orient)은 Compute Optimizer·Trusted Advisor·Anomaly Detection이, 결정(Decide)은 약정 구매·패밀리 변경이, 행동(Act)은 Budgets Action·Spot 회수 처리·자동 복구가 맡는다. 도구를 기능별로 외우는 대신 "이건 관측이냐, 판단이냐, 행동이냐"로 분류하면 어느 상황에 무엇이 답인지 자연스럽게 좁혀진다. 예컨대 "탐지만 하고 막지는 못함"(Anomaly Detection)과 "실제로 막음"(Budgets Action)의 구분이 바로 Orient와 Act의 차이다.

## 비용 최적화의 올바른 순서 — 왜 Right Sizing이 먼저인가

비용 최적화 도구를 아는 것과 **올바른 순서로 적용하는 것**은 다르다. 순서가 틀리면 절감 효과가 반감되거나 오히려 손해를 본다.

```
1단계 ─ Right Sizing (그릇 크기 맞추기)
        Compute Optimizer 권장 → 다운사이즈, 패밀리 변경
        gp2 → gp3, io1 → gp3 마이그레이션
        ※ 반드시 먼저! 잘못된 크기에 약정 걸면 잘못된 비용을 3년 묶음

2단계 ─ 약정 할인 (안정 baseline 깎기)
        24/7 상시 워크로드 60~70% → Compute SP 3년
        절대 줄지 않는 최소 사용량에만

3단계 ─ 변동 워크로드 (On-Demand + Spot)
        예측 어려운 변동분 → On-Demand 20~30%
        무상태·회수 견딤 → Spot 10~20% (capacityOptimized)

4단계 ─ 지속 모니터링 (관측·통제)
        Cost Explorer 분석 / Budgets 통제 / Anomaly 탐지
        SP·RI Utilization·Coverage 점검
```

**1단계가 반드시 먼저인 이유**는 약정이 비가역적이기 때문이다. m5.4xlarge가 사실 m5.large면 충분한데, Right Sizing 없이 이 큰 인스턴스에 3년 Standard RI를 걸면, 1년 뒤 다운사이즈하고 싶어도 약정에 묶여 못 줄인다. 먼저 적정 크기를 찾고 나서, 그 적정 크기의 baseline에 약정을 거는 것이 순서다. 약정은 "이미 최적화된 크기"를 깎는 마지막 단계지 첫 단계가 아니다.

> ⚠️ **함정**: Right Sizing과 약정의 순서를 뒤집는 실수 외에, "약정을 baseline 이상으로 거는" 실수도 흔하다. 트래픽이 출렁이는 워크로드의 피크에 맞춰 약정하면, 골짜기 시간엔 약정의 상당 부분을 안 쓰고도 돈을 낸다(낮은 Utilization). 약정은 항상 "그래프의 바닥선(절대 안 줄어드는 부분)"에만 걸고, 그 위는 On-Demand·Spot으로 받친다. 시험에서 "변동성 큰 워크로드 + 비용 절감"이면 Standard RI 풀 약정은 거의 항상 오답이고, Compute SP(baseline) + Spot(변동) 조합이 정답 방향이다.

## 자주 혼동되는 경계들 — 시험이 노리는 구분점

비용·성능 영역의 시험 문제는 대부분 "비슷해 보이는 두 도구 중 하나"를 고르게 한다. 핵심 경계를 정리한다.

**탐지 vs 차단**: Cost Anomaly Detection은 ML로 이상 비용을 **탐지·알림**하지만 비용을 막지는 못한다. 실제로 **차단**하는 건 Budgets Action(EC2 stop, IAM/SCP)뿐이다. "자동으로 막아라"가 키워드면 Budgets Action, "비정상을 알아차려라"면 Anomaly Detection이다.

**고정 임계 vs 패턴 이상**: Budgets는 "월 $5,000" 같은 고정 임계를 넘으면 알린다. Cost Anomaly Detection은 평소 패턴 대비 이상치를 잡는다. 임계 안에서의 갑작스러운 spike는 Budgets가 못 잡고 Anomaly가 잡는다 — 보완 관계다.

**Right Sizing 권장 vs 모범 사례 점검**: Compute Optimizer는 인스턴스 단위로 정밀한 크기 권장을 낸다. Trusted Advisor는 계정 전반의 거친 모범 사례 점검이다. "어떤 인스턴스를 어떤 타입으로 줄여라"는 Compute Optimizer, "전반적 비용·보안·내결함성 점검"은 Trusted Advisor.

**할인 vs 용량 보장**: SP/RI는 할인이지 용량을 보장하지 않는다. Capacity Reservation은 용량 보장이지 할인이 아니다. "반드시 띄울 수 있어야"면 Capacity Reservation, "싸게"면 SP/RI.

**내 설정 vs AWS 측 사건**: Trusted Advisor는 내 계정 설정의 문제를, Personal Health Dashboard는 AWS 쪽 사건(retirement, 유지보수)을 본다.

**빠른 요약 vs 원시 데이터**: Cost Explorer는 사전 집계된 빠른 요약(콘솔), CUR은 시간·리소스 단위 원시 데이터(S3 + Athena 임의 SQL).

> 🔍 **더 깊이**: 이 경계들이 존재하는 근본 이유는 각 도구가 **다른 데이터 해상도와 다른 작동 시점**에 최적화됐기 때문이다. Cost Explorer는 일/시간 단위 사전 집계라 빠르지만 거칠고, CUR은 리소스·시간 단위 원시라 정밀하지만 무겁다. Anomaly Detection은 비동기 ML 추론이라 탐지엔 강하지만 실시간 차단은 못 하고, Budgets Action은 임계 트리거 기반이라 즉시 차단하지만 패턴은 못 본다. 도구를 외울 때 "이건 어느 해상도의 데이터를, 어느 시점에 처리하나"를 물으면 왜 그 도구가 그 일만 잘하는지가 보인다 — 모든 걸 다 하는 단일 도구가 없는 건 데이터 해상도와 지연(latency) 사이의 트레이드오프 때문이다.

## 약정 점검 지표 — Utilization과 Coverage의 의미

약정(SP/RI)을 한 번 사고 끝이 아니다. 워크로드는 변하므로 약정이 여전히 적정한지 **지속 점검**해야 하고, 그 핵심 지표가 Cost Explorer의 **Utilization**과 **Coverage**다. 이 둘을 혼동하면 잘못된 결정을 한다.

- **Utilization(활용률)**: 산 약정 중 실제로 써서 할인을 본 비율. 90%면 약정의 90%를 활용 중이고, 60%면 40%를 버리는 중(과다 약정). **낮으면 약정을 줄여야** 한다.
- **Coverage(적용률)**: 전체 On-Demand 가능 사용량 중 약정이 덮은 비율. 50%면 사용량의 절반은 아직 정가(On-Demand)로 내는 중. **낮으면 약정을 더 걸 여지**(추가 절감 기회)다.

둘을 함께 봐야 한다 — Coverage가 낮고 Utilization이 높으면 "약정을 더 사도 다 쓸 것"이니 추가 약정이 안전하다. Coverage가 높은데 Utilization이 낮으면 이미 과다 약정이니 더 사면 안 된다.

> 📚 **사례**: FinOps Foundation의 업계 조사에 따르면, 클라우드 비용 낭비의 큰 축은 ① 끄지 않은 유휴 리소스와 ② 잘못 산 약정이다. 많은 조직이 "약정하면 무조건 싸다"는 생각에 피크 사용량에 맞춰 RI를 대량 구매했다가, 워크로드가 줄거나 패밀리를 바꿔 Utilization이 50% 아래로 떨어지는 실패를 겪었다 — 안 쓰는 약정이 오히려 On-Demand보다 비싸진 것이다. 이 교훈으로 업계는 "보수적 약정 + 정기적 Utilization/Coverage 점검"을 표준으로 삼았고, AWS도 Convertible RI와 유연한 Compute SP를 내놓아 약정의 경직성을 완화했다. 약정은 사는 순간이 아니라 운영하며 관리하는 대상이다.

## 정리하며

Week 11의 도구들은 "관측 → 판단 → 결정 → 행동"의 운영 루프를 비용·성능 영역에서 구현한다. 시험에서든 실무에서든 핵심은 각 도구의 고유 영역과 그들을 엮는 순서다.

다섯 가지로 압축하면 이렇다. ① Compute Optimizer = Right Sizing 권장(14일 메트릭, 메모리는 Agent 필요), 비용 최적화의 1단계. ② Trusted Advisor = 다섯 카테고리 모범 사례 점검(전체는 Business+ Support, 한도는 80% 사전 경보). ③ Cost Explorer(다차원 분석) + Budgets(Action으로 차단) + Tag(분배, 활성화 소급 안 됨) + Anomaly Detection(ML 탐지, 차단 아님). ④ 약정은 baseline에만(Compute SP 유연 / EC2 Instance SP·Standard RI 묶임 / RDS·Redshift는 RI), Utilization·Coverage로 점검. ⑤ Spot은 무상태·회수 견딤 전용(capacityOptimized, 2분 통보 처리), Capacity Reservation은 할인 아닌 용량 보장. 이 순서대로 — Right Sizing → 약정 → Spot → 모니터링 — 적용하는 것이 비용 최적화의 정석이다.

---

## 📝 시나리오 연습 문제 (Week 11 종합 12문항)

**문제 1.** EC2 200대를 운영 중이며 어떤 인스턴스가 over-provisioned인지 인스턴스 단위로 정밀하게 알고 싶다. 가장 적합한 도구는?

A) CloudWatch Dashboard 수동 분석

B) Compute Optimizer — 14일 메트릭의 퍼센타일 분포를 ML로 분석해 인스턴스별 Over/Under/Optimized와 권장 타입을 제시

C) Trusted Advisor Performance

D) Cost Explorer

**정답: B**

해설: 인스턴스 단위의 정밀한 크기 권장은 Compute Optimizer의 고유 영역이다. 14일치 CPU·네트워크 등 메트릭의 분포를 ML로 학습해 각 인스턴스를 Over/Under/Optimized로 판정하고 줄일 타입과 예상 절감액까지 제시한다. Trusted Advisor(C)는 계정 전반의 거친 모범 사례 점검이라 인스턴스 단위 권장은 약하고, Cost Explorer(D)는 분석 도구지 권장 도구가 아니다. 단 메모리 메트릭이 필요한 워크로드는 CloudWatch Agent 설치가 권장 정확도를 좌우한다.

---

**문제 2.** 운영팀이 매월 $5,000 예산을 두고, 80% 도달 시 알림, 100% 도달 시 일부 EC2를 자동 중지하길 원한다. 사람 개입 없이.

A) Cost Explorer만 사용

B) AWS Budgets + Budgets Action(80% 알림, 100% 도달 시 EC2 stop 또는 IAM Deny 부착)

C) Cost Anomaly Detection

D) CloudWatch Alarm

**정답: B**

해설: 비용을 실제로 "막는" 자동 차단은 Budgets Action만 할 수 있다. 임계 도달 시 EC2/RDS 자동 중지, IAM Deny 정책 부착, SCP 적용이 가능하다. 80%는 FORECASTED나 ACTUAL 알림으로, 100%는 ACTUAL 차단 Action으로 거는 것이 전형이다. Cost Anomaly Detection(C)은 탐지·알림만 하지 차단은 못 하고, Cost Explorer(A)는 분석만 한다.

---

**문제 3.** CloudOps 팀과 DevOps 팀의 비용을 별도로 추적하려 한다. 가장 가벼운 방법은?

A) 팀마다 계정을 분리

B) 리소스에 `Team` 태그 부여 + Cost Allocation Tag 활성화 + Cost Explorer Group by Tag

C) 팀마다 Budgets만 생성

D) CUR을 매일 수동 분석

**정답: B**

해설: 팀별 비용 분배의 표준은 태그 기반이다. 리소스에 `Team` 태그를 달고, Cost Allocation Tag로 그 키를 명시 활성화한 뒤(소급 안 되므로 빨리), Cost Explorer에서 Group by Tag로 본다. 계정 분리(A)는 과한 변경이고, 태그가 가장 가볍다. 단 활성화 전 과거 데이터는 그룹화되지 않고 활성화 후 24~48시간이 걸리며, 태그 누락 리소스는 untagged로 빠지므로 Tag Policy로 강제하면 정확도가 오른다.

---

**문제 4.** 회사가 향후 3년간 EC2를 안정적으로 운영하지만 패밀리·리전을 자주 바꾼다. 코드 변경 없이 최대한 할인받으려면?

A) Standard RI 3년

B) Compute Savings Plans 3년 — 모든 리전·패밀리·EC2/Fargate/Lambda에 약정 금액 내 자동 적용

C) On-Demand

D) Spot

**정답: B**

해설: Compute SP는 인스턴스가 아니라 시간당 지출액에 약정하므로, 패밀리·리전을 바꿔도 약정이 따라온다. Standard RI(A)는 더 큰 할인 대신 특정 타입에 묶여 패밀리 변경 시 약정이 무용지물이 된다. 변동성 있는 환경에서 약정 유연성이 필요하면 Compute SP가 정답이다. On-Demand(C)는 할인이 없고, Spot(D)은 안정 운영 워크로드엔 회수 위험이 부적합하다.

---

**문제 5.** 야간에만 100대 노드로 EMR 배치를 돌린다. 무상태이고 회수돼도 재실행하면 된다. 비용 최소화는?

A) On-Demand 100대

B) Standard RI 100대

C) Spot Fleet + capacityOptimized — 무상태·회수 내성 배치의 최적, 최대 90% 할인 + 안정성 확보

D) Compute Savings Plans

**정답: C**

해설: 무상태·중단 내성·분산 가능한 배치는 Spot의 교과서적 대상이다. capacityOptimized로 여유 용량이 많은 풀에서 가져와 회수를 줄이면서 최대 90% 할인을 받는다. RI(B)·SP(D)는 24/7 상시 워크로드용이라 야간에만 도는 작업엔 약정 대부분을 안 써 낭비고, On-Demand(A)는 정가다.

---

**문제 6.** 모든 AWS 서비스의 한도(쿼터)가 80%에 근접하면 자동 경고를 받고 싶다.

A) CloudWatch Custom Metric만

B) Trusted Advisor Service Limits + EventBridge 알림 (Business+ Support)

C) Config Rule

D) Service Quotas 콘솔만 수동 확인

**정답: B**

해설: Trusted Advisor의 Service Limits 체크가 한도 80% 도달을 자동 점검하고, EventBridge로 알림을 자동화한다. 한도는 자동 증가하지 않으므로 80% 사전 경보를 받아 Service Quotas로 미리 증액 요청하는 것이 핵심이다. 단 전체 Trusted Advisor는 Business 이상 Support가 필요하다. 일부 쿼터는 CloudWatch `AWS/Usage` 네임스페이스로도 알람을 걸 수 있다.

---

**문제 7.** 회사 비용이 어느 날 평소 패턴 대비 3배로 튀었다. 고정 예산 임계는 안 넘었다. 이런 이상을 자동 탐지하려면?

A) AWS Budgets(고정 임계 기반)

B) Cost Anomaly Detection — ML로 평소 패턴을 학습해 통계적 이상치를 탐지

C) Trusted Advisor

D) CloudWatch Alarm

**정답: B**

해설: Budgets는 고정 임계(월 $X)를 넘을 때만 알리므로 임계 안에서의 갑작스러운 spike는 못 잡는다. Cost Anomaly Detection은 비용 패턴을 ML로 학습해 평소 대비 이상치를 잡으므로 고정 임계를 안 넘어도 비정상 spike를 알린다. 둘은 보완 관계이며, Anomaly Detection은 탐지·알림이지 차단이 아니다.

---

**문제 8.** 신규 m7i 인스턴스를 BCP용으로 특정 AZ에 항상 즉시 띄울 수 있게 확보하고 싶다. 목표는 비용 절감이 아니라 가용성이다.

A) Standard RI(할인은 되나 용량 보장은 아님)

B) EC2 Capacity Reservation — 특정 AZ에 용량 확보, 할인은 별도(SP/RI와 조합)

C) Spot

D) On-Demand로 미리 띄워두기

**정답: B**

해설: Capacity Reservation은 "그 순간 반드시 인스턴스를 띄울 수 있음"을 사는 것으로, 할인이 아니라 용량 보장이 목적이다. 신규 타입의 AZ 용량 부족, DR 즉시 가용 보장이 정확한 사용 사례다. SP/RI(A)는 할인일 뿐 용량을 보장하지 않고, Spot(C)은 회수되므로 가용성과 정반대다. 할인까지 원하면 Capacity Reservation에 SP/RI를 조합한다.

---

**문제 9.** RDS PostgreSQL을 24/7 운영하며 약정 할인을 받고 싶다.

A) Compute Savings Plans

B) EC2 Instance Savings Plans

C) Reserved Instances (RDS RI)

D) Spot

**정답: C**

해설: Savings Plans는 EC2/Fargate/Lambda에만 적용된다. RDS·Redshift·ElastiCache·OpenSearch는 SP가 없으므로 각 서비스의 Reserved Instances로 약정한다. 24/7 안정 운영 DB는 RDS RI가 정답이다. Spot(D)은 stateful DB에 부적합하다.

---

**문제 10.** EBS 비용 절감을 위해 gp2 → gp3 마이그레이션 후보를 자동 식별하려 한다.

A) CLI로 전 볼륨 수동 조회

B) Compute Optimizer EBS Volume 권장 + Trusted Advisor Cost 카테고리

C) Cost Explorer

D) Config Rule

**정답: B**

해설: Compute Optimizer가 EBS 볼륨을 분석해 gp3 전환 후보와 예상 절감을 권장하고, Trusted Advisor Cost 카테고리도 over-provisioned/idle EBS를 탐지한다. gp3는 GB당 약 20% 저렴하고 IOPS·처리량을 크기와 독립적으로 보장하며 `modify-volume`으로 무중단 전환된다. 두 도구가 후보 식별의 표준이다.

---

**문제 11.** 회사가 1년 전 산 Compute SP의 Cost Explorer Utilization이 55%로 낮다. 의미와 조치는?

A) 약정이 부족 — 더 산다

B) 과다 약정 — 약정의 45%를 안 쓰고 버리는 중이므로, 다음 약정은 절대 줄지 않는 baseline에 맞춰 규모를 줄인다

C) Coverage가 낮은 것이므로 더 산다

D) Utilization은 무의미하다

**정답: B**

해설: Utilization은 산 약정 중 실제로 써서 할인을 본 비율이다. 55%면 약정의 45%를 안 쓰고도 비용을 내는 과다 약정이다. SP·RI는 use-it-or-lose-it이라 안 써도 돈이 나가므로, 변동성을 과소평가해 baseline 이상으로 약정한 것이다. 조치는 다음 약정을 최소 사용량(baseline)에 맞춰 줄이는 것이다. Coverage(약정이 덮는 비율)가 낮은 경우라야 추가 약정 여지가 있다 — 둘을 혼동하면 안 된다.

---

**문제 12.** 운영팀이 t3.large로 돌리던 API 서버가 트래픽이 꾸준히 늘며 매일 오후 응답이 급락하고 CPU가 일정 값에 천장을 친다. 비용·성능을 함께 고려한 올바른 조치는?

A) 인스턴스를 t3.2xlarge로 키운다

B) CPU 크레딧 고갈이 원인이므로, 꾸준한 부하에 맞는 m/c 패밀리(예: m6i)로 변경하고 Compute Optimizer로 적정 크기를 확인한다

C) gp3로 볼륨을 변경한다

D) Spot으로 전환한다

**정답: B**

해설: T 패밀리는 burstable 모델로 baseline 이상은 누적 CPU 크레딧으로만 burst하는데, 꾸준히 baseline을 넘는 부하가 걸리면 크레딧이 고갈돼 baseline에 묶이며 CPU가 천장을 친다 — 매일 오후 성능 급락의 전형이다. 같은 T 패밀리를 키우면(A) 더 큰 크레딧을 줄 뿐 근본 해결이 아니고 비용도 오른다. 꾸준한 운영 부하는 baseline이 곧 전체 성능인 m/c 패밀리가 정석이며, Compute Optimizer로 적정 크기를 확인해 과다·과소 프로비저닝을 피한다. Right Sizing(패밀리 교정)이 핵심이다.

---

## 📌 오늘의 요약

1. 비용 최적화는 순서가 있는 파이프라인 — Right Sizing(1단계) → 약정(baseline) → Spot(변동) → 모니터링. 약정 전에 크기부터 맞춰야 잘못된 비용을 약정하지 않음
2. 키워드 매핑: 크기 권장→Compute Optimizer, 5개 카테고리 점검→Trusted Advisor, 자동 차단→Budgets Action, ML 탐지→Anomaly Detection, 용량 보장→Capacity Reservation
3. 경계: 탐지(Anomaly) vs 차단(Budgets Action), 빠른 요약(Cost Explorer) vs 원시 데이터(CUR), 할인(SP/RI) vs 용량 보장(Capacity Reservation), 내 설정(TA) vs AWS 측(PHD)
4. 약정은 baseline에만, Compute SP(유연)/EC2 Instance SP·Standard RI(묶임)/RDS·Redshift는 RI, Utilization·Coverage로 적정성 점검
5. Spot은 무상태·회수 견딤 전용(capacityOptimized, 2분 통보 처리), T 패밀리 크레딧 고갈은 m/c 패밀리로 교정
