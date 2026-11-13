# Day 3 - EC2's Disk Layer: EBS, Instance Store, and EFS and FSx on Top of Them

The first time you create an EC2 instance, the "Add storage" screen is bewildering. gp3? io2? Block Express? You can grow it to 16TB, so why is io2 expensive and sc1 cheap, and why does instance store warn "if this instance dies, the data dies too"? The answers start from the fact that EBS is **distributed block storage layered over the network**. Within the same word "disk," the IOPS, throughput, latency, durability, and replication models all differ, and those trade-offs are the heart of the exam.

Today we follow the path from EBS's internal architecture (why it's tied to an AZ, why only io2 Block Express reaches 256K IOPS) down to the physical NVMe of instance store. On top of that, we look at where EFS and FSx fit, and exactly how EBS snapshots are stored in S3. Scenarios a developer meets on the exam, like "why isn't our EBS hitting its IOPS?" and "why did all the data vanish when I stopped the instance?", can ultimately be solved only by someone who has followed this layer all the way down.

## EBS Is a Network Disk — The Reason for AZ Dependence

If you understand EBS simply as "a disk attached to EC2," you've seen only half of it. In reality, EBS stores data in a **separate distributed storage fleet inside the AZ**, and the EC2 instance accesses that fleet across the network using an iSCSI-like protocol. That's why an EBS volume is **AZ-dependent**, and moving it to another AZ requires 3 steps: ① create a snapshot (stored in S3) → ② create a volume from the snapshot in the new AZ → ③ attach.

```
[EC2 in AZ-a]
       |
       | iSCSI-like protocol over Nitro EBS Card
       |
[EBS Volume in AZ-a fleet]
       |
       | 3-way replicated within AZ
       |
[Storage Server 1] [Storage Server 2] [Storage Server 3]
   (3-way replication within the same AZ)
```

EBS automatically does **3-way replication** within an AZ. So you don't lose data to a single storage server failure, but if the whole AZ dies, every EBS volume in that AZ dies with it. This is why RDS Multi-AZ doesn't just put EBS in another AZ as-is, but rather **places the Primary and Standby on EBS volumes in different AZs and additionally does synchronous replication**.

On Nitro instances, EBS is accessed through a dedicated PCIe card called the **Nitro EBS Card**. Because the card processes network packets directly with almost no pass through the host OS's CPU, the same instance type gets about 2 times the EBS throughput compared to non-Nitro. Also, the EBS-Optimized option is enabled by default at no charge, so EC2's regular network bandwidth and EBS bandwidth are separated (it used to be an option with an extra charge).

io2 Block Express's design durability is 99.999% (five nines, annual failure rate of 0.001% or less). Don't confuse it with S3's 11 nines (99.999999999%). AWS doesn't publish the details of the internal replication method. gp3, gp2, and io1 have 99.8-99.9% durability (annual failure rate of 0.2% or less, up to 2 failed volumes per year out of 1,000). That's why io2 is recommended over gp3 for critical workloads. In practice, though, application-level backups (snapshots, RDS automated backups, Aurora continuous backup) are always recommended whatever the EBS type.

## A Deep Analysis of EBS Volume Types

Before memorizing the volume types, distinguish the purpose of each type first.

| Type | Media | Baseline IOPS / Max IOPS | Throughput | Price (per GB-month, ap-northeast-2) | Representative workload |
|------|-------|----------|--------|----------|----------|
| **gp3** | SSD | 3,000 / 80,000 (up to 500:1) | 125-2,000 MiB/s | $0.0912 | Boot volumes, general DB, web servers |
| **gp2** | SSD | 100-16,000 (GB×3) | 250 MB/s | $0.114 | Pre-gp3 generation (migration recommended) |
| **io1** | SSD | 100-64,000 (up to 50:1) | 1,000 MiB/s | $0.1425 + IOPS | High-performance DB (previous generation) |
| **io2 Block Express** | SSD | 100-256,000 (up to 1,000:1) | 4,000 MiB/s | $0.1425 + IOPS | Mission-critical DB, SAP HANA, large OLTP |
| **st1** | HDD | 40-500 (baseline) | 250-500 MB/s | $0.051 | Big data ETL, logs |
| **sc1** | HDD | 12-250 (baseline) | 80-250 MB/s | $0.0174 | Cold archive |

