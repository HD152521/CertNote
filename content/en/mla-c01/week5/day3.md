# Day 3 - Debugging and Profiling: SageMaker Debugger and Profiler

## 📌 Key Takeaways

- **Debugger = model internals (tensors)**, **Profiler = system resources**. If the symptom is training quality, use Debugger; if it is speed or cost, use Profiler.
- Debugger saves tensors to S3 and detects anomalies with **built-in rules** (vanishing_gradient, exploding_tensor, loss_not_decreasing, overfit, etc.).
- **Detection ≠ automatic stop** — you must attach an **action** such as `StopTraining` to the rule to block cost. An easy trap.
- Profiler finds low GPU utilization, data loading, and CPU bottlenecks. A GPU sitting idle is usually a problem of the **data pipeline, not the model**.
- Overall metrics, logs, and alarms are handled by **CloudWatch**, and TensorBoard handles visualizing the training curves.

## Separating the Roles of Debugger and Profiler

If the loss does not decrease, or the utilization of an expensively rented GPU stays at 30%, you need to look inside the training. First, clearly divide the concerns of the two tools.

| Aspect | SageMaker Debugger | SageMaker Profiler |
|------|-------------------|-------------------|
| What it looks at | Model internal tensors (gradients, weights, loss, activations) | System resources (CPU/GPU utilization, memory, I/O) |
| Question it answers | "Why is the model being trained wrong?" | "Why is it slow/inefficient?" |
| Typical detections | Vanishing/exploding gradients, overfitting, weights not updating | Low GPU utilization, data loading bottleneck, CPU bottleneck |
| How it works | Periodically saves tensors to S3, then evaluates rules | Collects and analyzes system and framework metrics |
| Automatic action | Notification/early stop (action) when a rule is violated | Bottleneck report and recommendations |

- Core intuition: **Debugger sees "the model is wrong," Profiler sees "resources are being wasted."**
- **Training-quality** symptoms like "the gradient went to 0/exploded" → Debugger.
- **Resource** symptoms like "the GPU is idle/data loading is slow" → Profiler.

```text
First classify the symptom by layer

  Loss/accuracy looks odd              → model layer      → Debugger (tensors)
        │
  It trains but is slow/expensive      → resource layer   → Profiler (GPU/CPU/IO)
        │
  Want job status and overall trends   → operations layer → CloudWatch (metrics, logs, alarms)
```

This separation corresponds to two layers of observability. Debugger looks at the internal state (tensors) of the "mathematical process" that is the model — if gradients vanish, training stops, and if they explode, it diverges. Profiler looks at the usage pattern of the "physical resources" on which that process runs — whether the GPU sits idle waiting for data, or preprocessing is tying up the CPU. You must look at both layers together to solve "why isn't it learning" and "why is it expensive" at the same time.

## SageMaker Debugger: See Inside the Model

Debugger periodically saves tensors (gradients, weights, loss, etc.) to S3 during training and detects anomalies with predefined **built-in rules**.

```python
from sagemaker.debugger import Rule, rule_configs, DebuggerHookConfig

estimator = PyTorch(
    entry_point='train.py', role=role,
    instance_type='ml.g5.xlarge', instance_count=1,
    framework_version='2.0', py_version='py310',
    rules=[
        Rule.sagemaker(rule_configs.vanishing_gradient()),   # vanishing gradient
        Rule.sagemaker(rule_configs.exploding_tensor()),     # exploding tensor
        Rule.sagemaker(rule_configs.overfit()),              # overfitting
        Rule.sagemaker(rule_configs.loss_not_decreasing())   # loss stalled
    ],
    debugger_hook_config=DebuggerHookConfig(
        s3_output_path='s3://my-bucket/debug-tensors/'
    )
)
```

Memorize the built-in rules grouped as "what it sees → what to suspect → what to do."

