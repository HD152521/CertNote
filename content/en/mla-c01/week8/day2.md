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

## 📝 Practice Questions

**Question 1.** For a production credit scoring model, it takes several weeks for ground truth labels to be finalized. You want to detect performance degradation as early as possible. What is the most appropriate method?

A) Compute accuracy every hour with the Model Quality monitor  
B) Monitor changes in SHAP importance with the Feature Attribution Drift monitor  
C) Endpoint CPU utilization alarm  
D) Turn off data capture  

**Answer: B**  
Explanation: Feature attribution drift is computed immediately with SHAP without ground truth labels, so it provides a leading signal of changes in model behavior before performance degradation is confirmed. A cannot detect early because ground truth only accumulates weeks later, C is only a system resource metric unrelated to model behavior, and D makes monitoring itself impossible.

---

**Question 2.** Which technique does SageMaker Clarify use to compute each feature's prediction contribution?

A) Linear regression coefficients  
B) SHAP (Shapley) values  
C) Normalization  
D) k-means clustering  

**Answer: B**  
Explanation: Clarify's explainability and feature attribution drift use game-theory-based SHAP values to compute how much each feature contributed to the prediction. A is limited to linear models, C is a preprocessing technique, and D is an unsupervised clustering algorithm, both unrelated to explainability.

---

**Question 3.** Which monitor fits the requirement "monitor whether the production model increasingly makes unfavorable predictions for a specific gender group"?

A) Data Quality monitor  
B) Feature Attribution Drift monitor  
C) Bias Drift monitor  
D) Endpoint latency alarm  

**Answer: C**  
Explanation: Continuously monitoring changes in prediction bias (fairness) between groups is the job of the Clarify-based Bias Drift monitor. A looks only at feature distribution statistics and does not directly measure fairness, and B looks at feature importance and D at system performance, neither related to bias.

---

**Question 4.** Which statement most accurately describes the difference between the Data Quality monitor and the Feature Attribution Drift monitor?

A) Both identically compare only feature means  
B) Data Quality looks at changes in feature distribution statistics, while Feature Attribution looks at changes in the influence (importance) of features on predictions  
C) Feature Attribution always requires ground truth  
D) Data Quality is handled by Clarify and Feature Attribution by Deequ  

**Answer: B**  
Explanation: Data Quality looks at changes in the statistical distribution of input X, while Feature Attribution looks at changes in the influence (SHAP importance) of those features on predictions; the latter is more directly tied to model behavior. A is wrong because the two differ, C is the opposite because feature attribution needs no labels, and D has the tool mapping swapped (Data Quality = Deequ, Feature Attribution = Clarify).

---

**Question 5.** Which is correct about the operational skeleton that Clarify-based monitors (bias, feature attribution) share with the Model Monitor monitors from Day 1?

A) All store results in DynamoDB  
B) All follow the flow of baseline creation → cron schedule → Processing Job comparison → CloudWatch metrics  
C) All require ground truth labels  
D) All redeploy the endpoint every time  

**Answer: B**  
Explanation: All four monitors share the same skeleton: create a baseline, launch a Processing Job on a cron schedule to compare against captured data, and emit CloudWatch metrics. A is wrong because results are stored in S3, C is wrong because Data Quality and Feature Attribution need no labels, and D is wrong because monitoring does not involve redeployment.

---
