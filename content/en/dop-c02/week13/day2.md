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

**문제 1.** You want to send users worldwide to whichever region gives them the lowest latency, while making sure that during a regional failure only healthy regions answer. Which Route 53 configuration fits best?

A) Simple Routing

B) Latency-based Routing + a health check attached to each record

C) Weighted Routing fixed at 50:50

D) Geolocation Routing only

**정답: B**

해설: Latency-based Routing answers with the fastest region for each user based on measured network latency, optimizing global performance. Attaching a health check to each record automatically removes a failed region from the candidate answers, giving you performance optimization and automatic failover at once. Simple (A) is a single record with no distribution or failover, fixed Weighted (C) ignores latency, and Geolocation (D) is geography-based so it cannot pick the faster region within the same continent. Note, however, that because of DNS cache TTL the failover is not instantaneous.

---

**문제 2.** In DynamoDB Global Tables, two regions update the same item differently at almost the same moment. How is the conflict resolved, and what is the risk?

A) Both are cancelled by a transaction rollback

B) It is resolved by Last Write Wins (the write with the later timestamp wins), and clock skew between nodes can make the genuinely later write lose, producing a silent lost update

C) The first write always wins

D) A conflict error is returned to the user

**정답: B**

해설: DynamoDB Global Tables is multi-master and resolves conflicts with Last Write Wins (LWW) — the later wall-clock timestamp wins. But clocks on distributed nodes are never perfectly synchronized (clock skew), so a write that actually happened earlier can carry a "later" timestamp and win, silently erasing the truly latest write — a silent lost update. That is why "updating the same key from multiple regions simultaneously" is an anti-pattern. The original Dynamo paper chose to preserve both versions for shopping carts instead of LWW, showing that conflict resolution requires domain knowledge. Rollback (A), first-write-wins (C), and conflict errors (D) are not DynamoDB behaviors.

---

**문제 3.** What is the fundamental reason Aurora Global Database never experiences cross-region write conflicts at all?

A) Because all regions replicate synchronously

B) Because it is a single-leader model where writes happen only in the Primary region, so conflicts never arise in the first place (secondaries are read-only)

C) Because Aurora merges conflicts automatically

D) Because there is only one region

**정답: B**

해설: Aurora Global uses a single-leader replication model: writes occur only in the Primary region, and up to five Secondary regions are read-only. Because there is exactly one write point, cross-region write conflicts cannot occur by construction — a design that sidesteps the difficulty of reconciling relational transactions and constraints with conflict resolution. Replication is asynchronous with sub-second lag, not synchronous (A is wrong); conflicts are prevented rather than merged (C); and there are multiple regions (D is wrong). The opposite extreme is DynamoDB Global Tables' multi-master model.

---

**문제 4.** You encrypted S3 objects with KMS and replicated them to another region with CRR, but the objects cannot be decrypted in the destination region. What is the cause and the fix?

A) CRR does not support encryption

B) A single-region KMS key was used for encryption, so the key does not exist in the destination region — you must use a KMS Multi-Region Key (MRK) to replicate the key to both regions

C) Versioning is turned off

D) S3 does not support encrypted data across regions

**정답: B**

해설: An ordinary KMS key is confined to one region and cannot be used elsewhere. Replicating an encrypted object to another region does not help if that region lacks the same key — decryption is impossible. A KMS Multi-Region Key shares the same key material and key ID (mrk-) across regions, so data encrypted in one region can be decrypted with the replica MRK in another (sharing the KEK layer of envelope encryption across regions). CRR does support encryption (A is wrong), versioning is a CRR prerequisite but not the cause of the decryption failure (C), and S3 does support encrypted data across regions (D is wrong).

---

**문제 5.** For non-HTTP (game UDP) traffic, you want failover to a healthy region to be instantaneous on backend region failure, regardless of the client's DNS cache. Which is most appropriate?

A) Route 53 Failover Routing (with a short TTL)

B) AWS Global Accelerator — two fixed anycast IPs + health-check-based instant rerouting (independent of DNS cache)

C) CloudFront

D) Route 53 Latency Routing

**정답: B**

해설: Route 53-based failover changes the answered IP itself, so a delay of at least one client DNS cache TTL is unavoidable (the limitation of A and D). Global Accelerator provides two fixed IPs advertised worldwide via anycast, and when a backend region dies it reroutes traffic to a healthy region immediately based on health checks — since the IP never changes, failover is instantaneous regardless of client DNS caching. It also supports TCP/UDP (L4), which suits non-HTTP workloads. CloudFront (C) is for HTTP/HTTPS content caching and is unsuitable for UDP game traffic.

---

**문제 6.** Which mechanism reduces false positives (judging a healthy endpoint as failed) caused by transient network glitches in Route 53 health checks?

A) Checking once from a single location

B) Multiple checkers worldwide check simultaneously and healthy is decided by quorum consensus (roughly 18% or more reporting healthy)

C) Judging solely from user traffic

D) Increasing the DNS TTL

**정답: B**

해설: A Route 53 health check is not a single ping but simultaneous probes from many checker locations worldwide, and the endpoint is judged healthy only when at least a certain proportion of checkers (about 18%) report it healthy. This global quorum consensus prevents false positives caused by one checker's transient network problem. In addition, Calculated checks (AND/OR combinations of several checks) and CloudWatch Alarm-based checks express composite conditions. A single probe (A), judging from user traffic (C), and TTL tuning (D) are not health-check false-positive prevention mechanisms.

---

**문제 7.** You want to validate the DR failover procedure safely in normal times and be able to toggle failover even when the main control plane is impaired. Which is most appropriate?

A) Editing Route 53 records manually by hand

B) Route 53 Application Recovery Controller (ARC) — explicit toggling via Routing Control + Readiness Check for preparedness, with the data plane distributed across five regions for static stability

C) Rewriting DNS with Lambda every time

D) CloudFront Origin Failover

**정답: B**

해설: Route 53 ARC does not leave failover to health-check automation alone; it toggles explicitly through Routing Control and continuously verifies the Secondary region's capacity, configuration, and replication readiness with Readiness Check, making DR drills safe. The key point is that ARC's data plane is distributed across five regions, so failover can still be executed even when the main control plane is impaired (control/data plane separation, the static stability principle — the fewer systems you depend on during a failure, the safer). Manual edits (A) and ad-hoc rewrites (C) offer no validation or safety, and CloudFront Origin Failover (D) is HTTP origin-level failover, not a general-purpose DR toggle.

---

## 📌 Today's Summary

Four pictures emerge from today. First, multi-region must accept asynchronous replication because of the physical limit of the speed of light, and the essence of the work is handling the resulting conflicts and inconsistency. Second, Route 53 is DNS-based GSLB combining seven routing policies with quorum health checks (consensus among many checkers prevents false positives), but DNS cache TTL is a fundamental source of delay, so instant failover falls to anycast fixed-IP Global Accelerator (CloudFront handles HTTP content caching). Third, data replication is a tradeoff between single-leader (Aurora Global — one write point, so no conflicts, secondary promote in about a minute) and multi-master (DynamoDB Global Tables, LWW conflict resolution), and LWW carries the risk of silent lost updates from clock skew. Fourth, a KMS Multi-Region Key shares the same key material across regions to give replicated ciphertext regional portability (sharing the envelope-encryption KEK), S3 CRR requires versioning and replicates only new objects, and Route 53 ARC provides a safe DR failover toggle through control/data plane separation.
