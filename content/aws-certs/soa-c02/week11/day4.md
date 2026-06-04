# Day 4 - Savings Plans와 Spot, 컴퓨팅 비용을 70% 깎는 약정과 도박의 경제학

On-Demand 가격은 AWS가 매기는 정가다 — 언제든 쓰고 언제든 끄는 최대 유연성에 대한 대가다. 하지만 대부분의 워크로드는 그 유연성을 다 쓰지 않는다. 운영 서버는 24시간 365일 돌고, 패밀리를 자주 바꾸지도 않는다. 그렇다면 AWS 입장에서도 "이 고객은 확실히 1년간 이만큼 쓴다"는 보장은 가치가 있다 — 용량 계획이 쉬워지기 때문이다. 이 상호 이익을 거래로 만든 것이 **약정 할인(Savings Plans, Reserved Instances)**이다. 고객은 "1년 또는 3년간 시간당 $X를 쓰겠다"고 약속하고, AWS는 그 대가로 최대 72%를 깎아준다.

반대편 극단에는 **Spot**이 있다. AWS 데이터센터에는 항상 팔리지 않은 여유 용량이 있다 — 비행기의 빈 좌석 같은 것이다. AWS는 이 여유 용량을 최대 90% 할인된 Spot 가격에 내놓되, "용량이 필요해지면 2분 전 통보하고 회수한다"는 조건을 단다. 약정이 "확실성을 사는 거래"라면 Spot은 "불확실성을 감수하고 헐값을 얻는 도박"이다. 이 글은 이 두 축 — 약정의 확실성과 Spot의 변동성 — 이 어떤 경제 원리 위에 서 있는지, 그리고 둘을 어떻게 조합해 비용 구조를 설계하는지를 파고든다.

## 약정 할인의 경제학 — 왜 AWS는 미래의 약속에 돈을 깎아주나

약정 할인은 자선이 아니라 **양쪽 모두 이득인 거래**다. 이걸 이해하면 SP·RI의 모든 옵션(1년 vs 3년, Upfront 정도)이 왜 그렇게 가격이 갈리는지 설명된다.

AWS 입장에서 가장 비싼 비용은 **불확실성**이다. 데이터센터를 짓고 서버를 들이는 건 막대한 선행 투자인데, 수요가 들쭉날쭉하면 과잉 투자(놀리는 서버)나 과소 투자(용량 부족) 위험을 진다. 고객이 "3년간 확실히 이만큼 쓴다"고 약속하면 AWS는 이 수요를 미리 알고 정확히 계획할 수 있다 — 그 가치를 할인으로 돌려준다. 그래서 **약정이 길수록(3년 > 1년), 선결제가 많을수록(All Upfront > No Upfront) 할인이 크다.** 길고 확실한 약속일수록 AWS의 불확실성을 더 많이 없애주기 때문이다.

> 💡 **관련 이론**: 이 거래의 핵심은 금융의 **화폐의 시간 가치(time value of money)**다. All Upfront(전액 선결제)는 고객이 미래에 낼 돈을 지금 미리 내는 것이고, AWS는 그 현금을 지금 받아 운용할 수 있으므로(또는 그만큼 자본 조달 비용을 아끼므로) 할인을 더 준다. 반대로 No Upfront는 매달 나눠 내므로 AWS가 받는 현재가치가 작아 할인이 작다. 이는 채권의 할인율, 리스 계약의 선납 할인과 정확히 같은 원리다 — 미래의 현금흐름을 현재가치로 환산하면, 일찍 받는 돈일수록 가치가 크다. 약정 할인의 가격표는 본질적으로 "고객이 떠안는 위험(약속을 못 지킬 위험)과 AWS가 얻는 현재가치"를 가격으로 환산한 표다.

## Savings Plans vs Reserved Instances — 유연성과 할인율의 줄다리기

약정 할인에는 두 세대가 있다. 먼저 나온 **Reserved Instances(RI)**는 "특정 인스턴스 타입을 예약"하는 모델이고, 나중에 나온 **Savings Plans(SP)**는 "시간당 컴퓨팅 지출액을 약정"하는 더 유연한 모델이다. AWS는 SP를 권장하며, 신규 약정은 거의 SP로 간다 — 하지만 둘의 차이를 정확히 아는 게 시험의 핵심이다.

**Savings Plans 3종**:

