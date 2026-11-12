# Day 5 - Week 9 Comprehensive Review: Evaluation and Debugging

## 📌 Key Takeaways

- Week 9 is the final stage of Domain 3 (Modeling) — how to answer, with numbers and tools, **"is this model really good, and where and how does it go wrong?"**
- One principle runs through it: **a metric is a translation of business cost.** If FP is expensive, use precision; if FN is expensive, use recall; if the data is imbalanced, drop accuracy and go to F1/PR-AUC.
- **Model comparison and threshold decisions are separate stages.** First pick a model that ranks well by AUC, then set the cut that fits the cost afterward.
- For regression: "big mistakes are fatal = RMSE, outliers are noise = MAE, comparing different scales = MAPE," and read bias, nonlinearity, and heteroscedasticity from residual plots.
- Tool division: **"gradients/loss/overfitting/tensors = Debugger, fairness/groups/SHAP = Clarify"**; tuning direction is **classification Maximize / error Minimize**.

## Flow Map: From Evaluation to Debugging

If you have chosen an algorithm (Week 6) and trained and tuned it (Weeks 7-8), what remains is grading and repair. Weaving four days into one flow gives the following.

```text
[Trained model]
   │
   ├─ 1) Decide the metric family by problem type
   │     classification → accuracy/precision/recall/F1, ROC-AUC, PR-AUC
   │     regression     → RMSE/MAE/MAPE/R²
   │
   ├─ 2) Choose metric and threshold by business cost
   │     FN is fatal → recall / threshold ↓
   │     FP is fatal → precision / threshold ↑
   │     imbalanced  → F1, PR-AUC (no accuracy)
   │
   ├─ 3) Analyze the tradeoff with curves
   │     ROC/AUC = discriminative power, model comparison
   │     PR curve = honest under extreme imbalance
   │
   └─ 4) Debugging, bias, and error analysis
         Debugger = the training process (gradients/loss/overfitting)
         Clarify  = bias (group fairness) + SHAP (explanation)
         error analysis = improve starting with the biggest error buckets
```

## Classification Metrics Master Table (Day 1-2)

| Metric | Formula denominator | When | Representative scenario | Blind spot of this metric |
|---|---|---|---|---|
| **Accuracy** | Total | Balanced data only, forbidden for imbalanced | Problems where classes are close to 5:5 | Comes out high even by predicting only the majority class |
| **Precision** | TP+FP (predicted positives) | When FP cost is high | Spam classification (blocking legitimate mail is fatal) | Doesn't look at missed positives (FN) at all |
| **Recall** | TP+FN (actual positives) | When FN cost is high | Disease/fraud detection (missing is fatal) | Becomes 1.0 if you predict everything positive |
| **F1** | Harmonic mean | FP/FN balance, imbalanced data | Imbalance with no stated cost asymmetry | Can't reflect which side is more expensive |
| **ROC-AUC** | Area of TPR vs FPR | Threshold-independent model comparison | Choosing among several candidate models | Looks optimistic under extreme imbalance |
| **PR-AUC** | Area of Precision vs Recall | Honest under extreme imbalance | Fraud detection with 0.5% positives | Absolute comparison across models is data-dependent |

### Threshold and Curves

| Item | ROC curve | PR curve |
|---|---|---|
| Axes | TPR vs FPR | Precision vs Recall |
| TN in the denominator | Included (in FPR) | **Not included** |
| Strength | General comparison of model discrimination | Doesn't inflate performance under extreme imbalance |
| When imbalanced | FPR looks small thanks to the many negatives, so optimistic | Honest because it looks only at the few positives |

- **Threshold ↓** → recall ↑, precision ↓ (you miss less, but false alarms increase)
- **Threshold ↑** → precision ↑, recall ↓ (positive only when sure, but more misses)

### Where Each Metric Looks on the Confusion Matrix

```
                 Actual positive   Actual negative
             ┌───────────────┬───────────────┐
Pred. pos.   │      TP       │      FP       │  ← Precision = TP / (TP+FP)
             ├───────────────┼───────────────┤
Pred. neg.   │      FN       │      TN       │
             └───────────────┴───────────────┘
                     ↑
             Recall = TP / (TP+FN)

  Accuracy = (TP+TN) / total   ← if TN dominates, everything is inflated here
  ROC's FPR = FP / (FP+TN)     ← TN in the denominator → looks small under imbalance
  PR curve                     ← doesn't use TN at all → honest
```

