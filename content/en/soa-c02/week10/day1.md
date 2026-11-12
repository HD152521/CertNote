# Day 1 - EBS Snapshot: How Incremental Backup Remembers Only Changed Blocks

The naive definition of backup is "copy all data again in one go." But if you copy a 1TB volume every hour, you accumulate 24TB a day, 720TB a month. That's not backup—it's a cost bomb. EBS Snapshot is clever because it abandons this naive definition and adopts an **incremental** model: "record only the blocks that changed since the last backup." The first snapshot is full-sized, but every subsequent one only stores changes. Even a 1TB volume, if only 10GB changes daily, the second snapshot uses only 10GB.

Every characteristic of EBS Snapshot derives from this single design decision. Why can you delete one snapshot and others remain intact? Why does deleting an AMI not delete the snapshot? Why is the first IO on a new volume slow? Why does the cost work counterintuitively?—all explained by following the principle "remember only changed blocks."

## Snapshots Are Not Files but Sets of Block Pointers—Inside Incremental Backup

The statement "EBS Snapshot is stored in S3" is true but misleading. A file like `snapshot.img` isn't placed in a user-visible S3 bucket. EBS manages volumes as fixed-size **blocks** (typically 512KiB units) and a snapshot exists as a **set of pointers to those blocks + metadata (manifest)**. Block data is stored in S3-based storage operated internally by AWS, and each snapshot holds only a "map" stating "at this point in time, my volume's state is this combination of blocks."

When you create the first snapshot, all occupied blocks in the volume are copied to backup storage, and the snapshot manifest points to all those blocks. An hour later when you create the second snapshot, EBS copies only the **newly changed blocks** (those with dirty bits set). For unchanged blocks, **the second manifest simply points to the blocks already stored by the first snapshot.** The same block isn't stored twice. This is the essence of incremental backup and also means snapshots **share** blocks.

```
Volume blocks:   [A][B][C][D][E]   (5 blocks)

Snapshot 1 (full):
   Stored:  A1 B1 C1 D1 E1  (all 5 blocks stored)
   Manifest → A1 B1 C1 D1 E1

(Blocks C and E change)

Snapshot 2 (incremental):
   Stored:  C2 E2  (only 2 changed blocks stored)
   Manifest → A1 B1 C2 D1 E2
                ↑  ↑     ↑
                Reuse blocks from Snapshot1
```

Here emerges the most common misunderstanding: "If I delete Snapshot 1, doesn't Snapshot 2 break?" No, it doesn't. When you delete a snapshot, EBS **deletes only blocks no other snapshot references.** Deleting Snapshot 1 keeps A1, B1, D1 alive because Snapshot 2 still references them; only C1 and E1, which Snapshot 1 alone owned, are removed. To the user, each snapshot appears as an independent full backup, but internally it's a pointer graph sharing blocks.

> 💡 **Related Theory**: This block-sharing structure is identical to the **persistent data structure** concept from functional programming. When adding an element to a list, instead of copying everything, only the changed part is rebuilt while the rest reuse existing nodes (structural sharing). Git commits work the same way—each commit appears to be a complete tree snapshot, but unchanged files and directories (blob and tree objects) directly reference the previous commit's objects by SHA hash. EBS Snapshot, Git, ZFS snapshots, and copy-on-write filesystems all represent variations of one principle: "write only changes, share the rest."

> 🔍 **Deeper Dive**: The mechanism EBS uses to track changed blocks is **CBT (Changed Block Tracking)**. When a write occurs on the volume, that block is marked as dirty; the next snapshot sees this mark and knows what to copy. AWS exposes this tracking information via **EBS Direct API** `ListChangedBlocks`—give it two snapshots and it returns the list of changed blocks and offsets between them. This is why backup software (Veeam, Cohesity) can efficiently integrate EBS—they read only "blocks changed since last backup" directly without scanning the entire volume. You can even fetch individual block data with `GetSnapshotBlock`.

## AMI Is a Bundle of Snapshots + a Boot Recipe—Why Deleting an AMI Leaves Snapshots Behind

If you only memorize "AMI (Amazon Machine Image) is an EC2 boot image," you'll cause operational disasters. An AMI's reality is **references to EBS snapshots + boot metadata (recipe)**. If an instance has a root volume and two data volumes, `create-image` creates snapshots of each of those three volumes, and the AMI just holds the recipe: "when booting, restore these snapshots to these device mappings (`/dev/xvda`, `/dev/xvdb`...)." The AMI itself holds no data—all data lives in snapshots, and the AMI is just the assembly instructions.

