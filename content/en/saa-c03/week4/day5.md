# Day 5 - Week 4 Comprehensive Review: Turning S3, CloudFront, and Storage Patterns into a Single Decision System

Week 4 covered the upper layers of the AWS storage stack. S3's internal consistency model and large-scale operational patterns (Day 16), the eight storage classes and the economics of lifecycle policies (Day 17), the five access-control layers and encryption key management (Day 18), and CloudFront's three-layer cache structure and hybrid storage patterns (Day 19). These four topics are the core of the "data storage" domain that appears most often on the exam.

Today's goal is to organize this not as rote memorization but as a **decision system**. Once the thought flow of "scenario keyword → design pattern → concrete service choice" is automatic, the answer becomes visible even in a scenario you've never seen.

## A Connection Map of Week 4's Core Concepts

The four topics are not isolated islands. They sit on a single flow of data being created, consumed, protected, and expired.

```
[ Data flow and Week 4 service mapping ]

On-premises data              Global users
      |                             |
Storage Gateway ←────────────── CloudFront (CDN)
(File/Volume/Tape)               PoP → REC → Origin Shield
      |                             |
      └───────────→ S3 ←───────────┘
                   |  object storage core
                   |
          ┌────────┴────────┐
        Security           Cost
    BPA + Bucket         Lifecycle Policy
    Policy + KMS         (Hot→Warm→Cold→Ice)
    OAC + VPC EP         Intelligent-Tiering
```

Data flows around S3 at the center. On the left, on-premises Storage Gateway plays the hybrid-bridge role; on the right, CloudFront handles global distribution. Security and cost are the two core concerns wrapping around S3.

> 💡 **Related theory**: This architecture connects to the Data Mesh principle "treat data as a product (Data as a Product)." Keeping S3 as the central data lake, you provide a different interface per access pattern (on-premises connection, CDN distribution, direct API) while maintaining a single data source of record. This is thinking similar to **CQRS (Command Query Responsibility Segregation)**, which supports diverse consumption patterns while maintaining a Single Source of Truth in a distributed system.

## Storage Classes: A Summary of the Data-Temperature vs. Cost Trade-off

On the exam, storage class questions are almost always trade-off judgments. Approach them with the following framework and the answer comes in 2-3 seconds.

```
[ Storage class decision tree ]

Access frequency → immediate access needed → regenerable?
  │                │                          │
  │             YES (immediate)             YES → One Zone-IA (if AZ failure tolerable)
  │             :                           NO  → Standard or Standard-IA
  │
  ├─ Often (daily/weekly) → Standard
  ├─ Occasionally (monthly) → Standard-IA (30-day min, 128KB min)
  ├─ Once a quarter, immediate need → Glacier Instant Retrieval (90-day min)
  ├─ 1-2 times a year, time to spare → Glacier Flexible (3-5 hours or 1-5 minutes)
  ├─ Less than once a year, 12 hours OK → Glacier Deep Archive (180-day min)
  └─ Pattern unknown → Intelligent-Tiering (objects 128KB and up)
```

**Three cost traps**: If you don't meet the minimum storage duration (Standard-IA: 30 days, Glacier Instant/Flexible: 90 days, Deep Archive: 180 days), you're billed for the remaining period. The minimum object size (Standard-IA/One Zone-IA: 128KB). Incomplete multipart uploads are billed like completed objects.

> 💡 **Related theory**: Storage class choice connects to the information-theory concept of **entropy**. The more predictable the access pattern (low entropy), the more a manual Lifecycle policy is optimized. The more unpredictable (high entropy), the more Intelligent-Tiering's automatic classification lowers the total TCO. Intelligent-Tiering's monitoring fee is the "information cost" of prediction uncertainty.

> 📚 **Case study**: Netflix manages its entire content catalog across storage class tiers. New and popular titles are in Standard, less-popular content over 6 months old is in Standard-IA, and original master files are in Glacier Deep Archive. Lifecycle policies transition automatically, but when content regains popularity (a season 2 release, an award, etc.), it's raised back to Standard with S3 Batch Operations. This single pattern saves tens of millions of dollars a year in storage cost.

