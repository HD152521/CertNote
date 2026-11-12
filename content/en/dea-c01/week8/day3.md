# Day 3 - Logging, Audit, and Troubleshooting: CloudTrail and Failure Recovery

"What happened?" reconstruction when pipelines stop is half of operations. Today we audit via CloudTrail, systematically debug pipelines, recover from failures, and handle DLQ (dead letter queue).

## CloudTrail: Who, When, What

CloudTrail is account **API call audit log**. Where CloudWatch shows "how system operates" (metrics/logs), CloudTrail shows "who called which operation."

- **Management Events**: Control plane operations—resource create/modify/delete, IAM changes. Enabled by default.
- **Data Events**: Data plane operations—S3 object GET/PUT, Lambda Invoke, etc. Large volume; default disabled; selectively enable.
- **Insights Events**: Auto-detect anomalous API call spikes.

```text
Question: "Who dropped prod curated table last night?"
→ CloudTrail: find glue:DeleteTable / athena query events by timestamp and userIdentity
```

> 💡 **Related Theory**: CloudWatch Logs and CloudTrail have different roles. CloudWatch Logs = application writes, CloudTrail = AWS API calls. Security, audit, "who did this" questions use CloudTrail.

Best practice: centralize organization's CloudTrail logs in central S3 bucket, immutably store (object lock/separate account) for audit.

## Pipeline Debugging Workflow

Don't dive into code when pipeline fails; narrow top-to-bottom:

1. **Orchestrator first**: Step Functions execution graph / Airflow(MWAA) DAG identify which task failed.
2. **Failed task logs**: CloudWatch Logs for that Glue/EMR/Lambda job; find exception stack.
3. **Input data check**: Schema change, empty partition, corrupted file.
4. **Permissions and resources**: IAM denied, throttled, OOM (out of memory).
5. **CloudTrail for change tracking**: Recently someone modified table/policy/config?

```text
Step Functions execution → ❌ TransformJob fails
  → CloudWatch Logs(Glue): "AnalysisException: cannot resolve 'email'"
  → Root cause: upstream schema changed email column to user_email
  → Action: fix mapping + add schema validation gate
```

## Common Failure Types and Clues

- **Throttling**: `ProvisionedThroughputExceededException`, `Rate exceeded` → backoff/retry, increase capacity.
- **OOM**: Spark executor OOM → adjust partition count, increase executor memory, resolve data skew.
- **Permission denied**: `AccessDenied` → check IAM/Lake Formation permissions, KMS key permissions.
- **Data skew**: Data concentrated in specific key → some tasks run long (`shuffleBytes` metric clue).

## Retry and Failure Recovery

Transient errors normal in distributed systems. Core is **distinguishing retryable from permanent errors**.

```json
// Step Functions Retry/Catch (concept example)
"Retry": [{
  "ErrorEquals": ["States.TaskFailed", "ThrottlingException"],
  "IntervalSeconds": 5,
  "BackoffRate": 2.0,
  "MaxAttempts": 3
}],
"Catch": [{
  "ErrorEquals": ["States.ALL"],
  "Next": "QuarantineAndNotify"
}]
```

- **Exponential backoff + jitter**: Increase retry intervals, add randomness to prevent thundering herd.
- **Catch after max retries**: Permanent failure goes to isolation/notify path.

> 💡 **Related Theory**: Retries safe only on idempotent work. Retrying non-idempotent work (e.g., "increase balance") applies duplicates. Protect with idempotent keys or conditional writes.

## DLQ (Dead Letter Queue) Handling

Messages repeatedly failing if left in normal queue blocks consumers. **DLQ** separates messages failing repeated attempts.

- **SQS**: Messages exceeding `maxReceiveCount` move to DLQ.
- **Lambda (async invoke)**: Failure sends to SQS/SNS DLQ, or more common **Lambda Destinations** (onFailure).
- **Kinesis/event source mapping**: `OnFailure` target records failed batch metadata to SQS/SNS.

```text
Normal queue → consumer fails N times → DLQ
DLQ → (operator/reprocessing job) → root cause → fix, redrive
```

SQS **DLQ redrive** lets messages from DLQ return to original queue for reprocessing after fix.

## Key Takeaways

- CloudTrail = "who called which API" (audit); CloudWatch Logs = "what did application write."
- Debug top-to-bottom: orchestrator → failed task logs → input → permissions → CloudTrail.
- Retry transient errors with exponential backoff+jitter; catch permanent with isolation. Safe only on idempotent work.
- DLQ isolates repeat-fail messages; redrive after fix to reprocess.

## 📝 Practice Questions

**Question 1.** Which service should you look at to trace "who deleted a table in the Glue Data Catalog last night," including the credentials and the time?

A) CloudWatch Logs  
B) CloudTrail  
C) X-Ray  
D) Glue Data Quality  

**Answer: B**  
Explanation: CloudTrail records AWS API calls along with the credentials (userIdentity) and time, so you can audit "who did what." CloudWatch Logs holds application logs, X-Ray is distributed tracing, and Glue Data Quality evaluates data quality, so none of them is for API auditing.

---

**Question 2.** Which mechanism prevents a consumer's repeated failures to process a particular message in an SQS queue from blocking processing of the entire queue?

A) Switch to a FIFO queue  
B) Set the visibility timeout to 0  
C) Shorten the message retention period  
D) Dead-letter queue (DLQ) + maxReceiveCount  

**Answer: D**  
Explanation: Moving messages that repeatedly fail beyond maxReceiveCount to a DLQ keeps the main queue from being blocked, and after the cause is fixed they can be reprocessed with redrive. Switching to FIFO, a visibility timeout of 0, and a shorter retention period do not solve the problem of isolating repeatedly failing messages.

---

**Question 3.** In Step Functions, what is the recommended strategy for responding to transient errors (for example, ThrottlingException) while reducing retry storms (thundering herd)?

A) Immediate infinite retries  
B) Retry at a fixed interval of 1 second  
C) Exponential backoff + jitter  
D) Fail immediately without retrying  

**Answer: C**  
Explanation: Exponential backoff progressively lengthens the retry interval, and jitter (randomness) spreads out simultaneous retries from multiple clients to prevent a storm. Infinite or fixed-interval retries aggravate the load, and failing immediately without retries gives up the chance to recover from transient errors.

---

**Question 4.** What is the biggest risk that can occur when automatically retrying a non-idempotent operation (for example, "increase the account balance by 100")?

A) The same operation is applied more than once, corrupting the data  
B) The operation becomes slower  
C) Logs disappear  
D) IAM permissions change  

**Answer: A**  
Explanation: Retrying a non-idempotent operation applies the same operation multiple times (for example, the balance increases twice), breaking data integrity. Protect it with an idempotency key or conditional writes so that retries are safe. Slowdown, log loss, and permission changes are not the core risk.

---

**Question 5.** When debugging a pipeline failure, which is the most appropriate place to check first?

A) The GC logs of an individual executor  
B) The request cost of the S3 bucket  
C) VPC flow logs  
D) Which task failed in the orchestrator (Step Functions/MWAA)  

**Answer: D**  
Explanation: Debugging is efficient when you narrow down from the top, so first identify the point of failure in the orchestrator, and then check the logs, inputs, and permissions of that task. GC logs, request cost, and flow logs are detailed clues to look at as needed after narrowing the scope.

---
