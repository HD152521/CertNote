# Day 4 - Validation Design: train/validation/test Split, Cross-Validation, Time Series Split, Stratified Sampling

Yesterday we saw how leakage ruins validation. Today is the mirror image — **designing validation without leakage to honestly estimate model generalization**. Good model selection ultimately comes down to reliably estimating "how well will it perform on unseen data?" and that reliability depends entirely on validation design.

MLS-C01 repeatedly asks validation strategy selection. When data is small, when classes are imbalanced, when it's time series — what do we use? Today covers **3-way split**, **k-fold cross-validation**, **stratified sampling**, and **time series split**.

## Why Split Into Three: train/validation/test

The most basic is splitting data into three parts. Each has a different role.

| Split | Role | Key |
|------|------|------|
| **Training** | Learn model parameters | Largest proportion (usually 60-80%) |
| **Validation** | Hyperparameter tuning, model selection | Checked repeatedly |
| **Test** | Final performance evaluation **once only** | Sealed until the end |

Core principle: **Test set is sealed until all decisions are made, seen exactly once.** If you look at test scores and modify the model, the test set effectively becomes validation, contaminating the final estimate with optimism.

```python
from sklearn.model_selection import train_test_split

# 1st: train+val vs test (test is sealed)
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
# 2nd: train vs validation
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.25, random_state=42, stratify=y_temp
)
# Result: 60% / 20% / 20%
```

> 💡 **Related Theory**: Separating validation and test sets addresses the **multiple comparisons problem**. When comparing dozens of hyperparameter combinations on validation, by chance we select combinations that fit that particular validation set well, accumulating "selection bias" in the validation score. That score no longer fairly estimates generalization. That's why after all selection is complete, we measure final performance on a test set never used before — only then is the estimate honest.

## k-fold Cross-Validation: Conserve Data

Single split is at the mercy of chance. Especially with limited data, which rows end up in validation hugely affects scores. **k-fold cross-validation** divides data into k parts, uses each as validation once while training on the rest, repeats k times, and averages scores.

| Method | Explanation | Suitable For |
|------|------|------|
| **k-fold** | k splits, k repetitions (usually k=5,10) | General default |
| **Stratified k-fold** | Maintain class ratio in each fold | Classification, especially imbalanced |
| **Leave-One-Out (LOO)** | k = n, validate on one row | Data very limited (expensive) |
| **Repeated k-fold** | Repeat k-fold multiple times | Further reduce estimate variance |

Cross-validation gains: (1) every row is used once in validation, conserving data, (2) we get **mean and variance** of k scores, seeing performance stability.

```python
from sklearn.model_selection import StratifiedKFold, cross_val_score

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipe, X, y, cv=skf, scoring="f1")
print(f"F1: {scores.mean():.3f} ± {scores.std():.3f}")  # mean ± std
```

> 💡 **Related Theory**: k choice has **bias-variance tradeoff**. Small k (e.g., 2-fold) makes each training set small → estimate is **biased** pessimistically. Large k (LOO with k=n) makes training set almost the whole dataset → small bias but fold results are similar → estimate **variance** is large and computation explodes. Empirically k=5 or 10 balances bias, variance, and cost as widely used.

## Stratified Sampling: Maintain Ratios

In classification with **imbalanced** classes (e.g., fraud 1%), random split is risky. Bad luck and validation might have almost no or even zero minority class. **Stratified sampling** maintains **original class ratio in each split**.

- `train_test_split(..., stratify=y)`: Maintain ratio during split
- `StratifiedKFold`: Maintain ratio in each fold

Stratification is nearly always recommended for classification, almost essential for imbalanced data. In regression, sometimes stratify target into bins.

```python
from sklearn.model_selection import train_test_split

# stratify=y keeps original class ratio in splits
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)
print(y_train.value_counts(normalize=True))  # verify same ratio as original
```

> ⚠️ **Trap**: Splitting imbalanced data randomly (non-stratified) risks some fold having zero minority samples, making F1/recall uncomputable or distorted. If classification shows high accuracy but never catches minority class, check stratified split first.

## Time Series Split: Don't Reverse Time

As Day 3 showed, random or general k-fold on time series causes future leaking into past. Time series needs **splits that respect time order**.

| Method | Explanation |
|------|------|
| **Fixed split (holdout)** | Past = train, future = test from cutoff |
| **Expanding window** | Expand training window, evaluate next window |
| **Rolling window (sliding)** | Fixed-length training window slides forward, evaluate |

scikit-learn's `TimeSeriesSplit` implements this forward-chaining. In each split, **training is always before validation**.

```python
from sklearn.model_selection import TimeSeriesSplit

# Time-ordered split: training always before validation (blocks leakage)
tscv = TimeSeriesSplit(n_splits=5)
for train_idx, test_idx in tscv.split(X):
    # train_idx all times < test_idx times
    X_tr, X_te = X.iloc[train_idx], X.iloc[test_idx]
    # model train/evaluate ...
```

> 💡 **Related Theory**: Time series validation differs from general cross-validation because **independence of rows assumption breaks**. General k-fold assumes rows are exchangeable, but time series — order is information. `TimeSeriesSplit` always maintains "train on past, evaluate on future," simulating actual deployment (predict future with past model). This alignment makes validation scores resemble actual production performance.

## Validation Design Decision Summary

| Data Characteristic | Recommended Validation |
|------|------|
| General classification, sufficient data | Stratified train/val/test split |
| Data limited | Stratified k-fold cross-validation |
| Data very limited | Leave-One-Out |
| Class imbalance | Must use stratified |
| Time series | TimeSeriesSplit / time-ordered holdout |
| Group structure (users, patients) | GroupKFold (same group only on one side) |

## Summary

Today's essence: (1) **Keep test set sealed until the end, seen exactly once**, (2) limited data → **k-fold cross-validation** conserves data and gives mean/variance of k scores (k=5/10 is balance point), (3) classification/imbalance → **stratified** maintains class ratio, (4) time series → **TimeSeriesSplit** blocks leakage with time-ordered split.

Next post reviews this entire week — statistics foundations through validation design — as one integrated flow.

---

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
