# Day 5 - Week 1 Comprehensive Review: ML Overview & Data Engineering 1

## 📌 Key Takeaways

- Week 1 links **lifecycle (Day 1) → storage (Day 2) → ingestion (Day 3) → labeling (Day 4)** into a single data pipeline.
- Two principles run through the whole pipeline: **reproducibility** and **preventing training-serving skew**.
- Input modes, formats, ingestion services, and workforces are all **situational choices**; there is no absolute right answer. The key is training yourself to find the clues in the passage and map them.
- On imbalanced data, accuracy is a trap. If the cost of a missed detection is high, use recall; if the imbalance is extreme, use PR-AUC.
- In scenarios where constraints collide, the correct answer is **the choice that satisfies all constraints simultaneously**. Violating even one makes it wrong.

## The Data Engineering Pipeline at a Glance

This week's content connects in the following flow.

```
[Source]  Click logs · IoT · Transaction events  ──┐
                                          ▼
[Ingest]  Stream? → Kinesis (Firehose = delivery / KDS = multi-consumer, replay)   (Day 3)
          Batch?  → Glue ETL / EMR / Batch
                                          ▼
[Store]   S3 data lake (Parquet / RecordIO)                         (Day 2)
                                          ▼
[Label]   SageMaker Ground Truth (workforce + active learning + consensus)    (Day 4)
                                          ▼
[Features] Feature engineering with Glue/Processing → Feature Store
                                          ▼
[Train I/O] S3 (Pipe/File/FastFile) | EFS | FSx for Lustre        (Day 2)
                                          ▼
[Model]   Train → evaluate (tie to business metrics) → deploy → monitor   (Day 1)
                                          └──── drift → loop back ────┘
```

> 💡 **Concept**: The one principle that runs through this entire pipeline is **reproducibility** and **preventing training-serving skew**. Fix the ingestion, cleaning, and feature logic in code, version the data, and use the same transformations in training and inference. Features improvised in a notebook or data of unknown origin quietly ruin the model in production.

## Key Decision Criteria, Consolidated

Compressing the decisions that are confusing on the exam.

**Storage input mode (Day 2)**

| Situation | Choice |
|---|---|
| Large, sequential access, fast start | Pipe mode |
| Small, random access, simplicity first | File mode |
| Large but only partial / random access | FastFile mode |
| Repeated reads, high-throughput shared access | FSx for Lustre |
| General-purpose shared file system | EFS |

**Data format (Day 2)**

| Situation | Choice |
|---|---|
| Structured data analysis / ETL, only some columns | Parquet (columnar) |
| SageMaker built-in algorithms, large sequential | RecordIO-protobuf |
| Millions of small files | Consolidate via sharding |
| Raw logs with ragged schemas | JSON Lines → structure with Glue |

**Ingestion service (Day 3)**

| Situation | Choice |
|---|---|
| Delivery to S3 etc. without code | Kinesis Data Firehose |
| Multiple consumers, reprocessing (replay), custom processing | Kinesis Data Streams |
| Real-time aggregation / anomaly detection | Managed Service for Flink |
| Schema inference, cataloging | Glue Crawler |
| Serverless Spark ETL | Glue ETL Job |

**Labeling (Day 4)**

| Situation | Choice |
|---|---|
| Sensitive / regulated data | Private or Vendor workforce |
| Public, large-scale, low-cost | Mechanical Turk |
| Reducing labeling cost | Active learning (automated labeling) |
| Reducing random labeler errors | Consensus (multiple labelers + consolidation) |
| Everyone errs in the same direction | Clarify guidelines + golden set |

## Quick Review: Evaluation Metrics (Day 1)

```python
# Classification metric decision tree (pseudocode)
if classes_are_extremely_imbalanced:
    if cost_of_missed_detection_is_high (fraud, disease):   → recall first, compare with PR-AUC
    elif cost_of_false_alarm_is_high (spam, marketing):      → precision first
    else:                                                    → PR-AUC
else:
    if threshold_undecided:                                  → ROC-AUC
    else:                                                    → F1 / accuracy
```

