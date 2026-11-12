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

## 📝 Practice Questions

**Question 1.** A data scientist is tuning a deep learning model in which each trial trains for many epochs. They want to converge quickly on a good combination without wasting resources on unpromising candidates. Which AMT strategy is MOST suitable?

A) Grid Search  
B) Random Search  
C) Bayesian  
D) Hyperband  

**Answer: D**  
Explanation: Hyperband is a multi-fidelity strategy that gives few resources first and stops unpromising trials early, so it converges quickly when tuning deep learning with repeated epochs. Grid (A) is vulnerable to combinatorial explosion, random (B) has no pruning, and Bayesian (C) is also efficient, but Hyperband specializes in multi-fidelity early stopping for iterative training.

---

**Question 2.** You are tuning a classification model on imbalanced data in which the positive class (fraud) is 1% of the total. Which AMT objective metric is the LEAST appropriate?

A) validation:auc  
B) validation:f1  
C) validation:accuracy  
D) validation:recall  

**Answer: C**  
Explanation: With 1% imbalance, maximizing Accuracy yields 99% even when everything is predicted negative, so it fails to reflect positive detection ability at all. AUC (A), F1 (B), and Recall (D) better reflect positive identification performance on imbalanced data, so they are appropriate objective metrics.

---

**Question 3.** A tuning job that finished yesterday has found a reasonably good region. You want to continue the search further with the same data and algorithm instead of starting over. Which feature is MOST appropriate?

A) Warm start with the IDENTICAL_DATA_AND_ALGORITHM type  
B) Set max_parallel_jobs to the maximum  
C) Change the strategy to Grid  
D) Set early_stopping_type to Off  

**Answer: A**  
Explanation: When the data and algorithm are identical and you want to extend the previous search, a warm start of the IDENTICAL_DATA_AND_ALGORITHM type is the answer. Increasing parallelism (B), changing the strategy (C), and turning off early stopping (D) are unrelated to reusing the search knowledge of a previous job.

---

**Question 4.** While tuning with the Bayesian strategy, you set max_parallel_jobs very high, and the efficiency of finding the optimal combination was lower than expected. What is the most likely cause?

A) Bayesian is always less efficient than grid  
B) With many parallel trials, the advantage of Bayesian, which uses previous results to decide the next ones, diminishes  
C) The objective metric was incorrectly set to Minimize  
D) Spot instances were used  

**Answer: B**  
Explanation: Bayesian optimization decides the next candidates from previous trial results, so sequentiality is key. If parallelism is raised excessively, candidates must be chosen before results are available, reducing the benefit of using information. Bayesian is not always inefficient (A), and the Minimize setting (C) and Spot (D) are not directly related to this phenomenon.

---

**Question 5.** When running AMT with a custom training script, what must you do so that AMT recognizes the objective metric value of each trial?

A) Increase instance_count  
B) Specify in metric_definitions a regular expression that extracts the metric from the logs  
C) Change the input mode to Pipe  
D) Set max_jobs to 1  

**Answer: B**  
Explanation: A custom script does not automatically provide standard metric names, so you must specify metric_definitions to parse the metrics printed in the training log with a regular expression so that AMT can read the objective metric. The instance count (A), input mode (C), and max_jobs (D) are unrelated to metric recognition.

---
