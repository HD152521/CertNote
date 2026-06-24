# Day 4 - RDS·Aurora·DynamoDB Global의 DR — 동기·비동기 복제의 내부, Aurora 스토리지 아키텍처, Active-Active의 충돌 해결

데이터베이스의 DR은 다른 모든 계층의 DR과 결이 다르다. 웹 서버는 죽으면 다시 띄우면 그만이지만, **데이터는 한 번 잃으면 영원히 사라진다**. 그래서 데이터 계층의 복제 방식은 곧 시스템의 RPO를 결정하는 가장 근본적인 설계 결정이며, 여기엔 빛의 속도와 분산 합의(consensus)라는 물리·이론적 한계가 그대로 작용한다. AWS는 RDS·Aurora·DynamoDB라는 세 갈래로 이 문제를 풀었고, 각각이 택한 트레이드오프가 시험의 핵심이다.

SAP-C02에서 이 영역은 단순 암기("Aurora Global은 5개 리전")가 아니라, **각 옵션이 동기/비동기 중 무엇을 택했고, 그래서 RPO·RTO·일관성·쓰기 가능 리전이 어떻게 갈리는지**를 묻는다. 오늘은 RDS Multi-AZ의 동기 복제 내부, Aurora의 혁신적 스토리지 분리 아키텍처, 그리고 DynamoDB Global Tables의 Active-Active 충돌 해결까지 내부 동작 수준에서 분해한다.

## 동기 vs 비동기 — RPO를 가르는 근본 축

세 데이터베이스의 모든 DR 옵션은 결국 **동기(synchronous) 복제냐 비동기(asynchronous) 복제냐**로 환원된다. 동기는 쓰기가 모든 사본에 도달·확인된 뒤 성공을 반환해 RPO=0이지만 사본까지의 왕복 지연이 더해진다. 비동기는 primary에 쓰면 즉시 성공을 반환하고 사본엔 나중에 전파해 빠르지만, primary 장애 시 미전파분이 사라져 RPO>0이다.

| 복제 방식 | RPO | 쓰기 지연 | 현실적 적용 범위 |
|-----------|-----|----------|------------------|
| **동기** | 0 | 사본 RTT만큼 증가 | AZ 간(1~2ms) |
| **비동기** | >0(보통 수 초) | 거의 영향 없음 | 리전 간(수십 ms) |

이 구분이 왜 AZ/리전 경계와 맞물리는지가 핵심이다. AZ 간은 수 km(1~2ms)라 동기 복제의 지연이 감당 가능하지만, 리전 간은 수천 km(40ms+)라 동기를 걸면 모든 쓰기가 무너진다. 그래서 **AWS DB는 일관되게 "AZ 간=동기, 리전 간=비동기"**를 택한다.

> 💡 **관련 이론**: 이 트레이드오프의 이론적 뿌리가 **PACELC 정리**다(Daniel Abadi, 2012). CAP("분할 시 일관성 C vs 가용성 A")를 확장해, "분할(Partition)이 없을 때(Else)에도 지연(Latency)과 일관성(Consistency) 사이에서 선택해야 한다"고 명시한다. RDS Multi-AZ는 PC/EC — 분할 시 일관성, 평상시도 일관성을 택해 지연을 감수한다. DynamoDB는 기본적으로 PA/EL 성향 — 가용성과 낮은 지연을 위해 eventual consistency를 받아들인다(강한 일관성 읽기는 옵션). 시험에서 "강한 일관성 vs 낮은 지연" 트레이드오프가 보이면 이 정리가 배경이며, "리전 간 RPO 0"은 거의 불가능하거나 큰 지연 대가를 의심해야 한다.

## RDS Multi-AZ — Instance vs Cluster

RDS의 단일 리전 고가용성은 Multi-AZ로 달성하며, 두 종류가 있다.

