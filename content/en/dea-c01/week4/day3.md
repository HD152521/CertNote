# Day 3 - Glue Studio and DataBrew: Transform Without Code

Yesterday's Glue ETL Job is powerful, but you must write PySpark code directly. Not every data worker is proficient in Spark. Data analysts, data scientists, and business users also need to clean and transform data. AWS provides two visual/no-code tools to bridge this gap — **Glue Studio** (visual ETL) and **Glue DataBrew** (visual data cleaning). They seem similar but serve different purposes. Distinguishing this difference comes up frequently on exams.

## Glue Studio: Drag Boxes to Draw ETL Pipelines

**Glue Studio** is a visual interface that lets you build **Glue ETL Jobs via drag-and-drop graphs**. You place nodes (boxes) on a canvas and connect them, and Studio automatically generates the corresponding PySpark/Scala code behind the scenes. In other words, the result is **identical to the Glue ETL Job you learned yesterday** — you just design it as a graph instead of writing code by hand.

```
[Source: Catalog table]
        ↓
[Transform: Filter (amount > 0)]
        ↓
[Transform: Join with customers]
        ↓
[Transform: ApplyMapping]
        ↓
[Target: S3 Parquet]
```

Nodes come in three main types.

| Node Type | Role | Examples |
|-----------|------|----------|
| Source | Data input | Catalog table, S3, JDBC, Kinesis |
| Transform | Transformation | Join, Filter, ApplyMapping, Aggregate, SQL query |
| Target | Output | S3, Catalog, Redshift, JDBC |

Glue Studio's power lies in **bidirectional conversion**. You can start visually, then swap specific nodes for custom code, or open the entire script in an editor for direct modification. In other words, "start no-code → add code for precision control when needed" is possible. The output is ultimately a Spark Job billed in DPU.

```python
# Code Studio auto-generates (part of a Filter node)
filtered = Filter.apply(
    frame=source_node,
    f=lambda row: row["amount"] > 0
)
```

> 💡 **Related Theory**: Visual ETL isn't a new idea. Traditional ETL tools like Informatica, Talend, and SSIS have established the "draw data flows as graphs" paradigm for decades. Glue Studio brings this proven paradigm to serverless Spark. Expressing flows as graphs (DAGs) has an inherent advantage: data lineage becomes visually obvious, and you can verify transformation order at a glance.

## Glue DataBrew: Not Transformation, but "Cleaning and Profiling"

**DataBrew** is different. While Studio is "an ETL pipeline building tool," DataBrew is **a visual data preparation tool for data analysts**. Click to apply 250+ pre-defined transformations, preview results **instantly**, and **profile** data quality. You never write PySpark or any code.

DataBrew's core concepts are three.

| Concept | Meaning |
|---------|---------|
| Dataset | Target data (S3, Catalog, JDBC, Redshift) |
| Project | Interactive workspace to explore and transform data |
| Recipe | Ordered list of applied transformation steps (reusable, version-controllable) |
| Job | Execution that applies Recipe to all data or generates profiling |

```
Sample data preview:
1. Fill missing values in "phone" column with "UNKNOWN"  (click)
2. Lowercase "email" column                              (click)
3. Parse "date" column to standard date format           (click)
   → These 3 steps are saved as a Recipe
   → Recipe Job applies to entire dataset (hundreds of millions of rows)
```

Analysts interactively build transformations on a sample (e.g., first 500 rows), check results instantly, then apply that **Recipe** to the entire dataset in bulk. This "design on sample → apply to all" flow is DataBrew's core value.

> 🔍 **Deeper Dive**: DataBrew's **data profiling** capability goes beyond simple cleaning. Running a Profile Job automatically calculates and visualizes per-column statistics (unique count, missing ratio, min/max, distribution, correlations, anomalies). It's a diagnostic step before transformation — "how dirty is this data?" First, identify the problem. Also, DataBrew supports **automatic PII detection**, flagging columns suspected to contain personal information and letting you apply masking or hashing transformations with a click.

## Studio vs DataBrew: When to Use Which?

This is the most frequently confused part on exams. The core criteria are **user type** and **purpose**.

| Criteria | Glue Studio | Glue DataBrew |
|----------|-------------|---------------|
| Primary users | Data engineers | Data analysts/scientists |
| Purpose | Build production ETL pipelines | Exploratory data cleaning and profiling |
| Deliverable | Spark Job (code generated, operational pipeline) | Recipe (list of transformation steps) |
| Code | Optional (convertible to code) | Completely no-code |
| Strengths | Complex joins, distributed transforms, orchestration integration | Instant preview, profiling, PII detection |
| Preview | Limited | Interactive preview at every step |

