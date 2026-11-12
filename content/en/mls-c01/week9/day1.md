# Day 1 - Classification Evaluation Metrics: Accuracy, Precision, Recall, F1 and Confusion Matrix

## 📌 Key Takeaways

- Every binary classification metric is derived from the **four cells of the confusion matrix (TP/FP/FN/TN)**. Choosing a metric reduces to "which costs more, FP or FN?"
- **Accuracy can be trusted only on balanced data.** In a 1%-fraud dataset, labeling everything "normal" still yields 99% accuracy.
- **Precision = TP/(TP+FP)** is for reducing FP (spam, recommendations); **recall = TP/(TP+FN)** is for reducing FN (disease, fraud).
- **F1 is a harmonic mean**, so it is sensitive to the lower value. With precision 0.9 and recall 0.1, F1 is not 0.5 but 0.18.
- In multi-class classification, use **Macro averaging** to reflect minority classes equally, Micro for an all-instances basis, and Weighted to reflect sample proportions.

## Confusion Matrix: The Starting Point of All Classification Metrics

Once you have trained a model, you must answer "is this model good enough?" in numbers, and that number is not accuracy alone. Every binary classification metric is derived from a single four-cell table.

```text
                Predicted: Positive    Predicted: Negative
Actual: Positive    TP (true positive)    FN (false negative)
Actual: Negative    FP (false positive)   TN (true negative)
```

| Cell | Meaning | Other name | Real-world name |
|---|---|---|---|
| **TP** | Correctly predicted a positive as positive | — | Catching fraud as fraud |
| **TN** | Correctly predicted a negative as negative | — | Letting a normal transaction through |
| **FP** | Wrongly predicted a negative as positive | Type I error | False alarm |
| **FN** | Missed a positive by predicting negative | Type II error | Miss |

"Positive" is usually set to the **rare/important class** we want to detect (fraud, disease, churn). Which cell is expensive determines the choice of metric.

### The Cost View of FP and FN

| Domain | If an FP occurs | If an FN occurs | Costlier side |
|---|---|---|---|
| Cancer screening | Unnecessary detailed tests, anxiety | A patient is missed, life at risk | **FN** |
| Credit card fraud detection | A legitimate payment is blocked, customer complaint | Fraud loss occurs | **FN** (usually) |
| Spam filter | An important email is lost to the spam folder | A few spam emails reach the inbox | **FP** |
| Product recommendation | Irrelevant recommendations erode trust | A good product is not shown | **FP** |
| Predictive equipment maintenance | Inspection cost for healthy equipment | A failure is left alone → line stoppage | **FN** |

On the exam, metric-selection questions usually reduce to "which costs more, FP or FN?" If FN (missing a disease) is fatal, prioritize recall; if FP (classifying a legitimate email as spam) is fatal, prioritize precision. The key skill is translating the business context into one cell of the confusion matrix.

## Accuracy: The Most Intuitive but Most Dangerous Metric

```text
Accuracy = (TP + TN) / (TP + TN + FP + FN)
```

It is the proportion of all predictions that were correct. It works well when classes are balanced but is powerless on imbalanced data.

```text
Example: fraud 1%, normal 99%
A dummy model that labels every transaction "normal"
→ Accuracy = 99%  (yet it catches not a single fraud)
```

This 99% is no evidence at all that the model is useful. Why this happens becomes immediately clear from the confusion matrix.

```text
[Fraud 1%, 10,000 samples / "all normal" dummy model]

                Predicted: Fraud    Predicted: Normal
Actual: Fraud     TP = 0             FN = 100
Actual: Normal    FP = 0             TN = 9,900

Accuracy  = (0 + 9,900) / 10,000 = 99.0%   ← looks great
Recall    = 0 / (0 + 100)        = 0.0%    ← the reality
Precision = 0 / (0 + 0)          = undefined
```

- Accuracy is high **because the numerator contains the huge TN**. Minority-class performance barely contributes to the numerator.
- The accuracy baseline on imbalanced data is not 0 but the **majority-class proportion** (99% here). A model that cannot beat that baseline is meaningless.

> ⚠️ **Trap**: When a passage asks "accuracy is 99.5%, so why is that a problem?", the answer is almost always "extreme imbalance, where just predicting the majority class gives that value." You must compare against the **class proportion**, not look at the accuracy number itself.

