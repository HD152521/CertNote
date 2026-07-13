# Day 3 - EC2 Image Builder: The Operational Virtue of Golden AMI

Every operations team faces this moment: early morning security request—"patch log4shell on all EC2 immediately." Running SSM Patch Manager reveals agent missing on some, failed boot dependencies on others, workload stalling during patching. Operator resolves: "next time, build new AMI and bulk-replace ASG." That's the Golden AMI pattern; automating that resolve is **EC2 Image Builder**.

This article examines why Image Builder isn't mere Packer replacement but "AWS-native immutable infrastructure pipeline," how Recipe, Component, Pipeline separate responsibilities, and how Golden AMI flows to operations ASG (SSM Parameter Store + Launch Template `{{resolve:ssm:...}}`). Goal isn't table memorization but understanding design: "Why separate Image Builder as distinct service versus EC2 console?"

## Mutable vs Immutable: Is Infrastructure Data or Code?

Traditional server operations = **mutable infrastructure**. SSH into server, patch, change config, install libraries. Over time, identically-purposed servers subtly diverge—one forgot 6-month-old patch, another left debug flag on post-debugging. This phenomenon: "snowflake server" or "configuration drift."

**Immutable infrastructure** flips this. Never modify servers. Patch needed? Build new AMI, spawn instances, terminate old. Servers = code (artifact), not data (state).

Mitchell Hashimoto industrialized this philosophy; 2013 launched Packer. Packer builds diverse cloud images (AMI, GCP Image, VHD) from single HCL definition. AWS Image Builder (December 2019) occupies similar space but **AWS-native integration advantage**—VPC, IAM, KMS, SSM Parameter, CloudWatch Logs, Inspector natively connected.

> 💡 **Related Theory**: Immutable infrastructure mirrors functional programming's immutable data structures exactly. Clojure persistent vectors, Rust ownership system, React immutable state updates all share principle: "create new, don't modify." Distributed systems gain power: 100 EC2 from identical AMI ID bit-identical (except User Data), trivially simplifying ops debugging.

> 🔍 **Deeper Dive**: Image Builder internally leverages SSM Automation Document and SSM Run Command. Build instances pre-install SSM Agent; Image Builder executes commands via SSM Session, not SSH keys. Build instances need zero inbound internet—SSM endpoint connectivity only. Superior security vs Packer SSH model. CloudTrail records all build commands as SSM calls bonus.

## Recipe, Component, Pipeline: Three Layers Responsibility Separation

Image Builder abstraction appears simple; separation intentional.

| Layer | Responsibility | Change Frequency |
|-------|---|---|
| **Component** | Single-job build script (yum install nginx) | Rare |
| **Recipe** | Components + Parent Image combination | Occasional |
| **Infrastructure Configuration** | Temp build instance specs (VPC, SG, IAM) | Rare |
| **Distribution Configuration** | Target regions/accounts for result AMI | Rare |
| **Pipeline** | All four + execution schedule | Occasional |
| **Image** | Build output (immutable artifact) | Per execution |

Importance emerges in "operate Golden AMI for multiple OS" scenario. Building three OS (Amazon Linux 2, RHEL 8, Ubuntu 22.04) Golden AMIs reuses identical "install corporate CloudWatch Agent" Component across all three. Recipe multiplies; Component shared. Image Builder fusing Recipe/Component would require triple code copy.

Component YAML phase structure intentional.

```yaml
phases:
  - name: build     # package install, file copy
  - name: validate  # post-build validation on build instance
  - name: test      # spawn instance from AMI, validate
```

`validate` and `test` separation: **build instance and actual-use instance state differ**. Working on build instance ≠ working on fresh instance. cloud-init failures possible. Hostname hardcoding example: build instance works, new instance gets same hostname causing ARP collision. test phase validates real-world scenario.

> ⚠️ **Gotcha**: Component YAML `action: ExecuteBash` executes via SSM Run Command, default timeout 7200s (2 hours). Long package build (GCC compile) exceeding limit quietly timeouts, debugging hard. Explicitly set `timeoutSeconds`. ExecuteBash non-interactive bash can't access `.bashrc` aliases/functions—use explicit PATH and full-path commands.

## SSM Parameter Store + Launch Template Elegance

Golden AMI creation ≠ end. Mechanism needed for operations ASG using built AMI. AWS recommended pattern:

```
[Image Builder Pipeline] → builds new AMI
        ↓ (EventBridge rule)
[Lambda] → updates SSM Parameter
        SSM /golden-ami/al2/latest = ami-XXXXXX
        ↓
[Launch Template]
   ImageId: '{{resolve:ssm:/golden-ami/al2/latest}}'
        ↓
[Auto Scaling Group]
   next Instance Refresh or scale-out auto-uses new AMI
```

Pattern elegance: **reference indirection**. Direct AMI ID in Launch Template = new Launch Template version per new AMI + ASG update. SSM Parameter indirection = only update SSM, Launch Template unchanged.

`{{resolve:ssm:...}}` syntax is CloudFormation dynamic reference, applies to Launch Template. Also `{{resolve:ssm:/golden-ami/al2/latest:label}}` targets specific SSM label—enabling "prod label for production, canary label for canary" patterns.

> 💡 **Related Theory**: Indirection pattern mirrors OS dynamic linking. Executable doesn't directly reference library function; references via PLT/GOT enabling library version upgrades. SSM Parameter acts as AMI's PLT. Kubernetes Service → Pod indirection same principle. Distributed systems: "reference by name" nearly always beats "reference by address."

> 📚 **Case Study**: Netflix built thousands AMI daily via Aminator. Incident where buggy AMI entered ASG, ~30m service death. Post-incident: "AMI promotion gate"—Image Builder AMI enters `staging-latest` SSM Parameter only, validates 24h staging, then separate Lambda promotes to `prod-latest`. Standard Spinnaker workflow now.

## EC2 Instance Refresh: ASG's AMI Replacement Approach

Launch Template pointing new AMI ≠ existing ASG instances auto-replace. Two methods exist.

**Natural Replacement**: ASG scale-out, scale-in, or health-check-failed instance replacement creates new instances from latest Launch Template. Time-bound convergence, no force.

**Instance Refresh**: `start-instance-refresh` API call progressively replaces all instances via new Launch Template. `MinHealthyPercentage` specifies minimum availability ratio; `InstanceWarmup` specifies new instance warmup.

```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name web-asg \
  --strategy Rolling \
  --preferences '{"MinHealthyPercentage":90,"InstanceWarmup":300,"CheckpointPercentages":[20,50,100],"CheckpointDelay":600}'
```

`CheckpointPercentages` fascinating. 20% replace → 10m wait, 50% → 10m wait, 100%—internal canary deployment within ASG. CloudWatch Alarm during validation auto-rollbacks (reverts previous Launch Template version).

> 🔍 **Deeper Dive**: Instance Refresh internally leverages Lifecycle Hooks. Terminating existing instance pauses at `Terminating:Wait`, new instance at `Pending:Wait`. During hooks, ops simultaneously CodeDeploy code deployment or precisely synchronize ALB Target Group transitions. AWS re:Invent 2020 COM301 session detailed.

## DLM: Not Backup, EBS Snapshot Lifecycle

Data Lifecycle Manager (DLM) name-ambiguous—mistaken as "AWS Backup old version." Actually **EBS Snapshot and EBS-backed AMI exclusive auto-creation/cleanup tool**. AWS Backup broadly covers RDS, DynamoDB, EFS, FSx, S3, Storage Gateway; DLM narrow, light, EBS-specialized.

DLM core operations two.

**Snapshot Lifecycle Policy**: Tag-matching EBS Volumes regularly snapshot, retention policy auto-deletes old.

**Image Lifecycle Policy** (EBS-backed AMI): Tag-matching EC2 Instances create AMI, policy deregisters old AMI + deletes associated snapshots.

```bash
aws dlm create-lifecycle-policy \
  --description "Daily EBS snapshot, 7-day retention" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"EBS_SNAPSHOT_MANAGEMENT",
    "ResourceTypes":["VOLUME"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"DailySnapshot",
      "CreateRule":{"CronExpression":"cron(0 17 ? * * *)"},
      "RetainRule":{"Count":7},
      "CopyTags":true,
      "FastRestoreRule":{"Count":2,"AvailabilityZones":["ap-northeast-2a","ap-northeast-2c"]}
    }]
  }'
```

`FastRestoreRule` under-documented option. Normal EBS Snapshot lazy-loads; restore to new volume has first-read S3-block-fetch delay. Fast Snapshot Restore pre-warm data on EBS backend, restore immediate full performance. Additional hourly cost per snapshot GB.

> ⚠️ **Gotcha**: DLM `RetainRule` count counts "successful snapshots" only. Failed creation uncounted; retention=7 may actually keep 4-5. Monitor `dlm-policy-execution-failed` metric essential.

