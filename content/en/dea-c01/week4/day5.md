# Day 5 - Week 4 Synthesis: The Big Picture of AWS Glue Transformation

This week, we navigated the heart of data engineering — **transformation** — through the AWS Glue ecosystem. We captured metadata with Data Catalog, ran Spark transformations with ETL Job, built no-code transforms with Studio/DataBrew, and guaranteed reliability with Schema Registry and Data Quality. Today we stitch these pieces into one picture, clarify service selection criteria, and review exam traps.

## Glue Data Flow in One Chart

See how all Glue components fit together in a complete pipeline.

```
[Source Data]                S3 raw / Kinesis / MSK / JDBC
     │
     ├─(streaming)→ [Schema Registry] Schema contract, compatibility validation
     │
[Crawler] ──→ [Data Catalog] Register schema, partition metadata
     │              │
     │      (shared by all engines: Athena / Redshift Spectrum / EMR)
     ▼
[Transform Layer]
  ├─ Glue ETL Job (PySpark, DynamicFrame)   ← Engineers, code-based
  ├─ Glue Studio (visual ETL → code gen)    ← Engineers, no-code start
  └─ Glue DataBrew (cleaning·profiling)     ← Analysts, fully no-code
     │
[Quality Gate] Glue Data Quality (DQDL) — Load only passed, isolate failed
     │
     ▼
[Clean Data]  S3 Parquet/Iceberg → Update Catalog → Athena/Redshift/QuickSight

[Orchestration]  Glue Workflow/Trigger · Step Functions · MWAA(Airflow)
[Incremental]    Job Bookmark (transformation_ctx + job.commit())
```

The core insight: **Data Catalog is the center of everything**. Crawlers fill it, transformation tools read and write to it, analysis engines share it.

> 💡 **Related Theory**: This structure maps exactly to the **medallion architecture** (Bronze→Silver→Gold), the standard modern data platform. Crawlers log raw (Bronze), ETL/DataBrew clean it into Silver, further aggregation builds Gold (analysis marts). Glue Data Quality acts as a gate at each layer transition. Don't get lost in AWS service names; understand the universal pattern: "raw → cleaned → aggregated, with quality gates at each step," and it works on any cloud.

## Service Selection Decision Matrix

Exams relentlessly ask "what tool for this situation." Here's this week's criteria.

| Situation | Answer | Why |
|-----------|--------|-----|
| Auto-register S3 data schema/partitions | Glue Crawler → Data Catalog | Auto-infer metadata |
| Large-scale distributed ETL, code available | Glue ETL Job (Spark) | DynamicFrame, powerful transforms |
| Lightweight work <100MB, orchestration | Python Shell Job | Avoid distributed overhead, cheaper |
| Visual ETL, code conversion when needed | Glue Studio | Auto-generate code + edit |
| Analyst's no-code cleaning/profiling | Glue DataBrew | Preview, PII detection, recipes |
| Force streaming schema compatibility | Schema Registry | BACKWARD/FORWARD/FULL |
| Validate and block invalid data values | Glue Data Quality | DQDL rules, quality gates |
| Avoid full reprocessing every run | Job Bookmark | Incremental processing |
| Simple format conversion then S3 load | Firehose + Lambda | Glue is overkill |

Especially remember the last line. **Knowing when Glue isn't the answer** is true mastery. Simple format conversion is cheaper with Firehose+Lambda; complex cluster tuning or non-standard frameworks demand EMR.

## Common Traps Collected

We've emphasized gotchas each day this week. Here they are in one place.

```
[Day1] Non-Hive paths (2026/06/25/) fail auto-partition detection
       → Use key=value (year=2026/...) paths from the start

[Day2] Job Bookmark needs BOTH job.commit() AND transformation_ctx
       → Missing either, incremental processing breaks
       → Modified (overwritten) files are skipped by bookmark

[Day3] Studio = Engineer/production ETL, DataBrew = Analyst/exploratory cleaning
       → Both are "Glue visual" so easy to confuse, DataBrew also costs

[Day4] Schema Registry = form (schema), Data Quality = content (values)
       → Negatives/duplicates/nulls are quality issues, not schema issues
       → DQ auto-recommendations can false-positive, need human review
```

> ⚠️ **Gotcha**: The most common trap is **confusing Glue Crawler with Glue ETL Job**. Crawlers only "register metadata"—they don't transform or copy data. ETL Jobs actually read data, transform it, and write new versions. "Find the schema" = Crawler, "change the data" = ETL Job. Losing this distinction means you'll blow scenario questions.

## Cost Perspective Once More

Data engineers view cost as part of design. Glue transformation cost levers:

| Lever | Save How |
|-------|----------|
| DPU time | Right-size DPU, optimize Jobs, use Python Shell |
| Crawler scans | Incremental crawlers, partition projection to skip crawling |
| Reprocessing | Job Bookmark to process only new data |
| Output format | Parquet/ORC + partitioning cuts downstream scans |
| Over-engineering | Downgrade simple transforms to Firehose+Lambda |

> 🎯 **Comprehensive Scenario**: A company receives raw JSON logs (tens of GB daily) and must turn them into analysis-ready cleaned tables. Full production setup: (1) Land logs to S3 with `dt=` Hive path → (2) **Incremental crawler** registers new partitions in Data Catalog → (3) **Glue Studio**-designed ETL Job reads via `from_catalog`, cleans with ApplyMapping/ResolveChoice, **Job Bookmark** processes only yesterday's new data → (4) **Glue Data Quality** node validates `amount>=0`, `IsComplete`, `RowCount`; load passing data as Parquet, isolate failures → (5) Follow-up crawler updates clean table → (6) **Workflow trigger** auto-runs at dawn daily, monitor quality score on CloudWatch. Athena queries the clean table instantly. This single flow contains this entire week.

## Summary: Transformation Must Be Trustworthy

This week's core lesson is simple: **Transformation isn't just changing data—it's building data you can trust**. Share consistent schemas via Catalog, transform with the right tool (code or no-code), handle increments efficiently with bookmarks, and defend form and content reliability with Schema Registry and Data Quality. Next week escalates transformed data further with Transformation Part 2 — entering the Amazon EMR and Spark universe.

---

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
