# Day 33 - ElastiCache: Redis, Memcached, 캐싱 전략

📅 날짜: 2026년 6월 30일 (화요일)  
🎯 주제: Amazon ElastiCache  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ElastiCache Redis와 Memcached의 차이를 이해한다
- 적합한 캐싱 전략을 선택한다
- ElastiCache 사용 패턴을 파악한다

---

## 📖 이론 내용

### 1. Amazon ElastiCache란?

완전 관리형 인메모리 캐시 서비스로, 데이터베이스 부하를 줄이고 응답 속도를 높입니다.

**두 가지 엔진:**
- **Redis**: 고급 데이터 구조, 영속성, 클러스터
- **Memcached**: 단순한 캐시, 멀티스레드

### 2. Redis vs Memcached

| 특성 | Redis | Memcached |
|------|-------|-----------|
| 데이터 구조 | String, Hash, List, Set, ZSet | String만 |
| 영속성 | 지원 (AOF, RDB) | 미지원 |
| Multi-AZ | 지원 | 미지원 |
| Read Replica | 지원 | 미지원 |
| 백업/복원 | 지원 | 미지원 |
| 클러스터 | 지원 | 지원 |
| 멀티스레드 | 단일 스레드 | 멀티스레드 |
| 용도 | 세션, 순위표, 복잡한 캐싱 | 단순 캐시, 수평 확장 |

**⭐ 시험에서 "영속성, 백업, Multi-AZ" → Redis 선택**

### 3. 캐싱 전략

**Lazy Loading (Cache-Aside, 조회 시 채우기):**

```python
import redis
import boto3

cache = redis.Redis()
db = boto3.resource('dynamodb')

def get_user(user_id):
    # 1. 캐시 확인
    cached = cache.get(f'user:{user_id}')
    if cached:
        return json.loads(cached)  # Cache Hit!
    
    # 2. Cache Miss - DB 조회
    table = db.Table('Users')
    user = table.get_item(Key={'userId': user_id})['Item']
    
    # 3. 캐시에 저장 (TTL: 1시간)
    cache.setex(f'user:{user_id}', 3600, json.dumps(user))
    
    return user
```

**Write-Through (쓸 때 캐시 업데이트):**

```python
def update_user(user_id, data):
    # DB에 쓰기
    table.put_item(Item=data)
    
    # 캐시도 동시에 업데이트
    cache.setex(f'user:{user_id}', 3600, json.dumps(data))
```

**전략 비교:**

| 전략 | 장점 | 단점 |
|------|------|------|
| Lazy Loading | 필요한 데이터만 캐시, 간단 | 첫 요청 느림 (Cache Miss) |
| Write-Through | 항상 최신 데이터 | 모든 쓰기에 캐시 업데이트 비용 |

### 4. ElastiCache 세션 관리

```python
# Lambda에서 세션 데이터 저장
import redis

cache = redis.Redis(host='my-elasticache.cache.amazonaws.com')

def handle_login(user_id):
    session_id = generate_session_id()
    session_data = {'userId': user_id, 'loginTime': time.time()}
    
    # 세션 저장 (30분 TTL)
    cache.setex(f'session:{session_id}', 1800, json.dumps(session_data))
    
    return session_id
```

---

## 🧠 알아두면 좋은 심화 이론

### 캐싱 전략 5종 (시험 핵심 — 자세히 외우기)

| 전략 | 동작 | 장점 | 단점 |
|------|------|------|------|
| **Lazy Loading** (Cache-Aside) | Miss 시 DB → 캐시 | 필요한 것만 캐시 | 첫 호출 느림, 데이터 부패 가능 |
| **Write-Through** | 쓰기 시 DB+캐시 동시 | 항상 최신 | 안 읽힐 데이터도 캐시 |
| **Write-Back** (Write-Behind) | 쓰기 → 캐시 후 비동기 DB | 빠른 쓰기 | DB 동기화 지연 위험 |
| **Refresh-Ahead** | TTL 만료 전 미리 갱신 | 미스 없음 | 불필요 호출 |
| **TTL** | 만료 시간 설정 | 자동 신선도 | TTL 동안 stale |