## S3 Security: Five-Layer Evaluation and Keyword Mapping

The crux of a security question is "at which layer, and how, do you block/allow."

| Keyword | Correct mechanism | Reason |
|--------|------------|------|
| Prevent public bucket exposure | Block Public Access (all four enabled) | last-resort safeguard, explicit Deny |
| Audit log + key rotation | SSE-KMS + CloudTrail | KMS calls recorded in CloudTrail |
| Don't want to keep key on AWS | SSE-C (customer-provided key) | AWS doesn't store the key |
| Ultra-high security (key outside AWS too) | CSE (client-side encryption) | even S3 can't see plaintext |
| Reduce KMS cost | S3 Bucket Keys | 99% fewer KMS calls |
| Allow access only from VPC | VPC Gateway Endpoint + Endpoint policy | removes the internet path |
| Prevent data exfiltration | Endpoint policy: allow only approved buckets | blocks exfiltration to other S3 |
| Access only from CloudFront | OAC + BPA enabled | blocks direct S3 access |
| Separate multiple teams by prefix | S3 Access Points | independent per-team policy |
| Legal delete prohibition (date unknown) | Object Lock Legal Hold | indefinite, removed with a separate permission |
| Legal delete prohibition (date known) | Object Lock Compliance Mode | even root can't delete |
| Prevent accidental deletion | S3 Versioning + MFA Delete | creates a Delete Marker |
| Enforce HTTPS | bucket policy Deny (aws:SecureTransport=false) | blocks HTTP requests |

> 💡 **Related theory**: S3 access control's five-layer structure follows the same **layering principle** as the OSI model. Each layer operates independently, and if a lower layer denies, the allow of an upper layer is nullified. What NIST SP 800-207 "Zero Trust Architecture" calls "treat every request as potentially hostile and authenticate/authorize on every request" is implemented by this multi-layered structure. BPA is the first checkpoint, SCP is the organization boundary, the VPC Endpoint Policy is the network boundary, and IAM/Bucket Policy is identity-based control.

> 🔍 **Going deeper**: In envelope encryption, how is SSE-KMS's guarantee that "the key never leaves KMS" achieved? KMS's HSM (Hardware Security Module) is hardware certified to FIPS 140-2 Level 3. The master key exists physically only inside this HSM. When you call KMS's `GenerateDataKey` API, it generates a DEK (data encryption key) inside the HSM and returns the plaintext DEK and the DEK encrypted with the master key. After that, the master key never leaves the HSM, and only the encrypted DEK is stored. This structure is the crux of making key theft nearly impossible.

> ⚠️ **Pitfall**: Don't confuse Object Lock Governance Mode and Compliance Mode. If the requirement is "no one can delete," it's Compliance Mode. In Governance Mode, an IAM user with the `s3:BypassGovernanceRetention` permission (including root) can remove the lock. On the exam, when "regulatory-auditor requirement," "legal retention," or "even root can't delete" appear, it's Compliance Mode.

## CloudFront: Criteria for Cache Layers and Edge Computing

CloudFront questions come in two patterns. "At which layer to process it" (cache layers) and "which edge compute to use" (Functions vs Lambda@Edge).

### Cache-Layer Optimization

```
[ Design to minimize origin load ]

Goal: minimize the number of Origin requests

Layer 1: cache-key optimization
  → remove unnecessary headers/cookies from the cache key
  → treat the same content as the same cache entry

Layer 2: TTL optimization
  → static assets: 7+ days (use versioned filenames)
  → dynamic API: TTL=0 (no caching)
  → images: 1 day to 7 days

Layer 3: enable Origin Shield
  → multi-region users + single-origin structure
  → all REC cache misses consolidate to Origin Shield
```

**Invalidation (cache invalidation)**: forces a cache refresh when a file is updated. Wildcards like `/images/*` are allowed. The first 1,000 paths/month are free, then billed per path. When updates are frequent, a strategy of including a version/hash in the filename to create a new cache without Invalidation is more efficient.

> 📚 **Case study**: When Facebook's 2021 DNS outage took services down for 6 hours, sites using CloudFront as their CDN kept serving static content with a high cache hit ratio, regardless of the origin failure. It's a case where CloudFront's TTL-based cache acted as a buffer against origin failure. However, API paths with TTL=0 took the full brunt of the origin failure.

