# Day 1 - AWS SAM: CloudFormation's Apology to Serverless

Anyone who has stood up a single Lambda with CloudFormation knows this. To create one function, a set of six types follows in a long line: `AWS::Lambda::Function`, `AWS::IAM::Role`, `AWS::IAM::Policy`, `AWS::Lambda::Permission`, `AWS::Lambda::EventSourceMapping`, and `AWS::ApiGateway::*`. One simple "order lookup API" becomes 200 lines of YAML. The weight of this boilerplate is the background to why it was formally announced at AWS re:Invent 2016 under the name SAM (Serverless Application Model). SAM is not a new IaC tool. It is **a serverless-friendly DSL layered on top of CloudFormation's Transform (macro)**, and at deployment time it is unrolled into plain CloudFormation.

Today we look at why SAM was designed on top of a single line (`Transform:`) of CloudFormation, how far sam local's Docker emulation can actually be trusted, and why sam sync's hotswap is dangerous in production. On the DOP exam, SAM is less often asked about on its own than sandwiched in the middle of "CodePipeline + CodeDeploy + Lambda Canary," so knowing the tool's internal behavior solves 5 to 10 questions at once.

## Why SAM Was Designed as a CloudFormation Macro

The first line of a SAM Template, `Transform: AWS::Serverless-2016-10-31`, is where all the magic begins. In 2016 CloudFormation introduced an extension mechanism called **Transforms**, a step in which a separate Lambda function rewrites the template before it reaches the CFN engine. AWS SAM is an **AWS-managed macro** built on this mechanism; it defines pseudo resource types such as `AWS::Serverless::Function` and then, at deployment time, unrolls them into 6 to 8 real CFN resources.

Why did they use a macro instead of building a new IaC tool? The answer is **reuse of operational assets**. CloudFormation already has 13 years' worth of enterprise features such as Drift Detection, StackSets, Change Sets, and Rollback. Had SAM been a separate engine, all of this would have had to be rebuilt from scratch. Thanks to the macro approach, SAM users are automatically compatible with all of CloudFormation's governance tools (IAM, Service Catalog, Config Rules).

> The inner workings of the Transform macro are triggered at the moment of `aws cloudformation create-change-set --change-set-type CREATE --include-nested-stacks`. The macro Lambda receives the original template (JSON) and returns a new template, and the CFN service computes the ChangeSet from that result. In other words, **`sam deploy` is ultimately a wrapper around `aws cloudformation deploy`**. The only difference is that the SAM CLI has a step where it builds the code with `sam build`, uploads it to S3, and then substitutes `CodeUri` with the S3 URI. If you open a SAM stack in the CloudFormation console, the "Processed template" tab shows the real, unrolled template.

> The macro pattern is the same metaprogramming model as Lisp's hygienic macros (Kohlbecker, 1986) and Scheme's syntax-rules. It is the classic "embedded DSL" approach of layering a domain-specific language (DSL) on a host language (CFN). The same pattern appears in Terraform modules, Pulumi component resources, and Kubernetes CRDs + Operators. The common principle is the declarative programming philosophy that **the user declares intent and the machine unrolls it into low-level resources**.

## Where SAM Sits Among Other IaC Tools

| Tool | Released | Abstraction model | AWS only | Exam weight (DOP) |
|------|------|-------------|-------|-----------------|
| **CloudFormation** | 2011 | Declarative resource graph | ✅ | Very high |
| **SAM** | 2016 | CFN Transform macro (serverless DSL) | ✅ | High |
| **Serverless Framework** | 2015 | Plugins + CFN generation | ❌ (multi-cloud) | Low (v4 commercialization) |
| **CDK** | 2019 | Code → CFN synthesis (Construct tree) | ✅ | Medium (continually rising) |
| **Terraform** | 2014 | HCL + Provider graph | ❌ | Low (almost never asked directly) |
| **Pulumi** | 2018 | Code → its own engine | ❌ | Almost none |

GCP has the flow **Deployment Manager → Config Connector → Terraform**, and on Azure **ARM Template → Bicep** is the macro-based abstraction most similar to SAM. In particular, **Bicep** (2020) is nearly identical in design philosophy to SAM in that it is a friendlier DSL layered on top of ARM JSON. The difference is that Bicep is a general-purpose DSL abstracting all ARM resources, whereas SAM simplifies only the six serverless resources (Function/Api/HttpApi/SimpleTable/StateMachine/LayerVersion).

> 🎯 **Scenario**: "A company operates 50 sets of Lambda + API Gateway + DynamoDB, and its CloudFormation templates have exceeded 2,000 lines. How can it reduce operational burden while keeping the same governance (StackSets, Drift Detection)?" — The answer is **SAM migration**. CDK gives the same effect but adds a TypeScript learning curve, and Terraform loses the CloudFormation governance tools (the equivalents of StackSets and Drift Detection).

