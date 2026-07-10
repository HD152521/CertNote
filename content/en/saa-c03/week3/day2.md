# Day 2 - EBS vs Instance Store: The Trade Between Persistence and Performance, and Choosing a File System

Storage mistakes exact a heavy price, quietly. Data written to EC2 instance store vanishing when the instance terminates; a database stalling after hitting the IOPS ceiling on EBS gp2; or insisting on a Linux mount when you should have used FSx for Windows instead of EFS, only to find AD authentication won't work — these are the classic examples. Most of these wrong choices come from not knowing "how the thing works."

This article covers the internal design principles of each EBS volume type (IOPS math, gp3 vs gp2), the physical structure of Instance Store and its data-loss scenarios, the distributed file-system architecture of EFS, and the reason each of the four FSx variants exists. Read it end to end — from storage-system theory to real-world incidents — and exam scenarios start reading themselves.

## The History of EBS: Why Networked Block Storage Was Needed

In the earliest days of EC2, all storage was instance store. You used the local disk attached to the physical server as-is, and terminating the instance took the data with it. Developers had to manually back up important data to S3.

In 2008, AWS launched EBS (Elastic Block Store). The core idea was to **separate block storage over the network**. Once the instance and its storage are logically decoupled, the data survives even when the instance terminates, and you can detach it from one instance and reattach it to another. That is what "Elastic" means.

Physically, EBS is built from a separate set of storage servers within the same AZ. A volume's data is spread across multiple storage servers so it can survive a single-server failure. The EC2 instance reaches EBS over the NVMe-over-TCP protocol via its Nitro card.

> 🔍 **Going deeper**: Communication between EBS and an EC2 instance uses NVMe over TCP, but this path is offloaded to the Nitro card and consumes no instance CPU. Note that this network path does not share the instance's overall network bandwidth — it uses a separately optimized channel. Dedicated EBS bandwidth (EBS-Optimized) guarantees this path. On an m6i.xlarge, you can allocate up to 4,750 Mbps to EBS.

## EBS Volume Types: Design Principles and What the Numbers Mean

### gp2 vs gp3: Why gp3 Is Better

gp2, the first-generation SSD type released in 2014, ties **IOPS to volume size**: 3 IOPS per GB, up to 16,000 IOPS. At first, the simple model of "bigger volume = faster" looked reasonable. In practice, though, it led to waste — you had to over-provision volume size just to get the IOPS you needed. If you needed 5,000 IOPS, you had to buy 1,667GB.

gp3, released in 2020, **fully decoupled** IOPS from volume size. Every gp3 volume delivers a baseline 3,000 IOPS and 125 MB/s of throughput regardless of size. On top of that, you can independently provision IOPS up to 16,000 and throughput up to 1,000 MB/s. And it's **20% cheaper than gp2**.

```
[ gp2 IOPS model ]
Volume size × 3 = IOPS (up to 16,000)
→ Need 5,000 IOPS: must buy at least 1,667GB

[ gp3 IOPS model ]
Baseline 3,000 IOPS + additional provisioning (up to 16,000)
→ Need 5,000 IOPS: possible even on a 10GB volume
→ 20% cheaper than gp2
```

> ⚠️ **Pitfall**: Existing gp2 volumes are not automatically converted to gp3. You have to run `modify-volume` manually from the console or CLI, and the instance keeps running during the conversion (no downtime). In large environments, a common pattern is to detect gp2 volumes with an AWS Config rule and auto-convert them with Lambda.

### io1/io2 and io2 Block Express: When You Actually Need Them

gp3 tops out at 16,000 IOPS. Most OLTP workloads on Oracle DB, MySQL, and PostgreSQL fit comfortably within that. But when you need hundreds of thousands of IOPS and extremely low latency (sub-1ms) — as with SAP HANA or large financial transaction systems — you need io2 Block Express.

