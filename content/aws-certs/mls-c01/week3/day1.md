# Day 1 - Data Cleaning: Missing Values, Outlier Detection, Duplicates and Errors

The first step in exploratory data analysis (EDA) is "making data clean." Domain 2 (Exploratory Data Analysis) in the MLS-C01 exam accounts for about 24% of the test, with **data cleaning** at its core. No matter how excellent a model architecture is, "garbage in, garbage out" results when data containing missing values, outliers, and duplicates is fed into it.

Today, we address three types of "dirt"—**missing values**, **outliers**, and **duplicates and errors**. We examine methods to detect each, treatment strategies, and the impact these choices have on models.

## Handling Missing Values: Starting with Mechanisms

Before treating missing values, we must first understand **why they are missing**. In statistics, missing mechanisms are classified into three types.

| Mechanism | Meaning | Example |
|-----------|---------|---------|
| **MCAR** (Missing Completely At Random) | Missing is completely random, unrelated to other variables | Random omission due to sensor glitch |
| **MAR** (Missing At Random) | Missing depends on observed other variables | High-income earners more often refuse income response |
| **MNAR** (Missing Not At Random) | Missing depends on the value itself | Very low credit score holders hide their scores |

If MCAR, deleting rows introduces little bias; if MNAR, simple deletion causes serious bias. Strategy varies by mechanism.

> 💡 **Related Theory**: The missing mechanism classification (MCAR/MAR/MNAR) is a framework proposed by statistician Donald Rubin in 1976. The key insight is "the validity of missing treatment depends on why data is missing." Simple mean imputation is unbiased only under MCAR assumption; applying it to MNAR data distorts the distribution. Thus, before blindly using `fillna(mean)`, visualizing missing patterns (e.g., missing heatmap) is EDA best practice.

## Missing Value Imputation Strategies

Missing treatment broadly splits into **deletion** and **imputation**.

| Strategy | Method | Best For | Risk |
|----------|--------|----------|------|
| Row deletion (listwise) | Remove rows with missing | Very low missing rate and MCAR | Data loss, sample bias |
| Mean/median imputation | Fill numeric missing with statistics | Quick baseline | Variance reduction, correlation distortion |
| Mode imputation | Fill categorical missing with mode | Categorical | Over-representation of majority |
| KNN imputation | Estimate from neighbor values | Inter-variable correlation exists | Computation cost, scale sensitivity |
| Model-based imputation | Predict via regression/MICE | MAR, strong inter-variable relationships | Complexity, overfitting risk |
| Indicator variable | Create "was missing" flag column | MNAR, missing is itself a signal | Dimension increase |

Median is more robust to outliers than mean, so median imputation is safer for skewed numeric data.

```python
import pandas as pd
from sklearn.impute import SimpleImputer, KNNImputer

df = pd.read_csv("raw/customers.csv")

# Numeric: median imputation (robust to outliers)
num_imputer = SimpleImputer(strategy="median")
df[["age", "income"]] = num_imputer.fit_transform(df[["age", "income"]])

# Categorical: mode imputation
cat_imputer = SimpleImputer(strategy="most_frequent")
df[["region"]] = cat_imputer.fit_transform(df[["region"]])

# KNN imputation if inter-variable correlation is strong
knn_imputer = KNNImputer(n_neighbors=5)
df_num = pd.DataFrame(knn_imputer.fit_transform(df.select_dtypes("number")))
```

> 💡 **Related Theory**: MICE (Multiple Imputation by Chained Equations) repeatedly regresses each missing variable on others, capturing "imputation uncertainty" that single imputation ignores. Multiple imputation corrects the problem where mean imputation artificially reduces variance and artificially narrows confidence intervals. At exam level, understanding that "if inter-variable relationships are strong, KNN/model-based imputation is more accurate than simple imputation" is sufficient.

> ⚠️ **Pitfall**: Imputation must **fit only on training data**, and apply those statistics to validation/test. Computing mean on all data causes **data leakage** where test information leaks into training, inflating performance. That's why scikit-learn uses `fit_transform` on train and `transform` only on test.

## Outlier Detection and Treatment

An outlier is a value significantly distant from other observations. It may be input error or a genuine rare event, so it must not be indiscriminately removed.

Detection methods:

- **Z-score**: How many standard deviations from the mean. |z| > 3 is conventionally considered an outlier. Depends on normal distribution assumption.
- **IQR (Interquartile Range)**: Values below Q1 − 1.5×IQR or above Q3 + 1.5×IQR are outliers. No distribution assumption, more robust.
- **Visualization**: Visually confirm with boxplots, scatter plots, histograms.
- **Model-based**: Isolation Forest, DBSCAN (density-based), Local Outlier Factor, etc.

```python
import numpy as np

# IQR-based outlier boundary
Q1 = df["income"].quantile(0.25)
Q3 = df["income"].quantile(0.75)
IQR = Q3 - Q1
lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR

# Winsorizing: clipping to boundary (preserve instead of delete)
df["income"] = df["income"].clip(lower, upper)
```

Treatment methods vary by situation.

| Treatment | Description | Best For |
|-----------|-------------|----------|
| Deletion | Remove outlier rows | Clear input errors |
| Winsorizing/Clipping | Replace with boundary value | Reduce extreme impact while preserving |
| Transformation | Compress via log/sqrt transform | Right-skewed long-tailed distribution |
| Retention | Leave as is | When outliers are target (fraud detection) |

> 💡 **Related Theory**: IQR is more robust than Z-score because of the **breakdown point** concept. Mean and standard deviation are shaken by a single outlier (breakdown point 0%), while median and quartiles remain stable even if up to 25% of data is corrupted. Outlier detection tools themselves should not be swayed by outliers, so robust statistics (median, IQR) are preferred. In fraud detection or anomaly where outliers are themselves the answer, the key exam point is not deletion but "learning those outliers."

