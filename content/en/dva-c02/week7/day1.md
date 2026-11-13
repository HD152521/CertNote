# Day 1 - RDS: The Two Faces of a Managed RDBMS, Multi-AZ and Read Replicas

People who are new to RDS usually ask, "I can just install MySQL on EC2, so why bother with RDS?" The answer is not mere convenience. RDS is a promise that "AWS takes on the operation of a relational database (Day-2 ops), which is in fact the heaviest and most error-prone area." Minor patching, backups, log rotation, failover automation, storage scaling - all of it is done with a console toggle or a single API call.

RDS matters on the DVA-C02 exam for more than just being a "database option." It shows up as a candidate in scenario questions that ask **which data store a compute service such as Lambda, API Gateway, or ECS should choose**. So you need to first sort out the difference between Multi-AZ and Read Replicas, and how both diverge from Aurora and DynamoDB.

## The Origin of RDS: "Where the DBA Used to Be"

RDS launched in October 2009. At the time, AWS already dominated the IaaS market with EC2 (2006) and S3 (2006), but the trend of "just install the DB yourself on EC2" spread surprisingly slowly. The reason was the absence of DBAs. A startup could easily spin up MySQL on EC2, but when the nightly backup broke, nobody was there to recover it. Companies that lost their data once and never recovered piled up.

RDS was built to fill that gap. Its core value proposition is to push **automated backups, automated patching, and automated failover** down to option-toggle level, providing an RDBMS that teams without a DBA can operate. This is the essence of the "EC2 self-managed vs. RDS managed" comparison that appears on the exam. EC2 takes on both freedom and responsibility; RDS gives up some freedom in exchange for handing responsibility to AWS.

| Comparison dimension | Installed directly on EC2 | RDS | Aurora |
|----------|----------------|-----|--------|
| OS/engine patching | Manual | Automatic by AWS (maintenance window you specify) | Automatic by AWS |
| Automated backups | Manual cron | Automatic (1-35 days retention) | Automatic + Backtrack |
| Failover | Manual HAProxy/Keepalived setup | Multi-AZ (1-2 min automatic) | Within 30 seconds |
| Storage | Manual EBS expansion | Auto Scaling option | 10 GB-128 TB automatic |
| Superuser privileges | ✅ | ❌ (except `rdsadmin`) | ❌ |
| SSH access | ✅ | ❌ | ❌ |
| Custom OS monitoring | ✅ | Enhanced Monitoring only | Same |
| Price (same specs) | Instance + EBS | About 20-30% premium | About 50% premium (5x performance) |

What the customer handles in RDS is only DB parameter groups, user permissions, schemas, and data; everything beneath that is AWS's responsibility.

There are six supported engines. **MySQL, PostgreSQL, and MariaDB** are open source with no license fees, while **Oracle and SQL Server** carry separate commercial licenses (Oracle allows BYOL; SQL Server allows License Included only).

**Aurora MySQL/PostgreSQL** is a separate engine in which AWS keeps compatibility but completely redesigns the storage and replication layers; it is a variant of RDS, but its internal architecture is entirely different (covered in detail on Day 34).

## Multi-AZ: The Internals of Synchronous Replication and Automatic Failover

In one line, Multi-AZ is the mechanism where "you keep a standby in a different AZ, hold it in an identical state through synchronous physical replication, and when the primary dies, move the DNS endpoint to the standby."

Both exam questions and real-world incident causes are packed into this single line.

First, the meaning of **synchronous physical replication**. The usual binlog-based replication in MySQL/PostgreSQL is logical replication. RDS Multi-AZ instead uses block-level replication at the storage layer beneath, similar to EBS Multi-Attach (strictly speaking, DRBD-style synchronous block replication). When a client sends a commit, the primary **cannot return OK to the client until it receives the write ack from the standby**. This is the essence of synchronous replication, and the reason RPO (Recovery Point Objective) gets close to zero.

```
              [Client]
                  | commit
                  v
            [Primary RDS] (AZ-a)
                  |
                  | EBS block synchronous replication (inter-AZ RTT 1-2 ms)
                  v
            [Standby RDS] (AZ-b)
                  |
                  | write ack
                  ^
              commit OK to [Client]
```