**Why gp3 replaces gp2**: gp2's IOPS are tied to volume size (3 IOPS per GB, max 16,000), so if a 100GB volume needed 5,000 IOPS you had to grow it to 1,667GB. With gp3 you can set IOPS and throughput **independently of size** (at additional cost). Even setting 5,000 IOPS and 250 MB/s on the same 100GB volume is about 20% cheaper than gp2.

**The difference between io1 and io2**: As of April 30, 2025, every io2 volume, whether newly created or existing, is io2 Block Express. ① Durability rises from io1's 99.8-99.9% to io2's 99.999% (five nines). ② The provisionable IOPS per GiB is up to 50 for io1 and up to 1,000 for io2. That is, a 100GiB io1 can be set to at most 5,000 IOPS, and a 100GiB io2 to at most 100,000 IOPS. So using io1 for a new workload is easily used as a wrong answer choice.

**io2 Block Express**: Officially launched in 2021. It runs on a next-generation EBS storage server architecture and communicates with the Nitro card over the SRD (Scalable Reliable Datagram) network protocol. It scales up to 256,000 IOPS, 4,000 MiB/s throughput, an average latency under 500 microseconds at 16KiB I/O, and 64TiB. It's used as the persistent storage layer for in-memory DBs like SAP HANA. The 256,000 IOPS is achieved on Nitro-based instances, and other instances reach up to 32,000 IOPS.

> ⚠️ **Trap**: If you see "the most suitable EBS type for a database" on the exam, the answer is io2 or io2 Block Express. gp3 is also sufficient for a "general DB," but if keywords like "latency-sensitive" or "mission-critical" are attached, the answer is io2. Also, an answer choice like "HDD as the boot volume" is wrong. st1 and sc1 can't be booted from.

gp3's baseline 3,000 IOPS is the same whether it's 1GB or 1TB. Additional IOPS on top of that cost $0.005 per IOPS per month, and throughput costs $0.04 per MB/s per month (above 125 MB/s). So if an 80GB boot volume needs 5,000 IOPS, an additional 2,000 IOPS × $0.005 = $10 per month is added. It's a relatively cheap option, so standardizing even production boot volumes on gp3 is becoming the norm.

## EBS Multi-Attach: The Same Volume from Multiple Instances

By default an EBS volume attaches to only one EC2 instance. But the exception possible only with the **io1/io2 + Nitro instance + same AZ** combination is EBS Multi-Attach. Up to 16 instances can attach to the same volume at once.

But **here's the trap**: turning on Multi-Attach alone isn't the end of it. Regular file systems (ext4, xfs) aren't cluster-aware, so if multiple nodes write concurrently the file system gets corrupted. You need a cluster file system such as **GFS2, OCFS2, or VxFS**, and on top of it a distributed lock manager must coordinate concurrent access. In other words, Multi-Attach only makes sense when the application/middleware already understands clustering (as with Oracle RAC or SAP ASCS/ERS).

```python
# Create an io2 volume that supports Multi-Attach
volume = ec2.create_volume(
    AvailabilityZone='ap-northeast-2a',
    Size=100,
    VolumeType='io2',
    Iops=5000,
    MultiAttachEnabled=True
)
```

The answer to an exam scenario of "multiple EC2s sharing the same disk" is **EFS** (NFS-based file sharing), not EBS Multi-Attach. Multi-Attach is just a special case for cluster-aware workloads.

## Instance Store: Physical NVMe

Instance store (ephemeral storage, instance-store) is storage directly attached to the physical disks of the EC2 host. Unlike EBS, it doesn't go through the network, so latency is at the microsecond level and IOPS reach the millions. The downside is that **if the host dies, the data dies too**.

