# Day 3 - Hyperparameter Tuning (AMT): Bayesian·Random·Grid, Early Stopping, Warm Start

## 📌 Key Takeaways

- **AMT** automatically runs multiple Training Jobs from an objective metric + hyperparameter ranges + a search strategy to find the best combination.
- **Search strategies**: the default is **Bayesian** (reflects previous results, sequentially dependent). Independent parallel is Random, exhaustive is Grid (categorical), and early stopping of long deep learning is **Hyperband**.
- **Early stopping** (`early_stopping_type='Auto'`) cuts off hopeless training midway to reduce compute cost.
- **Warm start** reuses previous tuning results as a starting point — `IDENTICAL_DATA_AND_ALGORITHM` for identical conditions, `TRANSFER_LEARNING` when the data has changed.
- Bayesian benefits from sequential learning, so raising `max_parallel_jobs` too high actually lowers efficiency.

## What Is Hyperparameter Tuning

The algorithm you picked yesterday has knobs such as `max_depth`, `eta`, and `num_round`. With dozens or hundreds of combinations it is hard to try them by hand, and SageMaker **Automatic Model Tuning (AMT)** automates this search. It automatically launches multiple training jobs, trains each with a different combination, and finds the combination with the best **objective metric**.

There are three key components.

- **Objective metric**: The target to maximize/minimize (e.g., maximize validation:accuracy, minimize validation:rmse).
- **Hyperparameter ranges**: The range of each parameter to search (continuous/integer/categorical).
- **Search strategy**: How to search within the ranges (Bayesian/Random/Grid/Hyperband).

```text
[Hyperparameter ranges] + [Objective metric] + [Search strategy]
            │
            ▼
  ① Select next combination  ◀─────┐
            │                      │
            ▼                      │ ④ Feed the result back to the strategy
  ② Run Training Job               │    (the core of the Bayesian family)
    (max_parallel_jobs at a time)  │
            │                      │
            ▼                      │
  ③ Emit objective metric ─────────┘
            │
            ├─ Lagging training is stopped by early stopping
            │
            └─ max_jobs exhausted → BestTrainingJob is fixed
                        │
                        ▼
        (Warm start) Reused as the starting point of the next tuning job
```

```python
from sagemaker.tuner import (
    HyperparameterTuner, ContinuousParameter, IntegerParameter
)

tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',  # objective metric
    objective_type='Maximize',                # maximize
    hyperparameter_ranges={
        'eta': ContinuousParameter(0.01, 0.3),     # continuous range
        'max_depth': IntegerParameter(3, 10),       # integer range
        'num_round': IntegerParameter(50, 300),
    },
    max_jobs=20,                  # total number of training jobs
    max_parallel_jobs=3,          # number running concurrently
    strategy='Bayesian',          # search strategy
)

tuner.fit({'train': train_s3, 'validation': val_s3})
```

There are three parameter types for specifying ranges, and which type you use even affects the search method.

| Range Type | What it expresses | Example |
|-----------|-----------------|------|
| **ContinuousParameter** | Real-number interval | Learning rate `eta` 0.01 ~ 0.3 |
| **IntegerParameter** | Integer interval | Tree depth `max_depth` 3 ~ 10 |
| **CategoricalParameter** | A fixed list of values | `objective` = binary:logistic / reg:squarederror |

For values where the order of magnitude matters, like a learning rate, the difference between 0.001 and 0.01 is far larger than the difference between 0.1 and 0.11. So such parameters are better searched on a **log scale** rather than a linear one. AMT lets you specify the scale with `scaling_type`, and the default `Auto` looks at the range and chooses the appropriate one. Also remember that if you set the range too wide the search scatters, and if too narrow the optimum stays outside the range.

Hyperparameter tuning is a "black-box optimization" problem. You put in inputs (hyperparameters) and get an output (validation performance), but you do not know the formula of the function in between, and a single evaluation (= one training run) is expensive. So rather than blindly trying everything, a strategy that smartly finds good regions with few evaluations is important. This is why Bayesian optimization appears.

## Search Strategies: Bayesian·Random·Grid·Hyperband

The exam requires you to distinguish the differences among search strategies. Distinguish four.

| Strategy | Behavior | Characteristics |
|------|------|------|
| **Grid Search** | Tries every combination on a grid | Thorough but combinatorial explosion; used only with categorical |
| **Random Search** | Draws randomly within the ranges and tries | Simple, easy to parallelize, relies on luck |
| **Bayesian** | Smartly chooses the next trial using previous results | Good values with few runs, most recommended |
| **Hyperband** | Cuts off poorly performing training early and reallocates resources | Efficient for large-scale and deep learning |

**Bayesian** is the key. From the results of the trials so far, it builds a probabilistic model of "which region is promising" and picks the next combination to try where the information value is highest. In other words, it reflects earlier training results in the next choice, so it finds good values faster with the same budget. Because of this **sequential dependency**, setting concurrent execution (`max_parallel_jobs`) too high reduces the benefit.

