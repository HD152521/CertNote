# Day 2 - Serverless Framework and CDK: Those Who Chose a Path Other Than SAM

Yesterday we saw that SAM is a serverless DSL layered on top of CloudFormation Macros. But in the field, a surprising number of teams do not use SAM. Some run 200 Lambda functions with the Serverless Framework, and others declare Lambda, EKS, RDS, and SQS in a single file with CDK + TypeScript. All three ultimately produce a CloudFormation template and hand it to AWS, but their abstraction models and user experiences are completely different. Today we compare the two alternatives to SAM: the **Serverless Framework** (2015, a Node-based plugin system) and the **CDK** (2019, a code-based IaC tool built by AWS itself).

The DOP exam increasingly compares SAM and CDK within a single question. For a scenario like "The team is comfortable with TypeScript and wants to manage EKS, RDS, and OpenSearch in the same stack in addition to Lambda," the answer is almost always CDK. On the other hand, if "the policy is to use only AWS-native tools and the learning curve must be low," the answer is SAM. Understanding exactly where the line between these choices falls is the goal for today.

## Why the Serverless Framework Survived

The Serverless Framework (SLS from here on) traces back to the "JAWS Framework" created by Austen Collins in 2015. AWS released Lambda in November 2014, so within a year the community had already started building IaC tools for it. SAM was announced at re:Invent in November 2016, so SLS came a year earlier and used that time to put down deep roots in the Node.js ecosystem.

The essence of SLS is its **plugin architecture**. `serverless.yml` is a thin spec, and the actual work is done by hundreds of npm plugins. Function packaging, per-function IAM permissions, local invoke, offline mode, ECR image builds, and cost estimation are all plugins.

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

Deployment finishes with `sls deploy --stage prod`. Internally, SLS generates a CloudFormation template, uploads it to S3, and then calls `aws cloudformation deploy`. In other words, **SLS also runs on top of CloudFormation after all**. However, unlike SAM's macro approach, SLS **synthesizes the CFN template on the client side**, so the CFN console does not show a "Processed template" step the way it does for SAM.

> SLS's plugin model is a standard pattern in the Node ecosystem, shared by Babel, Webpack, and ESLint. Its theoretical basis is the same "core + extension point" design as the **Eclipse Plugin Architecture** (Equinox/OSGi) associated with Erich Gamma in the 1990s. The core is kept small, and external modules register the functionality. The upside is an explosive diversity of community extensions; the downside is plugin compatibility problems and an expanded security surface. As the 2021 `node-ipc` incident showed, a single npm dependency line can threaten an entire pipeline.

> SLS can extract the CFN template (`cloudformation-template-update-stack.json`) into the `.serverless/` folder with the `serverless package` command. Opening this file shows which CFN resources a single function is ultimately expanded into: `AWS::Lambda::Function` + `AWS::IAM::Role` + `AWS::Logs::LogGroup` + `AWS::ApiGatewayV2::Integration` + `AWS::ApiGatewayV2::Route`, for a total of 8 or more resources. The only difference is that SLS does on the client what the SAM macro does on the server; the result is the same.

