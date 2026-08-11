# Day 4 - IaC & 워크플로 오케스트레이션: CloudFormation/CDK, Step Functions, EventBridge, Airflow(MWAA)

## 📌 핵심 정리

- **IaC(CloudFormation/CDK)** 는 인프라를 선언적 코드로 정의해 **멱등성·재현성·환경 일관성**을 보장한다.
- **CloudFormation**은 YAML/JSON 템플릿, **CDK**는 파이썬·TypeScript 코드 → 합성(synth)하면 CloudFormation이 나온다.
- **Step Functions**는 Lambda·Glue·SageMaker·SNS 등 **여러 AWS 서비스에 걸친** 상태 머신 오케스트레이션이다.
- **EventBridge**는 워크플로가 아니라 **트리거** — 스케줄(cron)이나 이벤트로 워크플로를 시작시키는 접착제다.
- **MWAA(관리형 Airflow)** 는 **기존 Airflow 자산·하이브리드·복잡한 DAG**가 있을 때의 선택지다.

## IaC: CloudFormation과 CDK

지금까지의 파이프라인·Registry·CI/CD는 모두 "어딘가에 인프라가 깔려 있다"는 전제 위에 있었다. 그 인프라를 콘솔에서 손으로 클릭해 만들면 재현 불가능하고 환경 간 드리프트(drift)가 생긴다.

- IaC는 인프라를 **선언적 코드**로 정의한다. 같은 코드로 dev/staging/prod를 동일하게 찍어낸다.
- 변경 이력을 Git으로 추적하고, 문제가 생기면 스택 단위로 롤백한다.

| 비교 축 | CloudFormation | AWS CDK |
|---------|----------------|---------|
| 작성 방식 | YAML/JSON 선언적 템플릿 | Python·TypeScript 등 프로그래밍 언어 |
| 반복·조건 | 내장 함수로 제한적 표현 | 언어의 `for`·`if`·함수로 자유롭게 |
| 추상화 | 리소스를 그대로 나열 | 컴포넌트(Construct)로 묶어 재사용 |
| 최종 산출물 | 그 자체가 스택 정의 | **합성(synth)하면 CloudFormation 템플릿** |
| 학습 곡선 | 문법은 단순, 규모가 커지면 장황 | 언어를 알면 빠르나 추상화 이해 필요 |
| 고르는 순간 | 단순·정적 인프라, 팀이 YAML에 익숙 | 반복 많은 다환경 구성, 개발자 중심 팀 |

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

- 세 리소스가 **Model → EndpointConfig → Endpoint** 순으로 참조로 묶여 있다. 참조가 곧 생성 순서다.
- 배포는 스택 단위로 원자적이다. 중간에 실패하면 CloudFormation이 이전 상태로 되돌린다.
- 모델 아티팩트 경로·이미지 URI를 `!Ref`로 파라미터화해 두면, 같은 템플릿에 **모델 버전만 갈아 끼워** 재배포할 수 있다. Deploy 파이프라인이 하는 일이 정확히 이것이다.
- 인프라를 IaC로 관리하기 시작했다면 **콘솔에서 손대지 않는 것**이 규칙이다. 손댄 변경은 다음 스택 배포에서 조용히 덮어써진다.

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

| 상태 타입 | 하는 일 |
|-----------|---------|
| `Task` | 실제 작업 호출(Lambda·Glue·SageMaker 등) |
| `Choice` | 조건 분기 |
| `Parallel` | 여러 갈래를 동시에 실행 |
| `Map` | 배열 원소마다 같은 처리를 반복 |
| `Wait` | 일정 시간·시각까지 대기 |
| `Retry` / `Catch` | 재시도 정책과 오류 처리 |

