# Day 3 - Reliability & Performance Efficiency Pillars Deep Dive — CAP Theorem, Idempotency and Retry Mathematics, HPC Networking Physics

There is one unavoidable truth in distributed systems: **Networks always break, nodes always die, and messages always get duplicated or disappear.** Reliability (Stability) is the pillar that doesn't deny this truth but accepts and designs for it. Performance Efficiency is the pillar of processing faster and more efficiently with the same resources. The two pillars frequently conflict — sync replication across all regions for strong consistency improves reliability but degrades latency (performance). A pro architect's job is deciding where to cut this trade-off.

In SAP-C02, these two pillars appear with keywords like "RTO 5 minutes, RPO 1 minute," "ultra-low inter-node latency HPC," "message inflow faster than consumer," "global caching." Today we decompose distributed systems theory from the roots: CAP theorem and PACELC, the mathematics of idempotency and retries, principles of caching layers, and the physics of HPC networking.

## Reliability — Design Assuming Failures

The five design principles of Reliability stem from one assumption: "failures happen." **Auto-recovery, test recovery procedures, horizontal scaling, capacity measurement via monitoring (not guessing), automate changes.** The key is the third and second principles. Horizontal scale-out (scale-out) eliminates single points of failure, and testing recovery procedures acknowledges the difference between "backup exists" and "recovery actually works."

| Pattern | Tool | When Applied |
|---------|------|--------------|
| Multi-AZ | ALB, RDS Multi-AZ, EFS, DynamoDB | Guard against single-AZ failure (sync replication) |
| Multi-Region | Aurora Global, DynamoDB Global Table, Route 53, S3 CRR | Guard against region failure, low RTO/RPO |
| Auto Scaling | ASG, Application Auto Scaling, Karpenter | Adapt to load changes |
| Health Check | Route 53, ELB, app-level | Auto-exclude unhealthy nodes |
| Retry + Backoff + Jitter | Built into SDKs | Absorb transient failures |
| Queuing + Decoupling | SQS, SNS, Kinesis | Decouple components, buffer |
| Backup + DR | AWS Backup, MGN, DRS | Recover data and systems |
| Chaos Testing | FIS | Verify recovery procedures |

> 💡 **Related Theory**: Behind Multi-AZ vs Multi-Region choice lies **CAP Theorem (Brewer, 2000)**. CAP states: "When network partitioning occurs, you can only choose between Consistency and Availability." RDS Multi-AZ uses sync replication for **strong consistency (CP)**—the standby is always current, but if one AZ is cut off, there's brief unavailability during failover. DynamoDB Global Table chooses **availability (AP)**—all regions accept writes, but tolerates temporary inconsistency via last-writer-wins. In exams, "all regions write simultaneously + always available" is an AP (DynamoDB Global) signal; "always latest data guaranteed" is a CP (sync replication) signal.

> 🔍 **Deeper Dive**: CAP is incomplete because it says nothing about "when there's no partition." **PACELC Theorem (Abadi, 2012)** supplements it: "**P**artition means choose A or C, **Else** choose between **L**atency and **C**onsistency." Even in normal operation, strong consistency requires tolerating latency via sync replication. Aurora Global Database advertises "sub-1-second RPO + sub-1-minute recovery" but uses **async replication**—this is the EL trade-off of PACELC. Syncing all regions would spike latency, so it accepts async replication to reduce latency instead, tolerating a sub-1-second data loss window. In exams, when RPO is "sub-1-second, not 0," you recognize async replication (Aurora Global).

