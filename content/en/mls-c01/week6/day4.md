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

## 📝 연습 문제

**문제 1.** 서버 메트릭 스트림에서 평소와 다른 급변(스파이크)을 실시간으로, 레이블 없이 탐지하려 한다. 가장 적합한 조합은?

A) PCA로 차원 축소 후 K-Means  
B) Kinesis Data Analytics의 Random Cut Forest  
C) IP Insights  
D) BlazingText supervised  

**정답: B**  
해설: 레이블 없는 수치 스트림의 실시간 이상 탐지는 Kinesis Data Analytics에 내장된 RANDOM_CUT_FOREST 함수가 정석이다. PCA+K-Means(A)는 이상탐지 전용이 아니고, IP Insights(C)는 엔티티-IP 관계 특화, BlazingText(D)는 텍스트 분류용이다.

---

**문제 2.** 한 웹 서비스가 "특정 사용자 계정이 평소와 전혀 다른 IP 주소에서 로그인"하는 비정상을 탐지하려 한다. 가장 특화된 빌트인은?

A) Random Cut Forest  
B) PCA  
C) IP Insights  
D) LDA  

**정답: C**  
해설: IP Insights는 엔티티(사용자/계정)와 IPv4 주소의 연관 패턴을 학습해 평소와 다른 조합을 탐지하도록 특화돼 있다. RCF(A)는 일반 수치 이상, PCA(B)는 차원 축소, LDA(D)는 토픽 모델이다.

---

**문제 3.** 상관관계가 높은 500개의 수치 피처를 분산을 최대한 보존하며 30개 정도로 압축해 다운스트림 모델의 입력으로 쓰려 한다. 가장 적합한 빌트인은?

A) PCA  
B) Factorization Machines  
C) DeepAR  
D) IP Insights  

**정답: A**  
해설: 상관된 다수 피처를 분산 보존 소수 주성분으로 압축하는 것은 PCA의 정의 그대로다(매우 큰 차원이면 randomized 모드). FM(B)은 희소 추천, DeepAR(C)는 시계열, IP Insights(D)는 이상 탐지용이다.

---

**문제 4.** 라벨이 없는 대규모 문서 코퍼스에서 잠재 주제를 발견하려 한다. 데이터가 매우 크고 GPU로 학습을 가속하고 싶다. LDA와 NTM 중 더 적합한 것과 그 이유로 옳은 것은?

A) LDA — 신경망 기반이라 GPU에서 빠르다  
B) LDA — 항상 NTM보다 정확하다  
C) NTM — 확률적 생성 모델이라 항상 해석이 더 쉽다  
D) NTM — 신경망 기반으로 대규모·GPU 활용에 유리하다  

**정답: D**  
해설: NTM은 신경망(오토인코더) 기반 토픽 모델로 대규모 데이터와 GPU 활용에 유리하다. LDA가 신경망 기반(A)이라는 설명은 틀렸고(LDA는 확률 모델), "항상 더 정확/해석 쉽다"(B, C)는 단정도 근거가 없다.

---

**문제 5.** SageMaker에서 "LDA"라는 이름과 관련해 가장 정확한 설명은?

A) SageMaker 빌트인 LDA는 차원 축소용 선형판별분석이다  
B) LDA와 NTM은 모두 지도학습 분류 알고리즘이다  
C) LDA는 이미지 분류 전용이다  
D) SageMaker 빌트인 LDA는 토픽 모델(Latent Dirichlet Allocation)이며, 차원축소의 선형판별분석과 이름만 같다  

**정답: D**  
해설: SageMaker의 빌트인 LDA는 토픽 모델(Latent Dirichlet Allocation)이며, 차원 축소에 쓰는 선형판별분석(Linear Discriminant Analysis)과는 약어만 같고 다른 것이다. 따라서 A는 혼동, LDA/NTM은 비지도 토픽 모델이므로 지도 분류(B)·이미지 전용(C)도 틀렸다.

---