Because inter-AZ RTT is 1-2 ms, Multi-AZ has a performance cost. A transaction's commit latency grows by an average of +1-2 ms compared with single-AZ. In an OLTP workload around 10,000 TPS, this latency multiplies with connection pool depth and can reduce throughput. In the field, this is described as "Multi-AZ takes roughly a 10-15% performance penalty in exchange for RPO of approximately 0." If you pick Multi-AZ as the answer in a "performance first" scenario, you fall into a trap.

There are six failover triggers: (1) primary AZ failure, (2) primary instance failure, (3) network partition, (4) DB instance class change (scale-up), (5) OS patching, (6) manual `reboot --force-failover`. Cases 5 and 6 are intentionally triggered by the operator. The failover itself typically takes **60-120 seconds**. Because the DNS TTL is short (usually 5-30 seconds), an application with connection retry logic reconnects automatically.

> ⚠️ **Trap**: "Can read queries be processed on the Multi-AZ standby?" - **In the traditional Multi-AZ DB Instance Deployment, no.** The standby exists only to wait for failover and to offload backup I/O. The **Multi-AZ DB Cluster Deployment** (MySQL/PostgreSQL only), introduced in 2022, has two read-capable standbys, so reads on the standby are possible. In a scenario that says "Multi-AZ, but I want to read from the standby," choose the latter.

Comparing with other clouds makes the design philosophy clearer.

| Dimension | AWS RDS Multi-AZ | GCP Cloud SQL HA | Azure Database for MySQL Flexible Server |
|------|------------------|------------------|------------------------------------------|
| Replication method | Block-level synchronous | Regional persistent disk (block synchronous) | Binlog-based synchronous |
| Failover time | 60-120 seconds | Within 60 seconds | 60-120 seconds |
| Standby reads | Not possible (possible in Cluster mode) | Not possible | Separate Replica option |
| Price | 2x (standby instance cost) | About 2x | Zone-redundant HA about 2x |

On August 23, 2019, a bug in the cooling system control software in one AZ of the AWS Tokyo Region (`ap-northeast-1`) overheated some servers, and EC2, EBS, and RDS were affected for about 6 hours. RDS configured as Multi-AZ failed over automatically and the standby in the other AZ became the primary, but **RDS deployed as Single-AZ went down together with the EBS in the same AZ**. The lesson is clear. RDS data is tied to the EBS of a single AZ, so Single-AZ is a Single Point of Failure.

## Read Replicas: Scaling Reads with Asynchronous Replication

A Read Replica solves a completely different problem from Multi-AZ. Where Multi-AZ solves **availability**, a Read Replica solves **scalability**, and only for read traffic at that.

Internally it uses **logical asynchronous replication**. MySQL uses the binlog, and PostgreSQL uses WAL streaming replication. When the primary commits a transaction, the change is written to the binlog/WAL, and the replica's IO thread pulls it and applies it to its own storage. **The primary does not wait for the replica's ack** - so there is almost no impact on primary performance, but in exchange the replica can always fall behind the primary by a few milliseconds to tens of seconds (replication lag).

```python
# Real-world pattern: separate read/write routing
import pymysql
from contextlib import contextmanager

WRITER_HOST = "mydb.cxxxx.ap-northeast-2.rds.amazonaws.com"
READER_HOSTS = [
    "mydb-ro-1.cxxxx.ap-northeast-2.rds.amazonaws.com",
    "mydb-ro-2.cxxxx.ap-northeast-2.rds.amazonaws.com",
]

@contextmanager
def write_conn():
    conn = pymysql.connect(host=WRITER_HOST, user="app", ...)
    try: yield conn
    finally: conn.close()

@contextmanager
def read_conn():
    import random
    host = random.choice(READER_HOSTS)  # simple load balancing
    conn = pymysql.connect(host=host, user="app_ro", ...)
    try: yield conn
    finally: conn.close()

# Usage
def get_user_profile(user_id):
    with read_conn() as c:  # reads go to a replica
        return c.execute(...)

def create_order(order):
    with write_conn() as c:  # writes go to the primary
        return c.execute(...)
```

