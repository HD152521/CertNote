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

## 📝 연습 문제

**문제 1.** 오른쪽으로 길게 치우친 소득 분포에 표준화(StandardScaler)를 적용했다. 결과로 옳은 것은?

A) 분포가 정규분포로 바뀐다  
B) 왜도가 0이 되어 대칭이 된다  
C) 평균이 0, 표준편차가 1이 되지만 치우친 모양은 그대로다  
D) 중앙값이 평균보다 커진다  

**정답: C**  
해설: 표준화는 선형 변환이라 위치(평균)와 척도(표준편차)만 바꾼다. 왜도·첨도 같은 분포의 모양은 변하지 않으므로 치우침은 그대로 남는다(A·B 오답). 치우침을 펴려면 로그·Box-Cox 같은 비선형 변환이 필요하다. 오른쪽 치우침에서는 변환과 무관하게 평균 > 중앙값이다(D 오답).

---

**문제 2.** 같은 평균·분산·상관계수를 가진 네 데이터셋이 산점도에서는 전혀 다른 모양을 보였다. 이 사례가 강조하는 EDA 원칙은?

A) 요약 통계량만 계산하면 충분하다  
B) 요약 통계량에만 의존하지 말고 반드시 시각화로 분포·관계를 확인해야 한다  
C) 평균보다 최빈값을 항상 사용해야 한다  
D) 데이터가 많으면 분포는 항상 정규분포가 된다  

**정답: B**  
해설: 앤스컴의 4중주는 동일한 요약 통계량이라도 실제 데이터 구조가 완전히 다를 수 있음을 보여 준다. 따라서 히스토그램·산점도·박스플롯 같은 시각화로 분포와 관계를 직접 확인해야 한다. 요약값만 믿는 태도(A)가 바로 이 사례가 경고하는 함정이며, C·D는 무관한 일반화다.

---

**문제 3.** 매우 치우친 주택 가격 데이터에서 "대표 가격"을 보고하려 한다. 이상치에 강건한 중심 통계량은?

A) 평균  
B) 범위  
C) 분산  
D) 중앙값  

**정답: D**  
해설: 중앙값은 정렬된 데이터의 가운데 값이라 극단적 고가 매물 같은 이상치에 거의 흔들리지 않는다. 평균(A)은 긴 꼬리에 끌려 위로 치우친다. 범위(B)와 분산(C)은 중심 통계량이 아니라 산포 통계량이며, 둘 다 이상치에 매우 민감하다.

---

**문제 4.** pandas의 `series.std()`와 numpy의 `np.std(array)`가 같은 데이터에서 다른 값을 내는 이유로 옳은 것은?

A) pandas는 모집단 표준편차, numpy는 표본 표준편차를 기본으로 한다  
B) pandas는 표본 표준편차(ddof=1), numpy는 모집단 표준편차(ddof=0)를 기본으로 한다  
C) pandas는 결측치를 0으로 채운다  
D) 두 라이브러리의 계산 정밀도가 달라서다  

**정답: B**  
해설: pandas `.std()`는 표본 표준편차로 자유도 보정(n−1, ddof=1)을 기본 적용하고, numpy `np.std()`는 모집단 기준(n, ddof=0)을 기본으로 한다. 베셀 보정 때문에 작은 표본에서 차이가 두드러진다(A는 방향이 반대). 결측 처리나 정밀도 문제(C·D)와는 무관하다.

---

**문제 5.** 표본 크기가 커질수록 표본 평균이 모집단 평균에 더 정밀하게 수렴하고, 표본 평균의 분포가 정규분포에 가까워지는 현상의 근거가 되는 정리는?

A) 베이즈 정리  
B) 큰 수의 법칙만으로 설명되며 정규성과는 무관하다  
C) 중심극한정리(CLT)  
D) 베셀 보정  

**정답: C**  
해설: 중심극한정리는 모집단 분포 모양과 무관하게, n이 충분히 크면 표본 평균들의 분포가 정규분포에 근사하고 표준오차가 σ/√n로 줄어든다고 말한다. 베이즈 정리(A)는 조건부 확률 갱신, 베셀 보정(D)은 분산 추정의 편향 보정으로 주제가 다르다. CLT는 정규성 수렴까지 보장하므로 B도 부정확하다.

---
