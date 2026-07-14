# Day 2 - Multi-Region Resilience: Distributed Principles of DNS Routing, Global Replication, and Encryption Boundaries

Within a single region using multiple AZs, you survive a burning data center. But what if an entire region—say us-east-1—fails? The major us-east-1 S3 outage in 2017, the us-east-1 Kinesis/API failures in 2021—these happen rarely but really. Multi-region architecture answers the "entire region disappears" scenario. Yet the moment you cross regions, physics intrudes: the speed of light. Round-trip latency between Seoul and Virginia exceeds 200ms, making synchronous replication (possible in single-region millisecond timescales) essentially impossible across regions. So all multi-region design reduces to: "Accept asynchronous replication and decide how you'll handle the resulting data inconsistency."

Today we examine four pillars underpinning multi-region—**Route 53 routing** (deciding which region to send traffic to, and the DNS/health check mechanics underneath), **Aurora Global / DynamoDB Global Tables / S3 CRR** (replicating data across regions), and **KMS Multi-Region Key** (bridging encryption boundaries. Multi-region appears in DOP exams as "automatic failover on region failure," "lowest latency to global users," "decrypt replicated encrypted data across regions." The skill is reading whether each choice implies active-active or active-passive, sync or async.

## How DNS Decides Routing—Inside Route 53

Route 53 is not a simple DNS server but a **global traffic director combining health checks and policies**. When a user queries `api.example.com`, Route 53 dynamically decides which IP/endpoint to return based on configured routing policy. Two mechanisms sit underneath: DNS itself (name→address translation) and health checks (periodic verification that endpoints are alive).

| Policy | Decision Basis | Typical Use |
|--------|--------|-----------|
| **Simple** | Return single record | No failover, simple mapping |
| **Weighted** | Distribute by weight ratio | Canary deployments, A/B testing |
| **Latency** | Lowest-latency region to user | Global performance optimization |
| **Failover** | Primary, Secondary on failure | Active-Passive DR |
| **Geolocation** | User's country/continent | Data sovereignty, regional content |
| **Geoproximity** | Geography + bias tuning (Traffic Flow required) | Fine-tuned traffic control |
| **Multi-Value Answer** | Return multiple IPs passing health check | Simple client-side distribution |
| **IP-based** (2023+) | Map user IP blocks | ISP/CDN optimization |

> 💡 **Related Theory**: Route 53 routing is fundamentally **DNS-based Global Server Load Balancing (GSLB)**. DNS, defined in RFC 1034/1035 (1987), is a distributed hierarchical database originally for static name resolution. GSLB adds: "dynamically change responses based on client location and server health." Yet DNS routing has a fundamental limit: **DNS is cached.** Resolvers, the OS, and browsers cache responses for the TTL duration, so even if failover is signaled, the old answer lives on until the cache expires. This is why Latency/Failover routing's failover is not "instant." For instant region-switch, the answer is not DNS but **Global Accelerator using fixed anycast IPs** (compared below).

> 🔍 **Deeper**: Route 53's health checks are not simple pings but **simultaneous checks from multiple global locations (checkers), judged by quorum**—relying on a single checker could misinterpret temporary network glitches as failures, so at least 18% of checkers must report healthy for the check to be deemed healthy (global consensus prevents false positives). Three types exist: **Endpoint** checks (HTTP/HTTPS/TCP direct probe), **Calculated** checks (combine multiple checks with AND/OR—"database AND cache both alive for healthy"), and **CloudWatch Alarm-based** checks (convert metric alarms to health—for resources you can't probe directly or for composite metrics). This mix can catch "endpoint returns 200 but is actually broken."

## Active-Active and Active-Passive—Two Modes of Multi-Region

Multi-region splits into two operational modes. **Active-Passive**: only one region (Primary) takes traffic; others (Secondary) wait and promote on failure (typical: Route 53 Failover Routing + health checks). **Active-Active**: both regions handle traffic simultaneously (typical: Route 53 Latency Routing + bidirectional replication). Active-Active approaches RTO=0 (both already running, just shift traffic) but must resolve **data conflicts** from bidirectional writes.

