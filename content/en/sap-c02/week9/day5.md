# Day 5 - Week 9 Comprehensive Review: Data Architecture as One Picture

Week 9 covered "where data is stored, how it's processed, who sees what, and how it flows in real-time." Memorizing individual services alone won't pass SAP exams. Exams always ask "under these constraints (cost, real-time, operational burden, portability, permission granularity), what is optimal?" and only one of two similar-looking services satisfies all conditions. Today we consolidate the week's pieces into one unified architecture picture and sharpen boundary-drawing through scenario drills.

## Data Architecture in One Frame

```
[Ingest]   Kinesis (KDS/Firehose) / MSK / DMS
   ↓
[Store]    S3 Raw → Curated → Trusted (Parquet + partitions + compression)
   ↓                         │
[Catalog]  Glue Data Catalog (Hive Metastore compatible — hub for all engines)
   ↓
[Process]  Glue (serverless ETL) / EMR (full Spark·Hadoop) / Athena (SQL CTAS)
   ↓
[Load]     Redshift (RA3·Serverless) / OpenSearch / S3 Curated
   ↓
[Analyze]  Athena / Redshift (Spectrum·Federated·Sharing·Zero-ETL) / QuickSight / SageMaker
   │
[Perms]    Lake Formation (rows·columns·cells, LF Tag ABAC, RAM cross-account)
[Orch]     MWAA (Airflow DAG) / Step Functions
[Govern]   DataZone (marketplace) / Glue Data Quality (DQDL)
```

The core of this picture: **Glue Data Catalog is the central hub**. The same Parquet file in S3 is seen as the same table by Athena (SQL), EMR Spark (transform), and Redshift Spectrum (join). This separation of unified metadata with swappable processing engines is the essence of the lakehouse.

## Boundary Clarification — 7 Pairs of Confusions the Exam Exploits

| Distinction | A | B | Deciding Question |
|--------|---|---|------------|
| Processing | **Glue** (serverless ETL) | **EMR** (full cluster) | Will you operate a cluster directly, need full Hadoop stack |
| Query Location | **Athena** (S3 SQL) | **Redshift** (DW) | Ad-hoc S3 query or structured repeated analysis / high-performance DW |
| Redshift External | **Spectrum** (S3) | **Federated Query** (RDS/Aurora) | Data in S3 or operational DB |
| OpDB → DW | **Federated Query** (real-time direct query) | **Zero-ETL** (CDC auto-replicate) | OK to load OpDB (former yes) |
| Stream | **MSK** (Kafka standard) | **Kinesis** (AWS proprietary) | Portability, existing Kafka or simplicity, AWS-native |
| Permissions | **Lake Formation** (rows·columns·cells, Tags) | **IAM** (object level) | Need table-internal granularity |
| Orchestration | **MWAA** (Airflow DAG, portability) | **Step Functions** (ASL, serverless·AWS integration) | Portability, complex logic or ops-zero, avoid on-demand cost |

Each row is roughly one exam question. Two choices both "look right," but a single condition (OpDB load avoidance? Portability? On-demand cost?) breaks the tie.

## Cost · Real-Time · Portability — Reframed on Three Axes

**Cost Axis**: Sporadic, variable workloads always favor serverless/elastic (Glue, Athena, EMR Serverless, Redshift Serverless, MSK Serverless, Step Functions); steady high volume favors reserved/provisioned (RA3 reserved, EMR EC2 Spot Fleet) cheaper. "Zero cost when not running" is the serverless keyword; "24/7 packed normal load" points to reserved.

**Real-Time Axis**: Batch (Glue, EMR, Athena CTAS, minutes to hours) → Micro-batch (Glue Streaming, Firehose, seconds to minutes) → Real-time (KDS, MSK, milliseconds to seconds). Real-time operational DB analysis: Zero-ETL (seconds-to-tens-of-seconds CDC) freshest without ETL code.

**Portability Axis**: Open-source standards (MSK=Kafka, MWAA=Airflow, EMR=Spark/Hadoop, Iceberg/Hudi/Delta) ease cross-cloud and on-prem migration; AWS proprietary (Kinesis, Step Functions, Redshift) offer deep integration but vendor lock-in. Multi-cloud strategy tips toward standards.

> 💡 **Related Theory**: These three axes' trade-offs connect to CAP/PACELC in distributed systems. PACELC: "Under partition, choose availability vs consistency; in normal operation, choose latency vs consistency." Zero-ETL and CDC replicate introduce intentional delay (eventual consistency) between operational DB and analytical DW to gain availability and isolation; Federated Query sacrifices OpDB isolation for consistency (freshness). "Freshness vs isolation load" is really the data pipeline version of consistency vs availability trade-off.

