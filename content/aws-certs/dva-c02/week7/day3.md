# Day 3 - ElastiCache: 인메모리 캐시는 어떻게 DB를 살리는가

캐시는 컴퓨터 시스템 모든 계층에 존재한다. CPU L1/L2/L3, OS 페이지 캐시, 디스크 컨트롤러 캐시, 브라우저 캐시, CDN — 그리고 애플리케이션과 DB 사이에는 **인메모리 캐시**가 들어선다. ElastiCache는 그 자리를 채우는 관리형 서비스로, Redis와 Memcached 두 엔진을 같은 콘솔에서 제공한다. 둘 다 인메모리지만 설계 철학이 정반대다 — Redis는 "데이터 구조 서버"를 표방하고, Memcached는 "단순한 분산 메모리 풀"을 표방한다. 이 차이가 시험과 실무 양쪽에서 가장 자주 묻는 지점이다.

DVA-C02에서 ElastiCache는 보통 두 형태로 나온다. ① "DB 부하가 너무 높다 + 같은 쿼리가 반복된다" → 캐시 도입 ② "여러 EC2/ECS 인스턴스 간 세션 공유" → ElastiCache Redis. 그리고 한 단계 더 들어가면 "왜 캐시가 stale data를 보여주는가" — 즉 cache invalidation 전략을 묻는다. 오늘 다룰 내용은 이 세 층위 전부다.

## 캐시는 왜 존재하는가 — Locality of Reference의 응용

ElastiCache 같은 외부 캐시가 작동하는 근본 원리는 1960년대 컴퓨터 아키텍처가 발견한 **참조 지역성(locality of reference)** 원칙이다. 시간 지역성(temporal locality)은 "최근 접근한 데이터는 곧 다시 접근될 가능성이 높다", 공간 지역성(spatial locality)은 "한 데이터를 접근하면 주변 데이터도 접근될 가능성이 높다". 웹 서비스에서 **사용자 프로필, 상품 정보, 세션 데이터, 인기 게시글** 같은 객체는 모두 시간 지역성이 매우 높다 — 한 사용자가 자기 프로필을 5분 안에 N번 조회한다.

DB 한 번의 디스크 I/O는 SSD라도 100μs ~ 1ms, HDD는 5-10ms. 반면 같은 데이터를 RAM에서 가져오면 100ns 이하. **약 1만~10만 배 차이**다. 한 페이지 렌더링에 100개의 객체가 필요한 SNS 피드를 떠올리면, DB로 100 RTT를 도는 것과 캐시로 100 RTT를 도는 차이는 페이지 응답 시간이 5초 vs 5ms 수준으로 갈린다.

> 💡 **관련 이론**: 캐시 효과를 정량화하는 표준 공식은 평균 접근 시간(Average Memory Access Time, AMAT) = Hit_time + Miss_rate × Miss_penalty이다. Hit_time이 0.5ms, Miss_rate가 5%, Miss_penalty가 50ms(DB 조회 + 캐시 저장)라면 AMAT = 0.5 + 0.05 × 50 = 3ms. Miss_rate를 1%로 낮추면 AMAT = 1ms로 떨어진다. 캐시 hit ratio가 1-2%만 개선돼도 평균 latency가 절반이 되는 이유가 여기 있다. 시험에선 "캐시 도입 후 latency가 줄지 않는다" 시나리오에서 hit ratio를 의심하는 패턴으로 출제된다.

## Redis vs Memcached: 1996년 vs 2009년이 만든 차이

Memcached는 2003년 LiveJournal의 Brad Fitzpatrick이 만든, 정확히 "분산 메모리 캐시"만 하는 도구다. 데이터 모델은 단순히 키 → 바이트 문자열, TTL 옵션 하나뿐. 멀티스레드로 짜여서 한 노드에 코어가 많을수록 처리량이 선형으로 늘어난다. Redis는 2009년 Salvatore Sanfilippo가 만든, **데이터 구조 서버(data structure server)**를 표방하는 도구다. String 외에도 List, Hash, Set, Sorted Set, Stream, HyperLogLog, Geo, Bitmap — 9가지 자료구조를 in-memory로 제공하고, 각각에 대해 O(log N) 이하의 풍부한 연산을 지원한다. Redis는 **단일 스레드 이벤트 루프**(libevent 기반)로 짜였기 때문에 atomic operation이 자연스럽고, 대신 한 코어 이상 활용하려면 여러 인스턴스/샤드를 둬야 한다.

