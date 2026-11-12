# Day 5 - Week 8 Comprehensive Review: Data Operations and Support Recap

## 📌 Key Takeaways

- Operations problems split into four questions: **Is it healthy right now?** (CloudWatch) / **Is the data right?** (Glue Data Quality) / **Why, and who broke it?** (logs and CloudTrail) / **How much does it cost?** (cost tools).
- "Who did it" is CloudTrail; "how the system behaved" is CloudWatch Logs and Metrics. The key streaming-lag metric is `IteratorAgeMilliseconds`.
- The quality rule language is DQDL, and for data whose volume varies you add anomaly detection. Block and quarantine anything below the standard with a Step Functions Choice state.
- Retry only idempotent work, with exponential backoff and jitter. Move repeated failures to a DLQ and redrive after fixing the cause.
- Look at cost with allocation tags, handle variation with auto scaling, and handle the baseline with sizing and commitments. Sizing comes first.

## The Operations Map Through Four Questions

This week covered the stage where a pipeline, once "built," is "operated." The four days' topics are not separate; they are the four questions an operator asks in turn while going through a single incident.

```
                     Pipeline in operation
                            │
   ┌──────────────┬─────────┴────────┬───────────────┐
 Is it healthy?   Is the data right?  Why/who broke it?  What does it cost?
   (Day 1)          (Day 2)            (Day 3)           (Day 4)
   │                │                  │                 │
 CloudWatch       Glue Data          CloudWatch Logs   Cost allocation tags
 metrics, alarms  Quality            CloudTrail        Cost Explorer
 EMF, composite   DQDL, anomaly      Retry/Catch, DLQ  Budgets, anomaly
 alarms           detection                            detection
```

- The first two questions on the left are **detection,** the third is **diagnosis and recovery,** and the fourth is **sustainability.** When reading a problem, first decide which of the four the question is asking, and you can narrow the choices.
- A common wrong-answer structure is "a tool from the wrong column." It makes you pick CloudWatch Logs for "who deleted it" and CloudTrail for "detect a cost spike."

## Signal → Tool Mapping

| What you want to know | Where to look | Easy wrong choice |
|------|------|------|
| Is the consumer falling behind | `GetRecords.IteratorAgeMilliseconds` (Maximum) | `IncomingBytes` (just the inbound volume) |
| Are writes being rejected | `WriteProvisionedThroughputExceeded` | Iterator age (a read-side metric) |
| Why is a Glue job slow | Shuffle, heap, and executor metrics; driver and executor logs | CloudTrail |
| Is EMR idle | Consecutive `IsIdle` values, auto-termination policy | `AppsRunning` at a single point in time |
| Is the incoming data trustworthy | Glue Data Quality score and rule results | CloudWatch metrics (tell you only whether the job succeeded) |
| Who changed the table or policy | CloudTrail management events | CloudWatch Logs |
| Who read the object | CloudTrail data events (you turn them on) | Management events |
| Which team spent how much | Activated cost allocation tags + Cost Explorer | Budgets |
| A cost spike different from usual | Cost Anomaly Detection | Budgets (looks only at the threshold you set) |

- "The job succeeded" and "the data is right" are different facts. A job can read an empty file and still succeed. That is why monitoring (Day 1) cannot substitute for quality validation (Day 2).

## Distinguishing Look-Alikes

**Records and logs**

| Distinction | CloudWatch Logs | CloudTrail management events | CloudTrail data events | S3 server access logs |
|------|------|------|------|------|
| Question answered | What was printed | Who changed the configuration | Who touched the data | What requests arrived at the bucket |
| Default state | Varies by service | On (90-day lookup) | Off | Off |
| Unique use | Stack traces | Auditing | Object-level auditing | Authentication failures, lifecycle actions |

**Three features that catch "different from usual"**

| Distinction | Target | Day |
|------|------|------|
| CloudWatch Anomaly Detection | Operational metrics (lag, error rate) | Day 2 |
| Glue Data Quality anomaly detection | Data statistics (row count, completeness) | Day 2 |
| Cost Anomaly Detection | Cost | Day 4 |

- All three solve the same problem that "it is hard for a person to set a threshold." When all three appear together in the choices, pick by **what** is anomalous.

**Four mechanisms for handling failure**

| Mechanism | Target | Behavior |
|------|------|------|
| Retry | Transient errors | Try again with increasing intervals |
| Catch | Errors retries did not resolve | Branch to another state (quarantine, notification) |
| DLQ | Messages that failed repeatedly | Pull out of the queue and keep separately |
| Validation gate | Execution succeeded but quality fell short | Block progress to the next stage |

- The first three are mechanisms for when **the execution fails;** the fourth is for when **the execution succeeded but the result is wrong.**

**Features that adjust capacity automatically**

| Feature | What it increases | What the user sets |
|------|------|------|
| Glue Auto Scaling | Workers during a job run | Maximum number of workers |
| EMR Managed Scaling | Core and task nodes | Minimum and maximum, On-Demand limit, core limit |
| Kinesis on-demand | Shards | Nothing (only the mode choice) |
| Redshift Concurrency Scaling | Temporary query clusters | Queue mode, upper bound on cluster count |

