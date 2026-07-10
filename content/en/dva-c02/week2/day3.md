# Day 3 - EC2's Disk Layer: EBS, Instance Store, and EFS·FSx on Top

The first time you launch an EC2 instance and hit the "Add storage" screen, it's bewildering. gp3? io2? Block Express? It says you can grow to 16TB, but why is io2 expensive and sc1 cheap, and why does instance store throw a warning that "if this instance dies, so does your data"? The answer starts from one fact: EBS is **distributed block storage layered over the network**. Inside that single word "disk" hide wildly different IOPS, throughput, latency, durability, and replication models — and those trade-offs are the heart of the exam.

Today we follow the trail from EBS's internal architecture (why it's AZ-bound, why only io2 Block Express hits 256K IOPS) down to the physical NVMe of instance store. On top of that, we look at where EFS and FSx sit, and exactly how an EBS snapshot is stored in S3. The scenarios a developer meets on the exam — "why isn't our EBS hitting its IOPS?", "why did all my data vanish when I stopped the instance?" — can only be solved by someone who has followed this layer all the way down.

## EBS Is a Network Disk — The Real Reason It's AZ-Bound

If you understand EBS simply as "a disk that attaches to EC2", you're seeing half the picture. In reality, EBS stores data on a **separate distributed storage fleet inside an AZ**, and the EC2 instance reaches that fleet across the network over a protocol similar to iSCSI. That's why an EBS volume is **AZ-bound**, and to move EC2 to another AZ you need three steps: (1) create a snapshot (stored in S3) → (2) create a volume from the snapshot in the new AZ → (3) attach.

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

Within a single AZ, EBS automatically does **3-way replication**. So a single storage-server failure won't lose your data, but if the entire AZ dies, every EBS volume in that AZ dies with it. This is exactly why RDS Multi-AZ does not simply place the same EBS in another AZ — instead it **puts the Primary and Standby on EBS volumes in different AZs and adds synchronous replication on top**.

On Nitro instances, EBS is accessed through a dedicated PCIe card called the **Nitro EBS Card**. Because the card processes network packets directly, barely touching the host OS CPU, you get roughly 2x the EBS throughput of a non-Nitro instance of the same type. The EBS-Optimized option is also enabled by default at no charge, so EC2's general network bandwidth and its EBS bandwidth are separated (it used to be an opt-in feature with an extra fee).

> 🔍 **Going deeper**: EBS's "11 nines durability" (io2/io2 Block Express) is achieved on top of the in-AZ 3-way replication through background scrubbing (checksum verification followed by re-replication on corruption), partial erasure coding, and periodic fault detection. gp3 is not 11 nines — it's 99.8-99.9% durability (a 0.1-0.2% chance per year of permanent data loss on a volume). That's why io2 is recommended over gp3 for critical workloads. That said, in practice an application-level backup (snapshot, RDS automated backup, Aurora continuous backup) is always recommended regardless of EBS type.

> 💡 **Related theory**: EBS's 3-way replication operates on top of the quorum-based consistency model of distributed storage. A write must succeed on 2 of the 3 replicas to receive an ack (W=2), and a read is satisfied by 1 (R=1). This is the same idea as the quorum model in the Dynamo paper (DeCandia et al., 2007). If R+W > N (here N=3), strong consistency is guaranteed. EBS runs R=1, W=2, N=3, so W+R=3=N is not strictly strong consistency, but in practice there is an additional mechanism that guarantees strong consistency on write-back.

## EBS Volume Types in Depth

Before memorizing the volume types, look at what each is actually for.