> In February 2023, Serverless Inc. announced that starting with SLS v4 it would apply a **commercial license to companies with annual revenue above $2 million**. Through v3 the framework was MIT-licensed; from v4 it uses the "Serverless Framework License", which is based on Apache 2.0 but requires paid registration for corporate use. Right after the announcement, more than 1,500 critical comments were posted on the GitHub issue, and some companies began migrating to SAM/CDK. It is a good example of the shock that a business-model change in an open-source tool can cause its users (the same pattern as Terraform's switch to the BSL in August 2023).

## The CDK Synthesis Model: Code Is the Infrastructure

The CDK (AWS Cloud Development Kit) reached GA in July 2019. The core idea is to **declare infrastructure in a general-purpose programming language instead of YAML/JSON**. Internally, the CDK executes your code to build a **Construct Tree** in memory and then synthesizes (synth) it into a CFN template.

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

    table.grantReadData(getOrder);   // Intent-based IAM generated automatically

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

The most interesting line in this code is `table.grantReadData(getOrder)`. Comparing it with SAM Policy Templates makes the difference visible.

| Aspect | SAM Policy Template | CDK grant method |
|------|---------------------|-------------------|
| Permission scope | Predefined generic patterns | Based on the exact ARN of the resource |
| GSI/LSI | Included automatically (broad) | Included automatically (when needed) |
| KMS key | Must be specified separately | The table's encryption key is detected automatically |
| Adding new actions | Wait for an AWS update | New SDK methods usable immediately |
| Code reuse | Copy-paste YAML | Can be abstracted into functions |

With CDK, you declare only the **intent** that "this function reads this table," and the internal logic automatically synthesizes into an IAM Policy (1) the table ARN, (2) the GSI/LSI ARNs, (3) the KMS Key ARN, and (4) the appropriate list of dynamodb:* actions. This is the biggest practical difference from SAM.

> The CDK's Construct Tree is an in-memory data structure. The `cdk synth` command proceeds in five steps: (1) run the code, (2) build the Construct object graph, (3) traverse the graph and extract `Cfn*` resources, (4) serialize to JSON, and (5) save to the `cdk.out/` folder. Thanks to this separation, the CDK is **pure code**. It has no side effects, and the same code always produces the same template. This is why it fits so well with GitOps. It is essentially a different model from Terraform, where `terraform plan` queries the cloud state and then computes a diff.

> The CDK's L1/L2/L3 layers are the IaC version of the **layered architecture (the THE system)** principle of Edsger Dijkstra in the 1960s. L1 maps 1:1 to CFN (`CfnFunction`), L2 is an abstraction with sensible defaults (`Function`), and L3 is a pattern that bundles several L2s (`ApplicationLoadBalancedFargateService`). Each layer is defined as a function of the layer below it, and users choose only the level of abstraction they need. This pattern is isomorphic to React's component hierarchy and to Kubernetes's Pod -> Deployment -> Service abstractions.

> 🎯 **Scenario**: "The team is a backend team that primarily uses React/TypeScript, manages Lambda, DynamoDB, OpenSearch, EKS, RDS, and SQS in a single stack, and wants to reduce IAM permission mistakes. Which IaC should it choose?" The answer is **CDK with TypeScript**. SAM would have to fall back to plain CFN for anything beyond its six serverless resource types, and SLS is Lambda-centric so its EKS integration is weak. CDK abstracts every AWS resource as an L2 Construct and automates IAM through `grant*`.

## Construct Hierarchy: L1, L2, L3

What fundamentally sets the CDK apart from other IaC tools is the **Construct hierarchy**.

| Layer | Examples | Level of abstraction | When to use |
|------|------|-------------|-----------|
| **L1** | `CfnFunction`, `CfnBucket` | 1:1 mapping to CFN | When you need every CFN property |
| **L2** | `Function`, `Bucket`, `Table` | Sensible defaults + grant methods | 95% of cases |
| **L3** | `ApplicationLoadBalancedFargateService`, `EventbridgeToLambdaToDynamoDB` (Solutions Constructs) | Proven architecture patterns | Standard architectures, quickly |

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
  entry: 'src/index.ts',  // TS -> JS conversion is automatic
  bundling: { minify: true, externalModules: ['@aws-sdk/*'] },
});

// L3 — Solutions Constructs (separate package)
new EventbridgeToLambda(this, 'Pattern', {
  lambdaFunctionProps: { /* ... */ },
  eventRuleProps: { /* ... */ },
});
```

The "automatically created" resources that L2 produces are often exam traps. For example, `lambda.Function` automatically creates an IAM Role, a LogGroup, and an AssumeRolePolicy, and the default `removalPolicy` is `DESTROY`, so all of them disappear when the stack is deleted. In production, set it explicitly to `RETAIN`.

## Lambda Container Image: Breaking Through the 250MB Wall

The zip package limit is 250MB (unzipped), and heavy dependencies such as large ML models, OS tools, or Tesseract can exceed it. In December 2020, AWS announced **Lambda Container Image** support, which raised the limit to **10GB**.

```dockerfile
# Official base image (includes the RIE)
FROM public.ecr.aws/lambda/python:3.12

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt -t ${LAMBDA_TASK_ROOT}