| 차원 | Redis | Memcached |
|------|-------|-----------|
| 데이터 모델 | 9가지 구조 (String, List, Hash, Set, ZSet, Stream, HLL, Geo, Bitmap) | String만 |
| 스레드 모델 | 단일 스레드 이벤트 루프 + I/O threads (6.0+) | 멀티스레드 |
| 영속성 | RDB 스냅샷 + AOF | 없음 |
| 복제 | Primary-Replica 비동기 | 없음 (클라이언트 측 sharding만) |
| 클러스터 | Cluster Mode (16384 hash slot) | 없음 (consistent hashing은 클라이언트) |
| Pub/Sub | ✅ | ❌ |
| 트랜잭션 | MULTI/EXEC, Lua script | ❌ |
| 키 만료 정책 | 다양 (volatile-lru, allkeys-lfu 등 8가지) | LRU 고정 |
| 최대 값 크기 | 512MB | 1MB(기본) |

> 🔍 **더 깊이**: Redis가 단일 스레드인데도 빠른 이유는 모든 명령이 **메모리 내 O(1) ~ O(log N) 연산**이고, network I/O가 libevent의 epoll 기반 비동기로 처리되기 때문이다. 100,000 QPS를 한 코어로 처리하는 게 가능한 건 한 명령 처리 시간이 마이크로초 수준이라 컨텍스트 스위치 비용이 오히려 손해이기 때문이다. Redis 6.0부터는 network I/O만 별도 스레드 풀로 분리("I/O threading")해서 멀티 코어를 일부 활용하지만, 명령 실행 자체는 여전히 단일 스레드를 유지한다. 이게 atomic 보장과 성능을 동시에 잡는 설계다.

| 결정 트리 |
|----------|
| 영속성/백업 필요 → **Redis** |
| Multi-AZ HA 필요 → **Redis** |
| Sorted Set/Hash/Stream 같은 자료구조 필요 → **Redis** |
| 단순 key-value + 대용량 + 멀티코어 활용 → **Memcached** |
| 캐시가 죽어도 상관 없는 무상태 캐시 → **Memcached** (또는 Redis도 가능) |

> ⚠️ **함정**: "ElastiCache로 게임 리더보드 만들기" 시나리오는 무조건 Redis Sorted Set이 답이다. ZADD/ZRANGE/ZREVRANK가 O(log N)에 동작해서 수십만 명 리더보드를 ms 단위로 처리한다. Memcached로는 같은 기능 구현이 불가능에 가깝다(매번 전체 로드해서 정렬해야 함). 시험에서 "leaderboard", "ranking", "real-time score"라는 단어가 보이면 Redis 즉답.

## 캐싱 전략 5종 — 같은 도구를 5가지 방식으로 쓰는 법

캐시는 같은 ElastiCache 인스턴스라도 **어떤 시점에 무엇을 채우고 무엇을 지우는가**의 정책에 따라 시스템 일관성과 성능이 완전히 달라진다. 시험에선 이 5가지 전략을 명확히 구분해서 묻는다.

### Lazy Loading (Cache-Aside)

가장 흔한 패턴. **읽기 요청이 올 때만 캐시를 채운다**. 미스가 나면 DB 조회 후 캐시에 저장.

```python
def get_product(product_id):
    cached = cache.get(f'product:{product_id}')
    if cached:
        return json.loads(cached)          # cache hit
    item = db.get_item(Key={'id': product_id})['Item']
    cache.setex(f'product:{product_id}', 3600, json.dumps(item))  # 1h TTL
    return item
```

- 장점: 실제로 조회된 데이터만 캐시 → 메모리 효율
- 단점: 첫 요청은 항상 느림 (cold miss). 또한 DB가 갱신돼도 캐시는 모르므로 **stale data** 위험

### Write-Through

쓰기 시점에 **DB와 캐시를 동시에 갱신**. 캐시가 항상 최신 상태.

```python
def update_product(product_id, data):
    db.put_item(Item=data)
    cache.setex(f'product:{product_id}', 3600, json.dumps(data))
```

- 장점: 데이터 신선도 보장
- 단점: 안 읽힐 데이터까지 캐시에 들어감 → 메모리 낭비. 쓰기 latency 증가

### Write-Back (Write-Behind)

