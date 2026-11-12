# Day 5 - Week 7 Synthesis: MLOps Review

This week progressed from "deploy a model" to "automate model deployment and govern it". We code workflows with SageMaker Pipelines (Day 1), manage versions and approvals via Model Registry (Day 2), automate code-commit-to-deployment via CI/CD (Day 3), and standardize infrastructure and workflows via IaC and orchestrators (Day 4). Today we integrate these MLOps pieces into one big picture and organize decision criteria for tool selection on exams.

## End-to-End MLOps Flow at a Glance

Typical SageMaker MLOps pipeline from end to end:

```
[Code Push] → CodePipeline(Build) → CodeBuild → SageMaker Pipeline
   (preprocess → train → evaluate → ConditionStep[accuracy gate] → RegisterModel)
        ↓ Model registers to Registry as PendingManualApproval
[Reviewer Approves: Approved]
        ↓ EventBridge detects approval event
   CodePipeline(Deploy) → CloudFormation deploys staging → auto-test
        ↓ Manual approval gate
   Production endpoint deploy
```

This one diagram is this entire week. Recognizing which service implements each arrow means you're exam-ready.

> 💡 **Related Theory**: MLOps' three core principles are automation, reproducibility, and governance. Automation replaces manual intervention with triggers and pipelines; reproducibility ensures identical results by version-managing code, data, and infrastructure; governance tracks and controls who approved/deployed what. Every service this week implements at least one of these three.

## Daily Core Review

### Day 1 - SageMaker Pipelines
- Orchestrate ML workflow as code-defined **DAG**—SageMaker native service.
- Step types: ProcessingStep, TrainingStep, TuningStep, RegisterModel, **ConditionStep**, TransformStep, etc.
- **Parameters** inject values at execution → reuse same definition across environments.
- **Condition steps** create quality gates (like accuracy thresholds) auto-blocking poor models.
- Referencing one step's output as next step's input auto-creates DAG dependencies.

### Day 2 - Model Registry & Governance
- Registering to **Model Package Group** (purpose-grouped bundle) auto-increments **version**.
- Each version holds artifacts, inference image, evaluation metrics, **approval status**.
- Approval status: **PendingManualApproval → Approved / Rejected**.
- Status change emits EventBridge event → connects to deployment trigger.
- Links to SageMaker Lineage for data → training → model → deployment traceability (auditing).

### Day 3 - CI/CD for ML
- **SageMaker Projects**: Service Catalog template provisions repository, CodePipeline, CodeBuild, Registry, EventBridge all at once.
- **Build pipeline** (code-push trigger) vs **Deploy pipeline** (model-approval trigger).
- Service roles: CodeCommit (source), CodeBuild (build, `buildspec.yml`), CodePipeline (orchestration), CloudFormation (deploy), EventBridge (trigger).
- Staging → **manual approval gate** → production deploy minimizes blast radius.

### Day 4 - IaC & Orchestration
- **CloudFormation/CDK**: Define infrastructure as code (IaC) — idempotency, reproducibility, environment consistency.
- **Step Functions**: State machine orchestrating multiple AWS services (branching, parallel, retry, Catch).
- **EventBridge**: Schedule (cron) or event-based triggering — workflow start signal.
- **MWAA**: Managed Airflow — existing Airflow assets, hybrid, complex DAGs.

## Exam Tool-Selection Decision Criteria

Most-confused comparisons nailed down:

| Scenario Keywords | Answer Tool |
|---|---|
| SageMaker-centric, lineage/Registry integration | SageMaker Pipelines |
| Multiple AWS services (Lambda/Glue/SNS, etc.) orchestration | Step Functions |
| Infrastructure as reproducible, version-managed code | CloudFormation / CDK |
| Trigger workflow at set time/on event | EventBridge |
| Existing Airflow assets, hybrid, multi-cloud | MWAA |
| MLOps CI/CD infrastructure quickly via template | SageMaker Projects |
| Model version tracking, approval, auditing | Model Registry |
| Register only if accuracy passes threshold | Pipelines' ConditionStep |
| Auto-deploy on model approval | Registry approval → EventBridge → CodePipeline |

```python
# Synthesis code: pipeline end with condition passes → approval triggers deploy
# 1) Pipelines: ConditionStep(if_steps=[RegisterModel])  → quality gate
# 2) Registry: ModelApprovalStatus = "Approved"          → governance
# 3) EventBridge: ModelApprovalStatus=["Approved"] pattern   → CD trigger
# 4) CodePipeline + CloudFormation: staging→approval→production → safe deploy
```

## Common Pitfalls Summary

- **Pipelines vs Step Functions**: SageMaker-only → Pipelines; many services broadly → Step Functions. Both DAGs but different integration scope.
- **EventBridge is not workflow**: It's a start signal (trigger) only; workflow itself runs via Pipelines/Step Functions/CodePipeline.
- **MWAA is "when you already use Airflow"**: Starting new projects in SageMaker defaults to Pipelines. MWAA appears with existing-assets/hybrid keywords.
- **Approval status change = CD trigger**: "Auto-deploy on model approval" is almost always Registry approval → EventBridge → CodePipeline chain.
- **ConditionStep = quality gate**: "Register/deploy only if accuracy meets threshold" points to ConditionStep.

## Summary

- This week implemented MLOps' 3 principles (automation, reproducibility, governance) via SageMaker ecosystem tools.
- Complete chain: code push → Build → quality gate → register → approve → EventBridge → Deploy → staging → manual approval → production.
- Tool selection divides by "orchestration scope + existing assets + trigger type".
- Exams ask these tools separated by scenario — practicing keyword-to-tool mapping is key.

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
