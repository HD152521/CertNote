# Day 35 - Week 7 복습 + 연습문제 (RDS/ElastiCache/Aurora)

📅 날짜: 2026년 7월 2일 (목요일)  
🎯 주제: RDS, ElastiCache, Aurora 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- RDS, ElastiCache, Aurora의 핵심 개념을 종합 정리한다
- 실전 시험 유형의 문제를 풀어 실력을 점검한다

---

## 📖 Week 7 핵심 정리

### RDS 핵심 암기
```
Multi-AZ: 동기 복제, 자동 Failover, 고가용성 목적
Read Replica: 비동기 복제, 읽기 확장, 최대 15개
암호화 변경: 스냅샷 → 암호화 복사 → 새 DB
IAM 인증 토큰: 15분 유효, SSL 필수
자동 백업: 최대 35일, DB 삭제 시 함께 삭제
수동 스냅샷: 무기한, DB 삭제 후에도 유지
```

### ElastiCache 핵심 암기
```
Redis: 영속성, 백업, Multi-AZ, 복잡한 자료구조, Read Replica
Memcached: 단순 캐시, 멀티스레드, 영속성 없음
Lazy Loading: Cache Miss 시 DB 조회 후 캐시
Write-Through: 쓰기 시 캐시도 동시 업데이트
```

### Aurora 핵심 암기
```
성능: MySQL 5배, PostgreSQL 3배
스토리지: 3개 AZ, 6개 사본, 10GB~128TB 자동
Replica: 최대 15개
Serverless: 간헐적 트래픽, 자동 확장
글로벌 DB: 1초 미만 복제, 1분 내 Failover
```

---

## 아키텍처 다이어그램

```
Week 7 전체 아키텍처 패턴
================================

[클라이언트]
     |
     v
[API Gateway + Lambda]
     |
     +--[읽기 빈번]--> [ElastiCache Redis]
     |                      |
     |              Cache Miss |
     |                      v
     +--[쓰기/복잡쿼리]--> [Aurora Primary]
                              |
                         +----+----+
                         |         |
                    [Aurora    [Aurora
                   Replica1]  Replica2]
```

---

## 🧠 Week 7 시험 함정 & 약어

### 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| Multi-AZ | Read Replica | 고가용성·동기 vs 읽기 확장·비동기 |
| Multi-AZ Instance | Multi-AZ Cluster | Standby 1개 vs Replica 2개 |
| RDS Read Replica | Aurora Replica | 비동기·수초 vs 공유스토리지·ms |
| 자동 백업 | 수동 스냅샷 | 35일·DB삭제 시 삭제 vs 무기한·유지 |
| PITR | Backtrack | 새 DB 생성 vs in-place |
| CloudWatch | Enhanced Monitoring | 1분·외부 vs 1초·OS 내부 |
| Enhanced Monitoring | Performance Insights | OS·프로세스 vs 쿼리·대기 |
| Redis | Memcached | 영속성·자료구조 vs 단순·멀티스레드 |
| Redis Cluster Mode On | Off | 샤딩 vs 단일 샤드 |
| Lazy Loading | Write-Through | Miss 시 vs 쓰기 시 |
| ElastiCache Redis | MemoryDB | 캐시 vs 주 DB 가능 |
| Aurora Serverless v1 | v2 | 분 단위 vs 초 단위 |
| Aurora Standard | Aurora Global | 단일 리전 vs 다중 리전 |
| RDS Proxy | 직접 연결 | 풀링·Failover 빠름 vs 단순 |
| IAM 인증 | 비밀번호 | 15분 토큰·SigV4 vs 영구 |

### Week 7 시험 함정 15가지

1. **Multi-AZ Standby 읽기 불가** (Multi-AZ Cluster는 가능)
2. **암호화 변경 = 스냅샷 → 암호화 복사 → 새 DB**
3. **자동 백업 0일 = PITR·Read Replica 만들기 불가**
4. **IAM 토큰 15분 + SSL 필수**
5. **수동 스냅샷은 DB 삭제 후에도 유지** — 비용 발생
6. **Read Replica 쓰기 직후 조회 = stale 가능**
7. **Aurora Replica 자동 Failover < 30초**, RDS는 1~2분
8. **Aurora 6사본 3AZ — Quorum 4쓰기·3읽기**
9. **Aurora Serverless v1은 콜드 스타트 있음, v2는 거의 없음**
10. **Redis Cluster Mode Disabled = 단일 샤드** — 메모리 한계
11. **Memcached = 영속성·백업·Multi-AZ 없음**
12. **Redis Sorted Set = 리더보드 정답**
13. **DAX는 DDB 전용, ElastiCache는 범용**
14. **RDS Proxy = Lambda 동시 연결 문제 해결**
15. **Aurora Backtrack = MySQL only, 72시간 in-place**

