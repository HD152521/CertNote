# Day 2 - Feature Selection: Filter, Wrapper and Embedded Methods, Importance, and Multicollinearity

## 📌 Key Takeaways

- **Feature selection keeps a subset of the original features**, so interpretability is preserved. PCA creates new axes and loses meaning.
- Three approaches: **filter** (fast, model-agnostic) / **wrapper** (accurate, very slow) / **embedded** (balanced; Lasso and tree importance).
- **L1 (Lasso) drives coefficients to exactly 0**, giving automatic selection. L2 (Ridge) only shrinks them.
- For importance, **impurity-based (MDI) importance is biased toward high-cardinality features**. Permutation importance and SHAP are more trustworthy.
- **Multicollinearity** is diagnosed with the correlation matrix (|r| > 0.8–0.9) and **VIF (> 5 caution, > 10 severe)**. It is fatal to linear models; trees are insensitive.

## Why Feature Selection?

If Day 1's dimensionality reduction was "creating new synthetic axes," **feature selection** is "keeping only the useful existing features." Both reduce dimensions, but selection preserves the **interpretability of the original features**.

- **Less overfitting**: irrelevant features let the model learn noise
- **Faster training and inference**
- **Higher interpretability**: the fewer the features, the easier the model is to explain
- **Mitigates the curse of dimensionality**

Feature selection and PCA both reduce dimensions, but their philosophies differ. PCA linearly combines all the original features to create new axes, so the physical meaning of the result is lost. Selection keeps a subset of the original features as they are, so it is preferred in regulated industries (finance, healthcare) where you must explain "which variables were used for prediction."

## Three Approaches

| Approach | How it works | Strength | Weakness | Examples |
|------|-----------|------|------|------|
| **Filter** | Scores features with statistical measures, independent of any model | Fast, model-independent | Ignores interactions between features | Correlation coefficient, chi-square, variance threshold, mutual information |
| **Wrapper** | Repeatedly trains and evaluates a model on feature subsets | Captures interactions, accurate | Very slow, overfitting risk | Forward selection, backward elimination, RFE |
| **Embedded** | Selection is built into the model's training process | Balance of efficiency and accuracy | Tied to the model | Lasso (L1), tree feature importance |

### Which Approach Should You Pick?

| Situation | Approach to pick | Reason |
|---|---|---|
| Thousands of features, goal is a first-pass screen | Filter | Scoring without model training → fastest |
| Dozens of features, goal is the best performance | Wrapper (RFE) | A scale at which the cost of repeated training is affordable |
| You want to cut features automatically in a linear model | Embedded (Lasso) | Training and selection in one step |
| You are already using trees or boosting | Embedded (tree importance) | Importance comes as a by-product of training |
| The relationship is nonlinear so the correlation is near 0 | Filter (mutual information) | Measures dependence not limited to linear |

### Filter Methods

Each feature is evaluated independently by its relationship to the target. There is no model training, so this is the fastest approach.

```python
from sklearn.feature_selection import SelectKBest, f_classif, mutual_info_classif

# Select the top k features with the ANOVA F-test
selector = SelectKBest(score_func=f_classif, k=20)
X_filtered = selector.fit_transform(X_train, y_train)

# Use mutual information for nonlinear relationships
mi_selector = SelectKBest(score_func=mutual_info_classif, k=20)
```

Which statistic to use in a filter is determined by the **combination of feature type and target type**.

| Feature type | Target type | Metric used | Notes |
|---|---|---|---|
| Numeric | Classification | ANOVA F-test (`f_classif`) | Looks at mean differences between groups |
| Categorical | Classification | Chi-square (`chi2`) | Input must be non-negative |
| Numeric | Regression | Pearson correlation / F-regression (`f_regression`) | Assumes a linear relationship |
| Any | Any | Mutual information (`mutual_info_*`) | Also captures nonlinear dependence |
| Any | None (unsupervised) | Variance threshold (`VarianceThreshold`) | For removing constant and quasi-constant columns |

### Wrapper Method: RFE

RFE (Recursive Feature Elimination) repeats the process of training a model and removing the weakest feature.

```python
from sklearn.feature_selection import RFE
from sklearn.ensemble import RandomForestClassifier

rfe = RFE(estimator=RandomForestClassifier(), n_features_to_select=15)
rfe.fit(X_train, y_train)
selected = X_train.columns[rfe.support_]
```

### Embedded Method: L1 Regularization

```python
from sklearn.linear_model import Lasso

lasso = Lasso(alpha=0.01)
lasso.fit(X_scaled, y_train)
# Features with a coefficient of 0 are removed automatically
selected = X_train.columns[lasso.coef_ != 0]
```

