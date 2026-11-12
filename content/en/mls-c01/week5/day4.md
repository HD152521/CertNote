# Day 4 - Validation Design: Train/Validation/Test Splits, Cross-Validation, Time-Series Splits, Stratified Sampling

## 📌 Key Takeaways

- **Keep the test set sealed until every decision is made** and look at it exactly once. The moment you look and fix, the test set becomes a validation set.
- When data is scarce, use **k-fold cross-validation** so that every row is used for validation, and look at the **mean ± standard deviation** of the k scores (k=5 or 10 is the balance point).
- For classification, especially with **class imbalance, stratification** is practically mandatory. It preserves the original class ratio in every split.
- For **time series, use TimeSeriesSplit**. The training period must always be earlier than the validation period (forward-chaining).
- When the same user or patient has multiple rows, you must split at the group level with **GroupKFold** so that performance is not inflated.

## Why Split in Three: train / validation / test

Yesterday we saw how leakage ruins validation. Today is its mirror image: **designing validation without leakage so you honestly estimate a model's generalization performance**. Good model selection is ultimately the ability to credibly estimate "how well will it do on data it has never seen?", and that credibility depends entirely on the validation design.

The most basic step is to split the data into three. Each has a different role.

| Split | Role | Key point | Times used |
|---|---|---|---|
| **Training** | Learn the model parameters | Usually the largest share, 60–80% | Every training run |
| **Validation** | Hyperparameter tuning and model selection | Looked at repeatedly | Many times |
| **Test** | Final performance evaluation | Sealed to the end | **Exactly once** |

Key principle: **keep the test set sealed until every decision is made, and look at it exactly once.** If you modify the model after seeing the test score, the test set effectively becomes a validation set and the final estimate is contaminated optimistically.

```python
from sklearn.model_selection import train_test_split

# Step 1: train+val vs. test (test is sealed)
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
# Step 2: train vs. validation
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.25, random_state=42, stratify=y_temp
)
# Result: 60% / 20% / 20%
```

The reason for separating the validation set from the test set is the **multiple comparisons problem**. If you compare dozens of hyperparameter combinations on the validation set, a combination that happens to fit that validation set well gets selected by chance, and "selection bias" accumulates in the validation score. That score no longer estimates generalization performance fairly. So after all selections are finished, you measure final performance on a test set that has never been used. Only then is the estimate honest.

### Role Comparison Table for the Three Splits

| Question | Training set | Validation set | Test set |
|---|---|---|---|
| What does it decide? | Model parameters (weights) | Hyperparameters, algorithm, features | It decides nothing |
| How many times is it viewed? | Unlimited | Many times | Once |
| Are preprocessing statistics derived here? | **Yes** | No (transform only) | No (transform only) |
| What the score means | Goodness of fit (for diagnosing overfitting) | A relative comparison value for selection | An estimate of generalization performance |
| What happens if contaminated | Overfitting cannot be detected | Selection bias accumulates | The final reported number becomes false |

## k-fold Cross-Validation: Saving Data

A single split depends on luck. Especially when data is scarce, which rows land in validation swings the score greatly. **k-fold cross-validation** divides the data into k parts, uses each part once as validation while training on the rest, and averages the scores from the k repetitions.

```
5-fold cross-validation (■ = validation fold, □ = training fold)

Fold 1  ■ □ □ □ □   → score₁
Fold 2  □ ■ □ □ □   → score₂
Fold 3  □ □ ■ □ □   → score₃
Fold 4  □ □ □ ■ □   → score₄
Fold 5  □ □ □ □ ■   → score₅
                     ────────────────────
                     Report as mean ± standard deviation
                     (every row is used for validation exactly once)
```

| Method | Description | Suitable situation |
|---|---|---|
| **k-fold** | Split into k parts, repeat k times (usually k=5 or 10) | General default |
| **Stratified k-fold** | Preserve class ratios in each fold | Classification, especially imbalanced |
| **Leave-One-Out (LOO)** | k = n, validate one row at a time | When data is extremely scarce (costly) |
| **Repeated k-fold** | Repeat k-fold several times | When you want to reduce estimation variance further |
| **GroupKFold** | Place the same group on only one side | Group structure such as users or patients |
| **Nested CV** | Evaluate with outer folds, tune with inner folds | Honest performance estimate that includes tuning |

