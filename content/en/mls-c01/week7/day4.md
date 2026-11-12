# Day 4 - Training Techniques and Transfer Learning

## 📌 Key Takeaways

- The problem type dictates the loss. Regression = MSE/MAE, classification = cross-entropy. **Never use MSE for classification.**
- The default optimizer is **Adam** (adaptive, fast); a simple, robust alternative is SGD (+Momentum).
- **The learning rate is the top tuning target.** Too large diverges, too small is slow → handle it with scheduling and warmup.
- Five ways to prevent overfitting: dropout · weight decay (L2) · batch normalization · data augmentation · early stopping.
- Transfer learning is decided by **data volume × domain similarity**. Little data and similar = freeze; lots of data or different = fine-tune with a low learning rate.

## Training Creates Performance

Even after you choose the model structure, "how you train it" determines performance. Today covers the engine of deep learning training — **loss functions, optimizers, and learning rate** — then **transfer learning and fine-tuning**, which achieve a lot with little data, and the **frameworks (TensorFlow/PyTorch) and SageMaker integration** that appear on the exam. In this area MLS-C01 asks "what do you change when training fails, is slow, or overfits?"

## Loss Function

It quantifies the difference between the model's predictions and the ground truth. You must choose it to match the problem type.

| Problem type | Loss function | Paired output layer | Why |
|------|------|---|---|
| Regression | MSE (mean squared error), MAE | Linear (no activation) | MSE penalizes large errors heavily; MAE is robust to outliers |
| Binary classification | Binary cross-entropy (BCE) | Sigmoid, 1 node | Log loss of the probability prediction |
| Multiclass classification | Categorical cross-entropy | Softmax, K nodes | Compares probability distributions |
| Imbalanced / detection | Variants such as Focal Loss | Depends on the task | Lowers the contribution of easy majority samples |

- Using MSE for classification makes training slow and unstable, so **cross-entropy** is the standard.
- The loss is training's "compass." If the loss curve does not fall, check the learning rate, structure, and data.

> ⚠️ **Trap**: Do not mix up the loss function (what is optimized) and the evaluation metric (the selection criterion). Just as high accuracy on imbalanced data does not make a good model, a low loss does not mean the business goal was met. Choose the metric separately, as one that **reflects the cost structure**, such as recall or PR-AUC.

## Optimizer

The algorithm that actually updates the weights using the gradients obtained by backpropagation.

| Optimizer | Core idea | When to use | Caution |
|------|------|---|---|
| **SGD** | Moves a fixed fraction opposite the gradient, simple and robust | Basic understanding, final fine-tuning of large models | Heavy burden of learning-rate tuning |
| **SGD + Momentum** | Accumulates past directions to reduce oscillation and accelerate | When oscillating in a narrow, long valley | The momentum coefficient is also a hyperparameter |
| **RMSProp** | Adjusts the per-parameter learning rate by gradient magnitude | When gradient magnitudes differ greatly across parameters | No directional inertia on its own |
| **Adam** | Combines Momentum + RMSProp, the deep learning default | The starting point for most cases | On very large models, SGD sometimes generalizes better |

```text
SGD:  w ← w - η * ∇L
Adam: adaptive per-parameter step size via 1st/2nd moment estimates
```

The practical default is **Adam**: fast convergence and little tuning. For the final fine-tuning of very large models, SGD sometimes shows better generalization.

Adam estimates the first moment (mean) and second moment (variance) of the gradient for each parameter and applies an adaptive learning rate. As a result it is less sensitive to the learning rate and converges quickly, making it the safe starting point for most deep learning projects. On the exam, if "deep learning training is too slow or learning-rate tuning is hard," Adam is the natural choice.

## Learning Rate

The most important hyperparameter. It decides how far the weights move at once.

- **Too large**: the loss diverges or oscillates and fails to converge (loss goes NaN or explodes).
- **Too small**: convergence is excessively slow and training gets stuck in a local minimum.

### Learning Rate Strategy Table

| Strategy | Behavior | When | Caution |
|---|---|---|---|
| **Constant** | Same value from start to finish | Short experiments, with Adam | Wanders around the minimum late in training |
| **Step decay** | Lowers by a fixed factor every set number of epochs | Long training, finishing convergence | Decay timing and factor are extra tuning targets |
| **Cosine** | Smoothly lowers toward 0 | When the number of epochs is fixed in advance | Check compatibility with early stopping |
| **Warmup** | Gradually raises over the first few steps | Transformers and others unstable early on | A warmup period that is too long is wasteful |

- The basic sense of learning-rate scheduling: **start large, then reduce gradually**.
- Warmup prevents large gradients in the first few steps from wrecking the weights.

### Learning Curve Diagnosis Table

