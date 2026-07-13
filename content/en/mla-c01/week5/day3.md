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

## 📝 연습 문제

**문제 1.** 학습 중 그래디언트가 0에 수렴(소실)하거나 발산(폭발)하는지를 자동으로 감지하려 한다. 가장 적합한 SageMaker 기능은?

A) SageMaker Profiler로 GPU 활용률을 본다  
B) SageMaker Debugger의 vanishing_gradient/exploding_tensor 내장 규칙  
C) CloudFront 캐시 히트율 확인  
D) Athena 쿼리  

**정답: B**  
해설: Debugger는 학습 중 텐서를 수집해 그래디언트 소실·폭발 같은 모델 내부 이상을 내장 규칙으로 감지한다. A는 자원 활용률을 보는 도구로 그래디언트 값을 보지 않고, C는 CDN 지표, D는 데이터 쿼리로 모두 학습 텐서 분석과 무관하다.

---

**문제 2.** 비싼 ml.p4d 인스턴스로 학습하는데 GPU 활용률이 25%로 낮아 비용 대비 비효율적이다. 원인을 진단하는 데 가장 적합한 것은?

A) SageMaker Debugger의 overfit 규칙  
B) SageMaker Profiler로 시스템 자원·병목(데이터 로딩, CPU)을 분석  
C) 모델 파라미터 수를 센다  
D) S3 버킷 정책을 점검한다  

**정답: B**  
해설: GPU 저활용은 자원 효율 문제이므로 Profiler가 데이터 로딩·CPU 병목 등 GPU가 노는 원인을 찾아준다. A는 모델 과적합을 보는 규칙으로 활용률과 무관하고, C·D는 GPU가 노는 원인 진단과 직접 관계가 없다.

---

**문제 3.** Debugger의 loss_not_decreasing 규칙이 위반됐을 때 학습을 자동으로 중단해 비용을 아끼고 싶다. 필요한 것은?

A) 규칙만 등록하면 자동으로 중단된다  
B) 규칙에 StopTraining 같은 action을 연결한다  
C) instance_count를 0으로 설정한다  
D) Profiler를 비활성화한다  

**정답: B**  
해설: Debugger 규칙은 기본적으로 감지·보고만 하므로 자동 중단하려면 StopTraining 등의 action을 명시적으로 연결해야 한다. A는 흔한 오해로 규칙만으로는 중단되지 않고, C는 학습을 아예 못 돌리며, D는 자원 프로파일링과 무관한 조치다.

---

**문제 4.** Profiler 리포트 결과 GPU가 대부분 데이터 로딩을 기다리며 노는 것으로 나타났다. 적절한 개선 조치로 가장 거리가 먼 것은?

A) DataLoader worker 수를 늘려 데이터 공급을 빠르게 한다  
B) 데이터를 FSx for Lustre에 캐시해 로딩을 빠르게 한다  
C) 전처리를 학습과 겹치도록 프리페치·비동기 로딩한다  
D) 학습률을 10배로 올린다  

**정답: D**  
해설: GPU가 데이터를 기다리는 로딩 병목은 데이터 공급 파이프라인을 빠르게(worker 증가, FSx 캐시, 프리페치) 해서 푼다. 학습률 변경은 수렴 동작에 영향을 줄 뿐 데이터 로딩 병목과 무관하므로 가장 거리가 멀다.

---

**문제 5.** 학습 작업의 전반적 메트릭(GPU/CPU 활용률, 손실)을 시계열로 모니터링하고 임계치 초과 시 알람을 받으려 한다. 적합한 서비스는?

A) Amazon CloudWatch (메트릭/알람)  
B) Amazon Macie  
C) AWS Config  
D) Amazon Comprehend  

**정답: A**  
해설: CloudWatch는 학습 작업 메트릭을 시계열로 수집하고 알람을 설정할 수 있어 전반 모니터링에 적합하다. B는 데이터 프라이버시 탐지, C는 리소스 구성 추적, D는 NLP 서비스로 학습 메트릭 모니터링·알람 용도가 아니다.

---
