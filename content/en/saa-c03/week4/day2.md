# Day 2 - S3 Storage Classes and Lifecycle: The Economics of Managing Data Temperature

Data has a temperature. A log file just uploaded is hot. A log 30 days old is warm, occasionally pulled up for analysis. A log more than a year old is cold, barely looked at except during a regulatory audit. And a log five years old is in the Ice tier, retained purely out of legal obligation.

S3's eight storage classes are a trade-off design of cost, availability, and retrieval time mapped onto this temperature spectrum. The wrong class choice quietly eats money. Put hot data in Glacier and you rack up excessive retrieval costs; leave cold data in Standard and you waste storage cost. This article covers the internal design principle of each class, the traps in the cost structure, and the optimal design patterns for lifecycle policies.

## The Design Principle of Storage Classes: What Are You Trading?

The pricing structure of S3 storage classes is made up of three cost dimensions.

**Storage cost**: The monthly cost per GB. The colder the class, the lower it is.

**Request cost**: The cost per API call. The Glacier family has higher GET request costs than Standard.

**Retrieval cost**: The extra cost of pulling data out. It occurs in the Glacier family, and the faster the retrieval, the more expensive.

On top of these, the **minimum storage duration** and the **minimum billable object size** are additional traps.

```
[ S3 cost structure comparison (ap-northeast-2, 2025 reference figures) ]

Class                | Storage($/GB/mo) | GET request | Retrieval | Min duration
Standard             | ~$0.025          | $0.0004/1K  | none      | none
Intelligent-Tiering  | monitoring fee+  | varies/tier | none      | none
Standard-IA          | ~$0.0138         | $0.001/1K   | $0.01/GB  | 30 days
One Zone-IA          | ~$0.011          | $0.001/1K   | $0.01/GB  | 30 days
Glacier Instant      | ~$0.005          | $0.01/1K    | $0.03/GB  | 90 days
Glacier Flexible     | ~$0.004          | $0.0004/1K  | $0.01/GB(Std) | 90 days
Glacier Deep Archive | ~$0.00099        | $0.0004/1K  | $0.02/GB(Std) | 180 days
```

The key point is the trade-off: **to save on storage cost, you have to pay more on retrieval cost**. The goal of cost optimization is to minimize the total TCO (Total Cost of Ownership = storage + request + retrieval + transfer), not just to lower the storage unit price.

## The Design Intent and Internal Principle of Each Class

### Standard: What the Default Means

S3 Standard replicates data across three or more AZs and provides durability that can recover data even if any two AZs are lost simultaneously. Its durability of eleven nines (99.999999999%) means an annual loss probability of 0.000000001%. That's the probability of losing a single file even if you stored 100,000 files of 1MB each for 10 million years.

Standard has millisecond retrieval times and no extra retrieval cost. There's no constraint on access patterns. Whether you read it thousands of times per second or once a month, the storage unit price is the same. It's the starting point for every workload.

> 💡 **Related theory**: Eleven nines of durability is achieved with **Erasure Coding**. S3 splits an object into many chunks, generates additional parity chunks, and distributes them across multiple servers, devices, and facilities. Under the principle of Reed-Solomon codes, from k data chunks and m parity chunks, you can recover the original k even if m chunks are lost. This is why it delivers higher durability than simple replication (three copies) while being more storage-efficient.

### Standard-IA: The Cost Structure of "Infrequent Access"

Standard-IA is a class for data that's "not accessed often, but needed immediately when it is." Its storage unit price is about 55% of Standard, but a per-GB cost is added on retrieval.

The key trap is that the minimum storage duration is 30 days. Even if you keep an object for just one day and delete it, you're billed for 30 days of storage. So Standard-IA is cost-effective only for data you **actually keep for 30+ days and access fewer than 2-3 times per month**. If the access frequency is once a month or more, Standard can be cheaper.

The minimum object size is also 128KB. Store a 1KB file in Standard-IA and you're billed for 128KB. For millions of small files, Standard or Intelligent-Tiering is better.

### One Zone-IA: What a Single AZ Means

One Zone-IA is a cheaper version of Standard-IA, but the **data is stored in a single AZ only**. If that AZ fails, you can lose the data.

