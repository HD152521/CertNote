# Day 5 - S3 Advanced Features + Week 5 Comprehensive Review

This is the last day of Week 5. We'll finish looking at three advanced features — S3 event notifications, Presigned URLs, and static website hosting — and then organize everything about S3 we learned over the past four days from an exam perspective. S3 is one of the services with the most questions on the DVA-C02. If you understand "why it works that way" rather than just memorizing, you won't be shaken by variant questions.

## S3 Event Notifications — What Happens When a File Arrives

An S3 event notification is the pattern of "when something specific happens in the bucket, notify someone." This pattern is at the heart of serverless architecture — when a file is uploaded to S3, Lambda runs automatically, and image resizing, document conversion, and data validation take place.

Supported event types:
- `s3:ObjectCreated:*` — includes PUT, POST, COPY, and multipart completion all together
- `s3:ObjectCreated:Put` — PUT only
- `s3:ObjectRemoved:*` — deletion and delete-marker creation
- `s3:ObjectRestore:*` — Glacier restore start/complete
- `s3:Replication:*` — replication failure, incomplete, etc.

Three direct-connection targets: Lambda function, SQS queue, SNS topic.

The **method of going through Amazon EventBridge** was added in 2021, and this approach is currently the most recommended. The reason is that it enables event archiving, replay, more than 18 targets (Step Functions, Kinesis, API Gateway, CodePipeline, etc.), and fine-grained event-pattern filtering (prefix, suffix, size conditions, etc.).

Use direct connection (Lambda/SQS/SNS) when the target is already clear and simple, and use EventBridge when flexibility is needed — that's the selection criterion.

> 💡 **Related theory**: S3 event notifications are a classic implementation of event-driven architecture (EDA). Since Amazon's internal transition to SOA (Service-Oriented Architecture) in 2003, AWS services have made communicating through events a basic design principle. S3 events guarantee at-least-once delivery but allow duplicate delivery — this is why you must ensure idempotency in a Lambda or SQS consumer.

> ⚠️ **Trap**: S3 event notifications are "at-least-once" delivery, not "exactly-once." Lambda can be invoked twice for the same PUT. You must implement idempotent processing within Lambda (such as a DynamoDB item that checks whether a file has already been processed).

## Presigned URL — How to Embed IAM Permissions in a URL

A Presigned URL is a temporary URL signed using the creator's IAM credentials. Whoever receives the URL can perform S3 operations with the creator's permissions while the URL is valid.

```python
import boto3
from datetime import datetime, timedelta

s3 = boto3.client('s3')

# 1. Temporary sharing of a private file (GET)
download_url = s3.generate_presigned_url(
    'get_object',
    Params={
        'Bucket': 'my-private-bucket',
        'Key': 'confidential/report-2026.pdf'
    },
    ExpiresIn=3600  # valid for 1 hour
)

# 2. Client uploads directly to S3 without going through the server (PUT)
upload_url = s3.generate_presigned_url(
    'put_object',
    Params={
        'Bucket': 'my-upload-bucket',
        'Key': f'user-uploads/{user_id}/avatar.jpg',
        'ContentType': 'image/jpeg'
    },
    ExpiresIn=300  # valid for 5 minutes
)

# 3. POST-form Presigned URL (HTML form upload)
response = s3.generate_presigned_post(
    Bucket='my-bucket',
    Key='uploads/${filename}',  # variables can be used
    Fields={'Content-Type': 'image/jpeg'},
    Conditions=[
        ['content-length-range', 1, 10 * 1024 * 1024]  # max 10MB
    ],
    ExpiresIn=600
)
```

**Key characteristics of a Presigned URL:**

