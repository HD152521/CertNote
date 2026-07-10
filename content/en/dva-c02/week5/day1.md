# Day 1 - S3: The Philosophy of Object Storage and Designing Storage Classes

When Amazon S3 first launched on March 14, 2006, founder Werner Vogels said he wanted to "eliminate the worry about storage capacity forever." Once you understand what technical decisions that declaration actually led to, S3's distinctive design principles start to come into focus. S3 is not a file system. There are no hierarchical directories, no inodes, no file locks. All there is, is an infinite space of key-value pairs. This article digs into why this simple model has survived even 20 years later, and why S3 questions show up so frequently on the DVA-C02 exam.

## Why S3 Is Not a File System — The Design Philosophy

When Ken Thompson designed the Unix file system in the 1970s, the goal was to let multiple processes on a single machine access shared resources. Hierarchical directories, inodes, links, and file locks are structures optimized for that goal. But for the problem of distributing billions of objects across thousands of servers, this structure gets in the way. Directory locks become bottlenecks, the inode table becomes a single point of failure, and hierarchical traversal overloads the metadata server.

S3's answer is a **flat namespace**. With nothing but a bucket name and a key, you can locate any object in near O(1) time. A path that looks like `/documents/2026/report.pdf` is, in reality, just a single string key that happens to contain slashes. Thanks to this design, S3 can scale horizontally to tens of petabytes without a metadata server.

> 💡 **Related theory**: S3's flat namespace works together with consistent-hashing-based distributed storage inspired by Amazon's Dynamo paper (2007, SOSP). Object keys are hashed and distributed across multiple storage nodes, and each node responds independently. In this structure, a "directory listing" is simulated by enumerating, in order, the keys that start with a given prefix — which is why, in a bucket with millions of objects, a LIST operation takes linear time and costs more.

## What the Global Namespace of Buckets Means

If you created a bucket named `my-company-docs`, no other AWS account anywhere in the world can use the same name. This rule looks inconvenient at first, but it gives you two powerful benefits. First, the bucket name alone automatically determines a DNS name — `https://my-company-docs.s3.amazonaws.com` — accessible from anywhere in the world, with no separate DNS server configuration required. Second, in cross-account access policies between different AWS accounts, the bucket ARN (`arn:aws:s3:::my-company-docs`) is identified globally and uniquely.

The bucket naming rules are simple, but they frequently appear as traps on the exam. Only lowercase letters, digits, hyphens, and dots are allowed (3–63 characters), and an IP address format (`192.168.1.1`) is prohibited. And because a name containing a dot (`.`) breaks matching against wildcard certificates (`*.s3.amazonaws.com`) over HTTPS, dot-free names are recommended in practice.

> 🔍 **Going deeper**: Two URL formats coexist in S3. The virtual-hosted style (`https://bucket.s3.region.amazonaws.com/key`) and the path style (`https://s3.region.amazonaws.com/bucket/key`). AWS announced the deprecation of the path style in 2019, but it is still maintained because of the impact on existing customers. New code should use the virtual-hosted style. The SDK uses the virtual-hosted style by default, so no separate configuration is needed.

## The Secret Behind 11 Nines of Durability — Distributed Replication and Erasure Coding

"99.999999999% durability" is at the heart of S3's marketing. You have to understand what this number concretely means in order to answer exam questions precisely. Durability is the probability of data loss. 11 nines is roughly the probability that, if you store 10 million objects for a year, you might lose one on average. How is this level of durability achieved?

S3 Standard stores data **across at least 3 AZs**. It is not simply 3-way replication — it uses the **erasure coding** technique. If you split data into k fragments and add m additional parity fragments, then even if any m of the k+m fragments are corrupted, the original can be recovered from the remaining k. S3 uses Reed-Solomon-based erasure coding to minimize storage overhead while maximizing durability. Three-way replication would mean 300% overhead, but erasure coding achieves higher durability at 50–67% overhead.

> 💡 **Related theory**: The Reed-Solomon code is an error-correction code published in 1960 by Irving Reed and Gustave Solomon (IRE Trans. Inf. Theory, 1960). This technique, also used in CDs and QR codes, became a core cloud-storage technology because Google's GFS (2003) and Hadoop's HDFS (2006) proved its efficiency. AWS does not disclose S3's internal implementation, but patents and papers confirm that it is erasure-coding-based.

> 📚 **Case study**: In a 2017 Smithsonian Museum project honoring the American actress Lena Horne, a research team stored tens of terabytes of digital archives in S3. There is a report that, upon verification five years later, data integrity was maintained at 100%. By contrast, a similar project managed on in-house RAID storage lost part of its data due to a disk-replacement mistake. This is a case that shows S3's 11 nines does not really mean "you don't have to do anything" but rather "AWS handles it for you."

