# Day 1 - Multi-AZ High Availability: The Distributed Principles Behind Replication Consistency, Quorum, and Failover

When you look seriously at database availability, you always come back to one question: "The data I just committed—if a server dies, I don't want to lose it. Someone has to hold a copy of that data. When, how many copies, and where should they be?" The answers diverge at a critical juncture: synchronous vs. asynchronous replication? Single AZ or multi-AZ? 2-copy or 6-copy quorum? AWS's RDS Multi-AZ, Aurora, and ElastiCache look like simple "high availability with a checkbox" options, but underneath lie distributed systems theory accumulated since the 1970s—replication, consensus, quorum, CAP. Today we unpack what tradeoffs these checkboxes hide, why Aurora chose a fundamentally different storage design than traditional replication, and where failover time (RTO) comes from.

In DOP-C02 exams, Multi-AZ appears repeatedly as the foundation of "operational excellence and resilience," surfacing in scenarios like "reduce this DB's RTO from 60 to 30 seconds," "balance read traffic while guaranteeing HA," or "prevent application connections from dropping during failover." Once you see which choice touches synchronous/asynchronous, quorum, or endpoint, the answer emerges.

## Why Replication Is Hard—The Fundamental Tension Between Sync and Async

Replication's essence is simple: hold the same data in multiple places. But everything hinges on *when* you respond to the client that "the write is done." **Synchronous replication** confirms the commit only after all (or a quorum of) replicas acknowledge they've written to disk. **Asynchronous replication** has the primary node write to its own disk, respond immediately, then propagate to replicas in the background.

This difference directly determines RPO (Recovery Point Objective—how much data can you lose). Synchronous replication aims for RPO=0—if the primary dies, the standby already holds the same data. The cost: every commit waits one more network round-trip, increasing write latency. Asynchronous replication is fast, but the moment the primary fails, any uncommitted transaction vanishes forever (RPO > 0).

> 💡 **Related Theory**: This tension is captured in distributed systems theory by the **CAP Theorem** (Eric Brewer, 2000 PODC keynote; formally proved by Gilbert & Lynch, 2002) and its refinement **PACELC** (Daniel Abadi, 2012). CAP says: "During a network partition, you must choose between Consistency and Availability." PACELC adds a line: "Else (no partition), you must choose between Latency and Consistency." RDS Multi-AZ's synchronous replication is PC/EC on PACELC (consistency-first, tolerating latency). DynamoDB Global Tables' async is PA/EL (availability/latency-first, sacrificing some consistency). That "one checkbox" is actually choosing coordinates on this fundamental map.

> 🔍 **Deeper**: RDS Multi-AZ's "synchronous replication" is precisely **physical/block-level replication**—not MySQL's logical replication (binlog-based, at SQL/row granularity), but raw mirroring of disk blocks below the storage engine (similar to DRBD—Distributed Replicated Block Device). That's why the Standby is byte-for-byte identical to the Primary, and why you can't do normal reads on Standby—it's not an independent query engine but a "shadow disk." Read Replicas, by contrast, use binlog/WAL-based **logical asynchronous replication**, so they have their own query engine and can serve reads. This physical/logical distinction is the real answer to "why no reads on Multi-AZ Standby but yes on Read Replica?"

## RDS Multi-AZ—Synchronous Mirror and Automatic Failover

Traditional RDS Multi-AZ places one Primary and one Standby in different AZs. All writes happen at the Primary and are synchronously mirrored to Standby. The Standby sits idle during normal operations—no reads, no writes. Backups and OS patches run against the Standby to avoid I/O burden on the Primary.

Failover is automatic. Triggers include Primary failure, AZ outage, instance type change, OS patching, etc. The key point: **the endpoint (DNS name) stays the same**. RDS changes the IP that the DNS record points to, directing it to the new Primary (the promoted Standby). The application just reconnects to the same hostname. This usually takes 60–120 seconds.

