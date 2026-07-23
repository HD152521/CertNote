# Day 2 - SageMaker Data Wrangler: No-Code Data Preparation

Doing scaling, encoding, and missing value handling from yesterday's lessons in pandas every time is tedious and makes transformation sequences hard to reproduce. SageMaker Data Wrangler bundles this entire flow into a visual interface. Load data, see distribution visually, stack transformations by clicking, and export to the training pipeline—all on one screen.

In the MLA-C01 exam, Data Wrangler often appears as the answer to scenarios needing "fast visual exploratory analysis and transformation." Today we cover four stages: connecting data sources, transforming, analyzing, and exporting.

## What is Data Wrangler?

Data Wrangler is a data preparation tool running inside SageMaker Studio. The core concept is **flow**. A flow is a directed acyclic graph (DAG) connecting data source → transformation stages → output, where each node is one data processing step. When users add transformations in the GUI, Data Wrangler internally generates corresponding code (pandas/PySpark).

```
[S3 Data Source]
      |
      v
[Handle Missing: median]
      |
      v
[One-Hot Encode: category]
      |
      v
[StandardScale: numeric]
      |
      v
[Output: Feature Store / S3 / Pipeline]
```

It provides 300+ built-in transformations, solving most common preprocessing without code. Custom logic can be added as Python (pandas), PySpark, or SQL code blocks.

> 💡 **Related Theory**: Data Wrangler's flow visualizes data engineering ETL/ELT pipelines. Each transformation is idempotent, and the order is fixed in the DAG, so the same input with the same transformations produces the same output. This reproducibility is ML pipeline's core value. Hand-coded notebooks have results that vary by cell execution order; flows have order fixed in the graph.

## Connecting Various Data Sources

Data Wrangler ingests directly from multiple sources. Exams often ask "where can data be loaded?"

| Data Source | Purpose |
|-----------|------|
| **Amazon S3** | Most common. CSV, Parquet, JSON, etc. |
| **Amazon Athena** | Query data on S3 via SQL, load results |
| **Amazon Redshift** | Directly from data warehouse |
| **Snowflake / Databricks** | External data platforms |
| **SageMaker Feature Store** | Reuse already-created features |

Athena integration is especially useful. Instead of downloading an entire massive S3 dataset, use SQL `WHERE` clauses to sample only needed portions. With large data, Data Wrangler works on samples and applies transformations to the full dataset later in a processing job.

> ⚠️ **Gotcha**: Data Wrangler displays **sample data** (e.g., first N rows or random sample). Preview confirms transformations work, but applying to full data requires exporting and running a SageMaker Processing Job. Even if samples look good, full data distribution might differ, so be aware of sample size and method.

## Transformation

Data Wrangler transformations move yesterday's feature engineering to GUI. Main categories:

- **Handle missing**: drop, impute (mean/median/most frequent), add missing flag
- **Encoding**: One-Hot, Ordinal, categorical handling
- **Scaling**: standardize, normalize, robust scaler
- **Numeric transform**: log/sqrt, binning
- **Text/Date**: string parsing, extract year/month/day from dates
- **Dimensionality reduction**: PCA

```python
# Transformations exported by Data Wrangler convert to code like this (conceptual)
# Actually, compose via GUI clicks, and generate notebook/script on export

from sagemaker.wrangler.processing import DataWranglerProcessor

# .flow file holds transformation definition; Processing Job applies to full data
```

Domain-specific transforms exist too: time series resampling, image augmentation, text tokenization.

> 🔍 **Deeper Dive**: Data Wrangler has a **Quick Model** feature that instantly trains an XGBoost model on current transformation results, previewing expected performance and feature importance. This fast-validates "does this transformation actually help model performance?" before full training. Also, **Target Leakage** analysis auto-detects features with leaking target info.

## Analyze

Data understanding is as important as transformation. Data Wrangler provides multiple analysis visualizations with a click.

- **Data Quality and Insights Report**: Auto-generated report on missing values, duplicates, target leakage, class imbalance, feature importance
- **Histograms/Scatter plots**: Distribution and correlation
- **Quick Model**: Instant performance estimate
- **Bias Report**: SageMaker Clarify integration for bias detection (Day 4)
- **Multicollinearity**: Check inter-variable multicollinearity

These reports automate "check data dictionary, understand missing mechanisms, detect outliers" from yesterday. The Data Quality report especially helps grasp the full picture early in preparation.

> 📚 **Case Study**: A team building churn prediction included "last login date," but later found this column filled only for churned customers (recorded at churn time). Data Wrangler's Target Leakage analysis caught this feature's abnormally high predictive power, discovering leakage early. Keeping the leaky feature would've given 99% validation accuracy but useless real-world performance.

