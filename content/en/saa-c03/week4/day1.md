# Day 1 - S3: The Internal Architecture of Object Storage, the Evolution of Its Consistency Model, and Large-Scale Operational Patterns

When S3 launched in 2006 as AWS's very first service, external developers found it revolutionary just because "you could store a file over HTTP." But 17 years on, S3 is no longer a simple file store. As a distributed object storage system, it runs on the design principles of Dynamo (Amazon's internal key-value DB), and in 2020 it even completely overhauled its consistency model.

This article covers how S3 works internally (how data is distributed and replicated), why its consistency model only achieved strong consistency in 2020, the exact API sequence of multipart upload, the internals of versioning, and the signing mechanism behind Presigned URLs.

## Why S3 Was Born as Object Storage, Not a File System

In the early 2000s, Amazon.com faced a fundamental question about how to store its explosively growing data. Traditional file systems (NFS, SAN) were hard to scale horizontally, and RAID arrays had capacity limits. The more fundamental problem was that a file system's "random write" (partial modification) capability makes consistency management enormously complex in a large-scale distributed environment.

The core design decision of object storage is **immutability**. An object is written whole (PUT), read whole (GET), and deleted whole (DELETE). There is no partial modification. This constraint is precisely what makes large-scale distributed storage simple, because it eliminates the hardest problem of all: synchronizing partial modifications across replicas.

S3's internals follow the principles of the distributed key-value system described in Amazon's 2007 Dynamo paper (DeCandia et al., SOSP 2007). The bucket name and key combine to determine a location in a hash space, and the storage server responsible for that location stores the data. The durability of 11 nines (99.999999999%) is achieved through replication spanning multiple facilities, servers, and drives.

> 💡 **Related theory**: S3's durability design leverages the principles of **Reed-Solomon error-correcting codes** and **Consistent Hashing**. Reed-Solomon splits the original data into k data chunks and m parity chunks, so the data can be recovered even if m chunks are lost. The virtual-node-based Consistent Hashing described in the Dynamo paper minimizes data relocation when storage servers are added or removed. S3 operates all of this at a scale of hundreds of petabytes.

> 📚 **Case study**: According to what AWS's Andy Jassy revealed at the 2006 S3 launch, one of the first customers was Smugmug (a photo-sharing service). Smugmug migrated all of its existing NetApp SAN storage to S3, saving millions of dollars in storage costs. This case became the proof-of-concept for the very concept of "cloud storage."

## Bucket, Key, Object: What the Abstraction Means

**A bucket name is globally unique because it is converted into a DNS hostname.** The default URL of an S3 object is `https://bucket-name.s3.region.amazonaws.com/key`. Since the bucket name becomes a DNS subdomain, it must be unique across the entire world. The data itself is stored only in the region chosen at bucket creation. It's a dual structure: "global name + regional data."

**A key** looks like a hierarchical path (`data/2025/january/report.csv`), but it's really just a plain string. S3 has no concept of directories. Filtering keys that contain the `/` character by prefix to display them "like folders" is a trick the console and SDKs perform. In the `ListObjectsV2` API, combining `Delimiter=/` with `Prefix=data/2025/` lets you view the contents of that "folder."

This virtual folder structure has a history of affecting S3 performance. Early S3 partitioned keys lexicographically. If every key started with `logs/2025-01-01/`, they piled into the same partition and concentrated I/O. That's why old guidance told you to "add a random prefix to keys." But since 2018, S3 supports automatic partitioning and automatically distributes 3,500 PUT/DELETE and 5,500 GET requests per second per bucket prefix. Deliberate key distribution is no longer necessary.

```
[ S3 object size limits ]

Single PutObject:    up to 5GB
Multipart upload:    up to 5TB (min 5MB per part, up to 10,000 parts)
Max object size:     5TB

Recommendation:
- Under 100MB: single PutObject
- 100MB - 5GB: multipart recommended
- Over 5GB: multipart required
```

> 🔍 **Going deeper**: The exact API sequence of a multipart upload is three steps. ① `CreateMultipartUpload` → issues an Upload ID. ② `UploadPart` (part numbers 1-10,000, each at least 5MB) × N times, possible in parallel. ③ `CompleteMultipartUpload` → submit the list of part numbers and ETags in order, and S3 assembles them. If it fails midway, you only re-upload the affected part. You must clean up incomplete parts with `AbortMultipartUpload` or a lifecycle policy. Incomplete parts are billed just like completed objects.

## The Evolution of S3's Consistency Model: Why 2020?

