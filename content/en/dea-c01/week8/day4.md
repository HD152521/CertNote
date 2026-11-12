# Day 4 - Cost and Performance Operations: Monitoring, Sizing, Auto Scaling

## 📌 Key Takeaways

- Cost visibility starts with cost allocation tags. Tags are not enough once applied; they must be **activated** before they appear in Cost Explorer.
- The tools have different roles. Cost Explorer = past analysis, Budgets = alerts on thresholds you set, Cost Anomaly Detection = detecting spikes that differ from usual.
- Sizing starts with knowing each service's billing unit. Glue is DPU-hours, Athena is bytes scanned, and Lambda is memory × execution time.
- Auto scaling (Glue Auto Scaling, EMR Managed Scaling, Kinesis on-demand, Redshift Concurrency Scaling) only absorbs variation; it cannot fix a wrong baseline.
- For EMR, put core nodes on On-Demand or a commitment and task nodes on Spot. For services billed by scan volume, reduce cost with Parquet, compression, partitions, and workgroup limits.

## Cost Visibility: Allocation Tags and Three Tools

Even if a data pipeline runs well, it cannot be sustained if cost is not controlled. To cut cost, you first have to see "what spends how much."

- **Cost allocation tags** come in two kinds: AWS-generated tags that AWS attaches (such as `aws:createdBy`) and user-defined tags that you attach (`Project`, `Environment`, `Team`).
- Both kinds must be **activated separately** in the Billing console before they appear in Cost Explorer and cost reports. It can take up to 24 hours for tags to show up in the console.
- In an organization (Organizations), only the **management account** can activate cost allocation tags. Even if an engineer in a member account attaches tags, they are not reflected in costs unless the management account activates them.

```text
Example tag strategy:
  Project=orders-pipeline
  Environment=prod
  CostCenter=data-eng
→ In Cost Explorer, break down as "cost that data-eng spent on orders-pipeline in prod"
```

> 💡 **Related theory**: For a long time cost allocation tags were known to "apply only to costs after the point of activation and not retroactively," and exam material may still present it that way. The current documentation has a feature where the management account can request a **backfill** of up to 12 months. However, a backfill only extends the activation status into the past, so if resources were not actually tagged during that period, no values are filled in. Deciding a tagging policy early and applying tags consistently is still the answer.

| Tool | When | What it does | Clue for choosing it |
|------|------|------|------|
| Cost Explorer | After the fact | Visualizes and forecasts cost trends by service, tag, and period | "Analyze where and how much was spent" |
| AWS Budgets | Configured in advance | Alerts or actions when a set budget or threshold is reached | "Alert when 80% of the monthly budget is reached" |
| Cost Anomaly Detection | Continuous | Learns usual patterns with ML and notifies of abnormal spikes | "An unexpected spike when you do not know the threshold" |
| Compute Optimizer | Periodic | Right-sizing recommendations for resources | "Whether an instance is oversized" |

- Budgets alerts only when a number you set is exceeded. Even if a team that normally spends 100 a month starts spending 300, it stays quiet if the budget is 500. Anomaly Detection catches that range.

## Billing Unit by Service: What to Reduce to Reduce Cost

| Service | Billing unit | Knobs that drive cost |
|------|------|------|
| Glue ETL | DPU × execution time | Worker type and count, execution time, Flex |
| EMR on EC2 | Instance hours (EC2 charge + EMR charge) | Instance type and count, Spot share, idle time |
| Lambda | Number of requests + memory × execution time | Memory setting, execution time |
| Athena | Amount of data scanned | Format, compression, partitions, workgroup limits |
| Redshift provisioned | Node hours | Node type and count, pause |
| Redshift Serverless | RPU × usage time | Base capacity, usage limits |
| Kinesis Data Streams | Provisioned: shard-hours; on-demand: data volume | Shard count, capacity mode |
| S3 | Storage + number of requests + transfer volume | Storage class, file count, lifecycle |
| Step Functions Standard | Number of state transitions | Retry count, loop structure |

- For services billed by "time," **idle time** is the waste; for services billed by "data volume," **bytes read unnecessarily** are the waste. Seeing which side the service in the question falls on sets the direction of the answer.

## Glue Sizing

One DPU is a relative unit equivalent to 4 vCPUs and 16GB of memory.

