# Day 2 - Domain 3 Integration: Modeling (Algorithm to Evaluation)

Domain 3: **ML's core** — choose algorithm, structure (DL), tune, evaluate. Today: integrated **problem → algorithm → learn → evaluate** flow.

## End-to-End Modeling

```text
[Business problem]
   │
   ├─ 1) DEFINE ML TYPE
   │     Label? → supervised (classification/regression) or unsupervised
   │     Output? → category/number/cluster/anomaly/recommendation
   │
   ├─ 2) PICK ALGORITHM
   │     Tabular → XGBoost (default)
   │     Image → CNN
   │     Sequence/TS → RNN/LSTM or DeepAR
   │     Text → BlazingText
   │
   ├─ 3) STRUCTURE (if DL)
   │     Activate: ReLU (hidden) → Sigmoid/Softmax/linear (output)
   │     Loss: cross-entropy (classify) or MSE (regress)
   │
   ├─ 4) OPTIMIZE/TUNE
   │     Hyperparameter search: Bayesian (efficient) or Hyperband (DL)
   │     Diagnosis: overfit → regularize; underfit → more capacity
   │     Learning rate: NaN → too high; stalled → too low
   │
   └─ 5) EVALUATE
         Classify: precision/recall/F1 (imbalance-aware)
         Regress: RMSE/MAE/R²
         Residual plot: patterns = model assumptions broken
         Confusion: where do errors cluster?
```

## Algorithm Selection by Data Shape

| Data | Default | Alt |
|------|------|------|
| Tabular | XGBoost | Linear |
| Image | CNN | ResNet (transfer) |
| Sequence | LSTM | GRU |
| Time series | DeepAR | Prophet |
| Text | BlazingText | Transformer |
| Unlabeled | Unsuitable | K-Means (cluster) |
| Rare anomaly | Unsuitable | RCF |

## Learning Pathway

1. **Diagnose curve pattern**:
   - Train low, val low → underfit (need capacity/data)
   - Train low, val high → overfitting (regularize/early-stop)

2. **Tune**:
   - Learning rate: no NaN, loss falling
   - Regularization: dropout/L1/L2 if overfitting
   - Batch size: balance speed/stability

3. **Evaluate**:
   - Metric per problem (imbalance=F1, regression=MAE)
   - Residual plot: random or patterns?
   - Cross-validate: general or data-lucky?

## Metric Selection by Business Cost

| Scenario | Metric |
|------|------|
| Fraud (FN costly) | Recall / F1 |
| Spam (FP costly) | Precision |
| Both equal | F1 |
| Regression outliers | MAE |
| Regression catastrophic | RMSE |

## Summary

Domain 3 = problem → algorithm → DL structure → tuning → evaluation. Pick by data shape (tabular=XGBoost, image=CNN, seq=LSTM). Diagnose curves (underfit vs overfit). Tune hyperparameters. Evaluate per business cost. Residual plots reveal hidden failures.

Tomorrow: Domain 4 (deployment).

## 📝 Practice Questions

**Question 1.** You want to predict churn from structured tabular customer data (mixed numeric and categorical, with some missing values). Which SageMaker built-in algorithm is MOST appropriate to try first?

A) XGBoost  
B) Image Classification  
C) DeepAR  
D) Random Cut Forest  

**Answer: A**  
Explanation: For classification and regression on structured tabular data, XGBoost, which handles missing values, mixed types, and nonlinear interactions well, is a strong default. Image Classification (B) is for images, DeepAR (C) is for time-series forecasting, and RCF (D) is for anomaly detection, so none fits this problem.

---

**Question 2.** You are designing the output layer of a neural network that classifies into 3 classes (low/medium/high risk). Which is the correct activation function?

A) Sigmoid  
B) ReLU  
C) Softmax  
D) No activation (linear)  

**Answer: C**  
Explanation: For multiclass classification output, Softmax, which produces a probability vector that sums to 1, is the correct answer. Sigmoid (A) is for binary classification output, ReLU (B) is for hidden layers, and linear (D) is used for regression output.

---

**Question 3.** A model has 98% accuracy on the training data but 72% accuracy on the validation data, a large gap. What response should be prioritized?

A) Increase model complexity and train for longer  
B) Increase the learning rate tenfold  
C) Change the output activation from Softmax to Sigmoid  
D) Apply overfitting countermeasures such as stronger regularization, added dropout, and early stopping  

**Answer: D**  
Explanation: A large gap with high training and low validation performance is typical of overfitting, and regularization, dropout, early stopping, and data augmentation are the standard responses. Increasing complexity (A) worsens overfitting, a sudden learning rate increase (B) causes divergence, and changing the output activation (C) is unrelated to overfitting.

---

**Question 4.** In SageMaker Automatic Model Tuning, you want to efficiently find good hyperparameters with a small training job budget. Which recommended search strategy and reason are correct?

A) Grid Search — examines every combination without omission  
B) Random Search — is always the fastest  
C) Bayesian Optimization — uses the results of previous trials to intelligently choose the next candidates  
D) Manual search — a human chooses by intuition  

**Answer: C**  
Explanation: Bayesian optimization uses previous evaluation results to explore promising regions first, so it has a high probability of finding a good solution in few trials and is AMT's efficient default strategy. Grid (A) becomes exponentially expensive as dimensions grow, Random (B) ignores history, and manual (D) is inefficient.

---

**Question 5.** In a fraud transaction detection model, positives (fraud) are 0.3% of the total and the cost of missing fraud is very high. Which combination of evaluation metrics should be the primary focus?

A) Recall and PR-AUC  
B) Plain accuracy  
C) RMSE and MAE  
D) R²  

**Answer: A**  
Explanation: With extreme imbalance, when the cost of FN (missed fraud) is high, recall and PR-AUC are the key metrics. Accuracy (B) is overestimated under imbalance, and RMSE/MAE (C) and R² (D) are regression metrics and unsuitable for a classification problem.

---