```
[EC2 instance on host server]
       |
       | PCIe direct attached
       |
[NVMe SSD physically on host]
   (physically embedded in the host server)
```

Storage-optimized instance families such as i3, i4i, im4gn, and is4gen provide NVMe instance store in large capacities (up to several TB). The d2 and d3 families have dense HDD instance store for data warehouses. Note that instance store is **allocated at a fixed size at launch**, can't be resized, and has no concept of attach or detach (it's one body with the instance itself).

| Action | EBS | Instance Store |
|------|-----|----------------|
| Instance reboot | Data retained | Data retained |
| Instance stop | Data retained | **Data lost** |
| Instance terminate | Deleted by default (DeleteOnTermination), can be preserved by option | **Data lost** |
| Host failure | Data retained (3-way replication) | **Data lost** |
| AZ failure | Data at risk (recoverable if you have snapshots) | **Data lost** |
| Attach to another instance | Possible | Not possible |
| Resize | Possible (live) | Not possible |

An instance stop is an operation in which the instance may move to a different host (a new host is assigned on start). So instance store, being host-dependent, loses its data on stop. Conversely, a reboot restarts only the OS on the same host, so data is retained. Hibernate dumps RAM contents to the EBS root volume and stops, so instance store is likewise lost. That's why hibernate requires the EBS root volume to be encrypted and is supported only by some instance types (mainly the m, c, and r families).

## EBS Snapshot: Incremental Backup on S3

An EBS snapshot is a point-in-time backup of a volume. It's said to be stored in S3, but in reality it's stored in an **AWS-managed S3 bucket** that users can't access directly.

The core mechanism is **block-level incremental backup**. The first snapshot stores all used blocks in S3. From the second snapshot on, it stores **only the blocks changed since the first snapshot**, and unchanged blocks reference the first snapshot. So even the 10th snapshot of a 100GB volume takes only the extra space of what changed in between.

```
Snapshot 1 (Day 1):  [Block A][Block B][Block C][Block D]  → S3 full
Snapshot 2 (Day 2):  [        ][Block B'][        ][        ]  → S3 with reference
                     (only B' is actually stored, the rest point to Snapshot 1)
Snapshot 3 (Day 3):  [        ][        ][Block C'][        ]  → S3 with reference
                     (only C' is stored)
```

Because of this structure, ① the cost per snapshot is proportional to the amount changed (cheap), ② when an intermediate snapshot is deleted, blocks that other snapshots were referencing are kept (automatic dependency management), and ③ restoring a volume from a snapshot follows all the block references to reconstruct it.

| Operation | Behavior | Cost |
|------|------|------|
| Create snapshot | block-level incremental | Changed blocks × $0.0552 per month (per GB-month, S3 Standard basis) |
| Snapshot Archive | Moves to Glacier (90-day minimum) | Changed amount × $0.0144 (75% cheaper) |
| Copy snapshot (same Region) | Copies references only | $0 |
| Copy snapshot (different Region) | Full data transfer | Data transfer cost per GB |
| Restore snapshot (create volume) | lazy load (fetch on block access) | Available immediately, latency high at first |
| Fast Snapshot Restore (FSR) | Preloads all blocks in advance | Additional cost ($0.75/hour/snapshot/AZ) |

**The lazy load trap**: When you create a volume from a snapshot it becomes "Available" immediately, but the blocks inside are fetched from S3 the first time they're accessed. So latency spikes sharply on the new volume's first fsck or boot. To fill in all the blocks in advance, either ① do a full scan with a command like `dd if=/dev/xvdf of=/dev/null bs=1M`, or ② turn on Fast Snapshot Restore (paid).

