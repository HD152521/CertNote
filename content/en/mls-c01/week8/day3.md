# Day 3 - Overfitting/Underfitting: Diagnosis and Regularization/Data Augmentation

Even with good hyperparameters from tuning, if a model **fits training well but validates poorly**, it's useless. Today covers **generalization failure's two sides** — overfitting and underfitting — how to diagnose, and how to fix each with regularization (L1/L2/dropout/early stopping) and data augmentation. Tests ask about learning curve patterns, bias-variance, matching fixes.

## Bias and Variance, Generalization

Generalization error decomposes into bias and variance.

- **High bias = underfitting**: Model too simple to capture training patterns. Both training and validation error high
- **High variance = overfitting**: Model memorizes noise. Training error low, validation error high (big gap)

```text
Underfitting:  train error ↑  valid error ↑   (both bad, small gap)
Ideal:         train error ↓  valid error ↓   (both good)
Overfitting:   train error ↓  valid error ↑   (gap is large)
```

> 💡 **Related Theory**: Bias-variance tradeoff is core tension of model complexity vs generalization. Increasing complexity → reduces bias but raises variance; decreasing → opposite. Goal: find sweet spot where total (bias + variance) is minimized. Regularization reduces variance to fight overfitting, increasing model capacity/features fights underfitting

## Diagnosis: Reading Learning Curves

Curve interpretation is more tested than code.

```text
[Overfitting signals]
- Train 99% / valid 72% (large gap)
- As epochs progress: train loss keeps falling, val loss rises again

[Underfitting signals]
- Train 65% / valid 64% (both low, similar)
- More training still yields high loss, plateau
```

Intervention map:
- **Overfitting** → more data, strengthen regularization, simplify model, fewer features, early stop, dropout, augment
- **Underfitting** → increase complexity, add features, train longer, weaken regularization

## Regularization 1: L1, L2

Penalize weight magnitude in loss to reduce variance.

| Technique | Penalty | Effect |
|------|------|------|
| **L1 (Lasso)** | Sum of weight absolute values | Some weights → exactly 0 → **feature selection** (sparsity) |
| **L2 (Ridge)** | Sum of weight squares | Weights → small (not 0) → smooth shrinkage |
| **ElasticNet** | L1 + L2 combo | Sparsity + stability blend |

```python
# Example: Linear Learner L1/L2 strength
hyperparameters = {
    "l1": 0.01,                  # L1 strength (sparsity)
    "wd": 0.001,                 # weight decay = L2
}
```

Signal:
- "Too many features, auto-discard unnecessary, sparse model" → **L1**
- "Keep all features but shrink weights, fight overfitting" → **L2**

## Regularization 2: Dropout, Early Stopping

Deep learning-specific.

- **Dropout**: Random disable neurons per step (e.g., rate 0.5). Prevents specific neuron dependence, implicit ensemble. **Disable at inference**, adjust weights
- **Early Stopping**: Stop when validation loss stops improving. Prevents reaching overfitting point

```python
# Example neural net hyperparameters
hyperparameters = {
    "dropout": 0.5,
    "early_stopping_patience": 5,   # Stop if no improvement 5 epochs
}
```

> 💡 **Related Theory**: Dropout trains different sub-networks each step → inference averages them (implicit ensemble). Early Stopping halts right before noise memorization starts, shrinking variance. Both achieve "simpler effective model," fighting overfitting differently

## Data Augmentation

When collecting more data is hard, transform existing data to broaden training distribution. Powerful overfitting reducer.

- **Images**: Rotate, flip, crop, brightness/contrast, noise, cutout
- **Text**: Synonym swap, back-translation, random deletion
- **Tabular/imbalance**: **SMOTE** synthesize minority class, relieve class imbalance

Signal:
- "Limited data, overfitting / data collection costly" → **augmentation**
- "Minority class too rare, model learns majority only" → **SMOTE/oversample** (or class weights)

## Data Split and Leakage Prevention

Measuring generalization honestly needs correct splitting.

