# Day 2 - SageMaker Builtin 1: XGBoost, Linear Learner, K-Means, KNN

## 📌 Key Takeaways

- **"Tabular data + high accuracy" is almost always XGBoost.** It is tree-based, so it needs no scaling and handles missing values on its own.
- **"Massive scale + fast + linear/interpretable" is Linear Learner.** It trains several models at once and automatically picks the best one.
- **"Discover groups/segments without labels" is K-Means.** The number of clusters `k` must be specified in advance.
- **Distance-based and linear families (KNN, K-Means, Linear Learner) require scaling**, while trees (XGBoost) do not. An option that says "skip scaling" is a wrong-answer signal for distance/linear families.
- For an XGBoost overfitting scenario, the correct direction is `max_depth`↓, `eta`↓, regularization (`gamma`/`lambda`/`alpha`)↑, `subsample`↓.

## The Four Algorithms at a Glance

Building on yesterday's mapping table, today we dig deep into the four most common **tabular data** algorithms. These are core builtins within the exam scope, and the key is to distinguish which problem each one fits, its input formats, and its key hyperparameters.

| Algorithm | Type | Scaling | Input format | Strength | Question signal |
|------|------|------|------|------|------|
| XGBoost | Supervised (classification/regression) | Not needed | CSV, libsvm, Parquet, RecordIO-protobuf | Best for tabular data, nonlinearity and interactions | "tabular / high accuracy / Kaggle-style" |
| Linear Learner | Supervised (classification/regression) | Needed | RecordIO-protobuf (recommended), CSV | Fast at massive scale, easy to interpret | "huge data / linear / fast" |
| K-Means | Unsupervised (clustering) | Needed | RecordIO-protobuf, CSV | Discovers groups automatically without labels | "segmentation / group discovery / no labels" |
| KNN | Supervised (classification/regression) | Needed | RecordIO-protobuf, CSV | Simple, non-parametric | "most similar cases / neighbor-based" |

```
                  [Tabular data problem]
                          │
              Are there labels?
        ┌─────────Yes────────┴────────No────────────┐
        │                                          │
   Output is category/number                  Discover groups
        │                                          │
 ┌──────┴───────┐                              K-Means
 │              │                            (specify k up front,
Is the          "Decide by the                 scaling required)
relationship    most similar
nonlinear?      cases"
 │                    │
 ├─ Yes → XGBoost     └→ KNN
 │   (no scaling needed)   (scaling required,
 └─ No/massive/interpretable   weak in high dimensions)
      → Linear Learner
        (scaling needed)
```

## XGBoost — The Workhorse for Tabular Data

A gradient boosting tree algorithm. It is strong for both classification and regression, and in practice, on exams, and on Kaggle it is effectively the default for tabular data.

- **Use**: Binary/multiclass classification, regression, ranking
- **Input formats**: CSV, libsvm, Parquet, RecordIO-protobuf (for CSV, the **first column is the label**)
- **Strengths**: Handles missing values on its own, automatically captures nonlinearity and interactions, and needs no scaling because it is tree-based

Key hyperparameters:

```text
objective         binary:logistic | multi:softmax | reg:squarederror
num_round         number of boosting rounds (number of trees)
max_depth         tree depth — larger means more complex, higher overfitting risk
eta               learning rate (smaller converges more slowly, typically 0.01~0.3)
subsample         row sampling ratio (suppresses overfitting)
colsample_bytree  column sampling ratio
gamma, lambda, alpha   regularization (suppress overfitting)
scale_pos_weight  class imbalance correction
```

XGBoost overfitting control is a combination of knobs that "simplify the model." Reduce `max_depth`; lower `eta` while raising `num_round`; add randomness with `subsample`/`colsample_bytree`; and apply regularization with `gamma`/`lambda`/`alpha`. On the exam, a scenario like "training loss keeps falling but validation loss rises (overfitting)" usually has the answer in the direction of `max_depth`↓ / `eta`↓ / regularization↑ / `subsample`↓. Underfitting is the opposite direction.

### XGBoost Tuning Direction Table

| Symptom | Lower | Raise | Rationale |
|---|---|---|---|
| Overfitting (validation loss↑, training loss↓) | `max_depth`, `eta`, `subsample`, `colsample_bytree` | `gamma`, `lambda`, `alpha` | Lowers model complexity and applies regularization |
| Underfitting (both high) | `gamma`, `lambda`, `alpha` | `max_depth`, `num_round` | Increases expressive power |
| Training is too slow | `num_round` | `eta` | A larger learning rate converges in fewer rounds |
| Positive class is extremely rare | — | `scale_pos_weight` | Raises the minority class weight to correct imbalance |

> ⚠️ **Trap**: If you only lower `eta` and leave `num_round` unchanged, training ends before the model has learned enough, causing underfitting. **`eta`↓ and `num_round`↑ move as a pair.**

## Linear Learner — Linear Model, Massive Scale, Fast

SageMaker's distributed and optimized version of linear/logistic regression. It supports both classification and regression.

