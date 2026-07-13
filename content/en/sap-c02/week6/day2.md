# Day 2 - AWS MGN Deep Dive: Physics of Block-Level Replication, DRS Comparison, Migration Hub Orchestrator

The fundamental challenge of server migration is singular: **servers continue writing while you're copying their disks.** If a 50TB disk takes 24 hours to copy, when the copy finishes, the original and copy differ by 24 hours of changes. Catching up on that "final delta" is the technical challenge of Cutover.

AWS Application Migration Service (MGN) solves this with **block-level continuous replication**. It copies the entire disk initially, then tracks all subsequent changes in real-time and applies them to an AWS Staging Area. At the moment of Cutover, the "final delta" is measured in seconds.

Today we'll cover MGN's kernel-driver I/O interception mechanism, the crisp distinction between Test Cutover and actual Cutover, the shared engine relationship with DRS, and wave automation via Migration Hub Orchestrator.

## MGN's Lineage: SMS → CloudEndure → MGN

Understanding the history of cloud migration tools helps you avoid exam pitfalls.

```
2014: AWS Server Migration Service (SMS) launched
      Specialized for VMware vCenter/Hyper-V
      Snapshot-based replication (delta snapshots, incremental)
      Max 50 concurrent VMs

2016: CloudEndure Migration (Israeli startup CloudEndure)
      Block-level continuous replication technology
      Multi-cloud, multi-OS support

2019: AWS acquires CloudEndure (~$250M estimated)
      Integration with AWS accounts, first 90 days free policy introduced

2021: AWS Application Migration Service (MGN) officially launched
      CloudEndure technology + AWS native integration + new UX
      SMS halts new customer onboarding

2023: SMS service officially ends (existing customers migrate to MGN)

Current: MGN = AWS single standard server migration tool
         DRS = same engine, continuous DR service
```

