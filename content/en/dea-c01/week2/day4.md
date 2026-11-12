# Day 4 - Amazon MSK (Kafka): Topics, Partitions, and When to Use What

## 📌 Key Takeaways

- The Kafka structure maps 1:1 to Kinesis: topic ≈ stream, partition ≈ shard, offset ≈ checkpoint.
- Within a consumer group, partitions are divided among the consumers, and separate groups each read everything independently. **The parallelism ceiling = the number of partitions.**
- MSK is managed Kafka. A provisioned cluster has you design brokers and partitions yourself, while MSK Serverless manages capacity automatically.
- The selection criterion is not technical superiority but assets and operating model: existing Kafka code, connectors, and portability point to MSK; minimal operations, AWS-native, and simple loading point to Kinesis.
- MSK data connects to the analytics stack through MSK Connect, Firehose, Lambda, Flink, and Redshift streaming ingestion.

## Kafka Structure: Topics and Partitions

The final piece of streaming ingestion is **Amazon MSK (Managed Streaming for Apache Kafka)**. If Kinesis is AWS's proprietary streaming service, Kafka is the industry-standard open-source streaming platform, and MSK is the service in which AWS provides that Kafka as a managed offering.

The core question is the same as yesterday: "Kinesis exists, so why MSK? When do I use which?" Today we grasp Kafka's basic concepts (topics, partitions, consumer groups) and see exactly where it diverges from Kinesis. On DEA-C01 this comparison almost always appears.

In Kafka, data is classified by **topic**. Think of a topic as a "log per subject" (for example `orders`, `clicks`, `sensor-data`). Each topic is in turn split into several **partitions**. The partition is Kafka's unit of parallelism and throughput.

```
Topic: orders
 ├─ Partition 0:  [msg0][msg1][msg2] ...   ← append-only log, order guaranteed
 ├─ Partition 1:  [msg0][msg1] ...
 └─ Partition 2:  [msg0][msg1][msg2][msg3] ...
```

As you may have noticed, the structure is nearly the same as KDS. **Topic ≈ stream, partition ≈ shard.** When a producer sends a message and specifies a key, that key determines which partition it goes to, and order is guaranteed within a single partition. This is identical to the partition key concept in KDS.

```python
from kafka import KafkaProducer
producer = KafkaProducer(bootstrap_servers="b-1.msk.amazonaws.com:9092")

# The key (user-8821) decides the partition -> messages from the same user go to the same partition, order guaranteed
producer.send("orders", key=b"user-8821", value=b'{"item":"book","qty":2}')
producer.flush()
```

> 💡 **Related theory**: Kafka and Kinesis both share the "distributed append-only log" model. Messages do not disappear when consumed (they are kept for the retention period), and multiple consumer groups read independently from their own offsets. In this respect both are fundamentally different from a traditional queue such as SQS. That is why someone with Kafka experience quickly understands Kinesis, and vice versa. The exam checks whether you know this "conceptual 1:1 mapping."

## Consumer Groups and Offsets

Consumers are bundled into **consumer groups**. Within one group, partitions are distributed among the consumers, so each partition is read by only one consumer in the group (parallel processing). Different groups each read the whole topic independently (fan-out).

Each consumer group records how far it has read as an **offset**. It is the same concept as a KDS checkpoint (which KCL stores in DynamoDB).

```
Topic orders (3 partitions)
 ├─ consumer-group-A (real-time payment processing) : partition0→C1, partition1→C2, partition2→C3
 └─ consumer-group-B (data lake loading)            : consumes the same topic separately with its own independent offsets
```

> 💡 **Related theory**: If the number of consumers exceeds the number of partitions, the excess consumers sit idle (because one partition is read by only one consumer in the group). So to raise throughput, you must provision enough partitions rather than just adding consumers. This is the same principle as in KDS, where adding consumers still limits parallelism if shards are insufficient. The formula "parallelism ceiling = number of partitions (shards)" applies to both.

## MSK: Managed, but Kafka Is Still Kafka

MSK has AWS handle the provisioning, patching, and failure recovery of Kafka brokers and ZooKeeper (or KRaft). But you still have to **be aware of and design the cluster, brokers, and partitions** yourself. If you need fully serverless, **MSK Serverless** manages capacity automatically.