- **train / validation / test** 3-way. Validation picks hyperparameters, test scores once final
- **k-fold cross-validation**: Limited data → average performance avoiding split luck
- **Leakage**: Future info/target-derived features/test info in training → unrealistic val scores. Scalers/encoders/imputers must `fit` train only, `transform` valid/test

## Test Tips

- "Train accurate, validation low (big gap)" → overfitting. Fix: regularize↑, data↑, dropout, early stop, augment
- "Train·validation both low" → underfitting. Fix: complexity↑, features↑, train longer
- "Unwanted features, auto-remove / sparse" → L1. "Shrink all weights" → L2
- "Data scarce" + image/text → augmentation
- Scaler fitted on all data = leakage → fit train only

## Summary

Today covered generalization failure diagnosis and fixes. Key: **learning curves tell overfitting/underfitting → bias-variance lens → overfitting = regularize (L1/L2/dropout/early stop), data augment; underfitting = more capacity, features, training**. Next: learning stability itself — batch size, learning rate schedules, gradient problems, Debugger/Profiler

---

## 📝 Practice Questions

**Question 1.** A model shows a large gap: 98% training accuracy and 71% validation accuracy. Which diagnosis and first response are MOST appropriate for this situation?

A) Normal - no further action needed  
B) Data leakage - increase the learning rate  
C) Underfitting - increase model complexity further  
D) Overfitting - strengthen regularization or collect more data  

**Answer: D**  
Explanation: A gap where training performance is high but validation performance is much lower is classic overfitting, and the responses include stronger regularization, more data, dropout, and early stopping. Underfitting (C) is when both are low, raising the learning rate (B) can worsen overfitting, and a large gap is not normal (A).

---

**Question 2.** There are many input features (500), and you want the model to set unnecessary ones to 0 by itself to obtain a sparse model. Which regularization is MOST suitable?

A) L2(Ridge)  
B) L1(Lasso)  
C) Dropout  
D) Batch normalization  

**Answer: B**  
Explanation: L1 regularization uses an absolute-value penalty on the weights that sets some weights to exactly 0, inducing feature selection and sparsity. L2 (A) shrinks weights close to 0 but does not make them 0, and dropout (C) and batch normalization (D) are not sparsification techniques for feature selection.

---

**Question 3.** An image classification model overfits, and collecting additional labeled data is very expensive. What is the most cost-effective response?

A) Apply data augmentation such as rotation, flipping, and cropping  
B) Double the number of training epochs  
C) Greatly increase the number of layers in the model  
D) Merge the validation set into the training set  

**Answer: A**  
Explanation: When additional collection is difficult, data augmentation (rotation, flipping, cropping, etc.) is a cost-effective way to reduce overfitting by transforming existing data to broaden the training distribution. Increasing epochs (B) and enlarging the model (C) worsen overfitting, and merging the validation set into training (D) makes it impossible to measure generalization.

---

**Question 4.** In a neural network, as training proceeds the training loss keeps going down, but the validation loss rises again after some point. What is the most direct technique for preventing the memorization of noise?

A) Fix the learning rate at 0  
B) Set the batch size to 1  
C) Early stopping, which halts training when the validation loss stops improving  
D) Remove all features  

**Answer: C**  
Explanation: The point where the validation loss rises again is where overfitting begins, and early stopping halts training when the validation loss no longer improves so that training does not go past that point. A learning rate of 0 (A) prevents learning, a batch size of 1 (B) is not a relevant solution, and removing all features (D) is impractical.

---

**Question 5.** When applying standardization (StandardScaler) in preprocessing, what is the correct way to prevent data leakage?

A) Fit on the entire dataset (train + test), then split  
B) Fit on train and use those statistics to transform train, validation, and test  
C) Fit on test and transform train  
D) Fit anew on every batch  

**Answer: B**  
Explanation: The scaler must be fit only on the training data, and the resulting mean and standard deviation must be used to transform validation and test so that test information does not leak into training. Fitting on the entire dataset (A) or fitting on test (C) causes leakage, and refitting on every batch (D) breaks consistency.

---
