# Day 3 - Glue Studio and DataBrew: Transform Without Code

## 📌 Key Takeaways

- **Glue Studio** is the authoring screen for building Glue ETL Jobs (Spark) visually, as scripts, or in notebooks. The output is an ordinary Glue Job billed in DPUs.
- **DataBrew** is a no-code data preparation tool for analysts. You build a Recipe on a sample, then apply it to the full data or produce a profile with a Job.
- The dividing line between the two is the **user** (engineer vs analyst) and the **purpose** (production ETL pipeline vs exploratory cleaning and profiling).
- If you edit the script of a Studio visual Job directly and save it, the Job becomes script-only and cannot return to the visual editor.
- DataBrew is billed by interactive sessions (in 30-minute units) and Job node hours. It is no-code, not free.

## Glue Studio: Drag Boxes to Draw ETL Pipelines

Yesterday's Glue ETL Job is powerful, but you must write PySpark code directly. Not every data worker is proficient in Spark. Data analysts, data scientists, and business users also need to clean and transform data. AWS provides two visual/no-code tools to bridge this gap — **Glue Studio** (visual ETL) and **Glue DataBrew** (visual data cleaning). They seem similar but serve different purposes. Distinguishing this difference is part of the exam scope.

**Glue Studio** is a visual interface that lets you build Glue ETL Jobs as **drag-and-drop graphs**. You place nodes (boxes) on a canvas and connect them, and Studio automatically generates the corresponding PySpark/Scala code behind the scenes. In other words, the result is **identical to the Glue ETL Job you learned yesterday** — you just design it as a graph instead of writing code by hand.

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

| Node type | Role | Examples |
|-----------|------|----------|
| Source | Data input | Catalog table, S3, JDBC, Kinesis |
| Transform | Transformation | Join, Filter, ApplyMapping, Aggregate, SQL query |
| Target | Output | S3, Catalog, Redshift, JDBC |

Glue Studio's power lies in having an **exit to code**. You can start visually, then swap specific nodes for custom code, or open the entire script in the script editor and modify it directly (note, however, that a Job whose script you edit directly and save becomes script-only and cannot be returned to the visual editor). In other words, "start no-code → take precise control with code when needed" is possible. What gets generated is ultimately a Spark Job billed in DPUs.

```python
# Part of the code Studio auto-generates (Filter node)
filtered = Filter.apply(
    frame=source_node,
    f=lambda row: row["amount"] > 0
)
```

Visual ETL isn't a new idea. Traditional ETL tools like Informatica, Talend, and SSIS established the "draw data flows as graphs" paradigm decades ago. Glue Studio brings this proven paradigm to serverless Spark. Expressing flows as graphs (DAGs) has an inherent advantage: data lineage becomes visually obvious, and you can verify the transformation order at a glance.

## Glue DataBrew: Not Transformation, but "Cleaning and Profiling"

**DataBrew** is different. While Studio is "an ETL pipeline building tool," DataBrew is **a visual data preparation tool for data analysts**. You click to apply 250+ pre-defined transformations, preview the results **instantly**, and **profile** data quality. You write no code at all, let alone PySpark.

DataBrew's core concepts are as follows.

| Concept | Meaning |
|---------|---------|
| Dataset | Target data (S3, Catalog, JDBC, Redshift) |
| Project | Workspace for interactively exploring and transforming data |
| Recipe | Ordered list of the transformation steps applied (reusable, version-controllable) |
| Job | Execution that applies a Recipe to all the data or generates a profile |

```
In the sample data preview:
1. Fill missing values in the "phone" column with "UNKNOWN"  (click)
2. Lowercase the "email" column                              (click)
3. Parse the "date" column into a standard date format       (click)
   → These 3 steps are saved as a Recipe
   → A Recipe Job applies it to the entire dataset (hundreds of millions of rows)
```

Analysts interactively build transformations on a sample (e.g., the first 500 rows), check the results instantly, then apply that **Recipe** to the entire dataset in bulk. This "design on a sample → apply to everything" flow is DataBrew's core value.

DataBrew's **data profiling** capability goes beyond simple cleaning. Running a Profile Job automatically calculates and visualizes per-column statistics (unique value count, missing ratio, min/max, distribution, correlations, outliers). It is a diagnostic step before transformation: "how dirty is this data?" DataBrew also supports **automatic PII detection**, flagging columns suspected to contain personal information and letting you apply masking or hashing transformations with a click.

