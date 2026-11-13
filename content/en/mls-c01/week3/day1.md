# Day 1 - Data Cleaning: Missing Values, Outlier Detection, Duplicates and Errors

## 📌 Key Takeaways

- For missing values, first judge **why they are missing (MCAR/MAR/MNAR)** and then pick a strategy. A mechanical `fillna(mean)` is safe only under MCAR.
- For skewed numeric variables, **median imputation is safer than the mean**. If inter-variable correlation is strong, use KNN or model-based imputation.
- Detect outliers with **robust statistics such as IQR**, but do not remove them unconditionally. In fraud and anomaly detection, the outliers are the answer.
- Duplicates and logic errors must be cleaned **before splitting**. If you do it after the split, leakage has already occurred.
- Compute every imputation/cleaning statistic **from the training set only**, and apply only `transform` to validation and test.

## Handling Missing Values: Starting with Mechanisms

The first step of exploratory data analysis (EDA) is "making the data clean." Domain 2 (Exploratory Data Analysis) of MLS-C01 accounts for about 24% of the exam, and **data cleaning** sits at its center. No matter how good the model, if you feed it data mixed with missing values, outliers, and duplicates, it is "garbage in, garbage out."

Before handling missing values, you need to know **why they are missing**. Statistics divides missingness mechanisms into three kinds.

| Mechanism | Meaning | Example | Consequence of simple deletion |
|---|---|---|---|
| **MCAR** (Missing Completely At Random) | Missingness is completely random, unrelated to other variables | Random gaps caused by a sensor malfunction | Almost no bias |
| **MAR** (Missing At Random) | Missingness depends on other observed variables | High earners refuse to answer the income question more often | Can be corrected by using other variables |
| **MNAR** (Missing Not At Random) | Missingness depends on the value itself | People with very low credit scores hide their score | Severe bias |

The missingness mechanism classification (MCAR/MAR/MNAR) is a framework proposed by the statistician Donald Rubin in 1976. The key insight is that "**the validity of missing-value handling depends on why the values are missing**." Simple mean imputation is unbiased only under the MCAR assumption, and applying it to MNAR data distorts the distribution. That is why visualizing the missingness pattern (for example, a missingness heatmap) before blindly using `fillna(mean)` is the standard practice of EDA.

## Missing Value Imputation Strategies

Handling missing values broadly splits into **deletion** and **imputation**.

| Strategy | Method | Suitable when | Risk |
|---|---|---|---|
| Row deletion (listwise) | Remove rows that have missing values | Missing rate is very low and MCAR | Data loss, sample bias |
| Mean/median imputation | Fill numeric missing values with a statistic | Quick baseline | Reduced variance, distorted correlations |
| Mode imputation | Fill categorical missing values with the most frequent category | Categorical | Over-representation of the majority category |
| KNN imputation | Estimate from neighbors' values | Correlation between variables exists | Computation cost, sensitive to scale |
| Model-based imputation | Predict with regression/MICE | MAR, strong relationships between variables | Complexity, overfitting risk |
| Add indicator variable | Create a "was missing" flag column | MNAR, missingness itself is a signal | Increased dimensionality |

- The median is more robust to outliers than the mean, so **median imputation is safe for skewed numeric variables**.
- When missingness is a signal, don't delete it; keep it as a flag. "Did not report income" is information in itself.

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

# Use KNN imputation if inter-variable correlation is strong
knn_imputer = KNNImputer(n_neighbors=5)
df_num = pd.DataFrame(knn_imputer.fit_transform(df.select_dtypes("number")))
```

MICE (Multiple Imputation by Chained Equations) repeatedly regresses each variable with missing values on the other variables, capturing even the "uncertainty of imputation" that single imputation ignores. Multiple imputation corrects the problem where mean imputation artificially shrinks variance and makes confidence intervals too narrow. At the exam level, it is enough to understand that "**if relationships between variables are strong, KNN or model-based imputation is more accurate than simple imputation**."

> ⚠️ **Pitfall**: Imputation must be **fit on the training data only**, and its statistics applied to validation and test. If you compute the mean over the entire data, test information leaks into training, producing **data leakage** and inflated performance. This is why scikit-learn uses `fit_transform` on the training set and only `transform` on the test set.

## Outlier Detection and Treatment

An outlier is a value that deviates greatly from other observations. It may be an input error or a genuinely rare event, so you must not remove it indiscriminately.

### Comparing Detection Methods

| Method | Criterion | Distribution assumption | Robustness | Notes |
|---|---|---|---|---|
| **Z-score** | How many standard deviations from the mean. By convention \|z\| > 3 | Assumes normal distribution | Weak | Outliers shake the mean and standard deviation |
| **IQR** | Below Q1 − 1.5×IQR, above Q3 + 1.5×IQR | None | Strong | Safe even for skewed distributions |
| **Visualization** | Box plot, scatter plot, histogram | None | — | Check context with your own eyes |
| **Model-based** | Isolation Forest, DBSCAN, LOF | None | Strong | Can detect multivariate outliers |
| **Random Cut Forest** | SageMaker built-in anomaly score | None | Strong | Suited for streaming and large scale |

```python
import numpy as np