## Precision and Recall

```text
Precision = TP / (TP + FP)      ← share of predicted positives that are truly positive
Recall    = TP / (TP + FN)      ← share of actual positives that were caught
```

| Metric | Denominator | Direction of reading | What it reduces | Typical situation |
|---|---|---|---|---|
| **Precision** | Predicted positives (TP+FP) | **Column** of the confusion matrix | FP | Spam filter, product recommendation |
| **Recall** | Actual positives (TP+FN) | **Row** of the confusion matrix | FN | Cancer diagnosis, fraud detection |
| **Specificity** | Actual negatives (TN+FP) | The negative-side row | FP | Keeping normal cases classified as normal |

- Recall is the same thing as **sensitivity** and **TPR (True Positive Rate)**. They appear on the exam with just the name changed.
- Specificity = `TN / (TN + FP)`, and `1 − specificity` is exactly the FPR.

### The Trade-off

With precision and recall, raising one usually lowers the other. If you lower the threshold to classify more cases as Positive, recall rises but precision falls.

```text
Lower the threshold ──────────────────────────────→ Raise the threshold
More Positive predictions                       Fewer Positive predictions
   Recall ↑  Precision ↓                          Precision ↑  Recall ↓
   FN down, FP up                                 FP down, FN up

  Extreme: all Positive                          Extreme: all Negative
  Recall = 1.0, Precision = positive rate        Recall = 0, Precision = undefined
```

Remembering the denominators of precision and recall keeps them from getting confused. Precision's denominator is "predicted positives (TP+FP)" — a column-wise accuracy based on predictions. Recall's denominator is "actual positives (TP+FN)" — a row-wise hit rate based on reality. In other words, precision measures the reliability of predictions, and recall measures the completeness of detection.

## F1 Score: The Harmonic Mean of Precision and Recall

```text
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

It combines precision and recall into one number, but uses the **harmonic mean rather than the arithmetic mean**. The harmonic mean is more sensitive to the smaller of the two values, so if only one is high and the other is low, the score is cut sharply.

```text
Precision=0.9, Recall=0.1
Arithmetic mean = 0.5  (looks plausible)
F1 = 2 × (0.9 × 0.1) / (1.0) = 0.18  (reveals the reality)
```

- F1 treats FP and FN as similarly important and is the **default metric when evaluating imbalanced data**.
- To weight one side, use the generalized **F-beta**: `F_β = (1+β²) × P × R / (β²×P + R)`.

| Metric | β | Side emphasized | When |
|---|---|---|---|
| F1 | 1 | Balance | FP and FN costs are similar |
| F2 | 2 | Recall | Detection that must not be missed (disease, fraud) |
| F0.5 | 0.5 | Precision | When false alarms are expensive (spam, recommendations) |

### Computing Four Metrics from One Confusion Matrix

```text
[Fraud detection / 10,000 samples, 100 actual frauds]

                Predicted: Fraud    Predicted: Normal
Actual: Fraud     TP = 60            FN = 40
Actual: Normal    FP = 240           TN = 9,660

