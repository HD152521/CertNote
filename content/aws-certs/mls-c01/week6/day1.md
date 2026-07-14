# Day 1 - Algorithm Selection: Problem Type to Mapping

Week 6 begins Domain 3 (Modeling). The first decision in modeling is "which algorithm?" and MLS-C01 narrows this through **problem type → algorithm class → SageMaker builtin** sequencing. Today we learn to translate business problems into ML problem types and map algorithm candidates for each type.

## Translating Business Problems to ML Types

Test text is almost always given in business language. The first step is converting that to standard ML problem type.

```text
"Identify customers likely to churn early"         → Binary classification (churn yes/no)
"Categorize emails as spam/normal/promotional"    → Multi-class classification
"Forecast tomorrow's revenue amount"               → Regression
"Automatically discover similar user groups"       → Clustering (unsupervised)
"Recommend products never seen before"             → Recommendation / collaborative filtering
"Detect unusual transactions"                      → Anomaly detection
"Extract topics from document pile"                → Topic modeling (unsupervised)
```

Discriminating signals:
- **Do we have labels (answers)?** Yes → supervised, no → unsupervised
- **Is output categorical or numeric?** Categorical = classification, continuous numeric = regression
- **Is it "find groups/patterns" or "predict"?** Find = clustering/topic, predict = classification/regression

> 💡 **Related Theory**: Boundary between supervised/unsupervised/reinforcement lies on "existence of label." Classification/regression learn input-output pairs (supervised), clustering/dimensionality reduction/topic modeling/anomaly detection (mostly) find structure without labels (unsupervised). Recommendation handles user-item interaction matrices — technically unsupervised from a collaborative filtering view, but becomes supervised regression if using explicit ratings as target. Reinforcement learning is separate, learning policy from reward signals (SageMaker RL).

## Classification

Output is a **discrete category**. Binary/multi-class/multi-label types exist.

| Sub-type | Example | Representative Algorithms |
|------|------|------|
| Binary classification | Churn, fraud | XGBoost, Linear Learner, KNN |
| Multi-class classification | Product category | XGBoost, Linear Learner |
| Multi-label | Multiple tags per image | Neural networks, Image Classification |
| Text classification | Sentiment/topic | BlazingText |

Key metric: Accuracy alone often insufficient. Imbalanced data (fraud 1%) needs precision, recall, F1, AUC.

## Regression

Output is **continuous numeric**. Revenue, price, demand forecasting.

- Candidates: **XGBoost(objective=reg:squarederror)**, **Linear Learner(predictor_type=regressor)**
- Time series demand forecasts with time-axis priority fit **DeepAR**(Day 3) or Amazon Forecast better than forcing general regression
- Metrics: RMSE, MAE, R². If sensitive to outliers, watch MAE alongside

## Clustering

Bundle data into natural groups without labels. Customer segmentation, document grouping.

- Candidates: **K-Means**(SageMaker builtin). Specify cluster count k beforehand
- Evaluation: No external truth, so use internal metrics — silhouette coefficient, elbow (WCSS) to choose k

## Recommendation

Predict preferences from user-item interactions.

- Candidates: **Factorization Machines**(strong on sparse high-dimensional interactions), neural recommendation networks
- Core challenges: cold start, sparsity (most cells empty)

## Anomaly Detection

Find rare events deviating from normal. Often approached as unsupervised with scarce anomaly labels.

- Candidates: **Random Cut Forest (RCF)**, **IP Insights**(entity-IP anomaly), streaming via Kinesis Data Analytics RCF
- Extreme imbalance (anomaly 0.1%) makes supervised classification hard

> 💡 **Related Theory**: "Can't we solve anomaly detection as supervised classification?" is a common trap. If sufficient anomaly labels exist and patterns are stable, supervised classification works. Reality: anomalies are rare, constantly morphing into new forms. Unsupervised anomaly detection learning only normal (RCF etc.) and measuring deviation is more robust. Signal words "almost no labels / new anomaly forms" → RCF over supervised.

## At-a-Glance Mapping Table

| Problem Type | Supervised/Unsupervised | SageMaker Builtin Candidates |
|------|------|------|
| Tabular classification/regression | Supervised | XGBoost, Linear Learner |
| Distance-based classification/regression | Supervised | KNN |
| Clustering | Unsupervised | K-Means |
| Recommendation (sparse interaction) | Supervised/Unsupervised | Factorization Machines |
| Text classification/embedding | Supervised/Unsupervised | BlazingText |
| Image classification | Supervised | Image Classification |
| Time series forecasting | Supervised | DeepAR |
| Anomaly detection | Unsupervised | Random Cut Forest, IP Insights |
| Dimensionality reduction | Unsupervised | PCA |
| Topic modeling | Unsupervised | LDA, NTM |

