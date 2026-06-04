# Day 1 - Multi-AZ 고가용성: 복제의 일관성·쿼럼·페일오버를 떠받치는 분산 원리

데이터베이스 가용성을 진지하게 들여다보면 결국 같은 질문 하나로 돌아온다. "방금 커밋한 데이터를, 서버 한 대가 죽어도 잃지 않으려면 누군가는 그 데이터의 사본(copy)을 들고 있어야 한다. 그 사본을 언제, 얼마나 많이, 어디에 둘 것인가." 이 질문에 대한 답이 갈라지는 지점이 바로 동기 복제냐 비동기 복제냐, 단일 AZ냐 다중 AZ냐, 2-copy냐 6-copy 쿼럼이냐다. AWS의 RDS Multi-AZ, Aurora, ElastiCache는 겉보기엔 그냥 "체크박스 하나로 켜는 고가용성 옵션"처럼 보이지만, 그 밑에는 1970년대부터 쌓여 온 분산 시스템 이론 — 복제, 합의(consensus), 쿼럼, CAP — 이 그대로 깔려 있다. 오늘은 이 체크박스들이 어떤 트레이드오프를 내부에서 결정하고 있는지, 왜 Aurora가 전통적 복제와 근본적으로 다른 스토리지 설계를 택했는지, 페일오버 시간(RTO)이 어디서 결정되는지를 판다.

DOP 시험에서 Multi-AZ는 "운영 우수성·복원력"의 토대로, "이 DB의 RTO를 60초에서 30초로 줄이려면", "읽기 부하를 분산하면서 동시에 HA를 보장하려면", "페일오버 시 애플리케이션 커넥션이 끊기지 않게 하려면" 같은 시나리오로 반복 등장한다. 각 선택지가 동기/비동기·쿼럼·엔드포인트 중 무엇을 건드리는지 읽어내면 답이 보인다.

## 복제는 왜 어려운가 — 동기와 비동기 사이의 근본 긴장

복제(replication)의 본질은 단순하다. 같은 데이터를 여러 곳에 둔다. 그런데 "쓰기가 완료됐다"고 클라이언트에게 응답하는 시점을 언제로 잡느냐에서 모든 게 갈린다. **동기 복제(synchronous replication)**는 모든(또는 정족수) 복제본이 데이터를 받아 디스크에 쓴 것을 확인한 뒤에야 커밋을 응답한다. **비동기 복제(asynchronous replication)**는 주(primary) 노드가 자기 디스크에만 쓰고 바로 응답한 뒤, 백그라운드로 복제본에 전파한다.

이 차이가 만드는 결과가 곧 RPO(복구 시점 목표, 얼마나 많은 데이터를 잃을 수 있는가)다. 동기 복제는 RPO=0을 지향한다 — 주 노드가 죽어도 대기(standby) 노드에 같은 데이터가 이미 있다. 대신 모든 커밋이 네트워크 왕복 한 번을 더 기다리므로 쓰기 지연이 늘어난다. 비동기 복제는 쓰기가 빠르지만, 주 노드가 죽는 순간 아직 전파되지 않은 트랜잭션은 영원히 사라진다(RPO > 0).

> 💡 **관련 이론**: 이 긴장은 분산 시스템의 **CAP 정리**(Eric Brewer, 2000 PODC 기조연설, Gilbert & Lynch가 2002년 형식 증명)와 그 정제판인 **PACELC**(Daniel Abadi, 2012)로 정리된다. CAP은 "네트워크 분단(Partition) 시 일관성(Consistency)과 가용성(Availability) 중 하나를 포기해야 한다"고 말한다. PACELC는 여기에 한 줄을 더 붙인다 — "분단이 없을 때에도(Else), 지연(Latency)과 일관성(Consistency) 사이에서 골라야 한다." RDS Multi-AZ의 동기 복제는 PACELC로 치면 PC/EC(일관성 우선, 지연 감수), DynamoDB Global Tables의 비동기는 PA/EL(가용성·지연 우선, 일관성 양보)이다. "체크박스 하나"가 사실은 이 근본 좌표 위에서 위치를 고르는 행위다.

