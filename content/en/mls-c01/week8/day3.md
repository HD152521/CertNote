# Day 3 - Overfitting/Underfitting: Diagnosis and Regularization/Data Augmentation

Even with good hyperparameters from tuning, if a model **fits training well but validates poorly**, it's useless. Today covers **generalization failure's two sides** — overfitting and underfitting — how to diagnose, and how to fix each with regularization (L1/L2/dropout/early stopping) and data augmentation. Tests ask about learning curve patterns, bias-variance, matching fixes.

## Bias and Variance, Generalization

Generalization error decomposes into bias and variance.

- **High bias = underfitting**: Model too simple to capture training patterns. Both training and validation error high
- **High variance = overfitting**: Model memorizes noise. Training error low, validation error high (big gap)

```text
Underfitting:  train error ↑  valid error ↑   (both bad, small gap)
Ideal:         train error ↓  valid error ↓   (both good)
Overfitting:   train error ↓  valid error ↑   (gap is large)
```

> 💡 **Related Theory**: Bias-variance tradeoff is core tension of model complexity vs generalization. Increasing complexity → reduces bias but raises variance; decreasing → opposite. Goal: find sweet spot where total (bias + variance) is minimized. Regularization reduces variance to fight overfitting, increasing model capacity/features fights underfitting

## Diagnosis: Reading Learning Curves

Curve interpretation is more tested than code.

```text
[Overfitting signals]
- Train 99% / valid 72% (large gap)
- As epochs progress: train loss keeps falling, val loss rises again

[Underfitting signals]
- Train 65% / valid 64% (both low, similar)
- More training still yields high loss, plateau
```

Intervention map:
- **Overfitting** → more data, strengthen regularization, simplify model, fewer features, early stop, dropout, augment
- **Underfitting** → increase complexity, add features, train longer, weaken regularization

## Regularization 1: L1, L2

Penalize weight magnitude in loss to reduce variance.

| Technique | Penalty | Effect |
|------|------|------|
| **L1 (Lasso)** | Sum of weight absolute values | Some weights → exactly 0 → **feature selection** (sparsity) |
| **L2 (Ridge)** | Sum of weight squares | Weights → small (not 0) → smooth shrinkage |
| **ElasticNet** | L1 + L2 combo | Sparsity + stability blend |

```python
# Example: Linear Learner L1/L2 strength
hyperparameters = {
    "l1": 0.01,                  # L1 strength (sparsity)
    "wd": 0.001,                 # weight decay = L2
}
```

Signal:
- "Too many features, auto-discard unnecessary, sparse model" → **L1**
- "Keep all features but shrink weights, fight overfitting" → **L2**

## Regularization 2: Dropout, Early Stopping

Deep learning-specific.

- **Dropout**: Random disable neurons per step (e.g., rate 0.5). Prevents specific neuron dependence, implicit ensemble. **Disable at inference**, adjust weights
- **Early Stopping**: Stop when validation loss stops improving. Prevents reaching overfitting point

```python
# Example neural net hyperparameters
hyperparameters = {
    "dropout": 0.5,
    "early_stopping_patience": 5,   # Stop if no improvement 5 epochs
}
```

> 💡 **Related Theory**: Dropout trains different sub-networks each step → inference averages them (implicit ensemble). Early Stopping halts right before noise memorization starts, shrinking variance. Both achieve "simpler effective model," fighting overfitting differently

## Data Augmentation

When collecting more data is hard, transform existing data to broaden training distribution. Powerful overfitting reducer.

- **Images**: Rotate, flip, crop, brightness/contrast, noise, cutout
- **Text**: Synonym swap, back-translation, random deletion
- **Tabular/imbalance**: **SMOTE** synthesize minority class, relieve class imbalance

Signal:
- "Limited data, overfitting / data collection costly" → **augmentation**
- "Minority class too rare, model learns majority only" → **SMOTE/oversample** (or class weights)

## Data Split and Leakage Prevention

Measuring generalization honestly needs correct splitting.

- **train / validation / test** 3-way. Validation picks hyperparameters, test scores once final
- **k-fold cross-validation**: Limited data → average performance avoiding split luck
- **Leakage**: Future info/target-derived features/test info in training → unrealistic val scores. Scalers/encoders/imputers must `fit` train only, `transform` valid/test

## Test Tips

- "Train accurate, validation low (big gap)" → overfitting. Fix: regularize↑, data↑, dropout, early stop, augment
- "Train·validation both low" → underfitting. Fix: complexity↑, features↑, train longer
- "Unwanted features, auto-remove / sparse" → L1. "Shrink all weights" → L2
- "Data scarce" + image/text → augmentation
- Scaler fitted on all data = leakage → fit train only

