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

## 📝 Practice Questions

**Question 1.** As soon as training starts, the loss explodes to NaN. What remedy should you try first?

A) Lower the learning rate  
B) Increase the number of epochs  
C) Remove dropout  
D) Fix the batch size at 1  

**Answer: A**  
Explanation: The classic cause of a diverging/exploding loss is an excessively large learning rate. First lower the learning rate to stabilize training. Increasing epochs (B), removing dropout (C), and a batch size of 1 (D) do not fix the divergence itself.

---

**Question 2.** You have only 1,000 training images, but the domain is similar to ImageNet. What is the MOST efficient strategy?

A) Train a deep CNN from scratch with random initialization  
B) Freeze the pretrained backbone and train only a new classification head (feature extraction)  
C) Retrain all layers at once with a large learning rate  
D) Discard the data and classify with rules  

**Answer: B**  
Explanation: When data is scarce and the domain is similar, feature extraction that freezes the pretrained backbone and trains only the head prevents overfitting and is efficient. Training from scratch (A) suffers from insufficient data, and retraining everything with a large learning rate (C) destroys prior knowledge.

---

**Question 3.** What is the standard loss function for a **multiclass classification** neural network?

A) Mean squared error (MSE)  
B) MAE  
C) Cosine similarity  
D) Categorical cross-entropy  

**Answer: D**  
Explanation: For multiclass classification, it is standard to use categorical cross-entropy on the Softmax output. MSE/MAE (A, B) are for regression, and cosine similarity (C) is a metric for comparing embeddings.

---

**Question 4.** Which **optimizer is recommended as the default** in most deep learning projects because it requires little learning rate tuning and converges quickly?

A) Plain SGD  
B) Adam  
C) Grid search without gradient descent  
D) K-Means  

**Answer: B**  
Explanation: Adam, with per-parameter adaptive learning rates (Momentum + RMSProp), is less sensitive to the learning rate and converges quickly, so it is recommended as the default starting point. Plain SGD (A) needs more tuning, and grid search (C) and K-Means (D) are not optimizers.

---

**Question 5.** The training loss keeps decreasing, but the validation loss starts rising again from some point. What is the MOST appropriate response?

A) Greatly increase the learning rate  
B) Make the model deeper and larger  
C) Apply overfitting-prevention techniques such as dropout, regularization, data augmentation, and early stopping  
D) Change the loss function to MSE  

**Answer: C**  
Explanation: A low training loss with a rising validation loss is a classic sign of overfitting. Improve generalization with dropout, regularization, augmentation, and early stopping. Increasing the learning rate (A) and enlarging the model (B) worsen overfitting, and changing the loss (D) is unrelated.

---
