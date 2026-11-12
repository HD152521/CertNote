# Day 5 - Week 7 Synthesis: MLOps Review

## 📌 Key Takeaways

- This week implemented the three MLOps principles of **automation, reproducibility, and governance** with SageMaker ecosystem tools.
- The full chain: **code push → Build → quality gate → register → approve → EventBridge → Deploy → staging → manual approval → production**.
- Orchestrator selection rests on three criteria: **scope covered + existing assets + trigger type**.
- Two axes are easy to confuse: **Pipelines vs Step Functions vs MWAA** (workflows) and **EventBridge** (a trigger is not a workflow).
- The exam does not ask for tool names; it asks for a **scenario keyword → tool mapping**. It is worth memorizing the keywords.

## MLOps End-to-End Flow at a Glance

We coded workflows with Pipelines (Day 1), managed versions and approvals with the Registry (Day 2), automated everything from commit to deployment with CI/CD (Day 3), and standardized it with IaC and orchestrators (Day 4). Now we connect it all into one chain.

```text
[Code push] → CodePipeline(Build) → CodeBuild → SageMaker Pipeline
   (preprocess → train → evaluate → ConditionStep[accuracy gate] → RegisterModel)
        ↓ Model is registered in the Registry as PendingManualApproval
[Reviewer approves: Approved]
        ↓ EventBridge detects the approval event
   CodePipeline(Deploy) → deploy to staging with CloudFormation → automated tests
        ↓ Manual approval gate
   Deploy to production endpoint
```

This one diagram is the whole week. If you can name the service that implements each arrow, you are prepared for the exam.

| Link in the chain | Service responsible | Without this link |
|-------------------|---------------------|-------------------|
| Detecting code changes | CodePipeline source stage | A person has to run it by hand every time |
| Running commands | CodeBuild (`buildspec.yml`) | No compute to start the pipeline |
| Training/evaluation order | SageMaker Pipelines (DAG) | Order and dependencies exist only in someone's head |
| Quality verdict | ConditionStep | A model that misses the bar is registered anyway |
| Versions and approval | Model Registry | Cannot prove what was deployed |
| Approval detection | EventBridge | Approving triggers nothing |
| Deployment execution | CodePipeline + CloudFormation | Endpoints are updated by hand |
| Production control | ManualApproval action | Defects reach users immediately |

> 💡 **Related theory**: The three core principles of MLOps are automation, reproducibility, and governance. Automation replaces manual intervention with triggers and pipelines; reproducibility guarantees the same result by version-controlling code, data, and infrastructure; governance tracks and controls who approved and deployed what. Every service this week is a tool that implements at least one of these three.

| MLOps principle | Implementing tools | Where this week |
|-----------------|--------------------|-----------------|
| **Automation** | EventBridge, CodePipeline, CodeBuild, SageMaker Projects | Days 3-4 |
| **Reproducibility** | SageMaker Pipelines (parameters, DAG), CloudFormation/CDK | Days 1, 4 |
| **Governance** | Model Registry (approval status, Lineage), ManualApproval action | Days 2-3 |

## Core Review by Day

### Day 1 - SageMaker Pipelines
- A SageMaker-native service that orchestrates an ML workflow as a **DAG** defined in code.
- Step types: ProcessingStep, TrainingStep, TuningStep, RegisterModel, **ConditionStep**, TransformStep, LambdaStep, CallbackStep, FailStep, and more.
- **Parameters** inject values at execution time → the same definition is reused across environments.
- **Condition steps** build quality gates such as an accuracy threshold, automatically blocking poor models.
- When one step's output is referenced as the next step's input, the dependency automatically becomes a DAG edge. Without a reference, steps run in parallel.

### Day 2 - Model Registry & Governance
- Registering into a **Model Package Group** (a purpose-based bundle) **automatically increments the version**.
- Each version holds the artifact, inference image, evaluation metrics, and **approval status**.
- Approval status: **PendingManualApproval → Approved / Rejected**.
- An approval status change fires an EventBridge event → wired to a deployment trigger.
- Linked with SageMaker Lineage to provide data → training → model → deployment traceability (auditing). Rollback means redeploying the previous approved version.

