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

## 📝 연습 문제

**문제 1.** 다음 중 "데이터 형태와 알고리즘"의 짝이 가장 적절한 것은?

A) 시계열 수요 예측 → BlazingText  
B) 정형 데이터 비선형 분류 → PCA  
C) 라벨 있는 이미지 분류 → Image Classification(전이학습)  
D) 단어 임베딩 → DeepAR  

**정답: C**  
해설: 라벨 있는 이미지 분류는 전이학습 기반 Image Classification이 정석이다. 시계열은 DeepAR(A는 틀림), 정형 비선형 분류는 XGBoost(B의 PCA는 차원축소), 단어 임베딩은 BlazingText Word2Vec(D의 DeepAR는 시계열)이다.

---

**문제 2.** 한 팀이 XGBoost로 정형 데이터 분류 모델을 만들면서 "거리 왜곡을 막기 위해 반드시 표준화해야 한다"고 주장한다. 이 주장에 대한 평가로 옳은 것은?

A) 옳다. 모든 알고리즘은 스케일링이 필수다  
B) 틀리다. XGBoost는 트리 기반이라 스케일에 불변이므로 스케일링이 필수가 아니다  
C) 옳다. XGBoost는 거리 기반 알고리즘이다  
D) 틀리다. XGBoost는 텍스트 전용이라 스케일 개념이 없다  

**정답: B**  
해설: XGBoost는 피처를 독립적으로 임계값 분할하는 트리 기반이라 스케일에 불변이며 스케일링이 필수가 아니다. 모든 알고리즘이 필수(A)는 거짓이고, XGBoost는 거리 기반이 아니며(C), 텍스트 전용(D)도 아니다.

---

**문제 3.** "레이블이 거의 없고 계속 새로운 형태로 나타나는 네트워크 트래픽 이상을, 일반 수치 메트릭에서 비지도로 탐지"하려 한다. 가장 적합한 빌트인은?

A) Random Cut Forest  
B) Factorization Machines  
C) Linear Learner 분류  
D) K-Means로 2개 군집  

**정답: A**  
해설: 레이블 없는 일반 수치 데이터의 이상 탐지는 RCF가 정석이며, 새로운 형태의 이상에도 점수로 반응한다. FM(B)은 추천, Linear Learner 분류(C)는 레이블이 필요하고, K-Means 2군집(D)은 이상 탐지 목적과 맞지 않는다.

---

**문제 4.** 다음 비교 중 설명이 틀린 것은?

A) K-Means는 비지도 군집, KNN은 지도 예측이다  
B) DeepAR는 다수 관련 시계열을 함께 학습하고 확률적 예측을 제공한다  
C) BlazingText supervised는 문서 분류, Word2Vec은 단어 임베딩이다  
D) IP Insights는 일반 수치 스트림의 스파이크 탐지에 특화된 알고리즘이다  

**정답: D**  
해설: IP Insights는 "엔티티-IP" 관계 이상에 특화돼 있고, 일반 수치 스트림 스파이크는 RCF가 담당한다. A·B·C는 모두 올바른 설명이다.

---

**문제 5.** 사용자-아이템 상호작용이 매우 희소한 추천 데이터에서 2차 상호작용을 효율적으로 학습하려 한다. 알고리즘과 권장 입력 포맷의 올바른 짝은?

A) XGBoost, CSV  
B) PCA, BoW  
C) Factorization Machines, RecordIO-protobuf  
D) DeepAR, JSON Lines  

**정답: C**  
해설: 초고차원·희소 상호작용 추천은 Factorization Machines가 적합하며 희소 데이터에 최적화된 RecordIO-protobuf를 권장한다. XGBoost+CSV(A)는 초고차원 희소에 비효율적, PCA(B)는 차원축소, DeepAR(D)는 시계열 예측이다.

---
