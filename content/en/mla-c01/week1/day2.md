# Day 2 - ML Problem Types and Evaluation Metric Basics

## 📌 Key Takeaways

- ML problems divide by **learning style** (supervised/unsupervised/reinforcement) and **output form** (classification/regression/clustering). Identifying which one you have is the starting point for every later choice.
- Identification rule: **labels present means supervised, no labels means unsupervised, learning from rewards means reinforcement**.
- Classification evaluation starts from the **confusion matrix (TP/FP/FN/TN)**. Looking at accuracy as a single number leads to wrong judgments.
- **Accuracy is a trap on imbalanced data**: with 0.1% fraud, "all normal" also scores 99.9%. Look at precision, recall, F1, and PR-AUC.
- The business decides the metric: **if a miss is fatal, use recall; if false alarms are costly, use precision**.

## Learning Style: Are There Labels, or Are There Rewards

When a new project hands you the request "predict whether customers will churn," the first thing an ML engineer should do is not write code but identify **what kind of problem this is**. If you pick the wrong problem type, every later choice of algorithm and metric goes off track.

ML algorithms fall into three branches based on "what they learn from."

| Learning style | Learning signal | Typical problems | AWS built-in examples |
|----------|----------|----------|--------------|
| Supervised | Answer labels | Classification, regression | XGBoost, Linear Learner |
| Unsupervised | None (discovers structure) | Clustering, dimensionality reduction, anomaly detection | K-Means, PCA, RCF |
| Reinforcement | Reward | Sequential decision-making | SageMaker RL |

Identification is simple.

- "Predict customer churn" → past churn outcomes (labels) exist → **supervised learning**
- "Group customers into similar clusters" → there are no ground-truth groups → **unsupervised (clustering)**
- "A game agent maximizes its score" → trial and error plus rewards → **reinforcement learning**

Supervised learning is the problem of approximating a function f(X)=Y from input X to output Y. Because labeling is expensive, in practice semi-supervised learning (training with few labels) and self-supervised learning (creating labels from the data itself, the way large language models are trained) have become important. This labeling cost is why Amazon SageMaker Ground Truth exists as a service that automates and outsources labeling.

## Output Form: Classification vs Regression vs Clustering

Supervised learning splits again in two depending on what the output is.

| Category | Classification | Regression | Clustering |
|------|----------------------|-------------------|-------------------|
| Labels | Yes | Yes | No |
| Output | Discrete category | Continuous number | Group number |
| Examples | Churn/retain, spam/normal | Tomorrow's sales, house prices | Customer segments |
| Typical metrics | Precision/Recall/F1/AUC | RMSE, MAE, R² | Silhouette, Inertia |
| XGBoost objective | `binary:logistic` | `reg:squarederror` | (not applicable) |

```python
# Classification: predicting churn with XGBoost (output = probability → discrete label)
estimator = sagemaker.estimator.Estimator(
    image_uri=xgboost_image, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    hyperparameters={
        "objective": "binary:logistic",   # binary classification
        "num_round": 100, "max_depth": 5,
    },
)

# For regression, you only change the objective
#   "objective": "reg:squarederror"     # continuous value prediction
```

Even with the same XGBoost, a single `objective` hyperparameter separates classification from regression. If you misidentify the problem type, things go wrong from here.

Even within classification, you must distinguish whether the output is a "probability" or a "label." `binary:logistic` returns a probability from 0 to 1, and converting that to a label requires a **threshold**. The default is 0.5, but if the business can't afford to miss churners, you lower the threshold to classify more people as "churn risk." Threshold adjustment is the heart of the precision-recall trade-off we look at next.

## The Starting Point of Classification Evaluation: The Confusion Matrix

To evaluate a classification model, you first need to understand the **confusion matrix**. It is a 2x2 table crossing predictions with actuals.

```
                 Actual Positive       Actual Negative
Predicted Pos.   TP (true positive)    FP (false positive)
Predicted Neg.   FN (false negative)   TN (true negative)

              ┌──────────── Precision = TP / (TP + FP)  ← based on the predicted-positive row
              │
   TP  FP ────┘
   FN  TN ────┐
              │
              └──────────── Recall = TP / (TP + FN)  ← based on the actual-positive column
```