### Criteria for Choosing Edge Computing

| Requirement | CloudFront Functions | Lambda@Edge |
|--------|---------------------|------------|
| URL rewrite/redirect | ✅ (lightweight, fast) | possible but overkill |
| Query-parameter normalization | ✅ | possible but overkill |
| Simple header addition | ✅ | possible but overkill |
| JWT / external auth server call | ❌ (no external calls) | ✅ |
| A/B testing (DB lookup) | ❌ (no DB access) | ✅ |
| Image transformation (Sharp, etc.) | ❌ (insufficient memory/time) | ✅ |
| Origin response transformation | ❌ (no Origin events) | ✅ |

> 🔍 **Going deeper**: The reason CloudFront Functions "can't make external calls" is not only a network constraint but also the **execution-time constraint (1ms)**. Since the RTT of an external HTTP call is at least tens of ms, it can't complete within the 1ms limit. Lambda@Edge can run up to 30 seconds, so external API calls are possible. But Lambda@Edge runs at Regional Edge Caches (13 locations), so it's geographically farther from the user than CloudFront Functions (400+ PoPs). This is the technical basis for the principle "light, fast logic → Functions; heavy logic → Lambda@Edge."

## Choosing a Hybrid Storage Tool: The Decisive Differences of the Three Services

| | DataSync | Storage Gateway | Snow Family |
|--|---------|----------------|-------------|
| **Core purpose** | migration/sync | permanent hybrid | offline bulk transfer |
| **Keywords** | "migration", "one-time transfer", "periodic sync" | "keep using like local", "cache sync", "keep NFS/SMB" | "insufficient network", "petabytes", "no-internet environment" |
| **Offline** | no | no | core feature |
| **Real-time** | scheduled/real-time | continuous cache sync | N/A |
| **Storage Gateway details** | - | S3 File GW (NFS/SMB→S3) / FSx File GW (SMB→FSx, AD) / Volume GW (iSCSI→EBS Snap) / Tape GW (VTL→S3/Glacier) | - |

**Why Tape Gateway exists**: There are still hundreds of thousands of physical tape libraries operating around the world. Backup software like Veeam, Veritas NetBackup, and IBM Spectrum Protect has decades of history, and replacement and retraining costs are enormous. Tape Gateway makes this software believe "there is a tape library" while actually storing data in AWS S3/Glacier. It removes the management burden of physical tape (tape swapping, off-site storage, tape degradation) while letting software migration be deferred to later.

> 💡 **Related theory**: Storage Gateway's **local cache layer** works on the same principle as a computer's memory hierarchy (Cache → RAM → Disk). Frequently accessed data (Hot) is in the gateway's local disk cache, and less-accessed data is in AWS S3/Glacier. In environments where the 80-20 rule applies (80% of all access concentrates on 20% of the data), setting the local cache size to 20-30% of the total data yields a high cache hit ratio.

## Five Integrated Architecture Patterns

Here are the five patterns that appear most often in exam scenarios, organized as architectures.

**Pattern A: Global static web service (the most common pattern)**
```
User (global)
  → CloudFront (HTTPS, Signed URL/Cookie, WAF)
      ├─ /static/* → S3 bucket (BPA ON, OAC, SSE-KMS)
      │               Lifecycle: 90 days→IA, 365 days→Glacier
      ├─ /api/*    → ALB → ECS/EC2 (dynamic processing)
      └─ /video/*  → CloudFront Signed Cookie (premium subscribers)
```

**Pattern B: Long-term retention of regulated data**
```
Data creation → S3 bucket (SSE-KMS, Object Lock Compliance 7 years)
             → Lifecycle: immediately to Glacier Deep Archive
             → Versioning + MFA Delete
             → S3 Access Log → another bucket (for auditing)
             → CloudTrail + KMS API → audit log
```

**Pattern C: ML training data pipeline**
```
On-premises server → DataSync → S3 (training data)
                                 ↓ Lifecycle: after training, Standard-IA
                                 ↓ (FSx for Lustre integration)
                              EC2 GPU cluster → S3 (checkpoints)
                                              → S3 Object Lambda (data augmentation)
```

