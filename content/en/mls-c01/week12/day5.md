# Day 5 - D-Day Wrap-Up: Exam Structure, Time Allocation, Requirement Translation Tables, Trap Roundup

## 📌 Key Takeaways

- 65 questions / 180 minutes / pass at 750 (out of 1000). **There is no per-domain minimum**; the result is decided only by the overall scaled score.
- On Pass 1, start with the questions you are sure about at a pace of about 2 minutes each; when unsure, **answer immediately and flag it**. A blank scores zero, so always fill in an answer.
- The essence of every question is translating "requirement sentence → technique/service." Narrow it down along three axes: **operational burden, data shape, business cost**.
- Half of the traps are **reversed direction** (Sigmoid↔Softmax, Maximize↔Minimize) and half are **domain confusion** (Monitor↔Debugger↔Clarify).
- Accuracy on **Domain 3 (36%)**, the heaviest weight, moves your expected score the most.

Today we add no new knowledge. We only build an **operating manual you can use as-is in the exam room**.

## Exam Structure at a Glance

| Item | Details |
|------|------|
| Exam name | AWS Certified Machine Learning – Specialty (MLS-C01) |
| Number of questions | 65 questions (50 scored + 15 unscored, not identified) |
| Time | 180 minutes |
| Passing score | 750 / 1000 (scaled score) |
| Question types | Multiple choice (pick 1) + multiple response (pick 2-3) |
| Pass determination | Based on the overall scaled score (no per-domain minimum) |

| Domain | Weight |
|------|------|
| 1. Data Engineering | 20% |
| 2. Exploratory Data Analysis | 24% |
| 3. Modeling | 36% |
| 4. Machine Learning Implementation and Operations | 20% |

> 💡 **Related theory**: You pass with an overall scaled score of 750 or higher, with no per-domain minimum you can fail on. The 15 unscored questions are not marked, so treat every question with the same care. A scaled score is not a raw percentage correct; it is adjusted for question difficulty, so there is no fixed "get exactly N right and you pass." That means that rather than abandoning a specific domain, raising your accuracy in Domain 3 (36%), the most heavily weighted one, lifts your expected score the most.

## Time Allocation Strategy

| Phase | Recommendation |
|------|------|
| Pass 1 (all questions) | 65 questions × about 2 minutes = 130 minutes, start with the ones you're sure about |
| Flagging | If you're unsure, answer immediately and flag it — don't cling to it |
| Pass 2 (flagged) | Re-review with the remaining time (about 40 minutes) |
| Final review | Last 10 minutes, check for unmarked answers |

> 💡 **Related theory**: 180 minutes for 65 questions works out to about 2.8 minutes each, but the key is finishing easy questions in around a minute so you can pour the surplus into hard scenarios. The moment you spend more than 4 minutes on a single question, the expected loss grows. "If you're at least 70% confident, answer, flag it, and move on without regret" is the rule that protects your pace. A blank is worth zero, so if you run short on time, always fill in a best guess.

## Typical Question Shapes and Time Allocation by Domain

| Domain | Weight | Converted question count (weight × 65) | Typical question shape | Recommended pace |
|---|---|---|---|---|
| 1. Data Engineering | 20% | about 13 questions | Choosing ingestion/storage/ETL services | Clear clues → 1–1.5 minutes |
| 2. Exploratory Data Analysis | 24% | about 16 questions | Judging encoding, scaling, imbalance, leakage | 1.5–2 minutes |
| 3. Modeling | 36% | about 23 questions | Algorithm selection, tuning, metrics, overfitting diagnosis | 2–3 minutes; pour your time here |
| 4. ML Implementation and Operations | 20% | about 13 questions | Deployment type, safe rollout, monitoring, cost | 1.5–2 minutes |

## Requirement → Technique/Service Translation Table (Domains 1 and 2)

