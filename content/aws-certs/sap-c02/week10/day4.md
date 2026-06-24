# Day 4 - MLOps 심화: 드리프트의 과학, Feature Store, 재학습 자동화 파이프라인

머신러닝 모델을 프로덕션에 올린 팀이 6개월 뒤 가장 자주 겪는 사고는 "모델이 조용히 틀리기 시작했다"는 것이다. 코드는 한 줄도 안 바뀌었고, 인프라도 정상이고, 에러 로그도 깨끗하다. 그런데 추천 클릭률이 떨어지고, 사기 탐지가 새 패턴을 놓치기 시작한다. 원인은 코드가 아니라 **세상이 변했기 때문**이다 — 입력 데이터의 분포가 학습 때와 달라졌거나(data drift), 정답의 패턴 자체가 바뀌었다(concept drift). 전통적인 소프트웨어 운영(DevOps)은 이런 "조용한 성능 저하"를 다루는 도구가 없다. **MLOps**는 ML 시스템 특유의 이 문제 — 데이터 의존성, 드리프트, train-serve skew, 재학습 자동화 — 를 운영 규율로 푼다. SAP-C02 시험에서 MLOps는 "운영 후 품질을 어떻게 감시하나", "재학습을 어떻게 자동 트리거하나", "모델 승인·배포를 어떻게 거버넌스하나"라는 운영 아키텍처로 출제된다.

오늘은 MLOps 도구를 나열하는 대신, 드리프트가 왜 발생하고 어떻게 감지하는지, Feature Store가 어떤 구조적 문제를 푸는지, 그리고 완전 자동 재학습 파이프라인이 어떻게 구성되는지를 분해한다.

## MLOps가 DevOps와 다른 이유 — 코드 외에 데이터가 변한다

DevOps의 핵심 가정은 "코드가 변하지 않으면 동작이 변하지 않는다"는 결정성(determinism)이다. 그래서 CI/CD는 코드 변경을 테스트·배포하는 데 집중한다. ML은 이 가정이 깨진다. 모델의 동작은 코드뿐 아니라 **(1) 학습 데이터, (2) 운영 시점의 입력 데이터 분포**에도 의존한다. 코드가 고정돼도 데이터가 변하면 동작이 변한다. 그래서 MLOps는 DevOps에 더해 **데이터·모델 버전 관리, 드리프트 모니터링, 자동 재학습**이라는 차원을 추가한다.

ML 시스템에는 세 종류의 "버전"이 있다 — 코드, 데이터, 모델. 이 셋의 조합을 추적(lineage)하지 못하면 "어느 데이터로 학습한 어느 모델이 지금 운영 중인가"를 알 수 없어 디버깅이 불가능하다. SageMaker는 이를 Pipelines(워크플로우)·Model Registry(모델 버전)·Feature Store(데이터)·Lineage Tracking으로 묶는다.

> 💡 **관련 이론**: Data Drift와 Concept Drift는 명확히 다른 현상이다. **Data Drift(covariate shift)**는 입력 X의 분포가 변하는 것이다 — 예: 신규 사용자층이 유입돼 연령 분포가 바뀜. 입력이 학습 때 못 본 영역으로 가면 모델이 부정확해진다. **Concept Drift**는 입력 X와 정답 Y의 관계 P(Y|X) 자체가 변하는 것이다 — 예: 팬데믹으로 "마스크 구매"가 정상에서 이상으로, 다시 정상으로 의미가 바뀜. Data Drift는 입력만 봐도 감지되지만(라벨 불필요), Concept Drift는 실제 정답(라벨)이 와야 감지된다. 이 구분이 Model Monitor의 모니터 종류(Data Quality vs Model Quality)와 정확히 대응한다.

## Model Monitor — 4종의 감시와 무엇이 라벨을 필요로 하나

**Model Monitor**는 운영 중인 엔드포인트의 입출력을 캡처해 기준선(baseline, 학습 데이터 통계)과 비교한다. 네 종류가 있고, 핵심 구분은 "실제 정답(라벨)이 필요한가"다.

- **Data Quality**: 입력 피처의 분포·통계(평균·결측·범위)가 기준선에서 벗어났는지. **라벨 불필요** — 입력만 보면 됨. Data Drift 감지.
- **Model Quality**: 예측의 정확도·정밀도·재현율이 떨어졌는지. **라벨 필요** — 실제 정답이 와야 정확도를 계산. Concept Drift 감지.
- **Bias Drift**: 모델의 편향(특정 그룹에 불리한 예측)이 시간에 따라 커졌는지. Clarify 통합.
- **Feature Attribution Drift**: 각 피처가 예측에 기여하는 정도(SHAP 값)가 변했는지.

