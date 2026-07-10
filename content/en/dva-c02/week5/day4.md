# Day 4 - S3 Performance Optimization: Multipart Upload, Transfer Acceleration, Prefix Design

S3 is advertised as "infinitely scalable," but in practice performance can differ by tens of times depending on how you use it. Creating a hot partition with bad prefix design, having to start over from scratch on a network error while uploading a large file with a single PUT, or having users worldwide access a single-region S3 over the internet — in all of these situations, S3 becomes the bottleneck. This day is about understanding the mathematical limits of S3 performance and digging into the design patterns that make the most of those limits.

## S3's Throughput Limits — Independent Limits Per Prefix

S3's throughput is applied independently **per prefix**. Specifically:
- 3,500 PUT/COPY/POST/DELETE per second per prefix
- 5,500 GET/HEAD per second per prefix

A "prefix" is the leading part of an object key, excluding the file name. In `photos/2026/01/image.jpg`, the prefix is `photos/2026/01/`.

Why per prefix? Internally, S3 distributes data across partitions, and objects with the same prefix tend to be placed in the same partition. If you make prefixes varied, S3 can internally distribute the data across multiple partitions, and each partition's limit is applied independently.

```
[Single-prefix pattern - low performance]
s3://bucket/uploads/file1.jpg    → shares the 3,500 PUT/s limit
s3://bucket/uploads/file2.jpg
s3://bucket/uploads/file3.jpg

[Multi-prefix pattern - high performance]
s3://bucket/a/uploads/file.jpg  → independent 3,500 PUT/s
s3://bucket/b/uploads/file.jpg  → independent 3,500 PUT/s
s3://bucket/c/uploads/file.jpg  → independent 3,500 PUT/s
→ combined 10,500 PUT/s possible
```

> 🔍 **Going deeper**: S3's internal partition-splitting mechanism is based on the distributed-hash-based key-value storage that Amazon filed a patent for in 2012. In the past (before 2018), there was a problem where keys with the same alphabetical order piled up in the same partition, so it was recommended to prepend a random hash prefix to keys (`abc123/uploads/file.jpg`). Since S3 introduced Automatic Partitioning in 2018, this hack is no longer necessary. But because a lot of exam material still has "add a random prefix" as the answer, confusion arises — the current recommendation is to use varied prefixes, not to prepend random characters.

## Burst Capacity — Handling Temporary Traffic Spikes

S3 does not immediately throttle requests that exceed the per-prefix throughput limit. There is a **Burst Capacity** mechanism that accumulates capacity that has been unused for a period of time and uses it for a sudden traffic spike.

How Burst Capacity works: unused capacity accumulates up to **300 seconds (5 minutes)** worth. When traffic spikes, this accumulated capacity is consumed first, and then throttling begins. It requires no separate configuration and operates automatically.

Practical implication: if you have a batch job that uploads a large volume of files once an hour, Burst Capacity lets you temporarily exceed the limit. But if you continuously exceed the limit, you need to distribute prefixes or, instead of uploading directly to S3, adopt a pattern that processes sequentially through SQS.

## Multipart Upload — The Standard for Uploading Large Files

The maximum size you can upload with a single PUT request is **5GB**. To upload a 5TB object, you must use Multipart Upload.

The 3 stages of Multipart Upload:

```
1. CreateMultipartUpload
   → Issues an UploadId (subsequent operations are identified by this ID)

2. UploadPart (N times in parallel)
   → Assign each part a number from 1 to 10,000
   → Part size: minimum 5MB (except the last part), maximum 5GB
   → An ETag is returned when each part completes

3. CompleteMultipartUpload
   → Submit the list of part numbers + ETags
   → S3 merges the parts into a single object
   → The final ETag is returned on success
```

There are three key benefits of Multipart. First, **parallel upload** — uploading 10 parts at once can theoretically give a 10x speedup. Second, **partial retransmission** — even if part 5 fails due to a network error, parts 1–4 and 6–N do not need to be re-uploaded. Third, **streaming upload** — even when you don't know the file size in advance, you can start uploading part by part (the last part can be any size).

| Constraint | Value |
|------|-----|
| Part minimum size | 5MB (except the last part) |
| Part maximum size | 5GB |
| Maximum number of parts | 10,000 |
| Maximum object size | 5TB |
| Recommended starting size | 100MB or larger |
| Single PUT maximum | 5GB |

