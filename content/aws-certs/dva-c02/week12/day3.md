# Day 58 - SAM: 서버리스 애플리케이션 모델

📅 날짜: 2026년 8월 4일 (화요일)  
🎯 주제: AWS SAM (Serverless Application Model)  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SAM 템플릿 구조와 CloudFormation과의 관계를 이해한다
- SAM CLI로 로컬 개발 환경을 구성한다
- SAM으로 완전한 서버리스 스택을 배포한다

---

## 📖 이론 내용

### 1. AWS SAM이란?

서버리스 애플리케이션을 위한 CloudFormation 확장 프레임워크입니다.

**SAM vs CloudFormation:**
- SAM: 서버리스에 최적화된 간결한 문법
- CloudFormation: 일반 AWS 인프라, 더 자세한 설정

**SAM이 자동으로 변환하는 리소스:**
- `AWS::Serverless::Function` → `AWS::Lambda::Function` + `AWS::Lambda::Permission` + ...
- `AWS::Serverless::Api` → `AWS::ApiGateway::RestApi` + ...
- `AWS::Serverless::SimpleTable` → `AWS::DynamoDB::Table`

### 2. SAM 템플릿 예시

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31  # SAM 변환 선언

Description: 주문 처리 서버리스 앱

Globals:
  Function:
    Runtime: python3.9
    Timeout: 30
    Environment:
      Variables:
        TABLE_NAME: !Ref OrdersTable
        ENV: !Ref EnvironmentName

Parameters:
  EnvironmentName:
    Type: String
    Default: production

Resources:
  # API Gateway + Lambda 통합
  CreateOrderFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/create_order.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref OrdersTable
      Events:
        CreateOrder:
          Type: Api
          Properties:
            Path: /orders
            Method: POST
            RestApiId: !Ref OrdersApi

  GetOrderFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/get_order.handler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref OrdersTable
      Events:
        GetOrder:
          Type: Api
          Properties:
            Path: /orders/{orderId}
            Method: GET
            RestApiId: !Ref OrdersApi

  # API Gateway
  OrdersApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: !Ref EnvironmentName
      Cors:
        AllowMethods: "'GET,POST,PUT,DELETE'"
        AllowHeaders: "'Content-Type,Authorization'"
        AllowOrigin: "'*'"
      Auth:
        DefaultAuthorizer: CognitoAuth
        Authorizers:
          CognitoAuth:
            UserPoolArn: !GetAtt UserPool.Arn

  # DynamoDB 테이블
  OrdersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      TableName: !Sub "${EnvironmentName}-orders"
      PrimaryKey:
        Name: orderId
        Type: String
      ProvisionedThroughput:
        ReadCapacityUnits: 5
        WriteCapacityUnits: 5

Outputs:
  ApiUrl:
    Value: !Sub "https://${OrdersApi}.execute-api.${AWS::Region}.amazonaws.com/${EnvironmentName}"
```

### 3. SAM CLI 명령어

```bash
# SAM 프로젝트 초기화
sam init --runtime python3.9 --name my-app

# 로컬 Lambda 실행
sam local invoke CreateOrderFunction \
    --event events/create_order.json

# 로컬 API Gateway 시작
sam local start-api --port 3000

# 빌드
sam build

# 배포 (처음)
sam deploy --guided

# 배포 (이후)
sam deploy

# 로그 확인
sam logs -n CreateOrderFunction --tail

# 삭제
sam delete --stack-name my-app
```

### 4. SAM Policy Templates

자주 사용하는 권한을 간단하게 설정합니다:

```yaml
Policies:
  # DynamoDB CRUD
  - DynamoDBCrudPolicy:
      TableName: !Ref MyTable
  
  # S3 읽기
  - S3ReadPolicy:
      BucketName: !Ref MyBucket
  
  # SQS 소비자
  - SQSPollerPolicy:
      QueueName: !GetAtt MyQueue.QueueName
  
  # SNS 발행
  - SNSPublishMessagePolicy:
      TopicName: !GetAtt MyTopic.TopicName
```

---

## 🧠 알아두면 좋은 심화 이론

### SAM 리소스 매핑 (시험 가끔)

| SAM 리소스 | 생성되는 CFN 리소스 |
|------------|--------------------|
| `AWS::Serverless::Function` | Lambda Function + Role + EventSource + Permissions |
| `AWS::Serverless::Api` | API Gateway RestApi + Deployment + Stage + Methods |
| `AWS::Serverless::HttpApi` | API Gateway V2 |
| `AWS::Serverless::SimpleTable` | DynamoDB Table |
| `AWS::Serverless::StateMachine` | Step Functions |
| `AWS::Serverless::LayerVersion` | Lambda Layer |
| `AWS::Serverless::Application` | Nested Stack |

### SAM 이벤트 소스 (시험 자주)

```yaml
Events:
  # HTTP API
  Api:        Type: Api / HttpApi
  # 비동기 트리거
  S3:         Type: S3
  SNS:        Type: SNS
  Schedule:   Type: Schedule  # cron / rate
  # 폴링
  SQS:        Type: SQS
  DynamoDB:   Type: DynamoDB
  Kinesis:    Type: Kinesis
  Kafka:      Type: MSK
  # 기타
  Cognito:    Type: Cognito
  EventBridge: Type: EventBridgeRule
