# Day 3 - SAM: Compressing CloudFormation for Serverless

To properly deploy a single Lambda function with CloudFormation, you need more than you'd expect. It's not just `AWS::Lambda::Function` — you need permission to invoke it (`AWS::Lambda::Permission`), an execution role (`AWS::IAM::Role`), and if API Gateway, you get RestApi, Resource, Method, Deployment, Stage all trailing along. You end up with 50-100 lines of boilerplate just for one function. Serverless's core is "small functions fast," yet the overhead of declaring that function is huge. **AWS SAM (Serverless Application Model)** directly addresses this — providing shorthand syntax specialized for serverless, then "expanding" it into complete CloudFormation at deploy time.

In DVA-C02, SAM is a frequent exam topic in Deployment domain. Simple memorization (Transform declaration mandatory, Policy Templates names) appears, but "what's SAM's relationship to CloudFormation," "what does sam local simulate and what can't it," and "why are Policy Templates safe" are more important. This article digs deep into: how SAM sits on CloudFormation as a macro, what Docker simulation `sam local` provides, how Policy Templates connect to least privilege, and what tradeoffs SAM's deployment acceleration features make.

## SAM's Identity: CloudFormation Macro

It's easy to misunderstand SAM as "a service separate from CloudFormation," but **SAM is an extension of CloudFormation (a macro)**. There's no separate deploy engine — CloudFormation takes the SAM template, transforms it into regular CloudFormation resources, then deploys. The single line that triggers this transformation is `Transform: AWS::Serverless-2016-10-31` at the template's top. With this, CloudFormation knows "this template has SAM shorthand, expand it and process."

Because `AWS::Serverless::Function` gets expanded at deploy time into Lambda function + execution role + event source + invocation permission, SAM is essentially "shorthand for commonly-used serverless combinations." Why this matters for exams: "what SAM can't do falls back to CloudFormation" — you can freely mix regular CloudFormation resources (`AWS::S3::Bucket` etc) into a SAM template. SAM doesn't replace CloudFormation; it's a convenience layer on top.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31   # This one line turns on SAM

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    Environment:
      Variables:
        TABLE_NAME: !Ref OrdersTable

Resources:
  CreateOrderFunction:
    Type: AWS::Serverless::Function       # Expands to Lambda+Role+Permission at deploy
    Properties:
      Handler: src/handlers/create_order.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref OrdersTable
      Events:
        CreateOrder:
          Type: Api
          Properties: { Path: /orders, Method: POST }

  OrdersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      PrimaryKey: { Name: orderId, Type: String }
```

| SAM Resource | Expands to CloudFormation |
|------------|--------------------------|
| `AWS::Serverless::Function` | Lambda Function + IAM Role + EventSource + Permissions |
| `AWS::Serverless::Api` | API Gateway RestApi + Deployment + Stage + Methods |
| `AWS::Serverless::HttpApi` | API Gateway V2 (HTTP API) |
| `AWS::Serverless::SimpleTable` | DynamoDB Table |
| `AWS::Serverless::StateMachine` | Step Functions |
| `AWS::Serverless::LayerVersion` | Lambda Layer |

> 💡 **Related theory**: SAM is implemented as CloudFormation **macro** mechanism. Macros are "hooks to programmatically transform templates before deploy" — exactly like compiler macros that expand code before compilation. Just as C's `#define` expands text at compile time, SAM's `Transform` expands short serverless resources into verbose CloudFormation before deploy. Because SAM is "preprocessor-as-macro," it inherits all CloudFormation features (rollback, dependency graphs, Change Set) without reinventing deployment. Clever design: layer on top without reinventing the wheel.

> ⚠️ **Trap**: Without `Transform: AWS::Serverless-2016-10-31` declaration, CloudFormation treats `AWS::Serverless::Function` as an "unknown resource type" and fails. On exams, "SAM template won't deploy / resource type unrecognized" = missing Transform as suspect #1. The date (2016-10-31) is a fixed identifier that doesn't change.

