# Day 4 - MLOps Deep Dive: Science of Drift, Feature Store, Automated Retraining Pipelines

The most common shock teams hit 6 months after pushing an ML model to production is: "the model silently started failing." The code unchanged, infrastructure healthy, error logs clean. Yet recommendation click-through drops, fraud detection misses new patterns. The cause isn't code—it's that **the world changed**. Input data distribution shifted from training time (data drift), or the outcome pattern itself changed (concept drift). Traditional software operations (DevOps) have no tools for this "silent degradation." **MLOps** addresses ML systems' unique problem—data dependency, drift, train-serve skew, automated retraining—as operational discipline. In SAP-C02, MLOps appears as "how do we monitor quality post-deployment?", "how do we auto-trigger retraining?", "how do we govern model approval/deployment?" as operational architecture.

Today, instead of listing MLOps tools, we'll deconstruct why drift occurs and how to detect it, what structural problems Feature Store solves, and how a fully-automated retraining pipeline assembles.

## Why MLOps Differs from DevOps — Beyond Code, Data Changes

DevOps's core assumption: "if code doesn't change, behavior doesn't change"—determinism. That's why CI/CD focuses on testing and deploying code changes. ML breaks this. Model behavior depends on **(1) training data, (2) production-time input data distribution**. Fixed code + changed data = changed behavior. MLOps adds to DevOps: **data/model versioning, drift monitoring, automated retraining**.

ML systems need three kinds of "versions"—code, data, models. Without tracking their combination (lineage), you can't answer "which data trained which model, running now?" and debugging becomes impossible. SageMaker bundles this: Pipelines (workflows), Model Registry (model versions), Feature Store (data), Lineage Tracking.

> 💡 **Related Theory**: Data Drift and Concept Drift are distinct phenomena. **Data Drift (covariate shift)** is when input X distribution changes—e.g., new user demographics shift age distribution. Model becomes inaccurate outside training-seen ranges. **Concept Drift** is when the relationship P(Y|X) itself changes—e.g., pandemic makes "mask purchase" shift from normal to anomalous to normal again. Data Drift detectable from inputs alone (no labels needed); Concept Drift needs actual ground truth. This maps to Model Monitor's two types: Data Quality vs Model Quality.

## Model Monitor — 4 Types of Monitoring and What Needs Labels

**Model Monitor** captures production endpoint input/output, compares against baseline (training data statistics). Four types exist; core distinction: "does actual ground truth (labels) matter?"

- **Data Quality**: Input feature distributions/statistics (mean, missing, range) deviate from baseline? **No labels needed**—inputs alone. Data Drift detection.
- **Model Quality**: Prediction accuracy/precision/recall fallen? **Needs labels**—actual answers required to compute accuracy. Concept Drift detection.
- **Bias Drift**: Model bias (unfavorable predictions to certain groups) growing over time? Clarify integration.
- **Feature Attribution Drift**: Each feature's prediction contribution (SHAP values) changing?

Results stored in S3, alerted via CloudWatch.

> 🔍 **Deep Dive**: Model Quality monitoring is hard because of **label latency**. A fraud model predicts "this transaction is normal," but knowing if it was actually fraud requires chargeback—days to weeks later. Real-time accuracy unknown. So teams monitor Model Quality where labels come quickly, Data Quality (input distribution change as early warning) where labels lag. Input distribution shifting drastically signals "model at risk" even without knowing ground truth. Exams: "detect model risk without labels" = Data Quality, "detect actual accuracy drop" = Model Quality.

> 📚 **Case Study**: An e-commerce recommendation team silently watched accuracy degrade for months before discovering it via sales drop. Root cause: new marketing campaign brought users whose behavior distribution vastly differed from training data (data drift). Enabling Model Monitor Data Quality and connecting input distribution deviation past baseline to CloudWatch Alarms, they got immediate alerts. Piping to EventBridge autostarted retraining—when distribution exceeded thresholds, alerts fired, auto-retraining kicked in. Lesson: detect drift "when inputs change," not "after it explodes." Waiting for labels is too late.

## Feature Store — Train-Serve Skew Structural Trap