```

### sam deploy --guided 옵션

- 첫 배포 시 wizard로 설정 (Stack 이름·리전·확인)
- `samconfig.toml`에 저장
- 다음 배포부터 `sam deploy`만으로 가능

### SAM Pipeline & SAM CLI 신규

- `sam pipeline init` → CI/CD 파이프라인 자동 생성 (CodePipeline 또는 GitHub Actions)
- `sam sync --watch` → 코드 변경 자동 배포 (개발용)
- `sam logs` → CloudWatch Logs tail

### Lambda Layer를 SAM에서

```yaml
MyLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: shared-libs
    ContentUri: ./layer/
    CompatibleRuntimes: [python3.9, python3.10]

MyFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref MyLayer
```

### Globals 섹션 (시험 가끔)

```yaml
Globals:
  Function:
    Runtime: python3.9
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        LOG_LEVEL: INFO
  Api:
    Cors: "'*'"
```

모든 Function·Api·HttpApi·SimpleTable에 적용. 개별 리소스에서 override 가능.

### SAM Accelerate (`sam sync`)

- 빠른 개발 사이클: 코드 변경 시 빌드·배포 단축
- Lambda 함수 코드만 업데이트 (CFN 변경 없음)
- 시험엔 거의 안 나옴 (개발자 경험)

### SAM Connector (2023 신규)

- 리소스 간 권한·연결을 선언적으로 설정
- IAM 정책 자동 생성

```yaml
Connectors:
  MyConnector:
    Source: !Ref MyFunction
    Destination: !Ref MyTable
    Permissions: [Read, Write]
```

### 관련 서비스 Cross-Reference

- **SAM ↔ CloudFormation** → SAM은 CFN 매크로
- **SAM ↔ CodeDeploy** → Lambda Canary 배포 자동
- **SAM Local + AWS Toolkit** → IDE 통합 디버깅
- **AWS::Serverless::Application** → SAR (Serverless Application Repository)

---

## 아키텍처 다이어그램

```
SAM 배포 흐름
================================

[sam build]
  소스 코드 컴파일/패키징
     |
     v
[sam deploy]
  SAM 템플릿 → CloudFormation 템플릿 변환
     |
     | S3에 업로드
     v
[CloudFormation 스택]
  Lambda 함수 생성
  API Gateway 생성
  DynamoDB 테이블 생성
  IAM 역할 자동 생성
  
로컬 개발
================================

[sam local start-api]
  |
  | 로컬 Docker 컨테이너
  v
[Lambda 함수 실행]
  http://localhost:3000/orders
  
  (실제 DynamoDB/S3는 AWS 리소스 사용)
```

---

## ⭐ 핵심 포인트

1. ⭐ **Transform**: `AWS::Serverless-2016-10-31` 선언 필수
2. ⭐ **SAM = CloudFormation 확장**: 배포 시 CloudFormation으로 변환
3. ⭐ **sam local**: 로컬에서 Lambda/API 테스트, Docker 필요
4. ⭐ **Policy Templates**: DynamoDBCrudPolicy 등 간편한 권한 설정
5. ⭐ **sam deploy --guided**: 처음 배포 시 설정 wizard 실행

---

## 📝 연습 문제

**문제 1.** SAM 템플릿에서 반드시 선언해야 하는 것은?

A) Globals 섹션  
B) Transform: AWS::Serverless-2016-10-31  
C) Outputs 섹션  
D) Parameters 섹션  

**정답: B** - SAM 템플릿임을 선언하는 `Transform: AWS::Serverless-2016-10-31`은 필수입니다.

---

**문제 2.** SAM과 CloudFormation의 관계는?

A) 완전히 별개의 서비스  
B) SAM은 CloudFormation의 확장, 배포 시 CloudFormation으로 변환  
C) SAM이 CloudFormation을 대체  
D) CloudFormation이 SAM의 일부  

**정답: B** - SAM 템플릿은 `sam deploy` 시 CloudFormation 템플릿으로 변환되어 배포됩니다.

---

**문제 3.** 로컬에서 Lambda 함수를 테스트하는 SAM 명령어는?

A) sam build  
B) sam deploy --local  
C) sam local invoke  
D) sam test  

**정답: C** - `sam local invoke`는 로컬 Docker 컨테이너에서 Lambda 함수를 실행합니다.

---

**문제 4.** SAM에서 DynamoDB 테이블에 CRUD 권한을 부여하는 방법은?

A) IAM 정책을 직접 JSON으로 작성  
B) DynamoDBCrudPolicy 정책 템플릿 사용  
C) 관리형 정책 ARN 직접 지정  
D) 인라인 정책 작성  

**정답: B** - SAM은 DynamoDBCrudPolicy, S3ReadPolicy 등의 Policy Templates를 제공하여 간단하게 권한을 설정할 수 있습니다.

---

**문제 5.** SAM 로컬 개발 환경에서 필요한 도구는?

A) AWS 콘솔 접근만 필요  
B) Docker (Lambda 컨테이너 실행에 필요)  
C) Kubernetes  
D) VPC 설정  

**정답: B** - SAM 로컬 실행은 Docker 컨테이너를 사용하므로 Docker가 설치되어 있어야 합니다.

---

## 📌 오늘의 요약

1. SAM: 서버리스 최적화 CloudFormation 확장, Transform 선언 필수
2. 리소스 단순화: Serverless::Function, Serverless::Api, Serverless::SimpleTable
3. SAM CLI: build/deploy/local invoke/start-api/logs
4. Policy Templates: DynamoDBCrudPolicy 등 간편한 권한 설정
5. 로컬 개발: Docker 기반, 실제 AWS 리소스와 통합 테스트 가능