> 🔍 **더 깊이**: RDS Multi-AZ의 "동기 복제"는 정확히는 **물리적·블록 레벨(block-level) 복제**다. MySQL의 논리적 복제(binlog 기반, SQL 문/행 단위)가 아니라, 스토리지 엔진 아래의 디스크 블록을 그대로 미러링한다(DRBD — Distributed Replicated Block Device와 유사한 발상). 그래서 Standby는 Primary와 바이트 단위로 동일하며, 이것이 Standby에서 일반 읽기를 막는 이유 중 하나다 — Standby는 "읽을 수 있는 복제본"이 아니라 "그림자처럼 동일한 디스크"라서, 별도 쿼리 처리 엔진으로 동작하지 않는다. 반면 Read Replica는 binlog/WAL 기반 **논리적 비동기 복제**라 자기만의 쿼리 엔진을 돌려 읽기를 받을 수 있다. 이 물리/논리 복제의 구분이 "왜 Multi-AZ Standby로는 read를 못 하는데 Read Replica로는 되는가"의 진짜 답이다.

## RDS Multi-AZ — 동기 미러와 자동 페일오버

전통적 RDS Multi-AZ는 한 Primary와 한 Standby를 서로 다른 AZ에 둔다. 모든 쓰기는 Primary에서 일어나고 동기로 Standby에 미러된다. Standby는 평상시 트래픽을 받지 않고 대기만 한다 — 읽기도, 쓰기도 받지 않는다. 백업 스냅샷과 OS 패치는 Standby에서 수행해 Primary의 I/O 부담을 피한다.

페일오버는 RDS가 자동으로 감지·실행한다. Primary 장애, AZ 장애, 인스턴스 타입 변경, OS 패치 등이 트리거다. 핵심은 **엔드포인트(DNS 이름)가 그대로 유지**된다는 점이다 — RDS는 페일오버 시 그 DNS 레코드가 가리키는 IP를 새 Primary(승격된 구 Standby)로 바꾼다. 클라이언트는 같은 호스트명에 재연결하면 된다. 이 과정이 보통 60~120초 걸린다.

> ⚠️ **함정**: 페일오버가 빨라도, **클라이언트의 DNS 캐시 TTL**이 길면 복구가 체감상 느려진다. 애플리케이션이나 JVM이 DNS 결과를 오래 캐시하면(악명 높은 자바의 `networkaddress.cache.ttl=-1` 무한 캐시), 엔드포인트 IP가 바뀌어도 클라이언트는 죽은 옛 IP로 계속 붙으려 한다. 그래서 RDS 엔드포인트는 짧은 TTL로 운영되고, 애플리케이션 측 DNS 캐시도 짧게 잡아야 한다. 시험에서 "페일오버는 완료됐는데 앱이 계속 옛 노드로 붙는다"의 답은 거의 항상 "DNS 캐시 TTL" 또는 "커넥션 풀이 죽은 커넥션을 재사용"이다.

## RDS Multi-AZ DB Cluster — 2-copy를 3-copy 준동기로

2022년 AWS는 **Multi-AZ DB Cluster**라는 변종을 내놨다. 구조가 다르다 — 1 Writer + 2 Readable Standby를 3개 AZ에 둔다. 두 Standby는 **읽기를 받을 수 있고**, 복제는 **준동기(semi-synchronous)**다. 준동기란 "두 Standby 중 적어도 하나가 트랜잭션을 받았다고 확인하면 커밋"하는 방식이다. 둘 다 기다리는 완전 동기보다 빠르고, 아무도 안 기다리는 비동기보다 안전한 중간 지점이다.

