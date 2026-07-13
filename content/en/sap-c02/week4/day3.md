# Day 3 - Snow Family and Large-Scale Data Transfer: The Moment Physics Beats the Internet

In 1988, computer scientist Andrew Tanenbaum left us with a famous quote: "Never underestimate the bandwidth of a station wagon full of magnetic tape driving down the highway." Thirty years later, this principle remains valid. Transferring 1PB over a 100Mbps internet connection takes approximately 926 days (2.5 years). Distributing it across 12.5 AWS Snowball Edge devices and sending via FedEx takes 2 weeks. A clear threshold exists where physical data movement overwhelms the internet, and Snow Family is the solution beyond that point. Today we cover Snow Family equipment characteristics, internal security architecture, selection criteria versus DataSync and Storage Gateway, and edge computing applications at SAP-C02 depth.

## Snow Family Background: Limits of Network Bandwidth

Early in cloud migration, projects failed attempting to transfer everything over the network. Enterprises with petabyte-scale data, even with 10Gbps DX, required 22-30 days in practice to transfer 1PB (11 days theoretically). Network instability during transfer made it even longer. Some environments like maritime, remote regions, and military areas made stable network connections impossible.

> 💡 **Related Theory**: Physical data movement efficiency is calculated through **simple comparison**. Effective throughput = nominal bandwidth × efficiency (usually 50-70%). Effective throughput of a 100Mbps line ≈ 50-70Mbps. Transferring 1TB at 100Mbps effective ≈ 22 hours. 1PB ≈ 2,200 hours = 92 days. Shipping the same 1PB via 13 Snowball Edges (each 80TB) takes approximately 2 weeks round-trip. This threshold is approximately the 10TB/100Mbps combination. With 1Gbps connection, the threshold moves to 100TB.

AWS Snow Family was first announced at re:Invent 2015. Initially a simple data movement device, it evolved to include edge computing (EC2, Lambda execution), GPU options (ML inference), and miniaturization (Snowcone).

## Snow Family 3 Types Comparison

### Snowcone: The Smallest Edge Device

```
Weight: 4.5 pounds (2.1kg)
Size: Like a small book
Capacity: 8TB HDD or 14TB SSD (Snowcone SSD)
Computing: 2 vCPU, 4GB RAM
Power: USB-C charging or battery
```

Snowcone fits in drones, vehicles, and backpacks. It's designed for collecting small amounts of data and running limited computing in disaster sites, remote regions, and military operations. Battery operation enables use in environments without power infrastructure.

**Built-in DataSync Agent**: Snowcone comes with DataSync agent pre-installed. When network connectivity is restored, Snowcone automatically synchronizes collected data to S3. Both physical shipping to AWS and network transmission are possible.

### Snowball Edge: Mainstream Data Movement Device

```
Weight: Approximately 22kg
Size: Industrial case
Capacity: 80TB (Storage Optimized) / 28TB (Compute Optimized)
Computing:
  - Storage Optimized: 40 vCPU, 80GB RAM, 1TB NVMe SSD
  - Compute Optimized: 104 vCPU, 416GB RAM, 28TB NVMe SSD, optional GPU
Power: Standard industrial power outlet
```

> 🔍 **Deeper Dive**: Snowball Edge internally includes Nitro-based computing nodes. The 104 vCPU in Compute Optimized is hyperthreading of 52 physical cores. The GPU option (NVIDIA V100 Tensor Core) runs ML inference, video analysis, and image processing on-site. This GPU performance is equivalent to AWS us-east-1 p3.2xlarge EC2 instances.

**Snowball Edge Cluster**: Multiple Snowball Edge units configured as a cluster distribute data storage, protecting against single device failure. Clustering up to 16 units is possible.

### Snowmobile: Exabyte-Scale — Discontinued in 2024

Snowmobile is a 45-foot truck-mounted 100PB storage container. Power is supplied by mobile generators, and GPS tracking, security staff, and 24-hour monitoring protect data. Real deployments were very limited, and practical large-scale cloud migration showed that parallel Snowball use is more practical than Snowmobile, leading to its 2024 discontinuation.

