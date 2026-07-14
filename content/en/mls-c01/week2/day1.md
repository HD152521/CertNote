# Day 1 - Data Transformation and ETL: AWS Glue, Spark, and EMR

Last week we covered "where and how to fetch data" (collection and storage). Now we move to the stage of **transforming raw data into a form the model can consume**. This is transformation, commonly called ETL (Extract-Transform-Load). In the MLS-C01 exam, ETL is a core area that tests "which tool to choose, at what scale, and with what cost and operational burden."

Today we compare AWS's representative transformation tools: **AWS Glue** (serverless Spark) and **Amazon EMR** (managed Hadoop/Spark cluster), and develop the perspective to design large-scale preprocessing.

## What is ETL?

ETL is a compound of three letters.

| Stage | Meaning | Example in ML |
|-------|---------|--------------|
| Extract | Pull data from the source | Read from S3, RDS, DynamoDB, logs |
| Transform | Clean, join, aggregate, encode | Handle missing values, categorical encoding, feature calculation |
| Load | Write processed results to destination | Write to training S3 bucket, save to feature store |

In an ML pipeline, the output of ETL is the **training dataset**. Therefore, the accuracy and reproducibility of transformation logic directly determines model quality.

> 💡 **Related Theory**: Recently, a variant called ELT (Extract-Load-Transform) is also used. This approach first loads raw data into a data lake (S3) and transforms it as needed. A combination of data lake + Athena/Spark is essentially an ELT pattern, which is advantageous when flexibly handling large-scale data with less standardization.

## AWS Glue — The Center of Serverless ETL

AWS Glue is a **serverless Apache Spark-based ETL service** that doesn't require direct server management. AWS handles spinning up and down clusters, so engineers can focus solely on transformation logic. Let's understand Glue's key components.

- **Glue Data Catalog**: A central metadata repository containing data schema, location, and partition information. Shared by Athena, EMR, and Redshift Spectrum.
- **Glue Crawler**: Scans data in S3 and other sources, automatically infers schema, and registers tables in Data Catalog.
- **Glue ETL Job**: The actual Spark (or Python Shell) job that performs transformation. Written in PySpark or Scala.
- **DynamicFrame**: An extension of Spark DataFrame provided by Glue. Advantageous for handling data with irregular schemas.

```python
# Skeleton of a Glue PySpark ETL job
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ['JOB_NAME'])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# 1) Read raw data from Data Catalog (Extract)
raw = glueContext.create_dynamic_frame.from_catalog(
    database="ml_raw", table_name="clicks"
)

# 2) Transform: Drop null rows + column mapping (Transform)
mapped = ApplyMapping.apply(frame=raw, mappings=[
    ("user_id", "string", "user_id", "string"),
    ("ts", "string", "event_time", "timestamp"),
    ("amount", "string", "amount", "double"),
])
clean = DropNullFields.apply(frame=mapped)

# 3) Write to training S3 bucket as Parquet (Load)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://ml-train/clicks/"},
    format="parquet"
)
job.commit()
```

> 💡 **Related Theory**: Glue job processing capacity is measured in **DPU (Data Processing Unit)** units. 1 DPU ≈ 4 vCPU + 16GB memory. If a job is slow, scale horizontally by increasing DPU count (worker count), or use the latest Spark engine in **Glue 3.0/4.0** to boost performance. Costs are charged only for DPU-hours consumed.

## Amazon EMR — Full-Control Big Data Cluster

EMR (Elastic MapReduce) is a managed service that directly operates big data frameworks like **Hadoop, Spark, Hive, Presto, HBase** on EC2 clusters. Where Glue says "Spark only, serverless, simple," EMR offers "multiple engines, fine-tuned, direct control."

EMR is advantageous when:
- Processing petabyte-scale data over long durations while **fine-tuning cluster settings** (instance types, memory, executor configuration) is required
- Multiple frameworks like Hive, Presto, HBase beyond Spark are needed **together**
- You want to **significantly reduce costs with spot instances** (for workloads tolerant of interruption)

