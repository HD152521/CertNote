# Day 3 - Kinesis Data Firehose: Delivery Streams and Loading

## 📌 Key Takeaways

- Firehose (now named Amazon Data Firehose) is a **fully managed, near-real-time loading pipe** that lands a stream in a destination with no shards and no consumer code.
- The buffer is flushed when **either the size or the time threshold is reached first**. A larger size means bigger files and better efficiency; a shorter interval means lower latency and smaller files.
- Before loading, you can insert a **Lambda transformation** and a **Parquet/ORC format conversion** (which references a schema in the Glue catalog).
- Destinations are built in: S3, Redshift (COPY via S3), OpenSearch, Splunk, HTTP endpoints, and so on.
- Firehose itself offers no retention or replay. Records that fail transformation or delivery are routed to an S3 error location, so always monitor that path.

## KDS vs Firehose: The Most Important Distinction

The Kinesis Data Streams we saw yesterday is powerful but labor-intensive. You calculate the shard count, write consumer code (KCL/Lambda), manage checkpoints, and even implement yourself how the data should be laid out in S3. Often what you really want is "just load my streaming data into S3 or Redshift for me." **Amazon Kinesis Data Firehose** (now named Amazon Data Firehose) answers that need.

Firehose in one line is a "fully managed delivery pipe." When producers push data in, Firehose buffers it, optionally transforms, compresses, or converts its format, and loads it into the destination automatically. You do not worry about shards, consumer code, or scaling.

On DEA-C01, the difference between the two is the basis for judging scenario questions. The table below summarizes it.

| Item | Kinesis Data Streams | Kinesis Data Firehose |
|------|---------------------|----------------------|
| Nature | Real-time stream (pipe) | Delivery (loading) pipe |
| Management | You manage shards and consumers | Fully managed, serverless |
| Latency | Real time (milliseconds to seconds) | Near real time (delayed by the buffer; S3 default 300 seconds) |
| Data retention / replay | Possible (up to 365 days) | Not possible (data is flushed to the destination) |
| Custom consumers | Possible (multiple apps can read) | Loads only into the fixed destinations |
| Destinations | You implement them | Built in: S3/Redshift/OpenSearch/Splunk, etc. |

> 💡 **Related theory**: To memorize it in one line: "If you need complex real-time processing, multiple consumers, or replay, use KDS; if you only need to load data into a destination, use Firehose." An even stronger combination is to chain the two. With KDS as the source and Firehose reading that stream to load into S3, one side can run real-time analytics with Lambda or KCL while the other side has Firehose automatically archive the raw data in the data lake. When an exam question asks for both "real-time analytics + raw data retention," this combination is often the answer.

## Buffering: The Heart of Firehose

Firehose does not send records one by one. It collects them in a **buffer** and delivers them to the destination all at once. There are two buffer flush conditions, and delivery happens **when whichever is reached first** is met.

```
- Buffer size:     e.g. 5 MB    (1-128 MB for S3)
- Buffer interval: e.g. 300 sec (0-900 sec for S3, default 300 sec)
```

A larger buffer size produces bigger files (better downstream query efficiency) and better cost efficiency but adds latency, while a shorter buffer interval delivers faster but produces many small files. Tuning this trade-off is the core of Firehose design.

```python
import boto3
firehose = boto3.client("firehose")

firehose.create_delivery_stream(
    DeliveryStreamName="events-to-s3",
    S3DestinationConfiguration={
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role",
        "BucketARN": "arn:aws:s3:::my-data-lake",
        "Prefix": "events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/",
        "BufferingHints": {"SizeInMBs": 5, "IntervalInSeconds": 300},
        "CompressionFormat": "GZIP"
    }
)
```

The "small files problem" is a chronic disease of data lakes. Query engines such as Athena and Spark have per-file overhead, so a huge number of small files is much slower and more expensive than a few large ones. If you make the Firehose buffer size large enough (for example 128 MB), data lands as a small number of large files and downstream query performance improves. When an exam scenario says "Athena queries are slow + Firehose loading," think of increasing the buffer size.

## Transformation: On-the-Fly Processing with Lambda

Before loading, Firehose can **transform records with Lambda**. Lambda receives the incoming records, cleans, filters, or reformats them, and returns them, and the result is what gets loaded into the destination. It is used to normalize logs to standard JSON, mask sensitive fields, or filter out bad records.

