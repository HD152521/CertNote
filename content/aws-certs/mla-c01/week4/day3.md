# Day 3 - 하이퍼파라미터 튜닝(AMT): 베이지안·랜덤·그리드, 조기 종료, 워밍 스타트

## 📌 핵심 정리

- **AMT**는 목표 지표 + 하이퍼파라미터 범위 + 탐색 전략으로 여러 Training Job을 자동 실행해 최적 조합을 찾는다.
- **탐색 전략**: 기본은 **Bayesian**(이전 결과를 반영, 순차 의존). 독립 병렬은 Random, 전수 조사는 Grid(범주형), 긴 딥러닝 조기 중단은 **Hyperband**.
- **조기 종료**(`early_stopping_type='Auto'`)는 가망 없는 학습을 중간에 끊어 컴퓨팅 비용을 줄인다.
- **워밍 스타트**는 이전 튜닝 결과를 출발점으로 재사용한다 — 동일 조건은 `IDENTICAL_DATA_AND_ALGORITHM`, 데이터가 바뀌었으면 `TRANSFER_LEARNING`.
- Bayesian은 순차 학습이 이점이므로 `max_parallel_jobs`를 과하게 올리면 오히려 효율이 떨어진다.

## 하이퍼파라미터 튜닝이란

어제 고른 알고리즘에는 `max_depth`, `eta`, `num_round` 같은 손잡이가 달려 있다. 조합이 수십 수백 가지라 손으로 돌려보긴 어렵고, SageMaker **Automatic Model Tuning(AMT)**이 이 탐색을 자동화한다. 여러 개의 학습 작업을 자동으로 띄워 각기 다른 조합으로 학습한 뒤 **목표 지표(objective metric)**가 가장 좋은 조합을 찾아준다.

핵심 구성요소는 세 가지다.

- **목표 지표**: 최대화/최소화할 대상(예: validation:accuracy 최대화, validation:rmse 최소화).
- **하이퍼파라미터 범위**: 탐색할 각 파라미터의 범위(연속형/정수형/범주형).
- **탐색 전략**: 범위 안을 어떻게 뒤질지(베이지안/랜덤/그리드/하이퍼밴드).

```text
[하이퍼파라미터 범위] + [목표 지표] + [탐색 전략]
            │
            ▼
  ① 다음 조합 선택  ◀──────────────┐
            │                      │
            ▼                      │ ④ 결과를 전략에 반영
  ② Training Job 실행              │    (Bayesian 계열의 핵심)
    (max_parallel_jobs 만큼 동시)   │
            │                      │
            ▼                      │
  ③ 목표 지표 방출 ────────────────┘
            │
            ├─ 뒤처지는 학습은 early stopping으로 중단
            │
            └─ max_jobs 소진 → BestTrainingJob 확정
                        │
                        ▼
        (워밍 스타트) 다음 튜닝 작업의 출발점으로 재사용
```

```python
from sagemaker.tuner import (
    HyperparameterTuner, ContinuousParameter, IntegerParameter
)

tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',  # 목표 지표
    objective_type='Maximize',                # 최대화
    hyperparameter_ranges={
        'eta': ContinuousParameter(0.01, 0.3),     # 연속형 범위
        'max_depth': IntegerParameter(3, 10),       # 정수형 범위
        'num_round': IntegerParameter(50, 300),
    },
    max_jobs=20,                  # 총 학습 작업 수
    max_parallel_jobs=3,          # 동시 실행 수
    strategy='Bayesian',          # 탐색 전략
)

tuner.fit({'train': train_s3, 'validation': val_s3})
```

범위를 지정하는 파라미터 타입은 세 가지이고, 어느 타입을 쓰느냐가 탐색 방식까지 좌우한다.

| 범위 타입 | 무엇을 표현하나 | 예시 |
|-----------|-----------------|------|
| **ContinuousParameter** | 실수 구간 | 학습률 `eta` 0.01 ~ 0.3 |
| **IntegerParameter** | 정수 구간 | 트리 깊이 `max_depth` 3 ~ 10 |
| **CategoricalParameter** | 정해진 값 목록 | `objective` = binary:logistic / reg:squarederror |

