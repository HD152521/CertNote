# Day 4 - IaC & 워크플로 오케스트레이션: CloudFormation/CDK, Step Functions, EventBridge, Airflow(MWAA)

지금까지의 파이프라인·Registry·CI/CD는 모두 "어딘가에 인프라가 깔려 있다"는 전제 위에 있었다. 그 인프라 — 엔드포인트, 파이프라인, IAM 역할, 버킷 — 를 콘솔에서 손으로 클릭해 만들면 재현 불가능하고 환경 간 드리프트(drift)가 생긴다. **IaC(Infrastructure as Code)**는 인프라를 코드로 정의해 버전 관리·재현·자동화하게 한다. 그리고 SageMaker Pipelines 바깥의 더 넓은 오케스트레이션이 필요할 때를 위한 도구들도 있다.

오늘은 **CloudFormation/CDK(IaC)**, **Step Functions**, **EventBridge 트리거**, **Amazon MWAA(관리형 Airflow)**를 다룬다. MLA-C01 시험은 "이 오케스트레이션/IaC 요구에 어떤 도구가 맞는가"를 도구 간 비교로 묻는다. 핵심은 **언제 무엇을 고르는가**다.

## IaC: CloudFormation과 CDK

IaC는 인프라를 선언적 코드로 정의한다. 같은 코드로 dev/staging/prod를 동일하게 찍어내고, 변경 이력을 Git으로 추적하며, 롤백할 수 있다.

| 도구 | 특징 |
|------|------|
| CloudFormation | YAML/JSON 선언적 템플릿. AWS 네이티브 IaC의 기본 |
| AWS CDK | Python/TypeScript 등 프로그래밍 언어로 인프라 정의 → CloudFormation으로 합성(synth) |

CloudFormation은 템플릿에 "원하는 상태"를 적으면 스택으로 만들어준다. SageMaker 엔드포인트를 IaC로 정의한 예:

```yaml
# CloudFormation: SageMaker 엔드포인트를 코드로 선언
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

CDK는 같은 것을 코드로 쓴다(반복·조건·추상화에 유리).

```python
# AWS CDK(Python): 합성하면 위와 동등한 CloudFormation이 생성됨
from aws_cdk import aws_sagemaker as sagemaker

model = sagemaker.CfnModel(self, "MyModel",
    execution_role_arn=role_arn,
    primary_container={"image": image_uri, "modelDataUrl": model_s3_uri},
)
```

> 💡 **관련 이론**: IaC의 핵심 가치는 멱등성(idempotency)과 재현성이다. 같은 템플릿을 몇 번 적용해도 동일한 결과 상태가 되며, 환경 간 드리프트를 없앤다. SageMaker Projects가 내부적으로 CloudFormation을 쓰는 이유도 이것이다. 시험에서 "인프라를 재현 가능하게 코드로 관리"면 CloudFormation/CDK다.

## Step Functions — AWS 서비스 전반의 오케스트레이션

SageMaker Pipelines는 SageMaker 작업 중심이다. 반면 **AWS Step Functions**는 Lambda, Glue, SageMaker, ECS, SNS 등 **여러 AWS 서비스에 걸친 워크플로**를 상태 머신(state machine)으로 오케스트레이션한다. ML 워크플로가 SageMaker 밖의 단계(예: Lambda로 알림, Glue로 ETL, DynamoDB 갱신)를 많이 포함하면 Step Functions가 적합하다.

```json
{
  "Comment": "ETL → 학습 → 알림을 잇는 상태 머신",
  "StartAt": "GlueETL",
  "States": {
    "GlueETL": { "Type": "Task", "Resource": "arn:aws:states:::glue:startJobRun.sync", "Next": "TrainModel" },
    "TrainModel": { "Type": "Task", "Resource": "arn:aws:states:::sagemaker:createTrainingJob.sync", "Next": "Notify" },
    "Notify": { "Type": "Task", "Resource": "arn:aws:states:::sns:publish", "End": true }
  }
}
```

Step Functions는 분기(Choice), 병렬(Parallel), 재시도(Retry), 오류 처리(Catch)를 상태로 표현한다. SageMaker용으로는 `.sync` 통합으로 작업 완료까지 기다릴 수 있다.

**Pipelines vs Step Functions 구분**: SageMaker 작업만 묶고 계보·Registry 통합이 필요하면 **Pipelines**, 여러 서비스를 폭넓게 엮고 일반 워크플로 제어가 필요하면 **Step Functions**.

## EventBridge — 이벤트 기반 트리거

**Amazon EventBridge**는 이벤트를 받아 규칙에 따라 타깃으로 라우팅하는 이벤트 버스다. ML에서의 쓰임:
- **스케줄 트리거**: cron/rate 식으로 정기 재학습(예: 매일 새벽 파이프라인 실행).
- **이벤트 트리거**: 모델 승인(어제 배운 것), S3에 새 데이터 도착, 학습 작업 완료 등 이벤트로 워크플로 시작.

```python
import boto3
events = boto3.client("events")

