# Day 2 - Data Catalog & ETL: AWS Glue and DataBrew

Yesterday we collected data into the S3 data lake. But simply throwing objects into S3 isn't enough for analysis or training. You need to know **"what data is in this bucket, and under what schema?"** so you can query with Athena and train with SageMaker. Managing this metadata is what **data cataloging** is about, and preparing data by cleaning and transforming it is what **ETL** means.

Today's stars are **AWS Glue** — a serverless data integration service. We'll cover crawlers, the data catalog, ETL Jobs, and even the no-code tool DataBrew.

## Glue Data Catalog: The Metadata Repository of a Data Lake

Glue Data Catalog is a **Hive Metastore-compatible metadata repository**. It stores information *about* the data, not the data itself — table names, columns, types, S3 locations, partitions.

```
Glue Data Catalog Structure:
Database (logical group)
└─ Table (S3 location + schema + partitions)
   ├─ Columns: customer_id (string), amount (double), ts (timestamp)
   ├─ Location: s3://ml-datalake/curated/transactions/
   ├─ SerDe: parquet
   └─ Partitions: year=2026/month=06, year=2026/month=05, ...
```

This catalog is **shared by Athena, Redshift Spectrum, EMR, SageMaker, and Glue ETL**. Once registered once, every analytics and ML tool sees the same schema. It's the "single source of truth" for table definitions in the data lake.

> 💡 **Related Theory**: Glue Data Catalog inherits the concept of Apache Hive's **Metastore**. Hive, created by Facebook in 2009 to use SQL over HDFS, pioneered the core idea of "separating data (HDFS files) from schema (Metastore)." This separation is exactly **schema-on-read**. Unlike traditional databases that enforce schema at write time (schema-on-write), data lakes store the original first and apply schema at read time. This allows flexible accommodation of diverse formats and sources.

## Glue Crawler: Automatic Schema Inference

When you have thousands of files in S3, defining each table manually is impractical. **Glue Crawler** scans S3 (or JDBC sources), automatically infers the schema, and creates tables in the catalog.

How the crawler works:

1. Scan the designated S3 path
2. Detect file format (Parquet/CSV/JSON, etc.)
3. Infer columns and types (using classifiers)
4. Recognize `key=value` directories as partitions
5. Create/update table in Data Catalog

```python
import boto3

glue = boto3.client("glue")

glue.create_crawler(
    Name="transactions-crawler",
    Role="arn:aws:iam::123456789012:role/GlueCrawlerRole",
    DatabaseName="ml_datalake",
    Targets={"S3Targets": [{"Path": "s3://ml-datalake/curated/transactions/"}]},
    Schedule="cron(0 2 * * ? *)",  # Every day at 02:00 UTC
)
glue.start_crawler(Name="transactions-crawler")
```

> 🔍 **Deeper Dive**: If the same folder has files with different schemas, the crawler **splits them into multiple tables (or merges them)**. This behavior is controlled by the crawler's "schema change policy" and "grouping behavior" settings. Exam trap: when you re-run the crawler and new columns are added, it updates the schema by default, but column deletion might be ignored depending on policy. Also, using the "crawl new folders only" option prevents the crawler from full-scanning partitions each time, saving costs.

> ⚠️ **Gotcha**: Instead of re-running the crawler when new partitions are added, you can also use Athena's `MSCK REPAIR TABLE` or `ALTER TABLE ADD PARTITION` to register partitions. Also, if the partition path is Hive-style (`year=2026/`), you can enable **partition projection** to make the crawler recognize partitions without even running it (Day 4).

## Glue ETL Job: Serverless Data Transformation

While the catalog is "what's where," **Glue ETL Job** is "how to transform data." It runs serverless on Apache Spark (or Python Shell, Ray).

The core abstraction is **DynamicFrame**. Similar to Spark DataFrame, but stronger at handling semi-structured data with inconsistent schemas (e.g., `ResolveChoice` resolves type conflicts).

```python
import sys
from awsglue.context import GlueContext
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# Read from catalog
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="ml_datalake", table_name="raw_transactions"
)

# Remove nulls + select columns (cleaning)
cleaned = dyf.drop_nulls().select_fields(["customer_id", "amount", "ts"])

# Write to Curated zone as Parquet (partitioned)
glueContext.write_dynamic_frame.from_options(
    frame=cleaned,
    connection_type="s3",
    connection_options={
        "path": "s3://ml-datalake/curated/transactions/",
        "partitionKeys": ["year", "month"],
    },
    format="parquet",
)
```

Glue Job billing is based on **DPU (Data Processing Unit)** — 4 vCPU + 16GB memory — and execution time (in seconds). Being serverless, there's no cluster provisioning.

> 🔍 **Deeper Dive**: Glue ETL has three execution types. (1) **Spark**: Large-scale distributed transformations. (2) **Python Shell**: Simple scripts on small data (avoiding Spark overhead). (3) **Glue Streaming**: Process Kinesis/Kafka streams in microbatches. Running a Spark Job on small data is slow and expensive due to cluster startup overhead. On the exam: if you see "small MB-scale transformation," Python Shell is more appropriate.

> 💡 **Related Theory**: Know the difference between ETL and ELT. Traditional ETL transforms first, then loads to a data warehouse. In cloud data lakes, it's common to Load first to Raw, then Transform — that's ELT. S3 is cheap, and compute is separate. Glue supports both, but in data lake context, ELT patterns are common.

