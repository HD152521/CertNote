# Day 1 - Data Transformation and ETL: AWS Glue, Spark, and EMR

Last week we covered "where and how to fetch data" (collection and storage). Now we move to the stage of **transforming raw data into a form the model can consume**. This is transformation, commonly called ETL (Extract-Transform-Load). In the MLS-C01 exam, ETL is a core area that tests "which tool to choose, at what scale, and with what cost and operational burden."

Today we compare AWS's representative transformation tools: **AWS Glue** (serverless Spark) and **Amazon EMR** (managed Hadoop/Spark cluster), and develop the perspective to design large-scale preprocessing.

## What is ETL?

ETL is a compound of three letters.

| Stage | Meaning | Example in ML |
|-------|---------|--------------|
| Extract | Pull data from the source | Read from S3, RDS, DynamoDB, logs |
| Transform | Clean, join, aggregate, encode | Handle missing values, categorical encoding, feature calculation |
| Load | Write processed results to destination | Write to training S3 bucket, save to feature store |

In an ML pipeline, the output of ETL is the **training dataset**. Therefore, the accuracy and reproducibility of transformation logic directly determines model quality.

> 💡 **Related Theory**: Recently, a variant called ELT (Extract-Load-Transform) is also used. This approach first loads raw data into a data lake (S3) and transforms it as needed. A combination of data lake + Athena/Spark is essentially an ELT pattern, which is advantageous when flexibly handling large-scale data with less standardization.

## AWS Glue — The Center of Serverless ETL

AWS Glue is a **serverless Apache Spark-based ETL service** that doesn't require direct server management. AWS handles spinning up and down clusters, so engineers can focus solely on transformation logic. Let's understand Glue's key components.

- **Glue Data Catalog**: A central metadata repository containing data schema, location, and partition information. Shared by Athena, EMR, and Redshift Spectrum.
- **Glue Crawler**: Scans data in S3 and other sources, automatically infers schema, and registers tables in Data Catalog.
- **Glue ETL Job**: The actual Spark (or Python Shell) job that performs transformation. Written in PySpark or Scala.
- **DynamicFrame**: An extension of Spark DataFrame provided by Glue. Advantageous for handling data with irregular schemas.

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

# 1) Read raw data from Data Catalog (Extract)
raw = glueContext.create_dynamic_frame.from_catalog(
    database="ml_raw", table_name="clicks"
)

# 2) Transform: Drop null rows + column mapping (Transform)
mapped = ApplyMapping.apply(frame=raw, mappings=[
    ("user_id", "string", "user_id", "string"),
    ("ts", "string", "event_time", "timestamp"),
    ("amount", "string", "amount", "double"),
])
clean = DropNullFields.apply(frame=mapped)

# 3) Write to training S3 bucket as Parquet (Load)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://ml-train/clicks/"},
    format="parquet"
)
job.commit()
```

> 💡 **Related Theory**: Glue job processing capacity is measured in **DPU (Data Processing Unit)** units. 1 DPU ≈ 4 vCPU + 16GB memory. If a job is slow, scale horizontally by increasing DPU count (worker count), or use the latest Spark engine in **Glue 3.0/4.0** to boost performance. Costs are charged only for DPU-hours consumed.

## Amazon EMR — Full-Control Big Data Cluster

EMR (Elastic MapReduce) is a managed service that directly operates big data frameworks like **Hadoop, Spark, Hive, Presto, HBase** on EC2 clusters. Where Glue says "Spark only, serverless, simple," EMR offers "multiple engines, fine-tuned, direct control."

EMR is advantageous when:
- Processing petabyte-scale data over long durations while **fine-tuning cluster settings** (instance types, memory, executor configuration) is required
- Multiple frameworks like Hive, Presto, HBase beyond Spark are needed **together**
- You want to **significantly reduce costs with spot instances** (for workloads tolerant of interruption)

```bash
# Create EMR cluster (with Spark) — CLI example
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

`--auto-terminate` automatically terminates the cluster when the job finishes, preventing unnecessary costs. Additionally, **EMR Serverless**, a newer option, runs Spark/Hive jobs without cluster management overhead and sits roughly between Glue and EMR.

> 💡 **Related Theory**: In exams, choosing between Glue and EMR is a frequent topic. Decision criteria: (1) **Operational burden**: Minimize management → Glue, fine control → EMR. (2) **Workload nature**: Short and sporadic → Glue, long and heavy batch → EMR. (3) **Framework diversity**: Spark alone suffices for Glue; multiple engines demand EMR.

## Principles for Large-Scale Preprocessing Design

Once data exceeds terabytes, "how to efficiently store and read" becomes as important as "how to transform."

1. **Use Columnar Format**: Using **Parquet/ORC** instead of CSV/JSON significantly improves compression and scan efficiency. Read only required columns to reduce I/O.
2. **Partitioning**: Dividing partitions by frequently filtered keys (like `s3://bucket/year=2026/month=06/`) lets Spark/Athena skip unnecessary data (partition pruning).
3. **File Size Optimization**: Too many small files (small files problem) increase overhead. The general recommendation is to consolidate to around 128MB–1GB.
4. **Predicate Pushdown**: Apply filter conditions at the data source stage to reduce the amount of data read.

