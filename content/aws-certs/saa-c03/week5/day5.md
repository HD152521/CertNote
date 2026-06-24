# Day 5 - Week 5 복습: 데이터베이스 선택의 기술

5주차에서 다룬 데이터베이스 서비스들은 각각 다른 문제를 풀기 위해 만들어졌다. RDS는 전통적 관계형 DB를 관리 부담 없이, Aurora는 관계형 DB의 한계를 스토리지 재설계로, DynamoDB는 스키마 없이 수억 개의 항목을 밀리초로, ElastiCache는 메모리 속도로 반복 읽기를. 이 서비스들이 시험에서 어떻게 출제되는지 확실히 정리하는 날이다.

시험 문제는 대부분 "이 시나리오에서 무엇을 선택하겠는가"의 형태로 나온다. 여러 선택지 중 하나가 기술적으로 가능해 보이지만 나머지보다 더 나은 이유를 찾는 것이 핵심이다. 그 "더 나은 이유"를 찾으려면 각 서비스의 설계 목적과 제약을 내부에서 이해해야 한다. 기술을 외우는 것이 아니라 왜 그렇게 설계됐는지를 이해해야 하는 이유가 여기에 있다.

## 한 주 핵심 정리

### RDS — 관리형 관계형 DB의 두 축

RDS의 시험 핵심은 Multi-AZ와 Read Replica의 차이다. 이 두 기능은 완전히 다른 목적으로 만들어졌는데도 자주 혼동된다. Multi-AZ는 **동기 복제**로 Standby를 유지하며, 장애 시 자동으로 Standby를 Primary로 승격하는 **HA(고가용성)** 도구다. Read Replica는 **비동기 복제**로 읽기 전용 복사본을 만들어 **읽기 트래픽을 분산**하는 도구다.

두 기능이 다른 목적이라는 증거: Standby는 평상시 트래픽을 처리하지 않는다. Primary 장애 시 자동 페일오버(60-120초)를 위해서만 존재한다. Read Replica는 별도 엔드포인트로 읽기 트래픽을 받는다. 페일오버는 수동 Promote가 필요하고 수 분~수십 분이 걸린다.

RDS Proxy는 두 문제를 각각 다른 방식으로 해결한다. Lambda처럼 단발적이고 대량의 연결을 만드는 클라이언트에는 연결 풀링을 제공하고, Multi-AZ 페일오버 시 클라이언트의 연결 전환 시간을 단축한다.

| 기능 | 목적 | 복제 방식 | 페일오버 | 읽기 | 비용 |
|------|------|---------|---------|------|------|
| Multi-AZ | HA (고가용성) | 동기 (Synchronous) | 자동 (60-120초) | Standby 읽기 불가 | 2배 |
| Read Replica | 읽기 확장 | 비동기 (Async) | 수동 Promote | 가능 (별도 엔드포인트) | Replica당 추가 |
| RDS Proxy | 연결 풀링 | N/A | 페일오버 가속 | N/A | 인스턴스 비용의 일부 |

> 💡 **RDS Multi-AZ 동기 복제가 1-2ms 지연에도 동작하는 이유** — RDS Multi-AZ의 동기 복제가 AZ 간 1-2ms 지연에도 불구하고 잘 동작하는 이유는 데이터베이스 트랜잭션의 commit 패턴에 있다. OLTP 시스템에서 대부분의 트랜잭션은 ms 단위로 완료된다. 1-2ms의 AZ 간 RTT가 추가되더라도 전체 트랜잭션 완료 시간은 수 ms 수준이므로 사용자 체감 지연이 크지 않다. 반면 리전 간 RTT(예: 서울~도쿄 약 35ms)는 OLTP 트랜잭션에 심각한 영향을 준다. 이것이 "리전 간 동기 복제는 불가능하다"는 설계 결정의 근거이고, Aurora Global Database가 스토리지 레이어에서 비동기 복제를 선택한 이유다.

### Aurora — 공유 스토리지가 만드는 차이

Aurora의 차별점은 공유 분산 스토리지다. 6 카피, 3 AZ, 4/6 Quorum 쓰기. 이 구조가 만드는 실질적 차이:

