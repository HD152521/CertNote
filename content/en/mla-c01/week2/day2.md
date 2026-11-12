# Day 2 - Data Catalog & ETL: AWS Glue and DataBrew

## 📌 Key Takeaways

- The **Glue Data Catalog** is a Hive Metastore-compatible metadata repository. Athena, Redshift Spectrum, EMR, and SageMaker share it.
- A **Crawler** scans S3, automatically infers schemas and partitions, and creates tables in the catalog.
- A **Glue ETL Job** is serverless Spark transformation. The billing unit is **DPU × run time**. For small data, a Python Shell job is the better fit.
- **DataBrew** is a no-code GUI data preparation tool. The keywords "non-technical users" and "visual profiling" point to it as the answer.
- The standard flow is **Raw (JSON/CSV) → Crawler·Catalog → ETL/DataBrew → Curated (Parquet, partitioned)**.

## Glue Data Catalog: The Metadata Repository of a Data Lake

Simply dropping objects into S3 lets you neither analyze nor train. You have to know "what data is in this bucket, with what schema" before you can query it with Athena and train on it with SageMaker.

The Glue Data Catalog is a **Hive Metastore-compatible metadata repository**. It stores not the data itself but information about the data — table names, columns, types, S3 locations, partitions.

```
Glue Data Catalog structure:
Database (logical grouping)
└─ Table (S3 location + schema + partitions)
   ├─ Columns: customer_id (string), amount (double), ts (timestamp)
   ├─ Location: s3://ml-datalake/curated/transactions/
   ├─ SerDe: parquet
   └─ Partitions: year=2026/month=06, year=2026/month=05, ...
```

This catalog is **referenced in common by Athena, Redshift Spectrum, EMR, SageMaker, and Glue ETL**. Register it once and every analytics/ML tool sees the same schema.

| What it stores | What it does not store |
|-----------|----------------|
| Table and column names and types | The actual data rows |
| S3 location (Location) | A copy of the data |
| File format · SerDe | Transformation logic |
| Partition list | Query results |

The Glue Data Catalog is a concept inherited from Apache Hive's **Metastore**. Hive was a system Facebook built in 2009 to use SQL on top of HDFS, and its core idea was to "separate the data (HDFS files) from the schema (Metastore)." This separation is exactly **schema-on-read**. Unlike a traditional DB (schema-on-write) that enforces the schema when data is written, a data lake first stores the original and applies the schema when reading. Thanks to this, it can flexibly accept data of various formats and sources.

| Aspect | schema-on-write (traditional DB) | schema-on-read (data lake) |
|------|--------------------------|------------------------------|
| When the schema is enforced | When data is inserted | When data is read |
| Flexibility | Low (must be defined in advance) | High (accepts the original as is) |
| Quality guarantee | Guaranteed at the entrance | The reading side is responsible |
| Fit for ML | Structured only | Structured, semi-structured, and unstructured |

## Glue Crawler: Automatic Schema Inference

When S3 holds thousands of files, defining tables one by one is impractical. A **Glue Crawler** scans S3 (or a JDBC source), automatically infers the schema, and creates tables in the catalog.

How a crawler works:

1. Scan the specified S3 path
2. Detect the file format (Parquet/CSV/JSON, etc.)
3. Infer columns and types (using classifiers)
4. Recognize `key=value` directories as partitions
5. Create/update tables in the Data Catalog

```python
import boto3

glue = boto3.client("glue")

glue.create_crawler(
    Name="transactions-crawler",
    Role="arn:aws:iam::123456789012:role/GlueCrawlerRole",
    DatabaseName="ml_datalake",
    Targets={"S3Targets": [{"Path": "s3://ml-datalake/curated/transactions/"}]},
    Schedule="cron(0 2 * * ? *)",  # every day at 02:00 UTC
)
glue.start_crawler(Name="transactions-crawler")
```

