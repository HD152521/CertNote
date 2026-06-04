# Day 3 - Cost Explorer와 Budgets, 청구서를 읽고 통제하는 법

클라우드 비용은 월말에 도착하는 한 줄짜리 숫자가 아니다. 그 숫자 뒤에는 수백 개 서비스, 수십 개 리전, 수천 개 리소스, 시간 단위 사용량이 뒤엉켜 있다. "이번 달 왜 $50,000이 나왔나?"라는 질문에 답하려면 이 덩어리를 분해(slice & dice)할 수 있어야 한다 — 어느 서비스가, 어느 계정이, 어느 프로젝트가, 어떤 사용 유형이 비용을 끌어올렸는지. **Cost Explorer**는 이 분해를, **Budgets**는 분해 결과에 한도와 자동 차단을 거는 일을, **Cost Allocation Tag**는 애초에 비용을 팀·프로젝트별로 가를 수 있게 만드는 기반을 담당한다.

이 셋의 뒤에는 **FinOps**라는 운영 철학이 있다. 전통적으로 인프라 비용은 재무팀이 사후에 정산하는 영역이었지만, 클라우드는 개발자가 `terraform apply` 한 번으로 비용을 발생시킨다 — 비용 결정권이 엔지니어에게 넘어온 것이다. FinOps는 이 현실을 받아들여 "엔지니어가 자기가 만드는 비용을 실시간으로 보고 책임진다"는 문화를 만든다. Cost Explorer·Budgets·Tag는 그 문화를 떠받치는 도구다. 이 글은 이들의 내부 — 비용 데이터가 어떻게 차원화되는지, 태그 활성화가 왜 소급되지 않는지, Budgets Action이 어떻게 비용을 강제로 막는지 — 를 파고든다.

## 비용 데이터는 다차원 큐브다 — OLAP의 발상이 청구서에 들어온 이유

Cost Explorer에서 "Group by Service", "Filter: Region = ap-northeast-2", "Group by Tag: Project"를 클릭할 때, 당신은 사실 **다차원 데이터 분석(OLAP)**을 하고 있다. AWS의 청구 데이터는 본질적으로 여러 차원(dimension)을 가진 사실(fact)들의 집합이다 — 각 비용 항목은 "언제, 어느 서비스, 어느 리전, 어느 계정, 어떤 사용 유형, 어떤 태그"라는 좌표를 갖고, 그 좌표 위에 "비용"과 "사용량"이라는 측정값(measure)이 놓인다.

이 구조를 **OLAP 큐브(cube)**라 부른다. 데이터 웨어하우스에서 매출을 "지역×시간×제품"으로 쪼개보듯, Cost Explorer는 비용을 이 차원들로 자유롭게 쪼개고(slice), 돌리고(dice), 파고든다(drill-down). "비용 spike의 원인 찾기"가 사실 OLAP의 drill-down 그 자체다.

```
비용 spike 발견 → 차원을 좁혀가며 원인 추적 (drill-down)

Group by Service        → 어떤 서비스? (예: EC2-DataTransfer가 급증)
   ↓ EC2로 좁힘
Group by Linked Account → 어느 계정에서?
   ↓ prod 계정으로 좁힘
Group by Tag: Project   → 어느 프로젝트?
   ↓ payment 프로젝트로 좁힘
Group by Usage Type     → 무슨 사용? (전송? 저장? 컴퓨팅?)
   → "DataTransfer-Out-Bytes" — 외부로 나가는 전송이 범인
```

Cost Explorer는 최대 **13개월의 과거 데이터**와 **12개월의 ML 기반 forecast**를 제공한다. 기본 분석은 무료지만, **시간별(hourly) 단위**와 리소스 단위 데이터는 별도 활성화하면 유료다(UsageRecord당 과금). 분 단위는 없다 — 비용 분석의 최소 해상도는 시간이다.

