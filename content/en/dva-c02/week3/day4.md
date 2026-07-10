# Day 4 - Lambda Concurrency Control: The Token Bucket Algorithm and the Error-Handling Layers

Lambda's concurrency model looks simple at first sight. It seems like a matter of "how many functions run at the same time". But in reality four different mechanisms are layered on top of each other — the account-wide limit, per-function Reserved concurrency, Provisioned concurrency, and the burst limit — and if you don't understand this layered structure, you can't explain "why my Lambda is throwing 429s" or "why my function is slow because of another team's function".

The same goes for error handling. The three invocation styles — synchronous, asynchronous, and ESM — react completely differently when an error occurs. Not knowing this leads to accidents where an entire Kinesis shard gets blocked, or SQS messages get reprocessed forever.

## The Definition and Calculation of Concurrency

Lambda concurrency is **the number of function instances running simultaneously at a given moment**. The formula is simple.

```
Concurrency = requests per second (RPS) × average execution time (seconds)

Example:
- RPS = 1,000, average execution time = 200ms (0.2s)
- Concurrency = 1,000 × 0.2 = 200

- RPS = 100, average execution time = 5s
- Concurrency = 100 × 5 = 500
```

As the formula shows, the longer the execution time, the higher the concurrency consumption. If a Lambda with a 15-minute timeout is running 100 concurrent executions, it occupies 1,500 concurrency for those 15 minutes — already exceeding the account default limit (1,000).

> 💡 **Related theory**: Lambda's concurrency consumption calculation is identical to Little's Law (1961). `L = λW` — L is the average number of items in the system (concurrency), λ is the arrival rate (RPS), and W is the average time spent in the system (execution time). This law is the foundation of Queueing Theory and is used widely, from call-center staffing to cloud capacity planning. Extend it to the M/M/c queue model and you can even calculate the Lambda throttling probability.

## The Complete Picture of the Four Concurrency Layers

```
Account/region total limit: 1,000 (default, increase can be requested)
│
├── [Function A] Reserved: 300 → up to 300 instances
│   └── Provisioned: 20 → always 20 pre-initialized
│
├── [Function B] Reserved: 200 → up to 200 instances
│
└── [All other functions] shared pool: 500 (1000 - 300 - 200)
    └── Every function without Reserved competes for this 500
```

**Reserved Concurrency:**
- A function's concurrency **ceiling** and **dedicated allocation**
- This function runs up to N at most, and other functions cannot use those N
- Setting it to 0 fully blocks it (ThrottlingException)
- Cost: none

**Provisioned Concurrency:**
- Pre-initializes and keeps on standby the specified number of MicroVMs
- Runs only the INVOKE phase immediately, with no cold start
- Can only be set on a version or alias (`$LATEST` not allowed)
- Cost: number of initialized instances × time × memory (GB) × $0.0000097222/GB-second

```bash
# Set Reserved Concurrency
aws lambda put-function-concurrency \
  --function-name payment-api \
  --reserved-concurrent-executions 300

# Full block (every request immediately gets ThrottlingException)
aws lambda put-function-concurrency \
  --function-name maintenance-mode-function \
  --reserved-concurrent-executions 0

# Provisioned Concurrency (on an alias)
aws lambda put-provisioned-concurrency-config \
  --function-name payment-api \
  --qualifier prod \
  --provisioned-concurrent-executions 20
```

> ⚠️ **Trap**: Setting Reserved Concurrency deducts that amount from the account-wide pool. If you set Reserved=500 on Function A, the remaining functions share only 500. A situation like "why are other functions suddenly getting throttled?" during peak times, when many functions run concurrently, sometimes happens precisely because of a Reserved setting.

## The Burst Concurrency Limit: The Speed Limit on Scale-Out

Lambda automatically increases concurrency during a traffic surge. But it can't increase infinitely fast.

**Initial burst limit:** 500–3,000 per region. Seoul (ap-northeast-2) is 500.