- SageMaker용으로는 `.sync` 통합으로 **작업 완료까지 기다릴 수 있다**. 이게 없으면 학습 작업을 시작만 하고 바로 다음 상태로 넘어간다.
- 워크플로 종류는 두 가지다. **Standard**는 오래 도는 워크플로에 맞고 실행 이력이 남아 감사·디버깅에 강하다. **Express**는 아주 짧고 대량으로 도는 이벤트 처리에 맞다. ML 학습 오케스트레이션은 시간이 길어 보통 Standard다.
- **Pipelines vs Step Functions 구분**: SageMaker 작업만 묶고 계보·Registry 통합이 필요하면 **Pipelines**, 여러 서비스를 폭넓게 엮고 일반 워크플로 제어가 필요하면 **Step Functions**.

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

EventBridge는 "무언가 일어나면(또는 정해진 시각에) 워크플로를 시작"하는 접착제다. **워크플로 자체를 정의하지는 않고, 시작 신호를 보낸다.**

| 규칙 구성 요소 | 하는 일 |
|----------------|---------|
| 이벤트 패턴 | 어떤 이벤트에 반응할지 JSON으로 서술(`source`, `detail-type`, `detail`) |
| 스케줄 식 | 시각 기반 트리거. `cron(...)` 또는 `rate(...)` — 기준 시각은 **UTC** |
| 타깃(target) | 이벤트가 매칭되면 호출할 대상(Lambda, Step Functions, CodePipeline 등) |
| 타깃 호출 역할 | EventBridge가 타깃을 부를 때 쓰는 IAM 역할. 없으면 조용히 실패한다 |

```text
   [S3 새 데이터]   [모델 Approved]   [매일 02:00]
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  EventBridge 규칙
                 (패턴 매칭 / 스케줄)
                         │  타깃 지정
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 SageMaker Pipeline  Step Functions   CodePipeline
   (실행 시작)          (상태 머신)      (배포 시작)
```

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

- 반대급부는 운영 부담이다. Airflow 환경(스케줄러·워커) 자체가 상시 떠 있어 서버리스인 Step Functions보다 유휴 비용과 관리 포인트가 많다.
- "새로 시작하는 SageMaker 중심 프로젝트"에 MWAA를 고르는 선택지는 거의 오답이다.

> 💡 **관련 이론**: 오케스트레이터 선택은 "어디까지 묶느냐 + 기존 자산이 무엇이냐"의 문제다. SageMaker 작업만 → Pipelines. 여러 AWS 서비스 서버리스 워크플로 → Step Functions. 이미 Airflow 자산/하이브리드 → MWAA. 단순 트리거/스케줄 → EventBridge. 인프라 정의 → CloudFormation/CDK. 시험은 이 다섯을 시나리오로 갈라 묻는다.

## 다섯 도구 한눈에 정리

| 도구 | 성격 | 언제 쓰나 | 시험 키워드 |
|------|------|----------|-------------|
| **CloudFormation / CDK** | IaC(인프라 정의) | 인프라를 코드로 재현·버전 관리 | 재현 가능, 환경 일관성, 드리프트 제거 |
| **SageMaker Pipelines** | ML 워크플로 | SageMaker 작업 중심, 계보·Registry 통합 | 전처리→학습→평가→등록, 계보 |
| **Step Functions** | 범용 워크플로 | 여러 AWS 서비스에 걸친 서버리스 오케스트레이션 | Glue+Lambda+SNS, 분기·재시도 |
| **EventBridge** | 트리거 | 스케줄·이벤트로 워크플로 시작 | 매일 새벽, 승인 시, 새 데이터 도착 시 |
| **MWAA (Airflow)** | 관리형 워크플로 | 기존 Airflow 자산·하이브리드·복잡한 DAG | 이미 Airflow 사용 중, 온프레미스 포함 |

> ⚠️ **함정**: EventBridge를 오케스트레이터로 제시하는 보기를 조심하라. EventBridge는 "언제 시작할지"만 정하고 "무엇을 어떤 순서로 할지"는 모른다. 분기·재시도·의존성이 요구에 들어 있으면 답은 Step Functions나 Pipelines이고, EventBridge는 그 앞에 붙는 방아쇠일 뿐이다.

