# Day 2 - Correlation and Relationships: Correlation Coefficients, Causation vs. Correlation, Multivariate Relationships

## 📌 Key Takeaways

- **Pearson looks at linear relationships, Spearman at monotonic ones.** Whatever the correlation coefficient, always interpret it **together with a scatter plot**.
- **Correlation is not causation.** First suspect reverse causation, confounders, chance, and selection bias. Causal claims require an experimental design (A/B test).
- When explanatory variables correlate strongly with each other, you have **multicollinearity**. The coefficients of linear and logistic regression become unstable (VIF > 5–10 is the warning line).
- **Tree-based models are insensitive to multicollinearity**, but correlated variables split the importance between them, so each one's individual importance is underestimated.
- For categorical-vs-categorical, use the **chi-square test and Cramér's V** rather than a correlation coefficient; for numeric-vs-categorical, use **group mean comparison (ANOVA) and boxplots**.

## Correlation Coefficients: Degree of Joint Movement

Yesterday we examined the distribution of a single variable. Today we look at **relationships between variables**. Do two variables move together? If so, how strongly and in which direction? And the most dangerous question of all: just because they move together, is one the **cause** of the other?

MLS-C01 Domain 2 treats correlation analysis as a core EDA tool. Correlation drives feature selection, multicollinearity diagnosis, and the judgment "should I include this feature?" But **confusing correlation with causation** is the costliest mistake in data science.

A **correlation coefficient** quantifies how much two variables change together. Each type differs in what it measures and what it assumes.

| Coefficient | Measures | Assumptions / properties | Range |
|---|---|---|---|
| **Pearson** | Linear relationship | Continuous, normality preferred, sensitive to outliers | −1 to +1 |
| **Spearman** | Monotonic relationship | Rank-based, robust to nonlinearity and outliers | −1 to +1 |
| **Kendall's τ** | Rank concordance | Rank-based, robust when the sample is small or there are many ties | −1 to +1 |

- **+1**: perfect positive relationship (when one goes up, the other goes up)
- **0**: no linear (or monotonic) relationship
- **−1**: perfect negative relationship

Pearson captures **linear** relationships only. For a strongly nonlinear curve such as a U shape, the Pearson r can be near 0 even though the variables are in fact strongly associated. In that case, rank-based Spearman is more useful.

```
 Strong positive linear     Strong U shape (nonlinear)   Fake correlation created by one outlier
    ·                        ·         ·              ·
      ·                       ·       ·                       ·   ← this single point
        ·                       ·   ·                ····         pulls r upward
          ·                       ···                ····
  r ≈ +0.95 (Pearson OK)   r ≈ 0 (Pearson fails)    r is high but nothing real behind it
                            → Spearman, scatter plot → must confirm with a scatter plot
```

```python
import pandas as pd

df = pd.read_csv("data/marketing.csv")

# Pearson: linear relationship
print(df[["ad_spend", "revenue"]].corr(method="pearson"))

# Spearman: monotonic relationship (robust to nonlinearity and outliers)
print(df[["ad_spend", "revenue"]].corr(method="spearman"))

# Full correlation matrix (feature selection, multicollinearity check)
corr_matrix = df.corr(numeric_only=True)
```

Pearson r is the covariance of the two variables after standardizing them, and it connects directly to regression's R² (in simple linear regression, R² = r²). If r = 0.7, then R² = 0.49, meaning one variable explains about 49% of the other's variance. What matters is that r **measures linearity only**. Anscombe's quartet shows that the scatter plots can look completely different even when r is the same. A correlation coefficient must always be interpreted together with a scatter plot.

### Correlation Coefficient Selection Table — by Variable Type

| Variable combination | Nature of relationship | Recommended method | Caution |
|---|---|---|---|
| Continuous ↔ continuous | Linear | Pearson | A single outlier can shake the value greatly |
| Continuous ↔ continuous | Nonlinear but monotonic | Spearman | Does not tell you the "shape" of the curve |
| Ordinal ↔ ordinal | Rank agreement | Spearman / Kendall's τ | Kendall is more stable when there are many ties |
| Categorical ↔ categorical | Whether independent | Chi-square test of independence | The test is inaccurate if expected frequencies are too small |
| Categorical ↔ categorical | Strength of association | Cramér's V (0–1) | Has no notion of direction (positive/negative) |
| Categorical ↔ continuous | Difference between groups | ANOVA, boxplot, group mean comparison | Watch for imbalanced group sizes |
| Any combination | Check the actual shape | Scatter plot / heatmap visualization | Looking only at the coefficient will always mislead you |