This structure creates the most notorious cost trap in operations. When you `deregister` an AMI, **only the recipe disappears; the snapshots the recipe pointed to remain.** You think "I deleted the AMI, so costs will drop," but the actual data (snapshots) keeps being billed per GB. In accounts that repeatedly create and delete hundreds of "golden AMIs" by version, it's common to end up with "terabytes of unused snapshots" from deregister-only cleanups. Deregistering an AMI and deleting snapshots are separate operations; to automate this together requires DLM options or a separate cleanup script.

> ⚠️ **Trap**: `aws ec2 create-image` with `--no-reboot` creates the image without stopping the instance. It looks good—no operational downtime—but this is a **crash-consistent** snapshot that may lose data sitting in memory and disk buffers. For workloads like databases where filesystem cache must match disk state, you must either create without `--no-reboot` (with reboot) or flush/freeze the filesystem at the OS level first. For simple web server golden images, `--no-reboot` is reasonable. In exams, when "backup without operational downtime but consistent" appears, the answer isn't just `--no-reboot` but application-consistent handling (below).

## Crash-consistent vs Application-consistent—fsfreeze Solves the Problem

The phrase "snapshot is a point-in-time backup" hides a trap. Taking a snapshot of a 1TB volume isn't instantly freezing every block simultaneously; it's a process of copying blocks one by one to backup storage. During this process, the application keeps writing to disk. Moreover, the OS buffers writes in memory (page cache) for performance and flushes them to disk later (write-back). At the moment a snapshot is taken, unwritten data may still float in memory.

A snapshot taken in this state is a **crash-consistent** snapshot—like the state of disk after suddenly pulling the server's power cord. Most journaling filesystems (ext4, NTFS) and databases are designed to recover from such abrupt power loss, so usually they survive, but there's no guarantee. If a multi-block transaction was halfway to disk when snapped, post-recovery data could corrupt.

An **application-consistent** snapshot eliminates this risk. Just before snapping, the application and OS are told: "pause writes, flush all memory buffers to disk." On Linux, `fsfreeze -f` freezes the filesystem to block new writes and flush cache; on Windows, **VSS (Volume Shadow Copy Service)** notifies VSS-aware applications (DB, Exchange, etc.) to "create a consistent state now." The snapshot is taken during this brief consistent window and immediately unlocked with `fsfreeze -u`. AWS automates this via SSM Document (`AWSEC2-CreateVssSnapshot`; Linux uses pre/post scripts)—Run Command issues freeze commands inside the instance, and while frozen, calls the EBS snapshot API.

| Mode | What Gets Frozen | Risk | Standard Tool |
|------|------------------|------|-----------|
| Crash-consistent (default) | Nothing | Lost memory buffers, unfinished transactions | `create-snapshot` as-is |
| Filesystem-consistent | Filesystem cache flush | App-level transactions not guaranteed | Linux `fsfreeze` |
| Application-consistent | App + FS both stopped | Almost none | Windows VSS / SSM pre-post script |

> 💡 **Related Theory**: The root of this problem is OS **write-back caching**. Disk I/O is tens of thousands of times slower than memory, so the OS doesn't immediately reflect writes to disk; instead, it buffers them in page cache and flushes them in bulk (`pdflush`/`writeback` kernel threads). Performance improves, but "the real latest state in memory" and "the state crystallized on disk" perpetually diverge. The `fsync()` syscall forces a specific file's buffer to disk, closing this gap; `fsfreeze` does the same for the entire filesystem while also blocking new writes. Databases call `fsync` on their WAL (Write-Ahead Log) during transaction commit for this reason—to guarantee "it really touched disk" so transactions survive power loss.

## DLM—Automate Backup Lifecycle with Just a Tag

If you manually create and delete snapshots, two disasters are inevitable: first, someone forgets and backups are missed; second, no one deletes old snapshots and costs accumulate infinitely. **DLM (Data Lifecycle Manager)** automates both via "policy + tags." An operator adds a tag like `Backup=daily` to a resource and declares in a DLM policy: "snapshot volumes with this tag every day at 3 AM, keep 7 copies." From then on, creation, retention, deletion, and Cross-Region replication all run automatically.

DLM policy types split by target. **EBS Snapshot Policy** uses `ResourceTypes: VOLUME` for per-volume snapshots; **EBS-backed AMI Policy** uses `ResourceTypes: INSTANCE` to create full-instance AMIs (root + data volume snapshot bundles). **Event-Based Policy** is special—it triggers on events like "another account shares a snapshot with me" and auto-copies to my account, useful for centralizing snapshots to a backup account.