| Worker type | DPU per worker | vCPU / memory | Suitable workload |
|------|------|------|------|
| G.025X | 0.25 | 2 / 4GB | Low-volume streaming jobs only |
| G.1X | 1 | 4 / 16GB | Most transforms and joins |
| G.2X | 2 | 8 / 32GB | Most transforms and joins (when more memory is needed) |
| G.4X / G.8X | 4 / 8 | 16 / 64GB, 32 / 128GB | The heaviest transforms, aggregations, and joins |
| G.12X / G.16X | 12 / 16 | 48 / 192GB, 64 / 256GB | Very large workloads |
| R.1X to R.8X | 1 to 8 | Memory-optimized configurations | Memory-intensive jobs with frequent OOM |

- The **Standard worker type** that appears in older material is **the old configuration of Glue 1.0 and below.** From 2.0 onward, you specify a worker type and a worker count, and Standard does not support Auto Scaling either.
- For small tasks that do not need Spark, a **Python shell job** (0.0625 DPU or 1 DPU) is much cheaper. Do not spin up a Spark cluster to move a few files and call an API once.
- Use the **Flex execution class** for non-urgent jobs (tests, one-off loads, nightly batches). It is cheaper in exchange for a possibly delayed start. It works only on Glue 3.0 and above with G.1X and G.2X.
- **Auto Scaling** (`--enable-auto-scaling`) adds and removes workers on Glue 3.0 and above according to the parallelism of stages and micro-batches. In this case the number of workers you specify becomes an **upper bound,** not a "fixed number."
- Jobs are billed by execution time, so the **timeout** is a cost safety net. If a hung job runs to the default timeout, all of that time is billed.

```bash
# Run with Auto Scaling on, up to 20 workers
aws glue start-job-run \
  --job-name orders-transform \
  --worker-type G.2X --number-of-workers 20 \
  --arguments '{"--enable-auto-scaling":"true"}'
```

- The basis for sizing is the two metrics from Day 1. If `numberMaxNeededExecutors` (the needed count) keeps exceeding `numberAllExecutors` (the actual count), workers are insufficient; if it is far below, you have too many.

```text
Under-provisioning: OOM, throttling, delay → SLA violation
Over-provisioning: idle resources → waste
Goal: a baseline fitted to the workload profile + auto scaling for the variation
```

## EMR Sizing and Managed Scaling

| Node | Role | Purchase option |
|------|------|------|
| Primary | Cluster coordination | On-Demand (if it drops, the cluster dies) |
| Core | Runs tasks + holds HDFS data | On-Demand or commitment |
| Task | Runs tasks only, holds no data | Spot |

- **Managed Scaling** lets EMR watch cluster metrics and automatically increase and decrease core and task nodes. The user sets only the limits.

| Parameter | Meaning |
|------|------|
| `MinimumCapacityUnits` / `MaximumCapacityUnits` | Lower and upper bounds of cluster capacity (the primary node is not counted) |
| `MaximumOnDemandCapacityUnits` | Upper bound that can be filled with On-Demand. Anything beyond is filled with Spot |
| `MaximumCoreCapacityUnits` | Upper bound for core nodes. Anything beyond is filled with task nodes |

```json
{
  "ComputeLimits": {
    "UnitType": "Instances",
    "MinimumCapacityUnits": 2,
    "MaximumCapacityUnits": 100,
    "MaximumOnDemandCapacityUnits": 10,
    "MaximumCoreCapacityUnits": 17
  }
}
```

- The configuration above means "up to 100 instances, of which up to 10 On-Demand, and up to 17 core." The rest grows as Spot task nodes.
- Managed Scaling works only for **YARN-based applications** (Spark, Hadoop, Hive, Flink). Workloads that do not use YARN, such as Presto and HBase, are not covered.
- If you turn off Spark's dynamic resource allocation, Managed Scaling may scale up more than necessary (to the maximum). Leave it at the default, which is on.
- Spot is much cheaper but can be reclaimed. If you place core nodes on Spot, HDFS data disappears along with the reclaim. Keeping data in S3 (EMRFS) and using clusters transiently reduces both this risk and idle cost.
- A cluster left running after the work is done is EMR's biggest waste. Use the auto-termination policy or the terminate-after-step-completion setting.

## Absorbing Variation in Redshift, Kinesis, and Lambda