## Policy Templates: Shorthand for Least Privilege

Writing IAM roles for serverless by hand is painful and risky. Tempted to skip and slap `AdministratorAccess` or `dynamodb:*`? That breaks least privilege. Writing correctly means listing action names (`dynamodb:PutItem`, `GetItem`, `Query`...) and resource ARNs one by one. SAM's **Policy Templates** hit the middle ground — "this function needs CRUD on that table" in one line, and SAM expands it into **precise least-privilege IAM policy**.

```yaml
Policies:
  - DynamoDBCrudPolicy:        # That table only, CRUD actions only
      TableName: !Ref OrdersTable
  - S3ReadPolicy:              # That bucket read-only
      BucketName: !Ref MyBucket
  - SQSPollerPolicy:           # That queue polling permission only
      QueueName: !GetAtt MyQueue.QueueName
```

The key is Policy Template **narrows resource scope**. `DynamoDBCrudPolicy` is not `dynamodb:*` — it's only CRUD actions, and only on the specified table ARN. Declare intent, least privilege follows automatically.

> 💡 **Related theory**: Policy Templates embody security's **"secure by default"** philosophy. Design so developers taking the easiest path stay secure — using `DynamoDBCrudPolicy: { TableName: ... }` is shorter than writing `dynamodb:*` by hand, so developers naturally drift toward least privilege. Security becomes "the easiest default path" not "extra effort." Same principle lives in SAM Connector (2023) — linking two resources auto-generates needed IAM policy, removing the temptation to overly-widen permissions.

> 🔍 **Going deeper**: Policy Templates pick from a predefined list (about 100 options). If needed permission isn't there, write inline policy (`Statement`) directly or reference a managed policy ARN. And one function can mix Policy Templates with inline policies — SAM collects them all and builds that function's dedicated IAM role. That means each function gets its own role by default, naturally isolating permissions between functions.

## sam local: What Does Docker Simulate

`sam local` is powerful — "run Lambda on my laptop without AWS deploy." But knowing exactly what it simulates and what it doesn't prevents exam traps. Core: **`sam local` uses Docker containers to recreate the Lambda execution environment** — it spins up the Amazon Linux-based runtime image that Lambda actually uses, executes your function code inside it. So **Docker must be installed**.

```bash
sam build                                    # Install deps + package
sam local invoke CreateOrderFunction \
    --event events/create_order.json         # Run single function once with event
sam local start-api --port 3000              # Mimic local API Gateway, http://localhost:3000
sam logs -n CreateOrderFunction --tail       # Tail CloudWatch logs of deployed function
```

Important limits: `sam local` simulates **only the Lambda execution environment locally; other AWS services like DynamoDB, S3, SQS reach real AWS resources** (or you spin up local emulators separately). So locally running a function that writes to DynamoDB writes to real cloud DynamoDB. Not "completely offline" but "function execution local, backends real."

> ⚠️ **Trap**: "sam local isn't working" most often means Docker is uninstalled or not running. Also "works locally, fails on deploy" usually means permission difference — local runs under your developer credentials (broad), but deployed function uses its execution role (narrow from Policy Templates). What worked locally with broad permissions fails deployed with narrow permissions. "Local works, deploy fails = permission diff."

## Globals: Reducing Repetition with Shared Config

Serverless apps quickly scale to dozens of functions, all sharing runtime, timeout, environment. Repeating same settings per-function violates DRY. **Globals** section declares base defaults for Function, Api, HttpApi, SimpleTable all at once.

```yaml
Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables: { LOG_LEVEL: INFO }
  Api:
    Cors: "'*'"
```

Specifying the same property again in individual resources **overrides (redefines)** Globals — most functions use default 30-second timeout, but one heavy function individually gets 300 seconds.

