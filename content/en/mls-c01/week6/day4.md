# Day 4 - Unsupervised Learning and Anomaly Detection: RCF, PCA, IP Insights, Topic Models (LDA/NTM)

## 📌 Key Takeaways

- All four builtins today work with structure, anomalies, dimensions, and topics **without labels**. The signals in a question are "there are no labels / rare events / too many dimensions / discover topics."
- **RCF is for anomaly detection on general numeric data**, and **IP Insights is dedicated to "entity-IP" relationship anomalies.** Do not mix the two.
- For **real-time stream anomaly detection**, think of the `RANDOM_CUT_FOREST` function in Kinesis Data Analytics.
- **PCA compresses many correlated features while preserving variance.** For very large dimensions, use `algorithm_mode=randomized`.
- **LDA in SageMaker is a topic model (Latent Dirichlet Allocation)** and shares only a name with Linear Discriminant Analysis, the dimensionality reduction technique. Choose NTM for large scale/GPU, and LDA for simplicity/interpretability.

## Unsupervised Builtins at a Glance

| Algorithm | Task | Signal words | Input | Output |
|------|------|------|------|------|
| Random Cut Forest | Anomaly detection (general numeric) | "rare events / spikes / real-time" | CSV, RecordIO-protobuf | Per-record anomaly score |
| IP Insights | Anomaly detection (entity-IP) | "abnormal login / account IP" | (entity, IP) CSV | Likelihood that the entity would use that IP |
| PCA | Dimensionality reduction | "too many features / compress / visualize" | RecordIO-protobuf, CSV | Principal component coordinates |
| LDA | Topic model (probabilistic) | "discover topics / small scale / interpretability" | BoW | Per-document topic distribution, per-topic word distribution |
| NTM | Topic model (neural network) | "discover topics / large scale / GPU" | BoW | Per-document topic distribution, per-topic word distribution |

```
              [There are no labels]
                     │
   ┌──────────┬──────┴───────┬──────────────┐
"Find rare   "Too many       "Find topics   "Group similar
 events"      features"       in documents"   things together"
   │             │              │              │
What data?     PCA          Document scale?   K-Means
   │        (regular /          │            (Day 2)
   ├─ General numeric randomized) ├─ Large/GPU → NTM
   │  → RCF                   └─ Small/interpretable → LDA
   │  (if real-time, Kinesis
   │   Data Analytics RCF)
   └─ (entity, IP) pairs
      → IP Insights
```

## Random Cut Forest (RCF) — Anomaly Detection

It builds trees by cutting the data at random and assigns a high **anomaly score** to points that are easily isolated (rare).

- **Use**: Anomaly detection (unsupervised). Time series spikes, rare patterns
- **Input**: CSV, RecordIO-protobuf
- **Output**: Per-record anomaly score (higher means more anomalous)
- **Streaming**: Kinesis Data Analytics has a built-in `RANDOM_CUT_FOREST` function, which enables real-time anomaly detection

```text
Key hyperparameters:
  num_trees              number of trees (more means more stable)
  num_samples_per_tree   samples per tree
  feature_dim            feature dimension
```

The intuition behind RCF is that "anomalies get isolated faster than normal points." Normal points sit in dense regions and need many cuts to be separated, but a rare point is isolated with just a few random cuts. This isolation depth becomes the score. It needs no labels and reacts even to new kinds of anomalies, so it represents the "there are almost no labels / the anomalies keep changing" problem mentioned on Day 1. If the requirement is real-time, think of the RCF SQL function in Kinesis Data Analytics.

```
[Normal point]  Dense region → many cuts needed to separate → deep isolation depth → low score
   ● ●●●
   ●●●●●   ──┬── ──┬── ──┬── ──┬──  (needs 4 cuts to separate)
   ●●●

[Anomalous point]  Sparse region → isolated in a few cuts → shallow isolation depth → high score
                ○     ──┬──               (separated in 1 cut)
```

### Anomaly Detection: Supervised vs Unsupervised Decision Table

| Condition | Supervised classification | Unsupervised anomaly detection (RCF) |
|---|---|---|
| Are there enough anomaly labels? | Required (thousands or more) | Not needed |
| Is the anomaly pattern fixed? | Advantageous when fixed | Copes even when it keeps changing |
| New types of anomalies | Missed because never learned | Caught when it deviates from normal |
| Question clue | "Past fraud cases are sufficiently labeled" | "Almost no labels / the tactics keep changing" |
| Metric | precision/recall/PR-AUC | Anomaly score threshold and operational alert volume |

