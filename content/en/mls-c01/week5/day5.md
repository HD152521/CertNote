# Day 5 - Week 5 Comprehensive Review: Statistics and Validation Design

## 📌 Key Takeaways

- This week converges on a single question: **"Can I trust my validation score?"** If any one of statistics, correlation, leakage, or validation collapses, the score becomes an illusion.
- **Look at the distribution first** (skewness, outliers) and then choose a robust statistic. Linear scaling cannot change the shape.
- **Correlation is not causation.** Suspect confounders and reverse causation, and diagnose correlation among explanatory variables (multicollinearity) with VIF.
- **Leakage is a matter of timing.** "Could we have known this value at the moment of prediction?" is the only criterion.
- **The nature of the data determines the validation design.** Imbalance → stratification, time series → TimeSeriesSplit, groups → GroupKFold, small data → k-fold.

## Flow Map: Statistics → Correlation → Leakage → Validation

This week covered the second half of EDA: **statistics basics** and **validation design**. These are four things: summarizing data honestly (statistics), reading relationships between variables (correlation), avoiding the traps that contaminate evaluation (leakage), and credibly estimating generalization performance (validation). These four are the last gate of MLS-C01 Domain 2, and the place where the answer to "why does my model fail in production?" hides.

```text
[Data]
   │
   ├─ 1) Statistics basics (Day1)
   │     Distribution: check skewness and kurtosis first (Anscombe's quartet)
   │     Center: median if skewed, mean if symmetric
   │     Spread: standard deviation / IQR, IQR is the robust one
   │     Transformation: linear (standardization) = shape unchanged, log/Box-Cox = reduces skew
   │     Sample ↔ population: CLT, suspect representativeness and bias
   │
   ├─ 2) Correlation and relationships (Day2)
   │     Pearson (linear) vs Spearman (monotonic, robust)
   │     Correlation ≠ causation: reverse causation, confounders, chance
   │     Multicollinearity: VIF>5–10, linear model coefficients unstable (trees insensitive)
   │     Categorical: chi-square / Cramér's V
   │
   ├─ 3) Data leakage (Day3)
   │     Target leakage: outcome information flows in → not caught by splitting, check timing
   │     Time-series leakage: no random splits, no future windows
   │     Train-test contamination: after splitting, fit on the training part only, wrap in a Pipeline
   │
   └─ 4) Validation design (Day4)
         Three-way split: test is sealed to the end, viewed exactly once
         k-fold: saves data, mean ± standard deviation (k=5/10)
         Stratification: essential for imbalanced classification
         Time series: TimeSeriesSplit (past → future)

   ▼
[A trustworthy validation score] ──▶ Model selection and tuning decisions become valid at last
```

The four stages are not an ordered pipeline but **gates that check one another**. If you misread the distribution, the transformation is wrong; if the transformation is done on the entire dataset, it becomes leakage; and if there is leakage, however sophisticated the validation design, the score is false.

## Comparison Tables for Easily Confused Pairs

This week's content is tested as questions that "distinguish two things that look similar."

### Pearson vs Spearman

| Item | Pearson | Spearman |
|---|---|---|
| What it measures | Linear relationship | Monotonic relationship (need not be a straight line) |
| Computed from | Actual values | Ranks |
| Outliers | Very sensitive | Robust |
| U-shaped nonlinear | r ≈ 0, misses the relationship | Also low if not monotonic, but catches curved monotonic relationships |
| Clue to pick it | "Continuous, straight-line relationship" | "Many outliers," "rank or grade data," "nonlinear but consistent direction" |

### Standardization vs Normalization (Min-Max)

| Item | Standardization (Z-score) | Normalization (Min-Max) |
|---|---|---|
| Formula | (x − μ) / σ | (x − min) / (max − min) |
| Result | Mean 0, standard deviation 1 | Range [0, 1] |
| Distribution shape | **Unchanged** | **Unchanged** |
| Outliers | Sensitive (μ and σ get pulled) | Very sensitive (a single max compresses everything) |
| Clue to pick it | "Default for linear models, neural networks, PCA" | "The input range must be fixed to [0,1]" |

Neither method **removes skewness.** To reduce skewness you need a nonlinear transformation such as log, Box-Cox, or Yeo-Johnson.

### Target Leakage vs Train-Test Contamination

| Item | Target leakage | Train-test contamination |
|---|---|---|
| Where the leak is | The feature itself | The preprocessing and splitting procedure |
| Caught by splitting? | **No** (every split is contaminated equally) | Yes (fixed just by correcting the order) |
| Symptom | Validation and test both high, only production low | Validation high but test low from the start |
| Fix | Audit feature generation time, remove that feature | Split first → fit on the training part only → Pipeline |

### k-fold vs TimeSeriesSplit

