# Day 4 - S3 Replication, Storage Gateway, Elastic Disaster Recovery: How to Move Files and Workloads

So far we've covered backups in blocks (EBS) and databases (RDS). This article widens scope to three units—**objects** (S3 data across regions/buckets), **hybrid files** (on-prem NAS/tape to cloud), **entire workloads** (running servers bootable elsewhere). Three have different targets and mechanisms but share one question: **"When original disappears, where can we restart?"** Answered by async replication (S3), cache-backed gateway (Storage Gateway), continuous data protection (DRS).

The key: each tool solves differently-shaped problems. S3 Replication is "place object elsewhere once more." Storage Gateway is "leave on-prem app untouched, only backend to S3." DRS is "boot entire server in other region within minutes." Tool selection isn't memorization but problem shape matching—core testing strategy here.

## S3 Replication—Why Versioning Is Required and What Doesn't Replicate

S3 Replication **asynchronously** replicates objects from one bucket to another. Same region is SRR (Same-Region Replication); cross-region is CRR (Cross-Region Replication). But before setup, one mandatory prerequisite: **both source and destination buckets must have Versioning enabled.** Not optional; mandatory. Why?

S3 replication replicates **object versions**. Without Versioning, overwrites on same key erase previous versions without trace—system can't track "which version was replicated and what's latest." Versioning enabled means each PUT gets unique version ID; replication system manages "this version replicated to target" idempotently. For async replication not to duplicate/tangle on retries, each object version must have unique ID, which Versioning guarantees.

Another trap: **what doesn't replicate.** Objects already in bucket **before** enabling Replication don't auto-replicate—rules apply only to new objects after enabling. To move existing objects, run **S3 Batch Replication** separately or sync manually. Beyond that, already-replicated objects (preventing double-replication), SSE-C encrypted objects (by default), specific lifecycle operations are excluded from standard replication. Delete markers can be optional (Delete Marker Replication) enabled/disabled.

```json
{
  "Role": "arn:aws:iam::123:role/s3-replication-role",
  "Rules": [{
    "ID": "ReplicateImportant",
    "Status": "Enabled",
    "Filter": {"Prefix": "important/"},
    "Destination": {
      "Bucket": "arn:aws:s3:::destination-bucket-us",
      "StorageClass": "STANDARD_IA",
      "ReplicationTime": {"Status": "Enabled", "Time": {"Minutes": 15}},
      "Metrics": {"Status": "Enabled"}
    }
  }]
}
```

**RTC (Replication Time Control)** is paid option imposing **15-minute SLA (99.99% of objects)** on replication. Standard replication is usually fast but unguaranteed timing, so hours of lag possible under load. With tight DR RTO/RPO, RTC locks "reach destination in 15 minutes" as SLA.

| Use Case | Replication Type |
|----------|------------------|
| Region-level DR / regional data residency regulation | CRR |
| Cross-account log/audit copy isolation | SRR (Cross-Account) |
| Same-region different cost-class operational copy | SRR |
| Strict replication time guarantee | + RTC (15-min SLA) |

> 💡 **Related Theory**: "Objects before enabling don't replicate" because S3 Replication is **event-driven async replication**. Rules trigger on PUT events, so past PUTs (before rule existed) never triggered, never replicated. Like message queues/streams where consumers receive only post-subscription messages. Past data needs separate backfill (=Batch Replication). Async replication is inherently **eventually consistent**—destination lags slightly but converges; RTC puts time ceiling on "eventually."

## S3 Storage Class and Lifecycle—Reduce Cost by Data Age

S3 data access frequency drops over time. Yesterday's logs get viewed often; 3-year-old logs kept only for compliance. Keeping all on expensive Standard forever wastes. S3 **Storage Class** divides tiers by "how often accessed + how fast to retrieve" tradeoff; **Lifecycle Policy** auto-migrates objects to cheaper tiers by age.

| Class | Min Keep | Restore Speed | Use |
|-------|----------|---------------|-----|
| Standard | - | Instant | Frequent access |
| Intelligent-Tiering | - | Instant | Unknown access (auto-tiering) |
| Standard-IA | 30 days | Instant | Occasional access |
| One Zone-IA | 30 days | Instant | Recreatable data (single AZ) |
| Glacier Instant | 90 days | Instant (ms) | Quarterly instant recovery |
| Glacier Flexible | 90 days | Minutes~12hrs | Archive, occasional recovery |
| Glacier Deep Archive | 180 days | 12~48hrs | Long-term regulation keep, lowest cost |

