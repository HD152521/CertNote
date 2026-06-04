# Day 56 - Savings Plans·RI 전략 — 약정 할인의 수학, 적용 순서의 내부 동작, Organization 공유

클라우드 비용을 처음 본 재무팀은 늘 같은 질문을 한다. "왜 같은 서버를 쓰는데 우리는 옆 회사보다 30% 더 내나?" 답은 대개 워크로드가 비효율적이어서가 아니라, 옆 회사가 **약정(commitment)**을 샀기 때문이다. AWS의 On-Demand 가격은 "아무 약속 없이 언제든 켜고 끄는" 자유에 매기는 프리미엄이고, 그 자유를 일부 포기하면 AWS는 최대 72%까지 깎아준다. 이 거래의 본질을 이해하지 못하면 SAP-C02 시험의 비용 시나리오를 절대 못 푼다.

SAP-C02에서 Savings Plans·RI는 "어떤 약정 모델을 골라야 하나", "Compute SP와 EC2 Instance SP의 트레이드오프", "적용 우선순위가 어떻게 작동하나", "Organization 전체에서 약정을 어떻게 공유·통제하나"라는 아키텍처 의사결정으로 출제된다. 오늘은 약정 할인의 경제학적 원리부터 Billing 엔진의 적용 순서 내부 동작, 그리고 멀티 계정 공유의 함정까지 분해한다.

## 약정 할인의 본질 — 누가 어떤 위험을 떠안는가

약정 할인을 단순히 "오래 쓰면 깎아준다"로 이해하면 시험에서 막힌다. 더 정확한 모델은 **위험의 이전(risk transfer)**이다. AWS는 데이터센터에 물리 서버를 미리 사다 놓아야 한다 — 이건 자본 지출이고, 고객이 안 쓰면 그대로 손실이다. 고객이 "1년/3년간 시간당 $X어치는 반드시 쓰겠다"고 약속하면 AWS의 capacity planning 위험과 재고 위험이 줄어든다. 그 대가로 할인을 준다.

이 관점이 중요한 이유는 세 가지 약정 모델의 할인율 차이를 한 번에 설명하기 때문이다. **약정이 구체적일수록(= AWS의 예측 불확실성을 더 많이 제거할수록) 할인이 크다.** EC2 Instance SP는 "이 리전, 이 family를 쓰겠다"고 못 박으므로 AWS가 정확히 어떤 하드웨어를 준비할지 안다 → 최대 72%. Compute SP는 "EC2든 Fargate든 Lambda든, 어느 리전·family든 시간당 $X"라는 느슨한 약속이라 AWS의 예측이 어려워진다 → 최대 66%. 이 6%p 차이가 바로 **유연성 프리미엄(flexibility premium)**이다.

> 💡 **관련 이론**: 이 구조는 금융의 **선도 계약(forward contract)**과 정확히 같은 경제학을 따른다. 미래 가격 변동 위험을 한쪽이 떠안는 대가로 가격을 고정하는 것이다. Spot Instance는 정반대 극단 — AWS의 남는 capacity를 경매로 풀고(시장가), 회수 위험을 전부 고객이 떠안는 대신 최대 90% 할인을 준다. 즉 AWS의 비용 모델은 "위험을 누가 얼마나 떠안느냐"의 연속 스펙트럼이다: On-Demand(AWS가 전부 떠안음, 0% 할인) → Convertible RI → Compute SP → EC2 Instance SP / Standard RI(고객이 약정 위험을 크게 떠안음, ~72%) → Spot(고객이 회수 위험까지 떠안음, ~90%). 시험 시나리오의 "유연성 vs 할인" 트레이드오프는 모두 이 스펙트럼 어디에 워크로드를 놓을지의 문제다.

