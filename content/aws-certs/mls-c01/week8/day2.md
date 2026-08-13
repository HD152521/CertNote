# Day 2 - 하이퍼파라미터 튜닝(AMT): 베이지안·랜덤·Hyperband

## 📌 핵심 정리

- **파라미터는 학습되는 값, 하이퍼파라미터는 학습 전에 사람이 정하는 값**이다. AMT는 후자의 공간을 탐색해 검증 지표가 가장 좋은 조합을 찾는다.
- 전략 선택: 적은 평가로 효율적이면 **Bayesian**, 에폭 반복형 딥러닝의 가지치기는 **Hyperband**, 단순·완전 병렬 베이스라인은 **Random**, 범주형 소수 조합 전수는 **Grid**.
- **목표 지표가 곧 최적화 방향**이다. 불균형 데이터에서 Accuracy를 최대화하면 "전부 음성"으로도 99%가 나와 모델이 무의미해진다 — F1·AUC·Recall을 쓴다.
- 커스텀 스크립트는 표준 지표명이 없으므로 **`metric_definitions` 정규식**으로 로그에서 지표를 뽑아야 AMT가 인식한다.
- **`max_parallel_jobs`를 과도하게 키우면 베이지안의 이점이 줄어든다**(이전 결과를 못 보고 후보를 정하므로). Random은 독립이라 손실이 없다.

## 하이퍼파라미터 vs 파라미터

어제 학습 작업 한 번을 잘 돌리는 법을 배웠다면, 오늘은 그 학습을 **여러 번 자동으로 돌려 최적 조합을 탐색**하는 SageMaker Automatic Model Tuning(AMT, Hyperparameter Tuning Job)을 다룬다.

| 구분 | 누가 정하나 | 언제 정해지나 | 예시 |
|---|---|---|---|
| **파라미터** | 학습 알고리즘 | 학습 과정에서 데이터로부터 | 신경망 가중치, 선형 모델 계수 |
| **하이퍼파라미터** | 사람(또는 AMT) | 학습 시작 **전** | 학습률, `max_depth`, 트리 개수, 정규화 강도 |

```text
탐색 공간 정의 → 여러 학습 작업(trial) 실행 → 각 trial의 목표 지표 평가
→ 다음 trial의 하이퍼파라미터를 전략에 따라 선택 → 최적 조합 반환
```

> 💡 **관련 이론**: 하이퍼파라미터 튜닝은 본질적으로 "검은 상자 최적화"다. 목표 함수(검증 지표)는 미분 불가능하고 한 번 평가하는 비용(=학습 한 번)이 비싸다. 그래서 가능한 적은 평가로 좋은 영역을 찾는 전략(베이지안, Hyperband)이 무작위·격자 탐색보다 효율적이다.

### 튜닝 잡의 실행 구조

```text
[HyperparameterTuner]
   │  탐색 공간: eta ∈ [0.01, 0.3], max_depth ∈ [3, 10]
   │  목표 지표: validation:auc (Maximize)
   ▼
 ┌──────────── max_parallel_jobs 만큼 동시 실행 ────────────┐
 │  trial#1 ──학습──→ auc 0.81                              │
 │  trial#2 ──학습──→ auc 0.86  ← 유망                      │
 │  trial#3 ──학습──→ auc 0.74  ← 가망 없음(조기 종료 대상) │
 └──────────────────────────────────────────────────────────┘
   │  전략(Bayesian 등)이 결과를 보고 다음 후보 선택
   ▼  … max_jobs 소진까지 반복 …
[최적 조합 + BestTrainingJob 반환]
```

## 탐색 전략 4가지

AMT가 지원하는 전략과 특성이다.

