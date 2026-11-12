# Day 2 - Glue ETL Job: Transform Data on Spark

The Data Catalog we created yesterday only knows "where the data is and what it looks like." But the essence of data engineering is to **transform** that data. Taking dirty CSV and turning it into clean Parquet, combining scattered tables into joined fact tables, converting raw logs into aggregated metrics. The way to run these transformations serverlessly is with **AWS Glue ETL Job**.

Internally, Glue ETL Job runs **Apache Spark**. In other words, Glue is a "managed Spark." Unlike EMR, where you provision and terminate clusters directly, Glue automatically provisions the Spark environment when you submit a Job and reclaims resources when it finishes. The billing unit is **DPU (Data Processing Unit)**—1 DPU = 4 vCPU + 16GB memory. You're charged based on execution time (in seconds).

## DynamicFrame: Extending Spark DataFrame for ETL

If you've used Spark, you're familiar with **DataFrame**. Glue adds another layer on top with a data structure called **DynamicFrame**. Why was another abstraction needed?

| Item | Spark DataFrame | Glue DynamicFrame |
|------|-----------------|-------------------|
| Schema | Must be fixed in advance | Schema inference, self-describing |
| Type conflicts | Errors or forced casting | Preserves both types with Choice type |
| Dirty data | Hard to handle | Built-in ETL transformations (ResolveChoice, etc.) |
| Catalog integration | Separate work | Native integration |

The key difference is **schema flexibility**. Real-world data is messy. The same column might be an integer in one row and a string in another. DataFrame breaks on such conflicts, but DynamicFrame preserves both types in a **Choice type**, then lets you decide how to resolve it later with `ResolveChoice` transformation. Since ETL is about dealing with "unexpected data," this flexibility is valuable.

```python
import sys
from awsglue.context import GlueContext
from awsglue.transforms import ResolveChoice, ApplyMapping
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# Source: Create DynamicFrame from Catalog table
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders"
)

# Resolve type conflicts (Choice): cast everything to string
resolved = ResolveChoice.apply(
    frame=orders,
    choice="cast:string"
)
```

> 💡 **Related Theory**: DynamicFrame implements "schema-on-read" at the code level. Traditional ETL tools require you to define mappings strictly in advance (schema-on-write approach), but ETL in the data lake era follows the ELT/schema-on-read philosophy: "accept the data first, then refine it during transformation." DynamicFrame's Choice type and ResolveChoice mechanism realize this philosophy on top of Spark. You can freely switch to DataFrame with `.toDF()` and back to DynamicFrame with `.fromDF()` if needed.

## ETL's 3 Stages: Source → Transform → Sink

Every Glue Job is ultimately a combination of three stages.

```
[Source]  Read data from Catalog/S3/JDBC and create DynamicFrame
   ↓
[Transform]  Mapping, filtering, joining, aggregating, type resolution
   ↓
[Sink]  Record results to S3/Catalog/Redshift/JDBC
```

```python
# Transform: Column mapping/renaming/type conversion
mapped = ApplyMapping.apply(
    frame=resolved,
    mappings=[
        ("order_id", "string", "id", "long"),
        ("amount",   "string", "amount", "double"),
        ("status",   "string", "status", "string"),
    ]
)

# Sink: Partition and write to S3 as Parquet
glueContext.write_dynamic_frame.from_options(
    frame=mapped,
    connection_type="s3",
    connection_options={
        "path": "s3://my-lake/orders-clean/",
        "partitionKeys": ["status"]
    },
    format="parquet"
)
```

`ApplyMapping` is the most frequently used transformation in ETL. It renames columns, converts types, and drops unnecessary columns. By partitioning output data into folders using `partitionKeys` in `write_dynamic_frame`, downstream queries benefit from partition pruning. The standard output formats are **Parquet/ORC (columnar + compression)**, which are ideal for analysis.

> 🔍 **Deeper Dive**: Glue Jobs have two execution types: standard Spark Jobs (for large-scale distributed processing) and **Python Shell Jobs** (single-node lightweight Python scripts for small data/orchestration). For transformations over several GB in a distributed fashion, use Spark Job; for work under a few hundred MB or lightweight tasks like API calls and metadata cleanup, Python Shell is much cheaper. Also, Glue 3.0/4.0 have different Spark versions, so you must verify library compatibility.

## Job Bookmark: The Core of Incremental Processing

In pipelines where new data arrives daily, reprocessing all data with every Job run explodes costs and time. **Job Bookmark** lets Glue remember "how far we got in the previous run," so the next run processes only **newly added data**.

```python
from awsglue.job import Job
from awsglue.utils import getResolvedOptions

args = getResolvedOptions(sys.argv, ['JOB_NAME'])
job = Job(glueContext)
job.init(args['JOB_NAME'], args)   # Initialize bookmark context

# ... The key is specifying transformation_ctx when reading the source ...
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders",
    transformation_ctx="orders_src"   # Bookmark tracks progress with this identifier
)

# ... Transform and sink ...

job.commit()   # Bookmark state is updated here
```

