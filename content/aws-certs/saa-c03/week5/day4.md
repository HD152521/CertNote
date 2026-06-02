# Day 24 - ElastiCache, MemoryDB, DAX, OpenSearch

📅 날짜: Week 5 (Day 4)
🎯 주제: 캐싱 / 인메모리 / 검색
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ElastiCache Redis vs Memcached 차이를 안다
- MemoryDB / DAX / ElastiCache의 포지셔닝을 구분한다
- OpenSearch가 정답인 시나리오를 안다

---

## 🧩 사전 지식 (CS 기초)

- **캐시 패턴**: Cache-Aside / Read-Through / Write-Through / Write-Behind.
- **세션 저장소**: stateless app + 외부 세션 저장소(Redis) 패턴.
- **검색 vs DB**: 전문 검색·집계는 검색 엔진(역인덱스), 트랜잭션은 RDB.
- **Eviction Policy**: 캐시 가득 차면 어떤 것을 제거할지(LRU/LFU/Random).

---

## 📖 이론 내용

### 1. ElastiCache

| 항목 | Redis (OSS/Cluster) | Memcached |
|------|-------------------|-----------|
| 데이터 구조 | String/Hash/List/Set/Zset/Stream/Geo | String만 |
| 영속성 | AOF/RDB 옵션 | 없음 |
| 복제 / HA | Multi-AZ + 자동 페일오버 | 없음 |
| 클러스터링 | 샤딩 가능 | 멀티 노드(단순 해시 분산) |
| Pub/Sub | O | X |
| 인증 | AUTH, IAM, TLS | 없음 |

> 💡 거의 모든 시나리오에서 **Redis**가 정답. Memcached는 단순 캐시 + 자원 절약일 때만.

### 2. MemoryDB for Redis

- **Redis API 호환** 그대로.
- **Multi-AZ 내구성 있는 인메모리 DB**(primary DB로 쓸 수 있음).
- 트랜잭션 로그 분산 저장.
- 마이크로초 읽기 / 한 자리수 ms 쓰기.

### 3. DAX vs ElastiCache vs MemoryDB

| 항목 | DAX | ElastiCache | MemoryDB |
|------|-----|-------------|-----------|
| 백엔드 | DynamoDB 전용 캐시 | 범용 캐시 | 자체 DB(Redis API) |
| 일관성 | DDB의 read 캐시 | 앱이 관리 | 내구성 있는 인메모리 |
| 사용 사례 | DDB 읽기 가속 | 세션·검색결과·일반 캐시 | 캐시 + 영속성 통합 |

### 4. OpenSearch

- **전문 검색 / 로그 분석 / 시계열**.
- Elasticsearch fork.
- **OpenSearch Serverless** 옵션.
- **OpenSearch Service ↔ OpenSearch Dashboards** = Kibana.

### 5. DocumentDB / Neptune / Timestream / Keyspaces / QLDB

| 서비스 | 모델 | 사용 |
|--------|------|-----|
| **DocumentDB** | MongoDB 호환 | JSON 도큐먼트 |
| **Neptune** | Graph DB | 소셜·추천·지식그래프 |
| **Timestream** | Time-series | IoT·메트릭 |
| **Keyspaces** | Apache Cassandra 호환 | 카산드라 마이그레이션 |
| **QLDB** | Ledger (불변·검증) | 감사 추적 |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Redis Cluster Mode** | 16384 슬롯 샤딩 | 큰 데이터셋 |
| **Lazy Loading vs Write-Through** | 캐시 채우는 시점 차이 | 일관성/성능 trade-off |
| **TTL** | 만료 시간 | 캐시 무한 누적 방지 |
| **Multi-AZ + Auto Failover (Redis)** | 30초 이내 페일오버 | HA |
| **OpenSearch UltraWarm / Cold** | 비용 절감 티어 | 로그 장기 보관 |

> ⚠️ **함정**: "Redis로 메시지 큐" → 가능하지만 SQS/Kafka보다 신뢰성 떨어짐. 시험에서 일반 큐는 **SQS**.

> 💡 **암기 팁**: 캐시는 ElastiCache, 영속성 인메모리 DB는 MemoryDB, DDB 가속은 DAX.

### 관련 서비스 Cross-Reference

- DDB Streams → Day 3
- CloudWatch Logs → OpenSearch 분석
- Kinesis → 실시간 로그 적재

---

## 🏗️ 아키텍처 다이어그램

```
[ 캐싱 계층 표준 ]

  ALB → ECS App
            │ 1) Redis GET key
            ▼
       ElastiCache Redis
            │ 2) miss
            ▼
         RDS Aurora
            │ 3) set with TTL
            ▼
       Redis (caches)

[ 로그 분석 파이프라인 ]

  App → CloudWatch Logs → Firehose → OpenSearch
                                          ↓
                                  OpenSearch Dashboards
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **세션·캐시·rich data structure** → **Redis**.
2. ⭐ **DDB 읽기 가속 = DAX**.
3. ⭐ **MemoryDB**는 캐시 + 영속 인메모리 통합.
4. ⭐ **검색·로그 분석 = OpenSearch**.
5. ⭐ **DocumentDB(Mongo) / Neptune(Graph) / Timestream(시계열) / Keyspaces(Cassandra) / QLDB(원장)** 시나리오 키워드.

---

## 💻 실제 예시 - AWS CLI

```bash
# ElastiCache Redis 클러스터 (Multi-AZ)
aws elasticache create-replication-group \
  --replication-group-id saa-redis \
  --replication-group-description "App cache" \
  --engine redis --cache-node-type cache.t4g.medium \
  --num-cache-clusters 2 --automatic-failover-enabled \
  --multi-az-enabled --cache-subnet-group-name sg-... \
  --security-group-ids sg-...

# OpenSearch 도메인
aws opensearch create-domain --domain-name app-logs \
  --engine-version OpenSearch_2.11 \
  --cluster-config InstanceType=r6g.large.search,InstanceCount=3 \
  --ebs-options EBSEnabled=true,VolumeType=gp3,VolumeSize=100 \
  --node-to-node-encryption-options Enabled=true \
  --encryption-at-rest-options Enabled=true
```

---

## 📝 연습 문제

**문제 1.** 세션 저장소로 stateless 앱 만들고 싶음:

A) Memcached B) ElastiCache Redis C) S3 D) RDS

**정답: B**.

---

**문제 2.** DynamoDB 읽기 가속:

A) ElastiCache B) DAX C) Aurora Read Replica D) OpenSearch

**정답: B**.

---

**문제 3.** Mongo 호환 도큐먼트 DB:

A) DynamoDB B) DocumentDB C) Neptune D) Keyspaces

**정답: B**.

---

**문제 4.** 로그 전문 검색 + 대시보드:

A) Athena B) OpenSearch C) Redshift D) ElastiCache

**정답: B**.

---

**문제 5.** 영속성 있는 인메모리 DB(Redis API):

A) ElastiCache Redis B) MemoryDB C) DAX D) Aurora

**정답: B**.

---

## 📌 오늘의 요약

1. Redis가 거의 모든 캐시 시나리오 정답.
2. DAX = DDB 전용 캐시, MemoryDB = 영속 인메모리 DB.
3. OpenSearch = 전문 검색 + 로그 분석.
4. DocumentDB/Neptune/Timestream/Keyspaces/QLDB는 키워드 매핑.
5. ElastiCache Multi-AZ + Cluster Mode + TLS + IAM이 운영 권장.