ML's most elusive bug: **train-serve skew**. Training-time feature calculation code subtly differs from inference-time code, so models receive "input never seen in training" and silently fail. Example: training batched "7-day average purchase" differently than real-time code's hour-handling, values diverge. No errors, clean logs, accuracy drops alone.

**Feature Store** prevents this structurally. Define/compute features once, store centrally, ensure training and inference **read identical features from synchronized stores**.

| Store | Backend | Traits | Use |
|-------|---------|--------|-----|
| **Online Store** | DynamoDB | Low-latency (ms) single-fetch | Real-time inference |
| **Offline Store** | S3 + Glue catalog | High-volume, historical | Training, batch, analytics |

Synced automatically. Feature groups defined by **Record Identifier** (e.g., customer_id) and **Event Time** to track point-in-time feature values.

> 💡 **Related Theory**: Feature Store's Online/Offline split mirrors OLTP vs OLAP separation (Day 42). Inference "fetches one customer's features in milliseconds" (OLTP→DynamoDB); training "scans millions of rows of historical features" (OLAP→S3). One store can't excel at both; split and sync. Point-in-time correctness—using "features knowable at that point"—prevents **data leakage** (future info bleeding into training). Event Time-based queries guarantee this. Exams: "prevent training/inference feature mismatch" always maps to Feature Store.

## Model Registry — Model Governance and Approval Workflow

Deploying which model to production isn't a casual decision. **Model Registry** manages model versions in **Model Package Groups**, assigning approval states (PendingManualApproval / Approved / Rejected) to each version. Auto pipelines train/evaluate, register to registry (Pending), humans review then approve, Approved event fires via EventBridge triggering auto-deployment. This merges "automation efficiency" with "human governance."

> 🔍 **Deep Dive**: Registry approval gates matter especially in regulated industries (finance, healthcare). If models determine credit scores or diagnoses, you must audit "what data trained this, what validation passed, who approved when?" Model Registry preserves lineage and approval history. Catching Approved state via EventBridge rule and triggering Lambda deployment creates "human approval + auto deploy" hybrid—neither fully automatic nor fully manual—governed automation. Exams: "model review before deploy + auto deploy on approval" = Model Registry + EventBridge.

## Complete Auto MLOps Pipeline — Closing the Retraining Loop

Stitching all pieces: self-healing ML systems.

```
[CodeCommit/Git] → [CodePipeline] → [SageMaker Pipeline (DAG)]
       │
       ├─▶ [Processing: feature engineering] (Feature Store load)
       ├─▶ [Training: Spot + Checkpoint]
       ├─▶ [Evaluation: metric calculation]
       │         │
       │    [Condition Step] Accuracy > 0.9?
       │         │ yes
       ├─▶ [Model Registry: register (Pending)]
       │         │
       │    [Manual Approval] (governance gate)
       │         │ Approved
       ├─▶ [EventBridge Rule → Lambda → Endpoint deploy]
       │
       └─▶ [Model Monitor: drift watch]
                 │ drift threshold exceeded
                 └─▶ [EventBridge → Pipeline re-run] ← loop closed
```

**SageMaker Pipelines** orchestrates this full DAG, auto-tracks input/output/execution via Lineage, skips unchanged steps via caching. Model Monitor detects drift, EventBridge re-runs pipeline, loop closes.

> 🎯 **Scenario**: "Production model accuracy falls over time, auto-detect, auto-retrain without human if threshold exceeded, but new model needs data scientist approval before deployment. Full architecture?" — Answer: **Model Monitor (drift detect) → CloudWatch Alarm/EventBridge (trigger) → SageMaker Pipelines (retrain DAG) → Model Registry (Pending register) → manual approval → EventBridge (Approved event) → Lambda (Endpoint deploy)**. Core: drift/retrain auto (EventBridge), deploy governed (Model Registry approval gate). "Auto trigger + human approval" is the hybrid answer. Trap: retraining auto via EventBridge+Pipelines, deployment governance via Model Registry approval.