| 모드 | 구성 | Failover | Standby 읽기 |
|------|------|----------|-------------|
| **Multi-AZ Instance** | 1 Primary + 1 Standby | **60~120초** | 불가(standby는 대기만) |
| **Multi-AZ Cluster** | 1 Writer + 2 Readable Standby | **약 35초** | 가능(2개 replica에 read) |
| **Read Replica** | 비동기 복제본 | 자동 failover 없음(수동 promote) | 가능·다른 리전도 가능 |

전통적 Multi-AZ Instance는 동기 복제로 standby를 유지하지만, standby는 트래픽을 받지 않고 오직 장애 대기용이다(자원 낭비). 2022년 출시된 **Multi-AZ Cluster**는 이를 진화시켰다 — 1 Writer + 2개의 **읽기 가능한** standby로, 평소엔 2개 replica에 read 트래픽을 분산하고 장애 시 약 35초 만에 failover한다.

핵심 함정 하나를 못 박자. **Read Replica는 고가용성(HA) 기능이 아니라 읽기 확장(scaling) 기능**이다. Multi-AZ가 자동 failover를 제공하는 것과 달리, Read Replica는 primary가 죽어도 자동으로 승격되지 않는다 — 사람이 수동으로 promote해야 새 primary가 된다. 그래서 "자동 failover"가 요구되면 Read Replica는 오답이고 Multi-AZ가 정답이며, "다른 리전에서 읽기 부하 분산"이 요구되면 Cross-Region Read Replica가 정답이다. 둘의 목적을 섞으면 시험에서 함정에 빠진다.

> 🔍 **더 깊이**: Multi-AZ Cluster가 failover를 60~120초에서 35초로 줄인 비결은 **semi-synchronous replication**이다. 전통 Multi-AZ Instance는 standby로의 완전 동기 복제를 기다리는데, Cluster는 writer가 **2개 중 적어도 1개** replica에 데이터가 도달했음을 확인하면 commit ack를 반환한다(쿼럼 기반). 이는 완전 동기보다 빠르면서도 비동기보다 데이터 손실 위험이 낮은 절충이다. 또 readable standby라 failover 시 이미 데이터가 거의 최신인 replica를 승격하므로 전환이 빠르다. 시험에서 "RDS failover 30초대 + standby에 read 트래픽"이 보이면 Multi-AZ Cluster가 직답이다. Read Replica는 자동 failover가 없다(수동 promote 필요)는 점이 핵심 함정이다.

## Aurora — 스토리지를 컴퓨트에서 분리한 혁신

Aurora가 RDS와 근본적으로 다른 점은 **컴퓨트(DB 인스턴스)와 스토리지를 완전히 분리**한 아키텍처다. 전통 DB는 인스턴스가 자기 디스크에 직접 쓰고 standby로 전체 데이터를 복제하지만, Aurora는 **3개 AZ에 걸쳐 6개의 데이터 사본을 유지하는 분산 스토리지 계층**을 따로 두고, 컴퓨트 인스턴스들은 이 공유 스토리지를 바라본다.

| 옵션 | 구성 | 핵심 특성 |
|------|------|----------|
| **Aurora Multi-AZ** | 1 Writer + 최대 15 Readers | 데이터는 3 AZ에 6 사본 |
| **Aurora Global Database** | 1 Primary Region + 최대 5 Secondary | RPO < 1초, RTO < 1분 |

> 🔍 **더 깊이**: Aurora 스토리지 분리의 천재성은 **복제 대상이 "데이터베이스 페이지"가 아니라 "redo log 레코드"**라는 점이다. 전통 DB는 변경된 데이터 페이지를 통째로 standby에 보내지만, Aurora는 훨씬 작은 redo log만 스토리지 노드로 보내고 스토리지가 자체적으로 페이지를 재구성한다. 네트워크 전송량이 극적으로 줄어 6개 사본을 유지하면서도 빠르다. 또 쓰기는 **6개 중 4개(쿼럼)** 사본이 확인하면 성공으로 처리(4/6 write quorum), 읽기는 6개 중 3개로 충족(3/6 read quorum)한다 — 한 AZ 전체(사본 2개)가 죽어도 쓰기가 4/6 쿼럼을 채울 수 있어 가용성이 유지된다. 이 쿼럼 설계 덕에 Aurora는 인스턴스 장애 시 standby 승격 없이 다른 인스턴스가 같은 스토리지를 즉시 바라봐 failover가 빠르다. 시험에서 "Aurora 6 사본·3 AZ", "quorum 기반 내구성"이 배경 지식으로 깔린다.

