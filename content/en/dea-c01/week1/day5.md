# Day 5 - Week 1 Comprehensive Review

Over the past four days we laid the foundation of data engineering. Day 1 covered the role and the pipeline, OLTP/OLAP, and lake/warehouse; Day 2 split batch from streaming; Day 3 unfolded the map of AWS data services; and Day 4 dealt with data formats and schema evolution. They may look like scattered pieces, but in fact they thread together into **a single pipeline**.

Today, instead of re-listing individual concepts, we **follow one scenario from beginning to end** to see how the four days of knowledge interlock. The exam doesn't test fragmented memorization — it asks "what would you choose in this situation" — so reviewing through these connections is the most effective approach.

## Week 1 on One Page

```
[Day1] Roles & concepts   [Day2] Processing  [Day3] Services      [Day4] Formats
 Data engineer             Batch              Ingest Kinesis/DMS   CSV/JSON (raw)
 = pipeline owner          vs                 Store S3/Redshift    Parquet/ORC (analytics)
 OLTP vs OLAP              Streaming          Process Glue/EMR     Avro (streaming)
 Lake vs Warehouse         (latency/          Analyze Athena/QS    Schema evolution
                            throughput)       Governance LakeFmt
```

The keywords of the four days are ultimately different facets of one question: "how do you ingest, store, process, analyze, and govern data."

> 💡 **Related theory**: The single principle running through all these judgments is **"the workload determines the design."** OLTP or OLAP, batch or stream, row-based or columnar — the answers all come from the workload characteristic of "how is the data read and written." Data engineering's way of thinking is not to pick the technology first and force the workload to fit, but to analyze the workload and then choose the technology.

## Threading It Together with a Scenario

Let's follow the requirements of an e-commerce company. Each requirement is tagged with which Week 1 concept it touches.

**Requirement 1.** "Make the order data analyzable without putting load on the production order DB."
- The production DB is **OLTP** (Day 1) → heavy aggregation must not run directly on it
- Replicate only the changes to the analytics environment with **DMS CDC** (Day 3)
- The analytics environment is **OLAP** (Day 1) → Redshift or S3+Athena

**Requirement 2.** "I want to catch fraudulent transactions the moment a payment happens."
- Immediacy required → **streaming** (Day 2)
- Ingest payment events with **Kinesis Data Streams** (Day 3)
- The schema may change, so **Avro + Schema Registry** (Day 4)

**Requirement 3.** "Yesterday's revenue report, automatically, every morning."
- Periodic, bounded data → **batch** (Day 2)
- Process a day's worth with **Glue** (Day 3), load as **Parquet** (Day 4)
- Query and visualize with **Athena/QuickSight** (Day 3)

```sql
-- The analytics query for Requirement 3 — fast and cheap because it's stored as Parquet
SELECT region, SUM(amount) AS revenue
FROM orders          -- Parquet in S3, registered in the Glue Catalog
WHERE order_date = DATE '2026-06-25'   -- partition pruning
GROUP BY region;
```

A single company can have all three requirements at once, each using different paradigms, services, and formats. The key insight is that there is no "one right answer" — there is **a fitting combination for each requirement**.

> 💡 **Related theory**: Merge Requirements 1–3 into one picture and you naturally get a **lakehouse**. All raw data (order CDC, payment streams, logs) gathers in the S3 data lake, gets refined into Parquet through batch and streaming processing, and Athena, Redshift, and QuickSight analyze on top of it. This is why Day 1's "lake vs warehouse" gets "unified into the lakehouse" in the modern era.

## Sorting Out the Commonly Confused Pairs

These are the pairs that show up as exam traps.

| Confusing Pair | Key Distinction |
|------------|----------|
| OLTP vs OLAP | Transactions (few rows, fast) vs analytics (massive rows, aggregation) |
| Lake vs Warehouse | schema-on-read (flexible) vs schema-on-write (strict) |
| Batch vs Streaming | Bounded, periodic vs unbounded, continuous |
| Kinesis Streams vs Firehose | Low latency, multiple consumers vs auto-loading delivery service |
| Glue vs EMR | Managed serverless ETL vs control, large-scale clusters |
| Row-based vs Columnar | Writes, whole rows (Avro) vs reads, aggregation (Parquet) |
| Athena vs Redshift | Ad-hoc, serverless, pay-per-scan vs always-on, large-scale, loaded |
| IAM vs Lake Formation | Resource level vs data (table/column/row) level |

Getting the distinction criteria for just these eight pairs right lets you solve a good share of the scenario questions in Week 1's scope.

> 💡 **Related theory**: Nearly every pair in this table shares the same tension: "**flexibility and generality vs efficiency and specialization**." The lake is flexible but needs management; the warehouse is efficient but rigid. Serverless (Glue/Athena) is convenient but weaker on fine-grained control; clusters (EMR/Redshift) are powerful but carry operational burden. Once you are conscious of the trade-off, memorization turns into understanding.

