# Day 5 - Week 5 Comprehensive: Model Development 2 Review

## 📌 Key Takeaways

- The principle running through Week 5 — **go down only as far as you need, and pick the tool and metric that match the symptom.**
- **Custom training**: script mode → extended requirements → BYOC. If the question says "minimum effort," go toward the top; if it says "system dependencies," go to BYOC.
- **Distributed training**: slow → data parallel (SMDDP) / OOM → model parallel or sharding (SMP). **Solving OOM by adding GPUs is the wrong answer.**
- **Observation**: model anomaly → Debugger (+ the `StopTraining` action) / resource inefficiency → Profiler / general alarms → CloudWatch.
- **Evaluation**: with imbalanced data, never use accuracy (use F1, recall, AUC-PR); if large errors matter, use RMSE; a train-validation gap means overfitting.

## Week 5 at a Glance

This week was the second half of model development: "train with my own code, train at scale, look inside the training, and evaluate the results properly."

```
[Custom Training]      How far do I bring my own code?
   Script mode → requirements extension → BYOC

[Distributed Training] What do I split?
   Data parallel (slow) ↔ Model parallel (doesn't fit)

[Debugging·Profiling]  Look inside the training
   Debugger (model tensors) ↔ Profiler (resources)

[Model Evaluation]     Is the result really good?
   Metric selection + overfitting diagnosis + cross-validation
```

- For custom training, make the "minimum effort" side (script mode) the default and **go down only as far as needed**.
- Distributed training splits by **symptom** (slow vs OOM), observation by **concern** (model vs resources), and evaluation by **the nature of the problem** (imbalance, outliers).

### Seen Inside One Training Job

This week's four topics are not separate stories — they are **different cross-sections of the same training job**.

```text
                       ┌── Custom training: what do we run it with? (container, code)
                       │
   S3 data ──► [ SageMaker training job ] ──► model.tar.gz ──► (next week) deployment
                       │        │
                       │        └── Observation: Debugger (tensors) / Profiler (resources) / CloudWatch
                       │
                       └── Distributed training: how many machines, split how?

                            And once it finishes ──► Evaluation: metric choice · overfitting · cross-validation
```

## Custom Training Review

This is a spectrum of "how far do I bring my own code."

| Method | What you bring | Fits when |
|------|-----------|----------|
| Script mode | train.py | Standard PyTorch/TF code, minimum effort |
| Requirements extension | train.py + Python packages | Only extra pip packages are needed |
| BYOC | The entire Docker image | System packages or a special runtime |

Conventions to remember: data comes in via `SM_CHANNEL_<channel name>`, and the model is saved to `SM_MODEL_DIR` (`/opt/ml/model`). BYOC uses `/opt/ml/input/data/<channel name>/` for input and the `train` execution convention.

| Convention | Value | What happens if you break it |
|------|----|----------------|
| Input data | `/opt/ml/input/data/<channel name>/` | The training script can't find the files |
| Model save | `/opt/ml/model` (`SM_MODEL_DIR`) | Training succeeds but there is no artifact in S3 |
| Hyperparameters | `/opt/ml/input/config/hyperparameters.json` | Values run only as defaults |
| Execution convention (BYOC) | The container is run with the `train` argument | The job fails immediately |

Remember the input modes too — **File** (copy everything, then start) / **Pipe** (streaming) / **FastFile** (lazy loading when needed). If startup delay is the problem, consider FastFile or Pipe.

> 💡 **Related Theory**: This hierarchy is separation of concerns. Training logic is separated from the execution environment: if the environment is standard you only swap the code (script mode), and you build the environment yourself only when it is special (BYOC). If the exam stresses "minimum effort," choose the upper options; if it mentions "system dependencies / unsupported framework," choose the lower ones.

## Distributed Training Review

It splits according to "what you divide."

