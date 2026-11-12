# Day 2 - Domain 3 Integration: Modeling (Algorithm to Evaluation)

## 📌 Key Takeaways

- **Domain 3 (modeling) carries the largest exam weight at 36%.** It asks about the whole process: problem definition → algorithm selection → training and tuning → evaluation and debugging.
- The first clue for algorithm selection is always the **shape of the data**. Tables = XGBoost/Linear Learner, images = CNN, sequences = DeepAR/RNN, text = BlazingText.
- The output-layer activation is a literal translation of the problem type. **Binary = Sigmoid, multi-class = Softmax, regression = no activation (linear)**.
- Overfitting (only validation is low) and underfitting (both are low) have a fixed **symptom → diagnosis → response**. Branch immediately from the symptom sentence alone.
- A metric is a translation of business cost. **If FP is expensive, Precision; if FN is expensive, Recall; if extremely imbalanced, PR-AUC**.

## Flow Map: From Problem Definition to Evaluation

Every other exam question comes from Domain 3. Tie the four axes of algorithm selection → deep learning → tuning → evaluation into one flow.

```text
[Business problem]
   │
   ├─ 1) Map the ML problem type
   │     Labels present → supervised learning (classification/regression)
   │     No labels      → unsupervised (clustering/anomaly detection/dimensionality reduction)
   │     Reward signal  → reinforcement learning
   │
   ├─ 2) Select the algorithm
   │     Structured tabular data → XGBoost, Linear Learner
   │     Images                  → CNN (Image Classification)
   │     Sequences/time series   → RNN/LSTM, DeepAR
   │     Text                    → BlazingText, Transformer
   │
   ├─ 3) Train / tune
   │     Hyperparameters = set by a person before training
   │     Search with AMT (Bayesian), balance overfitting ↔ underfitting
   │
   └─ 4) Evaluate / debug
         Classification = precision/recall/F1/AUC, regression = RMSE/MAE/R²
         Debugger (process) / Clarify (bias and explainability)
```

## Algorithm Selection: Decided by Data Shape

| Algorithm (built-in) | Problem type | Input data shape | Typical clue words |
|---|---|---|---|
| **XGBoost** | Classification, regression, ranking | Structured table (CSV, libsvm) | "Tabular form", "missing values, mixed types" |
| **Linear Learner** | Classification, regression | Structured table (protobuf, CSV) | "Linear", "high-dimensional sparse" |
| **KNN** | Classification, regression | Numeric vectors | "Decide from similar samples" |
| **Factorization Machines** | Classification, regression (recommendation) | Very sparse vectors | "Recommendation", "click-through rate" |
| **Image Classification** | Image classification | Images | "One label per photo" |
| **Object Detection** | Location + class | Images + bounding boxes | "How many, and where" |
| **Semantic Segmentation** | Pixel-level classification | Images + masks | "Pixel level", "region boundaries" |
| **DeepAR** | Time-series forecasting | Many time series (JSON Lines) | "Demand forecasting per store/SKU" |
| **BlazingText** | Text classification, embeddings | Text | "Sentiment classification", "Word2Vec" |
| **Object2Vec** | Embeddings of object pairs | Pairs (sentence-sentence, user-item) | "Relationship between two entities" |
| **Seq2Seq** | Sequence → sequence | Pairs of token sequences | "Translation", "summarization" |
| **LDA / NTM** | Topic modeling | Document-word counts | "Group into N topics" |
| **K-Means** | Clustering | Numeric vectors | "Segments", "no labels" |
| **PCA** | Dimensionality reduction | Numeric vectors | "Too many features" |
| **Random Cut Forest** | Anomaly detection | Numeric, streaming | "Abnormal spikes", "outliers" |
| **IP Insights** | Anomalous relationship detection | (entity, IPv4) pairs | "Abnormal login IP" |

"Start with XGBoost for structured tabular data" is a strong default in both practice and the exam. Gradient boosting handles missing values, mixed types, and nonlinear interactions well, and has plenty of room for tuning. Conversely, when the data shape is explicitly images, sequences, or text, you branch to CNN, RNN/DeepAR, and BlazingText respectively. The first clue in an algorithm question is almost always "what shape is the data (table/image/sequence/text)?"

## Deep Learning: Architectures and Uses

| Architecture | Suitable data | Key point |
|------|------|------|
| CNN | Images, spatial patterns | Extracts local features with convolutions |
| RNN/LSTM | Sequences, time series, text | Remembers order and context |
| Transformer | Text, long-range dependencies | Attention, parallel processing |
| Autoencoder | Dimensionality reduction, anomaly detection | Reconstruction error |

