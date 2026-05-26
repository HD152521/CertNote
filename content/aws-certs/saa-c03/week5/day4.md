# Day 24 - ElastiCache와 인메모리 데이터 스토어: 속도의 물리학

데이터베이스가 디스크에서 데이터를 읽는 시간과 메모리에서 읽는 시간의 차이는 수천 배에서 수만 배에 달한다. NVMe SSD의 순차 읽기 지연이 50-100μs인 반면, DRAM의 접근 지연은 50-100ns다. 1000배 차이다. 이 물리적 격차가 캐시의 존재 이유다. ElastiCache Redis, Memcached, DAX, MemoryDB — 이 서비스들은 모두 이 물리학적 사실 위에 세워져 있다.

인메모리 데이터 스토어가 단순한 성능 옵션이 아님을 보여주는 수치가 있다. AWS에 따르면 ElastiCache를 활용한 아키텍처는 RDS 단독 구성 대비 읽기 지연을 90% 이상 줄이고, DB RCU 비용을 60-80% 절감할 수 있다. 그 결과 ElastiCache는 SAA-C03 시험에서 가장 자주 등장하는 "성능 개선" 답안이다.

## 캐싱 패턴 — 어떻게 캐시를 채우고 비울 것인가

캐시를 도입하기 전에 어떤 패턴으로 운영할지 결정해야 한다. 패턴마다 장단점이 다르고, 시험에서도 "어떤 상황에 어떤 패턴이 맞는가"를 묻는다.

**Cache-Aside(Lazy Loading)**: 가장 널리 쓰이는 패턴이다. 읽기 요청이 왔을 때 캐시를 먼저 확인하고, 없으면(Cache Miss) DB에서 읽어서 캐시에 저장한 뒤 반환한다. 캐시에 있으면(Cache Hit) DB를 보지 않고 바로 반환한다.

```
앱 → 캐시 확인
     │
     ├─ Cache Hit → 캐시에서 반환 (빠름, DB 접근 없음)
     │
     └─ Cache Miss → DB 조회 → 결과를 캐시에 저장 + 반환
                                 (다음 동일 요청은 Cache Hit)
```

장점: 실제로 읽힌 데이터만 캐시에 있다. DB 장애 시에도 캐시에 있는 데이터는 서빙 가능. 캐시 장애 시에는 DB로 폴백.
단점: 최초 요청은 항상 Cache Miss(Cold Start 지연). DB 데이터가 변경됐을 때 캐시가 오래된 데이터를 제공할 수 있다(Stale Data).

**Write-Through**: 쓰기 시점에 DB와 캐시를 동시에 업데이트한다. 캐시 데이터가 항상 최신이지만, 쓰기 지연이 증가하고 읽히지 않는 데이터도 캐시에 채워진다(캐시 오염).

**Write-Behind(Write-Back)**: 먼저 캐시에만 쓰고, 비동기적으로 DB에 나중에 반영한다. 쓰기 성능이 높지만 캐시 장애 시 데이터 손실 위험. 최고 성능이 필요한 쓰기 집약적 워크로드에 적합.

**TTL(Time-To-Live)**: 캐시 항목의 만료 시간. Stale Data 문제를 시간 기반으로 제한한다. TTL이 짧으면 캐시 효율이 낮고, 길면 Stale Data가 오래간다. 비즈니스 요구에 따라 튜닝이 필요하다.

| 패턴 | 읽기 최적화 | 쓰기 최적화 | Stale Risk | 데이터 손실 위험 |
|------|-----------|-----------|-----------|--------------|
| Cache-Aside | 높음 | - | 있음 (TTL 의존) | 없음 (DB가 SoR) |
| Write-Through | 높음 | 낮음 | 없음 | 없음 |
| Write-Behind | 높음 | 높음 | 없음 | 있음 (캐시 장애 시) |
| Read-Through | 높음 | - | 있음 | 없음 |

> 💡 **캐시 교체 알고리즘과 Eviction 정책** — 캐시 교체(Cache Eviction) 알고리즘의 대표는 LRU(Least Recently Used)다. Jim Gray와 Franco Putzolu의 1976년 IBM 연구에서 시작된 개념으로, 가장 오래 사용되지 않은 항목을 제거한다. Redis는 기본 LRU 외에도 LFU(Least Frequently Used — 가장 적게 사용된 항목 제거), Random(무작위 제거), allkeys-lru(TTL 없는 키도 포함해서 LRU), volatile-lru(TTL 있는 키만 LRU) 등 8가지 정책을 지원한다. 일반적으로 "인기도가 고르게 분포된" 워크로드에는 LFU가, "최근에 접근한 것이 다시 접근될 확률이 높은" 워크로드(시계열, 세션)에는 LRU가 적합하다. ElastiCache Redis에서는 `maxmemory-policy` 파라미터로 설정한다.