```python
# Snapshot creation and cross-region copy + encryption
snap = ec2.create_snapshot(
    VolumeId='vol-0abc1234',
    Description='Daily backup before deploy',
    TagSpecifications=[{
        'ResourceType': 'snapshot',
        'Tags': [{'Key': 'Backup', 'Value': '2026-05-26'}]
    }]
)

# Copy to another Region + KMS re-encryption + Archive tier (75% savings)
target_ec2 = boto3.client('ec2', region_name='us-east-1')
copy = target_ec2.copy_snapshot(
    SourceRegion='ap-northeast-2',
    SourceSnapshotId=snap['SnapshotId'],
    Encrypted=True,
    KmsKeyId='arn:aws:kms:us-east-1:123:key/abc'
)

# If keeping for 90 days or more, move to the Archive tier
ec2.modify_snapshot_tier(
    SnapshotId=snap['SnapshotId'],
    StorageTier='archive'
)
```

> ⚠️ **Trap**: If a scenario on the exam says "a new volume created from a snapshot is slower than production," the answer is Fast Snapshot Restore, because of lazy load. Also, "automatically encrypting when copying a snapshot to another Region" is possible (`Encrypted=True`), but the same KMS key can't be used in two Regions, so you must specify a new KMS key in the target Region. If you use a Multi-Region KMS Key, the two Regions can share the same key material.

## EBS Encryption: The Internals of KMS Envelope Encryption

To the user, EBS encryption looks like a single toggle, but internally it uses KMS's envelope encryption.

```
1. When creating an EBS volume, send a "GenerateDataKey" request to KMS
2. KMS returns a plaintext data key (DEK) + an encrypted DEK
3. The Nitro Card on the EC2 host keeps the plaintext DEK in memory (memory only)
4. Encrypt every block of the volume with the DEK using AES-256-XTS and write to disk
5. The encrypted DEK is stored together in the volume metadata
6. Each time the instance reboots or moves, the encrypted DEK is decrypted again via a KMS Decrypt call
```

The key points are ① the plaintext DEK exists only inside KMS and in EC2 host memory (never written to disk), ② all IO is transparently encrypted/decrypted (invisible to the application), and ③ the performance impact is < 1% (using AES-NI hardware acceleration).

KMS Multi-Region Keys launched in 2021. Since the same key material can be used in multiple Regions, an EBS snapshot copied cross-region can be decrypted with the same key. Previously you had to create a new key in each Region and re-encrypt on snapshot copy. Note, though, that Multi-Region Keys are possible only for customer-managed CMKs, not for KMS's fully-managed CMKs.

**The 5 steps to encrypt an unencrypted volume**: ① create a snapshot (unencrypted) → ② make an encrypted copy with `copy-snapshot --encrypted --kms-key-id` → ③ create a new volume from the encrypted snapshot → ④ detach the original volume and attach the new volume → ⑤ delete the original after verification. This order is the encryption-conversion procedure.

## EFS, FSx: File Sharing Beyond EBS

If EBS is "a block disk used exclusively by one instance," EFS is "a file system shared by multiple instances over NFS." EFS is automatically replicated across multi-AZ, billed by usage (GB-month for what you use), and throughput scales automatically regardless of the number of instances.

| Service | Protocol | Multi-AZ | Concurrent clients | Max throughput | Suitable for |
|--------|---------|----------|------------|-----------|------|
| **EBS** | block (Nitro) | No (single AZ) | 1 (Multi-Attach exception: 16) | 4 GB/s (io2 Block Express) | DB, boot |
| **EFS** | NFSv4.1 | Yes | Thousands | 10+ GB/s (Provisioned mode) | Shared files, CMS, Lambda |
| **FSx for Lustre** | Lustre | No (single AZ, scratch) | Thousands | 100s GB/s | HPC, ML training |
| **FSx for Windows** | SMB 2.x/3.x | Yes (optional) | Windows clients | A few GB/s | AD-integrated Windows shares |
| **FSx for NetApp ONTAP** | NFS + SMB + iSCSI | Yes | Multi-protocol | A few GB/s | Enterprise on-prem migration |
| **Instance Store** | local block | No | 1 | Tens of GB/s (NVMe) | Temporary cache, scratch |
| **S3** | HTTP/S3 API | Yes (Region) | Unlimited | Tens of GB/s (parallel) | Object storage, static assets |

