# Day 4 - Data Formats and Modeling

## 📌 Key Takeaways

- The essential difference between formats is **columnar (Parquet/ORC) vs. row-based (CSV/JSON/Avro)**. For analytic queries, columnar, which reads only the needed columns, is faster and cheaper.
- **Parquet is the de facto standard for AWS analytics.** Column pruning, compression, and predicate pushdown reduce Athena scan volume.
- **Avro is strong at writes and schema evolution**, so it is used for streaming and events, and a schema registry enforces the compatibility rules.
- The principle of safe schema evolution is "add fields with default values." Deleting, renaming, or changing types can break depending on the format and the way of reading.
- The typical pattern is "receive raw data as JSON/CSV, then convert it to Parquet in the processing stage and load it into the analytics zone."

## The Five Formats at a Glance

Even with the same data, the file format you store it in can make a 100x difference in query speed and a 10x difference in cost. When a data analyst asks "why does this query take 5 whole minutes?", the answer is often "because the data is stored as CSV." A one-line conversion from CSV to Parquet is frequently the most effective optimization.

Today we compare the file formats a data engineer faces every day — CSV, JSON, Parquet, ORC, and Avro — understand the essence of their difference, **columnar vs. row-based** storage, and look at **schema evolution**, which deals with the reality that data structures change over time.

| Format | Structure | Human-readable? | Compression | Main use |
|------|------|-----------|------|---------|
| CSV | Row-based, text | Yes | Weak | Simple exchange, legacy |
| JSON | Row-based, text | Yes | Weak | APIs, nested structures, logs |
| Parquet | Columnar, binary | No | Strong | The standard for analytics (OLAP) |
| ORC | Columnar, binary | No | Strong | Analytics in the Hive ecosystem |
| Avro | Row-based, binary | No | Medium | Streaming, schema evolution |

There are three broad groups. **Text-based (CSV/JSON)** is easy for people to read and has good compatibility but is inefficient. **Columnar binary (Parquet/ORC)** is optimized for analytic queries. **Row-based binary (Avro)** is strong at writes and schema evolution, so it is used for streaming and events.

> 💡 **Related theory**: Format choice follows the workload. "Are writes frequent and do you often handle a whole record (write-heavy)?" → row-based (Avro). "Is it read-mostly, aggregating only specific columns (read-heavy, analytical)?" → columnar (Parquet/ORC). This one line is the criterion for choosing a format on the exam.

## Columnar vs. Row-Based: The Essence of the Difference

This is today's core. It is the difference in how the same table is laid out on disk.

```
Original table
  id | name  | amount
  1  | Kim   | 100
  2  | Lee   | 200
  3  | Park  | 300

Row-based storage — CSV, Avro
  [1,Kim,100][2,Lee,200][3,Park,300]
  Gathers a whole row together

Columnar storage — Parquet, ORC
  [1,2,3][Kim,Lee,Park][100,200,300]
  Gathers the same column together
```

Take an analytic query like `SELECT SUM(amount)` as an example. With row-based, to read amount you have to scan id and name as well. With columnar, you only read the `[100,200,300]` block and you are done. **Because it reads only the needed columns, I/O drops dramatically.** This is called column pruning.

On top of that, the same column has similar data types and values, so **it compresses far better.** The amount column is all numbers so it compresses efficiently, but types mixed row by row do not.

```sql
-- Athena cost is proportional to the "amount of data scanned"
-- CSV: scans every column even if you only need amount → expensive and slow
-- Parquet: scans only the amount column → cheap and fast
SELECT region, SUM(amount)
FROM orders          -- With Parquet, only the two columns region and amount are read
GROUP BY region;
```

Conversely, work that "reads or writes a whole row," like OLTP, favors row-based. This is because columnar has to gather multiple column blocks to reconstruct a single row.

Columnar formats get faster not only through column pruning but also through **predicate pushdown** and **partition pruning**. Parquet stores statistics such as min/max for each data block, so it skips blocks that do not match a condition like `WHERE amount > 500` without reading them at all. The combination of column pruning (reading less horizontally) + predicate pushdown (reading less vertically) is the core of OLAP performance.

## Why Parquet Is the De Facto Standard for Analytics

In the AWS analytics stack (Athena, Redshift Spectrum, Glue, EMR), Parquet is the default recommended format. Summarizing the reasons:

- **Column pruning**: reads only the needed columns, cutting I/O and cost (Athena bills by scan volume)
- **Strong compression**: stores the same data much smaller than CSV → lower storage cost
- **Built-in statistics**: predicate pushdown through per-block min/max
- **Embedded schema**: the file itself contains the schema, making it self-describing