## The Core of a SAM Template: Globals and Policy Templates

The two key devices by which SAM cuts boilerplate are `Globals` and `Policies`.

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

`Globals` manages common properties in one place even with 50 functions. If an individual function overrides the same property, the function's value takes precedence. `Policies` are about 60 predefined IAM policy templates that express common permission patterns in a single line.

| Policy Template | Unrolled IAM Actions |
|-----------------|--------------------|
| `DynamoDBReadPolicy` | `dynamodb:GetItem/BatchGetItem/Query/Scan/DescribeTable` on table+index |
| `DynamoDBCrudPolicy` | + `PutItem/UpdateItem/DeleteItem/BatchWriteItem` |
| `S3ReadPolicy` | `s3:GetObject/GetObjectAcl/GetObjectVersion/...` on bucket/* |
| `SQSPollerPolicy` | `sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes/ChangeMessageVisibility` |
| `KMSDecryptPolicy` | `kms:Decrypt` on specific key |
| `LambdaInvokePolicy` | `lambda:InvokeFunction` on specific function |
| `SSMParameterReadPolicy` | `ssm:GetParameter*/DescribeParameters` |
| `VPCAccessPolicy` | ENI creation/deletion + DescribeNetworkInterfaces (for VPC functions) |

> ⚠️ **Pitfall**: Policy Templates look like **least privilege** but actually are not. `DynamoDBReadPolicy: TableName` grants permissions on the table resource plus **all GSIs/LSIs**. In PCI/HIPAA environments, it is safer to specify the exact ARNs directly with a `Policies: - Statement:` block. AWS publishes the actual IAM JSON of every template in the [official GitHub](https://github.com/aws/serverless-application-model/blob/master/samtranslator/policy_templates_data/policy_templates.json), so it is worth reading once before adopting them.

## sam local: The Truth About Docker-Based Emulation

`sam local invoke` and `sam local start-api` are the features that form a developer's first impression. Internally, they pull the `public.ecr.aws/lambda/<runtime>:latest` image and run it as a container, and inside the container the Lambda Runtime Interface Emulator (RIE) invokes the function.

```bash
# Single invocation
sam local invoke GetOrderFn -e events/get-order.json

# API Gateway emulation (port 3000)
sam local start-api --port 3000 --warm-containers EAGER

# Other functions can call the RIE endpoint (change the SDK URL endpoint)
sam local start-lambda --port 3001
```

RIE is an HTTP server that mimics the real Lambda service's **Lambda Runtime API** (`/2018-06-01/runtime/invocation/next`) exactly. So the same code behaves identically locally and in the cloud, but there are **inherent limits to the emulation**.

| What is not emulated | Impact |
|---------------------------|------|
| **Cold start time** | Locally the Docker container is reused. The init cost of real Lambda cannot be measured |
| **IAM permissions** | Locally the host's AWS credentials are used — deny policies of the IAM Role cannot be verified |
| **Network throttling** | The ENI/VPC latency of real Lambda cannot be reproduced |
| **CPU ratio** | Lambda allocates CPU/network in proportion to MemorySize, while locally it draws from the host CPU pool |
| **Lambda Insights / X-Ray** | Some metadata is absent |
| **Extension Layer** | Works locally too, but some lifecycle events differ |

> The Lambda Runtime API is long-poll based. The function runtime calls `GET /next` and waits indefinitely; when a new invocation arrives, the payload + requestId come down as the response. When the function finishes processing and returns the result with `POST /response` or `POST /error`, it goes on to the next long-poll cycle. Thanks to this model, one container can process multiple invocations sequentially (reuse), which makes **execution context reuse** (container variables, DB connection pools) possible. SAM Local reproduces this exact API, so code compatibility is guaranteed.

> In 2020, a fintech passed all its tests with `sam local invoke` and then deployed to production, and Lambda was throttled immediately. The cause was that the function connected to an **RDS Proxy inside a VPC**, ENI creation took 8 to 10 seconds, and the API Gateway 30-second timeout kicked in. Locally the host network is used as is, so this latency did not exist. Lesson: local tests are for verifying logic, and **integration tests must be in a dev/staging cloud environment**.

## sam sync and hotswap: A Dangerous Shortcut for Faster Development

`sam sync --watch`, added in SAM CLI 1.31 in 2021, is a game changer for development speed.

```bash
sam sync --watch --stack-name myapp-dev
# Watch for file changes
# Code change → direct S3 upload + lambda update-function-code (bypasses CFN, 5-10 seconds)
# Infrastructure change → CloudFormation Change Set (normal 30-60 seconds)
```

Internally, sam sync classifies changes into two kinds.

- **Code-only change**: Lambda function code, Layer contents, Step Functions definitions, API Gateway OpenAPI specs → patched directly with `boto3.client('lambda').update_function_code()` and the like
- **Infrastructure change**: new resources, environment variables, IAM policies → the normal CFN path

CDK offers the same concept as `cdk deploy --hotswap`. Both tools are **not recommended for production because CloudFormation's tracking disappears**.

> ⚠️ **Pitfall**: Hotswapped resources go into **drift state** from CloudFormation's perspective. That is, the next `sam deploy` or `cdk deploy` overwrites the hotswapped changes. Moreover, core infrastructure such as IAM Roles and API Gateway routing cannot be hotswapped, so security policy changes must still proceed through a ChangeSet. In production pipelines, it is safer to put explicit protection in place, such as `sam deploy --no-disable-rollback`.

## SAM Pipelines: A CodePipeline Auto-Generator

```bash
sam pipeline bootstrap   # Create per-environment (dev/staging/prod) IAM Roles, S3, ECR
sam pipeline init         # Choose a template (CodePipeline / Jenkins / GitLab / GitHub Actions)
```

The resources that bootstrap creates are a set of four.

1. **Pipeline execution role** (assumed by CodePipeline)
2. **CloudFormation execution role** (assumed by CFN when creating resources)
3. **Artifact S3 bucket** (stores CodeBuild outputs)
4. **ECR repo** (for container-image Lambdas)

These resources are created separately in **each environment's own AWS account** (multi-account is recommended). So the prod account has only prod-bootstrap resources and the dev account only dev-bootstrap, giving clean isolation.

```toml
# samconfig.toml — multi-environment
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

