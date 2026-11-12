# Day 3 - CI/CD for ML: SageMaker Projects, CodePipeline/CodeBuild Integration, Automated Deployment

## 📌 Key Takeaways

- ML CI/CD automates two different triggers separately: **code change → automatic retraining and registration (CI)** and **model approval → automatic deployment (CD)**.
- **SageMaker Projects** provisions the repository, CodePipeline, CodeBuild, Model Registry, and EventBridge **all at once through a Service Catalog template**.
- The standard structure is two pipelines: a **Build pipeline (triggered by a code push)** and a **Deploy pipeline (triggered by model approval)**.
- The standard CD chain: **Registry approval → EventBridge → CodePipeline → CloudFormation deployment**.
- Deploying to staging and then placing a **manual approval gate** before going to production is the safe pattern that reduces the blast radius.

## Applying CI/CD to ML

If every code change means a person reruns the pipeline in a notebook, clicks the approval button, and updates the endpoint by hand, it is still manual operation. Traditional software CI/CD is code push → build → test → deploy, but in ML there is an added axis of **data and models**.

| Category | Traditional software CI/CD | ML CI/CD |
|------|----------------------|----------|
| Input | Code | Code **+ data** |
| Build artifact | Binary or image | **Trained model artifact** |
| Testing | Unit and integration tests | Tests + **model evaluation metric gate** |
| Approval target | Release candidate | **Model version (Registry)** |
| What triggers a rerun | Code change | Code change + **data change, drift, schedule** |

- **CI (continuous integration)**: When the preprocessing or training script changes, automatically run the pipeline to train and evaluate, then register in the Registry.
- **CD (continuous deployment)**: When a model is approved, automatically deploy it to the staging and production endpoints.
- You could wire this together by hand, but AWS lays down the whole skeleton at once with a template called **SageMaker Projects**.

> 💡 **Related theory**: The core idea of ML CI/CD is "make model deployment version-managed, automated, and rollback-capable like software deployment." Code, data, and models are all tracked, changes lead to automatic triggers, and when a problem occurs you must be able to go back to a previous version. In the exam, a flow of "Git commit → automatic retraining and deployment" points to the combination of SageMaker Projects + Code* services.

## SageMaker Projects — The MLOps Template

SageMaker Projects **provisions the CI/CD infrastructure that MLOps needs as a preconfigured template (Service Catalog based)**. When you create a project, the following are created all at once.

| Resource created | Role |
|--------------|------|
| Source code repository (CodeCommit or Git) | Preprocessing, training, and deployment code |
| Build pipeline (CodePipeline + CodeBuild) | On a code change, runs the SageMaker Pipeline → registers the model |
| Deploy pipeline (CodePipeline) | On model approval, deploys to the staging/production endpoints |
| Model Registry group | Catalog of trained model versions |
| EventBridge rules | Triggers that detect code push and model approval events |

- What you built by hand yesterday and the day before comes out bundled whole as a standard template.
- The representative template is "model building, training, and deployment," which creates **two repositories, one for build and one for deploy**.

## The Whole CI/CD Chain at a Glance

```text
 ┌──────────── CI (code axis) ────────────┐
 Developer git push
      │
      ▼
 CodeCommit / Git repository
      │  (push event)
      ▼
 CodePipeline(Build) ──▶ CodeBuild (buildspec.yml)
                              │
                              ▼
                    SageMaker Pipeline run
          preprocessing → training → evaluation → ConditionStep
                              │ passed
                              ▼
                    RegisterModel → Model Registry
                    (PendingManualApproval)
 ─────────────────────────────────────────────────
 ┌──────────── CD (model axis) ────────────┐
      Reviewer changes it to Approved
                              │
                              ▼
              EventBridge "Model Package State Change"
                              │
                              ▼
                    CodePipeline(Deploy)
                              │
                ┌─────────────┴─────────────┐
                ▼                           │
      CloudFormation → staging endpoint     │
                ▼                           │
           automated tests pass             │
                ▼                           │
      ManualApproval action (human check) ──┘
                ▼
      CloudFormation → production endpoint
```

