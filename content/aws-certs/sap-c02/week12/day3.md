# Day 3 - Cost Explorer·Budgets·CUR — 비용 가시성의 계층, 예산 자동 통제, FinOps 데이터 파이프라인

"측정할 수 없으면 관리할 수 없다"는 격언은 클라우드 비용에서 특히 잔인하게 작동한다. 온프레미스에서는 서버를 더 사려면 결재가 필요했지만, 클라우드에서는 개발자 한 명이 `terraform apply` 한 번으로 월 수만 달러를 만들 수 있다. 지출이 분산되고 실시간이며 셀프서비스인 이 환경에서 비용을 통제하려면, **가시성(보기) → 예산(임계) → 자동 대응(통제)**의 세 계층이 모두 필요하다. AWS는 이를 각각 Cost Explorer, Budgets, CUR + Budgets Action으로 제공한다. 이 사고 체계는 2019년 출범한 **FinOps Foundation**이 정립한 "Inform → Optimize → Operate" 세 단계 프레임워크와 정확히 대응한다 — Inform(가시성·할당), Optimize(rightsizing·약정), Operate(거버넌스·자동화).

SAP-C02에서 이 영역은 "어떤 도구가 어떤 세밀도(granularity)의 데이터를 주나", "예산 초과 시 자동으로 무엇을 막을 수 있나", "시간 단위 청구를 SQL로 분석하려면", "멀티 계정 비용을 어떻게 팀별로 쪼개나"라는 FinOps 운영 설계로 출제된다. 오늘은 세 도구의 정확한 경계와 데이터 계층, 예산 자동 통제의 내부 동작, 그리고 멀티 클라우드 비용 표준까지 분해한다.

## 비용 데이터의 세 계층 — 세밀도와 목적의 트레이드오프

세 도구를 외우기 전에 "이들이 같은 비용 데이터를 다른 해상도로 본다"는 구조를 잡아야 한다. 같은 청구 데이터를 요약·시각화하면 Cost Explorer, 원본 그대로 시간 단위로 펼치면 CUR, 임계치를 걸어 감시하면 Budgets이다.

| 도구 | 데이터 세밀도 | 주 용도 | 강점 | 한계 |
|------|--------------|---------|------|------|
| **Cost Explorer** | 일 단위(시간 단위 일부) | 시각화·진단·예측 | 빠른 대화형 분석, Forecast | 컬럼 단위 심층 분석 불가 |
| **Budgets** | 일/월 집계 | 알림·자동 통제 | 임계치 기반 액션 | 분석 도구 아님 |
| **CUR** | **시간 단위, ~200개 컬럼** | 상세 분석·BI | 모든 청구 항목, SQL | 직접 시각화 없음(BI 필요) |

핵심 직관: **Cost Explorer는 "눈으로 빠르게", CUR은 "SQL로 깊게", Budgets은 "임계치로 자동"**이다. "시간 단위 + 모든 항목 + SQL"이 시나리오에 나오면 무조건 CUR이고, "초과 시 자동으로 무엇을 멈춘다"면 Budgets Action이다.

> 💡 **관련 이론**: 이 계층 구조는 데이터 웨어하우징의 **OLTP-OLAP 분리** 및 **메달리온 아키텍처(bronze→silver→gold)**와 같은 사고다. CUR은 가공되지 않은 사실 테이블(bronze/fact table)을 그대로 S3에 내리고, Athena·Redshift가 silver(정제·집계)를, Cost Explorer·QuickSight 대시보드가 gold(소비용 뷰)를 담당한다. Cost Explorer는 미리 집계·캐시된 큐브(cube)를 빠르게 보여주는 OLAP 프론트엔드처럼 동작해 응답이 빠르지만 임의의 깊은 질의는 못 한다. 즉시성(Cost Explorer)과 임의성(CUR)은 본질적 트레이드오프이며, 대규모 FinOps 조직은 둘을 함께 쓴다 — Cost Explorer로 일상 모니터링, CUR로 단가·이상 심층 분석.

> 🔍 **더 깊이**: Cost Explorer는 무료지만 **API 호출당 $0.01** 과금이 있다. FinOps 대시보드를 만들 때 Cost Explorer API를 매분 폴링하면 호출비가 누적되므로, 대규모 자동화에서는 CUR을 Athena로 쿼리하는 쪽이 단가 분석에도 호출비에도 유리하다. 시험에서 "비용 분석을 자체 대시보드로 자동화"가 나오면 CUR+Athena+QuickSight 조합이 Cost Explorer API 폴링보다 우월한 답인 경우가 많다.

