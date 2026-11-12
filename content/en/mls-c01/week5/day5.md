# Day 5 - Week 5 Comprehensive Review: Statistics and Validation Design

This week covered the second half of EDA — **statistical foundation** and **validation design**. Honestly summarizing data (statistics), reading relationships between variables (correlation), avoiding pitfalls that contaminate evaluation (leakage), and reliably estimating generalization performance (validation). These four form the final gate of MLS-C01 Domain 2 and hide the answer to the practical question "why does my model fail in production?" Today we review four days as one integrated flow.

## One-Page Summary: Statistics → Correlation → Leakage → Validation

```text
[Data]
   │
   ├─ 1) Statistical Foundations (Day1)
   │     Distribution: Check skew/kurtosis first (Anscombe's quartet)
   │     Center: Median if skewed, mean if symmetric
   │     Spread: std/IQR, robustness = IQR
   │     Transform: Linear (standardization) = shape unchanged, log/Box-Cox = reduce skew
   │     Sample ↔ Population: CLT, suspect representativeness/bias
   │
   ├─ 2) Correlation and Relationships (Day2)
   │     Pearson (linear) vs Spearman (monotonic, robust)
   │     Correlation ≠ causation: reverse causation, confounders, chance
   │     Multicollinearity: VIF>5~10, linear model coefficients unstable (trees robust)
   │     Categorical: chi-square / Cramér's V
   │
   ├─ 3) Data Leakage (Day3)
   │     Target leakage: result info enters → splitting misses it, check timing
   │     Time series leakage: forbid random split, future windows
   │     Train-test contamination: after split, fit only on training, wrap with Pipeline
   │
   └─ 4) Validation Design (Day4)
         3-way split: test sealed until end, seen once only
         k-fold: conserve data, mean ± std (k=5/10)
         Stratified: essential for imbalanced classification
         Time series: TimeSeriesSplit (past → future)
```

## Core Decision-Making Summary

### Center·Spread: What Do We Report?

| Situation | Center | Spread |
|------|------|------|
| Symmetric distribution | Mean | Std deviation |
| Skew, outliers | Median | IQR |
| Categorical | Mode | — |

### Transformation: Change the Shape?

| Treatment | Distribution Shape |
|------|------|
| Standardization, min-max (linear) | **Unchanged** (skew preserved) |
| Log, square root (nonlinear) | Reduce right skew |
| Box-Cox, Yeo-Johnson | Closer to normal |

### Correlation Coefficient: What to Use?

| Relationship·Data | Recommended |
|------|------|
| Linear, continuous | Pearson |
| Nonlinear, monotonic, outliers | Spearman |
| Two categorical | Chi-square / Cramér's V |
| Multicollinearity diagnosis | Correlation heatmap + VIF |

### Leakage Prevention: Golden Rules

| Principle | Implementation |
|------|------|
| Split first | Priority over preprocessing |
| Fit only on training | Scaler, encoder, imputer |
| Use Pipeline | Auto-isolation per fold |
| Time series time-ordered | No random split |
| Audit feature creation | "Knowable at prediction?" |

### Validation Strategy Selection

| Data Characteristic | Recommended Validation |
|------|------|
| General classification, sufficient data | Stratified 3-way split |
| Data limited | Stratified k-fold |
| Class imbalance | Must stratify |
| Time series | TimeSeriesSplit |
| Group structure (users, patients) | GroupKFold |

## Most Confusing Exam Points

> 💡 **Related Theory**: This week's content converges on one question — **"Can I trust my validation score?"** Statistics (distribution, samples) ensure data represents the population, correlation analysis prevents mistaking correlation for causation, leakage checks prevent future/outcome information seeping, and validation design ensures the test set is truly independent. If any one of these four breaks down, validation scores aren't generalization — they're illusions.

Integrated checklist:

```python
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

# Block leakage + handle imbalance together: Pipeline + StratifiedKFold
pipe = Pipeline([
    ("impute", SimpleImputer(strategy="median")),  # median for skew
    ("scale", StandardScaler()),                    # fit only on fold training portion
    ("clf", LogisticRegression(class_weight="balanced")),
])
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipe, X, y, cv=skf, scoring="f1")
print(f"F1: {scores.mean():.3f} ± {scores.std():.3f}")
```