## 오케스트레이션이 꼬일 때: 증상 → 원인 → 조치

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| 환경마다 엔드포인트 설정이 미묘하게 다르다 | 콘솔 수동 생성으로 드리프트 발생 | CloudFormation/CDK 템플릿 하나로 통일 배포 |
| 학습이 끝나기도 전에 다음 상태로 넘어간다 | Step Functions에서 `.sync` 통합 미사용 | `.sync` 리소스로 완료 대기하도록 변경 |
| 스케줄 규칙이 있는데 실행이 안 된다 | 타깃 미연결, 규칙 비활성, cron 표현식 오류 | 타깃·활성 상태·표현식(UTC 기준) 점검 |
| 트리거는 되는데 대상이 실행을 거부한다 | EventBridge 타깃 호출 권한 부족 | 타깃 호출용 역할 권한 부여 |
| 재시도·분기를 파이프라인으로 못 만들겠다 | 도구 선택 오류(범위가 SageMaker를 넘음) | Step Functions로 상위 오케스트레이션 이관 |
| 스택 배포가 실패하고 통째로 롤백된다 | 리소스 이름 충돌·권한 부족·의존 리소스 미생성 | 스택 이벤트에서 최초 실패 리소스부터 확인 |
| Airflow 환경 비용이 계속 나간다 | MWAA는 상시 실행 환경 | 워크플로 성격이 이벤트성이면 Step Functions 검토 |
| 파이프라인 정의를 손으로 고쳐 두었더니 다음 배포에 사라졌다 | IaC 관리 대상을 콘솔에서 수정 | 변경은 코드에서만 하고 스택으로 재배포 |

> 💡 **개념**: 다섯 도구는 경쟁 관계가 아니라 **층**이다. 아래에서부터 IaC(무엇이 존재하는가) → 워크플로(무엇을 어떤 순서로) → 트리거(언제 시작하는가)로 쌓인다. 시나리오를 읽을 때 "이건 어느 층 이야기인가"를 먼저 물으면 보기 절반이 자동으로 걸러진다.

내일은 이번 주에 나온 MLOps 조각들을 하나의 사슬로 묶어 복습한다.

## 📖 용어

- **IaC (Infrastructure as Code)** : 서버·역할·엔드포인트 같은 인프라를 클릭이 아니라 코드로 적어 두고 그대로 찍어내는 방식.
- **CloudFormation** : "이런 상태였으면 좋겠다"를 YAML/JSON으로 적으면 그대로 만들어 주는 AWS 기본 IaC 서비스.
- **AWS CDK** : 같은 인프라를 파이썬·타입스크립트 코드로 쓰게 해 주는 도구. 합성하면 CloudFormation 템플릿이 나온다.
- **스택(Stack)** : CloudFormation이 한 덩어리로 만들고 지우고 되돌리는 리소스 묶음 단위.
- **드리프트(drift)** : 코드에 적힌 상태와 실제 인프라가 조금씩 어긋나는 현상. 수동 변경이 주범이다.
- **멱등성(idempotency)** : 같은 것을 여러 번 적용해도 결과가 한 번 적용한 것과 같은 성질.
- **Step Functions** : 여러 AWS 서비스 호출을 상태 하나씩으로 이어 붙여 분기·재시도까지 표현하는 워크플로 서비스. 그 정의를 상태 머신이라 부른다.
- **`.sync` 통합** : Step Functions가 호출한 작업이 끝날 때까지 기다렸다가 다음으로 넘어가게 하는 방식.
- **EventBridge** : 이벤트를 받아 규칙에 맞으면 정해진 대상에게 넘겨 주는 라우터. 워크플로의 방아쇠 역할.
- **MWAA** : AWS가 대신 운영해 주는 Apache Airflow. 이미 Airflow DAG 자산이 있을 때 이어가는 선택지.

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