> 🔍 **더 깊이**: 결제 옵션(All/Partial/No Upfront)의 할인 차이도 같은 위험 논리다. All Upfront는 AWS가 현금을 미리 받으므로(고객 신용 위험 제거 + 화폐의 시간 가치) 가장 큰 할인을 준다. 3년 m5.xlarge Standard RI 기준 대략: On-Demand 대비 All Upfront ~60%, Partial ~58%, No Upfront ~56% 절감 수준으로, 같은 약정 안에서도 결제 방식만으로 수 %p가 갈린다. SAP 시험에서 "현금 흐름 제약 없이 최대 할인"이면 All Upfront, "초기 현금 부담 최소화 + 약정 할인"이면 No Upfront가 정답 신호다.

## Savings Plans 3종 — 단위는 "달러/시간"이다

SP를 RI와 헷갈리는 가장 큰 이유는 **약정 단위**가 다르기 때문이다. RI는 "m5.large 인스턴스 N개"처럼 인스턴스를 약정한다. SP는 "시간당 $10어치 컴퓨팅"처럼 **금액**을 약정한다. 이 차이가 SP를 훨씬 유연하게 만든다 — 인스턴스 종류를 바꿔도 시간당 소비 금액이 약정액 이하면 자동으로 할인이 적용된다.

| 유형 | 적용 범위 | 최대 할인 | 약정 단위 | 핵심 특성 |
|------|----------|----------|----------|----------|
| **Compute SP** | EC2 + Fargate + Lambda (리전·OS·family·tenancy 무관) | ~66% | $/시간 | 가장 유연, 워크로드 자유 |
| **EC2 Instance SP** | 특정 리전 + 특정 family 한정 | ~72% | $/시간 | 같은 family 내 size·OS·AZ 자유 |
| **SageMaker SP** | SageMaker Training·Inference·Notebook·Processing 등 | ~64% | $/시간 | ML 워크로드 전용 |

EC2 Instance SP가 미묘하게 강력한 점은 "family를 고정하되 그 안에서는 자유"라는 점이다. us-east-1의 m5 family로 약정하면, m5.large든 m5.4xlarge든, Linux든 Windows든, 어느 AZ든 그 family 안의 모든 사용이 할인 대상이다. Standard RI보다 한 단계 더 유연하면서 같은 ~72% 할인을 받는다.

> 💡 **관련 이론**: SP가 "인스턴스"가 아니라 "금액"을 약정하는 설계는 CS의 **추상화 계층(abstraction layer)** 사고와 같다. RI는 물리적 자원(인스턴스 타입)에 직접 결합된 약정이라 자원이 바뀌면 약정이 깨진다. SP는 자원 위에 "정규화된 시간당 비용"이라는 추상 계층을 한 겹 올려, 그 아래 실제 인스턴스가 무엇이든 약정이 매칭되게 했다. 이 덕분에 워크로드를 m5에서 m6i로 현대화해도 SP 약정은 그대로 유효하다. 추상화가 결합도(coupling)를 낮춰 변경 비용을 줄이는 전형적 패턴이다.

## RI 2종과 Capacity Reservation — 할인과 용량은 별개다

| 유형 | 할인 | 변경 가능 범위 | 용량 보장 |
|------|------|--------------|----------|
| **Standard RI** | ~72% | size만 일부(같은 family·정규화 단위 내) | Zonal일 때만 |
| **Convertible RI** | ~54% | family·OS·tenancy·플랫폼 변경 가능(교환) | Zonal일 때만 |
| **Zonal RI** | ~72% | 특정 AZ 고정 | **용량 예약 포함** |
| **Regional RI** | ~72% | 리전 내 AZ 유연 | 용량 보장 없음 |

여기서 가장 자주 틀리는 지점은 **"RI = 용량 보장"이라는 오해**다. Regional 스코프 RI는 할인만 줄 뿐 용량을 보장하지 않는다. 용량까지 보장받으려면 **Zonal RI**(특정 AZ에 용량 예약)이거나 **On-Demand Capacity Reservation(ODCR)**을 써야 한다. ODCR은 할인이 전혀 없는 순수 용량 예약이고, 여기에 Savings Plans를 얹으면 "용량 보장 + 할인"을 동시에 얻는 표준 조합이 된다.

