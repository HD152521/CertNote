# Day 49 - 비용 거버넌스는 왜 "측정·책임·자동화" 세 단계로 나뉘나

지금까지 컴퓨팅(Day 1)·스토리지(Day 2)·네트워크(Day 3)에서 개별 비용을 줄이는 방법을 봤다. 그런데 조직이 커지면 더 근본적인 문제가 생긴다 — **누가, 무엇에, 얼마를 쓰는지 아무도 모른다.** 엔지니어 수백 명이 각자 리소스를 띄우는 환경에서, 어느 날 청구서가 두 배가 되면 그 원인을 추적하는 데만 며칠이 걸린다. 비용 거버넌스는 이 혼돈을 다스리는 운영 체계이고, 그 핵심은 **측정 없이는 관리할 수 없다(you can't manage what you can't measure)**는 경영학의 오래된 격언이다. 비용을 보이게 만들고(가시화), 누가 책임지는지 정하고(책임), 한도를 넘으면 자동으로 막는(자동화) 세 단계가 AWS 거버넌스 도구의 뼈대다.

이 세 단계가 모인 운영 방법론이 **FinOps**다. 2018년 무렵 클라우드 비용 폭증을 겪은 기업들이 "비용은 인프라팀만의 일이 아니라 리소스를 만드는 엔지니어 모두의 책임"이라는 문화 전환을 공유하며 FinOps Foundation을 만들었다. FinOps의 표준 라이프사이클은 Inform(측정·가시화) → Optimize(최적화) → Operate(운영·자동화)의 반복인데, AWS의 Cost Explorer·Budgets·CUR·Cost Allocation Tags·Anomaly Detection은 정확히 이 라이프사이클을 구현하는 도구들이다. 이 글은 도구를 나열하는 대신, "Cost Explorer와 CUR이 왜 따로 있는지", "Budgets Actions가 어떻게 비용을 강제로 막는지", "태그 기반 비용 분리가 왜 조직 설계 문제인지"를 따라가며 SAA 비용 도메인의 거버넌스 축을 짚는다.

## Cost Explorer와 CUR은 왜 둘 다 필요한가

비용 데이터를 보는 도구가 둘 있다는 게 처음엔 헷갈린다. **Cost Explorer**와 **CUR(Cost and Usage Report)**는 같은 청구 데이터를 다루지만 목적이 정반대다.

**Cost Explorer**는 **대화형 시각화 콘솔**이다. 서비스별·리전별·계정별·태그별로 비용을 그래프로 즉시 보고, 향후 12개월을 **예측(forecast)**하고, ML 기반 **이상 탐지**까지 한 화면에서 한다. 미리 집계된 데이터를 빠르게 탐색하는 데 최적화돼 있어 "지난달 EC2 비용이 왜 늘었지?"를 몇 번의 클릭으로 답한다. 대신 집계 단위가 정해져 있어 "특정 리소스 ID의 시간 단위 원가"처럼 극도로 세밀한 분석은 못 한다.

**CUR**은 **가장 세분화된 원본 청구 데이터를 S3로 내보내는** 기능이다. 시간 단위·리소스 단위까지 모든 사용 라인을 CSV/Parquet로 S3에 떨어뜨리고, 이걸 **Athena·Redshift·QuickSight**로 직접 쿼리·분석한다. Cost Explorer가 답하지 못하는 임의의 복잡한 질문("특정 태그 조합 + 특정 Usage Type + 특정 시간대의 비용을 Savings Plan 적용 전후로 비교")을 SQL로 자유롭게 푼다. 대신 직접 분석 파이프라인을 구축해야 하는 부담이 있다.

> 💡 **관련 이론**: 이 분리는 데이터 분석의 **OLAP vs raw data warehouse** 구분과 같다. Cost Explorer는 사전 집계된 다차원 큐브를 빠르게 슬라이스·다이스하는 OLAP 도구에 가깝고, CUR은 모든 사실(fact) 행을 보존한 raw 데이터로 임의 쿼리를 허용하는 데이터 웨어하우스 소스에 가깝다. CloudWatch에서 봤던 "메트릭(사전 집계, 빠름, 거친 입도) vs 로그(raw, 느림, 세밀)"의 긴장과 정확히 같은 구조다 — 빠른 탐색과 무한한 세밀함을 동시에 한 도구로 줄 수 없어 둘로 나뉜 것이다.