```
Active-Active (Latency Routing)
==================================================
  Users (Global)
       │
       ▼
  Route 53 Latency Routing + Health Check
       │
       ├─► Region A (ap-northeast-2)  ── Simultaneous traffic
       │     ALB → ECS/Lambda
       │     Aurora Global writer / DDB Global Table
       │
       └─► Region B (us-east-1)        ── Simultaneous traffic
             ALB → ECS/Lambda
             Aurora Global secondary / DDB Global Table

  Cross-Region data layer:
   ├─ Aurora Global   : Async <1s (single writer)
   ├─ DDB Global Tables: Multi-master, LWW conflict resolution
   ├─ S3 CRR          : Async object replication
   └─ KMS Multi-Region Key: Encryption boundary bridging
```

## Aurora Global Database—Single-Writer Asynchronous Global Replication

Aurora Global ties one Primary region and up to 5 Secondary regions. The key insight: **writes happen only in the Primary region**; Secondaries are read-only (single-writer). Replication is asynchronous but, over AWS's private infrastructure (storage-layer replication), typically achieves **sub-1-second lag**.

On region failure, promote a Secondary **to standalone primary** (usually within a minute). Note: to return to a global configuration post-failover, you must wait for the old Primary to recover, then reconfigure it as the new Secondary—it doesn't auto-reverse bidirectionally.

> 💡 **Related Theory**: Aurora Global's insistence on "single writer + read-only secondary" exists to **eliminate distributed write conflicts by construction**. If multiple regions write to the same row simultaneously, conflict resolution logic is needed, but reconciling transaction/foreign-key/constraint semantics with conflict resolution is hard (distributed consensus cost). So Aurora Global adopts the **single-leader replication** model—"writes in one place, reads everywhere"—keeping consistency straightforward. The opposite extreme is DynamoDB Global Tables' **multi-leader**. Single-leader is easy on consistency but couples write availability to the Primary; multi-leader can write anywhere but must handle conflicts—this tradeoff is the essence of choosing between these two services.

## DynamoDB Global Tables—True Multi-Master and Last-Write-Wins

DynamoDB Global Tables is the opposite of Aurora Global: **every region can read AND write in true multi-master fashion**. Write to one region, and it auto-replicates bidirectionally to all others (usually <1 second). Write from anywhere, so write availability is high, but if two regions update the same item nearly simultaneously, conflicts arise. DynamoDB resolves this via **Last Write Wins (LWW)**—the write with the later timestamp wins.

> 🔍 **Deeper**: LWW is the simplest conflict-resolution strategy but carries risk. The "later" in "last write wins" is judged by **wall-clock timestamp**, yet in distributed systems, different nodes' clocks never sync perfectly (clock skew). If clocks drift, a write that truly happened first can be timestamped "later" and win anyway, causing **silent lost updates**. This limitation is why distributed systems theory uses more sophisticated resolution like **vector clocks** (Lamport's logical clock extension) or **CRDT (Conflict-free Replicated Data Type)**—merge conflicts based on causality, not clocks. DynamoDB chose LWW for simplicity/performance, so "update the same key from multiple regions simultaneously" is an anti-pattern. Partition keys by region or use it on low-conflict workloads.

> 📚 **Case Study**: The original Amazon Dynamo paper (DeCandia et al., SOSP 2007) handled shopping-cart conflicts not with LWW but by **preserving both versions** so applications could merge—in carts, "don't lose added items" mattered more than "latest state." This teaches: "conflict resolution needs domain knowledge." Lesson: LWW is not universal; depending on data semantics, "last wins" can mean data loss, so multi-master requires examining conflict scenarios rigorously.

| Item | Aurora Global | DynamoDB Global Tables |
|------|---------------|------------------------|
| Write model | Single-leader (Primary only) | Multi-master (all regions write) |
| Conflicts | None (writes in one place) | Resolved via LWW |
| Consistency | Secondary is eventual read | Eventual (cross-region) |
| Failover | Secondary promote (~1 min) | Inherently distributed, failover concept weak |
| Data model | Relational (SQL) | Key-value/document (NoSQL) |
| CAP position | Closer to CP (single-leader) | AP (availability/latency-first) |