| 전략 | 동작 | 언제 쓰나 | 언제 쓰면 안 되나 |
|---|---|---|---|
| **Grid** | 모든 조합을 격자로 전수 탐색 | 범주형 값 소수 조합을 빠짐없이 보고 싶을 때 | 연속형·고차원 공간(조합 폭발, curse of dimensionality) |
| **Random** | 공간에서 무작위 샘플링 | 단순 베이스라인, 완전 병렬로 빨리 훑고 싶을 때 | 학습 비용이 비싸 평가 횟수를 아껴야 할 때 |
| **Bayesian** | 이전 결과로 surrogate 모델을 만들어 유망 영역 집중 | 평가 1회가 비싸 **적은 횟수로 좋은 값**을 찾아야 할 때 | 병렬을 극단적으로 키워야 할 때(순차성이 이점의 원천) |
| **Hyperband** | 다중 fidelity — 자원을 적게 주고 가망 없는 trial 조기 중단 | 에폭을 반복하는 딥러닝 학습, 빠른 수렴이 목표 | 반복 단계가 없어 중간 성능을 볼 수 없는 학습 |

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

> ⚠️ **함정**: 그리드 탐색은 "빠짐없이 본다"는 말 때문에 안전해 보이지만, 연속형 하이퍼파라미터가 몇 개만 섞여도 조합 수가 폭발한다. 지문에 연속 범위(`ContinuousParameter`)가 등장하면 Grid는 사실상 오답 후보다.

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

### 상황별 목표 지표 해석표

| 상황 | 목표 지표 후보 | 방향 | 왜 / 무엇을 조심하나 |
|---|---|---|---|
| 클래스가 대체로 균형인 분류 | `validation:accuracy` | Maximize | 균형일 때만 정확도가 정직한 신호다 |
| 양성이 1% 수준인 사기·이상 탐지 | `validation:f1`, `validation:auc` | Maximize | **정확도는 "전부 음성"으로도 99%** — 함정 |
| 놓치면 치명적(질병·사기 미탐) | `validation:recall` | Maximize | 위양성을 감수하고 놓침을 줄인다 |
| 오탐 비용이 큰 알림·차단 | `validation:precision` | Maximize | 맞다고 한 것 중 실제 비율을 높인다 |
| 임계값을 아직 못 정한 랭킹형 문제 | `validation:auc` | Maximize | 임계값과 무관하게 순위 품질을 본다 |
| 연속값 예측(수요·가격) | `validation:rmse` | **Minimize** | 오차 지표는 방향이 반대 — 설정 실수 주의 |

> 💡 **관련 이론**: 튜닝은 목표 지표가 가리키는 방향으로만 최적화한다. 사기 탐지처럼 양성이 1%인 데이터에서 Accuracy를 최대화하면 "전부 정상"이라 찍어도 99%가 나와 모델이 무의미해진다. 그래서 목표 지표를 비즈니스 목적과 데이터 불균형에 맞게(F1, Recall, AUC 등) 고르는 것이 튜닝 성공의 전제다.

> ⚠️ **함정**: 커스텀 컨테이너·스크립트를 쓰면서 `metric_definitions`를 빼먹으면 AMT가 지표를 읽지 못한다. 이때 `instance_count`를 늘리거나 입력 모드를 바꾸는 보기는 전부 무관한 오답이다.

## 조기 종료(Early Stopping)

가망 없는 trial을 일찍 멈춰 비용을 아낀다. 두 층위를 구분하라.

| 층위 | 설정 | 동작 |
|---|---|---|
| trial 수준 조기 종료 | `early_stopping_type="Auto"` (기본 `Off`) | 학습 도중 목표 지표가 다른 trial 대비 나아질 가망이 없으면 그 학습 작업을 중단. 베이지안/랜덤과 함께 쓰는 옵션 |
| 전략 내장 가지치기 | `strategy="Hyperband"` | 다중 fidelity로 자원을 차등 배분하며 조기 중단을 내장. 별도 `early_stopping_type`을 무시 |

```python
tuner = HyperparameterTuner(
    ..., early_stopping_type="Auto",   # Off | Auto
)
```

