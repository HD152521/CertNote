# Day 2 - ROC/AUC and Threshold Adjustment: Reading Model Performance with Curves

Yesterday's precision and recall were single slices at a specific threshold (usually 0.5). But classification models don't output 0 or 1 — they output **probability scores**, and where you cut that score completely changes precision and recall. Today we cover ROC curves and PR curves that sweep the threshold from 0 to 1 to draw full performance, and AUC that summarizes curves into a single number. The core question is "where do we set the threshold?" and the answer comes from business trade-offs.

## What Threshold Changes

A classifier outputs a score like `P(Positive) = 0.73`. Set threshold t: if `score ≥ t`, classify as Positive.

```text
Threshold ↓ (e.g., 0.3)  → classify more as Positive
   → recall ↑ (catch more positives), precision ↓ (more FP)

Threshold ↑ (e.g., 0.7)  → classify more conservatively as Positive
   → precision ↑ (only sure ones), recall ↓ (miss more positives)
```

So a single model has countless (precision, recall) pairs depending on threshold. The curve unfolds all these pairs in one diagram.

## ROC Curve: TPR vs FPR

The ROC (Receiver Operating Characteristic) curve plots two axes as threshold moves.

```text
Y-axis: TPR (recall)      = TP / (TP + FN)   ← How many positives caught
X-axis: FPR (false pos rate) = FP / (FP + TN)   ← How many negatives falsely alarmed

(0,0) Classify everything as Negative (threshold=1)
(1,1) Classify everything as Positive (threshold=0)
Closer to top-left (0,1) = better model
Diagonal y=x = random guess level
```

Better models have curves spiking toward the top-left corner, rapidly raising TPR while barely increasing FPR.

## AUC: Area Under the Curve

AUC (Area Under the Curve) summarizes model performance as **threshold-independent** single number 0~1 below the ROC curve.

```text
AUC = 1.0   Perfect classification
AUC = 0.5   Random guess (diagonal)
AUC < 0.5   Worse than random (flip predictions to improve)
```

Intuitive AUC interpretation: **probability that a randomly chosen positive's score exceeds a randomly chosen negative's score**. It measures how well the model "ranks" positives vs negatives. Useful for comparing model discrimination before choosing threshold.

> 💡 **Related Theory**: AUC's threshold-independence is a double-edged sword. Convenient for comparing multiple models' discrimination at once, but in real operations you eventually pick one threshold. So exam questions split: "compare models" → use AUC; "set operational threshold" → pick a point on ROC/PR curve.

## PR Curve: More Honest than ROC on Imbalanced Data

PR (Precision-Recall) curve plots recall on X-axis, precision on Y-axis. On extremely imbalanced data, PR curves give a more honest picture than ROC.

```text
Why: ROC's FPR = FP / (FP + TN)
When negatives vastly dominate (imbalance), even if FP grows,
it's buried in the huge TN denominator, so FPR barely changes.
→ ROC looks overly optimistic

PR curve's precision = TP / (TP + FP)
FP increase directly reflects in precision → exposes imbalance pain fully
```

So for problems where positives are rare (fraud, disease), prioritize **PR AUC (Average Precision)**.

> 💡 **Related Theory**: The basis for "imbalance → PR curve" is the denominator. ROC's FPR includes majority class (TN) in denominator, diluting FP increases; PR's precision denominator is only (TP+FP), so false alarms in minority class show clearly. By examining what goes in the denominator, you judge which curve is trap-resistant.

## Threshold Selection: Business Trade-offs

After drawing the curve, operationalize with a threshold. Methods vary by business cost structure.

```python
import numpy as np
from sklearn.metrics import precision_recall_curve

precision, recall, thresholds = precision_recall_curve(y_true, y_scores)

# Example: Regulated environment mandating ≥90% recall
#     → Among thresholds meeting constraint, pick highest precision
mask = recall[:-1] >= 0.90
best_idx = np.argmax(precision[:-1][mask])
chosen_threshold = thresholds[mask][best_idx]
```

Representative selection strategies:

| Situation | Threshold Strategy |
|------|------|
| High FN cost (disease/fraud) | Guarantee recall floor → lower threshold |
| High FP cost (spam/recommendations) | Guarantee precision floor → raise threshold |
| Balance FP·FN | Pick F1 maximization point |
| Cost quantifiable in dollars | Minimize expected cost `cost_FP×FP + cost_FN×FN` |

