# Day 1 - Dimensionality Reduction: PCA, t-SNE, and the Curse of Dimensionality

## 📌 Key Takeaways

- **Curse of dimensionality**: as dimensions grow, data becomes sparse and the distances between points become homogeneous, so distance-based algorithms such as KNN and K-means break down.
- **PCA** is a linear, unsupervised technique that finds orthogonal axes preserving as much variance as possible. **Standardization before applying it is mandatory**.
- Choose the number of principal components k by **cumulative explained variance** (e.g., `n_components=0.95`) or the **elbow of the scree plot**.
- **t-SNE** is a nonlinear technique that preserves local structure and is **for visualization only**. It cannot `transform` new data, and distances between clusters are meaningless.
- For large datasets use **SageMaker's built-in PCA**, and when the number of features is very large choose `algorithm_mode=randomized`.

## The Curse of Dimensionality

Week 4 moves into the second pillar of exploratory data analysis (EDA): **handling high-dimensional data**. As features multiply, a model seems to have more information, but as dimensions grow, the volume of space that the same number of samples must fill grows exponentially. As a result, data points drift apart from one another and **distance-based measures lose their discriminating power**.

| Symptom | Description |
|------|------|
| Data sparsity | As dimensions grow, the number of samples needed for the same density grows exponentially |
| Distance homogenization | The distances of all point pairs become similar, so telling nearest from farthest becomes meaningless |
| Overfitting risk | When the number of features approaches the number of samples, the model memorizes noise |
| Computational cost | Training and inference costs grow in proportion to (or with the square of) the dimension |

```
[Low dimension (2D)]             [High dimension (d ≫ 1)]
    ●                              ●    ●    ●
       ● ← close                     ●    ●    ●
              ● ← far              ●    ●    ●
                                   All pairwise distances are similar
  Nearest / farthest distinguishable   d_max / d_min → 1
  → KNN·K-means work normally        → the notion of a neighbor collapses
```

### Vulnerability to High Dimensions, by Algorithm

| Algorithm | Vulnerability | Reason |
|---|---|---|
| KNN | Very high | Decides neighbors by Euclidean distance |
| K-means | Very high | Assigns clusters by distance to the centroid |
| SVM (RBF kernel) | High | Kernel values depend on distances between samples |
| Linear/logistic regression | Medium | When the number of features approaches the number of samples, coefficients become unstable and the model overfits |
| Decision Tree / Random Forest | Medium to low | Looks at one feature at a time, but many irrelevant features degrade split quality |
| Naive Bayes | Low | Multiplies per-feature conditional probabilities, so it does not use a notion of distance |

Algorithms that depend on Euclidean distance, such as KNN and K-means, are especially vulnerable in high dimensions.

The mathematical core of the curse of dimensionality is that, in a high-dimensional unit hypercube, the ratio of the maximum to the minimum distance between two random points converges to 1. In other words, the "nearest neighbor" and the "farthest neighbor" become effectively the same. For this reason, dimensionality reduction does not merely cut computation; it also **restores the space in which distance-based learning works**.

## PCA: Principal Component Analysis

PCA is a linear dimensionality-reduction technique that finds **orthogonal axes (principal components) that preserve as much variance as possible** and projects the data onto those axes.

- The first principal component (PC1) is the direction of greatest variance
- The second principal component (PC2) is orthogonal to PC1 and has the greatest remaining variance
- Keep only the top k principal components to reduce dimensions from d → k

Key precondition: **always standardize before PCA**. Because it is variance-based, variables with large scales dominate the principal components.

### Preprocessing Requirements Before PCA

| Item | Requirement | Reason |
|---|---|---|
| Scale | **Standardization required** | It is variance-based, so large-scale variables monopolize the principal components |
| Missing values | Impute beforehand | Missing values cannot enter the covariance computation |
| Categorical | Encoding required (one-hot, etc.) | It accepts only numeric input |
| Target | Not used | PCA is an unsupervised transform |
| Fit scope | **Fit on the training set only** | Fitting with test statistics causes leakage |

```python
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA

X_scaled = StandardScaler().fit_transform(X_train)

pca = PCA(n_components=0.95)   # minimum number of components explaining 95% of the variance
X_reduced = pca.fit_transform(X_scaled)

print("Selected number of components:", pca.n_components_)
print("Explained variance ratio:", pca.explained_variance_ratio_.cumsum())
```

If you pass a 0–1 ratio to `n_components` instead of an integer, it automatically selects "the minimum number of principal components whose cumulative explained variance exceeds that ratio."

### How to Choose the Number of Components k

| Method | What it does | Criterion |
|---|---|---|
| Target explained variance | Minimum k whose cumulative explained variance exceeds the target | Specify the ratio directly, as in `n_components=0.95` |
| Scree plot elbow | The point where the eigenvalue (explained variance) drops sharply | The elbow where the curve bends |
| Downstream model performance | Compare cross-validation scores while varying k | Costly, but the most practical |

