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

## 📝 연습 문제

**문제 1.** 하이퍼파라미터를 튜닝하면서 테스트셋 점수를 보고 모델을 반복 수정했다. 이때 발생하는 문제는?

A) 테스트셋이 사실상 검증셋이 되어 최종 성능 추정이 낙관적으로 오염된다  
B) 학습이 더 빨라진다  
C) 모델이 과소적합된다  
D) 클래스 불균형이 해소된다  

**정답: A**  
해설: 테스트셋은 모든 결정이 끝난 뒤 단 한 번만 봐야 한다. 테스트 점수를 보며 모델을 수정하면 테스트셋이 검증셋 역할을 하게 되어 선택 편향이 누적되고, 최종 성능 추정이 일반화 성능을 과대평가한다. 학습 속도(B), 과소적합(C), 불균형(D)과는 무관하다.

---

**문제 2.** 데이터가 매우 적은 분류 문제에서 단일 분할의 점수가 분할마다 크게 흔들린다. 더 안정적인 성능 추정을 위한 방법은?

A) 테스트셋 비율을 90%로 늘린다  
B) k-fold 교차검증으로 모든 데이터를 검증에 활용하고 점수의 평균·분산을 본다  
C) 검증을 생략하고 학습 점수만 본다  
D) 데이터를 무작위로 복제한다  

**정답: B**  
해설: k-fold 교차검증은 각 fold를 한 번씩 검증셋으로 사용해 모든 행을 검증에 활용하고, k개 점수의 평균과 분산으로 안정적이고 신뢰할 수 있는 성능 추정을 제공한다. 테스트 비율을 키우면(A) 학습 데이터가 부족해지고, 학습 점수만 보거나(C) 데이터를 복제(D)하면 일반화 추정이 왜곡된다.

---

**문제 3.** 사기 거래가 전체의 1%인 극도로 불균형한 데이터를 분할할 때 가장 적절한 방법은?

A) 무작위 분할로 충분하다  
B) 시간 순으로만 나눈다  
C) 층화 분할(stratified)로 각 분할에 클래스 비율을 유지한다  
D) 소수 클래스를 모두 제거한다  

**정답: C**  
해설: 불균형 데이터에서 무작위 분할은 일부 분할에 소수 클래스가 거의 또는 전혀 없는 위험이 있다. 층화 분할은 각 분할에서 원본 클래스 비율을 유지해 소수 클래스가 모든 분할에 적절히 포함되게 한다. 무작위 분할(A)은 위험하고, 시간 순 분할(B)은 시계열 전용이며, 소수 클래스 제거(D)는 예측 대상 자체를 없애는 잘못된 조치다.

---

**문제 4.** 일별 수요 시계열을 검증할 때 누수를 막는 올바른 교차검증 방식은?

A) 일반 KFold로 무작위 분할  
B) StratifiedKFold  
C) TimeSeriesSplit으로 학습이 항상 검증보다 과거가 되게 한다  
D) LeaveOneOut  

**정답: C**  
해설: 시계열은 순서가 정보이므로 무작위 분할(A)이나 층화(B)·LOO(D)는 미래 데이터로 과거를 예측하는 누수를 일으킨다. TimeSeriesSplit은 forward-chaining 방식으로 학습 구간이 항상 검증 구간보다 과거가 되도록 보장해, 실제 배포 상황을 모사하고 누수를 차단한다.

---

**문제 5.** k-fold 교차검증에서 k를 결정할 때의 트레이드오프로 옳은 것은?

A) k가 클수록 항상 더 좋고 비용도 줄어든다  
B) k는 클래스 수와 항상 같아야 한다  
C) k가 작을수록 분산이 항상 커진다  
D) k가 작으면 학습셋이 작아져 추정이 비관적으로 편향되고, k가 매우 크면 분산과 계산 비용이 커진다  

**정답: D**  
해설: k가 작으면 각 fold의 학습셋이 작아 성능을 비관적으로 과소추정(편향)하고, k가 매우 크면(LOO 등) 편향은 줄지만 fold 간 결과가 비슷해 분산이 커지고 계산 비용이 급증한다. 그래서 k=5~10이 균형점으로 널리 쓰인다. k가 항상 클수록 좋거나 비용이 주는 것은 아니며(A), 클래스 수와 같아야 할 이유도 없다(B). C는 방향이 반대다.

---