> 🔍 **Deeper Dive**: SAP often layers data topics over **multi-account, multi-region** contexts. Central data lake in separate data account with departmental accounts sharing via RAM+LF (data mesh pattern), Redshift Data Sharing cross-region/cross-account sharing without replication, Glue Catalog cross-account reference — these are recurring patterns. Organizations, SCP, and Control Tower form the governance backbone. Habit: don't view one data service alone but "how does this share/isolate/control in multi-account organizations" — this habit is key to solving Pro-tier scenarios.

> 🎯 **Scenario**: "Global firm operates Redshift in US, Europe, Asia regions. Head BI team wants to unified-analyze sales across three regions without moving/replicating data, can't impact regional cluster performance. Optimal?" — Answer: **Redshift Data Sharing (cross-Region/cross-Account)**. Because data lives in RMS (S3-backed), producer (each region) shares data to consumer (head BI) cluster without copying; independent compute isolates workloads (no performance impact). Centralizing data via ETL/replicate costs, latency, sync burden far exceed this solution; Spectrum is for S3 external data, not internal table sharing mechanism.

## Common Pitfalls

> ⚠️ **Pitfall**: **"Serverless is always cheaper"** — Redshift Serverless, EMR Serverless, MSK Serverless all cheaper on variable loads, but provisioned/reserved cheaper on steady heavy load. Strength is not absolute cost per unit but "zero when idle" elasticity.

> ⚠️ **Pitfall**: **"Federated Query = Zero-ETL"** — Both "no ETL, analyze operational DB in Redshift." But Federated Query **directly queries OpDB, loading it**, Zero-ETL **replicates via CDC, no load**. One word "avoid OpDB load" breaks the tie.

> ⚠️ **Pitfall**: **"Spectrum and Athena both query S3, so interchangeable?"** — Both SQL S3 directly via Glue Catalog. But joining to Redshift internal tables requires Spectrum; pure S3 favors Athena simplicity. "Already running Redshift + must join S3 and internal" is Spectrum's slot.

> ⚠️ **Pitfall**: **"Make Master/Core Spot too, cheaper"** — EMR Master on Spot: cluster dies on interruption. Core on Spot: HDFS data vanishes. **Spot only for Task nodes**. Cost optimal: Task=Spot + Instance Fleets multi-type.

## Summary

Week 9 one-liner: **Aggregate data into S3 in standard format (Parquet+partitions), unify metadata in Glue Catalog, pick processing engines matching workload traits (cost, real-time, portability, permissions).** Exams ask "optimal under constraint," not service names. Below 12 scenarios sharpen boundary-drawing hands-on. Next week (Week 10): ML/AI architecture — SageMaker, Bedrock, MLOps.

---

## 📝 12-Question Scenarios

**문제 1.** Athena 쿼리 비용(S3 스캔량 과금)이 너무 높다. 데이터는 현재 압축 안 된 CSV로 단일 경로에 쌓여 있다. 스캔 비용을 가장 크게 줄이려면?

A) WHERE 절을 더 많이 추가
B) Parquet 컬럼 포맷 + 날짜 파티셔닝 + 압축으로 변환
C) Athena Workgroup 분리
D) 쿼리 결과 재사용(Result Reuse)만 활성화

**정답: B**

해설: Athena는 S3 스캔 데이터량으로 과금되므로, (1) 컬럼 포맷(Parquet)으로 필요한 컬럼만 읽고(컬럼 프루닝), (2) 파티셔닝으로 관련 없는 파티션을 통째로 건너뛰고(파티션 프루닝), (3) 압축으로 물리 바이트를 줄이면 스캔량이 수십~90% 이상 감소한다. A(WHERE)는 CSV·비파티션에선 결국 전체를 스캔하므로 효과 제한적. C(Workgroup)는 비용 가시성·제어용이지 스캔량 자체를 줄이지 않음. D(Result Reuse)는 동일 쿼리 반복에만 효과가 있고 근본 스캔량 문제를 못 푼다.

---

**문제 2.** 이미 Redshift RA3를 운영 중이고, S3 데이터 레이크의 5년치 과거 주문(Parquet)을 Redshift의 최근 주문 테이블과 한 쿼리에서 조인해야 한다. 과거 데이터를 Redshift로 적재하고 싶지 않다.

A) COPY로 S3 데이터를 Redshift 내부 테이블에 적재
B) Redshift Spectrum + External Schema
C) Athena로 따로 쿼리 후 결과를 수동 결합
D) Federated Query

**정답: B**