> ⚠️ **함정**: "세분화된 청구 데이터를 Athena로 분석하라"는 시나리오의 정답은 항상 **CUR → S3 → Athena**다. Cost Explorer를 Athena로 쿼리한다거나 Cost Explorer에서 리소스 단위 SQL을 돌린다는 보기는 오답이다. 반대로 "비용을 빠르게 그래프로 보고 예측"이면 Cost Explorer다. 두 도구의 역할(빠른 시각화 vs 세밀 원본 분석)을 거꾸로 매핑하지 않는 게 핵심이다.

## Budgets와 Budgets Actions: 측정에서 강제로

가시화는 사후적이다 — 비용이 이미 발생한 뒤에 본다. **AWS Budgets**는 여기서 한 걸음 나아가 **사전에 한도를 정하고 임계 도달 시 알림·행동**을 건다. 비용(Cost) 예산뿐 아니라 사용량(Usage), RI/SP의 적용률(Coverage)·활용률(Utilization)까지 예산으로 설정해, "이번 달 비용이 1000달러를 넘으면" 또는 "구매한 Savings Plan의 활용률이 80% 밑으로 떨어지면" 알린다. 알림은 SNS·이메일·Chatbot(Slack)으로 간다.

진짜 강력한 건 **Budgets Actions**다. 단순 알림을 넘어, 예산 임계(예: 100%)에 도달하면 **자동으로 행동을 취한다** — 특정 IAM 정책을 사용자/그룹에 attach해 비싼 리소스 생성을 차단하거나, SCP를 적용하거나, EC2/RDS 인스턴스를 중지한다. 즉 "비용이 예산을 넘으면 사람이 깨어나 손쓰기를 기다리는" 대신, 시스템이 자동으로 지출을 멈춘다. 개발·실험 계정에서 폭주를 막는 안전장치로 특히 유용하다.

> 📚 **사례**: 클라우드에서 가장 무서운 사고 중 하나가 **"빌 쇼크(bill shock)"**다 — 잘못된 설정이나 실수, 또는 노출된 자격증명을 악용한 공격자가 비싼 리소스(대형 GPU 인스턴스, 무한 Lambda 재귀 호출 등)를 대량으로 띄워 하룻밤에 수만 달러가 청구되는 사례다. 개인 개발자가 S3 버킷을 잘못 공개했다가 대량 다운로드 트래픽으로 수천 달러를 청구받거나, 노출된 AWS 키로 공격자가 암호화폐 채굴 인스턴스를 띄운 사고가 반복적으로 보고됐다. Budgets Actions는 이런 폭주에 대한 자동 차단막이고, 여기에 Anomaly Detection·Service Quotas·CloudTrail 모니터링을 결합하는 게 표준 방어다.

> 🔍 **더 깊이**: Budgets와 별개로 **AWS Cost Anomaly Detection**은 ML로 평소 지출 패턴을 학습해 "갑작스러운 비정상 증가"를 자동 감지한다. Budgets가 "고정 한도(1000달러)를 넘으면" 같은 **임계값 기반**이라면, Anomaly Detection은 "평소 대비 통계적으로 이상한가"를 보는 **패턴 기반**이다. CloudWatch의 고정 임계 Alarm vs Anomaly Detection 관계와 똑같다 — 트래픽·비용이 시기마다 크게 변하면 고정 임계값은 무용지물이라 ML 기반 이상 탐지가 필요하다. 둘은 보완적이며, 보통 Anomaly Detection으로 "예상 못 한 급증"을, Budgets로 "정해둔 한도 초과"를 동시에 잡는다.

## 태그 기반 비용 분리는 왜 조직 설계 문제인가

"마케팅팀이 이번 달 얼마 썼나?"에 답하려면, 모든 리소스에 **누구의 것인지** 표시가 있어야 한다. **Cost Allocation Tags**가 이 역할을 한다 — 리소스에 `Project`, `Environment`, `Owner`, `CostCenter` 같은 태그를 달고, 관리 계정에서 이 태그를 **활성화**하면, 그 시점 이후의 비용이 태그 값별로 그룹화되어 Cost Explorer·CUR·청구서에 나타난다.

