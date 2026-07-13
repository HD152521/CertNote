# Day 2 - Glue ETL Job: Transform Data on Spark

The Data Catalog we created yesterday only knows "where the data is and what it looks like." But the essence of data engineering is to **transform** that data. Taking dirty CSV and turning it into clean Parquet, combining scattered tables into joined fact tables, converting raw logs into aggregated metrics. The way to run these transformations serverlessly is with **AWS Glue ETL Job**.

Internally, Glue ETL Job runs **Apache Spark**. In other words, Glue is a "managed Spark." Unlike EMR, where you provision and terminate clusters directly, Glue automatically provisions the Spark environment when you submit a Job and reclaims resources when it finishes. The billing unit is **DPU (Data Processing Unit)**—1 DPU = 4 vCPU + 16GB memory. You're charged based on execution time (in seconds).

## DynamicFrame: Extending Spark DataFrame for ETL

If you've used Spark, you're familiar with **DataFrame**. Glue adds another layer on top with a data structure called **DynamicFrame**. Why was another abstraction needed?

| Item | Spark DataFrame | Glue DynamicFrame |
|------|-----------------|-------------------|
| Schema | Must be fixed in advance | Schema inference, self-describing |
| Type conflicts | Errors or forced casting | Preserves both types with Choice type |
| Dirty data | Hard to handle | Built-in ETL transformations (ResolveChoice, etc.) |
| Catalog integration | Separate work | Native integration |

The key difference is **schema flexibility**. Real-world data is messy. The same column might be an integer in one row and a string in another. DataFrame breaks on such conflicts, but DynamicFrame preserves both types in a **Choice type**, then lets you decide how to resolve it later with `ResolveChoice` transformation. Since ETL is about dealing with "unexpected data," this flexibility is valuable.

```python
import sys
from awsglue.context import GlueContext
from awsglue.transforms import ResolveChoice, ApplyMapping
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# Source: Create DynamicFrame from Catalog table
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders"
)

# Resolve type conflicts (Choice): cast everything to string
resolved = ResolveChoice.apply(
    frame=orders,
    choice="cast:string"
)
```

> 💡 **Related Theory**: DynamicFrame implements "schema-on-read" at the code level. Traditional ETL tools require you to define mappings strictly in advance (schema-on-write approach), but ETL in the data lake era follows the ELT/schema-on-read philosophy: "accept the data first, then refine it during transformation." DynamicFrame's Choice type and ResolveChoice mechanism realize this philosophy on top of Spark. You can freely switch to DataFrame with `.toDF()` and back to DynamicFrame with `.fromDF()` if needed.

## ETL's 3 Stages: Source → Transform → Sink

Every Glue Job is ultimately a combination of three stages.

```
[Source]  Read data from Catalog/S3/JDBC and create DynamicFrame
   ↓
[Transform]  Mapping, filtering, joining, aggregating, type resolution
   ↓
[Sink]  Record results to S3/Catalog/Redshift/JDBC
```

```python
# Transform: Column mapping/renaming/type conversion
mapped = ApplyMapping.apply(
    frame=resolved,
    mappings=[
        ("order_id", "string", "id", "long"),
        ("amount",   "string", "amount", "double"),
        ("status",   "string", "status", "string"),
    ]
)

# Sink: Partition and write to S3 as Parquet
glueContext.write_dynamic_frame.from_options(
    frame=mapped,
    connection_type="s3",
    connection_options={
        "path": "s3://my-lake/orders-clean/",
        "partitionKeys": ["status"]
    },
    format="parquet"
)
```

`ApplyMapping` is the most frequently used transformation in ETL. It renames columns, converts types, and drops unnecessary columns. By partitioning output data into folders using `partitionKeys` in `write_dynamic_frame`, downstream queries benefit from partition pruning. The standard output formats are **Parquet/ORC (columnar + compression)**, which are ideal for analysis.

> 🔍 **Deeper Dive**: Glue Jobs have two execution types: standard Spark Jobs (for large-scale distributed processing) and **Python Shell Jobs** (single-node lightweight Python scripts for small data/orchestration). For transformations over several GB in a distributed fashion, use Spark Job; for work under a few hundred MB or lightweight tasks like API calls and metadata cleanup, Python Shell is much cheaper. Also, Glue 3.0/4.0 have different Spark versions, so you must verify library compatibility.

## Job Bookmark: The Core of Incremental Processing

In pipelines where new data arrives daily, reprocessing all data with every Job run explodes costs and time. **Job Bookmark** lets Glue remember "how far we got in the previous run," so the next run processes only **newly added data**.

```python
from awsglue.job import Job
from awsglue.utils import getResolvedOptions

args = getResolvedOptions(sys.argv, ['JOB_NAME'])
job = Job(glueContext)
job.init(args['JOB_NAME'], args)   # Initialize bookmark context

# ... The key is specifying transformation_ctx when reading the source ...
orders = glueContext.create_dynamic_frame.from_catalog(
    database="sales_db",
    table_name="orders",
    transformation_ctx="orders_src"   # Bookmark tracks progress with this identifier
)

# ... Transform and sink ...

job.commit()   # Bookmark state is updated here
```

For a bookmark to work, three things are required: (1) **Enable** the bookmark in Job properties, (2) specify `transformation_ctx` on source/sink, (3) call `job.commit()` at the end. The bookmark identifies new data based on S3 object timestamps or JDBC primary key/timestamp columns.

