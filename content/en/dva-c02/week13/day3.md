# Day 3 - Final Review 3: Security, Monitoring, CI/CD

📅 Date: August 11, 2026 (Tuesday)  
🎯 Topic: Final Review of Security/Monitoring/CI/CD  
⏱️ Study Time: Approximately 120 minutes

---

## 🎯 Learning Objectives

- Complete final review of core exam topics for Security, Monitoring, and CI/CD
- Solve frequently appearing security and operational questions

---

## 📖 Final Core Summary

### Security Core Memory Anchors
```
KMS Direct Encryption: Max 4KB
Envelope Encryption: GenerateDataKey, for data >4KB
CMK: $1/month, key policy required
Secrets Manager: Auto rotation, $0.40/secret, 65KB
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

## 🧠 Domain 2·3·4 - Security·Deployment·Monitoring Exam Prep

### KMS Trap Collection

| Trap | Answer |
|------|--------|
| "Encrypt API limit?" | **4 KB** |
| "AWS Managed Key rotation?" | **1 year** (2022+ changed) |
| "CMK cost?" | **$1/month** + API calls |
| "Multi-Region Key purpose?" | CRR, DDB Global, multi-region |
| "No Key Policy?" | Cannot access via IAM policy |
| "Bucket Key effect?" | SSE-KMS cost 99% ↓ |
| "Grant purpose?" | Temporary·one-time permission (don't modify Key Policy) |
| "KMS API limit?" | Key 5,500~30,000 RPS |
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
| "Lambda trigger count?" | 11 (PreSignUp etc) |

### WAF·Shield·ACM Traps

| Trap | Answer |
|------|--------|
| "WAF not applicable to?" | NLB, HTTP API (direct) |
| "Shield Advanced cost?" | **$3,000/month** + data |
| "Shield Advanced benefit?" | Cost protection + SRT (24/7) + WAF included |
| "ACM CloudFront cert region?" | **us-east-1 required** |
| "Direct ACM install on EC2?" | **Not possible** |
| "Private CA cost?" | $400/month |

### CloudWatch Traps

| Trap | Answer |
|------|--------|
| "EC2 default monitoring interval?" | **5 minutes** (Detailed = 1 minute) |
| "EC2 default metrics missing?" | Memory, disk usage |
| "CloudWatch Logs default retention?" | **Indefinite** |
| "Logs single PutLogEvents?" | **1 MB** |
| "EMF purpose?" | Lambda metrics without PutMetricData API |
| "Anomaly Detection?" | ML-based auto threshold |

### X-Ray Traps

| Trap | Answer |
|------|--------|
| "Lambda enable?" | Active Tracing toggle |
| "EC2/ECS enable?" | X-Ray Daemon (UDP 2000) |
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
| "Multi-region vs Organization Trail?" | Region-wide vs account-wide |
| "CloudTrail Lake?" | 7-year SQL analytics data lake |

### CI/CD Traps

| Trap | Answer |
|------|--------|
| "buildspec order?" | install → pre_build → build → post_build |
| "appspec EC2 vs Lambda?" | YAML 10 hooks vs YAML 2 hooks |
| "Lambda Canary10Percent5Minutes?" | 10% → 5 min then 100% |
| "ECS deployment strategy?" | **Blue/Green only** |
| "Beanstalk safest?" | **Immutable** or **Blue/Green** |
| "Manual Approval timeout?" | **7 days**, deny if no response |
| "EC2 CodeDeploy required?" | **Agent installation** |

---

## 📝 Final Mock Exam - Part 3

**문제 1.** To safely encrypt 100MB file with KMS?

A) Call kms:Encrypt API directly  
B) Envelope Encryption (GenerateDataKey)  
C) Use S3 SSE-S3  
D) Not possible  

**정답: B** - KMS direct encryption has 4KB limit, so 100MB file requires Envelope Encryption.

---

**문제 2.** To analyze where latency occurs in Lambda execution path?

A) CloudWatch Metrics  
B) CloudTrail  
C) X-Ray  
D) VPC Flow Logs  

**정답: C** - X-Ray distributed tracing records execution time of each service as segments to identify bottlenecks.

---

**문제 3.** To gradually transition to new Lambda version with auto-rollback on error?

A) CodeDeploy AllAtOnce  
B) CodeDeploy Canary or Linear  
C) CloudFormation update  
D) Manual deployment  

**정답: B** - CodeDeploy Canary/Linear gradually shifts traffic and auto-rollbacks on error detection.

---

**문제 4.** Architecture to instantly detect root login?

A) CloudWatch alarm  
B) CloudTrail + EventBridge + SNS  
C) GuardDuty  
D) Config rule  

**정답: B** - Detect root login from CloudTrail, send instant notification via EventBridge→SNS.

---

**문제 5.** To use SSM Parameter Store SecureString in code?

A) Auto inject as environment variable without API  
B) ssm:GetParameter API with --with-decryption option  
C) Call KMS decrypt API directly  
D) Use Secrets Manager API  

**정답: B** - GetParameter API with `--with-decryption` returns KMS-decrypted value.

---

**문제 6.** Safe way to use DB password in buildspec.yml?

A) Plain text in buildspec.yml  
B) Environment variable as plain text  
C) Reference Secrets Manager ARN in secrets-manager section  
D) Save to S3 file then download  

**정답: C** - buildspec.yml `env.secrets-manager` section references Secrets Manager ARN for safe injection.

---

**문제 7.** To set different DB URL per environment in Elastic Beanstalk?

A) Modify buildspec.yml  
B) Set environment variables in .ebextensions with option_settings  
C) Store config file in S3  
D) Hardcode in app  

**정답: B** - `.ebextensions/*.config` `option_settings` allows different environment variables per environment.

---

**문제 8.** To filter traces by orderId in X-Ray?

A) Store orderId in Metadata  
B) Store orderId in Annotation  
C) Print orderId in logs  
D) Use CloudWatch dashboard  

**정답: B** - X-Ray Annotations are indexed for filtering. Metadata is not indexed and cannot filter.

---

## 📌 Today's Summary

1. Security: KMS (4KB limit/Envelope), Cognito (User Pool/Identity Pool), WAF/Shield
2. Secrets Manager: Auto rotation, RDS integration / Parameter Store: Free, hierarchical
3. Monitoring: CloudWatch (metrics/alarms), X-Ray (tracing/Annotation), CloudTrail (audit)
4. CI/CD: CodeBuild (buildspec), CodeDeploy (appspec), CodePipeline (orchestration)
5. Pattern: Root detection (CloudTrail→EventBridge→SNS), Gradual deployment (Canary)