| Type | Max IOPS | Max Throughput | Max Size | Latency |
|------|----------|----------------|----------|---------|
| gp3 | 16,000 | 1,000 MB/s | 16 TB | single-digit ms |
| io1 | 64,000 | 1,000 MB/s | 16 TB | sub-1ms |
| io2 | 64,000 | 1,000 MB/s | 16 TB | sub-1ms |
| io2 Block Express | 256,000 | 4,000 MB/s | 64 TB | sub-ms |

How does io2 Block Express reach 256K IOPS? The legacy EBS stack goes through the Amazon EBS API layer, but io2 Block Express uses a new storage-server architecture integrated directly with the AWS Nitro hypervisor. It applies the NVMe-over-Fabric concept to the AWS internal network, dramatically raising latency and throughput.

**io1/io2 Multi-Attach** lets you attach a single EBS volume to multiple EC2 instances at once. This is not file-system-level sharing, though. If multiple instances write to the same block simultaneously, the data corrupts. Multi-Attach is used only when a **cluster-aware file system** (GFS2, OCFS2, Oracle Cluster File System) or cluster software coordinates the writes.

> 💡 **Related theory**: The concurrent-write problem in Multi-Attach is the same problem as **concurrency control** in distributed systems. Just like a database's MVCC (Multi-Version Concurrency Control), a cluster file system coordinates which node is writing which block using a **distributed lock**. GFS2 uses GDLM (Global Distributed Lock Manager) for this.

### HDD Types: st1 and sc1

When SSD is expensive, HDD-based EBS can be cost-effective in certain cases.

st1 (Throughput Optimized HDD) is optimized for sequential, large-volume reads and writes. Think Hadoop MapReduce, log aggregation, and data-warehouse ETL — workloads that read large files in order. It delivers up to 500 MB/s of throughput but has low IOPS (up to 500) and is unsuitable for random access.

sc1 (Cold HDD) is the type for storing very rarely accessed data as cheaply as possible. Use it for archive data read once a month or less.

> 💡 **Related theory**: HDD random-access performance is lower than SSD because of physical structure. An HDD head has to move physically (seek time, 5-10ms on average) and the platter has to rotate (rotational latency, 2-4ms on average for 7200 RPM). An SSD accesses NAND flash cells via electrical signals, so it can access data in microseconds with no mechanical movement. This difference shows up as the IOPS gap (hundreds for HDD vs hundreds of thousands for SSD).

## EBS Snapshots: How Incremental Backup Works

EBS snapshots are stored in S3, but they don't appear as an S3 bucket you can see directly in the AWS console. Internally, they're stored in AWS-managed S3.

What matters is the **incremental backup** scheme. The first snapshot copies the entire dataset. Every snapshot after that stores **only the diff** from the previous one. Yet at restore time, any single snapshot is enough for a complete restore — internally, AWS references the earlier snapshots to reconstruct the full dataset.

```
[ EBS snapshot incremental structure ]

snap-001: [A][B][C][D][E]  ← full copy
snap-002: [A][B'][C][D][E'] ← only B, E changed → store only B', E'
snap-003: [A][B'][C'][D][E'] ← only C changed → store only C'

Restoring snap-003: A(snap-001) + B'(snap-002) + C'(snap-003) + D(snap-001) + E'(snap-002)
→ independent restore possible from any snapshot
```

**FSR (Fast Snapshot Restore)** eliminates the first-read performance hit when restoring a volume from a snapshot. Normally, blocks in a restored volume are fetched from S3 in the background on first access — a "lazy restore" scheme. FSR performs this pre-initialization ahead of time so the volume delivers full performance immediately. It incurs extra cost.

> 📚 **Case study**: In March 2020, as the early-COVID shift to remote work sent AWS usage soaring, many companies urgently restored large EBS volumes from snapshots. Numerous reports described a "snapshot performance degradation" problem: volumes restored without FSR delivered only 10-20% of normal IOPS for the first few hours. In production restore scenarios, enabling FSR is recommended even at the added cost.

**EBS Snapshot Archive** tiers snapshots that need long-term retention of 90+ days into S3 Glacier. It cuts cost by 75% but takes 24-72 hours to restore. It fits snapshots you'll "maybe use once a year, maybe not" for DR purposes.

## Instance Store: Fast but Untrustworthy Storage

