# Day 3 - Lambda Versions, Aliases, and Layers: The Principles of Immutable Deployment and Dependency Separation

In software deployment, the ability to know "exactly what is running right now" matters more than you'd think. With an EC2 server, you can SSH in and check the package versions. With a Lambda function? Every time you upload code, `$LATEST` changes, and it's hard to trace what "the version deployed three weeks ago" was. The Version and Alias systems were designed to solve this problem. At the same time, Layers solve the duplication problem of "do I have to include common libraries in every function ZIP every time?"

Combine these three and even Lambda gets a workflow similar to GitOps — a code change is recorded immutably as a version, an alias progressively shifts traffic to the new version, and CodeDeploy automates the process.

## $LATEST, Versions, and Aliases: The Roles of Three Layers

**$LATEST** is the current working version, always mutable. When you upload code, change an environment variable, or adjust memory, `$LATEST` changes. Its ARN is `arn:aws:lambda:region:account:function:my-func` — no version suffix. Use it for development and testing; do not let it take production traffic directly.

**A Version** becomes an immutable object the moment you call `publish-version`, capturing a snapshot of `$LATEST`. Code, runtime, memory, timeout, environment variables, layers — all of this configuration is frozen along with a number. Its ARN is `arn:aws:lambda:region:account:function:my-func:3`. After publishing, nothing can be changed.

**An Alias** is a pointer to a specific version. Its ARN is `arn:aws:lambda:region:account:function:my-func:prod`. The key property of an alias is that it is **changeable at any time** — you can change the version the alias points to. If API Gateway or EventBridge references the alias ARN, you don't need to touch external configuration when you upgrade the function to a new version.

```
$LATEST (mutable)
    │ publish-version
    ▼
Version 1 ─── (immutable)
Version 2 ─── (immutable)
Version 3 ─── (immutable)  ◄──── alias "prod" (90% traffic)
Version 4 ─── (immutable)  ◄──── alias "prod" (10% traffic) ← canary
                   ◄──── alias "dev"
```

```bash
# Publish a version
aws lambda publish-version \
  --function-name payment-api \
  --description "2026-05-31: payment logic improvements, PCI-DSS review complete"

# Output
{
  "Version": "7",
  "FunctionArn": "arn:aws:lambda:ap-northeast-2:123:function:payment-api:7"
}

# Create an alias (point prod at version 7)
aws lambda create-alias \
  --function-name payment-api \
  --name prod \
  --function-version 7 \
  --description "Production endpoint"

# Alias ARN
# arn:aws:lambda:ap-northeast-2:123:function:payment-api:prod
```

> 💡 **Related theory**: The immutability of Lambda versions is exactly the immutable-value philosophy of **functional programming**. A value, once created, never changes. The reason this principle is valuable in distributed systems is **reproducibility**. "Roll back to version 3 from three weeks ago" is possible because that version was preserved immutably. It's the same logic as Git commit hashes being immutable.

## Canary Deployment: Traffic Splitting With Aliases

The most powerful feature of an alias is **weight-based traffic splitting between two versions**. Instead of immediately exposing a new version to all traffic, you send only 10% first, and if there are no problems, switch to 100%.

```bash
# Canary deployment: the prod alias points to version 7 (90%) + version 8 (10%)
aws lambda update-alias \
  --function-name payment-api \
  --name prod \
  --function-version 7 \
  --routing-config 'AdditionalVersionWeights={"8": 0.1}'

# If no problems, switch to 100%
aws lambda update-alias \
  --function-name payment-api \
  --name prod \
  --function-version 8 \
  --routing-config 'AdditionalVersionWeights={}'

# Roll back immediately if a problem occurs
aws lambda update-alias \
  --function-name payment-api \
  --name prod \
  --function-version 7 \
  --routing-config 'AdditionalVersionWeights={}'
```

