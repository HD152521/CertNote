# Day 5 - Week 8 Comprehensive Review: Training, Tuning, Generalization

## 📌 Key Takeaways

- Week 8 is the second half of Domain 3 (Modeling) — four flows: **train (Day 1), tune (Day 2), generalize (Day 3), and make it converge well (Day 4)**.
- Every problem splits along two axes: the **optimization axis** (does it reduce training loss well: learning rate, batch, gradients) and the **generalization axis** (does it fit new data: regularization, data, validation). First work out which axis the symptom belongs to.
- **Data size, model size, cost → training infrastructure** (input mode, distribution, Spot); **efficiency, cost → tuning strategy** (Bayesian/Hyperband/early stopping).
- **Size of the gap → overfitting/underfitting remedy**; **symptom → optimization cause and tool** (quality = Debugger, resources = Profiler).
- Easy-to-confuse traps: responding to overfitting with more epochs or a bigger model, missing checkpoints with Spot (`max_wait >= max_run`), and using Accuracy as the objective metric on imbalanced data.

## The Week at a Glance

```text
[Day1] Training execution foundation
  Estimator → input mode (File/Pipe/FastFile) → distribution (data/model parallel) → Spot + checkpoints

[Day2] Hyperparameter tuning (AMT)
  search space · objective metric → strategy (Bayesian/Random/Grid/Hyperband) → early stopping → warm start

[Day3] Generalization
  diagnose overfitting/underfitting (bias-variance) → regularization (L1/L2/dropout/early stopping) → data augmentation → leakage prevention

[Day4] Training optimization
  batch size · learning rate schedule → vanishing/exploding gradients → Debugger (quality) / Profiler (resources)
```

> 💡 **Related Theory**: The core tension in the second half of modeling is two axes. (1) **Optimization** — does it reduce the loss on training data well (learning rate, batch, gradients). (2) **Generalization** — does it fit new data well (regularization, data, validation). These are different. If optimization succeeds (low training loss) but generalization fails (high validation loss), that is overfitting. Exam questions are almost always designed to first ask "is this symptom an optimization problem or a generalization problem?"

## Integrated Decision Tree

```text
A training-related problem is given
├─ ① Is this a stage where you can't even run training yet? (infrastructure)
│    ├─ Data is larger than the disk / want to cut startup delay → Pipe / FastFile
│    ├─ Download everything and access randomly                   → File
│    ├─ Training is slow + the model fits on a GPU                → data parallel
│    ├─ The model exceeds single-GPU memory                       → model parallel
│    └─ Cost reduction (delay tolerated)  → Managed Spot + checkpoint_s3_uri
│                               (max_wait >= max_run required)
├─ ② Training runs but convergence looks wrong? (optimization — Day 4)
│    ├─ NaN · divergence · oscillation → lower learning rate + gradient clipping
│    ├─ Early layers stalled · plateau → vanishing → ReLU · BN · residual · initialization
│    ├─ OOM                            → lower batch / gradient accumulation / mixed precision
│    └─ GPU underused · slow · expensive → diagnose the bottleneck with Profiler
├─ ③ It converges but performance is bad? (generalization — Day 3)
│    ├─ Train high, validation low, large gap → overfitting → stronger regularization · more data · augmentation · dropout · early stopping
│    ├─ Both train and validation low         → underfitting → more complexity · features · longer training
│    └─ Validation score unrealistic          → leakage → check fit scope · target-derived features
└─ ④ Performance is fine but you need to squeeze out more? (tuning — Day 2)
     ├─ Efficient search with few evaluations → Bayesian
     ├─ Deep learning epoch iteration + pruning → Hyperband
     ├─ Reduce tuning cost → early stopping (Auto) or Hyperband
     └─ Reuse a previous tuning job → warm start
```

## Day 1 Summary — Input Modes, Distribution, Spot

| Cue | Choice |
|------|------|
| Data exceeds the disk, reduce startup delay | Pipe / FastFile |
| Download everything and access randomly | File |
| Speed up training, model fits on a GPU | Data parallel |
| Model exceeds single-GPU memory | Model parallel |
| Cost reduction (some delay tolerated) | Managed Spot + `checkpoint_s3_uri` |

Only what you write to `/opt/ml/model` is uploaded to S3, and Spot requires `max_wait >= max_run` — remember these as trap points.

## Day 2 Summary — Tuning Strategies

