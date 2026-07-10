# Day 2 - RDS Security, Backups, and Monitoring: Lessons from the Capital One Incident

It's easy to think RDS security means "check the encryption box, set backup retention to 7 days, and set a few CloudWatch alarms and you're done." But production accidents happen in exactly those gaps. The July 2019 Capital One breach — 106 million personal records exposed — was not a flaw in RDS itself but gaps in operations around **metadata authentication, IAM permissions, and S3 backup exposure**. Today's topics — encryption, IAM DB authentication, backups, monitoring — are all operational features RDS has evolved to prevent such incidents.

In DVA-C02, this topic is a scenario favorite. "I don't want to hardcode passwords" → IAM authentication or Secrets Manager; "I need 5-minute recovery" → PITR; "I need to find why queries are slow" → Performance Insights. These 1:1 mappings must be locked in your head.

## RDS Encryption: Why Can You Only Enable It at Creation?

RDS at-rest encryption uses a KMS-managed key to encrypt everything with **AES-256-XTS**: EBS volumes, automatic backups, read-only replicas, snapshots. But there's a strange constraint: **you cannot encrypt an already-created RDS instance after the fact.** There's no option in the console. The workaround is: ① Create snapshot ② "Copy" the snapshot "in encrypted state" ③ Restore new instance from that encrypted snapshot — three steps.

> 🔍 **Going Deeper**: Why this constraint? EBS's encryption model. An EBS volume gets a **Data Encryption Key (DEK) once at creation time**, and all blocks are encrypted via that key in an LUKS-like manner. Once a volume is created, there's no mechanism to re-encrypt that DEK's plaintext data scattered across the disk. You could build "live migration with per-block re-encryption," but maintaining transaction consistency while doing that is very difficult. So AWS only provides the workaround: "use the moment when the snapshot is extracted in plaintext to issue a new encryption key there." Similar constraints exist on GCP Persistent Disk (CMEK changes require new disk creation).

When encryption is enabled, KMS operates in **envelope encryption** pattern. The master key (CMK, Customer Master Key) never leaves the KMS's internal HSM (Hardware Security Module — AWS uses CloudHSM-based FIPS 140-2 Level 3 certified), and the key that actually encrypts data is that master key further encrypted by the data key. Data keys are issued per EBS volume and decrypted in memory only at use time for disk I/O. No plaintext key exists anywhere on disk.

```
[KMS CMK (inside HSM)]
       |
       | GenerateDataKey
       v
[Data Key plaintext + Data Key encrypted]
       |
       +---> Plaintext key: EBS driver memory (volatile, not written to disk)
       +---> Encrypted version: EBS volume metadata
                  |
                  | (KMS Decrypt on demand to recover plaintext)
                  v
            Decryption during data I/O
```

> 💡 **Related Theory**: Envelope encryption is NIST SP 800-57's "key wrapping" concept applied to cloud scale. Encrypting all data directly with the master key would increase key operation frequency astronomically, creating HSM performance bottlenecks (KMS has per-region rate limits — typical keys 5,500-30,000/sec). So the 2-tier structure — "master key protects only data keys, actual data encrypted by data keys" — is standard. AWS S3, EBS, DynamoDB, Secrets Manager all use the same model.

In-transit encryption is a separate area. RDS carries an X.509 certificate per instance (`rds-ca-2019`, `rds-ca-rsa2048-g1` etc. by generation) and clients establish TLS 1.2/1.3 connections while verifying these certs. To force SSL-only, set `rds.force_ssl=1` (PostgreSQL) or `require_secure_transport=ON` (MySQL 8) in the parameter group. CA certificates rotate periodically (2024 switched to `rds-ca-rsa2048-g1`), and if the application's trust store doesn't update, **CA expiry day causes large-scale connection failure incidents**.

> 📚 **Case Study**: March 5, 2020, AWS announced `rds-ca-2015` certificate expiration in advance, yet many customers failed to switch to `rds-ca-2019`, causing connection refused outages on some services. AWS eventually delayed expiration by one year, and CA rotation alerts got stronger visibility in the AWS Health Dashboard thereafter. Exam scenarios occasionally feature "sudden SSL handshake failure" → suspect CA certificate expiry.