여기서 중요한 함정이 있다. **태그 활성화는 소급되지 않는다** — 활성화한 시점부터의 비용만 태그별로 집계되고, 과거 비용은 분류되지 않는다. 그래서 태그 전략은 리소스를 만들기 전에 정해야 하고, 누락된 리소스는 비용 추적에서 새어나간다. 이 때문에 태그를 강제하는 거버넌스(예: 태그 없는 리소스 생성을 SCP·Config Rule로 차단)가 FinOps의 기반이 된다.

> 💡 **관련 이론**: 태그 기반 비용 분리는 회계의 **원가 배분(cost allocation)**과 **쇼백/차지백(showback/chargeback)** 모델을 클라우드에 옮긴 것이다. **Showback**은 각 부서에 "당신들이 이만큼 썼다"고 보여만 주는 것(가시화·책임 환기)이고, **Chargeback**은 실제로 그 부서 예산에서 청구하는 것이다. Showback은 행동 변화를 부드럽게 유도하고 chargeback은 강한 비용 책임을 강제한다. 태그가 정확해야 둘 다 가능하므로, 태그 설계는 단순 기술이 아니라 "조직을 어떻게 비용 단위로 쪼갤 것인가"라는 조직 설계 결정이다.

**Cost Categories**는 태그보다 한 단계 위의 추상화다. 여러 태그·계정·서비스를 회사가 정의한 비즈니스 카테고리(예: "프로덕트 A", "공유 인프라", "보안")로 자동 분류하는 규칙 엔진이다. 태그가 누락되거나 일관되지 않은 현실에서, Cost Categories로 "계정 X와 태그 Y는 프로덕트 A로 친다" 같은 규칙을 걸어 사후적으로 비용을 비즈니스 단위로 재조직한다.

## 멀티 계정 거버넌스: Consolidated Billing의 경제학

Organizations 환경에서 여러 계정을 쓰면 **Consolidated Billing**(통합 결제)이 비용에 직접 영향을 준다. 모든 멤버 계정의 사용량이 관리 계정에서 합산되는데, 이게 단순 편의를 넘어 실제 할인을 만든다.

첫째, **볼륨 디스카운트 합산**이다. S3 전송이나 데이터 처리처럼 사용량이 많을수록 단가가 내려가는 계층형 요금에서, 여러 계정의 사용량을 합치면 더 높은 할인 구간에 빨리 도달한다. 둘째, **Savings Plans·RI 공유**다. 한 계정에서 산 Compute SP나 RI가 다른 계정의 사용량에도 자동 적용된다 — 계정 A가 약정을 다 못 쓰면 남는 할인이 계정 B로 흘러가 약정 낭비를 줄인다. 셋째, **SCP로 비용 가드레일**을 친다 — Organizations의 Service Control Policy로 "특정 OU에서는 비싼 GPU 인스턴스나 특정 리전을 못 쓰게" 막아 폭주를 사전 차단한다.

> 🔍 **더 깊이**: **Billing Conductor**는 통합 결제 위에 "사용자 정의 청구"를 올리는 도구다. 리셀러(MSP)가 고객에게 마진을 붙여 청구하거나, 대기업이 내부 부서에 공유 인프라 비용을 특정 규칙으로 배분할 때 쓴다. 실제 AWS 청구와 별개로 "보여주는 청구서(pro forma)"를 만들어, 내부 차지백을 회사의 회계 규칙에 맞게 조정한다. SAA에서 깊이 묻진 않지만 "멀티 계정 환경에서 부서·고객별 커스텀 청구"라는 키워드가 보이면 Billing Conductor가 신호다.

## 운영 추천 도구의 협업

비용 거버넌스의 마지막 조각은 **무엇을 줄일지 추천받는 것**이다. 세 도구가 보완 관계로 협업한다.

| 도구 | 방식 | 무엇을 찾나 |
|------|------|------------|
| **Trusted Advisor** | 규칙 기반 임계값 | 유휴 EIP, 미연결 EBS, 저활용 EC2 등 명백한 낭비 |
| **Compute Optimizer** | ML 기반 분석 | EC2·EBS·Lambda·ASG·ECS의 최적 타입·크기 right-sizing |
| **S3 Storage Lens** | 스토리지 전용 대시보드 | 클래스 분포, 미완료 멀티파트, S3 비용 최적화 권장 |

