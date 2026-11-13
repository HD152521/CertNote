# Day 4 - Model Debugging and Bias: SageMaker Debugger and Clarify

## 📌 Key Takeaways

- Even when the metrics look good, a model can **break during training** (vanishing gradients, overfitting), be **unfair to certain groups**, or be an **inexplicable black box**.
- **Debugger = the health of the training process**. It captures tensors (weights, gradients, loss, activations), detects anomalies with rules, and automatically stops broken jobs to save cost.
- **Clarify = bias + explainability**. It measures pre-training (data) and post-training (prediction) bias with metrics and explains predictions with SHAP.
- Even if the data looks fair before training, **the model can amplify bias**, so check both the pre and post stages.
- The last layer is the **error analysis** done by humans. Group the wrong cases and fix **the largest error bucket first**.

## Three Layers of Model Debugging

Fixing a model splits into three different questions. The exam hints at which layer it is through the keywords planted in the passage.

| Layer | Tool | Question it answers | Passage keywords |
|---|---|---|---|
| Training process | **SageMaker Debugger** | Is training converging normally? | gradients, loss, tensors, overfitting, job stop |
| Fairness and trust | **SageMaker Clarify** | Are outcomes fair across groups? / Why this prediction? | gender/race, regulation, Disparate Impact, SHAP |
| Error patterns | **Error analysis** (human) | Where and how does it go wrong? | performance plunges only in a certain range |

The three layers have an order. If training never converged in the first place (layer 1), measuring bias metrics (layer 2) is meaningless, and if training is normal but only a certain range is bad (layer 3), the cause is the data rather than the hyperparameters.

## SageMaker Debugger: Looking Inside the Training Process

Debugger periodically captures tensors during training (weights, gradients, loss, activations, and so on), saves them to S3, and automatically detects anomalies with **Rules**. It notices early when training is heading in the wrong direction.

