# Day 1 - AWS SAM: CloudFormation's Apology to Serverless

Anyone who has launched a single Lambda with CloudFormation knows this. To create one function, a set of 6 resource types follows in a row: `AWS::Lambda::Function`, `AWS::IAM::Role`, `AWS::IAM::Policy`, `AWS::Lambda::Permission`, `AWS::Lambda::EventSourceMapping`, and `AWS::ApiGateway::*`. A simple "order lookup API" becomes 200 lines of YAML. The weight of this boilerplate is the background of SAM (Serverless Application Model), officially announced at AWS re:Invent 2016. SAM is not a new IaC tool. It is **a serverless-friendly DSL layered on top of CloudFormation's Transform (macro) mechanism**, and at deployment time it is expanded into plain CloudFormation.

Today we look at why SAM was designed on top of a single CloudFormation line (`Transform:`), how far sam local's Docker emulation can actually be trusted, and why sam sync's hotswap is dangerous in production. On the DOP exam, SAM is rarely asked on its own; it is wedged in the middle of "CodePipeline + CodeDeploy + Lambda Canary," so knowing the tool's internal behavior solves 5-10 questions at once.

## Why SAM Was Designed as a CloudFormation Macro

The first line of a SAM Template, `Transform: AWS::Serverless-2016-10-31`, is where all the magic begins. In 2016 CloudFormation introduced an extension mechanism called **Transforms**, a step in which a separate Lambda function rewrites the template before it reaches the CFN engine. AWS SAM is an **AWS-managed macro** built on this mechanism; it defines fake resource types like `AWS::Serverless::Function` and then expands them into 6-8 real CFN resources at deployment time.

Why a macro instead of building a new IaC tool? The answer is **reusing operational assets**. CloudFormation already has 13 years' worth of enterprise features like Drift Detection, StackSets, Change Sets, and Rollback. If SAM had been a separate engine, it would have had to rebuild all of that from scratch. Thanks to the macro approach, SAM users are automatically compatible with all of CloudFormation's governance tools (IAM, Service Catalog, Config Rules).

> The internal behavior of the Transform macro is triggered at `aws cloudformation create-change-set --change-set-type CREATE --include-nested-stacks`. The macro Lambda receives the original template (JSON) and returns a new template, and the CFN service computes the ChangeSet from that result. In other words, **`sam deploy` is ultimately a wrapper around `aws cloudformation deploy`**. The only difference is that the SAM CLI has steps where `sam build` builds the code, uploads it to S3, and then replaces `CodeUri` with the S3 URI. If you open a SAM stack in the CloudFormation console, the "Processed template" tab shows the expanded real template.

> The macro pattern is the same metaprogramming model as Lisp's hygienic macros (Kohlbecker, 1986) and Scheme's syntax-rules. It is the classic "embedded DSL" approach of layering a domain-specific language (DSL) on top of a host language (CFN). The same pattern appears in Terraform modules, Pulumi component resources, and Kubernetes CRDs + Operators. The common principle is the declarative programming philosophy: **the user declares intent, and the machine expands it into low-level resources**.

## Where SAM Sits Among Other IaC Tools

| Tool | Released | Abstraction model | AWS only | Exam weight (DOP) |
|------|------|-------------|-------|-----------------|
| **CloudFormation** | 2011 | Declarative resource graph | ✅ | Very high |
| **SAM** | 2016 | CFN Transform macro (serverless DSL) | ✅ | High |
| **Serverless Framework** | 2015 | Plugins + CFN generation | ❌ (multi-cloud) | Low (v4 commercialization) |
| **CDK** | 2019 | Code → CFN synthesis (Construct tree) | ✅ | Medium (keeps rising) |
| **Terraform** | 2014 | HCL + Provider graph | ❌ | Low (almost never tested directly) |
| **Pulumi** | 2018 | Code → its own engine | ❌ | Almost none |

GCP has the **Deployment Manager → Config Connector → Terraform** progression, and in Azure, **ARM Template → Bicep** is the macro-based abstraction most similar to SAM. In particular, **Bicep** (2020) is a friendlier DSL layered on top of ARM JSON, so its design philosophy is almost identical to SAM's. The difference is that Bicep is a general-purpose DSL abstracting all ARM resources, whereas SAM simplifies only 6 serverless resource types (Function/Api/HttpApi/SimpleTable/StateMachine/LayerVersion).

