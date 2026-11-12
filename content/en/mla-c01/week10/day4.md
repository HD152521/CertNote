# Day 4 - Frequently Missed Traps·Keywords: The "Requirement → SageMaker Feature" Translation Table

## 📌 Key Takeaways

- The exam is hard often not because you do not know the concepts but because you **cannot translate a scenario into a feature**.
- Fix the order: while reading the question, use keywords to **think of the answer first**, then look for that name among the options. If you read the options first, you get shaken.
- Confusing pairs are separated by **fine-grained qualifiers** — "before deployment vs. in production," "one-time vs. continuous," "same framework vs. different framework."
- The three big traps: Accuracy on imbalanced data, algorithm mis-mapping, scaling a real-time endpoint to zero. Just knowing them filters them out immediately.
- A cost-saving option that **breaks another requirement (performance, availability, security) is wrong**. Cheap is not automatically correct.

## The Core Translation Table — Requirement → Feature

Once this table is stuck in your head, your speed on comprehensive questions rises greatly.

### Data·Features

| Requirement keyword | Correct feature |
|---------------------|-----------------|
| Visual data preparation without code | Data Wrangler |
| Run my preprocessing script as a managed job | Processing Job |
| Serverless ETL·schema catalog | Glue / Glue Data Catalog |
| SQL queries on S3 without moving it | Athena |
| Real-time stream ingestion | Kinesis Data Streams / Firehose |
| Humans must attach labels | Ground Truth |
| Training-inference feature consistency | Feature Store / inference pipeline |
| Single-record feature lookup right before real-time inference | Feature Store online store |
| Build a training dataset as of a past point in time | Feature Store offline store |
| Check whether predictions are fair / bias | SageMaker Clarify |
| Which features contributed to the prediction | Clarify (SHAP) |

### Training·Tuning·Evaluation

| Requirement keyword | Correct feature |
|---------------------|-----------------|
| Reduce training cost (interruptions tolerable) | Managed Spot Training + checkpoints |
| Data larger than disk·startup delay | Pipe / Fast File mode |
| I/O bottleneck from repeated reads every epoch | FSx for Lustre |
| Efficient tuning with few attempts | Bayesian |
| Early termination of unpromising training | Hyperband |
| Training debugging·bottleneck analysis | SageMaker Debugger |
| Compare the metrics of training attempts | SageMaker Experiments |
| Train with my own PyTorch script | Framework Estimator + entry_point |
| Evaluate performance on imbalanced data | F1 / AUC-ROC / Recall |

### Deployment·Orchestration

| Requirement keyword | Correct feature |
|---------------------|-----------------|
| Low-cost·intermittent inference (scale to 0) | Serverless inference |
| Large payload·long processing·individual requests | Asynchronous inference |
| Lowest-cost bulk scoring | Batch transform |
| Cost reduction for hundreds of models of the same kind | Multi-model endpoint (MME) |
| A few models of different frameworks on one endpoint | Multi-container endpoint (MCE) |
| Reduce deep learning inference cost | AWS Inferentia (inf1/inf2) |
| A/B testing·gradual traffic shifting | Production variant weights |
| ML workflow automation·CI/CD | SageMaker Pipelines |
| Register only if the threshold is passed | ConditionStep + Model Registry |
| Trigger retraining by an event | EventBridge |
| Workflow with many non-ML services mixed in | Step Functions |

### Monitoring·Security·Governance

| Requirement keyword | Correct feature |
|---------------------|-----------------|
| Detect whether the input distribution changed | Model Monitor (Data Quality) |
| Detect performance degradation against the truth | Model Monitor (Model Quality) + ground truth |
| Watch bias change in production | Bias Drift monitor (Clarify integration) |
| Feature attribution change in production | Feature Attribution Drift monitor |
| Access S3 without the internet | Gateway VPC endpoint |
| Access ECR·SageMaker API without the internet | Interface endpoint (PrivateLink) |
| Block the container's external communication | EnableNetworkIsolation |
| Encrypt data at rest | KMS |
| Encrypt data in transit | TLS |
| Who called which API | CloudTrail |
| Latency·error-rate alarms | CloudWatch |
| Document model purpose·performance·limitations | Model Cards |
| Track data → training → model provenance | Lineage Tracking |
| A notebook·role with excessive permissions | IAM least privilege |

