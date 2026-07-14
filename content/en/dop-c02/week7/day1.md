# Day 1 - Serverless CI/CD: Lambda, SAM, and Canary Deployments

AWS Lambda is fundamentally different from containers. No infrastructure to manage, no scaling configuration, pure function-as-a-service. But this simplicity masks complexity in versioning, alias management, and deployment strategy. A function update affects all users simultaneously unless carefully version-controlled. A broken deployment has nowhere to roll back except manual code changes.

This week covers AWS SAM (Serverless Application Model) as infrastructure-as-code for Lambda, version/alias patterns for traffic control, and CodeDeploy Canary strategy for serverless safety nets. Together, these create serverless deployment reliability matching container platforms.

## Lambda Version and Alias Fundamentals

Lambda functions have two forms of code identity: **Version** and **Alias**.

**Versions** are immutable snapshots. Publishing a version creates `$LATEST` → `1`. Publish again → `$LATEST` → `2`. Versions are numbered sequentially, never deleted, never modified. Request `arn:aws:lambda:...:function:myapp:1` always executes the exact code from first publish.

**Aliases** are mutable pointers to versions. Create alias `LIVE` pointing to version 1. Later, point `LIVE` to version 2. Same ARN (`arn:aws:lambda:...:function:myapp:LIVE`) executes different code. Aliases enable zero-downtime deployments—switch traffic between versions via alias update.

The combination enables traffic-weighted canary deployments: version 1 (5%), version 2 (95%). As version 2 proves stable, increase weight until 100%, then delete version 1.

```bash
# Publish version 1
aws lambda publish-version \
  --function-name myapp \
  --query 'Version' --output text  # Returns "1"

# Create alias LIVE pointing to version 1
aws lambda create-alias \
  --function-name myapp \
  --name LIVE \
  --function-version 1

# Update alias to point version 2 with traffic weight
aws lambda update-alias \
  --function-name myapp \
  --name LIVE \
  --function-version 2 \
  --routing-config AdditionalVersionWeights={"1"=0.05}  # 95% version 2, 5% version 1
```

Invoking alias: `arn:aws:lambda:region:account:function:myapp:LIVE` automatically routes according to weight. Clients see no difference; Lambda handles distribution.

> 💡 **Related Theory**: Lambda version/alias system implements **blue-green deployment pattern** without infrastructure switching. Traditional blue-green replaces entire environments; Lambda switches versions via pointer update. Traffic shifting is built-in via routing weights.

## AWS SAM: Infrastructure as Code for Serverless

AWS SAM (Serverless Application Model) is declarative IaC for serverless architectures. Simpler than CloudFormation for Lambda, API Gateway, DynamoDB, SNS/SQS use cases.

SAM template structure:
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Description: Serverless checkout service

Globals:
  Function:
    Timeout: 30
    MemorySize: 512
    Runtime: python3.11

Resources:
  CheckoutFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: checkout-service
      CodeUri: src/
      Handler: app.lambda_handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref OrdersTable
      Environment:
        Variables:
          ORDERS_TABLE: !Ref OrdersTable
      Events:
        ApiEvent:
          Type: Api
          Properties:
            RestApiId: !Ref CheckoutApi
            Path: /orders
            Method: POST

  CheckoutApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      TracingEnabled: true
      MethodSettings:
        - ResourcePath: '/**'
          HttpMethod: '*'
          LoggingLevel: INFO

  OrdersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: orders
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: order_id
          AttributeType: S
      KeySchema:
        - AttributeName: order_id
          KeyType: HASH

Outputs:
  CheckoutApiEndpoint:
    Description: API Gateway endpoint
    Value: !Sub 'https://${CheckoutApi}.execute-api.${AWS::Region}.amazonaws.com/prod'
  CheckoutFunctionArn:
    Description: Checkout Lambda ARN
    Value: !GetAtt CheckoutFunction.Arn
```

SAM deployment:
```bash
# Package (builds function, creates S3 deployment package)
sam build
sam package \
  --output-template-file packaged.yaml \
  --s3-bucket deployment-bucket

# Deploy
sam deploy \
  --template-file packaged.yaml \
  --stack-name checkout-stack \
  --capabilities CAPABILITY_IAM
```

SAM is CloudFormation under-the-hood—`sam deploy` creates CloudFormation stack. Simplified syntax vs raw CloudFormation.

> 📚 **Case**: Serverless application architecture evolution. Initial: manual Lambda creation via console. Problem: infrastructure lost on accidental delete, impossible to reproduce. Migration to Terraform: full control but verbose. SAM adoption: Terraform simplicity matched with AWS-native features (Policies, Events, Globals shortcuts).

## CodeDeploy Canary Deployments for Lambda

CodeDeploy applies continuous deployment principles to Lambda. Canary deployment: shift small traffic percentage to new version; monitor errors; gradually increase if stable.

AppSpec configuration for Lambda:
```yaml
version: 0.0
Resources:
  - MyLambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: !Ref MyLambdaFunctionName
        Alias: !Ref MyLambdaFunctionAlias
        CurrentVersion: !Ref MyLambdaFunctionVersion
        TargetVersion: !Ref MyLambdaFunctionVersionNew
Hooks:
  - BeforeAllowTraffic: !Ref PreTrafficHook
  - AfterAllowTraffic: !Ref PostTrafficHook