> 🎯 **Scenario**: "A company runs 50 Lambda + API Gateway + DynamoDB setups, and the CloudFormation templates have exceeded 2,000 lines. How can it reduce the operational burden while keeping the same governance (StackSets, Drift Detection)?" - The answer is **SAM migration**. CDK gives the same effect but adds a TypeScript learning curve, and Terraform loses CloudFormation's governance tools (the equivalents of StackSets and Drift Detection).

## The Body of a SAM Template: Globals and Policy Templates

The two key devices SAM uses to cut boilerplate are `Globals` and `Policies`.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.12
    Architectures: [arm64]
    Timeout: 30
    MemorySize: 512
    Tracing: Active
    Environment:
      Variables:
        LOG_LEVEL: INFO
        POWERTOOLS_SERVICE_NAME: orders

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
        - SSMParameterReadPolicy:
            ParameterName: !Sub '/${Env}/orders/*'

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
```

`Globals` manages common properties in one place even when there are 50 functions. If an individual function overrides the same property, the function's value wins. `Policies` are about 60 predefined IAM policy templates that express common permission patterns in a single line.

| Policy Template | Expanded IAM Actions |
|-----------------|--------------------|
| `DynamoDBReadPolicy` | `dynamodb:GetItem/BatchGetItem/Query/Scan/DescribeTable` on table+index |
| `DynamoDBCrudPolicy` | + `PutItem/UpdateItem/DeleteItem/BatchWriteItem` |
| `S3ReadPolicy` | `s3:GetObject/GetObjectAcl/GetObjectVersion/...` on bucket/* |
| `SQSPollerPolicy` | `sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes/ChangeMessageVisibility` |
| `KMSDecryptPolicy` | `kms:Decrypt` on specific key |
| `LambdaInvokePolicy` | `lambda:InvokeFunction` on specific function |
| `SSMParameterReadPolicy` | `ssm:GetParameter*/DescribeParameters` |
| `VPCAccessPolicy` | ENI create/delete + DescribeNetworkInterfaces (for VPC functions) |

> ⚠️ **Pitfall**: Policy Templates look like **least privilege** but actually are not. `DynamoDBReadPolicy: TableName` grants permissions to the table resource plus **all GSIs/LSIs**. In PCI/HIPAA environments it is safer to specify exact ARNs directly with a `Policies: - Statement:` block. AWS publishes the actual IAM JSON of every template on the [official GitHub](https://github.com/aws/serverless-application-model/blob/master/samtranslator/policy_templates_data/policy_templates.json), so it is worth reading once before adoption.

## sam local: The Truth About Docker-Based Emulation

`sam local invoke` and `sam local start-api` are the features that create a developer's first impression. Internally, they pull the `public.ecr.aws/lambda/<runtime>:latest` image and run it as a container, and inside the container the Lambda Runtime Interface Emulator (RIE) invokes the function.

```bash
# Single invocation
sam local invoke GetOrderFn -e events/get-order.json

# API Gateway emulation (port 3000)
sam local start-api --port 3000 --warm-containers EAGER