> ⚠️ **Trap**: Alias traffic splitting supports **exactly 2 versions**. A three-way split across 3 versions is not possible. Also, you cannot designate `$LATEST` as a weighted target in an alias — you need a published version number.

## Automated Lambda Deployment via CodeDeploy

Instead of shifting alias traffic manually, CodeDeploy automates it. Memorize the deployment strategy names and they show up verbatim on the exam.

| Deployment strategy | How it works |
|-----------|----------|
| `Canary10Percent5Minutes` | 10% → observe for 5 min → 100% if no issues |
| `Canary10Percent30Minutes` | 10% → observe for 30 min → 100% |
| `Linear10PercentEvery1Minute` | Increase 10% every 1 minute (100% after 10 min) |
| `Linear10PercentEvery10Minutes` | Increase 10% every 10 minutes (100% after 100 min) |
| `AllAtOnce` | Switch to 100% immediately (no rollback safety net) |

CodeDeploy monitors CloudWatch Alarms during deployment. If the error rate crosses a threshold, it automatically rolls back to the previous version.

Specifying Before/After hooks in the CodeDeploy AppSpec file lets you run pre/post-deployment validation Lambdas.

```yaml
# appspec.yml (SAM/CodeDeploy)
version: 0.0
Resources:
  - PaymentApiFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: !Ref PaymentApiFunction
        Alias: !Ref PaymentApiAlias
        CurrentVersion: !Ref CurrentVersion
        TargetVersion: !Ref NewVersion
Hooks:
  - BeforeAllowTraffic: !Ref PreDeploymentCheck    # Validate the new version
  - AfterAllowTraffic: !Ref PostDeploymentCheck    # Validate after deployment completes
```

> 📚 **Case study**: Netflix made a Canary strategy a prerequisite for deploying Lambda functions. For Lambdas processing millions of streaming events per second, if a deployment mistake occurred under an AllAtOnce strategy, the entire service would go down. With the combination of Canary + automatic rollback on CloudWatch Alarm, they built a system that detects and rolls back a mistake within 5 minutes.

## Lambda Layer: Immutable Version Management of Shared Code

A layer is a mechanism for sharing libraries, ML models, and data files that multiple Lambda functions use in common. You upload a separate ZIP to S3, distinct from the function code (ZIP), and the function references it. At runtime it is automatically mounted into the `/opt` directory.

**Layer limits:**
- Up to 5 layers per function
- Function code + all layers total: 250MB (uncompressed basis)
- Container image functions cannot use layers

**Layer path structure (per runtime):**

| Runtime | Layer path |
|--------|------------|
| Python | `/opt/python` or `/opt/python/lib/pythonX.Y/site-packages` |
| Node.js | `/opt/nodejs/node_modules` |
| Java | `/opt/java/lib` |
| Shared library (.so) | `/opt/lib` |
| Executable | `/opt/bin` |

```bash
# Create a Python pandas layer
mkdir -p python/lib/python3.12/site-packages
pip install pandas numpy -t python/lib/python3.12/site-packages/
zip -r pandas-layer.zip python/

# Publish the layer
aws lambda publish-layer-version \
  --layer-name pandas-numpy \
  --zip-file fileb://pandas-layer.zip \
  --compatible-runtimes python3.12 python3.11 \
  --description "pandas 2.0 + numpy 1.26"

# Output
{
  "LayerVersionArn": "arn:aws:lambda:ap-northeast-2:123:layer:pandas-numpy:3",
  "Version": 3
}

# Attach the layer to a function
aws lambda update-function-configuration \
  --function-name data-processor \
  --layers \
    arn:aws:lambda:ap-northeast-2:123:layer:pandas-numpy:3 \
    arn:aws:lambda:ap-northeast-2:123:layer:common-utils:7
```

