# Day 1 - RDS: What It Means to Run a Relational Database in the Cloud

The relational database began with Edgar F. Codd's paper "A Relational Model of Data for Large Shared Data Banks" (CACM, 1970), published while he was at IBM Research. More than 50 years later, the overwhelming majority of OLTP workloads still run on top of the relational model. AWS RDS is a service that dramatically reduces the burden of operating that decades-old technology in the cloud. Once you dig deep into what "managed" concretely means, and why Multi-AZ and Read Replicas were built for different purposes, half of the SAA-C03 database questions solve themselves.

## The Problem RDS Solves — The Weight of Running Your Own DB

Anyone who has installed and run MySQL directly on EC2 knows the drill. OS patching, MySQL version upgrades, slow-query monitoring, binary log management, cron-scheduled backup scripts, storage capacity alarms… all of it lands on the DBA or the operations engineer. RDS takes a large chunk of that burden off your hands.

What RDS manages: hardware provisioning, database software installation and patching, automated backups, point-in-time recovery, monitoring dashboards, Multi-AZ replication. What RDS does not manage: query optimization, schema design, index strategy, application-level encryption, IAM policy configuration. The shared responsibility model is at work here too.

> 💡 **Related theory**: RDS falls under PaaS (Platform as a Service) as defined by NIST SP 800-145. The customer is responsible only for the "application on top of the platform," while the platform (DB engine, OS, network infrastructure) belongs to AWS. Your own MySQL on EC2 is IaaS, where everything from guest OS patching on up is the customer's responsibility. This difference is the key branch point for "whose responsibility is it?" questions on the exam.

## The 6 Engines and How to Choose

RDS supports MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, and Aurora. Aurora starts from the same RDS console but has a completely different internal architecture, so we'll cover it separately tomorrow. The other 5 are "managed versions of community/commercial engines," and they behave almost exactly like their on-premises counterparts.

The engine choice is mostly determined by the existing application. A company that already holds Oracle RAC licenses picks RDS Oracle; a legacy app deeply dependent on SQL Server stored procedures picks RDS SQL Server. For a greenfield project, it's common to choose MySQL or PostgreSQL — which have no open-source license cost — or to go with Aurora from the start.

| Engine | Open Source | MySQL Compatible | PG Compatible | Notes |
|--------|-------------|------------------|---------------|-------|
| MySQL | O | - | - | The most widely chosen option |
| PostgreSQL | O | - | - | Strong at JSON, GIS, extensibility |
| MariaDB | O | Mostly | - | Forked from MySQL, some feature differences |
| Oracle | X (commercial) | - | - | BYOL or License Included |
| SQL Server | X (commercial) | - | - | Windows auth, AD integration |
| Aurora | AWS-only | O (MySQL-compatible) | O (PG-compatible) | Deep dive tomorrow |

> ⚠️ **Pitfall**: Oracle and SQL Server also do not allow guest OS access on RDS. Apps that depend on OS-level customization on-premises must have their dependencies verified before migration.

## Multi-AZ — Seeing How High Availability Works From the Inside

Many people know that Multi-AZ uses synchronous replication, but few understand exactly how that synchronous replication works. Once you grasp the internal mechanics, exam questions like "why can't Multi-AZ handle read traffic?" also fall into place naturally.

MySQL RDS Multi-AZ uses Amazon's proprietary replication technology (block-level or page-level replication, not MySQL's binlog replication). When the Primary receives a write, it synchronously ships the same data to the Standby, and the transaction commits on the Primary only after the Standby sends back an acknowledgment. During this process the Standby applies the data but does not accept application connections. The Standby is merely a "hot standby" for failover.

```
Client → RDS Endpoint (CNAME)
                   │
                   ▼
            [Primary AZ-a]  ← handles both reads and writes
                   │  synchronous replication (1-2ms inter-AZ RTT)
                   │  Standby ack required before Primary ACK
                   ▼
            [Standby AZ-b]  ← receives replication only, no traffic
                   │
                   └─ on failure, CNAME repointed to the Standby
                      (usually 60-120s, varies with DNS TTL)
```

