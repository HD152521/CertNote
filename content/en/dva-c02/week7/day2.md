# Day 2 - RDS Security, Backup, and Monitoring: Lessons Left by the Capital One Incident

When you first learn RDS, it is easy to think "turn on the encryption checkbox, leave backup retention at 7 days, set up a few CloudWatch alarms, and you're done." But production incidents happen in exactly those gaps. The July 2019 Capital One breach of 106 million people's personal data did not start from a flaw in RDS itself; it started from operational gaps: **metadata authentication, IAM permissions, and S3 backup exposure**. The topics we cover today (encryption, IAM DB authentication, backups, monitoring) are all operational features that RDS has evolved to prevent incidents like that.

On DVA-C02 this topic appears as scenario questions. If it says "we don't want to hardcode the password in code," the answer is IAM authentication or Secrets Manager; if "we need recovery to a 5-minute granularity," PITR; if "we need to find why queries are slow," Performance Insights. You need to know these 1:1 mappings.

## RDS Encryption: Why Can It Only Be Turned On "at Creation"

RDS encryption at rest uses keys managed by AWS KMS (AWS Key Management Service) to encrypt the EBS volume, automated backups, Read Replicas, and snapshots, all with **AES-256-XTS**. But there is one constraint. **You cannot convert an already-created RDS instance to encrypted after the fact.** The console has no such option either. The workaround takes three steps: ① create a snapshot ② "copy the snapshot in an encrypted state" ③ restore a new instance from that encrypted snapshot.

The reason for this constraint is EBS's encryption model. An EBS volume is issued a KMS data key (Data Encryption Key, DEK) once, **at creation time**, and every block is encrypted with that key in a LUKS-like manner. There is no mechanism to re-encrypt plaintext data that has already been scattered after the volume was created. A feature that "re-encrypts block by block during live migration" is very hard to implement without breaking transaction consistency. So AWS provides only a workaround that "takes advantage of the moment the data is extracted once as plaintext at the snapshot stage and issues a new encryption key there." A similar constraint exists on GCP Persistent Disk (changing the CMEK requires creating a new disk).

