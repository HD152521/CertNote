# Day 4 - Handling Class Imbalance: Oversampling, Undersampling, SMOTE, Class Weights, Evaluation

## 📌 Key Takeaways

- **Accuracy paradox**: If positives are 2%, predicting "all negative" still gives 98% accuracy. On imbalanced data, accuracy is the most misleading metric.
- Evaluate imbalance with **precision, recall, F1, and PR-AUC**. The rarer the positives, the more **PR-AUC > ROC-AUC** holds.
- Data-level responses: **oversampling (SMOTE)** and **undersampling**. When the data is very large and speed matters, use undersampling.
- Algorithm-level responses: **class weights** (`class_weight="balanced"`, XGBoost `scale_pos_weight`) and **threshold adjustment**.
- Resampling must be applied **only to the training set after the split**, and in cross-validation **only inside the training portion of each fold**, to avoid leakage.

## The Imbalance Trap: The Accuracy Paradox

Most real-world classification problems are **imbalanced**. Fraud is 0.1%, disease positives are 2%, churn is 5% — the very thing you want to catch is the minority class. If you train on the raw imbalanced data, a model can predict the majority class for everything and still get high accuracy.

On data where positives are 2%, predicting "all negative" gives 98% accuracy. Yet it catches none of the positives you actually care about. This is the **accuracy paradox**.

```
                  Predicted
              Positive    Negative
          ┌───────────┬───────────┐
 Positive │    TP     │    FN     │ ← missed positives. Cuts recall
 Actual   ├───────────┼───────────┤
 Negative │    FP     │    TN     │ ← false alarms. Cuts precision
          └───────────┴───────────┘
                                    ↑
             With imbalance, TN is overwhelmingly large, so
             accuracy = (TP+TN)/total is dominated by TN
```

| Metric | Definition | Meaning under imbalance |
|------|------|-------------------|
| Accuracy | (TP+TN)/total | Biased toward the majority class, so it misleads |
| Precision | TP/(TP+FP) | Share of predicted positives that are actually positive |
| Recall | TP/(TP+FN) | Share of actual positives that were caught |
| F1 | Harmonic mean of precision and recall | Balance of the two in a single number |
| PR-AUC | Area under the precision-recall curve | More sensitive than ROC under imbalance |

### Interpreting Metrics: What to Look at in Which Situation

| Metric | What it means when it rises | Situation for choosing it | Pitfall |
|---|---|---|---|
| Accuracy | A high share of all predictions is correct | Only when classes are roughly balanced | Under imbalance, "all negative" gets the top score |
| Precision | Few false alarms | FP cost is high (blocking legitimate mail as spam, unnecessary detailed inspections) | If you call only the near-certain ones positive, recall collapses |
| Recall | Few missed positives | FN cost is high (missed cancer diagnosis, undetected fraud) | Calling everything positive gives recall 1.0 and rock-bottom precision |
| F1 | Precision and recall are both decent | When you cannot give up on either | Does not tell you which one is more expensive |
| ROC-AUC | Positive and negative ranks separate well across thresholds | When classes are relatively balanced | When negatives are overwhelming, FPR is diluted and looks optimistic |
| PR-AUC | Positive detection performance is good across thresholds | **When positives are rare** | Values cannot be compared across datasets with different class ratios |

For reference, regression metrics are a separate matter.

| Metric | Property | When |
|---|---|---|
| RMSE | Squares errors before summing → a bigger penalty for large errors | When you especially need to avoid big mistakes |
| MAE | Mean of the absolute errors | When there are outliers and you do not want to be oversensitive to large errors |

On imbalanced data, **PR-AUC is more useful than ROC-AUC**. The ROC x-axis (false positive rate) has all negatives (TN+FP) in its denominator, so the minority class's errors get diluted. The PR curve focuses on the positives, so it is sensitive to changes in minority-class performance. That is why "when positives are rare, as in fraud, evaluate with PR-AUC" is the standard answer.

> ⚠️ **Pitfall**: Work backward from the business cost to choose the metric. In fraud detection, a miss (FN) translates directly into losses, while a false alarm (FP) just needs a person to check once more → prioritize recall. Conversely, in mass marketing, a false alarm is itself a cost, so prioritize precision. Read "which mistake is more expensive?" first, not "which metric is good?"

## Data-Level Responses: Resampling

### Oversampling (increase the minority class)

- **Random oversampling**: Duplicate minority samples → the same points repeat, so there is overfitting risk
- **SMOTE**: Generate synthetic samples by interpolating between minority samples → preserves diversity

### Undersampling (reduce the majority class)