```python
from sagemaker.debugger import Rule, rule_configs, DebuggerHookConfig

rules = [
    Rule.sagemaker(rule_configs.vanishing_gradient()),   # Vanishing gradients
    Rule.sagemaker(rule_configs.overfit()),              # Overfitting
    Rule.sagemaker(rule_configs.loss_not_decreasing()),  # Loss stagnation
    Rule.sagemaker(rule_configs.exploding_tensor()),     # Divergence
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
| Loss barely moves and the deep layers aren't learning | `vanishing_gradient` | Gradients converge to 0 → training stalls | Change activation function/initialization, residual connections, normalization layers |
| Loss jumps to NaN/Inf | `exploding_tensor` | Values diverge (NaN/Inf) | Lower the learning rate, gradient clipping, input scaling |
| Training loss ↓ validation loss ↑ | `overfit` | Gap between validation and training loss | Early stopping, regularization, data augmentation |
| Loss stays the same over many steps | `loss_not_decreasing` | Loss isn't decreasing | Revisit learning rate, optimizer, features |
| The minority class is effectively ignored | `class_imbalance` | Class imbalance | Resampling, class weights, switch metrics |
| Training looks off from the start | `poor_weight_initialization` | Bad initialization | Change the initialization method (He/Xavier, etc.) |

When a rule fires, it can send a notification through CloudWatch Events/EventBridge, or automatically stop (early stopping) the broken training job to save cost.

The value of Debugger is "catching failures early to reduce cost." GPU time for deep learning training is expensive, so discovering a job with vanishing gradients or diverging loss only after running it to the end is a big waste. Debugger rules detect this midway through training and trigger automatic stop/notification, solving both "debugging why it doesn't work" and "preventing wasted money."

> ⚠️ **Pitfall**: Debugger looks at the state **during training**. Operational drift, where the input distribution of a deployed model changes, is the domain of Model Monitor, and group fairness is the domain of Clarify. Some answer choices mix the three.

## SageMaker Clarify: Bias and Explainability

Clarify does two things: **bias detection** and **explainability (SHAP)**. It is essential in domains where fairness regulation or model trust matters.

### Pre-training Bias

Before building the model, it measures the bias of **the data itself**. Using sensitive attributes (gender, race, age, and so on) as the basis, it checks whether the class/label distribution is skewed.

| Metric | Name | What it measures |
|---|---|---|
| **CI** | Class Imbalance | How over- or under-represented a group's samples are |
| **DPL** | Difference in Positive Proportions in Labels | Difference in the proportion of **positive labels** between groups |
| **KL / JS Divergence** | Kullback-Leibler / Jensen-Shannon | The **distance between label distributions** across groups |

### Post-training Bias

It measures whether **the trained model's predictions** are unfair across groups.

| Metric | Name | What it measures |
|---|---|---|
| **DPPL** | Difference in Positive Proportions in Predicted Labels | Difference in the proportion of **positive predictions** between groups |
| **DI** | Disparate Impact | The **ratio** of positive prediction rates between groups |
| **RD** | Recall Difference | Difference in **recall** between groups |
| **AD** | Accuracy Difference | Difference in **accuracy** between groups |

Even if the data looks fair before training, the model can amplify bias, so check both stages.

### Which Bias Metric to Look at by Situation

| Situation | Metric to look at | Reason |
|---|---|---|
| A certain group's samples are too few to begin with | CI (pre-training) | The data is already skewed before the model is even built |
| The approval/acceptance labels in the data differ by group | DPL (pre-training) | The bias of past decisions is embedded in the labels |
| You must report the "approval rate ratio between groups" for regulatory compliance | DI (post-training) | Being a ratio, it's easy to use for reporting against a baseline |
| Many missed cases (FN) occur in only one group | RD (post-training) | A recall difference is exactly "who gets missed more" |
| You want to summarize performance differences by group in one number | AD (post-training) | But always look at the pitfall below together |

> ⚠️ **Pitfall**: **An accuracy difference (AD) near zero does not mean fair.** If a minority group has extremely few positive cases, accuracy comes out high even when the model labels that entire group negative. That is, AD can look fine while RD (recall difference) is dismal. The principle "don't trust accuracy on imbalanced data" applies to group metrics as well: **you must look at DI, DPPL, and RD together.**

### At Which Stage Is Bias Mitigated

Clarify is a tool for **measuring** bias. Actual mitigation depends on which point in the pipeline you intervene.

| Timing | What you touch | Typical means | Limitation |
|---|---|---|---|
| **Pre-processing** | Training data | Resampling, reweighting, removing proxy variables | Bias in the original labels may remain |
| **In-processing** | Objective function and training procedure | Add fairness constraints/penalties to the loss | Limits the choice of algorithm |
| **Post-processing** | Prediction results and thresholds | Per-group threshold adjustment | The causes of bias inside the model remain |

The measurement points are clear. Verify the effect of pre-processing with the **pre-training bias metrics (CI, DPL)**, and the effects of in-processing and post-processing with the **post-training bias metrics (DPPL, DI, RD)**.

### SHAP-Based Explainability

Clarify computes SHAP (SHapley Additive exPlanations) values to quantify "how much, and in which direction, each feature pushed this prediction." It distributes feature contributions fairly based on Shapley values from game theory.

```python
from sagemaker.clarify import (
    SageMakerClarifyProcessor, BiasConfig, DataConfig, ModelConfig, SHAPConfig
)

bias_config = BiasConfig(
    label_values_or_threshold=[1],
    facet_name="gender",          # Sensitive attribute
    facet_values_or_threshold=[0],
)
shap_config = SHAPConfig(baseline=baseline_rows, num_samples=100)

