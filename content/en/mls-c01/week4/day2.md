# Day 2 - Feature Selection: Filter, Wrapper, Embedded, Importance, Multicollinearity

If Day 1's dimensionality reduction was "creating new synthetic axes," **feature selection** is "keeping only useful existing features." Both reduce dimensions, but selection preserves the **interpretability of original features**.

Today we cover three major approaches to selection—**filter, wrapper, and embedded**—feature importance methods, and **multicollinearity**, which complicates selection decisions.

## Why Feature Selection?

- Reduces overfitting: Irrelevant features train the model on noise
- Speeds up training and inference
- Increases interpretability: fewer features make model explanation easier
- Mitigates curse of dimensionality

> 💡 **Key Theory**: Feature selection and PCA both reduce dimensions but differ philosophically. PCA linearly combines all original features to create new axes, losing physical meaning of results. Selection retains a subset of original features, making it preferred in regulated industries (finance, healthcare) where you must explain "which variables were used in the prediction."

## Three Approaches

| Approach | How It Works | Strengths | Weaknesses | Examples |
|------|-----------|------|------|------|
| **Filter** | Score features by statistical metrics independent of model | Fast, model-agnostic | Ignores feature interactions | Correlation, chi-square, variance threshold, mutual information |
| **Wrapper** | Repeatedly train/evaluate model on feature subsets | Captures interactions, accurate | Very slow, overfitting risk | Forward selection, backward elimination, RFE |
| **Embedded** | Selection built into model training | Efficient and accurate balance | Model-dependent | Lasso (L1), tree feature importance |

### Filter Methods

Evaluate each feature independently by its relationship to the target. No model training, so it's fastest.

```python
from sklearn.feature_selection import SelectKBest, f_classif, mutual_info_classif

# Select top k features using ANOVA F-test
selector = SelectKBest(score_func=f_classif, k=20)
X_filtered = selector.fit_transform(X_train, y_train)

# For nonlinear relationships, use mutual information
mi_selector = SelectKBest(score_func=mutual_info_classif, k=20)
```

### Wrapper Methods: RFE

RFE (Recursive Feature Elimination) trains the model, removes the weakest feature, and repeats.

```python
from sklearn.feature_selection import RFE
from sklearn.ensemble import RandomForestClassifier

rfe = RFE(estimator=RandomForestClassifier(), n_features_to_select=15)
rfe.fit(X_train, y_train)
selected = X_train.columns[rfe.support_]
```

### Embedded Methods: L1 Regularization

```python
from sklearn.linear_model import Lasso

lasso = Lasso(alpha=0.01)
lasso.fit(X_scaled, y_train)
# Features with coefficient = 0 are automatically removed
selected = X_train.columns[lasso.coef_ != 0]
```

> 💡 **Key Theory**: Lasso achieves feature selection through L1 penalty geometry. The L1 constraint region is diamond-shaped; loss contours are likely to meet at vertices (axes, i.e., coefficient = 0). L2 (Ridge) is circular, shrinking coefficients toward zero but rarely to exactly zero. Hence "sparse solutions need L1."

## Feature Importance

Tree-based models provide feature importance after training.

| Method | Description | Caution |
|------|------|--------|
| Impurity-based (Gini/MDI) | Sum of impurity decrease from splits | Biased toward high-cardinality features |
| Permutation Importance | Shuffle feature, measure performance drop | Model-agnostic, but double-counts correlated features |
| SHAP Values | Game theory-based contribution | High computational cost, most consistent |

```python
import shap
explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_test)
shap.summary_plot(shap_values, X_test)   # Visualize feature contributions
```

> 💡 **Key Theory**: Impurity-based importance exhibits bias toward high-cardinality features (continuous, multi-category) with many split candidates. Permutation importance randomly shuffles features in a trained model and measures performance drop, avoiding this bias. SHAP additively decomposes feature contributions for each prediction, providing both global and local explanations, but is computationally expensive. For exams, remember: "impurity-based biased toward high-cardinality; permutation and SHAP are more trustworthy."

## Multicollinearity

When two or more features are strongly correlated, **multicollinearity** arises. Linear models suffer unstable coefficients and distorted interpretation.

Diagnostic metrics:

| Metric | Threshold |
|------|------|
| Correlation matrix | \|r\| > 0.8–0.9 suspicious |
| VIF (Variance Inflation Factor) | VIF > 5 (caution), > 10 (severe) |