**EFS's throughput modes**:
- **Bursting**: The default. Under 1TB, a baseline of 50 MB/s with burst credits up to 100 MB/s. Insufficient for large workloads.
- **Provisioned**: Purchase throughput explicitly. Ignores the baseline.
- **Elastic** (2023): Scales automatically, billed by usage. The default for new workloads.

**EFS storage classes**:
- **Standard**: Frequently accessed, $0.33/GB-month
- **Infrequent Access (IA)**: Automatically moved after 30 days without access, $0.025/GB-month + $0.01 per GB on access
- **Archive**: 90 days without access, $0.008/GB-month + $0.03 per GB on access

Lambda can mount EFS. Lambda mounts through an EFS access point at boot, and inside the function it can read/write like regular file IO. It's used when a large ML model (GB-scale) can't fit within the Lambda layer limit (250MB), so you put it on EFS. Note, though, that Lambda → EFS needs the same VPC + the same subnet or an access point, and cold start latency increases by the EFS mount time.

## CLI Roundup

```bash
# Create a gp3 volume (independent IOPS/throughput)
aws ec2 create-volume \
  --volume-type gp3 \
  --size 500 \
  --iops 6000 \
  --throughput 250 \
  --availability-zone ap-northeast-2a \
  --encrypted \
  --kms-key-id alias/aws/ebs

# Attach the volume to an instance (on Linux it's usually /dev/xvdf onward)
aws ec2 attach-volume \
  --volume-id vol-0abc \
  --instance-id i-0xyz \
  --device /dev/sdf

# Create a file system inside Linux (XFS recommended)
sudo mkfs -t xfs /dev/nvme1n1  # On Nitro it appears as /dev/nvme1n1
sudo mkdir /data
sudo mount /dev/nvme1n1 /data

# Add to /etc/fstab (auto-mount on reboot, nofail prevents boot failure)
echo 'UUID=$(blkid -s UUID -o value /dev/nvme1n1) /data xfs defaults,nofail 0 2' \
  | sudo tee -a /etc/fstab

# Live volume modification (change size/IOPS/throughput/type with no downtime)
aws ec2 modify-volume \
  --volume-id vol-0abc \
  --size 1000 \
  --iops 10000

# Automated snapshots — Data Lifecycle Manager
aws dlm create-lifecycle-policy \
  --execution-role-arn arn:aws:iam::123:role/DLMRole \
  --description "Daily backup, retain 7 days" \
  --state ENABLED \
  --policy-details '{
    "PolicyType": "EBS_SNAPSHOT_MANAGEMENT",
    "ResourceTypes": ["VOLUME"],
    "TargetTags": [{"Key": "Backup", "Value": "Daily"}],
    "Schedules": [{
      "Name": "DailySchedule",
      "CreateRule": {"Interval": 24, "IntervalUnit": "HOURS", "Times": ["03:00"]},
      "RetainRule": {"Count": 7}
    }]
  }'
```

## Wrap-Up

We saw three pictures today. First, EBS is block storage accessed across the network from a distributed storage fleet inside an AZ, with gp3 as the default for new workloads and io2 Block Express as the top option for in-memory DBs. Second, Instance Store is directly attached host NVMe with microsecond latency, but its data disappears on stop, terminate, or host failure, so don't use it for persistent storage. Third, if multiple instances need to see the same data, the answer is EFS (or FSx depending on the workload), not EBS Multi-Attach.

In the next article we'll look at the layer on top of that that distributes traffic — ALB, NLB, GWLB, and the Auto Scaling Group. If EBS was the disk layer of a single instance, ELB and ASG are the availability and scalability layer over multiple instances.

---

## 📝 Practice Questions

**Question 1.** A company stored ML model training results on an EC2 instance's instance store, and after stopping the instance all the data vanished. What is the most appropriate response?

