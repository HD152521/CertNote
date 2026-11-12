# Day 5 - Week 2 Comprehensive Review: From Transformation to Distributed Training Data Supply

## 📌 Key Takeaways

- Week 2 covered the second axis of data engineering — **transformation → automation → augmentation → efficient supply**.
- **Glue = serverless, minimal operations**, **EMR = fine-grained control, multiple frameworks**. The decision axes are operational burden, workload type, and framework variety.
- **Step Functions = general-purpose, mixed workflows**, **SageMaker Pipelines = ML-specific, lineage**. A hybrid setup is also standard practice.
- Imbalance is handled in three layers: **data layer (SMOTE) + algorithm layer (weights, thresholds) + evaluation layer (PR-AUC)**.
- Data supply has a single goal — **making sure expensive GPUs don't sit idle waiting for I/O**.

## Week 2 Flow at a Glance

```
[Raw Data]
   │  Day 1: Transformation (ETL)
   ▼  Glue (serverless Spark) / EMR (full-control cluster)
[Cleaned and Processed Data]
   │  Day 2: Pipeline Automation
   ▼  Step Functions (general-purpose) / SageMaker Pipelines (ML-specific) + EventBridge trigger
[Reproducible Training Dataset]
   │  Day 3: Augmentation, Synthesis, Imbalance Handling
   ▼  Augmentation (flip, back-translation) / Synthesis (GAN) / SMOTE, class weights
[Sufficient and Balanced Dataset]
   │  Day 4: Storage and Access Optimization
   ▼  File/Pipe/FastFile mode / FSx for Lustre / ShardedByS3Key
[Efficiently Supplied to Training] → Model Training
```

Core message: **Data preparation doesn't end with a single transformation step.** Processing → automation → augmentation → efficient supply all directly affect model quality and cost.

## Day 1 Review — Transformation and ETL

- **ETL** = Extract → Transform → Load. In ML, the output is a training dataset.
- **AWS Glue**: Serverless Spark. Data Catalog, Crawler, ETL Job, DynamicFrame. Minimal operational burden, suitable for sporadic and standard ETL. Billing is by DPU-hour.
- **Amazon EMR**: Directly operate Hadoop/Spark/Hive/Presto on EC2 clusters. Suitable for heavy workloads requiring fine-grained tuning, multiple frameworks, and spot savings.
- **Large-scale preprocessing**: Parquet columnar format, partitioning (partition pruning), appropriate file sizes, predicate pushdown.
- **Spark intuition**: Shuffle is the most expensive operation, and skew dominates job time. Use job bookmarks for incremental processing.

> 💡 **Concept**: Three axes for the Glue vs EMR decision — operational burden (minimize → Glue), workload type (short and sporadic → Glue, long and heavy batch → EMR), framework variety (Spark only → Glue, multiple engines → EMR).

## Day 2 Review — Pipeline Automation

- **Step Functions**: General-purpose orchestrator. Define state machines with ASL (JSON). Strong for mixed ML + non-ML, approvals, external systems, and complex branching.
- **SageMaker Pipelines**: ML-specific. Python SDK. ProcessingStep/TrainingStep/TuningStep/ConditionStep/RegisterModel. Built-in lineage and model registry.
- **Selection criteria**: Pure ML CI/CD and traceability → SageMaker Pipelines; mixed ML + non-ML and approvals → Step Functions. Combined use is also possible.
- **Triggers**: EventBridge (cron/events), S3 event → start pipeline.

> ⚠️ **Pitfall**: "It's ML, so definitely SageMaker Pipelines" is an oversimplified wrong answer. If there are many non-ML steps, approvals, or complex branching, Step Functions is more suitable.

## Day 3 Review — Augmentation, Synthesis, Imbalance Handling

- **Augmentation**: Diversify existing data through label-preserving transformations. Images (flip, rotate, color jitter), text (synonym replacement, back-translation). Preserving domain meaning is essential.
- **Synthesis**: Generate new virtual data. GAN, simulation, synthetic tabular data (privacy). Risk of distribution gap → validate with real data.
- **Imbalance handling**: Data layer (over/undersampling, **SMOTE** = interpolated synthesis), algorithm layer (class weights, thresholds), evaluation layer (no accuracy → **recall, F1, PR-AUC**).