이 설계의 보상은 페일오버 속도다 — 전통적 Multi-AZ의 60~120초 대비 **35초 이내**로 줄어든다. 이미 떠 있는 Readable Standby가 승격 후보로 대기 중이라 부팅 시간이 없기 때문이다.

> 💡 **관련 이론**: 준동기 복제에서 "둘 중 하나만 확인하면 커밋"은 **쿼럼(quorum)** 사상의 단순한 형태다. 분산 시스템에서 쿼럼은 "전체가 아니라 정족수만 동의하면 진행"하는 기법으로, 가용성과 일관성을 동시에 잡는 핵심 도구다. 쓰기 정족수(W)와 읽기 정족수(R)가 전체 복제본 수(N)에 대해 `W + R > N`을 만족하면, 어떤 읽기든 최신 쓰기를 본 복제본을 적어도 하나 포함하게 되어 강한 일관성이 보장된다(Dynamo 논문, 2007). 준동기 Multi-AZ DB Cluster는 이 발상을 RDS 관리형으로 단순화한 것이고, 진짜 쿼럼 스토리지를 본격 도입한 것이 바로 다음에 볼 Aurora다.

## Aurora — 복제를 스토리지 계층으로 밀어 넣다

Aurora는 RDS와 같은 회사 제품이지만 철학이 정반대다. 전통적 DB는 "컴퓨트 노드가 복제를 책임진다" — Primary가 Standby에 데이터를 보낸다. Aurora는 이 발상을 뒤집었다. **복제를 컴퓨트에서 떼어 스토리지 계층으로 내렸다.** Aurora의 컴퓨트 노드(Writer/Reader)는 로컬 디스크가 없다. 대신 모두가 하나의 공유 **클러스터 볼륨(cluster volume)**을 바라보고, 이 볼륨이 데이터를 6개 복사본으로 3개 AZ에 분산 저장한다.

```
Aurora Cluster
   ├─ Writer Node (1)              ← 쓰기 전담
   ├─ Reader Nodes (0-15)          ← 읽기 분산, Writer와 같은 볼륨 공유
   └─ Cluster Volume (공유 스토리지)
        6 copies / 3 AZ (AZ당 2 copy)
        4/6 write quorum, 3/6 read quorum
```

여기서 핵심은 쿼럼 숫자다. 쓰기는 6개 중 **4개**가 확인하면 성공(4/6 write quorum), 읽기는 **3개**면 충분(3/6 read quorum)이다. `W(4) + R(3) = 7 > N(6)`이므로 쿼럼 교집합이 보장된다 — 어떤 읽기든 최신 쓰기를 포함한다.

이 6/3/2 구성이 왜 이렇게 설계됐는지가 Aurora 논문(Verbitski et al., SIGMOD 2017 *"Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"*)의 핵심이다. AZ 하나가 통째로 죽어도(2 copy 손실) 남은 4 copy로 쓰기가 가능하고(4/6 충족), AZ 하나가 죽은 상태에서 추가로 한 copy가 더 죽어도(총 3 copy 손실) 읽기는 가능하다(3/6 충족). 즉 **"AZ+1" 장애 모델** — AZ 전체 장애와 추가 디스크 장애가 겹쳐도 데이터를 잃지 않는다.

> 🔍 **더 깊이**: 전통적 DB 복제가 느린 이유는 **풀 페이지(full page) 쓰기**를 네트워크로 보내기 때문이다. MySQL은 더블라이트 버퍼, binlog, redo log, 데이터 페이지를 모두 디스크와 복제본에 써야 한다(쓰기 증폭, write amplification). Aurora의 혁신은 "**로그가 곧 데이터베이스다(the log is the database)**"라는 통찰이다 — Writer는 변경된 데이터 페이지 전체가 아니라 **redo 로그 레코드만** 스토리지로 보낸다. 무거운 페이지 재구성(materialization)은 스토리지 노드가 백그라운드에서 비동기로 한다. 네트워크로 흐르는 데이터량이 한 자릿수 배 줄어, 같은 하드웨어에서 전통적 MySQL 대비 몇 배의 처리량을 낸다. 이것이 "Aurora는 MySQL/PostgreSQL 호환인데 왜 더 빠른가"의 진짜 답이다 — 쿼리 엔진은 같지만 스토리지·복제 계층을 완전히 새로 썼다.

