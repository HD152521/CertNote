# Day 2 - Serverless Framework and CDK: People Who Chose a Path Other Than SAM

Yesterday we saw that SAM is a serverless DSL layered on top of CloudFormation Macros. But out in the field, surprisingly many teams don't use SAM. Some run 200 Lambda functions with the Serverless Framework, and some declare Lambda, EKS, RDS, and SQS in a single file with CDK + TypeScript. All three ultimately generate a CloudFormation template and throw it at AWS, but the abstraction model and user experience are completely different. Today we compare the two alternatives to SAM: the **Serverless Framework** (2015, a Node-based plugin system) and **CDK** (2019, a code-based IaC built by AWS itself).

The DOP exam increasingly compares SAM and CDK within a single question. For a scenario like "the team is comfortable with TypeScript and wants to manage EKS, RDS, and OpenSearch in a single stack in addition to Lambda," the answer is almost always CDK. On the other hand, if "the policy is to use only AWS-native tools and the learning curve must be low," it's SAM. Understanding the criteria for this choice precisely is today's goal.

## Why the Serverless Framework Survived

The Serverless Framework (SLS) traces back to the "JAWS Framework" created by Austen Collins in 2015. AWS officially launched Lambda in November 2014, and a year later the community was already building IaC tools for it. SAM was announced at re:Invent in November 2016, so SLS came a year earlier, and during that time it put down deep roots in the Node.js ecosystem.

The essence of SLS is its **plugin architecture**. `serverless.yml` is a thin spec, and the actual behavior is handled by hundreds of npm plugins. Function packaging, per-function IAM permissions, local invoke, offline mode, ECR image builds, cost estimation — all plugins.

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

Deployment finishes with `sls deploy --stage prod`, and internally SLS generates a CloudFormation template, uploads it to S3, and then calls `aws cloudformation deploy`. In other words, **SLS also ultimately runs on top of CloudFormation**. However, unlike SAM's macro approach, SLS **synthesizes the CFN on the client side**, so you don't see a "Processed template" stage like SAM's in the CFN console.

> SLS's plugin model is a standard pattern in the Node ecosystem, like Babel, Webpack, and ESLint. Its theoretical basis is the same "core + extension point" design as the **Eclipse Plugin Architecture** (Equinox/OSGi) by Erich Gamma in the 1990s. The core is kept small, and external modules register the functionality. The advantage is an explosive diversity of community extensions; the disadvantages are compatibility problems between plugins and an expanded security surface. As the 2021 `node-ipc` incident showed, a single line of npm dependency can threaten an entire pipeline.

> SLS can extract the CFN template (`cloudformation-template-update-stack.json`) into the `.serverless/` folder with the `serverless package` command. Opening this file shows what CFN resources a single function was ultimately expanded into: `AWS::Lambda::Function` + `AWS::IAM::Role` + `AWS::Logs::LogGroup` + `AWS::ApiGatewayV2::Integration` + `AWS::ApiGatewayV2::Route`, producing 8 or more resources. The only difference is that what the SAM macro expands on the server, SLS does on the client; the result is identical.

> In February 2023, Serverless Inc. announced that starting with SLS v4 it would apply a **commercial license to companies with annual revenue of $2 million or more**. Up to v3 it was MIT, and from v4 it is the "Serverless Framework License" — based on Apache 2.0 but requiring paid registration for enterprise use. Right after the announcement, over 1,500 critical comments were posted on the GitHub issue, and some companies began migrating to SAM/CDK. This is a good example of the shock that a business-model shift of an open-source tool has on its users (the same pattern as Terraform's switch to BSL in August 2023).

## CDK's Synthesis Model: Code Is Infrastructure

CDK (AWS Cloud Development Kit) was announced as GA in July 2019. The core idea is to **declare infrastructure in a general-purpose programming language instead of YAML/JSON**. Internally, CDK runs the code to build a **Construct Tree** in memory and then synthesizes (synth) it into a CFN template.

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
        externalModules: ['@aws-sdk/*'],  // The SDK is included in the Lambda runtime
      },
      environment: {
        TABLE_NAME: table.tableName,
        POWERTOOLS_SERVICE_NAME: 'orders',
      },
      tracing: lambda.Tracing.ACTIVE,
      currentVersionOptions: { removalPolicy: cdk.RemovalPolicy.RETAIN },
    });

    table.grantReadData(getOrder);   // Automatically generates intent-based IAM

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