> ⚠️ **Trap**: An incomplete multipart upload is stored permanently in S3 as "intermediate parts" and continues to incur storage cost. Even if the application crashes or the upload is canceled, the already-uploaded parts are not automatically cleaned up. You **must add `AbortIncompleteMultipartUpload` to your lifecycle policy**. Without a rule like "automatically delete incomplete multiparts after 7 days," costs quietly pile up.

```python
import boto3
from boto3.s3.transfer import TransferConfig

s3 = boto3.client('s3')

config = TransferConfig(
    multipart_threshold=1024 * 25,  # multipart if 25MB or larger
    max_concurrency=10,              # up to 10 parallel threads
    multipart_chunksize=1024 * 25,  # part size 25MB
    use_threads=True
)

# The boto3 transfer manager handles multipart automatically
s3.upload_file(
    'large_file.zip',
    'my-bucket',
    'uploads/large_file.zip',
    Config=config
)
```

The boto3 `TransferManager` automatically handles files above the threshold as multipart. There is no need to call the CreateMultipartUpload API directly.

## Byte-Range Fetches — Parallel Downloads

Using the HTTP Range header, you can request only a specific byte range of an object. Three patterns that leverage this:

**Parallel download**: split a 10GB file into 10 ranges of 1GB each and download them simultaneously → theoretically 10x speed
**File header inspection**: download only the first few hundred bytes to check the file type/metadata
**Resuming an interrupted download**: pick up from the point where it was cut off

```python
# Download only the first 1KB of the file with the Range header
response = s3.get_object(
    Bucket='my-bucket',
    Key='large-video.mp4',
    Range='bytes=0-1023'
)
file_header = response['Body'].read()

# Parallel download: the 10MB–20MB range
response = s3.get_object(
    Bucket='my-bucket',
    Key='large-file.bin',
    Range='bytes=10485760-20971519'
)
```

> 💡 **Related theory**: The HTTP Range Request is a standard defined in RFC 7233. S3 fully supports this standard, and it also allows sending multiple Range requests simultaneously. This technique is an HTTP implementation of technology that has been used for decades in P2P download clients (BitTorrent, download managers). S3's parallel Range downloads can theoretically be used freely within the single-prefix limit of 5,500 GET/s.

## S3 Transfer Acceleration — Edge-Routed Upload Acceleration

Transfer Acceleration leverages the CloudFront edge network to increase upload speed. The client uploads to the nearest CloudFront edge location, and from the edge it is delivered to the destination S3 bucket over the AWS internal backbone network.

```
Regular upload path:
[Seoul client] → public internet → [us-east-1 S3]
(high latency, possible packet loss)

Transfer Acceleration path:
[Seoul client] → AWS Seoul edge (optimized path) → AWS backbone → [us-east-1 S3]
(internal network = low latency, high reliability)
```

How to enable: set it per bucket; incurs additional cost ($0.04 per GB). The URL changes to `bucket.s3-accelerate.amazonaws.com`.

When to use: ① when users worldwide upload to a single-region bucket, ② when network instability is a problem for long-distance uploads. It has no effect for uploads within the same region.

## Comparison: Transfer Acceleration vs. CloudFront vs. Multi-Region Access Point

| Feature | Transfer Acceleration | CloudFront | MRAP |
|------|----------------------|-----------|------|
| Main purpose | Global → single-bucket upload acceleration | Content download caching | Automatic routing to the nearest region |
| Caching | ❌ | ✅ | ❌ |
| Direction | Upload-centric | Download-centric | Upload + download |
| Number of buckets | 1 | 1 (origin) | Multiple buckets in multiple regions |
| Cost | $0.04 per GB additional | Requests + data transfer | Inter-region data transfer |
| Setup complexity | Low | Medium | High |

MRAP (Multi-Region Access Point), a feature launched in 2021, bundles buckets in multiple regions and lets you access them through a single global endpoint. Requests are automatically routed to the bucket in the nearest region. Used together with CRR (Cross-Region Replication), you can implement a global Active-Active pattern.

## S3 Select — Fetching Only the Data You Need with SQL

Consider a situation where you need only 100 rows meeting a specific condition from a 10GB CSV file. The typical approach is to download the entire 10GB and then filter on the client. S3 Select runs SQL on the S3 service side and returns only the filtered result.