Expiration time: up to 7 days if IAM-user-based, and **up to 12 hours if IAM-role-based (STS temporary credentials)** (limited by the STS token's expiration time). On the exam, there are cases where the correct answer is "up to 1 hour" rather than "up to 7 days" — if you generated it with an IAM role from Lambda or EC2, the STS token TTL (up to 12 hours) becomes the limit.

Creator permission: at the time the URL is generated, the creator must hold the permission for that operation. Even if the permission existed at creation time, if the permission is later removed by an IAM policy change, the URL also stops working.

PUT Presigned URL pattern: the server generates the URL and passes it to the client, and the client uploads the file directly to S3. The server does not process the file data, so there is no bandwidth load. When the file upload completes, the client sends a completion notification to the server, and the server checks the S3 event or DynamoDB metadata.

> 🔍 **Going deeper**: A Presigned URL's signature is generated with the AWS SigV4 (Signature Version 4) algorithm. SigV4 uses HMAC-SHA256, and the request's HTTP method, bucket/key, expiration time, allowed headers, etc. are included in the signature. If you tamper with the URL, signature verification fails. The SDK's `generate_presigned_url` abstracts away this complex process.

## Static Website Hosting — The Fundamental Reason It Supports HTTP Only

An S3 static website is cost-effective but has an important constraint: **it supports HTTP only**. You cannot install a TLS certificate on S3 itself. To provide HTTPS, the combination of CloudFront + ACM (AWS Certificate Manager) is required.

Why HTTP only? S3 is object storage, not a web server. The complex elements of HTTPS — TLS handshake, certificate management, SNI (Server Name Indication) — are the role of Layer 7 services like CloudFront or ALB. AWS maintains this as a principle of separating roles by service.

Static website URL formats (both appear on the exam):
```
http://bucket-name.s3-website-region.amazonaws.com
http://bucket-name.s3-website.region.amazonaws.com
```

Static website + HTTPS architecture:
```
[User browser]
      ↕ HTTPS (ACM certificate)
[CloudFront distribution]
      ↕ HTTP (S3 website endpoint)
      or
      ↕ S3 origin + OAC (recommended)
[S3 bucket]
```

With the CloudFront + OAC method (recommended), you don't have to open the bucket to public. Only CloudFront accesses the bucket and serves users over HTTPS.

> ⚠️ **Trap**: The public URL of S3 static website hosting differs from that of a regular S3 bucket. The website endpoint (`s3-website`) of a bucket with website hosting enabled renders HTML files in the browser. A regular S3 URL (`s3.amazonaws.com`) can process the file as a download (Content-Disposition: attachment). You must turn on the static website feature to serve index.html as the default document and to configure an error page.

## Full Week 5 Review — DVA-C02 Core Summary

### S3 Basic Specs (must memorize)
```
Maximum object size:      5TB
Single PUT maximum:       5GB (multipart required if exceeded)
Multipart minimum:        100MB recommended, required at 5GB+
Part minimum size:        5MB (except the last part)
Part maximum count:       10,000
Throughput per prefix:    PUT 3,500/s, GET 5,500/s
Durability:               11 nines (same for all classes)
Standard availability:    99.99%
One Zone-IA availability: 99.5%
```

### Storage Class Core Comparison

| Class | Minimum retention | Immediate retrieval | AZ | Core use case |
|--------|----------|----------|-----|-------------|
| Standard | None | ✅ | 3+ | Frequent access |
| Intelligent-Tiering | None | ✅* | 3+ | Irregular access |
| Standard-IA | 30 days | ✅ | 3+ | Less than once a month |
| One Zone-IA | 30 days | ✅ | 1 | Regenerable |
| Glacier Instant | 90 days | ✅ | 3+ | Once a quarter |
| Glacier Flexible | 90 days | ❌ (1 min–12 hours) | 3+ | 1–2 times a year |
| Glacier Deep Archive | 180 days | ❌ (12–48 hours) | 3+ | Long-term regulatory |

*In Intelligent-Tiering, retrieval delay occurs when the Archive Access tier is enabled.

### Versioning Core Points

```
States: Unversioned → Enabled → Suspended (cannot be disabled)
Delete = add a delete marker (not a real deletion)
Real deletion = DELETE + explicit version ID
MFA Delete: only the root account can set/release it
Cost trap: previous versions all incur storage cost
Solution: NoncurrentVersionExpiration lifecycle rule
```

### Encryption Methods Summary

```
SSE-S3:    AWS fully managed, default, free, no audit log
SSE-KMS:   KMS key policy, CloudTrail auditing, watch out for KMS API limits
           → cut KMS cost by up to 99% with S3 Bucket Key
DSSE-KMS:  dual encryption, FIPS 140-3 Level 3, government/defense
SSE-C:     customer provides the key, HTTPS required, key not stored on AWS
CSE:       client encrypts directly, highest security
```

### Replication Core

```
CRR: different region → disaster recovery, latency optimization
SRR: same region → dev/staging separation, log aggregation
Requirement: versioning must be enabled on both sides
Existing objects: use Batch Replication separately
Delete markers: not replicated by default (optionally enabled)
RTC: guarantees 99.99% replicated within 15 minutes (paid SLA)
```

### Security Layer Priority

```
① Account/bucket-level Block Public Access (highest priority)
② Explicit Deny (bucket policy, SCP)
③ Resource-based Allow (bucket policy) + IAM Allow
④ ACL (ignored when Bucket Owner Enforced is set)
```

### Event Notifications vs. EventBridge

```
Direct connection (Lambda/SQS/SNS): simple, fast, 3 target types
Via EventBridge: flexible, 18+ targets, archiving, replay, fine-grained filtering
Currently recommended: via EventBridge
```

## 20 Week 5 Exam Traps

1. **Bucket name globally unique** — unique worldwide, not just within the same region
2. **Bucket name with dots** — technically valid, but breaks the HTTPS certificate wildcard
3. **S3 is Strong Consistency since 2020** — saying "eventual" is wrong
4. **One Zone-IA can lose data on an AZ failure** — regenerable data only
5. **Minimum retention is billed even on early deletion** — IA 30 days, Glacier 90 days, Deep Archive 180 days
6. **Glacier Deep Archive minimum object size 40KB** — IA is 128KB
7. **Versioning cannot be disabled** — only Suspended is possible
8. **Deletion = delete marker** — permanent deletion requires an explicit version ID
9. **MFA Delete = root account only** — an administrator IAM user cannot either
10. **Replication = versioning required on both sides** — existing objects via Batch Replication
11. **2023+ all new objects SSE-S3 by default** — "encrypted?" → "always yes"
12. **SSE-KMS KMS API limits** → cut by 99% with Bucket Key
13. **New buckets have all 4 Block Public Access ON by default + Bucket Owner Enforced**
14. **OAI legacy, OAC currently recommended** — serving SSE-KMS objects via CloudFront = OAC required
15. **Single PUT maximum 5GB** — multipart required if exceeded
16. **Incomplete multipart parts incur storage cost** → AbortIncompleteMultipartUpload lifecycle rule
17. **Static website HTTP only** → HTTPS requires CloudFront + ACM
18. **IAM-role-based Presigned URL is up to 12 hours** — STS token TTL limit
19. **EventBridge is the most flexible for event notifications** — 18+ targets, archiving, replay
20. **S3 Select is single file, simple SQL only** — complex queries via Athena

## Week 5 Acronym Summary

| Acronym | Full name | Core point |
|------|--------|-----------|
| S3 | Simple Storage Service | Object storage |
| IA | Infrequent Access | 30-day minimum |
| CRR/SRR | Cross/Same Region Replication | Versioning required on both sides |
| RTC | Replication Time Control | 15-minute SLA |
| MRAP | Multi-Region Access Point | Single global endpoint |
| OAC/OAI | Origin Access Control/Identity | OAC is currently recommended |
| BPA | Block Public Access | Highest-priority security layer |
| SSE | Server-Side Encryption | Server-side encryption |
| CSE | Client-Side Encryption | Client-side encryption |
| DSSE | Dual-layer SSE | Dual encryption |
| WORM | Write Once Read Many | Object Lock |
| MPU | Multipart Upload | 100MB+ recommended |
| ETag | Entity Tag | Object integrity hash |
| CORS | Cross-Origin Resource Sharing | Needed for direct S3 access from the browser |
| ACM | AWS Certificate Manager | HTTPS certificate management |

## 📝 Week 5 종합 연습 문제

**문제 1.** A company's medical imaging data must be retained for 10 years per regulations. It is accessed frequently for the first year, then almost never, but requires immediate lookup during an audit. What is the most cost-effective lifecycle design?

A) Keep it in Standard as-is for all 10 years to always guarantee immediate lookup — immediacy is met, but keeping the barely-accessed 9-year span in the most expensive class is the exact opposite of cost optimization
B) Keep it in Standard for 1 year, then transition to Glacier Deep Archive to minimize long-term storage cost — Deep Archive takes 12–48 hours to recover, violating the "immediate lookup" requirement at audit time
C) Standard → after 30 days Standard-IA → after 1 year Glacier Instant Retrieval → delete after 10 years
D) Leave it to Intelligent-Tiering's automatic tiering for 10 years to respond to access-pattern changes — automatic, but the per-object monitoring cost accumulates over 10 years and immediate lookup can break if the Archive tier turns on