| Cue | Strategy |
|------|------|
| Efficient search with few evaluations | Bayesian |
| Deep learning epoch iteration, fast pruning | Hyperband |
| Simple, fully parallel baseline | Random |
| Exhaustive search over a few categorical combinations | Grid |
| Reduce tuning cost | Automatic early stopping / Hyperband |
| Continue from a previous tuning job | Warm start |

The objective metric for imbalanced data is F1/AUC, not Accuracy. With Bayesian, raising parallelism too high lowers how much it can use earlier results.

### Objective Metrics — What Do You Optimize

Tuning optimizes only in the direction the objective metric points. If the metric choice is wrong, you get a well-tuned but meaningless model.

| Situation | Objective metric | Direction | Why |
|---|---|---|---|
| Balanced classification | Accuracy, AUC | Maximize | Accuracy moves honestly |
| **Imbalanced classification** (fraud detection, etc.) | F1, AUC, Recall | Maximize | With 1% positives, "all negative" gives 99% accuracy — **Accuracy is a trap** |
| Missing a case is fatal (disease, fraud) | Recall | Maximize | The cost of a false negative is greater |
| False alarms are costly | Precision | Maximize | False positives create real operational cost |
| Regression | RMSE, MAE | Minimize | Direction that reduces error |
| Custom script | `metric_definitions` regex required | — | The value must be parsed from the logs for AMT to compare |

## Day 3 Summary — Generalization Diagnosis and Remedies

| Symptom | Diagnosis | Remedy |
|------|------|------|
| Train high, validation low (large gap) | Overfitting (high variance) | Stronger regularization, more data, dropout, early stopping, augmentation |
| Both train and validation low | Underfitting (high bias) | More complexity, more features, longer training |
| Need feature selection / sparse model | — | L1 |
| Want to shrink all weights | — | L2 |

Scalers and encoders are `fit` on the training set only — this is the basis of leakage prevention.

## Day 4 Summary — Optimization and Tools

| Symptom | Root cause | Response |
|------|------|------|
| NaN / divergence / oscillation | Learning rate too high, exploding gradients | Lower learning rate, gradient clipping |
| Early layers not learning, loss plateau | Vanishing gradients | ReLU, batch normalization, residual connections, initialization |
| OOM | Excessive batch size | Lower batch, gradient accumulation, mixed precision |
| Automatic detection of quality anomalies | — | Debugger |
| Resource bottleneck, GPU underuse | — | Profiler |

## Services and Features Master Table

| Feature | What it does | When to pick it | Confusion warning |
|---|---|---|---|
| **Training Job (Estimator)** | Managed one-off training run | When running training as a container | The instance exists only for the duration of the job |
| **Input mode File/Pipe/FastFile** | How data is delivered from S3 to the container | Depending on data size and startup-delay requirements | Pipe = streaming, FastFile = lazy loading + random access |
| **Data parallel / model parallel** | Distribute training across multiple devices | Speed problem vs model size problem | Tell whether "GPU memory exceeded" is caused by the model or the batch |
| **Managed Spot Training** | Cheap, interruptible instances | Cost reduction is the goal, delay is tolerated | Without checkpoints, the savings are meaningless |
| **AMT (tuning job)** | Automatic hyperparameter search | When you need to find the optimal combination | Can't fix convergence problems in training itself |
| **Debugger** | Detects quality anomalies from tensors during training | Vanishing, exploding, overfitting, stalled loss | Not for resource analysis |
| **Profiler** | Analyzes CPU/GPU and I/O resource bottlenecks | GPU underuse, slowness, cost inefficiency | Not for detecting quality anomalies |
| **Model Monitor** | Watches drift on deployed endpoints | **The operations stage, not training** | Picking it for anomaly detection during training is wrong |

### Settings Master Table — Where the Traps Hide

| Setting | Where | What happens if you miss it |
|---|---|---|
| `output_path` / `/opt/ml/model` | Estimator | Only what is written to this path is uploaded to S3 automatically |
| `input_mode` (File/Pipe/FastFile) | TrainingInput | With File, training doesn't start until the download finishes |
| `instance_count` + `distribution` | Estimator | If you only add instances without choosing a distribution strategy, it won't work as intended |
| `use_spot_instances` + `max_wait` | Estimator | Unless `max_wait >= max_run`, the Spot configuration isn't valid |
| `checkpoint_s3_uri` | Estimator | Without it, a Spot interruption means retraining from scratch |
| `strategy` / `early_stopping_type` | HyperparameterTuner | Hyperband has early stopping built in and ignores `early_stopping_type` |
| `max_jobs` / `max_parallel_jobs` | HyperparameterTuner | With Bayesian, raising parallelism too high lowers efficiency |
| `objective_metric_name` | HyperparameterTuner | Putting Accuracy on imbalanced data makes the tuning itself futile |
| `l1` / `wd` | Linear Learner | `wd` is L2 (weight decay) — only the name differs |
| `gradient_clipping` / `lr_scheduler` | Training hyperparameters | First-line means of handling explosion and divergence |

