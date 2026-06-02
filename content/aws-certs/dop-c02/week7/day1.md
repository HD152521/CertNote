# Day 1 - AWS SAM - 템플릿, 로컬 테스트, 배포

📅 날짜: Week 7 (Day 1)
🎯 주제: 서버리스 애플리케이션 모델 — CloudFormation의 서버리스 사용자 친화 확장
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SAM Template과 CloudFormation의 관계
- AWS::Serverless::* 리소스 타입 (Function, Api, StateMachine, HttpApi, Table)
- `sam local invoke/start-api`로 로컬 테스트
- SAM Pipelines로 멀티 환경 배포 자동화

---

## 🧩 사전 지식 (CS 기초)

- **Serverless**: 서버 인프라 관리 없음. Lambda + API Gateway + DynamoDB 등.
- **Event Source Mapping**: Lambda를 트리거하는 이벤트 소스 (S3, SQS, Kinesis, DynamoDB Streams).
- **Macro / Transform**: CloudFormation의 사용자 정의 변환. SAM이 이를 사용.
- **Layer**: Lambda 코드 외 별도 zip. 의존성 분리 + 함수 간 공유.

---

## 📖 이론 내용

### 1. SAM Template = CFN의 확장

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31   # ← 이 한 줄이 SAM 활성화

Globals:
  Function:
    Runtime: python3.11
    Architectures: [arm64]
    Timeout: 30
    MemorySize: 512
    Tracing: Active
    Environment:
      Variables:
        LOG_LEVEL: INFO

Resources:
  GetOrderFn:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./src/get_order/
      Handler: app.handler
      Events:
        Api:
          Type: HttpApi
          Properties:
            ApiId: !Ref OrdersApi
            Path: /orders/{id}
            Method: GET
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref OrdersTable
      Layers:
        - !Ref CommonLayer

  OrdersApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: prod
      Auth:
        Authorizers:
          CognitoAuth:
            JwtConfiguration:
              issuer: !Sub 'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPoolId}'
              audience: [!Ref AppClientId]
            IdentitySource: $request.header.Authorization
        DefaultAuthorizer: CognitoAuth

  OrdersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      PrimaryKey: {Name: id, Type: String}
      ProvisionedThroughput:
        ReadCapacityUnits: 5
        WriteCapacityUnits: 5

  CommonLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      ContentUri: ./layers/common/
      CompatibleRuntimes: [python3.11]
```

배포 시 `Transform`이 SAM 매크로를 호출해 CFN 네이티브 리소스로 확장:
- `AWS::Serverless::Function` → `AWS::Lambda::Function` + `AWS::IAM::Role` + `AWS::Lambda::EventSourceMapping` + ...

### 2. SAM CLI 핵심 명령

| 명령 | 용도 |
|------|------|
| `sam init` | 프로젝트 초기화 |
| `sam build` | 코드 + 의존성 빌드 (Lambda 호환 환경) |
| `sam local invoke` | 로컬 Lambda 호출 (Docker 컨테이너) |
| `sam local start-api` | 로컬 API Gateway 에뮬레이션 |
| `sam local start-lambda` | 로컬 Lambda 엔드포인트 |
| `sam validate` | 템플릿 검증 |
| `sam deploy` | 배포 (CloudFormation Stack 생성/업데이트) |
| `sam sync` | 코드 변경만 빠르게 동기화 (개발용) |
| `sam logs` | 함수 로그 조회 |
| `sam pipeline init` | CodePipeline 자동 생성 |

### 3. 로컬 테스트

```bash
# 단일 함수 호출
sam local invoke GetOrderFn -e events/get-order.json

# API 에뮬레이션
sam local start-api --port 3000
curl http://localhost:3000/orders/123