> 📚 **사례**: Netflix는 2008년 단일 데이터센터의 DB 스토리지 손상으로 사흘간 DVD 배송이 마비된 사고를 겪었고, 이를 계기로 "단일 장애점을 없애고 클라우드의 분산 스토리지로 간다"는 전사 전략을 세웠다(이후 Chaos Monkey 탄생의 배경이기도 하다). Aurora의 6-copy/3-AZ 설계는 정확히 이 교훈 — "스토리지는 언제든 일부가 죽는다고 가정하고, 정족수로 살아남게 설계하라" — 을 관리형 서비스로 제품화한 것이다. 교훈: 가용성은 "장애가 안 나게 막는 것"이 아니라 "장애가 나도 정족수로 굴러가게 설계하는 것"이다.

## Aurora의 페일오버와 부가 기능

Aurora의 Writer가 죽으면, 이미 떠 있는 Reader 중 하나가 승격 우선순위(tier)에 따라 Writer로 바뀐다. 스토리지가 공유라 데이터 복사가 필요 없으므로 **30초 이내** 페일오버가 가능하다(Reader가 없으면 새로 띄워야 해 더 걸린다). **Reader endpoint**는 모든 Reader에 걸친 로드 밸런싱 진입점이고, **Writer endpoint**는 항상 현재 Writer를 가리킨다.

| 부가 기능 | 핵심 | 비고 |
|-----------|------|------|
| **Backtrack** (MySQL) | 클러스터를 특정 시점으로 되감기 | S3 백업 없이, 최대 72시간 윈도우, in-place |
| **Cluster Volume 자동 확장** | 10GB 단위로 최대 128TB까지 자동 | 사전 프로비저닝 불필요 |
| **Aurora Serverless v2** | 0.5 ACU 단위 무중단 스케일 | 트래픽 따라 자동 증감 |
| **Global Database** | 1 Primary + 최대 5 Secondary region | 비동기 <1초 lag (Day 2) |

> ⚠️ **함정**: Backtrack은 백업(스냅샷 복원)과 다르다. Backtrack은 **클러스터 자체를 제자리에서 과거로 되감는 것**(새 클러스터를 만들지 않음)이고, MySQL 호환에서만 동작하며, 활성화 시점부터의 변경만 되감을 수 있다. "실수로 DELETE를 날렸다 → 5분 전으로"는 Backtrack이 빠르지만, "삭제된 특정 테이블만 복구"나 "30일 전 상태"는 PITR(Point-In-Time Recovery, 스냅샷+로그)이 맞다. 둘을 혼동하면 시험 함정에 걸린다.

## RDS Proxy — 페일오버를 클라이언트로부터 숨기다

페일오버가 30초여도, 그 30초 동안 수백 개의 애플리케이션 커넥션이 끊기고 일제히 재연결을 시도하면 새 Primary가 커넥션 폭주로 다시 무너질 수 있다(connection storm). **RDS Proxy**는 클라이언트와 DB 사이에 커넥션 풀을 두는 관리형 프록시다. 클라이언트는 Proxy에 붙고, Proxy가 DB와의 커넥션을 풀링·재사용한다.

페일오버가 일어나도 클라이언트-Proxy 커넥션은 유지되고, Proxy가 내부적으로 새 Primary로 라우팅을 갈아탄다. 클라이언트 입장에선 끊김이 거의 없다. 추가로 IAM 인증 통합, Secrets Manager 연동, 서버리스(Lambda)의 커넥션 폭증 완화에도 쓰인다.

