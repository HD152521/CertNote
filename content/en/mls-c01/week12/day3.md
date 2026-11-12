# Day 3 - Domain 4 Integration: ML Implementation & Operations

## 📌 Key Takeaways

- **Domain 4 (ML implementation and operations) is weighted at 20%.** It is the final stage: deploying, monitoring, and optimizing a trained model.
- Pick the deployment type along three dimensions: **latency x traffic pattern x payload size.** Real-time / Serverless / Asynchronous / Batch.
- The key to safe rollouts is telling **Canary (gradual shift, users are affected)** apart from **Shadow (mirrored validation, users are not affected).**
- Operational monitoring splits by role: **Model Monitor (drift) / CloudWatch (infrastructure metrics) / CloudTrail (API auditing).**
- Late-exam scenarios **mix all four domains into a single passage.** Start by identifying "which stage is this question asking about?"

## Flow Map: From a Trained Model to Operations

Domain 4 is the stage where a trained model is actually deployed, operated safely, monitored, and optimized for cost and performance.

```text
[Trained model artifact (S3)]
   │
   ├─ 1) Choose a deployment type
   │     Real-time, low latency      → Real-time Endpoint
   │     Intermittent / cold start OK → Serverless Inference
   │     Large offline workload      → Batch Transform
   │     Huge payload / long runtime → Asynchronous Inference
   │
   ├─ 2) Safe rollout
   │     Blue/Green, Canary, Shadow traffic shifting
   │
   ├─ 3) Monitoring
   │     Data/model drift            → Model Monitor
   │     Ongoing bias/explainability → Clarify
   │     Infrastructure metrics/logs → CloudWatch
   │
   ├─ 4) Cost and performance optimization
   │     Auto Scaling, Multi-Model Endpoint, Spot training
   │
   └─ 5) Automation / governance
         Pipelines (MLOps), Model Registry, IAM/KMS
```

## Domain 4: The Four Inference (Deployment) Types

| Type | Latency | Traffic pattern | Payload | Idle cost | Endpoint | Typical clue |
|---|---|---|---|---|---|---|
| **Real-time Endpoint** | Milliseconds | Steady, always on | A few MB (6 MB) | Always incurred | Required (always on) | "low latency", "requests per second", "online service" |
| **Serverless Inference** | Has cold starts | Intermittent, unpredictable | Small | None (scales to 0) | Required (managed) | "occasionally invoked", "minimal operational overhead", "no idle cost" |
| **Asynchronous Inference** | Seconds to minutes | Sporadic, bursty | Very large (up to 1 GB) | Can scale down to 0 | Required | "large payload", "long processing time", "queue it and process later" |
| **Batch Transform** | Per job | Scheduled bulk processing | Entire dataset | None (when the job ends) | **Not required** | "every night", "just store it in S3", "real time not needed" |

```text
How should I deploy inference?
│
├─ Must it respond immediately when a request arrives?
│   ├─ No → Process a fixed dataset in one go?
│   │        ├─ Yes → Batch Transform (no endpoint needed)
│   │        └─ No (per-request but slow)
│   │              └─ Large payload or long processing → Asynchronous Inference
│   └─ Yes ↓
├─ Is traffic steady?
│   ├─ No (sparse) + cold start acceptable → Serverless Inference
│   └─ Yes ↓
└─ Real-time Endpoint (+ Auto Scaling)
     └─ Dozens to hundreds of models, each with little traffic → Multi-Model Endpoint
```

> 💡 **Related theory**: Choosing a deployment type is a three-dimensional judgment: "latency requirement x traffic pattern x payload size." If you need real-time low latency, choose Real-time; if traffic is sparse and you can tolerate cold starts, choose Serverless (cost savings); if you process a fixed dataset in one go, choose Batch Transform, which needs no endpoint; if the payload is large (GBs) and processing is long, Async is the answer. When you see "no need to keep an endpoint running all the time," Real-time becomes a wrong answer.

## Domain 4: Safe Deployment Strategies