> 🔍 **더 깊이**: Convertible RI의 "교환(exchange)"은 환불이 아니라 **동등 가치 이상으로의 재구성**이다. m5 Convertible RI를 c5로 바꾸려면, 남은 약정 가치가 새 RI 가치 이상이어야 교환된다(돈을 돌려받진 못함). 그래서 Convertible은 "family가 바뀔 가능성은 있지만 약정은 유지하고 싶을 때"의 도구다. 다만 현대적 best practice는 "굳이 Convertible RI를 쓸 거면 Compute SP를 써라"다 — Compute SP가 교환 절차 없이 자동으로 모든 family에 매칭되면서 관리가 훨씬 단순하기 때문이다. 시험에서 Convertible RI와 Compute SP가 둘 다 선택지에 있고 "운영 단순성"을 강조하면 Compute SP가 더 나은 답인 경우가 많다.

> 📚 **사례**: 한 미디어 기업은 2019년 워크로드 현대화 과정에서 m4 family Standard RI를 대량 보유한 채 m5/m6i로 마이그레이션하려다 막혔다. Standard RI는 family 변경이 안 되니 m4 RI는 점점 놀고, 새 m5 인스턴스는 On-Demand로 청구됐다. 결국 남은 m4 RI를 Marketplace에서 손해 보고 팔았다(원인: family에 결합된 약정). 교훈은 명확했다 — 현대화·기술 변화가 예상되는 워크로드에 Standard RI를 3년 약정하는 것은 안티패턴이고, 같은 상황을 Compute SP로 약정했다면 family를 자유롭게 바꿔도 약정이 그대로 유효했을 것이다. 2020년 이후 이 회사는 RI를 거의 끊고 Compute SP 중심으로 전환했다.

## 적용 우선순위 — Billing 엔진은 어떻게 할인을 매칭하나

시험에서 "RI를 샀는데 SP 활용률이 떨어졌다" 같은 시나리오를 풀려면 Billing 엔진의 **적용 순서**를 알아야 한다. AWS는 매시간 사용량에 대해 정해진 순서로 할인을 차감한다.

```
매시간 컴퓨팅 사용량 발생
   ↓
1. Zonal RI 차감 (가장 구체적 — 특정 AZ·인스턴스)
   ↓
2. Regional RI 차감 (Standard → Convertible)
   ↓
3. Savings Plans 차감 (EC2 Instance SP → Compute SP → SageMaker SP)
   - 같은 SP 안에서는 할인율 높은 사용분부터 매칭 (혜택 극대화)
   ↓
4. On-Demand 청구 (남은 사용량)
```

핵심 원리는 **"가장 구체적이고 좁은 약정이 먼저 소진된다"**는 것이다. RI는 특정 인스턴스에 묶여 있어 다른 데 못 쓰니 먼저 적용하고, SP는 더 유연하니 나중에 적용해 낭비를 막는다. SP 내부에서도 "할인율이 가장 높은 사용분부터" 매칭해 고객 혜택을 최대화한다(시간당 약정 금액을 가장 비싼 On-Demand 사용분 절감에 먼저 쓰는 식).

> ⚠️ **함정**: "RI와 SP를 둘 다 충분히 샀는데 SP 활용률(utilization)이 100%가 안 된다"는 시나리오. 원인은 RI가 먼저 사용량을 흡수해서 SP가 매칭할 사용량이 부족해진 것이다. RI를 과도하게 사면 SP와 충돌해 SP가 놀게 된다. 정답 방향은 "RI를 줄이거나, 신규 약정은 RI 대신 SP로 통일"이다. 시험에서 "SP utilization이 낮다 → 더 많은 워크로드를 약정 대상으로 끌어와야 한다"가 아니라 "기존 RI가 사용량을 선점하고 있다"를 의심하는 게 Pro 수준의 사고다.

