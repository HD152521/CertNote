# Day 4 - Model Debugging and Bias: SageMaker Debugger and Clarify

## 📌 Key Takeaways

- Even with good metrics, a model can **break during training** (vanishing gradients, overfitting), be **unfair to certain groups**, or be an **unexplainable black box**.
- **Debugger = health of the training process.** It captures tensors (weights, gradients, loss, activations), detects anomalies with rules, and automatically stops broken jobs to save cost.
- **Clarify = bias + explainability.** It measures bias before training (data) and after training (predictions) with metrics, and explains predictions with SHAP.
- Even if the data looks fair before training, **the model can amplify bias**, so check both the pre and post stages.
- The last layer is human **error analysis.** Group the wrong cases and fix **the largest error bucket first**.

## Three Layers of Model Debugging

Fixing a model splits into three different questions. The exam hints at which layer through keywords planted in the passage.

| Layer | Tool | Question it answers | Passage keywords |
|---|---|---|---|
| Training process | **SageMaker Debugger** | Is training converging normally? | Gradients, loss, tensors, overfitting, job stopping |
| Fairness/trust | **SageMaker Clarify** | Are outcomes fair across groups / why this prediction? | Gender/race, regulation, Disparate Impact, SHAP |
| Error patterns | **Error analysis** (human) | Where and how does it go wrong? | Performance drops sharply only in a specific range |

The three layers have an order. If training never converged in the first place (layer 1), measuring bias metrics (layer 2) is meaningless, and if training is normal but only a specific range is bad (layer 3), the cause is the data, not hyperparameters.

## SageMaker Debugger: Looking Inside the Training Process

Debugger periodically captures tensors during training (weights, gradients, loss, activations, etc.), stores them in S3, and automatically detects anomalies with **rules**. It notices early when training heads in the wrong direction.

```python
from sagemaker.debugger import Rule, rule_configs, DebuggerHookConfig

rules = [
    Rule.sagemaker(rule_configs.vanishing_gradient()),   # vanishing gradients
    Rule.sagemaker(rule_configs.overfit()),              # overfitting
    Rule.sagemaker(rule_configs.loss_not_decreasing()),  # stalled loss
    Rule.sagemaker(rule_configs.exploding_tensor()),     # divergence
]

estimator = Estimator(
    ...,
    rules=rules,
    debugger_hook_config=DebuggerHookConfig(s3_output_path="s3://bucket/debug"),
)
```

### Symptom → Rule → Action

| Symptom during training | Rule that fires | Problem detected | Typical action |
|---|---|---|---|
| Loss barely moves and deep layers do not learn | `vanishing_gradient` | Gradients converge to 0 → training stalls | Change activation/initialization, residual connections, normalization layers |
| Loss jumps to NaN/Inf | `exploding_tensor` | Value divergence (NaN/Inf) | Lower the learning rate, gradient clipping, input scaling |
| Training loss ↓, validation loss ↑ | `overfit` | Gap between validation and training loss | Early stopping, regularization, data augmentation |
| Loss stays the same after many steps | `loss_not_decreasing` | Loss is not decreasing | Revisit learning rate, optimizer, features |
| Minority class is effectively ignored | `class_imbalance` | Class imbalance | Resampling, class weights, replace the metric |
| Training looks off from the start | `poor_weight_initialization` | Poor initialization | Change the initialization method (He/Xavier, etc.) |

When a rule fires, you can send a notification via CloudWatch Events/EventBridge, or automatically stop the broken training job (early stopping) to save cost.

The value of Debugger is "catching failures early to cut cost." Deep learning training uses expensive GPU time, so discovering a job with vanishing gradients or a diverging loss only after running it to the end is a big waste. Debugger rules detect this mid-training and trigger automatic stopping/notification, so it solves both debugging "why it is not working" and "preventing wasted money."

> ⚠️ **Trap**: Debugger looks at the state **during training**. Operational drift, where the input distribution of a deployed model changes, is the domain of Model Monitor, and group fairness is the domain of Clarify. Some options mix the three.

## SageMaker Clarify: Bias and Explainability

Clarify does two things: **bias detection** and **explainability (SHAP)**. It is essential in domains where fairness regulation or model trust matters.

### Pre-training Bias

Before building the model, it measures bias in the **data itself**. It looks at whether the class/label distribution is skewed with respect to sensitive attributes (gender, race, age, etc.).

