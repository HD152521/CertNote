# Day 4 - S3 Storage Management and Cost Optimization

## 📌 Key Takeaways

- A storage class is a trade of **storage price ↔ retrieval fees, minimum storage duration, and retrieval latency**. Keeping frequently read data in IA or Glacier actually costs more because of retrieval fees.
- The minimum storage durations are 30 days for Standard-IA and One Zone-IA, 90 days for Glacier Instant and Flexible Retrieval, and 180 days for Deep Archive. If you delete or move objects before that, you are billed for the remaining period.
- Use **lifecycle policies** to automate transitions and expiration. Rules that clean up incomplete multipart uploads and expire noncurrent versions are needed on almost every bucket.
- When the access pattern is unknown or changing, use **Intelligent-Tiering** (no retrieval fees, a per-object monitoring fee); when the pattern is clear, lifecycle transitions are cheaper.
- Objects moved to Glacier Flexible Retrieval or Deep Archive **cannot be read until restored.** Athena skips these objects. If you need immediate queries, go down only as far as Glacier Instant Retrieval.

## Where the Cost Comes From

A data lake grows over time, and the access frequency of its data falls over time. S3 charges come in four parts, and storage classes change the ratio among the four.

| Billing item | Unit | How to reduce |
|------|------|------|
| Storage | GB-month (price per class) | Compression and columnar formats, transition to lower classes, expiration |
| Requests | Request count (PUT, GET, LIST, lifecycle transition requests) | Larger files, merge small files |
| Retrieval | GB read out (IA and Glacier classes) | Keep frequently read data in Standard |
| Early deletion | Remaining days of the minimum storage duration | Do not send short-lived data to lower classes |

On top of this, there are two cases with per-object charges: the monitoring and automation fee of Intelligent-Tiering, and the per-object metadata overhead of Glacier Flexible Retrieval and Deep Archive. Both are proportional to the **number of objects**, so they become a problem in lakes with many small files.

## S3 Storage Classes

| Class | Designed for | Availability (design) | AZs | Minimum duration | Minimum billable size | Retrieval |
|------|------|------|------|------|------|------|
| S3 Standard | Frequent access (more than once a month) | 99.99% | 3 or more | None | None | Immediate, no retrieval fee |
| S3 Intelligent-Tiering | Unknown or changing patterns | 99.9% | 3 or more | None | None | Immediate (except the optional archive tiers), no retrieval fee |
| S3 Standard-IA | Infrequent access (about once a month), needed immediately | 99.9% | 3 or more | 30 days | 128KB | Immediate, per-GB retrieval fee |
| S3 One Zone-IA | Regenerable, non-critical data | 99.5% | 1 | 30 days | 128KB | Immediate, per-GB retrieval fee |
| S3 Glacier Instant Retrieval | About once a quarter, needed immediately | 99.9% | 3 or more | 90 days | 128KB | Milliseconds, per-GB retrieval fee |
| S3 Glacier Flexible Retrieval | About once a year, minutes to hours acceptable | 99.99% (after restore) | 3 or more | 90 days | Not applicable (40KB overhead per object) | Restore required |
| S3 Glacier Deep Archive | Less than once a year, long-term regulatory retention | 99.99% (after restore) | 3 or more | 180 days | Not applicable (40KB overhead per object) | Restore required |

