# Day 2 - Serverless Framework / CDK Lambda 패턴

📅 날짜: Week 7 (Day 2)
🎯 주제: SAM 대안 — Serverless Framework와 CDK의 Lambda 추상화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Serverless Framework 구조와 SAM과의 차이
- CDK Lambda construct(NodejsFunction, PythonFunction, DockerImageFunction)
- IaC 도구 선택 기준 (SAM vs SLS vs CDK vs Terraform)
- Lambda 컨테이너 이미지 배포

---

## 🧩 사전 지식 (CS 기초)

- **Plugin Architecture**: Serverless Framework는 플러그인으로 기능 확장.
- **L1/L2/L3 Construct (CDK)**: 원시 CFN, 정제된 추상화, 고수준 패턴.
- **Tree shaking / bundling**: 미사용 코드 제거. CDK의 NodejsFunction이 esbuild 사용.
- **Container image Lambda**: 10GB까지 (zip은 250MB). ECR에 저장.

---

## 📖 이론 내용

### 1. Serverless Framework

```yaml
# serverless.yml
service: my-store
frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs20.x
  region: ap-northeast-2
  architecture: arm64
  environment:
    LOG_LEVEL: INFO
  iam:
    role:
      statements:
        - Effect: Allow
          Action: dynamodb:GetItem
          Resource: !GetAtt OrdersTable.Arn

functions:
  getOrder:
    handler: src/getOrder.handler
    events:
      - httpApi:
          path: /orders/{id}
          method: get
    environment:
      TABLE_NAME: !Ref OrdersTable

resources:
  Resources:
    OrdersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: orders-${sls:stage}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - {AttributeName: id, AttributeType: S}
        KeySchema:
          - {AttributeName: id, KeyType: HASH}

plugins:
  - serverless-esbuild
  - serverless-iam-roles-per-function
```

**배포:**
```bash
sls deploy --stage prod --region ap-northeast-2
sls invoke -f getOrder -d '{"id":"123"}'
sls logs -f getOrder --tail
sls remove --stage prod  # 전체 삭제
```

**SAM vs SLS 차이:**
- SLS는 멀티 클라우드 (Azure/GCP도 지원하지만 AWS가 주력)
- SLS는 풍부한 플러그인 생태계 (esbuild, iam-roles-per-function, prune 등)
- SAM은 AWS 네이티브, 시험 비중 큼
- SLS v4부터 상업 라이선스 (기업 사용 시 비용)

### 2. CDK Lambda

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integ from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class OrdersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'OrdersTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    const getOrder = new nodejs.NodejsFunction(this, 'GetOrder', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry: 'src/getOrder.ts',
      handler: 'handler',
      bundling: {
        minify: true, sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
      environment: { TABLE_NAME: table.tableName },
      tracing: lambda.Tracing.ACTIVE,
      currentVersionOptions: { removalPolicy: cdk.RemovalPolicy.RETAIN },
    });
    table.grantReadData(getOrder);   // ← 자동 IAM Policy 생성

    const api = new apigwv2.HttpApi(this, 'OrdersApi');
    api.addRoutes({
      path: '/orders/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integ.HttpLambdaIntegration('GetOrderInt', getOrder),
    });
  }
}
```

**핵심 강점:**
- `table.grantReadData(getOrder)` 같은 의도 기반 권한 부여 — IAM Policy 자동 생성
- esbuild 자동 번들링
- 타입 안전성 (TypeScript)
- 풍부한 L2/L3 Construct (e.g., `aws-cdk-lib/aws-lambda-event-sources`)

### 3. Lambda Container Image

zip 한도 250MB 초과 시 컨테이너 이미지:
```dockerfile
FROM public.ecr.aws/lambda/python:3.11
COPY requirements.txt .
RUN pip install -r requirements.txt -t ${LAMBDA_TASK_ROOT}
COPY app.py ${LAMBDA_TASK_ROOT}
CMD ["app.handler"]
```

```bash
docker build -t myfn .
docker tag myfn:latest 111.dkr.ecr...:latest
docker push 111.dkr.ecr...:latest

aws lambda create-function \
  --function-name myfn \
  --package-type Image \
  --code ImageUri=111.dkr.ecr...:latest \
  --role arn:...
