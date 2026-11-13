# Day 1 - Data Transformation and ETL: AWS Glue, Spark, and EMR

## 📌 Key Takeaways

- ETL = **Extract → Transform → Load**. In ML, the output is the training dataset itself, so the correctness and reproducibility of the transformation logic determine model quality.
- **Glue** = serverless Spark. Low operational burden and suited to sporadic, standard ETL. Billed in DPU-hours.
- **EMR** = Hadoop/Spark/Hive/Presto on an EC2 cluster. Use it when you need fine-grained tuning, multiple frameworks, or Spot savings.
- The four storage strategies for large-scale preprocessing: **columnar formats, partitioning, file size optimization, and pushdown**.
- Division of roles: **shared cleansing across the data lake = Glue**, **preprocessing dedicated to a specific model = SageMaker Processing**.

## What Is ETL?

Last week we covered "where and how to bring the data in" (ingestion and storage). Now comes the stage where you **turn that raw data into a form the model can consume**. On MLS-C01, ETL is a core area that asks "which tool do you choose, at what scale, with what cost and operational burden?"

| Stage | Meaning | Example in ML |
|---|---|---|
| Extract | Pull data from the source | Reading from S3, RDS, DynamoDB, logs |
| Transform | Clean, join, aggregate, encode | Handling missing values, encoding categoricals, computing features |
| Load | Write the processed result to the destination | Saving to a training S3 bucket or a feature store |

A variant called ELT (Extract-Load-Transform) is also used these days. You load raw data into the data lake (S3) first and transform it when needed. The data lake + Athena/Spark combination is effectively an ELT pattern, and it works well when you handle large volumes of data that are less structured.

### Transformations You Actually Do in ML Preprocessing

| Type of transformation | Example | Caution |
|---|---|---|
| Cleansing | Drop rows with missing values, cast types, filter logic errors | Compute statistics only from the training set |
| Join | Transaction table + customer profile | Check whether the row count blows up from a join explosion (duplicate keys) |
| Aggregation | Per-user purchase total over the last 30 days | Make the aggregation reference point explicit (future information leakage) |
| Encoding and scaling | Categorical → numeric, standardization | Use the same logic in training and inference |
| Partition rearrangement | Re-save into per-date directories | Too many partitions cause the small files problem |

## AWS Glue — The Center of Serverless ETL

AWS Glue is an **Apache Spark-based ETL service where you do not manage servers yourself (serverless)**. AWS launches and shuts down the cluster for you, so engineers focus only on the transformation logic.

- **Glue Data Catalog** — A central metadata store holding the schema, location, and partition information of your data. Shared by Athena, EMR, and Redshift Spectrum.
- **Glue Crawler** — Scans data in S3 and elsewhere, infers the schema automatically, and registers tables in the Data Catalog.
- **Glue ETL Job** — The Spark (or Python Shell) job that performs the actual transformation. Written in PySpark or Scala.
- **DynamicFrame** — Glue's extension of the Spark DataFrame. Useful for handling data with irregular schemas.
- **Glue DataBrew** — A separate tool for building cleansing recipes visually without code. The no-code option for data preparation.

```python
# Skeleton of a Glue PySpark ETL job
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ['JOB_NAME'])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# 1) Read raw data from the Data Catalog (Extract)
raw = glueContext.create_dynamic_frame.from_catalog(
    database="ml_raw", table_name="clicks"
)

# 2) Transform: drop null fields + map columns (Transform)
mapped = ApplyMapping.apply(frame=raw, mappings=[
    ("user_id", "string", "user_id", "string"),
    ("ts", "string", "event_time", "timestamp"),
    ("amount", "string", "amount", "double"),
])
clean = DropNullFields.apply(frame=mapped)

# 3) Load into the training S3 bucket as Parquet (Load)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://ml-train/clicks/"},
    format="parquet"
)
job.commit()
```

A Glue job's processing capacity is measured in **DPUs (Data Processing Units)**. 1 DPU is roughly 4 vCPU + 16GB of memory. If a job is slow, you scale out horizontally by increasing the number of DPUs (workers), or you raise performance by using the Spark engine in a newer Glue version. You are billed only for the DPU-hours you actually use.

## Amazon EMR — A Full-Control Big Data Cluster

EMR (Elastic MapReduce) is a managed service for running big data frameworks such as **Hadoop, Spark, Hive, Presto, and HBase** directly on an EC2 cluster. If Glue is "Spark only, serverless, simple," EMR is the option for "multiple engines, fine-grained tuning, direct control."

Situations where EMR is advantageous:

- When you process petabyte-scale data for long periods and need **fine-grained cluster tuning** (instance types, memory, executor settings)
- When you need to use **a variety of frameworks** such as Hive, Presto, and HBase alongside Spark
- When you want to **cut costs substantially** with Spot Instances (workloads that tolerate interruption)

```bash
# Create an EMR cluster (with Spark) — CLI example
aws emr create-cluster \
  --name "ml-preprocess" \
  --release-label emr-7.1.0 \
  --applications Name=Spark \
  --instance-groups \
    InstanceGroupType=MASTER,InstanceCount=1,InstanceType=m5.xlarge \
    InstanceGroupType=CORE,InstanceCount=4,InstanceType=m5.2xlarge \
  --use-default-roles \
  --auto-terminate
```

