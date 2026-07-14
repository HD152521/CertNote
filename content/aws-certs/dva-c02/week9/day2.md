# Day 2 - Secrets Manager and Parameter Store: Getting Secrets Out of Code

"Don't hardcode secrets in your code" is a rule every developer learns on day one, but nobody explains clearly where to actually put them. Environment variables leak on process dumps. Config files require git exclusions. Once a secret escapes, you must change it simultaneously across every server — an operational nightmare. Real security teams go further: "not only prevent leaks, but **auto-rotate periodically.**" Nobody changes a DB password by hand every 90 days — nobody bothers because it's tedious. AWS Secrets Manager and SSM Parameter Store address "secrets outside code, auto-rotated when possible" with two different weight classes.

In DVA-C02, these two are almost always compared. The filter is simple: three questions separate them — Is auto-rotation needed? Is size >8KB? Is cost the top priority? This article explores why the two were born separately, how auto-rotation runs without downtime, and the real-world pattern of cutting call costs with Lambda Extension.

## Why the Two Services Split Apart

Interestingly, Parameter Store came first (2016, part of Systems Manager), and Secrets Manager followed later (2018). Parameter Store originally stored "EC2 boot-time configuration values." Then people started putting passwords in them as SecureString. AWS realized "configuration and secrets have different requirements" — secrets need **auto-rotation, fine-grained versioning, RDS service integration, cross-account sharing**, but Parameter Store wasn't designed for that scope. So AWS spun off Secrets Manager as a secret-only vault.

This birth story fixes each service's character: Parameter Store is "lightweight, hierarchical config storage (can hold secrets too)"; Secrets Manager is "expensive secret vault specialized in rotation and integration."

| Dimension | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| Cost | **$0.40/secret/month** + API | Standard **free**, Advanced $0.05/month |
| Auto Rotation | **Supported**(Lambda-based) | Not supported |
| Size | 64KB | Standard 4KB / Advanced 8KB |
| Hierarchy | Path-based | Path-based(`/app/env/key`) |
| RDS Integration Rotation | **Native** | None |
| Cross-Region Replication | Supported | None |

> 💡 **Related theory**: This split reflects the cloud version of **separation of concerns** from software design. The 12-Factor App says "separate config from code," but config itself splits into "safe-to-expose config (timezone, feature flags)" and "must-never-leak secrets (DB passwords, API keys)" — different protection levels, rotation cycles, and audit rigor. Mashing both into one store forces either over-protection (expensive) or under-protection (risky). AWS separated them, each with its own cost and feature curve.

> ⚠️ **Trap**: "Do both support KMS encryption?" is frequent on exams; the answer is **yes**. Parameter Store SecureString is internally KMS-encrypted. So "encryption support" alone cannot distinguish them. The **real** difference is **auto-rotation** and **RDS integration**. "DB password rotated every 30 days automatically" means Secrets Manager, full stop — Parameter Store has no rotation feature at all.

## Auto-Rotation: Two Strategies to Change Passwords Without Downtime

Secrets Manager's core value is auto-rotation. But changing a password has a subtle trap — the moment you change it, application instances still holding the old one may all hit auth failure. This problem splits rotation into two strategies.

| Strategy | Behavior | Downtime |
|------|------|----------|
| **Single-User** | Replace one user's password with new value | Brief at switchover moment |
| **Alternating-Users** | Swap between two users (A↔B) | Nearly none (recommended) |

Single-User is simple: change the same DB user's password. But right after the change, clients caching the old password attempt connection and briefly fail.

Alternating-Users is clever: keep two DB accounts, `myapp_user` and `myapp_user_clone`. On rotation, **change the currently-unused account's password first**, then switch to it. Keep the old account alive for a while, so clients with cached old passwords continue connecting for a time.

> 🔍 **Going deeper**: Secrets Manager's rotation executes as a **four-step Lambda flow** (`createSecret` → `setSecret` → `testSecret` → `finishSecret`). ① createSecret: Generate new password, store under `AWSPENDING` label (not yet applied to DB). ② setSecret: Actually set the new password in the DB. ③ testSecret: Test the new password with a real connection to verify it works. ④ finishSecret: Promote `AWSPENDING` label to `AWSCURRENT` (now the default version applications receive). The key point: **if ③ testSecret fails, rotation stops and the old password (AWSCURRENT) stays** — the system keeps working on the old secret. This "verify-then-promote" structure makes rotation safe.

