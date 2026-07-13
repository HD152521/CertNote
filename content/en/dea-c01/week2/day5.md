# Day 5 - Week 2 Synthesis: Data Ingestion Part 1 Review

This week we surveyed "ingestion" — the starting point of data engineering — divided into batch and streaming. Today we unify the scattered pieces into a single decision map. 90% of DEA-C01 ingestion questions boil down to "which service for this scenario?" and the answer always comes from keywords. The goal of this synthesis is to make you reflexively map scenario → service.

## Ingestion Services Map (One Page)

```
                        Data Ingestion
                            │
        ┌───────────────────┴───────────────────┐
      Batch                                  Streaming
        │                                       │
  ┌─────┼─────────┬──────────┐         ┌────────┼──────────┬─────────┐
S3 Upload  DataSync  Transfer   Snow     KDS      Firehose    MSK
(One-time  (Repeat   Family    (PB/slow  (Real-   (Near       (Existing
 /small)   sync,verify SFTP)   network) time,    real-time    Kafka)
                               multi-    simple
                               consumer  delivery)
                               /replay)
```

## Batch Services Review

| Service | One-Liner | Decision Keywords |
|--------|-----------|--------------|
| S3 Upload | Data lake landing zone | One-time, small volume; multipart (large); Lifecycle abort |
| DataSync | On-premises ↔ AWS auto-sync | Large, repeating schedule, incremental, integrity verify, metadata preserve, sufficient bandwidth |
| Transfer Family | SFTP/FTPS inbound gateway | External partners push via standard protocol, minimize code changes |
| Snow family | Physical shipment migration | Petabyte-scale, slow network, one-time |

> 💡 **Related theory**: Batch selection hinges on two axes: "data volume" and "network condition." With sufficient bandwidth, go online (DataSync); if bandwidth is limited or data is huge, go offline (Snow). Add the directional axis: "I pull (DataSync)" vs "external party pushes (Transfer Family)." Master these two axes and batch problems nearly solve themselves.

## Streaming Services Review

```
KDS      : Real-time pipe, shard-based, multi-consumer/replay possible, write consumer code.
Firehose : Near-real-time delivery pipe, buffering then auto-load to S3/Redshift/OpenSearch, minimal code.
MSK      : Managed Apache Kafka, standard open-source, portable, best for existing Kafka assets.
```

Three core distinctions to nail down.

1. **KDS vs Firehose** — Complex real-time processing, multiple consumers, replay → KDS. Simple delivery only → Firehose. Combining both (KDS source → Firehose loads to S3) solves "real-time analysis + raw archive" scenarios.
2. **Kinesis vs MSK** — See "existing Apache Kafka" → MSK. See "minimal ops, AWS-native, simple delivery" → Kinesis.
3. **Log model commonality** — KDS and Kafka are both append-only logs, so consumption doesn't delete, multi-consumer and replay work. Different from SQS.

```python
# Synthesis pattern: KDS (real-time analysis) + Firehose (raw S3 archive) running together
import boto3
firehose = boto3.client("firehose")

firehose.create_delivery_stream(
    DeliveryStreamName="raw-archive",
    DeliveryStreamType="KinesisStreamAsSource",          # Source from KDS
    KinesisStreamSourceConfiguration={
        "KinesisStreamARN": "arn:aws:kinesis:...:stream/clickstream",
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role"
    },
    S3DestinationConfiguration={
        "BucketARN": "arn:aws:s3:::my-data-lake",
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role",
        "BufferingHints": {"SizeInMBs": 128, "IntervalInSeconds": 300},
        "CompressionFormat": "GZIP"
    }
)
# Same clickstream consumed separately by real-time analysis Lambda → analysis + archival achieved simultaneously
```

> 💡 **Related theory**: Well-designed streaming architecture has "ingest → process → load" loosely coupled. KDS/MSK buffer ingest while feeding multiple downstreams simultaneously (real-time analysis, data lake loading, search indexing). This decoupling means one slow consumer doesn't block others or producers. This is why log-based streams beat simple queues for data platforms.

