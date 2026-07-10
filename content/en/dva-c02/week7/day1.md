# Day 1 - RDS: The Two Faces of Managed RDBMS, Multi-AZ and Read Replica

When people first use RDS, they often ask, "Why not just install MySQL on EC2?" The answer is not simple convenience. RDS is a promise that "AWS takes on the operations of relational databases (Day-2 ops) — the heaviest and most error-prone area — on your behalf." Minor patching, backups, log rotation, failover automation, storage expansion — all of this ends with a console toggle or a single API call.

In the DVA-C02 exam, RDS's weight goes beyond just being a "DB option." It appears as a candidate in almost every scenario question asking "which data store should this compute service (Lambda, API Gateway, ECS) choose?" So the first task is to keep the difference between Multi-AZ and Read Replica clear in your head, and understand how they differ from Aurora and DynamoDB.

## RDS's Origin Story: "The Space Left Behind by DBAs"

RDS launched in October 2009. At that time, AWS had already dominated the IaaS market with EC2 (2006) and S3 (2006), but the trend of "let's install DB directly on EC2" spread surprisingly slowly. The reason was the absence of DBAs. It was easy for startups to spin up MySQL on EC2, but when the nightly backup failed, there was no one to recover it. Companies started losing all their data if the database crashed once.

RDS came out to fill that void. **Automatic backups, automatic patching, automatic failover** — the core value proposition is to bring these down to option toggle level, enabling teams without DBAs to operate an RDBMS. This is the essence of the "EC2 self-managed vs RDS managed" comparison frequently asked in the exam. EC2 gives both freedom and responsibility, while RDS gives up some freedom in exchange for handing responsibility to AWS.

| Comparison Dimension | Install Directly on EC2 | RDS | Aurora |
|----------|----------------|-----|--------|
| OS/Engine Patching | Manual | AWS automatic (specify window) | AWS automatic |
| Automatic Backups | Manual cron | Automatic (1-35 day retention) | Automatic + Backtrack |
| Failover | Manual HAProxy/Keepalived | Multi-AZ (1-2 min automatic) | < 30 sec |
| Storage | Manual EBS expansion | Auto Scaling option | 10GB-128TB automatic |
| Superuser Rights | ✅ | ❌ (except `rdsadmin`) | ❌ |
| SSH Access | ✅ | ❌ | ❌ |
| Custom OS-Level Monitoring | ✅ | Enhanced Monitoring only | Same |
| Price (same spec) | Instance + EBS | ~20-30% premium | ~50% premium (5x performance) |

> 💡 **Related Theory**: RDS's "managed" abstraction falls under the PaaS (Platform-as-a-Service) category as defined by NIST SP 800-145. PaaS is defined as services where "the customer does not manage the infrastructure (networks, servers, OS, storage) but controls the configuration of the deployed applications." In RDS, what the customer touches is only the DB parameter group, user permissions, schema, and data — everything below that is AWS's responsibility.

Six engines are supported: **MySQL, PostgreSQL, MariaDB** are open source with no license cost; **Oracle, SQL Server** require separate commercial licenses (Oracle allows BYOL, SQL Server only License Included). **Aurora MySQL/PostgreSQL** is a distinct engine where AWS redesigns only the storage and replication layers while maintaining compatibility — it's a variant of RDS but has completely different internal architecture (detailed in Day 34).

## Multi-AZ: The Internal Structure of Synchronous Replication and Automatic Failover

Multi-AZ can be expressed in one line: "keep a standby in a different AZ and maintain identical state through synchronous physical replication; when the primary dies, switch the DNS endpoint to the standby." But this one line hides exam questions and production incidents.

First, the meaning of **synchronous physical replication**. Most MySQL/PostgreSQL use binlog-based logical replication, but RDS Multi-AZ uses block-level replication at the storage layer, similar to EBS Multi-Attach (technically DRBD-family synchronous block replication). When a client sends a commit, the primary **cannot return OK to the client until it receives write ack from the standby**. This is the essence of synchronous replication and the secret to RPO (Recovery Point Objective) approaching zero.

```
              [Client]
                  | commit
                  v
            [Primary RDS] (AZ-a)
                  |
                  | EBS block sync replication (AZ-to-AZ RTT 1-2ms)
                  v
            [Standby RDS] (AZ-b)
                  |
                  | write ack
                  ^
              OK to [Client]
```

> 🔍 **Going Deeper**: The fact that inter-AZ RTT is 1-2ms directly determines the performance cost of Multi-AZ. A single transaction's commit latency increases by an average of +1-2ms compared to single-AZ. At 10,000 TPS OLTP workload, this latency multiplied by connection pool depth can reduce throughput. This is the basis of the operational rule that "Multi-AZ takes about a 10-15% performance penalty as the price for RPO≈0." In exams, if you choose Multi-AZ as the answer for a "performance is priority" scenario, you've fallen into a trap.