> 💡 **Related theory**: Globals's override rules mirror CSS cascading or config file hierarchical merge — "broader default, narrower override." But merge subtlety exists: scalars (Timeout) fully replace with individual value, but maps (environment vars) merge per-key (Globals's `LOG_LEVEL` and individual function's new var combine). This "scalars replace, maps merge" rule is shared by almost all hierarchical config systems.

## Deployment Acceleration: sam sync and Its Tradeoffs

SAM CLI offers deployment speed features, each with tradeoffs you must know for exams.

| Command/Feature | What it does | Tradeoff |
|-----------|---------|-----------|
| `sam deploy --guided` | First deploy with wizard, save to `samconfig.toml` | Later `sam deploy` alone works |
| `sam deploy` | Full CloudFormation stack deploy (safe) | Slow (CFN change set processing) |
| `sam sync --watch` | On code change, update Lambda code instantly | Fast but bypasses CFN state → **dev-only** |
| `sam pipeline init` | Generate CI/CD pipeline skeleton (CodePipeline/GitHub Actions) | — |

Core: **what does `sam sync` give up for speed?** `sam sync` skips CloudFormation when code-only changes, directly updating Lambda code in seconds. Fast, but this way **CloudFormation's view of stack state and actual function diverge**. So `sam sync` is dev-iteration fast-loop, never production. Production deploy must go through full `sam deploy` (whole CloudFormation path).

> 📚 **Case study**: SAM's safe deployment pairs CodeDeploy with **Canary/Linear deploy** automation. New Lambda version doesn't get 100% traffic at once — maybe `Canary10Percent5Minutes` sends 10% for 5 minutes while watching CloudWatch alarms, then if fine, sends rest. On alarm, auto-rollback. This progressive delivery pattern, "gradually expose new versions to limit blast radius," keeps one deploy from breaking everything. Declare via `AutoPublishAlias` + `DeploymentPreference` in SAM template.

## Summary

SAM's core: "CloudFormation macro compressing serverless boilerplate, inheriting deploy/rollback/dependency graph from CloudFormation." One `Transform` line expands `AWS::Serverless::Function` to Lambda+Role+Permission, Policy Templates make least privilege the easiest path, `sam local` Docker-simulates function execution but backends reach real AWS, Globals layer hierarchical merge to cut repetition, `sam sync` trades CFN consistency for dev speed (dev-only). CodeDeploy pairing enables Canary deploy, cutting blast radius. Exam traps mostly come from "SAM is ultimately CloudFormation" truth and "local/deploy permission diff."

Next: CDK and serverless arch patterns, where you escape YAML entirely and program infrastructure.

---

## 📝 Practice Questions

**Question 1.** When you deploy a SAM template you wrote, CloudFormation fails saying `AWS::Serverless::Function` is an unknown resource type. What is the cause?

A) The Runtime is wrong

B) The `Transform: AWS::Serverless-2016-10-31` declaration is missing from the template

C) There is no Globals section

D) There is no Outputs

**Answer: B**

Explanation: SAM shorthand resources (`AWS::Serverless::*`) are expanded by CloudFormation as a macro only if the **`Transform: AWS::Serverless-2016-10-31`** declaration is present. Without this declaration, CloudFormation sees the SAM resources as an unknown type and fails. The date is a fixed identifier. A) A Runtime error produces a different error. C) Globals and D) Outputs are optional, so deployment works without them.

---

**Question 2.** What is the most accurate description of the relationship between SAM and CloudFormation?

A) SAM is a completely separate, independent deployment engine from CloudFormation

B) SAM is a CloudFormation macro that expands serverless resources into regular CloudFormation at deployment time and deploys them

C) SAM replaces CloudFormation

D) CloudFormation is a sub-feature of SAM

**Answer: B**

Explanation: SAM is an **extension (macro) of CloudFormation**. `Transform` expands SAM resources into full CloudFormation resources right before deployment, and since there is no separate deployment engine, it inherits CloudFormation features such as rollback, the dependency graph, and Change Sets as is. That is why you can mix regular CloudFormation resources into a SAM template. A and C are misconceptions that treat the two as separate or as a replacement. D has the relationship backwards.

