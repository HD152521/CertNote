# Day 1 - Multi-AZ 고가용성: 복제 일관성·쿼럼·페일오버 뒤에 있는 분산 시스템 원리

데이터베이스 가용성을 진지하게 들여다보면 결국 하나의 질문으로 돌아온다. "방금 커밋한 데이터는 서버가 죽어도 잃고 싶지 않다. 누군가는 그 데이터의 사본을 들고 있어야 한다. 사본은 언제, 몇 개, 어디에 둘 것인가?" 답은 결정적인 지점에서 갈린다. 동기 복제인가 비동기 복제인가, 단일 AZ인가 다중 AZ인가, 2-copy인가 6-copy 쿼럼인가. AWS의 RDS Multi-AZ, Aurora, ElastiCache는 "체크박스 하나로 고가용성"처럼 보이지만, 그 밑에는 1970년대부터 쌓인 분산 시스템 이론(복제, 합의, 쿼럼, CAP)이 깔려 있다. 오늘은 이 체크박스가 어떤 트레이드오프를 숨기고 있는지, Aurora가 왜 전통적 복제와 근본적으로 다른 스토리지 설계를 택했는지, 페일오버 시간(RTO)이 어디서 나오는지를 푼다.

DOP-C02 시험에서 Multi-AZ는 "운영 우수성과 복원력"의 토대로 반복 등장한다. "이 DB의 RTO를 60초에서 30초로 줄여라", "HA를 보장하면서 읽기 트래픽을 분산하라", "페일오버 중에 애플리케이션 연결이 끊기지 않게 하라" 같은 시나리오가 대표적이다. 선택지가 동기/비동기, 쿼럼, 엔드포인트 중 무엇을 건드리는지 보이면 답이 나온다.

## 복제가 어려운 이유 — 동기와 비동기 사이의 근본적 긴장

복제의 본질은 단순하다. 같은 데이터를 여러 곳에 두는 것이다. 그러나 모든 것은 클라이언트에게 "쓰기가 끝났다"고 *언제* 응답하느냐에 달려 있다. **동기 복제(synchronous replication)**는 모든(또는 쿼럼 이상의) 복제본이 디스크에 썼다고 확인한 뒤에야 커밋을 확정한다. **비동기 복제(asynchronous replication)**는 Primary 노드가 자기 디스크에 쓰고 즉시 응답한 다음, 백그라운드로 복제본에 전파한다.

이 차이가 RPO(Recovery Point Objective — 얼마만큼의 데이터를 잃어도 되는가)를 직접 결정한다. 동기 복제는 RPO=0을 목표로 한다. Primary가 죽어도 Standby가 이미 같은 데이터를 갖고 있다. 대가는 모든 커밋이 네트워크 왕복을 한 번 더 기다리게 되어 쓰기 지연이 늘어난다는 점이다. 비동기 복제는 빠르지만, Primary가 장애를 일으키는 순간 아직 전파되지 않은 트랜잭션은 영원히 사라진다(RPO > 0).

> 이 긴장은 분산 시스템 이론에서 **CAP 정리**(Eric Brewer, 2000년 PODC 기조연설. Gilbert & Lynch가 2002년 형식적으로 증명)와 이를 정교화한 **PACELC**(Daniel Abadi, 2012)로 정리된다. CAP는 "네트워크 파티션이 발생하면 일관성(Consistency)과 가용성(Availability) 중 하나를 골라야 한다"고 말한다. PACELC는 한 줄을 더한다. "파티션이 없을 때도(Else) 지연(Latency)과 일관성 중 하나를 골라야 한다." RDS Multi-AZ의 동기 복제는 PACELC로 PC/EC(일관성 우선, 지연 감수)다. DynamoDB Global Tables의 비동기 복제는 PA/EL(가용성·지연 우선, 일관성 일부 희생)이다. "체크박스 하나"는 사실 이 근본 지도 위의 좌표를 고르는 일이다.