```python
# Efficient reading in Spark using partition + column pruning
df = (spark.read.parquet("s3://ml-train/clicks/")
      .filter("year = 2026 AND month = 6")   # partition pruning
      .select("user_id", "event_time", "amount"))  # column pruning
```

> ⚠️ **Pitfall**: "Since data is large, just spin up a huge EMR cluster" is a common trap answer. If work is sporadic and operational staff is limited, maintaining a large EMR cluster constantly is inefficient in cost and management. Glue or EMR Serverless is more suitable here.

## Connection with SageMaker

Preprocessing results ultimately flow to SageMaker training. AWS provides multiple paths connecting transformation and learning.

- **SageMaker Processing**: A SageMaker-native feature executing preprocessing in scikit-learn/Spark containers. Frequently used for pre- and post-training processing.
- **Glue → S3 → SageMaker Training**: The most common pattern: Glue creates Parquet and places it in S3 for training jobs to read.
- **SageMaker Data Wrangler**: Design transformation workflows via GUI and export to Processing jobs or pipelines.

> 💡 **Related Theory**: SageMaker Processing and Glue may appear to overlap but serve different purposes. Glue excels at **ETL across the entire data lake** (producing shared curated data for multiple consumers), while SageMaker Processing naturally integrates with **preprocessing specific to an ML task** (feature generation for this model alone).

## Summary

Today we reviewed ETL concepts and compared AWS's two main tools. **Glue's serverless Spark minimizes operational burden and suits sporadic, standard ETL**, while **EMR's fine control and diverse frameworks suit heavy workloads requiring detailed tuning**. In large-scale preprocessing, storage strategies like Parquet, partitioning, and file size optimization determine processing performance. All transformation results lead into SageMaker training.

Tomorrow we explore automating these transformation tasks not by hand but via **Step Functions and SageMaker Pipelines** as a learning data pipeline.

---

## 📝 Practice Questions

**Question 1.** A team with limited operations staff needs to handle standard Spark transformation jobs that occur sporadically a few times a day. What minimizes the burden of launching and managing clusters directly?

A) Use AWS Glue serverless ETL jobs  
B) Run a large EMR cluster at all times  
C) Install and operate Spark directly on EC2  
D) Transform with DynamoDB Streams  

**Answer: A**  
Explanation: Glue is serverless Spark with no burden of cluster provisioning or management, and it bills only for the DPU-hours used, so it is best suited for sporadic, standard ETL. An always-on EMR cluster (B) or self-managed EC2 (C) has a heavy operational burden and idle cost. DynamoDB Streams (D) is not a tool for large-scale Spark transformations.

---

**Question 2.** You process petabyte-scale data over long periods, use Hive and Presto in addition to Spark, and need to fine-tune instance types and memory. Which service is MOST appropriate?

A) AWS Glue  
B) Amazon Athena  
C) Amazon EMR  
D) AWS Lambda  

**Answer: C**  
Explanation: EMR directly operates a variety of frameworks such as Spark, Hive, and Presto on an EC2 cluster, enabling fine-grained tuning and cost savings with Spot Instances. Glue (A) is primarily Spark-centric serverless ETL, Athena (B) is a SQL query service, and Lambda (D) is suited to short function executions, so they are unsuitable for heavy big data cluster workloads.

---

**Question 3.** When reading large training data stored in S3 with Spark, which combination of storage strategies MOST effectively reduces scan cost and I/O?

A) CSV format + a single huge file  
B) JSON format + random file splitting  
C) Parquet columnar format + partitioning by a frequently filtered key  
D) Uncompressed text + random column order  

**Answer: C**  
Explanation: Columnar formats such as Parquet read only the needed columns and have high compression ratios, and partitioning enables partition pruning that skips unnecessary data, greatly reducing the amount scanned. CSV, JSON, and uncompressed text are row-based, so column pruning is weak and I/O is inefficient.

---

**Question 4.** In AWS Glue, which component scans S3 data, automatically infers the schema, and registers it as a table in the central metadata repository?

A) Glue ETL Job  
B) Glue Crawler  
C) DynamicFrame  
D) DPU  

**Answer: B**  
Explanation: The Glue Crawler scans the data, infers the schema, and registers the table in the Glue Data Catalog. An ETL Job (A) performs the actual transformation, a DynamicFrame (C) is a data structure used in transformations, and a DPU (D) is a unit of processing capacity and is unrelated to schema registration.

---

**Question 5.** In an ML pipeline, when distinguishing between "producing shared refined data across the data lake" and "preprocessing only for a specific model," which tool pairing is generally more appropriate?

A) SageMaker Processing is suitable for both  
B) EMR is the only correct answer for both  
C) Lambda for shared refinement, Athena for model-specific preprocessing  
D) Glue for shared refinement, SageMaker Processing for model-specific preprocessing  

**Answer: D**  
Explanation: Glue is strong for ETL across the data lake that is shared by multiple consumers, and SageMaker Processing integrates naturally with preprocessing tied to a specific ML task. Although their roles may seem to overlap, they differ in character, so the standard practice is to use them separately as appropriate. A, B, and C do not reflect this division of roles.

---
