# Day 2 - 편향·설명가능성 드리프트: Clarify로 운영 중 감시

Day 1에서 데이터 품질·모델 품질 드리프트를 봤다. 오늘은 Model Monitor의 나머지 두 모니터인 **편향 드리프트(Bias Drift)**와 **피처 기여도 드리프트(Feature Attribution Drift)**를 다룬다. 이 둘은 **SageMaker Clarify**가 담당한다. Clarify는 학습 전 데이터 편향, 학습 후 모델 편향, 그리고 예측 설명(explainability)을 계산하는 서비스인데, 그 능력을 **운영 중인 엔드포인트의 지속 감시**로 확장한 것이 오늘의 주제다.

왜 편향과 설명을 운영 중에도 봐야 할까? 학습 시점에 공정했던 모델도, 들어오는 데이터 분포가 바뀌면 특정 그룹에 불리해질 수 있다. 또 모델이 의존하는 피처의 중요도가 시간이 지나며 달라지면, 그것 자체가 모델 행동이 변했다는 경고 신호다. MLA-C01은 "책임 있는 AI(responsible AI)"와 모니터링을 엮어 이 부분을 묻는다.

## Clarify의 두 얼굴: 편향과 설명가능성

Clarify가 하는 일은 크게 둘이다.

| 기능 | 무엇을 측정 | 운영 모니터 |
|------|------------|------------|
| 편향(Bias) 탐지 | 민감 그룹 간 결과 차이(예: 성별·연령) | Bias Drift Monitor |
| 설명가능성(Explainability) | 각 피처가 예측에 기여한 정도(SHAP) | Feature Attribution Drift Monitor |

설명가능성은 **SHAP(SHapley Additive exPlanations)** 값으로 계산한다. SHAP는 게임 이론에서 나온 개념으로, 각 피처가 예측값을 베이스라인에서 얼마나 밀어올리거나 끌어내렸는지를 공정하게 분배해 수치화한다.

> 💡 **관련 이론**: 편향 지표 중 시험에 자주 나오는 것은 사전(pre-training) 단계의 **CI(Class Imbalance, 클래스 불균형)**, **DPL(Difference in Positive Proportions in Labels)**과 사후(post-training) 단계의 **DPPL(예측에서의 양성 비율 차이)**, **DI(Disparate Impact)** 등이다. 핵심은 "학습 전 데이터 편향"과 "학습 후 모델 예측 편향"을 분리해서 본다는 점이다. Bias Drift Monitor는 사후 편향 지표가 운영 중 베이스라인 대비 얼마나 벌어지는지를 추적한다.

## 피처 기여도 드리프트 — 라벨 없이 모델 행동 변화 감지

피처 기여도(Feature Attribution) 드리프트는 **각 피처의 중요도 순위·크기가 베이스라인과 얼마나 달라졌는가**를 본다. 결정적 장점은 **정답 레이블이 필요 없다는 것**이다. 모델이 어떤 피처에 의존하는지는 입력과 예측만으로 SHAP로 계산할 수 있기 때문이다.

예를 들어 신용 평가 모델이 학습 시에는 "소득"을 가장 중요하게 봤는데, 운영 중 갑자기 "우편번호"의 기여도가 치솟았다면, 정답을 모르더라도 "모델 행동이 바뀌었다"는 강력한 경고다.

```python
from sagemaker.model_monitor import ModelExplainabilityMonitor
from sagemaker.clarify import SHAPConfig, ModelConfig, ExplainabilityAnalysisConfig

explainability_monitor = ModelExplainabilityMonitor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
)
shap_config = SHAPConfig(
    baseline="s3://my-bucket/shap-baseline.csv",
    num_samples=100,
    agg_method="mean_abs",     # 피처별 절대 SHAP 평균으로 중요도 집계
)
explainability_monitor.suggest_baseline(
    data_config=...,           # 입력 데이터 구성
    model_config=ModelConfig(model_name="my-model", instance_type="ml.m5.xlarge",
                             instance_count=1),
    explainability_config=shap_config,
)
```