결과는 S3에 저장되고 CloudWatch Alarm으로 알림된다.

> 🔍 **더 깊이**: Model Quality 모니터링이 어려운 건 **라벨 지연(label latency)** 때문이다. 사기 탐지 모델이 "이 거래는 정상"이라고 예측해도, 그게 실제로 사기였는지는 며칠~몇 주 뒤 차지백(chargeback)이 와야 안다. 즉 정확도를 실시간으로 알 수 없다. 그래서 실무에서는 라벨이 빨리 오는 도메인은 Model Quality를, 라벨이 느린 도메인은 Data Quality(입력 분포 변화를 조기 경보로)를 주로 본다. 입력 분포가 크게 변했다면 정답을 몰라도 "모델이 위험하다"는 신호다. 시험에서 "라벨 없이 운영 중 모델 위험 조기 감지"는 Data Quality, "실제 정확도 하락 감지"는 Model Quality.

> 📚 **사례**: 즉석에서 든 전형적 패턴 — 한 이커머스 추천팀이 모델 정확도가 서서히 떨어지는 걸 몇 달간 눈치채지 못하다가 매출 하락으로 발견했다. 원인은 신규 마케팅 캠페인으로 유입된 사용자층의 행동 분포가 학습 데이터와 크게 달랐던 것(data drift)이다. Model Monitor Data Quality를 켜고 기준선 대비 입력 분포 이탈을 CloudWatch Alarm으로 연결했더니, 이후 분포가 임계치를 넘으면 즉시 경보가 떴고, 이를 EventBridge로 재학습 파이프라인에 연결해 자동 재학습되게 했다. 교훈: 드리프트는 "터지고 나서"가 아니라 "입력이 변할 때" 감지해야 한다. 라벨을 기다리면 이미 늦다.

## Feature Store — Train-Serve Skew라는 구조적 함정

ML 사고 중 가장 잡기 어려운 게 **train-serve skew**다. 학습 때 피처를 계산한 코드와 추론 때 계산하는 코드가 미묘하게 다르면, 모델은 "학습 때 본 것과 다른 입력"을 받아 조용히 틀린다. 예: 학습 때는 "최근 7일 평균 구매액"을 배치로 계산했는데, 추론 때는 실시간 코드가 시간대 처리를 다르게 해 값이 어긋난다. 에러도 안 나고 로그도 깨끗한데 정확도만 떨어진다.

**Feature Store**는 이를 구조적으로 막는다. 피처를 한 번 정의·계산해 중앙에 저장하고, 학습과 추론이 **같은 저장소에서 같은 피처**를 읽게 한다.

| 저장소 | 기반 | 특징 | 용도 |
|--------|------|------|------|
| **Online Store** | DynamoDB | 저지연(밀리초) 단건 조회 | 실시간 추론 |
| **Offline Store** | S3 + Glue 카탈로그 | 대량·과거 이력 | 학습·배치·분석 |

둘은 자동 동기화된다. 피처 그룹은 **Record Identifier**(예: customer_id)와 **Event Time**으로 정의해 시점별 피처 값(point-in-time)을 추적한다.

> 💡 **관련 이론**: Feature Store의 Online/Offline 분리는 Day 42에서 본 OLTP vs OLAP 분리와 같은 패턴이다. 추론은 "특정 고객 한 명의 피처를 밀리초에 조회"(OLTP 패턴 → DynamoDB)하고, 학습은 "수백만 행의 과거 피처를 대량 스캔"(OLAP 패턴 → S3)한다. 한 저장소로 둘 다 잘하긴 어려우니 분리하고 동기화한다. Point-in-time correctness(학습 시 "그 시점에 알 수 있었던 피처 값"만 쓰는 것)는 미래 정보가 학습에 새는 **data leakage**를 막는 핵심이다 — Event Time 기반 조회가 이를 보장한다. 시험에서 "학습·추론 피처 불일치 방지"는 항상 Feature Store.

## Model Registry — 모델 거버넌스와 승인 워크플로우

프로덕션에 어떤 모델을 올릴지는 함부로 결정하면 안 된다. **Model Registry**는 모델 버전을 **Model Package Group**으로 관리하고, 각 버전에 승인 상태(PendingManualApproval / Approved / Rejected)를 부여한다. 자동 파이프라인이 모델을 학습·평가해 레지스트리에 등록하면(Pending), 사람이 검토 후 승인하고, 승인 이벤트가 EventBridge를 통해 자동 배포를 트리거한다. 이로써 "자동화의 효율"과 "사람의 거버넌스"를 결합한다.