| Metric | One-line summary | Clue that makes this metric the answer |
|---|---|---|
| Accuracy | Overall correct rate | Only when "classes are balanced" is stated |
| Precision | Are false alarms few? | "Must not block legitimate email," "sending cost" |
| Recall | Are misses few? | "Missing one is fatal," "fraud, disease" |
| F1 | Balance of the two | A statement that the two costs are similar |
| ROC-AUC | Threshold-independent discrimination | "We haven't set the threshold yet," "comparing models" |
| PR-AUC | Minority-class discrimination | "Positives are 0.1%," "extreme imbalance" |
| RMSE / MAE | Regression error | Continuous-value prediction, mention of outlier sensitivity |

Beware the single-metric trap. On imbalanced data, 99.9% accuracy can be an "all negative" model. Offline metrics are the gate that lets a deployment through, and online business metrics (A/B tests) deliver the final verdict. If you remember this two-stage structure, you have grasped the gist of Day 1.

## Mini Integrated Scenario

> **Scenario**: A global e-commerce company wants to detect fraudulent transactions from a real-time clickstream. Past fraud labels are very scarce, and fraud is 0.1% of all transactions. The data includes PII.

Step-by-step solution flow:

1. **Ingest** — Multiple consumers and reprocessing are needed, so use **Kinesis Data Streams** + Flink for real-time features, and at the same time load into S3 with Firehose (lambda architecture).
2. **Store** — Put it in the S3 data lake as **Parquet**.
3. **Label** — PII is present, so use a **Private workforce**. Because labels are very scarce, improve efficiency with active learning, or if even the seed is too small, start with unsupervised anomaly detection (Random Cut Forest).
4. **Evaluate** — 0.1% imbalance + high cost of missed detections → **recall first, compare with PR-AUC**.
5. **Deploy** — Validate first with an A/B test on a small share of traffic, then expand, and monitor for drift.

This single scenario contains every concept from Week 1. If you can explain the rationale for each decision in words, you have digested this week.

In constraint-collision scenarios, **constraints come first**. PII forces the workforce, extreme imbalance forces the metric, and the multi-consumer requirement forces KDS. The correct answer is not the flashiest technology but **the choice that satisfies all constraints simultaneously**. If even one is violated (for example, PII to a public workforce), the answer is wrong regardless of its other merits.

> ⚠️ **Pitfall**: Even if "the newest service," "the cheapest option," or "the simplest configuration" catches your eye among the options, all of them are wrong if they violate a constraint. Solve in this order: constraints → eliminate candidates → compare cost and operational burden among the rest.

## Comparing Confusing Pairs

| Confusing pair | Decisive difference |
|---|---|
| KDS vs. Firehose | Retention, replay, multiple consumers vs. code-free simple delivery |
| Glue Crawler vs. Glue ETL Job | Schema inference and catalog registration vs. actual data transformation |
| File vs. Pipe vs. FastFile | Start after full copy vs. start immediately via streaming vs. a compromise between the two |
| FullyReplicated vs. ShardedByS3Key | Full copy to every node vs. distributing pieces per node |
| EFS vs. FSx for Lustre | General-purpose sharing, simple setup vs. high-throughput repeated reads |
| Parquet vs. RecordIO-protobuf | Structured analysis, column selection vs. sequential streaming for built-in algorithms |
| Mechanical Turk vs. Private/Vendor | Public, high-volume, low-cost vs. sensitive data, expertise |
| Consensus vs. golden set | Canceling random errors vs. validating systematic bias and guidelines |
| ROC-AUC vs. PR-AUC | General discrimination vs. honesty under extreme imbalance |
| Batch vs. streaming | Periodic, accurate, simple vs. immediacy, high operational difficulty |

## Week 1 Mistake Notebook

Only the points where people repeatedly stumble on the exam are collected here.