When a failover occurs, two things happen. First, RDS promotes the Standby to the new Primary. Second, the DNS CNAME record is updated to point to the new Primary's IP. Because of this, if the application uses the RDS Endpoint (a DNS name), the connection automatically switches to the new Primary after the DNS TTL. If you hardcode the IP address, you get the disaster of continuing to attempt connections to the dead Primary even after failover.

> 💡 **Related theory**: This design resembles a variant of "2PC (Two-Phase Commit)," the synchronous replication pattern of distributed systems. It's a structure where the Primary does a Prepare and must receive the Standby's Acknowledge before the Commit completes. This structure strongly guarantees Consistency, but has the trade-off that if the Standby is slow or the inter-AZ network is cut, the Primary's write latency increases. AWS minimizes this trade-off with dedicated low-latency fiber between AZs (usually 1-2ms RTT). This is why Multi-AZ's RPO is effectively 0 — because a Primary commit is impossible without the Standby ack.

> 🔍 **Going deeper**: RDS Multi-AZ Cluster is a new option launched at the end of 2021. Unlike the traditional Multi-AZ (1 Primary + 1 Standby), it consists of 1 Writer + 2 Readable Standbys. The Readable Standbys can handle read traffic, so read performance improves over traditional Multi-AZ, and failover time is shortened to within 35 seconds. On the SAA-C03 exam, this Multi-AZ Cluster is sometimes tested as distinct from plain "Multi-AZ," so be careful. Unless the exam scenario explicitly states "readable standby" or "multi-az cluster," it's safest to assume the standard 1+1 structure.

> 📚 **Case study**: In October 2013, Dropbox migrated from Amazon RDS to its own MySQL cluster (what it later called Edgestore). One of the reasons was that the connection-drop time during RDS Multi-AZ failover made it hard to meet their SLA. For financial-sector or global services like this, a 60-120 second RDS Multi-AZ failover can be at an unacceptable level, and in those cases you should move to Aurora (failover within 30 seconds) or Aurora Global Database.

## Read Replica — The Possibilities and Limits Created by Asynchronous Replication

A Read Replica is a completely different mechanism from Multi-AZ, technically. For MySQL and PostgreSQL, each DB engine uses its own native asynchronous replication (MySQL: binlog replication; PostgreSQL: streaming replication / logical replication). When the Primary commits a transaction, that change is asynchronously shipped to the Replica. "Asynchronously" means the Primary doesn't wait for the Replica's response — it tells the client "commit succeeded" right away.

The consequences of this structure:
- **The Replica can handle read traffic** — unlike a Multi-AZ Standby, it accepts actual connections.
- **The Replica may lag slightly behind the Primary (Replication Lag)** — being asynchronous, there is a delay between the Primary commit and its reflection on the Replica.
- **The Replica has its own separate endpoint** — the application must explicitly use the Replica endpoint for read traffic to be distributed. An ALB does not split it automatically.

```
[Primary]  ─── write ───► DB
              async         │
              binlog/       │ (Replication Lag exists)
              streaming     ▼
           ─────────► [Read Replica 1] ← read-only connection
           ─────────► [Read Replica 2] ← read-only connection
           ─────────► [Read Replica 3 (another region)] ← Cross-Region
```

A Cross-Region Read Replica is an important disaster recovery (DR) tool. If you create a Cross-Region Read Replica from the Seoul region (ap-northeast-2) to Virginia (us-east-1), then when the Seoul region goes completely down, you can promote the Virginia Replica to Primary and keep serving. Promotion is a manual operation that can take minutes to tens of minutes, and because of the nature of asynchronous replication, data written after the last replication may be lost (RPO is not 0).