```python
import base64, json

def handler(event, context):
    output = []
    for record in event["records"]:
        payload = json.loads(base64.b64decode(record["data"]))
        payload["ingested_at"] = context.aws_request_id   # example of processing
        transformed = json.dumps(payload) + "\n"           # add newline -> load line by line
        output.append({
            "recordId": record["recordId"],
            "result": "Ok",                  # Ok / Dropped / ProcessingFailed
            "data": base64.b64encode(transformed.encode()).decode()
        })
    return {"records": output}
```

Firehose can also convert JSON into the **Parquet/ORC columnar format** as a built-in feature (Data Format Conversion). It references the schema in the Glue Data Catalog. Loading in a columnar format makes Athena queries much faster and cheaper.

## Loading by Destination

Firehose's strength is that its destinations are built in.

- **S3**: The most common destination. Loads into the raw zone of a data lake as GZIP/Parquet.
- **Redshift**: Internally writes to S3 first and then loads into Redshift with the `COPY` command. It is not a direct INSERT.
- **OpenSearch**: Log and search indexing.
- **Splunk / third-party HTTP endpoints**.

```sql
-- The form Firehose runs internally when loading into Redshift
COPY events FROM 's3://my-data-lake/redshift-staging/manifest'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-copy'
FORMAT AS JSON 'auto';
```

The fact that Firehose's Redshift loading is "via S3, then COPY" is an exam point. Redshift is an MPP (massively parallel processing) data warehouse where single-row INSERTs are extremely inefficient, so bulk loading is always done by loading in parallel with COPY from S3. Firehose implements this best practice automatically under the hood. Even if COPY fails, the data remains in the intermediate S3 bucket it wrote first, so it can be loaded again.

## Error Handling

If the transformation Lambda fails or loading to the destination fails, Firehose does not discard the data; it sends it to the designated **S3 backup/error prefix**. This lets you investigate and reprocess failed records later. Configuring this backup bucket is the key to operational stability. The exception is when the destination is S3 and the S3 delivery itself fails, because then there is nowhere to send the data (see "Delivery Guarantees and Failure Handling by Destination" below).

## Three Sources, Two Names

There are three ways to put data into a Firehose stream. Which one you choose changes the limits and the behavior on failure.

| Source | How you put data in | Characteristics |
|------|------|------|
| Direct PUT | SDK `PutRecord`/`PutRecordBatch`, Kinesis Agent, integrations from AWS services such as CloudWatch Logs, IoT, and EventBridge | There is a per-stream throughput quota (defaults differ by Region; when throttling occurs the service raises it automatically, and you can also request an increase) |
| Kinesis Data Streams | Firehose becomes a consumer of the KDS stream and reads from it | The Direct PUT quota does not apply, and it scales with KDS ingestion. During a destination outage it holds out for as long as the KDS retention period |
| Amazon MSK | Firehose reads a Kafka topic | You load topics into S3 and elsewhere without operating a connector yourself |

- `PutRecordBatch` carries up to 500 records or 4 MiB per call, whichever is smaller. The limit for a single record is 1,000 KiB before base64 encoding.
- In 2024 the service name changed from **Amazon Kinesis Data Firehose to Amazon Data Firehose**. The documentation calls a "delivery stream" a "Firehose stream," but the API name (`CreateDeliveryStream`) is unchanged. Exam passages still use the old name.

## Buffer Hints by Destination

The buffer range differs by destination. If you memorize it as a single "Firehose is 60 seconds," you will get it wrong.

| Destination | Buffer size (default) | Buffer interval (default) |
|------|------|------|
| Amazon S3 | 1-128 MB (5 MB) | 0-900 sec (300 sec) |
| Amazon Redshift | 1-128 MB (5 MB) | 0-900 sec (300 sec) |
| OpenSearch Service / Serverless | 1-100 MB (5 MB) | 0-900 sec (300 sec) |
| Splunk | 1-5 MB (5 MB) | 0-60 sec (60 sec) |
| HTTP endpoint | 1-64 MB (5 MB) | 0-900 sec (60 sec) |

- Setting the interval to **0 seconds** delivers within a few seconds without buffering (zero buffering). In the past the minimum was 60 seconds, and the old claim that "Firehose has a minimum 60-second delay" comes from that.
- On an S3 destination, if you set the interval below 60 seconds, Firehose uses multipart upload to reduce latency, at the cost of higher S3 PUT request charges.
- Zero buffering **cannot be used together with dynamic partitioning**, and it does not apply to the buffer (60-900 seconds) on the S3 backup side either.
- The buffer hints are literally "hints." If delivery to the destination cannot keep up with ingestion, Firehose dynamically increases the buffer size to catch up.
- If you specify one of size and interval, you must specify the other as well.