Intuitively: if you're an **engineer building operational ETL pipelines**, use Studio; if you're an **analyst wanting to quickly explore and clean data**, use DataBrew. DataBrew excels at immediate feedback and profiling, while Studio excels at complex distributed transforms and pipeline integration.

> ⚠️ **Gotcha**: If you see "no-code data cleaning, instant preview, profiling," think DataBrew; if you see "visual ETL Job, code generation, production pipeline," think Studio. Both are "Glue" and "visual," so they're easy to confuse. One more thing: DataBrew Recipe Jobs also incur costs on execution (based on node/session time), and it's not "free no-code."

## Cost and Execution Models

Glue Studio Job is ultimately a Spark Job, so it's billed as **DPU × execution time**. DataBrew charges for (1) interactive session time (time spent working in a project) and (2) Recipe/Profile Job execution node time. Both are serverless so you don't need to provision clusters, but they're not free.

> 🎯 **Scenario**: A marketing analyst receives a customer CSV with inconsistent phone number formats and many missing values. Cleaning is needed before analysis, but they can't code. Architecture: (1) Register CSV as a Dataset in DataBrew → (2) Open a Project, click to fill missing values, standardize formats, and mask PII on a sample, then verify instantly → (3) Save these steps as a Recipe → (4) Apply Recipe Job to entire data, save cleaned version to S3 → (5) Analyze cleaned data with Athena/QuickSight. The analyst completes it alone without an engineer.

## Summary: The Wisdom of Tool Selection

Today's core is choosing the right tool. Glue Studio is an engineer's tool for visually building production ETL Jobs with flexibility to convert to code. DataBrew is an analyst's tool for cleaning and profiling data without code, with strengths in instant preview and PII detection. Understanding the boundary between them is critical for both exams and real work. Tomorrow we'll cover **Schema Registry and Glue Data Quality** — managing transformed data schemas and ensuring quality.

---

## 📝 Practice Questions

**Question 1.** A data analyst who cannot write code wants to interactively preview a sample of the data, apply missing-value filling and format standardization with clicks, and also perform data profiling. Which service is the most suitable?

A) Glue ETL Job (PySpark)  
B) Glue DataBrew  
C) EMR Spark  
D) Glue crawler  

**Answer: B**  
Explanation: Fully no-code operation, interactive preview, profiling, and PII detection are core features of DataBrew, whose primary users are data analysts. PySpark jobs and EMR require code, and a crawler is a metadata registration tool unrelated to transformation or cleansing.

---

**Question 2.** Which statement about Glue Studio is the most accurate?

A) When you design an ETL job with drag and drop, it generates Spark code behind the scenes, and you can edit the code directly if needed  
B) It only creates a list of transformations called a Recipe and cannot switch to code  
C) It only handles metadata and does not transform data  
D) It is a tool dedicated to real-time stream window aggregation  

**Answer: A**  
Explanation: When you design an ETL job as a visual graph in Glue Studio, it automatically generates PySpark/Scala code, and two-way switching also allows code editing. Recipe is a DataBrew concept, metadata-only is the role of the crawler/Catalog, and stream window aggregation is Managed Flink.

---

**Question 3.** What does a Glue DataBrew "Recipe" mean?

A) The S3 bucket where the data is stored  
B) The node configuration of a Spark cluster  
C) An ordered, reusable list of the transformation steps that were applied  
D) An IAM permission policy document  

**Answer: C**  
Explanation: A Recipe is a reusable, versionable list that records, in order, the transformation steps applied in DataBrew (such as filling missing values and converting formats). A Recipe created on a sample is applied in bulk to the full dataset with a Recipe job. The other options are concepts unrelated to a Recipe.

---

**Question 4.** A data engineer wants to visually design a production ETL pipeline that includes complex joins and distributed transformations, while precisely controlling some transformations with custom code. What is the most suitable choice?

A) Use only a Glue DataBrew Recipe  
B) Glue Studio (visual + code switching)  
C) Save an Athena query  
D) QuickSight dashboard  

**Answer: B**  
Explanation: The flexibility to build a production ETL visually while switching to custom code when needed is a strength of Glue Studio. DataBrew is for exploratory cleansing and is unsuitable for complex distributed transformations and pipeline integration, and Athena and QuickSight are not ETL building tools.

---

**Question 5.** Which statement about the cost of Glue Studio and DataBrew is correct?

A) Both are completely free  
B) Only DataBrew is paid and Studio is free  
C) It is proportional only to the amount of data stored  
D) Studio is billed by DPU × run time, and DataBrew is billed by session time and job node time  

**Answer: D**  
Explanation: A Glue Studio job is a Spark job, so it is billed based on DPUs and run time, while DataBrew is billed based on interactive session time and the node time of Recipe/Profile jobs. Although they are serverless and have no cluster management, they are not free, and storage capacity is not the sole billing basis.

---