Retention rules (RetainRule) come in two modes: **Count (number)** and **Age (duration)**. `Count: 7` keeps only the 7 latest; the 8th triggers deleting the oldest. `Interval: 7 DAYS` deletes snapshots older than 7 days. The difference matters operationally—irregular creation intervals make Count unpredictable in duration and Age unpredictable in count.

```bash
# Daily AMI, 7-day retention, Cross-Region replicate to us-east-1, 3 AM daily
aws dlm create-lifecycle-policy \
  --description "Daily AMI 7-day retention" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"IMAGE_MANAGEMENT",
    "ResourceTypes":["INSTANCE"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"Daily AMI",
      "CreateRule":{"CronExpression":"cron(0 3 ? * * *)"},
      "RetainRule":{"Count":7},
      "TagsToAdd":[{"Key":"BackupType","Value":"DailyAMI"}],
      "CrossRegionCopyRules":[{
        "TargetRegion":"us-east-1",
        "Encrypted":true,
        "CmkArn":"arn:aws:kms:us-east-1:123:key/abc",
        "RetainRule":{"IntervalUnit":"DAYS","Interval":7}
      }]
    }]
  }'
```

DLM is frequently confused with **AWS Backup** (Day 2). The boundary is clear—DLM is a **lightweight EBS/AMI-only** snapshot scheduler, while AWS Backup is a **multi-service unified backup + compliance** platform covering RDS, DynamoDB, EFS, FSx, and S3. For EBS-only backups, DLM is lightweight with minimal cost. When bundling multiple services under one policy and extracting audit reports via Audit Manager, AWS Backup is the answer.

| Item | DLM | AWS Backup |
|------|-----|------------|
| Scope | EBS volumes, AMI only | EBS/RDS/DDB/EFS/FSx/S3 and more |
| Policy Unit | Lifecycle Policy | Backup Plan (bundle of Rules) |
| Compliance | None | Backup Audit Manager |
| Cross-Account | Limited via Event-Based | Full support via Vault Policy |
| Cost | Policy free (snapshot storage only) | Management fee + storage |

> 📚 **Case Study**: The 2014 collapse of Code Spaces, a code hosting company, is a textbook case of backup isolation. An attacker stole AWS console credentials and deleted EC2 instances, S3, **and EBS snapshots and backups all at once**. Because operational data and backups lived under the same account and permissions, one breach erased everything with no recovery possible—the company shut down. The industry standard born from this incident: "keep backups in a different account/different permission boundary." DLM's Cross-Region and Cross-Account replication, plus Day 2's Snapshot Lock and Vault Lock, all implement this lesson. If backups can be deleted with the same key as operations, they aren't backups.

## Snapshot Lock—The Last Defense Making Backups Themselves Undeletable

Even with DLM automation, one hole remains: **privileged operators (or attackers with their credentials) can delete snapshots.** Evolved ransomware attacks delete backups first before encrypting data—they must eliminate recovery options to extort payment. Code Spaces fell exactly this way. **Snapshot Lock** closes this final gap. A locked snapshot **cannot be deleted by anyone, under any permissions,** for the period you specify.

The lock has two modes; this distinction is critical in exams and operations. **Governance mode** allows subjects with specific IAM permissions (`ec2:UnlockSnapshot`) to unlock—a guardrail against mistakes. **Compliance mode** is absolute—once activated (after a cooling-off period), **not even the root account or AWS can unlock it.** This satisfies WORM (Write Once Read Many) requirements mandated by regulations like SEC 17a-4 and HIPAA—truly immutable backups. Compliance mode's scariness and power are two sides of the same coin—attackers can never delete, but even an operator who mistakenly sets too long a period can't undo it.

> 🔍 **Deeper Dive**: WORM isn't new; it emerged from 1990s financial regulatory responses. Securities firms had to store trading records on immutable media (SEC Rule 17a-4), and at the time they used WORM optical discs—once burned, physically impossible to overwrite, ensuring no tampering. In the cloud era, Compliance mode Lock recreates this physical immutability in software—Snapshot Lock, S3 Object Lock (Day 4), and Backup Vault Lock (Day 2) all apply the same WORM model to their respective resources. The constraint "once locked, even the issuer can't unlock it" seems inconvenient, but that's exactly what trust requires—trust is established when you prove "not even an admin can touch this."