> 📚 **Case Study**: When Netflix migrated to AWS in 2016, it physically moved dozens of PB of media content. This was just before Snowmobile announcement, so they actually used multiple Snowballs in parallel. Each Snowball 80TB × 12 in parallel = 960TB/batch. Multiple batches over weeks completed the migration. This experience informed Snowball Edge development requirements.

## Snow Equipment Security Architecture

Since Snow Family equipment physically moves customer data, security against loss and theft is critical.

**Encryption**: All data receives **256-bit AES** encryption before being written to the device. Encryption keys are managed by AWS KMS; devices store only **encrypted key material**, not keys themselves. Decryption keys are restored only when the device returns to AWS data centers and connects to KMS servers.

**Tamper-Evident Design**: Device cases have built-in physical tampering detection. If the case is opened abnormally, internal security chips automatically destroy encryption keys.

**NIST 800-88 Data Erasure**: After AWS completes S3 import, AWS erases device data according to NIST SP 800-88 standards before device reuse. This standard is officially recognized by the U.S. government for sensitive data erasure procedures.

> 💡 **Related Theory**: NIST SP 800-88 "Guidelines for Media Sanitization" defines three erasure levels. **Clear**: simple overwrite (software). **Purge**: cryptographic erasure or block erasure (hardware command). **Destroy**: physical destruction (crushing, incineration). Snow equipment uses Purge-level cryptographic erasure. Deleting keys for AES-256 encrypted data makes it theoretically irrecoverable.

## Snow Edge Computing: AWS API Without Network

Snowball Edge's true differentiator is running EC2 and Lambda directly on the device. This means AWS API code can run unmodified even in disconnected environments.

```
[Snowball Edge on Ship]
  AWS CLI: aws s3 cp sensor.data s3://local-bucket/  ← save to local S3
  EC2 running: Real-time ship sensor data analysis Lambda
  Upon port arrival: Transfer collected data → AWS
```

**Supported AWS Services (Local)**:
- EC2 (AMI-based instances)
- AWS Lambda (Python, Node.js)
- AWS IoT Greengrass
- Amazon SageMaker Edge
- Amazon EKS Anywhere
- S3-compatible storage API

> 🎯 **Scenario**: An offshore oil platform collects real-time data from hundreds of sensors. Satellite internet (VSAT) is limited to 5Mbps, making real-time transmission of all sensor data impossible. Deploying Snowball Edge Compute Optimized on the platform enables local EC2 and Lambda to analyze sensor data in real-time, detecting only anomaly patterns. Anomaly detection results (small data) transmit immediately via VSAT, while raw sensor data accumulates on Snowball for physical transmission to AWS when supply ships arrive.

## Data Transfer Method Selection Guide

The decision tree for the most common SAP-C02 problem: "Which data transfer method should we use?"

```
Is it database migration?
  └── YES → AWS DMS (Database Migration Service)

Are you migrating servers themselves (Lift and Shift)?
  └── YES → AWS MGN (Application Migration Service)

Is it file/object data transfer?
  ├── Does network bandwidth suffice? (1Gbps+ AND data <100TB)
  │   └── YES → AWS DataSync
  ├── Is network limited OR data very large OR physically isolated environment?
  │   └── YES → AWS Snow Family
  └── Do you continuously mount cloud storage from on-premises?
      └── YES → AWS Storage Gateway
```

**Network vs Snow Breakeven Calculation**:
```
Breakeven = Data size (TB) ÷ (Line speed (Gbps) × 86400 × days / 8 / 1024)

Example: 500TB data, 100Mbps line:
Effective speed = 100Mbps × 0.6 = 60Mbps = 0.06Gbps
500TB / (0.06 × 86400 / 8 / 1024 × time units) ≈ 926 hours ≈ 38 days

Snow (7 Snowballs × 80TB = 560TB):
Shipping + data loading + return + AWS import ≈ 14-21 days

→ Snow is 2x faster
```

> 📚 **Case Study**: South Korea's meteorological agency migrated 30 years of weather radar data (approximately 2PB) from on-premises to AWS S3. Only 20% of the existing 10Gbps internal line was available for migration, resulting in effective 2Gbps. Transferring 2PB at 2Gbps = approximately 23 days (theory) + retransmission allowance = approximately 40 days. 26 Snowball Edges in 4 batches completed in approximately 3 weeks. A hybrid pattern using DataSync for subsequent new data synchronization was employed.