> ⚠️ **Pitfall**: If you choose "reduce the buffer interval" as the remedy for "Athena queries are slow," it is the wrong direction. Reducing the interval makes files smaller and more numerous. The remedy for the small files problem is to increase the buffer **size** and also leave the interval generous. When ingestion volume is low, the time condition fills before the size condition is reached, so if the interval is short, increasing the size no matter how much does no good.

## Limits and Return Contract of the Transformation Lambda

Firehose **invokes Lambda synchronously** with the batch of records collected in the buffer. So Lambda's synchronous invocation limits apply directly as constraints.

| Item | Value |
|------|------|
| Buffer size hint for transformation | 0.2-3 MB (default 1 MB) |
| Buffer interval hint for transformation | 0-900 sec (default 60 sec) |
| Request and response payload | 6 MB or less each (Lambda synchronous invocation limit) |
| Maximum run time of one invocation | 5 minutes |
| Retry when invocation fails | 3 times by default; if it still fails, that batch is skipped |
| Where failed records go | The `processing-failed` folder of the S3 bucket |

- For every record it receives, the response must return `recordId`, `result`, and `data`. `result` is one of three values.
  - `Ok`: Transformation succeeded. `data` goes to the destination.
  - `Dropped`: Intentionally discarded. This is not an error, and the record goes neither to the destination nor to the error folder.
  - `ProcessingFailed`: Transformation failed. The record goes to the error folder.
- If the transformation **inflates** records, the response can exceed 6 MB and the whole invocation can fail. If your function is an enrichment that adds many fields, reduce the transformation buffer.
- When writing to S3, Firehose concatenates records with no delimiter. To make JSON readable line by line, either append a newline in the transformation function (the example in the body above) or turn on the option to add a newline delimiter. If you miss this, Athena reads only the first record of the file.
- When transformation is enabled, you can keep a **source record backup** in a separate S3 path. It is the basis for going back to the originals if the transformation logic had a bug.

## Constraints When You Enable Format Conversion

| Constraint | Details |
|------|------|
| Input format | JSON only. CSV and log text are first converted to JSON with a transformation Lambda |
| Destination | S3 only. With format conversion on, you cannot set Redshift, OpenSearch, or Splunk as the destination |
| Schema | References a Glue Data Catalog table. Attributes not in the schema are dropped from the output |
| Buffer size | Cannot be set below 64 MB; the moment you turn it on, the default becomes 128 MB |
| Compression | Leave the S3 compression setting (`CompressionFormat`) at `UNCOMPRESSED`; Snappy is applied by default at the serialization stage (GZIP can be chosen) |
| Deserializer | OpenX JSON SerDe or Hive JSON SerDe. Choose according to the timestamp format |
| JSON arrays | The `[{...},{...}]` form is not valid input. Send objects concatenated like `{...}{...}` |

- The reason the buffer lower bound is 64 MB is that a tiny columnar file is meaningless. Keep in mind that if you turn on format conversion for a low-volume stream, data does not arrive until the time condition is reached.

## Dynamic Partitioning: Splitting Folders by Record Content

The default prefix is `YYYY/MM/dd/HH` (UTC), and this is the **time Firehose received the record**. To split by the time the event actually occurred or by a field such as `customer_id`, use dynamic partitioning.

```
Prefix:
  events/customer_id=!{partitionKeyFromQuery:customer_id}/dt=!{partitionKeyFromQuery:dt}/
ErrorOutputPrefix:
  errors/!{firehose:error-output-type}/

Partition key extraction (inline parsing, jq expressions)
  customer_id : .customer_id
  dt          : .event_timestamp | strftime("%Y-%m-%d")
```

- There are two ways to extract keys. For JSON, use **inline parsing (jq expressions)**; if the data is compressed, encrypted, or not JSON, a **Lambda** computes and returns the keys.
- A separate buffer is created for each partition. The number of **active partitions** that can be open at the same time in one stream is **500 by default** (an increase can be requested), and when it overflows, the excess records fall into the error prefix.
- So you must not use a field with many distinct values, such as `user_id`, as a partition key. It exceeds the active partition limit, and even if it does not, files get split finely per partition. Values with few distinct kinds, such as date, Region, or tenant, are the right choice.
- With dynamic partitioning, delivery latency can grow up to 1.5 times the configured buffer time, and zero buffering cannot be used. An additional charge based on the amount of data processed also applies.
- If you write the prefix in `key=value/` form (Hive style), Athena and Glue recognize it as partitions.

