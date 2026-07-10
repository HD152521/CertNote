# Day 3 - Why the High-Performance Domain Reduces to "How Close You Keep Data to the User"

On the SAA exam, high-performance architecture (Domain 3) is 24%. If security was an "allow/block" verdict and resilience a "blast radius" problem, the high-performance domain is a placement-and-parallelism problem: **"to reduce latency and increase throughput, where do you put data and compute, and how do you parallelize?"** The reason test-takers who memorize fragments like "DAX is μs, FSx Lustre is ML" get stuck is that what the exam asks is not a service name but **"where is this workload's bottleneck, and do you solve it with caching, proximity, parallelism, or dedicated hardware?"**

Every choice in the high-performance domain reduces to two big levers. One is **keeping data close to the point of consumption** (caches, CDNs, edge, read replicas); the other is **splitting work finely to process it in parallel** (sharding, distributed storage, multiple consumers). This article re-weaves Domain 3 into five axes — compute, storage, database, network/global, and messaging/stream — and watches how the two levers, "proximity" and "parallelism," operate on each.

> 💡 **Related theory**: The limit of high-performance design is set by **Amdahl's law** — if only part of a system can be parallelized, no matter how many cores you add, the overall speedup cannot exceed **the reciprocal of the serial portion** (the fraction that runs only sequentially). If the serial portion is 5%, infinite parallelization yields at most a 20x speedup. The lesson this law gives cloud performance design is "remove the bottleneck (serial section) first." Serial bottlenecks like a DynamoDB Hot Partition, a single NAT Gateway, or a cache miss govern the whole, so before adding instances you must first unblock these bottlenecks. Also, **latency and throughput are separate axes** — increasing throughput (more cores) doesn't reduce a single request's latency; latency drops only through proximity and caching.

## Compute Performance Splits by "the Right Chip and Placement"

The core of compute performance is choosing the instance type and physical placement that match the workload's characteristics. A **Cluster Placement Group** physically gathers instances onto the same rack, same AZ to minimize inter-node network latency — essential for workloads with frequent inter-node communication like HPC and distributed training (conversely Spread scatters for fault isolation, and Partition is for large-scale distributed systems). Chip choice splits by keyword too — **Graviton** (ARM-based, excellent price/performance), the **P/G families** (GPU, graphics/general acceleration), **Inferentia** (dedicated ML inference), and **Trainium** (dedicated ML training). **Lambda Provisioned Concurrency** pre-initializes functions to eliminate **cold starts** (the runtime-initialization delay on the first invocation).

> 🔍 **Going deeper**: The true nature of a Lambda cold start is the **execution-environment bootstrap time**. When there are no requests, Lambda tears down the execution environment, and when a new request arrives it ① spins up an isolated environment like a container, ② loads the runtime (Node/Python/JVM, etc.), and ③ initializes the function code before running the handler. Steps ①–③ are the cold start, and heavy runtimes like the JVM take hundreds of ms to a few seconds. **Provisioned Concurrency** launches N of these environments in advance and keeps them "warm" to eliminate cold starts. The easily-confused **Reserved Concurrency** is a different concept — it reserves and isolates an upper bound on concurrent executions (preventing one function from consuming the entire account limit), not cold-start elimination. On the exam, "eliminate cold starts" is unconditionally Provisioned.

> ⚠️ **Pitfall**: Confusing the three Placement Group types gets it wrong. "Lowest inter-node **latency** / HPC" is **Cluster** (gather in one place), "**fault isolation** / high availability" is **Spread** (scatter across distinct hardware, limited to 7 per AZ per group), and "large-scale distributed DB / rack-level isolation" is **Partition**. Because Cluster gathers instances, there's a risk they die together if that area has a problem, so latency and isolation are in a trade-off relationship.

## Storage Performance Splits by Which of "IOPS, Throughput, or Parallel Access" Is the Bottleneck

Storage-performance keywords line up by which dimension the workload demands. **gp3** is the general-purpose SSD default; unlike gp2 it lets you provision IOPS and throughput independently of capacity and is cheaper (on the exam, "the EBS default is gp3" is a regular). When a mission-critical DB demands extreme IOPS, it's **io2 Block Express**. When multiple instances must **read the same file system in parallel simultaneously**, you need shared file storage — which splits into **EFS** (multi-AZ Linux NFS, auto-scaling) and **FSx for Lustre** (an ultra-fast parallel file system for HPC/ML, integrated directly with S3). To upload large objects quickly from afar, it's **S3 Transfer Acceleration** (upload acceleration through CloudFront edges).