**정답: C**
해설: Standard for the first month, Standard-IA after 30 days to reduce storage cost, Glacier Instant Retrieval after 1 year for even greater cost savings — Glacier Instant supports millisecond immediate retrieval, so it meets the "immediate lookup" requirement. Glacier Flexible Retrieval or Deep Archive need time to recover and do not fit the immediate-lookup requirement. A has no cost optimization. B's Glacier Deep Archive is 12–48 hours to recover. D's Intelligent-Tiering is automatic but immediate retrieval may be unavailable when the Archive tier is enabled, and monitoring cost accumulates over 10 years.

---

**문제 2.** A mobile app user needs to upload a profile photo. You want to avoid the server bearing the load of processing large file data. What is the most suitable architecture?

A) A sequential proxy upload where the client sends the file to the server, which receives it and re-uploads it to S3 — every byte goes through the server, so the bandwidth and load you were trying to avoid land squarely on the server
B) The server generates a PUT Presigned URL → the client uploads directly to S3 with that URL
C) The client uploads directly to the S3 Transfer Acceleration endpoint to accelerate transfer — long-distance transfer gets faster, but it is not a means of authentication/authorization control and adds acceleration fees
D) Put a CloudFront distribution on the upload path to deliver from the edge to S3 — CloudFront is mainly for download caching/distribution, so it is unsuitable as a pattern for removing user-upload load