| Metric | Name | What it measures |
|---|---|---|
| **CI** | Class Imbalance | How over- or under-represented a group's samples are |
| **DPL** | Difference in Positive Proportions in Labels | Difference in the proportion of **positive labels** between groups |
| **KL / JS Divergence** | Kullback-Leibler / Jensen-Shannon | The **distance between label distributions** across groups |

### Post-training Bias

It measures whether the **predictions of the trained model** are unfair across groups.

| Metric | Name | What it measures |
|---|---|---|
| **DPPL** | Difference in Positive Proportions in Predicted Labels | Difference in the proportion of **positive predictions** between groups |
| **DI** | Disparate Impact | The **ratio** of positive prediction rates between groups |
| **RD** | Recall Difference | Difference in **recall** between groups |
| **AD** | Accuracy Difference | Difference in **accuracy** between groups |

Even when the pre-training data looks fair, the model can amplify bias, so check both stages.

### Which Bias Metric to Look at by Situation

| Situation | Metric to look at | Reason |
|---|---|---|
| A particular group has far too few samples to begin with | CI (pre-training) | The data is skewed even before the model is built |
| The approval/acceptance labels in the data themselves differ by group | DPL (pre-training) | Bias from past decisions is baked into the labels |
| You must report the "ratio of approval rates between groups" for regulation | DI (post-training) | Being a ratio, it is easy to report against a baseline |
| Many cases (FN) are missed in only one group | RD (post-training) | The recall difference is exactly "who gets missed more" |
| You want to summarize per-group performance differences in one number | AD (post-training) | But be sure to also check the trap below |

> ⚠️ **Trap**: **An accuracy difference (AD) near 0 does not mean fair.** If the minority group has extremely few positive cases, labeling that whole group negative still gives high accuracy. In other words, AD can look fine while RD (recall difference) is dismal. The principle of not trusting accuracy on imbalanced data applies equally to per-group metrics — **you must look at DI, DPPL, and RD together.**

### At Which Stage Is Bias Mitigated

Clarify is a tool that **measures** bias. Actual mitigation depends on which point of the pipeline you touch.

| Timing | What you touch | Representative means | Limitation |
|---|---|---|---|
| **Pre-processing** | Training data | Resampling, reweighting, removing proxy variables | Bias in the original labels can remain |
| **In-processing** | Objective function/training procedure | Add fairness constraints/penalties to the loss | Algorithm choice is limited |
| **Post-processing** | Prediction results/thresholds | Per-group threshold adjustment | The cause of bias inside the model stays as is |

The measurement points are clear. Verify the effect of pre-processing with the **pre-training bias metrics (CI, DPL)**, and the effects of in-processing and post-processing with the **post-training bias metrics (DPPL, DI, RD)**.

### SHAP-Based Explainability

Clarify computes SHAP (SHapley Additive exPlanations) values to quantify "how much, and in which direction, each feature pushed this prediction." It fairly distributes feature contributions based on Shapley values from game theory.

```python
from sagemaker.clarify import (
    SageMakerClarifyProcessor, BiasConfig, DataConfig, ModelConfig, SHAPConfig
)

bias_config = BiasConfig(
    label_values_or_threshold=[1],
    facet_name="gender",          # sensitive attribute
    facet_values_or_threshold=[0],
)
shap_config = SHAPConfig(baseline=baseline_rows, num_samples=100)

clarify_processor.run_bias(data_config, bias_config, model_config)
clarify_processor.run_explainability(data_config, model_config, shap_config)
```

| Scope | What it tells you | Typical use |
|---|---|---|
| **Global importance** | How important a feature is on average across all the data | Model review, feature cleanup, uncovering proxy variables |
| **Local explanation** | Why this single prediction came out the way it did | Explaining individual decisions to customers or auditors |

Combined with SageMaker Model Monitor, you can also track changes in feature attribution in operation (**explainability drift**).

Bias and explainability are different problems. Bias metrics (DI, DPPL) answer the ethical/legal question "are outcomes fair across groups?", and SHAP answers the trust/debugging question "why did this prediction come out?" That is why SHAP is also used to diagnose the *cause* of bias — it reveals which features act as proxies for sensitive attributes and create bias.

## Division of Roles Between the Two Services

This is the most confusing point on the exam. Split them by keyword.