> 💡 **개념**: 학습률처럼 자릿수가 중요한 값은 0.001과 0.01의 차이가 0.1과 0.11의 차이보다 훨씬 크다. 그래서 이런 파라미터는 선형이 아니라 **로그 스케일**로 탐색하는 편이 유리하다. AMT는 `scaling_type`으로 스케일을 지정할 수 있고, 기본값 `Auto`는 범위를 보고 적절한 쪽을 고른다. 범위를 너무 넓게 잡으면 탐색이 흩어지고, 너무 좁게 잡으면 최적값이 범위 밖에 남는다는 점도 함께 기억해 둔다.

> 💡 **관련 이론**: 하이퍼파라미터 튜닝은 "검은 상자 최적화(black-box optimization)" 문제다. 입력(하이퍼파라미터)을 넣으면 출력(검증 성능)이 나오지만, 그 사이 함수의 수식을 모르고 한 번 평가(=학습 1회)가 비싸다. 그래서 무작정 다 시도하기보다, 적은 평가로 좋은 영역을 똑똑하게 찾는 전략이 중요하다. 이게 베이지안 최적화가 등장하는 이유다.

## 탐색 전략: 베이지안·랜덤·그리드·하이퍼밴드

탐색 전략의 차이가 시험에서 가장 자주 나온다. 네 가지를 구분한다.

| 전략 | 동작 | 특징 |
|------|------|------|
| **Grid Search** | 모든 조합을 격자로 전부 시도 | 철저하지만 조합 폭발, 범주형에만 사용 |
| **Random Search** | 범위 안에서 무작위로 뽑아 시도 | 단순·병렬화 쉬움, 운에 의존 |
| **Bayesian** | 이전 결과로 다음 시도를 똑똑하게 선택 | 적은 횟수로 좋은 값, 가장 권장 |
| **Hyperband** | 성능 나쁜 학습을 일찍 끊고 자원 재분배 | 대규모·딥러닝에 효율적 |

**Bayesian(베이지안)**은 핵심이다. 지금까지의 시도 결과로 "어느 영역이 유망한가"에 대한 확률 모델을 만들고, 다음에 시도할 조합을 가장 정보 가치가 높은 곳으로 고른다. 즉 앞선 학습의 결과를 다음 선택에 반영하므로, 같은 예산으로 더 빨리 좋은 값을 찾는다. 그래서 **순차적 의존성**이 있어 동시 실행(`max_parallel_jobs`)을 너무 높이면 이점이 줄어든다.

- **Random**: 각 시도가 독립적이라 병렬화가 쉽지만 운에 기댄다.
- **Grid**: 모든 조합을 다 보므로 철저하지만 파라미터가 늘면 조합이 폭발하고, SageMaker에서는 범주형 파라미터에만 쓸 수 있다.
- **Hyperband**: 학습 도중 성능이 나쁜 구성을 조기에 중단하고 자원을 유망한 구성에 몰아줘, 학습이 오래 걸리는 딥러닝 튜닝에서 특히 효율적이다.

전략은 결국 **예산·병렬성·학습 길이** 세 가지 조건으로 갈린다.

| 상황의 단서 | 고를 전략 | 이유 |
|-------------|-----------|------|
| "제한된 예산으로 효율적으로" | Bayesian | 적은 횟수로 유망 영역을 좁힌다 |
| "최대한 병렬로 많이, 시도 간 의존 없이" | Random | 각 시도가 독립이라 병렬 확장이 자유롭다 |
| "값이 몇 개 안 되니 전부 확인" | Grid | 전수 조사가 가능하고 재현성이 높다 |
| "학습 1회가 수 시간인 딥러닝" | Hyperband | 나쁜 구성을 초반에 끊어 자원을 재분배한다 |
| "어제 돌린 튜닝을 이어서" | Bayesian + 워밍 스타트 | 이전 시도가 확률 모델의 사전 지식이 된다 |

> ⚠️ **함정**: "제한된 예산으로 효율적으로 좋은 하이퍼파라미터를 찾고 싶다"의 기본 답은 **Bayesian**이다. 다만 "이전 시도 결과에 의존하지 않고 최대한 병렬로 빠르게 많이 시도"라면 Random, "딥러닝처럼 학습이 길고 나쁜 구성을 일찍 끊어 자원을 아끼고 싶다"면 Hyperband가 더 맞는다. 전략 선택은 예산·병렬성·학습 길이로 갈린다.