The most interesting line in this code is `table.grantReadData(getOrder)`. Comparing it with SAM Policy Templates shows the difference.

| Aspect | SAM Policy Template | CDK grant method |
|------|---------------------|-------------------|
| Permission scope | Predefined general patterns | Based on the resource's exact ARN |
| GSI/LSI | Included automatically (broad) | Included automatically (when needed) |
| KMS key | Must be specified separately | Automatically detects the table's encryption key |
| Adding new actions | Wait for AWS to update | New SDK methods usable immediately |
| Code reuse | Copy-paste YAML | Can be abstracted into functions |

When you declare only the **intent** that "this function reads this table," CDK's internal logic automatically synthesizes (1) the table ARN, (2) the GSI/LSI ARNs, (3) the KMS Key ARN, and (4) the appropriate list of dynamodb:* actions into an IAM Policy. This is the biggest practical difference from SAM.

> CDK's Construct Tree is an in-memory data structure. The `cdk synth` command proceeds in 5 steps: (1) run the code → (2) build the Construct object graph → (3) traverse the graph and extract `Cfn*` resources → (4) serialize to JSON → (5) save to the `cdk.out/` folder. Thanks to this separation, CDK is **pure code**. It has no side effects, and the same code always produces the same template. This is why it fits well with GitOps. It is an essentially different model from Terraform's `terraform plan`, which queries the cloud state and then computes a diff.

> CDK's L1/L2/L3 layers are the IaC version of the **layered architecture (THE system)** principle of Edsger Dijkstra in the 1960s. L1 maps 1:1 to CFN (`CfnFunction`), L2 is an abstraction with sensible defaults (`Function`), and L3 is a pattern bundling multiple L2s (`ApplicationLoadBalancedFargateService`). Each layer is defined as a function of the layer beneath it, and users pick only the level of abstraction they need. This pattern is isomorphic to React's component hierarchy and Kubernetes's Pod→Deployment→Service abstraction.

> 🎯 **Scenario**: "The team is a backend team that mainly uses React/TypeScript, manages Lambda, DynamoDB, OpenSearch, EKS, RDS, and SQS in a single stack, and wants to reduce IAM permission mistakes. Which IaC should they choose?" — The answer is **CDK with TypeScript**. SAM has to fall back to plain CFN for anything beyond its 6 serverless resource types, and SLS is Lambda-centric so its EKS integration is weak. CDK abstracts every AWS resource as an L2 Construct and automates IAM with `grant*`.

## Construct Hierarchy: L1, L2, L3

What makes CDK fundamentally different from other IaC tools is the **Construct hierarchy**.

| Layer | Example | Level of abstraction | When to use |
|------|------|-------------|-----------|
| **L1** | `CfnFunction`, `CfnBucket` | 1:1 mapping with CFN | When you need every CFN property |
| **L2** | `Function`, `Bucket`, `Table` | Sensible defaults + grant methods | 95% of cases |
| **L3** | `ApplicationLoadBalancedFargateService`, `EventbridgeToLambdaToDynamoDB` (Solutions Constructs) | Vetted architecture patterns | To build standard architectures quickly |

