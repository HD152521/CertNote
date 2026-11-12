# Day 5 - Week 4 Comprehensive Review: Dimensionality, Feature Selection, Visualization, Imbalance

## 📌 Key Takeaways

- One sentence that runs through all of Week 4: **"Split first, and fit everything only on the training set."** Standardization, PCA, feature selection, and SMOTE all fall under it.
- **PCA vs feature selection** splits on "do you need interpretability?" If you have an obligation to explain, select; if not, reduce.
- **PCA vs t-SNE** splits on "do you need to transform new data?" t-SNE is for visualization only.
- **The 3 big imbalance traps**: using a t-SNE embedding as model input, trusting accuracy under imbalance, and applying SMOTE before the split.
- Multicollinearity is **fatal to linear models and harmless to trees**. Diagnose it with the correlation matrix and VIF (> 5 caution, > 10 severe).

## Week 4 on One Page

Week 4 was the second cluster of EDA — **techniques for handling high dimensions and class imbalance**. Today we knit the four days into one workflow, compare the commonly confused pairs, and sum up the exam traps.

| Day | Topic | Key point | One-line discriminator |
|-----|------|------|---|
| 1 | Dimensionality reduction | Curse of dimensionality, PCA (preserves variance, standardization required), t-SNE (visualization only) | If you must transform new data, PCA |
| 2 | Feature selection | Filter, wrapper, embedded; feature importance; multicollinearity (VIF) | If you must explain the variables, select |
| 3 | Data visualization | Distribution and correlation charts, QuickSight, the lesson of Anscombe | A dashboard without code means QuickSight |
| 4 | Class imbalance | Accuracy paradox, SMOTE and undersampling, class weights, PR-AUC | If positives are rare, PR-AUC |

## The Integrated Workflow

This is the typical EDA and preprocessing order for high-dimensional, imbalanced data.

```python
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline

# 1) Split first — fit everything only on the training set (prevents leakage)
X_tr, X_te, y_tr, y_te = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42)

# 2) Visualize distributions, correlations, and imbalance (on the training set)
#    histograms/box plots, correlation heatmap, class distribution bars

# 3) Standardize → reduce dimensions (or select features)
# 4) Resample on the training set only, inside a Pipeline
pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("pca", PCA(n_components=0.95)),
    ("smote", SMOTE(random_state=42)),
])
X_tr_proc, y_tr_proc = pipe.fit_resample(X_tr, y_tr)
```

```
[Raw data]
     │
 ① Split (stratify=y)  ────────────────→ [Test set] sealed
     │                                        │
 ② Visualize (Day 3)                          │
     ├ distributions → skew and outliers      │
     ├ correlation heatmap → multicollinearity candidates │
     └ class bars → confirm imbalance         │
     │                                        │
 ③ Standardize (fit: training set)            │
     │                                        │
 ④ Dimension handling                         │
     ├ interpretability needed → feature selection (Day 2) │
     └ not needed → PCA (Day 1)               │
     │                                        │
 ⑤ Imbalance handling (Day 4)                 │
     ├ resampling → only in each fold's training portion │
     └ or class weights (data unchanged)      │
     │                                        │
 ⑥ Train → set the threshold on the validation set │
     │                                        │
 ⑦ Final evaluation ←──── apply only transform of what was learned in ③ and ④
        (PR-AUC / F1 — not accuracy)
```

The principle that ties this workflow together is "**split first, fit only on the training set**." Standardization, PCA, SMOTE, feature selection, missing-value imputation — every transform that depends on the data must learn its statistics or rules on the training set and only be applied to the test set. This single principle runs from Week 3 (cleaning and encoding) through Week 4 (dimensionality and imbalance).

### Why This Order

| Order | Why it comes first | If reversed |
|---|---|---|
| Split → preprocessing | Test information must not leak into the transform | All performance estimates are inflated optimistically |
| Standardize → PCA | PCA is variance-based, so it is dominated by scale | Variables with large units monopolize the principal components |
| Visualize → preprocessing decisions | You must know what to fix before fixing it | Transforms are applied indiscriminately without a basis |
| Dimension handling → resampling | Synthesizing in the reduced space is consistent | Synthetic samples are generated including the axes you would discard |
| Resampling → training (within the same fold) | The validation portion must keep the original distribution | Synthetic positives flow into the validation set |
| Training → threshold decision (validation set) | The threshold is also a learned value | Setting it by looking at the test set leaks |