```
      L1 (Lasso) constraint     L2 (Ridge) constraint
          ╱╲                        ╭───╮
        ╱    ╲                     │     │
        ╲    ╱                     │     │
          ╲╱                        ╰───╯
   Loss contours easily meet     The contact point rarely lands on an axis
   at a vertex → coefficient = 0 → it only gets close to 0, never exactly 0
        (sparse solution)            (shrinkage only)
```

Lasso performs feature selection because of the geometry of the L1 penalty. The L1 constraint region is diamond-shaped, so the loss contours are likely to meet at a vertex (on an axis, i.e., coefficient = 0). L2 (Ridge) is circular, so although it shrinks coefficients toward 0, it rarely sets them exactly to 0. That is why "if you need a sparse solution, use L1."

> ⚠️ **Pitfall**: Lasso penalizes coefficient magnitude, so **scaling must come first**. Without standardization, the coefficient of a large-unit variable looks small and gets pushed to 0 first.

> ⚠️ **Pitfall**: Feature selection is also a **data-dependent transformation**. If you compute correlations or importance on all the data, select features, and then cross-validate, validation-set information leaks into the selection. Selection must be put in the pipeline and performed only on the training portion of each fold.

## Feature Importance

Tree-based models provide feature importance after training.

| Method | Description | Caution |
|------|------|--------|
| Impurity-based (Gini/MDI) | Sum of the impurity decrease from splits | Biased toward high-cardinality features |
| Permutation importance | Shuffles a feature and measures the performance drop | Model-agnostic, but double-counts correlated features |
| SHAP values | Contribution decomposition based on game theory | Expensive to compute, but the most consistent |

```python
import shap
explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_test)
shap.summary_plot(shap_values, X_test)   # Visualize feature contributions
```

| Purpose | Method to pick | Reason |
|---|---|---|
| A quick rough picture right after training | Impurity-based (MDI) | Immediate, no extra computation |
| Compare global importance without bias | Permutation importance | Measured as the actual performance drop on the trained model |
| Explain an individual prediction (why is this case fraud?) | SHAP | Provides a local explanation for each prediction |
| Model types differ and you must compare | Permutation importance / SHAP | Can be computed model-agnostically |

Impurity-based importance is biased toward overestimating features with many split candidates (continuous, many-category). Permutation importance randomly shuffles a feature in a trained model and measures the performance drop, so it avoids this bias. SHAP additively decomposes feature contributions for each prediction, providing both global and local explanations, but is expensive to compute. For the exam, remember: "impurity-based is biased toward high cardinality; permutation and SHAP are more trustworthy."

## Multicollinearity

When two or more features are strongly correlated, **multicollinearity** arises. In linear models, coefficients become unstable and interpretation is distorted.

Diagnostic metrics:

| Metric | Threshold |
|------|------|
| Correlation matrix | Suspect when \|r\| > 0.8–0.9 |
| VIF (Variance Inflation Factor) | VIF > 5 (caution), > 10 (severe) |

```python
from statsmodels.stats.outliers_influence import variance_inflation_factor
import pandas as pd

vif = pd.DataFrame()
vif["feature"] = X.columns
vif["VIF"] = [variance_inflation_factor(X.values, i) for i in range(X.shape[1])]
```

Remedies: remove one of the correlated features, merge them with PCA, or mitigate with L2 regularization (Ridge).

### Multicollinearity Diagnosis → Remedy

| Symptom | Diagnosis | Remedy |
|---|---|---|
| Two features have \|r\| of 0.95 | Correlation matrix | Remove one of the two (the one less important by domain) |
| Many features have VIF above 10 | VIF | Merge them into orthogonal axes with PCA |
| Coefficient signs flip against common sense | Unstable coefficients | Mitigate with Ridge (L2), which suppresses coefficient variance |
| Coefficients swing widely when the sample changes slightly | Resampling stability | Reduce features and retrain |
| Predictive performance is good but it cannot be interpreted | — | If prediction is the only goal, switching to a tree family is also an option |

### Multicollinearity Sensitivity by Model

| Model | Sensitivity | Resulting effect |
|---|---|---|
| Linear/logistic regression | **Very high** | Coefficient variance explodes, signs flip, uninterpretable |
| Ridge / Lasso | Medium | L2 stabilizes coefficients; L1 arbitrarily keeps only one of a correlated group |
| SVM (linear kernel) | Medium | Coefficient interpretation wobbles; predictions hold up relatively well |
| Decision Tree / RF / XGBoost | **Low** | Splits look at one feature at a time, so prediction is not much affected |
| KNN / K-means | Medium | Correlated features effectively count the same axis twice, distorting distance weighting |

