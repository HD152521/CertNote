# Day 2 - SageMaker Builtin 1: XGBoost, Linear Learner, K-Means, KNN

From yesterday's mapping table, today we dig deep into the four most common **tabular data** algorithms. These are the most frequently tested builtins, and distinguishing which problems each solves best, input formats, and key hyperparameters is essential.

## XGBoost — Tabular Data Workhorse

Gradient boosting trees. Powerful for both classification and regression, effectively the default for tabular data in Kaggle, practice, and exams.

- **Use**: Binary/multi-class classification, regression, ranking
- **Input Format**: CSV, libsvm, Parquet, RecordIO-protobuf (CSV: first column is label)
- **Strengths**: Handles missing values natively, automatically captures nonlinearities and interactions, scaling unnecessary (tree-based)

Core hyperparameters:

```text
objective         binary:logistic | multi:softmax | reg:squarederror
num_round         number of boosting rounds (tree count)
max_depth         tree depth — larger = more complex/overfitting risk
eta               learning rate (smaller = slower, typically 0.01~0.3)
subsample         row sampling ratio (suppress overfitting)
colsample_bytree  column sampling ratio
gamma, lambda, alpha   regularization (suppress overfitting)
scale_pos_weight  class imbalance adjustment
```

> 💡 **Related Theory**: XGBoost overfitting control is a combo of knobs "simplifying the model." Reduce `max_depth`, lower `eta` but increase `num_round`, add randomness with `subsample`/`colsample_bytree`, apply regularization with `gamma`/`lambda`/`alpha`. On exams, "validation loss rises while training loss keeps falling (overfitting)" scenarios typically answer with `max_depth`↓ / `eta`↓ / regularization↑ / `subsample`↓ directions. Underfitting goes opposite.

## Linear Learner — Linear Models, Massive Scale, Fast

SageMaker's distributed/optimized version of linear/logistic regression. Supports both classification and regression.

- **Use**: Binary/multi-class classification, regression
- **Input Format**: RecordIO-protobuf (recommended, efficient), CSV
- **Strengths**: Fast on massive data, trains multiple models simultaneously and auto-selects best. Easy to interpret
- **Caution**: Linear model, so **feature scaling is critical** (builtin provides normalize option)

Core hyperparameters:

```text
predictor_type        binary_classifier | multiclass_classifier | regressor
num_classes           number of classes for multi-class
mini_batch_size       mini-batch size
learning_rate         learning rate
l1, wd(L2)            regularization
normalize_data        whether to standardize input
balance_multiclass_weights   imbalance adjustment
```

XGBoost vs Linear Learner: **If nonlinear relationships matter, use XGBoost. If mostly linear, massive scale, and interpretability matter, use Linear Learner.**

## K-Means — Unsupervised Clustering

Divide data into k groups without labels. Customer segmentation, etc.

- **Use**: Clustering (unsupervised)
- **Input Format**: RecordIO-protobuf, CSV
- **Key**: Must pre-specify cluster count `k`
- **Caution**: Distance-based, so **scaling is mandatory**

Core hyperparameters:

```text
k                 number of clusters (required)
feature_dim       feature dimension
mini_batch_size   mini-batch size
init_method       random | kmeans++ (initial center selection)
extra_center_factor   create then shrink candidate centers
```

Choosing k: No single answer, so use elbow (WCSS inflection) or silhouette coefficient. SageMaker K-Means finds stable clusters by growing k to create candidate centers, then shrinking.

## KNN — Distance-Based Classification/Regression

Predict using majority vote (classification) or average (regression) of k nearest neighbors.

- **Use**: Classification, regression
- **Input Format**: RecordIO-protobuf, CSV
- **Key**: More "memorization" than learning. Inference neighbor search is expensive → SageMaker accelerates with dimension reduction (sample_size, dimension_reduction)
- **Caution**: Distance-based, so **scaling mandatory**. Performance degrades in high dimensions (curse of dimensionality)

Core hyperparameters:

```text
k                 number of neighbors to reference
sample_size       number of samples for training
dimension_reduction_type   sign | fjlt (dimension reduction)
predictor_type    classifier | regressor
```

> 💡 **Related Theory**: Distance-based algorithms (KNN, K-Means) and linear models (Linear Learner) have **feature scale directly distort results**, so scaling is mandatory. For example, leave "salary (millions)" and "age (tens)" unscaled and Euclidean distance gets dominated by salary. Tree-based algorithms (XGBoost), by contrast, split each feature independently at thresholds, scale-invariant. On exams, when asked "is scaling needed?", instant answer: distance/linear family (yes), tree family (no).

## Four-Algorithm Comparison Summary