## Correlation ≠ Causation

The costliest mistake in data science is **mistaking correlation for causation**. There are several explanations for why things move together.

| Pattern | Explanation | Example |
|---|---|---|
| True causation | A actually causes B | Exercise → improved fitness |
| Reverse causation | In fact B causes A | "Hospital visits ↔ illness": people visit the hospital because they are sick |
| Confounder | A hidden variable Z causes both | Ice cream sales ↔ drowning accidents: temperature (Z) raises both |
| Spurious | Coincidental alignment in a sample or time series | Two unrelated time series both trend upward |
| Selection bias | The way the sample was drawn creates a false relationship | A relationship that appears from observing only those who were admitted |

- To claim causation from correlation, observational data alone is not enough. You need a **randomized controlled trial (A/B test)** or causal inference techniques.
- If an experiment is impossible, you must at least **control for** confounders (stratification, regression adjustment).

> ⚠️ **Pitfall**: "Ice cream sales correlate with drowning accidents" is the textbook case, and it results from ignoring the confounder (temperature). On the exam, an answer choice like "A strong correlation was observed, so increasing A will increase B" is wrong. An observed correlation alone cannot justify a policy or intervention.

> ⚠️ **Pitfall**: Do not conclude "there is no relationship" just because the correlation coefficient is 0. A Pearson of 0 only means **there is no linear relationship**; a strong nonlinear relationship such as a U shape or a periodic pattern may be hiding.

## Multivariate Relationships and Multicollinearity

With three or more variables, relationships become complex. The most important problem in modeling is **multicollinearity**: the situation in which explanatory variables are strongly correlated with each other.

The problems with multicollinearity:

- In linear and logistic regression, **coefficient estimates become unstable** and interpretation breaks down (signs can even flip).
- It is hard to separate out which variable is truly important.
- Standard errors grow, which blurs statistical significance.

### Multicollinearity Diagnosis and Remedy Table

| Tool | Method | Decision criterion | Remedy |
|---|---|---|---|
| Correlation matrix heatmap | Visually scan the correlations of variable pairs | Watch pairs with \|r\| of 0.8–0.9 or higher | Remove one of the two, or merge them |
| VIF (Variance Inflation Factor) | Computed from the R² of regressing one variable on all the others | **VIF > 5 is a caution; > 10 is strong multicollinearity** | Remove or combine variables |
| Dimensionality reduction (PCA) | Compress correlated variables into orthogonal components | Choose the number of components by explained variance ratio | Cost: you lose interpretability |
| Regularization (Ridge) | Stabilize by applying an L2 penalty to the coefficients | Choose α by cross-validation | Keeps the variables while stabilizing the coefficients |
| Domain judgment | Clean up variables with redundant meaning (impressions, clicks, etc.) | — | Reconstruct them as ratio features |

```python
import seaborn as sns
import matplotlib.pyplot as plt
from statsmodels.stats.outliers_influence import variance_inflation_factor

# Correlation heatmap: first-pass multicollinearity scan
corr = df.corr(numeric_only=True)
sns.heatmap(corr, annot=True, cmap="coolwarm", center=0)
plt.show()

# Quantitative diagnosis: VIF
X = df[["ad_spend", "impressions", "clicks"]]
vif = pd.DataFrame({
    "feature": X.columns,
    "VIF": [variance_inflation_factor(X.values, i) for i in range(X.shape[1])],
})
print(vif)  # VIF > 10 indicates strong multicollinearity
```

Tree-based models (Random Forest, XGBoost) are **relatively insensitive** to multicollinearity. When splitting, they only need to pick one of the correlated variables, so predictive performance does not drop much. However, correlated variables share the importance between them, so individual importance can be underestimated. Linear and logistic regression, by contrast, suffer unstable coefficient estimation itself. The exam point is that **sensitivity to multicollinearity depends on the algorithm**.

### Correlation and Multicollinearity Sensitivity by Algorithm

| Algorithm type | Effect of multicollinearity | Predictive performance | Interpretation / importance | Response |
|---|---|---|---|---|
| Linear / logistic regression | Very sensitive | Not much worse, but unstable | Coefficients become practically uninterpretable | Remove variables, Ridge/Lasso, PCA |
| Ridge / Lasso | Mitigated | Stable | Lasso tends to keep only one of the correlated variables | Cross-validate the regularization strength |
| KNN / SVM (distance-based) | Moderate | Correlated variables count twice in the distance | — | Scaling + clean up redundant variables |
| PCA | Actually a precondition | — | Components are hard to interpret | Its purpose is to compress the correlation structure |
| Decision Tree / RF / XGBoost | Insensitive | Almost no effect | Importance is split and underestimated | Group correlated features when interpreting importance |