When encryption is on, KMS works with the **envelope encryption** pattern. The master key (CMK, Customer Master Key) never leaves the KMS internal HSM (Hardware Security Module; AWS's is CloudHSM-based and FIPS 140-2 Level 3 certified). What actually encrypts the data is a data key that has itself been encrypted once more by that master key.

Data keys are issued per EBS volume, and are decrypted in memory only at the time of use for disk I/O. No plaintext key remains anywhere on disk.

```
[KMS CMK (inside HSM)]
       |
       | GenerateDataKey
       v
[Data Key plaintext + Data Key encrypted copy]
       |
       +---> plaintext key: EBS driver memory (volatile, never written to disk)
       +---> encrypted copy: stored in EBS volume metadata
                  |
                  | (plaintext recovered via a KMS Decrypt call when needed)
                  v
            decrypted during data I/O
```

In envelope encryption, if you encrypted all data directly with the master key, key usage frequency would rise sharply and create an HSM performance bottleneck (KMS has per-Region key operation limits per second: 5,500-30,000/second for symmetric keys). So the standard is a two-level structure where "the master key protects only the data keys, and the actual data is encrypted with the data keys." AWS S3, EBS, DynamoDB, and Secrets Manager all use the same model.

Encryption of data in transit is a separate area. Each RDS instance has an X.509 certificate (issued by generation, such as `rds-ca-2019` and `rds-ca-rsa2048-g1`), and clients validate this certificate while establishing a TLS 1.2/1.3 connection. To force SSL-only connections, turn on `rds.force_ssl=1` (PostgreSQL) or `require_secure_transport=ON` (MySQL 8) in the parameter group. Because CA certificates rotate periodically (switching to `rds-ca-rsa2048-g1` in 2024), if you miss updating the application's trust store, **connections fail en masse on the day the CA expires**.

In scenarios where "SSL handshake suddenly fails," suspect CA certificate expiration. For example, AWS gave advance notice ahead of the `rds-ca-2015` certificate expiration (March 2020), but not every customer managed to switch to `rds-ca-2019`.

## IAM DB Authentication: The Way to Erase Passwords from Code

Traditional DB authentication hardcodes a user/password pair into the application. But incidents kept recurring where this password was ① committed to a code repository ② exposed in environment variables ③ printed in logs. RDS IAM Authentication aims to eliminate that password entirely.

The flow is as follows. ① The application obtains temporary credentials through an IAM role (EC2 instance profile, Lambda execution role, EKS IRSA, etc.) ② Using those credentials, it calls the `rds:GenerateDBAuthToken` API to create a **SigV4-signed token** ③ It puts that token in the DB password field to connect. The token's validity is exactly **15 minutes**, and once a token is issued, it can be used to create multiple connections within that time.

The token is actually the **query string of a presigned URL signed with AWS Signature Version 4**, which the `aws rds generate-db-auth-token` CLI outputs. The URL format is as follows (conceptual).

```
mydb.xxxx.rds.amazonaws.com:3306/?Action=connect&DBUser=appuser&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Date=...&X-Amz-Expires=900&X-Amz-Signature=...
```

At connection time, the RDS server takes this token as the password and verifies ① that the expiration time has not passed ② that the signature is valid ③ that the IAM principal has the `rds-db:connect` permission. Because the token itself contains the authentication information, the RDS server can verify it without making additional calls to KMS or STS. This is a design benefit of SigV4 (stateless, with replay risk limited to 15 minutes).

The constraints of IAM authentication that appear on the exam are as follows.

- **Supported engines**: MySQL 5.7+, MariaDB 10.4+, PostgreSQL 9.5+ — Oracle/SQL Server are not supported
- **TLS required**: Since the token must not be sent in plaintext, SSL connections are enforced
- **New connections per second limit**: ~200/second is recommended for MySQL (above that, STS and SigV4 signature verification become the bottleneck)
- **Existing DB user mapping required**: Create the user in the DB with `CREATE USER 'appuser' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS'`, and specify the `rds-db:connect` resource in the IAM policy in the form `arn:aws:rds-db:region:account:dbuser:cluster-id/appuser`

> ⚠️ **Trap**: IAM authentication is not a cure-all. Because of the short token expiration + the new-connections-per-second limit, **in very high-traffic OLTP workloads SigV4 verification can increase latency**. On the exam, "Lambda + RDS, avoid passwords" is often answered by IAM authentication, but in a "traffic that creates thousands of connections per second" scenario, the RDS Proxy + Secrets Manager combination is more appropriate. You should use token caching together with connection pooling to be stable.

```python
# Token caching pattern - commonly used in practice
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
            # Reissue 60 seconds before expiration (safety margin)
            if self._token is None or time.time() >= self._expires_at - 60:
                self._token = self.client.generate_db_auth_token(
                    DBHostname=self.host, Port=self.port,
                    DBUsername=self.user, Region=self.region)
                self._expires_at = time.time() + 15 * 60
            return self._token
```

The comparison with Secrets Manager is easy to confuse. Secrets Manager is a tool that **stores and rotates the password itself**, while IAM authentication is a tool that **eliminates the password altogether**. The two approaches involve a trade-off.

| Dimension | IAM DB Auth | Secrets Manager + password | RDS Proxy + Secrets Manager |
|------|-------------|---------------------------|------------------------------|
| Password exists | No (IAM token only) | Yes (auto-rotated) | Yes (cached by the Proxy) |
| Token/secret refresh | 15 minutes | 30 days (default) to 365 days | Automatic by the Proxy |
| New connection limit | 200/second recommended | Engine limit as is | Proxy pool limit |
| Suitable scenario | Low frequency + security emphasis | General operations | High-frequency Lambda |

## Backup: How Automated Backups Work and PITR

RDS automated backup is actually a system that **combines two different mechanisms**: ① the **storage volume snapshot** taken daily during the backup window (the same mechanism as an EBS snapshot — the first is full, later ones are incremental) and ② **transaction logs pushed to S3 every 5 minutes**. Combining the two makes Point-in-Time Recovery (PITR) possible.

```
[t-7 days daily 03:00]   [t-1 hour]    [now]
   |full snapshot      |snap        |
   v                   v            v
   ███▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
       <-- binlog/WAL uploaded to S3 every 5 minutes -->

On restore: nearest snapshot + replay the WAL/binlog after it up to the desired point
```

PITR is described as "5-minute granularity," but it is actually finer. For MySQL you can restore down to a single binlog transaction, and for PostgreSQL down to a WAL LSN (Log Sequence Number). The "5 minutes" is just the interval at which logs are uploaded to S3, and RDS also preserves in-flight logs in between as far as possible. However, if the instance suffers a catastrophic failure within the last 5 minutes, the logs in that window can be lost, so it is safe to treat the effective RPO as about 5 minutes. "When an RPO within 5 minutes is needed," automated backup + PITR is the answer.

Automated backups and manual snapshots are completely different objects. Both end up stored in S3, which makes them easy to confuse, but the difference is in the **lifecycle policy**.

| Item | Automated backup | Manual snapshot |
|------|-----------|-------------|
| Creation cycle | Daily backup window | Manual/automated (EventBridge) |
| Retention period | 0-35 days (0=disabled) | Unlimited (but cost↑) |
| When the DB instance is deleted | Deleted along with it (default) — can be converted with the Final Snapshot option | Kept as is |
| Storage cost | Free up to 100% of DB storage, GB-month charges beyond that | GB-month charges from the start |
| Copy to another Region | Not directly (possible after copying as a manual snapshot) | ✅ Copied with KMS key re-encryption |
| Share with another account | ❌ | ✅ (KMS key grant needed if encrypted) |
| PITR | ✅ | ❌ (specific point only) |

In 2017 at GitLab, a database operator confused the staging DB with the production DB and ran an `rm -rf` command on production. They tried to recover right after the incident, but most of the backup mechanisms they had prepared were not working properly (no verification), and they had to restore from the last remaining LVM snapshot, taken 6 hours earlier. With RDS automated backup + PITR, the same incident could have been restored to the point right before it (to the minute). The lesson is that for backups, **verifying restores matters more than whether they exist**. It is also the background to the emergence of AWS Backup's cross-account backup vault lock (WORM).

> ⚠️ **Trap**: **Setting the automated backup retention period to 0 days disables automated backups**, and at that moment both PITR and Read Replica creation are blocked. This is the cause of the "why can't I create a Read Replica?" scenario. Also, even when automated backups are enabled, **if you delete a DB instance without creating a Final Snapshot, all automated backups disappear** — data that must be retained must be converted to a manual snapshot or stored separately.

You should also know the relationship with AWS Backup. AWS Backup is a meta service that manages RDS, EBS, DynamoDB, EFS, and more under a single policy. If you apply **WORM (Vault Lock)** to a backup vault, no one can delete anything for a set period (ransomware defense). On the exam, the "protect RDS backups from ransomware/insider threats" scenario is answered by AWS Backup Vault Lock.

## The Three Monitoring Tools: CloudWatch, Enhanced Monitoring, Performance Insights

These three have completely different data sources, and so they answer different questions. It is an area that is easy to confuse.

| Tool | Data source | Interval | Questions it can answer |
|------|-------------|------|-------------------|
| **CloudWatch** | Outside the EC2 hypervisor (Nitro card) | 60 seconds default / 1 second detailed | "CPU, disk, and network utilization" |
| **Enhanced Monitoring** | Inside the RDS instance OS (CloudWatch Logs Agent) | 1, 5, 10, 15, 30, 60 seconds | "Which OS process is eating CPU" |
| **Performance Insights** | Inside the DB engine (native for Aurora, adapters for other engines) | 1 second (DBLoad) | "Which query is waiting on a lock" |

The metrics CloudWatch sees are values the virtualization layer observes from the outside at the hypervisor level: "this instance is using N% of CPU." So **it cannot see information inside the guest OS (per-process CPU, detailed memory, etc.)**. Enhanced Monitoring runs a small agent inside the RDS OS that reads files such as `/proc/stat`, `/proc/meminfo`, and `/proc/PID/status` every second and pushes them to CloudWatch Logs.

Performance Insights goes one step deeper, using wait event sampling inside the DB engine (an interface similar to MySQL's performance_schema and PostgreSQL's pg_stat_activity) to graph "which query is waiting on which lock right now."

The Performance Insights **DBLoad** metric is a sampled measurement of "how many active sessions there are at a given moment and which wait events they are stuck on." It is in the same family as Oracle ASH (Active Session History). The core screen of the PI console is a stacked area chart colored by wait event category (CPU, IO, Lock, Network, etc.).

The main CloudWatch metrics and their meaning are as follows.

| Metric | Threshold guide | Meaning |
|------|--------------|------|
| `CPUUtilization` | > 80% sustained | Consider upgrading the instance class |
| `DatabaseConnections` | 80% of max_connections | Connection leak or burst |
| `FreeStorageSpace` | < 10GB | Running low on storage (Auto Scaling recommended) |
| `ReadLatency`/`WriteLatency` | > 20ms | Disk I/O bottleneck or insufficient PIOPS |
| `ReplicaLag` (Read Replica) | > 30s | Asynchronous replication lag — analytic queries increase the load on the primary |
| `BurstBalance` (gp2) | < 20% | I/O burst credits about to run out |
| `DiskQueueDepth` | > 32 | I/O wait queue — throughput limit |

On gp2 storage, the moment `BurstBalance` drops from 100% to 0% is exactly when a latency spike occurs. gp3 has no burst concept and always guarantees baseline performance, so using gp3 for new instances makes this problem go away. The cause in the "RDS suddenly got slow + using gp2" scenario is BurstBalance exhaustion.

## Parameter Groups and Option Groups: The Two Axes of Engine Tuning

Because RDS blocks OS shell access, every engine setting change must go through a **parameter group**. Default groups such as `default.mysql8.0` cannot be modified — you must create and apply a custom group. Some parameters (e.g., `innodb_buffer_pool_size`) are **dynamic** and take effect immediately, while others (e.g., `binlog_format`) are **static** and require an instance restart. The answer to the "I changed the parameter but it wasn't applied" scenario is a static parameter + a missed restart.

Option groups, separate from parameter groups, **enable additional engine features**. Oracle's TDE (Transparent Data Encryption), SQL Server Audit, MySQL's MEMCACHED interface, and so on are toggled in option groups.

| Category | DB Parameter Group | DB Option Group |
|------|--------------------|-----------------|
| Target | Engine settings (memory, query cache, etc.) | Additional engine features (TDE, Audit, S3 integration, etc.) |
| Applies to | All engines | Some, such as Oracle, SQL Server, MySQL |
| Effect of change | Dynamic is immediate, static needs a restart | Most require a restart |
| Aurora only | DB Cluster Parameter Group also exists | Rarely used |

## Maintenance Windows and Minor Version Upgrades

RDS has a **30-minute maintenance window once a week**. Minor patches, OS security updates, and certificate rotation happen during this time. The default is a random window, but the operations team can set it to a low-traffic time (e.g., `sun:18:00-sun:18:30` UTC).

On a Multi-AZ instance, patching is **applied to the standby first, then the primary is patched through a failover**, so downtime is minimized to the 60-120 second failover. Single-AZ is down for the duration of the patching. The "minimize downtime during patching" scenario is answered by Multi-AZ.

```bash
# 1) Force an immediate patch (don't wait for the next maintenance window)
aws rds modify-db-instance \
  --db-instance-identifier mydb \
  --auto-minor-version-upgrade \
  --apply-immediately

# 2) Specify the maintenance window (UTC)
aws rds modify-db-instance \
  --db-instance-identifier mydb \
  --preferred-maintenance-window sun:18:00-sun:18:30
```

As a hypothetical example, a fintech startup ran RDS PostgreSQL as Single-AZ and left the random maintenance window as is, and a minor patch ran automatically at 11 AM on a Korean weekday (UTC 02:00). The DB was down for about 4 minutes, and thousands of payment transactions failed. The causes were ① no Multi-AZ ② not setting the maintenance window to a low-traffic time. Both are things that a console toggle can fix.

## Secrets Manager + RDS Password Rotation: How Is It Zero-Downtime

Secrets Manager stores the RDS password and periodically issues a new one with an AWS-provided rotation Lambda (or Secrets Manager native rotation, since 2022). The reason zero-downtime rotation is possible is the **staged secret model (AWSPREVIOUS / AWSCURRENT / AWSPENDING)**.

```
At the start of rotation:
  AWSCURRENT = "old password"   ←── in use by the application
  AWSPENDING = "new password candidate"

Rotation in progress:
  1. Try changing the RDS password to AWSPENDING (the DB recognizes it too)
  2. Verify: confirm a DB connection succeeds with AWSPENDING
  3. Label swap: AWSPENDING → AWSCURRENT, the old one demoted to AWSPREVIOUS
  4. AWSPREVIOUS stays valid for a while (in case of rollback)

On the application side:
  - Fetch the secret from Secrets Manager on every request (or cache + TTL)
  - The next connection uses the new password as soon as it changes
```

Since MySQL 8.0, MySQL provides a feature that lets one user hold two passwords at the same time (`ALTER USER ... IDENTIFIED BY ... RETAIN CURRENT PASSWORD`), and Secrets Manager rotation uses this feature. While the two passwords briefly coexist, existing connections are not dropped, and new connections connect with the new password. This is the technical basis of "zero-downtime rotation." If you use RDS Proxy as well, the Proxy automatically fetches the new password and refreshes backend connections, so the application code does not even need password-fetching logic.

## CloudWatch Logs Integration and Auditing

RDS can **automatically send engine logs (Error, General, Slow Query, Audit) to CloudWatch Logs**. However, it is disabled by default — you must turn it on with the "Log exports" checkbox in the console. Once enabled, logs are pushed in real time to the log group `/aws/rds/instance/<dbid>/<logtype>`, and you can run SQL-like queries with CloudWatch Logs Insights.

```sql
-- CloudWatch Logs Insights: top 10 slow queries in the last hour
fields @timestamp, @message
| filter @logStream like /slowquery/
| parse @message /Query_time: (?<query_time>\d+\.\d+)/
| sort query_time desc
| limit 10
```

In environments that require auditing (HIPAA, PCI-DSS, SOC 2), enable the Audit log + CloudTrail RDS data events together and push them to a KMS-encrypted log group. The answer to the "track who did what in the DB" scenario is the flow of Audit log → CloudWatch Logs → CloudWatch Logs Insights.

## Summary

RDS security and operations come down to two principles.

- **Separate secrets (keys, passwords) from people and code** — KMS, IAM Auth, Secrets Manager.
- **Assume incidents will happen and verify recoverability in advance** — automated backups, PITR, AWS Backup Vault Lock, the three monitoring tools.

The lesson of the Capital One incident is that the question to ask is not "is RDS secure" but "is what surrounds RDS (the metadata endpoint, IAM roles, S3 backup permissions) secure." The exam scenarios follow this incident's pattern too: password exposure, no backup protection, no monitoring.

In the next post, we go one step deeper into RDS cost optimization and troubleshooting — Reserved Instances, Aurora Serverless v2, slow query diagnosis, and handling connection storms.

---

## 📝 Practice Questions

**Question 1.** A financial company must convert an unencrypted RDS MySQL instance in operation to KMS encryption while minimizing downtime. What is the correct procedure?

A) In the console, "Modify" → turn on the Encryption toggle and apply immediately
B) Create a snapshot → copy the snapshot with the encryption option → restore a new instance from the copied snapshot → switch the application endpoint
C) Run `aws rds modify-db-instance --storage-encrypted`
D) Turning on Multi-AZ encrypts it automatically