## Why Is the First IO on a New Volume Slow?—Lazy Loading and FSR

Create an EBS volume from a snapshot with `create-volume`—it finishes almost instantly and the volume shows "available." But when you mount it and read for the first time, IO is frustratingly slow. This isn't a bug; it's a design called **lazy loading**. Snapshot blocks live in backup storage (S3-based); creating the volume doesn't immediately copy those blocks to EBS. Only the metadata is created first; actual blocks are **fetched from backup storage on first access** in the background (hydrated). Reading an un-hydrated block first time triggers a network roundtrip, so it's slow.

Most workloads tolerate this lazy loading—as time passes, blocks hydrate and performance normalizes. But in DR failover scenarios where "the restored volume must deliver full performance immediately," this initial delay can be fatal. **FSR (Fast Snapshot Restore)** eliminates this. FSR-enabled snapshots are pre-hydrated completely by AWS in a specific AZ, so volumes created from them deliver max performance from the first IO. The cost: FSR is billed hourly per snapshot×AZ combination, so it's standard practice to enable it only for core DR snapshots requiring immediate restore.

> ⚠️ **Trap**: FSR doesn't "quickly create a snapshot"; it "quickly restore a volume from a snapshot." And FSR is per-AZ—enable FSR in `ap-northeast-2a` and only volumes created there are fast; creating in `2c` triggers lazy load again. Enabling FSR on all AZs in a DR region doubles costs. In exams, "need max IOPS immediately after snapshot restore" means FSR is correct, but if "cost optimization" context appears too, the answer is "selectively on required AZs only."

## Wrapping Up

Nearly all characteristics of EBS Snapshot derive from the incremental, block-sharing model: "remember only changes, share the rest." Deleting one snapshot leaves others intact because only unreferenced blocks are deleted. Deleting an AMI leaves snapshots because AMIs are recipes pointing to snapshots, not data holders. First IO on new volume is slow because blocks lazy-load.

Five key takeaways for operators: ① Snapshots are incremental + block-sharing—cost proportional to changes, deletion removes only unreferenced blocks. ② AMI deregister ≠ snapshot deletion—a classic cost trap. ③ `--no-reboot` is crash-consistent; databases need fsfreeze/VSS for application-consistent backups. ④ DLM is lightweight EBS/AMI-only; multi-service needs AWS Backup. ⑤ Snapshot Lock Compliance is WORM no one can unlock; FSR is only for DR snapshots needing immediate restore.

In the next article, we'll move beyond EBS alone, bundling RDS, DynamoDB, EFS, and S3 under one policy and isolating backups from attackers using **AWS Backup**'s Vault Lock structure.

---

## 📝 Practice Questions

**Question 1.** A company took hourly snapshots of a 1 TB EBS volume for a month, but the bill is far lower than expected. Which is the most accurate reason?

A) AWS automatically applies a discount to snapshots
B) EBS snapshots are incremental: only the first snapshot is full size and later ones store only changed blocks, so the cumulative cost is small when the change rate is low
C) The Free Tier waives snapshot charges
D) Snapshots are stored compressed

**Answer: B**

Explanation: The core of EBS snapshots is block-level incremental backup. The first snapshot backs up all occupied blocks of the volume, but each later snapshot stores only the blocks whose dirty bit was set (changed) since the previous one, and unchanged blocks simply reference the blocks stored by an earlier snapshot (structural sharing). Therefore cost is proportional to the hourly change volume, not the volume size. Even for 1 TB, snapshots after the second cost almost nothing if little changes.

---

**Question 2.** An operator deregistered unused AMIs, but storage costs did not go down. What is the cause and the fix?

A) AMI deletion is asynchronous and is cleaned up automatically after a few days
B) Deregistering an AMI removes only the boot recipe and leaves the associated EBS snapshots, so the snapshots must be deleted separately or cleaned up with a DLM policy
C) Re-registering the AMI and then deleting it also deletes the snapshots
D) Terminating the EC2 instance cleans them up automatically

**Answer: B**

Explanation: An AMI holds no data itself; it is only a reference to EBS snapshots plus device-mapping metadata (the boot recipe). Deregistering removes only this recipe, so the snapshots, which hold the actual data, remain and continue to be billed per GB. In environments that create and discard golden AMIs per version, repeating only deregister is a classic cost trap that accumulates terabytes of unused snapshots. You must delete the snapshots explicitly or use DLM's cleanup option.

---