> ⚠️ **Trap**: "Make ML pipeline as DAG" problems: Step Functions, MWAA (Airflow), Glue Workflow also do DAG orchestration, looking answerable. But if **ML-specific (experiment tracking, model lineage, training/tuning/eval steps, Model Registry link, step caching)** is needed, SageMaker Pipelines is correct. Step Functions suits general workflows (mixed ML/non-ML); MWAA for complex scheduling/existing Airflow migration; Glue Workflow for ETL. Exams: "ML workflow + Lineage/experiments/caching" = SageMaker Pipelines.

## CI/CD for ML — SageMaker Projects

You can use traditional CI/CD tools (CodePipeline, CodeBuild, CodeCommit) for ML, but **SageMaker Projects** provides MLOps CI/CD templates pre-configured. Model build (train→evaluate→register) pipeline and model deploy (approve→stage→prod) pipeline come ready-built, reducing boilerplate. Alternative/supplement to GitHub Actions, Jenkins.

## Summary

MLOps solves "code and data change differently" via operational discipline. Detect drift (Data/Concept) with Model Monitor (label-dependent split: Data Quality vs Model Quality), prevent train-serve skew structurally via Feature Store, govern model versions/approvals via Model Registry, orchestrate full DAG via SageMaker Pipelines, close retraining loop via EventBridge.

SAP exam common mappings: (1) "training/inference feature mismatch" → Feature Store, (2) "detect drift without labels, fast" → Model Monitor Data Quality, (3) "detect actual accuracy drop" → Model Monitor Model Quality, (4) "human review then auto deploy" → Model Registry + EventBridge, (5) "ML workflow DAG + Lineage" → SageMaker Pipelines, (6) "group bias time-drift" → Model Monitor + Clarify Bias Drift, (7) "MLOps CI/CD template" → SageMaker Projects. Next day: Week 10 full synthesis with 12-scenario problems.

---

## 📝 Practice Questions

**Question 1.** You want to structurally prevent train-serve skew, where the features computed in batch during training differ subtly from those computed during real-time inference, causing the model to become silently inaccurate. Which is the most appropriate?

A) Store features in S3 and have both sides read them
B) SageMaker Feature Store(Online/Offline)
C) Combine the training and inference code into the same Lambda
D) Cache inference results in DynamoDB

**Answer: B**
Explanation: Feature Store defines and computes features once and stores them centrally, so training (Offline/S3) and inference (Online/DynamoDB) read identically defined features from automatically synchronized stores, structurally preventing train-serve skew. Point-in-time lookups based on Event Time also prevent data leakage. A (shared S3), C, and D require you to manage feature definitions, versions, and synchronization yourself, so the skew risk remains. Trap: "consistency of training and inference features" is Feature Store.

---

**Question 2.** For a fraud detection model, the actual ground truth (chargebacks) arrives only days later. You want to detect the production model's risk early without waiting for labels. Which monitoring should you use?

A) Model Monitor Model Quality
B) Model Monitor Data Quality
C) Clarify Bias Drift
D) CloudWatch Custom Metric only

**Answer: B**
Explanation: Data Quality monitoring looks at whether the distribution and statistics of input features have deviated from the training baseline, and it needs no labels. In domains with long label delays, input distribution change (data drift) is used as an early warning. A (Model Quality) calculates actual accuracy, so it requires labels and would mean waiting days. C (Bias Drift) is for changes in bias. D lacks automation for ML baseline comparison and drift detection. Trap: "early detection without labels" is Data Quality; "actual accuracy decline" is Model Quality.

---

**Question 3.** Before an automatically trained new model is deployed to production, a data scientist must review and approve it, and once approved it must be deployed automatically to the endpoint without human intervention. Which configuration should you use?

A) CodePipeline Manual Approval only
B) Model Registry approval status + EventBridge (Approved) → Lambda deployment
C) Implement it directly with a Lambda gate
D) Jenkins build approval

**Answer: B**
Explanation: Model Registry assigns an approval status (Pending/Approved/Rejected) to model versions to create a human review gate, captures the Approved event through EventBridge, and automatically triggers a Lambda deployment. This hybrid governance of "human approval + automatic deployment after approval" is the standard for ML model deployment. A is a general pipeline approval, not model version and lineage governance. C and D have a heavy implementation burden. Trap: "model review approval + automatic deployment on approval" is Model Registry + EventBridge.

