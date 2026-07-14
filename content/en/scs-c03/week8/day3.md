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

## 📝 연습 문제

**문제 1.** S3에 90일치 CloudTrail 로그가 쌓여 있다. 특정 IAM 역할이 지난 7일간 호출한 API를 비용을 최소화하며 조사하려 한다. 가장 적절한 도구와 기법은?

A) 모든 로그를 OpenSearch로 인덱싱한 뒤 대시보드 검색  
B) Athena로 쿼리하되 날짜 파티셔닝(또는 Partition Projection)으로 조사 기간만 스캔  
C) CloudWatch Logs Insights로 S3 로그를 직접 질의  
D) S3 객체를 모두 다운로드해 로컬에서 grep  

**정답: B**  
해설: S3에 있는 대용량 로그의 일회성 사후 조사는 Athena가 최적이며, 파티셔닝으로 조사 기간(7일)만 스캔하면 비용·시간이 급감한다. OpenSearch 전체 인덱싱은 일회성 조사에 과한 상시 비용이고, Logs Insights는 CloudWatch Logs만 대상이라 S3를 못 보며, 로컬 grep은 비현실적이다.

---

**문제 2.** Athena CloudTrail 쿼리의 비용이 예상보다 크게 나온다. 가장 효과적인 절감 방법은?

A) WHERE 절을 제거한다  
B) 파티션 키로 필터링해 파티션 프루닝을 활성화하고, 로그를 Parquet 같은 컬럼형으로 변환  
C) 쿼리 결과를 캐시 비활성화  
D) 리전을 us-east-1로 변경  

**정답: B**  
해설: Athena는 스캔한 바이트에 과금하므로, 파티션 키 기반 필터로 프루닝을 유도하고 컬럼형 포맷(Parquet/ORC)으로 변환해 필요한 컬럼·파티션만 읽게 하면 비용이 크게 준다. WHERE 제거는 오히려 전체 스캔을 유발하고, 캐시·리전 변경은 스캔량과 무관하다.

---

**문제 3.** 사고 대응 중 운영자가 CloudWatch Logs에 들어오는 Lambda 로그에서 AccessDenied 발생 추세를 *즉시* 보려 한다. 별도 적재 없이 가장 빠른 도구는?

A) Athena  
B) CloudWatch Logs Insights  
C) OpenSearch 도메인 신규 생성  
D) S3 Select  

**정답: B**  
해설: 로그가 이미 CloudWatch Logs에 있고 즉시 질의가 필요하면 Logs Insights가 적합하다. 별도 적재 없이 시간 범위 내에서 바로 질의·집계할 수 있다. Athena/S3 Select는 S3 데이터 대상이고, 사고 대응 중 OpenSearch 도메인을 새로 만들어 적재하는 것은 즉시성이 없다.

---

**문제 4.** NAT Gateway 뒤에 있는 인스턴스들의 실제 출발지를 VPC Flow Logs로 식별하려 한다. 어떤 필드가 필요한가?

A) 기본 필드의 srcaddr만으로 충분하다  
B) 커스텀 포맷에 pkt-srcaddr(NAT 이전 원본 주소)를 추가  
C) action 필드  
D) tcp-flags 필드  

**정답: B**  
해설: NAT/로드밸런서 뒤의 흐름은 기본 srcaddr가 중간 노드 주소로 보이므로, 커스텀 포맷에 pkt-srcaddr를 추가해야 NAT 이전 실제 출발지를 식별할 수 있다. srcaddr 단독은 원본을 가리지 못하고, action은 허용/거부, tcp-flags는 연결 상태 정보로 출발지 식별과 무관하다.

---

**문제 5.** 여러 로그 소스를 준실시간으로 인덱싱해 SIEM 스타일 대시보드와 전문검색·상관 분석을 상시 제공하려 한다. 가장 적합한 서비스는?

A) Athena  
B) CloudWatch Logs Insights  
C) Amazon OpenSearch Service(Firehose로 적재)  
D) Amazon Macie  

**정답: C**  
해설: 준실시간 인덱싱·대시보드·전문검색·반복 상관 분석은 OpenSearch의 영역이며, Firehose로 로그를 적재하는 파이프라인이 표준이다. Athena는 사후 일회성 SQL, Logs Insights는 단기 운영 질의, Macie는 S3 민감데이터 발견 도구로 상시 SIEM 대시보드 용도가 아니다.

---