# Large assets such as an ML model
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

# Create the Lambda function (in CDK, use DockerImageFunction)
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

> A Lambda Container Image is not just any OCI image. It must follow the **Lambda Container Image Spec** defined by AWS, and the image must include the Lambda Runtime Interface Client (RIC). AWS's official base images (`public.ecr.aws/lambda/*`) already contain the RIC, so a plain `CMD ["app.handler"]` is enough to make them work. If you use your own base image, you must add the RIC yourself. Meanwhile, on a cold start Lambda does not download the whole image; with **per-layer lazy loading** and **block-level caching**, it fetches only the parts needed to start first (see the 2020 SOSP paper "On-demand Container Loading in AWS Lambda"). That is why even a 10GB image keeps cold starts to only about 2 to 3 times those of a zip package.

> ⚠️ **Trap**: A Container Image Lambda **cannot use Lambda Layers**. All dependencies must be included in the image. Also, Provisioned Concurrency is supported, but SnapStart supports only zip-packaged Java (Container is not supported, as of December 2024). On the exam, the answer to "How do you deploy a 5GB ML model to Lambda?" is Container Image, but the answer to "How do you reduce package size while keeping the existing 4 Layers?" is to keep the Layers and optimize the zip package, not Container.

## IaC Tool Selection Matrix

| Item | SAM | Serverless Framework | CDK | Terraform |
|------|-----|----------------------|-----|-----------|
| Released | 2016 | 2015 | 2019 | 2014 |
| Abstraction model | CFN Macro | Client-side synthesis -> CFN | Code -> CFN synthesis | Own engine + Providers |
| Language | YAML/JSON | YAML + JS plugins | TS/Py/Java/C#/Go | HCL |
| AWS-native | ✅ | Partial | ✅ | ❌ (multi-cloud) |
| State management | CFN automatic | CFN automatic | CFN automatic | tfstate (S3 + DynamoDB recommended) |
| Drift Detection | ✅ (CFN) | ✅ (CFN) | ✅ (CFN) | `terraform plan -refresh-only` |
| Rollback | ✅ (CFN automatic) | ✅ (CFN automatic) | ✅ (CFN automatic) | Manual |
| Learning curve | Low | Low | Medium (learning a language) | Medium |
| Exam weight | Very high | Low | Medium (rising) | Almost none |
| License | Apache 2.0 | Commercial license from v4 | Apache 2.0 | BSL 1.1 (since Aug 2023) |

> 🎯 **Scenario**: The right answer for each of four situations
> - **"50 Lambda + API Gateway + DynamoDB resources, want to use only YAML"** -> SAM
> - **"200 Lambda functions, multiple stages, need a rich plugin ecosystem"** -> Serverless Framework (but review the v4 license)
> - **"Mixed Lambda, EKS, RDS, OpenSearch, SQS, TS team"** -> CDK
> - **"Multi-cloud (AWS+GCP+Azure), existing Terraform assets"** -> Terraform

> In 2022, Liberty Mutual moved its infrastructure to CDK and ended up operating about **9,000 CDK Stacks**. By building its own L3 Construct library, it let internal teams deploy standard patterns with security, tagging, and logging policies applied automatically in 5 minutes. This is the essential value of CDK: it is not merely writing infrastructure as code, but being able to build a **reusable library of infrastructure abstractions**. Compared with SAM Policy Templates, the range of abstraction tools is fundamentally broader.

## CDK Aspects: Elegant Handling of Cross-Cutting Concerns

How do you apply policies such as "enforce required tags," "block unencrypted resources," or "force RemovalPolicy RETAIN" to every stack in a large CDK codebase? The CDK provides a visitor-pattern mechanism called **Aspects**.

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

> Aspects are the IaC version of **Aspect-Oriented Programming (AOP)**, proposed by Gregor Kiczales in 1997. Cross-cutting concerns such as logging, security, and tagging are separated from the core logic and expressed as separate modules. Java's AspectJ and Spring AOP follow the same principle. The CDK's visitor pattern traverses the Construct Tree and decides which policy to apply to each node. This is SAM's limitation: SAM's macro runs only once to produce a static YAML, and any later cross-cutting policy enforcement has to rely on external tools (cfn-nag, cfn-lint, AWS Config Rules).

