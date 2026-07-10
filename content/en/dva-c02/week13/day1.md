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

## 🧠 Domain 1 (Development 32%) Exam Prep Compression

### Frequently Tested Traps - Domain 1

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
| "SnapStart supported runtimes?" | **Java, Python, .NET** |
| "AssumeRole max session?" | **12 hours** |
| "Role Chaining max?" | **1 hour** |
| "STS GetSessionToken max?" | **36 hours** |
| "AssumeRole first call token expiry?" | **1 hour (default)** |

### IAM Policy Evaluation Exactly (Very Frequent Exam Topic)

```
1. Explicit Deny (anywhere) → Deny
2. SCP (Organizations) → Deny if not allowed
3. Resource-based Policy (S3/SQS/Lambda etc) → Allow if OK
4. Identity Policy (IAM)
5. Permissions Boundary → Must be within scope
6. Session Policy (AssumeRole)
→ Allow if all are satisfied
```

### Lambda Concurrency 4 Types (Exactly)

| Type | Unit | Setting |
|------|------|---------|
| **Account Concurrency Limit** | Region-wide | Default 1,000 |
| **Burst Limit** | Immediately available | 500/1000/3000 (by region) + 500/min |
| **Reserved Concurrency** | Per function upper bound | Free |
| **Provisioned Concurrency** | Version/Alias | Charged per hour |

### API Gateway Authentication 5 Types (Memorize)

1. **None** — Public
2. **IAM (SigV4)** — AWS credentials
3. **Lambda Authorizer (TOKEN)** — JWT, OAuth validation
4. **Lambda Authorizer (REQUEST)** — Multi-header validation
5. **Cognito User Pool Authorizer** — Automatic JWT
6. **JWT Authorizer (HTTP API only)** — OIDC

### EC2 Frequent Traps

- AMI is **region-dependent**
- EBS is **AZ-dependent**
- HDD (st1/sc1) cannot be boot volume
- Instance store disappears on **stop/terminate** (reboot persists data)
- IMDSv2 token method highly recommended
- SG = Stateful, NACL = Stateless

---

## 📝 Final Mock Exam - Part 1

**문제 1.** What problem does Provisioned Concurrency solve in Lambda?

A) High cost  
B) Cold Start latency  
C) Timeout issues  
D) Memory shortage  

**정답: B** - Provisioned Concurrency pre-initializes execution environments to eliminate Cold Start delays.

---

**문제 2.** What does HTTP 429 error mean in API Gateway?

A) Authentication failure  
B) Too many requests (throttling exceeded)  
C) Server error  
D) Resource not found  

**정답: B** - HTTP 429 Too Many Requests is returned when API Gateway throttling limit is exceeded.

---

**문제 3.** When Deny and Allow conflict in IAM policy?

A) Allow takes precedence  
B) Deny takes precedence  
C) Last setting takes precedence  
D) Administrator decides  

**정답: B** - In IAM policy evaluation, explicit Deny always takes precedence over Allow.

---

**문제 4.** Which storage loses data when EC2 instance is stopped then restarted?

A) EBS gp3  
B) EBS io2  
C) Instance Store  
D) EFS  

**정답: C** - Instance Store is ephemeral storage that is deleted when the instance is stopped or terminated.

---

**문제 5.** Correct way to share data between Lambda functions?

A) Store in Lambda environment variables  
B) Store in /tmp  
C) Use external storage like DynamoDB, S3, ElastiCache  
D) Store in Lambda memory  

**정답: C** - Data sharing between Lambda functions requires external storage like DynamoDB, S3, ElastiCache. Lambda memory is not shared between instances.

---

**문제 6.** How to immediately invalidate cache in API Gateway?

A) Redeploy API  
B) Call cache deletion API  
C) Request with Cache-Control: max-age=0 header  
D) Set TTL to 0  

**정답: C** - Include `Cache-Control: max-age=0` header to force API Gateway to fetch latest response from backend.

---

**문제 7.** Where are Lambda Layer files stored?

A) /var/runtime  
B) /opt  
C) /tmp  
D) /var/task  

**정답: B** - Lambda Layer files are mounted in `/opt` directory.

---

**문제 8.** Correct way to access S3 cross-account?

A) Create IAM user in target account  
B) Use STS AssumeRole for target account role  
C) Enable S3 public access  
D) VPN connection  

**정답: B** - Use STS AssumeRole to assume target account role and access S3 with temporary credentials.

---

## 📌 Today's Summary

1. IAM: Deny > Allow, STS for temporary credentials, SCP for organization-level limits
2. EC2: Purchase options, EBS types, Instance Store (ephemeral), ALB/NLB differences
3. Lambda: Memory/timeout limits, Cold Start, Concurrency, Layers (/opt)
4. API Gateway: Integration types, Caching, Throttling (429), Authorizer types
5. Common Pattern: Serverless + loose coupling + managed services selection
