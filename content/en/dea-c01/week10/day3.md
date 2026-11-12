# Day 3 - Full-Length Practice Exam Pace: 8 Integrated Scenarios

Today is full-dress rehearsal. Solve 8 integrated scenario questions spanning all 4 domains in **130 minutes of exam pace**. The real exam is 65 questions / 130 minutes, so about 2 minutes per question. Today's goal: finish these 8 in 16 minutes, then study the explanation. The real win is not "getting it right" but sharpening your **requirement keyword → AWS service reflex**.

## Scenario Breakdown Strategy

Faced with a long problem, follow this order:

1. **Read the question (last sentence) first** to understand "what is being asked."
2. **Extract constraint keywords** from the scenario: serverless/minimal ops, real-time/batch, cost-minimal, least code, security/encryption.
3. **Cross out 2 obviously wrong answers** (mismatched service purpose).
4. **Pick the best-fit constraint** from the remaining two.

> 💡 **Related theory**: Most wrong answers aren't "wrong"—they're "less suitable." They might technically work but violate operational burden, cost, or latency constraints. "Possible" is not "most appropriate" for an Associate-level exam.

## Common Integrated Patterns

| Scenario Signal | Typical Answer Combo |
|--------------|-----------------|
| Real-time clickstream → managed load → SQL analysis | Kinesis Firehose → S3 → Athena |
| Hourly incremental ETL → data warehouse load | Glue (bookmarks) → Redshift |
| Database change stream real-time copy | DMS (CDC) → S3/Redshift |
| Heterogeneous stage coordination + retry | Step Functions |
| Sensitive data discovery + column access control | Macie + Lake Formation |

## Key Takeaways

- Lock in ~2-minute pace per question.
- Question first, constraints second, eliminate obvious wrongs third.
- Pick "most suitable / minimal ops / lowest cost"—not just "possible."
- Domain mix doesn't matter if requirement → service mapping is sharp.

## 📝 Practice Questions

**Question 1.** You must receive a mobile app's clickstream in real time, load it into S3 as Parquet without managing additional servers, and let analysts query it with ad hoc SQL. Which combination is the most suitable?

A) Kinesis Data Firehose → S3(Parquet) → Athena  
B) RDS → EC2 cron → manual CSV download  
C) DynamoDB → DAX → QuickSight direct  
D) Always-on EMR cluster → HDFS → local Presto  

**Answer: A**  
Explanation: Firehose is fully managed; it buffers the stream, converts it to Parquet, and loads it into S3, and Athena provides ad hoc querying with serverless SQL. RDS, EC2, and an always-on EMR cluster have a heavy operational burden and are unsuitable for real-time ingestion, and DynamoDB is not intended for analytical SQL.

---

**Question 2.** You must continuously replicate changes from an on-premises PostgreSQL database to an AWS analytics environment in near real time. After the initial full load, ongoing CDC is required. Which service is the most suitable?

A) AWS Glue crawler  
B) AWS DMS (full load + CDC)  
C) S3 batch upload script  
D) Amazon Athena federated queries only  

**Answer: B**  
Explanation: AWS DMS can continuously replicate changes from the source database using change data capture (CDC) after the initial full load. A Glue crawler infers schemas, S3 batch uploads are not real-time CDC, and federated queries perform ad hoc querying rather than replication.

---

**Question 3.** You need to run multiple Lambda functions and Glue jobs in sequence, with per-step branching, automatic retries, and visual execution tracking. You want to minimize operational overhead by running serverless. Which service is the most suitable?

A) AWS Step Functions  
B) A single EC2 instance with cron configured  
C) S3 event notifications only  
D) A single DynamoDB Streams trigger  

**Answer: A**  
Explanation: Step Functions is a serverless state machine that provides step coordination, branching, automatic retries, and visual execution tracking. EC2 cron has a heavy operational burden, and S3 events or DynamoDB Streams alone make it difficult to build multi-step branching and retry orchestration.

---

**Question 4.** Several departments in a data lake use the same table, but only the HR team may view the salary column and it must be masked for other teams. You want to control permissions centrally at the column level. Which service is the most suitable?

A) S3 bucket ACL  
B) AWS Lake Formation column-level permissions  
C) Security Group rules  
D) CloudFront geo restriction  

**Answer: B**  
Explanation: Lake Formation centrally manages permissions at the table, column, row, and cell level, making it suitable for column-level access control. S3 ACLs apply only down to the object level, Security Groups are for networking, and CloudFront geo restriction is for content distribution, so none of them relate to controlling data columns.

---

**Question 5.** Redshift dashboard queries frequently access only the last 30 days of data, while cold data older than one year is queried only occasionally. You want to reduce cost while still being able to query the cold data with SQL when needed. Which approach is the most suitable?

A) Keep all data permanently on Redshift nodes  
B) Delete the cold data  
C) Keep the cold data in S3 and query it with Redshift Spectrum  
D) Move the cold data to DynamoDB  

**Answer: C**  
Explanation: Keeping hot data in the Redshift cluster and cold data in inexpensive S3, and querying it with SQL through Redshift Spectrum without loading it, reduces storage cost while preserving accessibility. Keeping everything increases cost, deleting makes the data unqueryable, and DynamoDB is unsuitable for analytical SQL.

---

**Question 6.** A Glue ETL job occasionally fails and is rerun, but the same data ends up loaded into the target more than once. Which design principle should be prioritized to make retries safe?

A) Disable job retries entirely  
B) Lower the log level  
C) Design the job to be idempotent so that rerunning it does not create duplicates  
D) Manually empty the target table every time  

**Answer: C**  
Explanation: In distributed, retry-prone environments, jobs should be designed to be idempotent (for example, upsert/MERGE, or overwrite based on a deterministic key) so that rerunning them produces the same result. Disabling retries undermines resilience, and manual cleanup or log adjustments are not a root-cause fix.

---

**Question 7.** You are building a serverless ETL that processes only the new logs arriving hourly in the S3 raw zone and converts them into the curated zone (Parquet). Files that have already been processed must not be read again. Which combination is the most suitable?

A) Glue job + job bookmarks  
B) Always-on EMR cluster + full reprocessing  
C) Regenerate everything every time with Athena CTAS  
D) Scan the entire bucket every time with Lambda  

**Answer: A**  
Explanation: Glue is the default for serverless ETL, and job bookmarks track data that has already been processed so that only new data is processed incrementally. An always-on EMR cluster, full reprocessing, and full scans violate the incremental requirement and cost and operational efficiency.

---

**Question 8.** You must aggregate sales totals per store in real time over 5-minute windows from a stream of order events. You want to handle the window aggregation using SQL. Which service is the most suitable?

A) A one-off Amazon Athena query  
B) AWS Glue batch job  
C) Amazon QuickSight  
D) Amazon Managed Service for Apache Flink(Kinesis Data Analytics)  

**Answer: D**  
Explanation: Managed Service for Apache Flink processes tumbling/sliding window aggregations on streaming data in real time using SQL/Flink. Athena and Glue are batch-oriented and unsuitable for real-time 5-minute window aggregation, and QuickSight is a visualization tool.

---
