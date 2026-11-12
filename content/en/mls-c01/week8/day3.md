# Day 3 - Overfitting/Underfitting: Diagnosis and Regularization/Data Augmentation

## 📌 Key Takeaways

- Even if tuning gives you good hyperparameters, a model that **fits the training set well but validates poorly** is useless. Generalization failure goes in two directions: overfitting and underfitting.
- **High bias = underfitting** (both training and validation are bad), **high variance = overfitting** (only training is good, with a large gap to validation). You diagnose with learning curves.
- Overfitting remedies: more data, stronger regularization, a simpler model, fewer features, early stopping, dropout, augmentation.
- Underfitting remedies: more complexity, more features, longer training, weaker regularization. **More epochs or a bigger model must never be used against overfitting.**
- **L1 drives some weights to exactly 0** (feature selection, sparsity), **L2 makes all weights small** (smooth shrinkage). Scalers and encoders must be **`fit` on the training set only** to avoid leakage.

## Bias and Variance, Generalization Error

Generalization error decomposes into bias and variance. The exam asks you to tell these two axes apart more than it asks about code.

| State | Training error | Validation error | Gap | Identity |
|---|---|---|---|---|
| **Underfitting** (high bias) | High | High | Small | The model can't even capture the training patterns |
| **Ideal** | Low | Low | Small | Bias plus variance is at its minimum |
| **Overfitting** (high variance) | Low | High | **Large** | The model memorizes noise |

```text
Underfitting:  train error ↑  valid error ↑   (both bad, small gap)
Ideal:         train error ↓  valid error ↓   (both good)
Overfitting:   train error ↓  valid error ↑   (the gap is large)
```

The bias-variance tradeoff is the fundamental tension between model complexity and generalization. Raising complexity lowers bias but increases variance; lowering it does the opposite. The goal is to find the point where the sum (bias + variance) is minimal. Regularization reduces variance to fight overfitting, while adding model capacity or features reduces bias to fight underfitting.

## Reading Learning Curves — Diagnosis

```text
[Overfitting signals]
 loss │╲                    ← validation loss rises again after some point
      │ ╲___  valid          accuracy: train 99% / valid 72% (large gap)
      │  ╲   ╱‾‾‾            as epochs go on, only train loss keeps falling
      │   ╲_╱
      │    ╲_______ train
      └──────────────── epoch
              ↑ this is the early stopping point

[Underfitting signals]
 loss │‾‾‾‾‾‾‾‾‾‾‾ valid     accuracy: train 65% / valid 64% (both low and similar)
      │‾‾‾‾‾‾‾‾‾‾‾ train     more training leaves the loss high and flat (plateau)
      └──────────────── epoch

[Ideal]
 loss │╲___
      │ ╲___╲______ valid    both curves fall together and end close to each other at a low value
      │  ╲_________ train
      └──────────────── epoch
```

### Diagnosis → Remedy Mapping

| Diagnosis | Remedy |
|---|---|
| **Overfitting** | More data, stronger regularization, simpler model, fewer features, early stopping, dropout, data augmentation |
| **Underfitting** | Higher model complexity, more features, longer training, weaker regularization |

> ⚠️ **Trap**: Any option that answers overfitting with "double the epochs / stack more layers" is wrong. Both increase variance even more. Likewise, "merge the validation set into the training set" is wrong because it removes the ability to measure generalization at all.

## Regularization 1: L1, L2, ElasticNet

Add a weight-magnitude penalty to the loss function to reduce variance.

| Technique | Penalty | Effect |
|------|------|------|
| **L1 (Lasso)** | Sum of absolute values of weights | Some weights become **exactly 0** → **feature selection** (sparsity) |
| **L2 (Ridge)** | Sum of squares of weights | Weights become small (but not 0) → smooth shrinkage |
| **ElasticNet** | L1 + L2 combination | A compromise between sparsity and stability |

```python
# Example: L1/L2 strength in Linear Learner
hyperparameters = {
    "l1": 0.01,                  # L1 strength (sparsity)
    "wd": 0.001,                 # weight decay = L2
}
```

Discriminating signals:

- "There are too many features; I want unnecessary ones discarded automatically and a sparse model" → **L1**
- "I want to keep every feature but shrink the weights to curb overfitting" → **L2**

## Regularization 2: Dropout, Early Stopping

These are the two techniques used mainly in deep learning.

- **Dropout**: Randomly deactivates neurons at each step (e.g., rate 0.5). It prevents reliance on specific neurons and gives an implicit ensemble effect. **It is turned off at inference**, with the weights adjusted to compensate.
- **Early Stopping**: Stops training when validation loss no longer improves. It cuts training off before reaching the point of overfitting.