해설: Spectrum은 S3 데이터를 적재하지 않고 Glue Catalog 외부 테이블을 참조하는 External Schema로 직접 질의하며, Redshift 내부 테이블과 한 쿼리에서 조인한다(레이크하우스). S3 스캔은 별도 Spectrum 노드 풀에서 처리되어 클러스터 자원을 거의 안 쓴다. A는 적재가 발생해 조건 위반. C는 두 시스템 결과를 수동 결합해야 해 비효율·오류. D(Federated Query)는 RDS/Aurora 같은 운영 DB 대상이지 S3 대상이 아니다. "Redshift + S3 조인 + 적재 회피"는 Spectrum.

---

**문제 3.** Aurora PostgreSQL OLTP 데이터를 거의 실시간으로 Redshift에서 분석해야 한다. ETL 파이프라인을 직접 만들고 싶지 않고, 운영 DB에 분석 쿼리 부하를 주고 싶지도 않다.

A) Redshift Federated Query
B) Aurora PostgreSQL Zero-ETL Integration with Redshift
C) DMS CDC로 S3 복제 후 Glue ETL
D) 매시간 Glue 배치 ETL

**정답: B**

해설: Zero-ETL은 CDC로 Aurora 변경을 Redshift에 거의 실시간(수 초~수십 초) 자동 복제한다. ETL 코드를 작성·유지할 필요가 없고(완전 관리형), 데이터가 Redshift로 복제되므로 운영 DB에 분석 쿼리 부하가 가지 않는다. A(Federated Query)는 ETL은 없지만 운영 DB에 직접 쿼리해 부하를 주므로 "부하 회피" 조건 위반 — 이 한 조건이 A와 B를 가른다. C는 파이프라인을 직접 관리해야 하고 운영 부담. D는 실시간이 아니다.

---

**문제 4.** S3 데이터 레이크의 한 테이블에서 분석가 그룹에게 PII 컬럼(주민번호)을 제외한 나머지 컬럼만 노출하고, 동시에 한국 지사 사용자에게는 region='KR' 행만 보여줘야 한다.

A) IAM Policy로 객체 접근 제한
B) Lake Formation 컬럼 권한 + 행 필터(데이터 필터)
C) S3 Bucket Policy
D) PII를 별도 버킷으로 분리

**정답: B**

해설: Lake Formation은 Glue Catalog 위에서 컬럼 수준 권한(PII 컬럼 제외, CLS)과 행 필터(region='KR'만, RLS)를 동시에 적용한다. 같은 데이터를 사용자별로 다른 행·열만 보여줘 데이터 복제·뷰 분리가 필요 없다. A·C는 객체/버킷 수준이라 테이블 내부 입도가 안 나옴. D는 데이터를 분리·복제해 관리 부담이 크고 행 단위 통제도 안 된다. "PII 컬럼 제외 + 특정 행만"은 Lake Formation 데이터 필터.

---

**문제 5.** 매일 페타바이트급 로그를 Spark 배치로 2~3시간 처리한다. 데이터는 S3에 영구 보관돼 있다. 비용을 최소화하면서 Spot 중단에도 잡이 안전하려면?

A) 상시 EMR 클러스터를 On-Demand로 유지해 잡 시작 지연을 없애고 안정성을 확보한다
B) 잡 단위 transient EMR + Task를 Instance Fleets Spot 다중 타입으로, 끝나면 종료
C) 비용 최소화를 위해 Master·Core·Task 노드를 전부 Spot Instance로 구성한다
D) 데이터를 Redshift RA3에 COPY로 적재한 뒤 SQL 배치로 처리한다

**정답: B**

해설: 데이터가 S3(EMRFS)에 있으므로 처리할 때만 클러스터를 띄우고 끝나면 종료하는 transient cluster가 비용 최적이다. Task 노드는 HDFS 데이터를 안 들고 있어 Spot에 안전하고, Instance Fleets로 여러 타입을 섞으면 한 타입 Spot이 중단돼도 자동 대체되어 강건하다. A는 유휴 시간에도 비용 발생. C는 Master(중단 시 클러스터 전멸)·Core(중단 시 HDFS 데이터 소실)를 Spot으로 돌리는 치명적 실수. D는 배치 변환에 굳이 DW 적재가 불필요하다.

---

**문제 6.** 하루 몇 번 불규칙하게 도는 Spark 잡이 있다. 클러스터 사이징·노드 관리를 하기 싫고, 안 돌 때 비용을 0에 가깝게 하려면?

A) EMR on EC2 상시 클러스터
B) EMR Serverless
C) Glue Crawler
D) Redshift Serverless

**정답: B**

