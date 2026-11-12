# Day 5 - Week 4 Comprehensive Review: Dimensionality, Feature Selection, Visualization, Imbalance

Week 4 covered the second cluster of EDA—**techniques for handling high dimensions and class imbalance**. Today we knit four days into one workflow, review holistically, and highlight exam traps.

## Week 4 at a Glance

| Day | Topic | Essentials |
|-----|------|------|
| 1 | Dimensionality reduction | Curse of dimensionality, PCA (variance preservation, standardization mandatory), t-SNE (visualization only) |
| 2 | Feature selection | Filter, wrapper, embedded; feature importance; multicollinearity (VIF) |
| 3 | Data visualization | Distribution, correlation charts; QuickSight; Anscombe's lesson |
| 4 | Class imbalance | Accuracy paradox; SMOTE, undersampling; class weights; PR-AUC |

## Unified Workflow

Typical EDA and preprocessing order for high-dimensional, imbalanced data.

```python
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline

# 1) Split first—all fit on train only (prevent leakage)
X_tr, X_te, y_tr, y_te = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42)

# 2) Visualize distribution, correlation, imbalance (on train)
#    Histograms/boxplots, correlation heatmap, class distribution bar

# 3) Standardize → dimensionality reduce (or feature selection)
# 4) Resample in train only, within Pipeline
pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("pca", PCA(n_components=0.95)),
    ("smote", SMOTE(random_state=42)),
])
X_tr_proc, y_tr_proc = pipe.fit_resample(X_tr, y_tr)
```

> 💡 **Key Theory**: This workflow's binding principle: "**split first, fit training set only**." Standardization, PCA, SMOTE, feature selection, imputation—all data-dependent transformations must learn statistics/rules from the training set and apply only to test. This one principle threads from Week 3 (cleaning, encoding) through Week 4 (dimensionality, imbalance).

## Confusing Comparisons

### PCA vs Feature Selection

| Distinction | PCA | Feature Selection |
|------|-----|-----------|
| Result features | Synthetic axes (meaning lost) | Original subset (interpretability kept) |
| Type | Unsupervised | Both supervised and unsupervised |
| Multicollinearity | Resolved via orthogonal axes | Remove correlated features |
| Regulated industry | Hard to explain | Explainable, preferred |

### PCA vs t-SNE

- **PCA**: Linear, preserves global variance, `transform` new data possible, suitable for model preprocessing
- **t-SNE**: Nonlinear, preserves local structure, requires retraining, **visualization-only**

### Imbalance Response Choices

- Data modifiable + diversity needed → **SMOTE**
- Huge data + speed matters → **Undersampling**
- Keep data unchanged → **Class weights** / **Threshold tuning**

> 💡 **Key Theory**: Three frequent exam traps: (1) "Use t-SNE embeddings as classifier input" → wrong (visualization only). (2) "Accuracy 99% in imbalanced data is good" → accuracy paradox. (3) "Apply SMOTE/scaling before split" → data leakage. Mastering these three solidifies EDA section scores.

## AWS Service Mapping Review

| Task | Service/Tool |
|------|-------------|
| Large-scale PCA | SageMaker built-in PCA (`randomized` mode) |
| Visual data prep and distribution reports | SageMaker Data Wrangler |
| Code-based EDA visualization | SageMaker notebook (seaborn/matplotlib) |
| BI dashboards and ML Insights | Amazon QuickSight |
| Serverless SQL analysis on S3 | Amazon Athena (+ QuickSight) |
| Pre-training bias and distribution check | SageMaker Clarify |

## Exam Prep Summary

- **Curse of dimensionality**: High dimensions lose distance discriminability → distance-based (KNN, K-means) vulnerable
- **PCA**: Preserve variance, standardization mandatory, select k by explained variance ratio
- **t-SNE**: Visualization-only, inter-cluster distance meaningless
- **Feature selection 3 types**: Filter (fast, independent) / Wrapper (accurate, slow) / Embedded (Lasso, trees)
- **Multicollinearity**: VIF > 5–10 caution; deadly for linear, ignorable for trees
- **Visualization**: Don't trust summary stats alone—visualize (Anscombe); Pearson is linear-only
- **Imbalance**: Accuracy paradox; SMOTE on training set only; PR-AUC; class weights/threshold tuning

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