> 🔍 **더 깊이**: 피처 기여도 드리프트의 강점은 "조기 경보"에 있다. 모델 품질 모니터는 ground truth가 모일 때까지(며칠~몇 주) 기다려야 성능 저하를 확인할 수 있다. 반면 피처 기여도는 정답 없이 즉시 계산되므로, 성능이 실제로 떨어지기 전에 "모델이 다른 피처에 의존하기 시작했다"는 선행 신호를 준다. 라벨 수집이 느린 도메인에서 특히 가치 있다.

## 편향 드리프트 모니터 — 공정성을 지속 감시

편향 드리프트 모니터는 운영 데이터에서 사후 편향 지표(예: DPPL, DI)를 주기적으로 재계산해, 학습 시점 베이스라인 대비 편향이 커졌는지 추적한다. 민감 속성(facet)과 양성 결과를 지정해야 한다.

```python
from sagemaker.model_monitor import ModelBiasMonitor
from sagemaker.clarify import BiasConfig

bias_monitor = ModelBiasMonitor(role=role, instance_count=1, instance_type="ml.m5.xlarge")
bias_config = BiasConfig(
    label_values_or_threshold=[1],        # 양성(긍정) 결과 값
    facet_name="gender",                   # 민감 속성(facet)
    facet_values_or_threshold=[0],         # 비교 대상 그룹
)
```

편향 드리프트는 ground truth 없이 예측만으로 계산하는 지표(예: DPPL)도 있어, 운영 중 라벨이 없어도 일부 감시가 가능하다.

> ⚠️ **함정**: "운영 중 특정 인구 그룹에 대한 모델의 공정성 변화를 감시"는 **Bias Drift Monitor**(Clarify), "운영 중 각 피처의 중요도 변화를 감시"는 **Feature Attribution Drift Monitor**(Clarify)다. 둘을 데이터 품질 모니터(단순 분포 통계)와 혼동하지 말자. 데이터 품질은 "피처 X의 평균이 변했다"를 잡고, 피처 기여도는 "피처 X가 예측에 미치는 영향이 변했다"를 잡는다 — 후자가 모델 행동에 더 직접적이다.

## 네 모니터를 한 표로 정리

시험 직전 이 표 하나로 정리된다.

| 모니터 | 감시 대상 | 도구 | 라벨 필요 |
|--------|----------|------|----------|
| 데이터 품질 | 입력 피처 분포 통계 | Model Monitor(Deequ) | 불필요 |
| 모델 품질 | 예측 성능 지표 | Model Monitor | **필요** |
| 편향 드리프트 | 그룹 간 예측 편향 | Clarify | 일부 불필요 |
| 피처 기여도 드리프트 | 피처 중요도(SHAP) | Clarify | 불필요 |

```python
# 공통 흐름: Clarify 기반 모니터도 동일하게 스케줄로 운영한다
explainability_monitor.create_monitoring_schedule(
    endpoint_input=predictor.endpoint_name,
    ground_truth_input=None,                  # 피처 기여도는 라벨 불필요
    analysis_config="s3://my-bucket/analysis-config.json",
    output_s3_uri="s3://my-bucket/explain-results/",
    schedule_cron_expression="cron(0 * ? * * *)",   # 매시간
)
```

## 정리하며

오늘의 핵심은 **Clarify가 학습 단계의 편향·설명 분석을 운영 단계의 지속 감시로 확장한다**는 것이다. **편향 드리프트 모니터**는 DPPL·DI 같은 사후 편향 지표를 주기적으로 재계산해 그룹 간 공정성 변화를 추적하고, **피처 기여도 드리프트 모니터**는 SHAP로 각 피처의 중요도가 베이스라인 대비 얼마나 바뀌었는지를 라벨 없이 감시한다. 특히 피처 기여도 드리프트는 ground truth를 기다리지 않고 모델 행동 변화의 조기 경보를 주므로, 라벨 수집이 느린 도메인에서 강력하다. 네 가지 모니터는 모두 "베이스라인 생성 → cron 스케줄 → Processing Job 비교 → CloudWatch 지표"라는 동일한 골격을 공유한다.

다음 글에서는 모델 품질이 아니라 **시스템 운영 관점**의 모니터링 — CloudWatch 지표·알람, 엔드포인트 지연·오류, 로깅을 본다.

---

## 📝 연습 문제

