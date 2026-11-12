# Day 2 - Bias and Explainability Drift: Monitoring During Operations with Clarify

## 📌 Key Takeaways

- **Clarify** computes pre-training data bias, post-training model bias, and prediction explanations (SHAP), and extends them into **continuous monitoring in operation**.
- The **bias drift monitor** periodically recomputes post-training bias metrics such as DPPL and DI to track changes in fairness between groups.
- The **feature attribution drift monitor** watches how much SHAP importance has changed relative to the baseline, **without labels**.
- In domains where labels arrive late, feature attribution drift is an **early warning** that sounds before performance degradation does.
- All four monitors share the same skeleton: "baseline → cron schedule → Processing Job comparison → CloudWatch metrics".

## The Three Points Where Clarify Attaches

Clarify attaches at three points: before training, after training, and in operation. Think of it as the same bias-metric engine being reused with only the stage changed.

```text
 ① Pre-training (data)     ② Post-training (model)     ③ In operation (endpoint)
 ─────────────────────   ─────────────────────────   ──────────────────────────
  Raw data bias            Prediction bias · SHAP        Bias Drift Monitor
  CI · DPL · KL/JS   ──▶   DPPL · DI · AD          ──▶   Feature Attribution
  (looks at label dist.)   (looks at predictions)        Drift Monitor
        │                       │                         │
        ▼                       ▼                         ▼
   Resample · recollect   Adjust model · thresholds   Detect departure from baseline
                                                          │
                                                  CloudWatch metrics → alarms
```

Why look at bias and explanation in operation too? A model that was fair at training time can become unfavorable to a particular group if the distribution of incoming data changes. Also, if the importance of the features the model relies on changes over time, that itself is a warning sign that the model's behavior has changed. MLA-C01 ties "responsible AI" and monitoring together to ask about this.

## The Two Faces of Clarify: Bias and Explainability

Clarify does two broad things.

| Capability | What it measures | Operational monitor | Labels needed |
|------------|------------------|---------------------|---------------|
| Bias detection | Differences in outcomes between sensitive groups (e.g., gender, age) | Bias Drift Monitor | Depends on the metric |
| Explainability | How much each feature contributed to a prediction (SHAP) | Feature Attribution Drift Monitor | Not needed |

Explainability is computed with **SHAP (SHapley Additive exPlanations)** values. SHAP is a concept from game theory that fairly distributes and quantifies how much each feature pushed the prediction up or pulled it down from the baseline.

> 💡 **Related theory**: Among the bias metrics, the ones the exam covers are the pre-training metrics **CI (Class Imbalance)** and **DPL (Difference in Positive Proportions in Labels)**, and the post-training metrics **DPPL (Difference in Positive Proportions in Predicted Labels)** and **DI (Disparate Impact)**. The key point is that "pre-training data bias" and "post-training model prediction bias" are looked at separately. The Bias Drift Monitor tracks how far the post-training bias metrics diverge from the baseline during operation.

## Bias Metrics - What to Look at When

You do not need to memorize every metric name, but if you keep two axes straight, **"does the metric look at labels or at predictions"** and **"is it a difference or a ratio"**, the questions get easy.

| Stage | Metric | What it compares | How to read it |
|-------|--------|------------------|----------------|
| Pre | **CI** (Class Imbalance) | The imbalance in the sample counts themselves between groups | Closer to 0 is more balanced |
| Pre | **DPL** | Difference in the positive proportion of the **actual labels** by group | 0 means the label distributions are on par |
| Pre | **KL / JS** | Distance between the label distributions of the groups | Larger means the two groups' distributions differ more |
| Post | **DPPL** | Difference in the **predicted positive proportion** by group | 0 means predictions are on par · no labels needed |
| Post | **DI** (Disparate Impact) | The **ratio** of predicted positive proportions by group | 1 means on par · no labels needed |
| Post | **AD / RD** | Difference in accuracy / recall by group | 0 means on par · **ground truth labels needed** |

Even among "post-training bias" metrics, label requirements split. DPPL and DI are computed from **predictions alone**, so real-time monitoring in operation is possible. Metrics such as AD and RD, which compare accuracy and recall by group, **need ground truth**. This is why the Bias Drift Monitor is classified as "labels not needed for some".

