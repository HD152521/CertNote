# Day 2 - Lambda Transformation and Lightweight Processing: Event-Driven ETL's Limits and Fit

If EMR and Glue are "heavy engines for distributed large-scale processing," **AWS Lambda** is the opposite philosophy. No servers running, tiny code snippets execute the instant an event fires, then vanish. In data engineering, Lambda isn't "massive transformation"—it's "lightweight, instant, event-reactive transformation."

Today's core question is simple: **when is Lambda appropriate, and when isn't it?** Wrong Lambda choices hit time and memory walls, causing mid-task failure. Understanding that boundary precisely is critical for exams and real work.

## Lambda's Essence: Event-Driven, Stateless, Short-Lived

Lambda is defined by three traits.

| Trait | Meaning |
|-------|---------|
| Event-driven | S3 PUT, Kinesis records, SQS messages etc. trigger the function |
| Stateless | Each invocation runs independently; no persistent in-memory state |
| Short-lived | Max 15 minutes execution then forced termination |

Lambda shines in data pipelines with **S3 event-based transformation**. A new file lands on S3, Lambda triggers instantly to transform, validate, and route it.

```python
# Lambda triggered by S3 file arrival: JSON → clean → different bucket
import json
import boto3

s3 = boto3.client("s3")

def lambda_handler(event, context):
    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]

        obj = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(obj["Body"].read())

        # Lightweight transform: field cleaning and validation
        cleaned = [r for r in data if r.get("amount", 0) > 0]

        s3.put_object(
            Bucket="curated-bucket",
            Key=f"cleaned/{key}",
            Body=json.dumps(cleaned),
        )
    return {"processed": len(event["Records"])}
```

This pattern is powerful because **idle cost is zero**. No files, no execution, no charge. No need to keep Glue clusters running all night—process files only when they arrive, charged per 100ms.

> 💡 **Related Theory**: Lambda is the canonical **FaaS (Function as a Service)** implementation, the apex of compute abstraction. Compute progresses: physical servers → VMs (EC2) → containers (ECS) → functions (Lambda), with management units shrinking from "machines" to "code snippets." Higher abstraction cuts operational burden but adds runtime environment constraints and execution limits. Lambda's 15-minute cap is the direct result of this tradeoff.

## Lambda's Limits: Time, Memory, Payload

When using Lambda for ETL, memorize these hard limits. They determine suitability.

| Item | Limit | Implication |
|------|-------|-------------|
| Max execution time | 15 minutes | Long-running large-scale processing impossible |
| Memory | 128MB ~ 10,240MB(10GB) | Data too large for memory is unfit |
| /tmp temp disk | 512MB ~ 10GB | Large file buffering has limits |
| Sync payload | 6MB (request/response) | Large data needs S3 transit |
| Deployment package | 50MB (zipped) / 250MB (unzipped) | Large libraries need container images (10GB) |

Lambda's CPU is allocated proportional to memory. Raise memory and CPU rises too. Slow CPU-bound work gets faster via more memory, sometimes lowering total cost. This is Lambda's core cost-tuning insight.

> ⚠️ **Gotcha**: If you pick Lambda for "aggregate 100GB daily logs from S3," you'll be wrong. A single invocation with 15-min and 10GB memory limits can't handle massive data at once. Huge batch jobs need Glue or EMR. Lambda is strictly for "small file unit, short transform."

## Fit vs Unfit: Lambda Use Cases

Draw the line clearly.

**Fit**
- Immediate transform/validate/convert small-to-medium files arriving on S3
- Lightweight real-time processing of Kinesis/DynamoDB Streams records
- Trigger, route, notify "glue" code between pipeline stages
- Short work fetching external data via API
- Firehose record-level transform (per-record)

**Unfit**
- Processing longer than 15 minutes
- Single-shot handling of massive data (tens GB+) that won't fit memory
- Complex shuffle and join for large-scale distributed aggregation
- Stateful windowed aggregation requiring accumulated state (→ Flink)

```python
# Kinesis Firehose transform Lambda: transform records, return status
import base64
import json

def lambda_handler(event, context):
    output = []
    for record in event["records"]:
        payload = json.loads(base64.b64decode(record["data"]))
        payload["processed_at"] = context.aws_request_id
        transformed = base64.b64encode(
            (json.dumps(payload) + "\n").encode("utf-8")
        ).decode("utf-8")
        output.append({
            "recordId": record["recordId"],
            "result": "Ok",
            "data": transformed,
        })
    return {"records": output}
```

Firehose transform must return `recordId` and `result` (Ok/Dropped/ProcessingFailed) for each record. Firehose needs to track per-record success/failure.

> 🔍 **Deeper Dive**: Lambda's first invocation is slow due to **cold start** — spinning up a fresh execution environment (container). Later invocations reuse the warm environment and are faster. Data pipelines aren't usually sensitive to this latency, but if latency matters, **Provisioned Concurrency** can pre-warm environments. VPC-attached Lambda used to suffer long cold starts, but ENI improvements have greatly mitigated it.

## Concurrency and Throughput: Flow in Parallel

