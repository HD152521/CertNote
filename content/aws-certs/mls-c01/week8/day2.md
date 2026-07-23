# Day 2 - 하이퍼파라미터 튜닝(AMT): 베이지안·랜덤·Hyperband

어제 학습 작업 한 번을 잘 돌리는 법을 배웠다면, 오늘은 그 학습을 **여러 번 자동으로 돌려 최적의 하이퍼파라미터 조합을 탐색**하는 SageMaker Automatic Model Tuning(AMT, Hyperparameter Tuning Job)을 다룬다. 시험은 탐색 전략(베이지안/랜덤/그리드/Hyperband), 조기 종료, 워밍 스타트, 목표 지표 설정을 단서로 출제한다.

## 하이퍼파라미터 vs 파라미터

먼저 용어를 정리한다.

- **파라미터(parameter)**: 학습 과정에서 데이터로부터 **학습되는 값**(예: 신경망 가중치, 선형 모델 계수).
- **하이퍼파라미터(hyperparameter)**: 학습 **전에 사람이 정하는 값**(예: 학습률, max_depth, 트리 개수, 정규화 강도).

AMT는 하이퍼파라미터 공간을 탐색해 검증 지표가 가장 좋은 조합을 찾는다.

```text
탐색 공간 정의 → 여러 학습 작업(trial) 실행 → 각 trial의 목표 지표 평가
→ 다음 trial의 하이퍼파라미터를 전략에 따라 선택 → 최적 조합 반환
```

> 💡 **관련 이론**: 하이퍼파라미터 튜닝은 본질적으로 "검은 상자 최적화"다. 목표 함수(검증 지표)는 미분 불가능하고 한 번 평가하는 비용(=학습 한 번)이 비싸다. 그래서 가능한 적은 평가로 좋은 영역을 찾는 전략(베이지안, Hyperband)이 무작위·격자 탐색보다 효율적이다.

## 탐색 전략 4가지

AMT가 지원하는 전략과 특성이다.

| 전략 | 동작 | 특징 |
|------|------|------|
| **Grid** | 모든 조합을 격자로 전수 탐색 | 차원이 늘면 폭발(curse of dimensionality), 범주형에만 권장 |
| **Random** | 공간에서 무작위 샘플링 | 단순·병렬화 쉬움, 고차원에서 그리드보다 종종 효율적 |
| **Bayesian** | 이전 결과로 surrogate 모델을 만들어 유망 영역 집중 | 평가 횟수당 효율 높음, 순차성 강함 |
| **Hyperband** | 다중 fidelity — 자원을 적게 주고 가망 없는 trial 조기 중단 | 반복 학습(딥러닝)에 강력, 빠른 수렴 |

```python
from sagemaker.tuner import HyperparameterTuner, ContinuousParameter, IntegerParameter

tuner = HyperparameterTuner(
    estimator=est,
    objective_metric_name="validation:auc",
    objective_type="Maximize",
    hyperparameter_ranges={
        "eta": ContinuousParameter(0.01, 0.3),
        "max_depth": IntegerParameter(3, 10),
    },
    strategy="Bayesian",      # Bayesian | Random | Grid | Hyperband
    max_jobs=30,
    max_parallel_jobs=3,
)
tuner.fit({"train": train_s3, "validation": val_s3})
```

판별 신호:
- "적은 학습 횟수로 효율적 탐색" → **Bayesian**.
- "딥러닝처럼 에폭 반복 + 빠르게 가망 없는 후보 버리고 싶다" → **Hyperband**.
- "단순/완전 병렬, 베이스라인" → **Random**.
- "범주형 소수 조합 전수" → **Grid**.

## 목표 지표(Objective Metric)

AMT는 각 trial의 로그에서 정규식으로 지표를 뽑아 비교한다.

- 빌트인 알고리즘은 표준 지표명을 그대로 제공(`validation:auc`, `validation:rmse` 등).
- 커스텀 스크립트는 `metric_definitions`로 로그에서 값을 파싱할 정규식을 지정해야 한다.

```python
metric_definitions=[
    {"Name": "validation:f1", "Regex": "val_f1: ([0-9\\.]+)"}
]
```