> ⚠️ **Trap**: For an anomaly detection problem, choosing "train it as a normal/anomaly binary classification" is correct only if the question gives grounds that enough anomaly labels exist. Choosing supervised classification without such grounds is wrong.

## PCA — Dimensionality Reduction

It compresses many highly correlated features into a small number of **principal components** that preserve as much variance as possible.

- **Use**: Dimensionality reduction (unsupervised). Visualization, lightening the input to downstream models, mitigating multicollinearity
- **Input**: RecordIO-protobuf, CSV
- **Modes**: `regular` (medium dimensions), `randomized` (very large dimensions, approximate, fast)

```text
Key hyperparameters:
  num_components     number of principal components to keep
  algorithm_mode     regular | randomized
  subtract_mean      remove the mean (centering)
```

- It is scale-sensitive, so you usually **scale and center first**.
- PCA is unsupervised and does not use labels. If you need a dimensionality reduction that uses labels, that is LDA (Linear Discriminant Analysis), but there is a catch — **LDA in SageMaker is a topic model (Latent Dirichlet Allocation) and shares only the name.**

| Mode | When to use | Characteristics |
|---|---|---|
| `regular` | The number of features is moderate | Exact computation |
| `randomized` | The number of features is very large | Approximate computation, fast and scalable |

| Reason to use PCA | Effect | Cost |
|---|---|---|
| Mitigate multicollinearity | Principal components are orthogonal, so correlation disappears | Loses interpretability of the original features |
| Lighten training/inference | Fewer input dimensions improve speed and cost | Some variance (information) is lost |
| Assist distance-based models | Eases the curse of dimensionality (in front of KNN) | Performance does not always improve |
| Visualization | Scatter plot with 2~3 principal components | The meaning of the axes is not intuitive |

> ⚠️ **Trap**: If you skip scaling before PCA, a feature with large units (e.g., salary) monopolizes the variance, and that feature's direction becomes the first principal component. **Standardizing before PCA** is almost always the correct option.

## IP Insights — Entity-IP Anomaly Detection

It learns the association between an **entity** (user/account) and IPv4 addresses and detects combinations that differ from the usual.

- **Use**: Abnormal logins, account takeover, bot detection (unsupervised)
- **Input**: CSV — `(entity, IP)` pairs
- **Output**: Likelihood that the entity would use that IP (lower means more anomalous)
- **Technique**: Learns entity-IP patterns with neural network embeddings and contrasts them against random negative samples

```text
Key hyperparameters:
  num_entity_vectors   size of the entity embedding hash space
  vector_dim           embedding dimension
  num_ip_encoder_layers
  random_negative_sampling_rate
```

The fork between RCF and IP Insights: both are anomaly detection, but **RCF is for anomalies in general numeric data, while IP Insights specializes in the "entity-IP" relationship.** For a login from an unusual IP, use IP Insights; for a sudden change in a general metric, use RCF.

| Comparison axis | Random Cut Forest | IP Insights |
|---|---|---|
| Input data | Numeric feature vectors | (entity, IPv4) pairs |
| Learning method | Isolation depth of random-cut trees | Embeddings + contrast with random negative samples |
| Output interpretation | Anomaly score (higher means more anomalous) | Usage likelihood (lower means more anomalous) |
| Typical scenario | Server metric spikes, transaction anomalies | Account takeover, bots, logins from unfamiliar regions |
| Real-time path | Kinesis Data Analytics RCF | Endpoint inference |

### Real-Time vs Batch Anomaly Detection Paths

| Requirement | Path | Rationale |
|---|---|---|
| Detect immediately in the stream | The `RANDOM_CUT_FOREST` SQL function in Kinesis Data Analytics | Computes scores inside the stream without model training or an endpoint |
| Score each online request | SageMaker RCF model → real-time endpoint | The application queries per request |
| Score a large volume of logs in a nightly batch | Batch Transform | No need to keep an endpoint running at all times |

If you see only the word "real-time" and always choose a SageMaker real-time endpoint, you will be wrong on a question that says to process within the streaming pipeline. If there is a **clue that the data arrives through a Kinesis stream**, Kinesis Data Analytics RCF is the more direct answer.

## Topic Models: LDA and NTM

They find **latent topics** and per-topic word distributions in documents without labels. Both are topic models, but their implementations differ.

