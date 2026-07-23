# Day 3 - Design Principles of Secret Management: The Criteria That Separate Secrets Manager from Parameter Store

The root cause of the 2019 Capital One breach was IAM credential theft through the EC2 IMDS (Instance Metadata Service). But before that, the common cause of the countless credential-exposure incidents companies suffered was far simpler — the password was written in plaintext in the source code. Something like `DB_PASS: mysecretpassword` under `env.variables`. Blocking this problem structurally is the reason `env.secrets-manager` and `env.parameter-store` exist.

Secret management is not only a question of "where do you store it." "Who fetches it and when," "what happens when the key changes," and "how much do you pay" are all design decisions. AWS covers this spectrum with two services — Secrets Manager (automatic rotation, expensive) and SSM Parameter Store (simple, cheap or free).

## Secrets Manager vs Parameter Store: A Decision Tree

| Item | AWS Secrets Manager | SSM Parameter Store |
|------|---------------------|---------------------|
| Automatic rotation | ✅ Lambda-based | ❌ (manual or external automation) |
| Size limit | 64 KB | Standard 4 KB / Advanced 8 KB |
| Versioning | AWSCURRENT / AWSPENDING / AWSPREVIOUS | VersionId (incrementing integer) |
| Cost | $0.40/secret/month + $0.05 per 10,000 API calls | Standard free / Advanced $0.05/parameter/month |
| Resource Policy | ✅ (cross-account sharing) | Advanced only |
| Native RDS integration | ✅ (RDS, Redshift, DocumentDB) | ❌ |
| KMS encryption | always (CMK optional) | optional with SecureString |
| Lambda Extension | ✅ | ✅ (same Extension) |

**Decision rules**:
- RDS/Redshift/DocumentDB passwords + automatic rotation needed → **Secrets Manager**
- Simple configuration values (DB host, environment flags) → **Parameter Store Standard (free)**
- Secret but no rotation needed → **Parameter Store SecureString (KMS-encrypted)**
- More than 100 values, most needing no rotation → **mixed** (Secrets Manager only for what needs rotation)

> 💡 **Related theory**: Secret management is an extension of the **Principle of Least Privilege**. The fewer people and systems that know a secret, the smaller the attack surface. Secrets Manager's Resource Policy and Parameter Store's IAM path-based permissions (`/myapp/prod/*`) are the practical tools of this principle. Every path that accesses a secret must carry a least-privilege IAM policy.

## CodeBuild Automatic Injection: How the env Block Works Internally

```yaml
version: 0.2
env:
  parameter-store:
    DB_HOST: /myapp/prod/db-host          # String or SecureString
    LOG_LEVEL: /myapp/prod/log-level
  secrets-manager:
    DB_PASS: prod/db:password::AWSCURRENT
    API_KEY: prod/api-key
    #         secretId:jsonKey:versionStage:versionId
    # without jsonKey, the whole secret value (string)
    # with jsonKey, only that key's value is extracted from the JSON
```

When the build starts, CodeBuild parses this block and calls the specified service's API to fetch the values. **This fetch happens exactly once, at build start.** After that, they are usable as environment variables throughout the build.

**Required IAM permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameters", "ssm:GetParameter"],
      "Resource": "arn:aws:ssm:ap-northeast-2:123456789:parameter/myapp/prod/*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:ap-northeast-2:123456789:secret:prod/*"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:ap-northeast-2:123456789:key/<cmk-key-id>"
    }
  ]
}
```

When `kms:Decrypt` is needed: when a SecureString parameter is encrypted with a CMK, or when a Secrets Manager secret is encrypted with a CMK. AWS managed keys (`alias/aws/ssm`, `alias/aws/secretsmanager`) are implicitly allowed for the service role and need no separate permission.

> ⚠️ **Pitfall**: The most common mistake — you have `secretsmanager:GetSecretValue` but not `kms:Decrypt`, producing an `AccessDenied: not authorized to decrypt` error. If you use a CMK, you must add the KMS permission separately. The error message mentions "Secrets Manager," but the real problem is in KMS.

## The Secrets Manager Rotation Mechanism: PENDING → CURRENT → PREVIOUS

Rotation is the process of periodically replacing a secret's value with a new one. For this process to be safe, there must be no conflict between "systems using the old value" and "generating the new value."

**The 4 steps of Single User Rotation:**
```
1. createSecret: generate a new password → AWSPENDING label
2. setSecret:    update the DB user's password to the new value
3. testSecret:   verify a DB connection with the new password
4. finishSecret: AWSPENDING → AWSCURRENT, AWSCURRENT → AWSPREVIOUS
```

**Multi-User Rotation (Alternating Users):**
- Two DB user accounts (user1, user2) are used alternately
- While user1 is CURRENT, user2's password is replaced and prepared as PENDING
- After the swap completes, user2 becomes CURRENT and user1 becomes PREVIOUS
- At no point is there a moment of "not knowing a valid password" → zero-downtime

```bash
# configure RDS-integrated rotation
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-rules AutomaticallyAfterDays=30 \
  --rotation-lambda-arn arn:aws:lambda:...:function:SecretsManagerRDSPostgreSQLRotationMultiUser