| Aspect | Multi-AZ | Read Replica |
|--------|----------|--------------|
| Purpose | High availability (HA), automatic failure recovery | Read traffic distribution, DR |
| Replication method | Synchronous (Primary ack required) | Asynchronous (lag exists) |
| Read traffic | Standby cannot serve (plain Multi-AZ) | Serves from the Replica |
| Failover | Automatic (60-120s) | Manual promote required |
| Cost | Primary + Standby (2×) | Primary + N Replicas (N+1×) |
| Cross-region | Not possible (same-region HA) | Possible (Cross-Region) |
| RTO | 60-120s (including DNS TTL) | Minutes to tens of minutes (manual) |
| RPO | Nearly 0 (synchronous) | Seconds to tens of seconds (depends on lag) |

> 💡 **Related theory**: The Replication Lag problem of Read Replicas is directly tied to the "Eventual Consistency" concept in distributed systems. In Eric Brewer's CAP theorem, an architecture that includes Read Replicas maintains P (Partition Tolerance) and raises A (Availability), but sacrifices C (Consistency). That is, the data read from a Replica may differ from the latest state on the Primary. "Reads that always need the freshest data" must go to the Primary, while "reads that tolerate a little delay (e.g., reports, statistics, user profile lookups)" can go to a Replica.

> ⚠️ **Pitfall**: "You can distribute read traffic to a Multi-AZ Standby" — this is not possible on plain Multi-AZ. A Readable Standby is only available on Multi-AZ Cluster (launched in 2021). Exam traps that try to use Multi-AZ like a Read Replica — without knowing this difference — come up frequently.

## RDS Proxy — A Solution to a Problem Created by the Lambda Era

Before Lambda became mainstream, connection pooling was the application server's job. Ten Spring Boot apps maintaining up to 100 connections to RDS was a predictable and manageable range. Then Lambda showed up and created a problem.

Lambda can create a new execution context for each request. If 1,000 Lambda functions run simultaneously, in theory 1,000 DB connections can open at once. But RDS MySQL's default max_connections is on the order of a few hundred depending on instance size. A db.t3.micro is just 66. The result: when Lambda spikes, the DB goes down with a "Too many connections" error.

RDS Proxy solves this problem with connection pooling. Thousands of Lambdas connect to the Proxy, and the Proxy maintains only a small number of connections to the DB. The Proxy assigns incoming queries to waiting DB connections and returns the connection when the query finishes. From the DB's perspective, the connection count stays stable.

Additional benefits:
- **IAM authentication integration**: The Proxy manages DB credentials in Secrets Manager, so Lambda only needs to authenticate to the Proxy with its IAM Role. The DB password doesn't have to live in Lambda environment variables.
- **Connection failover switching**: During a Multi-AZ failover, the Proxy automatically switches connections to the new Primary, shortening the application's connection-outage time (typically a 66% reduction).

```
[1000 concurrent Lambdas]
       │
       ▼
[RDS Proxy]  ←── Secrets Manager (automatic credential rotation)
       │
       │ maintains only a few connections (e.g., 50)
       ▼
[RDS Primary]  ──────── Standby (Multi-AZ)
```

> 🔍 **Going deeper**: The internals of RDS Proxy play a role similar to HAProxy. Because it parses at the protocol level (the MySQL protocol, the PostgreSQL protocol), query-level routing is also possible. For example, you can configure it to send SELECT statements to a Read Replica and everything else to the Primary. This capability separates reads and writes automatically without any application code changes. That said, this feature is more effective when used with the Proxy on an Aurora cluster.

> 📚 **Case study**: In 2020, the fintech startup Mable (a US wholesale grocery platform) kept exceeding RDS max_connections at peak times on its Lambda-based serverless architecture. After adopting RDS Proxy, it reported that DB connection counts dropped by 95% and the "Too many connections" errors disappeared. (AWS official customer case study)

## Backup Strategy — The Difference Between PITR and Snapshots

RDS backups are made up of two layers.

**Automated Backups**: When you set a retention period of 1-35 days, RDS takes a full snapshot during the designated backup window each day and uploads transaction logs to S3 every 5 minutes. Thanks to these transaction logs, Point-In-Time Recovery (PITR) to any point within the retention period is possible — specifically down to 5-minute granularity. Restoring via PITR creates a "new instance." It does not overwrite the existing instance.

