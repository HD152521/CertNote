# Day 2 - ML Problem Types and Evaluation Metrics Basics

A new project arrives: "Predict if customers will churn." The first thing an ML engineer must do is not write code, but **identify what kind of problem this is**. Whether it's a classification or regression problem, whether labels exist or not — all of this determines which algorithms and evaluation metrics are applicable. Misidentifying the problem type makes every subsequent choice wrong.

Today, we'll classify ML problems by learning approach (supervised/unsupervised/reinforcement) and output form (classification/regression/clustering), and explore the core metrics for evaluating classification models — accuracy, precision, recall, F1, and AUC — what each measures, and when to use which metric. This is core to MLA-C01 Domain 2 (Model Development).

## Learning Approaches: Do You Have Labels? Do You Have Rewards?

ML algorithms split three ways depending on "what they learn from."

| Learning Approach | Learning Signal | Representative Problem | AWS Built-in Examples |
|----------|----------|----------|--------------|
| Supervised Learning | Correct Labels | Classification, Regression | XGBoost, Linear Learner |
| Unsupervised Learning | None (Structure Discovery) | Clustering, Dimensionality Reduction, Anomaly Detection | K-Means, PCA, RCF |
| Reinforcement Learning | Reward | Sequential Decision-Making | SageMaker RL |

The criterion is simple: **If you have labels → supervised. No labels → unsupervised. Trial-and-error to maximize reward → reinforcement.** "Predicting customer churn" has historical churn labels, so it's supervised learning. "Grouping customers into similar segments" has no correct groups, so it's unsupervised (clustering). "A game agent maximizes score" is reinforcement learning.

> 💡 **Related Theory**: Supervised learning is the problem of approximating a function f(X)=Y from input X to output Y. Because labeling is expensive, semi-supervised learning (learning with few labels) and self-supervised learning (generating labels from data itself, the approach used in large language models) have become important in practice. AWS SageMaker Ground Truth automates and outsources labeling precisely because of this label cost problem.

## Output Form: Classification vs Regression vs Clustering

Supervised learning splits again based on what the output is.

- **Classification**: Output is **discrete categories**. "Churn/Retain," "Spam/Normal," "Dog/Cat/Bird"
- **Regression**: Output is **continuous numbers**. "Tomorrow's revenue," "House price," "Delivery time"

The representative unsupervised approach is **Clustering**, which groups data without labels into similar clusters (e.g., customer segmentation).

```python
# Classification: XGBoost for churn prediction (output = probability → discrete label)
estimator = sagemaker.estimator.Estimator(
    image_uri=xgboost_image, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    hyperparameters={
        "objective": "binary:logistic",   # Binary classification
        "num_round": 100, "max_depth": 5,
    },
)

# If it were regression, just change the objective
#   "objective": "reg:squarederror"     # Continuous value prediction
```

Even with the same XGBoost, a single hyperparameter `objective` determines whether it does classification or regression. Misidentifying the problem type causes divergence right here.

> 🔍 **Deeper Dive**: Even in classification, you must distinguish whether the output is "probability" or "label." `binary:logistic` returns probability 0~1, and converting to a label requires a **threshold**. Default is 0.5, but if losing churning customers is unacceptable, lower the threshold to classify more people as "churn risk." Threshold adjustment is exactly the core of the precision-recall tradeoff we'll see next.

## Classification Evaluation Starting Point: Confusion Matrix

To evaluate a classification model, you first need to understand the **confusion matrix**. It's a 2×2 table crossing predictions and actuals.

```
                 Actual Positive   Actual Negative
Predicted Positive  TP (True Positive)   FP (False Positive)
Predicted Negative  FN (False Negative)  TN (True Negative)
```

For the "churn prediction" example: TP = correctly identifying someone who churned, FP = incorrectly marking someone who stays as churning, FN = missing someone who actually churned, TN = correctly marking someone who stays as staying. All metrics are combinations of these four cells.

## The Accuracy Trap and Precision/Recall

**Accuracy = (TP+TN) / Total.** Most intuitive but most dangerous. In data where fraud is 0.1%, a model that says "all normal" scores 99.9% accuracy. This is the **accuracy trap in imbalanced data**.

That's why two metrics focused on the positive class are needed.

- **Precision = TP / (TP+FP)**: "Of what we called positive, what fraction is truly positive?" Use when you want to reduce false alarms (FP).
- **Recall = TP / (TP+FN)**: "Of truly positive cases, what fraction did we catch?" Use when you want to reduce misses (FN).

These have a **tradeoff** relationship. Lower the threshold → predict more positives → recall↑ precision↓. Raise it → opposite.

| Business Situation | More Important Metric | Reason |
|--------------|--------------|------|
| Cancer Diagnosis | Recall | Missing a patient (FN) is fatal |
| Spam Filter | Precision | Marking legitimate mail as spam (FP) is unacceptable |
| Fraud Detection | Recall first, Precision balanced | Missing fraud means loss, over-detection inconveniences customers |

> 📚 **Case Study**: COMPAS was a recidivism prediction system used by U.S. courts. A 2016 ProPublica investigation revealed that for Black defendants, the false positive rate of classifying them as "high recidivism risk" was roughly 2x higher than for White defendants. Overall accuracy was similar across races, but FP/FN distributions differed by demographic. Looking at a single accuracy number misses fairness issues that you catch when examining the confusion matrix by group.

