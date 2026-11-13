# Day 1 - Classification Evaluation Metrics: Accuracy, Precision, Recall, F1, and the Confusion Matrix

## 📌 Key Takeaways

- Every binary classification metric is derived from the **four cells of the confusion matrix (TP/FP/FN/TN)**. Choosing a metric boils down to "which costs more, FP or FN."
- **Accuracy is trustworthy only on balanced data.** With 1% fraud, predicting everything as "normal" still yields 99% accuracy.
- **Precision = TP/(TP+FP)** is what you watch when reducing FP (spam, recommendations), and **recall = TP/(TP+FN)** is what you watch when reducing FN (disease, fraud).
- **F1 is a harmonic mean**, so it is sensitive to the lower side. With precision 0.9 and recall 0.1, F1 is not 0.5 but 0.18.
- In multiclass classification, use **Macro average** to reflect minority classes equally, Micro if you want an all-instances basis, and Weighted to reflect sample proportions.

## The Confusion Matrix: The Starting Point of Every Classification Metric

Once you've trained a model, you have to answer "is this model good enough" with numbers, and that number is not accuracy alone. Every binary classification metric is derived from one four-cell table.

```text
                Predicted: Positive    Predicted: Negative
Actual: Positive    TP (true positive)       FN (false negative)
Actual: Negative    FP (false positive)      TN (true negative)
```

| Cell | Meaning | Other name | Real-world name |
|---|---|---|---|
| **TP** | Correctly predicted a positive as positive | — | Caught fraud as fraud |
| **TN** | Correctly predicted a negative as negative | — | Let a normal transaction through |
| **FP** | Wrongly predicted a negative as positive | Type I error | False alarm |
| **FN** | Missed a positive by calling it negative | Type II error | Miss |

"Positive" is usually set as the **rare/important class** we want to detect (fraud, disease, churn). Which cell is expensive decides the metric choice.

### The Cost Perspective of FP and FN

| Domain | When FP occurs | When FN occurs | Which is costlier |
|---|---|---|---|
| Cancer screening | Unnecessary detailed tests, anxiety | Missing the patient puts life at risk | **FN** |
| Credit card fraud detection | Blocking a legitimate payment, customer complaints | Fraud loss occurs | **FN** (usually) |
| Spam filter | An important email lost to the spam folder | A few spam emails in the inbox | **FP** |
| Product recommendation | Trust drops from an off-target recommendation | A good product isn't shown | **FP** |
| Predictive maintenance | Inspection cost for healthy equipment | A failure left unattended → line stoppage | **FN** |

On the exam, metric-selection questions usually boil down to "which costs more, FP or FN." If FN — missing a disease — is fatal, prioritize recall; if FP — classifying a normal email as spam — is fatal, prioritize precision. The key is training yourself to translate the business context into one cell of the confusion matrix.

## Accuracy: The Most Intuitive but Most Dangerous Metric

```text
Accuracy = (TP + TN) / (TP + TN + FP + FN)
```

It is the proportion of correct predictions out of all predictions. It's excellent when classes are balanced, but powerless on imbalanced data.

```text
Example: 1% fraud transactions, 99% normal
A dummy model that predicts every transaction as "normal"
→ Accuracy = 99%  (yet it catches not a single fraud)
```

That 99% is no evidence at all that the model is useful. Why this happens is revealed immediately by the confusion matrix.

```text
[1% fraud, 10,000 samples / "all normal" dummy model]

                Predicted: fraud       Predicted: normal
Actual: fraud        TP = 0         FN = 100
Actual: normal        FP = 0         TN = 9,900

Accuracy  = (0 + 9,900) / 10,000 = 99.0%   ← looks great
Recall    = 0 / (0 + 100)        = 0.0%    ← the reality
Precision = 0 / (0 + 0)          = undefined
```

- Accuracy is high **because the numerator contains the huge TN**. Minority-class performance contributes almost nothing to the numerator.
- The accuracy baseline on imbalanced data is not 0 but the **majority class proportion** (99% here). If a model can't beat that baseline, it is meaningless.

> ⚠️ **Pitfall**: When a passage says "accuracy is 99.5%, so why is it a problem," the answer is almost always "extreme imbalance where predicting only the majority class gives that value." You must compare **against the class proportion**, not the accuracy figure itself.

## Precision and Recall