### Cost Asymmetry → Metric and Threshold

| Business situation | More expensive mistake | Priority metric | Threshold |
|---|---|---|---|
| Disease-diagnosis screening | FN (missed patient) | Recall | Lower it |
| Fraudulent-transaction detection | FN (fraud that got through) | Recall / PR-AUC | Lower it |
| Spam classification | FP (blocked legitimate mail) | Precision | Raise it |
| Automatic account suspension | FP (unjust suspension) | Precision | Raise it |
| Cost asymmetry not stated | Can't judge | F1 | Start from the default |

> ⚠️ **Trap**: If the word "imbalanced" appears in the question, **the accuracy option is wrong**. In a 0.5% fraud problem, predicting everything as normal still gives 99.5% accuracy.

## Regression Metrics Master Table (Day 3)

| Metric | Character | Cue | Caution |
|---|---|---|---|
| **MAE** | Robust to outliers, intuitive units | When you want to ignore outliers | Doesn't treat large errors specially |
| **RMSE** | Sensitive to large errors (squared) | Big mistakes are fatal, built-in default | Swung heavily by a few outliers |
| **MAPE** | Scale-free relative error | Comparing items of different scales | **Blows up near y=0** |
| **R²** | Explanatory power relative to the mean | Reporting explanatory power as one number | **If negative, worse than the mean line** |

### Reading Residual Plots

| Residual shape | Diagnosis | Next step |
|---|---|---|
| Random scatter | Good | Proceed as is |
| U-shaped curve | Nonlinearity not captured | Review feature transforms / nonlinear models |
| Funnel shape | Heteroscedasticity | Consider log-transforming the target, weighted regression |
| Skewed to one side | Systematic bias | Check for missing features or an intercept problem |

> 💡 **Concept**: The **gap between RMSE and MAE is itself information.** If the two are similar, errors are spread evenly; if RMSE is much larger, it signals that a few large errors (outlier-like residuals) exist.

## Debugging and Bias (Day 4)

| Keyword | Service | What it does |
|---|---|---|
| Vanishing/exploding gradients, overfitting, tensor capture, automatic job stop | **Debugger** | Watches training tensors with rules, stops broken jobs |
| Group fairness, Disparate Impact, pre-/post-training bias | **Clarify (bias)** | Measures skew in data and predictions across groups |
| SHAP, feature attribution, prediction explanation | **Clarify (explainability)** | Global importance + the reason for an individual prediction |
| Errors concentrated in a specific range | **Error analysis** (human) | Group into buckets, then improve starting with the largest bucket |

The single principle running through this week is **"a metric is a translation of business cost."** Even for the same model, you look at precision if FP is expensive and recall if FN is expensive, and if the data is imbalanced you drop accuracy and go to F1/PR-AUC. In regression too, RMSE if big mistakes are fatal, MAE if outliers are noise. Metric-selection questions almost always reduce to "which mistake is more expensive in this business?"

## Metric Selection Decision Tree

```
What is the problem type?
├─ Regression
│   ├─ Are large errors especially fatal?
│   │     ├─ Yes → RMSE (tuning direction Minimize)
│   │     └─ No ↓
│   ├─ Do you see outliers as noise and want to ignore them? → MAE
│   ├─ Comparing items of different scales together?          → MAPE (watch y=0)
│   └─ Reporting explanatory power as one number?             → R² (negative = worse than the mean)
│
└─ Classification
    ├─ Are the classes severely imbalanced?
    │     ├─ Yes → no accuracy. F1 / PR-AUC
    │     └─ No ↓
    ├─ Is FN more expensive? (missing disease/fraud is fatal)
    │     └─ Yes → recall first + threshold ↓
    ├─ Is FP more expensive? (blocking legitimate users is fatal)
    │     └─ Yes → precision first + threshold ↑
    ├─ Is the cost asymmetry unclear?                    → F1
    └─ Comparing several models independent of threshold? → ROC-AUC
          └─ Then set the operating cut at the expected-cost-minimizing point on the curve
```

## The Most Confusing Comparisons

| Comparison | Key difference |
|------|------|
| Precision vs recall | Reduce FP / reduce FN |
| Accuracy vs F1 | Balanced data / imbalanced data |
| ROC vs PR curve | General / extreme imbalance (no TN in the denominator) |
| AUC vs threshold selection | Model comparison / deciding the operating cut |
| RMSE vs MAE | Emphasizes large errors / robust to outliers |
| Positive vs negative R² | Better than the mean / worse than the mean |
| Debugger vs Clarify | Health of the training process / bias and explanation |
| Clarify bias vs SHAP | Group fairness / prediction explanation |
| Classification tuning vs regression tuning | Maximize (F1/AUC) / Minimize (RMSE) |