clarify_processor.run_bias(data_config, bias_config, model_config)
clarify_processor.run_explainability(data_config, model_config, shap_config)
```

| Scope | What it tells you | Typical use |
|---|---|---|
| **Global importance** | How important a feature is on average across all the data | Model review, feature cleanup, hunting for proxy variables |
| **Local explanation** | Why this single prediction came out the way it did | Explaining individual decisions to customers and auditors |

Combined with SageMaker Model Monitor, you can also track changes in feature contributions during operation (**explainability drift**).

Bias and explainability are different problems. Bias metrics (DI, DPPL) answer the ethical/legal question "are outcomes fair across groups," while SHAP answers the trust/debugging question "why did this prediction come out?" That is why SHAP is also used to diagnose the *cause* of bias: it reveals which features act as proxies for sensitive attributes and create bias.

## Division of Roles Between the Two Services

This is the most confusing point on the exam. Separate them by keyword.

| Keyword/question | Service | When not to use it |
|---|---|---|
| Vanishing/exploding gradients, real-time overfitting detection | **Debugger** | Monitoring operational drift after deployment (→ Model Monitor) |
| Saving cost by automatically stopping training jobs | **Debugger** | Reducing inference cost (→ choosing inference options) |
| Capturing tensors/weights/activations | **Debugger** | Measuring outcome fairness by group |
| Measuring fairness across groups such as gender/race | **Clarify (bias)** | Diagnosing training convergence problems |
| Regulatory compliance, data and model bias reports | **Clarify (bias)** | Explaining the reason for an individual prediction (→ SHAP) |
| Feature contribution (SHAP), explaining predictions | **Clarify (explainability)** | When the group fairness figure itself is required |

## Error Analysis: Beyond the Metrics

Once you have the metrics and tools, the last step is the error analysis done by humans. You gather the cases the model got wrong and look for patterns.

```text
Error analysis flow:
1) Collect misclassified / large-error samples
2) Group by common traits (a specific class? a specific feature range? a specific group?)
3) Cause hypotheses: insufficient data / label noise / missing features / bias
4) Use SHAP to check which features contributed to that prediction
5) Improve data, features, and model starting with the largest error bucket
```

- **Example**: If "fraud detection recall plunges only on nighttime transactions," suspect too few nighttime samples or missing time-related features, and verify with SHAP.
- Error analysis tells you **"where to fix"** before you blindly spin hyperparameters.

| What the error bucket looks like | Likely cause | How to check |
|---|---|---|
| Performance plunges only in a certain time of day/region | Insufficient data in that range, missing features | Break down and compare sample counts and metrics by range |
| Only a certain class has poor recall | Class imbalance, label noise | `class_imbalance` rule, re-inspect labels |
| Results split by sensitive-attribute group | Bias, proxy variables | Clarify bias metrics + SHAP global importance |
| Evenly bad across all ranges | Training itself failed to converge | Debugger rules (loss, gradients) |

Good error analysis is prioritization that concentrates resources on the largest error bucket. Fixing a single pattern that accounts for 40% of errors (for example, a lack of data for a certain group) is more effective than vague tuning to raise overall accuracy by 1%. SHAP and bias metrics are tools for quantitatively identifying this bucket, and Debugger determines whether the cause lies in the training process itself.

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
     │     └─ Hunt for proxy variables of sensitive attributes
     │
 ⑤ Error analysis → return to ① starting with the largest error bucket
     │
 ⑥ After deployment: track drift and explainability drift with Model Monitor
```

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Reason |
|---|---|---|
| "Gradients converge to 0 and training stalls" | Debugger `vanishing_gradient` | Detecting tensor anomalies in the training process |
| "I want to cut a broken training job early to save GPU cost" | Debugger rule + automatic stop | A fired rule triggers job stop/notification |
| "Difference in positive prediction rates between gender groups for regulatory reporting" | Clarify post-training bias (DPPL, DI) | Group fairness of model predictions |
| "Label skew in the data before building the model" | Clarify pre-training bias (CI, DPL) | The stage that looks at the data itself |
| "Explain to the customer the reason for this one rejection" | Clarify SHAP **local** explanation | Feature contributions for an individual prediction |
| "Which features are important overall?" | Clarify SHAP **global** importance | Average contribution over all the data |
| "Accuracy by group is similar, so is it fair?" | **Pitfall**: check RD and DI as well | A minority group's FN is hidden behind accuracy |
| "Recall plunges only on nighttime transactions" | Identify the bucket with error analysis, then improve | Full retraining or random tuning is inefficient |
| "The input distribution of the deployed model changed" | Model Monitor | Debugger is for during training only |

Tomorrow we do a comprehensive review of all of Week 9 (classification/regression metrics, curves and thresholds, debugging and bias) as a single evaluation and debugging flow.

## 📖 Glossary

