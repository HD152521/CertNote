# Day 1 - Final Review 1: IAM, EC2, Lambda, API Gateway

📅 Date: August 9, 2026 (Sunday)  
🎯 Topic: Final Review of Core Services 1  
⏱️ Study Time: Approximately 120 minutes

---

## 🎯 Learning Objectives

- Complete final review of core exam topics for IAM, EC2, Lambda, and API Gateway
- Identify frequently appearing exam question types

---

## 📖 Final Core Summary

### IAM Core Memory Anchors
```
Policy Evaluation: Explicit Deny > Implicit Deny > Allow
STS AssumeRole: Cross-account access, temporary credentials
IAM Role vs User: Role is temporary, User is permanent
SCP: Organization-wide permission boundary, Deny-only policy
Permissions Boundary: Maximum permission limit for IAM user/role
```

### EC2 Core Memory Anchors
```
Purchase Options: On-Demand > Reserved (72% savings) > Spot (90% savings)
EBS gp3: SSD, 3000 IOPS baseline
EBS io2: Highest performance SSD, multi-attach
Instance Store: Temporary, persists on reboot, deleted on terminate
AMI: Region-scoped, can be copied to other regions
ALB: Layer 7, URL/host-based routing
NLB: Layer 4, static IP, ultra-high performance
ASG Scaling: Target Tracking, Step, Simple, Scheduled, Predictive
```

### Lambda Core Memory Anchors
```
Memory: 128MB ~ 10240MB
Timeout: Max 15 minutes
Ephemeral Storage: /tmp 512MB ~ 10GB
Concurrency = Requests per Second × Average Execution Time
Cold Start: New execution environment, prevented by Provisioned Concurrency
Reserved Concurrency = 0: Completely disabled
Async Retry: Max 2 times, DLQ or Destinations
Layers: Max 5, /opt directory, 250MB total
```

### API Gateway Core Memory Anchors
```
Integration Type: AWS_PROXY (Lambda Proxy), AWS, HTTP, MOCK
Lambda Proxy Response: {statusCode, headers, body}
Caching: Default TTL 300 seconds, invalidate with Cache-Control: max-age=0
Throttling Exceeded: HTTP 429
Cognito Authorizer: Automatic JWT validation
Lambda Authorizer: Custom auth, result cache default 300 seconds
HTTP API: 70% cheaper than REST, no Usage Plans/caching
WebSocket: $connect, $disconnect, $default
```

---

## 🧠 Domain 1 (Development 32%) Last-Minute Compressed Review

### Domain 1 Trap Collection

| Trap | Answer |
|------|--------|
| "Lambda max memory?" | **10,240 MB** |
| "Lambda max timeout?" | **15 minutes (900 seconds)** |
| "Lambda container image max?" | **10 GB** |
| "Lambda Layer max count?" | **5** |
| "Direct ZIP upload max?" | **50 MB** |
| "/tmp max?" | **10 GB** |
| "Lambda concurrency default limit?" | **1,000 / region** |
| "Async retry count?" | **2 times** (1 min, 2 min) |
| "Provisioned Concurrency targets?" | **Alias or Version** ($LATEST not allowed) |
| "SnapStart supported runtimes?" | **Java 11+, Python 3.12+, .NET 8+** |
| "AssumeRole max session?" | **12 hours** |
| "Role Chaining max?" | **1 hour** |
| "STS GetSessionToken max?" | **36 hours** |
| "AssumeRole first call token expiry?" | **1 hour (default)** |

### IAM Policy Evaluation Order

```
1. Explicit Deny (anywhere) → Deny
2. SCP (Organizations) → Deny if not allowed
3. Resource-based Policy (S3/SQS/Lambda etc.) → Allow if OK
4. Identity Policy (IAM)
5. Permissions Boundary → Must be within scope
6. Session Policy (when using AssumeRole)
→ Allow if all are satisfied
```

### Lambda Concurrency: 4 Types (Exactly)

