# Day 5 - Week 9 Review: Evaluation and Debugging

This week covered the final stage of Domain 3 (Modeling) — **how to evaluate and debug models**. After choosing an algorithm (Week 6) and training/tuning it (Weeks 7-8), we must now answer "is this model truly good, where and how does it fail" with numbers and tools. Today we tie four days into one evaluation-debugging flow and organize the trickiest choices.

## One-Page Summary: Evaluation to Debugging

```text
[Trained model]
   │
   ├─ 1) Determine metric family by problem type
   │     Classification → accuracy/precision/recall/F1, ROC-AUC, PR-AUC
   │     Regression → RMSE/MAE/MAPE/R²
   │
   ├─ 2) Select metrics and thresholds by business cost
   │     FN deadly → recall / lower threshold
   │     FP deadly → precision / raise threshold
   │     Imbalance → F1, PR-AUC (ban accuracy)
   │
   ├─ 3) Analyze trade-offs with curves
   │     ROC/AUC = discrimination, model comparison
   │     PR curve = honest on extreme imbalance
   │
   └─ 4) Debug, bias, error analysis
         Debugger = training process (gradients/loss/overfitting)
         Clarify = bias (group fairness) + SHAP (explainability)
         Error analysis = improve from largest error bucket
```

## Classification Metrics (Day1~2)

| Metric | Formula Denominator | When |
|------|------|------|
| Accuracy | All | Balanced data only, ban on imbalance |
| Precision | TP+FP (predicted positive) | High FP cost (spam) |
| Recall | TP+FN (actual positive) | High FN cost (disease/fraud) |
| F1 | Harmonic mean | Balance FP·FN, imbalanced data |
| ROC-AUC | TPR vs FPR area | Threshold-independent model comparison |
| PR-AUC | Precision vs Recall area | Honest on extreme imbalance |

## Regression Metrics (Day3)

| Metric | Character | Signal |
|------|------|------|
| MAE | Robust to outliers, intuitive unit | Ignore outliers |
| RMSE | Sensitive to large errors (squared) | Large mistakes catastrophic, built-in default |
| MAPE | Scale-independent relative error | Compare across scales (watch y=0) |
| R² | Explanatory power vs mean | Negative = worse than mean |

Residual plot: random scatter=good, U-shape=missed nonlinearity, funnel=heteroscedasticity, skew=bias.

## Debugging, Bias (Day4)

| Keyword | Service |
|------|------|
| Vanishing/exploding gradients, overfitting, tensor capture, auto-stop job | **Debugger** |
| Group fairness, Disparate Impact, pre/post-training bias | **Clarify (bias)** |
| SHAP, feature contribution, prediction explanation | **Clarify (explainability)** |

> 💡 **Related Theory**: The single principle threading this week is **"metrics translate business cost."** Same model, high FP cost → focus precision; high FN cost → focus recall; imbalance → ditch accuracy for F1/PR-AUC. In regression too: big mistakes catastrophic → RMSE; outliers noise → MAE. Metric selection almost always reduces to "which mistake costs more in this business?"

## Trickiest Comparisons

| Comparison | Core Difference |
|------|------|
| Precision vs Recall | Reduce FP / Reduce FN |
| Accuracy vs F1 | Balanced data / Imbalanced data |
| ROC vs PR curves | General / Extreme imbalance (no TN in denominator) |
| AUC vs threshold choice | Model comparison / Operational cut decision |
| RMSE vs MAE | Emphasize large errors / Robust to outliers |
| R² positive vs negative | Better than mean / Worse than mean |
| Debugger vs Clarify | Training process health / Bias & explainability |
| Clarify bias vs SHAP | Group fairness / Prediction explanation |
| Classification tuning vs regression tuning | Maximize (F1/AUC) / Minimize (RMSE) |

> 💡 **Related Theory**: Model evaluation and threshold decision are separate stages. Use threshold-independent metrics like AUC to pick a "good-ranking model" first, then post-hoc pick threshold matching FP/FN costs on top. This separation lets you adjust threshold alone if cost structure changes, no model retraining. Exam splits "model comparison=AUC, operational cut=one point on curve" for this reason.

## Self-Check Questions

Try answering in your head:

1. Fraud is 0.5% but accuracy is 99.5%, why not trust it? → **Classify all as normal = 99.5%, imbalance**
2. When missing fraud (FN) is deadly, priority metric? → **Recall**
3. On extreme imbalance, more honest curve than ROC? → **PR curve (PR-AUC)**
4. If RMSE much larger than MAE? → **Large errors (outlier residuals) present**
5. If R² negative? → **Worse than predicting mean**
6. Residual plot U-shaped? → **Missed nonlinearity, review features/model**
7. Service that auto-detects vanishing gradients during training? → **SageMaker Debugger**
8. Measure prediction fairness across groups? → **SageMaker Clarify (bias metrics)**
9. Explain feature contribution for single prediction? → **Clarify SHAP values**
10. Regression tuning objective direction? → **Minimize (RMSE, etc)**

