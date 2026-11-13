# Day 4 - IaC & Workflow Orchestration: CloudFormation/CDK, Step Functions, EventBridge, Airflow (MWAA)

## 📌 Key Takeaways

- **IaC (CloudFormation/CDK)** defines infrastructure as declarative code, guaranteeing **idempotency, reproducibility, and environment consistency**.
- **CloudFormation** uses YAML/JSON templates, while **CDK** uses Python or TypeScript code → synthesizing (synth) it produces CloudFormation.
- **Step Functions** is state machine orchestration **spanning multiple AWS services** such as Lambda, Glue, SageMaker, and SNS.
- **EventBridge** is not a workflow but a **trigger** — the glue that starts a workflow on a schedule (cron) or an event.
- **MWAA (managed Airflow)** is the option when you have **existing Airflow assets, a hybrid setup, or complex DAGs**.

## IaC: CloudFormation and CDK

The pipelines, Registry, and CI/CD so far all rested on the premise that "infrastructure is laid down somewhere." If that infrastructure is built by clicking by hand in the console, it cannot be reproduced and drift appears between environments.

- IaC defines infrastructure as **declarative code**. The same code stamps out dev/staging/prod identically.
- Change history is tracked with Git, and when a problem occurs you roll back per stack.

| Comparison axis | CloudFormation | AWS CDK |
|---------|----------------|---------|
| How it is written | YAML/JSON declarative templates | Programming languages such as Python and TypeScript |
| Loops and conditions | Limited expression through built-in functions | Freely, with the language's `for`, `if`, and functions |
| Abstraction | Lists resources as they are | Bundle into components (Constructs) for reuse |
| Final output | The stack definition itself | **Synthesizing (synth) yields a CloudFormation template** |
| Learning curve | Simple syntax, verbose at scale | Fast if you know the language, but you must understand the abstractions |
| When to choose it | Simple, static infrastructure; a team comfortable with YAML | Multi-environment setups with a lot of repetition; developer-centered teams |

With CloudFormation, you write the "desired state" in a template and it builds it as a stack. An example of defining a SageMaker endpoint as IaC:

```yaml
# CloudFormation: declare a SageMaker endpoint as code
Resources:
  MyModel:
    Type: AWS::SageMaker::Model
    Properties:
      ExecutionRoleArn: !Ref SageMakerRoleArn
      PrimaryContainer:
        Image: !Ref InferenceImageUri
        ModelDataUrl: !Ref ModelArtifactS3Uri
  MyEndpointConfig:
    Type: AWS::SageMaker::EndpointConfig
    Properties:
      ProductionVariants:
        - ModelName: !GetAtt MyModel.ModelName
          VariantName: AllTraffic
          InstanceType: ml.m5.large
          InitialInstanceCount: 1
  MyEndpoint:
    Type: AWS::SageMaker::Endpoint
    Properties:
      EndpointConfigName: !GetAtt MyEndpointConfig.EndpointConfigName
```

CDK writes the same thing as code (an advantage for loops, conditions, and abstraction).

```python
# AWS CDK (Python): synthesizing generates CloudFormation equivalent to the above
from aws_cdk import aws_sagemaker as sagemaker

model = sagemaker.CfnModel(self, "MyModel",
    execution_role_arn=role_arn,
    primary_container={"image": image_uri, "modelDataUrl": model_s3_uri},
)
```

- The three resources are tied together by references in the order **Model → EndpointConfig → Endpoint**. The reference is the creation order.
- Deployment is atomic per stack. If it fails midway, CloudFormation rolls back to the previous state.
- If you parameterize the model artifact path and image URI with `!Ref`, you can redeploy by **swapping only the model version** in the same template. This is exactly what the Deploy pipeline does.
- Once you start managing infrastructure with IaC, the rule is **do not touch it in the console**. A change made there is silently overwritten at the next stack deployment.