- `--auto-terminate` automatically shuts down the cluster when the work finishes, preventing wasted cost.
- **EMR Serverless** runs Spark/Hive jobs without the burden of managing a cluster, and sits somewhere between Glue and EMR.
- EMR nodes come in three kinds. The **primary** node (cluster coordination), **core** nodes (HDFS storage + compute), and **task** nodes (compute only). Spot is usually attached to task nodes.

### Glue vs EMR Selection Table

| Decision axis | Leans toward Glue | Leans toward EMR |
|---|---|---|
| Operational burden | Minimal management, no dedicated staff | Fine-grained control, staff available for tuning |
| Workload nature | Short and sporadic, standard transformations | Long, heavy, recurring batches |
| Frameworks | Spark alone is enough | Hive, Presto, HBase, etc. used alongside |
| Cost structure | Only the DPU-hours used | Large savings possible with Spot |
| Startup latency | Fast per job | Cluster startup time needed |
| Catalog | Native integration | Connect the Glue Catalog as the metastore |

The Glue vs EMR choice is within exam scope. The decision criteria are (1) **Operational burden**: minimal management → Glue, fine-grained control → EMR. (2) **Workload nature**: short and sporadic → Glue, long and heavy recurring batches → EMR. (3) **Framework variety**: if it is Spark only, Glue is enough; if you need multiple engines, EMR.

## Design Principles for Large-Scale Preprocessing

Once data exceeds a few terabytes, "how you store and read it efficiently" matters as much as "how you transform it."

1. **Use columnar formats** — Using **Parquet/ORC** instead of CSV/JSON greatly improves compression ratio and scan efficiency. You read only the columns you need and reduce I/O.
2. **Partitioning** — If you split partitions by a frequently filtered key, like `s3://bucket/year=2026/month=06/`, Spark/Athena skips unnecessary data (partition pruning).
3. **File size optimization** — Too many small files (the small files problem) increase overhead. Compacting them to roughly 128MB to 1GB is the usual recommendation.
4. **Pushdown (predicate pushdown)** — Apply filter conditions at the data source stage to reduce the amount read in the first place.

```python
# Efficient read in Spark using partition + column pruning
df = (spark.read.parquet("s3://ml-train/clicks/")
      .filter("year = 2026 AND month = 6")   # partition pruning
      .select("user_id", "event_time", "amount"))  # column pruning
```

```
[Inefficient]  CSV · no partitions · 1 million small files
               → full scan + per-file overhead → job time and cost explode

[Efficient]    Parquet · dt/region partitions · 256MB per file
               → reads only the needed partitions and columns → scan volume is a fraction (tens of times smaller)
```

> ⚠️ **Pitfall**: "The data is big, so let's just spin up a big EMR cluster" is a common wrong-answer lure. If the work is sporadic and operations staff is small, running a big EMR cluster around the clock is inefficient in both cost and management. In that case Glue or EMR Serverless is more suitable.

> ⚠️ **Pitfall**: It is easy to think the finer the partitions the better, but if every partition produces small files, things actually get slower. **Design the partition count and the file size together.**

## The Minimum You Need to Know About the Spark Execution Model

Whether it is Glue or EMR, what runs inside is Spark. To read performance-problem scenarios you need at least a basic picture.

```
Driver  ──split work──▶  Executor × N
   · builds the job plan          · does the actual computation per partition
   · collects results             · caches intermediate results in memory
        ▲                                   │
        └──────── shuffle: redistributing data across nodes ────┘
```

- **Partition**: The chunk of data Spark processes in parallel. The number of partitions is the degree of parallelism.
- **Shuffle**: When a redistribution by key is needed, as with `groupBy` or `join`, data moves between nodes. It is the **most expensive operation**.
- **Data skew**: If data piles up on a particular key, only the executor handling that partition runs for a long time and the whole job slows down.
- **Lazy evaluation**: Transformations are not executed right away; they are optimized and executed all at once when an action (`write`, `count`) is called.

"The job is slow → make the instances bigger" is not always the answer. If the shuffle is the bottleneck, changing the join strategy (broadcasting the small table) or spreading out the skewed key is more effective.

### What to Know About Running Glue Jobs

- **Job bookmark**: Remembers data already processed so that the next run processes **only what newly arrived**. The basic mechanism for incremental ETL.
- **Worker type**: Choose between standard workers and memory-optimized workers. If shuffles and joins are heavy, the one with more memory is safer.
- **Retries and timeouts**: Set the retry count and maximum execution time in the job definition to prevent endless runs and cost blowups.
- **Python Shell job**: For light scripts that do not need Spark, running them as a Python Shell job is much cheaper.

## Connecting to SageMaker

Preprocessing results ultimately flow into SageMaker training. AWS provides several paths that connect transformation to training.