- **페일오버 30초 이내**: 스토리지는 계속 살아 있으므로 새 Writer 인스턴스를 스토리지에 연결하기만 하면 된다. RDS처럼 Standby가 Redo Log를 적용하는 시간이 필요 없다.
- **Read Replica 최대 15개**: 모든 Reader가 공유 스토리지를 읽으므로 Replica당 별도 EBS가 없다. 추가 스토리지 비용 없이 Reader를 늘릴 수 있다.
- **Replication Lag 수십 ms**: 공유 스토리지라서 "복제" 자체가 없다. Reader가 공유 스토리지에서 읽는 것이므로 Writer와 거의 동시에 같은 데이터를 본다.

Aurora Global Database는 스토리지 레이어에서 리전 간 복제를 해서 < 1초 지연을 달성한다. RDS Cross-Region Read Replica는 DB 엔진 레이어(binlog/WAL)에서 복제하므로 지연이 더 길다.

```
[Aurora 공유 스토리지 구조]
Writer EC2 (AZ-a)    Reader EC2 (AZ-b)    Reader EC2 (AZ-c)
     │                     │                     │
     └─────────────────────┴─────────────────────┘
                           │
                    공유 분산 스토리지
               (6 copies / 3 AZ / 자동 복구)
                AZ-a: Copy 1, Copy 2
                AZ-b: Copy 3, Copy 4
                AZ-c: Copy 5, Copy 6
              4/6 Quorum 쓰기 / 3/6 Quorum 읽기
```

### DynamoDB — 파티션 설계가 성능의 전부

DynamoDB에서 가장 중요한 단일 개념은 파티션 키 설계다. Hot Partition이 발생하면 Adaptive Capacity로 완화할 수 있지만 근본적으로는 파티션 키를 재설계해야 한다.

| 개념 | 핵심 사실 |
|------|----------|
| 파티션 키 | 균등 분포 + High Cardinality 필수 |
| WCU | 1KB 쓰기 1회 = 1 WCU (트랜잭션은 ×2) |
| RCU | 4KB 강한 일관성 읽기 1회 = 1 RCU, 결과적 일관성은 ×0.5 |
| LSI | 같은 PK, 다른 SK. 생성 시만 추가. 강한 일관성 가능 |
| GSI | 다른 PK. 언제든 추가. 결과적 일관성만 |
| DAX | DynamoDB 전용 캐시. SDK 변경만으로 적용. 마이크로초 |
| Global Tables | 멀티 리전 액티브-액티브. LWW 충돌 해결. ~1초 복제 |
| Streams | 24시간 변경 로그. Lambda 이벤트 소스 매핑으로 후속 처리 |
| On-Demand | 트래픽 예측 불가 시. 요청당 과금 |
| Provisioned+AS | 안정적 트래픽 시. 비용 최적화 |
| PITR | 35일 이내 초 단위 복구. 새 테이블로만 복구 |

> 💡 **CAP 정리로 보는 5주차 서비스 선택** — 데이터베이스 선택은 CAP 정리(Brewer, 2000)의 실제 적용이다. RDS Multi-AZ는 같은 리전 내에서 CP(Consistency + Partition Tolerance)를 선택한다. DynamoDB 결과적 일관성은 AP(Availability + Partition Tolerance)를 선택한다. Aurora Global Database의 Primary 리전은 CP, Secondary 리전은 eventual consistency로 AP에 가깝다. MemoryDB for Redis는 내구성 보장(Multi-AZ WAL)으로 C를 강하게 보장한다. 비즈니스 요구에 따라 어떤 트레이드오프를 선택할지가 아키텍처 결정의 핵심이다. "항상 CA"를 만족하는 분산 시스템은 CAP 정리에 의해 불가능하다.

### 캐시 선택 — 4가지 도구의 포지셔닝

ElastiCache Redis, Memcached, DAX, MemoryDB가 각각 다른 문제를 푼다.