```

> 💡 **Related theory**: Multi-User Rotation applies the distributed-systems **Blue/Green deployment pattern** to credentials. Two valid credentials always exist, the system uses the current CURRENT, and it switches over when the new credential is ready. This is the same logic as the "period during which the old and new versions coexist" in software deployment.

> 📚 **Case study**: According to GitLab's 2023 security incident report, there was a case where long-lived credentials without automatic rotation configured were exposed to an attacker for several months. Had the rotation period been 30 days, the maximum exposure window would have been limited to 30 days. Secrets Manager's automatic rotation is the core security control that turns "maximum exposure window" into a configurable number.

## Parameter Store SecureString: Hierarchical Naming and Path-based Permissions

```bash
# create
aws ssm put-parameter \
  --name /myapp/prod/db-pass \
  --value "supersecret" \
  --type SecureString \
  --key-id alias/myapp-cmk   # uses a CMK. The default is alias/aws/ssm

# retrieve
aws ssm get-parameter \
  --name /myapp/prod/db-pass \
  --with-decryption

# bulk retrieval by path
aws ssm get-parameters-by-path \
  --path /myapp/prod \
  --recursive \
  --with-decryption
```

The advantage of hierarchical naming (`/app/env/key`): you can grant permissions by path prefix in IAM policies.

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParametersByPath", "ssm:GetParameter"],
  "Resource": "arn:aws:ssm:*:*:parameter/myapp/prod/*"
}
```

This single policy grants access to every parameter under `/myapp/prod/`. Access to `/myapp/dev/*` is denied. Environment separation naturally falls out of the IAM path structure.