## Feature Attribution Drift - Detecting Changes in Model Behavior Without Labels

Feature attribution drift looks at **how much the importance ranking and magnitude of each feature differ from the baseline**. The decisive advantage is that **no ground truth labels are needed**. How much the model relies on each feature can be computed with SHAP from inputs and predictions alone.

For example, if a credit scoring model weighted "income" most heavily at training time but in operation the contribution of "postal code" suddenly spikes, that is a strong warning that "the model's behavior has changed", even without knowing the answers.

```text
 Baseline SHAP importance      In-operation SHAP importance
 ────────────────────────      ────────────────────────────
  Income        ████████ 0.41    Income        ███ 0.15
  Credit score  █████ 0.27       Postal code   ███████ 0.34   ← rank reversal
  Txn count     ███ 0.18         Credit score  ████ 0.22
  Postal code   ██ 0.09          Txn count     ███ 0.17
                                     │
                                     ▼
             Score how much the importance "ranking" is disturbed → violation if it exceeds the threshold
```

```python
from sagemaker.model_monitor import ModelExplainabilityMonitor
from sagemaker.clarify import SHAPConfig, ModelConfig, ExplainabilityAnalysisConfig

explainability_monitor = ModelExplainabilityMonitor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
)
shap_config = SHAPConfig(
    baseline="s3://my-bucket/shap-baseline.csv",
    num_samples=100,
    agg_method="mean_abs",     # aggregate importance as the mean absolute SHAP per feature
)
explainability_monitor.suggest_baseline(
    data_config=...,           # input data configuration
    model_config=ModelConfig(model_name="my-model", instance_type="ml.m5.xlarge",
                             instance_count=1),
    explainability_config=shap_config,
)
```

- `baseline` is the reference point (reference data) for the SHAP computation. Against this reference, it measures how much each feature moved the prediction.
- Raising `num_samples` stabilizes the SHAP estimate, but the Processing Job's time and cost rise with it.
- `agg_method="mean_abs"` is the mean of absolute values with the sign removed - it means ranking importance by "magnitude of influence, not direction".

The strength of feature attribution drift lies in the "early warning". The model quality monitor has to wait until ground truth accumulates (days to weeks) before it can confirm performance degradation. Feature attribution, by contrast, is computed immediately without answers, so before performance actually drops it gives a leading signal that "the model has started relying on different features". It is especially valuable in domains where label collection is slow.

## Bias Drift Monitor - Continuously Watching Fairness

The bias drift monitor periodically recomputes post-training bias metrics (e.g., DPPL, DI) on operational data to track whether bias has grown relative to the training-time baseline. You must specify the sensitive attribute (facet) and the positive outcome.

```python
from sagemaker.model_monitor import ModelBiasMonitor
from sagemaker.clarify import BiasConfig

bias_monitor = ModelBiasMonitor(role=role, instance_count=1, instance_type="ml.m5.xlarge")
bias_config = BiasConfig(
    label_values_or_threshold=[1],        # value of the positive (favorable) outcome
    facet_name="gender",                   # sensitive attribute (facet)
    facet_values_or_threshold=[0],         # group to compare
)
```

- **facet**: The sensitive attribute column on which fairness is judged (gender, age bracket, region, etc.). Which column to treat as the facet is **decided by the business and regulation**. It is not selected automatically on technical grounds.
- **label_values_or_threshold**: What to treat as the "favorable outcome". Definitions such as loan approved = 1, rejected = 0.
- Continuous attributes (e.g., age) split the groups with a threshold.

Some bias drift metrics (e.g., DPPL) are computed from predictions alone without ground truth, so some monitoring is possible in operation even without labels.

> ⚠️ **Trap**: "Monitor changes in the model's fairness toward a particular demographic group in operation" is the **Bias Drift Monitor** (Clarify), and "Monitor changes in the importance of each feature in operation" is the **Feature Attribution Drift Monitor** (Clarify). It is easy to confuse both with the data quality monitor (simple distribution statistics). Data quality catches "the mean of feature X changed", while feature attribution catches "the influence of feature X on predictions changed" - the latter is more directly about model behavior.