**정답: B**
해설: In the PUT Presigned URL pattern, the server generates the URL and the client uploads directly to S3 with that URL. The server does not process the file bytes, so there is no bandwidth load. The URL includes the bucket, key, expiration time, allowed ContentType, etc. as a signature, preventing unauthorized uploads. After the upload completes, you can trigger Lambda via an S3 event notification to do post-processing such as image resizing. This pattern is the standard upload architecture for social media, file-sharing services, and the like.

---

**문제 3.** In AWS Organizations, you want to forcibly keep Block Public Access maintained on all S3 buckets. Which service do you use?

A) In each account, manually keep the 4 Block Public Access options on for each bucket — there is no enforcement, so if someone turns it off it stays off, and org-wide consistency is not guaranteed
B) Deny the action of disabling Block Public Access with an SCP (Service Control Policy)
C) Configure auto-remediation with Lambda + EventBridge to immediately re-enable when a BPA-disable event is detected — post-hoc detection/correction leaves a public-exposure gap between the change and the recovery
D) Use an AWS Config managed rule to detect BPA-non-compliant buckets and report them on a dashboard — it only detects; automatic blocking/remediation needs a separate Remediation Lambda

**정답: B**
해설: Using an SCP, you can deny the very API call that turns off Block Public Access in all accounts within the Organization. For example, placing a Deny condition on the `s3:PutBucketPublicAccessBlock` action means no one can change Block Public Access. C's Lambda + EventBridge pattern is post-hoc detection and correction, with a time gap between the change and the fix that creates a security gap. D's AWS Config only detects and needs an additional Lambda for automatic correction. B is a preventive control and is the most powerful.

---

**문제 4.** In an architecture where an S3 event notification invokes Lambda on object upload, the same file triggered Lambda twice within a short period. What is the cause and solution of this phenomenon?

A) A Lambda concurrency misconfiguration ran the same event twice — increase Reserved Concurrency — concurrency is only the number of parallel executions and is unrelated to duplicate delivery of the same event
B) S3 event notifications are at-least-once delivery, so this is normal behavior — implement idempotent processing within Lambda
C) The bucket policy registered the event notification to two targets, causing two invocations — clean up the bucket policy — the bucket policy is only access control and has nothing to do with event notification registration/duplication
D) The ObjectCreated wildcard filter caught both PUT and COPY, causing duplication — filter to ObjectCreated:Put only — narrowing the event type does not prevent duplicate delivery of a single PUT

**정답: B**
해설: S3 event notifications guarantee at-least-once delivery, and duplicate delivery can occur rarely. This is designed behavior, not a bug. The solution is to implement idempotent processing within the Lambda function — record the S3 ETag or version ID of the file to be processed in DynamoDB, and silently skip an already-processed event. Event filtering restricts the event type but does not solve the duplicate-delivery problem.

---

**문제 5.** A company providing a global service hosts a static web application on S3. The requirements are HTTPS required, global optimization, and a custom domain for SEO. Which architecture is correct?