> 🔍 **Thundering Herd(Cache Stampede) 문제** — 대규모 캐시에서 자주 발생하는 문제다. 인기 있는 캐시 항목의 TTL이 만료되는 순간, 수십~수백 개의 동시 요청이 모두 Cache Miss를 받고 DB로 몰려가서 DB를 과부하시킨다. 대응 방법: (1) TTL에 무작위 지터(jitter)를 더해서 만료 시점 분산, (2) Mutex Lock — 첫 번째 요청만 DB를 조회하고 나머지는 대기, (3) Probabilistic Early Expiration — TTL 만료 직전부터 확률적으로 미리 갱신. Redis의 원자적 연산(`SET NX`)으로 Mutex Lock을 구현할 수 있다.

## ElastiCache Redis — 데이터 구조 서버

Redis(Remote Dictionary Server)는 2009년 Salvatore Sanfilippo가 이탈리아에서 개발한 오픈 소스 인메모리 데이터 구조 서버다. "캐시"라고 부르지만 그 안에는 String, List, Set, Sorted Set(ZSet), Hash, Bitmap, HyperLogLog, Stream, Geospatial Index라는 풍부한 데이터 구조가 있다. 이 다양성이 Redis를 단순 캐시를 넘어 세션 스토어, 리더보드, 실시간 카운터, Pub/Sub 브로커, 작업 큐로 만든다.

ElastiCache Redis는 이 Redis를 관리형으로 제공한다. 운영자가 Redis 바이너리 설치, AOF/RDB 설정, Cluster Mode 구성, 복제 설정을 직접 할 필요 없이, AWS 콘솔과 CLI로 제어한다. ElastiCache Redis는 Redis 7.x까지 지원하며, Redis Cluster 모드와 Redis Sentinel 모드 모두 지원한다.

**Redis 데이터 구조와 사용 사례:**

| 자료 구조 | 명령 예시 | 실제 사용 사례 |
|---------|---------|-------------|
| String | GET/SET/INCR | 세션 ID, 카운터, 분산 잠금 |
| List | LPUSH/RPOP | 작업 큐, 최근 활동 피드 |
| Hash | HSET/HGET | 객체 속성 저장(사용자 프로필) |
| Set | SADD/SISMEMBER | 태그, 권한, 유니크 방문자 |
| Sorted Set | ZADD/ZRANGE | 리더보드, 우선순위 큐 |
| HyperLogLog | PFADD/PFCOUNT | 유니크 사용자 수 근사 계산 |
| Stream | XADD/XREAD | 메시지 브로커, 이벤트 로그 |
| Geospatial | GEOADD/GEODIST | 위치 기반 서비스 |

### 영속성(Persistence) — AOF와 RDB

Redis는 인메모리지만 데이터를 디스크에 영속화하는 두 가지 방법을 제공한다.

**RDB(Redis Database Snapshot)**: 지정된 주기마다(예: 5분마다 10,000건 이상 변경 시) 전체 데이터셋의 스냅샷을 디스크에 쓴다. fork() 시스템 콜로 자식 프로세스가 쓰기 작업을 하므로 메인 프로세스는 계속 서빙 가능. 파일 크기가 작고 복구가 빠르다. 단점: 스냅샷 사이의 데이터는 손실될 수 있다(RPO = 스냅샷 주기, 최대 수 분).

**AOF(Append-Only File)**: 모든 쓰기 명령을 파일에 순서대로 기록. 서버 재시작 시 AOF를 재실행해서 데이터를 복구한다. fsync 옵션:
- `fsync=always`: 각 명령마다 동기화(RPO ≈ 0, 성능 저하)
- `fsync=everysec`: 초당 1회 동기화(RPO ≈ 1초, 권장)
- `fsync=no`: OS에 맡김(RPO 불확실, 최고 성능)

ElastiCache Redis에서 영속성을 위해 두 가지를 함께 쓸 수 있다(RDB로 주기적 스냅샷 + AOF로 명령 기록). 그러나 ElastiCache는 멀티 AZ 복제가 있어서 영속성 자체보다는 "백업/복구"와 "HA" 관점에서 설정을 선택한다.

> 🔍 **Redis 단일 스레드 모델과 원자성** — Redis 6.0(2020)부터 Redis는 Multi-threaded I/O를 도입했다. 이전까지 Redis는 단일 스레드로 명령을 처리해서 CPU 코어를 하나밖에 사용하지 못했다. Redis 6.0에서는 네트워크 I/O는 멀티스레드로 처리하고, 명령 실행은 여전히 단일 스레드로 유지해서 원자성(Atomicity)을 보장한다. Redis의 단일 스레드 명령 처리가 만들어내는 원자성 덕분에 `INCR` 명령은 Race Condition 없이 카운터 증가를 보장한다. ElastiCache Redis는 이 버전을 지원한다. 성능 병목이 CPU 단독이라면 Cluster Mode를 통한 샤딩이 더 효과적이다.

### Redis Cluster Mode — 샤딩으로 수평 확장

Redis Cluster Mode(ElastiCache에서는 "Cluster Mode Enabled")는 데이터를 여러 샤드로 나누어 여러 노드에 분산 저장한다. 16384개의 슬롯을 샤드 수로 나누어 각 샤드에 배정한다. 키의 CRC16 해시 값을 16384로 나눈 나머지가 슬롯 번호가 된다.

Cluster Mode Disabled(기본): 하나의 샤드. 데이터 전체가 Primary 노드에 있고, Read Replica가 복제본을 가진다. 최대 250GB 데이터 제한(노드 크기 한계). Multi-Key 작업에 제약 없음.