> 🔍 **Going deeper**: Layers also have version numbers and are immutable. Even a deleted layer version keeps working in functions that already reference that version (because it is cached in the function's execution environment). To share a layer with another account, set a resource-based policy on the layer granting `lambda:GetLayerVersion` to that account or to everyone.

## Environment Variables: Separating Code From Configuration

Environment variables are the simplest way to change a function's behavior without modifying code. They are Lambda's implementation of the third factor of the Twelve-Factor App principles — "Config in the Environment".

**Lambda reserved environment variables (read-only, cannot be overwritten):**

| Variable name | Example value |
|--------|--------|
| `AWS_REGION` | `ap-northeast-2` |
| `AWS_LAMBDA_FUNCTION_NAME` | `my-function` |
| `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` | `256` |
| `AWS_LAMBDA_FUNCTION_VERSION` | `$LATEST` or `3` |
| `AWS_LAMBDA_LOG_GROUP_NAME` | `/aws/lambda/my-function` |
| `_HANDLER` | `lambda_function.lambda_handler` |
| `LAMBDA_TASK_ROOT` | `/var/task` |
| `LAMBDA_RUNTIME_DIR` | `/var/runtime` |

**Environment variable encryption:**

Default: encrypted at rest with the AWS-managed key `aws/lambda`. You can see the values in the console.
Customer-managed KMS key (CMK): per-team/per-function isolation. Another team cannot see the environment variables even in the same AWS account.

> ⚠️ **Trap**: Environment variables have a maximum total size limit of 4KB. Whether it's 100 short variables or one long JSON string, if the total exceeds 4KB, the function update fails. If you need configuration that exceeds this limit, you must use SSM Parameter Store or S3.

## Environment Variables vs SSM Parameter Store vs Secrets Manager

Deciding when and how to use these three is a staple DVA exam scenario.

| Item | Environment Variables | SSM Parameter Store | Secrets Manager |
|------|----------|---------------------|-----------------|
| Cost | Free | Standard: free, Advanced: $0.05/parameter/month | $0.40/secret/month |
| Automatic rotation | ❌ | ❌ | ✅ (Lambda-based rotation) |
| Versioning | ❌ | ✅ | ✅ |
| Max size | 4KB total | Standard 4KB / Advanced 8KB | 64KB |
| Caching | Automatic (global variables) | AWS Parameters and Secrets Extension | AWS Parameters and Secrets Extension |
| Audit log (CloudTrail) | ❌ | ✅ | ✅ |
| Cross-account sharing | ❌ | ❌ | ✅ (Resource Policy) |
| Suitable use case | Non-secret configuration | Configuration + per-environment parameters | DB credentials, API keys |

**Answers by exam scenario:**
- "Automatically rotate the DB password every 90 days" → **Secrets Manager**
- "Several functions share the same config value, minimize cost" → **SSM Parameter Store**
- "Branch configuration per environment (dev/prod) without changing function code" → **Environment variables + alias**
- "Lambdas in other AWS accounts use the same DB credentials" → **Secrets Manager (cross-account resource policy)**

> 💡 **Related theory**: Secrets Manager's automatic rotation is **Lambda-function-based**. AWS provides pre-built rotation Lambdas for major engines like RDS, Redshift, and DocumentDB. During rotation, Secrets Manager changes the secret in two steps — it first creates the new secret (`createSecret`), validates it (`testSecret`), and then swaps out the existing one (`finishSecret`). This pattern is the secret-management version of **Blue-Green deployment**.

## AWS Parameters and Secrets Lambda Extension

Calling Secrets Manager directly on every invocation causes two problems. First, it adds API-call latency (tens of ms). Second, Secrets Manager API-call costs pile up ($0.05 per 10,000 calls).

The AWS Parameters and Secrets Lambda Extension provides caching via a local HTTP server (localhost:2773).

```python
import urllib.request
import json
import os

SECRET_NAME = "prod/myapp/db"
SECRETS_PORT = 2773

def get_secret():
    """Get a secret through the Lambda Extension cache"""
    url = f"http://localhost:{SECRETS_PORT}/secretsmanager/get?secretId={SECRET_NAME}"
    req = urllib.request.Request(url)
    req.add_header('X-Aws-Parameters-Secrets-Token', os.environ['AWS_SESSION_TOKEN'])
    
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read())
        return json.loads(data['SecretString'])

# Global cache (function-environment-level caching, separate from the Extension's TTL)
_secret = None

def lambda_handler(event, context):
    global _secret
    if _secret is None:
        _secret = get_secret()
    
    db_password = _secret['password']
    # Use it...
```

The Extension's default cache TTL is 300 seconds (5 minutes). It can take up to 5 minutes for a rotated secret to be reflected. If you need immediate reflection, reduce the TTL or disable the cache (`PARAMETERS_SECRETS_EXTENSION_CACHE_ENABLED=false`).

## Dependency Separation Strategy Using Layers

The most effective practical pattern for layers is the "common layer + thin function code" structure.

```
Layer 1: business common utilities (auth, logging, error handling)  → updated 1–2×/month
Layer 2: external libraries (pandas, latest boto3)                   → updated 1×/quarter
Layer 3: ML model files                                             → several GB, on model retraining
────────────────────────────────────────────────────
Function code: pure business logic                                  → updated on every PR
```

Separating it this way shrinks the function code ZIP to tens of KB so deployment is fast, and the Lambda service caches the layers so they aren't re-downloaded on every function invocation.

> ⚠️ **Trap**: If you hit the 250MB layer total limit, you have to switch to a **container image (up to 10GB)**. ML models of several GB are the representative case. Note, though, that with a container image you cannot use layers, and SnapStart also applies (only for Java runtime container images).

## Integrating Versions, Aliases, and Layers: A SAM Template Example

Here is the pattern for declaring these three together in AWS SAM (Serverless Application Model).

```yaml
# template.yaml
Resources:
  # Layer
  CommonLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: common-utils
      ContentUri: layers/common/
      CompatibleRuntimes: [python3.12]
      RetentionPolicy: Retain  # Existing functions keep working even if deleted

  # Function
  PaymentFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: payment-api
      CodeUri: src/payment/
      Handler: handler.lambda_handler
      Runtime: python3.12
      MemorySize: 512
      Timeout: 30
      Layers:
        - !Ref CommonLayer
      Environment:
        Variables:
          ENV: !Ref Stage
          TABLE_NAME: !Ref PaymentsTable
      AutoPublishAlias: prod  # On deploy, automatically publish a version + update the prod alias
      DeploymentPreference:
        Type: Canary10Percent5Minutes
        Alarms:
          - !Ref PaymentErrorAlarm
        Hooks:
          PreTraffic: !Ref PreTrafficCheck

  PaymentErrorAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      MetricName: Errors
      Namespace: AWS/Lambda
      Dimensions:
        - Name: FunctionName
          Value: !Ref PaymentFunction
      Threshold: 5
      Period: 60
      EvaluationPeriods: 1
      ComparisonOperator: GreaterThanThreshold
```

> 🔍 **Going deeper**: SAM's `AutoPublishAlias` automatically publishes a version on every deploy and updates the specified alias to point to the new version. `DeploymentPreference` automatically configures CodeDeploy to shift traffic with the specified strategy. Internally, the SAM transform generates the CodeDeploy deployment group, deployment configuration, and triggers as CloudFormation resources. The developer gets an enterprise-grade deployment pipeline from a few lines of YAML.

## Wrapping Up

Versions are the immutable record of Lambda deployments. Aliases are pointers that route those records flexibly. CodeDeploy automates pointer shifting and provides a safety net. Layers manage dependencies across functions under the DRY (Don't Repeat Yourself) principle. And the environment variables → SSM → Secrets Manager hierarchy is a guide to choosing the right store based on the sensitivity and requirements of the secret.

In the next article, we cover Lambda's concurrency control — the layered relationship of Reserved and Provisioned concurrency — along with error-handling strategies and the practical patterns of DLQ/Destinations.

---

## 📝 연습 문제

**문제 1.** When doing a canary deployment with a Lambda alias, across how many versions at most can you split traffic simultaneously?

A) 1  
B) 2  
C) 5  
D) No limit  

