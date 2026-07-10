# Day 2 - Lambda Event Source Mapping: The Internal Polling Mechanics of SQS, Kinesis, and DynamoDB Streams

A Lambda function starts from the principle that "it runs only when someone invokes it". Depending on who that "someone" is, Lambda's behavior — retry counts, error handling, ordering guarantees — changes completely. If you don't understand this, you end up with accidents where SQS messages get processed in an infinite loop, an entire Kinesis shard gets blocked, or S3 processing falls into an infinite loop.

Lambda's invocation styles fall into three categories. First, **Synchronous Invocation**: the caller directly calls the `InvokeFunction` API in `RequestResponse` mode. API Gateway, ALB, and Cognito belong here. Second, **Asynchronous Invocation**: the event goes into Lambda's internal queue and Lambda retries 0–2 times. S3, SNS, and EventBridge belong here. Third, **Event Source Mapping (ESM)**: the Lambda service itself actively polls the source. SQS, Kinesis, DynamoDB Streams, MSK, and Apache Kafka belong here.

## How Synchronous Invocation Works Internally: Retries Are the Caller's Responsibility

Follow the API Gateway → Lambda path and you see this flow. When the client sends a REST API request, API Gateway calls `lambda:InvokeFunction` with `InvocationType=RequestResponse`. The Lambda service takes the request, hands it to an execution environment, and waits in a blocked state until the function returns. When the response comes, API Gateway converts it into an HTTP response and returns it to the client.

In synchronous invocation, when the function throws an error, Lambda gives an HTTP 200 OK response but attaches a `FunctionError` header. The response payload is JSON containing the error message. **Retries are the caller's responsibility** — API Gateway does not retry by default.

```python
import boto3
import json

lambda_client = boto3.client('lambda')

response = lambda_client.invoke(
    FunctionName='my-function',
    InvocationType='RequestResponse',
    Payload=json.dumps({'key': 'value'}).encode()
)

# Even an HTTP 200 may be an internal function error
if 'FunctionError' in response:
    error = json.loads(response['Payload'].read())
    print(f"Function error: {error['errorMessage']}")  # This code decides whether to retry
else:
    result = json.loads(response['Payload'].read())
```

> 💡 **Related theory**: The error handling model of synchronous invocation is the **Fail-Fast** pattern of distributed systems. Because it returns the error to the caller immediately, the caller can implement a Circuit Breaker (Netflix Hystrix, AWS App Mesh, etc.). Since no automatic internal retry happens as it does in asynchronous invocation, there are no side effects and the demand for idempotency is low.

## Asynchronous Invocation: Lambda's Internal Queue and Retry Mechanism

When a file is uploaded to an S3 bucket, S3 invokes Lambda with `InvocationType=Event`. The Lambda service immediately places the event in an internal event queue (similar to SQS but an internal queue not visible from outside) and returns 202 Accepted to S3. S3 does not know whether the function actually ran or succeeded.

The Lambda service pulls events out of the queue, runs the function, and on failure retries up to 2 times. The retry intervals are 1 minute and 2 minutes — exponential backoff. If it still fails, the event is sent to the configured DLQ or Destination.

| Item | DLQ | Lambda Destinations |
|------|-----|---------------------|
| Handles success events | ❌ | ✅ (OnSuccess) |
| Handles failure events | ✅ | ✅ (OnFailure) |
| Target services | SQS, SNS | SQS, SNS, EventBridge, Lambda |
| Context information | Basic payload only | Full request, response, error metadata |
| AWS recommended | Legacy | ✅ Recommended |

```bash
# Configure Destinations (both success and failure)
aws lambda put-function-event-invoke-config \
  --function-name image-processor \
  --maximum-retry-attempts 2 \
  --maximum-event-age-in-seconds 3600 \
  --destination-config '{
    "OnSuccess": {
      "Destination": "arn:aws:sqs:ap-northeast-2:123:success-audit-queue"
    },
    "OnFailure": {
      "Destination": "arn:aws:events:ap-northeast-2:123:event-bus/ops-bus"
    }
  }'
```

> ⚠️ **Trap**: In asynchronous invocation, Lambda can run the same event up to 3 times (original + 2 retries). This is an **at-least-once delivery** guarantee. If the function is not idempotent, you get duplicate-processing problems. For example, if a "send email to the user" function is invoked asynchronously and succeeds twice, two emails go out.

