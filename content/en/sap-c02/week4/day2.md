# Day 2 - Storage Gateway 4 Types Comparison: Extending On-Premises Storage to the Cloud

The most immediate practical challenge in integrating on-premises infrastructure with AWS cloud is storage. Legacy systems read and write data using traditional protocols like NFS, SMB, iSCSI, and tape drives. The core role of AWS Storage Gateway is to enable these systems to silently use cloud storage (S3, Glacier) in the background without modification. Storage Gateway transparently converts on-premises application writes into S3 objects, EBS snapshots, and Glacier archives. Today we deeply understand the internal workings of each of the 4 types of gateways, their caching mechanisms, and usage scenarios.

## Storage Gateway Deployment Models: Virtual Appliance

Storage Gateway is deployed on-premises as a **virtual appliance (VM)** or **hardware appliance**. Deploy an OVA image to VMware ESXi, Microsoft Hyper-V, KVM, or Linux KVM environments, or use a dedicated hardware appliance sold by AWS (based on Dell EMC PowerEdge).

Two types of disks are attached to the virtual appliance. **Cache disk**: Stores local cache data. **Upload buffer disk**: Temporarily stores data before transmission to AWS. Sizing these two disks is the critical parameter determining Storage Gateway performance.

> 💡 **Related Theory**: Storage Gateway caching is based on the **LRU (Least Recently Used)** algorithm. The most recently accessed data remains in cache, and when the cache fills, the least recently accessed data is evicted. This is grounded in the principle of Locality of Reference. If frequently used files remain in cache, they can be accessed at local speed without cloud round-trips. The key is designing cache disks so the working set (frequently used data) fits within the cache size.

Network connectivity is maintained via the internet or DX through HTTPS to the Storage Gateway service endpoint in an AWS region. Using DX improves large file transfer performance with consistent bandwidth and latency.

## S3 File Gateway: Transparently Converting Files to S3 Objects

S3 File Gateway provides NFS (v3, v4.1) and SMB (v2, v3) mount points, converting file writes/reads into S3 GetObject/PutObject API calls. From the on-premises server's perspective, it appears as a regular file system, but data actually stores in an S3 bucket.

```
[On-Premises Server]
  cp video.mp4 /mnt/media-share/2024/video.mp4
        │
        ↓ NFS write
  [Storage Gateway VM]
    Stored in cache
    Moved to upload buffer
        │
        ↓ HTTPS PutObject
  [S3 Bucket]
    s3://company-media/2024/video.mp4
    Metadata: Content-Type, Last-Modified, ETag, etc.
        │
        ↓ S3 Lifecycle rules
    After 30 days → S3 Standard-IA
    After 90 days → Glacier Instant Retrieval
```

A key characteristic of S3 File Gateway is that files are stored as **native S3 objects**. You can access the same objects directly through S3 API, S3 console, Athena, EMR without going through the gateway. This is particularly valuable for building data lakes. When on-premises systems write files, they automatically become raw data in the S3 data lake.

> 🔍 **Deeper Dive**: When S3 File Gateway converts a file to an S3 object, file system metadata (owner, permissions, timestamps) is stored in the S3 object's custom metadata (x-amz-meta-*). This metadata is later used to restore file permissions when the file is read back to on-premises. Because NFS and SMB permission models differ, S3 File Gateway preserves either POSIX permissions (NFS) or Windows ACLs (SMB) as metadata depending on the mount protocol.

**S3 File Gateway Multi-Site Considerations**: When multiple sites share the same S3 bucket, files written by one gateway may not immediately appear in another. Each gateway maintains its own independent cache. To solve this, you must trigger cache invalidation (RefreshCache API) via S3 event notifications or Lambda.

> ⚠️ **Pitfall**: When multiple on-premises sites write to the same bucket through S3 File Gateway, concurrent write conflicts can occur. While S3 supports Strong Consistency since December 2020, the caching layer in Storage Gateway means simultaneous file modifications by two gateways result in the last write overwriting the previous write. In environments requiring concurrent editing, FSx for Windows File Server + FSx File Gateway is safer (supports NTFS locking mechanisms).

