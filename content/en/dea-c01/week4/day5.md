# Day 5 - Week 4 Synthesis: The Big Picture of AWS Glue Transformation

## 📌 Key Takeaways

- The center of Glue transformation is the **Data Catalog**. Crawlers populate it, transformation tools read from and write to it, and analytics engines share it.
- **A crawler registers metadata** and **an ETL Job transforms data**. If this distinction wavers, you will keep getting scenario questions wrong.
- Choose tools by user and purpose — a code-written Spark ETL is a Glue Job, visual design is Studio, and an analyst's no-code cleaning is DataBrew.
- Shape (schema compatibility) is guarded by Schema Registry, and content (validity of values) by Glue Data Quality.
- The three "incremental" features (incremental crawl, Job bookmark, partition projection) each reduce a different thing.

## Glue Data Flow on One Page

This week we ran through **transformation**, the heart of data engineering, using the AWS Glue ecosystem. We captured metadata with the Data Catalog, ran Spark transformations with ETL Jobs, did no-code transformations with Studio/DataBrew, and guaranteed reliability with Schema Registry and Data Quality. Today we stitch these pieces into one picture, organize the service selection criteria, and review the traps that tend to produce wrong answers on the exam.

Here is the complete pipeline showing how all the Glue components fit together.

```
[Source Data]                S3 raw / Kinesis / MSK / JDBC
     │
     ├─(streaming)→ [Schema Registry] Schema contract, compatibility validation
     │
[Crawler] ──→ [Data Catalog] Register schema and partition metadata
     │              │
     │      (shared by all engines: Athena / Redshift Spectrum / EMR)
     ▼
[Transformation layer]
  ├─ Glue ETL Job (PySpark, DynamicFrame)       ← Engineer, code
  ├─ Glue Studio (visual ETL → code generation) ← Engineer, starts no-code
  └─ Glue DataBrew (cleaning/profiling Recipe)  ← Analyst, fully no-code
     │
[Quality gate] Glue Data Quality (DQDL) — load only what passes, quarantine failures
     │
     ▼
[Cleaned data]  S3 Parquet/Iceberg → Catalog update → Athena/Redshift/QuickSight

[Orchestration]       Glue Workflow/Trigger · Step Functions · MWAA (Airflow)
[Incremental load]    Job bookmark (transformation_ctx + job.commit())
```

The key is that the **Data Catalog is the center of everything**. Crawlers populate it, transformation tools read from and write to it, and analytics engines share it.

> 💡 **Related Theory**: This structure corresponds exactly to the **medallion architecture (Bronze→Silver→Gold)**, the standard of modern data platforms. The crawler catalogs raw (Bronze), ETL/DataBrew cleans it to produce Silver, and additional aggregation produces Gold (analytics marts). Glue Data Quality acts as a gate at each layer transition. Don't get lost in specific AWS service names; if you understand it as the universal pattern "raw → cleaned → aggregated, with a quality gate at each stage," it works on any cloud.

## Service Selection Decision Summary

The exam persistently asks "what to use in which situation?" These are the selection criteria for this week's tools.

| Situation | Answer | Reason |
|-----------|--------|--------|
| Automatically register schema and partitions of S3 data | Glue crawler → Data Catalog | Automatic metadata inference |
| Large-scale distributed ETL, able to write code | Glue ETL Job (Spark) | DynamicFrame, powerful transformations |
| Lightweight work of a few hundred MB, orchestration | Python Shell Job | Avoids distributed overhead, cheap |
| Visual ETL, switch to code if needed | Glue Studio | Automatic code generation + editing |
| Analyst's no-code cleaning and profiling | Glue DataBrew | Preview, PII detection, Recipe |
| Enforce streaming schema compatibility | Schema Registry | BACKWARD/FORWARD/FULL |
| Validate and block on data value validity | Glue Data Quality | DQDL rules, quality gate |
| Avoid reprocessing everything each time | Job bookmark | Incremental processing |
| Only a simple transformation then load to S3 | Firehose + Lambda | Glue is overdesign |