| Training loss | Validation loss | Diagnosis | Remedy |
|---|---|---|---|
| Explodes / NaN | — | Learning rate too large / exploding gradients | Lower the learning rate, gradient clipping |
| Decreases very slowly | Also slowly | Learning rate too small | Raise the learning rate, scheduling, Adam |
| Keeps decreasing | Rises from some point | Overfitting | Dropout, regularization, augmentation, early stopping |
| Stalls at a high value | Stalls at a high value | Underfitting | Enlarge the model, train longer, add features |
| Decreases then oscillates | Oscillates | Learning rate too large late in training | Apply a decay schedule |

Learning curve diagnosis is the key. Loss explodes or oscillates → lower the learning rate. Training loss is low but validation loss rises → overfitting (dropout, regularization, augmentation, early stopping). Both training and validation loss are high → underfitting (enlarge the model, train more, add features). SageMaker Automatic Model Tuning (Bayesian optimization) can automatically search the learning rate, batch size, and number of layers.

## Regularization and Preventing Overfitting

Deep learning overfits easily because it has so many parameters. The main remedies are broken down by technique, effect, when to use, and caution.

| Technique | Effect | When to use | Caution |
|---|---|---|---|
| **Dropout** | Randomly turns off some neurons during training → prevents co-adaptation | Networks with large fully connected layers | Turn it off at inference. Too high a rate causes underfitting |
| **L2 weight decay** | Penalizes large weights → smoother decision boundary | Almost always a default option | A large coefficient causes underfitting |
| **L1 regularization** | Pushes weights to 0, making them sparse | When a feature-selection effect is needed | L2 is more common in deep learning |
| **Batch normalization (BatchNorm)** | Normalizes layer inputs to stabilize and speed up training | Deep CNNs and MLPs | Statistics become unstable with very small batches |
| **Data augmentation** | Transforms inputs to gain diversity | First choice when data is scarce | Apply to the training set only. Do not break the meaning of the label |
| **Early stopping** | Stops training when validation loss no longer decreases | Almost always | Needs a validation set and is sensitive to the patience setting |

> ⚠️ **Trap**: Batch normalization and dropout have different purposes. Batch normalization is mainly for **stabilizing and speeding up training** (with a weak regularization effect as a side benefit), while dropout aims to **suppress overfitting**. Picking dropout for "training is unstable," or only batch normalization for "it is overfitting," points in the wrong direction.

## What to Select the Model By — Metric Interpretation Table

Both early stopping and Automatic Model Tuning work only after you fix one metric to optimize. That choice is itself a business decision.

| Metric | What it tells you | When to prioritize | Trap |
|---|---|---|---|
| Accuracy | Share of all predictions that were right | Only when classes are balanced | With 1% positives, "all negative" is also 99% |
| Precision | Of those called positive, how many are truly positive | False-positive cost is high | Easy to raise by predicting positive for only a few |
| Recall | Share of actual positives caught | False-negative cost is high | Predicting everything positive gives 1.0 |
| F1 | Harmonic mean of precision and recall | When the two costs are similar | Hides which side is the problem |
| ROC-AUC | Discrimination independent of threshold | Comparing models | Optimistic under extreme imbalance |
| PR-AUC | Discrimination for the minority class | When the positive ratio is extremely low | Value changes if the class ratio changes |
| RMSE / MAE | Size of the regression error | To penalize large errors / to be robust to outliers | RMSE is sensitive to outliers |

If you set the tuning objective metric to accuracy, the search converges in the wrong direction on imbalanced data. Decide the objective metric first so that it reflects the **costly error type**, and only then run tuning.

## Transfer Learning

It transfers the knowledge of a model pretrained on large-scale data to a new task. It is powerful with little data and little time.

```text
Pretrained model (ImageNet / large corpus)
   ├─ Backbone (feature extractor): reuse the weights
   └─ Head (output layer): replace and retrain for the new task
```

```text
[Feature extraction — very little data]    [Fine-tuning — a moderate amount of data]

  ❄️ Conv block 1  (frozen)                  ❄️ Conv block 1  (stays frozen)
  ❄️ Conv block 2  (frozen)                  ❄️ Conv block 2  (stays frozen)
  ❄️ Conv block 3  (frozen)                  🔥 Conv block 3  (unfrozen with a low learning rate)
  🔥 New Dense head (trained)                🔥 New Dense head (trained)

  ❄️ = weights fixed   🔥 = updated
  "Gradual unfreezing" — train the head first, then progressively release the backbone — is stable.
```

Two approaches:

- **Feature extraction**: **freeze** the backbone and train only the new head. For very little data.
- **Fine-tuning**: retrain part or all of the backbone together at a low learning rate. For a moderate amount of data.