> 💡 **관련 이론**: RDS Proxy의 커넥션 풀링은 새로운 발상이 아니라 수십 년 된 패턴이다 — Java의 HikariCP/c3p0, PgBouncer(PostgreSQL 커넥션 풀러)가 같은 일을 한다. DB 커넥션은 메모리·프로세스(PostgreSQL은 커넥션당 프로세스)를 잡아먹는 비싼 자원이라, "매 요청마다 새 커넥션"은 안티패턴이다. 풀링은 **자원 풀(object pool) 패턴**의 한 형태로, 비싼 객체를 미리 만들어 재사용한다. Lambda처럼 수천 개의 동시 실행 환경이 각자 커넥션을 열면 DB의 `max_connections`를 순식간에 소진하는데, RDS Proxy가 이 사이에서 커넥션을 다중화(multiplexing)해 막는다. 서버리스+RDS 조합에서 RDS Proxy가 사실상 필수인 이유다.

## ElastiCache Redis — 캐시의 고가용성

ElastiCache for Redis(현 Valkey 포함)의 HA는 **replication group** 단위로 동작한다. 한 Primary와 0~5개 Replica가 한 그룹을 이루고, Primary가 죽으면 Replica 중 하나가 자동 승격된다(Multi-AZ 활성 필수).

- **Cluster Mode Disabled**: 단일 shard(1 Primary + 최대 5 Replica). 전체 데이터가 한 노드에 들어가고, Replica는 읽기 분산·HA용. 데이터셋이 한 노드 메모리에 맞을 때.
- **Cluster Mode Enabled**: 여러 shard(최대 500)에 데이터를 **파티셔닝(샤딩)**하고, 각 shard가 자기 Primary+Replica를 가진다. 데이터가 한 노드보다 클 때, 또는 쓰기를 수평 분산할 때.

> 🔍 **더 깊이**: Cluster Mode Enabled의 샤딩은 **일관된 해싱(consistent hashing)**의 사촌인 **해시 슬롯(hash slot)** 방식이다. Redis Cluster는 키 공간을 16384개의 슬롯으로 나누고(`CRC16(key) mod 16384`), 각 슬롯을 shard에 배정한다. shard를 추가/제거하면 슬롯만 재배치되므로, 전체 키를 재해싱하는 naive 모듈로 방식(`hash mod N`, N이 바뀌면 거의 모든 키 이동)의 재앙을 피한다. 일관된 해싱의 핵심 가치 — "노드 수가 바뀌어도 이동하는 키를 최소화" — 가 여기 그대로 들어 있다. ElastiCache가 슬롯 재배치를 온라인으로(무중단) 수행하는 것이 리샤딩(resharding) 기능이다.

## 페일오버 RTO 한눈에 — 무엇이 시간을 결정하는가

| 구성 | RTO | RTO를 결정하는 요인 |
|------|-----|---------------------|
| RDS Single-AZ | 수동(분~시간) | 사람이 스냅샷 복원 |
| RDS Multi-AZ | 60~120초 | Standby 승격 + DNS 전환 |
| RDS Multi-AZ DB Cluster | <35초 | 이미 떠 있는 Readable Standby 승격 |
| Aurora (단일 region) | <30초 | 공유 스토리지라 복사 불필요, Reader 승격 |
| Aurora Global (region 페일오버) | <1분 | Secondary를 standalone promote (Day 2) |
| ElastiCache Redis Multi-AZ | <60초 | Replica 승격 |
| DynamoDB | ~0 | 본질적으로 분산, 단일 노드 개념 없음 |

