# Day 1 - Integrated Review of Domains 1 & 2: Ingestion, Transformation & Storage Management

This is our final week. Today we bring together the two domains that carry the greatest weight on the exam — **Domain 1 (Data Ingestion and Transformation, ~34%)** and **Domain 2 (Storage Management, ~26%)** — as a single data flow. Together they represent nearly 60% of the exam. The key to passing is not memorizing individual services, but understanding the pipeline as a whole: "data arrives, gets ingested, is transformed, and is stored."

## Domain 1: Ingestion (Collection) Patterns

Ingestion splits into two broad categories: **streaming** and **batch**. The exam asks: if you see keywords like "real-time" or "single-digit latency," choose streaming; if you see "periodic," "bulk," or "hourly," choose batch.

| Requirement Keyword | Suitable Service | Reason |
|----------------|------------|------|
| Real-time streaming, custom consumers, order guarantee | Kinesis Data Streams | Shard-based, retained for replay |
| Stream to S3/Redshift with no management overhead | Data Firehose | Fully managed, automatic buffering, transformation, delivery |
| Kafka-compatible streaming | Amazon MSK | Open-source Kafka migration |
| Bulk file ingestion | S3 + Glue | Foundational for batch ETL |
| Real-time database change capture (CDC) | AWS DMS | Source DB → target persistent replication |

> 💡 **Related theory**: Choose Kinesis Data Streams when you need direct consumption, replay, and order guarantees. Choose Firehose when your goal is "managed ingestion" with no shard/consumer overhead—Firehose automatically buffers by size and time, then delivers to its destination.

## Domain 1: Transformation (Refinement) Selection

Choosing a transformation engine hinges on "serverless or not + data scale + code style."

- **AWS Glue**: Serverless Spark ETL. Best default for small-to-medium workloads, schedule- or event-triggered pipelines. The key feature is **Glue job bookmarks** — track which data has already been processed to enable incremental ETL.
- **Amazon EMR**: Managed Hadoop/Spark cluster. Choose this for large scale, fine-tuned control, and reusing existing Spark/Hive code. Optimize costs with Spot instances + instance fleets.
- **Glue Studio / DataBrew**: Visual, no-code transformation. DataBrew is tailored to analysts for data profiling and cleansing.

```python
# Glue bookmark: process only new data since last run (incremental ETL)
job.init(args['JOB_NAME'], args)
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw", table_name="events",
    transformation_ctx="dyf"  # bookmark tracks state by this context
)
# ... transform ...
job.commit()  # bookmark state saved at commit
```

> 💡 **Related theory**: Glue bookmarks work only when `transformation_ctx` and `job.commit()` are both present. Whenever you see "incremental ETL," "avoid reprocessing already-handled data," or "the scheduled job re-reads everything," the answer is always to enable bookmarks.

## Domain 2: Data Store Selection

Map stores by "structure / access pattern / query method."

| Requirement | Service | Core |
|---------|--------|------|
| Unstructured/semi-structured lake, unlimited scale, low cost | Amazon S3 | Data lake foundation storage |
| Large-scale analytical queries, columnar MPP data warehouse | Amazon Redshift | Petabyte-scale OLAP |
| Direct SQL on S3, serverless | Amazon Athena | Presto-based, no infrastructure management |
| Key-value, ultra-low latency, serverless | DynamoDB | Single-digit ms latency |
| Relational OLTP | RDS / Aurora | Transactional processing |

## Domain 2: Redshift Operations Essentials

The exam frequently asks about distribution keys and sort keys in Redshift.

- **Distribution Style (DISTSTYLE)**: `KEY` (co-locate by join column to reduce shuffle), `ALL` (replicate small dimension table across all nodes), `EVEN` (uniform distribution), `AUTO` (Redshift chooses).
- **Sort Key (SORTKEY)**: Accelerates range filters and time-range queries via zone maps for block skipping.
- **Redshift Spectrum**: Query external S3 data from Redshift without loading it first. Keep hot data in Redshift, cold data in S3 for tiering.

```sql
CREATE TABLE fact_sales (
  sale_id bigint, customer_id bigint, sale_ts timestamp, amount decimal(10,2)
)
DISTSTYLE KEY DISTKEY (customer_id)   -- optimize joins with customer dimension
SORTKEY (sale_ts);                    -- accelerate time-range queries
```

> 💡 **Related theory**: When joining a large fact table with a small dimension table, use `DISTSTYLE ALL` on the dimension to replicate it across all nodes and eliminate shuffle. When joining two large tables, use `DISTKEY` on both with the common join key to avoid data movement across nodes.

## Domain 2: Lake Formation and Catalogs

Managing permissions and metadata in a data lake.

- **Glue Data Catalog**: Central metastore shared by Athena, Redshift Spectrum, and EMR. Crawlers automatically infer schemas.
- **Lake Formation**: **Centralized, fine-grained access control** for a data lake. Grant permissions at table, column, row, and cell levels using LF-Tags. Instead of writing IAM policies for each S3 object, manage data permissions in one place.

> 💡 **Related theory**: Whenever you see "multiple teams sharing an S3 data lake, controlling access by column/row, managed centrally," the answer is almost always Lake Formation. IAM bucket policies alone cannot enforce column- or row-level control.