| 도구 | 적합한 시나리오 | 핵심 구별 키워드 |
|------|---------------|----------------|
| ElastiCache Redis | 세션, 리더보드, Pub/Sub, 범용 캐시 | 풍부한 자료구조, Multi-AZ HA |
| ElastiCache Memcached | 단순 String 캐시, 멀티스레드 CPU 효율 | 단순, HA 불필요 |
| DAX | DynamoDB 읽기 마이크로초 가속 | DynamoDB 전용, SDK만 변경 |
| MemoryDB for Redis | 손실 없는 영속성 + Redis API | 내구성, 메인 DB로 Redis |

## 헷갈리기 쉬운 비교 — 완전 정리

시험에서 가장 자주 혼동되는 쌍들을 한번에 정리한다.

**Multi-AZ vs Read Replica**:
- HA가 목적이면 Multi-AZ. 자동 페일오버, 동기 복제, Standby는 읽기 안 받음.
- 읽기 확장이 목적이면 Read Replica. 비동기 복제, 별도 엔드포인트, 수동 Promote.
- 시나리오에서 "가용성", "장애 자동 복구", "다운타임 최소화"가 보이면 Multi-AZ. "읽기 부하", "성능 향상", "지역별 읽기"가 보이면 Read Replica.

**Aurora vs RDS**:
- "15개 Replica", "30초 페일오버", "리전 간 <1초 복제", "변동 트래픽 자동 스케일" → Aurora
- "Oracle/SQL Server/MariaDB 엔진 필요", "비용 절감 최우선", "안정적 워크로드" → 일반 RDS

**GSI vs LSI**:
- 테이블 생성 후 추가 가능하고 완전히 다른 PK → GSI (결과적 일관성만)
- 같은 PK 유지하고 강한 일관성이 필요하고 테이블 생성 시 추가 → LSI

**DAX vs ElastiCache**:
- DynamoDB 전용이고 SDK 변경만 필요 → DAX
- 다양한 소스(RDS, Aurora, API 결과)를 캐싱하거나 세션/Pub/Sub → ElastiCache Redis

**MemoryDB vs ElastiCache Redis**:
- 장애 시 데이터 손실이 절대 허용 안 됨 → MemoryDB
- 손실 허용 가능하고 캐시로 사용 → ElastiCache Redis

**Aurora Global Database vs RDS Cross-Region Read Replica**:
- < 1초 복제 지연, 스토리지 레이어 복제, 1분 이내 페일오버 → Aurora Global DB
- 범용 엔진(MySQL, PG, Oracle 등), 수 초 지연 허용 → RDS Cross-Region RR

**DynamoDB Global Tables vs Aurora Global DB**:
- 모든 리전에서 쓰기 필요(액티브-액티브), NoSQL → DynamoDB Global Tables
- 관계형 + 쓰기는 Primary 리전만, 읽기 분산 → Aurora Global DB

> 📚 **Capital One 보안 사고와 DB 아키텍처 교훈** — 2019년 Capital One 데이터 유출 사건(1억 600만 명 개인정보 노출)은 데이터베이스 설계보다 IAM과 EC2 메타데이터 서비스 보안 문제였다. 그러나 이 사건은 RDS 암호화, KMS 키 관리, VPC 내 프라이빗 서브넷 배치, 최소 권한 원칙이 얼마나 중요한지를 상기시켰다. RDS를 퍼블릭 서브넷에 두거나, 과도한 IAM 권한을 부여하거나, 암호화를 비활성화하는 것은 실제 사고의 원인이 됐다. SAA-C03 시험에서도 "DB는 프라이빗 서브넷에, 암호화 활성화, 최소 권한 IAM"이 항상 올바른 보안 답안이다.

## 통합 아키텍처 — 실제로는 이렇게 쓴다

현실에서는 이 서비스들이 단독으로 쓰이지 않고 레이어를 이루어 함께 작동한다.