Failover is triggered by 6 circumstances: ① Primary AZ failure ② Primary instance failure ③ Network partition ④ DB instance class change (scale-up) ⑤ OS patching ⑥ Manual `reboot --force-failover`. Cases ⑤⑥ are intentionally triggered by operators. The failover itself typically takes **60-120 seconds**, and because DNS TTL is short (usually 5-30 seconds), applications with retry logic reconnect automatically.

> ⚠️ **Trap**: "Can standby process read queries in Multi-AZ Standby?" — **In traditional Multi-AZ DB Instance Deployment, no**. Standby is only for failover wait + backup I/O distribution. The **Multi-AZ DB Cluster Deployment** (introduced 2022, MySQL/PostgreSQL only) has 2 read-capable standbys allowing reads on standby. When an exam scenario says "Multi-AZ but want to read from standby," choose the latter.

Comparing with other clouds makes the design philosophy clearer.

| Dimension | AWS RDS Multi-AZ | GCP Cloud SQL HA | Azure Database for MySQL Flexible Server |
|------|------------------|------------------|------------------------------------------|
| Replication | Block-level sync | Regional persistent disk (block sync) | Binlog-based sync |
| Failover time | 60-120 sec | < 60 sec | 60-120 sec |
| Standby reads | No (Cluster mode yes) | No | Replica option separate |
| Price | 2x (standby instance cost) | ~2x | Zone-redundant HA ~2x |

> 📚 **Case Study**: August 23, 2019, AWS Tokyo region (`ap-northeast-1`). A software bug in the air conditioning control system caused some servers to overheat, affecting EC2, EBS, and RDS for about 6 hours. Multi-AZ RDS automatically failed over, with standby in another AZ becoming the primary, but **Single-AZ deployed RDS went down with the same AZ EBS failure**. The key lesson from the postmortem: "RDS data is tied to one AZ's EBS, so Single-AZ is a Single-Point-of-Failure." Japanese Mercari and some Rakuten services were affected.

## Where Is an AZ, Really: The Difference Between ZoneName and ZoneId

This comes up frequently in exams and is also a common trap in practice. Given two AWS accounts at the same company, `ap-northeast-2a` in account A and `ap-northeast-2a` in account B are **physically different AZs**. AWS deliberately shuffles the mapping per account to prevent load concentration from "everyone creates in a first."

```bash
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId]' \
  --output table

# Output:
# ap-northeast-2a   apne2-az1
# ap-northeast-2b   apne2-az2
# ap-northeast-2c   apne2-az3
# ap-northeast-2d   apne2-az4
```

The `ZoneId` (`apne2-az1`) points to the same physical AZ across all accounts. If you want to save cross-AZ data transfer costs when connecting to a partner via VPC peering or PrivateLink, you must match by `ZoneId`. If you pair a-to-a based on ZoneName alone, it's often actually cross-AZ.

> ⚠️ **Trap**: When you create your VPC subnet in `ap-northeast-2a`, it's easy to assume that putting the partner's PrivateLink in the same "a" automatically lands in the same physical AZ. Wrong. PrivateLink's endpoint network interfaces are assigned an AZ per ENI, and if the two accounts' AZ mappings differ, traffic flows cross-AZ incurring an additional $0.01 per GB. Similar costs arise after an RDS Multi-AZ failover if the client sits in a different AZ.

## Multi-AZ vs Read Replica: One Table to End All Confusion

These two get mixed up because **DNS endpoints are different and both "have separated AZs"** as a common point. But the problems they solve are different.

| Dimension | Multi-AZ | Read Replica |
|------|----------|--------------|
| Purpose | HA / DR | Read scaling + (optional) DR |
| Replication | Synchronous block-level | Asynchronous logical |
| Consistency | Strong (RPO≈0) | Eventual (lag possible) |
| Standby reads | ❌ (Cluster mode ✅) | ✅ |
| Automatic failover | ✅ (60-120 sec) | ❌ (manual promote) |
| Max count | 1 standby | 15 (MySQL/PG) |
| Cross-Region | ❌ (single region) | ✅ |
| Extra cost | Instance 2x | Per replica instance |
| Scenario keywords | "high availability", "automatic failover", "DR" | "read load", "analytic queries", "geographic distribution" |

> 💡 **Practical Pattern**: Both functions are **usable simultaneously**, and in production the most common combination is "Multi-AZ + 2-3 Read Replicas." Multi-AZ handles single-AZ failure, Read Replica handles read traffic distribution and analytic query isolation. When exam scenarios show "high availability + analytic workload isolation" together, both are correct answers.

## RDS Proxy: The Connection Storm Savior for Lambda × RDS