## Thinking Through Integrated Cases

> **Case A**: A text classification model has 96% training accuracy and 75% validation accuracy. Data is scarce and collecting more is hard. You also want to cut tuning cost.

Solution:

1. Large gap → **overfitting** (Day 3) → stronger regularization, **data augmentation (back-translation, etc.)**, dropout.
2. Little data → stabilize evaluation with **k-fold cross-validation**.
3. Reduce tuning cost → **Hyperband** or early stopping (Day 2).

> **Case B**: You are training a large model on 8TB of data and it is too slow and too expensive. It also exceeds single-GPU memory.

Solution:

1. Data exceeds disk → **Pipe/FastFile** (Day 1).
2. Exceeds a single GPU → **model parallel** (Day 1).
3. Cost reduction → **Spot + checkpoints** (Day 1).
4. If GPU underuse is suspected → identify the bottleneck with **Profiler** (Day 4).

## Commonly Missed Traps

| Trap | Why it's wrong | Correct judgment |
|---|---|---|
| Responding to overfitting with "more epochs / bigger model" | It increases variance and makes things worse | Regularization, data, augmentation, early stopping |
| Reflex "GPU memory exceeded = model parallel" | The cause may be the batch | The model itself doesn't fit → model parallel / because of the batch → accumulation, mixed precision, lower batch |
| Confusing Debugger and Profiler | They look at different things | **Quality = Debugger, resources = Profiler**, post-deployment drift = Model Monitor |
| Using Spot without checkpoints | An interruption means retraining from scratch → savings vanish | Set `checkpoint_s3_uri`, `max_wait >= max_run` |
| Accuracy as the objective metric on imbalanced data | Predicting only the majority class still scores high | F1 / AUC / Recall |
| Merging the validation set into training to raise performance | Measuring generalization becomes impossible | Validation is for selection, test is scored once at the end |
| Fitting a scaler on the whole dataset | Test information leaks into training | `fit` on the training set only, `transform` for the rest |
| Setting maximum parallelism for Bayesian | It decides the next trial without seeing earlier results | Moderate parallelism; fully parallel suits Random |

## Question Cue → Answer Mapping

| Question cue | Answer to pick | Which Day |
|---|---|---|
| "Training loss is very low but validation loss is much higher" | Optimization succeeded, generalization failed = overfitting | Day 3 |
| "Both training and validation are low and the gap is small" | Underfitting → more complexity · features · training | Day 3 |
| "The data is larger than the instance disk" | Pipe / FastFile input mode | Day 1 |
| "The model exceeds single-GPU memory" | Model parallel | Day 1 |
| "Cut cost substantially but delay is tolerated" | Managed Spot + checkpoints | Day 1 |
| "Quickly discard hopeless candidates to cut tuning cost" | Hyperband | Day 2 |
| "Search efficiently with few training runs" | Bayesian | Day 2 |
| "Continue exploring from last tuning job's results" | Warm start | Day 2 |
| "Objective metric for data with 1% positives, like fraud detection" | F1 / AUC (Accuracy is a trap) | Day 2 |
| "Automatically zero out features to get a sparse model" | L1 | Day 3 |
| "Labeling cost is high so you can't grow the data" | Data augmentation | Day 3 |
| "Loss suddenly diverges to NaN" | Lower learning rate + gradient clipping | Day 4 |
| "GPU utilization 30%, suspect data-loading bottleneck" | Profiler | Day 4 |
| "Automatically detect and alert on vanishing, overfitting, non-decreasing loss" | Debugger | Day 4 |
| "Monitor input distribution changes after deployment" | Model Monitor (next week's scope) | Week 9 |

Next week moves to Domain 4 and covers how to **deploy, operate, and monitor** models.

## 📖 Glossary

- **Optimization / generalization**: The problem of reducing loss well on training data (learning rate, batch, gradients) / the property that performance holds on new data too (regularization, data, validation). Separating these two axes is the starting point for solving Week 8 questions.
- **Input mode**: How training data in S3 is delivered to the container. File (full download), Pipe (streaming), FastFile (lazy loading).
- **Data parallel / model parallel**: Replicating the same model and splitting the data / splitting the model itself across multiple devices.
- **Managed Spot Training / checkpoint**: An option that reduces cost by training on cheap instances that can be interrupted / a state snapshot that lets training resume from that point after an interruption. The two are a set.
- **AMT (Automatic Model Tuning)**: A SageMaker feature that automatically searches hyperparameter combinations across multiple training jobs to find the optimum.
- **Hyperband / warm start**: A multi-fidelity strategy that allocates resources unevenly and cuts hopeless candidates early / a setting that starts from earlier tuning results and continues the search.
- **Objective metric**: The validation metric that tuning maximizes or minimizes. What you choose is what you optimize, and picking Accuracy on imbalanced data makes tuning futile.
- **Bias-variance tradeoff**: The relationship where making the model simpler increases bias and making it more complex increases variance. The goal is the point where their sum is minimal.
- **Debugger / Profiler**: A tool that catches quality anomalies during training (vanishing, exploding, overfitting) / a tool that analyzes CPU, GPU, I/O resources and bottlenecks. The pair most often mixed up on the exam.
- **Drift**: The phenomenon where the real input or prediction distribution after deployment differs from that at training time. It is the subject of Model Monitor.

## 📝 Practice Questions

**Question 1.** A model's training loss is very low, but its validation loss is much higher. Which statement BEST characterizes this situation?

A) Overfitting: optimization succeeded but generalization failed  
B) Underfitting: optimization failed  
C) The learning rate was too small, so it did not converge  
D) Data leakage made the validation score unrealistically high  