| 종류 | 적용 대상 | 최대 할인 | 유연성 |
|------|-----------|-----------|--------|
| **Compute SP** | EC2 + Fargate + Lambda, 모든 리전·패밀리·OS | ~66% | 가장 유연 |
| **EC2 Instance SP** | 특정 리전 + 특정 패밀리 (예: ap-northeast-2의 C 계열) | ~72% | 제한적 |
| **SageMaker SP** | SageMaker 학습·추론 | ~64% | SageMaker 전용 |

여기서 핵심 트레이드오프가 보인다 — **유연성과 할인율은 반비례한다.** Compute SP는 EC2든 Fargate든 Lambda든, 어느 리전 어느 패밀리든 약정 금액 내에서 자동 적용되는 최고의 유연성을 주지만 할인율은 ~66%다. EC2 Instance SP는 "특정 리전의 특정 패밀리"로 묶이는 대신 ~72%로 더 깎아준다. 약속을 좁고 구체적으로 할수록(=AWS의 불확실성을 더 줄여줄수록) 할인이 커지는 같은 원리다.

**RI의 두 종류**도 같은 줄다리기다 — **Standard RI**는 최대 72% 할인이지만 약정 후 인스턴스 패밀리 변경이 거의 안 되고(묶임), **Convertible RI**는 패밀리·크기·OS를 교환할 수 있는 대신 할인이 ~66%로 작다.

| 축 | RI | Savings Plans |
|----|-----|----------------|
| 적용 범위 | 특정 서비스(EC2, RDS, Redshift 등) | EC2/Fargate/Lambda |
| 약정 단위 | 인스턴스 타입 | 시간당 지출액($/hr) |
| 유연성 | 낮음(Convertible 제외) | 높음(자동 재배치) |
| 추세 | 레거시·SP 미지원 서비스용 | 신규 약정 권장 |

> 🔍 **더 깊이**: Savings Plans가 RI보다 유연한 이유는 **약정의 대상이 다르기 때문**이다. RI는 "c5.large 한 대를 예약"하므로, 워크로드를 c5에서 c7g로 옮기면 그 RI는 c5에만 적용돼 새 인스턴스엔 무용지물이 된다(Convertible은 수동 교환 필요). 반면 Compute SP는 "시간당 $10어치 컴퓨팅을 쓰겠다"는 **금액 약정**이라, c5를 쓰든 c7g를 쓰든 Fargate를 쓰든 그 $10 한도까지 자동으로 가장 비싼 On-Demand 사용분부터 할인을 적용한다. 인스턴스에 묶이지 않고 "지출액"에 묶이므로 워크로드가 바뀌어도 약정이 따라온다. 이 추상화 수준의 차이 — 구체적 자원(RI) vs 추상적 지출(SP) — 이 SP가 운영 부담을 크게 줄인 핵심이다. 단 SP·RI 모두 RDS·Redshift·ElastiCache·OpenSearch에는 SP가 없으므로 이들 서비스의 약정은 여전히 RI다.

## Spot — 시장 가격이 사라진 여유 용량 경매

Spot은 약정의 정반대다. 약정이 "미래를 확정해 할인받는" 거라면, Spot은 "미래를 포기하고 헐값을 얻는" 것이다. AWS 데이터센터의 팔리지 않은 여유 용량을 최대 90% 할인된 가격에 빌려주되, AWS가 그 용량이 필요해지면 **2분 전 통보 후 회수**한다.

과거 Spot은 사용자가 가격을 써내는 **입찰(bidding)** 모델이었지만, 2017년 AWS는 이를 폐기하고 수요·공급에 따라 완만하게 변하는 **시장 가격 모델**로 바꿨다. 이제 사용자는 입찰가를 고민할 필요 없이, On-Demand보다 싼 현재 Spot 가격에 그냥 쓰면 된다. 가격이 급변동하던 옛 모델보다 훨씬 예측 가능해졌다.

Spot의 적합성은 **상태(state)와 중단 내성(interruption tolerance)**으로 갈린다.

| 적합 (Spot OK) | 부적합 (Spot 금지) |
|----------------|--------------------|
| 빅데이터 배치(EMR/Spark) | Stateful DB·캐시 |
| CI/CD 빌드 | 긴 startup이 필요한 워크로드 |
| 컨테이너(Fargate Spot, EKS) | 회수 시 작업 손실이 치명적인 것 |
| 무상태 웹(ASG 혼합) | 단일 인스턴스 의존 서비스 |

