# Day 3 - CI/CD for ML: SageMaker Projects, CodePipeline/CodeBuild Integration, Automated Deployment

Yesterday we built pipelines (Day 1) and Model Registry (Day 2). But if every code change requires manual pipeline re-run in a notebook, manual approval clicks, and manual endpoint updates, it is still manual operations. **CI/CD (Continuous Integration / Continuous Deployment)** automates the chain from code commit to model deployment. Bringing software engineering's CI/CD directly to ML is the final MLOps puzzle.

Today we cover AWS ML CI/CD tools: **SageMaker Projects** and the supporting **CodePipeline / CodeBuild / CodeCommit integration** plus automated deployment flow. MLA-C01 tests this combination in scenarios: "make code changes auto-trigger model retraining and deployment".

## Applying CI/CD to ML

Traditional software CI/CD is code push → build → test → deploy. ML adds **data and models** as new axes.

- **CI (Continuous Integration)**: On code (preprocessing, training scripts) change, auto-run pipeline to train/evaluate model and register to Registry.
- **CD (Continuous Deployment)**: On model approval, auto-deploy to staging/production endpoints.

You can hand-wire these, but AWS provides **SageMaker Projects**—a template setting up the entire skeleton at once.

> 💡 **Related Theory**: ML CI/CD's core philosophy is "make model deployment version-managed, automated, and rollback-capable like software deployment". Code, data, and models are all tracked; changes auto-trigger via events; problems allow rollback to previous versions. On exams, "Git commit → auto-retrain/deploy" flow hints at SageMaker Projects + Code* services combined.

## SageMaker Projects — MLOps Template

SageMaker Projects **provisions MLOps CI/CD infrastructure via pre-configured templates (Service Catalog-based)**. Creating a project auto-provisions:

| Created Resource | Role |
|------------------|------|
| Source code repo (CodeCommit or Git) | Preprocessing, training, deployment code |
| Build pipeline (CodePipeline + CodeBuild) | On code change, run SageMaker Pipeline → register model |
| Deploy pipeline (CodePipeline) | On model approval, deploy to staging/prod endpoints |
| Model Registry group | Trained model version catalog |
| EventBridge rules | Detect code push/model approval events, trigger |

Basically, what you manually built yesterday and day-before-yesterday ships as standard template all-in-one. A representative template is "model building, training, and deployment", creating two repos: build and deploy.

## Two Pipelines: Build and Deploy

SageMaker Projects' standard structure splits into two stages.

**1) Build (model build) Pipeline** — Code-centric
- Developer pushes training code to repo
- CodePipeline detects change, runs CodeBuild
- CodeBuild executes SageMaker Pipeline (preprocess → train → evaluate → register)
- Resulting model registers to Model Registry as `PendingManualApproval`

**2) Deploy (model deploy) Pipeline** — Model-centric
- Model in Model Registry changes to `Approved`
- EventBridge detects approval event, triggers Deploy pipeline
- CloudFormation deploys staging endpoint → auto-test
- Manual approval gate passes, production endpoint deploys

Thus code change (CI) and model approval (CD) trigger separate pipelines.

## CodeCommit / CodeBuild / CodePipeline Roles

Distinguishing each service's responsibility is key for exams.

| Service | Role |
|---------|------|
| CodeCommit | Git source repo (code version control) |
| CodeBuild | Build/test execution environment (define commands via buildspec.yml) |
| CodePipeline | Orchestrator linking stages (source → build → deploy flow) |
| CloudFormation | Deploy infrastructure (endpoints, etc.) as code |
| EventBridge | Event-based triggering (code push, model approval) |

CodeBuild work is defined in `buildspec.yml`. For example, running SageMaker Pipeline build phase looks like:

```yaml
# buildspec.yml — commands CodeBuild executes
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.11
    commands:
      - pip install -r requirements.txt
  build:
    commands:
      # On code change, create/update SageMaker Pipeline and run
      - python pipelines/run_pipeline.py --upsert
      - python pipelines/run_pipeline.py --start
```

## Auto-Deployment Trigger: Approval → EventBridge → Deploy

CD's heart is yesterday's **model approval event**. When Model Registry approval status changes, EventBridge catches it and starts Deploy pipeline.

```python
import boto3
events = boto3.client("events")

# Rule: on approval status → Approved, trigger Deploy pipeline
events.put_rule(
    Name="trigger-deploy-on-approval",
    EventPattern="""{
      "source": ["aws.sagemaker"],
      "detail-type": ["SageMaker Model Package State Change"],
      "detail": {
        "ModelApprovalStatus": ["Approved"]
      }
    }""",
)
```