> 🔍 **Going deeper**: Parameter Store is believed to run on DynamoDB internally (AWS has never confirmed it officially, but it's inferred from behavioral patterns). In the Standard tier, the GetParameter API is throttled with a default limit of **40 TPS** (40 calls per second). If dozens of builds run concurrently and each fetches multiple values from Parameter Store, throttling occurs. The Advanced tier supports up to 1,000 TPS. In large-scale parallel build environments, you must check this limit.

## Cross-Account Secret Sharing: Patterns and Required Elements

The pattern for managing shared secrets in a multi-account environment:

```json
// Secrets Manager Resource Policy (account A, which owns the secret)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::BUILDER-ACCOUNT-B:role/CodeBuildServiceRole"
    },
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```

Three elements required for cross-account access:
1. **The secret's Resource Policy**: allow the consumer account's Role
2. **The KMS key Policy**: allow Decrypt for the consumer account's Role
3. **The consumer account's IAM Policy**: allow GetSecretValue on that ARN

VPC Peering and PrivateLink are not required — the Secrets Manager API is accessed through the AWS public API endpoint.

> 🎯 **Scenario**: There are 3 accounts (dev, staging, prod), and a shared API key is managed in a dedicated "secrets" account. Each account's CodeBuild must reference this key. The design: (1) create the Secrets Manager secret in the secrets account, (2) allow the CodeBuildRole of the dev/staging/prod accounts via the Resource Policy, (3) grant the same cross-account access in the KMS key Policy, (4) in each buildspec, specify the full ARN as `env.secrets-manager: arn:aws:secretsmanager:...:secret:shared/api-key`. This pattern is the standard for multi-account secret sharing.

## Secret Patterns in Lambda and ECS: Runtime Injection

Two patterns for fetching secrets at actual application runtime, rather than at build time in CodeBuild:

**Lambda: AWS Parameters and Secrets Lambda Extension**
```
# When the Extension is installed, an HTTP server opens on localhost
GET http://localhost:2773/secretsmanager/get?secretId=prod/db

Headers:
  X-Aws-Parameters-Secrets-Token: <session-token>
```

```python
import urllib.request
import json
import os

def get_secret(secret_id):
    url = f"http://localhost:2773/secretsmanager/get?secretId={secret_id}"
    req = urllib.request.Request(url, headers={
        "X-Aws-Parameters-Secrets-Token": os.environ["AWS_SESSION_TOKEN"]
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(json.loads(resp.read())["SecretString"])
```

The Extension has a TTL-based cache. Within the same Lambda execution environment (warm state) it returns from cache, and once the TTL (300 seconds by default) passes it calls the API again. This is why it's better than "putting the secret in a Lambda environment variable" — environment variables are visible in the console and don't reflect rotated values, whereas the Extension refreshes automatically once the cache expires.

**ECS: The Task Definition secrets block**
```json
{
  "containerDefinitions": [{
    "name": "web",
    "image": "myapp:latest",
    "secrets": [
      {
        "name": "DB_PASS",
        "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:123456789:secret:prod/db:password::"
      },
      {
        "name": "DB_HOST",
        "valueFrom": "arn:aws:ssm:ap-northeast-2:123456789:parameter/myapp/prod/db-host"
      }
    ]
  }]
}
```

The ECS Task Execution Role needs Secrets Manager and KMS permissions. **Downside**: values are injected into container environment variables in plaintext, so they are visible via `docker inspect` or in the ECS console. To solve that, you have to use the Extension pattern inside the container.

> 💡 **Related theory**: The Lambda Extension is an implementation of the **sidecar pattern**. In microservices, a process running separately from the main service handles common functions (logging, secret management, health checks). In Kubernetes it's implemented as a sidecar container; in Lambda it's implemented as an Extension process. Same concept, different form.

## Cost Optimization: Calculating the Cost of 100 Secrets

A realistic cost calculation:

| Configuration | Monthly cost |
|------|---------|
| All 100 in Secrets Manager | $0.40 × 100 = $40/month |
| All 100 in Parameter Store Advanced | $0.05 × 100 = $5/month |
| 100 in Parameter Store Standard + 0 | $0/month |
| 10 in Secrets Manager + 90 in Param Standard | $0.40 × 10 = $4/month |

API call costs:
- Secrets Manager: $0.05 per 10,000 calls
- Parameter Store Standard: **free** (but with a TPS limit)
- Parameter Store Advanced: $0.05 per 10,000 calls

Conclusion: Secrets Manager only for what needs automatic rotation, Parameter Store Standard for the rest — that's the standard cost optimization.

> 🔍 **Going deeper**: What people often miss in cost calculations is the **cost of rotation Lambda invocations**. Rotating 100 secrets every 30 days means the rotation Lambda is invoked more than 400 times a month (4 steps × 100 secrets). Lambda invocation cost is very low, but since rotation itself involves RDS API calls, verification DB connections, and so on, it's good practice to track the total cost of the rotation process. Tracking Secrets Manager cost under a separate tag in AWS Cost Explorer gives you an accurate picture.

## Build Stability and Rotation Conflicts: What Actually Happens

**Q: What if the secret rotates while the build is running?**

A: CodeBuild calls `GetSecretValue(versionStage=AWSCURRENT)` at build start and sets it into an environment variable. That value does not change until the build ends. Rotation does not affect build environment variables.

**Q: What if rotation happens while the build is running a DB migration?**

A: It is connected using the AWSCURRENT value fetched at build start. As rotation proceeds, the new password becomes AWSPENDING and then AWSCURRENT after verification. At that moment the existing DB session is already connected, so it is maintained. However, if the build attempts a new connection mid-flight, it will try to connect with the old password and can fail. The reason AWSPREVIOUS remains valid during a grace period is precisely to prevent this conflict.

## A Practical Example: A Full RDS Password Rotation Pipeline

```bash
# 1) create a secret integrated with RDS
aws secretsmanager create-secret \
  --name prod/myapp-rds \
  --secret-string '{"username":"admin","password":"initial","engine":"postgres","host":"mydb.ap-northeast-2.rds.amazonaws.com","port":5432,"dbname":"myapp"}' \
  --kms-key-id alias/myapp-secrets

# 2) configure 30-day automatic rotation
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-rules AutomaticallyAfterDays=30 \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:123456789:function:SecretsManagerRDSPostgreSQLRotationSingleUser

# 3) buildspec
cat > buildspec.yml << 'EOF'
version: 0.2
env:
  secrets-manager:
    DB_PASS: prod/myapp-rds:password
    DB_HOST: prod/myapp-rds:host
    DB_NAME: prod/myapp-rds:dbname
    DB_USER: prod/myapp-rds:username
phases:
  build:
    commands:
      - PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/migrate.sql
      - echo "Migration complete"
EOF
```

---

## 📝 연습 문제

**문제 1.** Of 100 configuration values, 10 are DB passwords that need automatic rotation every 30 days, and the remaining 90 are ordinary settings such as host names and environment flags. What is the cost-optimal configuration?

A) All 100 in Secrets Manager ($40/month)
B) 10 in Secrets Manager + 90 in Parameter Store Standard ($4/month)
C) 100 in Parameter Store Advanced ($5/month)
D) 100 in Parameter Store Standard + a custom rotation script ($0/month but no rotation)

