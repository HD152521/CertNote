# Day 3 - RDS Multi-AZ vs Read Replica: Choosing Between Synchronous and Asynchronous

Database availability ultimately reduces to one physical law: **light is not infinitely fast.** Between Seoul and Virginia, the round trip via fiber-optic is roughly 180ms—not something AWS can shorten with money, but a hard limit set by light speed. If a database "waits for replication to replicas before completing writes" (synchronous), every transaction slows by this round-trip time. If it "doesn't wait" (asynchronous), it's fast but replicas lag. All difference between RDS Multi-AZ and Read Replica stems from this synchronous/asynchronous choice.

The reason this is exam's most-missed topic is that both appear superficially similar—both look like "placing another DB somewhere." But Multi-AZ is **synchronous replication standby for availability**, while Read Replica is **asynchronous replicated worker for read scale-out**. Opposite goals, opposite replication methods, opposite client access. This article explores the physical meaning of sync/async through to how Aurora redesigns this tradeoff.

## Synchronous Replication—Multi-AZ's Price for Never Losing Data

RDS Multi-AZ places a Standby instance in a **different AZ in the same region** and **synchronously** replicates all writes from Primary to Standby. Precise meaning of "synchronous" is critical—when application commits a transaction, Primary writes the change to its disk **and simultaneously** sends to Standby, **not completing the commit as successful until Standby acknowledges "received and written to disk."** So the instant client gets "commit success," that data is already safely on disk in two AZs.

Why matters: even if Primary completely fails, Standby has every commit up to the last—**zero data loss (RPO = 0)**. RDS detects Primary failure and auto-promotes Standby to new Primary, **switching the DNS endpoint to the new Primary.** Application keeps using the same endpoint; only the instance behind changes—failover completes typically in 60~120 seconds.

Synchronous replication's cost is **write latency**. All commits wait for inter-AZ round trips (typically 1~2ms within same region, small), slowing slightly. That's why Multi-AZ operates **only within same region**—cross-region sync replication would add 180ms to every commit, essentially paralyzing the DB. **That's why Multi-AZ isn't DR.** It survives single-AZ failure within region but not region-wide outage (rare but happens). Region-level DR falls to Cross-Region Read Replica or Aurora Global Database.

> 💡 **Related Theory**: Sync replication and zero data loss (RPO=0) directly tie to distributed systems' **CAP Theorem**. CAP says during network partition, you can't perfectly achieve both Consistency and Availability. Multi-AZ sync replication chooses Consistency—waits for Standby ack so both AZs always have same data, but that ack-waiting delays writes. Read Replica's async replication chooses Availability/Performance—no ack-wait so it's fast but replicas lag (replication lag). "Must never lose data (sync)" vs "slight lag is OK if fast (async)" is the practical translation of Consistency vs Availability.

> 🔍 **Deeper Dive**: Regular RDS Multi-AZ (Primary+Standby) Standby is inaccessible to clients—pure standby so can't even read. But **Multi-AZ DB Cluster** (MySQL/PostgreSQL only) differs. 1 Primary + 2 Readers in 3-node structure, two Readers receive near-sync replication **and handle read traffic**, with failover under 35 seconds. So Multi-AZ DB Cluster gives "HA + light read scale-out" together. Confusing regular Multi-AZ Instance (Standby unreachable) with Multi-AZ DB Cluster (Readers reachable) causes exam traps—"Multi-AZ but read-scaled?" is true only in DB Cluster config.

## Asynchronous Replication—Why Read Replica Is Fast but Lags

Read Replica serves opposite purpose. Primary's changes flow **asynchronously** to replicas, which expose via **separate endpoint** to receive read-only traffic. Asynchronous means Primary **doesn't wait for replica ack**—commit completes on Primary disk write, change logs flow lazily afterward to replicas. So Primary write performance barely depends on replica count or distance.

The cost: **replication lag**. Replicas always lag Primary slightly (milliseconds to seconds, more under load). Data just written to Primary might not exist yet on read from replica (read-after-write inconsistency). That's why Read Replicas suit "slight lag OK" reads—analytics, reports, dashboards, search—while "immediate read after write" transaction reads go to Primary.

