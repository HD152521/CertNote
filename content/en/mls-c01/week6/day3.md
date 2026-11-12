# Day 3 - SageMaker Builtin 2: Text, Image, Time Series, Recommendation

Yesterday we covered tabular data algorithms. Today we tackle specialized builtins for when data shape is special — **text, image, time series, sparse interactions**. Exams push specialized algorithms — text/image/time series signals mean not XGBoost but these specialized builtins.

## BlazingText — Text Classification and Word Embeddings

Word2Vec and text classification GPU-accelerated builtin. Two modes.

- **Word2Vec (unsupervised)**: Embed words into vectors. Find similar words, generate downstream features
- **Text Classification (supervised)**: Document → label (sentiment, topic, etc). fastText-based

```text
Mode decision:
  Labels present, classify documents → supervised (text classification)
  No labels, just word vectors  → Word2Vec (cbow / skipgram / batch_skipgram)
```

- **Input**: Text files (whitespace tokenization). Supervised mode: `__label__<label> sentence` format
- **Strengths**: Dominates speed on massive corpora, multilingual, handles OOV (out-of-vocab) with subword

> 💡 **Related Theory**: BlazingText Word2Vec uses "predict center from context (CBOW) or context from center (skip-gram)" to place semantically similar words close in vector space. Learned embeddings themselves are used for word similarity search or become input features for other models. On exams, "semantic word similarity" / "embedding" signals Word2Vec mode, "classify documents to categories" signals supervised mode.

## Image Classification — Image Classification

CNN (ResNet)-based builtin for classifying images into one or more labels.

- **Use**: Single/multi-label image classification
- **Input**: RecordIO or images (.jpg/.png) + .lst list file
- **Key technique**: **Transfer Learning** — start from ImageNet pre-trained weights with `use_pretrained_model=1` for good performance even on small data

```text
Key hyperparameters:
  num_classes, num_training_samples
  use_pretrained_model   0(from scratch) | 1(transfer learning)
  image_shape, learning_rate, mini_batch_size
  augmentation_type      image augmentation (crop/color etc)
```

- Limited data: transfer learning + data augmentation is standard
- Need object locations too: not classification but **Object Detection** builtin; pixel-level → **Semantic Segmentation**

## DeepAR — Time Series Forecasting

RNN-based time series forecasting builtin. Core strength is **learning many related series together** to share patterns, not modeling one series alone.

- **Use**: Predict future values for demand/revenue/traffic, probabilistic (quantile) forecasts
- **Input**: JSON Lines — each series has `start`, `target`, optional `cat` (category), `dynamic_feat` (covariates)
- **Strengths**: More accurate on many related series (e.g., thousands of stores) than individual modeling. Even new/short series (cold start) can forecast using patterns learned from similar series

```text
Key hyperparameters:
  context_length      length of past input window
  prediction_length   length of forecast window
  epochs, num_cells, num_layers
  likelihood          output distribution (Gaussian etc)
```

> 💡 **Related Theory**: Traditional ARIMA/exponential smoothing model each series separately, but DeepAR trains many related series in one model for **cross-learn seasonality, trends**. So even short new items can borrow patterns from similar items. Outputs distribution (quantiles) not point estimates, giving P10/P50/P90 uncertainty bands. On exams, "thousands of related series" / "new product demand" / "probabilistic forecast intervals" signal DeepAR. For more managed service, Amazon Forecast.

## Factorization Machines — Sparse High-Dimensional Recommendation

Efficiently model feature interactions (2-way) in **very sparse, high-dimensional** data like user-item.

- **Use**: Recommendation (click prediction, rating prediction), sparse classification/regression
- **Input**: RecordIO-protobuf (float32). **Optimized for sparse data**, CSV not recommended
- **Strengths**: Learns interactions efficiently even in ultra-high-dimensional sparse input exploded by One-Hot

```text
Key hyperparameters:
  num_factors        latent factor dimension
  predictor_type     binary_classifier | regressor
  bias/linear/factors   regularization, init settings per term
```

In recommendation context, FM generalizes collaborative filtering: feed user ID, item ID as One-Hot and it behaves like matrix factorization, can also include additional features (time, context).

## Data Shape Mapping Summary