### Day 3 - CI/CD for ML
- **SageMaker Projects**: A Service Catalog template provisions the repository, CodePipeline, CodeBuild, Registry, and EventBridge in one go.
- **Build pipeline** (triggered by code push) vs **Deploy pipeline** (triggered by model approval).
- Service roles: CodeCommit (source), CodeBuild (build, `buildspec.yml`), CodePipeline (orchestration), CloudFormation (deployment), EventBridge (trigger).
- Staging → **manual approval gate** → production deployment minimizes the blast radius.
- Approval happens twice. `Approved` in the Registry and the ManualApproval in CodePipeline are different decisions.

### Day 4 - IaC & Orchestration
- **CloudFormation/CDK**: Infrastructure as code (IaC) - idempotency, reproducibility, environment consistency. CDK, once synthesized, becomes CloudFormation.
- **Step Functions**: A state machine that connects multiple AWS services (Choice, Parallel, Retry, Catch). SageMaker is awaited to completion with `.sync`.
- **EventBridge**: Schedule (cron) or event-based triggers - the signal that starts a workflow.
- **MWAA**: Managed Airflow - existing Airflow assets, hybrid setups, complex DAGs.

## Decision Criteria for Choosing Tools on the Exam

The easily confused comparisons, pinned down in tables.

| Scenario keyword | Correct tool |
|------------------|--------------|
| SageMaker-job-centric, lineage/Registry integration | SageMaker Pipelines |
| Orchestrating multiple AWS services (Lambda/Glue/SNS, etc.) | Step Functions |
| Reproduce and version-control infrastructure as code | CloudFormation / CDK |
| Start a workflow at a set time or on an event | EventBridge |
| Existing Airflow assets, hybrid, multi-cloud | MWAA |
| Quickly stand up MLOps CI/CD infrastructure from a template | SageMaker Projects |
| Model version tracking, approval, auditing | Model Registry |
| Register only when the accuracy bar is met | ConditionStep in Pipelines |
| Automatic deployment on model approval | Registry approval → EventBridge → CodePipeline |
| Human control right before production release | CodePipeline ManualApproval action |
| Mark a below-threshold result as a failure and notify | `else_steps=[FailStep]` in ConditionStep |
| Run the same definition differently for dev/staging/prod | Pipeline Parameter |

The three workflow tools appear side by side especially often, so memorize them axis by axis.

| Comparison axis | SageMaker Pipelines | Step Functions | MWAA (Airflow) |
|-----------------|---------------------|----------------|----------------|
| Scope covered | Centered on SageMaker jobs | AWS services broadly | AWS plus on-premises and external |
| Lineage/Registry integration | Natively strong | Weak (wire it yourself) | Weak |
| Operating model | Managed (billed per job) | Serverless | Always-on environment (idle cost) |
| Definition style | SageMaker Python SDK | State machine (JSON/ASL) | Python DAG + operators |
| Deciding factor | "SageMaker alone is enough" | "Many steps live outside SageMaker" | "We already use Airflow" |

```python
# Synthesis concept code: at the end of the pipeline, register if the condition passes → approval triggers deployment
# 1) Pipelines: ConditionStep(if_steps=[RegisterModel])  → quality gate
# 2) Registry: ModelApprovalStatus = "Approved"          → governance
# 3) EventBridge: ModelApprovalStatus=["Approved"] pattern   → CD trigger
# 4) CodePipeline + CloudFormation: staging→approval→production → safe deployment
```

## Tracing the Chain Backwards

The exam does not only ask front to back. It also asks the reverse question: "prove where the model now running in production came from."

```text
Production endpoint
     │  EndpointConfig → Model
     ▼
Model Package (version N)       ← Model Registry
     │  approval status · approver · ApprovalDescription
     │  ModelMetrics (evaluation metrics)
     ▼
Training Job                    ← with which Estimator and hyperparameters
     │  ModelArtifacts.S3ModelArtifacts
     ▼
Processing Job (preprocessing)  ← with which input data
     ▼
Raw S3 dataset · Git commit hash
```

