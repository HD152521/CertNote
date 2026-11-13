# Day 4 - Lambda Concurrency Control: The Token Bucket Algorithm and Error Handling Layers

Lambda's concurrency model looks simple at first glance. It seems to be just a question of "how many copies of the function run at the same time." In reality, four different mechanisms are layered on top of each other: the account-wide limit, per-function Reserved concurrency, Provisioned concurrency, and the burst limit. If you do not understand this hierarchy, you cannot explain "why is my Lambda returning 429" or "why is my function slow because of another team's function."

Error handling is the same. The three invocation types (synchronous, asynchronous, ESM) react completely differently when an error occurs. If you do not know this, you end up with incidents like an entire Kinesis shard getting blocked or SQS messages being reprocessed forever.

## Defining and Calculating Concurrency

Lambda concurrency is **the number of function instances running at the same time at a given moment**. The formula is simple.

```
Concurrency = requests per second (RPS) × average execution time (seconds)

Example:
- RPS = 1,000, average execution time = 200ms (0.2 seconds)
- Concurrency = 1,000 × 0.2 = 200

- RPS = 100, average execution time = 5 seconds
- Concurrency = 100 × 5 = 500
```

As this formula shows, the longer the execution time, the more concurrency is consumed. If 100 Lambdas with a 15-minute timeout are running at the same time, they occupy 1,500 concurrency during those 15 minutes, which already exceeds the account default limit (1,000).

## The Complete Picture of the Four Concurrency Layers

```
Account/Region-wide limit: 1,000 (default, increase can be requested)
│
├── [Function A] Reserved: 300 → up to 300 instances
│   └── Provisioned: 20 → always 20 pre-initialized
│
├── [Function B] Reserved: 200 → up to 200 instances
│
└── [All other functions] Shared pool: 500 (1000 - 300 - 200)
    └── All functions without Reserved compete for these 500
```

**Reserved Concurrency:**
- Both the concurrency **upper limit** and a **dedicated allocation** for the function
- This function runs at most N instances, and other functions cannot use those N
- Setting it to 0 blocks the function completely (ThrottlingException)
- Cost: none

**Provisioned Concurrency:**
- Pre-initializes the specified number of MicroVMs and keeps them waiting
- Runs only the INVOKE phase immediately, with no cold start
- Can be set only on a version or alias (not `$LATEST`)
- Cost: number of initialized instances × time × memory (GB) × $0.0000097222/GB-second

```bash
# Set Reserved Concurrency
aws lambda put-function-concurrency \
  --function-name payment-api \
  --reserved-concurrent-executions 300

# Block completely (every request gets an immediate ThrottlingException)
aws lambda put-function-concurrency \
  --function-name maintenance-mode-function \
  --reserved-concurrent-executions 0

# Provisioned Concurrency (on an alias)
aws lambda put-provisioned-concurrency-config \
  --function-name payment-api \
  --qualifier prod \
  --provisioned-concurrent-executions 20
```

> ⚠️ **Trap**: When you set Reserved Concurrency, that amount is deducted from the account-wide pool. If you set Reserved=500 on function A, the other functions share only 500. At peak times when many functions run at once, a situation like "why are other functions suddenly being throttled?" can occur because of a Reserved setting.

## Burst Concurrency Limit: A Speed Limit on Scale-Out

Lambda automatically increases concurrency when traffic spikes. But it cannot scale up infinitely fast.

**Scaling rate:** Per function and per Region, up to 1,000 execution environments are added every 10 seconds (in terms of requests per second, that is 10,000 RPS every 10 seconds). It changed to this model in late 2023.

**Previous model:** At the account level, 500 to 3,000 were added per Region in the first minute, and then 500 more per minute after that. These numbers remain in old materials and practice question sets, so keep the two apart.

What this means: if traffic suddenly arrives that needs 5,000 concurrency, then when the account limit is 5,000 or more, it scales up over about 50 seconds (+1,000 every 10 seconds). If the account limit is the default 1,000, it stops at 1,000. The rate limit is per function, so it applies separately to each function. Unused rate headroom does not carry over to the next 10 seconds.

Requests that exceed this rate or limit receive a **throttling error (429)**.

## Diagnosing Concurrency Problems with CloudWatch Metrics

| Metric | Namespace | Meaning | Action if high |
|--------|------------|------|------------|
| `ConcurrentExecutions` | AWS/Lambda | Current number of concurrent executions | Consider an increase if nearing the Reserved limit |
| `Throttles` | AWS/Lambda | Number of throttled invocations | Increase the Reserved/account limit |
| `ProvisionedConcurrencyUtilization` | AWS/Lambda | PC utilization | Add PC if it stays at 80% or above |
| `IteratorAge` | AWS/Lambda | Kinesis/DDB Streams processing lag | Keeps rising → increase ParallelizationFactor |
| `DeadLetterErrors` | AWS/Lambda | Failures sending to the DLQ | Check DLQ permissions (IAM) |