> 📚 **Case Study**: The February 2017 AWS S3 us-east-1 massive outage started when an engineer mistyped a command during debugging, shutting down more servers than intended. Countless services depending on S3 (even AWS's own status dashboard) went down simultaneously. Two lessons emerged: (1) Architecture depending solely on us-east-1 collapses entirely on that region's failure (Multi-Region necessity), (2) if operational tools are bound to a single region, you can't respond during an outage (control plane independence). Afterward, many organizations redesigned critical workloads to Multi-Region and status dashboards to region-independent architectures.

> 📚 **Case Study**: During the October 2012 AWS EBS us-east-1 outage, **Netflix was barely affected**—notable because it had built a chaos engineering culture that same year. The secret: Chaos Monkey randomly killed instances to eliminate single points of failure, and deployed workloads stateless across multiple AZs so one AZ or component dying was auto-bypassed. Lesson: Reliability isn't ensured by responding after failures—it's ensured by **regularly injecting failures to validate beforehand**. AWS absorbed this philosophy into FIS (Fault Injection Simulator). "Backup exists" differs from "recovery actually works"—this is Reliability's essence.

> 💡 **Related Theory**: The four DR strategies are a spectrum of RTO/RPO and cost trade-offs — **Backup/Restore** (RTO hours, lowest cost) → **Pilot Light** (minimal active resources) → **Warm Standby** (scaled-down always-active) → **Multi-Site Active-Active** (full redundancy, RTO ~0, highest cost). Shorter RTO/RPO means more always-on resources, raising costs. In exams, "RTO in minutes" signals Warm Standby or better; "RTO hours + lowest cost" signals Backup/Restore. This spectrum is a key collision point between Reliability and Cost pillars.

## Idempotency and Retry — The Mathematics of Stability

Retry is basic to Reliability, but done wrong, it amplifies failures. Two concepts must be precise.

**Idempotency**: Executing the same request multiple times produces the same result as executing once. When a network timeout leaves "was the request processed?" unknown, safe retry requires idempotent operations. Non-idempotent operations like payments add an **idempotency key**—the server filters duplicates. SQS FIFO's message deduplication ID and Lambda's idempotent processing follow the same idea.

**Exponential Backoff with Jitter**: When all clients retry simultaneously on failure, a **retry storm** can collapse the server right before recovery (thundering herd). Backoff increases retry intervals exponentially (1s→2s→4s→8s) to spread load. Jitter adds randomness so clients don't spike simultaneously.

> 💡 **Related Theory**: Jitter's effect is explained by probability. Without jitter, backoff alone synchronizes all clients' retry times—causing load spikes at 1s, 2s, 4s moments. Adding jitter distributes retry times uniformly across [0, backoff] interval, flattening load over time. AWS Architecture Blog's "Exponential Backoff And Jitter" showed via simulation that full jitter (`random(0, base*2^n)`) minimizes both retry count and server load. This is why AWS SDK defaults include jitter. In exams, "simultaneous retry overload" points toward backoff + jitter.

> ⚠️ **Pitfall**: In a "messages arrive faster than consumer can process" scenario, choosing sync calls (direct Lambda invocation, etc.) is wrong. Producer-consumer speed mismatch must use **queue (SQS) buffering to absorb backpressure**—the consumer polls at its own pace, and failed messages route to **DLQ (Dead Letter Queue)** for isolation, not blocking normal flow. Direct SNS fan-out or sync calls lose messages or timeout if the consumer can't keep up. In exams, "absorb inflow surge and decouple" is SQS + DLQ.

## Performance Efficiency — Choosing the Right Service

Performance's five principles are "democratize latest tech (managed), global reach, serverless first, experiment and measure, empathy-driven design." In practice, it boils down to **choosing services in four domains—Compute, Storage, Database, Network—that match the workload.**

**Compute**: EC2 (Graviton, Spot, Auto Scaling), Fargate, Lambda. Placement strategies — Cluster (low latency), Spread (isolation), Partition (large-scale distributed).
**Storage**: gp3, io2 (block); st1, sc1 (throughput, cold); Instance Store (NVMe ultra-low-latency ephemeral); FSx (Lustre, Windows, NetApp ONTAP, OpenZFS).
**Database**: Relational (RDS, Aurora), Key-Value (DynamoDB), Document (DocumentDB), Graph (Neptune), Time-series (Timestream), Ledger (QLDB), Wide-column (Keyspaces) + caching (ElastiCache, DAX, MemoryDB).
**Network**: CloudFront, Global Accelerator, Enhanced Networking (ENA, EFA), Cluster Placement Group.

## Caching Layer — Reducing Latency and Cost Simultaneously

```
Client → CloudFront(edge) → API GW Cache → ElastiCache/DAX(app) → DB(source)
```

Each layer keeps frequently-used data in faster, cheaper storage, reducing requests reaching the slow, expensive source (DB). This is **caching's essence — layering via locality principle.**

> 💡 **Related Theory**: Caching mirrors **memory hierarchy** and **principle of locality** from computer architecture into distributed systems. Just as CPU L1/L2/L3 cache → RAM → disk tiers ("closer = faster and smaller and more expensive"), CloudFront → ElastiCache → DB follows the same structure. Cache efficiency depends on **temporal locality** (recently-used data used again) and **spatial locality** (nearby data used together). Cache strategies (write-through, write-back, cache-aside) and invalidation are identical to OS and DB cache theory. The joke "cache invalidation is one of two hardest problems in CS" applies to distributed caching too—DAX and ElastiCache TTL/invalidation design is key to consistency.

> 🎯 **Scenario**: "A read-heavy app reads the same DynamoDB item tens of thousands of times per second, hitting both cost and latency. Want microsecond response with minimal code changes. What to add?" — Answer: **DAX (DynamoDB Accelerator)**. DAX is in-memory cache purpose-built for DynamoDB with API compatibility to DynamoDB—nearly zero code changes, plus microsecond response and reduced read costs on cache hits. ElastiCache (Redis/Memcached) is general-purpose but requires hand-written cache-aside logic. "DynamoDB-specific + minimal code change + microseconds" is DAX's direct answer.

## HPC Networking — Where Physics Dominates

HPC (high-performance computing) and distributed ML training exchange gradients every step across hundreds of nodes, so **inter-node communication latency governs overall performance**. Here, the physics of light speed and network stack overhead determines design.

- **Cluster Placement Group**: Physically pack instances in the same AZ and same rack to minimize inter-node latency and maximize bandwidth. Trade-off: lower availability (single-rack failure kills all—acceptable for HPC since jobs restart).
- **EFA (Elastic Fabric Adapter)**: OS-bypass lets users access NIC directly from user space, providing RDMA-level ultra-low latency for HPC communication libraries like MPI and NCCL.
- **FSx for Lustre**: Parallel filesystem with hundreds of GB/s throughput, integrated with S3 to supply large datasets at speed.

> 🔍 **Deeper Dive**: Why is EFA's "OS-bypass" decisive? Regular TCP/IP communication incurs kernel mode switches, copying, and interrupts per packet—microsecond overhead accumulates. In distributed learning with hundreds of nodes communicating every step, this overhead idles GPUs. EFA uses SRD (Scalable Reliable Datagram) protocol, bypasses the kernel, and lets user space communicate directly with NIC—reducing latency by orders of magnitude. This is why Cluster PG (physical packing) + EFA (stack bypass) + Lustre (data supply) is the standard triple for HPC and large-scale ML training. In exams, "inter-node ultra-low latency + MPI/distributed learning" signals this combination.

## Summary

Reliability assumes failures occur and expands from Multi-AZ (CP, sync) to Multi-Region (AP, async), makes retries safe via idempotency and exponential backoff with jitter, and validates recovery procedures with FIS. Performance Efficiency chooses services in four domains (Compute, Storage, Database, Network) matching the workload, reduces latency and cost simultaneously through caching (CloudFront, ElastiCache, DAX) using memory hierarchy principles, and HPC breaks physical limits with Cluster PG + EFA + Lustre.

SAP exam frequent mappings: (1) "RTO/RPO in minutes + global" → **Aurora Global** (async, sub-1-second RPO), **DynamoDB Global Table**, (2) "all regions write + always available" → **DynamoDB Global (AP)**, (3) "inter-node ultra-low latency HPC/distributed learning" → **Cluster PG + EFA + FSx Lustre**, (4) "DynamoDB-specific microsecond cache + minimal code change" → **DAX**, (5) "absorb inflow surge and decouple" → **SQS + DLQ**, (6) "regularly validate recovery procedures" → **FIS**, (7) "simultaneous retry storm" → **exponential backoff + jitter**, (8) "ARM cost/performance/power" → **Graviton**. Next day dives into Cost and Sustainability pillars through unit economics and carbon accounting.

---

## 📝 연습 문제

**문제 1.** 한 글로벌 서비스가 여러 리전에서 동시에 읽고 쓰며, 한 리전이 장애가 나도 다른 리전에서 끊김 없이 쓰기를 계속 받아야 한다. 일시적 데이터 불일치는 비즈니스적으로 허용된다. 가장 적합한 데이터베이스는?

A) RDS Multi-AZ (동기 복제)

