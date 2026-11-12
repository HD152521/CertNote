# Day 1 - Statistics Basics: Distributions, Central Tendency, Spread, Transformations, and Sample vs Population

## 📌 Key Takeaways

- Don't compute the mean first; **look at the distribution shape (skewness, kurtosis) first**. Even with identical summary statistics, the actual shape can be completely different.
- When the data is skewed or has outliers, use **robust** statistics such as the **median and IQR** instead of the mean and standard deviation.
- **Linear scaling (standardization, Min-Max) does not change the distribution shape.** Reducing skewness requires a **nonlinear transformation** such as log or Box-Cox.
- What you hold in your hands is always a **sample**. Always doubt whether it represents the population (selection bias) and whether the sample is large enough (CLT).
- Distribution diagnosis is not an end in itself but a **prescription that leads to choices of preprocessing, metrics and algorithms**. MLS asks about the prescription, not the diagnosis.

## Distributions: Look at the Shape First

The final week of EDA is about "summarizing data honestly in numbers and verifying whether that summary can be trusted." Before asking about algorithms, MLS-C01 asks about **statistical intuition**. Is the distribution skewed? Should you trust the mean or the median? Does this sample fairly represent the population? If you go wrong here, the conclusion is wrong whichever model you choose.

Look at the distribution before the mean. **Look at the shape first.** Even with the same mean, shapes vary enormously.

| Distribution feature | Meaning | EDA implication |
|---|---|---|
| Symmetric | Balanced left and right, close to normal | Mean and standard deviation are representative |
| Right-skewed (positive skewness) | The right tail is long (income, prices) | Mean > median, a log-transform candidate |
| Left-skewed (negative skewness) | The left tail is long (scores near a perfect mark) | Mean < median |
| Multimodal | Multiple peaks | Suspect that subgroups are mixed together |
| High kurtosis | Sharp peak with heavy tails | Outliers and extreme values are frequent |

- **Skewness**: degree of asymmetry. 0 is symmetric; positive means a right tail.
- **Kurtosis**: thickness of the tails. The larger it is, the more frequent the extreme values.

```
  Symmetric (normal)    Right tail (positive skew)   Left tail (negative skew)
    ▁▃▅█▅▃▁              ▂▅█▆▄▃▂▁▁▁                ▁▁▁▂▃▄▆█▅▂
   mean = median          mean > median                mean < median
                        (income · house price · dwell time)   (exam scores near a perfect mark)

  Multimodal                            High kurtosis (heavy tail)
    ▁▃█▄▁▁▂▅█▃▁                          ▁▁▂▄█▄▂▁▁
   Suspect mixed subgroups → split segments   Sharp center, heavy tails → frequent outliers
```

```python
import pandas as pd

df = pd.read_csv("data/transactions.csv")

# Summarize the distribution shape in numbers
print(df["amount"].skew())      # skewness: positive means right-skewed
print(df["amount"].kurt())      # kurtosis: positive means sharp with heavy tails
print(df["amount"].describe())  # count, mean, std, min, 25/50/75%, max
```

A dramatic illustration of the principle "look at the distribution first" is **Anscombe's Quartet (1973)**. Four datasets share the same mean, variance, correlation coefficient and even regression line, yet their scatter plots come out in completely different shapes (a straight line, a curve, one outlier pulling the line, and so on). If you trust summary statistics alone and skip visualization, the real structure of the data stays entirely hidden. This is why EDA always includes histograms, box plots and scatter plots.

### Distribution Diagnosis → Prescription Table

The exam asks not "how large is the skewness" but "so what do you do."

| Observed shape | Diagnostic signal | Prescription (transform / preprocessing) | Representative value / metric |
|---|---|---|---|
| Long right tail | skew > 0 (by rule of thumb, clearly so above +1) | log1p / Box-Cox / Yeo-Johnson | Report the median |
| Long left tail | skew < 0 | Square or exponential transform, Yeo-Johnson | Report the median |
| A few extreme values | Maximum far exceeds Q3 + 1.5·IQR | RobustScaler, median for missing-value imputation | Report spread with IQR |
| Two or more peaks | Multimodal histogram | Split into subgroups and analyze/model each | Mean per segment |
| Values cluster at one point | Variance near 0 (quasi-constant column) | Remove the feature | — |
| Zeros and negatives mixed in | Log and Box-Cox cannot be applied | Yeo-Johnson (log1p works only down to 0) | — |