## IAM DB Authentication: Removing Passwords from Code

Traditional DB authentication hardcodes user/password pairs in applications. But these passwords end up ① committed to code repos, ② exposed in environment variables, or ③ printed in logs — repeatedly. RDS IAM Authentication aims to eliminate the password entirely.

The flow: ① Application obtains temporary credentials via IAM role (EC2 instance profile, Lambda execution role, EKS IRSA, etc.) ② Uses those credentials to call `rds:GenerateDBAuthToken` API, creating a **SigV4-signed token** ③ Puts that token in the DB password slot to connect. The token's TTL is exactly **15 minutes**, and one issued token can create multiple connections within that time.

> 🔍 **Going Deeper**: What exactly is an IAM token? Running `aws rds generate-db-auth-token` outputs a **query string of an AWS Signature Version 4 presigned URL**. The URL format (conceptually):
> ```
> mydb.xxxx.rds.amazonaws.com:3306/?Action=connect&DBUser=appuser&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Date=...&X-Amz-Expires=900&X-Amz-Signature=...
> ```
> The RDS server receives this token as the password and verifies: ① expiry hasn't passed ② signature is valid ③ the IAM principal has `rds-db:connect` permission. The token is self-contained for authentication, so RDS needs no extra KMS or STS calls to validate. This is SigV4's biggest design advantage (stateless, replay risk limited to 15 min).

Constraints on IAM authentication, frequently asked in exams:

- **Supported engines**: MySQL 5.7+, MariaDB 10.4+, PostgreSQL 9.5+ — Oracle/SQL Server unsupported
- **TLS required**: Sending tokens plaintext is unsafe, so SSL connection is forced
- **New connection rate limit**: MySQL ~200/sec recommended (higher rates make STS/SigV4 signature verification a bottleneck)
- **Existing DB user mapping needed**: Create users as `CREATE USER 'appuser' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS'` and specify IAM policy `rds-db:connect` resource as `arn:aws:rds-db:region:account:dbuser:cluster-id/appuser`

> ⚠️ **Trap**: IAM authentication is not a magic solution. Short token TTL + new connection rate limit means **SigV4 verification latency can rise on very high OLTP workloads**. For "Lambda + RDS, no password" scenarios, IAM auth often works, but "thousands of connections/sec" needs RDS Proxy + Secrets Manager instead. Token caching + connection pooling together are needed for stability.

```python
# Practical pattern: token caching
import boto3, time, threading
from functools import lru_cache

class IamDbTokenManager:
    def __init__(self, host, port, user, region):
        self.host, self.port, self.user, self.region = host, port, user, region
        self.client = boto3.client('rds', region_name=region)
        self._token = None
        self._expires_at = 0
        self._lock = threading.Lock()

    def get_token(self):
        with self._lock:
            # Reissue 60 sec before expiry (safety margin)
            if self._token is None or time.time() >= self._expires_at - 60:
                self._token = self.client.generate_db_auth_token(
                    DBHostname=self.host, Port=self.port,
                    DBUsername=self.user, Region=self.region)
                self._expires_at = time.time() + 15 * 60
            return self._token
```

Exams frequently mix up Secrets Manager vs IAM auth. Secrets Manager **stores and rotates passwords**; IAM authentication **eliminates passwords entirely**. They have trade-offs:

| Dimension | IAM DB Auth | Secrets Manager + password | RDS Proxy + Secrets Manager |
|------|-------------|---------------------------|------------------------------|
| Password exists | No (IAM token only) | Yes (auto-rotate) | Yes (Proxy caches) |
| Token/secret refresh | 15 min | 30 days (default) ~ 365 days | Proxy automatic |
| New connection limit | 200/sec recommended | Engine limit as-is | Proxy pool limit |
| Fitting scenario | Low frequency + security emphasis | General operations | High-frequency Lambda |

## Backups: Real Behavior of Automatic Backups and PITR's Secret