표를 관통하는 원리는 하나다. **"승격 후보가 이미 떠 있고, 데이터 복사가 필요 없을수록 RTO가 짧다."** Aurora가 30초로 빠른 건 스토리지가 공유라 새 Writer가 데이터를 가져올 필요가 없기 때문이고, Multi-AZ DB Cluster가 전통 Multi-AZ보다 빠른 건 Standby가 이미 읽기를 처리하며 떠 있기 때문이다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **복제는 동기/비동기 사이의 RPO-지연 트레이드오프**이고, 이는 CAP/PACELC라는 분산 시스템의 근본 좌표 위에 놓인다. 둘째, **RDS Multi-AZ는 블록 레벨 동기 미러**(Standby read 불가)이고, **Read Replica는 논리적 비동기 복제**(read 가능, 별도 endpoint)라 둘의 동작 차이는 물리/논리 복제의 차이에서 온다. 셋째, **Aurora는 복제를 스토리지로 내려 6-copy/3-AZ 쿼럼(4/6 write, 3/6 read)**과 "로그가 곧 DB" 설계로 전통 DB를 앞지른다. 넷째, **RTO는 승격 후보의 존재와 데이터 복사 여부가 결정**하며, RDS Proxy가 커넥션 풀링으로 페일오버를 클라이언트로부터 숨긴다.

다음 글에서는 이 고가용성을 **단일 리전을 넘어 다중 리전**으로 확장하는 법 — Route 53 라우팅, Aurora Global, DynamoDB Global Tables, KMS Multi-Region Key를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 전통적 RDS Multi-AZ에서 Standby 인스턴스로 직접 읽기 쿼리를 보낼 수 없는 근본 이유는?

A) Standby가 다른 리전에 있어서

B) Multi-AZ가 블록 레벨 물리 복제라 Standby는 독립 쿼리 엔진이 아니라 동일 디스크의 그림자처럼 동작하기 때문

C) AWS가 비용 때문에 의도적으로 막아서

D) Standby는 비동기 복제라 데이터가 오래돼서

**정답: B**

해설: 전통적 RDS Multi-AZ의 동기 복제는 스토리지 엔진 아래의 디스크 블록을 그대로 미러링하는 물리적·블록 레벨 복제다(DRBD 유사). Standby는 Primary와 바이트 단위로 동일한 "그림자 디스크"일 뿐 자기 쿼리 처리 엔진을 돌리지 않으므로 읽기를 받을 수 없다. 반대로 Read Replica는 binlog/WAL 기반 논리적 비동기 복제라 자기 쿼리 엔진을 가져 읽기를 처리한다 — 이 물리/논리 복제의 차이가 "왜 Multi-AZ Standby는 read 불가인데 Read Replica는 가능한가"의 답이다. 리전(A)·비용(C)·복제 지연(D)은 본질이 아니다.

---

**문제 2.** Aurora의 클러스터 볼륨은 6개 복사본을 3개 AZ에 분산하고 4/6 write 쿼럼, 3/6 read 쿼럼을 쓴다. 이 설계가 보장하는 장애 내성은?

A) 모든 AZ가 동시에 죽어도 쓰기 가능

B) AZ 하나가 통째로 죽어도(2 copy 손실) 쓰기 가능하고, 거기에 한 copy가 더 죽어도(총 3 손실) 읽기 가능한 "AZ+1" 장애 모델

C) 디스크 장애가 절대 일어나지 않음을 보장

D) 단일 copy만으로도 쓰기 가능

**정답: B**

해설: 6 copy를 3 AZ에 AZ당 2개씩 두므로, AZ 하나가 통째로 죽으면 2 copy를 잃지만 남은 4 copy로 4/6 write 쿼럼을 채워 쓰기를 계속한다. 그 상태에서 추가로 1 copy가 더 죽어 총 3 copy를 잃어도, 남은 3 copy로 3/6 read 쿼럼을 채워 읽기는 유지된다. 이를 "AZ+1" 장애 모델이라 한다. `W(4)+R(3)=7 > N(6)`이라 쿼럼 교집합이 보장돼 일관성도 유지된다. 모든 AZ 동시 사망(A)이나 단일 copy 쓰기(D)는 쿼럼 수학과 맞지 않고, 디스크 장애가 안 난다(C)는 게 아니라 나도 견디게 설계한 것이다.

