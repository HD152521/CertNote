# Day 5 - Week 6 Comprehensive Review: Algorithm Selection and SageMaker Builtin Algorithms

## 📌 Key Takeaways

- The one sentence that runs through Week 6 is **"data shape × output shape → builtin."** If you memorize this combination mapping, most modeling questions can be solved.
- The solving procedure always has two steps. **① Determine the ML type from the output shape + whether labels exist → ② Narrow down to a single builtin by the data shape.**
- The words "text, images, time series, sparse" push out plain XGBoost and make a specialized builtin the answer.
- Answer the scaling question immediately by algorithm family. **Distance-based (KNN, K-Means), linear (Linear Learner), and PCA require it; trees (XGBoost) do not.**
- The input format is a clue too. **RecordIO-protobuf for sparse and large-scale efficiency, BoW for topic models, JSON Lines for DeepAR.**

## Flow Map: From Problem to Builtin

This week covered the starting point of MLS-C01 Domain 3 (Modeling) — **algorithm selection** and **SageMaker builtins**. Modeling questions on the exam almost always narrow down in the order "identify the problem type → algorithm family → specific builtin." Today we review the four days as a single decision flow and organize the most confusing comparisons.

```text
[Business problem]
   │
   ├─ 1) Identify the ML type from the output shape (Day 1)
   │     Category → classification | Number → regression | Group discovery → clustering
   │     Recommendation → recommendation | Rare events → anomaly detection | Topics → topic model
   │     (Labels present = supervised / absent = unsupervised)
   │
   ├─ 2) Narrow the builtin by data shape (Day 2~4)
   │     Tabular        → XGBoost / Linear Learner / KNN / K-Means
   │     Text           → BlazingText
   │     Image          → Image Classification
   │     Time series    → DeepAR
   │     Sparse recs    → Factorization Machines
   │     Anomalies      → Random Cut Forest / IP Insights
   │     Dimensions     → PCA
   │     Topics         → LDA / NTM
   │
   └─ 3) Finalize the details
         Is scaling needed (distance/linear = needed, trees = not needed)
         Overfitting/underfitting adjustment, input format (RecordIO-protobuf, etc.)
```

## Week 6 Integrated Mapping Table

| Problem | Builtin | Supervised/Unsupervised | Input format | Scaling |
|---|---|---|---|---|
| Tabular classification/regression (nonlinear) | XGBoost | Supervised | CSV, libsvm, Parquet, RecordIO-protobuf | Not needed |
| Tabular classification/regression (massive scale, linear) | Linear Learner | Supervised | RecordIO-protobuf (recommended), CSV | Needed |
| Clustering, segmentation | K-Means | Unsupervised | RecordIO-protobuf, CSV | Mandatory |
| Nearest-case-based prediction | KNN | Supervised | RecordIO-protobuf, CSV | Mandatory |
| Document classification | BlazingText (supervised) | Supervised | Text, `__label__` format | Not applicable |
| Word embeddings | BlazingText (Word2Vec) | Unsupervised | Text (whitespace-tokenized) | Not applicable |
| Image classification | Image Classification | Supervised | RecordIO or images + .lst | Handled by container |
| Time series forecasting | DeepAR | Supervised | JSON Lines (`start`,`target`,`cat`,`dynamic_feat`) | Not applicable |
| Sparse recommendation | Factorization Machines | Supervised | RecordIO-protobuf (float32) | Cleanup recommended for numeric features |
| General numeric anomaly detection | Random Cut Forest | Unsupervised | CSV, RecordIO-protobuf | Recommended |
| Entity-IP anomaly detection | IP Insights | Unsupervised | (entity, IP) CSV | Not applicable |
| Dimensionality reduction | PCA | Unsupervised | RecordIO-protobuf, CSV | Mandatory |
| Topic discovery | LDA / NTM | Unsupervised | BoW | Not applicable |

> 💡 **Related Theory**: There is one principle running through this week — **"data shape and output shape decide the algorithm."** Even for the same classification, tabular data means XGBoost, text means BlazingText, and images mean Image Classification. Even for the same unsupervised learning, group discovery means K-Means, anomalies mean RCF, dimensionality reduction means PCA, and topics mean LDA/NTM. The exam plants the data shape (table/text/image/time series/sparse) and the goal (prediction/groups/anomalies/topics/compression) in the scenario and narrows to exactly one algorithm through that combination. That is why memorizing the "combination → builtin" mapping is the fastest approach.

### "Must-Know" Hyperparameters per Builtin

When a parameter name appears in an option, simply knowing which algorithm it belongs to can decide the answer.

