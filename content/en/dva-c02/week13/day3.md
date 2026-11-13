# Day 3 - Final Review 3: Security, Monitoring, CI/CD

📅 Date: August 11, 2026 (Tuesday)  
🎯 Topic: Final Review of Security/Monitoring/CI/CD  
⏱️ Study Time: Approximately 120 minutes

---

## 🎯 Learning Objectives

- Complete final review of core exam topics for Security, Monitoring, and CI/CD
- Solve security and operational questions

---

## 📖 Final Core Summary

### Security Core Memory Anchors
```
KMS Direct Encryption: Max 4KB
Envelope Encryption: GenerateDataKey, for data >4KB
CMK: $1/month, key policy required
Secrets Manager: Auto rotation, $0.40/secret, 64KB (65,536 bytes)
Parameter Store: Standard free, SecureString = KMS encrypted
Cognito User Pool: JWT, API Gateway Authorizer
Cognito Identity Pool: JWT → IAM temporary credentials → AWS resources
WAF: Layer 7, SQL/XSS/Rate/Geo blocking
Shield Standard: Free, L3/L4 DDoS
Shield Advanced: $3,000/month, cost protection, DRT
ACM CloudFront: us-east-1 required
```

### Monitoring Core Memory Anchors
```
EC2 Memory/Disk: CloudWatch Agent required
CloudWatch Alarm: OK, ALARM, INSUFFICIENT_DATA
X-Ray Annotation: Indexable, filterable
X-Ray Metadata: Not indexable, additional info
X-Ray Sampling: First 1 + 5% per second
CloudTrail: All API audit, default 90 days
Data Events: Default disabled (S3 GetObject, Lambda invocation)
```

### CI/CD Core Memory Anchors
```
CodeCommit: Git, IAM authentication
CodeBuild buildspec: install → pre_build → build → post_build
CodeDeploy: EC2 (Agent required), Lambda (Canary/Linear), appspec.yml
Lambda Canary10Percent5Minutes: 10% for 5 min then 100%
CodePipeline: Orchestration, S3 artifacts
Beanstalk: .ebextensions, Immutable is safest
```

---

## 🧠 Domains 2·3·4 - Security·Deployment·Monitoring Last-Minute Compressed Review

### KMS Trap Collection

| Trap | Answer |
|------|--------|
| "Encrypt API limit?" | **4 KB** |
| "AWS Managed Key rotation?" | **1 year** (2022+ changed) |
| "CMK cost?" | **$1/month** + API calls |
| "Multi-Region Key purpose?" | CRR, DDB Global, multi-region |
| "No Key Policy?" | Cannot access via IAM policy |
| "Bucket Key effect?" | SSE-KMS cost 99% ↓ |
| "Grant purpose?" | Temporary·one-time permission (no Key Policy modification) |
| "KMS API limit?" | 5,500~30,000 RPS per key |
| "FIPS 140-2 Level 3?" | **CloudHSM** |
| "DEK?" | Data Encryption Key (Envelope) |

### Secrets Manager vs Parameter Store

| Item | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| Auto Rotation | ✅ | ❌ |
| Cost | $0.40/secret | Standard free |
| Size | 64KB | 4/8KB |
| RDS Integration | ✅ | ❌ |

### Cognito Traps

| Trap | Answer |
|------|--------|
| "User Pool vs Identity Pool?" | Authentication (JWT) vs IAM temporary credentials |
| "ID Token vs Access Token?" | User info vs API access |
| "Refresh Token max?" | **10 years** |
| "API GW Cognito Authorizer default token?" | **ID Token** |
| "HTTP API JWT Authorizer default token?" | **Access Token** |
| "Lambda trigger count?" | 11 (PreSignUp etc.) |

### WAF·Shield·ACM Traps