| Data Shape | Task | Builtin | Key Point |
|------|------|------|------|
| Text | Classification | BlazingText (supervised) | `__label__` format |
| Text | Embedding/Similarity | BlazingText (Word2Vec) | cbow/skipgram |
| Image | Classification | Image Classification | transfer learning, augmentation |
| Image | Locate objects | Object Detection | not classification |
| Time series | Forecast | DeepAR | share many series, probabilistic |
| Sparse interactions | Recommend | Factorization Machines | RecordIO-protobuf, sparse-optimal |

## Exam Tips

- "Classify text to categories" → BlazingText supervised; "word semantic similarity/embedding" → Word2Vec
- "Image + limited data" → Image Classification + **transfer learning/augmentation**
- "Image locate objects" → Object Detection (not classification)
- "Thousands related series / new item demand / P90 bands" → DeepAR
- "User-item / very sparse / recommend" → Factorization Machines (+ RecordIO-protobuf)

## Summary

Today we organized builtins for special data shapes. Text (BlazingText), image (Image Classification, transfer learning), time series (DeepAR, many series, probabilistic), sparse recommendation (Factorization Machines, RecordIO-protobuf) are each solution signals. Tomorrow covers unsupervised, anomaly detection (RCF, PCA, IP Insights, LDA/NTM).

---

## 📝 Practice Questions

**Question 1.** You have daily sales data for 1,000 stores and want to forecast the next 4 weeks of demand, as P10/P50/P90 intervals, for a newly opened store with a short data history. Which built-in algorithm is MOST suitable?

A) DeepAR  
B) XGBoost  
C) BlazingText  
D) K-Means  

**Answer: A**  
Explanation: DeepAR trains on many related time series together, so it can forecast new and short time series using patterns from other stores, and it provides quantile (P10/P50/P90) probabilistic forecasts. XGBoost (B) does not naturally handle time series structure, BlazingText (C) is for text, and K-Means (D) is for clustering.

---

**Question 2.** You want to train a model that classifies customer review documents as "positive/negative/neutral" on a large corpus very quickly. Which built-in algorithm and mode are MOST suitable?

A) Image Classification  
B) Factorization Machines  
C) BlazingText, supervised (text classification) mode  
D) PCA  

**Answer: C**  
Explanation: For the task of classifying labeled documents into categories, BlazingText's supervised mode (fastText-based) is suitable and is very fast on GPU. Images (A), sparse recommendation (B), and dimensionality reduction (D) do not fit a text classification task.

---

**Question 3.** You want to classify product defects using a small image dataset of about 2,000 images. With so little data, you are worried about performance. Which approach is MOST recommended?

A) Train a deep CNN from scratch (use_pretrained_model=0)  
B) Use transfer learning (use_pretrained_model=1) and data augmentation  
C) Feed pixels directly into Linear Learner  
D) Predict image sequences with DeepAR  

**Answer: B**  
Explanation: When data is scarce, transfer learning that starts from ImageNet pretrained weights plus augmentation is the standard approach. Training from scratch (A) easily overfits on little data, and feeding pixels directly to a linear model (C) or using DeepAR (D) is unsuitable for image classification.

---

**Question 4.** You one-hot encoded user ID, item ID, and context features to create very sparse, high-dimensional click-through-rate prediction data. Which built-in algorithm efficiently learns the interactions, and what is the recommended input format?

A) Factorization Machines, RecordIO-protobuf  
B) XGBoost, CSV  
C) K-Means, RecordIO-protobuf  
D) BlazingText, text file  

**Answer: A**  
Explanation: Factorization Machines efficiently model second-order interactions in ultra-high-dimensional sparse data, and RecordIO-protobuf (float32) input, optimized for sparse data, is recommended. XGBoost with CSV (B) is inefficient for ultra-high-dimensional sparse data, and K-Means (C) and BlazingText (D) are not for recommendation tasks.

---

**Question 5.** In which situation is it MOST appropriate to use BlazingText's Word2Vec mode?

A) When classifying documents into predefined categories  
B) When predicting future time series values  
C) When detecting objects in images  
D) When embedding words as vectors to find semantically similar words  

**Answer: D**  
Explanation: Word2Vec mode embeds words in a vector space without labels and is used for finding similar words or generating downstream features. Document classification (A) uses supervised mode, and time series (B) and images (C) are outside BlazingText's domain.

---