| Strategy | Traffic handling | User impact | Rollback speed | Validation purpose |
|---|---|---|---|---|
| **Blue/Green** | Run old and new environments side by side, then switch all at once | 100% from the moment of the switch | Very fast (old environment is kept) | Safety of the switch itself |
| **Canary** | Shift gradually, starting with a small percentage | Exposed to a small group of users first | Fast (revert the percentage) | Early anomaly detection using real-usage metrics |
| **Linear** | Increase by a fixed percentage in steps | The percentage at each step | Fast | Gradual validation of load and latency |
| **Shadow** | Mirror traffic, discard the responses | **None** | Not needed (it is not a switch) | Risk-free performance and stability comparison |
| **A/B Testing** | Split traffic across variants | Different responses per group | Fast | Statistical comparison of business metrics |

- SageMaker deployment guardrails support all-at-once, canary, and linear traffic shifting on top of Blue/Green, and use CloudWatch alarms to trigger **automatic rollback**
- Adjusting the weights of Production Variants lets you split A/B traffic within a single endpoint

> 💡 **Related theory**: Canary and Shadow are often confused. With Canary, part of the real traffic is sent to the new model, so users receive the new results (gradual shift). With Shadow, traffic is mirrored to the new model as well, but its responses are not returned to users and are used only for comparison and validation (risk-free evaluation). If the wording is "validate the new model with production traffic without affecting users," it is Shadow.

## Domain 4: Monitoring and Governance

| Requirement | Service / feature |
|------|------|
| Anomalies in input data distribution or schema (data drift) | Model Monitor — **Data Quality** |
| Monitoring accuracy/F1 drops against the actual ground truth | Model Monitor — **Model Quality** (ground-truth labels required) |
| Whether prediction bias between groups grows over time | Model Monitor — **Bias Drift** (+ Clarify) |
| Whether the features driving predictions have changed | Model Monitor — **Feature Attribution Drift** (SHAP) |
| Bias and explainability analysis at training time | SageMaker Clarify |
| Tensor, gradient, and convergence problems during training | SageMaker Debugger |
| Endpoint latency, invocation counts, error rates, logs | CloudWatch (+ Logs) |
| Auditing who called which API and when | CloudTrail |
| End-to-end ML workflow automation (CI/CD) | SageMaker Pipelines |
| Model versioning and approval gates | Model Registry |
| Data and model lineage (which data was used for training) | SageMaker Lineage / Experiments |

There are two kinds of drift: data drift (the input distribution changes) and concept drift (the relationship between inputs and outputs changes). Model Monitor compares a baseline (the distribution at training time) with production data to detect drift, and when a threshold is exceeded it raises a CloudWatch alarm that can trigger retraining. For the scenario "the model gets worse and worse after deployment," the answer is almost always Model Monitor (+ retraining automation).

## Domain 4: Cost, Performance, and Security Optimization

| Goal | Technique |
|------|------|
| Handle traffic fluctuations | Endpoint Auto Scaling |
| Host many models at low cost | Multi-Model Endpoint |
| Reduce training cost | Managed Spot Training (up to 90% less) |
| Faster, cheaper inference | Inferentia/Elastic Inference, model compilation (Neo) |
| Protect data at rest and in transit | KMS encryption, S3 SSE, VPC endpoints |
| Least-privilege access | IAM roles, resource policies |

Managed Spot Training uses interruptible Spot instances to cut training cost substantially, and uses checkpointing to resume after an interruption. Training can be retried, so it suits Spot, but real-time inference that needs low latency does not. Branch as follows: "cost savings + training + interruption tolerated" means Spot; "reduce real-time inference cost" means Serverless/Auto Scaling/Inferentia.

## Exam Clue Keywords → Correct Service Translation Table