The key point is that **the triggers above and below the dividing line are different**. The one above is a code push, and the one below is model approval.

## Two Pipelines: Build and Deploy

| Comparison axis | Build pipeline | Deploy pipeline |
|---------|-----------------|------------------|
| What it centers on | **Code** | **Model version** |
| Trigger | Code push to the repository | Registry approval (Approved) event |
| What it does | Runs the SageMaker Pipeline → training, evaluation, registration | Creates/updates the endpoint |
| Main execution tool | CodeBuild (`buildspec.yml`) | CloudFormation stack deployment |
| Output | A new model version in the Registry | Staging and production endpoints |
| Human involvement | Usually none | Manual approval gate just before production |
| CI/CD category | CI | CD |

**1) Build (model build) pipeline** — code-centric
- A developer pushes the training code to the repository
- CodePipeline detects the change and runs CodeBuild
- CodeBuild runs the SageMaker Pipeline (preprocessing → training → evaluation → registration)
- The resulting model is registered in the Model Registry as `PendingManualApproval`

**2) Deploy (model deploy) pipeline** — model-centric
- The model in the Model Registry is changed to `Approved`
- EventBridge detects the approval event and triggers the Deploy pipeline
- The staging endpoint is deployed with CloudFormation → automated tests
- When the manual approval gate is passed, the production endpoint is deployed

## Roles of CodeCommit / CodeBuild / CodePipeline

Clearly separating what each service is responsible for is an exam point.

| Service | Role | Easily confused point |
|--------|------|-------------------|
| **CodeCommit** | Git source repository (code version control) | It only stores. It does not execute |
| **CodeBuild** | Build and test execution environment (commands defined in `buildspec.yml`) | The only compute that actually runs commands |
| **CodePipeline** | Orchestrator that links the stages (source → build → deploy flow) | It does not build directly. It manages the order |
| **CloudFormation** | Deploys infrastructure such as endpoints as code | The executor of deployment. Also the unit of rollback |
| **EventBridge** | Triggers based on events (code push, model approval) | Not a workflow but a **start signal** |

CodeBuild's work is defined in `buildspec.yml`. For example, the build phase that runs a SageMaker Pipeline looks like this.

```yaml
# buildspec.yml — defines the commands CodeBuild will run
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.11
    commands:
      - pip install -r requirements.txt
  build:
    commands:
      # On a code change, create/update the SageMaker Pipeline and run it
      - python pipelines/run_pipeline.py --upsert
      - python pipelines/run_pipeline.py --start
```

## Automatic Deployment Trigger: Approval → EventBridge → Deployment

The heart of CD is the **model approval event** you learned yesterday. When the approval status changes in the Model Registry, EventBridge catches it and starts the Deploy pipeline.

