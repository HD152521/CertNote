# Day 3 - Log Analysis: Query CloudTrail/VPC Flow with Athena, OpenSearch, CloudWatch Logs Insights

Alerts tell you "something is wrong right now," but incident investigation, forensics, and threat hunting require the ability to *interrogate past logs in free form* - "what APIs did this IP call over the last 90 days," "who changed this bucket policy." On security exams, this area comes down to *distinguishing the right use of three tools* - **Athena** (large volumes of logs stored in S3, queried with SQL, serverless and pay-per-query), **OpenSearch** (near-real-time indexing, dashboards, full-text search), and **CloudWatch Logs Insights** (instantly querying logs that are already in CloudWatch Logs). The three are not competitors; they diverge according to where the data is and the time nature of the analysis.

## The Big Picture: Where Do Logs Live, and How Do You Ask Them?

```
                  ┌─ S3 (archive) ──────── Athena (SQL, serverless, low-cost long-term)
CloudTrail ───────┤
VPC Flow Logs ────┼─ CloudWatch Logs ───── Logs Insights (instant query, short-term operations)
ELB/Route53 ──────┤
App logs ──────────└─ Firehose ─── OpenSearch (indexing, dashboards, near real time)
```

There are two key questions for choosing: **(1) Where are the logs (S3 vs. CloudWatch Logs vs. an index)? (2) Is the analysis a one-off ad hoc query, or a recurring dashboard/search?**

This fork touches the classic data analysis trade-off - *schema-on-read vs. schema-on-write*. Athena leaves the raw data in S3 as is and applies the schema at query time (schema-on-read): zero ingestion cost, with a scan cost per query. OpenSearch indexes at ingestion time (schema-on-write): a constant indexing and storage cost, with fast, repeatable search. The time nature of security operations (after-the-fact investigation vs. constant monitoring) maps exactly onto this trade-off.

### Comparing the Three Tools: Cost, Latency, Purpose

Exam texts usually steer you to the answer by emphasizing one of three axes. **"Minimize cost"** means Athena, **"immediately"** means Logs Insights, **"constant dashboard"** means OpenSearch - that reflex should come first. But if you fill in the basis for that reflex with the table below, you will not be shaken by variant questions.

| Axis | CloudWatch Logs Insights | Athena | OpenSearch Service |
|----|--------------------------|--------|--------------------|
| Data location | CloudWatch Logs log groups | S3 (raw as is) | Its own index (loaded via Firehose, etc.) |
| When the schema applies | Automatic field extraction at query time | **At query time** (schema-on-read) | **At ingestion time** (schema-on-write) |
| Cost structure | Scan volume at query time + log ingestion and storage | **Scan volume at query time only** (zero ingestion cost) | **Always-on cluster** (indexing, storage, compute) |
| Query latency | Seconds | Seconds to tens of seconds (proportional to scan volume) | Milliseconds to seconds |
| Data freshness | Nearly immediate | After the logs arrive in S3 (delivery delay) | Ingestion pipeline delay (tens of seconds to minutes) |
| Suitability for long-term retention | Low (high unit price) | **High** (S3 lifecycle, Glacier) | Low (hot storage is expensive) |
| Repeated queries | Scan cost every time | Scan cost every time | **Cheap and fast thanks to the index** |
| Correlation analysis | Queries across log groups possible (limited) | SQL JOIN possible | Multi-source correlation through index patterns |
| Dashboards and alerts | Basic widget level | None (QuickSight etc. separately) | **Dashboards + Alerting built in** |
| Access control | IAM (per log group) | IAM + Lake Formation | **FGAC (per index, document, and field)** |
| Typical use | Instant lookup during incident response | Forensics, hunting, long-term tracking | Constant SOC monitoring |

The second-to-last row is often decisive on security exams. When a requirement says **"let each analyst see different logs,"** the answer is OpenSearch's fine-grained access control (FGAC) - document- and field-level control does not exist in the other two tools. Conversely, CloudWatch Logs is limited to per-log-group IAM, so you must respond with a *design that separates* sensitive logs into different log groups.

Seeing the three tools as "pick one" is a beginner's mistake. Mature organizations operate with **tiering**. The most recent few days are kept in CloudWatch Logs and OpenSearch to secure immediacy and dashboards, after that they are moved down to S3 and investigated with Athena, and very old data is pushed into the Glacier family to cut storage cost. The criterion for this tiering is not the age of the data but the **query frequency** - even a log older than 90 days is cheaper in an index if you look at it daily, and even yesterday's log is cheaper in S3 if you will look at it once a year. Phrases in exam texts such as "occasional investigation" and "constant monitoring" are signals that point to exactly this frequency.

## Athena: Interrogating S3 Logs with SQL

Athena is a serverless service that queries data in S3 with Presto/Trino-based SQL. It requires no infrastructure to be brought up and is billed in proportion to the *amount of data scanned*. CloudTrail, VPC Flow, ELB, and WAF logs all accumulate in S3, so it is the top-priority tool for after-the-fact security analysis.

