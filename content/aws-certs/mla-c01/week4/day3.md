# Day 3 - 하이퍼파라미터 튜닝(AMT): 베이지안·랜덤·그리드, 조기 종료, 워밍 스타트

어제 고른 알고리즘에는 `max_depth`, `eta`, `num_round` 같은 손잡이가 달려 있다. 이런 **하이퍼파라미터**는 학습 전에 사람이 정해야 하는 값이고, 잘못 맞추면 좋은 알고리즘도 성능이 안 나온다. 문제는 조합이 수십 수백 가지라 일일이 손으로 돌려보긴 어렵다는 점이다. SageMaker **Automatic Model Tuning(AMT, 일명 Hyperparameter Tuning)**은 이 탐색을 자동화한다.

MLA-C01 시험에서 AMT는 "탐색 전략(베이지안/랜덤/그리드)", "조기 종료로 비용 절감", "워밍 스타트로 이전 결과 재사용" 키워드로 등장한다. 오늘은 탐색 전략, 튜닝 작업 구조, 비용 절감 기능이라는 세 축을 본다.

## 하이퍼파라미터 튜닝이란

AMT는 여러 개의 학습 작업(Training Job)을 자동으로 띄워, 각기 다른 하이퍼파라미터 조합으로 학습한 뒤 **목표 지표(objective metric)**가 가장 좋은 조합을 찾아준다. 핵심 구성요소는 세 가지다.

- **목표 지표**: 최대화/최소화할 대상(예: validation:accuracy 최대화, validation:rmse 최소화).
- **하이퍼파라미터 범위**: 탐색할 각 파라미터의 범위(연속형/정수형/범주형).
- **탐색 전략**: 범위 안을 어떻게 뒤질지(베이지안/랜덤/그리드/하이퍼밴드).

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

**Random**은 각 시도가 독립적이라 병렬화가 쉽지만 운에 기댄다. **Grid**는 모든 조합을 다 보므로 철저하지만 파라미터가 늘면 조합이 폭발하고, SageMaker에서는 범주형 파라미터에만 쓸 수 있다. **Hyperband**는 학습 도중 성능이 나쁜 구성을 조기에 중단하고 자원을 유망한 구성에 몰아줘, 학습이 오래 걸리는 딥러닝 튜닝에서 특히 효율적이다.

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

- **IDENTICAL_DATA_AND_ALGORITHM**: 데이터·알고리즘이 동일하고 범위만 조정해 이어갈 때.
- **TRANSFER_LEARNING**: 데이터가 바뀌었어도(예: 새 데이터 추가) 이전 학습 지식을 전이해 활용할 때.

> ⚠️ **함정**: "이전 튜닝 작업의 결과를 활용해 새 튜닝을 더 빠르게 수렴시키고 싶다"면 **워밍 스타트**다. 데이터·알고리즘이 그대로면 IDENTICAL_DATA_AND_ALGORITHM, 데이터가 추가/변경됐으면 TRANSFER_LEARNING을 고른다. 워밍 스타트는 베이지안 전략과 결합할 때 특히 빛난다 — 이전 시도들이 확률 모델의 사전 지식으로 들어가기 때문이다.

## 정리하며

AMT는 세 축으로 외운다. ① **구조**: 목표 지표(최대/최소) + 하이퍼파라미터 범위(연속/정수/범주) + 탐색 전략으로 여러 학습 작업을 자동 실행해 최적 조합을 찾는다. ② **탐색 전략**: 기본은 Bayesian(이전 결과로 똑똑하게, 순차 의존), 독립 병렬은 Random, 전수 조사는 Grid(범주형), 긴 딥러닝 조기 중단은 Hyperband. ③ **비용 절감**: 조기 종료(`early_stopping_type='Auto'`)로 가망 없는 학습 중단, 워밍 스타트로 이전 튜닝 결과 재사용(동일=IDENTICAL, 데이터 변경=TRANSFER_LEARNING). 시험에서 "효율적 탐색"은 Bayesian, "비용 절감 중단"은 early stopping, "이전 결과 재사용"은 warm start라는 매핑이 핵심이다.

다음 글에서는 처음부터 학습하지 않고 사전학습 모델을 가져다 쓰는 JumpStart와 전이학습, 그리고 학습 비용 최적화를 본다.

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
