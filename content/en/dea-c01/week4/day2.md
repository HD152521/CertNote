# Day 2 - Glue ETL Job: Transform Data on Spark

## 📌 Key Takeaways

- A Glue ETL Job is serverless Spark. Billing is **DPU × run time**, so the worker type, the number of workers, and the timeout are your cost settings.
- A **DynamicFrame** preserves columns with conflicting types as a Choice type, and you decide later how to clean them up with `ResolveChoice`.
- Every Job has a Source → Transform → Sink structure, and the standard output is partitioned Parquet/ORC.
- A **Job bookmark** works only if Enable, `transformation_ctx`, and `job.commit()` are all present. The default is Disable.
- Small tasks use Python Shell, non-urgent batches use Flex, and Jobs whose load varies by stage use Auto Scaling to lower cost.

## DynamicFrame: Extending Spark DataFrame for ETL

The Data Catalog we created yesterday only knows "where the data is and what it looks like." But the essence of data engineering is to **transform** that data. Taking dirty CSV and turning it into clean Parquet, combining scattered tables into joined fact tables, converting raw logs into aggregated metrics. The way to run these transformations serverlessly is with **AWS Glue ETL Job**.

Internally, Glue ETL Job runs **Apache Spark**. In other words, Glue is a "managed Spark." Unlike EMR, where you provision and terminate clusters directly, Glue automatically provisions the Spark environment when you submit a Job and reclaims resources when it finishes. The billing unit is **DPU (Data Processing Unit)**—1 DPU = 4 vCPU + 16GB memory. You're charged in proportion to execution time (in seconds).

If you've used Spark, you're familiar with **DataFrame**. Glue adds another layer on top with a data structure called **DynamicFrame**. Why was another abstraction needed?

| Item | Spark DataFrame | Glue DynamicFrame |
|------|-----------------|-------------------|
| Schema | Must be fixed in advance | Schema inference, self-describing |
| Type conflicts | Errors or forced casting | Preserves both types with Choice type |
| Dirty data | Hard to handle | Built-in ETL transformations (ResolveChoice, etc.) |
| Catalog integration | Separate work | Native integration |

The key difference is **schema flexibility**. Real-world data is messy. The same column might be an integer in one row and a string in another. DataFrame breaks on such conflicts, but DynamicFrame preserves both types in a **Choice type**, then lets you decide how to resolve it later with the `ResolveChoice` transformation. Since ETL is about dealing with "unexpected data," this flexibility is valuable.

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

> 💡 **Related Theory**: DynamicFrame implements "schema-on-read" at the code level. Traditional ETL tools require you to define mappings strictly in advance (a schema-on-write approach), but ETL in the data lake era follows the ELT/schema-on-read philosophy: "accept the data first, then refine it during transformation." DynamicFrame's Choice type and ResolveChoice are the mechanisms that realize this philosophy on top of Spark. You can freely switch to a DataFrame with `.toDF()` and back to a DynamicFrame with `.fromDF()` if needed.

## ETL's 3 Stages: Source → Transform → Sink

Every Glue Job is ultimately a combination of three stages.