### Creating the CloudTrail Table

The CloudTrail console's "Create Athena table" generates the DDL automatically, but the heart of it is the SerDe that maps the CloudTrail JSON structure.

```sql
-- CloudTrail log table (can be auto-generated from the console)
CREATE EXTERNAL TABLE cloudtrail_logs (
  eventVersion STRING,
  eventName STRING,
  eventSource STRING,
  awsRegion STRING,
  sourceIPAddress STRING,
  userIdentity STRUCT<type:STRING, arn:STRING, userName:STRING, accountId:STRING>,
  errorCode STRING,
  errorMessage STRING,
  requestParameters STRING
)
ROW FORMAT SERDE 'com.amazon.emr.hive.serde.CloudTrailSerde'
STORED AS INPUTFORMAT 'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://org-cloudtrail-bucket/AWSLogs/111122223333/CloudTrail/';
```

### A Practical Table: DDL with Partition Projection

The DDL above shows the concept but is not used as is in practice. This is because there are no partitions, so every query scans the entire bucket. The real form for dealing with an organization trail looks like this.

```sql
CREATE EXTERNAL TABLE cloudtrail (
  eventversion STRING,
  useridentity STRUCT<
    type:STRING, principalid:STRING, arn:STRING, accountid:STRING,
    accesskeyid:STRING, invokedby:STRING,
    sessioncontext:STRUCT<
      attributes:STRUCT<mfaauthenticated:STRING, creationdate:STRING>,
      sessionissuer:STRUCT<type:STRING, arn:STRING, username:STRING>>>,
  eventtime STRING, eventsource STRING, eventname STRING,
  awsregion STRING, sourceipaddress STRING, useragent STRING,
  errorcode STRING, errormessage STRING,
  requestparameters STRING, responseelements STRING, additionaleventdata STRING,
  eventid STRING, eventtype STRING, recipientaccountid STRING,
  readonly STRING, managementevent STRING, eventcategory STRING,
  resources ARRAY<STRUCT<arn:STRING, accountid:STRING, type:STRING>>
)
PARTITIONED BY (account STRING, region STRING, day STRING)
ROW FORMAT SERDE 'com.amazon.emr.hive.serde.CloudTrailSerde'
STORED AS INPUTFORMAT 'com.amazon.emr.cloudtrail.CloudTrailInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://org-cloudtrail-bucket/AWSLogs/'
TBLPROPERTIES (
  'projection.enabled'          = 'true',
  'projection.account.type'     = 'enum',
  'projection.account.values'   = '111122223333,444455556666,777788889999',
  'projection.region.type'      = 'enum',
  'projection.region.values'    = 'ap-northeast-2,us-east-1,eu-west-1',
  'projection.day.type'         = 'date',
  'projection.day.range'        = '2025/01/01,NOW',
  'projection.day.format'       = 'yyyy/MM/dd',
  'projection.day.interval'     = '1',
  'projection.day.interval.unit'= 'DAYS',
  'storage.location.template'   =
    's3://org-cloudtrail-bucket/AWSLogs/${account}/CloudTrail/${region}/${day}'
);
```

`storage.location.template` is the heart of this DDL. It *computes* the actual S3 path from the combination of partition values, so there is no need to register partitions one by one in the catalog (`ADD PARTITION`) or to run `MSCK REPAIR TABLE` periodically. This is why partition projection is effectively the standard for **logs like CloudTrail where new paths are created endlessly every day**.

> ⚠️ **Pitfall**: If you set up partition projection but then filter the period with **a column that is not a partition key, such as `WHERE eventtime > '...'`, pruning does not happen.** `eventtime` is the file's *content* and `day` is the file's *path*. Only narrowing the path reduces the files to be read. Always **apply the partition key first**, as in `WHERE day BETWEEN '2026/03/01' AND '2026/03/07'`, and then narrow again with the content columns. The presence or absence of this one line changes the scan volume by hundreds of times.

### Security Investigation Queries: What to Ask and How to Read the Results

What matters in practice is not the query itself but **which column of the result you look at and what you judge from it**. Below are the questions actually thrown in order during an investigation.

```sql
-- ① Activity summary of a suspect role: "is this role behaving differently from usual?"
SELECT
  useridentity.sessioncontext.sessionissuer.username AS role_name,
  sourceipaddress,
  count(*)                                   AS calls,
  count(DISTINCT eventname)                  AS distinct_apis,
  count(DISTINCT awsregion)                  AS regions,
  sum(CASE WHEN errorcode <> '' THEN 1 ELSE 0 END) AS errors,
  min(eventtime) AS first_seen,
  max(eventtime) AS last_seen
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND account = '111122223333'
  AND useridentity.type = 'AssumedRole'
  AND useridentity.sessioncontext.sessionissuer.username = 'app-server-role'
GROUP BY 1, 2
ORDER BY calls DESC;
```

