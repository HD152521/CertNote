# Day 3 - Data Leakage: Causes, Detection, Prevention; Time Series Leakage; Target Leakage

Validation scores look perfect, but in production the model fails miserably. Almost always, there's one culprit — **data leakage**. Leakage occurs when a model gains access to information at training time that it **wouldn't actually have at prediction time**, artificially inflating evaluation scores.

MLS-C01 obsesses over leakage. Scenarios like "validation is 99% but production is 60%?" are almost always answered by leakage. Today we cover the **causes, detection, and prevention** of leakage, and two most common types: **target leakage** and **time series leakage**.

## What Is Data Leakage?

Leakage is "information that a model couldn't possibly have at prediction time leaking into training." There are two main categories.

| Type | Definition | Result |
|------|------|------|
| **Target leakage** | Target information directly/indirectly included in features | Both training and validation unrealistically high |
| **train-test contamination** | Test information enters training through preprocessing/splitting | Validation high but production low |

The core question is always the same: **"At the moment we make a prediction, could we really know this value?"** If not, it's leakage.

> 💡 **Related Theory**: Leakage is fundamentally like cheating on an exam — the model has already seen the answer key. Statistically, it violates the **independence assumption of the validation set**. For validation scores to estimate generalization on unseen data, the validation set must be completely independent of the training process. With leakage, validation scores measure not generalization but "ability to reproduce already-seen information," contaminating all model selection and hyperparameter tuning decisions.

## Target Leakage: Future/Result Information Mixing In

Target leakage occurs when **information about the target being predicted is included in features**. It's the most subtle and common.

Typical cases:

| Scenario | Leaking Feature | Why Leakage? |
|------|------|------|
| Disease diagnosis prediction | `medication_taken` | Medication only taken **after** diagnosis |
| Churn prediction | `cancellation_reason_code` | Generated after churn is confirmed |
| Loan default prediction | `delinquencies_count` (future periods included) | Accumulated after default occurs |
| Revenue prediction | `current_month_final_revenue` | The target itself |

Signs of target leakage:
- A single feature's correlation/importance is **abnormally high** (one variable explains 95% of accuracy)
- Features are created **at the same time or after** the target
- Answer to "Can we really know this value at prediction time?" is "No"

```python
# Check suspicion of target leakage: verify single feature explains target
import pandas as pd

corr_with_target = (
    df.corr(numeric_only=True)["churned"]
    .abs()
    .sort_values(ascending=False)
)
print(corr_with_target.head(10))
# If any feature correlation is 0.95+, suspect "Can we know this at prediction time?"
```

> ⚠️ **Trap**: Target leakage isn't caught even if you split train/validation/test perfectly **because leakage is built into the features themselves**. All splits are equally contaminated. That's why splitting alone isn't enough—you must examine **when each feature is created (timestamp) and its relationship to prediction time** using domain knowledge. "Validation high and test high but production low?" → suspect target leakage as #1.

## Time Series Leakage: Future Leaking Into Past

The most common leakage in time series data is **future information being used to predict the past**.

Causes:
- **Random splitting**: Shuffling time series mixes future data into training, past into testing → predicting past from future
- **Future window aggregation**: Computing "last 30 days average" including data after prediction time
- **Using global statistics**: Normalizing by overall average → future information seeps into past rows
- **lag/rolling boundary errors**: Shifts wrong, putting t+1 value into time t

```python
import pandas as pd

df = df.sort_values("date")

# Correct: rolling that only looks at past (exclude current row with shift)
df["sales_ma7"] = df["sales"].shift(1).rolling(7).mean()  # t-1 ~ t-7

# Time series needs time-ordered split (no random splitting)
cutoff = "2025-01-01"
train = df[df["date"] < cutoff]
test = df[df["date"] >= cutoff]
```

> 💡 **Related Theory**: Random splitting is fatal in time series because of **temporal dependency**. Regular data assumes rows are independent, but time series have strong correlation between adjacent time points. Random shuffling lets models "predict" t by looking at t+1 patterns — effectively learning impossible time reversal. That's why time series validation must always follow "train on past, evaluate on future (forward-chaining)" principle, leading to Day 4's time series splitting.

## train-test Contamination: Leakage Through Preprocessing

Even with correct splitting, if **preprocessing is done on the entire dataset before splitting**, test information leaks into training.

| Wrong Approach | Leakage Path |
|------|------|
| Fit scaler on entire dataset | Test mean·std reflected in training scale |
| Calculate imputation statistics on entire dataset | Test distribution enters imputation values |
| Target encoding on entire dataset | Test target average included in encoding |
| Forget deduplication before splitting | Same record appears in both train and test |
| Oversample (SMOTE) before splitting | Synthetic samples span train and test |

Solution is **Pipeline that locks preprocessing inside split/cross-validation**.

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

# Pipeline: fit only happens in each fold's training portion, blocking leakage
pipe = Pipeline([
    ("impute", SimpleImputer(strategy="median")),
    ("scale", StandardScaler()),
    ("clf", LogisticRegression()),
])

