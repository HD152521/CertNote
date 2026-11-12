# Day 4 - Commonly Missed Traps and Keywords: The "Requirement → Service" Translation Table

## 📌 Key Takeaways

- The exam asks in terms of requirement phrasing, not service names. Learn the translation table until, looking at the left column (requirement), the right column (service) comes to mind immediately.
- For the eight pairs Streams/Firehose, Athena/Redshift, Glue/EMR, Step Functions/MWAA, Lake Formation/IAM, CloudTrail/CloudWatch Logs, Macie/GuardDuty, and SSE-KMS/SSE-S3, you should be able to state the distinguishing axis in one word.
- When you see "serverless, minimal operations, minimal cost," eliminate the always-on cluster and direct EC2 installation choices first.
- A plausible wrong answer talks about "a control knob that service does not have." Athena has no instances, Firehose has no reprocessing, and bookmarks do not know about UPDATEs.
- If both choices would work, choose "most suitable," not "possible." A single word in the stem (multiple consumers, existing code, column level) changes the answer.

## How to Use the Translation Table

The most common reason for losing points on the exam is not a lack of knowledge but **confusable service pairs** and **trap keywords**. Today we organize the "requirement → service" translation table to have in your head right before the exam, along with the traps that look similar and often lead to wrong answers. Use the tables by covering the right column and answering from the left column only. Mark only the rows where the answer does not come within 2 seconds, and review just those rows the day before the exam.

## Core Translation Table: Requirement to Service

| Requirement keyword | Correct service | One-line rationale |
|----------------|------------|-----------|
| Serverless SQL, query S3 directly, billed by scan volume | Athena | SQL based on Trino (formerly Presto) with no infrastructure |
| Streaming, real time, shards, reprocessing | Kinesis Data Streams | Direct consumption, ordering, retention |
| Managed-free stream loading → S3/Redshift | Data Firehose | Buffering, transformation, automatic delivery |
| Kafka-compatible | Amazon MSK | Managed Apache Kafka |
| Central permissions, column/row-level data access | Lake Formation | Fine-grained governance |
| Shared metastore, schema inference | Glue Data Catalog + crawler | Catalog and schema |
| Incremental ETL, skip already processed data | Glue job bookmark | Tracks processing state |
| Serverless Spark ETL, scheduled | AWS Glue | Managed ETL |
| Large scale, fine-grained tuning, existing Spark/Hive | Amazon EMR | Managed Hadoop |
| Petabyte analytic DW, columnar MPP | Amazon Redshift | OLAP |
| Hot = DW, cold = query S3 without loading | Redshift Spectrum | Tier separation |
| Real-time replication of DB changes (CDC) | AWS DMS | Full load + CDC |
| Run the Airflow DAG as is | Amazon MWAA | Managed Airflow |
| Coordinating heterogeneous steps, branching, retries | Step Functions | Serverless state machine |
| Streaming window aggregation (SQL/Flink) | Managed Service for Apache Flink | Real-time windows |
| Automatic detection and classification of sensitive data (PII) | Amazon Macie | ML-based discovery |
| API call audit (who, when) | CloudTrail | Audit log |
| Key rotation, per-key control, encryption audit | KMS (SSE-KMS) | Customer managed key |
| Data quality rule validation | Glue Data Quality | DQDL rules |

> 💡 **Related theory**: Exam sentences almost always ask with the "left column phrasing," not this "right column." If you train yourself to search and map by "requirement phrasing" rather than service names, you can react instantly on the real exam.

Here we add expressions that are not in the table above but appear in stems.

| Requirement keyword | Correct service | One-line rationale |
|------|------|------|
| SaaS (such as Salesforce) data into S3 without code | Amazon AppFlow | SaaS connectors |
| Repeatedly sync on-premises files, verify integrity | AWS DataSync | Agent-based transfer |
| An external partner pushes in over SFTP | AWS Transfer Family | Protocol stays the same, S3 behind it |
| One-time transfer of a huge volume with insufficient bandwidth | Snow family | Physical shipping |
| Analysts clean and profile without code | Glue DataBrew | Sample → Recipe → Job |
| Enforce schema compatibility of stream records | Glue Schema Registry | Blocks registration via compatibility mode |
| Row-level updates and time travel on lake tables | Apache Iceberg | Open table format |
| Join an operational DB from the DW without replication | Redshift federated query | Direct query of the remote DB |
| Automatic rotation of DB credentials | Secrets Manager | Rotation schedule |
| Resource configuration change history | AWS Config | Configuration snapshots and history |
| Query audit events centrally with SQL | CloudTrail Lake | Event data store |
| Hide column values by role at query time (DW) | Redshift dynamic data masking | Original unchanged |
| Items are deleted automatically after a set time (DynamoDB) | TTL | Expiration timestamp attribute |
| Distribute one event to several queues without loss | SNS → SQS fan-out | Distribution + buffer |
| Route to different targets depending on event content | EventBridge rule | Pattern-matching routing |