> 📚 **Case study**: In 2021, Stripe implemented webhook event processing as Lambda async and ran into a duplicate-processing problem. An incident occurred where the payment amount was deducted twice, and they subsequently adopted the Lambda Powertools Idempotency module to store event IDs in DynamoDB and block duplicate invocations. The lesson boils down to "Lambda async + state-changing operation = you must implement idempotency".

## S3 Events: Asynchronous Invocation and Preventing Infinite Loops

S3 event notifications come in two flavors.

**S3 Event Notifications (legacy)**: The bucket configuration sends events directly to Lambda, SQS, or SNS. Simple, but filtering is limited to prefix/suffix, and you can set only one target per event type.

**S3 → EventBridge (currently recommended)**: Via EventBridge, you get finer pattern matching, fan-out to multiple targets, and event archive and replay.

The most common accident when processing S3 events is the infinite loop.

```
[Source bucket] file upload → Lambda runs → processed result saved to [same bucket]
    ↑                                                              ↓
    └──────────────── new upload event fires → Lambda re-runs ─────┘
```

**Three solutions:**

1. **Separate input/output buckets**: Save processing results to a different bucket.
2. **Prefix/Suffix filter**: Configure it to trigger only on uploads to the `input/` folder, and save results to `output/`.
3. **Object tag check**: Tag processed objects with `processed=true`, and have the function check this tag first and skip if present.

```python
def lambda_handler(event, context):
    s3 = boto3.client('s3')
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        
        # Check whether the object was already processed (defensive logic)
        try:
            tags = s3.get_object_tagging(Bucket=bucket, Key=key)
            for tag in tags['TagSet']:
                if tag['Key'] == 'processed' and tag['Value'] == 'true':
                    print(f"Skipping already-processed object: {key}")
                    return
        except Exception:
            pass
        
        # Processing logic
        process_object(bucket, key)
        
        # Add the processed tag
        s3.put_object_tagging(
            Bucket=bucket, Key=key,
            Tagging={'TagSet': [{'Key': 'processed', 'Value': 'true'}]}
        )
```

## SQS Event Source Mapping: Lambda Polls Actively

The SQS-Lambda integration is counterintuitive at first sight. It's not that SQS invokes Lambda — **the Lambda service polls SQS**. This is the essence of event source mapping (ESM).

The Lambda service fetches messages from the SQS queue via long polling (waiting up to 20 seconds). It bundles them into a batch and invokes the function, and when the function succeeds, it deletes the messages. On failure, the messages reappear in the queue after the visibility timeout ends. When `maxReceiveCount` (default 3) is exceeded, they move to the SQS DLQ.

**Key ESM parameters:**

| Parameter | Description | Default |
|----------|------|--------|
| BatchSize | Number of messages fetched at once | 10 (SQS max 10,000) |
| MaximumBatchingWindowInSeconds | Wait time to force-send a batch even if not full | 0s |
| FunctionResponseTypes | Whether `ReportBatchItemFailures` is enabled | Disabled |
| FilterCriteria | Process only messages with specific attributes/values | None |

> 🔍 **Going deeper**: SQS ESM polling is the Lambda service periodically calling the SQS API `ReceiveMessage`. When there is no traffic, the number of pollers shrinks (minimum 1), and when messages pile up, pollers automatically increase. On standard queues, up to 1,000 pollers can operate concurrently, enabling high throughput. On FIFO queues, one Lambda instance processes per message group ID to guarantee order.

## Partial Batch Response: Preserving the Messages That Succeeded

In SQS ESM, if only some messages in a batch fail, the default behavior treats the entire batch as failed. The 9 messages that succeeded all get reprocessed because of 1 failure.

Enabling `ReportBatchItemFailures` has Lambda return only the failed message IDs so that only those are reprocessed.

```python
def lambda_handler(event, context):
    batch_item_failures = []
    
    for record in event['Records']:
        try:
            process_message(record)
        except Exception as e:
            # Report only this message ID as failed
            batch_item_failures.append({
                'itemIdentifier': record['messageId']
            })
            print(f"Failed: {record['messageId']}, error: {e}")
    
    # Return the failure list — Lambda returns only these to the queue
    return {'batchItemFailures': batch_item_failures}
```

```bash
# Create an SQS ESM (with Partial Batch Response enabled)
aws lambda create-event-source-mapping \
  --function-name order-processor \
  --event-source-arn arn:aws:sqs:ap-northeast-2:123:orders-queue \
  --batch-size 100 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures
```