---

**Question 3.** You want to grant a Lambda function minimal CRUD permissions on only a specific DynamoDB table. What is the most appropriate method in SAM?

A) Attach an inline policy with dynamodb:* to the function

B) Specify TableName in the DynamoDBCrudPolicy policy template

C) Attach the AdministratorAccess managed policy

D) Share the same role across all functions

**Answer: B**

Explanation: When you give `TableName` to the **`DynamoDBCrudPolicy`** policy template, SAM expands it into a least-privilege policy with only CRUD actions scoped to that table's ARN and attaches it to the function's dedicated role. Declaring the intent in one line automatically brings least privilege, a "safe default" design. A) `dynamodb:*` is broader than necessary. C) Administrator violates least privilege. D) Sharing a role breaks permission isolation and enlarges the blast radius.

---

**Question 4.** You try to test locally with `sam local start-api` but it does not run. What is the most likely cause?

A) The Outputs section is missing

B) Docker is not installed or running

C) The Region is set incorrectly

D) The Globals section is missing

**Answer: B**

Explanation: `sam local` **reproduces the Lambda execution environment with Docker containers**, so Docker must be installed and running. Without Docker, local execution is impossible. A and D are optional sections and do not block local execution. C) The Region can affect calls to real backends, but the number one cause of `start-api` failing to start is Docker.

---

**Question 5.** During development you want code changes reflected in Lambda as fast as possible, but you must also consider why this method should not be used in production. What are the appropriate command and caveat?

A) sam deploy - fastest, so use it as is in production too

B) sam sync --watch - updates only the code immediately so it is fast, but it can drift from the CloudFormation state, so it is for development only

C) sam build - automatically deploys the code

D) sam logs - updates the code

**Answer: B**

Explanation: **`sam sync --watch`** updates the Lambda code directly without going through CloudFormation when code changes, reflecting it in a few seconds. The price of speed is that the stack state CloudFormation sees and the actual function can drift apart, so it is **for development only**, and production must be deployed with `sam deploy`, the full CloudFormation path. A) `sam deploy` is safe but not meant for fast iteration. C) `sam build` is packaging. D) `sam logs` is for viewing logs.

---

**Question 6.** 20 Lambda functions all use the same runtime and timeout. You want to reduce repeated settings but give a different timeout to only some functions. What is the method in SAM?

A) Repeat all properties for every function

B) Put the common values in Globals.Function, and override only that property in the exception functions

C) Use Mappings

D) Define it in Outputs

**Answer: B**

Explanation: When you declare common defaults (Runtime, Timeout, and so on) in the **Globals** section, they apply to all Functions, and if an individual function writes the same property again, it **overrides** Globals. This is a hierarchical merge pattern where "a narrower scope overrides broad defaults". A) Repetition violates DRY. C) Mappings are lookup tables and not for applying common properties. D) Outputs are output values and are irrelevant.

---

**Question 7.** When deploying a new Lambda version, you want to send only 10% of traffic instead of 100% at once, monitor it, increase it gradually if there are no problems, and automatically roll back on an alarm. What is the mechanism in SAM?

A) Switch all traffic immediately with Globals

B) AutoPublishAlias + DeploymentPreference (Canary) for CodeDeploy-based gradual deployment

C) sam local invoke

D) DeletionPolicy: Retain

**Answer: B**

Explanation: SAM creates a function version alias with `AutoPublishAlias` and declares a CodeDeploy-based **gradual deployment (Canary/Linear)** with **`DeploymentPreference`** (for example `Canary10Percent5Minutes`). It sends only part of the traffic to the new version while watching CloudWatch alarms, shifts the rest if healthy, and automatically rolls back if an alarm fires. It is a gradual deployment pattern that reduces the blast radius. A) An immediate switch is not a gradual deployment. C) Local execution has nothing to do with deployment. D) DeletionPolicy is deletion protection and is irrelevant.