Accuracy    = (60 + 9,660) / 10,000        = 97.2%
Precision   = 60 / (60 + 240)              = 20.0%
Recall      = 60 / (60 + 40)               = 60.0%
Specificity = 9,660 / (9,660 + 240)        = 97.6%
F1          = 2 × (0.20 × 0.60) / 0.80     = 30.0%
```

- Accuracy of 97.2% is actually **lower** than the 99% of the "all normal" dummy. Looking only at accuracy, you would throw this model away.
- But recall of 60% means 60 of the 100 frauds were actually caught. This is the number to look at under imbalance.
- Precision of 20% means only 1 in 5 alerts is real — whether you can afford the investigator cost becomes the material for deciding the threshold.

## Metric Interpretation Table by Situation

| Situation | Class balance | Priority metric | Why accuracy cannot be trusted |
|---|---|---|---|
| Fraud detection (0.5% positive) | Extreme imbalance | Recall → F1/F2 | 99.5% even if everything is labeled normal |
| Medical screening | Imbalanced | Recall (sensitivity) | Low prevalence inflates accuracy |
| Spam filter | Moderate | Precision → F0.5 | Loss of legitimate email barely registers in accuracy |
| Recommendation system | Imbalanced | Precision (top K) | Most items are unseen, so TN dominates |
| Churn prediction | Imbalanced | Balance of recall + precision (F1) | Low churn rate makes accuracy meaningless |
| Image multi-class classification (balanced) | Balanced | Accuracy, Macro-F1 | (If balanced, accuracy is valid too) |
| Quality inspection (defect detection) | Extreme imbalance | Recall | Accuracy is powerless when the defect rate is under 1% |

### Baselines for Dummy Models

When you look at a metric, you should compare it with "the score a model that does nothing would get." Let the positive rate be p.

| Dummy strategy | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Predict all Negative | 1 − p (**99%** if p=0.01) | Undefined | 0 | 0 |
| Predict all Positive | p | p | 1.0 | 2p/(1+p) |
| Random prediction (probability p) | Roughly 1 − 2p(1−p) | p | p | p |

> ⚠️ **Trap**: The baseline for accuracy is not 0.5 but the **majority-class proportion**. In a problem with p=0.01, accuracy of 98% is a model worse than the dummy. In contrast, the baselines for precision, recall, and F1 are as low as p, so the improvement is visible even under imbalance.

## Metric Selection Decision Tree

```
You need to evaluate a classification model
├─ Are the classes roughly balanced? (minority class ≳ 20%)
│    ├─ Yes → accuracy is usable (plus F1 as a supplement)
│    └─ No ↓
├─ Is the cost of FN (misses) overwhelming? (disease, fraud, defects)
│    ├─ Yes → prioritize recall, with a precision floor as a constraint (consider F2 too)
│    └─ No ↓
├─ Is the cost of FP (false alarms) overwhelming? (spam, recommendations, automatic blocking)
│    ├─ Yes → prioritize precision (consider F0.5 too)
│    └─ No ↓
└─ Both matter about equally → F1 (Macro-F1 for multi-class)
```

## Averaging in Multi-Class: Macro vs Micro vs Weighted

With three or more classes, you must decide how to combine per-class precision/recall.

| Method | Calculation | Characteristics |
|------|------|------|
| **Macro** | Simple average of per-class metrics | Treats minority classes equally → when minority classes matter under imbalance |
| **Micro** | Sum all TP/FP/FN, then compute | Large classes dominate → performance on an all-instances basis |
| **Weighted** | Weighted average by class sample count | Reflects class proportions |

```text
[Class A: 9,000 / Class B: 500 / Class C: 50]