쓰기 시 캐시만 먼저 갱신하고, **백그라운드로 DB에 비동기 flush**. 쓰기 성능 극대화.

- 장점: 쓰기 throughput 매우 높음
- 단점: 캐시가 죽으면 미반영 데이터 손실. 데이터 정합성 보장이 어려워 ElastiCache로는 직접 구현보다는 Kafka/Kinesis 같은 큐를 사이에 두는 패턴을 권장
- 시험에선 거의 안 나오지만 안티패턴 인지가 중요

### Read-Through

애플리케이션이 캐시 라이브러리에 요청하면, **캐시 라이브러리가 자동으로 DB까지 다녀온다**. 사용자 코드는 cache.get만 호출.

- 장점: 호출 측 코드 단순
- 단점: ElastiCache는 native read-through를 지원 안 함 — Hibernate L2 cache, Spring Cache 같은 framework 레벨에서 구현됨

### Refresh-Ahead

**TTL 만료 직전에 백그라운드로 미리 갱신**해서 사용자에게는 cache miss가 보이지 않게.

- 장점: 사용자 latency 일정
- 단점: 예측이 빗나가면 불필요한 DB 호출. 모든 키에 적용하면 부하 폭증

| 전략 | 데이터 신선도 | 쓰기 비용 | 메모리 효율 | 실무 빈도 |
|------|--------------|----------|-------------|----------|
| Lazy Loading | 약 (stale 가능) | 낮음 | 높음 | ★★★★★ |
| Write-Through | 강 | 높음 | 낮음 (전부 캐시) | ★★★ |
| Write-Back | 약 | 매우 낮음 | 낮음 | ★ |
| Read-Through | 약 | 낮음 | 높음 | ★★ |
| Refresh-Ahead | 강 | 중간 | 중간 | ★ |

> 💡 **관련 이론**: Phil Karlton이 남긴 유명한 문장 — "There are only two hard things in Computer Science: cache invalidation and naming things." 캐시 무효화가 어려운 이유는 **분산 시스템에서 데이터의 source of truth가 여러 곳에 복제될 때, 변경을 모든 복제본에 일관되게 전파하는 게 본질적으로 분산 합의(distributed consensus) 문제이기 때문**이다. ElastiCache + RDS 조합에서 "RDS에 직접 UPDATE를 친 데이터는 캐시에서 갱신되지 않는다"는 함정이 실무에서 자주 사고를 낸다. 해결책은 ① 모든 쓰기가 애플리케이션을 통과하도록 강제 ② DDB Streams/Debezium 같은 CDC로 캐시 무효화 이벤트 발행 ③ 짧은 TTL로 stale window를 제한.

> 📚 **사례**: 2010년 Facebook은 자체 Memcached 클러스터에서 thundering herd 문제를 겪었다 — 인기 게시물의 캐시가 만료되는 순간 수천 개의 동시 요청이 DB로 몰려 DB가 다운. 해결책으로 도입한 게 **lease token** 메커니즘(USENIX 2013 "Scaling Memcache at Facebook" 논문)이다. 첫 miss 요청에게만 토큰을 발급하고, 나머지 요청은 잠시 기다리거나 stale 데이터를 사용한다. 이 패턴이 Redis에서는 `SET NX EX`(Distributed lock pattern) 또는 single-flight 패턴으로 구현된다. Lazy Loading만 단순하게 쓰면 인기 콘텐츠 만료 시점에 비슷한 사고가 난다.

## Redis Cluster Mode: 데이터 분산의 16,384 슬롯

ElastiCache Redis는 두 가지 토폴로지를 가진다.

**Cluster Mode Disabled**: 1 primary + 최대 5 replicas의 단일 샤드. 모든 키가 한 노드에 들어가므로 메모리 한도가 인스턴스 메모리 크기와 같다(예: cache.r7g.xlarge = 25GB).

**Cluster Mode Enabled**: 여러 샤드(최대 500개) × 각 (1 primary + 최대 5 replicas). Redis 자체의 hash slot 메커니즘으로 키를 16,384개 슬롯에 분산하고, 슬롯을 샤드에 매핑한다. 키의 해싱 함수는 CRC16(key) mod 16384.

```
키 "user:123"
   ↓ CRC16
슬롯 5474
   ↓ 매핑 테이블
샤드 3
   ↓
샤드 3의 primary 노드
```