### Week 7 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **RDS** | Relational Database Service |
| **DBI** | DB Instance |
| **PITR** | Point-In-Time Recovery |
| **ACU** | Aurora Capacity Unit |
| **AOF** | Append-Only File (Redis) |
| **RDB** | Redis Database Backup |
| **CRR** | Cross-Region Replication (Read Replica) |
| **OLTP / OLAP** | Online Transaction/Analytical Processing |
| **DMS** | Database Migration Service |
| **TDE** | Transparent Data Encryption |
| **BYOL** | Bring Your Own License |
| **ACID** | Atomicity, Consistency, Isolation, Durability |
| **HA / DR** | High Availability / Disaster Recovery |
| **RTO / RPO** | Recovery Time / Point Objective |
| **TLS / SSL** | Transport Layer Security |

---

## 📝 Week 7 종합 연습문제

**문제 1.** RDS Multi-AZ와 Read Replica의 차이점은?

A) Multi-AZ는 비동기, Read Replica는 동기 복제  
B) Multi-AZ는 고가용성, Read Replica는 읽기 확장 목적  
C) Multi-AZ는 여러 리전, Read Replica는 단일 리전만  
D) 비용 차이만 있음  

**정답: B** - Multi-AZ는 동기 복제로 고가용성을 제공하고, Read Replica는 비동기 복제로 읽기 성능을 향상합니다.

---

**문제 2.** 세션 데이터를 여러 서버 간 공유하고 영속성도 필요한 경우?

A) Memcached  
B) Redis  
C) RDS  
D) S3  

**정답: B** - Redis는 영속성과 다중 서버 간 세션 공유를 모두 지원합니다.

---

**문제 3.** Aurora의 스토리지 사본 수와 AZ 분산은?

A) 2개 AZ에 4개 사본  
B) 3개 AZ에 6개 사본  
C) 3개 AZ에 3개 사본  
D) 2개 AZ에 2개 사본  

**정답: B** - Aurora는 3개 AZ에 자동으로 6개의 스토리지 사본을 유지합니다.

---

**문제 4.** RDS 비암호화 DB를 암호화하는 절차는?

A) 설정에서 암호화 활성화  
B) 스냅샷 → 암호화 스냅샷 복사 → 새 DB 생성  
C) Multi-AZ 활성화  
D) 불가능  

**정답: B** - 기존 DB를 직접 암호화할 수 없습니다. 스냅샷 생성 후 암호화된 스냅샷으로 복사하고 새 DB를 생성해야 합니다.

---

**문제 5.** 간헐적으로 사용하는 개발 환경 DB에 적합한 Aurora 구성은?

A) Aurora 표준  
B) Aurora Multi-AZ  
C) Aurora Serverless  
D) Aurora 글로벌 DB  

**정답: C** - Aurora Serverless는 사용하지 않을 때 자동으로 스케일 다운하여 간헐적 사용에 비용 효율적입니다.

---

**문제 6.** ElastiCache Lazy Loading의 특징은?

A) 모든 데이터를 미리 캐시  
B) Cache Miss 시 DB를 조회하고 캐시에 저장  
C) 쓰기 시 항상 캐시 업데이트  
D) 캐시 히트율 보장  

**정답: B** - Lazy Loading은 Cache Miss 시 DB에서 데이터를 가져와 캐시에 저장하는 방식입니다.

---

**문제 7.** RDS 자동 백업의 특징은?

A) 무기한 보존  
B) 최대 35일 보존, DB 삭제 시 함께 삭제  
C) S3에 직접 접근 가능  
D) 수동으로만 트리거 가능  

**정답: B** - RDS 자동 백업은 최대 35일 보존되며, DB 삭제 시 자동 백업도 함께 삭제됩니다.

---

**문제 8.** Aurora 글로벌 데이터베이스의 복제 지연과 Failover 시간은?

A) 복제 지연 수초, Failover 수분  
B) 복제 지연 1초 미만, Failover 1분 미만  
C) 복제 지연 없음, Failover 즉시  
D) 복제 지연 1분, Failover 5분  

**정답: B** - Aurora 글로벌 DB는 1초 미만의 복제 지연과 1분 미만의 Failover를 제공합니다.

---

## 📌 오늘의 요약

1. RDS: Multi-AZ(고가용성/동기), Read Replica(읽기확장/비동기), 최대 15개
2. RDS 보안: KMS 암호화, IAM 토큰(15분), SSL 필수
3. 백업: 자동(35일, DB삭제시 함께삭제), 수동(무기한, 유지됨)
4. ElastiCache: Redis(영속성/복잡구조), Memcached(단순/멀티스레드)
5. Aurora: MySQL 5배 성능, 3AZ 6사본, Serverless, 글로벌 DB