Use it only for "regenerable data": thumbnails generated on EC2 after a CloudFront cache invalidation, aggregation results that can be recomputed from another source, reports that can be regenerated on demand, and the like. Never use it for original data or data that can't be recovered once lost.

> ⚠️ **Pitfall**: When a proposal says "let's move to One Zone-IA to cut costs," you must verify "is it regenerable?" On the exam, choosing One Zone-IA without an explicit condition like "data loss on AZ failure is acceptable" is a wrong answer.

### Intelligent-Tiering: ML-Based Automatic Optimization

Intelligent-Tiering monitors an object's access pattern and automatically moves it to the most cost-effective tier.

```
[ Intelligent-Tiering tier structure ]

Frequent Access     ← default (automatic)
    ↓ no access for 30 days
Infrequent Access   ← automatic move (no retrieval cost!)
    ↓ no additional access for 90 days
Archive Instant Access  ← automatic (ms retrieval, retrieval cost applies)
    ↓ no additional access for 180 days
Archive Access      ← optional (3-5 hour retrieval, retrieval cost applies)
    ↓ optional
Deep Archive Access ← optional (12 hour retrieval, retrieval cost applies)
```

The key advantage: the automatic move between Frequent ↔ Infrequent Access has **no retrieval cost**. You only pay an object monitoring fee (about $0.0025 per 1,000 objects per month). Small objects under 128KB always stay in the Frequent Access tier (you pay the monitoring fee but they don't move to IA → a loss if you have many small files).

The case where Intelligent-Tiering is most advantageous is when **access patterns are unpredictable, or the team has no will to actively manage lifecycles**. If you can design and manage a manual Lifecycle policy perfectly, a manual Lifecycle can be more optimized.

> 🔍 **Going deeper**: Intelligent-Tiering's "no access for 30 days → move to Infrequent Access" is not a simple timer. S3 tracks each object's last access time. If there's an access, it immediately reverts to Frequent Access. This reversion has no extra cost. By contrast, an object moved directly from Standard → Standard-IA via Lifecycle cannot be moved back to Standard via Lifecycle (only via a manual CopyObject). Intelligent-Tiering has the advantage of handling this reversion automatically.

### The Three Glaciers: The Spectrum of Archive Storage

The Glacier series is archive storage for data you "rarely look at but must keep for a long time." It tunes cost through three retrieval speeds.

**Glacier Instant Retrieval**: Its storage unit price is lower than Standard-IA, yet its **retrieval time is in milliseconds**. It suits data with low access frequency but immediate need on access, such as medical imaging accessed about once a quarter or a news archive. Minimum storage duration is 90 days.

**Glacier Flexible Retrieval**: Has three retrieval options.
- Expedited (urgent): 1-5 minutes, most expensive
- Standard: 3-5 hours, middle
- Bulk: 5-12 hours, cheapest

It suits data you can retrieve on a planned schedule, such as backups and disaster-recovery data.

**Glacier Deep Archive**: The cheapest class in S3. Its storage unit price is about 4% of Standard. Standard retrieval (default) is 12 hours, Bulk retrieval 48 hours. Minimum storage duration is 180 days. Use it for financial and medical data requiring 7-10 year regulatory retention.

> 📚 **Case study**: Netflix stores its original master video files (top quality, 4K HDR, several TB) in Glacier Deep Archive. These files are pulled only when a new format appears or content needs remastering, so they're accessed once every few years. The cost is roughly 1/25 of keeping them in Standard. Similarly, Hollywood studios use S3 Glacier Deep Archive as their digital master vault.

> 💡 **Related theory**: Glacier's retrieval latency is deliberate by design. Fast retrieval requires data to sit on immediately accessible storage, which is expensive. Glacier's data is stored on low-cost, high-density storage (HDD); when a retrieval request arrives, it reads the data from tape or HDD, copies it to temporary high-speed storage, and then allows access. Expedited retrieval is more expensive than Standard because it requires immediate high-speed storage allocation.

## Lifecycle Policies: The Design of Automation

A Lifecycle Configuration is a rule that automatically moves S3 objects to a different class over time, or deletes them.

### The Minimum-Days Constraint on Transition Rules

```
[ Valid Lifecycle transition paths ]

Standard → Standard-IA    (min 30 days)
Standard → One Zone-IA    (min 30 days)
Standard → Glacier Instant (min 90 days)
Standard → Glacier Flexible (min 90 days)
Standard → Deep Archive   (min 90 days)

Standard-IA → Glacier Instant (30+ additional days)
Standard-IA → Glacier Flexible (30+ additional days)
Standard-IA → Deep Archive   (30+ additional days)

Intelligent-Tiering → Glacier Flexible (90+ days)
Intelligent-Tiering → Deep Archive   (90+ days)
```

Moving in the reverse direction (e.g., Glacier → Standard) is not possible via Lifecycle. After retrieval, you must move it manually with CopyObject.

### Practical Lifecycle Patterns

**Pattern 1: Log files (1-year lifespan, analysis concentrated in the first 30 days)**
```json
{
  "Rules": [{
    "ID": "log-lifecycle",
    "Status": "Enabled",
    "Filter": {"Prefix": "logs/"},
    "Transitions": [
      {"Days": 30, "StorageClass": "STANDARD_IA"},
      {"Days": 90, "StorageClass": "GLACIER"},
      {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
    ],
    "Expiration": {"Days": 2555}
  }]
}
```

**Pattern 2: Cost control for a versioned bucket**
```json
{
  "Rules": [{
    "ID": "version-cleanup",
    "Status": "Enabled",
    "Filter": {},
    "NoncurrentVersionTransitions": [
      {"NoncurrentDays": 30, "StorageClass": "STANDARD_IA"},
      {"NoncurrentDays": 90, "StorageClass": "GLACIER"}
    ],
    "NoncurrentVersionExpiration": {"NoncurrentDays": 365},
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
  }]
}
```

**Pattern 3: Cleaning up incomplete multipart uploads (a must-have setting)**
```json
{
  "Rules": [{
    "ID": "cleanup-incomplete-multipart",
    "Status": "Enabled",
    "Filter": {},
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
  }]
}
```

> ⚠️ **Two pitfalls**: First, even with a Lifecycle transition set, **if an object is deleted earlier than its minimum storage duration, you still pay for the remaining period**. Moving a 3-day-old file to Standard-IA is theoretically impossible (30-day minimum), but Lifecycle technically allows it, and in that case you're billed for 30 days. Second, Lifecycle **transitions run at midnight (UTC)**. They don't move immediately after you configure them.

## S3 Storage Lens: Organization-Wide Storage Visibility

Storage Lens is a tool that analyzes S3 usage patterns at the organization level in a multi-account AWS Organizations environment. It shows per-bucket cost, data-protection level, and access patterns at a glance.

Automated recommendations are the core:
- "80% of this bucket's data hasn't been accessed in 90+ days, so a Glacier transition could save $X per month."
- "This bucket has no versioning, so its protection level is low."
- "Incomplete multipart uploads are wasting cost at Y GB."

## Comparison with Other Clouds

| Class type | AWS S3 | GCP Cloud Storage | Azure Blob Storage |
|------------|--------|-------------------|-------------------|
| Hot | Standard | Standard | Hot |
| Warm | Standard-IA / One Zone-IA | Nearline (30-day min) | Cool (30-day min) |
| Cold | Glacier Instant | Coldline (90-day min) | Cold (90-day min) |
| Archive | Glacier Deep Archive | Archive (365-day min) | Archive (180-day min) |
| Auto-tiering | Intelligent-Tiering | Autoclass | none (manual config) |

GCP Autoclass supports access-pattern-based automatic tiering, similar to Intelligent-Tiering. Azure still has no automatic tiering, so you have to manage Lifecycle Policies manually.

A notable difference: GCP Archive's minimum storage duration is 365 days, but AWS Glacier Deep Archive is 180 days. This difference matters when designing long-term retention regulations.

## Cementing It with the CLI

```bash
# View the bucket's current lifecycle rules
aws s3api get-bucket-lifecycle-configuration --bucket my-bucket

# Apply a composite Lifecycle rule
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "logs-tiering",
        "Status": "Enabled",
        "Filter": {"Prefix": "logs/"},
        "Transitions": [
          {"Days": 30, "StorageClass": "STANDARD_IA"},
          {"Days": 90, "StorageClass": "GLACIER"},
          {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
        ],
        "Expiration": {"Days": 2555}
      },
      {
        "ID": "cleanup-multipart",
        "Status": "Enabled",
        "Filter": {},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
      },
      {
        "ID": "old-versions",
        "Status": "Enabled",
        "Filter": {},
        "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
      }
    ]
  }'

# Upload an object to a specific storage class
aws s3 cp data.csv s3://my-bucket/data.csv \
  --storage-class INTELLIGENT_TIERING

# Move an existing object to a different class (CopyObject + class change)
aws s3 cp s3://my-bucket/old-data.csv s3://my-bucket/old-data.csv \
  --storage-class GLACIER \
  --metadata-directive COPY

# View the Storage Lens organization summary
aws s3control list-storage-lens-configurations \
  --account-id 123456789012

# Request restore of a Glacier object (Standard retrieval, 7-day access)
aws s3api restore-object \
  --bucket my-bucket \
  --key archived/data.csv \
  --restore-request '{
    "Days": 7,
    "GlacierJobParameters": {"Tier": "Standard"}
  }'
```

## A Decision Framework for Choosing a Storage Class

On the exam, storage class questions are solved by checking these four things.

```
1. Access frequency?
   - Often (daily/weekly): Standard
   - Occasionally (monthly): Standard-IA
   - Rarely (quarterly): Glacier Instant
   - 1-2 times a year: Glacier Flexible
   - Less than once a year: Glacier Deep Archive
   - Unknown: Intelligent-Tiering

2. Is it needed immediately on retrieval?
   - Needed immediately: Standard, Standard-IA, One Zone-IA, Glacier Instant
   - Can wait hours: Glacier Flexible (minutes to hours)
   - Can wait half a day: Glacier Deep Archive

3. Is the data regenerable?
   - NO: never use One Zone-IA
   - YES: One Zone-IA can be considered

4. Retention period?
   - Frequent changes within 30 days: Standard (the IA minimum-duration trap)
   - 7+ years regulatory: Glacier Deep Archive
```

## Wrapping Up

S3 storage classes are designed on the trade-off "storage cost ↓ = retrieval cost/time ↑." The key is to optimize the total TCO, not just to lower the storage unit price.

Lifecycle policies automate this optimization. The most important settings are cleaning up incomplete multipart uploads, expiring old versions in a versioned bucket, and the gradual Glacier migration of long-term data. Without a lifecycle policy, all data accumulates in Standard and costs climb.

---

## 📝 연습 문제

**문제 1.** You store medical imaging (MRI, CT) data. Images are accessed frequently for 3 months after a visit, but after that they need to be provided immediately, only once or twice a year, on a doctor's request. Retention of 5+ years is a legal obligation. What is the most cost-effective lifecycle design?

A) Keep in Standard permanently
B) 30 days after creation → Standard-IA, 90 days → Glacier Instant Retrieval, delete after 5 years
C) Glacier Flexible Retrieval immediately on creation
D) 90 days after creation → Glacier Deep Archive, delete after 5 years

