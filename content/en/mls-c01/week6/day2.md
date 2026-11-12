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

## 📝 Practice Questions

**Question 1.** You are doing binary classification on medium-sized structured (tabular) data in which nonlinear interactions between features matter and there are some missing values. Which built-in algorithm is MOST suitable?

A) K-Means  
B) XGBoost  
C) PCA  
D) DeepAR  

**Answer: B**  
Explanation: XGBoost, whose strengths are capturing nonlinearity and interactions in structured data and handling missing values natively, is suitable. K-Means (A) is unsupervised clustering, PCA (C) is dimensionality reduction, and DeepAR (D) is time series forecasting, so none fit a binary classification task.

---

**Question 2.** During XGBoost training, you observe overfitting: the training loss keeps decreasing while the validation loss rises. Which of the following adjustments is NOT appropriate for mitigating overfitting?

A) Lower max_depth  
B) Lower eta (the learning rate)  
C) Strengthen lambda/alpha regularization  
D) Greatly increase max_depth  

**Answer: D**  
Explanation: Increasing max_depth makes the trees more complex and worsens overfitting. Lowering max_depth (A), lowering eta (B), and strengthening regularization (C) are all the right direction, simplifying the model to reduce overfitting.

---

**Question 3.** Which of the following built-in algorithms is distance-based, making feature scaling before training especially important?

A) XGBoost  
B) K-Means  
C) Random Cut Forest  
D) BlazingText  

**Answer: B**  
Explanation: K-Means forms clusters using Euclidean distance, so scaling is essential to keep large-scale features from dominating the distance. XGBoost (A) is tree-based and scale-invariant, and RCF (C) and BlazingText (D) are not the answer in this context.

---

**Question 4.** You have a very large dataset of hundreds of millions of rows, the relationships are mostly linear, and fast training and model interpretability matter. Which built-in algorithm is MOST suitable?

A) Linear Learner  
B) KNN  
C) Factorization Machines  
D) Image Classification  

**Answer: A**  
Explanation: Linear Learner is fast on ultra-large data, is a linear model so coefficients are easy to interpret, and trains multiple models simultaneously to choose the best. KNN (B) has high inference cost at large scale, FM (C) specializes in sparse-interaction recommendation, and Image Classification (D) is image-only.

---

**Question 5.** Which key hyperparameter must the user specify in advance when using K-Means?

A) objective  
B) predictor_type  
C) k (number of clusters)  
D) num_round  

**Answer: C**  
Explanation: K-Means requires you to specify in advance how many groups (k) to divide the data into. objective and num_round (A, D) are XGBoost parameters, and predictor_type (B) is a Linear Learner/KNN parameter.

---
