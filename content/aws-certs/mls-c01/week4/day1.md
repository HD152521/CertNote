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

## 📝 연습 문제

**문제 1.** 784차원 이미지 데이터를 SageMaker로 차원 축소해 후속 분류 모델의 입력으로 쓰려 한다. 특성 수가 많아 확장성이 중요하다. 가장 적절한 선택은?

A) t-SNE로 2차원 임베딩을 만들어 분류기에 입력  
B) SageMaker 내장 PCA를 `algorithm_mode=randomized`로 사용  
C) SageMaker 내장 PCA를 `algorithm_mode=regular`로 사용하되 표준화 생략  
D) 차원 축소 없이 KNN을 그대로 적용  

**정답: B**  
해설: 특성 수가 많고 확장성이 중요하면 근사 SVD 기반의 `randomized` 모드가 적합하다. t-SNE(A)는 시각화 전용이라 모델 입력·새 데이터 변환에 부적합하고, 표준화 생략(C)은 분산 기반 PCA를 왜곡하며, 고차원에서 KNN(D)은 차원의 저주로 무너진다.

---

**문제 2.** PCA를 적용하기 전에 반드시 해야 하는 전처리는?

A) 타깃 변수 인코딩  
B) SMOTE 오버샘플링  
C) 특성 표준화(스케일링)  
D) 다항 특성 생성  

**정답: C**  
해설: PCA는 분산이 큰 방향을 주성분으로 잡으므로, 스케일이 큰 변수가 결과를 지배하지 않도록 표준화가 필수다. 타깃 인코딩(A)은 비지도 변환인 PCA와 무관하고, SMOTE(B)는 불균형 처리, 다항 특성(D)은 차원을 오히려 늘린다.

---

**문제 3.** t-SNE에 대한 설명으로 옳지 않은 것은?

A) 비선형 기법으로 국소 이웃 구조를 보존한다  
B) 주로 2~3차원 시각화에 사용된다  
C) 결과는 무작위 초기화와 seed에 의존한다  
D) 학습된 매핑으로 새 데이터를 동일 공간에 변환할 수 있다  

**정답: D**  
해설: t-SNE는 변환 함수를 학습하지 않으므로 새 데이터를 같은 공간에 사영할 수 없고 매번 재학습해야 한다 — 이 점이 PCA와의 핵심 차이다. 비선형·국소 구조 보존(A), 시각화 용도(B), seed 의존성(C)은 모두 옳다.

---

**문제 4.** PCA에서 적절한 주성분 개수 k를 선택하는 방법으로 가장 적절한 것은?

A) 누적 설명 분산 곡선의 팔꿈치 또는 목표 분산 비율로 정한다  
B) 항상 원본 차원의 절반으로 고정한다  
C) 가장 큰 고유값 하나만 남긴다  
D) 무작위로 선택한다  

**정답: A**  
해설: 스크리 플롯의 팔꿈치나 "누적 설명 분산 95%" 같은 목표 비율로 k를 정하는 것이 표준이다. 절반 고정(B)이나 고유값 하나만 남기기(C), 무작위 선택(D)은 데이터의 분산 구조를 반영하지 못한다.

---

**문제 5.** 차원의 저주가 가장 직접적으로 악화시키는 알고리즘 유형은?

A) 의사결정 트리의 분할 기준  
B) 나이브 베이즈의 조건부 독립 가정  
C) 유클리드 거리 기반 KNN·K-means  
D) 선형 회귀의 절편 계산  

**정답: C**  
해설: 차원의 저주는 고차원에서 점들 사이 거리가 동질화되어 변별력을 잃게 하므로, 거리에 의존하는 KNN·K-means가 가장 직접적으로 타격을 받는다. 트리 분할(A)·나이브 베이즈(B)·선형 회귀 절편(D)은 거리 기반이 아니어서 영향이 상대적으로 작다.

---
