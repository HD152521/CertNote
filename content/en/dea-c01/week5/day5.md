# Day 5 - Week 5 Synthesis: Data Transformation 2 — Engines, Orchestration, Optimization Integration Review

This week covered "how to transform data, how to orchestrate flow, how to make it cheap and fast." If Week 4's Glue was serverless ETL basics, Week 5 is the larger toolbox around it — **EMR** for massive processing, **Lambda** for lightweight events, **orchestration** to link flows, and **performance/cost optimization** threading through everything. Today we rebind these four axes into one decision map.

## Week 5 Map at a Glance

```
[Transform Engine]       [Orchestration]          [Optimization Layer]
 Lambda  : light/event    Step Functions: AWS native   Format: Parquet/ORC
 Glue    : serverless     MWAA(Airflow) : complex/multi Compress: Snappy/Zstd
 EMR     : massive/control Glue Workflows: Glue-only    Partition: date etc.
 EMR S.  : serverless BD                             File size: 128MB~1GB
```

These three columns aren't independent. Real pipelines are "orchestrator calls transform engines in sequence, stores results in optimized format/partition" — all three axes interlock.

## 1) Transform Engine Choice: Scale and Control Tradeoff

Days 1-2's core: "scale and operational burden tradeoff."

| Engine | Scale | Ops Burden | Decisive Clue |
|--------|-------|------------|----------------|
| Lambda | Small (15min/10GB) | Very Low | "event-driven", "small file instant transform" |
| Glue | Medium-Large | Low (serverless) | "serverless ETL", "quick dev", "DPU billing" |
| EMR Serverless | Large | Low | "big data, hate cluster mgmt" |
| EMR on EC2 | Very Large | High | "Hive/HBase/Presto", "spot cost control", "fine tuning" |

EMR essentials: **Core nodes (storage+compute) on-demand, Task nodes (compute-only) on spot**. Keep permanent data on **S3 (EMRFS)**, use **Transient clusters** for work only, cutting costs. HDFS is temporary storage.

> 🎯 **Scenario**: Design a company pipeline. (1) IoT devices endlessly upload small JSON to S3 → **Lambda** cleanses instantly. (2) Daily accumulated data: large-scale aggregation → **EMR Transient (spot Task)** or **Glue**. (3) Save results for analysis → **Parquet + date partition**. (4) Orchestrate flow → **Step Functions**. Each tool operates in its strength zone.

## 2) Orchestration: Three Tools Linking Flow

Day 3's conclusion: keyword matching.

| Clue | Choice |
|------|--------|
| "AWS service-centric + serverless + branching/retry" | **Step Functions** |
| "High-freq, short (under 5min) events" | **Step Functions Express** |
| "Existing Airflow", "Python dynamic DAG", "multi-cloud/on-prem" | **MWAA** |
| "Pure Glue crawler/job, no extra services" | **Glue Workflows** |

Retrap: **"many steps ≠ MWAA."** All AWS services + low-ops → Step Functions. MWAA clues: "Airflow asset", "multi-environment", "complex Python logic."

> 💡 **Related Theory**: All three use DAG because acyclic graphs enable topological sorting — execute by "dependencies met" order and parallelize independent work. Orchestration is fundamentally "define DAG and provide execution guarantees (retry, idempotence, visibility)," with three tools offering that via serverless/standard-Airflow/Glue-built-in.

## 3) Optimization: Minimize Data Read

Day 4's four weapons, priority order:

1. **Format**: CSV/JSON → **Parquet/ORC** (column pruning + stat skip)
2. **Compression**: Splittable **Snappy/Zstd**. No giant single Gzip text (kills parallelism)
3. **Partitioning**: Filter frequently by **low-cardinality** columns (date, region). No high-cardinality (small file explosion)
4. **File size**: **128MB–1GB** via compaction. Millions of tiny files = overhead hell

Format one-liner: **analysis = Parquet/ORC (columnar)**, **schema evolution/fast write = Avro (row)**.

> ⚠️ **Gotcha**: Optimization problems usually demand multiple fixes simultaneously. "Athena costs skyrocket" scenario answer isn't just "convert to Parquet"—it's **format + partitioning + compaction combo**. Questions asking "most effective single measure" usually point to format or partitioning first, but "apply all" type also appears.

## Integrated Decision Flow

Encountering problems, think in order:

```
Q1. Processing scale?
    Small/event → Lambda
    Medium-Large serverless → Glue / EMR Serverless
    Massive/diverse/cost-control → EMR on EC2

Q2. Orchestrate flow how?
    AWS native serverless → Step Functions
    Airflow asset/multi-env → MWAA
    Pure Glue → Glue Workflows

Q3. Optimize storage?
    Parquet + Snappy + date partition + 128MB~1GB
```

## Week 5 Core in One Line