**How to read it.** The place your eyes should go in this table is not `calls`.

- **Does `sourceipaddress` split into several rows?** An instance profile role is normally used only from a small number of IPs (that instance or the NAT). If there are several IPs, especially if IPs outside AWS ranges are mixed in, it is a strong signal that **the credentials left the instance**.
- **Is `regions` greater than 1?** If the role of a workload that runs only in Seoul is suddenly called from another Region, it is reconnaissance or creation of mining resources.
- **Is the `errors` / `calls` ratio high?** Normal automation is written to succeed, so its error rate is low. A sudden rise in the error rate is the fingerprint of **permission enumeration**.
- **Is `distinct_apis` larger than usual?** An application role usually repeatedly calls only a handful of APIs. If dozens of kinds suddenly appear, it means a human has attached.

```sql
-- ② Tracing the origin of a session: "who created this session?"
SELECT eventtime, useridentity.type, useridentity.arn, sourceipaddress, useragent,
       json_extract_scalar(requestparameters, '$.roleArn')          AS assumed_role,
       json_extract_scalar(requestparameters, '$.roleSessionName')  AS session_name
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND eventname = 'AssumeRole'
  AND json_extract_scalar(requestparameters, '$.roleSessionName') = 'i-0abc123def4567890'
ORDER BY eventtime;
```

What you get here is **the real owner of the session seen in ①**. And there is one thing to compare - if the `sourceipaddress` in ② differs from the `sourceipaddress` in ①, it means *where it was issued differs from where it was used*. It is the representative indicator of temporary credential replay.

```sql
-- ③ How permissions grew: policy changes, key creation, trust relationship edits
SELECT eventtime, useridentity.arn AS actor, eventname, errorcode,
       json_extract_scalar(requestparameters, '$.userName')   AS target_user,
       json_extract_scalar(requestparameters, '$.roleName')   AS target_role,
       json_extract_scalar(requestparameters, '$.policyArn')  AS policy_arn
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND eventsource = 'iam.amazonaws.com'
  AND eventname IN (
    'CreateUser','CreateAccessKey','AttachUserPolicy','AttachRolePolicy',
    'PutUserPolicy','PutRolePolicy','CreatePolicyVersion',
    'UpdateAssumeRolePolicy','CreateLoginProfile','UpdateLoginProfile'
  )
ORDER BY eventtime;
```

This list was not chosen arbitrarily; it is **a list of privilege escalation paths**. In particular `UpdateAssumeRolePolicy` (editing a trust policy) and `CreatePolicyVersion` (adding a new version to an existing policy) are the quiet paths - because they change *only the contents of existing things* without creating a new role or a new user, they are invisible in an audit that merely sweeps a resource list.

```sql
-- ④ Use right after access key creation: the typical pattern of securing persistence
WITH created AS (
  SELECT eventtime AS created_at,
         useridentity.arn AS creator,
         json_extract_scalar(responseelements, '$.accessKey.accessKeyId') AS new_key,
         json_extract_scalar(responseelements, '$.accessKey.userName')    AS key_owner
  FROM cloudtrail
  WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
    AND eventname = 'CreateAccessKey'
),
used AS (
  SELECT useridentity.accesskeyid AS key_id,
         min(eventtime) AS first_use,
         count(DISTINCT sourceipaddress) AS ips
  FROM cloudtrail
  WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  GROUP BY 1
)
SELECT c.creator, c.key_owner, c.new_key, c.created_at, u.first_use, u.ips
FROM created c JOIN used u ON c.new_key = u.key_id
ORDER BY c.created_at;
```

**How to read it.** The shorter the gap between `created_at` and `first_use` (within a few minutes), the more likely it is an automated attack script. And pay special attention if `creator` and `key_owner` **differ** - someone creating a key in the name of *another user* is the classic form of a backdoor.

```sql
-- ⑤ Who actually took the data (S3 data events must be turned on)
SELECT useridentity.arn AS actor, sourceipaddress,
       count(*) AS gets,
       count(DISTINCT element_at(resources, 1).arn) AS distinct_objects
FROM cloudtrail
WHERE day BETWEEN '2026/03/10' AND '2026/03/14'
  AND eventsource = 's3.amazonaws.com'
  AND eventname = 'GetObject'
  AND element_at(resources, 1).arn LIKE 'arn:aws:s3:::sensitive-exports/%'
GROUP BY 1, 2
ORDER BY gets DESC
LIMIT 30;
```

> ⚠️ **Pitfall**: An empty result from ⑤ does not mean "no one took anything." `GetObject` is a **data event** and is not recorded by default. If the trail had no S3 data event selector, object reads in that period **can never be known.** In an investigation you must distinguish "could have accessed" from "did access," and without data events you can neither prove nor disprove the latter. When an exam text says "verify who downloaded the object," whether data events were enabled is always part of what to examine.