## Cost Explorer — 시각화와 예측, 그리고 약정 리포트

Cost Explorer는 기본 12~13개월(설정 시 최대 38개월)의 비용을 일·월·서비스·계정·태그 등 차원으로 시각화한다. 단순 그래프 도구를 넘어 두 가지 고급 기능이 시험에 자주 나온다.

- **Forecast(예측)**: 과거 패턴으로 향후 최대 12개월 비용을 예측한다. "다음 분기 예산 수립"의 정답 신호.
- **Savings Plans / RI Coverage·Utilization 리포트**: 약정이 얼마나 사용량을 덮는지(Coverage), 약정이 얼마나 활용되는지(Utilization)를 보여준다. 어제 다룬 "RI 과약정으로 SP 활용률 저하"를 진단하는 바로 그 화면이다.

> 🔍 **더 깊이**: Coverage와 Utilization은 헷갈리기 쉬운 한 쌍이다. **Coverage**는 "전체 사용량 중 약정으로 할인받은 비율"(낮으면 약정을 더 살 여지) — 사용량 관점. **Utilization**은 "산 약정 중 실제로 쓰인 비율"(낮으면 약정을 낭비 중) — 약정 관점. 이상적 상태는 Utilization 100%(약정 낭비 없음)를 유지하면서 Coverage를 적정선(보통 baseline 사용량 수준)까지 올리는 것이다. 시험에서 "약정을 더 사야 하나?"는 Coverage를, "약정이 낭비되나?"는 Utilization을 보라는 신호다.

> 🔍 **더 깊이**: Cost Explorer의 Forecast는 단순 선형 외삽이 아니라 **신뢰 구간(prediction interval)**을 함께 제시하는 통계 예측이다. 과거 데이터가 적거나 변동이 크면 구간이 넓어져 예측 신뢰도가 낮음을 표시한다. 시계열 예측의 일반 원리(분산이 클수록 예측 구간이 넓다)가 그대로 드러나며, "신규 서비스라 과거 데이터가 부족해 예측이 불안정"한 시나리오에서는 Forecast보다 Anomaly Detection이 더 적합하다는 판단으로 이어진다.

## AWS Budgets — 알림을 넘어 자동 통제로

Budgets의 진짜 시험 포인트는 단순 알림이 아니라 **Budgets Action**이다. 임계치를 넘으면 사람에게 메일을 보내는 데서 그치지 않고, **자동으로 행동**할 수 있다.

| 예산 유형 | 감시 대상 |
|-----------|----------|
| **Cost Budget** | 금액 한도($) |
| **Usage Budget** | 사용량(시간·GB·요청 수 등) |
| **RI / SP Utilization** | 약정 활용률 하한 |
| **RI / SP Coverage** | 약정 커버리지 |

**Budgets Action**이 임계치 초과 시 자동 수행할 수 있는 것:

- **IAM Policy 적용**: 특정 사용자·역할에 Deny 정책을 붙여 신규 리소스 생성 차단
- **SCP 적용**: Organization 차원에서 특정 액션 차단
- **EC2/RDS 중지**: 지정한 인스턴스를 자동 정지

> 🎯 **시나리오**: "개발 계정의 월 비용이 $5,000을 넘으면 더 이상 새 EC2를 시작하지 못하게 하라." → **Budgets(Cost Budget) + Budgets Action(IAM Deny Policy 자동 적용)**. CloudWatch Alarm은 알림만 가능하고, Lambda 스케줄은 사후에 도는 배치라 실시간 차단이 아니다. Budgets Action만이 "임계 초과 → 즉시 정책 자동 적용"을 한 메커니즘으로 묶는다. 액션은 자동 실행과 수동 승인 후 실행 중 선택할 수 있어, 운영 영향이 큰 SCP 적용은 승인형으로 두는 게 안전하다.

> ⚠️ **함정**: "비용 초과 시 자동으로 인스턴스를 막아라"의 정답으로 CloudWatch Alarm을 고르면 틀린다. CloudWatch는 메트릭 기반 알림·트리거이지 비용 임계에 IAM/SCP를 자동 적용하는 메커니즘이 아니다(참고로 청구 메트릭 자체는 us-east-1에서만 CloudWatch로 노출되는 별도 함정도 있다). 또 Budgets Action은 "이미 켜진 것을 멈추는 것(EC2 stop)"과 "새로 켜는 것을 막는 것(IAM Deny)"을 구분해 설계해야 한다 — 시나리오가 "신규 생성 차단"이면 IAM/SCP, "현재 가동분 정지"면 EC2/RDS stop이다.