| Clue in the requirement sentence | Answer direction |
|------|------|
| "millisecond latency, multiple consumers, reprocessing" | Kinesis Data Streams |
| "load into S3 with minimal operational overhead" | Kinesis Data Firehose |
| "real-time SQL aggregation over a stream" | Kinesis Data Analytics |
| "ingest camera/video streams" | Kinesis Video Streams |
| "migrate an on-premises DB to AWS" | DMS |
| "synchronized transfer of large files" | DataSync |
| "central repository for a data lake" | S3 |
| "query S3 with SQL, serverless" | Athena |
| "large-scale structured analytics warehouse" | Redshift |
| "serverless ETL + schema catalog" | Glue (automatic schema inference = crawler) |
| "fine-grained control of a Hadoop/Spark cluster" | EMR |
| "results as a BI dashboard" | QuickSight |
| "few missing values, random" | Mean/median imputation |
| "the missingness itself carries meaning" | Add a missing-value indicator variable |
| "encode a categorical with no order" | One-Hot |
| "ordered, grade-like categories" | Ordinal/Label encoding |
| "tens of thousands of distinct category values" | Embeddings / frequency reduction (One-Hot explodes dimensionality) |
| "distance/gradient-based model, differing scales" | Standardization/normalization |
| "tree model (XGBoost) but scaling is mandatory" | Trap (not needed) |
| "heavily skewed distribution" | Log transform |
| "bucket continuous values into ranges" | Binning |
| "correlation 0.9+, multicollinearity" | Drop features or PCA |
| "very many features, scalability first" | Built-in PCA (`algorithm_mode=randomized`) |
| "explain which variables were used" | Feature selection (keeps original columns) |
| "visually check whether clusters exist" | t-SNE 2D (visualization only) |
| "minority class underrepresented" | SMOTE / oversampling / class weights |
| "majority class excessive, plenty of data" | Undersampling |
| "turn text into numeric features" | BoW / TF-IDF / embeddings |
| "splitting time-series data" | Split by time point (no random shuffle) |
| "fit on the whole dataset, then split" | Data leakage (trap) |

## Requirement → Technique/Service Translation Table (Domains 3 and 4)

| Clue in the requirement sentence | Answer direction |
|------|------|
| "structured tabular classification/regression" | XGBoost, Linear Learner |
| "image classification/detection" | Image Classification / Object Detection (CNN) |
| "time-series demand forecasting (multiple series)" | DeepAR |
| "text classification/embeddings" | BlazingText |
| "extract topics from documents" | LDA / NTM |
| "group without labels" | K-Means |
| "anomaly detection" | Random Cut Forest |
| "recommendation, sparse interactions" | Factorization Machines |
| "default hidden-layer activation" | ReLU |
| "binary classification output activation" | Sigmoid |
| "multi-class output activation" | Softmax |
| "regression output activation" | None (linear) |
| "both training and validation low" | Underfitting → raise complexity, train longer |
| "only validation is low" | Overfitting → regularization, augmentation, early stopping |
| "image task with little training data" | Transfer learning + data augmentation |
| "efficient tuning on a small budget" | Bayesian (AMT) |
| "small search space, plenty of parallel resources" | Grid / Random Search |
| "direction for error metric / performance metric" | Minimize / Maximize |
| "compare discriminative power under extreme imbalance" | PR-AUC |
| "FP is expensive / FN is expensive" | Precision / Recall (balance = F1) |
| "evaluating regression performance" | RMSE / MAE / R² |
| "diagnose exploding/vanishing gradients during training" | Debugger |
| "large-scale offline scoring, no endpoint needed" | Batch Transform |
| "intermittent traffic, cold start acceptable" | Serverless Inference |
| "large payload, long processing, queuing" | Asynchronous Inference |
| "always-on low latency" | Real-time Endpoint |
| "handle traffic fluctuation" | Endpoint Auto Scaling |
| "several models on one endpoint" | Multi-Model Endpoint |
| "validate with real traffic without affecting users" | Shadow testing |
| "shift gradually while reducing risk" | Canary / Linear |
| "performance decay / input distribution shift after deployment" | Model Monitor (+ CloudWatch alarm → retraining) |
| "endpoint latency, error rate, logs" | CloudWatch |
| "audit who called which API" | CloudTrail |
| "group fairness, SHAP explanations" | Clarify |
| "lower training cost, interruptions acceptable" | Managed Spot Training |
| "workflow automation, reproducibility, CI/CD" | Pipelines + Model Registry |
| "encryption at rest and in transit, access control" | KMS + IAM |

