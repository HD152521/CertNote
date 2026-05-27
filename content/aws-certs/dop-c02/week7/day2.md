# Day 2 - Serverless Framework와 CDK: SAM이 아닌 길을 고른 사람들

어제 SAM이 CloudFormation Macro 위에 얹은 서버리스 DSL이라는 걸 봤다. 그런데 현장에 가보면 SAM을 쓰지 않는 팀이 의외로 많다. 누구는 Serverless Framework로 Lambda 200개를 굴리고 있고, 누구는 CDK + TypeScript로 Lambda·EKS·RDS·SQS를 한 파일에서 선언하고 있다. 셋 다 결국 CloudFormation 템플릿을 만들어 AWS에 던지지만, 추상화 모델과 사용자 경험은 완전히 다르다. 오늘은 SAM의 두 대안인 **Serverless Framework**(2015, Node 기반 플러그인 시스템)와 **CDK**(2019, AWS가 직접 만든 코드 기반 IaC)를 비교한다.

DOP 시험은 SAM과 CDK를 한 문제 안에서 비교하는 경향이 늘고 있다. "팀이 TypeScript에 익숙하고 Lambda 외에 EKS·RDS·OpenSearch도 한 스택에서 관리하려면?" 같은 시나리오에 정답은 거의 항상 CDK다. 반면 "AWS 네이티브 도구만 쓰는 정책이고 학습 곡선이 낮아야 한다"면 SAM. 이 선택의 기준을 정확히 이해하는 게 오늘의 목표다.

## Serverless Framework가 살아남은 이유

Serverless Framework(이하 SLS)는 2015년 Austen Collins가 만든 "JAWS Framework"가 모태다. AWS가 Lambda를 정식 출시한 게 2014년 11월이고, 그 1년 뒤에 이미 커뮤니티가 IaC 도구를 만들기 시작한 것이다. SAM이 2016년 11월 re:Invent에서 발표됐으니 SLS가 1년 먼저였고, 그 시간 동안 Node.js 생태계에 깊이 뿌리내렸다.

SLS의 본질은 **플러그인 아키텍처**다. `serverless.yml`은 얇은 스펙이고, 실제 동작은 수백 개의 npm 플러그인이 담당한다. 함수 패키징, IAM 권한 분리, 로컬 invoke, offline 모드, ECR 이미지 빌드, 비용 추정 — 모두 플러그인이다.

```yaml
service: my-store
frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs20.x
  region: ap-northeast-2
  architecture: arm64
  environment:
    LOG_LEVEL: INFO
    POWERTOOLS_SERVICE_NAME: orders
  iam:
    role:
      statements:
        - Effect: Allow
          Action: dynamodb:GetItem
          Resource: !GetAtt OrdersTable.Arn

functions:
  getOrder:
    handler: src/getOrder.handler
    timeout: 10
    memorySize: 512
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
  - serverless-prune-plugin
  - serverless-offline
```

배포는 `sls deploy --stage prod`로 끝나고, 내부적으로는 SLS가 CloudFormation 템플릿을 생성해 S3에 올린 뒤 `aws cloudformation deploy`를 호출한다. 즉 **SLS도 결국 CloudFormation 위에서 돈다**. 다만 SAM의 매크로 방식과 달리 SLS는 **클라이언트 사이드에서 CFN을 합성**하므로 CFN 콘솔에서는 SAM 같은 "Processed template" 단계가 보이지 않는다.

> 💡 **관련 이론**: SLS의 플러그인 모델은 Babel·Webpack·ESLint 같은 Node 생태계의 표준 패턴이다. 이론적 기반은 1990년대 Erich Gamma의 **Eclipse Plugin Architecture**(Equinox/OSGi)와 같은 "core + extension point" 설계. 코어는 작게 유지하고 기능은 외부 모듈이 등록한다. 장점은 커뮤니티 확장의 폭발적 다양성, 단점은 플러그인 간 호환성 문제와 보안 surface 확장. 실제 2021년 `node-ipc` 사건처럼 npm 의존성 한 줄이 전체 파이프라인을 위협할 수 있다.

> 🔍 **더 깊이**: SLS는 `serverless package` 명령으로 `.serverless/` 폴더에 CFN 템플릿(`cloudformation-template-update-stack.json`)을 추출할 수 있다. 이 파일을 열어보면 한 함수가 결국 어떤 CFN 리소스로 풀려졌는지 보이는데, `AWS::Lambda::Function` + `AWS::IAM::Role` + `AWS::Logs::LogGroup` + `AWS::ApiGatewayV2::Integration` + `AWS::ApiGatewayV2::Route`까지 8개 이상의 리소스가 생성된다. SAM 매크로가 서버에서 풀어주는 것을 SLS는 클라이언트에서 한다는 차이만 있을 뿐 결과는 동일.

