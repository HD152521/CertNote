# Day 4 - 데이터 편향·품질: Clarify, 불균형 처리, 데이터 분할

특성을 잘 만들어도 데이터 자체가 한쪽으로 치우쳐 있으면 모델은 그 편향을 그대로 학습한다. 대출 심사 모델이 특정 성별에 불리하게 판단하거나, 사기 탐지 모델이 0.1%뿐인 사기를 전부 놓치는 일이 대표적이다. 오늘은 데이터의 공정성과 품질을 점검하는 도구와 기법을 본다.

MLA-C01 시험은 책임 있는 AI(Responsible AI)와 데이터 품질을 점점 비중 있게 다룬다. 세 축 — SageMaker Clarify의 편향 탐지, 클래스 불균형 처리, train/validation/test 분할 — 을 판별 기준 중심으로 정리한다.

## SageMaker Clarify: 편향 탐지와 설명가능성

**SageMaker Clarify**는 두 가지 일을 한다. (1) 학습 **전** 데이터의 편향을 측정하고, (2) 학습 **후** 모델 예측의 편향과 특성 기여도(설명가능성)를 분석한다.

핵심 개념은 **민감 속성(facet)**이다. 성별·인종·나이처럼 공정성을 따져야 하는 컬럼을 지정하면, Clarify가 그 그룹 간 데이터·예측이 균형 잡혔는지 지표로 보여준다.

```python
from sagemaker import clarify

clarify_processor = clarify.SageMakerClarifyProcessor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge", sagemaker_session=session
)

bias_config = clarify.BiasConfig(
    label_values_or_threshold=[1],      # 긍정 결과 (예: 대출 승인)
    facet_name="gender",                # 민감 속성
    facet_values_or_threshold=[0],      # 보호 그룹
)

clarify_processor.run_pre_training_bias(   # 학습 전 데이터 편향
    data_config=data_config, data_bias_config=bias_config,
)
```

대표적 편향 지표 둘만 기억하자. **Class Imbalance (CI)**는 그룹 간 표본 수가 얼마나 치우쳤는지, **Difference in Positive Proportions in Labels (DPL)**는 그룹 간 긍정 레이블 비율 차이를 잰다.

> 💡 **관련 이론**: 머신러닝 편향은 데이터에서 시작한다. "garbage in, garbage out"의 공정성 버전이다. 과거 데이터에 사회적 편향(예: 특정 그룹의 낮은 승인율)이 담겨 있으면, 모델은 그것을 "패턴"으로 학습해 편향을 자동화·증폭한다. 학습 전 편향 측정이 중요한 이유다 — 모델을 만들기 전에 데이터의 불균형을 먼저 잡지 않으면, 아무리 정확한 모델도 불공정한 결정을 빠르게 대량으로 내린다.

> 🔍 **더 깊이**: Clarify의 학습 후 분석은 **SHAP(SHapley Additive exPlanations)** 값으로 "각 특성이 예측에 얼마나 기여했나"를 계산한다. 게임이론의 Shapley 값에서 온 개념으로, 특성을 넣고 빼며 예측 변화의 공정한 몫을 배분한다. 규제 산업(금융·의료)에서 "왜 이 고객이 거절됐나"를 설명해야 할 때, SHAP 기반 특성 기여도가 그 근거가 된다.

## 클래스 불균형 처리

분류 데이터에서 한 클래스가 극단적으로 적은 것이 **클래스 불균형**이다. 사기(0.1%), 희귀 질병, 장비 고장처럼 정작 중요한 쪽이 소수인 경우가 많다. 그대로 두면 모델이 다수 클래스만 찍어도 높은 정확도가 나와 소수 클래스를 무시한다.

| 기법 | 방식 | 주의점 |
|------|------|--------|
| 언더샘플링 | 다수 클래스를 줄임 | 정보 손실 가능 |
| 오버샘플링(복제) | 소수 클래스를 복제 | 과적합 위험 |
| SMOTE | 소수 클래스 합성 샘플 생성 | 단순 복제보다 일반화↑ |
| class weight | 소수 클래스 오답에 큰 페널티 | 데이터를 안 늘림 |