| Clue in the passage | Answer to choose |
|---|---|
| "Score everything in one pass every night and store it in S3" | Batch Transform |
| "There is no need to keep an endpoint running all the time" | Batch Transform or Serverless |
| "Only a few requests a day, minimal operational overhead" | Serverless Inference |
| "1 GB video, processing takes several minutes" | Asynchronous Inference |
| "Millisecond responses, always online" | Real-time Endpoint |
| "Each customer has its own model and each is rarely invoked" | Multi-Model Endpoint |
| "Validate the new model without affecting users" | Shadow testing |
| "Expose it to only some users first" | Canary deployment |
| "Roll back automatically when metrics worsen" | Deployment guardrails + CloudWatch alarm automatic rollback |
| "Whether the input distribution has changed since deployment" | Model Monitor (Data Quality) |
| "Compare with actual ground truth to monitor an accuracy drop" | Model Monitor (Model Quality) |
| "Latency and error-rate graphs and alarms" | CloudWatch |
| "Who deleted the endpoint" | CloudTrail |
| "Automatically detect whether the training loss is diverging" | SageMaker Debugger |
| "Explain the prediction rationale by feature" | SageMaker Clarify (SHAP) |
| "Define steps as a DAG for reproducibility and automation" | SageMaker Pipelines |
| "Deploy only after the model is approved" | Model Registry (approval status) |
| "Reduce training cost, interruption tolerated" | Managed Spot Training |
| "Optimize for the edge or specific hardware" | SageMaker Neo |
| "Transfer data without going over the internet" | VPC endpoint (PrivateLink) |
| "Encrypt data at rest and in transit" | KMS + S3 SSE + TLS |

## Commonly Confused Pairs

| Comparison | Key difference |
|------|------|
| **Real-time vs Serverless** | Always on, millisecond latency vs scales to 0, tolerates cold starts |
| **Real-time vs Async** | Immediate response vs queued with result notification, large payloads, long processing |
| **Async vs Batch Transform** | Per-request asynchronous (endpoint required) vs whole-dataset bulk (no endpoint required) |
| **Real-time vs Batch Transform** | Always-online low latency vs offline bulk, no standing cost |
| **Canary vs Linear** | Small share then expand (early anomaly detection) vs equal increments by a fixed percentage |
| **Canary vs Shadow** | Gradual shift (users affected) vs mirrored validation (users not affected) |
| **Shadow vs A/B** | Discard responses and compare performance only vs serve responses per group and compare business metrics |
| **Model Monitor vs CloudWatch vs CloudTrail** | Data/model drift vs infrastructure metrics/logs vs API call auditing |
| **Debugger vs Clarify** | The training **process** (tensors, gradients, convergence) vs **bias and explanation** of data and predictions |
| **Model Monitor Data vs Model Quality** | Compares input distribution only (no labels needed) vs performance against ground truth (labels needed) |
| **MME vs multiple endpoints** | Many models on one endpoint (lower cost, cold loads) vs a dedicated endpoint per model (isolation, guaranteed performance) |
| **Spot vs On-Demand** | Up to 90% cheaper, interruptible (checkpoints required) vs stable, no interruptions |
| **Neo vs Inferentia vs Elastic Inference** | Compile the model for the target hardware vs inference-dedicated chip instances vs attach acceleration to a CPU instance |
| **Pipelines vs Model Registry** | Run and automate steps as a DAG vs manage model versions and approval status |

## Four-Domain Integration: End-to-End Scenario Mapping

| Stage | Domain | Typical choice |
|------|------|------|
| Streaming ingestion | 1 | Kinesis Streams/Firehose |
| Lake storage and ETL | 1 | S3 + Glue, Athena |
| Cleaning, encoding, EDA | 2 | Missing-value handling, One-Hot, standardization, QuickSight |
| Algorithm, tuning, evaluation | 3 | XGBoost/CNN/DeepAR, AMT, F1/AUC/RMSE |
| Deployment, monitoring, optimization | 4 | Endpoint/Batch, Model Monitor, Spot |

### Case A — Real-Time Fraud Detection