## Additional Considerations in Algorithm Selection

Choice doesn't end at problem type. Also consider:

- **Data shape**: Table vs text vs image vs time series → strongly constrains algorithm class
- **Data size/sparsity**: Huge sparse data → Linear Learner/FM, mid-size tabular → XGBoost
- **Interpretability**: If regulation/explanation needed → linear models advantaged
- **Learning/inference cost**: DL = GPU/time cost↑. Avoid overkill for simple problems (KISS)

## Test Tips

- From text, first confirm **output form**(category/numeric/group/recommendation/anomaly) — narrows candidates by half
- "No labels / discover groups / find topics" → unsupervised signal
- "Time series / future value / seasonality" → DeepAR/Forecast signal, not general regression
- "Text / image" → BlazingText/Image Classification, not general XGBoost
- "Extremely rare / new anomaly forms" → RCF anomaly detection

## Summary

Today we covered the first gate of modeling — problem type identification and algorithm mapping. Core flow: **business problem → output form determines ML type → data shape/size/interpretability narrows algorithm**. Starting tomorrow, we dig deep into each builtin algorithm (XGBoost, Linear Learner, K-Means, KNN) from this mapping table.

---

## 📝 연습 문제

**문제 1.** 한 통신사가 "다음 달 해지할 가능성이 높은 고객을 미리 식별"하려 한다. 과거 고객의 해지 여부 레이블이 충분히 있다. 이 문제의 ML 유형으로 가장 적절한 것은?

A) 비지도 군집  
B) 이진 분류  
C) 시계열 예측  
D) 토픽 모델링  

**정답: B**  
해설: 출력이 "해지/유지"라는 두 범주이고 레이블이 있으므로 지도학습 이진 분류다. 레이블이 있으므로 비지도 군집(A)·토픽(D)이 아니며, 출력이 연속 수치가 아니므로 시계열 예측(C)도 아니다.

---

**문제 2.** 신용카드 거래에서 사기를 잡으려 한다. 사기 레이블은 거의 없고, 사기 수법은 계속 새로운 형태로 바뀐다. 가장 적합한 접근은?

A) 정상/사기 레이블로 다중 분류 학습  
B) K-Means로 고객을 5개 그룹으로 군집  
C) Random Cut Forest 같은 비지도 이상 탐지  
D) DeepAR로 거래 금액을 예측  

**정답: C**  
해설: 레이블이 거의 없고 패턴이 계속 변하므로, 정상에서 벗어남을 측정하는 비지도 이상 탐지가 견고하다. 레이블이 부족해 지도 분류(A)는 어렵고, 군집(B)은 사기 식별 목적과 맞지 않으며, DeepAR(D)는 시계열 값 예측용이다.

---

**문제 3.** "수천 개 뉴스 기사를 사람이 라벨을 달지 않은 상태에서 자동으로 주제별로 묶고, 각 주제를 구성하는 단어를 알고 싶다." 가장 적절한 알고리즘 부류는?

A) Image Classification  
B) Factorization Machines  
C) Linear Learner 회귀  
D) 토픽 모델링(LDA/NTM)  

**정답: D**  
해설: 레이블 없이 문서에서 주제를 발견하고 주제별 단어 분포를 얻는 것은 토픽 모델링(LDA/NTM)의 전형적 과제다. 이미지(A), 추천(B), 연속값 회귀(C)는 텍스트 주제 발견과 무관하다.

---

**문제 4.** 다음 중 "출력이 연속 수치인 회귀 문제"에 해당하는 것은?

A) 내일의 매장 매출 금액 예측  
B) 이메일을 스팸/정상으로 분류  
C) 고객을 비슷한 군집으로 묶기  
D) 평소와 다른 로그인 패턴 탐지  

**정답: A**  
해설: 매출 "금액"은 연속 수치이므로 회귀다. 스팸/정상(B)은 분류, 군집(C)은 비지도 클러스터링, 비정상 패턴 탐지(D)는 이상 탐지에 해당한다.

---

**문제 5.** 알고리즘을 좁히는 1차 기준으로 시험에서 가장 먼저 확인해야 할 단서는?

A) 사용할 인스턴스 타입  
B) 팀이 선호하는 프로그래밍 언어  
C) 모델의 출력 형태(범주/수치/그룹/추천/이상)와 레이블 유무  
D) 리전별 서비스 가용성  

**정답: C**  
해설: 출력 형태와 레이블 유무가 ML 문제 유형을 결정하고, 유형이 정해지면 후보 알고리즘이 크게 좁혀진다. 인스턴스 타입(A)·언어(B)·리전(D)은 알고리즘 부류 선택의 1차 기준이 아니다.

---