Read Replica's two powerful uses: First, **Cross-Region Read Replica**—replicas can live in other regions. Async means inter-region 180ms latency doesn't hurt Primary performance (doesn't wait anyway). Second, **promote**—replica becomes independent DB. If Primary's entire region fails, promote replica in different region to new Primary. This is why Cross-Region Read Replica becomes **DR tool**. But promote is manual (or automation-triggered), and promoting breaks replication, making it independent.

| Item | Multi-AZ (Instance) | Read Replica |
|------|---------------------|--------------|
| Purpose | Availability (HA) | Read scale-out + Cross-Region DR |
| Replication | Sync (ack-wait) | Async (no wait) |
| Data Loss (RPO) | 0 | Replication lag possible |
| Client Reads | No (Standby standby) | Yes (separate endpoint) |
| Cross-Region | No (same region only) | Yes |
| Failure Response | Auto failover (60~120s, endpoint persists) | Manual promote (relationship breaks) |
| Write Performance Impact | Slightly slower (AZ round trip) | None |

> ⚠️ **Trap**: Choosing Read Replica for "higher availability" or Multi-AZ for "read distribution" ranks among most common wrong answers. Multi-AZ Standby **can't even read**, so zero read scale-out help. Read Replica async means Primary failure loses last seconds of data, no RPO=0 availability guarantee. Need both? Use together—Multi-AZ for HA, add Read Replica for read spread. Exam keywords: "single AZ failure auto-recover/no data loss" → Multi-AZ; "read performance/report load" → Read Replica; "region failure prep" → Cross-Region RR or Aurora Global DB.

## Aurora—Making Replicas Storage's Job, Not Instances'

RDS replication is per-instance—Primary generates change logs, sends to other instances, receivers replay. Aurora fundamentally inverted this. **Replication happens at storage layer, not instance.** Aurora clusters separate compute (DB instances) from storage; storage is a **shared distributed volume auto-replicated 6-way across 3 AZs**. Writer and Reader both see this **single shared storage**.

This changes much. RDS Read Replica each holds their own copy, must replay logs, so replication lag is large. Aurora Readers **share storage with Writer**, so no log replay needed—see latest data usually within tens of milliseconds. Storage 6-way replicated, so disk damage (self-healing) auto-recovers; 4/6 alive enables reads, 3/6 enables writes—**quorum** model reaching 99.99% availability.

```
Aurora Cluster
├── Cluster Endpoint  (Writer, read/write — always points to current Primary)
├── Reader Endpoint   (load-balance reads across all Readers)
├── Custom Endpoint   (specific instance group — e.g., analysis-only large instances)
└── Instance Endpoint (individual instance direct)

Storage Layer:
   6 copies / 3 AZ (automatic, quorum 4/6 read·3/6 write)
   Continuous backup to S3
   Self-healing (auto-recover damage blocks)
```

Multiple endpoints exist for this architecture. **Cluster Endpoint** always points to current Writer, auto-shifting to new Writer on failover; **Reader Endpoint** distributes reads across all Readers. Application sends writes to Cluster Endpoint, reads to Reader Endpoint—instance adds/removes/failover and it doesn't matter.

> 💡 **Related Theory**: Aurora's quorum replication uses distributed consensus theory's **quorum systems** directly. With N replicas, set write quorum W and read quorum R such that `W + R > N` ensures read and write sets intersect, always reading latest. Aurora sets N=6, W=4, R=3, satisfying `4+3 > 6`—with this margin one AZ (2 replicas) completely dies yet 4 remain to meet write quorum, plus 1 more dies and reads still work. The number 6 is reverse-engineered from goal "survive complete AZ failure + 1 additional replica failure simultaneously." Distributed DBs like Dynamo, Cassandra use identical quorum tuning math.

## Aurora Global Database—Surviving Region Failure in Under 1 Minute

Cross-Region Read Replica provides region DR but with instance-level async replication, large lag and sluggish failover. **Aurora Global Database** solves this via storage-layer replication. With 1 Primary Region + up to 5 Secondary Regions, Primary changes flow via **dedicated replication infra** to Secondary regions' storage. Since storage replicates across regions (not instances), achieves **RPO < 1 second, RTO < 1 minute**.

Secondary regions are read-only, seeing latest data with tens-of-ms lag—providing fast reads to globe-local region users. Whole Primary region fails and **promote** Secondary in under 60 seconds to new Primary. Faster than RDS Cross-Region RR's manual promote, far less data loss.

| Tool | Scope | Replication Unit | RPO/RTO | Main Use |
|------|-------|------------------|---------|----------|
| Multi-AZ | Same-region AZ | Sync, instance | RPO 0 / RTO 1~2min | HA |
| Cross-Region Read Replica | Cross-region | Async, instance | RPO minutes / RTO manual | Read+DR(RDS) |
| Aurora Global Database | Cross-region | Async, storage | RPO<1s / RTO<1min | Global read+DR(Aurora) |

> 📚 **Case Study**: December 2021, major AWS us-east-1 region outage disabled many services. Single-region dependent (Multi-AZ only) workloads went down together, but Aurora Global Database or Cross-Region replica-holders could promote Secondary for recovery. This taught industry "Multi-AZ is for AZ failure, not region failure." us-east-1 is AWS's largest/oldest region with parts of global control plane here, so this region outage caused wide impact multiple times. Omit region-level DR from design and no matter how dense you pack Multi-AZ, you're bound to single region's fate.

## PITR and Backtrack—Two Ways to Rewind Time

Both RDS and Aurora rewind time but differently. **PITR (Point-in-Time Recovery)**, seen Day 2, uses base snapshot + transaction log replay to create **new instance at any past time**. Works within auto-backup retention (1~35 days), doesn't touch original.

Aurora's **Backtrack** is entirely different mechanism. PITR creates new instance; Backtrack **rewinds existing cluster itself to past moment.** Aurora stores change history on storage so "rewind 10 minutes" returns that cluster to past state right there—seconds to minutes, no new instance creation. Beats PITR (new instance, tens minutes) for fast undo of bad deploy or typo query. But rewind erases data after that point.

> 🔍 **Deeper Dive**: Backtrack's speed stems from Aurora's log-centric (log-structured) storage. Aurora doesn't write data pages directly like traditional DB; **sends only redo logs to storage, storage layer constructs pages from logs.** Change history stacks in storage as logs already, so rewind to past point is roughly "move log pointer to that point"—no need to restore/replay data fresh, so very fast. But Backtrack needs pre-activation and target backtrack window set up; costs extra storage for that window. Distinguish PITR (any-point within retention, new instance) from Backtrack (within configured window, same cluster rewind) for exams.

## RDS Proxy—Connection Pool Stopping Connection Storm

Serverless like Lambda meeting RDS triggers unique problem. Lambda's concurrent explosion spins up hundreds to thousands of function instances, **each opening direct DB connection.** DB's max connections tie to instance memory (e.g., db.t3.medium permits hundreds), quickly exceeded; connection setup cost (TCP+TLS+auth) repeats per connection, crushing DB under connection management. This is **Connection Storm**.

**RDS Proxy** solves by placing **connection pool** in front of DB. Lambda connects to Proxy; Proxy maintains actual DB connections as few, reusing (multiplexing). Thousands of Lambda arrive but DB sees connections capped at pool size. Proxy also integrates Secrets Manager for safe credential management and, on Primary failover, quickly routes connections to new Primary, reducing failover time. **Lambda + RDS practically requires RDS Proxy**.

> ⚠️ **Trap**: "Solve Connection Storm by upsizing DB instance" scores wrong. Bigger instance raises max connections but Lambda scale far outpaces, not root fix and costs more. Plus per-request connection setup overhead is independent of instance size. Answer is **pool and reuse** connections with RDS Proxy. Exam question "Lambda simultaneous thousands call RDS → connection limit exceed" almost always answers RDS Proxy.

## Wrapping Up

All RDS availability tools diverge along one axis: sync vs async. Multi-AZ gets RPO=0 availability via sync replication at cost of same-region-only and Standby read-unable. Read Replica gets fast read scale and Cross-Region DR via async at cost of replication lag. Aurora pushes replication to storage layer, easing both tradeoffs; Global Database does region DR in 1 minute.

Five key takeaways for operators: ① Multi-AZ = HA (sync, RPO 0, same region, Standby no-read, auto failover). ② Read Replica = read scale (async, separate endpoint, Cross-Region yes, promote for DR). ③ Region DR = Cross-Region RR or Aurora Global DB (RPO<1s, RTO<1min). ④ Aurora splits compute/storage + 6-way/3AZ quorum; Reader shares storage so lag small. ⑤ Lambda + RDS needs RDS Proxy to stop Connection Storm—upsizing is wrong.

In the next article, we'll transcend databases, exploring S3 Replication, Storage Gateway, and Elastic Disaster Recovery that replicate/failover files, objects, and on-premises workloads across regions and to AWS.

---

## 📝 연습 문제

**문제 1.** "단일 AZ 장애에서 데이터 손실 없이 자동 복구"가 목표다. 어떤 RDS 기능이 정확한가?

A) Read Replica 추가
B) Multi-AZ — 다른 AZ의 Standby에 동기 복제, 자동 페일오버(60~120초), RPO 0
C) Manual Snapshot 주기 생성
D) Cross-Region Read Replica

