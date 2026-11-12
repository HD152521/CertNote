# Day 2 - ROC/AUC and Threshold Tuning: Reading Model Performance from Curves

## 📌 Key Takeaways

- A classifier outputs a **probability score**, not a label. Where you put the threshold t changes precision and recall wholesale.
- The **ROC curve** plots TPR (recall) vs FPR. The closer to the top-left, the better, and the diagonal is random guessing.
- **AUC** is the area under the curve, a threshold-independent summary of discriminative power. Interpretation: the probability that a random positive's score is higher than a random negative's.
- **With extreme imbalance, ROC is optimistic.** The huge TN in the FPR denominator dilutes the rise in FP, so look at **PR AUC (Average Precision)**.
- The practical pattern is a **two-stage separation**: pick the model by AUC, and set the operating threshold separately from the FP/FN cost structure.

## What the Threshold Changes

Yesterday's precision and recall were a cross-section computed at one particular threshold (usually 0.5). A classifier outputs a score like `P(Positive) = 0.73`, and you choose a threshold t so that `score ≥ t` is classified as Positive.

```text
Threshold ↓ (e.g., 0.3)  → more cases classified as Positive
   → recall ↑ (catches more positives), precision ↓ (FP increases)

Threshold ↑ (e.g., 0.7)  → classify Positive more conservatively
   → precision ↑ (only the sure ones), recall ↓ (more positives missed)
```

In other words, even a single model has countless (precision, recall) pairs depending on the threshold. A curve lays out all these pairs in one picture.

### Effect of Moving the Threshold on Each Cell

| Threshold manipulation | TP | FP | FN | TN | Recall/TPR | Precision | FPR |
|---|---|---|---|---|---|---|---|
| **Lower it** (0.5 → 0.3) | Increases | Increases | Decreases | Decreases | ↑ | ↓ (usually) | ↑ |
| **Raise it** (0.5 → 0.7) | Decreases | Decreases | Increases | Increases | ↓ | ↑ (usually) | ↓ |
| t = 0 (everything Positive) | Max | Max | 0 | 0 | 1.0 | Positive ratio | 1.0 |
| t = 1 (everything Negative) | 0 | 0 | Max | Max | 0 | Undefined | 0 |

> ⚠️ **Trap**: Changing the threshold does **not change AUC**, because AUC is already the result of sweeping all thresholds. An option like "find the threshold that maximizes AUC" is wrong.

## ROC Curve: TPR vs FPR

The ROC (Receiver Operating Characteristic) curve plots the two axes as the threshold moves.

```text
Vertical axis TPR (recall)         = TP / (TP + FN)   ← how many positives you catch
Horizontal axis FPR (false positive rate)  = FP / (FP + TN)   ← how often you falsely alarm on negatives

(0,0) classify everything as Negative (threshold = 1)
(1,1) classify everything as Positive (threshold = 0)
The closer to the top-left (0,1), the better the model
Diagonal y=x : random-guess level
```

```text
TPR
1.0 ┤        ╭──────────────●(1,1)  t=0
    │      ╭─╯          ╱
    │    ╭─╯          ╱
0.8 ┤   ╱           ╱      ← diagonal (y=x): AUC 0.5, random
    │  ╱          ╱
    │ ╱         ╱          ← bold curve: good model (bulges to top-left)
0.4 ┤╱        ╱
    ││      ╱
    ││    ╱      top-left (0,1) = perfect: detects every positive with no FP
0.0 ●────╱────────────────→ FPR
   (0,0) 0.0            1.0
    t=1
```

- The better the model, the more the curve shoots toward the top-left corner. The shape raises TPR quickly while barely increasing FPR.
- Lowering the threshold moves you along the curve from (0,0) toward (1,1). One point on the curve = one threshold.

## AUC: Area Under the Curve

AUC (Area Under the Curve) is the area under the ROC curve, summarizing model performance as a single number between 0 and 1, **independent of the threshold**.

```text
AUC = 1.0   perfect classification
AUC = 0.5   random guessing (the diagonal)
AUC < 0.5   worse than random (inverting the predictions improves it)
```

The intuitive interpretation of AUC: the **probability that the score of a randomly chosen positive sample is higher than the score of a randomly chosen negative sample**. That is, it measures how well the model "ranks" positives and negatives.

### AUC Value Interpretation Bands (generally used rough guidelines)