# Each fold's preprocessing is fit on training portion only
scores = cross_val_score(pipe, X, y, cv=5)
```

> ⚠️ **Trap**: "Can't we scale on entire data then split?" is a frequent test question. No. If StandardScaler `fit`s on the whole dataset, test statistics leak into training scale, and validation scores become optimistically inflated. You must `fit` only on train portion, `transform` on test only. In cross-validation, Pipeline ensures this rule automatically per fold.

## Data Leakage Prevention Checklist

Consistent procedure to prevent leakage in practice:

1. **Split first**: Do train/test split before any preprocessing
2. **Fit only training**: Scaler/encoder/imputer `fit` on train portion only
3. **Use Pipeline**: Lock preprocessing inside cross-validation loop
4. **Time series time-ordered split**: No random splitting, lag/rolling only look at past
5. **Audit feature generation time**: Confirm each feature is knowable at prediction time
6. **Suspect high validation**: If scores are too good, suspect leakage first

## Summary

Today's essence: (1) Leakage is "information a model couldn't have at prediction time entering training," (2) **Target leakage** is when result information enters features — invisible to splitting and needs time inspection, (3) **Time series leakage** comes from random splitting/future windows → fixed by time-ordered splitting and past-only aggregation, (4) **train-test contamination** is preprocessing on entire data before splitting → fixed by splitting first and fitting only train portion with Pipeline.

Next post covers the principles in practice: **validation design — splitting, cross-validation, stratification, time series splitting**.

---

## 📝 연습 문제

**문제 1.** 이탈 예측 모델에서 한 특성 `해지_사유_코드`의 중요도가 비정상적으로 높고 검증 정확도가 99%였다. 이 현상의 가장 유력한 원인은?

A) 타깃 누수 — 이탈이 확정된 뒤 생성되는 정보가 특성에 포함됐다  
B) 모델이 과소적합되었다  
C) 학습률이 너무 높다  
D) 표본이 너무 적다  

**정답: A**  
해설: `해지_사유_코드`는 이탈이 이미 확정된 후에야 채워지는 값이므로, 예측 시점에는 알 수 없는 미래·결과 정보다. 이것이 특성에 들어가면 모델이 정답을 미리 보는 타깃 누수가 된다. 비정상적으로 높은 단일 특성 중요도와 검증 점수가 전형적 신호다. 과소적합(B)이나 학습률(C), 표본 크기(D)와는 무관하다.

---

**문제 2.** 일별 매출 시계열을 무작위로 섞어 train/test를 나눴더니 검증 점수가 매우 높았지만 실제 미래 예측은 형편없었다. 올바른 조치는?

A) 무작위 분할을 그대로 두고 표본을 늘린다  
B) 시간 순으로 분할해 과거로 학습하고 미래로 평가한다  
C) 테스트셋을 학습셋과 섞는다  
D) 매출을 정규화한다  

**정답: B**  
해설: 시계열은 시간적 의존성이 있어 무작위 분할 시 미래 데이터로 과거를 예측하는 시계열 누수가 발생한다. 과거로 학습하고 미래로 평가하는 시간 순 분할(forward-chaining)이 정답이다. 표본을 늘려도(A) 누수 구조는 그대로이고, 섞기(C)는 누수를 악화시키며, 정규화(D)는 분할 문제와 무관하다.

---

**문제 3.** scikit-learn에서 전처리(스케일링·대치)를 교차검증 시 누수 없이 적용하는 가장 안전한 방법은?

A) 전체 데이터로 스케일러를 fit한 뒤 교차검증한다  
B) 전처리를 Pipeline에 넣어 각 fold의 학습 부분에서만 fit되게 한다  
C) 테스트셋의 통계로 전처리한다  
D) 전처리를 생략한다  

**정답: B**  
해설: Pipeline에 전처리를 넣으면 교차검증의 각 fold마다 학습 부분에서만 `fit`이 일어나고 검증 부분에는 `transform`만 적용돼 누수가 차단된다. 전체 데이터로 미리 fit(A)하거나 테스트 통계를 쓰면(C) 테스트 정보가 새어 점수가 부풀려진다. 전처리 생략(D)은 해결책이 아니다.

---

**문제 4.** 다음 중 train/validation/test 분할을 깨끗이 해도 탐지되지 않는 누수 유형은?

A) train-test 전처리 오염  
B) 분할 전 중복 제거 누락  
C) 특성 자체에 결과 정보가 포함된 타깃 누수  
D) 분할 전 전체 데이터 스케일링  

**정답: C**  
해설: 타깃 누수는 누수 정보가 특성 안에 들어 있어 어떤 분할을 해도 모든 분할이 똑같이 오염되므로 분할 검증만으로는 잡히지 않는다. 각 특성이 예측 시점에 알 수 있는 값인지 시점을 따져야 한다. 나머지(A·B·D)는 전처리·분할 절차를 바로잡으면 막을 수 있는 오염 유형이다.

---

**문제 5.** 시계열 모델에서 `최근 7일 이동평균` 특성을 만들 때 누수를 피하는 올바른 방법은?

A) 예측 대상 시점을 포함한 7일 평균을 사용한다  
B) 미래 7일 평균을 사용한다  
C) 전체 기간 평균으로 정규화한다  
D) 현재 시점을 제외하고 과거(t−1 이전)만 포함하도록 shift 후 rolling을 적용한다  

**정답: D**  
해설: 이동평균 특성은 예측 시점에 실제로 알 수 있는 과거 값만 포함해야 한다. `shift(1)` 후 `rolling(7)`처럼 현재·미래를 배제하고 과거만 집계해야 누수가 없다. 현재 시점 포함(A)이나 미래 평균(B)은 미래 정보 유입이고, 전체 기간 평균(C)도 미래가 과거 행에 스며드는 누수다.

---
