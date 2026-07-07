# Day 2 - ML Problem Types and Evaluation Metric Fundamentals

A new project comes in: "Predict whether a customer will churn." The first thing an ML engineer must do is not write code, but determine **what kind of problem this is**. Whether it is a classification problem or regression, and whether labels exist or not, completely changes which algorithms and evaluation metrics you can use. If you misidentify the problem type, every subsequent choice goes wrong.

Today we classify ML problems by learning paradigm (supervised/unsupervised/reinforcement) and by output form (classification/regression/clustering), and look at what each of the core metrics for evaluating classification models — accuracy, precision, recall, F1, and AUC — actually measures, and when to use which. This is the core of MLA-C01 Domain 2 (Model Development).

## Learning Paradigm: Are There Labels, or Rewards?

ML algorithms split into three branches depending on "what they learn from."

| Learning paradigm | Learning signal | Typical problems | AWS built-in examples |
|----------|----------|----------|--------------|
| Supervised | Ground-truth labels | Classification, regression | XGBoost, Linear Learner |
| Unsupervised | None (structure discovery) | Clustering, dimensionality reduction, anomaly detection | K-Means, PCA, RCF |
| Reinforcement | Reward | Sequential decision-making | SageMaker RL |

The decision rule is simple. **If there are labels, it is supervised; if not, unsupervised; if it maximizes reward through trial and error, it is reinforcement learning.** "Customer churn prediction" has historical churn outcomes (labels), so it is supervised learning. "Grouping customers into similar segments" has no ground-truth groups, so it is unsupervised (clustering). "A game agent maximizing its score" is reinforcement learning.

> 💡 **Related theory**: Supervised learning is the problem of approximating a function f(X)=Y from inputs X to outputs Y. Because labeling is expensive, semi-supervised learning (learning from few labels) and self-supervised learning (generating labels from the data itself — the training approach behind large language models) have become important in practice. This label-cost problem is exactly why AWS SageMaker Ground Truth exists as a service that automates and outsources labeling.

## Output Form: Classification vs. Regression vs. Clustering

Supervised learning splits again into two, depending on what the output is.

- **Classification**: The output is a **discrete category**. "Churn/retain," "spam/ham," "dog/cat/bird"
- **Regression**: The output is a **continuous number**. "Tomorrow's revenue," "house price," "delivery time"

The flagship of unsupervised learning is **clustering**, which groups similar data points together without labels (e.g., customer segmentation).

```python
# Classification: churn prediction with XGBoost (output = probability → discrete label)
estimator = sagemaker.estimator.Estimator(
    image_uri=xgboost_image, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    hyperparameters={
        "objective": "binary:logistic",   # Binary classification
        "num_round": 100, "max_depth": 5,
    },
)

# For regression, you would only change the objective
#   "objective": "reg:squarederror"     # Continuous value prediction
```

Even with the same XGBoost, a single `objective` hyperparameter separates classification from regression. If you misidentify the problem type, things go wrong from this very point.

> 🔍 **Going deeper**: Even within classification, you must distinguish whether the output is a "probability" or a "label." `binary:logistic` returns a probability between 0 and 1, and converting it into a label requires a **threshold**. The default is 0.5, but if your business cannot afford to miss churning customers, you lower the threshold to classify more people as "at risk of churn." Threshold adjustment is the heart of the precision-recall trade-off we look at next.

## The Starting Point of Classification Evaluation: The Confusion Matrix

To evaluate a classification model, you first need to understand the **confusion matrix** — a 2x2 table crossing predictions with actuals.

```
                 Actual Positive       Actual Negative
Predicted Positive   TP (True Positive)    FP (False Positive)
Predicted Negative   FN (False Negative)   TN (True Negative)
```

In the "churn prediction" example: TP = correctly predicting a churner as churn, FP = wrongly flagging a retained customer as churn, FN = missing a churner, TN = correctly predicting a retained customer as retained. Every metric is a combination of these four cells.

## The Accuracy Trap, and Precision & Recall

**Accuracy = (TP+TN) / total.** It is the most intuitive metric but also the most dangerous. On a dataset where fraudulent transactions are 0.1%, a model that predicts "all normal" still achieves 99.9% accuracy. This is called the **accuracy trap of imbalanced data**.

That is why we need two metrics focused on the positive class.

- **Precision = TP / (TP+FP)**: "Of those predicted positive, the fraction that are truly positive." Use when you want to reduce false alarms (FP).
- **Recall = TP / (TP+FN)**: "Of the true positives, the fraction you caught." Use when you want to reduce misses (FN).

The two are in a **trade-off** relationship. Lowering the threshold predicts more positives, so recall goes up and precision goes down; raising it does the opposite.

| Business scenario | More important metric | Reason |
|--------------|--------------|------|
| Cancer diagnosis | Recall | Missing a patient (FN) is fatal |
| Spam filter | Precision | Legitimate mail must not be flagged as spam (FP) |
| Fraud detection | Recall first, precision balanced | Missing fraud means losses; false alarms inconvenience customers |

> 📚 **Case study**: COMPAS was a recidivism prediction system used by US courts. A 2016 ProPublica investigation revealed that the rate of false positives (FP) — wrongly classifying defendants as "high risk of reoffending" — was about twice as high for Black defendants as for white defendants. Overall accuracy was similar across races, but the distribution of FP/FN differed by group. The lesson is that fairness problems invisible in a single accuracy number only become visible when examined at the level of the confusion matrix.