```python
# Example: neural network hyperparameters
hyperparameters = {
    "dropout": 0.5,
    "early_stopping_patience": 5,   # stop if no improvement for 5 epochs
}
```

Dropout trains a different sub-network at every step and, at inference, effectively averages them, so it works as an implicit ensemble. Early stopping halts training right before noise memorization begins, which reduces variance. Both achieve the same goal of "making the effective model simpler" in different ways.

### Regularization Technique Selection Table

| Technique | What it reduces | When to use | **When NOT to use** |
|---|---|---|---|
| **L1 (Lasso)** | Variance + number of features | Very many features with a large share irrelevant; the goal is a sparse model or feature selection | When every feature is meaningful and none may be dropped |
| **L2 (Ridge)** | Variance | When you need to keep all features but press the weights down; many correlated features | When you actually need to remove features and make the model sparse |
| **ElasticNet** | Variance + number of features | You want sparsity, but there are correlated feature groups for which L1 alone is unstable | When you can't afford to add more hyperparameters to tune |
| **Dropout** | Variance | Neural networks with many parameters and capacity that is large relative to the data | A model that already underfits; the inference stage (always turn it off) |
| **Early stopping** | Variance | When you observe a curve where validation loss rises again; also saves training time | When there is no validation set or it is so small that the metric fluctuates |

> ⚠️ **Trap**: Dropout and batch normalization are not "feature selection" techniques. The answer to a statement like "the model zeroes out unnecessary features by itself" is always **L1**.

## Data Augmentation

When it is hard to collect more data, you transform the existing data to widen the training distribution. It is powerful for mitigating overfitting.

| Domain | Augmentation technique | Caution |
|---|---|---|
| **Images** | Rotation, flipping, cropping, brightness/contrast adjustment, noise addition, cutout | Transformations that change the label's meaning are forbidden (e.g., flipping the digit 6 into 9) |
| **Text** | Synonym replacement, back-translation, random deletion | If the meaning flips, the label breaks |
| **Tabular/imbalanced** | Synthesize the minority class with **SMOTE**, oversampling, class weights | Must be applied **to the training set only, after splitting**, to avoid leakage |

Discriminating signals:

- "Little data and overfitting / the cost of collecting more is very high" → **data augmentation**
- "The minority class is so rare that the model learns only the majority class" → **SMOTE/oversampling** (or class weights)

## Data Splitting and Leakage Prevention

To measure generalization honestly, the split has to be right first.

- **train / validation / test** three-way split. Use the validation set to choose hyperparameters, and score the test set only once, at the very end.
- **k-fold cross-validation**: When data is small, average the performance so the result doesn't depend on the luck of the split.
- **Leakage**: When future information, features derived from the target, or test information get mixed into training, the validation score comes out unrealistically high.

### Leakage Type Table

| Type | How it arises | Symptom | Prevention |
|---|---|---|---|
| **Preprocessing leakage** | Scaler, encoder, or missing-value imputer is `fit` on the entire dataset | Validation score is much higher than real production | `fit` on the training set only; use `transform` only for the rest |
| **Target leakage** | A feature derived from the target is included in the input | A single feature dominates performance | Verify feature creation time against the prediction time |
| **Temporal leakage** | Predicting the past using future data | Only the backtest is good, then collapses in production | Use a chronological split for time series |
| **Duplicate leakage** | The same sample exists in both training and test | Unrealistic test score | Remove duplicates before splitting, split by group |
| **Augmentation leakage** | SMOTE or augmentation applied before splitting | Synthetic copies get mixed into the validation set | Augment only the training set, after splitting |

```text
[Correct order]
Raw data
   │
 ① Split (train / validation / test)   ← from here on, every fit uses the training set only
   │
 ② Impute missing values · encode · scale  (fit on train → transform everything)
   │
 ③ Augment / SMOTE  (train only)
   │
 ④ Train → choose hyperparameters with the validation set (adjust regularization strength here)
   │
 ⑤ Score the test set once (for the final report)
```

## What Do You Measure Generalization With — Interpreting Metrics

To look at the gap, you first need to be sure which number the gap is between. If you pick the wrong metric, the overfitting/underfitting diagnosis itself goes astray.