# Other functions can call the RIE endpoint (change the SDK URL endpoint)
sam local start-lambda --port 3001
```

RIE is an HTTP server that faithfully imitates the real Lambda service's **Lambda Runtime API** (`/2018-06-01/runtime/invocation/next`). So the same code behaves identically locally and in the cloud, but there are **inherent limits to emulation**.

| What is not emulated | Impact |
|---------------------------|------|
| **Cold start time** | Local reuses the Docker container. You cannot measure the real Lambda's init cost |
| **IAM permissions** | Local uses the host's AWS credentials - you cannot verify the IAM Role's deny policies |
| **Network throttling** | Cannot reproduce the real Lambda's ENI/VPC latency |
| **CPU ratio** | Lambda allocates CPU/network proportional to MemorySize; local uses the host CPU pool |
| **Lambda Insights / X-Ray** | Some metadata is absent |
| **Extension Layer** | Works locally too, but some lifecycle events differ |

> The Lambda Runtime API is a long-poll model. The function runtime calls `GET /next` and waits indefinitely; when a new invocation arrives, the payload + requestId come down as the response. After the function finishes processing and returns the result via `POST /response` or `POST /error`, it moves to the next long-poll cycle. Thanks to this model, one container can process several invocations sequentially (reuse), which makes **execution context reuse** (container variables, DB connection pools) possible. SAM Local reproduces this exact API, so code compatibility is guaranteed.

> In 2020 a fintech passed all its tests with `sam local invoke`, then deployed to production, and Lambda was throttled immediately. The cause was that the function connected to an **RDS Proxy inside a VPC**, so ENI creation took 8-10 seconds and the API Gateway 30-second timeout fired. Local uses the host network as is, so this latency didn't exist. Lesson: local testing is for logic verification, and **integration tests must run in a dev/staging cloud environment**.

## sam sync and hotswap: A Dangerous Shortcut for Development Speed

`sam sync --watch`, added in SAM CLI 1.31 in 2021, is a game changer for development speed.

```bash
sam sync --watch --stack-name myapp-dev
# Watches for file changes
# Code change → direct S3 upload + lambda update-function-code (bypasses CFN, 5-10 seconds)
# Infrastructure change → CloudFormation Change Set (normal 30-60 seconds)
```

Internally, sam sync classifies changes into two kinds.

- **Code-only change**: Lambda function code, Layer contents, Step Functions definitions, API Gateway OpenAPI specs → patched directly with `boto3.client('lambda').update_function_code()` and the like
- **Infrastructure change**: new resources, environment variables, IAM policies → the normal CFN path

CDK offers the same concept with `cdk deploy --hotswap`. With both tools, **CloudFormation's tracking disappears, so they are not recommended for production**.

> ⚠️ **Pitfall**: A hotswapped resource is in a **drift state** from CloudFormation's point of view. That is, the next `sam deploy` or `cdk deploy` overwrites the hotswapped change. Moreover, core infrastructure such as IAM Roles and API Gateway routing cannot be hotswapped, so security policy changes must still go through a ChangeSet. In production pipelines, it is safer to put explicit protection in place, such as `sam deploy --no-disable-rollback`.

## SAM Pipelines: A CodePipeline Auto-Generator

```bash
sam pipeline bootstrap   # Creates per-environment (dev/staging/prod) IAM Roles, S3, ECR
sam pipeline init         # Choose a template (CodePipeline / Jenkins / GitLab / GitHub Actions)
```

The resources bootstrap creates are a set of four.

1. **Pipeline execution role** (assumed by CodePipeline)
2. **CloudFormation execution role** (assumed by CFN when creating resources)
3. **Artifact S3 bucket** (stores CodeBuild outputs)
4. **ECR repo** (for container image Lambda)

These resources are created separately in **each environment's own AWS account** (multi-account recommended). So the prod account has only prod-bootstrap resources and the dev account has only dev-bootstrap, giving clean isolation.

```toml
# samconfig.toml - multi-environment
version = 0.1

[staging.deploy.parameters]
stack_name = "myapp-staging"
s3_bucket = "myapp-staging-artifacts"
region = "ap-northeast-2"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Environment=staging UserPoolId=..."

[prod.deploy.parameters]
stack_name = "myapp-prod"
s3_bucket = "myapp-prod-artifacts"
region = "ap-northeast-2"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Environment=prod UserPoolId=..."
confirm_changeset = true
```

> Per-environment resource isolation connects to the "namespace isolation" principle of NIST SP 800-204C (Cloud-Native Application Security). It puts guardrails in place so permissions cannot move laterally from one environment to another. "Separate workloads using accounts" in the Security Pillar of the AWS Well-Architected Framework is the recommendation of this principle.

## DeploymentPreference: Canary/Linear/AllAtOnce

The magic by which SAM connects CodeDeploy in one line.

```yaml
GetOrderFn:
  Type: AWS::Serverless::Function
  Properties:
    AutoPublishAlias: live
    DeploymentPreference:
      Type: Canary10Percent5Minutes
      PreTraffic: !Ref PreTrafficHook
      PostTraffic: !Ref PostTrafficHook
      Alarms:
        - !Ref ErrorRateAlarm
        - !Ref P99LatencyAlarm