| Feature | Variation it absorbs | How it works | Caution |
|------|------|------|------|
| Redshift Concurrency Scaling | Surges in concurrent queries | With Concurrency Scaling mode of a WLM queue set to `auto`, queries that would wait are sent to a temporary cluster | Billed only for the time queries actually run. Write operations are supported only on RA3 and RG nodes |
| Redshift Serverless | Overall usage | Uses RPUs only when there are queries | Advantageous for intermittent workloads |
| Kinesis on-demand | Ingest volume variation | The service manages shards | Provisioned is cheaper if traffic is steady |
| Glue Auto Scaling | Differences in parallelism per stage | Increases and decreases workers during the run | You set the upper bound yourself |
| EMR Managed Scaling | YARN backlog | Increases and decreases core and task nodes | YARN applications only |

- The default number of Concurrency Scaling clusters is 1, adjustable with `max_concurrency_scaling_clusters`. Free credits accrue based on main cluster usage, so short peaks can be handled at no extra cost.
- Concurrency Scaling is a feature that reduces **queueing,** not one that makes a slow query fast. If a single query is slow, it is a problem of distribution key, sort key, or node specification.
- In **Lambda**, the memory setting also determines CPU allocation. There is a range where raising memory shortens execution time so much that total cost actually goes down. Measure with several memory values and choose.

> 💡 **Related theory**: Auto scaling only absorbs "variation" and cannot fix a "wrong baseline." If the usual cost is high, do not touch the scaling upper bound; redo the baseline sizing. The order is always sizing → scaling.

## Purchase Options

| Option | Suitable usage | Place in a data pipeline |
|------|------|------|
| On-Demand | Unpredictable, short-term | New workloads, primary and core nodes |
| Savings Plans / Reserved | Predictable baseline | Always-on clusters, provisioned Redshift |
| Spot | Work that tolerates interruption | EMR task nodes, re-runnable batches |

## Storage and Query Operations Optimization

- **Athena workgroup per-query limit**: An upper bound on how much a single query can scan. When exceeded, the query is **canceled,** and what was scanned before cancellation is still billed. The minimum is 10MB, and you can set only one per workgroup.
- **Workgroup-wide usage alert**: Notifies via SNS when the cumulative scan volume over a given period exceeds a threshold. This **does not cancel queries automatically.** To block, you wire it up yourself, for example by receiving the alert and disabling the workgroup with Lambda.
- **Columnar format, compression, partitioning**: Billing is by bytes scanned, so Parquet + compression + partition pruning is itself cost reduction. `SELECT *` throws away the benefit of the columnar format.
- **Small-file compaction**: Many files increase request cost and the burden of listing and metadata.
- **S3 lifecycle**: Move old raw data to infrequent-access or archive classes, and clean up incomplete multipart uploads. Sending frequently read data to archive costs money and time to retrieve.

```sql
-- Bad example: all columns, no partition condition → full table scan
SELECT * FROM orders WHERE order_status = 'PAID';

-- Good example: only the needed columns, range limited by the partition column
SELECT order_id, amount FROM orders
WHERE dt BETWEEN '2026-06-01' AND '2026-06-07' AND order_status = 'PAID';
```

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Tags do not appear in Cost Explorer | Tags not activated, or not the management account | Activate from the management account, wait up to 24 hours |
| Within budget but cost is several times usual | A spike below the Budgets threshold | Cost Anomaly Detection |
| Glue cost is large relative to the data volume | Too many workers, a hung job running to timeout | Re-size using executor metrics, Auto Scaling, shorten the timeout |
| EMR cost is incurred even on nights with no work | Idle cluster | Auto-termination policy, transient clusters |
| A job restarts from scratch on Spot reclaim | Core nodes are Spot | Core On-Demand, only tasks on Spot |
| A Redshift dashboard waits every morning | Insufficient concurrency | Concurrency Scaling |
| Athena cost balloons | Queries without partition conditions, row format | Per-query limit, Parquet and partitions |
| Usual cost is high even with auto scaling on | Baseline too large | Readjust minimum capacity and base sizing |

## Question Clue → Answer Lookup Table

| Question clue | Answer |
|------|------|
| "Break down cost by project and environment" | Activate cost allocation tags + Cost Explorer |
| "Automatically detect unexpected cost spikes" | Cost Anomaly Detection |
| "Alert when a certain percentage of the budget is reached" | AWS Budgets |
| "Automatically adjust a Glue job's workers during the run" | Glue Auto Scaling |
| "Run a small script that does not need Spark cheaply" | Glue Python shell |
| "Reduce the cost of non-urgent Glue jobs" | Flex execution class |
| "EMR cost reduction + interruption tolerance" | Core On-Demand, task Spot |
| "Add capacity only when concurrent queries surge" | Redshift Concurrency Scaling |
| "An analyst's mistaken query scans several TB" | Athena workgroup per-query limit |
| "Directly reduce Athena and Spectrum query cost" | Parquet + compression + partition pruning |

