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

## 📝 연습 문제

**문제 1.** 글로벌 컨설팅 회사가 15개 지사에서 Windows 파일 서버를 운영한다. 직원이 본사와 지사에서 동일한 파일을 편집하며 Windows AD 그룹 정책으로 파일 접근을 제어한다. 지사 직원의 파일 접근 지연을 줄이고 중앙 백업을 AWS에서 관리하고 싶다. 적합한 AWS 솔루션은?

A) S3 File Gateway (각 지사에 배포)
B) FSx File Gateway (각 지사에 배포) + 중앙 FSx for Windows File Server
C) Storage Gateway Volume (Cached Mode) + AD 정책
D) DataSync로 일 1회 동기화

**정답: B**
해설: Windows AD ACL과 파일 잠금(동시 편집 충돌 방지)을 요구하는 환경에서 FSx File Gateway가 필요하다. 각 지사에 FSx File Gateway를 배포하면 자주 쓰는 파일이 로컬 캐시에 유지되어 지연이 낮고, 실제 데이터는 중앙 FSx for Windows File Server에 저장된다. AD 통합으로 기존 그룹 정책이 그대로 적용된다. S3 File Gateway(A)는 Windows ACL과 파일 잠금을 완전히 지원하지 않는다. Volume Gateway(C)는 블록 스토리지(iSCSI)이지 파일 공유 프로토콜(SMB)이 아니다. DataSync(D)는 배치 동기화로 실시간 파일 공유에 부적합하다.

---

**문제 2.** 방송사가 물리 LTO 테이프 4만 개로 30년치 방송 아카이브를 보관한다. 테이프 운반, 복원 시간(평균 3일), 관리 인력 비용이 문제다. 기존 NetBackup 소프트웨어를 그대로 유지하면서 클라우드로 이전하려 한다. 가장 적합한 솔루션은?

A) S3 File Gateway + S3 Glacier Deep Archive
B) Tape Gateway (VTL) + S3 Glacier Deep Archive
C) DataSync + Glacier
D) Snowball + S3

**정답: B**
해설: "기존 NetBackup 소프트웨어를 그대로 유지"가 핵심이다. Tape Gateway는 iSCSI VTL 인터페이스를 제공해 NetBackup이 물리 테이프처럼 인식한다. 소프트웨어 변경 없이 백업 job이 그대로 실행된다. 데이터는 S3 VTL에 저장되고 Archive 명령 시 Glacier Deep Archive로 이동한다. S3 File Gateway(A)는 NFS/SMB 파일 공유이지 VTL 인터페이스가 없어 NetBackup이 인식하지 못한다. DataSync(C)는 배치 전송으로 백업 소프트웨어 통합이 없다. Snowball(D)은 일회성 물리 데이터 이동으로 지속적인 백업에 부적합하다.

---

**문제 3.** 지방 의원이 의료 영상(DICOM) 총 80TB를 저장한다. 로컬 스토리지는 10TB만 있다. 최근 6개월 영상은 자주 접근하고 오래된 영상은 가끔만 접근한다. 온프레미스 PACS 시스템이 iSCSI로 스토리지에 접근한다. 비용 최적화하면서 로컬 스토리지 한계를 극복하는 방법은?

A) Volume Gateway Stored Mode
B) Volume Gateway Cached Mode
C) S3 File Gateway
D) FSx File Gateway

**정답: B**
해설: iSCSI 접근 방식이므로 Volume Gateway가 필요하다(C, D는 파일 프로토콜). Cached Mode는 주 저장소를 S3로 두고 로컬에는 자주 쓰는 데이터만 캐시로 유지한다. 10TB 로컬로 80TB 전체를 처리할 수 있다. 최근 6개월 영상이 10TB 이하라면 캐시 히트율이 높아 지연도 낮다. Stored Mode(A)는 전체 데이터(80TB)를 로컬에 저장해야 하므로 10TB 로컬로는 불가능하다.

---

**문제 4.** 온프레미스에서 3개월치 로그 파일(2TB)을 S3로 이전한다. 이전 후에는 온프레미스 시스템이 계속 S3에 새 로그를 저장해야 한다. 가장 적합한 조합은?

A) DataSync로 초기 3TB 이전 + Storage Gateway(S3 File Gateway)로 이후 상시 저장
B) Snowball로 초기 이전 + Storage Gateway
C) Storage Gateway만으로 전체 진행
D) DataSync만 사용 (매일 정기 실행)

**정답: A**
해설: 두 단계 요구사항이 있다: (1) 기존 2TB 빠른 이전, (2) 이후 지속적 로그 저장. DataSync는 NFS/SMB 소스를 S3로 빠르고 효율적으로 전송하는 배치 도구다(초기 마이그레이션). S3 File Gateway는 온프레미스 시스템이 NFS로 마운트해 지속적으로 파일을 쓸 수 있는 상시 솔루션이다(이후 운영). 이 두 가지를 조합하는 것이 마이그레이션 + 지속 운영의 표준 패턴이다. Storage Gateway만으로(C) 초기 2TB를 이전하면 느리고 비효율적이다. DataSync만으로(D) 지속적 실시간 쓰기가 불가능하다.

---

**문제 5.** S3 File Gateway를 사용하는 온프레미스 서버가 업로드한 파일이 같은 버킷을 쓰는 다른 사이트의 S3 File Gateway에서 바로 보이지 않는다. 원인과 해결책은?

A) S3 강력한 일관성 문제 — 잠시 기다리면 해결됨
B) 각 게이트웨이가 독립 캐시를 유지하므로 캐시 무효화(RefreshCache) 필요
C) S3 버킷 정책 문제 — 교차 계정 접근 허용 필요
D) NFS 버전 불일치 — NFS v4.1로 통일

**정답: B**
해설: S3 File Gateway는 각 사이트에서 독립적인 로컬 캐시를 운영한다. 사이트 A의 게이트웨이가 파일을 S3에 업로드해도 사이트 B의 게이트웨이는 자신의 캐시에 그 정보가 없어 파일이 보이지 않는다. RefreshCache API를 호출하거나 S3 이벤트 알림 → Lambda → RefreshCache를 자동화하면 해결된다. S3는 2020년 12월부터 강력한 일관성을 제공하므로 일관성 자체는 문제가 아니다(A 오답). 버킷 정책(C)은 접근 권한 문제이지 가시성 지연 문제가 아니다. NFS 버전(D)은 관련 없다.

---

**문제 6.** Storage Gateway(S3 File)와 DataSync 중 온프레미스 파일 서버를 AWS로 최종 이전(마이그레이션)하기 위한 일회성 대량 복사에 더 적합한 서비스는?

A) Storage Gateway S3 File Gateway
B) AWS DataSync
C) 두 서비스 모두 동일하게 적합
D) AWS Transfer Family

**정답: B**
해설: DataSync는 대량 데이터의 고속 배치 전송에 최적화되어 있다. 네트워크 가속, 병렬 처리, 체크섬 검증, 변경 파일만 전송하는 증분 동기화를 지원한다. 1Gbps DX 환경에서 DataSync가 일반 cp 또는 Storage Gateway보다 30% 이상 높은 실효 처리량을 달성한다. Storage Gateway(A)는 상시 하이브리드 접근을 위한 서비스이고, 대량 일회성 전송보다 일상 운영에 최적화되어 있다. Transfer Family(D)는 SFTP/FTP 엔드포인트 제공 서비스로 마이그레이션 도구가 아니다.