**Subsequent growth rate:** +500 per minute.

What this means: if traffic suddenly needs 5,000 concurrency, in the first minute only 500, after 2 minutes 1,000, after 3 minutes 1,500... it grows in that order. Until it reaches the account limit (1,000). Even if you've raised your account limit to 5,000 via a limit increase request, the scale-out rate is still +500 per minute.

Requests that exceed this rate get a **ThrottlingException (429)**.

| Region | Initial burst |
|------|------------|
| us-east-1, us-west-2, eu-west-1 | 3,000 |
| ap-northeast-1 (Tokyo), ap-southeast-1 | 1,000 |
| ap-northeast-2 (Seoul) | 500 |
| Other regions | 500 |

> 🔍 **Going deeper**: The burst limit is implemented with the Token Bucket algorithm. The bucket holds up to 3,000 tokens (the region burst limit) and refills 500 per minute. Each Lambda invocation consumes one token. No tokens, 429. This algorithm is used across AWS for throttling control — API Gateway, SQS, Kinesis, the EC2 API, and so on. RFC 6585 defined the HTTP 429 status code.

## Diagnosing Concurrency Problems With CloudWatch Metrics

| Metric | Namespace | Meaning | Action if high |
|--------|------------|------|------------|
| `ConcurrentExecutions` | AWS/Lambda | Current concurrent executions | Consider an increase if near the Reserved limit |
| `Throttles` | AWS/Lambda | Number of throttled invocations | Increase Reserved/account limit |
| `ProvisionedConcurrencyUtilization` | AWS/Lambda | PC utilization | Add PC if sustained above 80% |
| `IteratorAge` | AWS/Lambda | Kinesis/DDB Streams processing lag | Continuously increasing → raise ParallelizationFactor |
| `DeadLetterErrors` | AWS/Lambda | DLQ delivery failures | Check DLQ permissions (IAM) |

```bash
# Query concurrency metrics in CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=payment-api \
  --start-time 2026-05-31T00:00:00Z \
  --end-time 2026-05-31T23:59:59Z \
  --period 300 \
  --statistics Maximum
```

> 💡 **Related theory**: `IteratorAge` is the difference between the current time and the Put time of the record being processed from Kinesis/DynamoDB Streams. If this value keeps increasing, Lambda is not keeping up with the stream's rate. The fixes are increasing the number of Kinesis shards (distributing throughput), increasing Lambda's `ParallelizationFactor` (number of parallel Lambdas per shard), or optimizing the Lambda execution time.

## The Error-Handling Layers: A Complete Comparison by Invocation Style

When an error occurs, "who retries" and "where the failure event goes" differ completely by invocation style.

**Synchronous invocation (API Gateway, ALB, direct invoke):**
- When Lambda throws an error, it responds with HTTP 200 + a `FunctionError` header
- Retry is the **caller's responsibility** (API Gateway default: no retry)
- No DLQ. The error event goes nowhere
- If the client gets a 503 or 500, it must implement its own retry

**Asynchronous invocation (S3, SNS, EventBridge, direct invoke with Event type):**
- The Lambda service holds the event in an internal queue
- Automatic retries: up to 2 times, at 1-minute/2-minute intervals (exponential backoff)
- On final failure, sent to DLQ (SQS or SNS) or Destinations OnFailure
- Event age up to 21,600 seconds (6 hours) — after that it is not processed

**ESM polling (SQS, Kinesis, DDB Streams):**
- SQS: message returns to the queue after the visibility timeout. When `maxReceiveCount` is exceeded, SQS DLQ
- Kinesis/DDB Streams: default infinite retry (shard block!). Limiting with `MaximumRetryAttempts` is essential
- A Lambda function's DLQ and an SQS queue's DLQ are **completely different concepts**