```
[Source]  Read data from Catalog/S3/JDBC and create DynamicFrame
   ↓
[Transform]  Mapping, filtering, joining, aggregating, type resolution
   ↓
[Sink]  Write results to S3/Catalog/Redshift/JDBC
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

`ApplyMapping` is the most frequently used transformation in ETL. It renames columns, converts types, and drops unnecessary columns. If you automatically split the output into partition folders using `partitionKeys` in `write_dynamic_frame`, downstream queries benefit from partition pruning. The standard output formats are **Parquet/ORC (columnar + compression)**, which are advantageous for analytics.

Glue Jobs come in two execution types: the standard Spark Job (large-scale distributed processing) and the **Python Shell Job** (a lightweight Python script on a single node, for small data or orchestration). For distributed transformations over several GB, use a Spark Job; for lightweight work under a few hundred MB, or tasks like API calls and metadata cleanup, Python Shell is much cheaper. Also, Glue 3.0 and 4.0 use different Spark versions, so you must verify library compatibility.

## Job Bookmark: The Core of Incremental Processing

In pipelines where new data arrives daily, reprocessing all data with every Job run explodes costs and time. A **Job Bookmark** lets Glue remember "how far we got in the previous run," so the next run processes only **newly added data**.

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

For a bookmark to work, three things are required: (1) **Enable** the bookmark in the Job properties, (2) specify `transformation_ctx` on the source/sink, and (3) call `job.commit()` at the end. The bookmark identifies new data based on S3 object timestamps or JDBC primary key/timestamp columns.

> ⚠️ **Gotcha**: Job Bookmark isn't a silver bullet. An S3 source decides whether data is new by the object's last-modified time, so if a file that was already processed is **modified (overwritten)**, it is read again on the next run and can produce duplicates in the target. Also, if you forget `job.commit()` or fail to specify `transformation_ctx`, the bookmark won't work at all. To reprocess old data, you must **Reset** the bookmark or temporarily **Disable** it. On exams, when you see "Glue reprocesses everything each time" or "incremental processing," think of Job Bookmark.

## Orchestration: Triggers and Workflows

Often you need to chain multiple Jobs and crawlers in sequence. Glue provides **Triggers** and **Workflows**. Triggers start the next step based on schedules (cron), on-demand, or events (previous Job success/failure). Workflows let you visually compose DAGs like Crawler → Job → Crawler. For more complex branching, retries, and external service integration, you escalate orchestration to **Step Functions** or **MWAA (Airflow)**.

> 🎯 **Scenario**: Raw CSV lands on S3 daily. You need to clean and type-convert it to Parquet, then make it analysis-ready. Architecture: (1) Crawler registers the raw table → (2) Glue ETL Job reads via `from_catalog`, cleans with `ApplyMapping` and `ResolveChoice`, then writes to a Parquet sink → (3) **Enable Job Bookmark** so only yesterday's new data is processed incrementally → (4) a follow-up Crawler updates the clean table → (5) a Workflow trigger runs the entire pipeline automatically each dawn. Athena queries the clean table directly.

## Worker Types and Run Options: Where Cost Is Decided

"1 DPU = 4 vCPU + 16GB" is just a unit. In practice, **worker type × number of workers × run time** produces the bill.

| Worker type | DPU per worker | vCPU / memory | Use |
|-------------|----------------|---------------|-----|
| G.1X | 1 | 4 / 16GB | Default choice for most transformations and joins |
| G.2X | 2 | 8 / 32GB | Same use, but each worker can handle larger partitions |
| G.4X / G.8X | 4 / 8 | 16·32 / 64·128GB | Heavy aggregations and joins |
| G.025X | 0.25 | 2 / 4GB | Low-volume streaming Jobs only |
| R family | 1–8 | Memory-optimized configuration | Work that frequently hits out-of-memory errors |

- **Scaling up the type and scaling out the count are different prescriptions.** If the job is slow because the total data is large, increase the number of workers. But if a single partition is too big to fit in executor memory because of data skew or a large shuffle and the job dies, adding workers will not fix it and you need to move to a larger worker type.
- **Flex execution class**: Runs Jobs that can tolerate a delayed start, such as tests, one-off loads, and non-urgent nightly batches, at a lower unit price. It is available only on Glue 3.0 or later with G.1X and G.2X. For time-sensitive work that needs a fast start and dedicated resources, use the standard class.
- **Auto Scaling**: Available on Glue 3.0 or later; turn it on with `--enable-auto-scaling true`. The number of workers you specify then becomes the "maximum," and Glue attaches and detaches workers to match the parallelism of each stage. It reduces over-provisioning for Jobs where only some stages are busy.
- **Timeout**: You can set it up to 7 days. If left empty, a version-dependent default applies (2,880 minutes for 4.0 and earlier, 480 minutes for 5.0 and later). Since a Job is billed for its run time, set it explicitly to match the expected duration so a stuck Job does not run for long. A Job that ends by timeout is not retried automatically.
- **Maximum concurrent runs**: The default is 1. If the next schedule fires before the previous run has finished, it is rejected with an error. It is a safety mechanism that prevents two runs from reading the same input at the same time in a Job that uses a bookmark.
- **Python Shell Job**: Choose between 0.0625 DPU (default) or 1 DPU. It is a single node without Spark and **cannot use Job bookmarks**.
- The **Glue version** determines the Spark and Python versions together (for example, 4.0 is Spark 3.3 / Python 3.10, and 5.0 is Spark 3.5 / Python 3.11). New versions keep being added, so check library compatibility per Job.

## How Job Bookmarks Work Internally

"Why doesn't the bookmark work" and "why do duplicates appear" are answered once you know where and how the state is stored.

- State is stored per **Job name**, and within it `transformation_ctx` becomes the key for each source, transform, and sink. `job.init()` reads the state, and `job.commit()` saves it all at once (atomically).
- Therefore a source without `transformation_ctx` has no way to be tracked, and if the Job fails before `job.commit()`, the state is unchanged, so the next run reads the same input again. If part of it was already written to the sink, you get duplicates — a bookmark is also at-least-once in essence.

| Source | How new data is identified | Limitation |
|--------|----------------------------|------------|
| S3 | The object's last-modified time | Files modified after the previous run are processed again |
| JDBC | Bookmark key (the primary key by default; it must increase or decrease sequentially with no gaps) | Cannot catch UPDATEs or DELETEs of existing rows whose key stays the same |

- The formats supported for bookmarks on S3 sources are JSON, CSV, Avro, XML, Parquet, and ORC.
- There are three options. **Enable** (updates state), **Disable** (the default; always processes everything), and **Pause** (reads only the increment since the last successful run but does not update state — used to re-run the same range for verification).
- **Reset and rewind restore only the source state.** The target is not tracked by the bookmark, so it is not erased for you. Writing again to the same output path creates duplicates, so when reprocessing, use a separate output path or design the write to overwrite.
- If you keep `transformation_ctx` the same and change only the input path, the state for the old path still applies, and files at the new path may be treated as "already processed" and skipped.
- If there are too many files under a single partition, the bookmark can run the driver out of memory while building the file list.

```bash
# Bookmark options are passed as Job parameters
aws glue start-job-run --job-name daily-orders \
  --arguments '{"--job-bookmark-option":"job-bookmark-enable"}'