| Trap | Answer |
|------|--------|
| "Where can WAF not be applied?" | NLB, HTTP API (directly) |
| "Shield Advanced cost?" | **$3,000/month** + data |
| "Shield Advanced benefit?" | Cost protection + SRT (24/7) + WAF included |
| "ACM CloudFront cert region?" | **us-east-1 required** |
| "Direct ACM install on EC2?" | **Not possible** |
| "Private CA cost?" | $400/month |

### CloudWatch Traps

| Trap | Answer |
|------|--------|
| "EC2 default monitoring interval?" | **5 minutes** (Detailed = 1 minute) |
| "What is missing from EC2 default metrics?" | Memory, disk usage |
| "CloudWatch Logs default retention?" | **Indefinite** |
| "Logs single PutLogEvents?" | **1 MB** |
| "EMF purpose?" | Metrics from Lambda without the PutMetricData API |
| "Anomaly Detection?" | ML-based automatic threshold |

### X-Ray Traps

| Trap | Answer |
|------|--------|
| "Enable for Lambda?" | Active Tracing toggle |
| "Enable for EC2/ECS?" | X-Ray Daemon (UDP 2000) |
| "ALB X-Ray?" | **Not supported** |
| "Annotation vs Metadata?" | Indexable·filterable vs not |
| "Annotation limit?" | **50** |
| "Default sampling?" | First 1 + 5% per second |
| "ServiceLens?" | X-Ray + CloudWatch integration |

### CloudTrail Traps

| Trap | Answer |
|------|--------|
| "Default retention (console query)?" | **90 days** |
| "Data Events default?" | **Disabled** |
| "Multi-region vs Organization Trail?" | All Regions vs all accounts |
| "CloudTrail Lake?" | 7-year SQL analytics data lake |

### CI/CD Traps

| Trap | Answer |
|------|--------|
| "buildspec order?" | install → pre_build → build → post_build |
| "appspec EC2 vs Lambda?" | YAML 10 hooks vs YAML 2 hooks |
| "Lambda Canary10Percent5Minutes?" | 10% → 100% after 5 min |
| "ECS deployment strategy?" | **Blue/Green only** |
| "Beanstalk safest?" | **Immutable** or **Blue/Green** |
| "Manual Approval expiry?" | **7 days**, rejected if no response |
| "EC2 CodeDeploy required?" | **Agent installation** |

---

## 🛡️ Building Security in Three Layers

Security items seem numerous because you memorize them service by service. Group them by **which layer the tool protects** and it suddenly becomes simple.

```
┌─ Layer 1: Identity and permissions (Who?) ────────────────┐
│  IAM policies · SCP · Permissions Boundary · STS (temp creds) · ExternalId │
│  Cognito User Pool (authentication) → Identity Pool (temporary AWS credentials) │
└──────────────────────────────────────────────────────────┘
┌─ Layer 2: Secrets and keys (With what?) ──────────────────┐
│  KMS (≤4KB direct / larger uses Envelope) · CloudHSM (FIPS L3) │
│  Secrets Manager (auto rotation · RDS integration) · Parameter Store (free) │
└──────────────────────────────────────────────────────────┘
┌─ Layer 3: Paths and traffic (Where to?) ──────────────────┐
│  WAF (L7: SQLi · XSS · Rate · Geo) · Shield (L3/L4 DDoS)  │
│  ACM (TLS, us-east-1 for CloudFront) · SG/NACL · VPC endpoints │
└──────────────────────────────────────────────────────────┘

In a question, "no permission" → Layer 1,  "encryption/passwords" → Layer 2,
        "blocking attacks/certificates" → Layer 3.  If they look mixed, split by layer first.
```

### Envelope Encryption in Code

The KMS `Encrypt` API accepts only up to 4KB. The standard way to handle larger data is envelope encryption: **encrypt the data with a data key generated locally, and store only that data key, encrypted by KMS, alongside it.**