## DataSync Deep Dive: More Than Simple Copying

DataSync is not a simple file copy tool. It includes multiple features needed for enterprise-grade data transfer.

**Automatic Integrity Verification**: Calculates checksums for all transferred files, verifying data matches exactly between source and destination. Automatically detects and retransmits data corrupted by network errors.

**Parallel Transfer**: A single DataSync task uses multithreading to transfer multiple files simultaneously. Effective throughput of DataSync on 1Gbps DX is 30-50% higher than simple cp commands.

**Incremental Transfer**: Only retransmits changed files from those previously transferred. Greatly reduces transfer time and costs in periodic backups and DR synchronization.

**Supported Sources/Destinations**: On-premises NFS, SMB, HDFS ↔ AWS S3, EFS, FSx for Windows, FSx for Lustre, FSx for NetApp ONTAP. Transfers between AWS services (S3 → EFS) also supported.

> 🔍 **Deeper Dive**: DataSync agents deploy on-premises as VMware/KVM/Hyper-V virtual machines. Agents scan source (NFS/SMB) file systems and detect changes using mechanisms similar to inotify (Linux file system event notification API). Agents are centrally managed by AWS, with transfer job status, throughput, and errors monitorable via AWS console.

## AWS Transfer Family: SFTP Endpoint Service

Clarifying Transfer Family among data transfer services to avoid confusion.

**Transfer Family provides AWS-managed SFTP/FTP/FTPS/AS2 servers**. The core use case is external partners (vendors, customers) uploading/downloading files to S3 or EFS via SFTP.

```
External vendor → SFTP client → Transfer Family endpoint → S3/EFS
```

Unlike internal migration tools (DataSync) or always-on mount tools (Storage Gateway), Transfer Family is **a standard for file exchange with external partners**.

## Comparison with Other Clouds

| Item | AWS Snow Family | GCP Transfer Appliance | Azure Data Box |
|------|----------------|------------------------|----------------|
| Minimum Capacity | 8TB (Snowcone) | 40TB | 8TB |
| Maximum Capacity | 80TB (Snowball) | 480TB | 120TB (Data Box Heavy) |
| Edge Computing | Supported (EC2, Lambda) | Not supported | Limited |
| Security Erasure | NIST 800-88 | Erasure certificate | NIST 800-88 |
| GPU Option | Snowball Compute (V100) | None | None |
| Pricing Model | Device usage day × daily rate | Usage period charge | Usage period charge |

## Hands-On CLI: Creating Snow Jobs and Loading Data

```bash
# Create Snowball Edge Job (CLI)
aws snowball create-job \
  --job-type IMPORT \
  --resources '{"S3Resources":[{"BucketArn":"arn:aws:s3:::migration-bucket","KeyRange":{}}]}' \
  --description "Production Data Migration 2024" \
  --address-id ADID123456789 \
  --kms-key-arn "arn:aws:kms:us-east-1:ACCT:key/KEY-ID" \
  --role-arn "arn:aws:iam::ACCT:role/SnowballRole" \
  --snowball-type EDGE_STORAGE_OPTIMIZED \
  --shipping-option SECOND_DAY

# After device arrival: load data via device's local S3 API
# 1. Unlock device with Snowball Edge client
snowballEdge unlock-device \
  --endpoint https://192.168.1.5 \
  --manifest-file /path/to/snowball_manifest.bin \
  --unlock-code UNLOCK-CODE

# 2. Get local credentials
snowballEdge list-access-keys \
  --endpoint https://192.168.1.5 \
  --manifest-file /path/to/manifest.bin \
  --unlock-code UNLOCK-CODE

# 3. Upload data to local S3 API (using device's local IP)
aws s3 cp /data/large-file.tar s3://local-bucket/ \
  --endpoint-url http://192.168.1.5:8080 \
  --region snow

# 4. Large-scale: multipart upload + parallel processing
aws s3 cp /data/ s3://local-bucket/ \
  --recursive \
  --endpoint-url http://192.168.1.5:8080 \
  --region snow \
  --sse aws:kms

# Set up periodic synchronization with DataSync
aws datasync create-task \
  --source-location-arn arn:aws:datasync:ap-northeast-2:ACCT:location/loc-src \
  --destination-location-arn arn:aws:datasync:ap-northeast-2:ACCT:location/loc-dst \
  --name "Weekly-Backup-Task" \
  --schedule '{"ScheduleExpression":"cron(0 1 ? * SUN *)"}' \
  --options '{"VerifyMode":"ONLY_FILES_TRANSFERRED","TransferMode":"CHANGED"}'
```