## Central Tendency: Mean, Median, Mode

The "middle value" that represents the data is its central tendency.

- **Mean**: sum of all values ÷ count. Sensitive to outliers.
- **Median**: the middle value when sorted. Robust to outliers.
- **Mode**: the most frequent value. Useful for categorical data.

In a skewed distribution, the mean and median diverge. With right skew, the long tail pulls the mean up so that **mean > median**. Income and house prices are right-skewed, so the median is more representative than the mean.

| Situation | Recommended central statistic | Reason |
|---|---|---|
| Symmetric distribution | Mean | Uses information from all values without distortion |
| Skewed, or outliers present | Median | Extreme values only change the ranks and cannot shake the middle value |
| Categorical | Mode | Mean and median are not even defined |
| Representative value for missing-value imputation | Median if skewed, mean if symmetric | The imputed value must not distort the center of the distribution |

## Spread: How Widely Is It Scattered?

The center alone is not enough. You must also look at **how scattered the data is**.

| Statistic | Definition | Character | When to use |
|---|---|---|---|
| Range | Maximum − minimum | Extremely sensitive to outliers | Checking the physical limits of the values |
| Variance | Mean of squared deviations | Units are squared, so it is hard to interpret | Theory and intermediate computation steps |
| Standard deviation (std) | Square root of the variance | Interpretable in the original units | The default spread for symmetric distributions |
| IQR | Q3 − Q1 | Robust to outliers | When there is skew or outliers |
| Coefficient of variation (CV) | Standard deviation ÷ mean | Unitless, so different variables can be compared | Comparing relative variability across variables with different scales |

The standard deviation tells you "how far, on average, values lie from the mean" in the original units. In a normal distribution, about 68% fall within the mean ±1σ, about 95% within ±2σ, and about 99.7% within ±3σ (the **68-95-99.7 rule**).