---

**Question 4.** You want to automatically detect a decline in actual prediction accuracy over time (concept drift) while the model is in production. Actual labels are obtainable. Which monitoring should you use?

A) Model Monitor Data Quality
B) Model Monitor Model Quality
C) Feature Attribution Drift
D) Trusted Advisor

**Answer: B**
Explanation: Model Quality monitoring compares actual ground truth (labels) with predictions to detect declines in accuracy, precision, and recall, which corresponds to detecting concept drift (a change in the input-to-ground-truth relationship). The condition that labels are obtainable is what makes Model Quality possible. A (Data Quality) looks only at the input distribution and does not know actual accuracy. C is about changes in feature attribution, and D is not an ML monitor. Trap: "actual accuracy decline + labels available" is Model Quality.

---

**Question 5.** You must detect whether bias, in which the model's predictions become unfavorable to a specific demographic group, grows over time. Which combination should you use?

A) Model Monitor + Clarify Bias Drift
B) DataBrew
C) Comprehend
D) GuardDuty

**Answer: A**
Explanation: Bias Drift in Model Monitor is integrated with SageMaker Clarify and detects whether the bias metrics of model predictions change over time relative to the baseline. B (DataBrew) is a data preparation tool, C (Comprehend) is NLP, and D (GuardDuty) is threat detection; all are unrelated to model bias. Trap: "detecting bias change over time" is Model Monitor + Clarify Bias Drift.

---

**Question 6.** You want to express an ML workflow running through preprocessing, training, tuning, evaluation, registration, and deployment as a DAG, automatically track the input/output lineage and experiments of each step, and cache unchanged steps. Which is the most appropriate?

A) AWS Step Functions
B) SageMaker Pipelines
C) Amazon MWAA(Airflow)
D) Glue Workflow

**Answer: B**
Explanation: SageMaker Pipelines is an ML-specific DAG orchestrator that provides training/tuning/evaluation/registration steps, Model Registry integration, automatic Lineage tracking, and step caching out of the box. A (Step Functions) suits general-purpose workflows (mixing non-ML tasks), C (MWAA) suits complex scheduling and migrating existing Airflow, and D (Glue Workflow) suits ETL, but none of them has ML lineage or experiment tracking. Trap: "ML workflow + Lineage/experiments/caching" is SageMaker Pipelines.

---

**Question 7.** When the input distribution of a production model changes beyond a threshold, you want to run the retraining pipeline automatically without human intervention. Which connection should you use?

A) CloudWatch Alarm → manual retraining
B) Model Monitor drift → EventBridge → re-run the SageMaker Pipeline
C) Lambda cron that retrains unconditionally every day
D) Config rule → SNS

**Answer: B**
Explanation: When Model Monitor detects drift, it emits an event through CloudWatch/EventBridge, and an EventBridge rule triggers a re-run of the SageMaker Pipeline, automatically closing the retraining loop. A is manual, so it is not automation. C (unconditional daily retraining) wastes cost and resources regardless of drift. D is for configuration compliance and is unrelated to ML retraining. Trap: "drift detection → automatic retraining" is Model Monitor + EventBridge + Pipelines.

---

## 📌 Today's Summary

1. **MLOps ≠ DevOps** — Code, data, models all change. Three-type versioning + lineage tracking critical
2. **Data Drift vs Concept Drift** — Input distribution change (no labels) vs input-output relationship change (labels needed)
3. **Model Monitor 4 types** — Data Quality (label-free, early warning), Model Quality (labels, accuracy), Bias Drift, Feature Attribution Drift
4. **Feature Store** — Online (DDB low-latency inference) / Offline (S3 training/analytics) auto-synced. Prevents train-serve skew and data leakage
5. **Model Registry** — Model versioning, approval gates (Pending/Approved/Rejected). Approved → EventBridge → auto-deploy
6. **SageMaker Pipelines** — ML-specific DAG, Lineage/experiments/caching. Step Functions/MWAA general-purpose
7. **Retraining loop** — Model Monitor drift → EventBridge → Pipeline re-run. SageMaker Projects = MLOps CI/CD template