From S3's launch until November 2020, S3 used an **eventually consistent** model. A GET immediately after a PUT could return an old version, and an object could still appear in a LIST after being deleted. That's why developers had to write code that "waited a bit" after a delete.

Why wasn't strong consistency possible from the start? According to the CAP theorem of distributed systems theory (Brewer, 2000), a distributed system can achieve only two of Consistency, Availability, and Partition Tolerance simultaneously. Because S3 is a global system used by millions of people at once, it prioritized Availability and Partition Tolerance. Providing strong consistency requires synchronously reflecting writes to all replicas, which increases latency.

In December 2020, AWS announced **strong consistency for all operations** in S3. A GET immediately after a PUT/DELETE returns the latest data, and LIST also reflects the latest state. This became possible because AWS redesigned S3's internal index system and found a way to guarantee consistency without additional latency.

> 💡 **Related theory**: S3's strong consistency is, from the perspective of the PACELC theorem (Abadi, 2012), a case of "achieving consistency (C) without sacrificing latency (L) when there is no network partition." Internally, it is presumed that the metadata service responsible for each object's metadata uses Paxos or a similar consensus protocol to guarantee atomic updates. AWS has not disclosed the detailed implementation.

## Versioning: Internal Behavior and the Cost Trap

When you enable versioning, every PUT to the same key generates a new version ID and the previous version is preserved. On a DELETE, S3 doesn't actually erase the data; instead it adds a special object called a "Delete Marker" as the latest version. When `GetObject` encounters a Delete Marker, it returns a 404. To access a previous version, you must specify the version ID explicitly.

```
[ Versioning internal behavior ]

Key: "data/report.pdf"

State 1 (upload):
  VersionID: v1  ← latest, 1MB

State 2 (re-upload):
  VersionID: v2  ← latest, 1.5MB
  VersionID: v1  ← previous version, 1MB

State 3 (DELETE):
  VersionID: Delete Marker  ← latest (no actual content)
  VersionID: v2  ← previous, 1.5MB
  VersionID: v1  ← previous, 1MB
  → GetObject("data/report.pdf") → 404

State 4 (delete the Delete Marker):
  VersionID: v2  ← latest (restored)
  VersionID: v1  ← previous
```

The cost trap of versioning is that all old versions are billed. A 100MB file updated 10 times occupies 1GB. A lifecycle policy that automatically expires versions older than N days is essential.

**MFA Delete**: Requires MFA to enable/disable versioning and to permanently delete (a DELETE with an explicit version ID). It's the last line of defense against ransomware attacks and accidental data deletion.

> ⚠️ **Pitfall**: Once versioning is Enabled, it cannot be Disabled — only Suspended. In the Suspended state, new objects are not assigned version IDs, but existing versions are retained. If you want to turn versioning off completely, you must create a new bucket.

## Object Lock: WORM Storage

Object Lock protects objects in a **Write Once, Read Many (WORM)** manner. It's used when modifying or deleting data is legally prohibited, such as legal evidence retention, financial records, and long-term medical data storage.

Two modes:
- **Governance Mode**: An IAM user with a special permission (`s3:BypassGovernanceRetention`) can remove the lock. Ordinary users cannot.
- **Compliance Mode**: **No one — including the root account — can remove the lock or delete the object.** Deletion is only possible after the retention period expires.

Retention policies:
- **Retention Period**: Locks until a specific date (set as a date or a duration)
- **Legal Hold**: Locks indefinitely with no date (litigation hold, removed with a separate permission)

> 📚 **Case study**: The financial services industry must retain trading records in a non-modifiable state for at least 3-6 years under SEC Rule 17a-4 (a U.S. Securities and Exchange Commission regulation). S3 Object Lock Compliance mode meets this requirement, and Cohasset Associates certified that S3 Object Lock complies with SEC Rule 17a-4 and CFTC Rule 1.31.

## S3 Replication: The Difference Between CRR and SRR

**CRR (Cross-Region Replication)**: Replicates to a bucket in a different region. Used for DR (disaster recovery), compliance, and minimizing global latency.

**SRR (Same-Region Replication)**: Replicates to a different bucket within the same region. Used for log aggregation (collecting logs from many accounts into one bucket) and dev/prod data synchronization.

Replication only works if **versioning is enabled on both buckets**. Objects that existed before the replication rule was enabled are not replicated (no retroactive application). You can bulk-replicate existing objects with **S3 Batch Replication**.

**RTC (Replication Time Control)**: Provides an SLA to replicate 99.99% of objects within 15 minutes. It costs extra, but it's essential in regulated environments that need a clear guarantee of "RPO 15 minutes."