```typescript
// L1 — control over every CFN property
new lambda.CfnFunction(this, 'Raw', {
  functionName: 'raw-fn',
  runtime: 'nodejs20.x',
  handler: 'index.handler',
  role: roleArn,
  code: { s3Bucket: 'b', s3Key: 'k' },
  // ... every CFN field
});

// L2 — expresses intent + defaults
new lambda.Function(this, 'L2Fn', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('src/'),
  // role auto-created, logGroup auto-created
});

// L2 + automatic bundling
new nodejs.NodejsFunction(this, 'NodeFn', {
  entry: 'src/index.ts',  // TS → JS converted automatically
  bundling: { minify: true, externalModules: ['@aws-sdk/*'] },
});

// L3 — Solutions Constructs (separate package)
new EventbridgeToLambda(this, 'Pattern', {
  lambdaFunctionProps: { /* ... */ },
  eventRuleProps: { /* ... */ },
});
```

The "auto-created" resources that L2 makes for you often appear as traps on the exam. For example, `lambda.Function` automatically creates an IAM Role, a LogGroup, and an AssumeRolePolicy, and the default `removalPolicy` is `DESTROY`, so they all disappear when the stack is deleted. In production, specify `RETAIN` explicitly.

## Lambda Container Image: Getting Past the 250MB Wall

The zip package limit is 250MB (unzipped), and if you need heavy dependencies such as large ML models, OS tools, or Tesseract, you exceed it. In December 2020 AWS announced **Lambda Container Image** support, and the limit rose to **10GB**.

```dockerfile
# Official base image (includes RIE)
FROM public.ecr.aws/lambda/python:3.12

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt -t ${LAMBDA_TASK_ROOT}

# Large assets such as ML models
COPY models/ ${LAMBDA_TASK_ROOT}/models/

# Function code
COPY app.py ${LAMBDA_TASK_ROOT}

# Specify the handler
CMD ["app.handler"]
```

Build and deploy:

```bash
# ECR login
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin 111.dkr.ecr.ap-northeast-2.amazonaws.com

# Build (use buildx for an ARM target)
docker buildx build --platform linux/arm64 -t myfn:v1 .
docker tag myfn:v1 111.dkr.ecr.ap-northeast-2.amazonaws.com/myfn:v1
docker push 111.dkr.ecr.ap-northeast-2.amazonaws.com/myfn:v1

# Create the Lambda (in CDK, use DockerImageFunction)
aws lambda create-function \
  --function-name myfn \
  --package-type Image \
  --code ImageUri=111.dkr.ecr.ap-northeast-2.amazonaws.com/myfn:v1 \
  --architectures arm64 \
  --role arn:aws:iam::111:role/lambda-exec
```

The CDK version:

```typescript
new lambda.DockerImageFunction(this, 'MLFn', {
  code: lambda.DockerImageCode.fromImageAsset('./docker'),  // Automatic build + ECR push
  architecture: lambda.Architecture.ARM_64,
  memorySize: 3008,
  timeout: cdk.Duration.minutes(5),
});
```

> A Lambda Container Image is not an ordinary OCI image. It must follow the **Lambda Container Image Spec** defined by AWS, and the image must include the Lambda Runtime Interface Client (RIC). The official AWS base images (`public.ecr.aws/lambda/*`) already include the RIC, so just `CMD ["app.handler"]` works. If you use your own base image, you must add the RIC yourself. Meanwhile, on a cold start Lambda doesn't download the whole image; with **per-layer lazy loading** + **block-level caching**, it first fetches only the part needed to start (see the 2020 SOSP paper "On-demand Container Loading in AWS Lambda"). That's why even a 10GB image has a cold start of only about 2 to 3 times that of a zip package.

> ⚠️ **Trap**: Container Image Lambda **cannot use Lambda Layers**. All dependencies must be included in the image. Also, Provisioned Concurrency is supported, but SnapStart supports only zip Java (not Container, as of December 2024; container image, Python, and .NET support were added later, and as of 2026-11 the official docs support both ZIP and container images). On the exam, the answer to "how do you deploy a 5GB ML model to Lambda?" is Container Image, but the answer to "how do you reduce package size while keeping the existing 4 Layers as they are?" is to keep the Layers and optimize the zip package, not Container.