VIF is computed as VIF = 1/(1−R²), where R² is the coefficient of determination from regressing one feature on all the other features. As R² approaches 1 (that is, as the feature becomes almost perfectly predictable from the others), VIF explodes. **Note: tree-based models are insensitive to multicollinearity** — because each split uses only one feature at a time. Multicollinearity is fatal in linear models, where coefficient interpretation matters.

When two correlated features exist in a tree model, the importance is split between them and each shows up low. If you judge "the importance is low, so it can be discarded," you may in fact throw away an important signal wholesale.

## Practical Selection Order

Feature selection is not a one-shot job but a funnel that filters in order from the cheapest step.

```
[Hundreds to thousands of raw features]
        │
  ① Remove constant · quasi-constant columns   (variance threshold. Axes with no information)
        │
  ② Remove ID · suspected-leakage columns      (columns that make the model memorize rows)
        │
  ③ Filter: score by correlation · F-test · mutual information → top k
        │
  ④ Clean up multicollinearity                 (|r| > 0.8–0.9, VIF > 5–10)
        │
  ⑤ Embedded: further reduction with Lasso or tree importance
        │
  ⑥ (If you can afford it) Wrapper: final fine-tuning with RFE
        │
  ⑦ Confirm performance with cross-validation — do ③–⑥ only on the training portion of each fold
```

| Step | Cost | Remaining feature count (example) |
|---|---|---|
| ① Constant removal | Nearly 0 | Thousands → thousands |
| ③ Filter | Low | Thousands → tens to hundreds |
| ⑤ Embedded | Medium (one model training) | Hundreds → tens |
| ⑥ Wrapper (RFE) | High (repeated model training) | Tens → final |

## AWS Service Mapping

| Situation | Service / feature | Reason |
|---|---|---|
| You want to view distributions and correlations before training and trim features | SageMaker Data Wrangler | Provides visual data preparation and distribution/correlation reports |
| You must explain feature contributions to model predictions | SageMaker Clarify | Produces SHAP-based feature attribution |
| Experiment directly with filters, wrappers and Lasso in a notebook | SageMaker notebook + scikit-learn | Free combination of `SelectKBest`, `RFE`, `Lasso`, etc. |
| Features are correlated and you want to merge them into orthogonal axes | SageMaker built-in PCA | Gives up interpretation in exchange for resolving multicollinearity |

## Question Clue → Answer Mapping

| Clue in the question | Answer to choose | Reason |
|---|---|---|
| "Thousands of features, the fastest first-pass screen" | Filter (mutual information / F-test) | No model training needed |
| "Drive coefficients to exactly 0 for automatic selection" | L1 (Lasso) | Diamond constraint → sparse solution |
| "Shrink coefficients but never make them 0" | L2 (Ridge) | Circular constraint → shrinkage only |
| "Two features correlated at 0.95, coefficients unstable" | Check VIF, then remove one | A classic symptom of multicollinearity |
| "The importance of a high-cardinality feature is oddly high" | Impurity-based bias → recheck with permutation importance | A known bias of MDI |
| "You must explain which variables were used for prediction" | Feature selection (not PCA) | Keeps the original features |
| "The correlation coefficient is 0 but a relationship seems to exist" | Mutual information / Spearman | Pearson captures only linear relationships |
| "It is a tree model; is multicollinearity handling needed?" | Generally not needed | Splits use only one feature at a time |

The next post covers **data visualization**, for checking distributions and correlations by eye, and AWS's BI service, QuickSight.

## 📖 Glossary

- **Feature selection**: Dimensionality reduction that picks and keeps only the useful features among the original ones. Column names are preserved.
- **Filter method**: A way of scoring and picking features using only statistics such as correlation coefficients or chi-square, without training a model.
- **Wrapper method**: A way of finding the best combination by training and evaluating an actual model while changing feature combinations. Accurate but slow.
- **Embedded method**: A way in which selection happens together with the model's training (Lasso, tree importance).
- **RFE (Recursive Feature Elimination)**: A wrapper technique that repeats training a model, dropping the weakest feature, and training again.
- **Mutual information**: A measure of how much information two variables share. Also captures nonlinear relationships.
- **Sparse solution**: A solution in which many coefficients are exactly 0. Produced by L1 regularization.
- **Impurity-based importance (MDI)**: Importance obtained by summing the impurity reduction when a tree splits. Overestimates features with many split candidates.
- **Permutation importance**: Importance measured by how much performance drops after the feature's values are randomly shuffled.
- **Multicollinearity / VIF**: A state in which features are strongly correlated with each other / a metric measuring that degree. Above 5 is caution, above 10 is severe.

---

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