Benefits of cross-validation: (1) every row is used for validation once, saving data, and (2) you obtain the **mean and variance** of the k scores, so you can also see the stability of performance.

```python
from sklearn.model_selection import StratifiedKFold, cross_val_score

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipe, X, y, cv=skf, scoring="f1")
print(f"F1: {scores.mean():.3f} ± {scores.std():.3f}")  # mean ± standard deviation
```

Choosing k involves a **bias-variance tradeoff**. When k is small (e.g., 2-fold), each training set becomes small and the estimate is pessimistically **biased**. When k is very large (LOO, k=n), the training set is nearly the whole dataset so bias is small, but the fold results become similar to each other, so the estimate **variance** grows and the computation explodes. Empirically, k=5 or 10 is the balance point of bias, variance, and cost, and is widely used.

### k Value Tradeoff Table

| k | Training set size | Bias | Variance | Computational cost | When |
|---|---|---|---|---|---|
| 2–3 | Small (50–67%) | Pessimistically large | Small | Very low | When data is very plentiful and only a quick check is needed |
| **5** | 80% | Small | Moderate | Low | **General default** |
| **10** | 90% | Smaller | Moderate to slightly large | Medium | When data is moderately scarce and a precise estimate is needed |
| n (LOO) | Nearly all | Almost none | Large | Very high | When data is in the tens to hundreds of rows |

> ⚠️ **Pitfall**: "The larger k is, the always better" is a wrong answer. As k grows, computational cost increases in proportion to k, and the training sets become nearly identical so the correlation between fold scores rises, which actually increases the variance of the mean estimate.

## Stratified Sampling: Preserve the Ratio

In classification with **imbalanced** classes (e.g., 1% fraud), a random split is risky. With bad luck, validation may contain almost no minority-class samples, or even zero. **Stratified sampling** **preserves the original class ratio in every split**.

- `train_test_split(..., stratify=y)`: preserves the ratio when splitting
- `StratifiedKFold`: preserves the ratio in each fold

In classification, stratification is almost always recommended, and for imbalanced data it is practically mandatory. In regression, the target is sometimes divided into bins for stratification.

```python
from sklearn.model_selection import train_test_split

# stratify=y preserves the original class ratio across the split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)
print(y_train.value_counts(normalize=True))  # check whether it matches the original ratio
```

> ⚠️ **Pitfall**: If you randomly split imbalanced data without stratification, some fold may have zero minority-class samples, making F1 and recall incalculable or distorted. In classification, if accuracy is high but the minority class is not caught at all, first check for a stratified split.

### Metric Interpretation Table for Imbalanced Data

Even if you fix the split with stratification, choosing the wrong metric will still mislead you.

| Metric | What it says | Situation to prioritize | Pitfall |
|---|---|---|---|
| Accuracy | Right often overall | Only when classes are balanced | **With 1% positives, "predict all negative" still gives 99%**, so it is meaningless on imbalanced data |
| Precision | Few false alarms | False-alarm cost is high (spam blocking) | Easy to raise by predicting only a few as positive |
| Recall | Few misses | Miss cost is high (fraud, disease) | Predicting everything as positive gives 1.0 |
| F1 | Balance of precision and recall | When the two costs are similar | Hides which side is the problem |
| ROC-AUC | Discriminative power independent of threshold | Threshold undecided, comparing models | Overly optimistic under extreme imbalance |
| PR-AUC | Discriminative power for the minority class | When the positive ratio is very low | The value changes when the class ratio changes |
| RMSE | Few large errors | Regression, when penalizing large errors strongly | Sensitive to outliers |
| MAE | Small average error | Regression, when robustness to outliers is needed | Treats large errors leniently |

The reason accuracy is a trap on imbalanced data is that the score is high even if you only get the majority class right. Validation design (stratification) and metric choice (PR-AUC, recall) must be fixed **together**. Fixing only one of them still leads you to pick the wrong model.

## Time-Series Splits: Never Go Against Time

As we saw on Day 3, using a random split or ordinary k-fold on a time series leaks the future into the past. Time series need a **split that respects time order**.

| Method | Description | Characteristics |
|---|---|---|
| **Fixed split (holdout)** | Set a cutoff point; past = training, future = test | Simplest, evaluated only once |
| **Expanding window** | Extend the training period while evaluating the next period | Uses all data, reflects older patterns too |
| **Rolling / sliding window** | Slide a fixed-length training period forward while evaluating | Focuses on recent patterns, copes with distribution shift |

