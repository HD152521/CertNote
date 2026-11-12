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
