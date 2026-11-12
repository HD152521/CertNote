# Day 5 - Week 1 Comprehensive Review

## 📌 Key Takeaways

- The conclusion of Week 1: a data engineer builds the **ingest → store → process → analyze** pipeline, and **governance** wraps the entire span.
- Every choice (OLTP/OLAP, batch/stream, lake/warehouse, row-based/columnar) comes from **"what does the workload demand?"**
- Break a passage down with four questions: what is the source → how fresh must it be → who reads it and how → what are the operational-overhead and cost conditions.
- Wrong options are ones that are "possible functionally but violate one condition." Qualifiers such as least operational overhead, lowest cost, and fewest code changes decide the answer.
- If you can state the distinguishing axis of the 8 confusing pairs (Streams/Firehose, Glue/EMR, Athena/Redshift, IAM/Lake Formation, and so on) in one word each, you pass.

## Week 1 on One Page

Over the past four days we laid the foundation of data engineering. On Day 1 we saw roles and pipelines, OLTP/OLAP, and lake/warehouse; on Day 2 we separated batch from streaming; on Day 3 we spread out the map of AWS data services; and on Day 4 we covered data formats and schema evolution. They look like scattered pieces, but in fact they are threaded together into **a single pipeline**.

Today, instead of listing the individual concepts again, we **follow one scenario from start to finish** to see how the knowledge of the four days interlocks. Because the exam asks not for fragmentary memorization but "what would you choose in this situation," looking at it connected like this is the most effective review.

```
[Day1] Roles/concepts     [Day2] Processing   [Day3] Services       [Day4] Formats
 Data engineer             Batch               Ingest Kinesis/DMS    CSV/JSON (raw)
 = owns the pipeline       vs                  Store S3/Redshift     Parquet/ORC (analytics)
 OLTP vs OLAP              Streaming           Process Glue/EMR      Avro (streaming)
 Lake vs warehouse         (latency/throughput) Analyze Athena/QS    Schema evolution
                                               Governance LakeFmt
```

The keywords of the four days are, in the end, different aspects of a single question: "how do we ingest, store, process, analyze, and control data?"

> 💡 **Related theory**: The single principle running through all of these judgments is **"the workload determines the design."** Whether OLTP or OLAP, batch or stream, row-based or columnar — the answer in every case comes from the workload characteristic of "how is the data read and written?" The way of thinking in data engineering is not to pick a technology first and force the workload to fit, but to analyze the workload and then pick the technology.

## Threading It Together with a Scenario

We follow the needs of an e-commerce company. We have marked which Week 1 concept each need touches.

**Need 1.** "Don't put load on the production order DB, and make that data analyzable."
- The production DB is **OLTP** (Day 1) → heavy aggregations must not be run on it directly
- Replicate only the changes to the analytics environment with **DMS CDC** (Day 3)
- The analytics environment is **OLAP** (Day 1) → Redshift or S3 + Athena

**Need 2.** "I want to catch fraudulent transactions at the moment of payment."
- Immediacy is needed → **streaming** (Day 2)
- Ingest payment events with **Kinesis Data Streams** (Day 3)
- The schema may change, so **Avro + Schema Registry** (Day 4)

**Need 3.** "Automatically produce yesterday's sales report every morning."
- Periodic, bounded data → **batch** (Day 2)
- Process a day's worth with **Glue** (Day 3) and load it as **Parquet** (Day 4)
- Query and visualize with **Athena/QuickSight** (Day 3)

```sql
-- The analytic query for Need 3 — stored as Parquet, so it's fast and cheap
SELECT region, SUM(amount) AS revenue
FROM orders          -- Parquet in S3, registered in the Glue Catalog
WHERE order_date = DATE '2026-06-25'   -- partition pruning
GROUP BY region;
```

A single company can have all three needs at once, and each uses a different paradigm, service, and format. The key is that there is not "one right answer" but **a combination that fits each need**.

> 💡 **Related theory**: Merging Needs 1–3 into one picture naturally gives you a **lakehouse**. All raw data (order CDC, the payment stream, logs) gathers in the S3 data lake, goes through batch and streaming processing and is refined into Parquet, and Athena, Redshift, and QuickSight analyze on top of it. This is why Day 1's "lake vs. warehouse" is "unified into a lakehouse" in modern practice.

## Summary of Frequently Confused Distinctions

These are the pairs that appear as traps on the exam.

