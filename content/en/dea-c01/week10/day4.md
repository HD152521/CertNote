# Day 4 - Common Traps & Keywords: "Requirement → Service" Translation Guide

The most common reason for lost points on the exam is not lack of knowledge but **confusing service pairs** and **trap keywords**. Today we lock in the "requirement → service" translation guide to have at your fingertips before the exam, and identify the look-alike pairs that commonly trick test-takers. Master this translation table and you can zero in on the right answer just by reading keywords, even in long scenarios.

## Core Translation Table: Requirement to Service

| Requirement Keyword | Answer Service | One-Line Reason |
|----------------|------------|-----------|
| Serverless SQL, direct S3 queries, pay-per-scan | Athena | Presto SQL without infrastructure |
| Streaming, real-time, shards, replay | Kinesis Data Streams | Direct consumption, order, retention |
| Streaming managed load → S3/Redshift | Data Firehose | Auto buffering, transformation, delivery |
| Kafka-compatible | Amazon MSK | Managed Apache Kafka |
| Centralized permissions, column/row data access | Lake Formation | Granular governance |
| Shared metastore, schema inference | Glue Data Catalog + crawler | Catalog & schema |
| Incremental ETL, skip already-processed data | Glue job bookmarks | Process state tracking |
| Serverless Spark ETL, scheduled | AWS Glue | Managed ETL |
| Large scale, fine tuning, existing Spark/Hive | Amazon EMR | Managed Hadoop |
| Petabyte-scale analytical DW, columnar MPP | Amazon Redshift | OLAP |
| Hot=DW, cold=S3 query without load | Redshift Spectrum | Tiering |
| DB change (CDC) real-time copy | AWS DMS | Full load + CDC |
| Run existing Airflow DAG as-is | Amazon MWAA | Managed Airflow |
| Heterogeneous step coordination, branch, retry | Step Functions | Serverless state machine |
| Streaming window aggregation (SQL/Flink) | Managed Service for Apache Flink | Real-time windows |
| Sensitive data (PII) auto-discovery & classify | Amazon Macie | ML-based detection |
| API call audit (who, when) | CloudTrail | Audit log |
| Key rotation, per-key control, crypto audit | KMS (SSE-KMS) | Customer-managed keys |
| Data quality rule validation | Glue Data Quality | DQDL rules |

> 💡 **Related theory**: The exam almost always phrases questions using the "left column" language, not service names. Train yourself to map by "requirement expression" rather than service name, and you'll respond instantly in the real exam.

## Commonly Confused Service Pairs (Traps)

| Pair | Distinguishing Factor |
|----|----------|
| Kinesis Data Streams vs Firehose | Direct consumption & replay = Streams / Managed load = Firehose |
| Athena vs Redshift | Ad-hoc, serverless, unstructured = Athena / Large-scale always-on DW = Redshift |
| Glue vs EMR | Serverless, simple = Glue / Large-scale, fine-tuning = EMR |
| Step Functions vs MWAA | Orchestrate heterogeneous AWS = Step Functions / Existing Airflow DAG = MWAA |
| Lake Formation vs IAM | Data (column/row) access = LF / Service/API operational permission = IAM |
| CloudTrail vs CloudWatch Logs | Who called API = CloudTrail / App runtime logs, root cause = CloudWatch Logs |
| Macie vs GuardDuty | Sensitive data discovery = Macie / Threat/breach detection = GuardDuty |
| SSE-KMS vs SSE-S3 | Key control & audit needed = KMS / Simple managed = S3 |

> 💡 **Related theory**: When you see "direct consumption / replay / order guarantee," think Kinesis Data Streams, not Firehose. Firehose has no consumer/shard concept. Get this one right and you'll ace most streaming questions.

## Expression Traps: Same Words, Different Meanings

- **"Real-time"** vs **"near real-time" / micro-batch**: True per-second → Kinesis/Flink; minute-level acceptable → Firehose buffer/Glue micro-batch.
- **"Serverless / minimal ops"**: Cross out always-on EMR, persistent clusters, EC2.
- **"Minimal cost"**: Cross out always-on, over-provisioned options; favor S3 tiering, Spectrum, serverless.
- **"Reuse existing code"**: Spark/Hive large-scale → EMR; Airflow → MWAA.
- **"Is it possible" vs "most appropriate"**: When two answers both work, re-read constraints and pick the better fit for ops, cost, or latency.