> RDS Multi-AZ의 "동기 복제"는 정확히 **물리적/블록 레벨 복제**다. MySQL의 논리 복제(binlog 기반, SQL/행 단위)가 아니라, 스토리지 엔진 아래에서 디스크 블록을 그대로 미러링한다(DRBD, Distributed Replicated Block Device와 비슷하다). 그래서 Standby는 Primary와 바이트 단위로 동일하고, Standby에서는 일반적인 읽기를 할 수 없다. Standby는 독립된 쿼리 엔진이 아니라 "그림자 디스크"이기 때문이다. 반면 Read Replica는 binlog/WAL 기반의 **논리적 비동기 복제**를 쓰므로 자기 쿼리 엔진을 갖고 읽기를 처리할 수 있다. "Multi-AZ Standby는 읽기가 안 되는데 Read Replica는 되는 이유"의 진짜 답이 이 물리/논리 복제의 차이다.

## RDS Multi-AZ — 동기 미러와 자동 페일오버

전통적 RDS Multi-AZ는 서로 다른 AZ에 Primary 하나와 Standby 하나를 둔다. 모든 쓰기는 Primary에서 일어나 Standby로 동기 미러링된다. Standby는 평상시에 놀고 있다. 읽기도 쓰기도 받지 않는다. 백업과 OS 패치는 Primary의 I/O 부담을 피하려고 Standby를 대상으로 실행된다.

페일오버는 자동이다. 트리거는 Primary 장애, AZ 장애, 인스턴스 타입 변경, OS 패치 등이다. 핵심은 **엔드포인트(DNS 이름)가 그대로**라는 점이다. RDS는 DNS 레코드가 가리키는 IP를 새 Primary(승격된 Standby)로 바꾼다. 애플리케이션은 같은 호스트 이름으로 다시 연결하기만 하면 된다. 보통 60~120초가 걸린다.

> ⚠️ **함정**: 페일오버가 빨라도 **클라이언트의 DNS 캐시 TTL**이 길면 복구가 느리게 느껴진다. 애플리케이션이나 JVM이 DNS를 오래 캐시하면(자바의 악명 높은 `networkaddress.cache.ttl=-1` 무한 캐시) 엔드포인트 IP가 바뀌었는데도 옛 IP가 캐시에 남아 연결 시도가 실패한다. RDS 엔드포인트가 짧은 TTL로 운영되는 이유이고, 애플리케이션 쪽 DNS 캐시도 함께 줄여야 한다. "페일오버는 끝났는데 앱이 여전히 옛 노드에 붙는다"의 답은 거의 항상 "DNS 캐시 TTL" 또는 "커넥션 풀이 죽은 커넥션을 재사용"이다.

## RDS Multi-AZ DB Cluster — 2-copy에서 3-copy 준동기로

2022년 AWS는 다른 구조인 **Multi-AZ DB Cluster**를 내놓았다. 3개 AZ에 걸쳐 Writer 1개와 Readable Standby 2개를 둔다. 두 Standby 모두 **읽기를 처리할 수 있고**, 복제는 **준동기(semi-synchronous)**다. 준동기란 "두 Standby 중 적어도 하나가 확인하면 커밋한다"는 뜻으로, 완전 동기(둘 다 기다림)와 완전 비동기(아무도 안 기다림)의 중간이다.

효과는 페일오버 속도가 **35초 미만**으로 줄어든다는 것이다(전통적 Multi-AZ는 60~120초). Readable Standby가 이미 실행 중이어서 부팅 시간이 필요 없다.

> 준동기 복제의 "Standby 하나가 확인하면 커밋"은 **쿼럼(quorum)** 사고방식의 단순한 형태다. 분산 시스템에서 쿼럼은 "전원이 아니라 과반이 동의하면 진행한다"는 기법으로, 가용성과 일관성의 균형을 잡는 핵심 도구다. 쓰기 쿼럼(W)과 읽기 쿼럼(R)이 `W + R > N`(N = 전체 복제본 수)을 만족하면 모든 읽기가 최신 쓰기를 본 복제본을 최소 하나 거치므로 강한 일관성이 보장된다(Dynamo 논문, 2007). 준동기 Multi-AZ DB Cluster는 이를 관리형 RDS 안에서 단순화한 것이고, 쿼럼으로 구동되는 진짜 스토리지는 다음 절의 Aurora에 나온다.