**Manual Snapshots** are recovery points that the user starts directly. They have no retention period, so they remain until you delete them. Because they can be shared/copied to another region or account, they are an important tool in a DR strategy.

On Multi-AZ, snapshots are taken from the Standby. As a result, they don't affect Primary performance.

A recovery caveat: whether it's a snapshot restore or PITR, you always create a new instance, and the application must switch its connection to the new endpoint. There is no "in-place restore."

> 💡 **Related theory**: PITR leverages the "Redo Log" and "Write-Ahead Logging (WAL)" concepts from database theory. WAL is a technique of writing the log before the data change, exemplified by InnoDB's (MySQL) redo log and PostgreSQL's WAL. RDS periodically uploads these logs to S3, and on recovery it starts from the last snapshot and replays the redo log up to the desired point. This principle is why "5-minute granularity" recovery is possible — because the log files are uploaded every 5 minutes.

## Security — Layered Protection

RDS security is composed of several layers.

**Encryption**: When creating an RDS instance, you can enable encryption with a KMS key. Once set, encryption cannot be changed. To encrypt an RDS instance that was already created unencrypted, you must go through 5 steps: ① take a snapshot of the unencrypted DB → ② copy the snapshot with encryption → ③ restore a new instance from the encrypted snapshot → ④ switch the application to the new endpoint → ⑤ delete the old unencrypted instance.

Read Replica encryption: if the Primary is encrypted, a same-region Replica is automatically encrypted. A Cross-Region Replica requires you to specify a separate KMS key (KMS keys differ per region).

**Network isolation**: The principle is to place RDS in a private subnet inside a VPC. Use Security Groups to allow access only from specific application servers. Direct access from the internet is not possible.

**IAM DB authentication**: Supported on MySQL and PostgreSQL. Generate a temporary token from an IAM role and use it for DB authentication. Authentication is possible without a password. The connection is refreshed with a new token every 15 minutes.

> ⚠️ **Pitfall**: "You can SSH into an RDS instance and directly edit the MySQL configuration file" — not possible. RDS is a managed service with no guest OS access. DB engine parameters are changed through a Parameter Group. This is the biggest operational difference between your own MySQL on EC2 and RDS.

Comparing with other clouds reveals differences in design philosophy:

| Aspect | AWS RDS | GCP Cloud SQL | Azure SQL Database |
|--------|---------|---------------|--------------------|
| Multi-AZ method | Block-level synchronous replication | HA replica (synchronous) | Geo-redundant / Zone-redundant |
| Read Replica | Separately created | Separately created | Read replica (Premium only) |
| Serverless | X (Aurora Serverless v2) | Cloud SQL Serverless (Preview) | Azure SQL Serverless |
| Failover time | 60-120s | ~60s | 10-30s (Basic takes longer) |
| Managed Proxy | RDS Proxy | Cloud SQL Proxy | Built-in (SQL Database has none) |
| Encryption | KMS (at creation) | CMEK | TDE (Azure Key Vault) |

> 🔍 **Going deeper**: RDS storage is based on Amazon EBS (gp2, gp3, io1, io2). gp3 is 20% cheaper than gp2 while providing a baseline 3,000 IOPS, and you can purchase additional IOPS separately, so gp3 is recommended for most new workloads. io1/io2 are for very I/O-intensive workloads that need up to 100,000 IOPS. If you enable Storage Auto Scaling, storage automatically expands when it crosses the 70% threshold. Note that storage can only be increased, never decreased — to shrink it, you must migrate to a new instance.

## Actually Creating Multi-AZ and Read Replicas via the CLI