Three meta-principles run through this translation table. (1) "Who carries the operational burden" splits serverless/managed (Firehose, Glue, Athena, Serverless) from hands-on control (Streams, EMR, Real-time). (2) "The shape of the data" determines the algorithm (tables = XGBoost, images = CNN, sequences = DeepAR/RNN, text = BlazingText). (3) "A metric is a translation of business cost," so whether FP or FN is more expensive decides precision vs. recall vs. F1. Even a question you don't know narrows down to the right region once you reduce it to these three axes.

## Confusing Pairs Comparison Table

| Pair | Deciding criterion | When to pick the left | When to pick the right |
|---|---|---|---|
| Sigmoid ↔ Softmax | Number of output classes | Binary classification output | Multi-class output (sums to 1) |
| Maximize ↔ Minimize | Direction of the objective metric | Performance metrics (F1, AUC, accuracy) | Error metrics (RMSE, MAE, loss) |
| Streams ↔ Firehose | Operational burden and consumption style | Milliseconds, multiple consumers, reprocessing | Fully managed delivery, buffer then S3 |
| Canary ↔ Shadow | Whether results reach users | Real responses to some users, gradual shift | Traffic mirrored, responses not returned (risk-free) |
| Precision ↔ Recall | Which error is expensive | FP (false alarm) is expensive — spam classification | FN (miss) is expensive — disease screening |
| Oversampling ↔ Undersampling | Whether total data is sufficient | Minority class is absolutely scarce | Majority class is excessive and data is plentiful |
| Model Monitor ↔ CloudWatch ↔ CloudTrail | What is being watched | Drift (input distribution, model quality) | Infrastructure metrics and logs / API call auditing |
| Debugger ↔ Clarify | Training process or result explanation | Tensor/gradient anomalies during training | Bias (Disparate Impact) and SHAP explanations |
| Batch Transform ↔ Async Inference | Whole batch or per-request | The entire fixed dataset, no endpoint needed | Large payload, long processing, per-request queuing |
| Glue ↔ EMR | Serverless or cluster control | Fast ETL, data catalog | Fine-grained Spark/Hadoop tuning |
| Athena ↔ Redshift | Ad hoc query or warehouse | Serverless SQL over S3, occasional exploration | Large-scale structured analytics, always-on BI |

## Collected Traps You Get Wrong Most Often

| Trap | Correct judgment |
|------|------|
| Accuracy on imbalanced data | Use F1 / PR-AUC (accuracy is off the table) |
| Standardization "required" for trees/XGBoost | Trees are scale-invariant, so it is effectively unnecessary |
| Sigmoid for multi-class output | Softmax is correct |
| Softmax for regression output | Linear (no activation) is correct |
| Confusing Streams with Firehose | Custom/low-latency = Streams, fully managed = Firehose |
| Confusing Canary with Shadow | Gradual shift = Canary, risk-free mirrored validation = Shadow |
| Model Monitor vs. CloudWatch | Drift = Monitor, infrastructure metrics = CloudWatch |
| Debugger vs. Clarify | Training process = Debugger, bias/explainability = Clarify |
| Real-time for large offline jobs | Batch Transform wins on cost |
| RMSE for classification, F1 for regression | Regression = RMSE/MAE/R², classification = precision/recall/F1/AUC |
| Direction of the AMT objective metric | Error = Minimize, performance = Maximize |
| Data leakage (preprocessing the whole set before the split) | fit on the training set, transform only on validation/test |
| Splitting a time series by random shuffle | Split by time point (past → future) |
| Underfitting, yet stronger regularization | The opposite — raise complexity and train longer |
| Skipping standardization before PCA | PCA is variance-based, so standardization must come first |
| Using t-SNE coordinates as model input | Visualization only; it cannot transform new data |
| Debugger for a post-deployment problem | After deployment, use Model Monitor |
| CloudTrail as the response to drift | CloudTrail is only an API auditing tool |
| Seeing only "real-time" and choosing a Real-time Endpoint | Real-time ingestion (Kinesis) and real-time inference are different layers |
| Running a long training job on Lambda | SageMaker training job / Pipelines |
| Ignoring the count on multiple-response questions | Count the "choose two" instruction exactly |