| Builtin | Parameters you must know | Role |
|---|---|---|
| XGBoost | `objective`, `num_round`, `max_depth`, `eta`, `scale_pos_weight` | Objective function, number of rounds, complexity, learning rate, imbalance |
| Linear Learner | `predictor_type`, `num_classes`, `l1`/`wd`, `normalize_data` | Problem type, number of classes, regularization, standardization |
| K-Means | `k`, `init_method`, `extra_center_factor` | Number of clusters, initialization, candidate centers |
| KNN | `k`, `sample_size`, `dimension_reduction_type`, `predictor_type` | Number of neighbors, samples, dimensionality reduction, classification/regression |
| Image Classification | `use_pretrained_model`, `augmentation_type`, `num_classes` | Transfer learning, augmentation, number of classes |
| DeepAR | `context_length`, `prediction_length`, `likelihood` | Past window, forecast window, output distribution |
| Factorization Machines | `num_factors`, `predictor_type` | Latent factor dimension, classification/regression |
| Random Cut Forest | `num_trees`, `num_samples_per_tree` | Number of trees, samples per tree |
| PCA | `num_components`, `algorithm_mode`, `subtract_mean` | Number of components, regular/randomized, centering |
| IP Insights | `num_entity_vectors`, `vector_dim` | Entity hash space, embedding dimension |
| LDA / NTM | `num_topics` | Number of topics to find |

```
                       [Read one sentence of the question]
                                │
              Does it mention "labels"? ──No──┐
                                │Yes          │
                     What is the output?   What do you want to do?
        ┌──────────┬────────────┼──────────┐      ├─ Groups → K-Means
      Category   Number     Ranking/preference │      ├─ Anomalies → RCF / IP Insights
        │           │            │         │      ├─ Compression → PCA
   Data shape?  Time series?  Factorization │      └─ Topics → LDA / NTM
   ├─ Table → XGBoost / ├─ Yes → DeepAR  Machines
   │        Linear /    │
   │        KNN         └─ No → XGBoost / Linear
   ├─ Text → BlazingText (supervised)
   └─ Image → Image Classification
                  (Object Detection if location is needed)
```

## Comparison Table of Confusing Pairs

| Comparison | Key difference | Distinguishing clue |
|------|------|------|
| XGBoost vs Linear Learner | Nonlinear/tabular = XGBoost / massive scale/linear/interpretable = Linear Learner | "complex interactions" vs "hundreds of millions of rows, interpret coefficients" |
| K-Means vs KNN | K-Means = unsupervised clustering / KNN = supervised neighbor prediction | Whether labels exist |
| RCF vs IP Insights | Anomalies in general numeric data / anomalies in entity-IP relationships | Whether the data is a numeric vector or (account, IP) pairs |
| RCF vs supervised anomaly detection | No labels needed, handles new types / precise when labels are sufficient | If "almost no labels" appears, RCF |
| LDA (topic) vs LDA (Linear Discriminant Analysis) | SageMaker LDA is a topic model, a name collision | If the context is documents and topics, it is the topic model |
| LDA vs NTM | Probabilistic/simple/interpretable / neural network/large scale/GPU | Mention of data scale and GPU |
| DeepAR vs plain regression | Many related series/probabilistic / single point estimate | "thousands of time series," "P90 interval" |
| BlazingText's two modes | supervised = document classification / Word2Vec = word embeddings | Whether labels exist |
| FM vs collaborative filtering | FM is a generalization that includes extra features | "context and time features too" |
| PCA vs K-Means | Reduces the axes / groups the rows | "compression" vs "groups" |
| Image Classification vs Object Detection | Label only / location (bounding box) too | If "where is it" appears, Detection |

> 💡 **Related Theory**: Whether scaling is needed can be answered directly from the algorithm family. **Distance-based (KNN, K-Means), linear models (Linear Learner), and PCA** are distorted by feature scale, so scaling is mandatory. **Tree-based (XGBoost)**, on the other hand, splits each feature independently on a threshold, so it is invariant to scale. The preprocessing and algorithm traps on the exam (for example, "XGBoost must be standardized") are filtered out by this single principle.

## Question Clue → Answer Mapping Table (Integrated)