## Relationships Between Categorical Variables

Correlation coefficients are for numeric variables. Categorical relationships use different tools.

- **Chi-square test**: tests whether two categorical variables are independent (based on a contingency table).
- **Cramér's V**: an association-strength measure that normalizes chi-square to 0–1.
- **Numeric vs. categorical**: compare group means (ANOVA) and look at distribution differences with boxplots.

```python
import pandas as pd
from scipy.stats import chi2_contingency

# Test independence of two categorical variables
table = pd.crosstab(df["region"], df["churned"])
chi2, p, dof, expected = chi2_contingency(table)
print(f"chi2={chi2:.2f}, p-value={p:.4f}")  # p < 0.05 means there is an association
```

## Using Correlation for Feature Selection

The practical use of correlation analysis ultimately comes down to "which features do we keep?" You have to distinguish two directions.

| What you look at | Meaning | Use | Pitfall |
|---|---|---|---|
| Feature ↔ target correlation | How well that feature explains the target | Drop features with near-zero correlation from the candidates | Nonlinear relationships come out low. Discarding a feature just because its correlation is 0 can cost you |
| Feature ↔ feature correlation | Whether features carry overlapping information | Clean up redundant features to reduce multicollinearity | When keeping only one, choose the one with the better domain meaning |
| A single feature with \|r\| ≥ 0.95 against the target | Suspiciously perfect explanation | — | **The number-one sign of target leakage** (Day 3) |

Feature selection methods also fall into three groups.

| Method | How | Pros | Cons |
|---|---|---|---|
| Filter | Pre-screen with correlation coefficients, variance, chi-square | Fast and applicable independent of the model | Cannot see the combined effects of features |
| Wrapper | Forward selection / backward elimination, choosing by actual performance | Reflects combined effects | High computational cost |
| Embedded | Automatic selection during training (Lasso, tree importance) | Practical, directly tied to performance | Tied to the model type |

If you see a feature with an abnormally high correlation with the target (\|r\| ≈ 1) and celebrate "I found a great feature," you are making a mistake. It is far more likely that outcome information that is unknowable at prediction time has been mixed in. First ask: "Can I really know this value at the moment of prediction?"

## MLS Perspective: Where Does Correlation Analysis Lead?

### AWS Service Mapping Table

| Situation | AWS service / feature | Reason |
|---|---|---|
| Explore relationships with correlations, scatter plots, and histograms without code | SageMaker Data Wrangler | Built-in analysis and visualization let you quickly scan relationships between features and chain on transformations |
| Filter out low-correlation features to cut training cost | SageMaker processing flow + feature selection | Unneeded features raise both training time and overfitting risk |
| Compress correlated high-dimensional numeric data into orthogonal components | SageMaker built-in PCA algorithm | Removes multicollinearity while reducing dimensionality |
| Check whether a particular attribute (gender, region) is entangled with the target | SageMaker Clarify | Bias metrics before training check the association between sensitive attributes and labels |
| Check cross-tabulations and aggregate relationships with SQL on large data | Amazon Athena | Query the S3 source directly to extract cross-frequencies between categories |
| Explain after training which features contributed to predictions | SageMaker Clarify (feature attribution) | Correlation and model contribution differ, so post-hoc explanation is needed |

### Question Clue → Answer Mapping Table

| Phrase in the question | Signal to read | Answer to pick |
|---|---|---|
| "It is U-shaped but the correlation coefficient is near 0" | Pearson sees only linear | Spearman + confirm with a scatter plot |
| "Relationship between two continuous variables with many outliers" | Pearson is sensitive to outliers | Spearman (rank-based) |
| "Is region related to churn?" | Categorical ↔ categorical | Chi-square test of independence / Cramér's V |
| "VIF came out at 15" | Strong multicollinearity | Remove variables, PCA, or Ridge |
| "The sign of a regression coefficient is opposite to common sense" | Sign of multicollinearity | Check the correlation matrix and VIF |
| "The correlation is high, so increasing A will increase B" | Causal leap | Wrong. Suspect confounders and reverse causation; an A/B test is needed |
| "Many correlated variables but a tree model is used" | Trees are insensitive | Predictive performance holds up, but be careful interpreting importance |
| "Impressions, clicks, and ad spend are strongly correlated with each other" | Redundant information | Reconstruct as ratio features or keep only one |