The value of this table is "thinking of the answer before looking at the options." Exam options are filled with plausible traps, so if you read the options without settling on an answer first, you get shaken. The safest order is to catch keywords while reading the question, write the feature name in your head, and then check whether that name is among the options.

## Commonly Confused Pairs — What Is Different?

Clearly distinguishing the easily confused pairs gives the following.

| Confusing pair | Distinguishing criterion |
|----------------|--------------------------|
| Model Monitor vs Clarify | Watching drift in production = Monitor / one-time pre-deployment bias·explanation analysis = Clarify |
| Data Quality vs Model Quality | Input distribution·schema change / performance degradation against the truth (labels required) |
| MME vs MCE | Same container·many models / different frameworks·few models |
| Asynchronous vs batch transform | Individual requests received into a queue with results to S3 / the whole dataset as a job |
| Serverless vs asynchronous | Small payload·short processing·intermittent / large payload·long processing·queue |
| Data Wrangler vs Processing Job | Visual, no code / run my script as a managed job |
| Feature Store online vs offline | Low-latency single-record lookup (real-time) / S3 bulk lookup (training·batch) |
| Gateway vs Interface endpoint | Route table·S3/DynamoDB / ENI·most services |
| CloudTrail vs CloudWatch | Who did what (API audit) / system metrics·logs·alarms |
| Pipelines vs Step Functions | SageMaker-specific ML CI/CD / general service orchestration |
| Bayesian vs Hyperband | Efficient search with few attempts / early termination of unpromising training |
| File vs Pipe vs Fast File | Copy everything / streaming / instant access + streaming what is needed |
| Data parallel vs model parallel | Split the data (lots of data) / split the model (does not fit on the GPU) |
| Precision vs Recall | False-positive cost is high / miss cost is high |
| Inference pipeline vs production variant | Sequential chain (preprocessing → model) / traffic distribution (A/B) |
| Glue vs EMR | Serverless ETL·catalog / run the cluster yourself·large-scale Spark |

> ⚠️ **Gotcha**: The exam deliberately places these confusing pairs side by side as options in the same question. For "monitor bias," it gives both Model Monitor's Bias Drift and Clarify as options, and it splits as: "one-time pre-deployment check" means Clarify, "continuous monitoring in production" means Model Monitor (+ Clarify integration). A fine-grained qualifier ("before deployment" vs "in production," "one-time" vs "continuous") separates the answer.

## Trap Type 1 — Luring You Into Choosing Accuracy on Imbalanced Data

On imbalanced data (fraud, disease, churn), Accuracy is placed attractively among the options. On 99% normal data, an "everything is normal" model also has 99% accuracy. The answer is almost always **F1·AUC·Recall**. "Must not miss" = Recall, "false-positive cost is high" = Precision.

Metric questions require reading the "cost asymmetry." If the cost of a false negative (a miss) is large, Recall; if the cost of a false positive (a false alarm) is large, Precision; if balance between the two matters, F1. They also ask that adjusting the threshold trades off Precision against Recall. For something like medical diagnosis, where a miss is fatal, you lower the threshold to raise Recall.

## Trap Type 2 — Scrambling the Algorithm Mapping

They give similar-looking wrong answers, such as Linear Learner for "time-series forecasting" or K-Means for "anomaly detection." Fix the mapping firmly: time series = **DeepAR**, outliers = **RCF**, clustering = **K-Means**, dimensionality reduction = **PCA**, tabular classification/regression = **XGBoost**, recommendation (sparse) = **Factorization Machines**, text = **BlazingText**.

| Wrong-answer lure | Why it attracts | Correct answer |
|-------------------|-----------------|----------------|
| Time series → Linear Learner | The association "forecasting = regression" | DeepAR |
| Anomaly detection → K-Means | The association "outliers are outside the clusters" | Random Cut Forest |
| Splitting segments → XGBoost | The association "classification = XGBoost" | K-Means if there are no labels |
| Recommendation → K-Means | The association "group similar users" | Factorization Machines for sparse interactions |
| Too many features → delete features | Simple intuition | Reduce dimensions with PCA |

## Trap Type 3 — Trying to Scale a Real-Time Endpoint to Zero

An option saying "traffic drops to 0, so scale the real-time endpoint to 0 instances" is wrong. Real-time **must keep at least 1 instance**. If you need scale-to-zero, you must move to **serverless/asynchronous/batch**. An option that attaches a GPU (p4d) to XGBoost is also a trap — for tree models, CPU is the answer.

