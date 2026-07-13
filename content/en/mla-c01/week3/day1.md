# Day 1 - Feature Engineering: The Art of Transforming Data into Numbers Models Can Read

In ML training, data scientists spend 70–80% of their time not on flashy algorithm tuning but on feature engineering. Raw data has missing values, mixed units, and strings like "Seoul/Busan/Daegu." Models can't read that raw. Feature engineering is the entire process of transforming raw data into numerical representations that algorithms can learn patterns from.

The MLA-C01 exam constantly asks scenarios: "What transformation should be applied to this data?" The key is **when and which transformation to choose**, not algorithm names. Today we cover four major transformations: scaling, encoding, missing values, and outliers.

## Why Scaling Matters

Mixing salary (e.g., 50,000,000) and age (e.g., 35) in the same model overwhelms distance-based algorithms (KNN, K-Means) or gradient descent models (linear regression, neural nets) with the large-scale salary. Calculating Euclidean distance between two points ignores age difference and reflects only salary difference. Scaling normalizes all numeric features to a similar range.

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler

# Standardization: transform to mean 0, std 1
# z = (x - mean) / std
scaler = StandardScaler()
X_std = scaler.fit_transform(X_train)

# Normalization: transform to [0, 1] range
# x' = (x - min) / (max - min)
minmax = MinMaxScaler()
X_norm = minmax.fit_transform(X_train)
```

Standardization (StandardScaler) is robust when data approaches normal distribution or has outliers. Normalization (MinMaxScaler) is often used when value range is clear (e.g., image pixels 0–255) or as neural network input. With severe outliers, both wobble, so use RobustScaler (using median and IQR).

> 💡 **Related Theory**: Gradient descent descends along the loss surface; if feature scales differ, the loss surface becomes an elongated ellipse. Then gradients can't go straight to the minimum and oscillate in zigzag, slowing convergence. Scaling ranges equalize all axes, and the loss surface approaches concentric circles, speeding convergence. Also remember tree-based models (XGBoost, Random Forest) use threshold comparisons for splits, so they're scale-invariant.

> ⚠️ **Gotcha**: A scaler must **fit only on train data** and then `transform` validation/test with those statistics. Fitting including test data leaks test information into training. `scaler.fit_transform(X_train)` then `scaler.transform(X_test)` is correct.

## Categorical Variable Encoding

"Color: red/blue/green" categorical data must become numbers. Encoding choice significantly impacts model performance.

```python
import pandas as pd
from sklearn.preprocessing import OneHotEncoder, LabelEncoder

# One-Hot Encoding: each category becomes separate binary column
# red -> [1,0,0], blue -> [0,1,0], green -> [0,0,1]
ohe = pd.get_dummies(df['color'])

# Label Encoding: each category gets an integer
# red -> 0, blue -> 1, green -> 2
le = LabelEncoder()
df['color_encoded'] = le.fit_transform(df['color'])
```

**One-Hot encoding** suits nominal (unordered) categories. Red, blue, green have no size relation; assigning 0/1/2 with Label encoding makes the model learn the false ordering "green (2) > blue (1)." **Label/Ordinal encoding** fits ordered categories like low/medium/high or S/M/L.

The problem arises with thousands of categories (postal codes, product IDs). One-Hot expansion explodes dimensions (curse of dimensionality). Use **target encoding** (replace with category's target mean), **frequency encoding** (replace with category frequency), or embeddings (deep learning).

> 🔍 **Deeper Dive**: Target encoding is powerful but prone to leakage. Computing "category A's target mean" including the row's own target means seeing the answer. Prevent this with K-fold (use only other folds' stats) or smoothing (pull low-sample categories toward global mean).

## Missing Value Handling

Real data has blanks. Most algorithms (except some like XGBoost) can't accept NaN, so fill or remove.

```python
from sklearn.impute import SimpleImputer, KNNImputer

# Fill with mean/median/mode
imp = SimpleImputer(strategy='median')  # mean, median, most_frequent, constant
X_filled = imp.fit_transform(X)

# KNN: fill with similar rows' values
knn_imp = KNNImputer(n_neighbors=5)
X_knn = knn_imp.fit_transform(X)
```

Choice depends on missing amount and pattern. Under 5% and random, row deletion is viable. Numeric: median (robust to outliers), categorical: mode. When missingness is meaningful ("income not reported" indicates group), add a "missing flag" column.

> 💡 **Related Theory**: Missing mechanisms split three ways statistically. **MCAR** (Missing Completely At Random), **MAR** (Missing At Random, depends on observed variables), **MNAR** (Missing Not At Random, depends on the missing value itself). MCAR allows simple deletion without bias; MNAR (e.g., high earners skip income) makes simple imputation seriously biased. Exams ask "why does mean imputation distort distribution?" — mean imputation artificially reduces variance, weakening correlations.

## Outlier Handling

Outliers might be measurement errors or genuine rare events (fraud). Don't just delete. Common detection: IQR and Z-score.

```python
import numpy as np

# IQR method: flag below Q1 - 1.5*IQR or above Q3 + 1.5*IQR
Q1, Q3 = np.percentile(data, [25, 75])
IQR = Q3 - Q1
lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
outliers = data[(data < lower) | (data > upper)]