| AUC | Interpretation | Practical judgment |
|---|---|---|
| 0.90 ~ 1.00 | Excellent | A level at which you should first suspect data leakage |
| 0.80 ~ 0.90 | Very good | The band most production models aim for |
| 0.70 ~ 0.80 | Good | Usable but with much room to improve |
| 0.60 ~ 0.70 | Weak | Consider redesigning features and the model |
| ≈ 0.50 | Random | The model can't pick up the signal |
| < 0.50 | Inverted | Suspect flipped labels or a preprocessing error |

The fact that AUC is independent of the threshold is a double-edged sword. It is convenient for comparing the discriminative power of several models at once, but in actual operation you eventually have to pick one threshold. That is why on the exam, "compare the models" points to AUC, while "set the operating threshold" becomes a question of picking a specific point on the ROC/PR curve.

## PR Curve: More Honest Than ROC on Imbalanced Data

The PR (Precision-Recall) curve puts recall on the horizontal axis and precision on the vertical axis. On extremely imbalanced data, the PR curve gives a more honest picture than ROC.

```text
Reason: ROC's FPR = FP / (FP + TN)
When negatives (TN) overwhelmingly dominate (imbalance), even if FP grows,
it is buried under the huge TN denominator and FPR barely changes.
→ the ROC curve looks more optimistic than reality

PR curve's precision = TP / (TP + FP)
The FP increase is reflected directly in precision → it exposes the pain of imbalance as it is
```

```text
[10,000 samples / 100 positives (1%), 9,900 negatives (99%)]
[At a threshold where TP = 60, FP = 100]

ROC side:  FPR = FP / (FP + TN) = 100 / 9,900  = 0.0101  ← nearly 0, the curve doesn't move
PR  side:  Precision = TP / (TP + FP) = 60 / 160 = 0.375  ← collapses immediately

With the same 100 false alarms, ROC says "only 1% wrong"
while PR says "100 of 160 alerts, 62.5%, are bogus."
```

So for problems where positives are extremely rare, like fraud or disease, look at **PR AUC (Average Precision)** first.

### ROC vs PR Comparison Table

| Item | ROC curve | PR curve |
|---|---|---|
| Horizontal / vertical axis | FPR / TPR (recall) | Recall / precision |
| Does TN enter the denominator | **Yes** (FPR) | No |
| Baseline for a random model | Always **0.5** (diagonal) | **Positive ratio p** (horizontal line) |
| When the class ratio changes | Almost invariant | The baseline moves with it |
| Character under imbalance | Looks optimistic | Reveals the reality |
| Main use | Comparing discriminative power between models | Evaluating minority-class detection performance |
| Summary metric | ROC-AUC | PR AUC = Average Precision (AP) |

The basis for the rule "if imbalanced, use the PR curve" is in the denominator. ROC's FPR includes the majority class (TN) in the denominator and dilutes the FP increase, but PR's precision has only (TP+FP) in the denominator, so it doesn't hide false alarms on the minority class. Looking at what goes into the denominator lets you judge which curve is robust to the trap.

> ⚠️ **Trap**: Unlike ROC-AUC, PR AUC's **baseline is not 0.5**. If the positive ratio is 1%, a random model's AP is also about 0.01, so an AP of 0.30 is not "low" but 30 times random. You must not judge by the absolute value alone.

## Threshold Selection: The Business Tradeoff

Once the curves are drawn, you have to set the operating threshold. The method depends on the business cost structure.

```python
import numpy as np
from sklearn.metrics import precision_recall_curve

precision, recall, thresholds = precision_recall_curve(y_true, y_scores)

# Example: a regulatory environment that mandates recall of 90% or more
#     → among thresholds satisfying that constraint, pick the point with the highest precision
mask = recall[:-1] >= 0.90
best_idx = np.argmax(precision[:-1][mask])
chosen_threshold = thresholds[mask][best_idx]
```

Representative selection strategies:

| Situation | Threshold strategy |
|------|------|
| High FN cost (disease/fraud) | Guarantee a recall floor → lower the threshold |
| High FP cost (spam/recommendation) | Guarantee a precision floor → raise the threshold |
| FP and FN balanced | Pick the point that maximizes F1 |
| Cost can be converted to money | Pick the point that minimizes expected cost `cost_FP×FP + cost_FN×FN` |

Minimizing expected cost is the most principled method. If you know the dollar cost of one FP and one FN, you compute the total cost at each threshold on the curve and pick the cheapest point.