- Durability is the same for all classes at 99.999999999% (11 9's). What differs between classes is **availability and the number of AZs**. Only One Zone-IA is stored in a single AZ, so if that AZ is physically lost, the data is lost.
- "Minimum billable size of 128KB" means objects smaller than that are also billed as 128KB. Sending files of a few KB to IA can cost more than Standard.
- For Glacier Flexible Retrieval and Deep Archive, 40KB is added per object. 32KB is billed at the Glacier rate and 8KB at the Standard rate (this is the cost of keeping object names and metadata available for real-time listing).

> 💡 **Related Theory**: The IA (Infrequent Access) classes lower the storage price but charge a per-GB retrieval fee when reading. So the break-even depends on "how often and how much you read." If you move Curated data, which dashboards scan every day, down to IA, the retrieval fees exceed the storage savings. Choose the class by **access frequency**, not by the age of the data.

## Restoring from Archive Tiers

Objects in Glacier Flexible Retrieval and Deep Archive cannot be read in real time. You use `RestoreObject` to request a **temporary copy**, wait, and then read it only for the number of days you specified.

| Restore option | Glacier Flexible Retrieval | Glacier Deep Archive |
|------|------|------|
| Expedited | 1 to 5 minutes | Not offered |
| Standard (default) | 3 to 5 hours | Within 12 hours |
| Bulk | 5 to 12 hours | Within 48 hours |

```bash
# Request a Bulk restore of a Deep Archive object and keep the temporary copy for 7 days
aws s3api restore-object \
  --bucket acme-datalake-raw-prod \
  --key raw/orders/dt=2023-01-15/part-0000.json.gz \
  --restore-request '{"Days": 7, "GlacierJobParameters": {"Tier": "Bulk"}}'
```

- Even after a restore, the object's storage class stays the same. During the restore period you pay the **archive charge + the Standard charge for the temporary copy** together.
- Bulk restore for Flexible Retrieval is free, and Expedited carries a premium fee. Expedited can be rejected when demand is high, so if you definitely need it, buy provisioned capacity.
- When there are tens of millions of objects, the restore requests themselves are a chore. Use S3 Batch Operations to request them all at once.
- To permanently change the class back, you must restore and then **copy** to the desired class. Lifecycle transitions flow only downward.

## Storage Mapping by Data Lake Zone

| Zone | Access pattern | Recommendation |
|------|------|------|
| Raw | Rarely, only during reprocessing, but needed immediately then | Standard → after some period Standard-IA or Glacier Instant Retrieval |
| Clean | Read regularly by ETL | Standard or Intelligent-Tiering |
| Curated | Read often by BI and dashboards | Standard |
| Long-term regulatory retention (raw logs, etc.) | Almost never read, latency acceptable | Glacier Deep Archive |

- For data that may still be queried with Athena or Redshift Spectrum, go down **only as far as Glacier Instant Retrieval**. Objects moved to Flexible Retrieval or Deep Archive are **skipped by Athena without an error**, causing the incident where "old partitions silently drop out of the results."
- To read restored objects with Athena, you must set the table property `read_restored_glacier_objects` to `true` (engine version 3, Hive tables). Athena does not perform the restore itself.
- Do not archive or expire the data files of open table formats (such as Iceberg) with lifecycle rules. If the files the metadata points to cannot be read, the table breaks.

## Lifecycle Policies

Lifecycle rules **transition** or **expire** objects according to their age. There is one configuration per bucket, with up to 1,000 rules.

```json
{
  "Rules": [
    {
      "ID": "raw-tiering",
      "Filter": { "Prefix": "raw/" },
      "Status": "Enabled",
      "Transitions": [
        { "Days": 30,  "StorageClass": "STANDARD_IA" },
        { "Days": 90,  "StorageClass": "GLACIER" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    },
    {
      "ID": "cleanup-incomplete-uploads",
      "Filter": {},
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket acme-datalake-raw-prod \
  --lifecycle-configuration file://lifecycle.json
```

Transitions follow a **waterfall model**. They only go from top to bottom.

```text
Standard → Standard-IA → Intelligent-Tiering → One Zone-IA → Glacier Instant Retrieval
        → Glacier Flexible Retrieval → Glacier Deep Archive
(skipping from an upper stage to a lower stage is possible; going back up is not)
```

The constraints you run into when writing rules are as follows.

| Constraint | Details |
|------|------|
| Filters | Prefix, object tags, object size (`ObjectSizeGreaterThan`/`ObjectSizeLessThan`), and combinations of them |
| Small objects | **Objects smaller than 128KB are not transitioned to any class by default.** This is because the transition request cost exceeds the savings. You can change this with a size filter |
| Minimum storage duration | Within one rule you cannot create a setting that moves to the next class before meeting the minimum storage duration (for example, if you sent it to Glacier Instant Retrieval on day 4, the Deep Archive transition is after day 94) |
| Date calculation | Days are added to the creation time and rounded up to midnight (UTC) of the next day |
| Billing timing | Glacier transitions are asynchronous, but billing at the target class rate starts from the day the rule condition is met |

- The 128KB default behavior changed in September 2024. Before that, even objects smaller than 128KB were transitioned to Glacier Flexible Retrieval and Deep Archive. Older materials may explain the old behavior.
- A transition is one request per object. If you transition hundreds of millions of small files, the **transition request cost** exceeds the savings. Merge first, then move down.

## Lifecycle in Versioned Buckets

In a bucket with versioning enabled, the meaning of "expiration" changes.

| Action | Without versioning | With versioning |
|------|------|------|
| `Expiration` | Permanently deletes the object | Adds a delete marker. Existing versions **remain as noncurrent versions** |
| `NoncurrentVersionExpiration` | No effect | Permanently deletes noncurrent versions |
| `NoncurrentVersionTransition` | No effect | Transitions noncurrent versions to another class |
| `ExpiredObjectDeleteMarker` | Not applicable | Removes delete markers with no versions left |

- If you set only `Expiration` on a versioned bucket, **the charges do not go down.** The data stays as noncurrent versions. Set `NoncurrentVersionExpiration` together with it.
- With `NewerNoncurrentVersions` you can specify "keep the most recent N noncurrent versions" (1 to 100).
- Expiration rules **do not delete incomplete multipart uploads.** A separate `AbortIncompleteMultipartUpload` rule is needed. This action and `ExpiredObjectDeleteMarker` cannot be used in rules that have a tag filter.

> ⚠️ **Pitfall**: If you enable versioning on an ETL output bucket that is overwritten often, the entire previous output piles up as noncurrent versions every time a job runs. The console shows only the latest objects, so it becomes "the data is 100GB but the bill is for several TB." Versioning + a noncurrent version expiration rule come as a set.

## S3 Intelligent-Tiering

For data whose access pattern is hard to predict, S3 watches per-object access and moves tiers. Even when the tier changes, the storage class stays Intelligent-Tiering.

| Access tier | Move condition | Access |
|------|------|------|
| Frequent Access (automatic) | Default. Right after upload or transition | Immediate |
| Infrequent Access (automatic) | 30 consecutive days without access | Immediate |
| Archive Instant Access (automatic) | 90 consecutive days without access | Immediate |
| Archive Access (optional) | 90 or more days without access (configurable up to 730 days) | Restore required, same performance as Flexible Retrieval |
| Deep Archive Access (optional) | 180 or more days without access (configurable up to 730 days) | Restore required, same performance as Deep Archive |

- All three automatic tiers are read immediately. If you read an object that was in a lower tier, it returns to Frequent Access.
- **There are no retrieval fees and no minimum storage duration.** Instead, you pay a monthly per-object monitoring and automation fee.
- **Objects smaller than 128KB are not monitored** and always stay in the Frequent Access tier. It has no effect on prefixes with only small files.
- The optional archive tiers are used only if you turn them on, and when on, objects in that tier **must be restored to be read.** Do not turn them on for data queried with Athena.
- `GetObject` counts as an access, but `HeadObject`, listing, and tag lookups do not count as access.

```bash
# Enable the optional archive tiers for Intelligent-Tiering objects in a bucket
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket acme-datalake-clean-prod \
  --id archive-config \
  --intelligent-tiering-configuration '{
    "Id": "archive-config",
    "Status": "Enabled",
    "Tierings": [
      {"Days": 90, "AccessTier": "ARCHIVE_ACCESS"},
      {"Days": 180, "AccessTier": "DEEP_ARCHIVE_ACCESS"}
    ]
  }'
```

| Decision criterion | Lifecycle transition | Intelligent-Tiering |
|------|------|------|
| Access pattern | Clearly declines with age | Unknown, irregular, or changing |
| When read again | IA and Glacier incur retrieval fees | No retrieval fee, automatically returns to a higher tier |
| Fixed cost | Transition request cost (one time) | Per-object monitoring fee (monthly) |
| Early deletion fee | Yes | No |
| Small objects | Under 128KB excluded from transitions by default | Under 128KB have no tier movement |

Intelligent-Tiering is "insurance that removes the penalty for a wrong prediction." If the pattern is certain (it is almost never viewed after 30 days), moving down directly with a lifecycle rule is cheaper, without the monitoring fee that is the premium. If the pattern is uncertain, the risk of moving to IA and then being read again and paying retrieval fees is greater, so Intelligent-Tiering is better.

## Cost Visibility Tools

| Tool | Question it answers | Output |
|------|------|------|
| S3 Storage Lens | Where has how much accumulated at the organization, account, bucket, and prefix level, and how much is in incomplete multipart uploads and noncurrent versions | Dashboard, metrics export |
| S3 Inventory | Which objects are in the bucket, with what class, size, and encryption state | Daily or weekly listing files (CSV, ORC, Parquet) → analyze with Athena |
| Storage class analysis | When is it good to move this data down to Standard-IA | Access pattern analysis results |

- Inventory is a way to get the object list without calling `ListObjects` hundreds of millions of times. If you extract the "average object size per prefix" with Athena, the location of the small files problem is revealed.
- Storage class analysis helps with the decision between Standard and Standard-IA. It keeps you from setting lifecycle days by gut feeling.

The fundamental order of savings is **① reduce the stored volume itself (Parquet + compression) → ② reduce the number of objects (compaction) → ③ delete what is not needed (expiration, noncurrent versions, incomplete uploads) → ④ send what remains to the right class.** If you start from ④, you run into the transition request cost and minimum billable size of small files.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Charges rose after moving to IA | Frequent reads incur retrieval fees, or objects under 128KB are billed as 128KB | Move back to Standard, check the access pattern |
| Request charges spiked after lifecycle transitions | Mass transition of small objects | Transition after compaction, size filter |
| Expiration rule set but capacity unchanged | Noncurrent versions in a versioned bucket | Add `NoncurrentVersionExpiration` |
| Charges are larger than the sum of the object list | Incomplete multipart uploads, noncurrent versions | `AbortIncompleteMultipartUpload`, check with Storage Lens |
| Older dates are missing from Athena results | Those objects were transitioned to Glacier Flexible Retrieval or Deep Archive | Restore then `read_restored_glacier_objects`; afterwards go down only to Instant Retrieval |
| Extra charge for data deleted within a month | Minimum storage duration not met | Keep short-lived data in Standard |
| Intelligent-Tiering but no savings | Objects are under 128KB | Merge, then apply |

## Exam Clue → Answer Lookup

| Clue in the question | Answer |
|------|------|
| "The access pattern cannot be predicted / automatically without operational burden" | Intelligent-Tiering |
| "Almost never accessed after 30 days (clear pattern)" | Lifecycle transition |
| "Read rarely, but within milliseconds when read" | Standard-IA or Glacier Instant Retrieval (the latter if about once a quarter) |
| "Cheapest for regenerable data, immediate access" | One Zone-IA |
| "7 to 10 years regulatory retention, half a day to restore is fine" | Glacier Deep Archive |
| "Must retrieve from archive within minutes" | Glacier Flexible Retrieval + Expedited |
| "Hidden cost of failed large uploads" | `AbortIncompleteMultipartUpload` |
| "Storage cost of a versioned bucket keeps growing" | `NoncurrentVersionExpiration` |
| "Identify which buckets and prefixes spend the cost across the whole organization" | S3 Storage Lens |
| "Analyze the per-object class and size list with SQL" | S3 Inventory + Athena |

Tomorrow we tie this week's four topics together in a single lake operations scenario for review.

## 📖 Glossary

- **Storage class**: An S3 storage tier whose storage price varies by access frequency and retrieval latency.
- **Retrieval fee**: A per-GB charge when reading out data in the IA and Glacier classes.
- **Minimum storage duration**: The period before which deleting or transitioning is billed for the remaining period. It is 30, 90, or 180 days depending on the class.
- **Lifecycle policy**: A bucket-level set of rules that transition or delete objects according to their age.
- **Transition and expiration**: Moving to another storage class, and deleting.
- **Noncurrent version**: An object version in a versioned bucket that is no longer the latest because it was overwritten or deleted. Charges continue.
- **Delete marker**: A marker added when a delete request is made in a versioned bucket. It only makes the object look absent and does not erase the data.
- **Incomplete multipart upload**: Parts left behind by a multipart upload that was never completed. They do not appear in listings but incur storage charges.
- **Restore**: The operation of creating a temporary copy of an archived object so it can be read for a set period.
- **S3 Inventory**: A feature that periodically exports a list of a bucket's objects and metadata as files.

## 📝 Practice Questions

**Question 1.** Which S3 storage class is the most suitable when access patterns are hard to predict and you want objects to be moved between tiers automatically, per object, without retrieval fees?

A) S3 Standard  
B) S3 Glacier Deep Archive  
C) S3 Intelligent-Tiering  
D) S3 One Zone-IA  