**정답: B**
해설: Frequent access for the first 3 months (90 days) → Standard, or Standard-IA (after 30 days). After that, accessed 1-2 times a year with immediate need → Glacier Instant Retrieval (ms retrieval). Transitioning after 90 days satisfies Glacier Instant's minimum storage duration (90 days). Deleting after 5 years prevents unnecessary cost once the legal obligation is met. C incurs excessive retrieval cost (time + money) from Glacier Flexible during the first 3 months of frequent access. D can't retrieve immediately (12-hour wait).

---

**문제 2.** A company's data analytics pipeline processes logs stored in S3. The data team can hardly predict which logs will be analyzed frequently. Logs average 300KB in size; some are analyzed within hours of creation, and some are barely accessed even after months. What is the most suitable storage class?

A) Standard (keep all data always immediately accessible)
B) Standard-IA (automatic transition after 30 days)
C) Intelligent-Tiering
D) Glacier Instant Retrieval

**정답: C**
해설: When access patterns are unpredictable and the object size is 300KB (above 128KB, so Intelligent-Tiering's efficiency applies), Intelligent-Tiering is optimal. Frequently accessed objects stay in Frequent Access, and objects not accessed for 30 days move automatically to Infrequent Access, optimizing automatically with no retrieval cost. Standard wastes cost on unaccessed data. Standard-IA, applied uniformly without predicting the pattern, incurs retrieval cost on frequently accessed objects. Glacier Instant wastes storage cost on frequently accessed data.

---

**문제 3.** A dev team stores a large volume of thumbnail images in S3. The thumbnails can be regenerated from the originals at any time, and are accessed only when a user requests them. User access is about 1-2 times a week. They want to minimize cost. Which class is suitable?

A) S3 Standard
B) S3 Glacier Deep Archive
C) S3 One Zone-IA
D) S3 Intelligent-Tiering