**Answer: B**

Explanation: RDS can set encryption only at creation time, so converting unencrypted to encrypted must go through the snapshot path. ① Create a snapshot of the existing instance ② Create an encrypted copy with the `copy-db-snapshot --kms-key-id` option ③ Restore a new instance from the copy with `restore-db-instance-from-db-snapshot` ④ Switch the application endpoint to the new instance (or switch gradually with Route 53 weighted routing). Downtime occurs only briefly at the endpoint switch. A) and C) are operations RDS does not support. D) Multi-AZ is an availability feature and has nothing to do with encryption.

---

**Question 2.** A Lambda function connecting to RDS MySQL should not keep the password in code or environment variables. It is a low-frequency workload with about 100 invocations per hour. What is the most appropriate authentication method?

A) Store the password in a Lambda environment variable (KMS encrypted)
B) Store it in AWS Secrets Manager + Lambda fetches it
C) RDS IAM Database Authentication
D) Parameter Store SecureString

**Answer: C**

Explanation: ① The security goal is to eliminate the password itself ② With low frequency (100 per hour = 0.03 per second), the IAM token issuance load is negligible. C is the cleanest. B) is also a possible answer, but the password still exists and a rotation policy is needed. A) and D) expose it close to plaintext in environment variables/SSM, so they fail the "don't keep the password in code/environment" requirement. On the exam, "Lambda + RDS + avoid passwords + low frequency" is IAM authentication, and "high-frequency Lambda + connection stability" is answered by RDS Proxy + Secrets Manager.