### Determinants of Cost and Performance: Partitioning

Athena cost is proportional to the *bytes scanned*, so scanning the whole bucket every time is expensive and slow. The solution is **partitioning**.

- Manual partitions: `PARTITIONED BY (region STRING, year STRING, month STRING, day STRING)` followed by `ALTER TABLE ... ADD PARTITION`.
- **Partition Projection**: instead of registering partition metadata in the catalog one by one, it has table properties *compute* the partition range. Ideal for logs that grow endlessly by date, like CloudTrail.
- Converting to a columnar format (**Parquet/ORC**) reads only the needed columns, so scan volume drops sharply.

> 🎯 **Scenario**: If the requirement is "investigate the APIs a specific IAM role called 90 days ago while minimizing cost," the answer is Athena on the CloudTrail S3 logs + date/Region partitioning (or Partition Projection), scanning only the investigation period. Indexing all logs into OpenSearch and retaining them constantly is excessive cost for a one-off 90-day investigation. If the time nature is "one-off after the fact," Athena almost always has the cost advantage.

If the Athena `WHERE` clause uses an ordinary column rather than a partition key, partition pruning does not happen and a full scan occurs. This easily becomes the cause of a cost bomb. Also, CloudTrail's `requestParameters`/`responseElements` arrive as STRING (JSON strings), so to look at inner fields you must parse them with `json_extract`.

### Cost Guardrails: How Not to Cause a Billing Incident While Investigating an Incident

During an investigation, in a hurry, people really do throw a `SELECT *` with no `WHERE`. **Setting a scan limit on the workgroup** is the only way to structurally prevent this incident.

```bash
aws athena create-work-group --name sec-forensics \
  --configuration '{
    "ResultConfiguration": {
      "OutputLocation": "s3://sec-athena-results/",
      "EncryptionConfiguration": {
        "EncryptionOption": "SSE_KMS",
        "KmsKey": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
      }
    },
    "EnforceWorkGroupConfiguration": true,
    "BytesScannedCutoffPerQuery": 10737418240,
    "PublishCloudWatchMetricsEnabled": true
  }'
```

The four settings each prevent a different problem.

| Setting | What it prevents |
|------|------------|
| `BytesScannedCutoffPerQuery` | **The cost bomb.** Queries exceeding the limit (for example, 10 GB) are made to fail |
| `EnforceWorkGroupConfiguration` | Users bypassing the settings in individual queries |
| `SSE_KMS` on the result location | **Leakage of the investigation results themselves.** Query results contain content as sensitive as the originals |
| `PublishCloudWatchMetricsEnabled` | Being unable to see the scan volume trend (detecting abnormal use) |

The third item is often overlooked. **The Athena query result bucket is as sensitive as the original log bucket** - results like "all administrator activity last month" are left as CSV, and that bucket's permissions are often looser than the original's. A setup that strictly protects the audit logs while placing the *query results* of those logs in a bucket that can be made public has in effect bypassed the protection. The same encryption, access control, and lifecycle must be applied to the result bucket too.

### If Repeated Investigation Is Expected, Solidify It into Parquet

For investigations that must interrogate the same period repeatedly (long-running breach analysis and the like), using CTAS to **extract only the needed columns and convert them to Parquet once** sharply reduces the scan volume of all later queries.

```sql
CREATE TABLE incident_2026_03_curated
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['day'],
  external_location = 's3://sec-curated/incident-2026-03/'
) AS
SELECT
  eventtime, eventname, eventsource, awsregion, sourceipaddress, useragent,
  errorcode, useridentity.type AS identity_type, useridentity.arn AS identity_arn,
  useridentity.accesskeyid AS access_key,
  day
FROM cloudtrail
WHERE day BETWEEN '2026/03/01' AND '2026/03/31'
  AND account = '111122223333';
```

This conversion cuts cost through two layers. **Columnar storage** means that reading only `SELECT eventname` does not touch other columns, and good **compression** reduces the physical bytes. Add partition pruning on top and the scan volume shrinks multiplicatively as (fraction of columns read) × (fraction of partitions read) × (compression ratio). The key is that Athena's three cost optimization knobs - **partitioning, columnar format, and compression** - work as a multiplication, and the answer to an exam question asking for "the most effective savings" is usually a combination of these three.

## VPC Flow Logs Analysis

VPC Flow Logs record network flows (source/destination IP and port, protocol, bytes, ACCEPT/REJECT). If you send them to S3, you analyze them with Athena; if you send them to CloudWatch Logs, you analyze them with Logs Insights.

When sending Flow Logs to S3, turning on the **Parquet format + Hive-compatible prefix** options is effectively the default. The former reduces scan volume and the latter reduces the effort of registering partitions.

