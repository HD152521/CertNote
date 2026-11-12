# Day 2 - SageMaker Data Wrangler: No-Code Data Preparation

## 📌 Key Takeaways

- Data Wrangler is a data preparation tool that bundles four stages into a GUI: **connect source → transform → analyze → export**.
- The core concept is the **flow** — it leaves the transformation steps as a DAG with a fixed order, which guarantees reproducibility.
- The data you see on screen is a **sample**. Applying to the full data is done by the exported **Processing Job**.
- **Data Quality report, Quick Model, and Target Leakage analysis** catch data problems before training.
- Exporting to Pipelines or Feature Store lets training and inference use the same transformation, preventing **training/serving skew**.

## What Is Data Wrangler

Hand-coding yesterday's scaling, encoding, and missing value handling in pandas every time takes a long time, and it is hard to reproduce the order of the transformations you applied. Data Wrangler is a built-in SageMaker Studio tool that bundles this whole flow into a visual interface.

The core is the concept of a **flow**. A flow is a directed graph (DAG) running from the data source → transformation steps → output, in which each node is one data processing step. When the user adds a transformation in the GUI, Data Wrangler internally generates the corresponding code (pandas/PySpark).

```
[S3 data source]
      |
      v
[Missing value imputation: median]
      |
      v
[One-Hot encoding: category]
      |
      v
[StandardScaler: numeric]
      |
      v
[Output: Feature Store / S3 / Pipeline]
```

It provides more than 300 built-in transformations, so most common preprocessing is solved without code. If you need custom logic, you can also insert Python (pandas), PySpark, or SQL code blocks directly.

**Difference from hand-coding in a notebook**

| Category | Hand-coding in a notebook | Data Wrangler flow |
|------|-------------|-------------------|
| Transformation order | Depends on the cell execution order | Fixed in the graph |
| Reproducibility | Low (who ran it in what order?) | High (the flow file is the blueprint) |
| Exploration speed | Needs time to write code | Instant with clicks |
| Large-scale application | Implement distributed processing yourself | Processing Job export |
| Quality checks | Write the code yourself | Automatic reports provided |

A Data Wrangler flow is a visualization of a data engineering ETL/ELT pipeline. Because each transformation is idempotent and expressed as a DAG with a clear order, applying the same transformation to the same input always produces the same output. This reproducibility is the core value of an ML pipeline. A hand-coded notebook gives different results depending on the cell execution order, but in a flow the order is fixed in the graph.

## Connecting Various Data Sources

Data Wrangler imports data directly from several sources. The exam has questions asking "where can data be loaded from."

| Data source | Use | Strength |
|-----------|------|------|
| **Amazon S3** | Most common. CSV, Parquet, JSON, etc. | Directly tied to the data lake |
| **Amazon Athena** | Queries data on S3 with SQL and loads the result | Only the needed part via `WHERE` |
| **Amazon Redshift** | Directly from the data warehouse | Already-refined structured data |
| **Snowflake / Databricks** | External data platforms | Multi-platform environments |
| **SageMaker Feature Store** | Reuse features already built | Leverage assets shared across teams |

The Athena integration is especially useful. Without downloading an entire huge S3 dataset, you can sample and load only the needed part with a SQL `WHERE` clause.

> ⚠️ **Trap**: The data you see in Data Wrangler is by default a **sample** (the top N rows or a random sample). Even if you confirm a transformation in the on-screen preview, to apply it to the actual full data you must export it and run it as a SageMaker Processing Job. Even if it looks fine on the sample, the result can differ if the distribution of the full data is different, so you need to be aware of the sample size and method.

## Transform

Data Wrangler's transformations are the feature engineering you learned yesterday moved into a GUI.

| Category | Representative transformations | Corresponding feature engineering |
|---------|----------|------------------|
| Missing value handling | drop, impute (mean/median/most frequent), missing flag | Imputation strategies |
| Encoding | One-Hot, Ordinal, categorical handling | Nominal/ordinal encoding |
| Scaling | standardize, normalize, robust scaler | The three scalers |
| Numeric transformation | log/square root, binning | Skew correction, binning |
| Text/date | String parsing, extracting year/month/day from dates | Derived feature creation |
| Dimensionality reduction | PCA | High-dimensional compression |
| Domain-specific | Time series resampling, image augmentation, text tokenization | — |

```python
# Data Wrangler transformations are composed by clicking in the GUI
# and generated as a notebook/script/Processing Job definition on export (concept)
#
# The .flow file holds the transformation definition, and a Processing Job applies it to the full data.
#   flow (blueprint)  →  export  →  Processing Job (runs on the full data)
```

Data Wrangler has a feature called **Quick Model** that instantly trains a tree-based model on the transformation results so far and shows the expected performance and feature importance in advance. This lets you quickly verify "does this transformation actually help model performance" before full-scale training. It also automatically detects features that leak target information through **Target Leakage** analysis.

## Analyze