If files with different schemas are mixed in the same folder, a crawler either **splits them into several tables or merges them into one**. This behavior is controlled by the crawler's "schema change policy" and "grouping behavior" settings. Exam trap: when you rerun a crawler and a new column has been added, it updates the schema by default, but depending on the policy it may ignore a column deletion. Also, using the "crawl new folders only" option so the crawler does not fully rescan the partitions every time reduces cost.

**A crawler is not the only way to make new partitions recognized.**

| Method | How | When it is advantageous |
|------|-------|----------|
| Rerun the Glue Crawler | Scan the path and register automatically | When the schema changes too |
| `MSCK REPAIR TABLE` | Athena sweeps the Hive-style paths and registers partitions | When only the partitions have grown |
| `ALTER TABLE ADD PARTITION` | Explicitly add a specific partition | When adding only a few partitions |
| Partition projection | Define the path rule up front and compute without scanning | When partitions are very numerous and regular |

> ⚠️ **Trap**: In a scenario like "I added a partition but Athena cannot find it," unconditionally choosing to rerun the crawler may not be the best in terms of cost and time. If only the partitions grew with no schema change, `MSCK REPAIR TABLE` or partition projection is lighter.

## Glue ETL Job: Serverless Data Transformation

If the catalog is "what is where," a **Glue ETL Job** is "how the data is transformed." It runs serverless on top of Apache Spark (or Python Shell, Ray).

The core abstraction is the **DynamicFrame**. It is similar to a Spark DataFrame, but it is strong at handling semi-structured data whose schema is not uniform (for example, resolving type conflicts with `ResolveChoice`).

```python
import sys
from awsglue.context import GlueContext
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# Read from the catalog
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="ml_datalake", table_name="raw_transactions"
)

# Drop missing values + select columns (cleansing)
cleaned = dyf.drop_nulls().select_fields(["customer_id", "amount", "ts"])

# Write to the Curated zone as Parquet (partitioned)
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

A Glue Job's billing unit is the **DPU (Data Processing Unit)** — 4 vCPU + 16GB memory — and it is proportional to run time. It is serverless, so there is no cluster provisioning.

**Three execution types of Glue ETL** — data size decides the choice.

| Type | Engine | Suitable data | Caution |
|------|------|-------------|------|
| Spark | Distributed Spark | Large-scale transformations of several GB to TB | Cluster start-up overhead |
| Python Shell | Single Python process | Simple scripts for several MB to several hundred MB | No distributed processing |
| Glue Streaming | Spark Structured Streaming | Kinesis/Kafka micro-batches | Always-on running cost |

Using a Spark Job on small data is slow and expensive because of the cluster start-up overhead. On the exam, for "a small transformation of a few MB," Python Shell is the better fit.

You should know the difference between ETL (Extract-Transform-Load) and ELT (Extract-Load-Transform). Traditional ETL transforms first and then loads into a data warehouse. In a cloud data lake, ELT — load into Raw first, then Transform — is common, because S3 is cheap and compute can be separated. Glue supports both, but in a data lake context the ELT pattern is used often.

## Glue DataBrew: No-Code Data Preparation

When a data scientist wants to cleanse and transform data **visually** without writing Spark code, use **Glue DataBrew**.

- **250+ predefined transformations**: missing-value handling, outlier removal, one-hot encoding, normalization, date parsing, and so on.
- **Data profiling**: automatically reports per-column distributions, missing ratios, correlations, and outliers.
- **Recipe**: save the transformation steps you applied to reuse and schedule them.
- Work in the GUI without code, and output the result to S3.

| Aspect | Glue ETL Job | Glue DataBrew |
|------|------|------|
| Interface | Code (PySpark/Scala) | No-code GUI |
| User | Data engineer | Data analyst/scientist |
| Scale | Large-scale distributed | Small to medium + profiling |
| Strength | Complex custom logic | Fast exploration and cleansing, visualization |
| Reuse unit | Script | Recipe |
| Answer keywords | "large-scale transformation", "custom logic" | "no-code", "non-technical users", "profiling" |

DataBrew's real value is **data profiling** in ML preprocessing. Before building a model, you can quickly discover facts like "this column has a 40% missing rate" or "this feature has zero correlation with the target" without code. This connects directly to the EDA (Exploratory Data Analysis) covered on Day 3.

## The Big Picture: Ingest → Catalog → Transform

```
S3 Raw zone (JSON/CSV)
   │
   ├─ Glue Crawler ──→ Glue Data Catalog (schema registration)
   │                        │
   │                        └──> Shared by Athena / Redshift Spectrum / EMR / SageMaker
   │
   ├─ Glue ETL Job ──→ Cleansing and transformation (DynamicFrame, Spark)
   │                     or
   ├─ Glue DataBrew ──→ No-code cleansing and profiling
   │
   ▼
