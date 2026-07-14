# Day 2 - ROC/AUC and Threshold Adjustment: Reading Model Performance with Curves

Yesterday's precision and recall were single slices at a specific threshold (usually 0.5). But classification models don't output 0 or 1 — they output **probability scores**, and where you cut that score completely changes precision and recall. Today we cover ROC curves and PR curves that sweep the threshold from 0 to 1 to draw full performance, and AUC that summarizes curves into a single number. The core question is "where do we set the threshold?" and the answer comes from business trade-offs.

## What Threshold Changes

A classifier outputs a score like `P(Positive) = 0.73`. Set threshold t: if `score ≥ t`, classify as Positive.

```text
Threshold ↓ (e.g., 0.3)  → classify more as Positive
   → recall ↑ (catch more positives), precision ↓ (more FP)

Threshold ↑ (e.g., 0.7)  → classify more conservatively as Positive
   → precision ↑ (only sure ones), recall ↓ (miss more positives)
```

So a single model has countless (precision, recall) pairs depending on threshold. The curve unfolds all these pairs in one diagram.

## ROC Curve: TPR vs FPR

The ROC (Receiver Operating Characteristic) curve plots two axes as threshold moves.

```text
Y-axis: TPR (recall)      = TP / (TP + FN)   ← How many positives caught
X-axis: FPR (false pos rate) = FP / (FP + TN)   ← How many negatives falsely alarmed

(0,0) Classify everything as Negative (threshold=1)
(1,1) Classify everything as Positive (threshold=0)
Closer to top-left (0,1) = better model
Diagonal y=x = random guess level
```

Better models have curves spiking toward the top-left corner, rapidly raising TPR while barely increasing FPR.

## AUC: Area Under the Curve

AUC (Area Under the Curve) summarizes model performance as **threshold-independent** single number 0~1 below the ROC curve.

```text
AUC = 1.0   Perfect classification
AUC = 0.5   Random guess (diagonal)
AUC < 0.5   Worse than random (flip predictions to improve)
```

Intuitive AUC interpretation: **probability that a randomly chosen positive's score exceeds a randomly chosen negative's score**. It measures how well the model "ranks" positives vs negatives. Useful for comparing model discrimination before choosing threshold.

> 💡 **Related Theory**: AUC's threshold-independence is a double-edged sword. Convenient for comparing multiple models' discrimination at once, but in real operations you eventually pick one threshold. So exam questions split: "compare models" → use AUC; "set operational threshold" → pick a point on ROC/PR curve.

## PR Curve: More Honest than ROC on Imbalanced Data

PR (Precision-Recall) curve plots recall on X-axis, precision on Y-axis. On extremely imbalanced data, PR curves give a more honest picture than ROC.

```text
Why: ROC's FPR = FP / (FP + TN)
When negatives vastly dominate (imbalance), even if FP grows,
it's buried in the huge TN denominator, so FPR barely changes.
→ ROC looks overly optimistic

PR curve's precision = TP / (TP + FP)
FP increase directly reflects in precision → exposes imbalance pain fully
```

So for problems where positives are rare (fraud, disease), prioritize **PR AUC (Average Precision)**.

> 💡 **Related Theory**: The basis for "imbalance → PR curve" is the denominator. ROC's FPR includes majority class (TN) in denominator, diluting FP increases; PR's precision denominator is only (TP+FP), so false alarms in minority class show clearly. By examining what goes in the denominator, you judge which curve is trap-resistant.

## Threshold Selection: Business Trade-offs

After drawing the curve, operationalize with a threshold. Methods vary by business cost structure.

```python
import numpy as np
from sklearn.metrics import precision_recall_curve

precision, recall, thresholds = precision_recall_curve(y_true, y_scores)

# Example: Regulated environment mandating ≥90% recall
#     → Among thresholds meeting constraint, pick highest precision
mask = recall[:-1] >= 0.90
best_idx = np.argmax(precision[:-1][mask])
chosen_threshold = thresholds[mask][best_idx]
```

Representative selection strategies:

| Situation | Threshold Strategy |
|------|------|
| High FN cost (disease/fraud) | Guarantee recall floor → lower threshold |
| High FP cost (spam/recommendations) | Guarantee precision floor → raise threshold |
| Balance FP·FN | Pick F1 maximization point |
| Cost quantifiable in dollars | Minimize expected cost `cost_FP×FP + cost_FN×FN` |

Expected cost minimization is most principled. Given dollar costs per FP and FN, calculate total cost at each threshold on the curve, pick cheapest point.

## Using in SageMaker

Built-in binary classifiers export `validation:auc` as a training metric, usable as objective for Automatic Model Tuning. Also, SageMaker endpoints return probability scores, so threshold cutting happens in inference post-processing.