- **Data parallel**: Split the data across GPUs, train with model replicas, then average gradients with all-reduce. The problem it solves = **speed (throughput)**. SMDDP. Caution: the effective batch size grows → adjust the learning rate.
- **Model parallel**: Split or shard the model itself across GPUs. The problem it solves = **OOM (the model doesn't fit)**. SMP.
- **Infrastructure**: Inter-node communication = EFA, data supply = FSx for Lustre.

| Parallel axis | What is split | What you gain | Where it is used |
|---------|-----------|--------|------------|
| Data parallel | The batch | Throughput | Across nodes (only all-reduce traffic is needed) |
| Tensor parallel | The computation of one layer | Memory | Within a node (communication is extremely frequent) |
| Pipeline parallel | Groups of layers | Memory | Within/across nodes, but idle time (bubbles) occurs |
| Sharding (ZeRO/FSDP) | Parameters, gradients, optimizer state | Memory | When memory falls far short |

If the OOM is only "slightly short," try **mixed precision, a smaller batch + gradient accumulation, and activation checkpointing** before parallelizing.

> ⚠️ **Pitfall**: Any option that tries to solve OOM with data parallel (adding GPUs) is wrong. Data parallel keeps a full replica on every GPU, so if the model doesn't fit, adding GPUs just produces the same OOM. OOM is solved with model parallel/sharding. Conversely, "it's slow" means data parallel.

## Debugging·Profiling Review

You look inside training from two angles.

| Tool | What it observes | Typical symptom |
|------|--------|----------|
| Debugger | Model tensors (gradients, loss, weights) | Vanishing/exploding gradients, stalled loss, overfitting |
| Profiler | System resources (GPU/CPU, I/O) | Low GPU utilization, data loading / CPU bottleneck |
| CloudWatch | Overall metrics, logs, alarms | Operational monitoring |

Points to remember: Debugger rules by default only detect and report; to stop automatically you must attach an **action (StopTraining)**. Low GPU utilization is solved in the data pipeline (more workers, FSx cache, prefetching).

The exam asks directly for the practice of linking symptom to tool and action in one line.

| Symptom | Tool | Action |
|------|------|------|
| Loss stays the same for thousands of steps | Debugger `loss_not_decreasing` | Check learning rate and data; cut costs with `StopTraining` |
| Loss becomes `NaN` | Debugger `exploding_tensor` | Lower the learning rate, gradient clipping, normalize inputs |
| Only validation loss rises again | Debugger `overfit` | Regularization, augmentation, early stopping |
| GPU utilization is 25% | Profiler | More loader workers, FSx cache, prefetching |
| Only the CPU is pinned at 100% | Profiler | Pre-batch or lighten preprocessing |
| You want to compare loss across several training jobs | CloudWatch + `metric_definitions` | Extract metrics from logs with a regex |
| You want an immediate notification on failure | CloudWatch alarm / EventBridge | Follow-up automation with SNS or Lambda |

Debugger looks at the internal state of the mathematical process that is the model, and Profiler looks at the usage pattern of the physical resources that process runs on. You need to look at both layers to solve "why isn't training working" and "why is it expensive" at the same time.

## Model Evaluation Review

You measure "generalization" with "the metric that fits the problem."

- **Classification**: Confusion matrix → precision (suppresses false alarms), recall (prevents misses), F1, AUC. **With imbalance, never use accuracy**; use F1, recall, AUC-PR.
- **Regression**: RMSE (sensitive to large errors), MAE (insensitive to outliers), R².
- **Overfitting**: Diagnose by the train-validation gap → regularization, dropout, augmentation, early stopping.
- **Cross-validation**: k-fold lowers the variance of the evaluation. Imbalanced = stratified, time series = time-series split.
- **Leakage check**: Preprocessing must always be done **after the split, based on the training set**. If the score is unrealistically high, suspect leakage before overfitting.

| Signal in the scenario sentence | Metric to choose |
|---------------------|---------------|
| "Fraud is 1%," "rare disease," "must not miss" | Recall · AUC-PR (never accuracy) |
| "Must not wrongly block normal users" | Precision |
| "Both precision and recall matter" | F1 |
| "An occasional large error is fatal" | RMSE |
| "There are many outliers and we want to reduce their impact" | MAE |
| "Little data, so the evaluation is erratic" | k-fold cross-validation |

> 📚 **Case**: A team boasted of a fraud detection model with "98% accuracy," but it actually caught almost no fraud (imbalance). Its recall turned out to be 12%. After switching the evaluation metric to F1 and recall and validating with stratified k-fold, they adjusted the threshold and class weights and raised recall. Lesson: don't be fooled by a single number (accuracy); look at the metric that matches the nature of the problem.

## Comprehensive Decision Flow

Tying the whole week into a single decision tree:

```
When training
 ├─ What kind of code?  Standard framework → script mode
 │                      +Python packages → requirements
 │                      +System packages → BYOC
 ├─ Scale?              Slow → data parallel / OOM → model parallel
 └─ When problems arise Model anomaly → Debugger / resource inefficiency → Profiler

When evaluating
 ├─ Classification?  Imbalanced → F1·recall·AUC / balanced → accuracy is OK
 ├─ Regression?      Large errors matter → RMSE / insensitive to outliers → MAE
 ├─ Generalization?  Large train-validation gap = overfitting → regularization·augmentation·early stopping
 └─ Little data?     k-fold cross-validation (imbalanced = stratified, time series = time-split)
```

## Revisiting It in One Piece of Code

The settings from this week actually all attach to a single Estimator. Read it while checking which topic each argument came from.

```python
from sagemaker.pytorch import PyTorch
from sagemaker.debugger import Rule, rule_configs

estimator = PyTorch(
    entry_point='train.py', source_dir='src', role=role,   # ← custom training (script mode)
    framework_version='2.0', py_version='py310',
    instance_type='ml.p4d.24xlarge', instance_count=2,
    distribution={'torch_distributed': {'enabled': True}},  # ← distributed training
    rules=[Rule.sagemaker(                                  # ← observation (Debugger)
        rule_configs.loss_not_decreasing(),
        actions=rule_configs.ActionList(rule_configs.StopTraining())
    )],
    metric_definitions=[                                    # ← observation (CloudWatch metric)
        {'Name': 'validation:f1', 'Regex': r'val_f1: ([0-9\.]+)'}
    ],
    enable_sagemaker_metrics=True,
    use_spot_instances=True, max_run=86400, max_wait=172800,
    checkpoint_s3_uri='s3://my-bucket/ckpt/',               # ← cost and survivability
)
estimator.fit({'training': 's3://my-bucket/train/'})
```

- If you publish `val_f1` as a metric, the metric you chose in evaluation becomes the monitoring and tuning objective as is.
- Spot and checkpoints are a set, and rules and actions are a set. Turning on only one side has no effect.

## Keyword → Answer Quick Cards

| Scenario keyword | Answer |
|----------------|------|
| "Run PyTorch code with minimal effort" | Script mode |
| "Only add pip packages such as transformers" | `source_dir/requirements.txt` |
| "ffmpeg, apt packages, a specific CUDA" | BYOC (ECR image) |
| "The model fits but training is too slow" | Data parallel (SMDDP) |
| "OOM, billions of parameters" | Model parallel / sharding (SMP) |
| "Inter-node communication is the bottleneck" | EFA |
| "Feeding large data is the bottleneck" | FSx for Lustre |
| "Automatically detect vanishing/exploding gradients" | Debugger built-in rules |
| "Automatically stop training on a rule violation" | Connect a `StopTraining` **action** to the rule |
| "Diagnose why GPU utilization is low" | Profiler |
| "Training metric time series and alarms" | CloudWatch |
| "Fraud 1%, which metric?" | F1 · recall · AUC-PR (never accuracy) |
| "Strong penalty for large errors" | RMSE |
| "Training 99% / validation 70%" | Overfitting → regularization, augmentation, early stopping |
| "Little data, so evaluation is unstable" | k-fold cross-validation |

## Common Wrong-Answer Patterns

| Plausible wrong answer | Why it is wrong |
|--------------|----------|
| Adding data parallel GPUs for an OOM | A full replica still loads onto each GPU, so the OOM repeats |
| Writing apt package names in `requirements.txt` | pip installs only Python packages → BYOC is needed |
| Registering only a Debugger rule and expecting it to stop on its own | The rule only detects and reports. Stopping is the action's job |
| Switching to a pricier GPU because training is slow | If the GPU is already idle, only the idle time gets more expensive |
| Going BYOC with no system dependencies | Unnecessary Docker build and maintenance burden |
| Citing 99% accuracy on imbalanced data | That number comes out even by predicting "all negative" |
| Turning on Spot without setting checkpoints | Every interruption restarts from scratch → the savings are eaten by retraining cost |
| Using random k-fold on time-series data | Future information leaks into training and inflates the evaluation |

Next week covers model deployment and inference — putting the trained model into an actual service.

## 📖 Glossary

- **Script mode**: A method where you hand over only the training script and leave the execution environment to the AWS container. This week's default.
- **BYOC**: A method where you build your own Docker image and push it to ECR. Only when system packages or a special runtime are needed.
- **`SM_MODEL_DIR`**: `/opt/ml/model` inside the container. Only what is saved here is uploaded to S3.
- **Data parallel / model parallel**: A method that splits the data to go faster / a method that splits the model to make it fit in memory.
- **Sharding**: A technique that stores parameters, gradients, and optimizer state spread across GPUs to reduce memory.
- **EFA / FSx for Lustre**: A low-latency inter-node network / a parallel file system that feeds large data quickly.
- **Debugger action / Profiler**: A Debugger action is the step taken on a rule violation, and `StopTraining` cuts off training that is leaking cost. Profiler is a tool that measures how busy the GPU, CPU, and I/O each are and finds bottlenecks.
- **`metric_definitions`**: A setting that extracts numbers from training logs with a regex and publishes them as CloudWatch metrics.
- **AUC-PR**: The area under the precision-recall curve. A more honest metric than ROC-AUC on data where positives are very rare.
- **Data leakage**: The phenomenon where information that should be unknowable at evaluation time gets mixed into training and inflates the score.

## 📝 Practice Questions

**Question 1.** You want to run PyTorch training code on SageMaker with minimal effort, and only the transformers Python package is additionally needed. There are no system packages. What is the most suitable approach?

A) Build a Docker image yourself with BYOC  
B) Script mode + add transformers to requirements.txt in source_dir  
C) Switch to a built-in algorithm  
D) Enable model parallelism  