### Cache Invalidation (어려운 문제!)

> 컴퓨터 과학의 2대 난제: "Naming Things" + "Cache Invalidation"

**3가지 방법:**
1. **TTL 기반** — 단순, 일관성 약함
2. **Event-Driven** — DDB Streams / SNS / EventBridge → 캐시 무효화 Lambda
3. **Write-Through** — DB와 캐시 동시 갱신

### Redis 자료구조 → 사용 사례 (시험 시나리오)

| 자료구조 | 사용 사례 |
|----------|-----------|
| **String** | 단순 키-값, 카운터 (INCR) |
| **List** | 큐, 최근 N개 |
| **Set** | 유니크 태그, 중복 제거 |
| **Sorted Set** | **리더보드, 랭킹** ⭐ |
| **Hash** | 객체 (user:123 → {name, email}) |
| **HyperLogLog** | 고유 카운트 추정 (메모리 절약) |
| **Geo** | 위치 기반 |
| **Stream** | 메시지 큐·이벤트 |
| **Bitmap** | 출석체크, 비트 플래그 |
| **Pub/Sub** | 실시간 메시징 |

### Redis Cluster Mode (시험 함정)

| 모드 | 노드 수 | 샤딩 |
|------|---------|------|
| **Cluster Mode Disabled** | 1 primary + 0~5 replicas | 샤딩 X (단일 샤드) |
| **Cluster Mode Enabled** | 여러 샤드 × (1 primary + 0~5 replicas) | 자동 샤딩 |

> ⚠️ **함정**:
> - Cluster Mode Disabled: 모든 키가 한 샤드. 메모리 한도 = 인스턴스 크기.
> - Cluster Mode Enabled: 키가 슬롯 단위 분산. 트랜잭션은 같은 슬롯의 키끼리만.

### Redis Backup / Snapshot

- **자동 백업**: 매일 1회 (RDB 형식, S3 저장)
- **수동 백업**: 명시적
- **AOF (Append-Only File)**: 모든 쓰기 로그 — 데이터 손실 거의 0
- 시험에 "Redis 영속성" → AOF + RDB 조합

### ElastiCache Memcached - 디테일

- 단일 노드 또는 여러 노드 (Auto Discovery)
- **샤딩**: 클라이언트 측에서 일관된 해싱
- **멀티스레드** → 더 큰 인스턴스에서 CPU 활용도 높음
- 영속성 없음 → 노드 재부팅 시 데이터 사라짐

### ElastiCache 보안

- **AUTH 토큰** (Redis 5+): 패스워드 인증
- **Encryption in transit** (TLS): Redis 3.2.6+, Memcached는 SASL
- **Encryption at rest**: KMS
- **VPC**: VPC 내부에서만 접근 (DAX와 동일)

### Memcached vs Redis 결정 트리

```
영속성·백업 필요? ──── YES ──→ Redis
                       NO
                       ↓
복잡한 자료구조? ──── YES ──→ Redis
                       NO
                       ↓
멀티스레드 활용? ──── YES ──→ Memcached
                       NO
                       ↓
Multi-AZ·HA 필요? ──── YES ──→ Redis
                       NO ──→ 둘 다 가능 (Memcached가 단순)
```

### ElastiCache Serverless (2023~)

- Redis/Memcached 모두 Serverless 옵션
- 자동 확장, ms 단위 응답
- ECPU(읽기·쓰기) + 저장 GB로 과금
- 시험엔 가끔: "예측 불가 캐시 트래픽" → Serverless

### MemoryDB vs ElastiCache Redis (시험 가끔)

| 항목 | ElastiCache Redis | MemoryDB |
|------|-------------------|----------|
| 영속성 | 옵션 (RDB/AOF) | **Multi-AZ 트랜잭션 로그** |
| 일관성 | Eventually consistent (replica) | **Strongly consistent** |
| 사용 | 캐시 | 주 DB 또는 캐시 |
| 가격 | 저렴 | 비쌈 |

> MemoryDB는 마이크로초 지연 + DB 수준 내구성 → 마이크로서비스 주 DB로도 사용 가능.

