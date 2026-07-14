# Day 1 - Multi-AZ High Availability: Distributed Principles Underlying Replication Consistency, Quorum, and Failover

When you look seriously at database availability, you always arrive at the same question. "I just committed data. To not lose it even if one server dies, someone else must hold a copy. When, how many, and where do we place that copy?" The answers branch at the juncture of **synchronous vs. asynchronous replication**, **single-AZ vs. multi-AZ**, **2-copy vs. 6-copy quorum**. AWS's RDS Multi-AZ, Aurora, and ElastiCache appear as simple checkboxes for "HA option," but underneath lie decades of distributed-systems theory — replication, consensus, quorum, CAP — from the 1970s onward. Today we excavate what tradeoffs these checkboxes make, why Aurora chose a fundamentally different storage design than traditional replication, and where failover time (RTO) is determined.

In DOP exams, Multi-AZ is foundational to "operational excellence and resilience," appearing repeatedly in scenarios like "cut RTO from 60s to 30s," "distribute read load while guaranteeing HA," or "prevent application connection drops during failover." Recognizing which tool touches synchronous/asynchronous, quorum, or endpoint reveals the answer.

## Replication is Hard — The Fundamental Tension Between Sync and Async

Replication's essence is simple: store the same data in multiple places. But when do you respond "write complete" to the client? Here everything diverges.

**Synchronous replication** waits until all (or a quorum) of replicas acknowledge receipt and disk write before acknowledging commit to the client. **Asynchronous replication** writes to the primary only, responds immediately, then propagates to replicas in the background.

This difference becomes **RPO** (recovery point objective: how much data can we lose?). Synchronous targets RPO=0 — if the primary dies, standby already has the same data. But every write waits one extra network round-trip, increasing write latency. Asynchronous is fast, but if the primary dies before propagating, uncommitted transactions vanish forever (RPO > 0).

> 💡 **Related theory**: This tension is formalized by **CAP Theorem** (Eric Brewer, 2000 PODC keynote; Gilbert & Lynch formal proof, 2002) and its refinement **PACELC** (Daniel Abadi, 2012). CAP says "during network Partition, choose Consistency or Availability." PACELC adds a line: "Else (no partition), choose Latency or Consistency." RDS Multi-AZ's synchronous replication is PC/EC (Consistency first, accept Latency); DynamoDB Global Tables' asynchronous is PA/EL (Availability·Latency first, sacrifice Consistency). "One checkbox" is actually choosing position on this fundamental coordinate.

> 🔍 **Going deeper**: RDS Multi-AZ's "synchronous replication" is precisely **physical, block-level replication**, not logical replication (binlog-based, SQL statement/row level) like MySQL. It mirrors disk blocks below the storage engine directly (similar to DRBD — Distributed Replicated Block Device). So Standby is byte-for-byte identical to Primary, which is why Standby cannot run reads — it's not "a readable replica," but "a shadow disk acting independently." Read Replicas, by contrast, use **logical asynchronous replication** (binlog/WAL) and run their own query engine, accepting reads. This physical-vs-logical distinction is the real answer to "why can't Multi-AZ Standby read but Read Replica can?"

## RDS Multi-AZ — Synchronous Mirror and Automatic Failover

Traditional RDS Multi-AZ places one Primary and one Standby in different AZs. All writes happen at Primary and sync to Standby. Standby receives no traffic in normal times — neither reads nor writes. Backups and OS patches run on Standby to spare Primary's I/O burden.

Failover is detected and executed automatically by RDS. Triggers include Primary failure, AZ failure, instance type change, OS patching. The key: **the endpoint (DNS name) persists** — RDS changes the IP that the DNS record points to the new Primary (promoted old Standby). Clients reconnect to the same hostname. This process normally takes 60–120 seconds.

> ⚠️ **Pitfall**: Even if failover is fast, if the client's **DNS cache TTL is long**, recovery feels slow. If the application or JVM caches DNS results indefinitely (infamous Java `networkaddress.cache.ttl=-1` infinite cache), even after the endpoint IP changes, clients keep connecting to the dead old IP. That's why RDS endpoints run with short TTLs, and application-side DNS caches must also be short. In exams, the answer to "failover completed but app still connects to old node" is almost always "DNS cache TTL" or "connection pool reusing dead connections."

## RDS Multi-AZ DB Cluster — 2-Copy to 3-Copy Semi-Sync