B) DynamoDB Global Table (멀티 리전, 멀티 액티브)

C) Aurora 단일 리전 + Read Replica

D) 단일 리전 DynamoDB

**정답: B**
해설: DynamoDB Global Table은 모든 리전이 쓰기를 받는 멀티 액티브 구조로, CAP의 가용성(AP)을 택해 한 리전 장애에도 다른 리전이 쓰기를 계속 받는다. 대신 last-writer-wins로 일시적 불일치를 허용하는데 문제에서 이를 허용한다. A(RDS Multi-AZ)는 단일 리전 내 동기 복제로 멀티 리전 동시 쓰기가 아니다. C는 리전 장애에 취약하고 쓰기는 단일 리전이다. D는 멀티 리전이 아니다. 함정: "전 리전 동시 쓰기 + 항상 가용 + 불일치 허용"은 AP(DynamoDB Global)다.

---

**문제 2.** 한 분산 ML 학습 작업이 수백 개 노드 간에 매 스텝 그래디언트를 교환하며, 노드 간 통신 지연이 학습 속도를 좌우한다. 가용성보다 통신 성능이 우선이다. 가장 적합한 구성은?

A) Spread Placement Group으로 노드를 여러 랙에 분산

B) Cluster Placement Group + EFA + FSx for Lustre