Instance Store is NVMe SSD directly attached to the physical server the EC2 instance runs on. It's accessed directly over the PCIe bus with no network hop, delivering millions of IOPS and microsecond-level latency.

You need to know the data-loss scenarios precisely.

| Situation | Instance Store data |
|-----------|--------------------|
| Instance **reboot** | retained |
| Instance **stop** | **lost** (may move to a different physical host) |
| Instance **terminate** | **lost** |
| Physical host **failure** | **lost** |
| Instance **hibernate** | **lost** |

Data disappears on stop because a restart after stopping does not guarantee the same physical host. If it starts on a different physical server, there's no way to reach the earlier physical disk.

> 💡 **Related theory**: Instance Store data loss should be treated exactly like a **crash fault** in distributed systems. High-availability NoSQL databases (e.g., Cassandra, MongoDB) are designed assuming single-node storage loss as a normal operating condition, and they guarantee durability through replication. When running Cassandra on i4i instances (NVMe, Instance Store), you must spread it across 3 AZs with replication factor=3 so that losing a single instance doesn't lose data.

> 📚 **Case study**: Netflix uses a pattern of running part of its Cassandra clusters on top of i3 instances (Instance Store). Even when an instance terminates, Cassandra's 3-way replication preserves the data. This structure lets you exploit Instance Store's extreme I/O performance while eliminating EBS cost. The operational trade-off is that Cassandra repair operations are needed more often.

## EFS: AWS's Distributed NFS

EFS (Elastic File System) is a fully managed distributed file system using the NFSv4.1 protocol. Multiple EC2 instances can mount it and read and write simultaneously. Capacity grows and shrinks automatically (up to the petabyte range).

Internally, EFS is built from storage servers distributed across multiple AZs. Each file is spread across multiple servers to secure availability and durability. Clients connect through EFS mount targets (one placed in each AZ).

```
[ EFS architecture ]

     EC2-AZ-a        EC2-AZ-b        EC2-AZ-c
         │                │                │
    Mount Target    Mount Target    Mount Target
    (ap-ne-2a)      (ap-ne-2b)      (ap-ne-2c)
         └────────────────┴────────────────┘
                          │
              [ EFS distributed storage cluster ]
                  (Multi-AZ durability)
```

**Performance modes**:
- `generalPurpose`: the default. Suits 99% of workloads. Fast metadata operations.
- `maxIO`: for highly parallel workloads with thousands or more clients accessing concurrently. Latency is slightly higher, but throughput scalability is excellent.

**Throughput modes**:
- `Bursting`: can burst in proportion to data size. Baseline 100 MB/s plus consumption of accrued credits.
- `Provisioned`: specify the throughput you want regardless of size. For when you need high throughput on a small amount of data.
- `Elastic`: auto-adjusts to actual usage. The most convenient for unpredictable traffic.

> 💡 **Related theory**: EFS's distributed-lock structure is similar to the **pNFS (Parallel NFS)** principle in NFS 4.1. pNFS, defined in RFC 5661, distributes data servers across multiple nodes to enable parallel reads and writes. EFS abstracts this into an AWS-internal implementation.

**EFS storage classes**:
- `Standard`: frequently accessed files.
- `Standard-IA (Infrequent Access)`: files not accessed for 30+ days. Moved automatically by an EFS Lifecycle Policy.
- `One Zone`: single AZ, cheaper but affected by an AZ failure.
- `One Zone-IA`: One Zone + IA. The cheapest.

**EFS Access Point** is a mount point that applies specific POSIX user/group permissions and a specific directory root. Use it when multiple applications share the same EFS but must be isolated with different directories and permissions. It suits multi-tenant file-sharing architectures.

## The Four FSx Variants: Why Each One Exists

The reason AWS built the FSx series is simple. EFS is a general-purpose file system based on NFSv4.1, but certain workloads need a specialized file-system protocol or feature.

### FSx for Windows File Server: The Value of Active Directory Integration

File sharing in Windows environments demands the SMB (Server Message Block) protocol, Windows NTFS, and Active Directory integration. EFS, being Linux NFS-based, can't do any of this.

