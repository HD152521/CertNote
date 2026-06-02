# Day 30 - Week 6 복습 + 연습문제 (DynamoDB)

📅 날짜: 2026년 6월 25일 (목요일)  
🎯 주제: DynamoDB 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- DynamoDB의 모든 핵심 개념을 종합 정리한다
- 실전 시험 유형의 DynamoDB 문제를 풀어 실력을 점검한다

---

## 📖 Week 6 핵심 정리

### DynamoDB 기본 스펙 암기
```
항목 최대 크기: 400KB
트랜잭션 최대: 25개 항목, 4MB
RCU: 강력한 1 RCU/4KB, 최종적 0.5 RCU/4KB, 트랜잭션 2 RCU/4KB
WCU: 1 WCU/1KB, 트랜잭션 2 WCU/1KB
LSI 최대: 5개 (생성 시만)
GSI 최대: 20개 (언제든)
Streams 보존: 24시간
```

### 읽기 일관성 정리
```
최종적 일관성: 기본값, 0.5 RCU/4KB, 약간 오래된 데이터 가능
강력한 일관성: ConsistentRead=true, 1 RCU/4KB, 항상 최신
트랜잭션 읽기: 2 RCU/4KB, 원자적 다중 항목 읽기
```

### LSI vs GSI
```
LSI: 같은 PK + 다른 SK, 생성 시만, 강력 일관성 지원, 기본 테이블 용량 공유
GSI: 다른 PK/SK, 언제든 추가, 최종 일관성만, 별도 용량
```

---

## 아키텍처 다이어그램

```
DynamoDB 완전한 아키텍처 패턴
================================

[API Gateway]
     |
     v
[Lambda - CRUD API]
     |
     +--[GetItem/Query]--> [DynamoDB Table]
     |                         |
     |                    [GSI: 카테고리별 조회]
     |                    [LSI: 날짜별 정렬]
     |
     +--[TransactWrite]
         주문 생성 + 재고 차감 (원자적)
     |
     |   [DynamoDB Streams]
     |         |
     |         v
     |   [Lambda - 이벤트 처리]
     |         |
     |         +---> [ElastiCache 캐시 무효화]
     |         +---> [SNS 알림]
     |         +---> [OpenSearch 인덱싱]
     |
     +--[TTL 설정]
         세션 데이터 자동 만료
```

---

## 🧠 Week 6 시험 함정 & 약어

### DynamoDB 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| Strong Consistent | Eventually Consistent | 1 RCU vs 0.5 RCU |
| LSI | GSI | 같은 PK·생성 시만 vs 다른 PK·언제든 |
| Query | Scan | PK 조건 vs 전체 |
| FilterExpression | KeyConditionExpression | 읽은 후 필터 vs 인덱스 검색 |
| Provisioned | On-Demand | 미리 설정 vs 자동·2-3x 비쌈 |
| BatchWriteItem | TransactWriteItem | 25개·원자성 X vs 100개·ACID |
| Atomic Counter | Conditional Update | 멱등성 X vs 조건 검사 |
| TTL | DeleteItem | 비동기 무료 vs 즉시 WCU |
| Streams | Kinesis for DDB | 24h vs 1년 |
| DAX | ElastiCache | DDB 전용·SDK 호환 vs 범용 |
| LSI Strong Consistency | GSI Strong Consistency | ✅ vs ❌ |
| Global Tables | Standard | 다중 리전 vs 단일 리전 |
| KEYS_ONLY | ALL | 키만·저렴 vs 전체·비쌈 |
| Burst Capacity | Adaptive Capacity | 5분 누적 vs 핫 파티션 재분배 |

### Week 6 시험 함정 15가지

1. **항목 최대 400KB** — 큰 데이터는 S3
2. **파티션당 한도 3000 RCU + 1000 WCU + 10GB**
3. **GSI는 Eventually Consistent만**
4. **GSI WCU 부족 → 본 테이블 쓰기도 영향**
5. **LSI는 테이블 생성 시에만**, 변경·삭제 불가
6. **트랜잭션은 2x WCU/RCU 비용**
7. **TransactWriteItems 최대 100개·4MB** (이전 25개)
8. **FilterExpression은 RCU 절감 X**
9. **TTL은 epoch 초**, 0~48시간 내 삭제
10. **DAX는 VPC 내부만**
11. **Streams 24h 고정**, 더 필요하면 Kinesis로
12. **모드 전환 24시간에 1회**
13. **온디맨드 초기 예열 부족** → 2x 트래픽 급증 시 throttle
14. **Strong Consistency는 LSI만 (GSI X)**
15. **Atomic Counter는 멱등성 없음** — 재시도 중복