| Type | Media | Baseline IOPS / Max IOPS | Throughput | Price (GB/month, ap-northeast-2) | Representative workload |
|------|-------|----------|--------|----------|----------|
| **gp3** | SSD | 3,000 / 16,000 | 125-1,000 MB/s | $0.0912 | Boot volume, general DB, web server |
| **gp2** | SSD | 100-16,000 (GB×3) | 250 MB/s | $0.114 | Previous generation to gp3 (migration recommended) |
| **io1** | SSD | 100-64,000 (1:50 ratio) | 1,000 MB/s | $0.1425 + IOPS | High-performance DB |
| **io2** | SSD | 100-64,000 (1:500 ratio) | 1,000 MB/s | $0.1425 + IOPS | Mission-critical DB |
| **io2 Block Express** | SSD | 100-256,000 (1:1000) | 4,000 MB/s | $0.1425 + IOPS | SAP HANA, large OLTP |
| **st1** | HDD | 40-500 (baseline) | 250-500 MB/s | $0.051 | Big-data ETL, logs |
| **sc1** | HDD | 12-250 (baseline) | 80-250 MB/s | $0.0174 | Cold archive |

**Why gp3 replaces gp2**: gp2 tied IOPS to volume size (3 IOPS per GB, up to 16,000), so if you needed 5,000 IOPS on a 100GB volume you had to grow it to 1,667GB. gp3 lets you set IOPS and throughput **independently of size** (for an extra fee). Even provisioning 5,000 IOPS and 250 MB/s on that same 100GB volume, it comes out about 20% cheaper than gp2.

**io1 vs io2**: io2 came later, so it's better. (1) durability jumps from io1's 99.9% to io2's 99.999% (=11 nines), 4 nines higher. (2) at the same price, the IOPS:GB ratio goes from io1's 1:50 to io2's 1:500 — 10x. That is, a 100GB io2 can reach 5,000 IOPS, while a 100GB io1 is only guaranteed up to 50 IOPS. So choosing io1 for a new workload is almost always the wrong answer.

**io2 Block Express**: Launched in 2021. Built on the NVMe over Fabrics protocol, it re-architected the EBS network stack from scratch. 256K IOPS, 4 GB/s throughput, sub-millisecond latency, and scaling to 64TB. It's used as the persistent storage layer for in-memory DBs like SAP HANA. It only works on io2 Block Express-compatible instances such as r5b.

> ⚠️ **Trap**: On the exam, whenever you see "the most suitable EBS type for a database", the answer is io2 or io2 Block Express, no exceptions. gp3 is also fine for a "general DB", but the moment keywords like "latency-sensitive" or "mission-critical" appear, the answer is io2. And any option that says "use HDD as a boot volume" is always wrong. st1 and sc1 cannot boot.

> 🔍 **Going deeper**: gp3's baseline of 3,000 IOPS is identical whether the volume is 1GB or 1TB. On top of that, additional IOPS cost $0.005/month per IOPS, and throughput costs $0.04/month per MB/s (above 125 MB/s). So if an 80GB boot volume needs 5,000 IOPS, the extra 2,000 IOPS × $0.005 = $10/month is added. It's a relatively cheap option, so standardizing even production boot volumes on gp3 is becoming the norm.

## EBS Multi-Attach: One Volume Across Several Instances

By default an EBS volume attaches to a single EC2 instance. But there's an exception, EBS Multi-Attach, available only with the combination of **io1/io2 + Nitro instances + same AZ**. Up to 16 instances can attach to the same volume simultaneously.

Here's **a trap the exam loves**: turning on Multi-Attach isn't the whole story. Ordinary filesystems (ext4, xfs) aren't cluster-aware, so if multiple nodes write concurrently the filesystem corrupts. You need a cluster filesystem like **GFS2, OCFS2, or VxFS**, and on top of it a distributed lock manager has to coordinate concurrent access. In other words, Multi-Attach only makes sense when the application/middleware already understands clustering (cases like Oracle RAC, or SAP ASCS·ERS).

```python
# Create a Multi-Attach-capable io2 volume
volume = ec2.create_volume(
    AvailabilityZone='ap-northeast-2a',
    Size=100,
    VolumeType='io2',
    Iops=5000,
    MultiAttachEnabled=True
)
```