```bash
# Create a Multi-AZ RDS
aws rds create-db-instance \
  --db-instance-identifier prod-mysql \
  --db-instance-class db.m6i.large \
  --engine mysql \
  --engine-version 8.0.36 \
  --master-username admin \
  --master-user-password 'StrongPass123!' \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --storage-encrypted \
  --kms-key-id arn:aws:kms:ap-northeast-2:111:key/xxx \
  --backup-retention-period 7 \
  --preferred-backup-window "02:00-03:00" \
  --deletion-protection

# Read Replica (same region)
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-mysql-ro \
  --source-db-instance-identifier prod-mysql \
  --db-instance-class db.m6i.large

# Cross-Region Read Replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier prod-mysql-ro-us \
  --source-db-instance-identifier arn:aws:rds:ap-northeast-2:111:db:prod-mysql \
  --region us-east-1 \
  --db-instance-class db.m6i.large

# Create an RDS Proxy
aws rds create-db-proxy \
  --db-proxy-name prod-proxy \
  --engine-family MYSQL \
  --role-arn arn:aws:iam::111:role/rds-proxy-role \
  --auth '[{"AuthScheme":"SECRETS","SecretArn":"arn:aws:secretsmanager:...","IAMAuth":"REQUIRED"}]' \
  --vpc-subnet-ids subnet-a subnet-b \
  --vpc-security-group-ids sg-xxx

# Force a failover test (Multi-AZ)
aws rds reboot-db-instance \
  --db-instance-identifier prod-mysql \
  --force-failover

# Monitor Read Replica Lag
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value=prod-mysql-ro \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-01T01:00:00Z \
  --period 60 \
  --statistics Average
```

## Wrapping Up

We started with the simple description that RDS is "a service that reduces the burden of running a relational DB," but inside it live deep design decisions — the distributed-systems trade-off between synchronous and asynchronous replication, why connection pooling is needed, even the principles of WAL-based PITR. Multi-AZ trades the Standby not serving traffic for a guarantee of automatic failover with no data loss via synchronous replication. Read Replicas distribute read traffic through asynchronous replication and lay the foundation for Cross-Region DR. These two mechanisms are different tools for different purposes, and they're the point the exam most often tries to trip you up on.

Tomorrow we cover Aurora, which stands on RDS's foundation but chose a completely different storage architecture. Once you understand why Aurora uses 6 copies and what that Quorum write is, "why Aurora fails over faster than Multi-AZ RDS" follows naturally.

---

## 📝 연습 문제

**문제 1.** A company runs RDS MySQL, and its read traffic is 10× its write traffic. What is the most suitable way to increase read throughput without sacrificing write performance?

A) Enable Multi-AZ and serve reads from the Standby
B) Add 2-3 Read Replicas and connect the application to the read endpoint
C) Put an RDS Proxy in front to distribute connections
D) Upgrade to a larger instance class

**정답: B**
해설: A Multi-AZ Standby generally does not serve read traffic (Multi-AZ Cluster can, but that's distinct from plain Multi-AZ). A Read Replica is a read-only copy created via asynchronous replication that serves read traffic through a separate endpoint. RDS Proxy is a tool for reducing connection counts, not for increasing read throughput. An instance upgrade is expensive and doesn't solve the fundamental traffic-distribution problem.

---

**문제 2.** When 1,000 Lambda functions run simultaneously, RDS starts throwing "Too many connections" errors. How do you solve this with minimal code changes?

A) Change the RDS instance to a larger class to raise max_connections
B) Limit Lambda's reserved concurrency to 50
C) Introduce RDS Proxy to add connection pooling between Lambda and RDS
D) Add 5 Read Replicas to distribute the connections

**정답: C**
해설: RDS Proxy provides connection pooling that accepts thousands of Lambda connections while maintaining only a small number of connections to the DB. The application only needs to change its connection method to the Proxy endpoint, so code changes are minimized. A is not a fundamental fix and raises cost. B may fail to meet business needs by limiting Lambda throughput. D only distributes read-only connections and doesn't solve the write-connection problem.

---

**문제 3.** You need to convert a running unencrypted RDS instance to an encrypted state. What is the correct procedure?

A) Flip the "Enable Encryption" toggle in the RDS console
B) Stop the instance, enable encryption, then restart it
C) Take a snapshot of the current instance → copy the snapshot with the encryption option → restore a new instance from the encrypted snapshot
D) Create a Read Replica with encryption enabled and promote it

