# Day 1 - Dimensionality Reduction: PCA, t-SNE, and the Curse of Dimensionality

Week 4 focuses on the second axis of exploratory data analysis—**handling high-dimensional data**. As the number of features grows, models appear to have more information, but in practice, data becomes sparse in space and distance-based algorithms collapse due to the **curse of dimensionality**.

Today, we explore why this curse is a problem and two leading mitigation techniques: **PCA (Principal Component Analysis)** and **t-SNE**. MLS-C01 exams typically ask "when do you use PCA, and why is t-SNE visualization-only?"

## The Curse of Dimensionality

As dimensionality increases, the volume of space that must be filled by a fixed sample size grows exponentially. The result: data points become increasingly distant from each other, and **distance-based measurements lose discriminative power**.

| Symptom | Description |
|------|------|
| Data sparsity | Sample count needed for equal density grows exponentially with dimensions |
| Distance homogenization | All point pairs become roughly equidistant; nearest/farthest neighbors become indistinguishable |
| Overfitting risk | When feature count approaches sample count, models memorize noise |
| Computational cost | Learning and inference cost scale with dimension (linearly or quadratically) |

Algorithms relying on Euclidean distance—KNN, K-means—are particularly vulnerable in high dimensions.

> 💡 **Key Theory**: The mathematical heart of the curse is that in a high-dimensional unit hypercube, the ratio of maximum to minimum distance between random points converges to 1. Put simply, "nearest neighbor" and "farthest neighbor" become essentially identical. This means dimensionality reduction isn't just about cutting computation—it's about **restoring the space in which distance-based learning works**.

## PCA: Principal Component Analysis

PCA is a linear dimensionality reduction technique that finds orthogonal axes (principal components) that **maximize variance retention** and projects data onto those axes.

- First principal component (PC1) is the direction of maximum variance
- Second principal component (PC2) is orthogonal to PC1 and captures the most remaining variance
- Keep top k principal components to reduce dimensions from d → k

Key requirement: **Always standardize before PCA**. Since PCA is variance-based, large-scale variables will dominate principal components.

```python
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA

X_scaled = StandardScaler().fit_transform(X_train)

pca = PCA(n_components=0.95)   # auto-select minimum components explaining 95% variance
X_reduced = pca.fit_transform(X_scaled)

print("Number of components selected:", pca.n_components_)
print("Cumulative explained variance:", pca.explained_variance_ratio_.cumsum())
```

Passing a ratio (0–1) to `n_components` instead of an integer auto-selects the minimum number of components explaining that variance ratio. Choose k using the **scree plot** or the elbow of the cumulative variance curve.

> 💡 **Key Theory**: PCA is mathematically equivalent to eigendecomposition of the data covariance matrix. Eigenvectors are principal component directions; eigenvalues are the variance in those directions. "Explained variance ratio" is each eigenvalue divided by the sum of all eigenvalues. The same result can be obtained via Singular Value Decomposition (SVD); scikit-learn and SageMaker use randomized SVD for large-scale data efficiency.

## SageMaker Built-In PCA Algorithm

For large datasets that won't fit in memory, use SageMaker's built-in **PCA algorithm**.

| Mode | Use Case |
|------|-----------|
| `regular` | Medium-scale features and observations |
| `randomized` | Very high feature count (approximate SVD for scalability) |

- Input formats: `recordIO-protobuf` or CSV; distributed training supported
- Key hyperparameters: `feature_dim`, `num_components`, `algorithm_mode`, `subtract_mean`
- Use output principal components to reduce downstream model (XGBoost, etc.) input dimensionality

```python
from sagemaker import image_uris

container = image_uris.retrieve("pca", region="ap-northeast-2")
# Estimator hyperparameter example
hyperparameters = {
    "feature_dim": 784,
    "num_components": 50,
    "algorithm_mode": "randomized",
    "subtract_mean": "true",
}
```

## t-SNE: Nonlinear Visualization-Only Technique

t-SNE (t-distributed Stochastic Neighbor Embedding) is a **nonlinear technique** that preserves neighborhood relationships (local structure) from high dimensions into 2–3 dimensions.

| Aspect | PCA | t-SNE |
|------|-----|-------|
| Linear/Nonlinear | Linear | Nonlinear |
| Purpose | Variance preservation, dimensionality reduction | Cluster visualization |
| Distance interpretation | Preserves global structure | Local structure only |
| New data transformation | `transform` possible | Not possible (requires retraining) |
| Determinism | Deterministic | Stochastic (seed-dependent) |

