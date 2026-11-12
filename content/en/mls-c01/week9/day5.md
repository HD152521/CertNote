# Day 5 - Week 9 Review: Evaluation and Debugging

This week covered the final stage of Domain 3 (Modeling) — **how to evaluate and debug models**. After choosing an algorithm (Week 6) and training/tuning it (Weeks 7-8), we must now answer "is this model truly good, where and how does it fail" with numbers and tools. Today we tie four days into one evaluation-debugging flow and organize the trickiest choices.

## One-Page Summary: Evaluation to Debugging

```text
[Trained model]
   │
   ├─ 1) Determine metric family by problem type
   │     Classification → accuracy/precision/recall/F1, ROC-AUC, PR-AUC
   │     Regression → RMSE/MAE/MAPE/R²
   │
   ├─ 2) Select metrics and thresholds by business cost
   │     FN deadly → recall / lower threshold
   │     FP deadly → precision / raise threshold
   │     Imbalance → F1, PR-AUC (ban accuracy)
   │
   ├─ 3) Analyze trade-offs with curves
   │     ROC/AUC = discrimination, model comparison
   │     PR curve = honest on extreme imbalance
   │
   └─ 4) Debug, bias, error analysis
         Debugger = training process (gradients/loss/overfitting)
         Clarify = bias (group fairness) + SHAP (explainability)
         Error analysis = improve from largest error bucket
```

## Classification Metrics (Day1~2)

| Metric | Formula Denominator | When |
|------|------|------|
| Accuracy | All | Balanced data only, ban on imbalance |
| Precision | TP+FP (predicted positive) | High FP cost (spam) |
| Recall | TP+FN (actual positive) | High FN cost (disease/fraud) |
| F1 | Harmonic mean | Balance FP·FN, imbalanced data |
| ROC-AUC | TPR vs FPR area | Threshold-independent model comparison |
| PR-AUC | Precision vs Recall area | Honest on extreme imbalance |

## Regression Metrics (Day3)

| Metric | Character | Signal |
|------|------|------|
| MAE | Robust to outliers, intuitive unit | Ignore outliers |
| RMSE | Sensitive to large errors (squared) | Large mistakes catastrophic, built-in default |
| MAPE | Scale-independent relative error | Compare across scales (watch y=0) |
| R² | Explanatory power vs mean | Negative = worse than mean |

Residual plot: random scatter=good, U-shape=missed nonlinearity, funnel=heteroscedasticity, skew=bias.

## Debugging, Bias (Day4)

| Keyword | Service |
|------|------|
| Vanishing/exploding gradients, overfitting, tensor capture, auto-stop job | **Debugger** |
| Group fairness, Disparate Impact, pre/post-training bias | **Clarify (bias)** |
| SHAP, feature contribution, prediction explanation | **Clarify (explainability)** |

> 💡 **Related Theory**: The single principle threading this week is **"metrics translate business cost."** Same model, high FP cost → focus precision; high FN cost → focus recall; imbalance → ditch accuracy for F1/PR-AUC. In regression too: big mistakes catastrophic → RMSE; outliers noise → MAE. Metric selection almost always reduces to "which mistake costs more in this business?"

## Trickiest Comparisons

| Comparison | Core Difference |
|------|------|
| Precision vs Recall | Reduce FP / Reduce FN |
| Accuracy vs F1 | Balanced data / Imbalanced data |
| ROC vs PR curves | General / Extreme imbalance (no TN in denominator) |
| AUC vs threshold choice | Model comparison / Operational cut decision |
| RMSE vs MAE | Emphasize large errors / Robust to outliers |
| R² positive vs negative | Better than mean / Worse than mean |
| Debugger vs Clarify | Training process health / Bias & explainability |
| Clarify bias vs SHAP | Group fairness / Prediction explanation |
| Classification tuning vs regression tuning | Maximize (F1/AUC) / Minimize (RMSE) |

> 💡 **Related Theory**: Model evaluation and threshold decision are separate stages. Use threshold-independent metrics like AUC to pick a "good-ranking model" first, then post-hoc pick threshold matching FP/FN costs on top. This separation lets you adjust threshold alone if cost structure changes, no model retraining. Exam splits "model comparison=AUC, operational cut=one point on curve" for this reason.

## Self-Check Questions

Try answering in your head:

1. Fraud is 0.5% but accuracy is 99.5%, why not trust it? → **Classify all as normal = 99.5%, imbalance**
2. When missing fraud (FN) is deadly, priority metric? → **Recall**
3. On extreme imbalance, more honest curve than ROC? → **PR curve (PR-AUC)**
4. If RMSE much larger than MAE? → **Large errors (outlier residuals) present**
5. If R² negative? → **Worse than predicting mean**
6. Residual plot U-shaped? → **Missed nonlinearity, review features/model**
7. Service that auto-detects vanishing gradients during training? → **SageMaker Debugger**
8. Measure prediction fairness across groups? → **SageMaker Clarify (bias metrics)**
9. Explain feature contribution for single prediction? → **Clarify SHAP values**
10. Regression tuning objective direction? → **Minimize (RMSE, etc)**

## Exam Tips Summary

- **Step 1**: Classification or regression? → pick metric family.
- **Step 2**: By FP vs FN cost, choose precision/recall/F1; on imbalance, ditch accuracy.
- See "imbalance" word? Accuracy option = wrong, F1/PR-AUC = right.
- "Compare models / discrimination" = AUC; "operational threshold" = min-cost point on curve.
- Regression: "big mistakes catastrophic"=RMSE, "outliers noise"=MAE, "scale-different"=MAPE.
- "Gradients/loss/overfitting/tensors"=Debugger, "fairness/groups/SHAP"=Clarify → instant answer.
- Tuning direction: classification metrics Maximize, error metrics Minimize.

## Summary

Week 9 was the final modeling step — "score and fix models." Define metric family by problem type, pick precision/recall/F1·threshold by business cost, read trade-offs with curves (ROC/PR). Then use Debugger for training process, Clarify for bias and explainability, error analysis for biggest error buckets. Core principles: **"metrics translate business cost"**, "classification Maximize / regression Minimize", "Debugger=process / Clarify=bias·explainability".

Next week (Week 10) shifts to Domain 4 — actually **deploying, operating, monitoring** models.

---

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
