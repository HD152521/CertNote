# Day 2 - Hyperparameter Tuning (AMT): Bayesian, Random, Hyperband

Yesterday we learned to run one training job well. Today, **run that training automatically many times to find optimal hyperparameters** via SageMaker Automatic Model Tuning (AMT). Tests ask about search strategies (Bayesian/random/grid/Hyperband), early stopping, warm start, objective metrics.

## Hyperparameter vs Parameter

First, terminology:

- **Parameter**: **Learned** from data during training (e.g., neural net weights, linear model coefficients)
- **Hyperparameter**: **Human-set before** training (e.g., learning rate, max_depth, tree count, regularization strength)

AMT explores hyperparameter space to find the combination with best validation metric.

```text
Define search space → Run multiple training jobs (trials) → Evaluate each trial's objective metric
→ Next trial's hyperparameters chosen by strategy → Return best combination
```

> 💡 **Related Theory**: Hyperparameter tuning is essentially "black-box optimization." Objective function (val metric) is non-differentiable, evaluation is expensive (= one training run). So strategies efficiently finding good regions with few evals (Bayesian, Hyperband) outperform blind search (random, grid).

## Four Search Strategies

| Strategy | How | Traits |
|------|------|------|
| **Grid** | Enumerate all combinations | Curse of dimensionality (explodes with dims), categorical-only recommended |
| **Random** | Sample space randomly | Simple, parallelizes well, often better than grid in high dimensions |
| **Bayesian** | Use previous results to build surrogate model, concentrate on promising regions | Best evals-per-trial efficiency, sequential (heavy) |
| **Hyperband** | Multi-fidelity — allocate few resources, discard hopeless trials early | Powerful for iterative learning (DL), fast convergence |

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

Discriminating signals:
- "Efficient search, few jobs" → **Bayesian**
- "Epoch iteration DL + prune hopeless fast" → **Hyperband**
- "Simple/parallel baseline" → **Random**
- "Categorical few combos exhaustively" → **Grid**

## Objective Metric

AMT extracts metrics from logs via regex, compares them.

- Builtin algorithms provide standard metric names (`validation:auc`, `validation:rmse` etc.)
- Custom scripts need `metric_definitions` with regex to parse log values

```python
metric_definitions=[
    {"Name": "validation:f1", "Regex": "val_f1: ([0-9\\.]+)"}
]
```

- **objective_type**: Maximize (AUC, F1, Accuracy) or Minimize (RMSE, Loss)
- For imbalanced data, choosing objective metric smartly is critical → F1/AUC over Accuracy

> 💡 **Related Theory**: Tuning optimizes only in the objective metric's direction. Fraud fraud detection with 1% positive, maximizing Accuracy on "all negative" still gets 99% → useless model. Choose objective to match business goal (F1, Recall, AUC) and data imbalance. Therefore setting objective metric is a **modeling decision before tuning**, not after

## Early Stopping

Discard unpromising trials early, save cost.

- **Trial-level early stopping (`early_stopping_type="Auto"`)**: During trial's learning, if objective metric unlikely to beat others, stop that job. With Bayesian/Random
- **Hyperband**: Strategy inherently does multi-fidelity early stopping. Ignores separate early_stopping_type

```python
tuner = HyperparameterTuner(
    ..., early_stopping_type="Auto",   # Off | Auto
)
```

Signal: "Cut tuning cost, stop unpromising jobs early" → early_stopping (Auto) or Hyperband

## Warm Start

Launch new tuning job using **results from previous tuning**. Don't explore from scratch, start in known good region.

| Type | Meaning |
|------|------|
| **IDENTICAL_DATA_AND_ALGORITHM** | Same data/algo, extend search (e.g., more max_jobs) |
| **TRANSFER_LEARNING** | Slightly different data/algo, reuse previous insights |

```python
from sagemaker.tuner import WarmStartConfig, WarmStartTypes

warm = WarmStartConfig(
    warm_start_type=WarmStartTypes.IDENTICAL_DATA_AND_ALGORITHM,
    parents={"previous-tuning-job-name"},
)
tuner = HyperparameterTuner(..., warm_start_config=warm)
```

Signal:
- "Continue exploring, same data/algo" → **IDENTICAL_DATA_AND_ALGORITHM**
- "Data changed slightly, reuse learning" → **TRANSFER_LEARNING**

## Parallelism vs Bayesian Efficiency Tradeoff

- Large `max_parallel_jobs` → finishes sooner, but Bayesian's advantage (learning from prior results) shrinks → **lower efficiency (info use)**
- Random doesn't lose efficiency with parallelism (independent)
- Test: "Bayesian with max parallel high, expected efficiency not there" → this tradeoff

## Test Tips

- Strategy choice: "efficient few evals" → Bayesian, "DL epochs + fast prune" → Hyperband, "simple parallel" → Random, "categorical exhaustive" → Grid
- "Save tuning cost, auto-stop hopeless" → early stopping (Auto) or Hyperband
- "Reuse previous / continue exploring" → warm start
- Custom algorithm needs metric_definitions regex
- Imbalanced data objective = F1/AUC not Accuracy

## Summary

Today: AMT auto-searches for optimal hyperparameters. Key flow: **define search space, pick objective metric & type, select strategy (Bayesian/Hyperband/Random/Grid), optional early stopping/warm start → best combination**. Next: generalization tuning itself — overfitting vs underfitting and fixes (regularization, data augmentation)

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