| Question phrase | Answer | Why |
|---|---|---|
| "There are no labels / discover groups" | K-Means | Unsupervised clustering |
| "No labels / rare, new anomalies" | Random Cut Forest | Unsupervised anomaly detection |
| "An account logs in from an unfamiliar IP" | IP Insights | Specialized for entity-IP |
| "Sparse high-dimensional / user-item" | Factorization Machines | Second-order interactions, RecordIO-protobuf |
| "Extract topics from documents" | LDA / NTM | Topic model |
| "Hundreds of features, reduce the input" | PCA | Dimensionality reduction (randomized if huge) |
| "Thousands of related time series / new product demand" | DeepAR | Shared learning across series |
| "Need P10/P50/P90 probability intervals" | DeepAR | Quantile forecasting |
| "Images but little labeled data" | Image Classification + transfer learning/augmentation | Use pretrained weights |
| "Classify documents very fast on a large corpus" | BlazingText supervised | Based on fastText, GPU acceleration |
| "Tabular + missing values + nonlinear + high accuracy" | XGBoost | Handles missing values natively, captures nonlinearity |
| "Hundreds of millions of rows + fast + interpret coefficients" | Linear Learner | Large-scale linear |
| "Anomalies on a real-time stream" | Kinesis Data Analytics RCF | SQL function inside the stream |
| "Launch quickly without ML staff" | Comprehend / Rekognition / Forecast / Personalize | Managed AI services |

## Metrics and Tuning Direction Summary

| Situation | Metric choice | Reason |
|---|---|---|
| Class imbalance (under 1% positives) | Recall, PR-AUC | Accuracy reaches 99% even with "all negative" |
| Problem where false positives are costly | Precision | Wrong blocking or sending is expensive |
| Threshold undecided, comparing models | ROC-AUC | Discriminative power independent of the threshold |
| Regression, large errors are fatal | RMSE | Penalizes large errors heavily by squaring |
| Regression, many outliers | MAE | Robust to outliers |
| Clustering, topics, dimensionality reduction | Silhouette/WCSS / interpretability / explained variance | No ground-truth labels, so accuracy is not possible |

| Symptom | Adjustment direction (XGBoost) |
|---|---|
| Overfitting | `max_depth`↓, `eta`↓ (+`num_round`↑), `subsample`↓, `gamma`/`lambda`/`alpha`↑ |
| Underfitting | `max_depth`↑, `num_round`↑, regularization↓ |
| Positives are extremely rare | `scale_pos_weight`↑ (`balance_multiclass_weights` for Linear Learner) |

## Self-Check

Recall the answers in your head.

1. What is the default builtin for nonlinear classification on tabular data? → **XGBoost**
2. Probabilistic demand forecasting for thousands of related time series? → **DeepAR**
3. What is the recommended input format for sparse user-item recommendation? → **RecordIO-protobuf**
4. What preprocessing do both KNN and K-Means require? → **Feature scaling**
5. Anomaly detection for an account logging in from an unusual IP? → **IP Insights**
6. Discovering topics in a document set, with a preference for large scale and GPU? → **NTM**
7. What is SageMaker's "LDA"? → **A topic model (Latent Dirichlet Allocation)**
8. What value must be specified in advance in K-Means? → **The number of clusters `k`**
9. What is the textbook combination when image data is scarce? → **Transfer learning + data augmentation**
10. What PCA mode is used for very high-dimensional data? → **`randomized`**

## Wrong-Answer Notes — Five Frequent Traps

| Trap | Why it is wrong | Correct judgment |
|---|---|---|
| "XGBoost must also be scaled" | Trees are scale-invariant | Scaling is mandatory only for distance, linear, and PCA |
| "It is distance-based but skip scaling" | Large-unit features dominate the distance | KNN and K-Means require scaling |
| "SageMaker LDA is Linear Discriminant Analysis" | Abbreviation collision | The builtin LDA is a topic model |
| "Anomaly detection is always supervised classification" | Anomaly labels are usually scarce | If labels are scarce or the pattern changes, RCF |
| "Evaluate imbalanced data by accuracy" | It scores high just by getting the majority class right | Move to Recall and PR-AUC |
| "Feed sparse recommendation data as CSV" | It becomes a huge dense table that is mostly zeros | FM uses RecordIO-protobuf (float32) |
| "Images are scarce, so use a deeper model from scratch" | Overfits on little data | Transfer learning + augmentation |

## Comprehensive Exam Tips

- **Step 1**: Determine the ML type from the output shape (category/number/group/recommendation/anomaly/topic) and whether labels exist.
- **Step 2**: Narrow to a single builtin by the data shape (tabular/text/image/time series/sparse).
- The words "text/image/time series" push out plain XGBoost and push toward a specialized builtin answer.
- "No labels + rare/new anomalies" means RCF, and "entity-IP" means IP Insights.
- For distance/linear/PCA, an option to "skip scaling" is wrong, and "XGBoost must be scaled" is also wrong.
- Input formats: **RecordIO-protobuf** for sparse and large-scale efficiency, **BoW** for topic models, **JSON Lines** for DeepAR.

