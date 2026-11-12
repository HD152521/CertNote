# Day 3 - EMR, Glue, MWAA: Big Data Orchestration and Distributed Processing Engines

Engineers designing big data processing for the first time typically start by asking, "Which service should we use? EMR? Glue? Athena?" But these three aren't competitors—they're the same engine (Apache Spark) wrapped in different operational models. EMR lets you directly operate Spark as a cluster; Glue abstracts Spark serverlessly; Athena exposes only SQL on top of Spark/Presto. So the real question becomes: "How much direct control of the cluster does this workload need, and how much operational burden are we willing to offload to AWS?"

In SAP-C02 exams, this domain tests operational architecture: "running heavy Spark jobs across tens of thousands of nodes processing petabytes cost-optimally," "orchestrating pipelines with hundreds of interdependent steps," "keeping jobs alive through Spot interruptions and node failures." Today we'll dissect how EMR, Glue, and MWAA work internally, why they're architected that way, and build intuition for solving these scenarios.

## Why Distributed Processing — MapReduce to Spark History

Big data processing originated with Google's 2004 MapReduce paper. The core idea was simple: split vast data into chunks, scatter them across thousands of commodity servers (Map), have each independently process their chunk, then combine results (Reduce). Linear scaling from one supercomputer to thousands of cheap servers. Doug Cutting implemented this as open-source Hadoop—HDFS for distributed storage (Google GFS's open-source version), YARN for resource management.

The problem: MapReduce wrote all intermediate results to disk. Iterative algorithms (machine learning, graph processing) cycle over the same data dozens of times; writing to/reading from HDFS each cycle created an I/O bottleneck. In 2009, Matei Zaharia at UC Berkeley's AMPLab created **Spark**, inverting this. Spark keeps intermediate results in memory (in-memory computing) and expresses computation as **RDD (Resilient Distributed Dataset)**, an immutable abstraction. RDDs don't hold actual data—only the "lineage" of how they're built. If a node dies and some partitions vanish, Spark recomputes just that portion along the lineage, restoring it. This fault-tolerance without checkpointing made Spark the standard.

> 💡 **Related Theory**: Spark's core is **lazy evaluation** and **DAG execution**. Transformations like `map` and `filter` don't execute immediately—only recorded in the lineage. Only when an action (count, collect, save) runs does Spark see the whole transformation chain, build an optimal plan (DAG), and execute it once. This enables operator fusion (merging unnecessary steps) and shuffle minimization. With DataFrame API, you add the **Catalyst optimizer** and **Tungsten execution engine**, so declaratively-written SQL-like code gets column pruning, predicate pushdown, and code generation, running far faster than RDD. So practically and on exams, "DataFrame/Spark SQL over RDD" is standard.

> 🔍 **Deep Dive**: **Shuffle** is the most expensive operation in distributed processing because it is why. Wide transformations (`groupBy`, `join`, `reduceByKey`) must group equal keys on the same node. This triggers all-to-all network communication between every node, writes intermediate results to disk (shuffle write), then reads them (shuffle read). Slow 100-million-row joins usually stem from shuffle, not computation itself. Optimization hinges on reducing shuffle—small tables use **broadcast join** (replicate to all nodes, kill shuffle), pre-align partitioning for co-location, avoid `repartition` overuse. Redshift's distribution key (Day 42) follows the identical principle: minimize inter-node shuffle.

## EMR — Managed Hadoop/Spark Cluster

EMR (Elastic MapReduce) runs the Hadoop ecosystem (Spark, Hive, Presto/Trino, HBase, Flink, Hudi) on EC2 clusters as a managed service. It eliminates hand-installing, tuning, and patching Hadoop on EC2; clicks or one API call spin up dozens to thousands of nodes in minutes. Understanding EMR hinges on **three node roles**.

- **Master (Primary) Node**: Manages the cluster. YARN ResourceManager, HDFS NameNode, job scheduling live here. Only one (or three in HA setup) exists; if it dies, the whole cluster suffers—**never run it on Spot**.
- **Core Nodes**: Act as HDFS DataNodes (store data) while running tasks. They hold HDFS data, so a Spot interruption loses data and triggers replication/recovery overhead. Usually run On-Demand or conservative Spot ratios.
- **Task Nodes**: Execute tasks only, no HDFS storage. Data is transient—interruption causes no loss—**perfect Spot candidates**. Cost optimization's heart is "fill Task nodes with Spot."

This role separation starts EMR cost optimization. Keep Master/Core minimal on stable On-Demand; elastically scale heavy compute with cheap Spot Task nodes.