- **objective_type**: Maximize(AUC, F1, Accuracy) 또는 Minimize(RMSE, Loss).
- 지표 선택이 곧 "무엇을 최적화하는가"이므로, 불균형 데이터면 Accuracy보다 F1/AUC를 목표로 삼는 게 옳다.

> 💡 **관련 이론**: 튜닝은 목표 지표가 가리키는 방향으로만 최적화한다. 사기 탐지처럼 양성이 1%인 데이터에서 Accuracy를 최대화하면 "전부 정상"이라 찍어도 99%가 나와 모델이 무의미해진다. 그래서 목표 지표를 비즈니스 목적과 데이터 불균형에 맞게(F1, Recall, AUC 등) 고르는 것이 튜닝 성공의 전제다.

## 조기 종료(Early Stopping)

가망 없는 trial을 일찍 멈춰 비용을 아낀다. 두 층위를 구분하라.

- **trial 수준 조기 종료(`early_stopping_type="Auto"`)**: 학습 도중 목표 지표가 다른 trial 대비 나아질 가망이 없으면 그 학습 작업을 중단. 베이지안/랜덤 전략과 함께 쓰는 옵션.
- **Hyperband**: 전략 자체가 다중 fidelity로 자원을 차등 배분하며 조기 중단을 내장. 별도 early_stopping_type을 무시한다.

```python
tuner = HyperparameterTuner(
    ..., early_stopping_type="Auto",   # Off | Auto
)
```

판별 신호: "튜닝 비용을 줄이려 가망 없는 학습을 자동 중단" → 조기 종료(Auto) 또는 Hyperband.

## 워밍 스타트(Warm Start)

새 튜닝 작업을 **이전 튜닝 작업의 결과를 활용해** 시작한다. 처음부터 탐색하지 않고 이미 알아낸 좋은 영역에서 출발한다.

| 타입 | 의미 |
|------|------|
| **IDENTICAL_DATA_AND_ALGORITHM** | 데이터·알고리즘 동일, 탐색을 이어서 확장(예: max_jobs 더 늘림) |
| **TRANSFER_LEARNING** | 데이터/알고리즘이 약간 바뀌어도 이전 지식을 전이 |

```python
from sagemaker.tuner import WarmStartConfig, WarmStartTypes

warm = WarmStartConfig(
    warm_start_type=WarmStartTypes.IDENTICAL_DATA_AND_ALGORITHM,
    parents={"previous-tuning-job-name"},
)
tuner = HyperparameterTuner(..., warm_start_config=warm)
```

판별 신호:
- "지난 튜닝을 이어서 더 탐색 / 데이터·알고리즘 그대로" → **IDENTICAL_DATA_AND_ALGORITHM**.
- "데이터가 살짝 바뀌었지만 지난 튜닝 지식을 재사용" → **TRANSFER_LEARNING**.

## 병렬성 vs 베이지안 효율의 트레이드오프

- `max_parallel_jobs`를 크게 하면 빨리 끝나지만, 베이지안은 이전 결과를 보고 다음을 정하므로 **병렬을 너무 키우면 학습 효율(정보 활용)이 떨어진다**.
- Random은 병렬성을 키워도 효율 손실이 없다(서로 독립).
- 시험에서 "베이지안인데 병렬을 최대로 했더니 기대만큼 좋아지지 않았다"는 이 트레이드오프가 답.

## 시험 팁

- 전략 선택: "효율적 적은 평가" → Bayesian, "에폭 반복 딥러닝 + 빠른 가지치기" → Hyperband, "단순 베이스라인" → Random, "범주형 전수" → Grid.
- "튜닝 비용 절감" → 조기 종료(Auto) 또는 Hyperband.
- "이전 튜닝 결과 재사용 / 이어서 탐색" → 워밍 스타트.
- 커스텀 알고리즘은 metric_definitions 정규식으로 목표 지표를 추출해야 함을 기억.
- 불균형 데이터의 목표 지표는 Accuracy가 아니라 F1/AUC.

## 정리하며

오늘은 AMT로 하이퍼파라미터를 자동 탐색하는 법을 다뤘다. 핵심 흐름은 **탐색 공간·목표 지표 정의 → 전략 선택(베이지안/Hyperband/랜덤/그리드) → 조기 종료로 비용 절감 → 워밍 스타트로 이전 작업 재사용**이다. 내일은 튜닝의 목적지인 "좋은 일반화"를 가로막는 과적합·과소적합과 그 대응(정규화·데이터 증강)을 다룬다.