Choose an appropriate k from the **scree plot** or the elbow of the cumulative explained variance curve.

PCA is equivalent to an eigendecomposition of the data's covariance matrix. The eigenvectors are the principal component directions, and the eigenvalues are the variance in those directions. So the "explained variance ratio" is simply each eigenvalue divided by the sum of all eigenvalues. Singular value decomposition (SVD) yields the same result, and scikit-learn and SageMaker use randomized SVD on large data to improve efficiency.

> ⚠️ **Pitfall**: PCA is an **unsupervised** transform that never looks at the target. "The direction of large variance" is not always "the direction useful for prediction." If a decisive signal hides in a low-variance axis, PCA may throw it away.

> ⚠️ **Pitfall**: Principal components are linear combinations of the original features, so physical meaning is lost. If a question says "you must explain which variables were used for prediction," the answer is **feature selection**, not PCA.

## SageMaker Built-in PCA Algorithm

Large datasets cannot be loaded into memory entirely, so use SageMaker's built-in **PCA algorithm**.

| Mode | When to use |
|------|-----------|
| `regular` | Medium-sized number of features and observations |
| `randomized` | When the number of features is very large (approximate SVD provides scalability) |

- Input is `recordIO-protobuf` or CSV, and training supports distributed processing
- Use the resulting principal components to reduce the input dimension of downstream models (XGBoost, etc.)

| Hyperparameter | Role |
|---|---|
| `feature_dim` | Number of input features |
| `num_components` | Number of principal components to keep |
| `algorithm_mode` | `regular` / `randomized` |
| `subtract_mean` | Whether to subtract the mean |

```python
from sagemaker import image_uris

container = image_uris.retrieve("pca", region="ap-northeast-2")
# Example Estimator hyperparameters
hyperparameters = {
    "feature_dim": 784,
    "num_components": 50,
    "algorithm_mode": "randomized",
    "subtract_mean": "true",
}
```

### AWS Service Mapping

| Situation | Service / feature | Reason |
|---|---|---|
| Extract principal components from a large matrix that exceeds memory | SageMaker built-in PCA | Distributed training, supports `recordIO-protobuf`/CSV input |
| Very many features and scalability is the priority | Built-in PCA + `algorithm_mode=randomized` | Approximate SVD saves memory and time |
| Exploratory reduction of small data in a notebook | SageMaker notebook + scikit-learn PCA | Free experimentation such as scree plots |
| Downstream classification or regression on the reduced features | Built-in algorithms such as SageMaker XGBoost | Use the PCA output directly as training input |

## t-SNE: A Nonlinear Technique for Visualization Only

t-SNE (t-distributed Stochastic Neighbor Embedding) is a nonlinear technique that maps data so that **neighbor relationships (local structure) in high dimensions are preserved in 2–3 dimensions**.

| Item | PCA | t-SNE |
|------|-----|-------|
| Linear/nonlinear | Linear | Nonlinear |
| Purpose | Variance preservation, dimensionality reduction | Cluster visualization |
| Distance interpretation | Preserves global structure | Trust only local structure |
| Transforming new data | `transform` possible | Not possible (retrain each time) |
| Determinism | Deterministic | Random (depends on seed) |

t-SNE is excellent for seeing clusters with the eye, but **it is not used as preprocessing for model input**. Distances between clusters and cluster sizes have no physical meaning, and new samples cannot be projected into the same space.

```python
from sklearn.manifold import TSNE

tsne = TSNE(n_components=2, perplexity=30, random_state=42)
X_embedded = tsne.fit_transform(X_scaled)   # 2D coordinates for visualization
```

`perplexity` balances how many neighbors to consider and is typically tuned in the range 5–50.

t-SNE converts high-dimensional distances into conditional probability distributions and minimizes the KL divergence so that a heavy-tailed t-distribution in low dimensions reproduces the same relationships. The heavy tails of the t-distribution relieve the "crowding problem," letting clusters spread out instead of clumping. Because of this process, however, the size of the empty space between clusters is meaningless — on the exam, an option that says "judge similarity by the distance between t-SNE clusters" is a trap.

t-SNE has only `fit_transform`; it has no `transform` that stores the learned mapping and applies it to new samples. An option that says "put new data arriving in production into the same embedding space" is wrong.

## Dimensionality Reduction Technique Selection Table

| Technique | Linear/nonlinear | New-data transform | Main use | When not to use |
|---|---|---|---|---|
| **PCA** | Linear | Possible (`transform`) | Model preprocessing, noise removal, mitigating multicollinearity | When interpretation of the original variables is needed, or when relationships are strongly nonlinear |
| **t-SNE** | Nonlinear | Not possible (retrain) | 2–3D cluster visualization | Model input, projecting new data, interpreting distances between clusters |
| **Autoencoder** | Nonlinear | Possible (reuse the encoder) | Nonlinear compression, anomaly detection | When you cannot afford the data and tuning cost, or when axis interpretation is needed |
| **Feature selection** (Day 2) | — | Possible (original columns kept) | Reduction where interpretability is required | When interactions between features are the key to performance (filter methods only) |