## Commonly Confused Service Pairs (Traps)

| Pair | Distinguishing criterion |
|----|----------|
| Kinesis Data Streams vs Firehose | Direct consumption and reprocessing = Streams / managed-free loading = Firehose |
| Athena vs Redshift | Ad hoc, serverless, unstructured = Athena / large always-on DW = Redshift |
| Glue vs EMR | Serverless and simple = Glue / large scale and fine-grained tuning = EMR |
| Step Functions vs MWAA | Coordinating heterogeneous AWS services = Step Functions / existing Airflow DAG = MWAA |
| Lake Formation vs IAM | Data (column and row) access = LF / service and API operation permissions = IAM |
| CloudTrail vs CloudWatch Logs | Who called the API = CloudTrail / application execution logs and causes = CloudWatch Logs |
| Macie vs GuardDuty | Sensitive data detection = Macie / threat and intrusion detection = GuardDuty |
| SSE-KMS vs SSE-S3 | Key control and auditing needed = KMS / simple managed = S3 |

> 💡 **Related theory**: If you see "direct consumption/reprocessing/ordering guarantee," it is Kinesis Data Streams, not Firehose. Firehose has no consumer or shard concept. Distinguishing just this one point correctly gets many streaming questions right.

Once the eight pairs feel familiar, look at the pairs one step deeper. Things learned separately in earlier weeks are placed on the same line.

| Pair | Distinguishing criterion |
|------|------|
| Kinesis Data Streams vs SQS | Stays after being read and can be replayed = stream / per-message deletion, retry, DLQ = queue |
| SNS vs EventBridge | Copy to all subscribers = SNS / select by content, AWS service events = EventBridge |
| Glue crawler vs Glue ETL job | Registering metadata = crawler / transforming data = job. A crawler does not move data |
| Job bookmark vs DMS CDC | New data from an append-only source = bookmark / reflecting UPDATEs and DELETEs too = CDC |
| Incremental crawl vs partition projection | Scan and register only new folders = incremental crawl / eliminate registration itself, Athena only = projection |
| Glue Studio vs DataBrew | Engineer's production ETL = Studio / analyst's cleaning and profiling = DataBrew |
| Schema Registry vs Data Quality | Shape (schema compatibility) = Registry / content (validity of values) = Data Quality |
| Redshift Spectrum vs federated query | Query S3 files = Spectrum / query operational RDS or Aurora = federated |
| Athena vs Redshift Spectrum | Query without a cluster = Athena / join with an existing Redshift table = Spectrum |
| Step Functions Standard vs Express | Long ETL that must wait for completion = Standard / high-frequency events within 5 minutes = Express |
| EMR on EC2 vs EMR Serverless | Spot and instance control, long-running service = on EC2 / no cluster operations = Serverless |
| DataSync vs Transfer Family | I pull it in = DataSync / an outside party pushes it via a protocol = Transfer Family |
| Secrets Manager vs Parameter Store | Automatic rotation = Secrets Manager / storing configuration values = Parameter Store |
| CloudTrail vs AWS Config | Who called what = CloudTrail / how the configuration changed = Config |
| Lifecycle vs Intelligent-Tiering | Know the access pattern and move by rule = Lifecycle / pattern unknown, leave it to automation = Intelligent-Tiering |
| Macie vs Glue sensitive data detection | Find the location in data already in S3 = Macie / find and mask during ETL = Glue |

## Phrasing Traps: Same Words, Different Meanings

- **"Real-time"** vs **"near real-time"/micro-batch**: If it is truly second-level, Kinesis/Flink; if minute-level is acceptable, Firehose buffering or Glue micro-batch.
- **"Serverless/minimal operations"**: Eliminate EMR, always-on clusters, and EC2 choices first.
- **"Minimal cost"**: Eliminate always-on and over-provisioned choices; prefer S3 tiers, Spectrum, and serverless.
- **"Reuse existing code"**: EMR if it is large-scale Spark/Hive, MWAA if it is Airflow.
- **Not "is it possible" but "is it most suitable"**: When both choices can work, pick the one that satisfies the constraints better.

On AWS exams, a wrong answer is often not a "wrong answer" but a "less suitable answer." If two look correct, reread the constraints on operational burden, cost, and real-time requirements and pick the more suitable one.

## One Word Changes the Answer

Look at how the correct answer shifts when a single word is added to the same situation. This is why you must read the stem to the end.