```sql
-- S3 Select SQL example: only users aged 30 or older from CSV
SELECT s.name, s.email 
FROM s3object s 
WHERE CAST(s.age AS INTEGER) > 30
```

Supported formats: CSV, JSON, Parquet (GZIP/BZIP2 compression also supported). Cost: billed based on GB scanned + GB returned.

Limitations: it supports only simple SELECT/WHERE; JOIN, GROUP BY, subqueries, etc. are not possible. If you need complex queries, you must use Amazon Athena.

> 📚 **Case study**: In 2022, a global e-commerce company stored sales logs in S3 and every day extracted only the sales data of a specific category. Previously they downloaded the entire 100GB file and processed it on a Spark cluster; after switching to S3 Select, the download size dropped to an average of 2GB (a 95% reduction). The S3 API cost increased, but the EC2 processing cost and data transfer cost fell significantly, so the overall cost decreased by 40%.

## CloudFront + S3 Origin Access Control — Secure Delivery of a Private S3

When distributing a static website or download files through CloudFront, opening the S3 bucket to public allows direct access that bypasses CloudFront. OAC (Origin Access Control) is a mechanism that restricts S3 access to CloudFront only.

| Item | OAI (old method) | OAC (new method, recommended) |
|------|------------|-----------------|
| Released | Before 2020 | 2022 |
| SigV4 support | ❌ | ✅ |
| SSE-KMS support | ❌ | ✅ |
| All S3 regions | Partial | ✅ All |
| New implementations | ⚠️ Migration recommended | ✅ Recommended |