> 💡 **Memory tip**: On the exam, the answer to "multiple EC2s sharing the same disk" is almost always **EFS** (NFS-based file sharing), not EBS Multi-Attach. Multi-Attach is just a special case for cluster-aware workloads.

## Instance Store: What Physical NVMe Really Looks Like

Instance store (ephemeral storage, instance-store) is storage directly attached to the EC2 host's physical disk. Unlike EBS it doesn't cross the network, so latency is on the order of microseconds and IOPS reaches into the millions. The downside: **if the host dies, so does the data.**

```
[EC2 instance on host server]
       |
       | PCIe direct attached
       |
[NVMe SSD physically on host]
   (physically bolted into the host server)
```

Storage-optimized instance families like i3·i4i·im4gn·is4gen offer large-capacity (up to several TB) NVMe instance store. The d2·d3 families offer dense HDD instance store for data warehousing. But note that instance store is **allocated as a fixed size at launch**, cannot be resized, and has no concept of attach/detach (it's one body with the instance itself).

| Operation | EBS | Instance Store |
|------|-----|----------------|
| Instance reboot | Data retained | Data retained |
| Instance stop | Data retained | **Data lost** |
| Instance terminate | Deleted by default (DeleteOnTermination), can be retained via option | **Data lost** |
| Host failure | Data retained (3-way replication) | **Data lost** |
| AZ failure | Data at risk (recoverable if you have a snapshot) | **Data lost** |
| Attach to another instance | Possible | Not possible |
| Resize | Possible (live) | Not possible |

> 🔍 **Going deeper**: Stopping an instance is an operation that can relocate it to a different host (a new host is assigned on start). That's why host-bound instance store loses its data on stop. Reboot, by contrast, restarts only the OS on the same host, so data is retained. Hibernate dumps RAM contents to the EBS root volume and then stops, so instance store is likewise lost. That's why hibernate requires the EBS root volume to be encrypted and is only supported on certain instance types (mostly the m·c·r families).

> 📚 **Case study**: In 2017 an ML startup stored model weights trained on an i3.4xlarge in instance store, then stopped the instance after the batch finished — and lost all the data. AWS helpfully pops an "Are you sure?" warning, but automation scripts ignore it. From then on that company reportedly forced an S3 sync as the final step in every training script. On the exam, any option that says "store important data on instance store only" is always wrong.

## EBS Snapshot: Incremental Backup on Top of S3

An EBS snapshot is a point-in-time backup of a volume. It's documented as being stored in S3, but in reality it's stored in an **AWS-managed S3 bucket** that you can't access directly.

The core mechanism is **block-level incremental backup**. The first snapshot stores all used blocks in S3. From the second snapshot on, only **the blocks changed since the first snapshot** are stored, and unchanged blocks reference the first snapshot. So even the 10th snapshot of a 100GB volume consumes only as much additional space as the amount changed in between.

```
Snapshot 1 (Day 1):  [Block A][Block B][Block C][Block D]  → S3 full
Snapshot 2 (Day 2):  [        ][Block B'][        ][        ]  → S3 with reference
                     (only B' is actually stored; the rest point at Snapshot 1)
Snapshot 3 (Day 3):  [        ][        ][Block C'][        ]  → S3 with reference
                     (only C' is stored)
```

Because of this structure: (1) the cost per snapshot is proportional to the amount changed (cheap), (2) deleting an intermediate snapshot keeps the blocks that other snapshots reference (automatic dependency management), and (3) restoring a volume from a snapshot follows all block references to reconstruct it.

| Operation | Behavior | Cost |
|------|------|------|
| Create snapshot | block-level incremental | changed blocks × $0.0552/month (S3 Standard GB/month) |
| Snapshot Archive | Move to Glacier (90-day minimum) | changed amount × $0.0144 (75% cheaper) |
| Copy snapshot (same region) | references only | $0 |
| Copy snapshot (different region) | full data transfer | data transfer cost per GB |
| Restore snapshot (create volume) | lazy load (fetch on block access) | available immediately, high latency at first |
| Fast Snapshot Restore (FSR) | preloads all blocks in advance | extra cost ($0.75/hour/snapshot/AZ) |

**The lazy-load trap**: when you create a volume from a snapshot, it becomes "Available" immediately, but the blocks inside are fetched from S3 on first access. So the new volume's first fsck or boot sees a big latency spike. To fill in all blocks ahead of time, either (1) do a full scan with a command like `dd if=/dev/xvdf of=/dev/null bs=1M`, or (2) turn on Fast Snapshot Restore (paid).

```python
# Snapshot creation, cross-region copy, and encryption
snap = ec2.create_snapshot(
    VolumeId='vol-0abc1234',
    Description='Daily backup before deploy',
    TagSpecifications=[{
        'ResourceType': 'snapshot',
        'Tags': [{'Key': 'Backup', 'Value': '2026-05-26'}]
    }]
)

# Copy to another region + KMS re-encryption + Archive tier (75% savings)
target_ec2 = boto3.client('ec2', region_name='us-east-1')
copy = target_ec2.copy_snapshot(
    SourceRegion='ap-northeast-2',
    SourceSnapshotId=snap['SnapshotId'],
    Encrypted=True,
    KmsKeyId='arn:aws:kms:us-east-1:123:key/abc'
)

# Move to the Archive tier if you'll keep it 90+ days
ec2.modify_snapshot_tier(
    SnapshotId=snap['SnapshotId'],
    StorageTier='archive'
)
```

> ⚠️ **Trap**: When the exam shows a scenario where "a new volume created from a snapshot is slower than production", the answer is Fast Snapshot Restore. It's the lazy load. Also, "automatically encrypt a snapshot when copying it to another region" is possible (`Encrypted=True`), but you can't use the same KMS key across two regions, so you must specify a new KMS key in the target region. Using a Multi-Region KMS Key lets both regions share the same key material.

## EBS Encryption: Inside KMS Envelope Encryption

To the user, EBS encryption is a single toggle, but internally it uses KMS envelope encryption.

```
1. On EBS volume creation, request "GenerateDataKey" from KMS
2. KMS returns a plaintext data key (DEK) + an encrypted DEK
3. The EC2 host's Nitro Card keeps the plaintext DEK in memory (memory only)
4. Encrypt every block of the volume with the DEK using AES-256-XTS, then write to disk
5. The encrypted DEK is stored alongside the volume metadata
6. On every instance reboot/relocation, decrypt the encrypted DEK again via a KMS Decrypt call
```

The key points: (1) the plaintext DEK exists only inside KMS and in EC2 host memory (never written to disk), (2) all IO is transparently encrypted/decrypted (invisible to the application), and (3) the performance impact is < 1% (leveraging AES-NI hardware acceleration).

> 🔍 **Going deeper**: The KMS Multi-Region Key launched in 2021. Because the same key material can be used across multiple regions, an EBS snapshot can be cross-region copied and still decrypted with the same key. Previously you had to create a new key in each region and re-encrypt on snapshot copy. Note that Multi-Region Keys are only possible with a customer-managed CMK, not a KMS fully-managed CMK.

**The 5 steps to encrypt an unencrypted volume**: (1) create a snapshot (unencrypted) → (2) `copy-snapshot --encrypted --kms-key-id` to make an encrypted copy → (3) create a new volume from the encrypted snapshot → (4) detach the original volume and attach the new one → (5) verify, then delete the original. You have to memorize this sequence whole.

> 💡 **Related theory**: Envelope encryption is a technique PGP standardized in the 1990s (RFC 4880). You encrypt large data with a fast symmetric key, and encrypt that symmetric key just once with a slow asymmetric key or a strong service like KMS. AES-256-XTS is the disk-encryption standard (IEEE 1619-2007), which makes the same plaintext block produce different ciphertext depending on position, preventing pattern leakage. BitLocker, FileVault, and dm-crypt (LUKS) all use AES-XTS.

## EFS, FSx: File Sharing Beyond EBS

If EBS is "a block disk used exclusively by one instance", EFS is "a filesystem shared by many instances over NFS". EFS replicates automatically across multiple AZs, bills by usage (GB-month for what you write), and scales throughput automatically regardless of the number of instances.

| Service | Protocol | Multi-AZ | Concurrent clients | Max throughput | Suited for |
|--------|---------|----------|------------|-----------|------|
| **EBS** | block (Nitro) | No (single AZ) | 1 (16 with Multi-Attach exception) | 4 GB/s (io2 Block Express) | DB, boot |
| **EFS** | NFSv4.1 | Yes | Thousands | 10+ GB/s (Provisioned mode) | Shared files, CMS, Lambda |
| **FSx for Lustre** | Lustre | No (single AZ, scratch) | Thousands | 100s of GB/s | HPC, ML training |
| **FSx for Windows** | SMB 2.x/3.x | Yes (optional) | Windows clients | Several GB/s | AD-integrated Windows shares |
| **FSx for NetApp ONTAP** | NFS + SMB + iSCSI | Yes | Multi-protocol | Several GB/s | Enterprise on-prem migration |
| **Instance Store** | local block | No | 1 | Tens of GB/s (NVMe) | Temp cache, scratch |
| **S3** | HTTP/S3 API | Yes (region) | Unlimited | Tens of GB/s (parallel) | Object storage, static assets |

**EFS's two throughput modes**:
- **Bursting**: the default. Below 1TB, a baseline of 50 MB/s with burst credits up to 100 MB/s. Not enough for large workloads.
- **Provisioned**: explicitly purchase throughput. Ignores the baseline.
- **Elastic** (2023): auto-scaling, usage-based billing. The default for new workloads.

**EFS storage classes**:
- **Standard**: frequent access, $0.33/GB·month
- **Infrequent Access (IA)**: auto-moved after 30 days of no access, $0.025/GB·month + $0.01/GB on access
- **Archive**: 90 days of no access, $0.008/GB·month + $0.03/GB on access

> 🔍 **Going deeper**: The fact that Lambda can mount EFS comes up often on the exam. Lambda mounts through an EFS access point at boot, and inside the function you can read/write like ordinary file IO. When a large ML model (in the GBs) won't fit within the Lambda layer limit (250MB), you put it on EFS. Note that Lambda → EFS requires the same VPC + same subnet or an access point, and cold-start latency grows by the EFS mount time.

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

# Attach the volume to an instance (Linux is usually /dev/xvdf onward)
aws ec2 attach-volume \
  --volume-id vol-0abc \
  --instance-id i-0xyz \
  --device /dev/sdf

# Create a filesystem inside Linux (XFS recommended)
sudo mkfs -t xfs /dev/nvme1n1  # Nitro presents as /dev/nvme1n1
sudo mkdir /data
sudo mount /dev/nvme1n1 /data

# Add to /etc/fstab (auto-mount on reboot; nofail prevents boot failure)
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

## Wrapping Up

There are three pictures we saw today. First, EBS is block storage that reaches a distributed storage fleet inside an AZ across the network; gp3 is the default for new workloads, and io2 Block Express is the top-tier option for in-memory DBs. Second, instance store is host NVMe direct-attached, so it has microsecond latency, but data disappears on stop, terminate, or host failure — so you must never use it for permanent storage. Third, if multiple instances need to see the same data, the answer is not EBS Multi-Attach but EFS (or FSx depending on the workload).

In the next article we look at the layer that distributes traffic on top of this — ALB·NLB·GWLB and the Auto Scaling Group. If EBS was one instance's disk layer, ELB·ASG is the availability and scalability layer across many instances.

---

## 📝 연습 문제

**문제 1.** A company stored ML model training results on an EC2 instance's instance store, stopped the instance, and all the data vanished. What is the most appropriate response?

A) The data is unrecoverable, so re-run training + going forward, back up with an S3 sync immediately after training finishes
B) Request data recovery from AWS Support
C) Change the instance store option to "persistent"
D) Move to another AZ

