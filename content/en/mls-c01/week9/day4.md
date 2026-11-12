# Day 4 - Model Debugging and Bias: SageMaker Debugger and Clarify

Beyond good metrics, models can break silently (vanishing gradients during training), favor some groups unfairly, or stay black boxes. AWS addresses three layers: (1) **Debugger** watches training health, (2) **Clarify** measures fairness and explains predictions, (3) error analysis humanly groups failures. Today we distinguish and apply each.

## SageMaker Debugger: Training Process Health

Captures tensors (weights, gradients, loss, activations) during training, **auto-detect anomalies** via rules.

- **Built-in rules**: `vanishing_gradient`, `exploding_tensor`, `overfit`, `overtraining`, `loss_not_decreasing`, `class_imbalance`, `saturated_activation`
- Rule breach → CloudWatch event → alert or early-stop
- Tensors to S3 for post-hoc analysis

```python
from sagemaker.debugger import Rule, rule_configs

rules = [
    Rule.sagemaker(rule_configs.vanishing_gradient()),
    Rule.sagemaker(rule_configs.loss_not_decreasing()),
]
est = Estimator(..., rules=rules)
```

Signal: "Auto-detect gradient issues, overfitting, stalled loss during run" → **Debugger**

## SageMaker Clarify: Bias and Explainability

Two jobs: **bias measurement** and **SHAP-based explanations**. Essential in regulated/fairness-sensitive domains.

### Pre-Training Bias

Before model training, measure data itself. Sensitive attribute (gender, race, age) vs label distribution skew?

```text
- CI (Class Imbalance): Underrepresentation of groups
- DPL (Difference in Positive Proportions in Labels): Group label rate gap
- KL/JS Divergence: Label distribution distance between groups
```

### Post-Training Bias

After training, measure **predictions**. Fair across groups?

```text
- DPPL (Difference in Positive Proportions Predicted): Group prediction rate gap
- DI (Disparate Impact): Ratio of positive prediction rates
- RD (Recall Difference): Group recall gap
- AD (Accuracy Difference): Group accuracy gap
```

Even fair data can let models amplify bias.

### SHAP Explanations

SHAP computes "how much did each feature push this prediction, in what direction?" Uses game theory Shapley values fairly distributing feature contribution.

```python
from sagemaker.clarify import SageMakerClarifyProcessor, BiasConfig, SHAPConfig

bias_config = BiasConfig(
    label_values_or_threshold=[1],
    facet_name="gender",          # sensitive attribute
    facet_values_or_threshold=[0],
)
shap_config = SHAPConfig(baseline=baseline_rows, num_samples=100)

clarify_processor.run_bias(data_config, bias_config, model_config)
clarify_processor.run_explainability(data_config, model_config, shap_config)
```

SHAP gives **global** (model-wide feature importance) and **local** (why this prediction?) explanations. Paired with Model Monitor, track whether SHAP shifts (explanation drift).

> 💡 **Related Theory**: Bias and explainability differ. Bias metrics ("groups unequal?") answer ethics/law. SHAP ("why predict?") answers trust/debugging. SHAP also diagnoses bias → which features proxy sensitive attributes?

## Role Separation

Most confusion point in tests:

| Keyword | Purpose | Service |
|------|------|------|
| Gradient vanishing/explosion, overfitting, training stall | **Training process health** | **Debugger** |
| Vanishing during run, auto-stop bad jobs | Training-time anomaly | **Debugger** |
| Gender/race fairness, group outcome gaps, regulation | **Fairness/compliance** | **Clarify (bias)** |
| Explain individual predictions, feature attribution, SHAP | **Interpretability** | **Clarify (explanation)** |

## Error Analysis: Human Grouping Beyond Scores

After metrics, Debugger, Clarify, last layer is people. Group misclassified/high-residual samples, find patterns.

```text
Error analysis flow:
1) Collect wrong/big-error samples
2) Group by traits (class? feature range? group?)
3) Hypothesis: data sparsity / label noise / missing feature / bias
4) SHAP + bias metrics diagnose root
5) Fix highest-error bucket first
```

E.g., "fraud detection recall drops at night" → suspect nocturnal sample sparsity or shifted patterns → SHAP inspection → add time features or nocturnal-specific data.

> 💡 **Related Theory**: Best error analysis prioritizes. Fixing the 40%-of-errors bucket beats random tuning. SHAP and bias metrics are tools that 让你 identify buckets, error analysis focuses resources.

## Summary

Three layers: (1) **Debugger** = training process health, (2) **Clarify** = fairness & explainability, (3) **error analysis** = human judgment. Keyword trap: gradients/overfit/loss = Debugger, bias/fairness/SHAP = Clarify.

Next: Week 9 recap — classification/regression/debugging.

---

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