### Choosing a Threshold by Expected Cost

```text
[Fraud detection / 100 positives, 9,900 negatives]
[Assumption: 1 FP = $10 investigation cost,  1 FN = $500 loss]

Threshold  TP    FP     FN    Cost = 10×FP + 500×FN
 0.2     95   1,200    5    12,000 + 2,500 = $14,500
 0.3     88     500   12     5,000 + 6,000 = $11,000
 0.5     60     100   40     1,000 + 20,000 = $21,000
 0.7     35      20   65       200 + 32,500 = $32,700

→ Adopt t = 0.3, where total cost is minimal, as the operating threshold
   (it may not coincide with the point where F1 is maximal — because the costs are asymmetric)
```

- If the FN cost is much greater than the FP cost, the optimal threshold shifts **below 0.5**.
- Conversely, if FP is expensive (automatic account suspension, ad blocking), the optimum rises above 0.5.
- The default of 0.5 is merely an implicit assumption that "FP and FN costs are equal" — a number with no basis.

```
You must evaluate performance and set a threshold
├─ Is the goal "which of several models is better"?
│    ├─ Yes, balanced classes     → ROC-AUC
│    └─ Yes, extreme imbalance    → PR AUC (Average Precision)
├─ Is the goal "pick a single operating threshold"?
│    ├─ You know FP/FN dollar amounts  → point that minimizes expected cost
│    ├─ Regulatory recall floor        → highest precision among points meeting the constraint
│    ├─ Regulatory precision floor     → highest recall among points meeting the constraint
│    └─ No cost information            → point that maximizes F1
└─ The cost structure may change later
     └─ Fix the model by AUC and just readjust the threshold (no retraining needed)
```

### What AUC Doesn't Tell You: Probability Calibration

- AUC looks only at the **order** of the scores. Applying the same monotonic transformation to all scores leaves AUC unchanged.
- So even with a high AUC, the output probabilities can disagree with real frequencies. Whether "cases scored 0.8 are actually positive 80% of the time" is a separate question.
- If you plan to interpret the threshold as a probability (e.g., "block only above 90% risk") or multiply probabilities into an expected-cost calculation, you must check separately whether the model is calibrated.

A design that says "the AUC is 0.92, so expose the predicted probability to customers as a risk score as is" is dangerous. Even if the ranking is right, there is no basis to trust the absolute probability values.

## Usage in SageMaker

Built-in binary classifiers emit `validation:auc` as a training metric, so it can be used as the objective metric of Automatic Model Tuning. Also, since a SageMaker endpoint returns a probability score, the threshold cut is applied in the inference post-processing step.

```python
tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:auc",  # tune on discriminative power
    objective_type="Maximize",
    hyperparameter_ranges=ranges,
)
# The endpoint returns a 0.0~1.0 score → apply the business threshold in post-processing
score = float(predictor.predict(payload))
label = 1 if score >= chosen_threshold else 0
```

The practical pattern is a **two-stage separation**: choose a good model by AUC, then set the threshold separately to fit business constraints.

Model training/tuning and threshold decisions are decisions at different stages. If you tune with AUC as the objective metric, you get a "well-ranking model" that is not swayed by the threshold, and on top of that model you pick the threshold that fits the cost structure afterward. Thanks to this separation, even if the cost structure changes, you can adjust only the threshold without retraining the model.

## Question Cue → Answer Mapping

| Question cue | Answer to pick | Reason |
|---|---|---|
| "The threshold was lowered from 0.5 to 0.3" | Recall ↑, precision ↓ | More Positive predictions → FN decreases, FP increases |
| "The AUC is 0.5" | Random-guess level of discrimination | Corresponds to the ROC diagonal |
| "Extreme imbalance with 0.3% positives" | PR AUC (Average Precision) | ROC's FPR dilutes the FP increase |
| "You know the dollar cost of FP and FN" | Threshold minimizing expected cost | Total cost can be computed directly |
| "Compare models independent of the threshold" | `validation:auc`, Maximize | AUC is a threshold-independent ranking metric |
| "Regulation requires recall of 90% or more" | Highest precision among points meeting the constraint | Treat the floor as a constraint and optimize the rest |
| "The threshold that maximizes AUC" | **Wrong option** | AUC doesn't depend on the threshold |
| "The cost structure changes often" | Fix the model + readjust only the threshold | Benefit of separating the post-processing stage |
| "The endpoint returned 0.87" | Probability score → cut in post-processing | Converting to a label is the job of inference post-processing |