이 협업의 핵심은 "거친 청소 → 정밀 조정 → 도메인 특화"의 순서다. Trusted Advisor로 명백한 쓰레기(미연결 볼륨)를 치우고, Compute Optimizer로 남은 것의 크기를 ML로 정밀 조정하고, Storage Lens로 S3라는 특정 도메인을 깊게 판다. 어느 하나가 다른 것을 대체하지 않는다.

> ⚠️ **함정**: 시험은 이 세 도구의 역할을 자주 섞어 묻는다. "ML 기반 EC2 right-sizing"이면 Compute Optimizer, "사용 안 하는 리소스·서비스 한도·보안까지 폭넓은 점검"이면 Trusted Advisor, "S3 스토리지 클래스 분포·비용 가시화"면 Storage Lens다. Compute Optimizer가 비용 가시화 도구가 아니고, Trusted Advisor가 ML right-sizing 도구가 아니라는 경계를 정확히 잡아야 한다.

## CLI로 직접 만져보기

```bash
# 월 1000 USD 비용 예산 생성
aws budgets create-budget --account-id 111122223333 --budget '{
  "BudgetName":"monthly-1000",
  "BudgetLimit":{"Amount":"1000","Unit":"USD"},
  "TimeUnit":"MONTHLY","BudgetType":"COST"}'

# Cost Anomaly Detection 모니터 (서비스 차원 ML 이상 탐지)
aws ce create-anomaly-monitor --anomaly-monitor '{
  "MonitorName":"by-service","MonitorType":"DIMENSIONAL",
  "MonitorDimension":"SERVICE"}'

# Cost Allocation Tags 활성화 (활성 시점 이후 비용만 분류됨)
aws ce update-cost-allocation-tags-status --cost-allocation-tags-status '[
  {"TagKey":"Project","Status":"Active"},
  {"TagKey":"CostCenter","Status":"Active"},
  {"TagKey":"Env","Status":"Active"}]'

# Cost Explorer로 서비스별 지난달 비용 조회
aws ce get-cost-and-usage \
  --time-period Start=2026-05-01,End=2026-06-01 \
  --granularity MONTHLY --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE

# CUR 리포트 생성 (세분화 데이터를 S3로, Athena 통합)
aws cur put-report-definition --report-definition '{
  "ReportName":"detailed-cur","TimeUnit":"HOURLY",
  "Format":"Parquet","Compression":"Parquet",
  "AdditionalSchemaElements":["RESOURCES"],
  "S3Bucket":"my-cur-bucket","S3Prefix":"cur/","S3Region":"ap-northeast-2",
  "AdditionalArtifacts":["ATHENA"],"RefreshClosedReports":true,
  "ReportVersioning":"OVERWRITE_REPORT"}'
```

## 정리하며

비용 거버넌스는 측정·책임·자동화 세 단계로 FinOps 라이프사이클을 구현한다. ① **Cost Explorer**(빠른 시각화·예측·이상 탐지)와 **CUR**(세분화 원본을 S3로 내보내 Athena 분석)는 OLAP vs raw warehouse처럼 역할이 갈린다 — "Athena 세밀 분석"이면 CUR, "빠른 그래프·예측"이면 Cost Explorer. ② **Budgets**는 사전 한도와 임계 알림을, **Budgets Actions**는 임계 도달 시 IAM·SCP·인스턴스 중지로 강제 차단을 제공하고, **Anomaly Detection**은 ML로 비정상 급증을 패턴 기반으로 잡는다(빌 쇼크 방어). ③ **Cost Allocation Tags**는 비용을 부서·프로젝트로 분리하되 활성화 시점부터 소급 없이 집계되므로 사전 태그 전략과 강제가 필요하고, 이는 showback/chargeback이라는 조직 설계 결정이다. ④ **Consolidated Billing**은 볼륨 할인 합산·SP/RI 공유·SCP 가드레일로 멀티 계정 경제성을 만든다. ⑤ Trusted Advisor·Compute Optimizer·Storage Lens는 거친 청소→정밀 조정→도메인 특화로 협업한다.