## Common Pitfall Summary

- **Incomplete multipart chunks** → invisible S3 cost, fix with Lifecycle abort rule
- **Hot shard/hot partition** → skewed partition key, switch to high-cardinality key
- **Small files problem** → increase Firehose buffer size for bigger files
- **Firehose can't replay** → if replay/multi-consumer needed, use KDS
- **Parallelism ceiling = shard/partition count** → adding consumers alone won't help
- **Redshift loading via S3 COPY** → not single INSERT

## Next Week Preview

Week 3 moves into the storage and organization layer (data lake, storage, catalog). Today's "how do we bring it in" map naturally connects to next week's "where and how do we store it." Solidify the ingestion keywords and we're ready.

## 📝 Practice Problems

**Problem 1.** In which scenario should KDS be preferred over Firehose?

A) Multiple consumers independently consume the same data; after bug fix, replay historical data  
B) Load streaming data to S3 with no additional code  
C) Minimize operational burden  
D) Load data directly to Redshift only  

**Answer: A**  
Explanation: Multi-consumer independent consumption and replay are KDS's core strengths. Firehose lacks retention and replay — data flows through to fixed destinations. A, C, D are all simpler delivery scenarios where Firehose is more appropriate.

---

**Problem 2.** On-premises file server data syncs nightly to S3 with incremental transfer, integrity verification. Network bandwidth is sufficient. Which service is most appropriate?

A) Snowball Edge  
B) Transfer Family  
C) AWS DataSync  
D) Kinesis Data Firehose  

**Answer: C**  
Explanation: Large volume, repeating schedule, incremental, integrity verify + sufficient bandwidth = DataSync. Physical shipping unnecessary with good bandwidth. Transfer Family is for inbound SFTP pushes from external parties. Firehose is for streaming delivery, not on-premises file sync.

---

**Problem 3.** A company operates existing Apache Kafka pipelines with Kafka Connect connectors and wants to migrate to AWS with minimal code changes. They also want to reduce cluster operations burden. Which approach is best?

A) Rewrite for Kinesis Data Streams  
B) Amazon MSK (MSK Serverless if desired)  
C) Migrate to SQS  
D) Transfer via Snowmobile  

**Answer: B**  
Explanation: Existing Kafka assets migrate code-free with MSK (standard API), and MSK Serverless auto-manages capacity for reduced ops. KDS rewrites require code changes, SQS isn't Kafka, and Snowmobile is physical data migration, not a streaming platform.

---

**Problem 4.** Firehose loads to S3, Athena queries are slow and expensive due to many small row-based JSON files. Two improvements are needed?

A) Reduce buffer interval, disable compression  
B) Change partition key to country  
C) Switch destination to OpenSearch  
D) Increase buffer size for larger files, convert to Parquet/ORC columnar format  

**Answer: D**  
Explanation: Larger buffer → fewer, bigger files (Athena has per-file overhead). Columnar format (Parquet/ORC) cuts scan volume. Reducing interval creates more small files (worse), disabling compression increases scan (costlier), OpenSearch doesn't align with Athena, partition key is for stream distribution, unrelated to Athena file problems.

---

**Problem 5.** Which characteristic do KDS and Amazon MSK share that distinguishes them from simple message queues like SQS?

A) Append-only log: within retention, data persists and multiple consumers can independently replay/reprocess at their own positions  
B) Messages are deleted immediately on consumption  
C) Throughput is fixed and doesn't scale  
D) Only single consumer supported  

**Answer: A**  
Explanation: Both KDS and MSK are distributed append-only logs. Data persists (not deleted on consumption), enabling multiple consumers to independently replay/reprocess from checkpoints/offsets within retention. SQS is a queue where consumption deletes. Both scale via shards/partitions and support multi-consumer, so other answers are false.

---