Cluster Mode Enabled: 여러 샤드. 각 샤드마다 Primary + Replica. 수 TB까지 확장 가능. Multi-key 작업에 제약(같은 슬롯에 있는 키만 트랜잭션으로 처리).

```
[Cluster Mode Enabled - 3 샤드]

샤드 1 (슬롯 0-5460)        샤드 2 (슬롯 5461-10922)    샤드 3 (슬롯 10923-16383)
Primary (AZ-a)              Primary (AZ-b)              Primary (AZ-c)
Replica (AZ-b)              Replica (AZ-c)              Replica (AZ-a)

Key "user:1" → CRC16 → 슬롯 2345 → 샤드 1
Key "product:A" → CRC16 → 슬롯 7890 → 샤드 2
```

Hash Tags(`{user}:sessions`, `{user}:profile`): 중괄호 `{}` 안의 문자열만 해시에 사용해서 여러 키를 같은 슬롯에 강제 배치. MGET/MSET이나 트랜잭션을 이 키들에 사용 가능하게 한다.

> 💡 **Redis Cluster의 Consistent Hashing이 아닌 이유** — Redis Cluster는 Consistent Hashing 대신 Hash Slot 방식을 사용한다. 이유는 슬롯 재배치(Resharding)의 단순성이다. 노드를 추가할 때 슬롯 단위로 이동하면 되므로, 어떤 키가 어떤 노드로 가는지 명확하게 추적할 수 있다. Consistent Hashing은 이론적으로 우아하지만, 실제 Redis처럼 핫 슬롯 재배치나 수동 슬롯 할당이 필요한 경우 디버깅이 어렵다. 16384개의 슬롯은 1000개 노드에도 충분히 세밀하게 분배할 수 있는 숫자로 설계됐다.

> 📚 **Twitter Redis 사례** — 2018년 Twitter는 Redis를 대규모로 활용하는 방식을 공개했다. Timelines(타임라인 캐싱), Trends(트렌드 실시간 카운터), Rate Limiting(API 속도 제한) 등에 Redis Cluster를 사용하며, 초당 수백만 건의 Redis 작업을 처리한다. 특히 타임라인 조회에서 Redis Sorted Set을 활용해서 사용자별 최근 트윗 목록을 인메모리에 유지하고, DB 조회 없이 타임라인을 제공한다. `ZADD timeline:{userId} {timestamp} {tweetId}`로 타임라인에 추가하고, `ZREVRANGE timeline:{userId} 0 49`로 최신 50개 트윗을 O(log N + K) 시간에 반환한다. 이것이 Redis ZSet(Sorted Set)의 전형적인 사용 사례다.

## Memcached — 단순함의 미학

Memcached는 2003년 Brad Fitzpatrick이 LiveJournal의 DB 부하를 줄이기 위해 개발했다. Redis보다 훨씬 단순하다. String 타입만 지원하고, 영속성이 없고, 복제가 없고, Pub/Sub이 없다. 대신 진정한 멀티스레드로 여러 CPU 코어를 완전히 활용할 수 있고, 메모리 효율이 좋다.

ElastiCache Memcached가 적합한 경우:
- 단순 객체 캐싱만 필요하고 복잡한 데이터 구조가 불필요한 경우
- 멀티스레드로 여러 코어를 최대 활용해야 하는 경우 (대규모 단순 캐시)
- 영속성, HA, 복제가 필요 없는 순수 캐시 레이어
- 노드 수평 추가로 캐시를 선형 확장해야 하는 경우 (각 노드 독립)

실제로 SAA-C03 시험에서 Redis vs Memcached를 고르는 문제는 거의 항상 Redis가 정답이다. Memcached가 정답인 경우는 명시적으로 "영속성/복제/다양한 데이터 구조가 필요 없다" + "멀티스레드 CPU 효율이 중요하다"는 키워드가 있을 때뿐이다.

| 항목 | ElastiCache Redis | ElastiCache Memcached |
|------|-----------------|----------------------|
| 데이터 구조 | String/List/Set/ZSet/Hash/Stream/Geo 등 | String만 |
| 영속성 | RDB/AOF 옵션 | 없음 |
| 복제 / HA | Multi-AZ + 자동 페일오버 | 없음 |
| 클러스터 | Cluster Mode (샤딩, 16384 슬롯) | 단순 해시 분산 (클라이언트 측) |
| Pub/Sub | 지원 | 미지원 |
| 트랜잭션 | MULTI/EXEC (원자적) | 미지원 |
| Lua 스크립트 | 지원 (서버 측 원자적 실행) | 미지원 |
| 스레드 모델 | 단일 스레드 처리 (I/O는 멀티스레드) | 완전 멀티스레드 |
| TLS/인증 | AUTH, ACL, TLS, RBAC | SASL(제한적) |
| Geospatial | 지원 | 미지원 |
| TTL | 항목별 설정 가능 | 항목별 설정 가능 |

## MemoryDB for Redis — 캐시와 DB의 경계를 허문다

ElastiCache Redis가 "DB 앞의 캐시"라면, MemoryDB for Redis는 "Redis가 메인 DB"인 서비스다. 이 차이는 내구성(Durability) 보장에서 온다.