```json
{
  "Rules": [{
    "Status": "Enabled",
    "Transitions": [
      {"Days": 30, "StorageClass": "STANDARD_IA"},
      {"Days": 90, "StorageClass": "GLACIER"},
      {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
    ],
    "Expiration": {"Days": 2555}
  }]
}
```

Common traps: **minimum retention** and **restore speed**. Standard-IA is 30 days, Glacier 90, Deep Archive 180 minimum; delete/move before that period and you're billed for minimum anyway—frequent-change data in IA gets pricier. Deep Archive is cheapest but 12~48-hour recovery—tight DR RTO can't pull from there. **Unknown access pattern? Intelligent-Tiering is safe default**, auto-migrating tiers.

> 🔍 **Deeper Dive**: **S3 Object Lock** applies same WORM model as Day 1's Snapshot Lock, Day 2's Vault Lock to objects. Compliance mode: root account can't delete/overwrite during retention. Governance mode: authorized can unlock. Object Lock also requires Versioning enabled—same reason: immutability means "fix specific version," needs version tracking. Used for financial/medical regulation (SEC 17a-4, HIPAA) change-proof keeping and ransomware/insider deletion defense. Three Locks (Snapshot/Vault/Object) share identical trust model across resources: "issuer can't unlock," Week 10's thread-connecting pattern.

## Storage Gateway—On-Prem App Unchanged, Backend to S3

Enterprise on-prem still runs NFS/SMB file-reading apps, iSCSI block-writing systems, tape-backup software. Migrating all to cloud at once is risky and costly. **Storage Gateway** strategy: "don't touch apps." Deploy virtual appliance on-prem (VMware/Hyper-V/EC2); existing apps access gateway via NFS/SMB/iSCSI/tape normally; gateway sends data to S3/Glacier behind scenes. To apps, looks like local storage; really cloud-backed.

Three types split by protocol and purpose:

- **File Gateway**—on-prem NFS/SMB access, gateway stores each file as S3 object. Frequent data stays in local cache for fast response; whole dataset on S3. Fits file backup, media archive, S3-as-filesystem use.
- **Volume Gateway**—provides iSCSI block volumes. **Cached mode**: frequent blocks local, whole on S3 (local storage saving). **Stored mode**: whole local, async S3 backup (low-latency priority + cloud backup).
- **Tape Gateway**—provides virtual tape library (VTL). Veritas/NetBackup legacy backup software thinks physical tape but actually stores via S3→Glacier. Replaces physical tape infra with cloud.

> 💡 **Related Theory**: Storage Gateway's local cache + remote storage is computer systems' **memory hierarchy** principle exactly. CPU cache keeps frequently-used data in fast SRAM, rest in slow memory/disk. File/Volume Gateway (Cached) keeps hot data local, cold on S3. Works because data access has **locality of reference**—recent data reuse probability (temporal locality) is high; small local cache handles most accesses fast. CDN, OS page cache, DB buffer pool, Storage Gateway all stand on locality assumption.

## Elastic Disaster Recovery (DRS)—Boot Entire Server Within Minutes

S3 Replication handles objects; Storage Gateway handles files. **DRS** is different unit—**entire running server** (OS, applications, data, config) bootable elsewhere identically. Install agent on server; it **continuously replicates disk block-level (CDP—Continuous Data Protection)**—real-time per-change AWS stream. So RPO is seconds.

DRS's cost cleverness is in **Staging Area**. Replica data normally sits in tiny AWS staging environment (just cheap t3.small EC2 + EBS)—no expensive full-size instances running, costs minimal. Failover (or drill test) moment comes, **launch real-size instance** with that replicated EBS. Strategy: "cheap data stream offline, big server only when needed."

```
On-Prem/Other Cloud Server (agent installed)
        │ Block-level continuous replication (CDP)
        ▼
AWS Staging Area
   t3.small EC2 + EBS (all data)   ← Usually: small, cheap
        │ Failover trigger
        ▼
Production Subnet
   m5.large EC2 + EBS (replica)    ← Then: real size launch
```

Uses clear: migrate datacenter to AWS, multi-region DR, other cloud→AWS failover. CloudEndure Disaster Recovery unified into DRS (name change, occasional exam appearance).