> 📚 **Case study**: A team enabled RDS password rotation but saw intermittent auth failures post-rotation. Root cause: the app read the password once at boot and **cached it in memory permanently**. Rotation changed the DB password, but the app kept the old value. Solution: switch to Alternating-Users so the old account stays active one rotation cycle, and add retry logic to the app so auth failures trigger a re-read from Secrets Manager to refresh the cache. Auto-rotation isn't "turn it on and done" — you must consider "how does the client cache the secret?"

```python
import boto3, json

sm = boto3.client('secretsmanager')

# Read secret — always get AWSCURRENT (latest) version
resp = sm.get_secret_value(SecretId='prod/myapp/db')
secret = json.loads(resp['SecretString'])

conn = connect(
    host=secret['host'],
    user=secret['username'],
    password=secret['password'],   # No hardcoding
    database=secret['dbname'],
)
```

## RDS Integration Rotation: AWS Builds the Lambda for You

Writing a secret-rotation Lambda from scratch is fiddly — you must implement all four steps correctly per DB type. Secrets Manager's real strength: **for RDS, DocumentDB, Redshift, AWS auto-generates and manages a validated rotation Lambda**.

| DB | Rotation Method |
|----|-----------|
| RDS MySQL / PostgreSQL / MariaDB | AWS-managed Lambda (Single or Alternating) |
| RDS Oracle / SQL Server | AWS-managed Lambda |
| DocumentDB | AWS-managed Lambda |
| Redshift | AWS-managed Lambda |
| Others (third-party API keys) | Custom Lambda |

> ⚠️ **Trap**: For "RDS password auto-rotation," users do not write Lambda from scratch. Enable rotation in the console, and AWS deploys the right Lambda. If exam choices include "implement Lambda yourself," that's usually wrong (unnecessarily complex); "enable Secrets Manager auto-rotation" is the right answer. Only non-AWS systems (third-party SaaS API keys) need custom Lambda.

## Parameter Store: Lightweight, Hierarchical Config Repository

Parameter Store excels at non-secret configuration. Three types exist:

- **String**: Plaintext config value
- **StringList**: Comma-separated list
- **SecureString**: KMS-encrypted value (passwords, tokens)

```bash
# Plaintext config
aws ssm put-parameter --name /myapp/prod/db-url \
  --value "postgres://mydb.rds.amazonaws.com:5432/app" --type String

# Encrypted secret value (KMS)
aws ssm put-parameter --name /myapp/prod/db-password \
  --value "s3cr3t" --type SecureString --key-id alias/myapp-key

# Fetch with decryption
aws ssm get-parameter --name /myapp/prod/db-password --with-decryption

# Bulk fetch by path — core of hierarchy
aws ssm get-parameters-by-path --path /myapp/prod --recursive --with-decryption
```

> 🔍 **Going deeper**: Without `--with-decryption`, SecureString returns **encrypted**. This is intentional — decryption requires `kms:Decrypt` on that key, so retrieval and decryption permissions separate. You can create a "can see the parameter exists but cannot read plaintext" role. That's why the answer to "how to fetch SecureString in plaintext?" is `--with-decryption`.

Hierarchy is Parameter Store's powerful weapon. Organize by path `/myapp/prod/...`, `/myapp/staging/...`, and gate IAM at the path level to split permissions.

```json
{
  "Effect": "Allow",
  "Action": "ssm:GetParametersByPath",
  "Resource": "arn:aws:ssm:ap-northeast-2:111122223333:parameter/myapp/prod/*"
}
```

> 💡 **Related theory**: Path-based permission splits mirror filesystem directory permissions. Prod ops see only `/myapp/prod/*`; dev team see `/myapp/staging/*`. Organizing resources into a tree and gating permission by subtree repeats throughout cloud infrastructure — Unix file permissions, S3 prefix policies, IAM resource ARN wildcards. Flat naming (`myapp_prod_db_url`) breaks this subtree permission model; design paths first.

