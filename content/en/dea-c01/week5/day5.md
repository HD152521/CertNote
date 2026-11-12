# Day 5 - Week 5 Synthesis: Data Transformation 2 — Engines, Orchestration, Optimization Integration Review

This week covered "how to transform data, how to orchestrate flow, how to make it cheap and fast." If Week 4's Glue was serverless ETL basics, Week 5 is the larger toolbox around it — **EMR** for massive processing, **Lambda** for lightweight events, **orchestration** to link flows, and **performance/cost optimization** threading through everything. Today we rebind these four axes into one decision map.

## Week 5 Map at a Glance

```
[Transform Engine]       [Orchestration]          [Optimization Layer]
 Lambda  : light/event    Step Functions: AWS native   Format: Parquet/ORC
 Glue    : serverless     MWAA(Airflow) : complex/multi Compress: Snappy/Zstd
 EMR     : massive/control Glue Workflows: Glue-only    Partition: date etc.
 EMR S.  : serverless BD                             File size: 128MB~1GB
```

These three columns aren't independent. Real pipelines are "orchestrator calls transform engines in sequence, stores results in optimized format/partition" — all three axes interlock.

## 1) Transform Engine Choice: Scale and Control Tradeoff

Days 1-2's core: "scale and operational burden tradeoff."

| Engine | Scale | Ops Burden | Decisive Clue |
|--------|-------|------------|----------------|
| Lambda | Small (15min/10GB) | Very Low | "event-driven", "small file instant transform" |
| Glue | Medium-Large | Low (serverless) | "serverless ETL", "quick dev", "DPU billing" |
| EMR Serverless | Large | Low | "big data, hate cluster mgmt" |
| EMR on EC2 | Very Large | High | "Hive/HBase/Presto", "spot cost control", "fine tuning" |

EMR essentials: **Core nodes (storage+compute) on-demand, Task nodes (compute-only) on spot**. Keep permanent data on **S3 (EMRFS)**, use **Transient clusters** for work only, cutting costs. HDFS is temporary storage.

> 🎯 **Scenario**: Design a company pipeline. (1) IoT devices endlessly upload small JSON to S3 → **Lambda** cleanses instantly. (2) Daily accumulated data: large-scale aggregation → **EMR Transient (spot Task)** or **Glue**. (3) Save results for analysis → **Parquet + date partition**. (4) Orchestrate flow → **Step Functions**. Each tool operates in its strength zone.

## 2) Orchestration: Three Tools Linking Flow

Day 3's conclusion: keyword matching.

| Clue | Choice |
|------|--------|
| "AWS service-centric + serverless + branching/retry" | **Step Functions** |
| "High-freq, short (under 5min) events" | **Step Functions Express** |
| "Existing Airflow", "Python dynamic DAG", "multi-cloud/on-prem" | **MWAA** |
| "Pure Glue crawler/job, no extra services" | **Glue Workflows** |

Retrap: **"many steps ≠ MWAA."** All AWS services + low-ops → Step Functions. MWAA clues: "Airflow asset", "multi-environment", "complex Python logic."

> 💡 **Related Theory**: All three use DAG because acyclic graphs enable topological sorting — execute by "dependencies met" order and parallelize independent work. Orchestration is fundamentally "define DAG and provide execution guarantees (retry, idempotence, visibility)," with three tools offering that via serverless/standard-Airflow/Glue-built-in.

## 3) Optimization: Minimize Data Read

Day 4's four weapons, priority order:

1. **Format**: CSV/JSON → **Parquet/ORC** (column pruning + stat skip)
2. **Compression**: Splittable **Snappy/Zstd**. No giant single Gzip text (kills parallelism)
3. **Partitioning**: Filter frequently by **low-cardinality** columns (date, region). No high-cardinality (small file explosion)
4. **File size**: **128MB–1GB** via compaction. Millions of tiny files = overhead hell

Format one-liner: **analysis = Parquet/ORC (columnar)**, **schema evolution/fast write = Avro (row)**.

> ⚠️ **Gotcha**: Optimization problems usually demand multiple fixes simultaneously. "Athena costs skyrocket" scenario answer isn't just "convert to Parquet"—it's **format + partitioning + compaction combo**. Questions asking "most effective single measure" usually point to format or partitioning first, but "apply all" type also appears.

## Integrated Decision Flow

Encountering problems, think in order:

```
Q1. Processing scale?
    Small/event → Lambda
    Medium-Large serverless → Glue / EMR Serverless
    Massive/diverse/cost-control → EMR on EC2

Q2. Orchestrate flow how?
    AWS native serverless → Step Functions
    Airflow asset/multi-env → MWAA
    Pure Glue → Glue Workflows

Q3. Optimize storage?
    Parquet + Snappy + date partition + 128MB~1GB
```

## Week 5 Core in One Line

- **EMR**: Managed big-data cluster. Task=spot, data=S3(EMRFS), Transient for cost. Hate cluster ops? **EMR Serverless**.
- **Lambda**: Event-driven, 15min/10GB limits, lightweight transform. Best for small file instant processing, Firehose transform, glue code. Isolate failures with DLQ.
- **Step Functions / MWAA / Glue Workflows**: AWS native serverless / standard Airflow·complex / Glue-only. Discriminate by keywords.
- **Optimization**: Columnar format (Parquet) + splittable compress (Snappy) + partition pruning + file-size discipline. Giant single Gzip CSV = worst.

Next week we enter data storage and serving — data warehouses and catalog space. How transformed data lands and is served.

---

## 📝 Practice Questions

**Question 1.** Which transformation engine satisfies all of the following requirements? "Process tens of TB, use Hive and HBase together, control cost aggressively with Spot Instances, and finely tune the cluster."

A) Amazon EMR on EC2  
B) AWS Lambda  
C) AWS Glue  
D) Amazon Athena  

**Answer: A**  
Explanation: Support for a variety of big data ecosystem tools (Hive/HBase), cost control through Spot, and fine-grained cluster tuning are all strengths of EMR on EC2. Lambda has the 15-minute limit, Glue is a serverless abstraction with limited fine-grained control, and Athena is a query service that does not fit this requirement.

---

**Question 2.** You want to orchestrate "S3 file arrives → Glue transformation → validation → load into Redshift if it passes, notify on failure" in a serverless way with branching and retries. Which orchestrator is the most suitable?

A) Amazon MWAA  
B) A single Lambda function  
C) Amazon Kinesis  
D) AWS Step Functions  

**Answer: D**  
Explanation: Everything consists of AWS services, branching (Choice) and retries (Retry/Catch) are handled declaratively, and low-operations serverless is desired, so Step Functions is optimal. Choose MWAA when Airflow assets or multi-environment coordination are the clue; a single Lambda has the 15-minute limit and lacks visibility; and Kinesis is a streaming ingestion tool.

---

**Question 3.** Which statement about EMR cost optimization is correct?

A) Store persistent data in HDFS on the Core nodes and keep the cluster running 24 hours a day  
B) Apply Spot to Task nodes, keep persistent data in S3 (EMRFS), and launch a transient cluster only when running jobs  
C) Configure the Primary node with Spot to reduce cost  
D) Fix all nodes as On-Demand  

**Answer: B**  
Explanation: Task nodes do not store HDFS and are therefore safe from Spot reclamation, persistent data is kept in S3 (EMRFS) to separate compute from storage, and launching a transient cluster only when running jobs is the standard approach. HDFS is temporary storage, and putting the Primary on Spot would stop the entire cluster when it is reclaimed.

---

**Question 4.** Athena scan costs have spiked. The data is stored as a single Gzip CSV, and queries look only at the last few days and specific columns. Which of the following actions would NOT help reduce cost?

A) Convert to a columnar format such as Parquet  
B) Partition by year/month/day  
C) Partition finely by a high-cardinality column such as user_id and split the files further  
D) Compact small files to 128 MB to 1 GB and use splittable Snappy compression  

**Answer: C**  
Explanation: Partitioning by a high-cardinality column and splitting files further causes an explosion of partitions and the small-file problem, which actually worsens performance and cost. Converting to a columnar format, date partitioning, compaction, and splittable compression are all correct remedies for reducing the amount scanned.

---

**Question 5.** Which of the following pairs of a tool and its typical use is INCORRECT?

A) Lambda — lightweight event-driven transformation that immediately cleanses small files arriving in S3  
B) MWAA — complex workflows that reuse existing Airflow DAGs and coordinate multi-cloud environments  
C) Glue Workflows — general-purpose orchestration that coordinates a variety of non-Glue services with complex branching  
D) Parquet — a columnar format that reduces the amount scanned through column pruning in analytical queries  

**Answer: C**  
Explanation: Glue Workflows is lightweight orchestration almost entirely limited to Glue crawlers and jobs, and is weak at coordinating a variety of non-Glue services with complex branching. Step Functions or MWAA take that role. The other pairings (Lambda, MWAA, Parquet) are all correct.

---