---

**문제 3.** 전통적 MySQL 대비 Aurora가 같은 하드웨어에서 더 높은 쓰기 처리량을 내는 핵심 메커니즘은?

A) Aurora는 SSD 대신 더 빠른 메모리만 사용

B) Writer가 풀 데이터 페이지가 아니라 redo 로그 레코드만 스토리지로 보내고("로그가 곧 DB"), 페이지 재구성은 스토리지 노드가 비동기 처리해 네트워크 쓰기량을 크게 줄임

C) Aurora가 쿼리 엔진을 완전히 새로 작성해 SQL이 빠름

D) Aurora는 복제를 하지 않아서

**정답: B**

해설: 전통적 DB는 데이터 페이지·redo log·binlog·더블라이트 버퍼를 모두 쓰며 쓰기 증폭이 크고, 무거운 페이지를 복제본에 네트워크로 보낸다. Aurora의 통찰은 "로그가 곧 데이터베이스(the log is the database)"로, Writer는 변경된 redo 로그 레코드만 스토리지 계층으로 보내고 페이지 머티리얼라이제이션은 스토리지 노드가 백그라운드로 한다. 네트워크로 흐르는 데이터가 크게 줄어 처리량이 오른다(Aurora SIGMOD 2017 논문). 쿼리 엔진은 MySQL/PostgreSQL 그대로라 C는 틀리고(스토리지·복제 계층만 새로 씀), 복제를 안 하는 것(D)이 아니라 6-copy를 한다.

---

**문제 4.** RDS Multi-AZ 페일오버가 완료됐는데도 애플리케이션이 계속 죽은 옛 노드로 연결을 시도한다. 가장 가능성 높은 원인은?

A) 새 Primary가 다른 엔드포인트 이름을 가진다

B) 애플리케이션/JVM의 DNS 캐시 TTL이 너무 길거나 커넥션 풀이 죽은 커넥션을 재사용하고 있다

C) Multi-AZ가 작동하지 않았다

D) RDS가 IP를 바꾸지 않았다

**정답: B**

해설: RDS 페일오버는 엔드포인트 DNS 이름을 유지한 채 그 레코드가 가리키는 IP를 새 Primary로 바꾼다. 따라서 엔드포인트 이름은 그대로(A 틀림)이고 IP는 바뀐다(D 틀림). 그런데 애플리케이션이나 JVM이 DNS 결과를 오래 캐시하면(예: 자바의 무한 DNS 캐시) 옛 IP로 계속 붙고, 커넥션 풀이 끊긴 커넥션을 검증 없이 재사용해도 같은 증상이 난다. 해법은 짧은 DNS TTL, 클라이언트 DNS 캐시 단축, 커넥션 유효성 검사, 또는 RDS Proxy로 페일오버를 클라이언트로부터 숨기는 것이다.

---

**문제 5.** 서버리스(Lambda) 애플리케이션이 트래픽 급증 시 RDS의 max_connections를 소진해 "too many connections" 오류가 난다. 표준 해법은?

A) DB 인스턴스 타입을 무한정 키운다

B) RDS Proxy를 두어 커넥션을 풀링·다중화하고, 페일오버 시에도 클라이언트 커넥션을 유지

C) Lambda 동시성을 0으로 제한

D) Read Replica를 추가

**정답: B**

해설: Lambda는 동시 실행 환경마다 각자 DB 커넥션을 열어 트래픽 급증 시 max_connections를 순식간에 소진한다. RDS Proxy는 클라이언트-DB 사이에서 커넥션을 풀링·다중화(multiplexing)해 실제 DB 커넥션 수를 억제하고, 페일오버 시 클라이언트 커넥션을 유지해 끊김을 줄인다. 이는 PgBouncer/HikariCP와 같은 커넥션 풀 패턴의 관리형 구현으로, 서버리스+RDS 조합에서 사실상 필수다. 인스턴스 확대(A)는 근본 해결이 아니고, 동시성 0(C)은 서비스 중단, Read Replica(D)는 읽기 분산이지 커넥션 폭증 자체를 막지 못한다.