**정답: B**

해설: Multi-AZ는 같은 리전 다른 AZ의 Standby에 모든 커밋을 동기 복제하고 Standby의 ack를 받은 뒤에야 커밋을 완료하므로, Primary가 죽어도 마지막 커밋까지 Standby에 있어 데이터 손실(RPO)이 0이다. 장애 감지 시 자동으로 Standby를 승격하고 endpoint를 전환한다. Read Replica(A)는 비동기라 지연만큼 손실 가능하고 읽기 확장용이며, Cross-Region RR(D)은 리전 DR용으로 수동 promote다.

---

**문제 2.** 운영 중 DB 읽기 부하(분석·리포트)가 폭증한다. 비용 효율적으로 읽기를 분산하려면?

A) DB 인스턴스 크기를 키운다
B) Read Replica를 추가하고 별도 endpoint로 읽기 트래픽을 분산한다
C) Multi-AZ를 활성화한다
D) Manual Snapshot을 더 자주 만든다

**정답: B**

해설: Read Replica는 비동기 복제로 읽기 전용 사본을 만들고 별도 endpoint로 노출해 읽기 부하를 분산하는 정확한 도구다. Multi-AZ(C)의 Standby는 클라이언트가 읽기조차 보낼 수 없어 읽기 분산에 전혀 도움이 안 된다. 인스턴스 크기 키우기(A)는 비용이 크고 읽기/쓰기를 분리하지 못한다. 분석·리포트처럼 약간의 복제 지연을 견디는 읽기에 Read Replica가 적합하다.