**Pattern D: On-premises hybrid file sharing**
```
Headquarters (Windows AD environment)
  └─ Storage Gateway FSx File Gateway
       ├─ local cache (frequently used files, immediate response)
       └─ Amazon FSx for Windows File Server (AD integration)
            └─ Lifecycle: old files → S3 Intelligent-Tiering
```

**Pattern E: Multi-team data lake**
```
S3 data-lake bucket (SSE-KMS, BPA ON)
  ├─ Access Point: analytics-ap (VPC-analytics only)
  │   Policy: s3:GetObject on /analytics/*
  ├─ Access Point: ml-ap (VPC-ml only)
  │   Policy: s3:* on /ml-data/*
  └─ Access Point: data-eng-ap
      Policy: s3:* on /* (full access for data engineering)

Bucket policy: Deny direct access, allow only Access Points
VPC Endpoint: each VPC → S3 (bypasses the internet)
```

> ⚠️ **A roundup of 7 pitfalls**
> 1. **Reverting from Glacier to Standard via Lifecycle is impossible** — only via CopyObject
> 2. **S3 versioning can't be disabled, only Suspended** — re-enabling recovers existing versions
> 3. **OAI doesn't support SSE-KMS buckets** — migration to OAC is needed
> 4. **Lambda@Edge functions are created only in us-east-1** — CloudFront handles global distribution
> 5. **CloudFront Functions handle only Viewer Request/Response** — Origin events are Lambda@Edge
> 6. **Storage Gateway Tape Gateway: for replacing physical tape** — keeps on-premises backup SW
> 7. **Transfer Acceleration: no effect or even slower within the same region** — valid only across continents

## A Comprehensive Cost-Optimization Checklist

For the SAA exam's cost-optimization domain (20% weight), approach storage-related questions with this checklist.

```
[ S3 cost-optimization checklist ]

□ Consider gp2 → gp3 migration (Week 3 content, includes EBS too)
□ Clean up S3 incomplete multipart uploads (Lifecycle: AbortIncompleteMultipartUpload 7 days)
□ Old-version expiration policy for versioned buckets (NoncurrentVersionExpiration)
□ Glacier transition for data unaccessed 90+ days (Lifecycle Transition)
□ Apply Intelligent-Tiering (unpredictable pattern + objects 128KB and up)
□ Identify unused data with S3 Inventory + S3 Analytics
□ Understand organization-wide storage patterns with Storage Lens
□ Raise the CloudFront cache hit ratio to reduce origin GET requests
□ Enable SSE-KMS → Bucket Keys (99% fewer KMS costs)
□ Transfer Acceleration: disable if unnecessary
```

> 📚 **Case study**: Until Dropbox migrated from AWS to its own data centers in 2016 (the "Magic Pocket" project), it stored the files of hundreds of millions of users on S3. During this period, the S3 cost-optimization patterns Dropbox applied were access-frequency-based storage class classification, multipart-upload optimization, and CloudFront integration to cut GET request costs. Its S3 cost at the time was on the order of tens of millions of dollars a year, and it disclosed that the optimization work saved 30-40%. This experience became the starting point for the industry discussion of "how to optimize exabyte-scale storage."

## A Table of Key Numbers to Memorize

Here are the numbers that appear often on the exam, gathered in one place.

| Item | Value | Meaning |
|------|----|----- |
| S3 single PutObject max | 5GB | multipart required if exceeded |
| S3 max object size | 5TB | multipart upload |
| Multipart part count | up to 10,000 | min 5MB per part |
| S3 strong consistency introduced | December 2020 | previously Eventually Consistent |
| Standard-IA min duration | 30 days | billed for 30 days if less |
| Standard-IA min object | 128KB | billed as 128KB if less |
| Glacier Instant/Flexible min | 90 days | |
| Glacier Deep Archive min | 180 days | |
| Deep Archive Standard retrieval | 12 hours | |
| Deep Archive Bulk retrieval | 48 hours | |
| CRR RTC SLA | 99.99% within 15 minutes | Replication Time Control |
| S3 performance limit | 3,500 PUT/5,500 GET (per prefix) | automatic partitioning (2018~) |
| CloudFront PoP count | 400+ | global edge |
| CloudFront Functions execution time | under 1ms | |
| Lambda@Edge max execution time | 30 seconds (Origin events) | |
| Presigned URL IAM role max | IAM session expiry time | invalid when the role session ends |
| Bucket Keys KMS savings | up to 99% | |

