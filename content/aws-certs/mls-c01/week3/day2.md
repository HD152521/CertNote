# Day 2 - Feature Engineering: Scaling, Encoding, and Binning

After data cleaning, it's time to **transform** your data into a form that models can learn from effectively. Feature engineering is so critical that it's often said to account for 80% of model performance—a testament to its significance in the ML pipeline.

Today, we'll cover three core transformations: **scaling** to align numeric feature ranges, **encoding** to convert categorical data to numbers, and **binning** to group continuous values into discrete intervals. We'll explore why each technique is necessary for different algorithms.

## Scaling: Normalization vs. Standardization

Many algorithms are sensitive to the **scale (magnitude)** of features. If you feed age (0–100) and income (0–100M) directly into an algorithm, income will dominate distance and gradient calculations.

| Technique | Formula | Output Range | Outlier Sensitivity |
|------|------|------|------|
| **Min-Max Normalization** | (x − min) / (max − min) | [0, 1] | Very sensitive |
| **Standardization (Z-score)** | (x − μ) / σ | Mean 0, Var 1 | Sensitive |
| **RobustScaler** | (x − median) / IQR | Variable | Robust |
| **MaxAbs** | x / \|max\| | [−1, 1] | Sensitive |

Scaling is **required** for: distance-based algorithms (KNN, K-means), gradient-based algorithms (linear/logistic regression, neural networks), models with regularization terms (Ridge/Lasso), SVM, and PCA.

Scaling is **unnecessary** for: tree-based algorithms (Decision Tree, Random Forest, XGBoost). Trees only look for split points within each feature independently, making them invariant to monotonic transformations.

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler

# Standardization: standard for neural networks and linear models
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)   # not fit!

# Use RobustScaler when outliers are abundant
robust = RobustScaler()
X_train_robust = robust.fit_transform(X_train)
```

> 💡 **Key Theory**: Gradient descent is sensitive to scale because of the contour shape of the loss function. When features have different scales, contours become elongated ellipses, and gradients converge slowly toward the minimum in a zigzag pattern. Standardizing all features to the same scale makes contours nearly circular, enabling faster and more stable convergence. For distance-based models (KNN, K-means), scaling prevents large-scale features from dominating Euclidean distance calculations.

> ⚠️ **Pitfall**: Like an imputer, scalers must **fit only on training data**. Using test set min/max/mean is data leakage. Additionally, Min-Max is vulnerable to extreme outliers—a single outlier pulls the max value up, compressing all other values near 0. If outliers are suspected, RobustScaler is safer.

## Encoding: Converting Categorical to Numeric

Most algorithms accept only numeric input, so categorical variables must be converted to numbers.

| Encoding | Method | Best For | Caution |
|------|------|------|------|
| **Label Encoding** | Category → integer (0,1,2…) | Ordinal data, tree models | Misleads linear models with false order on nominal data |
| **One-Hot Encoding** | Create 0/1 column per category | Nominal data, low cardinality | Dimensionality explosion with high cardinality |
| **Ordinal Encoding** | Map to integers with meaningful order | Grades (low/mid/high) | Only when order is genuine |
| **Target Encoding** | Replace category with target mean | High cardinality | Risk of data leakage and overfitting |
| **Frequency Encoding** | Replace category with frequency | High cardinality | Collision when frequencies match |

Core distinction: **Is there an order?** For ordinal data like grades (low < mid < high), Ordinal/Label encoding is natural. For unordered categories like colors (red/blue/green), One-Hot is appropriate. Using Label Encoding on colors in a linear model creates a false order: "green > blue > red".

```python
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder

# Nominal: one-hot
ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
X_color = ohe.fit_transform(df[["color"]])

# Ordinal: explicit order
oe = OrdinalEncoder(categories=[["low", "mid", "high"]])
df["level_enc"] = oe.fit_transform(df[["level"]])
```

Target encoding is powerful but risky.

```python
# Target encoding (prevent leakage by computing statistics on train folds only)
means = X_train.groupby("city")["target"].mean()
X_train["city_te"] = X_train["city"].map(means)
X_test["city_te"] = X_test["city"].map(means)   # apply training statistics
```

> 💡 **Key Theory**: Target encoding avoids the dimensionality explosion of one-hot encoding for high-cardinality features (e.g., thousands of postal codes) by compressing the relationship with the target into a single column. However, creating features from the target itself causes **target leakage**—the model peeks at the answer. K-fold target encoding (compute statistics on each fold using other folds) or smoothing (blend category mean with global mean weighted by sample count) mitigate this. For exams, the key tradeoff is: high cardinality → one-hot causes explosion, target encoding requires leakage prevention.

> ⚠️ **Pitfall**: If one-hot encoding encounters unseen categories in the test set, it will error. Set `handle_unknown="ignore"` to treat unknown categories as all-zero vectors for production safety.

## Binning: Grouping Continuous Values into Intervals

Binning divides a continuous variable into discrete intervals (bins) and treats them like categories.

| Approach | Description | Example |
|------|------|------|
| **Equal-width** | Divide value range into equal-sized intervals | 0–10, 10–20, 20–30 |
| **Equal-frequency** | Each interval contains equal sample counts | Quartile-based |
| **Domain-based** | Divide using meaningful domain boundaries | Age → child/adult/senior |

Benefits of binning:

- **Captures nonlinearity**: Linear models can learn nonlinear patterns (e.g., "purchase rate spikes ages 30–40") through bin dummy variables.
- **Mitigates outliers and noise**: Extreme values fall into the same top bin, reducing their influence.
- **Improves interpretability**: "High-income bracket" is easier to explain than continuous income.

The drawback is **information loss**. Fine-grained differences within a bin disappear.

```python
import pandas as pd

