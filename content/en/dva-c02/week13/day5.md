# Day 5 - Final Mock Exam + Exam Preparation Complete

📅 Date: August 13, 2026 (Thursday)  
🎯 Topic: DVA-C02 Final Mock Exam & Exam Preparation  
⏱️ Study Time: Approximately 130 minutes (same as the exam)

---

## 🎯 Learning Objectives

- Take a mock exam in the same format as the DVA-C02 exam
- Identify weak areas and do a final review
- Build an exam-day strategy

---

## 📖 Final Check of Exam Information

```
Exam Name: AWS Certified Developer - Associate (DVA-C02)
Duration: 130 minutes
Questions: 65 (50 scored + 15 unscored)
Passing Score: 720/1000
Cost: $150 USD
Languages: Multiple languages supported, including Korean
Question Types: Single choice (4 options), Multiple choice (2-3 correct out of 5-6)
```

### Domain Weighting - Where to Spend Your Time

```
Domain 1  Development with AWS Services          32%   ≈ 16 questions (out of 50 scored)
Domain 2  Security                               26%   ≈ 13 questions
Domain 3  Deployment                             24%   ≈ 12 questions
Domain 4  Troubleshooting and Optimization       18%   ≈  9 questions
────────────────────────────────────────────────────────────
Passing line 720/1000 → converted to question counts, you need roughly 35 correct answers.
(The exact conversion is a scaled score based on question difficulty, so it is not a
 simple ratio, but it is enough to give you a feel for the goal: "clear the low 70% range
 with a comfortable margin.")
```

What you should read here is not the numbers but the **shape of the weighting**. Domains 1 and 2 together make up well over half, and both converge on "**build something with Lambda, API Gateway, and DynamoDB, and then handle its access permissions and secrets**." If you have little time left, reviewing this axis again has a higher expected score than looking at new services. Domain 4 (Troubleshooting and Optimization) is less a separate body of knowledge than an area that **revisits the first three domains from the error-message side**, so the error and symptom tables you compiled throughout this week serve directly as preparation.

---

## 🎯 How to Read a Question: Eliminating Candidates by Keyword

Solving 65 questions in 130 minutes means an average of 2 minutes per question. If you read every passage carefully from the start, you will run out of time. The order that works in the real exam is **"last sentence → constraint keywords → eliminate options."**

```
Step 1  Read the final sentence first
        "What is the MOST cost-effective approach?" / "Which has the LEAST operational overhead?"
        / "Which is the MOST secure?"  ← what you are asked to optimize changes the answer

Step 2  Mark the constraint keywords in the passage
        "real-time" · "ordering" · "reprocessing" · "multiple consumers" · "1-year retention"
        "do not want to manage servers" · "without changing existing code"
        "audit logs required by regulation" · "another account" · "only within the VPC"

Step 3  Eliminate options that contain anti-patterns first (usually 1-2 disappear here)
        Hardcoded access keys / synchronous Lambda-to-Lambda calls / using root
        / allowing public access / hand-built polling loops / plaintext passwords

Step 4  Split the remaining two using the optimization criterion from Step 1
        Cost → serverless, Spot, HTTP API, Bucket Key
        Operational overhead → managed services, automation
        Safety → gradual deployment, automatic rollback, least privilege
```

Even with the same passage, some questions are designed so that the answer differs depending on whether the last sentence says "cost-effective" or "most secure." In a deployment strategy question, for example, the answer shifts to AllAtOnce for "fastest," to Immutable or Blue/Green for "safest," and to the Rolling family for "zero downtime at no additional cost." **If you do not settle the optimization criterion first, all four options look plausible.**

If all four options feel plausible, the question usually lists **different ways, at different layers, of achieving the same goal**. For example, for "Lambda is experiencing DynamoDB throttling," if (a) increase RCU, (b) switch to on-demand, (c) introduce DAX, and (d) redesign the partition key are listed side by side, all four look like valid actions. What decides the answer is **a single constraint line** planted in the passage - "the traffic pattern is unpredictable" points to on-demand, "reads are concentrated on the same items" points to DAX, "load is concentrated on specific keys only" points to redesign, and "capacity is insufficient overall" points to an increase. So the more the options all seem correct, the more it pays to go back to the passage and **find one more constraint sentence**. Exam questions are built to make you choose "the best fit for this situation" among valid solutions.

### Tips for Multiple-Choice (Choose 2) Questions

"Choose two" often effectively means picking **one from each of two different layers**. For example, for "Lambda cannot access DynamoDB - choose two causes," the correct pair is usually composed of one from the IAM permissions family plus one from the network/configuration family. If you find yourself picking two answers from the same layer, it is worth a second look.

---

## 🧮 Three Types of Calculation Questions - Once More by Hand

