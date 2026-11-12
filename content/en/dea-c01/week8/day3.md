# Day 3 - Logging, Audit, and Troubleshooting: CloudTrail and Failure Recovery

## 📌 Key Takeaways

- CloudTrail = "who called which API" (audit); CloudWatch Logs = "what the application printed." If the question starts with "who," it is CloudTrail.
- Management events are recorded by default and can be looked up in Event history for 90 days. **Data events**, such as S3 object access, **must be turned on explicitly** to be recorded.
- Debugging narrows from top to bottom: orchestrator → failed task logs → input data → permissions and resources → CloudTrail.
- Retry only transient errors, and add exponential backoff and jitter. Retries are safe only for idempotent operations, and permanent failures are isolated with Catch.
- Move repeatedly failing messages to a DLQ so the queue does not get blocked, and after fixing the cause, put them back with redrive.

## CloudTrail: Who, When, What

When a pipeline stops, the ability to reconstruct "what happened" is half of operations. Of the material for that, the part that records "what people and systems told AWS to do" is CloudTrail.

| Event type | What it holds | Recorded by default? |
|------|------|------|
| Management events | Control-plane operations such as creating, modifying, and deleting resources and IAM changes | Recorded |
| Data events | Data-plane operations such as S3 object GET/PUT, Lambda Invoke, and DynamoDB item-level operations | Not recorded (turn on by specifying resource types) |
| Network activity events | API calls made through VPC endpoints | Not recorded |
| Insights events | Unusual API call volume or error rates | Not recorded |

- **Event history** shows the past 90 days of **management events** per Region with no setup at all. It is an immutable record, but after 90 days you can no longer see events, and data events are not in it.
- To keep records longer than 90 days or to record data events, create a **trail** and export to an S3 bucket. A trail can also send events to CloudWatch Logs and EventBridge.
- Delivery to S3 is not instantaneous. According to the S3 documentation, data events are delivered at 5-minute intervals and management events at 15-minute intervals. To receive "what just happened" as a real-time alarm, use an EventBridge rule.
- With **log file integrity validation** on, you can verify with hashes and signatures whether delivered log files were tampered with or deleted. S3 server access logs do not have this feature.
- Collect logs for the whole organization in the central account's bucket with an organization trail, and keep that bucket separate from operations accounts and unmodifiable.
- **CloudTrail Lake** puts events into an event data store and lets you query them with SQL. Retention goes up to about 7 years or about 10 years depending on the pricing option.

```text
Question: "Who DROPped the curated table early yesterday morning?"
→ In CloudTrail, narrow eventSource=glue.amazonaws.com, eventName=DeleteTable
  by time and userIdentity
```

> 💡 **Related theory**: CloudWatch Logs holds logs written by the application, while CloudTrail records AWS API calls. A `DROP TABLE` statement executed in Athena remains in the Athena query history, and the `glue:DeleteTable` that was called as a result remains in CloudTrail. Remembering that one incident leaves traces in two places in different forms speeds up tracing.

## Four Similar Logs

| Log | What it records | Default state | Clue for choosing it |
|------|------|------|------|
| CloudTrail management events | API calls that change resources, permissions, and settings | On (90-day lookup) | "Who changed the table, policy, or key?" |
| CloudTrail data events | Object- and item-level access | Off; billed when on | "Who read this object?" |
| S3 server access logs | Requests that arrived at a bucket | Off; delivery within a few hours (best effort) | When you must see authentication-failed requests, or lifecycle transitions and expirations |
| CloudWatch Logs | Text output by jobs and functions | Depends on the service and settings | "Why did it fail? (stack trace)" |

- CloudTrail does not record requests that **failed authentication** because the credentials were invalid. It does record insufficient permissions (`AccessDenied`). If you need to see authentication failures too, use server access logs.
- Records of lifecycle rules moving or deleting objects appear only in server access logs. If "an object disappeared but there is no DeleteObject in CloudTrail," suspect lifecycle expiration.

## Querying CloudTrail Logs with Athena

JSON logs that a trail has accumulated in S3 can be turned into an Athena table and searched with SQL.

```sql
-- Calls that deleted or changed Glue catalog tables in the past two days
SELECT eventtime, useridentity.arn AS who, eventname, sourceipaddress, requestparameters
FROM cloudtrail_logs
WHERE eventsource = 'glue.amazonaws.com'
  AND eventname IN ('DeleteTable', 'UpdateTable', 'BatchDeleteTable')
  AND eventtime >= '2026-06-25T00:00:00Z'
ORDER BY eventtime DESC;
```

- The log volume is large, so apply a date-based partition (or partition projection) to reduce the amount scanned.
- For a call made by assuming a role (AssumeRole), the role session appears in `userIdentity`. To find the actual person, trace back one more step to the `AssumeRole` event that created that session.