# 이벤트 샘플 생성
sam local generate-event apigateway aws-proxy > events/api-event.json
sam local generate-event s3 put > events/s3-event.json
```

Docker 컨테이너로 실제 Lambda 런타임 에뮬레이션 — 100% 호환은 아님 (CPU 아키텍처, 환경 변수 등).

### 4. sam deploy --guided

대화형 첫 배포:
- Stack name
- Region
- Parameter values
- Confirm changes before deploy
- Save settings to samconfig.toml

이후 `sam deploy`만으로 같은 설정 사용.

### 5. SAM Policy Templates

`Policies` 필드에 사전 정의 템플릿 사용:

| 템플릿 | 용도 |
|--------|------|
| `DynamoDBReadPolicy` | 특정 테이블 읽기 |
| `DynamoDBCrudPolicy` | CRUD |
| `S3ReadPolicy` / `S3CrudPolicy` | S3 |
| `SQSPollerPolicy` | SQS 폴링 |
| `KinesisStreamReadPolicy` | Kinesis 읽기 |
| `LambdaInvokePolicy` | 다른 Lambda 호출 |

코드를 100줄 짧게 만들고 흔한 IAM 실수 방지.

### 6. SAM Pipelines

```bash
sam pipeline init --bootstrap
# → 멀티 환경 (dev/staging/prod) 자동 CodePipeline 생성
# → 각 환경별 IAM Role, 아티팩트 S3 등 자동 구성
```

생성되는 구성:
- 환경별 `bootstrap` (IAM Role, S3, ECR)
- 단일 CodePipeline 또는 환경별 분리
- GitHub Actions, GitLab CI, Jenkins 템플릿도 옵션

### 7. DeploymentPreference로 Canary

```yaml
GetOrderFn:
  Type: AWS::Serverless::Function
  Properties:
    AutoPublishAlias: live
    DeploymentPreference:
      Type: Canary10Percent5Minutes
      Hooks:
        PreTraffic: !Ref PreTrafficCheck
      Alarms:
        - !Ref ErrorRateAlarm
```

(Week 4 Day 3 참조)

---

## 🧠 알아두면 좋은 심화 이론

### SAM Accelerate (sam sync)

빠른 개발 루프:
```bash
sam sync --watch
# 코드 변경 → S3 직접 업로드 → Lambda update-function-code (CFN 우회)
# 인프라 변경 → CloudFormation Change Set
```

개발용. 프로덕션은 `sam deploy` 사용.

### SAM Connector

서비스 간 연결을 단순화:
```yaml
Connector:
  Type: AWS::Serverless::Connector
  Properties:
    Source: {Id: GetOrderFn}
    Destination: {Id: OrdersTable}
    Permissions: [Read]
```

자동으로 IAM Policy 생성. 2022+ 기능.

### Lambda Extension (Layer) — Powertools, ADOT

- **Powertools for AWS Lambda**: 로깅/메트릭/추적 표준화
- **AWS Distro for OpenTelemetry (ADOT)**: 통합 텔레메트리
- **Parameters and Secrets Lambda Extension**: 시크릿 캐시

### SAM vs CDK

| 항목 | SAM | CDK |
|------|-----|-----|
| 언어 | YAML/JSON | TS/Python/Java/C#/Go |
| 추상화 | 서버리스 특화 | 모든 AWS |
| 학습 곡선 | 낮음 | 중간 |
| 로컬 테스트 | 강력 (sam local) | 약함 |
| 시험 출제 | 많음 | 중간 |

> 💡 시험에서 "Lambda 위주 + 단순 표현" → SAM. "복잡한 객체 지향, 멀티 리전" → CDK.

### Lambda Function URLs

API Gateway 없이 직접 HTTPS 엔드포인트:
```yaml
GetOrderFn:
  Type: AWS::Serverless::Function
  Properties:
    FunctionUrlConfig:
      AuthType: AWS_IAM
      Cors:
        AllowOrigins: ["*"]
```

비용 절감, API Gateway 기능(인증/스로틀/캐시)은 없음.

### 관련 서비스 Cross-Reference

- **CodeDeploy Lambda Canary** → Week 4 Day 3
- **Step Functions** → Week 7 Day 4
- **CDK** → Week 8 Day 4
- **API Gateway HTTP API** → Day 1 (이 day의 OrdersApi)

---

## 🏗️ 아키텍처 다이어그램

```
SAM Stack Flow
==================================================

  template.yaml (SAM)
   ┌─ Transform: AWS::Serverless-2016-10-31
   ├─ Globals (default values)
   └─ Resources
       ├─ AWS::Serverless::Function (GetOrderFn)
       │    Auto-creates: Lambda + IAM Role + EventSourceMappings
       ├─ AWS::Serverless::HttpApi
       │    Auto-creates: API Gateway + Stage + Authorizer + Permissions
       ├─ AWS::Serverless::SimpleTable
       │    Auto-creates: DynamoDB
       └─ AWS::Serverless::LayerVersion
            Auto-creates: Lambda Layer

  sam build
       │
       │ Builds each function in isolated container
       ▼
  .aws-sam/build/...

  sam deploy
       │
       │ Packages to S3 + Transforms SAM → CFN
       ▼
  CloudFormation Change Set → Stack

  Production endpoint:
   https://abc123.execute-api.ap-northeast-2.amazonaws.com/prod/orders/{id}

  sam sync (dev only)
   Code change ──► Lambda UpdateFunctionCode (bypass CFN)
   Infra change ──► CFN Change Set
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ SAM은 CFN의 Macro(Transform)로 서버리스 리소스 단순화
2. ⭐ `AWS::Serverless::*` 리소스는 CFN으로 자동 확장
3. ⭐ Policy Templates로 IAM Policy 단순화 (DynamoDBReadPolicy 등)
4. ⭐ `sam local`로 Docker 기반 로컬 Lambda 테스트
5. ⭐ `sam sync --watch`는 개발 가속, 프로덕션은 `sam deploy`

