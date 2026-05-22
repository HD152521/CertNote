# Day 45 - Week 9 복습 + 시나리오 10문항

📅 날짜: Week 9 (Day 5)
🎯 주제: 데이터 아키텍처 종합
⏱️ 학습 시간: 약 90분

---

## 📖 Week 9 핵심 정리

1. **Data Lake 3계층**: Raw/Curated/Trusted
2. **Parquet + 파티션 + 압축** = 비용·속도 핵심
3. **Glue Catalog** = 공통 메타, Crawler·ETL·DataBrew
4. **Iceberg/Hudi/Delta** = 트랜잭션 Lake
5. **Redshift RA3·Serverless·Spectrum·Federated Query·Data Sharing**
6. **Aurora Zero-ETL with Redshift**
7. **EMR = 풀 Spark/Hadoop, Glue = 서버리스 ETL, Athena = SQL**
8. **EMR Serverless·on EKS·Instance Fleets Spot**
9. **MWAA = Airflow OSS DAG**
10. **Lake Formation = 행·열·셀 권한, Tag ABAC**
11. **MSK = Kafka 표준, Serverless·Connect**
12. **DataZone·Glue Data Quality**

---

## 🔄 비교표

| A | B | 차이 |
|---|---|------|
| **Glue** vs **EMR** | 서버리스 vs 클러스터 | 시작·운영 |
| **Athena** vs **Redshift** | 애드혹 SQL S3 vs DW | 워크로드 |
| **Spectrum** vs **Federated Query** | S3 vs RDS/Aurora | 데이터 위치 |
| **MSK** vs **Kinesis** | Kafka 표준 vs AWS 독자 | 이식성 |
| **Lake Formation** vs **IAM** | 세분 권한·Tag vs 광범위 | 단위 |
| **MWAA** vs **Step Functions** | DAG·OSS vs ASL·AWS | 이식성·통합 |
| **DataZone** vs **Lake Formation** | 도메인 카탈로그 vs 권한 | 거버넌스 |

---

## 📝 시나리오 10문항

---

**문제 1.** Athena 스캔 비용 90%↓.

A) WHERE만
B) Parquet + 파티션 + 압축
C) Workgroup
D) Result Reuse

**정답: B**

---

**문제 2.** S3 Data Lake + Glue Catalog + Redshift에서 직접 조회.

A) Federated Query
B) Spectrum
C) COPY
D) Data Sharing

**정답: B**

---

**문제 3.** Aurora PostgreSQL OLTP를 Redshift에 실시간 분석. ETL X.

A) DMS 1시간 배치
B) Zero-ETL Aurora → Redshift
C) Glue
D) Firehose

**정답: B**

---

**문제 4.** Data Lake에서 PII 컬럼 제외 권한.

A) IAM Policy
B) Lake Formation Column Permission
C) Bucket Policy
D) S3 Object Lock

**정답: B**

---

**문제 5.** EMR Task 노드 비용 최적화.

A) On-Demand
B) Spot + Instance Fleet
C) RI
D) Dedicated

**정답: B**

---

**문제 6.** 시작 빠른 가벼운 ETL — 클러스터 X.

A) EMR
B) Glue Job
C) Lambda
D) Redshift

**정답: B**

---

**문제 7.** Kafka 표준·이식성 + 매니지드.

A) Kinesis
B) MSK
C) SQS
D) MQ

**정답: B**

---

**문제 8.** ACID·시간여행이 필요한 Data Lake.

A) Parquet
B) Iceberg/Hudi/Delta
C) CSV
D) Avro

**정답: B**

---

**문제 9.** 데이터 품질 룰 자동 검사.

A) Athena
B) Glue Data Quality (DQDL)
C) DataBrew Profile
D) Lambda

**정답: B**

---

**문제 10.** Python DAG·이식성 워크플로우.

A) Step Functions
B) MWAA
C) Glue Workflow
D) Data Pipeline

**정답: B**

---

## 📌 Week 9 한눈에

```
저장   ──► S3 Raw/Curated/Trusted (Parquet+파티션)
카탈로그 ──► Glue Data Catalog
ETL    ──► Glue(서버리스) / EMR(풀) / Athena CTAS
DW     ──► Redshift RA3·Serverless (Spectrum·Federated·Sharing)
스트림 ──► Kinesis(KDS/Firehose) / MSK / MSK Serverless
권한   ──► Lake Formation (LF Tag, 행·열·셀)
오케스트 ──► MWAA (DAG) / Step Functions
거버넌스 ──► DataZone / Glue Data Quality
```

다음 주(Week 10): **ML/AI 아키텍처** — SageMaker·Bedrock·MLOps.