**정답: C**
해설: The conditions are "regenerable data" + "single-AZ failure tolerable" + "immediate retrieval needed (served right away on user request)" + "frequent access (1-2 times a week, considering Standard-IA's 30-day minimum duration)." One Zone-IA cuts cost with a single AZ for regenerable data and allows immediate retrieval. At 1-2 accesses a week you incur Standard-IA's per-GB retrieval cost, but One Zone-IA is still cheaper than Standard. Glacier can't retrieve immediately (Deep Archive is 12 hours). On the exam, when "regenerable + minimize cost + immediate access" appear together, it's One Zone-IA.

---

**문제 4.** A legal team must retain financial transaction records for exactly 7 years and must be able to provide the data within 12 hours during an audit over that period. Monthly storage cost must be minimized. Which solution is suitable?

A) S3 Standard → Lifecycle delete after 7 years
B) S3 Glacier Flexible Retrieval → Lifecycle delete after 7 years
C) S3 Glacier Deep Archive → Lifecycle delete after 7 years
D) S3 Standard-IA → Lifecycle delete after 7 years

**정답: C**
해설: 7-year long-term retention + retrieval within 12 hours (Standard retrieval is 12 hours, Bulk retrieval 48 hours) + minimize cost. Glacier Deep Archive is the cheapest class in S3 and provides data within 12 hours on Standard retrieval. Its 180-day minimum storage duration is no problem for a 7-year retention requirement. B (Glacier Flexible) is more expensive and doesn't fit the "minimize cost" requirement. A and D incur unnecessarily high storage cost over 7 years.

