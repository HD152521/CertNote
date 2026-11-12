# Day 2 - Hyperparameter Tuning (AMT): Bayesian, Random, Hyperband

## 📌 Key Takeaways

- **Parameters are values that are learned; hyperparameters are values a person sets before training.** AMT searches the space of the latter to find the combination with the best validation metric.
- Strategy choice: **Bayesian** if you want efficiency with few evaluations, **Hyperband** for pruning epoch-iterative deep learning, **Random** for a simple, fully parallel baseline, and **Grid** for exhaustively covering a few categorical combinations.
- **The objective metric is the optimization direction.** On imbalanced data, maximizing Accuracy gives 99% even for "all negative," making the model meaningless — use F1, AUC, or Recall.
- A custom script has no standard metric names, so AMT recognizes the metric only if you extract it from the logs with a **`metric_definitions` regex**.
- **Raising `max_parallel_jobs` too much reduces the benefit of Bayesian search** (because candidates are chosen without seeing earlier results). Random is independent, so it loses nothing.

## Hyperparameters vs Parameters

If yesterday you learned how to run one training job well, today covers SageMaker Automatic Model Tuning (AMT, the Hyperparameter Tuning Job), which **runs that training many times automatically to search for the best combination**.

| Aspect | Who sets it | When it is set | Examples |
|---|---|---|---|
| **Parameter** | The training algorithm | During training, from the data | Neural network weights, linear model coefficients |
| **Hyperparameter** | A person (or AMT) | **Before** training starts | Learning rate, `max_depth`, number of trees, regularization strength |

```text
Define the search space → run several training jobs (trials) → evaluate each trial's objective metric
→ pick the next trial's hyperparameters according to the strategy → return the best combination
```

Hyperparameter tuning is essentially "black-box optimization." The objective function (the validation metric) is not differentiable, and one evaluation (= one training run) is expensive. So strategies that find a good region with as few evaluations as possible (Bayesian, Hyperband) are more efficient than random or grid search.

### Execution Structure of a Tuning Job

```text
[HyperparameterTuner]
   │  Search space: eta ∈ [0.01, 0.3], max_depth ∈ [3, 10]
   │  Objective metric: validation:auc (Maximize)
   ▼
 ┌──────────── runs max_parallel_jobs at the same time ────────────┐
 │  trial#1 ──train──→ auc 0.81                                    │
 │  trial#2 ──train──→ auc 0.86  ← promising                       │
 │  trial#3 ──train──→ auc 0.74  ← hopeless (early-stop candidate) │
 └─────────────────────────────────────────────────────────────────┘
   │  The strategy (Bayesian, etc.) looks at the results and picks the next candidates
   ▼  … repeat until max_jobs is used up …
[Return the best combination + BestTrainingJob]
```

## Four Search Strategies

The strategies AMT supports and their characteristics.

| Strategy | Behavior | When to use | When not to use |
|---|---|---|---|
| **Grid** | Exhaustively searches every combination on a grid | When you want to see a few categorical combinations without omission | Continuous or high-dimensional spaces (combinatorial explosion, curse of dimensionality) |
| **Random** | Samples randomly from the space | A simple baseline, or a quick fully parallel sweep | When training cost is high and you must conserve evaluations |
| **Bayesian** | Builds a surrogate model from earlier results and focuses on promising regions | When one evaluation is expensive and you must find **a good value in few runs** | When you need to push parallelism to the extreme (sequentiality is the source of its benefit) |
| **Hyperband** | Multi-fidelity — gives few resources and stops hopeless trials early | Deep learning that iterates over epochs, where fast convergence is the goal | Training with no iteration steps, so intermediate performance cannot be observed |

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

- "Efficient search with few training runs" → **Bayesian**.
- "Like deep learning, iterates over epochs + we want to discard hopeless candidates quickly" → **Hyperband**.
- "Simple/fully parallel, baseline" → **Random**.
- "Exhaustive over a few categorical combinations" → **Grid**.

> ⚠️ **Trap**: Grid search looks safe because it "looks at everything," but the number of combinations explodes as soon as even a few continuous hyperparameters are mixed in. If the question features a continuous range (`ContinuousParameter`), Grid is effectively a wrong-answer candidate.

## Objective Metric

AMT extracts the metric from each trial's logs with a regex and compares them.

- Built-in algorithms provide standard metric names as-is (`validation:auc`, `validation:rmse`, etc.).
- For a custom script, you must specify with `metric_definitions` a regex that parses the value from the logs.