Lambda's strength is **automatic horizontal scaling**. If 1,000 files land on S3 simultaneously, Lambda can invoke up to 1,000 instances in parallel (within account limits). For "many small file transforms," you get near-infinite parallelism without distributed clusters.

Protect downstreams via **Reserved Concurrency** or **function concurrency limits**. Without caps, Lambda invoking thousands of times to RDS kills the DB with connection storms.

```bash
# Cap concurrent function executions to 50 to protect downstream DB
aws lambda put-function-concurrency \
  --function-name s3-transform \
  --reserved-concurrent-executions 50
```

> 🎯 **Scenario**: Thousands of IoT devices endlessly upload tiny JSON files to S3. Each under 1MB, transform is just cleaning. Optimal architecture: (1) **S3 event → Lambda** trigger transforms instantly, (2) save transformed Parquet to curation bucket, (3) **Reserved Concurrency** limits downstream load, (4) failures isolated to **DLQ (SQS)** for reprocessing. Zero idle cost, auto-scales with traffic. If files grow massive or complex aggregation needed, switch to Glue/EMR.

## Error Handling: Retries and DLQ

Lambda's retry behavior depends on invocation type. Async invocations (S3 events) retry up to 2 times by default, and if still failing, can send failed events to **DLQ (Dead Letter Queue)** or **Lambda Destinations**. Without this, failed events silently vanish—exactly what data pipelines must avoid.

Stream sources (Kinesis/DynamoDB Streams) behave differently. One record failing may block the shard, so options like `BisectBatchOnFunctionError`, `MaximumRetryAttempts`, and failure destination prevent "poison pill" records from halting the entire pipeline.

## Summary

Lambda is a lightweight, event-driven, stateless transform tool with 15-minute cap. Ideal for "small and short" work like S3-arrival instant transform, Firehose record transform, and pipeline glue code. Zero idle cost and auto horizontal scaling are strengths. Large-scale, long-running, complex aggregation must go to Glue/EMR. Memorize limits (time, memory, payload), isolate failures with DLQ—these are reliability's core. Tomorrow we orchestrate multiple processing stages.

---

## 📝 Practice Questions

**Question 1.** You must decode a single 200 GB compressed log file that arrives in S3 every day and perform complex aggregations. Which of the following is the LEAST appropriate choice?

A) Process the entire file with a single AWS Lambda function  
B) AWS Glue Spark job  
C) Amazon EMR Spark cluster  
D) EMR Serverless  

**Answer: A**  
Explanation: A single Lambda invocation has limits of 15 minutes and 10 GB of memory, so it cannot decode and aggregate a 200 GB file in one pass. Distributed engines such as Glue or EMR (including Serverless) are suited to large-scale complex aggregation. Lambda should be limited to short transformations on small files.

---

**Question 2.** Which fields must be included when returning each record from a Kinesis Data Firehose data transformation Lambda function?

A) bucket and key  
B) recordId and result  
C) timestamp and shardId  
D) partitionKey only  

**Answer: B**  
Explanation: A Firehose transformation Lambda function must return, for each record, the original `recordId`, the processing `result` (Ok/Dropped/ProcessingFailed), and the transformed `data` so that Firehose can track success and failure per record. bucket/key is the S3 event structure, and the rest are unrelated.

---

**Question 3.** A Lambda function running a CPU-bound task is often slow, close to timing out. What is the first-line tuning that can also improve cost?

A) Increase the memory allocation so that the proportionally increased CPU shortens the run time  
B) Set concurrency to 0  
C) Reduce the /tmp disk to 512 MB  
D) Increase the payload size beyond 6 MB  

**Answer: A**  
Explanation: Lambda allocates CPU in proportion to memory, so for a CPU-bound task, increasing memory shortens the run time and can sometimes even reduce the total cost. Setting concurrency to 0 stops the function from running, and the payload limit is 6 MB and cannot be increased.

---

**Question 4.** A Lambda function triggered asynchronously by S3 events fails intermittently. What is the most appropriate way to ensure that failed events are not silently lost?

A) Set the function memory to the maximum  
B) Isolate failed events with a DLQ (SQS) or Lambda Destinations  
C) Switch to synchronous invocation  
D) Set Reserved Concurrency to 0  

**Answer: B**  
Explanation: With asynchronous invocation, events can be lost if they still fail after the default retries, so you should isolate failed events with a DLQ (SQS/SNS) or Lambda Destinations so they can be reprocessed and investigated. Increasing memory or switching to synchronous invocation is not a fundamental solution for preventing loss.

---

**Question 5.** Which of the following workloads is the best fit for Lambda-based transformation?

A) A batch that loads tens of GB into memory and performs complex shuffle joins  
B) A long-running window aggregation that accumulates state per user session  
C) Event-driven processing that immediately cleanses and converts the format of files under 1 MB as they arrive in S3  
D) Large-scale machine learning training that takes 30 minutes or more  

**Answer: C**  
Explanation: Lambda is optimized for event-driven, stateless, short-lived work, so it is ideal for workloads that cleanse and transform small files as soon as they arrive in S3. Large shuffle joins (Glue/EMR), stateful window aggregation (Flink), and long-running ML training (EMR/SageMaker) are all unsuitable for Lambda because of the 15-minute and memory limits.

---