# IQR-based outlier boundaries
Q1 = df["income"].quantile(0.25)
Q3 = df["income"].quantile(0.75)
IQR = Q3 - Q1
lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR

# Winsorizing: clip to the boundaries (preserve instead of delete)
df["income"] = df["income"].clip(lower, upper)
```

### Treatment Depends on the Situation

| Treatment | Description | Suitable when |
|---|---|---|
| Delete | Remove outlier rows | Clear input errors |
| Winsorizing/clipping | Replace with boundary values | You want to keep them but reduce the impact of extremes |
| Transform | Compress with log or square root | Distributions with a long right tail |
| Keep | Leave as is | When outliers are the target (fraud detection) |
| Separate modeling | A model that handles outliers separately | The anomaly detection problem itself |

The reason IQR is more robust than Z-score is the concept of the **breakdown point**. The mean and standard deviation are shaken by a single outlier (breakdown point 0%), but the median and quartiles remain stable even if up to 25% of the data is contaminated. The tool that detects outliers must not itself be swayed by outliers, so robust statistics (median, IQR) are preferred. In problems like fraud detection or anomaly detection where **the outliers are the answer**, the key is not removal but "learning those outliers."

> ⚠️ **Pitfall**: If you memorize "outlier = something to remove," you will definitely get fraud-detection questions wrong. If the passage mentions "fraud," "equipment failure," or "anomaly detection," extreme values are signals to be caught.

## Duplicates and Errors

The last "dirt" is **duplicate rows** and **logic errors**.

- **Complete duplicates**: all columns identical. Usually collection duplicates → remove them.
- **Partial duplicates**: the same entity appears multiple times with only different notation (e.g., "Seoul City" vs "Seoul"). Normalize and then merge.
- **Logic errors**: negative ages, future birth dates, partial sums that don't match the total, and so on.

```python
# Remove complete duplicates
df = df.drop_duplicates()

# Duplicates by key (keep the latest record)
df = df.sort_values("updated_at").drop_duplicates(subset=["user_id"], keep="last")

# Filter logic errors
df = df[(df["age"] >= 0) & (df["age"] <= 120)]
```

```
[Wrong order]  split → remove duplicates
   Records of the same user scattered across training and validation sets → leakage → inflated performance

[Correct order]  clean duplicates/keys → split → impute/scale (fit on training set)
```

If you remove duplicates only right before model training, then after the split the same record is scattered across the training and validation sets and causes **leakage**. Especially for time series or user-level data, you must finish removing duplicates and cleaning keys before the split for the evaluation to be honest.

## Tools That Run Cleaning on AWS

Even for the same cleaning, the tool differs by scale and user.

| Tool | Nature | When to choose |
|---|---|---|
| **SageMaker Data Wrangler** | Visual preparation + data quality and insights report | Quickly diagnosing and cleaning with no code and exporting the flow |
| **AWS Glue DataBrew** | No-code cleaning recipes | Data analysts building cleaning rules without code |
| **SageMaker Processing** | Code-based distributed preprocessing job | Large-scale processing with custom logic |
| **AWS Glue ETL** | Serverless Spark | Shared cleaning across the data lake |
| **Amazon EMR** | Full-control cluster | Petabyte scale, fine-grained tuning needed |

- Data Wrangler's **data quality and insights report** automatically points out missing values, anomalies, and duplicates, and even **columns suspected of target leakage**.
- Whichever tool you use, the principle is the same. **Fix the cleaning logic as code or a declarative flow** so that it is reproduced identically in training and inference.

Cleaning by hand in a notebook and then saving only the resulting CSV cannot be reproduced. You become unable to answer "why did this model work well back then?"

## Diagnosis Before Cleaning: What to Look at First

Before choosing a cleaning method, you must look at the data first. Here is the checklist, in order.

1. **Row/column counts and types** - are numeric columns coming in as strings?
2. **Missing rate per column** - for columns that are 90% or more empty, removal is better than imputation.
3. **Missingness pattern** - is it missing only under certain conditions (MAR signal), or related to the value itself (MNAR signal)?
4. **Descriptive statistics** - a large gap between mean and median means a skewed distribution.
5. **Distribution and outliers** - check tails and extreme values with histograms and box plots.
6. **Duplicate rate** - count complete duplicates and key-based duplicates separately.
7. **Relationship with the target** - a column that contains the target almost verbatim is a leakage candidate.

If you fill a column with a very high missing rate using the mean, almost every row gets the same value, creating a column with no information. In that case, dropping the column or a "was missing" flag is more honest.

## Cleaning Decision Tree

```
You encounter missing values
├─ Missing rate is overwhelmingly high (e.g., 90%+) → drop the column, or keep only a "was missing" flag
├─ Missingness itself is a signal (MNAR)           → add indicator variable + impute
├─ Strong correlation with other variables (MAR)   → KNN / model-based imputation
└─ Looks random and the rate is low (MCAR)         → median (skewed) / mean (symmetric) / mode (categorical)