> ⚠️ **Gotcha**: When the keyword "reduce cost" appears, each option plausibly mixes in a cost-saving technique. Many models of the same kind → MME, deep learning inference → Inferentia, intermittent traffic → serverless/asynchronous, training cost·interruptions tolerable → Spot are right, but "XGBoost on a GPU," "real-time down to 0," and "discarding data even though accuracy matters" reduce cost yet break the requirements, so they are traps. If cost saving sacrifices another requirement (performance, availability), it is wrong.

## Trap Type 4 — Pushing a Tool Outside Its Intended Use

The option uses an "existing service" but **twists its role slightly.** Because the service name is familiar, it is easy to wave it through.

| Trap option | Why it is wrong |
|-------------|-----------------|
| Model Monitor performs retraining | Monitor only goes as far as detection·notification. Retraining is EventBridge → Pipeline |
| Use KMS to block internet access | KMS is encryption at rest. Networking is VPC endpoints·isolation |
| Monitor latency with CloudTrail | CloudTrail is API auditing. Metrics are CloudWatch |
| Continuously watch drift in production with Clarify | Continuous monitoring is Model Monitor (Clarify integration) |
| Measure bias with Debugger | Debugger diagnoses the training process. Bias is Clarify |
| Store the training script in Feature Store | Feature Store is a feature repository, not a code repository |
| Reduce training cost with serverless inference | It is an inference option, unrelated to training cost |

## Trap Type 5 — The "Almost Correct" Option That Misses One Condition

This is the most painful trap. With three conditions, they place an option that satisfies only two next to the correct answer.

```text
[How to check conditions]
  Extract the conditions from the question   Cond①  Cond②  Cond③
        ▼
  Option A : VPC endpoint only            ✓      ✗      ✗   → eliminated
  Option B : VPC + isolation              ✓      ✓      ✗   → "almost correct" trap
  Option C : VPC + isolation + KMS        ✓      ✓      ✓   → correct
  Option D : Stronger IAM policy only     ✗      ✗      ✗   → eliminated
```

- Count the conditions first, and mark how many each option satisfies.
- It is especially dangerous when conditions are **similar-looking but different requirements**, such as one being "does not traverse the internet" and another being "blocks external exfiltration."
- Conversely, an option with a pile of components when there is only one condition loses under the "LEAST operational overhead" criterion.

## Trap Type 6 — Skimming Over Superlative Qualifiers

| Qualifier | What it compares | Common wrong answer |
|-----------|------------------|---------------------|
| MOST cost-effective | Cost | A high-performing but expensive configuration |
| LEAST operational overhead | Operational burden | Building directly on EC2·your own scripts |
| MOST secure | Security | A configuration that works but leaves an exposure path |
| LEAST latency | Latency | Options without immediacy, like batch·asynchronous |
| FASTEST to implement | Implementation speed | Custom container·direct implementation |

## Wrong-Answer Patterns: Symptom → Cause → Action

| Symptom | Cause | Action |
|---------|-------|--------|
| You change your mind while reading options and get it wrong | You read the options without settling on an answer first | Write the keyword → feature translation in your head, then check the options |
| You pick the opposite every time on confusing pairs | You did not read the fine-grained qualifier | Underline "before deployment/in production," "one-time/continuous" |
| You pick the option that satisfies two of three conditions | You did not count the conditions | Number the conditions and check each option |
| On a cost question, you pick an option that breaks performance | You looked only at the qualifier and ignored other requirements | An option that breaks a requirement is eliminated regardless of the qualifier |
| You pick reflexively when you see a familiar service name | You judged by the service's "name," not its "role" | Recite exactly what that service does |
| You run out of time and cannot solve the later questions | You lingered too long on one question | After 2 minutes, give a tentative answer + mark it and move on |

Tomorrow we finish with D-Day strategy.

## 📖 Glossary