Macro    : (F1_A + F1_B + F1_C) / 3   ← C carries the same weight as A
Weighted : F1 weighted by 9000:500:50 ← A effectively decides the result
Micro    : Sum all TP·FP·FN and compute once ← A dominates here too
```

Choosing Weighted for a passage that says "we want to see minority-class performance equally" is wrong. Weighted weights by sample count, so the majority class still dominates the result. Only **Macro** treats classes equally.

## Checking Metrics in SageMaker

Built-in algorithms and Automatic Model Tuning emit these metrics to CloudWatch and the training logs. An example of setting the tuning objective metric to F1 in XGBoost binary classification:

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

Setting `validation:f1` rather than `validation:accuracy` as the objective metric prevents the accident of the tuner picking a model that ignores imbalance and only raises accuracy.

An evaluation metric is not just a scorecard after training ends; it is the **compass** of hyperparameter tuning. If you set `objective_metric_name` wrongly, the tuner optimizes in exactly the wrong direction. So "what is the right objective metric for this business problem?" is a modeling decision to be made before training.

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Reason |
|---|---|---|
| "Positives are 0.5% but accuracy is 99.5%" | Accuracy is unreliable → precision/recall/F1 | The value appears even by predicting only the majority class |
| "Missing a patient puts a life at risk" | Recall | FN is in the denominator |
| "Normal email going to the spam folder is very damaging" | Precision | FP is in the denominator |
| "We need to care about both FP and FN" | F1 score | The harmonic mean balances both |
| "We want to emphasize recall more" | F2 (F-beta, β>1) | The larger the β, the more weight on recall |
| "5 classes, reflect minority classes equally" | Macro average | Simple average of per-class metrics |
| "Curious about performance on an all-instances basis" | Micro average | Sum TP/FP/FN, then compute |
| "What should the tuning objective metric be" (imbalanced binary) | `validation:f1`, Maximize | An accuracy objective ignores imbalance |
| "Precision 0.95, recall 0.10" | F1 ≈ 0.18, most positives missed | The harmonic mean is sensitive to the lower side |

Tomorrow we cover the ROC curve and PR curve, which visualize the precision-recall trade-off as the threshold is adjusted, along with AUC.

## 📖 Glossary

- **Confusion matrix**: A table crossing actual labels with predicted labels. All classification metrics come from it.
- **TP / TN**: The counts where positives were correctly identified as positive and negatives as negative.
- **FP (false positive, Type I error)**: Wrongly calling something positive that is not. A false alarm.
- **FN (false negative, Type II error)**: Missing something that is positive by calling it negative. A miss.
- **Precision**: The share of what the model called "positive" that was actually correct. The reliability of predictions.
- **Recall / sensitivity / TPR**: The share of all actual positives that the model found. The completeness of detection.
- **Specificity**: The share of actual negatives correctly classified as negative. `TN/(TN+FP)`.
- **F1 score**: The harmonic mean of precision and recall. It is sensitive to the lower of the two, filtering out models that are good on only one side.
- **F-beta**: A generalization of F1. With β>1 it weights recall more; with β<1 it weights precision more.
- **Macro / Micro / Weighted average**: Three ways to combine per-class metrics in multi-class settings. Equal weight / pooled totals / sample-count weight, respectively.

## 📝 Practice Questions

**Question 1.** In a credit card fraud detection model, fraudulent transactions are 0.5% of the total. One model recorded 99.5% accuracy. What is the main reason this accuracy cannot be trusted?

A) Accuracy is a metric used only in regression  
B) Accuracy is always calculated lower than recall  
C) Accuracy is meaningful only for multi-class problems  
D) The data is so extremely imbalanced that labeling every transaction "legitimate" also yields 99.5% accuracy  

**Answer: D**  
Explanation: If fraud is 0.5%, simply predicting everything as legitimate gives 99.5%, so accuracy reflects none of the fraud-detection ability. Accuracy is a classification metric (A is wrong), its relationship to recall cannot be generalized (B is wrong), and it is also used for binary classification (C is wrong).

---

**Question 2.** You are evaluating a cancer screening model. Missing a patient (positive) by labeling them normal (FN) is the most dangerous outcome. Which metric should be prioritized?

A) Recall  
B) Precision  
C) Specificity  
D) Accuracy  

**Answer: A**  
Explanation: The goal is to reduce FN, so prioritize recall (TP/(TP+FN)), which has FN in the denominator. Precision (B) is for reducing FP, specificity (C) focuses on hitting negatives, and accuracy (D) is inappropriate for imbalanced data.

---

**Question 3.** A model has a precision of 0.95 and a recall of 0.10. Roughly what is the F1 score that balances the two, and what does it imply?

A) About 0.53 — a good arithmetic mean of the two metrics  
B) About 0.18 — recall is very low, so most actual positives are being missed  
C) About 0.95 — excellent because precision is high  
D) About 0.10 — F1 is always equal to recall  

**Answer: B**  
Explanation: F1 = 2×(0.95×0.10)/(0.95+0.10) ≈ 0.18, and because the harmonic mean is sensitive to the lower value (recall), it reveals that most actual positives are being missed. It is not the arithmetic mean (A), it does not reflect only precision (C), and it is not equal to recall (D).

---

**Question 4.** In a spam filter, sending legitimate mail to the spam folder (FP) causes the greatest harm to users. Which metric should be prioritized when evaluating the model?

A) Recall  
B) F2 score (recall-weighted)  
C) Precision  
D) Absolute number of FN  

**Answer: C**  
Explanation: The goal is to reduce FP, so prioritize precision (TP/(TP+FP)), which has FP in the denominator. Recall (A) and F2 (B) emphasize FN/recall, which is the opposite direction, and the FN count (D) measures omissions and is unrelated to this situation.

---

**Question 5.** In a multi-class classification problem with 5 classes where some classes have very few samples, you want to evaluate so that minority-class performance is reflected equally. Which averaging method is appropriate?

A) Micro average  
B) Simple accuracy  
C) Weighted average  
D) Macro average  

**Answer: D**  
Explanation: Macro average takes an equally weighted average of the per-class metrics, so minority classes are reflected just as much as large classes. Micro (A) and Weighted (C) are dominated by classes with many samples, and accuracy (B) masks imbalance.
