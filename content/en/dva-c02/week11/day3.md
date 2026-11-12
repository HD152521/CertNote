# Day 53 - Kinesis: Real-Time Streaming

📅 Date: July 28, 2026 (Tuesday)  
🎯 Topic: Amazon Kinesis  
⏱️ Study Time: Approximately 90 minutes

---

## 🎯 Learning Objectives

- Distinguish roles of 4 Kinesis services
- Understand Kinesis Data Streams shard concept
- Identify differences between Kinesis and SQS/SNS

---

## 📖 Theory Content

### 1. What is Amazon Kinesis?

A family of services for collecting, processing, and analyzing real-time streaming data.

**4 Services:**
- **Kinesis Data Streams**: Real-time data streaming, direct processing
- **Kinesis Data Firehose**: Fully managed data delivery to S3/Redshift/OpenSearch
- **Kinesis Data Analytics**: Analyze streaming data using SQL
- **Kinesis Video Streams**: Video streaming

### 2. Kinesis Data Streams

```
Shard Structure
================================

[Producer]
  |
  | Determine shard based on partition key
  v
[Shard 1] [Shard 2] [Shard 3]
  Each shard:
    - Write: 1MB/s or 1,000 records/s
    - Read: 2MB/s
    - Retention: Default 24 hours (maximum 7 or 365 days)
  |
  v
[Consumer (Lambda, KCL, SDK)]
```

```python
import boto3
import json

kinesis = boto3.client('kinesis')

# Send record
kinesis.put_record(
    StreamName='order-stream',
    Data=json.dumps({'orderId': 'O001', 'amount': 50000}),
    PartitionKey='order-001'  # Same key = same shard (order guaranteed)
)

# Send batch (maximum 500, 5MB)
kinesis.put_records(
    StreamName='order-stream',
    Records=[
        {
            'Data': json.dumps({'orderId': f'O{i}'}),
            'PartitionKey': f'order-{i}'
        }
        for i in range(10)
    ]
)

# Read records
response = kinesis.get_shard_iterator(
    StreamName='order-stream',
    ShardId='shardId-000000000000',
    ShardIteratorType='LATEST'
)
shard_iterator = response['ShardIterator']

records = kinesis.get_records(
    ShardIterator=shard_iterator,
    Limit=10
)
```

### 3. Lambda and Kinesis Integration

```python
# Lambda consumes Kinesis stream
def lambda_handler(event, context):
    for record in event['Records']:
        # Base64 decode
        import base64
        payload = base64.b64decode(record['kinesis']['data']).decode('utf-8')
        data = json.loads(payload)
        
        print(f"Process order: {data['orderId']}")
        
        # Business logic processing
        process_order(data)
```

### 4. Kinesis Data Firehose

```
Fully Managed ETL Pipeline
================================

[Producer]
     |
     v
[Kinesis Data Firehose]
     |
     | Transform (Lambda, optional)
     | Buffer (1 minute or 1MB)
     v
[Destinations]
  - S3 (JSON, CSV, Parquet conversion)
  - Amazon Redshift
  - Amazon OpenSearch
  - Splunk
```

**Features:**
- Serverless, auto-scaling
- Buffer then batch delivery
- Near Real-Time rather than real-time (1+ minute delay)

### 5. Kinesis vs SQS

| Characteristic | Kinesis Data Streams | SQS |
|--------|---------------------|-----|
| Order | Order guaranteed per shard | FIFO only |
| Retention | 1~365 days | Maximum 14 days |
| Consumption | Multiple consumers simultaneously | Single consumer |
| Use Case | Real-time analytics, IoT | Job queue, decoupling |

---

## 🧠 Advanced Theory Worth Knowing

### Kinesis 4 Services Accurate Comparison (Exam Frequent)

| Service | Use Case | Management Level |
|--------|------|-----------|
| **Data Streams** | Real-time streaming (direct processing) | Shard management (or On-Demand) |
| **Data Firehose** | ETL → S3/Redshift/OpenSearch | Fully managed |
| **Data Analytics for Apache Flink** | Stream analysis with SQL/Flink | Managed |
| **Video Streams** | Video streaming (CCTV, IoT) | Managed |

### Kinesis Data Streams Capacity Modes (Exam New)