## 조기 종료(Early Stopping)

튜닝은 학습 작업을 여러 번 돌리므로 비용이 많이 든다. **조기 종료**는 이를 줄이는 핵심 기능이다. 학습 도중 목표 지표가 다른 시도들에 비해 가망이 없다고 판단되면 그 학습 작업을 중간에 끊어버린다.

```python
tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',
    objective_type='Maximize',
    hyperparameter_ranges=ranges,
    early_stopping_type='Auto',   # 조기 종료 활성화
    ...
)
```

`early_stopping_type='Auto'`로 켜면, SageMaker가 진행 중인 학습의 중간 지표를 보고 명백히 뒤처지는 작업을 끊어 컴퓨팅 시간을 절약한다. 이는 알고리즘이 매 에포크/라운드마다 지표를 방출(emit)해야 작동한다(빌트인은 대부분 지원).

> 💡 **관련 이론**: 조기 종료는 "탐색과 활용(exploration-exploitation)"의 자원 배분 문제와 닿는다. 모든 시도에 똑같이 자원을 쓰는 건 낭비다. 가망 없는 후보는 빨리 포기하고(중단), 유망한 후보에 자원을 집중하는 게 합리적이다. Hyperband 전략 자체가 이 아이디어를 적극적으로 구현한 것이고, 일반 튜닝의 early stopping도 같은 철학의 가벼운 버전이다.

## 워밍 스타트(Warm Start)

이미 한 번 튜닝 작업을 돌렸는데, 데이터가 조금 늘었거나 범위를 살짝 넓혀 다시 튜닝하고 싶을 때가 있다. 매번 처음부터 탐색하면 이전에 얻은 지식이 버려진다. **워밍 스타트**는 이전 튜닝 작업의 결과를 출발점으로 삼아 새 튜닝을 이어간다.

```python
from sagemaker.tuner import WarmStartConfig, WarmStartTypes

warm_config = WarmStartConfig(
    warm_start_type=WarmStartTypes.IDENTICAL_DATA_AND_ALGORITHM,
    parents={'previous-tuning-job-name'},   # 부모 튜닝 작업
)

tuner = HyperparameterTuner(
    estimator=estimator, objective_metric_name='validation:auc',
    objective_type='Maximize', hyperparameter_ranges=ranges,
    warm_start_config=warm_config,
)
```

워밍 스타트 타입은 두 가지다.

| 타입 | 전제 조건 | 쓰는 순간 |
|------|-----------|-----------|
| **IDENTICAL_DATA_AND_ALGORITHM** | 데이터·알고리즘이 이전과 동일 | 하이퍼파라미터 범위만 조정해 이어서 탐색할 때 |
| **TRANSFER_LEARNING** | 데이터나 조건이 달라져도 무방 | 새 데이터가 추가되었거나 알고리즘을 바꿔 이전 지식만 참고할 때 |

튜닝이 끝나면 최적 조합은 작업 설명에서 꺼내 쓴다.

```python
import boto3

sm = boto3.client('sagemaker')
desc = sm.describe_hyper_parameter_tuning_job(
    HyperParameterTuningJobName='my-tuning-job'
)

best = desc['BestTrainingJob']
print(best['TrainingJobName'])                              # 최고 성적 학습 작업
print(best['FinalHyperParameterTuningJobObjectiveMetric'])  # 지표 이름과 값
print(best['TunedHyperParameters'])                         # 최적 하이퍼파라미터 조합
print(desc['TrainingJobStatusCounters'])                    # 완료·실패·중단 집계
```

`TrainingJobStatusCounters`에서 중단된 작업 수를 보면 조기 종료가 실제로 얼마나 개입했는지 확인할 수 있다.

> ⚠️ **함정**: "이전 튜닝 작업의 결과를 활용해 새 튜닝을 더 빠르게 수렴시키고 싶다"면 **워밍 스타트**다. 데이터·알고리즘이 그대로면 IDENTICAL_DATA_AND_ALGORITHM, 데이터가 추가/변경됐으면 TRANSFER_LEARNING을 고른다. 워밍 스타트는 베이지안 전략과 결합할 때 특히 빛난다 — 이전 시도들이 확률 모델의 사전 지식으로 들어가기 때문이다.