> 💡 **Related theory**: The core value of IaC is idempotency and reproducibility. Applying the same template any number of times ends in the same resulting state, and drift between environments disappears. This is also why SageMaker Projects uses CloudFormation internally. In the exam, "manage infrastructure as reproducible code" means CloudFormation/CDK.

## Step Functions — Orchestration Across AWS Services

SageMaker Pipelines centers on SageMaker jobs. **AWS Step Functions**, on the other hand, orchestrates **workflows that span multiple AWS services** — Lambda, Glue, SageMaker, ECS, SNS, and others — as a state machine. If an ML workflow contains many steps outside SageMaker (for example, notification via Lambda, ETL via Glue, updating DynamoDB), Step Functions is a good fit.

```json
{
  "Comment": "State machine linking ETL → training → notification",
  "StartAt": "GlueETL",
  "States": {
    "GlueETL": { "Type": "Task", "Resource": "arn:aws:states:::glue:startJobRun.sync", "Next": "TrainModel" },
    "TrainModel": { "Type": "Task", "Resource": "arn:aws:states:::sagemaker:createTrainingJob.sync", "Next": "Notify" },
    "Notify": { "Type": "Task", "Resource": "arn:aws:states:::sns:publish", "End": true }
  }
}
```

| State type | What it does |
|-----------|---------|
| `Task` | Calls the actual work (Lambda, Glue, SageMaker, etc.) |
| `Choice` | Conditional branching |
| `Parallel` | Runs several branches at the same time |
| `Map` | Repeats the same processing for each element of an array |
| `Wait` | Waits for a set time or until a point in time |
| `Retry` / `Catch` | Retry policy and error handling |

- For SageMaker, the `.sync` integration **lets you wait until the job completes**. Without it, the training job is only started and execution moves on to the next state immediately.
- There are two workflow types. **Standard** suits long-running workflows and keeps an execution history, making it strong for auditing and debugging. **Express** suits very short, high-volume event processing. ML training orchestration takes a long time, so it is usually Standard.
- **Telling Pipelines and Step Functions apart**: if you only bundle SageMaker jobs and need lineage and Registry integration, use **Pipelines**; if you link many services broadly and need general workflow control, use **Step Functions**.

## EventBridge — Event-Based Triggers

**Amazon EventBridge** is an event bus that receives events and routes them to targets according to rules. Its uses in ML:

- **Schedule triggers**: Periodic retraining with a cron/rate expression (for example, running the pipeline every day before dawn).
- **Event triggers**: Starting a workflow on events such as a model approval (what you learned yesterday), new data arriving in S3, or a training job completing.

```python
import boto3
events = boto3.client("events")

# A schedule rule that triggers the retraining pipeline every day at 02:00 (UTC)
events.put_rule(
    Name="nightly-retrain",
    ScheduleExpression="cron(0 2 * * ? *)",
)
# (Connect a Lambda that runs the SageMaker Pipeline, or Step Functions, as the target)
```

EventBridge is the glue that "starts a workflow when something happens (or at a set time)." **It does not define the workflow itself; it sends the start signal.**

| Rule component | What it does |
|----------------|---------|
| Event pattern | Describes in JSON which events to react to (`source`, `detail-type`, `detail`) |
| Schedule expression | A time-based trigger. `cron(...)` or `rate(...)` — the reference time is **UTC** |
| Target | What to invoke when an event matches (Lambda, Step Functions, CodePipeline, etc.) |
| Target invocation role | The IAM role EventBridge uses when calling the target. Without it, it fails silently |

```text
   [New data in S3]  [Model Approved]   [Every day 02:00]
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  EventBridge rule
              (pattern matching / schedule)
                         │  target specified
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 SageMaker Pipeline  Step Functions   CodePipeline
   (start run)        (state machine)  (start deploy)
```

## Amazon MWAA — Managed Apache Airflow

**Amazon MWAA (Managed Workflows for Apache Airflow)** is managed Airflow. It defines workflows as **DAGs** written in Python and uses Airflow's rich operator ecosystem as is. Choose it in these situations.

