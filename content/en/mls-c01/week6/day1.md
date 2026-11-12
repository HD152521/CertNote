# Day 1 - Algorithm Selection: Mapping by Problem Type

## 📌 Key Takeaways

- Week 6 is the starting point of Domain 3 (Modeling). The exam is built so that you narrow down in this order: **ML problem type → algorithm family → SageMaker built-in**.
- There are exactly two primary criteria: **output form** (category / number / group / recommendation / anomaly / topic) and **presence of labels** (supervised / unsupervised).
- The secondary filter is **data form**. If you see the words "text, image, time series, sparse," plain XGBoost drops out of the candidates.
- On imbalanced data, accuracy is a trap. Switch to precision, recall, F1, and PR-AUC.
- Even with the same type, **data size, sparsity, interpretability, and training cost** narrow the final candidate down to one.

## Translating a Business Problem into an ML Type

The first decision in modeling is "which algorithm to use," and before it there must always come the **translation of the ML problem type**. Exam passages almost always give the problem in business language, so converting it into a standard ML type is step 1.

```text
"Identify customers who will churn in advance"      → binary classification (churn yes/no)
"Sort email into spam / normal / promotional"       → multiclass classification
"Predict tomorrow's sales amount"                   → regression
"Automatically discover groups of similar users"    → clustering (unsupervised)
"Recommend products never seen before"              → recommendation / collaborative filtering
"Detect transactions that differ from the usual"    → anomaly detection
"Discover topics in a pile of documents"            → topic modeling (unsupervised)
```

There are three discriminating signals.

- **Are there labels (answers)?** If yes, supervised learning; if no, unsupervised.
- **Is the output a category or a number?** Category = classification, continuous number = regression.
- **Is it "discovering groups/patterns" or "predicting"?** Discovering = clustering/topics, predicting = classification/regression.

The boundary between supervised, unsupervised, and reinforcement is drawn by "the existence of answer labels." Classification and regression are supervised learning that learns input-output pairs, while clustering, dimensionality reduction, topic modeling, and (mostly) anomaly detection are unsupervised learning that finds structure without labels. Recommendation deals with a user-item interaction matrix and is closer to unsupervised from the collaborative filtering viewpoint, but if you use explicit ratings as the target it can also be viewed as supervised (regression). Reinforcement learning is a separate category that learns a policy from a reward signal (SageMaker RL).

### Algorithm Selection Decision Tree

```
                        [Business problem passage]
                                │
                  ┌─────── Are there labels? ───────┐
                Yes (supervised)                  No (unsupervised)
                  │                                │
      ┌───── Output form? ─────┐          ┌──── What do you want to do? ────┐
   Category    Number    Rank/preference  Find groups  Anomaly  Reduce dim  Find topics
     │           │           │              │          │        │        │
 Classification Regression Recommendation K-Means     RCF /     PCA    LDA / NTM
     │           │           │                      IP Insights
  ┌──┴──┐    ┌───┴───┐   Factorization
Tabular Text Tabular Time series  Machines
  │    │      │       │
XGBoost │  XGBoost  DeepAR
Linear  │  Linear
KNN  BlazingText
  │
Image → Image Classification
```

## Classification

When the output is a **discrete category**. It splits into binary, multiclass, and multilabel.

| Subtype | Example | Representative algorithm |
|------|------|------|
| Binary classification | Churn or not, fraud or not | XGBoost, Linear Learner, KNN |
| Multiclass classification | Product category classification | XGBoost, Linear Learner |
| Multilabel | Multiple tags on one image | Neural networks, Image Classification |
| Text classification | Sentiment/topic classification | BlazingText |

- Accuracy alone is often insufficient. For imbalanced data (1% fraud), look at precision, recall, F1, and AUC.
- The binary/multiclass distinction is specified by `predictor_type` (Linear Learner) or `objective` (XGBoost).

## Regression

When the output is a **continuous number**. Predicting sales amount, price, demand quantity, and so on.

- Candidates: **XGBoost (objective=reg:squarederror)**, **Linear Learner (predictor_type=regressor)**.
- When the time axis is the core, as in time-series demand forecasting, **DeepAR** (Day 3) or Amazon Forecast is more suitable than forcing it into regression.
- Metrics: RMSE, MAE, R². If you are sensitive to outliers, look at MAE as well.

## Clustering

Groups data into natural clusters without labels. Customer segmentation, document grouping.

- Candidate: **K-Means** (SageMaker built-in). You specify the number of clusters k in advance.
- Evaluation: since there is no external answer, choose k with internal metrics such as the silhouette coefficient and the elbow (WCSS).

## Recommendation

Predicts preferences from user-item interactions.

- Candidates: **Factorization Machines** (strong on sparse high-dimensional interactions), neural-network-based recommendation.
- Cold start and sparsity (most cells are empty) are the key difficulties.

## Anomaly Detection

Finds rare events that deviate from normal. It is commonly approached as an unsupervised problem with almost no labels.