| Confusing pair | Key distinction |
|------------|----------|
| OLTP vs OLAP | Transactions (a few rows, quickly) vs analytics (aggregating many rows) |
| Lake vs warehouse | schema-on-read (flexible) vs schema-on-write (strict) |
| Batch vs streaming | Bounded, periodic vs unbounded, continuous |
| Kinesis Streams vs Firehose | Low latency, multiple consumers vs an auto-loading delivery person |
| Glue vs EMR | Managed serverless ETL vs control and large-scale clusters |
| Row-based vs columnar | Writes and whole rows (Avro) vs reads and aggregation (Parquet) |
| Athena vs Redshift | Ad hoc, serverless, scan-based billing vs always-on, large-scale, loaded data |
| IAM vs Lake Formation | Per-resource vs per-data (table, column, row) |

Just getting the distinguishing criterion of these 8 pairs right can solve a good share of the scenario questions in the Week 1 scope.

Almost every pair in this table shares the same tension structure: "**flexibility and generality vs. efficiency and specialization**." A lake is flexible but needs management, and a warehouse is efficient but rigid. Serverless (Glue/Athena) is convenient but weak on fine-grained control, and clusters (EMR/Redshift) are powerful but carry operational overhead. Being conscious of the trade-offs turns memorization into understanding.

## One-Line Summary from the Exam's Perspective

DEA-C01 ultimately asks about these 4 domains (reconfirming Day 1).

```
1. Ingestion and transformation (34%)   ← Day 2 batch/stream + Day 3 Kinesis/Glue/EMR
2. Storage and management (26%)         ← Day 1 lake/warehouse + Day 3 S3/Redshift + Day 4 formats
3. Operations and support (22%)         ← (Week 2 onward) orchestration and monitoring
4. Security and governance (18%)        ← Day 3 LakeFormation/IAM/KMS
```

Week 1 has laid almost all of the foundation for domains 1 and 2. From next week we go into the deep details of each service (partitioning strategy, Glue job tuning, Kinesis shards, and so on), but all of it rests on the big picture we drew today.

## The Order for Solving a Passage: Four Questions

If you memorize the Week 1 concepts separately they scatter; if you bundle them in question order they become a decision procedure. When you meet a scenario passage, underline in the following order.

```
① What is the source?          DB / files / events and logs / SaaS
        ↓                      → decides the ingestion service (Day 3)
② How fresh must it be?        within seconds / minutes / hours / a day
        ↓                      → decides batch, streaming, or near-real-time (Day 2)
③ Who reads it, and how?       single-row lookup / large aggregation / search / dashboard
        ↓                      → decides the store and format (Day 1, Day 4)
④ What conditions are attached?  least operational overhead / lowest cost / fewest code changes / fine-grained permissions
                               → narrows to one among the candidates at the same stage
```

| Question | Answer | Result |
|------|------|------|
| ① Source | Production DB | DMS (CDC). Direct aggregation queries are prohibited |
| | File server | DataSync (pulls) / Transfer Family (receives) / Snow (insufficient bandwidth) |
| | Events and logs | Kinesis Data Streams, MSK (stream) / Firehose (loading) |
| | SaaS | AppFlow |
| ② Freshness | Within seconds | Stream + Flink/Lambda |
| | A few seconds to minutes | Firehose, Glue streaming |
| | Hours to a day | Scheduled batch (Glue/EMR) |
| ③ How it is read | One record at a time by key, many writes | OLTP — RDS/Aurora, DynamoDB |
| | Large aggregation and joins | OLAP — Redshift, or S3 (Parquet) + Athena |
| | Keeping originals of varied shapes | S3 data lake |
| ④ Conditions | Least operational overhead | Serverless side (Firehose, Glue, Athena, Lambda) |
| | Reuse existing code and tools | Open-source compatible side (MSK, EMR, MWAA) |
| | Column- and row-level permissions | Lake Formation |

- ④ most often decides the answer. Through ① to ③ two or three options survive, and a single last qualifier settles it.

## Five Molds That Wrong Options Are Made From

Question writers build options that are not "wrong technology" but "the wrong choice for this situation." Knowing the molds speeds up elimination.