> ⚠️ **Trap**: Even with Partial Batch Response enabled, if the function throws an exception (raise, not return), **the entire batch is treated as failed**. You must wrap it in try/except and return `batchItemFailures`. Also note that on an SQS FIFO queue, all messages behind a failed message are blocked.

## Kinesis Data Streams ESM: The Shard-Block Problem

The most dangerous trap in the Kinesis-Lambda integration is the **shard block**.

Kinesis processes data per shard. Record ordering is guaranteed within each shard. Lambda ESM assigns one Lambda instance per shard to process in order.

**The problem**: If one record fails to process, Lambda retries that record. If the retries keep failing, it cannot process new records — **the entire shard is blocked.** You can detect this by the CloudWatch `IteratorAge` metric continuously increasing.

**The solution:**

```bash
# Create a Kinesis ESM (with shard-block prevention settings)
aws lambda create-event-source-mapping \
  --function-name kinesis-processor \
  --event-source-arn arn:aws:kinesis:ap-northeast-2:123:stream/events \
  --starting-position LATEST \
  --batch-size 100 \
  --maximum-retry-attempts 3 \
  --maximum-record-age-in-seconds 300 \
  --bisect-batch-on-function-error \
  --destination-config '{"OnFailure": {"Destination": "arn:aws:sqs:ap-northeast-2:123:failed-records"}}'
```

- `MaximumRetryAttempts`: Set a maximum count instead of infinite retries (0 means no retries)
- `MaximumRecordAgeInSeconds`: Discard records older than this
- `BisectBatchOnFunctionError`: Split a failed batch in half and binary-search to isolate the problem record
- `OnFailure Destination`: Send final-failure records to SQS or SNS

**ParallelizationFactor** is an advanced feature to increase throughput. It can run up to 10 Lambdas concurrently on the same shard. Ordering is maintained per partition key.

```bash
aws lambda create-event-source-mapping \
  --function-name kinesis-processor \
  --event-source-arn arn:aws:kinesis:ap-northeast-2:123:stream/events \
  --starting-position LATEST \
  --parallelization-factor 5
```

> 💡 **Related theory**: Kinesis ESM's per-partition-key ordering guarantee is the same as the **partition-based ordering** principle of distributed stream processing. It is similar to Kafka's partition offsets and Redis Streams' consumer groups. Ordering guarantees and parallel processing are a trade-off — if you want a full ordering guarantee, you must serialize with 1 Lambda per shard, and if you want high throughput, you parallelize while guaranteeing order only per key.

## DynamoDB Streams ESM: Processing Change Events

DynamoDB Streams is a stream that retains a table's INSERT, MODIFY, and REMOVE events for 24 hours. Lambda ESM polls this stream to process the change events.

DynamoDB Streams ESM works similarly to Kinesis but has differences.

| Item | Kinesis Data Streams | DynamoDB Streams |
|------|---------------------|------------------|
| Retention period | 24 hours – 365 days | Fixed at 24 hours |
| Starting position | LATEST, TRIM_HORIZON, AT_TIMESTAMP | LATEST, TRIM_HORIZON |
| Shard management | Manual (explicit shard count) | Automatic (DynamoDB manages) |
| Stream record content | Original data | Choice of before/after change images |
| Scaling | Manual resharding | Integrated with DynamoDB auto scaling |

The data the function receives varies with the stream view type.

| StreamViewType | Data included |
|----------------|------------|
| `KEYS_ONLY` | Only the keys of the changed item |
| `NEW_IMAGE` | The full item after the change |
| `OLD_IMAGE` | The full item before the change |
| `NEW_AND_OLD_IMAGES` | Both before and after the change |

```python
def lambda_handler(event, context):
    for record in event['Records']:
        event_type = record['eventName']  # INSERT, MODIFY, REMOVE
        
        if event_type == 'INSERT':
            new_item = record['dynamodb']['NewImage']
            print(f"New item: {new_item}")
        
        elif event_type == 'MODIFY':
            old_item = record['dynamodb']['OldImage']
            new_item = record['dynamodb']['NewImage']
            # Detect changed fields
            changed_fields = {
                k for k in new_item 
                if old_item.get(k) != new_item.get(k)
            }
            print(f"Changed fields: {changed_fields}")
        
        elif event_type == 'REMOVE':
            old_item = record['dynamodb']['OldImage']
            print(f"Removed item: {old_item}")
```