In 2022, AWS released **Multi-AZ DB Cluster**, a variant. Structure differs — 1 Writer + 2 Readable Standby across 3 AZs. Both Standby can **accept reads**, and replication is **semi-synchronous**: commit when *at least one* of the two Standbys acknowledges, not both. Semi-sync is faster than full sync (wait for both), safer than async (wait for no one).

The payoff is failover speed — **under 35 seconds** versus traditional Multi-AZ's 60–120s. Already-running Readable Standby candidates await promotion without boot time.

> 💡 **Related theory**: Semi-synchronous replication's "acknowledge on one of two" embodies **quorum** thinking. In distributed systems, quorum means "majority consensus," a core technique to achieve both availability and consistency. If write quorum (W) and read quorum (R) satisfy `W + R > N` (total replicas), any read will encounter at least one replica with the latest write, guaranteeing strong consistency (Dynamo paper, 2007). Semi-sync Multi-AZ DB Cluster simplifies this insight for managed RDS; the full quorum storage story begins with Aurora next.

## Aurora — Push Replication Down to Storage Layer

Aurora is AWS's product but opposite philosophy from RDS. Traditional databases "compute owns replication" — Primary sends data to Standby. Aurora inverts this. **It pushes replication down to the storage layer.** Aurora compute nodes (Writer/Reader) have no local disk. Instead, all share one **cluster volume**, which stores data in 6 copies across 3 AZs.

```
Aurora Cluster
   ├─ Writer Node (1)              ← Write-only
   ├─ Reader Nodes (0-15)          ← Read-distributed, share cluster volume with Writer
   └─ Cluster Volume (Shared Storage)
        6 copies / 3 AZ (2 per AZ)
        4/6 write quorum, 3/6 read quorum
```

The key: quorum numbers. Writes succeed when 6 replicas confirm 4 (4/6 write quorum); reads need only 3 (3/6 read quorum). Since `W(4) + R(3) = 7 > N(6)`, quorum intersection is guaranteed — any read includes the latest write.

Why this 6/3/2 design emerged is the heart of the Aurora paper (Verbitski et al., SIGMOD 2017 *"Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"*). If one AZ dies entirely (2 copies lost), the remaining 4 copies satisfy the 4/6 write quorum; still writable. If that AZ stays dead and one more copy fails (3 total lost), the remaining 3 copies satisfy the 3/6 read quorum — still readable. This is **"AZ+1" fault model** — an entire AZ failure plus an extra disk failure leaves no data loss.

> 🔍 **Going deeper**: Why traditional DB replication is slow: **full-page writes** over network. MySQL writes double-write buffer, binlog, redo log, data pages to both disk and replicas (write amplification). Aurora's insight: "**the log is the database**" — Writer sends not full data pages but **only redo log records** to storage. Heavy page materialization is done asynchronously in the background by storage nodes. Network write traffic shrinks by orders of magnitude, achieving higher throughput on same hardware vs. traditional MySQL. This is why "Aurora is MySQL/PostgreSQL compatible but faster" — same query engine, but storage/replication layer completely rewritten.

> 📚 **Case study**: Netflix suffered a 2008 single-datacenter storage corruption causing DVD shipment shutdown for three days, sparking company-wide commitment to "eliminate single points of failure, embrace cloud-distributed storage" (precursor to Chaos Monkey). Aurora's 6-copy/3-AZ design products exactly this lesson — "assume storage always partially fails; design quorum to survive" — into managed service. Lesson: HA is not "prevent failures"; it's "design quorum to continue despite failures."

## Aurora Failover and Added Features

When Aurora Writer dies, one of the live Readers promotes to Writer based on tier priority. Since storage is shared, no data copy needed — **failover under 30 seconds** (longer if no Reader exists and new one must boot). **Reader endpoint** is a load-balancing entry point across all Readers; **Writer endpoint** always points to current Writer.

| Feature | Core | Remark |
|---------|------|--------|
| **Backtrack** (MySQL) | Rewind cluster to specific point-in-time | Without S3 backup, up to 72-hour window, in-place |
| **Cluster Volume auto-expand** | Auto-scale to 128TB in 10GB increments | No pre-provisioning needed |
| **Aurora Serverless v2** | Scale 0.5 ACU units continuously | Auto-adjust with traffic |
| **Global Database** | 1 Primary + up to 5 Secondary regions | Async <1s lag (Day 2) |