```
- MSK (Provisioned): You specify broker instance type and count, fine-grained control
- MSK Serverless   : Automatic capacity, usage-based billing, minimal operational burden
- MSK Connect      : Managed Kafka Connect (connect systems with source/sink connectors)
```

## Kinesis vs MSK: When to Use What

This is the key point of today.

| Criterion | Kinesis (KDS/Firehose) | Amazon MSK |
|------|----------------------|-----------|
| Standard | AWS proprietary | Open-source Apache Kafka (higher portability) |
| Operational burden | Minimal (especially Firehose/On-demand) | Relatively large (cluster awareness required) |
| Existing assets | Suited to new AWS builds | When you already have Kafka code/team/ecosystem |
| Ecosystem | AWS integrations built in | Rich: Kafka Connect, Streams, third parties |
| Throughput | Per shard, On-demand automatic | Very high by tuning brokers/partitions |

The key decision criteria are simple.

- **You already use Kafka (code, connectors, team expertise) → MSK.** You can move an existing Kafka application over as-is with almost no code changes (lift and shift).
- **You are starting fresh on AWS and want to minimize operational burden → Kinesis.** Especially Firehose if it is simple loading.
- **Portability to on-premises/multi-cloud matters → Kafka (MSK).** Kinesis is tied to AWS.

The decisive keyword on the exam is "existing Apache Kafka workload/application." When this phrase appears, MSK is likely the answer. That is because you need to reuse the Kafka ecosystem (Kafka Connect, Kafka Streams, existing topic design, consumer code). Conversely, expressions like "minimal operational burden," "serverless," "AWS-native new build," or "simple S3/Redshift loading" point to Kinesis. Since the two services overlap in functionality, the answer is decided not by technical superiority but by "existing assets and operating model."

## Connecting to Data Loading

Here is how you send data that has entered MSK to the analytics stack. You load topic data into S3 with a sink connector of **MSK Connect** (for example the S3 Sink), or process it in real time with Lambda or Flink (Amazon Managed Service for Apache Flink) consuming Kafka and then send it downstream. As with KDS, the flow of "ingest → process → load" is the same.

## Replication and Durability: How Kafka Protects Data

With Kinesis, the service handles replication on its own, so there is no value for you to touch. In Kafka, you **assemble durability through settings**. Even though MSK is managed, the responsibility for these settings remains with you.

```
Topic orders, partition 0, replication factor 3
  Broker 1 (AZ-a) : leader      ← where producers and consumers attach
  Broker 2 (AZ-b) : follower    ← replicates by following the leader
  Broker 3 (AZ-c) : follower
  ISR (in-sync replicas) = the set of replicas keeping up with the leader in time
```

| Setting | Where | Meaning |
|------|------|------|
| Replication factor | Topic | How many brokers one partition is replicated to |
| `acks` | Producer | `0` does not wait for a response / `1` succeeds once the leader writes it / `all` succeeds only when the whole ISR has written it |
| `min.insync.replicas` | Broker/topic | When `acks=all`, the minimum number of replicas that must receive the write for it to count as successful |

- The standard for a no-loss configuration is **replication factor 3 + `min.insync.replicas=2` + producer `acks=all`**. Even if one broker dies, writes continue, and an acknowledged message exists in at least two places.
- The default MSK cluster configuration for a 3-AZ cluster has a default replication factor of 3 and `min.insync.replicas` of 2 (for a 2-AZ cluster, 2 and 1 respectively). Automatic topic creation (`auto.create.topics.enable`) is off by default, and the default number of partitions is 1.
- If you send with `acks=1`, a message disappears if the leader receives it and dies before replicating. This is usually the cause in a passage saying "some messages are missing after a broker failure."
- When a broker fails, MSK detects it and replaces it, reusing the existing storage where possible to reduce the amount that must be re-replicated. The broker address is retained even after recovery.

Kafka used to keep cluster metadata in Apache ZooKeeper, and recent versions are moving to **KRaft** mode, in which a group of Kafka internal controllers manages it directly. MSK offers both approaches, and MSK operates the ZooKeeper nodes or KRaft controllers at no additional cost. On the exam you do not need "do I have to operate ZooKeeper myself?" but only the fact that "MSK operates it for you."