> ⚠️ **Pitfall**: The misconception that "I did dimensionality reduction, so feature selection is unnecessary." The two have different purposes. PCA merges correlated axes to tidy up computation and multicollinearity, but **it also mixes the noise from irrelevant features into the principal components**. Columns that are useless to begin with are better filtered out before PCA.

> ⚠️ **Pitfall**: If the stem contains words like "must be explainable," "regulatory compliance," or "audit," **the PCA, t-SNE, and autoencoder families are all dropped from the candidates**. What remains is feature selection, which keeps the original features, and SHAP/Clarify, which explain contributions.

## Comparing Commonly Confused Pairs

### PCA vs Feature Selection

| Aspect | PCA | Feature selection |
|------|-----|-----------|
| Resulting features | Synthetic axes (meaning lost) | A subset of the originals (interpretability preserved) |
| Type | Unsupervised | Both supervised and unsupervised exist |
| Multicollinearity | Resolved with orthogonal axes | Resolved by removing correlated features |
| Regulated industries | Hard to explain | Explainable, preferred |
| New data | Same transform via `transform` | Just pick and use the same columns |
| Information loss | As much as the discarded principal components | As much as the discarded features |

### PCA vs t-SNE

- **PCA**: Linear, preserves global variance, can `transform` new data, suitable for model preprocessing
- **t-SNE**: Nonlinear, preserves local structure, must be refit every time, **visualization only**

| Question to ask | PCA | t-SNE |
|---|---|---|
| Is the result used as model input? | Yes | No |
| Can new samples be placed into the same space in production? | Possible | Not possible |
| Does it give the same result on every run? | Yes | No (depends on the seed) |
| Can you interpret distances between clusters? | Relatively reliable | Meaningless |

### Oversampling vs Class Weights

| Aspect | Oversampling (SMOTE) | Class weights |
|---|---|---|
| Data | Grows (synthetic samples are generated) | Unchanged |
| Where applied | Preprocessing stage, training set only | Model hyperparameter |
| Leakage risk | Yes (split and fold management needed) | None |
| Model constraints | None (any model) | The model must support weights |
| Categorical features | Basic SMOTE cannot be applied directly | No effect |
| High dimensions | Interpolation loses meaning | No effect |
| Reproducibility and audit | Burden of managing synthetic data | Advantageous since the original stays as is |

### ROC-AUC vs PR-AUC

| Aspect | ROC-AUC | PR-AUC |
|---|---|---|
| Axes | TPR vs FPR | Precision vs recall |
| Effect of negatives | All negatives in the FPR denominator → diluted | Not directly driven by the number of negatives |
| When | Classes are relatively balanced | **When positives are rare** |
| Pitfall | Looks optimistic under imbalance | Cannot be compared across datasets with different class ratios |

### Filter vs Wrapper vs Embedded

| Aspect | Filter | Wrapper | Embedded |
|---|---|---|---|
| Model training | None | Repeatedly | Once (built into training) |
| Speed | Fastest | Slowest | Medium |
| Captures interactions | No | Yes | Partially |
| Representative techniques | Correlation, chi-square, mutual information | Forward selection, backward elimination, RFE | Lasso, tree importance |

## The Decision Flow on One Page

```
Too many dimensions / performance is poor
   │
   ├─ Do you need variable-level explanations?
   │     Yes → feature selection (narrow down in the order filter → embedded → RFE)
   │     No ↓
   ├─ Is the goal "to see by eye whether clusters exist"?
   │     Yes → t-SNE (visualization only. Never as model input)
   │     No ↓
   ├─ Is the scale beyond memory?
   │     Yes → SageMaker built-in PCA (randomized if there are many features)
   │     No → scikit-learn PCA (after standardizing, n_components=0.95)
   │
The target is heavily skewed
   │
   ├─ Is it acceptable to change the data?
   │     No → class weights / threshold moving
   │     Yes ↓
   ├─ Is the data very large?
   │     Yes → random undersampling (to gain speed)
   │     No → SMOTE (only inside the fold)
   │
   └─ Always evaluate with PR-AUC · F1 · recall (never accuracy)
```

