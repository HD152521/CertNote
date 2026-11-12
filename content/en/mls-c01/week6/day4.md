# Day 4 - Unsupervised/Anomaly Detection: RCF, PCA, IP Insights, Topic Models (LDA/NTM)

Today we consolidate unsupervised builtins that handle structure, anomaly, dimension, and topic without labels. Tests hint at these through signals "no labels / rare event / too many dimensions / discover topics." The key is distinguishing each algorithm's input/core parameters/common confusions.

## Random Cut Forest (RCF) — Anomaly Detection

Create trees by cutting data randomly, assign high **anomaly scores** to points that are easy to isolate (rare).

- **Use**: Anomaly detection (unsupervised). Time series spikes, rare patterns
- **Input**: CSV, RecordIO-protobuf
- **Output**: Each record's anomaly score (higher = more anomalous)
- **Streaming**: Kinesis Data Analytics has `RANDOM_CUT_FOREST` function built-in → real-time anomaly detection

```text
Key hyperparameters:
  num_trees              tree count (more = stable)
  num_samples_per_tree   samples per tree
  feature_dim            feature dimension
```

> 💡 **Related Theory**: RCF's intuition: "anomalies isolate faster than normal." Normal points are in dense regions, need many cuts to separate. Rare points isolate from few random cuts. This isolation depth becomes a score. No labels needed, responds to new anomaly forms → represents the "almost no labels / changing anomalies" problem from Day 1. Real-time? Recall Kinesis Data Analytics RCF SQL function.

## PCA — Dimensionality Reduction

Compress many correlated features into fewer **principal components** preserving variance maximally.

- **Use**: Dimensionality reduction (unsupervised). Visualization, lighten downstream model input, relax multicollinearity
- **Input**: RecordIO-protobuf, CSV
- **Modes**: `regular`(mid dimensions), `randomized`(huge dimensions, approximate, fast)

```text
Key hyperparameters:
  num_components     principal components to keep
  algorithm_mode     regular | randomized
  subtract_mean      mean removal (centering)
```

- Sensitive to scale → usually **scale/center first**
- PCA is unsupervised, doesn't use labels — need labeled dimensionality reduction? That's LDA(Linear Discriminant Analysis), but note: SageMaker LDA is topic modeling (Latent Dirichlet Allocation), name collision!

## IP Insights — Entity-IP Anomaly Detection

Learn association between **entity**(user/account) and IPv4, detect unusual combinations.

- **Use**: Abnormal login, account takeover, bot detection (unsupervised)
- **Input**: CSV — `(entity, IP)` pairs
- **Output**: Likelihood that entity uses that IP (low = anomalous)
- **Technique**: Neural net embedding learns entity-IP patterns, contrastive with random negative samples

```text
Key hyperparameters:
  num_entity_vectors   entity embedding hash space size
  vector_dim           embedding dimension
  num_ip_encoder_layers
  random_negative_sampling_rate
```

RCF vs IP Insights: Both anomaly detection, but **RCF is general numeric data anomaly, IP Insights specializes in "entity-IP" relationships**. Abnormal login IP? → IP Insights. General metric spike? → RCF.

## Topic Models: LDA and NTM

Find **latent topics** and word distributions per topic from documents without labels. Both topic models but different implementations.

| Item | LDA (Latent Dirichlet Allocation) | NTM (Neural Topic Model) |
|------|------|------|
| Foundation | Probabilistic generative model | Neural network (autoencoder) |
| Learning | CPU single, relatively simple | GPU capable, large-scale complex |
| Input | BoW (document-word counts) | BoW |
| Strength | Interpretable, small-to-mid data | Richer representations, large-scale |

- Common input: **Bag-of-Words** (word index frequency counts), RecordIO-protobuf or CSV
- User specifies topic count (LDA: `num_topics`, NTM: `num_topics`)

> 💡 **Related Theory**: Topic models assume "each document is a mixture of topics, each topic is a word distribution." LDA estimates this as Bayesian prob model, NTM approximates same goal via neural net. Both unsupervised — no ground-truth topic labels, topic count is hyperparameter. Test asks "which of two?" → break by data scale/GPU/interpretability (large/GPU=NTM, simple/interpretable=LDA). This LDA (topic model) is completely different from Linear Discriminant Analysis (LDA), same name only!

## Unsupervised Builtin Mapping Summary

| Algorithm | Task | Signal Words | Input |
|------|------|------|------|
| Random Cut Forest | Anomaly detection (general numeric) | "rare events / spike / realtime" | CSV, protobuf |
| IP Insights | Anomaly detection (entity-IP) | "abnormal login / account IP" | (entity, IP) CSV |
| PCA | Dimensionality reduction | "too many features / compress / visualize" | protobuf, CSV |
| LDA | Topic model (probabilistic) | "topic discovery / small data / interpret" | BoW |
| NTM | Topic model (neural net) | "topic discovery / large-scale / GPU" | BoW |

## Test Tips

- "No-label rare anomaly / realtime stream" → RCF (realtime = Kinesis Data Analytics RCF)
- "User/account at unusual IP" → IP Insights
- "Hundreds-to-thousands features, shrink model input" → PCA (huge = randomized mode)
- "Documents → discover topics" → LDA/NTM, split by scale/GPU/interpretability
- LDA name trap: Topic model LDA ≠ dimensionality reduction Linear Discriminant Analysis

## Summary

Today we consolidated unsupervised/anomaly builtins: RCF(general anomaly), IP Insights(entity-IP anomaly), PCA(dimensionality reduction), LDA/NTM(topic models). Each answers "what do we discover/detect/compress when there's no label?" Next — synthesize Week 6 decision-making for algorithm selection.

---

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