Model evaluation and threshold decisions are separate stages. First pick a "well-ranking model" using a threshold-independent metric like AUC, then set the threshold that fits the FP/FN cost afterward. Thanks to this separation, even if the cost structure changes, you only need to adjust the threshold without retraining the model. This is why on the exam it splits into "model comparison = AUC, operating cut = one point on the curve."

## Commonly Missed Traps

| How you go wrong | Why it's wrong | Correct judgment |
|---|---|---|
| Evaluating imbalanced data with accuracy | High even if only the majority class is right | F1 / PR-AUC / precision and recall together |
| Trusting only ROC-AUC under extreme imbalance | The large TN in the FPR denominator makes it optimistic | Look at the PR curve as well |
| Fixing the threshold first, then choosing a model | An order that ignores the cost structure | Model by AUC → threshold decided afterward |
| Pushing only recall all the way up | Predicting everything positive gives 1.0 | Together with the tradeoff against precision |
| Finalizing a model on RMSE alone | Swung by a few outliers | Together with the gap to MAE and residual plots |
| Always blaming the data when R² is low | A negative value means the model is worse than the mean | Re-examine the features and the model itself |
| Maximizing the objective metric for regression tuning | Smaller error is better | RMSE is **Minimize** |
| Diagnosing a training failure with Clarify | Clarify handles bias and explanation | Gradients and loss are **Debugger** |
| Measuring group fairness with Debugger | Debugger handles the training process | Fairness is a **Clarify bias metric** |

## Self-Check Questions

Try to recall the answers in your head.

1. Why can't you trust 99.5% accuracy when fraud is 0.5%? → **Predicting everything normal gives 99.5%; imbalance**
2. When FN, missing a disease, is fatal, what is the priority metric? → **Recall**
3. Which curve is more honest than ROC under extreme imbalance? → **PR curve (PR-AUC)**
4. If RMSE is much larger than MAE? → **Large errors (outlier-like residuals) exist**
5. If R² is negative? → **Worse than predicting the mean line**
6. If the residual plot is a U-shaped curve? → **Nonlinearity not captured; re-examine features/model**
7. Which service automatically detects vanishing gradients during training? → **SageMaker Debugger**
8. Measuring prediction fairness across groups? → **SageMaker Clarify (bias metrics)**
9. Explaining the feature contributions of an individual prediction? → **Clarify's SHAP values**
10. What is the direction of the objective metric for regression tuning? → **Minimize (RMSE, etc.)**

## Question Cue → Answer Mapping

| Question cue | Answer to pick | Reason |
|---|---|---|
| "Classes are imbalanced 95:5" | F1 / PR-AUC (the accuracy option is wrong) | Accuracy is high even if only the majority class is right |
| "We must not miss disease/fraud" | Recall first, threshold ↓ | FN cost dominates |
| "We must not block legitimate users" | Precision first, threshold ↑ | FP cost dominates |
| "No mention of which mistake is more expensive + imbalanced" | F1 | Harmonic mean of precision and recall |
| "Compare several candidate models by discriminative power" | ROC-AUC | Ranking quality independent of the threshold |
| "We need to set the operating threshold" | Expected-cost-minimizing point on the curve | Evaluation and the cut decision are separate stages |
| "Big prediction mistakes are fatal" | RMSE | Squaring amplifies large errors |
| "Many outliers make the metric fluctuate" | MAE | Absolute error, so robust to outliers |
| "Compare stores and items of different scales together" | MAPE | Relative error, so scale-free (watch y=0) |
| "The model is worse than the mean prediction" | Negative R² | A state that failed to beat the baseline (the mean) |
| "Residuals are funnel-shaped" | Heteroscedasticity | Variance changes with the predicted value |
| "We want to catch vanishing gradients and overfitting during training" | SageMaker Debugger | Watches training tensors with rules |
| "Report the approval-rate difference between gender groups" | Clarify bias metrics (DPPL, DI) | Group fairness of predictions |
| "Explain the reason for this one decision" | Clarify SHAP (local) | Feature contributions for an individual prediction |
| "Performance drops sharply only in a specific range" | Error analysis → improve starting with the largest bucket | Full retraining or random tuning is inefficient |
| "Direction of the objective metric in Automatic Model Tuning" | RMSE = Minimize, F1/AUC = Maximize | Errors small, performance large |

