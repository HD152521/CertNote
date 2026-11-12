# Day 5 - Week 6 Comprehensive Review: Algorithm Selection and SageMaker Builtins

This week covered the starting point of MLS-C01 Domain 3 (Modeling) — **algorithm selection** and **SageMaker builtins**. Exam modeling problems almost always narrow down "identify problem type → algorithm family → specific builtin" in order. Today we review four days as one decision flow and organize the most confusing comparisons.

## One-Page Summary: Problem to Builtin

```text
[Business Problem]
   │
   ├─ 1) Identify ML type from output form (Day1)
   │     Category → Classification | Numeric → Regression | Find groups → Clustering
   │     Recommend → Recommendation | Rare event → Anomaly | Topics → Topic model
   │     (Labels present = supervised / absent = unsupervised)
   │
   ├─ 2) Narrow builtin by data shape (Day2~4)
   │     Tabular  → XGBoost / Linear Learner / KNN / K-Means
   │     Text → BlazingText
   │     Image → Image Classification
   │     Time series → DeepAR
   │     Sparse recommendation → Factorization Machines
   │     Anomaly → Random Cut Forest / IP Insights
   │     Dimension → PCA
   │     Topics → LDA / NTM
   │
   └─ 3) Fine details
         Scaling needed? (distance/linear=yes, tree=no)
         Overfitting/underfitting adjustments, input format (RecordIO-protobuf etc)
```

## Four Tabular Data Algorithms (Day2)

| Algorithm | Type | Scaling | Signal |
|------|------|------|------|
| XGBoost | Classification/Regression | Not needed | Tabular, nonlinear, high accuracy |
| Linear Learner | Classification/Regression | Required | Massive scale, fast, linear, interpretable |
| K-Means | Clustering (unsupervised) | Required | Segmentation, group discovery |
| KNN | Classification/Regression | Required | Most similar cases, neighbor-based |

## Four Specialized Data Algorithms (Day3)

| Data | Builtin | Key Point |
|------|------|------|
| Text classification | BlazingText (supervised) | `__label__` format |
| Word embedding | BlazingText (Word2Vec) | cbow/skipgram |
| Image classification | Image Classification | transfer learning, augmentation |
| Time series forecast | DeepAR | many related series, probabilistic (P90) |
| Sparse recommendation | Factorization Machines | RecordIO-protobuf |

## Four Unsupervised/Anomaly Algorithms (Day4)

| Builtin | Task | Signal |
|------|------|------|
| Random Cut Forest | Anomaly (general numeric) | Rare events, real-time |
| IP Insights | Anomaly (entity-IP) | Abnormal login |
| PCA | Dimension reduction | Too many features, compress |
| LDA / NTM | Topic model | Discover topics (LDA=simple, NTM=massive, GPU) |

> 💡 **Related Theory**: One principle threads this week: **"Data shape and output form determine algorithm."** Same classification but tabular → XGBoost, text → BlazingText, image → Image Classification. Same unsupervised but group discovery → K-Means, anomaly → RCF, dimension reduction → PCA, topics → LDA/NTM. Exams embed data shape (table/text/image/time-series/sparse) and goal (predict/group/anomaly/topics/compress) in scenarios, narrowing to exactly one algorithm via combination. So memorize "combination → builtin" mapping.

## Most Confusing Comparisons

| Comparison | Core Difference |
|------|------|
| XGBoost vs Linear Learner | Nonlinear, tabular = XGBoost / Massive scale, linear, interpretable = Linear |
| K-Means vs KNN | K-Means = unsupervised clustering / KNN = supervised neighbor prediction |
| RCF vs IP Insights | General numeric anomaly / Entity-IP relationship anomaly |
| LDA(topic) vs LDA(linear discriminant) | SageMaker LDA is topic model, name collision |
| LDA vs NTM | Probabilistic, simple, interpretable / Neural net, massive, GPU |
| DeepAR vs general regression | Many related series, probabilistic vs single point estimate |
| BlazingText two modes | supervised = document classification / Word2Vec = word embedding |

> 💡 **Related Theory**: Scaling necessity answers from algorithm family. **Distance-based (KNN, K-Means), linear models (Linear Learner), PCA** — feature scale distorts results, scaling mandatory. **Tree-based (XGBoost)**, by contrast, splits each feature independently at thresholds, scale-invariant. On exams, preprocessing/algorithm traps (e.g., "XGBoost must be scaled") filter via this principle.

## Self-Check Questions

Recall answers mentally.

1. Default builtin for nonlinear classification on tabular data? → **XGBoost**
2. Probabilistic demand forecast for thousands related series? → **DeepAR**
3. Recommended input format for user-item sparse recommendation? → **RecordIO-protobuf**
4. Common preprocessing needed for both KNN and K-Means? → **Feature scaling**
5. Detect anomaly when account logins from unusual IP? → **IP Insights**
6. Discover topics in document collection, prefer massive scale, GPU? → **NTM**
7. What is SageMaker "LDA"? → **Topic model (Latent Dirichlet Allocation)**

## Comprehensive Exam Tips

- **Step 1**: Confirm ML type from output form (category/numeric/group/recommend/anomaly/topics) and label presence
- **Step 2**: Narrow to one builtin from data shape (tabular/text/image/time-series/sparse)
- "Text/image/time series" words displace general XGBoost, push to specialized builtin answers
- "No labels + rare/new anomaly" → RCF; "entity-IP" → IP Insights
- "Skip scaling" option in distance/linear/PCA is wrong; "must scale" for XGBoost is also wrong
- Input format: sparse/massive efficiency → **RecordIO-protobuf**; topic model → **BoW**

## Summary

Week 6 was modeling's first step — "translate problems to algorithms." Determine ML type from output form, narrow SageMaker builtin to one via data shape, finalize details like scaling, input format, overfitting adjustment. Core is **"data shape × output form → builtin"** mapping memory and distance/linear/tree scaling principle.

Next week (Week 7) moves to actually **training and tuning** models — training infrastructure, hyperparameter optimization (Automatic Model Tuning), regularization and overfitting control.

---

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