> 🔍 **더 깊이**: AWS는 이 충돌을 줄이기 위해 **Cost Explorer의 Savings Plans / RI Recommendation**을 제공한다. 이 추천 엔진은 과거 7/30/60일 사용량(lookback period)을 분석해 "이만큼 약정하면 낭비 없이 최대 절감"인 시간당 약정액을 계산한다. 내부적으로는 사용량의 **하한선(baseline)**을 찾는 최적화 문제다 — spike까지 약정하면 비는 시간에 약정이 놀고, 너무 적게 약정하면 절감 기회를 놓친다. 그래서 추천은 보통 "꾸준히 항상 켜져 있는 하한 사용량"만큼만 약정하고 변동분은 On-Demand/Spot으로 두는 형태로 나온다.

## Organization 차원 공유 — 약정을 계정 경계 너머로

멀티 계정 환경(SAP 시험의 단골 전제)에서 약정 할인은 **통합 결제(Consolidated Billing)** 덕분에 계정 경계를 넘어 공유된다. A 계정에서 산 Compute SP의 약정액이 A에서 다 안 쓰이면, 같은 Organization의 B·C 계정 사용량에 자동으로 적용된다.

이 공유는 **관리 계정(management account)에서 Sharing이 활성화**돼 있을 때만 작동한다(기본 활성). 특정 계정의 약정을 다른 계정과 공유하고 싶지 않으면(예: 부서별 비용 분리) 관리 계정에서 해당 계정의 RI/SP 공유를 끌 수 있다.

> 💡 **관련 이론**: 이 공유 모델은 분산 시스템의 **자원 풀링(resource pooling)**과 같은 효율을 낸다. 계정마다 따로 약정을 사면 각 계정이 자기 spike에 맞춰 과약정하게 되고 빈 약정이 생긴다. 반대로 Organization 전체를 하나의 풀로 보면, 한 계정이 한가할 때 남는 약정을 바쁜 계정이 흡수해 전체 활용률이 올라간다. 통계적으로 여러 워크로드를 합치면 변동성이 상쇄되는(law of large numbers) 효과로, 풀이 클수록 약정을 사용량 하한에 더 타이트하게 맞춰도 안전하다. 그래서 대규모 Org는 **약정 구매를 중앙(관리 계정 또는 전용 결제 계정)에서 일괄 관리**하는 게 best practice다.

> ⚠️ **함정**: "각 멤버 계정이 자기 SP를 사야 한다"를 고르면 Pro 시험에서 거의 오답이다. 약정은 Org 전체에 공유되므로 중앙에서 통합 구매하는 게 활용률·관리 양면에서 우월하다. 또 하나 — RI/SP 할인 공유와 **요금 할인(volume tiering)**은 다른 개념이다. 통합 결제는 사용량을 합산해 볼륨 티어 할인도 같이 적용하므로, 계정을 쪼개 두면 손해다. "비용 분리를 위해 계정을 나누되 할인은 공유"가 멀티 계정 비용 설계의 핵심이다.

## 정리하며

Savings Plans·RI의 핵심은 "약정의 구체성과 할인율은 비례한다"는 위험 이전의 경제학이다. **Compute SP(최대 유연·~66%) ↔ EC2 Instance SP / Standard RI(family 고정·~72%) ↔ Spot(회수 위험·~90%)**의 스펙트럼에서 워크로드를 어디에 놓을지가 모든 시나리오의 뼈대다. Billing 엔진은 "구체적인 약정(Zonal RI)부터 유연한 약정(Compute SP) 순"으로 차감하며, Organization은 통합 결제로 약정을 계정 너머 공유한다.