핵심은 "회수돼도 다른 인스턴스가 이어받거나, 작업을 다시 돌리면 그만"인 워크로드여야 한다는 것이다. 무상태이고 분산 가능하며 중단을 견디면 Spot이 90% 할인의 잭팟이고, 상태를 갖고 회수가 치명적이면 Spot은 재앙이다.

> 📚 **사례**: Spot의 진화는 그 자체로 교훈이다. 2017년 이전 입찰 모델에서는 Spot 가격이 수요 급증 시 순간적으로 On-Demand의 몇 배까지 폭등하는 일이 있었고, 입찰가를 잘못 설정한 사용자가 예상치 못한 청구서를 받거나 대량 회수를 당했다. AWS가 입찰을 폐기하고 완만한 시장 가격으로 전환한 건 이 변동성이 Spot 채택을 가로막았기 때문이다. 전환 이후 Spot은 EMR·Kubernetes·CI 파이프라인의 표준 비용 절감 수단이 됐고, Pinterest·Lyft 같은 기업이 대규모 배치·데이터 처리를 Spot으로 돌려 수십 퍼센트 비용을 절감한 사례를 공개했다. 핵심 설계 교훈은 "할인 폭이 아무리 커도 예측 불가능하면 프로덕션이 안 쓴다"는 것 — 그래서 capacityOptimized 같은 안정성 우선 전략이 lowestPrice보다 권장된다.

## 회수를 우아하게 다루기 — 2분 통보와 Allocation Strategy

Spot을 프로덕션에서 쓰려면 **회수를 우아하게 처리**해야 한다. AWS는 회수 2분 전에 **EventBridge 이벤트**(`EC2 Spot Instance Interruption Warning`)와 인스턴스 메타데이터(IMDS) 신호를 보낸다. 이 2분 안에 진행 중인 작업을 마무리하거나 다른 인스턴스로 넘겨야 한다.

```
Spot 회수 2분 전 통보
   │
   ├──► EventBridge Rule (detail-type: EC2 Spot Instance Interruption Warning)
   │       └──► Lambda: ALB에서 deregister → 진행 작업 체크포인트 저장 → 로그 백업
   │
   └──► ASG Lifecycle Hook (Terminating 상태에서 Heartbeat로 시간 확보)
           └──► drain 완료 후 종료
```

더 근본적인 대응은 **회수 자체를 줄이는** 것이다 — 여기서 **Allocation Strategy**가 핵심이다. Spot 용량은 인스턴스 타입×AZ 조합마다 별도의 "풀(pool)"을 이루는데, 어떤 풀에서 인스턴스를 가져오느냐가 회수 빈도를 좌우한다.

| 전략 | 동작 | 회수 위험 |
|------|------|-----------|
| **lowestPrice** | 가장 싼 풀에서 | 높음 (싼 풀이 곧 부족해질 수 있음) |
| **diversified** | 여러 풀에 분산 | 중간 |
| **capacityOptimized** | 여유 용량이 가장 많은 풀에서 | 낮음 (권장) |
| **priceCapacityOptimized** | 가격+여유 용량 균형 | 낮음 (최신 권장) |

직관과 달리 **lowestPrice는 위험하다.** 가장 싼 풀은 보통 여유가 적어 곧 AWS가 회수할 가능성이 높다. capacityOptimized는 "지금 여유 용량이 가장 많은 풀"을 골라 회수 확률을 낮춘다 — 약간 더 비쌀 수 있어도 안정성이 훨씬 높다. 최신 권장인 priceCapacityOptimized는 가격과 여유 용량을 함께 본다.

> 💡 **관련 이론**: 여러 Spot 풀에 분산(diversified·capacityOptimized)하는 건 금융 **포트폴리오 분산투자**와 같은 발상이다. 한 풀(한 인스턴스 타입×AZ)에 전부 걸면 그 풀이 회수될 때 전체가 한꺼번에 날아간다(상관관계 1). 여러 풀에 나눠 담으면 한 풀이 회수돼도 나머지는 살아남아 전체 가용 용량의 변동성이 줄어든다. 분산투자가 개별 자산 위험을 상쇄하듯, Spot 풀 분산은 개별 풀의 회수 위험을 상쇄한다. 그래서 Mixed Instances ASG에서 인스턴스 타입을 여러 개 지정(m5/m5a/m6i)하는 것이 단일 타입보다 안정적이다 — 분산할 풀이 많을수록 동시 회수 확률이 낮아진다.