## IaC Tool Selection Matrix

| Item | SAM | Serverless Framework | CDK | Terraform |
|------|-----|----------------------|-----|-----------|
| Released | 2016 | 2015 | 2019 | 2014 |
| Abstraction model | CFN Macro | Client-side synthesis → CFN | Code → CFN synthesis | Own engine + Providers |
| Language | YAML/JSON | YAML + JS plugins | TS/Py/Java/C#/Go | HCL |
| AWS-native | ✅ | Partial | ✅ | ❌ (multi-cloud) |
| State management | CFN automatic | CFN automatic | CFN automatic | tfstate (S3+DynamoDB recommended) |
| Drift Detection | ✅ (CFN) | ✅ (CFN) | ✅ (CFN) | `terraform plan -refresh-only` |
| Rollback | ✅ (CFN automatic) | ✅ (CFN automatic) | ✅ (CFN automatic) | Manual |
| Learning curve | Low | Low | Medium (learning a language) | Medium |
| Exam weight | Very high | Low | Medium (rising) | Almost none |
| License | Apache 2.0 | Commercial license from v4 | Apache 2.0 | BSL 1.1 (from 2023.8) |

> 🎯 **Scenario**: The right answer for 4 situations
> - **"50 Lambda + API Gateway + DynamoDB resources, want to use only YAML"** → SAM
> - **"200 Lambda functions, multiple stages, need a rich plugin ecosystem"** → Serverless Framework (but review the v4 license)
> - **"Mix of Lambda, EKS, RDS, OpenSearch, SQS, TS team"** → CDK
> - **"Multi-cloud (AWS+GCP+Azure), existing Terraform assets"** → Terraform

> In 2022, Liberty Mutual moved its infrastructure to CDK and ended up operating about **9,000 CDK Stacks**. It built its own L3 Construct library so that internal teams could deploy standard patterns, with security, tagging, and logging policies applied automatically, in 5 minutes. This is the essential value of CDK — not just writing infrastructure as code, but being able to build a **reusable infrastructure abstraction library**. Compared with SAM Policy Templates, the breadth of abstraction tools is essentially different.

## CDK Aspects: Elegant Handling of Cross-Cutting Concerns

In a large CDK codebase, how do you apply policies such as "enforce required tags," "block unencrypted resources," and "enforce RemovalPolicy RETAIN" to every stack? CDK provides a visitor-pattern mechanism called **Aspects**.

```typescript
import { IAspect, Tags } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

// Enforce encryption on every S3 Bucket
class EncryptionAspect implements IAspect {
  visit(node: IConstruct): void {
    if (node instanceof s3.CfnBucket) {
      if (!node.bucketEncryption) {
        throw new Error(`S3 Bucket ${node.node.path} must have encryption configured`);
      }
    }
  }
}

// Add a CostCenter tag to every resource
class CostCenterTagAspect implements IAspect {
  visit(node: IConstruct): void {
    if (cdk.TagManager.isTaggable(node)) {
      Tags.of(node).add('CostCenter', 'engineering');
      Tags.of(node).add('Owner', 'platform-team');
    }
  }
}

// Apply to the whole app
cdk.Aspects.of(app).add(new EncryptionAspect());
cdk.Aspects.of(app).add(new CostCenterTagAspect());
```

> Aspects are the IaC version of **Aspect-Oriented Programming (AOP)**, proposed by Gregor Kiczales in 1997. Cross-cutting concerns — logging, security, tagging — are separated from the core logic and expressed as separate modules. Java's AspectJ and Spring AOP follow the same principle. CDK's visitor pattern traverses the Construct Tree and decides which policy to apply to each node. This is SAM's limitation — SAM runs the macro only once to produce static YAML, and applying cross-cutting policies afterward has to rely on external tools (cfn-nag, cfn-lint, AWS Config Rules).