```
[ 이커머스 플랫폼의 다층 데이터 아키텍처 ]

Mobile/Web
     │
     ▼
CloudFront (엣지 캐시 — 정적 콘텐츠, API 응답 일부)
     │
     ▼
API Gateway (HTTP API) → Lambda
                              │
     ┌────────────────────────┤
     │                        │
     ▼                        ▼
DAX → DynamoDB          ElastiCache Redis
(주문/재고 이벤트)       (세션/실시간 재고)
     │                        │
     │ Streams                │ Cache-Aside
     ▼                        │
Lambda → OpenSearch      RDS Proxy
(검색 인덱싱)                 │
                             ▼
                      Aurora Multi-AZ
                      (사용자/상품 관계형 데이터)
                             │ Global DB (<1s 복제)
                             ▼
                      Aurora Secondary (us-east-1)
                      (해외 사용자 읽기 분산)

[ 분석 파이프라인 ]
Aurora → DMS → Redshift (야간 OLAP 분석)
DDB → S3 Export → Athena (서버리스 쿼리)
CloudWatch Logs → Firehose → OpenSearch (실시간 로그 분석)
```

이 아키텍처에서 각 서비스의 역할:
- **CloudFront**: 정적 콘텐츠, API 응답 일부 캐시
- **ElastiCache Redis**: 로그인 세션, 실시간 재고 수량 캐시 (자주 읽히고 가끔 변함)
- **DynamoDB + DAX**: 주문 이력, 클릭 이벤트 (Write-heavy, 스키마 유연, 마이크로초 읽기)
- **DynamoDB Streams → Lambda → OpenSearch**: 주문 삽입 시 검색 인덱스 자동 업데이트
- **Aurora**: 사용자 계정, 상품 카탈로그, 관계형 데이터
- **OpenSearch**: 상품 검색, 로그 분석, Dashboards 시각화
- **Redshift**: 야간 배치 OLAP 분석, BI 대시보드

> 🔍 **데이터 액세스 패턴 분석이 먼저다** — 아키텍처를 설계하기 전에 반드시 답해야 할 질문들: (1) 읽기와 쓰기의 비율은? (2) 트래픽 패턴이 예측 가능한가? (3) 응답 지연 요구사항은? (4) 데이터 모델이 관계형인가 Key-Value인가? (5) 글로벌 사용자가 있는가? (6) 데이터 손실 허용 수준(RPO)은? (7) 다운타임 허용 수준(RTO)은? 이 7가지 질문에 답하면 서비스 선택이 거의 자동으로 결정된다. SAA-C03 시험 문제도 이 7가지 차원 중 하나 이상을 강조해서 정답을 유도한다.

## 비용 최적화 관점의 선택

SAA-C03는 비용 최적화 Pillar(20%)도 다룬다. 데이터베이스 선택에서 비용 관점:

**RDS vs Aurora**: Aurora가 약 20% 비싸다. "같은 MySQL/PostgreSQL 워크로드에서 Aurora가 정당화되는 시나리오"는 페일오버 요구사항이 30초 이내, 15개 이상 Reader 필요, 글로벌 복제 필요, 변동 트래픽일 때다.

**On-Demand vs Provisioned**: DynamoDB On-Demand는 안정적 트래픽에서 Provisioned보다 최대 4배 비싸다. 트래픽 예측이 가능한 워크로드는 Provisioned + Auto Scaling이 비용 효율적이다.

**ElastiCache 캐시**: 캐시 히트율이 90% 이상이면 캐시로 인해 DB 인스턴스 크기를 줄일 수 있어서 전체 비용이 내려간다. TTL을 너무 짧게 설정하면 히트율이 떨어진다.

**Aurora I/O-Optimized**: I/O 비용이 전체의 25% 이상이면 I/O-Optimized 요금제가 유리하다. 정액 I/O 비용으로 전환된다.

**ElastiCache Reserved Nodes**: 1년 또는 3년 예약으로 온디맨드 대비 최대 55% 절감. 안정적 캐시 워크로드라면 Reserved가 유리하다.

> ⚠️ **인스턴스 업사이징이 마지막 수단인 이유** — "더 큰 인스턴스로 업그레이드"가 항상 옳지 않다. 읽기 부하는 Read Replica가, 연결 수 문제는 RDS Proxy가, 반복 읽기는 ElastiCache가, DynamoDB 읽기는 DAX가 더 비용 효율적으로 해결한다. 인스턴스 업사이징은 마지막 수단이다. 시험에서 "인스턴스 크기를 늘린다"는 선택지가 나오면, 그보다 더 정확한 솔루션(Proxy, Read Replica, Cache)이 있는지 먼저 확인한다.