판별 신호: "튜닝 비용을 줄이려 가망 없는 학습을 자동 중단" → 조기 종료(Auto) 또는 Hyperband.

## 워밍 스타트(Warm Start)

새 튜닝 작업을 **이전 튜닝 작업의 결과를 활용해** 시작한다. 처음부터 탐색하지 않고 이미 알아낸 좋은 영역에서 출발한다.

| 타입 | 의미 | 전형적 상황 |
|---|---|---|
| **IDENTICAL_DATA_AND_ALGORITHM** | 데이터·알고리즘 동일, 탐색을 이어서 확장 | 어제 튜닝이 좋은 영역을 찾았고 `max_jobs`를 더 늘려 계속 탐색 |
| **TRANSFER_LEARNING** | 데이터/알고리즘이 약간 바뀌어도 이전 지식을 전이 | 새 데이터가 추가되거나 알고리즘 설정이 조금 달라짐 |

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

> ⚠️ **함정**: "이전 탐색을 이어서 진행한다"는 지문에 `max_parallel_jobs`를 올리거나, 전략을 Grid로 바꾸거나, 조기 종료를 끄는 보기가 섞여 나온다. 셋 다 이전 작업의 탐색 지식을 재사용하는 것과는 무관하다 — 재사용 수단은 워밍 스타트 하나뿐이다.

## 병렬성 vs 베이지안 효율의 트레이드오프

- `max_parallel_jobs`를 크게 하면 빨리 끝나지만, 베이지안은 이전 결과를 보고 다음을 정하므로 **병렬을 너무 키우면 학습 효율(정보 활용)이 떨어진다**.
- Random은 병렬성을 키워도 효율 손실이 없다(서로 독립).
- 시험에서 "베이지안인데 병렬을 최대로 했더니 기대만큼 좋아지지 않았다"는 이 트레이드오프가 답.

```text
max_parallel_jobs = 1        max_parallel_jobs = N (크게)
  trial1 → 결과 반영           trial1 ┐
  trial2 → 결과 반영           trial2 ├─ 동시에 결정
  trial3 → 결과 반영           trial3 ┘  (앞 결과를 못 봄)
  ─────────────────────        ─────────────────────
  느리다 / 평가당 효율 최대     빠르다 / 베이지안 이점 감소
  Random은 어느 쪽이든 효율 동일(각 trial이 독립)
```

| 목표 | 권장 설정 | 이유 |
|---|---|---|
| 벽시계 시간 단축이 최우선 | Random + `max_parallel_jobs` 크게 | 독립 샘플링이라 병렬 손실 없음 |
| 학습 1회가 비싸 평가 횟수를 아낌 | Bayesian + `max_parallel_jobs` 작게 | 이전 결과를 최대한 반영 |
| 딥러닝 튜닝 비용 절감 | Hyperband | 가망 없는 trial에 자원을 안 준다 |
| 이전 튜닝 재활용 | 워밍 스타트 | 좋은 영역에서 출발해 탐색 낭비 제거 |

## 튜닝 전략 결정 트리

```text
하이퍼파라미터를 자동으로 찾아야 한다
├─ 학습이 에폭·라운드를 반복하며 중간 성능을 낼 수 있나?
│    ├─ 예 + 비용 절감이 중요 → Hyperband (조기 가지치기 내장)
│    └─ 아니오 ↓
├─ 학습 1회 비용이 비싼가?
│    ├─ 예 → Bayesian (+ early_stopping_type="Auto", 병렬은 절제)
│    └─ 아니오 ↓
├─ 탐색 공간이 범주형 소수 조합인가?
│    ├─ 예 → Grid (전수 탐색)
│    └─ 아니오 → Random (단순 베이스라인, 완전 병렬)
└─ 이전 튜닝 결과가 있나?
     ├─ 데이터·알고리즘 동일 → 워밍 스타트 IDENTICAL_DATA_AND_ALGORITHM
     └─ 조금 달라짐        → 워밍 스타트 TRANSFER_LEARNING
```

