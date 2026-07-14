# Day 1 - Classification Evaluation Metrics: Accuracy, Precision, Recall, F1 and Confusion Matrix

Models trained and evaluated — but "is this model good enough?" requires quantifying. For classification, accuracy isn't one number. Especially in imbalanced problems (fraud 1%, disease diagnosis) accuracy is a trap. Today covers the **confusion matrix root**, then **precision, recall, F1**, when to use each based on business cost.

## Confusion Matrix: All Classification Metrics Stem Here

Binary classification's every metric derives from this 2×2 table.

```text
                Predicted: Positive    Predicted: Negative
Actual: Positive    TP (True Positive)   FN (False Negative)
Actual: Negative    FP (False Positive)  TN (True Negative)
```

- **TP**: Correctly predicted positive
- **TN**: Correctly predicted negative
- **FP**: Wrongly predicted positive (Type I error, false alarm)
- **FN**: Wrongly missed positive (Type II error, miss)

"Positive" usually means the rare/important class we detect (fraud, disease, churn). FP vs FN cost difference determines metric choice.

> 💡 **Related Theory**: ~80% of test metric-choice questions reduce to "FP vs FN — which costs more?" Miss disease (FN) is life-threatening, spam-marking legit email (FP) wastes trust. Convert business context into that one confusion cell.

## Accuracy: Intuitive but Dangerous

```text
Accuracy = (TP + TN) / (TP + TN + FP + FN)
```

Proportion of correct predictions. Great for balanced data, hopeless for imbalanced.

```text
Example: 1% fraud, 99% normal
Dummy model: "all normal"
→ Accuracy = 99%  (yet catches zero fraud)
```

That 99% is no proof model is useful. Imbalanced data demands precision/recall focus.

## Precision: Among Predicted Positives, What % Correct?

```text
Precision = TP / (TP + FP)
```

"Of what model calls Positive, how many truly are?" **Focus on reducing FP**.

- Spam filter: Marking legit email spam (FP) loses user trust → precision priority
- Recommendation: Wrong suggestions (FP) hurt credibility → precision priority

## Recall: Of Actual Positives, What % Did We Catch?

```text
Recall = TP / (TP + FN)
```

"Of actual Positives, did we find them all?" Also sensitivity, TPR. **Focus on reducing FN**.

- Cancer screening: Missed patient (FN) risks life → recall priority
- Fraud detection: Missed fraud (FN) causes loss → recall priority

Precision/recall usually trade off — lower threshold → more Positive predictions → recall up, precision down.

> 💡 **Related Theory**: Precision denominator = predicted positives (column TP+FP) — prediction-based accuracy. Recall denominator = actual positives (row TP+FN) — detection completeness. Precision = "of my calls, what fraction right?" Recall = "of truth, what fraction did I find?" 80% of metric confusion comes from swapping these definitions — nail both denominators

## F1 Score: Harmonic Mean of Precision and Recall

```text
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

Merge both metrics into one number, but **harmonic mean not arithmetic**. Harmonic is sensitive to smaller value — if one drops, F1 drops hard.

```text
Precision=0.9, Recall=0.1
Arithmetic mean = 0.5  (looks decent)
F1 = 2 × (0.9 × 0.1) / (1.0) = 0.18  (reveals truth)
```

F1 is default for imbalanced data treating FP and FN equally. Want weights → use **F-beta** (β>1 emphasizes recall, β<1 emphasizes precision).

## Multi-Class Averaging: Macro vs Micro vs Weighted

Classes ≥ 3? How to combine per-class precision/recall?

| Method | Calc | Traits |
|------|------|------|
| **Macro** | Simple average per-class metrics | Minority class treated equally → imbalance, minority important |
| **Micro** | Sum all TP/FP/FN, then calc | Big class dominates → instance-based performance |
| **Weighted** | Weight by class sample count | Reflect class proportions |

## SageMaker Metric Confirmation

Builtins and AMT export these metrics to CloudWatch, logs.

Example: XGBoost binary classification, set tuning objective to F1 on imbalanced:

```python
from sagemaker.tuner import HyperparameterTuner

tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:f1",  # imbalanced data → f1 not accuracy
    objective_type="Maximize",
    hyperparameter_ranges=ranges,
    max_jobs=20,
    max_parallel_jobs=3,
)
```

Picking `validation:accuracy` over `validation:f1` lets tuner chase imbalance-agnostic accuracy, picking bad models.

> 💡 **Related Theory**: Objective metric is tuning's **compass**. Pick wrong and tuner optimizes the wrong direction. "Which metric makes sense for this business?" is a **modeling decision made before tuning starts**, not after

## Summary

Classification evaluation rooted in confusion matrix. Accuracy only for balanced data, imbalanced → precision(FP-cost), recall(FN-cost), F1(both equal). Business context → one cell → metric. Tuning objective reflects this choice.

Next: ROC/PR curves, thresholds, AUC — understanding tradeoffs visually.

---

## 📝 연습 문제

[Questions 1-5 in Korean as per original...]