SAP 시험 단골 매핑: (1) "EC2+Fargate+Lambda 통합 할인" → **Compute SP**, (2) "특정 family·리전 3년 최대 할인" → **EC2 Instance SP / Standard RI**, (3) "family 변경 예상 + 약정 유지" → **Convertible RI**(또는 더 단순한 Compute SP), (4) "용량 보장 + 할인" → **Zonal RI** 또는 **ODCR + SP**, (5) "현금 흐름 여유 + 최대 할인" → **All Upfront**, (6) "멤버 계정마다 SP 구매" → 오답(중앙 통합 구매·공유), (7) "SP 활용률 저하" → RI 과약정이 사용량 선점 의심. 다음 day는 Compute Optimizer와 Rightsizing을 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 EC2, Fargate, Lambda를 모두 사용하며 인스턴스 family를 워크로드에 따라 자주 바꾼다. 1년 약정으로 최대한 넓게 할인을 적용하고 싶다. 가장 적합한 것은?

A) Standard RI (m5 family)

B) EC2 Instance Savings Plans

C) Compute Savings Plans

D) Zonal RI

**정답: C**
해설: Compute SP는 EC2·Fargate·Lambda를 모두 포괄하고 리전·OS·family·tenancy 무관하게 시간당 약정 금액 내 사용에 자동으로 할인을 적용한다. family를 자주 바꾸는 워크로드에 정확히 맞는다. A는 family에 묶여 변경 시 약정이 놀고 Fargate·Lambda를 못 덮는다. B는 특정 리전·family 고정이라 "family를 자주 바꾼다"는 요건과 충돌한다. D는 특정 AZ 용량 예약 목적이지 다양한 컴퓨팅 통합 할인이 아니다. 함정: "Fargate·Lambda 포함"은 오직 Compute SP만 가능하다.

---

**문제 2.** 동일한 m6i family를 us-east-1에서 3년간 24시간 가동할 예정이며 family 변경 계획이 전혀 없다. 최대 할인을 원한다. 가장 적합한 것은?

A) Compute Savings Plans

B) EC2 Instance Savings Plans (또는 Standard RI)

C) Convertible RI

D) On-Demand

**정답: B**
해설: family·리전이 고정이면 EC2 Instance SP 또는 Standard RI가 ~72%로 가장 큰 할인을 준다. EC2 Instance SP는 같은 family 내 size·OS·AZ 변경까지 허용해 Standard RI보다 한 단계 유연하면서 동일 할인이다. A(Compute SP)는 유연성 대가로 ~66%로 할인이 낮다. C(Convertible)는 변경 자유를 사는 대신 ~54%로 가장 낮아 "변경 계획 없음 + 최대 할인" 요건에 부적합하다. D는 정가다. 함정: "family 고정 + 최대 할인"은 유연성을 살 이유가 없으므로 가장 구체적인 약정을 고른다.

---

**문제 3.** 한 Organization이 10개 멤버 계정을 통합 결제로 운영한다. 전체 컴퓨팅 비용을 최소화하면서 약정 활용률을 극대화하려 한다. 가장 적합한 약정 구매 전략은?

A) 각 멤버 계정이 자기 사용량에 맞춰 개별적으로 SP를 구매

B) 관리 계정(또는 전용 결제 계정)에서 Org 전체 사용량 하한에 맞춰 SP를 중앙 구매하고 공유 활성화

C) 멤버 계정마다 Standard RI를 구매

D) On-Demand만 사용하고 약정하지 않음

**정답: B**
해설: 통합 결제 환경에서 SP·RI 할인은 Sharing이 활성화되면 Org 전체에 공유된다. 여러 워크로드를 하나의 풀로 합치면 변동성이 상쇄되어 사용량 하한에 더 타이트하게 약정해도 안전하고, 한 계정이 한가할 때 남는 약정을 바쁜 계정이 흡수해 활용률이 올라간다. A·C는 계정별 과약정으로 빈 약정이 생겨 활용률이 떨어진다. D는 약정 할인을 포기해 비용 최소화 목표에 반한다. 함정: "멤버 계정마다 개별 구매"는 Pro 시험의 전형적 오답이다.

---

**문제 4.** 미션 크리티컬 워크로드가 특정 AZ에서 반드시 용량을 확보해야 하며(장애 시 확장 보장), 동시에 비용 할인도 받고자 한다. 가장 적합한 것은?