```bash
# Query concurrency metrics from CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=payment-api \
  --start-time 2026-05-31T00:00:00Z \
  --end-time 2026-05-31T23:59:59Z \
  --period 300 \
  --statistics Maximum
```

> 💡 **Related theory**: `IteratorAge` is the difference between the current time and the Put time of the record being processed from Kinesis/DynamoDB Streams. If this value keeps rising, Lambda cannot keep up with the stream rate. The fixes are to increase the number of Kinesis shards (spread the throughput), increase the Lambda `ParallelizationFactor` (the number of parallel Lambdas per shard), or optimize the Lambda execution time.

## Error Handling Layers: A Full Comparison by Invocation Type

When an error occurs, "who retries" and "where the failure event goes" are completely different for each invocation type.

**Synchronous invocation (API Gateway, ALB, direct invoke):**
- If Lambda throws an error, it responds with HTTP 200 + a `FunctionError` header
- Retrying is **the caller's responsibility** (API Gateway default: no retries)
- No DLQ. The error event goes nowhere
- If the client gets a 503 or 500, it must implement its own retry

**Asynchronous invocation (S3, SNS, EventBridge, direct invoke with the Event type):**
- The Lambda service holds the event in an internal queue
- Automatic retries: up to 2, at 1-minute/2-minute intervals (exponential backoff)
- On final failure, sent to a DLQ (SQS or SNS) or a Destinations OnFailure target
- Maximum event age is 21,600 seconds (6 hours) — after that it is not processed

**ESM polling (SQS, Kinesis, DDB Streams):**
- SQS: after the visibility timeout the message returns to the queue. When `maxReceiveCount` is exceeded, it goes to the SQS DLQ
- Kinesis/DDB Streams: infinite retries by default (the shard gets blocked). You must limit it with `MaximumRetryAttempts`
- A Lambda function's DLQ and an SQS queue's DLQ are **completely different concepts**

```
Error handling flow by invocation type

[Synchronous - API Gateway]
Client → API GW → Lambda → error occurs
                              ↓
              FunctionError response to API GW
                              ↓
              5XX returned to the client (depending on API GW settings)
              Retry = decided by the client code

[Asynchronous - S3]
S3 upload → Lambda internal queue → Lambda runs → error occurs
                               ↓
                         automatic retry after 1 minute
                               ↓ (fails again)
                         automatic retry after 2 minutes
                               ↓ (fails again)
                     → DLQ or Destinations OnFailure

[ESM - SQS]
Message → Lambda polls → Lambda runs → error occurs
                               ↓
         message returns to the queue after the visibility timeout ends
                               ↓ (maxReceiveCount exceeded)
                     → SQS DLQ (not the function DLQ!)
```

## DLQ vs Lambda Destinations: Exact Selection Criteria

| Situation | Recommendation |
|------|------|
| Preserve failed asynchronous invocation events | Destinations OnFailure |
| Need to audit successful asynchronous invocation events too | Destinations OnSuccess |
| Handle final failures in an SQS-Lambda ESM | Configure a DLQ on the SQS queue itself |
| Existing legacy code already uses a DLQ | Keep the DLQ (move to Destinations when there is room to migrate) |

Why Destinations are better than a DLQ:
1. **Can handle success events**: It can send an event when the function succeeds too (auditing, triggering the next step)
2. **More kinds of targets**: Not just SQS and SNS, but EventBridge and Lambda as well
3. **Rich context**: JSON that includes the original event + request context + response/error information
4. **Standard asynchronous pattern**: Fits fan-out in event-driven architectures better

```python
# Event structure delivered by Destinations OnFailure (example)
{
  "version": "1.0",
  "timestamp": "2026-05-31T09:30:00Z",
  "requestContext": {
    "requestId": "abc-123",
    "functionArn": "arn:aws:lambda:...:function:payment-api:prod",
    "condition": "RetriesExhausted",
    "approximateInvokeCount": 3  # 1 original + 2 retries
  },
  "requestPayload": {
    "customerId": "C001",
    "amount": 9999
  },
  "responseContext": {
    "statusCode": 200,  # At the Lambda API level, 200 even if the function errored
    "executedVersion": "$LATEST",
    "functionError": "Unhandled"
  },
  "responsePayload": {
    "errorMessage": "Payment gateway timeout",
    "errorType": "TimeoutError"
  }
}
```

## SQS DLQ vs Lambda DLQ: Same Name, Different Concepts

This is an easy place to get confused on the exam.