## FSx File Gateway: Cloud Extension of Windows File Shares

FSx File Gateway is a specialized solution for on-premises Windows environments. When on-premises servers mount the gateway via SMB, the gateway maintains frequently used files in local cache while actual data stores in AWS FSx for Windows File Server.

```
[On-Premises Windows PC]
  \\gateway-ip\share → Returns immediately if local cache hit
                     → Fetches from FSx for Windows on cache miss and updates cache
        │
        ↓ SMB v2/v3
  [Storage Gateway VM]
    Preserves Windows ACL, NTFS metadata
    AD integration (domain join)
        │
        ↓ Sync
  [FSx for Windows File Server]
    AWS-managed Windows file server
    Multi-AZ availability
    VSS (Volume Shadow Copy) backup
```

> 💡 **Related Theory**: The core of the SMB (Server Message Block) protocol is the **file locking** mechanism. When multiple clients access the same file simultaneously on a Windows file share, NTFS OpLock (Opportunistic Lock) negotiates caching rights. FSx File Gateway correctly implements this locking mechanism to prevent concurrent edit conflicts. Unlike S3 File Gateway, which relies on S3's object model (no locking), FSx File Gateway maintains true Windows file system semantics.

The decisive difference between FSx File Gateway and S3 File Gateway: **Active Directory integration** and **NTFS ACL preservation**. In environments where file access is controlled by AD group policies, migrating to S3 File Gateway breaks this permission system. FSx File Gateway supports domain join, so existing AD policies apply directly.

## Volume Gateway: Cloud Extension of Block Storage

Volume Gateway provides block storage volumes to on-premises servers via iSCSI (Internet Small Computer Systems Interface) protocol. Servers can format these volumes like regular disks and mount file systems on them.

> 💡 **Related Theory**: iSCSI (RFC 7143) is a protocol for transmitting SCSI commands over TCP/IP networks. Just as physical disks are written via SCSI commands, remote storage is accessed via iSCSI. An Initiator (client, on-premises server) sends SCSI commands to a Target (server, Storage Gateway), which processes block I/O and returns results. Thanks to this abstraction, the operating system treats iSCSI volumes identically to local disks.

### Cached Mode vs Stored Mode

**Cached Mode**: Primary storage is S3, and only frequently used data is cached locally.
- Local disk needed only for cache → handle large data volumes with small local storage
- Data stored in S3 automatically converts to EBS snapshots, making AWS data recovery easy
- Cache misses incur latency fetching data from S3

**Stored Mode**: All data is stored locally and asynchronously backed up to S3.
- All data on local disk → lowest latency
- Data is limited to local disk size
- S3 backup is stored as EBS snapshots, enabling DR recovery to EC2 as EBS

| Item | Cached Mode | Stored Mode |
|------|-------------|-------------|
| Primary Storage | S3 | Local disk |
| Local Role | Cache (frequently used data) | Primary storage |
| Latency | Cache hit: low / Cache miss: high | Always low (local disk) |
| Local Disk Size | Can be small | Must fit all data |
| DR Recovery Method | S3 → EBS snapshot restore | S3 async backup → EBS restore |

> 🎯 **Scenario**: A regional hospital operates a medical imaging system (PACS). Total imaging data is 50TB, but local storage is only 5TB. Images from the last 3 months (frequently viewed) must be accessed quickly, and older images can be in S3. Using Volume Gateway Cached Mode, 5TB of cache serves recent images at local speed, while the remaining 45TB is fetched from S3 when needed. S3 data automatically converts to EBS snapshots for immediate EC2 restoration during DR.

## Tape Gateway: Virtual Tape Library

For decades, tape drives were the enterprise backup standard. Backup software like Veeam, Veritas NetBackup, CommVault, and IBM Spectrum Protect record data to tape drives through iSCSI VTL (Virtual Tape Library) interfaces. Tape Gateway makes this backup software recognize AWS as tape.