**정답: A**
해설: Instance store is temporary storage physically attached to the host server, and stop is an operation that can relocate the instance to a different host, so the data is permanently lost. There is no way to recover it. Workloads like ML training should always follow the standard pattern of periodically syncing checkpoints to S3 or EFS. Alternatively, store results on EBS, which retains data on stop. C's "persistent instance store" is not a real option. D is irrelevant because the data was already gone the moment you stopped.

---

**문제 2.** You want to encrypt an unencrypted production EBS volume with no downtime. What is the most accurate procedure?

A) Convert it directly with `aws ec2 modify-volume --encrypted true`
B) Create a snapshot → make an encrypted copy with `copy-snapshot --encrypted --kms-key-id` → create a new volume from the encrypted snapshot → swap via detach/attach during a brief downtime
C) Request conversion from AWS Support
D) Copy the volume twice

**정답: B**
해설: There is no API to encrypt a running volume directly. The standard procedure is: (1) create a snapshot → (2) make an encrypted copy by passing the `--encrypted` flag to copy-snapshot (which works even without cross-region) → (3) create a new volume from that snapshot in the same AZ → (4) briefly pause the instance (or, in a multi-attach setup, drain only some traffic) → (5) detach the original volume and attach the new one. Fully downtime-free conversion is impossible, but for RDS you can achieve near-zero-downtime by creating an encrypted read replica and promoting it. A's `modify-volume` API only supports changing size/iops/throughput/type — encryption can't be changed.

