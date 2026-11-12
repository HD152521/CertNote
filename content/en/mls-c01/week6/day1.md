# Day 1 - Algorithm Selection: Problem Type to Mapping

Week 6 begins Domain 3 (Modeling). The first decision in modeling is "which algorithm?" and MLS-C01 narrows this through **problem type → algorithm class → SageMaker builtin** sequencing. Today we learn to translate business problems into ML problem types and map algorithm candidates for each type.

## Translating Business Problems to ML Types

Test text is almost always given in business language. The first step is converting that to standard ML problem type.

```text
"Identify customers likely to churn early"         → Binary classification (churn yes/no)
"Categorize emails as spam/normal/promotional"    → Multi-class classification
"Forecast tomorrow's revenue amount"               → Regression
"Automatically discover similar user groups"       → Clustering (unsupervised)
"Recommend products never seen before"             → Recommendation / collaborative filtering
"Detect unusual transactions"                      → Anomaly detection
"Extract topics from document pile"                → Topic modeling (unsupervised)
```

Discriminating signals:
- **Do we have labels (answers)?** Yes → supervised, no → unsupervised
- **Is output categorical or numeric?** Categorical = classification, continuous numeric = regression
- **Is it "find groups/patterns" or "predict"?** Find = clustering/topic, predict = classification/regression

> 💡 **Related Theory**: Boundary between supervised/unsupervised/reinforcement lies on "existence of label." Classification/regression learn input-output pairs (supervised), clustering/dimensionality reduction/topic modeling/anomaly detection (mostly) find structure without labels (unsupervised). Recommendation handles user-item interaction matrices — technically unsupervised from a collaborative filtering view, but becomes supervised regression if using explicit ratings as target. Reinforcement learning is separate, learning policy from reward signals (SageMaker RL).

## Classification

Output is a **discrete category**. Binary/multi-class/multi-label types exist.

| Sub-type | Example | Representative Algorithms |
|------|------|------|
| Binary classification | Churn, fraud | XGBoost, Linear Learner, KNN |
| Multi-class classification | Product category | XGBoost, Linear Learner |
| Multi-label | Multiple tags per image | Neural networks, Image Classification |
| Text classification | Sentiment/topic | BlazingText |

Key metric: Accuracy alone often insufficient. Imbalanced data (fraud 1%) needs precision, recall, F1, AUC.

## Regression

Output is **continuous numeric**. Revenue, price, demand forecasting.

- Candidates: **XGBoost(objective=reg:squarederror)**, **Linear Learner(predictor_type=regressor)**
- Time series demand forecasts with time-axis priority fit **DeepAR**(Day 3) or Amazon Forecast better than forcing general regression
- Metrics: RMSE, MAE, R². If sensitive to outliers, watch MAE alongside

## Clustering

Bundle data into natural groups without labels. Customer segmentation, document grouping.

- Candidates: **K-Means**(SageMaker builtin). Specify cluster count k beforehand
- Evaluation: No external truth, so use internal metrics — silhouette coefficient, elbow (WCSS) to choose k

## Recommendation

Predict preferences from user-item interactions.

- Candidates: **Factorization Machines**(strong on sparse high-dimensional interactions), neural recommendation networks
- Core challenges: cold start, sparsity (most cells empty)

## Anomaly Detection

Find rare events deviating from normal. Often approached as unsupervised with scarce anomaly labels.

- Candidates: **Random Cut Forest (RCF)**, **IP Insights**(entity-IP anomaly), streaming via Kinesis Data Analytics RCF
- Extreme imbalance (anomaly 0.1%) makes supervised classification hard

> 💡 **Related Theory**: "Can't we solve anomaly detection as supervised classification?" is a common trap. If sufficient anomaly labels exist and patterns are stable, supervised classification works. Reality: anomalies are rare, constantly morphing into new forms. Unsupervised anomaly detection learning only normal (RCF etc.) and measuring deviation is more robust. Signal words "almost no labels / new anomaly forms" → RCF over supervised.

## At-a-Glance Mapping Table