## 3층 비용 구조 — 약정·On-Demand·Spot의 조합 설계

실전 비용 최적화는 한 가지 옵션을 고르는 게 아니라 **세 층을 쌓는** 것이다. 워크로드를 안정성·변동성으로 나눠 각 층에 맞는 가격 모델을 입힌다.

```
Layer 3 ─ Spot (최대 90% 할인) ──────── 변동·무상태·회수 견딤
            배치, 빌드, 캐시 노드          (전체의 10~20%)
            capacityOptimized 전략

Layer 2 ─ On-Demand ─────────────────── 예측 어려운 변동분
            정가, 즉시 가용                 (전체의 20~30%)

Layer 1 ─ Savings Plans / RI (~72%) ──── 24/7 안정 baseline
            예측 가능한 상시 운영           (전체의 60~70%)
```

핵심 설계 원칙은 **"약정은 baseline에만"**이다. SP·RI는 사용하든 안 하든 약정 금액을 내야 하므로(use it or lose it), 절대 줄지 않는 최소 사용량(baseline)에만 약정을 걸어야 한다. baseline 위로 출렁이는 변동분은 On-Demand로, 그중 무상태로 회수를 견디는 부분은 Spot으로 내려보낸다. **Mixed Instances ASG**가 이 On-Demand + Spot 혼합을 한 그룹에서 구현하는 표준 도구다 — `OnDemandBaseCapacity`로 최소 On-Demand를 보장하고 그 위를 Spot으로 채운다.

마지막으로 **Capacity Reservation**을 약정과 혼동하면 안 된다. Capacity Reservation은 **용량 보장이지 할인이 아니다** — 특정 AZ에 인스턴스 용량을 확보해두는 것으로, 가격은 On-Demand와 같다(SP/RI와 조합하면 할인도 받는다). DR 사이트의 즉시 가용 보장, 블랙프라이데이 대비, 신규 인스턴스 타입의 가용성 부족 대응에 쓴다. "할인"이 아니라 "그 순간 반드시 인스턴스를 띄울 수 있음"을 사는 것이다.

> ⚠️ **함정**: SP·RI는 **사용하지 않아도 비용이 나간다.** 워크로드 변동성을 과소평가해 baseline보다 많이 약정하면, 안 쓰는 약정에 3년간 돈을 묶는다. 그래서 Cost Explorer의 **Utilization(약정 실제 사용률)**과 **Coverage(약정이 덮는 사용량 비율)** 리포트로 약정 적정성을 주기적으로 점검해야 한다. Utilization이 낮으면 과다 약정(돈 낭비), Coverage가 낮으면 약정을 더 걸 여지(추가 절감 기회)다. 시험에서 "워크로드 변동성이 큰데 어떤 약정?"이면 답은 거의 Compute SP(유연) 또는 On-Demand+Spot이고, Standard RI(묶임)는 오답이다.

## 정리하며

컴퓨팅 비용 최적화는 확실성과 변동성을 가격에 매핑하는 작업이다. 확실한 baseline은 약정으로 깎고(최대 72%), 변동분은 On-Demand로 받치고, 무상태 변동분은 Spot으로 헐값에 처리한다(최대 90%).

운영자가 기억할 다섯 가지는 이렇다. ① 약정 할인은 양쪽 이득 거래 — 길고 선결제 많을수록(3년·All Upfront) AWS의 불확실성을 더 없애 할인이 크다. ② 유연성과 할인율은 반비례 — Compute SP(유연, ~66%) vs EC2 Instance SP/Standard RI(묶임, ~72%). SP는 인스턴스가 아니라 지출액에 약정하므로 워크로드가 바뀌어도 따라온다. ③ RDS·Redshift·ElastiCache·OpenSearch는 SP가 없어 RI를 쓴다. ④ Spot은 무상태·회수 견딤 워크로드 전용, 2분 통보를 EventBridge·Lifecycle Hook으로 받아 우아하게 처리하고, capacityOptimized로 회수를 줄인다(lowestPrice는 위험). ⑤ Capacity Reservation은 할인이 아니라 용량 보장이고, 약정은 baseline에만 걸며 Utilization·Coverage로 적정성을 점검한다.

