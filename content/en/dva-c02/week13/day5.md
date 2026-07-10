# Day 5 - Final Mock Exam + Exam Preparation Complete

📅 Date: August 13, 2026 (Thursday)  
🎯 Topic: DVA-C02 Final Mock Exam & Exam Preparation  
⏱️ Study Time: Approximately 130 minutes (same as exam)

---

## 🎯 Learning Objectives

- Complete full mock exam in exam format
- Identify weak areas and do final review
- Establish exam day strategy

---

## 📖 Exam Information Final Confirmation

```
Exam Name: AWS Certified Developer - Associate (DVA-C02)
Duration: 130 minutes
Questions: 65 (50 scored + 15 unscored)
Passing Score: 720/1000
Cost: $150 USD
Languages: Korean and other languages supported
Question Types: Single choice (4 options), Multiple choice (5-6 with 2-3 correct)
```

---

## 📝 Final Mock Exam (30 Questions)

**1.** If Lambda processes 100 requests/second with average 2-second execution time, required concurrency is?

A) 50  
B) 100  
C) 200  
D) 300  

**정답: C** - Concurrency = Requests/sec (100) × Avg execution time (2) = 200

---

**2.** Writing 7KB item via transaction in DynamoDB consumes how many WCU?

A) 7 WCU  
B) 14 WCU  
C) 4 WCU  
D) 2 WCU  

**정답: B** - ceil(7/1) × 2 = 7 × 2 = 14 WCU (transactions cost 2x)

---

**3.** Potential issue when using SSE-KMS on S3?

A) Data loss risk  
B) KMS API call limit exceeded (throttling)  
C) Encryption performance degradation  
D) Bucket size limit  

**정답: B** - High traffic SSE-KMS calls KMS API for every object access, can hit KMS call limits.

---

**4.** To receive original HTTP request headers, query params, body in Lambda from API Gateway?

A) AWS integration type  
B) HTTP integration type  
C) AWS_PROXY (Lambda Proxy) integration  
D) MOCK integration  

**정답: C** - Lambda Proxy passes all original HTTP info (method, headers, query, body) as Lambda event.

---

**5.** Common point between Kinesis Data Streams and SQS?

A) Multiple Consumers can read simultaneously  
B) Order guaranteed  
C) Message/record retention period exists  
D) Unlimited throughput  

**정답: C** - Both have retention periods (SQS max 14 days, Kinesis max 365 days).

---

**6.** When ValidateService step fails in CodeDeploy deployment?

A) Deployment marked successful  
B) Auto rollback  
C) Manual rollback required  
D) Alarm triggered  

**정답: B** - CodeDeploy auto-rollbacks to previous version on ValidateService failure.

---

**7.** To convert log pattern to metric and set alarm in CloudWatch?

A) CloudWatch Insights  
B) Metric Filter  
C) CloudTrail  
D) EventBridge  

**정답: B** - Metric Filter converts log patterns to CloudWatch metrics for alarming.

---

**8.** For 10-minute message processing in SQS, appropriate VisibilityTimeout?

A) 30 seconds (default)  
B) 5 minutes  
C) 15 minutes (longer than processing)  
D) 12 hours  

**정답: C** - Set VisibilityTimeout longer than processing time (10 min → 15+ min).

---

**9.** To implement Facebook social login in Cognito?

A) Identity Pool alone  
B) User Pool (social provider integration)  
C) SAML federation  
D) OpenID Connect  

**정답: B** - Cognito User Pool directly integrates Facebook, Google, Apple etc. for social login.

---

**10.** Aurora Global Database disaster recovery targets?

A) RPO < 5 min, RTO < 1 hour  
B) RPO < 1 sec, RTO < 1 min  
C) RPO < 1 hour, RTO < 4 hours  
D) RPO = 0, RTO = 0  

**정답: B** - Aurora Global provides <1 second replication lag (RPO) and <1 minute failover (RTO).

---

**11.** Prerequisites for Lambda to access RDS in VPC?

A) Place Lambda in public subnet  
B) Configure Lambda in VPC, ensure RDS connectivity via security group/subnet  
C) NAT gateway required  
D) VPN connection needed  