t-SNE excels for **visual cluster inspection** but should **never be used as model input preprocessing**. Inter-cluster distances and cluster sizes have no physical meaning, and new samples cannot be projected into the same space.

```python
from sklearn.manifold import TSNE

tsne = TSNE(n_components=2, perplexity=30, random_state=42)
X_embedded = tsne.fit_transform(X_scaled)   # 2D coordinates for visualization
```

`perplexity` balances the number of neighbors to consider, typically tuned between 5 and 50.

> 💡 **Key Theory**: t-SNE converts high-dimensional distances into conditional probability distributions and minimizes KL divergence to reproduce them in low dimensions using a heavy-tailed t-distribution. The t-distribution's heavy tails alleviate the "crowding problem"—clusters spread out instead of collapsing. However, the inter-cluster spacing has no meaning—exam trap: "judge similarity by cluster distances in t-SNE output" is wrong.

## Summary

- **Curse of dimensionality**: High-dimensional loss of distance discriminability, data sparsity, overfitting
- **PCA**: Linear, preserves variance, requires standardization, suitable for model preprocessing, built-in SageMaker algorithm available
- **t-SNE**: Nonlinear, preserves local structure, visualization-only, unsuitable for model input

## 📝 Practice Questions

**Question 1.** You want to reduce the dimensionality of 784-dimensional image data with SageMaker and use it as input to a downstream classification model. The number of features is large, so scalability is important. What is the MOST appropriate choice?

A) Create a 2-dimensional embedding with t-SNE and feed it to the classifier  
B) Use SageMaker built-in PCA with `algorithm_mode=randomized`  
C) Use SageMaker built-in PCA with `algorithm_mode=regular` but skip standardization  
D) Apply KNN as is without dimensionality reduction  

**Answer: B**  
Explanation: When the number of features is large and scalability is important, the approximate-SVD-based `randomized` mode is appropriate. t-SNE (A) is for visualization only and is unsuitable for model input or transforming new data, skipping standardization (C) distorts the variance-based PCA, and KNN (D) collapses in high dimensions because of the curse of dimensionality.

---

**Question 2.** What preprocessing must be done before applying PCA?

A) Target variable encoding  
B) SMOTE oversampling  
C) Feature standardization (scaling)  
D) Polynomial feature generation  

**Answer: C**  
Explanation: PCA picks the directions of largest variance as principal components, so standardization is essential to keep variables with large scales from dominating the result. Target encoding (A) is unrelated to PCA, an unsupervised transformation, SMOTE (B) handles imbalance, and polynomial features (D) actually increase dimensionality.

---

**Question 3.** Which statement about t-SNE is NOT correct?

A) It is a nonlinear technique that preserves local neighborhood structure  
B) It is mainly used for 2- to 3-dimensional visualization  
C) The results depend on random initialization and the seed  
D) New data can be transformed into the same space using a learned mapping  

**Answer: D**  
Explanation: t-SNE does not learn a transformation function, so new data cannot be projected into the same space and it must be rerun each time — this is the key difference from PCA. Being nonlinear and preserving local structure (A), being used for visualization (B), and depending on the seed (C) are all correct.

---

**Question 4.** What is the most appropriate way to choose an appropriate number of principal components k in PCA?

A) Decide using the elbow of the cumulative explained variance curve or a target variance ratio  
B) Always fix it at half of the original dimensions  
C) Keep only the single largest eigenvalue  
D) Choose randomly  

**Answer: A**  
Explanation: The standard approach is to decide k using the elbow of the scree plot or a target ratio such as "95% cumulative explained variance." Fixing at half (B), keeping only one eigenvalue (C), and random selection (D) do not reflect the variance structure of the data.

---

**Question 5.** Which type of algorithm does the curse of dimensionality worsen MOST directly?

A) Split criteria of decision trees  
B) The conditional independence assumption of Naive Bayes  
C) Euclidean-distance-based KNN and K-means  
D) Intercept calculation in linear regression  

**Answer: C**  
Explanation: The curse of dimensionality homogenizes the distances between points in high dimensions, causing them to lose discriminative power, so KNN and K-means, which depend on distance, are hit most directly. Tree splits (A), Naive Bayes (B), and the linear regression intercept (D) are not distance-based, so the effect is relatively small.

---
