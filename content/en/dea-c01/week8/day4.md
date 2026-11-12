# Day 4 - Cost and Performance Operations: Monitoring, Sizing, Auto Scaling

Data pipelines running well yet unsustainable if costs uncontrolled. Today we visualize costs (allocation tags), right-size resources (sizing), auto-scale to load, and optimize during operations.

## Cost Visibility: Allocation Tags and Cost Explorer

First step to reduce costs: "what uses how much?"

- **Cost Allocation Tags**: Tag resources with `Project`, `Environment`, `Team`, `Pipeline` etc.; activate in billing console; break down costs by tag.
- **Cost Explorer**: Visualize cost trends by service, tag, period; forecast.
- **AWS Budgets**: Alert on budget thresholds (e.g., 80% of $5k monthly) or trigger actions.
- **Cost Anomaly Detection**: ML auto-detects and notifies unusual cost spikes.

```text
Tagging strategy example:
  Project=orders-pipeline
  Environment=prod
  CostCenter=data-eng
→ Cost Explorer breaks down "data-eng's prod orders-pipeline cost"
```

> 💡 **Related Theory**: Custom tags apply **after** activation; no retroactive application. Establish tagging policy early, apply consistently.

## Resource Sizing

Services have different cost levers:

- **Glue**: DPU (Data Processing Unit) count and worker type (Standard / G.1X / G.2X). Small data reduces workers; small jobs without Spark use **Python Shell (0.0625 DPU)** far cheaper.
- **EMR**: Instance type/count. Separate core/task nodes; match family to workload (memory vs. CPU).
- **Lambda**: Memory setting determines CPU too. Increase memory cutting runtime, sometimes lowers total cost (Power Tuning).
- **Redshift**: Node type/count or Serverless RPU.

```text
Under-provisioned: OOM, throttle, latency → SLA breach
Over-provisioned: idle resources → waste
Goal: size exactly to workload profile + auto scaling absorbs variance
```

## Auto Scaling

Fixed capacity wastes at baseline, shortfalls at peaks. Auto scaling follows load:

- **Glue Auto Scaling**: Dynamically adjust workers per stage (`--enable-auto-scaling`); set max workers as ceiling.
- **EMR Managed Scaling**: Cluster auto-adjusts core/task nodes based on YARN pending, memory; set min/max.
- **Kinesis On-Demand**: Auto-expand shards by throughput (no manual shard sizing).
- **Redshift Concurrency Scaling**: Temporary clusters absorb read query spikes.

> 💡 **Related Theory**: Auto scaling absorbs "variation," not "wrong baseline." Size baseline first, then scale for variance.

## Purchase Options for Cost Savings

- **Spot Instances**: Suited to fault-tolerant workloads like EMR task nodes. ~90% savings but reclaim-able → keep important data on core nodes.
- **Savings Plans / Reserved**: Discounted commitment on predictable baseline usage.
- **On-Demand**: Unpredictable, short-term workloads.

Typical pattern: EMR core nodes On-Demand/committed for stability, task nodes Spot for cost savings.

## Storage and Query Operations Optimization

- **S3 Lifecycle**: Transition old raw data Standard-IA → Glacier, clean incomplete multipart uploads.
- **Columnar format, compression, partitioning**: Athena/Spectrum bill on scanned bytes; Parquet+compression+partition pruning cuts costs directly.
- **Small file compaction**: Remove request costs and metadata overhead from file explosion.
- **Athena Workgroup**: Per-query scan ceiling (per-query data limit) stops runaway costs; track per-workgroup.

## Key Takeaways

- Visibility: allocation tags (apply after activation) + Cost Explorer + Budgets + Cost Anomaly Detection.
- Sizing adjusts service levers (Glue DPU/workers, EMR instances, Lambda memory) to workload.
- Auto scaling (Glue Auto Scaling, EMR Managed Scaling, Kinesis On-Demand) absorbs variation; baseline sizing first.
- Spot (task nodes) + committed (baseline) mix; scan-billed services cut costs via Parquet, partitions, workgroup limits.

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
