# Day 4 - Model Evaluation: Metric Selection, Overfitting, Cross-validation, Confusion Matrix

Training ends doesn't mean model is good. Judging by one number "95% accuracy" is risky—on data where fraud is 1%, saying "all normal" yields 99% accuracy. Model evaluation's essence is measuring "generalization performance" with "problem-fitting metrics".

In the MLA-C01 exam, evaluation appears as "which metric on imbalanced data", "how to diagnose and mitigate overfitting", "compute precision/recall from confusion matrix". Today we cover metric selection, overfitting/underfitting, cross-validation, confusion matrix—four axes.

## Confusion Matrix and Classification Metrics

Classification evaluation starts with the confusion matrix. Binary classification splits prediction vs actual into four cells:

```
                  Actual Positive    Actual Negative
Predicted Positive    TP (true pos)      FP (false pos)
Predicted Negative    FN (false neg)     TN (true neg)
```

Key metrics emerge from here:

| Metric | Formula | Answers |
|---|---|---|
| Accuracy | (TP+TN)/total | Proportion correct of all |
| Precision | TP/(TP+FP) | Of positives predicted, true positive ratio |
| Recall | TP/(TP+FN) | Of actual positives, caught ratio |
| F1 | 2·P·R/(P+R) | Harmonic mean precision·recall |

Core intuition: **Precision when "want to reduce false alarms", Recall when "can't miss"**. Spam filter values precision (misfiltering good mail is bad), cancer diagnosis values recall (missing patient is fatal).

> 💡 **Related Theory**: Precision and recall are inherently tradeoff. Lower threshold classifies more positive, raising recall but increasing false positives, lowering precision. PR curve shows full spectrum, ROC curve plots TPR vs FPR varying threshold. AUC (area under curve) is "probability random positive scores higher than random negative", representing comprehensive discrimination power independent of single threshold.

## Metric Selection on Imbalanced Data

Why accuracy is risky: class imbalance. On data 1% fraud, 99% normal—"all normal" prediction gives 99% accuracy but catches zero fraud, useless model.

- **Imbalanced data**: Instead of accuracy use **F1, AUC(ROC), AUC-PR**, recall/precision.
- **Rare positive, can't miss (fraud·disease)**: Emphasize recall or AUC-PR.
- **False alarm cost high (spam)**: Emphasize precision.

```python
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score

print(confusion_matrix(y_true, y_pred))
print(classification_report(y_true, y_pred))   # precision/recall/f1
print("AUC:", roc_auc_score(y_true, y_prob))    # probability-based
```

> ⚠️ **Pitfall**: On imbalanced data, a choice claiming "99% accuracy" as proof model is good is a trap. When exam shows keywords "fraud/anomaly/rare disease", pick F1·recall·AUC not accuracy. Also ROC-AUC can look optimistic on extreme imbalance; when positive very rare, AUC-PR (precision-recall curve) is more honest.

## Regression Metrics

Regression (continuous value prediction) uses different metrics:

| Metric | Characteristics |
|---|---|
| MAE (mean absolute error) | Average error magnitude. Insensitive to outliers, intuitive interpretation |
| MSE / RMSE | Squared error. Sensitive to large errors (outlier penalty large) |
| R² (coefficient of determination) | Proportion variance model explains (closer to 1 better) |
| MAPE | Percentage error. Scale-independent comparison |

Intuition: **RMSE to heavily penalize large errors, MAE to reduce outlier impact.** How much predicted explains actual is R².

> 💡 **Related Theory**: RMSE more sensitive to outliers than MAE because errors are squared. One error of 10 contributes 100 to RMSE but 10 to MAE. So large errors deadly (e.g., demand forecast stock-out)→ use RMSE; all errors equally valued → use MAE. This links to loss function choice—training to minimize RMSE makes model biased to avoid large errors.

## Overfitting and Underfitting

Model evaluation's other axis: generalization. Fits training data perfectly but fails on new data = overfitting.

| State | Training Perf | Validation/Test Perf | Diagnosis |
|---|---|---|---|
| Underfitting | Low | Low | Model too simple/underlearned (high bias) |
| Good fit | High | High | Balanced |
| Overfitting | Very high | Low | Model memorized training (high variance) |

Diagnosis: Training good but validation bad and gap wide → **overfitting**. Both bad → **underfitting**.

Mitigating overfitting:
- More data, data augmentation
- Regularization (L1/L2), dropout
- Reduce model complexity, early stopping
- Reduce feature count

Mitigating underfitting:
- Increase model complexity, train longer
- Better features, relax regularization