# Equal-width binning
df["age_bin"] = pd.cut(df["age"], bins=[0, 18, 35, 60, 120],
                       labels=["minor", "young", "middle", "senior"])

# Equal-frequency binning (quartiles)
df["income_q"] = pd.qcut(df["income"], q=4, labels=["Q1", "Q2", "Q3", "Q4"])
```

> 💡 **Key Theory**: Binning is a tool for adjusting the bias-variance tradeoff. Using continuous values, linear models express only monotonic relationships (high bias). Converting to bin dummies lets each bin learn its independent effect, capturing nonlinearity (lower bias). However, creating too many bins reduces samples per bin, destabilizing estimates (higher variance). Equal-frequency binning mitigates this variance issue by balancing sample counts across bins.

## Summary

The three pillars of feature engineering are: (1) **Scaling**—mandatory for distance and gradient-based models, unnecessary for trees; use RobustScaler with many outliers; (2) **Encoding**—Ordinal for ordered data, One-Hot for nominal, Target Encoding for high cardinality (watch for leakage); (3) **Binning**—captures nonlinearity and improves interpretability but sacrifices granularity. The universal principle: **fit all transformations only on training data** to prevent leakage.

Next, we'll explore feature engineering for specialized data types like dates and text, plus handling high-dimensional categorical features.

---

## 📝 연습 문제

**문제 1.** 다음 중 입력 피처 스케일링이 **필요 없는** 알고리즘은?

A) K-최근접 이웃(KNN)  
B) 서포트 벡터 머신(SVM)  
C) XGBoost (트리 부스팅)  
D) 로지스틱 회귀  

**정답: C**  
해설: 트리 기반 모델(XGBoost, Random Forest 등)은 각 피처 내에서 분할 기준점만 찾으므로 단조 변환에 불변이라 스케일링이 불필요하다. KNN(A)·SVM(B)은 거리 기반, 로지스틱 회귀(D)는 기울기 기반이라 모두 스케일에 민감해 스케일링이 권장된다.

---

**문제 2.** "색깔(빨강/파랑/초록)"처럼 순서가 없는 명목형 변수를 선형 회귀에 넣으려 한다. 가장 적절한 인코딩은?

A) Label Encoding (빨강=0, 파랑=1, 초록=2)  
B) One-Hot Encoding  
C) 그대로 문자열 입력  
D) Min-Max 정규화  

**정답: B**  
해설: 명목형에 Label Encoding을 쓰면 "초록 > 파랑 > 빨강" 같은 존재하지 않는 순서를 부여해 선형 모델을 오도한다(A). One-Hot은 각 범주를 독립 0/1 컬럼으로 만들어 가짜 순서를 없앤다. 선형 회귀는 문자열을 받지 못하고(C), 정규화(D)는 수치형 스케일링 기법이라 범주형 인코딩이 아니다.

---

**문제 3.** 우편번호처럼 수천 개의 고유값을 가진 고카디널리티 범주형 변수를 인코딩할 때, 차원 폭발을 피하지만 데이터 누수에 주의해야 하는 기법은?

A) One-Hot Encoding  
B) Target Encoding  
C) Ordinal Encoding (무작위 정수)  
D) Standard Scaling  

**정답: B**  
해설: 타깃 인코딩은 범주를 타깃 평균값으로 치환해 고카디널리티를 한 컬럼으로 압축하지만, 같은 데이터의 타깃으로 피처를 만들면 타깃 누수가 생기므로 K-fold/스무딩이 필요하다. One-Hot(A)은 수천 컬럼으로 차원이 폭발하고, 무작위 정수 ordinal(C)은 가짜 순서를 만들며, 스케일링(D)은 범주형 인코딩이 아니다.

---

**문제 4.** Min-Max 정규화를 사용할 때 한 변수에 극단적 이상치가 존재한다. 이때 발생하는 문제와 대안으로 옳은 것은?

A) 이상치가 max를 끌어올려 나머지 값이 0 근처로 압축됨 → RobustScaler 사용  
B) 정규화 결과 범위가 [0,1]을 벗어남 → 표준화 사용  
C) 이상치가 자동 제거됨 → 추가 처리 불필요  
D) 평균이 1이 됨 → Min-Max 재적용  

**정답: A**  
해설: Min-Max는 max에 의존하므로 큰 이상치 하나가 분모를 키워 다른 값들을 0 부근으로 압축한다. 중앙값과 IQR을 쓰는 RobustScaler가 이상치에 강건한 대안이다. Min-Max는 정상적으로 [0,1]에 매핑하고(B 오류), 이상치를 제거하지 않으며(C 오류), 평균을 1로 만들지 않는다(D 오류).

---

**문제 5.** 선형 모델이 "나이가 특정 구간에서 구매율이 급변하는" 비선형 관계를 포착하도록 돕는 특성 공학 기법은?

A) 표준화  
B) 비닝(구간화)  
C) 행 삭제  
D) Label Encoding  

**정답: B**  
해설: 비닝은 연속형 나이를 구간으로 나눠 각 구간을 더미 변수로 만들므로, 선형 모델도 구간별 독립 효과를 학습해 비선형 관계를 표현할 수 있다. 표준화(A)는 스케일만 바꿀 뿐 선형성을 유지하고, 행 삭제(C)는 데이터 정제이며, Label Encoding(D)은 범주형 인코딩이라 무관하다.

---