# When a full reprocess is needed: reset the bookmark (target data is not deleted)
aws glue reset-job-bookmark --job-name daily-orders
```

> ⚠️ **Gotcha**: A bookmark is not CDC. On a JDBC source, a bookmark only fetches "new rows whose key value is greater than last time"; it does not know that rows it already fetched were updated or deleted in the operational DB. If the requirement is "keep reflecting changes in the operational DB (including UPDATE/DELETE)," the answer is DMS CDC from Week 3; if it is "only the new rows from an append-only table," a bookmark is enough.

## Three Mechanisms That Reduce How Much You Read

| Mechanism | What it reduces | How it works |
|-----------|-----------------|--------------|
| `push_down_predicate` | Partitions to read | Applies the condition first to the partition list received from the Catalog, then lists and reads only the files of the remaining partitions |
| `catalogPartitionPredicate` | The partition listing call itself | Filters on the server side using the Catalog's partition indexes. Use it when there are millions of partitions |
| `groupFiles` / `groupSize` | Number of tasks | Reads multiple small files grouped into one in-memory partition |

```python
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders",
    transformation_ctx="orders_src",
    push_down_predicate="year == '2026' and month == '06'",  # list and read only these partitions
)
```

- The cost differs from reading everything and then filtering with a `Filter` transform. A pushdown predicate discards partitions **before the files are even listed**.
- File grouping turns on automatically when there are more than 50,000 input files. Supported formats are CSV, JSON, XML, Ion, and Grok logs, and it **does not apply to Avro, Parquet, or ORC.** Tens of thousands of small Parquet files must be solved with compaction, not grouping.

## The Four Strategies of ResolveChoice

The example above used only `cast:string`, but there are four ways to resolve a Choice type, and the results differ.

| Strategy | Result | When to use |
|----------|--------|-------------|
| `cast:type` | Casts to the specified type | When the correct type is clear |
| `make_cols` | Splits into per-type columns such as `amount_int` and `amount_string` | When you want to keep both values and handle them separately |
| `make_struct` | Turns one column into a struct holding both types | When you want to defer the decision to a later stage without losing the original |
| `project:type` | Keeps only values of the specified type and discards the rest | When you treat the other types as contaminated data |

To use a different strategy per column, specify it like `specs=[("amount", "cast:double"), ("code", "project:string")]`. `choice="MATCH_CATALOG"` casts to the types defined in the Catalog table.

## When Glue ETL Is Not the Answer

| Clue | Choice | Reason |
|------|--------|--------|
| Serverless Spark transformation, Catalog integration, process only new data | Glue ETL Job | Bookmarks and DynamicFrame fit as-is |
| Under a few hundred MB, API calls, metadata cleanup | Python Shell Job | No distributed processing needed |
| Small per-record transformation as soon as a file arrives | Lambda | Launching a Job per file is slow and expensive |
| Only loading JSON from a stream as Parquet | Firehose format conversion | Spark is overkill for a stateless conversion |
| Hive, HBase, Presto, fine-grained tuning of Spot and clusters | EMR | Glue does not expose the cluster |
| Continuous replication including UPDATE and DELETE from an operational DB | DMS CDC | A bookmark only sees new keys |

The Glue ETL Job we saw today has the entry barrier of having to write code yourself. Tomorrow we'll cover **Glue Studio**, which builds ETL visually without code, and **DataBrew**, a data cleaning tool.

## 📖 Glossary

- **DPU (Data Processing Unit)**: Glue's unit of processing capacity. 1 DPU corresponds to 4 vCPU and 16GB of memory, and you are billed for the DPUs used and the time they run.
- **DynamicFrame**: A data structure Glue layers on top of the Spark DataFrame. Because it does not fix the schema in advance, it can read messy data without breaking.
- **Choice type**: The representation in which a DynamicFrame preserves all the types when a single column has a mix of types.
- **ResolveChoice**: A transformation that resolves a Choice type by casting, splitting, structuring, or selecting.
- **ApplyMapping**: A transformation that renames columns, converts types, and drops unneeded columns in one step.
- **Job bookmark**: A feature that remembers how far the previous run processed so the next run reads only new data.
- **transformation_ctx**: An identifier string the bookmark uses to distinguish the progress state of each source, transform, and sink.
- **Pushdown predicate**: An option that applies a partition condition before reading files so that unneeded partitions are never read at all.
- **Flex**: A Glue execution class that runs non-urgent Jobs at a lower unit price. Startup may be delayed.
- **Python Shell Job**: A lightweight Glue Job type that runs a Python script on a single node without Spark.

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