```sql
CREATE EXTERNAL TABLE vpc_flow_logs (
  version INT, account_id STRING, interface_id STRING,
  srcaddr STRING, dstaddr STRING, srcport INT, dstport INT,
  protocol BIGINT, packets BIGINT, bytes BIGINT,
  start BIGINT, `end` BIGINT, action STRING, log_status STRING,
  vpc_id STRING, subnet_id STRING, instance_id STRING, tcp_flags INT,
  type STRING, pkt_srcaddr STRING, pkt_dstaddr STRING,
  az_id STRING, pkt_src_aws_service STRING, pkt_dst_aws_service STRING,
  flow_direction STRING, traffic_path INT
)
PARTITIONED BY (aws_account_id STRING, aws_region STRING,
                year STRING, month STRING, day STRING)
STORED AS PARQUET
LOCATION 's3://org-flow-logs/AWSLogs/'
TBLPROPERTIES ('EXTERNAL' = 'true');

-- With the Hive-compatible prefix, partitions are recognized automatically
MSCK REPAIR TABLE vpc_flow_logs;
```

### Network Investigation Queries and How to Read Them

```sql
-- ① Detect port sweeps: how many distinct ports did one source knock on
SELECT srcaddr,
       count(DISTINCT dstport) AS ports_probed,
       count(DISTINCT dstaddr) AS hosts_probed,
       count(*)                AS flows
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'REJECT'
GROUP BY srcaddr
HAVING count(DISTINCT dstport) > 20
ORDER BY ports_probed DESC;
```

**How to read it.** The combination of `ports_probed` and `hosts_probed` tells you the *shape* of the attack.

- **Many ports / few hosts** → a **port scan** sweeping one target deeply. A specific asset has become the target.
- **Few ports / many hosts** → a **sweep** knocking on the same port widely. Looking for hosts that have a vulnerable service (for example, a specific management port).
- **Both many** → a full scan by an automated tool.
- **If the above pattern shows up as ACCEPT rather than REJECT, it is far more serious.** It means the defenses did not block it and it actually got through.

```sql
-- ② Detect bulk exfiltration: top bytes going from internal to external
SELECT srcaddr, dstaddr, dstport,
       sum(bytes)   AS total_bytes,
       sum(packets) AS total_packets,
       count(*)     AS flows,
       sum(bytes) / NULLIF(sum(packets), 0) AS avg_packet_size
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'ACCEPT'
  AND flow_direction = 'egress'
  AND NOT (dstaddr LIKE '10.%' OR dstaddr LIKE '172.16.%' OR dstaddr LIKE '192.168.%')
GROUP BY srcaddr, dstaddr, dstport
ORDER BY total_bytes DESC
LIMIT 30;
```

**How to read it.** Simply looking at the top `total_bytes` is a beginner's reading, because backups and CDN origins always take first place. There are three signals you should actually look at.

- **Does a `dstaddr` that was not on the usual list newly appear near the top?** *Novelty* rather than absolute volume is the signal.
- **Is `dstport` abnormal?** 443/80 is common, but if a bulk transfer goes out to an arbitrary high port or to something like 22/53, suspect tunneling or evasion.
- **Is `avg_packet_size` small while `flows` is very high?** That is not a bulk transfer but the shape of a **beacon** or DNS tunneling. Exfiltration is large in bytes, whereas C2 communication is **small and regular**. The two threats are caught by completely different indicators.

```sql
-- ③ Detect beacons: small communications repeating at regular intervals
SELECT srcaddr, dstaddr, dstport,
       count(*) AS flows,
       sum(bytes) AS total_bytes,
       count(DISTINCT date_trunc('hour', from_unixtime(start))) AS active_hours
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'ACCEPT'
GROUP BY srcaddr, dstaddr, dstport
HAVING count(*) > 200 AND sum(bytes) < 5000000
   AND count(DISTINCT date_trunc('hour', from_unixtime(start))) >= 20
ORDER BY flows DESC;
```

The `HAVING` clause of this query is itself the definition of a beacon - **many calls, small total volume, and unbroken all day.** Human traffic clusters in business hours and has a large total. A flow that exchanges a small amount uniformly across 24 hours is a machine, and if that machine is one we do not know, it is a problem.

```sql
-- ④ Identify the real source behind NAT
SELECT pkt_srcaddr AS real_source, srcaddr AS seen_as,
       dstaddr, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE year='2026' AND month='03' AND day='14'
  AND action = 'ACCEPT' AND flow_direction = 'egress'
GROUP BY pkt_srcaddr, srcaddr, dstaddr
ORDER BY total_bytes DESC LIMIT 20;
```

The most common misreading in Flow Logs queries is **concluding it is safe because there is no `REJECT`**. The `action` in Flow Logs only says *whether the security group/NACL allowed it*, not whether that traffic is legitimate. Data exfiltration through a properly open port 443 is all recorded as `ACCEPT`. And Flow Logs have **no payload** - you cannot know what went back and forth, only how much. If you need content inspection, you separately need Traffic Mirroring + IDS, and if you need name-based clues, you need Route 53 Resolver query logs.