RDS Proxy appears in almost every DVA exam — 1-2 questions. The reason is clear — **it solves the biggest anti-pattern of the Lambda + RDS combination**.

Problem scenario: Lambda creates and destroys a container per request. When 1,000 concurrent invocations arrive, 1,000 Lambda instances each create new TCP connections to RDS. MySQL uses ~256KB ~ 1MB memory per connection, and max_connections is typically 100-1,000 depending on instance class. So a single burst of traffic causes RDS to die with "Too many connections" error.

RDS Proxy puts a **connection pool** in between. Lambda connects to the proxy, and the proxy reuses pre-created RDS connections. Result: RDS's actual connection count is fixed at the proxy pool size, decoupled from Lambda concurrency.

| Effect | Number |
|--------|--------|
| Connection reuse | Max 66% reduction in RDS connection usage |
| Failover time | 66% reduction in client-perceived failover time |
| IAM authentication integration | DB access via Lambda execution role |
| Secrets Manager integration | Automatic password rotation support |

> 🔍 **Going Deeper**: RDS Proxy internally uses two modes: **multiplexing** and **connection pinning**. Multiplexing sends multiple client requests to a single backend connection interleaved (most efficient). However, when `SET` session variables, `LOCK TABLES`, prepared statements, or temp tables are used within a transaction, the proxy **switches to pinning** mode, binding the backend connection to that client. When pinning increases, the connection pool effect essentially disappears — you should monitor the CloudWatch `DatabaseConnectionsCurrentlySessionPinned` metric.

> 📚 **Case Study**: According to AWS re:Invent 2020 presentations, Intuit suffered from connection exhaustion caused by direct Lambda → Aurora connections on its TurboTax workload, experiencing outages every tax season. After adopting RDS Proxy, it could lower the RDS instance size one notch with identical traffic and outages disappeared. Featured in AWS official blog "Improving application availability with Amazon RDS Proxy."

## CLI: Hands-On Examples

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

# 2) Create Read Replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier mydb-ro-1 \
  --source-db-instance-identifier mydb

# 3) Manually trigger failover (test)
aws rds reboot-db-instance \
  --db-instance-identifier mydb \
  --force-failover

# 4) Promote replica to standalone DB
aws rds promote-read-replica \
  --db-instance-identifier mydb-ro-1
