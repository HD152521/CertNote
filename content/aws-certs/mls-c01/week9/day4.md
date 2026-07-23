# Day 4 - 모델 디버깅과 편향: SageMaker Debugger와 Clarify

지표가 좋아도 모델은 학습 중에 망가지거나(기울기 소실, 과적합), 특정 집단에 불공정하거나, 설명 불가능한 블랙박스일 수 있다. AWS는 이 세 문제를 두 서비스로 다룬다. **SageMaker Debugger**는 학습 과정의 내부 상태를 실시간 포착해 디버깅하고, **SageMaker Clarify**는 데이터/모델의 편향을 측정하고 SHAP으로 예측을 설명한다. 오늘은 둘의 역할 분담과 오류 분석 흐름을 정리한다. 핵심 구분은 "Debugger=학습 과정의 건강, Clarify=편향과 설명가능성"이다.

## SageMaker Debugger: 학습 과정을 들여다보다

Debugger는 학습 중 텐서(가중치, 기울기, 손실, 활성값 등)를 주기적으로 캡처해 S3에 저장하고, **규칙(Rule)**으로 이상을 자동 탐지한다. 학습이 잘못된 방향으로 갈 때 조기에 알아챈다.

```python
from sagemaker.debugger import Rule, rule_configs, DebuggerHookConfig

rules = [
    Rule.sagemaker(rule_configs.vanishing_gradient()),   # 기울기 소실
    Rule.sagemaker(rule_configs.overfit()),              # 과적합
    Rule.sagemaker(rule_configs.loss_not_decreasing()),  # 손실 정체
    Rule.sagemaker(rule_configs.exploding_tensor()),     # 발산
]

estimator = Estimator(
    ...,
    rules=rules,
    debugger_hook_config=DebuggerHookConfig(s3_output_path="s3://bucket/debug"),
)
```

대표 빌트인 규칙:

| 규칙 | 탐지하는 문제 |
|------|------|
| `vanishing_gradient` | 기울기가 0에 수렴 → 학습 정체 |
| `exploding_tensor` | 값 발산(NaN/Inf) |
| `overfit` | 검증 손실↑ 학습 손실↓ 괴리 |
| `loss_not_decreasing` | 손실이 줄지 않음 |
| `class_imbalance` | 클래스 불균형 |
| `poor_weight_initialization` | 초기화 불량 |

규칙이 발화하면 CloudWatch Events/EventBridge로 알림을 보내거나, 비용을 아끼기 위해 망가진 학습 잡을 자동 중단(early stopping)할 수 있다.

> 💡 **관련 이론**: Debugger의 가치는 "실패를 일찍 잡아 비용을 줄이는 것"이다. 딥러닝 학습은 GPU 시간이 비싸므로, 기울기가 소실되거나 손실이 발산하는 잡을 끝까지 돌린 뒤에야 발견하면 큰 낭비다. Debugger 규칙은 학습 중간에 이를 감지해 자동 중단/알림을 트리거하므로, "왜 안 되는지"의 디버깅과 "돈 낭비 방지"를 동시에 해결한다.

## SageMaker Clarify: 편향과 설명가능성

Clarify는 두 가지를 한다: **편향 탐지**와 **설명가능성(SHAP)**. 공정성 규제나 모델 신뢰가 중요한 도메인에서 필수다.

### 학습 전 편향(Pre-training Bias)

모델을 만들기 전, **데이터 자체**의 편향을 측정한다. 민감 속성(성별, 인종, 연령 등)을 기준으로 클래스/레이블 분포가 치우쳤는지 본다.

```text
대표 지표:
- CI (Class Imbalance): 특정 집단의 표본이 과대/과소
- DPL (Difference in Positive Proportions in Labels):
       집단 간 긍정 레이블 비율 차이
- KL/JS Divergence: 집단 간 레이블 분포의 거리
```

### 학습 후 편향(Post-training Bias)

학습된 **모델의 예측**이 집단 간에 불공정한지 측정한다.

```text
대표 지표:
- DPPL (Difference in Positive Proportions in Predicted Labels)
- DI (Disparate Impact): 집단 간 긍정 예측률의 비율
- RD (Recall Difference): 집단 간 재현율 차이
- AD (Accuracy Difference): 집단 간 정확도 차이
```