## Aurora — 복제를 스토리지 계층으로 내리다

Aurora는 AWS 제품이지만 RDS와 정반대의 철학으로 동작한다. 전통적 DB는 "복제는 컴퓨트 노드의 일"이라고 본다. Primary가 데이터를 Standby에 보낸다. Aurora는 이를 뒤집는다. **복제를 컴퓨트에서 분리해 스토리지 계층으로 내린다.** Aurora의 컴퓨트 노드(Writer/Reader)에는 로컬 디스크가 없다. 대신 모두 하나의 **클러스터 볼륨**을 공유하고, 이 볼륨은 3개 AZ에 걸쳐 데이터를 6개 복사본으로 저장한다.

```
Aurora Cluster
   ├─ Writer Node (1)              ← Handles all writes
   ├─ Reader Nodes (0-15)          ← Distribute reads, share cluster volume with Writer
   └─ Cluster Volume (shared storage)
        6 copies / 3 AZs (2 per AZ)
        4/6 write quorum, 3/6 read quorum
```

쿼럼 숫자를 보면, 쓰기는 6개 중 **4개**가 확인하면 성공하고(4/6 write quorum), 읽기는 6개 중 **3개**만 있으면 된다(3/6 read quorum). `W(4) + R(3) = 7 > N(6)`이므로 쿼럼 교집합이 보장된다. 모든 읽기가 최신 쓰기를 가진 복사본을 최소 하나 거친다.

이 6/3/2 설계는 Aurora 논문(Verbitski et al., SIGMOD 2017, *"Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"*)에 설명되어 있다. AZ 하나가 통째로 죽어 복사본 2개를 잃어도 남은 4개로 4/6 쓰기 쿼럼을 채울 수 있다. 같은 상황에서 복사본이 하나 더 죽어 총 3개를 잃어도 남은 3개로 읽을 수 있다(3/6 쿼럼). 이것이 **"AZ+1" 장애 모델**이다. AZ 전체 장애에 더해 디스크 장애 하나가 추가로 나도 데이터 손실이 없다.

> 전통적 DB 복제가 느린 이유는 **전체 페이지**를 네트워크로 보내기 때문이다. MySQL은 더블라이트 버퍼, binlog, redo log, 데이터 페이지를 디스크와 복제본 양쪽에 써야 한다(쓰기 증폭). Aurora의 돌파구는 **"로그가 곧 데이터베이스"**라는 통찰이다. Writer는 변경된 페이지 전체가 아니라 **redo 로그 레코드**만 스토리지로 보낸다. 페이지 재구성은 스토리지 노드가 백그라운드에서 비동기로 한다. 네트워크 쓰기량이 몇 자릿수 줄고, 같은 하드웨어에서 처리량이 전통적 MySQL을 여러 배 앞선다. "쿼리 엔진이 같은데 Aurora가 MySQL/PostgreSQL보다 빠른 이유"의 진짜 답은 스토리지와 복제 계층을 완전히 다시 썼다는 것이다.

> Netflix는 2008년 데이터센터 한 곳의 스토리지 손상 장애로 DVD 배송이 사흘간 멈췄다. 이 일이 "단일 장애점을 없애고 클라우드 분산 스토리지로 옮긴다"는 전략적 결정을 낳았다(Chaos Monkey의 씨앗이기도 했다). Aurora의 6-copy/3-AZ 설계는 이 교훈을 상용화한 것이다. "스토리지는 부분적으로 실패한다고 가정하고, 쿼럼으로 견디게 설계한다." 가용성은 장애를 피하는 것이 아니라, 장애가 나도 계속 동작하도록 설계하는 것이라는 원칙이다.

