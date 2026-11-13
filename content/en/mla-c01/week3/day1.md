# Day 1 - Feature Engineering: The Art of Turning Data into Numbers a Model Can Read

## 📌 Key Takeaways

- Feature engineering is the whole job of turning raw data into a **numeric representation from which an algorithm can learn patterns**.
- Memorize it as 4 pillars: **scaling / encoding / missing values / outliers**.
- Distance- and gradient-based models (KNN, neural networks, linear regression) **require scaling**, while tree-based models (XGBoost) are insensitive to scale.
- Nominal variables get **One-Hot**, ordinal variables get **Ordinal**, and high-cardinality variables get **target/frequency encoding or embeddings**.
- Every transform is **fit on train only, transform on test**. This one principle prevents half of all data leakage.

## Why Feature Engineering Eats Most of the Time

When training models, the place where data scientists spend 70-80% of their time is not fancy algorithm tuning but feature engineering. Raw data has holes of missing values, units that are all over the place, and strings like "Seoul/Busan/Daegu" mixed in. A model can't read these as they are.

The MLA-C01 exam keeps asking, through scenarios, "what transform should be applied to this data?" What matters is **which transform to choose and when**, more than algorithm names.

```
[raw data]
   │  numeric units are all over the place  → ① scaling
   │  string categories mixed in            → ② encoding
   │  blank cells                           → ③ missing-value handling
   │  extreme values sticking out           → ④ outlier handling
   │  distribution skewed to one side       → ⑤ numeric transforms / binning
   v
[a numeric matrix the model can read]
```

## Why Scaling Is Needed

If you feed annual salary (e.g., 50,000,000) and age (e.g., 35) into the same model, distance-based algorithms (KNN, K-Means) and gradient-descent-based models (linear regression, neural networks) are overwhelmed by the larger-unit salary. Compute the Euclidean distance between two points and the age difference is ignored; only the salary difference is reflected.

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

| Scaler | Transform | Outlier sensitivity | Output range | When |
|---------|------|-----------|----------|------|
| StandardScaler | (x−mean)/std | Affected | Roughly −3 to 3 | When close to a normal distribution; the general default |
| MinMaxScaler | (x−min)/(max−min) | Strongly affected | Exactly 0 to 1 | When the range is clear (pixels 0-255); neural network input |
| RobustScaler | (x−median)/IQR | Slightly affected | Variable | When there are many outliers |

**Whether each algorithm needs scaling**: this is a point where exam questions split right away.

| Algorithm family | Scaling | Reason |
|-------------|---------|------|
| KNN, K-Means | Required | Distance computation is dominated by units |
| Linear/logistic regression, SVM | Required | Gradient descent convergence speed, fairness of the regularization term |
| Neural networks | Required | Prevents activation saturation and unstable convergence |
| Decision tree, Random Forest, XGBoost | Not needed | Split criteria are "threshold comparisons," so units don't matter |

Gradient descent walks down the surface of the loss function, and if feature scales are all different, the loss surface becomes an elongated ellipse (elongated contour). The gradient then can't head straight toward the minimum; it zigzags and oscillates, and convergence is slow. If scaling brings all axes to a similar range, the loss surface becomes closer to concentric circles and convergence is faster.

> ⚠️ **Pitfall**: A scaler must be **`fit` on train data only**, and then use those statistics to `transform` validation/test. If you `fit` including the test data, test information leaks into training, causing data leakage. `scaler.fit_transform(X_train)` followed by `scaler.transform(X_test)` is the correct answer.

## Encoding Categorical Variables

Categorical data like "color: red/blue/green" must be converted to numbers. The choice of method greatly affects model performance.