> 🔍 **더 깊이**: 16,384는 임의의 숫자가 아니다. Redis 저자 antirez(Salvatore Sanfilippo)의 설계 노트에 따르면 ① 슬롯 매핑 정보를 모든 노드가 들고 있어야 하는데 16K 슬롯은 ~2KB 비트맵으로 충분 ② Redis 클러스터 최대 노드 수가 1,000개 정도로 설계됐으므로 슬롯/노드 비율이 16:1이면 데이터 분산 균등성이 좋음 ③ 클러스터 메시지를 가십 프로토콜로 교환할 때 메시지 크기에도 영향 — 이 균형점이 16,384다. (참고: GitHub antirez/redis 이슈 #2576)

Cluster Mode를 켜면 **트랜잭션과 multi-key 연산에 제약**이 생긴다. `MULTI/EXEC`나 `MGET`은 모든 키가 같은 슬롯에 있어야 한다. 해결책은 **hash tag** — 키 이름에 `{...}` 안의 부분만 해싱에 사용되도록 강제. 예: `user:{123}:profile`, `user:{123}:settings`는 둘 다 `{123}` 부분만 해싱되어 같은 슬롯에 위치하므로 `MGET user:{123}:profile user:{123}:settings`가 가능.

| 모드 | 메모리 한도 | 처리량 | 복잡도 | 시나리오 |
|------|-------------|--------|--------|---------|
| Cluster Mode Disabled | 단일 노드 메모리 (최대 ~635GB) | 단일 primary 처리량 | 낮음 | 일반 캐시, 세션 |
| Cluster Mode Enabled | 샤드 수 × 노드 메모리 (수십 TB 가능) | 샤드 수만큼 선형 확장 | 높음 (hash tag, client 지원) | 대규모 캐시, 글로벌 서비스 |

> ⚠️ **함정**: Cluster Mode Enabled로 마이그레이션할 때 **클라이언트 라이브러리가 Cluster protocol을 지원**해야 한다. Java면 Jedis Cluster 클라이언트, Python이면 `redis-py-cluster`(또는 `redis-py 4.x`의 RedisCluster). 일반 Redis 클라이언트로 클러스터 endpoint에 접속하면 MOVED/ASK redirect를 처리 못 해 에러가 난다. 시험에서 "ElastiCache로 마이그레이션했더니 일부 명령이 실패" → 클라이언트 cluster 지원 확인.

## Redis 영속성: RDB와 AOF의 trade-off

Redis가 인메모리지만 영속성 옵션을 제공하는 이유는 **재시작 시 캐시 cold start**를 피하기 위해서다. 캐시가 비어 있으면 모든 요청이 DB로 몰려 thundering herd 사고가 난다. 영속성 메커니즘은 두 가지.

**RDB (Redis Database)**: 일정 간격(예: 5분에 100개 키 변경 시)으로 전체 메모리를 **바이너리 스냅샷**으로 디스크에 덤프. 파일 크기 작고 복원 빠름. 단점: 마지막 스냅샷 이후 데이터는 손실.

**AOF (Append-Only File)**: 모든 쓰기 명령을 텍스트 로그로 디스크에 append. 데이터 손실 거의 0(`fsync everysec` 옵션). 단점: 파일 크기 큼, 복원 시 모든 명령 replay 필요해 느림.

ElastiCache는 **자동 백업**(매일 1회 RDB 스냅샷, S3 저장)과 **수동 백업**을 지원한다. AOF는 ElastiCache Redis Cluster Mode Enabled에서는 비활성화돼 있고 Multi-AZ replica로 대체 권장.

> 🔍 **더 깊이**: ElastiCache가 AOF를 권장하지 않는 이유는 ① fsync 비용으로 처리량이 30-50% 감소 ② Multi-AZ replica로 동일한 내구성 확보 가능 ③ AOF replay 시간 동안 서비스 불가 — 즉 캐시 용도에서는 cost-benefit이 안 맞다. MemoryDB(2021년 출시)는 정확히 이 문제를 해결한 별개 서비스로, **multi-AZ transaction log**(DynamoDB와 유사한 메커니즘)로 strongly consistent + durable Redis를 제공한다. 가격은 ElastiCache의 약 2-3배.

## 세션 관리: ElastiCache의 킬러 유스케이스

스테이트풀 웹 애플리케이션에서 여러 EC2/ECS 인스턴스가 ALB 뒤에 있을 때, 사용자가 매 요청마다 다른 인스턴스로 라우팅되면 **세션 데이터 공유 문제**가 발생한다. 옛날엔 ALB sticky session으로 우회했지만, 이는 ① 인스턴스 다운 시 세션 손실 ② 로드 불균등 ③ 오토스케일링과 충돌이라는 문제가 있다.

ElastiCache Redis로 세션을 외부화하면 모든 인스턴스가 같은 캐시를 본다. 구현 패턴:

```python
import redis, secrets, json, time

cache = redis.Redis(host='session-cache.xxxx.cache.amazonaws.com',
                    port=6379, ssl=True, decode_responses=True)

SESSION_TTL = 1800  # 30분

def create_session(user_id):
    sid = secrets.token_urlsafe(32)
    data = {'user_id': user_id, 'created_at': time.time(),
            'csrf_token': secrets.token_urlsafe(16)}
    cache.setex(f'sess:{sid}', SESSION_TTL, json.dumps(data))
    return sid

def get_session(sid):
    raw = cache.get(f'sess:{sid}')
    if raw is None:
        return None
    # sliding window: 접근 시마다 TTL 갱신 (active session 유지)
    cache.expire(f'sess:{sid}', SESSION_TTL)
    return json.loads(raw)

def invalidate_session(sid):
    cache.delete(f'sess:{sid}')  # 로그아웃
```

> 📚 **사례**: 2018년 Slack은 ALB sticky session으로 세션을 관리하다가 노드 한 대가 다운되면서 약 40만 명의 사용자가 강제 로그아웃되는 사고를 겪었다. 회고 후 Redis 기반 세션 스토어(자체 운영)로 전환했고, 이후 비슷한 사고가 사라졌다. AWS 환경이라면 ElastiCache Redis가 같은 역할 — Multi-AZ + 자동 페일오버로 인스턴스 다운에도 세션 유지.

## 보안: AUTH, In-Transit Encryption, IAM 통합

ElastiCache의 보안은 세 레이어로 구성된다.

**Network**: VPC 내부 endpoint만 제공(public endpoint 없음). Security Group으로 6379(Redis)/11211(Memcached) 포트를 애플리케이션 SG에만 허용.

**Authentication**: Redis는 **AUTH 토큰**(Redis 5+) 또는 **RBAC**(Redis 6+, ElastiCache 6.0+). RBAC는 사용자별로 명령/키 ACL을 부여할 수 있다(예: read-only user는 GET/HGET만 허용). 2023년부터 **IAM authentication for ElastiCache Redis**가 추가되어 RDS IAM Auth와 비슷한 방식으로 동작 — IAM 정책으로 `elasticache:Connect` 허용 + Redis 사용자에 IAM 인증 매핑.

**Encryption**:
- In-transit: TLS 활성화 옵션 (생성 시 설정, 사후 변경 시 백업/복원 필요)
- At-rest: KMS로 EBS 볼륨 암호화

> ⚠️ **함정**: ElastiCache는 **퍼블릭 IP를 가질 수 없다**. 외부에서 접속하려면 ① VPN ② Direct Connect ③ EC2 bastion + SSH tunnel 셋 중 하나. 시험에서 "온프레미스에서 ElastiCache 직접 접근" 시나리오는 거의 항상 VPN/Direct Connect가 답.

## ElastiCache Serverless (2023 GA)

전통적 ElastiCache는 노드 클래스를 선택해야 한다(`cache.r7g.large` 등). Serverless 옵션은 용량 결정을 AWS에 위임하고 **ECPU(읽기/쓰기 단위) + 저장 GB로 과금**한다. 트래픽이 예측 불가능하거나 짧은 burst가 잦은 워크로드에 유리. 단점: 단가가 reserved 노드 대비 비싸므로 안정적 트래픽엔 손해.

| 차원 | ElastiCache (Provisioned) | ElastiCache Serverless |
|------|---------------------------|------------------------|
| 용량 결정 | 수동 (node class) | 자동 |
| 과금 | 노드 시간당 | ECPU + GB-시간 |
| 최소 비용 | 노드 1개 시간당 | 매우 낮음 |
| 최대 확장 | 수동 scale-up/out | 자동 |
| 시나리오 | 예측 가능한 워크로드 | 변동 큰 워크로드 |

## MemoryDB vs ElastiCache Redis: 캐시 vs 주 DB

MemoryDB는 2021년 출시된 **Redis 호환 in-memory DB**다. ElastiCache와 같은 Redis API를 쓰지만, 내부 아키텍처가 다르다 — 모든 쓰기가 **multi-AZ transaction log**(DynamoDB 기반)에 동기 복제된 후 ack을 반환. 즉 RDS Multi-AZ와 같은 RPO≈0 durability를 ms 단위 latency로 제공한다.

| 항목 | ElastiCache Redis | MemoryDB |
|------|-------------------|----------|
| 영속성 | 옵션 (RDB/AOF/replica) | 표준 (multi-AZ tx log) |
| 일관성 | replica는 eventually consistent | strongly consistent |
| 쓰기 latency | 수백 μs | 수 ms (tx log 동기 복제) |
| 읽기 latency | μs | μs (primary), ms 미만 (replica) |
| 가격 | 기준 | ElastiCache의 2-3배 |
| 적합 사용 | 캐시, 세션 | 마이크로서비스 주 DB |

> 💡 **실무 패턴**: 신규 마이크로서비스에서 "단일 entity 조회/수정이 주된 워크로드 + ms 단위 응답 필요 + DB-grade durability"라면 RDS보다 MemoryDB가 적합한 경우가 있다. 단가가 비싸지만 DB Proxy/replica/백업 운영을 단순화한다. 시험엔 자주 안 나오지만 "마이크로초 latency + durable"이라는 키워드 조합이 나오면 MemoryDB를 고려.

## 정리하며

ElastiCache는 단순해 보이지만 **엔진 선택(Redis vs Memcached) → 토폴로지 선택(Cluster Mode On/Off) → 캐싱 전략(Lazy/Write-Through/...) → 무효화 메커니즘** 네 층의 의사결정이 누적된다. 각 층의 선택이 일관성, 성능, 비용을 다르게 잡아당기므로 시험 시나리오는 항상 "주어진 요구사항에서 어느 조합이 최적인가"를 묻는다.

가장 자주 출제되는 결정 두 가지를 다시 정리한다. **① 영속성/Multi-AZ/복잡한 자료구조가 하나라도 필요하면 Redis.** **② 캐시 stale 위험이 있으면 lazy loading 단독 X — TTL 짧게 + 이벤트 기반 무효화 또는 write-through 결합.** 이 두 원칙만 잡고 시나리오를 풀면 80%는 정답을 맞춘다.

다음 글에서는 Aurora — RDS의 호환만 유지하면서 스토리지·복제 레이어를 완전히 재설계한 별개 엔진 — 의 내부 구조와 Aurora Serverless v2를 본다.

---

## 📝 연습 문제

**문제 1.** 한 게임 회사가 실시간 글로벌 리더보드를 구현하려 한다. 1억 명의 점수를 실시간 정렬하고 특정 유저의 순위를 ms 단위에 조회해야 한다. 가장 적합한 도구는?

A) ElastiCache Memcached + 클라이언트 측 정렬
B) ElastiCache Redis Sorted Set (ZADD/ZREVRANK)
C) DynamoDB GSI
D) Aurora MySQL + ORDER BY