| Base situation and answer | Added word | Changed answer |
|------|------|------|
| Load a stream into S3 → Firehose | "Several applications each read it" | Kinesis Data Streams (+ Firehose) |
| Load a stream into S3 → Firehose | "Keep the existing Kafka producers as is" | MSK |
| Add consumers reading a stream → shared throughput | "Without delay for each consumer" | Enhanced fan-out |
| Query S3 logs with SQL → Athena | "Full-text keyword search" | OpenSearch Service |
| Query S3 data with SQL → Athena | "Join with a Redshift table" | Redshift Spectrum |
| Recognize new partitions automatically → crawler | "Query only with Athena, remove crawler cost" | Partition projection |
| Pull in only new rows each day → bookmark | "Existing rows are modified" | DMS CDC |
| Run several jobs in order → Step Functions | "Only Glue crawlers and jobs" | Glue Workflows |
| Bucket access by team → IAM and bucket policy | "At the column level" | Lake Formation |
| S3 encryption → SSE-S3 | "Audit key usage" | SSE-KMS customer managed key |
| Keep old data cheaply → Lifecycle | "The access pattern cannot be known" | Intelligent-Tiering |
| Convert a file in a few seconds → Lambda | "The conversion takes 30 minutes" | Glue job |

## Knobs the Service Does Not Have

The wrong answers in failure and optimization questions often name "a control knob the service does not actually have." If the sentences below appear in a choice, eliminate it right away.

| Sentence in the choice | Why it is wrong | The actual knob |
|------|------|------|
| "Increase Athena's instance size" | It is serverless, so there are no instances | Format, compression, partitions, file size |
| "Redeliver past data from Firehose" | It has no retention or reprocessing feature | Make KDS the source, or reprocess from the S3 original |
| "Switch to on-demand mode to eliminate the hot shard" | Skew on a single key goes to one shard even if you add shards | Redesign the partition key |
| "Detect changes in the source DB with a bookmark" | A bookmark knows only new rows | DMS CDC |
| "Manage Spectrum partitions with partition projection" | It is Athena only | Crawler and partition registration |
| "Convert CSV to Parquet with a crawler" | A crawler creates only metadata | Glue ETL job, Athena CTAS |
| "Edit the key policy of SSE-S3" | S3 manages that key, so there is no policy | SSE-KMS customer managed key |
| "Find S3 object reads in CloudTrail event history" | Event history has only management events, for 90 days | Data events in a trail |
| "Find PII in an RDS table with Macie" | Macie analyzes S3 | Export to S3 and then analyze, or detect at the ETL stage |
| "Wait for the Glue job to finish in an Express workflow" | You run into the completion-wait integration and the 5-minute limit | Standard workflow |
| "Extend the DynamoDB Streams retention to 7 days" | It is fixed at 24 hours | Export to Kinesis Data Streams |
| "Set a TTL on a Redshift table" | There is no automatic expiry feature | Schedule UNLOAD and then delete |
| "Share an AWS managed key with another account" | The key policy cannot be changed | Customer managed key |

## Number Groups That Are Easy to Confuse

Numbers get mixed up if memorized separately. Look at them grouped with the ones they are confused with.

| Group | Values |
|------|------|
| Retention period | Kinesis Data Streams 24 hours by default, 365 days maximum / DynamoDB Streams fixed at 24 hours / SQS 4 days by default, 14 days maximum / CloudTrail event history 90 days |
| Execution time limit | Lambda 15 minutes / Firehose transformation Lambda 5 minutes / Step Functions Express 5 minutes / Step Functions Standard 1 year |
| Firehose S3 buffer | Size 1 to 128 MB (default 5 MB), interval 0 to 900 seconds (default 300 seconds), delivers when whichever fills first. Minimum 64 MB if format conversion is on |
| Kinesis shard | Write 1 MB/s or 1,000 records/s, read 2 MB/s (shared). Enhanced fan-out is 2 MB/s per consumer |
| S3 minimum storage duration | Standard-IA and One Zone-IA 30 days / Glacier Instant and Flexible Retrieval 90 days / Glacier Deep Archive 180 days |
| KMS automatic rotation | AWS managed keys yearly (older material says 3 years) / customer managed keys default 365 days when enabled |
| Recommended file size | Columnar files for analytics are 128 MB to 1 GB. Tens of thousands of small files slow queries |

- Most limits are adjustable defaults and they change. What the exam asks about is not the number itself but "the default cannot meet the requirement" (24-hour retention cannot reprocess three days of data) and "the limit eliminates that service" (a 30-minute conversion rules out Lambda).

## Renamed Services

Exam questions and materials mix old and new names. If you do not recognize them as the same service, you mistake them for services you do not know.