SMOTE, unlike simple duplication, creates new points by interpolating between a minority sample and its nearest neighbors. With an imbalance like 1:999, accuracy gives false reassurance, so evaluation should use recall and PR-AUC.

## Day 4 Review — Storage and Access Optimization

| Option | One-line summary | Best for |
|---|---|---|
| File mode | Full download, then start | Small scale, repeated reads |
| Pipe mode | S3 streaming, immediate start | Very large data, sequential processing |
| FastFile mode | Streaming + POSIX access | Large data + random access |
| FSx for Lustre | Ultra-fast parallel FS, S3 integration | Large scale + repeated + low latency + distributed |
| EFS | Managed NFS, multiple mounts | Shared by several jobs/notebooks |
| ShardedByS3Key | Data split and distributed per node | Data-parallel distributed training |

- Core goal: **Make sure expensive GPUs don't sit idle waiting for I/O.**
- Sharding prerequisite: The data must be divided into multiple S3 objects to be effective.
- Distributed training defaults to data parallelism (replicate the model + split the data); use model parallelism only when the model doesn't fit on a GPU.

> 🎯 **Integrated scenario**: "Several TB of data, 8 GPU nodes, startup is too slow." → Split the data into multiple Parquet shards (Day 1) → auto-generate through a pipeline (Day 2) → if imbalanced, SMOTE/weights (Day 3) → supply with ShardedByS3Key + FSx for Lustre (Day 4).

## Week 2 Service and Technique Map

| Role | Tool / technique | One line |
|---|---|---|
| Serverless ETL | AWS Glue | Spark transformations without cluster management |
| Metadata | Glue Data Catalog | Central repository for schemas, locations, partitions |
| No-code cleansing | Glue DataBrew | Visual cleansing recipes |
| Big-data cluster | Amazon EMR | Directly operate Hadoop, Spark, Hive, Presto |
| Middle option | EMR Serverless | Run just Spark jobs, no cluster |
| General orchestration | AWS Step Functions | Connect heterogeneous services with a state machine |
| ML pipeline | SageMaker Pipelines | ML-specific CI/CD, lineage built in |
| Trigger | Amazon EventBridge | Start pipelines on cron or events |
| Preprocessing execution | SageMaker Processing | Managed distributed preprocessing/evaluation jobs |
| Imbalance correction | SMOTE, class weights | Data-layer and algorithm-layer responses |
| Data supply | File / Pipe / FastFile | Startup delay vs random access |
| High-speed storage | FSx for Lustre | Repeated, high-throughput training I/O |
| Distributed allocation | ShardedByS3Key | Allocate data pieces per node |

## Complete Summary of Commonly Confused Comparison Points

| Confusing pair | Decisive difference |
|---|---|
| Glue vs EMR | Serverless, minimal operations vs full control, multiple frameworks |
| Glue Crawler vs Glue ETL Job | Schema inference and registration vs actual data transformation |
| Step Functions vs SageMaker Pipelines | General-purpose, mixed workflows vs ML-specific, lineage |
| Augmentation vs Synthesis | Transform existing data vs generate new virtual data |
| Oversampling vs SMOTE | Simple duplication vs interpolated synthesis |
| Undersampling vs class weights | Throw data away vs adjust the penalty in the loss |
| File vs Pipe vs FastFile | Full download vs streaming vs a compromise |
| FullyReplicated vs ShardedByS3Key | Full replication vs per-node splitting |
| Data parallel vs model parallel | Split the data vs split the model |
| accuracy vs PR-AUC | For balanced data vs for extreme imbalance |

The question pattern in the MLS-C01 data engineering domain is almost always a trade-off judgment of "cost / operational burden / scale / access pattern." The answer is not a single technology but **a choice matching the situation (requirements)**. The key is training to find clues in the problem such as "minimal operations," "very large data," "random access needed," and "non-ML steps included," and map them.

