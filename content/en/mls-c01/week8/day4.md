# Day 4 - Learning Optimization: Batch Size, Learning Rate, Gradient Issues, Debugger/Profiler

Whether preprocessing is sound and overfitting is managed, "how do we stabilize convergence itself?" When models are stuck or collapsing, batch size, learning rate schedule, gradient problems often hide culprits. Today covers **batch size, learning rate with scheduling, vanishing/exploding gradients**, and SageMaker **Debugger** (learning quality) and **Profiler** (resource efficiency) that give visibility.

## Batch Size

Number of samples used per weight update.

| Size | Advantages | Disadvantages |
|------|------|------|
| **Small** (e.g., 32) | Noise helps gen, memory↓ | Updates frequent, can be slow, noisy |
| **Large** (e.g., 1024+) | GPU utilization↑, stable | Memory↑, may miss good minimum, worse gen |

- Bigger batch → usually increase LR too (linear scaling heuristic to keep convergence speed)
- OOM (out of memory) often → reduce batch size or use gradient accumulation

> 💡 **Related Theory**: Small batch noise helps escape sharp minima toward flatter, better generalizing regions. Very large batches lose this exploration, generalizing worse. It's not just speed — batch size is optimization/generalization tradeoff.

## Learning Rate and Schedules

Most sensitive hyperparameter. How much to shift weights per step.

```text
Too large → loss diverges/oscillates (NaN loss)
Too small → glacial convergence, local minima trap
Just right → stable decrease
```

Schedules (adjust LR over time):
- **Step decay**: Drop LR fixed ratio every N epochs
- **Exponential decay**: Decay exponentially step-by-step
- **Cosine annealing**: Smooth cosine curve decay
- **Warmup**: Gently raise LR first steps, prevent initial instability (Transformers)

Signal:
- "NaN loss / diverge / oscillate" → LR **too large**
- "Learning stalled / glacial" → LR **too small** or vanishing gradient

## Gradient Problems: Vanishing and Exploding

Deep backprop through multiplication → gradient magnitude changes.

| Problem | Symptom | Fix |
|------|------|------|
| **Vanishing gradient** | Front layers barely train, loss stuck | ReLU family activation, batch norm, residual (ResNet), proper init |
| **Exploding gradient** | Loss NaN/diverges, weights blow up | **Gradient clipping**, lower LR, batch norm |

```python
hyperparameters = {
    "gradient_clipping": 1.0,   # gradient norm ceiling
    "lr_scheduler": "cosine",
}
```

> 💡 **Related Theory**: Sigmoid/tanh derivatives near 0 at saturations → chained multiplication shrinks to 0 (vanishing). ReLU derivative = 1 constantly → mitigates. Exploding is opposite: >1 values chain-multiply, diverge. Gradient clipping caps norm, batch norm and residual connections both help

## SageMaker Debugger

Real-time capture of tensors (gradients, weights, loss, activations) during training, **auto-detect anomalies**.

- **Built-in rules**: `vanishing_gradient`, `exploding_tensor`, `overfit`, `overtraining`, `loss_not_decreasing`, `class_imbalance`, `saturated_activation`
- Rule breach → CloudWatch event → auto-alert or early-stop trigger
- Tensors saved to S3 for post-hoc analysis

```python
from sagemaker.debugger import Rule, rule_configs

rules = [
    Rule.sagemaker(rule_configs.vanishing_gradient()),
    Rule.sagemaker(rule_configs.loss_not_decreasing()),
]
est = Estimator(..., rules=rules)
```

Signal: "Auto-detect gradient vanish/explode, overfit, training stall during run" → **Debugger**

## SageMaker Profiler

Analyze training's **system resource & performance bottlenecks** (not model quality, but efficiency).

- CPU/GPU utilization, GPU memory, I/O waits, data loading bottlenecks
- "GPU underutilized, data loading is bottleneck, CPU bound" — diagnosis & recommendations
- Cost optimization: inefficient instance usage → smaller/fewer instances suggested

Signal:
- "Training quality problem (vanish/explode/overfit)" → **Debugger**
- "Resource utilization, bottleneck, GPU underuse, speed/cost inefficiency" → **Profiler**

## Additional Optimization Techniques

- **Mixed Precision (FP16/BF16)**: Mem↓, speed↑. Useful large batch/big model
- **Gradient Accumulation**: Pool small batches for large-batch effect — avoid OOM
- **Checkpointing**: Long training, Spot interruption prep

## Test Tips