| Old name | Current name | Note |
|------|------|------|
| Amazon Kinesis Data Firehose | Amazon Data Firehose | The exam guide's service list still uses the old name |
| Amazon Kinesis Data Analytics | Amazon Managed Service for Apache Flink | SQL-only applications (Kinesis Data Analytics for SQL) cannot be newly created from October 15, 2025 and are deleted from January 27, 2026. The replacement is Managed Service for Apache Flink and its Studio notebooks |
| Presto-based Athena | Trino-based Athena engine | Both may appear in the choices |
| Customer master key (CMK) | KMS key (customer managed key) | In older material, CMK means customer managed key |

- Whether a question says Kinesis Data Analytics or Managed Service for Apache Flink, the point is the same: it is the answer for "window aggregation and stateful processing on a stream."

Tomorrow is the last day. We will go over the exam structure, time allocation, and the registration procedure.

## 📖 Glossary

- **Translation table**: A mapping that converts the requirement phrasing in a stem into a service name. Learn it starting from the requirement side, not the service name.
- **Distinguishing axis**: The single criterion that separates two similar services. Things like whether reprocessing is possible, who operates it, and the unit of permissions.
- **Near real-time**: Processing that tolerates a delay of several seconds to several minutes. Firehose, which collects in a buffer before delivery, is the typical example.
- **Knob**: A control that a service actually provides. Serverless services have no knobs like instance size.
- **Hot shard**: A state where a skewed partition key concentrates traffic on a particular shard. Adding shards does not fix skew on a single key.
- **Data event**: A call on data inside a resource, such as reading or writing an S3 object. It is recorded in CloudTrail only if you turn it on separately.
- **Fan-out**: Copying one message to several recipients. SNS → several SQS queues is the typical pattern.
- **Customer managed key**: A KMS key that the user creates and for which the user directly controls the key policy, rotation, and deletion.

## 📝 Practice Questions

**Question 1.** Multiple independent applications must each read a data stream directly as their own consumers, and be able to reprocess data within 24 hours. Which service is the most suitable?

A) Amazon Data Firehose  
B) Amazon SNS  
C) Amazon Kinesis Data Streams  
D) Amazon SQS FIFO  

**Answer: C**  
Explanation: Kinesis Data Streams is shard-based, allowing multiple consumers to read independently and re-read data within the retention period. Firehose has no concept of direct consumption or reprocessing, and SNS/SQS are not stream-reprocessing models.

---

**Question 2.** You must audit "who called the PutObject API on which S3 bucket, and when." Which service is the most suitable?

A) Amazon CloudWatch Logs  
B) AWS CloudTrail  
C) Amazon Macie  
D) AWS Config  

**Answer: B**  
Explanation: CloudTrail is an audit service that records API calls in the account (principal, time, action). CloudWatch Logs holds application logs, Macie detects sensitive data, and Config tracks resource configuration changes, so auditing API calls is not their primary purpose.

---

**Question 3.** An analyst wants to query S3 data once, ad hoc, with standard SQL. They do not want to keep an always-on cluster and want to minimize operational overhead. Which service is the most suitable?

A) Amazon Redshift always-on cluster  
B) Amazon EMR  
C) Amazon Athena  
D) Hive installed directly on EC2  

**Answer: C**  
Explanation: Athena is serverless, queries S3 with ad hoc SQL without always-on infrastructure, and charges only for the amount scanned, making it the best fit for temporary or intermittent analysis. An always-on Redshift cluster, EMR, and Hive on EC2 have high operational burden and cost.

---

**Question 4.** You want to process a large (tens of TB) daily batch with existing Spark/Hive code, finely control instance types and tuning, and reduce cost with Spot Instances. Which service is the most suitable?

A) Amazon EMR  
B) AWS Glue  
C) AWS Lambda  
D) Amazon Athena  

**Answer: A**  
Explanation: EMR is a managed Hadoop/Spark cluster suited to instance fleets, Spot Instances, fine-grained tuning, and reusing existing Spark/Hive code. Glue is serverless and offers limited fine-grained cluster control, and Lambda and Athena are not large-scale batch processing engines.

---

**Question 5.** The goal is to automatically discover and classify sensitive personally identifiable information (PII) scattered across S3 buckets. Data classification is the key requirement, not detecting breach threats. Which service is the most suitable?

A) Amazon GuardDuty  
B) Amazon Macie  
C) AWS WAF  
D) Amazon Inspector  

**Answer: B**  
Explanation: Macie discovers and classifies sensitive data such as PII and financial information in S3 using ML. GuardDuty detects threats and breaches, WAF blocks web attacks, and Inspector assesses vulnerabilities, so none of them classify data.

---