> 💡 **관련 이론**: Budgets의 한계는 **결제 데이터 갱신 지연(billing latency)**이다. AWS 청구 데이터는 보통 수 시간 단위로 갱신되므로 Budgets는 실시간이 아니다 — "임계 초과 후 차단"과 "초과 발생" 사이에 시차가 있다. 이는 분산 청구 시스템의 **최종 일관성(eventual consistency)** 특성이다. 그래서 진짜 하드 캡(절대 못 넘게)이 필요하면 Budgets만으로는 부족하고, 사전에 SCP로 리소스 타입·리전·서비스 자체를 금지하는 예방적(preventive) 통제를 함께 둔다. 시험에서 "예산을 절대 못 넘게 보장"이면 사후 탐지형 Budgets가 아니라 예방형 SCP/Service Quotas 쪽 신호를 의심한다.

## CUR — 가장 깊은 진실, 그리고 분석 파이프라인

CUR(Cost and Usage Report)은 AWS 청구의 **원본 사실 테이블**이다. 시간 단위로, 약 200개 컬럼에 걸쳐 모든 청구 항목을 기록한다. CUR은 그 자체로 화면이 없다 — S3에 (보통 Parquet으로) 떨어지고, **Athena·Redshift·QuickSight**로 쿼리·시각화한다.

```
[CUR / Data Exports 정의] → [S3 버킷에 시간 단위 Parquet 일일 적재]
                     ↓
        [Glue Crawler / Athena 테이블]
                     ↓
        [Athena SQL 쿼리]  ← 단가·UsageType 단위 심층 분석
                     ↓
        [QuickSight 대시보드]  ← FinOps 시각화 (예: CUDOS / CID 대시보드)
```

CUR의 위력은 **lineItem/UsageType** 같은 컬럼에 있다. 예를 들어 `USE2-DataTransfer-Out-Bytes`는 us-east-2에서 인터넷으로의 egress, `NatGateway-Bytes`는 NAT Gateway 처리량 — Cost Explorer로는 "데이터 전송"으로 뭉뚱그려 보이는 비용을 CUR은 정확히 어떤 사용분인지 쪼개 보여준다. 대규모 환경의 단가 분석은 CUR 없이는 불가능하다. AWS가 공개한 **CUDOS / Cost Intelligence Dashboard(CID)**는 이 CUR을 QuickSight로 시각화하는 표준 오픈 템플릿이다.

> 🔍 **더 깊이**: **CUR 2.0**(2024)은 스키마를 재설계해 컬럼 구조를 더 안정적이고 BI 친화적으로 만들었다(기존 CUR은 사용 리소스에 따라 컬럼이 가변적이라 스키마 진화 처리가 까다로웠다). 또 CUR을 **Data Exports** 기능으로 통합해, **FOCUS**(FinOps Open Cost and Usage Specification) 표준 포맷으로도 내보낼 수 있게 됐다. FOCUS는 FinOps Foundation이 주도하는 업계 표준으로, 여러 클라우드(AWS·Azure·GCP·OCI)의 비용 데이터를 동일 스키마(BilledCost·EffectiveCost·ServiceCategory 등 공통 컬럼)로 정규화한다. 시험에서 "여러 클라우드 비용을 단일 스키마로 통합 분석"이 나오면 FOCUS 포맷 Data Export가 단서다.

> 📚 **사례**: 한 SaaS 기업은 Cost Explorer에서 "데이터 전송 비용이 전체의 25%"라는 것만 알고 원인을 못 찾아 몇 달을 헤맸다. CUR을 Athena로 쿼리해 UsageType별로 쪼개자 범인이 드러났다 — Cross-AZ DB replication 트래픽(`DataTransfer-Regional-Bytes`)이 데이터 전송의 70%였다. Cost Explorer는 "데이터 전송"으로 뭉쳐서 보여줘 진단이 불가능했고, CUR의 컬럼 단위 분석만이 원인을 특정했다(이후 read replica를 같은 AZ로 옮겨 비용을 크게 줄였다). 교훈: 비용 이상의 근본 원인 분석(root cause)은 CUR 레벨에서만 가능하다.

## Cost Allocation Tag·Categories — 멀티 계정 비용을 팀별로 쪼개기