학습 전 데이터는 공정해 보여도 모델이 편향을 증폭할 수 있으므로 두 단계 모두 확인한다.

### SHAP 기반 설명가능성

Clarify는 SHAP(SHapley Additive exPlanations) 값을 계산해 "각 피처가 이 예측을 얼마나, 어느 방향으로 밀었는가"를 정량화한다. 게임이론의 Shapley 값을 기반으로 피처 기여도를 공정하게 분배한다.

```python
from sagemaker.clarify import (
    SageMakerClarifyProcessor, BiasConfig, DataConfig, ModelConfig, SHAPConfig
)

bias_config = BiasConfig(
    label_values_or_threshold=[1],
    facet_name="gender",          # 민감 속성
    facet_values_or_threshold=[0],
)
shap_config = SHAPConfig(baseline=baseline_rows, num_samples=100)

clarify_processor.run_bias(data_config, bias_config, model_config)
clarify_processor.run_explainability(data_config, model_config, shap_config)
```

SHAP은 **전역(global) 중요도**(전체 데이터에서 피처가 평균적으로 얼마나 중요한가)와 **국소(local) 설명**(특정 한 예측이 왜 그렇게 나왔는가) 둘 다 제공한다. SageMaker Model Monitor와 결합하면 운영 중 피처 기여도 변화(설명가능성 드리프트)도 추적할 수 있다.

> 💡 **관련 이론**: 편향과 설명가능성은 다른 문제다. 편향 지표(DI, DPPL)는 "집단 간 결과가 공정한가"라는 윤리적/법적 질문에 답하고, SHAP은 "이 예측이 왜 나왔는가"라는 신뢰/디버깅 질문에 답한다. 그래서 SHAP은 편향의 *원인*을 진단하는 데도 쓰인다 — 어떤 피처가 민감 속성의 대리변수(proxy)로 작동해 편향을 만드는지 드러내기 때문이다.

## 두 서비스의 역할 분담

시험에서 가장 헷갈리는 지점이다. 키워드로 갈라낸다.

| 키워드/문제 | 서비스 |
|------|------|
| 기울기 소실/폭발, 과적합 실시간 탐지 | **Debugger** |
| 학습 잡 자동 중단으로 비용 절감 | **Debugger** |
| 텐서/가중치/활성값 캡처 | **Debugger** |
| 성별/인종 등 집단 간 공정성 측정 | **Clarify (편향)** |
| 규제 대응, 데이터·모델 편향 보고서 | **Clarify (편향)** |
| 피처 기여도(SHAP), 예측 설명 | **Clarify (설명가능성)** |

## 오류 분석: 지표 너머로

지표와 도구를 갖췄다면 마지막은 사람이 하는 오류 분석이다. 모델이 틀린 케이스를 모아 패턴을 찾는다.

```text
오류 분석 흐름:
1) 오분류/큰 오차 샘플을 수집
2) 공통 특성으로 그룹핑 (특정 클래스? 특정 피처 구간? 특정 집단?)
3) 원인 가설: 데이터 부족 / 라벨 노이즈 / 피처 누락 / 편향
4) SHAP으로 그 예측에 기여한 피처 확인
5) 가장 큰 오류 버킷부터 데이터·피처·모델 개선
```

예를 들어 "야간 거래에서만 사기 탐지 재현율이 급락"한다면, 야간 샘플 부족이나 시간 관련 피처 누락을 의심하고 SHAP으로 검증한다. 오류 분석은 무작정 하이퍼파라미터를 돌리기 전에 "어디를 고칠지"를 알려준다.

> 💡 **관련 이론**: 좋은 오류 분석은 가장 큰 오류 버킷에 자원을 집중시키는 우선순위화다. 전체 정확도를 1% 올리는 막연한 튜닝보다, 오류의 40%를 차지하는 단일 패턴(예: 특정 집단의 데이터 부족)을 고치는 편이 효과가 크다. SHAP과 편향 지표는 이 버킷을 정량적으로 식별하는 도구이고, Debugger는 그 원인이 학습 과정 자체에 있는지 가려낸다.

## 정리하며