Setting this rule's target to Deploy CodePipeline means the moment a person approves the model, deployment rolls automatically. The safe pattern places a **manual approval step** between staging validation and production deploy.

```python
# CodePipeline stages example (conceptual): staging → manual approval → production
# 1. DeployStaging   (CloudFormation creates staging endpoint)
# 2. ApprovalGate    (person reviews staging results, approves)
# 3. DeployProd      (production endpoint deploys)
```

> 💡 **Related Theory**: Staged deploy staging → manual approval → production follows the "minimize blast radius" principle. Validating new models in staging before production gates prevents defects from reaching users. On exams, "auto-deploy safely with production governance" hints at CodePipeline's manual approval action.

## Direct Setup vs SageMaker Projects

You can achieve the same result wiring CodePipeline, CodeBuild, and EventBridge directly without Projects. The differences:

- **SageMaker Projects**: When wanting to rapidly standard MLOps template. Service Catalog bundles governance/reuse. On exams, "quickly standardize MLOps" → this direction.
- **Direct setup**: Integrating with existing CI/CD pipelines or unusual requirements. Flexible but labor-intensive.

## Summary

- ML CI/CD automates code change → auto retrain/register (CI) and model approval → auto deploy (CD).
- SageMaker Projects provisions an MLOps template made of CodeCommit/CodePipeline/CodeBuild/Registry/EventBridge all at once.
- Build pipeline triggers on code push; Deploy pipeline triggers on model approval.
- Approval → EventBridge → CodePipeline → CloudFormation deploy is the standard CD chain, with manual approval gate before production raising safety.
- "Auto-deploy from Git commit to model deployment, standardized" → SageMaker Projects + Code* combination is the answer.

---

## 📝 Practice Questions

**Question 1.** An ML team wants to provision the source repositories, build/deploy pipelines, and Model Registry needed for MLOps all at once from a preconfigured template. What is most suitable?

A) SageMaker Projects  
B) SageMaker Ground Truth  
C) SageMaker Data Wrangler  
D) SageMaker Feature Store  

**Answer: A**  
Explanation: SageMaker Projects is an MLOps tool that provisions CI/CD infrastructure (repositories, CodePipeline, CodeBuild, Registry, EventBridge) all at once using Service Catalog-based templates. B is labeling, C is data preparation, and D is a feature store, none related to a CI/CD template.

---

**Question 2.** In the standard SageMaker Projects structure, which pipeline does a "code push" trigger and which does a "model approval" trigger?

A) Code push → Deploy pipeline, model approval → Build pipeline  
B) Code push → Build pipeline, model approval → Deploy pipeline  
C) Both trigger the Build pipeline  
D) Neither has a trigger; only manual execution is possible  

**Answer: B**  
Explanation: A code push triggers the Build (model training and registration) pipeline, and a model approval triggers the Deploy (endpoint deployment) pipeline. CI and CD are separated by different events. A is swapped, and C and D do not match the separated trigger structure.

---

**Question 3.** Which file defines the commands CodeBuild actually runs (dependency installation, pipeline execution, etc.)?

A) template.yaml  
B) buildspec.yml  
C) requirements.txt  
D) pipeline.json  

**Answer: B**  
Explanation: CodeBuild runs the commands defined per phase in `buildspec.yml`. A is a CloudFormation template, C is a dependency list (only what is to be installed, not an execution definition), and D is a pipeline definition artifact.

---

**Question 4.** You want to automatically start a deployment pipeline when a model changes to Approved in the Registry. Which combination of services handles event detection and triggering?

A) EventBridge rule → CodePipeline  
B) CloudWatch Logs → Athena  
C) S3 event notification → deploy with SNS alone  
D) Kinesis → Firehose  

**Answer: A**  
Explanation: A model approval status change emits an EventBridge event, and the CodePipeline specified as the rule's target starts the deployment. B is for analytics, C is just a notification and not deployment orchestration, and D is a streaming data pipeline and unrelated.

---

**Question 5.** You want to automatically deploy a new model to production, but have a person take control once, after staging validation and right before it goes to production. What is the most appropriate method?

A) Put a manual approval action in CodePipeline between the staging and production stages  
B) Deploy straight to production and delete it if a problem occurs  
C) Disable the EventBridge rule  
D) Keep the model in PendingManualApproval permanently  

**Answer: A**  
Explanation: Placing a CodePipeline manual approval action between staging and production means a person must review and approve the staging validation results before the production deployment proceeds, reducing the blast radius. B is risky, and C and D block deployment automation itself and fail to meet the requirement.

---