## Week 8 Numbers and Defaults on One Page

| Area | Item | Value |
|------|------|------|
| CloudWatch | Metric resolution | Standard 1 minute, high resolution 1 second (custom metrics only) |
| CloudWatch | Metric retention | 15 days at 1-minute, 63 days at 5-minute, 455 days at 1-hour granularity |
| CloudWatch | Default missing-data handling | `missing` (`INSUFFICIENT_DATA` if everything is empty) |
| CloudWatch | High-resolution alarm period | 10 or 30 seconds |
| Glue | Job metric reporting interval | 30 seconds |
| Glue | Job timeout default | 2,880 minutes for 4.0 and below, 480 minutes for 5.0 and above |
| Glue | Automatic retries | 0 to 10 times; a timed-out job is not restarted |
| Glue | Real-time logs | Default in 5.0; for 4.0 and below, turn on continuous logging |
| EMR | Metric reporting interval | 5 minutes (cannot be changed) |
| Kinesis | Stream metrics | 1 minute, free. Shard metrics are a paid option |
| Glue DQ | Minimum data for anomaly detection | 3 data points |
| Glue DQ | Ruleset limits | 2,000 rules, 65KB |
| CloudTrail | Event history | 90 days of management events |
| Step Functions | Retry defaults | Interval 1 second, 3 attempts, multiplier 2.0, no jitter |
| Lambda asynchronous | Retries on function error | 2 (after 1 minute, after 2 minutes) |
| SQS | Visibility timeout | Default 30 seconds, maximum 12 hours |
| Cost tags | Propagation delay | Up to 24 hours; backfill up to 12 months |
| Athena | Minimum per-query scan limit | 10MB |

- Two values have changed recently: the default Glue job timeout (48 hours → 8 hours from 5.0) and whether cost allocation tags apply retroactively (not possible → backfill possible). Exam material may present the old values.

## Integrated Scenario: Operating a Nightly Order ETL

```text
00:00 EventBridge schedule → Step Functions pipeline starts
  1) Glue ingestion job (real-time logs + Auto Scaling + job metrics)
  2) Glue Data Quality evaluation (DQDL + anomaly detection)
       └─ Critical rule fails or score < 0.95 → quarantine bucket + SNS + stop
  3) EMR transform (core On-Demand, task Spot, Managed Scaling)
  4) Load to curated + Athena validation query

Cost operations:
  - Project/Environment tags on every resource, activated in the management account
  - Budgets 80% alert, Cost Anomaly Detection for spike detection
  - Monthly Cost Explorer review to readjust sizing
```

## Following One Incident Through the Four Questions

Suppose something went wrong on the same pipeline before dawn. The four days' content connects in chronological order.

| Time | What happened | What is used | Day |
|------|------|------|------|
| 02:10 | A composite alarm fires (job failure rate + processed count 0) | Composite alarm, `TreatMissingData=breaching` | Day 1 |
| 02:12 | In the Step Functions execution graph, you confirm the quality evaluation step branched to failure | Look at the orchestrator first | Day 3 |
| 02:15 | Rule results: `RowCount` is 40% of usual, `IsComplete "customer_id"` fails | DQ rule results and anomaly observation | Day 2 |
| 02:20 | You check the failed rows in the quarantine bucket: `customer_id` is NULL for every order from one region | Row-level results + failure reasons | Day 2 |
| 02:30 | Source extraction job log: the table to join could not be found | CloudWatch Logs | Day 1, 3 |
| 02:35 | CloudTrail: the previous evening, a role changed a catalog table with `UpdateTable` | Management events | Day 3 |
| 03:00 | After restoring the table definition, reprocess only that date partition, and redrive the failed execution | Idempotent reprocessing, redrive | Day 2, 3 |
| Next day | Because of the reprocessing, that day's Glue cost is double the usual. Check the anomaly detection alert; the budget was not exceeded | Cost Anomaly Detection vs Budgets | Day 4 |

- The alarm fired at 02:10 because missing-data handling had been set on the processed count metric. With the default, a person would have found it in the morning.
- Curated was not contaminated at 02:15 because the gate was **before** the load. Without the gate, what happened after 02:30 would have been "investigating the extent of contamination."
- The reprocessing at 03:00 did not create duplicates because the load was a partition overwrite.

## Common Pitfalls

- **A quiet alarm is not evidence of health.** If the metric stops, an alarm with the default setting does not fire.
- **The quality score is not a row ratio.** It is the ratio of rules that passed, so judge critical rules separately from the score.
- **Anomaly detection does not work from day one.** Statistics must accumulate, and an anomalous value caught once is learned as normal unless you exclude it.
- **Even with CloudTrail on, object access is not recorded.** Data events are a separate setting.
- **Jitter in Step Functions is off by default.** Backoff alone does not scatter concurrent retries.
- **The DLQ of a standard queue does not restart the retention period.** Set DLQ retention longer than the source queue's.
- **A tag does not show up in cost unless activated, even if attached.** In an organization, that is the management account's job.
- **An Athena workgroup alert does not stop queries.** Only the per-query limit does.
- **Raising the scaling upper bound does not reduce the usual cost.** Redo the baseline.

