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

## 📝 연습 문제

[Questions in Korean, matching original pattern...]
