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

## 📝 연습 문제

**문제 1.** 코드를 작성할 줄 모르는 데이터 분석가가 데이터를 샘플로 대화식 미리보기하며 결측값 채우기·형식 표준화를 클릭으로 적용하고, 데이터 프로파일링까지 하려고 한다. 가장 적합한 서비스는?

A) Glue ETL Job (PySpark)  
B) Glue DataBrew  
C) EMR Spark  
D) Glue 크롤러  

**정답: B**  
해설: 완전 노코드, 대화식 미리보기, 프로파일링, PII 탐지는 DataBrew의 핵심 기능이며 데이터 분석가를 주 사용자로 한다. PySpark Job과 EMR은 코드가 필요하고, 크롤러는 메타데이터 등록 도구로 변환·정제와 무관하다.

---

**문제 2.** Glue Studio에 대한 설명으로 가장 정확한 것은?

A) 드래그 앤 드롭으로 ETL을 설계하면 뒤에서 Spark 코드를 생성하며, 필요 시 코드로 직접 편집할 수 있다  
B) Recipe라는 변환 목록만 만들고 코드로 전환할 수 없다  
C) 메타데이터만 다루고 데이터는 변환하지 않는다  
D) 실시간 스트림 윈도우 집계 전용 도구다  

**정답: A**  
해설: Glue Studio는 비주얼 그래프로 ETL을 설계하면 PySpark/Scala 코드를 자동 생성하고, 양방향 전환으로 코드 편집도 가능하다. Recipe는 DataBrew 개념이고, 메타데이터 전용은 크롤러/Catalog, 스트림 윈도우 집계는 Managed Flink다.

---

**문제 3.** Glue DataBrew의 "Recipe"가 의미하는 것은?

A) 데이터가 저장된 S3 버킷  
B) Spark 클러스터의 노드 구성  
C) 적용한 변환 단계들의 순서 있는 재사용 가능한 목록  
D) IAM 권한 정책 문서  

**정답: C**  
해설: Recipe는 DataBrew에서 적용한 변환 단계(결측 채우기, 형식 변환 등)를 순서대로 기록한 재사용·버전 관리 가능한 목록이다. 샘플로 만든 Recipe를 Recipe Job으로 전체 데이터에 일괄 적용한다. 나머지는 Recipe와 무관한 개념이다.

---

**문제 4.** 데이터 엔지니어가 복잡한 조인과 분산 변환을 포함하는 프로덕션 ETL 파이프라인을 비주얼로 설계하되, 일부 변환은 커스텀 코드로 정밀 제어하고 싶다. 가장 적합한 선택은?

A) Glue DataBrew Recipe만 사용  
B) Glue Studio (비주얼 + 코드 전환)  
C) Athena 쿼리 저장  
D) QuickSight 대시보드  

**정답: B**  
해설: 프로덕션 ETL을 비주얼로 짜면서 필요 시 커스텀 코드로 전환하는 유연성은 Glue Studio의 강점이다. DataBrew는 탐색적 정제용으로 복잡한 분산 변환·파이프라인 통합에 부적합하고, Athena/QuickSight는 ETL 구축 도구가 아니다.

---

**문제 5.** Glue Studio와 DataBrew의 비용에 대한 설명으로 옳은 것은?

A) 둘 다 완전 무료다  
B) DataBrew만 유료이고 Studio는 무료다  
C) 데이터 저장 용량에만 비례한다  
D) Studio는 DPU×실행시간으로, DataBrew는 세션 시간과 Job 노드 시간으로 과금된다  

**정답: D**  
해설: Glue Studio Job은 Spark Job이므로 DPU와 실행 시간 기반으로, DataBrew는 대화식 세션 시간과 Recipe/Profile Job의 노드 시간 기반으로 과금된다. 서버리스라 클러스터 관리는 없지만 무료는 아니며, 저장 용량 단일 기준도 아니다.

---
