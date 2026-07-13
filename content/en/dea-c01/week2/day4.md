# Day 4 - Amazon MSK (Kafka): Topics, Partitions, and When to Use What

The final piece of streaming ingestion is **Amazon MSK (Managed Streaming for Apache Kafka)**. If Kinesis is AWS's proprietary streaming service, Kafka is the industry-standard open-source streaming platform, and MSK is AWS offering Kafka as a managed service.

The key question mirrors yesterday's: "We have Kinesis, so why MSK? When do we use what?" Today we understand Kafka's fundamentals (topics, partitions, consumer groups) and see exactly where they diverge from Kinesis. The exam almost always compares these two.

## Kafka's Structure: Topics and Partitions

In Kafka, data is organized into **topics** — think of them as "subject-based logs" (e.g., `orders`, `clicks`, `sensor-data`). Each topic is further divided into **partitions**. A partition is Kafka's unit of parallelism and throughput.

```
Topic: orders
 ├─ Partition 0:  [msg0][msg1][msg2] ...   ← append-only log, order guaranteed
 ├─ Partition 1:  [msg0][msg1] ...
 └─ Partition 2:  [msg0][msg1][msg2][msg3] ...
```

You'll notice the structure mirrors KDS almost exactly. **Topic ≈ KDS stream, partition ≈ shard**. When a producer sends a message with a key, that key determines which partition receives it, and order is guaranteed within a partition. This is identical to KDS's partition key concept.

```python
from kafka import KafkaProducer
producer = KafkaProducer(bootstrap_servers="b-1.msk.amazonaws.com:9092")

# Key (user-8821) determines partition → same user messages go to same partition, order preserved
producer.send("orders", key=b"user-8821", value=b'{"item":"book","qty":2}')
producer.flush()
```

> 💡 **Related theory**: Kafka and Kinesis both share the "distributed append-only log" model. Messages don't vanish when consumed (they're kept within retention), and multiple consumer groups independently read from their own offsets. This is fundamentally different from traditional queues like SQS. This is why Kafka veterans quickly understand Kinesis and vice versa. The exam checks if you grasp this "conceptual 1:1 mapping." Topic ↔ Stream, Partition ↔ Shard, Offset ↔ Checkpoint.

## Consumer Groups and Offsets

Consumers are organized into **consumer groups**. Within a group, partitions are distributed among consumers so each partition is read by only one consumer in that group (parallel processing). Different groups independently read all partitions from the same topic (fan-out).

Each consumer group tracks its progress with **offsets** — essentially "how far we've read." This is equivalent to KDS's checkpoint managed by KCL (stored in DynamoDB).

```
Topic orders (3 partitions)
 ├─ consumer-group-A (real-time payment) : partition-0→C1, partition-1→C2, partition-2→C3
 └─ consumer-group-B (data lake load)   : same topic, independent offset, separate consumption
```

> 💡 **Related theory**: If consumer count exceeds partition count, excess consumers sit idle (one partition = one consumer per group). To increase throughput, you must increase partition count, not just consumer count. This mirrors KDS: adding consumers without enough shards limits parallelism. The formula "parallelism ceiling = partition (shard) count" applies to both. This is why topic design in Kafka and shard count in Kinesis are critical scaling decisions.

## MSK: Managed, But Kafka Is Still Kafka

MSK handles provisioning, patching, and failure recovery of Kafka brokers and ZooKeeper (or KRaft) for you. But you still **must understand and design clusters, brokers, and partitions**. If you want full serverless, **MSK Serverless** auto-manages capacity.

```
- MSK (Provisioned):  You specify broker instance type and count, fine-grained control
- MSK Serverless    : Auto-scales capacity, pay per usage, minimal operations
- MSK Connect       : Managed Kafka Connect (source/sink connectors for system integrations)
```

## Kinesis vs MSK: When to Use What

This is today's core point.

| Dimension | Kinesis (KDS/Firehose) | Amazon MSK |
|------|----------------------|-----------|
| Standard | AWS proprietary | Open-source Apache Kafka (portability ↑) |
| Operational burden | Minimal (especially Firehose/On-demand) | Relatively higher (cluster-aware design needed) |
| Existing assets | Good for AWS-native greenfield | Good when you already own Kafka code/team/ecosystem |
| Ecosystem | AWS integrations built-in | Kafka Connect, Streams, rich third-party support |
| Throughput | Shard-based, On-demand auto-scales | Very high via broker/partition tuning |

The decision framework is straightforward.

- **Already running Kafka (code, connectors, team skills) → MSK.** Existing Kafka applications lift-and-shift with minimal changes.
- **Starting fresh on AWS, want to minimize operations → Kinesis.** Especially Firehose for simple delivery.
- **Portability across on-premises/multi-cloud matters → Kafka (MSK).** Kinesis locks you to AWS.

> 💡 **Related theory**: On the exam, the decisive keyword is "existing Apache Kafka workload" or "existing Kafka application." If you see that phrase, MSK is almost always correct because you're reusing the Kafka ecosystem (Connect, Streams, existing topic schemas, consumer code). Conversely, "minimize operational burden," "serverless," "AWS-native greenfield," "simple S3/Redshift loading" point to Kinesis. The two services overlap functionally, so the answer depends not on technical superiority but on "existing assets and operational model." This insight alone wins half of comparison questions.

## Connecting Data to Analytics

How do you move data from MSK into your analytics stack? Use **MSK Connect's** sink connectors (e.g., S3 Sink) to dump topic data to S3, or consume Kafka with Lambda or Amazon Managed Service for Apache Flink for real-time processing before sending downstream. Like KDS, the "ingest → process → load" flow is identical.

## Summary

- Kafka structure: Topic ≈ KDS stream, Partition ≈ Shard, Offset ≈ Checkpoint
- Consumer groups enable parallel consumption + group-independent fan-out; parallelism ceiling = partition count
- MSK = managed Kafka (cluster-aware required), MSK Serverless = auto-capacity
- Decision: Existing Kafka assets/portability → MSK / Minimal ops, AWS-native, simple delivery → Kinesis

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
