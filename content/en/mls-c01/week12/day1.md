# Day 1 - Domains 1 & 2 Integration: Data Engineering + EDA

Week 12: final review, four domains in integrated flow. Today, **Domains 1 (data eng) & 2 (EDA)** — data collected, stored, transformed, cleaned, featured into training-ready form. The pipeline **data → lake → transform → clean → visualize → ML-ready**.

## One-Sheet: Data Becomes Training-Ready

```text
[Raw sources]
   │
   ├─ 1) COLLECT/LOAD (Domain 1)
   │     Streaming → Kinesis (Streams/Firehose)
   │     Batch    → S3 + Glue catalog
   │     Migration → DMS, DataSync
   │
   ├─ 2) STORE (Domain 1)
   │     Lake = S3 (de facto standard)
   │     Query = Athena (serverless), Redshift (warehouse)
   │
   ├─ 3) TRANSFORM/ETL (Domain 1)
   │     Glue (serverless Spark) / EMR (clusters)
   │
   ├─ 4) CLEAN (Domain 2)
   │     Missing → impute/drop
   │     Outliers → clip, remove
   │     Dupe → dedupe
   │
   ├─ 5) FEATURE (Domain 2)
   │     Encode, scale, bin, PCA
   │
   └─ 6) VISUALIZE/EDA (Domain 2)
         Distribution, corr, anomaly → QuickSight
```

## Domain 1: Collection & Storage

| Task | Service | Signal |
|------|------|------|
| Real-time multi-consumer | Kinesis Streams | millisec, replay |
| Managed S3 load | Kinesis Firehose | serverless |
| S3 queries | Athena | adhoc, no cluster |
| Warehouse | Redshift | sized, persistent |
| ETL | Glue (serverless) or EMR (cluster) | scale |

**Kinesis trap**: Streams = control/replay, Firehose = complete-managed drop to S3.

## Domain 2: Clean → Feature → EDA

| Step | Handling |
|------|------|
| Missing | Drop (MCAR few%) or impute (KNN, model) |
| Outliers | IQR/Z-score detection, clip or remove |
| Imbalance | SMOTE, undersample, weights |
| Encoding | One-Hot (unordered), Label (ordered), target encode (high-cardinal) |
| Scale | StandardScaler (distance/gradient models), unnecessary for trees |
| Dimension | PCA if multicollinearity or too many features |
| EDA | Histogram, box, scatter, corr heatmap, time series → QuickSight |

**Scaler trap**: XGBoost scale-invariant. Not needed.

## Cross-Domain Decisions

| Signal | Domain 1 | Domain 2 | Choice |
|------|------|------|------|
| Real-time millisec multi-consumer | Streams ✓ | — | Streams |
| Serverless S3 ETL | Glue ✓ | — | Glue |
| Unordered categories | — | One-Hot ✓ | One-Hot |
| Trees model | — | No scale ✓ | Skip scaling |
| High cardinality | — | Target/freq encode ✓ | Target |

## Integration Example: End-to-End

User behavior data → analysis:

1. IoT → Kinesis Data Streams (multi-tenant consumers)
2. Lake → S3 (central storage)
3. Transform → Glue ETL (serverless)
4. Athena → Ad-hoc SQL (analyst queries)
5. Clean → Remove nulls, dupe (Domain 2)
6. Feature → One-Hot categories, PCA if > 100 features
7. QuickSight → Explore corr, distribution
8. Ready → ML training

## Summary

Domains 1 & 2 form "data pipeline foundation." Collect (Kinesis), store (S3), transform (Glue), clean (drop/impute/dupe), feature (encode/scale/dim-reduce), visualize (EDA). Each step builds on previous — garbage in → garbage out.

Tomorrow: Domain 3 (modeling) review.

## 📝 Practice Questions

**Question 1.** Thousands of IoT sensors send tens of thousands of events per second, and multiple independent applications read the same stream at their own different speeds and must also reprocess historical data. Which ingestion service is MOST appropriate?

A) Kinesis Data Firehose  
B) SQS standard queue  
C) Glue batch job  
D) Kinesis Data Streams  

**Answer: D**  
Explanation: When multiple consumers read independently and reprocessing within the retention period is required, Data Streams, which gives direct control over shards and the retention period, is the correct answer. Firehose (A) is a fully managed delivery service and is unsuitable for multiple custom consumers and reprocessing, SQS (B) deletes messages on consumption and is weak for reprocessing and multiple consumers, and Glue (C) is batch ETL.

---

**Question 2.** While minimizing operational burden, you want to buffer streaming data for 1 minute and deliver it to S3, with only simple format conversion before delivery. Which is MOST appropriate?

A) Kinesis Data Streams + custom Lambda consumer + direct S3 writes  
B) Always-on EMR cluster  
C) Kinesis Data Firehose  
D) Run a Redshift COPY script with cron  

**Answer: C**  
Explanation: Firehose is the fully managed service that automatically delivers to S3 once you set only the buffer size and interval, and also supports transformation. Streams + a custom consumer (A) increases operational burden, an always-on EMR cluster (B) is excessive in cost and management, and cron COPY (D) is not managed.

---

**Question 3.** You are reviewing preprocessing before training a decision-tree-based XGBoost model. Which of the following tasks has the LEAST effect and therefore the lowest priority?

A) Standardize all numeric features (StandardScaler)  
B) Impute missing values appropriately  
C) Target-encode high-cardinality categorical features  
D) Correct rows with obvious label errors  

**Answer: A**  
Explanation: Tree-based models have split criteria that are invariant to feature scale, so standardization has almost no effect. Handling missing values (B), encoding categorical features (C), and correcting labels (D) directly affect performance even in tree models.

---

**Question 4.** In EDA, the Pearson correlation coefficient of two features is 0.96. Which of the following is NOT an appropriate response for reducing multicollinearity?

A) Remove the feature with less information of the two  
B) Reduce the two features to a single principal component with PCA  
C) Keep both features as they are and apply One-Hot encoding  
D) Keep only the more interpretable one based on domain knowledge  

**Answer: C**  
Explanation: One-Hot encoding is a technique for handling categorical variables, is unrelated to multicollinearity in numeric features, and does not solve the problem. Feature removal (A), PCA reduction (B), and interpretability-based selection (D) are all valid responses to multicollinearity.

---

**Question 5.** A data analyst wants to run ad hoc queries with standard SQL on logs stored in an S3 data lake without provisioning a cluster. Which service is MOST appropriate?

A) Amazon Redshift  
B) Amazon EMR  
C) Amazon RDS  
D) Amazon Athena  

**Answer: D**  
Explanation: Athena is a serverless service that queries S3 data with standard SQL, so it is optimal for ad hoc analysis without a cluster. Redshift (A) is a warehouse that is provisioned in advance, EMR (B) is cluster-based, and RDS (C) is a relational database for transactions and is unsuitable for querying S3 directly.

---