| Situation | Metric to look at | Reason |
|---|---|---|
| Classification with balanced classes | Accuracy + train/validation gap | Here accuracy moves honestly |
| **Imbalanced classification** (fraud detection, anomaly detection) | F1, AUC, Recall, PR curve | If positives are 1%, predicting "all negative" gives 99% accuracy — **accuracy is a trap** |
| Missing a case is fatal (disease, fraud) | **Recall** first | The cost of a false negative is greater than that of a false positive |
| False alarms are costly | **Precision** first | False positives create real operational cost |
| Regression | Train/validation gap of RMSE / MAE | Sensitivity to outliers differs, so choose to fit the objective |
| Data is small and the validation score fluctuates | k-fold CV mean ± deviation | You have to remove the luck of a single split for the gap to be trustworthy |

With imbalanced data, "train 99% / validation 98%" with a small gap must not be taken as good generalization. Both numbers may simply be pulled along by the majority class. You have to look at the confusion matrix and the minority-class Recall together.

## Diagnosis and Remedy Decision Tree

```text
Model performance falls short of expectations
├─ Is the training performance itself low?
│    ├─ Yes → underfitting (high bias)
│    │        ├─ increase model complexity (layers · tree depth · add features)
│    │        ├─ lower regularization strength (ease L1/L2/dropout)
│    │        └─ train longer (more epochs)
│    └─ No ↓
├─ Is training good but the gap to validation large?
│    ├─ Yes → overfitting (high variance)
│    │        ├─ Can you collect more data?
│    │        │    ├─ Yes → add data
│    │        │    └─ No  → data augmentation (images: rotation·crop / text: back-translation)
│    │        ├─ Too many features, with some irrelevant? → L1
│    │        ├─ Need to keep every feature and press down? → L2
│    │        ├─ Is it a neural network?                 → dropout
│    │        └─ Does validation loss rise again?        → early stopping
│    └─ No ↓
└─ Is the validation score unrealistically high?
     └─ Yes → suspect data leakage (check the fit scope of preprocessing · target-derived features · duplicates)
```

## Question Cue → Answer Mapping

| Question cue | Answer to pick | Reason |
|---|---|---|
| "Training 98%, validation 71%, a large gap" | Overfitting → stronger regularization · more data | Classic high-variance pattern |
| "Training and validation accuracy are both around 65%" | Underfitting → more complexity · features · training time | Classic high-bias pattern |
| "Out of 500 features, I want the unnecessary ones set to 0" | **L1 (Lasso)** | The absolute-value penalty drives weights to exactly 0 |
| "Keep all features but only reduce the weights" | **L2 (Ridge)** | Shrinks toward 0 but doesn't eliminate |
| "Image overfitting, but labeling cost is high" | Data augmentation (rotation · flip · crop) | Widens the training distribution without collecting more |
| "Training loss keeps falling but validation loss rises again" | **Early stopping** | Cut off at the point where noise memorization begins |
| "The minority class is only 1%, so the model learns only the majority class" | SMOTE · oversampling · class weights | Relieves the imbalance itself |
| "StandardScaler was fit on the entire dataset" | **Leakage** → fit on the training set only | Test statistics leak into training |
| "Overfitting, so double the epochs" | **Wrong option** | It makes overfitting worse |

The next post covers training stability itself — batch size, learning rate schedules, vanishing/exploding gradients, and SageMaker Debugger/Profiler.

## 📖 Glossary

- **Generalization**: The property that performance holds on new data not used for training. It is the model's real goal.
- **Bias / variance**: The error caused by a model being too simple / how much the result swings when the training data changes only slightly. High bias means underfitting, high variance means overfitting.
- **Learning curve**: A graph of how training and validation loss change with epochs or data volume. The first-line tool for diagnosing overfitting and underfitting.
- **Regularization**: A family of techniques that add a penalty to the loss to keep the model from becoming overly complex.
- **Sparsity**: The state where most weights become 0 and few features are actually used. L1 induces it. `wd` (weight decay) is, conversely, another name for L2.
- **Dropout / early stopping**: A technique that randomly switches off some neurons during training to prevent reliance on specific neurons (turned off at inference) / a technique that stops training when validation loss no longer improves, so it doesn't pass the point where overfitting begins.
- **Data augmentation**: Creating new training samples by transforming existing data, such as image rotation or text back-translation.
- **SMOTE**: An oversampling technique that creates synthetic samples by interpolating between minority-class samples. Used to relieve class imbalance.
- **Data leakage**: The phenomenon where information that should be unknowable at training time gets mixed into the model and inflates performance. Only the validation score becomes unrealistically good.
- **k-fold CV**: A method that splits the data into k pieces, validates on each in turn, and averages the performance. Used when data is small and results depend on the luck of the split.

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