## Aurora 페일오버와 기능

Aurora의 Writer가 죽으면 Reader 하나(승격 우선순위(promotion tier)로 선택)가 새 Writer가 된다. 스토리지가 공유되므로 데이터 복사가 필요 없고 **페일오버는 30초 이내에 끝난다**(Reader가 없어 새로 띄워야 하면 더 길어진다). **Reader 엔드포인트**는 모든 Reader에 부하를 분산하고, **Writer 엔드포인트**는 항상 현재 Writer를 가리킨다.

| 기능 | 핵심 | 비고 |
|---------|------|------|
| **Backtrack** (MySQL) | 클러스터를 특정 시점으로 되감기 | S3 백업 불필요, 최대 72시간 윈도우, 제자리(in-place) |
| **클러스터 볼륨 자동 확장** | 10GB 단위로 최대 128TB까지 자동 증가 | 사전 프로비저닝 불필요 |
| **Aurora Serverless v2** | 0.5 ACU 단위로 끊김 없이 스케일링 | 트래픽에 따라 자동 확장 |
| **Global Database** | Primary 1개 + 최대 5개 Secondary 리전 | 비동기 지연 1초 미만 (Day 2) |

> ⚠️ **함정**: Backtrack은 백업이 아니다. Backtrack은 **클러스터를 제자리에서 되감으며**(새 클러스터가 생기지 않는다) MySQL에서만 동작하고, 활성화한 이후의 변경만 복구한다. "5분 전에 전부 DELETE했다 → 5분 되감기"가 Backtrack의 강점이다. 그러나 "특정 테이블만 복원"이나 "30일 전으로 복구"는 PITR(스냅샷+로그 기반 Point-In-Time Recovery)이 필요하다. 둘을 혼동시키는 것이 시험 함정이다.

## RDS Proxy — 클라이언트에게서 페일오버를 숨기다

페일오버가 30초라도, 수백 개의 애플리케이션 연결이 한꺼번에 끊겼다가 곧바로 새 Primary에 재연결하면 커넥션 폭주(connection storm)로 새 Primary가 다시 죽을 수 있어 치명적이다. **RDS Proxy**는 클라이언트와 데이터베이스 사이에 커넥션 풀을 두는 관리형 프록시다. 클라이언트는 Proxy에 연결하고, Proxy가 DB와의 연결을 풀링해 재사용한다.

페일오버가 일어나면 클라이언트-Proxy 연결은 유지된 채 Proxy가 내부적으로 새 Primary로 경로를 바꾼다. 클라이언트는 거의 끊김을 느끼지 못한다. IAM 인증과 Secrets Manager 통합도 제공하고, 서버리스(Lambda)에서 오는 커넥션 폭주도 완화한다.

> RDS Proxy의 커넥션 풀링은 새로운 개념이 아니다. 자바의 HikariCP/c3p0, PostgreSQL의 PgBouncer가 수십 년째 해온 일이다. DB 커넥션은 비싸기 때문에(메모리/프로세스 — PostgreSQL은 연결마다 프로세스를 생성한다) "요청마다 새 연결"은 안티패턴이다. 풀링은 비싼 객체를 미리 만들어 재사용하는 **객체 풀 패턴(object pool pattern)**이다. 서버리스 Lambda가 수천 개의 동시 실행을 띄우고 각각이 자기 연결을 열면 DB의 `max_connections`가 순식간에 바닥난다. RDS Proxy가 그 사이에서 연결을 다중화해 이를 막는다. 서버리스+RDS 조합에서는 사실상 RDS Proxy가 필수다.

## ElastiCache Redis — 캐시의 고가용성

ElastiCache for Redis(지금은 Valkey 포함)는 **복제 그룹(replication group)** 수준에서 HA를 처리한다. Primary 1개 + Replica 0~5개가 그룹을 이루고, Primary가 죽으면 Replica 하나가 자동 승격된다(Multi-AZ를 활성화해야 한다).

