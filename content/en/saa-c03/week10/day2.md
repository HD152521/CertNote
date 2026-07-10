# Day 2 - Why Storage Cost Is a Function Not of "Unit Price" but of "Access Pattern"

Someone trying to optimize storage cost for the first time almost always makes the same mistake — they spread out the S3 storage-class price sheet and pick Glacier Deep Archive, which has the cheapest per-GB unit price. Then a month later they look at the bill and cost has actually gone up. They put frequently retrieved data into Deep Archive, and the retrieval costs and minimum-storage-duration penalties overwhelmed the storage savings. The essence of storage cost is that **it's not a single storage unit price but a function in which several costs — storage, request, retrieval, transfer — sum differently depending on the access pattern**. If you don't know "how often and how fast you need to pull this data out," no class is optimal.

S3 started in 2006 with a single storage class, but AWS realized early that a data lifecycle is not uniform. A freshly uploaded log is analyzed hot for a week, is queried occasionally a month later, and a year later is merely retained for regulatory reasons and almost never pulled. In line with this "temperature curve," progressively cheaper and slower tiers were added — Standard → Standard-IA → Glacier → Deep Archive — and in 2018 **Intelligent-Tiering** arrived for data whose access pattern is unknown or fickle. Instead of listing storage classes, this article follows the reasoning — "why the minimum-storage-duration trap exists," "how Intelligent-Tiering monitors access," "how Bucket Keys reduce KMS call cost" — to cover the storage axis of the SAA cost domain.

## Why the Minimum Storage Duration Trap Exists

Almost all of S3's low-cost classes carry a **minimum storage duration** — 30 days for Standard-IA and One Zone-IA, 90 days for Glacier Instant/Flexible, and 180 days for Deep Archive. If you delete an object or move it to another class earlier than this period, you're charged, like a penalty, for the storage of the remaining days. For example, if you delete an object placed in Standard-IA after just 10 days, you still pay for the remaining 20 days of storage.

This looks like a "malicious trap," but it's actually **an inevitability created by the economic structure of low-cost classes**. The IA/Glacier family has cheap storage unit prices because AWS moves and repacks the data onto slower, denser (and therefore operationally cost-amortized) media. There's a fixed cost to placing and managing data in that tier, so AWS can only lower the unit price if it gets a promise that "you'll keep this here for at least this long." In other words, the minimum storage duration follows the same logic as Savings Plans giving "a discount in exchange for a commitment" — promise to keep the data a long time and the unit price gets cut.

> ⚠️ **Pitfall**: The intuition "let's move data that changes often or might be deleted within 30 days to Standard-IA to save cost" is almost always wrong. Because of the 30-day minimum plus IA's high retrieval cost, data that is frequently accessed and deleted within 30 days actually becomes more expensive than Standard. IA fits only data that is "definitely accessed infrequently, might occasionally be pulled, and will be kept for at least a month." When access frequency is uncertain, the answer is not IA but Intelligent-Tiering.

> 🔍 **Going deeper**: The retrieval model also differs between S3 classes. **Glacier Instant Retrieval** pulls data instantly in milliseconds like Standard-IA but at a cheaper storage unit price (fits medical images/backups pulled maybe once a quarter). **Glacier Flexible Retrieval** is minutes-to-hours retrieval (Expedited 1-5 min, Standard 3-5 hr, Bulk 5-12 hr), and **Deep Archive** takes 12-48 hours. That is, "how cheaply you store" and "how fast you retrieve" move in exactly opposite directions as a trade-off, and choosing a class is effectively an answer to "how many hours can I wait when I pull this data out."

## How Intelligent-Tiering Tracks Access Patterns

Data whose access pattern is unknown or changes over time — this is the hardest case. Put it in a class too hot and storage cost is wasted; put it in one too cold and you're bitten by retrieval costs and minimum-storage penalties. **Intelligent-Tiering** makes S3, not a human, perform this decision automatically per object.

Here's how it works. For an object placed in Intelligent-Tiering, S3 **tracks the last-access time per object**. If there's no access for 30 consecutive days it automatically demotes to the Infrequent Access tier, and after 90 consecutive days without access to the Archive Instant Access tier. Then if that object is accessed again, it's automatically promoted immediately to the Frequent Access tier. The key is that there are **no retrieval costs and no minimum-storage penalties** — automatic movement between tiers carries no transition cost; instead there's a small per-object monitoring/automation fee. So it's closer to insurance: you offload the uncertainty of "not knowing the access pattern" onto S3 and buy that for a small fee.