> 🎯 **Scenario**: The correct combination for a question like "there are signs that a large amount of data went out from EC2 to the outside. Which logs do you use to check what?" is split into layers. **How much went out** → VPC Flow Logs (bytes, destination). **Where it went (the domain)** → Route 53 Resolver query logs. **What went out (which objects)** → CloudTrail S3 data events. **Who ordered it** → CloudTrail management events + session tracing. An option that tries to answer everything with one log is wrong. Knowing the boundary of the questions each log can answer is the core skill in this area.

In addition to the *default* fields, VPC Flow Logs let you add `tcp-flags`, `pkt-srcaddr`/`pkt-dstaddr` (the actual addresses before NAT), `flow-direction`, `traffic-path`, and so on with a custom format. In a security investigation `pkt-srcaddr` is decisive - for flows behind a NAT Gateway/load balancer, `srcaddr` appears as the intermediate node, but `pkt-srcaddr` reveals the original. You must also remember the limitation that Flow Logs contain only *metadata* and no *payload* (payload inspection is VPC Traffic Mirroring + IDS).

## CloudWatch Logs Insights: Immediate, Operations-Centered

Logs Insights is a tool for instantly querying logs that are *already in* CloudWatch Logs without separate ingestion. It uses its own query language (pipe-based). It is suited to operators quickly seeing "what is happening in this log group right now" during incident response.

```
fields @timestamp, @message
| filter eventName = "ConsoleLogin" and errorMessage = "Failed authentication"
| stats count(*) as fails by sourceIPAddress
| sort fails desc
| limit 20
```

```
# AccessDenied trend in Lambda logs
fields @timestamp, @message
| filter @message like /AccessDenied/
| stats count(*) by bin(5m)
```

### Four Practical Weapons of the Query Language

Logs Insights syntax is small, but the tools used repeatedly in investigations come down to a few.

**(1) `parse` - extract fields from unstructured logs.** From non-JSON text such as application logs or ALB logs, it pulls out only the pieces you need.

```
fields @timestamp, @message
| parse @message "user=* action=* result=*" as user, action, result
| filter result = "denied"
| stats count(*) as denials by user, action
| sort denials desc
```

**(2) `stats ... by bin()` - see the shape of time.** As seen in Day 1, it is *the shape of the curve rather than the size of the number* that gives you the judgment.

**(3) `dedup` - fold repeats and leave only unique ones.** Useful when skimming "what kinds of errors were there."

```
fields @timestamp, errorCode, eventName, userIdentity.arn
| filter ispresent(errorCode)
| dedup errorCode, eventName
| sort @timestamp desc
```

**(4) Multi-log-group queries - see the application and infrastructure on one screen.** Querying different log groups together around the incident time reveals causality. However, there is a limit to the number of log groups you can specify at once, so grouping the investigation targets in advance with a naming convention is a practical preparation task.

```
# Only authorized investigators see the masked sensitive fields in the original
fields @timestamp, @message
| filter @message like /payment/
| unmask @message
| limit 50
```

The `unmask` in the last example pairs with the data protection policy seen in Day 1. Normally you see masked values, and **only investigators with the `logs:Unmask` permission** see the original. That is, "permission to view logs" and "permission to view sensitive information" are separated - a way of applying the principle of least privilege to log viewing as well.