---

## 📝 연습 문제

**문제 1.** 한 데이터 과학자가 딥러닝 모델을 튜닝하는데, 각 trial이 여러 에폭을 학습한다. 가망 없는 후보에 자원을 낭비하지 않고 빠르게 좋은 조합으로 수렴하려 한다. 가장 적합한 AMT 전략은?

A) Grid Search  
B) Random Search  
C) Bayesian  
D) Hyperband  

**정답: D**  
해설: Hyperband는 다중 fidelity 전략으로 적은 자원을 먼저 주고 가망 없는 trial을 조기 중단해, 에폭 반복형 딥러닝 튜닝에서 빠르게 수렴한다. 그리드(A)는 조합 폭발에 취약하고, 랜덤(B)은 가지치기가 없으며, 베이지안(C)도 효율적이나 반복 학습의 다중 fidelity 조기중단은 Hyperband가 특화되어 있다.

---

**문제 2.** 양성 클래스(사기)가 전체의 1%인 불균형 데이터로 분류 모델을 튜닝한다. AMT의 목표 지표로 가장 부적절한 것은?

A) validation:auc  
B) validation:f1  
C) validation:accuracy  
D) validation:recall  

**정답: C**  
해설: 1% 불균형에서 Accuracy를 최대화하면 전부 음성으로 찍어도 99%가 나와 양성 탐지 능력을 전혀 반영하지 못한다. AUC(A)·F1(B)·Recall(D)은 불균형에서 양성 식별 성능을 더 잘 반영하므로 목표 지표로 적절하다.

---

**문제 3.** 어제 끝난 튜닝 작업이 좋은 영역을 어느 정도 찾았다. 같은 데이터와 알고리즘으로 탐색을 처음부터 다시 하지 않고 이어서 더 진행하려 한다. 가장 적절한 기능은?

A) IDENTICAL_DATA_AND_ALGORITHM 타입의 워밍 스타트  
B) max_parallel_jobs를 최대로 설정  
C) 전략을 Grid로 변경  
D) early_stopping_type을 Off로 설정  

**정답: A**  
해설: 데이터·알고리즘이 동일하고 이전 탐색을 이어서 확장하려면 IDENTICAL_DATA_AND_ALGORITHM 타입 워밍 스타트가 정답이다. 병렬 증가(B)·전략 변경(C)·조기종료 끄기(D)는 이전 작업의 탐색 지식을 재사용하는 것과 무관하다.

---

**문제 4.** 베이지안 전략으로 튜닝하면서 max_parallel_jobs를 매우 크게 설정했더니, 기대보다 최적 조합 탐색 효율이 떨어졌다. 가장 가능성 높은 원인은?

A) 베이지안은 그리드보다 항상 비효율적이다  
B) 병렬 trial이 많으면 이전 결과를 활용해 다음을 정하는 베이지안의 이점이 줄어든다  
C) 목표 지표를 Minimize로 잘못 설정했다  
D) Spot 인스턴스를 사용했기 때문이다  

**정답: B**  
해설: 베이지안은 이전 trial 결과로 다음 후보를 정하므로 순차성이 핵심이다. 병렬을 과도하게 키우면 아직 결과가 없는 상태에서 후보를 정해야 해 정보 활용 이점이 줄어든다. 베이지안이 항상 비효율(A)이 아니며, Minimize 설정(C)·Spot(D)은 이 현상과 직접 관련이 없다.

---

**문제 5.** 커스텀 학습 스크립트로 AMT를 돌릴 때, AMT가 각 trial의 목표 지표 값을 인식하게 하려면 반드시 해야 하는 것은?

A) instance_count를 늘린다  
B) metric_definitions에 로그에서 지표를 추출할 정규식을 지정한다  
C) 입력 모드를 Pipe로 바꾼다  
D) max_jobs를 1로 둔다  

**정답: B**  
해설: 커스텀 스크립트는 표준 지표명을 자동 제공하지 않으므로, 학습 로그에 출력한 지표를 정규식으로 파싱하도록 metric_definitions를 지정해야 AMT가 목표 지표를 읽는다. 인스턴스 수(A)·입력 모드(C)·max_jobs(D)는 지표 인식과 무관하다.

---