> 💡 **Related theory**: This is the same idea as an operating system's page cache and LRU (Least Recently Used) algorithm. Just as an OS "evicts recently unused memory pages to disk and pulls them back when used again," Intelligent-Tiering automatically moves objects between hot and cold tiers on an LRU basis. It's the memory hierarchy — where CPU cache tiers (L1/L2/L3/RAM/disk) are automatically placed by access frequency — transplanted directly onto storage. Frequently used goes to the fast, expensive place; unused goes to the slow, cheap place — the universal principle of computing.

> ⚠️ **Pitfall**: Intelligent-Tiering isn't all-powerful. Because there's a per-object monitoring fee, for **millions of very small objects** (e.g., thumbnails under 128KB) the monitoring cost overwhelms the storage cost — a loss. AWS, aware of this, excludes small objects from automatic tier movement, but there are still cases where "if you know the pattern, an explicit Lifecycle rule is cheaper." If the access pattern is **clearly predictable**, it's better to set a Lifecycle rule yourself than to pay Intelligent-Tiering's fee.

## Lifecycle Rules: Explicit Lifecycle Automation

When the access pattern is predictable, you set rules directly with a **Lifecycle policy**. You automate time-based transitions and expiration, like "30 days after upload → Standard-IA, 90 days → Glacier, 365 days → Deep Archive, delete after 7 years." It fits best for data with an "obvious temperature curve," like logs and backups.

A hidden cost often missed in Lifecycle is **incomplete multipart uploads**. When a multipart upload — splitting a large object into pieces to upload — fails partway, the already-uploaded pieces remain in the bucket and keep eating storage charges. Users can't see these pieces in the console (they're not completed objects), so it becomes a phantom cost that is "invisible yet billed." You must always add "automatically clean up incomplete multiparts older than N days" to your Lifecycle rules — this is a hygiene rule recommended for nearly every production bucket.

> 🔍 **Going deeper**: Lifecycle is even more powerful when combined with versioning. In a versioned bucket, even when you "delete" an object, a delete marker is placed and the previous version is retained and keeps being billed. You must set a Lifecycle rule like "move noncurrent versions to Glacier after 30 days, delete after 90 days" to stop old versions from piling up infinitely. Also, the Lifecycle transition itself carries a small per-request cost, so transitioning millions of objects at once incurs transition-request costs — remember that "transitions are not always free."

## How Bucket Keys Reduce KMS Call Cost

Encrypting S3 objects with SSE-KMS strengthens security but creates a hidden cost: **KMS API call cost**. Every time you write an object (PUT), it requests a data-key generation from KMS, and every time you read (GET), it requests a decryption from KMS. In a high-volume environment handling thousands of objects per second, the number of KMS calls explodes, and since KMS bills per call this cost becomes non-trivial.

**S3 Bucket Keys** solves this with caching. Previously KMS was called per object, but with Bucket Keys enabled, S3 creates a **bucket-level intermediate key** from the key it received from KMS, caches it briefly, and during that short window encrypts/decrypts many objects in the same bucket with no additional KMS calls. As a result, the number of KMS API calls drops by up to 99% and cost plummets. It's a pure cost optimization that keeps the security level (a unique data key per object) while reducing only the number of KMS round-trips.

> 💡 **Related theory**: This is a caching optimization of envelope encryption. Envelope encryption is a two-tier structure — "encrypt the data key with a master key, and encrypt the actual data with the data key" — and requesting a data key from the master key (KMS) each time makes calls frequent. Bucket Keys inserts one more stage, a bucket-level key, in the middle to reduce KMS round-trips — the universal pattern of "amortizing an expensive handshake through reuse," like TLS session reuse or database connection pooling.

## Network, Block, and File Storage Cost Roundup

Storage beyond S3 also has cost-optimization points.

For **EBS**, standardizing from gp2 to **gp3** is almost always a win. gp2's IOPS is determined in proportion to capacity, so to get more performance you had to increase capacity you wouldn't even use, but gp3 sets capacity and IOPS/throughput independently — the same performance more cheaply, or higher baseline performance at the same price (3000 IOPS provided by default). On top of this, clean up unattached EBS volumes and old snapshots (Trusted Advisor identifies them), and move long-term-retention snapshots to **EBS Snapshot Archive** to save up to 75%.