**정답: B** - Lambda must be in VPC with proper security group and subnet config to reach RDS.

---

**12.** To let client upload file to S3 without going through server?

A) S3 Transfer Acceleration  
B) Multipart upload  
C) PUT presigned URL  
D) S3 gateway endpoint  

**정답: C** - Lambda generates PUT presigned URL, client uploads directly to S3 bypassing server.

---

**13.** To prevent hot partition in DynamoDB, partition key selection criterion?

A) Date/time  
B) Status code  
C) High cardinality (UserId, UUID etc)  
D) Country code  

**정답: C** - High cardinality partition key distributes data/traffic evenly, preventing hot partition.

---

**14.** To prevent S3 bucket deletion when CloudFormation stack is deleted?

A) Special chars in bucket name  
B) Set DeletionPolicy: Retain  
C) Enable S3 versioning  
D) Deny deletion via bucket policy  

**정답: B** - `DeletionPolicy: Retain` keeps resource when stack is deleted.

---

**15.** To run multiple Lambda in parallel in Step Functions then proceed after all complete?

A) Choice state  
B) Wait state  
C) Parallel state  
D) Map state  

**정답: C** - Parallel state executes multiple branches concurrently, proceeds after all complete.

---

**16.** To track all requests in X-Ray sampling config?

A) rate: 1.0, fixed_target: 0  
B) rate: 0.05, fixed_target: 1  
C) SamplingRate: 100%  
D) Not possible in X-Ray  

**정답: A** - `fixed_target: 0, rate: 1.0` tracks all requests (watch cost).

---

**17.** Required response format from Lambda in API Gateway (Lambda Proxy integration)?

A) Response body only  
B) {"statusCode": ..., "headers": ..., "body": ...}  
C) HTTP response object direct  
D) JSON body only  

**정답: B** - Lambda Proxy must return `{statusCode, headers, body}` format.

---

**18.** Appropriate engine for ElastiCache as session store?

A) Memcached - simple and fast  
B) Redis - persistence, prevent session loss  
C) Both same  
D) Use RDS instead  

**정답: B** - Use Redis for session persistence to prevent data loss, or Memcached for simple cache.

---

**19.** How GitHub change detection works in CodePipeline?

A) Periodic polling  
B) GitHub webhook event-driven  
C) Manual trigger  
D) S3 event  

**정答: B** - CodePipeline starts immediately via GitHub webhook on push event.

---

**20.** When Lambda reads DynamoDB and gets `ProvisionedThroughputExceededException`?

A) Increase Lambda memory  
B) Increase DynamoDB RCU or switch to on-demand  
C) Increase Lambda concurrency  
D) Enable API Gateway caching  

**정답: B** - This error means DynamoDB read capacity exceeded, increase RCU or use on-demand mode.

---

**21.** When Customer Managed Key is deleted in KMS?

A) Deleted immediately  
B) Deleted after 7-30 day waiting period  
C) Cannot be deleted permanently  
D) Requires AWS approval  

**정답: B** - CMK deletion has 7-30 day scheduled deletion period, can be cancelled during this time.

---

**22.** To prevent duplicate message sending twice on SQS FIFO queue?

A) Use MessageGroupId  
B) Use MessageDeduplicationId  
C) Set VisibilityTimeout  
D) Set DLQ  

**정답: B** - FIFO MessageDeduplicationId prevents duplicate message processing within 5 minutes.

---

**23.** To control CloudFormation resource creation order?

A) Alphabetically auto-determined  
B) Use DependsOn attribute  
C) Separate into different stacks  
D) Cannot control order  

**정답: B** - `DependsOn` attribute controls resource creation order.

---

**24.** To debug external API timeout in Lambda using X-Ray?

A) Check CloudWatch logs  
B) Check X-Ray service map and trace for external HTTP subsegment timing  
C) Check API Gateway logs  
D) Check Lambda environment variables  

**정답: B** - X-Ray SDK auto-records external HTTP calls, service map visualizes delay.

---

**25.** Advantage of Elastic Beanstalk Rolling with Additional Batch?

