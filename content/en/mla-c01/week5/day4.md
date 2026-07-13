# Day 4 - Model Evaluation: Metric Selection, Overfitting, Cross-validation, Confusion Matrix

Training ends doesn't mean model is good. Judging by one number "95% accuracy" is risky—on data where fraud is 1%, saying "all normal" yields 99% accuracy. Model evaluation's essence is measuring "generalization performance" with "problem-fitting metrics".

In the MLA-C01 exam, evaluation appears as "which metric on imbalanced data", "how to diagnose and mitigate overfitting", "compute precision/recall from confusion matrix". Today we cover metric selection, overfitting/underfitting, cross-validation, confusion matrix—four axes.

## Confusion Matrix and Classification Metrics

Classification evaluation starts with the confusion matrix. Binary classification splits prediction vs actual into four cells:

```
                  Actual Positive    Actual Negative
Predicted Positive    TP (true pos)      FP (false pos)
Predicted Negative    FN (false neg)     TN (true neg)
```

Key metrics emerge from here:

| Metric | Formula | Answers |
|---|---|---|
| Accuracy | (TP+TN)/total | Proportion correct of all |
| Precision | TP/(TP+FP) | Of positives predicted, true positive ratio |
| Recall | TP/(TP+FN) | Of actual positives, caught ratio |
| F1 | 2·P·R/(P+R) | Harmonic mean precision·recall |

Core intuition: **Precision when "want to reduce false alarms", Recall when "can't miss"**. Spam filter values precision (misfiltering good mail is bad), cancer diagnosis values recall (missing patient is fatal).

> 💡 **Related Theory**: Precision and recall are inherently tradeoff. Lower threshold classifies more positive, raising recall but increasing false positives, lowering precision. PR curve shows full spectrum, ROC curve plots TPR vs FPR varying threshold. AUC (area under curve) is "probability random positive scores higher than random negative", representing comprehensive discrimination power independent of single threshold.

## Metric Selection on Imbalanced Data

Why accuracy is risky: class imbalance. On data 1% fraud, 99% normal—"all normal" prediction gives 99% accuracy but catches zero fraud, useless model.

- **Imbalanced data**: Instead of accuracy use **F1, AUC(ROC), AUC-PR**, recall/precision.
- **Rare positive, can't miss (fraud·disease)**: Emphasize recall or AUC-PR.
- **False alarm cost high (spam)**: Emphasize precision.

```python
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score

print(confusion_matrix(y_true, y_pred))
print(classification_report(y_true, y_pred))   # precision/recall/f1
print("AUC:", roc_auc_score(y_true, y_prob))    # probability-based
```

> ⚠️ **Pitfall**: On imbalanced data, a choice claiming "99% accuracy" as proof model is good is a trap. When exam shows keywords "fraud/anomaly/rare disease", pick F1·recall·AUC not accuracy. Also ROC-AUC can look optimistic on extreme imbalance; when positive very rare, AUC-PR (precision-recall curve) is more honest.

## Regression Metrics

Regression (continuous value prediction) uses different metrics:

| Metric | Characteristics |
|---|---|
| MAE (mean absolute error) | Average error magnitude. Insensitive to outliers, intuitive interpretation |
| MSE / RMSE | Squared error. Sensitive to large errors (outlier penalty large) |
| R² (coefficient of determination) | Proportion variance model explains (closer to 1 better) |
| MAPE | Percentage error. Scale-independent comparison |

Intuition: **RMSE to heavily penalize large errors, MAE to reduce outlier impact.** How much predicted explains actual is R².

> 💡 **Related Theory**: RMSE more sensitive to outliers than MAE because errors are squared. One error of 10 contributes 100 to RMSE but 10 to MAE. So large errors deadly (e.g., demand forecast stock-out)→ use RMSE; all errors equally valued → use MAE. This links to loss function choice—training to minimize RMSE makes model biased to avoid large errors.

## Overfitting and Underfitting

Model evaluation's other axis: generalization. Fits training data perfectly but fails on new data = overfitting.

| State | Training Perf | Validation/Test Perf | Diagnosis |
|---|---|---|---|
| Underfitting | Low | Low | Model too simple/underlearned (high bias) |
| Good fit | High | High | Balanced |
| Overfitting | Very high | Low | Model memorized training (high variance) |

Diagnosis: Training good but validation bad and gap wide → **overfitting**. Both bad → **underfitting**.

Mitigating overfitting:
- More data, data augmentation
- Regularization (L1/L2), dropout
- Reduce model complexity, early stopping
- Reduce feature count

Mitigating underfitting:
- Increase model complexity, train longer
- Better features, relax regularization

> 📚 **Case**: Team trained image classifier getting 99% train accuracy, 70% validation accuracy—big gap. Typical overfitting. Adding data augmentation (rotate·flip) and dropout, setting early stopping made train 95%/validation 91%, gap smaller, better generalization. Lesson: train-validation gap is overfitting's key signal; regularization·augmentation·early stopping are standard remedy.

## Cross-validation