> 💡 **Related theory**: The reason FSx for Lustre is overwhelming for ML training lies in its **parallel file system** architecture. Lustre stripes files finely across a metadata server and many object storage targets (OSTs) to distribute storage, so even when hundreds of compute nodes read one dataset simultaneously they aren't bottlenecked on a single disk's bandwidth but produce hundreds of GB/s of aggregate throughput. Ordinary NFS (EFS), routing through a single mount target, can't reach such extreme parallelism. Moreover, FSx Lustre connects S3 directly as a backend (lazy load), rapidly pulling large S3 datasets in at training time — "S3 data + ultra-fast parallel + ML/HPC" is precisely Lustre's answer signal.

> ⚠️ **Pitfall**: Lumping EFS and FSx together in shared-storage choice gets it wrong. "Multiple Linux instances share, auto-scaling, simple management" is **EFS**, "HPC/ML, S3 integration, extreme parallel throughput" is **FSx for Lustre**, "Windows share (SMB)" is **FSx for Windows File Server**, and "NetApp ONTAP features" is **FSx for ONTAP**. Also, EBS is single-instance block storage (except the Multi-Attach io1/io2 exception), so it's basically unsuited to "sharing across multiple instances simultaneously."

## Database Performance Splits by "Where You Take Reads, How Close a Cache You Keep"

The first lever of DB performance is **spreading the read load**. **RDS Read Replicas / Aurora Readers** are read-only copies that pull read traffic off the primary. The second lever is **caching — putting data in memory to eliminate disk round-trips**. **DAX** (DynamoDB Accelerator) is a dedicated cache in front of DynamoDB that drops reads to **microseconds (μs)** (ElastiCache is in ms, a different order of magnitude). **ElastiCache Redis** caches sessions, leaderboards, and rich data structures; **MemoryDB** is a Redis-compatible in-memory DB that guarantees **durability** (usable as a primary DB, not just a cache). Search and log analytics is **OpenSearch**.

> 🔍 **Going deeper**: The secret to how DAX accelerates DynamoDB to μs is **removing network hops and serialization from the read path**. A direct DynamoDB call goes over HTTPS to the DynamoDB endpoint per request to fetch the result, taking single-digit ms. DAX is an in-memory cluster inside the same VPC as the application, so on a cache hit it responds immediately from memory without going to disk — let alone to DynamoDB — yielding μs. DAX is a **read-through/write-through** cache, so on a miss it auto-reads from DynamoDB to fill, and writes reflect to both DynamoDB and the cache. But DAX is DynamoDB-only and optimal for eventually-consistent reads, so its benefit shrinks for workloads with many strongly-consistent reads. "DynamoDB + μs reads" is DAX's sole answer signal.

> ⚠️ **Pitfall**: Seeing ElastiCache and MemoryDB as the same thing gets it wrong. **ElastiCache** is a volatile cache (data can be lost if a node dies), used for front-of-DB acceleration, while **MemoryDB** guarantees **durability** via a multi-AZ transaction log, delivering in-memory speed while being usable as a primary data store. "In-memory speed + no data loss (durable)" is MemoryDB; "front-of-DB cache + session/leaderboard" is ElastiCache. Also, DAX is DynamoDB-only, so for RDS/Aurora caching you must use ElastiCache.

## Network/Global and Messaging — Data Close to the User, Work Close to the Consumer

To give worldwide users fast responses, you must push data to the edge. **CloudFront** caches HTTP/HTTPS content (static files, video, APIs) at edge locations worldwide and responds near the user. **Global Accelerator** is different — not a cache, it **accelerates TCP/UDP traffic over AWS's global backbone network** and provides fixed Anycast IPs (games, VoIP: non-HTTP, uncacheable, fixed IP needed). "HTTP cache" is CloudFront; "UDP/TCP acceleration, fixed IP, non-HTTP" is Global Accelerator. When more extreme proximity is needed, it's **Local Zones** (compute in a major metro for single-digit ms) and **Wavelength** (5G carrier edge).

Messaging and streaming split by **consumption pattern**. **SQS** is a simple queue that absorbs surges (one message processed and deleted by one consumer), **Kinesis Data Streams** is a stream where multiple consumers can **read the same stream independently and replay it** (re-readable during the retention period), **Firehose** **auto-loads** streams into S3/Redshift, and **Managed Flink** does real-time stream analytics.

> 💡 **Related theory**: The fundamental principle of CloudFront's speed is that on a cache hit it **physically reduces the round-trip distance (propagation delay)**. Light takes about 5μs per km in fiber, so a Seoul user going directly to a Virginia origin (~11,000km) adds over 100ms in round trip alone. When CloudFront caches content at a Seoul edge, that distance shrinks to tens of km and the round trip becomes a few ms. Global Accelerator, by contrast, handles uncacheable (dynamic, real-time) traffic so it can't reduce distance, but it receives users at the nearest edge and carries them over **AWS's dedicated backbone instead of the public internet**, reducing packet loss and hop count to stabilize latency. Both solve the same goal — "close to the user" — in different ways: caching (CloudFront) and path optimization (GA).