S3 Curated zone (Parquet, partitioned)
   │
   ▼
Athena / Redshift / SageMaker (Day 3, training)
```

**Tool selection summary**

| Requirement | Answer |
|---------|------|
| Automatically register the schema of thousands of files | Glue Crawler |
| Several engines share the same table definitions | Glue Data Catalog |
| Large-scale distributed transformation, custom logic | Glue ETL Spark Job |
| Simple transformation of a few MB, avoiding overhead | Glue Python Shell Job |
| Visual cleansing and profiling without code | Glue DataBrew |
| Transform a stream in micro-batches | Glue Streaming Job |

## What Determines Glue Cost and Performance

Glue is serverless but not free. The charge is the number of DPUs × run time, so a bad configuration quietly becomes expensive.

| What to adjust | If raised | If lowered | Decision criterion |
|----------|-------|-------|----------|
| DPU count (workers) | Parallelism up, run time down | Cost down, run time up | Does the data actually parallelize? |
| Job type | Spark is strong at large scale | Python Shell starts faster | Data size (a few MB vs GB and above) |
| Number of input files | Parallel reads possible | Too many files add overhead | Keep any single file from being too large or too small |
| Output partitioning | Later query scan volume down | Too many partitions raise metadata | The consuming side's query patterns |
| Job bookmark | Prevents reprocessing already processed data | If turned off, everything is reprocessed every time | Whether processing is incremental |

- Using a Spark Job on small data makes the cluster start-up overhead longer than the actual processing time.
- If the output splits into tens of thousands of small files, the later Athena and training stages become slow. It is better to merge them to an appropriate size.

## What You Often Run Into When Operating Crawlers

| Situation | Cause | Response |
|------|------|------|
| The same folder splits into several tables | Each file has a different schema | Separate the paths or adjust the grouping policy |
| Crawler cost keeps rising | It rescans all partitions every time | Use the "crawl new folders only" option |
| A column was deleted but remains in the catalog | The schema change policy ignores deletions | Set the policy explicitly |
| Athena cannot find a new partition | The partition is not registered in the catalog | `MSCK REPAIR TABLE` or partition projection |
| A type is inferred differently from what was intended | Limits of the classifier's automatic inference | Specify a custom classifier or edit the table definition |

> ⚠️ **Trap**: A crawler is not "run it once and you are done." In a lake where data keeps arriving, you need to judge when to run it periodically on a schedule, or switch to a lighter means when only the partitions are growing.

## ETL Design Checklist

| Question | Judgment |
|------|------|
| Is the data a few MB or GB and above? | MB means Python Shell, GB and above means Spark |
| Is the schema irregular? | Use DynamicFrame's ResolveChoice |
| What is the output format? | For analytics/training, Parquet + Snappy |
| What do you partition by? | The column the consuming side filters on most often |
| Do you reprocess everything each time? | Incremental processing with job bookmarks |
| Is there someone who can write code? | If not, DataBrew; if so, an ETL Job |
| Is the original preserved? | Never overwrite the Raw zone |

In the next note we query the data prepared this way with **Athena and Redshift** and look at the basics of EDA (Exploratory Data Analysis).

## 📖 Glossary

- **Data catalog**: A metadata ledger recording which tables exist where with what schema. It holds no data itself.
- **Hive Metastore**: The classic metadata repository that manages data and schema separately. The prototype of the Glue Catalog.
- **schema-on-read**: A method that leaves the data as the original when storing and applies the schema at read time. The default of a data lake.
- **Crawler**: A tool that sweeps a store, infers file formats, columns, and partitions, and creates tables in the catalog.
- **SerDe**: A serialization/deserialization rule that defines how to read and write a file's bytes as rows and columns.
- **DynamicFrame**: A data structure provided by Glue. It is strong at handling semi-structured data with an irregular schema.
- **DPU (Data Processing Unit)**: Glue's billing and performance unit. One bundle of 4 vCPU + 16GB memory.
- **ETL vs ELT**: Whether you load after transforming or transform after loading. Cloud data lakes usually use ELT.
- **Recipe**: In DataBrew, the unit for saving the applied transformation steps to reuse and schedule them.
- **Partition projection**: A setting that defines the path rule in advance so that partitions are computed without scanning.

## 📝 Practice Questions

**Question 1.** A data engineer wants to automatically register thousands of Parquet files in S3 to Glue Data Catalog without manually defining schemas. What is the most suitable tool?

A) Glue ETL Job  
B) Glue Crawler  
C) Athena CREATE TABLE  
D) Glue DataBrew  

**Answer: B**  
Explanation: Glue Crawler scans S3 paths, auto-infers file format and column/type, recognizes partitions, and creates tables in Data Catalog. This is the textbook answer for automatic schema registration. ETL Job (A) is for transformation, not schema registration. Athena CREATE TABLE (C) is manual definition, impractical for thousands of files. DataBrew (D) is a no-code cleaning/profiling tool.

---

**Question 2.** A data analyst wants to profile and clean data by detecting nulls and outliers using a visual interface, without writing code. Which service is most suitable?

A) Glue ETL Job (PySpark)  
B) EMR Spark  
C) Glue DataBrew  
D) Kinesis Data Analytics  

**Answer: C**  
Explanation: DataBrew offers 250+ predefined transformations and data profiling via no-code GUI, letting non-technical users quickly clean and explore data. Both PySpark ETL Jobs (A) and EMR Spark (B) require code. Kinesis Data Analytics (D) is for real-time stream analysis.

---

**Question 3.** What is the most accurate description of Glue Data Catalog's core role?

A) It duplicates and stores data objects from S3  
B) It stores metadata like table schema, location, and partitions, shared by Athena/Redshift/EMR/SageMaker  
C) It executes ETL transformation logic  
D) It processes real-time streams  

**Answer: B**  
Explanation: Data Catalog is a Hive Metastore-compatible metadata repository storing schema, S3 location, and partition info — not the data itself. Multiple analytics/ML services share it to see consistent schemas. Data duplication (A), transformation execution (C), and stream processing (D) are not catalog roles.

---

**Question 4.** For a small dataset (few MB) requiring simple transformation, which Glue Job type avoids Spark cluster startup overhead and costs?

A) Glue Spark Job  
B) Glue Python Shell Job  
C) Glue Streaming Job  
D) EMR on EC2  

**Answer: B**  
Explanation: Glue Python Shell Job runs simple Python scripts without distributed Spark processing, avoiding cluster startup overhead and cost for small-data transformations. Spark Job (A) is for large-scale distributed work and is overkill for small data. Streaming Job (C) is for stream processing, and EMR on EC2 (D) requires heavier cluster management.

---

**Question 5.** JSON data coming to the S3 Raw zone must be made efficient for ML training. What is the recommended output approach in Glue ETL?

A) Copy JSON as-is to the Curated zone  
B) Convert to CSV and store without compression  
C) Convert to Parquet, partition by frequently filtered keys, store in Curated zone  
D) Combine all data into a single file for storage  

**Answer: C**  
Explanation: Parquet (columnar, compressed, predicate pushdown) is efficient for ML training, and partitioning by frequently used keys reduces scan volume. Copying JSON (A) is inefficient; uncompressed CSV (B) is row-based and unsuitable. Single giant file (D) prevents parallel processing and partition pruning.

---
