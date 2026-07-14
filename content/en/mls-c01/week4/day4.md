# Day 4 - Handling Class Imbalance: Over/Undersampling, SMOTE, Class Weights, Evaluation

Most real classification problems are **imbalanced**. Fraud is 0.1%, disease positive is 2%, churn is 5%—the minority class is what we actually want to catch. Training on raw imbalanced data causes models to achieve high accuracy just by predicting all majority class.

Today we explore why imbalance is a trap, and how to handle it via **resampling (over/undersampling)**, **SMOTE**, **class weights**, and **metric selection**. This is a frequently-tested MLS-C01 domain.

## The Imbalance Trap: Accuracy Paradox

With 2% positive data, predicting "all negative" yields 98% accuracy—yet catches zero positives we care about. This is the **accuracy paradox**.

| Metric | Definition | Meaning in Imbalance |
|------|------|-------------------|
| Accuracy | (TP+TN)/total | Biased toward majority, misleading |
| Precision | TP/(TP+FP) | Ratio of true among positive predictions |
| Recall | TP/(TP+FN) | Ratio of positives caught |
| F1 | Harmonic mean of precision/recall | Balanced tradeoff |
| PR-AUC | Precision-recall curve area | More sensitive in imbalance than ROC |

> 💡 **Key Theory**: In imbalanced data, **PR-AUC is more useful than ROC-AUC**. ROC's x-axis (False Positive Rate) has a huge denominator of negatives (TN+FP), diluting minority class errors. PR curves focus on positives, so they're sensitive to minority class performance shifts. Thus "for sparse positives like fraud, evaluate with PR-AUC" is standard.

## Data-Level Remedy: Resampling

### Oversampling (Increase Minority)

- **Random oversampling**: Duplicate minority samples → overfitting risk (repeated points)
- **SMOTE**: Interpolate between minority samples to create synthetic ones → diversity maintained

### Undersampling (Reduce Majority)

- **Random undersampling**: Remove some majority samples → information loss risk
- For very large data, undersampling accelerates training

```python
from imblearn.over_sampling import SMOTE
from imblearn.under_sampling import RandomUnderSampler
from imblearn.pipeline import Pipeline

# SMOTE oversample then undersample majority (hybrid)
pipe = Pipeline([
    ("over", SMOTE(sampling_strategy=0.3, random_state=42)),
    ("under", RandomUnderSampler(sampling_strategy=0.5, random_state=42)),
])
X_res, y_res = pipe.fit_resample(X_train, y_train)
```

> 💡 **Key Theory**: SMOTE (Synthetic Minority Over-sampling Technique) finds k-nearest neighbors of minority samples and interpolates new points between them. Unlike simple duplication, it generalizes around decision boundaries, but has drawbacks—can create unrealistic samples in noise/overlap regions; doesn't work directly on categorical features (needs SMOTE-NC variant); interpolation loses meaning in high dimensions.

> ⚠️ **Pitfall**: Resampling must **apply only after train-test split, to training set only**. Applying SMOTE before split leaks synthetic positives into both train and validation, causing **data leakage** and inflated performance. Use imblearn's `Pipeline` with cross-validation to resample within each fold.

## Algorithm-Level Remedy: Class Weights

Penalize minority class errors more heavily in the loss function without changing data.

```python
from sklearn.linear_model import LogisticRegression

# Auto-weight inversely to class frequency
clf = LogisticRegression(class_weight="balanced")

# XGBoost: set scale_pos_weight by negative/positive ratio
# scale_pos_weight = (negative count) / (positive count)
import xgboost as xgb
model = xgb.XGBClassifier(scale_pos_weight=49)  # negative:positive = 49:1
```

| Method | Data Changed | Strength | Weakness |
|------|-------------|------|------|
| Resampling | Yes | Intuitive, works with any model | Watch leakage, overfitting, information loss |
| Class weights | No | Data unchanged, fast | Model must support it |
| Threshold adjustment | No | Tune after training, in production | Finding right threshold takes work |

> 💡 **Key Theory**: Classifiers typically use 0.5 probability as threshold, but in imbalance this default fails. **Threshold moving** lets you adjust the recall-precision tradeoff by inspecting the PR curve or cost matrix without retraining. For fraud where false negatives (missed fraud) are costly, lower the threshold to raise recall.

## SageMaker Approaches

