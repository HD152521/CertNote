# Day 3 - Query & Exploration: Athena, Redshift, EDA Basics

On Day 1 we collected data, and on Day 2 we cataloged and transformed it with Glue. Now it's time to **read and understand** the data. Before building a model, a data scientist must examine the data closely. "What's the feature distribution? Are there missing values? How does it relate to the target?" — this is **EDA (Exploratory Data Analysis)**.

Today we look at **Athena** for directly querying the data lake, the **Redshift** data warehouse, and the fundamentals of EDA, the starting point for ML.

## Amazon Athena: Querying S3 with SQL

**Athena** is a service that queries data stored in S3 using **serverless SQL**. Built on Presto/Trino, it requires no cluster provisioning. It directly uses table definitions from Glue Data Catalog.

Key characteristics:

- **Serverless**: No infrastructure management. Runs only when querying.
- **Schema-on-read**: Query data while it stays in S3, no movement.
- **Billing = data scanned**: Charged per byte scanned ($5/TB). So **minimizing scan volume directly reduces cost**.

```sql
-- Query tables directly from Glue Catalog
SELECT customer_id, AVG(amount) AS avg_amount
FROM ml_datalake.transactions
WHERE year = '2026' AND month = '06'   -- Partition filter reduces scan volume
GROUP BY customer_id
ORDER BY avg_amount DESC
LIMIT 100;
```

The `WHERE year='2026' AND month='06'` clause triggers **partition pruning**, scanning only Parquet in that partition. Combining Parquet + partitioning can reduce scan volume by orders of magnitude.

> 💡 **Related Theory**: Athena's cost being proportional to data scanned directly impacts ML data prep. (1) **Parquet/ORC** columnar formats → scan only needed columns, (2) **Partitioning** → scan only needed partitions, (3) **Compression** → reduce physical bytes. These three are Athena's cost levers. Full-scanning CSV is expensive and slow, but well-partitioned Parquet runs the same query at 1/50 cost. If you run feature extraction queries frequently, this difference compounds.

> 🔍 **Deeper Dive**: Athena suits quick feature exploration in ML workflows. Before SageMaker reads training data as Parquet from S3, an analyst uses Athena to confirm "what's the target distribution? Is there class imbalance?" via SQL. Also, **Athena CTAS (CREATE TABLE AS SELECT)** lets you save query results as Parquet to S3, directly creating training datasets.

```sql
-- Generate training dataset as Parquet via CTAS
CREATE TABLE ml_datalake.churn_training
WITH (format = 'PARQUET', external_location = 's3://ml-datalake/curated/churn/')
AS
SELECT customer_id, tenure, monthly_charges, churned
FROM ml_datalake.transactions
WHERE year = '2026';
```

## Amazon Redshift: Data Warehouse

**Redshift** is a petabyte-scale **data warehouse (OLAP)**. Data is loaded into Redshift cluster nodes (or Redshift Serverless) and complex analytical queries are processed at high speed via MPP (Massively Parallel Processing).

Core difference between Athena and Redshift:

| Aspect | Athena | Redshift |
|------|------|------|
| Model | Serverless, direct S3 query | Data warehouse (load required) |
| Data Location | S3 (no movement) | Inside cluster (or Serverless) |
| Suited For | Ad-hoc, intermittent queries, exploration | Repetitive, high-performance analysis, BI dashboards |
| Billing | Data scanned | Cluster (node-hours) or RPU |

**Redshift Spectrum** bridges the two — you can **query S3 data as external tables directly from Redshift**. Keep frequently used data inside Redshift, cold data in S3, and join via Spectrum.

In the ML integration sense, also know **Redshift ML**. Using SQL `CREATE MODEL` statement, you can call SageMaker Autopilot from within Redshift to train and infer models. Create prediction columns with just SQL, no data movement.

```sql
-- Redshift ML: Train model via SQL (internally calls SageMaker Autopilot)
CREATE MODEL churn_predictor
FROM (SELECT tenure, monthly_charges, churned FROM transactions)
TARGET churned
FUNCTION predict_churn
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftMLRole'
SETTINGS (S3_BUCKET 'ml-datalake-redshiftml');
```

> 🔍 **Deeper Dive**: Common exam comparison — "ad-hoc exploration/intermittent queries + minimal management + data stays in S3" = **Athena**. "Repetitive, high-performance BI queries + complex joins + continuous workload" = **Redshift**. "Join S3 cold data from Redshift" = **Redshift Spectrum**. "ML via SQL without data movement" = **Redshift ML**.

## EDA (Exploratory Data Analysis) Basics

Now that you can query, it's time to **understand**. EDA is the process of grasping data structure, quality, and relationships before modeling. In MLA-C01, EDA is tested as an essential step providing the foundation for feature engineering and data cleaning.

Core EDA checklist items:

| Check | Question | Action If Found |
|------|------|------|
| Distribution | How is each feature distributed? | Skew → log transform |
| Missing Values | Which columns have many nulls? | Imputation or removal |
| Outliers | Are there extreme values? | Clipping, removal, robust scaling |
| Correlation | Correlation between features/target? | Remove multicollinearity, drop meaningless features |
| Class Imbalance | Is target distribution skewed? | Over/undersampling, class weight |
| Cardinality | How many unique values in categorical columns? | Determine encoding strategy |

```python
import pandas as pd

df = pd.read_parquet("s3://ml-datalake/curated/churn/train.parquet")

# Basic statistics
print(df.describe())          # Numeric distribution (mean/std/percentiles)
print(df.isnull().mean())     # Null rate per column
print(df["churned"].value_counts(normalize=True))  # Check class imbalance
print(df.corr(numeric_only=True))  # Feature correlation matrix
```

> 💡 **Related Theory**: EDA was established in 1977 by statistician **John Tukey** in his work *Exploratory Data Analysis*. The core philosophy is "before forming hypotheses and testing them, let the data speak for itself." Visualizations like boxplots, histograms, and scatter plots are Tukey's legacy. Skipping EDA in ML risks missing class imbalance or data leakage, causing models to learn incorrect patterns.

> ⚠️ **Gotcha**: The most dangerous mistake in EDA is **data leakage**. For example, if a "payment completion date" column essentially pre-includes the "purchase made" target, validation accuracy will be 99% but deployment is useless. If EDA reveals a feature with unrealistically high correlation to the target (e.g., 0.99), suspect leakage.

The typical AWS environment for EDA is **SageMaker Studio / notebooks**. Query Athena with SQL from a notebook, or read S3 Parquet directly into pandas for analysis. For large-scale data, **SageMaker Data Wrangler** provides visual EDA and transformation together (covered in depth Week 3).

## Summary

There are two paths to reading prepared data. **Athena** (serverless, direct S3 query, billing by scan volume) is for ad-hoc exploration; **Redshift** (data warehouse, MPP) is for repetitive high-performance analysis. And before building a model, always run **EDA** to check distribution, missing values, outliers, correlations, class imbalance, and data leakage.

Next, we'll explore **storage strategies optimized for ML training — partitioning, format optimization, and training readiness considerations**.

---

## 📝 연습 문제

**문제 1.** A data scientist wants to intermittently explore Parquet data in S3 via SQL without infrastructure management. Costs should be proportional only to data scanned. Which service is most suitable?

A) Amazon Redshift provisioned cluster  
B) Amazon Athena  
C) Amazon EMR  
D) Amazon RDS  

**정답: B**  
해설: Athena is serverless, queries S3 data directly via SQL, and bills only on bytes scanned, making it ideal for ad-hoc, intermittent exploration. Redshift cluster (A) bills on node-hours and requires data loading, inefficient for intermittent use. EMR (C) has large cluster management burden, and RDS (D) is an OLTP database.

---

**문제 2.** To reduce Athena query costs, which combination most effectively reduces scan volume?

A) CSV format + single file storage  
B) Parquet format + partitioning + compression  
C) JSON format + compression  
D) Flat storage of all data in one folder  

**정답: B**  
해설: Athena bills on scan volume, so the three levers are (1) columnar Parquet to read only needed columns, (2) partitioning to scan only needed partitions, (3) compression to reduce physical bytes. CSV single file (A) or JSON (C) are row-based and inefficient, and flat storage (D) prevents partition pruning.

---

**문제 3.** A team wants to keep frequently used data in a Redshift cluster and query it without data movement against cold historical data in S3. Which feature is most suitable?

A) Redshift Spectrum  
B) Glue Crawler  
C) Kinesis Firehose  
D) DMS  

**정답: A**  
해설: Redshift Spectrum lets you query S3 data as external tables from Redshift and join with internal tables, supporting a pattern of hot data in cluster and cold data in S3 without movement. Glue Crawler (B) is for schema inference, Firehose (C) for stream loading, DMS (D) for DB replication.

---

**문제 4.** During EDA, one feature shows a suspiciously high 0.99 correlation with the target. What should you suspect first?

A) Model performance will be excellent, so use it as-is  
B) Data leakage possibility  
C) Use the feature with doubled weight  
D) Missing value problem  

**정답: B**  
해설: A feature with unrealistically high correlation to the target likely contains target information prematurely — data leakage. Training/validation show high accuracy, but deployment is useless. Using as-is (A) or increasing weight (C) worsens leakage. Missing values (D) don't explain the correlation number itself.

---

**문제 5.** You want to train a model and create prediction columns within Redshift using only SQL, without data movement. Which feature do you use?

A) Athena CTAS  
B) Redshift ML (CREATE MODEL)  
C) Glue DataBrew  
D) Redshift COPY  

**정답: B**  
해설: Redshift ML uses `CREATE MODEL` SQL statement to internally call SageMaker Autopilot for training and create prediction functions for SQL inference, performing ML via SQL alone without moving data. Athena CTAS (A) just saves query results, no training; DataBrew (C) cleans data; COPY (D) loads data.

---