> 💡 **관련 이론**: OLAP(Online Analytical Processing)는 1990년대 데이터 웨어하우징에서 정립된 개념으로, 트랜잭션 처리에 최적화된 OLTP와 대비된다. OLTP는 "이 주문 한 건을 빠르게 기록"하는 데 맞춰져 있고, OLAP는 "지난 3년 매출을 지역·제품별로 집계"하는 분석 쿼리에 맞춰져 있다. Cost Explorer가 미리 정의된 차원으로 빠른 집계를 보여줄 수 있는 건 AWS가 청구 데이터를 OLAP 친화적으로 사전 집계(pre-aggregation)해두기 때문이다. 반대로 임의의 차원·임의의 SQL이 필요하면 사전 집계로는 부족해, 다음에 나올 CUR(원시 데이터 + Athena)로 가야 한다. "미리 정의된 빠른 집계 vs 임의의 느린 원시 쿼리"의 트레이드오프가 Cost Explorer와 CUR을 가르는 본질이다.

## Cost Allocation Tag — 태그를 켜야 비용이 보이고, 소급은 안 되는 이유

"프로젝트별로 비용을 보고 싶다"는 가장 흔한 FinOps 요구다. 그런데 리소스에 `Project: payment` 태그를 다는 것만으로는 부족하다. **Cost Allocation Tag로 그 태그 키를 명시적으로 활성화**해야 청구 데이터에 차원으로 들어온다. 이걸 모르면 "태그는 다 달았는데 Cost Explorer에서 Group by Tag에 안 보인다"는 함정에 빠진다.

왜 모든 태그가 자동으로 청구 차원이 되지 않을까? 계정에는 운영용·자동화용·보안용 등 수많은 태그가 붙는데, 이걸 전부 청구 데이터에 차원으로 만들면 큐브가 폭발적으로 커지고 대부분은 비용 분석과 무관하다. 그래서 AWS는 "어떤 태그를 비용 차원으로 쓸지"를 사용자가 명시적으로 고르게 한다.

가장 중요한 함정은 **활성화가 소급되지 않는다**는 것이다. 태그 키를 활성화하면 그 시점 **이후**의 비용 데이터에만 그 차원이 채워진다. 활성화 전에 발생한 과거 비용은 그 태그로 그룹화할 수 없다. 그래서 원칙은 "태그 표준을 정했으면 가능한 한 빨리 활성화"다 — 늦게 켜면 그만큼 과거 데이터에 구멍이 난다. 활성화 후 청구서에 반영되기까지도 보통 24~48시간이 걸린다.

| 종류 | 예시 | 비고 |
|------|------|------|
| **AWS-generated** | `aws:createdBy`, `aws:cloudformation:stack-name` | AWS가 자동 부여, 접두사 `aws:` |
| **User-defined** | `Project`, `Environment`, `Owner`, `CostCenter` | 사용자가 정의, 명시 활성화 필요 |

> ⚠️ **함정**: Cost Allocation Tag 활성화가 소급 안 된다는 점 외에, **태그가 누락된 리소스**도 문제다. 태그를 안 단 리소스의 비용은 "untagged"로 뭉뚱그려져 어느 프로젝트에도 귀속되지 않는다. 이 "태그 미부착 비용"이 크면 비용 분배의 정확도가 무너진다. 그래서 성숙한 조직은 Organizations의 **Tag Policy**로 태그 표준을 조직 전체에 강제하고, 필수 태그 없는 리소스 생성을 SCP나 Config Rule로 막는다. 시험에서 "프로젝트별 비용 추적 시작"이 나오면 핵심은 ① 태그 부여 ② Cost Allocation Tag 활성화 ③ 24~48시간 대기 ④ 가능하면 Tag Policy로 강제다.

## AWS Budgets — 한도를 정하고, 넘으면 실제로 막는 법

Cost Explorer가 "사후에 비용을 본다"면 Budgets는 "사전에 한도를 정하고 임박·초과 시 행동한다." 네 가지 예산 유형이 있다 — Cost Budget(비용 한도), Usage Budget(사용량 한도, 예: GB·시간), Reservation Budget(RI 활용도), Savings Plans Budget(SP 활용도). 가장 흔한 건 Cost Budget이다.

Budgets의 진짜 힘은 알림이 아니라 **Budgets Action**, 즉 임계 도달 시 **자동으로 비용을 막는** 기능이다. 알림은 사람이 봐야 행동하지만, Action은 사람 없이 강제 차단한다.