## Why One Zone-IA Is Also 11 Nines — The Difference Between Availability and Durability

The concept most frequently confused on the exam is the difference between **durability** and **availability**. S3 One Zone-IA still has 11 nines (99.999999999%) of durability, but its availability is only 99.5%. Why is that?

One Zone-IA stores data in a single AZ only. Within that AZ, it achieves 11 nines of durability through erasure coding. However, if the entire AZ goes completely offline due to a disaster (fire, flood, power outage), you cannot access the data — the data itself isn't corrupted, but you can't read it. This is what 99.5% availability means. If an AZ failure leads to a loss of storage hardware, the data itself could be permanently lost. That is why you should use One Zone-IA only for **regenerable data (image thumbnails, transformed data)**.

> ⚠️ **Trap**: On questions about choosing One Zone-IA, always remember there is a "possibility of data loss on an AZ failure." On the exam, if there is a hint of "regenerable data," One Zone-IA is the answer; if there is a hint of "data preservation under any circumstances," Standard or Standard-IA is the answer.

## S3 Storage Classes — The Trade-off Between Cost and Access Pattern

Choosing a storage class is not simply about picking "the cheap one." It is the problem of optimizing across three axes: **storage cost vs. retrieval cost vs. access latency**.

| Storage class | AZ count | Availability | Minimum storage duration | Retrieval time | Representative use case |
|----------------|-------|--------|---------------|-----------|---------------|
| Standard | 3+ | 99.99% | None | Immediate | Frequently accessed web application data |
| Intelligent-Tiering | 3+ | 99.9% | None | Immediate to minutes | Data with irregular access patterns |
| Standard-IA | 3+ | 99.9% | 30 days / 128KB | Immediate | Accessed less than once a month, needs fast recovery |
| One Zone-IA | 1 | 99.5% | 30 days / 128KB | Immediate | Regenerable data, cost optimization |
| Glacier Instant Retrieval | 3+ | 99.9% | 90 days / 128KB | Immediate | Accessed once a quarter, immediate recovery |
| Glacier Flexible Retrieval | 3+ | 99.99% | 90 days / 40KB | 1 min to 12 hours | Accessed 1–2 times a year, recovery time acceptable |
| Glacier Deep Archive | 3+ | 99.99% | 180 days / 40KB | 12–48 hours | Regulatory archives, 7–10 year retention |
| Express One Zone | 1 | — | 1 hour | <1ms | AI/ML training, HPC temporary storage |

The minimum storage duration is an important exam point. Even if you store data in Standard-IA for 15 days and then delete it, **you are billed for 30 days**. The deletion actually happens, but AWS bills you for the storage cost corresponding to the 30-day minimum. Glacier Deep Archive's minimum storage duration is 180 days, so if you dump archive data in without a regulatory retention period, the cost can actually go up.

> 💡 **Related theory**: The cost structure of storage classes is the same as **tiered pricing** theory in economics. The lower the access frequency, the lower the storage unit price, but the higher the recovery cost when you actually access it. Glacier Deep Archive's storage cost is 1/23 of Standard, but a Bulk retrieval adds $0.0025 per GB. Putting frequently accessed data in Glacier can actually make the total cost higher.

## S3 Intelligent-Tiering — Automatic Classification with Machine Learning

Intelligent-Tiering, a storage class launched in 2018, has S3 automatically monitor an object's access pattern and move it to the optimal tier. The key point is that this is automated with no additional retrieval cost.

Looking at the internal structure of Intelligent-Tiering, it consists of five tiers. The **Frequent Access** tier (same as Standard), the **Infrequent Access** tier (automatically moved after 30 days of no access, same as Standard-IA), the **Archive Instant Access** tier (90 days of no access, same as Glacier Instant), the **Archive Access** tier (90–270 days, optionally enabled), and the **Deep Archive Access** tier (180–730 days, optionally enabled). Note that a **monitoring fee of $0.0025 per object per month** applies. For small objects under 128KB, the monitoring cost can exceed the storage cost, so you should not use Intelligent-Tiering for them.

> 🔍 **Going deeper**: For S3 Intelligent-Tiering, an ML-based access-pattern analyzer inside S3 actually tracks each object's last access time. This information is stored in the object metadata and cannot be queried directly through a Lambda function or the S3 API. If you want to analyze access patterns directly, you must use **S3 Storage Class Analysis** — this tool recommends the transition timing between Standard and Standard-IA and also tells you whether Intelligent-Tiering is a good fit.