ElastiCache Redis의 영속성은 베스트 에포트다. Multi-AZ 복제가 있지만, Primary와 Replica 사이의 복제는 비동기이므로 Primary 장애 시 최근 쓰기가 일부 손실될 수 있다. "캐시 데이터가 날아가면 DB에서 다시 읽으면 된다"는 전제가 있을 때는 이것으로 충분하다.

MemoryDB for Redis는 Multi-AZ 트랜잭션 로그(WAL 기반)로 모든 쓰기를 영속화한다. 트랜잭션 로그는 여러 AZ에 동기적으로 분산 저장된다. 이 덕분에 MemoryDB는 데이터 손실 없이 내구성을 보장하면서 Redis API를 그대로 사용한다.

```
[ElastiCache Redis]                [MemoryDB for Redis]
Primary ─비동기─► Replica          Writer ─동기─► Multi-AZ 트랜잭션 로그
                                              └── Reader (Redis API)
캐시: DB 장애 시 DB에서 복구        메인 DB: 이 자체가 신뢰할 수 있는 소스(SoR)
```

적합한 사용 사례:
- 마이크로초 읽기 + 한 자릿수 ms 쓰기가 필요한 메인 DB
- Redis 호환 애플리케이션을 별도 캐시 레이어 없이 운영하고 싶을 때
- 세션 데이터처럼 빠른 접근이 중요하지만 손실되면 안 되는 경우
- 리더보드, 실시간 카운터처럼 높은 쓰기 처리량 + 내구성이 모두 필요할 때

> 🔍 **MemoryDB WAL 메커니즘** — MemoryDB의 내구성 보장 메커니즘은 전통적 RDBMS의 WAL(Write-Ahead Logging)과 유사하다. 쓰기가 들어오면 먼저 트랜잭션 로그에 기록하고(복수의 AZ에 동기적으로), 그 다음 메모리에 적용한다. 장애 시 트랜잭션 로그를 재실행해서 메모리 상태를 복구한다. Redis의 기존 AOF(fsync=always)와 다른 점은 MemoryDB의 로그가 Multi-AZ에 분산 저장되어 AZ 하나가 완전히 손실돼도 데이터가 보존된다는 것이다. ElastiCache Redis에서 AOF를 활성화해도 AOF 파일 자체가 단일 AZ 내 디스크에만 존재하므로 AZ 장애 시 복구 불가능하다.

> ⚠️ **ElastiCache Redis vs MemoryDB 선택 기준** — 시험 함정: "Redis API를 사용하고 고가용성이 필요하면 MemoryDB를 선택한다"는 식의 단순화를 피해야 한다. ElastiCache Redis Multi-AZ도 고가용성을 제공한다. 차이는 **내구성 보장 수준**이다. 캐시 데이터 손실이 허용되고(DB에서 다시 채울 수 있으면) → ElastiCache Redis. 데이터 손실이 절대 허용되지 않고 Redis가 데이터의 진실 소스여야 하면 → MemoryDB. 비용: MemoryDB가 ElastiCache Redis보다 약 2-3배 비싸다.

## DAX — DynamoDB 전용 캐시의 특수성

DAX(DynamoDB Accelerator)는 범용 캐시가 아니다. DynamoDB 앞에서만 동작하는 특화 캐시다. DAX를 쓰면 애플리케이션 코드가 거의 변경되지 않는다. DynamoDB SDK 대신 DAX SDK로 바꾸면 캐시 적중/미스 로직을 직접 구현하지 않아도 된다.

DAX가 ElastiCache보다 나은 점:
- DynamoDB API와 완전 호환 → 코드 변경 최소화
- Item Cache와 Query Cache 자동 관리
- DynamoDB의 Adaptive Capacity와 잘 협동
- DynamoDB 특화 최적화(파티션 키 해시 인식)

DAX가 ElastiCache보다 못한 점:
- DynamoDB에서만 쓸 수 있다 (범용 캐시 불가)
- 강한 일관성 읽기를 지원하지 않는다 (결과적 일관성만)
- RDS, Aurora, 외부 API 등 다른 소스의 결과는 캐싱 불가
- 쓰기 캐싱은 Write-Through만 가능
- VPC 내에서만 접근 가능 (Lambda + VPC 구성 필요)

| 항목 | DAX | ElastiCache Redis |
|------|-----|-----------------|
| 대상 | DynamoDB 전용 | 범용 (DB, API, 계산 결과) |
| 코드 변경 | SDK만 변경 | 캐시 로직 직접 구현 |
| 일관성 | 결과적만 | 결과적 + 강한 (소스에 따라) |
| 응답 지연 | 마이크로초 | 서브 밀리초 |
| 데이터 구조 | DynamoDB 항목 | String/List/Hash/ZSet 등 |
| 사용 사례 | DDB 읽기 집약 | 세션, 리더보드, 일반 캐시 |
| 비용 | DDB 비용 절감 효과 | 별도 ElastiCache 비용 |

## OpenSearch — 검색과 로그 분석의 엔진