---

**문제 3.** Multi-AZ를 켰는데도 us-east-1 리전 전체 장애 때 DB가 함께 멈췄다. 리전 단위 장애까지 견디려면 무엇이 필요한가?

A) Multi-AZ를 두 번 적용
B) Cross-Region Read Replica 또는 Aurora Global Database로 다른 리전에 사본을 두고 장애 시 promote
C) 더 큰 인스턴스 타입
D) Manual Snapshot

**정답: B**

해설: Multi-AZ는 같은 리전 내 AZ 장애만 견딘다 — 동기 복제라 리전을 넘으면 지연이 커져 같은 리전에만 둔다. 리전 전체 장애에 대비하려면 다른 리전에 비동기 복제 사본(Cross-Region Read Replica)이나 Aurora Global Database를 두고, Primary 리전 장애 시 Secondary를 promote해야 한다. Aurora Global DB는 RPO<1초, RTO<1분으로 가장 빠른 리전 DR을 제공한다.

---

**문제 4.** 글로벌 사용자(아시아·미국·유럽)에게 가까운 리전에서 빠른 읽기를 제공하면서 리전 단위 DR도 필요하다. 가장 적합한 도구는?

A) RDS Multi-AZ
B) Aurora Global Database — 1 Primary + 최대 5 Secondary 리전, 스토리지 계층 복제로 RPO<1초·RTO<1분
C) 단일 리전 Read Replica 여러 개
D) DynamoDB Multi-AZ