해설: EMR Serverless는 클러스터·노드 개념 없이 잡 제출 시 워커를 자동으로 띄우고 끝나면 회수하며 실행 시간만 과금해, 간헐적·가변 Spark 워크로드에서 사이징 실수와 유휴 비용을 없앤다. A는 유휴 비용·사이징 관리 필요. C(Crawler)는 스키마 추론 도구로 Spark 잡 실행이 아님. D(Redshift Serverless)는 데이터 웨어하우스로 Spark 처리 엔진이 아니다. "가변 Spark + 사이징 회피"는 EMR Serverless.

---

**문제 7.** 온프레미스 자체 운영 Kafka를 AWS로 옮긴다. 기존 프로듀서·컨슈머 코드와 Debezium 커넥터를 거의 그대로 쓰고, 추후 다른 클라우드 이전 가능성도 고려한다.

A) Kinesis Data Streams
B) Amazon MSK
C) SQS FIFO
D) EventBridge

**정답: B**

해설: MSK는 Apache Kafka 매니지드라 Kafka API가 그대로여서 기존 코드·커넥터를 거의 수정 없이 재사용하고, Kafka가 OSS 표준이라 타클라우드(Azure Event Hubs Kafka API, GCP Managed Kafka 등)·온프렘 이전 이식성이 좋다. A(Kinesis)는 AWS 독자라 코드 전면 재작성 + 종속. C(SQS)는 메시지 큐로 스트림 재생·컨슈머 그룹 모델이 다름. D는 이벤트 버스로 Kafka 스트림 처리가 아니다. "기존 Kafka + 이식성"은 MSK.

---

**문제 8.** ACID 트랜잭션, 스키마 진화, 시간여행(특정 과거 시점 조회)이 필요한 S3 데이터 레이크를 구축한다. 일반 Parquet으로는 동시 쓰기·업데이트·삭제 일관성이 보장되지 않는다.

A) 순수 Parquet 파일을 직접 관리하면서 애플리케이션 레벨 락으로 동시 쓰기를 제어한다
B) Apache Iceberg / Hudi / Delta Lake 같은 트랜잭션 테이블 포맷
C) 스키마 진화 유연성을 위해 CSV로 저장하고 버전별 디렉터리로 시간여행을 흉내 낸다
D) ACID가 필요하므로 데이터를 DynamoDB로 전환하고 PITR로 시간여행을 대체한다

**정답: B**

해설: Iceberg·Hudi·Delta Lake는 S3 객체 위에 트랜잭션 로그·메타데이터 계층을 얹어 ACID, 동시 쓰기 격리, 스키마 진화, 시간여행(스냅샷 조회), upsert/delete를 제공한다(레이크하우스 테이블 포맷). A(순수 Parquet)는 트랜잭션·시간여행이 없어 동시 쓰기 일관성 보장 불가. C(CSV)는 컬럼·압축·트랜잭션 모두 열위. D(DynamoDB)는 OLTP NoSQL로 대규모 분석 레이크 용도가 아니다.

---

**문제 9.** 수십 개 단계가 의존성을 갖는 데이터 파이프라인을 오케스트레이션한다. 팀은 이미 Airflow를 쓰고, 멀티클라우드 이식성과 복잡한 Python 분기 로직이 필요하다.

A) Step Functions(ASL)
B) MWAA
C) Glue Workflow
D) EventBridge 규칙 체인

**정답: B**

해설: MWAA는 Airflow 매니지드라 기존 Python DAG를 거의 그대로 옮기고, Airflow가 OSS라 GCP Composer·온프렘 등으로 이식성이 좋으며, Python 코드의 표현력으로 복잡한 조건 분기·동적 태스크를 짠다. A(Step Functions)는 ASL JSON·AWS 종속이라 이식성 조건 위반. C(Glue Workflow)는 Glue 잡 위주 단순 오케스트레이션으로 복잡 DAG·이식성에 부족. D는 단순 이벤트 연결이지 의존성 그래프 오케스트레이션이 아니다.

---

**문제 10.** 순수 AWS 환경에서 이벤트 기반·간헐적 워크플로우를 만든다. 워크플로우가 안 돌 때 상시 비용이 발생하지 않기를 원하고, 다수 AWS 서비스를 세밀하게 통합해야 한다.

A) MWAA로 Airflow DAG를 구성하고 워크플로우를 이벤트로 트리거한다
B) Step Functions
C) 상시 EC2에 cron을 걸어 워크플로우를 폴링 방식으로 실행한다
D) EC2에 Jenkins를 설치해 파이프라인 잡으로 AWS 서비스를 호출한다

**정답: B**