> ⚠️ **Trap**: Don't confuse DRS with backup/replication tools. S3 Replication, DLM, AWS Backup **replicate/preserve data** but separate work rebuilds servers from that data. DRS **replicates entire workload**, instantly bootable minutes' RTO—OS/apps/data all together, failover brings that server alive elsewhere nearly unchanged. Exam: "datacenter→AWS DR, minimize offline cost, minute-level failover RTO" almost always DRS. "S3 objects only other region" is CRR; "keep on-prem app, S3 backend only" is Storage Gateway.

## DataSync vs Transfer Family vs Snow—Three Ways to Move Data

Data ingestion to AWS splits by problem shape too. **DataSync** is **high-speed transfer/sync engine** for large data—automatically parallelizes/validates/encrypts between NFS/SMB/HDFS/S3/EFS/FSx. Used for one-time migration (on-prem NAS 50TB→S3) or regular sync (daily NAS→S3). **Transfer Family** is different—managed gateway letting external partners access S3/EFS via **SFTP/FTPS/FTP/AS2** standard protocols. Fits legacy file systems, B2B file exchange behind S3. **Snow Family** (Snowball etc.)—too huge for network (petabyte-scale) or insufficient bandwidth—**physical hardware delivered by truck**.

Selection is straightforward—network-viable large transfer uses DataSync; standard protocol file exchange with partners uses Transfer Family; network-impractical huge uses Snow.

> 📚 **Case Study**: Before dedicated DataSync-like tools, bulk migration used `aws s3 sync` or custom scripts—single-threaded transfers, restart-from-beginning on mid-transfer failure, no validation meant "transferred but some corrupted" happened. Transferring 10s TBs over days, network drop meant no way to know progress, restart entire. DataSync solved via parallel transfer + checksum validation + incremental retry—disconnects reconnect seamlessly, post-transfer integrity auto-checked. "Don't roll your own big transfers; use dedicated tools"—lesson codified, and generalizable principle for infrastructure tasks: prefer validated managed services over custom implementations.

## Wrapping Up

Day 4's tools answer "where restart when original vanishes" by unit. S3 Replication keeps objects async-copied elsewhere (Versioning required, post-enable objects only); Storage Gateway leaves on-prem untouched, S3-backed behind cache; DRS keeps servers cheap-streamed until failover flips real-size launch.

Five key takeaways for operators: ① S3 Replication requires Versioning both sides + new objects only (existing need Batch); CRR (region DR)/SRR (same-region/cross-account audit)/RTC (15-min SLA). ② Storage Class + Lifecycle trim cost by age; watch minimum-keep/restore-speed; Intelligent-Tiering if pattern unknown. ③ S3 Object Lock too is WORM (Versioning required)—same model as Snapshot/Vault Lock. ④ Storage Gateway 3 types: File (NFS/SMB), Volume (iSCSI Cached/Stored), Tape (VTL). ⑤ DRS is workload-total CDP failover (Staging small offline), DataSync is bulk transfer, Transfer Family is SFTP, Snow is physical huge.

Next article wraps Week 10 entire—Snapshot·AWS Backup·RDS HA·S3/DRS—as scenario review.

---

## 📝 Practice Questions

**Question 1.** A company wants to automatically replicate S3 data to a DR site in another Region. What are the required prerequisites and the tool for the setup?

A) Run DataSync periodically
B) S3 Cross-Region Replication (CRR): enable Versioning on both the source and destination buckets, plus an IAM role and a replication rule
C) Deploy a Storage Gateway File Gateway
D) Move objects to another Region with a Lifecycle policy

**Answer: B**

Explanation: S3 CRR is the standard for cross-Region object replication, and Versioning must be enabled on both the source and destination buckets. This is because the replication system needs Versioning to manage each object version idempotently by its unique version ID. When you grant replication permission with an IAM role and define a replication rule, new objects created after it is enabled are replicated automatically. DataSync (A) is a transfer/synchronization tool and is possible, but CRR is the standard for S3-native replication.

---

**Question 2.** After enabling S3 Replication, objects that already existed are not replicated to the destination bucket. What is the cause and the fix?

A) Insufficient IAM permissions
B) Replication rules apply only to new objects created after they are enabled, so existing objects must be backfilled separately with S3 Batch Replication
C) Versioning is disabled
D) The destination bucket is in a different account

**Answer: B**