Using the "churn prediction" example, you read it like this.

| Cell | Meaning | In churn prediction |
|----|------|-------------|
| TP | Correctly called a positive a positive | Predicted a churner as churn |
| FP | Wrongly called a negative a positive | Sent a coupon in vain to someone who would stay |
| FN | Missed a positive | Missed a churner, so the customer is lost |
| TN | Correctly called a negative a negative | Predicted a retained customer as retained |

Every metric is a combination of these four cells.

## The Accuracy Trap and Precision/Recall

**Accuracy = (TP+TN) / total.** The most intuitive, and the most dangerous. On data where fraud is 0.1%, even a model that guesses "all normal" gets 99.9% accuracy. This is called the **accuracy trap on imbalanced data**.

So we need two metrics focused on the positive class.

- **Precision = TP / (TP+FP)**: "Of what it called positive, the share that is truly positive." Use it when you want fewer false alarms (FP).
- **Recall = TP / (TP+FN)**: "Of the truly positive cases, the share it caught." Use it when you want fewer misses (FN).

The two are in a **trade-off**. Lowering the threshold predicts more positives, so recall goes up and precision goes down; raising it does the opposite.

| Business situation | Costlier error | More important metric | Reason |
|--------------|------------|--------------|------|
| Cancer diagnosis | FN (missing a patient) | Recall | Missing one is directly life-threatening |
| Spam filter | FP (flagging normal mail as spam) | Precision | Important mail must not vanish |
| Fraud detection | FN (missing fraud) | Recall first, balanced with precision | Preventing losses vs inconveniencing legitimate customers |
| Ad targeting | FP (showing ads to uninterested people) | Precision | Wasted budget |
| Equipment failure prediction | FN (missing a failure) | Recall | Line stoppage costs more than inspection |

**One-line rule for choosing a metric**: prioritize the metric that **reduces whichever of FN and FP is more expensive for the business**.

COMPAS is a recidivism prediction system that US courts used. A 2016 ProPublica report revealed that the rate of false positives (FP), wrongly classifying defendants as "high risk of reoffending," was about 2x higher for Black defendants than for white defendants. Overall accuracy was similar across races, but the distribution of FP/FN differed by group. The lesson: a fairness problem that a single accuracy number misses can only be caught by looking at the confusion matrix level.

## F1 and AUC: Summarizing in a Single Number

When you care about both precision and recall, you use the **F1 score**. It is their harmonic mean.

```
F1 = 2 * (Precision * Recall) / (Precision + Recall)
```

The reason for a harmonic mean is that F1 drops sharply if either one is low. With precision 0.9 and recall 0.1, the arithmetic mean is 0.5 but F1 is 0.18. It enforces "being good on only one side isn't enough."

**AUC (area under the ROC curve)** measures a model's discriminating power regardless of threshold. The ROC curve plots recall (TPR) against the false positive rate (FPR) at every threshold, and the area under it is the AUC.

| AUC value | Interpretation |
|--------|------|
| 1.0 | Perfect classification |
| 0.7-0.9 | A usable level commonly seen in practice |
| 0.5 | Same as random guessing |
| < 0.5 | Effectively predicting backwards (flipping it would actually be better) |

**Which metric to look at when**: this table applies directly to exam identification questions.

| Situation | Metric to look at | Reason |
|------|------------|------|
| Classes are balanced | Accuracy | Intuitive with little distortion |
| Extreme imbalance | PR-AUC, F1, Recall | Accuracy and ROC-AUC look optimistic |
| Threshold not chosen yet | ROC-AUC | Compares ranking ability independent of threshold |
| Threshold already chosen | Precision/Recall/F1 | Performance at actual operating time |
| Error costs are asymmetric | The metric matching the costly error | Minimize business loss |

