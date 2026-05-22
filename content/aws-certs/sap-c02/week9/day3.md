# Day 43 - EMR, Glue, MWAA — 빅데이터 파이프라인

📅 날짜: Week 9 (Day 3)
🎯 주제: 분산 처리·오케스트레이션
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EMR(매니지드 Hadoop/Spark)의 노드 종류·EMR on EKS·Serverless 차이를 안다
- Glue vs EMR vs Athena의 선택 기준을 이해한다
- MWAA(Managed Airflow) 활용 패턴을 안다
- 데이터 파이프라인 표준 구성 (수집 → 처리 → 적재 → 분석)

---

## 🧩 사전 지식 (CS 기초)

- **DAG (Directed Acyclic Graph)**: 작업 의존 그래프. Airflow의 핵심 모델.
- **Spark RDD vs DataFrame**: RDD는 원시 분산 데이터셋, DataFrame은 스키마 기반 (옵티마이저 활용).
- **YARN**: Hadoop 리소스 관리자. EMR 클러스터의 작업 스케줄링.

---

## 📖 이론 내용

### 1. EMR (Elastic MapReduce)

- Hadoop·Spark·Hive·Presto·HBase·Flink 매니지드
- 노드 종류
  - **Master**: 클러스터 관리
  - **Core**: HDFS + 실행
  - **Task**: 실행 전용 (Spot 적합)
- **EMR Notebooks**: Jupyter 통합
- **EMR Studio**: IDE
- **EMR Serverless**: 서버리스 Spark·Hive
- **EMR on EKS**: EKS 위에서 Spark Job

### 2. EMR Instance Fleets

- 다양한 인스턴스 타입·Spot·On-Demand 가중치 혼합
- 비용·가용성 최적

### 3. Glue vs EMR

| 항목 | Glue | EMR |
|------|------|-----|
| 모델 | 서버리스 Spark | 클러스터 |
| 시작 | 1분 이내 | 5-10분 |
| 사용성 | 노코드/PySpark 일부 | 풀 Spark/Hadoop |
| 비용 | DPU-시간 | 클러스터 시간 |
| 적합 | 가벼운 ETL | 무거운·반복 처리 |

### 4. Athena vs Spark on EMR/Glue

- Athena: 애드혹·BI·서버리스
- Spark: 복잡 변환·ML·반복

### 5. MWAA (Managed Airflow)

- Apache Airflow 매니지드
- DAG으로 워크플로우 정의
- EMR/Glue/SF 등 Operator 활용
- Step Functions와의 비교: Airflow는 오픈소스·이식성, SF는 매니지드·서비스 통합 깊음

### 6. AWS Step Functions vs MWAA

| 항목 | Step Functions | MWAA |
|------|---------------|------|
| 정의 | ASL JSON | Python DAG |
| 통합 | 200+ 서비스 직접 | Operator 다양 |
| 운영 | 0 | Airflow Web/Scheduler 관리 |
| 이식성 | AWS 종속 | Airflow OSS |

### 7. 데이터 파이프라인 표준

```
[수집] Firehose / DMS / Kinesis
   ↓
[저장] S3 Raw
   ↓
[처리] Glue / EMR / Athena CTAS
   ↓
[적재] S3 Curated, Redshift, OpenSearch
   ↓
[분석] Athena, Redshift, SageMaker, QuickSight
```

### 8. AWS DataZone

- 데이터 거버넌스·카탈로그·도메인 공유
- Lake Formation·Glue Catalog와 연계

---

## 🧠 알아두면 좋은 심화 이론

### EMR Spot Instance Fleet

- Task 노드를 Spot으로 100%
- Spot 중단 시 다른 인스턴스 타입 자동 교체

### EMR Managed Scaling

- 워크로드에 따라 자동 노드 수 조정

### Glue Streaming ETL

- Kinesis/Kafka 입력 ETL (마이크로 배치)

---

## 🏗️ 다이어그램 — 표준 데이터 파이프라인

```
[App] → Firehose → s3://raw/ (Parquet)
            │
            ▼
        Glue Crawler → Catalog
            │
            ▼
   Glue Job (PySpark) → s3://curated/
            │
            ▼
    MWAA DAG → Athena/Redshift/SageMaker
```

---

## ⭐ 핵심 포인트

1. ⭐ EMR = 풀 Spark/Hadoop / Glue = 서버리스 Spark / Athena = SQL
2. ⭐ EMR Task 노드 Spot, Instance Fleets로 비용↓
3. ⭐ EMR Serverless = 클러스터 없이 Spark
4. ⭐ Glue Job Bookmark = 증분 처리
5. ⭐ MWAA = Python DAG·OSS, SF = ASL·AWS 깊은 통합
6. ⭐ Firehose → S3 Raw → Glue → Athena/Redshift 패턴

---

## 💻 실제 예시 - EMR Step 제출

```bash
aws emr create-cluster \
  --name etl-cluster \
  --release-label emr-7.0.0 \
  --applications Name=Spark Name=Hive \
  --instance-fleets file://fleets.json \
  --use-default-roles
```

---

## 📝 연습 문제

**문제 1.** 시작 빠르고 가벼운 ETL — 클러스터 관리 X.

A) EMR On-Demand
B) Glue
C) Lambda
D) Redshift

**정답: B**

---

**문제 2.** EMR Task 노드 비용 최적화.

A) On-Demand
B) Spot + Instance Fleet
C) RI
D) Dedicated Host

**정답: B**

---

**문제 3.** Python DAG, Airflow 이식성 필요.

A) Step Functions
B) MWAA
C) Glue Workflow
D) Data Pipeline (legacy)

**정답: B**

---

**문제 4.** 클러스터 없이 Spark Job 한 번 실행.

A) EMR On-Demand
B) EMR Serverless
C) Glue Crawler
D) Athena

**정답: B**

---

**문제 5.** EMR Spark Job을 EKS 위에서 실행.

A) EMR on EC2
B) EMR on EKS
C) ECS Fargate
D) Step Functions

**정답: B**

---

**문제 6.** Glue Job 재실행 시 이미 처리한 파일 건너뜀.

A) Job Bookmark
B) Crawler Re-run
C) Workflow
D) Trigger

**정답: A**

---

## 📌 오늘의 요약

1. EMR = 풀 / Glue = 서버리스 / Athena = SQL
2. Task 노드 Spot + Instance Fleet
3. EMR Serverless·on EKS
4. MWAA = Airflow OSS DAG
5. 표준 파이프라인 = 수집·저장·처리·적재·분석