다음 글에서는 한 주 동안 본 컴퓨팅·스토리지·네트워크·거버넌스 네 축을 종합해, 실제 SAA 시험에 나오는 비용 시나리오를 키워드로 빠르게 매핑하는 통합 복습을 한다.

---

## 📝 연습 문제

**문제 1.** 한 재무팀이 시간 단위·리소스 단위까지 세분화된 청구 데이터를 SQL로 자유롭게 분석해 복잡한 커스텀 리포트를 만들고 싶다. 가장 적합한 접근은?

A) Cost Explorer에서 그래프를 캡처해 분석
B) CUR을 S3로 내보내 Athena로 쿼리
C) Trusted Advisor 리포트 다운로드
D) Budgets에서 데이터 추출

**정답: B**

해설: CUR(Cost and Usage Report)은 가장 세분화된 청구 데이터를 시간·리소스 단위로 S3에 내보내고, Athena·Redshift·QuickSight로 임의의 복잡한 SQL 분석을 가능하게 한다. Cost Explorer(A)는 빠른 시각화·예측에 강하지만 리소스 단위 자유 SQL은 못 한다. Trusted Advisor(C)는 점검 권장 도구이고, Budgets(D)는 예산·알림 도구로 세밀 분석용이 아니다. "Athena로 세분화 분석"이면 반사적으로 CUR이다.

---

**문제 2.** 한 개발 계정에서 실험 중 실수로 비싼 리소스가 폭주할 위험이 있다. 비용이 예산 100%에 도달하면 사람의 개입 없이 자동으로 추가 리소스 생성을 차단하려면?

A) Cost Explorer 알림 설정
B) AWS Budgets + Budgets Actions로 IAM 정책 자동 attach
C) CloudWatch Alarm + SNS
D) Trusted Advisor 알림

**정답: B**

해설: Budgets Actions는 예산 임계 도달 시 자동으로 행동을 취한다 — 제한적 IAM 정책을 attach해 비싼 리소스 생성을 차단하거나 인스턴스를 중지한다. 사람의 개입을 기다리지 않는 자동 차단막이다. Cost Explorer(A)는 가시화만, CloudWatch Alarm+SNS(C)는 알림만 보낼 뿐 자동 차단을 못 하며, Trusted Advisor(D)는 권장 도구로 실시간 강제 차단 기능이 없다.

---

**문제 3.** 한 조직이 부서별 클라우드 비용을 분리해 보고하려고 모든 리소스에 `CostCenter` 태그를 달았는데, Cost Explorer에서 여전히 태그별 분류가 안 보인다. 원인은?

A) 태그는 자동으로 비용 분류에 반영된다
B) 관리 계정에서 Cost Allocation Tags로 해당 태그를 활성화하지 않았다
C) 태그는 EC2에만 적용된다
D) Cost Explorer는 태그를 지원하지 않는다

**정답: B**

해설: 리소스에 태그를 다는 것만으로는 부족하고, 관리(결제) 계정에서 해당 태그를 Cost Allocation Tag로 명시적으로 활성화해야 비용이 태그 값별로 그룹화된다. 또 활성화는 소급되지 않아 활성 시점 이후 비용만 분류된다. A는 틀렸고(자동 반영 아님), C도 틀렸으며(다양한 리소스 지원), D도 틀렸다(Cost Explorer는 활성화된 태그로 그룹화 지원).

---

**문제 4.** 한 회사의 클라우드 비용이 시기마다 크게 변동해 고정 예산 임계값으로는 비정상 급증을 잡기 어렵다. 평소 패턴 대비 이상한 지출을 ML로 자동 감지하려면?

A) AWS Budgets 고정 임계값
B) AWS Cost Anomaly Detection
C) Trusted Advisor
D) Service Quotas

**정답: B**