```python
from imblearn.over_sampling import SMOTE

# SMOTE: 소수 클래스의 합성 샘플을 보간으로 생성
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
print(y_resampled.value_counts())   # 두 클래스가 균형을 이룸
```

> ⚠️ **함정**: 리샘플링은 **반드시 분할 후 학습 데이터에만** 적용한다. 분할 전에 전체 데이터에 SMOTE를 돌리면, 합성된 샘플이 검증·테스트 셋에 섞여 데이터 누수가 생기고 성능이 과대평가된다. 검증·테스트 셋은 실제 운영 분포(불균형 그대로)를 반영해야 평가가 정직하다.

> 💡 **관련 이론**: SMOTE(Synthetic Minority Over-sampling Technique)는 2002년 제안된 기법으로, 소수 클래스 표본 사이를 보간(interpolation)해 새 합성 샘플을 만든다. 단순 복제는 같은 점을 여러 번 놓아 모델이 그 점을 외우게(과적합) 하지만, SMOTE는 이웃 표본 사이의 새로운 점을 만들어 결정 경계를 부드럽게 한다. 다만 특성 공간에서 클래스가 겹치면 노이즈를 합성할 수 있어 만능은 아니다.

## train/validation/test 분할

모델 평가가 정직하려면 데이터를 세 덩어리로 나눠야 한다. 각 셋의 역할이 다르다.

| 셋 | 용도 | 비율(예시) |
|----|------|-----------|
| Train | 모델 파라미터 학습 | 70% |
| Validation | 하이퍼파라미터 튜닝·모델 선택 | 15% |
| Test | 최종 성능 1회 평가 (절대 학습에 안 씀) | 15% |

**Test 셋은 마지막에 단 한 번만** 본다. 테스트 결과를 보고 모델을 고치기 시작하면 테스트 셋이 사실상 검증 셋이 되어버려, 일반화 성능을 더는 정직하게 못 잰다.

```python
from sklearn.model_selection import train_test_split

# 1차: train+val vs test / 2차: train vs val (불균형이면 stratify로 비율 유지)
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.15, stratify=y, random_state=42
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.176, stratify=y_temp, random_state=42
)
```

`stratify=y`는 분할 시 각 셋의 클래스 비율을 원본과 같게 유지하는 **층화 분할(stratified split)**이다. 불균형 데이터에서 무작위 분할하면 어떤 셋엔 소수 클래스가 거의 안 들어갈 수 있어, 반드시 층화한다.

> 🔍 **더 깊이**: 시계열 데이터는 무작위 분할이 금물이다. 미래 데이터로 학습해 과거를 예측하는 미래 누수(look-ahead bias)가 생기기 때문이다. 시계열은 시점을 기준으로 "과거=train, 미래=test"로 나누는 시간 분할을 쓴다. 또 데이터가 적을 땐 단일 분할 대신 **k-fold 교차검증**으로 데이터를 k번 나눠 평균 성능을 본다 — 분할 운에 따른 변동을 줄인다.

## 정리하며

데이터의 공정성과 품질은 세 축으로 점검한다. **Clarify**로 학습 전후 편향(민감 속성 facet, CI·DPL 지표)과 설명가능성(SHAP)을 보고, **클래스 불균형**은 SMOTE·class weight 등으로 다루되 반드시 분할 후 학습 셋에만 적용하며, **train/val/test 분할**은 층화(불균형)·시간 분할(시계열)로 하고 test는 단 한 번만 쓴다. 정확한 모델보다 공정하고 정직하게 평가된 모델이 실제로 쓸 수 있는 모델이다.

다음 글에서는 이번 주 특성 공학과 데이터 품질 전체 — Data Wrangler, Feature Store, Clarify — 를 종합 복습하며 Week 3을 마무리한다.

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