| Item | k-fold | TimeSeriesSplit |
|---|---|---|
| Assumption | Rows are independent and exchangeable | The order itself is information |
| Split method | Take turns validating each fold | Training is always earlier than validation |
| Data usage | Every row is used for validation once | The early period is never used for validation |
| If used on a time series | Leakage from predicting the past with the future | Same structure as the deployment situation |

### validation vs test

| Item | Validation set | Test set |
|---|---|---|
| Purpose | Hyperparameter and model selection | Final performance estimate |
| Times used | Many times | **Exactly once** |
| If contaminated | Selection bias accumulates and the score is optimistic | The reported number itself becomes false |
| Why separate | Because of the multiple comparisons problem | It is honest only if never used |

### Stratified Split vs GroupKFold

| Item | Stratified | GroupKFold |
|---|---|---|
| What it preserves | Class **ratio** | Group **integrity** (the same group on only one side) |
| Situation to use | Imbalanced classification | Multiple rows from the same user or patient |
| If not used | Some folds lack the minority class | The same entity straddles both sides and performance is inflated |

## Key Decision Summary

### Center and Spread: What Should You Report?

| Situation | Center | Spread |
|---|---|---|
| Symmetric distribution | Mean | Standard deviation |
| Skew or outliers present | Median | IQR |
| Categorical | Mode | — |

### Transformation: Does It Change the Shape?

| Operation | Distribution shape | Requirement |
|---|---|---|
| Standardization, Min-Max (linear) | **Unchanged** (skew retained) | None |
| Log, square root (nonlinear) | Reduces right skew | x ≥ 0 |
| Box-Cox | Approaches normal | x > 0 (positive only) |
| Yeo-Johnson | Approaches normal | Allows negatives and zero |

### Measuring Relationships: What Should You Use?

| Relationship / data | Recommended |
|---|---|
| Linear, continuous | Pearson |
| Nonlinear/monotonic, outliers present | Spearman |
| Two categorical variables | Chi-square / Cramér's V |
| Categorical ↔ continuous | Group mean comparison (ANOVA), boxplot |
| Multicollinearity diagnosis | Correlation heatmap + VIF (warning at >5–10) |

### Blocking Leakage: Golden Rules

| Principle | Execution |
|---|---|
| Split first | Takes priority over preprocessing |
| Fit on the training part only | Scalers, encoders, imputers |
| Use a Pipeline | Automatic isolation per fold |
| Time series in time order | No random splits |
| Audit feature generation time | "Can we know it at prediction time?" |
| Clean up duplicates and groups | Handle **before** splitting |

### Validation Strategy Selection

| Data characteristic | Recommended validation |
|---|---|
| General classification, plenty of data | Stratified three-way split |
| Data is scarce | Stratified k-fold |
| Class imbalance | Stratification mandatory + PR-AUC and recall |
| Time series | TimeSeriesSplit |
| Group structure (users, patients) | GroupKFold |
| Honest evaluation including tuning | Nested CV |

## Question Clue → Answer Mapping Table

| Phrase in the question | Signal to read | Answer to pick |
|---|---|---|
| "There is a time order / daily or monthly data" | Time series | TimeSeriesSplit, rolling after shift |
| "The class is 0.5%" | Extreme imbalance | Stratified split + PR-AUC and recall (rule out accuracy) |
| "Data is scarce (a few hundred records)" | A single split is unstable | k-fold cross-validation, mean ± standard deviation |
| "Income/price is stretched to the right" | Positive skew | Log or Box-Cox, report the median |
| "Still skewed even after standardizing" | A linear transformation leaves the shape unchanged | A nonlinear transformation is needed |
| "Zeros and negatives are mixed in" | Log and Box-Cox are impossible | Yeo-Johnson |
| "VIF is 15 / the coefficient signs flipped" | Multicollinearity | Remove variables, PCA, Ridge (can be ignored if trees) |
| "The correlation is high, so increasing A will increase B" | Causal leap | Wrong. Suspect confounders and reverse causation; A/B test needed |
| "Validation and test are both high, only production is low" | Leakage not caught by splitting | Target leakage |
| "Scaled on the entire dataset, then split" | Test statistics flowed in | Fit inside each fold with a Pipeline |
| "Multiple test records for the same patient" | Group structure | GroupKFold |
| "The model was fixed while watching the test score" | Sealing violated | The final estimate is contaminated |

## AWS Service Mapping Table (Weekly Integration)