> 🔍 **더 깊이**: Model Registry의 승인 게이트는 규제 산업(금융·의료)에서 특히 중요하다. 모델이 신용 평가나 진단에 쓰이면, "어느 데이터로 학습했고, 어떤 검증을 통과했으며, 누가 언제 승인했는가"를 감사(audit)할 수 있어야 한다. Model Registry는 이 lineage와 승인 이력을 보존한다. 또 Approved 상태를 EventBridge 규칙으로 잡아 Lambda 배포를 트리거하면, "수동 승인 후 자동 배포"라는 하이브리드 워크플로우가 된다 — 완전 자동도, 완전 수동도 아닌 거버넌스된 자동화다. 시험에서 "모델 배포 전 사람 검토 + 승인 시 자동 배포"는 Model Registry + EventBridge.

## 완전 자동 MLOps 파이프라인 — 재학습 루프의 완성

이 모든 조각을 엮으면 자가 치유(self-healing) ML 시스템이 된다.

```
[CodeCommit/Git] → [CodePipeline] → [SageMaker Pipeline (DAG)]
       │
       ├─▶ [Processing: 피처 엔지니어링] (Feature Store 적재)
       ├─▶ [Training: Spot 학습 + Checkpoint]
       ├─▶ [Evaluation: 메트릭 계산]
       │         │
       │    [Condition Step] Accuracy > 0.9?
       │         │ yes
       ├─▶ [Model Registry: 등록(Pending)]
       │         │
       │    [Manual Approval] (거버넌스 게이트)
       │         │ Approved
       ├─▶ [EventBridge Rule → Lambda → Endpoint 배포]
       │
       └─▶ [Model Monitor: 드리프트 감시]
                 │ drift 임계 초과
                 └─▶ [EventBridge → Pipeline 재실행] ← 루프 닫힘
```

**SageMaker Pipelines**가 DAG로 이 전체를 오케스트레이션하고, 각 스텝의 입출력·실행을 Lineage로 자동 추적하며, 변경되지 않은 스텝은 캐싱으로 건너뛴다. Model Monitor가 드리프트를 감지하면 EventBridge가 파이프라인을 재실행해 루프가 닫힌다.

> 🎯 **시나리오**: "프로덕션 모델의 정확도가 시간이 지나며 떨어지는 것을 자동 감지하고, 임계치를 넘으면 사람의 개입 없이 재학습 파이프라인을 자동 실행하되, 새 모델은 배포 전 데이터 과학자의 승인을 거쳐야 한다. 전체 아키텍처는?" — 답은 **Model Monitor(드리프트 감지) → CloudWatch Alarm/EventBridge(트리거) → SageMaker Pipelines(재학습 DAG) → Model Registry(Pending 등록) → 수동 승인 → EventBridge(Approved 이벤트) → Lambda(Endpoint 배포)**. 핵심: 드리프트 감지·재학습은 자동(EventBridge), 배포는 거버넌스(Model Registry 승인 게이트). "자동 트리거 + 사람 승인"의 하이브리드가 정답. 함정: 재학습 자동화는 EventBridge+Pipelines, 배포 거버넌스는 Model Registry 승인.

> ⚠️ **함정**: "ML 파이프라인을 DAG로 만들라"는 문제에서 Step Functions, MWAA(Airflow), Glue Workflow도 DAG 오케스트레이터라 답처럼 보인다. 하지만 **ML 전용 기능(실험 추적, 모델 lineage, 학습/튜닝/평가 스텝, Model Registry 연동, 스텝 캐싱)**이 필요하면 SageMaker Pipelines가 정답이다. Step Functions는 범용 워크플로우(ML 외 작업 혼합)에, MWAA는 복잡한 스케줄링·기존 Airflow DAG 마이그레이션에 적합하다. 시험에서 "ML 워크플로우 + Lineage/실험 추적"이면 SageMaker Pipelines.

## CI/CD for ML — SageMaker Projects

전통 CI/CD 도구(CodePipeline·CodeBuild·CodeCommit)를 ML에 그대로 쓸 수 있지만, **SageMaker Projects**는 MLOps용 CI/CD 템플릿을 제공한다. 모델 빌드(학습→평가→등록) 파이프라인과 모델 배포(승인→스테이징→프로덕션) 파이프라인을 미리 구성된 형태로 제공해, 처음부터 파이프라인을 짜는 부담을 줄인다. GitHub Actions·Jenkins 대신 또는 함께 쓸 수 있다.

## 정리하며