```python
import os, boto3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

kms = boto3.client("kms")

def encrypt_large_object(plaintext: bytes, key_id: str) -> dict:
    # 1) KMS gives you both a "plaintext data key" and an "encrypted data key"
    resp = kms.generate_data_key(KeyId=key_id, KeySpec="AES_256")
    data_key_plain = resp["Plaintext"]        # used only briefly for local encryption
    data_key_cipher = resp["CiphertextBlob"]  # only this is stored with the data

    # 2) Encrypt the large data locally with a symmetric key (the KMS 4KB limit no longer matters)
    nonce = os.urandom(12)
    ciphertext = AESGCM(data_key_plain).encrypt(nonce, plaintext, None)

    del data_key_plain    # 3) The principle is to discard the plaintext data key immediately

    return {"nonce": nonce, "ciphertext": ciphertext, "wrapped_key": data_key_cipher}

def decrypt_large_object(bundle: dict) -> bytes:
    # When decrypting, send KMS only the "encrypted data key" and get the plaintext key back
    data_key_plain = kms.decrypt(CiphertextBlob=bundle["wrapped_key"])["Plaintext"]
    return AESGCM(data_key_plain).decrypt(bundle["nonce"], bundle["ciphertext"], None)
```

This structure has two benefits. First, **the data traveling to and from KMS is always small**: the network round trip is fixed at the size of one key, so the KMS call cost is the same whether the data is 100MB or 10GB. Second, **key rotation is cheap**: you do not re-encrypt the data; you only re-wrap the wrapped data key. This is exactly what S3's SSE-KMS does internally, and the Bucket Key is the optimization here that "reuses the data key at the bucket level to reduce KMS calls."