```

## Wrapping Up

RDS's two core functions are essentially two trade-offs of distributed systems transferred directly. **Multi-AZ maintains strong consistency while securing availability by using synchronous replication within one AZ (CP). Read Replica sacrifices consistency for global read scaling by using asynchronous replication (AP)**. Using these two tools together enables production-grade RDBMS operations.

In the next article, we look at another key RDS area — encryption, IAM authentication, backups, monitoring. We see why incidents like Capital One happened and how IMDSv2 and IAM DB Authentication grew as answers.

---

## 📝 연습 문제

**문제 1.** When a boto3 client is created with `s3 = boto3.client('s3')`, how is the region determined?

A) It is always fixed to us-east-1
B) It searches the `AWS_REGION` environment variable → `AWS_DEFAULT_REGION` → the default profile in `~/.aws/config`, in that order
C) The nearest region is automatically selected
D) S3 is a global service, so the region is irrelevant

**정답: B**

해설: If no region is specified, boto3 searches environment variables and configuration files according to a priority order. The exact order is: (1) `region_name` in the client constructor, (2) the `AWS_REGION` environment variable, (3) the `AWS_DEFAULT_REGION` environment variable, (4) the `region` value of the active profile in `~/.aws/config`. If none of these yield a region, it raises `NoRegionError`. S3 bucket names live in a global namespace, but the data is stored in a specific region, so a region specification is required (exceptionally, the `s3.amazonaws.com` global endpoint also exists, but since 2020 region-aware endpoints have been recommended).

---

**문제 2.** A company is using IAM roles on EC2 instances via IMDSv1. The security team has demanded that IMDSv2 be enforced to defend against SSRF attacks. What is the most accurate action?

A) Remove the IAM role
B) Set the instance metadata options to `HttpTokens=required`
C) Move the instance to a different region
D) Block 169.254.169.254 in the Security Group

**정답: B**

해설: Setting `MetadataOptions.HttpTokens=required` rejects any request that has not obtained a token via PUT. Since SSRF attackers can typically only issue GETs, metadata access is blocked. A would prevent the application from using IAM permissions, C is unrelated to the IMDSv1 problem, and D fails because 169.254.169.254 is a link-local address and cannot be controlled by SGs (SGs operate only on ENIs). Additionally, setting `HttpPutResponseHopLimit=1` can also block metadata access from container networks.

---

**문제 3.** How is the AZ in which a Lambda function runs determined?

A) The developer specifies the AZ in the function definition
B) AWS automatically selects among available AZs and the developer has no control
C) A Lambda attached to a VPC runs in the AZs of the specified subnets, while a non-VPC Lambda is distributed internally by AWS
D) It always runs in the first AZ of the region

**정답: C**

해설: Lambda has no option to directly specify an AZ at function creation. A Lambda unrelated to any VPC (the default) is automatically distributed across the AWS-managed multi-AZ Lambda environment. A Lambda attached to a VPC (via `VpcConfig`) runs in the AZs of the subnets where its ENIs were created, so **you must specify subnets in multiple AZs to survive a single-AZ failure**. If you specify only a single-AZ subnet, Lambda invocations fail when that AZ goes down. Before 2019, VPC Lambda cold starts took 10+ seconds due to ENI creation, but with the introduction of Hyperplane ENIs in September 2019, the ENI is created only on the first invocation and reused thereafter.

---

**문제 4.** Between Global Accelerator and CloudFront, which fits the following scenario? "We must provide an MQTT-based IoT messaging service to users worldwide."

A) CloudFront (suitable for accelerating all global traffic)
B) Global Accelerator (TCP/UDP acceleration; MQTT is TCP-based)
C) Route 53 Geolocation (geography-based distribution)
D) Direct Connect (dedicated lines for all users)

**정답: B**

해설: CloudFront is centered on HTTP/HTTPS L7 caching, so it cannot handle MQTT (TCP 1883/8883). Route 53 Geolocation only branches DNS responses without accelerating the traffic itself, and failover takes minutes due to DNS TTL. Direct Connect is a dedicated line between a specific site and AWS, so it doesn't fit global user distribution. Global Accelerator pulls traffic to the nearest edge via BGP Anycast and forwards it over the AWS backbone, guaranteeing consistent latency for both TCP and UDP. Since two static IPs are guaranteed, it is also well suited for hardcoding IPs into IoT device firmware.

---

**문제 5.** A developer created an S3 bucket in us-east-1, but SDK calls from ap-northeast-2 have latency exceeding 200ms. What is the most appropriate improvement?

A) Move the S3 bucket from us-east-1 to ap-northeast-2 (impossible)
B) Create another bucket with the same name in ap-northeast-2 (impossible; globally unique)
C) Create a replica in ap-northeast-2 with S3 Cross-Region Replication and have clients access the bucket in the nearer region
D) Enable S3 Transfer Acceleration, which automatically selects the nearest region

**정답: C**

해설: An S3 bucket's region is fixed at creation and cannot be moved, and names are globally unique so the same name cannot be created in another region. You can create a differently named replica with CRR (Cross-Region Replication), or use **Multi-Region Access Points** (launched December 2020) to have a single global endpoint automatically route to the nearest regional bucket. D's S3 Transfer Acceleration routes through CloudFront edges onto the backbone, so latency improves, but it is not "automatic region selection". It also adds $0.04 per GB on uploads.

---

**문제 6.** Which of the following is NOT in the "customer responsibility" area?

A) SQL injection vulnerabilities in Lambda function code
B) MySQL engine security patches on an RDS instance
C) S3 bucket policy configuration
D) Guest OS patching on EC2

**정답: B**

해설: RDS is PaaS, so patching the DB engine is AWS's responsibility. However, the customer can choose when patches are applied via the maintenance window. A is a code vulnerability, always the customer's responsibility. C is IAM/resource policy, always the customer's responsibility. D: since EC2 is IaaS, OS patching is the customer's responsibility (conversely, if you move the same workload to ECS Fargate, even container host OS patching shifts to AWS). Memorize this pattern as "the higher the abstraction level, the higher the responsibility boundary moves" and you can solve all the variations on the exam.

---

**문제 7.** You are connecting PrivateLink to a partner via VPC peering. Both accounts placed subnets in `ap-northeast-2a`, yet traffic flows cross-AZ. What is the cause and the fix?

A) It is an AWS bug and you should open a support ticket
B) `ZoneName` maps to different physical AZs per account, so you must compare and match using `ZoneId` (`apne2-az1`, etc.)
C) VPC peering always operates cross-AZ
D) The regions must be made the same (they already are)

**정답: B**

해설: AWS deliberately shuffles the AZ mapping per account to prevent load concentration from "everyone creating in a first". Account A's `ap-northeast-2a` (`apne2-az1`) and account B's `ap-northeast-2a` (`apne2-az3`) are physically different AZs. Check the ZoneId with `aws ec2 describe-availability-zones` and place subnets in the same ZoneId to land in the same physical AZ. Cross-AZ data transfer costs $0.01 per GB ($0.02 round-trip) and accumulates quickly with high-volume traffic, so recognizing this trap matters in practice.