## AMI Sharing: Pointers to Same EBS Snapshot

Multi-account environments share standard Golden AMI two ways.

**Account-level AMI Sharing** (`modify-image-attribute`): Add other account ID as launch permission. Shared account sees "Shared with me" in console "Private images" tab.

**AWS Resource Access Manager (RAM)**: Bundle AMI in Resource Share, share OU or entire Organization. New accounts added to OU auto-receive share.

Common trap: **AMI sharing ≠ data copy**. AMI metadata pointer to EBS Snapshot; share grants launch permission pointer only. **EBS Snapshot itself stays in source account**. Source account deregisters AMI + deletes snapshot → shared account can't launch.

Encrypted AMI sharing needs extra step. EBS Snapshot encrypted KMS key → KMS Key Policy must grant target account usage. AWS-managed KMS key (`aws/ebs`) can't cross-account share; must use customer-managed KMS.

```bash
# 1. Share AMI
aws ec2 modify-image-attribute \
  --image-id ami-XXXX \
  --launch-permission "Add=[{UserId=111122223333}]"

# 2. Share EBS Snapshot
aws ec2 modify-snapshot-attribute \
  --snapshot-id snap-XXXX \
  --create-volume-permission "Add=[{UserId=111122223333}]"

# 3. KMS Key Policy grant (Customer Managed Key only)
aws kms put-key-policy \
  --key-id arn:aws:kms:ap-northeast-2:444455556666:key/abcd-... \
  --policy-name default \
  --policy file://key-policy-with-cross-account.json
```

> 📚 **Case Study**: Fintech company adopted quarterly deprecation policy for PCI-DSS. Auto-deregister script began purging 90-day AMI; other accounts' ASG scale-out suddenly failed—Launch Templates referenced deprecated AMI. Post-incident: `aws ec2 enable-image-deprecation` first (blocks new launch, maintains existing refs), 30-day grace period, then deregister. AWS formalized EC2 Image Deprecation 2022.

## Image Builder vs Packer: When to Use What

| Item | EC2 Image Builder | HashiCorp Packer |
|---|---|---|
| **Multi-Cloud** | AWS only | AWS/GCP/Azure/VMware/... |
| **Build Instance Access** | SSM Session (no inbound internet) | SSH/WinRM (port open required) |
| **AWS Service Integration** | Strong (KMS, SSM, EventBridge, Inspector) | Requires external tools (Terraform) |
| **Component Reuse** | Component-level explicit | builder/provisioner combinations |
| **Scheduling** | Built-in cron | Requires external cron/CI |
| **Cost** | Build instance hours + S3 (cheap) | Same + Packer free |
| **Learning Curve** | YAML + Console | HCL (Terraform-familiar) |

AWS-only environment: Image Builder smoother. Multi-cloud: Packer forced choice. Interesting: **combine both**—Packer builds base AMI for multi-cloud compat, Image Builder adds AWS-exclusive agents (SSM, CloudWatch, Inspector) atop—two-stage build. Lyft, HashiCorp use this pattern.

> 💡 **Related Theory**: Two-stage build mirrors Docker multi-stage—base stage (common dependencies) → application stage (app-specific) achieving cache reuse + security isolation. Image Builder Recipe layers Parent Image + Components identically.

## Image Builder + Inspector Integration: Build-Time Vulnerability Scan

Image Builder integrates Amazon Inspector into pipeline. Component YAML has `aws-inspector` action; build stage auto-runs vulnerability assessment.

Effect: **shift-left security**. Inspector finding post-deploy high impact; build-stage finding prevents AMI distribution. Set CVSS threshold—"Critical/High found → pipeline fail"enforced.

```yaml
phases:
  - name: test
    steps:
      - name: InspectorScan
        action: aws-inspector-scan
        inputs:
          severity-threshold: HIGH
          fail-on-finding: true
```

Distribution Configuration executes only after pass—AMI replica multiregion/account. Compliance audit strong—auto-attestation "all prod AMI inspected-passed-at-build."

## Summary

Two insights: First, Image Builder isn't mere AMI automation but AWS-native immutable infrastructure philosophy. Recipe, Component, Pipeline separation intentional reflecting reusability + change frequency. Second, SSM Parameter + Launch Template `{{resolve:ssm:...}}` indirect reference naturally bridges AMI-creation and ops-ASG-consumption time gap.