Half of the traps are "reversed direction" and half are "domain confusion." Direction traps (Sigmoid↔Softmax, Maximize↔Minimize, Streams↔Firehose) get filtered instantly if you memorize them as pairs. Data leakage is especially subtle: if you fit a scaler or encoder on training and validation combined, validation information leaks and your evaluation becomes optimistically biased. Always fit on the training set only and apply transform alone to validation and test — that single line shows up disguised as a plausible answer choice again and again.

## 60-Second Reminder Right Before the Exam

```text
Metrics    : imbalance=F1/PR-AUC · FP costly=precision · FN costly=recall · regression=RMSE/MAE/R²
Activation : hidden=ReLU · binary=Sigmoid · multi-class=Softmax · regression=none (linear)
Tuning     : small budget=Bayesian (AMT) · error=Minimize · performance=Maximize
Diagnosis  : only validation low=overfitting · both low=underfitting
Ingestion  : multi-consumer/reprocessing=Streams · fully managed delivery=Firehose · real-time SQL=Analytics
Storage    : lake=S3 · serverless SQL=Athena · warehouse=Redshift
ETL        : serverless=Glue · cluster control=EMR · DB migration=DMS
Inference  : always-on low latency=Real-time · intermittent=Serverless · batch=Batch · large queue=Async
Rollout    : gradual=Canary · risk-free mirroring=Shadow · parallel switchover=Blue/Green
Operations : drift=Model Monitor · infrastructure=CloudWatch · audit=CloudTrail
Explaining : training process=Debugger · bias/SHAP=Clarify
Cost       : training=Spot · inference=Batch/Serverless/Multi-Model
Leakage    : fit on the training set only · split time series by time point
```

## D-Day Checklist

- Two forms of ID; confirm the exam time and location (or your online proctoring setup) in advance.
- If testing online, check your desk setup, lighting, network, and camera the day before.
- Restroom and water before you start; get your condition ready for 180 minutes of focus.
- No new material in the 5 minutes before the start — only skim the 60-second reminder above.
- Read each passage to the end and mark the **final constraint sentence** (cost, operations, regulatory condition) first.
- Mark superlatives such as `MOST` / `BEST` / `LEAST` as you read.
- Pass 1: start with what you're sure about; if unsure, answer immediately and flag.
- Cross out the two obviously wrong options first, then compare the remaining two against the passage's constraints.
- On multiple-response questions, read the "choose N" instruction exactly.
- No blanks — mark a best guess even when time is short.
- Use the last 10 minutes to recheck for unmarked answers and flagged items.

## 📖 Glossary