> 💡 **Related theory**: AWS exam wrong answers aren't "incorrect"—they're "less suitable." When two answers seem right, re-read the requirement and pick the one that best satisfies operational burden, cost, and latency constraints.

## Key Takeaways

- The exam asks in "requirement language," not service names. Memorize the translation table.
- Master the confusing pairs: Streams/Firehose, Athena/Redshift, Glue/EMR, Step Functions/MWAA, LF/IAM, CloudTrail/CloudWatch, Macie/GuardDuty.
- Keywords "serverless, minimal cost" eliminate always-on cluster options immediately.
- "Most appropriate" beats "possible" — reread constraints when two answers work.

## 📝 연습 문제

**문제 1.** 스트리밍 데이터를 여러 독립 애플리케이션이 각자 컨슈머로 직접 읽고, 24시간 내 데이터를 재처리할 수 있어야 한다. 가장 적합한 서비스는?

A) Amazon Data Firehose  
B) Amazon SNS  
C) Amazon Kinesis Data Streams  
D) Amazon SQS FIFO  

**정답: C**  
해설: Kinesis Data Streams는 샤드 기반으로 여러 컨슈머가 독립적으로 읽고 보존 기간 내 재처리(re-read)가 가능합니다. Firehose는 직접 소비·재처리 개념이 없고, SNS/SQS는 스트림 재처리 모델이 아닙니다.

---

**문제 2.** "누가 어떤 S3 버킷에 PutObject API를 언제 호출했는지" 감사해야 한다. 가장 적합한 서비스는?

A) Amazon CloudWatch Logs  
B) AWS CloudTrail  
C) Amazon Macie  
D) AWS Config  

**정답: B**  
해설: CloudTrail은 계정의 API 호출(주체·시각·액션)을 기록하는 감사 서비스입니다. CloudWatch Logs는 애플리케이션 로그, Macie는 민감정보 탐지, Config는 리소스 구성 변경 추적으로 API 호출 감사가 주목적이 아닙니다.

---

**문제 3.** 분석가가 임시로 S3 데이터를 표준 SQL로 한 번 조회하려 한다. 상시 클러스터를 두고 싶지 않고 운영 부담을 최소화하려 한다. 가장 적합한 서비스는?

A) Amazon Redshift 상시 클러스터  
B) Amazon EMR  
C) Amazon Athena  
D) EC2에 직접 설치한 Hive  

**정답: C**  
해설: Athena는 서버리스로 상시 인프라 없이 S3를 즉석 SQL 조회하며 스캔량만 과금해 임시·간헐 분석에 가장 적합합니다. Redshift 상시 클러스터·EMR·EC2 Hive는 운영 부담과 비용이 큽니다.

---

**문제 4.** 대규모(수십 TB) 일일 배치를 기존 Spark/Hive 코드로 처리하며, 인스턴스 타입과 튜닝을 세밀히 제어하고 Spot으로 비용을 절감하려 한다. 가장 적합한 서비스는?

A) Amazon EMR  
B) AWS Glue  
C) AWS Lambda  
D) Amazon Athena  

**정답: A**  
해설: EMR은 관리형 Hadoop/Spark 클러스터로 인스턴스 플릿·Spot·세밀한 튜닝과 기존 Spark/Hive 코드 재사용에 적합합니다. Glue는 서버리스라 세밀한 클러스터 제어가 제한적이고, Lambda·Athena는 대규모 배치 처리 엔진이 아닙니다.

---

**문제 5.** S3 버킷에 흩어진 민감 개인정보(PII)를 자동으로 발견·분류하는 것이 목적이다. 침해 위협 탐지가 아니라 데이터 분류가 핵심이다. 가장 적합한 서비스는?

A) Amazon GuardDuty  
B) Amazon Macie  
C) AWS WAF  
D) Amazon Inspector  

**정답: B**  
해설: Macie는 ML로 S3 내 PII·금융정보 등 민감 데이터를 발견·분류합니다. GuardDuty는 위협·침해 탐지, WAF는 웹 공격 차단, Inspector는 취약점 평가로 데이터 분류 기능이 없습니다.

---
