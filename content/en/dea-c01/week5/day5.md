# Day 5 - Week 5 Synthesis: Data Transformation 2 — Engines, Orchestration, Optimization Integration Review

## 📌 Key Takeaways

- Choose a transformation engine by **scale and operational burden**: Lambda (immediate processing of small files, Firehose transformation, glue code; failures isolated to a DLQ), Glue (serverless ETL), EMR Serverless (big data without a cluster), EMR on EC2 (scale, control, ecosystem).
- Orchestration splits into **Step Functions** (AWS-native serverless), **MWAA** (Airflow assets, multiple environments), and **Glue Workflows** (Glue only).
- The essence of optimization is reducing the data to read. Check in this order: columnar format → splittable compression → low-cardinality partitions → 128 MB to 1 GB files.
- Limits decide the choice. Lambda is 15 minutes per invocation and 10 GB of memory; Step Functions Express is 5 minutes and cannot use wait-for-job-completion (`.sync`).
- The standard for EMR cost is spot Task nodes, data in S3 (EMRFS), and Transient clusters launched only while working.

## Week 5 Map at a Glance

This week covered "how to transform data, how to coordinate the flow, and how to make it cheap and fast." If Glue up to Week 4 was the foundation of serverless ETL, Week 5 is the larger toolbox around it: **EMR** for large-scale processing, **Lambda** for lightweight event processing, **orchestration** to weave flows together, and **performance and cost optimization** that runs through everything. Today we tie these four axes back into a single decision map.

```
[Transformation engine]    [Orchestration]           [Optimization layer]
 Lambda  : light, event      Step Functions: AWS-native  Format: Parquet/ORC
 Glue    : serverless ETL    MWAA (Airflow): complex/multi Compression: Snappy/Zstd
 EMR     : large, control    Glue Workflows: Glue only   Partitions: date, etc.
 EMR S.  : serverless big data                           File size: 128MB~1GB
```

These three columns are not independent. In a real pipeline the three axes mesh as "the orchestrator calls transformation engines in order and stores the results in an optimized format and partitions."

## 1) Choosing a Transformation Engine: The Scale of Scale and Control

The core of Days 1-2 is the "trade-off between job scale and operational burden."

| Engine | Scale | Operational burden | Decisive clue |
|------|------|-----------|-------------|
| Lambda | Small (15 min/10 GB) | Very low | "event-driven", "immediately transform small files" |
| Glue | Medium to large | Low (serverless) | "serverless ETL", "fast development", "DPU billing" |
| EMR Serverless | Large | Low | "big data, don't want to manage clusters" |
| EMR on EC2 | Very large | High | "Hive/HBase/Presto", "spot cost control", "fine-grained tuning" |

What you must remember about EMR: **Core nodes (storage + compute) are on-demand, Task nodes (compute only) are spot.** Keep permanent data in **S3 (EMRFS)** and save cost by launching a **Transient cluster** only when working. HDFS is temporary storage.

> 🎯 **Scenario**: Design one company's pipeline. (1) IoT devices keep uploading small JSON files to S3 → **Lambda** cleans them the moment they arrive. (2) Large-scale aggregation of accumulated data every early morning → **EMR Transient (spot Task)** or **Glue**. (3) Store results for analytics → **Parquet + date partitions**. (4) Coordinate the whole flow → **Step Functions**. The key point is that each tool is used only in its area of strength.

## 2) Orchestration: Three Tools That Weave the Flow

The conclusion of Day 3 is organized by keyword matching.

| Clue | Choice |
|------|------|
| "AWS-service-centric + serverless + branching/retry" | **Step Functions** |
| "High-frequency, short-lived (within 5 minutes) events" | **Step Functions Express** |
| "Existing Airflow", "Python dynamic DAGs", "multi-cloud/on-premises" | **MWAA** |
| "Pure Glue crawlers and jobs, no additional services needed" | **Glue Workflows** |

Pitfall reconfirmed: **"many steps = MWAA" is not the rule.** If everything is AWS services and you want low operations, Step Functions is right. The clues for MWAA are "Airflow assets," "multiple environments," and "complex Python logic."

The reason all three tools use a DAG is that an acyclic graph can be topologically sorted, so they can execute in "dependency-satisfied order" and parallelize independent tasks. Orchestration is ultimately "the job of defining a DAG and providing execution guarantees (retries, idempotency, visibility)," and the three tools provide those execution guarantees in a serverless way, a standard Airflow way, and a Glue-built-in way respectively.

## 3) Optimization: Minimize the Data Read

Memorize Day 4's four weapons in priority order.

1. **Format**: CSV/JSON → **Parquet/ORC** (column pruning + statistics skipping)
2. **Compression**: splittable **Snappy/Zstd**. No huge single Gzip text file (kills parallelism)
3. **Partitioning**: **low-cardinality** columns you filter on often (date, Region). No high cardinality (explosion of small files)
4. **File size**: compact to **128 MB to 1 GB**. Tens of thousands of small files is overhead hell