## DR 관점의 서비스 비교

재해 복구(DR)에서 5주차 서비스들이 어떻게 역할을 하는지 정리한다.

| 서비스 | RPO | RTO | 메커니즘 |
|--------|-----|-----|---------|
| RDS Multi-AZ | ~0 (동기) | 60-120초 | 자동 DNS Failover |
| Aurora Multi-AZ | ~0 (공유 스토리지) | 30초 이내 | Reader → Writer 승격 |
| Aurora Global DB | < 1초 | < 1분 | 수동/자동 Promote |
| DynamoDB (단일 리전) | ~0 (PITR) | ~수분 | 새 테이블 복구 |
| DynamoDB Global Tables | ~1초 | ~0 (다른 리전 이미 서빙) | 엔드포인트 전환 |
| ElastiCache Redis Multi-AZ | 수 초 (비동기) | 수 초 (자동 Failover) | Read Replica 승격 |
| MemoryDB for Redis | ~0 (WAL 동기) | 수 초 | 자동 복구 |

---

## 📝 시나리오 연습 문제

**문제 1.** 스타트업이 신규 소셜 미디어 앱을 출시한다. 트래픽이 하루 100 RPS였다가 바이럴로 갑자기 50,000 RPS로 폭증했다. DB는 PostgreSQL을 사용 중이다. 서비스 중단 없이 이 트래픽을 처리하려면?

A) RDS PostgreSQL Multi-AZ로 전환 (고가용성 확보)
B) Aurora PostgreSQL Serverless v2 (자동 스케일링)
C) RDS PostgreSQL Read Replica 5개 추가 (읽기 분산)
D) DynamoDB On-Demand로 마이그레이션 (자동 용량)

**정답: B**

해설: 트래픽 폭증에 자동으로 대응하려면 컴퓨팅 용량이 자동으로 스케일링되어야 한다. Aurora Serverless v2는 수 초 단위로 0.5~256 ACU까지 자동 스케일링하며 PostgreSQL 호환이라 마이그레이션이 쉽다. A는 HA는 해결하지만 용량 부족 문제를 해결하지 못한다. C는 읽기는 분산하지만 쓰기 용량을 늘리지 못하고, 5개 Replica를 사전에 만들어야 해서 갑작스러운 폭증에 대응이 느리다. D는 마이그레이션 기간이 필요하고 즉각 적용 불가.

---

**문제 2.** 온라인 뱅킹 시스템에서 계좌 거래 기록을 저장한다. 모든 거래는 감사(Audit) 목적으로 변경 불가능하게 기록되어야 하고, 과거 임의 시점의 잔액을 계산하는 쿼리가 필요하다. 가장 적합한 서비스는?

A) DynamoDB (PITR로 과거 상태 복구)
B) RDS Aurora (트랜잭션 보장)
C) Amazon QLDB (Ledger DB, 불변 거래 원장)
D) S3 + Glacier (저렴한 장기 보관)

**정답: C**

해설: QLDB는 변경 불가능한(Immutable) 원장 DB로, 모든 데이터 변경이 암호학적으로 검증 가능한 해시 체인으로 기록된다. "감사 목적 변경 불가" + "과거 잔액 계산(임의 시점 조회)"이 QLDB의 핵심 기능이다. A는 DynamoDB PITR로 과거 상태를 볼 수는 있지만 변경 불가능성이 보장되지 않는다. B는 관계형 트랜잭션은 지원하지만 불변 원장 기능은 없다. D는 객체 스토리지로 DB 기능이 없다.

---

**문제 3.** 게임 리더보드 시스템을 구축한다. 수백만 명의 점수를 실시간으로 저장하고, "상위 100명 조회", "특정 사용자의 순위 조회"를 수십 ms 이내로 처리해야 한다. 가장 적합한 서비스는?

A) DynamoDB + GSI (점수 기준 정렬)
B) RDS MySQL (ORDER BY score 쿼리)
C) ElastiCache Redis Sorted Set (ZSet)
D) OpenSearch (집계 쿼리)

**정답: C**

