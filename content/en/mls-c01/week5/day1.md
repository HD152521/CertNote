# Day 1 - Statistical Foundations: Distribution, Central Tendency, Dispersion, Transformations, Sample and Population

EDA's final week is about "honestly summarizing data numerically and validating whether that summary is trustworthy." Before MLS-C01 asks about algorithms, it tests **statistical intuition**. Is the distribution skewed? Should you trust mean or median? Does the sample fairly represent the population?—misunderstanding these leads to wrong conclusions, regardless of model choice.

Today we build EDA's statistical foundation: **distribution**, **central tendency and dispersion**, **how transformations affect distributions**, and **sample versus population**.

## Distribution: See the Shape First

Don't compute means first. **Look at distribution shape** first. Same mean, wildly different shapes.

| Distribution Feature | Meaning | EDA Implication |
|------|------|------|
| Symmetric | Left-right balance, near normal | Mean/std dev are representative |
| Right-skewed (positive) | Long right tail (income, prices) | Mean > median; log transform candidate |
| Left-skewed (negative) | Long left tail (scores near ceiling) | Mean < median |
| Multimodal | Multiple peaks | Suspect subpopulations mixed |
| High kurtosis | Peaked, heavy tails | Outliers and extremes frequent |

**Skewness** measures asymmetry; **kurtosis** measures tail weight. Skewness 0 = symmetric; positive = right tail.

```python
import pandas as pd

df = pd.read_csv("data/transactions.csv")

# Summarize distribution shape numerically
print(df["amount"].skew())      # Skewness: positive = right-skewed
print(df["amount"].kurt())      # Kurtosis: positive = peaked, heavy tails
print(df["amount"].describe())  # count, mean, std, min, 25/50/75%, max
```

> 💡 **Key Theory**: The principle "see distribution first" is dramatically illustrated by **Anscombe's Quartet** (1973). Four datasets have identical mean, variance, correlation coefficient, and regression line, yet scatter plots show completely different shapes (linear, curved, point outlier pulling a line, etc.). Trusting summary statistics alone while skipping visualization hides real data structure—why EDA always includes histograms, boxplots, scatter plots.

## Central Tendency: Mean, Median, Mode

A data's representative "middle value" is **central tendency**.

- **Mean**: Sum of all values ÷ count. Sensitive to outliers.
- **Median**: Middle value when sorted. Robust against outliers.
- **Mode**: Most frequent value. Useful for categorical data.

In skewed distributions, mean and median diverge. Right-skewed data pulls the mean up: **mean > median**. Income and home prices, being right-skewed, are better represented by median than mean.

| Situation | Recommended Central Statistic |
|------|------|
| Symmetric distribution | Mean |
| Skewed/outliers present | Median |
| Categorical | Mode |

## Dispersion: How Spread Out Is Data?

Central tendency alone isn't enough. Measure **how scattered** the data is.

| Statistic | Definition | Character |
|------|------|------|
| Range | Max − min | Extremely outlier-sensitive |
| Variance | Average squared deviation | Units squared |
| Standard deviation (std) | Square root of variance | Interpretable in original units |
| IQR | Q3 − Q1 | Robust against outliers |
| Coefficient of variation (CV) | Std ÷ mean | Unit-free, relative spread |

Standard deviation tells "how far from mean, on average, in original units." For normal distribution: mean ±1σ contains ~68%; ±2σ ~95%; ±3σ ~99.7% (**68-95-99.7 rule**).

> 💡 **Key Theory**: Computing standard deviation from a sample uses **n−1, not n** (**Bessel's correction**). Sample mean minimizes squared deviations for that sample, systematically underestimating population variance. Reducing degrees of freedom (n−1) corrects this bias. pandas `.std()` defaults to sample (ddof=1); numpy's `np.std()` defaults to population (ddof=0)—results subtly differ, an exam trap.

## Transformation Effects on Distribution

Scaling vs. transformation differs by whether shape changes.

| Treatment | Effect | Distribution Shape |
|------|------|------|
| Standardization | Mean 0, std 1 | **Shape unchanged**, location/scale only |
| Min-max normalization | Compressed to [0,1] | **Shape unchanged**, scale only |
| Log transformation | Compress large values | Right tail **approaches symmetry** |
| Square root transform | Gentle compression | Mild skew relief |
| Box-Cox / Yeo-Johnson | Optimal λ | Approaches normal |

**Core distinction: Linear scaling (standardization, min-max) doesn't change shape.** Skewness persists. To reduce skewness itself, use **nonlinear transforms like log or Box-Cox**.

```python
import numpy as np
from sklearn.preprocessing import StandardScaler, PowerTransformer

# Standardization: shape unchanged, scale only
scaler = StandardScaler()
df["amount_std"] = scaler.fit_transform(df[["amount"]])
print(df["amount_std"].skew())   # Same as original—shape invariant

# Log transform: eases right skew (positive values only)
df["amount_log"] = np.log1p(df["amount"])  # log(1+x), handles zero
print(df["amount_log"].skew())   # Closer to zero—more symmetric

# Box-Cox/Yeo-Johnson: data determines optimal transform
pt = PowerTransformer(method="yeo-johnson")
df["amount_yj"] = pt.fit_transform(df[["amount"]])
```

> ⚠️ **Pitfall**: Exams ask "does standardization/normalization turn skewed data normal?" **No.** Standardization changes mean/scale only; skewness/kurtosis stay. Approaching normality requires nonlinear transforms like log or Box-Cox. Also, log is undefined for zero and negatives—use `log1p` or Yeo-Johnson instead.

## Sample and Population

Your data is almost always a **sample**; what you want to understand is the **population**.

- **Population**: Entire universe of interest. Parameters use Greek letters: μ (mean), σ (std dev).
- **Sample**: Subset drawn from population. Statistics use Latin: x̄ (sample mean), s (sample std dev).

Good samples represent the population **unbiasedly**. Poor sampling (e.g., collecting only from one region/time) introduces **selection bias**, causing models to learn distributions unlike reality.

> 💡 **Key Theory**: Sample mean reliably estimates population mean because of the **Central Limit Theorem (CLT)**. Regardless of population distribution shape, for large enough n, the distribution of sample means approaches normal with standard error σ/√n. Larger samples mean tighter estimates; confidence intervals follow normal. "Is the sample large and representative?" in EDA roots in CLT.

## Summary

Today's essentials: (1) Before computing means, examine **distribution shape (skewness, kurtosis)**; (2) For skewed data, use robust statistics like **median and IQR**; (3) **Linear scaling preserves shape; only nonlinear transforms like log/Box-Cox reduce skewness**; (4) Remember: you have a sample, so always ask **whether it fairly represents the population (bias, CLT)**.

Next, we examine relationships between variables—correlation and causation.

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