| Algorithm | Type | Scaling | Strength | Signal |
|------|------|------|------|------|
| XGBoost | Supervised (class/reg) | Not needed | Tabular powerhouse, nonlinear | "tabular / high accuracy / Kaggle-like" |
| Linear Learner | Supervised (class/reg) | Required | Massive scale, fast, interpretable | "huge data / linear / fast" |
| K-Means | Unsupervised (cluster) | Required | Auto discover groups | "segmentation / group discovery / no labels" |
| KNN | Supervised (class/reg) | Required | Simple, nonparametric | "most similar cases / neighbor-based" |

## Common Operations Tips

- **RecordIO-protobuf** is most efficient input format for most builtins (streaming training possible with pipe mode)
- Large data streams from S3 with **Pipe mode** for faster training start without disk copy
- Hyperparameters searchable via SageMaker **Automatic Model Tuning** (Week 7 topic)

## Exam Tips

- "Tabular data + high accuracy" almost always XGBoost
- "Massive scale + fast + linear/interpretable" is Linear Learner
- "Discover groups/segmentation + no labels" is K-Means
- Overfitting scenario with XGBoost: `max_depth`↓, `eta`↓, regularization↑
- "Skip scaling" option in distance/linear family (KNN, K-Means, Linear) is a wrong-answer signal

## Summary

Today we organized four tabular data builtins. XGBoost (nonlinear trees, scaling unnecessary), Linear Learner (massive-scale linear), K-Means (unsupervised clustering), KNN (neighbor-based) — distinguishing problem types, scaling requirements, and key hyperparameters is the exam focus. Tomorrow covers specialized builtins for text, image, time series, and recommendation.

---

## 📝 연습 문제

**문제 1.** 중간 규모의 정형(표 형식) 데이터로 이진 분류를 하는데, 피처 간 비선형 상호작용이 중요하고 결측치도 일부 있다. 가장 적합한 빌트인은?

A) K-Means  
B) XGBoost  
C) PCA  
D) DeepAR  

**정답: B**  
해설: 정형 데이터의 비선형·상호작용 포착과 결측치 자체 처리가 강점인 XGBoost가 적합하다. K-Means(A)는 비지도 군집, PCA(C)는 차원 축소, DeepAR(D)는 시계열 예측이라 이진 분류 과제와 맞지 않는다.

---

**문제 2.** XGBoost 학습 중 학습 손실은 계속 낮아지지만 검증 손실은 상승하는 과적합이 관찰된다. 다음 중 과적합을 완화하는 조정으로 적절하지 않은 것은?

A) max_depth를 낮춘다  
B) eta(학습률)를 낮춘다  
C) lambda/alpha 정규화를 강화한다  
D) max_depth를 크게 높인다  

**정답: D**  
해설: max_depth를 높이면 트리가 더 복잡해져 과적합이 심해진다. max_depth↓(A), eta↓(B), 정규화 강화(C)는 모두 모델을 단순화해 과적합을 줄이는 올바른 방향이다.

---

**문제 3.** 다음 중 거리 기반이어서 학습 전 피처 스케일링이 특히 중요한 빌트인 알고리즘은?

A) XGBoost  
B) K-Means  
C) Random Cut Forest  
D) BlazingText  

**정답: B**  
해설: K-Means는 유클리드 거리로 클러스터를 형성하므로 스케일이 큰 피처가 거리를 지배하지 않도록 스케일링이 필수다. XGBoost(A)는 트리라 스케일 불변이고, RCF(C)·BlazingText(D)는 이 맥락의 정답이 아니다.

---

**문제 4.** 수억 행 규모의 매우 큰 데이터로, 관계가 대체로 선형이며 빠른 학습과 모델 해석이 중요하다. 가장 적합한 빌트인은?

A) Linear Learner  
B) KNN  
C) Factorization Machines  
D) Image Classification  

**정답: A**  
해설: Linear Learner는 초대규모 데이터에서 빠르고, 선형 모델이라 계수 해석이 쉬우며 여러 모델을 동시에 학습해 최적을 고른다. KNN(B)은 대규모 추론 비용이 크고, FM(C)은 희소 상호작용 추천에 특화, Image Classification(D)은 이미지 전용이다.

---

**문제 5.** K-Means를 사용할 때 사용자가 반드시 사전에 지정해야 하는 핵심 하이퍼파라미터는?

A) objective  
B) predictor_type  
C) k (클러스터 수)  
D) num_round  

**정답: C**  
해설: K-Means는 데이터를 몇 개 그룹으로 나눌지(k)를 사전에 지정해야 한다. objective·num_round(A, D)는 XGBoost, predictor_type(B)은 Linear Learner/KNN의 파라미터다.

---