AUC can also be interpreted as "the probability that, when you randomly pick one positive sample and one negative sample, the model gives the positive a higher score." Because it looks at the model's own ranking ability before a threshold is set, it is useful at the model comparison stage when the threshold isn't decided yet. However, on extremely imbalanced data AUC can come out optimistic, so also look at PR-AUC (the precision-recall curve).

## Regression Evaluation Metrics

Regression deals with continuous values, so there is no confusion matrix; it measures "how close the prediction is to the actual."

| Metric | Calculation | Outlier sensitivity | Unit | When to choose |
|------|------|-------------|------|------------|
| MAE | Mean of absolute errors | Low (robust) | Same as the original value | When there are many outliers and you want to reduce their influence |
| MSE | Mean of squared errors | High | Squared unit | When you want to penalize large errors heavily |
| RMSE | Square root of MSE | High | Same as the original value | MSE's advantages plus easy interpretation |
| R² | Proportion of variance explained | Medium | Unitless (0-1) | How much of the variation the model explains |

- For problems where large errors must be especially avoided (inventory forecasting, etc.), use **RMSE**.
- If there are many outliers and you need robustness, use **MAE**.
- When comparing models across different datasets, the unitless **R²** is convenient.

> ⚠️ **Pitfall**: RMSE and MAE share the property that "lower is better," but you must not compare their magnitudes directly. On the same data RMSE is always at least MAE, and a large gap between them is a signal that a few large errors (outliers) exist.

## Confusion Matrix in Numbers

Calculating once sticks longer than memorizing metrics. Suppose a fraud detection model applied to 1,000 transactions gives the following.

```
                 Actual fraud (30)    Actual normal (970)
Predicted fraud   TP = 18              FP = 42
Predicted normal  FN = 12              TN = 928
```

| Metric | Calculation | Value | How to read it |
|------|------|-----|--------|
| Accuracy | (18+928)/1000 | 0.946 | Guessing all normal would give 0.97, so it means nothing |
| Precision | 18/(18+42) | 0.300 | Only 30% of what it flagged as fraud is real |
| Recall | 18/(18+12) | 0.600 | Caught only 60% of actual fraud, missed 12 |
| F1 | 2×0.3×0.6/(0.3+0.6) | 0.400 | Dragged down heavily by the low precision |

- Accuracy of 0.946 is even lower than the model that guesses "all normal" (0.970). **On imbalanced data, accuracy gives an illusion that can't even clear the baseline.**
- Lowering the threshold increases both TP and FP, moving toward higher Recall and lower Precision.
- If the loss from one fraud case is much larger than the handling cost of one false alarm, raising Recall is the right direction.

## Averaging Methods for Multiclass Classification

With three or more classes, you compute precision and recall per class and then average. The averaging method changes the conclusion.

| Averaging method | Calculation | Weight on minority classes | When |
|----------|------|----------------|------|
| Macro | Simple average of per-class metrics | High (all classes equal) | When minority classes matter just as much |
| Weighted | Average weighted by class sample count | Low | When you want overall performance to be representative |
| Micro | Pool all TP/FP/FN and calculate once | Low | Performance based on total prediction count |

> ⚠️ **Pitfall**: In multiclass classification with imbalanced classes, looking only at the weighted average hides minority-class failures behind majority-class performance. If the goal is "catching the minority class well," check the **macro average** or per-class metrics separately.

## What Happens When You Pick the Wrong Metric

| Wrong choice | Result |
|-----------|------|
| Accuracy on imbalanced data | A model that catches nothing is judged "good" |
| Precision first for cancer diagnosis | Flags only the certain patients as positive and misses many |
| Recall first for a spam filter | Blocks legitimate mail in bulk too |
| Accuracy for a regression problem | The calculation doesn't even apply |
| Looking only at ROC-AUC once the threshold is set | You don't know performance at actual operating time |

In the next article, we survey the tools that actually solve these problems: AWS's whole ML stack.

## 📖 Glossary