> ⚠️ **Pitfall**: On the exam, if SMS (Server Migration Service) or CloudEndure Migration appear in the answer choices, they're wrong. Current AWS recommendation is MGN; SMS is discontinued. Don't confuse "Server Migration Connector" (SMS's on-premises agent) with SMS itself. Also, "CloudEndure Disaster Recovery" is now rebranded as AWS DRS.

## MGN Operating Principles: The Reality of Kernel Driver I/O Interception

### Why Block Level: File-Level Replication Limitations

File-level replication (rsync, robocopy) traverses the file system to identify changed files.

**File-level problems**:
1. If a file is modified during copying, an inconsistent state is captured
2. Database data files are open during copying with active transactions, making the files inherently inconsistent
3. OS-dependent—Windows NTFS, Linux ext4, xfs each require different tools
4. File-locked files cannot be copied

Block-level replication doesn't understand the file system. It replicates **raw disk sectors (512 bytes or 4KB blocks)** as-is. OS, file system, and application type are irrelevant.

### Kernel Driver I/O Interception: Internal Operation

When you install the MGN Replication Agent, an **I/O interception driver** is loaded into the OS kernel.

**Linux environment (Block Device I/O)**:
```
App → File system (ext4/xfs) → VFS (Virtual File System) → Block I/O layer
                                                             ↑
                                              MGN driver intercepts here
                                              captures all write blocks
                                                             ↓
                                                   TLS transmission to AWS
```

**Windows environment (VSS + Block I/O)**:
```
App → NTFS → Windows I/O Manager
             ↑
  MGN Filter Driver inserted (minifilter driver pattern)
  captures all write I/O Request Packets (IRP)
             ↓
    TLS transmission to AWS
```

> 💡 **Related Theory**: Windows's Filter Driver architecture is Microsoft's "I/O Stack" design—a layered driver model where each layer can modify or intercept IRPs before passing to the next layer. Antivirus, encryption, and DLP solutions use the same Filter Driver approach. MGN uses this standard extension point to capture all I/O at kernel level without modifying apps or database engines.

**Block change tracking mechanism**:
- Each block's change state tracked via bitmap
- Initial sync: entire bitmap = "changed" → all blocks transmitted
- Continuous replication: changed blocks marked in bitmap → only those blocks transmitted
- Transmission data compressed and deduplicated to optimize bandwidth

> 🔍 **Deeper Dive**: MGN's continuous replication differs from CDP (Continuous Data Protection). CDP logs all I/O to a journal, enabling recovery to any point-in-time. MGN tracks current state, not historical log. Therefore, "rolling back to yesterday's state with MGN" is impossible. For point-in-time recovery, use MGN + AWS Backup together. DRS operates the same way—recovering "seconds-ago state," not "3 PM yesterday."

### Replication Agent Installation Requirements

| Item | Details |
|------|------|
| Supported Linux | RHEL 6.5+, CentOS 6.5+, Ubuntu 12.04+, Debian 8+, Amazon Linux 1/2, SUSE 11 SP3+ |
| Supported Windows | Windows Server 2008 R2+, 2012, 2016, 2019, 2022 |
| Memory | Minimum 2GB RAM (for agent operation) |
| Network | Port 443 (HTTPS) outbound → AWS Staging Area |
| IAM | IAM user for Replication Agent (AWSApplicationMigrationAgentPolicy) |
| Bandwidth | Initial sync is bandwidth-intensive; throttling available (MB/s limit) |

```bash
# Install MGN Replication Agent on Linux
wget -O ./aws-replication-installer-init.py \
  https://aws-application-migration-service-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/linux/aws-replication-installer-init.py

sudo python3 aws-replication-installer-init.py \
  --region ap-northeast-2 \
  --aws-access-key-id AKIAIOSFODNN7EXAMPLE \
  --aws-secret-access-key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
  --no-prompt
```

> ⚠️ **Pitfall**: The Replication Agent authenticates with IAM credentials. These credentials are used for initial registration to AWS MGN. In production, store them in AWS SSM Parameter Store or Secrets Manager rather than hardcoding Access Keys. Also, after agent installation, allow port 1500 (replication data transmission with Replication Server) and 443 (control plane) in the source server's security group or firewall.

## MGN Breakdown by Stage: Replication → Test Cutover → Cutover

### Stage 1: Initial Sync

Begins immediately after agent registration. Staging Area (t3.small EC2 + EBS matching source disk size) is auto-created.

```
On-Premises Server               AWS Staging Area (ap-northeast-2)
[Disk Block Bitmap]             [Replication Server t3.small]
  All blocks = Changed          [EBS Volume (same size)]
       │                                  │
       │ TLS encrypted transmission       │
       │ (ports 443, 1500)               │
       └──────────────────────────────────┘
           Initial sync: all blocks transmitted
           Bandwidth throttling available
```

During initial sync, the source server continues normal operations. New writes during this period are recorded in the bitmap, then caught up during continuous replication after initial sync completes.

**Estimated initial sync duration calculation**:
```
Disk size 500GB, available bandwidth 100Mbps
= 500GB × 1024MB × 8bits / 100Mbps / 3600sec
≈ 11.4 hours (actual 15-20 hours with overhead/retransmissions)

With throttle at 50Mbps:
= ≈ 22.8 hours
```

### Stage 2: Continuous Replication

After initial sync completes, changed blocks are applied to Staging in real-time.

```
Lag measurement: difference between source write time and Staging application time
Typical lag: under several seconds
Write storm lag: tens of seconds to minutes
```

In the MGN console, each server's Replication Status shows:
- **Not Started**: Agent not installed
- **Initial Sync**: Initial sync in progress
- **Healthy**: Continuous replication normal (lag within acceptable range)
- **Stalled**: Replication severely delayed (network issue, Replication Server problem)
- **Disconnected**: Agent connection lost

### Stage 3: Test Cutover

**Key difference**: Test Cutover boots a test EC2 instance from Staging data while continuing to operate the source server. Source is unaffected.

```
Test purposes:
1. OS boot correctness (kernel, driver compatibility)
2. Network settings (VPC subnet, security groups)
3. App operation (startup scripts, dependencies)
4. Connectivity testing (RDS, S3, internal APIs)
5. Performance baseline (CPU, memory, disk I/O)

Test EC2 instance lifecycle:
Launch Test Instance → test → Terminate Test Instance
(Independent of Cutover, repeatable)
```

> 📚 **Case Study**: Large migration project reveals Test Launch importance. A major Korean insurance company attempted to migrate an Oracle RAC-based critical system using MGN. After Initial Sync, they performed Test Launch and discovered Oracle RAC's cluster software (Grid Infrastructure) refused to start in a single-instance EC2 environment. RAC is cluster-only, requiring reconfiguration to standalone Oracle. Without Test Launch, this would have surfaced during actual Cutover, causing service impact. Test Launch is non-negotiable.

### Stage 4: Cutover

**Pre-Cutover Checklist (must complete before Cutover)**:
- [ ] All functionality validated in Test Launch
- [ ] Network connectivity (SG, NACL, routing) validated
- [ ] Cutover scheduled during low-bandwidth window (minimize final sync time)
- [ ] DNS TTL pre-lowered (60 seconds or less)
- [ ] Rollback plan established (source server retention period decided)
- [ ] Stakeholder communication completed

**Cutover execution sequence**:

```
1. Request Finalize Cutover
   └── MGN performs final changed block sync
   └── Minimize additional writes to source server

2. Create EC2 instance
   └── Based on Launch Template (instance type, AMI, SG, subnet)
   └── Attach Staging EBS to new EC2

3. Boot EC2 and verify app operation

4. DNS switchover
   └── Update Route 53 / internal DNS records to new EC2 IP

5. Terminate source server after confirming traffic has stopped
```

**Cutover downtime components**:
```
Total downtime = final sync time + EC2 boot time + app startup time + DNS propagation
Typically: 2-10 minutes (depending on write speed and lag)
```

> 💡 **Related Theory**: Cutover strategy mirrors database migration's "Big Bang vs Trickle" pattern. MGN Cutover is Big Bang (switch everything at a specific moment). To reduce Big Bang risk, Test Launch + rollback planning + minimizing downtime are critical. Conversely, DMS CDC follows Trickle (gradual data transfer, minimal downtime for final switch) pattern.

## MGN vs DRS: Same Engine, Different Purpose

AWS Elastic Disaster Recovery (DRS) uses the same block-level continuous replication engine as MGN but serves a fundamentally different purpose.

| Item | MGN | DRS |
|------|-----|-----|
| Purpose | Migration (one-time transfer) | Disaster recovery (continuous protection) |
| Source location | On-premises, other cloud, existing EC2 | On-premises, other cloud, different AWS region |
| Target | Target AWS region EC2 | DR AWS region EC2 |
| Usage frequency | End after Cutover | Continuous operation (repeated DR drills) |
| RPO | N/A for migration purposes | **Several seconds** |
| RTO | Several minutes on Cutover | **Several minutes (DR drill/actual invocation)** |
| Drill method | Test Launch (source continues running) | Non-Disruptive DR Drill (source continues running) |
| Failback | No concept (one-way transfer) | **Supported** (DR → source reverse replication) |
| Cost model | First 90 days free | Per-protected-server hourly (~$0.028/hour) |

**DRS Failback Scenario**:
```
[Normal state]
On-premises server → DRS Agent → AWS DR region Staging

[DR invoked]
On-premises server fails → DRS boots DR region EC2 (RTO minutes)
Service runs in DR region

[After original recovery, Failback]
DR region EC2 → DRS Failback replication → on-premises server (reverse)
On-premises server recovery complete → Failback Cutover
Service returns to on-premises
```

> 🎯 **Scenario**: "We've completed on-premises to AWS migration. Now we want to use the original data center as DR for AWS." → AWS EC2 → DRS Agent → on-premises Staging. DRS supports reverse direction (AWS as source, on-premises as target). MGN cannot—migration ends the relationship.

> ⚠️ **Pitfall**: Confusing DRS with MGN scenarios. "We want to protect on-premises servers with AWS DR" → DRS. "We want to move on-premises servers to AWS" → MGN. Core keyword: "migration (once)" vs "disaster recovery (ongoing)."

## DRS RPO/RTO Mathematics

**RPO Calculation**:
```
DRS Replication Lag typical range: 1-5 seconds
RPO = Replication Lag ≈ several seconds

Worst case (write storm):
If lag stretches to 60 seconds, RPO = 60 seconds

Monitoring: CloudWatch "ReplicationLagDuration" metric
Alert: Lag > 30 seconds → SNS notification
```

**RTO Calculation**:
```
On DR drill/actual invocation:
1. Recovery Instance startup: ~1-2 minutes (EC2 boot)
2. App service startup: 1-5 minutes (app-dependent)
3. DNS switch: 0-300 seconds (TTL-dependent)

Total RTO: ~5-15 minutes
```

> 🔍 **Deeper Dive**: DRS's Non-Disruptive DR Drill. Like MGN's Test Launch, boot a Recovery Instance in the DR region while continuing to run the source server. After testing, terminate the Recovery Instance without affecting source replication. Solves the traditional DR challenge: "DR drill = service downtime." Recommended best practice: quarterly DR drills (4x annually) via Non-Disruptive method to validate RTO/RPO—aligns with Well-Architected Reliability Pillar.

## Migration Hub Orchestrator: Wave Automation

At scale (hundreds to thousands of servers), manual server-by-server management hits limits. Migration Hub Orchestrator automates wave processing.

### Orchestrator's Role

```
Migration Hub Orchestrator
    │
    ├── Select Workflow Template
    │   (SAP, SQL Server, Generic Server, etc.)
    │
    ├── Define Waves
    │   ├── Wave 1: Web/Cache servers (no dependencies)
    │   ├── Wave 2: App/API servers (start after Wave 1)
    │   └── Wave 3: DB servers (start after Wave 1+2)
    │
    ├── Automate each wave's steps
    │   1. Pre-migration validation (network, permissions)
    │   2. Auto-trigger MGN Test Launch
    │   3. Auto-collect test results
    │   4. Automate Cutover (or manual approval then auto)
    │   5. Post-migration validation (Health Check)
    │   6. Automate DNS switch (Route 53 API call)
    │
    └── Unified progress dashboard
```

**Orchestrator Workflow Structure**:
```yaml
# Migration Hub Orchestrator Workflow (conceptual YAML)
name: "Wave-1-WebServers"
steps:
  - name: "Pre-Migration Check"
    plugin: "MGN"
    action: "verify-replication-healthy"
    servers: ["web-01", "web-02", "web-03"]

  - name: "Test Launch"
    plugin: "MGN"
    action: "launch-test-instance"
    servers: ["web-01", "web-02", "web-03"]

  - name: "Manual Approval Gate"
    type: "approval"
    approvers: ["migration-team@example.com"]

  - name: "Cutover"
    plugin: "MGN"
    action: "finalize-cutover"
    servers: ["web-01", "web-02", "web-03"]

  - name: "DNS Switch"
    plugin: "Route53"
    action: "update-record"
    records: [...]
```

> 📚 **Case Study**: SK Telecom's large-scale MGN migration (2022-2023). SKT migrated 500+ servers from on-premises data center to ap-northeast-2 using Migration Hub Orchestrator for wave management. Analyzed server dependencies with ADS, structured 14 waves, and Orchestrator automated each wave's Test Launch → approval → Cutover. Compared to manual spreadsheet tracking, operational errors decreased 60%.

## Launch Settings and Post-Launch Actions

### Launch Settings (Instance Configuration)

Pre-define EC2 instance specs to be created during MGN Cutover.

| Setting | Description |
|----------|------|
| Instance Type | Auto-recommended from source CPU/memory or manual override |
| Subnet | Target VPC subnet |
| Security Group | SG matching app requirements |
| IAM Instance Profile | IAM role to attach to EC2 |
| EBS Encryption | Specify KMS key |
| Public IP allocation | False for Private Subnet |

**Right-Sizing Strategy**:
- At migration: set same or similar to source specs (safe transfer)
- After 2 weeks: Compute Optimizer analyzes actual usage
- After 2 weeks: resize per Compute Optimizer recommendations

### Post-Launch Actions (Auto-Run After Cutover)

Automatically execute SSM Automation Runbook immediately after successful Cutover.

```
Cutover complete
    │
    ▼
Post-Launch Action 1: Verify SSM Agent present
Post-Launch Action 2: Install and configure CloudWatch Agent (unified logging)
Post-Launch Action 3: Join Active Directory domain
Post-Launch Action 4: Configure NTP server (AWS internal NTP: 169.254.169.123)
Post-Launch Action 5: Execute app startup script
Post-Launch Action 6: Notify Slack channel "Server X Cutover Complete"
```

> 💡 **Related Theory**: Post-Launch Actions automation embodies **Infrastructure as Code's Day-2 Operations** principle. Automating initial setup (bootstrap) immediately after server startup ensures consistent post-migration state. Manual SSH/RDP to each server for configuration is error-prone and inconsistent. Same philosophy as Terraform's `user_data` or Ansible's `post-migration playbook`, implemented via SSM Automation.

## MGN Cost Optimization

| Item | Cost | Optimization |
|------|------|-----------|
| MGN service | First 90 days free, then $0.062/server/hour | Plan Cutover within 90 days |
| Staging EC2 (t3.small) | ~$15/month/server | Remove Agent from unused servers |
| Staging EBS | $0.10/GB/month | Staging EBS = source disk size |
| Data transfer (inbound) | Free | — |
| Test Instance | EC2 runtime | Terminate immediately after test |

**Expected 3-month cost for 100 servers, avg 500GB disk**:
```
MGN service: 90 days free = $0
Staging EC2 (t3.small × 100): $15 × 100 × 3 = $4,500
Staging EBS (500GB × 100): $0.10 × 500 × 100 × 3 = $15,000
Total: ~$19,500

* Staging resources auto-terminate after Cutover complete
```

---

## 📝 연습 문제

**문제 1.** How does the MGN Replication Agent capture disk I/O on an on-premises server?

A) Calls file system APIs to query changed file list
B) Kernel-level I/O interception driver captures all block writes
C) Takes periodic full-disk snapshots and compares with previous snapshot
D) Installs app-level hooks to intercept DB transactions