A) The data is unrecoverable, so retrain + in the future, back up immediately with an S3 sync after training ends
B) Ask AWS Support to recover the data
C) Change the instance store option to "persistent"
D) Move it to another AZ

**Answer: A**
Explanation: Instance store is temporary storage physically attached to the host server, and a stop is an operation in which the instance may move to a different host, so the data is permanently lost. There is no way to recover it. For workloads like ML training, the standard pattern is always to sync checkpoints to S3 or EFS regularly. Or store the results on EBS so the data is preserved on stop. The "persistent instance store" in C is a nonexistent option. D is irrelevant since the data was already lost by the stop itself.

---

**Question 2.** You want to encrypt an unencrypted production EBS volume with no downtime. What is the most accurate procedure?

A) Convert directly with `aws ec2 modify-volume --encrypted true`
B) Create a snapshot → make an encrypted copy with `copy-snapshot --encrypted --kms-key-id` → create a new volume from the encrypted snapshot → swap by detach/attach during a short downtime
C) Ask AWS Support to convert it
D) Copy the volume twice

**Answer: B**
Explanation: There's no API to directly encrypt a running volume. The standard procedure is ① create a snapshot → ② give the `--encrypted` flag to copy-snapshot (possible even without cross-region) to make an encrypted copy → ③ create a new volume in the same AZ from that snapshot → ④ pause the instance briefly (or in a multi-attach environment drain only some traffic) → ⑤ detach the original volume and attach the new volume. A conversion with literally zero downtime isn't possible, but for RDS you can switch over with almost no interruption by creating an encrypted read replica and promoting it. The `modify-volume` API in A supports only changing size/iops/throughput/type, not encryption.

---

**Question 3.** A Lambda function needs to load a large ML model (about 2GB). It exceeds the Lambda layer limit (250MB). What is the most appropriate solution?

A) Quantize the model to be smaller
B) Mount an EFS access point on Lambda and store the model on EFS
C) Use EC2 instead of Lambda
D) Put the model in S3 and download it on every Lambda invocation

**Answer: B**
Explanation: Lambda has supported EFS mounts since 2020. If you mount through an EFS access point in the same VPC + subnet, the function can access the model file like regular file IO. It lets you bypass the ZIP/Layer limit (250MB) or the deployment package limit (50MB zipped). D would have to download 2GB from S3 on every cold start, so latency explodes. C gives up Lambda's serverless advantage. A loses accuracy. Note, though, that Lambda must be connected to a VPC and cold start latency increases by the EFS mount time.

---

**Question 4.** An analytics team processes 100GB of logs on EC2 every day. Most of it is sequential reads, IOPS are low, but throughput matters. What is the cost-effective EBS type?

A) gp3
B) io2 Block Express
C) st1 (throughput-optimized HDD)
D) sc1 (cold HDD)

**Answer: C**
Explanation: st1 is HDD-based and cheap at $0.051 per GB while delivering up to 500 MB/s throughput on sequential reads/writes. It's the standard for big data ETL, log processing, and data warehouse staging areas. Its IOPS are low so random access is slow, but for sequential workloads it's more cost-effective than SSD. sc1 is cheaper but its throughput is also half, so it's insufficient for a workload processed daily. gp3 and io2 are SSDs so they're expensive; their throughput limits are similar at 1GB/s but the price is 5-10 times higher. io2 Block Express in B can reach 4GB/s but is the most expensive, so it's unsuitable from a cost-effectiveness standpoint. **HDD volumes can't be used as boot volumes**, so attach them only as data volumes.

---

**Question 5.** You want to run Oracle RAC on EC2. Two nodes must access the same data concurrently. What is the appropriate storage configuration?

A) Attach a separate gp3 volume to each of the two nodes
B) io2 Multi-Attach + a cluster-aware file system (e.g., OCFS2)
C) Mount EFS on the two nodes
D) Store the data in S3