> 📚 **Case study**: Airbnb implemented **Event Sourcing** with the DynamoDB Streams + Lambda pattern. Every change to the bookings table is recorded in Streams, and Lambda syncs it to Elasticsearch to keep the search index up to date. This pattern is also the core of the CQRS (Command Query Responsibility Segregation) architecture — DynamoDB handles the Command (write) side, and Elasticsearch handles the Query (read) side.

## EventBridge Schedule + Lambda

EventBridge (formerly CloudWatch Events) triggers Lambda in two ways.

**Rate expression**: `rate(5 minutes)`, `rate(1 hour)` — run at fixed intervals.

**Cron expression**: AWS's cron differs from standard Linux cron. It uses 6 fields and includes a year instead of seconds. `cron(minutes hours day-of-month month day-of-week year)`.

```bash
# Run daily at 9 AM (UTC)
aws events put-rule \
  --name daily-report \
  --schedule-expression "cron(0 9 * * ? *)"

# Run every 5 minutes
aws events put-rule \
  --name health-check \
  --schedule-expression "rate(5 minutes)"
```

> ⚠️ **Trap**: In AWS EventBridge cron, **day-of-month and day-of-week cannot be specified at the same time.** If you specify one, the other must be set to `?` (any). Use it like `cron(0 9 15 * ? *)` (15th of every month) or `cron(0 9 ? * MON-FRI *)` (weekdays).

## Idempotency: Turning at-least-once Into safely-exactly-once

Asynchronous invocation and ESM polling both guarantee at-least-once delivery. The same event can be processed twice. You have to make the function idempotent to defend against duplicate processing.

The **Lambda Powertools Idempotency** module uses DynamoDB to manage event IDs.

```python
from aws_lambda_powertools.utilities.idempotency import (
    idempotent, DynamoDBPersistenceLayer
)

persistence_layer = DynamoDBPersistenceLayer(
    table_name="IdempotencyTable"
)

@idempotent(persistence_store=persistence_layer)
def lambda_handler(event, context):
    # This code runs only once even if called again with the same event ID
    charge_customer(event['customerId'], event['amount'])
    return {'charged': True}
```

Internal behavior: on the first invocation, it stores the event ID (by default a hash of the whole event) in DynamoDB in an "IN_PROGRESS" state. On success, it stores "COMPLETED" and the result. If it comes again with the same event ID, it pulls the previous result from DynamoDB and returns it as-is — the Lambda code does not run.

> 🔍 **Going deeper**: Idempotency is an old concept in distributed systems theory. Ever since Lamport's 1978 paper "Time, Clocks, and the Ordering of Events in a Distributed System" dealt with message delivery semantics, three delivery guarantees have been defined: **at-most-once, at-least-once, exactly-once**. Exactly-once is hard to achieve in distributed systems — it requires distributed transactions (2PC, Saga), or you get effectively the same result with idempotency + at-least-once. Kafka's exactly-once delivery is also implemented with a combination of idempotent producer + transactional producer.

## A Comprehensive Comparison of Invocation Types

| Characteristic | Synchronous (API GW, ALB) | Asynchronous (S3, SNS) | ESM (SQS, Kinesis) |
|------|-------------------|-----------------|-------------------|
| Invocation flow | Caller invokes directly | Via Lambda internal queue | Lambda service polls |
| Response | Returned immediately | ACK only (202) | None |
| Retry | Caller's responsibility | Automatic 0–2 times | Configurable |
| Error handling | Caller handles directly | DLQ / Destinations | SQS DLQ, On Failure |
| Ordering guarantee | None | None | Per shard/partition |
| Max delivery size | 6MB (sync) | 256KB (async) | Batch size limit |
| DLQ applies | ❌ | ✅ Lambda DLQ | SQS's own DLQ |

## Wrapping Up

Lambda's three invocation styles — synchronous, asynchronous, and ESM — each have a different reliability model. Synchronous is simple but the caller is responsible for all error handling. Asynchronous is highly durable but requires idempotency. ESM is convenient with managed polling but you must understand mechanisms like Kinesis's shard block and SQS's visibility timeout. Clearly distinguish these differences and you can immediately answer operational questions like "why is this SQS message being processed repeatedly?" or "why are Kinesis records piling up?"

In the next article, we cover the Lambda deployment lifecycle — environment variable management, layers, versions and aliases, and CodeDeploy traffic shifting.