---

**문제 3.** A Lambda function needs to load a large ML model (about 2GB). It exceeds the Lambda layer limit (250MB). What is the most appropriate solution?

A) Quantize the model to make it smaller
B) Mount an EFS access point on Lambda and store the model on EFS
C) Use EC2 instead of Lambda
D) Keep the model in S3 and download it on every Lambda invocation

**정답: B**
해설: Lambda has supported EFS mounts since 2020. Mounting through an EFS access point in the same VPC + subnet lets you access the model file inside the function like ordinary file IO. This sidesteps the ZIP/Layer limit (250MB) and the deployment package limit (50MB zipped). D would have to fetch 2GB from S3 on every cold start, making latency explode. C gives up Lambda's serverless advantages. A loses accuracy. Just note that Lambda must be connected to the VPC and cold-start latency grows by the EFS mount time.

---

**문제 4.** An analytics team processes 100GB of logs on EC2 daily. It's mostly sequential reads, IOPS is low, but throughput matters. Which is the cost-effective EBS type?

A) gp3
B) io2 Block Express
C) st1 (throughput-optimized HDD)
D) sc1 (cold HDD)

**정답: C**
해설: st1 is HDD-based at a cheap $0.051/GB while still delivering up to 500 MB/s throughput on sequential reads/writes. It's the standard for big-data ETL, log processing, and the staging area of a data warehouse. Its low IOPS makes random access slow, but for sequential workloads it's more cost-effective than SSD. sc1 is cheaper but has half the throughput, so it's not enough for a daily processing workload. gp3 and io2 are SSD, so they're expensive; their throughput ceilings (~1GB/s) are similar but the price is 5-10x. B's io2 Block Express can reach 4GB/s but is the most expensive, so it's unsuitable on cost-effectiveness. **Since HDD volumes can't be used as boot volumes**, attach it only as a data volume.

