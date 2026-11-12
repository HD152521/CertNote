# Day 1 - Feature Engineering: The Art of Transforming Data into Numbers Models Can Read

## 📌 Key Takeaways

- Feature engineering is the whole job of turning raw data into a **numeric representation from which an algorithm can learn patterns**.
- Remember it as four axes — **scaling / encoding / missing values / outliers**.
- Distance- and gradient-based models (KNN, neural networks, linear regression) **require scaling**, while tree-based models (XGBoost) are insensitive to scale.
- Nominal categories use **One-Hot**, ordinal categories use **Ordinal**, and high-cardinality categories use **target/frequency encoding or embeddings**.
- Every transformation is **fit on train only, and test is only transformed** — this one principle prevents half of all data leakage.

## Why Feature Engineering Eats Most of the Time

In model training, the place where data scientists spend 70-80% of their time is not flashy algorithm tuning but feature engineering. Raw data is riddled with missing values, has units all over the place, and mixes in strings like "Seoul/Busan/Daegu." A model cannot read these as they are.

The MLA-C01 exam keeps asking, in scenario form, "which transformation should be applied to this data." What matters is **when to pick which transformation**, more than algorithm names.

```
[Raw data]
   │  Numeric units all over the place   → ① Scaling
   │  String categories mixed in         → ② Encoding
   │  Blanks punched into the data       → ③ Missing value handling
   │  Extreme values sticking out        → ④ Outlier handling
   │  Distribution skewed to one side    → ⑤ Numeric transformation and binning
   v
[Numeric matrix the model can read]
```

## Why Scaling Is Needed

If you feed salary (for example, 50,000,000) and age (for example, 35) into the same model, distance-based algorithms (KNN, K-Means) and gradient-descent-based models (linear regression, neural networks) are overwhelmed by the large-unit salary. When you compute the Euclidean distance between two points, the age difference is ignored and only the salary difference is reflected.

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler

# Standardization: transform to mean 0, standard deviation 1
# z = (x - mean) / std
scaler = StandardScaler()
X_std = scaler.fit_transform(X_train)

# Normalization: transform to the [0, 1] range
# x' = (x - min) / (max - min)
minmax = MinMaxScaler()
X_norm = minmax.fit_transform(X_train)
```

**Scaler selection table**

| Scaler | Transformation | Outlier influence | Result range | When |
|---------|------|-----------|----------|------|
| StandardScaler | (x − mean) / standard deviation | Affected | Roughly −3 to 3 | When close to a normal distribution, the general default |
| MinMaxScaler | (x − min) / (max − min) | Heavily affected | Exactly 0 to 1 | When the range is clear (pixels 0-255), neural network inputs |
| RobustScaler | (x − median) / IQR | Slightly affected | Variable | When there are many outliers |

**Whether scaling is needed by algorithm** — this is a point where exam answers diverge right away.

| Algorithm family | Scaling | Reason |
|-------------|---------|------|
| KNN, K-Means | Required | Distance calculation is dominated by units |
| Linear/logistic regression, SVM | Required | Gradient descent convergence speed, fairness of the regularization term |
| Neural networks | Required | Prevents activation saturation and unstable convergence |
| Decision tree, Random Forest, XGBoost | Not needed | The split criterion is a "threshold comparison," so units are irrelevant |

Gradient descent travels down the surface of the loss function, and if feature scales are all different, the loss surface becomes a long ellipse (elongated contour). The gradient then cannot head straight toward the minimum; it zigzags and oscillates, and convergence slows down. If scaling brings every axis to a similar range, the loss surface gets closer to concentric circles and convergence speeds up.

> ⚠️ **Trap**: A scaler must be **`fit` on train data only**, and then the validation/test data are `transform`ed with those statistics. If you `fit` including the test data, test information leaks into training, which is data leakage. `scaler.fit_transform(X_train)` followed by `scaler.transform(X_test)` is the correct answer.

## Encoding Categorical Variables

Categorical data such as "color: red/blue/green" has to be converted to numbers. The choice of method makes a large difference in model performance.

```python
import pandas as pd
from sklearn.preprocessing import OneHotEncoder, LabelEncoder

# One-Hot Encoding: each category becomes a separate binary column
# red -> [1,0,0], blue -> [0,1,0], green -> [0,0,1]
ohe = pd.get_dummies(df['color'])