> 💡 **관련 이론**: Aurora의 4/6 쓰기·3/6 읽기 쿼럼은 분산 시스템의 **정족수(quorum) 합의** 원리다. W + R > N(여기선 4 + 3 > 6)을 만족하면 읽기가 항상 최신 쓰기를 본다는 정리에 기반한다. 이는 Dynamo 논문(Amazon, 2007)이 정립한 sloppy quorum 사상의 연장선이며, 동일한 정족수 사고가 ZooKeeper·etcd·Cassandra 등 거의 모든 분산 데이터 시스템의 근간이다. AWS가 N=6, W=4, R=3을 택한 이유는 "1개 AZ 손실 + 1개 노드 손실"까지 견디면서도 쓰기 지연을 최소화하는 균형점이기 때문이다.

Aurora Global Database는 이 스토리지 계층을 **리전 간 비동기 복제**로 확장한다. Primary 리전이 secondary로 storage-level 복제를 수행하며, 일반적으로 RPO < 1초·cross-region failover RTO < 1분을 달성한다. Secondary는 read-only지만(최대 5개 리전, 리전당 최대 16 readers로 글로벌 읽기 확장), **write forwarding**을 켜면 secondary로 온 쓰기를 primary로 자동 전달할 수 있다(지연 대가).

> ⚠️ **함정**: "Aurora Global = Active-Active"로 오해하면 틀린다. Aurora Global은 본질적으로 **single-writer**다 — primary 리전 한 곳만 쓰기를 받고 secondary는 read-only다. write forwarding을 켜도 실제 쓰기는 primary로 forward되어 처리되므로 진정한 multi-master가 아니다. "양 리전 동시 쓰기(true Active-Active)"가 필요하면 DynamoDB Global Tables다. 시험에서 "글로벌 SQL + RPO 1초"는 Aurora Global, "양 리전 쓰기 + Active-Active"는 DDB Global Tables로 정확히 갈린다.

## DynamoDB Global Tables — 진짜 Active-Active

DynamoDB Global Tables는 **여러 리전이 모두 쓰기를 받는 multi-master(Active-Active)** 구성이다. 각 리전의 테이블이 독립적으로 쓰기를 처리하고, DynamoDB Streams를 통해 변경을 모든 다른 리전에 비동기 전파한다. 모든 리전이 쓰기 가능하므로 한 리전이 죽어도 다른 리전이 이미 트래픽을 받고 있어 RPO·RTO가 거의 0이다.

핵심 과제는 **충돌 해결(conflict resolution)**이다. 두 리전에서 같은 항목을 거의 동시에 수정하면 어느 쪽이 이기는가? DynamoDB는 **Last Writer Wins(LWW)** — 타임스탬프가 더 늦은 쓰기가 최종 값이 된다.

> 💡 **관련 이론**: Active-Active multi-master의 충돌 해결은 분산 시스템의 가장 어려운 문제 중 하나다. DynamoDB가 택한 **Last Writer Wins**는 단순하고 빠르지만 위험이 있다 — 두 쓰기가 거의 동시에 일어나면 한쪽이 **조용히 사라진다(lost update)**. 더 정교한 방식으로는 벡터 클록(vector clock)이나 CRDT(Conflict-free Replicated Data Type)가 있지만, 충돌을 애플리케이션이 병합해야 해 복잡하다. DynamoDB는 단순성과 성능을 위해 LWW를 택했으므로, **애플리케이션 설계 시 같은 항목을 여러 리전에서 동시에 쓰는 패턴을 피하거나, 리전별로 쓰기 키를 분할(sharding)**하는 것이 모범이다. 시험에서 "DDB Global Tables의 충돌 시 동작"은 Last Writer Wins가 정답이며, 이 한계를 이해하는 것이 Active-Active 설계의 핵심이다.