> ⚠️ **Trap (the Read-Your-Writes problem)**: In a scenario where "a user who just INSERTed an order immediately views their order list," if the replica has lag, the order they just created will not appear. There are three resolution patterns. (1) Read from the primary for N seconds right after a write within the same session. (2) Use an engine such as Aurora whose lag is in milliseconds.
(3) Put the commit timestamp in a session token/cookie and check that the replica has applied data past that point. This is the **session consistency** (or **monotonic read consistency**) guarantee pattern from distributed systems.

A Read Replica's asynchronous replication is the **eventually consistent** model of distributed systems. It is closer to an AP system that gives up some strong consistency for write availability and read scalability.

The Read Replica constraints that appear on the exam are as follows.

- **Maximum count**: RDS MySQL/MariaDB/PostgreSQL/SQL Server allow up to **15** read replicas per source DB instance in the same Region. Oracle follows its own engine documentation. An Aurora cluster allows up to **15** Aurora Replicas.
- **Multi-tier chained replicas**: possible in MySQL (a replica of a replica); PostgreSQL supports cascading replication.
- **Cross-Region Read Replica**: asynchronous replication to another Region. For DR purposes + global read distribution. Data transfer costs apply.
- **Promote**: converts a replica into an independent primary. Once promoted, **reverse replication is not possible** - it becomes a new primary. This connects to DR scenarios.
- **Automated backups required**: to create a Read Replica, automated backups must be enabled on the source DB (retention period >= 1 day). This is a cause in "Read Replica creation fails" scenarios.

## Multi-AZ vs. Read Replica: Deciding with One Table

The reason the two features get confused is that **both involve "separated AZs."** But the problems they solve are different.

| Dimension | Multi-AZ | Read Replica |
|------|----------|--------------|
| Purpose | HA / DR | Read scaling + (optional) DR |
| Replication method | Synchronous block-level | Asynchronous logical |
| Consistency | Strong (RPO≈0) | Eventual (lag exists) |
| Standby reads | ❌ (✅ in Cluster mode) | ✅ |
| Automatic failover | ✅ (60-120 seconds) | ❌ (manual promote) |
| Maximum count | 1 standby | 15 (MySQL/PG) |
| Cross-Region | ❌ (single Region) | ✅ |
| Additional cost | 2x instances | Per replica instance |
| Scenario keywords | "high availability", "automatic failover", "DR" | "read load", "analytics queries", "geographic distribution" |

The two features **can be used together**. A common production combination is "Multi-AZ + 2-3 Read Replicas." Multi-AZ handles single-AZ failure, while Read Replicas handle read traffic distribution and isolating analytics queries. When "high availability + analytics workload isolation" appear together, both are the answer.

## RDS Proxy: The Fix for the Lambda x RDS Connection Storm

On the DVA exam, RDS Proxy appears as a correct-answer candidate in Lambda scenarios. This is because it resolves the **classic anti-pattern of the Lambda + RDS combination**.

The problem: Lambda spawns and dies a container per request. If 1,000 concurrent invocations arrive, 1,000 Lambda functions each open a new TCP connection to RDS. MySQL uses roughly 256 KB to 1 MB of memory per connection, and max_connections is around 100-1,000 depending on the instance class. In other words, a single burst of traffic makes RDS stall with a "Too many connections" error.

RDS Proxy places a **connection pool** in between. Lambda connects to the proxy, and the proxy reuses connections it has pre-established to RDS. Result: RDS's actual connection count is fixed at the proxy pool size and decoupled from Lambda concurrency.

| Effect | Figure |
|------|------|
| Connection reuse | Up to 66% reduction in RDS connection usage |
| Failover time | 66% reduction in failover time as experienced by clients |
| IAM authentication integration | DB access with the Lambda execution role |
| Secrets Manager integration | Supports automatic password rotation |

RDS Proxy internally uses two modes, **multiplexing** and **connection pinning**. Multiplexing interleaves multiple client requests onto a single backend connection (the most efficient mode). However, if you use session variables such as `SET` inside a transaction, or `LOCK TABLES`, prepared statements, or temp tables, the proxy switches to **pinning** and ties a backend connection to that client. When pinning becomes frequent, the connection pool effect effectively disappears, so you should monitor the CloudWatch `DatabaseConnectionsCurrentlySessionPinned` metric.