On the last row, it is important to know the **cases where Glue is not the answer**. For simple format conversion, Firehose + Lambda is cheaper, and if you need complex cluster tuning or a non-standard framework, EMR is better.

## Collected Commonly Missed Traps

Here we gather in one place the traps emphasized on each day this week.

```
[Day1] A non-Hive path (2026/06/25/) fails automatic partition recognition
       → Use key=value paths (year=2026/...) from the start

[Day2] A Job bookmark needs both job.commit() and transformation_ctx
       → If either is missing, incremental processing doesn't work
       → A modified (overwritten) file has a changed modification time and is processed again (watch for target duplicates)

[Day3] Studio = engineers/production ETL, DataBrew = analysts/exploratory cleaning
       → Both are "Glue visual," so beware of confusion; DataBrew is also paid

[Day4] Schema Registry = shape (schema), Data Quality = content (values)
       → Negative/duplicate/null is a quality problem, not a schema problem
       → DQ recommended rules can produce false positives, a person should review
```

> ⚠️ **Gotcha**: The easily confused trap is **mixing up the Glue crawler and the Glue ETL Job**. A crawler only "registers metadata"; it does not transform or copy data. The ETL Job is what actually reads data, transforms it, and writes it anew. "Figure out the schema" = crawler, "change the data" = ETL Job. If this distinction wavers, you will get scenario questions wrong one after another.

## The Cost Perspective Once More

Data engineers treat cost as part of design. Summarizing the cost levers of Glue transformation:

| Lever | How to save |
|-------|-------------|
| DPU hours | Choose appropriate DPUs, optimize the Job, use Python Shell |
| Crawler scans | Incremental crawl, eliminate the crawler with partition projection |
| Reprocessing | Process only new data with Job bookmarks |
| Output format | Parquet/ORC + partitioning reduces downstream scans |
| Overdesign | Downgrade simple transformations to Firehose + Lambda |

> 🎯 **Comprehensive Scenario**: A company receives raw JSON logs (tens of GB) daily and must turn them into an analyzable cleaned table. The complete architecture is: (1) Load logs to S3 under `dt=` Hive paths → (2) An **incremental crawler** registers new partitions in the Data Catalog → (3) An ETL Job designed in **Glue Studio** reads via `from_catalog`, cleans with ApplyMapping and ResolveChoice, and uses a **Job bookmark** to process only yesterday's new data → (4) A **Glue Data Quality** node validates `amount>=0`, `IsComplete`, and `RowCount`, loads only what passes to Parquet, and quarantines failures → (5) A follow-up crawler updates the cleaned table → (6) A **Workflow trigger** runs it automatically each dawn, with the quality score monitored in CloudWatch. Athena queries the cleaned table immediately. This one flow contains the entire week.

## Telling Similarly Named Features Apart

This week several features appeared whose names or roles look alike. Let's put them on the same axis and see the differences.

**The three with "incremental"**

| Feature | What it reduces | State it remembers | What it misses |
|---------|-----------------|--------------------|----------------|
| Incremental crawl | The S3 range the crawler scans | New folders created since the last crawl | Modifications or deletions of existing partitions, schema changes |
| Job bookmark | The input an ETL Job reads | For S3, the object modification time; for JDBC, the bookmark key | UPDATE and DELETE of existing JDBC rows |
| Partition projection | Partition registration work and Catalog lookups | None (computed from rules in table properties) | Engines other than Athena |

**The four that deal with "schema"**

| Feature | Target | What it does |
|---------|--------|--------------|
| Data Catalog | Stored tables | Holds schema, partitions, and location so multiple engines share them |
| Crawler | S3 and JDBC sources | Infers the schema and registers it in the Catalog |
| Schema Registry | Stream records | Manages schema versions and controls changes with compatibility rules |
| ResolveChoice | The running DynamicFrame | Cleans up types mixed in a single column |

**The three that "look into the data"**