## Three Cluster Types

Not everything called "MSK" has the same operational burden.

| Category | Provisioned · Standard brokers | Provisioned · Express brokers | MSK Serverless |
|------|------|------|------|
| What you decide | Broker instance type and count, storage per broker | Broker instance type and count | Nothing (just create the cluster) |
| Storage | You provision it (up to 16,384 GiB per broker); auto scaling and tiered storage selectable | Managed by the service, billed for what you write, effectively unlimited | Managed by the service |
| Scaling | Rebalancing partitions is required after adding brokers | The same task is much faster than with Standard | Automatic |
| Control over Kafka settings | Widest | Best-practice settings are pre-applied and some are fixed | Limited |
| Authentication | IAM, SASL/SCRAM, mutual TLS | Uses the authentication methods of provisioned clusters (check the documentation by broker type and version for the detailed support scope) | **IAM only** (Kafka ACLs not supported) |
| Key limits | Depend on instance size | Throughput quotas by instance size | Cluster ingress 200 MB/s and egress 400 MB/s, ingress 5 MB/s per partition, maximum message 8 MiB |
| Suitable situation | Fine-tuning settings, keeping the same configuration as an existing cluster | When you want to reduce storage and scaling operations at high throughput | When traffic fluctuates widely and you do not want to do capacity planning |

- If "Kafka compatible + minimal operational burden" appear together, it is **MSK Serverless**. However, if there is a condition that existing clients authenticating with SASL/SCRAM or mutual TLS must be attached as-is, Serverless does not fit.
- Serverless has a fixed per-partition ingress limit, so a workload where traffic is concentrated on a single key is better on provisioned.

## Authentication, Authorization, and Network

With Kinesis, you just call the Regional endpoint with IAM and you are done. MSK has you **connect to brokers inside a VPC**, so you design networking and authentication separately.

| Method | Authentication | Authorization | Port (access from inside AWS) |
|------|------|------|------|
| Plaintext | None | — | 9092 |
| TLS (including mutual TLS authentication) | Client certificate | Kafka ACL | 9094 |
| SASL/SCRAM | Username and password (stored in Secrets Manager) | Kafka ACL | 9096 |
| IAM access control | IAM role or user | IAM policy (per topic and group) | 9098 |

- **IAM access control** handles authentication and authorization with a single IAM policy. It is the simplest when connecting from other AWS services (Lambda, Firehose, Glue).
- If an existing Kafka client was using SASL/SCRAM, put the credentials in Secrets Manager and associate them with the cluster.
- Brokers are placed in subnets of your VPC. If the consumer is in another VPC or account, you need one of VPC peering, Transit Gateway, or multi-VPC private connectivity. The cause of "Lambda cannot connect to MSK" is usually the subnet or security group.
- Glue's Kafka connection supports only TLS endpoints. The `9092` (plaintext) in the example in the body is for learning, and in production you use a port with in-transit encryption enabled.

## The Number of Partitions Is Hard to Undo Once Set

| Item | Kafka (MSK) partitions | Kinesis shards |
|------|------|------|
| Increase | Possible | Possible (split) |
| Decrease | **Not possible** (you must create a new topic and move over) | Possible (merge) |
| Key mapping when increasing | `hash(key) % number of partitions` changes, so the same key goes to a different partition | The hash range is split in half, so the parent → child relationship is preserved |
| Effect on ordering | Order of the same key can break before and after the increase | Preserved if you read the parent shard completely and then read the children |

- That is why the convention in Kafka is to provision partitions **generously** from the start. However, the more partitions, the more broker memory, file handles, and leader election time grow, so you set them within the recommended number of partitions per broker size.
- The number of partitions is decided by the larger of "target throughput ÷ throughput per partition" and "required consumer parallelism." To run 10 consumers in parallel, you need at least 10 partitions.
- Messages with a key are placed by key hash, while for **messages without a key** the producer spreads them evenly across partitions. If order is not needed, leaving the key empty is advantageous for distribution.

## Retention: Time-Based and Log Compaction