## Question Clue → Answer Lookup Table

| Question clue | Answer |
|------|------|
| "Who deleted it" + "how far the consumer lagged" | CloudTrail + `IteratorAgeMilliseconds` |
| "Behavior when the quality score is below the threshold" | Block with Choice, quarantine, notify |
| "Principle when switching task nodes to Spot" | Keep core nodes on a stable option |
| "Precondition for automatic retries" | The task is idempotent |
| "Auto scaling is on but the usual cost is excessive" | Check baseline sizing |
| "The pipeline stopped but there was no alert" | Missing-data handling, alarm on a heartbeat-style metric |
| "Reprocess failed messages in the queue after fixing the cause" | DLQ redrive |
| "Detect spikes when a budget threshold is hard to set" | Cost Anomaly Detection |

Next week is data security and governance. We start with access control in IAM and Lake Formation.

## 📖 Glossary

- **Observability**: The degree to which you can tell from the outside what is happening inside a system through metrics, logs, and traces.
- **Symptom-based alarm**: An alarm placed not on a resource number such as CPU but on a phenomenon users experience, such as lag or failure rate.
- **Validation gate**: A point that does not pass data whose quality falls short of the standard to the next stage.
- **Quarantine bucket**: A place that collects data that failed the gate, together with the failure reasons.
- **Idempotent reprocessing**: Reprocessing where running the same interval several times gives the same result as running it once.
- **redrive**: Putting failed messages or executions back on the processing path after fixing the cause.
- **Baseline**: The base capacity fitted to the normal load. Distinguish it from the variation that scaling absorbs.
- **Runbook**: A procedure document that records what to check and what action to take, in what order, when a particular failure occurs.

## 📝 Practice Questions

**Question 1.** Which combination of tools is correct for finding out "who deleted the prod Glue table yesterday" and "how far behind the Kinesis consumer was last night," respectively?

A) CloudWatch Logs for both  
B) CloudTrail for the deletion, CloudWatch IteratorAgeMilliseconds for the lag  
C) X-Ray for the deletion, CloudTrail for the lag  
D) Cost Explorer for both  

**Answer: B**  
Explanation: Auditing API calls ("who deleted") is done with CloudTrail, and streaming lag is measured with the CloudWatch IteratorAgeMilliseconds metric. CloudWatch Logs alone is insufficient for auditing, X-Ray is for tracing, and Cost Explorer is a cost analysis tool.

---

**Question 2.** What is the recommended pipeline behavior when the Glue Data Quality score is below the threshold in a nightly ETL?

A) Load it into curated as is and correct it later  
B) Automatically lower the threshold so it passes  
C) Block downstream with a Step Functions Choice, quarantine the data, and notify  
D) Delete the job immediately  

**Answer: C**  
Explanation: A validation gate blocks failing data from proceeding downstream, sends it to a quarantine bucket, and notifies, stopping the spread of contamination. Loading as is or lowering the threshold defeats the quality gate, and deleting the job loses the chance to reprocess.

---

**Question 3.** Which principle is the most appropriate to apply together when switching EMR task nodes to Spot to reduce cost?

A) Keep the core nodes that hold HDFS data on a stable option  
B) Switch the core nodes to Spot as well  
C) Disable automatic scaling  
D) Store all data locally on the task nodes  

**Answer: A**  
Explanation: Task nodes are stateless and can tolerate Spot reclamation, but core nodes that hold HDFS data must be kept On-Demand/committed to prevent data loss when reclaimed. Switching core nodes to Spot or storing data locally increases the risk of data loss.

---

**Question 4.** When configuring an external API call task with frequent transient errors to be retried automatically, which condition must be satisfied for safety?

A) The task must be non-idempotent  
B) The retry interval must always be 0  
C) Logging must be disabled  
D) The task must be idempotent  

**Answer: D**  
Explanation: Because a retry can cause the same operation to run multiple times, it is safe only for idempotent operations. A non-idempotent operation corrupts data through duplicate application, a retry interval of 0 causes a storm, and disabling logging makes debugging difficult.

---

**Question 5.** Even after introducing automatic scaling, the baseline cost is still excessive. What should be checked first?

A) Add more alarms  
B) Remove all tags  
C) Check whether the baseline resource sizing (workers/instances/memory) is appropriate  
D) Raise the automatic scaling upper limit to infinity  

**Answer: C**  
Explanation: Automatic scaling only absorbs fluctuations and cannot fix a wrong baseline, so if the everyday cost is high, you should first readjust the baseline sizing. Adding alarms, removing tags, and raising the scaling upper limit do not address the root cause, an oversized baseline.

---