## S3 Cross-Region Replication—Asynchronous Object Replication

S3 CRR (Cross-Region Replication) automatically replicates objects from one bucket to another in a different region. **Both buckets must enable versioning**—version IDs track replication. Replication is unidirectional by default; for bidirectional, configure CRR in both directions. The replication role (IAM) needs read on source + write on destination.

- **RTC (Replication Time Control)**: Guarantees 99.99% of objects replicate within 15 minutes (SLA). Plain CRR is best-effort.
- **Selective replication**: Replicate by prefix/tags, to different storage classes, to a different account.
- **Pre-existing objects**: CRR by default replicates only new objects created after enabling (old objects need S3 Batch Replication).

> ⚠️ **Pitfall**: CRR **replicates only new objects created after versioning is enabled**, a frequent gotcha. "I turned on CRR but old objects aren't in the destination bucket" is not a bug—it's design. To replicate pre-existing objects, run S3 Batch Operations (Batch Replication) separately. Also, delete marker replication is optional; deleting in one region may not delete the object in another by default.

## KMS Multi-Region Key—Bridging Encryption Boundaries Across Regions

A hidden pitfall in multi-region data is encryption. When S3 CRR replicates encrypted objects to another region, or Aurora Global/DDB Global Tables replicate data, **if the KMS key used for encryption doesn't exist in that region, decryption is impossible.** A single-region KMS key is locked to its region and unusable elsewhere.

**Multi-Region Key (MRK)** solves this. Create a Primary MRK in one region, replicate Replica MRKs to others, and they **share the same key material and key ID (mrk- prefix)**. So data encrypted with an MRK in region A can be decrypted with the replica MRK in region B—ciphertext is valid across region boundaries.

```bash
aws kms create-key --multi-region   # Create Primary MRK
aws kms replicate-key --key-id mrk-abc --replica-region us-east-1  # Replicate
```

> 💡 **Related Theory**: Sharing "the same key material across multiple regions" is cryptographically subtle. Normally, keys are confined to one place (minimize key exposure surface), but MRK intentionally replicates key material to gain **portability of ciphertext**—while key material is shared, access controls (policies, grants) are managed independently per region (same material, regional permissions). This works with **envelope encryption**: data is encrypted with a data key (DEK), and the DEK is encrypted with a KMS key (KEK). MRK makes the KEK layer shareable across regions, so encrypted DEKs accompanying replicated ciphertext can be decrypted in the destination region. In exams, "replicated encrypted data can't be decrypted in another region" almost always answers to "no MRK" or "missing key policy permission."

## Global Accelerator vs CloudFront—Two Routes Around DNS Limitations

Two services bypass Route 53 DNS routing's limitation (slow failover due to cache TTL), but they serve different purposes.

| Item | Global Accelerator | CloudFront |
|--------|---------------------|------------|
| Protocol | TCP/UDP (L4) | HTTP/HTTPS (L7) |
| IP | Fixed anycast 2 IPs | Dynamic edge IPs |
| Caching | None (proxy/routing) | Strong (content cache) |
| Failover | Health-check-based instant (DNS cache irrelevant) | Origin Failover |
| Typical use | Games, IoT, VoIP, non-HTTP | Web/static content delivery |

> 🔍 **Deeper**: Global Accelerator's instant failover secret is **anycast**. Anycast is a routing technique advertising the same IP address from multiple edge locations worldwide (via BGP); user packets automatically route to the nearest edge. Clients only ever know two fixed IPs; if a backend region dies, GA instantly reroutes to the healthy region—**regardless of client DNS cache** (the IP doesn't change). Route 53, by contrast, changes the IP itself on failover, so delay is at least one DNS cache TTL. "Instant cross-region failover for non-HTTP" → GA; "global caching of static content" → CloudFront; "simple weighted/latency routing" → Route 53.