Calculation questions are about procedure, not knowledge, so staying steady in the exam room comes down to **the habit of saying the units out loud**.

```
① Lambda concurrency
   Concurrency = requests per second × average execution time (seconds)
   e.g.) 50 requests/sec × 0.4 sec average = 20  → set reserved concurrency with some margin
   Trap: if the "average execution time" is given in ms, convert it to seconds

② DynamoDB capacity   (reads are 4KB, writes are 1KB, always round up)
   Strongly consistent read = ceil(KB/4) × 1 × requests per second     Eventually consistent = × 0.5
   Standard write           = ceil(KB/1) × 1 × requests per second     Transactional         = × 2
   e.g.) 3KB item, 200 eventually consistent reads/sec
         ceil(3/4)=1 → 1 × 0.5 × 200 = 100 RCU

③ Kinesis shard count
   Required shards = max( incoming MB per second ÷ 1MB , records per second ÷ 1,000 )
   e.g.) 3MB per second · 4,000 records per second
         max(3, 4) = 4 shards  ← the trap is when the record-count side comes out larger
```

> ⚠️ **Trap**: Points are often lost on calculation questions not because you do not know the formula, but because you **swap the 4KB read and 1KB write units, or forget the 2x for transactions**. There is only one sanity check: for the same item, the **WCU number should come out 4 times larger than the (strongly consistent) RCU**. If it does not, you flipped a unit somewhere. The same goes for Kinesis - the answer is the **larger** of the "MB condition" and the "record count condition," and the options often include one that tempts you into picking the smaller.

---

## 🧰 Commands and Code to Keep at Your Fingertips

The exam is multiple choice, but its questions describe real working screens. Skimming the few lines below brings back the perspective of "what does a developer actually do in this situation," which makes the passages much faster to read.

```bash
# Who am I right now - the top priority when debugging permission problems
aws sts get-caller-identity

# Function configuration at a glance (timeout, memory, role, and VPC in one check)
aws lambda get-function-configuration --function-name my-func

# Moving the alias to a new version = deployment; moving it back = instant rollback
aws lambda update-alias --function-name my-func --name prod --function-version 7

# Check throttles, errors, and latency in metrics before logs
aws cloudwatch get-metric-statistics --namespace AWS/Lambda \
  --metric-name Throttles --dimensions Name=FunctionName,Value=my-func \
  --start-time 2026-08-13T00:00:00Z --end-time 2026-08-13T12:00:00Z \
  --period 300 --statistics Sum

# How much is backed up in the queue (backlog = a sign the consumers cannot keep up)
aws sqs get-queue-attributes --queue-url "$QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

```python
# API Gateway (Lambda Proxy) response contract - deviating from this shape produces a 502
def handler(event, context):
    try:
        item = load(event["pathParameters"]["id"])
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(item),      # must be a "string"
        }
    except NotFound:
        return {"statusCode": 404, "body": json.dumps({"message": "not found"})}
    except Exception as e:
        print(f"unhandled: {e}")           # details go to the logs only
        return {"statusCode": 500, "body": json.dumps({"message": "internal error"})}