**EFS** reduces cost with **Lifecycle Management**, automatically demoting files unaccessed for a set period to Infrequent Access (IA) or Archive classes — the file-storage version of the same idea as S3's Intelligent-Tiering. For **FSx for Lustre**, the key is the **Scratch vs Persistent** choice: Scratch is cheap with no replication or durability guarantee and fits temporary compute (HPC intermediate results), while Persistent is expensive but retains data long-term.

> 📚 **Case study**: Data transfer cost is often the largest "invisible" item on a storage bill. It's common for a company to serve S3 static assets directly to global users and then have data-transfer-out (DTO) cost explode. The fix is to put **CloudFront** in front — CloudFront reduces S3 origin requests via cache hits, transfer on the S3→CloudFront segment is free, and the CloudFront→internet unit price is often cheaper than direct S3 transfer. The key point is that "storage cost optimization" includes not just class selection but transfer-path design. And if you use S3 from inside a VPC, bypassing NAT Gateway processing cost with an **S3 Gateway Endpoint** (free) is in the same vein.

## Visibility: Storage Lens and Inventory

To reduce cost, you first have to see "what is eating cost." **S3 Storage Lens** visualizes storage usage across your organization, accounts, and buckets on a dashboard — the free default dashboard shows usage and growth trends, while the paid advanced metrics produce class distribution, access patterns, and cost-optimization recommendations (e.g., "N TB of incomplete multiparts have piled up in this bucket"). **S3 Inventory** periodically generates a list of all objects in a bucket and their metadata (size, class, encryption, modified date) as CSV/Parquet, letting you analyze with Athena which objects are large, old, or in the wrong class.

> 🔍 **Going deeper**: **Requester Pays** is a feature that flips cost responsibility. Normally the bucket owner pays data-transfer and request costs, but with Requester Pays enabled, the requester downloading the data bears that cost. It's used when an organization distributing a public dataset (e.g., genomics, satellite imagery) wants to say "the data is free to make public, but you pay the download traffic cost." It's the point where cost-model design goes beyond simple savings and becomes a governance decision of "who bears the cost."

## Comparison with Other Clouds

| Dimension | AWS S3 | Azure Blob | GCP Cloud Storage |
|------|--------|------------|-------------------|
| Automatic tiering | Intelligent-Tiering | (mainly lifecycle rules) | **Autoclass** (automatic tiering) |
| Hot/Cool/Cold | Standard / IA / Glacier / Deep Archive | Hot / Cool / Cold / Archive | Standard / Nearline / Coldline / Archive |
| Minimum storage | 30/90/180 days | Cool 30 days, Archive 180 days | Nearline 30 / Coldline 90 / Archive 365 days |
| Instant-retrieval archive | Glacier Instant Retrieval | (Archive needs rehydrate) | Archive (millisecond access possible) |

All three clouds converge on the same structure of "temperature tiers + automatic tiering + minimum storage duration." This is no coincidence: the physical reality of the **data temperature curve** forces the same design regardless of cloud provider. The fact that a tier like AWS's Glacier Instant Retrieval — "store cheaply yet retrieve instantly" — appeared in every cloud is because the medical/media demand of "it's an archive but I need it out fast" is common to all.

## Hands-on with the CLI