## Route 53 ARC—Making DR Failover Safe by Code

Relying solely on health-check-driven failover risks misinterpreting health or partial outages, triggering wrong failover. **Route 53 Application Recovery Controller (ARC)** treats failover as **explicit control (Routing Control)**—operators or automation safely toggle "route traffic to region B now" via code/API. Concurrently, **Readiness Check** continuously verifies "is the Secondary region truly ready?" (capacity, configuration, replication state).

> 💡 **Related Theory**: ARC's core value is enabling **safe DR drills** (tested failover). A plague of DR plans: "untested failover paths fail when disasters strike" (code rot from disuse). ARC Routing Control is distributed across 5 independent region data planes, so even if the main control plane fails, failover can be toggled (control/data plane separation—fewer dependent systems on failure, per the "static stability" principle). This commercializes the Well-Architected principle: "regularly test recovery procedures." Validating this failover via FIS chaos experiments is a pattern from Day 4.

## Closing Thoughts

Four pictures emerge today. First, **multi-region must accept asynchronous replication due to the speed of light, and handling resulting inconsistency/conflicts is the core**. Second, **Route 53 is DNS-based GSLB** combining 7 routing policies and quorum health checks, but DNS cache TTL is a fundamental delay; **instant failover falls to anycast-based Global Accelerator**. Third, **data replication trades off single-leader (Aurora Global, no conflicts) against multi-leader (DDB Global Tables, LWW)**; LWW risks silent lost updates from clock skew. Fourth, **KMS Multi-Region Key bridges encryption boundaries**, letting replicated ciphertext be decrypted in other regions; **S3 CRR replicates only new post-versioning objects**; **Route 53 ARC makes failover safe code** via control/data plane separation.

Next, we explore the four DR strategies—Backup & Restore, Pilot Light, Warm Standby, Active-Active—and their RTO/RPO/cost tradeoffs.

---

## 📝 연습 문제

**문제 1.** 전 세계 사용자에게 각자 지연이 가장 낮은 리전으로 트래픽을 보내면서, 리전 장애 시 자동으로 건강한 리전만 응답하게 하려 한다. 가장 적합한 Route 53 구성은?

A) Simple Routing

B) Latency-based Routing + 각 레코드에 헬스 체크 연결

C) Weighted Routing 고정 50:50

D) Geolocation Routing만

**정답: B**

해설: Latency-based Routing은 측정된 네트워크 지연을 기준으로 사용자에게 가장 빠른 리전을 응답해 글로벌 성능을 최적화한다. 여기에 각 레코드에 헬스 체크를 연결하면 장애 리전은 응답 후보에서 자동 제외돼, 성능 최적화와 자동 페일오버를 동시에 얻는다. Simple(A)은 단일 레코드라 분산·페일오버가 없고, 고정 Weighted(C)는 지연을 고려하지 않으며, Geolocation(D)은 지리 기반이라 같은 대륙 내 더 빠른 리전 선택을 못 한다. 단, DNS 캐시 TTL 때문에 페일오버는 즉각이 아님에 유의.

---

**문제 2.** DynamoDB Global Tables에서 두 리전이 거의 동시에 같은 항목을 다르게 갱신한다. 충돌은 어떻게 해결되며 어떤 위험이 있는가?

A) 트랜잭션 롤백으로 둘 다 취소된다

B) Last Write Wins(타임스탐프가 늦은 쓰기가 이김)로 해결되며, 노드 간 clock skew로 실제 나중 쓰기가 져서 silent lost update가 날 수 있다

C) 첫 번째 쓰기가 항상 이긴다

D) 사용자에게 충돌 오류를 반환한다

**정답: B**

