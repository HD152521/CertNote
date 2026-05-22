# Day 23 - DynamoDB: 키 설계, 용량 모드, Streams

📅 날짜: Week 5 (Day 3)
🎯 주제: 서버리스 NoSQL의 핵심
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 파티션 키 / 정렬 키 / LSI / GSI 차이를 안다
- 온디맨드 vs 프로비저닝드 + Auto Scaling 선택을 한다
- Streams / Global Tables / DAX 사용 사례를 매핑한다

---

## 🧩 사전 지식 (CS 기초)

- **NoSQL의 키-값 / 도큐먼트**: 스키마 유연. JOIN 없음.
- **파티셔닝**: 데이터를 키 해시로 여러 노드에 분산. **Hot Partition**(특정 키 폭증)은 성능 최대 적.
- **결과적 일관성 vs 강한 일관성**: NoSQL 디폴트는 결과적 일관성. 호출 시 옵션으로 강한 읽기.
- **TTL(Time To Live)**: 자동 만료 삭제.

---

## 📖 이론 내용

### 1. 기본 모델

- **테이블 → 항목(Item) → 속성(Attribute)**.
- **Primary Key**:
  - **Simple**: 파티션 키만
  - **Composite**: 파티션 키 + 정렬 키
- 한 파티션 = 10GB / 3000 RCU / 1000 WCU(단일 파티션 한계).

### 2. 인덱스

| 인덱스 | 종류 | 특징 |
|--------|------|------|
| **LSI (Local Secondary Index)** | 같은 PK, 다른 SK | 강한 일관성 가능. 테이블 생성 시만 |
| **GSI (Global Secondary Index)** | 다른 PK | 비동기 복제, 결과적 일관성. 언제든 추가 |

### 3. 용량 모드

| 모드 | 설명 | 사용 사례 |
|------|------|-----------|
| **On-Demand** | 자동·요청당 과금 | 패턴 모름, 변동 큼 |
| **Provisioned + Auto Scaling** | RCU/WCU 약정 + 자동 확장 | 예측 가능 |

- **1 RCU = 4KB 강한 일관성 읽기 / 1회**, 결과적 일관성은 2회.
- **1 WCU = 1KB 쓰기 / 1회**.
- 트랜잭션은 2배.

### 4. DynamoDB Streams

- 24시간 보존. 변경 이력 캡처(INSERT/MODIFY/REMOVE).
- 트리거: **Lambda**.
- Global Tables / 검색 엔진 연동 / 감사 로그.

### 5. Global Tables

- **멀티 리전 멀티 액티브 복제**.
- 마지막 쓰기 우선(LWW) 충돌 해결.
- 1초 미만 복제.

### 6. DAX (DynamoDB Accelerator)

- **인메모리 캐시**. 마이크로초 응답.
- 읽기 무거운 워크로드.
- 자체 클러스터 / VPC 안.

### 7. PITR / Backup / Export

- **PITR**: 최근 35일, 초 단위.
- **온디맨드 백업**: 영구 보존.
- **S3로 Export**: 분석용. Athena/Glue 연계.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Hot Partition** | 한 키 폭증 → 스로틀링 | PK 설계 균등 분포 |
| **Adaptive Capacity** | 자동으로 hot 파티션에 더 할당 | 자동 완화 |
| **Burst Capacity** | 미사용 용량 5분 분량 | 짧은 spike 흡수 |
| **TTL** | 만료 자동 삭제(eventually) | 세션·임시 데이터 |
| **Conditional Write** | optimistic locking | 동시성 |
| **Transactions** | ACID, 25 아이템 한도 | RDB 비슷한 무결성 |

> ⚠️ **함정**: "강한 일관성 GSI" → **GSI는 결과적 일관성만**. 강한 일관성 필요하면 LSI(테이블 생성 시) 또는 base table.

> 💡 **암기 팁**: 패턴 모름 = **On-Demand**, 예측 가능 = **Provisioned + AS**, 읽기 폭증 = **DAX**, 멀티 리전 = **Global Tables**.

### 관련 서비스 Cross-Reference

- ElastiCache vs DAX → Day 4
- Streams + Lambda → Week 6
- S3 Export + Athena → 분석

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 DynamoDB 사용 패턴 ]

  API GW → Lambda → DynamoDB (PK: customerId)
                       │
                       │ Streams
                       ▼
                     Lambda
                       ├─ ElasticSearch/OpenSearch 인덱싱
                       ├─ Email 알림
                       └─ 다른 테이블에 derived 쓰기

[ 읽기 트래픽 폭발 → DAX ]

  Read-heavy App → DAX cluster (in VPC) → DynamoDB
                    ↑ μs latency
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **파티션 키 균등 분포**가 가장 중요. Hot Partition은 SAA 시나리오 단골.
2. ⭐ **GSI = 결과적 일관성만**, LSI는 강한 일관성 가능.
3. ⭐ **On-Demand vs Provisioned + AS** 선택은 패턴 예측 가능성.
4. ⭐ **Streams → Lambda**가 변경 이벤트 처리의 정답.
5. ⭐ **DAX** = DynamoDB 읽기 가속 (μs).

---

## 💻 실제 예시 - AWS CLI

```bash
# 테이블 생성 (On-Demand)
aws dynamodb create-table --table-name Orders \
  --attribute-definitions AttributeName=customerId,AttributeType=S AttributeName=orderId,AttributeType=S \
  --key-schema AttributeName=customerId,KeyType=HASH AttributeName=orderId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

# GSI 추가
aws dynamodb update-table --table-name Orders \
  --attribute-definitions AttributeName=status,AttributeType=S \
  --global-secondary-index-updates 'Create={IndexName=status-index,KeySchema=[{AttributeName=status,KeyType=HASH}],Projection={ProjectionType=ALL}}'

# Streams + Lambda 트리거
aws dynamodb update-table --table-name Orders \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
aws lambda create-event-source-mapping --function-name myFunc \
  --event-source-arn arn:aws:dynamodb:...:stream/...

# PITR
aws dynamodb update-continuous-backups --table-name Orders \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

---

## 📝 연습 문제

**문제 1.** 트래픽 패턴이 매우 변동적이고 예측 불가:

A) Provisioned + AS B) On-Demand C) DAX D) Aurora

**정답: B**.

---

**문제 2.** DynamoDB 읽기가 너무 많아서 μs 지연이 필요:

A) ElastiCache Redis B) DAX C) Global Tables D) GSI 추가

**정답: B**.

---

**문제 3.** 멀티 리전 액티브-액티브 NoSQL:

A) Aurora Global B) DynamoDB Global Tables C) ElastiCache Cluster D) DocumentDB

**정답: B**.

---

**문제 4.** 동일 PK에서 다른 정렬 키로 정확한 강한 일관성 쿼리:

A) GSI B) LSI C) Streams D) Scan

**정답: B**.

---

**문제 5.** DynamoDB 항목 변경 시 자동 후속 작업:

A) Scheduled Lambda B) Streams + Lambda 트리거 C) Step Functions D) SQS Polling

**정답: B**.

---

## 📌 오늘의 요약

1. PK 균등 분포가 성능의 출발점.
2. GSI 결과적 일관성, LSI 강한 일관성.
3. 패턴 모름 = On-Demand.
4. Streams + Lambda가 후속 작업의 표준.
5. DAX는 읽기 폭증, Global Tables는 멀티 리전.