> ⚠️ **Pitfall Summary**: ① Standardization removes skew (no, shape unchanged). ② Strong correlation means causation (no, suspect confounders). ③ Good splitting eliminates leakage (no, target leakage escapes). ④ Scale entire data then split (no, leakage). ⑤ Random split time series (no, time order). ⑥ Random split imbalanced data (no, stratify). ⑦ Tune on test set (no, seal once only).

## Next Week Preview

Next week we move beyond EDA to **Modeling (Domain 3)**. On the foundation of statistics and validation we've built, we'll see how algorithm choice, training, and evaluation work. If you've mastered validation design, you'll be able to judge "should I trust this score?" on your own during modeling.

## Summary

This week in one sentence: **"Honest validation scores rest only on good statistics, relationship understanding, leakage blocking, and validation design."** Check distribution first (skew, robust statistics), don't mistake correlation for causation (confounders), audit leakage by timing (target, time series, preprocessing), and design validation matching data (stratification, cross-validation, time series split). When all four are in place, every decision in model selection becomes trustworthy.

---

## 📝 Practice Questions

**Question 1.** After standardizing (StandardScaler) a right-skewed variable, the mean became 0 and the standard deviation 1. What happened to the skew of the distribution?

A) Skewness is preserved - a linear transformation does not change the shape  
B) The skew disappeared and it became a normal distribution  
C) It flipped to a left skew  
D) Only the kurtosis became 0  

**Answer: A**  
Explanation: Standardization is a linear transformation that changes only location and scale, and it preserves distribution shape such as skewness and kurtosis. Therefore the skew remains. To reduce skew, nonlinear transformations such as log or Box-Cox are needed. Becoming normal (B), flipping (C), or only kurtosis changing (D) all contradict the properties of a linear transformation.

---

**Question 2.** Validation accuracy and test accuracy are both 98%, but production performance dropped to 60%. The split was clean. What is the MOST likely cause?

A) There is too much data  
B) k is too large  
C) Target leakage, where outcome information is contained in the features  
D) The learning rate is low  

**Answer: C**  
Explanation: If the split is clean yet validation and test are both high and only production is low, the most likely cause is target leakage, in which the leak is inside the features and all splits are contaminated equally. Target leakage is not caught by splitting, and you must check when each feature is generated. The amount of data (A), k (B), and the learning rate (D) do not explain this pattern.

---

**Question 3.** The Pearson correlation between two variables is very high at 0.9. What is the correct interpretation?

A) It has been proven that one variable causes the other  
B) There is a strong linear relationship, but causation is a separate matter, and you should suspect confounders or reverse causation  
C) The two variables are necessarily independent  
D) The nonlinear relationship is strong  

**Answer: B**  
Explanation: A high Pearson correlation only indicates a strong linear relationship and does not prove causation. You must consider confounders, reverse causation, and chance (A is wrong). Because the correlation is high, the variables are not independent (C), and since Pearson measures linear relationships, interpreting it as a strong nonlinear relationship (D) is also wrong.

---

**Question 4.** You run 5-fold cross-validation on classification data with a 95:5 class imbalance. In some folds the minority class is almost absent, distorting the metrics. What is the solution?

A) Keep using plain KFold  
B) Switch to TimeSeriesSplit  
C) Use StratifiedKFold to maintain the class ratio in each fold  
D) Reduce the number of folds to 2  

**Answer: C**  
Explanation: For cross-validation on imbalanced data, StratifiedKFold, which keeps the class ratio in each fold identical to the original, is the answer. Plain KFold (A) leaves the problem of the minority class being scarce in some folds, TimeSeriesSplit (B) is only for time series, and reducing the number of folds (D) does not solve the ratio problem.

---

**Question 5.** You want to apply missing-value imputation and scaling in scikit-learn during cross-validation without leakage. Which configuration is MOST appropriate?

A) Impute and scale with the entire dataset, then call cross_val_score  
B) Preprocess using the statistics of the test fold  
C) Skip preprocessing and train on the raw data  
D) Put imputation, scaling, and the classifier in a Pipeline and pass it to cross_val_score  

**Answer: D**  
Explanation: When the preprocessing steps are bundled into a Pipeline and passed to cross-validation, `fit` happens only on the training portion of each fold and only `transform` is applied to the validation portion, blocking leakage. Preprocessing in advance with the entire dataset (A) or using test-fold statistics (B) causes leakage, and skipping preprocessing (C) is not a solution.

---
