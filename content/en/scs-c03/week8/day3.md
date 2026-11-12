# Day 3 - Log Analysis: Query CloudTrail/VPC Flow with Athena, OpenSearch, CloudWatch Logs Insights

Alerts tell you "something is wrong now," but incident investigation, forensics, and threat hunting require the ability to freely ask historical logs: "What APIs did this IP call over the past 90 days?" or "Who changed this bucket policy?" In security exams, this domain reduces to *distinguishing the proper use of three tools* — **Athena** (query large logs stored in S3 with SQL, serverless, pay-per-use), **OpenSearch** (near-real-time indexing, dashboards, full-text search), and **CloudWatch Logs Insights** (immediately query logs already in CloudWatch Logs). The three are not competing — they split by data location and analysis timeliness.

## The Big Picture: Where Do Logs Live and How Do You Ask Them

```
                  ┌─ S3 (archive) ──────── Athena (SQL, serverless, low-cost long-term)
CloudTrail ───────┤
VPC Flow Logs ────┼─ CloudWatch Logs ───── Logs Insights (instant query, short-term ops)
ELB/Route53 ──────┤
App logs ─────────└─ Firehose ─── OpenSearch (indexing, dashboards, near-real-time)
```

The core decision questions are two: **(1) Where does the log live (S3 vs CloudWatch Logs vs index)? (2) Is the analysis one-off ad-hoc queries or repeated dashboards and searches?**

> 💡 **Related Theory**: This branching touches a classic data analytics tradeoff — *schema-on-read vs schema-on-write*. Athena keeps S3 data raw and applies schema at query time (schema-on-read): zero load cost, per-query scan cost. OpenSearch indexes at load time (schema-on-write): ongoing indexing and storage cost, but searches are fast and repeatable. Security operations' timeliness (post-incident vs continuous monitoring) maps exactly to this tradeoff.

## Athena: Query S3 Logs with SQL

Athena is a serverless service that queries S3 data with Presto/Trino-based SQL. No infrastructure to provision — you pay per *bytes scanned*. CloudTrail, VPC Flow, ELB, WAF logs all land in S3, making Athena the first-choice tool for post-incident security analysis.

### Creating a CloudTrail Table

The CloudTrail console's "Create Athena table" auto-generates DDL, but the key is the SerDe that maps CloudTrail's JSON structure.

```sql
-- CloudTrail logs table (auto-generated from console)
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

### Example Security Investigation Queries

```sql
-- All APIs called by a specific IP and their results (tracking suspected credential theft IP)
SELECT eventtime, eventname, eventsource, errorcode
FROM cloudtrail_logs
WHERE sourceipaddress = '203.0.113.45'
ORDER BY eventtime;

-- Top source IPs for console login failures (brute-force hunting)
SELECT sourceipaddress, count(*) AS fails
FROM cloudtrail_logs
WHERE eventname = 'ConsoleLogin' AND errormessage = 'Failed authentication'
GROUP BY sourceipaddress
ORDER BY fails DESC LIMIT 20;

-- Who changed security groups / bucket policies
SELECT eventtime, useridentity.arn, eventname, requestparameters
FROM cloudtrail_logs
WHERE eventname IN ('AuthorizeSecurityGroupIngress','PutBucketPolicy','PutBucketAcl');
```

### Cost and Performance Decision: Partitioning

Athena's cost is proportional to *bytes scanned*, so scanning the entire bucket every time is expensive and slow. The solution is **partitioning**.

- Manual partitions: `PARTITIONED BY (region STRING, year STRING, month STRING, day STRING)` followed by `ALTER TABLE ... ADD PARTITION`.
- **Partition Projection**: Instead of registering partition metadata one-by-one in the catalog, the table properties *calculate* the partition range. Optimal for logs that grow indefinitely by date, like CloudTrail.
- Converting to columnar format (**Parquet/ORC**) drastically reduces scan volume by reading only needed columns.

> 🎯 **Scenario**: When the request is "investigate APIs called by a specific IAM role 90 days ago while minimizing cost," the answer is Athena against CloudTrail S3 logs with date/region partitioning (or Partition Projection) to scan only the investigation period. Indexing all logs into OpenSearch for permanent retention is overkill for a one-off 90-day investigation. When timeliness is "one-off post-incident," Athena almost always wins on cost.

> ⚠️ **Trap**: If the Athena `WHERE` clause filters a regular column instead of the partition key, partition pruning does not apply and a full scan occurs. This is a common source of cost shocks. Also, CloudTrail's `requestParameters` and `responseElements` arrive as STRING (JSON strings), so parsing with `json_extract` is needed to access internal fields.

## VPC Flow Logs Analysis

VPC Flow Logs record network flows (source/destination IP, port, protocol, bytes, ACCEPT/REJECT). Send to S3 for Athena, or to CloudWatch Logs for Logs Insights.

```sql
-- Rejected (REJECT) inbound flows to a specific instance — detect scans/attacks
SELECT srcaddr, dstport, count(*) AS attempts
FROM vpc_flow_logs
WHERE dstaddr = '10.0.1.50' AND action = 'REJECT'
GROUP BY srcaddr, dstport
ORDER BY attempts DESC LIMIT 50;