---

## 📝 연습 문제

**문제 1.** A global media company streams 4K master videos stored in S3 to users worldwide. Which of the following is the correct design combination?

A) S3 Public bucket + CloudFront TTL=0 + no Lambda@Edge
B) S3 Private bucket + BPA enabled + CloudFront OAC + Signed Cookie + Origin Shield
C) S3 Public bucket + CloudFront OAI + Signed URL (per file)
D) S3 Private bucket + Transfer Acceleration + Signed URL

**정답: B**
해설: Keep S3 Private (BPA fully enabled). Access S3 securely via CloudFront OAC. A Signed Cookie lets premium subscribers access thousands of video files (a Signed URL is per file, so managing thousands is infeasible). Origin Shield consolidates the origin requests of global RECs to reduce origin load. A leaves S3 Public, so anyone can access it directly. C's OAI is legacy and doesn't support SSE-KMS. D's Transfer Acceleration is for upload acceleration and unnecessary for streaming.

---

**문제 2.** A hospital stores MRI imaging data in S3. It's accessed frequently for 6 months after a visit, then needs immediate access 1-2 times a year for the next 5 years, and is deleted after 7 years. What is the optimal lifecycle policy?

A) Glacier Deep Archive immediately → delete after 7 years
B) Day 0: Standard → Day 180: Glacier Instant Retrieval → 7 years (2,555 days): delete
C) Day 0: Standard → Day 30: Standard-IA → Day 180: Glacier Instant → 7 years: delete
D) Intelligent-Tiering immediately → delete after 7 years

**정답: C**
해설: Frequent access until 6 months (180 days) after a visit → Standard, or Standard-IA (after 30 days). After 6 months (180 days), 1-2 times a year with immediate need → Glacier Instant Retrieval (ms retrieval, meets the 90-day minimum duration). Expire after 7 years (2,555 days). B's Day-180 Glacier Instant meets the 90-day minimum, but the minimum transition period from Standard directly to Glacier Instant is 90 days. C adds Standard-IA in the middle to optimize cost further. D's Intelligent-Tiering is more expensive than a manual Lifecycle when the access pattern is predictable.

---

**문제 3.** Under SEC regulations, financial transaction records must be retained for 7 years, non-modifiable and non-deletable. No one, including the AWS root account, must be able to delete the data. How do you configure it?

A) S3 Versioning + MFA Delete
B) S3 Object Lock Governance Mode, Retention Period 7 years
C) S3 Object Lock Compliance Mode, Retention Period 7 years
D) S3 Bucket Policy: Deny s3:DeleteObject for all principals

**정답: C**
해설: In Compliance Mode, no one — including the root account — can delete an object or modify the lock during the set period. It meets SEC Rule 17a-4's WORM (Write Once, Read Many) requirement and is certified by Cohasset Associates. In Governance Mode, a holder of the `s3:BypassGovernanceRetention` permission can delete, so it fails the "no one can" requirement. MFA Delete is for accident prevention, not legal WORM. A Bucket Policy Deny can be bypassed by modifying the policy itself.

---

**문제 4.** A data-analytics team's EC2 processes sensitive customer data in an S3 data lake. The security team requires two things: (1) prevent S3 data exfiltration over the internet, and (2) prevent the analytics EC2 from accessing any S3 outside the approved data-lake bucket. How do you configure it?

A) A policy on the EC2 IAM role allowing only a specific bucket + NAT Gateway
B) VPC Gateway Endpoint for S3 + Endpoint policy (approved buckets only) + S3 bucket policy (allow only from that VPC Endpoint)
C) Enable BPA on the S3 bucket + CloudFront OAC
D) AWS PrivateLink for S3 + Security Group restriction