| Mode | Behavior |
|------|------|
| **Provisioned** | Specify number of shards directly |
| **On-Demand** (2021~) | Auto-scaling, 200 MB/s or 200,000 RPS limit |

### Shard Limits Summary (Accurate)

| Operation | Limit |
|------|------|
| **Write** | 1 MB/s or 1,000 records/s (per shard) |
| **Read (Classic)** | 2 MB/s or 5 GetRecords/s (shared by all consumers) |
| **Read (Enhanced Fan-Out)** | 2 MB/s **per consumer** (HTTP/2 push) |
| Data retention | 24 hours~365 days |
| Maximum record size | 1 MB |
| Partition key length | 1~256 characters |

### Enhanced Fan-Out (Exam Occasionally)

- Classic: Multiple consumers share same 2 MB/s
- Enhanced: Each consumer gets dedicated 2 MB/s
- Additional cost (hourly + data transfer)
- HTTP/2 push → 70 ms latency

### Producer Options

| Tool | Use |
|------|------|
| **KPL** (Kinesis Producer Library) | Batching, retry, CloudWatch auto, Java |
| **Kinesis Agent** | Auto-collect log files |
| **AWS SDK** | Simple direct calls |
| **Kinesis Client Library (KCL)** | Consumer use |

### Consumer Options

| Tool | Use |
|------|------|
| **KCL** | Distributed processing, checkpointing, shard auto |
| **Lambda** (ESM) | Serverless, auto-scaling |
| **Firehose** | Auto-deliver to S3 |
| **Data Analytics** | SQL/Flink analysis |

### Firehose Details (Exam Frequent)

| Item | Value |
|------|-----|
| Data transformation | Lambda (optional) |
| Format conversion | JSON → Parquet/ORC (auto) |
| Compression | GZIP, ZIP, Snappy |
| Buffering | Size (1~128 MB) or time (60~900 seconds) |
| Backup | S3 backup (failure or all data) |
| Pricing | Per GB ingested |
| Latency | **Minimum 60 seconds** (not real-time) |

### Firehose Destinations

| Destination | Notes |
|------|------|
| **S3** | Most common |
| **Redshift** | Via S3 → COPY command |
| **OpenSearch** | Direct indexing |
| **Splunk** | HEC endpoint |
| **HTTP Endpoint** | Custom |
| **3rd party** (Datadog, MongoDB, New Relic, etc.) | |

### Kinesis vs SQS vs SNS - Decision Table (Exam Scenarios Very Frequent)

| Scenario | Choose |
|----------|------|
| Asynchronous job queue | **SQS** |
| One publish → multiple receivers | **SNS** |
| Real-time log streaming + replay | **Kinesis Data Streams** |
| Logs → S3 storage (serverless ETL) | **Firehose** |
| One million RPS event processing | **Kinesis (On-Demand)** |
| Order and exactly-once | **SQS FIFO** |
| Mobile app push | **SNS Mobile Push** |

### Kinesis Data Analytics (Apache Flink)

- Apply SQL/Flink to streaming data
- Window functions (sliding, tumbling)
- Rarely on Developer exam (out of Developer scope)

### MSK (Managed Kafka) - Exam Occasionally

- Apache Kafka compatible (similar role to Kinesis)
- For existing Kafka users migrating
- Kinesis vs MSK: AWS native vs standard Kafka

### Related Service Cross-Reference

- **Kinesis + Lambda ESM** → [Week 3 Day 2]
- **DDB Streams ↔ Kinesis Streams for DDB** → [Week 6 Day 3]
- **Firehose ↔ S3 Athena** → Data lake
- **CloudWatch Logs Subscription → Firehose** → [Week 10 Day 1]

---

## Architecture Diagram

```
Real-Time Data Pipeline
================================

[Web App Click Events]
[IoT Sensor Data]
[App Logs]
         |
         | Send via Kinesis SDK/Agent
         v
[Kinesis Data Streams]
         |
         +-- Lambda (Real-time processing, alerts)
         |
         +-- KCL app (Complex processing)
         |
         v
[Kinesis Data Firehose]
         |
         +-- S3 (Data lake)
         |
         +-- Redshift (BI analytics)
         |
         +-- OpenSearch (Search)
```

---

## ⭐ Key Points