```python
metric_definitions=[
    {"Name": "validation:f1", "Regex": "val_f1: ([0-9\\.]+)"}
]
```

- **objective_type**: Maximize (AUC, F1, Accuracy) or Minimize (RMSE, Loss).
- Since the metric choice is "what you optimize," on imbalanced data it is right to target F1/AUC rather than Accuracy.

### Objective Metric Interpretation Table by Situation

| Situation | Candidate objective metrics | Direction | Why / what to watch for |
|---|---|---|---|
| Classification with roughly balanced classes | `validation:accuracy` | Maximize | Accuracy is an honest signal only when balanced |
| Fraud or anomaly detection with ~1% positives | `validation:f1`, `validation:auc` | Maximize | **Accuracy is 99% even for "all negative"** — a trap |
| Missing is fatal (disease, undetected fraud) | `validation:recall` | Maximize | Accept false positives to reduce misses |
| Alerts or blocking where false positives are costly | `validation:precision` | Maximize | Raises the true share among what was called positive |
| Ranking problem where the threshold is not yet set | `validation:auc` | Maximize | Looks at ranking quality regardless of threshold |
| Continuous-value prediction (demand, price) | `validation:rmse` | **Minimize** | Error metrics run the opposite direction — beware of setting mistakes |

Tuning optimizes only in the direction the objective metric points. On data with 1% positives, such as fraud detection, maximizing Accuracy gives 99% even if you label everything "normal," making the model meaningless. That is why choosing the objective metric to fit the business goal and the data imbalance (F1, Recall, AUC, etc.) is the precondition for tuning to succeed.

> ⚠️ **Trap**: If you use a custom container or script and omit `metric_definitions`, AMT cannot read the metric. In that case, options that raise `instance_count` or change the input mode are all irrelevant wrong answers.

## Early Stopping

It saves cost by stopping hopeless trials early. Distinguish two levels.

| Level | Setting | Behavior |
|---|---|---|
| Trial-level early stopping | `early_stopping_type="Auto"` (default `Off`) | During training, if the objective metric is unlikely to improve relative to other trials, that training job is stopped. An option used with Bayesian/Random |
| Built-in strategy pruning | `strategy="Hyperband"` | Allocates resources unevenly via multi-fidelity and has early stopping built in. Ignores a separate `early_stopping_type` |

```python
tuner = HyperparameterTuner(
    ..., early_stopping_type="Auto",   # Off | Auto
)
```

Discriminating signal: "automatically stop hopeless training to cut tuning cost" → early stopping (Auto) or Hyperband.

## Warm Start

A new tuning job starts **by leveraging the results of a previous tuning job**. Instead of searching from scratch, it starts from the good regions already discovered.

| Type | Meaning | Typical situation |
|---|---|---|
| **IDENTICAL_DATA_AND_ALGORITHM** | Same data and algorithm, extends the search | Yesterday's tuning found a good region, and you raise `max_jobs` to keep searching |
| **TRANSFER_LEARNING** | Transfers earlier knowledge even if the data/algorithm changed slightly | New data was added or the algorithm settings changed a little |

```python
from sagemaker.tuner import WarmStartConfig, WarmStartTypes

warm = WarmStartConfig(
    warm_start_type=WarmStartTypes.IDENTICAL_DATA_AND_ALGORITHM,
    parents={"previous-tuning-job-name"},
)
tuner = HyperparameterTuner(..., warm_start_config=warm)
```

Discriminating signals:

- "Continue the last tuning and explore further / data and algorithm unchanged" → **IDENTICAL_DATA_AND_ALGORITHM**.
- "The data changed slightly but we want to reuse the knowledge from the last tuning" → **TRANSFER_LEARNING**.

In a question that says "continue the previous search," options such as raising `max_parallel_jobs`, switching the strategy to Grid, or turning off early stopping get mixed in. All three are unrelated to reusing the previous job's search knowledge — warm start is the only means of reuse.

## The Trade-off Between Parallelism and Bayesian Efficiency

- A large `max_parallel_jobs` finishes sooner, but Bayesian search decides the next candidates by looking at earlier results, so **making parallelism too large reduces learning efficiency (use of information)**.
- Random loses no efficiency when you raise parallelism (the trials are independent of each other).
- On the exam, "it was Bayesian but maximizing parallelism did not improve things as expected" is answered by this trade-off.