| Activation function | Use |
|------|------|
| ReLU | Default for hidden layers (mitigates vanishing gradients) |
| Sigmoid | Binary classification output |
| Softmax | Multi-class classification output |
| Tanh | Zero-centered, RNN gates |

### Matching Output Layer and Loss Function

| Problem type | Output neurons | Output activation | Loss function |
|---|---|---|---|
| Binary classification | 1 | Sigmoid | Binary cross-entropy |
| Multi-class (exclusive) | Number of classes | Softmax | Categorical cross-entropy |
| Multi-label (overlap allowed) | Number of labels | Sigmoid per label | Per-label binary cross-entropy |
| Regression | 1 | None (linear) | MSE (outlier-sensitive) / MAE (robust) |

The output-layer activation is a direct translation of the problem type. Binary classification is Sigmoid (a single 0-1 probability), multi-class is Softmax (a probability vector summing to 1), and regression is no activation (linear). For hidden layers, ReLU, which reduces vanishing gradients, is practically the default. Options like "Sigmoid for a multi-class output" or "Softmax for a regression output" are traps.

> ⚠️ **Pitfall**: "Several tags can be attached to each image at the same time" is a multi-**label** problem. It is not exclusive multi-class, so the answer is not Softmax but **Sigmoid per label**.

## Hyperparameter Tuning

| Concept | Content |
|------|------|
| Parameter vs hyperparameter | Obtained through training vs set by a person before training |
| learning rate | Too large diverges, too small is slow |
| epochs/early stopping | Stop before overfitting |
| regularization (L1/L2, dropout) | Suppresses overfitting |
| AMT search strategy | Bayesian (default, efficient) > Random > Grid |

| Search strategy | Behavior | Strength / weakness |
|---|---|---|
| **Bayesian** | Infers the next candidate from earlier trial results | Good solutions with few jobs (AMT default) / sequential |
| **Random** | Randomly samples from the search space | Easy to parallelize / doesn't use history |
| **Grid** | Exhaustively tries every combination of specified values | Complete search / combinations explode as dimensions grow |
| **Hyperband** | Stops bad jobs early and reallocates resources | Efficient for iterative training / epoch evaluation must be possible |

- Objective metric direction: errors (RMSE, log loss) are **Minimize**; performance (F1, AUC) is **Maximize**.
- If you set the number of concurrent jobs too large, there is less history for the Bayesian method to reference and its advantage disappears.

The default strategy of SageMaker Automatic Model Tuning is Bayesian optimization. Whereas grid/random search ignores the search history and tries blindly, Bayesian optimization picks the next candidate intelligently from earlier trial results. So with the same job budget it has a higher chance of finding better hyperparameters. When you see a clue like "efficient / optimal with few trials," it is Bayesian. Also, for the objective metric direction, errors (RMSE) are Minimize and performance (F1/AUC) is Maximize.

### Overfitting and Underfitting: Symptom → Diagnosis → Response

| Symptom | Diagnosis | Response |
|------|------|------|
| Training accuracy high, validation low | Overfitting | Increase regularization, more data, simplify the model, early stopping |
| Both training and validation low | Underfitting | Increase model complexity, more features, train longer |
| Loss diverges/oscillates | Learning rate too large | Lower the learning rate |
| Training loss barely decreases | Learning rate too small / insufficient capacity | Raise the learning rate, more layers/trees |
| Only validation loss rises again | Passed the overfitting onset | Early stopping, dropout, data augmentation |
| Score fluctuates widely across folds | Insufficient data / unstable split | Cross-validation, stratified split |
| Good in training but bad only in production | Data leakage / distribution difference | Remove leaking features, time-based split |
| Only the minority class keeps being wrong | Class imbalance | Class weights, resampling, threshold adjustment |

- Raising regularization increases bias and lowers variance, which is the response to overfitting; raising model capacity lowers bias and increases variance, which is the response to underfitting.

## Evaluation: Metrics Are a Translation of Business Cost