Three easy-to-confuse traps. (1) "Use the t-SNE embedding as classifier input" → wrong (visualization only). (2) "99% accuracy on imbalanced data is good" → accuracy paradox. (3) "Apply SMOTE or scaling before the split" → data leakage. Nailing just these three stabilizes your score in the EDA domain.

Even when a question looks like it asks about imbalance handling and metric choice separately, many stems require **answering them as a set**. An option that picks only "apply SMOTE" and then leaves evaluation to accuracy is wrong. Whether you use resampling, weights, or thresholds, evaluation goes by PR-AUC, F1, and recall.

## AWS Service Mapping Review

| Task | Service/tool |
|------|-------------|
| Large-scale PCA | SageMaker built-in PCA (`randomized` mode) |
| Visual data preparation and distribution reports | SageMaker Data Wrangler |
| Code-based EDA visualization | SageMaker notebooks (seaborn/matplotlib) |
| BI dashboards and ML Insights | Amazon QuickSight |
| Serverless SQL analysis on S3 | Amazon Athena (+ QuickSight) |
| Pre-training bias and distribution check | SageMaker Clarify |

| User in the stem | Tool to choose | Why |
|---|---|---|
| Data scientist, free-form exploration | SageMaker notebooks | Anything is possible with code |
| Analyst preprocessing without code | Data Wrangler | Visual preparation + reports |
| Business user without code | QuickSight (ML Insights, Q) | Dashboards and natural-language queries |
| Regulatory compliance owner | Clarify + feature selection | Bias checks and explainability |

## Stem Clue → Answer Mapping

| Stem clue | Answer to choose | What to recall together |
|---|---|---|
| "Must explain which variables were used for prediction" | Feature selection | PCA is wrong |
| "There are very many features and scalability matters" | SageMaker built-in PCA + `randomized` | Standardization first |
| "Confirm by eye whether clusters exist" | t-SNE | Forbidden as model input |
| "Positives are 0.2%" | PR-AUC and recall + class weights/SMOTE | Accuracy is a trap |
| "Accuracy is 99% but the minority class is not caught" | Accuracy paradox | Check the confusion matrix first |
| "Use SMOTE in cross-validation" | imblearn `Pipeline`, inside the fold | Applying before the split leaks |
| "VIF is 12" | Severe multicollinearity → remove, PCA, Ridge | Can be ignored for tree models |
| "Correlation is 0 but the scatter plot is a curve" | Pearson measures only linear | Spearman, mutual information |
| "Anomaly detection dashboard without code" | QuickSight ML Insights | Q is natural-language querying |
| "Check class distribution and bias before training" | SageMaker Clarify | Pre-training bias |

## Wrong-Answer Notebook

| Easy-to-confuse statement | Verdict | Why |
|---|---|---|
| "Feed the coordinates made by t-SNE directly into a classifier" | ✗ | Cannot transform new data, and distances have no physical meaning |
| "PCA gives the same result without standardization" | ✗ | It is variance-based, so large-scale variables monopolize the principal components |
| "PCA considers the target and picks useful axes" | ✗ | An unsupervised transform. High-variance axes ≠ axes useful for prediction |
| "99% accuracy on imbalanced data means a good model" | ✗ | Accuracy paradox. TN dominates the metric |
| "Apply SMOTE to the entire data before the split" | ✗ | Synthetic positives flow into the validation set, causing leakage |
| "SMOTE duplicates minority samples" | ✗ | Not duplication but interpolation between neighbors (duplication is random oversampling) |
| "Multicollinearity is fatal to every model" | ✗ | Fatal to linear models, tree families are insensitive |
| "Impurity-based importance is the most trustworthy" | ✗ | High-cardinality bias. Permutation importance and SHAP are more trustworthy |
| "If the correlation coefficient is 0, the two variables are independent" | ✗ | Pearson measures only linear relationships. A nonlinear relationship may exist |
| "Feature selection keeps the original features, so it is explainable" | ✓ | Why it is preferred over PCA in regulated industries |
| "Undersampling speeds up training when the data is very large" | ✓ | Shrinks the majority class, solving both volume and imbalance |
| "Threshold moving raises recall without retraining" | ✓ | Can be adjusted after training and even in production |