- **Vanishing gradient**: A phenomenon where the gradient propagated by backpropagation gets closer and closer to 0 so the early layers effectively don't learn.
- **Exploding tensor**: A state where values run away to NaN/Inf and training breaks.
- **Sensitive attribute (facet)**: A column that serves as the basis when assessing fairness, such as gender, race, or age. Specified in Clarify with `facet_name`.
- **CI (Class Imbalance)**: A pre-training bias metric that measures how skewed the sample counts per group are.
- **DPL / DPPL**: Difference in the proportion of positive **labels** between groups (pre-training) / difference in the proportion of positive **predictions** (post-training).
- **Disparate Impact (DI)**: The ratio of positive prediction rates between groups. Often used in regulatory compliance reports.
- **SHAP**: An explanation technique that uses Shapley values from game theory to split up "how much each feature pushed this prediction."
- **Global/local explanation**: The average contribution over all the data (global) / why one specific case came out that way (local).
- **Proxy**: A feature that effectively stands in for a sensitive attribute even without using it directly (for example, a postal code standing in for race).
- **Error bucket**: A group of errors that were wrong for similar reasons. Fixing the large buckets first is the knack of error analysis.

## 📝 Practice Questions

**Question 1.** In a deep learning training job, you want to automatically detect in real time the problem of gradients converging to 0 and training stalling, and stop the broken job early to save cost. Which service is appropriate?

A) SageMaker Clarify  
B) SageMaker Model Monitor  
C) SageMaker Ground Truth  
D) SageMaker Debugger  

**Answer: D**  
Explanation: Capturing tensors from the training process in real time (vanishing/exploding gradients, overfitting, and so on) and even automatically stopping with rules is Debugger. Clarify (A) is for bias/explainability, Model Monitor (B) is for operational drift, and Ground Truth (C) is a labeling service.

---

**Question 2.** You want to quantitatively measure, for regulatory compliance, whether a loan approval model's positive prediction rates differ greatly between gender groups. Which tool and metric type should you use?

A) Clarify's post-training bias metrics (for example, Disparate Impact)  
B) Debugger's vanishing_gradient rule  
C) RMSE  
D) Ground Truth label agreement rate  

**Answer: A**  
Explanation: Prediction fairness across groups is measured with Clarify's post-training bias metrics (DPPL, Disparate Impact, and so on). The Debugger rule (B) is for the training process, RMSE (C) is a regression error, and the label agreement rate (D) is labeling quality.

---

**Question 3.** You must explain to a customer "which feature contributed most to the decision in this specific loan rejection prediction." What is the most appropriate technique?

A) Debugger's overfit rule  
B) Clarify's SHAP values (local explanation)  
C) Confusion matrix  
D) ROC curve  

**Answer: B**  
Explanation: Explaining feature contributions for an individual prediction is exactly the role of the SHAP values (local explanation) that Clarify provides. The overfit rule (A) detects overfitting, and the confusion matrix (C) and ROC (D) are metrics that evaluate overall classification performance.

---

**Question 4.** Which is correct about the purpose of pre-training bias analysis?

A) To check whether the trained model's predictions are fair across groups  
B) To detect exploding gradients  
C) To check, before building the model, the skew in the label distribution across groups in the data itself  
D) To measure inference latency  

**Answer: C**  
Explanation: Pre-training bias measures, at the stage before the model is created, the skew in the per-group distribution/labels of the data itself (CI, DPL, and so on). The fairness of model predictions (A) is post-training bias, and gradients (B) and latency (D) are unrelated to bias analysis.

---

**Question 5.** A fraud detection model has good overall recall, but recall plunges only on "nighttime transactions." What is the most effective next step?

A) Use error analysis to identify the nighttime error bucket, check SHAP and whether data is insufficient, and improve starting with that bucket  
B) Immediately scrap the model and retrain from scratch  
C) Just randomly change the overall learning rate  
D) Look only at the accuracy metric and push ahead with deployment  

**Answer: A**  
Explanation: When performance is bad only in a certain range, it is effective to identify that bucket with error analysis, diagnose the SHAP/data-shortage cause, and improve it first. Full retraining (B) and random tuning (C) are inefficient, and deploying while ignoring the problem (D) is risky.

---