A) Connect only a Route 53 alias to the S3 static website endpoint to serve on a custom domain — the website endpoint supports HTTP only and does not meet the HTTPS-required requirement
B) A public S3 bucket with website hosting on + CloudFront + ACM + Route 53 — HTTPS/domain work, but opening the bucket to public is weaker security than the OAC method
C) S3 bucket (OAC) + CloudFront + ACM + Route 53
D) Serve static files from an EC2 web server and use S3 only for source storage — running/patching/scaling an always-on instance adds excessive complexity for a static site

**정답: C**
해설: The architecture that meets all requirements is C. Using OAC, you allow only CloudFront to access the S3 bucket without opening it to public (better security than B's public bucket). CloudFront supports HTTPS (ACM certificate), global caching, and a Route 53 custom domain connection all together. The S3 static website itself (A) supports HTTP only, and HTTPS is impossible without CloudFront. An EC2 web server (D) adds unnecessary complexity.

---

**문제 6.** On an S3 bucket, a lifecycle policy is set to "transition to Standard-IA after 30 days, to Glacier Flexible after 90 days." On the 50th day, you deleted the object. What fee is billed?

A) 30 days of Standard + the actual IA storage of 20 days of Standard-IA — looking only at day count it seems plausible, but it omits the 30-day minimum retention billing of IA and wrongly bills only 20 days
B) 50 days of Standard + 30 days of Standard-IA (IA minimum retention 30 days)
C) Even after transition, only 50 days of Standard is billed based on the original class — a wrong answer ignoring the IA transition and minimum-retention billing
D) Because it was deleted before meeting the Glacier transition condition (90 days), 90 days of Standard-IA is billed — a wrong answer assuming a non-existent retroactive Glacier minimum-retention billing

**정답: B**
해설: Standard has no minimum retention duration, so only 30 days is billed. The transition to Standard-IA happened on day 30, and since it was deleted on day 50, the period stored as IA is 20 days. However, because Standard-IA's minimum retention duration is 30 days, even though it was actually stored for 20 days, 30 days of IA cost is billed. That is, Standard 30 days + Standard-IA 30 days (minimum) = B is the answer. Early-deletion billing applies to IA, Glacier, and Deep Archive all.

---

**문제 7.** A dev team needs a Lambda in a different AWS account to access a Lambda deployment package stored in S3. What is the most secure way to grant access without opening the S3 bucket to public?

A) Generate a GET Presigned URL for each deployment package and pass it to the other account's Lambda — it works, but the URL expires and must be reissued for each deployment version, unsuitable for an automation pipeline
B) Specify the other account's ARN as a Principal in the bucket policy and Allow
C) Open the bucket to public and whitelist only the other account's NAT IP — public exposure + IP-spoofing risk, violating the "private, not public" requirement
D) Replicate the package with CRR to a bucket/region owned by the other account so it can be read locally — this only replicates/duplicates the data and is not an access-granting mechanism, and needs extra setup like versioning

**정답: B**
해설: Specifying the other account's Lambda execution-role ARN as a Principal in the bucket policy enables cross-account access without opening it to public. A resource-based policy (bucket policy) can grant permissions even to another account that has no IAM user — a strength of S3. A Presigned URL is temporary and expires. Public + IP whitelist has an IP-spoofing risk. CRR is data replication, not access control.

---

**문제 8.** Which is correct as the default setting of every new S3 bucket as of 2024?

A) Public access allowed + encryption disabled + ACL enabled — assumes it ships open for convenience, but this is the exact opposite of the current secure-by-default principle
B) All 4 Block Public Access disabled + SSE-S3 default encryption + ACL enabled — encryption is right, but the part about BPA shipping off is wrong
C) All 4 Block Public Access enabled, SSE-S3 default encryption, Bucket Owner Enforced (ACL disabled)
D) Only 1 of the 4 Block Public Access enabled + encryption optional + Object Writer ownership — partial enablement, optional encryption, and an outdated ownership model are inconsistent with the current default

**정답: C**
해설: Since 2023, the default of every new S3 bucket is ① all 4 Block Public Access options enabled, ② SSE-S3 (AES-256) default encryption, ③ Object Ownership = Bucket Owner Enforced (ACL disabled). These three defaults are the implementation of the "Secure by Default" principle. If public access is needed for static website hosting, you must explicitly turn off Block Public Access and write a bucket policy.

---

**문제 9.** An S3 bucket has billions of objects, and you must find the objects among all of them that do not have SSE-KMS encryption applied and apply encryption to them in bulk. Which method is suitable?