- Kafka's default retention is **time-based deletion**. The default is 7 days, changed per topic (`retention.ms`). You can also set a size-based limit (`retention.bytes`) alongside it.
- **Log compaction** (`cleanup.policy=compact`) is a feature Kinesis does not have. It deletes the old values of the same key and leaves only **the latest value per key**. It is for holding "the current state per customer" in a topic permanently while a new consumer reads from the beginning to restore the state.
- If you need long-term retention, use **tiered storage** on Standard brokers to move old segments to a low-cost tier, or load into S3 from the start and do reprocessing from S3.
- Kinesis is 24 hours by default and up to 365 days. Both are the same in that extending retention adds charges.

## Ways to Connect MSK to the Analytics Stack

| Method | Direction | What it does | When to choose |
|------|------|------|------|
| MSK Connect (source connector) | External → topic | Puts a DB change log into a topic with a connector such as Debezium | Reusing existing Kafka Connect connectors, CDC into Kafka |
| MSK Connect (sink connector) | Topic → external | Exports to S3, OpenSearch, and so on | Using the connector ecosystem, fine control over format and partitioning |
| Data Firehose (MSK source) | Topic → S3, etc. | Loads without operating connectors | "Just accumulate the topic in S3" + minimal operations |
| Lambda event source mapping | Topic → function | Batch-unit invocation | Light per-record processing |
| Managed Service for Apache Flink | Topic ↔ topic/sink | Stateful real-time aggregation and joins | Window operations |
| Glue streaming ETL | Topic → S3/JDBC | Spark micro-batch | Reusing existing Glue code |
| Redshift streaming ingestion | Topic → materialized view | Ingests directly without going through S3 | Querying the warehouse at low latency |
| MSK Replicator | Cluster → cluster | Replication between MSK provisioned clusters in the same Region or different Regions | Disaster recovery, cross-Region data sharing |

- MSK Connect can attach not only to MSK clusters but also to a **self-managed Kafka** reachable from your VPC. You can auto-scale the connector workers or keep them at fixed capacity.
- "Move an on-premises Kafka Connect cluster without operational burden" is MSK Connect; "I don't know connectors, I just want to accumulate in S3" is Firehose.

## Kinesis vs MSK: Revisited with Numbers and Behavior

| Axis | Kinesis Data Streams | Amazon MSK |
|------|------|------|
| Capacity unit | Shard (write 1 MB/s and 1,000 records/s, read 2 MB/s) | Broker size × count, partitions |
| Durability settings | None (managed by the service) | You set replication factor, `acks`, `min.insync.replicas` |
| Retention | 24 hours to 365 days | Per configuration (effectively indefinite possible), compaction supported |
| Consumption model | Shared throughput / enhanced fan-out (limit on registered consumers) | Consumer groups (limits on the number of groups are much looser) |
| Shrinking | Shards can be merged | Partitions cannot be reduced |
| Access | Regional API endpoint + IAM | Brokers inside a VPC + IAM/SCRAM/TLS |
| Billing structure | Shard hours or data volume | Broker hours + storage (usage for Serverless) |
| Ecosystem | AWS service integrations built in | Kafka Connect, Kafka Streams, third-party tools |

- When messages are large, there are hundreds of topics, or there are dozens of consumer groups, the Kafka model is natural. For a simple structure of a few streams with a few consumers, Kinesis is lighter to operate.

## Passage Clue to Correct Answer Lookup Table

| Passage clue | Correct answer | Reason |
|------|------|------|
| "Existing Kafka application without code changes" | MSK | Kafka API compatible |
| "Kafka compatible + without capacity management" | MSK Serverless | Automatic scaling |
| "Existing Kafka Connect connectors without operational burden" | MSK Connect | Managed Kafka Connect |
| "Load an MSK topic into S3 without code" | Data Firehose (MSK source) | Managed loading |
| "No message loss even on broker failure" | Replication factor 3 + `acks=all` + `min.insync.replicas=2` | Confirmed by at least two replicas |
| "Added consumers but throughput is unchanged" | Increase the number of partitions | Parallelism ceiling = number of partitions |
| "Keep only the latest state per key" | Log compaction topic | Retains the last value for each key |
| "Replicate topics to another Region (DR)" | MSK Replicator | Cluster-to-cluster replication |
| "Control topic access with IAM roles" | IAM access control | No separate credentials needed |
| "New build, no Kafka experience, only S3/Redshift loading" | Data Firehose | MSK is overkill |