**정답: B**  
해설: A Lambda alias's weight-based traffic splitting supports exactly 2 versions. There's the primary version (not in AdditionalVersionWeights) and one secondary version (specified in AdditionalVersionWeights). A three-way split across 3 or more is not possible with a single alias; in that case you need Application Load Balancer weighted routing or a separate implementation.

---

**문제 2.** Which statement about Lambda layers is FALSE?

A) You can attach up to 5 layers to a single function  
B) Layers are mounted into the /opt directory  
C) Functions deployed as container images can also use layers  
D) You can share a layer with another AWS account  

**정답: C**  
해설: A Lambda function deployed as a container image cannot use layers. Layers only work with functions deployed as ZIP files. When using a container image, you must include dependencies directly in the Dockerfile. A is true. B is true — Python at `/opt/python`, Node.js at `/opt/nodejs/node_modules`. D is true — grant `lambda:GetLayerVersion` to another account.

---

**문제 3.** In the following scenario, what is the most suitable configuration management approach? "Several Lambda functions use the same RDS database password, and the password must be automatically rotated every 90 days."

A) Store the password directly in each function's environment variables  
B) Store it in AWS Secrets Manager and enable automatic rotation  
C) Store it in SSM Parameter Store Standard  
D) Store it as an encrypted file in an S3 bucket  