FSx for Windows runs actual Windows Server in managed form. It integrates with AWS Managed Active Directory or on-premises AD to support Kerberos authentication, NTFS ACLs, shadow copies, and DFS Namespaces. It can even be used for SQL Server FCI (Failover Cluster Instance).

With Multi-AZ deployment, automatic failover happens within 30 seconds. Storage capacity can be chosen as SSD or HDD.

> ⚠️ **Pitfall**: When you see "Windows file server + Active Directory + SMB," you must not pick EFS. EFS can be mounted from a Windows client via an NFS client, but it doesn't support AD integration, NTFS permissions, or SMB semantics. This distinction shows up on the exam often.

### FSx for Lustre: The Parallel File System for HPC and ML

Lustre is a high-performance parallel file system designed by Peter Braam in 1999 (the name is a portmanteau of Linux + Cluster). Many of the world's Top 500 supercomputers use Lustre. The US Department of Energy's (DOE) Summit and Frontier supercomputers run Lustre too.

Lustre's design principle is to **stripe data across many storage servers (OSTs: Object Storage Targets)** so aggregate throughput scales linearly. Stripe a file across 1,000 OSTs and you get 1,000× the throughput. Metadata is managed by a separate MDS (Metadata Server).

FSx for Lustre delivers up to hundreds of GB/s of throughput and millions of IOPS. Its key feature is **direct S3 integration**. Link an S3 bucket to the Lustre file system, and S3 objects appear transparently as Lustre files. An ML training job can access tens of TB of S3 data as if they were local files.

```
[ FSx for Lustre + S3 ML training pattern ]

S3 bucket (training data) ─── lazy load ──→ FSx for Lustre ──→ EC2 ML instances
                                              (POSIX API)          (parallel reads)
                    ←── export ─────────────────────────────────────────────
```

> 📚 **Case study**: Amazon SageMaker officially supports FSx for Lustre as a training data source. Store tens of TB of image data in S3 and serve it in parallel to many GPU instances through FSx for Lustre, and you can maximize GPU utilization with no data-loading bottleneck. Going through Lustre rather than reading directly from S3 can improve I/O throughput by more than 10×.

### FSx for NetApp ONTAP: NetApp On-Prem Extended to AWS

Many enterprises run NetApp ONTAP storage on-premises. When they migrate that data to AWS or run it hybrid, FSx for NetApp ONTAP is what lets them sync using the same protocol as NetApp SnapMirror (replication).

Supported protocols: NFS, SMB, iSCSI. In other words, it's a **multi-protocol file system** that Linux and Windows clients can access simultaneously. NetApp-native features like snapshots, replication, thin provisioning, deduplication, and compression are provided as-is.

> 💡 **Related theory**: ONTAP uses the WAFL (Write Anywhere File Layout) file system. WAFL, a patented structure NetApp developed in 1994, writes everything to a new location (no in-place overwrite) and can create snapshots in O(1). This is why NetApp snapshots are nearly instantaneous. It's similar to the COW (Copy-on-Write) principle of ZFS.

### FSx for OpenZFS: ZFS Ported to the Cloud

ZFS is a file system developed by Sun Microsystems in 2005, with built-in data-integrity guarantees (checksums), COW snapshots, compression, and deduplication. OpenZFS is the open-source fork that branched off after Oracle came to hold the ZFS patents.

FSx for OpenZFS is accessed from Linux clients over NFS. It suits workloads where data integrity and snapshot features matter (financial transaction records, medical imaging data), or scenarios migrating existing ZFS-based on-premises setups to AWS.

## Storage Comparison with Other Clouds

| AWS | GCP | Azure | Characteristic |
|-----|-----|-------|----------------|
| EBS | Persistent Disk | Azure Disk | Block, single VM |
| Instance Store | Local SSD | Temp Disk | Volatile local SSD |
| EFS | Filestore | Azure Files (NFS) | NFS share |
| FSx for Windows | N/A | Azure Files (SMB) | SMB + AD |
| FSx for Lustre | N/A | N/A | HPC parallel FS |
| FSx ONTAP | Google Cloud NetApp Volumes | Azure NetApp Files | NetApp managed |