> ⚠️ **Pitfall**: Confusing SQS and Kinesis gets it wrong. When **multiple consumers must process and replay the same data independently**, it's **Kinesis Data Streams** (with SQS, once one consumer takes a message it's deleted, so no replay). A fan-out + replay scenario like "an analytics team, a recommendation team, and a storage team each process the clickstream" is Kinesis. Conversely, "process work exactly once, absorb surges" is SQS. Also, a NAT Gateway can be a throughput/cost bottleneck, so for S3/DynamoDB access, bypassing NAT with a **Gateway Endpoint** (free) is the answer for both performance and cost.

## Comparing Other Clouds' High-Performance Services

| Category | AWS | Azure | GCP |
|------|-----|-------|-----|
| HTTP CDN | CloudFront | Azure CDN / Front Door | Cloud CDN |
| Network acceleration (non-HTTP) | Global Accelerator | Front Door (Anycast) | Cloud Load Balancing (Anycast) |
| In-memory cache | ElastiCache / MemoryDB | Azure Cache for Redis | Memorystore |
| HPC parallel file system | FSx for Lustre | Azure Managed Lustre | Parallelstore / Filestore |
| Stream processing | Kinesis / MSK | Event Hubs | Pub/Sub / Dataflow |
| ARM value chip | Graviton | Cobalt / Ampere Altra | Tau T2A (Ampere) |

All three clouds have the same performance toolbox: "edge cache + backbone acceleration + in-memory cache + parallel file + stream + ARM chip." AWS's distinguishing feature is that the tools are split finely (CloudFront vs. GA, ElastiCache vs. MemoryDB, DAX as a dedicated cache), letting you pick precisely per workload — which is why the exam relentlessly asks these fine distinctions.

> 🔍 **Going deeper**: DynamoDB's **Hot Partition** problem is a signature anti-pattern of the high-performance domain. DynamoDB distributes data across multiple physical partitions by hashing the partition key, but if traffic piles onto a specific key (e.g., "today's date" or "a popular product ID"), only that partition hits its throughput limit and throttling occurs — the whole slows down even though other partitions are idle, the same phenomenon as Amdahl's-law serial bottleneck. The solution is to design the partition key for **even distribution** (use a high-cardinality key, or add a random suffix to the key via write sharding). The key point is that this is **a bottleneck solved by data modeling**, not by adding instances, and when you see "DynamoDB throttling on a specific key" on the exam, PK distribution is the answer.

## Checking It Yourself with the CLI

```bash
# Configure Lambda Provisioned Concurrency (eliminate cold starts)
aws lambda put-provisioned-concurrency-config --function-name api-fn \
  --qualifier prod --provisioned-concurrent-executions 50

# Create a DAX cluster (DynamoDB μs reads)
aws dax create-cluster --cluster-name orders-dax --node-type dax.r5.large \
  --replication-factor 3 --iam-role-arn arn:aws:iam::...:role/DaxRole

# Create a Cluster Placement Group (HPC low latency)
aws ec2 create-placement-group --group-name hpc-cluster --strategy cluster

# Create FSx for Lustre + S3 integration
aws fsx create-file-system --file-system-type LUSTRE \
  --storage-capacity 1200 --lustre-configuration ImportPath=s3://ml-data/

# Create an S3 Gateway Endpoint (NAT bypass, free)
aws ec2 create-vpc-endpoint --vpc-id vpc-123 --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-abc
```

## Wrapping Up

The high-performance domain (24%) reduces to two levers: "how close you keep data and compute to the point of consumption (proximity), and how finely you split for parallelism (parallel)." ① **Compute** is chips (Graviton/GPU/Inferentia/Trainium) and placement (Cluster = low latency, Spread = isolation), with Provisioned Concurrency for cold starts. ② **Storage** is by dimension — IOPS is io2 Block Express, parallel sharing is EFS (general) / FSx Lustre (ML/HPC + S3), and the default is gp3. ③ **DB** is read spreading (Read Replica) and caching (DAX = μs dedicated, ElastiCache = ms cache, MemoryDB = durable). ④ **Global** is CloudFront (HTTP cache) vs. Global Accelerator (TCP/UDP backbone acceleration, fixed IP), and messaging is SQS (simple queue) vs. Kinesis (multiple consumers, replay). Remember that Hot Partition and NAT bottlenecks are serial bottlenecks solved by the data model and a Gateway Endpoint, not by adding instances.