```python
import pandas as pd
from sklearn.preprocessing import OneHotEncoder, LabelEncoder

# One-Hot Encoding: each category becomes its own binary column
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
| Ordinal/Label | Ordinal (low/medium/high, S/M/L) | None | Used on nominal data, it learns a fake order |
| Target encoding | High-cardinality nominal | None | Vulnerable to data leakage |
| Frequency encoding | High-cardinality nominal | None | Cannot distinguish categories with the same frequency |
| Embedding (deep learning) | Very high cardinality | The specified dimension | Needs training data and time |

**One-Hot encoding** is used for nominal categories with no order. Since there is no magnitude relationship among red, blue, and green, giving them 0/1/2 with Label encoding makes the model learn the wrong order "green (2) > blue (1)." **Label/Ordinal encoding** suits ordinal categories that have an order.

When there are thousands of categories (postal codes, product IDs), expanding them with One-Hot causes a dimension explosion (the curse of dimensionality). In that case, use target encoding, frequency encoding, or embeddings.

Target encoding is powerful but vulnerable to data leakage. When you compute "the target mean of category A," including that row's own target means you have peeked at the answer in advance. To prevent this, use only the statistics of the other folds in a K-fold manner, or apply smoothing so that categories with few samples are pulled toward the overall mean.

## Handling Missing Values

Blank cells are common in real data. Most algorithms (except some such as XGBoost) cannot accept NaN, so you have to fill or remove them.

```python
from sklearn.impute import SimpleImputer, KNNImputer

# Impute with mean/median/most frequent
imp = SimpleImputer(strategy='median')  # mean, median, most_frequent, constant
X_filled = imp.fit_transform(X)

# KNN: impute with the values of similar rows
knn_imp = KNNImputer(n_neighbors=5)
X_knn = knn_imp.fit_transform(X)
```

**Imputation strategy selection table**

| Situation | Strategy | Reason |
|------|------|------|
| Under 5% missing, random | Drop rows | Almost no bias and simple |
| Numeric, with outliers | Median imputation | The mean gets pulled by outliers |
| Numeric, distribution close to normal | Mean imputation | Preserves the center of the distribution |
| Categorical | Most frequent value or an "Unknown" category | The new category may itself be information |
| The missingness itself carries meaning | Add a "was missing" flag column | Doesn't throw away information |
| Much missing data with a pattern | KNN / model-based imputation | Estimate from similar rows |

In statistics, missingness mechanisms fall into 3 types. **MCAR** (Missing Completely At Random), **MAR** (Missing At Random, depends on other observed variables), and **MNAR** (Missing Not At Random, depends on the missing value itself). With MCAR, simple deletion doesn't create bias, but with MNAR (for example, high earners tending not to report income), simple imputation creates serious bias. Mean imputation artificially shrinks variance and weakens correlations.

## Handling Outliers

An outlier may be a measurement error, or a genuinely rare event (a fraudulent transaction). You must not remove them unconditionally.

```python
import numpy as np

# IQR method: values below Q1 - 1.5*IQR or above Q3 + 1.5*IQR are outliers
Q1, Q3 = np.percentile(data, [25, 75])
IQR = Q3 - Q1
lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
outliers = data[(data < lower) | (data > upper)]

# Z-score method: |z| > 3 is an outlier
z = (data - data.mean()) / data.std()
outliers_z = data[np.abs(z) > 3]
```

| Detection method | Criterion | Distribution assumption | Robust to outliers? |
|----------|------|----------|-----------------|
| IQR | Below Q1−1.5×IQR / above Q3+1.5×IQR | None | Robust |
| Z-score | More than 3 standard deviations from the mean | Assumes a normal distribution | Outliers shake the mean and standard deviation |

**Decision table for choosing a handling method**

| What the outlier really is | Handling | Example |
|-------------|------|-----|
| Measurement/entry error | Remove or convert to missing | Age 999 |
| Coding convention (sentinel value) | Interpret as missing, then impute | Area 99999 |
| A genuinely rare event that shakes the model | Capping (winsorizing), log transform | Ultra-expensive real estate |
| A genuinely rare event that is the detection target | **Never remove** | Fraudulent transactions, equipment failures |

In a real estate price prediction model, the "area" column contained 99999. It was a sentinel value that coded missing as 99999, but the team trained on it without knowing, and the model predicted every house as ultra-expensive. Checking the raw data's coding conventions (the data dictionary) first is step 0 of feature engineering.

> ⚠️ **Pitfall**: In fraud detection and anomaly detection, outliers are not noise but **the signal that is the answer**. If you filter them out with IQR, the positive class disappears entirely. Outlier handling must always begin by judging from the domain context "is this value an error, or a meaningful event?"

## Numeric Transforms and Binning

For a skewed distribution, making it closer to a normal distribution with a log transform improves linear model performance. Binning, which splits a continuous variable into bins, groups age into "teens/20s/30s" to simplify nonlinear relationships or reduce the influence of outliers.

```python
import numpy as np
import pandas as pd