RDS automatic backup is actually **two combined mechanisms**: ① **Storage volume snapshot** taken during the backup window daily (EBS snapshot mechanism — first full, then incremental) + ② **Transaction logs pushed to S3 every 5 minutes**. These combine to enable Point-in-Time Recovery (PITR).

```
[7 days ago 03:00]      [1 hour ago]    [Now]
   |full snapshot         |snap           |
   v                      v               v
   ███▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
       <-- binlog/WAL 5-min S3 upload -->

Restore: nearest snapshot + WAL/binlog replay to desired point
```

> 🔍 **Going Deeper**: PITR is "5-minute granular" in common speech but actually finer. MySQL recovers to transaction-level in binlog, PostgreSQL to LSN (Log Sequence Number) in WAL. "5-minute" is just the S3 upload period; RDS preserves in-flight logs as much as possible. But if the instance suffers catastrophic failure in the last 5 minutes, that log is lost — RPO is effectively 5 min or so for practical purposes. Exam: "RPO ≤ 5 min required" → automatic backup + PITR is the answer.

Automatic backups and manual snapshots are completely different objects. Confusion arises because both end up in S3, but the difference is **lifecycle policy**.

| Item | Automatic Backup | Manual Snapshot |
|------|-----------|-------------|
| Creation interval | Daily backup window | Manual / automated (EventBridge) |
| Retention period | 0-35 days (0=disabled) | Unlimited (but cost↑) |
| Deletion on instance delete | Deleted together (default) — can convert via Final Snapshot option | Stays as-is |
| Storage cost | First 100% of DB storage free, excess GB-month charged | Charged from the start GB-month |
| Cross-region copy | Direct not possible (convert to manual snapshot, then copy) | ✅ KMS key re-encryption while copying |
| Cross-account share | ❌ | ✅ (if encrypted, KMS key grant needed) |
| PITR | ✅ | ❌ (specific point only) |

> 📚 **Case Study**: August 2017, GitLab database operator confused staging and production DBs and ran `rm -rf` on production, deleting ~300GB data. During recovery attempt, 4 of 5 backup mechanisms failed (no validation), recovering only from a 6-hour-old LVM snapshot — ~5,000 active users lost data. With RDS automatic backup + PITR, recovery would be to minutes before the incident. Lesson: **backup existence matters less than restore validation**. AWS Backup's cross-account backup vault lock (WORM) origins here.

> ⚠️ **Trap**: Setting automatic backup retention to **0 days disables automatic backups**, instantly blocking PITR and Read Replica creation. "Why can't I create Read Replica?" is an exam favorite answer: automatic backup disabled. Also, **even if auto-backup is enabled, deleting the DB instance without creating Final Snapshot wipes all auto-backups** — mandatory data needs manual snapshot conversion or separate storage.

AWS Backup relationship matters too. AWS Backup is a meta-service bundling RDS, EBS, DynamoDB, EFS under one policy. Applying **WORM (Vault Lock)** to backup vault prevents anyone from deleting for a period (ransomware defense). Exam: "Protect RDS backups from ransomware/insider threat" → AWS Backup Vault Lock is the answer.

## Monitoring 3-Tier: CloudWatch, Enhanced Monitoring, Performance Insights

These three have completely different data sources, so they answer different questions. Exam constantly mixes them up.

| Tool | Data Source | Interval | Question It Answers |
|------|-------------|------|-------------------|
| **CloudWatch** | EC2 hypervisor exterior (Nitro card) | 60 sec default / 1 sec detailed | "CPU/disk/network utilization" |
| **Enhanced Monitoring** | RDS instance OS interior (CloudWatch Logs Agent) | 1, 5, 10, 15, 30, 60 sec | "Which OS process eats CPU" |
| **Performance Insights** | DB engine interior (Aurora native, adapters for others) | 1 sec (DBLoad) | "Which query is waiting for lock" |

> 🔍 **Going Deeper**: CloudWatch metrics come from hypervisor layer — the virtualization layer observes "this instance uses N% CPU" from outside. It **cannot see inside guest OS details (per-process CPU, memory details)**. Enhanced Monitoring runs a small agent in RDS OS reading `/proc/stat`, `/proc/meminfo`, `/proc/PID/status` every 1 sec, pushing to CloudWatch Logs. Performance Insights goes deeper — via DB engine wait event sampling (MySQL performance_schema, PostgreSQL pg_stat_activity-like interface) showing "right now, which queries wait for which locks" graphically.