## 지문 단서 → 정답 매핑

| 지문 단서 | 고를 답 | 이유 |
|---|---|---|
| "딥러닝, 각 trial이 여러 에폭 학습, 자원 낭비 최소화" | Hyperband | 다중 fidelity로 가망 없는 후보를 조기 중단 |
| "적은 학습 횟수로 좋은 조합을 찾고 싶다" | Bayesian | 이전 결과로 유망 영역에 집중 |
| "완전 병렬로 단순 베이스라인을 잡는다" | Random | trial이 독립이라 병렬 손실 없음 |
| "범주형 소수 조합을 전부 본다" | Grid | 조합이 적을 때만 전수 탐색이 성립 |
| "양성이 1%인 사기 데이터의 목표 지표" | AUC·F1·Recall (Accuracy는 **오답**) | 정확도는 전부 음성으로도 99% |
| "커스텀 스크립트인데 지표를 못 읽는다" | `metric_definitions` 정규식 지정 | 표준 지표명이 자동 제공되지 않음 |
| "지난 튜닝을 이어서 더 탐색, 데이터·알고리즘 동일" | 워밍 스타트 IDENTICAL_DATA_AND_ALGORITHM | 이전 탐색 결과를 그대로 확장 |
| "베이지안인데 병렬 최대로 했더니 효율이 나빠짐" | 병렬↑ → 이전 결과 활용 감소 | 베이지안의 순차성이 이점의 원천 |
| "튜닝 비용을 줄이고 싶다" | `early_stopping_type="Auto"` 또는 Hyperband | 가망 없는 학습을 중단해 과금을 끊는다 |
| "RMSE를 목표 지표로 쓴다" | `objective_type="Minimize"` | 오차 지표는 방향이 반대 |

다음 글에서는 튜닝의 목적지인 "좋은 일반화"를 가로막는 **과적합·과소적합**과 그 대응(정규화·데이터 증강)을 다룬다.

## 📖 용어

- **하이퍼파라미터(hyperparameter)** : 학습을 시작하기 전에 사람이 정해 주는 설정값. 학습률, 트리 깊이, 정규화 강도 등.
- **파라미터(parameter)** : 학습 과정에서 데이터로부터 알아서 정해지는 값. 신경망 가중치, 회귀 계수 등.
- **AMT(Automatic Model Tuning)** : 하이퍼파라미터 조합을 바꿔가며 학습을 여러 번 돌려 가장 좋은 조합을 찾아 주는 SageMaker 기능.
- **trial(학습 작업 하나)** : 튜닝 잡이 돌리는 개별 학습 작업. 하나의 하이퍼파라미터 조합을 한 번 평가하는 단위.
- **목표 지표(objective metric)** : 튜닝이 좋다/나쁘다를 판단하는 기준 지표. 이 지표가 곧 최적화 방향이다.
- **`metric_definitions`** : 학습 로그에서 지표 값을 뽑아낼 정규식 정의. 커스텀 스크립트에서 목표 지표를 인식시키는 장치.
- **surrogate 모델** : 베이지안 탐색이 "이 조합이면 성능이 대략 이 정도일 것"이라고 예측하려고 세우는 대리 모델.
- **다중 fidelity(multi-fidelity)** : 처음엔 적은 자원(짧은 학습)으로 여러 후보를 훑고, 살아남은 후보에만 자원을 더 주는 방식. Hyperband의 핵심.
- **조기 종료(early stopping)** : 나아질 가망이 없는 학습을 도중에 멈춰 시간과 비용을 아끼는 것.
- **워밍 스타트(warm start)** : 이전 튜닝 작업이 찾아낸 정보를 물려받아, 백지에서 시작하지 않고 좋은 영역부터 탐색하는 방식.

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