```
Error-handling flow by invocation style

[Synchronous - API Gateway]
Client → API GW → Lambda → error occurs
                              ↓
              FunctionError response to API GW
                              ↓
              5XX returned to client (per API GW config)
              Retry = decided by client code

[Asynchronous - S3]
S3 upload → Lambda internal queue → Lambda runs → error occurs
                               ↓
                         auto retry after 1 minute
                               ↓ (fails again)
                         auto retry after 2 minutes
                               ↓ (fails again)
                     → DLQ or Destinations OnFailure

[ESM - SQS]
Message → Lambda polls → Lambda runs → error occurs
                               ↓
         message returns to queue after visibility timeout ends
                               ↓ (maxReceiveCount exceeded)
                     → SQS DLQ (not the function DLQ!)
```

> 📚 **Case study**: In 2020, a fintech startup built a real-time transaction anomaly detection system with Kinesis + Lambda. Anomalous transaction records in a certain format made Lambda processing fail, and because they had not set `MaximumRetryAttempts`, the entire shard got blocked. For several hours, new transaction data went unprocessed and no anomaly alerts went out at all. The `CloudWatch IteratorAge` metric was spiking, but with no alarm it was discovered late. The company then made `IteratorAge > 300000ms` (5 minutes) alarms a mandatory policy on all Kinesis ESMs.

## DLQ vs Lambda Destinations: The Exact Selection Criteria

| Situation | Recommended |
|------|------|
| Preserve asynchronous invocation failure events | Destinations OnFailure |
| Also need to audit asynchronous success events | Destinations OnSuccess |
| Handle final failure in an SQS-Lambda ESM | Set a DLQ on the SQS queue itself |
| Existing legacy code already uses DLQ | Keep DLQ (move to Destinations when you have migration room) |

Reasons Destinations is better than DLQ:
1. **Can handle success events**: You can send an event even when the function succeeded (audit, trigger the next step)
2. **More varied targets**: Not just SQS and SNS, but also EventBridge and Lambda
3. **Rich context**: JSON that includes the original event + request context + response/error information
4. **Standard asynchronous pattern**: Fits better with the fan-out of event-driven architecture

```python
# The event structure Destinations OnFailure delivers (example)
{
  "version": "1.0",
  "timestamp": "2026-05-31T09:30:00Z",
  "requestContext": {
    "requestId": "abc-123",
    "functionArn": "arn:aws:lambda:...:function:payment-api:prod",
    "condition": "RetriesExhausted",
    "approximateInvokeCount": 3  # original 1 + 2 retries
  },
  "requestPayload": {
    "customerId": "C001",
    "amount": 9999
  },
  "responseContext": {
    "statusCode": 200,  # Lambda API level; 200 even if there's a function error
    "executedVersion": "$LATEST",
    "functionError": "Unhandled"
  },
  "responsePayload": {
    "errorMessage": "Payment gateway timeout",
    "errorType": "TimeoutError"
  }
}
```

## SQS DLQ vs Lambda DLQ: Same Name, Different Concept

This is the most-confused part on the exam.

**SQS DLQ (Dead Letter Queue):**
- It is an **attribute** of an SQS queue
- When an SQS message is consumed more than `maxReceiveCount` times, it moves to the SQS DLQ
- In an SQS-Lambda ESM, if Lambda repeatedly fails → the message is retried at each visibility timeout → `maxReceiveCount` exceeded → SQS DLQ

**Lambda DLQ:**
- It is a **setting** of a Lambda function
- Sends the event when an **asynchronous invocation** finally fails (original + 2 retries all fail)
- In an SQS-Lambda ESM, the Lambda DLQ does not apply. ESM failure is handled by the SQS DLQ

```
Scenario: Lambda keeps failing in an SQS → Lambda ESM

Regardless of whether a Lambda DLQ is set!
  → the message returns to the SQS queue after the visibility timeout
  → after maxReceiveCount (default 3) is exceeded
  → moves to the DLQ configured on the SQS queue

The Lambda DLQ works for asynchronous invocations like S3/SNS
```