| Feature | What it looks at | Result |
|---------|------------------|--------|
| Crawler | Column names and types | A Catalog table definition. It does not look at whether values are right or wrong |
| DataBrew Profile Job | Statistics such as missing rate, distribution, correlation | A current-state diagnostic report |
| Glue Data Quality | Whether rules are satisfied | Pass/fail judgment and quality score, a pipeline gate |

## From Symptom to Cause: This Week's Incident Backtracking Table

| Symptom | Cause | Action |
|---------|-------|--------|
| Yesterday's data cannot be queried in Athena | The new partition is not in the Catalog | Run the crawler, `ALTER TABLE ADD PARTITION`, or partition projection |
| The partition column name is picked up as `partition_0` | The path is not in `key=value` format | Load to Hive-style paths or fix the name in the table definition |
| A single crawl creates dozens of tables | Files with dissimilar schemas are mixed under one path | Separate the paths or turn on the single-schema-per-path option |
| The Job rereads everything every time | The bookmark is Disable (the default), or `transformation_ctx` or `job.commit()` is missing | Satisfy all three conditions |
| Duplicate rows appear in the target even with the bookmark on | A source file was overwritten and processed again, or data was loaded to the same path again after a bookmark Reset | Keep source files immutable, and separate the output path for reprocessing |
| The Job dies from out-of-memory | Data skew makes one partition too large, or there are too many small files | Move up the worker type, group files, reduce the input with a pushdown predicate |
| The consumer's deserialization fails after the producer deployment | The schema changed without a compatibility check (NONE, or Registry not used) | Use a compatibility mode such as BACKWARD so it is rejected at the registration stage |
| Dashboard numbers are wrong without any error | The schema is right but the values are wrong | Put a Glue Data Quality gate before the load |
| DataBrew cost is higher than expected | An interactive session was left open and idle | Close the session when work is done, and move repeated work to a scheduled Job |

## Scenario Practice: From Clue to Choice

These are placed as pairs where changing one condition in the same situation changes the answer.

| Scenario | Decisive clue | Choice |
|----------|---------------|--------|
| Logs pile up daily under `dt=` paths and are queried only with Athena. You want to eliminate crawler cost | The only consumer is Athena, regular partitions | Partition projection |
| Same as above, but Redshift Spectrum also reads the same table | Projection is Athena-only | Incremental crawl or partition registration at the load stage |
| Fetch only newly added rows from an RDS orders table daily | Append-only table, increasing key | Glue Job + bookmark |
| Same as above, but order status is frequently UPDATEd | Changes to existing rows | DMS CDC (a bookmark misses changes) |
| A marketer tidies the phone number format in a customer CSV themselves | Non-developer, preview | DataBrew |
| Design with a graph an operational ETL joining multiple sources, and control part of it with code | Engineer, operational pipeline | Glue Studio |
| Add a field to a Kafka topic's Avro schema and deploy with zero downtime | Schema contract on a stream | Schema Registry BACKWARD + add as an optional field + deploy consumers first |
| Before loading, pick out and quarantine only the rows where `amount` is negative | Value validation + identifying failed records | Glue Data Quality inside an ETL Job |
| Read a 50MB configuration file and call an external API | Small data, no distribution needed | Python Shell Job |
| Lower the cost of a non-urgent nightly bulk transformation | Delayed start acceptable | Flex execution class |

## Billing Units at a Glance

To know what the levers in the "cost perspective" table above reduce, you first need to know what each component is billed on.

| Component | Billing basis |
|-----------|---------------|
| Crawler | DPU × run time |
| ETL Job (Spark) | Sum of the workers' DPUs × run time. Flex has a lower unit price |
| Python Shell Job | 0.0625 or 1 DPU × run time |
| Data Catalog | Number of stored objects and number of requests (with a free tier) |
| DataBrew | Interactive sessions (30-minute units) + Job node hours |
| Data Quality | DPUs used for evaluation × time |
| Schema Registry | No additional charge |

Next week we move into Transformation Part 2 — Amazon EMR and Spark, Lambda transformation, orchestration, and performance and cost optimization.

## 📖 Glossary