Snow Family and DataSync are complementary, not competitive services. The most common pattern uses Snow for large-scale initial migration and DataSync for subsequent ongoing incremental synchronization. The judgment criteria for this combination in SAP-C02 are three: bandwidth size, data size, and transfer one-time vs. repetitive.

---

## 📝 연습 문제

**문제 1.** 헬스케어 기업이 15년치 의료 영상 데이터 800TB를 온프레미스에서 AWS S3로 이전해야 한다. 데이터센터의 AWS DX 회선은 1Gbps다. 이전 완료 후에는 신규 영상만 매주 S3로 동기화할 계획이다. 가장 효율적인 구성은?

A) DataSync로 전체 800TB 전송 + 이후 DataSync 정기 동기화
B) Snowball Edge 10대(각 80TB)로 초기 800TB 이전 + 이후 DataSync 주간 증분 동기화
C) Storage Gateway S3 File로 전체 800TB 전송
D) Site-to-Site VPN 추가 + DataSync 가속

**정답: B**
해설: 1Gbps × 실효 70% = 700Mbps로 800TB를 전송하면 약 25일이 필요하다. Snowball Edge 10대(800TB)를 동시 배포하면 데이터 적재 3~4일 + 배송 왕복 7일 = 약 10~14일로 완료된다. 2배 빠른 초기 이전이 가능하다. 이후 DataSync로 주간 증분 동기화를 자동화하면 운영 부담이 최소화된다. DataSync만으로(A) 800TB를 전송하면 25일 이상 소요되고 DX 대역폭의 상당 부분을 마이그레이션이 점유한다. Storage Gateway(C)는 상시 마운트를 위한 서비스이지 대량 일회성 이전에 최적화되어 있지 않다. VPN 추가(D)는 대역폭이 DX보다 낮아 도움이 안 된다.

---

**문제 2.** 에너지 회사가 북극 탐사 선박에서 수집한 지진 탐사 데이터(약 60TB)를 AWS로 전송해야 한다. 선박의 위성 인터넷은 2Mbps로 제한된다. 동시에 선박 위에서 실시간 지진 데이터 분석이 필요하다. 가장 적합한 솔루션은?

A) DataSync + 위성 인터넷
B) Snowball Edge Compute Optimized (엣지 분석 + 항구 귀환 시 데이터 이전)
C) AWS Outposts (선박에 배치)
D) Site-to-Site VPN + 위성 인터넷

**정답: B**
해설: 2Mbps로 60TB를 전송하면 약 2,800일(7.7년)이 걸린다. 물리 이동이 유일한 현실적 선택이다. Snowball Edge Compute Optimized는 104 vCPU와 선택적 GPU로 선박 위에서 EC2와 Lambda를 실행해 실시간 지진 데이터 분석이 가능하다. 항구 귀환 시 장비를 AWS로 발송해 S3 import를 완료한다. DataSync + 위성(A)과 VPN + 위성(D)은 2Mbps 제한으로 현실적으로 불가능하다. Outposts(C)는 최소 1U 서버이고 항상 AWS Service Link 연결이 필요한데 선박의 2Mbps로는 Service Link 유지도 어렵다.

---

**문제 3.** 영화 스튜디오가 매일 밤 디지털 필름 촬영 원본(약 5TB/일)을 온프레미스 NAS에서 S3로 백업한다. 회선은 10Gbps DX가 있다. 백업 완료 후 S3와 NAS 파일이 정확히 일치하는지 자동 검증이 필요하다. 최적 솔루션은?

A) Snowball Edge 매일 발송
B) AWS DataSync (매일 야간 실행, 자동 무결성 검증 포함)
C) S3 File Gateway + S3 Lifecycle
D) S3 REST API 직접 업로드 스크립트