One-line summary of formats: **analytic queries = Parquet/ORC (columnar)**, **schema evolution and fast writes = Avro (row-based)**.

> ⚠️ **Pitfall**: Optimization questions usually ask for several remedies at once. The answer to an "Athena cost spike" scenario is often not the single "switch to Parquet" but the combination of **format conversion + partitioning + compaction**. When the answer choices ask for "the single most effective action," format (columnar) or partitioning is usually first, but "apply all of them" type questions also appear.

## Integrated Decision Flow

The order of thinking when you meet a question:

```
Q1. What is the processing scale?
    Small/event → Lambda
    Medium to large, serverless → Glue / EMR Serverless
    Very large / diverse ecosystem / cost control → EMR on EC2

Q2. How is the flow coordinated?
    AWS-native serverless → Step Functions
    Airflow assets / multiple environments → MWAA
    Pure Glue → Glue Workflows

Q3. How is storage optimized?
    Parquet + Snappy + date partitions + 128MB~1GB
```

## Limits and Execution Model Comparison: Where Numbers Decide the Choice

Wrong answers on engine-selection questions are usually eliminated by limits. Let us put the four engines side by side on the same items.

| Item | Lambda | Glue Spark Job | EMR on EC2 | EMR Serverless |
|------|--------|----------------|------------|----------------|
| Execution unit | Function invocation | Job run | Cluster + Step | Application + Job run |
| Time limit | 15 minutes per invocation | Timeout setting (up to 7 days) | While the cluster is up | Per Job run |
| Memory | 128 MB to 10,240 MB | Determined by worker type (G.1X is 16 GB) | Determined by instance type | Determined by worker size |
| Idle cost | None | None | Incurred while the cluster is up | None (incurred if you keep pre-initialized capacity) |
| Long-running services (HBase, etc.) | Not possible | Not possible | Possible | Not possible (for running Spark and Hive jobs) |
| Fine-tuning and spot control | Only memory setting | Worker type and count | Instances, spot, and settings, all | Worker size and capacity limits |

- Bundle the remaining Lambda limits too. The `/tmp` ephemeral storage is 512 MB to 10,240 MB, and the payload is 6 MB synchronous and 1 MB asynchronous (the asynchronous limit was 256 KB for a long time, so exam materials may show 256 KB). CPU is allocated in proportion to memory, so a function short on CPU gets faster by raising its memory.
- EMR Serverless **pre-initialized capacity** warms workers in advance so jobs start within seconds, but idle cost arises accordingly. If the condition is "intermittent batch, no idle cost," do not turn it on.
- "A single-file transformation that takes 30 minutes" is not for Lambda even if the data is small. The reason for elimination is not size but the **time limit**.

## Step Functions Standard vs Express: Where They Diverge for ETL

On Day 3 we distinguished them only by execution time (1 year vs 5 minutes). For ETL orchestration there are more important differences.

| Category | Standard | Express |
|------|----------|---------|
| Maximum execution time | 1 year | 5 minutes |
| Execution guarantee | exactly-once | at-least-once for asynchronous, at-most-once for synchronous |
| Billing basis | Number of state transitions | Number of executions + execution time + memory |
| Wait for job completion (`.sync`), callback (`.waitForTaskToken`) | Supported | Not supported |
| Distributed Map | Supported | Not supported |
| Execution history | Kept by the service (90 days after completion) | You must send it to CloudWatch Logs to see it |

- **The default for ETL orchestration is Standard.** A Glue Job or EMR Step takes minutes to hours, and integration patterns that wait until completion, like `glue:startJobRun.sync`, cannot be used with Express.
- **Standard can be entrusted with non-idempotent tasks.** Since the same state is not executed twice (except where you wrote `Retry`), it suits tasks like creating an EMR cluster. Express can run one extra time, so use it only for idempotent tasks.
- **The billing intuition is reversed.** Standard gets more expensive with more steps, Express with longer and more frequent runs. Running hundreds of short events per second through Standard makes the number of state transitions explode.
- The workflow type cannot be changed after the state machine is created.

## Who Retries a Failure

Pipeline-failure questions ask "which layer retries, and where does the failure remain?"

| Layer | Default retry | Where the failure remains |
|------|-------------|----------------|
| Lambda asynchronous invocation (S3 events, etc.) | 2 more times on function error | DLQ or failure destination (discarded if not configured) |
| Lambda + Kinesis/DynamoDB Streams | Repeats until the record expires (that shard is blocked) | You must set the retry cap, batch splitting, and failure destination yourself |
| Step Functions | As many as you wrote `Retry` on the state | Branch with `Catch` for notification and compensation handling |
| Glue Job | The number of times you set (0-10). A timeout termination is not retried | Job run status and CloudWatch |