## 튜닝이 기대만큼 안 될 때: 증상 → 원인 → 조치

튜닝은 "돌아가긴 하는데 결과가 안 좋은" 상황이 자주 나오고, 시험도 그 상황을 지문으로 준다.

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 작업을 많이 돌렸는데도 성능이 안 오른다 | 탐색 범위가 최적값을 포함하지 않음 | 범위를 넓히고, 자릿수가 중요한 값은 로그 스케일로 탐색 |
| Bayesian인데 Random과 별 차이가 없다 | `max_parallel_jobs`가 너무 높아 순차 학습 이점이 사라짐 | 병렬도를 낮춰 이전 결과가 다음 선택에 반영되게 한다 |
| 조기 종료가 전혀 작동하지 않는다 | 알고리즘이 중간 지표를 방출하지 않음 | 학습 스크립트에서 목표 지표를 주기적으로 로그에 남기고 정규식 매칭 확인 |
| 튜닝 비용이 통제되지 않는다 | `max_jobs`가 크고 조기 종료가 꺼져 있음 | `max_jobs` 상한 조정 + `early_stopping_type='Auto'` |
| 검증 성능은 최고인데 실제 성능이 나쁘다 | 같은 검증셋에 반복 최적화해 과적합 | 별도 테스트셋으로 최종 확인, 교차검증 도입 |
| 조건을 조금 바꿔 다시 돌리니 처음부터 탐색한다 | 워밍 스타트 미설정 | `WarmStartConfig`로 이전 튜닝 작업을 부모로 지정 |

> ⚠️ **함정**: 마지막 줄이 특히 헷갈린다. 튜닝은 검증 지표를 최대화하도록 조합을 고르므로, **검증셋 자체에 과적합**될 수 있다. 튜닝 결과를 신뢰하려면 튜닝에 한 번도 쓰이지 않은 데이터로 마지막 확인이 필요하다. "튜닝 후 검증 점수가 크게 올랐는데 배포하니 성능이 떨어졌다"는 시나리오의 원인은 대개 이것이다.

다음 글에서는 처음부터 학습하지 않고 사전학습 모델을 가져다 쓰는 JumpStart와 전이학습, 그리고 학습 비용 최적화를 본다.

## 📖 용어

- **하이퍼파라미터** : 학습을 시작하기 전에 사람이 정해 주는 설정값. 트리 깊이, 학습률, 반복 횟수 등.
- **AMT (Automatic Model Tuning)** : 여러 학습 작업을 자동으로 돌려 가장 좋은 하이퍼파라미터 조합을 찾아주는 SageMaker 기능.
- **목표 지표(objective metric)** : 튜닝이 최대화 또는 최소화할 기준 점수. 예를 들어 검증 AUC나 RMSE.
- **베이지안 최적화** : 넓은 탐색 공간에서 지금까지의 결과로 "어디가 유망한지" 추정해 다음 시도를 고르는 전략. 적은 횟수로 좋은 값을 찾는다.
- **Hyperband** : 여러 구성을 조금씩 학습해 보고 성적이 나쁜 쪽을 빨리 탈락시켜 자원을 몰아주는 전략.
- **조기 종료(early stopping)** : 진행 중인 학습이 가망 없어 보이면 끝까지 기다리지 않고 중단하는 기능.
- **워밍 스타트** : 이전 튜닝 작업의 결과를 물려받아 새 튜닝을 그 지점부터 이어 가는 기능.
- **max_jobs / max_parallel_jobs** : 튜닝이 돌릴 학습 작업의 총 개수 / 그중 동시에 실행할 개수.
- **스케일링 타입** : 범위를 선형으로 훑을지 로그 스케일로 훑을지 정하는 설정. 학습률처럼 자릿수가 중요한 값에 쓴다.
- **검증셋 과적합** : 같은 검증 데이터에 맞춰 반복 최적화한 나머지, 그 데이터에서만 점수가 좋아지는 현상.

---

## 📝 연습 문제