- **SageMaker Processing** — A SageMaker-native feature that runs preprocessing in scikit-learn/Spark containers. Often used for pre- and post-training processing.
- **Glue → S3 → SageMaker Training** — The most common pattern, where the Parquet built by Glue sits in S3 and the training job reads it.
- **SageMaker Data Wrangler** — Design the transformation flow in a GUI and export it as a Processing job or a pipeline.

SageMaker Processing and Glue seem to overlap in role, but they have a different character. Glue is strong at **ETL across the data lake** (producing cleansed data shared by multiple consumers), while SageMaker Processing integrates naturally with **preprocessing tied to a specific ML job** (feature generation for this model only).

Tomorrow we look at the training data pipeline that **automates these transformation jobs with Step Functions and SageMaker Pipelines** instead of running them by hand each time.

## 📖 Glossary

- **ETL / ELT** : Extract-Transform-Load / Extract-Load-Transform. The latter is the flexible variant of the data lake era.
- **DPU (Data Processing Unit)** : Glue's unit of processing capacity. Equivalent to about 4 vCPU + 16GB of memory.
- **DynamicFrame** : Glue's data structure that handles rows without discarding them even when the schema is uneven.
- **Glue Data Catalog** : A central metadata store containing schemas, locations, and partitions. Shared by Athena, EMR, and Redshift Spectrum.
- **EMR** : A managed big data cluster that runs Hadoop, Spark, Hive, and Presto directly on EC2.
- **EMR Serverless** : An EMR option that runs only Spark/Hive jobs without launching a cluster.
- **Spot Instance** : EC2 that is much cheaper in exchange for being interruptible. Used for interruption-tolerant batch computation.
- **Partitioning** : Splitting data paths by a frequently filtered key. Reduces scan volume.
- **Shuffle** : A Spark operation that redistributes data across nodes by key. The most expensive and the one most likely to become a bottleneck.
- **Job bookmark** : A Glue feature that remembers the point already processed so the next run handles only new data.

## 📝 Practice Questions

**Question 1.** A team with little operations staff needs to handle standard Spark transformation jobs that occur sporadically a few times a day. What minimizes the burden of launching and managing clusters yourself?

A) Use an AWS Glue serverless ETL job  
B) Run a large EMR cluster around the clock  
C) Install and operate Spark directly on EC2  
D) Transform with DynamoDB Streams  

**Answer: A**  
Explanation: Glue is serverless Spark with no cluster provisioning or management burden, and it bills only the DPU-hours used, so it is best for sporadic, standard ETL. An always-on EMR cluster (B) or self-managed EC2 (C) carries a large operational burden and idle cost. DynamoDB Streams (D) is not a tool for large-scale Spark transformation.

---

**Question 2.** You process petabyte-scale data for long periods, use Hive and Presto in addition to Spark, and need to fine-tune instance types and memory. Which service is most suitable?

A) AWS Glue  
B) Amazon Athena  
C) Amazon EMR  
D) AWS Lambda  

**Answer: C**  
Explanation: EMR runs a variety of frameworks such as Spark, Hive, and Presto directly on an EC2 cluster, and allows fine-grained tuning and Spot Instance cost savings. Glue (A) is mainly serverless ETL centered on Spark, Athena (B) is a SQL query service, and Lambda (D) suits short function executions, so they are unsuitable for heavy big data cluster workloads.

---

**Question 3.** When reading large-scale training data stored in S3 with Spark, which combination of storage strategies most effectively reduces scan cost and I/O?

A) CSV format + a single huge file  
B) JSON format + random file splitting  
C) Parquet columnar format + partitioning by a frequently filtered key  
D) Uncompressed text + random column order  

**Answer: C**  
Explanation: A columnar format like Parquet reads only the needed columns and has a high compression ratio, and partitioning enables partition pruning that skips unnecessary data, greatly reducing scan volume. CSV, JSON, and uncompressed text are row-based, so column pruning is weak and I/O is inefficient.

---

**Question 4.** In AWS Glue, which component scans data in S3, infers the schema automatically, and registers it as a table in the central metadata store?

A) Glue ETL Job  
B) Glue Crawler  
C) DynamicFrame  
D) DPU  

**Answer: B**  
Explanation: The Glue Crawler scans the data, infers the schema, and registers the table in the Glue Data Catalog. The ETL Job (A) performs the actual transformation, the DynamicFrame (C) is the data structure used in transformations, and the DPU (D) is a unit of processing capacity, so none of them have anything to do with schema registration.

---

**Question 5.** In an ML pipeline, when distinguishing between "producing shared cleansed data across the data lake" and "preprocessing for one specific model only," which pairing of tools is generally the more suitable?

A) SageMaker Processing is suitable for both  
B) EMR is the only correct answer for both  
C) Lambda for shared cleansing, Athena for model-specific preprocessing  
D) Glue for shared cleansing, SageMaker Processing for model-specific preprocessing  

**Answer: D**  
Explanation: Glue is strong at ETL across the data lake that multiple consumers share, and SageMaker Processing integrates naturally with preprocessing tied to a specific ML job. Even though the two seem to overlap in role, they have a different character, so the standard practice is to split them according to the situation. A, B, and C do not reflect this division of roles.

---