```python
import boto3
events = boto3.client("events")

# A rule that triggers the Deploy pipeline when the model approval status changes to Approved
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

If you set this rule's target to the Deploy CodePipeline, deployment rolls automatically the moment a person approves the model. After staging validation and before production deployment, adding one more **manual approval action** is the safe pattern.

```python
# CodePipeline stage example (conceptual): staging → manual approval → production
# 1. DeployStaging   (create the staging endpoint with CloudFormation)
# 2. ApprovalGate    (a person checks the staging results and approves)
# 3. DeployProd      (deploy the production endpoint)
```

The staged deployment of staging → manual approval → production in CI/CD follows the principle of "minimizing the blast radius." If you validate a new model in staging rather than putting it straight into production, and then pass it through a gate, defects are filtered out before they reach users. In the exam, a sentence like "to deploy automatically but safely while keeping control just before production" points to CodePipeline's manual approval action.

> ⚠️ **Trap**: "Automatic deployment on model approval" and "human confirmation just before production" are not contradictory. Approval happens **twice** — the first is the Registry's `Approved` (the decision to put the model into the deployment flow), and the second is CodePipeline's ManualApproval action (the decision to send it to production after seeing the staging validation results). Answer choices that lump these two into one are often wrong.

## Direct Setup vs. SageMaker Projects

You can produce the same result by wiring CodePipeline, CodeBuild, and EventBridge together yourself without SageMaker Projects.

| Comparison axis | SageMaker Projects | Direct setup |
|---------|-------------------|-----------|
| Speed of adoption | Immediate through template provisioning | You must wire services one by one |
| Standardization | Reuse and governance across the organization through Service Catalog | Tends to become different for every team |
| Flexibility | Customizable within the scope of the template | No constraints |
| Integration with existing CI/CD | A new skeleton is laid down | Easy to attach to an existing pipeline |
| Exam keyword | "Quickly standardize MLOps, template" | "Integrate with existing CI/CD, non-standard requirements" |

Either way, **what triggers retraining** has to be designed separately. A code push alone cannot catch situations where the data changes.

| Retraining trigger | Implementation | Suitable situation |
|---------------|------|-----------|
| Code change | Repository push → Build pipeline | When you changed the algorithm or feature logic |
| Regular schedule | EventBridge cron rule | Services where data accumulates steadily |
| New data arrival | S3 event → EventBridge | When batches arrive irregularly |
| Quality degradation detected | Monitoring alarm → pipeline run | When performance dropped because of drift |

## When CI/CD Goes Wrong: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| You pushed code but nothing happens | Source stage branch mismatch, trigger disabled | Check the pipeline's source branch and detection settings |
| You approved but the Deploy pipeline does not run | EventBridge pattern typo, target not connected, rule disabled | Inspect the event pattern, target, and rule state |
| CodeBuild fails as soon as it starts | `buildspec.yml` location or syntax error, runtime version mismatch | Check the buildspec path at the repository root and the phase syntax |
| The build is denied when creating a SageMaker job | The CodeBuild role lacks SageMaker permissions or `iam:PassRole` | Grant the build role PassRole on the target execution role |
| Staging works but production does not go out | Waiting at the manual approval action | Set the approvers and notification targets, then approve |
| The deployment stack fails midway and rolls back | Endpoint configuration error, insufficient capacity, name collision | Check the failed resource in the CloudFormation event log |
| A wrong model went to production | The status was set straight to `Approved` at registration | Register as `PendingManualApproval` + restore the review gate |
| Rollback takes a long time | The previous version's information is not managed separately | Redeploy using the Registry's previous approved version ARN |

CI/CD failures are mostly one of three: **trigger**, **permission**, or **definition**. If nothing happens, it is the trigger; if it starts but is denied midway, it is permissions; if it runs to the end but the result is wrong, it is a definition (buildspec, template) problem. Narrowing down in this order means you do not have to dig through all the logs.

Tomorrow we compare IaC, which manages the very infrastructure that supports this deployment as code, with orchestrators that reach beyond SageMaker.

## 📖 Glossary

- **CI (continuous integration)**: The stage that automatically runs through training and evaluation when code changes and registers the resulting model.
- **CD (continuous deployment)**: The stage that pushes an approved model all the way to the endpoint without human hands.
- **SageMaker Projects**: A feature that lays down the MLOps repository, pipelines, Registry, and triggers all at once with a single template.
- **Service Catalog**: An AWS service that collects organization-approved infrastructure templates and makes people create things only the standard way. It is the foundation of Projects.
- **Build pipeline**: The pipeline that starts with a code push and goes as far as training and registering the model.
- **Deploy pipeline**: The pipeline that starts with model approval and deploys the endpoint.
- **buildspec.yml**: A file that states which commands CodeBuild runs and in what order.
- **ManualApproval action**: A stopping point in the middle of CodePipeline that moves on only when a person presses approve.
- **EventBridge rule**: A routing rule saying "when this event arrives, send it there." The trigger of deployment automation.
- **Blast radius**: The extent of damage when a problem erupts. The reason for going through staging is to reduce this.

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