Amazon OpenSearch Service는 Elasticsearch의 fork인 OpenSearch 프로젝트를 관리형으로 제공한다. 2021년 Amazon은 Elasticsearch 7.10을 기반으로 OpenSearch를 오픈 소스로 분리했다. 기존 Elasticsearch 기반 OpenSearch Service 도메인은 OpenSearch 2.x로 업그레이드 가능하다.

OpenSearch가 DynamoDB나 RDS와 다른 점은 역인덱스(Inverted Index) 기반의 전문 검색(Full-Text Search)이다. "특정 단어가 포함된 문서 찾기", "범위 쿼리", "집계 분석", "지리 공간 검색" 같은 작업에서 RDBMS보다 월등히 빠르다.

주요 사용 사례:
- **로그 분석**: CloudWatch Logs → Kinesis Data Firehose → OpenSearch → OpenSearch Dashboards(Kibana 대체)
- **전문 검색**: 상품 검색, 문서 검색, 코드 검색
- **보안 분석**: SIEM(Security Information and Event Management)
- **시계열 분석**: 메트릭, IoT 이벤트

OpenSearch Serverless: 2023년 출시. 서버 용량을 관리할 필요 없이 실제 인덱싱/검색 양에 따라 자동 스케일링. 간헐적이거나 예측 불가능한 워크로드에 적합.

UltraWarm / Cold Storage: 최근 데이터는 Hot(SSD), 오래된 데이터는 UltraWarm(S3 + 압축), 아주 오래된 데이터는 Cold(S3). 로그를 장기 보관하면서 비용을 단계적으로 줄인다.

```
로그 데이터 흐름:
EC2/ECS → CloudWatch Logs
                │
                ▼
    Kinesis Data Firehose (실시간 스트리밍)
                │
                ▼
    OpenSearch Service (인덱싱)
                │
                ▼
    OpenSearch Dashboards (시각화)
    └── UltraWarm → Cold (장기 보관 + 비용 절감)
```

> 💡 **역인덱스의 알고리즘적 우위** — OpenSearch(Elasticsearch)의 역인덱스는 텍스트를 단어 단위로 분석해서 각 단어가 어느 문서에 나오는지를 매핑한다. 이 구조 덕분에 "특정 단어를 포함한 모든 문서"를 O(log N) 시간에 찾을 수 있다. 반면 RDBMS는 `LIKE '%keyword%'` 쿼리를 처리하려면 Full Table Scan이 필요해서 O(N)이다. 이 알고리즘적 차이가 "왜 전문 검색은 OpenSearch를 쓰는가"의 근본 이유다. 역인덱스는 1950년대 정보 검색 분야에서 개발됐으며, Google 검색 엔진의 핵심이기도 하다. Lucene(OpenSearch의 기반 라이브러리)은 2000년 Doug Cutting이 개발했다.

> 📚 **Netflix OpenSearch 로그 분석 사례** — Netflix는 OpenSearch(이전 Elasticsearch)를 이용해서 수천 개의 마이크로서비스에서 발생하는 로그를 실시간으로 분석한다. 특히 Netflix의 Chaos Engineering 도구인 Chaos Monkey가 인프라에 장애를 주입할 때, 엔지니어들은 OpenSearch Dashboards에서 실시간으로 어떤 서비스가 어떻게 반응하는지 관찰한다. 하루 수십 테라바이트의 로그가 Kinesis → Firehose → OpenSearch 파이프라인으로 처리되며, UltraWarm으로 30일치 로그를 저비용 보관한다. 이 아키텍처 없이는 수천 개 마이크로서비스 디버깅이 불가능했을 것이다.

## 특수 목적 데이터베이스 — 시나리오 키워드 매핑

시험에서 이 서비스들은 "시나리오 키워드 → 서비스" 매핑으로 빠르게 답해야 한다.

**DocumentDB**: MongoDB API와 호환되는 관리형 도큐먼트 DB. 키워드: "MongoDB 호환", "JSON 문서", "기존 MongoDB 워크로드 마이그레이션". 주의: DocumentDB는 MongoDB의 완전한 포크가 아니라 호환 레이어다. 일부 고급 MongoDB 기능은 지원하지 않는다. 6.0 버전부터 몇 가지 추가 기능 지원.

**Neptune**: 그래프 데이터베이스. Gremlin(Property Graph)과 SPARQL(RDF) 쿼리 언어 지원. 키워드: "소셜 네트워크", "추천 시스템", "지식 그래프", "fraud detection(사기 탐지 — 계정 간 관계 분석)", "친구 추천". 관계(Relationship) 탐색이 핵심. RDS로 JOIN 기반으로 구현하면 성능이 지수적으로 나빠지는 다단계 관계 탐색에 특화.

**Timestream**: 시계열 전용 DB. 키워드: "IoT 센서 데이터", "서버 메트릭", "시계열 데이터", "자동 만료". 시간 기반 자동 데이터 계층화(메모리 → SSD → 마그네틱). 시계열 함수(`time_series`, `interpolate`, `rate` 등) 내장.

**Keyspaces**: Apache Cassandra와 호환되는 관리형 서비스. 키워드: "Cassandra 마이그레이션", "CQL(Cassandra Query Language)", "Wide-Column 스토어". Cassandra의 분산 Wide-Column 모델을 완전 관리형으로 운영. 노드 관리 불필요.