## Passage Clue → Answer Mapping

| Phrase in the passage | What to recall immediately |
|---|---|
| "Few operations staff," "don't want to manage clusters" | Glue or EMR Serverless |
| "Hive and Presto too," "fine-grained tuning" | Amazon EMR |
| "Cut costs with spot" | EMR task nodes |
| "Approval wait," "integration with external systems" | Step Functions |
| "Lineage," "model registry," "pure ML CI/CD" | SageMaker Pipelines |
| "Run automatically when new data arrives" | S3 event / EventBridge |
| "Positives are 0.2%," "can't catch fraud" | SMOTE/class weights + recall/PR-AUC |
| "Can't use real data because of privacy" | Synthetic data |
| "Labels must not change" | Domain-meaning-preserving augmentation |
| "GPUs wait on downloads" | Pipe/FastFile mode |
| "Repeated training on the same data" | FSx for Lustre |
| "Every node receives the whole dataset" | ShardedByS3Key |
| "The model doesn't fit in GPU memory" | Model parallelism |

## Week 2 Wrong-Answer Notes

- **An always-on EMR cluster just because the data is large** — for sporadic workloads, serverless is right.
- **The finer you split partitions, the better** — small files explode in number and it actually gets slower.
- **It's ML, so SageMaker Pipelines** — if there are many non-ML steps, use Step Functions.
- **Solving failures by increasing the retry count** — permission, path, and data problems are not fixed by retries.
- **Applying SMOTE to the validation set too** — resampling applies to the training set only. Validation must keep the real distribution.
- **Validating with synthetic data** — validation must always use real data.
- **A single giant file + ShardedByS3Key** — it can't be split by object, so there is no effect.
- **Sharding the validation channel too** — each node sees a different validation set, so the metrics diverge.

## Self-Check

Answer these in your head.

1. Few operations staff and a few standard Spark transformations a day? → **Glue serverless ETL**
2. Need Spark, Hive, and Presto together and fine-grained instance tuning? → **Amazon EMR**
3. What is the most expensive operation in a Spark job? → **Shuffle**
4. To skip data already processed and handle only new data? → **Glue job bookmarks**
5. The top-level orchestrator for a workflow mixing approval waits and Lambda post-processing? → **Step Functions**
6. Which step expresses "register the model only when accuracy is 0.85 or higher"? → **ConditionStep**
7. The technique that grows a minority class by interpolation instead of simple duplication? → **SMOTE**
8. Resampling is applied to which dataset only? → **The training set only**
9. What do you validate a model trained on synthetic data with? → **Real data**
10. To start training immediately on hundreds of GB? → **Pipe (or FastFile) mode**
11. Repeating tuning hundreds of times on the same dataset? → **FSx for Lustre**
12. The prerequisite for `ShardedByS3Key` to work? → **Data split across multiple S3 objects**
13. If the model doesn't fit in a single GPU's memory? → **Model parallelism**
14. What must always go along with long spot-instance training? → **Checkpoints**

Underlying every choice is a **trade-off of cost, operational burden, scale, and access pattern**. Next week we move into serious **modeling and algorithms** on top of this prepared data.

## 📖 Glossary

- **ETL**: Extract, transform, load. In ML, its output is the training dataset itself.
- **DPU**: Glue's unit of processing capacity. About 4 vCPU + 16 GB of memory.
- **Shuffle**: A Spark operation that redistributes data across nodes by key. The most expensive one.
- **Orchestration**: Declaratively managing the execution order, conditions, and retries of multiple steps.
- **Lineage**: A record that lets you trace which data, code, and parameters a model came from.
- **SMOTE**: Oversampling that creates new samples by interpolating between a minority-class sample and its nearest neighbors.
- **Distribution gap**: The risk that the distribution of synthetic/augmented data diverges from reality, lowering real-world performance.
- **Input mode**: How S3 data is brought into the training container. File, Pipe, FastFile.
- **ShardedByS3Key**: A setting that splits S3 objects per instance so each receives only a different piece.
- **Data parallel / model parallel**: Splitting the data and replicating the model / splitting the model itself across several GPUs.