In the next article, we'll re-weave Domain 4, cost optimization, by the principle "cost is decided by design."

---

## 📝 연습 문제

**문제 1.** You train an ML model on a large dataset; the data is in S3 and hundreds of nodes must read it in ultra-fast parallel. What is the most suitable storage?

A) EFS Max I/O B) FSx for Lustre C) FSx for ONTAP D) gp3 EBS

**정답: B**

해설: **FSx for Lustre**, with its parallel file system architecture, produces hundreds of GB/s of aggregate throughput even when hundreds of nodes read one dataset simultaneously, and **integrates S3 directly as a backend** to rapidly pull in large training data — the answer for "S3 + ultra-fast parallel + ML/HPC." EFS (A) is single-mount-target NFS and can't reach extreme parallelism, ONTAP (C) is a general-purpose file service for NetApp features, and gp3 (D) is single-instance block storage, unsuited to multi-node sharing.

---

**문제 2.** An application reading DynamoDB needs microsecond (μs) responses. What is appropriate?

A) DAX B) ElastiCache Redis C) MemoryDB D) Add a GSI

**정답: A**

해설: **DAX** is a DynamoDB-dedicated in-memory accelerator; on a cache hit it responds immediately from memory in the same VPC without going to DynamoDB, yielding **microseconds**. ElastiCache (B) is a general-purpose cache in the millisecond (ms) range and its DynamoDB integration isn't automatic, MemoryDB (C) is a durable in-memory DB not a DynamoDB accelerator, and a GSI (D) merely expands query patterns and doesn't drop read latency to μs. "DynamoDB + μs" = DAX is the sole answer signal.

---

**문제 3.** A global multiplayer game must reduce the latency of UDP-based real-time traffic and needs a fixed IP. What is the appropriate service?

A) CloudFront B) Global Accelerator C) NLB only D) Route 53 Latency

**정답: B**

해설: **Global Accelerator** accelerates uncacheable TCP/UDP traffic over AWS's dedicated backbone and provides **fixed Anycast IPs**, suiting real-time non-HTTP workloads like games and VoIP. CloudFront (A) is an HTTP/HTTPS content-cache service, unsuited to UDP game traffic; NLB alone (C) can't obtain global backbone acceleration and fixed Anycast IPs; and Route 53 Latency (D) is only DNS routing and doesn't accelerate the packet path. "UDP/TCP acceleration + fixed IP + non-HTTP" = Global Accelerator.

---

**문제 4.** An HPC workload must minimize inter-node network latency. What is the appropriate Placement Group strategy?

A) Cluster B) Spread C) Partition D) Multi-AZ distribution

**정답: A**

해설: A **Cluster Placement Group** physically gathers instances onto the same rack, same AZ to optimize inter-node network latency and bandwidth, suiting HPC and distributed training. Spread (B) scatters across distinct hardware to isolate failures, the opposite purpose; Partition (C) is for rack-level isolation in large-scale distributed systems; and Multi-AZ distribution (D) crosses AZs so inter-node latency actually grows. "Lowest inter-node latency / HPC" = Cluster. But gathering trades off against fault isolation.

---

**문제 5.** A single clickstream must be processed independently by an analytics team, a recommendation team, and an archive team, with the ability to replay past data when needed. What is the appropriate service?

A) SQS B) Kinesis Data Streams C) SNS D) EventBridge

**정답: B**

해설: **Kinesis Data Streams** lets multiple consumers read the same stream independently and **replay** past records during the retention period, the answer for a fan-out + replay scenario. SQS (A) deletes a message once a consumer takes it, so replay and multiple independent processing are impossible; SNS (C) pushes only at publish time (no replay); and EventBridge (D) is rule-based routing, not a stream-replay store. "Multiple consumers independent processing + replay" = Kinesis Data Streams.

---

## 📌 Key Takeaways

The high-performance domain (24%) reduces to two levers: keeping data and compute close to the point of consumption (proximity) and splitting finely for parallelism (parallel). Compute splits into chips (Graviton/GPU/Inferentia/Trainium) and placement (Cluster = low latency, Spread = isolation) and Provisioned Concurrency (cold starts); storage into io2 (IOPS) / EFS, FSx Lustre (parallel sharing, Lustre is S3 + ML) / gp3 (default). DB is read spreading (Read Replica) and caching (DAX = μs dedicated, ElastiCache = ms, MemoryDB = durable), global is CloudFront (HTTP cache) vs. Global Accelerator (TCP/UDP backbone, fixed IP), and messaging is SQS (simple queue) vs. Kinesis (multiple consumers, replay). Amdahl's-law lesson: Hot Partition and NAT bottlenecks are serial bottlenecks solved by PK distribution and a Gateway Endpoint, not by scaling out.