---

**문제 6.** 실수로 대량 DELETE를 실행했고, 5분 전 상태로 Aurora MySQL 클러스터 전체를 가장 빠르게 되돌리려 한다. 가장 적합한 것은?

A) Aurora Backtrack으로 클러스터를 제자리에서 5분 전으로 되감기

B) 스냅샷에서 새 클러스터로 복원

C) Read Replica를 Promote

D) S3 백업에서 복원

**정답: A**

해설: Aurora Backtrack(MySQL 호환)은 새 클러스터를 만들지 않고 클러스터 자체를 제자리(in-place)에서 특정 시점으로 되감는 기능으로, 최대 72시간 윈도우 내에서 빠르게 동작한다. "방금 실수를 몇 분 전으로"에 가장 빠르다. 스냅샷 복원(B)이나 PITR은 새 클러스터를 만들어 데이터를 가져오므로 느리고 엔드포인트 교체가 필요하다. 단, Backtrack은 활성화 시점 이후의 변경만 되감을 수 있고 PostgreSQL에는 없다는 점이 함정이다. "특정 테이블만" 또는 "30일 전"은 PITR이 맞다.

---

**문제 7.** ElastiCache for Redis에서 데이터셋이 단일 노드 메모리를 초과하고 쓰기를 수평 분산해야 한다. 올바른 구성과 그 내부 메커니즘은?

A) Cluster Mode Disabled로 Replica만 늘린다

B) Cluster Mode Enabled로 데이터를 16384개 해시 슬롯에 샤딩하고, 각 shard가 자기 Primary+Replica를 가지며, 슬롯 방식이라 리샤딩 시 이동 키가 최소화된다

C) 더 큰 단일 노드로 수직 확장만 한다

D) RDS Multi-AZ로 전환한다

**정답: B**

해설: Cluster Mode Enabled는 키 공간을 16384개 해시 슬롯(`CRC16(key) mod 16384`)으로 나눠 여러 shard에 분산(샤딩)하므로, 단일 노드 메모리를 넘는 데이터와 쓰기 수평 분산을 처리한다. 각 shard는 자기 Primary+Replica로 HA도 갖춘다. 해시 슬롯은 일관된 해싱과 같은 사상이라 shard 추가/제거 시 슬롯만 재배치돼 이동 키가 최소화된다(naive `hash mod N`의 대규모 키 이동을 회피). Cluster Mode Disabled(A)는 단일 shard라 데이터 분산이 안 되고, 수직 확장(C)은 단일 노드 한계에 부딪히며, RDS(D)는 캐시가 아니다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 복제는 동기/비동기 사이의 RPO-지연 트레이드오프이며 CAP/PACELC 좌표 위에 놓인다 — RDS Multi-AZ 동기는 PC/EC, 비동기 복제는 지연·가용성 우선이다. 둘째, RDS Multi-AZ는 블록 레벨 물리 복제(Standby read 불가)이고 Read Replica는 논리적 비동기 복제(read 가능)라 동작 차이가 물리/논리 복제에서 비롯되며, Multi-AZ DB Cluster는 준동기 3-copy로 <35초 페일오버를 낸다. 셋째, Aurora는 복제를 스토리지로 내려 6-copy/3-AZ 쿼럼(4/6 write·3/6 read, AZ+1 장애 모델)과 "로그가 곧 DB" 설계로 전통 DB를 앞서고, Backtrack·자동 확장·Serverless v2 같은 부가 기능을 가진다. 넷째, RTO는 승격 후보의 존재와 데이터 복사 여부가 결정하며(Aurora 30초·공유 스토리지), RDS Proxy의 커넥션 풀링이 페일오버를 클라이언트로부터 숨기고 서버리스의 커넥션 폭증을 막는다.