Tomorrow moves on to evaluation metrics for regression rather than classification models — RMSE, MAE, MAPE, R², and residual analysis.

## 📖 Glossary

- **Threshold**: The cutoff line that turns a probability score into a 0/1 label. It adjusts precision and recall without changing the model.
- **TPR (True Positive Rate)**: Another name for recall/sensitivity. `TP/(TP+FN)`.
- **FPR (False Positive Rate)**: The proportion of actual negatives falsely alarmed on. `FP/(FP+TN)`. Equal to `1 − specificity`.
- **ROC curve**: A curve connecting (FPR, TPR) as the threshold sweeps from 0 to 1. The closer to the top-left, the better.
- **AUC**: The area under the ROC curve. Equal to the probability that a random positive's score is higher than a random negative's.
- **PR curve**: A curve connecting (recall, precision). It honestly shows minority-class detection performance.
- **Average Precision (AP) / PR AUC**: The area under the PR curve. A random model's baseline is the positive ratio, not 0.5.
- **Ranking (discrimination)**: The ability to give positives higher scores. This is exactly what AUC measures.
- **Expected cost minimization**: A method of multiplying the dollar cost of one FP and one FN to pick the threshold with the smallest total cost.
- **Probability calibration**: Whether a score of 0.8 from the model is actually positive 80% of the time. AUC looks only at order, so it doesn't guarantee calibration.

## 📝 Practice Questions

**Question 1.** You lowered a classification model's threshold from 0.5 to 0.3. What change generally occurs?

A) Recall tends to increase and precision tends to decrease  
B) Both precision and recall increase  
C) Recall decreases and precision increases  
D) Neither metric changes  

**Answer: A**  
Explanation: Lowering the threshold classifies more samples as positive, catching more positives (recall up) but also increasing false positives (precision down), creating a trade-off. Both increasing (B) and recall decreasing (C) have the wrong direction, and changing the threshold does change the metrics (D is wrong).

---

**Question 2.** What does an AUC of 0.5 on an ROC curve mean?

A) The model classifies perfectly  
B) The data is perfectly balanced  
C) Precision and recall are equal  
D) The model's discriminative power is at the level of random guessing  

**Answer: D**  
Explanation: An AUC of 0.5 corresponds to the diagonal of the ROC and is equivalent to ranking positives and negatives randomly - meaningless discriminative power. Perfect is 1.0 (A), and it has nothing to do with data balance (B) or precision = recall (C).

---

**Question 3.** This is an extremely imbalanced fraud detection problem in which the positive class is 0.3% of the total. Which metric is more honest than ROC-AUC for evaluating model performance?

A) Simple accuracy  
B) FPR alone  
C) AUC of the PR curve (Average Precision)  
D) Training loss  

**Answer: C**  
Explanation: When negatives (TN) are overwhelming, the ROC's FPR dilutes the increase in FP and looks optimistic, so AP of the PR curve, which has no TN in its denominator, is more honest. Accuracy (A) masks imbalance, and FPR alone (B) and training loss (D) are inappropriate as performance summary metrics.

---

**Question 4.** You can estimate the cost of one FP and the cost of one FN in monetary terms. What is the most principled way to choose the operating threshold?

A) Always fix it at 0.5  
B) Find the threshold that maximizes AUC  
C) Find the threshold that unconditionally makes recall 1.0  
D) Find the threshold that minimizes the expected cost `cost_FP×FP + cost_FN×FN`  

**Answer: D**  
Explanation: If you know the costs in monetary terms, the most principled approach is to compute the total expected cost at each threshold on the curve and pick the minimum point. Fixing 0.5 (A) ignores cost, AUC is independent of the threshold so it cannot determine a threshold (B), and recall of 1.0 (C) sacrifices precision and makes cost explode.

---

**Question 5.** You want to compare the discriminative power of several candidate models with one number, independent of the threshold. Which is the MOST appropriate objective metric for SageMaker Automatic Model Tuning?

A) validation:accuracy  
B) validation:auc  
C) train:loss  
D) Number of FN at a fixed threshold  

**Answer: B**  
Explanation: AUC summarizes a model's ranking discriminative power from 0 to 1 independent of the threshold, so it suits model comparison and as a tuning objective metric. Accuracy (A) is weak on imbalance, training loss (C) does not reflect generalization, and FN at a specific threshold (D) is threshold-dependent.

---
