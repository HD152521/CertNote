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
