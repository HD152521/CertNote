# Day 4 - Handling Class Imbalance: Over/Undersampling, SMOTE, Class Weights, Evaluation

Most real classification problems are **imbalanced**. Fraud is 0.1%, disease positive is 2%, churn is 5%—the minority class is what we actually want to catch. Training on raw imbalanced data causes models to achieve high accuracy just by predicting all majority class.

Today we explore why imbalance is a trap, and how to handle it via **resampling (over/undersampling)**, **SMOTE**, **class weights**, and **metric selection**. This is a frequently-tested MLS-C01 domain.

## The Imbalance Trap: Accuracy Paradox

With 2% positive data, predicting "all negative" yields 98% accuracy—yet catches zero positives we care about. This is the **accuracy paradox**.

| Metric | Definition | Meaning in Imbalance |
|------|------|-------------------|
| Accuracy | (TP+TN)/total | Biased toward majority, misleading |
| Precision | TP/(TP+FP) | Ratio of true among positive predictions |
| Recall | TP/(TP+FN) | Ratio of positives caught |
| F1 | Harmonic mean of precision/recall | Balanced tradeoff |
| PR-AUC | Precision-recall curve area | More sensitive in imbalance than ROC |

> 💡 **Key Theory**: In imbalanced data, **PR-AUC is more useful than ROC-AUC**. ROC's x-axis (False Positive Rate) has a huge denominator of negatives (TN+FP), diluting minority class errors. PR curves focus on positives, so they're sensitive to minority class performance shifts. Thus "for sparse positives like fraud, evaluate with PR-AUC" is standard.

## Data-Level Remedy: Resampling

### Oversampling (Increase Minority)

- **Random oversampling**: Duplicate minority samples → overfitting risk (repeated points)
- **SMOTE**: Interpolate between minority samples to create synthetic ones → diversity maintained

### Undersampling (Reduce Majority)

- **Random undersampling**: Remove some majority samples → information loss risk
- For very large data, undersampling accelerates training

```python
from imblearn.over_sampling import SMOTE
from imblearn.under_sampling import RandomUnderSampler
from imblearn.pipeline import Pipeline

# SMOTE oversample then undersample majority (hybrid)
pipe = Pipeline([
    ("over", SMOTE(sampling_strategy=0.3, random_state=42)),
    ("under", RandomUnderSampler(sampling_strategy=0.5, random_state=42)),
])
X_res, y_res = pipe.fit_resample(X_train, y_train)
```

> 💡 **Key Theory**: SMOTE (Synthetic Minority Over-sampling Technique) finds k-nearest neighbors of minority samples and interpolates new points between them. Unlike simple duplication, it generalizes around decision boundaries, but has drawbacks—can create unrealistic samples in noise/overlap regions; doesn't work directly on categorical features (needs SMOTE-NC variant); interpolation loses meaning in high dimensions.

> ⚠️ **Pitfall**: Resampling must **apply only after train-test split, to training set only**. Applying SMOTE before split leaks synthetic positives into both train and validation, causing **data leakage** and inflated performance. Use imblearn's `Pipeline` with cross-validation to resample within each fold.

## Algorithm-Level Remedy: Class Weights

Penalize minority class errors more heavily in the loss function without changing data.

```python
from sklearn.linear_model import LogisticRegression

# Auto-weight inversely to class frequency
clf = LogisticRegression(class_weight="balanced")

# XGBoost: set scale_pos_weight by negative/positive ratio
# scale_pos_weight = (negative count) / (positive count)
import xgboost as xgb
model = xgb.XGBClassifier(scale_pos_weight=49)  # negative:positive = 49:1
```

| Method | Data Changed | Strength | Weakness |
|------|-------------|------|------|
| Resampling | Yes | Intuitive, works with any model | Watch leakage, overfitting, information loss |
| Class weights | No | Data unchanged, fast | Model must support it |
| Threshold adjustment | No | Tune after training, in production | Finding right threshold takes work |