C) Multi-AZ Auto Scaling Group

D) Partition Placement Group + EBS gp3

**정답: B**
해설: Cluster PG는 같은 AZ·랙에 노드를 밀집 배치해 지연을 최소화하고, EFA는 OS-bypass로 MPI/NCCL 통신에 RDMA 수준 저지연을 주며, FSx Lustre는 수백 GB/s로 데이터를 공급한다 — HPC·분산 학습의 표준 3종이다. A(Spread)는 격리가 목적이라 지연이 오히려 늘고, C(Multi-AZ)는 AZ 간 지연으로 통신이 느리며, D(Partition)는 대규모 분산 저장용이지 초저지연 통신용이 아니다. 함정: "노드 간 초저지연 통신"은 Cluster PG + EFA다.

---

**문제 3.** 한 읽기 집약 애플리케이션이 DynamoDB에서 동일 항목을 초당 수만 번 읽어 지연과 비용이 높다. 애플리케이션 코드 변경을 최소화하며 마이크로초 단위 응답을 원한다. 가장 적합한 솔루션은?

A) ElastiCache for Redis를 cache-aside로 구현

B) DAX(DynamoDB Accelerator) 추가

C) DynamoDB 읽기 용량(RCU)을 대폭 증설

D) Aurora Read Replica 추가

