# Day 1 - Amazon EMR: Spark, Hive and Cluster Operations, Plus EMR Serverless

Until last week, Glue represented "ETL without worrying about servers." But when data scales into terabytes, when you need complex ML preprocessing or big-data ecosystem tools like Hive, HBase, and Presto, you need greater freedom and control. That's where **Amazon EMR (Elastic MapReduce)** comes in.

EMR is, simply put, a "managed Hadoop/Spark cluster." It automatically provisions and operates open-source big-data frameworks — Apache Spark, Hive, Presto, HBase, Flink — bundled on EC2. If Glue is "an abstracted ETL function," EMR is more like "a distributed computing cluster you operate directly." On exams, the selection criteria between these two are always a hot topic.

## EMR Cluster Structure: Three Node Roles

An EMR cluster is a collection of nodes (EC2 instances), each with a role.

| Node Type | Role | Count |
|-----------|------|-------|
| Primary (Master) | Coordinate cluster, distribute work, manage metadata | 1 (or 3 for HA) |
| Core | Store data (HDFS) + compute simultaneously | 1+ |
| Task | Compute-only, no HDFS storage | 0+ (optional) |

The key distinction: **Core nodes hold HDFS data, Task nodes only compute**. This difference directly affects cost strategy. Task nodes don't store data, so they can disappear without data loss. Therefore, **using spot instances on Task nodes is the safe standard pattern**. Conversely, if you put Core nodes on spot, node reclamation might lose HDFS blocks, requiring recalculation.

> 💡 **Related Theory**: EMR's node distinction comes from Hadoop's **MapReduce architecture**. Hadoop originally followed the **data locality** principle: perform computation on nodes where data lives — "move compute to data." Moving massive data over the network costs far more than sending small code to where data resides. Core nodes handling both storage and compute trace this principle.

## Spark on EMR: In-Memory Distributed Processing

The most widely used engine on EMR is **Apache Spark**. Spark's essence is keeping intermediate results in memory, not disk. Unlike traditional MapReduce, which writes and reads intermediate results to HDFS at each stage, Spark processes in memory—making it tens of times faster for iterative operations (ML, graphs).

```python
# EMR Spark: Read from S3, transform, save as Parquet
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("daily-etl").getOrCreate()

df = spark.read.json("s3://raw-bucket/events/2026/06/26/")
result = (df
    .filter(df.amount > 0)
    .groupBy("region", "product_id")
    .agg({"amount": "sum"})
    .withColumnRenamed("sum(amount)", "total_sales"))

result.write.mode("overwrite").parquet("s3://curated-bucket/sales/")
```

Spark's speed also comes from **lazy evaluation**. Transformations like `filter` and `groupBy` aren't executed immediately; they accumulate as an execution plan (DAG). Only when an action like `write` or `count` is called does Spark optimize the entire DAG and run it once. This lets you merge or skip unnecessary intermediate steps.

> 🔍 **Deeper Dive**: Spark's underlying data structure is the **RDD (Resilient Distributed Dataset)**. "Resilient" because each RDD remembers its lineage — how it was created. If a node dies and some partitions vanish, you can recalculate just those partitions following the lineage. No need to checkpoint everything; faults are tolerated smartly. DataFrame and SQL are higher-level abstractions layered on RDD.

## EMR Storage: HDFS vs EMRFS

EMR can use two storage tiers.

| Storage | Location | Characteristics |
|---------|----------|-----------------|
| HDFS | Local disk on Core nodes | Fast but vanishes when cluster terminates (temporary) |
| EMRFS | S3 | Permanent storage, separate from cluster, compute-storage separation |

Modern EMR best practice: **use EMRFS (S3) as permanent storage**. With data on S3, you can spin up the cluster when needed and tear it down when done (transient cluster). Compute and storage separate—no need to keep the cluster running 24/7, just pay when working. HDFS is only for performance-critical temporary storage like shuffle intermediate results or repeated operation scratchpad.

> ⚠️ **Gotcha**: If you think "EMR = permanently store data in HDFS," you'll fail exams. When you terminate a transient cluster, HDFS disappears. Permanent data must go to S3 (EMRFS); this is the core of cost optimization.

## Cluster Purchase Options: On-Demand vs Spot vs Instance Fleets

Cost is half of EMR exam questions. The key is which pricing model to use for nodes.

- **On-Demand**: Full price, never reclaimed. Suitable for Primary/Core nodes needing stability.
- **Spot instances**: Up to 90% cheaper but AWS can terminate within 2 minutes if capacity is needed. **Perfect for Task nodes**.
- **Reserved/Savings Plans**: Cost savings for long-term always-on clusters.

EMR offers two ways to define node groups.

| Approach | Description |
|----------|-------------|
| Instance Groups | Single instance type per group (traditional) |
| Instance Fleets | Multiple instance types and purchase options per group, flexible capacity fallback |

**Instance Fleets** lets you list multiple candidates: "if m5.xlarge spot is unavailable, use m5.2xlarge or c5.xlarge instead." This resilience to spot reclamation is the modern recommended approach for spot-heavy clusters.

> 🎯 **Scenario**: A large batch ETL runs only 1-2 hours at 2 AM daily. Cost-optimal setup: (1) **Transient cluster** spins up at start, auto-terminates at end, (2) data **permanently on S3 (EMRFS)**, (3) Primary and Core nodes **on-demand** for stability, (4) Task nodes **Instance Fleets + spot** for cheap compute scaling. Submit work via **EMR Steps**, auto-terminate cluster on last step completion.