> 💡 **Key Theory**: Classifiers typically use 0.5 probability as threshold, but in imbalance this default fails. **Threshold moving** lets you adjust the recall-precision tradeoff by inspecting the PR curve or cost matrix without retraining. For fraud where false negatives (missed fraud) are costly, lower the threshold to raise recall.

## SageMaker Approaches

- Many built-in algorithms offer imbalance hyperparameters (e.g., XGBoost `scale_pos_weight`)
- Use SageMaker Clarify to pre-check class distribution and bias before training
- Monitor with F1/PR-AUC instead of accuracy

## Summary

- **Accuracy paradox**: Accuracy misleads in imbalance → use Precision/Recall/F1/PR-AUC
- **Data-level**: Oversample (SMOTE), undersample; apply after split, train set only
- **Algorithm-level**: Class weights (`class_weight`, `scale_pos_weight`), threshold tuning
- **Evaluation**: For sparse minorities, PR-AUC > ROC-AUC

## 📝 Practice Questions

**Question 1.** You want to evaluate model performance on fraud detection data in which positives are 1% of the total. Which single metric is the LEAST appropriate?

A) Recall  
B) Accuracy  
C) F1 score  
D) PR-AUC  

**Answer: B**  
Explanation: When positives are 1%, predicting "all negative" still yields 99% accuracy (the accuracy paradox), so Accuracy is the most misleading metric for imbalanced data. Recall (A), F1 (C), and PR-AUC (D) reflect minority-class performance and are more appropriate.

---

**Question 2.** Which statement about SMOTE is correct?

A) It randomly removes majority-class samples  
B) It only duplicates minority-class samples as they are  
C) It creates synthetic samples by interpolating between nearest neighbors of the minority class  
D) It must be applied to the entire dataset before splitting the data  

**Answer: C**  
Explanation: SMOTE generates new synthetic samples by linearly interpolating between a minority-class sample and its k-nearest neighbors. Removing majority samples (A) is undersampling, simple duplication (B) is random oversampling, and applying it before splitting (D) is a wrong approach that causes data leakage.

---

**Question 3.** Without changing the data, you want XGBoost to penalize misclassification of the minority (positive) class more heavily. Which setting is appropriate?

A) Set `scale_pos_weight` to (number of negatives / number of positives)  
B) Increase `n_estimators`  
C) Set `learning_rate` to 0  
D) Fix `max_depth` at 1  

**Answer: A**  
Explanation: Setting XGBoost's `scale_pos_weight` to the negative/positive ratio gives positive-class errors a larger weight, correcting the imbalance at the algorithm level. The number of trees (B), depth (D), and learning rate (C) are not directly related to imbalance weighting.

---

**Question 4.** When applying SMOTE together with cross-validation, what is the correct way to prevent data leakage?

A) Apply SMOTE to the entire dataset first, then cross-validate  
B) Apply SMOTE to the validation set as well  
C) Randomly reshuffle after SMOTE  
D) Use an imblearn Pipeline so SMOTE is applied only to the training portion of each fold  

**Answer: D**  
Explanation: Resampling must happen only within the training portion of each fold so that synthetic positives do not leak into the validation set - an imblearn Pipeline guarantees this. Applying it to the entire dataset (A) or the validation set (B) causes leakage, and a simple shuffle (C) does not prevent leakage.

---

**Question 5.** Positives are extremely rare in fraud detection. What is the MOST appropriate reason to prefer PR-AUC over ROC-AUC?

A) PR-AUC is always larger than ROC-AUC  
B) PR-AUC is faster to compute  
C) The ROC false positive rate is diluted by the huge number of negatives and can overestimate minority-positive performance  
D) ROC-AUC can be used only for regression  

**Answer: C**  
Explanation: The FPR denominator in ROC includes the many negatives (TN+FP), which dilutes errors on the rare positives, so PR-AUC, which focuses on positives, is more sensitive to changes in rare-class performance. Magnitude (A) and computation speed (B) are not reasons to prefer it, and ROC-AUC is a classification metric (D is wrong).

---