- The point where this chain breaks is usually **manual intervention**. A model built by hand in the console or an artifact uploaded from a laptop has no lineage.
- So when "auditable" is required, the answer is always **registration through the pipeline + Registry + Lineage**, not log searching or S3 versioning.

| Audit question | Where the answer lives |
|----------------|------------------------|
| Which version is deployed right now | EndpointConfig → Model → Model Package ARN |
| What was that version's performance | ModelMetrics on the Model Package |
| Who approved it and when | Approval status change history, ApprovalDescription |
| What data was it trained on | Lineage → Training Job → input channel S3 path |
| Why did this model pass | ConditionStep result of the pipeline execution |

## Common Pitfalls Summary

- **Pipelines vs Step Functions**: "SageMaker only" means Pipelines; "many services broadly" means Step Functions. Both are DAGs, but the integration scope differs.
- **EventBridge is not a workflow**: It is only a start signal (trigger); the workflow itself is carried out by Pipelines/Step Functions/CodePipeline.
- **MWAA is the answer for "when you already use Airflow"**: If you are starting a new project inside SageMaker, Pipelines comes first. MWAA shows up alongside existing-asset or hybrid keywords.
- **Approval status change = CD trigger**: "Automatic deployment on model approval" is almost always the chain Registry approval → EventBridge → CodePipeline.
- **ConditionStep = quality gate**: "Register/deploy only when accuracy is at or above the threshold" points to ConditionStep.
- **CDK is not a replacement for CloudFormation**: Its synthesized output is a CloudFormation template. The question is not "which is more powerful" but how you author.
- **Keep parameters as objects**: Pulling out `default_value` kills runtime injection.
- **Approval shows up twice**: `Approved` in the Registry (the decision to put it on the deployment flow) and ManualApproval in CodePipeline (the decision to release to production) are different gates.
- **Do not mix up CodeBuild and CodePipeline**: The compute that actually runs commands is CodeBuild; CodePipeline only manages the order.

## Final Check: Situation → What to Choose

| Situation | Answer |
|-----------|--------|
| Retraining must run automatically every day at dawn | EventBridge schedule rule → pipeline execution |
| You approved, but deployment does not start | Check the EventBridge rule pattern and target connection |
| Steps run simultaneously with no order | Add dependencies through output references or `depends_on` |
| You must submit the deployed model's provenance for an audit | Model Registry + SageMaker Lineage |
| The new model is bad and must be reverted immediately | Redeploy with the previous approved version's ARN (rollback) |
| dev/prod endpoint configurations differ from each other | Unify them with a CloudFormation/CDK template |
| A Glue ETL and a Lambda notification must be tied into one flow | Step Functions |
| A below-threshold run ended as a success and nobody noticed | Explicit failure with `else_steps=[FailStep]` |
| Preprocessing reruns on every execution and costs too much | `CacheConfig` on the steps that do not change |
| On-premises jobs must be tied into one DAG | MWAA |
| You must build the repository, pipeline, and Registry from scratch | SageMaker Projects template |
| Approval is automatic, but a human checks only the production release | Automatic approval + CodePipeline ManualApproval |

> 💡 **Concept**: The fastest way to solve this week's questions is to **decide the layer first**. Decide which of four layers is being asked: "what exists (IaC) / what runs in what order (workflow) / when it starts (trigger) / who is accountable (governance)". Usually two of the four answer choices are tools from other layers and are eliminated immediately.

Next week we move on to monitoring and observability for deployed models.

## 📖 Glossary