| Requirement sentence | Domain | Choice |
|---|---|---|
| "Thousands of payment events arrive per second" | 1 | Kinesis Data Streams → Firehose to load into S3 |
| "Join with the ledger table to build features" | 1 | Glue ETL + Athena validation |
| "Fraud labels are only 0.2%" | 2 | Handle class imbalance, stratified split |
| "Predict fraud from tabular features" | 3 | XGBoost (correct imbalance with `scale_pos_weight`, etc.) |
| "Missed fraud is costly" | 3 | Evaluate on Recall and PR-AUC, adjust the threshold |
| "Decide within 100 ms during checkout" | 4 | Real-time Endpoint + Auto Scaling |
| "Performance drops when fraud tactics change" | 4 | Model Monitor → CloudWatch alarm → retraining |

### Case B — Nightly Batch Demand Forecasting

| Requirement sentence | Domain | Choice |
|---|---|---|
| "POS sales history is loaded into S3 daily" | 1 | S3 + Glue Catalog |
| "Missing weeks and outliers are mixed in" | 2 | Missing-value imputation, outlier handling, time-series visualization |
| "Forecast 4-week demand for hundreds of stores" | 3 | DeepAR (trains on many time series at once) |
| "Penalize days with large errors heavily" | 3 | Tune with RMSE as the objective metric, Minimize |
| "A single early-morning prediction run is enough" | 4 | Batch Transform (no endpoint needed) |
| "Want to reduce training cost" | 4 | Managed Spot Training + checkpoints |
| "Run the whole process automatically every week" | 4 | SageMaker Pipelines + Model Registry |

SageMaker Pipelines strings these five stages together into a single DAG for automation, and is the core of MLOps. Defining everything from data processing (Processing) → training (Training) → evaluation (Evaluation) → conditional registration (RegisterModel) → deployment as code makes it reproducible, version-controlled, and able to retrain automatically. When you see clues like "automate/standardize manual steps" or "CI/CD," the answer points to the Pipelines + Model Registry combination.

## Exam Weighting and Typical Question Forms by Domain

| Domain | Weight | Typical question form |
|---|---|---|
| **1. Data Engineering** | 20% | Choosing ingestion, storage, and transformation services (the four Kinesis services, S3/Glue/Athena, EMR) |
| **2. Exploratory Data Analysis** | 24% | Missing values, outliers, encoding, scaling, imbalance handling, choosing a visualization |
| **3. Modeling** | 36% | Algorithm selection, matching activation and loss, diagnosing overfitting, metrics and tuning |
| **4. ML Implementation and Operations** | 20% | Deployment type, safe rollout, monitoring, cost and security optimization |

- Late-exam scenario questions cross domain boundaries. **First mark "the stage being asked about" in the passage** and compare only the options for that stage
- Of the four options, two are usually "the right answer for a different stage." If the stage is different, an answer is wrong even if its content is correct

## Self-Check Questions

1. Score a large dataset offline in one go, no endpoint needed? → **Batch Transform**
2. Traffic is sparse and cold starts are tolerable? → **Serverless Inference**
3. Validate a new model with production traffic without affecting users? → **Shadow testing**
4. Detect whether the input distribution after deployment differs from training? → **Model Monitor**
5. Where do you get endpoint latency, error rate, and invocation count metrics? → **CloudWatch**
6. How do you cut training cost by up to 90% while tolerating interruptions? → **Managed Spot Training**
7. Host hundreds of models on one endpoint at low cost? → **Multi-Model Endpoint**
8. Which service automates and reproduces an ML workflow as a DAG? → **SageMaker Pipelines**
9. Inference with a 1 GB payload and long processing time? → **Asynchronous Inference**
10. To monitor an accuracy drop by comparing against actual ground truth? → **Model Quality in Model Monitor (labels required)**
11. To find out who deleted an endpoint? → **CloudTrail**
12. To make sure only approved models are deployed? → **Model Registry approval status + a Pipelines condition step**
13. To optimize a model for an edge device? → **SageMaker Neo**
14. Which domain carries the largest exam weight? → **Domain 3 Modeling (36%)**

## 📖 Glossary