멀티 계정·멀티 팀 환경에서 "이 비용은 누구 것인가"를 답하려면 **Cost Allocation Tag**가 필요하다. 리소스에 `Project`·`Env`·`CostCenter` 같은 태그를 붙이면, Billing 콘솔에서 그 태그를 **활성화**한 뒤부터 태그별로 비용이 분리돼 집계된다. 태그에는 사용자 정의 태그(user-defined)와 AWS 생성 태그(`aws:` 접두사, 예: `aws:createdBy`) 두 종류가 있다.

여기에 **Cost Categories**를 얹으면 태그·계정·서비스를 조합한 규칙으로 "팀 A = 계정 X + 태그 Y" 같은 논리적 비용 그룹을 만들 수 있다. 조직 구조와 청구 구조가 다를 때 이 매핑 계층이 필요하다.

> ⚠️ **함정**: Cost Allocation Tag는 **활성화한 시점 이후의 비용만** 분리한다. 과거 비용은 소급 분류되지 않는다. "태그를 붙였는데 지난달 비용이 태그별로 안 나뉜다"는 시나리오의 정답은 "활성화 전 비용이라 분리 불가"다. 그래서 태그 거버넌스는 리소스 생성 시점에 강제하는 게 best practice다 — **Tag Policy(Organizations)**로 허용 태그 키·값을 표준화하고, **SCP**로 필수 태그 없는 리소스 생성을 거부하며, **AWS Config 규칙(required-tags)**으로 사후 미준수를 탐지하는 3중 방어가 표준이다.

> 💡 **관련 이론**: 비용 할당의 근본 난제는 **공유 비용(shared cost)의 배분**이다. NAT Gateway·Transit Gateway·공유 ALB·데이터 전송처럼 여러 팀이 함께 쓰는 리소스는 단일 태그로 깔끔히 안 나뉜다. FinOps에서는 이를 **showback**(누가 얼마 썼는지 보여주기)과 **chargeback**(실제로 그 팀에 청구)으로 구분하며, 공유 비용은 사용량 비율·균등 분할 등 합의된 배분 키(allocation key)로 나눈다. Cost Categories의 **split charge rule**이 바로 이 공유 비용을 정의된 비율로 멤버 그룹에 재배분하는 기능이다. 시험에서 "공유 인프라 비용을 팀별로 배분"이 나오면 split charge가 단서다.

## Cost Anomaly Detection — ML 기반 이상 탐지

Budgets가 "사전에 정한 임계치"를 본다면, **Cost Anomaly Detection**은 ML로 **평소 패턴을 학습**해 비정상 지출을 자동 탐지한다. 임계치를 미리 알 수 없는 경우(새 서비스, 예측 불가 spike)에 유효하다. 서비스·계정·태그·SP 차원으로 모니터를 걸고 이메일·SNS로 알린다.

> 💡 **관련 이론**: Budgets와 Anomaly Detection은 **규칙 기반(threshold) vs 학습 기반(anomaly)** 탐지의 전형적 대비다. Budgets는 "월 $1000 초과"처럼 사람이 임계를 정의해야 하고(해석 쉽지만 임계 설정이 어렵고 정적), Anomaly Detection은 시계열 패턴을 학습해 "이번 주 이 서비스 비용이 통계적으로 비정상"을 자동 판단한다(임계 불필요하지만 학습 기간·해석 비용). 모니터링 이론의 **static threshold vs dynamic baseline** 그 자체다. 둘은 보완재다 — 알려진 한도는 Budgets로 강하게 막고, 모르는 이상은 Anomaly Detection으로 넓게 감시한다. Anomaly Detection은 탐지·알림만 하고 자동 차단은 못 한다는 점(통제는 Budgets Action 몫)이 자주 출제된다.

## 정리하며

비용 통제는 **가시성(Cost Explorer) → 임계 통제(Budgets) → 심층 분석(CUR) → 이상 탐지(Anomaly Detection)**의 4단계 워크플로이며, FinOps의 Inform→Optimize→Operate 사이클과 대응한다. 같은 청구 데이터를 Cost Explorer는 시각화로, CUR은 시간 단위 SQL로(메달리온 bronze), Budgets은 임계치로 본다. 자동 통제는 **Budgets Action(IAM/SCP/EC2 stop)**이, 팀별 분리는 **Cost Allocation Tag + Cost Categories(+split charge)**가, 알 수 없는 이상은 **Cost Anomaly Detection**이 담당한다. 멀티 클라우드 통합은 **FOCUS 포맷 Data Export**가 표준이다.