| Budget Action | 동작 | 효과 |
|---------------|------|------|
| **IAM 정책 적용** | 특정 사용자·그룹·역할에 Deny 정책 부착 | 새 리소스 생성 권한 박탈 |
| **SCP 적용** | OU에 서비스 제어 정책 부착 | 계정 전체 특정 액션 차단 |
| **EC2/RDS 중지** | 대상 인스턴스 자동 stop | 즉각적 비용 발생 중단 |

여기서 또 하나의 핵심 구분이 있다 — **ACTUAL vs FORECASTED 임계**다. ACTUAL은 "실제 비용이 임계를 넘었을 때" 발동하므로 이미 돈을 쓴 뒤다. FORECASTED는 Cost Explorer의 예측 모델을 써 "이 추세면 월말에 임계를 넘을 것 같을 때" 미리 발동한다 — 사후 대응이 아닌 사전 대응이다. 운영에선 보통 둘을 함께 건다: 80% FORECASTED에서 알림, 100% ACTUAL에서 차단 Action.

> 🔍 **더 깊이**: Budgets Action에서 SCP 자동 적용은 강력하지만 **무딘 칼**이다. SCP는 OU(조직 단위) 전체에 적용되므로, "예산 초과 시 EC2 생성 차단 SCP"를 걸면 그 OU의 **모든 계정·모든 사용자**가 영향을 받는다 — 긴급한 운영 작업까지 막힐 수 있다. 그래서 Budgets Action에는 **승인 모델(approval model)**이 있다. `AUTOMATIC`은 임계 도달 시 즉시 액션을 실행하고, `MANUAL`은 액션을 대기시키고 사람이 콘솔에서 승인해야 실행한다. 비가역적이거나 광범위한 액션(SCP)은 MANUAL로, 안전하고 국소적인 액션은 AUTOMATIC으로 두는 것이 정석이다. 자동화의 편의와 오작동 위험 사이의 균형을 승인 모델로 조절하는 셈이다.

> 📚 **사례**: 클라우드 비용 사고의 단골은 "잊힌 리소스"와 "폭주하는 스크립트"다. 실수로 무한 루프 도는 Lambda가 NAT Gateway를 통해 외부 API를 초당 수천 번 호출하거나, 종료를 까먹은 GPU 인스턴스(시간당 수십 달러)가 주말 내내 돌거나, 잘못 설정된 S3 라이프사이클로 Glacier 복원이 폭주하는 식이다. 개인 개발자가 학습용 계정에 수천 달러 청구서를 받는 사례가 커뮤니티에 끊이지 않는다. 이런 사고의 공통 교훈은 "비용은 조용히, 빠르게, 사람 없이 쌓인다"는 것이고, 그래서 방어도 사람 없이 작동해야 한다 — Budgets Action(자동 차단)과 Cost Anomaly Detection(자동 탐지)이 그 자동 방어선이다. 신규 계정에 가장 먼저 거는 안전장치가 Free Tier 알림과 낮은 금액의 Budget이다.

## CUR — 청구의 마지막 진실, 그리고 Cost Explorer와의 경계

Cost Explorer가 보여주는 건 사전 집계된 요약이다. "단일 리소스가 시간 단위로 정확히 얼마를 썼나"처럼 가장 세밀한 진실이 필요하면 **CUR(Cost and Usage Report)**로 가야 한다. CUR은 AWS가 제공하는 **가장 상세한 청구 데이터** — 시간 단위, 리소스 단위, 모든 차원이 포함된 원시 행(row)들의 집합이다. 이걸 S3에 Parquet로 떨어뜨리고 Athena·QuickSight로 임의 SQL 분석을 한다.

| 항목 | Cost Explorer | CUR |
|------|---------------|-----|
| 형태 | 콘솔 GUI, 사전 정의 차원 | S3의 원시 데이터 (Parquet) |
| 분석 | 미리 정의된 group/filter | 임의 SQL (Athena) |
| 해상도 | 일/시간(유료) | 시간·리소스 단위 |
| 비용 | 무료(시간별은 유료) | 저장료만 |
| 용도 | 일상 분석, 빠른 답 | 심층 분석, 사내 비용 도구·쇼백 |