# 매일 02:00(UTC)에 재학습 파이프라인을 트리거하는 스케줄 규칙
events.put_rule(
    Name="nightly-retrain",
    ScheduleExpression="cron(0 2 * * ? *)",
)
# (타깃으로 SageMaker Pipeline 실행 Lambda 또는 Step Functions를 연결)
```

EventBridge는 "무언가 일어나면(또는 정해진 시각에) 워크플로를 시작"하는 접착제다. 워크플로 자체를 정의하지는 않고, 시작 신호를 보낸다.

## Amazon MWAA — 관리형 Apache Airflow

**Amazon MWAA(Managed Workflows for Apache Airflow)**는 관리형 Airflow다. 워크플로를 파이썬으로 작성한 **DAG**로 정의하며, Airflow의 풍부한 연산자(operator) 생태계를 그대로 쓴다. 다음 상황에 고른다.

- 조직이 **이미 Airflow를 쓰고 있어** 마이그레이션·일관성이 중요할 때.
- **하이브리드/멀티클라우드**나 온프레미스 시스템까지 포함한 복잡한 의존성 오케스트레이션이 필요할 때.
- 풍부한 커뮤니티 연산자/스케줄링 기능이 필요할 때.

```python
# MWAA용 Airflow DAG (개념): SageMaker 학습을 Airflow가 오케스트레이션
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

> 💡 **관련 이론**: 오케스트레이터 선택은 "어디까지 묶느냐 + 기존 자산이 무엇이냐"의 문제다. SageMaker 작업만 → Pipelines. 여러 AWS 서비스 서버리스 워크플로 → Step Functions. 이미 Airflow 자산/하이브리드 → MWAA. 단순 트리거/스케줄 → EventBridge. 인프라 정의 → CloudFormation/CDK. 시험은 이 다섯을 시나리오로 갈라 묻는다.

## 다섯 도구 한눈에 정리

| 도구 | 언제 쓰나 |
|------|----------|
| CloudFormation / CDK | 인프라를 코드로 재현·버전 관리 (IaC) |
| SageMaker Pipelines | SageMaker 작업 중심 ML 워크플로, 계보·Registry 통합 |
| Step Functions | 여러 AWS 서비스에 걸친 서버리스 오케스트레이션 |
| EventBridge | 스케줄·이벤트 기반 트리거(워크플로 시작 신호) |
| MWAA (Airflow) | 기존 Airflow 자산·하이브리드·복잡한 DAG |

## 정리

- IaC(CloudFormation/CDK)는 인프라를 코드로 정의해 멱등성·재현성·환경 일관성을 보장한다.
- Step Functions는 여러 AWS 서비스를 잇는 상태 머신 오케스트레이션으로, SageMaker 밖 단계가 많을 때 적합하다.
- EventBridge는 스케줄/이벤트 트리거로 워크플로를 시작시키는 접착제다.
- MWAA(관리형 Airflow)는 기존 Airflow 자산이 있거나 하이브리드·복잡한 의존성을 다룰 때 선택한다.
- 도구 선택의 기준은 "묶는 범위 + 기존 자산"이며, 시험은 이를 시나리오로 구분해 묻는다.

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