| Mold | Example | How to filter it out |
|------|------|------|
| Different stage | QuickSight for a "replicate changes" problem, KMS for a "permissions" problem | First confirm which box of the flow it is |
| Possible but excessive | Implementing KDS + KCL yourself when you only need to accumulate in S3 | Check the "least operational overhead" qualifier |
| Possible but insufficient | Firehose alone when multiple consumers and reprocessing are needed | Check whether it satisfies all the required capabilities |
| The workload is reversed | Heavy aggregation directly on a production RDS, a single-record lookup with Athena | The OLTP/OLAP distinction |
| Misidentifies the cause | Athena is slow, so "scale up the instance" (impossible, it's serverless); a hot shard, so "extend the retention period" | Check whether it is a knob the service actually has |

- Especially the fifth mold: **a serverless service has no knob for increasing size.** Athena has no instances, so performance is improved on the data side (format, compression, partitions, file size).

## Scenario Practice: From Clue to Answer

Below are new situations that do not overlap with the practice questions. Cover the clue column, state the answer, and then check.

| Situation | Decisive clue | Answer configuration | Eliminated options and why |
|------|------|------|------|
| Collect web server logs in S3 and investigate the cause of an outage with SQL two or three times a month | "Occasionally," "SQL" | Firehose → S3, Athena | Redshift — always-on cost. EMR — cluster operation |
| Keyword search and per-second dashboards on the same logs | "Search," "per-second" | Firehose → OpenSearch | Athena — unsuited to full-text search and low-latency dashboards |
| An alert within 2 seconds when an IoT sensor value exceeds a threshold | "Within 2 seconds" | KDS + Flink (or Lambda) | Firehose — as late as the buffer. Batch — impossible |
| Recompute 3 years of orders with a new aggregation rule | "3 years," "recompute" | S3 originals + Glue/EMR batch | Stream replay — data outside the retention period is not in the stream |
| Fields keep being added to order events and there are 5 consumer apps | "Schema change," "multiple consumers" | Avro + Glue Schema Registry (BACKWARD) | Plain JSON — no mechanism to block breaking changes |
| An analyst aggregates the same 3 columns every day and the Athena bill is large | "3 columns," "bill" | Parquet conversion + date partitions | Compression alone — it still reads every column |
| The marketing team must not see the email column of the customer table | "Hide a column" | Lake Formation column permissions | S3 bucket policy — it is object-level, so it cannot hide columns |
| Move an on-premises PostgreSQL to Aurora without stopping it, and continue to stream to S3 for analytics afterward | "Zero downtime," "continue" | DMS full load + CDC | DataSync — a file tool. Dump and restore — causes downtime |
| After the nightly batch finishes, quality check then load to Redshift, with a notification on failure | "Order," "on failure" | Connect Glue jobs with Step Functions (or MWAA) | cron alone — it doesn't know whether the earlier step succeeded |
| Keep the raw JSON untouched while also maintaining an analytics copy | "Preserve originals," "for analytics" | S3 raw (JSON) → processing → S3 processed (Parquet) | Overwriting the originals with Parquet — the basis for reprocessing disappears |

## Week 1 Numbers and Defaults on One Page

The fewer numbers to memorize, the better. We have picked out only those that are actually used to discriminate passages within the Week 1 scope.

| Item | Value | Where it is used |
|------|------|------|
| Exam domain weights | Ingestion and transformation 34% / storage and management 26% / operations and support 22% / security and governance 18% | Allocating study time |
| Maximum time of a single Lambda run | 15 minutes | Eliminating the "long ETL on Lambda" option |
| Firehose S3 buffer | Size 1–128 MB (default 5 MB), interval 0–900 seconds (default 300 seconds), delivers when whichever fills first | The real latency of "near real time" |
| Glue streaming default window | 100 seconds | The latency level of micro-batch |
| KDS retention period | 24 hours by default, up to 365 days | The range in which reprocessing is possible |
| Default size of a Parquet Row Group / ORC stripe | 128 MB / 64 MB | Why small files are disadvantageous |
| Athena's default column matching | Parquet by name, ORC by position | Behavior on column rename or mid-table addition |
| Glue Schema Registry's recommended compatibility mode | BACKWARD | The new consumer reads old data |

- Limit and pricing figures change. The exam asks not for exact numbers but for **how it behaves**, such as "there is a default and it is adjustable" or "it acts on the condition reached first."

## Failures Arising in One Pipeline and Their Causes

If you flip the concepts into "what goes wrong and what symptom appears," all of Week 1 connects again.

| Symptom | Cause seen through Week 1 concepts | Remedy |
|------|------|------|
| Running an analytic query slows the service response | An OLAP query executed directly on the OLTP DB | Separate the analytics environment with CDC |
| The Athena bill grows faster than the data | A row-based format + queries without a partition filter | Convert to Parquet, design partitions, put the partition column in WHERE |
| Files are in S3 but Athena results are empty | Partitions not registered in the catalog | Add partitions, crawler, partition projection |
| The early-morning report numbers differ from the real-time dashboard | Streaming misses late events while batch computes after everything has gathered | Pick a single reference metric and correct it with the batch result |
| Consumers hit deserialization errors right after a producer deployment | An incompatible schema change | Block it beforehand with the schema registry's compatibility mode |
| The query does not run in parallel and takes long | One giant GZIP text file | Split it or convert to columnar |
| The query is slow from the planning stage | Tens of thousands of very small files | Increase the buffer, merge periodically |
| A sensitive column is visible to all employees | Only bucket-level permissions are set | Column and row permissions with Lake Formation |

Most of the remedies in the table above are a matter of "how you lay out the data." Scaling up the cluster is the last resort, and the data engineer's job is to first fix format, partitions, file size, and separation (production vs. analytics, originals vs. processed copies). This is also why DEA-C01 asks about design judgment more than service names.

If you now hold this way of thinking in your hands, Week 1 is a success. From Week 2, we flesh out this skeleton and move on to how to actually work with each service.

## 📖 Glossary

- **Workload** : The nature of the work a system must handle. It describes how data is read and written.
- **OLTP / OLAP** : Transaction processing that reads and writes a few rows quickly, versus analytical processing that gathers and aggregates many rows.
- **Lakehouse** : A structure that layers a table format and a catalog on an S3 data lake so it can be queried like a warehouse.
- **schema-on-read / schema-on-write** : Applying structure at read time, versus enforcing structure at store time.
- **Qualifier** : A condition phrase in a passage such as "least operational overhead" or "most cost-effective." It decides one answer among the candidates.
- **Process of elimination** : A solving method of erasing options that violate a condition one by one to leave the answer.
- **Partition pruning** : Reading only the partition folders that match the WHERE condition and skipping the rest.
- **Small-files problem** : The phenomenon where too many very small files make listing and opening costs grow and queries slow down.

## 📝 Practice Questions

**Question 1.** What is the single design principle that runs through all of Week 1, determining every choice of OLTP/OLAP, batch/stream, and row-based/columnar?

A) Always pick the newest technology first  
B) The workload (how the data is read and written) determines the design  
C) Always pick the cheapest service  
D) Always choose real-time processing  