- **Random**: Each trial is independent, so parallelizing is easy, but it relies on luck.
- **Grid**: It looks at every combination so it is thorough, but combinations explode as parameters grow, and in SageMaker it can be used only with categorical parameters.
- **Hyperband**: It stops poorly performing configurations early during training and directs resources to promising ones, so it is especially efficient for deep learning tuning where training takes long.

The strategy ultimately splits on three conditions: **budget, parallelism, and training length**.

| Clue in the situation | Strategy to pick | Reason |
|-------------|-----------|------|
| "Efficiently with a limited budget" | Bayesian | Narrows to promising regions with few runs |
| "As many in parallel as possible, no dependence between trials" | Random | Each trial is independent, so parallel scaling is free |
| "Only a few values, so check them all" | Grid | Exhaustive search is possible and reproducibility is high |
| "Deep learning where one training run takes hours" | Hyperband | Cuts bad configurations early and reallocates resources |
| "Continue the tuning I ran yesterday" | Bayesian + warm start | Previous trials become prior knowledge for the probabilistic model |

> ⚠️ **Pitfall**: The default answer to "I want to efficiently find good hyperparameters with a limited budget" is **Bayesian**. However, if it is "try as many as possible quickly in parallel without depending on previous trial results", Random fits better, and if "like deep learning, training is long and I want to save resources by cutting bad configurations early", Hyperband fits better. The strategy choice splits on budget, parallelism, and training length.

## Early Stopping

Tuning runs training jobs many times, so it is costly. **Early stopping** is a key feature for reducing this. If, during training, the objective metric is judged hopeless compared with other trials, that training job is cut off midway.

```python
tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name='validation:auc',
    objective_type='Maximize',
    hyperparameter_ranges=ranges,
    early_stopping_type='Auto',   # enable early stopping
    ...
)
```

When enabled with `early_stopping_type='Auto'`, SageMaker looks at the intermediate metrics of in-progress training and cuts off jobs that are clearly lagging, saving compute time. This works only if the algorithm emits the metric at every epoch/round (most built-ins support this).

Early stopping touches on the resource allocation problem of "exploration-exploitation". Spending the same resources on every trial is wasteful. It is reasonable to give up quickly on hopeless candidates (stop them) and concentrate resources on promising ones. The Hyperband strategy itself is an active implementation of this idea, and early stopping in ordinary tuning is a lighter version of the same philosophy.

## Warm Start

Sometimes you have already run a tuning job once, and now the data has grown a little or you want to widen the ranges slightly and tune again. Searching from scratch each time throws away the knowledge gained earlier. **Warm start** continues a new tuning by using the results of a previous tuning job as the starting point.

```python
from sagemaker.tuner import WarmStartConfig, WarmStartTypes

warm_config = WarmStartConfig(
    warm_start_type=WarmStartTypes.IDENTICAL_DATA_AND_ALGORITHM,
    parents={'previous-tuning-job-name'},   # parent tuning job
)

tuner = HyperparameterTuner(
    estimator=estimator, objective_metric_name='validation:auc',
    objective_type='Maximize', hyperparameter_ranges=ranges,
    warm_start_config=warm_config,
)
```

There are two warm start types.

| Type | Precondition | When to use |
|------|-----------|-----------|
| **IDENTICAL_DATA_AND_ALGORITHM** | Data and algorithm identical to before | When continuing the search by adjusting only the hyperparameter ranges |
| **TRANSFER_LEARNING** | Data or conditions may differ | When new data has been added or the algorithm changed and you only want to reference previous knowledge |

When tuning ends, retrieve the best combination from the job description.

```python
import boto3

sm = boto3.client('sagemaker')
desc = sm.describe_hyper_parameter_tuning_job(
    HyperParameterTuningJobName='my-tuning-job'
)

best = desc['BestTrainingJob']
print(best['TrainingJobName'])                              # best-performing training job
print(best['FinalHyperParameterTuningJobObjectiveMetric'])  # metric name and value
print(best['TunedHyperParameters'])                         # best hyperparameter combination
print(desc['TrainingJobStatusCounters'])                    # completed·failed·stopped counts
```

By looking at the number of stopped jobs in `TrainingJobStatusCounters`, you can check how much early stopping actually intervened.

> ⚠️ **Pitfall**: If you "want to use the results of a previous tuning job to make a new tuning converge faster", it is **warm start**. If the data and algorithm are unchanged, choose IDENTICAL_DATA_AND_ALGORITHM; if data was added/changed, choose TRANSFER_LEARNING. Warm start shines especially when combined with the Bayesian strategy — because previous trials enter the probabilistic model as prior knowledge.

## When Tuning Does Not Meet Expectations: Symptom → Cause → Action

With tuning, the situation of "it runs but the results are poor" is common, and the exam presents that situation as a question stem.

| Symptom | Common cause | Action |
|------|-----------|------|
| Performance does not improve even after many jobs | The search range does not contain the optimum | Widen the range, and search values where order of magnitude matters on a log scale |
| It is Bayesian but barely different from Random | `max_parallel_jobs` is too high, so the sequential-learning benefit is lost | Lower the parallelism so earlier results feed into the next choice |
| Early stopping does not work at all | The algorithm does not emit intermediate metrics | Log the objective metric periodically in the training script and verify the regex match |
| Tuning cost is not under control | `max_jobs` is large and early stopping is off | Adjust the `max_jobs` ceiling + `early_stopping_type='Auto'` |
| Validation performance is the best but real performance is poor | Overfitting from repeated optimization on the same validation set | Do a final check with a separate test set, introduce cross-validation |
| Rerunning with slightly changed conditions searches from scratch | Warm start not configured | Specify the previous tuning job as the parent with `WarmStartConfig` |