> 📚 **사례**: 2017년 GitLab의 데이터베이스 사고는 복제·백업의 중요성을 역으로 보여준 유명한 사례다. 한 엔지니어가 장애 대응 중 잘못된 서버에서 production 디렉터리를 삭제했고, 설정된 5가지 백업·복제 메커니즘이 모두 제대로 작동하지 않아 6시간치 데이터를 영구 손실했다. 교훈은 "복제·백업은 정기적으로 복원 테스트를 해야 진짜 작동한다"는 것이다. DynamoDB Global Tables나 Aurora Global 같은 관리형 복제는 이런 사람의 실수와 미검증 백업 문제를 구조적으로 줄여준다 — AWS가 복제·failover를 관리하므로 "복제가 조용히 멈춰 있었다"는 사고가 발생하기 어렵다. 시험에서 "운영 부담 최소 + 멀티 리전 DR"이 보이면 관리형 글로벌 DB가 직답이다.

> 📚 **사례**: Amazon이 2012년 발표한 **Dynamo 논문**은 단순한 제품 발표가 아니라 분산 데이터베이스 역사의 분기점이었다. 2004년 크리스마스 쇼핑 시즌, Amazon의 관계형 DB가 피크 트래픽에 무릎을 꿇으며 장바구니 서비스가 멈춘 사건이 직접적 계기였다. 엔지니어들은 "강한 일관성보다 항상 쓸 수 있는 가용성(always-writeable)이 장바구니에 더 중요하다"는 결론에 도달했고, eventual consistency·정족수·hinted handoff를 채택한 Dynamo를 만들었다. 이 논문이 Cassandra·Riak·Voldemort 등 수많은 NoSQL의 청사진이 됐고, 오늘의 관리형 DynamoDB Global Tables가 그 직계 후손이다. 시험에서 "가용성을 일관성보다 우선(always-writeable)"이 보이면 DynamoDB 계열이 배경 사상이다.

## 기타 데이터 계층의 멀티 리전

| 서비스 | 멀티 리전 옵션 | 특성 |
|--------|---------------|------|
| **ElastiCache (Redis)** | **Global Datastore** | 1 Primary 리전 쓰기 + Secondary 읽기 복제(1초 미만) |
| **S3** | **CRR** | 비동기 cross-region 복제 |
| **S3** | **MRAP** | 다중 리전 버킷을 단일 글로벌 엔드포인트로 |
| **S3** | **Replication Time Control(RTC)** | 복제 SLA 15분 보장 |

> ⚠️ **함정**: Redis Global Datastore와 DynamoDB Global Tables를 혼동하면 안 된다. Global Datastore는 **single-writer**(Primary 리전만 쓰기, secondary는 read-only 복제)인 반면, DynamoDB Global Tables는 **multi-master**(모든 리전 쓰기)다. "Redis 멀티 리전 복제"는 Global Datastore이지만 "양 리전 쓰기"는 아니다. 또 S3에서 "다중 리전 + 단일 엔드포인트"는 MRAP, "비동기 복제 자체"는 CRR, "복제 시간 SLA"는 RTC로 정확히 갈린다.

## 정리하며

데이터 계층 DR의 모든 선택은 **동기(AZ 간·RPO 0)·비동기(리전 간·RPO>0)** 축으로 환원되며, 그 뿌리는 PACELC의 지연-일관성 트레이드오프다. RDS Multi-AZ Cluster는 semi-synchronous 쿼럼으로 35초 failover와 readable standby를 제공하고, Aurora는 컴퓨트·스토리지를 분리해 redo log만 복제하는 4/6 쿼럼 분산 스토리지로 빠른 failover를 달성하며, Global Database로 리전 간 비동기 복제(RPO<1초·single-writer)를 확장한다. DynamoDB Global Tables만이 진정한 multi-master Active-Active이며, Last Writer Wins로 충돌을 해결한다.