```text
max_parallel_jobs = 1        max_parallel_jobs = N (large)
  trial1 → result applied      trial1 ┐
  trial2 → result applied      trial2 ├─ decided at the same time
  trial3 → result applied      trial3 ┘  (cannot see earlier results)
  ─────────────────────        ─────────────────────
  Slow / best efficiency per evaluation   Fast / Bayesian benefit reduced
  Random has the same efficiency either way (each trial is independent)
```

| Goal | Recommended setting | Why |
|---|---|---|
| Shortening wall-clock time is the top priority | Random + large `max_parallel_jobs` | Independent sampling, so no parallelism loss |
| One training run is expensive and you conserve evaluations | Bayesian + small `max_parallel_jobs` | Reflects earlier results as much as possible |
| Cut deep learning tuning cost | Hyperband | Gives no resources to hopeless trials |
| Reuse a previous tuning | Warm start | Starts from a good region and removes wasted search |

## Tuning Strategy Decision Tree

```text
We need to find hyperparameters automatically
├─ Does training iterate over epochs/rounds and expose intermediate performance?
│    ├─ Yes + cost savings matter → Hyperband (early pruning built in)
│    └─ No ↓
├─ Is one training run expensive?
│    ├─ Yes → Bayesian (+ early_stopping_type="Auto", keep parallelism modest)
│    └─ No ↓
├─ Is the search space a few categorical combinations?
│    ├─ Yes → Grid (exhaustive search)
│    └─ No  → Random (simple baseline, fully parallel)
└─ Is there a previous tuning result?
     ├─ Same data and algorithm → warm start IDENTICAL_DATA_AND_ALGORITHM
     └─ Slightly changed        → warm start TRANSFER_LEARNING
```

## Question Clue → Answer Mapping

| Question clue | Answer to pick | Why |
|---|---|---|
| "Deep learning, each trial trains several epochs, minimize wasted resources" | Hyperband | Stops hopeless candidates early via multi-fidelity |
| "We want to find a good combination with few training runs" | Bayesian | Focuses on promising regions using earlier results |
| "Set a simple baseline with full parallelism" | Random | Trials are independent, so no parallelism loss |
| "Look at every combination of a few categorical values" | Grid | Exhaustive search holds up only when combinations are few |
| "Objective metric for fraud data with 1% positives" | AUC, F1, Recall (Accuracy is **wrong**) | Accuracy is 99% even for all negative |
| "A custom script, but the metric cannot be read" | Specify a `metric_definitions` regex | Standard metric names are not provided automatically |
| "Continue the last tuning and explore more, same data and algorithm" | Warm start IDENTICAL_DATA_AND_ALGORITHM | Extends the previous search results as-is |
| "It was Bayesian but maximizing parallelism made efficiency worse" | Parallelism ↑ → less use of earlier results | Bayesian's sequentiality is the source of its benefit |
| "We want to cut tuning cost" | `early_stopping_type="Auto"` or Hyperband | Stops hopeless training to cut billing |
| "Use RMSE as the objective metric" | `objective_type="Minimize"` | Error metrics run the opposite direction |

The next post covers **overfitting and underfitting**, which block the goal of tuning — "good generalization" — and how to respond (regularization and data augmentation).

## 📖 Glossary

- **Hyperparameter**: a setting a person decides before training starts. Learning rate, tree depth, regularization strength, and so on.
- **Parameter**: a value determined automatically from the data during training. Neural network weights, regression coefficients, and so on.
- **AMT (Automatic Model Tuning)**: a SageMaker feature that runs training many times with different hyperparameter combinations to find the best one.
- **Trial (one training job)**: an individual training job a tuning job runs. The unit that evaluates one hyperparameter combination once.
- **Objective metric**: the reference metric used to judge whether tuning is good or bad. This metric is the optimization direction.
- **`metric_definitions`**: regex definitions that pull metric values out of the training logs. The device that lets a custom script's objective metric be recognized.
- **Surrogate model**: the stand-in model Bayesian search builds to predict "with this combination, performance will be roughly this."
- **Multi-fidelity**: a method that first sweeps many candidates with few resources (short training) and gives more resources only to the survivors. The core of Hyperband.
- **Early stopping**: stopping training that is unlikely to improve partway through to save time and cost.
- **Warm start**: a method that inherits information found by a previous tuning job, so the search starts from good regions instead of a blank slate.

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