경계를 가르는 질문은 "콘솔의 미리 정의된 차원으로 충분한가?"이다. 충분하면 Cost Explorer(빠르고 무료), 임의의 복잡한 조인·커스텀 집계(예: "팀별 사용자당 비용을 환율 적용해 사내 청구서로")가 필요하면 CUR + Athena다. 멀티 계정 환경에서 사내 마진을 얹어 부서·고객에게 청구해야 하면 **Billing Conductor**까지 간다 — SI·MSP가 고객별 커스텀 청구를 만들 때 쓰는 도구다.

> 💡 **관련 이론**: CUR을 Parquet 컬럼형(columnar) 포맷으로 저장하는 건 분석 성능의 핵심이다. 청구 데이터는 행(row)이 수억 개에 달할 수 있는데, "전체 EC2 비용 합계" 같은 분석 쿼리는 보통 몇 개 컬럼(서비스, 비용)만 읽으면 된다. 행 기반 저장(CSV)이라면 모든 행의 모든 컬럼을 읽어야 하지만, Parquet 같은 컬럼형은 필요한 컬럼만 디스크에서 읽어 IO를 수십 배 줄인다. 게다가 같은 컬럼의 값은 비슷해 압축률도 높다. Athena가 S3의 CUR을 빠르고 싸게 스캔할 수 있는 게(스캔한 데이터량당 과금이므로) 이 컬럼형 저장 덕이다. OLAP 분석에 컬럼형 포맷이 표준이 된 것과 정확히 같은 이유다.

## Forecast의 함정 — ML 예측은 이력이 있어야 작동한다

Cost Explorer와 Budgets의 FORECASTED 임계 모두 **비용 예측(forecast)**에 의존한다. 이 예측은 과거 비용 패턴을 학습한 ML 모델이 미래를 외삽(extrapolate)하는 것이다. 여기에 명백한 한계가 있다 — **충분한 이력이 없으면 예측이 부정확하다.**

갓 만든 계정이나 막 시작한 워크로드는 학습할 과거 패턴이 없어 forecast가 크게 빗나간다. 보통 신뢰할 만한 예측에는 최소 몇 개월(흔히 3개월 이상)의 안정적 이력이 필요하다. 또한 과거에 없던 급격한 변화(신규 대형 워크로드 투입, 프로모션)는 예측 모델이 예견하지 못한다 — forecast는 "과거가 이어진다면"을 가정하기 때문이다.

> ⚠️ **함정**: 신규 워크로드에 FORECASTED 임계로만 Budget을 걸면 예측이 부정확해 오작동(잘못된 차단 또는 놓친 경보)할 수 있다. 이력이 얕을 땐 ACTUAL 임계(실제 비용 기준)를 함께 걸어 안전망을 둬야 한다. 또한 Cost Explorer의 forecast 라인을 "확정된 미래"로 읽으면 안 된다 — 신뢰 구간이 있는 통계적 추정일 뿐이다. 시험에서 "신규 서비스의 비용 예측이 부정확하다"가 나오면 원인은 "이력 데이터 부족"이고, 충분한 이력이 쌓일 때까지는 실측 기반 모니터링을 병행하는 것이 답이다.

## 정리하며

비용 운영은 분해(Cost Explorer)·통제(Budgets)·분배(Tag)의 삼각형이다. 그 밑에 FinOps라는 문화가 있다 — 비용을 발생시키는 엔지니어가 그 비용을 실시간으로 보고 책임진다는 것이다.

운영자가 기억할 다섯 가지는 이렇다. ① Cost Explorer는 비용을 OLAP 큐브로 다루는 도구 — 서비스·계정·태그·사용 유형 차원으로 drill-down해 spike 원인을 추적한다. 13개월 과거 + 12개월 forecast. ② Cost Allocation Tag는 명시 활성화해야 청구 차원이 되고, 활성화는 소급되지 않으므로 가능한 한 빨리 켜야 한다. ③ Budgets의 핵심은 Budgets Action(IAM/SCP/Stop으로 자동 차단)이고, ACTUAL은 사후·FORECASTED는 사전 발동이다. 광범위한 SCP 액션은 MANUAL 승인으로. ④ 가장 세밀한 진실은 CUR(시간·리소스 단위 원시 데이터) + Athena이고, Cost Explorer는 빠른 요약이다. ⑤ Forecast는 충분한 이력이 있어야 정확하다 — 신규 워크로드엔 ACTUAL 안전망을 병행한다.