- Candidates: **Random Cut Forest (RCF)**, **IP Insights** (entity-IP anomalies), and for streaming, Kinesis Data Analytics RCF.
- The imbalance is so extreme (0.1% anomalies) that it is often hard to solve as classification.

There is a trap: "Can't we solve anomaly detection as classification?" If there are enough anomaly labels and the patterns are stable, supervised classification is also possible, but in reality anomalies are extremely few and keep changing into new forms. In that case, unsupervised anomaly detection (RCF and the like), which learns only normal behavior and measures deviation, is more robust. On the exam, if you see the clue "almost no labels / new forms of anomaly," the RCF family is more likely to be the right answer than classification.

## At-a-Glance Mapping Table

| Problem type | Supervised / unsupervised | SageMaker built-in candidates | When to use | When not to use |
|------|------|------|------|------|
| Tabular classification/regression | Supervised | XGBoost, Linear Learner | Structured features, labels available | When the data is raw text or images |
| Distance-based classification/regression | Supervised | KNN | When "the most similar case" is the answer | When dimensionality is very high or inference latency matters |
| Clustering | Unsupervised | K-Means | Discover segments without labels | When answer labels to predict already exist |
| Recommendation (sparse interactions) | Supervised/unsupervised | Factorization Machines | Sparse high dimensions blown up by one-hot encoding | Small dense tabular data |
| Text classification/embedding | Supervised/unsupervised | BlazingText | Document classification, word vectors | Numeric structured data |
| Image classification | Supervised | Image Classification | Image → label | When object location is also needed (Object Detection) |
| Time-series forecasting | Supervised | DeepAR | Many related time series, probabilistic forecasts | Simple regression where the time axis is meaningless |
| Anomaly detection | Unsupervised | Random Cut Forest, IP Insights | Rare events without labels | When anomaly labels are plentiful and the patterns are fixed |
| Dimensionality reduction | Unsupervised | PCA | Hundreds of correlated features | When interpretable original features are essential |
| Topic modeling | Unsupervised | LDA, NTM | Discover topics in documents | When category labels already exist (classification) |

## Metric Interpretation Table: Once the Type Is Set, the Metric Is Set

| Metric | Calculation | What a high value means | Situation to prioritize | Pitfall |
|---|---|---|---|---|
| Accuracy | (TP+TN)/total | Right often overall | Only when classes are balanced | On imbalanced data, "all negative" still gets 99%+ |
| Precision | TP/(TP+FP) | Few false alarms | False-alarm cost is high (spam blocking, marketing) | Easy to raise by predicting only a few as positive |
| Recall | TP/(TP+FN) | Few misses | Miss cost is high (fraud, disease) | Predicting everything as positive gives 1.0 |
| F1 | Harmonic mean of precision and recall | Good balance of the two | When the two costs are similar | Hides which side is the problem |
| ROC-AUC | Area under the TPR-FPR curve | Threshold-independent discriminative power | Threshold undecided, comparing models | Overly optimistic under extreme imbalance |
| PR-AUC | Area under the precision-recall curve | Discriminative power for the minority class | Extreme imbalance (positives under 1%) | The value changes when the class ratio changes |
| RMSE | Square root of the mean squared error | Few large errors | Regression, when you want to penalize large errors heavily | Sensitive to outliers |
| MAE | Mean absolute error | Small average error | Regression, when robustness to outliers is needed | Treats large errors leniently |

> ⚠️ **Pitfall**: If the passage says "fraud is 1% of the total," any answer choice that includes accuracy is wrong. Even guessing everything as normal yields 99%. In this case the answer shifts to recall (we cannot afford to miss) or PR-AUC.

## Preprocessing Requirements by Algorithm

Even with the same problem type, preprocessing requirements differ. The exam repeatedly asks "is scaling needed?"

| Algorithm family | Representative built-in | Scaling | Categorical encoding | Missing values |
|---|---|---|---|---|
| Tree boosting | XGBoost | Not needed (scale-invariant) | Numeric conversion needed | Can handle internally |
| Linear model | Linear Learner | Needed (normalization option provided) | Needed | Pre-processing needed |
| Distance-based | KNN, K-Means | Mandatory | Needed | Pre-processing needed |
| Variance-based | PCA | Needed (centering and scaling recommended) | Needed | Pre-processing needed |
| Text | BlazingText | Not applicable (token input) | Not applicable | Not applicable |

Trees split by thresholds within a single feature, so **the result is the same as long as only the order of values is preserved** (invariance to monotonic transformations). Distance-based and linear models, on the other hand, feed feature values directly into distance and slope calculations, so scale differences distort the result directly. This single line separates every scaling question.

## Additional Considerations When Selecting an Algorithm

Selection does not end with the problem type.