- **Random undersampling**: Remove some majority samples → risk of information loss
- When the data is very large, undersampling speeds up training

```python
from imblearn.over_sampling import SMOTE
from imblearn.under_sampling import RandomUnderSampler
from imblearn.pipeline import Pipeline

# Oversample with SMOTE, then undersample the majority class (hybrid)
pipe = Pipeline([
    ("over", SMOTE(sampling_strategy=0.3, random_state=42)),
    ("under", RandomUnderSampler(sampling_strategy=0.5, random_state=42)),
])
X_res, y_res = pipe.fit_resample(X_train, y_train)
```

### Choosing a Resampling Technique

| Technique | Change in data size | Strength | Weakness | When to choose |
|---|---|---|---|---|
| Random oversampling | Increases | Simple, no information loss | The same points repeat → overfitting | When the data is small and you cannot afford to discard any |
| **SMOTE** | Increases | Generalizes around the decision boundary | Creates unrealistic samples in noisy or overlapping regions | When there are a fair number of minority samples and you need diversity |
| Random undersampling | Decreases | Training gets faster | Loses majority-class information | When the data is very large and speed matters |
| Hybrid (SMOTE + under) | Adjustable | Compromises between both weaknesses | Two ratios must be tuned | When finding a balance point under extreme imbalance |

SMOTE (Synthetic Minority Over-sampling Technique) finds the k-nearest neighbors of a minority-class sample and interpolates between them to create new points. Unlike plain duplication, it has the effect of generalizing around the decision boundary, but it has drawbacks too — in noisy or overlapping regions it can produce unrealistic samples, it does not apply directly to categorical features (the SMOTE-NC variant is needed), and in high dimensions interpolation loses meaning.

> ⚠️ **Pitfall**: Resampling must be applied **after the train/test split, only to the training set**. If you apply SMOTE before splitting, synthesized positives get mixed into both the training and validation sets, causing **data leakage** and inflated performance. In cross-validation, use imblearn's `Pipeline` so that resampling happens inside each fold.

```
[Wrong order — leakage]           [Correct order]
 Entire dataset                    Entire dataset
      │                                │
   Apply SMOTE                      Split (train / valid)
      │                                │
   Split (train / valid)            SMOTE on train only
      │                                │
 ✗ Synthetic points from the       ✓ valid keeps the original distribution
   same originals end up split        → the performance estimate is honest
   across train and valid
   → validation score is inflated
```

## Algorithm-Level Responses: Class Weights

Without changing the data, you give a larger penalty to minority-class errors in the loss function.

```python
from sklearn.linear_model import LogisticRegression

# Weight automatically by the inverse of class frequency
clf = LogisticRegression(class_weight="balanced")

# XGBoost: set scale_pos_weight from the negative/positive ratio
# scale_pos_weight = (number of negatives) / (number of positives)
import xgboost as xgb
model = xgb.XGBClassifier(scale_pos_weight=49)  # negative:positive = 49:1
```

| Method | Changes the data | Strength | Weakness |
|------|-------------|------|------|
| Resampling | Yes | Intuitive, applies to any model | Watch for leakage, overfitting, and information loss |
| Class weights | No | Data stays as is, fast | The model must support it |
| Threshold adjustment | No | Adjusted after training, possible even in production | Requires work to find an appropriate threshold |

Classifiers usually use a probability of 0.5 as the threshold, but this default does not work under imbalance. **Threshold moving** lets you adjust the recall-precision trade-off by looking at the PR curve or a cost matrix, without retraining. When the cost of a miss (missing fraud) is high, lower the threshold to raise recall.

```
Moving the probability threshold moves the two metrics in opposite directions

 Lower threshold ←─────────── 0.5 ───────────→ Raise threshold
 Range called positive widens          narrows
      Recall ↑  Precision ↓          Recall ↓  Precision ↑
      Missed positives ↓  False alarms ↑   Missed positives ↑  False alarms ↓
      (fraud detection · disease screening)   (mass mailing · automatic blocking)
```

| How to set the threshold | What it does | When |
|---|---|---|
| The F1-maximizing point on the PR curve | Picks the precision-recall balance point | When neither side is especially expensive |
| Fix a target recall | The lowest threshold that satisfies "catch 90% of positives" | When the detection rate is set by regulation or policy |
| Cost-matrix based | Assign costs to FP and FN to minimize expected cost | When the cost of mistakes can be converted into money |
| Operating-capacity based | Take only the top N cases to match how many can be reviewed per day | When people must do the follow-up review |

The threshold must be **set on the validation set and confirmed on the test set**. If you pick the threshold by looking at the test set, that score is no longer a generalization estimate. It is the same kind of leakage as with resampling or scaling.