```python
from statsmodels.stats.outliers_influence import variance_inflation_factor
import pandas as pd

vif = pd.DataFrame()
vif["feature"] = X.columns
vif["VIF"] = [variance_inflation_factor(X.values, i) for i in range(X.shape[1])]
```

Remedies: remove one correlated feature, combine via PCA, or soften via L2 regularization (Ridge).

> 💡 **Key Theory**: VIF is calculated as VIF = 1/(1−R²), where R² comes from regressing one feature against all others. As R² approaches 1 (feature nearly perfectly predicted by others), VIF explodes. **Note: Tree-based models are insensitive to multicollinearity**—splits use one feature at a time. Multicollinearity is fatal for linear models where coefficient interpretation matters.

## Summary

- **Filter** (fast, model-agnostic) / **Wrapper** (accurate, slow) / **Embedded** (balanced, Lasso, trees)
- **Feature importance**: Impurity-based (biased), Permutation/SHAP (more reliable)
- **Multicollinearity**: Diagnose via correlation/VIF, deadly for linear models, ignorable for trees

## 📝 Practice Questions

**Question 1.** In data with thousands of features, you want to quickly do a first-pass filter of irrelevant features before training a model. Which approach is MOST appropriate?

A) Iteratively search subsets with a wrapper method (RFE)  
B) Score with a filter method (mutual information, F-test)  
C) Exhaustively search every combination of features  
D) Reduce to 2 dimensions with t-SNE  

**Answer: B**  
Explanation: Filter methods score features with statistical measures without training a model, so they are the fastest for a first-pass selection among a large number of features. RFE (A) and exhaustive search (C) are very slow because of repeated training, and t-SNE (D) is a visualization technique, not feature selection.

---

**Question 2.** In a linear regression model, you want to obtain an automatic feature selection effect by driving the coefficients of some features to exactly 0. Which regularization is appropriate?

A) L2 (Ridge) regularization  
B) No regularization  
C) Dropout  
D) L1 (Lasso) regularization  

**Answer: D**  
Explanation: Because of the diamond-shaped constraint geometry, L1 (Lasso) regularization drives some coefficients to exactly 0, inducing a sparse solution. L2 (A) shrinks coefficients but does not make them 0, no regularization (B) has no selection effect, and dropout (C) is a neural network regularization technique.

---

**Question 3.** The correlation coefficient of two features is 0.95 and the linear regression coefficients are unstable. What is the most appropriate diagnosis and treatment?

A) Check multicollinearity with VIF and remove one of the correlated features  
B) Square both features and add polynomial features  
C) Log-transform the target variable  
D) Lower the learning rate  

**Answer: A**  
Explanation: Strong correlation and unstable coefficients are typical symptoms of multicollinearity, so the standard approach is to check with VIF and remove the redundant feature (or mitigate with PCA or Ridge). Adding polynomial features (B) worsens the correlation, and log-transforming the target (C) and the learning rate (D) are unrelated to multicollinearity.

---

**Question 4.** Which statement about impurity-based feature importance in tree-based models is correct?

A) It is always the most reliable importance measure  
B) It is a model-agnostic measure computed independently of the model  
C) It is biased toward overestimating high-cardinality features (those with many split candidates)  
D) It can be used only with linear models  

**Answer: C**  
Explanation: Impurity-based (MDI) importance is known to be biased toward overestimating high-cardinality features with many split candidates, so permutation importance or SHAP is more trustworthy. Therefore "always reliable" (A) is wrong, it depends on model training so it is not model-agnostic (B), and since it is a tree model measure, "linear only" (D) is also wrong.

---

**Question 5.** In a regulated industry, you must explain "which variables were used in the prediction." Which is the most appropriate reason for preferring feature selection over PCA?

A) Feature selection always guarantees higher accuracy  
B) PCA does not preserve variance  
C) Feature selection does not require standardization  
D) Feature selection retains the original features and so preserves interpretability  

**Answer: D**  
Explanation: PCA linearly combines the original features and loses their meaning, whereas feature selection keeps a subset of the original features intact, so you can explain "which variables were used." A guarantee of accuracy (A) is not true, PCA does preserve variance (B is wrong), and whether standardization is needed (C) is not a reason for the preference.

---