## 📖 Glossary

- **Data leakage**: An accident in which information that cannot be known at prediction time gets mixed into training, making performance look better than it really is.
- **`stratify`**: An option that keeps the class ratio the same in the training and test sets when splitting. It is especially important on imbalanced data.
- **Pipeline**: A mechanism that bundles preprocessing and the model into one unit and reproduces it in the same order for each fold. It is the standard tool for preventing leakage.
- **Synthetic axes vs original features**: The nameless axes that PCA produces / the original columns whose names and units remain intact.
- **Local structure preservation**: The property that points that were close remain close after reduction. It is the goal t-SNE aims for.
- **Accuracy paradox**: The illusion that a model looks good because accuracy comes out high even when it just predicts the majority class.
- **PR-AUC**: The area under the precision-recall curve. When positives are rare, it reveals differences better than ROC-AUC.
- **VIF (variance inflation factor)**: A value that measures multicollinearity by how well one feature can be predicted from the other features. 5 is caution, 10 is severe.
- **SageMaker Clarify**: A feature that checks data bias and class distribution before training and computes feature attributions for predictions.
- **SPICE**: QuickSight's in-memory calculation engine. It makes dashboard aggregation fast.

## 📝 Practice Questions

**Question 1.** Which leakage-prevention principle, common to standardization, PCA, SMOTE, and missing-value imputation and running through Weeks 3 and 4, applies?

A) Apply all transformations to the entire dataset at once  
B) Compute statistics on the test set and apply them to training  
C) The order of transformations does not matter  
D) Split the data first and perform every fit only on the training set  

**Answer: D**  
Explanation: Data-dependent transformations must only apply to the test set the statistics/rules learned from the training set to avoid leakage - "split first, fit only on the training set" is the consistent principle. Applying to the entire dataset (A) and using test statistics (B) cause leakage, and order not mattering (C) is also wrong.

---

**Question 2.** In a regulated industry, you must explain which variables were used for prediction and also handle multicollinearity. Which approach is more appropriate than PCA?

A) Use a t-SNE embedding as input  
B) Keep an interpretable subset through correlation- and VIF-based feature selection  
C) Randomly discard half of the features  
D) Use all features as they are  

**Answer: B**  
Explanation: Feature selection keeps the original features to preserve interpretability while also handling multicollinearity using correlation and VIF. t-SNE (A) is for visualization only and not interpretable, random removal (C) loses information, and using everything (D) leaves multicollinearity unaddressed.

---

**Question 3.** Which of the following statements is correct?

A) t-SNE can transform new data using a learned mapping  
B) Accuracy is always the best metric for imbalanced data  
C) Standardization is recommended before PCA, and PCA can transform new data  
D) SMOTE must be applied to the entire dataset before splitting  

**Answer: C**  
Explanation: PCA is variance-based, so standardization is recommended, and new data can be transformed using the learned principal components. t-SNE cannot transform new data (A), accuracy is misleading on imbalanced data (B), and SMOTE must be applied only to the training set after splitting (D).

---

**Question 4.** A business user who does not write code wants automatic anomaly detection and forecasting on a dashboard of S3 data. Which tool is MOST appropriate?

A) SageMaker built-in PCA  
B) Amazon QuickSight(ML Insights)  
C) imblearn Pipeline  
D) statsmodels VIF  

**Answer: B**  
Explanation: QuickSight ML Insights provides anomaly detection and forecasting on dashboards without code, which suits business users. PCA (A) is dimensionality reduction, imblearn (C) is for handling imbalance, and VIF (D) is a multicollinearity diagnostic tool.

---

**Question 5.** You have data with a very large majority class and a rare minority class, and you want to reduce the data volume itself for training speed while also mitigating the imbalance. Which method is MOST appropriate?

A) Reduce the majority class with random undersampling  
B) Duplicate the minority class dozens of times  
C) Expand all features polynomially  
D) Ignore the curse of dimensionality  

**Answer: A**  
Explanation: When the data is very large and speed matters, undersampling that reduces the majority class both mitigates the imbalance and speeds up training. Mass duplication (B) actually enlarges the data and carries a high risk of overfitting, polynomial expansion (C) increases dimensionality, and (D) is not a solution.

---