A) Regional Standard RI

B) Compute Savings Plans 단독

C) Zonal RI 또는 ODCR + Savings Plans

D) Spot Instance

**정답: C**
해설: 용량 보장이 필요하면 Zonal RI(특정 AZ 용량 예약 + 할인) 또는 ODCR(순수 용량 예약, 할인 없음) + SP(할인) 조합이 정답이다. A(Regional RI)는 할인만 주고 용량을 보장하지 않는다. B(Compute SP)도 할인만 주고 용량 보장이 없다. D(Spot)는 회수될 수 있어 미션 크리티컬 용량 보장과 정반대다. 함정: "Regional RI = 용량 보장"은 흔한 오해이며, 용량 보장은 Zonal RI 또는 ODCR이다.

---

**문제 5.** 한 팀이 m5 Standard RI를 3년 약정으로 보유 중인데, 회사가 워크로드를 m6i로 현대화하기로 결정했다. RI를 낭비하지 않으면서 향후 family 변경에 유연하게 대응하려면 신규 약정은 무엇으로 해야 하나?

A) 추가 m5 Standard RI 구매

B) Compute Savings Plans (또는 Convertible RI)

C) Zonal RI

D) On-Demand로 전환

**정답: B**
해설: family 변경(m5→m6i)이 예상되면 family에 묶이지 않는 약정이 필요하다. Compute SP는 family·리전·OS 무관하게 자동 매칭되어 현대화 후에도 약정이 그대로 유효하다(Convertible RI도 교환으로 가능하나 절차가 번거로워 Compute SP가 운영상 우월). A는 같은 함정을 반복해 m5 RI가 또 놀게 된다. C는 AZ 고정 용량 목적이지 family 유연성과 무관하다. D는 할인을 포기한다. 함정: 현대화·기술 변화가 예상되는 워크로드에 family 결합 약정(Standard RI)은 안티패턴이다.

---

**문제 6.** 비용팀이 신규로 RI와 SP를 동시에 대량 구매한 뒤, SP 활용률(utilization)이 100%에 미치지 못하는 것을 발견했다. 가장 가능성 높은 원인은?

A) SP는 원래 100% 활용이 불가능하다

B) RI가 사용량을 먼저 흡수(차감)해 SP가 매칭할 사용량이 부족해졌다

C) Compute SP는 Fargate를 덮지 못한다

D) SP는 통합 결제에서 공유되지 않는다

**정답: B**
해설: Billing 엔진은 "구체적인 약정(RI)부터 차감하고 유연한 약정(SP)을 나중에" 적용한다. RI를 과도하게 사면 RI가 매시간 사용량을 선점해 SP가 매칭할 잔여 사용량이 줄어 SP 활용률이 떨어진다. 정답 방향은 RI를 줄이거나 신규 약정을 SP로 통일하는 것이다. A는 틀림(적정 약정이면 100% 가능). C는 틀림(Compute SP는 Fargate 포함). D는 틀림(통합 결제에서 SP는 공유됨). 함정: SP 활용률 저하는 "사용량 부족"이 아니라 "RI 과약정의 선점"을 먼저 의심한다.

---

**문제 7.** 회사가 초기 현금 지출을 최소화하면서도 약정 기반 할인을 받고자 한다. 어떤 결제 옵션이 가장 적합한가?

A) All Upfront

B) Partial Upfront

C) No Upfront

D) 약정 없이 On-Demand

**정답: C**
해설: No Upfront는 선결제 없이 약정 기간 동안 월 단위로 나눠 내면서도 약정 할인을 받는다. 초기 현금 부담을 최소화하려는 요건에 맞는다. A(All Upfront)는 할인은 가장 크지만 초기 현금 지출이 최대다. B(Partial)는 그 중간이다. D는 할인을 전혀 받지 못한다. 함정: "초기 현금 최소화 + 약정 할인"은 No Upfront, "현금 여유 + 최대 할인"은 All Upfront로 갈린다.