Expected cost minimization is most principled. Given dollar costs per FP and FN, calculate total cost at each threshold on the curve, pick cheapest point.

## Using in SageMaker

Built-in binary classifiers export `validation:auc` as a training metric, usable as objective for Automatic Model Tuning. Also, SageMaker endpoints return probability scores, so threshold cutting happens in inference post-processing.

```python
tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:auc",  # tune by discrimination
    objective_type="Maximize",
    hyperparameter_ranges=ranges,
)
# Endpoint returns 0.0~1.0 scores → apply business threshold in post-process
score = float(predictor.predict(payload))
label = 1 if score >= chosen_threshold else 0
```

Real-world pattern: pick good model using AUC, then separately choose threshold to fit business constraints — **2-stage separation**.

> 💡 **Related Theory**: Model training/tuning and threshold decision are separate decision stages. Tuning with AUC as objective yields a "good-ranking model" immune to threshold gyration; then post-hoc pick threshold matching cost structure on top of that model. This separation means if cost structure changes, retune threshold only, no model retraining needed.

## Summary

Classifiers output probabilities; thresholds convert probabilities to labels. ROC curve shows TPR vs FPR for model discrimination; PR curve shows precision vs recall for imbalance reality. AUC summarizes curves into one threshold-independent number for model comparison; actual operational threshold is one point on the curve, determined by FP/FN costs. With severe imbalance, trust PR curves over ROC.

Tomorrow we shift from classification to regression model metrics — RMSE, MAE, MAPE, R² and residual analysis.

---

## 📝 Practice Questions

**Question 1.** You lowered a classification model's threshold from 0.5 to 0.3. What change generally occurs?

A) Recall tends to increase and precision tends to decrease  
B) Both precision and recall increase  
C) Recall decreases and precision increases  
D) Neither metric changes  

**Answer: A**  
Explanation: Lowering the threshold classifies more samples as positive, catching more positives (recall up) but also increasing false positives (precision down), creating a trade-off. Both increasing (B) and recall decreasing (C) have the wrong direction, and changing the threshold does change the metrics (D is wrong).

---

**Question 2.** What does an AUC of 0.5 on an ROC curve mean?

A) The model classifies perfectly  
B) The data is perfectly balanced  
C) Precision and recall are equal  
D) The model's discriminative power is at the level of random guessing  

**Answer: D**  
Explanation: An AUC of 0.5 corresponds to the diagonal of the ROC and is equivalent to ranking positives and negatives randomly - meaningless discriminative power. Perfect is 1.0 (A), and it has nothing to do with data balance (B) or precision = recall (C).

---

**Question 3.** This is an extremely imbalanced fraud detection problem in which the positive class is 0.3% of the total. Which metric is more honest than ROC-AUC for evaluating model performance?

A) Simple accuracy  
B) FPR alone  
C) AUC of the PR curve (Average Precision)  
D) Training loss  

**Answer: C**  
Explanation: When negatives (TN) are overwhelming, the ROC's FPR dilutes the increase in FP and looks optimistic, so AP of the PR curve, which has no TN in its denominator, is more honest. Accuracy (A) masks imbalance, and FPR alone (B) and training loss (D) are inappropriate as performance summary metrics.

---

**Question 4.** You can estimate the cost of one FP and the cost of one FN in monetary terms. What is the most principled way to choose the operating threshold?

A) Always fix it at 0.5  
B) Find the threshold that maximizes AUC  
C) Find the threshold that unconditionally makes recall 1.0  
D) Find the threshold that minimizes the expected cost `cost_FP×FP + cost_FN×FN`  

**Answer: D**  
Explanation: If you know the costs in monetary terms, the most principled approach is to compute the total expected cost at each threshold on the curve and pick the minimum point. Fixing 0.5 (A) ignores cost, AUC is independent of the threshold so it cannot determine a threshold (B), and recall of 1.0 (C) sacrifices precision and makes cost explode.

---

**Question 5.** You want to compare the discriminative power of several candidate models with one number, independent of the threshold. Which is the MOST appropriate objective metric for SageMaker Automatic Model Tuning?

A) validation:accuracy  
B) validation:auc  
C) train:loss  
D) Number of FN at a fixed threshold  

**Answer: B**  
Explanation: AUC summarizes a model's ranking discriminative power from 0 to 1 independent of the threshold, so it suits model comparison and as a tuning objective metric. Accuracy (A) is weak on imbalance, training loss (C) does not reflect generalization, and FN at a specific threshold (D) is threshold-dependent.

---