Next week (Week 7) moves on to actually **training and tuning** models — training infrastructure, hyperparameter optimization (Automatic Model Tuning), and regularization and overfitting control.

## 📖 Glossary

- **Modeling domain (Domain 3)**: The part of the MLS-C01 exam that covers algorithm selection, training, tuning, and evaluation.
- **Builtin algorithm**: An algorithm that AWS provides as a container, which you can train with just hyperparameters and no code.
- **RecordIO-protobuf**: A binary input format recommended by many builtins. Efficient for sparse and large-scale data.
- **BoW (Bag-of-Words)**: A representation that discards word order and counts only frequencies to turn a document into a vector. The input to topic models.
- **JSON Lines**: A format that holds one JSON object per line. DeepAR receives one time series per line.
- **Quantile forecast**: A way of forecasting the future not as a single value but as probability intervals such as P10/P50/P90.
- **Transfer learning**: A technique that starts from pretrained weights and fine-tunes with a small amount of data.
- **Scale invariance**: The property that the result stays the same as long as the ordering of the values is preserved. Tree families have it.
- **Latent factor**: A low-dimensional hidden feature vector that describes users and items. FM's `num_factors` sets its dimension.
- **Explained variance ratio**: In PCA, the ratio showing how much of the original data's variance the selected principal components preserve.

## 📝 Practice Questions

**Question 1.** Which of the following is the MOST appropriate pairing of "data type and algorithm"?

A) Time series demand forecasting -> BlazingText  
B) Nonlinear classification of structured data -> PCA  
C) Labeled image classification -> Image Classification (transfer learning)  
D) Word embedding -> DeepAR  

**Answer: C**  
Explanation: Labeled image classification is the standard use of transfer learning-based Image Classification. Time series uses DeepAR (A is wrong), nonlinear classification of structured data uses XGBoost (the PCA in B is dimensionality reduction), and word embedding uses BlazingText Word2Vec (the DeepAR in D is for time series).

---

**Question 2.** A team building a structured-data classification model with XGBoost claims that "you must standardize to prevent distance distortion." Which evaluation of this claim is correct?

A) Correct. Scaling is mandatory for all algorithms  
B) Incorrect. XGBoost is tree-based and scale-invariant, so scaling is not mandatory  
C) Correct. XGBoost is a distance-based algorithm  
D) Incorrect. XGBoost is text-only, so it has no concept of scale  

**Answer: B**  
Explanation: XGBoost is tree-based and splits features independently on thresholds, so it is scale-invariant and scaling is not mandatory. "Mandatory for all algorithms" (A) is false, XGBoost is not distance-based (C), and it is not text-only (D).

---

**Question 3.** You want to detect, in an unsupervised way on general numeric metrics, network traffic anomalies that have almost no labels and keep appearing in new forms. Which built-in algorithm is MOST suitable?

A) Random Cut Forest  
B) Factorization Machines  
C) Linear Learner classification  
D) K-Means with 2 clusters  

**Answer: A**  
Explanation: Anomaly detection on unlabeled general numeric data is the standard use of RCF, which also responds with a score to new forms of anomalies. FM (B) is for recommendation, Linear Learner classification (C) requires labels, and K-Means with 2 clusters (D) does not match the goal of anomaly detection.

---

**Question 4.** Which of the following comparisons has an INCORRECT description?

A) K-Means is unsupervised clustering, and KNN is supervised prediction  
B) DeepAR trains on many related time series together and provides probabilistic forecasts  
C) BlazingText supervised is document classification, and Word2Vec is word embedding  
D) IP Insights is an algorithm specialized for detecting spikes in general numeric streams  

**Answer: D**  
Explanation: IP Insights specializes in "entity-IP" relationship anomalies, while spikes in general numeric streams are handled by RCF. A, B, and C are all correct descriptions.

---

**Question 5.** You want to efficiently learn second-order interactions on recommendation data in which user-item interactions are very sparse. Which is the correct pairing of algorithm and recommended input format?

A) XGBoost, CSV  
B) PCA, BoW  
C) Factorization Machines, RecordIO-protobuf  
D) DeepAR, JSON Lines  

**Answer: C**  
Explanation: Recommendation with ultra-high-dimensional sparse interactions suits Factorization Machines, and RecordIO-protobuf, optimized for sparse data, is recommended. XGBoost with CSV (A) is inefficient for ultra-high-dimensional sparse data, PCA (B) is dimensionality reduction, and DeepAR (D) is time series forecasting.

---