```

When `AutoPublishAlias: live` is on, the following happens automatically at `sam deploy`.

1. Function code change detected → a new Version is published (e.g., V7)
2. The `live` Alias shifts from V6→V7 (CodeDeploy does it in stages)
3. Alarms are monitored at each stage, and if triggered, an immediate rollback occurs

| Type | Traffic progression |
|------|-------------|
| `Canary10Percent5Minutes` | 10% → wait 5 min → 100% |
| `Canary10Percent30Minutes` | 10% → 30 min → 100% |
| `Linear10PercentEvery1Minute` | Increases 10% at 1-minute intervals |
| `Linear10PercentEvery10Minutes` | 10% at 10-minute intervals |
| `AllAtOnce` | 100% immediately (for test/dev) |

> 🎯 **Scenario**: "When deploying a new Lambda version, send only 10% of traffic for 1 hour, then automatically raise it to 100%, and automatically roll back if 5xx errors exceed 1%." The answer is the combination of `Canary10Percent30Minutes` + CloudWatch Alarm + Pre/Post Hooks. Linear is gradual increase, Canary is two stages, AllAtOnce is immediate - catch the "stages" keyword in the scenario.

## The buildspec That Actually Runs SAM in CodePipeline

```yaml
# buildspec.yml - CodeBuild stage
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.12
    commands:
      - pip install aws-sam-cli
  build:
    commands:
      - sam build --use-container --cached
      - sam package --output-template-file packaged.yaml --s3-bucket $ARTIFACT_BUCKET
artifacts:
  files:
    - packaged.yaml
    - samconfig.toml