- **Use**: Binary/multiclass classification, regression
- **Input formats**: RecordIO-protobuf (recommended, efficient), CSV
- **Strengths**: Fast on huge data, and it **trains multiple models at once and automatically selects the best one**. Easy to interpret
- **Caution**: Because it is a linear model, **feature scaling is decisive** (the builtin provides a normalization option)

Key hyperparameters:

```text
predictor_type        binary_classifier | multiclass_classifier | regressor
num_classes           number of classes for multiclass classification
mini_batch_size       mini-batch size
learning_rate         learning rate
l1, wd(L2)            regularization
normalize_data        whether to standardize the input
balance_multiclass_weights   imbalance correction
```

The fork between XGBoost and Linear Learner: **if nonlinear relationships matter, choose XGBoost; if the relationship is mostly linear, the scale is huge, and interpretability matters, choose Linear Learner.**

| Comparison axis | XGBoost | Linear Learner |
|---|---|---|
| Form of relationship | Automatically captures nonlinearity and interactions | Assumes linearity |
| Scale | Best for mid-size tabular data | Fast at hundreds of millions of rows |
| Interpretability | Feature-importance level | Directly interpretable through coefficients |
| Scaling | Not needed | Needed (`normalize_data`) |
| Regularization knobs | `gamma`, `lambda`, `alpha` | `l1`, `wd` (L2) |
| Imbalance correction | `scale_pos_weight` | `balance_multiclass_weights` |

## K-Means — Unsupervised Clustering

It splits data into k groups without labels. It is used for things like customer segmentation.

- **Use**: Clustering (unsupervised)
- **Input formats**: RecordIO-protobuf, CSV
- **Key point**: The number of clusters `k` must be specified in advance
- **Caution**: It is distance-based, so **scaling is mandatory**

Key hyperparameters:

```text
k                 number of clusters (required)
feature_dim       feature dimension
mini_batch_size   mini-batch size
init_method       random | kmeans++ (initial center selection)
extra_center_factor   multiplier for generating extra candidate centers and then reducing them
```

There is no single correct answer for choosing `k`, so the following methods are used.

| Method | What it looks at | Decision criterion |
|---|---|---|
| Elbow (WCSS) | How much the within-cluster sum of squares drops as k increases | Pick k at the point where the drop flattens (the elbow) |
| Silhouette coefficient | Cohesion within its own cluster versus separation from the neighboring cluster | The k that maximizes the value |
| Domain constraint | The number of segments that can be handled operationally | If marketing can only run up to 5 segments, k=5 |

SageMaker K-Means uses `extra_center_factor` to generate generous candidate centers and then reduce them to find stable clusters.

## KNN — Distance-Based Classification/Regression

It predicts by majority vote (classification) or average (regression) of the k nearest neighbors.

- **Use**: Classification, regression
- **Input formats**: RecordIO-protobuf, CSV
- **Key point**: It is closer to "memorization" than to learning. Because neighbor search is costly at inference time, SageMaker accelerates it with dimensionality reduction (`sample_size`, `dimension_reduction`)
- **Caution**: Because it is distance-based, **scaling is mandatory**. Performance drops sharply in high dimensions (the curse of dimensionality)

Key hyperparameters:

```text
k                 number of neighbors to consult
sample_size       number of samples used for training
dimension_reduction_type   sign | fjlt (dimensionality reduction method)
predictor_type    classifier | regressor
```

| Value of `k` | Result | Risk |
|---|---|---|
| Very small (k=1) | Jagged boundary, learns even the noise | Overfitting |
| Very large | Boundary is smeared and drifts toward the majority class | Underfitting |

The **curse of dimensionality** is the phenomenon where, as dimensions increase, data scatters across the space and the distance gap between the "nearest neighbor" and the "farthest neighbor" shrinks. Distance itself loses discriminating power, so the performance of distance-based algorithms such as KNN collapses. This is why SageMaker KNN offers `dimension_reduction_type` (sign, fjlt), and reducing dimensions beforehand with PCA (Day 4) serves the same purpose.

Distance-based algorithms (KNN, K-Means) and linear models (Linear Learner) are **directly distorted by feature scale**, so scaling is mandatory. For example, if you feed "salary (in millions)" and "age (in tens)" without scaling, Euclidean distance is dominated by salary. Tree-based models (XGBoost), on the other hand, split each feature independently on a threshold, so they are invariant to scale. When the exam asks "is scaling needed?", answer immediately: needed for distance/linear families, not needed for tree families.

## Preprocessing Requirements Summary

| Algorithm | Scaling | Missing values | Categorical | Notes |
|---|---|---|---|---|
| XGBoost | Not needed | Can handle on its own | Must be encoded as numbers | For CSV, the first column is the label |
| Linear Learner | Needed | Must be handled beforehand | Encoding needed | Provides the `normalize_data` option |
| K-Means | Mandatory | Must be handled beforehand | Encoding needed | Distance-based |
| KNN | Mandatory | Must be handled beforehand | Encoding needed | Pair with dimensionality reduction for high dimensions |

## Evaluation Metrics for the Four Algorithms

