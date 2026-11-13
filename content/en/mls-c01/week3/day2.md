# Day 2 - Feature Engineering: Scaling, Encoding, and Binning

## 📌 Key Takeaways

- Scaling is **essential for distance- and gradient-based models (KNN, SVM, linear/logistic regression, neural networks, PCA)** and **unnecessary for tree-based models**.
- When there are many outliers, use **RobustScaler** (based on median and IQR) instead of Min-Max.
- For encoding: **Ordinal if there is an order, One-Hot if there isn't, and Target/Hashing/embeddings for high cardinality**.
- Target encoding is powerful but carries the risk of **target leakage**. It needs K-fold or smoothing.
- Binning gives linear models nonlinearity but you accept **information loss**. The common principle is to **fit every transformation on the training set only**.

## Scaling: Normalization vs. Standardization

Once cleaning has made the data tidy, it is time to **transform** it into a form the model can learn from well. Feature engineering carries so much weight in the ML pipeline that it is commonly said to "determine 80% of model performance."

Many algorithms are sensitive to the **scale (magnitude)** of features. If you feed in age (0 to 100) and income (0 to 100 million) as they are, income overwhelms the distance and gradient calculations.

| Technique | Formula | Result range | Outlier impact | When to use |
|---|---|---|---|---|
| **Min-Max normalization** | (x − min) / (max − min) | [0, 1] | Very sensitive | When the range must be fitted exactly (image pixels, etc.) |
| **Standardization (Z-score)** | (x − μ) / σ | Mean 0, variance 1 | Sensitive | Default for linear models and neural networks |
| **RobustScaler** | (x − median) / IQR | Variable | Robust | When there are many outliers |
| **MaxAbs** | x / \|max\| | [−1, 1] | Sensitive | When zeros must be preserved in sparse matrices |
| **Log transform** | log(1+x) | Variable | Compresses the tail | Distributions with a long right tail |

- Algorithms where scaling is **required**: distance-based (KNN, K-means), gradient-based (linear/logistic regression, neural networks), models with a regularization term (Ridge/Lasso), SVM, PCA.
- Algorithms where scaling is **unnecessary**: tree-based (Decision Tree, Random Forest, XGBoost, LightGBM). Trees only look at split thresholds within a single feature, so they are invariant to monotonic transformations.

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler

# Standardization: default for neural networks/linear models
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)   # not fit!

# With many outliers, use RobustScaler
robust = RobustScaler()
X_train_robust = robust.fit_transform(X_train)
```

```
[When scales differ wildly]     [After standardization]
 Loss function contours are      Contours become nearly circular
 elongated ellipses              ↓
      ╱╲                     ╭─╮
   ╱      ╲   zigzag descent  │ ●│  converges along the shortest path
  ╲      ╱                   ╰─╯
      ╲╱
```

The reason gradient descent is sensitive to scale is the shape of the loss function's contours. If feature scales differ wildly, the contours become elongated ellipses, and the gradient zigzags slowly toward the minimum. If standardization puts all features on the same scale, the contours become nearly circular and convergence is fast and stable. For distance-based models (KNN, K-means), it prevents Euclidean distance from being dominated by large-scale features.

> ⚠️ **Trap**: Just like an imputer, a scaler must be **fit on the training set only**. Using the test set's min/max/mean is leakage. Also, with Min-Max a single outlier pulls max up and compresses the remaining values toward 0, so when outliers are suspected, RobustScaler is the safe choice.

## Encoding: Turning Categorical Values into Numbers

Most algorithms accept only numbers as input, so categorical variables must be converted into numbers.

| Encoding | Method | Suited for | Caution |
|---|---|---|---|
| **Label Encoding** | Category → integer (0, 1, 2…) | Ordinal, tree models | Imposes a false order if used on nominal data |
| **One-Hot Encoding** | Creates a 0/1 column per category | Nominal, low cardinality | Dimension explosion with high cardinality |
| **Ordinal Encoding** | Maps to integers in a meaningful order | Grades (low/mid/high) | Only when the order is real |
| **Target Encoding** | Replaces category with the target mean | High cardinality | Leakage and overfitting risk |
| **Frequency Encoding** | Replaces category with its frequency | High cardinality | Collisions when frequencies are equal |
| **Feature Hashing** | Maps to a fixed dimension with a hash | Unseen categories, streaming | Collisions occur |
| **Embedding** | A neural network learns low-dimensional dense vectors | Ultra-high cardinality, deep learning | Needs training data and a network |

### Encoding Decision Tree

```
Is there an order?
├─ Yes → Ordinal / Label Encoding  (low < mid < high)
└─ No → How many unique values are there?
             ├─ Few (a few dozen or fewer) → One-Hot
             └─ Many (thousands or more) → Target / Frequency / Hashing / Embedding
                                   · Watch for leakage (Target)
                                   · Accept collisions (Hashing)
                                   · For deep learning, Embedding
```

The key distinction is **whether there is an order**. For grades (low < medium < high), Ordinal/Label is natural, and for something with no order like colors (red/blue/green), One-Hot is right. If you Label Encode colors for a linear model (red=0, blue=1, green=2), it creates the false order "green > blue > red."

```python
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder

# Nominal: one-hot
ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
X_color = ohe.fit_transform(df[["color"]])

# Ordinal: ordinal with an explicit order
oe = OrdinalEncoder(categories=[["low", "mid", "high"]])
df["level_enc"] = oe.fit_transform(df[["level"]])
```

Target encoding is powerful but dangerous.

```python
# Target encoding (compute statistics from training-set folds only, to prevent leakage)
means = X_train.groupby("city")["target"].mean()
X_train["city_te"] = X_train["city"].map(means)
X_test["city_te"] = X_test["city"].map(means)   # apply training-set statistics
```

With high cardinality (for example, thousands of postal codes), target encoding avoids the dimension explosion of one-hot while compressing the relationship with the target into a single column. However, if you build a feature from the target of the same data, **target leakage** occurs, where the model peeks at the answer. To prevent this, use K-fold target encoding (computing each fold's statistics from the other folds) or smoothing (weighting the overall mean and the category mean by sample count). On the exam, the key is the trade-off: "high cardinality → one-hot explodes dimensions, and target encoding requires care about leakage."

> ⚠️ **Trap**: With One-Hot encoding, if the test set contains a new category not seen during training, it raises an error. You must set `handle_unknown="ignore"` so that unknown categories are all treated as zero vectors, to be safe in production.

If you apply target encoding as-is to a category with extremely few samples (for example, only 3 records for that city), the value swings to extremes. You need to pull it toward the overall mean with smoothing.

## Binning: Turning Continuous Values into Intervals

Binning is a technique that splits a continuous variable into intervals (bins) and treats it like a categorical one.

| Method | Description | Example | Caution |
|---|---|---|---|
| **Equal-width** | Splits the value range into equal widths | 0–10, 10–20, 20–30 | With a skewed distribution, values pile into one bin |
| **Equal-frequency** | Same number of samples in each bin | Quartile-based | Boundaries depend on the data |
| **Domain-based** | Splits at meaningful boundaries | Age → minor/young adult/middle-aged/senior | Requires domain knowledge |

Effects of binning:

- **Captures nonlinear relationships**: A linear model can learn nonlinear patterns such as "purchase rate jumps between ages 30 and 40" through bin dummies.
- **Mitigates outliers and noise**: Extreme values are lumped into the same top bin, which reduces their influence.
- **Easier to interpret**: A "high-income bin" is easier to explain than continuous income.

The downside is **information loss**. Fine differences within a bin disappear.

```python
import pandas as pd

# Equal-width binning
df["age_bin"] = pd.cut(df["age"], bins=[0, 18, 35, 60, 120],
                       labels=["minor", "young", "middle", "senior"])

