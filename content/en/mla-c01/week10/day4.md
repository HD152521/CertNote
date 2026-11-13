# Day 4 - Commonly Missed Traps and Keywords: A "Requirement → SageMaker Feature" Translation Table

## 📌 Key Takeaways

- The exam is hard often not because you don't know the concepts, but because you **fail to translate the scenario into a feature**.
- Fix the order: while reading the question, use keywords to **recall the answer first**, then look for that name among the choices. If you read the choices first, you waver.
- Confusable pairs are separated by **subtle qualifier words** - "before deployment vs in operation," "one-time vs continuous," "same framework vs different frameworks."
- The three big traps: Accuracy on imbalanced data, mis-mapped algorithms, scaling real-time to 0. Just knowing them filters them out instantly.
- A cost-saving choice that **breaks another requirement (performance, availability, security) is wrong**. Cheap does not mean correct.

## Core Translation Table - Requirement → Feature

Once this table is stuck in your head, your speed on comprehensive problems rises sharply.

### Data and Features

| Requirement keyword | Correct feature |
|------------------|-----------|
| Visual data preparation without code | Data Wrangler |
| Run my preprocessing script as managed | Processing Job |
| Serverless ETL, schema catalog | Glue / Glue Data Catalog |
| Query with SQL without moving S3 data | Athena |
| Real-time stream ingestion | Kinesis Data Streams / Firehose |
| Humans must label | Ground Truth |
| Training-inference feature consistency | Feature Store / inference pipeline |
| Single-record feature lookup right before real-time inference | Feature Store online store |
| Build a training dataset as of a past point in time | Feature Store offline store |
| Check whether predictions are fair/biased | SageMaker Clarify |
| Which features contributed to the prediction | Clarify (SHAP) |

### Training, Tuning, Evaluation

| Requirement keyword | Correct feature |
|------------------|-----------|
| Reduce training cost (interruptions acceptable) | Managed Spot Training + checkpoints |
| Data larger than disk, startup delay | Pipe / Fast File mode |
| I/O bottleneck from re-reading every epoch | FSx for Lustre |
| Efficient tuning with few trials | Bayesian |
| Early-stop hopeless training runs | Hyperband |
| Training debugging, bottleneck analysis | SageMaker Debugger |
| Compare metrics across training trials | SageMaker Experiments |
| Train with my PyTorch script | Framework Estimator + entry_point |
| Evaluating performance on imbalanced data | F1 / AUC-ROC / Recall |

### Deployment and Orchestration

| Requirement keyword | Correct feature |
|------------------|-----------|
| Low-cost, intermittent inference (scale to 0) | Serverless inference |
| Large payload, long processing, individual requests | Asynchronous inference |
| Lowest-cost bulk scoring | Batch transform |
| Cost savings for hundreds of similar models | Multi-model endpoint (MME) |
| A few models of different frameworks on one endpoint | Multi-container endpoint (MCE) |
| Reduce deep learning inference cost | AWS Inferentia (inf1/inf2) |
| A/B testing, gradual traffic shift | Production variant weights |
| ML workflow automation, CI/CD | SageMaker Pipelines |
| Register only when criteria are passed | ConditionStep + Model Registry |
| Trigger retraining by an event | EventBridge |
| Workflow with many non-ML services mixed in | Step Functions |

### Monitoring, Security, Governance

| Requirement keyword | Correct feature |
|------------------|-----------|
| Detect whether the input distribution changed | Model Monitor (Data Quality) |
| Detect performance degradation against ground truth | Model Monitor (Model Quality) + ground truth |
| Watch bias changes in operation | Bias Drift monitor (Clarify integration) |
| Changes in feature contribution in operation | Feature Attribution Drift monitor |
| Access S3 without the internet | Gateway VPC endpoint |
| Access ECR and SageMaker APIs without the internet | Interface endpoint (PrivateLink) |
| Block communication from the container to the outside | EnableNetworkIsolation |
| Encrypt data at rest | KMS |
| Encrypt data in transit | TLS |
| Who called which API | CloudTrail |
| Latency and error-rate alarms | CloudWatch |
| Document model purpose, performance, and limits | Model Cards |
| Track lineage from data → training → model | Lineage Tracking |
| Notebooks and roles with excessive permissions | IAM least privilege |