## CDK Pipelines: Self-Mutating CI/CD

CDK Pipelines is an L3 Construct released in 2020 with a distinctive structure: it **declares the pipeline itself in CDK** and **has itself as the first Stage**.

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

// Add a Stage per environment
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

When `selfMutation: true` is on, the pipeline operates in the following order.

1. Source -> fetches the code
2. Build -> runs `cdk synth` to generate the CFN template
3. **UpdatePipeline (self-mutate)** -> updates the pipeline's own definition via CFN
4. Asset -> builds Lambda zips, Docker images, and so on, and uploads them to S3/ECR
5. Deploy -> runs CFN deploy for each Stage

Step 3 is the key. Because the pipeline itself is part of the CDK code, adding a stage, adding a new environment, or changing a build command is **reflected immediately on the next run**. This is the IaC version of GitOps.

> The danger of self-mutation: if the pipeline definition has a bug, self-mutation deploys the broken pipeline, and the next run starts with the broken pipeline and may never return to a healthy state. Defenses are (1) always review changes with `cdk diff`, (2) test in advance on a `feature branch`, and (3) keep IAM permissions so that a **break glass** procedure allows manual recovery from the console. An incident in 2021 in which Stripe broke its production CI with a similar GitOps tool is well known (a GitOps anti-pattern).

## Cold Start: Lambda's Eternal Homework

When there are no invocations, Lambda reclaims the container, and the next invocation has to spin up a new one. This start-up time is the cold start, and it varies from 50ms to 10 seconds depending on the characteristics of the function.

| Phase | Meaning | Factors | Typical range |
|------|------|-----------|-----------|
| 1. Worker allocation | Create a Firecracker microVM on EC2 | AWS internal | 50~200ms |
| 2. Runtime init | Code download + runtime start | Package size, runtime | 100ms~5s |
| 3. Init code | Run the code outside `handler` | Dependency imports, connection pools | 0 to several seconds |
| 4. Handler execution | The actual business logic | Code | Depends on the function |

| Mitigation | Effect | Cost | Applies when |
|-----------|------|------|------|
| **Provisioned Concurrency** | Cold start near 0 (pre-warmed) | Billed for active time | Traffic is predictable |
| **SnapStart (Java)** | Cuts Java init time by 90%+ | Free | zip Java 11/17/21 |
| **ARM architecture** | 10~20% faster init than x86 | 20% cheaper | Compatible runtimes |
| **Minimize package** | Shorter download time | - | All functions |
| **Minimize top-level imports** | Shorter init code | - | Especially Python/Node |
| **Don't use a VPC** | Removes 8~10s of ENI creation | - | Functions that need no NAT/RDS Proxy |

> SnapStart was announced at AWS re:Invent in 2022, and its internal mechanism is quite interesting. It takes a **JVM memory snapshot** at the end of the Java function's init phase and stores it in S3, and the next invocation restores the snapshot to skip init. This is the same concept as the image-based persistence of Self/Smalltalk in the 1990s. However, "uniqueness assumptions" such as random seeds and DB connections held in memory can be broken, so explicit re-initialization with a `Runtime Hook` (`Core.getGlobalRuntime().register(...)`) is needed. On the exam, the answer to "How do you cut a Java cold start from 10 seconds to under 1 second?" is SnapStart.

> ⚠️ **Trap**: Provisioned Concurrency can be applied only to a **function Version**, not to `$LATEST`. That is why it must be used together with `AutoPublishAlias` + `DeploymentPreference`. Also, when traffic exceeds the PC capacity while PC is on, the overflow is handled as ordinary cold starts, so a pattern of adjusting PC dynamically with Application Auto Scaling is commonly used (for example, Scheduled scaling to raise PC during business hours).

## Powertools for AWS Lambda: The Observability Standard

A standard library for implementing logging, tracing, and metrics consistently in function code. It supports Python/TypeScript/Java/.NET.

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