Features and limitations:
- Billed on the amount of data scanned within the query time range (pay-per-use similar to Athena).
- Can query across many log groups at once (cross-log-group).
- Only what is in CloudWatch Logs is a target - it cannot see S3 archives (that is Athena's domain).
- For long-term, large-volume ad hoc analysis, Athena has the advantage in cost and flexibility.

If you lump Logs Insights and Athena together as "both are query tools," you will get it wrong on the exam. The criterion is *data location*. If the logs are in CloudWatch Logs, use Logs Insights; if in S3, use Athena. If you sent CloudTrail only to S3 and not to CloudWatch Logs, you cannot see it with Logs Insights.

## Amazon OpenSearch Service: Indexing, Dashboards, Search

OpenSearch *indexes* logs to provide fast full-text search, aggregation, and dashboards (OpenSearch Dashboards). Use it when you need SIEM-style constant monitoring, complex correlation analysis, and visualization.

The typical pipeline: **log source → Kinesis Data Firehose → OpenSearch** (or CloudWatch Logs Subscription Filter → Firehose → OpenSearch). Firehose handles buffering, transformation, and delivery to indexing.

OpenSearch's strengths in security operations:
- Near-real-time indexing → near-real-time dashboards/alerts.
- Powerful full-text search and aggregation (correlating multiple log sources in one index pattern).
- **OpenSearch security controls**: Fine-Grained Access Control (role-based permissions at the index/document/field level), domain encryption (at rest/in transit), placement inside a VPC, and Cognito-integrated dashboard authentication.

Cost and operational trade-offs:
- A domain is an *always-on* cluster, so indexing and storage costs continue to accrue (a serverless option also exists, but the model is different).
- Long-term retention is expensive, so a common design is to tier: hot data in OpenSearch and cold archive in S3 + Athena.

Athena vs. OpenSearch is the opposition between "exploratory after-the-fact analysis (ad hoc)" and "operational constant observation (operational)." As security maturity rises, you use the two *together*: OpenSearch for real-time hunting and dashboards, and S3 + Athena for deep forensics, long-term tracking, and low-cost retention. And the higher-level concept that normalizes all these originals and gathers them in one place is **Security Lake** (OCSF format, S3-based), covered in Day 4 - both Athena and OpenSearch can take Security Lake as a query target.

It is easy to miss that the OpenSearch domain itself is **an asset that must be protected**. Because all of an organization's logs are gathered there, if the domain is exposed to the internet, it is not a log leak but a leak of the *internal structure of the whole organization*. There are four essential controls - (1) **placement inside a VPC** (no public endpoint), (2) **encryption at rest and in transit** plus node-to-node encryption, (3) **fine-grained access control (FGAC)** to separate permissions at the index and field level, and (4) **authentication integration such as Cognito** for Dashboards access. A configuration that "puts `Principal: *` in the domain access policy and restricts only by an IP condition" is a wrong-answer pattern that repeats on exams.

## The Query Tiers on One Page

```
[ From the birth of a log to answering a question ]

  Source              Collection path           Storage tier           Query tool
┌──────────┐                              ┌────────────────┐
│CloudTrail│──┬─▶ CloudWatch Logs ────────│ Hot: days to tens│──▶ Logs Insights
│VPC Flow  │  │   (only logs to alarm on) │ of days. High unit│    "What's happening
│Route 53  │  │        │                  │ price, immediacy │    now?"
│ALB/WAF   │  │        │                  └────────────────┘
│App logs  │  │        │ Subscription Filter
└──────────┘  │        ▼
              │   Firehose ──────────────┌────────────────┐
              │   (buffer, transform)     │ Warm: index     │──▶ OpenSearch
              │        └──────────────────│ Always-on cluster│    Dashboards
              │                           └────────────────┘    "Constant watch"
              │                                   │ rollover with ISM
              │                                   ▼
              └─▶ S3 (raw archive) ───────┌────────────────┐
                       │                  │ Cold: long-term │──▶ Athena
                       │  Parquet conversion│ retention       │    "What happened
                       │  partition projection│ Low unit price │     back then?"
                       ▼                  └────────────────┘
                  Security Lake (OCSF normalization, Day 4) ──▶ third-party SIEM

  ─────────────────────────────────────────────────────────────────
  The tense of the question decides the tool:
    Present ("now")          → Logs Insights / OpenSearch
    Present perfect ("ongoing") → OpenSearch dashboards and alerts
    Past ("back then")       → Athena
```

The arrow most often drawn wrongly in this diagram is **the path from CloudWatch Logs to S3**. In practice, that path is not "put everything in CloudWatch Logs and export to S3 later" - **splitting it into two branches from the start** is correct. Only logs that need alarms go to CloudWatch Logs, and the full original goes straight to S3. Trying to produce the latter through the former doubles the cost and adds delay.

## Tool Selection Summary

| Tool | Data location | Time nature | Best use |
|------|------------|--------|-----------|
| **Athena** | S3 | After the fact, one-off | Large-volume CloudTrail/VPC Flow forensics, low-cost long-term investigation |
| **Logs Insights** | CloudWatch Logs | Immediate, operational | Quick log queries during incident response, short-term operations |
| **OpenSearch** | Index (loaded via Firehose) | Near-real-time, constant | SIEM dashboards, full-text search, repeated correlation analysis |

There is a sentence that repeats in post-incident reports of large cloud breaches - **"the relevant signals were already in the logs."** The reason a breach succeeds is usually not that the logs were missing but that *no one asked the question* of the logs that were there. This observation created the field of threat hunting. The premise of hunting is "do not wait for an alarm to ring; form a hypothesis and ask the logs first," and the queries learned today are exactly the shape of those questions. "Has this role ever been called from a Region different from usual," "is there an access key used right after creation," "is there a flow that communicates a small amount uniformly over 24 hours" - no detector automatically asks these questions for you. **Detectors catch known bad things, and hunting finds things that do not yet have a name.** If knowing the log analysis tools is the scope of the exam, knowing what to ask with those tools is the scope of practice.

## 📌 Key Takeaways

Today's three tools are not in a competitive relationship but a **division of labor by data location and the tense of the question**. Reduced to one sentence: **"now" is Logs Insights, "ongoing" is OpenSearch, and "back then" is Athena.**

And on top of this division of labor there are three principles that came up repeatedly today.

1. **Scan volume is cost.** The three knobs of partition (path) → columnar (columns read) → compression (physical bytes) work as a product. The moment you filter the period with a column that is not a partition key, the first knob is neutralized.
2. **How to read results matters more than the query.** It is the columns that show *ratios and diversity*, such as `distinct_apis`, `avg_packet_size`, and `ips`, rather than the top `count(*)`, that produce judgment. The signal is **an abnormal shape**, not a large volume.
3. **The questions each log can answer have boundaries.** Flow Logs say how much, data events say what, management events say who, and Resolver logs say where to. A design that tries to answer everything with one log will inevitably get stuck at the investigation stage.

In Day 4, we cover **automatically routing with EventBridge** the signals obtained this way so that a person does not have to query every time, and Security Lake, which gathers organization-wide logs into a single schema.

### One-Line Summary Checklist

- [ ] Did you apply partition projection (or Hive partitions) to the CloudTrail and Flow Logs tables?
- [ ] Does every investigation query narrow the period **with the partition key first**?
- [ ] Did you enforce a scan limit and result bucket encryption on the workgroup?
- [ ] Do you protect the query result bucket at the same level as the original log bucket?
- [ ] Did you solidify the repeat-investigation targets into Parquet once?
- [ ] Do you send only logs that need alarms to CloudWatch Logs and route the originals straight to S3?
- [ ] Did you place the OpenSearch domain in a VPC and configure FGAC, encryption, and dashboard authentication?
- [ ] Is it organized which log answers each of "how much, what, who, and where to"?

---

## 📝 Practice Questions

**Question 1.** 90 days of CloudTrail logs have accumulated in S3. You want to investigate the APIs called by a specific IAM role over the past 7 days while minimizing cost. What are the most appropriate tool and technique?

A) Index all logs into OpenSearch and search with a dashboard  
B) Query with Athena, scanning only the investigation period using date partitioning (or Partition Projection)  
C) Query the S3 logs directly with CloudWatch Logs Insights  
D) Download all S3 objects and grep locally  