```

장점: 10GB까지, 자체 OS 도구, ML 모델 포함
단점: cold start ↑, 일부 Lambda 기능 제약(Layers 불가)

### 4. IaC 도구 비교

| 항목 | SAM | SLS | CDK | Terraform |
|------|-----|-----|-----|-----------|
| AWS 네이티브 | ✅ | 부분 | ✅ | 멀티 클라우드 |
| 언어 | YAML | YAML+JS | TS/Py/Java/C#/Go | HCL |
| 시험 출제 | 높음 | 낮음 | 중간 | 낮음 (Pro 시험 직접 거의 X) |
| 학습 곡선 | 낮음 | 낮음 | 중간 | 중간 |
| 추상화 깊이 | 서버리스 특화 | 서버리스 특화 + 플러그인 | 모든 AWS | 모든 클라우드 |
| State 관리 | CFN | CFN (기본) | CFN | tfstate (S3+DynamoDB 권장) |
| 라이선스 | OSS | v4부터 상업 | OSS (Apache 2.0) | BSL (Terraform 1.6+) |

### 5. Cold Start 완화

| 기법 | 효과 |
|------|------|
| Provisioned Concurrency | 즉시 0 cold start, 비용 ↑ |
| SnapStart (Java) | Java 함수 cold start 단축 (zip 형식만) |
| Architecture: ARM | x86보다 약간 빠른 init |
| Runtime: Node/Python | Java/Go보다 짧은 cold start |
| Package size 최소화 | 다운로드 시간 단축 |
| Lambda Container Image | zip보다 cold start ↑ — 단점 |

---

## 🧠 알아두면 좋은 심화 이론

### CDK Aspects

전체 Stack에 횡단적 검증/태깅 적용:
```typescript
class TagAspect implements IAspect {
  visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.tags.setTag('CostCenter', 'engineering');
    }
  }
}
cdk.Aspects.of(this).add(new TagAspect());
```

### CDK Pipelines + Lambda

```typescript
const pipeline = new CodePipeline(this, 'Pipeline', {
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.connection('my-org/my-app', 'main', { connectionArn: '...' }),
    commands: ['npm ci', 'npm test', 'npx cdk synth'],
  }),
});
pipeline.addStage(new ServiceStage(this, 'Prod', { env: {...} }), {
  pre: [new ManualApprovalStep('Approve')],
});
```

자동 self-mutation. CDK 변경이 다음 실행에 반영.

### Powertools for AWS Lambda

```python
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger()
tracer = Tracer()
metrics = Metrics()

@tracer.capture_lambda_handler
@logger.inject_lambda_context
@metrics.log_metrics
def handler(event, context):
    metrics.add_metric(name="OrderProcessed", unit=MetricUnit.Count, value=1)
    logger.info("Processing order", extra={"order_id": event.get('id')})
    ...
```

EMF(Embedded Metric Format) 자동 출력 → CloudWatch 자동 집계.

### SAM과 CDK 혼합 (CDK Hotswap)

CDK에서 Lambda 코드 변경만 빠르게:
```bash
cdk deploy --hotswap
# 인프라 변경은 거부 — Lambda code만 직접 update
```

개발 가속 패턴. 프로덕션은 일반 `cdk deploy` 사용.

### 관련 서비스 Cross-Reference

- **CodeDeploy Lambda** → Week 4 Day 3
- **Lambda Code Signing** → Week 2 Day 4
- **Step Functions** → Week 7 Day 4
- **CDK Pipelines** → Week 8 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
IaC Tool Decision
==================================================

  Workload Type
   │
   ├─ Serverless 위주 (Lambda+API Gateway+Dynamo)
   │    ├─ AWS 네이티브 선호 → SAM
   │    └─ 플러그인 생태계 + 다중 stage → Serverless Framework
   │
   ├─ 다양한 AWS (Lambda + EKS + RDS + ...)
   │    └─ CDK (TypeScript/Python)
   │
   ├─ 멀티 클라우드 / 기존 Terraform 자산
   │    └─ Terraform (+ Terragrunt)
   │
   └─ 단순 한 번 배포
        └─ CloudFormation 직접 (또는 SAM/CDK 어느 것이든)

CDK Lambda Construct Hierarchy
  L1: CfnFunction (raw CFN)
  L2: lambda.Function (default values)
  L2: lambda.DockerImageFunction
  L2: lambda_nodejs.NodejsFunction (auto-bundle with esbuild)
  L2: lambda_python.PythonFunction (auto-bundle with pip)
  L3: lambda_event_sources.SqsEventSource(queue)
        attached to Function
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ SAM ≈ CFN Macro, SLS ≈ 멀티 클라우드+플러그인, CDK ≈ TypeScript 추상화
2. ⭐ CDK `grant*` 메서드가 IAM Policy 자동 생성 — 의도 기반
3. ⭐ Lambda Container Image 10GB vs zip 250MB
4. ⭐ Provisioned Concurrency / SnapStart로 Cold Start 완화
5. ⭐ CDK Pipelines로 self-mutating IaC + Pipeline 자동 갱신

---

## 💻 실제 예시 - CDK NodejsFunction

```typescript
// bin/app.ts
import * as cdk from 'aws-cdk-lib';
import { OrdersStack } from '../lib/orders-stack';
const app = new cdk.App();
new OrdersStack(app, 'OrdersStaging', { env: { account: '111', region: 'ap-northeast-2' }});
new OrdersStack(app, 'OrdersProd', { env: { account: '222', region: 'ap-northeast-2' }});