Envelope encryption is an old pattern that cryptography calls a **key hierarchy**. At the top sits a master key that is rarely taken out (KMS's CMK, which never leaves the HSM), and beneath it sit data keys that are used often and discarded often. The lower you go, the greater the exposure risk but the smaller the blast radius; the higher you go, the fewer the opportunities for exposure at all. The constraint "the master key never moves" is what gave the `generate_data_key` API its shape. TLS session keys and disk-encryption volume keys all use the same hierarchical structure.

> ⚠️ **Pitfall**: It is easy to miss that in KMS the **Key Policy is the first gate**. Even if an IAM policy has `kms:Decrypt`, access is denied if the key policy does not allow that principal (and the reverse is also true). This is what lies behind the situation "I am an IAM administrator but cannot use the KMS key," and the tool you use to grant permission temporarily, instead of editing the key policy, is a **Grant**. Also, deleting a CMK is not immediate but takes place after a **7-30 day waiting period**, during which it can be canceled; this means "I accidentally deleted the key" still leaves room for recovery.

### Three Cognito Tokens: Which One Do You Send Where?

| Token | Contents | Main use | Caution |
|------|----------|--------|------|
| **ID token** | User attributes (name, email, etc.) | When the app needs to know "who this person is"; **default for the Cognito Authorizer** on REST APIs | Contains user information, so be careful about exposing it externally |
| **Access token** | Scopes and permissions | Authorizing API calls; **default for the JWT Authorizer** on HTTP APIs | No detailed user information |
| **Refresh token** | Credential for reissuing | Refreshing the two tokens above | Very long lifetime (configurable up to 10 years) — store carefully |

The division of roles between User Pool and Identity Pool also boils down to one sentence. **The User Pool answers "who are you?" and gives you a JWT; the Identity Pool takes that JWT and, saying "then you may do this much in AWS," exchanges it for IAM temporary credentials.** This is why the answer to the scenario where a mobile app uploads directly to S3 is the Identity Pool: S3 does not understand JWTs and only understands SigV4 signatures.

---

## 🔭 The Three Axes of Observability: Logs, Metrics, Traces

Monitoring services are confusing for the same reason: the layers are not separated. The three axes are not substitutes for each other; **they answer different questions.**

```
Metric   "How bad is it right now?"     → CloudWatch Metrics/Alarms
         A numeric time series. Cheap and fast. The basis for alarms.

Log      "What exactly happened then?"  → CloudWatch Logs, Logs Insights
         The full text of an event. Expensive, but the only one that holds the details.

Trace    "Where did it slow down?"      → X-Ray, ServiceLens
         The path one request took through the services and the time spent per segment.

Audit    "Who called what?"             → CloudTrail (the security/compliance axis)
```

The symptom → tool mapping is the exam question itself. "Responses are slow but I cannot tell which service is to blame" is **tracing**; "alarm on how many times a particular string appears in the logs" is a **Metric Filter**; "who opened this security group" is **CloudTrail**; and "EC2 memory utilization" is not in the default metrics, so it is the **CloudWatch Agent**.

```python
from aws_xray_sdk.core import xray_recorder, patch_all

patch_all()   # automatically records calls from boto3, requests, etc. as subsegments

@xray_recorder.capture("process_order")
def process_order(order):
    # Annotation: indexed → searchable with filters in the console (limit 50 per trace)
    xray_recorder.put_annotation("orderId", order["id"])
    xray_recorder.put_annotation("tier", order["customerTier"])

    # Metadata: not indexed → cannot be filtered, for keeping detailed context
    xray_recorder.put_metadata("payload", order)

    with xray_recorder.in_subsegment("charge_payment"):
        return payment_gateway.charge(order)   # instrument the external call segment separately
```

**The difference between Annotation and Metadata comes down to one thing: "can you find it?"** To search traces by a specific order number, it must be an Annotation.

```bash
# Follow logs in real time while filtering (use this before grep)
aws logs tail /aws/lambda/my-func --follow --since 10m --filter-pattern "ERROR"

# Promote a log pattern to a metric and set an alarm on it
aws logs put-metric-filter \
  --log-group-name /aws/lambda/my-func \
  --filter-name PaymentFailures \
  --filter-pattern '"PAYMENT_FAILED"' \
  --metric-transformations metricName=PaymentFailures,metricNamespace=MyApp,metricValue=1

# Pull out only error traces
aws xray get-trace-summaries \
  --start-time 2026-08-11T00:00:00Z --end-time 2026-08-11T01:00:00Z \
  --filter-expression 'service("my-func") AND error'
```

X-Ray's default sampling rule is "**the first request each second is always traced, and 5% after that**." There is a reason for this structure: when traffic is low (around 1 request per second), nearly 100% is traced, so development and low-traffic environments do not end up with empty data, and when traffic surges, the rate portion dominates so cost does not blow up linearly. This form, which combines a fixed target and a rate, is the classic of observability system design, and you switch to `fixed_target: 0, rate: 1.0` only in special debugging situations where you must see every request (beware of the cost surge). Conversely, also remember that the ALB is not an X-Ray instrumentation target; it only passes along the trace header.

---

## 🚀 Understanding CI/CD Through Two Files

CodeBuild and CodeDeploy can each be summarized by **one file**. `buildspec.yml` is "how to build it," and `appspec.yml` is "how to ship it."

```yaml
# buildspec.yml — read by CodeBuild (repo root)
version: 0.2

env:
  variables:
    NODE_ENV: production
  parameter-store:                  # injected from SSM Parameter Store
    API_ENDPOINT: /myapp/prod/api-endpoint
  secrets-manager:                  # injected from Secrets Manager (no plaintext!)
    DB_PASSWORD: prod/myapp/db:password

phases:
  install:                          # (1) prepare runtime and tools
    runtime-versions:
      nodejs: 20
    commands:
      - npm ci
  pre_build:                        # (2) preparation before the build (login, tests)
    commands:
      - npm run lint && npm test
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
  build:                            # (3) the actual build
    commands:
      - npm run build
      - docker build -t $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION .
  post_build:                       # (4) finalize artifacts and push
    commands:
      - docker push $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION

artifacts:                          # artifacts CodePipeline will hand off to S3
  files:
    - appspec.yml
    - dist/**/*
cache:                              # speeds up the next build
  paths:
    - 'node_modules/**/*'
```

The order is **install → pre_build → build → post_build**, and the order of these four words alone can appear as a standalone question. An option that writes secret values in plaintext under `env.variables` is wrong; the correct answer is a `parameter-store` or `secrets-manager` reference.

```yaml
# appspec.yml — for Lambda deployment (2 hooks)
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: my-func
        Alias: prod
        CurrentVersion: 3
        TargetVersion: 4
Hooks:
  - BeforeAllowTraffic: LambdaPreTrafficCheck    # validation before traffic shift
  - AfterAllowTraffic: LambdaPostTrafficCheck    # validation after the shift (rolls back on failure)
```

The `appspec.yml` for EC2/on-premises deployment has file copy locations and far more lifecycle hooks (ApplicationStop → BeforeInstall → AfterInstall → ApplicationStart → **ValidateService**, etc.). Either way, the key point is that **automatic rollback kicks in if ValidateService (or AfterAllowTraffic) fails**. And for EC2 targets, **installing the CodeDeploy agent is mandatory**: without the agent, the deployment does not even start.

### Deployment Strategy Comparison: A Spectrum of "How Cautious Are You?"

| Strategy | Target | Downtime | Cost (extra resources) | Rollback speed | Character |
|------|------|---------|---------------|----------|------|
| **AllAtOnce** | Lambda/EC2/Beanstalk | Yes | None | Redeploy required | Fastest and riskiest |
| **Rolling** | EC2/Beanstalk | None (reduced capacity) | None | Slow | Capacity shrinks during deployment |
| **Rolling with Additional Batch** | Beanstalk | None | Temporary extra | Slow | Maintains full capacity |
| **Canary** | Lambda | None | Small | **Instant** (revert alias weights) | Test with 10% first, then shift the rest |
| **Linear** | Lambda | None | Small | **Instant** | Shift in steps by a fixed percentage |
| **Immutable** | Beanstalk | None | Large (new ASG) | Fast | Launch everything in a new group, validate, then swap |
| **Blue/Green** | ECS/EC2/Beanstalk | None | Large (two environments) | **Fastest** | Just shift traffic back and you are done |

The practical point is that the name `Canary10Percent5Minutes` is itself decodable grammar: "**send 10% for 5 minutes, and if there is no problem, the remaining 100%**." `Linear10PercentEvery1Minute` means "10% every 1 minute." Once you know how to read the names, all four options are solved. Also bundle together that ECS's CodeDeploy deployment is the **Blue/Green style**, and that when asked for the "safest" in Beanstalk, the answer is **Immutable or Blue/Green**.

### Where Pipelines Break

| Symptom | Cause | Remedy |
|------|------|------|
| CodeBuild ECR push fails with `AccessDenied` | Build service role lacks ECR permissions | Grant the minimal set of `ecr:*` to the service role |
| `authentication` error midway through a build | ECR login token expired (**12 hours**) | Log in again right before the push |
| CodeDeploy does not even start on EC2 | **Agent not installed** or stopped | Install/start the agent, check the instance role |
| Deployment succeeded but the app is the old version | Alias does not point to the new version | Check the alias/weights (no deploying to `$LATEST`) |
| Pipeline stops at the approval stage | Waiting for manual approval | Rejected if there is no response within **7 days** |
| Settings vanish after a Beanstalk deployment | `.ebextensions` precedence/path error | Check `option_settings` in `.ebextensions/*.config` |

Even with automatic rotation in Secrets Manager turned on, an incident can occur where the application dies from authentication failures at every rotation moment. In a hypothetical case, the cause is that the app **reads the secret only once at startup and caches it**. The rotation Lambda goes through four steps, `createSecret → setSecret → testSecret → finishSecret`, creating new credentials and moving the label; if the app keeps holding the old value, it fails from the moment the label moves. The remedies are (1) logic that, on an authentication failure, re-reads the secret and retries once, (2) a short TTL on the cache, and (3) for RDS, removing the secret from the app altogether with **RDS Proxy + IAM authentication**. The answer to the scenario "we turned on automatic rotation and an outage occurred" is not to turn rotation off but to make the app tolerate rotation.

---

## Wrap-Up

Security, monitoring, and CI/CD look like different topics, but all three share one thread: they are **"devices that make the system, not the code, provide the guarantee."**

- Security stacks layers (identity, keys, paths) so that things are blocked even when people make mistakes.
- Observability lets metrics, logs, and traces speak before humans notice an outage.
- CI/CD entrusts the safety of deployment to hooks and automatic rollback rather than to human carefulness.

So the correct options in this area share a common tendency: **references instead of plaintext, automatic instead of manual, gradual shift instead of switching everything, and the side that has a way back on failure.** When the options are confusing, using these four as criteria narrows down the answer.

---

## 📝 Final Mock Exam - Part 3

**Question 1.** To safely encrypt 100MB file with KMS?

A) Call kms:Encrypt API directly  
B) Envelope Encryption (GenerateDataKey)  
C) Use S3 SSE-S3  
D) Not possible  