A) Paginate ListObjects with Lambda and check the encryption status of each object with HeadObject, then re-encrypt — it works, but the API calls, execution time, and cost for billions of objects explode, making it impractical
B) Generate an encryption-status report with S3 Inventory → filter unencrypted objects with Athena → apply SSE-KMS copy with S3 Batch Operations
C) Extract the per-object encryption status from the S3 Storage Class Analysis report to build a target list — Storage Class Analysis is for access-pattern/storage-class analysis and does not provide encryption status
D) Trace back CloudTrail PUT event logs and identify unencrypted objects by the presence of the SSE header — it misses objects outside the CloudTrail retention period and analyzing billions of log entries is inefficient

**정답: B**
해설: For a large-scale operation on billions of objects, the combination of S3 Inventory + Athena + S3 Batch Operations is the answer. S3 Inventory periodically generates a list of all objects in the bucket and their metadata (including encryption status) in CSV/Parquet. Filter with Athena for objects where "ServerSideEncryption is not aws:kms" to build a list, then use this list as the manifest for S3 Batch Operations to run an SSE-KMS-applied copy operation. Directly iterating over billions of objects with Lambda takes enormous time and cost. Storage Class Analysis does not provide encryption status.

---

**문제 10.** Choose the correct solution for the following scenario. "A company's partner needs to upload files to a specific S3 bucket. The partner does not have an AWS account."

A) Create a partner-only IAM user and pass an Access Key that allows only PutObject — even with narrowed permissions, you end up handing long-term credentials to an external party, creating a heavy key-management/rotation burden
B) Set the bucket to public-writable so anyone can upload — public write without authentication is a serious security incident with a high risk of data pollution/abuse
C) Periodically generate a PUT Presigned URL for the partner and pass it to them
D) Establish VPC Peering with the partner's network so they upload over a private path — it requires the partner to have an AWS account/VPC, contradicting the "no account" premise

**정답: C**
해설: When granting S3 access to an external partner without an AWS account, a PUT Presigned URL is the most secure and simple. You can set an expiration time to limit the validity period, and you can even restrict to a specific key (file name) and ContentType. Creating an IAM user (A) means providing long-term credentials to the partner, creating a credential-management burden. A public bucket (B) is very bad for security. VPC Peering (D) requires the partner to have an AWS account and VPC.

---

**문제 11.** You set up CRR from S3 bucket A (us-east-1) to bucket B (ap-northeast-2). In bucket A, you permanently deleted an object directly (with an explicit version ID) without a delete marker. What about bucket B?

A) The permanent deletion propagates through the replication pipeline and the corresponding version in bucket B is automatically deleted too — CRR by default does not replicate permanent version deletion, so it does not propagate
B) That object remains in bucket B as-is
C) Instead of a permanent deletion, a delete marker is replicated to bucket B and hides the latest version — this was an explicit-version-ID permanent deletion, not delete-marker creation, and delete-marker replication is also disabled by default
D) The source version disappears, integrity checks fail, and a replication-failure event/notification occurs — deletion is not a replication target and is not treated as a failure

**정답: B**
해설: S3 replication by default does not replicate delete operations — for data-protection purposes. Even if you permanently delete a specific version in bucket A, that version remains in bucket B as-is. Delete markers are also not replicated by default (can be optionally enabled). This design prevents accidental or malicious deletions from propagating through replication. In bidirectional replication, enabling delete-marker replication creates a cross-delete risk — it must be configured carefully.

---

**문제 12.** Which of the following are all correct descriptions of an S3 Access Point?

A) An Access Point creates a new bucket that holds data separately from the existing bucket — an Access Point does not create a new bucket; it only adds a named virtual entrance on top of the existing bucket
B) A VPC-only Access Point can block access from the internet
C) Only up to 1 Access Point can be created per bucket, unifying the entrance — in reality, thousands per bucket (up to 10,000) can be created
D) Each Access Point has its own independent policy and DNS name

**정답: B와 D**
해설: An Access Point does not create a new bucket; it creates a virtual entrance on top of an existing bucket (A is wrong). Up to 10,000 Access Points can be created per bucket (C is wrong). Setting a VPC-only Access Point means access via that Access Point is allowed only from within the specified VPC and internet access is blocked (B is right). Each Access Point has a unique DNS name (`<name>-<account-id>.s3-accesspoint.<region>.amazonaws.com`) and an independent bucket policy (D is right).

---