Tomorrow we tie together this week's four topics (monitoring, quality, troubleshooting, cost) into a single operational flow for review.

## 📖 Glossary

- **Cost allocation tag**: A tag attached to resources and activated in Billing so that cost can be viewed split by project and team.
- **Backfill**: Requesting that a tag's activation status be extended to past periods so that it is reflected in past cost data.
- **DPU**: Glue's unit of processing capacity. One equals 4 vCPUs and 16GB of memory.
- **Flex execution class**: A way to run Glue jobs that is cheaper in exchange for a possibly delayed start.
- **Managed Scaling**: A feature where EMR watches metrics and adjusts the node count by itself. You only set the limits.
- **Core node / task node**: Core nodes hold HDFS data, while task nodes only compute. That is why only task nodes are run on Spot.
- **Concurrency Scaling**: A Redshift feature that attaches temporary clusters when concurrent queries pile up, reducing queueing.
- **Spot Instance**: A purchase option that uses spare EC2 capacity cheaply but that AWS can reclaim when it needs it.
- **Workgroup**: A unit that groups Athena queries and manages settings, limits, and cost separately.
- **Baseline sizing**: The base capacity fitted to the normal load. It must be set right before auto scaling.

## 📝 Practice Questions

**Question 1.** What should a data team do first when it wants to break down AWS costs by project and by environment?

A) Consolidate all resources into one account  
B) Switch all instances to Spot  
C) Apply Cost Allocation Tags consistently and activate them in the billing console  
D) Enable CloudTrail data events  

**Answer: C**  
Explanation: If you apply cost allocation tags (Project, Environment, and so on) consistently and activate them, you can break down costs by tag in Cost Explorer. Account consolidation and switching to Spot are unrelated to breakdown visibility, and CloudTrail data events are for API auditing, not cost analysis.

---

**Question 2.** Which feature dynamically increases and decreases the number of workers during a Glue job run according to the needs of each stage, capturing both cost and performance?

A) Glue Auto Scaling  
B) Job Bookmark  
C) Partition Projection  
D) DynamicFrame  

**Answer: A**  
Explanation: Glue Auto Scaling (`--enable-auto-scaling`) dynamically adjusts workers to the workload during job execution, and you specify only the maximum number of workers as the upper limit. Job Bookmark is incremental processing state, Partition Projection is Athena partition computation, and DynamicFrame is a data abstraction.

---

**Question 3.** What is the typical pattern for configuring an EMR cluster to cut cost significantly while tolerating interruptions?

A) Configure all nodes as Spot  
B) Configure all nodes as On-Demand  
C) Core nodes on Spot, task nodes On-Demand  
D) Core nodes On-Demand/committed, task nodes Spot  

**Answer: D**  
Explanation: Keeping the core nodes that hold HDFS data on stable On-Demand/committed capacity and configuring the stateless task nodes as Spot saves cost without data loss even if they are reclaimed. Putting core nodes on Spot carries a high risk of data loss when reclaimed.

---

**Question 4.** What is the most effective way to directly reduce the query cost of Athena and Redshift Spectrum?

A) Store all data as CSV  
B) Reduce scanned bytes with the Parquet columnar format + compression + partition pruning  
C) Run queries more often  
D) Always output results as JSON  

**Answer: B**  
Explanation: Athena/Spectrum are billed by bytes scanned, so reducing the amount of data read with a columnar format (Parquet), compression, and partition pruning directly reduces cost. CSV/JSON increase the amount scanned, and running queries more often increases cost.

---

**Question 5.** Which service uses machine learning to automatically detect and notify you of abnormal spikes in AWS costs that differ from the usual?

A) AWS Budgets  
B) Trusted Advisor  
C) Compute Optimizer  
D) Cost Anomaly Detection  

**Answer: D**  
Explanation: Cost Anomaly Detection learns cost patterns with ML and automatically detects and notifies you of abnormal spikes. Budgets sends alerts based on preset thresholds, Trusted Advisor checks best practices, and Compute Optimizer recommends resource sizing, so they differ from dynamic anomaly detection.

---