```bash
# Lifecycle rules: 30d→IA, 90d→Glacier, clean up incomplete multiparts at 7d
aws s3api put-bucket-lifecycle-configuration --bucket my-saa-bucket-2026 \
  --lifecycle-configuration '{
    "Rules":[{
      "ID":"tiering-and-cleanup","Status":"Enabled","Filter":{"Prefix":""},
      "Transitions":[
        {"Days":30,"StorageClass":"STANDARD_IA"},
        {"Days":90,"StorageClass":"GLACIER"}],
      "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}
    }]
  }'

# Enable Bucket Keys (reduce SSE-KMS call cost)
aws s3api put-bucket-encryption --bucket my-saa-bucket-2026 \
  --server-side-encryption-configuration '{
    "Rules":[{
      "ApplyServerSideEncryptionByDefault":{
        "SSEAlgorithm":"aws:kms","KMSMasterKeyID":"alias/s3-key"},
      "BucketKeyEnabled":true}]
  }'

# Configure Intelligent-Tiering (enable Archive Access tiers)
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket my-saa-bucket-2026 --id archive-config \
  --intelligent-tiering-configuration '{
    "Id":"archive-config","Status":"Enabled",
    "Tierings":[{"Days":90,"AccessTier":"ARCHIVE_ACCESS"},
                {"Days":180,"AccessTier":"DEEP_ARCHIVE_ACCESS"}]}'

# S3 Inventory: object list to Parquet daily
aws s3api put-bucket-inventory-configuration \
  --bucket my-saa-bucket-2026 --id daily-inv \
  --inventory-configuration file://inventory.json

# Find unattached EBS volumes (cleanup candidates)
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[].{ID:VolumeId,Size:Size,Created:CreateTime}'
```

## Wrapping Up

The core of storage cost optimization is the realization that "it's a function of access pattern, not unit price." ① The **minimum storage duration** of S3's low-cost classes (IA 30 / Glacier 90 / Deep Archive 180 days) is a structure that cuts the unit price in exchange for a commitment, and moving data that will be frequently accessed and deleted within 30 days to IA actually makes it more expensive. ② When you don't know the access pattern or it changes, use **Intelligent-Tiering** to offload the uncertainty onto S3 and buy LRU automatic tiering for a small fee — but for very small objects the fee backfires. ③ When the pattern is clear, use **Lifecycle rules** to automate transitions/expiration directly, and always include cleanup of incomplete multiparts and old versions. ④ **Bucket Keys** insert bucket-level key caching into envelope encryption, cutting KMS calls by up to 99%. ⑤ Standardize EBS on gp3, use low-cost modes for EFS/FSx like IA and Scratch, reduce transfer with CloudFront and Gateway Endpoints, and gain visibility with Storage Lens and Inventory.

In the next article we look at the cost of the data itself leaving storage — why internet, inter-region, and inter-AZ data transfer accounts for a hidden 30% of the bill, and how to reduce it with Gateway Endpoints, CloudFront, and topology design.

---

## 📝 연습 문제

**문제 1.** A company stores the output of a new data pipeline in S3, but it cannot predict at all how often this data will be accessed, and the pattern may change over time. To automatically optimize cost with no operational burden, what should it use?

A) S3 Standard
B) S3 Standard-IA
C) S3 Intelligent-Tiering
D) S3 Glacier Deep Archive

**정답: C**

해설: When the access pattern is uncertain or changes over time, Intelligent-Tiering is the answer. S3 tracks each object's last-access time and automatically promotes/demotes tiers, and with no retrieval cost or minimum-storage penalty it removes the risk of "wrong class choice." Standard (A) wastes storage cost on cold data, Standard-IA (B) gets bitten by retrieval costs and the 30-day minimum if accessed frequently, and Deep Archive (D) has a fatal 12-48 hour retrieval delay if you ever need it out fast.

---

**문제 2.** To cut cost, a team moved temporary analytics data — frequently modified and deleted within 30 days — from S3 Standard to Standard-IA, but cost actually went up. Why?

A) IA has a higher storage unit price than Standard
B) IA's 30-day minimum-storage penalty and high retrieval cost exceeded the storage savings
C) IA has lower availability, incurring extra cost
D) Moving to IA automatically incurs KMS cost

**정답: B**

해설: Standard-IA has a 30-day minimum storage duration, so deleting/transitioning before then charges you the remaining days' storage as a penalty, and access also incurs a per-GB retrieval cost. For data frequently accessed and deleted within 30 days, these two costs overwhelm the storage-unit-price savings, making it more expensive than Standard. A is wrong — IA's storage unit price is cheaper than Standard. C and D are not the actual causes of the cost increase. IA fits only data that is "definitely accessed infrequently and kept for over a month."

---

**문제 3.** A high-volume application writes and reads thousands of objects per second to an SSE-KMS-encrypted S3 bucket. KMS API call cost has spiked. What is the most suitable way to reduce cost while keeping the security level?

A) Change encryption to SSE-S3
B) Enable S3 Bucket Keys
C) Disable encryption
D) Merge objects into larger units

**정답: B**

