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

## 📝 연습 문제

**문제 1.** 두 변수 사이에 강한 U자형(비선형) 관계가 있는데 Pearson 상관계수가 거의 0으로 나왔다. 관계의 강도를 더 잘 포착할 방법은?

A) 표본 크기를 줄인다  
B) Spearman 등 순위 기반 상관과 산점도로 비선형 관계를 확인한다  
C) Pearson 값이 0이므로 관계가 없다고 결론짓는다  
D) 두 변수를 표준화한 뒤 Pearson을 다시 계산한다  

**정답: B**  
해설: Pearson은 선형 관계만 측정하므로 U자형처럼 강한 비선형 관계를 0에 가깝게 보고할 수 있다. 산점도로 모양을 확인하고 단조 관계를 잡는 Spearman 등을 함께 보는 것이 옳다. Pearson만 보고 관계 없음으로 단정하면 안 되며(C), 표준화는 선형 변환이라 Pearson 값을 바꾸지 않는다(D).

---

**문제 2.** "아이스크림 판매량과 익사 사고 수가 강하게 양의 상관을 보인다"는 데이터에서 올바른 해석은?

A) 아이스크림 판매를 줄이면 익사 사고가 줄어든다  
B) 익사 사고가 아이스크림 판매를 증가시킨다  
C) 기온이라는 교란변수가 두 변수를 동시에 끌어올린 결과일 수 있다  
D) 상관이 강하므로 인과관계가 입증된 것이다  

**정답: C**  
해설: 더운 날씨(기온)가 아이스크림 소비와 물놀이를 동시에 늘려 두 변수가 함께 오르는 전형적인 교란변수 사례다. 상관은 인과를 입증하지 못하므로(D), 한쪽을 조절하면 다른 쪽이 변한다는 주장(A·B)은 근거가 없다. 인과 주장에는 실험 설계나 교란변수 통제가 필요하다.

---

**문제 3.** 선형 회귀 모델에서 설명 변수들끼리 강하게 상관(VIF가 매우 높음)할 때 발생하는 문제로 옳은 것은?

A) 예측이 항상 불가능해진다  
B) 회귀 계수 추정이 불안정해지고 개별 변수 해석이 어려워진다  
C) 타깃 변수의 분포가 정규분포로 바뀐다  
D) 결측치가 자동으로 채워진다  

**정답: B**  
해설: 다중공선성은 설명 변수들이 서로 정보를 공유해 계수 추정이 불안정해지고 표준오차가 커져, 어떤 변수가 진짜 영향을 주는지 분리하기 어렵게 만든다. 예측 자체가 불가능해지는 것은 아니며(A), 타깃 분포(C)나 결측 처리(D)와는 무관하다. VIF > 5~10이 경고 신호다.

---

**문제 4.** 두 범주형 변수(지역, 이탈 여부)가 서로 독립인지 검정하려 한다. 가장 적절한 방법은?

A) Pearson 상관계수  
B) 표준편차 비교  
C) 카이제곱 독립성 검정  
D) 로그 변환  

**정답: C**  
해설: 두 범주형 변수의 연관성·독립성은 교차표를 기반으로 한 카이제곱 검정으로 판단하며, 연관 강도는 크래머의 V로 본다. Pearson 상관(A)은 수치형 변수용이고, 표준편차 비교(B)나 로그 변환(D)은 범주형 독립성 검정과 무관하다.

---

**문제 5.** 상관된 특성이 많은 데이터로 모델을 만들 때, 다중공선성에 상대적으로 둔감한 알고리즘은?

A) 선형 회귀  
B) 로지스틱 회귀  
C) 릿지 회귀 없이 사용하는 다중 선형 회귀  
D) 랜덤 포레스트 등 트리 기반 모델  

**정답: D**  
해설: 트리 기반 모델은 분할 시 상관된 변수 중 하나를 선택하면 되므로 예측 성능이 크게 저하되지 않아 다중공선성에 비교적 둔감하다(다만 변수 중요도는 나뉘어 과소평가될 수 있다). 선형·로지스틱 회귀(A·B·C)는 계수 추정 자체가 불안정해져 다중공선성에 민감하다.

---