다음 글에선 Week 11 전체 — Compute Optimizer·Trusted Advisor·Cost Explorer·Budgets·약정·Spot — 를 실전 시나리오 문제로 묶어 "출제 키워드 → 정답 서비스" 매핑을 굳힌다.

---

## 📝 연습 문제

**문제 1.** 회사가 EC2·Fargate·Lambda를 모두 쓰고, 워크로드의 패밀리·리전이 자주 바뀐다. 코드/운영 변경 없이 자동으로 할인받을 약정은?

A) Standard RI

B) Compute Savings Plans — EC2/Fargate/Lambda 전부, 모든 리전·패밀리에 약정 금액 내 자동 적용

C) EC2 Instance Savings Plans

D) Convertible RI

**정답: B**

해설: Compute SP는 인스턴스 타입이 아니라 "시간당 컴퓨팅 지출액"에 약정하므로, c5든 c7g든 Fargate든 Lambda든 약정 한도까지 가장 비싼 On-Demand 사용분부터 자동 할인을 적용한다. 워크로드가 바뀌어도 약정이 따라오므로 패밀리·리전이 자주 바뀌는 환경에 최적이다. EC2 Instance SP(C)·Standard RI(A)는 더 큰 할인 대신 특정 패밀리/리전에 묶인다. Convertible RI(D)는 교환 가능하나 수동 작업이 필요하다.

---

**문제 2.** EC2 Instance Savings Plans가 Compute Savings Plans보다 할인율이 높은데도 항상 권장되지는 않는 이유는?

A) EC2 Instance SP가 더 비싸다

B) 유연성과 할인율은 반비례 — EC2 Instance SP는 특정 리전·패밀리에 묶여 워크로드 변경 시 약정이 따라오지 못한다

C) EC2 Instance SP는 Lambda에도 적용된다

D) 둘은 같은 것이다

**정답: B**

해설: 약정의 범위를 좁고 구체적으로 할수록 AWS의 불확실성을 더 줄여줘 할인이 커진다. EC2 Instance SP는 "특정 리전의 특정 패밀리"로 묶이는 대가로 ~72%까지 깎아주지만, 워크로드를 다른 패밀리/리전으로 옮기면 그 약정이 적용되지 않는다. Compute SP는 유연성을 위해 ~66%로 할인이 작은 대신 어디든 따라온다. 워크로드가 안정적이고 고정적이면 EC2 Instance SP가 유리하고, 변동적이면 Compute SP가 유리하다 — 유연성과 할인율의 줄다리기다.

---

**문제 3.** 매일 야간에 100대 노드로 EMR 빅데이터 배치를 돌린다. 무상태이고 회수돼도 작업을 다시 돌리면 된다. 비용 최소화 전략은?

A) On-Demand 100대

B) Spot Fleet + capacityOptimized 전략 — 무상태·회수 내성 배치는 Spot의 최적 대상(최대 90% 할인)

C) Standard RI 100대 3년 약정

D) Compute Savings Plans

**정답: B**

해설: 무상태이고 중단을 견디며 분산 가능한 배치 작업은 Spot의 교과서적 적합 워크로드다. 최대 90% 할인을 받으면서, capacityOptimized 전략으로 여유 용량이 많은 풀에서 인스턴스를 가져와 회수 빈도를 낮춘다. On-Demand(A)는 정가라 낭비고, RI(C)·SP(D)는 24/7 상시 워크로드용 약정이라 야간에만 도는 배치엔 부적합하다(약정 시간 대부분을 안 써 낭비).

---

**문제 4.** Spot 회수 시 ALB에서 deregister하고 진행 중 작업을 체크포인트로 저장한 뒤 종료하도록 자동화하려 한다. 어떤 구성인가?

A) cron으로 주기적 점검

B) 2분 전 통보를 EventBridge(EC2 Spot Instance Interruption Warning) → Lambda, 또는 ASG Lifecycle Hook으로 받아 정리 작업 수행

C) CloudWatch Alarm

D) IMDS를 1초마다 폴링하는 무한 루프만

**정답: B**

해설: AWS는 Spot 회수 2분 전에 EventBridge 이벤트와 IMDS 신호를 보낸다. EventBridge Rule로 이를 받아 Lambda(ALB deregister, 체크포인트 저장, 로그 백업)를 트리거하거나, ASG Lifecycle Hook으로 Terminating 상태에서 Heartbeat로 시간을 확보해 drain을 완료하는 것이 표준이다. 이 2분 안에 작업을 우아하게 마무리하거나 다른 인스턴스로 넘겨야 한다.