```

CodeDeploy automatically:
1. Creates new version from $LATEST
2. Establishes alias pointing new version with canary weight (e.g., 10%)
3. Executes BeforeAllowTraffic hook (pre-traffic tests)
4. Gradually increases weight based on monitoring (0% → 10% → 50% → 100%)
5. Executes AfterAllowTraffic hook (post-deployment validation)
6. On failure, rollback alias to previous version

Pre/post-traffic hooks are Lambda functions validating deployment:

```python
# Pre-traffic validation hook
import boto3
import json

codedeploy = boto3.client('codedeploy')

def lambda_handler(event, context):
    deployment_id = event['DeploymentId']
    lifecycle_event_id = event['LifecycleEventHookExecutionId']
    
    # Test new Lambda function version
    try:
        # Integration test against new version
        test_response = invoke_target_function(event['TargetLambda'])
        assert test_response['statusCode'] == 200
        status = 'Succeeded'
    except Exception as e:
        print(f'Test failed: {e}')
        status = 'Failed'
    
    codedeploy.put_lifecycle_event_hook_execution_status(
        deploymentId=deployment_id,
        lifecycleEventHookExecutionId=lifecycle_event_id,
        status=status
    )
    
    return {'statusCode': 200}
```

> 🔍 **Deep Dive**: Lambda canary deployment weight progression depends on CloudWatch metric monitoring. CodeDeploy queries CloudWatch alarms—if alarm trips, traffic decrease reverses progress. If alarms stay green, progress continues. Default progression: 10% → 50% → 100%, but configurable via CodeDeployConfig.

## Step Functions: Orchestrating Complex Serverless Workflows

Step Functions is workflow orchestration service for serverless. Coordinates Lambda, ECS, SNS, DynamoDB, SQS, and other services into complex business logic DAGs (Directed Acyclic Graphs).

State machine definition (JSON):
```json
{
  "Comment": "Order processing workflow",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:region:account:function:validate-order",
      "Catch": [{
        "ErrorEquals": ["InvalidOrderError"],
        "Next": "NotifyInvalidOrder"
      }],
      "Next": "ProcessPayment"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:region:account:function:charge-card",
      "Retry": [{
        "ErrorEquals": ["ThrottlingException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }],
      "Next": "ShipOrder"
    },
    "ShipOrder": {
      "Type": "Task",
      "Resource": "arn:aws:ecs:region:account:service/shipping/ship-order",
      "TimeoutSeconds": 3600,
      "Next": "NotifyCustomer"
    },
    "NotifyCustomer": {
      "Type": "Task",
      "Resource": "arn:aws:sns:region:account:order-shipped",
      "End": true
    },
    "NotifyInvalidOrder": {
      "Type": "Task",
      "Resource": "arn:aws:sns:region:account:invalid-order",
      "End": true
    }
  }
}
```

Execution flow: ValidateOrder Lambda → on success ProcessPayment → ShipOrder → NotifyCustomer. On InvalidOrderError, skip to NotifyInvalidOrder. Automatic retry on ThrottlingException.

> 💡 **Related Theory**: Step Functions implements **orchestration pattern vs choreography**. Orchestration: central coordinator (Step Functions) directs services. Choreography: each service knows next step, triggers it. Orchestration centralizes logic (easier debugging), requires orchestrator availability. Choreography distributes logic (resilient), complicates tracing.

---

## 📝 연습 문제

**문제 1.** Lambda 함수를 무중단 배포하고 새 버전으로 트래픽을 점진적으로 전환하려면?

A) Lambda 함수를 업데이트하고 즉시 배포  
B) 새 버전을 발행 → Alias를 새 버전으로 업데이트하되 트래픽 가중치 설정 (예: 10% 신규, 90% 기존)  
C) S3에서 새 코드 배포  
D) Lambda를 삭제하고 재생성  

**정답: B**
해설: Lambda 버전은 불변 스냅샷이고 별칭은 가변 포인터다. Alias를 새 버전으로 업데이트하되 routing-config로 가중치를 설정하면 (예: 90% version 1, 10% version 2) 무중단 트래픽 전환이 가능하다.

---

**문제 2.** AWS SAM 템플릿에서 Lambda 함수 버전을 자동으로 발행하고 CodeDeploy로 배포하려면?

A) SAM 템플릿에 `AutoPublishAlias` 설정, CodeDeploy AppSpec에 Hooks 정의  
B) CloudFormation 콘솔에서 수동 배포  
C) Lambda 콘솔에서 일일이 버전 발행  
D) 버전 관리 없이 $LATEST만 사용  

**정답: A**
해설: SAM의 `AutoPublishAlias` 속성이 배포 시 자동으로 새 버전을 발행하고 Alias를 업데이트한다. CodeDeploy AppSpec의 `BeforeAllowTraffic`/`AfterAllowTraffic` Hooks가 배포 검증을 담당한다.

---

**문제 3.** CodeDeploy Lambda 배포 중 테스트가 실패하면?

A) 배포가 진행되고 모든 트래픽이 새 버전으로 전환  
B) Alias가 이전 버전으로 자동 롤백  
C) 수동으로 Alias 롤백 필요  
D) CloudWatch에만 로그 기록, 배포 계속  

**정답: B**
해설: CodeDeploy 배포 중 BeforeAllowTraffic 또는 AfterAllowTraffic 테스트 실패 시 자동으로 Alias가 이전 버전으로 롤백된다. 클라이언트는 영향을 받지 않는다.

---