```python
tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:auc",  # tune by discrimination
    objective_type="Maximize",
    hyperparameter_ranges=ranges,
)
# Endpoint returns 0.0~1.0 scores → apply business threshold in post-process
score = float(predictor.predict(payload))
label = 1 if score >= chosen_threshold else 0
```

Real-world pattern: pick good model using AUC, then separately choose threshold to fit business constraints — **2-stage separation**.

> 💡 **Related Theory**: Model training/tuning and threshold decision are separate decision stages. Tuning with AUC as objective yields a "good-ranking model" immune to threshold gyration; then post-hoc pick threshold matching cost structure on top of that model. This separation means if cost structure changes, retune threshold only, no model retraining needed.

## Summary

Classifiers output probabilities; thresholds convert probabilities to labels. ROC curve shows TPR vs FPR for model discrimination; PR curve shows precision vs recall for imbalance reality. AUC summarizes curves into one threshold-independent number for model comparison; actual operational threshold is one point on the curve, determined by FP/FN costs. With severe imbalance, trust PR curves over ROC.

Tomorrow we shift from classification to regression model metrics — RMSE, MAE, MAPE, R² and residual analysis.

---

## 📝 연습 문제

**문제 1.** 분류 모델의 임계값을 0.5에서 0.3으로 낮췄다. 일반적으로 일어나는 변화는?

A) 재현율이 증가하고 정밀도가 감소하는 경향이 있다  
B) 정밀도와 재현율이 모두 증가한다  
C) 재현율이 감소하고 정밀도가 증가한다  
D) 두 지표 모두 변하지 않는다  

**정답: A**  
해설: 임계값을 낮추면 더 많은 샘플을 Positive로 분류해 양성을 더 많이 잡지만(재현율 ↑) 거짓양성도 늘어(정밀도 ↓) 트레이드오프가 발생한다. 둘 다 증가(B)·재현율 감소(C)는 방향이 틀렸고, 임계값 변경은 지표를 바꾼다(D 오답).

---

**문제 2.** ROC 곡선의 AUC가 0.5라는 것은 무엇을 의미하는가?

A) 모델이 완벽하게 분류한다  
B) 데이터가 완전히 균형 잡혀 있다  
C) 정밀도와 재현율이 같다  
D) 모델의 변별력이 무작위 추측 수준이다  

**정답: D**  
해설: AUC 0.5는 ROC의 대각선에 해당하며 양성/음성을 무작위로 순위 매기는 것과 같은 무의미한 변별력이다. 완벽은 1.0(A), 데이터 균형(B)이나 정밀도=재현율(C)과는 무관하다.

---

**문제 3.** 양성 클래스가 전체의 0.3%인 극단적 불균형 사기 탐지 문제다. 모델 성능 평가에 ROC-AUC보다 더 정직한 지표는?

A) 단순 정확도  
B) FPR 단독  
C) PR 곡선의 AUC(Average Precision)  
D) 학습 손실(loss)  

**정답: C**  
해설: 음성(TN)이 압도적이면 ROC의 FPR이 FP 증가를 희석해 낙관적으로 보이므로, 분모에 TN이 없는 PR 곡선의 AP가 더 정직하다. 정확도(A)는 불균형을 가리고, FPR 단독(B)·학습 손실(D)은 성능 요약 지표로 부적절하다.

---

**문제 4.** FP 한 건의 비용과 FN 한 건의 비용을 금액으로 추정할 수 있는 상황이다. 가장 원칙적인 운영 임계값 선택 방법은?

A) 항상 0.5로 고정한다  
B) AUC가 최대가 되는 임계값을 찾는다  
C) 재현율을 무조건 1.0으로 만드는 임계값을 찾는다  
D) `cost_FP×FP + cost_FN×FN` 기대비용을 최소화하는 임계값을 찾는다  

**정답: D**  
해설: 비용을 금액으로 알면 곡선 위 각 임계값의 총 기대비용을 계산해 최소 지점을 고르는 것이 가장 원칙적이다. 0.5 고정(A)은 비용을 무시하고, AUC는 임계값과 무관해 임계값을 못 정하며(B), 재현율 1.0(C)은 정밀도를 희생해 비용을 폭증시킨다.

---

**문제 5.** 여러 후보 모델의 변별력을 임계값과 무관하게 한 숫자로 비교하려 한다. SageMaker Automatic Model Tuning의 목적 지표로 가장 적절한 것은?

A) validation:accuracy  
B) validation:auc  
C) train:loss  
D) 고정 임계값에서의 FN 개수  

**정답: B**  
해설: AUC는 임계값과 무관하게 모델의 순위 변별력을 0~1로 요약하므로 모델 간 비교 및 튜닝 목적 지표로 적합하다. 정확도(A)는 불균형에 취약하고, 학습 손실(C)은 일반화를 반영하지 못하며, 특정 임계값 FN(D)은 임계값 의존적이다.

---