## Pipeline Debugging Workflow

When an incident occurs, do not open the code first; narrow from top to bottom.

1. **Start with the orchestrator**: Look at which task failed in the Step Functions execution graph or the Airflow (MWAA) DAG.
2. **Logs of the failed task**: Look at the exception stack in the CloudWatch Logs of the relevant Glue, EMR, or Lambda.
3. **Inspect the input data**: Schema changes, empty partitions, corrupted files.
4. **Inspect permissions and resources**: IAM and Lake Formation denials, KMS key permissions, throttling, out of memory.
5. **Trace changes with CloudTrail**: Whether someone recently changed a table, policy, or setting.

```text
Step Functions execution → TransformJob failed
  → CloudWatch Logs (Glue): "AnalysisException: cannot resolve 'email'"
  → Cause: upstream renamed the email column to user_email
  → Action: fix the mapping + add a schema validation gate
```

- If "a job that worked until yesterday fails with no code change," it is steps 3 and 5. The data changed, or someone changed a setting.

## Common Failure Types: Symptom → Cause → Action

| Symptom (log or error) | Cause | Action |
|------|------|------|
| `ProvisionedThroughputExceededException`, `Rate exceeded`, `ThrottlingException` | API or throughput limit exceeded | Backoff retries, add capacity, batch the calls |
| Spark executor OOM, tasks die repeatedly | Partitions too large, or skew | Adjust partition count, distribute keys, use workers with more memory |
| Only some tasks take unusually long | Data skew | Check shuffle metrics, use salting or broadcast joins |
| `AccessDenied` | One of IAM policy, Lake Formation permission, or KMS key policy is missing | Check the three layers in order (Week 9) |
| A job runs a long time and is forcibly terminated | Glue job timeout | Check the timeout value. If left blank, it is 2,880 minutes for Glue 4.0 and below and 480 minutes for 5.0 and above |
| Starting the same job concurrently causes an error | Exceeded the maximum concurrent runs (default 1) | Raise concurrent runs or queue job runs |
| A job inside a VPC times out calling KMS | No path to KMS | KMS VPC endpoint or NAT |
| Column not found, type mismatch | Upstream schema change | Fix the mapping, schema validation gate |

- The automatic retry count of a Glue job is set between 0 and 10. **A job that ended by timeout is not restarted.** A design that tries to solve timeouts with retries does not work.
- If a long-running job is cut off at 8 hours after moving up to Glue 5.0, the default timeout has changed. Exam material may present the old default (48 hours).

## Retries and Failure Recovery: Step Functions Retry and Catch

In distributed systems, transient errors are normal. The key is to **distinguish errors worth retrying from permanent errors**.

```json
"Retry": [{
  "ErrorEquals": ["ThrottlingException", "Glue.ConcurrentRunsExceededException"],
  "IntervalSeconds": 5,
  "BackoffRate": 2.0,
  "MaxAttempts": 4,
  "MaxDelaySeconds": 60,
  "JitterStrategy": "FULL"
}],
"Catch": [{
  "ErrorEquals": ["States.ALL"],
  "ResultPath": "$.error",
  "Next": "QuarantineAndNotify"
}]
```

| Field | Default | Meaning |
|------|------|------|
| `IntervalSeconds` | 1 | Time to wait before the first retry |
| `MaxAttempts` | 3 | Maximum number of retries. 0 means no retry |
| `BackoffRate` | 2.0 | Multiplier applied to the interval on each retry |
| `MaxDelaySeconds` | No limit | Upper bound on how far the interval grows |
| `JitterStrategy` | `NONE` | With `FULL`, waits a random time between 0 and the computed interval |

- Jitter is **off by default.** If many executions fail at the same moment, they pile back in at the same moment (thundering herd). Specify `FULL` explicitly.
- `States.ALL` matches every error name, but it must appear alone in its array and as the last entry. `States.TaskFailed` matches every error except `States.Timeout`.
- `States.Runtime` (for example, applying a path to a null payload) can be neither retried nor caught and fails the execution. `States.DataLimitExceeded` is not caught by `States.ALL` and must be named explicitly to be caught.
- If a state has both Retry and Catch, **Retry comes first.** If it still fails after using up the retries, it moves on to Catch. If it has neither, an error in one state fails the entire execution.
- Retries also count as state transitions. Standard workflows are billed by the number of state transitions, so near-unlimited retries become a cost.
- After fixing a failed execution, you can use **redrive** to continue from the failure point instead of running from the beginning.

> 💡 **Related theory**: Retries are safe only for idempotent operations. Blindly retrying a non-idempotent operation such as "increase the balance by 100" applies it twice. Protect it with an idempotency key or a conditional write. For a load job, partition overwrite or MERGE instead of append plays the same role.