```bash
# Create EMR cluster (with Spark) — CLI example
aws emr create-cluster \
  --name "ml-preprocess" \
  --release-label emr-7.1.0 \
  --applications Name=Spark \
  --instance-groups \
    InstanceGroupType=MASTER,InstanceCount=1,InstanceType=m5.xlarge \
    InstanceGroupType=CORE,InstanceCount=4,InstanceType=m5.2xlarge \
  --use-default-roles \
  --auto-terminate
```

`--auto-terminate` automatically terminates the cluster when the job finishes, preventing unnecessary costs. Additionally, **EMR Serverless**, a newer option, runs Spark/Hive jobs without cluster management overhead and sits roughly between Glue and EMR.

> 💡 **Related Theory**: In exams, choosing between Glue and EMR is a frequent topic. Decision criteria: (1) **Operational burden**: Minimize management → Glue, fine control → EMR. (2) **Workload nature**: Short and sporadic → Glue, long and heavy batch → EMR. (3) **Framework diversity**: Spark alone suffices for Glue; multiple engines demand EMR.

## Principles for Large-Scale Preprocessing Design

Once data exceeds terabytes, "how to efficiently store and read" becomes as important as "how to transform."

1. **Use Columnar Format**: Using **Parquet/ORC** instead of CSV/JSON significantly improves compression and scan efficiency. Read only required columns to reduce I/O.
2. **Partitioning**: Dividing partitions by frequently filtered keys (like `s3://bucket/year=2026/month=06/`) lets Spark/Athena skip unnecessary data (partition pruning).
3. **File Size Optimization**: Too many small files (small files problem) increase overhead. The general recommendation is to consolidate to around 128MB–1GB.
4. **Predicate Pushdown**: Apply filter conditions at the data source stage to reduce the amount of data read.

```python
# Efficient reading in Spark using partition + column pruning
df = (spark.read.parquet("s3://ml-train/clicks/")
      .filter("year = 2026 AND month = 6")   # partition pruning
      .select("user_id", "event_time", "amount"))  # column pruning
```

> ⚠️ **Pitfall**: "Since data is large, just spin up a huge EMR cluster" is a common trap answer. If work is sporadic and operational staff is limited, maintaining a large EMR cluster constantly is inefficient in cost and management. Glue or EMR Serverless is more suitable here.

## Connection with SageMaker

Preprocessing results ultimately flow to SageMaker training. AWS provides multiple paths connecting transformation and learning.

- **SageMaker Processing**: A SageMaker-native feature executing preprocessing in scikit-learn/Spark containers. Frequently used for pre- and post-training processing.
- **Glue → S3 → SageMaker Training**: The most common pattern: Glue creates Parquet and places it in S3 for training jobs to read.
- **SageMaker Data Wrangler**: Design transformation workflows via GUI and export to Processing jobs or pipelines.

> 💡 **Related Theory**: SageMaker Processing and Glue may appear to overlap but serve different purposes. Glue excels at **ETL across the entire data lake** (producing shared curated data for multiple consumers), while SageMaker Processing naturally integrates with **preprocessing specific to an ML task** (feature generation for this model alone).

## Summary

Today we reviewed ETL concepts and compared AWS's two main tools. **Glue's serverless Spark minimizes operational burden and suits sporadic, standard ETL**, while **EMR's fine control and diverse frameworks suit heavy workloads requiring detailed tuning**. In large-scale preprocessing, storage strategies like Parquet, partitioning, and file size optimization determine processing performance. All transformation results lead into SageMaker training.

Tomorrow we explore automating these transformation tasks not by hand but via **Step Functions and SageMaker Pipelines** as a learning data pipeline.

---

## 📝 연습 문제

**문제 1.** 운영 인력이 적은 팀이 하루 몇 차례 산발적으로 발생하는 표준 Spark 변환 작업을 처리하려 한다. 클러스터를 직접 띄우고 관리하는 부담을 최소화하려면?