- "NaN loss / diverge / oscillate" → excess LR or exploding gradient (clip)
- "Front layers train barely / loss stuck" → vanishing gradient (ReLU, BN, residual, init)
- "OOM" → batch shrink or gradient accum/mixed precision
- **Tool trap**: Quality anomalies = Debugger, resource/bottleneck/cost = Profiler. This one line gathers ~80% right
- Batch up → LR up too (scaling rule)

## Summary

Today: Learning stability — batch size, LR schedule, gradient issues, observability. Key: symptoms → root causes (vanish/explode/LR/memory) → **Debugger (quality), Profiler (efficiency)**. Next: comprehensive review — modeling's full pipeline

---

## 📝 연습 문제

**문제 1.** 딥러닝 모델을 학습하는데 몇 스텝 만에 손실이 NaN으로 발산한다. 가장 가능성 높은 원인과 대응은?

A) 학습률이 너무 작다 — 학습률을 더 줄인다  
B) 학습률이 너무 크거나 그래디언트 폭발 — 학습률을 낮추고 그래디언트 클리핑 적용  
C) 배치 크기가 너무 작다 — 배치를 1로 줄인다  
D) 정규화가 과해서다 — 정규화를 모두 제거한다  

**정답: B**  
해설: 손실이 NaN으로 발산하는 것은 학습률 과다나 그래디언트 폭발의 전형적 증상이며, 학습률 인하와 그래디언트 클리핑이 대응이다. 학습률이 작으면 발산이 아니라 정체가 생기고(A), 배치 축소(C)·정규화 제거(D)는 발산을 해결하지 못한다.

---

**문제 2.** 매우 깊은 신경망에서 앞쪽 층의 가중치가 거의 갱신되지 않고 손실이 초기부터 정체된다. 이 그래디언트 소실 문제를 완화하는 기법으로 가장 거리가 먼 것은?

A) ReLU 계열 활성화 함수 사용  
B) 배치 정규화 적용  
C) 잔차 연결(ResNet) 도입  
D) 모든 활성화를 시그모이드로 교체  

**정답: D**  
해설: 시그모이드는 포화 구간에서 미분이 0에 가까워 그래디언트 소실을 악화시키므로 완화책이 아니다. ReLU(A)·배치 정규화(B)·잔차 연결(C)은 모두 소실을 완화하는 대표적 기법이다.

---

**문제 3.** 학습 중 그래디언트 소실, 과적합, 손실 미감소 같은 학습 품질 이상을 자동으로 탐지하고 위반 시 알림이나 조기 중단을 트리거하려 한다. 가장 적합한 SageMaker 기능은?

A) SageMaker Profiler  
B) SageMaker Model Monitor  
C) SageMaker Debugger  
D) SageMaker Clarify  

**정답: C**  
해설: Debugger는 vanishing_gradient·overfit·loss_not_decreasing 등 내장 규칙으로 학습 품질 이상을 자동 탐지하고 CloudWatch 이벤트로 알림·조기중단을 트리거한다. Profiler(A)는 자원 병목 분석, Model Monitor(B)는 배포 후 추론 모니터링, Clarify(D)는 편향·설명용이다.

---

**문제 4.** 학습 작업의 GPU 사용률이 낮고 데이터 로딩에서 병목이 의심된다. 시스템 자원 활용과 병목을 분석해 비용·속도를 개선하려 한다. 가장 적합한 도구는?

A) SageMaker Profiler  
B) SageMaker Debugger 규칙  
C) Automatic Model Tuning  
D) SHAP 값 분석  

**정답: A**  
해설: Profiler는 CPU/GPU 사용률, 메모리, I/O, 데이터 로딩 병목 같은 시스템 메트릭을 분석해 자원 비효율과 병목을 진단·권고한다. Debugger(B)는 모델 품질 이상용, AMT(C)는 하이퍼파라미터 탐색, SHAP(D)는 설명용이다.

---

**문제 5.** 대형 모델 학습 중 큰 배치 크기 때문에 GPU 메모리 초과(OOM)가 발생한다. 배치가 주는 효과를 유지하면서 메모리 제약을 회피하는 기법은?

A) 학습률을 0으로 설정  
B) 검증 세트를 제거  
C) 그래디언트 누적(gradient accumulation)으로 작은 배치를 여러 번 모음  
D) 에폭 수를 늘림  

**정답: C**  
해설: 그래디언트 누적은 작은 배치들의 그래디언트를 모아 한 번에 업데이트해 큰 배치 효과를 내면서도 순간 메모리 사용을 줄여 OOM을 회피한다. 학습률 0(A)은 학습을 멈추고, 검증 제거(B)·에폭 증가(D)는 메모리 문제와 무관하다.

---