> ⚠️ **Pitfall**: Backtrack differs from backup (snapshot restore). Backtrack **rewinds the cluster in-place to past time** (no new cluster created), works only for MySQL-compatible, and rewinds only changes after activation. "Oops, DELETE — rewind 5 minutes" = Backtrack (fast), but "restore one deleted table" or "state 30 days ago" = PITR (point-in-time recovery, snapshot+logs). Mixing them is an exam trap.

## RDS Proxy — Hide Failover from Client

Even 30-second failover can cause hundreds of app connections to drop and simultaneously attempt reconnect, overwhelming new Primary (connection storm). **RDS Proxy** is a managed proxy placing a connection pool between client and DB. Clients connect to Proxy; Proxy pools and reuses DB connections.

During failover, client-Proxy connection persists; Proxy internally switches routing to new Primary. Client sees almost no disconnection. Additional benefits: IAM auth integration, Secrets Manager tie-in, and mitigating connection spikes from serverless (Lambda).

> 💡 **Related theory**: RDS Proxy's connection pooling is no new invention — decades old pattern. Java's HikariCP/c3p0, PgBouncer (PostgreSQL connection pooler) do the same. DB connections are expensive resources consuming memory and processes (PostgreSQL spawns one process per connection), so "new connection per request" is an anti-pattern. Pooling is the **object pool** pattern reused. Thousands of concurrent Lambda invocations each opening connections would exhaust DB's `max_connections` instantly; RDS Proxy multiplexes these connections to prevent it. That's why RDS Proxy is quasi-mandatory for serverless+RDS.

## ElastiCache Redis — Cache High Availability

ElastiCache for Redis (now including Valkey) HA operates at **replication group** level. One Primary and 0-5 Replicas form a group; Primary dies, one Replica auto-promotes (Multi-AZ required).

- **Cluster Mode Disabled**: Single shard (1 Primary + max 5 Replica). Entire dataset fits in one node; Replicas for read distribution and HA. Use when dataset fits in single-node memory.
- **Cluster Mode Enabled**: Multiple shards (up to 500) **partition** data, each shard owns Primary+Replica. Use when data exceeds single-node memory or write scale-out needed.

> 🔍 **Going deeper**: Cluster Mode Enabled's sharding uses **hash slot** method, cousin to consistent hashing. Redis Cluster divides keyspace into 16,384 slots (`CRC16(key) mod 16384`), assigns each slot to shard. Adding/removing shard only rehashes those slots, avoiding naive modulo's disaster (hash mod N, change N → nearly all keys move). Consistent hashing's core value — "minimize moved keys when node count changes" — is exactly here. ElastiCache performs slot redistribution online (zero-downtime), called resharding.

## Failover RTO At a Glance — What Determines Time?

| Config | RTO | RTO Determined By |
|--------|-----|-------------------|
| RDS Single-AZ | Manual (min-hours) | Human restores snapshot |
| RDS Multi-AZ | 60–120s | Standby promotion + DNS flip |
| RDS Multi-AZ DB Cluster | <35s | Pre-running Readable Standby promotion |
| Aurora (single region) | <30s | Shared storage, no copy needed; Reader promote |
| Aurora Global (region failover) | <1min | Secondary promote to standalone (Day 2) |
| ElastiCache Redis Multi-AZ | <60s | Replica promotion |
| DynamoDB | ~0 | Inherently distributed, no single-node concept |

One principle threads the table: **"Faster RTO: shorter promotion candidate exists, no data copy needed."** Aurora's 30s comes from shared storage (new Writer needs no data); Multi-AZ DB Cluster beats traditional Multi-AZ because Standby already runs reads. 

## Wrapping Up

Today we covered four things. First, **replication is an RPO-latency tradeoff between sync and async**, positioned on CAP/PACELC's fundamental coordinate. Second, **RDS Multi-AZ is block-level synchronous mirror** (Standby cannot read); **Read Replica is logical asynchronous** (reads OK, separate endpoint) — difference stems from physical vs. logical replication. Third, **Aurora pushes replication to storage**: 6-copy/3-AZ quorum (4/6 write, 3/6 read, "AZ+1" fault model) and "log-is-database" design surpass traditional databases. Fourth, **RTO determined by promotion candidate existence and data-copy necessity**; RDS Proxy hides failover from client via connection pooling.

Next article extends HA **beyond single region to multi-region** — Route 53 routing, Aurora Global, DynamoDB Global Tables, KMS Multi-Region Keys.

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