---

## 📝 연습 문제

**문제 1.** Which correctly describes the SQS integration in Lambda ESM (Event Source Mapping)?

A) SQS directly pushes new messages to Lambda  
B) The Lambda service long-polls SQS and fetches messages in batches  
C) It works via asynchronous invocation like S3  
D) SQS FIFO queues cannot be integrated with Lambda  

**정답: B**  
해설: In SQS ESM, the Lambda service actively polls SQS (long polling up to 20 seconds) to fetch messages. It's not SQS invoking Lambda directly. A is wrong — SQS is not push-based. C is wrong — ESM is a different category from asynchronous invocation. D is wrong — FIFO queues are supported too, and ordering is guaranteed per message group ID.

---

**문제 2.** In Kinesis Data Streams ESM, what happens when one record keeps failing to process, and what is the fix?

A) Only that record automatically moves to a DLQ  
B) Lambda automatically skips that record and processes the next one  
C) The entire shard is blocked and processing of new records stops — resolve with MaximumRetryAttempts and BisectBatchOnFunctionError  
D) Kinesis automatically splits that shard  

**정답: C**  
해설: Kinesis ESM by default keeps retrying a failed record to preserve ordering, which can block the entire shard. The fix is to limit the retry count with `MaximumRetryAttempts`, discard old records with `MaximumRecordAgeInSeconds`, and isolate the problem record via binary search with `BisectBatchOnFunctionError`. You can detect this situation when CloudWatch's `IteratorAge` metric continuously increases.

---

**문제 3.** When a file is uploaded to S3 and Lambda saves the result back to the same bucket, an infinite loop occurs. What is the most appropriate solution?

A) Set the Lambda function timeout to 1 second  
B) Save the result to a different S3 bucket, or use a prefix/suffix filter  
C) Use only EventBridge instead of S3 event notifications  
D) Set Lambda reserved concurrency to 1  

**정답: B**  
해설: The most reliable solution is to separate the input bucket and the output bucket. If separation is hard, set a prefix/suffix filter on the S3 event notification to trigger only files in a specific path (e.g., `input/`) and save results to a different path (`output/`). A is not a root fix. C is wrong because even with EventBridge, the same problem arises if a same-bucket write event fires. D is wrong — the loop keeps happening even with concurrency of 1.

---

**문제 4.** Why are Destinations recommended over DLQ in Lambda asynchronous invocation?

A) Destinations are faster and cheaper  
B) Destinations handle both success and failure, support SQS, SNS, EventBridge, and Lambda as targets, and include rich metadata  
C) DLQ supports only SQS, while Destinations support all services  
D) Destinations can increase the retry count  

**정답: B**  
해설: Destinations respond to both the success (OnSuccess) and failure (OnFailure) of an asynchronous invocation, and support SQS, SNS, EventBridge, and Lambda as targets. Also, unlike DLQ which delivers only the event payload, they deliver rich metadata including the request context, response, and error information, making debugging easier. C is wrong — DLQ supports SNS too.

---

**문제 5.** In SQS ESM, how do you prevent successful messages from being reprocessed when only some messages in a batch fail?

A) Don't throw exceptions in the function  
B) Set BatchSize to 1  
C) Enable `ReportBatchItemFailures` and return a `batchItemFailures` response  
D) Setting a DLQ handles it automatically  

**정답: C**  
해설: Set `ReportBatchItemFailures` in `FunctionResponseTypes`, and if the function returns the failed message IDs as a `batchItemFailures` list, Lambda reprocesses only those messages. The successful messages are deleted from SQS. B works but greatly reduces throughput and is inefficient. D is wrong — a DLQ is where final-failure events go; it does not handle partial failures within a batch.

---

**문제 6.** In DynamoDB Streams, which StreamViewType should you use to receive both the before and after data of a change in Lambda?

A) KEYS_ONLY  
B) NEW_IMAGE  
C) OLD_IMAGE  
D) NEW_AND_OLD_IMAGES  

**정답: D**  
해설: `NEW_AND_OLD_IMAGES` includes both the previous state (OldImage) and the subsequent state (NewImage) of the changed item. This is used most in audit logging, change detection, and data synchronization scenarios. `KEYS_ONLY` delivers only the keys, `NEW_IMAGE` only the after, and `OLD_IMAGE` only the before. Cost varies with the view type because the stream data size differs.