- **Cluster Mode Disabled**: 단일 샤드(Primary 1개 + 최대 Replica 5개). 모든 데이터가 한 노드에 들어가며, Replica가 읽기 분산과 HA를 맡는다. 데이터셋이 한 노드의 메모리에 들어갈 때 쓴다.
- **Cluster Mode Enabled**: 여러 샤드(최대 500개)가 **데이터를 분할(sharding)**하고, 각 샤드가 자기 Primary+Replica를 가진다. 데이터가 한 노드의 메모리를 넘거나 쓰기를 수평 확장해야 할 때 쓴다.

> Cluster Mode Enabled의 샤딩은 일관된 해싱(consistent hashing)의 사촌격인 **해시 슬롯(hash slot)** 방식을 쓴다. Redis Cluster는 키 공간을 16,384개 슬롯(`CRC16(key) mod 16384`)으로 나누고 각 슬롯을 샤드에 할당한다. 샤드를 추가하거나 제거할 때 슬롯만 이동하므로, N이 바뀔 때 거의 모든 키가 이동하는 단순 modulo의 참사를 피한다. 노드 수가 바뀔 때 키 이동을 최소화하는 것이 일관된 해싱의 핵심 가치다. ElastiCache는 리샤딩 기능에서 슬롯 재분배를 온라인(무중단)으로 수행한다.

## 페일오버 RTO 한눈에 보기 — 시간은 무엇이 결정하는가

| 구성 | RTO | RTO 결정 요인 |
|--------|-----|---------------------|
| RDS Single-AZ | 수동 (수 분~수 시간) | 사람이 시작하는 스냅샷 복원 |
| RDS Multi-AZ | 60~120초 | Standby 승격 + DNS 전환 |
| RDS Multi-AZ DB Cluster | 35초 미만 | Readable Standby가 이미 실행 중이며 승격 |
| Aurora (단일 리전) | 30초 미만 | 공유 스토리지라 복사 불필요, Reader 승격 |
| Aurora Global (리전 페일오버) | 1분 미만 | Secondary를 독립 클러스터로 승격 (Day 2) |
| ElastiCache Redis Multi-AZ | 60초 미만 | Replica 승격 |
| DynamoDB | 약 0 | 본질적으로 분산 구조라 단일 노드 개념이 없음 |

모든 행을 관통하는 원칙은 이렇다. **"페일오버 후보가 이미 실행 중이고 복사할 데이터가 적을수록 RTO가 짧다."** Aurora가 빠른(30초) 이유는 스토리지가 공유되어 새 Writer가 데이터를 가져올 필요가 없기 때문이다. Multi-AZ DB Cluster가 전통적 Multi-AZ보다 빠른 이유는 Standby가 이미 실행 중이며 읽기를 처리하고 있기 때문이다.

## 정리

오늘은 네 장의 그림을 봤다. 첫째, **복제는 동기/비동기와 RPO/지연 사이의 트레이드오프**이며 분산 시스템의 근본 좌표인 CAP/PACELC 위에 놓인다. 둘째, **RDS Multi-AZ는 블록 레벨 동기 미러링**(Standby는 읽기 불가)이고 **Read Replica는 논리적 비동기 복제**(읽기 가능, 별도 엔드포인트)다. 두 동작의 차이는 물리 복제와 논리 복제에서 비롯된다. 셋째, **Aurora는 복제를 스토리지로 분리하여 6-copy/3-AZ 쿼럼**(4/6 쓰기, 3/6 읽기)과 "로그가 곧 데이터베이스" 설계로 전통적 DB를 앞선다. 넷째, **RTO는 페일오버 후보의 가용 여부와 데이터 복사 필요 여부로 정해지며**, RDS Proxy는 커넥션 풀링으로 페일오버를 숨긴다.

다음에는 이 고가용성을 여러 리전으로 확장한다. Route 53 라우팅, Aurora Global, DynamoDB Global Tables, KMS Multi-Region Key를 다룬다.

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