| Situation | AWS service / feature | Reason |
|---|---|---|
| Explore distribution, missing values, and correlation without code and chain on transformations | SageMaker Data Wrangler | Visual analysis and transformation remain as a single flow that can be reproduced |
| Fix preprocessing identically for training and inference | SageMaker Processing Job | Reusing the script reduces both training-serving skew and leakage |
| Manage feature definitions as shared by the team | SageMaker Feature Store | Training and inference share the same definitions, preventing point-in-time mismatch |
| Fix the order of splitting, preprocessing, training, and evaluation in code | SageMaker Pipelines | Structurally blocks procedural mistakes such as "preprocessing before the split" |
| Check class imbalance and bias before training, and feature attribution after training | SageMaker Clarify | Look at both sample representativeness problems and single-feature monopoly (a leakage signal) |
| Automatically search hyperparameters against a validation metric | SageMaker automatic model tuning | Specify an objective metric and compare multiple training jobs |
| Monitor input distribution and performance gap after deployment | SageMaker Model Monitor | Catches the difference between validation and production early |

## Wrong-Answer Notes: What Is Easy to Get Wrong This Week

> 💡 **Concept**: This week's content converges on a single question: **"Can I trust my validation score?"** Statistics (distribution, sampling) ensure that the data represents the population, correlation analysis keeps you from mistaking a relationship for causation, leakage checks keep future and outcome information from seeping in, and validation design guarantees that the test set is truly independent. If any one of these four collapses, the validation score is an illusion, not generalization.

| Common misconception | Why it is wrong | Correct understanding |
|---|---|---|
| ① Standardizing removes skew | A linear transformation changes only location and scale | The shape stays the same. Log or Box-Cox is needed |
| ② A strong correlation means causation | There are confounders, reverse causation, and chance | Causation only through experimental design or confounder control |
| ③ A correlation of 0 means no relationship | Pearson sees only linear | A nonlinear relationship such as a U shape may be hiding |
| ④ If you just split well, there is no leakage | Target leakage is inside the feature | You must audit feature generation time |
| ⑤ It is fine to scale on the entire dataset and then split | Test statistics leak into training | Split first, fit on the training part only |
| ⑥ A random split is enough for time series too | The order is information | Chronological split (forward-chaining) |
| ⑦ A random split is fine for imbalanced data too | The minority class can vanish from a fold | Stratified split |
| ⑧ Accuracy is high on imbalanced data, so it is a good model | It is high even if only the majority class is right | Re-examine with PR-AUC and recall |
| ⑨ It is fine to tune while watching the test set | The test set becomes a validation set | Seal it, look exactly once |
| ⑩ The larger k, the unconditionally better | Variance and computational cost grow | k=5–10 is the balance point |
| ⑪ Multicollinearity is fatal to every model | Tree-based models are insensitive in prediction | Coefficients collapse only in linear models |

### Integrated Checklist Code

```python
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

# Block leakage + handle imbalance at once: Pipeline + StratifiedKFold
pipe = Pipeline([
    ("impute", SimpleImputer(strategy="median")),   # median imputation to cope with skew
    ("scale", StandardScaler()),                     # fit only on each fold's training part
    ("clf", LogisticRegression(class_weight="balanced")),
])
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipe, X, y, cv=skf, scoring="f1")
print(f"F1: {scores.mean():.3f} ± {scores.std():.3f}")
```

> ⚠️ **Pitfall Roundup**: ① Standardization removes skew (no, the shape is unchanged) ② A strong correlation is causation (no, suspect confounders) ③ If you split well, leakage disappears (no, target leakage slips through) ④ Split after scaling the entire dataset (no, leakage) ⑤ Random split for time series (no, chronological) ⑥ Random split for imbalanced data (no, stratify) ⑦ Tune with the test set (no, seal it and look once).

The week in one sentence: **"An honest validation score holds only on top of good statistics, understanding of relationships, leakage blocking, and validation design."**

Next week we move beyond EDA into **modeling (Domain 3)**, and see how algorithm selection, training, and evaluation work on the statistical and validation foundation built so far.

## 📖 Glossary

- **Robust statistic**: A statistic that is not shaken much by outliers. The median and IQR are the standard examples.
- **Linear transformation invariance**: The property that transformations that change only location and scale, such as standardization and Min-Max, cannot change the distribution's shape.
- **Confounder**: A hidden variable that influences both variables and creates a spurious correlation.
- **Multicollinearity**: The phenomenon in which explanatory variables are strongly correlated with each other, making regression coefficient estimates unstable. VIF of 5–10 is the warning line.
- **Target leakage**: Leakage in which outcome information about the prediction target is in a feature. It is not caught by any split.
- **Train-test contamination**: The phenomenon in which preprocessing before the split leaks test information into training. Prevented with a Pipeline.
- **Stratified sampling**: A way of splitting so that each split preserves the original class ratio.
- **GroupKFold**: Cross-validation that keeps rows from the same group from being separated between training and validation.
- **PR-AUC**: The area under the precision-recall curve. More honest than accuracy or ROC-AUC when the positive ratio is very low.
- **Multiple comparisons problem**: The phenomenon in which comparing multiple candidates on the same validation set selects one that fits by chance, optimistically biasing the score.

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