Even for the same algorithm, the metric to look at differs depending on `predictor_type`/`objective`.

| Situation | Main metric | What it tells you | Trap |
|---|---|---|---|
| Binary classification (balanced) | Accuracy, F1 | Overall hit rate and balance | Accuracy is meaningful only when classes are balanced |
| Binary classification (imbalanced) | Recall, PR-AUC | Whether the minority class is actually caught | Accuracy reaches 99% even by predicting "all negative" |
| Multiclass classification | macro F1 | Weights per-class performance equally | Micro averaging is pulled toward the majority class |
| Regression (large errors are fatal) | RMSE | Penalizes large errors heavily by squaring | Swings widely on a single outlier |
| Regression (many outliers) | MAE | Average size of the error | Treats large errors leniently |
| Clustering (K-Means) | Silhouette coefficient, WCSS | Cohesion and separation, choosing k | No ground-truth labels, so absolute comparison is impossible |

> ⚠️ **Trap**: An option that says to evaluate clustering results with "accuracy" is wrong. K-Means is unsupervised, so there are no ground-truth labels to compare against. Evaluate only with internal metrics (silhouette, WCSS) or domain interpretation.

### Handling Class Imbalance

| Response | Method | Applicable algorithms |
|---|---|---|
| Weight correction | Raise the minority class weight | XGBoost `scale_pos_weight`, Linear Learner `balance_multiclass_weights` |
| Swap the metric | Recall, F1, PR-AUC instead of accuracy | Common to all classification algorithms |
| Threshold adjustment | Move the probability cutoff away from 0.5 | Classifiers that output probabilities |
| Reframe the problem | If labels are extremely rare, use unsupervised anomaly detection | RCF (Day 4) |

## Common Operational Tips

- **RecordIO-protobuf** is the most efficient input format for most builtins (streaming training is possible in Pipe mode).
- For large data, streaming from S3 in **Pipe mode** lets training start faster without copying to disk.
- Hyperparameters can be explored with SageMaker **Automatic Model Tuning** (a Week 7 topic).

```
[S3 training data]              [Builtin container]          [Model artifact]
 CSV / libsvm /      ──File─▶   Specify hyperparameters ──▶  s3://.../model.tar.gz
 Parquet /            or        (objective, k, eta …)               │
 RecordIO-protobuf   ──Pipe─▶   Early stopping on a                 ▼
      │                         validation channel          Real-time endpoint
 (Do scaling and encoding                                    or batch transform
  beforehand in a Processing Job)
```

- Finish scaling and encoding in a **front-end preprocessing step**, not in the training job, and reuse the same logic at inference time so that no training-serving mismatch arises.

## Question Clue → Answer Mapping Table

| Question clue | Answer direction | What gets pushed to wrong answers |
|---|---|---|
| "Tabular data + high accuracy" | XGBoost | Linear Learner (cannot capture nonlinearity) |
| "Some values are missing" | XGBoost (handles natively) | Distance/linear families without prior imputation |
| "Hundreds of millions of rows + fast training + interpret coefficients" | Linear Learner | KNN (inference cost explodes) |
| "No labels and want to find segments" | K-Means | KNN (supervised, so it needs labels) |
| "Decide from the most similar past cases" | KNN | — |
| "Only validation loss rises" | `max_depth`↓, `eta`↓, regularization↑ | `max_depth`↑ |
| "Scaling can be skipped" | True only for XGBoost | Wrong for KNN/K-Means/Linear Learner |
| Asks about the number of clusters | `k` of K-Means | `num_round` of XGBoost, `predictor_type` of Linear |

K-Means and KNN have similar-looking names and often get mixed up in the options. **K-Means is unsupervised clustering (no labels); KNN is supervised prediction (labels required).** If you choose based on the letter "k" alone, you will be wrong.

Tomorrow we cover the specialized builtins used when the data has a special form, such as text, images, time series, and recommendations.

## 📖 Glossary

- **Gradient boosting**: An ensemble learning method that stacks weak trees sequentially, with each new tree correcting the errors of the previous ones.
- **libsvm format**: A sparse-data text format of the form `label index:value index:value` that records only the non-zero values.
- **RecordIO-protobuf**: The binary input format preferred by SageMaker builtins. Files are small and well suited to Pipe mode streaming.
- **Pipe mode**: An input method that streams training data directly from S3 instead of copying it to the instance disk.
- **eta (learning rate)**: The ratio that decides how much each boosting round updates the model. The smaller it is, the slower and more stably it converges.
- **subsample / colsample_bytree**: The fraction of rows and columns used when building each tree. Adds randomness to reduce overfitting.
- **scale_pos_weight**: An XGBoost parameter that raises the weight of the positive class to correct class imbalance.
- **kmeans++**: An initialization method that picks initial centers far apart from each other. More stable than random initialization.
- **Elbow (WCSS)**: A method of choosing k at the point where the drop in within-cluster sum of squares flattens as k increases.
- **Curse of dimensionality**: The phenomenon where distances between points become similar as dimensions grow, so distance-based algorithms lose discriminating power.

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