---

**Question 3.** Which of the following statements about RDS automated backups and manual snapshots is correct?

A) Automated backups can be copied directly to another Region
B) Manual snapshots are kept even after the DB instance is deleted
C) Automated backups are retained indefinitely
D) Manual snapshots support PITR

**Answer: B**

Explanation: B is correct. Manual snapshots are kept even if the DB instance is deleted, until you issue a separate delete command (charges continue). A) Automated backups cannot be copied to another Region — they must be converted to a manual snapshot and then copied. C) Automated backups are kept at most 35 days. D) PITR (Point-in-Time Recovery) uses the automated backup's transaction logs, so it is not possible with a manual snapshot, which can only restore to that specific snapshot point.

---

**Question 4.** On a running RDS PostgreSQL instance, a particular query suddenly became slow, and you need to find out "which wait event is the cause." What is the most suitable tool?

A) The CloudWatch CPUUtilization graph
B) The process list in Enhanced Monitoring
C) Performance Insights
D) VPC Flow Logs

**Answer: C**

Explanation: "Which wait event is the query stuck on" is information inside the DB engine, and Performance Insights is designed to answer exactly this question. PI's DBLoad chart shows active sessions as a stacked area by wait event (CPU, IO:DataFileRead, Lock:tuple, etc.). A) CloudWatch shows only instance-level metrics (CPU, IOPS) and cannot tell which query is responsible. B) Enhanced Monitoring is at the OS process level and does not show DB-internal wait events. D) Flow Logs show only network traffic.