When computing the standard deviation from a sample, you **divide by n−1, not n** (**Bessel's correction**). The sample mean is the value that minimizes the squared deviations for that very sample, so using it as is systematically underestimates the population variance. Reducing the degrees of freedom by one (n−1) corrects this bias. pandas `.std()` defaults to the sample basis (ddof=1) while numpy `np.std()` defaults to the population basis (ddof=0), so the values differ subtly on the same data. This is an exam trap point.

## How Transformations Affect Distributions

The decisive difference between scaling and transformation is **whether the shape changes**.

| Processing | Effect | Distribution shape |
|---|---|---|
| Standardization (Z-score) | Mean 0, standard deviation 1 | **Unchanged**. Only location and scale shift |
| Min-Max normalization | Compresses to [0,1] | **Unchanged**. Only the scale changes |
| Log transform | Compresses large values | The right tail **approaches symmetry** |
| Square-root transform | Gentle compression | Relieves weak skew |
| Box-Cox / Yeo-Johnson | Searches for the optimal λ | Approaches a normal distribution |

**The key distinction: linear scaling (standardization, Min-Max) does not change the shape.** Skewness remains as it was. Reducing skewness itself requires a **nonlinear transformation such as log or Box-Cox**.

### Transformation Technique Selection Table

| Technique | Method | Distribution shape | Requirement | Typical use | Caution |
|---|---|---|---|---|---|
| Standardization (Z-score) | (x − μ) / σ | Unchanged | None | The default for linear models, neural networks, PCA, distance-based methods | Sensitive to outliers |
| Min-Max | (x − min) / (max − min) | Unchanged | When the range must be fixed | [0,1] inputs such as image pixels | One outlier compresses the rest near 0 |
| RobustScaler | (x − median) / IQR | Unchanged | None | Numeric data with many outliers | The output range is not fixed |
| Log (log1p) | log(1 + x) | Relieves the right tail | x ≥ 0 | Amounts, view counts, dwell time | Negatives not allowed |
| Square root | √x | Weak relief | x ≥ 0 | Count data, weak skew | Insufficient for strong skew |
| Box-Cox | Searches for the optimal λ | Approaches normal | **x > 0 (positive only)** | Analyses that need a normality assumption | Cannot be used on data with 0 or negatives |
| Yeo-Johnson | Searches for the optimal λ | Approaches normal | Allows negatives and 0 | Data with zeros and negatives mixed in | Values after the transform are hard to interpret |

```python
import numpy as np
from sklearn.preprocessing import StandardScaler, PowerTransformer

# Standardization: shape stays the same, only the scale changes
scaler = StandardScaler()
df["amount_std"] = scaler.fit_transform(df[["amount"]])
print(df["amount_std"].skew())   # same as the original — shape unchanged

# Log transform: relieves right skew (positive values only)
df["amount_log"] = np.log1p(df["amount"])  # log(1+x), can handle 0
print(df["amount_log"].skew())   # closer to 0 — more symmetric

# Box-Cox / Yeo-Johnson: the data decides the optimal transformation
pt = PowerTransformer(method="yeo-johnson")
df["amount_yj"] = pt.fit_transform(df[["amount"]])
```

> ⚠️ **Pitfall**: The question "Does standardizing or normalizing skewed data make it normal?" is a trap. **No.** Standardization changes only the mean and scale, and the skewness and kurtosis remain. To move closer to normality you need a nonlinear transformation such as log or Box-Cox. Also, log is undefined at 0 and for negatives, so use `log1p` or Yeo-Johnson.

> ⚠️ **Pitfall**: Whatever the transformation, **fit it on the training set only** and apply just transform to the validation and test sets. Computing the mean, maximum or λ from all the data is leakage at that very moment. This principle is covered in earnest on Day 3.

## Sample and Population

Your data is almost always a **sample**, and what you want to know is the **population**.

| Category | Object | Symbol | Character |
|---|---|---|---|
| Population | The entire set of interest | μ (mean), σ (standard deviation) | Parameter, usually unknowable |
| Sample | A subset drawn from the population | x̄ (sample mean), s (sample standard deviation) | Statistic, the value we compute |

- A good sample represents the population **without bias**.
- Collecting from only one region or one period creates **selection bias**, and the model learns a distribution that differs from reality.
- With a small sample the estimate wobbles; as it grows, the standard error σ/√n shrinks and the estimate becomes more precise.

The basis for trusting that the sample mean estimates the population mean is the **Central Limit Theorem (CLT)**. Regardless of the shape of the population distribution, when n is large enough, the distribution of sample means approximates a normal distribution with standard error σ/√n. The larger the sample, the tighter the estimate, and the confidence interval also follows a normal distribution. The habit of asking in EDA "is the sample large enough and representative?" comes from here.

## The MLS View: Where Statistical Diagnosis Leads

### AWS Service Mapping Table

| Situation | AWS service / feature | Reason |
|---|---|---|
| Visually profile distributions, missing values and outliers without code | SageMaker Data Wrangler | After importing data, check distributions with built-in analyses and visualizations, and export the applied transformations as a processing flow as they are |
| Scan large raw data in S3 with SQL to check basic statistics | Amazon Athena | Query S3 directly without preparing servers to pull count, mean and quantiles |
| Operate profile reports and cleaning recipes through a visual UI | AWS Glue DataBrew | Manage data profiling and cleaning steps in a reusable form without writing code |
| Check class imbalance and bias in the data before training | SageMaker Clarify | Produces pre-training bias metrics to catch sample-representativeness problems early |
| Fix large-scale transformations as a reproducible job | SageMaker Processing Job | Reuse the same preprocessing script in training and inference to prevent training-serving skew |
| Manage computed statistics and derived features team-wide | SageMaker Feature Store | Lets training and inference share the same feature definitions |

### Question Clue → Answer Mapping Table

| Phrase in the question | Signal to read | Answer to choose |
|---|---|---|
| "The income distribution is stretched long to the right" | Positive skewness | Log or Box-Cox transform, median as the representative value |
| "Even after standardizing, it is still skewed" | Linear transforms leave the shape unchanged | A nonlinear transformation is needed |
| "There are a few extremely expensive listings" | Outliers present | Median, IQR, RobustScaler |
| "The values mix zeros and negatives" | Log and Box-Cox cannot be used | Yeo-Johnson |
| "The histogram has two peaks" | Mixed subgroups | Split the segments and analyze/model each |
| "Data was collected from only one region and one month" | Selection bias | Redesign the sample, secure representativeness |
| "Increasing the sample made the mean estimate stable" | Standard error σ/√n decreases | Central Limit Theorem (CLT) |
| "The standard deviations from pandas and numpy differ" | Difference in default ddof | Bessel's correction (sample ddof=1 vs population ddof=0) |

Tomorrow covers the **relationships between** variables — correlation coefficients and the problem of causation.

## 📖 Glossary

- **Skewness**: The degree to which a distribution leans to one side. Positive means a long right tail.
- **Kurtosis**: A value showing how thick the tails are. The larger it is, the more frequent the extreme values.
- **Robust statistic**: A statistic that is not greatly shaken by outliers. The median and IQR are the classic examples.
- **IQR (interquartile range)**: Q3 (the upper 25% boundary) − Q1 (the lower 25% boundary). The width over which the middle half is spread.
- **Coefficient of variation (CV)**: The standard deviation divided by the mean. Used to compare variability among variables whose differing units prevent direct comparison.
- **Bessel's correction**: A method that divides by n−1 instead of n when computing the sample variance, correcting the underestimation bias.
- **Linear-transform invariance**: The property that transformations that change only location and scale, such as standardization and Min-Max, cannot change the distribution shape.
- **Yeo-Johnson transform**: A normalization-oriented nonlinear transformation that, unlike Box-Cox, can be used even when zeros and negatives are present.
- **Selection bias**: An error in which the way the sample was gathered produces a distribution different from the population.
- **Central Limit Theorem (CLT)**: The theorem that, regardless of the population's shape, when the sample is large the distribution of sample means approaches a normal distribution.

---

## 📝 Practice Questions

**Question 1.** You applied standardization (StandardScaler) to a right-skewed income distribution. Which result is correct?

A) The distribution becomes a normal distribution  
B) Skewness becomes 0 and the distribution becomes symmetric  
C) The mean becomes 0 and the standard deviation becomes 1, but the skewed shape remains  
D) The median becomes larger than the mean  