> 📚 **Case**: Team trained image classifier getting 99% train accuracy, 70% validation accuracy—big gap. Typical overfitting. Adding data augmentation (rotate·flip) and dropout, setting early stopping made train 95%/validation 91%, gap smaller, better generalization. Lesson: train-validation gap is overfitting's key signal; regularization·augmentation·early stopping are standard remedy.

## Cross-validation

Single train/test split's evaluation wobbles by split luck. **k-fold cross-validation** splits data into k pieces, uses each once as validation and rest for training, averaging k performances. Especially stable evaluation on small data.

```
k=5 example:
Fold1: [validation][train][train][train][train]
Fold2: [train][validation][train][train][train]
...    → 5 training/evaluations then average
```

- **Stratified k-fold**: Each fold preserves class ratio—critical for imbalanced classification.
- **Time series data**: Must use time-series split (preserves past→future order) avoiding future leakage. Random k-fold unfit for time series.

> 💡 **Related Theory**: Cross-validation's value is reducing evaluation variance. Single train/test split is luck-dependent estimate (high variance). k-fold averages multiple splits, lowering variance, using data for both training and validation, efficiently using limited data. Note: larger k repeats training k times, increasing cost; time-series and ordered-meaning data's random splits leak future, inflating evaluation.

## Summary

Model evaluation measures "generalization" via "problem-fitting metrics". **Classification** extracts precision (suppress false alarm), recall (prevent miss), F1, AUC from confusion matrix; imbalanced data uses F1·recall·AUC not accuracy. **Regression** uses RMSE (large error sensitive), MAE (outlier insensitive), R². **Overfitting** diagnosed by train-validation gap, mitigated by regularization, augmentation, early stopping. **Cross-validation (k-fold)** reduces eval variance; imbalanced uses stratified, time-series uses time-split. Exams target patterns: "imbalance→accuracy trap", "large error→RMSE", "train-validation gap→overfitting".

Next we synthesize Week 5—custom training, distributed training, debugging·profiling, evaluation.

---

## 📝 Practice Questions

**Question 1.** You are evaluating a model on a highly imbalanced dataset in which fraudulent transactions are 1% of the total. Which of the following is the LEAST appropriate metric for judging model performance?

A) F1 score  
B) Recall  
C) Plain accuracy  
D) AUC-PR  

**Answer: C**  
Explanation: With a 1% positive imbalance, simply predicting "everything is legitimate" yields 99% accuracy, so accuracy distorts model quality. F1, recall, and AUC-PR reflect how well the rare positives are caught and so suit imbalanced evaluation; therefore the least appropriate is plain accuracy.

---

**Question 2.** In a cancer screening model, missing actual patients (false negatives) is the most dangerous. Which metric should be raised first?

A) Precision  
B) Recall  
C) Training speed  
D) GPU utilization  

**Answer: B**  
Explanation: Recall is the proportion of actual positives (patients) that the model catches, and it is prioritized in situations where misses are unacceptable (minimizing false negatives). A is a metric for reducing false positives and has a different focus, and C and D are related to training efficiency and resources rather than being evaluation metrics.

---

**Question 3.** A model has 99% training accuracy but 70% validation accuracy, a large gap between the two. What are the diagnosis and the appropriate mitigation?

A) Underfitting, so make the model simpler  
B) Overfitting, so apply regularization, dropout, data augmentation, and early stopping  
C) It is normal, so deploy as is  
D) Use the training data as-is for validation too  

**Answer: B**  
Explanation: High training performance, low validation performance, and a large gap is classic overfitting, and generalization is improved with regularization, dropout, augmentation, and early stopping. A is a remedy for underfitting, so its direction is the opposite, C ignores the generalization failure, and D is a flawed evaluation that causes data leakage.

---

**Question 4.** In a regression model, you want to evaluate and optimize so as to avoid large errors by strongly penalizing rarely occurring large prediction errors. Which metric is appropriate?

A) MAE  
B) RMSE  
C) Accuracy  
D) Recall  

**Answer: B**  
Explanation: RMSE squares the errors, so it imposes a larger penalty on large errors and suits the goal of avoiding them. A (MAE) is linear in the error and therefore relatively insensitive to large errors, and C and D are classification metrics that do not fit regression evaluation.

---

**Question 5.** With little data, the evaluation from a single train/test split fluctuates greatly depending on the luck of the split. What is a method for stable evaluation?

A) Average the performance over multiple splits with k-fold cross-validation  
B) Include the test set in training  
C) Skip evaluation and deploy right away  
D) Make training and testing use the same data  

**Answer: A**  
Explanation: k-fold cross-validation splits the data into multiple folds, alternately validating and training, and averages the results to reduce evaluation variance and use limited data efficiently. B and D inflate performance through data leakage, and C is a wrong choice that gives up evaluation itself.

---
