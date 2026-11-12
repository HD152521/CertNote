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

## 📝 Practice Questions

**Question 1.** How do you deploy a Lambda function with zero downtime and gradually shift traffic to the new version?

A) Update the Lambda function and deploy immediately  
B) Publish a new version → update the alias to the new version with traffic weights set (for example, 10% new, 90% existing)  
C) Deploy new code from S3  
D) Delete and recreate the Lambda function  

**Answer: B**
Explanation: A Lambda version is an immutable snapshot and an alias is a mutable pointer. If you update the alias to the new version and set weights with routing-config (for example, 90% version 1, 10% version 2), a zero-downtime traffic shift is possible.

---

**Question 2.** How do you automatically publish Lambda function versions and deploy with CodeDeploy in an AWS SAM template?

A) Set `AutoPublishAlias` in the SAM template and define hooks in the CodeDeploy AppSpec  
B) Deploy manually from the CloudFormation console  
C) Publish versions one by one from the Lambda console  
D) Use only $LATEST without version management  

**Answer: A**
Explanation: The SAM `AutoPublishAlias` property automatically publishes a new version and updates the alias at deployment. The `BeforeAllowTraffic`/`AfterAllowTraffic` hooks in the CodeDeploy AppSpec handle deployment validation.

---

**Question 3.** What happens if a test fails during a CodeDeploy Lambda deployment?

A) The deployment proceeds and all traffic shifts to the new version  
B) The alias is automatically rolled back to the previous version  
C) The alias must be rolled back manually  
D) It is only logged in CloudWatch and the deployment continues  

**Answer: B**
Explanation: If a BeforeAllowTraffic or AfterAllowTraffic test fails during a CodeDeploy deployment, the alias is automatically rolled back to the previous version. Clients are not affected.

---

**Question 4.** What is the actual behavior of the first line of a SAM template, `Transform: AWS::Serverless-2016-10-31`?

A) It expands SAM pseudo-resources into CFN-native resources as a CloudFormation macro  
B) It converts Lambda code to Python  
C) It automatically creates an IAM role at deployment time  
D) It triggers sam build  

**Answer: A**
Explanation: Transform is the CloudFormation macro mechanism (2016): before the template reaches the CFN engine, a separate Lambda macro rewrites the template. After macro processing, `AWS::Serverless::Function` is unrolled into 6 to 8 real resources such as `AWS::Lambda::Function` + `AWS::IAM::Role` + `AWS::Lambda::Permission`. B has nothing to do with code conversion, C is only one of the results of macro processing and not the role of the macro itself, and D is a separate step of the sam CLI. You can check the unrolled result in the "Processed template" tab of the CFN console.

---

**Question 5.** Which area that `sam local invoke` does NOT validate is the most dangerous?

A) Handling of normal input by the function logic  
B) IAM role deny policies + actual VPC ENI creation latency  
C) JSON parsing errors  
D) Loading environment variables  

**Answer: B**
Explanation: SAM Local uses the host's AWS credentials as they are, so the permission boundary of the IAM role is not validated. Network latency such as VPC ENI creation (8 to 10 seconds), RDS Proxy connections, and security group egress rules also does not exist locally. As in the 2020 fintech case, this is the typical scenario where the function passes locally and then dies from a timeout in prod. A/C/D can all be validated locally. Lesson: local is for logic, integration belongs in the dev cloud.

---

**Question 6.** To configure SAM so that a new Lambda version receives only 10% of traffic for 30 minutes and is rolled back immediately if a 5xx alarm fires, you would use:

A) `DeploymentPreference: AllAtOnce` + Alarm  
B) `DeploymentPreference: Linear10PercentEvery10Minutes` + Alarm  
C) `DeploymentPreference: Canary10Percent30Minutes` + a connected CloudWatch Alarm  
D) sam sync --watch  

**Answer: C**
Explanation: The Canary pattern has two steps: "first N% → wait a set time → 100%." Canary10Percent30Minutes runs at 10% for 30 minutes and then jumps to 100%. Linear (B) is a multi-step pattern that keeps increasing by 10% at 1/10-minute intervals, so it differs in meaning from the scenario's "10% for 30 minutes, then 100%." AllAtOnce (A) goes to 100% immediately. sam sync (D) is for development acceleration and has nothing to do with traffic shifting. When an alarm is connected, CodeDeploy automatically rolls back to the previous version as soon as it fires.

---

**Question 7.** What benefit do the two flags of `sam build --use-container --cached` provide together?

A) Building in a Lambda runtime container guarantees native dependency compatibility + reusing unchanged dependencies shortens build time  
B) Cost savings  
C) Automatic IAM permission grants  
D) Automatic Canary activation  

**Answer: A**
Explanation: It is a common problem that Python `.so` files built on macOS/Windows are incompatible with Lambda's Linux glibc (2022 SaaS case). `--use-container` solves this by building in the same container image as the Lambda runtime. `--cached` reuses the dependency layer if requirements have not changed. Build time drops to 1/2 to 1/3. B/C/D are unrelated.

---

**Question 8.** What is the biggest reason not to use `sam sync --watch` in production?

A) It costs more  
B) It bypasses CloudFormation tracking, causing drift, and the next sam deploy overwrites the changes  
C) It is not supported in the Korea Region  
D) It does not support Java functions  

**Answer: B**
Explanation: sam sync patches code changes directly with the `update-function-code` API, so the state of the CFN stack and the actual state diverge (drift). The next regular sam deploy overwrites the changes based on the CFN state, so the hotswap changes disappear. In addition, no ChangeSet is created, which defeats the change history and approval workflow. It is explicitly a development-acceleration tool, and for production the standard is the regular sam deploy + CodeDeploy combination.

---

**Question 9.** Which statement about the limits of SAM policy templates is MOST accurate?

A) They add cost  
B) `DynamoDBReadPolicy: TableName` includes permissions for all GSIs/LSIs of that table — it may not be true least privilege  
C) IAM policy evaluation becomes slower  
D) They conflict with Lambda layers  

**Answer: B**
Explanation: Policy templates reduce boilerplate, but their permission scope can be broader than hand-written IAM JSON. AWS publishes the expanded IAM JSON of every template in its official GitHub repository, so in PCI/HIPAA environments you need to review them before adopting. If you need exact least privilege, write it yourself with a `Policies: - Statement: - Effect: Allow, Action: [...], Resource: [...]` block. A/C/D are all unrelated.

---

**Question 10.** Which resources does `sam pipeline bootstrap` for SAM Pipelines create in each environment's account?

A) Lambda function + DynamoDB table  
B) Pipeline execution role + CFN execution role + artifact S3 bucket + (optional) ECR repository  
C) VPC + subnet + NAT gateway  
D) Cognito user pool  

**Answer: B**
Explanation: bootstrap creates only the CI/CD infrastructure (permissions + artifact storage). This set of four is isolated in each environment account, so a dev pipeline cannot access resources in the prod account (the namespace isolation principle of NIST SP 800-204C). Application resources (Lambda, DynamoDB) are created later with sam deploy. A/C/D belong to the application domain and are unrelated to bootstrap.