해설: Redis Sorted Set(ZSet)은 리더보드를 위해 태어난 자료구조다. ZADD로 점수와 함께 멤버를 추가하고, ZREVRANGE로 상위 N명을, ZRANK로 특정 멤버의 순위를 O(log N)으로 조회한다. 점수 변경 시 자동으로 정렬 순서가 업데이트된다. 수백만 명의 데이터도 인메모리에서 수십 μs로 처리된다. A는 GSI로 점수 기준 쿼리는 가능하지만 ms 단위이고 실시간 순위 업데이트 시 GSI 비동기 복제 지연이 있다. B는 대규모 정렬 쿼리는 DB 부하가 크다. D는 집계는 가능하지만 실시간 순위 업데이트가 자연스럽지 않다.

---

**문제 4.** Aurora MySQL 클러스터에서 분석 쿼리 팀이 OLAP 쿼리를 자주 실행해서 OLTP 워크로드에 영향을 준다. 최소한의 추가 비용으로 이 문제를 해결하려면?

A) 별도 분석용 Aurora 클러스터를 만든다 (비용 2배)
B) Custom Endpoint를 만들어서 분석용 Reader 인스턴스를 지정하고, 분석 팀은 Custom Endpoint를 사용한다
C) Aurora Global Database Secondary 리전에서 분석 쿼리를 실행한다
D) RDS Proxy를 통해 분석 쿼리와 OLTP 쿼리를 라우팅한다

**정답: B**

해설: Custom Endpoint는 특정 Reader 인스턴스들을 별도 엔드포인트로 묶는 기능이다. 분석 팀이 Custom Endpoint를 사용하면 OLTP Reader와 분리되어 서로 영향을 주지 않는다. 이미 있는 Reader 인스턴스를 재사용하므로 추가 비용이 가장 작다. 분석 부하가 매우 크면 분석용 Reader 인스턴스를 더 크게(r5.8xlarge 등) 만들 수 있다. A는 비용이 두 배가 된다. C는 Secondary 리전은 완전히 독립적이지 않고 복제 지연이 있다. D는 RDS Proxy가 이런 방식의 쿼리 라우팅을 지원하지 않는다.

---

**문제 5.** 회사가 DynamoDB 테이블의 RCU를 매우 많이 소모한다. 조회 패턴을 분석해보니 전체 읽기의 80%가 동일한 100개 항목에 집중되어 있다. 가장 비용 효율적인 해결책은?

A) DynamoDB On-Demand 모드로 전환
B) DynamoDB Provisioned RCU를 2배로 늘린다
C) DAX 클러스터를 추가해서 Hot Item을 캐싱한다
D) GSI를 추가해서 읽기를 분산한다

**정답: C**

해설: 80%의 읽기가 100개 항목에 집중되는 것은 Hot Item 패턴이다. DAX는 이 100개 항목을 인메모리에 캐싱해서 반복 읽기를 DynamoDB가 아닌 DAX에서 처리한다. 결과적으로 DynamoDB에 도달하는 RCU 소모가 크게 줄어든다. A는 On-Demand는 요청당 과금이라 오히려 더 비쌀 수 있다. B는 RCU를 늘려도 낭비가 줄지 않는다. D는 GSI는 다른 파티션 키로 접근하는 도구이지 Hot Item 문제 해결책이 아니다.

---

**문제 6.** Multi-AZ RDS MySQL에서 정기 유지보수(OS/엔진 패치)가 예정되어 있다. 이 작업이 실행되는 동안 다운타임을 최소화하려면?

A) 유지보수 윈도우를 최대한 긴 밤 시간으로 설정한다
B) Multi-AZ를 활성화하면 Standby에서 먼저 패치하고 페일오버 후 구 Primary를 패치하므로 다운타임이 최소화된다 (보통 60초 이내)
C) Read Replica를 만들어서 패치 중 트래픽을 이동시킨다
D) 스냅샷에서 새 인스턴스를 만들고 그것을 패치한다

**정답: B**

