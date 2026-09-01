# Day 5 - Week 1 Comprehensive Review: ML Overview & Data Engineering 1

This week laid the foundation for MLS-C01. We revisited the ML lifecycle at Specialty depth (Day 1), where to store data and in what format (Day 2), how to ingest it (Day 3), and how to label it (Day 4). Today we integrate how these pieces interlock into a single data pipeline, and consolidate the decision criteria that most often trip people up on the exam.

## The Data Engineering Pipeline at a Glance

Connecting this week's content into a single flow looks like this.

```
[Sources]  Click logs · IoT · Transactions  ──┐
                            ▼
[Ingest]   Stream? → Kinesis (Firehose = delivery / KDS = multi-consumer & replay)  (Day 3)
           Batch?  → Glue ETL / EMR / Batch
                            ▼
[Store]    S3 data lake (Parquet/RecordIO)                      (Day 2)
                            ▼
[Label]    SageMaker Ground Truth (workforce + active learning + consensus)  (Day 4)
                            ▼
[Features] Feature engineering with Glue/Processing → Feature Store
                            ▼
[Training I/O] S3 (Pipe/File/FastFile) | EFS | FSx for Lustre   (Day 2)
                            ▼
[Model]    Train → Evaluate (tie to business metrics) → Deploy → Monitor   (Day 1)
                            └──── loop back on drift ────┘
```

> 💡 **Related theory**: The principles that run consistently through this entire pipeline are **reproducibility** and **preventing training-serving skew**. Fix ingestion, cleaning, and feature logic in code, version your data, and use identical transformations in training and inference. Features improvised in a notebook or data of unknown provenance quietly break your model in production.

## Key Decision Criteria, Consolidated

Compressing the choices that most often split exam takers into one-line rules.

**Storage input mode (Day 2)**

| Situation | Choice |
|------|------|
| Large, sequential, fast start | Pipe mode |
| Small data, random access | File mode |
| Large but partial/random reads only | FastFile mode |
| Repeated, high-throughput sharing | FSx for Lustre |
| General-purpose shared file system | EFS |

**Data format (Day 2)**

| Situation | Choice |
|------|------|
| Structured data analytics/ETL, only some columns | Parquet (columnar) |
| Large-scale training with SageMaker built-in algorithms | RecordIO-protobuf |
| Millions of small files | Consolidate into large bundles via sharding |

**Ingestion service (Day 3)**

| Situation | Choice |
|------|------|
| Simple no-code delivery to S3 etc. | Kinesis Data Firehose |
| Multiple consumers, reprocessing, custom processing | Kinesis Data Streams |
| Real-time stream aggregation & anomaly detection | Managed Service for Flink |
| Schema inference & catalog | Glue Crawler |
| Serverless Spark ETL | Glue ETL Job |

**Labeling (Day 4)**

| Situation | Choice |
|------|------|
| Sensitive or regulated data | Private or Vendor workforce |
| Public, large-scale, low-cost | Mechanical Turk |
| Reducing labeling cost | Active learning (automated labeling) |
| Reducing random errors | Consensus (multiple labelers + consolidation) |

## Quick Review of Evaluation Metrics (Day 1)

```python
# Classification metric decision tree (pseudocode)
if classes_are_severely_imbalanced:
    if false_negative_cost_is_high (fraud, disease):      → prioritize recall, compare with PR-AUC
    elif false_positive_cost_is_high (spam, marketing):   → prioritize precision
    else:                                                 → PR-AUC
else:
    if threshold_undecided:                               → ROC-AUC
    else:                                                 → F1 / accuracy
```

> 💡 **Related theory**: Always beware the single-metric trap. On imbalanced data, 99.9% accuracy can be an "all negative" model. If you remember the two-stage structure — offline metrics as the deployment gate, online business metrics (A/B testing) as the final verdict — you have captured the core of Day 1.

## Mini Integrated Scenario

> **Scenario**: A global e-commerce company wants to detect fraudulent transactions from a real-time clickstream. Historical fraud labels are very scarce, and only 0.1% of transactions are fraudulent. The data contains PII.

The correct step-by-step flow:

1. **Ingest**: Multiple consumers and reprocessing are needed, so Kinesis **Data Streams** + Flink for real-time features, while simultaneously accumulating to S3 via Firehose (lambda architecture).
2. **Store**: Land in the S3 data lake as **Parquet**.
3. **Label**: PII is present, so a **Private workforce**. With few labels, gain efficiency with active learning — or if labels are too scarce, start with unsupervised anomaly detection (Random Cut Forest).
4. **Evaluate**: 0.1% imbalance + high false-negative cost → **prioritize recall, compare models with PR-AUC**.
5. **Deploy**: Validate on a small traffic share via A/B, then scale up; detect drift with monitoring.

This single scenario contains every concept from Week 1. If you can explain the reasoning behind each decision in words, you have digested the week.

> 💡 **Related theory**: In scenario questions where multiple concepts collide, "constraints" come first. PII forces the workforce, extreme imbalance forces the metric, and the multi-consumer requirement forces KDS. The correct answer is not the fanciest technology among the options, but the choice that **satisfies all constraints simultaneously**.

## Next Week Preview

Week 2 is Data Engineering 2: large-scale processing with EMR and Spark, deeper data transformation and cleaning, handling missing values, outliers, and imbalanced data, and the real techniques of feature engineering. It is the week we dig deep into the "Features" stage of the pipeline we consolidated today.

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