```bash
# A common optimization: convert raw CSV/JSON to Parquet (Glue/Spark)
df = spark.read.json("s3://raw/events/")
df.write.partitionBy("year","month","day") \
        .parquet("s3://processed/events/")
# Afterward, Athena queries get faster and scan cost drops sharply
```

ORC has almost the same columnar advantages as Parquet and is especially strong in the Hive/Hadoop ecosystem. On AWS both are well supported, but Parquet is more widely used.

## Avro and Schema Evolution

Avro is a row-based binary, yet it is treated as important. This is because its key strength is **schema evolution**. Avro handles the schema explicitly alongside the data and is designed to stay compatible even when the schema used for reading (reader) and the schema used for writing (writer) differ. That is why it is used almost as a standard in streaming and event pipelines (Kafka and the like) where the schema changes often.

**Schema evolution** means safely dealing with the reality that data structures change over time. For example, a `coupon_code` field may be added to an order event later. At that point you must be able to read both old and new data.

```
Kinds of compatibility in schema evolution
  Backward compatible  : the new schema can read old data
                         → deleting a field, adding a field with a default
  Forward compatible   : the old schema can read new data
                         → adding a field
  Fully compatible     : both directions are possible
```

The principle of safe evolution: **when you add a field, give it a default, and do not delete or rename carelessly.** If there is a default, reading old data that lacks that field fills it with the default and nothing breaks.

What enforces schema evolution at the organizational level is the **Schema Registry**. When a producer registers a new schema, it verifies compatibility with the existing ones and blocks compatibility-breaking changes before deployment. AWS Glue Schema Registry plays this role and integrates with Kinesis and MSK. It is a governance mechanism that enforces the data contract in code.

## Format Selection Decision

This is the flow for choosing a format on the exam and in practice.

```
Read directly by people or exchanged with outside parties?  → CSV / JSON
Loaded into S3 for analytics (aggregation)?                 → Parquet (AWS default recommendation)
Analytics centered on the Hive/Hadoop ecosystem?            → ORC
Streaming/events, schema changes often?                     → Avro
Nested or semi-structured (API responses, logs)?            → JSON (→ convert to Parquet afterward)
```

The typical real-world pattern is **"raw data arrives as JSON/CSV, but in the processing stage it is converted to Parquet and loaded into the analytics zone."** It is a way to get both the convenience on arrival (text) and the efficiency at analysis time (columnar).

## Opening Up a Parquet File

"Stores the same columns together" is actually a three-tier structure. Knowing this structure explains at once why pruning and pushdown work and why small files are bad.

```
Parquet file
 ├─ Row Group 1            ← a unit that cuts rows into large chunks (default 128 MB)
 │   ├─ Column Chunk: id       ├─ Page ... Page   ← smallest unit of encoding and compression
 │   ├─ Column Chunk: name     ├─ Page ... Page
 │   └─ Column Chunk: amount   ├─ Page ... Page
 ├─ Row Group 2
 │   └─ ...
 └─ Footer                 ← schema, position (offset) of each column chunk, min/max and null-count statistics
```

- The reader reads the **footer first**. After looking at the schema and statistics and deciding "which column chunks of which Row Groups are needed," it requests only those byte ranges from S3. It does not download the whole file.
- **Column pruning** is picking only the needed column chunks, and **predicate pushdown** is using min/max statistics to skip Row Groups and pages that do not match the condition.
- To skip using statistics, the values have to be **sorted** for it to be effective. If you write the data sorted by `created_at`, a query on a short time range skips most Row Groups. If the values are randomly mixed, every Row Group's min/max range overlaps the condition, so there is nothing to skip.
- Inside a column chunk, **dictionary encoding** (replacing repeated values with numbers) and run-length encoding are applied first, and compression such as Snappy or GZIP is applied on top. That is why a column with few distinct values, like `region`, shrinks especially well.
- ORC implements the same idea with a unit called a **stripe (default 64 MB)**. The conceptual correspondence is Row Group ≈ stripe.

> ⚠️ **Pitfall**: Columnar is not unconditionally fast. If a file is very small, the fixed cost of reading the footer and metadata exceeds the gain. Tens of thousands of Parquet files of a few KB each can be slower than a few large CSVs. Converting to columnar and bundling files to a sufficient size go together as a set.

## Compression Codecs and "Splittable"

Format and compression are separate choices. `.json.gz` is "JSON format + GZIP compression," and Parquet compresses page by page inside the file.

