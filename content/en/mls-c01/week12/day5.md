# Day 5 - D-Day Wrap-Up: Exam Structure, Time Allocation, Requirement Translation Tables, Trap Roundup

This is the final day of the 12-week journey. Today we add no new knowledge. Instead, we build **an operating manual you can use as-is inside the exam room**. Exam structure and time allocation, what order to answer in, a "requirement sentence → technique/service" translation table, and the traps people most often stumble over — all gathered in one place. It is compressed enough that skimming this single document right before the exam is sufficient.

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

> 💡 **Related theory**: You pass with an overall scaled score of 750 or higher — there is no per-domain minimum you can fail on. The 15 unscored questions are not marked, so treat every question with the same care. A scaled score is not a raw percentage correct; it is adjusted for question difficulty, so there is no fixed "get exactly N right and you pass." That means abandoning a specific domain is worse than raising your accuracy in Domain 3 (36%), the most heavily weighted one, which lifts your expected score the most.

## Time Allocation Strategy

| Phase | Recommendation |
|------|------|
| Pass 1 (all questions) | 65 questions × about 2 minutes = 130 minutes, start with the ones you're sure about |
| Flagging | If you're unsure, answer immediately and flag it — don't cling to it |
| Pass 2 (flagged) | Re-review with the time left (about 40 minutes) |
| Final review | Last 10 minutes, check for unanswered questions |

> 💡 **Related theory**: 180 minutes for 65 questions works out to about 2.8 minutes each, but the key is finishing easy questions in around a minute so you can pour the surplus into hard scenarios. The moment you spend more than 4 minutes on a single question, expected loss grows. "If you're at least 70% confident, answer, flag it, and move on without regret" is the rule that protects your pace. A blank is worth zero, so if you run short on time, always fill in a best guess.

## Requirement → Technique/Service Translation Table (Domains 1 and 2)

| Clue in the requirement sentence | Answer direction |
|------|------|
| "millisecond latency, multiple consumers, reprocessing" | Kinesis Data Streams |
| "load into S3 with minimal operational overhead" | Kinesis Data Firehose |
| "real-time SQL aggregation over a stream" | Kinesis Data Analytics |
| "query S3 with SQL, serverless" | Athena |
| "large-scale structured analytics warehouse" | Redshift |
| "serverless ETL + schema catalog" | Glue |
| "fine-grained control of a Hadoop/Spark cluster" | EMR |
| "categorical encoding with no inherent order" | One-Hot |
| "distance/gradient-based model, differing scales" | Standardization/normalization |
| "tree model (XGBoost) but scaling is mandatory" | Trap (not needed) |
| "correlation 0.9+, multicollinearity" | Drop features or PCA |
| "minority class underrepresented" | SMOTE / oversampling / class weights |

## Requirement → Technique/Service Translation Table (Domains 3 and 4)

| Clue in the requirement sentence | Answer direction |
|------|------|
| "structured tabular classification/regression" | XGBoost |
| "image classification/detection" | CNN (Image Classification/Object Detection) |
| "time-series demand forecasting" | DeepAR |
| "text classification/embeddings" | BlazingText |
| "anomaly detection" | Random Cut Forest |
| "multi-class output activation" | Softmax (binary = Sigmoid) |
| "only validation is low" | Overfitting → regularization, augmentation, early stopping |
| "efficient tuning on a small budget" | Bayesian (AMT) |
| "large-scale offline scoring, no endpoint needed" | Batch Transform |
| "intermittent traffic, cold start acceptable" | Serverless Inference |
| "large payload, long processing, queuing" | Asynchronous Inference |
| "validate with real traffic without affecting users" | Shadow testing |
| "gradual performance decay / input distribution shift after deployment" | Model Monitor |
| "group fairness, SHAP explanations" | Clarify |
| "lower training cost, interruptions acceptable" | Managed Spot Training |
| "workflow automation, reproducibility, CI/CD" | Pipelines + Model Registry |

> 💡 **Related theory**: Three meta-principles run through this translation table. (1) "Who carries the operational burden" splits serverless/managed (Firehose, Glue, Athena, Serverless) from hands-on control (Streams, EMR, Real-time). (2) "The shape of the data" determines the algorithm (tables = XGBoost, images = CNN, sequences = DeepAR/RNN, text = BlazingText). (3) "A metric is a translation of business cost," so whether FP or FN is more expensive decides precision vs. recall vs. F1. Even a question you don't know narrows down once you reduce it to these three axes.

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

> 💡 **Related theory**: Half of the traps are "reversed direction" and half are "domain confusion." Direction traps (Sigmoid↔Softmax, Maximize↔Minimize, Streams↔Firehose) get filtered instantly if you memorize them as pairs. Data leakage is especially subtle: if you fit a scaler or encoder on training and validation combined, validation information leaks and your evaluation becomes optimistically biased. Always fit on the training set only and apply transform alone to validation and test — that single line shows up disguised as a plausible answer choice again and again.

## D-Day Checklist

- Two forms of ID; confirm the exam time and location (or your online proctoring setup) in advance.
- Restroom and water before you start; get your condition ready for 180 minutes of focus.
- Pass 1: start with what you're sure about; if unsure, answer immediately and flag.
- On multiple-response questions, read the "choose N" instruction exactly.
- No blanks — mark a best guess even when time is short.
- Use the last 10 minutes to recheck for unanswered questions and flagged items.

## Wrapping Up

Over 12 weeks you have worked through all four domains: data engineering, EDA, modeling, and implementation and operations. In the end, the exam measures — across 65 questions — your ability to "read a real-world requirement and translate it into the most appropriate technique or service." Use accuracy in Domain 3 (36%), the heaviest domain, as your lever; narrow down unfamiliar questions with the translation table's three axes (operational burden, data shape, business cost); and filter out direction and domain-confusion traps by memorizing them in pairs. Protect your pace, leave nothing blank, and spend the last 10 minutes reviewing. You have prepared enough — good luck on the exam.

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