> 💡 **Related Theory**: Where EMR places data determines architecture. Traditional Hadoop pursues **data locality**—execute computation where data lives (on Core nodes' local HDFS). In cloud, **EMRFS** becomes standard: data lives on S3. This separates compute and storage (like RA3 on Day 42), letting jobs terminate clusters entirely post-run (zero compute cost) and multiple clusters share the same S3 data. Downside: S3 has higher latency than HDFS, but EMRFS's S3 optimization committer and Parquet column pruning offset this considerably. From SAP's angle: "kill cluster post-job to cut costs" almost always means S3-based transient cluster.

> 🔍 **Deep Dive**: **Instance Fleets vs Instance Groups**. Two ways to configure EMR nodes. Instance Groups pin each group to a single instance type—simple but fails when that type's Spot inventory dries up. **Instance Fleets** mix multiple instance types (m5.xlarge, m5a.xlarge, m4.xlarge) in one group with weights and target capacity (e.g., "fill 32 vCPU"). EMR auto-fills with the cheapest available, auto-substituting if one type's Spot interrupts. So "Spot-resilient, cost-optimal" in exams almost always means **Instance Fleets + Spot multi-type**.

> 📚 **Case Study**: Yelp, an early large-scale EMR operator, ran hundreds of clusters daily, ingesting petabytes of logs via Spark/MapReduce. Core pattern: "transient cluster per job"—data lives permanently on S3; only when processing does a cluster spin up, fill Task nodes with Spot, then terminate immediately, minimizing compute costs. Lessons: (1) transient per-job clusters beat long-running for cost/isolation, (2) S3 as source of truth makes clusters disposable. SAP exams repeat this "cost-optimal batch" pattern.

## EMR Deployment Models — EC2, EKS, Serverless

EMR offers the same engine in three runtimes. Choice reflects "control vs. operational burden" tradeoff.

- **EMR on EC2** (traditional): The cluster described above. Maximum control (custom AMI, bootstrap actions, all Hadoop components). Largest cluster management responsibility.
- **EMR on EKS**: Run Spark jobs as Pods on existing EKS (Kubernetes) clusters. Fits organizations that standardized on EKS for containers and now want to integrate Spark workloads with the same infrastructure, IAM, and observability. Big data and app teams share the same Kubernetes resource pool, raising utilization.
- **EMR Serverless** (2022): No cluster sizing, no node management. Submit jobs; AWS spins up necessary workers, runs, then reclaims. Optimal for variable workloads or cluster-operation-averse teams. Over/under-provisioning from capacity miscalculation vanishes.

> ⚠️ **Trap**: "EMR Serverless is always cheaper and better"—false. Serverless bills per vCPU-memory-hour of worker runtime; sustained workloads can cost more than well-tuned EC2 clusters (especially Spot Fleets). Serverless trades lower operational burden for fractionally higher unit cost. Long-running, 24-hour steady workloads may favor EC2. Components like HBase need long-lived clusters; Serverless can't run them. In exams: "sporadic, variable, ops-averse" = Serverless; "sustained, 24/7, special components" = EC2.

## EMR vs Glue vs Athena — Same Spark, Different Ops Models

Decision criteria in one table. Core variables: startup, ops burden, workload weight.

| Aspect | EMR (on EC2) | Glue | Athena |
|--------|--------------|------|--------|
| Engine | Full Hadoop/Spark/Hive/Presto/HBase | Serverless Spark (+ Python Shell, Ray) | Presto/Trino (SQL), Spark (analytics) |
| Ops Model | Direct cluster management | Serverless (DPU) | Fully serverless |
| Startup | 5–10 min (cluster boot) | ~1 min (warm pool: seconds) | Instant |
| Billing | Cluster uptime (EC2) | DPU-hours | S3 scan volume |
| Best For | Heavy repeat, custom tuning, special components | Light–medium ETL, catalog integration | Ad-hoc SQL, BI |
| Control | Maximum | Medium (abstracted) | Minimal (SQL only) |

Decision flow: "SQL sufficient and ad-hoc" = **Athena**. "Structured ETL but no cluster ops" = **Glue**. "Heavy repeat, custom Spark tuning, full Hive/HBase/Flink stack needed" = **EMR**. All three share Glue Data Catalog as common metastore, so the same table definition appears across all three engines.

> 🔍 **Deep Dive**: How **Glue Job Bookmark** enables incremental processing. Daily ETL that reprocesses yesterday's files wastes cost and duplicates results. Job Bookmark stores "how far we got" state (S3 object last-modified time/path, JDBC source column value) per run as checkpoint. Next run processes only new data after that mark. It's the streaming-offset-management idea adapted for batch. In exams, "daily Glue job reprocesses already-done data / want incremental only" signals Job Bookmark enable. (Antipattern: enable bookmark but write job logic that reads everything from scratch anyway—pointless.)

## Glue's Other Components — Crawler, Catalog, DataBrew

Glue isn't just ETL jobs; it's a data integration platform. **Glue Data Catalog** is a Hive Metastore-compatible metadata repository holding table schemas, partitions, locations—shared by Athena, EMR, Redshift Spectrum, and Glue (the true hub here). **Glue Crawler** scans S3 and JDBC sources, infers schemas, auto-registers tables/partitions in the catalog. **Glue DataBrew** is a code-free visual tool to craft data-cleaning/transformation recipes, letting data analysts self-serve cleaning without engineers.

> 💡 **Related Theory**: Glue Data Catalog's **Hive Metastore compatibility** is the ecosystem's linchpin. Hive Metastore (2008) standardized "what columns a table has, what file format/path" in Hadoop. AWS implemented this interface precisely, so the same Parquet file in S3 can be SQL-queried via Athena, transformed via EMR Spark, and joined via Redshift Spectrum—all as "the same table." Centralizing metadata and swappable engines builds the lakehouse architecture's foundation.

## MWAA — Orchestrate Pipelines with Airflow

Data pipelines flow ingest → store → process → ingest → analyze, with many steps holding **dependencies**. "Glue job must finish before EMR starts, then Athena CTAS runs, retry on failure, trigger at specific time." Managing dependencies, scheduling, retries, and observability is orchestration; the de facto standard is Apache Airflow. **MWAA (Managed Workflows for Apache Airflow)** is AWS's managed Airflow, handling webserver, scheduler, workers.

Airflow's core model is **DAG (Directed Acyclic Graph)**. Workflows express as "acyclic directed graphs," explicitly stating step dependencies. No cycles matter because A→B→A deadlocks forever. DAGs are Python code, so conditional branches, dynamic task generation, and external integrations flow from code's expressiveness. Rich Operator set (EMR, Glue, Athena, Step Functions, etc.) weaves multi-service pipelines in one DAG.

> 💡 **Related Theory**: DAG is computer science's universal abstraction for dependency and scheduling. Build systems (Makefile, Bazel), package resolution, Spark execution plans, even Git commit graphs are DAGs. The core operation is **topological sort**—"order as: 'run tasks whose prerequisites finished'." Airflow's scheduler does exactly this every moment: find tasks where upstream succeeded (dependencies met), queue them for execution. Cycles break topological sorts, hence "Acyclic" in DAG.

## MWAA vs Step Functions — Two Orchestration Philosophies

AWS has two orchestration tools: MWAA (Airflow) and Step Functions. Different philosophies.

| Aspect | MWAA (Airflow) | Step Functions |
|--------|----------------|----------------|
| Definition | Python DAG (code) | ASL (Amazon States Language) JSON |
| Integration | Operator ecosystem (diverse external) | 200+ AWS services natively |
| Ops | Airflow environment mgmt (managed but env cost/version) | Fully serverless, zero ops |
| Portability | Airflow OSS—on-prem, multi-cloud migration | AWS-only |
| Billing | Environment uptime (always-on cost) | State transition per execution |
| Strength | Complex data pipelines, rich community | Event-driven, serverless workflows, deep AWS integration |

Pick MWAA if: already using Airflow, need multi-cloud portability, complex Python logic, rich data Operators. Pick Step Functions if: pure AWS, serverless zero-ops, event-driven, no always-on cost. In exams: "Python DAG / Airflow migration / portability" = MWAA; "serverless / AWS deep integration / zero ops / state-transition billing" = Step Functions.

> ⚠️ **Trap**: MWAA is "managed" but not free. Airflow environment (webserver, scheduler, minimum worker) runs always, costing per-hour whether or not jobs run. Step Functions bill per state transition; no workflow execution = cost near zero. "Sporadic workload, minimize always-on cost" signals Step Functions (or EventBridge + Step Functions), not MWAA. "Complex data DAG with existing Airflow assets" is MWAA's legitimate domain.

## Versus Other Clouds — Same Engine, Different Names

This domain builds on open-source standards (Spark, Airflow, Kafka, Hive), so multi-cloud mappings are clear.

| Role | AWS | GCP | Azure |
|------|-----|-----|-------|
| Managed Spark/Hadoop cluster | EMR | Dataproc | HDInsight / Synapse Spark |
| Serverless ETL | Glue | Dataflow (Beam) / Dataproc Serverless | Data Factory / Synapse |
| Serverless SQL on object storage | Athena | BigQuery (external tables) | Synapse Serverless SQL |
| Managed Airflow | MWAA | Cloud Composer | Data Factory Managed Airflow |
| Metadata Catalog | Glue Catalog | Dataplex / Data Catalog | Purview |

Core insight: all these services wrap the same open-source (Spark, Airflow, Hive Metastore), so **maintaining catalog (metadata) standards lets you swap processing engines relatively freely**. Multi-cloud and hybrid strategies standardize on Airflow (MWAA/Composer) and Iceberg/Hive Metastore-compatible catalogs.

## Summary

EMR, Glue, Athena are **not competitors but the same Spark/Presto engine wrapped differently on a control-vs-burden axis**. EMR: full control (cluster). Glue: serverless ETL (DPU). Athena: SQL (scan billing). EMR cost optimization's heart: fill Task nodes with Spot, use Instance Fleets for Spot-interruption resilience, keep data on S3 (EMRFS) and operate transient clusters. MWAA (Airflow DAG) and Step Functions (ASL) orchestrate pipelines; former emphasizes portability, complex logic, and persistent assets; latter emphasizes serverless, AWS integration, zero ops.

SAP exam recurring mappings: (1) "EMR Task cost optimal + Spot resilient" → Instance Fleets + Spot multi-type. (2) "Kill cluster post-job to cut costs" → S3 (EMRFS) transient cluster. (3) "Variable Spark, no cluster ops" → EMR Serverless. (4) "Light ETL, no cluster ops" → Glue. (5) "Process incremental only" → Glue Job Bookmark. (6) "Python DAG, portability" → MWAA. (7) "Serverless, AWS integration, zero ops, zero always-on cost" → Step Functions. (8) "Ad-hoc SQL" → Athena. Next day covers data governance (Lake Formation) and real-time streaming (MSK).

---

## 📝 Practice Questions

**Question 1.** You batch-process petabyte-scale logs with Spark every day. The data is retained permanently in S3, and processing takes only 2-3 hours a day. How can you minimize cost while making sure jobs do not die from Spot interruptions?

A) Keep a long-running EMR cluster on On-Demand
B) A transient EMR cluster per job + Task nodes configured with Instance Fleets across multiple Spot types, terminated when finished
C) Configure all nodes (Master, Core, Task) as Spot
D) Load into Redshift and process with SQL