For a bookmark to work, three things are required: (1) **Enable** the bookmark in Job properties, (2) specify `transformation_ctx` on source/sink, (3) call `job.commit()` at the end. The bookmark identifies new data based on S3 object timestamps or JDBC primary key/timestamp columns.

> ⚠️ **Gotcha**: Job Bookmark isn't a silver bullet. If the same file is **modified (overwritten)**, the bookmark may see it as "already processed" and skip it. Also, if you forget `job.commit()` or fail to specify `transformation_ctx`, the bookmark won't work at all. To reprocess old data, you must **Reset** the bookmark or temporarily **Disable** it. On exams, when you see "Glue reprocesses everything each time" or "incremental processing," think of Job Bookmark.

## Orchestration: Triggers and Workflows

Often you need to chain multiple Jobs and crawlers in sequence. Glue provides **Triggers** and **Workflows**. Triggers start the next step based on schedules (cron), on-demand, or events (previous Job success/failure). Workflows let you visually compose DAGs like Crawler → Job → Crawler. For more complex branching, retries, and external service integration, you escalate orchestration to **Step Functions** or **MWAA (Airflow)**.

> 🎯 **Scenario**: Raw CSV lands on S3 daily. You need to clean and type-convert it to Parquet, then make it analysis-ready. Architecture: (1) Crawler registers raw table → (2) Glue ETL Job reads via `from_catalog`, cleans with `ApplyMapping` and `ResolveChoice`, then writes to Parquet sink → (3) **Enable Job Bookmark** for incremental processing of new data only → (4) follow-up Crawler updates the clean table → (5) Workflow trigger runs the entire pipeline automatically each dawn. Athena queries the clean table directly.

## Summary: The Power of Managed Spark

Glue ETL Job runs Spark transformations without server management. DynamicFrame is a flexible data structure that tolerates dirty data, Source/Transform/Sink forms the backbone of every Job, and Job Bookmark enables incremental processing. The barrier to entry is writing code yourself. Tomorrow we'll cover **Glue Studio** (build ETL visually without code) and **DataBrew** (data cleaning tool).

---

## 📝 Practice Questions

**Question 1.** Which Glue-specific data structure allows you to handle a type conflict in a Glue ETL job, where the same column arrives as an integer in some rows and a string in others, without breaking?

A) Spark RDD  
B) Pandas DataFrame  
C) DynamicFrame  
D) Glue Catalog Table  

**Answer: C**  
Explanation: DynamicFrame is a Glue-specific structure that preserves all conflicting types as a Choice type and lets you resolve them later with ResolveChoice. A Spark DataFrame has a schema fixed in advance and is vulnerable to conflicts, an RDD is a low-level structure, and a Catalog Table is only metadata, not a transformation data structure.

---

**Question 2.** What is required so that a Glue Job processes only the new data from an S3 source that receives new data every day, instead of reprocessing everything on every run?

A) Enable the job bookmark, specify transformation_ctx on the source, and call job.commit()  
B) Recreate the crawler every time  
C) Increase DPUs to the maximum  
D) Switch to a Python Shell job  

**Answer: A**  
Explanation: Incremental processing is implemented with job bookmarks. The progress state is tracked only when all three are in place: enabling the bookmark, specifying transformation_ctx on the source/sink, and the final job.commit(). Adding DPUs or switching to a Python Shell job has nothing to do with incremental processing.

---

**Question 3.** Which statement about the billing unit of a Glue ETL job is correct?

A) Only a fixed charge per GB of data processed  
B) A fixed monthly fee per job  
C) It is free, and only Athena queries are charged  
D) Billing is proportional to DPU usage (1 DPU = 4 vCPU + 16 GB) and run time  

**Answer: D**  
Explanation: Glue ETL is billed based on DPUs, in proportion to run time. 1 DPU corresponds to 4 vCPU + 16 GB of memory. It is not a fixed charge per GB of data or a fixed charge per job, and running a job itself incurs cost.

---

**Question 4.** Which Glue job type is suitable for running simple tasks, such as light data cleanup of a few hundred MB or less or API calls, more cheaply and without the overhead of distributed Spark?

A) Run a standard Spark job with more DPUs  
B) Keep a dedicated EMR cluster running at all times  
C) Python Shell Job  
D) Managed Flink application  

**Answer: C**  
Explanation: A Python Shell job runs lightweight Python scripts on a single node, is suitable for small data, orchestration, and metadata cleanup, and is cheaper than distributed Spark. Unless the transformation is large and distributed, a standard Spark job is excessive cost.

---

**Question 5.** Which option most accurately represents the typical data flow of a Glue ETL job?

A) Sink → Transform → Source  
B) Source (read) → Transform → Sink (write)  
C) Run only Transform repeatedly  
D) The Catalog transforms the data directly  

**Answer: B**  
Explanation: Every Glue ETL job follows the Source → Transform → Sink flow: it reads a DynamicFrame from a source, transforms it through mapping, filtering, joining, type resolution, and so on, and writes it to a sink such as S3, the Catalog, or Redshift. The Catalog is only a metadata provider and does not transform data directly.

---