- **The habit of choosing accuracy** — If you see "0.1%," "scarce," or "imbalanced" in the passage, discard it immediately.
- **"It's real time, so KDS"** — If there is one consumer and you only load, Firehose is the answer.
- **"The data is big, so EMR / a big cluster"** — If the workload is sporadic and operations staff is small, serverless is the right fit.
- **You turned on sharding and saw no effect** — If the data is a single giant file, no object-level distribution happens.
- **Mechanical Turk for sensitive data** — Choosing by unit price alone is a compliance violation.
- **Choosing supervised classification when there are no labels** — Label availability changes the problem type.
- **Deploying everything based on offline metrics alone** — You must first check online metrics with an A/B test on a small share of traffic.
- **Expecting transformation from a Glue Crawler** — The Crawler only registers the schema; it does not move or change data.

## Self-Check

Answer these in your head.

1. To distribute training of several hundred GB across 4 instances while reducing GPU idle time? → **Pipe mode + ShardedByS3Key**
2. If you repeat HPO 200 times on the same dataset? → **FSx for Lustre**
3. If you repeatedly read only 3 of 50 columns? → **Parquet**
4. If several teams consume the same stream independently and reprocessing is also needed? → **Kinesis Data Streams**
5. To view JSON logs with an unknown schema in Athena, what comes first? → **Glue Crawler**
6. Workforce for 500,000 patient X-rays? → **Private or Vendor**
7. First measure when the labeling budget is tight? → **Active learning**
8. The most honest single metric at 0.1% positives? → **PR-AUC**

## Week 1 Service Map

This gathers the services that appeared this week on one page, by role. On the exam you should be able to recall a service's place from its name alone.

| Role | Service | One line |
|---|---|---|
| Stream ingestion | Kinesis Data Streams | Shard-based, retention, replay, multiple consumers |
| Stream delivery | Kinesis Data Firehose | Delivers to S3 etc. without code, format conversion |
| Stream analytics | Managed Service for Flink | Windowed aggregation, real-time anomaly detection |
| Video ingestion | Kinesis Video Streams | Input for video ML |
| Kafka alternative | Amazon MSK | Managed Kafka |
| DB ingestion | AWS DMS | Migration + CDC |
| File transfer | AWS DataSync / Snow family | Online bulk transfer / offline physical transfer |
| Metadata | Glue Data Catalog | Central store for schema, location, partitions |
| Schema inference | Glue Crawler | Scans and registers tables |
| Serverless ETL | Glue ETL Job | Spark-based transformation |
| SQL exploration | Amazon Athena | Ad hoc queries over the catalog |
| Object storage | Amazon S3 | The foundation of the data lake |
| Shared files | Amazon EFS | Managed NFS, multiple mounts |
| High-performance files | FSx for Lustre | Repeated, high-throughput training I/O |
| Labeling | SageMaker Ground Truth | Workforce + active learning + consensus |
| Human review | Amazon A2I | Human review of low-confidence predictions in production |
| Preprocessing execution | SageMaker Processing | Managed distributed preprocessing job |
| Anomaly detection | Random Cut Forest | Produces anomaly scores without labels |

## Finding Clues in the Passage

Specialty passages always plant words that point to the answer. Memorizing the mapping below speeds up elimination.

| Expression in the passage | What to recall immediately |
|---|---|
| "Small operations staff," "minimal management overhead" | Serverless (Firehose, Glue) |
| "Multiple teams each consume," "reprocessing needed" | Kinesis Data Streams |
| "Without code," "automatic delivery" | Kinesis Data Firehose |
| "We don't know the schema" | Glue Crawler → Data Catalog → Athena |
| "The GPU is waiting for data" | Pipe/FastFile mode, FSx for Lustre |
| "Hundreds of tuning runs on the same data" | FSx for Lustre |
| "Only a few of 50 columns" | Parquet |
| "Millions of small files" | Consolidate via sharding |
| "PII," "patient," "regulated" | Private or Vendor workforce |
| "Tight labeling budget" | Active learning, transfer learning |
| "Positives are 0.1%" | PR-AUC, recall |
| "Millisecond response" | Real-time endpoint (not serverless) |
| "Nightly bulk scoring" | Batch transform |

## Next Week Preview

Week 2 moves into Data Engineering 2. We cover large-scale processing with EMR and Spark, deeper data transformation and cleaning, handling missing values, outliers, and imbalanced data, and feature engineering techniques overall. It is like zooming in on the "Features" stage of this week's pipeline.