**Answer: B**

Explanation: Because the data is in S3, a transient cluster that is launched only for processing and terminated afterward is the most cost-optimal. Task nodes do not hold HDFS data, so they are safe against Spot interruptions, and mixing multiple instance types with Instance Fleets makes the setup robust, since if Spot capacity for one type dries up or is interrupted, other types automatically substitute. A keeps incurring cost even during idle hours. C is a fatal mistake of running Master/Core on Spot — if the Master is interrupted the whole cluster dies, and if a Core node is interrupted the HDFS data disappears. For D, there is no reason to load into a DW for batch Spark processing, and transformation flexibility is lower.

---

**Question 2.** There is a Spark job that runs a few times a day at irregular times. You do not want to size clusters or manage nodes, and you want to minimize cost when it is not running. What should you use?

A) A persistent EMR on EC2 cluster
B) EMR Serverless
C) A dedicated EMR on EKS node pool
D) Glue Crawler

**Answer: B**

Explanation: EMR Serverless has no cluster or node concept; when you submit a job it automatically launches the workers it needs and reclaims them when finished, billing only for worker run time. It eliminates capacity estimation errors and idle cost for intermittent and variable workloads. A incurs a standing cost when idle and requires sizing management. C requires managing the EKS cluster and node pool yourself, which conflicts with the condition "do not want to manage" (it is for integration in organizations already standardized on EKS). D is a tool that infers schemas and registers them in the catalog, not one that runs ETL jobs, so its purpose is different.