- **MLOps**: A way of building, deploying, and watching models through automated pipelines rather than by hand.
- **Automation, reproducibility, governance**: The three MLOps principles. Reduce human intervention / guarantee the same result / leave a record of who approved.
- **Quality gate**: An automated checkpoint that passes only models that clear a performance bar to the next stage. In Pipelines, ConditionStep plays this role.
- **CI/CD chain**: The entire automated path from code push to production deployment.
- **Build pipeline / Deploy pipeline**: The former runs through training and registration when code changes; the latter runs through deployment when a model is approved.
- **Trigger**: A signal that starts a workflow. It is either a schedule or an event. It is different from the workflow itself.
- **Orchestrator**: A tool that manages the execution order, branching, and retries of multiple tasks. Pipelines, Step Functions, and MWAA belong here.
- **Lineage**: A connection record that lets you trace back which data, code, and jobs produced this model.
- **ManualApproval gate**: A human checkpoint placed in the middle of an automated deployment flow. A device for reducing the blast radius.
- **Rollback**: Returning to the last good version when a new deployment is wrong. Possible because versions remain in the Registry.

---

## 📝 Practice Questions

**Question 1.** Which of the following is the LEAST appropriate pairing of the three MLOps principles (automation, reproducibility, governance) and the tool that implements them?

A) Reproducibility → CloudFormation/CDK (IaC)  
B) Governance → Model Registry approval workflow  
C) Automation → EventBridge trigger + CodePipeline  
D) Governance → CloudFront caching  

**Answer: D**  
Explanation: CloudFront is a content delivery CDN and is unrelated to model governance. A is infrastructure reproducibility, B is approval and audit governance, and C is trigger and pipeline automation, all of which are correct pairings.

---

**Question 2.** One ML workflow passes through multiple services as Glue ETL → SageMaker training → Lambda post-processing → SNS notification, and another workflow consists only of SageMaker preprocessing → training → evaluation → registration. What is the most suitable orchestrator for each?

A) SageMaker Pipelines for both  
B) Step Functions for the former and SageMaker Pipelines for the latter  
C) EventBridge for the former and CloudFormation for the latter  
D) MWAA for both  

**Answer: B**  
Explanation: Step Functions suits workflows spanning multiple AWS services, and Pipelines suits workflows made up of only SageMaker jobs that need lineage and Registry integration. A and D fail to distinguish the scope, and C wrongly designates EventBridge (a trigger) and CloudFormation (IaC) as orchestrators.

---

**Question 3.** You want to block registration if the model evaluation accuracy is below the threshold and, after approval, automatically deploy all the way to production. What is the correct connection of components?

A) ConditionStep (quality gate) → Registry approval → EventBridge → CodePipeline deployment  
B) Batch Transform → QuickSight → Athena  
C) Data Wrangler → Ground Truth → Feature Store  
D) CloudFront → S3 → SNS  

**Answer: A**  
Explanation: This is the standard MLOps chain: the accuracy gate is Pipelines' ConditionStep, approval is the Registry, detecting the approval event is EventBridge, and deployment is CodePipeline. B is analytics, C is data preparation/labeling, and D is content delivery, all unrelated to the deployment automation flow.

---

**Question 4.** An organization already runs complex dependencies, including on-premises ones, as Apache Airflow DAGs. Which option correctly pairs the recommended tool for continuing them on AWS as a managed service with the recommended tool for starting a completely new project inside SageMaker?

A) Existing Airflow → MWAA, new SageMaker project → SageMaker Pipelines  
B) Existing Airflow → SageMaker Pipelines, new project → MWAA  
C) Step Functions for both  
D) EventBridge for both  

**Answer: A**  
Explanation: Existing Airflow assets and hybrid setups continue on MWAA, and for new SageMaker-native workflows Pipelines is preferred. B is swapped, and C and D do not reflect the difference between the two situations.

---

**Question 5.** In standard MLOps using SageMaker Projects, which is correct about what a "code push" and a "model Approved" each trigger?

A) Code push → Deploy pipeline, model approval → Build pipeline  
B) Code push → Build pipeline (training and registration), model approval → Deploy pipeline (deployment)  
C) Code push → CloudFront invalidation, model approval → Athena query  
D) Both trigger the same single pipeline  

**Answer: B**  
Explanation: A code push triggers the Build pipeline (CI) that trains and registers the model, and a model approval triggers the Deploy pipeline (CD) that deploys the endpoint, so the two flows are separated. A is swapped, C is unrelated services, and D does not match the separated CI/CD structure.

---