# Equal-frequency binning (quartiles)
df["income_q"] = pd.qcut(df["income"], q=4, labels=["Q1", "Q2", "Q3", "Q4"])
```

Binning is a tool for adjusting the model's bias-variance trade-off. If you use continuous values as they are, a linear model can only express a monotonic straight-line relationship (high bias), but if you convert them to bin dummies, it learns an independent effect in each bin and captures nonlinearity (reduced bias). However, if you split bins too finely, each bin has few samples and estimates become unstable (increased variance). Equal-frequency binning mitigates this variance problem by equalizing the sample count in each bin.

Applying binning to tree or boosting models gains almost nothing, because trees already find split points on their own and express nonlinearity. In questions that ask "which preprocessing has little effect," **the model type is the clue**.

## Derived Features: Interactions and Polynomials

If scaling, encoding, and binning are tasks that "change the form," derived features are tasks that "create signal that wasn't there."

- **Ratio features**: Often `amount / average amount` or `debt / income` is a stronger signal than the amount itself.
- **Interaction features**: The product of two features (`age × income`) expresses a combined effect such as "high-income middle-aged."
- **Polynomial features**: Adding `x²`, `x³` lets a linear model express curved relationships.
- **Aggregate features**: Attach group statistics, such as each user's average purchase amount over the last 30 days.

Polynomials and interactions grow dimensionality quickly and lead to overfitting. Applying a degree-2 polynomial to 3 features gives 10, and to 10 features gives 66. Use them together with regularization (Ridge/Lasso), or, for tree models, they are often unnecessary in the first place.

Aggregate features become leakage if you pick the wrong **aggregation point in time**. "This user's average purchase amount over their entire history" can include data from after the prediction time. You must aggregate using only data from before the prediction time.

## Feature Selection: More Isn't Better

Once you've created features, you also have to cut them back. Unnecessary features increase overfitting, training time, and difficulty of interpretation all together.

| Approach | Method | Characteristics |
|---|---|---|
| **Filter** | Pre-screen with statistics such as correlation, variance, chi-square | Fast but independent of the model |
| **Wrapper** | Select by watching actual performance with forward selection and backward elimination | Accurate but expensive |
| **Embedded** | Automatic selection during model training (Lasso, tree importance) | Practical, specific to the model |

- **Multicollinearity**: If several features are strongly correlated with each other, coefficient interpretation in linear models becomes unstable. Keep just one or combine them with PCA.
- **Constant and quasi-constant columns**: A column with practically one value carries no information, so remove it.
- **ID columns**: If you feed a user ID in as is, the model overfits by memorizing individual rows. Convert it to an embedding or an aggregate.

## Preprocessing Requirements by Model

| Model | Scaling | One-hot | Binning | Missing-value imputation |
|---|---|---|---|---|
| Linear/logistic regression | Required | Required (nominal) | Helpful | Needed |
| SVM | Required | Required | Helpful | Needed |
| KNN / K-means | Required | Required | Moderate | Needed |
| Neural network | Required | Needed (or embedding) | Moderate | Needed |
| PCA | Required | Needed | Unsuitable | Needed |
| Decision Tree / RF | Unnecessary | Needed (numeric input) | Small effect | Needed |
| XGBoost / LightGBM | Unnecessary | Needed (numeric input) | Small effect | Needed (some handle it natively) |

In the next article, we look at feature engineering for special data such as dates and text, and at handling high-cardinality categorical data.

## 📖 Glossary

- **Feature engineering**: The work of turning raw data into input features that a model can learn from well.
- **Normalization (Min-Max)**: Scaling that squeezes values into the [0,1] range. Very sensitive to outliers.
- **Standardization (Z-score)**: Scaling that transforms values to mean 0 and variance 1. The default for linear models and neural networks.
- **RobustScaler**: A method that uses the median and IQR to scale robustly against outliers.
- **Invariant to monotonic transformations**: The property that the result is the same as long as the ordering of values is preserved. Tree models have this property.
- **Nominal / ordinal**: Categories with no order (colors) / categories with an order (grades).
- **Cardinality**: The number of unique values of a categorical variable. Thousands means high cardinality.
- **Target Encoding**: An encoding that replaces a category with that category's target mean. Watch out for leakage.
- **Target leakage**: An accident where information about the answer being predicted gets mixed into the features, inflating performance.
- **Binning**: A technique that groups continuous values into intervals and treats them like categories. You gain nonlinearity and lose information.

## 📝 Practice Questions

**Question 1.** Which of the following algorithms does **not** need input feature scaling?

A) K-nearest neighbors (KNN)  
B) Support vector machine (SVM)  
C) XGBoost (tree boosting)  
D) Logistic regression  

**Answer: C**  
Explanation: Tree-based models (XGBoost, Random Forest, etc.) only look for split thresholds within each feature, so they are invariant to monotonic transformations and don't need scaling. KNN (A) and SVM (B) are distance-based, and logistic regression (D) is gradient-based, so all are sensitive to scale and scaling is recommended.

---

**Question 2.** You want to feed a nominal variable with no order, such as "color (red/blue/green)," into linear regression. Which encoding is most appropriate?

A) Label Encoding (red=0, blue=1, green=2)  
B) One-Hot Encoding  
C) Feed the strings in as they are  
D) Min-Max normalization  

**Answer: B**  
Explanation: Using Label Encoding on nominal data imposes a nonexistent order such as "green > blue > red," misleading the linear model (A). One-Hot turns each category into an independent 0/1 column, removing the false order. Linear regression cannot accept strings (C), and normalization (D) is a numeric scaling technique, not a categorical encoding.

---

**Question 3.** When encoding a high-cardinality categorical variable with thousands of unique values, such as postal codes, which technique avoids dimension explosion but requires care about data leakage?

A) One-Hot Encoding  
B) Target Encoding  
C) Ordinal Encoding (random integers)  
D) Standard Scaling  

**Answer: B**  
Explanation: Target encoding replaces each category with the target mean, compressing high cardinality into a single column, but building a feature from the target of the same data causes target leakage, so K-fold/smoothing is needed. One-Hot (A) explodes the dimensions into thousands of columns, random-integer ordinal (C) creates a false order, and scaling (D) is not a categorical encoding.

---

**Question 4.** When using Min-Max normalization, one variable contains an extreme outlier. Which describes the resulting problem and the alternative correctly?

A) The outlier pulls max up and compresses the remaining values toward 0 → use RobustScaler  
B) The normalized result goes outside [0,1] → use standardization  
C) The outlier is removed automatically → no additional handling needed  
D) The mean becomes 1 → reapply Min-Max  

**Answer: A**  
Explanation: Min-Max depends on max, so a single large outlier inflates the denominator and compresses the other values toward 0. RobustScaler, which uses the median and IQR, is the outlier-robust alternative. Min-Max maps to [0,1] normally (B is wrong), does not remove outliers (C is wrong), and does not make the mean 1 (D is wrong).

---

**Question 5.** Which feature engineering technique helps a linear model capture a nonlinear relationship in which "purchase rate changes sharply in a particular age range"?

A) Standardization  
B) Binning (discretization)  
C) Row deletion  
D) Label Encoding  

**Answer: B**  
Explanation: Binning splits continuous age into intervals and turns each interval into a dummy variable, so even a linear model can learn an independent effect per interval and express the nonlinear relationship. Standardization (A) only changes the scale and keeps linearity, row deletion (C) is data cleaning, and Label Encoding (D) is a categorical encoding and is unrelated.

---