> 📚 **사례**: 2023년 2월 Serverless Inc.는 SLS v4부터 **연 매출 200만 달러 이상 기업에 상업 라이선스**를 적용하겠다고 발표했다. v3까지는 MIT, v4부터는 "Serverless Framework License" — Apache 2.0 기반이지만 기업 사용에 유료 등록이 필요. 이 발표 직후 GitHub 이슈에 1500개 이상의 비판 댓글이 달렸고, 일부 기업은 SAM/CDK로 마이그레이션을 시작했다. 이는 오픈소스 도구의 비즈니스 모델 전환이 사용자에게 미치는 충격의 좋은 사례다(Terraform이 2023년 8월 BSL로 전환한 것과 같은 패턴).

## CDK의 합성 모델: 코드가 곧 인프라

CDK(AWS Cloud Development Kit)는 2019년 7월 GA로 발표됐다. 핵심 아이디어는 **YAML/JSON 대신 일반 프로그래밍 언어로 인프라를 선언**하는 것. 내부적으로 CDK는 코드를 실행해 **Construct Tree**를 메모리에 만들고, 이를 CFN 템플릿으로 합성(synth)한다.

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integ from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class OrdersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'OrdersTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const getOrder = new nodejs.NodejsFunction(this, 'GetOrder', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry: 'src/getOrder.ts',
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        externalModules: ['@aws-sdk/*'],  // Lambda 런타임에 SDK 포함
      },
      environment: {
        TABLE_NAME: table.tableName,
        POWERTOOLS_SERVICE_NAME: 'orders',
      },
      tracing: lambda.Tracing.ACTIVE,
      currentVersionOptions: { removalPolicy: cdk.RemovalPolicy.RETAIN },
    });

    table.grantReadData(getOrder);   // 의도 기반 IAM 자동 생성

    const api = new apigwv2.HttpApi(this, 'OrdersApi', {
      corsPreflight: { allowOrigins: ['*'], allowMethods: [apigwv2.CorsHttpMethod.GET] },
    });
    api.addRoutes({
      path: '/orders/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integ.HttpLambdaIntegration('GetOrderInt', getOrder),
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
```

이 코드의 가장 흥미로운 줄은 `table.grantReadData(getOrder)`다. SAM Policy Template과 비교해보자.

| 측면 | SAM Policy Template | CDK grant 메서드 |
|------|---------------------|-------------------|
| 권한 범위 | 사전 정의된 일반 패턴 | 리소스의 정확한 ARN 기반 |
| GSI/LSI | 자동 포함 (광범위) | 자동 포함 (필요 시) |
| KMS 키 | 별도 명시 필요 | 테이블의 encryption key 자동 감지 |
| 신규 액션 추가 | AWS 업데이트 대기 | SDK 새 메서드 즉시 사용 |
| 코드 재사용 | YAML 복붙 | 함수로 추상화 가능 |

CDK는 단순히 "이 함수가 이 테이블을 읽는다"는 **의도**만 선언하면, 내부 로직이 (1) 테이블 ARN, (2) GSI/LSI ARN, (3) KMS Key ARN, (4) 적절한 dynamodb:* 액션 목록을 자동으로 IAM Policy로 합성한다. 이게 SAM과의 가장 큰 실용적 차이다.

> 🔍 **더 깊이**: CDK의 Construct Tree는 메모리 자료구조다. `cdk synth` 명령은 (1) 코드 실행 → (2) Construct 객체 그래프 생성 → (3) 그래프 순회하며 `Cfn*` 리소스 추출 → (4) JSON 직렬화 → (5) `cdk.out/` 폴더에 저장 5단계로 진행된다. 이 분리 덕분에 CDK는 **순수한 코드**다. 부작용이 없고, 같은 코드는 항상 같은 템플릿을 만든다. 이게 GitOps와 잘 어울리는 이유. Terraform의 `terraform plan`이 클라우드 상태를 조회한 뒤 diff를 계산하는 것과 본질적으로 다른 모델.

> 💡 **관련 이론**: CDK의 L1/L2/L3 계층은 1960년대 Edsger Dijkstra의 **레이어드 아키텍처(THE 시스템)** 원칙의 IaC 버전이다. L1은 CFN과 1:1(`CfnFunction`), L2는 합리적 기본값을 가진 추상화(`Function`), L3는 여러 L2를 묶은 패턴(`ApplicationLoadBalancedFargateService`). 각 계층은 아래 계층의 함수로 정의되며, 사용자는 필요한 추상화 수준만 선택한다. 이 패턴이 React의 컴포넌트 계층, Kubernetes의 Pod→Deployment→Service 추상화와 동형(isomorphic).

> 🎯 **시나리오**: "팀이 React/TypeScript를 주력으로 쓰는 백엔드 팀이고, Lambda·DynamoDB·OpenSearch·EKS·RDS·SQS를 한 스택에서 관리하며, IAM 권한 실수를 줄이고 싶다. 어떤 IaC를 선택?" — 답은 **CDK with TypeScript**. SAM은 서버리스 6종 외에는 일반 CFN으로 폴백해야 하고, SLS는 Lambda 중심이라 EKS 통합이 약하다. CDK는 모든 AWS 리소스를 L2 Construct로 추상화하고 `grant*`로 IAM이 자동.

## Construct Hierarchy: L1, L2, L3

CDK가 다른 IaC 도구와 본질적으로 다른 점이 **Construct 계층**이다.

| 계층 | 예시 | 추상화 정도 | 사용 시점 |
|------|------|-------------|-----------|
| **L1** | `CfnFunction`, `CfnBucket` | CFN과 1:1 매핑 | CFN의 모든 속성이 필요할 때 |
| **L2** | `Function`, `Bucket`, `Table` | 합리적 기본값 + grant 메서드 | 95%의 경우 |
| **L3** | `ApplicationLoadBalancedFargateService`, `EventbridgeToLambdaToDynamoDB` (Solutions Constructs) | 검증된 아키텍처 패턴 | 표준 아키텍처를 빠르게 |

```typescript
// L1 — 모든 CFN 속성 제어
new lambda.CfnFunction(this, 'Raw', {
  functionName: 'raw-fn',
  runtime: 'nodejs20.x',
  handler: 'index.handler',
  role: roleArn,
  code: { s3Bucket: 'b', s3Key: 'k' },
  // ... 모든 CFN 필드
});

// L2 — 의도 표현 + 기본값
new lambda.Function(this, 'L2Fn', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('src/'),
  // role 자동 생성, logGroup 자동 생성
});

// L2 + 자동 번들링
new nodejs.NodejsFunction(this, 'NodeFn', {
  entry: 'src/index.ts',  // TS → JS 자동 변환
  bundling: { minify: true, externalModules: ['@aws-sdk/*'] },
});

// L3 — Solutions Constructs (별도 패키지)
new EventbridgeToLambda(this, 'Pattern', {
  lambdaFunctionProps: { /* ... */ },
  eventRuleProps: { /* ... */ },
});
```

L2가 만들어주는 "자동 생성" 자원들이 시험에서 자주 함정으로 나온다. 예를 들어 `lambda.Function`은 IAM Role, LogGroup, AssumeRolePolicy를 자동 생성하고, `removalPolicy` 기본값이 `DESTROY`라 스택 삭제 시 모두 사라진다. 프로덕션에서는 `RETAIN`으로 명시.

## Lambda Container Image: 250MB의 벽을 넘어

zip 패키지 한도는 250MB(압축 해제 기준)이고, 큰 ML 모델·OS 도구·Tesseract 같은 무거운 의존성이 필요하면 이를 초과한다. 2020년 12월 AWS는 **Lambda Container Image** 지원을 발표했고, 한도가 **10GB**로 늘었다.

```dockerfile
# 공식 베이스 이미지 (RIE 포함)
FROM public.ecr.aws/lambda/python:3.12

# 의존성 설치
COPY requirements.txt .
RUN pip install -r requirements.txt -t ${LAMBDA_TASK_ROOT}

# ML 모델 같은 큰 자원
COPY models/ ${LAMBDA_TASK_ROOT}/models/

# 함수 코드
COPY app.py ${LAMBDA_TASK_ROOT}

# 핸들러 지정
CMD ["app.handler"]
```

빌드와 배포:

```bash
# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin 111.dkr.ecr.ap-northeast-2.amazonaws.com

# 빌드 (ARM 타겟이면 buildx)
docker buildx build --platform linux/arm64 -t myfn:v1 .
docker tag myfn:v1 111.dkr.ecr.ap-northeast-2.amazonaws.com/myfn:v1
docker push 111.dkr.ecr.ap-northeast-2.amazonaws.com/myfn:v1

# Lambda 생성 (CDK에서는 DockerImageFunction)
aws lambda create-function \
  --function-name myfn \
  --package-type Image \
  --code ImageUri=111.dkr.ecr.ap-northeast-2.amazonaws.com/myfn:v1 \
  --architectures arm64 \
  --role arn:aws:iam::111:role/lambda-exec
```

CDK 버전:

```typescript
new lambda.DockerImageFunction(this, 'MLFn', {
  code: lambda.DockerImageCode.fromImageAsset('./docker'),  // 자동 빌드+ECR 푸시
  architecture: lambda.Architecture.ARM_64,
  memorySize: 3008,
  timeout: cdk.Duration.minutes(5),
});
```

> 🔍 **더 깊이**: Lambda Container Image는 일반 OCI 이미지가 아니다. AWS가 정의한 **Lambda Container Image Spec**을 따라야 하며, 이미지에 Lambda Runtime Interface Client(RIC)가 포함되어야 한다. AWS 공식 베이스 이미지(`public.ecr.aws/lambda/*`)에는 RIC가 이미 들어있어 `CMD ["app.handler"]`만 하면 동작한다. 자체 베이스 이미지를 쓰려면 RIC를 직접 추가해야 한다. 한편 콜드 스타트 시 Lambda는 이미지 전체를 다운로드하지 않고, **레이어별 lazy load** + **block-level caching**으로 시작에 필요한 부분만 먼저 가져온다(2020 SOSP 논문 "On-demand Container Loading in AWS Lambda" 참고). 그래서 10GB 이미지라도 cold start가 zip 패키지의 2~3배 정도에 머무른다.

> ⚠️ **함정**: Container Image Lambda는 **Lambda Layer를 쓸 수 없다**. 모든 의존성이 이미지에 포함되어야 한다. 또 Provisioned Concurrency는 지원하지만 SnapStart는 zip Java만 지원(Container 미지원, 2024년 12월 기준). 시험에서 "ML 모델 5GB를 Lambda에 배포하려면?" 답은 Container Image이지만, "기존 Layer 4개를 그대로 쓰면서 패키지 크기를 줄이려면?" 답은 Layer 유지 + zip 패키지 최적화이지 Container가 아니다.

## IaC 도구 선택 매트릭스

| 항목 | SAM | Serverless Framework | CDK | Terraform |
|------|-----|----------------------|-----|-----------|
| 출시 | 2016 | 2015 | 2019 | 2014 |
| 추상화 모델 | CFN Macro | 클라이언트 합성 → CFN | 코드 → CFN 합성 | 자체 엔진 + Provider |
| 언어 | YAML/JSON | YAML + JS 플러그인 | TS/Py/Java/C#/Go | HCL |
| AWS 네이티브 | ✅ | 부분 | ✅ | ❌ (멀티 클라우드) |
| State 관리 | CFN 자동 | CFN 자동 | CFN 자동 | tfstate (S3+DynamoDB 권장) |
| Drift Detection | ✅ (CFN) | ✅ (CFN) | ✅ (CFN) | `terraform plan -refresh-only` |
| Rollback | ✅ (CFN 자동) | ✅ (CFN 자동) | ✅ (CFN 자동) | 수동 |
| 학습 곡선 | 낮음 | 낮음 | 중간 (언어 학습) | 중간 |
| 시험 비중 | 매우 높음 | 낮음 | 중간 (상승 중) | 거의 없음 |
| 라이선스 | Apache 2.0 | v4부터 상업 라이선스 | Apache 2.0 | BSL 1.1 (2023.8~) |

> 🎯 **시나리오**: 4가지 상황별 정답
> - **"Lambda + API Gateway + DynamoDB 50개, YAML만 쓰고 싶음"** → SAM
> - **"Lambda 200개, 멀티 stage, 풍부한 플러그인 필요"** → Serverless Framework (단 v4 라이선스 검토)
> - **"Lambda·EKS·RDS·OpenSearch·SQS 혼합, TS 팀"** → CDK
> - **"멀티 클라우드(AWS+GCP+Azure), 기존 Terraform 자산"** → Terraform

> 📚 **사례**: 2022년 Liberty Mutual은 자사 인프라를 CDK로 전환하면서 약 **9000개의 CDK Stack**을 운영하게 됐다. 자체 L3 Construct 라이브러리를 만들어 사내 팀이 보안·태깅·로깅 정책이 자동 적용된 표준 패턴을 5분 만에 배포 가능하게 했다. 이게 CDK의 본질적 가치 — 단순히 코드로 인프라를 쓰는 게 아니라, **재사용 가능한 인프라 추상화 라이브러리**를 만들 수 있다는 점. SAM Policy Template과 비교하면 추상화 도구의 폭이 본질적으로 다르다.

## CDK Aspects: 횡단 관심사의 우아한 처리

큰 CDK 코드베이스에서 모든 Stack에 "필수 태그 강제", "암호화 미설정 차단", "RemovalPolicy RETAIN 강제" 같은 정책을 적용하려면 어떻게 해야 할까. CDK는 **Aspects**라는 visitor 패턴 메커니즘을 제공한다.

```typescript
import { IAspect, Tags } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

// 모든 S3 Bucket에 암호화 강제
class EncryptionAspect implements IAspect {
  visit(node: IConstruct): void {
    if (node instanceof s3.CfnBucket) {
      if (!node.bucketEncryption) {
        throw new Error(`S3 Bucket ${node.node.path} must have encryption configured`);
      }
    }
  }
}

// 모든 리소스에 CostCenter 태그 추가
class CostCenterTagAspect implements IAspect {
  visit(node: IConstruct): void {
    if (cdk.TagManager.isTaggable(node)) {
      Tags.of(node).add('CostCenter', 'engineering');
      Tags.of(node).add('Owner', 'platform-team');
    }
  }
}

// 전체 앱에 적용
cdk.Aspects.of(app).add(new EncryptionAspect());
cdk.Aspects.of(app).add(new CostCenterTagAspect());
```

> 💡 **관련 이론**: Aspects는 1997년 Gregor Kiczales가 제안한 **Aspect-Oriented Programming(AOP)**의 IaC 버전이다. 횡단 관심사(cross-cutting concern) — 로깅, 보안, 태깅 — 를 코어 로직에서 분리해 별도 모듈로 표현. Java의 AspectJ, Spring AOP가 같은 원리. CDK의 visitor 패턴은 Construct Tree를 순회하며 각 노드에 적용할 정책을 결정한다. 이게 SAM의 한계 — SAM은 매크로 한 번만 돌아 정적 YAML을 만들고, 이후 횡단 정책 적용은 외부 도구(cfn-nag, cfn-lint, AWS Config Rules)에 의존해야 한다.

## CDK Pipelines: Self-mutating CI/CD

CDK Pipelines는 2020년 출시된 L3 Construct로, **파이프라인 자체를 CDK로 선언**하고 **자기 자신을 첫 번째 Stage로 갖는** 독특한 구조다.

```typescript
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';

const pipeline = new CodePipeline(this, 'Pipeline', {
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.connection('my-org/my-app', 'main', {
      connectionArn: 'arn:aws:codestar-connections:...',
    }),
    commands: [
      'npm ci',
      'npm run build',
      'npm test',
      'npx cdk synth',
    ],
  }),
  selfMutation: true,
});

// 환경별 Stage 추가
pipeline.addStage(new AppStage(this, 'Staging', {
  env: { account: '111', region: 'ap-northeast-2' },
}));

pipeline.addStage(new AppStage(this, 'Prod', {
  env: { account: '222', region: 'ap-northeast-2' },
}), {
  pre: [
    new ManualApprovalStep('PromoteToProd'),
    new ShellStep('IntegrationTest', { commands: ['npm run test:integration'] }),
  ],
});
```

`selfMutation: true`가 켜져 있으면 파이프라인이 다음 순서로 동작한다.

1. Source → 코드 가져옴
2. Build → `cdk synth` 실행해 CFN 템플릿 생성
3. **UpdatePipeline (self-mutate)** → 파이프라인 자체 정의를 CFN으로 업데이트
4. Asset → Lambda zip, Docker 이미지 등 빌드 후 S3/ECR에 업로드
5. Deploy → 각 Stage에 CFN deploy

3번이 핵심이다. 파이프라인 자체가 CDK 코드의 일부이므로 stage 추가, 새 환경 추가, 빌드 명령어 변경이 **다음 실행에서 즉시 반영**된다. 이게 GitOps의 IaC 버전.

> 🔍 **더 깊이**: Self-mutating의 위험성 — 파이프라인 정의에 버그가 있으면 self-mutation이 깨진 파이프라인을 deploy하고, 다음 실행은 깨진 파이프라인으로 시작해 다시는 정상으로 못 돌아갈 수 있다. 방어책은 (1) `cdk diff`로 항상 변경 사항 검토, (2) `feature branch`에서 미리 테스트, (3) **break glass** 절차로 콘솔에서 수동 복구 가능하게 IAM 권한 유지. 2021년 Stripe가 비슷한 GitOps 도구로 Production CI를 망가뜨린 사고가 잘 알려져 있다(GitOps anti-pattern).

## Cold Start: Lambda의 영원한 숙제

Lambda는 invocation이 없으면 컨테이너가 회수되고, 다음 invocation에 새 컨테이너를 띄워야 한다. 이 시작 시간이 cold start이고, 함수 특성에 따라 50ms~10초까지 변동한다.

| 단계 | 의미 | 영향 요소 | 일반 범위 |
|------|------|-----------|-----------|
| 1. Worker 할당 | EC2에 Firecracker microVM 생성 | AWS 내부 | 50~200ms |
| 2. 런타임 init | 코드 다운로드 + 런타임 시작 | 패키지 크기, 런타임 | 100ms~5s |
| 3. Init code | `handler` 밖의 코드 실행 | 의존성 import, 연결 풀 | 0~수 초 |
| 4. Handler 실행 | 실제 비즈니스 로직 | 코드 | 함수에 따라 |

| 완화 기법 | 효과 | 비용 | 적용 |
|-----------|------|------|------|
| **Provisioned Concurrency** | Cold start 거의 0 (사전 워밍) | 활성 시간 과금 | 트래픽 예측 가능 시 |
| **SnapStart (Java)** | Java init 시간 90%+ 단축 | 무료 | zip Java 11/17/21 |
| **ARM 아키텍처** | x86보다 10~20% 빠른 init | 20% 저렴 | 호환되는 런타임 |
| **패키지 최소화** | 다운로드 시간 단축 | - | 모든 함수 |
| **Top-level import 최소화** | Init code 단축 | - | Python/Node 특히 |
| **VPC 미사용** | ENI 생성 8~10s 제거 | - | NAT/RDS Proxy 불필요한 함수 |

> 📚 **사례**: 2022년 AWS re:Invent에서 SnapStart가 발표됐는데, 내부 메커니즘이 매우 흥미롭다. Java 함수 init 단계의 **JVM 메모리 스냅샷**을 찍어 S3에 저장하고, 다음 invocation은 스냅샷을 복원해 init을 건너뛴다. 이는 1990년대 Self/Smalltalk의 image-based persistence 개념과 동일. 단 메모리 안의 random seed, DB connection 같은 "uniqueness assumption"이 깨질 수 있어 `Runtime Hook`(`Core.getGlobalRuntime().register(...)`)으로 명시적 재초기화가 필요. 시험에선 "Java cold start 10초를 1초 미만으로 줄이려면?" 답은 SnapStart.

> ⚠️ **함정**: Provisioned Concurrency는 **함수 Version에만** 적용 가능, `$LATEST`에는 불가. 그래서 `AutoPublishAlias` + `DeploymentPreference`와 함께 써야 한다. 또 PC를 켠 상태에서 트래픽이 PC 용량을 초과하면 초과분은 일반 cold start로 처리되므로, Application Auto Scaling으로 PC를 동적 조정하는 패턴이 흔히 쓰인다(Scheduled scaling으로 영업시간 동안 PC 증가).

## Powertools for AWS Lambda: 옵저버빌리티 표준

함수 코드에 로깅·트레이싱·메트릭을 일관되게 구현하는 표준 라이브러리. Python/TypeScript/Java/.NET 지원.

```python
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver

logger = Logger(service="orders")
tracer = Tracer(service="orders")
metrics = Metrics(namespace="OrderService")

app = APIGatewayHttpResolver()

@app.get("/orders/<order_id>")
@tracer.capture_method
def get_order(order_id: str):
    logger.info("Fetching order", extra={"order_id": order_id})
    metrics.add_metric(name="OrderFetched", unit=MetricUnit.Count, value=1)
    # ... DynamoDB 조회 로직
    return {"order_id": order_id, "status": "shipped"}

@logger.inject_lambda_context(correlation_id_path='requestContext.requestId')
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event, context):
    return app.resolve(event, context)
```

핵심 가치는 **EMF(Embedded Metric Format)**을 자동 출력한다는 것. CloudWatch Logs에 JSON으로 메트릭이 임베드되면 CloudWatch가 자동으로 별도 Metric으로 집계한다. PutMetricData API 호출 비용 없이 메트릭 생성.

> 💡 **관련 이론**: EMF는 **structured logging**과 **metrics as log**의 결합이다. Logs를 single source of truth로 보고 메트릭을 거기서 파생하는 접근법은 Honeycomb, Datadog의 "Events" 개념과 같은 철학. 전통적으로 metrics와 logs는 별도 파이프라인이었는데, EMF는 한 로그 라인이 두 역할을 동시에 한다. 비용·운영 부담이 감소.

## 정리하며

오늘 본 그림은 세 가지다. 첫째, **Serverless Framework**는 Node 플러그인 생태계가 강점이지만 v4부터 상업 라이선스라 신규 도입은 신중. 둘째, **CDK**는 코드로 모든 AWS 리소스를 추상화하며 `grant*` 메서드의 의도 기반 IAM과 L1/L2/L3 Construct 계층이 본질적 차별점. 셋째, **Lambda Container Image**는 10GB 한도로 ML/큰 의존성에 적합하지만 Layer/SnapStart 호환성 제약 있음.

다음 글에서는 Step Functions와 EventBridge로 서버리스 워크플로를 오케스트레이션하는 패턴을 본다. Lambda 한 개로 모든 걸 해결하던 시절은 끝났고, 이제는 **함수 간의 협업 구조**가 더 중요한 시대다.

---

## 📝 연습 문제

**문제 1.** CDK `table.grantReadData(getOrder)`가 자동으로 합성하는 IAM Policy 범위로 가장 정확한 것은?

A) 테이블에 대한 모든 dynamodb:* 액션
B) 해당 테이블 ARN과 그 GSI/LSI ARN, 테이블 KMS 키 ARN, 적절한 Read 액션 (GetItem, Query, Scan 등)
C) 모든 DynamoDB 테이블 전역 Read 권한
D) Lambda 함수만 자동 권한 부여, 다른 자원에는 적용 안 됨

**정답: B**
해설: CDK grant 메서드의 핵심은 **의도 표현 + 정확한 자원 매핑**이다. 단순히 액션만 주는 게 아니라 테이블의 모든 인덱스 ARN, encryption KMS 키 ARN까지 자동 추적해 정확한 Resource 블록을 만든다. A는 너무 광범위(grantReadData가 아니라 grantFullAccess에 가까움), C는 와일드카드라 부정확, D는 CDK는 모든 자원에 grant 패턴 지원. SAM Policy Template과 비교하면 권한이 더 좁고 정확하다.

---

**문제 2.** Lambda Container Image와 zip 패키지의 차이로 정확하지 않은 것은?

A) Container는 최대 10GB, zip은 250MB
B) Container는 Lambda Layer 사용 불가
C) Container는 SnapStart 미지원 (Java도 zip만 가능)
D) Container는 Provisioned Concurrency 미지원

**정답: D**
해설: D가 틀린 설명. Container Image Lambda는 PC를 지원한다(다만 PC 워밍 시간이 zip보다 길다). A/B/C는 모두 사실. zip 한도 250MB는 압축 해제 기준, Container 10GB는 압축 기준이라 실 사용 용량은 30~40배 차이. SnapStart는 2022 출시 시점부터 zip Java만 지원하고 2024년 말까지 Container 미지원 유지. Layer는 Container와 호환되지 않아 모든 의존성을 Dockerfile에 포함해야 한다.

---

**문제 3.** "팀이 TypeScript에 익숙하고 Lambda·EKS·RDS·OpenSearch·SQS를 한 스택에서 관리하면서, IAM 권한 실수를 줄이고 9000개 Stack을 운영할 표준 라이브러리를 사내에 만들고 싶다." 가장 적합한 IaC는?

A) SAM
B) Serverless Framework
C) CDK with TypeScript
D) CloudFormation YAML 직접 작성

**정답: C**
해설: CDK는 (1) 모든 AWS 리소스 L2 Construct 제공(SAM은 서버리스 6종만), (2) `grant*` 자동 IAM, (3) **사내 L3 Construct 라이브러리**로 재사용 가능한 추상화 제공, (4) TypeScript 타입 안전성. Liberty Mutual의 9000 Stack 사례가 정확히 이 시나리오. SAM은 EKS/RDS 통합 약함, SLS는 Lambda 중심이고 v4 라이선스 이슈, CFN YAML은 추상화 도구 없어 2000줄 템플릿 양산.

---

**문제 4.** CDK Pipelines의 `selfMutation: true`가 의미하는 것은?

A) Lambda 함수가 자신의 코드를 자동 수정
B) Pipeline이 자기 자신을 첫 Stage로 갖고, CDK 코드 변경(stage 추가, 환경 변경 등)이 다음 실행에 자동 반영됨
C) DynamoDB Auto Scaling
D) IAM Role 자동 회전

**정답: B**
해설: CDK Pipelines는 GitOps 사상으로 파이프라인 자체를 CDK 코드로 선언한다. selfMutation이 켜지면 Source→Synth 후 **UpdatePipeline** 단계에서 자기 정의를 CFN으로 업데이트. 위험성은 잘못된 파이프라인 정의를 push하면 self-mutation이 깨진 파이프라인을 deploy해 복구가 어려울 수 있다는 점(break-glass IAM 권한 유지 필수). A/C/D는 무관.

---

**문제 5.** SnapStart의 핵심 메커니즘과 시험에서의 적용 범위는?

A) 모든 런타임의 cold start 단축
B) Java 함수 init 단계의 JVM 메모리 스냅샷을 S3에 저장 → 다음 invocation은 복원해 init 건너뜀; zip Java 11/17/21만 지원
C) Lambda Layer 자동 캐싱
D) Container Image의 lazy load 가속

**정답: B**
해설: SnapStart(2022 re:Invent)는 Self/Smalltalk image-based persistence와 동일한 발상. Java init 단계가 길어 cold start의 주범이라 이를 사전 스냅샷으로 해결. uniqueness assumption(random seed, DB connection) 문제로 Runtime Hook을 통한 명시적 재초기화 필요. zip Java만(2024 말 기준), Python/Node/Container 미지원. A는 너무 광범위, C는 SnapStart와 무관, D는 Container 영역.

---

**문제 6.** Serverless Framework v4의 가장 큰 변화로 도입 결정에 영향을 주는 요소는?

A) AWS Lambda 미지원
B) MIT 라이선스에서 상업 라이선스로 전환 — 연 매출 200만 달러 이상 기업은 유료 등록 필요
C) Python 지원 중단
D) Docker Image 미지원

**정답: B**
해설: 2023년 2월 Serverless Inc. 발표. v3까지 MIT, v4부터 "Serverless Framework License"(Apache 2.0 기반 + 상업 사용 제한). GitHub에 강한 반발과 SAM/CDK 마이그레이션 움직임 촉발. Terraform이 2023년 8월 BSL로 전환한 패턴과 동일. 시험에선 직접 출제 빈도는 낮지만 SLS 도입 결정 시나리오에 등장 가능. A/C/D는 사실이 아님.

---

**문제 7.** CDK Aspects의 용도로 가장 정확한 것은?

A) 모든 Lambda 함수에 자동 코드 주입
B) Construct Tree를 visitor 패턴으로 순회하며 횡단 정책(태깅, 암호화 강제, naming 규칙) 적용
C) IAM Policy 자동 생성 (grant 메서드 대체)
D) Lambda Layer 관리

**정답: B**
해설: Aspects는 AOP(Aspect-Oriented Programming, Gregor Kiczales 1997)의 IaC 버전. 코어 로직(Stack 정의)에서 횡단 관심사(태그, 보안, 명명)를 분리해 별도 visitor로 표현. `cdk.Aspects.of(app).add(new TagAspect())`로 전체 앱에 적용. A는 코드 영역이라 무관, C는 grant 메서드의 영역(Aspects는 검증·태깅), D는 무관. SAM에는 동등한 메커니즘이 없어 외부 도구(cfn-nag) 사용.

---

## 📌 오늘의 요약

오늘 다룬 세 IaC 대안의 핵심은 (1) Serverless Framework는 플러그인 생태계와 멀티 클라우드가 강점이지만 v4 라이선스 변화 신중, (2) CDK는 L1/L2/L3 Construct + grant 메서드 + Aspects로 SAM이 못 하는 모든 AWS 리소스 추상화 가능, (3) Lambda Container Image 10GB는 ML/대형 의존성에 적합하지만 Layer/SnapStart 호환성 제약, (4) Cold Start는 Provisioned Concurrency/SnapStart/ARM/패키지 최소화의 조합으로 완화, (5) CDK Pipelines의 self-mutating으로 GitOps IaC 실현 — 다섯 가지다.