**QLDB(Quantum Ledger Database)**: 변경 불가능한(Immutable) 원장 DB. 모든 변경 이력이 암호학적으로 검증 가능한 로그로 기록된다. 키워드: "변경 이력 감사", "금융 원장", "공급망 추적", "불변 로그". 블록체인과 다른 점은 QLDB는 중앙화된 서비스(AWS가 운영)이고 신뢰 주체가 AWS다.

| 서비스 | 핵심 키워드 | 기술 모델 | 피해야 할 혼동 |
|--------|------------|----------|------------|
| DocumentDB | MongoDB, JSON 도큐먼트 | Document Store | MongoDB 완전 호환 ≠ DocumentDB |
| Neptune | 소셜 그래프, 추천, 관계 탐색 | Graph DB (Gremlin/SPARQL) | 관계형 DB와 혼동 금지 |
| Timestream | IoT, 시계열, 메트릭 | Time-Series | DynamoDB TTL로 시계열 구현 ≠ Timestream |
| Keyspaces | Cassandra, CQL, Wide-Column | Wide-Column Store | DynamoDB와 다른 쿼리 모델 |
| QLDB | 불변 원장, 감사 로그 | Ledger (Immutable) | 블록체인(탈중앙화)과 다름 |

다른 클라우드와의 비교:

| AWS | GCP | Azure | 용도 |
|-----|-----|-------|------|
| ElastiCache Redis | Cloud Memorystore (Redis) | Azure Cache for Redis | 범용 캐시 |
| ElastiCache Memcached | Cloud Memorystore (Memcached) | - | 단순 캐시 |
| MemoryDB | - | - | 영속 인메모리 DB |
| OpenSearch | Cloud Search / BigQuery | Azure Cognitive Search | 전문 검색 |
| Neptune | - | Azure Cosmos DB (Gremlin) | 그래프 DB |
| Timestream | BigQuery (시계열 쿼리) | Azure Time Series Insights | 시계열 |
| QLDB | - | Azure Confidential Ledger | 불변 원장 |

> ⚠️ **ElastiCache Redis를 메시지 큐로 쓸 수 있는가** — 기술적으로 가능하다. Redis의 List와 Pub/Sub을 큐처럼 쓸 수 있다. 그러나 SQS처럼 메시지 보존 보장, Dead Letter Queue, 가시성 타임아웃, Fan-out, At-Least-Once 전달 보증 같은 기능이 없다. Redis 5.0에서 도입된 Streams 자료 구조는 Kafka와 비슷한 소비자 그룹 기반 메시지 처리를 지원하지만, SQS/SNS의 무한 확장성과 완전 관리형 특성을 따라가지 못한다. 시험에서 "내구성 있는 메시지 전달"이 필요하면 SQS, "실시간 분산 스트리밍"이면 Kinesis, "일반 캐시/세션"이면 ElastiCache Redis다.

## CLI로 ElastiCache Redis 설정하기

```bash
# ElastiCache Redis (Multi-AZ, Cluster Mode Disabled - 세션/캐시 용도)
aws elasticache create-replication-group \
  --replication-group-id prod-redis \
  --replication-group-description "Production cache" \
  --engine redis \
  --engine-version 7.1 \
  --cache-node-type cache.r7g.large \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --cache-subnet-group-name redis-subnet-group \
  --security-group-ids sg-xxx \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled \
  --auth-token "StrongAuthToken123!" \
  --snapshot-retention-limit 7

# ElastiCache Redis Cluster Mode Enabled (3 샤드, 샤드당 2 Replica)
aws elasticache create-replication-group \
  --replication-group-id prod-redis-cluster \
  --replication-group-description "Clustered Redis" \
  --engine redis \
  --cache-node-type cache.r7g.large \
  --num-node-groups 3 \
  --replicas-per-node-group 2 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled

# Redis Cluster 용량 추가 (샤드 추가 - 라이브 확장)
aws elasticache modify-replication-group-shard-configuration \
  --replication-group-id prod-redis-cluster \
  --node-group-count 5 \
  --apply-immediately

# MemoryDB for Redis 클러스터 생성
aws memorydb create-cluster \
  --cluster-name prod-memorydb \
  --node-type db.r6g.large \
  --acl-name open-access \
  --subnet-group-name memorydb-subnet-group \
  --security-group-ids sg-xxx \
  --num-shards 3 \
  --num-replicas-per-shard 2 \
  --engine-version 7.0

# OpenSearch 도메인 (3 데이터 노드 + 3 전용 마스터)
aws opensearch create-domain \
  --domain-name prod-logs \
  --engine-version OpenSearch_2.13 \
  --cluster-config '{
    "InstanceType": "r6g.large.search",
    "InstanceCount": 3,
    "DedicatedMasterEnabled": true,
    "DedicatedMasterType": "r6g.large.search",
    "DedicatedMasterCount": 3,
    "ZoneAwarenessEnabled": true,
    "ZoneAwarenessConfig": {"AvailabilityZoneCount": 3}
  }' \
  --ebs-options '{"EBSEnabled":true,"VolumeType":"gp3","VolumeSize":500}' \
  --node-to-node-encryption-options '{"Enabled":true}' \
  --encryption-at-rest-options '{"Enabled":true}' \
  --domain-endpoint-options '{"EnforceHTTPS":true}'

# OpenSearch UltraWarm 활성화 (오래된 로그 비용 절감)
aws opensearch update-domain-config \
  --domain-name prod-logs \
  --cluster-config '{
    "WarmEnabled": true,
    "WarmType": "ultrawarm1.medium.search",
    "WarmCount": 2
  }'

# Redis 캐시 히트율 모니터링 (CloudWatch)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name CacheHits \
  --dimensions Name=ReplicationGroupId,Value=prod-redis \
  --start-time 2025-05-26T00:00:00Z \
  --end-time 2025-05-26T23:59:59Z \
  --period 300 \
  --statistics Sum
```