---

**문제 5.** Spot Allocation Strategy로 lowestPrice를 골랐더니 회수가 너무 자주 일어난다. 안정성을 높이려면?

A) lowestPrice 유지

B) capacityOptimized(또는 priceCapacityOptimized) — 여유 용량이 가장 많은 풀에서 가져와 회수 확률을 낮춘다

C) On-Demand로 전부 전환

D) 인스턴스 타입을 하나로 통일

**정답: B**

해설: 가장 싼 풀(lowestPrice)은 보통 여유 용량이 적어 AWS가 곧 회수할 가능성이 높다 — 직관과 달리 위험하다. capacityOptimized는 지금 여유 용량이 가장 많은 풀을 골라 회수 확률을 낮추고, priceCapacityOptimized는 가격과 여유 용량을 함께 본다(최신 권장). 또한 인스턴스 타입을 하나로 통일(D)하면 분산할 풀이 줄어 동시 회수 위험이 커지므로, 오히려 여러 타입을 지정해 풀을 분산(포트폴리오 분산)하는 것이 안정적이다.

---

**문제 6.** 신규 m7i 인스턴스를 BCP(재해 복구)용으로 특정 AZ에 항상 즉시 띄울 수 있게 보장하고 싶다. 목표는 비용 절감이 아니라 가용성이다. 무엇을 쓰나?

A) Standard RI(할인은 되지만 용량 보장은 아님)

B) EC2 Capacity Reservation — 특정 AZ에 용량을 확보, 할인은 별도(SP/RI와 조합 가능)

C) Spot

D) Compute Savings Plans

**정답: B**

해설: Capacity Reservation은 "그 순간 반드시 인스턴스를 띄울 수 있음"을 사는 것으로, 가격은 On-Demand와 같고 할인이 목적이 아니다. 신규 인스턴스 타입의 AZ 용량 부족, DR 즉시 가용 보장, 대형 이벤트 대비가 정확한 사용 사례다. SP/RI(A·D)는 할인일 뿐 용량을 보장하지 않으며, 필요하면 Capacity Reservation과 조합해 할인+보장을 동시에 얻는다. Spot(C)은 회수되므로 가용성 보장과 정반대다.

---

**문제 7.** 회사가 Compute SP를 구매했는데 Cost Explorer에서 Utilization이 60%로 낮게 나온다. 이것이 의미하는 바와 조치는?

A) 약정이 부족하다 — 더 산다

B) 과다 약정 상태 — 약정한 금액의 40%를 안 쓰고 버리고 있으므로, 다음 약정 시 baseline에 맞춰 규모를 줄여야 한다

C) Spot으로 전환하면 해결된다

D) Utilization은 의미 없는 지표다

**정답: B**

해설: Utilization은 약정한 금액 중 실제로 사용해 할인 혜택을 본 비율이다. 60%면 약정의 40%를 안 쓰고도 비용을 내고 있다는 뜻 — 과다 약정이다. SP·RI는 use-it-or-lose-it이라 안 써도 돈이 나가므로, 변동성을 과소평가해 baseline보다 많이 약정한 것이다. 조치는 다음 약정을 절대 줄지 않는 최소 사용량(baseline)에 맞춰 규모를 줄이는 것이다. 반대로 Coverage(약정이 덮는 사용량 비율)가 낮으면 약정을 더 걸어 추가 절감할 여지를 뜻한다.

---

## 📌 오늘의 요약

1. 약정 할인은 양쪽 이득 거래 — 3년·All Upfront처럼 길고 선결제 많을수록 AWS 불확실성을 줄여 할인이 큼(화폐의 시간 가치)
2. 유연성↔할인율 반비례 — Compute SP(유연 ~66%) vs EC2 Instance SP/Standard RI(묶임 ~72%). SP는 인스턴스가 아니라 지출액에 약정
3. RDS·Redshift·ElastiCache·OpenSearch는 SP 없이 RI만, 신규 약정은 거의 SP
4. Spot은 무상태·회수 견딤 전용(최대 90%), 2분 통보를 EventBridge·Lifecycle Hook으로 처리, capacityOptimized로 회수 감소(lowestPrice 위험)
5. Capacity Reservation은 할인 아닌 용량 보장, 약정은 baseline에만, Utilization·Coverage로 적정성 점검