After configuring OAC, if you allow the CloudFront service principal in the bucket policy and deny everything else, then accessing the S3 URL directly from the public internet returns a 403.

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "cloudfront.amazonaws.com"
    },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/ABCDEF"
      }
    }
  }]
}
```

> ⚠️ **Trap**: If the exam material was written before 2022, OAI appears as the answer for "CloudFront + private S3 delivery." Since 2022, OAC is recommended, and it can also serve SSE-KMS-encrypted objects via CloudFront. If a question has the condition "CloudFront must serve an SSE-KMS-encrypted S3 object," OAC is the only answer.

## Combining S3 with Athena — The Data Lake Pattern

If S3 Select is simple filtering on a single object, Amazon Athena is a service that processes thousands of S3 files with a distributed query engine (based on Presto/Trino).

| Item | S3 Select | Amazon Athena |
|------|-----------|---------------|
| Scope | Single object | Multiple files, virtual tables |
| SQL | SELECT/WHERE only | Full SQL (JOIN, GROUP BY, HAVING, subqueries) |
| Execution location | Inside the S3 service | A separate Athena engine |
| Billing | Scanned + returned GB | $5 per GB scanned |
| Use | Simple filtering | Data lake analysis |

"Complex analysis with SQL over hundreds of millions of S3 objects" → Athena. "Extract only some rows from a single 10GB file" → S3 Select.

The combination of S3 + Athena + Glue Data Catalog is the standard architecture for an AWS data lake. Storing in Parquet or ORC format can drastically reduce Athena scan costs (as a columnar format, it reads only the needed columns).

S3 performance optimization is not simply about being "fast" but is a design problem of balancing throughput, latency, and cost. Multipart, Transfer Acceleration, Byte-Range, S3 Select, CloudFront OAC — once you understand which tool is optimal in which situation, you can naturally solve the scenario questions on the exam.

## 📝 연습 문제

**문제 1.** What method must you use when uploading an S3 object exceeding 5GB? And what is the minimum size of each part in a multipart upload? (excluding the last part)

A) Single PUT is possible, part minimum 1MB
B) Multipart Upload required, part minimum 5MB
C) Transfer Acceleration required, part minimum 10MB
D) Presigned URL required, part minimum 100MB

**정답: B**
해설: The maximum size of a single PUT is 5GB. When it exceeds 5GB, you must use Multipart Upload, and the minimum size of each part (except the last part) is 5MB. A part under 5MB causes an error during CompleteMultipartUpload. The maximum number of parts is 10,000, and the maximum object size is 5TB. Transfer Acceleration and Presigned URL are separate features unrelated to part size.

---

**문제 2.** You have an application where users in many countries worldwide upload large files to an S3 bucket in us-east-1. What is the most appropriate way to improve upload speed?

A) Create a separate S3 bucket per country and replicate with CRR
B) Enable S3 Transfer Acceleration
C) Add CloudFront to the upload path
D) Connect all users via a VPN close to us-east-1

**정답: B**
해설: Transfer Acceleration leverages the CloudFront edge network so that from anywhere in the world, traffic goes over the public internet only as far as the nearest edge, and is then delivered quickly to the bucket over the AWS backbone network. Creating a bucket per country (A) creates excessive management complexity. CloudFront is caching-based download acceleration and is not suitable for uploads. A VPN has high cost and complexity.

---

**문제 3.** Which is the correct description of S3 Select?

A) It can JOIN and query files across multiple S3 buckets
B) Within a single object, it filters with SQL and returns only the data you need
C) It fully supports GROUP BY and aggregate functions
D) It can be used for free with no download cost

**정답: B**
해설: S3 Select runs simple SQL (SELECT/WHERE) within a single object (CSV, JSON, Parquet) and returns only the data you need. Because it transmits only the filtered result instead of downloading the entire file, network cost and processing cost are reduced. For JOINs or complex aggregations, you must use Amazon Athena. The cost is calculated as GB scanned + GB returned.

---

**문제 4.** Which is the correct description of S3 prefix design?

A) If you store all files under the same prefix, S3 automatically distributes partitions
B) Because the limits of PUT 3,500/s and GET 5,500/s per prefix are applied independently, using varied prefixes increases overall throughput
C) Prefixes are unrelated to performance and are used purely for organization purposes
D) Increasing the number of prefixes increases S3 storage cost

**정답: B**
해설: S3's throughput limits are applied independently per prefix. Using 10 different prefixes theoretically allows 35,000 PUT/s and 55,000 GET/s. In the past there was a hot-partition problem where keys clustered in alphabetical order, but since 2018 this has been resolved by S3's automatic partition splitting. The number of prefixes is unrelated to storage cost.

---

**문제 5.** What is the currently (2024) recommended way to distribute private content by combining CloudFront and S3?

A) Set the S3 bucket to public and configure caching in CloudFront
B) Use OAI (Origin Access Identity)
C) Use OAC (Origin Access Control)
D) Use API Gateway as an S3 proxy instead of CloudFront

**정답: C**
해설: OAC (Origin Access Control) is the current recommended method, launched in 2022. OAI (Origin Access Identity) is legacy, cannot serve SSE-KMS-encrypted objects, and was supported only in some regions. OAC supports SigV4 signing, can serve SSE-KMS objects via CloudFront, and is available in all regions. On the exam, if a question has the condition "serve SSE-KMS-encrypted S3 content via CloudFront," OAC is the only correct answer.

---

**문제 6.** How do you prevent unnecessary S3 costs from incomplete multipart uploads?

A) Do not use multipart uploads
B) Add an AbortIncompleteMultipartUpload rule to the lifecycle policy
C) Set an auto-complete flag on multipart uploads
D) Change the storage class to S3 Intelligent-Tiering

**정답: B**
해설: If a multipart upload is started but not completed, the already-uploaded parts are not automatically deleted and continue to incur storage cost. If you set `AbortIncompleteMultipartUpload` in the lifecycle policy, the parts of incomplete multipart uploads are automatically deleted after a specified number of days (e.g., 7 days). Together with `NoncurrentVersionExpiration`, which automatically deletes previous versions in a versioning-enabled bucket, this is an essential setting for S3 cost management.

---

**문제 7.** You need to extract only the logs of a specific IP address from a 100GB log file. What is the most efficient way to process it without downloading the entire file to EC2?

A) Store it in Glacier with S3 Glacier Select and then query
B) Use S3 Select to filter by IP on the S3 service side
C) Use the CloudFront log analysis feature
D) Get the file list with S3 Inventory and analyze with Athena

**정답: B**
해설: S3 Select applies SQL to a single file in CSV, JSON, or Parquet format and returns only the data you need. Instead of downloading the entire 100GB file, extracting only the logs of a specific IP with a WHERE clause drastically reduces network transfer volume and processing time. S3 Glacier Select is a similar feature for files stored in Glacier, but this scenario is a file in regular S3. S3 Inventory is for file list/metadata lookups. Athena is suitable for multiple files or complex queries.

---