- **Inference endpoint** : A server that exposes a trained model so it can be called over HTTPS. You pay for it while it is running.
- **Cold start** : The delay in a response when the first request arrives from an idle state because resources must be spun up anew. It is the price of serverless.
- **Data drift / concept drift** : The input distribution changes / the relationship between inputs and the ground truth itself changes. Both erode performance.
- **Baseline** : The statistics and schema from training time that Model Monitor treats as "normal." Production data is compared against it.
- **Shadow testing** : A validation method that mirrors real traffic to the new model too but discards its responses. Users are not affected at all.
- **Deployment guardrail** : A safety mechanism that shifts traffic in stages while watching metrics, and rolls back automatically if they worsen.
- **Multi-Model Endpoint** : Placing multiple models behind one endpoint and loading the needed model at invocation time. Advantageous when there are many models and each has little traffic.
- **Managed Spot Training** : An option that trains on spare capacity (Spot) to cut cost substantially. It can be interrupted, so checkpoints are essential.
- **SageMaker Neo** : A feature that compiles a model for the target deployment hardware to optimize inference speed and size.
- **Model Registry** : A repository that registers model versions and manages them with "approved/rejected" status. It puts a gate in place so only approved versions are deployed.

---

## 📝 Practice Questions

**Question 1.** You only need to score millions of transaction records in one pass every night and store the results in S3, with no need for real-time responses. Which inference method is MOST cost-effective?

A) Run a Real-time Endpoint 24 hours a day  
B) Keep an Asynchronous Inference endpoint always running  
C) Batch Transform  
D) Multi-Model Endpoint  

**Answer: C**  
Explanation: When a fixed large volume of data is processed offline in one pass and an always-on endpoint is not needed, Batch Transform is the most cost-effective. Always-on Real-time (A) and always-on Async (B) incur unnecessary standing costs, and Multi-Model (D) is for hosting multiple models.

---

**Question 2.** Before putting a new model into production, you want to validate its performance with real traffic while returning only the existing model's responses to users. Which strategy is MOST appropriate?

A) Canary deployment  
B) Immediate full cutover  
C) Blue/Green followed by an immediate 100% cutover  
D) Shadow testing  

**Answer: D**  
Explanation: Shadow testing replicates production traffic to the new model but does not return its responses to users, so it validates with no risk. With Canary (A), some real users receive the new model's responses, and immediate cutover (B) or immediate 100% (C) raises risk without validation.

---

**Question 3.** The prediction quality of a deployed model has been degrading gradually over several weeks. What should you use to automatically detect whether the input data distribution has changed from training time?

A) CloudTrail  
B) SageMaker Model Monitor  
C) AWS Config  
D) Elastic Inference  

**Answer: B**  
Explanation: Model Monitor compares the training-time baseline with production inputs to detect data/model drift and sends an alarm when thresholds are exceeded. CloudTrail (A) is for API auditing, Config (C) tracks resource configuration, and Elastic Inference (D) is inference acceleration; none is related to drift detection.

---

**Question 4.** You want to greatly reduce the cost of a training job and have designed it so that, even if the job is interrupted midway, it can resume from a checkpoint. Which option is MOST appropriate?

A) Managed Spot Training  
B) Use only On-Demand instances  
C) Serverless Inference  
D) Multi-Model Endpoint  

**Answer: A**  
Explanation: Managed Spot Training reduces training cost by up to 90% using interruptible Spot Instances and resumes from checkpoints after an interruption. On-Demand (B) offers no cost savings, and Serverless Inference (C) and Multi-Model (D) are inference-side features unrelated to training cost.

---

**Question 5.** You want to define an ML workflow consisting of data processing, training, evaluation, conditional model registration, and deployment as code, and automate it reproducibly. Which combination of core services is MOST appropriate?

A) Lambda alone invoking every step  
B) A cron script on an EC2 instance  
C) SageMaker Pipelines + Model Registry  
D) Use only a Glue crawler  

**Answer: C**  
Explanation: SageMaker Pipelines defines ML steps as a DAG and provides reproducibility, version control, and CI/CD, while Model Registry manages model versions and approval. Lambda alone (A) and cron scripts (B) are weak in standardization and reproducibility, and a Glue crawler (D) is for metadata cataloging.

---