- **Scaled score**: A score converted to a 1000-point scale after adjusting for question difficulty. 750 or higher passes.
- **Unscored item**: The 15 questions mixed in for statistical data collection. They are not identified, so every question must be answered with care.
- **Pass 1 / Pass 2**: A solving strategy of skimming through everything once (Pass 1) and then revisiting only the flagged questions (Pass 2).
- **Flag**: A feature on the exam screen for marking questions to revisit later.
- **Requirement translation**: The task of turning the natural-language conditions in a passage into technique and service names. This is the essence of the exam.
- **Direction trap**: An item-writing method that creates a wrong answer by merely flipping the direction of one of a pair of options (Sigmoid↔Softmax, Maximize↔Minimize).
- **Domain-confusion trap**: An item-writing method that swaps in services whose roles look similar (Model Monitor↔Debugger↔Clarify).
- **Data leakage**: Information that could not be known at training time seeping in through features or preprocessing, making the evaluation optimistically biased.
- **Multiple-response question**: A type that specifies how many answers to pick, such as "choose two." You must read the count instruction exactly.
- **MOST appropriate**: Exam phrasing meaning that when several options are all possible, you pick the single one that best fits the constraint the passage emphasizes.

---

## 📝 Practice Questions

**Question 1.** Which statement about the structure of the MLS-C01 exam is correct?

A) Of the 65 questions, 15 are unscored and it is not indicated which ones they are  
B) You must answer 65 questions within 90 minutes  
C) There is a cutoff per domain, so you must exceed a certain score in each domain  
D) The passing score is 600 out of 1000  

**Answer: A**  
Explanation: Of the 65 questions, 15 are unscored and are not indicated, so you must answer every question diligently. The time is 180 minutes (B is wrong), there is no per-domain cutoff and the result is determined by the overall scaled score (C is wrong), and the passing score is 750 (D is wrong).

---

**Question 2.** Which exam time allocation strategy is MOST recommended?

A) Spend 10 minutes or more on a single difficult question to be sure to get it right  
B) Handle certain questions quickly, and if unsure, answer immediately, flag the question, and review it in a second pass  
C) Leave questions you do not know blank and move on  
D) Force exactly the same amount of time on every question  

**Answer: B**  
Explanation: The standard approach is to finish easy questions quickly, concentrate time on difficult scenarios, and keep pace by answering immediately and flagging when unsure. Spending 10 minutes on one question (A) has a large expected loss, a blank answer (C) scores zero so you must always fill in an estimated answer, and forcing equal time (D) is inefficient.

---

**Question 3.** Which of the following "requirement → service" translations is incorrect?

A) "Deliver a stream to S3 with minimal operations" → Kinesis Data Firehose  
B) "Automatically detect input distribution changes after deployment" → Model Monitor  
C) "Validate a new model with production traffic without affecting users" → Canary deployment  
D) "Group fairness measurement and SHAP explanations" → SageMaker Clarify  

**Answer: C**  
Explanation: Replicating traffic to validate without affecting users is Shadow testing, whereas Canary is a gradual rollout in which some real users receive the new model's responses. A, B, and D are all correct translations.

---

**Question 4.** Which of the following is the correct judgment about traps that frequently appear on the exam?

A) Even if classes are imbalanced at 95:5, accuracy alone is sufficient for evaluation  
B) Standardizing all numeric features is always required before training XGBoost  
C) Sigmoid should be used as the output activation function for multiclass classification  
D) Fit the preprocessing scaler only on the training set and apply only transform to validation and test sets  

**Answer: D**  
Explanation: To prevent data leakage, scalers and encoders must be fit only on the training set and only transform applied to validation/test. Accuracy alone under imbalance (A) is inappropriate, tree-based XGBoost is scale-invariant so standardization is effectively unnecessary (B), and Softmax is correct for multiclass output (C).

---

**Question 5.** Which study priority MOST effectively raises the expected score?

A) Focus only on Domains 1 and 4, which have the smallest weights  
B) Abandon all domains and perfect just one domain  
C) Raise the accuracy in Domain 3 (Modeling, 36%), which has the largest weight  
D) Identify the unscored questions and skip only those  

**Answer: C**  
Explanation: Because passing is determined by the overall scaled score, raising accuracy in Domain 3 (36%), which has the largest weight, raises the expected score the most. Focusing only on small domains (A) or going all in on a single domain (B) is inefficient, and unscored questions are not indicated, so identifying and skipping them (D) is impossible.

---