- When the organization **already uses Airflow**, so migration and consistency matter.
- When you need complex dependency orchestration that includes **hybrid/multi-cloud** or on-premises systems.
- When you need the rich community operators and scheduling features.

```python
# Airflow DAG for MWAA (conceptual): Airflow orchestrates SageMaker training
from airflow import DAG
from airflow.providers.amazon.aws.operators.sagemaker import (
    SageMakerTrainingOperator,
)

with DAG("ml_retrain", schedule_interval="@daily") as dag:
    train = SageMakerTrainingOperator(
        task_id="train_model",
        config=training_job_config,
    )
```

- The trade-off is operational burden. The Airflow environment itself (scheduler and workers) stays up all the time, so it has more idle cost and more things to manage than the serverless Step Functions.
- Choosing MWAA for "a new, SageMaker-centered project" is almost always the wrong answer.

Choosing an orchestrator is a question of "how much you bundle + what existing assets you have." SageMaker jobs only → Pipelines. Serverless workflow across multiple AWS services → Step Functions. Existing Airflow assets or hybrid → MWAA. Simple trigger/schedule → EventBridge. Infrastructure definition → CloudFormation/CDK. The exam separates these five by scenario.

## The Five Tools at a Glance

| Tool | Nature | When to use | Exam keywords |
|------|------|----------|-------------|
| **CloudFormation / CDK** | IaC (infrastructure definition) | Reproduce and version-manage infrastructure as code | Reproducible, environment consistency, eliminating drift |
| **SageMaker Pipelines** | ML workflow | SageMaker-job-centered, lineage and Registry integration | Preprocessing → training → evaluation → registration, lineage |
| **Step Functions** | General-purpose workflow | Serverless orchestration across multiple AWS services | Glue+Lambda+SNS, branching and retry |
| **EventBridge** | Trigger | Start a workflow by schedule or event | Every day before dawn, on approval, when new data arrives |
| **MWAA (Airflow)** | Managed workflow | Existing Airflow assets, hybrid, complex DAGs | Already using Airflow, includes on-premises |

> ⚠️ **Trap**: An answer choice that presents EventBridge as an orchestrator is wrong. EventBridge only decides "when to start" and knows nothing about "what to do in what order." If branching, retry, or dependencies are in the requirement, the answer is Step Functions or Pipelines, and EventBridge is just the trigger attached in front of them.

## When Orchestration Goes Wrong: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Endpoint settings differ subtly between environments | Drift from manual creation in the console | Deploy uniformly from a single CloudFormation/CDK template |
| It moves on to the next state before training finishes | The `.sync` integration is not used in Step Functions | Change to a `.sync` resource so it waits for completion |
| A schedule rule exists but nothing runs | Target not connected, rule disabled, cron expression error | Check the target, the enabled state, and the expression (UTC based) |
| The trigger fires but the target refuses to run | EventBridge lacks permission to invoke the target | Grant permissions to the target invocation role |
| You cannot build retry and branching in a pipeline | Wrong tool choice (the scope goes beyond SageMaker) | Move up to Step Functions for the higher-level orchestration |
| The stack deployment fails and rolls back entirely | Resource name collision, insufficient permissions, dependent resource not created | Check from the first failed resource in the stack events |
| Airflow environment cost keeps accruing | MWAA is an always-running environment | If the workflow is event-driven in nature, consider Step Functions |
| You hand-edited the pipeline definition and it vanished on the next deployment | An IaC-managed resource was modified in the console | Make changes only in code and redeploy as a stack |

The five tools are not competitors but **layers**. From the bottom they stack as IaC (what exists) → workflow (what to do in what order) → trigger (when it starts). When reading a scenario, first ask "which layer is this about?" and some answer choices are filtered out automatically.

Tomorrow we review this week's MLOps pieces by tying them into a single chain.

## 📖 Glossary