**정답: B**
해설: The optimum is Secrets Manager for only the 10 that need automatic rotation ($0.40 each per month = $4/month) and Parameter Store Standard (free) for the remaining 90. D has the lowest cost but lacks automatic rotation and therefore fails the requirement.

---

**문제 2.** You granted `secretsmanager:GetSecretValue` to the CodeBuild Service Role but get an "AccessDenied" error. What is the most likely cause and fix?

A) Exceeding a Secrets Manager service quota → request a limit increase from Support
B) The secret is encrypted with a CMK → add `kms:Decrypt` for that CMK to the Service Role
C) buildspec version is 0.1 → change it to 0.2
D) Subnet misconfiguration → disable VPC mode

**정답: B**
해설: A secret encrypted with a CMK (Customer Managed Key) triggers a separate KMS API call at the decryption step after GetSecretValue. If the Service Role lacks `kms:Decrypt` for that KMS call, AccessDenied occurs. When you use an AWS managed key, this permission is implicitly allowed.

---

**문제 3.** Why is Secrets Manager's Multi-User Rotation better than Single User Rotation?

A) It costs less
B) A valid credential always exists even during rotation, so there is no application downtime
C) It's simpler to configure
D) It supports cross-account rotation

**정답: B**
해설: With Single User Rotation, there can be a very short "window" in which the old password is invalidated the moment the rotation Lambda changes the DB password. Multi-User always has two user accounts and replaces the PENDING account's password while the current CURRENT account is active, so this window does not exist. It's the standard choice for highly available applications.

---

**문제 4.** What is the most recommended way to use a Secrets Manager secret from a Lambda function?

A) Store the secret directly in Lambda environment variables (with KMS encryption)
B) Call GetSecretValue with the SDK on every function invocation
C) Add the AWS Parameters and Secrets Lambda Extension as a Layer and access it over localhost HTTP
D) Store a secrets file in S3 and download it at function start

**정답: C**
해설: The Lambda Extension provides a TTL-based cache that reduces unnecessary API calls and automatically refreshes rotated secrets. With A, values are visible in the console and the function must be redeployed on rotation. B makes an API call on every invocation, risking throttling. D is complex to manage.

---

**문제 5.** A secret in Secrets Manager was rotated while a build was in progress. What is the effect on the build?

A) The build fails immediately
B) Environment variables were fetched once at build start, so there is no effect; however, if the build attempts a new connection via the SDK, the AWSPREVIOUS grace period applies
C) CodeBuild automatically injects the new value into the environment variable
D) The build restarts

**정답: B**
해설: Values in the `env.secrets-manager` block are fetched exactly once at build start. Even if rotation occurs mid-build, the value already in the environment variable does not change. If build code calls GetSecretValue again via the SDK, it receives the new AWSCURRENT. AWSPREVIOUS remains valid for a period even right after rotation, preventing sudden failures of in-flight connections.

---

**문제 6.** Which of the following is NOT required to fetch a Secrets Manager secret cross-account?

A) Allowing the consumer account's Role in the secret's Resource Policy
B) Allowing cross-account Decrypt in the KMS key Policy
C) GetSecretValue IAM permission on the consumer account's Role
D) VPC Peering or PrivateLink

**정답: D**
해설: Secrets Manager is accessed through the AWS public API endpoint. Network-level VPC connectivity is not required for cross-account access. What is required is the three IAM/policy configurations (Resource Policy, KMS Key Policy, consumer Role IAM Policy). Using a VPC Endpoint routes traffic over the AWS internal network, but it is not mandatory.

---

**문제 7.** What are the two most important differences between Parameter Store Standard and Advanced?

A) Standard cannot use KMS encryption, Advanced can
B) Standard is 4KB per parameter / free / no Resource Policy; Advanced is 8KB / $0.05 per month / supports Resource Policy
C) Only Advanced can be referenced from `env.parameter-store`
D) Standard only works in ap-northeast-2

**정답: B**
해설: The practical differences between Standard and Advanced: (1) value size (4KB vs 8KB), (2) cost (free vs $0.05/parameter/month), (3) Resource Policy (absent vs present). KMS SecureString is supported in Standard as well. To do cross-account secret sharing with Parameter Store, you need Advanced (for the Resource Policy).

---