Standard vs Advanced tier difference is also an exam point.

| Item | Standard | Advanced |
|------|----------|----------|
| Parameter Count | 10,000 | 100,000 |
| Size | 4KB | 8KB |
| Policies (expiration) | None | Supported |
| Price | Free | $0.05/parameter/month |

## Public Parameters: Secrets AWS Gives Away

Parameter Store includes **public parameters** that AWS provides. Always get the latest AMI ID or ECS-optimized image ID without hardcoding.

```bash
# Latest Amazon Linux 2023 AMI ID, always current
aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64
```

Reference this in CloudFormation so instances always boot with the latest patched AMI without template changes.

## Lambda Extension: Cut Call Costs

Every time a Lambda reads Secrets Manager or Parameter Store via API, you pay ① call cost ② latency on cold and warm starts. AWS's **Parameters and Secrets Lambda Extension** solves this: a local HTTP cache proxy next to your function.

```python
import urllib.request, os, json

def get_secret(name):
    # Extension runs a cache proxy on localhost:2773
    url = f"http://localhost:2773/secretsmanager/get?secretId={name}"
    req = urllib.request.Request(url)
    req.add_header("X-Aws-Parameters-Secrets-Token", os.environ["AWS_SESSION_TOKEN"])
    return json.loads(urllib.request.urlopen(req).read())
```

> 🔍 **Going deeper**: The Extension is a separate process inside the Lambda execution environment, serving cached secrets on localhost (default port 2773). Function code sends HTTP instead of Secrets Manager SDK, and Extension only calls the real API on cache miss. While the same container (warm invocation) is reused, the cache persists, dramatically cutting per-call API requests. TTL is tunable via environment variable. Cold starts make one real call, but every subsequent warm call hits local cache — cost and latency both drop. AWS-managed secure cache replaces the risky pattern of hardcoding secrets in code.

## Cost as the Selector

The most practical decision axis is cost.

```
Storing 100 secrets for a year:
  Parameter Store (Standard):  $0
  Parameter Store (Advanced):  $60   ($0.05 × 100 × 12)
  Secrets Manager:             $480   ($0.40 × 100 × 12) + API
```

For plain config (no rotation, no RDS integration, ≤8KB), Parameter Store Standard crushes the competition. Secrets Manager's $0.40/month buys rotation, RDS integration, 64KB, and cross-region replication.

> ⚠️ **Trap**: "No rotation needed + 8KB or less + cost-first" means Parameter Store is correct. If any of rotation, size, or RDS integration appears, jump to Secrets Manager. The exam disguises this decision tree as scenario: "Rotation needed?" → YES go Secrets Manager, NO → "Size >8KB?" → YES go Secrets Manager, NO → "RDS integration?" → YES go Secrets Manager, all NO → Parameter Store.

## Wrapping Up

Parameter Store started as "lightweight, hierarchical config" and picked up SecureString for light secrets; Secrets Manager was born for "rotation, RDS integration, 64KB, cross-region." Three questions separate them: auto-rotation, size, cost — and rotation always tips toward Secrets Manager. Key points: rotation's four-step validated structure keeps old secrets on failure, SecureString returns ciphertext without `--with-decryption`, Extension cuts call costs with local cache. These fundamentals ground exam and real-world use.

Next we look at another face of secrets: not secret storage but **user authentication itself** — Cognito, which authenticates users and turns that proof into AWS resource permissions.

---

## 📝 연습 문제

**문제 1.** Production RDS MySQL password must auto-rotate every 30 days. What is the best service?

A) SSM Parameter Store SecureString + EventBridge schedule
B) AWS Secrets Manager auto-rotation
C) Lambda-based rotation + Parameter Store storage
D) KMS auto key rotation

**정답: B**

해설: Secrets Manager auto-creates validated rotation Lambda for RDS MySQL, managing four-step rotation (createSecret → setSecret → testSecret → finishSecret). Enable in console; AWS handles it. A) Parameter Store has no rotation feature; scheduling only triggers logic you write. C) Direct Lambda implementation is unnecessarily complex and reinvents the validated wheel. D) KMS key rotation is for encryption keys, not DB passwords. "RDS + auto-rotation" means Secrets Manager.