## The Exam Perspective in One Line

DEA-C01 ultimately asks about these four domains (reconfirming Day 1).

```
1. Ingestion & Transformation (34%)  ← Day2 batch/stream + Day3 Kinesis/Glue/EMR
2. Store Management (26%)            ← Day1 lake/warehouse + Day3 S3/Redshift + Day4 formats
3. Operations & Support (22%)        ← (Week 2 onward) orchestration, monitoring
4. Security & Governance (18%)       ← Day3 LakeFormation/IAM/KMS
```

Week 1 laid nearly all the groundwork for domains 1 and 2. From next week we go into the deep details of each service (partitioning strategies, Glue job tuning, Kinesis shards, and so on), but remember that all of it rests on the big picture we drew today.

## Wrapping Up

Week 1's conclusion is simple. The data engineer is the person who builds **pipelines**, and that pipeline flows through **ingestion → storage → processing → analytics**, wrapped by **governance**. Every design judgment (OLTP/OLAP, batch/stream, lake/warehouse, row-based/columnar) ultimately comes down to **"what does the workload demand."**

If you have this way of thinking in hand, Week 1 is a success. From Week 2 we put flesh on this skeleton and get into actually working with each service.

---

## 📝 연습 문제

**문제 1.** What is the single design principle that runs through all of Week 1, determining every choice of OLTP/OLAP, batch/stream, and row-based/columnar?

A) Always pick the newest technology first  
B) The workload (how the data is read and written) determines the design  
C) Always pick the cheapest service  
D) Always choose real-time processing  

**정답: B**  
해설: Whether OLTP or OLAP, batch or stream, row-based or columnar — the answers all come from the workload characteristic of how the data is read and written. You don't fix the technology or cost first and force a fit; you analyze the workload and choose, and real time is not always the right answer either.

---

**문제 2.** Which combination best satisfies the requirement "I want to run large-scale aggregation analysis on the production order DB's data without putting load on it"?

A) Run aggregation queries directly on the production DB  
B) Replicate changes with DMS CDC to an OLAP environment (Redshift/S3+Athena) and analyze there  
C) Replace the production DB with DynamoDB  
D) Connect QuickSight directly to the production DB and aggregate every time  

**정답: B**  
해설: Running heavy OLAP-style aggregation directly on the OLTP production DB puts load on the service. The standard is to flow only the changes into the analytics environment via DMS CDC and analyze in OLAP. Switching to DynamoDB still leaves you with OLTP and the same problem, and attaching a BI tool directly to the production DB for aggregation causes the same load issue.

---

**문제 3.** Which combination of processing paradigm, ingestion service, and format best fits the requirement "detect fraudulent transactions the moment a payment happens"?

A) Batch / Glue / CSV  
B) Streaming / Kinesis Data Streams / Avro  
C) Batch / DMS / Parquet  
D) Near real-time / Firehose / ORC  

**정답: B**  
해설: Immediacy is required, so it's streaming; Kinesis Data Streams, suited to low latency and multiple consumers, ingests the events; and row-based Avro, strong at schema evolution, fits event streams. The batch combinations lack immediacy, and Firehose is near-real-time for automatic loading, so Data Streams is the better fit for instant detection.

---

**문제 4.** Which statement most accurately describes the key difference between Kinesis Data Streams and Kinesis Data Firehose?

A) Streams is batch-only, Firehose is streaming-only  
B) Streams is for low latency and multiple consumers, while Firehose is a near-real-time delivery service that automatically loads streams into S3/Redshift and other destinations  
C) Streams supports SQL and Firehose does not  
D) The two are functionally identical  

**정답: B**  
해설: Data Streams is for true streaming where low latency and multiple simultaneous consumers are needed, while Firehose is a managed near-real-time delivery service that receives a stream and automatically loads it into S3, Redshift, and OpenSearch without separate consumer code. Both belong to the streaming family and are not functionally identical.

---

**문제 5.** What is the modern standard pattern that combines the strengths of the data lake and the data warehouse, layering a table format and catalog on top of an S3 data lake to provide warehouse-grade queries?

A) Lambda Architecture  
B) Lakehouse  
C) OLTP cluster  
D) Micro-batch  

**정답: B**  
해설: The lakehouse is the unified pattern that layers a table format (Iceberg, etc.) and a catalog on top of the flexible schema-on-read S3 data lake, providing warehouse-grade queries, transactions, and governance. The Lambda Architecture combines batch/speed layers, an OLTP cluster is for transaction processing, and micro-batch is a near-real-time processing technique — none are storage patterns.

---