From next week (Week 10), we move on to Domain 4 (Machine Learning Implementation and Operations) — the stage of actually deploying, operating, and monitoring models.

## 📖 Glossary

- **TP / FP / FN / TN**: Positives correctly caught / positives wrongly flagged / positives missed / negatives correctly filtered. The raw material of every classification metric.
- **Precision**: The share of actual positives among those called positive. "Did we avoid false flags?"
- **Recall**: The share of actual positives that were caught. "Did we avoid missing any?"
- **F1 score**: The harmonic mean of precision and recall. The score doesn't rise if only one side is high.
- **ROC-AUC**: The area under the TPR-FPR curve when all thresholds are swept. The model's ability to rank.
- **PR-AUC**: The area under the precision-recall curve. More honest than ROC when negatives overwhelmingly dominate.
- **Threshold**: The cut that splits a probability output into positive/negative. Lowering it raises recall; raising it raises precision.
- **MAPE**: The average of relative error, the error divided by the actual value. Used for comparing items of different scales, but watch out for y=0.
- **R² (coefficient of determination)**: A value showing how much better the model is than "guessing the mean." If negative, it means worse than the mean.
- **Residual**: Actual value − predicted value. Its pattern reveals structural defects in the model.

## 📝 Practice Questions

**Question 1.** You want to evaluate a model on a churn prediction problem with a 95:5 class imbalance. Which of the following evaluation approaches is the LEAST appropriate?

A) Look at the F1 score  
B) Look at the AUC of the PR curve  
C) Judge by simple accuracy alone  
D) Look at recall and precision together  

**Answer: C**  
Explanation: On imbalanced data, accuracy comes out high even if only the majority class is predicted correctly, overestimating model performance, so judging by it alone is inappropriate. F1 (A), PR-AUC (B), and precision/recall (D) are metrics suited to imbalance.

---

**Question 2.** You want to compare several candidate classification models by discriminative power independent of the threshold, and then set the operating threshold separately according to FP/FN costs. What is the correct approach?

A) Compare all models only by accuracy at a threshold of 0.5  
B) Choose the model by AUC, and decide the threshold afterward as the point on the curve with minimum expected cost  
C) Fix the threshold at 0.9 first and then choose the model  
D) Compare classification models by RMSE  

**Answer: B**  
Explanation: AUC suits threshold-independent discriminative power comparison, and the standard approach is the two-stage separation in which the operating threshold is decided afterward on the curve according to the cost structure. Accuracy at 0.5 (A) and fixing the threshold first (C) ignore cost, and RMSE (D) is a regression metric.

---

**Question 3.** Comparing two regression models, Model A has similar RMSE and MAE, while Model B has an RMSE much larger than its MAE. What can be inferred from this?

A) Model B likely has a few large errors (outlier-like residuals)  
B) Model A is a classification model  
C) Model B's R² is necessarily negative  
D) The two models are exactly identical  

**Answer: A**  
Explanation: RMSE amplifies large errors by squaring them, so a large RMSE-MAE gap suggests a high likelihood of a few large errors. The type of metric does not determine the model type (B), the sign of R² is a separate matter (C), and since the metrics differ, the models are not identical (D).

---

**Question 4.** Which of the following pairings of SageMaker service and role is INCORRECT?

A) Debugger - detects vanishing gradients/overfitting in real time during training  
B) Clarify - measures bias between groups (Disparate Impact)  
C) Clarify - explains feature contributions to individual predictions with SHAP  
D) Debugger - measures fairness of model predictions between gender groups  

**Answer: D**  
Explanation: Measuring prediction fairness between groups is Clarify's role, while Debugger deals with tensors/loss during the training process. A, B, and C are all correct pairings.

---

**Question 5.** Which is the correct objective metric direction (objective_type) setting in SageMaker Automatic Model Tuning?

A) Regression validation:rmse -> Maximize  
B) Classification validation:f1 -> Minimize  
C) Regression validation:rmse -> Minimize, classification validation:auc -> Maximize  
D) All metrics are always Maximize  

**Answer: C**  
Explanation: Error metrics (RMSE) are better when smaller, so Minimize; performance metrics (F1, AUC) are better when larger, so Maximize. RMSE Maximize (A) and F1 Minimize (B) have the direction reversed, and Maximize for all metrics (D) is wrong for error metrics.

---