-- Top outbound transfers by volume (suspect data exfiltration)
SELECT srcaddr, dstaddr, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE action = 'ACCEPT'
GROUP BY srcaddr, dstaddr
ORDER BY total_bytes DESC LIMIT 20;
```

> 🔍 **Deeper Dive**: Beyond *default* fields, VPC Flow Logs can be customized with `tcp-flags`, `pkt-srcaddr`/`pkt-dstaddr` (actual source before NAT), `flow-direction`, `traffic-path`, etc. In security investigation, `pkt-srcaddr` is decisive — flows behind a NAT Gateway or load balancer show `srcaddr` as the intermediate node, but `pkt-srcaddr` reveals the true origin. Also remember that Flow Logs capture *metadata* only, not *payload* (payload inspection requires VPC Traffic Mirroring + IDS).

## CloudWatch Logs Insights: Instant, Operations-Focused

Logs Insights queries logs *already in* CloudWatch Logs without separate ingestion, instantly. It uses its own query language (pipe-based). It fits operators responding to incidents who need to quickly ask "what is happening in this log group right now."

```
fields @timestamp, @message
| filter eventName = "ConsoleLogin" and errorMessage = "Failed authentication"
| stats count(*) as fails by sourceIPAddress
| sort fails desc
| limit 20
```

```
# Trend of AccessDenied in Lambda logs
fields @timestamp, @message
| filter @message like /AccessDenied/
| stats count(*) by bin(5m)
```

Characteristics and limits:
- Charged per bytes scanned within the query time range (similar pay-per-use to Athena).
- Can query across multiple log groups in one go (cross-log-group).
- Only targets logs already in CloudWatch Logs — cannot see S3 archives (that is Athena's domain).
- For long-term and large-scale ad-hoc analysis, Athena wins on cost and flexibility.

> ⚠️ **Trap**: Bundling Logs Insights and Athena together as "both are query tools" loses points on the exam. The criterion is *data location*. If logs are in CloudWatch Logs, use Logs Insights; if in S3, use Athena. If you send CloudTrail only to S3 and not to CloudWatch Logs, Logs Insights cannot see it.

## Amazon OpenSearch Service: Indexing, Dashboards, Search

OpenSearch indexes logs to provide fast full-text search, aggregation, and dashboards (OpenSearch Dashboards). Use when SIEM-style continuous monitoring, complex correlation analysis, and visualization are needed.

Typical pipeline: **Log source → Kinesis Data Firehose → OpenSearch** (or CloudWatch Logs Subscription Filter → Firehose → OpenSearch). Firehose handles buffering, transformation, and delivery to indexing.

OpenSearch's security operations strengths:
- Near-real-time indexing → near-real-time dashboards/alerts.
- Powerful full-text search and aggregation (correlate multiple log sources under one index pattern).
- **OpenSearch Security Controls**: Fine-Grained Access Control (role-based index/document/field-level permissions), domain encryption (at-rest and in-transit), placement in VPC, Cognito-backed dashboard authentication.

Cost and operations tradeoff:
- A domain is a *continuously running* cluster so indexing and storage costs accrue always (serverless option exists but with different economics).
- Long-term retention is expensive, so hot data in OpenSearch and cold archives in S3+Athena is common layered design.

> 💡 **Related Theory**: Athena vs OpenSearch is "exploratory post-incident ad-hoc" vs "operational continuous observation." As security maturity rises, both are used *together*: real-time hunting and dashboards with OpenSearch, deep forensics, long-term tracking, and low-cost storage with S3+Athena. And the unifying top-level concept that normalizes all originals into one place is **Security Lake** covered in Day 4 (OCSF format, S3-based) — both Athena and OpenSearch can query Security Lake as a target.

## Tool Selection Summary

| Tool | Data Location | Timeliness | Best Use |
|------|---------------|-------------|----------|
| **Athena** | S3 | Post-incident, one-off | Large-scale CloudTrail/VPC Flow forensics, low-cost long-term investigation |
| **Logs Insights** | CloudWatch Logs | Instant, operational | Quick log queries during incident response, short-term ops |
| **OpenSearch** | Index (Firehose ingestion) | Near-real-time, continuous | SIEM dashboards, full-text search, repeated correlation analysis |

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