| Item | LDA (Latent Dirichlet Allocation) | NTM (Neural Topic Model) |
|------|------|------|
| Basis | Probabilistic generative model | Neural network (autoencoder) |
| Training | CPU, single instance, relatively simple | Can use GPU, large-scale and complex |
| Input | BoW (document-word frequencies) | BoW |
| Strengths | Easy to interpret, small to medium data | Richer representation, large scale |

- Common input: **Bag-of-Words** (frequency counts per word index), RecordIO-protobuf or CSV
- The user specifies the number of topics (LDA: `num_topics`, NTM: `num_topics`)

Topic models assume that "each document is a mixture of several topics, and each topic is a distribution over words." LDA estimates this with a Bayesian probabilistic model, and NTM approximates the same goal with a neural network. Both are unsupervised, so there are no ground-truth topic labels, and the number of topics is a hyperparameter. When the exam asks "which of the two?", decide by data scale, GPU, and interpretability (large scale/GPU = NTM, simple/interpretable = LDA). This LDA (the topic model) **shares only the name with Linear Discriminant Analysis and is completely different.**

An option saying "LDA is a dimensionality reduction algorithm" is wrong in the SageMaker context. It is a classic trap that targets the abbreviation collision, and the SageMaker builtin LDA is a topic model.

## Preprocessing Requirements and Evaluation Methods

Unsupervised algorithms have no ground-truth labels, so they cannot be evaluated by "accuracy." What you judge them by is the exam point.

| Builtin | Scaling | Required preprocessing | Evaluation method |
|---|---|---|---|
| Random Cut Forest | Recommended (if feature units vary) | Convert to numeric, handle missing values | Anomaly score distribution and threshold, operational alert volume |
| IP Insights | Not applicable | Organize into (entity, IP) pairs, remove duplicates | Validate the low-score range against known incident cases |
| PCA | Mandatory (standardize and center) | Convert to numeric, handle missing values | Decide `num_components` by the cumulative explained variance ratio |
| LDA / NTM | Not applicable | Tokenize → remove stop words → BoW vectorization | Perplexity, human interpretability of the topic words |

| Decision | What to look at | Practical criterion |
|---|---|---|
| RCF threshold | What top percent of anomaly scores to treat as alerts | Match the alert volume the operations team can handle |
| Number of PCA components | Cumulative explained variance ratio curve | Usually the minimum number of components that exceeds 90~95% |
| Number of topics | Whether the top words of each topic are distinct from one another | If topics look overlapping, reduce `num_topics` |

An option that says to evaluate unsupervised results by "accuracy" is wrong, because there are no ground-truth labels. Judge RCF by the score threshold, PCA by explained variance, and topic models by perplexity and interpretability.

### Pipeline That Puts PCA in Front of Other Algorithms

```
[Original 500 features]
      │  Standardize (mean 0, variance 1)
      ▼
[PCA  algorithm_mode=randomized, num_components=30]
      │  30 principal components (mutually orthogonal, 95% variance preserved)
      ▼
[Downstream]  KNN (eases curse of dimensionality) / K-Means (stabilizes distances) / Visualization (2~3 components)
```

- With fewer dimensions, training and inference of distance-based models become faster and more stable.
- The cost is **loss of interpretability**. If a regulatory review requires explaining "which features had an influence," PCA is at a disadvantage.

## Question Clue → Answer Mapping Table

| Question clue | Answer direction | What gets pushed to wrong answers |
|---|---|---|
| "Rare anomalies without labels / real-time on a stream" | RCF (real-time = Kinesis Data Analytics RCF) | Supervised classification |
| "A user/account from an IP unlike usual" | IP Insights | RCF |
| "Reduce hundreds to thousands of features as model input" | PCA (`randomized` mode if huge) | K-Means, FM |
| "Discover topics in a pile of documents" | LDA / NTM | BlazingText supervised (needs labels) |
| "Topic discovery + large scale + GPU" | NTM | LDA |
| "Topic discovery + easy to interpret + small scale" | LDA | NTM |
| "LDA is Linear Discriminant Analysis" | Wrong (name collision) | — |
| "Skip scaling before PCA" | Wrong | — |
| "Evaluate unsupervised results by accuracy" | Wrong (no ground-truth labels) | — |
| "Enough anomaly labels have accumulated" | Supervised classification is also valid | Insisting on RCF alone |

Tomorrow we synthesize all of Week 6 from an algorithm-selection decision-making perspective.

## 📖 Glossary