## A Practical Pattern for Using Reserved + Provisioned Concurrency Together

```
Scenario: financial API (payment processing)
- Normal traffic: 50 concurrency
- Peak traffic: 200 concurrency
- Cold starts unacceptable (response time SLA: p99 < 500ms)

Configuration:
Reserved Concurrency = 300  (300 dedicated allocation from the account limit)
Provisioned Concurrency = 50  (always 50 on warm standby)

Behavior:
- Normal: 50 Provisioned instances handle it, no cold starts
- During a surge: requests beyond 50 create new instances (cold starts possible)
- When traffic exceeds 300: ThrottlingException (Reserved acts as the ceiling)
- Other functions cannot use this 300 (dedicated allocation)

Auto Scaling configuration:
Automatically add PC when PC is 80% utilized
```

```bash
# Auto-adjust Provisioned Concurrency with Application Auto Scaling
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

## Asynchronous Error-Handling Patterns: Business Errors vs System Errors

You should not handle all errors in Lambda the same way.

**System errors (retryable)**: DB connection failure, HTTP timeout, transient 503. Throw an exception to leverage Lambda's retry mechanism.

**Business errors (no retry needed)**: invalid data, no permission, domain rule violation. Since retrying gives the same result, don't throw an exception — return a success response or route the error event to a different queue.

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
            # Business error — retrying is useless
            # Return an error response or send directly to SQS instead of raising
            logger.error(f"Invalid order ID: {event}")
            return {'status': 'BUSINESS_ERROR', 'reason': 'orderId missing'}
        
        result = process_order(order_id)
        return {'status': 'SUCCESS', 'orderId': order_id}
    
    except RetryableError as e:
        # Retry needed — re-raise to induce a Lambda retry
        logger.warning(f"Transient error, will retry: {str(e)}")
        raise  # Lambda's asynchronous retry mechanism kicks in
    
    except Exception as e:
        # Unexpected error — retry while investigating
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise
```

> 🔍 **Going deeper**: The pattern of distinguishing business errors from system errors is discussed in Martin Fowler's "Patterns of Enterprise Application Architecture" (2002). In distributed systems, the concept of a **transient failure** is added here — an error that may succeed on retry. The AWS SDK internally retries using exponential backoff with jitter. This algorithm was explained publicly in the AWS "Exponential Backoff And Jitter" blog post (2015).

## Throttling Response Patterns

**A client receiving 429s on synchronous invocation:**
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
    raise Exception("Max retries exceeded")
```

**Using SQS as a buffer:**
If a sharp traffic surge is expected, instead of the caller invoking Lambda directly, put it into SQS and let the Lambda ESM regulate the processing rate. SQS acts as a buffer.

```
[Traffic surge] → [direct Lambda invoke] → 429 throttling
                                         ↓
