# Day 2 - Correlation and Relationships: Correlation Coefficients, Causation vs. Correlation, Multivariate Relationships

Yesterday we examined single-variable distributions. Today we explore **relationships between variables**. Do two variables move together? If so, how strongly and in which direction? And the riskiest question—does moving together imply one **causes** the other?

MLS-C01 Domain 2 treats correlation analysis as EDA's core tool. Correlation guides feature selection, multicollinearity diagnosis, and "should I include this feature?" decisions. Yet **confusing correlation with causation** is data science's costliest error.

## Correlation Coefficients: Degree of Joint Movement

A **correlation coefficient** quantifies how two variables change together. Types and assumptions differ.

| Coefficient | Measures | Assumptions | Range |
|------|------|------|------|
| **Pearson** | Linear relationship | Continuous, normal preferred, outlier-sensitive | −1 to +1 |
| **Spearman** | Monotonic relationship | Rank-based, robust to nonlinearity and outliers | −1 to +1 |
| **Kendall's τ** | Rank concordance | Rank-based, robust to small samples and ties | −1 to +1 |

- **+1**: Perfect positive (one up, other up)
- **0**: No linear (or monotonic) relationship
- **−1**: Perfect negative

Pearson captures **linear** relationships only. Strong nonlinear curves (U-shaped) may have Pearson r near 0 yet be strongly associated. Rank-based Spearman is more useful there.

```python
import pandas as pd

df = pd.read_csv("data/marketing.csv")

# Pearson: linear relationships
print(df[["ad_spend", "revenue"]].corr(method="pearson"))

# Spearman: monotonic (robust to nonlinearity, outliers)
print(df[["ad_spend", "revenue"]].corr(method="spearman"))

# Full correlation matrix (feature selection, multicollinearity check)
corr_matrix = df.corr(numeric_only=True)
```

> 💡 **Key Theory**: Pearson r is covariance after standardizing both variables, directly linked to regression's R² (simple linear: R² = r²). r = 0.7 means R² = 0.49—one variable explains ~49% of the other's variance. Crucially, r **measures linearity only**—Anscombe's Quartet shows r identical but scatter plots completely different. Always interpret correlation with scatter plots.

## Correlation ≠ Causation

Data science's costliest mistake is **mistaking correlation for causation**. Joint movement has multiple explanations.

| Pattern | Explanation | Example |
|------|------|------|
| True causation | A actually causes B | Exercise → fitness |
| Reverse causation | B actually causes A | "Hospital visits ↔ illness": sick people visit |
| Confounder | Hidden variable Z causes both | Ice cream sales ↔ drownings: heat (Z) causes both |
| Spurious | Sample/time series coincidence | Unrelated time series both trending up |
| Selection bias | Sampling method creates false link | Seeing only admitted applicants |

To claim causation from correlation needs **randomized controlled trials (A/B tests)** or causal inference techniques, not observational data alone.

> ⚠️ **Pitfall**: "Ice cream sales correlate with drownings" is classic—a confounder (temperature) is ignored. In exams, "strong correlation observed, so increasing A will increase B" is almost always a trap. Observed correlation alone cannot justify policy or intervention; causation claims need experimental design or confounder control.

## Multivariate Relationships and Multicollinearity

With three+ variables, relationships become complex. A critical modeling problem is **multicollinearity**—explanatory variables strongly correlating with each other.

Multicollinearity's problems:
- In linear/logistic regression, **coefficients become unstable** and interpretation breaks
- Difficulty isolating which variable truly matters
- Larger standard errors blur statistical significance

Diagnostic tools:

| Tool | Method |
|------|------|
| Correlation matrix heatmap | Visually scan variable pair correlations |
| VIF (Variance Inflation Factor) | Computed from R² when regressing one variable on others. VIF > 5–10 is caution |
| Dimensionality reduction (PCA) | Compress correlated variables into orthogonal components |

```python
import seaborn as sns
import matplotlib.pyplot as plt
from statsmodels.stats.outliers_influence import variance_inflation_factor

# Correlation heatmap: first-pass multicollinearity scan
corr = df.corr(numeric_only=True)
sns.heatmap(corr, annot=True, cmap="coolwarm", center=0)
plt.show()

# Quantitative VIF diagnosis
X = df[["ad_spend", "impressions", "clicks"]]
vif = pd.DataFrame({
    "feature": X.columns,
    "VIF": [variance_inflation_factor(X.values, i) for i in range(X.shape[1])],
})
print(vif)  # VIF > 10 indicates strong multicollinearity
```

> 💡 **Key Theory**: Tree-based models (Random Forest, XGBoost) are relatively **insensitive to multicollinearity**. When splitting, one of several correlated variables is selected; prediction performance doesn't degrade severely. However, correlated variables share importance, so individual importance may be underestimated. Linear/logistic regression's coefficient estimation itself becomes unstable—sensitivity to multicollinearity is algorithm-dependent, an exam touchpoint.

## Categorical Variable Relationships

Correlation coefficients are for numeric variables. Categorical relationships use different tools.

- **Chi-square test**: Test independence of two categorical variables (contingency table based).
- **Cramér's V**: Chi-square normalized to 0–1 association strength.
- **Numeric vs. categorical**: Group mean comparison (ANOVA), boxplots.

```python
import pandas as pd
from scipy.stats import chi2_contingency

# Test independence of two categorical variables
table = pd.crosstab(df["region"], df["churned"])
chi2, p, dof, expected = chi2_contingency(table)
print(f"chi2={chi2:.2f}, p-value={p:.4f}")  # p < 0.05 indicates association
```

## Summary

Today's essentials: (1) Use **Pearson for linear, Spearman for monotonic and robust** relationships; always interpret with scatter plots; (2) **Correlation is not causation**—always suspect reverse causation, confounders, and spuriousness; (3) **Multicollinearity** among explanatory variables breaks linear model coefficients—diagnose with VIF and heatmaps, though trees are less affected; (4) Categorical relationships measured by **chi-square and Cramér's V**.

Next, we tackle EDA and validation's deadliest enemy: **data leakage**.

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