| Codec | Character | Mainly used for |
|------|------|------|
| Snappy | Average compression ratio, fast compression and decompression | A common Parquet default. Firehose's Parquet conversion also defaults to Snappy |
| GZIP | High compression ratio, slow | Archiving text logs. The default compression when Athena writes Parquet or text |
| ZSTD | Balance of compression ratio and speed | The default compression for Athena's Iceberg tables |
| ZLIB | Deflate-based | The default compression when Athena writes ORC |

- **Splittable** means that multiple workers can divide up a single large file and read it concurrently.
- A compressed **text file** (CSV or JSON bundled with GZIP) mostly has to be decompressed in order from the start, so it cannot be read in pieces. A single 10 GB `.csv.gz` is read to the end by a single worker.
- Parquet and ORC compress independently per Row Group or stripe, so the file can be read in pieces whichever codec you use.
- That is why, when you compress text, splitting it into several files of a moderate size rather than "one giant file" is better for parallelism. The number of files becomes the upper limit on how many workers can work at the same time.
- Athena measures scan volume by the size before decompression, that is, **the compressed bytes stored in S3**. Just compressing lowers the charge, and going columnar as well measures only the columns read.

## Schema Changes Allowed per Format (Athena)

"Strong at schema evolution" means something different for each format. Athena applies the schema at read time (schema-on-read), so what matters is how old files are interpreted when you change the table definition.

| Change | CSV/TSV | JSON | Avro | Parquet (read by name, default) | ORC (read by position, default) |
|------|:---:|:---:|:---:|:---:|:---:|
| Add a column at the end | Yes | Yes | Yes | Yes | Yes |
| Add a column at the front/middle | No | Yes | Yes | Yes | No |
| Delete a column | No | Yes | Yes | Yes | No |
| Rename a column | Yes | No | No | No | Yes |
| Reorder columns | No | Yes | Yes | Yes | No |

- The principle that splits them is **"does it find a column by name, or by position (order)?"**
  - If it finds by name, it is safe even if the order changes or a column is inserted in the middle, but if you rename a column it cannot find that column in old files and gets NULL.
  - If it finds by position, you can rename freely, but inserting or removing a column in the middle shifts every later column over by one.
- Athena's defaults read **Parquet by name and ORC by position**. You can reverse this with SerDe properties (`parquet.column.index.access`, `orc.column.index.access`).
- CSV is interpreted by position even if it has a header. That is why the accident happens where "a column was added to the middle of the CSV source and values land in the wrong columns."
- With any format, **adding at the end** is safe. That is why the practical rule is "put new columns at the very end, with a default (or allow NULL)."

## Compatibility Modes of the Glue Schema Registry

When you register a new schema version, the registry checks it against the compatibility rule you set, and rejects the registration if it is violated. AWS Glue Schema Registry supports **Avro, JSON (JSON Schema), and Protobuf**, has no separate charge, and integrates with Apache Kafka, Amazon MSK, Kinesis Data Streams, Managed Service for Apache Flink, and Lambda.

| Mode | What it guarantees | Allowed changes |
|------|------|------|
| NONE | No checking | Anything is registered (for development) |
| DISABLED | Prevents adding versions at all | None |
| BACKWARD | A consumer of the new schema can also read the **previous** version's data | Deleting a field, adding an optional field |
| BACKWARD_ALL | Same as above but against **all earlier** versions | Same |
| FORWARD | A consumer of the previous schema can read **new** data | Adding a field, deleting an optional field |
| FORWARD_ALL | Same as above but against all earlier versions | Same |
| FULL | Two-way compatible with the previous version | Only adding and deleting optional fields |
| FULL_ALL | Two-way compatible with all earlier versions | Same |

- AWS's recommended default choice is **BACKWARD**. This is because a consumer upgraded to the new code must be able to read the old messages still left in the stream.
- The mode decides the **deployment order**. BACKWARD is safe even if you upgrade consumers first (the new consumer reads old data), and FORWARD is safe even if you upgrade producers first (the old consumer reads new data). If you cannot control which side to deploy first, it is FULL.
- Modes without `_ALL` compare **only with the immediately preceding version**. If you may ever re-read a long-retention stream from the beginning, a v5 consumer must read messages written with v1, so you need `_ALL`.
- Why "adding a required field" is rejected under BACKWARD: the old messages lack that field, yet the new consumer believes it must be present. If you change it to an optional field, it passes.