## 정리하며

인메모리 데이터 스토어는 물리학적 속도 한계에서 시작됐다. DRAM이 NVMe SSD보다 1000배 빠르다는 사실이 캐시의 존재 이유다. ElastiCache Redis는 풍부한 데이터 구조와 Multi-AZ HA로 거의 모든 캐싱 시나리오의 정답이다. Memcached는 단순 캐시가 필요하고 멀티스레드 CPU 효율을 극대화할 때만 선택한다. DAX는 DynamoDB 전용이고 코드 변경을 최소화한다. MemoryDB는 Redis API를 유지하면서 손실 없는 내구성이 필요할 때 선택한다. OpenSearch는 전문 검색과 로그 분석의 표준 답이다.

내일은 5주차 전체를 복습하는 날이다. RDS Multi-AZ vs Read Replica, Aurora Global DB vs RDS Cross-Region Replica, DAX vs ElastiCache, GSI vs LSI — 이 헷갈리는 비교들을 시나리오 문제로 확실히 굳혀본다.

---

## 📝 연습 문제

**문제 1.** 웹 애플리케이션의 세션 데이터를 저장하고, 사용자가 로그인한 서버 외 다른 서버에서도 세션을 읽어야 하는 Stateless 아키텍처를 구현하려고 한다. 가장 적합한 서비스는?

A) ElastiCache Memcached — 단순 캐시이므로 빠르다
B) ElastiCache Redis — 복제와 HA를 지원하며 세션 스토어로 이상적이다
C) RDS MySQL — 관계형 DB로 세션을 영속화한다
D) DynamoDB — NoSQL로 세션을 저장한다

**정답: B**

해설: 세션 스토어에는 ElastiCache Redis가 표준 답이다. 빠른 읽기/쓰기(마이크로초~밀리초), Multi-AZ HA, TTL로 세션 만료 자동화, 여러 애플리케이션 서버가 동시에 접근 가능한 구조가 모두 갖춰져 있다. Memcached는 복제와 HA가 없어서 세션 스토어로 부적합(노드 장애 시 모든 세션 손실 = 사용자 강제 로그아웃). RDS는 과도하게 무겁고 연결 수 제한이 있다. DynamoDB도 기술적으로 가능하지만 TTL과 성능 면에서 Redis만큼 자연스럽지 않다.

---

**문제 2.** DynamoDB를 사용하는 읽기 집약적 애플리케이션에서 응답 시간을 마이크로초 수준으로 줄여야 한다. 데이터는 자주 변경되지 않고, 강한 일관성보다 빠른 응답이 더 중요하다. 가장 적합한 해결책은?

A) ElastiCache Redis를 DynamoDB 앞에 Cache-Aside 패턴으로 추가한다
B) DynamoDB Provisioned WCU/RCU를 10배 늘린다
C) DAX 클러스터를 DynamoDB 앞에 추가한다
D) DynamoDB Global Tables를 활성화해서 지역 읽기를 분산한다

**정답: C**

해설: DAX는 DynamoDB 전용 인메모리 캐시로, 마이크로초 응답을 제공한다. SDK만 변경하면 캐시 로직을 직접 구현할 필요가 없다. A도 마이크로초는 달성 가능하지만, Cache-Aside 로직을 직접 구현해야 하고 DynamoDB API와의 완전한 호환성이 없다. B는 비용 증가로 지연이 줄지 않는다 (DynamoDB 자체 지연은 밀리초 단위). D는 읽기를 지리적으로 분산하지만 마이크로초 응답을 보장하지 않는다.

---

**문제 3.** ElastiCache Redis의 Cluster Mode Enabled와 Cluster Mode Disabled의 차이는?

A) Cluster Mode Enabled는 Multi-AZ를 지원하지 않는다
B) Cluster Mode Enabled는 데이터를 여러 샤드에 나누어 수 TB까지 확장 가능하고, Multi-Key 작업에 제약이 있다
C) Cluster Mode Disabled는 단일 AZ에서만 동작한다
D) Cluster Mode Enabled는 Memcached와 동일한 기능을 제공한다

**정답: B**