### Data Volume × Domain Similarity Quadrants

| | Domain is **similar** to pretraining | Domain is **different** |
|---|---|---|
| **Little data** | Freeze the backbone + train only the head (feature extraction) | Unfreeze only some upper layers with a low learning rate, combined with augmentation |
| **Lots of data** | Fine-tune everything with a low learning rate | Widen the fine-tuning scope or also consider training from scratch |

Selection criteria summary:

- Little data + similar domain → feature extraction (frozen).
- Lots of data or different domain → fine-tuning (low learning rate).

When fine-tuning, use a **much lower learning rate than when training from scratch** so you do not ruin the pretrained weights. Also, "gradual unfreezing" — train the head first (backbone frozen), then progressively release the backbone — is stable. SageMaker JumpStart provides pretrained vision and NLP models and fine-tuning scripts, simplifying this process.

In transfer learning, "retrain all layers at once with a large learning rate" is a wrong answer. It erases the knowledge gained from pretraining within the first few steps.

## Frameworks and SageMaker Integration

| Framework | Characteristic |
|------|------|
| **TensorFlow / Keras** | Rich industrial deployment and serving ecosystem, high-level API with Keras |
| **PyTorch** | Dynamic graphs make it friendly for research and debugging, currently the most widely used |
| **MXNet** | The basis of some SageMaker built-ins (in the past) |

Use in SageMaker:

- **Script Mode**: run your own TF/PyTorch script in a SageMaker training container.
- **Prebuilt containers / Deep Learning Containers (DLC)**: managed images for each TF and PyTorch version.
- **Distributed training**: data-parallel and model-parallel libraries, multi-GPU and multi-instance.
- **SageMaker JumpStart**: deploy and fine-tune pretrained models and solutions by click or script.
- Consider `ml.p` and `ml.g` instances for GPU training, and `ml.inf` (Inferentia) and similar for optimizing inference cost.

### Situation → AWS Choice Mapping Table

| Situation | Choice | Why |
|---|---|---|
| Run your own training script as a managed job | Script Mode | Runs your code as-is in the training container |
| Do not want to build the framework environment yourself | Deep Learning Containers | Managed images per version |
| Automatically search learning rate, batch size, dropout | Automatic Model Tuning | Efficient search via Bayesian optimization |
| The model does not fit on one GPU | Model-parallel distributed training | Splits the model across several devices |
| Data is large and one instance is too slow | Data-parallel distributed training | Splits the batch across several devices |
| Start quickly from a pretrained model | JumpStart | Provides the model + fine-tuning scripts |
| Want to lower inference cost | Consider the `ml.inf` (Inferentia) family | Inference-specialized accelerators |

## Symptom → Cause → Remedy

| Symptom | Cause | First remedy |
|---|---|---|
| Loss explodes to NaN | Learning rate too large | Lower the learning rate |
| Convergence is too slow | Learning rate too small, unsuitable optimizer | Raise the learning rate, scheduling, Adam |
| Training loss ↓, validation loss ↑ | Overfitting | Dropout, L2, augmentation, early stopping |
| Both losses high | Underfitting | Enlarge the model, train longer, add features |
| Only 1,000 training images | Insufficient data | Transfer learning (frozen) + augmentation |
| Performance actually drops after fine-tuning | Learning rate too large destroyed prior knowledge | Cut the learning rate drastically, gradual unfreezing |
| Training fails with OOM | Batch or model too large | Reduce the batch, model parallelism |
| Too many hyperparameter combinations | Limits of manual search | Automatic Model Tuning |

The next post compresses all of Week 7 into one decision map and organizes confusable concept pairs from a comparison perspective.

## 📖 Glossary

- **Loss function**: a single number summarizing the difference between predictions and ground truth. What training tries to minimize.
- **Optimizer**: the algorithm that actually updates the weights using the gradients obtained by backpropagation.
- **Adam**: an optimizer that combines Momentum and RMSProp to use adaptive per-parameter steps. The deep learning default.
- **Learning rate**: the value that sets how far the weights move at once. The first thing to tune.
- **Learning rate warmup**: a technique that gradually raises the learning rate over the first few steps to prevent early instability.
- **Dropout**: an overfitting-suppression technique that randomly turns off some neurons during training to prevent co-adaptation.
- **Weight decay (L2)**: regularization that penalizes large weights to make the model smoother.
- **Batch normalization**: a technique that normalizes the distribution of layer inputs to stabilize and speed up training.
- **Early stopping**: a technique that stops training when validation loss no longer decreases, preventing overfitting.
- **Transfer learning / fine-tuning**: taking and reusing pretrained weights / retraining those weights together at a low learning rate.

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