## S3 Express One Zone — A New Category in 2023

Announced at re:Invent 2023, Express One Zone is fundamentally different from the existing S3 classes. Whereas regular S3 uses a **General Purpose Bucket**, Express One Zone uses a new bucket type called a **Directory Bucket**. Sub-millisecond access latency makes a dramatic difference when repeatedly accessing the same dataset during AI/ML training. Reducing the time the GPU waits for data is the key to reducing training costs.

However, because it stores data in a single AZ only, it is not suitable for data requiring permanent retention. The main use cases are temporary data for AI training, intermediate HPC outputs, and staging data needed only during analysis.

> 📚 **Case study**: In 2024, a Gen AI startup announced that, after moving its image dataset from Standard S3 to Express One Zone in its Stable Diffusion fine-tuning pipeline, GPU wait time dropped by 40%. As training time shrank, the EC2 GPU instance cost fell accordingly, so despite Express One Zone's higher storage unit price, the overall cost came down.

## The 2020 Strong Consistency Update — Historical Context

Until December 2020, S3 guaranteed read-after-write consistency only for new objects, and provided only eventual consistency for updates/deletes of existing objects. In other words, immediately after overwriting or deleting an object, another request could receive the previous version of the data. This behavior looked like a bug to many developers, but it was in fact a trade-off in S3's design — eventual consistency was what made the performance of a distributed system handling hundreds of thousands of requests per second possible.

In December 2020, AWS began providing **strong consistency** for all S3 read/write/delete/list operations at no additional cost. This change was the result of redesigning S3's internal metadata layer, and the industry took great notice of the fact that consistency was achieved without any performance degradation.

> ⚠️ **Trap**: If old study material or an exam question bank says "S3 is eventual consistency," that is incorrect. Since December 2020, all S3 operations are strongly consistent. If a question on the exam asks about this change, the answer is "Strong Consistency since 2020."

## Understanding the Full Cost Structure

When calculating S3 costs, many developers make the mistake of looking only at storage cost. The actual cost is made up of four components.

```
Total S3 cost = storage cost + request cost + data transfer cost + management feature cost

Storage cost: per GB/month, differentiated by storage class
Request cost: PUT is more expensive than GET (PUT ~$0.005/1000, GET ~$0.0004/1000)
Data transfer:
  - IN (upload): free
  - OUT to the internet: first 100GB/month free, then $0.09 per GB
  - OUT to AWS services in the same region: free (e.g., S3 → EC2 in the same region)
  - OUT to a different region: $0.02 per GB
Management features: S3 Inventory, Storage Class Analysis, Object Lambda, Replication
```

> 💡 **Related theory**: S3's cost structure is a classic example of "pay-per-use" in cloud economics. But the minimum storage duration and minimum object size (128KB) requirements of the IA class are examples of "hidden costs." If you store an object under 128KB in Standard-IA, you are always billed on a 128KB basis. Put millions of small files in IA and you can end up paying far more than your actual data warrants.

## Checking Directly with the CLI

```bash
# Create a bucket (Seoul region)
aws s3api create-bucket \
  --bucket my-unique-bucket-12345 \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# Specify the storage class when uploading an object
aws s3 cp archive.zip s3://my-bucket/archives/ \
  --storage-class GLACIER

# Check object metadata (including storage class)
aws s3api head-object \
  --bucket my-bucket \
  --key archive.zip

# List objects under a specific prefix
aws s3 ls s3://my-bucket/documents/ --recursive

# Change the storage class (in reality, copy + delete)
aws s3 cp s3://my-bucket/old-file.txt s3://my-bucket/old-file.txt \
  --storage-class STANDARD_IA
```

S3's "change the storage class" is actually a copy operation onto the same key. The reason this matters is that a copy operation incurs API request cost. To change the class of millions of objects, you should use an **S3 Lifecycle Policy** or **S3 Batch Operations** instead of manual copying.

The S3 philosophy we looked at today — flat namespace, distributed replication, the cost trade-offs of storage classes — is the foundational knowledge underlying all S3-related questions on the DVA-C02. In the next day, we look at how, on top of this foundation, versioning and lifecycle policies automate data management.

## 📝 연습 문제

**문제 1.** Which of the following is a valid S3 bucket name?

A) MyCompanyBucket
B) my.company.bucket
C) my-company-bucket-2026
D) 192.168.1.1-backup