| Problem Type | Supervised/Unsupervised | SageMaker Builtin Candidates |
|------|------|------|
| Tabular classification/regression | Supervised | XGBoost, Linear Learner |
| Distance-based classification/regression | Supervised | KNN |
| Clustering | Unsupervised | K-Means |
| Recommendation (sparse interaction) | Supervised/Unsupervised | Factorization Machines |
| Text classification/embedding | Supervised/Unsupervised | BlazingText |
| Image classification | Supervised | Image Classification |
| Time series forecasting | Supervised | DeepAR |
| Anomaly detection | Unsupervised | Random Cut Forest, IP Insights |
| Dimensionality reduction | Unsupervised | PCA |
| Topic modeling | Unsupervised | LDA, NTM |

## Additional Considerations in Algorithm Selection

Choice doesn't end at problem type. Also consider:

- **Data shape**: Table vs text vs image vs time series → strongly constrains algorithm class
- **Data size/sparsity**: Huge sparse data → Linear Learner/FM, mid-size tabular → XGBoost
- **Interpretability**: If regulation/explanation needed → linear models advantaged
- **Learning/inference cost**: DL = GPU/time cost↑. Avoid overkill for simple problems (KISS)

## Test Tips

- From text, first confirm **output form**(category/numeric/group/recommendation/anomaly) — narrows candidates by half
- "No labels / discover groups / find topics" → unsupervised signal
- "Time series / future value / seasonality" → DeepAR/Forecast signal, not general regression
- "Text / image" → BlazingText/Image Classification, not general XGBoost
- "Extremely rare / new anomaly forms" → RCF anomaly detection

## Summary

Today we covered the first gate of modeling — problem type identification and algorithm mapping. Core flow: **business problem → output form determines ML type → data shape/size/interpretability narrows algorithm**. Starting tomorrow, we dig deep into each builtin algorithm (XGBoost, Linear Learner, K-Means, KNN) from this mapping table.

---

## 📝 Practice Questions

**Question 1.** A telecom company wants to "identify in advance the customers likely to cancel next month." There are sufficient labels of whether past customers canceled. Which ML type is MOST appropriate for this problem?

A) Unsupervised clustering  
B) Binary classification  
C) Time series forecasting  
D) Topic modeling  

**Answer: B**  
Explanation: The output is two categories, "cancel/retain," and labels exist, so this is supervised binary classification. Because labels exist, it is not unsupervised clustering (A) or topic modeling (D), and because the output is not a continuous number, it is not time series forecasting (C) either.

---

**Question 2.** You want to catch fraud in credit card transactions. Fraud labels are almost nonexistent, and fraud techniques keep changing into new forms. Which approach is MOST suitable?

A) Train multiclass classification with normal/fraud labels  
B) Cluster customers into 5 groups with K-Means  
C) Unsupervised anomaly detection such as Random Cut Forest  
D) Predict transaction amounts with DeepAR  

**Answer: C**  
Explanation: Because labels are almost nonexistent and patterns keep changing, unsupervised anomaly detection, which measures deviation from normal, is robust. Supervised classification (A) is difficult because labels are scarce, clustering (B) does not match the goal of identifying fraud, and DeepAR (D) is for forecasting time series values.

---

**Question 3.** "I want to automatically group thousands of news articles by topic without human labels, and learn the words that make up each topic." Which algorithm family is MOST appropriate?

A) Image Classification  
B) Factorization Machines  
C) Linear Learner regression  
D) Topic modeling (LDA/NTM)  

**Answer: D**  
Explanation: Discovering topics in documents without labels and obtaining the word distribution for each topic is the classic task of topic modeling (LDA/NTM). Images (A), recommendation (B), and continuous-value regression (C) are unrelated to discovering text topics.

---

**Question 4.** Which of the following is a "regression problem whose output is a continuous number"?

A) Predicting tomorrow's store sales amount  
B) Classifying emails as spam/legitimate  
C) Grouping customers into similar clusters  
D) Detecting login patterns that differ from usual  

**Answer: A**  
Explanation: The sales "amount" is a continuous number, so this is regression. Spam/legitimate (B) is classification, clustering (C) is unsupervised clustering, and detecting abnormal patterns (D) is anomaly detection.

---

**Question 5.** As the first criterion for narrowing down the algorithm, which clue should you check first on the exam?

A) The instance type to use  
B) The programming language the team prefers  
C) The model's output form (category/number/group/recommendation/anomaly) and whether labels exist  
D) Service availability by Region  

**Answer: C**  
Explanation: The output form and the presence of labels determine the ML problem type, and once the type is set, the candidate algorithms narrow greatly. Instance type (A), language (B), and Region (D) are not the primary criteria for choosing an algorithm family.

---