- **Anomaly score**: A numeric value showing how different a record is from the usual. For RCF, a larger value means more anomalous.
- **Isolation**: Leaving only a single point through random cuts. The more anomalous a point is, the fewer cuts it takes to isolate it.
- **Principal component**: A new axis in the direction that explains the most variance in the data. They are mutually orthogonal.
- **Multicollinearity**: A phenomenon where features are strongly correlated with each other, making the coefficient interpretation of linear models unstable. PCA mitigates it.
- **subtract_mean (centering)**: A preprocessing step that subtracts the mean from each feature to align the origin. It is a prerequisite for PCA.
- **Entity**: In IP Insights, the subject observed paired with an IP, such as a user ID or account ID.
- **Random negative sampling**: A technique that artificially creates (entity, IP) combinations that were never actually observed and uses them for contrastive learning.
- **Bag-of-Words (BoW)**: A representation that discards word order and counts only occurrence frequencies to turn a document into a vector. It is the input to topic models.
- **num_topics**: The number of topics a topic model will find. With no ground truth, it is a hyperparameter the user sets.
- **LDA name collision**: The SageMaker builtin LDA is a topic model (Latent Dirichlet Allocation), and shares only the abbreviation with Linear Discriminant Analysis, the dimensionality reduction technique.

## 📝 Practice Questions

**Question 1.** You want to detect abnormal sudden changes (spikes) in a server metric stream in real time and without labels. Which combination is MOST suitable?

A) Dimensionality reduction with PCA followed by K-Means  
B) Random Cut Forest in Kinesis Data Analytics  
C) IP Insights  
D) BlazingText supervised  

**Answer: B**  
Explanation: For real-time anomaly detection on an unlabeled numeric stream, the RANDOM_CUT_FOREST function built into Kinesis Data Analytics is the standard approach. PCA + K-Means (A) is not dedicated to anomaly detection, IP Insights (C) specializes in entity-IP relationships, and BlazingText (D) is for text classification.

---

**Question 2.** A web service wants to detect the anomaly of "a specific user account logging in from an IP address completely different from usual." Which built-in algorithm is the MOST specialized for this?

A) Random Cut Forest  
B) PCA  
C) IP Insights  
D) LDA  

**Answer: C**  
Explanation: IP Insights is specialized to learn the association patterns between entities (users/accounts) and IPv4 addresses and detect unusual combinations. RCF (A) is for general numeric anomalies, PCA (B) is dimensionality reduction, and LDA (D) is a topic model.

---

**Question 3.** You want to compress 500 highly correlated numeric features to about 30 while preserving as much variance as possible, to use as input to a downstream model. Which built-in algorithm is MOST suitable?

A) PCA  
B) Factorization Machines  
C) DeepAR  
D) IP Insights  

**Answer: A**  
Explanation: Compressing many correlated features into a few variance-preserving principal components is exactly the definition of PCA (use randomized mode for very high dimensions). FM (B) is for sparse recommendation, DeepAR (C) is for time series, and IP Insights (D) is for anomaly detection.

---

**Question 4.** You want to discover latent topics in a large unlabeled document corpus. The data is very large and you want to accelerate training with GPUs. Which of LDA and NTM is more suitable, and which statement gives the correct reason?

A) LDA - it is neural network-based, so it is fast on GPU  
B) LDA - it is always more accurate than NTM  
C) NTM - it is a probabilistic generative model, so it is always easier to interpret  
D) NTM - it is neural network-based, which is advantageous for large scale and GPU use  

**Answer: D**  
Explanation: NTM is a neural network (autoencoder)-based topic model, which is advantageous for large-scale data and GPU use. The claim that LDA is neural network-based (A) is wrong (LDA is a probabilistic model), and the assertions that one is "always more accurate/easier to interpret" (B, C) have no basis either.

---

**Question 5.** Which is the MOST accurate statement about the name "LDA" in SageMaker?

A) SageMaker's built-in LDA is Linear Discriminant Analysis for dimensionality reduction  
B) LDA and NTM are both supervised classification algorithms  
C) LDA is dedicated to image classification  
D) SageMaker's built-in LDA is a topic model (Latent Dirichlet Allocation), sharing only the name with Linear Discriminant Analysis for dimensionality reduction  

**Answer: D**  
Explanation: SageMaker's built-in LDA is a topic model (Latent Dirichlet Allocation); it shares only the abbreviation with Linear Discriminant Analysis, which is used for dimensionality reduction, and is a different thing. So A is a confusion, and since LDA/NTM are unsupervised topic models, supervised classification (B) and image-only (C) are also wrong.

---
