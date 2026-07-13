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

## 📝 연습 문제

**문제 1.** SageMaker 엔드포인트, IAM 역할, 버킷을 dev/staging/prod에 동일하게 재현하고 변경을 버전 관리하려 한다. 가장 적절한 접근은?

A) 콘솔에서 매번 수동 생성  
B) CloudFormation/CDK로 인프라를 코드(IaC)로 정의  
C) 각 환경마다 다른 사람이 임의로 구성  
D) S3에 스크린샷을 저장  

**정답: B**  
해설: IaC(CloudFormation/CDK)는 인프라를 선언적 코드로 정의해 멱등성·재현성·환경 일관성을 제공한다. A·C는 드리프트와 비재현성을 낳고, D는 버전 관리·자동화가 전혀 안 된다.

---

**문제 2.** ML 워크플로가 Glue ETL → SageMaker 학습 → Lambda 후처리 → SNS 알림처럼 여러 AWS 서비스에 걸쳐 있고, 분기·재시도·오류 처리가 필요하다. 가장 적합한 오케스트레이터는?

A) SageMaker Pipelines  
B) AWS Step Functions  
C) EventBridge 단독  
D) CodeCommit  

**정답: B**  
해설: Step Functions는 여러 AWS 서비스를 잇는 상태 머신으로 분기(Choice)·병렬·재시도·Catch를 표현한다. A는 SageMaker 작업 중심이라 서비스 전반 오케스트레이션엔 좁고, C는 트리거일 뿐 워크플로 제어가 없으며, D는 소스 저장소다.

---

**문제 3.** SageMaker 작업만으로 구성된 ML 워크플로를 계보 추적과 Model Registry 통합까지 누리며 오케스트레이션하려 한다. 무엇이 가장 적합한가?

A) MWAA  
B) Step Functions  
C) SageMaker Pipelines  
D) CloudFront  

**정답: C**  
해설: SageMaker 작업 중심이며 계보(lineage)·Registry 통합이 필요하면 SageMaker Pipelines가 가장 적합하다. A·B도 가능은 하나 SageMaker 네이티브 통합 이점이 약하고, D는 CDN으로 무관하다.

---

**문제 4.** 조직이 이미 온프레미스를 포함한 복잡한 데이터 의존성을 Apache Airflow DAG로 운영 중이며, 이를 관리형으로 AWS에서 이어가려 한다. 가장 적절한 서비스는?

A) Amazon MWAA  
B) SageMaker Pipelines  
C) AWS Batch  
D) Amazon QuickSight  

**정답: A**  
해설: 기존 Airflow 자산·하이브리드·복잡한 DAG를 관리형으로 이어가려면 MWAA(Managed Workflows for Apache Airflow)가 적합하다. B는 SageMaker 네이티브로 Airflow 자산 재사용이 안 되고, C는 배치 컴퓨팅, D는 BI 시각화 도구다.

---

**문제 5.** 매일 새벽 2시에 재학습 파이프라인을 자동으로 시작시키려 한다. 가장 단순하고 적절한 트리거 방법은?

A) EventBridge 스케줄 규칙(cron 식)으로 파이프라인 실행을 트리거  
B) 사람이 매일 새벽 수동 실행  
C) CloudFormation 스택을 매일 재배포  
D) S3 버킷을 매일 새로 생성  

**정답: A**  
해설: EventBridge의 스케줄 규칙(cron/rate)은 정해진 시각에 워크플로를 트리거하는 표준 방법이다. B는 자동화가 아니고, C·D는 트리거 목적과 무관하며 부작용만 크다.

---