You encounter outliers
├─ Clear input error             → delete or apply a logic filter
├─ Distribution has a long right tail → log transform
├─ Just want to reduce the impact of extremes → winsorizing (clipping)
└─ Outliers are the answer       → keep, approach as an anomaly detection problem
```

## Order of Cleaning Work

In cleaning, order equals correctness.

1. **Clean up schema and types** - are columns that should be numeric coming in as strings?
2. **Filter logic errors** - remove values that are impossible in the domain.
3. **Remove duplicates and normalize keys** - always before the split.
4. **Split into train/validation/test** - chronological for time series, by group for grouped data.
5. **Impute missing values, handle outliers, scale** - `fit` on the training set, `transform` for the rest.

In the next article we cover **feature engineering (scaling, encoding, binning)**, which transforms the cleaned data so the model learns it well.

## 📖 Glossary

- **EDA (Exploratory Data Analysis)**: The stage before modeling where you examine the distribution, missing values, anomalies, and relationships of the data.
- **MCAR / MAR / MNAR**: Missing completely at random / missingness that depends on observed variables / missingness that depends on the value itself.
- **Imputation**: Filling in missing values with some value.
- **MICE**: A multiple imputation technique that imputes several times by repeatedly regressing the variables with missing values on each other.
- **Indicator variable**: An additional column marking "this value was originally missing" as 0/1.
- **Outlier**: A value that deviates greatly from other observations. It may be an error or a genuinely rare event.
- **Z-score**: A measure of how many standard deviations a value is from the mean.
- **IQR (interquartile range)**: Q3 − Q1. Used to set outlier boundaries without distribution assumptions.
- **Winsorizing**: Treatment that presses outliers down to boundary values instead of deleting them.
- **Data leakage**: An incident where information that would not have been known at training time leaks into the model and inflates performance.

## 📝 Practice Questions

**Question 1.** An income variable that is long-tailed to the right (right-skewed) has missing values. What is the safest choice when building a baseline with simple imputation?

A) Impute with the mean  
B) Impute with 0  
C) Impute with the median  
D) Delete all rows with missing values  

**Answer: C**  
Explanation: In a skewed distribution, the mean is pulled by outliers and the long tail and loses representativeness. The median is robust to outliers, so it is the safest simple imputation for a skewed numeric variable. Mean imputation (A) is distorted by the tail, and 0 imputation (B) injects a meaningless value and ruins the distribution. Row deletion (D) is justified only when the missingness is MCAR and the proportion is very low, and it carries a high risk of information loss.

---

**Question 2.** While building a fraud detection model, you find many extremely large values in the transaction amounts. What is the most appropriate attitude toward these outliers?

A) Delete everything with a Z-score of 3 or more  
B) Do not carelessly remove them, since the outliers may be the key signal of fraud  
C) Impute all outliers with the mean  
D) Immediately clip them to the IQR boundaries  

**Answer: B**  
Explanation: In fraud detection, extreme transactions are not noise to be removed but rather likely to be the **signal** that must be detected. Unconditionally deleting, imputing, or clipping (A, C, D) erases the patterns the model needs to catch. Outlier handling must be decided based on domain context.

---

**Question 3.** What is the correct way to avoid data leakage when applying mean imputation of missing values with scikit-learn?

A) Compute the mean over the whole dataset and apply it to every row  
B) Apply the imputer fit on the training set to the test set with `transform` only  
C) Impute the test set with the test set's mean  
D) Combine training and test, impute all at once, then split  

**Answer: B**  
Explanation: Imputation statistics (such as the mean) must be computed only from the training set, and applied to the test set via `transform`. Computing the mean over the whole data (A, D) or using test set statistics (C) leaks test information into training, causing data leakage that inflates performance optimistically.

---

**Question 4.** The data does not follow a normal distribution, and you want to detect outliers without distributional assumptions. Which method is most appropriate?

A) Z-score criterion \|z\| > 3  
B) Mean ± 2 standard deviations  
C) IQR-based Q1 − 1.5×IQR, Q3 + 1.5×IQR  
D) Check only the maximum and minimum  

**Answer: C**  
Explanation: The IQR (interquartile range) method does not assume normality of the distribution and is based on quartiles, so it is robust to skewed or non-normal distributions. Z-score (A) and mean ± standard deviation (B) depend on the normal distribution and on the mean/standard deviation, which are sensitive to outliers. The maximum and minimum alone (D) cannot define an outlier boundary.

---

**Question 5.** In user-level data, what is the most correct time to clean up duplicate records?

A) After the train/validation split, removing separately within each split  
B) Only right before model training  
C) Clean up key-based duplicates **before** the train/validation split  
D) After seeing the evaluation results, if needed  

**Answer: C**  
Explanation: If duplicate records of the same user are scattered across the training and validation sets after splitting, data leakage inflates the evaluation. Therefore duplicates must be cleaned up by key before the split for the evaluation to be honest. Processing after the split (A) or right before training (B) happens after leakage has already occurred, and processing after evaluation (D) is in the wrong order.

---