### 관련 서비스 Cross-Reference

- **DAX vs ElastiCache** → [Week 6 Day 3]
- **ElastiCache + Lambda** → 세션 캐시 패턴
- **MemoryDB ↔ DynamoDB** → 마이크로초 vs 밀리초
- **Redis Sorted Set ↔ 게임 리더보드** → 실무 표준

---

## 아키텍처 다이어그램

```
ElastiCache 캐싱 아키텍처
================================

[클라이언트]
      |
      v
[애플리케이션 서버]
      |
      |-- 1. 캐시 조회 --> [ElastiCache Redis]
      |         |
      |    Cache Hit  <-- 캐시된 데이터 반환
      |    (빠른 응답)
      |
      |-- Cache Miss --> [RDS Database]
                  |
                  | 데이터 조회 후 캐시 저장
                  v
          [ElastiCache Redis] (TTL 설정)

Redis 클러스터 구성
================================

[Primary Node] <-- 쓰기
      |
      | 복제
      v
[Read Replica] <-- 읽기
[Read Replica] <-- 읽기

Multi-AZ 활성화 시 자동 Failover
```

---

## ⭐ 핵심 포인트

1. ⭐ **Redis vs Memcached**: Redis는 영속성/백업/Multi-AZ 지원, Memcached는 멀티스레드
2. ⭐ **Lazy Loading**: Cache Miss 시 DB 조회 후 캐시 저장
3. ⭐ **Write-Through**: DB 쓰기와 동시에 캐시 업데이트
4. ⭐ **세션 관리**: ElastiCache로 서버 간 세션 공유
5. ⭐ **TTL**: 캐시 만료 시간 설정으로 오래된 데이터 자동 삭제

---

## 📝 연습 문제

**문제 1.** Redis와 Memcached의 가장 큰 차이점은?

A) 속도 차이  
B) Redis는 영속성과 백업 지원, Memcached는 미지원  
C) 비용 차이  
D) 최대 메모리 크기  

**정답: B** - Redis는 영속성, 백업, Multi-AZ를 지원하지만 Memcached는 단순 캐시 기능만 제공합니다.

---

**문제 2.** Lazy Loading의 단점은?

A) 모든 데이터가 캐시에 저장됨  
B) 첫 번째 요청 시 캐시 미스로 느린 응답  
C) 데이터 일관성 문제  
D) 구현 복잡도  

**정답: B** - Lazy Loading은 Cache Miss 시 DB를 조회해야 하므로 첫 번째 요청이 느릴 수 있습니다.

---

**문제 3.** 순위표(Leaderboard) 구현에 적합한 ElastiCache 엔진은?

A) Memcached  
B) Redis  
C) 둘 다 가능  
D) 둘 다 불가  

**정답: B** - Redis의 Sorted Set(ZSet)은 순위표 구현에 최적화되어 있습니다.

---

**문제 4.** Write-Through 전략의 장점은?

A) 쓰기 성능 향상  
B) 항상 최신 데이터가 캐시에 존재  
C) 캐시 용량 절감  
D) 구현 단순성  

**정답: B** - Write-Through는 쓰기 시 캐시도 업데이트하므로 캐시에 항상 최신 데이터가 유지됩니다.

---

**문제 5.** 여러 서버 간 세션 공유에 가장 적합한 서비스는?

A) RDS  
B) S3  
C) ElastiCache  
D) DynamoDB  

**정답: C** - ElastiCache는 인메모리 기반으로 빠른 세션 저장/조회가 가능하여 서버 간 세션 공유에 적합합니다.

---

## 📌 오늘의 요약

1. ElastiCache: 완전 관리형 인메모리 캐시, Redis와 Memcached 지원
2. Redis: 영속성/백업/Multi-AZ/복잡한 데이터 구조, 세션/순위표에 적합
3. Memcached: 단순 캐시, 멀티스레드, 영속성 없음
4. Lazy Loading: Cache Miss 시 DB 조회 후 캐시 저장 (가장 일반적)
5. Write-Through: DB 쓰기와 동시에 캐시 업데이트 (항상 최신 데이터)