**정답: C**
해설: S3 bucket names allow only lowercase letters, digits, and hyphens (dots are technically allowed too, but not recommended due to HTTPS certificate issues). A is invalid because it contains uppercase letters, and D is invalid because it is in IP-address format. B's dotted name is technically valid, but matching against a wildcard SSL certificate (`*.s3.amazonaws.com`) breaks, causing problems with HTTPS access. C is the most exemplary name.

---

**문제 2.** You want to store compliance logs that are accessed once a quarter but require the data immediately upon access. Which is the most cost-effective storage class?

A) S3 Standard
B) S3 Standard-IA
C) S3 Glacier Instant Retrieval
D) S3 Glacier Flexible Retrieval

**정답: C**
해설: Glacier Instant Retrieval is optimized for a quarterly (90-days-or-more interval) access pattern and supports millisecond-level immediate retrieval. Standard is for frequently accessed data and is over-costly for quarterly access; Standard-IA has a 30-day minimum retention and supports immediate retrieval but has higher storage cost than Glacier IR. Glacier Flexible does not support immediate retrieval and requires 1–12 hours for recovery, so it does not meet the "needed immediately" requirement.

---

**문제 3.** In 2024, you uploaded a 10MB file to S3 Standard-IA and deleted it 20 days later. What storage cost is billed?

A) 20 days' worth of cost
B) 30 days' worth of cost (minimum storage duration)
C) An additional 10 days' worth of cost
D) No cost (because it was deleted)

**정답: B**
해설: S3 Standard-IA has a minimum storage duration of 30 days. Even if you delete it after 20 days, AWS bills the remaining 10 days' worth of storage cost. This rule applies identically to Glacier Instant Retrieval (90 days), Glacier Flexible Retrieval (90 days), and Glacier Deep Archive (180 days). There is also a minimum object size (128KB) requirement, so small files are billed on a 128KB basis.

---

**문제 4.** Which is the correct description of S3 durability and availability?

A) S3 Standard's durability is 99.99% and its availability is 99.999999999%
B) One Zone-IA's durability is low because it stores data in a single AZ
C) S3 Standard's durability is 99.999999999% and One Zone-IA has the same durability
D) Glacier's durability is lower than S3 Standard's

**정답: C**
해설: The durability of all S3 storage classes is 99.999999999% (11 nines), the same. Durability means the probability of data loss; One Zone-IA achieves 11 nines through erasure coding within a single AZ. However, in the extreme case of an entire AZ being physically destroyed, there is a risk of data loss. What is low for One Zone-IA is not durability but **availability** (99.5%). B is half-right, but the phrasing "durability is low" is not accurate.

---

**문제 5.** In which of the following situations should you NOT use S3 Intelligent-Tiering?

A) Hundreds of thousands of large image files with irregular access patterns
B) Millions of small log files (average size 50KB)
C) A large dataset analyzed once every three months
D) User-uploaded files whose access pattern is hard to predict

**정답: B**
해설: S3 Intelligent-Tiering incurs a monitoring fee of $0.0025 per object per month. The monthly storage cost of a 50KB file is about $0.0000115 (on Standard), so the monitoring fee of $0.0025 is more than 200 times the storage cost. AWS itself states in the official documentation that objects under 128KB are unsuitable for Intelligent-Tiering. The other choices are all ideal use cases for Intelligent-Tiering.

---

**문제 6.** What is the maximum size of a single object that can be uploaded with an S3 PUT request, and what method must you use to upload anything larger?

A) Up to 1GB, use S3 Transfer Acceleration
B) Up to 5GB, use Multipart Upload
C) Up to 5TB, no limit
D) Up to 100MB, use Multipart Upload

**정답: B**
해설: With a single PUT request, you can upload up to 5GB. Objects exceeding 5GB must use Multipart Upload (up to 5TB), and Multipart Upload is also recommended for objects of 100MB or larger. With Multipart, on a failure you only need to retransmit the affected part, and parallel processing improves speed as well. Transfer Acceleration is a feature that provides fast uploads from anywhere in the world; it has nothing to do with size limits.

---

**문제 7.** Which is the correct description of S3 Express One Zone?

A) It distributes data across multiple AZs to guarantee 11 nines of durability
B) It can be used with the same API as a regular S3 bucket
C) It uses the Directory Bucket type and provides sub-millisecond latency
D) It is available in all regions

**정답: C**
해설: S3 Express One Zone uses a new type called a Directory Bucket, not the regular General Purpose Bucket. Because it stores data in a single AZ only, data is inaccessible on an AZ failure, and as of 2023 it is offered only in limited regions. Its sub-millisecond access latency is about 10 times faster than Standard's tens to hundreds of milliseconds. It is optimized for cases requiring repetitive data access, such as AI/ML training and HPC workloads.

---