---

## 💻 실제 예시 - 풀 멀티 환경 SAM

```bash
# 1) 프로젝트 초기화
sam init --runtime python3.11 --name myapp --architecture arm64

# 2) 의존성 + 빌드
cd myapp
sam build --use-container

# 3) 로컬 테스트
sam local generate-event apigateway aws-proxy > events/api.json
sam local invoke GetOrderFn -e events/api.json

# 4) 첫 배포
sam deploy --guided
# Stack name: myapp-staging
# Region: ap-northeast-2
# Parameter values: ...
# Save settings: yes

# 5) 환경별 별도 설정
sam deploy --config-env staging
sam deploy --config-env prod

# 6) CI/CD 자동 생성
sam pipeline init --bootstrap
# 환경별 CodePipeline 자동 구성
```

```yaml
# samconfig.toml 예
version = 0.1

[staging.deploy.parameters]
stack_name = "myapp-staging"
s3_prefix = "myapp-staging"
region = "ap-northeast-2"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Environment=staging UserPoolId=..."

[prod.deploy.parameters]
stack_name = "myapp-prod"
s3_prefix = "myapp-prod"
region = "ap-northeast-2"
parameter_overrides = "Environment=prod UserPoolId=..."
confirm_changeset = true
```

---

## 📝 연습 문제

**문제 1.** SAM Template의 `Transform: AWS::Serverless-2016-10-31`의 역할은?

A) CloudFormation Macro로 SAM 리소스를 CFN 네이티브로 확장
B) Lambda 코드 변환
C) 배포 자동화
D) 로깅 활성화

**정답: A**
해설: Transform이 SAM의 핵심.

---

**문제 2.** `AWS::Serverless::Function`이 자동 생성하는 리소스가 아닌 것은?

A) AWS::Lambda::Function
B) AWS::IAM::Role
C) AWS::Lambda::EventSourceMapping (Events 정의 시)
D) AWS::EC2::Instance

**정답: D**
해설: 서버리스이므로 EC2는 무관.

---

**문제 3.** 개발 중 코드 변경을 빠르게 Lambda에 반영하려면?

A) sam deploy 매번
B) sam sync --watch (코드 변경은 CFN 우회)
C) sam build만
D) Console에서 직접 편집

**정답: B**
해설: sam sync가 개발 가속의 표준.

---

**문제 4.** SAM Policy Templates의 이점은?

A) 비용 절감
B) 흔한 IAM 패턴을 사전 정의해 보일러플레이트 제거 + 권한 실수 방지
C) 자동 스케일링
D) 로컬 테스트

**정답: B**
해설: DynamoDBReadPolicy 같은 사전 정의 정책.

---

**문제 5.** sam local invoke의 한계는?

A) Docker 컨테이너로 에뮬레이션 — 실제 Lambda와 100% 동일하지 않음 (CPU 아키텍처, 일부 메타데이터)
B) 무료 분량 제한
C) Region 제한
D) Runtime 제한

**정답: A**
해설: 에뮬레이션의 본질적 한계.

---

**문제 6.** SAM과 CDK 중 무엇을 선택할까?

A) SAM은 항상 더 좋다
B) Lambda 위주 + 단순 표현 = SAM / 복잡 객체 지향 + 멀티 리전 = CDK
C) CDK가 항상 더 좋다
D) 둘 다 동일

**정답: B**
해설: 워크로드 성격에 따라 다름.

---

**문제 7.** `AWS::Serverless::HttpApi`와 `AWS::Serverless::Api`의 차이는?

A) HttpApi는 API Gateway v2 (HTTP API), Api는 v1 (REST API). HttpApi가 더 저렴·빠름
B) HttpApi는 HTTPS 전용
C) Api는 deprecated
D) 둘 다 동일

**정답: A**
해설: v1(REST)과 v2(HTTP) 구분. HTTP API는 단순+저렴.

---

## 📌 오늘의 요약

1. SAM = CloudFormation의 Macro 기반 서버리스 친화 확장
2. `AWS::Serverless::*` 리소스가 CFN 네이티브로 자동 확장
3. Policy Templates로 IAM 단순화
4. sam local로 Docker 기반 로컬 테스트, sam sync로 개발 가속
5. SAM(서버리스 특화) vs CDK(범용)의 선택 기준 — 워크로드 성격