해설: DynamoDB Global Tables는 멀티 마스터로, 충돌을 Last Write Wins(LWW) — 더 늦은 벽시계 타임스탬프가 이김 — 로 해결한다. 그런데 분산 노드의 시계는 완벽히 동기화되지 않아(clock skew), 실제로 먼저 일어난 쓰기가 타임스탬프상 '나중'으로 찍혀 이기면 진짜 최신 쓰기가 조용히 사라지는 silent lost update가 발생할 수 있다. 그래서 "같은 키를 여러 리전에서 동시 갱신"은 안티패턴이다. 원조 Dynamo 논문은 카트에서 LWW 대신 양쪽 버전 보존을 택했는데, 이는 충돌 해결이 도메인 지식을 요구함을 보여준다. 롤백(A)·선쓰기 승리(C)·충돌 오류(D)는 DDB의 동작이 아니다.

---

**문제 3.** Aurora Global Database가 리전 간 쓰기 충돌 문제를 아예 겪지 않는 근본 이유는?

A) 모든 리전이 동기 복제되어서

B) 쓰기는 오직 Primary 리전에서만 일어나는 단일 리더 모델이라 충돌 자체가 발생하지 않음(secondary는 읽기 전용)

C) Aurora가 충돌을 자동 병합해서

D) 리전이 하나뿐이라서

**정답: B**

해설: Aurora Global은 단일 리더(single-leader) 복제 모델로, 쓰기는 Primary 리전에서만 일어나고 최대 5개 Secondary 리전은 읽기 전용이다. 쓰기 지점이 하나뿐이므로 리전 간 쓰기 충돌이 원천적으로 발생하지 않는다 — 관계형 DB의 트랜잭션·제약조건과 충돌 해결을 양립시키는 어려움을 회피하는 설계다. 복제는 동기가 아니라 비동기 <1초(A 틀림)이고, 충돌을 병합(C)하는 게 아니라 충돌이 안 생기게 막는 것이며, 리전은 여럿이다(D 틀림). 반대 극단이 DDB Global Tables의 멀티 마스터다.

---

**문제 4.** S3 객체를 KMS로 암호화한 뒤 CRR로 다른 리전에 복제했는데, 대상 리전에서 객체를 복호화할 수 없다. 원인과 해법은?

A) CRR이 암호화를 지원하지 않는다

B) 암호화에 single-region KMS 키를 써서 대상 리전에 키가 없다 — KMS Multi-Region Key(MRK)로 키를 양 리전에 복제해야 함

C) 버전 관리가 꺼져 있다

D) S3는 리전 간 암호화 데이터를 지원하지 않는다

**정답: B**

해설: 일반 KMS 키는 한 리전에 갇혀 있어 다른 리전에서 쓸 수 없다. 암호화된 객체를 다른 리전에 복제해도 그 리전에 같은 키가 없으면 복호화가 불가능하다. KMS Multi-Region Key는 같은 키 자료와 키 ID(mrk-)를 여러 리전에 공유해, 한 리전에서 암호화한 데이터를 다른 리전의 Replica MRK로 복호화할 수 있게 한다(봉투 암호화의 KEK 계층을 리전 간 공유). CRR은 암호화를 지원하고(A 틀림), 버전 관리는 CRR 전제조건이지 복호화 실패 원인이 아니며(C), S3는 리전 간 암호화 데이터를 지원한다(D 틀림).

---

**문제 5.** 비-HTTP(게임용 UDP) 트래픽에서, 백엔드 리전 장애 시 클라이언트의 DNS 캐시와 무관하게 즉각적으로 건강한 리전으로 페일오버하려 한다. 가장 적합한 것은?

A) Route 53 Failover Routing(TTL을 짧게)

B) AWS Global Accelerator — 고정 anycast IP 2개 + 헬스 체크 기반 즉각 재라우팅(DNS 캐시 무관)

C) CloudFront

D) Route 53 Latency Routing

**정답: B**

해설: Route 53 기반 페일오버는 응답 IP 자체를 바꾸므로 클라이언트 DNS 캐시 TTL만큼 지연이 불가피하다(A·D 한계). Global Accelerator는 전 세계에 anycast로 광고되는 고정 IP 2개를 제공하고, 백엔드 리전이 죽으면 헬스 체크 기반으로 트래픽을 건강한 리전으로 즉시 재라우팅한다 — IP가 안 바뀌므로 클라이언트 DNS 캐시와 무관하게 페일오버가 즉각적이다. 게다가 TCP/UDP(L4)를 지원해 비-HTTP에 맞다. CloudFront(C)는 HTTP/HTTPS 콘텐츠 캐싱용이라 UDP 게임 트래픽에 부적합하다.