**문제 1.** 제한된 컴퓨팅 예산으로 가능한 적은 학습 횟수로 좋은 하이퍼파라미터 조합을 찾고 싶다. 이전 시도 결과를 활용해 다음 시도를 똑똑하게 선택하는 전략은?

A) Grid Search  
B) Random Search  
C) Bayesian  
D) 수동 탐색  

**정답: C**  
해설: 베이지안 최적화는 지금까지의 시도 결과로 유망한 영역의 확률 모델을 만들어 다음 시도를 정보 가치가 높은 곳으로 선택하므로 적은 횟수로 좋은 값을 찾는다. A는 모든 조합을 전수 조사해 비효율적이고, B는 독립 무작위라 운에 의존하며, D는 자동화 이점이 없다.

---

**문제 2.** 튜닝 작업이 여러 학습을 돌리며 비용이 크다. 진행 중에 목표 지표가 명백히 가망 없는 학습 작업을 자동으로 중단해 컴퓨팅 비용을 줄이려면?

A) max_parallel_jobs를 1로 낮춘다  
B) early_stopping_type을 Auto로 설정한다  
C) 인스턴스 타입을 더 큰 것으로 바꾼다  
D) 목표 지표를 제거한다  

**정답: B**  
해설: early_stopping_type='Auto'는 진행 중 지표가 다른 시도들에 뒤처지는 학습 작업을 중간에 끊어 컴퓨팅 시간을 절약한다. A는 병렬성만 줄여 총 시간을 늘리고, C는 오히려 비용을 키우며, D는 튜닝 자체를 불가능하게 만든다.

---

**문제 3.** 어제 동일한 데이터와 알고리즘으로 튜닝을 한 번 마쳤고, 오늘 하이퍼파라미터 범위만 약간 넓혀 이전 결과를 활용해 더 빠르게 수렴시키려 한다. 가장 적합한 기능과 타입은?

A) 워밍 스타트, IDENTICAL_DATA_AND_ALGORITHM  
B) 처음부터 새 튜닝 작업 생성  
C) 조기 종료만 활성화  
D) Grid Search로 전환  

**정답: A**  
해설: 데이터·알고리즘이 동일하고 범위만 조정해 이전 튜닝 결과를 출발점으로 삼을 때는 워밍 스타트의 IDENTICAL_DATA_AND_ALGORITHM 타입이 적합하다. B는 이전 지식을 버려 비효율적이고, C는 결과 재사용과 무관하며, D는 전수 조사로 수렴 가속과 거리가 멀다.

---

**문제 4.** 학습 한 번이 수 시간 걸리는 딥러닝 모델을 튜닝하면서, 성능이 나쁜 구성은 학습 초반에 끊고 유망한 구성에 자원을 집중하는 전략을 쓰고 싶다. 가장 적합한 탐색 전략은?

A) Grid Search  
B) Hyperband  
C) 수동 탐색  
D) 단일 학습 작업  

**정답: B**  
해설: Hyperband는 학습 도중 성능이 나쁜 구성을 조기에 중단하고 자원을 유망한 구성에 재분배하므로, 학습이 오래 걸리는 딥러닝 튜닝에서 특히 효율적이다. A는 모든 조합을 끝까지 돌려 비효율적이고, C는 자동화 이점이 없으며, D는 튜닝이 아니다.

---

**문제 5.** HyperparameterTuner에서 max_jobs와 max_parallel_jobs의 의미로 올바른 것은?

A) max_jobs는 동시 실행 수, max_parallel_jobs는 총 학습 작업 수다  
B) max_jobs는 총 학습 작업 수, max_parallel_jobs는 동시에 실행할 학습 작업 수다  
C) 둘 다 인스턴스 개수를 의미한다  
D) 둘 다 목표 지표의 임계값이다  

**정답: B**  
해설: max_jobs는 튜닝이 실행할 총 학습 작업 수이고 max_parallel_jobs는 그중 동시에 돌릴 작업 수이며, 베이지안 전략에서는 병렬을 너무 높이면 순차적 학습 이점이 줄어든다. A는 둘의 의미가 뒤바뀌었고, C는 인스턴스 설정과 혼동한 것이며, D는 목표 지표와 무관하다.

---