**Answer: C**  
Explanation: Standardization is a linear transformation, so it changes only location (mean) and scale (standard deviation). Distribution shape, such as skewness and kurtosis, does not change, so the skew remains (A and B are wrong). Nonlinear transformations such as log or Box-Cox are needed to reduce skew. With right skew, mean > median regardless of the transformation (D is wrong).

---

**Question 2.** Four datasets with the same mean, variance, and correlation coefficient showed completely different shapes on scatter plots. Which EDA principle does this case emphasize?

A) Computing summary statistics alone is sufficient  
B) Do not rely only on summary statistics; always check distributions and relationships through visualization  
C) You should always use the mode rather than the mean  
D) With a lot of data, the distribution always becomes normal  

**Answer: B**  
Explanation: Anscombe's quartet shows that even with identical summary statistics, the actual data structure can be completely different. Therefore you must check distributions and relationships directly with visualizations such as histograms, scatter plots, and box plots. Trusting only summary values (A) is exactly the trap this case warns about, and C and D are unrelated generalizations.

---

**Question 3.** You want to report a "representative price" for highly skewed housing price data. Which central tendency statistic is robust to outliers?

A) Mean  
B) Range  
C) Variance  
D) Median  

**Answer: D**  
Explanation: The median is the middle value of the sorted data, so it is barely affected by outliers such as extremely expensive listings. The mean (A) is pulled upward by the long tail. Range (B) and variance (C) are measures of dispersion, not central tendency, and both are very sensitive to outliers.

---

**Question 4.** Which is the correct reason that pandas `series.std()` and numpy `np.std(array)` return different values on the same data?

A) pandas defaults to the population standard deviation and numpy to the sample standard deviation  
B) pandas defaults to the sample standard deviation (ddof=1) and numpy to the population standard deviation (ddof=0)  
C) pandas fills missing values with 0  
D) The two libraries differ in computational precision  

**Answer: B**  
Explanation: pandas `.std()` defaults to the sample standard deviation with the degrees-of-freedom correction (n-1, ddof=1), while numpy `np.std()` defaults to the population basis (n, ddof=0). Because of Bessel's correction, the difference is noticeable in small samples (A has the direction reversed). Missing-value handling and precision (C and D) are unrelated.

---

**Question 5.** Which theorem underlies the phenomenon in which, as the sample size grows, the sample mean converges more precisely to the population mean and the distribution of the sample mean approaches a normal distribution?

A) Bayes' theorem  
B) It is explained by the law of large numbers alone and has nothing to do with normality  
C) Central limit theorem (CLT)  
D) Bessel's correction  

**Answer: C**  
Explanation: The central limit theorem states that, regardless of the population distribution's shape, when n is sufficiently large the distribution of sample means approximates a normal distribution and the standard error shrinks as σ/√n. Bayes' theorem (A) is about updating conditional probabilities and Bessel's correction (D) is a bias correction for variance estimation, so they are different topics. The CLT also guarantees convergence to normality, so B is inaccurate as well.

---