```text
            Predicted: positive    Predicted: negative
Actual positive │  TP (hit positive)  │  FN (missed positive) │  ← denominator of recall
Actual negative │  FP (false alarm)   │  TN (hit negative)    │
                   ↑ denominator of precision (TP+FP)

Precision = TP / (TP + FP)      "Of what was called positive, the true ones"
Recall    = TP / (TP + FN)      "Of the true positives, the ones found"
F1        = 2 · P · R / (P + R) "Harmonic mean of precision and recall"
Accuracy  = (TP + TN) / total   "Don't trust it when imbalanced"
FPR       = FP / (FP + TN)      x-axis of the ROC curve
```

| Metric | When |
|------|------|
| Accuracy | Balanced data only |
| Precision | When FP cost is large (spam) |
| Recall | When FN cost is large (disease/fraud) |
| F1 | Imbalanced, balancing FP and FN |
| ROC-AUC | Comparing models independent of the threshold |
| PR-AUC | Extreme imbalance |
| RMSE / MAE | Sensitive to large errors / robust to outliers (regression) |

Model selection and threshold decision are two separate steps. First choose the "model that ranks well" with a threshold-independent metric like AUC, then set the operating threshold that fits the FP/FN costs afterward. Even if the cost structure changes, you only need to adjust the threshold without retraining. Debugging splits as SageMaker Debugger (tensors, gradients, and overfitting in the training process) and, for bias and explainability, Clarify (group fairness, SHAP).

> ⚠️ **Pitfall**: Lowering the threshold raises recall and lowers precision, and raising it raises precision and lowers recall, a **trade-off every time**. "Raise both at once" is impossible through threshold adjustment alone.

## Exam Clue Keyword → Answer Translation Table

### Data Shape Clues

| Clue in the stem | Answer to pick |
|---|---|
| "Customer table of rows and columns", "mixed missing values and categories" | XGBoost |
| "High-dimensional sparse vectors", "linear baseline" | Linear Learner |
| "One label per photo" | Image Classification (CNN) |
| "Down to the location inside the image" | Object Detection |
| "Forecast weekly sales for hundreds of stores" | DeepAR |
| "Sentiment classification of review text", "word vectors" | BlazingText |
| "Relationship embedding of user-item pairs" | Object2Vec |
| "Group documents into topics without labels" | LDA / NTM |
| "Group customers without labels" | K-Means |
| "Detect abnormal spikes without labels" | Random Cut Forest |
| "Too many features, so training is slow" | PCA |

### Symptom and Requirement Clues

| Clue in the stem | Answer to pick |
|---|---|
| "Only training accuracy is high, validation is low" | Overfitting → regularization, dropout, early stopping |
| "Both training and validation are low" | Underfitting → increase complexity, features, training amount |
| "Loss becomes NaN or oscillates" | Learning rate too large → reduce it |
| "Want to reduce the number of features automatically" | L1 regularization |
| "Many correlated features, so coefficients are unstable" | L2 regularization |
| "A good combination with few training jobs" | Bayesian optimization (AMT default) |
| "Want to kill bad training jobs early" | Hyperband strategy |
| "Automatically detect vanishing gradients and overfitting during training" | SageMaker Debugger |
| "Explain fairness between groups and feature contributions" | SageMaker Clarify (SHAP) |
| "Data is small, so use a pretrained model" | Transfer learning (fine-tuning) |

### Metric Clues

| Clue in the stem | Answer to pick |
|---|---|
| "Blocking legitimate mail as spam is fatal" | Precision |
| "Missing cancer or fraud is fatal" | Recall |
| "Positives are only 0.3%" | PR-AUC (+ Recall) |
| "Compare models regardless of the threshold" | ROC-AUC |
| "Bigger penalty for large errors" | RMSE |
| "Many outliers distort the error metric" | MAE |
| "Accuracy is 99% yet useless" | Imbalance → switch to F1/PR-AUC |

## Confusing Pairs Comparison Table