**정답: B**
해설: A VPC Gateway Endpoint provides a path to access S3 directly without the internet (no cost). Allowing only approved buckets in the Endpoint policy blocks access to other S3 buckets (including other accounts). Allowing only this Endpoint via the `aws:SourceVpce` condition in the S3 bucket policy also blocks access over the internet. A goes through the NAT Gateway, so it accesses S3 over the internet, leaving the possibility of data exfiltration. IAM policy alone can't block paths outside the Endpoint. C is a static-content distribution pattern.

---

**문제 5.** Production data at an on-premises factory is generated by a SCADA system. You want to store this data in AWS S3 in real time, but the SCADA system supports only the NFS protocol. The factory network and AWS are connected via Direct Connect. What is the most suitable solution?

A) Install an AWS DataSync agent
B) AWS Storage Gateway S3 File Gateway
C) Amazon S3 Transfer Acceleration
D) AWS Snow Family

**정답: B**
해설: S3 File Gateway is installed on-premises and provides an NFS (or SMB) mount point. When the SCADA system writes files over NFS, the File Gateway syncs them to S3 in the background. Since the requirement is "keep using it in real time," Storage Gateway, which is permanent hybrid operation, is suitable. DataSync is for one-time or scheduled migration/sync and doesn't provide a real-time NFS mount. Transfer Acceleration is for internet-based upload acceleration and is unnecessary in a Direct Connect environment. Snow Family is for offline migration.

---

**문제 6.** An e-commerce company distributes product images worldwide via CloudFront. The image URLs carry `?size=medium&format=webp` query parameters, but the parameter order differs per client (`?format=webp&size=medium`), so the same image is stored as a different cache entry. What is the most cost-effective way to raise the cache hit ratio?

A) Sort the query parameters with Lambda@Edge (Origin Request)
B) Sort the query parameters with CloudFront Functions (Viewer Request)
C) Normalize the query parameters at the ALB
D) Exclude the query parameters from the cache key in the Cache Policy

**정답: B**
해설: Sorting query parameters alphabetically is simple string manipulation, for which CloudFront Functions (under 1ms, 2MB memory) is sufficient. It runs on the Viewer Request event, operates on 400+ PoPs, and costs about 1/6 of Lambda@Edge. Lambda@Edge is overkill when no external calls or complex logic are needed. If you exclude query parameters from the cache key as in D, `?size=medium` and `?size=large` return the same cache, delivering the wrong image.

---

**문제 7.** A startup stores user files in S3. Data is small initially but is expected to grow to hundreds of TB in 3 years. It's hard to predict each file's access frequency, and the team is small with no capacity for manual lifecycle management. What is the most suitable storage strategy?

A) Store all files in Standard and add Lifecycle later
B) Store all files in the Intelligent-Tiering storage class + a Lifecycle to clean up incomplete multipart
C) Store directly in Standard-IA
D) Store in Glacier Instant Retrieval

**정답: B**
해설: Unpredictable access pattern + no capacity for manual management = Intelligent-Tiering. It automatically moves between Frequent/Infrequent Access to optimize cost and reverts with no retrieval cost. However, incomplete multipart uploads are billed like Standard even under Intelligent-Tiering, so an `AbortIncompleteMultipartUpload: 7 days` Lifecycle is a must-have additional setting. A risks forgetting the manual addition and wasting cost in the meantime. C incurs retrieval cost on frequently accessed files. D allows ms retrieval, but while its storage cost is cheaper than Standard, its cost is high with frequent access.

---

**문제 8.** A company encrypts data in an S3 bucket with a KMS key (SSE-KMS). A data-analytics system reads 5,000 S3 objects per second, and KMS API call costs are 5x higher than expected. How do you reduce cost while keeping encryption?

A) Change the encryption method to SSE-S3
B) Enable S3 Bucket Keys
C) Decrypt the data and store it in a cache
D) Create the KMS key in a different region

**정답: B**
해설: Bucket Keys generate a Bucket Key (temporary key) from KMS and cache it at the S3 level. Instead of calling KMS on every object request, DEKs are generated from the Bucket Key, reducing the number of KMS calls by up to 99%. SSE-KMS's audit trail (CloudTrail) and key-management features are retained as is. A loses the CloudTrail audit trail and fails the compliance requirement. C carries the security risk of keeping plaintext data in a cache. D doesn't change the number of KMS calls even in a different region.