- **EMR**: Managed big-data cluster. Task=spot, data=S3(EMRFS), Transient for cost. Hate cluster ops? **EMR Serverless**.
- **Lambda**: Event-driven, 15min/10GB limits, lightweight transform. Best for small file instant processing, Firehose transform, glue code. Isolate failures with DLQ.
- **Step Functions / MWAA / Glue Workflows**: AWS native serverless / standard Airflow·complex / Glue-only. Discriminate by keywords.
- **Optimization**: Columnar format (Parquet) + splittable compress (Snappy) + partition pruning + file-size discipline. Giant single Gzip CSV = worst.

Next week we enter data storage and serving — data warehouses and catalog space. How transformed data lands and is served.

---

## 📝 연습 문제

**문제 1.** 다음 요구를 모두 만족하는 변환 엔진은? "수십 TB를 처리, Hive와 HBase를 함께 사용, 스팟 인스턴스로 비용을 극단적으로 제어, 클러스터를 세밀히 튜닝."

A) Amazon EMR on EC2  
B) AWS Lambda  
C) AWS Glue  
D) Amazon Athena  

**정답: A**  
해설: 다양한 빅데이터 생태계 도구(Hive/HBase), 스팟을 통한 비용 제어, 세밀한 클러스터 튜닝은 모두 EMR on EC2의 강점이다. Lambda는 15분 한계, Glue는 서버리스 추상화로 세밀 제어가 제한적, Athena는 쿼리 서비스로 이 요구와 맞지 않는다.

---

**문제 2.** "S3 파일 도착 → Glue 변환 → 검증 → 통과 시 Redshift 적재, 실패 시 알림"을 분기·재시도와 함께 서버리스로 조율하려 한다. 가장 적합한 오케스트레이터는?

A) Amazon MWAA  
B) 단일 Lambda 함수  
C) Amazon Kinesis  
D) AWS Step Functions  

**정답: D**  
해설: 전부 AWS 서비스로 구성되고 분기(Choice)·재시도(Retry/Catch)를 선언적으로 처리하며 서버리스 저운영을 원하므로 Step Functions가 최적이다. MWAA는 Airflow 자산·멀티 환경이 단서일 때 선택하고, 단일 Lambda는 15분 한계와 가시성 부족, Kinesis는 스트리밍 수집 도구다.

---

**문제 3.** EMR 비용 최적화를 위한 설명 중 옳은 것은?

A) 영구 데이터를 Core 노드 HDFS에 저장하고 클러스터를 24시간 유지한다  
B) Task 노드에 스팟을 적용하고 영구 데이터는 S3(EMRFS)에 두며 Transient 클러스터로 작업 시에만 띄운다  
C) Primary 노드를 스팟으로 구성해 비용을 줄인다  
D) 모든 노드를 온디맨드로 고정한다  

**정답: B**  
해설: Task 노드는 HDFS를 저장하지 않아 스팟 회수에 안전하고, 영구 데이터는 S3(EMRFS)에 두어 컴퓨트-스토리지를 분리하며, Transient 클러스터로 작업 시에만 띄우는 것이 정석이다. HDFS는 임시 저장소이고, Primary를 스팟으로 두면 회수 시 클러스터 전체가 멈춘다.

---

**문제 4.** Athena 스캔 비용이 급증했다. 데이터는 단일 Gzip CSV로 저장돼 있고 쿼리는 최근 며칠·특정 컬럼만 본다. 다음 중 비용 절감에 도움이 되지 않는 조치는?

A) Parquet 같은 열 기반 포맷으로 변환  
B) year/month/day로 파티셔닝  
C) user_id 같은 고카디널리티 컬럼으로 잘게 파티셔닝하고 파일을 더 쪼갠다  
D) 작은 파일을 128MB~1GB로 컴팩션하고 분할 가능한 Snappy 압축 사용  

**정답: C**  
해설: 고카디널리티 컬럼으로 파티셔닝하고 파일을 더 쪼개면 파티션 폭증과 작은 파일 문제로 오히려 성능·비용이 악화된다. 열 포맷 전환, 날짜 파티셔닝, 컴팩션과 분할 가능 압축은 모두 스캔량을 줄이는 올바른 처방이다.

---

**문제 5.** 다음 중 도구와 대표 용도의 연결이 잘못된 것은?

A) Lambda — S3에 도착한 작은 파일을 즉시 정제하는 이벤트 기반 경량 변환  
B) MWAA — 기존 Airflow DAG를 재사용하며 멀티 클라우드를 조율하는 복잡한 워크플로  
C) Glue Workflows — 다양한 비-Glue 서비스를 복잡한 분기와 함께 조율하는 범용 오케스트레이션  
D) Parquet — 분석 쿼리에서 컬럼 프루닝으로 스캔량을 줄이는 열 기반 포맷  

**정답: C**  
해설: Glue Workflows는 Glue 크롤러·작업에 거의 국한된 경량 오케스트레이션으로, 다양한 비-Glue 서비스와 복잡한 분기 조율에는 약하다. 그 역할은 Step Functions나 MWAA가 맡는다. 나머지 연결(Lambda·MWAA·Parquet)은 모두 올바르다.

---
