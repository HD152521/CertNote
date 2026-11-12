# Day 5 - Week 2 Comprehensive Review: From Transformation to Distributed Training Data Supply

This week covered "how to process, automate, augment, and efficiently supply data for training." This is the second axis of data engineering: **transformation and pipelines**. Today, we reconnect Days 1-4 in a single flow and clarify choice criteria that are easily confused in exams.

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
   ▼  Augmentation (flip, back-translation) / Synthesis (GAN) / SMOTE, weights
[Sufficient and Balanced Dataset]
   │  Day 4: Storage and Access Optimization
   ▼  File/Pipe/FastFile mode / FSx for Lustre / ShardedByS3Key
[Efficiently Supplied to Training] → Model Training
```

Core message: **Data preparation doesn't end with a single transformation step.** Processing → automation → augmentation → efficient supply all directly affect model quality and cost.

## Day 1 Review — Transformation and ETL

- **ETL** = Extract → Transform → Load. In ML, the output is a training dataset.
- **AWS Glue**: Serverless Spark. Data Catalog, Crawler, ETL Job, DynamicFrame. Minimal operational burden, suitable for sporadic and standard ETL. Billing is DPU-hours.
- **Amazon EMR**: Directly operate Hadoop/Spark/Hive/Presto on EC2 clusters. Suitable for heavy workloads requiring fine-tuning, multiple frameworks, and spot savings.
- **Large-scale preprocessing**: Parquet columnar format, partitioning (partition pruning), appropriate file sizes, predicate pushdown.

> 💡 **Related Theory**: Three axes for Glue vs EMR decision—operational burden (minimize→Glue), workload type (short and sporadic→Glue, long and heavy batch→EMR), framework variety (Spark only→Glue, multiple engines→EMR).

## Day 2 Review — Pipeline Automation

- **Step Functions**: General-purpose orchestrator. Define state machines with ASL (JSON). Strong for ML+non-ML mixing, approvals, external systems, and complex branching.
- **SageMaker Pipelines**: ML-specific. Python SDK. ProcessingStep/TrainingStep/TuningStep/ConditionStep/RegisterModel. Built-in lineage and model registry.
- **Selection criteria**: Pure ML CI/CD and traceability → SageMaker Pipelines; ML+non-ML mixing and approvals → Step Functions. Mixed usage is also possible.
- **Triggers**: EventBridge (cron/events), S3 events → start pipeline.

> ⚠️ **Pitfall**: "It's ML, so definitely SageMaker Pipelines" is oversimplified and incorrect. If there are many non-ML steps, approvals, or complex branching, Step Functions may be more suitable.

## Day 3 Review — Augmentation, Synthesis, Imbalance Handling

- **Augmentation**: Diversify existing data through label-preserving transformations. Images (flip, rotate, color jitter), text (synonym replacement, back-translation). Domain meaning preservation is essential.
- **Synthesis**: Generate new virtual data. GAN, simulation, synthetic tabular data (privacy). Risk of distribution gap → validation must use real data.
- **Imbalance handling**: Data level (over/undersampling, **SMOTE**=interpolated synthesis), algorithm level (class weights, thresholds), evaluation level (ban accuracy → **recall, F1, PR-AUC**).

> 💡 **Related Theory**: SMOTE, unlike simple duplication, interpolates between minority samples and nearest neighbors to create new points. In imbalance like 1:999, accuracy gives false reassurance, so evaluation should use recall and PR-AUC.

## Day 4 Review — Storage and Access Optimization

| Option | One-line Summary | Best For |
|--------|-----------------|----------|
| File mode | Full download then start | Small data, repeated reads |
| Pipe mode | S3 streaming, immediate start | Very large data, sequential processing |
| FastFile mode | Streaming + POSIX access | Large data + random access |
| FSx for Lustre | Ultra-fast parallel FS, S3 integration | Large scale + repeated + low latency + distributed |
| ShardedByS3Key | Data split and distributed per node | Data-parallel distributed training |

- Core goal: **Ensure expensive GPUs don't sit idle waiting for I/O.**
- Sharding prerequisite: Data must be divided into multiple S3 objects to be effective.

> 🎯 **Integrated Scenario**: "Multiple TBs of data, 8 GPU nodes, startup is too slow." → Divide data into multiple Parquet shards (Day 1) → auto-generate through pipeline (Day 2) → if imbalanced, use SMOTE/weights (Day 3) → supply with ShardedByS3Key + FSx for Lustre (Day 4).

## Complete Summary of Commonly Confused Comparison Points

| Confusing Pair | Core Distinction |
|---|---|
| Glue vs EMR | Serverless, minimal operations vs full control, multiple frameworks |
| Step Functions vs SageMaker Pipelines | General-purpose, mixed workflows vs ML-specific, lineage |
| Augmentation vs Synthesis | Transform existing data vs generate new virtual data |
| Oversampling vs SMOTE | Simple duplication vs interpolated synthesis |
| File vs Pipe vs FastFile | Full download vs streaming vs compromise |
| FullyReplicated vs ShardedByS3Key | Full replication vs per-node splitting |

> 💡 **Related Theory**: The question pattern in MLS-C01's data engineering section is almost always trade-off judgment of "cost/operational burden/scale/access pattern." The answer is not a single technology but **a choice matching the situation (requirements)**. The key is training to find clues like "minimal operations," "very large data," "random access needed," "non-ML steps included" in the problem and map them.

## Summary

Week 2 covered the entire process of getting data to models—transformation (Glue/EMR), automation (Step Functions/SageMaker Pipelines), augmentation (augmentation, synthesis, SMOTE), efficient supply (input modes, FSx, sharding). Underlying all choices are **trade-offs of cost, operational burden, scale, and access pattern**. Next week, we move into serious **modeling and algorithms** on top of this prepared data. I recommend reviewing the comparison tables we covered today right before the exam.

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