GCP's Persistent Disk is similar to EBS, but Regional PD is synchronously replicated to two AZs. AWS EBS is by default replicated across multiple servers within a single AZ; Multi-AZ replication is not a native EBS feature but is handled by a higher-level service like RDS.

## Storage Gateway and DataSync: Hybrid Connectivity

**AWS Storage Gateway** is a virtual appliance you install on an on-premises server. Three modes:

- **File Gateway**: local file access over NFS/SMB, backed by S3 storage. Frequently used files are cached locally.
- **Volume Gateway**: presents iSCSI block volumes on-premises, backed up as EBS snapshots.
- **Tape Gateway**: looks like a physical tape library but actually stores to S3/Glacier.

**AWS DataSync** is a service for migrating or syncing file-system data from on-premises or another cloud to AWS. It supports NFS, SMB, S3, EFS, and FSx as source/destination. Parallel transfer delivers up to 10× faster copy speeds.

> ⚠️ **Pitfall**: With "on-premises → AWS file migration," the two services get confused. Storage Gateway suits **continuous hybrid operation** (a structure where you keep using AWS storage from on-premises); DataSync suits **one-time or periodic migration/sync** jobs. Also, DataSync is up to 10× faster than Storage Gateway.

## Cementing It with the CLI

```bash
# Convert a volume from gp2 to gp3 (no downtime)
aws ec2 modify-volume \
  --volume-id vol-1234567890abcdef0 \
  --volume-type gp3 \
  --iops 3000 \
  --throughput 125

# Create an EBS snapshot, then copy it to another region
SNAP_ID=$(aws ec2 create-snapshot --volume-id vol-xxx --query 'SnapshotId' --output text)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 \
  --source-snapshot-id $SNAP_ID \
  --destination-region us-east-1 \
  --description "DR copy"

# Create EFS (Elastic throughput, GeneralPurpose)
aws efs create-file-system \
  --performance-mode generalPurpose \
  --throughput-mode elastic \
  --encrypted \
  --tags Key=Name,Value=shared-efs

# Set an EFS Lifecycle Policy (move to IA after 30 days without access)
aws efs put-lifecycle-configuration \
  --file-system-id fs-12345678 \
  --lifecycle-policies TransitionToIA=AFTER_30_DAYS

# Create FSx for Lustre (with S3 integration)
aws fsx create-file-system \
  --file-system-type LUSTRE \
  --storage-capacity 1200 \
  --subnet-ids subnet-xxx \
  --lustre-configuration \
    DeploymentType=PERSISTENT_2,\
    PerUnitStorageThroughput=250,\
    ImportPath=s3://my-ml-data/training/,\
    ExportPath=s3://my-ml-data/checkpoints/

# Set EBS default encryption (account/region level)
aws ec2 enable-ebs-encryption-by-default --region ap-northeast-2
```

## Wrapping Up

Storage choice comes down to two dimensions. First, **access pattern**: single EC2 or many, block or file. Second, **persistence**: must the data be independent of the instance's lifetime?

EBS fits most single-EC2 workloads, and gp3 is the default choice. Instance Store is for when you need extreme performance and can tolerate data loss through replication — like caches and distributed-DB node disks. EFS is the answer for a Linux multi-client shared file system, and FSx is for when you need a specialized protocol or feature (Windows SMB+AD, HPC parallel processing, NetApp migration, ZFS integrity).

---

## 📝 연습 문제

**문제 1.** You have a database server currently using a gp2 EBS volume (500GB). You want to raise IOPS performance while also cutting cost. What is the most suitable action?

A) Grow the volume to 1TB to raise IOPS to 3,000
B) Convert to gp3 and set IOPS independently to 6,000
C) Convert to io2
D) Migrate to Instance Store

**정답: B**
해설: gp2 uses a size×3 IOPS model, so even at 1TB it caps at 3,000 IOPS. gp3 lets you set IOPS independently up to 16,000 regardless of size, and it's 20% cheaper than gp2. io2 is unnecessarily expensive, and gp3 solves this fully. Instance Store offers no persistence guarantee. The answer is B.