---

## 📝 Practice Questions

**Question 1.** A team with limited operations staff runs standard Spark transformations daily and wants to build ML CI/CD that retrains a model from the results, with lineage tracking. What is the most natural combination?

A) Always-on EMR cluster + manual training  
B) Glue serverless ETL + SageMaker Pipelines  
C) Handle everything with a single Lambda function  
D) Perform even training using only Athena queries  

**Answer: B**  
Explanation: Handling the transformation with Glue serverless ETL, which minimizes operational burden, and building the retraining CI/CD with SageMaker Pipelines, which is ML-specific and has built-in lineage and a model registry, best matches the requirements (minimal operations, traceability). Always-on EMR + manual (A) has a heavy operational burden, and a single Lambda function (C) or Athena alone (D) cannot handle Spark transformations and model training.

---

**Question 2.** In extremely imbalanced data of 1:999, you want to increase the minority class by synthesizing through interpolation instead of simple duplication, and avoid false reassurance in evaluation. Which combination is appropriate?

A) SMOTE oversampling + PR-AUC evaluation  
B) Undersampling + accuracy evaluation  
C) Data duplication + accuracy evaluation  
D) Validate only with synthetic data  

**Answer: A**  
Explanation: SMOTE synthesizes new samples by interpolating between minority samples and their nearest neighbors, reducing the overfitting risk of simple duplication, and because accuracy gives false reassurance under imbalance, evaluating with PR-AUC is correct. Accuracy-based evaluation (B, C) is inappropriate under imbalance, and validation must be done with real data, so D is also wrong.

---

**Question 3.** When training on several TB of data in a data-parallel fashion across 8 nodes, you want to eliminate duplicate downloads on each node and reduce start-up delay. Which design is MOST appropriate?

A) Single huge file + FullyReplicated + File mode  
B) Read directly from DynamoDB  
C) Split into multiple files + ShardedByS3Key + (for repeated reads) FSx for Lustre  
D) Every node downloads the entire dataset  

**Answer: C**  
Explanation: The data must be split into multiple S3 objects for ShardedByS3Key to distribute across nodes effectively, and if there are many repeated reads, attaching FSx for Lustre as shared high-speed storage reduces latency. A single huge file + FullyReplicated (A) and downloading everything (D) increase duplication and start-up delay, and reading directly from DynamoDB (C) is unsuitable for supplying large-scale distributed training data.

---

**Question 4.** A data transformation workflow mixes non-ML steps (waiting for external approval, Lambda post-processing) with SageMaker training and requires complex branching and retries. Which is the most appropriate top-level orchestrator?

A) SageMaker Pipelines alone  
B) FSx for Lustre  
C) Glue Crawler  
D) AWS Step Functions  

**Answer: D**  
Explanation: Step Functions is a general-purpose orchestrator that ties together heterogeneous services such as Glue, Lambda, SageMaker, and approval waits in a state machine and handles branching and retries declaratively with Choice, Retry, and Catch, so it suits mixed ML and non-ML workflows. SageMaker Pipelines alone (A) has limited integration of non-ML steps and approvals, and Glue Crawler (C) and FSx (D) are not orchestration tools.

---

**Question 5.** When answering tool-selection questions in the MLS-C01 data engineering domain, what is the most essential decision criterion?

A) Always choose the most recently released service  
B) Make the choice that fits the requirement clues such as cost, operational burden, scale, and access pattern  
C) Always choose the most powerful (expensive) option  
D) Treat EMR as the correct answer to every question  

**Answer: B**  
Explanation: The question pattern in this domain is almost always a trade-off judgment among cost, operational burden, scale, and access pattern, and the correct answer is not a single technology but the choice that fits the requirement clues in the question ("minimal operations," "very large data," "random access required," and so on). A, C, and D, which unconditionally choose the newest, the strongest, or a particular tool, are wrong approaches that ignore fitness for the situation.

---
