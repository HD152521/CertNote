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

## 📝 Practice Questions

**Question 1.** An income variable that is long-tailed to the right (right-skewed) has missing values. What is the safest choice when building a baseline with simple imputation?

A) Impute with the mean  
B) Impute with 0  
C) Impute with the median  
D) Delete all rows with missing values  

**Answer: C**  
Explanation: In a skewed distribution, the mean is pulled by outliers and the long tail and loses representativeness. The median is robust to outliers, so it is the safest simple imputation for a skewed numeric variable. Mean imputation (A) is distorted by the tail, and 0 imputation (B) injects a meaningless value and ruins the distribution. Row deletion (D) is justified only when the missingness is MCAR and the proportion is very low, and it carries a high risk of information loss.

---

**Question 2.** While building a fraud detection model, you find many extremely large values in the transaction amounts. What is the MOST appropriate attitude toward these outliers?

A) Delete everything with a Z-score of 3 or above  
B) Do not remove them carelessly, because outliers may be the key signal of fraud  
C) Impute all outliers with the mean  
D) Immediately clip them at the IQR bounds  

**Answer: B**  
Explanation: In fraud detection, extreme transactions are not noise to be removed but rather likely to be the **signal** that must be detected. Unconditionally deleting, imputing, or clipping (A, C, D) erases the patterns the model needs to catch. Outlier handling must be decided based on domain context.

---

**Question 3.** What is the correct way to avoid data leakage when applying mean imputation of missing values with scikit-learn?

A) Compute the mean over the entire dataset and apply it to all rows  
B) Fit the imputer on the training set and apply only `transform` to the test set  
C) Impute the test set with the test set's mean  
D) Combine training and test, impute once, and then split  

**Answer: B**  
Explanation: Imputation statistics (such as the mean) must be computed only from the training set, and applied to the test set via `transform`. Computing the mean over the whole data (A, D) or using test set statistics (C) leaks test information into training, causing data leakage that inflates performance optimistically.

---

**Question 4.** The data does not follow a normal distribution, and you want to detect outliers without distributional assumptions. Which method is MOST appropriate?

A) Z-score criterion \|z\| > 3  
B) Mean ± 2 standard deviations  
C) IQR-based Q1 − 1.5×IQR, Q3 + 1.5×IQR  
D) Check only the maximum and minimum values  

**Answer: C**  
Explanation: The IQR (interquartile range) method does not assume normality of the distribution and is based on quartiles, so it is robust to skewed or non-normal distributions. Z-score (A) and mean ± standard deviation (B) depend on the normal distribution and on the mean/standard deviation, which are sensitive to outliers. The maximum and minimum alone (D) cannot define an outlier boundary.

---

**Question 5.** In user-level data, what is the most correct time to clean up duplicate records?

A) After the train/validation split, remove them separately within each split  
B) Only right before model training  
C) **Before** the train/validation split, clean up duplicates based on the key  
D) After seeing the evaluation results, remove them if necessary  

**Answer: C**  
Explanation: If duplicate records of the same user are scattered across the training and validation sets after splitting, data leakage inflates the evaluation. Therefore duplicates must be cleaned up by key before the split for the evaluation to be honest. Processing after the split (A) or right before training (B) happens after leakage has already occurred, and processing after evaluation (D) is in the wrong order.

---