```text
Precision = TP / (TP + FP)      ← the share that are truly positive among predicted positives
Recall    = TP / (TP + FN)      ← the share caught among actual positives
```

| Metric | Denominator | Reading direction | What it reduces | Representative situation |
|---|---|---|---|---|
| **Precision** | Predicted positives (TP+FP) | A **column** of the confusion matrix | FP | Spam filter, product recommendation |
| **Recall** | Actual positives (TP+FN) | A **row** of the confusion matrix | FN | Cancer diagnosis, fraud detection |
| **Specificity** | Actual negatives (TN+FP) | The negative-side row | FP | Keeping normal as normal |

- Recall is the same thing as **Sensitivity** and **TPR (True Positive Rate)**. They appear on the exam with just the name changed.
- Specificity = `TN / (TN + FP)`, and `1 − specificity` is the FPR.

### The Trade-off

With precision and recall, raising one usually lowers the other. If you lower the threshold and classify more as Positive, recall goes up but precision drops.

```text
Lower threshold ──────────────────────────────→ Raise threshold
More Positive predictions                     Fewer Positive predictions
   Recall ↑  Precision ↓                    Precision ↑  Recall ↓
   FN down, FP up                          FP down, FN up

  Extreme: all Positive                      Extreme: all Negative
  Recall = 1.0, Precision = positive rate        Recall = 0, Precision = undefined
```

If you remember the denominators of precision and recall, you won't get confused. Precision's denominator is "predicted positives (TP+FP)" — column-wise accuracy based on predictions. Recall's denominator is "actual positives (TP+FN)" — row-wise hit rate based on actuals. In other words, precision measures the reliability of predictions, and recall measures the completeness of detection.

## F1 Score: The Harmonic Mean of Precision and Recall

```text
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

It merges precision and recall into one number, but uses the **harmonic mean rather than the arithmetic mean**. The harmonic mean is more sensitive to the smaller of the two values, so if only one is high and the other is low, the score gets cut sharply.

```text
Precision=0.9, Recall=0.1
Arithmetic mean = 0.5  (looks plausible)
F1 = 2 × (0.9 × 0.1) / (1.0) = 0.18  (reveals the reality)
```

- F1 weighs FP and FN about equally and is used as the **default metric when evaluating imbalanced data**.
- To weight one side, use the generalized **F-beta**: `F_β = (1+β²) × P × R / (β²×P + R)`.

| Metric | β | Side emphasized | When |
|---|---|---|---|
| F1 | 1 | Balance | FP and FN costs are similar |
| F2 | 2 | Recall | Detection that must not miss (disease, fraud) |
| F0.5 | 0.5 | Precision | When false positives are expensive (spam, recommendations) |

### Computing the Four Metrics From One Confusion Matrix

```text
[Fraud detection / 10,000 samples, 100 actual frauds]

                Predicted: fraud       Predicted: normal
Actual: fraud        TP = 60        FN = 40
Actual: normal        FP = 240       TN = 9,660