The value of this table is "recalling the answer before seeing the choices." Exam choices are filled with plausible traps, so if you read the choices without deciding on the answer first, you waver. The safest order is to catch keywords as you read the question, write the feature name in your head, and then check whether that name is among the choices.

## Easily Confused Pairs - What Differs

Distinguishing the pairs that are easy to mix up clearly looks like this.

| Confusable pair | Distinguishing criterion |
|----------|-----------|
| Model Monitor vs Clarify | Drift monitoring in operation = Monitor / one-time pre-deployment bias and explainability analysis = Clarify |
| Data Quality vs Model Quality | Input distribution/schema changes / performance degradation against ground truth (labels needed) |
| MME vs MCE | Same container, many models / different frameworks, few models |
| Asynchronous vs batch transform | Individual requests queued with results to S3 / the whole dataset as a job |
| Serverless vs asynchronous | Small payload, short processing, intermittent / large payload, long processing, queue |
| Data Wrangler vs Processing Job | Visual, no code / run my script as managed |
| Feature Store online vs offline | Low-latency single-record lookup (real-time) / bulk S3 lookup (training, batch) |
| Gateway vs Interface endpoint | Route table, S3/DynamoDB / ENI, most services |
| CloudTrail vs CloudWatch | Who did what (API audit) / system metrics, logs, alarms |
| Pipelines vs Step Functions | SageMaker-specific ML CI/CD / general-purpose service orchestration |
| Bayesian vs Hyperband | Efficient search with few trials / early stopping of hopeless runs |
| File vs Pipe vs Fast File | Full copy / streaming / immediate access + streaming what's needed |
| Data parallel vs model parallel | Split the data (lots of data) / split the model (doesn't fit on a GPU) |
| Precision vs Recall | False-positive cost is high / missed-detection cost is high |
| Inference pipeline vs production variants | Sequential chain (preprocessing→model) / traffic split (A/B) |
| Glue vs EMR | Serverless ETL, catalog / run your own cluster, large-scale Spark |

> ⚠️ **Pitfall**: The exam deliberately places these confusable pairs side by side as choices in the same question. For "monitor bias," it offers both Model Monitor's Bias Drift and Clarify as choices, and it splits as "one-time pre-check" means Clarify, "continuous monitoring in operation" means Model Monitor (+Clarify integration). Subtle qualifier words ("before deployment" vs "in operation," "one-time" vs "continuous") decide the answer.

## Trap Type 1 - Leading You to Pick Accuracy on Imbalanced Data

On imbalanced data (fraud, disease, churn), Accuracy is placed as an attractive choice. With 99% normal data, an "everything is normal" model also has 99% accuracy. The answer is almost always **F1, AUC, or Recall**. "Must not miss" = Recall, "false-positive cost is high" = Precision.

Metric questions require reading the "cost asymmetry." If the cost of a false negative (miss) is large, it's Recall; if the cost of a false positive (false alarm) is large, it's Precision; if balancing the two matters, it's F1. They also ask that adjusting the threshold trades off Precision and Recall. For things like medical diagnosis where a miss is fatal, you lower the threshold to raise Recall.

## Trap Type 2 - Scrambling the Algorithm Mapping

They give look-alike wrong answers such as Linear Learner for "time series forecasting" or K-Means for "anomaly detection." Lock in the mapping: time series = **DeepAR**, outliers = **RCF**, clustering = **K-Means**, dimensionality reduction = **PCA**, tabular classification/regression = **XGBoost**, recommendation (sparse) = **Factorization Machines**, text = **BlazingText**.

| Wrong-answer lure | Why it attracts | Correct answer |
|-----------|-----------|------|
| Time series → Linear Learner | The association "forecasting = regression" | DeepAR |
| Anomaly detection → K-Means | The association "outliers are outside clusters" | Random Cut Forest |
| Splitting into segments → XGBoost | The association "classification = XGBoost" | If there are no labels, K-Means |
| Recommendation → K-Means | The association "grouping similar users" | For sparse interactions, Factorization Machines |
| Too many features → delete features | Simple intuition | Reduce dimensions with PCA |

## Trap Type 3 - Trying to Scale Real-Time to 0

A choice saying "traffic drops to 0, so scale the real-time endpoint to 0 instances" is wrong. Real-time forces **keeping at least 1 instance**. If you need scaling to 0, you must go to **serverless/asynchronous/batch**. Also a choice attaching a GPU (p4d) to XGBoost is a trap - for tree models, CPU is the answer.

> ⚠️ **Pitfall**: When the keyword "reduce cost" appears, cost-saving techniques are plausibly mixed into every choice. Many similar models → MME, deep learning inference → Inferentia, intermittent traffic → serverless/asynchronous, training cost with interruptions acceptable → Spot are right, but "XGBoost on GPU," "real-time to 0," and "throw away data when accuracy matters" are traps that cut cost but break the requirements. If cost savings sacrifice another requirement (performance, availability), it is wrong.

## Trap Type 4 - Pushing a Tool Outside Its Original Purpose

The choice uses a "service that exists" but **twists its role slightly.** The service name is familiar, so it's easy to pass over.

| Trap choice | Why it is wrong |
|-----------|-----------|
| Model Monitor performs retraining | Monitor goes only as far as detection and alerts. Retraining is EventBridge → Pipeline |
| Block internet access with KMS | KMS is encryption at rest. Network is VPC endpoints and isolation |
| Monitor latency with CloudTrail | CloudTrail is API audit. Metrics are CloudWatch |
| Continuously monitor drift in operation with Clarify | Continuous monitoring is Model Monitor (Clarify integration) |
| Measure bias with Debugger | Debugger diagnoses the training process. Bias is Clarify |
| Store training scripts in Feature Store | Feature Store is a feature repository, not a code repository |
| Reduce training cost with serverless inference | It's an inference option, so unrelated to training cost |

## Trap Type 5 - The "Almost Correct" Choice Missing One Condition

This is the most painful trap. With three conditions, they place a choice that satisfies only two next to the correct one.

```text
[Condition-checking method]
  Extract conditions from the question     cond1  cond2  cond3
        ▼
  Choice A : VPC endpoint only             ✓      ✗      ✗   → eliminated
  Choice B : VPC + isolation               ✓      ✓      ✗   → "almost correct" trap
  Choice C : VPC + isolation + KMS         ✓      ✓      ✓   → correct
  Choice D : stronger IAM policy only      ✗      ✗      ✗   → eliminated
```

- Count the number of conditions first, and mark how many each choice satisfies.
- It is especially dangerous when conditions are **requirements that look similar but differ**, such as one being "no internet traversal" and another "block external leakage."
- Conversely, a choice with lots of components attached when there is only one condition loses on the "LEAST operational overhead" criterion.

## Trap Type 6 - Skimming Over Superlative Qualifiers

| Qualifier | What it compares | Common wrong answer |
|--------|-----------------|-----------|
| MOST cost-effective | Cost | A configuration with good performance but expensive |
| LEAST operational overhead | Operational burden | Building directly on EC2, custom scripts |
| MOST secure | Security | A configuration that works but leaves exposure paths |
| LEAST latency | Latency | Options lacking immediacy, like batch or asynchronous |
| FASTEST to implement | Implementation speed | Custom containers, direct implementation |

## Wrong-Answer Patterns: Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| You change your mind while reading the choices and get it wrong | Read the choices without deciding the answer first | Write the keyword→feature translation in your head, then check the choices |
| You pick the opposite every time on confusable pairs | Not reading subtle qualifier words | Underline "before deployment/in operation," "one-time/continuous" |
| You pick a choice that satisfies two of three conditions | Not counting the conditions | Number the conditions and check each choice |
| In cost questions you pick a choice that breaks performance | Looked only at the qualifier and ignored other requirements | A choice that breaks a requirement is eliminated regardless of the qualifier |
| You reflexively pick a service name you know | Judging by the service's "name" rather than its "role" | Recite exactly what that service does |
| You run out of time and can't solve the later questions | Dwelling too long on one question | If over 2 minutes, put a provisional answer + mark it and move on |

Tomorrow we finish with D-Day strategy.

## 📖 Glossary

- **Translation table**: A mapping that directly converts a scenario's requirement keywords into SageMaker feature names. It determines solving speed.
- **Confusable pair**: Two similar features the exam deliberately places side by side as choices in the same question. Separated by subtle qualifier words.
- **Subtle qualifier**: A short modifier that decides the answer, such as "before deployment vs in operation," "one-time vs continuous," "individual request vs whole dataset."
- **Superlative qualifier**: Expressions like MOST cost-effective and LEAST operational overhead that specify the comparison criterion. Narrows down to one answer when several choices all work.
- **Almost-correct trap**: A choice that misses one of the required conditions. Placed right next to the correct answer, so it catches the most people.
- **Role-twisting trap**: A choice that makes an actually existing service do something other than its original purpose (e.g., Model Monitor performing retraining).
- **Cost asymmetry**: A situation where the loss from false positives and false negatives differs in size. This asymmetry decides whether to look at Precision or Recall.
- **Threshold**: The cutoff value that splits classification probability into positive/negative. Lowering it raises Recall and lowers Precision.
- **Elimination**: A solving approach that narrows candidates by striking out choices that violate even one requirement.

---

## 📝 Practice Questions

**Question 1.** Before deployment, you want to check once whether the model's predictions are unfair to a particular group, and also report each feature's contribution to the prediction using SHAP. What is the most appropriate feature?

A) Model Monitor (Bias Drift)  
B) SageMaker Clarify  
C) CloudWatch dashboard  
D) Model Registry  

