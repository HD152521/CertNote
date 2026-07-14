# Day 4 - Learning Techniques and Transfer Learning

Even with the right model structure, "how we train it" makes or breaks performance. Today covers **loss functions, optimizers, learning rate** — the training engine — and **transfer learning/fine-tuning** that achieves great results with limited data. Plus **framework (TensorFlow/PyTorch) and SageMaker integration** that tests often ask. MLS-C01 frequently asks "When learning fails/is slow/overfits, what do we change?" — this domain.

## Loss Function

Quantifies difference between prediction and truth. Choose per problem type.

| Problem Type | Loss Function |
|------|------|
| Regression | MSE (mean squared error), MAE |
| Binary classification | Binary cross-entropy (BCE) |
| Multi-class classification | Categorical cross-entropy |
| Imbalance/detection | Focal Loss variations |

- Using MSE for classification = slow, unstable learning → **cross-entropy is standard**
- Loss is training's "compass." If loss doesn't decrease, check learning rate, structure, data

## Optimizer

Uses backprop-computed gradients to actually update weights.

| Optimizer | Essence |
|------|------|
| **SGD** | Move in opposite gradient direction at fixed rate, simple and robust |
| **SGD + Momentum** | Accumulate past direction, reduce oscillation, accelerate |
| **RMSProp** | Adapt per-parameter learning rate by gradient magnitude |
| **Adam** | Combine Momentum + RMSProp, DL default |

```text
SGD:  w ← w - η * ∇L
Adam: Estimate 1st/2nd moments → per-parameter adaptive step
```

Practical default is **Adam**: fast convergence, less tuning. Very large model final fine-tuning sometimes sees better generalization with SGD.

> 💡 **Related Theory**: Adam estimates per-parameter 1st moment (mean) and 2nd moment (variance) to apply adaptive learning rate. Less sensitive to learning rate, fast convergence → safe starting point for most deep learning. Test: "DL learning too slow or tuning hard?" → Adam naturally surfaces

## Learning Rate

Most critical hyperparameter. Controls how much we shift weights per step.

- **Too large**: Loss diverges or oscillates, won't converge (NaN/explosion)
- **Too small**: Convergence glacially slow, stuck in local minima
- **Learning rate scheduling**: Start large, decay gradually (step decay, cosine, warmup)
- **Warmup**: Gently raise LR first few steps, prevent initial instability (Transformers etc.)

> 💡 **Related Theory**: Learning curve diagnosis is key. Loss spikes/oscillates → lower LR. Train loss low but val high → overfitting (dropout, regularization, augment, early stop). Both low → underfitting (bigger model, more learning, more features). SageMaker Automatic Model Tuning (Bayesian) can auto-search LR, batch, layer count

## Regularization and Overfitting Prevention

Deep networks = many parameters = easy overfitting. Standard fixes:

- **Dropout**: Random disable neurons during training → prevent co-adaptation
- **L2 weight decay**: Penalty on large weights
- **Batch Normalization**: Normalize layer input → train stability/speed
- **Data augmentation**: Warp input, ensure diversity
- **Early Stopping**: Stop when val loss stops improving

## Transfer Learning

Reuse knowledge from large pre-trained models on new task. Few data, short time, strong results.

```text
Pre-trained model (ImageNet/huge corpus)
   ├─ Backbone (feature extractor): reuse weights
   └─ Head (output): replace, retrain for new task
```

Two strategies:
- **Feature extraction**: **Freeze** backbone, train new head only. Very limited data
- **Fine-tuning**: Partially/fully retrain backbone at low LR. Sufficient data

Pick:
- Limited data + similar domain → feature extraction (freeze)
- Ample data or different domain → fine-tune (low LR)

> 💡 **Related Theory**: During fine-tuning, use **much lower LR than training from scratch** to avoid destroying pre-trained weights. Also, "progressive unfreezing" (train head first, gradually unfreeze backbone) is stable. SageMaker JumpStart provides pre-trained models and fine-tuning scripts, simplifying this

## Framework and SageMaker Integration

| Framework | Strength |
|------|------|
| **TensorFlow/Keras** | Industry deployment/serving rich, high-level Keras API |
| **PyTorch** | Dynamic graphs, research/debug friendly, now most popular |
| **MXNet** | Basis of some SageMaker builtins (historical) |