**정답: C**
해설: RDS encryption can only be set at instance creation time and cannot be changed afterward. Converting unencrypted → encrypted must be done via the snapshot-to-new-instance path. A and B are impossible operations. D is also impossible — if the Primary is unencrypted, a same-region Replica is created unencrypted too. However, a Cross-Region Read Replica can be created in an encrypted state with a separate KMS key.

---

**문제 4.** With RDS Multi-AZ enabled, the Primary instance in AZ-a fails. How does Multi-AZ contribute to recovering service with minimal downtime?

A) It fetches the latest snapshot from S3 and starts a new instance
B) It automatically promotes the AZ-b Standby to Primary and updates the DNS CNAME
C) An operator must manually trigger the failover
D) It automatically promotes an AZ-b Read Replica to Primary

**정답: B**
해설: The core value of Multi-AZ is automatic failover. When AWS detects a Primary failure, it automatically promotes the Standby to the new Primary and updates the DNS CNAME record. If the application uses the RDS DNS endpoint, it automatically connects to the new Primary after the DNS TTL. C is wrong — needing no manual intervention is exactly the advantage of Multi-AZ. D is wrong — a Multi-AZ Standby and a Read Replica are different concepts.

---

**문제 5.** You run RDS MySQL in the Seoul region (ap-northeast-2). To prepare for a full regional disaster while minimizing RPO, and to also serve read traffic from the Tokyo region (ap-northeast-1). What is the most suitable solution?

A) Enable Multi-AZ and configure a separate Multi-AZ in the Tokyo region as well
B) Create a Cross-Region Read Replica from Seoul to Tokyo, and have Tokyo users use the Replica endpoint
C) Create independent RDS instances in Seoul and Tokyo and synchronize them at the application level
D) Replicate backups to Tokyo with S3 Cross-Region Replication

**정답: B**
해설: A Cross-Region Read Replica achieves two goals at once. ① Tokyo users read from a physically nearby Replica → reduced latency. ② On a Seoul failure, promote the Tokyo Replica → DR. Since it's asynchronous replication, RPO is not 0 (a lag of seconds to tens of seconds), but it's far smaller than a full S3 backup. A is impossible — cross-region Multi-AZ doesn't exist; Multi-AZ is an inter-AZ mechanism within the same region. C has serious data-consistency problems. D can have an RPO measured in hours.

---

**문제 6.** Which statement about RDS automated-backup PITR (Point-In-Time Recovery) is correct?

A) You can recover to any minute-level point within the retention period (up to 35 days)
B) You can recover to any 5-minute point within the retention period, and it overwrites the existing instance directly
C) You can recover to any 5-minute point within the retention period, and a new instance is created
D) The retention period is up to 90 days and a manual snapshot is required

**정답: C**
해설: RDS automated-backup PITR provides recovery points at 5-minute granularity (transaction logs are uploaded to S3 every 5 minutes), and the retention period is 1-35 days. The key point is that PITR recovery creates a "new instance." The existing instance stays as is. A is wrong because it's 5-minute, not minute, granularity. B is wrong about overwriting the existing instance. D is wrong about the 90-day retention.

---

**문제 7.** An application team wants to SSH directly into the RDS instance and edit the MySQL configuration file (my.cnf). Is this possible, and what is the alternative?

A) It's possible. RDS is EC2-based, so SSH access is allowed
B) It's not possible. RDS is a managed service with no guest OS access. MySQL parameters must be changed through an RDS Parameter Group
C) It's possible. You can connect via AWS Systems Manager Session Manager
D) It's not possible. RDS parameters cannot be changed at all

**정답: B**
해설: RDS is a managed PaaS service where the user can only access the DB layer and above. Direct access to the OS or the MySQL config file is not possible. DB engine parameters (e.g., innodb_buffer_pool_size, max_connections, slow_query_log) can be changed in an RDS Parameter Group, and some parameters require a DB restart to take effect (Static Parameters). If you truly need MySQL on EC2, you must install it directly on EC2 rather than RDS — and in that case all responsibilities such as OS patching, backups, and HA setup fall on the customer.

---
