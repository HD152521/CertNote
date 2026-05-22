# Day 44 - Lake Formation, 데이터 거버넌스, MSK

📅 날짜: Week 9 (Day 4)
🎯 주제: 거버넌스·세분화 권한·실시간 스트림
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lake Formation의 권한 모델(LF Tag·세분화 권한)을 이해한다
- Cross-Account Data Lake 패턴을 안다
- MSK(Apache Kafka 매니지드)의 핵심·MSK Serverless·MSK Connect
- 데이터 거버넌스 도구(DataZone·Data Quality)

---

## 🧩 사전 지식 (CS 기초)

- **RBAC vs ABAC**: 역할 기반 vs 속성 기반(태그). LF Tag = ABAC.
- **Row-Level Security vs Column-Level Security**: 행·열 단위 권한.
- **Kafka**: 분산 스트림 플랫폼. Topic·Partition·Broker·Consumer Group.

---

## 📖 이론 내용

### 1. AWS Lake Formation

- Data Lake용 세분화 권한 관리
- Glue Catalog 위에서 동작 (DB·Table·Column·Row·Tag)
- IAM과 별개의 권한 레이어 추가
- 권한 부여 단위: DB/Table/Column/Row 필터/Cell

### 2. LF Tag-Based Access Control

- 태그(예: `classification=PII`) 부여 → 사용자/역할에 태그 권한
- 새 테이블·컬럼이 태그를 받으면 자동으로 권한 적용 → 스케일↑

### 3. Cross-Account Data Lake

- 한 계정(Producer)의 데이터를 다른 계정(Consumer)에서 권한 부여
- RAM(Resource Access Manager)으로 Glue Catalog 공유
- Lake Formation으로 행·열 단위 세분 권한

### 4. AWS Glue Data Quality

- Catalog 테이블에 데이터 품질 룰 정의 (DQDL)
- 자동/주기 검사·EventBridge 알림
- 룰 추천 ML 사용

### 5. AWS DataZone

- 데이터 도메인 카탈로그·공유·구독
- 데이터 프로듀서/컨슈머 경험 분리
- Lake Formation·Glue·Redshift·S3 통합

### 6. Amazon MSK

- Apache Kafka 매니지드
- Broker EC2 직접 + EBS/스토리지 자동
- IAM·SASL/SCRAM·mTLS 인증
- **MSK Serverless** (2022): 클러스터 사이징 없음
- **MSK Connect**: Kafka Connect 매니지드 (Debezium 등)

### 7. MSK vs Kinesis Data Streams

| 항목 | MSK | Kinesis Data Streams |
|------|-----|---------------------|
| 표준 | Kafka OSS | AWS 독자 |
| 이식성 | 매우 좋음 | AWS 종속 |
| 운영 | 일부 사용자 책임(자체관리 옵션) | 매니지드 |
| 가격 | Broker 시간·스토리지 | 샤드·시간 |
| 적합 | Kafka 표준·복잡 토픽 | 단순·고처리량 |

### 8. Data Quality & Lineage

- Glue Data Catalog Lineage(자동 추적)
- 외부 도구: OpenLineage, Marquez

---

## 🧠 알아두면 좋은 심화 이론

### LF Hybrid Mode

- IAM 권한 + Lake Formation 권한 병행
- 마이그레이션 중 점진 이전

### MSK Serverless 한계

- 토픽당 처리량 한도, 일부 기능 미지원
- 표준 MSK가 더 유연

---

## 🏗️ 다이어그램 — Cross-Account Data Lake (LF)

```
[Producer Account]
   Glue Catalog ─ RAM Share ─ ► [Consumer Account]
                                        │
                                Lake Formation 권한
                                ├─ Column Filter (PII 제외)
                                └─ Row Filter (region=KR만)
                                        │
                                Athena/Redshift 조회
```

---

## ⭐ 핵심 포인트

1. ⭐ Lake Formation = Catalog 위 세분화 권한(행·열·셀)
2. ⭐ LF Tag(ABAC)로 스케일링 가능한 권한
3. ⭐ Cross-Account = RAM + LF
4. ⭐ Glue Data Quality = DQDL 룰
5. ⭐ DataZone = 데이터 도메인 카탈로그
6. ⭐ MSK = Kafka 표준, Serverless·Connect 옵션
7. ⭐ MSK vs Kinesis: 이식성 vs 단순성

---

## 💻 실제 예시 - LF Permissions Grant

```bash
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::xxx:role/Analyst \
  --resource '{"Table":{"DatabaseName":"sales","Name":"orders"}}' \
  --permissions SELECT
```

### LF Tag Grant

```bash
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::xxx:role/Analyst \
  --resource '{"LFTag":{"TagKey":"classification","TagValues":["public"]}}' \
  --permissions DESCRIBE ASSOCIATE
```

---

## 📝 연습 문제

**문제 1.** Data Lake 컬럼 단위 세분 권한(PII 컬럼만 제외).

A) IAM Policy
B) Lake Formation Column-Level Permission
C) S3 Bucket Policy
D) KMS

**정답: B**

---

**문제 2.** 새 테이블이 추가될 때 자동으로 권한 적용 — 운영 부담↓.

A) IAM Policy 수동
B) Lake Formation LF Tag
C) S3 Tag
D) Glue Trigger

**정답: B**

---

**문제 3.** Kafka 표준 사용·매니지드 운영.

A) Kinesis Data Streams
B) MSK
C) SQS
D) MQ

**정답: B**

---

**문제 4.** 다른 계정의 Glue Catalog DB 공유.

A) IAM Role 교차
B) RAM + Lake Formation
C) S3 Bucket Policy
D) Direct Connect

**정답: B**

---

**문제 5.** Catalog 테이블 데이터 품질 룰 정의·자동 검사.

A) Athena WHERE
B) Glue Data Quality (DQDL)
C) DataBrew
D) Lambda

**정답: B**

---

**문제 6.** 클러스터 사이징 없이 Kafka 사용.

A) MSK Serverless
B) Kinesis
C) MQ
D) AppSync

**정답: A**

---

## 📌 오늘의 요약

1. Lake Formation = 행·열·셀 권한, Tag(ABAC)
2. Cross-Account = RAM + LF
3. Glue Data Quality·DataZone
4. MSK = Kafka 표준, Serverless·Connect
5. Kafka vs Kinesis 트레이드오프