**정답: B**

해설: Redis Sorted Set은 정확히 이 유스케이스를 위해 설계된 자료구조다. ZADD는 O(log N), ZREVRANK/ZRANGE도 O(log N) — 1억 데이터에서도 약 27회의 비교로 처리. 내부적으로 skip list + hash table을 동시 유지해 정렬과 키 조회 양쪽이 빠르다. A) Memcached는 자료구조 없음, 클라이언트로 전체 가져와 정렬하면 비현실적. C) DynamoDB GSI는 N+1 쿼리와 throughput 비용이 큼. D) Aurora ORDER BY는 1억 row 정렬이 분 단위.

---

**문제 2.** Lazy Loading 캐싱 전략의 가장 큰 단점은?

A) 모든 데이터가 캐시에 저장되어 메모리 부족
B) Cache miss 시 첫 요청 latency가 길고, DB 갱신 시 stale data 위험
C) 구현이 복잡함
D) Multi-AZ에서 동작하지 않음

**정답: B**

해설: Lazy Loading은 ① cold miss로 첫 요청이 느림 ② 캐시 외부에서 DB가 갱신되면 캐시는 모르므로 stale data 반환. A는 반대 — Lazy Loading은 조회된 데이터만 저장하므로 메모리 효율은 오히려 좋다. C도 반대 — 구현은 가장 단순. D는 무관. 해결책: TTL 짧게 + 이벤트 기반 무효화 + write-through 결합.