# Log transform: compress a right-skewed long tail (income, price)
df['log_income'] = np.log1p(df['income'])  # log(1+x), safe for 0

# Binning: continuous -> categorical
df['age_group'] = pd.cut(df['age'], bins=[0, 18, 35, 60, 100],
                          labels=['teen', 'young adult', 'middle-aged', 'senior'])
```

| Transform | Purpose | Cost |
|------|------|------|
| Log transform | Compress the right-skewed long tail to be closer to normal | Interpretation changes to log units |
| Square-root transform | Weaker compression than log | Same as above |
| Binning | Simplify nonlinear relationships, mitigate outliers | Loses information within the bin |
| Polynomial features | Let a linear model capture curved relationships | More dimensions, overfitting risk |

Some SageMaker built-in algorithms require a particular input format. Linear Learner and XGBoost usually accept CSV/libsvm/RecordIO-protobuf, and for large-scale training RecordIO-protobuf is efficient. Also, XGBoost internally handles missing values with a learnable default direction, so prior imputation is not always necessary. Knowing each algorithm's input requirements is also part of feature engineering.

## Transform Order and Preventing Leakage

If you bundle things into a pipeline, you can enforce the order and leakage prevention at the code level.

```
[split] train / validation / test
   │
   ├─ train ── fit_transform ──> learns the transformer (means, min, max, category lists)
   │                                     │
   ├─ validation ── transform ───────────┤ reuses the same transformer
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
X_test_t = preprocessor.transform(X_test)   # no fit on test — prevents leakage
```

`handle_unknown="ignore"` is important. Even if a new category appears only in test, it is handled as all zeros without an error, preventing an outage at serving time.

## Derived Features: Extracting Information That Wasn't There

As important as transforms is **creating new features from the original columns**. A model can't figure out on its own what humans know as obvious.

| Original | Derived feature | Why it helps |
|------|----------|--------------|
| Timestamp | Day of week, time of day, month, whether a holiday | Captures periodic patterns such as weekends and nights |
| Signup date | Days since signup (tenure) | Elapsed time has more predictive power than the absolute date |
| Transaction list | Count/sum/average over the last 30 days | A point-in-time summary is more useful than individual transactions |
| Address/coordinates | Region code, distance to the center | Raw coordinates are hard for a model to interpret |
| Text | Length, word count, whether it contains certain keywords | Summarizes a sentence numerically |
| Two numeric columns | Ratio (debt/income), difference | The relationship itself is often the signal |

Derived features are a path where future leakage easily occurs. When computing "the sum over the last 30 days," if transactions after the prediction time get mixed in, only the backtest improves. Aggregate features must always state a boundary so that they use **only data before the prediction time**.

## Transform Selection Summary Table

| Data characteristic | Transform to apply | Reason |
|-----------|-----------|------|
| Numerics with inconsistent units + distance-based model | Standardization/normalization | Large units dominate the distance |
| Numerics with inconsistent units + tree model | No transform needed | Split threshold comparison makes it irrelevant |
| Unordered low-cardinality category | One-Hot | Doesn't create a fake order |
| Ordered category | Ordinal | Preserves the order information |
| High-cardinality category | Target/frequency encoding, embedding | Avoids dimension explosion |
| Right-skewed long-tail distribution | Log transform | Improves linear model fit |
| Numerics with many outliers | RobustScaler, capping | Median/IQR criteria aren't shaken |
| Missingness carries meaning | Add a missing-flag column | Doesn't throw away information |

In the next post, we look at SageMaker Data Wrangler, which applies these transforms visually without code.

## 📖 Glossary

- **Feature engineering**: The whole job of shaping raw data into a numeric representation a model can learn from.
- **Scaling**: Bringing numeric features with inconsistent units to a similar range. Required for distance- and gradient-based models.
- **Standardization**: A transform that makes the mean 0 and the standard deviation 1. The most dependable default choice.
- **Normalization**: A transform that squeezes values into the 0-1 range. Used for data with a clear range.
- **Nominal**: A category with no order, like Seoul/Busan. One-Hot is the standard.
- **Ordinal**: A category with an order, like low/medium/high. Integer encoding is natural.
- **One-Hot encoding**: An encoding that creates one 0/1 column per category so as not to impose an order.
- **Cardinality**: The number of unique values in a categorical column. When high, use target/frequency encoding instead of One-Hot.
- **Target encoding**: An encoding that replaces each category with that category's target mean. Powerful but vulnerable to leakage.
- **Imputation**: Filling empty values with the mean, median, most frequent value, and so on.

## 📝 Practice Questions

**Question 1.** A KNN classification model uses two features, "annual salary (unit: KRW, millions to tens of millions)" and "years of service (0-30)," but years of service is barely reflected in predictions. What is the most appropriate action?

A) Remove the years-of-service feature  
B) Apply StandardScaler or MinMaxScaler to both features to match their scales  
C) One-Hot encode the salary as a categorical variable  
D) Collect more data  

**Answer: B**  
Explanation: KNN is based on Euclidean distance, so the larger-unit salary dominates the distance computation and years of service gets buried. If scaling brings both features to the same range, both contribute fairly to the distance. A throws away useful information, C needlessly categorizes a continuous number and loses information, and D does not solve the scale imbalance itself.

---

**Question 2.** You converted the nominal category "city: Seoul/Busan/Daegu/Gwangju" to 0/1/2/3 with LabelEncoder and fed it to linear regression, but the performance is strange. What is the most appropriate cause?

A) LabelEncoder cannot handle missing values  
B) The linear model interprets the integer encoding as an order (Gwangju 3 > Seoul 0) and learns a magnitude relationship that doesn't exist  
C) Cities must always use only target encoding  
D) LabelEncoder supports only 4 or fewer categories  

**Answer: B**  
Explanation: Nominal categories have no order, but integer encoding imposes an artificial ranking. A linear model wrongly learns this as "Gwangju is 3 times bigger than Seoul." For nominal data, One-Hot encoding is the standard. A is not LabelEncoder's key problem, C is wrong because target encoding is just one alternative and not the only answer, and D makes a false claim about a limit on the number of categories.

---

**Question 3.** What is the correct procedure for applying StandardScaler while avoiding data leakage?

A) Fit on all data (train+test), then transform train and test separately  
B) fit_transform on train, and transform test with the same scaler  
C) fit_transform train and test independently  
D) Fit on test and transform train  

**Answer: B**  
Explanation: A scaler must be fit using only the statistics (mean, standard deviation) of the train data, and those statistics must be used to transform test. A is leakage in which test information seeps into the fit stage, C transforms train and test by different criteria so the distributions misalign, and D is blatant leakage with the roles of train/test swapped.

---

**Question 4.** Income data is skewed long to the right (a few ultra-high earners) and linear regression performance is low. Which transform is most appropriate for improving the distribution?

A) One-Hot encoding  
B) A log(1+x) log transform  
C) Label encoding  
D) Add the same constant to all values  

**Answer: B**  
Explanation: A log transform compresses the right-skewed long tail so the distribution becomes closer to normal, improving the linear model's fit. `log1p` handles 0 values safely too. A and C are categorical encodings and irrelevant to improving a continuous income distribution, and in D, adding a constant leaves the distribution's shape unchanged so the skew isn't resolved.

---

**Question 5.** When you detected outliers with the IQR criterion on a fraud detection dataset, most fraudulent transactions were classified as outliers. What is the appropriate handling?

A) Remove all the detected outliers  
B) Since the outliers are the detection target (the answer), do not remove them but preserve them, and handle them separately if needed  
C) Impute the outliers with the median  
D) Lower the IQR multiplier to 0 to remove even more  

**Answer: B**  
Explanation: In fraud detection, outliers are not noise but the answer signal the model must catch. Removing or imputing them makes the positive class disappear, so the model can't learn fraud. A, C, and D all destroy the key signal. Outlier handling must always judge from the domain context whether the value is an error or a meaningful event.

---