**SQS DLQ (Dead Letter Queue):**
- A **property** of an SQS queue
- When an SQS message has been consumed more than `maxReceiveCount` times, it moves to the SQS DLQ
- In an SQS-Lambda ESM, if Lambda fails repeatedly → the message is retried at every visibility timeout → `maxReceiveCount` exceeded → SQS DLQ

**Lambda DLQ:**
- A **setting** of the Lambda function
- Sends the event when an **asynchronous invocation** finally fails (the original and both retries all fail)
- The Lambda DLQ does not apply to an SQS-Lambda ESM. ESM failures are handled by the SQS DLQ

```
Scenario: Lambda keeps failing in an SQS → Lambda ESM

Regardless of whether a Lambda DLQ is configured!
  → the message returns to the SQS queue after the visibility timeout
  → after maxReceiveCount (default 3) is exceeded
  → it moves to the DLQ configured on the SQS queue

The Lambda DLQ works for asynchronous invocations such as S3/SNS
```

## A Practical Pattern Using Reserved + Provisioned Concurrency Together

```
Scenario: Financial API (payment processing)
- Normal traffic: 50 concurrency
- Peak traffic: 200 concurrency
- Cold starts not acceptable (response time SLA: p99 < 500ms)

Configuration:
Reserved Concurrency = 300  (300 dedicated from the account limit)
Provisioned Concurrency = 50  (always 50 waiting in a warm state)

Behavior:
- Normally: 50 Provisioned instances handle the load, no cold starts
- When traffic spikes: requests beyond 50 create new instances (cold starts possible)
- When traffic exceeds 300: ThrottlingException (Reserved acts as the upper limit)
- Other functions cannot use these 300 (dedicated allocation)

Auto Scaling setting:
Automatically add PC when PC is 80% used
```

```bash
# Automatically adjust Provisioned Concurrency with Application Auto Scaling
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --resource-id function:payment-api:prod \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --min-capacity 10 \
  --max-capacity 200

aws application-autoscaling put-scaling-policy \
  --service-namespace lambda \
  --resource-id function:payment-api:prod \
  --scalable-dimension lambda:function:ProvisionedConcurrency \
  --policy-name pc-tracking-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 0.7,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "LambdaProvisionedConcurrencyUtilization"
    }
  }'
```

## Asynchronous Error Handling Pattern: Business Errors vs System Errors

You should not handle every error in Lambda the same way.

**System errors (retryable)**: DB connection failures, HTTP timeouts, transient 503s. Throw an exception so you can take advantage of Lambda's retry mechanism.

**Business errors (no retry needed)**: Invalid data, no permission, domain rule violations. Retrying gives the same result, so do not throw an exception; instead return a success response or route the error event to another queue.

```python
import logging
import json
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

class BusinessError(Exception):
    """Domain rule violation — retrying is pointless"""
    pass

class RetryableError(Exception):
    """Transient system error — retrying may succeed"""
    pass

def lambda_handler(event, context):
    try:
        order_id = event.get('orderId')
        if not order_id:
            # Business error — retrying won't help
            # Return an error response instead of an exception, or send directly to SQS
            logger.error(f"Invalid order ID: {event}")
            return {'status': 'BUSINESS_ERROR', 'reason': 'orderId missing'}
        
        result = process_order(order_id)
        return {'status': 'SUCCESS', 'orderId': order_id}
    
    except RetryableError as e:
        # Retry needed — re-raise the exception to trigger a Lambda retry
        logger.warning(f"Transient error, will retry: {str(e)}")
        raise  # Lambda's asynchronous retry mechanism kicks in
    
    except Exception as e:
        # Unexpected error — retry while investigating the situation
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise
```

## Throttling Response Patterns

**A client that receives 429 on a synchronous invocation:**
```python
import boto3
import time
from botocore.exceptions import ClientError

lambda_client = boto3.client('lambda')

def invoke_with_retry(function_name, payload, max_retries=3):
    for attempt in range(max_retries):
        try:
            return lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='RequestResponse',
                Payload=payload
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'TooManyRequestsException':
                wait_time = (2 ** attempt) + (random.random() * 0.5)  # jitter
                logger.warning(f"Throttled. Retrying in {wait_time:.2f}s (attempt {attempt+1}/{max_retries})")
                time.sleep(wait_time)
            else:
                raise
    raise Exception("Maximum retry count exceeded")
```

**Using SQS as a buffer:**
If a sudden traffic spike is expected, instead of having callers invoke Lambda directly, put the requests in SQS and let the Lambda ESM regulate the processing rate. SQS acts as the buffer.

```
[Traffic spike] → [Direct Lambda invocation] → 429 throttling
                                         ↓
[Traffic spike] → [SQS queue] → [Lambda ESM] → processing rate adjusted automatically
```

## Summary