> Per-environment resource isolation connects to the "namespace isolation" principle of NIST SP 800-204C (Cloud-Native Application security). It puts guardrails in place so that permissions cannot move laterally from one environment to another. "Separate workloads using accounts" in the Security Pillar of the AWS Well-Architected Framework is the recommendation of this principle.

## DeploymentPreference: Canary/Linear/AllAtOnce

The magic by which SAM connects CodeDeploy in a single line.

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
2. The `live` Alias shifts from V6 to V7 (stepwise by CodeDeploy)
3. Alarms are monitored at each stage, and a rollback occurs immediately if one fires

| Type | Traffic progression |
|------|-------------|
| `Canary10Percent5Minutes` | 10% → wait 5 minutes → 100% |
| `Canary10Percent30Minutes` | 10% → 30 minutes → 100% |
| `Linear10PercentEvery1Minute` | Increase by 10% at 1-minute intervals |
| `Linear10PercentEvery10Minutes` | Increase by 10% at 10-minute intervals |
| `AllAtOnce` | 100% immediately (for test/dev) |

> 🎯 **Scenario**: "When deploying a new Lambda version, send only 10% of traffic for 1 hour, then raise it to 100% automatically, and roll back automatically if 5xx errors exceed 1%." The answer is the combination of `Canary10Percent30Minutes` + CloudWatch Alarm + Pre/Post Hook. Linear is gradual increase, Canary is two stages, and AllAtOnce is immediate — catch the "stage" keyword in the scenario.

## The buildspec That Actually Runs SAM in CodePipeline

```yaml
# buildspec.yml — CodeBuild stage
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

Pass packaged.yaml in CodePipeline to the next Deploy Action (CloudFormation deploy) and you are done. The two flags of `sam build --use-container --cached` matter: `--use-container` builds in a container identical to the Lambda runtime to guarantee compatibility of native dependencies (C extensions, sharp, and so on), and `--cached` reuses unchanged dependencies to cut build time by more than half.

> In 2022, a SaaS team uploaded a Lambda zip built with `sam build` on a local macOS machine straight to prod, and the function died with `Runtime.ImportModuleError: pyodbc.so glibc version mismatch`. The cause was that macOS's ODBC library is incompatible with Linux glibc. The single line `--use-container` prevents a one-hour incident.

## Summary

Today's picture has three parts. First, SAM is a **serverless DSL layered on a CloudFormation Macro** and is unrolled into plain CFN at deployment time. So you can use CFN's 13 years of governance assets (StackSets, Drift, ChangeSet) as they are. Second, `sam local` reproduces the Lambda Runtime API exactly with Docker + RIE, but **cold starts, IAM, and network latency are not emulated**. Third, `sam sync --watch` and `cdk deploy --hotswap` are powerful for accelerating development but break CloudFormation's tracking, so they are forbidden in production.

In the next post we look at the alternatives to SAM, **Serverless Framework** and **CDK Lambda**. Which of the three tools to choose is determined by the nature of the workload, the team's language, and governance requirements.

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