**Answer: B**
Explanation: Oracle RAC is a cluster DB with concurrent access over a shared storage model. Use EBS Multi-Attach (io1/io2 + Nitro instance + same AZ, up to 16 nodes) to attach the same volume to both nodes. However, regular file systems like ext4 and xfs aren't cluster-aware, so concurrent writes cause corruption. A cluster file system such as Oracle ASM (Automatic Storage Management) or OCFS2 is required. EFS is NFS, so it can't provide the block-level access Oracle RAC requires. C suits general file sharing workloads. D is unsuitable for an OLTP DB.

---

**Question 6.** You created a new volume from an EBS snapshot and its response is very slow at first. What is the most appropriate response?

A) Change the volume type to io2
B) Enable Fast Snapshot Restore (FSR) in that AZ
C) Recreate the snapshot
D) Increase the instance type

**Answer: B**
Explanation: A volume created from a snapshot is lazy-loaded — it fetches from S3 the first time a block is accessed. So latency is high on the first read. If you enable Fast Snapshot Restore, all blocks are preloaded so you get full performance from the start. The cost is $0.75 per hour per snapshot per AZ, so it's best to turn it on only for a short time and then off. As an alternative, after mounting the volume, reading every block once with `dd if=/dev/xvdf of=/dev/null bs=1M` has the same effect. A and D don't solve the essence of lazy load.

---

**Question 7.** A company wants to retain EBS snapshots long-term for 90 days or more. To minimize cost?

A) Leave the snapshots as they are (S3 Standard pricing)
B) Move to EBS Snapshot Archive (Glacier-based) with `modify-snapshot-tier`, 75% savings + minimum 90-day retention commitment + 24-72 hours to restore
C) Copy the snapshot directly to S3 Glacier
D) Delete the snapshot and back up the volume

**Answer: B**
Explanation: EBS Snapshot Archive (launched November 2021) moves snapshots to an archive tier close to Glacier, saving 75% in cost. There's a minimum 90-day retention commitment (an early-deletion penalty applies), and after a restore request it's restored to the standard tier in 24-72 hours before it can be used. It suits long-term retention such as compliance and legal hold. "Copy directly to S3 Glacier" in C is impossible because users can't access EBS snapshots in S3 directly (it's an AWS-managed area). D isn't acceptable because the backup itself would disappear. Managing it in an integrated way with AWS Backup is the best practice from an operations standpoint.

---

**Question 8.** A development team wants multiple ECS tasks (running concurrently in the same VPC) to read/write the same directory. What is the most appropriate storage?

A) Attach an EBS volume to each task
B) Mount an EFS volume on all tasks
C) Sync files to an S3 bucket
D) FSx for Lustre

**Answer: B**
Explanation: EFS is NFSv4.1-based, automatically replicated across multi-AZ, and supports concurrent access by thousands of clients. If you specify the EFS file system in the `volumes` entry of the ECS task definition, all tasks see the same directory. It's the standard for CMS, shared config, and log aggregation patterns. In A, EBS by default attaches to only 1 instance. C is an object store rather than file system semantics, and location-based access is inconvenient. D is a high-performance parallel FS for HPC and ML training, so it's overkill cost-wise for a general shared directory.

---

## 📌 Today's Summary

1. EBS is AZ-dependent distributed block storage. gp3 is the default for new workloads, and io2/io2 Block Express are for mission-critical DBs. HDD (st1, sc1) can't be booted from.
2. A snapshot is a block-level incremental backup on S3. The lazy load trap → Fast Snapshot Restore. For long-term retention, Snapshot Archive (75% savings).
3. EBS encryption is KMS envelope encryption + AES-256-XTS. Converting unencrypted → encrypted goes through snapshot copy in 5 steps.
4. Instance store is host NVMe directly attached with microsecond latency, but its data is lost on stop/terminate/host failure. Never use it for persistent storage.
5. For sharing across multiple instances use EFS (NFS, multi-AZ), for Windows shares use FSx for Windows, and for HPC use FSx for Lustre. EBS Multi-Attach is limited to cluster-aware workloads.