A) Fastest deployment  
B) Maintains full capacity during deployment  
C) Easiest rollback  
D) Lowest cost  

**정답: B** - Rolling with Additional Batch creates extra instances maintaining full capacity during deployment.

---

**26.** Main difference between Kinesis Firehose and Kinesis Streams?

A) Only cost differs  
B) Firehose is managed delivery (near RT), Streams is direct processing (real-time)  
C) Streams is more expensive  
D) Only Firehose supports multiple Consumers  

**정답: B** - Firehose serverlessly delivers to S3/Redshift, Streams requires direct processing.

---

**27.** Why does IAM role need trust policy?

A) Required for role creation  
B) Defines which entities can assume this role  
C) Defines role permission scope  
D) Controls role cost  

**정답: B** - Trust Policy defines which services/users/accounts can AssumeRole.

---

**28.** Purpose of API Gateway Stage Variable?

A) Improve API performance  
B) Specify different Lambda/endpoint per environment (dev/staging/prod)  
C) Configure caching  
D) Configure auth  

**정답: B** - Stage Variables allow same API structure to route to different Lambda aliases/endpoints per environment.

---

**29.** When Lambda times out processing SQS message?

A) Immediately moves to DLQ  
B) Returns to queue after VisibilityTimeout  
C) Deleted  
D) Stays in processing forever  

**정답: B** - Failed Lambda (timeout included) returns message to queue after VisibilityTimeout.

---

**30.** To implement "loose coupling" architecture in DVA-C02?

A) Direct API calls between services  
B) Use messaging services like SQS, SNS, EventBridge  
C) Integrate all services in one Lambda  
D) Share data through RDS  

**정답: B** - SQS, SNS, EventBridge messaging reduces direct service dependencies enabling loose coupling.

---

## 🎯 Exam Day Strategy

```
1. Day before exam:
   - Final review of core memory anchors
   - Get sufficient sleep
   
2. During exam:
   - Solve confident questions first
   - Flag confusing questions for later
   - Review flagged questions with remaining time
   - First answer usually correct (change carefully)
   
3. Common pitfalls to avoid:
   - Multi-AZ is not performance improvement (high availability)
   - GSI is eventually consistent only
   - S3 static website is HTTP only
   - CloudFront ACM must be us-east-1
   - EC2 memory/disk are not default CloudWatch metrics
   - DLQ set on SNS/SQS, use Lambda Destinations
```

---

## 🧠 30-Second Pre-Exam Checklist - Never Forget

### Number Memory (Very Frequent on Exam)

```
Lambda     Memory 10240MB · Timeout 15min · /tmp 10GB · Layer 5 · ZIP 250MB · Container 10GB
           Concurrency 1000 default · Async retry 2 · Sync payload 6MB · Async 256KB · Streaming 20MB
DynamoDB   Item 400KB · Transaction 100·4MB · LSI 5·creation-only · GSI 20·anytime
           Streams 24h · Burst 5min · 3000 RCU + 1000 WCU per partition
S3         Object 5TB · Single PUT 5GB · Multipart 5MB~5GB · Parts 10000
           Glacier min 90d · Deep Archive 180d · IA 30d · IA min 128KB
SQS        Message 256KB · Retention 1m~14d · VT 0~12h · FIFO 300/s (High 70k)
Kinesis    Shard 1MB/s write·1000 RPS · 2MB/s read · 24h~365d retention · On-Demand 200MB/s
EC2        UserData 16KB · Spot 2min warning · SG 60 rules · Instance 5 SG
STS        AssumeRole 1h~12h · Chain 1h · GetSessionToken 36h
RDS        IAM token 15min · Auto backup 35d · Read Replica 5 (Aurora 15)
Aurora     3 AZ × 6 copies · Backtrack 72h · Global RTO 1min/RPO 1sec
API GW     Cache 0.5~237GB · TTL 300s · 429 throttle · WebSocket idle 10min·max 2h
KMS        Encrypt 4KB · CMK $1/mo · Auto rotate 1yr (2022~)
DVA-C02    65 questions · 130 min · 720/1000 · $150
```

### Frequently Confused Pairs (One-Line Clarification)