> ⚠️ **Pitfall**: Even if failover is fast, a long **client DNS cache TTL** can make recovery feel slow. If your application or JVM caches DNS for a long time (Java's infamous `networkaddress.cache.ttl=-1` infinite cache), the old IP stays cached and connection attempts fail even though the endpoint IP changed. That's why RDS endpoints run with short TTLs, and you must also shorten application-side DNS caching. The answer to "failover finished but my app still connects to the old node" is almost always "DNS cache TTL" or "connection pool reusing dead connections."

## RDS Multi-AZ DB Cluster—2-Copy to 3-Copy Semi-Synchronous

In 2022, AWS introduced **Multi-AZ DB Cluster**, a different architecture: 1 Writer + 2 Readable Standbys across 3 AZs. Both Standbys can **serve reads**, and replication is **semi-synchronous**. Semi-sync means: "commit once at least one of the two Standbys confirms," a middle ground between full synchronous (wait for both) and full async (wait for none).

The payoff: failover speed drops to **under 35 seconds** (vs. 60–120 for traditional Multi-AZ). The Readable Standbys are already running, so they don't need boot time.

> 💡 **Related Theory**: Semi-synchronous replication's "commit once one standby confirms" is a simple form of **quorum** reasoning. In distributed systems, quorum is the technique of "proceed once a majority (not all) agrees," a core tool for balancing availability and consistency. If write quorum (W) and read quorum (R) satisfy `W + R > N` (N = total replicas), then every read touches at least one replica that saw the latest write, guaranteeing strong consistency (Dynamo paper, 2007). Semi-sync Multi-AZ DB Cluster simplifies this into managed RDS; the real quorum-driven storage appears next: Aurora.

## Aurora—Pushing Replication Into the Storage Layer

Aurora is an AWS product but operates on the opposite philosophy from RDS. Traditional DBs say: "The compute node owns replication"—the Primary sends data to the Standby. Aurora inverts this. **It decouples replication from compute and sinks it into the storage layer.** Aurora's compute nodes (Writer/Reader) have no local disk. Instead, they all share one **cluster volume**, which stores data in 6 replicas across 3 AZs.

```
Aurora Cluster
   ├─ Writer Node (1)              ← Handles all writes
   ├─ Reader Nodes (0-15)          ← Distribute reads, share cluster volume with Writer
   └─ Cluster Volume (shared storage)
        6 copies / 3 AZs (2 per AZ)
        4/6 write quorum, 3/6 read quorum
```

The crux is the quorum numbers. Writes succeed once **4 out of 6** copies confirm (4/6 write quorum); reads need just **3 out of 6** (3/6 read quorum). Since `W(4) + R(3) = 7 > N(6)`, the quorum intersection is guaranteed—every read touches at least one copy with the latest write.

This 6/3/2 design is explained in the Aurora paper (Verbitski et al., SIGMOD 2017 *"Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"*). Even if one entire AZ dies (losing 2 copies), the remaining 4 can still satisfy the 4/6 write quorum. If that same AZ loses another copy in addition (3 total lost), you can still read with the remaining 3 (3/6 quorum). This is the **"AZ+1" fault model**—tolerate an entire AZ failure *plus* one additional disk failure without data loss.

> 🔍 **Deeper**: Traditional DB replication is slow because it sends **full pages** over the network. MySQL must write the double-write buffer, binlog, redo log, and data pages to both disk and replicas (write amplification). Aurora's breakthrough is the insight: **"the log IS the database."** The Writer sends only **redo log records**, not entire changed pages, to storage. The storage nodes reconstruct pages asynchronously in the background. Network writes shrink by orders of magnitude, and throughput on identical hardware beats traditional MySQL many times over. This is the real answer to "why is Aurora faster than MySQL/PostgreSQL even though the query engine is the same?"—the storage and replication layer were completely rewritten.

> 📚 **Case Study**: Netflix suffered a storage corruption failure in a single data center in 2008, stopping DVD shipments for three days. This prompted the strategic decision: "eliminate single points of failure; move to cloud-distributed storage." (This also seeded Chaos Monkey.) Aurora's 6-copy/3-AZ design is exactly that lesson commercialized—"assume storage fails partially; design with quorum to survive." The principle: availability isn't avoiding failures; it's designing to keep running when failures happen.

## Aurora Failover and Features

When Aurora's Writer dies, a Reader (chosen by promotion tier) becomes the new Writer. Since storage is shared, no data copy is needed—**failover completes in under 30 seconds** (longer if no Reader exists and one must be launched). The **Reader endpoint** load-balances across all Readers; the **Writer endpoint** always points to the current Writer.

| Feature | Core | Note |
|---------|------|------|
| **Backtrack** (MySQL) | Rewind cluster to a specific point in time | No S3 backup needed; up to 72-hour window; in-place |
| **Auto-expanding cluster volume** | Auto-grow in 10GB increments, up to 128TB | No pre-provisioning |
| **Aurora Serverless v2** | Seamless scaling in 0.5 ACU units | Auto-scale with traffic |
| **Global Database** | 1 Primary + up to 5 Secondary regions | Async <1 second lag (Day 2) |

> ⚠️ **Pitfall**: Backtrack ≠ backup. Backtrack **rewinds the cluster in place** (no new cluster created) and works only for MySQL, recovering only changes since activation. "Oops, I DELETE'd everything 5 minutes ago → rewind 5 minutes" is Backtrack's strength. But "restore only a specific table" or "recover to 30 days ago" needs PITR (Point-In-Time Recovery via snapshots+logs). Confusing the two is a test trap.

## RDS Proxy—Hiding Failover From Clients

Even a 30-second failover can be catastrophic if hundreds of application connections all drop and immediately reconnect to the new Primary, triggering a connection storm that crashes it again. **RDS Proxy** is a managed proxy placing a connection pool between client and database. Clients connect to the Proxy; the Proxy pools and reuses connections to the DB.

When failover occurs, client-to-Proxy connections stay alive while the Proxy internally reroutes to the new Primary. Clients see almost no interruption. It also integrates IAM auth, Secrets Manager, and lightens connection storms from serverless (Lambda).

> 💡 **Related Theory**: RDS Proxy's connection pooling is not new—Java's HikariCP/c3p0, PostgreSQL's PgBouncer have done this for decades. DB connections are expensive (memory/process—PostgreSQL spawns a process per connection), so "new connection per request" is an anti-pattern. Pooling is the **object pool pattern**—pre-create expensive objects and reuse them. Serverless Lambda spawning thousands of concurrent executions, each opening its own connection, can exhaust the DB's `max_connections` instantly. RDS Proxy multiplexes connections between them, preventing this. Serverless+RDS combinations essentially require RDS Proxy.

## ElastiCache Redis—Cache High Availability

ElastiCache for Redis (now including Valkey) handles HA at the **replication group** level: one Primary + 0–5 Replicas form a group; if the Primary dies, one Replica auto-promotes (Multi-AZ must be enabled).

- **Cluster Mode Disabled**: Single shard (1 Primary + up to 5 Replicas). All data fits in one node; Replicas handle read distribution and HA. Use when your dataset fits in a single node's memory.
- **Cluster Mode Enabled**: Multiple shards (up to 500) **partition data** (sharding), each shard holding its own Primary+Replica. Use when data exceeds one node's memory or you need to horizontally scale writes.

> 🔍 **Deeper**: Cluster Mode Enabled's sharding uses the **hash slot** scheme, cousin to consistent hashing. Redis Cluster divides key space into 16,384 slots (`CRC16(key) mod 16384`), assigning each slot to a shard. Adding/removing shards only migrates slots, avoiding naive modulo's disaster (where almost every key moves when N changes). This is consistent hashing's core value—minimize key movement when node count changes. ElastiCache performs slot redistribution online (no downtime) in its resharding feature.

## Failover RTO at a Glance—What Determines the Time?

| Configuration | RTO | RTO Factor |
|--------|-----|---------------------|
| RDS Single-AZ | Manual (minutes–hours) | Human-initiated snapshot restore |
| RDS Multi-AZ | 60–120 seconds | Standby promotion + DNS switch |
| RDS Multi-AZ DB Cluster | <35 seconds | Readable Standby already running, promotes |
| Aurora (single region) | <30 seconds | Shared storage—no copy needed; Reader promotion |
| Aurora Global (region failover) | <1 minute | Secondary promoted standalone (Day 2) |
| ElastiCache Redis Multi-AZ | <60 seconds | Replica promotion |
| DynamoDB | ~0 | Inherently distributed; no single node concept |

The principle cuts through all rows: **"The faster the failover candidate is already running and the less data copy is needed, the shorter the RTO."** Aurora is fast (30s) because storage is shared—the new Writer needs no data fetch. Multi-AZ DB Cluster beats traditional Multi-AZ because Standbys are already running, serving reads.

## Closing Thoughts

We've seen four pictures today. First, **replication is a tradeoff between synchronous/asynchronous and RPO/latency**, plotted on the fundamental CAP/PACELC coordinates of distributed systems. Second, **RDS Multi-AZ is block-level synchronous mirroring** (Standby read-only) and **Read Replica is logical asynchronous replication** (can read, separate endpoint)—their behavioral difference stems from physical vs. logical replication. Third, **Aurora decouples replication to storage, using 6-copy/3-AZ quorum** (4/6 write, 3/6 read) and "the log is the database," outpacing traditional DBs. Fourth, **RTO is determined by failover candidate availability and whether data must be copied**; RDS Proxy hides failover via connection pooling.

Next, we expand this high availability across multiple regions—Route 53 routing, Aurora Global, DynamoDB Global Tables, and KMS Multi-Region Keys.

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