| Type | Unit | Setting |
|------|------|---------|
| **Account Concurrency Limit** | Region-wide | Default 1,000 |
| **Scaling Rate** | Per function | +1,000 execution environments every 10 seconds |
| **Reserved Concurrency** | Per function upper bound | Free |
| **Provisioned Concurrency** | Version/Alias | Charged per hour |

### API Gateway Authentication 5 Types (Memorize)

1. **None** — Public
2. **IAM (SigV4)** — AWS credentials
3. **Lambda Authorizer (TOKEN)** — JWT, OAuth validation
4. **Lambda Authorizer (REQUEST)** — Multi-header validation
5. **Cognito User Pool Authorizer** — Automatic JWT
6. **JWT Authorizer (HTTP API only)** — OIDC

### EC2 Trap Collection

- AMI is **region-dependent**
- EBS is **AZ-dependent**
- HDD (st1/sc1) cannot be a boot volume
- Instance store is lost on **stop/terminate** (kept on reboot)
- IMDSv2 token method is recommended to enforce
- SG = Stateful, NACL = Stateless

---

## 🔬 Reweaving the Memory Tables into a "Story": The Path One Request Travels

The memorization tables above are good for skimming right before the exam, but if you only memorize tables you will fall apart on scenario questions. Domain 1 of DVA-C02 (Development 32%) asks less "do you know the number?" than "why is this number in this place?" So the last step of review is to place the scattered numbers back onto **the path that a single request travels**.

```
                          [ IAM / STS ] ← involved in every arrow
                                │
   (1)            (2)           │          (3)              (4)
[Client] ──▶ [API Gateway] ──▶ [Lambda execution environment] ──▶ [DynamoDB/S3/RDS]
                   │  │              │      │
                   │  │              │      └─ taskRole-like: the function's execution role
                   │  └─ Cache (TTL 300 s) · Throttle (429) · Authorizer (cache 300 s)
                   └─ Integration timeout default 29 s ─┐
                                              └─ Shorter than the Lambda timeout (max 900 s)!

   (1) Authentication: None / IAM SigV4 / Lambda Authorizer / Cognito / JWT
   (2) Transformation: AWS_PROXY passes the whole request as the event, AWS uses mapping templates
   (3) Execution: INIT (cold) → INVOKE (warm) → SHUTDOWN
   (4) Permissions: the function's execution role is the app's AWS permission
```

Most of the traps that appear on the exam hang on this one diagram. For example, "Lambda's timeout is 15 minutes, so why can't it run longer than 29 seconds behind API Gateway?" is a question about the principle that **at the boundary between (2) and (3), the shorter limit wins**. On a synchronous path, **the shortest timeout is always the effective upper bound**. Long-running work must be redesigned as an asynchronous pattern: API Gateway returns 202 immediately and hands the work off to SQS or Step Functions. This is the representative scenario linking Domain 1 and Domain 3 (Deployment).

"The shorter limit wins at the boundary" is the distributed-systems concept of a **timeout budget**. In a call chain running client → gateway → function → DB, each stage's timeout is only meaningful if the outer one is longer than the inner one. If the inner one is longer, the outer stage gives up first, and the inner stage keeps processing a request that has already been cut off, burning resources (orphaned work). Conversely, if the inner one is shorter, the failure is delivered to the outer stage as a clear error. It becomes clearer when viewed together with the AWS SDK's default retries: if the outer layer retries as well, the effective elapsed time inflates to `timeout × retry count`, and exceeds the gateway limit in no time.

---

## ⚙️ Lambda Execution Environment Lifecycle: Exactly Where Does Cold Start Occur?

Everyone knows up to "Cold Start is bad, eliminate it with Provisioned Concurrency." What the exam digs into is the fact that **code inside and outside the handler lives in different lifecycles**.

