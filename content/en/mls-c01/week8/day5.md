# Day 5 - Week 8 Review: Training, Tuning, Generalization

This week covered the latter half of Domain 3 (Modeling) — **how to train models (Day1), tune them (Day2), generalize them (Day3), and make them converge well (Day4)**. Today we tie these four flows into a single decision chain and organize how to narrow answers from clues during the exam.

## Week Flow at a Glance

```text
[Day1] Training Runtime Infrastructure
  Estimator → input modes (File/Pipe/FastFile) → distributed (data/model parallel) → Spot+checkpoints

[Day2] Hyperparameter Tuning (AMT)
  search space, target metrics → strategies (Bayesian/Random/Grid/Hyperband) → early stopping → warm start

[Day3] Generalization
  overfit/underfit diagnosis (bias-variance) → regularization (L1/L2/dropout/early-stop) → data augmentation → leakage prevention

[Day4] Training Optimization
  batch size, learning rate schedule → vanishing/exploding gradients → Debugger (quality) / Profiler (resources)
```

> 💡 **Related Theory**: The core tension in latter modeling is two axes. (1) Optimization — reducing loss on training data well (learning rate, batch, gradients). (2) Generalization — fits new data well (regularization, data, validation). They differ. Even if optimization succeeds (low training loss), generalization fails (high validation loss) = overfitting. Exam questions are almost always designed to test "is this symptom an optimization problem or generalization problem first?"

## Input Mode, Distributed, Spot Quick Reference (Day1)

| Signal | Choice |
|------|------|
| Data exceeds disk, reduce startup latency | Pipe / FastFile |
| Download all then random access | File |
| Accelerate training, model fits on GPU | Data Parallel |
| Model exceeds single GPU memory | Model Parallel |
| Cost savings acceptable (some latency) | Managed Spot + checkpoint_s3_uri |

Artifacts go to `/opt/ml/model`, Spot requires `max_wait >= max_run` — remember as trap points.

## Tuning Strategies Quick Reference (Day2)

| Signal | Strategy |
|------|------|
| Efficient exploration with few evaluations | Bayesian |
| Deep learning epoch iterations, fast pruning | Hyperband |
| Simple, fully parallel baseline | Random |
| Few categorical combinations exhaustive | Grid |
| Reduce tuning cost | Auto early stopping / Hyperband |
| Continue/reuse previous tuning | Warm start |

Imbalanced data target metric is F1/AUC, not Accuracy.

## Generalization Diagnosis & Treatment Quick Reference (Day3)

| Symptom | Diagnosis | Treatment |
|------|------|------|
| Train↑ validation↓ (large gap) | Overfitting (variance↑) | Increase regularization, data, dropout, early-stop, augment |
| Train & validation both low | Underfitting (bias↑) | Increase complexity, features, train longer |
| Feature selection / sparse model | — | L1 |
| Shrink all weights | — | L2 |

Fit scaler only on train — prevent leakage.

## Optimization & Tools Quick Reference (Day4)

| Symptom | Root Cause | Response |
|------|------|------|
| NaN / divergence / oscillation | High learning rate, exploding gradients | Lower learning rate, gradient clipping |
| Early layers not learning, loss stuck | Vanishing gradients | ReLU, BN, residual connections, initialization |
| OOM | Oversized batch | Lower batch, gradient accumulation, mixed precision |
| Quality anomalies auto-detect | — | Debugger |
| Resource bottleneck, low GPU util | — | Profiler |

## Integration Scenarios for Thought Exercise

> "Text classification model has 96% training accuracy, 75% validation accuracy. Data is scarce and hard to collect more. Want to reduce tuning cost too."

Breakdown:
1. Large gap → **overfitting** (Day3) → regularization, **data augmentation (back-translation, etc)**, dropout.
2. Limited data → k-fold cross-validation for stable evaluation.
3. Reduce tuning cost → **Hyperband** or early stopping (Day2).

> "Training a large model on 8TB data is too slow and expensive. Single GPU memory is exceeded."

Breakdown:
1. Data exceeds disk → **Pipe/FastFile** (Day1).
2. Exceeds single GPU → **model parallel** (Day1).
3. Cost savings → **Spot + checkpoints** (Day1).
4. Suspect low GPU utilization → **Profiler** (Day4) to identify bottleneck.

## Common Traps Summary

- Responding to overfitting with "increase epochs / enlarge model" is usually wrong (worsens overfitting).
- Distinguish model parallel from gradient accumulation / mixed precision on "GPU memory exceeded": model itself doesn't fit → model parallel; batch-related → accumulation/precision.
- Debugger vs Profiler: **quality=Debugger, resources=Profiler**. Don't confuse with Model Monitor (drift post-deployment).
- Spot is meaningless without checkpoints; requires `max_wait >= max_run`.
- Using Accuracy as target metric on imbalanced data is a trap.

## Summary

Week 8 was about "after choosing a good algorithm (Week 6), actually training, tuning, and generalizing it well." The key is linking symptom → root cause → response quickly. **Data scale, model size, cost inform training infrastructure** (Day1); **efficiency, cost inform tuning strategies** (Day2); **gap size informs overfitting/underfitting treatment** (Day3); **symptom informs optimization root cause and tools** (Day4). Next week we move to Domain 4 — **deploying, operating, monitoring** models.

---

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