| Axis to consider | Question to check | Effect on selection |
|---|---|---|
| Data form | Is it tabular, text, image, or time series? | Constrains the algorithm family most strongly |
| Data size and sparsity | Hundreds of millions of rows? Blown up by one-hot encoding? | Very large and sparse → Linear Learner/FM; medium-sized structured → XGBoost |
| Interpretability | Is an explanation needed for regulation or review? | Linear models are favorable (coefficient interpretation) |
| Training and inference cost | Is there a GPU and time budget? | Deep learning costs more. Avoid an overkill model for a simple problem (KISS) |
| Online/real-time requirement | Must you decide immediately on a stream? | Real-time anomaly detection is Kinesis Data Analytics RCF |
| Cold start | Are there new items or short histories? | DeepAR, which shares learning across related time series, is favorable |

### Use the Built-in Directly, or Go with a Managed AI Service?

If the passage says "no ML specialists," "launch quickly," or "we do not want to train and manage models ourselves," the answer is not a built-in algorithm but a higher-level AI service.

| Situation | SageMaker built-in path | Managed AI service path |
|---|---|---|
| Document sentiment and entity extraction | Train directly with BlazingText | Amazon Comprehend |
| Image labeling and face recognition | Train Image Classification | Amazon Rekognition |
| Time-series demand forecasting | Train and tune DeepAR | Amazon Forecast |
| Personalized product recommendation | Train Factorization Machines | Amazon Personalize |
| Custom features and full control needed | Built-in or your own container | Unsuitable (limits on customization) |

> ⚠️ **Pitfall**: There is a trap in the opposite direction too. If the passage says "we need to blend in our domain-specific features and tune it precisely," choosing a managed AI service is wrong. The **required level of control** separates the two paths.

## Question Clue → Answer Mapping Table

The fastest exam tip is to memorize a dictionary of "passage phrase → candidate algorithm."

| Passage clue | Direction it points | Reason |
|---|---|---|
| "The output is a category / yes-or-no" | Classification (XGBoost, Linear Learner) | Output form determines the type |
| "Predict an amount or quantity" | Regression (XGBoost, Linear Learner) | Continuous numeric output |
| "There are no labels / discover groups" | K-Means | Unsupervised signal |
| "Find topics / a pile of documents" | LDA, NTM | Topic modeling signal |
| "Time series / future values / seasonality" | DeepAR, Amazon Forecast | May not be ordinary regression |
| "Text" | BlazingText | Text-specific, not XGBoost |
| "Image" | Image Classification | Vision-specific, not XGBoost |
| "Extremely rare / new forms of abnormality" | Random Cut Forest | Few labels + changing patterns |
| "The account and IP combination differs from usual" | IP Insights | Specialized for entity-IP |
| "Too many features / compress" | PCA | Dimensionality reduction signal |
| "User-item / very sparse" | Factorization Machines | Sparse second-order interactions |

If you pick an algorithm name before confirming the output form, you will be wrong. "Customer segmentation" looks like clustering, but if segment labels already exist in the passage, multiclass classification is the answer. **The presence of labels flips supervised and unsupervised.**

## The 5-Step Order for Solving Scenarios

Specialty passages stack several constraints. Reading in the order below narrows most of them to one.

1. **Confirm the output form**: Is it category, number, group, recommendation, anomaly, or topic?
2. **Check for labels**: If there are none, every supervised-learning option is eliminated.
3. **Check the data form**: Is it tabular, text, image, time series, or sparse? Here the built-ins narrow to almost one.
4. **Apply constraints**: data size, interpretability, GPU and cost, real-time requirement.
5. **Check preprocessing and metric consistency**: See whether scaling requirements and imbalance metrics contradict the options.

In passages where constraints conflict, the answer is not the flashiest technology but **the choice that satisfies all the constraints at once**. If it violates even one constraint (for example, supervised classification when there are no labels), it is wrong regardless of its other merits.

Starting tomorrow, we dig deeply into each built-in algorithm in this mapping table (XGBoost, Linear Learner, K-Means, KNN), one at a time.

## 📖 Glossary

- **Supervised learning**: Learning a mapping from pairs of inputs and answer labels. Classification and regression belong here.
- **Unsupervised learning**: Learning that finds groups, anomalies, and topics from the structure of the data alone, without labels.
- **Multilabel**: A problem in which multiple answers are attached to one sample simultaneously. Several tags on one photo.
- **Cold start**: A situation, such as a new user, product, or store, where there is almost no history and prediction is difficult.
- **Sparsity**: A state in which most cells of a matrix are empty. The user-item rating matrix is the typical case.
- **Elbow (WCSS)**: A method of choosing k by increasing the number of clusters and finding the point where the decrease in within-cluster sum of squares bends.
- **Silhouette coefficient**: A clustering quality metric expressing, from -1 to 1, how well a point fits in its own cluster.
- **PR-AUC**: The area under the precision-recall curve. More honest than ROC-AUC on data where positives are extremely rare.
- **Monotonic transformation invariance**: The property that the result is the same as long as only the order of the magnitudes is preserved. Tree models have this, so scaling is unnecessary.
- **SageMaker built-in algorithm**: A collection of algorithms AWS provides as containers that can be trained with hyperparameters alone, without code.

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