## Summary

Today covered generalization failure diagnosis and fixes. Key: **learning curves tell overfitting/underfitting → bias-variance lens → overfitting = regularize (L1/L2/dropout/early stop), data augment; underfitting = more capacity, features, training**. Next: learning stability itself — batch size, learning rate schedules, gradient problems, Debugger/Profiler

---

## 📝 연습 문제

**문제 1.** 한 모델이 학습 정확도 98%, 검증 정확도 71%로 큰 격차를 보인다. 이 상황의 진단과 1차 대응으로 가장 적절한 것은?

A) 정상 — 추가 조치 불필요  
B) 데이터 누수 — 학습률을 높인다  
C) 과소적합 — 모델 복잡도를 더 키운다  
D) 과적합 — 정규화를 강화하거나 데이터를 더 모은다  

**정답: D**  
해설: 학습 성능은 높은데 검증 성능이 크게 낮은 격차는 전형적 과적합이며, 정규화 강화·데이터 추가·드롭아웃·조기종료 등이 대응이다. 과소적합(C)은 둘 다 낮을 때이고, 학습률 인상(B)은 과적합을 더 악화시킬 수 있으며, 큰 격차는 정상이 아니다(A).

---

**문제 2.** 입력 특징이 500개로 많고, 그중 불필요한 특징을 모델이 스스로 0으로 만들어 희소한 모델을 얻고 싶다. 가장 적합한 정규화는?

A) L2(Ridge)  
B) L1(Lasso)  
C) 드롭아웃  
D) 배치 정규화  

**정답: B**  
해설: L1 정규화는 가중치 절댓값 페널티로 일부 가중치를 정확히 0으로 만들어 특징 선택·희소성을 유도한다. L2(A)는 가중치를 0에 가깝게 줄이지만 0으로 만들진 않고, 드롭아웃(C)·배치 정규화(D)는 특징 선택용 희소화 기법이 아니다.

---

**문제 3.** 이미지 분류 모델이 과적합되는데, 라벨링된 추가 데이터를 모으는 비용이 매우 크다. 가장 비용 효율적인 대응은?

A) 회전·반전·크롭 등 데이터 증강을 적용  
B) 학습 에폭 수를 두 배로 늘린다  
C) 모델의 층 수를 크게 늘린다  
D) 검증 세트를 학습에 합친다  

**정답: A**  
해설: 추가 수집이 어려울 때 데이터 증강(회전·반전·크롭 등)은 기존 데이터를 변형해 학습 분포를 넓혀 과적합을 줄이는 비용 효율적 방법이다. 에폭 증가(B)·모델 확대(C)는 과적합을 악화시키고, 검증 세트를 학습에 합치면(D) 일반화 측정이 불가능해진다.

---

**문제 4.** 신경망 모델에서 학습이 진행될수록 학습 손실은 계속 내려가지만 검증 손실은 어느 시점 이후 다시 올라간다. 잡음 암기를 막기 위한 가장 직접적인 기법은?

A) 학습률을 0으로 고정  
B) 배치 크기를 1로 설정  
C) 검증 손실이 개선되지 않으면 학습을 멈추는 조기 종료  
D) 특징을 모두 제거  

**정답: C**  
해설: 검증 손실이 다시 오르는 지점이 과적합 시작점이며, 조기 종료는 검증 손실이 더 개선되지 않을 때 학습을 멈춰 그 지점을 넘지 않게 한다. 학습률 0(A)은 학습을 막고, 배치 1(B)은 관련 해법이 아니며, 특징 전부 제거(D)는 비현실적이다.

---

**문제 5.** 전처리에서 표준화(StandardScaler)를 적용할 때 데이터 누수를 막는 올바른 방법은?

A) 전체 데이터(train+test)로 fit한 뒤 분할한다  
B) train으로 fit하고 그 통계로 train·validation·test를 transform한다  
C) test로 fit하고 train을 transform한다  
D) 매 배치마다 새로 fit한다  

**정답: B**  
해설: 스케일러는 학습 데이터(train)로만 fit하고, 그때 얻은 평균·표준편차로 validation·test를 transform해야 테스트 정보가 학습에 새지 않는다. 전체 데이터로 fit(A)하거나 test로 fit(C)하면 누수가 발생하고, 매 배치 재fit(D)은 일관성을 깬다.

---