---

**Question 3.** A daily Glue ETL job reprocesses S3 files it already processed yesterday, raising cost and duplicating results. How can you make it process only newly arrived data?

A) Rerun the Crawler every time
B) Enable Glue Job Bookmark
C) Filter with WHERE in Athena
D) Delete old files with an S3 lifecycle policy

**Answer: B**

Explanation: Job Bookmark saves the state of "how far it has processed" as a checkpoint on each job run, and the next run processes only the new data after that (a batch version of the same idea as streaming offsets). A (Crawler) is a tool that registers schemas and partitions in the catalog and has nothing to do with incremental processing. C still reads everything each time, so it does not reduce cost. D risks data loss and does not solve the incremental processing problem.

---

**Question 4.** You need to orchestrate a data pipeline in which dozens of steps have dependencies. The team already uses Apache Airflow on premises and wants portability, considering a possible move to another cloud later. What is the most appropriate choice?

A) Step Functions (ASL)
B) MWAA
C) Glue Workflow
D) An EventBridge rule chain

**Answer: B**

Explanation: MWAA is a managed Apache Airflow service; existing Airflow DAGs (Python) can be moved almost as is, and because Airflow is OSS, portability to other clouds (such as GCP Composer) or on-premises is good. A (Step Functions) is based on ASL JSON and is tied to AWS, which conflicts with the portability condition. C (Glue Workflow) is simple orchestration centered on Glue jobs and falls short for complex multi-service DAGs and portability. D is merely simple event wiring and not a tool for orchestrating complex dependency graphs.

