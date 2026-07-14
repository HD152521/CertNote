# Day 2 - Domain 3 Integration: Modeling (Algorithm to Evaluation)

Domain 3: **ML's core** — choose algorithm, structure (DL), tune, evaluate. Today: integrated **problem → algorithm → learn → evaluate** flow.

## End-to-End Modeling

```text
[Business problem]
   │
   ├─ 1) DEFINE ML TYPE
   │     Label? → supervised (classification/regression) or unsupervised
   │     Output? → category/number/cluster/anomaly/recommendation
   │
   ├─ 2) PICK ALGORITHM
   │     Tabular → XGBoost (default)
   │     Image → CNN
   │     Sequence/TS → RNN/LSTM or DeepAR
   │     Text → BlazingText
   │
   ├─ 3) STRUCTURE (if DL)
   │     Activate: ReLU (hidden) → Sigmoid/Softmax/linear (output)
   │     Loss: cross-entropy (classify) or MSE (regress)
   │
   ├─ 4) OPTIMIZE/TUNE
   │     Hyperparameter search: Bayesian (efficient) or Hyperband (DL)
   │     Diagnosis: overfit → regularize; underfit → more capacity
   │     Learning rate: NaN → too high; stalled → too low
   │
   └─ 5) EVALUATE
         Classify: precision/recall/F1 (imbalance-aware)
         Regress: RMSE/MAE/R²
         Residual plot: patterns = model assumptions broken
         Confusion: where do errors cluster?
```

## Algorithm Selection by Data Shape

| Data | Default | Alt |
|------|------|------|
| Tabular | XGBoost | Linear |
| Image | CNN | ResNet (transfer) |
| Sequence | LSTM | GRU |
| Time series | DeepAR | Prophet |
| Text | BlazingText | Transformer |
| Unlabeled | Unsuitable | K-Means (cluster) |
| Rare anomaly | Unsuitable | RCF |

## Learning Pathway

1. **Diagnose curve pattern**:
   - Train low, val low → underfit (need capacity/data)
   - Train low, val high → overfitting (regularize/early-stop)

2. **Tune**:
   - Learning rate: no NaN, loss falling
   - Regularization: dropout/L1/L2 if overfitting
   - Batch size: balance speed/stability

3. **Evaluate**:
   - Metric per problem (imbalance=F1, regression=MAE)
   - Residual plot: random or patterns?
   - Cross-validate: general or data-lucky?

## Metric Selection by Business Cost

| Scenario | Metric |
|------|------|
| Fraud (FN costly) | Recall / F1 |
| Spam (FP costly) | Precision |
| Both equal | F1 |
| Regression outliers | MAE |
| Regression catastrophic | RMSE |

## Summary

Domain 3 = problem → algorithm → DL structure → tuning → evaluation. Pick by data shape (tabular=XGBoost, image=CNN, seq=LSTM). Diagnose curves (underfit vs overfit). Tune hyperparameters. Evaluate per business cost. Residual plots reveal hidden failures.

Tomorrow: Domain 4 (deployment).

## 📝 연습 문제

**문제 1.** 정형 표 형태의 고객 데이터(수치·범주 혼합, 일부 결측)로 이탈 여부를 예측하려 한다. 가장 먼저 시도할 SageMaker 빌트인 알고리즘으로 가장 적절한 것은?

A) XGBoost  
B) Image Classification  
C) DeepAR  
D) Random Cut Forest  

**정답: A**  
해설: 정형 표 데이터의 분류·회귀에서 결측·혼합 타입·비선형 상호작용을 잘 다루는 XGBoost가 강한 기본값이다. Image Classification(B)은 이미지용, DeepAR(C)은 시계열 예측, RCF(D)는 이상 탐지로 이 문제에 맞지 않는다.

---

**문제 2.** 3개 클래스(저/중/고 위험)로 분류하는 신경망의 출력층을 설계한다. 올바른 활성화 함수는?

A) Sigmoid  
B) ReLU  
C) Softmax  
D) 활성화 없음(선형)  

**정답: C**  
해설: 다중 클래스 분류 출력은 합이 1인 확률 벡터를 내는 Softmax가 정답이다. Sigmoid(A)는 이진 분류 출력, ReLU(B)는 은닉층용, 선형(D)은 회귀 출력에 쓴다.

---

**문제 3.** 모델의 학습 데이터 정확도는 98%인데 검증 데이터 정확도는 72%로 큰 격차가 있다. 가장 우선해야 할 대응은?

A) 모델 복잡도를 더 높이고 학습을 더 길게 한다  
B) 학습률을 10배 키운다  
C) 출력 활성화를 Softmax에서 Sigmoid로 바꾼다  
D) 정규화 강화·드롭아웃 추가·조기 종료 등 과적합 억제를 적용한다  

**정답: D**  
해설: 학습은 높고 검증이 낮은 큰 격차는 과적합의 전형으로 정규화·드롭아웃·조기 종료·데이터 증강이 정석 대응이다. 복잡도 증가(A)는 과적합을 악화시키고, 학습률 급증(B)은 발산을 유발하며, 출력 활성화 변경(C)은 과적합과 무관하다.

---

**문제 4.** SageMaker Automatic Model Tuning에서 적은 학습 잡 예산으로 효율적으로 좋은 하이퍼파라미터를 찾고 싶다. 권장되는 탐색 전략과 그 이유로 옳은 것은?

A) Grid Search — 모든 조합을 빠짐없이 본다  
B) Random Search — 항상 가장 빠르다  
C) Bayesian Optimization — 이전 시도 결과를 활용해 다음 후보를 똑똑하게 고른다  
D) 수동 탐색 — 사람이 직관으로 고른다  

**정답: C**  
해설: 베이지안 최적화는 이전 평가 결과로 유망한 영역을 우선 탐색해 적은 시도로 좋은 해를 찾을 확률이 높아 AMT의 효율적 기본 전략이다. Grid(A)는 차원이 늘면 폭발적으로 비싸고, Random(B)은 이력을 무시하며, 수동(D)은 비효율적이다.

---

**문제 5.** 사기 거래 탐지 모델에서 양성(사기)은 전체의 0.3%이며 사기를 놓치는 비용이 매우 크다. 가장 중점적으로 봐야 할 평가 지표 조합은?

A) 재현율(Recall)과 PR-AUC  
B) 단순 정확도(Accuracy)  
C) RMSE와 MAE  
D) R²  

**정답: A**  
해설: 극단 불균형에서 FN(놓친 사기) 비용이 크면 재현율과 PR-AUC가 핵심 지표다. 정확도(B)는 불균형에서 과대평가되고, RMSE/MAE(C)와 R²(D)는 회귀 지표라 분류 문제에 부적합하다.

---