MLOps는 "코드 외에 데이터와 모델이 변한다"는 ML 특유의 문제를 운영 규율로 푼다. 드리프트(Data/Concept)를 Model Monitor로 감지하고(라벨 필요 여부로 Data Quality vs Model Quality 구분), Feature Store로 train-serve skew를 구조적으로 막으며, Model Registry로 모델 버전·승인을 거버넌스하고, SageMaker Pipelines로 전체를 DAG로 오케스트레이션해 EventBridge로 재학습 루프를 닫는다.

SAP 시험 단골 매핑: (1) "학습·추론 피처 불일치" → Feature Store, (2) "라벨 없이 드리프트 조기 감지" → Model Monitor Data Quality, (3) "운영 정확도 하락 감지" → Model Monitor Model Quality, (4) "수동 승인 후 자동 배포" → Model Registry + EventBridge, (5) "ML 워크플로우 DAG + Lineage" → SageMaker Pipelines, (6) "편향 시간 변화" → Model Monitor + Clarify Bias Drift, (7) "MLOps CI/CD 템플릿" → SageMaker Projects. 다음 day는 Week 10 전체를 시나리오 문제로 종합 복습한다.

---

## 📝 연습 문제

**문제 1.** 학습 때 배치로 계산한 피처와 실시간 추론 때 계산한 피처가 미묘하게 달라 모델이 조용히 부정확해지는 train-serve skew를 구조적으로 방지하려 한다. 가장 적합한 것은?

A) S3에 피처를 저장해 양쪽이 읽게 함
B) SageMaker Feature Store(Online/Offline)
C) 학습·추론 코드를 같은 Lambda로 통합
D) 추론 결과를 DynamoDB에 캐싱

**정답: B**
해설: Feature Store는 피처를 한 번 정의·계산해 중앙 저장하고, 학습(Offline/S3)과 추론(Online/DynamoDB)이 동일하게 정의된 피처를 자동 동기화된 저장소에서 읽게 해 train-serve skew를 구조적으로 막는다. Event Time 기반 point-in-time 조회로 data leakage도 방지한다. A(S3 공유)·C·D는 피처 정의·버전·동기화를 직접 관리해야 해 skew 위험이 남는다. 함정: "학습·추론 피처 일관성"은 Feature Store.

---

**문제 2.** 사기 탐지 모델은 실제 정답(차지백)이 며칠 뒤에야 온다. 라벨을 기다리지 않고 운영 중 모델의 위험을 조기에 감지하려 한다. 어떤 모니터링인가?

A) Model Monitor Model Quality
B) Model Monitor Data Quality
C) Clarify Bias Drift
D) CloudWatch Custom Metric만

**정답: B**
해설: Data Quality 모니터링은 입력 피처의 분포·통계가 학습 기준선에서 벗어났는지를 보며 라벨이 필요 없다. 라벨 지연이 큰 도메인에서 입력 분포 변화(data drift)를 조기 경보로 활용한다. A(Model Quality)는 실제 정확도를 계산하므로 라벨이 필요해 며칠을 기다려야 한다. C(Bias Drift)는 편향 변화용. D는 ML 기준선 비교·드리프트 감지 자동화가 없다. 함정: "라벨 없이 조기 감지"는 Data Quality, "실제 정확도 하락"은 Model Quality.

---

**문제 3.** 자동 학습된 새 모델을 프로덕션에 올리기 전 데이터 과학자가 반드시 검토·승인해야 하고, 승인되면 사람 개입 없이 엔드포인트에 자동 배포되어야 한다. 어떤 구성인가?

A) CodePipeline Manual Approval만
B) Model Registry 승인 상태 + EventBridge(Approved) → Lambda 배포
C) Lambda 게이트로 직접 구현
D) Jenkins 빌드 승인

**정답: B**
해설: Model Registry는 모델 버전에 승인 상태(Pending/Approved/Rejected)를 부여해 사람 검토 게이트를 만들고, Approved 이벤트를 EventBridge로 잡아 Lambda 배포를 자동 트리거한다. "사람 승인 + 승인 후 자동 배포"의 하이브리드 거버넌스가 ML 모델 배포의 표준이다. A는 일반 파이프라인 승인이지 모델 버전·lineage 거버넌스가 아니다. C·D는 직접 구현 부담. 함정: "모델 검토 승인 + 승인 시 자동 배포"는 Model Registry + EventBridge.

---

**문제 4.** 모델 운영 중 실제 예측 정확도가 시간이 지나며 떨어지는 것(concept drift)을 자동 감지하려 한다. 실제 라벨은 확보 가능하다. 어떤 모니터링인가?