> ⚠️ **Pitfall**: If you stack retries on several layers, they multiply. If you set 3 `Retry` in Step Functions together with 3 retries on the Glue Job itself, the Job can run up to 16 times for a single failure. Put retries on only one layer (usually the orchestrator), and design output so that re-running gives the same result, by overwriting per partition rather than appending.

## One More Point to Make About EMR

- **The premise behind "spot Task nodes are safe."** Task nodes do not run the HDFS DataNode, so data is not lost even if they are reclaimed. But if the YARN application master that directs the job was running on that node, the job itself fails. From EMR 6.x the default is that the application master can run on either Core or Task nodes, so if the spot share is large, configure it with node labels to place it only on Core (or on-demand) nodes.
- **The Primary node can be configured as three nodes for high availability.** With a single-node configuration, the Primary is a single point of failure. This is why you must not put it on spot.
- **Managed Scaling**: you just set the minimum and maximum capacity, and EMR watches metrics and grows and shrinks the Core and Task nodes. It works only for YARN-based applications (Spark, Hive, Flink, and so on) and does not apply to Presto or HBase. The Primary node is not a target of adjustment.
- **Instance Fleets** have mixing of purchase options and instance types as a basic feature, which helps secure spot capacity. Instance Groups have one type and one purchase option per group.

## Billing Structure in One Table

| Service | Billing basis | How to reduce |
|--------|-----------|-------------|
| Lambda | Number of requests + run time × memory | Memory tuning, reduce unnecessary invocations |
| Glue | DPU × run time (per second) | Adjust worker count and timeout, Flex, Auto Scaling |
| EMR on EC2 | EC2 charge + EMR charge (instance uptime) | Task spot, Transient clusters, Managed Scaling |
| EMR Serverless | vCPU, memory, and storage used by workers × time | Minimize pre-initialized capacity, set capacity limits |
| Step Functions Standard | Number of state transitions | Merge steps, avoid frequent polling loops |
| Step Functions Express | Number of executions + run time + memory | Use only for short, light flows |
| MWAA | Environment uptime + workers | Environment class and worker auto-scaling range |
| Athena | Amount of data scanned | Day 4's four (format, compression, partitioning, file size) |

## Scenario Practice: Filter Out the Wrong Answers First

| Scenario | Choice eliminated first | Selection |
|----------|--------------------|------|
| Converting one 5 GB CSV file to Parquet takes about 30 minutes | Lambda (exceeds 15 minutes) | Glue Job |
| Tens of 1 MB JSON files arrive in S3 per second, each validated and moved | Glue (launching a Job per item is excessive) | Lambda + concurrency limit + DLQ |
| Run three Glue Jobs in order and send a notification on failure. We do not want to keep infrastructure | MWAA (always-on cost), Express (cannot wait for completion) | Step Functions Standard |
| Just chain crawler → Glue Job → crawler | MWAA | Glue Workflows |
| Migrate 200 on-premises Airflow DAGs | Step Functions (rewrite everything) | MWAA |
| A 2-hour Spark batch once a day, no staff to operate a cluster | EMR on EC2 | EMR Serverless or Glue |
| Keep Presto and HBase up all the time and control cost with spot | EMR Serverless, Glue | EMR on EC2 (Core on-demand, Task spot) |
| Firehose creates small files every minute and Athena slowed down | Only changing the format | Increase buffer size and interval + compaction |
| Partitioning by `user_id` produced millions of partitions | Splitting files even more | Redesign with a low-cardinality column such as date |
| Per event, run four transformation steps of a few seconds each, hundreds per second | Standard (billed per transition) | Step Functions Express (make the steps idempotent) |

Next week we move to the side that stores and serves data: the data warehouse and catalog area. It covers where and how the transformed data settles.

## 📖 Glossary

- **Transient cluster**: A one-time EMR cluster that is launched when a job starts and terminates automatically when it finishes.
- **EMRFS**: The layer that lets EMR read and write S3 like a file system. It lets you keep data permanently outside the cluster.
- **Core / Task nodes**: Core does HDFS storage and compute together, and Task does compute only. Task nodes can disappear with the data still remaining, so they suit spot.
- **Cold start**: The phenomenon where the first invocation is slow because Lambda creates a new execution environment.
- **State transition**: In Step Functions, one step finishing and moving on to the next. It is the billing unit of Standard workflows.
- **DAG**: An acyclic graph that draws tasks as nodes and dependencies as arrows. It is the basis on which an orchestrator decides execution order.
- **Column pruning**: An optimization in columnar formats that picks and reads only the columns the query needs.
- **Partition pruning**: An optimization that reads only the partition folders matching the condition and does not open the rest.
- **Compaction**: The task of merging many small files into larger files of appropriate size.
- **Idempotency**: The property that running the same task multiple times gives the same result as running it once. It is required for retries to be safe.

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