## Delivery Guarantees and Failure Handling by Destination

"Firehose never loses data" is only half true. Where the data ends up differs by the kind of failure.

| Failure point | Firehose behavior | Where the data goes |
|------|------|------|
| Transformation Lambda fails | Retries the invocation (3 times by default), then skips | S3 `processing-failed` |
| Format conversion fails | Excludes that record | S3 error location |
| S3 delivery fails (permissions, deleted bucket, etc.) | Direct PUT retries for up to 24 hours; KDS and MSK sources retry up to the stream retention period | **Lost if the retry period is exceeded** |
| Redshift COPY fails | Retries for the retry duration you set (0-7,200 seconds), then skips that batch | The data remains in the intermediate S3, and the list of skipped objects is left as a manifest file in `errors/` so you can COPY manually |
| OpenSearch indexing fails | Skips after the retry duration (0-7,200 seconds) | S3 `AmazonOpenSearchService_failed/` |
| Splunk / HTTP endpoint | Waits for the response (acknowledgment) and retries for the retry duration | S3 backup bucket |

- When S3 is the destination and "S3 delivery itself fails," there is nowhere to go. If you wrongly change the IAM role permissions or bucket policy and a day passes, Direct PUT data disappears. This is why you set alarms on delivery metrics such as `DeliveryToS3.Success` and on the data freshness metric.
- Delivery is **at-least-once**. If a delivery request times out and later succeeds, it can overlap with the retry and produce duplicates (S3 destinations are an exception). On the Redshift and OpenSearch side, design to absorb duplicates by key.
- With KDS as the source, even if a destination outage drags on, you can hold out by extending the KDS retention period. This is also why the "real-time analytics + raw data retention" combination is advantageous in terms of durability.

## Cost Structure and Comparison with Alternatives

- The base price is proportional to the **amount of data ingested**. Direct PUT and KDS sources **round record size up to 5 KB units** (no rounding for MSK sources), so if you send 200-byte records one at a time, you are billed tens of times the actual size. Batching several items into one record at the producer is the pricing optimization.
- Format conversion, dynamic partitioning, and delivery inside a VPC are optional features with extra charges depending on throughput. VPC delivery also has an hourly per-AZ charge while the stream is active.
- Otherwise there is no charge for the time a stream is up. Unlike KDS provisioned mode (billed by shard hours), if there is no ingestion there is no ingestion charge.

| Requirement | Firehose | Alternative | When to choose the alternative |
|------|------|------|------|
| Stream to S3 loading | Done with configuration alone | Glue streaming ETL | When you need joins, complex transformations, or multiple sinks |
| Stream to Redshift | S3 staging, then COPY | Redshift streaming ingestion | When you need lower latency by receiving directly from KDS or MSK into a materialized view without going through S3 |
| Light per-record processing | Transformation Lambda | KDS + Lambda consumer | When you branch the processed results to multiple places or need replay |
| Load after window aggregation | Not possible (no aggregation feature) | Managed Service for Apache Flink to Firehose/S3 | When you need stateful operations |

## Passage Clue to Correct Answer Lookup Table

| Passage clue | Correct answer | Reason |
|------|------|------|
| "Query a JSON stream cheaply with Athena" | Firehose format conversion (Parquet) + Glue table | Columnar at load time |
| "Turn a stream arriving as CSV into Parquet" | Transformation Lambda (CSV to JSON) + format conversion | Format conversion input is JSON only |
| "Automatically split S3 folders by customer ID and by event date" | Dynamic partitioning | Prefix based on record content |
| "Athena reads only one line of the JSON accumulated in S3" | Add a newline delimiter between records | By default, records are concatenated with no delimiter |
| "Recover data that failed to load into Redshift" | Manual COPY using the `errors/` manifest | The originals remain in the intermediate S3 |
| "Prevent loss even if a destination outage lasts more than a day" | Use KDS as the source and extend the retention period | Direct PUT retries only up to 24 hours |
| "Keep the originals even after transformation" | Enable source record backup | In case of transformation bugs |
| "Arrive at the destination within a few seconds" | Buffer interval 0 seconds (zero buffering) | But accept more small files and higher request costs |
| "Multiple applications each consume the same data" | KDS (+ Firehose as one of the consumers) | Firehose delivers only to fixed destinations |