```
[Backup Server: Veeam/NetBackup]
  Execute backup job to tape via iSCSI VTL interface
        │
        ↓ iSCSI (VTL protocol)
  [Tape Gateway VM]
    Virtual tape media emulation
        │
        ↓ Tape write complete
  [S3 Bucket] - Virtual Tape Library (tapes in current use)
        │
        ↓ Tape archive command
  [S3 Glacier Deep Archive] - Virtual Tape Shelf (archived tapes)
        │
        Restore: Retrieve Glacier tape → Restore to S3 → Restore in backup SW
```

> 📚 **Case Study**: A broadcast company stored 20 years of content on 60,000 physical tapes. Personnel costs for tape transport, retrieval, and restoration reached hundreds of millions of won annually. After switching to Tape Gateway, all backups store in S3 and Glacier Deep Archive without physical tape transport, maintaining existing Veeam backup software. Tape restoration time shortened from days to hours, and physical tape repurchase costs disappeared.

**Tape Gateway Cost Model**: S3 Virtual Tape Library storage cost + Glacier Deep Archive storage cost (per GB $0.00099) + retrieval cost. GB-level cost is lower than physical tape, and retrieval is much faster.

> 🔍 **Deeper Dive**: Tape Gateway virtual tape sizes can be configured from 100GB to 5TB. They emulate tape sizes based on physical tape drive types (LTO-5 through LTO-9). Configuring backup software to use larger tapes reduces tape count, simplifying management. Virtual tape "eject" and "archive" commands are implemented as S3 → Glacier Deep Archive migration.

## Storage Gateway vs DataSync vs Transfer Family

Clarifying the differences between these three often-confused services.

| Service | Purpose | Usage Pattern | Protocol |
|--------|---------|-----------|----------|
| Storage Gateway | Continuous hybrid storage access | On-premises app continuously uses cloud storage | NFS, SMB, iSCSI, VTL |
| DataSync | One-time/periodic data synchronization | Migration, periodic backup, large transfers | NFS, SMB, S3, EFS, FSx |
| Transfer Family | SFTP/FTP/FTPS endpoint provision | External partners upload to S3/EFS via SFTP | SFTP, FTP, FTPS, AS2 |

> 💡 **Related Theory**: DataSync is an agent-based service executing transfer tasks (Task). The agent scans the source (on-premises NFS/SMB), calculates differences with the destination (S3, EFS, FSx), and transfers only changed files. Through parallel transfer and network acceleration, it achieves approximately 30% higher effective throughput on 1Gbps DX environments. If Storage Gateway is "always-on mount," DataSync is "efficient batch transfer." The typical pattern is to stop the DataSync agent after migration completion and maintain only Storage Gateway.

## Comparison with Other Clouds

| Item | AWS Storage Gateway | GCP Storage Transfer Service | Azure File Sync |
|------|--------------------|-----------------------------|----------------|
| Always-on Mount | Supported (NFS/SMB/iSCSI) | Not supported (batch transfer) | Supported (SMB) |
| File→Object | S3 File Gateway | - | Not available (separate Azure Blob) |
| Windows AD Integration | FSx File Gateway | - | Azure AD integration |
| Tape Emulation | Tape Gateway | - | Azure Import/Export |
| Block Storage | Volume Gateway | - | Separate Azure Disk |

> 📚 **Case Study**: A global media group built a hybrid editing workflow between on-premises and AWS. Original video files stored on NAS mount via S3 File Gateway so AWS editing systems access directly via S3 API. Completed videos automatically archive via S3 Lifecycle. Simultaneously, editing project files (Adobe Premiere, Avid) share between on-premises editing rooms and AWS cloud editing workstations via FSx File Gateway. Windows domain file locking works correctly, enabling conflict-free collaboration.

## Hands-On CLI: Storage Gateway Configuration