**정답: B**

해설: Aurora Global Database는 Primary 리전의 변경을 전용 인프라로 최대 5개 Secondary 리전 스토리지에 복제해, 각 지역 사용자에게 가까운 리전에서 수십 ms 지연으로 읽기를 제공하고 동시에 리전 DR(promote 60초 이내)을 제공한다. 스토리지 계층 복제라 인스턴스 단위 복제(RDS Cross-Region RR)보다 지연과 RTO가 작다. 글로벌 읽기 + 리전 DR의 표준 답이다.

---

**문제 5.** Lambda 함수가 트래픽 폭증 시 RDS에 동시 수천 개 커넥션을 열어 DB 최대 커넥션 한도를 초과한다. 근본 해결책은?

A) RDS 인스턴스를 더 큰 타입으로 변경
B) RDS Proxy — DB 앞에 커넥션 풀을 두고 소수의 실제 커넥션을 재사용(multiplexing)
C) Multi-AZ 활성화
D) Read Replica 추가

**정답: B**

해설: Lambda는 동시 요청에 따라 함수 인스턴스가 수천 개로 폭증하고 각자 DB에 직접 커넥션을 열어 Connection Storm을 일으킨다. RDS Proxy는 DB 앞에 커넥션 풀을 둬 수천 Lambda가 와도 DB가 보는 실제 커넥션을 풀 크기로 제한하고 재사용한다. 인스턴스 키우기(A)는 Lambda 스케일을 따라잡지 못하고 커넥션 생성 오버헤드도 남아 근본 해결이 아니다. Lambda+RDS는 RDS Proxy가 사실상 필수다.

---

**문제 6.** Aurora 클러스터에서 잘못된 마이그레이션을 10분 전 상태로 가장 빠르게 되돌리려 한다. 새 인스턴스 생성 없이 같은 클러스터를 되감을 수 있는 기능은?

A) PITR(Point-in-Time Recovery)
B) Aurora Backtrack — 같은 클러스터를 설정한 윈도우 내 과거 시점으로 되감기(rewind)
C) Read Replica promote
D) Manual Snapshot 복원

**정답: B**

해설: PITR(A)은 베이스 스냅샷+로그 재생으로 임의 시점의 새 인스턴스를 만들어 수십 분이 걸린다. Aurora Backtrack은 로그 중심 스토리지 구조를 이용해 기존 클러스터 자체를 과거 시점으로 되감아 수 초~수 분 만에 끝난다. 단 Backtrack은 미리 활성화하고 되감기 윈도우를 설정해 둬야 하며, 되감으면 그 시점 이후 데이터는 사라진다. 빠른 무르기에는 Backtrack, 임의 시점의 별도 복원에는 PITR이다.

---

**문제 7.** Multi-AZ 구성인데 "읽기 부하도 분산하고 싶다"는 요구가 추가됐다. MySQL/PostgreSQL 환경에서 HA와 읽기 분산을 동시에 얻는 RDS 구성은?

A) 일반 Multi-AZ Instance만으로 충분하다
B) Multi-AZ DB Cluster — Primary 1 + Reader 2 구조로 Reader가 읽기 트래픽을 처리하고 페일오버도 35초 이하
C) Cross-Region Read Replica만 추가
D) Snapshot을 더 자주 생성

**정답: B**

해설: 일반 Multi-AZ Instance(A)의 Standby는 클라이언트 접근 불가라 읽기 분산이 안 된다. Multi-AZ DB Cluster는 Primary 1개 + Reader 2개의 3노드 구조로, 두 Reader가 읽기 트래픽을 처리해 HA와 읽기 분산을 동시에 제공하고 페일오버도 35초 이하로 더 빠르다(MySQL/PostgreSQL 전용). 일반 Multi-AZ에 Read Replica를 별도로 붙여도 되지만, DB Cluster는 이를 하나의 구성으로 통합한 것이다.

---
