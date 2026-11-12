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

## 📝 Practice Questions

**Question 1.** A healthcare company must migrate 800 TB of 15 years of medical imaging data from on premises to AWS S3. The data center's AWS DX connection is 1 Gbps. After the migration is complete, it plans to synchronize only new images to S3 weekly. What is the most efficient configuration?

A) Transfer the full 800 TB with DataSync + regular DataSync synchronization afterward
B) Initial 800 TB transfer with 10 Snowball Edge devices (80 TB each) + weekly incremental DataSync synchronization afterward
C) Transfer the full 800 TB with Storage Gateway S3 File
D) Add Site-to-Site VPN + DataSync acceleration

**Answer: B**
Explanation: Transferring 800 TB at 1 Gbps × 70% effective = 700 Mbps takes about 25 days. Deploying 10 Snowball Edge devices (800 TB) at the same time completes in about 10-14 days: 3-4 days of data loading + 7 days of round-trip shipping. An initial transfer twice as fast is possible. Automating weekly incremental DataSync synchronization afterward minimizes the operational burden. Transferring 800 TB with DataSync alone (A) takes more than 25 days and the migration occupies a large part of the DX bandwidth. Storage Gateway (C) is a service for persistent mounting and is not optimized for large one-time transfers. Adding VPN (D) does not help because its bandwidth is lower than DX.

---

**Question 2.** An energy company must transfer seismic survey data (about 60 TB) collected on an Arctic exploration vessel to AWS. The vessel's satellite internet is limited to 2 Mbps. At the same time, real-time seismic data analysis is needed on the vessel. What is the most appropriate solution?

A) DataSync + satellite internet
B) Snowball Edge Compute Optimized (edge analytics + data transfer upon returning to port)
C) AWS Outposts (deployed on the vessel)
D) Site-to-Site VPN + satellite internet

**Answer: B**
Explanation: Transferring 60 TB at 2 Mbps would take about 2,800 days (7.7 years). Physical transport is the only realistic choice. Snowball Edge Compute Optimized has 104 vCPUs and an optional GPU, so it can run EC2 and Lambda on the vessel for real-time seismic data analysis. Upon returning to port, the device is shipped to AWS to complete the S3 import. DataSync + satellite (A) and VPN + satellite (D) are practically impossible because of the 2 Mbps limit. Outposts (C) is at minimum a 1U server and always requires an AWS Service Link connection, and maintaining the Service Link is difficult at the vessel's 2 Mbps.

---

**Question 3.** A film studio backs up digital film shoot originals (about 5 TB per day) from an on-premises NAS to S3 every night. It has a 10 Gbps DX connection. After the backup completes, it needs automatic verification that the S3 and NAS files match exactly. What is the best solution?

A) Ship Snowball Edge every day
B) AWS DataSync (runs nightly, with automatic integrity verification included)
C) S3 File Gateway + S3 Lifecycle
D) A script that uploads directly with the S3 REST API

**Answer: B**
Explanation: 5 TB per day is easily transferable over a 10 Gbps DX connection (in theory 1.1 hours, in practice 2-3 hours). DataSync guarantees integrity through automatic checksum verification after transfer. It can also be automated on a nightly schedule like cron. Shipping a Snowball every day (A) is completely excessive in cost for 5 TB/day over a 10 Gbps DX. S3 File Gateway (C) suits real-time storage through a persistent mount, but its automatic integrity verification is not as strong as DataSync's. A direct script (D) requires you to implement parallel processing optimization, automatic retries, and integrity verification all yourself.

---

**Question 4.** An AWS Snow device was lost. What is the risk of data exposure?

A) The data is stored in plaintext, so there is a complete risk of exposure
B) Because of 256-bit AES encryption + KMS key management, the data cannot be decrypted with the physical device alone
C) Deleting the data remotely from S3 also deletes the data on the device
D) The device can be locked remotely

**Answer: B**
Explanation: All data on a Snow device is encrypted with 256-bit AES before it is written. The encryption keys are in AWS KMS, and the device holds only encrypted key material. While the device is not connected to an AWS data center, the decryption key cannot be obtained, so the data cannot be read even if someone has the physical device. In addition, upon physical tampering, the security chip destroys the key automatically. For C, the data in S3 and on the device are not linked (the data on the device is independent). For D, Snow devices have no remote lock feature.

---

**Question 5.** Between DataSync and AWS Storage Gateway S3 File Gateway, which is more suitable for the requirement "an on-premises server must periodically store files in S3 and read them"?

A) DataSync
B) S3 File Gateway
C) Both services are equally suitable
D) Neither service is suitable; use Snowball

**Answer: B**
Explanation: "Periodically store and read" is a pattern that requires persistent hybrid access. S3 File Gateway is mounted over NFS/SMB so that applications use S3 like a local file system. DataSync is a batch transfer tool that synchronizes files at a specific point in time and does not provide a persistent mount for reading and writing files in real time. DataSync suits migration, regular backups, and DR synchronization.

---

**Question 6.** An automaker runs ML defect detection on images collected from 100 QA cameras in a factory. The factory has a LAN but no internet connection. Images are stored on a factory server and the ML inference results are delivered to the QA system. The result images and labels are periodically sent to AWS and used to retrain the model. What is the most appropriate architecture?

A) AWS Outposts Rack + Direct Connect
B) Snowball Edge Compute Optimized (edge ML inference) + data transfer by periodically swapping Snowball devices
C) Local Zones (a city near the factory)
D) EC2 On-Demand + Site-to-Site VPN

**Answer: B**
Explanation: The requirements are to run ML inference in an environment with no internet and to send data to AWS periodically. Snowball Edge Compute Optimized can run ML inference inside the factory with its GPU option (integrated with SageMaker Edge Manager). Image data is stored locally and the device is swapped regularly (for example, once a week) to ship the data to AWS. Outposts (A) always needs a Service Link, and maintaining a Service Link is difficult in an environment with no internet. Local Zones (C) are city facilities operated by AWS and are unsuitable for ML inference inside the factory. EC2 + VPN (D) is impossible in an environment with no internet.
