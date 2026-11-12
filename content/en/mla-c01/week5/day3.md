# Day 3 - Debugging and Profiling: SageMaker Debugger and Profiler

Training job runs but loss doesn't decrease, or you rented expensive GPUs but only use 30% capacity—you need to look inside training to see what's happening. SageMaker Debugger and Profiler collect and analyze tensors and system resources in real time, telling you "why it's not working" and "where it's slow".

In the MLA-C01 exam, this topic appears in scenarios like "auto-detect vanishing/exploding gradients", "find why GPU util is low", "auto-stop when training diverges". Today we distinguish two axes: Debugger (model internals) and Profiler (system resources).

## Debugger and Profiler Role Split

First clarify their concerns:

| Distinction | SageMaker Debugger | SageMaker Profiler |
|---|---|---|
| Observes | Model internal tensors (gradients, weights, loss, activations) | System resources (CPU/GPU util, memory, I/O) |
| Answers Question | "Why is model training wrong?" | "Why slow/inefficient?" |
| Typical Detection | Vanishing/exploding gradient, overfitting, weight not updating | Low GPU util, data loading bottleneck, CPU bottleneck |
| Mechanism | Store tensors periodically to S3, evaluate rules | Collect·analyze system/framework metrics |
| Auto Action | Alert/early stop on rule violation | Bottleneck reports·recommendations |

Core intuition: **Debugger sees "model is wrong", Profiler sees "resources wasted"**. In exams, "gradients became 0/exploded"—model quality symptoms → Debugger; "GPU idle/data loading slow"—resource symptoms → Profiler.

> 💡 **Related Theory**: This split mirrors two layers of observability. Debugger watches the "mathematical process" (model)'s internal state (tensors)—vanishing gradients stop learning, exploding ones cause divergence. Profiler watches the "physical resources" that process runs on—is GPU waiting for data idle, is preprocessing locking CPU? Viewing both layers lets you solve "why training fails" and "why expensive" simultaneously.

## SageMaker Debugger: See Inside the Model

Debugger periodically saves tensors (gradients, weights, loss, etc.) to S3 during training and detects anomalies using pre-defined **built-in rules**.

```python
from sagemaker.debugger import Rule, rule_configs, DebuggerHookConfig

estimator = PyTorch(
    entry_point='train.py', role=role,
    instance_type='ml.g5.xlarge', instance_count=1,
    framework_version='2.0', py_version='py310',
    rules=[
        Rule.sagemaker(rule_configs.vanishing_gradient()),   # Gradient vanishing
        Rule.sagemaker(rule_configs.exploding_tensor()),     # Tensor explosion
        Rule.sagemaker(rule_configs.overfit()),              # Overfitting
        Rule.sagemaker(rule_configs.loss_not_decreasing())   # Loss stalled
    ],
    debugger_hook_config=DebuggerHookConfig(
        s3_output_path='s3://my-bucket/debug-tensors/'
    )
)
```

Frequently appearing built-in rules:

- `vanishing_gradient` / `exploding_tensor`: Gradient vanishing·explosion
- `loss_not_decreasing`: Loss didn't decrease over certain steps
- `overfit` / `overtraining`: Validation loss worsening (overfitting signal)
- `dead_relu` / `weight_update_ratio`: Dead neurons, weight update ratio anomaly

> ⚠️ **Pitfall**: Rules fundamentally "detect and report" only. To auto-stop training when a rule violates, you must attach separate **actions**. For example, to prevent gradient explosion from running training to completion wasting cost, attach `StopTraining` action. The key is not mistaking "detection = auto-stop".

```python
from sagemaker.debugger import Rule, rule_configs
from sagemaker.debugger import CollectionConfig

# Auto-stop + alert on rule violation
rule = Rule.sagemaker(
    rule_configs.loss_not_decreasing(),
    actions=rule_configs.ActionList(
        rule_configs.StopTraining(),          # Stop training (save cost)
        rule_configs.Email("ml-team@example.com")
    )
)
```

## SageMaker Profiler: See Resources

Profiler collects system resources (CPU/GPU util, GPU memory, network/I/O) and framework activity during training, finding bottlenecks and reporting. Renting expensive GPU instances with low utilization wastes money proportionally, directly linked to cost optimization.

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

Bottlenecks Profiler commonly catches:

- **Low GPU utilization**: GPU waits for data idly → suspect data loading/preprocessing bottleneck
- **Data loading bottleneck**: Insufficient DataLoader workers, slow storage (reading S3 directly, etc.)
- **CPU bottleneck**: Heavy preprocessing unable to keep up with GPU data
- **GPU memory shortage·imbalance**: Need to adjust batch size

Typical remedy: If GPU util low and data loading bottleneck → increase DataLoader workers, cache data on FSx for Lustre, overlap preprocessing with training (prefetch).

> 💡 **Related Theory**: Core of GPU underutilization is "GPU idle time". One training step chains data loading → preprocessing → forward → backward → optimizer, but GPU only does forward/backward. If other stages are slow, GPU waits. So prefetch and async loading, making data pipeline overlap with GPU compute, lift utilization. Profiler visualizes this "waiting time" and tells you which stage to fix.

## Training Monitoring: Relationship with CloudWatch

Debugger/Profiler are fine-grained training internals analysis; whole operational monitoring falls to CloudWatch.

- **CloudWatch Metrics**: Training job metrics (CPU/GPU/memory util, loss) as time series. Can set alarms.
- **CloudWatch Logs**: Training script stdout/stderr logs.
- **TensorBoard**: SageMaker also supports tensor visualization via TensorBoard.

```
[Training Job]
   ├─ Debugger  → Store tensors to S3, evaluate rules, actions (stop/alert)
   ├─ Profiler  → System/framework metrics, bottleneck reports
   └─ CloudWatch → Metrics/logs (overall monitoring·alarms)
```

> 📚 **Case**: A team trained on ml.p4d but GPU utilization stuck at 25%, making training 4× slower than expected. Profiler report showed GPU mostly waiting for data loading. Root cause: reading each batch from S3 directly, heavy CPU preprocessing. Increasing DataLoader workers, caching data on FSx for Lustre, overlapping preprocessing via prefetch boosted GPU util to 85%, cutting training time to 1/3. Lesson: slow training isn't always GPU performance—Profiler finds the real bottleneck first.

## How to Choose

Decision flow: ① Symptom "model training wrong" (loss stalled, gradient vanishing/exploding, overfitting) → **Debugger** + optional StopTraining action. ② Symptom "slow/GPU idle/expensive" → **Profiler** to diagnose bottlenecks, then adjust data pipeline/batch. ③ Overall metrics/logs/alarms → **CloudWatch**. To block divergence cost, attach actions to Debugger rules.

## Summary

Training internals observation splits two: **Debugger** stores model internal tensors (gradient·weight·loss), detects learning quality issues with built-in rules (vanishing_gradient, exploding_tensor, loss_not_decreasing, overfit, etc.), and actions attached auto-stop/alert on divergence blocking cost. **Profiler** collects system/framework resources, finds GPU underutil, data loading, CPU bottlenecks optimizing cost and speed. Overall monitoring via CloudWatch. Exam mapping critical: "model quality anomaly" → Debugger, "resource inefficiency" → Profiler.

Next we see model evaluation—judging whether a trained model is good, metric selection and overfitting, cross-validation.

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