## CDK Pipelines: Self-mutating CI/CD

CDK Pipelines is an L3 Construct released in 2020 with a unique structure: it **declares the pipeline itself in CDK** and **has itself as the first Stage**.

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

// Add per-environment Stages
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

With `selfMutation: true` turned on, the pipeline operates in the following order.

1. Source → fetches the code
2. Build → runs `cdk synth` to generate the CFN template
3. **UpdatePipeline (self-mutate)** → updates the pipeline's own definition via CFN
4. Asset → builds Lambda zips, Docker images, etc. and uploads them to S3/ECR
5. Deploy → CFN deploy to each Stage

Step 3 is the key. Because the pipeline itself is part of the CDK code, adding a stage, adding a new environment, or changing a build command is **reflected immediately on the next run**. This is the IaC version of GitOps.

> The danger of self-mutating — if there is a bug in the pipeline definition, self-mutation deploys the broken pipeline, and the next run starts with the broken pipeline and may never return to normal. Defenses are (1) always review changes with `cdk diff`, (2) test in advance on a `feature branch`, and (3) keep IAM permissions so that a **break glass** procedure allows manual recovery from the console. The 2021 incident in which Stripe broke Production CI with a similar GitOps tool is well known (a GitOps anti-pattern).

## Cold Start: Lambda's Eternal Homework

When Lambda has no invocations, the container is reclaimed, and the next invocation has to bring up a new container. This startup time is the cold start, and it varies from 50 ms to 10 seconds depending on the function's characteristics.

| Stage | Meaning | Influencing factors | Typical range |
|------|------|-----------|-----------|
| 1. Worker allocation | Create a Firecracker microVM on EC2 | AWS internal | 50~200ms |
| 2. Runtime init | Download code + start the runtime | Package size, runtime | 100ms~5s |
| 3. Init code | Run code outside `handler` | Dependency imports, connection pools | 0 to several seconds |
| 4. Handler execution | The actual business logic | Code | Depends on the function |

| Mitigation technique | Effect | Cost | Applies to |
|-----------|------|------|------|
| **Provisioned Concurrency** | Cold start nearly 0 (pre-warmed) | Billed for active time | When traffic is predictable |
| **SnapStart (Java)** | Cuts Java init time by 90%+ | Free | zip Java 11/17/21 (as of late 2024) |
| **ARM architecture** | 10 to 20% faster init than x86 | 20% cheaper | Compatible runtimes |
| **Minimize package** | Reduces download time | - | All functions |
| **Minimize top-level imports** | Shortens init code | - | Especially Python/Node |
| **Don't use a VPC** | Removes 8 to 10 s of ENI creation | - | Functions that don't need NAT/RDS Proxy |

> SnapStart was announced at AWS re:Invent 2022, and its internal mechanism is very interesting. It takes a **JVM memory snapshot** of the Java function's init phase and stores it in S3, and the next invocation restores the snapshot and skips init. This is the same concept as the image-based persistence of Self/Smalltalk in the 1990s. However, "uniqueness assumptions" such as random seeds and DB connections held in memory can break, so explicit re-initialization via a `Runtime Hook` (`Core.getGlobalRuntime().register(...)`) is required. On the exam, the answer to "how do you reduce a Java cold start of 10 seconds to under 1 second?" is SnapStart.

> ⚠️ **Trap**: Provisioned Concurrency can be applied **only to a function Version**, not to `$LATEST`. That's why it must be used together with `AutoPublishAlias` + `DeploymentPreference`. Also, if traffic exceeds PC capacity while PC is on, the excess is handled as ordinary cold starts, so a pattern of dynamically adjusting PC with Application Auto Scaling is commonly used (increasing PC during business hours with scheduled scaling).

## Powertools for AWS Lambda: The Observability Standard

A standard library for implementing logging, tracing, and metrics consistently in function code. Supports Python/TypeScript/Java/.NET.

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
    # ... DynamoDB lookup logic
    return {"order_id": order_id, "status": "shipped"}