- Many built-in algorithms offer imbalance hyperparameters (e.g., XGBoost `scale_pos_weight`)
- Use SageMaker Clarify to pre-check class distribution and bias before training
- Monitor with F1/PR-AUC instead of accuracy

## Summary

- **Accuracy paradox**: Accuracy misleads in imbalance → use Precision/Recall/F1/PR-AUC
- **Data-level**: Oversample (SMOTE), undersample; apply after split, train set only
- **Algorithm-level**: Class weights (`class_weight`, `scale_pos_weight`), threshold tuning
- **Evaluation**: For sparse minorities, PR-AUC > ROC-AUC

## 📝 연습 문제

**문제 1.** 양성이 전체의 1%인 사기 탐지 데이터에서 모델 성능을 평가하려 한다. 가장 부적절한 단일 지표는?

A) Recall  
B) Accuracy  
C) F1 score  
D) PR-AUC  

**정답: B**  
해설: 양성이 1%면 "전부 음성"으로 찍어도 정확도 99%가 나오는 정확도 역설 때문에 Accuracy는 불균형에서 가장 오해를 부른다. Recall(A)·F1(C)·PR-AUC(D)는 소수 클래스 성능을 반영해 더 적절하다.

---

**문제 2.** SMOTE에 대한 설명으로 옳은 것은?

A) 다수 클래스 샘플을 무작위로 제거한다  
B) 소수 클래스 샘플을 그대로 복제만 한다  
C) 소수 클래스의 최근접 이웃 사이를 보간해 합성 샘플을 만든다  
D) 데이터 분할 전에 전체 데이터에 적용해야 한다  

**정답: C**  
해설: SMOTE는 소수 클래스 샘플과 그 k-최근접 이웃 사이를 선형 보간해 새로운 합성 샘플을 생성한다. 다수 제거(A)는 언더샘플링, 단순 복제(B)는 무작위 오버샘플링이며, 분할 전 적용(D)은 데이터 누수를 일으키는 잘못된 방법이다.

---

**문제 3.** 데이터를 변경하지 않고 XGBoost에서 소수(양성) 클래스의 오분류에 더 큰 벌점을 주려 한다. 적절한 설정은?

A) `scale_pos_weight`를 (음성 수/양성 수)로 설정한다  
B) `n_estimators`를 늘린다  
C) `learning_rate`를 0으로 둔다  
D) `max_depth`를 1로 고정한다  

**정답: A**  
해설: XGBoost의 `scale_pos_weight`를 음성/양성 비율로 두면 양성 오류에 더 큰 가중을 부여해 불균형을 알고리즘 수준에서 보정한다. 트리 수(B)·깊이(D)·학습률(C)은 불균형 가중과 직접 관련이 없다.

---

**문제 4.** 교차검증과 함께 SMOTE를 적용할 때 데이터 누수를 막는 올바른 방법은?

A) 전체 데이터에 SMOTE를 먼저 적용한 뒤 교차검증한다  
B) 검증셋에도 SMOTE를 적용한다  
C) SMOTE 후 무작위로 다시 섞는다  
D) imblearn Pipeline으로 각 fold의 학습 부분에만 SMOTE를 적용한다  

**정답: D**  
해설: 각 fold의 학습 부분 안에서만 리샘플링해야 합성 양성이 검증셋에 새어 들지 않는다 — imblearn Pipeline이 이를 보장한다. 전체 적용(A)·검증셋 적용(B)은 누수를 일으키고, 단순 셔플(C)은 누수를 막지 못한다.

---

**문제 5.** 사기 탐지에서 양성이 매우 희소하다. ROC-AUC보다 PR-AUC를 선호하는 이유로 가장 적절한 것은?

A) PR-AUC는 항상 ROC-AUC보다 값이 크다  
B) PR-AUC는 계산이 더 빠르다  
C) ROC의 거짓 양성률은 거대한 음성에 희석되어 소수 양성 성능을 과대평가할 수 있다  
D) ROC-AUC는 회귀에서만 쓸 수 있다  

**정답: C**  
해설: ROC의 FPR 분모에 많은 음성(TN+FP)이 들어가 소수 양성의 오류가 희석되므로, 양성에 집중하는 PR-AUC가 희소 클래스 성능 변화에 더 민감하다. 값 크기(A)·계산 속도(B)는 선호 이유가 아니고, ROC-AUC는 분류 지표(D 오류)다.

---