해설: Cluster Mode Enabled는 16384개의 슬롯을 여러 샤드에 나누어 데이터를 분산한다. 각 샤드는 독립적인 Primary + Replica 구조이므로 총 용량이 샤드 수 × 노드 용량이 된다. 단, Multi-Key 작업(MGET, MSET, 트랜잭션)은 모든 키가 같은 슬롯에 있어야 한다. Cluster Mode Disabled는 단일 샤드로 최대 노드 크기까지만 확장 가능하지만 Multi-Key 작업에 제약이 없다. A, C, D는 모두 잘못된 설명이다.

---

**문제 4.** 소셜 네트워크 서비스에서 "A의 친구의 친구 중 B와 연결된 사람"과 같은 다단계 관계 쿼리가 빈번하다. 가장 적합한 데이터베이스는?

A) DynamoDB (GSI로 관계 구현)
B) RDS Aurora (JOIN으로 관계 탐색)
C) Amazon Neptune (그래프 DB)
D) OpenSearch (관계 문서 인덱싱)

**정답: C**

해설: 다단계 관계 탐색(Graph Traversal)은 그래프 데이터베이스인 Neptune의 전형적 사용 사례다. Neptune은 Gremlin(Property Graph)과 SPARQL(RDF) 쿼리 언어로 "친구의 친구", "N단계 관계", "최단 경로" 등을 효율적으로 처리한다. RDS에서 JOIN으로 구현하면 단계가 늘어날수록 성능이 지수적으로 나빠진다. DynamoDB GSI로 관계를 구현하면 1단계 관계까지는 가능하지만 다단계는 비효율적이다. OpenSearch는 검색 엔진으로 관계 탐색에 부적합하다.

---

**문제 5.** Redis API를 사용하는 애플리케이션에서 캐시 데이터가 Primary 장애 시 절대 손실되면 안 된다. 세션과 장바구니 데이터를 Redis에 저장하고 있으며, 이 데이터가 손실되면 사용자가 로그아웃된다. 어떤 서비스를 선택해야 하는가?

A) ElastiCache Redis (Multi-AZ)
B) ElastiCache Redis (Cluster Mode Enabled)
C) MemoryDB for Redis
D) ElastiCache Redis (AOF 활성화)

**정답: C**

해설: ElastiCache Redis는 Multi-AZ 복제가 비동기이므로 Primary 장애 시 최근 쓰기가 손실될 수 있다. AOF를 활성화해도 비동기 복제의 본질적 한계는 남는다. MemoryDB for Redis는 Multi-AZ 트랜잭션 로그로 모든 쓰기를 여러 AZ에 동기적으로 영속화하므로 데이터 손실이 없다. Redis API를 그대로 사용할 수 있어서 코드 변경도 최소화된다. "절대 손실 없음"이라는 키워드가 MemoryDB를 가리킨다.

---

**문제 6.** 애플리케이션 로그를 실시간으로 수집해서 "특정 에러 코드가 포함된 로그 메시지 검색", "시간대별 에러 분포 시각화", "IP 기반 이상 접속 패턴 탐지"를 가능하게 하는 아키텍처는?

A) CloudWatch Logs → S3 → Athena 쿼리
B) CloudWatch Logs → Kinesis Data Firehose → Amazon OpenSearch Service → OpenSearch Dashboards
C) CloudWatch Logs → RDS MySQL (로그 테이블) → BI 도구
D) DynamoDB Streams → Lambda → S3

**정답: B**

해설: 전문 검색(특정 텍스트 포함), 집계 분석(시간대별 분포), 이상 탐지(패턴 검색)는 모두 OpenSearch의 강점이다. OpenSearch Dashboards(구 Kibana)로 실시간 시각화까지 제공된다. Kinesis Data Firehose는 로그를 OpenSearch로 실시간 스트리밍하는 표준 파이프라인이다. A는 로그 분석 가능하지만 실시간성이 없고 전문 검색이 제한적이다. C는 텍스트 전문 검색이 비효율적이고 실시간이 아니다. D는 이 시나리오와 관련이 없다.

---

**문제 7.** Cache-Aside 패턴에서 자주 읽히는 캐시 항목의 TTL이 만료되는 순간 수백 개의 동시 요청이 모두 DB로 몰리는 현상을 무엇이라 하며, 가장 효과적인 완화 방법은?

A) Hot Partition 현상. DynamoDB Adaptive Capacity로 해결한다
B) Thundering Herd(Cache Stampede). TTL에 랜덤 지터를 추가하거나 Mutex Lock으로 해결한다
C) Cold Start 현상. Provisioned Concurrency로 해결한다
D) Read After Write Inconsistency. 강한 일관성 읽기로 해결한다

**정답: B**

해설: Thundering Herd(Cache Stampede)는 인기 캐시 항목의 TTL이 동시에 만료될 때 모든 요청이 DB로 몰리는 현상이다. 대응 방법: (1) TTL에 무작위 지터(jitter) 추가 — `TTL = base_ttl + random(0, max_jitter)`로 만료 시점을 분산, (2) Mutex Lock — Redis의 `SET NX`로 첫 번째 요청만 DB를 조회하고 나머지는 대기, (3) Probabilistic Early Expiration — TTL 만료 직전부터 확률적으로 미리 갱신. A는 DynamoDB 파티션 문제다. C는 Lambda 초기화 지연이다. D는 분산 DB 일관성 문제다.

---