### Week 6 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **PK** | Partition Key |
| **SK** | Sort Key |
| **RCU / WCU** | Read/Write Capacity Unit |
| **LSI** | Local Secondary Index |
| **GSI** | Global Secondary Index |
| **DAX** | DynamoDB Accelerator |
| **TTL** | Time To Live |
| **PITR** | Point-In-Time Recovery |
| **ACID** | Atomicity, Consistency, Isolation, Durability |
| **CRUD** | Create/Read/Update/Delete |
| **DDB** | DynamoDB (줄임말) |
| **NoSQL** | Not Only SQL |
| **PartiQL** | SQL 호환 쿼리 언어 |

---

## 📝 Week 6 종합 연습문제

**문제 1.** DynamoDB 항목의 최대 크기는?

A) 64KB  
B) 400KB  
C) 1MB  
D) 5MB  

**정답: B** - 400KB

---

**문제 2.** LSI와 GSI의 가장 중요한 차이점은?

A) 비용 차이  
B) LSI는 생성 시만, GSI는 언제든 추가 가능  
C) 성능 차이  
D) 리전 제한  

**정답: B** - LSI는 테이블 생성 시에만 설정 가능, GSI는 언제든 추가/삭제 가능

---

**문제 3.** DynamoDB Streams의 최대 데이터 보존 기간은?

A) 1시간  
B) 24시간  
C) 7일  
D) 30일  

**정답: B** - DynamoDB Streams는 최대 24시간 데이터를 보존합니다.

---

**문제 4.** 온디맨드 모드의 장점은?

A) 프로비저닝보다 저렴  
B) 예측 불가능한 트래픽에 자동 확장  
C) 강력한 일관성 읽기 지원  
D) 트랜잭션 지원  

**정답: B** - 온디맨드 모드는 트래픽 패턴이 불규칙하거나 예측하기 어려울 때 자동으로 확장/축소됩니다.

---

**문제 5.** DynamoDB TTL의 특징은?

A) 삭제 시 WCU가 소비된다  
B) 만료 즉시 삭제된다  
C) 추가 비용 없이 자동 삭제, 48시간 내 처리  
D) 최대 1일 후 삭제된다  

**정답: C** - TTL은 추가 비용 없이 만료 후 48시간 이내에 비동기적으로 삭제됩니다.

---

**문제 6.** 재고 감소와 주문 생성을 원자적으로 처리하려면?

A) 두 개의 별도 API 호출  
B) DynamoDB 트랜잭션 사용  
C) Lambda를 통한 순차 처리  
D) SQS 큐 사용  

**정답: B** - DynamoDB 트랜잭션으로 여러 테이블의 쓰기를 All-or-Nothing으로 원자적 처리합니다.

---

**문제 7.** 5KB 항목을 최종적 일관성으로 읽을 때 소비 RCU는?

A) 0.5 RCU  
B) 1 RCU  
C) 1.5 RCU  
D) 2 RCU  

**정답: B** - ceil(5/4) x 0.5 = 2 x 0.5 = 1 RCU

---

**문제 8.** Optimistic Locking에서 ConditionalCheckFailedException은?

A) 항목이 존재하지 않을 때  
B) 동시 수정으로 버전 번호가 불일치할 때  
C) 용량이 부족할 때  
D) 권한이 없을 때  

**정답: B** - Optimistic Locking에서 버전 번호 조건이 맞지 않으면(다른 프로세스가 먼저 수정) 이 예외가 발생합니다.

---

## 📌 오늘의 요약

1. DynamoDB: 완전 관리형 NoSQL, 항목 최대 400KB, 스키마리스
2. 읽기: 최종적(0.5 RCU), 강력한(1 RCU), 트랜잭션(2 RCU) - 모두 4KB 기준
3. 쓰기: 1 WCU/1KB, 트랜잭션 2 WCU/1KB
4. LSI(생성 시만, 강력한 일관성) vs GSI(언제든, 최종적만, 별도 용량)
5. 트랜잭션으로 원자적 다중 쓰기, TTL로 임시 데이터 자동 관리