**Answer: B**  
Explanation: Since you only need to add Python packages to a standard framework, script mode with requirements.txt is sufficient and Docker is not needed. A is excessive work when there are no system dependencies, C cannot use your own code, and D is a distributed strategy unrelated to adding packages.

---

**Question 2.** A model with billions of parameters does not fit in single-GPU memory and hits OOM. Adding nodes with data parallelism repeats the same OOM. What is the correct solution?

A) Increase the number of data-parallel GPUs further  
B) Split and shard the model across GPUs with SageMaker model parallelism (SMP)  
C) Increase the batch size  
D) Enabling Profiler makes the OOM disappear  

**Answer: B**  
Explanation: OOM is a problem where the model replica does not fit on one GPU, so the model must be split across GPUs with model parallelism/sharding, and data parallelism does not solve it because it places a full replica on each GPU. A repeats the same OOM, C uses even more memory, and D is only a diagnostic tool and does not increase memory.

---

**Question 3.** Debugger's loss_not_decreasing rule detected a loss plateau, but training ran to the end and only incurred cost. How can you prevent the cost with automatic stopping?

A) Just add more rules  
B) Attach a StopTraining action to the rule  
C) Switch to Profiler  
D) Change instance_type to a larger one  

**Answer: B**  
Explanation: Debugger rules by default only detect and report, so to stop automatically you must explicitly attach an action such as StopTraining. A still only reports even with more rules, C is a resource analysis tool unrelated to stopping training, and D actually increases cost.