// lib/orders-stack.ts (위 예시 참조)

// 배포
// cdk bootstrap aws://111/ap-northeast-2  (계정+리전 첫 배포 시)
// cdk synth        # CFN 템플릿 생성
// cdk diff         # 변경 사항 미리보기
// cdk deploy OrdersProd
// cdk destroy
```

---

## 📝 연습 문제

**문제 1.** CDK의 `table.grantReadData(fn)`이 자동으로 하는 일은?

A) DynamoDB 테이블 데이터 복사
B) Function의 IAM Role에 적절한 DynamoDB Read 권한 추가
C) Lambda Layer 추가
D) Pipeline 생성

**정답: B**
해설: 의도 기반 권한 부여가 CDK의 핵심 강점.

---

**문제 2.** Lambda Container Image의 크기 한도는?

A) 250MB
B) 1GB
C) 10GB
D) 100GB

**정답: C**
해설: zip은 250MB, Container Image는 10GB (압축).

---

**문제 3.** Serverless Framework가 SAM 대비 가지는 강점은?

A) 더 빠른 cold start
B) 풍부한 플러그인 생태계 + 멀티 클라우드 지원
C) AWS 네이티브 통합
D) 낮은 비용

**정답: B**
해설: 플러그인 + 멀티 클라우드. 단 v4부터 상업 라이선스.

---

**문제 4.** CDK Pipelines의 self-mutating 특성은?

A) Lambda 코드 자체 변경
B) Pipeline이 자기 자신을 첫 Stage로 갖고 CDK 코드 변경이 다음 실행에 반영
C) DynamoDB 자동 업데이트
D) ECR 푸시

**정답: B**
해설: CDK Pipelines가 self-mutating 코드.

---

**문제 5.** Lambda Cold Start를 완화하기 가장 효과적인 방법은?

A) Provisioned Concurrency (즉시 0 cold start, 비용 ↑)
B) Reserved Concurrency
C) Layer 사용
D) IAM Role 변경

**정답: A**
해설: PC가 가장 직접적.

---

**문제 6.** CDK `cdk deploy --hotswap`의 용도는?

A) 인프라 변경 가속
B) Lambda 코드 등 일부 변경을 CFN 우회로 직접 적용 — 개발 가속
C) 프로덕션 배포
D) IAM Role 회전

**정답: B**
해설: 개발 가속 패턴, 프로덕션 비권장.

---

**문제 7.** SAM과 CDK의 가장 큰 차이는?

A) SAM은 YAML 위주 서버리스 특화, CDK는 프로그래밍 언어로 모든 AWS 리소스 추상화
B) SAM은 비용이 더 비싸다
C) CDK는 Lambda만 지원
D) 둘 다 동일

**정답: A**
해설: 추상화 범위가 본질적 차이.

---

## 📌 오늘의 요약

1. Serverless Framework는 플러그인 + 멀티 클라우드, v4부터 상업 라이선스
2. CDK는 TypeScript/Python으로 모든 AWS 리소스 추상화 + grant 메서드 자동 IAM
3. Lambda Container Image 10GB (cold start ↑)
4. Provisioned Concurrency / SnapStart로 Cold Start 완화
5. CDK Pipelines의 self-mutating IaC 패턴