SAP 시험 단골 매핑: (1) "RDS failover 30초대 + standby read" → **Multi-AZ Cluster**, (2) "글로벌 SQL + RPO 1초·RTO 1분" → **Aurora Global Database**, (3) "양 리전 동시 쓰기·Active-Active" → **DynamoDB Global Tables**, (4) "DDB 충돌 시 동작" → **Last Writer Wins**, (5) "Aurora secondary 최대 5리전·read-only", (6) "Redis 멀티 리전 복제(single-writer)" → **Global Datastore**, (7) "S3 다중 리전 단일 엔드포인트" → **MRAP**, (8) "Read Replica는 자동 failover 없음(수동 promote)". 다음 day는 14주차 DR·복원력 전체를 산업별 종합 시나리오로 통합 복습한다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 RDS PostgreSQL의 failover를 30초 이내로 달성하고, 평소에는 standby 인스턴스에도 read 트래픽을 분산해 자원을 활용하려 한다. 가장 적합한 구성은?

A) Multi-AZ Instance (1 Primary + 1 Standby)

B) Multi-AZ Cluster (1 Writer + 2 Readable Standby)

C) Cross-Region Read Replica

D) Single-AZ + 잦은 스냅샷

**정답: B**

해설: Multi-AZ Cluster는 1 Writer + 2개의 읽기 가능한 standby 구성으로, semi-synchronous 쿼럼 복제 덕에 약 35초 failover를 달성하면서 평소 2개 replica에 read 트래픽을 분산한다. A(Multi-AZ Instance)는 failover가 60~120초이고 standby는 대기만 할 뿐 read 트래픽을 받지 못한다. C(Read Replica)는 자동 failover가 없어 수동 promote가 필요하다. D는 고가용성 자체가 없다. 함정: "30초대 failover + standby read"는 Multi-AZ Cluster의 직답이며, Read Replica는 자동 failover가 없다는 점이 핵심 구분이다.

---

**문제 2.** 한 글로벌 서비스가 SQL 데이터베이스를 여러 리전에 두고 RPO 1초 미만·cross-region failover RTO 1분을 요구한다. 가장 적합한 옵션은?

A) RDS Multi-AZ Cluster

B) Aurora Global Database

C) DynamoDB Global Tables

D) RDS Cross-Region Read Replica

**정답: B**

해설: Aurora Global Database는 storage-level 비동기 복제로 최대 5개 secondary 리전을 두고 일반적으로 RPO < 1초·RTO < 1분을 보장하는 관리형 글로벌 SQL DB다. A는 단일 리전 내 고가용성만 제공하고, C(DDB)는 SQL이 아니라 NoSQL이며, D(Read Replica)는 일관성·failover 보장이 약하고 RTO/RPO SLA를 명시하지 않는다. 함정: "글로벌 SQL + RPO 1초"는 Aurora Global의 직답이며, NoSQL 요구가 아닌 한 DDB로 답이 가지 않는다.

---

**문제 3.** 한 회사가 양 리전(us-east-1, ap-northeast-2)에서 모두 쓰기를 받아야 하는 글로벌 주문 시스템을 설계한다. 가장 적합한 데이터베이스는?

A) Aurora Global Database (Read-Only Secondary)

B) DynamoDB Global Tables

C) RDS Cross-Region Read Replica

D) ElastiCache Redis Global Datastore

**정답: B**

해설: DynamoDB Global Tables만이 모든 리전이 쓰기를 받는 진정한 multi-master Active-Active 구성으로, 양 리전 동시 쓰기 요구를 충족한다. A(Aurora Global)는 secondary가 read-only인 single-writer이고(write forwarding을 켜도 실제 쓰기는 primary로 forward), C(Read Replica)는 promote 전 read-only이며, D(Redis Global Datastore)도 single-writer다. 함정: "양 리전 동시 쓰기·Active-Active"는 DDB Global Tables가 유일한 직답이고, Aurora Global·Redis Global Datastore는 모두 single-writer라는 점이 핵심 구분이다.

