# Day 4 - S3 Storage Management and Cost Optimization

Data lakes grow over time, and data access frequency changes. Today we cover S3 storage classes, lifecycle policies, and cost optimization using Intelligent-Tiering.

## S3 Storage Classes

S3 offers multiple storage classes based on access patterns and costs.

| Class | Purpose | Characteristics |
|-------|---------|-----------------|
| S3 Standard | Frequently accessed hot data | Highest storage cost, no retrieval fee |
| S3 Standard-IA | Infrequent access (< once/month) | Low storage, retrieval cost, minimum 30 days |
| S3 One Zone-IA | Reproducible non-critical data | Single AZ, cheaper than IA, lower availability |
| S3 Glacier Instant Retrieval | Quarterly access, instant retrieval needed | Cheaper than IA, millisecond retrieval |
| S3 Glacier Flexible Retrieval | Archive, minutes-to-hours retrieval acceptable | Very cheap, retrieval delay |
| S3 Glacier Deep Archive | Long-term regulatory retention | Lowest cost, ~12-hour retrieval |
| S3 Intelligent-Tiering | Unpredictable/irregular access patterns | Auto tier movement, monitoring fee |

> 💡 **Related Theory**: IA (Infrequent Access) classes have low storage unit price but incur per-GB retrieval fees when data is read. Storing frequently-read data in IA can cost more than Standard, so choose based on access frequency.

## Data Lake Zone-to-Storage Mapping

- **Raw Zone**: Rarely accessed for reprocessing → Standard-IA or Glacier IR.
- **Clean Zone**: ETL reads periodically → Standard or Intelligent-Tiering.
- **Curated Zone**: BI/dashboards read frequently → Standard.
- **Long-term regulatory retention (original logs, etc.)**: Glacier Deep Archive.

## Lifecycle Policies

Lifecycle rules **transition** objects to different classes or **expire** them based on time since creation. Essential for data lakes where data value diminishes over time.

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
      "Expiration": { "Days": 2555 }
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

Important considerations:
- Transitions incur **transition request costs**. With very many small objects, transition costs can exceed savings.
- IA/Glacier have **minimum retention periods** (IA 30 days, Glacier 90 days, Deep Archive 180 days); early deletion incurs penalties.
- **Abort incomplete multipart uploads** rule is recommended for nearly all buckets (eliminates hidden costs).

> 💡 **Related Theory**: Expired object versions (in versioned buckets) require separate `NoncurrentVersionExpiration` rules for cleanup. Otherwise, old versions accumulate indefinitely, increasing costs.

## S3 Intelligent-Tiering

**Intelligent-Tiering** is ideal for data with unpredictable access patterns. S3 monitors per-object access and automatically moves between tiers.

- Frequent Access → Infrequent Access (after 30 days without access) → Archive Instant Access (after 90 days without access).
- Optionally enable Deep Archive async tier.
- No retrieval fees (except Archive Instant tier), only small per-object **monitoring and automation fees**.

```bash
# Configure Intelligent-Tiering archive tiers at bucket level
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

> 💡 **Related Theory**: Intelligent-Tiering is optimal for irregular or unpredictable access patterns. If patterns are clearly predictable (e.g., never accessed after 30 days), lifecycle transitions may be cheaper since they have no monitoring fees.

## Cost Visibility and Additional Savings Techniques

- **S3 Storage Lens**: Account, bucket, and prefix-level usage and savings opportunities dashboard (unused IA, incomplete uploads, etc.).
- **S3 Inventory**: Periodically output object metadata lists (size, storage class, encryption) as Parquet/CSV → identify optimization targets through analysis.
- **Compression and columnar format**: Parquet + ZSTD/Snappy reduces storage volume itself (most effective savings).
- **Compaction (merging small files)**: Reduces request counts, transition costs, and metadata overhead.
- **Request cost management**: GET/PUT requests themselves have costs; reduce request volume via large files and caching.

## Key Takeaways

- Choose storage class based on access frequency; consider IA/Glacier retrieval costs and minimum retention periods.
- Automate transitions and expirations via lifecycle policies; clean up incomplete multiparts and noncurrent versions.
- For irregular patterns, Intelligent-Tiering; for predictable patterns, lifecycle transitions may be cheaper.
- Use Storage Lens/Inventory for visibility; compression and compaction are foundational savings.

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