Explanation: S3 Replication is event-driven asynchronous replication, triggered when a PUT event occurs. Past PUTs from before the rule existed never triggered it, so they are not replicated: the rule applies only to objects created after it is enabled. To also move existing objects, you must run S3 Batch Replication separately to backfill them. This is the same principle as receiving only the messages published after you subscribe to a message stream.

---

**Question 3.** An on-premises backup software (Veritas/NetBackup) that backed up to physical tape needs to move to AWS without any application changes. Which tool?

A) Upload directly to S3
B) Storage Gateway Tape Gateway (VTL): the existing backup software sees virtual tapes, while the data is actually stored in S3 and then Glacier
C) DataSync
D) AWS Backup

**Answer: B**

Explanation: Tape Gateway provides a virtual tape library (VTL), so existing backup software uses it as is, believing it is a physical tape device, while the data is actually stored via S3 into Glacier. This is the exact use case of replacing only the physical tape infrastructure with the cloud without changing the backup software or operating procedures. It is a representative example of Storage Gateway's strategy of "keep the app as is, and move only the back end to the cloud."

---

**Question 4.** You want to enable DR failover of a production data center to AWS, keeping normal-time cost to a minimum while recovering within minutes at failover. Which tool?

A) S3 Cross-Region Replication
B) AWS Elastic Disaster Recovery (DRS): block-level continuous data protection (CDP) replicating to a small staging area during normal operation, and launching full-size instances at failover
C) Storage Gateway Volume Gateway
D) Periodic DataSync synchronization

**Answer: B**

Explanation: DRS continuously replicates entire servers (OS, apps, and data) at the block level (CDP) to achieve an RPO of seconds, and during normal operation it accumulates data only in a Staging Area of inexpensive t3.small instances plus EBS to minimize cost. Only at failover does it launch full-size instances from the replicated EBS volumes, recovering with an RTO of minutes. S3 Replication (A) replicates only objects and does not bring servers up, so DRS is the answer for workload failover.

---

**Question 5.** You need to enforce that S3 objects can never be modified or deleted for 5 years (regulatory WORM). Which feature and prerequisite are needed?

A) Deny deletion with an IAM policy
B) S3 Object Lock in Compliance mode with a 5-year retention, and Versioning must be enabled
C) Cross-Region Replication
D) Move to Glacier with a Lifecycle policy

**Answer: B**

Explanation: S3 Object Lock in Compliance mode provides WORM retention in which not even the root account can delete or overwrite an object during the retention period, satisfying regulations such as SEC 17a-4 and HIPAA and defending against ransomware and insider deletion. Object Lock pins a specific version, so enabling Versioning is required. IAM (A) is bypassed if permissions are stolen and cannot guarantee immutability. It is the same WORM model as Snapshot Lock and Vault Lock.

---

**Question 6.** You want to perform a one-time migration of 50 TB of on-premises NAS data to S3. Network bandwidth is sufficient. Which tool automates integrity verification and retries?

A) An aws s3 sync script
B) AWS DataSync: automates large transfers with parallel transfer, checksum verification, and incremental retries
C) Snowball
D) Transfer Family(SFTP)

**Answer: B**

Explanation: DataSync is an engine dedicated to large-scale data transfer and synchronization, providing automatic parallel transfer, post-transfer checksum integrity verification, incremental retry on interruption, and encryption. An `s3 sync` script (A) is single-threaded, lacks verification, and has restart problems on interruption. Snowball (C) is for when bandwidth is insufficient or the data is at petabyte scale, and Transfer Family (D) is for SFTP file exchange with external partners. For a 50 TB transfer with sufficient bandwidth, DataSync is the standard choice.

---

**Question 7.** Frequently changing data was moved to Standard-IA to cut costs, but costs actually increased, and the access pattern is hard to predict. What is a better choice?

A) Move to Glacier Deep Archive
B) S3 Intelligent-Tiering: automatically moves objects between tiers based on access patterns, optimizing cost without minimum storage duration violations
C) One Zone-IA
D) Keep it in Standard and disable Lifecycle

**Answer: B**

Explanation: Standard-IA has a 30-day minimum storage duration, so putting frequently changing data (replaced or deleted before 30 days) there is billed for the minimum period and ends up more expensive. For data with hard-to-predict access patterns, Intelligent-Tiering is suitable: it monitors the access frequency of each object and automatically moves it between the Frequent and Infrequent tiers, optimizing cost without minimum-duration violations. Deep Archive (A) takes 12 to 48 hours to restore, so it is unsuitable for frequently accessed data.

---