Single train/test split's evaluation wobbles by split luck. **k-fold cross-validation** splits data into k pieces, uses each once as validation and rest for training, averaging k performances. Especially stable evaluation on small data.

```
k=5 example:
Fold1: [validation][train][train][train][train]
Fold2: [train][validation][train][train][train]
...    → 5 training/evaluations then average
```

- **Stratified k-fold**: Each fold preserves class ratio—critical for imbalanced classification.
- **Time series data**: Must use time-series split (preserves past→future order) avoiding future leakage. Random k-fold unfit for time series.

> 💡 **Related Theory**: Cross-validation's value is reducing evaluation variance. Single train/test split is luck-dependent estimate (high variance). k-fold averages multiple splits, lowering variance, using data for both training and validation, efficiently using limited data. Note: larger k repeats training k times, increasing cost; time-series and ordered-meaning data's random splits leak future, inflating evaluation.

## Summary

Model evaluation measures "generalization" via "problem-fitting metrics". **Classification** extracts precision (suppress false alarm), recall (prevent miss), F1, AUC from confusion matrix; imbalanced data uses F1·recall·AUC not accuracy. **Regression** uses RMSE (large error sensitive), MAE (outlier insensitive), R². **Overfitting** diagnosed by train-validation gap, mitigated by regularization, augmentation, early stopping. **Cross-validation (k-fold)** reduces eval variance; imbalanced uses stratified, time-series uses time-split. Exams target patterns: "imbalance→accuracy trap", "large error→RMSE", "train-validation gap→overfitting".

Next we synthesize Week 5—custom training, distributed training, debugging·profiling, evaluation.

---

## 📝 연습 문제

**문제 1.** 사기 거래가 전체의 1%인 매우 불균형한 데이터셋에서 모델을 평가한다. 모델 성능을 판단하는 지표로 가장 부적절한 것은?

A) F1 점수  
B) 재현율(Recall)  
C) 단순 정확도(Accuracy)  
D) AUC-PR  

**정답: C**  
해설: 1% 양성 불균형에서는 "전부 정상" 예측만으로도 99% 정확도가 나와 정확도가 모델 품질을 왜곡한다. F1·재현율·AUC-PR은 희귀 양성을 얼마나 잡는지를 반영해 불균형 평가에 적합하므로, 가장 부적절한 것은 단순 정확도다.

---

**문제 2.** 암 검진 모델에서 실제 환자를 놓치는 것(거짓음성)이 가장 위험하다. 우선적으로 높여야 할 지표는?

A) 정밀도(Precision)  
B) 재현율(Recall)  
C) 학습 속도  
D) GPU 활용률  

**정답: B**  
해설: 재현율은 실제 양성(환자) 중 모델이 잡아낸 비율로, 놓치면 안 되는 상황(거짓음성 최소화)에서 우선시한다. A는 거짓양성을 줄이는 지표로 초점이 다르고, C·D는 평가 지표가 아니라 학습 효율·자원 관련이다.

---

**문제 3.** 모델의 학습 정확도는 99%인데 검증 정확도는 70%로 둘의 격차가 크다. 진단과 적절한 완화책은?

A) 과소적합이므로 모델을 더 단순하게 만든다  
B) 과적합이므로 정규화·드롭아웃·데이터 증강·조기 종료를 적용한다  
C) 정상이므로 그대로 배포한다  
D) 학습 데이터를 검증에도 그대로 쓴다  

**정답: B**  
해설: 학습 성능은 높고 검증 성능이 낮으며 격차가 큰 것은 전형적 과적합으로, 정규화·드롭아웃·증강·조기 종료로 일반화를 높인다. A는 과소적합 처방이라 방향이 반대이고, C는 일반화 실패를 무시하며, D는 데이터 누수를 일으키는 잘못된 평가다.

---

**문제 4.** 회귀 모델에서 드물게 발생하는 큰 예측 오차에 강한 페널티를 주어 큰 오차를 피하도록 평가·최적화하려 한다. 적합한 지표는?

A) MAE  
B) RMSE  
C) 정확도  
D) 재현율  

**정답: B**  
해설: RMSE는 오차를 제곱하므로 큰 오차에 더 큰 페널티를 부여해 큰 오차를 피하려는 목적에 적합하다. A(MAE)는 오차에 선형이라 큰 오차에 상대적으로 둔감하고, C·D는 분류 지표라 회귀 평가에 맞지 않는다.

---

**문제 5.** 데이터가 적어 단일 train/test 분할의 평가가 분할 운에 따라 크게 흔들린다. 안정적 평가를 위한 방법은?

A) k-fold 교차검증으로 여러 분할의 성능을 평균  
B) 테스트 세트를 학습에 포함  
C) 평가를 생략하고 바로 배포  
D) 동일 데이터로 학습과 테스트를 같게 한다  

**정답: A**  
해설: k-fold 교차검증은 데이터를 여러 fold로 나눠 번갈아 검증·학습하고 결과를 평균해 평가 분산을 줄이며 적은 데이터를 효율적으로 활용한다. B·D는 데이터 누수로 성능을 부풀리고, C는 평가 자체를 포기하는 잘못된 선택이다.

---
