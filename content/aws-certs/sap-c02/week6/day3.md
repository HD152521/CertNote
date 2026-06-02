# Day 28 - AWS Database Migration Service (DMS) + SCT

📅 날짜: Week 6 (Day 3)
🎯 주제: 데이터베이스 마이그레이션·이종 엔진 변환
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- DMS Full Load + CDC 동작을 안다
- 동종(homogeneous) vs 이종(heterogeneous) 마이그레이션 차이를 안다
- SCT(Schema Conversion Tool)의 역할을 안다
- Multi-AZ, Serverless DMS, FleetAdvisor를 안다

---

## 🧩 사전 지식 (CS 기초)

- **CDC (Change Data Capture)**: 변경 데이터만 캡처. Binlog/WAL/Redo Log 활용.
- **Schema vs Data**: 스키마(DDL)와 데이터(DML) 분리.
- **OLTP vs OLAP**: 트랜잭션 vs 분석. DMS는 두 방향 모두 가능.

---

## 📖 이론 내용

### 1. DMS 개요

- 원본 DB ↔ 대상 DB 데이터 마이그레이션
- 원본 운영 중에도 가능 (CDC)
- 다양한 엔진 (Oracle, SQL Server, MySQL, PostgreSQL, MongoDB, DynamoDB 등)
- 대상으로 S3·Kinesis·Redshift도 가능 (분석)

### 2. Full Load + CDC 흐름

```
1. Full Load: 원본 전체 → 대상 한 번에
2. CDC 시작: 원본 변경 트랜잭션 캡처 → 대상에 적용
3. 양쪽 동기 후 컷오버 (앱 endpoint 변경)
```

### 3. 동종 vs 이종

| 종류 | 예 | SCT 필요? |
|------|----|-----------|
| **동종** | MySQL → RDS MySQL, Oracle → Oracle on EC2 | ❌ |
| **이종** | Oracle → PostgreSQL, SQL Server → Aurora | ✅ |

### 4. SCT (Schema Conversion Tool)

- 이종 엔진의 스키마·코드(저장 프로시저·트리거) 변환
- Oracle PL/SQL → PostgreSQL PL/pgSQL 자동 변환 + 수동 수정 부분 리포트
- 데이터 자체는 DMS가 옮김

### 5. DMS 운영 형태

- **Replication Instance** (EC2 기반): 표준
- **DMS Serverless** (2023): 자동 확장
- **Multi-AZ Replication Instance**: HA

### 6. DMS Fleet Advisor

- 온프레미스 DB 인벤토리 자동 발견·평가
- 마이그레이션 권장사항 생성

### 7. 대규모 사례 패턴

- **Oracle → Aurora PostgreSQL**: 가장 흔한 시나리오
- SCT로 스키마 변환 → DMS로 Full Load + CDC → 컷오버
- 라이선스 비용 절감 + AWS 통합

### 8. 대안: Babelfish

- **Aurora PostgreSQL Babelfish**: SQL Server TDS 프로토콜 호환
- SQL Server 앱 코드 거의 변경 없이 마이그
- "SQL Server → 비용 절감 + 코드 변경 최소" → Babelfish

---

## 🧠 알아두면 좋은 심화 이론

### S3·Kinesis·Redshift Target

- **S3 Target**: 데이터 레이크 적재
- **Kinesis Target**: 실시간 분석
- **Redshift Target**: DW

### Cross-Reference

- **Day 26**: Replatform
- **Day 29**: App2Container

---

## 🏗️ 아키텍처 다이어그램 — Oracle → Aurora PostgreSQL

```
Oracle (On-Prem)
   │
   │  1. SCT: 스키마·PL/SQL 변환 → Aurora PG로
   │  2. DMS Full Load: 데이터 전송
   │  3. DMS CDC: 실시간 변경 동기
   ▼
Aurora PostgreSQL
   │
   │  4. 앱 검증 후 컷오버
   ▼
Production
```

---

## ⭐ 핵심 포인트

1. ⭐ **이종 엔진 = SCT + DMS**, 동종 = DMS만
2. ⭐ **Full Load + CDC**로 무중단 컷오버
3. ⭐ DMS 대상으로 **S3·Kinesis·Redshift**도 가능
4. ⭐ **DMS Serverless**로 운영 부담↓
5. ⭐ **Babelfish** = SQL Server 호환 Aurora (코드 변경 최소)

---

## 💻 실제 예시 - DMS Replication Task

```bash
aws dms create-replication-task \
  --replication-task-identifier oracle-to-aurora \
  --source-endpoint-arn arn:...:oracle \
  --target-endpoint-arn arn:...:aurora-pg \
  --replication-instance-arn arn:...:repl-inst \
  --migration-type full-load-and-cdc \
  --table-mappings file://mappings.json
```

---

## 📝 연습 문제

**문제 1.** Oracle → Aurora PostgreSQL, 무중단. Best?

A) DMS만
B) DMS + SCT (스키마 변환)
C) 백업·복원
D) Snow

**정답: B**
해설: 이종 엔진 = SCT + DMS.

---

**문제 2.** SQL Server 앱을 코드 변경 최소로 비용 절감. Best?

A) Aurora MySQL
B) Aurora PostgreSQL with Babelfish
C) DynamoDB
D) DocumentDB

**정답: B**
해설: Babelfish = SQL Server TDS 호환.

---

**문제 3.** DMS 대상으로 가능하지 않은 것은?

A) RDS
B) Aurora
C) DynamoDB
D) Lambda

**정답: D**
해설: Lambda는 대상 아님. RDS/Aurora/DynamoDB/S3/Kinesis/Redshift 등 OK.

---

**문제 4.** DMS Full Load 후 운영 변경 분도 동기. Best?

A) Full Load만
B) Full Load + CDC
C) Snapshot copy
D) Manual export

**정답: B**
해설: CDC가 변경 분 캡처.

---

**문제 5.** 온프레미스 DB 인벤토리 자동 발견·평가. Best?

A) DMS 자체
B) DMS Fleet Advisor
C) Application Discovery Service
D) Trusted Advisor

**정답: B**
해설: Fleet Advisor = DB 인벤토리.

---

**문제 6.** DMS Serverless의 이점은?

A) 비용 100% 절감
B) 자동 확장·운영 부담↓
C) 무료
D) 보안 강화

**정답: B**
해설: 자동 확장·서버리스 운영.

---

## 📌 오늘의 요약

1. 동종 = DMS만, 이종 = SCT + DMS
2. Full Load + CDC로 무중단
3. S3·Kinesis·Redshift도 DMS Target
4. Babelfish = SQL Server 호환 Aurora
5. Fleet Advisor로 DB 인벤토리