**정답: B**
해설: DAX는 DynamoDB 전용 인메모리 캐시로 DynamoDB와 API 호환이라 코드 변경이 거의 없고, 캐시 적중 시 마이크로초 응답과 읽기 비용 절감을 동시에 준다. A(ElastiCache)는 범용 캐시지만 cache-aside 로직을 직접 작성해야 해 코드 변경이 크다. C는 비용만 늘고 마이크로초 응답을 보장하지 않는다. D는 DynamoDB가 아닌 Aurora용이다. 함정: "DynamoDB 전용 + 코드 최소 변경 + 마이크로초"는 DAX의 직답이다.

---

**문제 4.** 한 모바일 백엔드에서 장애 복구 시 수많은 클라이언트가 동시에 재시도하며 서버가 회복 직전에 다시 무너지는 현상이 반복된다. 가장 적합한 대응은?

A) 재시도 횟수를 무제한으로 늘린다

B) 지수 백오프에 지터(jitter)를 추가해 재시도 시각을 분산한다

C) 재시도를 완전히 제거한다

D) 모든 클라이언트가 동일한 고정 간격으로 재시도하게 한다

**정답: B**
해설: 동시 재시도 폭풍(thundering herd)은 지수 백오프(간격을 1s→2s→4s로 증가)에 지터(무작위성)를 더해 재시도 시각을 [0, backoff] 구간에 균등 분포시켜 부하를 시간축에 평탄화함으로써 해결한다. AWS SDK 기본 전략에 내장돼 있다. A는 부하를 키우고, C는 일시 장애를 흡수 못 하며, D(고정 간격)는 오히려 동기화돼 스파이크를 만든다. 함정: "동시 재시도 과부하"는 backoff + jitter다.

---

**문제 5.** 한 시스템에서 생산자가 메시지를 소비자 처리 속도보다 빠르게 쏟아내 메시지 유실과 타임아웃이 발생한다. 처리에 실패한 메시지는 정상 흐름을 막지 않고 별도로 격리·재처리하고 싶다. 가장 적합한 설계는?

A) SNS로 소비자에게 직접 팬아웃

B) SQS로 버퍼링하고 처리 실패 메시지는 DLQ로 격리

C) Lambda를 동기 호출로 직접 연결

D) DynamoDB Streams로 직접 처리

**정답: B**
해설: 생산자-소비자 속도 불일치는 SQS 큐로 버퍼링해 소비자가 자기 속도로 폴링하게 하고(backpressure 흡수), 처리 실패 메시지는 DLQ(Dead Letter Queue)로 격리해 정상 흐름을 막지 않으면서 재처리한다. A(SNS 직접)·C(동기 호출)는 소비자가 못 따라가면 유실·타임아웃이 난다. D는 이 목적의 디커플링·버퍼링 메커니즘이 아니다. 함정: "유입 폭주 흡수 + 실패 격리"는 SQS + DLQ다.

---

**문제 6.** 한 팀이 Aurora Global Database를 도입했는데, 문서에 RPO가 "0이 아니라 1초 미만"으로 명시돼 있다. 이 RPO 특성을 가장 잘 설명하는 것은?

A) Aurora Global은 동기 복제라 RPO가 항상 0이다

B) Aurora Global은 리전 간 비동기 복제를 사용하므로 1초 미만의 데이터 손실 창이 존재한다

C) RPO 1초 미만은 단순 마케팅 표현이며 실제로는 0이다

D) Aurora Global은 복제를 하지 않는다

**정답: B**
해설: Aurora Global Database는 리전 간 비동기 복제를 사용한다. 동기로 전 리전을 묶으면 지연이 폭증(PACELC의 EL 트레이드오프)하므로, 비동기로 지연을 줄이는 대신 1초 미만의 데이터 손실 가능 창(RPO)을 허용한다. A는 동기로 오인한 것, C·D는 사실과 다르다. 함정: RPO가 "0이 아닌 1초 미만"이면 비동기 복제이며, 지연과 일관성의 trade-off(PACELC)를 반영한 것이다.

---