**Answer: A**  
Explanation: A low training loss means optimization (fitting the training data) succeeded, and a high validation loss means generalization failed, that is, overfitting. Underfitting (B) is when both are high, and the symptom pattern differs from that of a too-small learning rate (C) or leakage (D).

---

**Question 2.** The 8 TB of training data is larger than the instance disk, the model exceeds a single GPU's memory, and you also want to reduce cost. Which combination is MOST appropriate?

A) File mode + data parallel + On-Demand  
B) Pipe mode + model parallel + Managed Spot + checkpoints  
C) FastFile + single instance + grid search  
D) File mode + model parallel + early stopping  

**Answer: B**  
Explanation: For data larger than the disk, streaming Pipe; for exceeding a single GPU's memory, model parallelism; and for cost reduction, Spot plus checkpoints correspond exactly to each requirement. File mode (A, D) has a large-data startup delay problem, and a single instance (C) does not solve the model memory overrun.

---

**Question 3.** In deep learning tuning, you want to converge quickly without wasting resources on unpromising candidates while reducing tuning cost. Which AMT strategy is MOST suitable?

A) Grid Search  
B) Hyperband  
C) Random with max_parallel_jobs at maximum  
D) Bayesian with early_stopping_type=Off  

**Answer: B**  
Explanation: Hyperband stops unpromising trials early through multi-fidelity, making deep learning tuning converge quickly while also reducing cost. Grid (A) is weak against combinatorial explosion, unlimited-parallel random (C) has no pruning, and Bayesian with early stopping turned off (D) goes in the opposite direction from cost reduction.

---

**Question 4.** During training, the loss suddenly diverged to NaN. Which of the following should be checked and applied first?

A) Increase the number of model layers  
B) Collect more data  
C) Lower the learning rate and apply gradient clipping  
D) Merge the validation set into training  

**Answer: C**  
Explanation: NaN divergence is typically caused by an excessive learning rate or exploding gradients, so lowering the learning rate and applying gradient clipping are the first responses. Enlarging the model (A) and collecting data (B) are unrelated to divergence, and merging validation into training (D) makes measuring generalization impossible.

---

**Question 5.** Training converges normally, but GPU utilization is low at 30% and you suspect a data loading bottleneck. You want to analyze resource utilization to improve cost and speed. Which tool is MOST suitable?

A) SageMaker Debugger's vanishing_gradient rule  
B) SageMaker Profiler  
C) Automatic Model Tuning  
D) SageMaker Model Monitor  

**Answer: B**  
Explanation: System resource and performance problems such as GPU underutilization and data loading bottlenecks are analyzed and advised on by Profiler. Debugger (A) is for training quality issues such as gradients and overfitting, AMT (C) is for hyperparameter search, and Model Monitor (D) monitors inference drift after deployment.

---