| Built-in rule | What it detects | Cause to suspect | First action |
|-----------|-----------|-----------|---------|
| `vanishing_gradient` | Gradients converge to 0 | Deep layers with an unsuitable activation function/initialization | Replace the activation function, add normalization layers, change initialization |
| `exploding_tensor` | Tensor values diverge | Learning rate too large, missing scaling | Lower the learning rate, gradient clipping, normalize inputs |
| `loss_not_decreasing` | Loss stalls for a number of steps | Unsuitable learning rate, data/label problem | Adjust the learning rate, check the data, then **stop early** |
| `overfit` / `overtraining` | Only the validation loss worsens | Overfitting | Regularization, augmentation, early stopping |
| `dead_relu` | Too high a ratio of dead neurons | Activation function, initialization, learning rate | Change the activation function, lower the learning rate |
| `weight_update_ratio` | Weight update magnitude is abnormal | Learning rate is too large or too small | Readjust the learning rate |
| `class_imbalance` | Class distribution is skewed | Bias in data collection | Resampling, class weights |

You can also choose the tensors to collect yourself and adjust the save interval. Saving tensors densely makes the diagnosis more precise, but increases S3 writes and training overhead.

```python
from sagemaker.debugger import DebuggerHookConfig, CollectionConfig

debugger_hook_config = DebuggerHookConfig(
    s3_output_path='s3://my-bucket/debug-tensors/',
    collection_configs=[
        CollectionConfig(name='losses',    parameters={'save_interval': '50'}),
        CollectionConfig(name='gradients', parameters={'save_interval': '100'}),
        CollectionConfig(name='weights',   parameters={'save_interval': '500'}),
    ]
)
```

**Concept: rules run outside the training.** Debugger built-in rules run not inside the training container but as a **separate evaluation job**. Training only writes tensors to S3, and the rules read those tensors to judge. Thanks to this, rule evaluation does not eat much into training speed, but remember as well that there is **a slight delay in the judgment** and a separate resource cost comes with it.

> ⚠️ **Pitfall**: By default, a rule only does "detect and report." To stop training automatically when a rule is violated, you must connect an **action** separately. For example, to prevent the accident of training running to the end and just burning cost even though the gradients are exploding, you attach a `StopTraining` action. The key is not to mistake "detection = automatic stop."

```python
from sagemaker.debugger import Rule, rule_configs
from sagemaker.debugger import CollectionConfig

# Stop training automatically + notify when the rule is violated
rule = Rule.sagemaker(
    rule_configs.loss_not_decreasing(),
    actions=rule_configs.ActionList(
        rule_configs.StopTraining(),          # stop training (save cost)
        rule_configs.Email("ml-team@example.com")
    )
)
```

## SageMaker Profiler: See Resources

Profiler collects system resources (CPU and GPU utilization, GPU memory, network and I/O) and framework behavior during training, finds bottlenecks, and reports them. If you rent an expensive GPU instance and its utilization is low, you are throwing money away by that much, so it is directly tied to cost optimization.

```python
from sagemaker.debugger import ProfilerConfig, FrameworkProfile

estimator = PyTorch(
    entry_point='train.py', role=role,
    instance_type='ml.p4d.24xlarge', instance_count=1,
    framework_version='2.0', py_version='py310',
    profiler_config=ProfilerConfig(
        system_monitor_interval_millis=500,
        framework_profile_params=FrameworkProfile()
    )
)
```

Organized as symptom → cause → action, the bottlenecks Profiler commonly catches are as follows.

| Symptom | Cause | Action |
|------|------|------|
| GPU utilization is low and goes up and down in a sawtooth | The GPU is waiting for data | More loader workers, FSx for Lustre cache, overlap with prefetch |
| Only CPU usage is pinned at 100% | Preprocessing is heavy | Split preprocessing into pre-batch processing, make it lighter, consider GPU preprocessing |
| GPU utilization is high but steps are slow | The computation itself is heavy | Mixed precision, adjust batch and model structure, a higher-tier instance |
| GPU memory to spare but the batch is small | The batch setting is conservative | Increase the batch (but adjust the learning rate along with it) |
| Only some of multiple GPUs are busy | Load imbalance, distributed configuration error | Check the distributed settings and shard distribution |
| Takes long before training starts | File mode full copy, heavy dependency installation | FastFile/Pipe, bake dependencies into the image |

A typical prescription: if GPU utilization is low and data loading is the bottleneck → increase the number of DataLoader workers, cache the data on FSx for Lustre, and make preprocessing asynchronous with training (prefetch).

> ⚠️ **Pitfall**: A choice saying "training is slow → switch to a more expensive GPU instance" is mostly wrong. If the GPU is already idle, attaching a faster GPU **only increases the idle time** and raises the cost. An instance upgrade is the choice only after confirming with Profiler that "the GPU computation itself is saturated."

