# Day 4 - Data Bias·Quality: Clarify, Class Imbalance Handling, Data Split

Even if features are well-engineered, if the data itself is biased in one direction, the model will learn that bias as-is. A loan approval model making unfavorable decisions for a particular gender, or a fraud detection model missing all fraud (only 0.1%) are typical examples. Today we look at tools and techniques for checking data fairness and quality.

The MLA-C01 exam increasingly emphasizes Responsible AI and data quality. Three axes — SageMaker Clarify's bias detection, class imbalance handling, train/validation/test split — are organized around evaluation criteria.

## SageMaker Clarify: Bias Detection and Explainability

**SageMaker Clarify** does two things: (1) Measure data bias **before** training, and (2) Analyze model prediction bias and feature contribution (explainability) **after** training.

The core concept is **sensitive attribute (facet)**. When you specify columns like gender, race, or age that require fairness consideration, Clarify shows metrics indicating whether data and predictions are balanced across those groups.

```python
from sagemaker import clarify

clarify_processor = clarify.SageMakerClarifyProcessor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge", sagemaker_session=session
)

bias_config = clarify.BiasConfig(
    label_values_or_threshold=[1],      # Positive outcome (e.g., loan approval)
    facet_name="gender",                # Sensitive attribute
    facet_values_or_threshold=[0],      # Protected group
)

clarify_processor.run_pre_training_bias(   # Pre-training data bias
    data_config=data_config, data_bias_config=bias_config,
)
```

Remember just two representative bias metrics. **Class Imbalance (CI)** measures how skewed the sample size is across groups, and **Difference in Positive Proportions in Labels (DPL)** measures the difference in positive label proportions across groups.

> 💡 **Related Theory**: Machine learning bias starts with data. It's the fairness version of "garbage in, garbage out". If historical data contains social bias (e.g., low approval rate for a particular group), the model learns it as a "pattern" and automates and amplifies the bias. That's why pre-training bias measurement matters — if you don't fix data imbalance before building the model, even the most accurate model will quickly produce unfair decisions at scale.

> 🔍 **Deeper Dive**: Clarify's post-training analysis calculates **SHAP (SHapley Additive exPlanations)** values to measure "how much each feature contributed to the prediction". Derived from game theory's Shapley value, it calculates the fair share of prediction change by adding and removing features. In regulated industries (finance, healthcare) where you must explain "why was this customer rejected", feature importance based on SHAP becomes the justification.

## Handling Class Imbalance

When one class is extremely rare in classification data, this is a **class imbalance**. Cases like fraud (0.1%), rare disease, or equipment failure often have the important class as a minority. If left alone, the model achieves high accuracy just by predicting the majority class and ignores the minority class.

| Technique | Approach | Caution |
|-----------|----------|---------|
| Undersampling | Reduce majority class | Information loss possible |
| Oversampling (replication) | Replicate minority class | Risk of overfitting |
| SMOTE | Generate synthetic minority samples | Better generalization than simple replication |
| class weight | Large penalty for minority class errors | Doesn't increase data size |

```python
from imblearn.over_sampling import SMOTE

# SMOTE: Generate synthetic minority samples through interpolation
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
print(y_resampled.value_counts())   # Two classes are now balanced
```

> ⚠️ **Pitfall**: Resampling must **always be applied only to training data after splitting**. If you run SMOTE on all data before splitting, the synthetic samples leak into validation and test sets, causing data leakage and overestimating performance. Validation and test sets should reflect actual production distribution (imbalance as-is) for honest evaluation.

> 💡 **Related Theory**: SMOTE (Synthetic Minority Over-sampling Technique) was proposed in 2002 and generates new synthetic samples by interpolating between minority class samples. Simple replication places the same point multiple times, causing the model to memorize it (overfitting), but SMOTE creates new points between neighboring samples, smoothing the decision boundary. However, it's not a silver bullet—if classes overlap in feature space, it may synthesize noise.

## train/validation/test Split

For honest model evaluation, data must be divided into three chunks. Each set has a different role.

| Set | Purpose | Ratio (example) |
|-----|---------|-----------------|
| Train | Learn model parameters | 70% |
| Validation | Hyperparameter tuning·model selection | 15% |
| Test | Final performance evaluation once (never used in training) | 15% |

**The test set is viewed only once at the end.** If you look at test results and start modifying the model, the test set becomes a de facto validation set, and you can no longer honestly measure generalization performance.

```python
from sklearn.model_selection import train_test_split

# First split: train+val vs test / Second split: train vs val (if imbalanced, use stratify to maintain ratios)
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.15, stratify=y, random_state=42
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.176, stratify=y_temp, random_state=42
)
```

`stratify=y` performs **stratified split**, maintaining each set's class proportions equal to the original. With imbalanced data, random splitting can result in almost no minority class in some sets, so stratification is mandatory.