## Exam Tips Summary

- **Step 1**: Classification or regression? → pick metric family.
- **Step 2**: By FP vs FN cost, choose precision/recall/F1; on imbalance, ditch accuracy.
- See "imbalance" word? Accuracy option = wrong, F1/PR-AUC = right.
- "Compare models / discrimination" = AUC; "operational threshold" = min-cost point on curve.
- Regression: "big mistakes catastrophic"=RMSE, "outliers noise"=MAE, "scale-different"=MAPE.
- "Gradients/loss/overfitting/tensors"=Debugger, "fairness/groups/SHAP"=Clarify → instant answer.
- Tuning direction: classification metrics Maximize, error metrics Minimize.

## Summary

Week 9 was the final modeling step — "score and fix models." Define metric family by problem type, pick precision/recall/F1·threshold by business cost, read trade-offs with curves (ROC/PR). Then use Debugger for training process, Clarify for bias and explainability, error analysis for biggest error buckets. Core principles: **"metrics translate business cost"**, "classification Maximize / regression Minimize", "Debugger=process / Clarify=bias·explainability".

Next week (Week 10) shifts to Domain 4 — actually **deploying, operating, monitoring** models.

---

## 📝 연습 문제

**문제 1.** 클래스가 95:5로 불균형한 이탈 예측 문제에서 모델을 평가하려 한다. 다음 중 가장 부적절한 평가 방식은?

A) F1 점수를 본다  
B) PR 곡선의 AUC를 본다  
C) 단순 정확도(Accuracy)만으로 판단한다  
D) 재현율과 정밀도를 함께 본다  

**정답: C**  
해설: 불균형 데이터에서 정확도는 다수 클래스만 맞혀도 높게 나와 모델 성능을 과대평가하므로 단독 판단은 부적절하다. F1(A)·PR-AUC(B)·정밀도/재현율(D)은 불균형에 적합한 지표다.

---

**문제 2.** 여러 후보 분류 모델을 임계값과 무관하게 변별력으로 비교한 뒤, 운영 임계값은 FP/FN 비용에 맞춰 따로 정하려 한다. 올바른 접근은?

A) 모든 모델을 임계값 0.5의 정확도로만 비교한다  
B) AUC로 모델을 고르고, 임계값은 곡선 위에서 기대비용이 최소인 지점으로 사후 결정한다  
C) 임계값을 먼저 0.9로 고정하고 모델을 고른다  
D) RMSE로 분류 모델을 비교한다  

**정답: B**  
해설: AUC는 임계값-무관 변별력 비교에 적합하고, 운영 임계값은 비용 구조에 맞춰 곡선 위에서 사후에 정하는 2단계 분리가 정석이다. 0.5 정확도(A)·임계값 선고정(C)은 비용을 무시하고, RMSE(D)는 회귀 지표다.

---

**문제 3.** 회귀 모델 두 개를 비교하니 모델 A는 RMSE와 MAE가 비슷하고, 모델 B는 RMSE가 MAE보다 훨씬 크다. 이로부터 추론할 수 있는 것은?

A) 모델 B에는 소수의 큰 오차(이상치성 잔차)가 있을 가능성이 높다  
B) 모델 A는 분류 모델이다  
C) 모델 B의 R²는 반드시 음수다  
D) 두 모델은 완전히 동일하다  

**정답: A**  
해설: RMSE는 큰 오차를 제곱으로 증폭하므로 RMSE-MAE 격차가 크면 소수의 큰 오차가 존재할 가능성이 높다. 지표 유형이 모델 종류를 정하지 않고(B), R² 부호는 별개이며(C), 지표가 다르므로 동일(D)하지 않다.

---

**문제 4.** 다음 중 SageMaker 서비스와 역할의 짝이 틀린 것은?

A) Debugger — 학습 중 기울기 소실/과적합을 실시간 탐지  
B) Clarify — 집단 간 편향(Disparate Impact) 측정  
C) Clarify — SHAP으로 개별 예측의 피처 기여도 설명  
D) Debugger — 모델 예측의 성별 집단 간 공정성 측정  

**정답: D**  
해설: 집단 간 예측 공정성 측정은 Clarify의 역할이며 Debugger는 학습 과정의 텐서/손실을 다룬다. A·B·C는 모두 올바른 짝이다.

---

**문제 5.** SageMaker Automatic Model Tuning에서 목적 지표 방향(objective_type) 설정으로 올바른 것은?

A) 회귀의 validation:rmse → Maximize  
B) 분류의 validation:f1 → Minimize  
C) 회귀의 validation:rmse → Minimize, 분류의 validation:auc → Maximize  
D) 모든 지표는 항상 Maximize  

**정답: C**  
해설: 오차 지표(RMSE)는 작을수록 좋으므로 Minimize, 성능 지표(F1·AUC)는 클수록 좋으므로 Maximize가 맞다. RMSE Maximize(A)·F1 Minimize(B)는 방향이 반대이고, 모든 지표 Maximize(D)는 오차 지표에 틀리다.

---