```
[INIT phase] — runs only on a cold start (billing and timeout handling differ)
  1. Download the code (ZIP or container image)
  2. Create the execution environment (microVM) · boot the runtime
  3. Run the code "outside" the handler  ← create SDK clients, DB connections, load config

[INVOKE phase] — runs on every invocation
  4. Call handler(event, context)

[SHUTDOWN phase] — when the environment is reclaimed
  5. Send a termination signal to extensions
```

```python
import os
import json
import boto3

# ── Area that runs exactly once, during the INIT phase ───────
# Pay the cold start cost here only once; warm invocations afterward reuse it.
TABLE_NAME = os.environ["TABLE_NAME"]
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def handler(event, context):
    # ── INVOKE phase: area that runs on every invocation ─────
    body = json.loads(event.get("body") or "{}")
    user_id = body.get("userId")

    if not user_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": "userId is required"}),
        }

    table.put_item(Item={"PK": f"USER#{user_id}", "SK": "PROFILE", **body})

    return {
        "statusCode": 201,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"userId": user_id}),
    }
```

If you create `boto3.resource(...)` inside the handler, you pay the client initialization cost (credential lookup, endpoint resolution, TLS preparation) again on every invocation. If you put it outside the handler, it is reused **for as long as the same execution environment stays alive**. When the exam asks for a "code-level measure to reduce Lambda latency," the answer is usually "move reusable initialization outside the handler."

The fact that the execution environment is reused is a performance gain, and also a cause of **state leakage**. If you leave data from a previous invocation in a global variable, the next invocation sees that value; this is where the bug of reading the previous user's cache, even though it is not the same user's request, comes from. `/tmp` likewise persists within the same environment, so if you do not delete temporary files, the default 512 MB fills up and `No space left on device` appears. So the practical principle is "**only immutable, stateless resources in globals; per-request data in local variables**." This principle goes hand in hand with the fact that Lambda functions cannot share memory with each other (so shared state goes to an external store such as DynamoDB or ElastiCache).

### Three Invocation Models: Retries and Failure Handling Are Completely Different