- **Label**: The answer attached to data. The value the model must predict, such as "this customer churned."
- **Confusion matrix**: A 2x2 table crossing predictions with actuals. The four cells TP, FP, FN, and TN produce every classification metric.
- **False positive (FP)**: Said yes when it was no. Sending normal mail to spam.
- **False negative (FN)**: Said no when it was yes. Letting fraud through as normal.
- **Precision**: Of what was called positive, the share that was actually right. A metric that reduces wasted shots.
- **Recall**: Of actual positives, the share caught. A metric that reduces misses.
- **F1 score**: The harmonic mean of precision and recall. If only one side is good, the score plunges.
- **Threshold**: The cut line that turns a predicted probability into positive/negative. Lowering it raises recall, raising it raises precision.
- **ROC-AUC**: A 0-1 measure of the "ability to give positives higher scores," independent of threshold. 0.5 is guessing level.
- **PR-AUC**: The area under the precision-recall curve. More honest than ROC-AUC on imbalanced data where positives are very rare.

## 📝 Practice Questions

**Question 1.** You want to predict customer churn using data that has past churn-outcome labels. What are the learning style and output form of this problem?

A) Unsupervised learning, clustering  
B) Supervised learning, classification  
C) Reinforcement learning, regression  
D) Unsupervised learning, dimensionality reduction  

**Answer: B**  
Explanation: Past churn/retain labels exist, so it is supervised learning, and because the output is the discrete category "churn/retain," it is classification. Clustering and dimensionality reduction are unsupervised learning without labels, and reinforcement learning is a reward-based sequential decision-making problem that doesn't fit this case.

---

**Question 2.** A model recorded 99.9% accuracy on data where fraudulent transactions are 0.1% of the total. Why can't this accuracy be trusted?

A) Accuracy is a metric used only for regression  
B) On extremely imbalanced data, guessing "all normal" also gives 99.9%, so you must look at precision and recall  
C) Accuracy that is too high is always overfitting  
D) Accuracy is independent of the threshold  

**Answer: B**  
Explanation: On data where only 0.1% is fraud, predicting every transaction as normal still yields 99.9% accuracy. This is the imbalanced-data trap where high accuracy appears even when the minority class (fraud) is not caught at all. You need to look at precision, recall, F1, and PR-AUC, which focus on the positive class. Accuracy is a classification metric, high accuracy is not automatically overfitting, and accuracy does vary with the threshold.

---

**Question 3.** For a cancer diagnosis classification model, which evaluation metric should take top priority, and why?

A) Precision, because normal people must not be wrongly labeled as patients  
B) Recall, because a false negative (FN) that misses an actual patient is fatal  
C) Accuracy, because the overall share correct matters most  
D) MAE, because the absolute value of the error matters  

**Answer: B**  
Explanation: In cancer diagnosis, an FN that misses an actual patient as "normal" is directly life-threatening, so recall (TP/(TP+FN)) comes first. Precision reduces false positives (the burden of additional tests), so it has lower priority here; accuracy misleads in imbalanced situations; and MAE is a regression metric not used for classification.

---

**Question 4.** A model recorded precision 0.9 and recall 0.1. Why does the F1 score come out at 0.18, far lower than the arithmetic mean of 0.5?

A) F1 is the product of the two values  
B) F1 is a harmonic mean, so it drops sharply when one value is low  
C) The F1 calculation is wrong  
D) F1 reflects only recall  

**Answer: B**  
Explanation: F1 is the harmonic mean of precision and recall, so if either one is low the score is pulled down sharply. This is meant to enforce "being good on only one side isn't enough." F1 is not the product of the two values, the calculation is correct, and it reflects both precision and recall.

---

**Question 5.** Which interpretation is correct for a classification model with a ROC-AUC of 0.5?

A) It classifies perfectly  
B) Its discriminating power is the same as random guessing  
C) It is predicting backwards  
D) Its precision is 100%  

**Answer: B**  
Explanation: An AUC of 0.5 means the model separates positives from negatives at the same level as random guessing. An AUC of 1.0 is perfect classification, and below 0.5 is the backwards-prediction case. AUC is a threshold-independent ranking ability metric, so it doesn't correspond directly to a specific precision value.

---