The essence of low GPU utilization is "the time the GPU sits idle." One training step runs from data loading → preprocessing → forward → backward → optimizer, but the GPU does only forward/backward. If the other stages are slow, the GPU waits. So prefetch and asynchronous loading, which make the data pipeline (loading, preprocessing) overlap with the GPU computation, raise utilization. Profiler makes this "waiting time" visible and tells you which stage to fix.

## Training Monitoring: Relationship with CloudWatch

Debugger/Profiler are precise analysis inside the training job, while overall operational monitoring is handled by CloudWatch.

| Tool | What it shows | Typical use |
|------|-------------|----------|
| CloudWatch **Metrics** | CPU/GPU/memory utilization, training metrics I define | Checking time-series trends, threshold **alarms** |
| CloudWatch **Logs** | stdout/stderr of the training script | Exception stack traces, post-hoc cause analysis |
| **EventBridge** events | Status changes of the training job (completed, failed, etc.) | Notification on failure, automatically running a follow-up pipeline |
| **TensorBoard** | Loss and accuracy curves, histograms | Visually comparing training curves |

To raise the logs I print as CloudWatch metrics, you register **rules that extract them with a regular expression** on the Estimator. Only then can you compare the loss curves of several training jobs on one screen and set alarms.

```python
estimator = PyTorch(
    entry_point='train.py', role=role,
    instance_type='ml.g5.xlarge', instance_count=1,
    framework_version='2.0', py_version='py310',
    enable_sagemaker_metrics=True,
    metric_definitions=[                       # rules that extract numbers from a log line
        {'Name': 'train:loss',      'Regex': r'train_loss: ([0-9\.]+)'},
        {'Name': 'validation:loss', 'Regex': r'val_loss: ([0-9\.]+)'},
        {'Name': 'validation:acc',  'Regex': r'val_acc: ([0-9\.]+)'},
    ],
)
```

- The script only needs to print like `print(f"val_loss: {loss:.4f}")`.
- The metrics made here are also used as-is as the **objective metric for hyperparameter tuning** that you will learn later.

```
[Training job]
   ├─ Debugger  → saves tensors to S3, evaluates rules, actions (stop/notify)
   ├─ Profiler  → system and framework metrics, bottleneck report
   └─ CloudWatch → metrics/logs (overall monitoring, alarms)
```

A team was training on an ml.p4d instance, but GPU utilization stayed at 25%, so training was 4 times slower than expected. The Profiler report showed the GPU was mostly waiting for data loading. The cause was that every batch was read directly from S3 and the CPU preprocessing was heavy. After increasing the DataLoader workers, caching the data on FSx for Lustre, and overlapping the preprocessing with prefetch, GPU utilization rose to 85% and training time dropped to one third. Lesson: slow training is not always a GPU performance problem — look at the real bottleneck first with Profiler.

## A Loop That Blocks Cost Automatically

The practical value of observation lies in "waste stops even when no person is watching." Tie detection and action into a single loop.

```text
Training job
   │  save tensors (S3)                 system metrics
   ├──────────────► Debugger rule        ├──────► Profiler report
   │                     │                        │
   │            violation detected            bottleneck diagnosed
   │                     │                        │
   │              ┌──────┴───────┐                └─► pipeline improvement (human)
   │              │              │
   │        StopTraining      Email/SNS notification
   │              │
   └──────────────┘  ← cost saved for the remaining training time
```

- If you attach only a rule and no action, this loop runs **broken** — reports pile up while money keeps flowing out.
- Conversely, if you attach an action too aggressively, training is cut even in a normal loss-stall interval (plateau). Look at the rule threshold and the minimum number of training steps together.

## How to Choose

```text
What is the symptom?
 ├─ Loss stall / vanishing or exploding gradients / overfitting
 │     → Debugger built-in rules  (+ block cost with a StopTraining action)
 ├─ Slow / the GPU is idle / inefficient for the cost
 │     → Diagnose the bottleneck with Profiler → adjust data pipeline, batch, precision
 │        (upgrade the instance only after GPU computation is confirmed saturated)
 └─ Overall trends, failure notifications, comparing several jobs
       → CloudWatch metrics/logs/alarms (+ follow-up automation with EventBridge)
```