## Pipeline: Connecting Both Domains

A typical exam scenario flow:

1. **Ingestion**: Kinesis/Firehose (streaming) or DMS (CDC) → S3 raw zone
2. **Catalog**: Glue crawler infers schema → Data Catalog registration
3. **Transform**: Glue job (with bookmarks for incremental) or EMR → S3 curated zone (Parquet)
4. **Store/Query**: Athena for ad-hoc SQL, or load into Redshift for BI
5. **Governance**: Lake Formation enforces team-level fine-grained permissions

## Key Takeaways

- Ingestion maps to keywords: streaming (Kinesis/Firehose/MSK), batch (S3+Glue), CDC (DMS).
- Transformation: serverless → Glue, large-scale/tuning → EMR. Incremental ETL → Glue bookmarks.
- Storage: lake → S3, analytics DW → Redshift, serverless SQL → Athena, key-value → DynamoDB.
- Redshift uses DISTKEY/SORTKEY to reduce shuffle and scans, Spectrum to tier S3 data.
- Centralized fine-grained permissions → Lake Formation; shared metastore → Glue Data Catalog.

## 📝 연습 문제

**문제 1.** 스케줄로 매시간 실행되는 Glue 잡이 S3의 신규 파일만 처리해야 하는데, 매번 전체 데이터를 다시 읽어 비용과 시간이 과도하다. 가장 적절한 해결책은?

A) EMR 클러스터로 전환한다  
B) Glue 잡 북마크를 활성화하고 transformation_ctx와 job.commit()을 사용한다  
C) S3 버킷을 매시간 비운다  
D) Athena CTAS로 매번 전체를 다시 만든다  

**정답: B**  
해설: Glue 북마크는 이미 처리한 데이터를 추적해 증분 처리를 지원합니다. transformation_ctx로 상태를 추적하고 job.commit() 시점에 저장합니다. 나머지는 증분 처리를 해결하지 못하거나 비용·복잡도를 키웁니다.

---

**문제 2.** 여러 분석 팀이 동일한 S3 데이터레이크를 공유하면서, 특정 테이블의 일부 컬럼(예: 주민번호)은 일부 팀에게만 보이도록 중앙에서 통제하려 한다. 가장 적합한 서비스는?

A) S3 버킷 정책에 팀별 컬럼 규칙을 작성  
B) AWS Lake Formation의 컬럼 수준 권한  
C) EC2 보안 그룹  
D) CloudFront 서명 URL  

**정답: B**  
해설: Lake Formation은 테이블·컬럼·행·셀 수준의 세분화 권한을 중앙에서 관리합니다. S3 버킷 정책은 객체 수준까지만 제어하므로 컬럼 단위 통제가 불가능합니다. 보안 그룹·CloudFront는 데이터 권한과 무관합니다.

---

**문제 3.** 초당 수만 건의 IoT 이벤트를 실시간으로 받아 추가 인프라 관리 없이 자동으로 S3에 Parquet으로 버퍼링·변환·적재하려 한다. 가장 적합한 서비스는?

A) Amazon Data Firehose  
B) Amazon RDS  
C) AWS Batch  
D) Amazon SQS 표준 큐  

**정답: A**  
해설: Data Firehose는 완전관리형으로 스트리밍 데이터를 버퍼링하고 포맷 변환(예: Parquet) 후 S3/Redshift 등에 자동 배달합니다. 샤드·컨슈머 관리가 없습니다. RDS/Batch는 스트리밍 적재 용도가 아니며, SQS는 변환·적재 기능이 없습니다.

---

**문제 4.** 페타바이트급 팩트 테이블을 작은 날짜 차원 테이블과 자주 조인한다. 노드 간 데이터 이동(셔플)을 최소화하기 위한 Redshift 분배 설정으로 가장 적절한 것은?

A) 두 테이블 모두 DISTSTYLE EVEN  
B) 모든 테이블에 SORTKEY만 지정  
C) 작은 차원 테이블에 DISTSTYLE ALL  
D) 팩트 테이블을 DynamoDB로 이전  

**정답: C**  
해설: 작은 차원 테이블을 DISTSTYLE ALL로 모든 노드에 복제하면 조인 시 셔플 없이 로컬에서 조인할 수 있습니다. EVEN은 셔플을 유발하고, SORTKEY는 분배가 아닌 스캔 최적화이며, DynamoDB는 대규모 분석 조인에 부적합합니다.

---

**문제 5.** 데이터 분석가가 S3에 저장된 로그를 클러스터나 서버를 띄우지 않고 표준 SQL로 즉석 조회하려 한다. 비용은 스캔한 데이터량 기준으로만 내고 싶다. 가장 적합한 서비스는?

A) Amazon EMR  
B) Amazon EC2에 직접 설치한 Presto  
C) AWS Glue 크롤러  
D) Amazon Athena  

**정답: D**  
해설: Athena는 서버리스로 S3 데이터를 표준 SQL로 쿼리하며 스캔한 데이터량 기준으로 과금합니다. EMR/EC2는 클러스터 운영이 필요하고, Glue 크롤러는 쿼리 엔진이 아니라 스키마 추론 도구입니다.

---
