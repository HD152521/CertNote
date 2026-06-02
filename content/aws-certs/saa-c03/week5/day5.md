# Day 25 - Week 5 복습 + 시나리오 문제 10

📅 날짜: Week 5 (Day 5)
🎯 주제: 데이터베이스 선택 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 시나리오 키워드로 6대 DB 서비스를 1초 안에 매핑한다
- 비용·성능·운영성 trade-off를 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **OLTP vs OLAP**: 트랜잭션 vs 분석. OLTP=RDS/Aurora/DDB, OLAP=Redshift.
- **샤딩**: 데이터 수평 분할. DDB는 자동, RDB는 수동(Aurora Limitless 신규).
- **연결 폭증**: 짧은 연결이 동시에 많이 → DB가 죽음. Proxy/RDS Proxy로 해결.

---

## 📖 한 주 핵심 정리

1. **RDS**: 관리형 RDB 6엔진. Multi-AZ HA + Read Replica 읽기 확장.
2. **Aurora**: 6 카피·15 Reader·Global DB·Serverless v2.
3. **DynamoDB**: PK 균등 분포, GSI/LSI, Streams, DAX, Global Tables.
4. **ElastiCache**: Redis/Memcached. 세션·캐시.
5. **MemoryDB**: 영속 인메모리 DB.
6. **OpenSearch**: 검색·로그 분석.
7. **DocumentDB/Neptune/Timestream/Keyspaces/QLDB**: 특수 모델.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **RDS Multi-AZ vs Read Replica** | HA, 동기 | 읽기 확장, 비동기 |
| **Aurora vs RDS** | 공유 스토리지·15 reader | 인스턴스 EBS·5 reader |
| **DAX vs ElastiCache** | DDB 전용 | 범용 |
| **MemoryDB vs ElastiCache Redis** | 영속 DB | 캐시 |
| **GSI vs LSI** | 비동기, 다른 PK | 동기, 같은 PK |
| **DocumentDB vs DynamoDB** | Mongo 호환 도큐먼트 | Key-Value/도큐먼트 |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 다층 데이터 아키텍처 ]

  Client → API GW → Lambda
              ├─ DAX → DynamoDB (트랜잭션)
              ├─ ElastiCache Redis (세션/캐시)
              └─ RDS Proxy → Aurora (관계형)

  Pipeline:
    DDB Streams → Lambda → OpenSearch (검색)
    Aurora → DMS → Redshift (분석)
    S3 ← Aurora Export (Athena)
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** 변동성 큰 신규 서비스, 0에서 시작 → 갑자기 폭증:

A) RDS Multi-AZ B) Aurora Serverless v2 C) DDB Provisioned D) ElastiCache

**정답: B**.

---

**문제 2.** "쓰기 적고 읽기 5배, 같은 리전":

A) Multi-AZ B) Read Replica C) Global Tables D) MemoryDB

**정답: B**.

---

**문제 3.** Lambda + RDS 연결 폭증:

A) Read Replica B) RDS Proxy C) Aurora D) Lambda 동시성 제한

**정답: B**.

---

**문제 4.** μs DDB 응답 필요:

A) ElastiCache B) DAX C) MemoryDB D) Aurora

**정답: B**.

---

**문제 5.** 5개 리전 액티브-액티브 NoSQL:

A) Aurora Global B) DDB Global Tables C) DocumentDB D) DAX

**정답: B**.

---

**문제 6.** Mongo 호환:

A) DDB B) DocumentDB C) Keyspaces D) Neptune

**정답: B**.

---

**문제 7.** 추천·소셜그래프 쿼리:

A) DDB B) Neptune C) DocumentDB D) OpenSearch

**정답: B**.

---

**문제 8.** 변경 불가 감사 추적(원장):

A) DDB B) Aurora C) QLDB D) Timestream

**정답: C**.

---

**문제 9.** PostgreSQL에서 점진적 데이터 손상 시간 되돌리기:

A) Backtrack B) PITR C) Read Replica D) Snapshot Promote

**정답: B** — Backtrack은 MySQL 호환만.

---

**문제 10.** DDB GSI에서 강한 일관성 읽기 가능?

A) 가능 B) 불가능, 결과적 일관성만 C) 옵션으로 가능 D) Streams로 가능

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. DB 선택은 시나리오 키워드 매핑. 시험에서 가장 빠르게 점수를 얻는 영역.
2. 다음 주: **서버리스 + 컨테이너** — Lambda, API Gateway, Step Functions, ECS/EKS/Fargate.