> EMF is a combination of **structured logging** and **metrics as logs**. Treating Logs as the single source of truth and deriving metrics from them shares the philosophy of the "Events" concept at Honeycomb and Datadog. Traditionally, metrics and logs were separate pipelines, but with EMF a single log line plays both roles at once. This reduces cost and operational burden.

## Summary

We saw three pictures today. First, the **Serverless Framework** is strong thanks to its Node plugin ecosystem, but it has a commercial license from v4, so adopting it for new projects calls for caution. Second, the **CDK** abstracts every AWS resource in code, and its intent-based IAM through `grant*` methods and its L1/L2/L3 Construct hierarchy are the essential differentiators. Third, **Lambda Container Image** suits ML and large dependencies with its 10GB limit, but it has Layer/SnapStart compatibility constraints.

In the next post, we look at patterns for orchestrating serverless workflows with Step Functions and EventBridge. The days when a single Lambda function solved everything are over, and now the **collaboration structure between functions** matters more.

---

## 📝 Practice Questions

**Question 1.** What should you do if a Lambda function must access only a specific S3 bucket?

A) Specify only the S3 bucket ARN in the IAM policy of the Lambda execution role  
B) Allow the Lambda function in the S3 bucket policy  
C) Configure S3 in the Lambda console  
D) Specify S3 access permissions with environment variables  

**Answer: A**
Explanation: Grant access permissions only to the specific S3 bucket ARN in the IAM policy of the Lambda execution role. Following the principle of least privilege, specify only the buckets that are needed.

---

**Question 2.** If a Lambda function size exceeds 50 MB, what is the most appropriate solution?

A) Split the Lambda into multiple functions  
B) Use the container image package type (supports up to 10 GB)  
C) Separate the dependencies into a Lambda layer  
D) Migrate to EC2  

**Answer: B**
Explanation: The container image type supports large dependencies with a 10 GB limit. ZIP packages have a 50 MB limit, so choose a container image when large models or complex libraries are needed.

---

**Question 3.** What is the purpose of configuring provisioned concurrency on a Lambda function?

A) Reducing function execution cost  
B) Eliminating cold starts by keeping a set number of instances always ready  
C) Limiting concurrently running functions  
D) Increasing function memory  

**Answer: B**
Explanation: Provisioned concurrency keeps a specified number of concurrent executions always ready (warm). Eliminating cold start latency guarantees consistent, fast responses. It increases cost ($0.015/hour) but is used for latency-sensitive services.

---

**Question 4.** What is the most accurate description of the scope of the IAM policy that CDK `table.grantReadData(getOrder)` synthesizes automatically?

A) All dynamodb:* actions on the table  
B) The table ARN and its GSI/LSI ARNs, the table's KMS key ARN, and the appropriate read actions (GetItem, Query, Scan, and so on)  
C) Global read permission on all DynamoDB tables  
D) Permissions are granted automatically only to the Lambda function and do not apply to other resources  

**Answer: B**
Explanation: The core of CDK grant methods is **expressing intent + precise resource mapping**. It does not simply give actions; it automatically tracks all index ARNs of the table and even the encryption KMS key ARN to build an accurate Resource block. A is too broad (closer to grantFullAccess than grantReadData), C is inaccurate because it is a wildcard, and D is wrong because CDK supports the grant pattern for all resources. Compared with SAM policy templates, the permissions are narrower and more accurate.

---

**Question 5.** Which statement about the differences between Lambda container images and zip packages is NOT accurate?

A) A container image is up to 10 GB, while a zip is 250 MB  
B) Container images cannot use Lambda layers  
C) Container images do not support SnapStart (even for Java, only zip works)  
D) Container images do not support provisioned concurrency  

**Answer: D**
Explanation: D is the incorrect statement. Container image Lambda functions support PC (although PC warm-up takes longer than with zip). A/B/C are all true. The zip limit of 250 MB is measured after decompression, while the container's 10 GB is measured compressed, so the actual usable capacity differs by 30 to 40 times. SnapStart has supported only zip Java since its launch in 2022 and remained unsupported for containers through the end of 2024. Layers are not compatible with container images, so all dependencies must be included in the Dockerfile.