## Export

After completing a flow, export to various targets. Exams test understanding export options.

| Export Target | Meaning |
|------------|------|
| **SageMaker Processing Job** | Execute batch transformation on full data |
| **SageMaker Feature Store** | Load processed features into Feature Store (Day 3) |
| **SageMaker Pipelines** | Integrate transformation as pipeline stage |
| **Python Code / Jupyter Notebook** | Extract transformation logic for reuse |
| **S3** | Save processing results to S3 |

The key: **Data Wrangler itself is a preview/design tool**, while actual large-scale processing runs via exported Processing Job. The flow (`.flow` file) is the blueprint of transformations; re-running applies the same transformations to new data, guaranteeing reproducibility.

> 💡 **Related Theory**: The flow → Feature Store → Pipelines sequence implements MLOps's "feature pipeline." Making data prep a version-controlled, re-runnable pipeline step instead of one-off notebook work ensures the same transformations apply at training and inference time (preventing training/serving skew). This connects to Day 3's Feature Store consistency.

## Data Wrangler vs Other Tools

When to choose Data Wrangler is the exam point. **Fast visual exploration and transformation prototyping** = Data Wrangler. But **large-scale distributed ETL** needs AWS Glue (Spark) or EMR better; **pure SQL transformation** = Athena; **already-working code pipeline** = direct SageMaker Processing Job. Data Wrangler's strength is the "exploration and design" stage via GUI, visualization, instant model validation.

## Summary

Remember Data Wrangler in four steps: ① **Connect sources** (S3, Athena, Redshift, Snowflake, Feature Store), ② **Transform** (300+ built-in, custom code possible), ③ **Analyze** (Data Quality report, Quick Model, Target Leakage, Bias), ④ **Export** (Processing Job, Feature Store, Pipelines, code). Screen data is sample; Processing Job applies to full dataset. Flow ensures reproducibility.

Next, we explore SageMaker Feature Store for storing, sharing, and consistently serving processed features.

---

## 📝 연습 문제

**문제 1.** A data scientist wants to design preprocessing by clicking GUI alone for missing imputation, One-Hot encoding, scaling, and visualizing distribution quickly. Most suitable tool?

A) SageMaker Data Wrangler  
B) Amazon Redshift  
C) AWS Lambda  
D) Amazon Kinesis  

**정답: A**  
해설: Data Wrangler provides 300+ transformations via GUI clicks, visual distribution checks, and no-code fast preprocessing design. B is data warehouse, C serverless compute, D real-time streaming—none for visual data prep.

---

**문제 2.** Transformations previewed on screen look good in Data Wrangler. To apply them to hundreds of GB of full dataset?

A) Screen results already apply to full dataset; no extra work  
B) Export flow as SageMaker Processing Job, run on full data  
C) Re-upload data  
D) Re-enter transformations manually one by one  

**정답: B**  
해설: Screen data is sample only; export flow to Processing Job for batch execution on full data. A assumes sample=full (wrong), C/D bypass export without efficiency.

---

**문제 3.** Data Wrangler warns "last payment date" feature predicts target abnormally well. Which analysis caught this, and what suspect?

A) Quick Model—data insufficiency  
B) Target Leakage analysis—target info leaked into features  
C) Histograms—distribution distortion  
D) PCA—excess dimensions  

**정답: B**  
해설: Target Leakage analysis detects abnormally high predictive features as target info leakage. Offline high accuracy becomes useless at inference when that info is unavailable. A estimates performance, C visualizes, D reduces dimensionality—not for leakage.

---

**문제 4.** Want to load selective portions of huge S3 datasets via SQL condition in Data Wrangler. Most suitable source connection?

A) Amazon Athena queries S3 data via SQL, load results  
B) Download entire S3 file locally  
C) Lambda read row-by-row  
D) CloudFront cache  

**정답: A**  
해설: Athena queries S3 with SQL WHERE for efficient selective loading, ideal for large dataset sampling. B costly/slow, C unsuitable for ML loading, D is content delivery cache, not data query.

---

**문제 5.** Want to reuse Data Wrangler preprocessing flow identically for training/inference to prevent training/serving skew. Most appropriate export strategy?

A) Copy flow to notebook manually each time  
B) Export flow to SageMaker Pipelines stage or Feature Store for reproducible pipeline integration  
C) Capture transformation results as image  
D) Skip transformations, use raw data  

**정답: B**  
해설: Exporting to Pipelines or Feature Store version-controls and reproducibly applies identical transformations at training and inference, preventing skew. A loses reproducibility, C only has result image not logic, D skips preprocessing.

---