| Category | Synchronous (RequestResponse) | Asynchronous (Event) | Event Source Mapping (polling) |
|------|----------------------|--------------|----------------------|
| Typical caller | API Gateway, ALB, direct SDK call | S3 events, SNS, EventBridge | SQS, Kinesis, DynamoDB Streams |
| Payload limit | **6 MB** | **1 MB** | Per batch (varies by service) |
| Retry on failure | **Lambda does not retry** (caller's responsibility) | **Up to 2 times** (about 1 min, 2 min intervals) | Depends on event source settings |
| Final handling of failure | Returns an error to the caller | DLQ or Lambda Destinations | Remains in the queue/stream, or DLQ |
| Ordering | Not applicable | Not guaranteed | Guaranteed per shard / message group |

Instead of memorizing this table, understand it by **"who is holding the message"** and you will not forget it. In a synchronous invocation, the caller holds it while waiting for the response, so retries are the caller's job. In an asynchronous invocation, the Lambda service receives the event into a queue and holds it, so Lambda retries. With an event source mapping, SQS or Kinesis holds the original, so if the function fails, the message simply stays at the source and reappears after the visibility timeout.

> ⚠️ **Pitfall**: "Lambda always retries twice when it fails" is a misconception. **In a synchronous invocation, Lambda does not retry.** If a function behind API Gateway returns an error, a 502 goes out as is, and the client decides whether to retry. This is why the answer to "How do you make the API Gateway → Lambda path tolerate transient errors?" on the exam is not "Lambda retry settings" but "make it asynchronous by putting SQS in between" or "client exponential backoff."

---

## 🔐 Seeing IAM as Code: The Trust Policy and the Permissions Policy Answer Different Questions

Two kinds of JSON are attached to an IAM role, and if you confuse them you end up in the situation of "I created the role but nothing works."

- **Trust Policy**: "**Who** can assume this role?" — the role's door
- **Permissions Policy**: "**What** can this role do?" — the role's hands

```json
// Trust policy — allows the Lambda service to assume this role
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

```json
// Permissions policy — an execution role narrowed to least privilege
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WriteOwnLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:ap-northeast-2:123456789012:log-group:/aws/lambda/my-func:*"
    },
    {
      "Sid": "AccessOwnTableOnly",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:ap-northeast-2:123456789012:table/Orders"
    },
    {
      "Sid": "DenyOutsideOffice",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

The third statement is an important demonstration. An explicit `Deny` wins before any other `Allow`: even if administrator permissions are attached, a request that matches this condition is denied. The memory table's "Explicit Deny > Implicit Deny > Allow" looks like this in code.

The flow for verifying cross-account access with the CLI is as follows.

```bash
# 1) Assume the role in the target account — you receive three kinds of temporary credentials
aws sts assume-role \
  --role-arn arn:aws:iam::999988887777:role/CrossAccountReadOnly \
  --role-session-name dev-debug \
  --external-id "unique-shared-secret" \
  --duration-seconds 3600

# 2) After applying the returned AccessKeyId / SecretAccessKey / SessionToken to the environment
aws sts get-caller-identity          # Check "who" I am right now (debugging priority #1)

# 3) Actually test the function's permissions
aws lambda invoke \
  --function-name my-func \
  --payload '{"body":"{\"userId\":\"U001\"}"}' \
  --cli-binary-format raw-in-base64-out \
  response.json
```

In a setup where you give a third-party SaaS read access to your account, leaving the `ExternalId` condition out of the trust policy causes a problem. In that case, even if the SaaS receives another customer's request and assumes your role, AWS has no way to stop it. This is the **Confused Deputy** problem. `ExternalId` sets a condition on "a value that only that SaaS and I know," cutting off the path by which a third party gets the SaaS to touch your account. On the exam, the answer to "what must be included when providing a role to a third party" is `ExternalId`, not narrowing the permissions of `sts:AssumeRole` itself.

---

## 🚪 API Gateway: Integration Types and the Response Contract

Lambda Proxy (`AWS_PROXY`) is a contract that says "I will pass the entire request in as the event, and you must match the response format." If you break this contract, the function succeeds but the client sees a 502.

```javascript
// Node.js — the response contract you must honor in a Lambda Proxy integration
export const handler = async (event) => {
  // The original request arrives in the event in its entirety
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  const orderId = event.pathParameters?.orderId;
  const page = event.queryStringParameters?.page ?? "1";
  const auth = event.headers?.authorization;

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return respond(404, { message: "order not found" });
    }
    return respond(200, { order, page });
  } catch (err) {
    console.error("getOrder failed", { orderId, err });   // to CloudWatch Logs
    return respond(500, { message: "internal error" });   // never expose stack traces
  }
};

// statusCode / headers / body (a string) are the whole contract
const respond = (statusCode, payload) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),   // putting an object in directly causes a 502
});
```

If you put an object directly into `body` or omit `statusCode`, API Gateway cannot interpret the response and produces a **502 Bad Gateway**. This is the number-one cause of the symptom "the function log shows success but the client gets a 502."

### REST API vs HTTP API: Where They Diverge

| Item | REST API | HTTP API |
|------|----------|----------|
| Cost | Baseline | About **70% cheaper** |
| Latency | Relatively higher | Lower |
| Usage plans / API keys | ✅ | ❌ |
| Response caching | ✅ | ❌ |
| Request validation / mapping templates | ✅ | Limited |
| Direct WAF attachment | ✅ | ❌ (via CloudFront, etc.) |
| JWT Authorizer | ❌ (Cognito Authorizer) | ✅ |
| Default validated token | Cognito Authorizer uses the **ID token** | JWT Authorizer uses the **access token** |

If it is "simple proxy + minimize cost," choose HTTP API; if you need "usage-based billing, caching, request validation, or WAF," choose REST API. On the exam, if the requirements list contains even a single line about a **usage plan or caching**, HTTP API immediately becomes a wrong answer.

### A Table for Tracing Causes Back from Error Codes

| Symptom | Where it originates | Typical cause |
|------|--------------|----------|
| `403 Missing Authentication Token` | API Gateway | Calling a nonexistent path/method (mostly a path typo) |
| `403 User is not authorized` | API Gateway/IAM | SigV4 signature is correct but no `execute-api:Invoke` permission |
| `401 Unauthorized` | Authorizer | Expired token, signature mismatch, wrong issuer |
| `429 Too Many Requests` | API Gateway | Stage/usage plan throttle exceeded |
| `502 Bad Gateway` | API Gateway | Lambda response violates the `{statusCode, headers, body}` contract |
| `504 Gateway Timeout` | API Gateway | Integration timeout (default 29 s) exceeded |
| `Task timed out after N seconds` | Lambda | Function timeout reached — usually a slow response from a DB in the VPC |
| `TooManyRequestsException` | Lambda | Account/function concurrency limit exceeded (throttling) |
| `AccessDeniedException` | Target service | Missing permissions policy on the execution role |
| `ResourceConflictException` | Lambda | Attempting another update while a function update is in progress |

This table becomes your debugging order in practice as is. If you first split the problem into three branches, **403/404 family means gateway configuration, 5xx means the integration target, and AccessDenied means IAM**, the scope of the cause search shrinks significantly.

```bash
# Check throttles and errors through metrics first (before digging through logs)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda --metric-name Throttles \
  --dimensions Name=FunctionName,Value=my-func \
  --start-time 2026-08-09T00:00:00Z --end-time 2026-08-09T12:00:00Z \
  --period 300 --statistics Sum

# Check/set the per-function concurrency cap (reserved concurrency)
aws lambda get-function-concurrency --function-name my-func
aws lambda put-function-concurrency --function-name my-func --reserved-concurrent-executions 50

# Provisioned concurrency on an alias — cannot be attached to $LATEST
aws lambda put-provisioned-concurrency-config \
  --function-name my-func --qualifier prod \
  --provisioned-concurrent-executions 10
```

---

## 💽 EC2 One More Time: Questions That Ask About Boundaries

What the exam repeatedly asks in the EC2 area is not performance figures but **resource boundaries**.

| Resource | Boundary | Practical meaning |
|------|------|------------|
| AMI | **Region** | Must be copied to use in another Region |
| EBS volume | **Availability Zone (AZ)** | To move to another AZ: snapshot → restore in the new AZ |
| Snapshot | **Region** (stored in S3) | The medium for AZ moves and Region copies |
| Security group | **VPC** | Cannot be reused in another VPC, stateful |
| NACL | **Subnet** | Stateless — both inbound and outbound rules must be opened |
| Elastic IP | **Region** | Limits exist per account and Region |

The single line "EBS is AZ-bound" determines the "procedure for moving EC2 to another AZ." There is no way other than taking a snapshot, creating a volume in the target AZ, and attaching it. Likewise, "AMI is Region-bound" leads to the operational habit of "copying the AMI to a DR Region for disaster recovery."

For instance metadata, IMDSv2 is effectively the standard. Because it is a two-step structure in which you first get a token and then query with that token, it blocks the classic attack path of stealing metadata via SSRF.

```bash
# IMDSv2 — first obtain a token (PUT), then present it in a header (GET)
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

> ⚠️ **Pitfall**: A setup that plants access keys in a file on EC2 is a **wrong answer** on the exam. The right answer is to attach an instance profile (IAM role) and let the SDK automatically obtain temporary credentials from the metadata. By the same logic, the answer for Lambda is the execution role, and for ECS tasks it is the taskRole. If "put the credentials in code, environment variables, or the AMI" appears in the options, it is likely a trap.

As a hypothetical case, the cause of a report like "the Lambda that worked fine until yesterday returns intermittent 500s starting today" may be not a code change but a **concurrency wall**. If another team runs a large batch in the same Region and eats into the account concurrency of 1,000, your function gets throttled (`TooManyRequestsException`). The remedy then is not code optimization but (1) securing a share for the important function with **reserved concurrency**, and (2) also setting a cap so that function does not starve other functions. The point that reserved concurrency means both a "guarantee" and a "cap" at once is an easily confused duality.

---

## Wrap-Up

The four services reviewed today are not isolated memorization items but **a single line of path** that one request travels.

- IAM is involved in every arrow along that path.
- API Gateway handles authentication, transformation, and protection (cache, throttle).
- Lambda runs code on top of the execution environment lifecycle.
- EC2 sits beneath it and defines the resource boundaries (Region, AZ, VPC).

When you memorize numbers, if you also attach which point on this path the constraint belongs to, you can first decide "which layer is the problem" in scenario questions. The four sentences that apply across Domain 1 questions are as follows.

- **On a synchronous path, the shortest timeout wins.**
- **Only asynchronous invocations are retried by Lambda.**
- **An explicit Deny beats every Allow.**
- **Give credentials through roles, not code.**

---

## 📝 Final Mock Exam - Part 1

**Question 1.** What problem does Provisioned Concurrency solve in Lambda?

A) High cost  
B) Cold Start latency  
C) Timeout issues  
D) Memory shortage  

**Answer: B** - Provisioned Concurrency pre-initializes execution environments to eliminate Cold Start delays.

---

**Question 2.** What does HTTP 429 error mean in API Gateway?

A) Authentication failure  
B) Too many requests (throttling exceeded)  
C) Server error  
D) Resource not found  

**Answer: B** - HTTP 429 Too Many Requests is returned when API Gateway throttling limit is exceeded.

---

**Question 3.** When Deny and Allow conflict in IAM policy?

A) Allow takes precedence  
B) Deny takes precedence  
C) Last setting takes precedence  
D) Administrator decides  

**Answer: B** - In IAM policy evaluation, explicit Deny always takes precedence over Allow.

---

**Question 4.** Which storage loses data when EC2 instance is stopped then restarted?

A) EBS gp3  
B) EBS io2  
C) Instance Store  
D) EFS  

**Answer: C** - Instance Store is ephemeral storage that is deleted when the instance is stopped or terminated.

---

**Question 5.** Correct way to share data between Lambda functions?

A) Store in Lambda environment variables  
B) Store in /tmp  
C) Use external storage like DynamoDB, S3, ElastiCache  
D) Store in Lambda memory  

**Answer: C** - Data sharing between Lambda functions requires external storage like DynamoDB, S3, ElastiCache. Lambda memory is not shared between instances.

---

**Question 6.** How to immediately invalidate cache in API Gateway?

A) Redeploy API  
B) Call cache deletion API  
C) Request with Cache-Control: max-age=0 header  
D) Set TTL to 0  

**Answer: C** - Include `Cache-Control: max-age=0` header to force API Gateway to fetch latest response from backend.

---

**Question 7.** Where are Lambda Layer files stored?

A) /var/runtime  
B) /opt  
C) /tmp  
D) /var/task  

**Answer: B** - Lambda Layer files are mounted in `/opt` directory.

---

**Question 8.** Correct way to access S3 cross-account?

A) Create IAM user in target account  
B) Use STS AssumeRole for target account role  
C) Enable S3 public access  
D) VPN connection  

**Answer: B** - Use STS AssumeRole to assume target account role and access S3 with temporary credentials.

---

## 📌 Today's Summary

1. IAM: Deny > Allow, STS for temporary credentials, SCP for organization-level limits
2. EC2: Purchase options, EBS types, Instance Store (ephemeral), ALB/NLB differences
3. Lambda: Memory/timeout limits, Cold Start, Concurrency, Layers (/opt)
4. API Gateway: Integration types, Caching, Throttling (429), Authorizer types
5. Common Pattern: Serverless + loose coupling + managed services selection