scikit-learn's `TimeSeriesSplit` implements this forward-chaining. In every split, **training is always earlier than validation**.

```
TimeSeriesSplit (expanding window, n_splits=4)
Time axis ───────────────────────────────────────▶

Split 1  [■■■■]───[▨▨]  ·  ·  ·  ·        ■ training  ▨ validation
Split 2  [■■■■ ■■]───[▨▨]  ·  ·
Split 3  [■■■■ ■■ ■■]───[▨▨]  ·
Split 4  [■■■■ ■■ ■■ ■■]───[▨▨]

  · The training period expands each time, and the validation period is always the "next" point in time
  · Same structure as real deployment (predicting the future with a model trained on the past)
```

```python
from sklearn.model_selection import TimeSeriesSplit

# Chronological split: training is always earlier than validation (blocks leakage)
tscv = TimeSeriesSplit(n_splits=5)
for train_idx, test_idx in tscv.split(X):
    # every point in time in train_idx < the points in test_idx
    X_tr, X_te = X.iloc[train_idx], X.iloc[test_idx]
    # train/evaluate the model ...
```

Time-series validation differs from ordinary cross-validation because **the row-independence assumption breaks**. Ordinary k-fold assumes rows are exchangeable, but in a time series the order itself is information. `TimeSeriesSplit` always maintains "train on the past, evaluate on the future," simulating the real deployment situation (predicting the future with a model built on the past). Thanks to this alignment, the validation score comes to resemble real production performance.

## Validation Strategy Selection Table

| Data characteristic | Recommended validation | Reason |
|---|---|---|
| General classification, plenty of data | Stratified train/val/test split | Simple and fast, and preserves the ratio |
| Data is scarce | Stratified k-fold cross-validation | Uses every row for validation, gives mean and variance |
| Data is very scarce | Leave-One-Out | Minimal bias, accept the cost |
| Class imbalance | Stratification is mandatory | The minority class must be in every split |
| Time series | TimeSeriesSplit / chronological holdout | Blocks backward-in-time leakage |
| Group structure (users, patients) | GroupKFold | If the same group straddles both sides, performance is inflated |
| Honest evaluation that includes tuning | Nested CV | Outer folds take no part in tuning, so there is no selection bias |
| Regression with a heavily skewed target | Bin the target and stratify | Prevents extreme values from piling into one split |

### AWS Service Mapping Table

| Situation | AWS service / feature | Reason |
|---|---|---|
| Automatically search hyperparameters against a validation metric | SageMaker automatic model tuning (hyperparameter tuning job) | Specify an objective metric and it runs multiple training jobs to find the best combination |
| Fix the order of preprocessing, training, and evaluation in code | SageMaker Pipelines | The order of splitting and preprocessing is reproduced, preventing leakage and procedural mistakes |
| Compare and track metrics and parameters per training run | SageMaker Experiments | A history of validation score comparisons remains, so you can document the basis for selection |
| Stop early when training stops improving to save cost | SageMaker early stopping setting | Cuts off training early when the validation metric is not improving |
| Bulk-score the sealed test set | SageMaker Batch Transform | Evaluates all at once without keeping an endpoint running |
| Monitor whether real performance after deployment differs from validation | SageMaker Model Monitor | Captures the validation-vs-production gap with metrics |

### Question Clue → Answer Mapping Table

| Phrase in the question | Signal to read | Answer to pick |
|---|---|---|
| "It is daily data with a time order" | Time series | TimeSeriesSplit / chronological holdout |
| "The class is 0.5%" | Extreme imbalance | Stratified split + PR-AUC and recall |
| "There are only a few hundred records" | Insufficient data | k-fold (or LOO) cross-validation |
| "Multiple test records for the same patient" | Group structure | GroupKFold |
| "The model was fixed while watching the test score" | Test set contamination | A new test set is needed; violates the sealing principle |
| "The score differs greatly from fold to fold" | High estimation variance | Increase k or use Repeated k-fold |
| "Report an honest performance that includes the tuning results" | Selection bias must be removed | Nested CV |
| "Accuracy is high but the minority class is not caught" | Both metric and split are problems | Stratification + switch to recall/PR-AUC |

In the next article, we tie together the whole week, from statistics basics to validation design, into a single flow.

