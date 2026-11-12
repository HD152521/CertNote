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

## 📝 Practice Questions

**Question 1.** Which of the following algorithms does **NOT** require input feature scaling?

A) K-nearest neighbors (KNN)  
B) Support vector machine (SVM)  
C) XGBoost (tree boosting)  
D) Logistic regression  

**Answer: C**  
Explanation: Tree-based models (XGBoost, Random Forest, and so on) only look for split points within each feature, so they are invariant to monotonic transformations and scaling is unnecessary. KNN (A) and SVM (B) are distance-based and logistic regression (D) is gradient-based, so all are sensitive to scale and scaling is recommended.

---

**Question 2.** You want to feed an unordered nominal variable such as "color (red/blue/green)" into linear regression. Which encoding is MOST appropriate?

A) Label Encoding (red=0, blue=1, green=2)  
B) One-Hot Encoding  
C) Input the strings as they are  
D) Min-Max normalization  

**Answer: B**  
Explanation: Using Label Encoding on a nominal variable assigns a nonexistent order such as "green > blue > red," misleading linear models (A). One-Hot creates an independent 0/1 column for each category and removes the false order. Linear regression cannot accept strings (C), and normalization (D) is a numeric scaling technique, not categorical encoding.

---

**Question 3.** When encoding a high-cardinality categorical variable with thousands of unique values, such as postal code, which technique avoids dimension explosion but requires attention to data leakage?

A) One-Hot Encoding  
B) Target Encoding  
C) Ordinal Encoding (random integers)  
D) Standard Scaling  

**Answer: B**  
Explanation: Target encoding replaces each category with the mean of the target, compressing high cardinality into a single column, but building features from the same data's target causes target leakage, so K-fold/smoothing is required. One-Hot (A) explodes the dimensionality into thousands of columns, ordinal encoding with random integers (C) creates a false order, and scaling (D) is not categorical encoding.

---

**Question 4.** When using Min-Max normalization, one variable has an extreme outlier. Which statement of the resulting problem and alternative is correct?

A) The outlier raises the max so the remaining values are compressed near 0 → use RobustScaler  
B) The normalized range falls outside [0,1] → use standardization  
C) The outlier is automatically removed → no additional handling needed  
D) The mean becomes 1 → reapply Min-Max  

**Answer: A**  
Explanation: Min-Max depends on the max, so a single large outlier enlarges the denominator and compresses the other values toward 0. RobustScaler, which uses the median and IQR, is the outlier-robust alternative. Min-Max normally maps to [0,1] (B is wrong), does not remove outliers (C is wrong), and does not make the mean 1 (D is wrong).

---

**Question 5.** Which feature engineering technique helps a linear model capture a nonlinear relationship such as "the purchase rate changes sharply in a certain age range"?

A) Standardization  
B) Binning (discretization)  
C) Row deletion  
D) Label Encoding  

**Answer: B**  
Explanation: Binning divides continuous age into intervals and turns each interval into a dummy variable, so even a linear model can learn the independent effect of each interval and express a nonlinear relationship. Standardization (A) only changes the scale and preserves linearity, row deletion (C) is data cleaning, and Label Encoding (D) is categorical encoding and therefore unrelated.

---