A) Model Monitor Data Quality
B) Model Monitor Model Quality
C) Feature Attribution Drift
D) Trusted Advisor

**정답: B**
해설: Model Quality 모니터링은 실제 정답(라벨)과 예측을 비교해 정확도·정밀도·재현율의 하락을 감지하며, 이것이 concept drift(입력-정답 관계 변화) 감지에 해당한다. 라벨이 확보 가능하다는 조건이 Model Quality를 가능하게 한다. A(Data Quality)는 입력 분포만 보고 실제 정확도는 모른다. C는 피처 기여도 변화, D는 ML 모니터가 아니다. 함정: "실제 정확도 하락 + 라벨 있음"은 Model Quality.

---

**문제 5.** 모델의 예측이 특정 인구 집단에 불리해지는 편향(bias)이 시간 경과에 따라 커지는지 감지해야 한다. 어떤 조합인가?

A) Model Monitor + Clarify Bias Drift
B) DataBrew
C) Comprehend
D) GuardDuty

**정답: A**
해설: Model Monitor의 Bias Drift는 SageMaker Clarify와 통합되어 모델 예측의 편향 지표가 기준선 대비 시간에 따라 변하는지를 감지한다. B(DataBrew)는 데이터 준비 도구, C(Comprehend)는 NLP, D(GuardDuty)는 위협 탐지로 모델 편향과 무관. 함정: "편향 시간 변화 감지"는 Model Monitor + Clarify Bias Drift.

---

**문제 6.** 전처리·학습·튜닝·평가·등록·배포로 이어지는 ML 워크플로우를 DAG로 표현하고, 각 스텝의 입출력 lineage와 실험을 자동 추적하며, 변경 없는 스텝은 캐싱하려 한다. 가장 적합한 것은?

A) AWS Step Functions
B) SageMaker Pipelines
C) Amazon MWAA(Airflow)
D) Glue Workflow

**정답: B**
해설: SageMaker Pipelines는 ML 전용 DAG 오케스트레이터로 학습/튜닝/평가/등록 스텝, Model Registry 연동, Lineage 자동 추적, 스텝 캐싱을 기본 제공한다. A(Step Functions)는 범용 워크플로우(ML 외 작업 혼합)에, C(MWAA)는 복잡 스케줄링·기존 Airflow 마이그레이션에, D(Glue Workflow)는 ETL에 적합하지만 ML lineage·실험 추적이 없다. 함정: "ML 워크플로우 + Lineage/실험/캐싱"은 SageMaker Pipelines.

---

**문제 7.** 운영 중 모델의 입력 분포가 임계치를 넘게 변하면 사람 개입 없이 재학습 파이프라인을 자동 실행하고 싶다. 어떤 연결인가?

A) CloudWatch Alarm → 수동 재학습
B) Model Monitor 드리프트 → EventBridge → SageMaker Pipeline 재실행
C) Lambda 크론으로 매일 무조건 재학습
D) Config 규칙 → SNS

**정답: B**
해설: Model Monitor가 드리프트를 감지하면 CloudWatch/EventBridge로 이벤트를 발생시키고, EventBridge 규칙이 SageMaker Pipeline 재실행을 트리거해 재학습 루프를 자동으로 닫는다. A는 수동이라 자동화가 아니다. C(무조건 매일 재학습)는 드리프트와 무관하게 비용·자원 낭비. D는 구성 규정 준수용으로 ML 재학습과 무관. 함정: "드리프트 감지 → 자동 재학습"은 Model Monitor + EventBridge + Pipelines.

---

## 📌 오늘의 요약

1. **MLOps ≠ DevOps** — 코드 외에 데이터·모델이 변한다. 코드/데이터/모델 3종 버전과 lineage 추적이 핵심
2. **Data Drift vs Concept Drift** — 입력 분포 변화(라벨 불필요) vs 입력-정답 관계 변화(라벨 필요)
3. **Model Monitor 4종** — Data Quality(라벨X·조기경보), Model Quality(라벨O·정확도), Bias Drift, Feature Attribution Drift
4. **Feature Store** — Online(DDB 저지연 추론)/Offline(S3 학습·분석) 자동 동기. train-serve skew·data leakage 방지
5. **Model Registry** — 모델 버전·승인 게이트(Pending/Approved/Rejected). Approved → EventBridge → 자동 배포
6. **SageMaker Pipelines** — ML 전용 DAG, Lineage·실험·캐싱. Step Functions/MWAA는 범용
7. **재학습 루프** — Model Monitor 드리프트 → EventBridge → Pipeline 재실행. SageMaker Projects = MLOps CI/CD 템플릿