## 📖 Glossary

- **Validation set**: Data used repeatedly for hyperparameter tuning and model selection. It is not for reporting final performance.
- **Test set**: Data for final evaluation that is looked at exactly once, after all decisions are made.
- **Multiple comparisons problem**: The phenomenon in which comparing multiple candidates on the same validation set selects one that fits by chance, optimistically biasing the score.
- **k-fold cross-validation**: A method that divides the data into k parts and trains and evaluates k times, using each part once as validation.
- **Stratified sampling**: A way of splitting so that each split preserves the original class ratio.
- **GroupKFold**: Cross-validation that keeps rows from the same group (user, patient) from being separated between training and validation.
- **TimeSeriesSplit**: Time-series-specific cross-validation that splits so the training period is always earlier than the validation period.
- **Nested CV (nested cross-validation)**: A method that tunes in inner folds and evaluates in outer folds, eliminating selection bias as well.
- **Bias-variance tradeoff (choosing k)**: The relationship in which a small k biases the estimate pessimistically, while a very large k increases variance and computational cost.
- **PR-AUC**: The area under the precision-recall curve. Gives a more honest signal than ROC-AUC when the positive ratio is very low.

## 📝 Practice Questions

**Question 1.** While tuning hyperparameters, you repeatedly modified the model while looking at the test set score. What problem occurs?

A) The test set effectively becomes a validation set, and the final performance estimate becomes optimistically contaminated  
B) Training becomes faster  
C) The model underfits  
D) Class imbalance is resolved  

**Answer: A**  
Explanation: The test set should be looked at only once, after all decisions are made. If you modify the model while looking at test scores, the test set acts as a validation set, selection bias accumulates, and the final performance estimate overestimates generalization performance. It is unrelated to training speed (B), underfitting (C), or imbalance (D).

---

**Question 2.** In a classification problem with very little data, the score of a single split fluctuates greatly from split to split. Which method provides a more stable performance estimate?

A) Increase the test set proportion to 90%  
B) Use k-fold cross-validation to use all the data for validation and look at the mean and variance of the scores  
C) Skip validation and look only at the training score  
D) Randomly duplicate the data  

**Answer: B**  
Explanation: k-fold cross-validation uses each fold as the validation set once, so every row is used for validation, and the mean and variance of the k scores provide a stable, reliable performance estimate. Increasing the test proportion (A) leaves too little training data, and looking only at the training score (C) or duplicating data (D) distorts the generalization estimate.

---

**Question 3.** What is the MOST appropriate way to split an extremely imbalanced dataset in which fraud transactions are 1% of the total?

A) A random split is sufficient  
B) Split only chronologically  
C) Use a stratified split to maintain the class ratio in each split  
D) Remove all of the minority class  

**Answer: C**  
Explanation: With imbalanced data, a random split risks some splits having few or no minority-class samples. A stratified split maintains the original class ratio in each split so the minority class is properly included in every split. A random split (A) is risky, a chronological split (B) is only for time series, and removing the minority class (D) is a wrong action that eliminates the prediction target itself.

---

**Question 4.** When validating a daily demand time series, which cross-validation method correctly prevents leakage?

A) Random split with plain KFold  
B) StratifiedKFold  
C) Use TimeSeriesSplit so that training always precedes validation in time  
D) LeaveOneOut  

**Answer: C**  
Explanation: In time series, order is information, so a random split (A), stratification (B), or LOO (D) causes leakage by predicting the past with future data. TimeSeriesSplit uses a forward-chaining approach to guarantee that the training period is always earlier than the validation period, mimicking the real deployment situation and blocking leakage.

---

**Question 5.** Which statement about the trade-off in choosing k for k-fold cross-validation is correct?

A) A larger k is always better and also reduces cost  
B) k must always equal the number of classes  
C) A smaller k always increases variance  
D) A small k makes the training sets smaller and biases the estimate pessimistically, while a very large k increases variance and computational cost  

**Answer: D**  
Explanation: With a small k, each fold's training set is small, so performance is underestimated pessimistically (bias); with a very large k (such as LOO), bias decreases but results across folds are similar, so variance grows and computational cost rises sharply. That is why k=5-10 is widely used as a balance point. A larger k is not always better and does not reduce cost (A), and there is no reason for it to equal the number of classes (B). C has the direction reversed.

---