### Choosing Among the Techniques Overall

| Situation | Method to choose | Why |
|---|---|---|
| The data is small and minority samples are precious | SMOTE (oversampling) | Gains diversity without discarding anything |
| Hundreds of millions of records, training speed matters | Random undersampling | Speeds things up by reducing the amount of data itself |
| The data must not be touched (audit, reproducibility) | Class weights | Original data stays as is |
| Adjusting an already-trained model in production | Threshold moving | Takes effect immediately without retraining |
| Many categorical features | Class weights or SMOTE-NC | Basic SMOTE cannot be applied directly to categorical features |
| Feature dimensionality is very high | Class weights | Interpolation loses meaning in high dimensions |
| The cost of a miss is overwhelmingly large | Lower the threshold and prioritize recall | Reflects the cost asymmetry through the threshold |

### When Imbalance Goes to the Extreme, the Approach Itself Changes

| Positive ratio | Approach | Why |
|---|---|---|
| 30-50% | Plain supervised learning | Effectively balanced. Accuracy is usable too |
| 1-10% | Supervised learning + class weights/resampling, evaluate with PR-AUC | The typical imbalance range |
| 0.1-1% | Same as above, but threshold adjustment carries more weight | Few minority samples, so resampling has limited effect |
| Under 0.1% or almost no labels | **Reframe as anomaly detection** | Model the positives not as a "class" but as "what deviates from normal" |

## Approaches in SageMaker

- Several built-in algorithms provide imbalance-related hyperparameters (e.g., XGBoost `scale_pos_weight`)
- Before training, check class distribution and bias in advance with SageMaker Clarify
- Set the monitoring metric to F1/PR-AUC instead of accuracy

| Situation | Service/feature | Why |
|---|---|---|
| Check class distribution and bias before training | SageMaker Clarify | Computes pre-training bias metrics |
| Give positives a weight in a boosting model | `scale_pos_weight` in SageMaker XGBoost | Algorithm-level imbalance correction |
| Put resampling in a pipeline to block leakage | Notebook + imblearn `Pipeline` | Resample only inside each fold's training portion |
| Watch for performance degradation in production | Monitor with F1/PR-AUC rather than accuracy | Under imbalance, accuracy cannot catch changes |

## Stem Clue → Answer Mapping

| Stem clue | Answer to choose | Why |
|---|---|---|
| "Positives are 1% but accuracy came out at 99%" | Accuracy paradox → evaluate with PR-AUC and recall | TN dominates the metric |
| "Positives are very rare, like fraud" | PR-AUC | ROC's FPR is diluted by negatives |
| "Penalize minority errors without changing the data" | `class_weight="balanced"` / `scale_pos_weight` | Algorithm-level response |
| "Negative:positive = 49:1 in XGBoost" | `scale_pos_weight = 49` | Number of negatives / number of positives |
| "Cross-validation together with SMOTE" | Only inside each fold, using imblearn `Pipeline` | Blocks validation-set leakage |
| "The data is very large and training must be fast" | Random undersampling | Speeds up by reducing the amount of data |
| "Raise recall without retraining" | Threshold moving | Can be adjusted after training |
| "Check class distribution and bias before training" | SageMaker Clarify | Pre-training bias check |
| "The minority class was simply duplicated" | Random oversampling (overfitting risk) | SMOTE interpolates rather than duplicates |

In the next post, we tie together the four topics of Week 4 into one workflow and compare and summarize them.

## 📖 Glossary

- **Class imbalance**: A state in which the class you want to catch is only a few percent of the whole. Fraud, disease, and churn are typical examples.
- **Accuracy paradox**: The illusion that a model looks good because accuracy comes out high even when it predicts the majority class for everything.
- **Confusion matrix**: A table that crosses actual and predicted values into four cells: TP, FP, FN, and TN. It is the raw material for all classification metrics.
- **Precision**: The share of "predicted positives that are truly positive." The fewer false alarms, the higher it is.
- **Recall**: The share of "true positives that were caught." The fewer missed positives, the higher it is.
- **PR-AUC**: The area under the precision-recall curve. When positives are rare, it reveals performance differences better than ROC-AUC.
- **SMOTE**: An oversampling technique that creates new samples by interpolating between a minority-class sample and its neighbors. It is not duplication.
- **Undersampling**: A method that balances the ratio by discarding part of the majority class. It is fast but loses information.
- **Class weights**: A setting that makes the loss larger when the minority class is wrong. It does not touch the data.
- **Threshold moving**: Shifting the probability cutoff away from 0.5 to change the balance between recall and precision. No retraining is needed.

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
