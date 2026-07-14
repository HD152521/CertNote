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

## 📝 연습 문제

**문제 1.** 1,000개 매장의 일별 판매 데이터가 있고, 최근 오픈해 데이터가 짧은 신규 매장의 향후 4주 수요를 P10/P50/P90 구간으로 예측하려 한다. 가장 적합한 빌트인은?

A) DeepAR  
B) XGBoost  
C) BlazingText  
D) K-Means  

**정답: A**  
해설: DeepAR는 다수의 관련 시계열을 함께 학습해 신규·짧은 시계열도 다른 매장 패턴으로 예측하며, 분위수(P10/P50/P90) 확률 예측을 제공한다. XGBoost(B)는 시계열 구조를 자연히 다루지 못하고, BlazingText(C)는 텍스트, K-Means(D)는 군집용이다.

---

**문제 2.** 고객 리뷰 문서를 "긍정/부정/중립"으로 분류하는 모델을 대규모 코퍼스로 매우 빠르게 학습하려 한다. 가장 적합한 빌트인과 모드는?

A) Image Classification  
B) Factorization Machines  
C) BlazingText, supervised(text classification) 모드  
D) PCA  

**정답: C**  
해설: 레이블이 있는 문서를 카테고리로 분류하는 과제는 BlazingText의 supervised 모드(fastText 기반)가 적합하며 GPU로 매우 빠르다. 이미지(A), 희소 추천(B), 차원축소(D)는 텍스트 분류 과제와 맞지 않는다.

---

**문제 3.** 약 2,000장의 작은 이미지 데이터셋으로 제품 결함 유무를 분류하려 한다. 데이터가 적어 성능이 걱정된다. 가장 권장되는 접근은?

A) 처음부터(use_pretrained_model=0) 깊은 CNN 학습  
B) 전이 학습(use_pretrained_model=1)과 데이터 증강 사용  
C) Linear Learner로 픽셀을 그대로 입력  
D) DeepAR로 이미지 시퀀스 예측  

**정답: B**  
해설: 데이터가 적을 때는 ImageNet 사전학습 가중치에서 시작하는 전이 학습과 증강이 정석이다. 처음부터 학습(A)은 적은 데이터에서 과적합되기 쉽고, 픽셀을 선형 모델에 직접(C)·DeepAR(D)는 이미지 분류에 부적합하다.

---

**문제 4.** 사용자 ID·아이템 ID·맥락 피처를 One-Hot으로 인코딩해 매우 희소하고 고차원인 클릭률 예측 데이터를 만들었다. 상호작용을 효율적으로 학습할 빌트인과 권장 입력 포맷은?

A) Factorization Machines, RecordIO-protobuf  
B) XGBoost, CSV  
C) K-Means, RecordIO-protobuf  
D) BlazingText, 텍스트 파일  

**정답: A**  
해설: Factorization Machines는 초고차원·희소 데이터의 2차 상호작용을 효율적으로 모델링하며, 희소 데이터에 최적화된 RecordIO-protobuf(float32) 입력을 권장한다. XGBoost+CSV(B)는 초고차원 희소 데이터에 비효율적이고, K-Means(C)·BlazingText(D)는 추천 과제용이 아니다.

---

**문제 5.** BlazingText의 Word2Vec 모드를 사용하는 가장 적절한 상황은?

A) 문서를 사전 정의된 카테고리로 분류할 때  
B) 시계열 미래 값을 예측할 때  
C) 이미지에서 객체를 탐지할 때  
D) 단어들을 벡터로 임베딩해 의미적으로 유사한 단어를 찾을 때  

**정답: D**  
해설: Word2Vec 모드는 레이블 없이 단어를 벡터 공간에 임베딩해 유사 단어 탐색이나 다운스트림 피처 생성에 쓴다. 문서 분류(A)는 supervised 모드, 시계열(B)·이미지(C)는 BlazingText의 영역이 아니다.

---