```

| Symptom you will see in the exam | Cause to recall immediately |
|----------------------|----------------|
| 502 Bad Gateway | Lambda response format violation (`body` is not a string) |
| 504 Gateway Timeout | Integration timeout (default 29 seconds) exceeded |
| 429 Too Many Requests | API Gateway throttle or usage plan limit |
| `TooManyRequestsException` | Lambda concurrency limit |
| `ProvisionedThroughputExceededException` | DynamoDB capacity or a **hot partition** |
| `AccessDeniedException` | One of: execution role, resource policy, KMS key policy |
| Task does not even start (ECS) | **executionRole** (image pull, secret injection) |
| AccessDenied in the app logs (ECS) | **taskRole** |
| Messages processed twice | Visibility timeout < processing time |

As a hypothetical case, one failure pattern is **"spending time on the questions you are already sure about."** It looks like spending 60 minutes on the first 20 of 65 questions, then rushing at the end and guessing on the calculation questions wholesale. The real-exam allocation is simple - if you cannot reach a judgment within 1 minute, flag the question immediately and move on. It is actually **better to postpone calculation questions.** The concept questions you meet earlier revive your sense of units, so on the second pass they often get solved faster and more accurately. And when you change an answer you picked first, change it only if you have "newly found evidence" - changes made out of anxiety tend to cost you points.

---

## 📌 Key Takeaways

Pulling out what you built over 13 weeks in the exam room is less a matter of knowledge than of **procedure**.

- Settle the optimization criterion from the last sentence first.
- Mark the constraint keywords, eliminate the anti-pattern options, then split the remaining two by that criterion.
- For calculations, say the units out loud, and if you get stuck, flag it without regret.

The symptom-cause table you compiled today is useful not only for the exam but in real work as well. That is because what this certification tries to verify is "when something goes wrong on AWS, do you know which layer to suspect first?" The mock exam below is the place to check that procedure once more on real questions.

---

## 📝 Final Mock Exam (30 Questions)

**1.** If Lambda processes 100 requests/second with average 2-second execution time, required concurrency is?

A) 50  
B) 100  
C) 200  
D) 300  

**Answer: C** - Concurrency = Requests/sec (100) × Avg execution time (2) = 200

---

**2.** Writing 7KB item via transaction in DynamoDB consumes how many WCU?

A) 7 WCU  
B) 14 WCU  
C) 4 WCU  
D) 2 WCU  

**Answer: B** - ceil(7/1) × 2 = 7 × 2 = 14 WCU (transactions cost 2x)

---

**3.** Potential issue when using SSE-KMS on S3?

A) Data loss risk  
B) KMS API call limit exceeded (throttling)  
C) Encryption performance degradation  
D) Bucket size limit  

**Answer: B** - High traffic SSE-KMS calls KMS API for every object access, can hit KMS call limits.

---

**4.** To receive original HTTP request headers, query params, body in Lambda from API Gateway?

A) AWS integration type  
B) HTTP integration type  
C) AWS_PROXY (Lambda Proxy) integration  
D) MOCK integration  

**Answer: C** - Lambda Proxy passes all original HTTP info (method, headers, query, body) as Lambda event.

---

**5.** Common point between Kinesis Data Streams and SQS?

A) Multiple Consumers can read simultaneously  
B) Order guaranteed  
C) Message/record retention period exists  
D) Unlimited throughput  

**Answer: C** - Both have retention periods (SQS max 14 days, Kinesis max 365 days).

---

**6.** When ValidateService step fails in CodeDeploy deployment?

A) Deployment marked successful  
B) Auto rollback  
C) Manual rollback required  
D) Alarm triggered  

**Answer: B** - CodeDeploy auto-rollbacks to previous version on ValidateService failure.

---

**7.** To convert log pattern to metric and set alarm in CloudWatch?

A) CloudWatch Insights  
B) Metric Filter  
C) CloudTrail  
D) EventBridge  

**Answer: B** - Metric Filter converts log patterns to CloudWatch metrics for alarming.

---

**8.** For 10-minute message processing in SQS, appropriate VisibilityTimeout?

A) 30 seconds (default)  
B) 5 minutes  
C) 15 minutes (longer than processing)  
D) 12 hours  

**Answer: C** - Set VisibilityTimeout longer than processing time (10 min → 15+ min).

---

**9.** To implement Facebook social login in Cognito?

A) Identity Pool alone  
B) User Pool (social provider integration)  
C) SAML federation  
D) OpenID Connect  

**Answer: B** - Cognito User Pool directly integrates Facebook, Google, Apple etc. for social login.

---

**10.** Aurora Global Database disaster recovery targets?

A) RPO < 5 min, RTO < 1 hour  
B) RPO of seconds, RTO of minutes  
C) RPO < 1 hour, RTO < 4 hours  
D) RPO = 0, RTO = 0  

**Answer: B** - Aurora Global provides typically sub-second replication lag, an RPO of seconds, and a failover time (RTO) on the order of minutes.

---

**11.** Prerequisites for Lambda to access RDS in VPC?

A) Place Lambda in public subnet  
B) Configure Lambda in VPC, ensure RDS connectivity via security group/subnet  
C) NAT gateway required  
D) VPN connection needed  

**Answer: B** - Lambda must be in VPC with proper security group and subnet config to reach RDS.

---

**12.** To let client upload file to S3 without going through server?

A) S3 Transfer Acceleration  
B) Multipart upload  
C) PUT presigned URL  
D) S3 gateway endpoint  

**Answer: C** - Lambda generates PUT presigned URL, client uploads directly to S3 bypassing server.

---

**13.** To prevent hot partition in DynamoDB, partition key selection criterion?

A) Date/time  
B) Status code  
C) High cardinality (UserId, UUID etc)  
D) Country code  

**Answer: C** - High cardinality partition key distributes data/traffic evenly, preventing hot partition.

---

**14.** To prevent S3 bucket deletion when CloudFormation stack is deleted?

A) Special chars in bucket name  
B) Set DeletionPolicy: Retain  
C) Enable S3 versioning  
D) Deny deletion via bucket policy  

**Answer: B** - `DeletionPolicy: Retain` keeps resource when stack is deleted.

---

**15.** To run multiple Lambda in parallel in Step Functions then proceed after all complete?

A) Choice state  
B) Wait state  
C) Parallel state  
D) Map state  

**Answer: C** - Parallel state executes multiple branches concurrently, proceeds after all complete.

---

**16.** To track all requests in X-Ray sampling config?

A) rate: 1.0, fixed_target: 0  
B) rate: 0.05, fixed_target: 1  
C) SamplingRate: 100%  
D) Not possible in X-Ray  

**Answer: A** - `fixed_target: 0, rate: 1.0` tracks all requests (watch cost).

---

**17.** Required response format from Lambda in API Gateway (Lambda Proxy integration)?

A) Response body only  
B) {"statusCode": ..., "headers": ..., "body": ...}  
C) HTTP response object direct  
D) JSON body only  

**Answer: B** - Lambda Proxy must return `{statusCode, headers, body}` format.

---

**18.** Appropriate engine for ElastiCache as session store?

A) Memcached - simple and fast  
B) Redis - persistence, prevent session loss  
C) Both same  
D) Use RDS instead  

**Answer: B** - Use Redis for session persistence to prevent data loss, or Memcached for simple cache.

---

**19.** How GitHub change detection works in CodePipeline?

A) Periodic polling  
B) GitHub webhook event-driven  
C) Manual trigger  
D) S3 event  

**Answer: B** - CodePipeline starts immediately via GitHub webhook on push event.

---

**20.** When Lambda reads DynamoDB and gets `ProvisionedThroughputExceededException`?

A) Increase Lambda memory  
B) Increase DynamoDB RCU or switch to on-demand  
C) Increase Lambda concurrency  
D) Enable API Gateway caching  

**Answer: B** - This error means DynamoDB read capacity exceeded, increase RCU or use on-demand mode.

---

**21.** When Customer Managed Key is deleted in KMS?

A) Deleted immediately  
B) Deleted after 7-30 day waiting period  
C) Cannot be deleted permanently  
D) Requires AWS approval  

**Answer: B** - CMK deletion has 7-30 day scheduled deletion period, can be cancelled during this time.

---

**22.** To prevent duplicate message sending twice on SQS FIFO queue?

A) Use MessageGroupId  
B) Use MessageDeduplicationId  
C) Set VisibilityTimeout  
D) Set DLQ  

**Answer: B** - FIFO MessageDeduplicationId prevents duplicate message processing within 5 minutes.

---

**23.** To control CloudFormation resource creation order?

A) Alphabetically auto-determined  
B) Use DependsOn attribute  
C) Separate into different stacks  
D) Cannot control order  

**Answer: B** - `DependsOn` attribute controls resource creation order.

---

**24.** To debug external API timeout in Lambda using X-Ray?

A) Check CloudWatch logs  
B) Check X-Ray service map and trace for external HTTP subsegment timing  
C) Check API Gateway logs  
D) Check Lambda environment variables  

**Answer: B** - X-Ray SDK auto-records external HTTP calls, service map visualizes delay.

---

**25.** Advantage of Elastic Beanstalk Rolling with Additional Batch?

A) Fastest deployment  
B) Maintains full capacity during deployment  
C) Easiest rollback  
D) Lowest cost  

**Answer: B** - Rolling with Additional Batch creates extra instances maintaining full capacity during deployment.

---

**26.** Main difference between Kinesis Firehose and Kinesis Streams?

A) Only cost differs  
B) Firehose is managed delivery (near RT), Streams is direct processing (real-time)  
C) Streams is more expensive  
D) Only Firehose supports multiple Consumers  

**Answer: B** - Firehose serverlessly delivers to S3/Redshift, Streams requires direct processing.

---

**27.** Why does IAM role need trust policy?

A) Required for role creation  
B) Defines which entities can assume this role  
C) Defines role permission scope  
D) Controls role cost  

**Answer: B** - Trust Policy defines which services/users/accounts can AssumeRole.

---

**28.** Purpose of API Gateway Stage Variable?

A) Improve API performance  
B) Specify different Lambda/endpoint per environment (dev/staging/prod)  
C) Configure caching  
D) Configure auth  

**Answer: B** - Stage Variables allow same API structure to route to different Lambda aliases/endpoints per environment.

---

**29.** When Lambda times out processing SQS message?

A) Immediately moves to DLQ  
B) Returns to queue after VisibilityTimeout  
C) Deleted  
D) Stays in processing forever  

**Answer: B** - Failed Lambda (timeout included) returns message to queue after VisibilityTimeout.

---

**30.** To implement "loose coupling" architecture in DVA-C02?

A) Direct API calls between services  
B) Use messaging services like SQS, SNS, EventBridge  
C) Integrate all services in one Lambda  
D) Share data through RDS  

**Answer: B** - SQS, SNS, EventBridge messaging reduces direct service dependencies enabling loose coupling.

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