**Answer: B** - KMS direct encryption has 4KB limit, so 100MB file requires Envelope Encryption.

---

**Question 2.** To analyze where latency occurs in Lambda execution path?

A) CloudWatch Metrics  
B) CloudTrail  
C) X-Ray  
D) VPC Flow Logs  

**Answer: C** - X-Ray distributed tracing records execution time of each service as segments to identify bottlenecks.

---

**Question 3.** To gradually transition to new Lambda version with auto-rollback on error?

A) CodeDeploy AllAtOnce  
B) CodeDeploy Canary or Linear  
C) CloudFormation update  
D) Manual deployment  

**Answer: B** - CodeDeploy Canary/Linear gradually shifts traffic and auto-rollbacks on error detection.

---

**Question 4.** Architecture to instantly detect root login?

A) CloudWatch alarm  
B) CloudTrail + EventBridge + SNS  
C) GuardDuty  
D) Config rule  

**Answer: B** - Detect root login from CloudTrail, send instant notification via EventBridge→SNS.

---

**Question 5.** To use SSM Parameter Store SecureString in code?

A) Auto inject as environment variable without API  
B) ssm:GetParameter API with --with-decryption option  
C) Call KMS decrypt API directly  
D) Use Secrets Manager API  

**Answer: B** - GetParameter API with `--with-decryption` returns KMS-decrypted value.

