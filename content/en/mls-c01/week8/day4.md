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

## 📝 Practice Questions

**Question 1.** While training a deep learning model, the loss diverges to NaN within a few steps. What are the most likely cause and response?

A) The learning rate is too small - reduce it further  
B) The learning rate is too large or the gradients are exploding - lower the learning rate and apply gradient clipping  
C) The batch size is too small - reduce the batch to 1  
D) The regularization is excessive - remove all regularization  

**Answer: B**  
Explanation: A loss diverging to NaN is a classic symptom of an excessive learning rate or exploding gradients, and the responses are lowering the learning rate and gradient clipping. A small learning rate causes stagnation, not divergence (A), and reducing the batch (C) or removing regularization (D) does not fix divergence.

---

**Question 2.** In a very deep neural network, the weights of the early layers are barely updated and the loss stagnates from the start. Which of the following techniques is the LEAST helpful for mitigating this vanishing gradient problem?

A) Use ReLU-family activation functions  
B) Apply batch normalization  
C) Introduce residual connections (ResNet)  
D) Replace all activations with sigmoid  

**Answer: D**  
Explanation: Sigmoid's derivative is close to 0 in its saturated regions, which worsens vanishing gradients, so it is not a remedy. ReLU (A), batch normalization (B), and residual connections (C) are all representative techniques for mitigating the vanishing.

---

**Question 3.** You want to automatically detect training quality issues such as vanishing gradients, overfitting, and non-decreasing loss, and trigger alerts or early stopping when a rule is violated. Which SageMaker feature is MOST suitable?

A) SageMaker Profiler  
B) SageMaker Model Monitor  
C) SageMaker Debugger  
D) SageMaker Clarify  

**Answer: C**  
Explanation: Debugger automatically detects training quality issues with built-in rules such as vanishing_gradient, overfit, and loss_not_decreasing, and triggers alerts or early stopping through CloudWatch events. Profiler (A) analyzes resource bottlenecks, Model Monitor (B) monitors inference after deployment, and Clarify (D) is for bias and explainability.

---

**Question 4.** A training job shows low GPU utilization and you suspect a data loading bottleneck. You want to analyze system resource utilization and bottlenecks to improve cost and speed. Which tool is MOST suitable?

A) SageMaker Profiler  
B) SageMaker Debugger rules  
C) Automatic Model Tuning  
D) SHAP value analysis  

**Answer: A**  
Explanation: Profiler analyzes system metrics such as CPU/GPU utilization, memory, I/O, and data loading bottlenecks to diagnose and recommend fixes for resource inefficiency and bottlenecks. Debugger (B) is for model quality issues, AMT (C) is for hyperparameter search, and SHAP (D) is for explainability.

---

**Question 5.** During large model training, a large batch size causes GPU out-of-memory (OOM). Which technique keeps the effect of the batch size while avoiding the memory constraint?

A) Set the learning rate to 0  
B) Remove the validation set  
C) Accumulate small batches several times with gradient accumulation  
D) Increase the number of epochs  

**Answer: C**  
Explanation: Gradient accumulation gathers the gradients of small batches and updates once, achieving the effect of a large batch while reducing instantaneous memory use to avoid OOM. A learning rate of 0 (A) stops learning, and removing validation (B) and increasing epochs (D) are unrelated to the memory problem.

---