- **IaC (Infrastructure as Code)**: A way of writing infrastructure such as servers, roles, and endpoints as code rather than clicks, and stamping it out as written.
- **CloudFormation**: AWS's basic IaC service that builds exactly what you describe when you write "I'd like it to be in this state" in YAML/JSON.
- **AWS CDK**: A tool that lets you write the same infrastructure as Python or TypeScript code. Synthesizing it produces a CloudFormation template.
- **Stack**: The unit of resource bundle that CloudFormation creates, deletes, and rolls back as one piece.
- **Drift**: The phenomenon where the state written in code and the actual infrastructure gradually diverge. Manual changes are the main culprit.
- **Idempotency**: The property that applying the same thing multiple times gives the same result as applying it once.
- **Step Functions**: A workflow service that strings together multiple AWS service calls as one state each and can express branching and retry. Its definition is called a state machine.
- **`.sync` integration**: A mode in which Step Functions waits until the job it invoked finishes before moving on to the next.
- **EventBridge**: A router that receives events and passes them to a designated target when they match a rule. It acts as the trigger of workflows.
- **MWAA**: Apache Airflow operated by AWS on your behalf. The option for continuing when you already have Airflow DAG assets.

## 📝 Practice Questions

**Question 1.** You want to reproduce SageMaker endpoints, IAM roles, and buckets identically across dev/staging/prod and version-control the changes. What is the most appropriate approach?

A) Create them manually in the console each time  
B) Define the infrastructure as code (IaC) with CloudFormation/CDK  
C) Have a different person configure each environment ad hoc  
D) Save screenshots to S3  

**Answer: B**  
Explanation: IaC (CloudFormation/CDK) defines infrastructure as declarative code, providing idempotency, reproducibility, and environment consistency. A and C produce drift and non-reproducibility, and D provides no version control or automation at all.

---

**Question 2.** An ML workflow spans multiple AWS services, such as Glue ETL → SageMaker training → Lambda post-processing → SNS notification, and requires branching, retries, and error handling. What is the most suitable orchestrator?

A) SageMaker Pipelines  
B) AWS Step Functions  
C) EventBridge alone  
D) CodeCommit  

**Answer: B**  
Explanation: Step Functions is a state machine that connects multiple AWS services and expresses branching (Choice), parallelism, retries, and Catch. A is centered on SageMaker jobs and is too narrow for orchestrating across services, C is only a trigger with no workflow control, and D is a source repository.

---

**Question 3.** You want to orchestrate an ML workflow made up of only SageMaker jobs while also enjoying lineage tracking and Model Registry integration. What is most suitable?

A) MWAA  
B) Step Functions  
C) SageMaker Pipelines  
D) CloudFront  

**Answer: C**  
Explanation: If the workflow is centered on SageMaker jobs and needs lineage and Registry integration, SageMaker Pipelines is the most suitable. A and B are also possible but have weaker SageMaker-native integration benefits, and D is a CDN and unrelated.

---

**Question 4.** An organization already runs complex data dependencies, including on-premises ones, as Apache Airflow DAGs and wants to continue them on AWS as a managed service. What is the most appropriate service?

A) Amazon MWAA  
B) SageMaker Pipelines  
C) AWS Batch  
D) Amazon QuickSight  

**Answer: A**  
Explanation: To continue existing Airflow assets, hybrid setups, and complex DAGs as a managed service, MWAA (Managed Workflows for Apache Airflow) is suitable. B is SageMaker-native and cannot reuse Airflow assets, C is batch computing, and D is a BI visualization tool.

---

**Question 5.** You want to automatically start a retraining pipeline at 2 AM every day. What is the simplest and most appropriate trigger method?

A) Trigger the pipeline execution with an EventBridge scheduled rule (cron expression)  
B) A person runs it manually every morning  
C) Redeploy a CloudFormation stack every day  
D) Create a new S3 bucket every day  

**Answer: A**  
Explanation: An EventBridge scheduled rule (cron/rate) is the standard way to trigger a workflow at a set time. B is not automation, and C and D are unrelated to the trigger purpose and only have large side effects.

---