> ⚠️ **Gotcha**: Job Bookmark isn't a silver bullet. If the same file is **modified (overwritten)**, the bookmark may see it as "already processed" and skip it. Also, if you forget `job.commit()` or fail to specify `transformation_ctx`, the bookmark won't work at all. To reprocess old data, you must **Reset** the bookmark or temporarily **Disable** it. On exams, when you see "Glue reprocesses everything each time" or "incremental processing," think of Job Bookmark.

## Orchestration: Triggers and Workflows

Often you need to chain multiple Jobs and crawlers in sequence. Glue provides **Triggers** and **Workflows**. Triggers start the next step based on schedules (cron), on-demand, or events (previous Job success/failure). Workflows let you visually compose DAGs like Crawler → Job → Crawler. For more complex branching, retries, and external service integration, you escalate orchestration to **Step Functions** or **MWAA (Airflow)**.

> 🎯 **Scenario**: Raw CSV lands on S3 daily. You need to clean and type-convert it to Parquet, then make it analysis-ready. Architecture: (1) Crawler registers raw table → (2) Glue ETL Job reads via `from_catalog`, cleans with `ApplyMapping` and `ResolveChoice`, then writes to Parquet sink → (3) **Enable Job Bookmark** for incremental processing of new data only → (4) follow-up Crawler updates the clean table → (5) Workflow trigger runs the entire pipeline automatically each dawn. Athena queries the clean table directly.

## Summary: The Power of Managed Spark

Glue ETL Job runs Spark transformations without server management. DynamicFrame is a flexible data structure that tolerates dirty data, Source/Transform/Sink forms the backbone of every Job, and Job Bookmark enables incremental processing. The barrier to entry is writing code yourself. Tomorrow we'll cover **Glue Studio** (build ETL visually without code) and **DataBrew** (data cleaning tool).

---

## 📝 연습 문제

**문제 1.** Glue ETL Job에서 같은 컬럼이 어떤 행은 정수, 어떤 행은 문자열로 들어오는 타입 충돌을 깨지지 않고 다룰 수 있게 해 주는 Glue 고유 자료구조는?

A) Spark RDD  
B) Pandas DataFrame  
C) DynamicFrame  
D) Glue Catalog Table  

**정답: C**  
해설: DynamicFrame은 Choice 타입으로 충돌하는 타입을 모두 보존했다가 ResolveChoice로 정리할 수 있는 Glue 고유 구조다. Spark DataFrame은 타입이 사전 고정이라 충돌에 취약하고, RDD는 저수준 구조, Catalog Table은 메타데이터일 뿐 변환 자료구조가 아니다.

---

**문제 2.** 매일 새 데이터가 추가되는 S3 소스를 Glue Job이 매 실행마다 전체 재처리하지 않고 신규분만 처리하게 하려면 무엇이 필요한가?

A) Job 북마크를 Enable하고 소스에 transformation_ctx 지정 후 job.commit() 호출  
B) 크롤러를 매번 재생성한다  
C) DPU를 최대로 늘린다  
D) Python Shell Job으로 전환한다  

**정답: A**  
해설: 증분 처리는 Job 북마크로 구현한다. 북마크 Enable, 소스/싱크의 transformation_ctx 지정, 마지막 job.commit() 세 가지가 모두 갖춰져야 진행 상태가 추적된다. DPU 증설이나 Python Shell 전환은 증분 처리와 무관하다.

---

**문제 3.** Glue ETL Job의 과금 단위와 관련해 옳은 설명은?

A) 처리한 데이터 GB당 고정 요금만 부과된다  
B) Job 개수당 월 고정 요금이다  
C) 무료이며 Athena 쿼리에만 과금된다  
D) DPU(1 DPU = 4 vCPU + 16GB) 사용량과 실행 시간에 비례해 과금된다  

**정답: D**  
해설: Glue ETL은 DPU 기반으로 실행 시간에 비례해 과금된다. 1 DPU는 4 vCPU + 16GB 메모리에 해당한다. 데이터 GB 고정요금이나 Job 개수당 고정요금이 아니며, 실행 자체에 비용이 발생한다.

---

**문제 4.** 수백 MB 이하의 가벼운 데이터 정리나 API 호출 같은 단순 작업을, 분산 Spark의 오버헤드 없이 더 저렴하게 실행하려면 어떤 Glue Job 타입이 적합한가?

A) 표준 Spark Job에 DPU를 늘려 실행  
B) EMR 전용 클러스터 상시 가동  
C) Python Shell Job  
D) Managed Flink 애플리케이션  

**정답: C**  
해설: Python Shell Job은 단일 노드에서 가벼운 파이썬 스크립트를 실행하는 타입으로, 작은 데이터나 오케스트레이션·메타데이터 정리에 적합하고 분산 Spark보다 저렴하다. 큰 분산 변환이 아니면 표준 Spark Job은 과한 비용이다.

---

**문제 5.** Glue ETL Job의 일반적인 데이터 흐름을 가장 정확히 나타낸 것은?

A) Sink → Transform → Source  
B) Source(읽기) → Transform(변환) → Sink(기록)  
C) Transform만 반복 실행  
D) Catalog가 데이터를 직접 변환  

**정답: B**  
해설: 모든 Glue ETL Job은 소스에서 DynamicFrame을 읽고, 매핑·필터·조인·타입해소 등으로 변환한 뒤, S3/Catalog/Redshift 등 싱크로 기록하는 Source→Transform→Sink 흐름을 따른다. Catalog는 메타데이터 제공자일 뿐 직접 변환하지 않는다.

---