해설: S3 Bucket Keys creates a bucket-level intermediate key, caches it briefly, and during that window encrypts/decrypts many objects with no additional KMS calls, reducing KMS API calls by up to 99%. The security level of a unique data key per object is preserved. SSE-S3 (A) loses KMS's key management/audit capabilities and may fail the security requirement, C abandons security and is inappropriate, and D doesn't fundamentally change the KMS call structure.

---

**문제 4.** While reviewing an S3 bucket's cost, an operator found that significant storage charges are being billed even though nothing appears in the console. What is the most likely cause and fix?

A) Versioning is off — turn it on
B) Incomplete multipart upload pieces have piled up — auto-clean with Lifecycle
C) The region is wrong — change the region
D) Storage Lens is on — turn it off

**정답: B**

해설: When a large object's multipart upload fails partway, the already-uploaded pieces are not completed objects, so they keep eating storage charges invisibly in the console. Adding "automatically clean up incomplete multiparts older than N days (AbortIncompleteMultipartUpload)" to a Lifecycle rule is the standard hygiene rule. A actually increases cost as versions accumulate, C is irrelevant, and D — Storage Lens is a cost-visibility tool, not a cost cause.

---

**문제 5.** A company wants to convert EBS volumes from gp2 to gp3. Which is the most accurate expected effect?

A) Cost stays the same but durability improves
B) Capacity and IOPS/throughput can be set independently, so you get the same performance more cheaply (or higher baseline performance at the same price)
C) gp3 is always more expensive than gp2 but has lower latency
D) gp3 is magnetic storage, so cost drops sharply

**정답: B**

해설: gp2 determines IOPS in proportion to capacity, so to get more performance you had to increase unnecessary capacity, but gp3 sets capacity, IOPS, and throughput independently and provides 3000 IOPS by default. So you get the same performance more cheaply, or higher baseline performance at the same price — almost always a win. A and C describe the cost relationship incorrectly, and D is wrong because gp3 is SSD-based, not magnetic.

---

**문제 6.** A healthcare organization pulls image data only about once a quarter, but when it does, it needs immediate millisecond-level access. Which class is most suitable when long-term storage cost must be low yet instant retrieval is required?

A) S3 Standard
B) S3 Glacier Instant Retrieval
C) S3 Glacier Flexible Retrieval
D) S3 Glacier Deep Archive

**정답: B**

해설: Glacier Instant Retrieval provides a cheaper storage unit price than Standard-IA while allowing instant millisecond access, fitting exactly the "rarely pulled but fast when pulled" case of medical images/backups. Standard (A) offers instant access but wastes storage cost for quarterly access, and Flexible Retrieval (C) takes minutes-to-hours and Deep Archive (D) 12-48 hours, failing the "instant access" requirement.

---

**문제 7.** An organization wants to see S3 usage across multiple accounts and buckets at a glance, and even get recommendations on which buckets have many incomplete multiparts or wrong-class objects. What is the most suitable tool?

A) S3 Inventory alone
B) S3 Storage Lens (advanced metrics)
C) CloudWatch Alarm
D) Trusted Advisor alone

**정답: B**

해설: S3 Storage Lens visualizes storage across the organization, accounts, and buckets on a dashboard, and its advanced metrics even provide class distribution, access patterns, and cost-optimization recommendations (accumulated incomplete multiparts, etc.). S3 Inventory (A) gives an object list but is not an organization-level recommendation dashboard (you must analyze with Athena yourself). CloudWatch Alarm (C) is a metric-threshold alert, and Trusted Advisor (D) is not an S3-specific deep-analysis tool.

---

## 📌 Key Takeaways

Storage cost is a function in which storage, request, retrieval, and transfer sum by access pattern — not a single unit price. The minimum storage duration of S3's low-cost classes (IA 30 / Glacier 90 / Deep Archive 180 days) is a commitment-style discount structure, so moving data that will be frequently accessed and deleted within 30 days to IA backfires. When the pattern is uncertain, buy LRU automatic tiering with Intelligent-Tiering; when it's clear, automate directly with Lifecycle while including cleanup of incomplete multiparts and old versions. Bucket Keys cut KMS calls by up to 99%, standardize EBS on gp3, reduce transfer with CloudFront and Gateway Endpoints, and gain visibility with Storage Lens and Inventory. The exam tests your ability to map "how often and how fast you pull this data out" onto a class.