**Question 3.** An AMI was created with `--no-reboot` from an instance running a database, and the restored DB intermittently comes up in a corrupted state. What is the root cause?

A) Creating an AMI itself corrupts the DB
B) `--no-reboot` produces a crash-consistent snapshot, so the OS write-back cache and in-flight transactions may be backed up without having been flushed to disk; an application-consistent backup using fsfreeze/VSS is needed
C) A DB cannot be backed up with an AMI
D) Some blocks were missing because snapshots are incremental

**Answer: B**

Explanation: `--no-reboot` takes the snapshot without stopping the instance, so there is no downtime, but writes sitting in the OS page cache (write-back) and in-flight multi-block transactions may not yet have reached disk at that moment (crash-consistent). For workloads where consistency matters, such as a database, you must flush the cache and quiesce writes with `fsfreeze` (Linux) or VSS (Windows) just before the snapshot and back up in an application-consistent state. AWS automates this with an SSM Document.

---

**Question 4.** You must prevent a ransomware scenario in which an attacker steals operator credentials and even deletes backup snapshots. Regulations require that backups cannot be deleted even by the party that created them. Which action is correct?

A) Remove the delete permission with an IAM policy
B) Snapshot Lock in Compliance mode: WORM that, after the cooling-off period, cannot be unlocked by the root account or by AWS
C) Create snapshots more frequently
D) Snapshot Lock in Governance mode

**Answer: B**

Explanation: Snapshot Lock in Compliance mode is truly immutable (WORM) backup: once the cooling-off period has passed, no one, including the root account and AWS, can remove the lock or delete the snapshot. It satisfies regulatory requirements such as SEC 17a-4 and HIPAA. Governance mode (D) can be unlocked by specific IAM principals, so it is closer to a guardrail against mistakes, and it is powerless if an attacker with stolen credentials also holds that permission. IAM (A) is also bypassed if the permissions are stolen.

---

**Question 5.** During a DR failover, a new volume was created from a large snapshot and the first I/O is very slow, delaying recovery. How can you fix this while considering cost?

A) Recreate the snapshot
B) Enable Fast Snapshot Restore (FSR) for that DR snapshot only in the failover target AZ so it is hydrated in advance
C) Change the volume type from gp2 to gp3
D) Increase the instance type

**Answer: B**

Explanation: A volume created from a snapshot uses lazy loading by default, pulling blocks from backup storage the first time they are accessed, so initial I/O is slow. FSR fully hydrates the snapshot in a specific AZ in advance so that volumes created there deliver full performance from the first I/O. However, FSR is billed hourly per snapshot-AZ combination, so enabling it selectively only in the actual failover target AZ rather than all AZs is the cost-optimized answer.

---

**Question 6.** In a simple environment where only EBS needs backing up, you want to automate daily snapshot creation with 7-day retention. Which is the lightest and most cost-effective tool?

A) AWS Backup + Backup Plan + Audit Manager
B) DLM (Data Lifecycle Manager): a lightweight scheduler dedicated to EBS/AMI, with no charge for the policy itself
C) A custom script using Lambda + EventBridge
D) Manual snapshots with calendar reminders

**Answer: B**

Explanation: DLM is a lightweight lifecycle scheduler dedicated to EBS volumes and AMIs. It automates creation, retention, deletion, and cross-Region copy based on tags, and the policy itself is free (you pay only for snapshot storage). AWS Backup (A) is a heavier platform used when you need multi-service integration (RDS, DynamoDB, EFS, and so on) and compliance, so it is overkill when only EBS is involved. DLM is the standard choice for simple EBS backup automation.

---

**Question 7.** After one snapshot (Snapshot 1) was deleted, an incremental snapshot taken later (Snapshot 2) still restores fine. Why is this possible?

A) Snapshot 2 makes a full copy of Snapshot 1 just before deletion
B) Snapshots share blocks, and on deletion only blocks that no other snapshot references are actually removed, so the blocks referenced by Snapshot 2 are preserved
C) The deleted snapshot is automatically recovered from the Recycle Bin
D) An incremental snapshot is originally an independent full backup

**Answer: B**

Explanation: Incremental snapshots share unchanged blocks via pointers (structural sharing). When a snapshot is deleted, EBS keeps the blocks that other snapshots still reference and actually removes only the blocks referenced solely by the snapshot being deleted. Therefore, even if Snapshot 1 is deleted, the blocks that Snapshot 2 points to survive, and each snapshot restores like an independent full backup. To the user it looks like an independent backup, but internally it is a pointer graph that shares blocks.

---