Lambda concurrency control is a system in which four different mechanisms are layered. Reserved provides per-function isolation and an upper limit, Provisioned removes cold starts, the burst limit caps the scale-out speed, and the account limit sets the overall ceiling. Error handling happens in completely different layers for each invocation type, and you need to know exactly "where retries happen and where failure events go" for each invocation type.

In the next post, we will review all of Week 3 and check every Lambda concept with scenario-based questions.

---

## 📝 Practice Questions

**Question 1.** A Lambda function receives 2,000 requests per second with an average execution time of 300ms. What concurrency is required?

A) 100  
B) 300  
C) 600  
D) 2,000  

**Answer: C**  
Explanation: Concurrency = RPS × execution time (seconds) = 2,000 × 0.3 = 600. Securing this concurrency reliably takes up 60% of the account concurrency limit (default 1,000). If you set Reserved Concurrency 700 on this function, you get enough headroom while still leaving 300 for other functions.

---

**Question 2.** What is the result of setting a Lambda function's Reserved Concurrency to 0?

A) The default concurrency limit (1,000) applies  
B) The function runs only sequentially  
C) Every invocation immediately returns a ThrottlingException (429)  
D) The function is removed from the Lambda service  

**Answer: C**  
Explanation: Setting Reserved Concurrency to 0 means the function has 0 concurrency allocated, so every invocation is throttled immediately. This is used as a way to temporarily disable a function (without deploying code and without deleting it). It is useful for preventing the function from being invoked by mistake outside a deployment window, or when an emergency block is needed.

---

**Question 3.** What problem occurs when a single record keeps failing in a Kinesis Data Streams ESM, and what is the most effective combination of fixes?

A) The Lambda DLQ automatically isolates the failed record  
B) The entire shard is blocked — resolve it with MaximumRetryAttempts and BisectBatchOnFunctionError + an OnFailure Destination  
C) Kinesis automatically deletes that record  
D) Lambda automatically skips that record  

**Answer: B**  
Explanation: A Kinesis ESM retries a failed record indefinitely by default, which blocks the processing of all new records on that shard. If the CloudWatch `IteratorAge` metric keeps rising, you know this is the situation. The fixes: limit the retry count with `MaximumRetryAttempts`, isolate the problem record by bisecting the failed batch with `BisectBatchOnFunctionError`, and send the final failed records to SQS/SNS with an `OnFailure Destination` to analyze later.

---

**Question 4.** Which statement about the difference between an SQS DLQ and a Lambda DLQ is correct?

A) The SQS DLQ applies to asynchronous Lambda invocations, and the Lambda DLQ applies to ESM  
B) The SQS DLQ is a property of the SQS queue applied to ESM failure handling, and the Lambda DLQ sends the event when an asynchronous invocation finally fails  
C) The two concepts are identical and only the names differ  
D) Only the Lambda DLQ supports EventBridge as a target  

**Answer: B**  
Explanation: The SQS DLQ is a property of the SQS queue itself; when an SQS message exceeds `maxReceiveCount`, the message is moved to the DLQ. In an SQS-Lambda ESM, if Lambda fails repeatedly, the message returns to the queue after the visibility timeout, and when maxReceiveCount is exceeded it moves to the SQS DLQ. The Lambda DLQ is part of the Lambda function configuration; when an asynchronous invocation (S3, SNS, etc.) finally fails (the original and both retries all fail), it sends the event to SQS or SNS.

---

**Question 5.** Which of the following is NOT an advantage of Lambda Destinations?

A) You can set a target for both success events and failure events  
B) It supports EventBridge as a target  
C) It automatically handles failed messages from an SQS ESM  
D) It delivers the original event together with function response metadata  

**Answer: C**  
Explanation: Lambda Destinations apply only to asynchronous invocations (S3, SNS, EventBridge, direct asynchronous invoke). Failures in an SQS ESM are handled not by Lambda Destinations but by the DLQ setting on the SQS queue itself. A, B, and D are all real advantages of Destinations.

---

**Question 6.** Which is correct for the current default concurrency scaling rate of a Lambda function?

A) At the account level, 500 to 3,000 per Region in the first minute, then 500 per minute after that  
B) 100 execution environments per minute per function  
C) 1,000 execution environments every 10 seconds per function  
D) Immediately up to the account concurrency limit with no restriction  

**Answer: C**  
Explanation: Since late 2023, Lambda increases concurrency by 1,000 execution environments every 10 seconds per function. Scaling continues up to the account concurrency limit (default 1,000), and for spikes beyond that, throttling (429 `TooManyRequestsException`) occurs. A is the previous model that gave an initial per-Region burst at the account level, and it survives only in old materials. B is a number that does not exist, and concurrency does not increase instantly without limit as in D.

