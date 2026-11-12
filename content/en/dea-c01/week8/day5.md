# Day 5 - Week 8 Comprehensive Review: Data Operations and Support Recap

This week covered data pipeline "operations" post-construction: monitoring, quality, troubleshooting, cost. Today we tie four topics into one operations scenario. Data operations and support is large DEA-C01 exam domain.

## 1. Pipeline Monitoring (Day 1)

- **Observability 3 pillars**: Metrics (CloudWatch Metrics) + Logs (CloudWatch Logs) + Traces (X-Ray).
- **Glue**: Continuous logging + `--enable-metrics`; watch task failures, shuffle metrics.
- **EMR**: YARN memory, `ContainerPendingRatio`, `IsIdle` for resource/cost judgment; save logs to S3.
- **Kinesis latency**: `IteratorAgeMilliseconds` key; throttling: `ProvisionedThroughputExceeded`.
- **Custom metrics**: EMF logs metric+context simultaneously; composite alarms reduce alarm storms.

> 💡 **Related Theory**: "Symptom-based alarms" on user impact (delay, failure rate) vs. dashboarding simple resource stats reduces alarm fatigue.

## 2. Data Quality and Validation (Day 2)

- **6 dimensions**: Completeness, accuracy, consistency, validity, uniqueness, timeliness.
- **Glue Data Quality**: DQDL rules, recommendation, static + dynamic anomaly detection.
- **Quality gate**: Step Functions Choice blocks downstream on miss → quarantine.
- **Reprocessing**: Idempotency (upsert/deterministic overwrite) + raw preservation + partition-level.
- **Shift-left**: Quality upstream minimizes contamination spread, reprocessing cost.

## 3. Logging, Audit, Troubleshooting (Day 3)

- **CloudTrail** = "who called which API" (audit) vs **CloudWatch Logs** = app output.
- **Debug sequence**: Orchestrator → failed task logs → input data → permissions → CloudTrail.
- **Retry**: Transient errors with exponential backoff+jitter; permanent failures to isolation. Safe only on idempotent.
- **DLQ**: Isolate `maxReceiveCount`-exceeding messages; redrive after fix.

## 4. Cost and Performance Operations (Day 4)

- **Visibility**: Allocation tags (apply post-activation) + Cost Explorer + Budgets + Cost Anomaly Detection.
- **Sizing**: Glue DPU/workers (small jobs Python Shell), EMR instances, Lambda memory.
- **Auto scaling**: Glue Auto Scaling, EMR Managed Scaling, Kinesis On-Demand, Redshift Concurrency Scaling. Baseline sizing first.
- **Purchase options**: Core On-Demand/committed + task Spot. Scan-billed services cut via Parquet, partitions, workgroup limits.

> 💡 **Related Theory**: Auto scaling absorbs "variation," not "wrong baseline." Sizing → scaling sequence is law.

## Integrated Scenario: Overnight Order ETL Operations

```text
00:00 EventBridge schedule → Step Functions pipeline start
  1) Glue collection job (continuous logging + Auto Scaling + metrics enabled)
  2) Glue Data Quality eval (DQDL + anomaly detection)
       └─ score < 0.95 → quarantine + SNS + pipeline stop
  3) EMR transformation (core On-Demand, task Spot, Managed Scaling)
  4) Curated load + Athena validation query

On failure:
  - CloudWatch alarm (IteratorAge/failure rate) → SNS → on-call
  - Step Functions identify failed task → logs → check input/permissions
  - Transient error: Retry (exponential backoff), permanent: Catch → isolate
  - "Config changed?" → CloudTrail trace

Cost operations:
  - Tag all resources Project/Environment
  - Budgets 80% alert, Cost Anomaly auto-detect spikes
  - Monthly Cost Explorer review adjusts sizing
```

## Exam Points Summary

- "Who/audit" → **CloudTrail**; "how system operated" → **CloudWatch Logs/Metrics**.
- Streaming latency core: **IteratorAgeMilliseconds**.
- Data quality rule language: **DQDL**; variable data: **anomaly detection**.
- Retry safe on **idempotent work only**; repeat failures → **DLQ**.
- Cost visibility: **allocation tags**; variance: **auto scaling**; baseline: **sizing/commitments**.

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