Next: infrastructure-itself-as-code tools—OpsWorks and successor Systems Manager Application Manager. Why Chef/Puppet OpsWorks deprecated, SSM fills role differently—"configuration management" category itself evolves.

---

## 📝 Practice Questions

**Question 1.** Build monthly Golden AMI, new ASG instances auto-use without action. Pattern?

A) Manually create AMI monthly → Launch Template ImageId update  
B) Image Builder Pipeline cron → EventBridge + Lambda update SSM Parameter → Launch Template ImageId `{{resolve:ssm:...}}`  
C) Lambda periodically SSH yum update all ASG  
D) Beanstalk Custom Platform  

**Answer: B**

**Explanation:** AWS standard. SSM Parameter indirect reference = no Launch Template version per new AMI. Scale-out/health-replace/Instance Refresh auto-uses latest. C = mutable drift antipattern. D misuse.

---

**Question 2.** Image Builder security-understsandard AMI blocked from multiregion/account distribution. Mechanism?

A) Manual review  
B) Component test phase add SCAP/CIS/`aws-inspector-scan` → failure halts pipeline, Distribution skipped  
C) GuardDuty blocks  
D) IAM SCP  

**Answer: B**

**Explanation:** Build→validate→test phases. Test fail = pipeline halt, Distribution skipped. SCAP/CIS/Inspector tests prevent distribution. Shift-left security. GuardDuty runtime threat detection, not build-time.

---

**Question 3.** 1-year EBS Snapshot accumulation costs spike; auto-cleanup needed. Light, EBS-specialized?

A) AWS Backup  
B) Data Lifecycle Manager (DLM) with tag-based auto-create + retention  
C) S3 Lifecycle  
D) CloudWatch Logs Retention  

**Answer: B**

**Explanation:** DLM EBS/EBS-AMI exclusive, lightweight, cheap-per-policy. Backup broader RDS/DynamoDB/EFS—heavier. EBS-only → DLM correct. Gotcha: DLM RetainRule Count="successful" only; failures uncounted.

---

**Question 4.** Share customer-managed-KMS-encrypted AMI cross-account. Additional steps?

A) AMI launch permission only  
B) AMI + EBS Snapshot create-volume + KMS Key Policy grant target account Decrypt  
C) IAM Role  
D) S3 policy  

**Answer: B**

**Explanation:** AMI = EBS Snapshot metadata pointer; data in Snapshot. AMI+Snapshot+KMS three required. AWS-managed `aws/ebs` uncross-account-shareable; customer-managed only. Target account IAM needs key usage.

---

**Question 5.** Image Builder build instance execution and inbound internet necessity?

A) AWS managed, unrelated user VPC  
B) User VPC temp EC2 specified via Infrastructure Config, SSM Session → no inbound internet needed (out/VPC Endpoint SSM/S3 only)  
C) Lambda container  
D) Fargate Task  

**Answer: B**

**Explanation:** Temp EC2 in user account. Infrastructure Config specifies specs. SSM Agent commands = no SSH key, port 22/3389 closed OK. Out-bound only SSM/S3/CloudWatch Logs endpoint—private subnet + VPC Endpoint = complete isolation.

---

**Question 6.** New Launch Template version (new AMI) applied to existing ASG; old instances unchanged. Safely progressive-replace + auto-rollback?

A) desired-capacity 0 → increase  
B) ASG Instance Refresh Rolling—MinHealthyPercentage, CheckpointPercentages, auto-rollback  
C) CloudFormation stack redeploy  
D) CodeDeploy In-place  

**Answer: B**

**Explanation:** Instance Refresh exact fit. Checkpoints (20%→50%→100%), MinHealthyPercentage availability guarantee, CloudWatch Alarm auto-rollback to previous Launch Template. Without Instance Refresh, natural replacement eventual but non-forced. Gotcha: changing Launch Template alone doesn't force existing-instance replacement.

---

**Question 7.** Deprecate running AMI (block new launch) but existing Launch Template reference continues. Mechanism?

A) `aws ec2 deregister-image`  
B) `aws ec2 enable-image-deprecation` deprecate-status → new launch warns/filtered, existing ID refs work, later deregister  
C) Tag `status=deprecated`  
D) IAM policy  

**Answer: B**

**Explanation:** 2022 AWS formal EC2 Image Deprecation. Sets `deprecation-time` future; post-time console filters, some APIs warn, launch still possible. Direct deregister breaks existing refs. Safe workflow: deprecate → 30d grace → deregister+delete snapshot. Compliance (PCI-DSS) essential.