---

**Question 5.** You are building an event-driven workflow in a pure AWS environment. It runs only intermittently, you want no standing cost when the workflow is not running, and it must integrate closely with many AWS services. What is the most appropriate choice?

A) MWAA
B) Step Functions
C) cron + scripts on an always-on EC2
D) Jenkins on EC2

**Answer: B**

Explanation: Step Functions is fully serverless and billed per state transition, so cost approaches zero when no workflow is running, and it integrates natively with 200+ AWS services. It is optimal for event-driven, intermittent, AWS-bound environments. A (MWAA) keeps the Airflow environment (web server, scheduler) running continuously even without jobs, so hourly costs keep accruing, which is a disadvantage under the "avoid standing costs" condition. C and D require you to operate the infrastructure yourself and carry large standing costs and management burden. Trap: "intermittent + avoiding standing cost + AWS integration" is Step Functions; "complex data DAG + existing Airflow assets + portability" is MWAA.

---

**Question 6.** Data analysts want to cleanse and transform data visually without help from engineers. Which tool lets them build cleansing recipes without writing code?

A) EMR Notebooks
B) Glue DataBrew
C) Glue Job (PySpark)
D) Athena CTAS

**Answer: B**

Explanation: Glue DataBrew is a tool for creating data profiling, cleansing, and transformation recipes through a visual interface with no code (no-code), and it is optimal for data analysts to perform cleansing without engineers. A (EMR Notebooks) is Jupyter-based and requires writing code. C (Glue Job) requires writing PySpark/Scala code. D (Athena CTAS) requires writing SQL. "No-code, visual, analyst self-service" is DataBrew.

---

**Question 7.** An organization has already standardized its container platform on EKS and wants to integrate application workloads and big data Spark workloads onto the same Kubernetes resource pool, IAM, and observability tools to raise resource utilization. What is the most appropriate EMR deployment model?

A) EMR on EC2
B) EMR on EKS
C) EMR Serverless
D) Build a separate Hadoop cluster yourself

**Answer: B**

Explanation: EMR on EKS runs Spark jobs as Pods on an existing EKS cluster, so the big data team and the app team share the same K8s resource pool, IAM, and logging/monitoring, raising resource utilization. It exactly fits the integration scenario of an organization that has already standardized on EKS. A (on EC2) launches a separate dedicated EMR cluster and has no EKS integration benefits. C (Serverless) is unrelated to sharing and integrating a K8s resource pool. D gives up the benefits of managed services.

---

## 📌 Today's Summary

1. **Distributed processing history** — MapReduce (2004, disk-based) → Spark (2009, in-memory + RDD lineage). DataFrame/Catalyst faster than RDD
2. **Shuffle is the most expensive operation** — Wide transformation all-to-all communication. Reduce with broadcast join, co-location
3. **EMR node roles** — Master (never Spot), Core (HDFS, conservative), Task (Spot optimal). Cost = Task-Spot + Instance Fleets
4. **EMR deployment models** — on EC2 (full control), on EKS (K8s integrate), Serverless (variable, ops-free). S3 (EMRFS) transient cluster is cost standard
5. **EMR vs Glue vs Athena** — Same engine, control-burden axis. Full / serverless ETL / SQL
6. **Glue components** — Catalog (Hive Metastore hub), Crawler (schema infer), DataBrew (code-free), Job Bookmark (incremental)
7. **MWAA (Airflow DAG)** — Topological sort-based dependency orchestration. Portability, complex logic, always-on asset
8. **MWAA vs Step Functions** — Python DAG/portability/always-on vs ASL/AWS integrate/serverless/state-transition billing
9. **Multi-cloud map** — EMR=Dataproc=HDInsight, MWAA=Composer. Catalog standardization enables engine swaps