해설: Multi-AZ RDS의 유지보수는 먼저 Standby 인스턴스를 업데이트하고, 완료되면 페일오버를 통해 Standby를 새 Primary로 전환한다. 그 다음 구 Primary(이제 Standby)를 업데이트한다. 이 과정에서 실제 서비스 중단은 페일오버 시간(보통 60초 미만)뿐이다. 이것이 Multi-AZ가 운영 유지보수 중 HA를 제공하는 방식이다. C는 Read Replica는 쓰기 트래픽을 받지 못하므로 완전한 대체가 되지 않는다. D는 추가 비용과 엔드포인트 전환 작업이 필요하다.

---

**문제 7.** 메시지 피드 앱에서 각 사용자가 자신을 팔로우하는 사람들의 최신 메시지를 볼 수 있어야 한다. 메시지는 시간순이고, "특정 사용자의 피드에서 최근 50개 메시지"를 빠르게 가져와야 한다. DynamoDB를 사용할 경우 테이블 설계는?

A) PK: messageId, SK 없음 — 단순 메시지 저장
B) PK: feedUserId, SK: timestamp — 피드 사용자를 파티션으로, 시간을 정렬 키로 Composite Key
C) PK: senderId — 발신자별 파티션
D) PK: timestamp — 시간순 전체 메시지

**정답: B**

해설: DynamoDB의 복합 기본 키(PK + SK)를 활용하면 "특정 피드 사용자의 최신 메시지"를 단일 쿼리로 효율적으로 가져올 수 있다. feedUserId가 파티션 키이므로 해당 사용자의 피드 전체가 같은 파티션에 있고, timestamp가 정렬 키이므로 "최근 50개"를 DESC 정렬로 즉시 가져올 수 있다. A는 피드별 조회에 Scan이 필요하다. C는 발신자별 파티션이면 팔로워 피드를 만들기 위해 여러 파티션을 조합해야 한다. D는 timestamp를 PK로 하면 동시에 발생하는 모든 메시지가 같은 파티션으로 몰린다 (Hot Partition).

---

**문제 8.** 기존에 RDS PostgreSQL을 사용하는 애플리케이션에서 DBA가 없어서 앞으로 OS 패치, DB 패치, 백업, Multi-AZ 설정을 모두 자동화하고 싶다. 기존 PostgreSQL 호환성을 유지하면서 가장 많은 운영 부담을 줄이는 옵션은?

A) EC2에 PostgreSQL 직접 설치 후 cron으로 백업 자동화
B) RDS PostgreSQL (Multi-AZ 활성화, 자동 백업 설정)
C) Aurora PostgreSQL (공유 스토리지, 15개 Reader, 30초 페일오버, 자동 백업)
D) ECS Fargate에 PostgreSQL 컨테이너 실행

**정답: C**

해설: Aurora PostgreSQL은 RDS PostgreSQL보다 더 많은 운영 부담을 AWS가 담당한다. 스토리지 관리(자동 확장, 6 카피 관리), 더 빠른 페일오버(30초 vs 60-120초), 더 많은 Reader 지원, Fast Clone이 추가된다. RDS PostgreSQL(B)도 관리형이지만 Aurora가 더 높은 가용성과 스케일링 능력을 제공한다. A와 D는 운영 부담이 가장 크다.

---

**문제 9.** 배달 앱에서 각 라이더의 현재 위치를 저장하고, "반경 5km 내 가용 라이더 조회"를 실시간으로 처리해야 한다. 가장 적합한 서비스는?

A) DynamoDB (지리 좌표 속성으로 저장)
B) RDS PostgreSQL + PostGIS 확장 (공간 쿼리)
C) ElastiCache Redis Geospatial Index
D) OpenSearch Geo Distance Query

**정답: C**

해설: ElastiCache Redis는 Geospatial Index(GEOADD/GEORADIUS/GEOSEARCH 명령어)를 지원한다. 라이더 위치를 GEOADD로 추가하고 GEORADIUS로 반경 내 라이더를 인메모리에서 마이크로초로 조회한다. 라이더 위치는 초마다 업데이트되는 휘발성 데이터이므로 영속성보다 속도가 중요하다. B는 가능하지만 RDS로는 실시간 수백만 개의 위치 업데이트와 조회를 처리하기 힘들다. D도 가능하지만 ElastiCache Redis처럼 실시간 인메모리 처리에 최적화되지 않았다.