With a registry, you do not ship the entire schema with every message. The serializer registers (or looks up) the schema in the registry and attaches only a schema version identifier to the message. The consumer's deserializer fetches the schema with that identifier and interprets the message. The reason Avro messages are smaller than JSON is that they do not carry field names every time.

## Three Ways to Change the Format

"Convert JSON to Parquet" has different constraints depending on where you do it.

| Method | Behavior | Constraints and cautions |
|------|------|------|
| Glue ETL job | Read with Spark and `write.parquet` | The most freedom. You decide partitioning, sorting, and file size yourself |
| Athena CTAS / INSERT INTO | Create a new table in Parquet with a single SQL statement | Finishes without a server. Limited to transformations expressible in SQL |
| Firehose record format conversion | Converts to Parquet/ORC before the stream reaches S3 | Input can only be JSON (convert CSV and others to JSON first with Lambda), the destination can only be S3, the schema is taken from a Glue table, buffer size 64 MB or more |

```sql
-- Athena CTAS: turn a raw JSON table into a date-partitioned Parquet table
CREATE TABLE events_parquet
WITH (
  format            = 'PARQUET',
  write_compression = 'SNAPPY',
  partitioned_by    = ARRAY['dt'],
  external_location = 's3://datalake/processed/events/'
) AS
SELECT user_id, event_type, amount, dt     -- the partition column goes last in the SELECT
FROM events_raw_json
WHERE dt = '2026-06-25';
```

- In Firehose conversion, attributes that are not in the Glue table schema are **dropped** from the output. If you do not align the schema first, data silently shrinks.
- Records that fail conversion are not discarded but land under an error prefix in S3. If you turn on format conversion, you must monitor that path.

## File Format and Table Format Are Different Layers

- A **file format** (Parquet, ORC, Avro) decides the internal layout of a single file.
- A **table format** (Apache Iceberg and others) manages, through metadata, "which collection of files is this table right now." The data files themselves are usually Parquet.
- What a table format adds is row-level updates and deletes, snapshots (time travel), and safe schema evolution such as column renaming. The reason "rename a column," which Parquet could not do in the table above, works in Iceberg is that it tracks columns by a unique ID rather than by name.
- If a passage requires "record-level updates and deletes and ACID transactions on an S3 data lake," it is a table format (lakehouse) problem, not a file format choice.

## Passage Clue → Format Decision Table

| Passage clue | Answer | Reason |
|------|------|------|
| "Reduce Athena query cost," "aggregate only some columns" | Parquet (or ORC) + partitions | Fewer bytes scanned |
| "The schemas of the streaming producer and consumer change often" | Avro + Glue Schema Registry | Compatibility checks block breaking changes |
| "Deliver to an outside vendor as a file people can open" | CSV | Compatibility and readability |
| "Store nested API responses as is" | JSON (raw zone) → then Parquet | Flexibility, then efficiency |
| "Make the JSON received by Firehose analyzable right away" | Firehose format conversion (Parquet) | Converts at load time without a separate ETL |
| "It's one big GZIP CSV so the query doesn't run in parallel" | Split into multiple files or convert to Parquet | Compressed text cannot be read in pieces |
| "I renamed a column and old data became NULL" | Because Parquet reads by name | Add a new column instead of renaming |
| "Row-level deletion in the data lake (personal-data deletion request)" | A table format such as Iceberg | Not possible with a file format alone |

In the next post, we tie together and review the fundamentals covered in Week 1 — roles and pipelines, batch/streaming, the service map, and data formats.

## 📖 Glossary

- **Row-based / columnar** : A way of storing a whole row stuck together, versus a way of storing the values of the same column gathered together.
- **Column pruning** : Selecting and reading only the columns a query needs. The effect is large only with columnar formats.
- **Predicate pushdown** : Pushing the WHERE condition down to the file-reading stage so that blocks that do not match are not read at all.
- **Row Group / stripe** : The unit in which Parquet and ORC bundle rows into large chunks. Statistics are attached to each chunk.
- **Footer** : The metadata at the end of a Parquet file. It contains the schema, column positions, and statistics.
- **Splittable** : The property that multiple workers can divide up a single large file and read it concurrently.
- **Schema evolution** : Safely handling a data structure that changes over time, such as fields being added or deleted, together with old data.
- **Backward / forward compatibility** : The new schema can read old data / the old schema can read new data.
- **Schema registry** : A store that keeps schema versions in one place and blocks the registration of new versions that violate the compatibility rules.
- **SerDe** : Serializer/deserializer. The rule that turns a file's bytes into table rows (or the reverse).

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