# Z-score method: flag |z| > 3
z = (data - data.mean()) / data.std()
outliers_z = data[np.abs(z) > 3]
```

IQR needs no distribution assumption and is robust; Z-score assumes normality. Handling: remove, cap (winsorize, trim to bounds), or transform (log/sqrt compress distribution) based on domain. In fraud detection, outliers are answers—never delete.

> 📚 **Case Study**: A real estate price model had 99999 in the "area" column—sentinel value coding missing data. The team didn't know, trained as-is, and the model predicted all homes as ultrapricey. Checking the raw data's coding convention (data dictionary) is step zero of feature engineering.

## Numeric Transformation and Binning

Skewed distributions become closer to normal via log transform, improving linear model performance. Binning groups continuous into intervals—"teen/20s/30s" simplifies nonlinear relations or reduces outlier impact.

```python
import numpy as np
import pandas as pd

# Log transform: compress right-tailed skew (income, price)
df['log_income'] = np.log1p(df['income'])  # log(1+x), safe for 0

# Binning: continuous → categorical
df['age_group'] = pd.cut(df['age'], bins=[0, 18, 35, 60, 100],
                          labels=['teen', 'young adult', 'middle-aged', 'senior'])
```

> 🔍 **Deeper Dive**: Some SageMaker built-in algorithms require specific formats. Linear Learner and XGBoost typically accept CSV/libsvm/RecordIO-protobuf; RecordIO-protobuf is efficient for large training. Also, XGBoost internally learns to handle missing values in a default direction, so pre-imputation isn't always needed. Knowing algorithm input specs is part of feature engineering.

## Summary

Feature engineering is easy to remember in four axes: ① **Scaling** (standardization vs normalization vs robust), ② **Encoding** (One-Hot=nominal, Ordinal=ordered, target/embeddings=high-dim), ③ **Missing values** (mean/median/mode/KNN, consider mechanism), ④ **Outliers** (IQR vs Z-score, remove/cap/transform). And the principle behind every problem: **fit only on train, transform test** to prevent leakage.

Next, we'll see SageMaker Data Wrangler, applying these transformations visually without code.

---

## 📝 연습 문제

**문제 1.** 연봉(평균 5000만) 과 나이(평균 40)를 가진 데이터셋에서 KNN 모델을 학습한다. 연봉의 단위가 커서 모델이 나이 정보를 무시할 가능성이 크다. 해결책은?

A) 연봉을 절반으로 나눈다  
B) StandardScaler로 표준화한다  
C) 연봉과 나이 컬럼을 삭제한다  
D) 데이터를 무작위로 섞는다  

**정답: B**  
해설: StandardScaler는 모든 특성을 평균 0, 표준편차 1로 변환하여 거리 기반 모델(KNN)이 모든 축을 동등하게 취급하게 한다. 수동 변환(A)은 비과학적이고, 컬럼 삭제(C)는 정보 손실이며, 섞기(D)는 문제를 해결하지 못한다.

---

**문제 2.** One-Hot 인코딩과 Label 인코딩의 차이로 가장 옳은 설명은?

A) One-Hot은 느리고, Label은 빠르다  
B) One-Hot은 명목형(순서 없음) 범주에, Label은 서열형(순서 있음) 범주에 적합하다  
C) Label 인코딩이 모든 경우 더 정확하다  
D) 둘은 같은 결과를 낸다  

**정답: B**  
해설: One-Hot은 각 범주를 이진 열로 펼쳐 순서 없는 관계를 표현하고, Label은 정수를 매겨 순서 있는 범주를 표현한다. 명목형을 Label로 하면 모델이 가짜 순서를 학습한다. 속도나 정확도가 아니라 범주의 특성이 선택 기준이다.

---

**문제 3.** 결측치가 5% 미만이고 무작위로 분포되어 있다. 가장 현실적인 처리 방법은?

A) 모두 평균으로 대치한다  
B) 해당 행을 삭제한다  
C) KNNImputer를 사용한다  
D) 모두 0으로 대치한다  

**정답: B**  
해설: 결측이 5% 미만이고 완전 무작위(MCAR)이면 행 삭제는 편향을 만들지 않으며 가장 간단하다. 평균 대치(A)는 분산 감소와 상관 왜곡을 일으킬 수 있고, KNN(C)은 5%에 과하며, 0 대치(D)는 임의적이다.

---

**문제 4.** IQR 방법으로 이상치를 탐지한 후, 사기 탐지 모델에 적용하려 한다. 가장 적절한 처리는?

A) 이상치를 모두 삭제한다  
B) 이상치를 평균값으로 대체한다  
C) 이상치를 유지하고 모델이 학습하게 한다  
D) 이상치만 별도 모델로 학습한다  

**정답: C**  
해설: 사기 탐지에서는 이상치가 곧 타깃(사기 사건)이므로 절대 제거하거나 조작하면 안 된다. 모든 데이터를 유지해 모델이 사기 패턴을 학습하게 한다.

---

**문제 5.** Scaler를 train/test 데이터에 적용할 때 가장 중요한 주의점은?

A) train과 test에 동일한 스케일러를 사용한다  
B) train으로 fit한 스케일러로 test를 transform한다 (test로 다시 fit하지 않음)  
C) train과 test 각각 다른 스케일러를 fit한다  
D) 스케일러 사용 순서는 상관없다  

**정답: B**  
해설: Scaler는 train으로만 fit 통계량을 계산하고, 그 스케일러로 test를 transform하여 데이터 누수를 방지한다. test로 다시 fit(C)하면 test 정보가 학습에 섞여 현실 성능 평가가 왜곡된다.

---