---

**문제 3.** ALB 뒤에 여러 EC2 인스턴스가 있는 웹 애플리케이션에서 세션 공유 문제를 해결하려 한다. 가장 적절한 방법은?

A) ALB sticky session 활성화
B) ElastiCache Redis에 세션 저장
C) 각 EC2에 로컬 파일 시스템 세션 저장
D) S3에 세션 JSON 파일 저장

**정답: B**

해설: B는 sticky session의 문제(인스턴스 다운 시 세션 손실, 로드 불균등)를 모두 해결한다. ElastiCache Redis는 ms 단위 응답 + Multi-AZ로 페일오버 시 세션 유지 + TTL로 자동 만료. A) sticky session은 단기 해결이지만 인스턴스 한 대가 죽으면 그 인스턴스에 묶인 세션 전부 손실. C) 로컬 파일은 다른 인스턴스가 못 봄(애초에 같은 문제). D) S3는 latency가 ms 단위지만 호출당 비용 + 100s of ms latency로 세션 조회에 부적합.

---

**문제 4.** ElastiCache Redis Cluster Mode Enabled에서 `MGET user:1 user:2 user:3` 명령이 "CROSSSLOT Keys in request don't hash to the same slot" 에러를 낸다. 가장 적절한 해결책은?

A) Cluster Mode를 Disabled로 변경
B) hash tag 사용 — 키를 `user:{1}`, `user:{2}` 식으로 변경하되 같은 그룹은 동일 tag 사용
C) MGET 대신 GET을 N번 호출
D) Memcached로 전환

