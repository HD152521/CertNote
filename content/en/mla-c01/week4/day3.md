# Day 3 - Hyperparameter Tuning (AMT): Bayesian·Random·Grid, Early Stopping, Warm Start

The algorithm you chose yesterday has knobs like `max_depth`, `eta`, `num_round`. These **hyperparameters** are values set before training and set wrongly, even a good algorithm performs poorly. The problem is there are dozens or hundreds of combinations—testing each manually is impractical. SageMaker's **Automatic Model Tuning (AMT)**, aka Hyperparameter Tuning, automates this search.

In the MLA-C01 exam, AMT appears as keywords like "search strategy (Bayesian/Random/Grid)", "cost reduction via early stopping", "warm start reusing prior results". Today we cover search strategies, tuning job structure, and cost-reduction features—three axes.

## Hyperparameter Tuning Basics

AMT automatically spawns multiple Training Jobs, trains with different hyperparameter combinations, and finds the combination where the **objective metric** performs best. Three core components:

- **Objective metric**: What to maximize/minimize (e.g., maximize validation:accuracy, minimize validation:rmse).
- **Hyperparameter ranges**: Each parameter's search space (continuous/integer/categorical).
- **Search strategy**: How to explore that space (Bayesian/Random/Grid/Hyperband).

```python
from sagemaker.tuner import (
    HyperparameterTuner, ContinuousParameter, IntegerParameter
)

tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',  # Objective metric
    objective_type='Maximize',                # Maximize
    hyperparameter_ranges={
        'eta': ContinuousParameter(0.01, 0.3),     # Continuous range
        'max_depth': IntegerParameter(3, 10),       # Integer range
        'num_round': IntegerParameter(50, 300),
    },
    max_jobs=20,                  # Total training jobs
    max_parallel_jobs=3,          # Concurrent runs
    strategy='Bayesian',          # Search strategy
)

tuner.fit({'train': train_s3, 'validation': val_s3})
```

> 💡 **Related Theory**: Hyperparameter tuning is a "black-box optimization" problem. You input hyperparameters and get performance output, but the function between them is unknown and one evaluation (one training run) is expensive. So instead of trying everything, the key is smartly finding good regions with few evaluations. That's why Bayesian optimization exists.

## Search Strategies: Bayesian·Random·Grid·Hyperband

Differences in search strategies appear most often in exams. Distinguish four:

| Strategy | Behavior | Characteristics |
|---|---|---|
| **Grid Search** | Try all combinations on a grid | Thorough but combinatorial explosion; categorical only |
| **Random Search** | Randomly sample from range and try | Simple, easy parallelization, depends on luck |
| **Bayesian** | Previous results guide smart next choices | Good values with few tries, most recommended |
| **Hyperband** | Early stop poor performers, redistribute resources | Efficient for large-scale, deep learning |

**Bayesian** is key. From past attempts, it builds a probability model: "which region is promising?" Then selects the next combination with highest information value. Previous results inform next choices, so with the same budget, good values are found faster. Thus there's **sequential dependence**—setting `max_parallel_jobs` too high reduces benefit.

**Random** makes each attempt independent so parallel is easy, but relies on luck. **Grid** examines all combinations thoroughly, but grows combinatorially; SageMaker restricts it to categorical parameters. **Hyperband** stops poorly-performing configurations early mid-training and redistributes resources to promising ones, especially efficient for deep learning tuning where training is long.

> ⚠️ **Pitfall**: "Find good hyperparameters efficiently on limited budget" → default answer is **Bayesian**. But if "try many times in parallel without depending on prior results" → Random. Or "deep learning training is long, stop bad configs early to save resources" → Hyperband. Strategy choice hinges on budget, parallelism, training duration.

## Early Stopping

Tuning runs many training jobs, so costs multiply. **Early stopping** is the key cost-reduction feature. If during training a job's objective metric appears hopeless versus others, terminate it mid-training.

```python
tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',
    objective_type='Maximize',
    hyperparameter_ranges=ranges,
    early_stopping_type='Auto',   # Enable early stopping
    ...
)
```

Set `early_stopping_type='Auto'` and SageMaker watches intermediate metrics of running training and stops jobs falling clearly behind, saving computing time. This works only if the algorithm emits metrics each epoch/round (built-ins mostly support).

> 💡 **Related Theory**: Early stopping touches the "exploration vs. exploitation" resource allocation problem. Spending equal resources on every attempt is wasteful. Abandon hopeless candidates fast (stop), concentrate resources on promising ones. The Hyperband strategy itself implements this idea aggressively; general tuning's early stopping is a lighter-weight version of the same philosophy.

## Warm Start

You've run a tuning job once with identical data and algorithm, but now want to widen hyperparameter ranges and reuse prior results to converge faster. Starting fresh each time throws away learned knowledge. **Warm Start** uses previous tuning job results as the starting point for new tuning.

```python
from sagemaker.tuner import WarmStartConfig, WarmStartTypes

warm_config = WarmStartConfig(
    warm_start_type=WarmStartTypes.IDENTICAL_DATA_AND_ALGORITHM,
    parents={'previous-tuning-job-name'},   # Parent tuning job
)

tuner = HyperparameterTuner(
    estimator=estimator, objective_metric_name='validation:auc',
    objective_type='Maximize', hyperparameter_ranges=ranges,
    warm_start_config=warm_config,
)
```

Two warm-start types:

- **IDENTICAL_DATA_AND_ALGORITHM**: Data·algorithm unchanged, just adjust ranges to continue from prior tuning.
- **TRANSFER_LEARNING**: Data changed (e.g., new data added) but transfer prior learning knowledge.

> ⚠️ **Pitfall**: "Reuse prior tuning results to make new tuning converge faster" → use **Warm Start**. If data·algorithm unchanged, use IDENTICAL_DATA_AND_ALGORITHM; if data added/changed, use TRANSFER_LEARNING. Warm Start shines especially with Bayesian strategy—prior attempts become prior knowledge in the probability model.

## Summary

Remember AMT by three axes: ① **Structure**: Objective metric (max/min) + hyperparameter ranges (continuous/integer/categorical) + search strategy to auto-run multiple training jobs finding the best combination. ② **Search strategies**: Base case Bayesian (smart from prior results, sequential dependent), independent parallel Random, exhaustive Grid (categorical), long deep learning early-stop Hyperband. ③ **Cost reduction**: early_stopping_type='Auto' to stop hopeless jobs, Warm Start to reuse prior tuning (identical=IDENTICAL, data changed=TRANSFER_LEARNING). Key exam mappings: "efficient search" → Bayesian, "cost-saving stop" → early stopping, "reuse prior" → warm start.

Next we see JumpStart for using pre-trained models without training from scratch, transfer learning, and training cost optimization.

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