SageMaker usage:
- **Script Mode**: Run your TF/PyTorch script in SageMaker training container
- **Pre-built containers / Deep Learning Containers (DLC)**: TF/PyTorch version management
- **Distributed training**: Data/model parallelism libraries, multi-GPU, multi-instance
- **SageMaker JumpStart**: Pre-trained models, solutions, deploy/fine-tune with clicks/script
- GPU training uses `ml.p`/`ml.g` instances, inference cost optimization considers `ml.inf`(Inferentia)

## Core Summary

- Loss: regression = MSE, classification = cross-entropy (never MSE for classification)
- Optimizer default Adam (adaptive, fast), simple/robust = SGD (+Momentum)
- Learning rate #1 tuning target: too big = diverge, too small = slow, use schedules/warmup
- Overfitting prevention: dropout, weight decay, batch norm, augment, early stop
- Transfer learning: limited data → freeze (feature extraction), ample data → low LR fine-tune
- SageMaker integrates TF/PyTorch via Script Mode, DLC, distributed, JumpStart

## 📝 연습 문제

**문제 1.** 학습을 시작하자마자 손실이 NaN으로 폭증한다. 가장 먼저 시도할 처방은?

A) 학습률을 낮춘다  
B) 에폭 수를 늘린다  
C) 드롭아웃을 제거한다  
D) 배치 크기를 1로 고정한다  

**정답: A**  
해설: 손실이 발산/폭증하는 전형적 원인은 과도하게 큰 학습률이다. 우선 학습률을 낮춰 안정시킨다. 에폭 증가(B)·드롭아웃 제거(C)·배치 1(D)은 발산 자체를 해결하지 못한다.

---

**문제 2.** 학습 데이터가 1,000장뿐인데 도메인이 ImageNet과 유사하다. 가장 효율적인 전략은?

A) 무작위 초기화로 처음부터 깊은 CNN 학습  
B) 사전학습 백본을 동결하고 새 분류 헤드만 학습(특징 추출)  
C) 모든 층을 큰 학습률로 동시에 재학습  
D) 데이터를 버리고 규칙 기반으로 분류  

**정답: B**  
해설: 데이터가 적고 도메인이 유사하면 사전학습 백본을 동결하고 헤드만 학습하는 특징 추출이 과적합을 막고 효율적이다. 처음부터 학습(A)은 데이터 부족, 큰 학습률 전체 재학습(C)은 사전 지식을 망가뜨린다.

---

**문제 3.** **다중 클래스 분류** 신경망의 손실 함수로 표준적인 것은?

A) 평균제곱오차(MSE)  
B) MAE  
C) 코사인 유사도  
D) 범주형 교차 엔트로피  

**정답: D**  
해설: 다중 분류는 Softmax 출력에 대해 범주형 교차 엔트로피를 쓰는 것이 표준이다. MSE/MAE(A·B)는 회귀용, 코사인 유사도(C)는 임베딩 비교용 지표다.

---

**문제 4.** 대부분의 딥러닝 프로젝트에서 학습률 튜닝 부담이 적고 빠른 수렴으로 **기본값으로 권장되는 옵티마이저**는?

A) 순수 SGD  
B) Adam  
C) 경사하강 없이 그리드 탐색  
D) K-Means  

**정답: B**  
해설: Adam은 파라미터별 적응적 학습률(Momentum+RMSProp)로 학습률에 덜 민감하고 빠르게 수렴해 기본 출발점으로 권장된다. 순수 SGD(A)는 튜닝이 더 필요하고, 그리드 탐색(C)·K-Means(D)는 옵티마이저가 아니다.

---

**문제 5.** 학습 손실은 계속 낮아지는데 검증 손실은 어느 시점부터 다시 올라간다. 가장 적절한 대응은?

A) 학습률을 크게 올린다  
B) 모델을 더 깊고 크게 만든다  
C) 드롭아웃·정규화·데이터 증강·조기 종료 등 과적합 방지 기법 적용  
D) 손실 함수를 MSE로 바꾼다  

**정답: C**  
해설: 학습 손실은 낮고 검증 손실이 오르는 것은 과적합의 전형적 신호다. 드롭아웃·정규화·증강·조기 종료로 일반화를 높인다. 학습률 증가(A)·모델 확대(B)는 과적합을 악화시키고, 손실 변경(D)은 무관하다.

---