다음 글에선 비용을 분석·통제하는 데서 나아가, 약정 할인(Savings Plans·Reserved Instances)과 Spot으로 컴퓨팅 비용을 실제로 70% 이상 깎는 전략과 그 내부를 다룬다.

---

## 📝 연습 문제

**문제 1.** 회사가 `Project` 태그를 모든 리소스에 달았는데도 Cost Explorer의 Group by Tag에 `Project`가 나타나지 않는다. 원인과 해결은?

A) Cost Explorer는 태그 그룹화를 지원하지 않는다

B) 태그를 다는 것만으로는 부족하고, Cost Allocation Tag로 해당 태그 키를 명시적으로 활성화해야 청구 차원이 된다(활성화 후 24~48시간 반영)

C) IAM 권한이 부족하다

D) 태그 값에 한글이 들어가서다

**정답: B**

해설: 리소스에 태그를 다는 것과 그 태그를 비용 차원으로 쓰는 것은 별개다. 모든 태그를 자동으로 청구 차원에 넣으면 데이터가 폭발하므로, AWS는 Cost Allocation Tag로 사용자가 비용 분석에 쓸 태그 키를 명시적으로 활성화하게 한다. 활성화 후 청구서 반영까지 보통 24~48시간이 걸리고, 더 중요한 건 활성화가 소급되지 않아 활성화 이후 데이터에만 차원이 채워진다는 점이다. 그래서 태그 표준을 정했으면 최대한 빨리 활성화해야 한다.

---

**문제 2.** 월 비용이 갑자기 평소의 3배로 튀었다. Cost Explorer로 원인을 체계적으로 찾는 가장 좋은 접근은?

A) CUR을 Athena로 전수 조사

B) 차원을 좁혀가며 drill-down — Group by Service로 서비스 식별 → Linked Account → Tag(Project) → Usage Type 순으로 범위를 좁힌다

C) 모든 인스턴스를 종료한다

D) Budgets를 생성한다

**정답: B**

해설: Cost Explorer는 비용을 다차원 OLAP 큐브로 다루므로, spike 원인 추적은 drill-down 그 자체다. 먼저 Group by Service로 어떤 서비스가 급증했는지 보고, 그 서비스로 좁힌 뒤 Linked Account(어느 계정), Tag(어느 프로젝트), Usage Type(전송/저장/컴퓨팅 중 무엇)으로 차원을 차례로 좁혀가면 범인을 정확히 짚을 수 있다. 예를 들어 EC2-DataTransfer의 Out-Bytes가 급증했다면 외부 전송이 원인이다. CUR 전수 조사(A)는 더 무거운 심층 분석용이다.

---

**문제 3.** 회사가 월 예산 $10,000 도달 시 자동으로 새 EC2 생성을 막고 싶다(사람 개입 없이). 어떤 도구·기능인가?

A) Cost Explorer

B) AWS Budgets + Budgets Action(IAM Deny 정책 부착 또는 SCP 적용)

C) Cost Anomaly Detection

D) Trusted Advisor

**정답: B**

해설: 비용을 자동으로 "막는" 것은 Budgets Action만 할 수 있다. 임계 도달 시 특정 사용자·역할에 Deny 정책을 부착하거나(IAM Action), OU에 SCP를 적용하거나, EC2/RDS를 자동 중지한다. Cost Explorer(A)는 분석만, Cost Anomaly Detection(C)은 탐지·알림만 하지 차단은 못 한다. 단 SCP는 OU 전체에 영향을 주는 무딘 칼이라, 광범위한 액션은 MANUAL 승인 모델로 두는 것이 안전하다.

---