**Answer: B**  
Explanation: For one-time after-the-fact investigation of large logs in S3, Athena is optimal, and scanning only the investigation period (7 days) through partitioning drastically cuts cost and time. Indexing everything into OpenSearch is an excessive ongoing cost for a one-time investigation, Logs Insights targets only CloudWatch Logs and cannot see S3, and local grep is impractical.

---

**Question 2.** The cost of Athena CloudTrail queries is higher than expected. What is the most effective way to reduce it?

A) Remove the WHERE clause  
B) Filter on partition keys to enable partition pruning, and convert logs to a columnar format such as Parquet  
C) Disable caching of query results  
D) Change the Region to us-east-1  

**Answer: B**  
Explanation: Athena charges by bytes scanned, so filtering on partition keys to induce pruning and converting to a columnar format (Parquet/ORC) so that only the needed columns and partitions are read greatly reduces cost. Removing WHERE actually causes a full scan, and caching and changing the Region are unrelated to the amount scanned.

---

**Question 3.** During incident response, an operator wants to *immediately* see the trend of AccessDenied occurrences in Lambda logs arriving in CloudWatch Logs. What is the fastest tool without separate ingestion?

A) Athena  
B) CloudWatch Logs Insights  
C) Create a new OpenSearch domain  
D) S3 Select  

**Answer: B**  
Explanation: If the logs are already in CloudWatch Logs and an immediate query is needed, Logs Insights is suitable. You can query and aggregate right away within a time range without separate ingestion. Athena/S3 Select target S3 data, and creating a new OpenSearch domain and ingesting into it during incident response lacks immediacy.

---

**Question 4.** You want to identify the actual sources of instances behind a NAT Gateway using VPC Flow Logs. Which field is needed?

A) The default field srcaddr alone is sufficient  
B) Add pkt-srcaddr (the original address before NAT) to a custom format  
C) The action field  
D) The tcp-flags field  

**Answer: B**  
Explanation: For flows behind NAT/a load balancer, the default srcaddr shows the intermediate node's address, so you must add pkt-srcaddr to a custom format to identify the actual source before NAT. srcaddr alone cannot distinguish the original, and action (accept/reject) and tcp-flags (connection state) are unrelated to source identification.

---

**Question 5.** You want to index multiple log sources in near real time and continuously provide SIEM-style dashboards, full-text search, and correlation analysis. What is the most suitable service?

A) Athena  
B) CloudWatch Logs Insights  
C) Amazon OpenSearch Service (ingested via Firehose)  
D) Amazon Macie  

**Answer: C**  
Explanation: Near-real-time indexing, dashboards, full-text search, and repeated correlation analysis are the domain of OpenSearch, and a pipeline that ingests logs through Firehose is standard. Athena is after-the-fact one-time SQL, Logs Insights is short-term operational querying, and Macie is an S3 sensitive data discovery tool, so none is meant for a continuous SIEM dashboard.

---