## Hands-On with the CLI

```bash
# 1) Create RDS with Multi-AZ
aws rds create-db-instance \
  --db-instance-identifier mydb \
  --db-instance-class db.t3.medium \
  --engine mysql \
  --master-username admin \
  --master-user-password "$(aws secretsmanager get-random-password --output text --query RandomPassword)" \
  --allocated-storage 20 \
  --multi-az \
  --backup-retention-period 7 \
  --storage-encrypted

# 2) Create a Read Replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier mydb-ro-1 \
  --source-db-instance-identifier mydb

# 3) Manually trigger a failover (for testing)
aws rds reboot-db-instance \
  --db-instance-identifier mydb \
  --force-failover

# 4) Promote the replica to an independent DB
aws rds promote-read-replica \
  --db-instance-identifier mydb-ro-1
```

## Wrapping Up

RDS's two core features directly embody two trade-offs of distributed systems. **Multi-AZ uses synchronous replication between AZs to secure availability while maintaining strong consistency** (CP within the same Region). **Read Replicas weaken consistency and use asynchronous replication to scale reads** (AP). Using both tools together enables production-grade RDBMS operations.

In the next article, we will look at another core area of RDS - encryption, IAM authentication, backups, and monitoring. We will also see why incidents like Capital One's happened, and how IMDSv2 and IAM DB Authentication grew out as the answer.

---

## 📝 Practice Questions

**Question 1.** A fintech company must design an RDS architecture that satisfies all of the following requirements. (1) RPO ≈ 0 and RTO < 2 minutes during a single-AZ failure. (2) Heavy read queries from the analytics team must be isolated so they do not affect OLTP performance. (3) DR between Seoul and Tokyo must be possible. Which configuration satisfies them at the lowest cost?

A) Enable Multi-AZ only
B) Multi-AZ + 2 same-Region Read Replicas
C) Multi-AZ + 1 same-Region Read Replica + a Cross-Region Read Replica (Tokyo)
D) Aurora Global Database

**Answer: C**
Explanation: Requirement 1 is met by Multi-AZ (synchronous replication) with RPO≈0 and automatic failover in 60-120 seconds, giving RTO < 2 minutes. For requirement 2, dedicating a same-Region Read Replica to the analytics workload isolates it from the OLTP primary (or you can designate a group of analytics replicas with a custom endpoint). For requirement 3, a Cross-Region Read Replica replicates asynchronously to Tokyo, making DR possible. D) also satisfies everything, but Aurora carries about a 50% premium, so it is eliminated by the "lowest cost" condition. B) lacks cross-Region, so it fails 3. A) fails both 2 and 3.

---

**Question 2.** A Lambda function causes "Too many connections" errors on RDS MySQL during burst traffic. What is the most direct and cost-effective solution?

A) Raise the RDS instance class one step to increase max_connections
B) Lower the Lambda reserved concurrency to limit the number of connections
C) Introduce RDS Proxy for connection pooling
D) Migrate to DynamoDB

**Answer: C**
Explanation: RDS Proxy is a service built precisely to solve this problem (Lambda surge -> connection exhaustion). Connection reuse reduces RDS's actual connection usage by up to 66% and lets you keep the instance size. A) raises cost significantly and does not fix the root problem (it will blow up again if traffic grows). B) artificially limits throughput, which is a business loss. D) is an excessive solution that requires changing the data model itself. In the exam, "Lambda + RDS + connection problem" is almost always RDS Proxy.

---

**Question 3.** Which of the following statements about RDS Multi-AZ is correct?

A) You can run read queries on the standby to distribute the primary's load (default Multi-AZ DB Instance)
B) You must switch to a new DNS endpoint upon failover
C) The standby is placed on a different server within the same AZ
D) It uses synchronous block-level replication, so RPO is nearly 0