## 📖 Glossary

- **Data lake**: A central repository that stores structured and unstructured data in bulk in its original form. Usually built on S3.
- **Reproducibility**: The property that the same input and the same code give the same result whenever you run them.
- **Training-serving skew**: An incident in which feature computation differs between training and inference, degrading production performance.
- **Drift**: A phenomenon in which the data distribution changes during operation and model performance gradually worsens. The basis for retraining triggers.
- **Input mode**: How S3 data is brought into the training container. File, Pipe, FastFile.
- **ShardedByS3Key**: A distribution setting that gives each instance only a different slice of the S3 objects.
- **Replay**: Rereading data retained in a stream from the beginning to reprocess it.
- **Active learning**: A strategy that sends only ambiguous samples to humans to reduce labeling cost.
- **PR-AUC**: The area under the precision-recall curve. The most honest metric when positives are extremely rare.
- **Constraint-collision scenario**: A problem in which conditions such as regulation, imbalance, and multiple consumers apply at once. You must choose the answer that satisfies all the constraints.

## 📝 Practice Questions

**Question 1.** You are comparing the performance of a fraud detection model where only 0.1% of transactions are fraudulent and false negatives are costly. What is the most honest single metric?

A) Accuracy  
B) PR-AUC (area under the precision-recall curve)  
C) The training loss value  
D) Processing latency  

**Answer: B**  
Explanation: Under extreme class imbalance, accuracy is meaningless — an "all legitimate" prediction already scores 99.9% — and even ROC-AUC can look optimistic. PR-AUC directly reflects the precision-recall balance on the positive class, making it the most honest metric on imbalanced data. Training loss and latency are not measures of discriminative power.

---

**Question 2.** You are distributing training of hundreds of GB of data across multiple instances, minimizing GPU idle time while having each instance read only a different slice of the data. What do you use?

A) Pipe mode + ShardedByS3Key  
B) File mode + FullyReplicated  
C) Full replication onto FSx  
D) FastFile + FullyReplicated  

**Answer: A**  
Explanation: Pipe mode streams without copying everything to disk, shortening time to first batch and minimizing GPU idle time, while ShardedByS3Key has each instance read only a distinct slice. FullyReplicated variants send the entire dataset to every instance, which is inefficient for distributed training.

---

**Question 3.** You need to label medical data containing PII while also reducing labeling labor costs. What is the most appropriate combination?

A) Mechanical Turk + exhaustive labeling  
B) Automation only, without a Vendor  
C) Public crowdsourcing + consensus  
D) Private workforce + active learning (automated labeling)  

**Answer: D**  
Explanation: Data containing PII requires a Private (or vetted Vendor) workforce for compliance, and active learning sends only ambiguous samples to humans to reduce labor cost. Mechanical Turk and public crowdsourcing are unsuitable for sensitive data, and automation alone does not work without seed labels.

---

**Question 4.** A single event stream must be used independently for a real-time dashboard, a fraud model, and later reprocessing, and replay is needed after failures. Which ingestion service fits?

A) Kinesis Data Firehose  
B) Glue Crawler  
C) Kinesis Data Streams  
D) Amazon EFS  

**Answer: C**  
Explanation: Multiple consumers consuming the same stream independently with data retention and replay is the core use case of Data Streams. Firehose is a simple delivery pipe with no retention, replay, or multi-consumer support; a Crawler is for schema inference; and EFS is file storage, unrelated to multi-consumer streaming.

---

**Question 5.** When solving a scenario question with multiple simultaneous constraints (sensitive data, extreme imbalance, multi-consumer stream), what is the correct approach?

A) Pick the newest, highest-performance technology  
B) Pick the option that satisfies all constraints simultaneously  
C) Pick the lowest-cost option  
D) Pick the simplest option  

**Answer: B**  
Explanation: In constraint-collision scenarios, PII forces the workforce, imbalance forces the metric, and the multi-consumer requirement forces KDS. The correct answer is not the fanciest, cheapest, or simplest — it is the choice that satisfies every constraint at once. Violating even one constraint (e.g., sensitive data on a public workforce) makes an option wrong regardless of its other merits.

---