The last row is especially confusing. Because tuning picks combinations to maximize the validation metric, it can **overfit to the validation set itself**. To trust the tuning result, a final check on data never used in tuning is required. The cause of a scenario like "the validation score rose greatly after tuning, but performance dropped when deployed" is usually this.

In the next post, we look at JumpStart and transfer learning, which use pre-trained models instead of training from scratch, and at training cost optimization.

## 📖 Glossary

- **Hyperparameter**: A setting value a human decides before training starts. Tree depth, learning rate, number of iterations, etc.
- **AMT (Automatic Model Tuning)**: A SageMaker feature that automatically runs multiple training jobs to find the best hyperparameter combination.
- **Objective metric**: The reference score that tuning maximizes or minimizes. For example, validation AUC or RMSE.
- **Bayesian optimization**: A strategy that, in a wide search space, estimates "where is promising" from results so far to pick the next trial. It finds good values with few runs.
- **Hyperband**: A strategy that trains many configurations a little, quickly eliminates the poor performers, and concentrates resources.
- **Early stopping**: A feature that stops in-progress training that looks hopeless rather than waiting until the end.
- **Warm start**: A feature that inherits the results of a previous tuning job and continues a new tuning from that point.
- **max_jobs / max_parallel_jobs**: The total number of training jobs tuning will run / how many of them run at the same time.
- **Scaling type**: A setting that decides whether to sweep the range linearly or on a log scale. Used for values like learning rate where order of magnitude matters.
- **Validation-set overfitting**: The phenomenon where, after repeated optimization against the same validation data, the score improves only on that data.

---

## 📝 Practice Questions

**Question 1.** With a limited compute budget, you want to find a good hyperparameter combination with as few training runs as possible. Which strategy uses the results of previous trials to choose the next trials intelligently?

A) Grid Search  
B) Random Search  
C) Bayesian  
D) Manual search  

**Answer: C**  
Explanation: Bayesian optimization builds a probabilistic model of promising regions from the trial results so far and picks the next trial where the information value is high, so it finds good values with few trials. A exhaustively covers every combination and is inefficient, B is independent random sampling and relies on luck, and D has no automation benefit.

---

**Question 2.** A tuning job runs many training jobs and is costly. How can you reduce compute cost by automatically stopping training jobs whose objective metric is clearly hopeless while in progress?

A) Lower max_parallel_jobs to 1  
B) Set early_stopping_type to Auto  
C) Change the instance type to a larger one  
D) Remove the objective metric  

**Answer: B**  
Explanation: early_stopping_type='Auto' stops partway through training jobs whose in-progress metric lags behind other trials, saving compute time. A only reduces parallelism and increases total time, C actually increases cost, and D makes tuning itself impossible.

---

**Question 3.** You finished one tuning job yesterday with the same data and algorithm, and today you want to widen only the hyperparameter ranges slightly and converge faster by reusing the previous results. What are the most suitable feature and type?

A) Warm start, IDENTICAL_DATA_AND_ALGORITHM  
B) Create a new tuning job from scratch  
C) Enable only early stopping  
D) Switch to Grid Search  

**Answer: A**  
Explanation: When the data and algorithm are identical, only the ranges are adjusted, and you want to use the previous tuning results as a starting point, the warm start IDENTICAL_DATA_AND_ALGORITHM type is appropriate. B discards prior knowledge and is inefficient, C is unrelated to reusing results, and D is exhaustive search, which is far from accelerating convergence.

---

**Question 4.** While tuning a deep learning model where a single training run takes several hours, you want a strategy that stops poorly performing configurations early in training and concentrates resources on promising ones. Which search strategy is most suitable?

A) Grid Search  
B) Hyperband  
C) Manual search  
D) Single training job  

**Answer: B**  
Explanation: Hyperband stops poorly performing configurations early during training and redistributes resources to promising configurations, so it is especially efficient for deep learning tuning where training takes a long time. A runs every combination to the end and is inefficient, C has no automation benefit, and D is not tuning.

---

**Question 5.** In HyperparameterTuner, which is correct about the meaning of max_jobs and max_parallel_jobs?

A) max_jobs is the number of concurrent runs and max_parallel_jobs is the total number of training jobs  
B) max_jobs is the total number of training jobs and max_parallel_jobs is the number of training jobs to run concurrently  
C) Both mean the number of instances  
D) Both are thresholds of the objective metric  

**Answer: B**  
Explanation: max_jobs is the total number of training jobs the tuning will run and max_parallel_jobs is the number of those to run concurrently; in the Bayesian strategy, setting parallelism too high reduces the benefit of sequential learning. A swaps the meanings of the two, C confuses them with instance settings, and D is unrelated to the objective metric.

---