---

**문제 4.** DynamoDB Global Tables에서 두 리전이 같은 항목을 거의 동시에 수정해 충돌이 발생하면 어떻게 해결되는가?

A) 두 쓰기를 자동 병합한다

B) 타임스탬프가 더 늦은 쓰기가 이긴다 (Last Writer Wins)

C) 쓰기가 모두 거부된다

D) 관리자가 수동으로 해결한다

**정답: B**

해설: DynamoDB Global Tables는 Last Writer Wins(LWW)로 충돌을 해결한다 — 타임스탬프가 더 늦은 쓰기가 최종 값이 되고, 진 쪽은 조용히 사라진다(lost update). 단순하고 빠르지만 이 한계 때문에 같은 항목을 여러 리전에서 동시에 쓰는 패턴을 피하거나 리전별로 쓰기 키를 분할하는 것이 모범이다. A(자동 병합)는 CRDT 같은 더 복잡한 방식이고 DDB의 기본 동작이 아니며, C·D는 사실과 다르다. 함정: DDB Global Tables의 충돌 해결은 Last Writer Wins이며, 동시 쓰기로 인한 lost update 위험을 이해하는 것이 Active-Active 설계의 핵심이다.

---

**문제 5.** Aurora의 분산 스토리지가 1개 AZ 전체 장애(2개 사본 손실)에도 쓰기 가용성을 유지할 수 있는 이유로 가장 정확한 것은?

A) 데이터를 단일 AZ에 집중 저장하기 때문

B) 3개 AZ에 6개 사본을 두고 4/6 쓰기 쿼럼을 사용하기 때문

C) 매 쓰기마다 모든 6개 사본의 확인을 기다리기 때문

D) standby 인스턴스를 즉시 승격하기 때문

**정답: B**

해설: Aurora는 3개 AZ에 걸쳐 6개 사본을 유지하고 쓰기는 6개 중 4개(4/6 쿼럼), 읽기는 3개(3/6 쿼럼)가 확인하면 성공으로 처리한다. 1개 AZ 전체(사본 2개)가 죽어도 남은 4개 사본으로 4/6 쓰기 쿼럼을 채울 수 있어 가용성이 유지된다(W+R>N 정족수 원리). A는 정반대이고, C는 완전 동기로 쿼럼의 이점을 부정하며, D는 인스턴스 failover이지 스토리지 가용성의 이유가 아니다. 함정: Aurora의 내구성은 "모든 사본 동기 대기"가 아니라 "쿼럼 기반"이라는 점이 핵심이다.

---

**문제 6.** 한 팀이 ElastiCache Redis를 두 리전에 복제하려 한다. Redis Global Datastore의 특성으로 가장 정확한 것은?

A) 모든 리전에서 쓰기가 가능한 multi-master다

B) 1개 Primary 리전만 쓰기를 받고 Secondary 리전은 read-only로 1초 미만 복제된다

C) DynamoDB Streams를 사용해 복제한다

D) 복제가 동기식이라 RPO가 항상 0이다

**정답: B**

해설: Redis Global Datastore는 single-writer 구성으로 1개 Primary 리전만 쓰기를 받고 Secondary 리전은 read-only 복제본으로 보통 1초 미만 지연으로 복제된다. A는 DynamoDB Global Tables의 특성과 혼동한 것이고(Redis Global Datastore는 multi-master 아님), C는 DDB의 메커니즘이며, D는 리전 간 비동기 복제이므로 RPO가 0이 아니다. 함정: "Redis 멀티 리전 복제"는 Global Datastore이되 single-writer이며, multi-master는 DDB Global Tables라는 점이 핵심 구분이다.

---
