# Day 42 - Redshift 심화와 RA3, Spectrum

📅 날짜: Week 9 (Day 2)
🎯 주제: 클라우드 데이터 웨어하우스
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Redshift 노드 타입(DC2/RA3/Serverless) 선택 기준을 안다
- 분산 키·정렬 키·압축의 영향을 이해한다
- Redshift Spectrum·Federated Query·Data Sharing을 안다
- Workload Management(WLM)·Concurrency Scaling

---

## 🧩 사전 지식 (CS 기초)

- **MPP (Massively Parallel Processing)**: 다수 노드에서 쿼리 병렬 처리. Redshift는 MPP DW.
- **Columnar Storage**: 컬럼 단위 저장으로 집계·필터 빠름.
- **Slice**: Redshift 노드 내 병렬 처리 단위. 노드당 다수 슬라이스.

---

## 📖 이론 내용

### 1. 노드 타입

| 타입 | 특징 |
|------|------|
| **DC2** | SSD 로컬 스토리지, 작은 워크로드 |
| **RA3** | 컴퓨트와 스토리지 분리(S3 기반 RMS), 표준 |
| **Serverless** | 워크로드 기반 자동 RPU, 노드 관리 없음 |

### 2. 분산 스타일 (DISTSTYLE)

| 스타일 | 사용 |
|--------|-----|
| **AUTO** | Redshift가 자동 결정 |
| **KEY** | 특정 컬럼 해시 분산 (조인 키) |
| **ALL** | 모든 노드에 복제 (작은 차원 테이블) |
| **EVEN** | 라운드 로빈 |

### 3. 정렬 키 (SORTKEY)

- **COMPOUND**: 다중 컬럼, 첫 컬럼 필터에 유리
- **INTERLEAVED**: 모든 컬럼 균등(트레이드오프 큼, 거의 안 씀)
- 시간 컬럼(`event_date`) 정렬 키가 가장 흔함

### 4. 압축

- 컬럼별 인코딩 자동 분석(`ANALYZE COMPRESSION`)
- ZSTD·LZO·BYTEDICT 등 다양

### 5. Redshift Spectrum

- S3 데이터를 Redshift 노드 거치지 않고 직접 SQL
- Glue Catalog 활용
- Data Lake + Warehouse 통합 (Lake House)

### 6. Federated Query

- Aurora/RDS PostgreSQL·MySQL을 Redshift에서 직접 조회
- ETL 없이 운영 DB 데이터 결합

### 7. Data Sharing

- RA3·Serverless 간 데이터 복사 없이 읽기 공유
- 프로듀서 → 컨슈머 클러스터
- 멀티 계정·멀티 리전 가능

### 8. WLM·Concurrency Scaling

- WLM Queue로 워크로드 격리·우선순위
- **Concurrency Scaling**: 큐 대기 시 일시 클러스터 추가(1일 1시간 무료 크레딧)
- Short Query Acceleration(SQA): 짧은 쿼리 우선

### 9. Aurora Zero-ETL

- Aurora MySQL/PostgreSQL → Redshift 실시간 동기 (CDC)
- ETL 파이프라인 불필요
- Aurora PostgreSQL Zero-ETL with Redshift (2024)

---

## 🧠 알아두면 좋은 심화 이론

### RA3 vs Serverless

| 항목 | RA3 | Serverless |
|------|-----|-----------|
| 노드 관리 | 사용자가 노드 수 | 자동 RPU |
| 비용 | 노드 시간 | RPU-시간 |
| 적합 | 일정 대량 워크로드 | 가변 워크로드 |

### Materialized View

- Auto Refresh로 미리 집계 결과 캐싱
- BI 대시보드 응답 속도↑

---

## 🏗️ 다이어그램 — Redshift Lake House

```
[S3 Data Lake (Parquet)]
        │  Spectrum (External Schema)
        ▼
[Redshift RA3 Cluster]
        │
        ├─ Federated Query → Aurora PG
        ├─ Data Sharing → 다른 RA3 Cluster
        └─ Materialized View → BI Tool (QuickSight/Tableau)
```

---

## ⭐ 핵심 포인트

1. ⭐ RA3 = 컴퓨트·스토리지 분리 표준, Serverless = 가변 워크로드
2. ⭐ DISTKEY·SORTKEY·압축이 성능 좌우
3. ⭐ Spectrum = S3 직접 쿼리(Lake House)
4. ⭐ Federated Query = Aurora/RDS 직접
5. ⭐ Data Sharing = 복사 없는 공유
6. ⭐ Concurrency Scaling 자동 격리
7. ⭐ Aurora Zero-ETL with Redshift

---

## 💻 실제 예시 - External Schema (Spectrum)

```sql
CREATE EXTERNAL SCHEMA lake
FROM DATA CATALOG
DATABASE 'lake_db'
IAM_ROLE 'arn:aws:iam::xxx:role/RedshiftSpectrum';

SELECT customer_id, SUM(amount)
FROM lake.orders_curated
WHERE year='2026' AND month='05'
GROUP BY 1;
```

---

## 📝 연습 문제

**문제 1.** S3 Parquet을 ETL 없이 Redshift SQL로 조회.

A) Spectrum + External Schema
B) Federated Query
C) COPY → 내부 테이블
D) Data Sharing

**정답: A**

---

**문제 2.** 가변·비정기 BI 워크로드. 노드 관리 X.

A) DC2
B) RA3 reserved
C) Redshift Serverless
D) Aurora

**정답: C**

---

**문제 3.** 큰 fact 테이블과 작은 dim 테이블 조인.

A) DISTSTYLE KEY(fact join key)·dim ALL
B) 둘 다 EVEN
C) 둘 다 ALL
D) 둘 다 KEY

**정답: A**

---

**문제 4.** Aurora PostgreSQL OLTP 데이터를 실시간으로 Redshift 분석.

A) Zero-ETL (Aurora → Redshift)
B) DMS CDC
C) Glue ETL 1시간 배치
D) Kinesis

**정답: A**

---

**문제 5.** 두 RA3 Cluster가 같은 데이터 읽기. 복제 비용 회피.

A) Spectrum 공유
B) Data Sharing
C) Snapshot Restore
D) Federated Query

**정답: B**

---

**문제 6.** 큐 대기 시 자동 일시 확장.

A) WLM 큐 수정
B) Concurrency Scaling
C) Auto Scaling
D) Spectrum

**정답: B**

---

## 📌 오늘의 요약

1. RA3 = 표준, Serverless = 가변
2. DISTKEY·SORTKEY·압축 → 성능
3. Spectrum + Federated + Data Sharing = Lake House
4. Zero-ETL with Redshift (Aurora)
5. Concurrency Scaling·WLM