```bash
# Activate Storage Gateway
aws storagegateway activate-gateway \
  --activation-key XXXXX-XXXXX-XXXXX-XXXXX-XXXXX \
  --gateway-name "Seoul-FileGateway" \
  --gateway-timezone "GMT+9:00" \
  --gateway-region ap-northeast-2 \
  --gateway-type FILE_S3

# Configure local disk as cache
aws storagegateway add-cache \
  --gateway-arn arn:aws:storagegateway:ap-northeast-2:ACCT:gateway/sgw-xxx \
  --disk-ids /dev/sdb

# Create S3 File Share (NFS)
aws storagegateway create-nfs-file-share \
  --client-token "unique-token-123" \
  --gateway-arn arn:aws:storagegateway:...:gateway/sgw-xxx \
  --role "arn:aws:iam::ACCT:role/StorageGatewayS3Role" \
  --location-arn "arn:aws:s3:::company-media-bucket" \
  --default-storage-class S3_STANDARD \
  --squash RootSquash \
  --nfs-file-share-defaults '{"FileMode":"0666","DirectoryMode":"0777","GroupId":0,"OwnerId":0}'

# Volume Gateway - Create Cached Volume
aws storagegateway create-cachedi-scsi-volume \
  --gateway-arn arn:aws:storagegateway:...:gateway/sgw-yyy \
  --volume-size-in-bytes 107374182400 \  # 100GB
  --target-name TargetA \
  --network-interface-id 10.0.1.100 \
  --client-token "unique-token-456"

# Tape Gateway - Create Virtual Tape
aws storagegateway create-tapes \
  --gateway-arn arn:aws:storagegateway:...:gateway/sgw-zzz \
  --tape-size-in-bytes 107374182400 \  # 100GB
  --tape-barcode-prefix AMZN \
  --num-tapes-to-create 5
```

The essence of Storage Gateway is "same protocol on-premises, cloud backend only." On-premises applications can be unchanged while immediately leveraging cloud storage's cost efficiency, availability, and scalability. The key judgment criteria for Storage Gateway problems in SAP-C02 are the protocol (NFS/SMB/iSCSI/VTL), AD integration requirements, and whether access is continuous or one-time transfer.

---

## 📝 Practice Questions

**Question 1.** A global consulting firm operates Windows file servers at 15 branch offices. Employees edit the same files at headquarters and at branches, and file access is controlled by Windows AD group policy. The firm wants to reduce file access latency for branch employees and manage central backups in AWS. What is an appropriate AWS solution?

A) S3 File Gateway (deployed at each branch)
B) FSx File Gateway (deployed at each branch) + central FSx for Windows File Server
C) Storage Gateway Volume (Cached Mode) + AD policy
D) Synchronize once a day with DataSync

**Answer: B**
Explanation: In an environment that requires Windows AD ACLs and file locking (to prevent concurrent-edit conflicts), FSx File Gateway is needed. Deploying FSx File Gateway at each branch keeps frequently used files in the local cache for low latency, while the actual data is stored in the central FSx for Windows File Server. With AD integration, the existing group policy applies as is. S3 File Gateway (A) does not fully support Windows ACLs and file locking. Volume Gateway (C) is block storage (iSCSI), not a file sharing protocol (SMB). DataSync (D) is batch synchronization and is unsuitable for real-time file sharing.

---

**Question 2.** A broadcaster keeps 30 years of broadcast archives on 40,000 physical LTO tapes. Tape transport, restore time (3 days on average), and administrative staffing costs are problems. It wants to migrate to the cloud while keeping its existing NetBackup software as is. What is the most appropriate solution?

A) S3 File Gateway + S3 Glacier Deep Archive
B) Tape Gateway (VTL) + S3 Glacier Deep Archive
C) DataSync + Glacier
D) Snowball + S3