> 💡 **Related Theory**: Performance Insights's **DBLoad** metric measures "at specific moment, how many active sessions bound by which wait event" via sampling — Oracle ASH (Active Session History) cloud variant. The wait event category-stacked area chart (CPU, IO, Lock, Network etc.) is PI console's core, implementing the "TIME MODEL + WAIT EVENT analysis" standard DB perf technique. Anyone familiar with Oracle Enterprise Manager ASH/AWR sees nearly identical paradigm.

Frequently seen CloudWatch metrics and meaning:

| Metric | Threshold Guide | Meaning |
|--------|--------------|------|
| `CPUUtilization` | > 80% sustained | Instance class upgrade consideration |
| `DatabaseConnections` | 80% of max_connections | Connection leak or burst |
| `FreeStorageSpace` | < 10GB | Storage shortage (Auto Scaling recommended) |
| `ReadLatency`/`WriteLatency` | > 20ms | Disk I/O bottleneck or insufficient PIOPS |
| `ReplicaLag` (Read Replica) | > 30s | Async replication lag — analytic queries stress primary |
| `BurstBalance` (gp2) | < 20% | I/O burst credit near depletion |
| `DiskQueueDepth` | > 32 | I/O wait queue — throughput limit |

> ⚠️ **Trap**: gp2 `BurstBalance` 100% → 0% crash is exactly when latency spikes. gp3 has no burst concept, always guarantees baseline, so using gp3 on new instances eliminates this problem. Exam: "RDS suddenly slow + gp2 in use" → BurstBalance depletion is the answer almost always.

## Parameter Groups and Option Groups: Two Axes of Engine Tuning

RDS blocks OS shell access, so engine config changes must go through **parameter groups**. Default groups like `default.mysql8.0` are read-only — must create custom groups. Some parameters (e.g., `innodb_buffer_pool_size`) are **dynamic**, taking effect immediately; others (e.g., `binlog_format`) are **static**, requiring instance restart. Exam: "Changed parameter but not taking effect" → static parameter + restart forgotten.

Option groups are separate from parameter groups, **enabling additional engine features**. Oracle TDE (Transparent Data Encryption), SQL Server Audit, MySQL MEMCACHED interface are toggled in option groups.

| Distinction | DB Parameter Group | DB Option Group |
|------|----|-----------------|
| Target | Engine config values (memory, query cache etc.) | Engine extra features (TDE, Audit, S3 integration etc.) |
| Applies to | All engines | Oracle, SQL Server, MySQL etc. selective |
| Change impact | Dynamic takes immediately, static requires restart | Mostly requires restart |
| Aurora-specific | DB Cluster Parameter Group exists | Rarely used |

## Maintenance Window and Minor Version Upgrades

RDS has a **weekly 30-minute maintenance window**. During this time, minor patches, OS security updates, certificate rotation occur. Default is random window but operations can specify traffic-low time (e.g., `sun:18:00-sun:18:30` UTC).

Multi-AZ instances patch **standby first, then primary via failover** — downtime minimized to 60-120 sec failover. Single-AZ incurs full patch duration downtime. "Minimize downtime during patching" → Multi-AZ is the answer.

```bash
# 1) Force immediate patch (don't wait for next maintenance window)
aws rds modify-db-instance \
  --db-instance-identifier mydb \
  --auto-minor-version-upgrade \
  --apply-immediately

# 2) Specify maintenance window (UTC)
aws rds modify-db-instance \
  --db-instance-identifier mydb \
  --preferred-maintenance-window sun:18:00-sun:18:30
```

> 📚 **Case Study**: 2023, a Korean fintech startup ran Single-AZ RDS PostgreSQL with random maintenance window unchanged, triggering minor patch auto-run at Korean 11am (UTC 02:00). DB down 4 min, thousands of payment transactions failed. Postmortem: ① Multi-AZ not enabled ② maintenance window not set to low-traffic time — both console toggles. Twice as painful since both were solvable.

