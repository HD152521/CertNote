# Day 4 - Common Traps & Keywords: "Requirement → Service" Translation Guide

The most common reason for lost points on the exam is not lack of knowledge but **confusing service pairs** and **trap keywords**. Today we lock in the "requirement → service" translation guide to have at your fingertips before the exam, and identify the look-alike pairs that commonly trick test-takers. Master this translation table and you can zero in on the right answer just by reading keywords, even in long scenarios.

## Core Translation Table: Requirement to Service

| Requirement Keyword | Answer Service | One-Line Reason |
|----------------|------------|-----------|
| Serverless SQL, direct S3 queries, pay-per-scan | Athena | Presto SQL without infrastructure |
| Streaming, real-time, shards, replay | Kinesis Data Streams | Direct consumption, order, retention |
| Streaming managed load → S3/Redshift | Data Firehose | Auto buffering, transformation, delivery |
| Kafka-compatible | Amazon MSK | Managed Apache Kafka |
| Centralized permissions, column/row data access | Lake Formation | Granular governance |
| Shared metastore, schema inference | Glue Data Catalog + crawler | Catalog & schema |
| Incremental ETL, skip already-processed data | Glue job bookmarks | Process state tracking |
| Serverless Spark ETL, scheduled | AWS Glue | Managed ETL |
| Large scale, fine tuning, existing Spark/Hive | Amazon EMR | Managed Hadoop |
| Petabyte-scale analytical DW, columnar MPP | Amazon Redshift | OLAP |
| Hot=DW, cold=S3 query without load | Redshift Spectrum | Tiering |
| DB change (CDC) real-time copy | AWS DMS | Full load + CDC |
| Run existing Airflow DAG as-is | Amazon MWAA | Managed Airflow |
| Heterogeneous step coordination, branch, retry | Step Functions | Serverless state machine |
| Streaming window aggregation (SQL/Flink) | Managed Service for Apache Flink | Real-time windows |
| Sensitive data (PII) auto-discovery & classify | Amazon Macie | ML-based detection |
| API call audit (who, when) | CloudTrail | Audit log |
| Key rotation, per-key control, crypto audit | KMS (SSE-KMS) | Customer-managed keys |
| Data quality rule validation | Glue Data Quality | DQDL rules |

> 💡 **Related theory**: The exam almost always phrases questions using the "left column" language, not service names. Train yourself to map by "requirement expression" rather than service name, and you'll respond instantly in the real exam.

## Commonly Confused Service Pairs (Traps)

| Pair | Distinguishing Factor |
|----|----------|
| Kinesis Data Streams vs Firehose | Direct consumption & replay = Streams / Managed load = Firehose |
| Athena vs Redshift | Ad-hoc, serverless, unstructured = Athena / Large-scale always-on DW = Redshift |
| Glue vs EMR | Serverless, simple = Glue / Large-scale, fine-tuning = EMR |
| Step Functions vs MWAA | Orchestrate heterogeneous AWS = Step Functions / Existing Airflow DAG = MWAA |
| Lake Formation vs IAM | Data (column/row) access = LF / Service/API operational permission = IAM |
| CloudTrail vs CloudWatch Logs | Who called API = CloudTrail / App runtime logs, root cause = CloudWatch Logs |
| Macie vs GuardDuty | Sensitive data discovery = Macie / Threat/breach detection = GuardDuty |
| SSE-KMS vs SSE-S3 | Key control & audit needed = KMS / Simple managed = S3 |

> 💡 **Related theory**: When you see "direct consumption / replay / order guarantee," think Kinesis Data Streams, not Firehose. Firehose has no consumer/shard concept. Get this one right and you'll ace most streaming questions.

## Expression Traps: Same Words, Different Meanings

- **"Real-time"** vs **"near real-time" / micro-batch**: True per-second → Kinesis/Flink; minute-level acceptable → Firehose buffer/Glue micro-batch.
- **"Serverless / minimal ops"**: Cross out always-on EMR, persistent clusters, EC2.
- **"Minimal cost"**: Cross out always-on, over-provisioned options; favor S3 tiering, Spectrum, serverless.
- **"Reuse existing code"**: Spark/Hive large-scale → EMR; Airflow → MWAA.
- **"Is it possible" vs "most appropriate"**: When two answers both work, re-read constraints and pick the better fit for ops, cost, or latency.

> 💡 **Related theory**: AWS exam wrong answers aren't "incorrect"—they're "less suitable." When two answers seem right, re-read the requirement and pick the one that best satisfies operational burden, cost, and latency constraints.

## Key Takeaways

- The exam asks in "requirement language," not service names. Memorize the translation table.
- Master the confusing pairs: Streams/Firehose, Athena/Redshift, Glue/EMR, Step Functions/MWAA, LF/IAM, CloudTrail/CloudWatch, Macie/GuardDuty.
- Keywords "serverless, minimal cost" eliminate always-on cluster options immediately.
- "Most appropriate" beats "possible" — reread constraints when two answers work.

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