| Comparison | Key difference |
|------|------|
| Supervised vs unsupervised | Labels present vs absent |
| Classification vs regression | Categorical output vs continuous output |
| **XGBoost vs Linear Learner** | Nonlinear boosted trees, handles missing values natively vs linear model, needs scaling, strong on high-dimensional sparse data |
| **XGBoost vs deep learning** | Structured tabular data vs images/sequences/text |
| **BlazingText vs Object2Vec** | Word- and document-level classification/embeddings vs relationship embeddings of arbitrary object **pairs** |
| **LDA vs NTM** | Probabilistic generative model (non-neural) vs neural-network-based topic model (can use GPU) |
| **K-Means vs KNN** | Unsupervised clustering (no labels) vs supervised classification/regression (decides from neighbor labels) |
| **RCF vs autoencoder anomaly detection** | Tree-based anomaly score, streaming vs reconstruction error, requires training on normal data |
| **CNN vs RNN vs Transformer** | Spatial local patterns vs sequential context vs long-range dependencies via attention and parallel training |
| **Sigmoid vs Softmax** | One independent probability (binary, multi-label) vs a vector summing to 1 (exclusive multi-class) |
| **Overfitting vs underfitting** | Only validation is low (high variance) vs both are low (high bias) |
| **L1 vs L2** | Pushes coefficients to 0 (sparse, feature selection) vs shrinks coefficients (spreads across correlated features) |
| **Bayesian vs Random vs Grid** | Efficiency from using history vs random parallel vs exhaustive search (combinatorial explosion) |
| **Precision vs Recall** | Suppress false alarms (FP) vs suppress misses (FN) |
| **ROC-AUC vs PR-AUC** | Comparison for balanced to moderately imbalanced vs more honest under extreme imbalance |
| **RMSE vs MAE** | Squared so sensitive to large errors vs absolute value so robust to outliers |
| **Debugger vs Clarify** | Training process (tensors, gradients, convergence) vs bias and explainability (fairness, SHAP) |

## Typical Question Forms in Domain 3

| Question form | What the stem looks like | How to solve it |
|---|---|---|
| **Algorithm selection** | Data shape + prediction target | Narrow down in the order data shape → problem type → built-in |
| **Activation/loss matching** | Neural network output-layer design | First check the number of classes and whether they are exclusive |
| **Overfitting diagnosis** | Two numbers: training/validation scores | A gap means overfitting; both low means underfitting |
| **Metric selection** | Which of FP or FN cost is larger | Choose the metric that reduces the larger cost |
| **Tuning strategy** | Mentions of budget, job count, efficiency | Efficiency = Bayesian, early stopping = Hyperband |
| **Debugging/explanation requirement** | "Why did it predict this?", "Is it fair?" | Training process = Debugger, bias and contribution = Clarify |

## Self-Check Questions

1. With no labels, you want to group customers into natural clusters? → **K-Means (unsupervised clustering)**
2. A strong default for classifying structured tabular data? → **XGBoost**
3. The built-in algorithm for time-series demand forecasting? → **DeepAR**
4. Output activation for multi-class classification? → **Softmax**
5. Training accuracy 99%, validation 70%? → **Overfitting → regularization, data augmentation, early stopping**
6. AMT's efficient default search strategy? → **Bayesian optimization**
7. Direction of the objective metric for regression tuning? → **Minimize (RMSE, etc.)**
8. The service that automatically detects vanishing gradients during training? → **SageMaker Debugger**
9. Output layer when several tags are attached to one image at the same time? → **Sigmoid per label**
10. The regularization that automatically reduces the number of features? → **L1 (Lasso)**
11. The main metric for classification with a 0.3% positive ratio? → **Recall + PR-AUC**
12. The metric to look at instead of RMSE in regression with many outliers? → **MAE**
13. What happens to precision and recall when you lower the threshold? → **Recall up, precision down (always a trade-off)**

In the next note we cover the last domain, **ML implementation and operations (Domain 4)**, and the end-to-end scenarios that cut across all four domains.

## 📖 Glossary

- **Hyperparameter**: A setting a person decides before training. Distinguished from the weights (parameters) obtained by training.
- **Overfitting / underfitting**: A state that fits only the training data well and is weak on new data / a state that cannot even fit the training data.
- **Bias-variance trade-off**: The trade-off in which simplifying the model increases bias and making it complex increases variance.
- **Regularization**: A technique that prevents overfitting by penalizing weights so they can't grow large. L1 pushes them to 0, and L2 shrinks them overall.
- **Early stopping**: Halting training when validation loss stops improving, preventing both overfitting and waste.
- **Bayesian optimization**: A search method that infers and picks the next hyperparameters to test based on the results of trials so far.
- **Confusion matrix**: A 2×2 table crossing actual and predicted. Most classification metrics are derived from TP, FP, FN, and TN.
- **PR-AUC**: The area under the precision-recall curve. When positives are extremely rare, it shows performance differences more honestly than ROC-AUC.
- **Transfer learning**: A method of taking a model pretrained on large-scale data and fine-tuning it with a small amount of data.
- **SageMaker Debugger / Clarify**: A tool that catches tensor and gradient anomalies in the training process / a tool that explains bias in data and models and prediction contributions.

---

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