**정답: B**
MGN captures all block writes via kernel-level I/O interception driver (Linux: block device layer, Windows: Filter Driver). Operates regardless of file system, app, or DB. File-level replication (A) has consistency issues during copying. Periodic snapshots (C) was SMS's approach, now discontinued. App-level hooks (D) require different implementation per app, not universal.

---

**문제 2.** You're migrating a 500GB disk server via MGN. After Initial Sync completes, it enters "Stalled" state. Most likely cause?

A) MGN service down
B) Network bandwidth insufficient or Replication Server (Staging EC2) problem
C) 500GB exceeds MGN's maximum supported size
D) Agent auto-updating

**정답: B**
"Stalled" occurs when replication lag becomes severe or Replication Server connection fails. Most common cause: network bandwidth saturated (source performing high writes, transmission can't keep pace) or Staging Replication Server (t3.small) issue. Resolution: check Replication Server logs in MGN console; if needed, switch to larger Replication Server type. MGN supports unlimited disk size (AWS docs support 16TB+).

---

**문제 3.** Most critical difference between Test Cutover and actual Cutover?

A) Test Cutover uses smaller instance type
B) Test Cutover boots test EC2 while keeping source running; Cutover completes production transition by terminating source
C) Test Cutover skips encryption
D) Test Cutover can only run once