해설: Step Functions는 완전 서버리스로 상태 전이당 과금되어 안 돌면 비용이 0에 수렴하고, 200개 이상 AWS 서비스를 네이티브로 통합한다. 이벤트 기반·간헐적·AWS 종속 환경에 최적. A(MWAA)는 Airflow 환경(웹서버·스케줄러)이 잡이 없어도 상시 떠 있어 시간당 비용이 계속 나가므로 "상시 비용 회피"에 불리 — 9번과 10번이 MWAA vs Step Functions를 정반대 조건으로 가르는 한 쌍이다. C·D는 인프라를 직접 운영하고 상시 비용·관리 부담이 크다.

---

**문제 11.** 데이터 레이크에 매주 새 테이블이 수십 개 추가된다. 추가될 때마다 수동 권한 부여가 부담이다. 새 테이블에 자동으로 권한이 적용되게 하려면?

A) 새 테이블이 생길 때마다 해당 테이블 ARN을 IAM Policy에 수동으로 추가한다
B) Lake Formation LF Tag(태그 기반 접근 제어, ABAC)
C) S3 객체 태그로 분류하고 태그 조건 기반 버킷 정책으로 접근을 통제한다
D) Glue Trigger로 새 테이블 감지 시 권한 부여 스크립트를 자동 실행한다

**정답: B**

해설: LF Tag는 ABAC로 데이터에 분류 태그를 붙이고 사용자/역할에 태그 권한을 줘, 새 테이블·컬럼이 태그를 받는 순간 권한이 자동 적용된다. 자원이 늘어도 정책 수가 선형으로만 증가해 스케일링된다(NIST SP 800-162 ABAC). A는 수동 부담 그대로. C는 LF 권한과 무관한 S3 태그. D는 직접 스크립트를 짜고 유지해야 해 관리형 ABAC 이점이 없다. "새 테이블 자동 권한 + 대규모"는 LF Tag.

---

**문제 12.** 두 개의 분리된 RA3 클러스터(BI팀·데이터 과학팀)가 같은 매출 데이터를 읽어야 한다. 데이터 복제·동기화 비용을 피하면서 각 팀 쿼리가 서로의 성능에 영향을 주지 않게 격리하려면?

A) 한 클러스터를 두 팀이 공유
B) Redshift Data Sharing(프로듀서 → 컨슈머)
C) 각 팀이 데이터를 COPY로 복제
D) Redshift Spectrum으로 공유

**정답: B**

해설: RA3의 Data Sharing은 데이터가 RMS(S3 기반)에 있다는 점을 활용해 프로듀서 클러스터의 데이터를 복사 없이 컨슈머 클러스터가 읽기 공유하게 한다. 각 클러스터는 독립 컴퓨팅을 가져 워크로드가 격리되고(서로 성능 영향 없음) 복제·동기화 부담이 없다(멀티 계정·멀티 리전 지원). A는 워크로드 격리 실패(자원 경합). C는 복제 비용·동기화 부담 발생. D(Spectrum)는 S3 외부 데이터 질의용이지 Redshift 내부 테이블 공유 메커니즘이 아니다. "복제 없이 다중 클러스터 공유 + 워크로드 격리"는 Data Sharing.

---

## 📌 Week 9 at a Glance

```
Storage    ──► S3 Raw/Curated/Trusted (Parquet + partitions + compression)
Format     ──► Iceberg/Hudi/Delta (ACID·time-travel·upsert)
Catalog    ──► Glue Data Catalog (Hive Metastore compatible, hub for all engines)
Process    ──► Glue (serverless ETL) / EMR (full, Task=Spot Fleet) / Athena CTAS
DW         ──► Redshift RA3·Serverless (Spectrum·Federated·Sharing·Zero-ETL)
Stream     ──► Kinesis (KDS/Firehose) / MSK (Kafka standard)·Serverless·Connect
Perms      ──► Lake Formation (rows·columns·cells, LF Tag ABAC, RAM cross-account)
Orch       ──► MWAA (Airflow DAG, portability) / Step Functions (ASL, serverless·AWS integration)
Govern     ──► DataZone (marketplace) / Glue Data Quality (DQDL)
```

**Key Single-Line Boundary Drawers**: Glue vs EMR = cluster ops, Athena vs Redshift = ad-hoc vs DW, Spectrum vs Federated = S3 vs OpDB, Federated vs Zero-ETL = OpDB load, MSK vs Kinesis = portability vs simplicity, LF vs IAM = row·column granularity, MWAA vs Step Functions = portability vs serverless.

Next week (Week 10): **ML/AI Architecture** — SageMaker, Bedrock, MLOps.
