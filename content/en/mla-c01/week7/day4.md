# Day 4 - IaC & Workflow Orchestration: CloudFormation/CDK, Step Functions, EventBridge, Airflow (MWAA)

All the pipelines, Registry, and CI/CD built so far assume "infrastructure exists somewhere". That infrastructure—endpoints, pipelines, IAM roles, buckets—clicked manually in the console becomes non-reproducible with environment drift. **IaC (Infrastructure as Code)** defines infrastructure as code for version management, reproducibility, and automation. Beyond SageMaker Pipelines, there are tools for broader orchestration needs.

Today we cover **CloudFormation/CDK (IaC)**, **Step Functions**, **EventBridge triggers**, and **Amazon MWAA (managed Airflow)**. MLA-C01 tests "which tool fits this orchestration/IaC requirement?" by comparing tools. The core question: **when to pick what**.

## IaC: CloudFormation and CDK

IaC defines infrastructure as declarative code. The same code stamps dev/staging/prod identically, changes track via Git, and rollback works.

| Tool | Characteristics |
|------|---|
| CloudFormation | YAML/JSON declarative templates. AWS native IaC baseline |
| AWS CDK | Define infrastructure via programming languages (Python, TypeScript, etc.) → synthesize to CloudFormation |

CloudFormation takes a template describing "desired state" and builds it as a stack. Example: SageMaker endpoint as IaC:

```yaml
# CloudFormation: SageMaker endpoint declared as code
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

CDK writes the same in code (benefits from loops, conditionals, abstraction).

```python
# AWS CDK (Python): synthesize to CloudFormation equivalent to above
from aws_cdk import aws_sagemaker as sagemaker

model = sagemaker.CfnModel(self, "MyModel",
    execution_role_arn=role_arn,
    primary_container={"image": image_uri, "modelDataUrl": model_s3_uri},
)
```

> 💡 **Related Theory**: IaC's core value is idempotency and reproducibility. Applying the same template multiple times yields identical state; environment drift vanishes. SageMaker Projects internally uses CloudFormation for this reason. On exams, "manage infrastructure as reproducible code" → CloudFormation/CDK.

## Step Functions — Orchestration Across AWS Services

SageMaker Pipelines centers on SageMaker work. **AWS Step Functions**, by contrast, orchestrates **workflows spanning multiple AWS services** — Lambda, Glue, SageMaker, ECS, SNS, etc. — as state machines. If ML workflow includes many non-SageMaker steps (e.g., Lambda for notifications, Glue for ETL, DynamoDB updates), Step Functions fits.

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

Step Functions express branching (Choice), parallelism (Parallel), retry (Retry), and error handling (Catch) as states. For SageMaker, `.sync` integration lets you wait for job completion.

**Pipelines vs Step Functions distinction**: SageMaker work only + lineage/Registry integration needed → **Pipelines**; many services to link + general workflow control → **Step Functions**.

## EventBridge — Event-Based Triggering

**Amazon EventBridge** is an event bus receiving events and routing them to targets by rule. ML uses:
- **Schedule triggers**: cron/rate expressions for periodic retraining (e.g., pipeline daily at midnight).
- **Event triggers**: Workflow starts on model approval (yesterday's learning), new data in S3, training job completion, etc.

```python
import boto3
events = boto3.client("events")

# Schedule rule: trigger retraining pipeline daily at 02:00 UTC
events.put_rule(
    Name="nightly-retrain",
    ScheduleExpression="cron(0 2 * * ? *)",
)
# (target: connect SageMaker Pipeline-running Lambda or Step Functions)
```

EventBridge is the "glue" — "when something happens (or at scheduled time) start workflow". It doesn't define the workflow itself, just sends the start signal.

## Amazon MWAA — Managed Apache Airflow

**Amazon MWAA (Managed Workflows for Apache Airflow)** is managed Airflow. Define workflows as **DAGs** in Python and leverage Airflow's rich operator ecosystem. Choose when:

- Organization **already uses Airflow** and migration/consistency matters.
- Complex dependency orchestration needed spanning **hybrid/multi-cloud** or on-premises systems.
- Rich community operators/scheduling features required.

```python
# MWAA Airflow DAG (conceptual): Airflow orchestrates SageMaker training
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

> 💡 **Related Theory**: Orchestrator choice is "how much to bundle + what existing assets do you have". SageMaker work only → Pipelines. Multiple AWS services serverless workflow → Step Functions. Airflow assets/hybrid existing → MWAA. Simple triggers/schedules → EventBridge. Infrastructure definition → CloudFormation/CDK. Exams ask these five separated by scenario.

## Five Tools at a Glance

| Tool | When |
|------|------|
| CloudFormation / CDK | Define infrastructure as reproducible, version-managed code (IaC) |
| SageMaker Pipelines | SageMaker-centric ML workflow, lineage/Registry integration |
| Step Functions | Serverless orchestration spanning multiple AWS services |
| EventBridge | Schedule/event-based triggering (workflow start signal) |
| MWAA (Airflow) | Existing Airflow assets, hybrid, complex DAGs |

## Summary

- IaC (CloudFormation/CDK) defines infrastructure as code, guaranteeing idempotency, reproducibility, and environment consistency.
- Step Functions orchestrates multiple AWS services via state machines—fits when many non-SageMaker steps exist.
- EventBridge is "glue"—scheduled/event triggers to start workflows.
- MWAA (managed Airflow) chosen when existing Airflow assets or hybrid/complex dependencies exist.
- Tool selection criteria: "scope of bundling + existing assets"; exams ask this by scenario.

---

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