```

Pass packaged.yaml in CodePipeline to the next Deploy Action (CloudFormation deploy) and you're done. The two flags of `sam build --use-container --cached` matter: `--use-container` builds in the same container as the Lambda runtime to guarantee compatibility of native dependencies (C extensions, sharp, etc.), and `--cached` reuses dependencies when they haven't changed, cutting build time by more than half.

> In 2022 a SaaS team uploaded a Lambda zip built with `sam build` on a local macOS machine straight to prod, and the function died with `Runtime.ImportModuleError: pyodbc.so glibc version mismatch`. The cause was that macOS's ODBC library is incompatible with Linux glibc. The single `--use-container` flag prevents an hour-long incident.

## Summary

Today's picture has three parts. First, SAM is a **serverless DSL layered on a CloudFormation Macro**, expanded into plain CFN at deployment time. That is why you can use CFN's 13 years of governance assets (StackSets, Drift, ChangeSet) as is. Second, `sam local` reproduces the Lambda Runtime API accurately with Docker + RIE, but **cold start, IAM, and network latency are not emulated**. Third, `sam sync --watch` and `cdk deploy --hotswap` are powerful for development speed but break CloudFormation's tracking, so they are forbidden in production.

In the next article we look at the alternatives to SAM: **Serverless Framework** and **CDK Lambda**. The criteria for choosing among the three are decided by workload nature, team language, and governance requirements.

---

## 📝 Practice Questions

**Question 1.** What is the actual behavior of the first line of a SAM Template, `Transform: AWS::Serverless-2016-10-31`?

A) Expands SAM pseudo-resources into CFN native resources via a CloudFormation Macro
B) Converts Lambda code to Python
C) Automatically creates an IAM Role at deployment
D) Triggers sam build

**Answer: A**
Explanation: Transform is the CloudFormation macro mechanism (2016), where a separate Lambda macro rewrites the template before it reaches the CFN engine. `AWS::Serverless::Function` is expanded after macro processing into 6-8 real resources such as `AWS::Lambda::Function` + `AWS::IAM::Role` + `AWS::Lambda::Permission`. B is unrelated to code conversion, C is just one result of macro processing and not the role of the macro itself, and D is a separate step of the sam CLI. You can check the expanded result in the CFN console's "Processed template" tab.

---

**Question 2.** What is the riskiest area that `sam local invoke` does not verify?

A) Normal input handling of the function logic
B) The IAM Role's deny policies + real VPC ENI creation latency
C) JSON parsing errors
D) Environment variable loading

**Answer: B**
Explanation: SAM Local uses the host's AWS credentials as is, so the IAM Role's permission boundary cannot be verified. Also, network latency such as VPC ENI creation (8-10 seconds), RDS Proxy connection, and security group egress rules doesn't exist locally. As in the 2020 fintech case, this is the classic scenario of passing locally and dying from timeouts in prod. A/C/D can all be verified locally. Lesson: local is for logic, integration is for the dev cloud.

---

**Question 3.** How would you configure SAM so that a new Lambda version receives only 10% of traffic for 30 minutes and is rolled back immediately if a 5xx alarm fires?

A) `DeploymentPreference: AllAtOnce` + Alarm
B) `DeploymentPreference: Linear10PercentEvery10Minutes` + Alarm
C) `DeploymentPreference: Canary10Percent30Minutes` + CloudWatch Alarm attached
D) sam sync --watch

**Answer: C**
Explanation: The Canary pattern is two stages: "first N% → wait a set time → 100%." Canary10Percent30Minutes runs at 10% for 30 minutes and then jumps to 100%. Linear (B) is multi-stage, continuously increasing 10% at 1/10-minute intervals, so its meaning differs from the scenario's "10% for 30 minutes then 100%." AllAtOnce (A) is 100% immediately. sam sync (D) is for development speed-up and has nothing to do with traffic shifting. When an Alarm is attached, CodeDeploy automatically rolls back to the previous Version the moment it fires.

---

**Question 4.** What is the benefit that the two flags of `sam build --use-container --cached` provide together?

A) Building in the Lambda runtime container guarantees native dependency compatibility + reusing unchanged dependencies shortens build time
B) Cost savings
C) Automatic IAM permission grants
D) Automatic Canary activation

**Answer: A**
Explanation: A common problem is Python `.so` files built on macOS/Windows being incompatible with Lambda's Linux glibc (the 2022 SaaS case). `--use-container` solves this by building in the same container image as the Lambda runtime. `--cached` reuses the dependency layer if requirements haven't changed. Build time is cut to 1/2-1/3. B/C/D are unrelated.

---

**Question 5.** What is the biggest reason not to use `sam sync --watch` in production?

A) It costs more
B) It bypasses CloudFormation's tracking, causing drift, and the next sam deploy overwrites the changes
C) The Korea Region is not supported
D) Java functions are not supported

**Answer: B**
Explanation: sam sync patches code changes directly with the `update-function-code` API, so the CFN stack's state and reality diverge (drift). The next regular sam deploy overwrites the changes based on the CFN state, and the hotswap changes disappear. Also, since no ChangeSet is created, change history and approval workflows are neutralized. It is explicitly a development speed-up tool, and the standard for production is the regular sam deploy + CodeDeploy combination.

---

**Question 6.** What is the most accurate limitation of SAM Policy Templates?

A) Additional cost is charged
B) `DynamoDBReadPolicy: TableName` includes permissions to all GSIs/LSIs of that table - it may not be true least privilege
C) IAM policy evaluation becomes slow
D) Conflicts with Lambda Layers

**Answer: B**
Explanation: Policy Templates reduce boilerplate, but their permission scope can be broader than hand-written IAM JSON. AWS publishes the expanded IAM JSON of every template on the official GitHub, so in PCI/HIPAA environments a review is needed before adoption. If exact least privilege is required, write it directly with a `Policies: - Statement: - Effect: Allow, Action: [...], Resource: [...]` block. A/C/D are all unrelated.

---

**Question 7.** What resources does `sam pipeline bootstrap` of SAM Pipelines create in each environment's account?

A) Lambda function + DynamoDB table
B) Pipeline execution role + CFN execution role + Artifact S3 + (optional) ECR repo
C) VPC + Subnet + NAT Gateway
D) Cognito User Pool

**Answer: B**
Explanation: bootstrap creates only the CI/CD infrastructure (permissions + artifact storage). The set of four is isolated in each environment's account, so a dev pipeline cannot access prod account resources (the namespace isolation principle of NIST SP 800-204C). Application resources (Lambda, Dynamo) are created afterward with sam deploy. A/C/D are in the application domain and unrelated to bootstrap.

---

## 📌 Today's Summary

The core of SAM we covered today is five things: (1) it works as a CloudFormation Transform Macro, reusing CFN governance assets, (2) Globals and Policy Templates remove boilerplate, (3) sam local's RIE-based emulation is for logic verification and is not a substitute for integration tests, (4) sam sync hotswap is for development speed-up and carries drift risk in prod, and (5) DeploymentPreference + AutoPublishAlias enable CodeDeploy Canary in one line.