---

**문제 5.** You want to run Oracle RAC on EC2. Two nodes must access the same data concurrently. What is the appropriate storage configuration?

A) Attach a separate gp3 volume to each node
B) io2 Multi-Attach + a cluster-aware file system (e.g. OCFS2)
C) Mount EFS on both nodes
D) Store the data in S3

**정답: B**
해설: Oracle RAC is a cluster DB that accesses shared storage concurrently. Use EBS Multi-Attach (io1/io2 + Nitro instances + same AZ, up to 16 nodes) to attach the same volume to both nodes. But an ordinary FS like ext4 or xfs isn't cluster-aware, so concurrent writes corrupt it. A cluster file system like Oracle ASM (Automatic Storage Management) or OCFS2 is essential. EFS is NFS, so it can't provide the block-level access Oracle RAC requires. C is suited to general file-sharing workloads. D is unsuitable for an OLTP DB.

---

**문제 6.** You created a new volume from an EBS snapshot, but responses are very slow at first. What is the most appropriate response?

A) Change the volume type to io2
B) Enable Fast Snapshot Restore (FSR) in that AZ
C) Re-create the snapshot
D) Increase the instance type

**정답: B**
해설: A volume created from a snapshot uses lazy load — it fetches blocks from S3 on first access. That's why the first reads have high latency. Enabling Fast Snapshot Restore preloads all blocks in advance, giving full performance from the start. The cost is $0.75/snapshot/AZ per hour, so it's best to turn it on only for a short window and off again. As an alternative, mounting the volume and reading every block once with `dd if=/dev/xvdf of=/dev/null bs=1M` has the same effect. A and D don't address the essence of lazy load.

