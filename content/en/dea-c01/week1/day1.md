# Day 1 - What Is Data Engineering

Companies are overflowing with data. Order databases, web logs, payment events, customer inquiries, IoT sensor readings. Yet when someone actually asks for "last quarter's repeat purchase rate by region," it takes days, and the numbers come out different every time. It's not because the data doesn't exist — it's because there is no one who **moves and refines raw data scattered across multiple systems into a trustworthy, analyzable form**. That person is the data engineer.

DEA-C01 (AWS Certified Data Engineer – Associate) is the certification that asks exactly how to handle this journey — "from scattered raw data to analyzable data" — on AWS. Today we look at the role of the data engineer, the concept of a data pipeline, and the two contrasting axes that anchor every design decision: OLTP vs OLAP, and data lake vs data warehouse.

## What a Data Engineer Does

A data engineer's deliverable is neither a model nor a dashboard. It is a **pipeline** — a system that takes raw data as it arrives, automatically cleans and transforms it, and stacks it in a form that analysts, scientists, and BI tools can use immediately.

| Role | Center of Gravity | Typical Deliverables |
|------|---------|------------|
| Data Engineer | Ingestion, cleansing, reliability, scalability | Pipelines, schemas, data catalogs |
| Data Analyst | Answering questions | Dashboards, reports, SQL queries |
| Data Scientist | Prediction, modeling | Models, features, experiments |

If the analyst digs into "why did revenue drop" with SQL, the data engineer is responsible for **the plumbing underneath** that ensures the SQL always points to accurate, up-to-date data. When data arrives late, gets duplicated, or its schema breaks, every analysis upstairs silently goes wrong.

> 💡 **Related theory**: The core philosophy of data engineering is "garbage in, garbage out." No matter how sophisticated a model or dashboard is, it is meaningless if the input data is inaccurate. That is why a data engineer's number-one responsibility is not fancy transformations but **data quality and reliability**. This is exactly why DEA-C01 gives substantial weight not only to ingestion and transformation but also to data quality, monitoring, and governance.

## Data Pipelines: ETL and ELT

The flow of moving data from one place to another while refining it is called a **pipeline**. The classic form is ETL.

```
ETL (Extract → Transform → Load)
  Extract → Transform → Load
  Pull from the source → transform in the middle → put into the destination

ELT (Extract → Load → Transform)
  Extract → Load → Transform
  Pull from the source → load everything first → transform inside the destination
```

Traditional ETL finished transformations in advance on a separate server, then loaded only clean data into the warehouse — because warehouse storage and compute were expensive. But with the cloud came cheap storage like S3 and powerful query engines like Redshift and Athena, and the flow changed. **Load all the raw data first (L), then transform it inside the destination when needed (T)** — ELT became commonplace.

A typical pipeline on AWS looks like this.

```
[Source DB / logs / streams]
        │ Extract
        ▼
   [S3 raw zone]  ← store everything cheaply first
        │ Transform (Glue / EMR / Athena)
        ▼
  [S3 curated zone / Redshift]  ← analyzable form
        │
        ▼
   [QuickSight / SageMaker]  ← consumption
```

> 💡 **Related theory**: The choice between ETL and ELT is a question of "where do you transform." Because ELT preserves the raw data, you can reprocess it later when transformation logic changes without going back to the source (reprocessing). This principle of "never throw away the raw data" is the core philosophy of the data lake, which we'll see next.

## OLTP vs OLAP: Two Worlds of Processing

This is the most important contrast for understanding data systems. Even though both are called "databases," their purposes are polar opposites.

| Aspect | OLTP | OLAP |
|------|------|------|
| Purpose | Transaction processing (orders, payments) | Analytics (aggregation, trends) |
| Queries | Read and write few rows quickly | Scan and aggregate massive numbers of rows |
| Pattern | Short, frequent transactions | Long, heavy queries |
| Normalization | Highly normalized (deduplicated) | Denormalized (minimize joins) |
| AWS Examples | RDS, Aurora, DynamoDB | Redshift, Athena, EMR |

OLTP handles **a small number of rows accurately and quickly**, like "look up customer 1234's balance and deduct 10,000 won." OLAP **sweeps through hundreds of millions of rows and summarizes**, like "aggregate the last three years of regional revenue by month."

```sql
-- OLTP: exactly one row (RDS/Aurora)
UPDATE accounts SET balance = balance - 10000 WHERE account_id = 1234;

-- OLAP: aggregate hundreds of millions of rows (Redshift/Athena)
SELECT region, DATE_TRUNC('month', order_date) AS m, SUM(amount)
FROM orders
WHERE order_date >= '2023-01-01'
GROUP BY region, m;
```

One of the data engineer's common missions is to safely replicate and move data from the OLTP system (the operational DB) into the OLAP system (the analytics environment) without putting load on the OLTP system. Firing heavy aggregation queries directly at the operational DB slows down the service.

> 💡 **Related theory**: The reason OLAP uses columnar storage comes from this workload difference. Aggregation queries usually read only a few of all the columns, so storing data column by column lets you scan only the columns you need, dramatically reducing I/O. This is the background for why Redshift and Parquet are columnar. Columnar vs row-oriented storage is covered in depth on Day 4.

## Data Lake vs Data Warehouse

These are the two pillars of storage design. They are not competitors — they are usually used together.