## Secrets Manager + RDS Password Rotation: How Is It Seamless?

Secrets Manager stores RDS passwords and AWS-provided rotation Lambda (or Secrets Manager native rotation since 2022) periodically issues new passwords. Seamless rotation is possible via **three-label secrets (AWSPREVIOUS / AWSCURRENT / AWSPENDING)** model.

```
Rotation start:
  AWSCURRENT = "old password"   ←── application using
  AWSPENDING = "new password candidate"

Rotation flow:
  1. Try change RDS password to AWSPENDING (DB simultaneously aware)
  2. Validate: AWSPENDING connection to DB succeeds
  3. Swap labels: AWSPENDING → AWSCURRENT, old becomes AWSPREVIOUS
  4. AWSPREVIOUS stays valid a while (rollback ready)

Application-side:
  - Fetch secret from Secrets Manager per request (or cache + TTL)
  - Use new password immediately on next connection
```

> 🔍 **Going Deeper**: MySQL since 8.0 supports dual passwords per user (`ALTER USER ... IDENTIFIED BY ... RETAIN CURRENT PASSWORD`). Secrets Manager rotation leverages this — both passwords coexist briefly while old connections stay up, new connections use new password. This is the "seamless rotation" technical basis. Combined with RDS Proxy, Proxy auto-fetches new password and refreshes backend connections — no app code password fetch needed.

## CloudWatch Logs Integration and Auditing

RDS auto-exports engine logs (Error, General, Slow Query, Audit) to **CloudWatch Logs**. But default is disabled — enable via console "Log exports" checkbox. Once enabled, logs push real-time to log group `/aws/rds/instance/<dbid>/<logtype>`, querying possible via CloudWatch Logs Insights.

```sql
-- CloudWatch Logs Insights: recent 1hr slow query top 10
fields @timestamp, @message
| filter @logStream like /slowquery/
| parse @message /Query_time: (?<query_time>\d+\.\d+)/
| sort query_time desc
| limit 10
```

Audit-required environments (HIPAA, PCI-DSS, SOC 2) enable Audit log + CloudTrail RDS data events together, pushing to KMS-encrypted log groups. Exam: "Track who did what queries on DB" → Audit log → CloudWatch Logs → CloudWatch Logs Insights flow is the standard answer.

## Wrapping Up

RDS security and operations distill to two principles: **① Remove secrets (keys, passwords) from humans/code — KMS, IAM Auth, Secrets Manager. ② Assume accidents happen and pre-validate recovery — automatic backup, PITR, AWS Backup Vault Lock, monitoring 3-tier**. All production RDS operational decisions branch from these two.

The Capital One incident taught simply — "Is RDS secure?" was the wrong question; "Are things around RDS (metadata endpoints, IAM roles, S3 backup permissions) secure?" is right. Exam scenarios follow this incident's pattern: password exposure, backup unprotected, monitoring absent.

Next article goes deeper into RDS cost optimization and troubleshooting — Reserved Instance, Aurora Serverless v2, slow query diagnosis, connection storm response.

---

## 📝 연습 문제

**문제 1.** A financial company needs to switch a non-encrypted RDS MySQL to KMS encryption with minimal downtime. What's the correct procedure?

A) Console "Modify" → toggle Encryption and apply immediately
B) Create snapshot → copy snapshot with encryption option → restore new instance from encrypted copy → switch application endpoint
C) Run `aws rds modify-db-instance --storage-encrypted`
D) Enabling Multi-AZ automatically encrypts

**정답: B**

해설: RDS only allows encryption setting at instance creation, so non-encrypted → encrypted requires snapshot path. ① Take snapshot of existing instance ② Use `copy-db-snapshot --kms-key-id` to create encrypted copy ③ Run `restore-db-instance-from-db-snapshot` on the copy to create new instance ④ Redirect application endpoint to new instance (or Route 53 weighted routing for gradual switch). Downtime only during endpoint switchover. A/C unsupported by RDS. D Multi-AZ is availability feature, unrelated to encryption.