As important as transformation is understanding the data. Data Wrangler provides several analysis visualizations with a single click.

| Analysis feature | What it tells you | Follow-up action |
|----------|---------------|-------------|
| **Data Quality and Insights Report** | Missing values, duplicates, target leakage, class imbalance, feature importance | Grasp the whole picture, then decide priorities |
| **Histogram/scatter plot** | Distribution and correlation | Decide on log transform and outlier handling |
| **Quick Model** | Instant performance estimate and feature importance | Drop meaningless features |
| **Target Leakage** | Features that leak target information | Remove those features |
| **Bias Report (Clarify integration)** | Bias by sensitive attribute | Re-collect or resample data (Day 4) |
| **Multicollinearity** | Multicollinearity among variables | Clean up redundant features |

These reports automate what you learned yesterday: "check the data dictionary, understand the missingness mechanism, detect outliers."

One team was building a churn prediction model and included a "last login date" feature, but it turned out that only customers who had churned had this value filled in (it was recorded at the time of churn). Data Wrangler's Target Leakage analysis caught this feature's abnormally high predictive power and uncovered the leakage in advance. Had the leaking feature been left in, offline validation accuracy would have been 99%, but it would have been useless in the live service.

## Export

Once the flow is complete, you can export it to several destinations. The exam has questions that distinguish the export options.

| Export target | Meaning | When to choose it |
|------------|------|------------|
| **SageMaker Processing Job** | Run a batch job that applies the transformations to the full data | Apply the sample-designed flow to everything |
| **SageMaker Feature Store** | Load the processed features into the Feature Store (Day 3) | Cross-team reuse, training/inference consistency |
| **SageMaker Pipelines** | Integrate the transformations as an ML pipeline step | Build an automatic retraining pipeline |
| **Python code / Jupyter Notebook** | Extract the transformation logic as code for reuse | Integrate into an existing codebase |
| **S3** | Save the processed result to S3 | Simple result storage |

**Data Wrangler itself is a preview/design tool**, and the actual large-scale processing is carried out by the exported Processing Job. The flow (`.flow` file) is a blueprint holding the transformation definition, and re-running it applies the same transformation to new data too, which guarantees reproducibility.

```
                    ┌──> Processing Job ──> Apply transformations to the full data
                    │
[.flow blueprint] ──┼──> Feature Store ───> Training and inference share the same features
                    │
                    ├──> Pipelines ───────> Incorporated as an automatic retraining step
                    │
                    └──> Python/Notebook ─> Extracted as code and managed directly
```

The flow from Data Wrangler → Feature Store → Pipelines implements the MLOps "feature pipeline." If you make data preparation not a one-off notebook task but a version-controlled, re-runnable pipeline step, the same transformation is applied at training time and at inference time (preventing training/serving skew). This ties directly to the Feature Store consistency in Day 3.

## Data Wrangler vs Other Tools

When to choose Data Wrangler is an exam point.

| Requirement | Correct tool | Reason |
|---------|----------|------|
| Fast visual exploration and transformation prototyping | **Data Wrangler** | GUI, visualization, instant model validation |
| Large-scale distributed ETL | AWS Glue (Spark) / EMR | Distributed processing engines are their core job |
| Pure SQL transformation | Athena (CTAS) | SQL alone is enough |
| A pipeline already well organized as code | SageMaker Processing Job directly | GUI steps are unnecessary |
| No-code + data profiling (outside ML) | Glue DataBrew | General-purpose cleaning for analysts |

Data Wrangler's strength lies in the "exploration and design" stage: GUI, visualization, and instant model validation.

> ⚠️ **Trap**: If you see the phrase "process hundreds of GB with Data Wrangler," what is exactly happening is **exporting the flow as a Processing Job to process it**. You must distinguish that the Data Wrangler screen itself does not process large volumes.

## Managing the Gap Between the Sample and the Full Data

What Data Wrangler handles on screen is a sample. The points where this fact causes problems in practice are well defined.

| What is not visible in the sample | What happens when applied to everything | Prevention |
|--------------------|---------------------|------|
| Rare category values | Categories never seen before appear during encoding | `handle_unknown` handling, check the category list |
| Minority class | Underestimates the degree of imbalance | Check the full class distribution with Athena first |
| Outliers in a particular period | Scaler statistics change | Sample so that periods are evenly included |
| Seasonality in the missingness pattern | The imputation strategy goes off | Check the overall missing rate with a separate query |

- With an Athena source, you can use `WHERE` to adjust the period and conditions to build a representative sample.
- The final judgment is always made from the result of running the full data through a Processing Job.

## Reproducibility Lineage of the Preprocessing Pipeline

```
[.flow file]        ← Transformation definition (blueprint). Subject to version control
     │ export
     v
[Processing Job]    ← Actually applied to the full data
     │ output
     v
[Feature Store]     ← Store that training and inference read together
     │
     └─> [Pipelines] When incorporated as a step, the same transformation is applied automatically at every retraining
```