SAP 시험 단골 매핑: (1) "시간 단위·모든 항목·SQL 분석" → **CUR + Athena**, (2) "예산 초과 시 신규 EC2 생성 차단" → **Budgets Action(IAM/SCP Deny)**, (3) "향후 12개월 비용 예측" → **Cost Explorer Forecast**, (4) "약정 활용률·커버리지 진단" → **Cost Explorer Coverage/Utilization**, (5) "팀·부서별 비용 분리" → **Cost Allocation Tag + Cost Categories**, (6) "공유 인프라 비용 배분" → **Cost Categories split charge**, (7) "임계 모르는 비정상 지출 자동 탐지" → **Cost Anomaly Detection**, (8) "예산을 절대 못 넘게 예방" → **SCP/Service Quotas(예방형)**, (9) "여러 클라우드 비용 단일 스키마 통합" → **FOCUS Data Export**. 다음 day는 S3 비용·데이터 전송·NAT Gateway의 숨은 비용을 본다.

---

## 📝 연습 문제

**문제 1.** FinOps 팀이 시간 단위로 모든 청구 항목을 SQL로 쪼개 단가(UsageType) 수준의 심층 분석을 하려 한다. 가장 적합한 것은?

A) Cost Explorer

B) CUR을 S3로 출력 후 Athena로 쿼리

C) AWS Budgets

D) Trusted Advisor

**정답: B**
해설: CUR은 시간 단위로 약 200개 컬럼의 모든 청구 항목을 S3(보통 Parquet)에 출력하며, Athena로 임의 차원·임의 집계의 SQL 분석이 가능하다. lineItem/UsageType 컬럼으로 단가 수준 분석을 한다. A(Cost Explorer)는 일 단위 시각화로 컬럼 단위 심층 분석이 불가능하고 API 호출당 과금도 있다. C(Budgets)는 임계치 감시 도구다. D(Trusted Advisor)는 룰 기반 점검이다. 함정: "시간 단위 + 모든 항목 + SQL"은 항상 CUR이다.

---

**문제 2.** 개발 계정의 월 비용이 $5,000을 초과하면 그 계정에서 신규 EC2 인스턴스를 시작하지 못하도록 자동 차단하려 한다. 가장 적합한 것은?

A) CloudWatch Alarm으로 비용 감시 후 알림

B) Budgets(Cost Budget) + Budgets Action으로 IAM Deny 정책 자동 적용

C) Lambda를 매일 실행해 비용을 확인하고 차단

D) Cost Explorer Forecast 알림

**정답: B**
해설: Budgets Action은 비용 임계 초과 시 IAM Deny Policy나 SCP를 자동 적용해 신규 리소스 생성을 즉시 차단할 수 있다. A(CloudWatch Alarm)는 알림만 하고 IAM/SCP 자동 적용 메커니즘이 없다. C(Lambda 스케줄)는 사후 배치라 실시간 차단이 아니다. D(Forecast)는 예측 표시일 뿐 통제가 아니다. 함정: "비용 초과 시 자동 차단"은 Budgets Action이며 CloudWatch Alarm은 오답이다. (참고: 청구 데이터 갱신 지연 때문에 "절대 못 넘게"가 강조되면 예방형 SCP를 추가로 의심.)

---

**문제 3.** 팀이 모든 리소스에 `CostCenter` 태그를 붙였는데, 지난 3개월 비용이 태그별로 분리되어 보이지 않는다. 가장 가능성 높은 원인은?

A) 태그는 비용 분리에 사용할 수 없다

B) Cost Allocation Tag를 최근에야 활성화해, 활성화 이전 비용은 소급 분리되지 않는다

C) CUR이 비활성화되어 있다

D) Budgets가 없다

**정답: B**
해설: Cost Allocation Tag는 Billing 콘솔에서 활성화한 시점 이후의 비용만 태그별로 분리하며 과거 비용은 소급 분류되지 않는다. 따라서 활성화 전 3개월 비용은 태그별로 나뉘지 않는다. A는 틀림(태그는 비용 분리의 핵심 수단). C·D는 태그 분리와 직접 관련이 없다. 함정: "태그를 붙였는데 과거 비용이 안 나뉜다"는 활성화 시점 이후만 적용된다는 원리 때문이며, 예방책은 Tag Policy + SCP로 생성 시점에 태그를 강제하는 것이다.

---