---

**문제 6.** Route 53 헬스 체크가 일시적 네트워크 글리치로 인한 false positive(멀쩡한데 실패로 오판)를 줄이는 메커니즘은?

A) 단일 위치에서 1회만 점검

B) 전 세계 여러 checker가 동시 점검하고 정족수(약 18% 이상 정상) 합의로 healthy를 판정

C) 사용자 트래픽으로만 판정

D) DNS TTL을 늘려서

**정답: B**

해설: Route 53 헬스 체크는 단일 ping이 아니라 전 세계 여러 checker 위치에서 동시에 점검하고, 일정 비율(약 18%) 이상의 checker가 정상이라고 봐야 healthy로 판정한다. 이 글로벌 정족수 합의가 한 checker의 일시적 네트워크 문제로 인한 false positive를 막는다. 추가로 Calculated 체크(여러 체크 AND/OR 조합)나 CloudWatch Alarm 기반 체크로 복합 조건도 표현한다. 단일 점검(A)·사용자 트래픽 판정(C)·TTL 조정(D)은 헬스 체크의 오판 방지 메커니즘이 아니다.

---

**문제 7.** DR 페일오버 절차를 평소에 안전하게 검증하고, 메인 컨트롤 플레인이 장애여도 페일오버를 토글할 수 있게 하려 한다. 가장 적합한 것은?

A) Route 53 레코드를 수동으로 직접 편집

B) Route 53 Application Recovery Controller(ARC) — Routing Control로 명시적 토글 + Readiness Check로 준비 상태 점검, 5개 리전 데이터 플레인 분산으로 static stability 확보

C) Lambda로 매번 DNS를 다시 작성

D) CloudFront Origin Failover

**정답: B**

해설: Route 53 ARC는 페일오버를 헬스 체크 자동에만 맡기지 않고 명시적 Routing Control로 토글하며, Readiness Check로 Secondary 리전의 용량·구성·복제 준비 상태를 지속 점검해 DR drill을 안전하게 만든다. 핵심은 ARC의 데이터 플레인이 5개 리전에 분산돼 있어 메인 컨트롤 플레인이 장애여도 페일오버를 실행할 수 있다는 점이다(컨트롤/데이터 플레인 분리, static stability 원칙 — 장애 시 의존 시스템이 적을수록 안전). 수동 편집(A)이나 매번 재작성(C)은 검증·안전성이 없고, CloudFront Origin Failover(D)는 HTTP origin 수준의 페일오버라 범용 DR 토글이 아니다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 멀티 리전은 빛의 속도라는 물리 한계로 비동기 복제를 받아들여야 하며 그 결과인 충돌·불일치를 다루는 게 본질이다. 둘째, Route 53은 DNS 기반 GSLB로 7종 라우팅 정책과 정족수 헬스 체크(여러 checker 합의로 false positive 방지)를 결합하지만 DNS 캐시 TTL이라는 지연 한계가 있어, 즉각 페일오버는 anycast 고정 IP 기반 Global Accelerator가 맡는다(CloudFront는 HTTP 콘텐츠 캐싱). 셋째, 데이터 복제는 단일 리더(Aurora Global, 쓰기 한 곳이라 충돌 없음, secondary promote ~1분)와 멀티 마스터(DynamoDB Global Tables, LWW 충돌 해결)의 트레이드오프이며 LWW는 clock skew로 silent lost update 위험을 품는다. 넷째, KMS Multi-Region Key가 같은 키 자료를 리전 간 공유해 복제 암호문의 리전 이식성을 주고(봉투 암호화 KEK 공유), S3 CRR은 버전 관리 필수·새 객체만 복제이며, Route 53 ARC가 컨트롤/데이터 플레인 분리로 안전한 DR 페일오버 토글을 제공한다.