해설: Cost Anomaly Detection은 ML로 평소 지출 패턴을 학습해 "통계적으로 비정상적인 증가"를 패턴 기반으로 감지하므로, 비용이 시기마다 변동해 고정 임계값이 무용한 환경에 적합하다. Budgets 고정 임계값(A)은 변동이 큰 비용에선 거짓 경보나 누락이 많다. Trusted Advisor(C)는 비용 이상 탐지 ML 도구가 아니고, Service Quotas(D)는 한도 관리로 비용 급증 탐지와 무관하다. CloudWatch의 고정 Alarm vs Anomaly Detection과 같은 관계다.

---

**문제 5.** 한 기업이 여러 AWS 계정을 Organizations로 운영한다. 계정 A에서 구매한 Compute Savings Plan을 계정 B의 EC2 사용에도 자동 적용하고 볼륨 할인을 합산받으려면?

A) 각 계정이 개별 결제를 유지한다
B) Consolidated Billing(통합 결제)을 사용한다
C) 계정마다 별도 SP를 구매한다
D) PrivateLink로 계정을 연결한다

**정답: B**

해설: Organizations의 Consolidated Billing은 모든 멤버 계정 사용량을 관리 계정에서 합산해, 한 계정에서 산 SP·RI가 다른 계정 사용에도 자동 적용되고(약정 낭비 감소) 볼륨 할인도 합산 구간으로 빨리 도달한다. A는 이 공유·합산 이점을 잃고, C는 각 계정이 약정을 다 못 쓰면 낭비가 생기며, D는 네트워크 연결 도구로 결제와 무관하다.

---

**문제 6.** 한 팀이 EC2 인스턴스들이 과대 프로비저닝됐는지 ML로 분석해 최적 크기를 추천받고, 동시에 미연결 EBS 볼륨 같은 명백한 낭비도 식별하려 한다. 가장 적절한 도구 조합은?

A) Compute Optimizer(ML right-sizing) + Trusted Advisor(유휴·미연결 리소스)
B) Cost Explorer 단독
C) Macie + Inspector
D) Budgets + SNS

**정답: A**

해설: Compute Optimizer는 ML로 인스턴스별 최적 타입·크기를 추천하고, Trusted Advisor는 규칙 기반으로 미연결 EBS·유휴 EIP·저활용 EC2 같은 명백한 낭비를 식별한다 — 둘은 "정밀 조정 + 거친 청소"로 보완 관계다. Cost Explorer(B)는 가시화 도구로 right-sizing을 못 하고, Macie/Inspector(C)는 보안 도구이며, Budgets(D)는 예산 관리로 right-sizing·낭비 식별과 무관하다.

---

**문제 7.** MSP(매니지드 서비스 제공자)가 여러 고객 계정에 마진을 붙여 커스텀 청구서를 발행하려 한다. 실제 AWS 청구와 별개로 사용자 정의 청구 규칙을 적용하려면?

A) Cost Explorer
B) AWS Billing Conductor
C) Cost Allocation Tags
D) CUR

**정답: B**

해설: Billing Conductor는 통합 결제 위에 사용자 정의 청구를 올려, 리셀러가 고객에게 마진을 붙이거나 내부 부서에 커스텀 규칙으로 비용을 배분하는 pro forma 청구서를 만든다. Cost Explorer(A)는 시각화, Cost Allocation Tags(C)는 비용 그룹화, CUR(D)은 세분화 데이터 내보내기로, 모두 "커스텀 청구서 발행" 기능은 아니다. "멀티 계정 커스텀/리셀러 청구"가 신호다.

---

## 📌 핵심 요약

비용 거버넌스는 측정·책임·자동화로 FinOps를 구현한다. Cost Explorer(빠른 시각화·예측·이상탐지)와 CUR(S3로 세분화 원본 내보내 Athena 분석)은 OLAP vs raw warehouse처럼 역할이 갈린다. Budgets는 사전 한도·알림을, Budgets Actions는 임계 도달 시 IAM·인스턴스 중지로 강제 차단을, Anomaly Detection은 ML 패턴 기반 급증 탐지를 제공한다(빌 쇼크 방어). Cost Allocation Tags는 부서·프로젝트 비용 분리를 가능케 하나 소급되지 않아 사전 전략·강제가 필요한 조직 설계 문제다. Consolidated Billing은 볼륨 할인 합산·SP/RI 공유·SCP 가드레일을 만들고, Trusted Advisor·Compute Optimizer·Storage Lens는 보완 협업한다.
