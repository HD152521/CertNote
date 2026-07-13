# Day 2 - Bias and Explainability Drift: Monitoring During Operations with Clarify

On Day 1, we looked at Data Quality and Model Quality drift. Today we cover the remaining two monitors from Model Monitor: **Bias Drift** and **Feature Attribution Drift**. These two are handled by **SageMaker Clarify**. Clarify is a service that calculates model bias before training, post-training model bias, and prediction explainability. Today's topic extends that capability to **continuous monitoring of deployed endpoints**.

Why do we need to monitor bias and explainability during operations? A model that was fair at training time can become unfair to certain groups as incoming data distribution changes. And if the features the model depends on shift in importance over time, that itself is a warning signal that model behavior has changed. MLA-C01 weaves together "responsible AI" and monitoring to test this area.

## Clarify's Two Faces: Bias and Explainability

Clarify does two main things:

| Capability | What It Measures | Operations Monitor |
|------|------------|------------|
| Bias Detection | Outcome differences across sensitive groups (e.g., gender, age) | Bias Drift Monitor |
| Explainability | How much each feature contributes to predictions (SHAP) | Feature Attribution Drift Monitor |

Explainability is calculated using **SHAP (SHapley Additive exPlanations)** values. SHAP is a concept from game theory that fairly quantifies how much each feature pushes or pulls the prediction from a baseline.

> 💡 **Related Theory**: Common bias metrics on the exam include **CI (Class Imbalance)** and **DPL (Difference in Positive Proportions in Labels)** at the pre-training stage, and **DPPL (Difference in Positive Proportions in Predictions)** and **DI (Disparate Impact)** at the post-training stage. The key is separating "data bias before training" from "model prediction bias after training." The Bias Drift Monitor tracks how much post-training bias metrics diverge from the baseline during operations.

## Feature Attribution Drift — Detecting Model Behavior Change Without Labels

Feature Attribution drift looks at **how much the importance ranking and magnitude of each feature has changed from the baseline**. A critical advantage is **ground truth labels are not required**. You can calculate how much a model depends on which features from inputs and predictions alone using SHAP.

For example, if a credit scoring model relied on "income" during training but suddenly "zip code" importance skyrockets during operations, even without knowing the ground truth, that's a strong warning that "model behavior has changed."

```python
from sagemaker.model_monitor import ModelExplainabilityMonitor
from sagemaker.clarify import SHAPConfig, ModelConfig, ExplainabilityAnalysisConfig

explainability_monitor = ModelExplainabilityMonitor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
)
shap_config = SHAPConfig(
    baseline="s3://my-bucket/shap-baseline.csv",
    num_samples=100,
    agg_method="mean_abs",     # Aggregate feature importance by mean absolute SHAP
)
explainability_monitor.suggest_baseline(
    data_config=...,           # Input data configuration
    model_config=ModelConfig(model_name="my-model", instance_type="ml.m5.xlarge",
                             instance_count=1),
    explainability_config=shap_config,
)
```

> 🔍 **Deeper Dive**: The strength of Feature Attribution drift is early warning. The Model Quality monitor must wait for ground truth to arrive (days to weeks) before confirming performance degradation. Meanwhile, Feature Attribution calculates immediately without labels, providing a leading indicator that "the model is starting to rely on different features" before actual performance drops. This is especially valuable in domains where label collection is slow.

## Bias Drift Monitor — Continuously Monitoring Fairness

The Bias Drift monitor periodically recalculates post-training bias metrics (e.g., DPPL, DI) on operations data to track whether bias has widened compared to the baseline at training time. You must specify the sensitive attribute (facet) and positive outcome.

```python
from sagemaker.model_monitor import ModelBiasMonitor
from sagemaker.clarify import BiasConfig

bias_monitor = ModelBiasMonitor(role=role, instance_count=1, instance_type="ml.m5.xlarge")
bias_config = BiasConfig(
    label_values_or_threshold=[1],        # Positive (favorable) outcome value
    facet_name="gender",                   # Sensitive attribute (facet)
    facet_values_or_threshold=[0],         # Comparison group
)
```

Bias Drift can measure some metrics (like DPPL) without ground truth using only predictions, so some monitoring is possible during operations when labels aren't available.

> ⚠️ **Pitfall**: "Monitor fairness changes to a model toward specific demographic groups during operations" is the **Bias Drift Monitor** (Clarify), while "monitor how much each feature's importance changes during operations" is the **Feature Attribution Drift Monitor** (Clarify). Don't confuse these with the Data Quality monitor (simple distribution statistics). Data Quality catches "feature X's average changed," while Feature Attribution catches "feature X's impact on predictions changed" — the latter is more directly about model behavior.

## Four Monitors in One Table

This table summarizes everything before the exam.

| Monitor | Monitors | Tool | Labels Needed |
|--------|----------|------|----------|
| Data Quality | Input feature distribution statistics | Model Monitor (Deequ) | Not required |
| Model Quality | Prediction performance metrics | Model Monitor | **Required** |
| Bias Drift | Prediction bias across groups | Clarify | Partly not required |
| Feature Attribution Drift | Feature importance (SHAP) | Clarify | Not required |

```python
# Common flow: Clarify-based monitors operate the same way with a schedule
explainability_monitor.create_monitoring_schedule(
    endpoint_input=predictor.endpoint_name,
    ground_truth_input=None,                  # Feature Attribution doesn't need labels
    analysis_config="s3://my-bucket/analysis-config.json",
    output_s3_uri="s3://my-bucket/explain-results/",
    schedule_cron_expression="cron(0 * ? * * *)",   # Hourly
)
```

## Summary

Today's key insight is that **Clarify extends training-stage bias and explainability analysis to continuous operations monitoring**. The **Bias Drift Monitor** periodically recalculates post-training bias metrics like DPPL and DI to track fairness changes across groups, while the **Feature Attribution Drift Monitor** uses SHAP to monitor how much each feature's importance has changed from baseline without labels. Notably, Feature Attribution Drift provides an early warning of model behavior change without waiting for ground truth, making it powerful in domains with slow label collection. All four monitors share an identical scaffold: "generate baseline → create cron schedule → run Processing Job comparison → output CloudWatch metrics."

Next, we'll look at monitoring from an **operations perspective** rather than model quality — CloudWatch metrics/alarms, endpoint latency/errors, and logging.

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