- **Translation table**: A correspondence table that turns a scenario's requirement keywords directly into SageMaker feature names. It governs your solving speed.
- **Confusing pair**: Two similar features that the exam deliberately places side by side as options in the same question. Separated by fine-grained qualifiers.
- **Fine-grained qualifier**: A short modifier that separates the answer, such as "before deployment vs. in production," "one-time vs. continuous," or "individual request vs. whole dataset."
- **Superlative qualifier**: An expression that specifies the comparison criterion, such as MOST cost-effective or LEAST operational overhead. It narrows to one answer when several options would all work.
- **Almost-correct trap**: An option that misses one of the required conditions. Placed right next to the correct answer, it catches the most people.
- **Role-twisting trap**: An option that has a real, existing service do something other than its intended use (e.g., Model Monitor performing retraining).
- **Cost asymmetry**: A situation where the losses from false positives and false negatives differ in size. This asymmetry decides whether to look at Precision or Recall.
- **Threshold**: The cutoff value that splits a classification probability into positive/negative. Lowering it raises Recall and lowers Precision.
- **Process of elimination**: A solving method that narrows candidates by striking out any option that violates even one requirement.

---

## 📝 Practice Questions

**Question 1.** Before deployment, you want to check once whether the model's predictions are unfair to specific groups, and at the same time report each feature's prediction contribution using SHAP. What is the most appropriate feature?

A) Model Monitor (Bias Drift)  
B) SageMaker Clarify  
C) CloudWatch dashboard  
D) Model Registry  

**Answer: B**  
Explanation: "A one-time pre-deployment check + bias measurement + SHAP contributions" is exactly the role of Clarify. A's Bias Drift is for continuous monitoring in production, so it conflicts with the "one-time pre-deployment" condition, C is operational metric visualization, and D is model version management, unrelated to bias and explainability.

---

**Question 2.** You want to be able to restart a training job even if it is interrupted and to cut costs as much as possible. However, the deadline is not tight. What is the most appropriate choice?

A) Fixed On-Demand instances  
B) Managed Spot Training (Spot Instances)  
C) Finish quickly with a larger GPU instance  
D) Switch to serverless inference  

**Answer: B**  
Explanation: Managed Spot Training uses interruptible Spot Instances to greatly reduce training cost and supports restarting from checkpoints, so it suits "interruption tolerated + cost savings + relaxed deadline." A provides no savings, C increases cost, and D is an inference option unrelated to reducing training cost.

---

**Question 3.** Which of the following requirement-to-feature mappings is incorrect?

A) Detect input data distribution changes → Model Monitor (Data Quality)  
B) Audit who deleted an endpoint → CloudTrail  
C) Access S3 without the internet → KMS encryption  
D) Reduce cost for hundreds of similar models → Multi-model endpoint (MME)  

**Answer: C**  
Explanation: Accessing S3 and ECR without the internet is the role of VPC endpoints (PrivateLink), and KMS encrypts data at rest and is unrelated to the network path, so C is the incorrect mapping. A, B, and D are all correct mappings: Data Quality drift detection, CloudTrail API auditing, and MME cost reduction for many models, respectively.

---

**Question 4.** You want to reduce inference costs for an internal tool whose traffic occurs only during business hours and drops to nearly zero at night and on weekends. A slight delay on the first invocation (cold start) is acceptable. What is the most appropriate option?

A) Autoscale a real-time endpoint down to 0 instances  
B) Serverless inference  
C) Batch transform  
D) A real-time endpoint on a larger instance  

**Answer: B**  
Explanation: Intermittent traffic + scaling to zero + tolerating cold starts is exactly the condition for serverless inference, whose cost is close to zero when idle. A is impossible because real-time endpoints enforce a minimum of 1 instance so they cannot scale to 0, C is bulk processing rather than immediate response, and D actually increases always-on cost.

---

**Question 5.** Which statement most accurately describes the difference between the Data Quality and Model Quality monitors of Model Monitor?

A) Data Quality requires ground truth labels and Model Quality does not  
B) Data Quality looks at changes in input data distribution and schema, while Model Quality looks at degradation of prediction performance against actual ground truth and requires ground truth collection  
C) Both measure only bias  
D) Model Quality works only before training  

**Answer: B**  
Explanation: Data Quality compares input distribution and schema drift against a baseline, and Model Quality measures performance degradation by comparing actual ground truth with predictions, so it requires collecting ground truth labels. A swaps which monitor needs labels, C is an incorrect restriction that says they only look at bias, and D is factually wrong because Model Quality is a monitoring feature that runs in production.

---


## 📝 Practice Questions

**Questions 1-5** [Practice questions in Korean follow after marker]

---