---

**Question 6.** "The team is comfortable with TypeScript, wants to manage Lambda, EKS, RDS, OpenSearch, and SQS in a single stack, reduce IAM permission mistakes, and build an in-house standard library to operate 9,000 stacks." Which IaC tool is the MOST suitable?

A) SAM  
B) Serverless Framework  
C) CDK with TypeScript  
D) Writing CloudFormation YAML directly  

**Answer: C**
Explanation: CDK provides (1) L2 constructs for all AWS resources (SAM covers only 6 serverless types), (2) automatic IAM through `grant*`, (3) reusable abstractions through an **in-house L3 construct library**, and (4) TypeScript type safety. Liberty Mutual's 9,000-stack case is exactly this scenario. SAM is weak at EKS/RDS integration, SLS is Lambda-centric and has the v4 licensing issue, and CFN YAML has no abstraction tools and produces 2,000-line templates.

---

**Question 7.** What does `selfMutation: true` in CDK Pipelines mean?

A) A Lambda function automatically modifies its own code  
B) The pipeline has itself as the first stage, and CDK code changes (adding stages, changing environments, and so on) are automatically reflected in the next execution  
C) DynamoDB Auto Scaling  
D) Automatic IAM role rotation  

**Answer: B**
Explanation: CDK Pipelines declares the pipeline itself as CDK code, following the GitOps philosophy. When selfMutation is on, after Source → Synth, the **UpdatePipeline** stage updates its own definition with CFN. The risk is that pushing a broken pipeline definition can cause self-mutation to deploy a broken pipeline, which can be hard to recover from (keeping break-glass IAM permissions is essential). A/C/D are unrelated.

---

**Question 8.** What is the core mechanism of SnapStart, and what is its scope of application on the exam?

A) Reduces cold starts for all runtimes  
B) Stores a snapshot of the JVM memory from the Java function's init phase in S3 → the next invocation restores it and skips init; supports only zip Java 11/17/21  
C) Automatic Lambda layer caching  
D) Accelerated lazy loading of container images  

**Answer: B**
Explanation: SnapStart (2022 re:Invent) is based on the same idea as Self/Smalltalk image-based persistence. The Java init phase is long and the main culprit of cold starts, so it is solved with a pre-taken snapshot. Because of the uniqueness assumption problem (random seeds, DB connections), explicit re-initialization through runtime hooks is required. Only zip Java (as of the end of 2024); Python/Node/container are not supported. A is too broad, C is unrelated to SnapStart, and D is in the container domain.

---

**Question 9.** What is the biggest change in Serverless Framework v4 that affects the adoption decision?

A) AWS Lambda is no longer supported  
B) Switch from the MIT license to a commercial license — companies with annual revenue of $2 million or more must register and pay  
C) Python support was dropped  
D) Docker images are not supported  

**Answer: B**
Explanation: Announced by Serverless Inc. in February 2023. MIT through v3; from v4, the "Serverless Framework License" (based on Apache 2.0 + commercial use restrictions). It triggered strong backlash on GitHub and a move toward migrating to SAM/CDK. It is the same pattern as Terraform's switch to BSL in August 2023. It is not often tested directly on the exam, but it can appear in scenarios about the decision to adopt SLS. A/C/D are not factual.

---

**Question 10.** What is the most accurate use of CDK Aspects?

A) Automatically inject code into all Lambda functions  
B) Traverse the construct tree with the visitor pattern and apply cross-cutting policies (tagging, enforcing encryption, naming rules)  
C) Automatically generate IAM policies (replacing grant methods)  
D) Manage Lambda layers  

**Answer: B**
Explanation: Aspects are the IaC version of AOP (Aspect-Oriented Programming, Gregor Kiczales, 1997). They separate cross-cutting concerns (tags, security, naming) from the core logic (stack definitions) and express them as a separate visitor. Apply them to the whole app with `cdk.Aspects.of(app).add(new TagAspect())`. A is in the code domain and unrelated, C is the domain of grant methods (Aspects are for validation and tagging), and D is unrelated. SAM has no equivalent mechanism, so external tools (cfn-nag) are used.
