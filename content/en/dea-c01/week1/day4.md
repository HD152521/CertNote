# Day 4 - Data Formats and Modeling

The same data, stored in different file formats, can differ 100x in query speed and 10x in cost. When a data analyst asks "why does this query take five whole minutes?", the answer is often "because the data is stored as CSV." A one-line transformation converting CSV to Parquet is frequently the single most effective optimization.

Today we compare the file formats a data engineer faces daily — CSV, JSON, Parquet, ORC, Avro — understand the essence of their differences, **columnar vs row-based** storage, and look at **schema evolution**, which deals with the reality that data structures change over time.

## The Five Formats at a Glance

| Format | Structure | Human-readable | Compression | Primary Use |
|------|------|-----------|------|---------|
| CSV | Row-based, text | Yes | Weak | Simple exchange, legacy |
| JSON | Row-based, text | Yes | Weak | APIs, nested structures, logs |
| Parquet | Columnar, binary | No | Strong | The standard for analytics (OLAP) |
| ORC | Columnar, binary | No | Strong | Hive-ecosystem analytics |
| Avro | Row-based, binary | No | Medium | Streaming, schema evolution |

There are broadly three groups. **Text-based (CSV/JSON)** formats are easy for humans to read and highly compatible, but inefficient. **Columnar binary (Parquet/ORC)** formats are optimized for analytical queries. **Row-based binary (Avro)** is strong at writes and schema evolution, so it's used for streaming and events.

> 💡 **Related theory**: Format choice follows the workload. "Frequent writes, often handling entire records (write-heavy)" → row-based (Avro). "Read-heavy, aggregating only specific columns (read-heavy, analytical)" → columnar (Parquet/ORC). This one line is the criterion for picking a format on the exam.

## Columnar vs Row-Based: The Essence of the Difference

This is today's core. It's the difference in how the same table is laid out on disk.

```
Original table
  id | name  | amount
  1  | Kim   | 100
  2  | Lee   | 200
  3  | Park  | 300

Row-based storage — CSV, Avro
  [1,Kim,100][2,Lee,200][3,Park,300]
  Each row is kept together as a whole

Columnar storage — Parquet, ORC
  [1,2,3][Kim,Lee,Park][100,200,300]
  Values of the same column are kept together
```

Consider an analytical query like `SELECT SUM(amount)`. With row-based storage, reading amount requires scanning id and name too — everything. With columnar storage, reading just the `[100,200,300]` block is enough. **Because only the needed columns are read, I/O drops dramatically.** This is called column pruning.

Furthermore, values in the same column share similar data types and values, so **compression works far better.** The amount column is all numbers and compresses efficiently, whereas mixed types interleaved row by row do not.

```sql
-- Athena cost is proportional to "the amount of data scanned"
-- CSV: even if you only need amount, every column gets scanned → expensive and slow
-- Parquet: only the amount column is scanned → cheap and fast
SELECT region, SUM(amount)
FROM orders          -- with Parquet, only the region and amount columns are read
GROUP BY region;
```

Conversely, workloads that "read or write an entire row," like OLTP, favor row-based storage — because columnar storage must gather multiple column blocks to reconstruct a single row.

> 💡 **Related theory**: Beyond column pruning, columnar formats also gain speed from **predicate pushdown** and **partition pruning**. Parquet stores statistics such as min/max per data block, so blocks that can't match a condition like `WHERE amount > 500` are skipped entirely without being read. The combination of column pruning (reading less horizontally) + predicate pushdown (reading less vertically) is the heart of OLAP performance.

## Why Parquet Is the De Facto Standard for Analytics

Parquet is the default recommended format across the AWS analytics stack (Athena, Redshift Spectrum, Glue, EMR). To summarize why:

- **Column pruning**: reads only the needed columns, cutting I/O and cost (Athena bills by scan volume)
- **Strong compression**: stores the same data far smaller than CSV → lower storage cost
- **Built-in statistics**: per-block min/max enables predicate pushdown
- **Embedded schema**: the file itself contains the schema, making it self-describing

```bash
# A common optimization: convert raw CSV/JSON to Parquet (Glue/Spark)
df = spark.read.json("s3://raw/events/")
df.write.partitionBy("year","month","day") \
        .parquet("s3://processed/events/")
# Athena queries then get faster and scan costs plummet
```

ORC has nearly the same columnar advantages as Parquet and is especially strong in the Hive/Hadoop ecosystem. Both are well supported on AWS, but Parquet is more widely used.

## Avro and Schema Evolution

Avro is row-based binary, yet it is treated as important — because its core strength is **schema evolution**. Avro handles the schema explicitly alongside the data, and it is designed so that the reader's schema and the writer's schema remain compatible even when they differ. That's why it is used almost as a standard in streaming and event pipelines (Kafka, etc.) where schemas change frequently.

**Schema evolution** means safely handling the reality that data structures change over time. For example, a `coupon_code` field might later be added to order events. Both the old data and the new data must remain readable.