---

**문제 2.** Lambda function accesses RDS MySQL without hardcoding password. Workload is low frequency (100 calls/hour). What's the most suitable auth method?

A) Lambda environment variable with password (KMS encrypted)
B) AWS Secrets Manager with fetch + Lambda
C) RDS IAM Database Authentication
D) Parameter Store SecureString

**정답: C**

해설: ① Goal: eliminate password itself ② Workload: low-frequency (100/hr = 0.03/sec), so IAM token issuance overhead negligible. C is cleanest. B is viable but password still exists + rotation policy needed. A/D expose password to environment/SSM, missing "no password in code" requirement. Exam: "Lambda + RDS + avoid password + low frequency" → IAM auth; "high frequency Lambda + stable connections" → RDS Proxy + Secrets Manager.

---

**문제 3.** Which statement about RDS automatic backup and manual snapshot is correct?

A) Automatic backups can be copied directly across regions
B) Manual snapshots persist even after DB instance deletion
C) Automatic backups retain unlimited duration
D) Manual snapshots support PITR

**정답: B**

해설: B correct. Manual snapshots outlive DB deletion until explicitly deleted (cost continues). A: auto-backup cannot copy across regions directly — must convert to manual snapshot first. C: auto-backup max 35 days. D: PITR uses auto-backup transaction logs, so manual snapshots cannot do PITR, only restore to specific snapshot time.

---

**문제 4.** Production RDS PostgreSQL suddenly shows slow queries. Need to determine "which wait event is the query blocked on." Most fitting tool?

A) CloudWatch CPUUtilization graph
B) Enhanced Monitoring process list
C) Performance Insights
D) VPC Flow Logs

**정답: C**

해설: "Which wait event is query stuck on" is DB engine interior info — Performance Insights answers exactly this. PI DBLoad chart stacks active sessions by wait event (CPU, IO:DataFileRead, Lock:tuple etc.) visually. A: CloudWatch shows instance-level metrics (CPU, IOPS), not which query causes it. B: Enhanced Monitoring is OS process-level, not DB wait events. D: Flow Logs are network traffic only.

---

**문제 5.** RDS MySQL `binlog_format` change from `ROW` to `STATEMENT` in parameter group doesn't take effect immediately. Cause and fix?

A) IAM permission insufficient — add `rds:ModifyDBParameterGroup`
B) `binlog_format` is static parameter — DB instance restart required
C) Multi-AZ only — Single-AZ cannot change
D) Aurora only

**정답: B**

해설: RDS parameters are **dynamic** (immediate) or **static** (restart needed). `binlog_format` is static — after parameter group edit, `aws rds reboot-db-instance` needed. Console "Pending reboot" indicator shows this state. A: permission issue not root cause, it's engine behavior. C/D: unrelated.

---

**문제 6.** DB instance with both automatic backup and manual snapshot is being deleted. What persists after deletion?

A) Automatic backup only
B) Manual snapshot only
C) Both
D) Neither

**정답: B**

해설: Instance deletion: ① auto-backup deleted together (but "Final snapshot" option creates last manual snapshot to keep) ② manual snapshot stays. "Preserve data forever" → either make Final snapshot or create manual snapshot beforehand. Auto-backup retain option (2021 feature) lets auto-backup persist briefly post-deletion, but default is deletion with instance.

---

**문제 7.** Medical SaaS stores PII on RDS, HIPAA requires 1-year audit log retention of "who ran which query." Most suitable config?

A) Enable Performance Insights
B) Enable Audit log → CloudWatch Logs export → KMS-encrypted log group with 1-year retention
C) Enable Enhanced Monitoring
D) Use RDS Proxy logs

**정답: B**

해설: Audit requirement = DB engine audit log (MySQL MariaDB Audit Plugin, PostgreSQL pgaudit). CloudWatch Logs export gives KMS encryption, IAM access control, retention policy (1 year etc.) — all standard. A: Performance Insights is perf analysis, not audit. C: Enhanced Monitoring is OS metrics only. D: RDS Proxy logs are connection metadata, not query audit.