- **Medallion architecture**: A lake design pattern that stacks data in stages of raw (Bronze) → cleaned (Silver) → aggregated (Gold).
- **Incremental processing**: A method of processing only data newly created since the last run instead of reprocessing everything each time.
- **Quality gate**: A checkpoint that prevents data failing the quality criteria from moving to the next stage.
- **Pruning**: An optimization that skips partitions or columns not needed by the query condition without reading them at all.
- **Recipe**: A reusable list in DataBrew that writes down the applied transformation steps in order.
- **DQDL**: The declarative language for writing Glue Data Quality rules.
- **Choice type**: The representation in which a DynamicFrame preserves all the types when a single column has a mix of types.
- **Compatibility mode**: Schema Registry's rule that judges whether a new schema version may be registered.

## 📝 Practice Questions

**Question 1.** Which of the following most accurately distinguishes the roles of a Glue crawler and a Glue ETL job?

A) A crawler registers metadata (schemas and partitions), and an ETL job actually reads, transforms, and writes the data  
B) A crawler transforms data, and an ETL job only registers metadata  
C) They are identical and differ only in name  
D) A crawler deletes data, and an ETL job backs it up  

**Answer: A**  
Explanation: A crawler does not transform data; it only registers schema and partition metadata in the Catalog. An ETL job, on the other hand, reads the source, actually transforms it, and writes it to a new location. The key distinction is "figuring out the schema = crawler, changing the data = ETL job."

---

**Question 2.** Which choice is the most cost-effective for the following requirement? "We only need to change the format of incoming JSON and load it into S3, with no window aggregation or complex distributed transformation."

A) Glue ETL Spark job with the maximum DPU setting  
B) Always-on EMR cluster  
C) Kinesis Data Firehose + Lambda transformation  
D) Keep a Glue DataBrew interactive session running at all times  

**Answer: C**  
Explanation: For a simple format conversion followed by loading into S3, Firehose + Lambda is the simplest and cheapest. A Glue Spark job or EMR is suited to complex distributed transformations and would be over-engineering here. Keeping a DataBrew session running at all times only adds cost. This is a typical case of "when Glue is not the answer."

---

**Question 3.** A Glue job bookmark is not working, so all of the data is reprocessed every time. Which of the following is NOT an item to check?

A) Whether the bookmark is enabled in the job properties  
B) Whether transformation_ctx is specified on the source/sink  
C) Whether job.commit() is called at the end of the script  
D) Whether the Schema Registry compatibility mode is FULL  

**Answer: D**  
Explanation: For a job bookmark to work, you need to enable the bookmark, specify transformation_ctx, and call job.commit(). The Schema Registry compatibility mode relates only to streaming schema validation and is unrelated to batch job bookmarks, so it is not something to check.

---

**Question 4.** Which option correctly pairs the services responsible for validating a data schema (shape) and values (content)?

A) Schema compatibility = Glue Data Quality / Value validity = Schema Registry  
B) Schema compatibility = Schema Registry / Value validity (negatives, duplicates, nulls) = Glue Data Quality  
C) Both are handled by a Glue crawler  
D) Both are handled by Athena  

**Answer: B**  
Explanation: Schema Registry enforces schema compatibility (shape) for streaming data, and Glue Data Quality validates value validity (content, such as no negatives, no duplicates, and null ratios) with DQDL. A crawler registers metadata and Athena is a query engine, so neither performs this role.

---

**Question 5.** An analyst who does not know how to code wants to quickly profile and clean data. A data engineer, on the other hand, wants to visually design a production ETL that includes complex joins while controlling some parts with code. Which tool fits each?

A) Analyst = Glue Studio / Engineer = DataBrew  
B) Analyst = Crawler / Engineer = Schema Registry  
C) Analyst = Glue DataBrew / Engineer = Glue Studio  
D) Analyst = Athena / Engineer = QuickSight  

**Answer: C**  
Explanation: No-code cleansing and profiling is DataBrew, for analysts; building a production ETL visually with the ability to switch to code is Studio, for engineers. A swaps the two, and the crawler, Schema Registry, Athena, and QuickSight are not cleansing or ETL design tools.

---