**문제 4.** 특정 임계치를 미리 정하기 어려운 상황에서, 평소와 다른 비정상적인 비용 급증을 ML로 자동 탐지·알림받고 싶다. 가장 적합한 것은?

A) AWS Budgets

B) Cost Anomaly Detection

C) CloudWatch Alarm

D) Trusted Advisor

**정답: B**
해설: Cost Anomaly Detection은 ML로 과거 지출 패턴을 학습해 임계치를 미리 정하지 않아도 통계적으로 비정상인 지출을 자동 탐지·알림한다(static threshold가 아닌 dynamic baseline). A(Budgets)는 사람이 임계치를 정해야 한다. C(CloudWatch)는 비용 패턴 학습 기반 이상 탐지가 아니다. D(Trusted Advisor)는 룰 기반 점검이다. 함정: "임계 모름 + 자동 학습 탐지"는 Cost Anomaly Detection, "임계 알고 강제 차단"은 Budgets(Action)다. Anomaly Detection은 탐지만 하고 차단은 못 한다.

---

**문제 5.** 비용팀이 산 Savings Plans가 낭비되고 있는지(활용되지 않는지) 확인하려 한다. 어떤 리포트를 봐야 하나?

A) Cost Explorer의 SP Utilization 리포트

B) Cost Explorer의 SP Coverage 리포트

C) CUR의 lineItem 컬럼

D) Budgets Cost Budget

**정답: A**
해설: Utilization은 "산 약정 중 실제로 쓰인 비율"로, 낮으면 약정이 낭비되고 있다는 뜻이다. 따라서 "SP가 낭비되나"는 Utilization 리포트가 정답이다. B(Coverage)는 "전체 사용량 중 약정이 덮은 비율"로 "약정을 더 사야 하나"를 본다. C는 가능하나 전용 리포트가 더 직접적이다. D는 임계 감시다. 함정: 약정 낭비=Utilization, 추가 구매 여지=Coverage로 구분한다.

---

**문제 6.** Cost Explorer에서 "데이터 전송" 비용이 전체의 25%로 크지만 정확히 어떤 트래픽인지 분해되지 않아 원인을 못 찾고 있다. 근본 원인을 특정하려면?

A) Budgets로 데이터 전송 예산 설정

B) CUR을 Athena로 쿼리해 UsageType별로 분해

C) Trusted Advisor 실행

D) Cost Explorer 필터를 더 좁힘

**정답: B**
해설: Cost Explorer는 "데이터 전송"을 뭉뚱그려 보여줘 Cross-AZ·인터넷 egress·Cross-Region을 구분하지 못한다. CUR의 lineItem/UsageType 컬럼을 Athena로 쿼리하면 DataTransfer-Regional-Bytes(Cross-AZ), DataTransfer-Out-Bytes(egress) 등으로 분해해 정확한 원인을 특정할 수 있다. A는 통제이지 분석이 아니다. C는 룰 기반 점검이다. D는 Cost Explorer의 세밀도 한계상 컬럼 단위로 못 쪼갠다. 함정: 비용 근본 원인 분석은 CUR 레벨에서만 가능하다.

---

**문제 7.** 조직 구조(팀 A, 팀 B)와 AWS 계정·태그 구조가 일대일로 맞지 않는다. "팀 A = 계정 X + 태그 Project=alpha" 같은 규칙으로 비용을 논리적으로 그룹화하고, 공유 NAT Gateway 비용을 사용 비율대로 각 팀에 배분하려 한다. 가장 적합한 것은?

A) Cost Allocation Tag만으로 충분

B) Cost Categories로 계정·태그·서비스 조합 규칙을 정의하고 split charge rule로 공유 비용 배분

C) 계정을 다시 나눔

D) CUR을 수동 편집

**정답: B**
해설: Cost Categories는 계정·태그·서비스를 조합한 규칙으로 논리적 비용 그룹을 만들고, split charge rule로 공유 비용(NAT Gateway 등)을 정의된 비율로 멤버 그룹에 재배분한다. 조직 구조와 청구 구조가 다르고 공유 비용 배분이 필요할 때 이 매핑·배분 계층이 정확히 들어맞는다. A(태그만)는 단일 차원 분리만 되고 복합 규칙·공유 비용 배분이 어렵다. C는 과도하게 파괴적이다. D는 비현실적이고 원본 데이터를 수정하는 안티패턴이다. 함정: 복합 규칙 그룹화는 Cost Categories, 공유 비용 배분은 그 안의 split charge rule이다.