The place where this lineage breaks is exactly the place where skew arises.

| How the lineage breaks | Result |
|------------------|------|
| The flow is not exported and is moved by hand into a notebook | Order and parameters differ subtly |
| The inference server implements preprocessing separately | training/serving skew |
| The transformation definition is not version-controlled | Past models cannot be reproduced |
| Processing Job results are saved to a temporary path | Cannot trace which data was used for training |

The statement "I preprocessed with Data Wrangler" alone does not guarantee reproducibility. Only when you **export the flow and pin it as a pipeline step** do training and inference use the same transformation.

## One-Line Tool Selection Summary

| Clue in the question | Answer |
|----------|------|
| "Without code", "visually", "explore quickly" | Data Wrangler |
| "Data quality, leakage, and imbalance as an automatic report" | Data Wrangler analysis features |
| "Actually apply the transformation to hundreds of GB" | Export to a Processing Job |
| "Make training and inference use the same transformation" | Export to Feature Store / Pipelines |
| "Large-scale distributed ETL is the core job" | Glue Spark / EMR |
| "Transform with SQL only" | Athena CTAS |

In the next lesson we look at SageMaker Feature Store, which stores the processed features and serves them in a reusable and consistent way.

## 📖 Glossary

- **Data Wrangler** : A data preparation tool inside SageMaker Studio for loading data and transforming and analyzing it by clicking.
- **flow** : A graph running from the source through the transformations to the output. It fixes the transformation order to create reproducibility.
- **DAG (directed acyclic graph)** : A task graph whose arrows flow in only one direction and never loop back.
- **Idempotent** : The property that applying the same processing to the same input any number of times gives the same result.
- **Sample** : A subset of rows rather than the whole. The Data Wrangler screen shows a sample by default.
- **Processing Job** : A SageMaker batch job that applies preprocessing to the full data. The actual executor of a flow.
- **Data Quality and Insights Report** : A report that automatically extracts missing values, duplicates, leakage, imbalance, and feature importance.
- **Quick Model** : A feature that instantly trains a model on the current transformation state and shows performance and feature importance in advance.
- **Target Leakage analysis** : A diagnosis that finds features into which target information has leaked, by their abnormally high predictive power.
- **Feature importance** : The degree to which each feature contributed to the prediction.

## 📝 Practice Questions

**Question 1.** A data scientist wants to design preprocessing by clicking GUI alone for missing imputation, One-Hot encoding, scaling, and visualizing distribution quickly. Most suitable tool?

A) SageMaker Data Wrangler  
B) Amazon Redshift  
C) AWS Lambda  
D) Amazon Kinesis  

**Answer: A**  
Explanation: Data Wrangler provides 300+ transformations via GUI clicks, visual distribution checks, and no-code fast preprocessing design. B is data warehouse, C serverless compute, D real-time streaming—none for visual data prep.

---

**Question 2.** Transformations previewed on screen look good in Data Wrangler. To apply them to hundreds of GB of full dataset?

A) Screen results already apply to full dataset; no extra work  
B) Export flow as SageMaker Processing Job, run on full data  
C) Re-upload data  
D) Re-enter transformations manually one by one  

**Answer: B**  
Explanation: Screen data is sample only; export flow to Processing Job for batch execution on full data. A assumes sample=full (wrong), C/D bypass export without efficiency.

---

**Question 3.** Data Wrangler warns "last payment date" feature predicts target abnormally well. Which analysis caught this, and what suspect?

A) Quick Model—data insufficiency  
B) Target Leakage analysis—target info leaked into features  
C) Histograms—distribution distortion  
D) PCA—excess dimensions  

**Answer: B**  
Explanation: Target Leakage analysis detects abnormally high predictive features as target info leakage. Offline high accuracy becomes useless at inference when that info is unavailable. A estimates performance, C visualizes, D reduces dimensionality—not for leakage.

---

**Question 4.** Want to load selective portions of huge S3 datasets via SQL condition in Data Wrangler. Most suitable source connection?

A) Amazon Athena queries S3 data via SQL, load results  
B) Download entire S3 file locally  
C) Lambda read row-by-row  
D) CloudFront cache  

**Answer: A**  
Explanation: Athena queries S3 with SQL WHERE for efficient selective loading, ideal for large dataset sampling. B costly/slow, C unsuitable for ML loading, D is content delivery cache, not data query.

---

**Question 5.** Want to reuse Data Wrangler preprocessing flow identically for training/inference to prevent training/serving skew. Most appropriate export strategy?

A) Copy flow to notebook manually each time  
B) Export flow to SageMaker Pipelines stage or Feature Store for reproducible pipeline integration  
C) Capture transformation results as image  
D) Skip transformations, use raw data  

**Answer: B**  
Explanation: Exporting to Pipelines or Feature Store version-controls and reproducibly applies identical transformations at training and inference, preventing skew. A loses reproducibility, C only has result image not logic, D skips preprocessing.

---