In the next article we cover the deadliest enemy of EDA and validation: **data leakage**.

## 📖 Glossary

- **Correlation coefficient**: A value summarizing, on a scale of −1 to +1, how much two variables move together.
- **Pearson correlation**: A correlation coefficient that measures the strength of a straight-line relationship. Weak against outliers.
- **Spearman correlation**: A correlation coefficient that uses ranks instead of values to measure a monotonic relationship. Robust to nonlinearity and outliers.
- **Monotonic relationship**: A relationship in which, as one variable increases, the other keeps increasing or keeps decreasing. It need not be a straight line.
- **Confounder**: A hidden variable that influences both variables and creates a spurious correlation.
- **Reverse causation**: The error of interpreting the direction of cause and effect the wrong way around.
- **Multicollinearity**: The phenomenon in which explanatory variables are strongly correlated with each other, making regression coefficient estimates unstable.
- **VIF (Variance Inflation Factor)**: A multicollinearity measure showing how well one variable is explained by the remaining variables. Warning above 5–10.
- **Chi-square test of independence**: A method that tests, using a contingency table, whether two categorical variables are independent of each other.
- **Cramér's V**: A value that normalizes the chi-square statistic to 0–1 to express the strength of association between categorical variables.

## 📝 Practice Questions

**Question 1.** There is a strong U-shaped (nonlinear) relationship between two variables, yet the Pearson correlation coefficient came out near 0. Which method better captures the strength of the relationship?

A) Reduce the sample size  
B) Check the nonlinear relationship with a rank-based correlation such as Spearman and a scatter plot  
C) Conclude there is no relationship because the Pearson value is 0  
D) Standardize the two variables and recompute Pearson  

**Answer: B**  
Explanation: Pearson measures only linear relationships, so it can report a strong nonlinear relationship such as a U shape as near 0. The right approach is to check the shape with a scatter plot and also look at measures such as Spearman that capture monotonic relationships. You must not conclude "no relationship" from Pearson alone (C), and standardization is a linear transformation that does not change the Pearson value (D).

---

**Question 2.** In data showing that "ice cream sales and drowning incidents are strongly positively correlated," what is the correct interpretation?

A) Reducing ice cream sales will reduce drowning incidents  
B) Drowning incidents increase ice cream sales  
C) A confounding variable, temperature, may be raising both variables at the same time  
D) Because the correlation is strong, causation has been proven  

**Answer: C**  
Explanation: Hot weather (temperature) increases both ice cream consumption and swimming, so the two variables rise together - a classic confounding-variable case. Correlation does not prove causation (D), so claims that adjusting one will change the other (A and B) have no basis. Causal claims require experimental design or control of confounders.

---

**Question 3.** In a linear regression model, which problem occurs when the explanatory variables are strongly correlated with each other (very high VIF)?

A) Prediction always becomes impossible  
B) Coefficient estimates become unstable and interpreting individual variables becomes difficult  
C) The distribution of the target variable becomes normal  
D) Missing values are filled in automatically  

**Answer: B**  
Explanation: With multicollinearity, the explanatory variables share information, making coefficient estimates unstable and standard errors larger, which makes it hard to separate which variable truly has an effect. Prediction itself does not become impossible (A), and it is unrelated to the target distribution (C) or missing-value handling (D). VIF > 5-10 is a warning sign.

---

**Question 4.** You want to test whether two categorical variables (region and churn status) are independent. Which method is MOST appropriate?

A) Pearson correlation coefficient  
B) Standard deviation comparison  
C) Chi-square test of independence  
D) Log transformation  

**Answer: C**  
Explanation: The association/independence of two categorical variables is assessed with a chi-square test based on a contingency table, and the strength of association is measured with Cramér's V. Pearson correlation (A) is for numeric variables, and standard deviation comparison (B) and log transformation (D) are unrelated to testing categorical independence.

---

**Question 5.** When building a model on data with many correlated features, which algorithm is relatively insensitive to multicollinearity?

A) Linear regression  
B) Logistic regression  
C) Multiple linear regression used without ridge regression  
D) Tree-based models such as random forest  

**Answer: D**  
Explanation: Tree-based models only need to pick one of the correlated variables at each split, so predictive performance does not degrade much and they are relatively insensitive to multicollinearity (although variable importance may be split and underestimated). Linear and logistic regression (A, B, C) have unstable coefficient estimates themselves and are therefore sensitive to multicollinearity.

---