---

**문제 5(중복 방지를 위해 재번호): NotApplicable. 이미 5번 출제.

**문제 7.** A company wants to retain EBS snapshots for 90+ days of long-term storage. How do you minimize cost?

A) Leave the snapshot as-is (S3 Standard pricing)
B) Move it to EBS Snapshot Archive (Glacier-based) with `modify-snapshot-tier` — 75% savings + a 90-day minimum retention commitment + 24-72 hours to restore
C) Copy the snapshot directly to S3 Glacier
D) Delete the snapshot and back up the volume

**정답: B**
해설: EBS Snapshot Archive (launched November 2021) moves a snapshot to a near-Glacier archive tier for a 75% cost reduction. It has a 90-day minimum retention commitment (an early-deletion penalty applies), and after a restore request it takes 24-72 hours to restore to the standard tier before it's usable. It suits long-term retention like compliance or legal hold. C's "copy directly to S3 Glacier" is impossible because users can't get direct S3 access to an EBS snapshot (it's an AWS-managed area). D fails because the backup itself disappears. Managing it centrally with AWS Backup is the operational best practice.

---

**문제 8.** A dev team wants multiple ECS tasks (running concurrently in the same VPC) to read/write the same directory. What is the most appropriate storage?

A) Attach an EBS volume to each task
B) Mount an EFS volume on all tasks
C) Sync files to an S3 bucket
D) FSx for Lustre

**정답: B**
해설: EFS is NFSv4.1-based, replicates automatically across multiple AZs, and supports concurrent access from thousands of clients. Specifying an EFS file system as a `volumes` entry in the ECS task definition lets every task see the same directory. It's the standard for CMS, shared-config, and log-aggregation patterns. A fails because EBS by default attaches to only one instance. C is an object store, not filesystem semantics, and location-based access is awkward. D is a high-performance parallel FS for HPC/ML training — overkill in cost for an ordinary shared directory.

---

## 📌 오늘의 요약

1. EBS is AZ-bound distributed block storage. gp3 is the default for new workloads; io2/io2 Block Express is for mission-critical DBs. HDD (st1·sc1) can't boot.
2. Snapshots are block-level incremental backups on top of S3. The lazy-load trap → Fast Snapshot Restore. Long-term retention → Snapshot Archive (75% savings).
3. EBS encryption is KMS envelope encryption + AES-256-XTS. The unencrypted → encrypted transition is a 5-step process via snapshot copy.
4. Instance store is host NVMe direct-attached with microsecond latency, but data is lost on stop/terminate/host failure. Never use it for permanent storage.
5. For sharing across multiple instances, use EFS (NFS, multi-AZ); for Windows shares, FSx for Windows; for HPC, FSx for Lustre. EBS Multi-Attach is limited to cluster-aware workloads.