# Label Encoding: assign an integer to each category
# red -> 0, blue -> 1, green -> 2
le = LabelEncoder()
df['color_encoded'] = le.fit_transform(df['color'])
```

**Encoding selection table**

| Method | Suitable categories | Dimension increase | Risk |
|------|-----------|----------|------|
| One-Hot | Nominal (no order), low cardinality | As many as the number of categories | Dimension explosion with high cardinality |
| Ordinal/Label | Ordinal (low/mid/high, S/M/L) | None | Learns a fake order if used on nominal data |
| Target encoding | High-cardinality nominal | None | Vulnerable to data leakage |
| Frequency encoding | High-cardinality nominal | None | Cannot distinguish categories with the same frequency |
| Embedding (deep learning) | Very high cardinality | Specified dimension | Needs training data and time |

**One-Hot encoding** is used for nominal categories with no order. Since there is no size relationship among red, blue, and green, giving them 0/1/2 with Label encoding makes the model learn the wrong order "green (2) > blue (1)." **Label/Ordinal encoding** suits ordinal categories that do have an order.

When there are thousands of categories (postal codes, product IDs), expanding them with One-Hot makes the dimensions explode (curse of dimensionality). In that case use target encoding, frequency encoding, or embeddings.

Target encoding is powerful but vulnerable to data leakage. If you include a row's own target when computing "the target mean of category A," you have effectively seen the answer in advance. To prevent this, use only the statistics of the other folds in a K-fold manner, or apply smoothing so that categories with few samples are pulled toward the overall mean.

## Handling Missing Values

Blanks are common in real-world data. Most algorithms (except some such as XGBoost) cannot accept NaN, so you must fill or remove them.

```python
from sklearn.impute import SimpleImputer, KNNImputer

# Impute with the mean/median/most frequent value
imp = SimpleImputer(strategy='median')  # mean, median, most_frequent, constant
X_filled = imp.fit_transform(X)

# KNN: impute with values from similar rows
knn_imp = KNNImputer(n_neighbors=5)
X_knn = knn_imp.fit_transform(X)
```

**Imputation strategy selection table**

| Situation | Strategy | Reason |
|------|------|------|
| Under 5% missing, random | Delete rows | Almost no bias and simple |
| Numeric, with outliers | Median imputation | The mean is pulled by outliers |
| Numeric, distribution close to normal | Mean imputation | Preserves the center of the distribution |
| Categorical | Most frequent value or an "Unknown" category | The new category may itself be information |
| The missingness itself carries meaning | Add a "was missing" flag column | Does not throw away information |
| Much missing data with a pattern | KNN or model-based imputation | Estimates from similar rows |

In statistics, missingness mechanisms are divided into three. **MCAR** (Missing Completely At Random), **MAR** (Missing At Random, depends on other observed variables), and **MNAR** (Missing Not At Random, depends on the missing value itself). With MCAR, even simple deletion creates no bias, but with MNAR (for example, high earners tending not to report income), simple imputation creates serious bias. Mean imputation artificially reduces variance and weakens correlations.

## Handling Outliers

An outlier may be a measurement error, or it may be a genuinely rare event (a fraudulent transaction). You must not remove it unconditionally.

```python
import numpy as np

# IQR method: values below Q1 - 1.5*IQR or above Q3 + 1.5*IQR are outliers
Q1, Q3 = np.percentile(data, [25, 75])
IQR = Q3 - Q1
lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
outliers = data[(data < lower) | (data > upper)]