---

**문제 10.** Lambda 기반 마이크로서비스가 Aurora MySQL을 사용한다. 피크 트래픽에서 Lambda 동시성이 500에 달하고 Aurora가 "max_connections" 오류를 내보내기 시작했다. 가장 적합한 해결책은?

A) Aurora 인스턴스를 더 큰 클래스로 업그레이드 (max_connections 증가)
B) Lambda의 예약 동시성을 100으로 제한 (연결 수 강제 감소)
C) RDS Proxy를 Aurora와 Lambda 사이에 추가 (연결 풀링)
D) Aurora Serverless v2로 전환 (자동 스케일링)

**정답: C**

해설: RDS Proxy는 이 상황의 정확한 해결책이다. Lambda 500개가 각각 직접 Aurora에 연결하는 대신, 모두 Proxy에 연결하고 Proxy가 Aurora에는 소수의 연결을 유지한다. 연결 재사용으로 Aurora의 max_connections 제한 안에서 500개의 Lambda 요청을 처리할 수 있다. A는 max_connections가 늘어나도 한계가 있고, 더 큰 인스턴스로 인한 비용 증가가 크다. B는 Lambda 처리량을 인위적으로 제한해서 비즈니스 요구를 만족하지 못할 수 있다. D는 Serverless v2는 컴퓨팅 용량 스케일링이지 연결 수 제한을 해결하지 않는다.

---

**문제 11.** 회사가 IoT 기기 100만 대의 온도, 압력, 습도 데이터를 초당 수집한다. 각 기기는 초당 1건씩 데이터를 보낸다. 이 데이터를 효율적으로 저장하고, "특정 기기의 지난 24시간 온도 추이"를 빠르게 조회하려면?

A) DynamoDB (PK: deviceId, SK: timestamp)
B) Amazon Timestream (시계열 특화 DB)
C) RDS PostgreSQL (timestamp 컬럼 인덱스)
D) S3 + Athena (파케이 형식 저장)

**정답: B**

해설: IoT 시계열 데이터는 Amazon Timestream의 핵심 사용 사례다. Timestream은 시계열 데이터를 위해 최적화된 스토리지와 쿼리 엔진을 가지고 있어서 일반 DB보다 훨씬 빠르게 시간 범위 쿼리를 처리한다. 초당 100만 건의 쓰기도 자동 스케일링으로 처리하고, 오래된 데이터는 자동으로 저렴한 스토리지 계층으로 이동한다. A도 가능하지만 초당 100만 건의 쓰기를 처리하려면 WCU가 매우 높아야 하고, 시계열 분석 쿼리에 최적화되지 않았다. C는 이 규모의 시계열 처리에 부적합하다. D는 실시간 조회가 느리다.

---

**문제 12.** 전 세계 150개국 사용자가 접근하는 SaaS 플랫폼에서 사용자 설정 데이터를 저장한다. 각 리전에서 쓰기와 읽기가 동시에 발생하고, 설정 충돌 시 "마지막 쓰기 우선" 정책이 허용된다. 가장 적합한 서비스는?

A) Aurora PostgreSQL Global Database (Primary에서만 쓰기)
B) RDS PostgreSQL Cross-Region Read Replica (각 리전 읽기)
C) DynamoDB Global Tables (멀티 리전 액티브-액티브, LWW)
D) ElastiCache Redis + Lambda (자체 복제 구현)

**정답: C**

해설: "각 리전에서 쓰기와 읽기가 동시에"는 멀티 리전 액티브-액티브를 필요로 한다. DynamoDB Global Tables는 여러 리전에서 동시에 쓰기를 받으면서 ~1초 내에 다른 리전으로 복제한다. "마지막 쓰기 우선(LWW)" 충돌 해결도 DynamoDB Global Tables의 기본 정책과 정확히 일치한다. A는 Primary에서만 쓰기 가능해서 지리적으로 분산된 쓰기에 부적합하다. B는 읽기 전용 Replica이므로 각 리전에서 쓰기가 불가능하다. D는 직접 구현의 복잡성과 신뢰성 문제가 있다.

---