---

**Question 4.** On an imbalanced dataset where only 0.5% of transactions are fraudulent, a model is reported with "99.5% accuracy." What is the correct judgment about the evaluation?

A) With 99.5% accuracy, it is an excellent model  
B) Accuracy can be distorted by the imbalance, so re-evaluate with F1, recall, and AUC-PR  
C) Evaluate with the regression metric RMSE  
D) Cross-validation is unnecessary  

**Answer: B**  
Explanation: With a 0.5% positive imbalance, simply predicting "everything is legitimate" yields 99.5% accuracy, so accuracy cannot be trusted and you must look at rare-positive detection ability with F1, recall, and AUC-PR. A falls into the accuracy trap, C is an error of using a regression metric for classification, and D is a wrong judgment that gives up stable evaluation.

---

**Question 5.** You are training on an ml.p4d instance, but training is slower than expected and GPU utilization is low. What is the most appropriate diagnosis of the cause and first improvement direction?

A) Look at gradients with Debugger's vanishing_gradient rule  
B) Diagnose bottlenecks with Profiler, and if it is a data loading bottleneck, improve it with more DataLoader workers, an FSx cache, and prefetching  
C) Enable model parallelism unconditionally  
D) Raise the learning rate by 10x  

**Answer: B**  
Explanation: Low GPU utilization and slow training are resource efficiency problems, so find the bottleneck with Profiler and, if it is a data loading bottleneck, improve the data supply pipeline to raise GPU utilization. A is a tool that looks at model tensors and is unrelated to utilization, C is an excessive measure when there is no OOM, and D only changes convergence behavior and is unrelated to improving utilization.

---