**정답: B**
해설: 10Gbps DX로 5TB/일은 충분히 전송 가능하다(이론상 1.1시간, 실제 2~3시간). DataSync는 전송 후 자동 체크섬 검증으로 무결성을 보장한다. 매일 야간 스케줄로 cron 자동화도 가능하다. Snowball을 매일 발송(A)하는 것은 5TB/일 × 10Gbps DX 환경에서 완전히 과한 비용이다. S3 File Gateway(C)는 상시 마운트로 실시간 저장에 적합하지만 자동 무결성 검증이 DataSync만큼 강력하지 않다. 직접 스크립트(D)는 병렬 처리 최적화와 자동 재시도, 무결성 검증을 모두 직접 구현해야 한다.

---

**문제 4.** AWS Snow 장비가 분실되었다. 데이터 유출 위험은?

A) 데이터가 평문으로 저장되므로 완전한 유출 위험이 있다
B) 256-bit AES 암호화 + KMS 키 관리로 인해 물리 장비만으로 데이터 복호화 불가능
C) S3에서 데이터를 원격으로 삭제하면 장비의 데이터도 삭제된다
D) 장비를 원격으로 잠글 수 있다

**정답: B**
해설: Snow 장비의 모든 데이터는 기록 전에 256-bit AES로 암호화된다. 암호화 키는 AWS KMS에 있으며 장비에는 암호화된 키 재료만 있다. 장비가 AWS 데이터센터에 연결되지 않은 상태에서는 복호화 키를 얻을 수 없으므로 물리 장비만 있어도 데이터를 읽을 수 없다. 또한 물리 변조 시 보안 칩이 키를 자동 파기한다. C는 S3와 장비의 데이터가 연동되지 않는다(장비 내 데이터는 독립). D는 Snow 장비에 원격 잠금 기능이 없다.

---

**문제 5.** DataSync와 AWS Storage Gateway S3 File Gateway 중 "온프레미스 서버가 주기적으로 S3에 파일을 저장하고 읽어야 한다"는 요구사항에 더 적합한 것은?

A) DataSync
B) S3 File Gateway
C) 두 서비스 모두 동일하게 적합
D) 두 서비스 모두 부적합, Snowball 사용

**정답: B**
해설: "주기적으로 저장하고 읽는다"는 상시적 하이브리드 접근이 필요한 패턴이다. S3 File Gateway는 NFS/SMB로 마운트해 애플리케이션이 로컬 파일 시스템처럼 S3를 사용하게 한다. DataSync는 배치 전송으로 특정 시점에 파일을 동기화하는 도구지, 실시간으로 파일을 읽고 쓰는 상시 마운트를 제공하지 않는다. DataSync는 마이그레이션, 정기 백업, DR 동기화에 적합하다.

---

**문제 6.** 자동차 제조사가 공장 QA 카메라 100대에서 수집한 이미지로 ML 결함 탐지를 실행한다. 공장 LAN은 있지만 인터넷 연결이 없다. 이미지는 공장 서버에 저장되고 ML 추론 결과는 QA 시스템으로 전달된다. 결과 이미지와 레이블은 주기적으로 AWS로 보내 모델 재학습에 사용한다. 가장 적합한 아키텍처는?

A) AWS Outposts Rack + Direct Connect
B) Snowball Edge Compute Optimized (엣지 ML 추론) + 주기적 Snowball 교체로 데이터 전송
C) Local Zones (공장 근처 도시)
D) EC2 온디맨드 + Site-to-Site VPN

**정답: B**
해설: 인터넷이 없는 환경에서 ML 추론을 실행하고 데이터를 주기적으로 AWS로 보내는 것이 요구사항이다. Snowball Edge Compute Optimized는 GPU 옵션으로 ML 추론(SageMaker Edge Manager와 연동)을 공장 내에서 실행할 수 있다. 이미지 데이터를 로컬에 저장하고 정기적으로(예: 주 1회) 장비를 교체해 AWS로 데이터를 발송한다. Outposts(A)는 Service Link가 항상 필요한데 인터넷이 없는 환경에서는 Service Link 유지가 어렵다. Local Zones(C)는 AWS가 운영하는 도시 시설이므로 공장 내 ML 추론에 부적합하다. EC2 + VPN(D)은 인터넷이 없는 환경에서 불가능하다.