**Answer: B**  
Explanation: "One-time pre-deployment check + bias measurement + SHAP contribution" is exactly Clarify's role. A's Bias Drift is for continuous monitoring in operation, so it conflicts with the "one-time pre-deployment" condition; C is operational metric visualization and D is model version management, so both are unrelated to bias and explanation.

---

**Question 2.** You want to cut cost as much as possible with a training job that can be restarted even if interrupted. However, the deadline is not tight. What is the most appropriate choice?

A) Fixed on-demand instances  
B) Managed Spot Training (Spot instances)  
C) Finish quickly with a larger GPU instance  
D) Switch to serverless inference  

**Answer: B**  
Explanation: Managed Spot Training uses interruptible Spot instances to greatly reduce training cost and supports restarting via checkpoints, so it suits "interruptions acceptable + cost savings + relaxed deadline." A has no savings, C increases cost, and D is an inference option so it is unrelated to reducing training cost.

---

**Question 3.** Which of the following requirement-to-feature mappings is wrong?

A) Detect input data distribution changes → Model Monitor (Data Quality)  
B) Audit who deleted the endpoint → CloudTrail  
C) Access S3 without the internet → KMS encryption  
D) Cost savings for hundreds of similar models → multi-model endpoint (MME)  

**Answer: C**  
Explanation: Accessing S3 and ECR without the internet is the role of VPC endpoints (PrivateLink); KMS is encryption of data at rest and unrelated to the network path, so C is the wrong mapping. A, B, and D are each correct mappings: Data Quality drift detection, CloudTrail API audit, and MME cost savings for many models.