### Reduce or Select?

```
You need to reduce dimensions
├─ Must the result be explained variable by variable? (regulated industry, audit response)
│    ├─ Yes → Feature selection (keep the original columns as they are)
│    └─ No ↓
├─ Is the goal "check by eye whether clusters exist"?
│    ├─ Yes → t-SNE (2–3D, visualization only. Never as model input)
│    └─ No ↓
├─ Are relationships mostly linear?
│    ├─ Yes → PCA (standardize → choose k by cumulative explained variance)
│    └─ No  → Nonlinear compression such as an autoencoder
└─ Does the data exceed single-instance memory?
     └─ Yes → SageMaker built-in PCA (randomized if there are many features)
```

## Summary of Preprocessing Techniques for High Dimensions

Dimensionality reduction is only one solution to the high-dimensional problem. The exam asks not "reduce the dimensions" but "what fits this situation."

| Technique | Effect | When to use | Caution |
|---|---|---|---|
| Standardization (Z-score) | Puts all features on the same scale | Before PCA, KNN, SVM, neural networks | Fit on the training set only |
| PCA | Compresses correlated axes into orthogonal axes | Many features that are correlated with each other | Not interpretable; standardize first |
| Feature selection | Removes irrelevant or redundant columns | Interpretation needed, manageable number of features | May miss interactions |
| Remove constant / quasi-constant columns | Removes axes with no information | The first step in any situation | Beware of columns whose values appear only in a minority class |
| Regularization terms (L1/L2) | Shrinks coefficients or sets them to 0 | Number of features ≳ number of samples | Scaling must come first |
| Embeddings | Turns high-cardinality categories into dense vectors | Deep learning, ultra-high cardinality | Needs training data and a network |

```
[High-dimensional raw data]
        │
   ① Split (train / test)  ← from here on, every fit uses the training set only
        │
   ② Missing-value imputation · encoding
        │
   ③ Standardization (StandardScaler)
        │
   ④ ┌─ Interpretation needed ─→ Feature selection (keep original columns)
     └─ Not needed ─→ PCA (n_components=0.95)
        │
   ⑤ Model training (XGBoost / linear / neural network …)
        │
   ⑥ On the test set, apply only transform with what was learned in ②–④
```

## Question Clue → Answer Mapping

| Clue in the question | Answer to choose | Reason |
|---|---|---|
| "There are 784 features and scalability matters" | SageMaker built-in PCA, `algorithm_mode=randomized` | Approximate SVD gives scalability in high dimensions |
| "What do you do before applying PCA?" | Standardization (scaling) | It is variance-based, so scale dominates the result |
| "I want to see by eye whether clusters exist" | t-SNE 2D embedding | Reveals local neighbor structure visually |
| "Use t-SNE coordinates as classifier input" | **Wrong option** | New data cannot be transformed, and distances are meaningless |
| "You must explain which variables were used for prediction" | Feature selection | Keeps the original features, so it is interpretable |
| "KNN accuracy drops as dimensions increase" | Curse of dimensionality → dimensionality reduction | Distance homogenization makes neighbor decisions meaningless |
| "You must decide how many principal components to keep" | Cumulative explained variance / scree plot elbow | A standard method based on the variance structure |

The next post covers **feature selection**, which reduces dimensions while keeping the original features, and multicollinearity.

## 📖 Glossary

- **Curse of dimensionality**: The phenomenon in which, as dimensions grow, data becomes sparse and distance discrimination disappears, making learning harder.
- **Sparsity**: Data becoming thin because the same number of samples must fill a much larger space.
- **Principal component**: A new coordinate axis taken, in order, along the directions of greatest variance in the data. They are mutually orthogonal.
- **Projection**: Moving the original data onto new axes, "casting a shadow," and re-assigning coordinates.
- **Explained variance ratio**: The share of the total variance that each principal component holds.
- **Scree plot**: A graph with the principal component number on the x-axis and explained variance on the y-axis. Pick k at the bend (elbow).
- **Eigendecomposition / SVD**: Linear-algebra operations that extract principal component directions (eigenvectors) and their variances (eigenvalues) from the covariance matrix. SVD is a way to get the same result more stably.
- **Local structure / global structure**: Relationships among nearby neighbors / the overall large-scale layout of the data. t-SNE preserves the former well, PCA the latter.
- **perplexity**: A value in t-SNE that controls "how many neighbors to look at." Usually set between 5 and 50.
- **recordIO-protobuf**: A binary input format preferred by SageMaker built-in algorithms. More efficient than CSV for large volumes.

---

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