> 💡 **Related theory**: CRR is **asynchronous replication**. Once a PUT succeeds on the source bucket, the client gets an immediate response, and replication proceeds in the background. This is the same principle as an RDS Cross-Region Read Replica. If "the source region goes completely down before replication," RPO becomes > 0. Using RTC caps that RPO at a maximum of 15 minutes.

## Presigned URL: The Signing Mechanism

A Presigned URL is a signed URL that grants temporary access to an S3 object. A URL signed with IAM credentials has an expiration time built in.

```
Presigned URL structure:
https://bucket.s3.amazonaws.com/key
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKID/20260520/ap-northeast-2/s3/aws4_request
  &X-Amz-Date=20260520T120000Z
  &X-Amz-Expires=3600
  &X-Amz-Signature=[HMAC-SHA256 signature]
```

The signature uses the AWS Signature Version 4 (SigV4) algorithm. The request parameters, headers, date, region, service, and secret key are hashed with HMAC-SHA256 to produce the signature. When S3 receives the request, it repeats the same computation to verify the signature.

An important constraint: **if you issue a Presigned URL with an IAM role, the URL becomes unusable once the role's temporary credentials expire.** Because the IAM role's session token lifetime (up to 12 hours) is independent of the URL's expiration time, the role session may expire sooner. The effective maximum expiration of a Presigned URL is the smaller of the two — the IAM role's session lifetime.

```bash
# Issue a Presigned URL (default signing uses the requester's credentials)
aws s3 presign s3://my-bucket/data/report.pdf \
  --expires-in 3600 \
  --region ap-northeast-2

# Presigned URL for upload (AWS SDK for Python)
import boto3
s3 = boto3.client('s3')
url = s3.generate_presigned_url(
    'put_object',
    Params={'Bucket': 'my-bucket', 'Key': 'uploads/file.pdf'},
    ExpiresIn=300,  # 5 minutes
    HttpMethod='PUT'
)
```

> 🔍 **Going deeper**: The pattern of uploading directly to an S3 bucket via a Presigned URL ("Direct Browser Upload") saves server cost and bandwidth by bypassing the server. The client asks the API server to issue a Presigned URL → the API server returns a Presigned PUT URL → the client PUTs directly to S3 with that URL → S3 triggers the processing pipeline via an event notification when done. This pattern requires S3 CORS configuration, because the browser sends an `OPTIONS` preflight before the `PUT`.

## S3 Event Notifications: EventBridge vs Native Notifications

S3 events can be sent through two channels.

**Native event notifications**: S3 sends directly to SNS/SQS/Lambda. Simple to set up and low latency. However, only a single destination can be specified, and filtering is limited to prefix/suffix.

**EventBridge integration**: S3 → EventBridge → multiple destinations. EventBridge Rules let you define different processing per event type. Archive, Replay, multiple targets, and fine-grained filtering are all possible.

```
[ S3 events + EventBridge pattern ]

S3 ObjectCreated:
  → EventBridge Rule 1 (key matches "uploads/*.jpg"):
      - Lambda (generate thumbnail)
      - SQS (processing queue)
  → EventBridge Rule 2 (key matches "reports/*.pdf"):
      - Lambda (parse PDF)
      - SNS (send notification)
```

> ⚠️ **Pitfall**: "I want to fan out an S3 event to several different processing systems" → native S3 notifications allow only one destination. Using EventBridge lets you branch to multiple rules and multiple targets. Alternatively, there's the pattern of fanning out via S3 → SNS → multiple SQS subscriptions.

## Transfer Acceleration: Accelerated Global Uploads

Transfer Acceleration inserts a CloudFront edge location into the upload path to an S3 bucket. When a user in Seoul uploads to `bucket.s3-accelerate.amazonaws.com`, the traffic goes over the public internet to the nearest edge location (e.g., the Gimpo PoP), and from there to the destination region (e.g., us-east-1) over the AWS backbone network.

It's effective for cross-continental uploads (Korea → us-east-1). Within the same region, it has no effect or can even be slower. Using the Transfer Acceleration endpoint incurs extra cost, so use it only when there's an actual improvement.

## S3 Object Lambda: Transform on Access

S3 Object Lambda intercepts a `GetObject` request, transforms the data through a Lambda function, and then returns it to the client. It's useful when you need real-time data transformation but don't want to change the original data.