---

**문제 2.** Several Linux EC2 instances running across multiple AZs must share common configuration files and logs. The instance count may grow unpredictably. What is the most suitable storage?

A) EBS gp3 with Multi-Attach enabled
B) EFS Standard, Elastic throughput
C) FSx for Windows File Server
D) S3 + S3 FUSE mount

**정답: B**
해설: EBS Multi-Attach is possible only with io1/io2 types, and without a cluster file system, simultaneous writes from multiple instances corrupt the data. EFS, over NFSv4.1, can be mounted concurrently by multiple Linux instances across Multi-AZ and scales automatically. FSx for Windows uses the SMB protocol and is unsuitable for a default Linux mount. S3 FUSE doesn't fully support POSIX file-system semantics, so random writes like log writes run into problems.

---

**문제 3.** You are migrating data running on on-premises NetApp ONTAP storage to AWS. Both Linux and Windows servers must access the same file system, and you want to keep the on-premises NetApp's SnapMirror replication intact. What is the most suitable service?

A) Amazon EFS
B) FSx for Lustre
C) FSx for NetApp ONTAP
D) FSx for OpenZFS

**정답: C**
해설: FSx for NetApp ONTAP supports the NFS (Linux), SMB (Windows), and iSCSI multi-protocol set. It can sync with on-premises NetApp via SnapMirror, making migration and hybrid operation natural. EFS supports only NFS and can't do Windows SMB. FSx for Lustre is an HPC parallel file system. FSx for OpenZFS supports only NFS and has no NetApp-compatible features.

---

**문제 4.** An ML training team trains across many GPU instances using a 50TB image dataset stored in S3. Data loading has become the bottleneck for GPU utilization. What storage configuration should you add?

A) Switch EFS to Max I/O mode
B) Create FSx for Lustre and link it via S3 ImportPath
C) Attach an EBS gp3 volume to each GPU instance and copy the data
D) Enable S3 Transfer Acceleration

**정답: B**
해설: When you link an S3 bucket to FSx for Lustre as the ImportPath, S3 objects appear as POSIX files. Its parallel file-system architecture serves hundreds of GB/s of throughput to many GPU instances concurrently. EFS Max I/O has throughput but is far lower than Lustre for ML training data loading. EBS is independent per instance, so it can't be shared and incurs initial copy time. S3 Transfer Acceleration is for accelerating S3 uploads over the internet.

---

**문제 5.** For a single-EC2-based PostgreSQL database whose data must be preserved even if the instance terminates or is relocated unexpectedly, which storage is suitable for the boot volume and the data volume?

A) Instance Store (boot) + Instance Store (data)
B) EBS gp3 (boot) + EBS io2 (data)
C) EBS gp3 (boot) + Instance Store (data)
D) EFS (boot + data)

**정답: B**
해설: To preserve data even on instance termination/relocation, you need EBS. For the boot volume, gp3 is optimal on the cost/performance balance. The database data volume needs consistent low latency, so io2 is the fit. Using Instance Store as the data volume loses the data when the instance stops. EFS is a file system, not block storage, so it's unsuitable as PostgreSQL's boot volume or data directory.

---

**문제 6.** A company wants to migrate data from an on-premises file server to AWS S3. It needs to move 100TB of data as fast as possible, and new files keep being added on the on-premises server during the migration. Which service should it use?

A) AWS Storage Gateway File Gateway
B) AWS DataSync
C) AWS Direct Connect + manual rsync
D) S3 Multi-Part Upload script

**정답: B**
해설: DataSync moves large volumes of data quickly with parallel transfer and supports incremental sync, so it can handle files added during the migration too. It supports NFS/SMB sources with S3, EFS, and FSx as destinations. Storage Gateway File Gateway is a continuous hybrid-operation structure, not a one-time migration tool. Direct Connect + rsync carries heavy network-setup cost and manual management burden. An S3 Multi-Part Upload script has limited parallelism and requires you to implement incremental sync yourself.