@logger.inject_lambda_context(correlation_id_path='requestContext.requestId')
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event, context):
    return app.resolve(event, context)
```

The core value is that it automatically emits **EMF (Embedded Metric Format)**. When metrics are embedded as JSON in CloudWatch Logs, CloudWatch automatically aggregates them into separate Metrics. Metrics are created without the cost of PutMetricData API calls.

> EMF is a combination of **structured logging** and **metrics as log**. The approach of treating Logs as the single source of truth and deriving metrics from them shares the philosophy of the "Events" concept in Honeycomb and Datadog. Traditionally, metrics and logs were separate pipelines, but with EMF a single log line plays both roles at once. Cost and operational burden are reduced.

## Summary

There are three pictures from today. First, the **Serverless Framework** is strong in its Node plugin ecosystem, but because of the commercial license from v4, new adoption calls for caution. Second, **CDK** abstracts every AWS resource in code, and the intent-based IAM of `grant*` methods and the L1/L2/L3 Construct hierarchy are its essential differentiators. Third, **Lambda Container Image** is suited for ML and large dependencies with its 10GB limit, but has Layer/SnapStart compatibility constraints.

In the next article, we look at patterns for orchestrating serverless workflows with Step Functions and EventBridge. The days of solving everything with a single Lambda are over; now the **collaboration structure between functions** is what matters more.

---

## 📝 Practice Questions

**Question 1.** What is the most accurate description of the scope of the IAM Policy that CDK's `table.grantReadData(getOrder)` automatically synthesizes?

A) All dynamodb:* actions on the table
B) The table ARN, its GSI/LSI ARNs, the table's KMS key ARN, and the appropriate Read actions (GetItem, Query, Scan, etc.)
C) Global Read permission on all DynamoDB tables
D) Permissions are granted automatically only to the Lambda function and do not apply to other resources

**Answer: B**
Explanation: The core of CDK grant methods is **expressing intent + mapping resources precisely**. It doesn't just give actions; it automatically tracks all of the table's index ARNs and even the encryption KMS key ARN to build an accurate Resource block. A is too broad (closer to grantFullAccess than grantReadData), C is inaccurate because it is a wildcard, and D is wrong because CDK supports the grant pattern for all resources. Compared with SAM Policy Templates, the permissions are narrower and more accurate.

---

**Question 2.** Which statement about the differences between Lambda Container Image and a zip package is NOT accurate? (As of late 2024.)

A) Container is up to 10GB, zip is 250MB
B) Container cannot use Lambda Layers
C) Container does not support SnapStart (Java too is zip only)
D) Container does not support Provisioned Concurrency

**Answer: D**
Explanation: D is the incorrect statement. Container Image Lambda supports PC (although the PC warm-up time is longer than for zip). A/B/C are all true. The zip limit of 250MB is measured unzipped and the Container 10GB is measured compressed, so the actual usable capacity differs by 30 to 40 times. SnapStart has supported only zip Java since its release in 2022 and continued to lack Container support through the end of 2024. Layers are not compatible with Container, so all dependencies must be included in the Dockerfile.

---

**Question 3.** "The team is comfortable with TypeScript, manages Lambda, EKS, RDS, OpenSearch, and SQS in a single stack, wants to reduce IAM permission mistakes, and wants to build an internal standard library to operate 9,000 Stacks." Which IaC is most suitable?

A) SAM
B) Serverless Framework
C) CDK with TypeScript
D) Writing CloudFormation YAML directly

**Answer: C**
Explanation: CDK provides (1) L2 Constructs for all AWS resources (SAM covers only 6 serverless types), (2) automatic IAM with `grant*`, (3) reusable abstractions through an **internal L3 Construct library**, and (4) TypeScript type safety. Liberty Mutual's 9,000 Stack case is exactly this scenario. SAM is weak at EKS/RDS integration, SLS is Lambda-centric and has the v4 license issue, and CFN YAML has no abstraction tools and churns out 2,000-line templates.

---

**Question 4.** What does `selfMutation: true` in CDK Pipelines mean?

A) A Lambda function automatically modifies its own code
B) The Pipeline has itself as the first Stage, and CDK code changes (adding stages, changing environments, etc.) are reflected automatically on the next run
C) DynamoDB Auto Scaling
D) Automatic IAM Role rotation

**Answer: B**
Explanation: CDK Pipelines declares the pipeline itself as CDK code, in the spirit of GitOps. When selfMutation is on, after Source→Synth the **UpdatePipeline** step updates its own definition via CFN. The risk is that pushing a bad pipeline definition can cause self-mutation to deploy a broken pipeline that is hard to recover (keeping break-glass IAM permissions is essential). A/C/D are unrelated.

---

**Question 5.** What is SnapStart's core mechanism and its scope of application on the exam? (As of late 2024.)

A) Shortens cold start for all runtimes
B) Saves a JVM memory snapshot of the Java function's init phase to S3 → the next invocation restores it and skips init; supports only zip Java 11/17/21
C) Automatic caching of Lambda Layers
D) Accelerates lazy loading of Container Images

**Answer: B**
Explanation: SnapStart (2022 re:Invent) is the same idea as the image-based persistence of Self/Smalltalk. The Java init phase is long and the main culprit of cold start, so it is solved with a pre-taken snapshot. Because of the uniqueness assumption problem (random seeds, DB connections), explicit re-initialization via a Runtime Hook is required. Zip Java only (as of late 2024); Python/Node/Container are not supported. A is too broad, C has nothing to do with SnapStart, and D is Container territory.

---

**Question 6.** What is the biggest change in Serverless Framework v4 that affects adoption decisions?

A) AWS Lambda is no longer supported
B) Switch from the MIT license to a commercial license — companies with annual revenue of $2 million or more must pay to register
C) Python support discontinued
D) Docker Image not supported

**Answer: B**
Explanation: Announced by Serverless Inc. in February 2023. MIT up to v3; from v4 the "Serverless Framework License" (based on Apache 2.0 + commercial use restrictions). It sparked strong backlash on GitHub and a move toward SAM/CDK migration. It is the same pattern as Terraform's switch to BSL in August 2023. It is rarely tested directly on the exam, but it can appear in SLS adoption-decision scenarios. A/C/D are not true.

---

**Question 7.** What is the most accurate description of the purpose of CDK Aspects?

A) Automatically injecting code into every Lambda function
B) Traversing the Construct Tree with the visitor pattern to apply cross-cutting policies (tagging, enforcing encryption, naming rules)
C) Automatic IAM Policy generation (replacing grant methods)
D) Lambda Layer management

**Answer: B**
Explanation: Aspects are the IaC version of AOP (Aspect-Oriented Programming, Gregor Kiczales 1997). They separate cross-cutting concerns (tags, security, naming) from the core logic (the Stack definition) and express them as separate visitors. They are applied to the whole app with `cdk.Aspects.of(app).add(new TagAspect())`. A is the code domain and is unrelated, C is the domain of grant methods (Aspects are for validation and tagging), and D is unrelated. SAM has no equivalent mechanism and uses external tools (cfn-nag).

---

## 📌 Today's Summary

The key points of the three IaC alternatives covered today are five: (1) the Serverless Framework is strong in its plugin ecosystem and multi-cloud, but be cautious about the v4 license change; (2) CDK, with L1/L2/L3 Constructs + grant methods + Aspects, can abstract every AWS resource, which SAM cannot; (3) Lambda Container Image's 10GB suits ML and large dependencies, but has Layer/SnapStart compatibility constraints; (4) Cold Start is mitigated by a combination of Provisioned Concurrency/SnapStart/ARM/package minimization; (5) the self-mutating feature of CDK Pipelines realizes GitOps IaC.