**Answer: C**  
Explanation: Intelligent-Tiering monitors access per object and moves it between tiers automatically, with no retrieval fees, so it is optimal when access patterns are irregular or unpredictable. The others suit clear access patterns or fixed purposes.

---

**Question 2.** After placing frequently read Curated zone data in Standard-IA to save cost, the cost actually increased. What is the most likely cause?

A) IA has low durability  
B) IA charges a per-GB retrieval fee  
C) IA does not support encryption  
D) IA blocks partition pruning  

**Answer: B**  
Explanation: The IA classes have a lower storage price but charge a per-GB retrieval fee when data is read. If frequently read data is placed in IA, retrieval costs accumulate and can exceed Standard. It is unrelated to durability, encryption, or pruning.

---

**Question 3.** Which S3 lifecycle rule is recommended for almost every bucket and removes hidden costs?

A) Clean up incomplete multipart uploads (AbortIncompleteMultipartUpload)  
B) Immediately transition all objects to Standard  
C) Disable bucket versioning  
D) Immediately expire objects after 1 day  

**Answer: A**  
Explanation: Parts of failed multipart uploads incur storage costs invisibly, so cleaning them up with an AbortIncompleteMultipartUpload rule is recommended for almost every bucket. The others are not general recommendations or carry a risk of data loss.

---

**Question 4.** When the access pattern is clearly predictable as "almost never accessed after 30 days," which is the correct reason it can be cheaper than Intelligent-Tiering?

A) Because lifecycle transitions have no monitoring/automation fee  
B) Because Intelligent-Tiering has low durability  
C) Because retrieval is always free with lifecycle  
D) Because Intelligent-Tiering adds an encryption cost  

**Answer: A**  
Explanation: Intelligent-Tiering charges a per-object monitoring and automation fee. If the access pattern is clear, sending objects directly to IA/Glacier with a lifecycle transition rule can be cheaper because there is no monitoring fee. The others are not factual.

---

**Question 5.** Which S3 feature visualizes storage usage and savings opportunities (unused IA, incomplete uploads, and so on) at the account, bucket, and prefix level to find cost optimization targets?

A) S3 Transfer Acceleration  
B) S3 Storage Lens  
C) S3 Object Lock  
D) S3 Replication  

**Answer: B**  
Explanation: S3 Storage Lens is a visibility dashboard that provides organization-, bucket-, and prefix-level usage and savings recommendations. Transfer Acceleration is for transfer speed, Object Lock is for preventing changes, and Replication is for copying data, so none relates to cost visibility.

---