## The Four Monitors in One Table

This one table covers it right before the exam.

| Monitor | What it watches | Tool | Labels needed |
|---------|-----------------|------|---------------|
| Data quality | Distribution statistics of input features | Model Monitor (Deequ) | Not needed |
| Model quality | Prediction performance metrics | Model Monitor | **Needed** |
| Bias drift | Prediction bias between groups | Clarify | Not needed for some |
| Feature attribution drift | Feature importance (SHAP) | Clarify | Not needed |

Split them with one sentence each.

| Question sentence | Answer |
|-------------------|--------|
| "Did the mean, missingness, or categories of input values change?" | Data quality |
| "Have the predictions actually started to be wrong?" | Model quality |
| "Is it becoming increasingly unfavorable to a particular group?" | Bias drift |
| "Has the model started leaning on different features?" | Feature attribution drift |

```python
# Common flow: Clarify-based monitors are also operated on a schedule in the same way
explainability_monitor.create_monitoring_schedule(
    endpoint_input=predictor.endpoint_name,
    ground_truth_input=None,                  # feature attribution needs no labels
    analysis_config="s3://my-bucket/analysis-config.json",
    output_s3_uri="s3://my-bucket/explain-results/",
    schedule_cron_expression="cron(0 * ? * * *)",   # every hour
)
```

`analysis_config` holds the analysis conditions such as the facet, label definition, and SHAP settings. The bias monitor can additionally connect `ground_truth_input` here to compute label-based metrics as well.

## When Clarify Monitors Get Tangled: Symptom → Cause → Action

| Symptom | Common cause | Action |
|---------|--------------|--------|
| The bias monitor produces only some of the metrics | The metric needs labels (AD, RD) but ground truth is not connected | Connect `ground_truth_input`, or monitor with prediction-based metrics such as DPPL and DI |
| Feature attribution runs are slow and expensive | `num_samples` is excessive, hourly schedule | Lower the sample count and relax the period to daily |
| Only attribution drift fires while performance is normal | Attribution redistributed among correlated features (no performance impact) | Observe rather than retrain immediately. Reset thresholds focusing on the ranking of top features |
| Facet specification is rejected | The facet column is not in the input or the value definition is wrong | Check the capture data schema, group continuous ones with a threshold |
| Bias changes abruptly right after deployment | A new segment flowed in (new region, age bracket) | Cross-check with data quality's `categorical_values_check`, then update the baseline |
| Fair at training but bias widens in operation | Data distribution shifts occurred differently per group | Secure group balance in the retraining data (check the pre-training metrics CI and DPL) |

In the next post, we look at monitoring from the **system operations perspective**, not model quality - CloudWatch metrics and alarms, endpoint latency and errors, and logging.

## 📖 Glossary

- **SageMaker Clarify**: A service that computes bias in data and models and prediction explanations (SHAP). It extends to continuous monitoring in operation.
- **SHAP**: A value that uses game theory to fairly distribute and quantify how much each feature pushed a prediction up or pulled it down from the reference point.
- **facet (sensitive attribute)**: The reference column on which fairness is judged (gender, age bracket, etc.). Decided by the business and regulation, not by technology.
- **Pre-training bias metrics**: Bias in the data itself before training. CI (group sample imbalance), DPL (difference in positive proportion of labels by group), and so on.
- **Post-training bias metrics**: Prediction bias of the trained model. DPPL (difference in predicted positive proportion), DI (its ratio), AD and RD (differences in accuracy and recall), and so on.
- **DI (Disparate Impact)**: The predicted positive proportion of one group divided by that of the other. The closer to 1, the more on par.
- **Bias drift monitor**: A monitor that periodically recomputes post-training bias metrics to catch worsening fairness relative to the baseline.
- **Feature attribution drift monitor**: A monitor that watches, without labels, how far the ranking and magnitude of SHAP importance deviate from the baseline.
- **Early warning (leading indicator)**: A signal that sounds before performance degradation is confirmed. Especially valuable in domains where labels arrive late.
- **analysis_config**: A configuration file holding the Clarify analysis conditions such as the facet, label definition, and SHAP settings.

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