| Keyword/problem | Service | When not to use it |
|---|---|---|
| Real-time detection of vanishing/exploding gradients, overfitting | **Debugger** | Monitoring operational drift after deployment (→ Model Monitor) |
| Saving cost by automatically stopping training jobs | **Debugger** | Reducing inference cost (→ choosing inference options) |
| Capturing tensors/weights/activations | **Debugger** | Measuring outcome fairness by group |
| Measuring fairness across groups such as gender/race | **Clarify (bias)** | Diagnosing training convergence problems |
| Regulatory response, data/model bias reports | **Clarify (bias)** | Explaining the reason for an individual prediction (→ SHAP) |
| Feature attribution (SHAP), explaining predictions | **Clarify (explainability)** | When the group fairness numbers themselves are required |

## Error Analysis: Beyond Metrics

Once you have the metrics and tools, the last step is human error analysis. Gather the cases the model got wrong and look for patterns.

```text
Error analysis flow:
1) Collect misclassified/large-error samples
2) Group by common traits (a particular class? a particular feature range? a particular group?)
3) Cause hypotheses: insufficient data / label noise / missing features / bias
4) Use SHAP to check which features contributed to that prediction
5) Improve data, features, and model starting with the largest error bucket
```

- **Example**: if "fraud detection recall drops sharply only on night-time transactions" → suspect a shortage of night-time samples or missing time-related features, and verify with SHAP.
- Before blindly running hyperparameters, error analysis tells you **"where to fix."**

| What the error bucket looks like | Likely cause | How to check |
|---|---|---|
| Performance drops sharply only in a particular time window/region | Insufficient data in that range, missing features | Split and compare sample counts and metrics per range |
| Only a particular class has low recall | Class imbalance, label noise | `class_imbalance` rule, re-inspect labels |
| Results diverge by sensitive-attribute group | Bias, proxy variables | Clarify bias metrics + SHAP global importance |
| Uniformly bad across all ranges | Training itself failed to converge | Debugger rules (loss, gradients) |

Good error analysis is prioritization that concentrates resources on the largest error bucket. Fixing a single pattern that accounts for 40% of errors (for example, a shortage of data for a particular group) is more effective than vague tuning that raises overall accuracy by 1%. SHAP and bias metrics are tools to identify this bucket quantitatively, and Debugger sorts out whether its cause lies in the training process itself.

## Diagnostic Pipeline

```
[Training data]
     │
 ① Clarify pre-training bias (CI · DPL · KL/JS)
     │     └─ Skewed → resample/reweight, then re-measure
     │
 ② Training (capture tensors with the Debugger hook)
     │     ├─ vanishing_gradient / exploding_tensor → fix learning rate/initialization
     │     └─ overfit / loss_not_decreasing → automatic stop + EventBridge notification
     │
 ③ Clarify post-training bias (DPPL · DI · RD · AD)
     │     └─ Unfair → post-processing such as threshold adjustment, then ③ again
     │
 ④ Clarify explainability (SHAP global/local)
     │     └─ Uncover proxy variables of sensitive attributes
     │
 ⑤ Error analysis → return to ① starting with the largest error bucket
     │
 ⑥ After deployment: track drift and explainability drift with Model Monitor
```

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Reason |
|---|---|---|
| "Gradients converge to 0 and training stalls" | Debugger `vanishing_gradient` | Detects tensor anomalies in the training process |
| "We want to cut broken training jobs early and save GPU cost" | Debugger rule + automatic stop | A fired rule triggers job stopping/notification |
| "Difference in positive prediction rates between gender groups, for regulatory reporting" | Clarify post-training bias (DPPL, DI) | Group fairness of model predictions |
| "Label skew in the data before building the model" | Clarify pre-training bias (CI, DPL) | The stage that looks at the data itself |
| "Explain to the customer why this one application was rejected" | Clarify SHAP **local** explanation | Feature attribution for an individual prediction |
| "Which features are important overall?" | Clarify SHAP **global** importance | Average attribution over all the data |
| "Accuracy is similar across groups, so is it fair?" | **Trap** — also check RD and DI | The minority group's FN is hidden by accuracy |
| "Recall drops sharply only on night-time transactions" | Identify the bucket with error analysis, then improve | Full retraining or random tuning is inefficient |
| "The input distribution of the deployed model has changed" | Model Monitor | Debugger is for training time only |