In the next lesson we look at model evaluation — metric selection, overfitting, and cross-validation — which judges whether a trained model is really good.

## 📖 Glossary

- **Tensor**: A chunk of numbers the model uses in computation. Weights, gradients, and loss values all count.
- **Gradient**: A value that tells you in which direction and by how much to change the weights to reduce the loss.
- **Vanishing gradient**: A state where gradients approach 0 and the weights are effectively not updated. Training looks as if it has stopped.
- **Exploding gradient**: Conversely, a state where values get too large and training diverges. The loss can even become `NaN`.
- **Built-in rule**: An anomaly-detection condition SageMaker has made in advance. You can use it right away by specifying just the name.
- **Action**: A measure to run when a rule is violated. `StopTraining` (stop training), an email notification, etc.
- **Profiling**: Measuring where a program spends its time. Here we look at how busy the GPU, CPU, and I/O each are.
- **GPU utilization**: The fraction of time the GPU was actually computing. When it is low, it usually means it is waiting for data.
- **Prefetch**: A technique that prepares the next data in advance so that loading proceeds while the GPU is computing.
- **`metric_definitions`**: A setting that extracts numbers from the training log with regular expressions and raises them as CloudWatch metrics.

---

## 📝 Practice Questions

**Question 1.** You want to automatically detect whether gradients converge to 0 (vanish) or diverge (explode) during training. What is the most suitable SageMaker feature?

A) View GPU utilization with SageMaker Profiler  
B) SageMaker Debugger built-in rules vanishing_gradient/exploding_tensor  
C) Check the CloudFront cache hit ratio  
D) Athena query  

**Answer: B**  
Explanation: Debugger collects tensors during training and detects model-internal anomalies such as vanishing and exploding gradients with built-in rules. A is a tool that looks at resource utilization and does not look at gradient values, and C is a CDN metric and D is a data query, both unrelated to analyzing training tensors.

---

**Question 2.** You are training on an expensive ml.p4d instance, but GPU utilization is a low 25%, which is inefficient for the cost. What is most suitable for diagnosing the cause?

A) SageMaker Debugger's overfit rule  
B) Analyze system resources and bottlenecks (data loading, CPU) with SageMaker Profiler  
C) Count the number of model parameters  
D) Check the S3 bucket policy  

**Answer: B**  
Explanation: Low GPU utilization is a resource efficiency problem, so Profiler finds the causes of idle GPUs such as data loading and CPU bottlenecks. A is a rule that looks at model overfitting and is unrelated to utilization, and C and D have no direct relation to diagnosing why the GPU is idle.

---

**Question 3.** When Debugger's loss_not_decreasing rule is violated, you want to stop training automatically to save cost. What is required?

A) Just registering the rule stops it automatically  
B) Attach an action such as StopTraining to the rule  
C) Set instance_count to 0  
D) Disable Profiler  

**Answer: B**  
Explanation: Debugger rules by default only detect and report, so to stop automatically you must explicitly attach an action such as StopTraining. A is a common misconception, since a rule alone does not stop training, C makes it impossible to run training at all, and D is an action unrelated to resource profiling.

---

**Question 4.** A Profiler report shows that the GPU spends most of its time idle waiting for data loading. Which of the following is the LEAST appropriate remedy?

A) Increase the number of DataLoader workers to feed data faster  
B) Cache data on FSx for Lustre to speed up loading  
C) Prefetch and load asynchronously so that preprocessing overlaps with training  
D) Increase the learning rate by 10x  

**Answer: D**  
Explanation: A loading bottleneck in which the GPU waits for data is solved by speeding up the data supply pipeline (more workers, FSx cache, prefetching). Changing the learning rate only affects convergence behavior and is unrelated to the data loading bottleneck, so it is the furthest from a fix.

---

**Question 5.** You want to monitor overall training job metrics (GPU/CPU utilization, loss) as time series and receive an alarm when a threshold is exceeded. Which service is appropriate?

A) Amazon CloudWatch (metrics/alarms)  
B) Amazon Macie  
C) AWS Config  
D) Amazon Comprehend  

**Answer: A**  
Explanation: CloudWatch collects training job metrics as time series and can set alarms, so it suits overall monitoring. B is data privacy detection, C is resource configuration tracking, and D is an NLP service, none of which is for monitoring training metrics or alarms.

---