**정답: B**  
해설: Automatic rotation is the core feature of Secrets Manager. Secrets Manager provides built-in rotation Lambdas for major DBs like RDS and Redshift, and supports cross-account sharing too. A does not support automatic rotation and requires a function redeploy when the environment variable changes. C: SSM Parameter Store does not support automatic rotation natively (possible if integrated with Secrets Manager, but complex). D requires custom implementation and audit trails are hard.

---

**문제 4.** What is the total size limit of a Lambda function's environment variables?

A) 1KB  
B) 4KB  
C) 16KB  
D) 64KB  

**정답: B**  
해설: The total size of Lambda environment variables (sum of keys + values) is limited to 4KB. If you need configuration that exceeds this limit, use SSM Parameter Store (Standard 4KB, Advanced 8KB) or Secrets Manager (64KB). This limit is often hit when trying to stuff a complex JSON-format configuration wholesale into environment variables.

---

**문제 5.** Which CodeDeploy Lambda deployment strategy "increases traffic by 10% every 10 minutes to reach 100%"?

A) Canary10Percent5Minutes  
B) Linear10PercentEvery1Minute  
C) Linear10PercentEvery10Minutes  
D) AllAtOnce  

**정답: C**  
해설: `Linear10PercentEvery10Minutes` shifts 10% of traffic to the new version every 10 minutes, completing the 100% switch after 100 minutes. A `Canary` strategy sends a portion first and switches the rest all at once after an observation period. A `Linear` strategy increases linearly and gradually. `AllAtOnce` is an immediate 100% switch. For a critical payment service where safety is the top priority, a Linear strategy is appropriate.

---

**문제 6.** What is the difference between the $LATEST version and a published version (e.g., version 3) of a Lambda function?

A) $LATEST runs faster  
B) Version 3 has its code, memory, timeout, and environment variables frozen at publish time and cannot be changed  
C) You can set Provisioned Concurrency on $LATEST  
D) Version 3 is automatically deleted over time  

**정답: B**  
해설: A published version has all configuration — code, runtime, memory, timeout, environment variables, layers — frozen (immutable) at publish time. $LATEST is changeable at any time. C is the opposite — Provisioned Concurrency cannot be set on $LATEST, only on a published version or an alias. D is wrong — a version is retained permanently unless explicitly deleted (though per-version max concurrency is subject to account limits).