> 🔍 **Deeper Dive**: For time series data, random splitting is a serious mistake. It causes look-ahead bias where the model learns from future data to predict the past. Time series should use temporal split based on time point: "past=train, future=test". Also, when data is scarce, instead of single split, **k-fold cross-validation** divides data k times to see average performance—reducing variation from split randomness.

## Summary

Data fairness and quality are checked along three axes. **Clarify** shows pre- and post-training bias (sensitive attribute facet, CI·DPL metrics) and explainability (SHAP), **class imbalance** is handled with SMOTE·class weight, etc., but must be applied only to training set after splitting, and **train/val/test split** uses stratification (for imbalance) and temporal split (for time series), viewing test only once. A fair and honestly evaluated model is more usable in practice than an accurate one.

Next, we'll comprehensively review this week's feature engineering and data quality — Data Wrangler, Feature Store, Clarify — and wrap up Week 3.

---

## 📝 연습 문제

**문제 1.** 대출 승인 모델을 만들기 전에 데이터가 성별 그룹 간 균형 잡혀 있는지, 긍정 레이블 비율에 차이가 없는지 측정하려 한다. 적합한 도구와 단계는?

A) 학습 후 Model Monitor로 지연시간을 측정  
B) SageMaker Clarify로 학습 전 편향(pre-training bias)을 측정  
C) Athena로 데이터 용량을 계산  
D) SageMaker Autopilot으로 자동 학습  

**정답: B**  
해설: Clarify의 학습 전 편향 분석은 민감 속성(facet)을 지정해 그룹 간 표본 불균형(CI)과 긍정 레이블 비율 차이(DPL)를 측정하므로 적합하다. Model Monitor(A)는 배포 후 운영 모니터링, Athena 용량 계산(C)·Autopilot 학습(D)은 편향 측정과 목적이 다르다.

---

**문제 2.** 사기 거래가 전체의 0.2%뿐인 불균형 데이터에서 소수 클래스의 합성 샘플을 보간으로 생성해 단순 복제보다 일반화를 높이려 한다. 적합한 기법은?

A) 언더샘플링  
B) SMOTE  
C) 모든 데이터 삭제  
D) 다수 클래스 복제  

**정답: B**  
해설: SMOTE는 소수 클래스 표본 사이를 보간해 새 합성 샘플을 만들어, 같은 점을 반복 놓는 단순 복제보다 결정 경계를 부드럽게 하고 과적합을 줄인다. 언더샘플링(A)은 다수를 줄여 정보 손실이 있고, 데이터 삭제(C)는 부적절하며, 다수 클래스 복제(D)는 불균형을 악화시킨다.

---

**문제 3.** 불균형 데이터에 SMOTE를 적용하려 한다. 데이터 누수를 막기 위한 올바른 순서는?

A) 전체 데이터에 SMOTE를 먼저 적용한 뒤 train/test로 분할  
B) train/test로 먼저 분할한 뒤 학습 셋에만 SMOTE 적용  
C) test 셋에만 SMOTE 적용  
D) 분할 없이 전체에 적용  

**정답: B**  
해설: 분할을 먼저 하고 학습 셋에만 리샘플링해야 합성 샘플이 검증·테스트 셋에 새지 않아 평가가 정직해진다. 분할 전 전체 적용(A·D)은 합성 샘플이 평가 셋에 섞여 누수를 일으키고, test에만 적용(C)은 평가 분포를 왜곡한다.

---

**문제 4.** train/validation/test 분할에서 test 셋의 올바른 사용 원칙은?

A) 하이퍼파라미터를 튜닝할 때마다 반복해서 평가에 사용한다  
B) 최종 모델의 일반화 성능을 단 한 번만 평가하는 데 사용한다  
C) 학습 파라미터 갱신에 직접 사용한다  
D) 매 epoch마다 손실 계산에 사용한다  

**정답: B**  
해설: test 셋은 최종 성능을 정직하게 평가하기 위해 마지막에 단 한 번만 사용한다. 반복 평가로 모델을 고치면(A) test가 사실상 validation이 되어 일반화 추정이 왜곡되고, 학습 파라미터 갱신(C)·epoch별 손실(D)은 train/validation의 역할이다.

---

**문제 5.** 클래스가 심하게 불균형한 데이터를 train/test로 나눌 때, 각 셋이 원본의 클래스 비율을 유지하도록 분할하려 한다. 적합한 방법은?

A) 완전 무작위 분할  
B) 층화 분할(stratified split, stratify 옵션)  
C) 시간 순서로 분할  
D) 클래스를 무시하고 알파벳 순 분할  

**정답: B**  
해설: 층화 분할은 각 셋의 클래스 비율을 원본과 동일하게 유지해, 불균형 데이터에서 소수 클래스가 특정 셋에 거의 없게 되는 문제를 막는다. 무작위 분할(A)은 비율이 흔들릴 수 있고, 시간 분할(C)은 시계열 전용이며, 알파벳 순 분할(D)은 비율 보장과 무관하다.

---