[Traffic surge] → [SQS queue] → [Lambda ESM] → processing rate auto-regulated
```

> 💡 **Related theory**: This pattern is a textbook case of **Backpressure** handling in distributed systems. It's the same as the downstream controlling the upstream at a rate it can handle, as in the Reactive Streams specification (Java 9 Flow API, Project Reactor, RxJava). SQS absorbs the upstream's rate, and Lambda consumes at the rate it can process.

## Wrapping Up

Lambda concurrency control is a system of four different mechanisms layered on top of each other. Reserved provides per-function isolation and a ceiling, Provisioned removes cold starts, the burst limit caps the scale-out rate, and the account limit sets the overall ceiling. Error handling happens at completely different layers per invocation style, and you have to know exactly, per invocation style, "where it retries and where the failure event goes".

In the next article, we review all of Week 3, checking every Lambda concept with scenario-based questions.

---

## 📝 연습 문제

**문제 1.** If a Lambda function gets 2,000 requests per second and its average execution time is 300ms, what concurrency is required?

A) 100  
B) 300  
C) 600  
D) 2,000  

**정답: C**  
해설: Concurrency = RPS × execution time (seconds) = 2,000 × 0.3 = 600. To reliably secure this concurrency, it occupies 60% of the account concurrency limit (default 1,000). Setting Reserved Concurrency of 700 on this function secures ample headroom while leaving 300 for other functions.

---

**문제 2.** What is the result of setting a Lambda function's Reserved Concurrency to 0?

A) The default concurrency limit (1,000) applies  
B) The function runs only sequentially  
C) Every invocation immediately returns ThrottlingException (429)  
D) The function is removed from the Lambda service  

**정답: C**  
해설: Setting Reserved Concurrency to 0 means the function is allocated 0 concurrency, so every invocation is immediately throttled. This is used as a way to temporarily disable a function (without deploying code, without deleting it). It's useful for preventing accidental invocations outside the deployment window, or when an emergency block is needed.

---

**문제 3.** In Kinesis Data Streams ESM, what problem occurs when one record keeps failing, and what is the most effective combination of solutions?

A) A Lambda DLQ automatically isolates the failed record  
B) The entire shard is blocked — resolve with MaximumRetryAttempts and BisectBatchOnFunctionError + OnFailure Destination  
C) Kinesis automatically deletes that record  
D) Lambda automatically skips that record  

**정답: B**  
해설: Kinesis ESM by default retries a failed record infinitely, which blocks the processing of all new records in that shard. You can tell you're in this situation when the CloudWatch `IteratorAge` metric keeps increasing. Solutions: limit the retry count with `MaximumRetryAttempts`, isolate the problem record by binary-searching the failed batch with `BisectBatchOnFunctionError`, and send final-failure records to SQS/SNS with an `OnFailure Destination` for later analysis.

---

**문제 4.** Which is correct about the difference between an SQS DLQ and a Lambda DLQ?

A) The SQS DLQ applies to asynchronous Lambda invocations, and the Lambda DLQ applies to ESM  
B) The SQS DLQ is an attribute of the SQS queue and applies to ESM failure handling, while the Lambda DLQ sends the event on the final failure of an asynchronous invocation  
C) The two concepts are identical and differ only in name  
D) Only the Lambda DLQ supports EventBridge as a target  

**정답: B**  
해설: The SQS DLQ is an attribute of the SQS queue itself; when an SQS message exceeds `maxReceiveCount`, that message is moved to the DLQ. In an SQS-Lambda ESM, if Lambda repeatedly fails, the message returns to the queue after the visibility timeout, and when maxReceiveCount is exceeded, it moves to the SQS DLQ. The Lambda DLQ is part of the Lambda function's configuration; it sends the event to SQS or SNS when an asynchronous invocation (S3, SNS, etc.) finally fails (original + 2 retries all fail).

---

**문제 5.** Which of the following is NOT an advantage of Lambda Destinations?

A) You can set targets for both success and failure events  
B) It supports EventBridge as a target  
C) It automatically handles failed messages from an SQS ESM  
D) It delivers the original event together with function response metadata  

**정답: C**  
해설: Lambda Destinations apply only to asynchronous invocations (S3, SNS, EventBridge, direct async invoke). Failures in an SQS ESM are handled by the SQS queue's own DLQ setting, not by Lambda Destinations. A, B, and D are all genuine advantages of Destinations.

---

**문제 6.** What is the Lambda burst concurrency limit in the Seoul region (ap-northeast-2)?

A) 3,000  
B) 1,000  
C) 500  
D) No limit  

**정답: C**  
해설: The Seoul region's initial burst concurrency limit is 500. us-east-1, us-west-2, and eu-west-1 are 3,000. After the initial burst, it can increase by +500 per minute, up to the account limit (default 1,000). On a sudden traffic surge that exceeds this limit, a ThrottlingException occurs.