```
Compatibility types in schema evolution
  Backward compatible : new schema can read old data
                        → removing fields, adding fields with defaults
  Forward compatible  : old schema can read new data
                        → adding fields
  Full compatible     : both directions work
```

The principle of safe evolution: **when adding a field, give it a default, and never casually delete or rename fields.** With a default, reading old data that lacks the field simply fills in the default — nothing breaks.

> 💡 **Related theory**: The mechanism that enforces schema evolution at the organizational level is the **Schema Registry**. When a producer registers a new schema, it validates compatibility with the existing one, blocking compatibility-breaking changes before deployment. AWS Glue Schema Registry plays this role and integrates with Kinesis and MSK. It is a governance device that enforces data contracts in code.

## Format Selection Decisions

Here is the flow for choosing a format on the exam and in practice.

```
Read directly by humans or exchanged externally?    → CSV / JSON
Loaded into S3 for analytics (aggregation)?         → Parquet (AWS default recommendation)
Hive/Hadoop-ecosystem-centric analytics?            → ORC
Streaming/events with frequent schema changes?      → Avro
Nested, semi-structured data (API responses, logs)? → JSON (→ convert to Parquet later)
```

The typical real-world pattern is **"raw data arrives as JSON/CSV, but the processing stage converts it to Parquet and loads it into the analytics zone."** This captures both the convenience of ingestion (text) and the efficiency of analysis (columnar).

## Wrapping Up

Today's three key points. First, the essential difference between formats is **columnar (Parquet/ORC) vs row-based (CSV/Avro)**, and for analytical queries, columnar — which reads only the columns — is overwhelmingly faster and cheaper. Second, **Parquet is the de facto standard for AWS analytics**, slashing Athena costs through column pruning, compression, and predicate pushdown. Third, **schema evolution** is about safely handling data structure changes; adding fields with defaults is the safe principle, and a schema registry enforces it.

In the next article, we weave together the fundamentals covered in Week 1 — roles and pipelines, batch/streaming, the service map, and data formats — for review.

---

## 📝 Practice Questions

**Question 1.** For an analytical query like `SELECT SUM(amount) FROM orders GROUP BY region`, what is the most fundamental reason a columnar format like Parquet is faster and cheaper than row-based?

A) Because columnar formats encrypt the data  
B) Because only the needed columns (region, amount) are read, reducing scan I/O, and compression works well  
C) Because columnar formats are easy for humans to read  
D) Because columnar is always faster than row-based for every workload  

**Answer: B**  
Explanation: Columnar storage keeps values of the same column together, enabling column pruning that reads only the columns the query needs, and the homogeneous data compresses well. Since Athena bills by scan volume, cost drops too. It has nothing to do with encryption or readability, and OLTP workloads that read/write entire rows actually favor row-based storage, so "always faster" is wrong.

---

**Question 2.** Raw logs are arriving in S3 as JSON. Given that frequent large-scale aggregation analysis with Athena is planned, what is the most effective optimization for the data engineer to take?

A) Leave it as JSON and scale up the instances  
B) Convert the JSON to Parquet in the processing stage and load it into the analytics zone  
C) Convert the JSON to CSV  
D) Just compress the data  

**Answer: B**  
Explanation: Converting to columnar Parquet slashes Athena scan volume and query time through column pruning, compression, and predicate pushdown. Ingest as JSON, convert to Parquet for analysis — the typical pattern. Athena is serverless so there are no instances to scale up, and CSV or mere compression is still row-based, gaining none of the columnar advantages.

---

**Question 3.** In Kafka/streaming event pipelines where schemas change frequently, which row-based binary format is widely used for its write efficiency and schema evolution support?

A) Parquet  
B) Avro  
C) ORC  
D) CSV  

**Answer: B**  
Explanation: Avro is a row-based binary format that is strong at writes, and because it handles data and schema together — designed to stay compatible even when reader/writer schemas differ — it excels at schema evolution. Parquet and ORC are columnar formats for analytics, and CSV is plain text with no schema information, making evolution hard to manage.

---

**Question 4.** You are adding a `coupon_code` field to a live order event schema while keeping previously accumulated old data safely readable. What is the safest schema evolution approach?

A) Add the new field as required, without a default  
B) Add the new field with a default value specified  
C) Rename all existing fields  
D) Delete all the old data  

**Answer: B**  
Explanation: When you add a field with a default, reading old data that lacks the field simply fills in the default and nothing breaks (backward compatible). Adding a required field without a default breaks reads of old data, and renaming fields or deleting data are dangerous, compatibility-destroying changes.

---

**Question 5.** Which governance mechanism validates compatibility with the existing schema when a producer registers a new one, blocking compatibility-breaking changes before deployment?

A) Glue Crawler  
B) Schema Registry (e.g., AWS Glue Schema Registry)  
C) S3 lifecycle policies  
D) IAM policies  

**Answer: B**  
Explanation: A schema registry validates compatibility rules (backward/forward/full) when a new schema is registered, blocking changes that break the data contract. AWS Glue Schema Registry plays this role, integrated with Kinesis and MSK. The Crawler infers schemas, lifecycle policies manage storage costs, and IAM handles access permissions.

---