## Studio vs DataBrew: When to Use Which?

This is the part that is easy to confuse on exams. The core criteria are **user** and **purpose**.

| Criteria | Glue Studio | Glue DataBrew |
|----------|-------------|---------------|
| Primary users | Data engineers | Data analysts/scientists |
| Purpose | Build production ETL pipelines | Exploratory data cleaning and profiling |
| Deliverable | Spark Job (code generated, operational pipeline) | Recipe (list of transformation steps) |
| Code | Optional (can switch to code) | Completely no-code |
| Strengths | Complex joins, distributed transforms, orchestration integration | Instant preview, profiling, PII detection |
| Preview | Limited | Interactive preview of every step |

Intuitively: if you're an **engineer building operational ETL pipelines**, use Studio; if you're an **analyst wanting to quickly look into and tidy up data**, use DataBrew. DataBrew is strong at immediate feedback and profiling, while Studio is strong at complex distributed transforms and pipeline integration.

> ⚠️ **Gotcha**: If you see "no-code data cleaning, instant preview, profiling," think DataBrew; if you see "visual ETL Job, code generation, production pipeline," think Studio. Both are "Glue" and "visual," so they're easy to confuse. One more thing: DataBrew Recipe Jobs also incur costs when they run (based on node/session time), and it is not "free no-code."

## Cost and Execution Models

A Glue Studio Job is ultimately a Spark Job, so it is billed as **DPU × execution time**. DataBrew charges for (1) interactive session time (time spent opening a project and working) and (2) Recipe/Profile Job execution node time. Both are serverless so you don't need to launch clusters, but they're not free.

> 🎯 **Scenario**: A marketing analyst receives a customer CSV with inconsistent phone number formats and many missing values. Cleaning is needed before analysis, but they don't know how to code. Architecture: (1) Register the CSV as a Dataset in DataBrew → (2) Open a Project, and on a sample click to fill missing values, standardize formats, and mask PII, verifying instantly → (3) Save these steps as a Recipe → (4) Apply the Recipe Job to the entire data and save the cleaned version to S3 → (5) Analyze the cleaned data with Athena/QuickSight. The analyst completes it alone, with no engineer.

## Glue Studio, More Precisely: An Authoring Screen, Not an Execution Engine

If you understand Studio as a "separate ETL service," you will get questions wrong. Studio is the screen for creating Glue Jobs, and whichever way you create one, what runs is the Glue Job from Day 2. So worker types, Auto Scaling, Flex, Job bookmarks, and triggers/workflows all apply as they are.

| Authoring mode | Characteristics | Suited for |
|----------------|-----------------|------------|
| Visual | Draw a node graph and the script is generated automatically | Combinations of standard transformations, reviewing the flow by eye |
| Script | Write PySpark/Scala directly | Complex logic, porting existing Spark code |
| Notebook | Run cell by cell in an interactive session | Seeing results immediately during development and debugging |

- **Visual → script is a one-way street.** If you choose script editing and save, that Job becomes script-only permanently. That is why the recommended order is to finish the source, transform, and target configuration in the visual editor and move to the script only at the end.
- **The way to insert code while staying visual** is a custom code node or a SQL query node. Only one slot of the graph is filled with code, so you can keep editing the rest visually.
- **Data quality checks are also inserted as nodes.** You can place the Glue Data Quality evaluation we cover tomorrow in the middle of the visual graph and draw a flow that sends only data that passed to the target.

## How DataBrew Works: Sample → Recipe → Job

The reason DataBrew can show an instant preview on every click even for hundreds of millions of rows is that what you handle on screen is a **sample**.

- A project is a combination of a **dataset (a read-only connection to the source)** and a **Recipe**. What you see on screen is a sample of the dataset, which is the first 500 rows by default. You can choose "first n rows" or "random rows," and the size goes up to 5,000 rows.
- A larger sample represents the source better, but session startup and previews become slower.
- A Recipe is auto-saved while you work, and **publishing** it creates a version. A Job runs the published version.
- There are two kinds of Jobs.

| Job type | What it does | Result |
|----------|--------------|--------|
| Recipe Job | Applies the published Recipe to the entire dataset | Outputs cleaned data to S3, etc. |
| Profile Job | Evaluates the dataset and produces statistics | Saves a profile (column statistics, correlations, duplicate row count, etc.) to S3 |