## Retry Defaults That Differ by Service

| Executor | Default retry | If all attempts fail |
|------|------|------|
| Step Functions Task | No retry if Retry is not specified | Catch; if none, the execution fails |
| Lambda asynchronous invocation | On function error, 2 more attempts (after 1 minute, then after another 2 minutes). Throttles and system errors are retried by default for up to 6 hours | The event is discarded. It remains only if you attach a DLQ or an on-failure destination |
| Lambda stream event source mapping (Kinesis) | Retries the same batch until the records expire | The shard is blocked. Isolate with a retry limit, batch splitting, or an on-failure destination |
| SQS consumer | The message becomes visible again after the visibility timeout passes | Goes to the DLQ when `maxReceiveCount` is exceeded |
| Glue job | Restarts the configured number of times (0 to 10) | Ends in a failed state |

- Defaults are mixed: some mean "retry almost forever" (stream mapping) and others "no retry" (Step Functions). In a question, first check which service is doing the invoking.

## DLQ (Dead-Letter Queue) Handling

If a message that keeps failing stays in the original queue, the consumer receives the same message and fails again and again. A **DLQ** is a queue that sets aside messages that have failed more than a certain number of times.

```text
Normal queue → consumer fails N times (maxReceiveCount) → DLQ
DLQ → root-cause analysis → fix → put back into the source queue (redrive)
```

| Item | Content |
|------|------|
| Move condition | The message was received `maxReceiveCount` times, as set in the source queue's redrive policy, without being deleted |
| Location constraint | The DLQ must be in the same account and the same Region as the source queue |
| Visibility timeout | Default 30 seconds, up to 12 hours from the moment the message is first received. If shorter than the processing time, a message still being processed becomes visible again and is processed twice |
| Retention period (standard queue) | Expiration is based on **the time it entered the original queue.** Moving to the DLQ does not restart the clock |
| Retention period (FIFO queue) | The timestamp is reset when moved to the DLQ |
| Redrive allow policy | Restricts which source queues may use this queue as a DLQ |

- For standard queues, set the DLQ retention period **longer than the source queue's.** A message that spent a day in the source queue disappears from a 4-day-retention DLQ after 3 days. That is why evidence vanishes before you can analyze it.
- If you set `maxReceiveCount` low, such as 1, a single transient error sends the message to the DLQ. Give it enough retry attempts.
- Attaching a DLQ to a FIFO queue changes the order as failed messages are pulled out. Do not use a DLQ for work where order must not break.
- Make an alarm fire when even a single message accumulates in the DLQ. A DLQ without an alarm is a warehouse of silent data loss.
- In Lambda asynchronous invocation, the **DLQ** receives the discarded event itself, while the **on-failure destination** receives a record of the failed invocation. In new designs, use the destination, which carries more information.

## Question Clue → Answer Lookup Table

| Question clue | Answer |
|------|------|
| "Who deleted the table, down to the credentials and time" | CloudTrail |
| "Who read objects in a sensitive bucket" | Enable CloudTrail data events |
| "API call history older than 90 days" | Keep in S3 with a trail (or CloudTrail Lake) |
| "Prove that logs have not been tampered with" | Log file integrity validation |
| "Where to look first when finding the cause of an incident" | The failed task in the orchestrator |
| "Intermittent failures from transient throttling" | Retry + exponential backoff + jitter |
| "A message that keeps failing even after retries blocks the queue" | DLQ + `maxReceiveCount` |
| "Reprocess failed messages after fixing the cause" | DLQ redrive |
| "Data is applied twice because of retries" | Idempotency (idempotency key, conditional write, MERGE) |

Tomorrow we cover how much a well-running pipeline costs: cost visibility, sizing, and automatic scaling.

## 📖 Glossary

- **Management events**: Records of API calls that create, change, and delete resources. CloudTrail records them by default.
- **Data events**: Records of calls that handle data inside a resource, such as reading and writing objects. They are recorded only if you turn them on.
- **Trail**: A setting that continuously exports CloudTrail events to an S3 bucket or similar destination.
- **Event history**: The list of management events for the last 90 days that you can view without any setup.
- **Exponential backoff**: A method that multiplies the waiting time on each retry.
- **Jitter**: A random value mixed into the retry interval. It prevents many clients from piling in at the same time.
- **Catch**: A Step Functions setting that receives errors retries could not resolve and sends them to another state.
- **Visibility timeout**: The time during which an SQS message received by a consumer is hidden from other consumers.
- **DLQ**: A queue that collects messages that have failed processing multiple times.
- **redrive**: Sending DLQ messages or failed executions back into the processing path after fixing the cause.

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