**Answer: D**
Explanation: D) is correct. With block-level synchronous replication, the ack is returned to the client after the commit reaches the standby, so RPO≈0. A) is a trap - in the default Multi-AZ DB Instance Deployment, standby reads are not possible. The Multi-AZ DB Cluster Deployment (MySQL/PostgreSQL only), introduced in 2022, allows it. B) is wrong - on failover, the same DNS endpoint resolves to the new primary IP (no application change needed). C) is wrong - the standby is always placed in a different AZ (that is the essence of Multi-"AZ").

---

**Question 4.** Which of the following is NOT a characteristic of an RDS Read Replica?

A) It can be created Cross-Region and used for DR
B) After promotion, replication from the source is severed and it becomes an independent DB
C) Because replication is asynchronous, you can read the same data immediately after a write
D) It cannot be created if automated backups on the source DB are disabled

**Answer: C**
Explanation: C) is wrong. Because replication is asynchronous, there is replication lag (usually a few ms to a few seconds, and minutes under heavy load), so querying the replica right after a write can return stale data (the Read-Your-Writes problem). The solutions are the "read from the primary for N seconds right after a same-session write" pattern or switching to Aurora Replicas (ms-level via shared storage). A) is correct (Cross-Region Read Replica is the standard DR pattern). B) is correct (after promotion, reverse replication is impossible and it is an independent DB). D) is correct (setting automated backups to 0 days causing Read Replica creation to fail is a classic trap).

---

**Question 5.** When migrating from a MySQL installed directly on EC2 to RDS, which of the following is NOT a privilege or capability you lose?

A) OS SSH access
B) DB superuser privileges (e.g., `root` for MySQL)
C) Automated backups
D) Installing a custom OS-level monitoring agent

**Answer: C**
Explanation: Automated backups are a feature you **gain** when moving to RDS (on EC2 you manually set up cron + mysqldump). A), B), and D) are all lost on RDS. RDS does not allow OS SSH access (Enhanced Monitoring lets you view OS metrics at 1-second intervals, but you cannot enter a shell). MySQL `root` is blocked, and only the `rdsadmin` user has superuser privileges, so some commands (`SUPER`, `FILE`, etc.) are restricted. Installing custom agents (such as the Datadog agent) is not possible; only Enhanced Monitoring, Performance Insights, and CloudWatch are available. This is the concrete form of the trade-off "a managed service gives up freedom and delegates responsibility."

---

**Question 6.** On RDS MySQL/PostgreSQL (not Aurora), what do you need in order to **process read queries on the standby**?

A) Add a Read Replica
B) Use the Multi-AZ DB Cluster Deployment
C) Migrate to Aurora
D) Introduce RDS Proxy

**Answer: B (A is also partially correct)**
Explanation: The key of the question is "reads on the standby." The Multi-AZ DB Cluster Deployment, introduced in 2022, has a structure of 2 readable standbys + 1 writer, so reads are possible on the standby itself (it uses synchronous quorum replication and maintains RPO≈0). A) A Read Replica is not a standby but a separate asynchronous replica, so strictly speaking it is not "standby reads" - though if the goal is read scaling, A is also valid. C) is an excessive change. D) provides only connection pooling and does not automatically split reads and writes (the application must separate endpoints). When the word "standby" is explicit in the exam, consider B first.

---

**Question 7.** A game company wants to keep leaderboard query response latency under 100 ms for users across Asia-Pacific. The data is stored in MySQL and writes occur only in the Seoul Region. What is the most suitable configuration?

A) Use only Seoul RDS Multi-AZ
B) Seoul RDS + Cross-Region Read Replicas in Tokyo and Singapore
C) Seoul Aurora Global Database (Secondary: Tokyo, Singapore)
D) DynamoDB Global Tables

**Answer: C (B is also possible, but C is superior)**
Explanation: The requirements are "global read distribution + low latency + a single write Region." B) is possible with RDS Cross-Region Read Replicas, but replication lag is on the order of seconds to tens of seconds and failover is manual. C) Aurora Global Database uses dedicated replication infrastructure to typically deliver **sub-second** replication lag (RPO on the order of seconds), a managed-failover RTO on the order of minutes, and up to 10 secondary Regions. It is better suited to "freshness-critical reads" like a game leaderboard. D) requires changing the RDBMS model to NoSQL, so migration cost is high, and it does not fit workloads that need transactions and JOINs. A) cannot provide global distribution.