---

**문제 2.** To fetch SecureString parameter **in plaintext** from SSM Parameter Store, what CLI command?

A) `aws ssm get-parameter --name /key`
B) `aws ssm get-parameter --name /key --with-decryption`
C) `aws ssm get-secure-parameter --name /key`
D) `aws kms decrypt --parameter /key`

**정답: B**

해설: SecureString returns **encrypted by default**; plaintext requires `--with-decryption`. Caller must have `kms:Decrypt` on the key. This separation allows "can see parameter exists, cannot read plaintext" roles. C) No `get-secure-parameter` command exists. D) SSM delegates decryption; KMS decrypt is not called directly.

---

**문제 3.** Which feature do Secrets Manager AND Parameter Store both provide?

A) Lambda-based auto-rotation
B) RDS integration rotation
C) KMS storage encryption
D) 64KB secret storage

**정답: C**

해설: Both use KMS to encrypt stored data — Parameter Store's SecureString is KMS-encrypted. So "encryption support" alone cannot distinguish. A·B) Auto and RDS rotation are Secrets Manager-only. D) 64KB is Secrets Manager only; Parameter Store is Standard 4KB / Advanced 8KB. Real difference is rotation, integration, size — not encryption. Common trap.

---

**문제 4.** Simple config (no rotation, 2KB, cost-minimal) like feature flags. Best choice?

A) Secrets Manager
B) Parameter Store Standard
C) Parameter Store Advanced
D) S3 object

**정답: B**

해説: No rotation + ≤8KB + cost-first = Parameter Store Standard. Standard fits 4KB and is **free**. A) Secrets Manager costs $0.40/month even for one secret with no rotation — overkill. C) Advanced adds 8KB and policies; unnecessary for simple 2KB. D) S3 lacks hierarchy, encryption integration, IAM granularity. Decision tree end: "rotation NO → size NO → RDS NO → cost-first" = Parameter Store Standard.

---

**문제 5.** Lambda reads Secrets Manager per call, accumulating cost and latency. How to reduce calls without hardcoding secrets in code, per AWS?

A) Copy secret to Lambda environment variable in plaintext
B) Use Parameters and Secrets Lambda Extension for local caching
C) Duplicate secret to S3 and read from there
D) Increase Provisioned Concurrency

**정답: B**

해説: AWS Parameters and Secrets Lambda Extension runs a localhost cache proxy (default port 2773), hitting the API only on cache miss while the container (warm invocation) persists. Safe cache replaces risky plaintext code caching. A) Plaintext in env vars = exposure risk + no refresh on rotation. C) S3 duplication expands secret exposure surface. D) Provisioned Concurrency cuts cold starts, not secret call cost.

---

**문제 6.** Alternating-Users rotation beats Single-User why?

A) Cheaper
B) Old account stays alive briefly post-rotation, so cached-old-password clients still connect — near-zero downtime
C) Works with Parameter Store too
D) Also rotates KMS key

**정답: B**

해説: Alternating-Users keeps two DB accounts, rotating the unused one first then switching. Old account lingers one rotation cycle, so clients with cached old password keep connecting post-rotation with nearly no downtime. Single-User swaps immediately in one account, risking brief auth failure. A) Cost-independent. C) Rotation is Secrets Manager feature only. D) DB password rotation, not KMS key rotation.

---

**문题 7.** Auto Scaling template should always boot the latest Amazon Linux 2023 AMI without hardcoding. Best method?

A) Store AMI ID in Secrets Manager
B) Reference Parameter Store Public Parameter (`/aws/service/ami-amazon-linux-latest/...`)
C) Lambda daily updates template AMI ID
D) Inject AMI ID as environment variable

**정答: B**

해説: AWS publishes latest AMI IDs as Parameter Store **Public Parameters**. Reference `/aws/service/ami-amazon-linux-latest/al2023-...` to always fetch the latest patched AMI without hardcoding, direct in CloudFormation/template. A) Secrets Manager is for secrets, not auto-updating values. C) Direct polling is unnecessary complexity. D) Env variables require manual sync.