Accuracy    = (60 + 9,660) / 10,000        = 97.2%
Precision   = 60 / (60 + 240)              = 20.0%
Recall      = 60 / (60 + 40)               = 60.0%
Specificity = 9,660 / (9,660 + 240)        = 97.6%
F1          = 2 × (0.20 × 0.60) / 0.80     = 30.0%
```

- The 97.2% accuracy is actually **lower** than the "all normal" dummy's 99%. Looking at accuracy alone, you'd throw this model away.
- But the 60% recall means it actually caught 60 of the 100 frauds. This is the number to look at on imbalanced data.
- The 20% precision means only 1 in 5 alerts is real — whether you can afford the investigation staffing cost becomes input for the threshold decision.

## Metric Interpretation Table by Situation

| Situation | Class balance | Priority metric | Why accuracy can't be trusted |
|---|---|---|---|
| Fraud detection (0.5% positive) | Extreme imbalance | Recall → F1/F2 | Predicting all normal still gives 99.5% |
| Medical diagnostic screening | Imbalanced | Recall (sensitivity) | Low prevalence inflates accuracy |
| Spam filter | Moderate | Precision → F0.5 | Loss of legitimate emails barely registers in accuracy |
| Recommender system | Imbalanced | Precision (top K) | Most items are unseen, so TN dominates |
| Churn prediction | Imbalanced | Balance of recall + precision (F1) | Low churn rate makes accuracy meaningless |
| Image multiclass (balanced) | Balanced | Accuracy, Macro-F1 | (If balanced, accuracy is also valid) |
| Quality inspection (defect detection) | Extreme imbalance | Recall | If the defect rate is under 1%, accuracy is powerless |

### The Baseline of Dummy Models

When looking at a metric, you must compare it with "the score a do-nothing model gets." Let the positive rate be p.

| Dummy strategy | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Predict all Negative | 1 − p (**99%** if p=0.01) | Undefined | 0 | 0 |
| Predict all Positive | p | p | 1.0 | 2p/(1+p) |
| Random prediction (probability p) | Roughly 1 − 2p(1−p) | p | p | p |

> ⚠️ **Pitfall**: The baseline for accuracy is not 0.5 but the **majority class proportion**. In a problem with p=0.01, an accuracy of 98% is a model worse than the dummy. In contrast, the baselines for precision, recall, and F1 are as low as the level of p, so even on imbalanced data the margin of improvement shows through.

## Metric Selection Decision Tree

```
You need to evaluate a classification model
├─ Are the classes roughly balanced? (minority class ≳ 20%)
│    ├─ Yes → accuracy can be used (+ F1 as a supplement)
│    └─ No ↓
├─ Is the cost of FN (misses) overwhelming? (disease, fraud, defects)
│    ├─ Yes → prioritize recall, with a precision floor as a constraint (consider F2 too)
│    └─ No ↓
├─ Is the cost of FP (false positives) overwhelming? (spam, recommendation, auto-blocking)
│    ├─ Yes → prioritize precision (consider F0.5 too)
│    └─ No ↓
└─ Both matter about equally → F1 (Macro-F1 for multiclass)
```

## Averaging in Multiclass: Macro vs Micro vs Weighted

With three or more classes, you have to decide how to combine per-class precision/recall.

| Method | Computation | Characteristic |
|------|------|------|
| **Macro** | Simple average of per-class metrics | Treats minority classes equally → when minority classes matter under imbalance |
| **Micro** | Sum all TP/FP/FN, then compute | Large classes dominate → performance on an all-instances basis |
| **Weighted** | Average weighted by class sample count | Reflects class proportions |

```text
[Class A: 9,000 / Class B: 500 / Class C: 50]

Macro    : (F1_A + F1_B + F1_C) / 3   ← C carries the same weight as A
Weighted : F1 weighted 9000:500:50 ← A effectively decides the result
Micro    : sum all TP·FP·FN and compute once ← A dominates here too
```

If a passage says "I want to see minority-class performance equally too" and you pick Weighted, it's wrong. Weighted weights by sample count, so the majority class still dominates the result. Equal treatment is **Macro** only.

## Checking Metrics in SageMaker

Built-in algorithms and Automatic Model Tuning emit these metrics to CloudWatch and the training logs. An example of setting the tuning objective metric to F1 for XGBoost binary classification:

```python
from sagemaker.tuner import HyperparameterTuner

tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:f1",  # imbalanced data → optimize f1
    objective_type="Maximize",
    hyperparameter_ranges=ranges,
    max_jobs=20,
    max_parallel_jobs=3,
)
```

Setting `validation:f1` as the objective metric instead of `validation:accuracy` prevents the incident where the tuner ignores the imbalance and picks a model that only raises accuracy.

An evaluation metric is not just a scorecard after training ends; it is the **compass** of hyperparameter tuning. If you set `objective_metric_name` wrong, the tuner optimizes in exactly the wrong direction. So "what is the right objective metric for this business problem" is a modeling decision you must make before training.

## Passage Clue → Answer Mapping

| Passage clue | Answer to pick | Reason |
|---|---|---|
| "Positives are 0.5% yet accuracy is 99.5%" | Accuracy can't be trusted → precision/recall/F1 | A value you get just by predicting the majority class |
| "Missing a patient puts life at risk" | Recall | FN is in the denominator |
| "Great harm if a legitimate email goes to the spam folder" | Precision | FP is in the denominator |
| "We must care about both FP and FN" | F1 score | Balances both via the harmonic mean |
| "I want to emphasize recall more" | F2 (F-beta, β>1) | The larger β is, the more recall is weighted |
| "5 classes, reflect minority classes equally" | Macro average | Simple average of per-class metrics |
| "I'm curious about performance on an all-instances basis" | Micro average | Sum TP/FP/FN, then compute |
| "What should the tuning objective metric be" (imbalanced binary) | `validation:f1`, Maximize | An accuracy objective ignores the imbalance |
| "Precision 0.95, recall 0.10" | F1 ≈ 0.18, most positives missed | The harmonic mean is sensitive to the lower side |

Tomorrow we cover the ROC curve and PR curve, which visualize the precision-recall trade-off as you adjust the threshold, and AUC.

## 📖 Glossary

- **Confusion matrix**: A table crossing actual labels with predicted labels. Every classification metric comes from here.
- **TP / TN**: The count of positives correctly predicted as positive and negatives correctly predicted as negative.
- **FP (false positive, Type I error)**: Wrongly calling something that isn't so. A false alarm.
- **FN (false negative, Type II error)**: Missing something that is so by calling it not. A miss.
- **Precision**: Of what the model called "positive," the share that was actually right. The reliability of predictions.
- **Recall / sensitivity / TPR**: Of all actual positives, the share the model found. The completeness of detection.
- **Specificity**: Of actual negatives, the share correctly classified as negative. `TN/(TN+FP)`.
- **F1 score**: The harmonic mean of precision and recall. It is sensitive to the lower of the two, filtering out models that are good on only one side.
- **F-beta**: A generalization of F1. With β>1 it values recall more; with β<1 it values precision more.
- **Macro / Micro / Weighted average**: Three ways of combining per-class metrics in multiclass. Equal weighting / total aggregation / sample-count weighting, respectively.

## 📝 Practice Questions

**Question 1.** In a credit card fraud detection model, fraudulent transactions are 0.5% of the total. A model recorded 99.5% accuracy. What is the biggest reason this accuracy can't be trusted?

A) Because accuracy is a metric used only in regression  
B) Because accuracy is always computed lower than recall  
C) Because accuracy is meaningful only in multiclass  
D) Because it's an extreme imbalance where predicting every transaction as "normal" gives 99.5% accuracy  

**Answer: D**  
Explanation: If fraud is 0.5%, merely predicting everything as normal gives 99.5%, so accuracy doesn't reflect fraud-detection ability at all. Accuracy is a classification metric (A wrong), its size relative to recall can't be generalized (B wrong), and it is also used in binary classification (C wrong).

---

**Question 2.** You are evaluating a cancer screening model. Missing a patient (positive) by calling them normal (FN) is the most dangerous. Which metric should take priority?

A) Recall  
B) Precision  
C) Specificity  
D) Accuracy  

**Answer: A**  
Explanation: Since the goal is to reduce FN, prioritize recall (TP/(TP+FN)), which has FN in the denominator. Precision (B) is for reducing FP, specificity (C) focuses on hitting negatives, and accuracy (D) is inappropriate under imbalance.

---

**Question 3.** A model has precision 0.95 and recall 0.10. Roughly what is the F1 score that reflects the two in balance, and what does it imply?

A) About 0.53 — the arithmetic mean of the two metrics, so it's good  
B) About 0.18 — recall is very low, so it is missing most actual positives  
C) About 0.95 — precision is high, so it's excellent  
D) About 0.10 — F1 is always equal to recall  

**Answer: B**  
Explanation: F1 = 2×(0.95×0.10)/(0.95+0.10) ≈ 0.18; the harmonic mean is sensitive to the lower side (recall), revealing that it is missing most actual positives. It is not the arithmetic mean (A), it does not reflect only precision (C), and it isn't equal to recall either (D).

---

**Question 4.** In a spam filter, sending a legitimate email to the spam folder (FP) does the most harm to users. Which metric should take priority when evaluating the model?

A) Recall  
B) F2 score (recall-weighted)  
C) Precision  
D) The absolute count of FN  

**Answer: C**  
Explanation: Since the goal is to reduce FP, prioritize precision (TP/(TP+FP)), which has FP in the denominator. Recall (A) and F2 (B) emphasize FN/recall so they point the opposite way, and the FN count (D) measures misses, unrelated to this situation.

---

**Question 5.** In a multiclass problem with 5 classes where some classes have very few samples, you want to evaluate by reflecting minority-class performance equally. What averaging method is appropriate?

A) Micro average  
B) Plain accuracy  
C) Weighted average  
D) Macro average  

**Answer: D**  
Explanation: Macro average averages the per-class metrics with equal weight, so minority classes are reflected just like large classes. Micro (A) and Weighted (C) are dominated by classes with many samples, and accuracy (B) hides the imbalance.

---