---

**문제 5.** Versioning is enabled on an S3 bucket. Old versions are accumulating and storage cost is rising. You want to set a Lifecycle policy that protects the current version while deleting only previous versions older than 90 days. What do you configure?

A) Expiration: Days=90 (delete all objects after 90 days)
B) NoncurrentVersionExpiration: NoncurrentDays=90
C) AbortIncompleteMultipartUpload: DaysAfterInitiation=90
D) Transition: Days=90, StorageClass=GLACIER (archive previous versions)

**정답: B**
해설: `NoncurrentVersionExpiration` applies an expiration policy to the noncurrent (non-current) previous versions in a versioning-enabled bucket. The current version stays protected. A's `Expiration: Days=90` deletes all objects (including the current version) after 90 days. C is multipart-upload cleanup. D archives previous versions but doesn't delete them, so cost keeps accruing.

---

**문제 6.** A company headquartered in the US finds that some objects in its ap-northeast-2 Seoul bucket are accessed frequently while others haven't been accessed in months. S3 Storage Lens analysis shows 60% of all data hasn't been accessed in 90+ days. What is the most effective cost optimization?

A) Move all objects to Glacier immediately
B) Bulk-convert to the Intelligent-Tiering storage class
C) Manually move objects with no access for 90 days from Standard to Glacier
D) Migrate the bucket to One Zone

**정답: B**
해설: When access patterns are mixed (some frequent, some not accessed in 90 days) and the pattern can change dynamically, Intelligent-Tiering automatically places each object in the optimal tier. The frequently accessed 40% stays in Frequent Access, and the unaccessed 60% moves automatically to Infrequent Access. A causes Glacier retrieval costs to explode on the frequently accessed 40%. C carries a heavy manual-management burden and requires re-moving when patterns change. D's One Zone migration entails data-loss risk.