A) AWS Glue 서버리스 ETL 작업을 사용한다  
B) 대형 EMR 클러스터를 상시 운영한다  
C) EC2에 직접 Spark를 설치해 운영한다  
D) DynamoDB 스트림으로 변환한다  

**정답: A**  
해설: Glue는 서버리스 Spark로 클러스터 프로비저닝·관리 부담이 없고, 사용한 DPU-시간만 과금되므로 산발적·표준적 ETL에 가장 적합하다. 상시 EMR(B)이나 직접 운영 EC2(C)는 운영 부담과 유휴 비용이 크다. DynamoDB 스트림(D)은 대규모 Spark 변환 도구가 아니다.

---

**문제 2.** 페타바이트급 데이터를 장시간 처리하며 Spark뿐 아니라 Hive와 Presto를 함께 사용하고, 인스턴스 타입과 메모리를 세밀하게 튜닝해야 한다. 가장 적합한 서비스는?

A) AWS Glue  
B) Amazon Athena  
C) Amazon EMR  
D) AWS Lambda  

**정답: C**  
해설: EMR은 Spark·Hive·Presto 등 다양한 프레임워크를 EC2 클러스터에서 직접 운영하며 세밀한 튜닝과 스팟 인스턴스 비용 절감이 가능하다. Glue(A)는 주로 Spark 중심의 서버리스 ETL이고, Athena(B)는 SQL 질의 서비스, Lambda(D)는 짧은 함수 실행에 적합해 무거운 빅데이터 클러스터 워크로드에는 부적합하다.

---

**문제 3.** S3에 저장된 대규모 학습 데이터를 Spark로 읽을 때, 스캔 비용과 I/O를 가장 효과적으로 줄이는 저장 전략의 조합은?

A) CSV 포맷 + 단일 거대 파일  
B) JSON 포맷 + 무작위 파일 분할  
C) Parquet 컬럼형 포맷 + 자주 필터링하는 키로 파티셔닝  
D) 압축하지 않은 텍스트 + 컬럼 순서 무작위  

**정답: C**  
해설: Parquet 같은 컬럼형 포맷은 필요한 컬럼만 읽고 압축률이 높으며, 파티셔닝은 불필요한 데이터를 건너뛰는 partition pruning을 가능하게 해 스캔량을 크게 줄인다. CSV·JSON·비압축 텍스트는 행 기반이라 컬럼 프루닝이 약하고 I/O가 비효율적이다.

---

**문제 4.** AWS Glue에서 S3 데이터를 스캔해 스키마를 자동 추론하고 중앙 메타데이터 저장소에 테이블로 등록하는 구성 요소는?

A) Glue ETL Job  
B) Glue Crawler  
C) DynamicFrame  
D) DPU  

**정답: B**  
해설: Glue Crawler가 데이터를 스캔해 스키마를 추론하고 Glue Data Catalog에 테이블을 등록한다. ETL Job(A)은 실제 변환을 수행하고, DynamicFrame(C)은 변환에 쓰는 데이터 구조, DPU(D)는 처리 용량 단위로 스키마 등록과는 무관하다.

---

**문제 5.** ML 파이프라인에서 "데이터 레이크 전반의 공유 정제 데이터 생산"과 "특정 모델만을 위한 전처리"를 구분할 때 일반적으로 더 적합한 도구 짝으로 옳은 것은?

A) 둘 다 SageMaker Processing이 적합  
B) 둘 다 EMR이 유일한 정답  
C) 공유 정제는 Lambda, 모델 전용 전처리는 Athena  
D) 공유 정제는 Glue, 모델 전용 전처리는 SageMaker Processing  

**정답: D**  
해설: Glue는 여러 소비자가 공유하는 데이터 레이크 전반의 ETL에 강하고, SageMaker Processing은 특정 ML 작업에 종속된 전처리에 자연스럽게 통합된다. 둘은 역할이 겹쳐 보여도 결이 다르므로 상황에 맞게 나눠 쓰는 것이 정석이다. A·B·C는 이 역할 구분을 반영하지 못한다.

---