---

**문제 9.** Match each scenario below with the most suitable solution.

1. On-premises Veritas NetBackup backs up data to a tape library. You want to eliminate physical tape but can't replace the software.
2. One-time migration of 10TB of on-premises data to S3. There's a 1Gbps Direct Connect connection.
3. Employees at branch offices keep accessing on-premises NAS server data like S3.
4. Migrating 500TB of data collected at a remote construction site to AWS. No internet.

A) Tape Gateway / B) DataSync / C) S3 File Gateway / D) Snowball Edge

**정답: 1-A, 2-B, 3-C, 4-D**
해설: 1. Tape Gateway fools existing backup software with an iSCSI VTL. Backups are stored in S3/Glacier without replacing the software. 2. DataSync migrates quickly via parallel transfer over Direct Connect. Optimal for one-time migration. 3. S3 File Gateway provides an NFS mount so employees keep their existing file-access method. Fast access via a local cache. 4. Snowball Edge collects data on a physical device and ships it to an AWS facility. Essential for large-volume migration in a no-internet environment.

---

**문제 10.** Find the error in the following CloudFront Distribution configuration. A team tried to protect an S3 bucket with OAC and make it accessible only through CloudFront.

Configuration:
- S3 bucket: BPA disabled
- CloudFront origin: uses the S3 static website endpoint (`bucket.s3-website-ap-northeast-2.amazonaws.com`)
- OAC: configured
- Bucket policy: allows the CloudFront OAC Principal

A) Disabling BPA is the problem
B) Using the S3 static website endpoint as the origin is the problem
C) OAC works only with SSE-S3
D) The bucket policy is wrong

**정답: A, B 모두 문제 (시험에서는 가장 큰 문제 하나를 고른다면 B)**
해설: OAC works only with an S3 REST endpoint (`bucket.s3.region.amazonaws.com`). Using the S3 static website endpoint as the origin means OAC doesn't work, allowing access without authentication. Also, disabling BPA can allow direct public access to the bucket. Correct configuration: use the S3 REST endpoint as the origin + configure OAC + fully enable BPA + allow only the OAC Principal in the bucket policy. If static-hosting features (index document, error pages) are needed, handle them at CloudFront with `CustomErrorResponse`.

---

**문제 11.** A company wants to apply KMS encryption to all data in an S3 bucket and block uploads of unencrypted objects. How do you configure it?

A) Setting the S3 bucket default encryption to SSE-KMS automatically encrypts all objects
B) S3 bucket default encryption SSE-KMS + a bucket policy that Denies requests without the `s3:x-amz-server-side-encryption-aws:kms` header
C) Reject requests without encryption in the KMS key policy
D) Block unencrypted S3 PutObject with an SCP

**정답: B**
해설: Setting only S3 default encryption still auto-encrypts objects uploaded without encryption as SSE-S3 (with an S3-managed key, not KMS). To enforce SSE-KMS, the bucket policy must Deny requests where the `x-amz-server-side-encryption` header is not `aws:kms`. Without this policy, the bucket accepts uploads even if the client uses SSE-S3 or no encryption. A alone does not enforce SSE-KMS.

---

**문제 12.** In an AWS Organizations environment, you want to centrally analyze the S3 data of 100 accounts. You need to see each account's bucket access patterns, cost-optimization opportunities, and security vulnerabilities at a glance. Which service is most suitable?

A) AWS Config + S3 rules
B) Amazon Macie
C) S3 Storage Lens
D) AWS Cost Explorer + S3 tags

**정답: C**
해설: S3 Storage Lens analyzes S3 usage patterns across the entire AWS Organizations at the organization level and provides per-bucket cost, access patterns, and security level as a dashboard. It also includes automated recommendations (potential savings from a Glacier transition, buckets without versioning, etc.). AWS Config is for compliance checks, not usage-pattern analysis. Macie is a PII (personally identifiable information) detection tool. Cost Explorer shows only cost and has no S3-specific access-pattern analysis.