Tomorrow we do a comprehensive review of all of Week 9 — classification and regression metrics, curves and thresholds, debugging and bias — as a single evaluation and debugging flow.

## 📖 Glossary

- **Vanishing gradient**: A phenomenon where the gradients passed back by backpropagation approach 0 so that early layers are effectively not trained.
- **Exploding tensor**: A state where values surge to NaN/Inf and training breaks.
- **Sensitive attribute (facet)**: A column that serves as the basis when assessing fairness, such as gender, race, or age. Specified in Clarify as `facet_name`.
- **CI (Class Imbalance)**: A pre-training bias metric that measures how skewed the sample counts are across groups.
- **DPL / DPPL**: Difference in the proportion of positive **labels** between groups (pre-training) / difference in the proportion of positive **predictions** (post-training).
- **Disparate Impact (DI)**: The ratio of positive prediction rates between groups. Often used in regulatory reporting.
- **SHAP**: An explanation technique that uses game-theoretic Shapley values to split up "how much each feature pushed this prediction."
- **Global/local explanation**: The average attribution over all data (global) / why one specific case came out that way (local).
- **Proxy variable**: A feature that effectively stands in for a sensitive attribute even when the attribute is not used directly (e.g., a postal code standing in for race).
- **Error bucket**: A group bundling errors with similar causes. Fixing the large buckets first is the knack of error analysis.

## 📝 Practice Questions

**Question 1.** In a deep learning training job, you want to automatically detect in real time the problem of gradients converging toward 0 and stalling training, and stop the broken job early to save cost. Which service is appropriate?

A) SageMaker Clarify  
B) SageMaker Model Monitor  
C) SageMaker Ground Truth  
D) SageMaker Debugger  

**Answer: D**  
Explanation: Capturing tensors in real time during training for issues such as vanishing/exploding gradients and overfitting, and even automatically stopping with rules, is the job of Debugger. Clarify (A) is for bias/explainability, Model Monitor (B) is for production drift, and Ground Truth (C) is a labeling service.

---

**Question 2.** For regulatory compliance, you want to quantitatively measure whether a loan approval model's positive prediction rate differs significantly between gender groups. Which tool and metric type should you use?

A) Clarify's post-training bias metrics (e.g., Disparate Impact)  
B) Debugger's vanishing_gradient rule  
C) RMSE  
D) Ground Truth label agreement rate  

**Answer: A**  
Explanation: Prediction fairness across groups is measured with Clarify's post-training bias metrics (DPPL, Disparate Impact, etc.). Debugger rules (B) are for the training process, RMSE (C) is a regression error, and label agreement rate (D) is labeling quality.

---

**Question 3.** You must explain to a customer "which features contributed most to the decision in this particular loan rejection prediction." Which technique is the most appropriate?

A) Debugger's overfit rule  
B) Clarify's SHAP values (local explanation)  
C) Confusion matrix  
D) ROC curve  

**Answer: B**  
Explanation: Explaining feature contributions for an individual prediction is exactly the role of the SHAP values (local explanation) that Clarify provides. The overfit rule (A) detects overfitting, and the confusion matrix (C) and ROC (D) are metrics for evaluating overall classification performance.

---

**Question 4.** Which is correct about the purpose of pre-training bias analysis?

A) To see whether the trained model's predictions are fair across groups  
B) To detect exploding gradients  
C) To examine skew in the label distribution between groups in the data itself before building a model  
D) To measure inference latency  

**Answer: C**  
Explanation: Pre-training bias measures skew in the per-group distribution/labels of the data itself (CI, DPL, etc.) at the stage before a model is created. The fairness of model predictions (A) is post-training bias, and gradients (B) and latency (D) are unrelated to bias analysis.

---

**Question 5.** A fraud detection model has good overall recall, but recall drops sharply only for "nighttime transactions." What is the most effective next step?

A) Use error analysis to identify the nighttime error bucket, check SHAP and whether data is lacking, and improve that bucket first  
B) Immediately discard the model and retrain from scratch  
C) Randomly change only the overall learning rate  
D) Push ahead with deployment looking only at the accuracy metric  

**Answer: A**  
Explanation: When performance is poor only in a specific segment, it is effective to identify that bucket with error analysis, diagnose causes such as SHAP/lack of data, and improve it first. Full retraining (B) and random tuning (C) are inefficient, and deploying while ignoring the problem (D) is risky.