## F1 and AUC: Summarizing with a Single Number

When you care about both precision and recall, use the **F1 score** — the harmonic mean of the two.

```
F1 = 2 * (Precision * Recall) / (Precision + Recall)
```

The reason for using the harmonic mean is that F1 drops sharply if either one is low. With precision 0.9 and recall 0.1, the arithmetic mean is 0.5 but F1 is 0.18. It enforces "being good at only one side is not enough."

**AUC (area under the ROC curve)** measures the model's discriminative power independently of the threshold. The ROC curve plots recall (TPR) against the false positive rate (FPR) across all thresholds, and the area under it is the AUC.

- AUC = 1.0: Perfect classification
- AUC = 0.5: Equivalent to random guessing
- AUC < 0.5: Effectively predicting in reverse

> 💡 **Related theory**: AUC can also be interpreted as "the probability that, given one randomly drawn positive sample and one negative sample, the model assigns a higher score to the positive one." Because it measures the model's inherent ranking ability before any threshold is set, it is useful in the model comparison stage when a threshold has not yet been chosen. However, on extremely imbalanced data AUC can look optimistic, so PR-AUC (the precision-recall curve) is used alongside it.

## Evaluation Metrics for Regression

Regression outputs continuous values, so there is no confusion matrix; instead you measure "how close the prediction is to the actual value."

- **MAE (Mean Absolute Error)**: The average of the absolute errors. Less sensitive to outliers.
- **MSE / RMSE (Mean Squared Error / its square root)**: Squares the errors, so it is sensitive to large errors. RMSE has the same units as the original values, making it easy to interpret.
- **R² (coefficient of determination)**: How much of the variance the model explains. Closer to 1 is better.

For problems where large errors must especially be avoided (e.g., inventory forecasting), use RMSE; if there are many outliers and robustness matters, use MAE.

## Wrapping Up

Two key takeaways today. First, ML problems are divided by learning paradigm (supervised/unsupervised/reinforcement) and output form (classification/regression/clustering), and identifying the problem type is the starting point for choosing algorithms and metrics. Second, when evaluating classification, do not be fooled by the single accuracy number — look at precision and recall from the confusion matrix, and pick the metric (F1, AUC) that fits the business context.

In the next article, we take a bird's-eye view of the tools that actually solve these problems — the entire AWS ML stack.

---

## 📝 연습 문제

**문제 1.** You want to predict customer churn using data that includes historical churn labels. What are the learning paradigm and output form of this problem?

A) Unsupervised learning, clustering  
B) Supervised learning, classification  
C) Reinforcement learning, regression  
D) Unsupervised learning, dimensionality reduction  

**정답: B**  
해설: Historical churn/retain labels exist, so it is supervised learning, and the output is a discrete category of "churn/retain," so it is classification. Clustering and dimensionality reduction are unsupervised learning without labels, and reinforcement learning is a reward-based sequential decision-making problem that does not fit this case.

---

**문제 2.** A model achieves 99.9% accuracy on a dataset where fraudulent transactions make up 0.1% of the total. Why can't this accuracy be trusted?

A) Because accuracy is a metric used only for regression  
B) Because on extremely imbalanced data, predicting "all normal" also yields 99.9%, so you must look at precision and recall  
C) Because very high accuracy always means overfitting  
D) Because accuracy is independent of the threshold  

**정답: B**  
해설: On data where only 0.1% is fraud, predicting every transaction as normal still yields 99.9% accuracy. This is the imbalanced-data trap where high accuracy appears even when the minority class (fraud) is never caught. You must look at precision, recall, F1, and PR-AUC, which focus on the positive class. Accuracy is a classification metric, high accuracy does not by itself mean overfitting, and accuracy does vary with the threshold.

---

**문제 3.** For a cancer diagnosis classification model, which evaluation metric should take top priority, and why?

A) Precision — because healthy people must not be misclassified as patients  
B) Recall — because false negatives (FN) that miss actual patients are fatal  
C) Accuracy — because the overall fraction correct matters most  
D) MAE — because the absolute value of the error matters  

**정답: B**  
해설: In cancer diagnosis, an FN that misses an actual patient by labeling them "healthy" is a matter of life and death, so recall (TP/(TP+FN)) takes top priority. Precision is a metric for reducing false positives (the burden of extra tests), so it has lower priority here; accuracy is misleading under imbalance; and MAE is a regression metric not used for classification.

---

**문제 4.** A model records precision 0.9 and recall 0.1. Why does the F1 score come out at 0.18, far below the arithmetic mean of 0.5?

A) Because F1 is the product of the two values  
B) Because F1 is a harmonic mean, it drops sharply when either value is low  
C) Because the F1 calculation is wrong  
D) Because F1 reflects only recall  

**정답: B**  
해설: F1 is the harmonic mean of precision and recall, so when either one is low, the score is dragged down sharply. This is by design, to enforce "being good at only one side is not enough." F1 is not the product of the two values, the calculation is correct, and it reflects both precision and recall.

---

**문제 5.** Which is the correct interpretation of a classification model with an ROC-AUC of 0.5?

A) It classifies perfectly  
B) Its discriminative power is equivalent to random guessing  
C) It is predicting in reverse  
D) Its precision is 100%  

**정답: B**  
해설: AUC 0.5 means the model distinguishes positives from negatives no better than random guessing. AUC 1.0 is perfect classification, and below 0.5 means predicting in reverse. AUC is a threshold-independent ranking-ability metric, so it does not map directly to any specific precision value.

---