- Jobs run in parallel on multiple nodes (5 by default; the upper limit can be adjusted in the settings). You can attach a schedule to run them periodically, so it is possible to operate it so the cleaning steps an analyst built are applied automatically every day.
- You can attach data quality rules to a Profile Job to validate along with profiling.

> ⚠️ **Gotcha**: Being clean on the sample does not mean the whole is clean. The "first 500 rows" will not catch format errors or rare outliers that appear only later in the file. Before designing the Recipe, look at the overall distribution with a Profile Job first, or switch to a random sample and check. Running the Recipe Job and then profiling the result again is part of one cycle.

## The Difference by Billing Unit

| Component | Billing unit | Where cost leaks |
|-----------|--------------|------------------|
| DataBrew interactive session | Session (30-minute units) | Leaving the project screen open and idle |
| DataBrew Recipe/Profile Job | Nodes × run time (billed per minute) | Profiling the full data more often than needed |
| Job built with Glue Studio | DPU × run time (billed per second) | Excess worker count, no timeout set |
| Studio notebook (interactive session) | DPU × session time | Not shutting down a session that is no longer used |

## Telling Similar Features Apart

| What you want to do | Tool | Difference from the one it is confused with |
|---------------------|------|---------------------------------------------|
| Skim per-column missing rate, distribution, and correlation | DataBrew Profile Job | A crawler only discovers column names and types. It does not know the distribution of values |
| Set rules, judge pass/fail on every load, and block the pipeline | Glue Data Quality | A Profile Job diagnoses the current state; Data Quality is a gate |
| Reuse cleaning steps built by clicking on other datasets | DataBrew Recipe | Studio's output is a Spark script; DataBrew's output is a Recipe |
| Design with a graph an operational ETL that involves joins and aggregation across multiple sources | Glue Studio visual Job | DataBrew centers on tidying a single dataset |
| Develop Spark code by running cells one at a time | Glue Studio notebook | DataBrew has no screen for writing code |

## Scenario Discrimination: Reading the Clues

| Clue in the answer choices | Choice |
|----------------------------|--------|
| "Without writing code," "business analyst," "instantly preview the transformation results" | DataBrew |
| "Understand how messy the data is before transforming," "column statistics" | DataBrew Profile Job |
| "Find and mask columns that look like personal information" (no-code) | DataBrew |
| "Apply the cleaning steps the analyst built to all the data every day" | DataBrew Recipe Job + schedule |
| "Design visually but do some transformations in PySpark" | Glue Studio |
| "ETL operated together with existing Job bookmarks and workflows" | Glue Studio (= Glue Job) |
| "Window aggregation on a stream" | Neither — Managed Service for Apache Flink |

Don't choose DataBrew on the clue "no-code" alone; look once more at who uses it and for what. A Studio visual Job can also be built without writing code. If it is an engineer drawing an operational pipeline without code, it is Studio; if it is an analyst looking at data and tidying it, it is DataBrew. Conversely, "instant preview" and "profiling" are clues that lean only toward DataBrew.

Tomorrow we move on to Schema Registry and Glue Data Quality, which **manage the schema of transformed data and guarantee its quality**.

## 📖 Glossary

- **Glue Studio**: The authoring screen that builds Glue ETL Jobs as visual graphs, scripts, or notebooks. What runs is an ordinary Glue Job.
- **DataBrew**: A visual data preparation tool that cleans and profiles data by clicking, without code.
- **Dataset**: A read-only connection definition for the source data DataBrew will handle.
- **Project**: DataBrew's workspace where you look at sample data and try out transformations one at a time.
- **Recipe**: A list of the applied transformation steps written down in order. Publishing it creates a version, and it can be reused on other data.
- **Recipe Job**: An execution that applies a published Recipe to the entire dataset rather than a sample and outputs the result.
- **Profiling**: Diagnosing the state of the data by extracting statistics such as per-column missing rate, unique value count, distribution, and correlation.
- **PII**: Information that can identify an individual, such as a name, phone number, or email.
- **Interactive session**: An execution environment kept up so you can work while seeing results immediately on screen. You are billed for as long as it is up.
- **Data lineage**: The path of where data came from, what transformations it went through, and where it went.

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