**정답: B (실무 정답) / C (현실적 대안)**

해설: Cluster Mode에서 multi-key 명령은 모든 키가 같은 슬롯에 있어야 한다. `{...}` 안의 부분만 해싱되는 hash tag로 같은 슬롯에 강제 배치 가능. 예: `cart:{user123}:item1`, `cart:{user123}:item2`는 둘 다 `user123` 해시로 같은 슬롯. A) Cluster Mode 해제는 메모리 확장성을 포기하는 큰 변경. C)는 작동하지만 round-trip 증가로 성능 저하 — pipelining으로 완화 가능. D)는 과도한 변경.

---

**문제 5.** 한 회사가 ElastiCache Redis 노드가 재시작될 때마다 캐시가 비어 DB로 트래픽 폭증이 일어나는 thundering herd를 겪는다. 다음 중 도움이 되지 않는 것은?

A) Multi-AZ 활성화 (replica로 페일오버, 캐시 유지)
B) AOF 영속성 활성화 (재시작 후 복원)
C) Application 측 single-flight 패턴 (한 키당 동시 DB 조회 1개로 제한)
D) Memcached로 전환

**정답: D**

해설: D는 오히려 악화 — Memcached는 영속성 없음, Multi-AZ 없음. 재시작 시 캐시 전부 손실되어 thundering herd가 더 심해진다. A) Multi-AZ는 primary 다운 시 replica로 즉시 페일오버해 캐시 유지(가장 직접적 해결책). B) AOF는 재시작 후 복원 가능(단 ElastiCache는 AOF 제한적 — Multi-AZ replica 권장). C) single-flight은 어떤 캐시든 효과적인 application-level 방어.

---

**문제 6.** Redis와 Memcached의 차이로 옳지 않은 것은?

A) Redis는 데이터 영속성을 지원하지만 Memcached는 미지원
B) Redis는 다양한 데이터 구조(List, Hash, Set, Sorted Set 등)를 지원
C) Memcached는 멀티스레드, Redis는 단일 스레드 이벤트 루프
D) Memcached는 Multi-AZ 자동 페일오버를 지원

**정답: D**

해설: Memcached는 Multi-AZ를 지원하지 않는다. 클러스터링은 가능하지만 자동 페일오버 없음 — 노드 다운 시 클라이언트가 재해싱(consistent hashing). A)B)C)는 모두 옳다. ElastiCache 시험 문제는 거의 항상 "Multi-AZ/영속성/복잡한 자료구조 → Redis" 매핑을 묻는다.