**Answer: B**
Explanation: "Keep the existing NetBackup software as is" is the key. Tape Gateway provides an iSCSI VTL interface so NetBackup recognizes it like physical tapes. Backup jobs run as they are with no software changes. Data is stored in the S3 VTL and moves to Glacier Deep Archive on an Archive command. S3 File Gateway (A) is an NFS/SMB file share without a VTL interface, so NetBackup does not recognize it. DataSync (C) is batch transfer with no backup software integration. Snowball (D) is a one-time physical data move and is unsuitable for ongoing backups.

---

**Question 3.** A regional clinic stores a total of 80 TB of medical images (DICOM). Local storage is only 10 TB. Images from the last 6 months are accessed frequently, and older images are accessed only occasionally. The on-premises PACS system accesses storage over iSCSI. How can you overcome the local storage limit while optimizing cost?

A) Volume Gateway Stored Mode
B) Volume Gateway Cached Mode
C) S3 File Gateway
D) FSx File Gateway

**Answer: B**
Explanation: Because access is through iSCSI, Volume Gateway is required (C and D are file protocols). Cached Mode keeps the primary storage in S3 and keeps only frequently used data locally as a cache. 10 TB of local storage can handle the whole 80 TB. If the last 6 months of images are 10 TB or less, the cache hit rate is high and latency is low. Stored Mode (A) must store the entire data set (80 TB) locally, which is impossible with 10 TB of local storage.

---

**Question 4.** You are moving 3 months of log files (2 TB) from on premises to S3. After the move, the on-premises systems must keep storing new logs in S3. What is the most appropriate combination?

A) DataSync for the initial 3 TB transfer + Storage Gateway (S3 File Gateway) for ongoing storage afterward
B) Snowball for the initial transfer + Storage Gateway
C) Do everything with Storage Gateway only
D) Use DataSync only (scheduled to run daily)

**Answer: A**
Explanation: There are two stages of requirements: (1) a fast transfer of the existing 2 TB, and (2) continuous log storage afterward. DataSync is a batch tool that transfers NFS/SMB sources to S3 quickly and efficiently (initial migration). S3 File Gateway is an always-on solution that on-premises systems can mount over NFS and write files to continuously (ongoing operation). Combining the two is the standard pattern for migration plus ongoing operation. Transferring the initial 2 TB with Storage Gateway alone (C) is slow and inefficient. DataSync alone (D) cannot do continuous real-time writes.

---

**Question 5.** Files uploaded by an on-premises server using an S3 File Gateway do not appear immediately in the S3 File Gateway at another site that uses the same bucket. What are the cause and the solution?

A) An S3 strong consistency issue — it resolves itself after waiting a moment
B) Each gateway maintains an independent cache, so cache invalidation (RefreshCache) is needed
C) An S3 bucket policy issue — cross-account access must be allowed
D) NFS version mismatch — standardize on NFS v4.1

**Answer: B**
Explanation: S3 File Gateway runs an independent local cache at each site. Even if the gateway at site A uploads a file to S3, the gateway at site B does not have that information in its own cache, so the file does not appear. This is solved by calling the RefreshCache API or by automating S3 event notification → Lambda → RefreshCache. Since December 2020 S3 provides strong consistency, so consistency itself is not the problem (A is wrong). A bucket policy (C) is an access permission issue, not a visibility delay issue. The NFS version (D) is irrelevant.

---

**Question 6.** Between Storage Gateway (S3 File) and DataSync, which service is more suitable for a one-time bulk copy to finally migrate an on-premises file server to AWS?

A) Storage Gateway S3 File Gateway
B) AWS DataSync
C) Both services are equally suitable
D) AWS Transfer Family

**Answer: B**
Explanation: DataSync is optimized for high-speed batch transfer of large amounts of data. It supports network acceleration, parallel processing, checksum verification, and incremental synchronization that transfers only changed files. In a 1 Gbps DX environment, DataSync achieves an effective throughput more than 30% higher than a plain cp or Storage Gateway. Storage Gateway (A) is a service for ongoing hybrid access and is optimized for day-to-day operation rather than one-time bulk transfer. Transfer Family (D) is a service that provides SFTP/FTP endpoints and is not a migration tool.