## Glue DataBrew: No-Code Data Preparation

When a data analyst wants to profile and clean data *visually* without writing Spark code, they use **Glue DataBrew**.

- **250+ predefined transformations**: Null handling, outlier removal, one-hot encoding, normalization, date parsing, etc.
- **Data profiling**: Automatically report column distributions, null rates, correlations, outliers.
- **Recipes**: Save applied transformation steps for reuse and scheduling.
- Work in GUI without code, output results to S3.

| Aspect | Glue ETL Job | Glue DataBrew |
|------|------|------|
| Interface | Code (PySpark/Scala) | No-code GUI |
| User | Data Engineer | Data Analyst/Scientist |
| Scale | Large distributed | Small-to-medium + profiling |
| Strength | Complex custom logic | Fast exploration/cleaning, visualization |

> 🔍 **Deeper Dive**: DataBrew's real value in ML preprocessing is **data profiling**. Before building a model, you quickly discover facts like "this column has 40% null rate," "this feature has zero correlation with the target" — without code. This connects directly to Day 3's EDA (Exploratory Data Analysis). On the exam, keywords like "no-code," "non-technical user," "visual data prep/profiling" point to DataBrew.

## The Big Picture: Ingest → Catalog → Transform

```
S3 Raw Zone (JSON/CSV)
   │
   ├─ Glue Crawler ──→ Glue Data Catalog (register schema)
   │
   ├─ Glue ETL Job ──→ Clean & Transform (DynamicFrame, Spark)
   │                     or
   ├─ Glue DataBrew ──→ No-code cleaning & profiling
   │
   ▼
S3 Curated Zone (Parquet, partitioned)
   │
   ▼
Athena / Redshift / SageMaker (Day 3, training)
```

## Summary

Glue is the central hub of ML data preparation. **Crawler** infers the schema and registers it in **Data Catalog**, then **ETL Job** (code) or **DataBrew** (no-code) cleans and transforms. All tools share the same catalog, enabling consistent schema for analytics and training.

Next, we'll explore how to query data prepared this way using **Athena and Redshift**, and cover the basics of EDA (Exploratory Data Analysis).

---

## 📝 연습 문제

**문제 1.** A data engineer wants to automatically register thousands of Parquet files in S3 to Glue Data Catalog without manually defining schemas. What is the most suitable tool?

A) Glue ETL Job  
B) Glue Crawler  
C) Athena CREATE TABLE  
D) Glue DataBrew  

**정답: B**  
해설: Glue Crawler scans S3 paths, auto-infers file format and column/type, recognizes partitions, and creates tables in Data Catalog. This is the textbook answer for automatic schema registration. ETL Job (A) is for transformation, not schema registration. Athena CREATE TABLE (C) is manual definition, impractical for thousands of files. DataBrew (D) is a no-code cleaning/profiling tool.

---

**문제 2.** A data analyst wants to profile and clean data by detecting nulls and outliers using a visual interface, without writing code. Which service is most suitable?

A) Glue ETL Job (PySpark)  
B) EMR Spark  
C) Glue DataBrew  
D) Kinesis Data Analytics  

**정답: C**  
해설: DataBrew offers 250+ predefined transformations and data profiling via no-code GUI, letting non-technical users quickly clean and explore data. Both PySpark ETL Jobs (A) and EMR Spark (B) require code. Kinesis Data Analytics (D) is for real-time stream analysis.

---

**문제 3.** What is the most accurate description of Glue Data Catalog's core role?

A) It duplicates and stores data objects from S3  
B) It stores metadata like table schema, location, and partitions, shared by Athena/Redshift/EMR/SageMaker  
C) It executes ETL transformation logic  
D) It processes real-time streams  

**정답: B**  
해설: Data Catalog is a Hive Metastore-compatible metadata repository storing schema, S3 location, and partition info — not the data itself. Multiple analytics/ML services share it to see consistent schemas. Data duplication (A), transformation execution (C), and stream processing (D) are not catalog roles.

---

**문제 4.** For a small dataset (few MB) requiring simple transformation, which Glue Job type avoids Spark cluster startup overhead and costs?

A) Glue Spark Job  
B) Glue Python Shell Job  
C) Glue Streaming Job  
D) EMR on EC2  

**정답: B**  
해설: Glue Python Shell Job runs simple Python scripts without distributed Spark processing, avoiding cluster startup overhead and cost for small-data transformations. Spark Job (A) is for large-scale distributed work and is overkill for small data. Streaming Job (C) is for stream processing, and EMR on EC2 (D) requires heavier cluster management.

---

**문제 5.** JSON data coming to the S3 Raw zone must be made efficient for ML training. What is the recommended output approach in Glue ETL?

A) Copy JSON as-is to the Curated zone  
B) Convert to CSV and store without compression  
C) Convert to Parquet, partition by frequently filtered keys, store in Curated zone  
D) Combine all data into a single file for storage  

**정답: C**  
해설: Parquet (columnar, compressed, predicate pushdown) is efficient for ML training, and partitioning by frequently used keys reduces scan volume. Copying JSON (A) is inefficient; uncompressed CSV (B) is row-based and unsuitable. Single giant file (D) prevents parallel processing and partition pruning.

---