---

**Question 6.** Safe way to use DB password in buildspec.yml?

A) Plain text in buildspec.yml  
B) Environment variable as plain text  
C) Reference Secrets Manager ARN in secrets-manager section  
D) Save to S3 file then download  

**Answer: C** - buildspec.yml `env.secrets-manager` section references Secrets Manager ARN for safe injection.

---

**Question 7.** To set different DB URL per environment in Elastic Beanstalk?

A) Modify buildspec.yml  
B) Set environment variables in .ebextensions with option_settings  
C) Store config file in S3  
D) Hardcode in app  

**Answer: B** - `.ebextensions/*.config` `option_settings` allows different environment variables per environment.

---

**Question 8.** To filter traces by orderId in X-Ray?

A) Store orderId in Metadata  
B) Store orderId in Annotation  
C) Print orderId in logs  
D) Use CloudWatch dashboard  

**Answer: B** - X-Ray Annotations are indexed for filtering. Metadata is not indexed and cannot filter.

---

## 📌 Today's Summary

1. Security: KMS (4KB limit/Envelope), Cognito (User Pool/Identity Pool), WAF/Shield
2. Secrets Manager: Auto rotation, RDS integration / Parameter Store: Free, hierarchical
3. Monitoring: CloudWatch (metrics/alarms), X-Ray (tracing/Annotation), CloudTrail (audit)
4. CI/CD: CodeBuild (buildspec), CodeDeploy (appspec), CodePipeline (orchestration)
5. Pattern: Root detection (CloudTrail→EventBridge→SNS), Gradual deployment (Canary)