## F1 and AUC: Summarizing to a Single Number

When you care about both precision and recall, use the **F1 score**, the harmonic mean of both.

```
F1 = 2 * (Precision * Recall) / (Precision + Recall)
```

The harmonic mean is used because if either value is low, F1 drops sharply. Precision 0.9 + Recall 0.1 has arithmetic mean 0.5 but F1 of 0.18. It enforces "being good at just one isn't enough."

**AUC (Area Under the ROC Curve)** measures a model's discriminative power independent of threshold. The ROC curve plots recall (TPR) and false positive rate (FPR) at every threshold; AUC is the area beneath it.

- AUC = 1.0: Perfect classification
- AUC = 0.5: Same as random guessing
- AUC < 0.5: Predicting backwards

> 💡 **Related Theory**: AUC can also be interpreted as "the probability that if you randomly sample one positive and one negative example, the model gives the positive a higher score." Since it measures a model's ranking ability before a threshold is set, it's useful in model comparison stages before thresholds are determined. However, on extremely imbalanced data, AUC can appear optimistically high, so PR-AUC (Precision-Recall curve) is also examined.

## Regression Evaluation Metrics

Regression works with continuous values, so there's no confusion matrix. Instead, "how close is the prediction to the actual?" is measured.

- **MAE (Mean Absolute Error)**: Average of absolute errors. Less sensitive to outliers.
- **MSE / RMSE (Mean Squared Error / Square Root)**: Squares errors, so sensitive to large errors. RMSE has the same units as the original, making interpretation easier.
- **R² (Coefficient of Determination)**: How much variance does the model explain? Closer to 1 is better.

For problems where large errors must be avoided (e.g., inventory forecasting), use RMSE. For robustness against outliers, use MAE.

## Summary

Two key takeaways today. First, ML problems divide by learning approach (supervised/unsupervised/reinforcement) and output form (classification/regression/clustering), and problem identification is the starting point for algorithm and metric selection. Second, don't trust a single accuracy number; examine precision and recall from the confusion matrix, and choose metrics (F1, AUC) that match your business context.

Next, we'll survey the tools that actually solve these problems — AWS's entire ML stack.

---

## 📝 연습 문제

**문제 1.** Historical churn labels exist in your data, and you want to predict customer churn. What are this problem's learning approach and output form?

A) Unsupervised learning, Clustering  
B) Supervised learning, Classification  
C) Reinforcement learning, Regression  
D) Unsupervised learning, Dimensionality Reduction  

**정답: B**  
해설: Historical churn/retention labels exist, so it's supervised learning. The output is "churn/retain," discrete categories, so it's classification. Clustering and dimensionality reduction are unsupervised (no labels), and reinforcement learning is reward-based sequential decision-making, which doesn't match this scenario.

---

**문제 2.** In data where fraud is 0.1% of transactions, your model scores 99.9% accuracy. Why can't this accuracy be trusted?

A) Accuracy is only for regression metrics  
B) In extremely imbalanced data, saying "all normal" yields 99.9%, so you must check precision and recall  
C) High accuracy always means overfitting  
D) Accuracy is independent of threshold  

**정답: B**  
해설: In data that's only 0.1% fraud, predicting all transactions as normal yields 99.9% accuracy. The model catches the minority class (fraud) not at all yet achieves high accuracy — the accuracy trap in imbalanced data. Focus on precision, recall, F1, and PR-AUC for the positive class. Accuracy is a classification metric; high accuracy doesn't necessarily mean overfitting; and accuracy varies with threshold.

---

**문제 3.** For a cancer diagnosis classification model, which evaluation metric should take priority, and why?

A) Precision — because misclassifying healthy people as patients is unacceptable  
B) Recall — because falsely labeling actual patients as healthy (False Negative) is fatal  
C) Accuracy — because the overall ratio of correct classifications matters most  
D) MAE — because absolute error magnitude matters  

**정답: B**  
해설: In cancer diagnosis, missing a real patient by marking them "healthy" (FN) is life-threatening, so recall (TP/(TP+FN)) is paramount. Precision reduces false positives (unnecessary follow-up burden), so it's lower priority here. Accuracy misleads in imbalanced situations, and MAE is a regression metric not used for classification.

---

**문제 4.** A model records precision 0.9 and recall 0.1. Why is the F1 score far lower at 0.18 than the arithmetic mean 0.5?

A) F1 is the product of the two values  
B) F1 is the harmonic mean, so low values in one dimension severely drag down the score  
C) The F1 calculation is wrong  
D) F1 only reflects recall  

**정답: B**  
해설: F1 is the harmonic mean of precision and recall, so if one is low, the score drops dramatically. This enforces "being strong in just one dimension isn't enough." F1 is not a product; the calculation is correct; and it reflects both metrics equally.

---

**문제 5.** A ROC-AUC value of 0.5 for a classification model means:

A) It classifies perfectly  
B) Its discriminative power is equivalent to random guessing  
C) It's predicting backwards  
D) It has 100% precision  

**정답: B**  
해설: AUC 0.5 means the model distinguishes positive/negative at random-guessing level. AUC 1.0 is perfect classification; AUC < 0.5 is backwards prediction. AUC is threshold-independent ranking ability and doesn't directly correspond to a specific precision value.

---