**문제 1.** 운영 중인 신용 평가 모델에 대해 정답 레이블이 확정되기까지 수 주가 걸린다. 성능 저하를 가능한 한 빨리 감지하고 싶다. 가장 적절한 방법은?

A) 모델 품질 모니터로 정확도를 매시간 계산  
B) 피처 기여도 드리프트(Feature Attribution Drift) 모니터로 SHAP 중요도 변화를 감시  
C) 엔드포인트 CPU 사용률 알람  
D) 데이터 캡처를 끈다  

**정답: B**  
해설: 피처 기여도 드리프트는 정답 레이블 없이 SHAP로 즉시 계산되므로, 성능 저하가 확정되기 전에 모델 행동 변화의 선행 신호를 준다. A는 ground truth가 수 주 후에야 모이므로 조기 감지가 불가능하고, C는 시스템 자원 지표일 뿐 모델 행동과 무관하며, D는 모니터링 자체를 불가능하게 만든다.

---

**문제 2.** SageMaker Clarify가 각 피처의 예측 기여도를 계산하는 데 사용하는 기법은?

A) 선형 회귀 계수  
B) SHAP(Shapley) 값  
C) 정규화(normalization)  
D) k-평균 군집  

**정답: B**  
해설: Clarify의 설명가능성과 피처 기여도 드리프트는 게임 이론 기반의 SHAP 값으로 각 피처가 예측에 기여한 정도를 산출한다. A는 선형 모델에만 한정되고, C는 전처리 기법, D는 비지도 군집 알고리즘으로 설명가능성과 무관하다.

---

**문제 3.** "운영 중 모델이 특정 성별 그룹에 점점 불리한 예측을 내는지 감시하라"는 요구에 맞는 모니터는?

A) 데이터 품질 모니터  
B) 피처 기여도 드리프트 모니터  
C) 편향 드리프트(Bias Drift) 모니터  
D) 엔드포인트 지연(latency) 알람  

**정답: C**  
해설: 그룹 간 예측 편향(공정성) 변화를 지속 감시하는 것은 Clarify 기반 편향 드리프트 모니터다. A는 피처 분포 통계만 보고 공정성을 직접 측정하지 않으며, B는 피처 중요도를, D는 시스템 성능을 볼 뿐 편향과 무관하다.

---

**문제 4.** 데이터 품질 모니터와 피처 기여도 드리프트 모니터의 차이로 가장 정확한 것은?

A) 둘 다 동일하게 피처 평균만 비교한다  
B) 데이터 품질은 피처 분포 통계 변화를, 피처 기여도는 피처가 예측에 미치는 영향(중요도) 변화를 본다  
C) 피처 기여도는 항상 ground truth가 필요하다  
D) 데이터 품질은 Clarify가, 피처 기여도는 Deequ가 담당한다  

**정답: B**  
해설: 데이터 품질은 입력 X의 통계 분포 변화를, 피처 기여도는 그 피처가 예측에 미치는 영향(SHAP 중요도)의 변화를 본다 — 후자가 모델 행동에 더 직접적이다. A는 둘이 다르므로 틀리고, C는 피처 기여도가 라벨 불필요라 반대이며, D는 도구 매핑이 뒤바뀌었다(데이터 품질=Deequ, 피처 기여도=Clarify).

---

**문제 5.** Clarify 기반 모니터(편향·피처 기여도)가 Day 1의 Model Monitor 모니터들과 공유하는 운영 골격으로 옳은 것은?

A) 모두 DynamoDB에 결과를 적재한다  
B) 모두 베이스라인 생성 → cron 스케줄 → Processing Job 비교 → CloudWatch 지표의 흐름을 따른다  
C) 모두 정답 레이블을 반드시 요구한다  
D) 모두 엔드포인트를 매번 재배포한다  

**정답: B**  
해설: 네 가지 모니터는 모두 베이스라인을 만들고 cron 스케줄로 Processing Job을 띄워 캡처 데이터와 비교한 뒤 CloudWatch 지표를 내보내는 동일한 골격을 공유한다. A는 결과를 S3에 저장하고, C는 데이터 품질·피처 기여도는 라벨이 불필요하며, D는 모니터링이 재배포를 수반하지 않는다.

---