Patterns:
- PII (personally identifiable information) masking: Return a CSV file with the national ID column replaced by `****`
- Image resizing: Dynamically transform a high-resolution original into the size the client requested
- Compression/decompression: Decompress a gzip-compressed file before returning it

```
[ S3 Object Lambda flow ]

Client → S3 Object Lambda Access Point
                     ↓ (intercepts GetObject)
              Lambda function (transformation)
                     ↓ (WriteGetObjectResponse)
              S3 source bucket (actual data)
                     ↓ (transformed result)
Client ← (transformed data)
```

## Comparing S3 with Other Clouds

| Feature | AWS S3 | GCP Cloud Storage | Azure Blob Storage |
|------|--------|-------------------|-------------------|
| Consistency | Strong (since 2020.12) | Strong (from the start) | Strong |
| Max object size | 5TB | 5TB | 4.77TB (195GB for block) |
| Versioning | O | O | O |
| Object lock (WORM) | O (Object Lock) | O (Retention Policy) | O (Immutable Storage) |
| Event notifications | SNS/SQS/Lambda/EventBridge | Pub/Sub | Event Grid |
| Transfer acceleration | Transfer Acceleration | Fast by default (global network) | N/A |
| Query capability | S3 Select / Athena | BigQuery | Blob Storage + Azure Synapse |

GCP Cloud Storage provided strong consistency from the beginning. That was GCP's marketing point that it was "more consistent than S3," but AWS caught up in 2020.

## Cementing It with the CLI

```bash
# Create a bucket (Seoul region)
aws s3api create-bucket \
  --bucket my-saa-bucket-$(date +%s) \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket my-bucket \
  --versioning-configuration Status=Enabled

# Enable MFA Delete (only possible from the root account)
aws s3api put-bucket-versioning \
  --bucket my-bucket \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::123456789012:mfa/root-account-mfa-device 123456"

# List object versions
aws s3api list-object-versions --bucket my-bucket --prefix data/

# Lifecycle policy (auto-delete incomplete multipart + old versions)
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "clean-multipart",
        "Status": "Enabled",
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
      },
      {
        "ID": "expire-old-versions",
        "Status": "Enabled",
        "NoncurrentVersionExpiration": {"NoncurrentDays": 30}
      }
    ]
  }'

# Configure Object Lock (Compliance mode, 7 years)
aws s3api put-object-retention \
  --bucket compliance-bucket \
  --key financial-records/2025/q4.csv \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2032-12-31T00:00:00Z"}'

# Configure a CRR replication rule
aws s3api put-bucket-replication \
  --bucket source-bucket \
  --replication-configuration '{
    "Role": "arn:aws:iam::123456789012:role/replication-role",
    "Rules": [{
      "Status": "Enabled",
      "Destination": {
        "Bucket": "arn:aws:s3:::dest-bucket-us-east-1",
        "ReplicationTime": {"Status": "Enabled", "Time": {"Minutes": 15}},
        "Metrics": {"Status": "Enabled", "EventThreshold": {"Minutes": 15}}
      }
    }]
  }'
```

## Wrapping Up

S3 looks like a simple file store, but internally it's a distributed object storage system inspired by the Dynamo paper. The immutable object model makes large-scale distributed replication feasible, and the 2020 consistency upgrade greatly reduced the developer's burden.

On the exam, most S3 questions are trade-off choices. Temporary file sharing → Presigned URL, multi-target event processing → EventBridge, legal data retention → Object Lock Compliance, cross-region DR → CRR + RTC. Once you understand the "why" behind each, the answer becomes visible even in a new scenario.

---

## 📝 연습 문제

**문제 1.** You need to share sensitive data stored in an S3 bucket with an external partner. Without granting the partner permanent access to the bucket, you want to let them download a specific file for only 24 hours. What should you do?

A) Set the bucket to Public and send them the link
B) Issue a Presigned URL with an 86400-second (24-hour) expiration
C) Create an IAM user for the partner and grant S3 GetObject permission
D) Enable S3 Transfer Acceleration

**정답: B**
해설: A Presigned URL is a time-limited URL signed with IAM credentials. It lets the partner access only a specific file without granting permanent access. Setting the bucket to Public grants access to everyone permanently. Creating an IAM user grants permanent credentials, which becomes a security problem if you later forget to revoke them. Transfer Acceleration is for accelerating uploads.

---

**문제 2.** A company's compliance team needs to prevent all data in a specific S3 bucket from being deleted until a legal lawsuit is complete. It's unknown when the lawsuit will end. Which S3 feature is most suitable?