**문제 4.** 단일 EC2 인스턴스가 시간 단위로 정확히 얼마를 썼는지, 그리고 회사 자체 기준으로 사용자당 비용을 환산하는 커스텀 SQL 분석이 필요하다. 어떤 데이터 소스인가?

A) Cost Explorer 콘솔

B) Cost and Usage Report(CUR) + S3 + Athena — 시간·리소스 단위 원시 데이터에 임의 SQL

C) Budgets

D) Trusted Advisor Cost

**정답: B**

해설: Cost Explorer는 사전 정의된 차원의 빠른 요약이라 "리소스 단위 시간별 원시 데이터에 임의의 복잡한 조인·커스텀 집계"는 못 한다. 가장 상세한 진실은 CUR이다 — 시간·리소스 단위의 모든 행을 S3에 Parquet로 저장하고 Athena로 임의 SQL을 돌린다. 컬럼형 Parquet 덕에 필요한 컬럼만 스캔해 빠르고 저렴하다. 사내 비용 도구·쇼백·환율 적용 같은 커스텀 분석은 CUR의 영역이다.

---

**문제 5.** 갓 만든 신규 계정에서 새 워크로드를 시작했는데, Cost Explorer의 비용 forecast와 Budgets의 FORECASTED 임계가 자꾸 빗나간다. 원인과 보완책은?

A) Cost Explorer 버그 — 재시작

B) 예측 ML 모델이 학습할 과거 이력이 부족해서다 — 이력이 쌓일 때까지 ACTUAL(실측) 임계를 함께 걸어 안전망을 둔다

C) 리전이 잘못됐다

D) IAM 권한 문제

**정답: B**

해설: 비용 forecast는 과거 패턴을 학습한 ML 모델의 외삽이라, 신규 계정·신규 워크로드처럼 학습할 이력이 없으면 크게 빗나간다(보통 신뢰할 예측엔 수개월 이력 필요). 또 과거에 없던 급변은 예측이 예견하지 못한다. 따라서 이력이 얕을 땐 FORECASTED만 믿지 말고 ACTUAL 임계를 병행해 실측 기반 안전망을 둬야 한다. forecast 라인은 확정 미래가 아니라 신뢰 구간이 있는 통계적 추정이다.

---

**문제 6.** 회사가 예산 초과 시 SCP로 OU 전체의 EC2 생성을 차단하는 Budgets Action을 만들려 한다. 가장 신중히 고려할 설정은?

A) 임계값을 0%로 설정

B) 승인 모델(approval model) — SCP는 OU 전체에 영향을 주는 광범위한 액션이므로 MANUAL로 두어 사람이 승인 후 실행하게 한다

C) 알림 이메일 주소

D) 예산 이름

**정답: B**

해설: SCP 자동 적용은 강력하지만 OU의 모든 계정·모든 사용자에게 영향을 주는 무딘 칼이라, 긴급한 운영 작업까지 막을 수 있다. Budgets Action의 승인 모델에서 `AUTOMATIC`은 즉시 실행, `MANUAL`은 사람이 콘솔에서 승인해야 실행한다. 비가역적이거나 광범위한 액션(SCP)은 MANUAL로 두어 오작동 위험을 줄이고, 안전하고 국소적인 액션만 AUTOMATIC으로 두는 것이 정석이다.

---

## 📌 오늘의 요약

1. Cost Explorer는 비용을 OLAP 큐브로 다뤄 서비스·계정·태그·사용 유형 차원으로 drill-down — 13개월 과거 + 12개월 forecast, 시간별은 유료
2. Cost Allocation Tag는 명시 활성화해야 청구 차원이 되고 소급되지 않음 — 가능한 한 빨리 켜고 Tag Policy로 강제
3. Budgets의 핵심은 Budgets Action(IAM/SCP/Stop 자동 차단) — ACTUAL은 사후·FORECASTED는 사전, 광범위 SCP는 MANUAL 승인
4. 가장 세밀한 진실은 CUR(시간·리소스 단위 원시 데이터, Parquet) + Athena, Cost Explorer는 빠른 요약
5. Forecast는 충분한 이력이 있어야 정확 — 신규 워크로드엔 ACTUAL 안전망 병행