## EMR Serverless: Eliminate the Cluster Itself

If deciding cluster size, choosing node types, and planning spot strategy sounds burdensome, **EMR Serverless** is the answer. No cluster provisioning—submit a Spark or Hive app and EMR auto-provisions workers, runs it, and reclaims them. You pay only for vCPU, memory, and time used.

```bash
# Submit a Spark job to EMR Serverless app
aws emr-serverless start-job-run \
  --application-id 00abc123 \
  --execution-role-arn arn:aws:iam::111122223333:role/emr-serverless-role \
  --job-driver '{
    "sparkSubmit": {
      "entryPoint": "s3://scripts/daily-etl.py"
    }
  }'
```

EMR Serverless suits sporadic or hard-to-predict workloads, and when you don't want to spend time sizing and tuning clusters. Conversely, if you need resident services like HBase or must keep clusters on 24/7 for fine-tuning, traditional EMR on EC2 is right.

## When Glue, When EMR?

This is the exam's critical decision point.

| Situation | Choice |
|-----------|--------|
| Serverless ETL, quick dev, DPU-unit billing | **Glue** |
| Brief, sporadic ETL, minimal operations | **Glue** or **EMR Serverless** |
| Large-scale (TB+) complex processing, fine Spark tuning needed | **EMR** |
| Diverse big-data ecosystem tools (Hive/HBase/Presto/Flink) | **EMR** |
| Extreme cost control via spot, full cluster control | **EMR** |
| Large-scale ML preprocessing, custom libraries | **EMR** |

In summary: **Glue is simple, fast, serverless ETL**; **EMR is scale, control, framework diversity**. If "minimal operations overhead" is emphasized, lean Glue. If "cost control and big-data framework choice" is emphasized, lean EMR.

## Summary

EMR is a managed big-data cluster where the Core/Task node distinction is key to spot cost strategy. Store data permanently on S3 (EMRFS) to separate compute from storage, use transient clusters to cut costs. If cluster operations seem burdensome, use EMR Serverless. Glue vs EMR is a balance between "operational simplicity" and "control and scale." Tomorrow we cover a lighter transform tool: Lambda.

---

## 📝 Practice Questions

**Question 1.** You want to use Spot Instances on an EMR cluster to reduce cost. Which node is the most suitable for using Spot without risk of data loss?

A) Primary (master) node  
B) Core node  
C) Task node  
D) All nodes equally  

**Answer: C**  
Explanation: Task nodes do not store HDFS data and only perform computation, so there is no data loss even if they suddenly disappear due to Spot reclamation. Core nodes hold HDFS blocks, so data may need to be recomputed if Spot is reclaimed, and the Primary node handles cluster coordination, so if it disappears the entire cluster stops.

---

**Question 2.** You want to run a large batch ETL that runs for only 1 to 2 hours every early morning on EMR in the most cost-effective way. Which design is NOT appropriate?

A) Use a transient cluster that terminates automatically when the job finishes  
B) Store the data persistently in S3 (EMRFS)  
C) Keep persistent data in HDFS on the Core nodes and leave the cluster running all the time  
D) Scale Task nodes using Instance Fleets + Spot  

**Answer: C**  
Explanation: HDFS is temporary storage that disappears when the cluster terminates, and keeping the cluster running all the time is costly for intermittent jobs. The standard approach is to keep persistent data in S3 (EMRFS) and launch a transient cluster only when running jobs. The rest are all correct cost-optimization patterns.

---

**Question 3.** What is the key reason Apache Spark is much faster than traditional MapReduce for iterative computation (such as machine learning)?

A) Because it always stores all data in HDFS  
B) Because it keeps intermediate results in memory and optimizes the DAG with lazy evaluation  
C) Because it runs only on a single node  
D) Because it does not compress data  

**Answer: B**  
Explanation: Unlike MapReduce, which writes to disk at every stage, Spark keeps intermediate results in memory and lazily evaluates transformations, optimizing the entire execution plan (DAG) at the time of an action. These two characteristics are the key to its performance on iterative computation. Spark is a distributed processing engine and uses various storage systems such as HDFS and S3.

---

**Question 4.** An operations team has no staff to manage cluster sizing and Spot strategy, and the workload is intermittent and hard to predict. They want to submit Spark jobs without provisioning a cluster and be billed only for usage. What is the most suitable option?

A) EMR Serverless  
B) EMR on EC2 (Instance Groups, running 24 hours a day)  
C) Redshift  
D) DynamoDB  

**Answer: A**  
Explanation: With EMR Serverless, you do not launch a cluster yourself; when you submit a Spark/Hive application, the required workers are automatically provisioned and released, and you are billed for the vCPU, memory, and time used. This fits intermittent, unpredictable workloads and the requirement to minimize operations. An always-on EMR on EC2 cluster has a heavy operational burden and idle cost.

---

**Question 5.** Which of the following is the most valid reason to choose EMR instead of Glue?

A) You want to develop a simple ETL as quickly as possible in a serverless manner  
B) You need to use a variety of big data ecosystem tools such as Hive, HBase, and Presto together, finely tune Spark, and control cost aggressively with Spot  
C) You want to minimize operational overhead and not deal with infrastructure at all  
D) You only want automatic DPU-based billing  

**Answer: B**  
Explanation: EMR's strengths are support for a wide range of big data frameworks, full control of the cluster, cost control through Spot usage, and fine-grained Spark tuning. Serverless, fast development, minimal operations, and DPU billing are all strengths of Glue, so they are reasons to choose Glue.

---