```
Multi-AZ ≠ Read Replica          → HA (sync) vs read scaling (async)
LSI ≠ GSI                        → creation-time·Strong vs anytime·Eventually
SQS Standard ≠ FIFO              → unlimited·no-order vs 300/s·order·dedup
SNS ≠ EventBridge                → Pub/Sub vs event filter·routing
Kinesis ≠ SQS                    → multi-Consumer·reprocess vs single·consume-delete
Lambda Reserved ≠ Provisioned    → cap setting·free vs pre-on·paid
$LATEST ≠ Version                → mutable vs immutable
Cognito User Pool ≠ Identity Pool → auth·JWT vs IAM credentials
WAF ≠ Shield                     → L7·app attack vs L3-4·DDoS
KMS Encrypt ≠ GenerateDataKey    → ≤4KB vs Envelope
Secrets Manager ≠ Parameter Store → rotate·$0.40 vs free·hierarchy
SSE-S3 ≠ SSE-KMS ≠ SSE-C         → AWS key vs KMS·audit vs customer·HTTPS
ECR Basic ≠ Enhanced scan        → free CVE vs Inspector·paid
ECS taskRole ≠ executionRole     → app use vs agent use
SAM ≠ CDK                        → YAML macro vs code
CFN Stack Policy ≠ Termination Protection → update guard vs delete guard
DeletionPolicy: Retain ≠ Snapshot → as-is vs snapshot create
ALB ≠ NLB                        → L7·HTTP·DNS vs L4·TCP·EIP
EC2 stop ≠ terminate ≠ hibernate → EBS keep vs delete vs RAM keep
OAI (old) ≠ OAC (new)            → CloudFront → S3 private access
```

### 6 Security Scenario Answers (Exam Frequent)

```
L7 DDoS defense                   → Shield Advanced
SQL Injection defense             → WAF
Auto rotate DB password           → Secrets Manager
Mobile app → S3 direct access     → Cognito Identity Pool
Large KMS encryption              → Envelope Encryption
3rd-party AssumeRole security     → ExternalId (Confused Deputy)
```

### Anti-Patterns = Wrong Answers

```
❌ Lambda → Lambda sync call (direct)
❌ Lambda /tmp permanent sensitive storage
❌ S3 same bucket processing result store (infinite loop)
❌ EC2 hardcoded access key (use IAM role)
❌ Lambda env var plain text password
❌ Daily tasks with root account
❌ DDB partition key date/status (hot partition)
❌ Kinesis record failure endless retry (shard blocking)
❌ CloudFormation Prod DB without DeletionPolicy
❌ 0.0.0.0/0 SSH inbound allow
```

---

## 🎉 Final Encouragement Message

Completed **13 weeks × 5 days × 90 minutes = approximately 100 hours** of study.

- **Theory Learning ✅** — All major services covered
- **Trap Summary ✅** — Frequently tested patterns learned
- **Mock Exams ✅** — Exam format practice complete
- **Final Compression ✅** — Last-minute review ready

**After passing:**
- AWS Solutions Architect Associate (SAA-C03)
- AWS DevOps Engineer Professional (DOP-C02)
- AWS Security Specialty (SCS-C02)

**Good luck! You've got this!** 🚀

---

## 📌 3-Month Study Completion Summary

**Topics Completed:**
- Week 1-2: AWS Basics, IAM, EC2, EBS, Load Balancers
- Week 3-4: Lambda, API Gateway, Serverless
- Week 5-6: S3, DynamoDB
- Week 7: RDS, ElastiCache, Aurora
- Week 8: CI/CD (CodeCommit, CodeBuild, CodeDeploy, CodePipeline, Beanstalk)
- Week 9: Security (KMS, Secrets Manager, Cognito, WAF, Shield)
- Week 10: Monitoring (CloudWatch, X-Ray, CloudTrail, EventBridge)
- Week 11: Messaging (SQS, SNS, Kinesis, Step Functions, AppSync)
- Week 12: Containers/IaC (ECS, Fargate, ECR, CloudFormation, SAM, CDK)
- Week 13: Final Review and Mock Exams

**Best wishes for your AWS Certified Developer - Associate certification success!**