# Z-score method: |z| > 3 are outliers
z = (data - data.mean()) / data.std()
outliers_z = data[np.abs(z) > 3]
```

| Detection method | Criterion | Distribution assumption | Robust to outliers? |
|----------|------|----------|-----------------|
| IQR | Below Q1 − 1.5×IQR / above Q3 + 1.5×IQR | None | Robust |
| Z-score | More than 3 standard deviations from the mean | Assumes a normal distribution | Outliers shake the mean and standard deviation |

**Decision table for choosing a treatment**

| What the outlier really is | Treatment | Example |
|-------------|------|-----|
| Measurement or entry error | Remove it or convert it to missing | Age 999 |
| Coding convention (sentinel value) | Interpret as missing, then impute | Area 99999 |
| A genuinely rare event that nonetheless shakes the model | Capping (winsorizing), log transform | Ultra-high-priced real estate |
| A genuinely rare event that is also the detection target | **Never remove** | Fraudulent transactions, equipment failures |

In a real estate price prediction model, the "area" column contained 99999. This was a sentinel value that coded missing as 99999, but the team trained on it without knowing, and the model predicted every house to be ultra-expensive. Checking the coding conventions of the raw data (the data dictionary) first is step zero of feature engineering.

> ⚠️ **Trap**: In fraud detection and anomaly detection, outliers are not noise but the **answer signal**. If you filter them out with IQR, the positive class disappears entirely. Outlier handling must always begin with a judgment, in the domain context, of "is this value an error, or a meaningful event?"

## Numeric Transformation and Binning

For skewed distributions, making them closer to a normal distribution with a log transform improves linear model performance. Binning, which splits a continuous variable into bins, groups age into "teens/20s/30s" to simplify nonlinear relationships or reduce the influence of outliers.

```python
import numpy as np
import pandas as pd

# Log transform: compress a long right tail (income, price)
df['log_income'] = np.log1p(df['income'])  # log(1+x), safe for 0

# Binning: continuous -> categorical
df['age_group'] = pd.cut(df['age'], bins=[0, 18, 35, 60, 100],
                          labels=['teen', 'young_adult', 'middle_aged', 'senior'])
```

| Transformation | Purpose | Cost |
|------|------|------|
| Log transform | Compress a long right tail to be closer to normal | Interpretation changes to log units |
| Square root transform | Weaker compression than log | Same as above |
| Binning | Simplify nonlinear relationships, soften outliers | Loses information within bins |
| Polynomial features | Let a linear model capture curved relationships | Dimension increase, overfitting risk |

Some SageMaker built-in algorithms require a specific input format. Linear Learner and XGBoost usually accept CSV/libsvm/RecordIO-protobuf, and for large-scale training RecordIO-protobuf is efficient. Also, XGBoost handles missing values internally by learning a default direction, so prior imputation is not always necessary. Knowing each algorithm's input requirements is also part of feature engineering.

## Transformation Order and Preventing Leakage

Bundling them into a pipeline lets you enforce order and leakage prevention at the code level.

```
[Split] train / validation / test
   │
   ├─ train ── fit_transform ──> Learn the transformer (mean, min, max, category list)
   │                                     │
   ├─ validation ── transform ───────────┤ Reuse the same transformer
   └─ test ─────── transform ────────────┘
```

```python
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder

preprocessor = ColumnTransformer([
    ("num", StandardScaler(), ["age", "income"]),
    ("cat", OneHotEncoder(handle_unknown="ignore"), ["region"]),
])
X_train_t = preprocessor.fit_transform(X_train)
X_test_t = preprocessor.transform(X_test)   # Do not fit on test — prevents leakage
```

`handle_unknown="ignore"` is important. Even if a new category appears only in test, it is handled as all zeros without an error, preventing failures at serving time.

## Derived Features: Pulling Out Information That Was Not There

As important as transformation is **creating new features from the original columns**. A model cannot work out by itself what humans take for granted.

| Original | Derived feature | Why it helps |
|------|----------|--------------|
| Timestamp | Day of week, time of day, month, holiday flag | Captures periodic patterns such as weekends and nights |
| Sign-up date | Days since sign-up (tenure) | Elapsed time has more predictive power than the absolute date |
| Transaction list | Count, sum, and mean over the last 30 days | A summary at a point in time is more useful than individual transactions |
| Address, coordinates | Region code, distance to the center | Raw coordinates are hard for a model to interpret |
| Text | Length, word count, whether specific keywords are present | Summarizes sentences as numbers |
| Two numeric columns | Ratio (debt/income), difference | The relationship itself is often the signal |

Derived features are a path where future leakage easily occurs. If transactions after the prediction time get mixed in when computing the "sum over the last 30 days," only the backtest gets better. Aggregate features must always have an explicit boundary so that they use **only data before the prediction time**.

## Transformation Selection Summary Table

| Data characteristic | Transformation to apply | Reason |
|-----------|-----------|------|
| Numerics with mixed units + distance-based model | Standardization/normalization | Large units dominate distance |
| Numerics with mixed units + tree model | No transformation needed | Split threshold comparison makes it irrelevant |
| Unordered low-cardinality categories | One-Hot | Does not create a fake order |
| Ordered categories | Ordinal | Preserves the order information |
| High-cardinality categories | Target/frequency encoding, embeddings | Avoids dimension explosion |
| Distribution with a long right tail | Log transform | Improves linear model fit |
| Numerics with many outliers | RobustScaler, capping | Median/IQR criteria are not shaken |
| Missingness carries meaning | Add a missing flag column | Does not throw away information |

In the next lesson we look at SageMaker Data Wrangler, which applies these transformations visually without code.

## 📖 Glossary

- **Feature engineering** : The whole job of refining raw data into numeric representations a model can learn from.
- **Scaling** : Bringing numeric features with mixed units into a similar range. Required for distance- and gradient-based models.
- **Standardization** : A transformation that makes the mean 0 and the standard deviation 1. The most reliable default choice.
- **Normalization** : A transformation that squeezes values into the 0-1 range. Used for data with a clear range.
- **Nominal** : A category with no order, such as Seoul/Busan. One-Hot is the standard.
- **Ordinal** : A category with an order, such as low/mid/high. Integer encoding is natural.
- **One-Hot encoding** : An encoding that makes one 0/1 column per category so that no order is imposed.
- **Cardinality** : The number of unique values in a categorical column. When high, use target or frequency encoding instead of One-Hot.
- **Target encoding** : An encoding that replaces each category with that category's target mean. Powerful but vulnerable to leakage.
- **Imputation** : Filling in empty values with the mean, median, most frequent value, and so on.

## 📝 Practice Questions

**Question 1.** You train a KNN model on a dataset with salary (average 50 million KRW) and age (average 40). Because salary has such a large scale, the model is likely to ignore the age information. What is the solution?

A) Divide salary in half  
B) Standardize with StandardScaler  
C) Delete the salary and age columns  
D) Shuffle the data randomly  

**Answer: B**  
Explanation: StandardScaler transforms every feature to mean 0 and standard deviation 1 so that a distance-based model (KNN) treats all axes equally. Manual transformation (A) is unscientific, deleting columns (C) loses information, and shuffling (D) does not solve the problem.

---

**Question 2.** Which statement most correctly describes the difference between One-Hot encoding and Label encoding?

A) One-Hot is slow and Label is fast  
B) One-Hot suits nominal (unordered) categories, and Label suits ordinal (ordered) categories  
C) Label encoding is more accurate in all cases  
D) The two produce the same result  

**Answer: B**  
Explanation: One-Hot expands each category into binary columns to represent unordered relationships, and Label assigns integers to represent ordered categories. Applying Label encoding to nominal data makes the model learn a false ordering. The selection criterion is the nature of the category, not speed or accuracy.

---

**Question 3.** Missing values are under 5% and randomly distributed. What is the most realistic way to handle them?

A) Impute all with the mean  
B) Delete the affected rows  
C) Use KNNImputer  
D) Impute all with 0  

**Answer: B**  
Explanation: If missingness is under 5% and completely at random (MCAR), deleting rows introduces no bias and is the simplest. Mean imputation (A) can reduce variance and distort correlations, KNN (C) is overkill for 5%, and imputing 0 (D) is arbitrary.

---

**Question 4.** After detecting outliers with the IQR method, you plan to apply the data to a fraud detection model. What is the most appropriate handling?

A) Delete all outliers  
B) Replace outliers with the mean  
C) Keep the outliers and let the model learn from them  
D) Train a separate model on the outliers only  

**Answer: C**  
Explanation: In fraud detection, outliers are the target (fraud events) themselves, so they must never be removed or manipulated. Keep all the data so the model learns the fraud patterns.

---

**Question 5.** When applying a Scaler to train/test data, what is the most important point to watch for?

A) Use the same scaler for train and test  
B) Transform test with a scaler fit on train (do not fit again on test)  
C) Fit a different scaler for train and test each  
D) The order in which the scaler is used does not matter  

**Answer: B**  
Explanation: The scaler computes its fit statistics from train only and transforms test with that scaler, preventing data leakage. Fitting again on test (C) mixes test information into training and distorts the realistic performance evaluation.

---