**정답: B**
Test Cutover boots test EC2 from Staging without stopping the source—both run simultaneously. If testing finds issues, terminate test EC2, fix, and retry. Actual Cutover: final sync → production EC2 boot → DNS switch → terminate source (no return unless source was preserved). Test Cutover is repeatable (D is wrong).

---

**문제 4.** Which service fits "rapidly recover on AWS if on-premises server fails, then return to on-premises once original recovery is complete"?

A) MGN (migration tool)
B) DRS (Elastic Disaster Recovery, supports Failback)
C) AWS Backup + Cross-Region Copy
D) CloudEndure Migration

**정답: B**
Core keyword: **Failback**—fail over to AWS on source failure, then migrate back to on-premises after recovery. DRS natively supports Failback: DR invoked → run on AWS → original recovers → DRS Failback replication (AWS → on-premises) → Failback Cutover → resume on-premises. MGN is one-way; no Failback concept. CloudEndure Migration replaced by MGN.

---

**문제 5.** Large migration (800 servers) requires auto-managing wave dependencies, auto-triggering each wave's Test Launch → manual approval → Cutover. Which service?

A) AWS Step Functions
B) AWS Migration Hub Orchestrator
C) AWS EventBridge Scheduler
D) AWS Systems Manager State Manager

**정답: B**
Migration Hub Orchestrator: migration-specialized workflow automation. Defines waves, calls MGN Test Launch/Cutover APIs, enforces approval gates, validates post-migration, automates DNS switch. Step Functions could implement this but lacks migration-specific plugin integration (MGN, DMS, ADS), requiring all API calls hardcoded. Orchestrator includes migration plugins and dashboards.

---

**문제 6.** Most common MGN Post-Launch Actions to configure? (multiple apply)

A) Auto-create S3 bucket
B) Auto-install and configure CloudWatch Agent and logging
C) Auto-join Active Directory domain
D) Auto-configure VPC Peering
E) Verify SSM Agent status and restart if needed

**정답: B, C, E**
Post-Launch Actions use SSM Automation Runbook for immediate post-Cutover execution. CloudWatch Agent install (B), AD domain join (C), SSM Agent verify (E) are standard Day-1 automation on all migrations. S3 bucket creation (A): migration-agnostic. VPC Peering (D): network-level config, pre-setup more suitable than post-boot automation.

---