**Answer: B**  
Explanation: Whether OLTP or OLAP, batch or stream, row-based or columnar — the answers all come from the workload characteristic of how the data is read and written. You don't fix the technology or cost first and force a fit; you analyze the workload and choose, and real time is not always the right answer either.

---

**Question 2.** Which combination best satisfies the requirement "I want to run large-scale aggregation analysis on the production order DB's data without putting load on it"?

A) Run aggregation queries directly on the production DB  
B) Replicate changes with DMS CDC to an OLAP environment (Redshift/S3+Athena) and analyze there  
C) Replace the production DB with DynamoDB  
D) Connect QuickSight directly to the production DB and aggregate every time  

**Answer: B**  
Explanation: Running heavy OLAP-style aggregation directly on the OLTP production DB puts load on the service. The standard is to flow only the changes into the analytics environment via DMS CDC and analyze in OLAP. Switching to DynamoDB still leaves you with OLTP and the same problem, and attaching a BI tool directly to the production DB for aggregation causes the same load issue.

---

**Question 3.** Which combination of processing paradigm, ingestion service, and format best fits the requirement "detect fraudulent transactions the moment a payment happens"?

A) Batch / Glue / CSV  
B) Streaming / Kinesis Data Streams / Avro  
C) Batch / DMS / Parquet  
D) Near real-time / Firehose / ORC  

**Answer: B**  
Explanation: Immediacy is required, so it's streaming; Kinesis Data Streams, suited to low latency and multiple consumers, ingests the events; and row-based Avro, strong at schema evolution, fits event streams. The batch combinations lack immediacy, and Firehose is near-real-time for automatic loading, so Data Streams is the better fit for instant detection.

---

**Question 4.** Which statement most accurately describes the key difference between Kinesis Data Streams and Kinesis Data Firehose?

A) Streams is batch-only, Firehose is streaming-only  
B) Streams is for low latency and multiple consumers, while Firehose is a near-real-time delivery service that automatically loads streams into S3/Redshift and other destinations  
C) Streams supports SQL and Firehose does not  
D) The two are functionally identical  

**Answer: B**  
Explanation: Data Streams is for true streaming where low latency and multiple simultaneous consumers are needed, while Firehose is a managed near-real-time delivery service that receives a stream and automatically loads it into S3, Redshift, and OpenSearch without separate consumer code. Both belong to the streaming family and are not functionally identical.

---

**Question 5.** What is the modern standard pattern that combines the strengths of the data lake and the data warehouse, layering a table format and catalog on top of an S3 data lake to provide warehouse-grade queries?

A) Lambda Architecture  
B) Lakehouse  
C) OLTP cluster  
D) Micro-batch  

**Answer: B**  
Explanation: The lakehouse is the unified pattern that layers a table format (Iceberg, etc.) and a catalog on top of the flexible schema-on-read S3 data lake, providing warehouse-grade queries, transactions, and governance. The Lambda Architecture combines batch/speed layers, an OLTP cluster is for transaction processing, and micro-batch is a near-real-time processing technique — none are storage patterns.

---