1. ⭐ **Shard**: Kinesis base unit, 1MB/s write, 2MB/s read
2. ⭐ **Partition Key**: Same key = same shard = order guarantee
3. ⭐ **Firehose**: Serverless ETL, deliver to S3/Redshift/OpenSearch
4. ⭐ **Data Retention**: Kinesis 24 hours~365 days, SQS maximum 14 days
5. ⭐ **Multiple Consumers**: Kinesis allows multiple consumers simultaneously

---

## 📝 Practice Questions

**Question 1.** What is the write throughput per shard in Kinesis Data Streams?

A) 10MB/s  
B) 1MB/s or 1,000 records/s  
C) 100MB/s  
D) 5MB/s  

**Answer: B** - Each Kinesis shard can write 1MB per second or 1,000 records per second.

---

**Question 2.** What is the easiest way to store real-time clickstream data to S3?

A) Kinesis Data Streams + Lambda + S3 direct storage  
B) Kinesis Data Firehose → S3  
C) SQS → Lambda → S3  
D) Direct S3 API calls  

**Answer: B** - Kinesis Data Firehose is serverless and automatically stores data to S3.

---

**Question 3.** What is the characteristic of records using the same partition key in Kinesis?

A) Distributed across different shards  
B) Stored in same shard, order guaranteed  
C) Priority processing  
D) Deduplication  

**Answer: B** - Records with same partition key always go to same shard with order guarantee.

---

**Question 4.** What is the most significant difference between Kinesis Data Streams and SQS?

A) Cost difference  
B) Kinesis allows multiple consumers to simultaneously read same data  
C) Processing speed difference  
D) Region restriction  

**Answer: B** - Kinesis retains data so multiple consumers can independently read from their positions.

---

**Question 5.** What is the minimum latency for Kinesis Data Firehose?

A) Immediate  
B) 1 minute  
C) 5 minutes  
D) 1 hour  

**Answer: B** - Firehose buffers data for batch delivery, so minimum 1 minute latency (Near Real-Time).

---

**Question 6.** Which statement about the latency characteristics of Firehose is correct?

A) It delivers immediately (in milliseconds)
B) It has a minimum 60-second buffer, so it is Near Real-Time and unsuitable for ultra-low-latency real-time processing
C) It is always delayed by 1 hour
D) It has no delay and also allows reprocessing

**Answer: B** - Firehose buffers data by size (1-128 MB) or time (60-900 seconds) and then delivers it in batches, so there is a **minimum 60-second** delay (Near Real-Time). If you need "immediate processing within 1 second," you must consume Data Streams directly. A is closer to Data Streams (EFO, about 70 ms). C) 1 hour is far off, even longer than the maximum buffering (900 seconds = 15 minutes). D) Firehose is pass-through, so it has no retention or reprocessing.

---

**Question 7.** While Lambda consumes a Kinesis stream, one record keeps failing to process. The records after it are not processed and are stuck. Which description of this phenomenon and the response is correct?

A) Like SQS, only that record is automatically moved to a DLQ
B) Head-of-line blocking occurs because order is preserved within a shard, and it is mitigated by configuring BisectBatchOnFunctionError, MaximumRetryAttempts, and a failure destination (SQS/SNS)
C) You must delete and recreate the stream
D) Changing the partition key solves it

**Answer: B** - Kinesis **preserves order** within a shard, so a failed record cannot be skipped and the records behind it are blocked, which is **head-of-line blocking** (the price of order preservation). To mitigate this, the Lambda event source mapping provides options to split a batch in half to narrow down the problem record (`BisectBatchOnFunctionError`), limit the maximum number of retries (`MaximumRetryAttempts`), and send exhausted failed records to SQS/SNS (`DestinationConfig`). A) Unlike SQS, Kinesis cannot automatically pull out just one record. C and D are unrelated.

---

## 📌 Today's Summary

1. Kinesis Data Streams: Real-time streaming, shard-based, multiple consumers
2. Kinesis Data Firehose: Serverless ETL, delivers to S3/Redshift/OpenSearch
3. Shard: 1MB/s write, 2MB/s read, partition key determines shard
4. Retention period: Default 24 hours, maximum 365 days (extended retention)
5. Kinesis vs SQS: Kinesis for streaming/multi-consumer, SQS for job queue/single consumer