모델 디버깅은 세 층위다. (1) **Debugger**는 학습 과정의 건강(기울기·손실·과적합)을 실시간 감시하고 망가진 잡을 자동 중단해 비용을 아낀다. (2) **Clarify**는 학습 전/후 편향을 지표로 측정하고 SHAP으로 예측을 설명한다. (3) **오류 분석**은 틀린 케이스를 그룹핑해 가장 큰 오류 버킷부터 고친다. 시험에서는 "텐서/기울기/과적합=Debugger, 공정성/SHAP=Clarify"로 갈라내는 것이 핵심이다.

내일은 Week 9 전체 — 분류·회귀 지표, 곡선과 임계값, 디버깅과 편향 — 를 하나의 평가·디버깅 흐름으로 종합 복습한다.

---

## 📝 연습 문제

**문제 1.** 딥러닝 학습 잡에서 기울기가 점점 0에 수렴해 학습이 정체되는 문제를 실시간으로 자동 탐지하고, 망가진 잡을 일찍 중단해 비용을 아끼고 싶다. 적절한 서비스는?

A) SageMaker Clarify  
B) SageMaker Model Monitor  
C) SageMaker Ground Truth  
D) SageMaker Debugger  

**정답: D**  
해설: 기울기 소실/폭발·과적합 등 학습 과정의 텐서를 실시간 포착하고 규칙으로 자동 중단까지 하는 것은 Debugger다. Clarify(A)는 편향/설명, Model Monitor(B)는 운영 드리프트, Ground Truth(C)는 라벨링 서비스다.

---

**문제 2.** 대출 승인 모델이 성별 집단 간에 긍정 예측률이 크게 다른지 규제 대응을 위해 정량적으로 측정하려 한다. 사용할 도구와 지표 유형은?

A) Clarify의 학습 후 편향 지표(예: Disparate Impact)  
B) Debugger의 vanishing_gradient 규칙  
C) RMSE  
D) Ground Truth 라벨 합의율  

**정답: A**  
해설: 집단 간 예측 공정성은 Clarify의 학습 후 편향 지표(DPPL, Disparate Impact 등)로 측정한다. Debugger 규칙(B)은 학습 과정용, RMSE(C)는 회귀 오차, 라벨 합의율(D)은 라벨링 품질이다.

---

**문제 3.** "이 특정 대출 거절 예측에서 어떤 피처가 결정에 가장 크게 기여했는가"를 고객에게 설명해야 한다. 가장 적절한 기법은?

A) Debugger의 overfit 규칙  
B) Clarify의 SHAP 값(국소 설명)  
C) 혼동행렬  
D) ROC 곡선  

**정답: B**  
해설: 개별 예측에 대한 피처 기여도 설명은 Clarify가 제공하는 SHAP 값(국소 설명)이 정확히 그 역할을 한다. overfit 규칙(A)은 과적합 탐지, 혼동행렬(C)·ROC(D)는 전체 분류 성능 평가지표다.

---

**문제 4.** 학습 전 편향(pre-training bias) 분석의 목적으로 옳은 것은?

A) 학습된 모델의 예측이 집단 간 공정한지 본다  
B) 기울기 폭발을 탐지한다  
C) 모델을 만들기 전 데이터 자체의 집단 간 레이블 분포 치우침을 본다  
D) 추론 지연시간을 측정한다  

**정답: C**  
해설: 학습 전 편향은 모델 생성 이전 단계에서 데이터 자체의 집단별 분포/레이블 치우침(CI, DPL 등)을 측정한다. 모델 예측의 공정성(A)은 학습 후 편향이고, 기울기(B)·지연시간(D)은 편향 분석과 무관하다.

---

**문제 5.** 사기 탐지 모델이 전체 재현율은 양호하지만 "야간 거래"에서만 재현율이 급락한다. 가장 효과적인 다음 단계는?

A) 오류 분석으로 야간 오류 버킷을 식별하고 SHAP·데이터 부족 여부를 확인해 그 버킷부터 개선한다  
B) 즉시 모델을 폐기하고 처음부터 다시 학습한다  
C) 전체 학습률만 무작위로 바꿔 본다  
D) 정확도 지표만 보고 배포를 강행한다  

**정답: A**  
해설: 특정 구간에서만 성능이 나쁘면 오류 분석으로 해당 버킷을 식별하고 SHAP/데이터 부족 원인을 진단해 우선 개선하는 것이 효과적이다. 전체 재학습(B)·무작위 튜닝(C)은 비효율적이고, 문제를 무시한 배포(D)는 위험하다.

---
