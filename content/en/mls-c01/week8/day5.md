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

## 📝 연습 문제

**문제 1.** 모델의 학습 손실은 매우 낮은데 검증 손실이 크게 높다. 이 상황을 가장 정확히 규정한 것은?

A) 최적화는 성공했으나 일반화에 실패한 과적합 상태  
B) 최적화에 실패한 과소적합 상태  
C) 학습률이 너무 작아 수렴하지 못한 상태  
D) 데이터 누수로 검증 점수가 비현실적으로 높은 상태  

**정답: A**  
해설: 학습 손실이 낮다는 것은 최적화(학습 데이터 적합)는 성공했음을 뜻하고, 검증 손실이 높다는 것은 일반화 실패, 즉 과적합이다. 과소적합(B)은 둘 다 높을 때이며, 학습률 과소(C)나 누수(D)와는 증상 패턴이 다르다.

---

**문제 2.** 8TB 학습 데이터가 인스턴스 디스크보다 크고, 모델이 단일 GPU 메모리를 초과하며, 비용도 절감하고 싶다. 가장 적절한 조합은?

A) File 모드 + 데이터 병렬 + 온디맨드  
B) Pipe 모드 + 모델 병렬 + Managed Spot + 체크포인트  
C) FastFile + 단일 인스턴스 + 그리드 탐색  
D) File 모드 + 모델 병렬 + 조기 종료  

**정답: B**  
해설: 디스크보다 큰 데이터엔 스트리밍 Pipe, 단일 GPU 메모리 초과엔 모델 병렬, 비용 절감엔 Spot+체크포인트가 각 요구에 정확히 대응한다. File 모드(A, D)는 대용량 시작 지연 문제가 있고, 단일 인스턴스(C)는 모델 메모리 초과를 해결하지 못한다.

---

**문제 3.** 딥러닝 튜닝에서 가망 없는 후보에 자원을 낭비하지 않고 빠르게 수렴하면서 튜닝 비용을 줄이려 한다. 가장 적합한 AMT 전략은?

A) Grid Search  
B) Hyperband  
C) max_parallel_jobs를 최대로 한 Random  
D) early_stopping_type=Off인 Bayesian  

**정답: B**  
해설: Hyperband는 다중 fidelity로 가망 없는 trial을 조기 중단해 딥러닝 튜닝을 빠르게 수렴시키며 비용도 절감한다. 그리드(A)는 조합 폭발에 약하고, 무한 병렬 랜덤(C)은 가지치기가 없으며, 조기종료를 끈 베이지안(D)은 비용 절감과 반대 방향이다.

---

**문제 4.** 학습 중 손실이 갑자기 NaN으로 발산했다. 다음 중 가장 우선해서 점검·적용할 대응은?

A) 모델 층 수를 늘린다  
B) 데이터를 더 수집한다  
C) 학습률을 낮추고 그래디언트 클리핑을 적용한다  
D) 검증 세트를 학습에 합친다  

**정답: C**  
해설: NaN 발산은 학습률 과다나 그래디언트 폭발이 전형적 원인이므로 학습률 인하와 그래디언트 클리핑이 우선 대응이다. 모델 확대(A)·데이터 수집(B)은 발산과 무관하고, 검증을 학습에 합치면(D) 일반화 측정이 불가능해진다.

---

**문제 5.** 학습은 정상적으로 수렴하지만 GPU 사용률이 30%로 낮고 데이터 로딩 병목이 의심된다. 비용·속도 개선을 위해 자원 활용을 분석하려 한다. 가장 적합한 도구는?

A) SageMaker Debugger의 vanishing_gradient 규칙  
B) SageMaker Profiler  
C) Automatic Model Tuning  
D) SageMaker Model Monitor  

**정답: B**  
해설: GPU 저활용·데이터 로딩 병목 같은 시스템 자원·성능 문제는 Profiler가 분석·권고한다. Debugger(A)는 그래디언트·과적합 등 학습 품질 이상용, AMT(C)는 하이퍼파라미터 탐색, Model Monitor(D)는 배포 후 추론 드리프트 모니터링이다.

---