Tomorrow we compare Amazon MSK, the managed offering of Apache Kafka and the last piece of streaming ingestion, with Kinesis.

## 📖 Glossary

- **Firehose stream (delivery stream)**: The basic unit of Firehose. It receives data, buffers it, and hands it to the destination you set.
- **Buffer hints**: The size and time settings that decide how much to collect before sending. Delivery happens at whichever condition is filled first.
- **Near real-time**: A level where data arrives as late as the buffer allows. It means a delay of seconds to minutes.
- **Zero buffering**: A setting that sets the buffer interval to 0 seconds so data is delivered within a few seconds without being collected.
- **Direct PUT**: A method where the producer puts records directly using the Firehose API.
- **Record format conversion**: A feature that converts incoming JSON to Parquet or ORC before loading. It uses the schema of a Glue table.
- **Dynamic partitioning**: A feature that splits the S3 folders (prefixes) by values inside the record when loading.
- **Small files problem**: The phenomenon where too many finely split files slow down the query engine.
- **COPY**: A command that loads files in S3 into Redshift in parallel. Firehose uses it internally when loading into Redshift.
- **Manifest file**: A file listing the S3 objects to be loaded (or that were skipped). It is used to manually reload failed data.

## 📝 Practice Problems

**Problem 1.** You have streaming events that must load automatically to your S3 data lake with no additional code, and you don't need custom real-time processing or replay. Which service is most appropriate?

A) Kinesis Data Firehose delivery stream  
B) Kinesis Data Streams + implement KCL consumer manually  
C) Amazon MSK  
D) SQS + Lambda  

**Answer: A**  
Explanation: Simple delivery-only with no custom processing or replay screams Firehose. Shards, consumer code, and scaling are all automatic, and S3 loading is built-in. KDS+KCL requires writing consumer code (overkill), MSK is operationally heavy Kafka, and SQS+Lambda requires you to build the loading logic yourself.

---

**Problem 2.** Firehose is loading data to S3, but Athena queries are slow due to many small files. What's the most effective fix?

A) Reduce buffer interval to 60 seconds  
B) Disable compression  
C) Set buffer size larger (e.g., 128MB) to load fewer, bigger files  
D) Switch destination to OpenSearch  

**Answer: C**  
Explanation: The small files problem improves by increasing buffer size to load fewer, larger files. Engines like Athena have per-file overhead, so large files are better. Reducing interval does the opposite, creating more small files. Disabling compression increases scan volume, making queries more expensive. Destination change doesn't align with an Athena query requirement.

---

**Problem 3.** How does Firehose load data to Redshift?

A) Executes single-record INSERT to Redshift  
B) Stages first to S3, then loads to Redshift via COPY for parallel distribution  
C) Queries S3 directly via Redshift Spectrum  
D) Routes via DynamoDB  

**Answer: B**  
Explanation: Firehose writes to S3 first, then loads via COPY to Redshift. Redshift is an MPP warehouse where single-row INSERT is inefficient; best practice is parallel bulk load from S3 via COPY, which Firehose automates. Spectrum is an external table query feature, not loading. DynamoDB routing doesn't exist.

---

**Problem 4.** You operate a real-time fraud-detection app while also preserving all original transaction events in S3 data lake. What's the best architecture?

A) One Firehose for both detection and preservation  
B) Snowball for transactions  
C) SQS for transactions, Lambda saves to S3  
D) KDS source; detection app consumes directly; Firehose reads same KDS and loads to S3  

**Answer: D**  
Explanation: The requirement for both custom real-time analysis (detection) and raw preservation means KDS as source: detection app consumes directly for low-latency analysis, while Firehose reads the same stream for automatic S3 preservation. This is the standard pattern for "real-time analysis + archive." Firehose alone can't do custom analysis, SQS+Lambda lacks replay/multi-consumer strength, and Snowball is batch migration.

---

**Problem 5.** When Firehose's transform Lambda fails or destination delivery fails on some records, what default behavior prevents data loss?

A) Failed records are immediately discarded  
B) Failed records are sent to a designated S3 backup/error prefix  
C) The entire delivery stream pauses  
D) Exceptions are synchronously thrown back to producers  

**Answer: B**  
Explanation: Firehose preserves failed records by sending them to a designated S3 backup location, enabling later investigation and replay. Data never vanishes. Immediate discard, stream pause, and producer exceptions all contradict Firehose's design and operational reliability.

---