Tomorrow we tie the four batch services and three streaming services learned this week into a single decision map for review.

## 📖 Glossary

- **Broker**: A single server that makes up a Kafka cluster. It stores partition data and handles requests from producers and consumers.
- **Topic / partition**: A log that divides messages by subject, and the unit into which that log is split for parallel processing.
- **Offset**: The sequence number of a message within a partition. A consumer group records how far it has read with this number.
- **Consumer group**: A set of consumers that share the same job. Within the group they split the partitions, and groups are independent of one another.
- **Replication factor**: The number that sets how many brokers one partition is copied to.
- **ISR (in-sync replicas)**: The set of replicas keeping up with the leader in time. It is the basis for judging a write successful.
- **acks**: A setting that decides how many replica confirmations the producer waits for before a send counts as done.
- **Log compaction**: A retention method that deletes old messages of the same key and leaves only the latest value per key.
- **Kafka Connect**: A connector framework that links Kafka and external systems (DBs, S3, and so on) without code. MSK Connect provides it as a managed service.
- **Lift and shift**: A migration approach that moves an application as-is with almost no modification.

## 📝 Practice Problems

**Problem 1.** A company has run streaming pipelines on Apache Kafka for years on-premises and wants to move existing consumer/producer code and Kafka Connect connectors to AWS with minimal changes. Which service is most appropriate?

A) Kinesis Data Streams  
B) Kinesis Data Firehose  
C) Amazon MSK  
D) SQS  

**Answer: C**  
Explanation: "Migrate existing Apache Kafka workload with minimal code changes" is the textbook MSK scenario. MSK exposes standard Kafka APIs, so you can reuse existing client code, connectors, and topic schemas as-is (lift-and-shift). Kinesis requires API rewrites, and SQS isn't a streaming log model.

---

**Problem 2.** How does a Kafka partition most closely correspond to which Kinesis concept?

A) Shard  
B) Consumer group  
C) Delivery stream  
D) Retention period  

**Answer: A**  
Explanation: Kafka partitions map to KDS shards. Both are units of parallelism and throughput, with order guaranteed internally in an append-only log. Consumer groups are the consumption-side concept (equivalent to KCL apps), delivery streams are Firehose's unit, and retention is data retention duration.

---

**Problem 3.** A Kafka topic has 3 partitions and you consume it with 5 consumers in the same group. What happens?

A) All 5 consumers work evenly  
B) Only 3 consumers are active (one per partition), the other 2 sit idle  
C) Partitions automatically scale to 5  
D) Order guarantee breaks  

**Answer: B**  
Explanation: In a group, each partition is read by only one consumer, so when consumers exceed partitions, excess consumers have no partition to claim and sit idle. Parallelism ceiling is partition count. Partitions don't auto-scale (manual scaling required), and order is preserved per partition.

---

**Problem 4.** You're building a new streaming pipeline on AWS wanting minimal operations. Data only needs to load to S3 and Redshift. You have no Kafka experience or existing assets. What's the best choice?

A) Amazon MSK Provisioned  
B) Amazon MSK Connect  
C) Self-managed Kafka on EC2  
D) Kinesis Data Firehose  

**Answer: D**  
Explanation: Minimal operations + simple S3/Redshift delivery + no existing Kafka assets = Firehose (fully managed, serverless, destinations built-in). MSK requires cluster operations awareness (higher burden), EC2 is maximum operational burden, and MSK Connect presumes a Kafka ecosystem.

---

**Problem 5.** What fundamental characteristic do Kafka and Kinesis share that traditional message queues like SQS lack?

A) Append-only log model: within retention, multiple consumer groups independently re-consume at their own offsets  
B) Messages are deleted immediately upon consumption  
C) Only single consumer supported  
D) No order guarantee whatsoever  

**Answer: A**  
Explanation: Kafka and Kinesis both operate as distributed append-only logs: data persists within retention (not deleted on consumption), and multiple consumer groups independently read the same data from their own offsets and can replay/fan-out. SQS is a queue where consumption deletes messages. Single consumer constraints and no ordering are opposite to both services' design.

---