## Duplicates and Errors

The final "dirt" is **duplicate rows** and **logical errors**.

- **Complete duplicates**: All columns are identical. Usually from collection duplication → remove.
- **Partial duplicates**: Same entity with different notation appearing multiple times (e.g., "Seoul" vs Korean spelling). Normalize then consolidate.
- **Logic errors**: Negative age, future date of birth, totals not matching partial sums, etc.

```python
# Remove complete duplicates
df = df.drop_duplicates()

# Duplicates by key (keep latest record)
df = df.sort_values("updated_at").drop_duplicates(subset=["user_id"], keep="last")

# Filter logic errors
df = df[(df["age"] >= 0) & (df["age"] <= 120)]
```

> ⚠️ **Pitfall**: Removing duplicates only right before model training allows the same record to scatter across train and validation sets after splitting, causing **leakage**. Especially for time-series or user-level data, deduplication and key cleaning must be completed before splitting for honest evaluation.

## Summary

The core of data cleaning is: (1) for missing values, first understand **why they're missing (MCAR/MAR/MNAR)** then choose strategy; (2) for outliers, detect with **robust statistics (IQR)** but don't indiscriminately remove; (3) for duplicates and errors, **clean before splitting** to prevent leakage. All imputation and cleaning statistics are computed from training data only.

Next, we'll look at **feature engineering (scaling, encoding, binning)** that transforms cleaned data for models to learn well.

---

## 📝 연습 문제

**문제 1.** 오른쪽으로 길게 치우친(right-skewed) 소득 변수에 결측치가 있다. 단순 대치로 베이스라인을 만들 때 가장 안전한 선택은?

A) 평균값으로 대치  
B) 0으로 대치  
C) 중앙값으로 대치  
D) 결측 포함 행을 모두 삭제  

**정답: C**  
해설: 치우친 분포에서는 평균이 이상치·긴 꼬리에 끌려가 대표성이 떨어진다. 중앙값은 이상치에 강건해 치우친 수치형의 단순 대치로 가장 안전하다. 평균 대치(A)는 꼬리에 왜곡되고, 0 대치(B)는 의미 없는 값을 주입해 분포를 망친다. 행 삭제(D)는 결측이 MCAR이고 비율이 매우 낮을 때만 정당하며 정보 손실 위험이 크다.

---

**문제 2.** 사기 탐지 모델을 만드는데, 거래 금액에서 극단적으로 큰 값들이 다수 발견됐다. 이 이상치에 대한 가장 적절한 태도는?

A) Z-score 3 이상을 모두 삭제한다  
B) 이상치가 사기의 핵심 신호일 수 있으므로 함부로 제거하지 않는다  
C) 모든 이상치를 평균으로 대치한다  
D) IQR 경계로 즉시 클리핑한다  

**정답: B**  
해설: 사기 탐지에서 극단적 거래는 제거 대상 노이즈가 아니라 오히려 탐지해야 할 **정답 신호**일 가능성이 높다. 무조건 삭제·대치·클리핑(A, C, D)하면 모델이 잡아야 할 패턴을 지워 버린다. 이상치 처리는 도메인 맥락에 따라 결정해야 한다.

---

**문제 3.** scikit-learn으로 결측치 평균 대치를 적용할 때 데이터 누수를 피하는 올바른 방법은?

A) 전체 데이터셋으로 평균을 계산해 모든 행에 적용  
B) 학습셋으로 `fit`한 imputer를 테스트셋에는 `transform`만 적용  
C) 테스트셋의 평균으로 테스트셋을 대치  
D) 학습과 테스트를 합쳐 한 번에 대치한 뒤 분할  

**정답: B**  
해설: 대치 통계량(평균 등)은 학습셋에서만 산출해야 하며, 테스트셋에는 그 값을 `transform`으로 적용한다. 전체 데이터로 평균을 구하거나(A, D) 테스트셋 통계를 쓰면(C) 테스트 정보가 학습에 새어 들어가 성능이 낙관적으로 부풀려지는 데이터 누수가 발생한다.

---

**문제 4.** 정규분포를 따르지 않고 분포 가정 없이 이상치를 탐지하려 한다. 가장 적절한 방법은?

A) Z-score 기준 \|z\| > 3  
B) 평균 ± 2 표준편차  
C) IQR 기반 Q1 − 1.5×IQR, Q3 + 1.5×IQR  
D) 최댓값과 최솟값만 확인  

**정답: C**  
해설: IQR(사분위 범위) 방법은 분포의 정규성을 가정하지 않고 사분위수에 기반하므로, 치우치거나 비정규 분포에 강건하다. Z-score(A)와 평균±표준편차(B)는 정규분포와 이상치에 민감한 평균/표준편차에 의존한다. 최대·최소(D)만으로는 이상치 경계를 정의할 수 없다.

---

**문제 5.** 사용자 단위 데이터에서 중복 레코드를 정리하는 시점으로 가장 올바른 것은?

A) 학습/검증 분할 이후 각 분할별로 따로 제거  
B) 모델 학습 직전에만 제거  
C) 학습/검증 분할 **이전**에 키 기준 중복을 정리  
D) 평가 결과를 본 뒤 필요하면 제거  

**정답: C**  
해설: 같은 사용자의 중복 레코드가 분할 후 학습셋과 검증셋에 흩어지면 데이터 누수로 평가가 부풀려진다. 따라서 분할 이전에 키 기준으로 중복을 정리해야 평가가 정직하다. 분할 후 처리(A)나 학습 직전 처리(B)는 이미 누수가 발생한 뒤이고, 평가 후 처리(D)는 순서가 거꾸로다.

---