A) Object Lock Compliance Mode (Retention Period 1 year)
B) S3 Versioning + MFA Delete
C) Object Lock Legal Hold
D) S3 Bucket Policy (Deny: s3:DeleteObject)

**정답: C**
해설: Legal Hold protects objects indefinitely with no expiration date and can only be removed with a separate permission (`s3:PutObjectLegalHold`). When the lawsuit ends, you simply remove the Legal Hold. Compliance Mode requires specifying a specific date, but the lawsuit's end date is unknown. MFA Delete prevents accidental deletion but is not a legal lock. A Bucket Policy can block deletion, but it can be bypassed by modifying the policy itself.

---

**문제 3.** A photo upload app must store user-uploaded high-resolution images in S3 and, immediately upon upload, generate thumbnails in several sizes and store them in another S3 bucket. It must also record the image upload event in DynamoDB and send a notification to the administrator via SNS. Which architecture is suitable?

A) S3 event → Lambda (generate thumbnails + save to DynamoDB + SNS notification)
B) S3 event → EventBridge → Lambda (thumbnails), DynamoDB Streams, SNS
C) S3 event → EventBridge → Rule 1 → Lambda (thumbnails), Rule 2 → Lambda (DDB), Rule 3 → SNS
D) CloudFront → S3 → Lambda@Edge (thumbnails) → DynamoDB + SNS

**정답: C**
해설: To branch a single S3 event to several processing systems, you need EventBridge. EventBridge rules deliver the same event in parallel to Lambda (thumbnails), Lambda (DDB save), and SNS (notification). The single Lambda in A makes one function do three jobs, becoming a single point of failure (SPOF) with no separation of concerns. Native S3 event notifications allow only a single destination. D is wrong because CloudFront is unnecessary and Lambda@Edge doesn't fit this pattern.

---

**문제 4.** A regulator requires financial transaction records to be retained for 7 years in a non-modifiable, non-deletable state. In AWS S3, no one — including the root account — must be able to delete the data. How do you configure this?

A) S3 Object Lock Governance Mode, Retention Period 7 years
B) S3 Object Lock Compliance Mode, Retention Period 7 years
C) Enable S3 Versioning + MFA Delete
D) S3 Bucket Policy: Deny s3:DeleteObject for all principals

**정답: B**
해설: In Compliance Mode, no one — including the root account — can delete an object or remove the lock within the retention period. It meets legal retention requirements in regulated environments. Governance Mode allows a user with the `s3:BypassGovernanceRetention` permission to remove the lock, so it fails the "no one can delete" requirement. Versioning + MFA Delete prevents accidental deletion, which differs from a legal WORM requirement. A Bucket Policy can be bypassed by modifying the policy itself.

---

**문제 5.** A company replicates data from its Seoul (ap-northeast-2) region S3 bucket to Tokyo (ap-northeast-1) for DR. It needs a guarantee that "99.99% of objects are replicated within 15 minutes." Which feature should it enable?

A) S3 Transfer Acceleration
B) S3 Cross-Region Replication (CRR) + Replication Time Control (RTC)
C) S3 CRR + S3 Inventory
D) S3 CRR + CloudFront

**정답: B**
해설: CRR is the cross-region replication feature, and RTC (Replication Time Control) adds an SLA to replicate 99.99% of objects within 15 minutes. Enabling RTC also lets you monitor replication progress in CloudWatch. Transfer Acceleration is for accelerating uploads. S3 Inventory is a report listing objects in a bucket. CloudFront is a CDN and is unrelated to replication.

---

**문제 6.** A development team wants to upload a 5.2GB file to S3 with Python code. The network is unstable and may drop midway. Choose the most reliable upload method and the way to avoid the cost of interrupted upload parts.

A) Single PutObject + full re-upload on failure / no lifecycle needed
B) Multipart upload + per-part retry / S3 lifecycle rule to delete incomplete multipart after 7 days
C) S3 Transfer Manager (high-level SDK) + automatic multipart / manual part cleanup
D) Parallel split upload via S3 Select / part cleanup via EventBridge

**정답: B**
해설: 5.2GB exceeds the single-PutObject limit (5GB), so a multipart upload is required. Multipart uploads by part, so on a network interruption you only re-upload the affected part. The lifecycle rule `AbortIncompleteMultipartUpload: DaysAfterInitiation: 7` automatically deletes parts not completed within 7 days, preventing cost. The Transfer Manager in C is a high-level API where the AWS SDK handles multipart automatically, but the lifecycle rule must still be configured separately. S3 Select is a query feature, not an upload feature.