---

**Question 5.** In RDS MySQL you want to change `binlog_format` from `ROW` to `STATEMENT`. You modified the value in the parameter group, but it was not applied immediately. What are the cause and the fix?

A) Insufficient IAM permissions — add `rds:ModifyDBParameterGroup`
B) `binlog_format` is a static parameter — the DB instance must be restarted
C) Possible only on Multi-AZ instances — cannot be changed on Single-AZ
D) Possible only on Aurora

**Answer: B**

Explanation: RDS parameters are of two kinds: **dynamic** (applied immediately) and **static** (require an instance restart). `binlog_format` is static, so after changing the parameter group you must run `aws rds reboot-db-instance`. The "Pending reboot" indicator in the console tells you about this situation. A) is not a permissions problem but a characteristic of how the engine behaves. C) and D) are unrelated.

---

**Question 6.** A company wants to delete an instance that has both RDS automated backups and manual snapshots. Which are retained after the deletion?

A) Only automated backups
B) Only manual snapshots
C) Both
D) Both disappear

**Answer: B**

Explanation: When a DB instance is deleted, ① automated backups are deleted along with it (though at deletion you can create a manual snapshot of the final point with the "Final snapshot" option) ② manual snapshots are kept as is. To "permanently preserve the data from right before deletion," you must create a Final snapshot or create a manual snapshot beforehand. If you enable the automated backup retain option (a 2021 feature), automated backups are kept for a while even after the instance is deleted, but the default behavior is to delete them along with the instance.

---

**Question 7.** A healthcare SaaS stores PII (personally identifiable information) in RDS, and HIPAA audit requirements mean it must keep "who ran which queries" for 1 year. What is the most appropriate configuration?

A) Enable Performance Insights
B) Enable the Audit log and export it to CloudWatch Logs → set 1-year retention on a KMS-encrypted log group
C) Enable Enhanced Monitoring
D) Use RDS Proxy logs

**Answer: B**

Explanation: For audit requirements, the DB engine audit log is the answer. Enable it with the `MARIADB_AUDIT_PLUGIN` option group for MySQL, or the `pgaudit` extension for PostgreSQL. When exported to CloudWatch Logs, KMS encryption, IAM-based access control, and retention policies (such as 1 year) can all be applied as standard features. A) Performance Insights is a performance analysis tool, not an audit tool. C) Enhanced Monitoring is OS metrics only. D) RDS Proxy logs contain only connection metadata, not an audit of the query text.

---