- **Data Warehouse**: Define the schema first (schema-on-write) and load only cleansed, structured data. The strict structure makes queries fast and consistent, but unstructured data or data whose schema changes frequently is hard to handle. On AWS, this is **Redshift**.
- **Data Lake**: Store structured, semi-structured, and unstructured data alike **in its raw form** (schema-on-read), applying structure at read time. Flexible and cheap, but without management it becomes a "data swamp" no one can use. On AWS, this is **S3 + Glue Data Catalog + Athena/Lake Formation**.

```
Data warehouse: schema-on-write
  Validate schema before loading → clean but rigid

Data lake: schema-on-read
  Store everything first → apply schema at read time → flexible but needs management
```

These days the **Lakehouse** pattern, which combines the strengths of both, is the standard. It layers a table format (such as Apache Iceberg) and a catalog on top of an S3 data lake to provide warehouse-grade queries and transactions.

> 💡 **Related theory**: "Schema-on-write vs schema-on-read" is the essence of what separates the lake from the warehouse. The warehouse enforces a schema at load time, guaranteeing data quality but making it fragile to change. The lake accepts any shape at load time, so it can prepare for unknown future analyses — but without a catalog and governance it becomes ungovernable. AWS Lake Formation is precisely the service that aims to fill this governance gap.

## What DEA-C01 Asks

The exam splits the data pipeline lifecycle into four domains.

| Domain | Weight | Key Keywords |
|--------|------|------------|
| 1. Data Ingestion and Transformation | 34% | Kinesis, Glue, EMR, Lambda, ETL/ELT |
| 2. Data Store Management | 26% | S3, Redshift, partitioning, lifecycle, catalog |
| 3. Data Operations and Support | 22% | Orchestration, monitoring, automation, CloudWatch |
| 4. Data Security and Governance | 18% | IAM, KMS, Lake Formation, encryption, permissions |

The largest domain, Ingestion and Transformation (34%), shows that this is the heart of a data engineer's work. Where SAA asks "how do you design the architecture," DEA asks "**how do you ingest, store, transform, operate, and safely govern data**."

## Wrapping Up

We drew three pictures today. First, a data engineer's deliverable is a **trustworthy pipeline**, and the number-one responsibility is data quality. Second, **OLTP (transactions) and OLAP (analytics)** have opposite workloads, so their storage and query approaches differ. Third, **the data lake (schema-on-read) and the warehouse (schema-on-write)** have different storage philosophies, and the lakehouse that combines them is the modern standard.

In the next article, we look at the two processing paradigms that split based on "when and how much" data arrives — batch and streaming.

---

## 📝 Practice Questions

**Question 1.** Which pairing most accurately matches the data engineer's core deliverable with their number-one responsibility?

A) Machine learning model — prediction accuracy  
B) Data pipeline — data quality and reliability  
C) BI dashboard — visualization design  
D) Operational database — transaction speed  

**Answer: B**  
Explanation: A data engineer's deliverable is not a model or a dashboard but the pipeline that turns raw data into an analyzable form, and by the garbage in–garbage out principle, the number-one responsibility is data quality and reliability. Models belong to data scientists, dashboards to analysts, and operational DB transaction speed to backend engineers/DBAs.

---

**Question 2.** What is the key background behind ELT becoming widely used in the cloud instead of traditional ETL?

A) Because transformation logic became simpler  
B) Because cheap storage like S3 and powerful query engines made it advantageous to load raw data first and transform it inside the destination  
C) Because data security requirements disappeared  
D) Because OLTP replaced OLAP  

**Answer: B**  
Explanation: ELT loads raw data into cheap storage (S3) first, then transforms it inside the destination. Because the raw data is preserved, it can be reprocessed when transformation logic changes without re-calling the source. Transformation did not become simpler, security requirements did not disappear, and OLTP and OLAP still coexist.

---

**Question 3.** You want to run "monthly and regional revenue aggregation for the last three years" directly against a live order-processing system (OLTP). What is the biggest problem with this approach?

A) OLTP does not support SQL  
B) Heavy aggregation that scans massive numbers of rows puts load on transaction processing and slows the service  
C) OLTP data cannot be encrypted  
D) Aggregation results are always inaccurate  

**Answer: B**  
Explanation: OLTP is optimized for transaction processing that reads and writes a small number of rows quickly, so running OLAP-style aggregation that sweeps hundreds of millions of rows directly against it puts load on the production service. That is why data engineers replicate the data into an OLAP environment (Redshift/Athena, etc.) for analysis. OLTP also supports SQL and encryption, and the aggregation results themselves are accurate.

---

**Question 4.** What is the storage pattern that stores structured, semi-structured, and unstructured data in raw form using schema-on-read, and what is its representative AWS configuration?

A) Data warehouse — Redshift  
B) Data lake — S3 + Glue Data Catalog  
C) OLTP database — DynamoDB  
D) In-memory cache — ElastiCache  

**Answer: B**  
Explanation: A data lake stores data of every shape in raw form in S3 using schema-on-read, applies a schema at read time via the Glue Data Catalog, and queries it with Athena and similar tools. The warehouse (Redshift) accepts only cleansed, structured data via schema-on-write; DynamoDB is for OLTP; ElastiCache is for caching.

---

**Question 5.** Which of the four DEA-C01 domains carries the largest weight, demonstrating that it is the core of a data engineer's work?

A) Data Security and Governance  
B) Data Ingestion and Transformation  
C) Data Operations and Support  
D) Data Store Management  

**Answer: B**  
Explanation: Data Ingestion and Transformation carries the largest weight at 34%, reflecting that turning scattered raw data into an analyzable form is the data engineer's core job. Store Management (26%), Operations and Support (22%), and Security and Governance (18%) follow.

---