---

**Question 4.** You want to cut the inference cost of an internal tool whose traffic occurs only during business hours and drops to nearly 0 at night and on weekends. A slight delay on the first call (cold start) is acceptable. What is the most appropriate option?

A) Autoscale a real-time endpoint to 0 instances  
B) Serverless inference  
C) Batch transform  
D) A real-time endpoint with a larger instance  

**Answer: B**  
Explanation: Intermittent traffic + scaling to 0 + cold start acceptable is exactly the condition for serverless inference, where cost is close to 0 when idle. In A, real-time forces at least 1 instance so scaling to 0 is impossible; C is bulk processing, not an immediate response; and D actually increases always-on cost.

---

**Question 5.** What is the most accurate difference between Model Monitor's Data Quality and Model Quality monitors?

A) Data Quality needs ground-truth labels and Model Quality does not  
B) Data Quality looks at input data distribution/schema changes, while Model Quality looks at degradation of prediction performance against the actual ground truth and requires ground truth collection  
C) Both measure only bias  
D) Model Quality works only before training  

**Answer: B**  
Explanation: Data Quality compares input distribution/schema drift against a baseline, and Model Quality contrasts actual ground truth with predictions to measure performance degradation, so it requires collecting ground-truth labels. A swaps which one needs labels, C is a wrong restriction that says they only look at bias, and D is inconsistent with the facts since Model Quality is a monitoring feature in operation.

---
