# Day 1 - Pipeline Monitoring: CloudWatch Metrics, Logs, and Alarms

## 📌 Key Takeaways

- Observability = metrics (CloudWatch Metrics) + logs (CloudWatch Logs) + traces (X-Ray). CloudWatch is the starting point for data pipeline monitoring.
- An alarm fires when `Datapoints to Alarm` datapoints breach the threshold within `Period × Evaluation Periods`. A metric that stops arriving altogether is only caught if you decide it explicitly with `TreatMissingData`.
- Glue sends metrics every 30 seconds and EMR every 5 minutes. For Glue you watch task failures, shuffle, and executor counts; for EMR you watch YARN memory, pending containers, and `IsIdle`.
- The key streaming-lag metric is `GetRecords.IteratorAgeMilliseconds` (statistic: Maximum), and throttling shows up in `Read/WriteProvisionedThroughputExceeded`.
- For custom metrics, EMF, which emits metrics from a single log line, fits Lambda and container pipelines better than `PutMetricData`, and alarm storms are tamed by grouping alarms into a composite alarm.

## Three Pillars of Observability and CloudWatch

With data pipelines, "confirming that they keep running" is harder than "making them run in the first place." Today we look at how to observe Glue, EMR, and Kinesis with CloudWatch at the center, and how to trace delays.

- Operational visibility is usually described through three pillars: **metrics**, **logs**, and **traces**. In AWS these are CloudWatch Metrics, CloudWatch Logs, and AWS X-Ray respectively.
- Most AWS services publish operational metrics to their own namespaces with no extra configuration, so pipeline monitoring almost always starts in CloudWatch.

| Component | What it holds | Use in a pipeline |
|------|------|------|
| CloudWatch Metrics | Time-series numbers (organized by namespace and dimensions) | Failed job count, records processed, lag |
| CloudWatch Logs | Text log streams | Job stdout, driver and executor logs, Lambda output |
| CloudWatch Alarms | Result of comparing a metric to a threshold | SNS notifications, automated actions |
| AWS X-Ray | Time spent in each segment of a single request | Tracing bottlenecks in segments that include Lambda or APIs |

## Metric Structure: Namespaces, Dimensions, Resolution, Retention

- A metric is identified by the combination of **name + namespace + dimensions**. If the dimension combination differs, it is a different metric even with the same name. You can attach up to 30 dimensions to a metric.
- For AWS service metrics, omitting a dimension in a query sometimes returns an aggregate, but **custom metrics are not aggregated across dimensions.** They can only be queried by exactly the dimension combination they were published with. This is the cause of "I specified just one dimension and no data shows up."
- There are two resolutions. Standard resolution is 1-minute granularity and high resolution is 1-second granularity; only custom metrics can be published at high resolution.
- Metrics cannot be deleted, and they expire after 15 months if no new data arrives. The older the data, the more coarsely it is rolled up.

| Datapoint period | Retention |
|------|------|
| Under 60 seconds (high resolution) | 3 hours |
| 1 minute | 15 days |
| 5 minutes | 63 days |
| 1 hour | 455 days (15 months) |

- Setting an alarm period shorter than the metric resolution is pointless. If you put a 1-minute alarm on a metric that arrives every 5 minutes, most periods end up as "no data."
- High-resolution metrics can have high-resolution alarms with 10-second or 30-second periods, and these alarms cost more than regular alarms.

> 💡 **Related theory**: To catch fast-changing streaming lag at second-level granularity, use a high-resolution custom metric; for ordinary batch jobs, use standard resolution. High-resolution data stays at one-second granularity for only 3 hours, so for looking at "last night's trend" it ends up being 1-minute aggregation anyway.

## Custom Metrics: PutMetricData, EMF, Metric Filters

When the default service metrics are not enough, the application creates its own metrics. There are three ways.

| Method | How it works | Fits when | Weakness |
|------|------|------|------|
| `PutMetricData` API | Code calls CloudWatch directly | Batch jobs with a low call frequency | Billed per call; a synchronous call adds latency |
| EMF (Embedded Metric Format) | You print a JSON log in a defined structure and CloudWatch extracts the metrics | Environments like Lambda and containers where logs already flow | Requires a log ingestion path |
| Metric filter | Counts lines matching a pattern in existing logs and turns them into a metric | `ERROR` counts for jobs whose code you cannot change | Pattern matching only; does not apply retroactively to logs from before the filter was created |

```json
{
  "_aws": {
    "Timestamp": 1750000000000,
    "CloudWatchMetrics": [{
      "Namespace": "DataPipeline",
      "Dimensions": [["PipelineName"]],
      "Metrics": [{ "Name": "RecordsProcessed", "Unit": "Count" }]
    }]
  },
  "PipelineName": "orders-etl",
  "RecordsProcessed": 18420
}
```

- EMF leaves both the metric and its context (which pipeline, which batch) in a single log line. When a metric spikes, you can find the cause right in the same log.
- If you put a field whose values grow without bound, such as a request ID, into a dimension, every dimension combination creates its own metric and costs balloon. Limit dimensions to low-cardinality values such as pipeline name or environment.

## How Alarms Are Evaluated

| Setting | Meaning |
|------|------|
| Period | The aggregation interval that produces one datapoint |
| Evaluation Periods (N) | How many of the most recent periods to look at |
| Datapoints to Alarm (M) | How many of those must breach the threshold for ALARM ("M out of N") |
| TreatMissingData | How to treat periods that have no datapoint |

- An alarm has three states: `OK`, `ALARM`, and `INSUFFICIENT_DATA`. Actions run once **when the state changes** (Auto Scaling actions are the only exception).
- There are four values for missing-data handling, and the default is `missing`.

| Value | How missing periods are treated | Suitable metrics |
|------|------|------|
| `missing` (default) | If the whole evaluation range is empty, the alarm goes to `INSUFFICIENT_DATA` | The general case |
| `notBreaching` | Treated as healthy | Metrics that appear only when an error occurs (throttle counts, etc.) |
| `breaching` | Treated as a breach | Metrics that must always arrive (heartbeats, processed counts) |
| `ignore` | Keeps the current state | Metrics that are reported only intermittently |

- If a job does not run at all, the failure metric is not emitted either. With the default, the alarm just moves to `INSUFFICIENT_DATA` with no notification. This is the classic incident of "the pipeline stopped overnight and the alarm was silent." Set `breaching` on a metric such as processed count, or attach an action to the `INSUFFICIENT_DATA` transition as well.
- A **composite alarm** combines the states of other alarms with AND/OR. Attaching notifications only to the composite alarm and not to the underlying alarms reduces alarm storms. A composite alarm can send SNS notifications but cannot run EC2 or Auto Scaling actions.
- Put alarms on symptoms (rising lag, rising failure rate), and look at plain resource numbers on a dashboard.

```bash
# Notify if consumer lag stays above 1 minute for 5 minutes
aws cloudwatch put-metric-alarm \
  --alarm-name orders-stream-consumer-lag \
  --namespace AWS/Kinesis \
  --metric-name GetRecords.IteratorAgeMilliseconds \
  --dimensions Name=StreamName,Value=orders \
  --statistic Maximum --period 60 \
  --evaluation-periods 5 --datapoints-to-alarm 5 \
  --threshold 60000 --comparison-operator GreaterThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:data-oncall
```

- This metric exists only when a consumer calls `GetRecords`. If the consumer dies, the metric stops, so you must set `breaching` so that "consumer stopped" is caught by the same alarm.

## Glue Monitoring

When job metrics are enabled (`--enable-metrics`), a Glue job sends metrics to the `Glue` namespace **every 30 seconds**. The dimensions are `JobName`, `JobRunId`, and `Type` (count or gauge). They are recorded as custom metrics, so CloudWatch charges may apply.

| Metric | What it tells you |
|------|------|
| `glue.driver.aggregate.numCompletedTasks` / `numFailedTasks` | Progress, and task failures caused by data or script problems |
| `glue.driver.aggregate.numKilledTasks` | Tasks killed by OOM and the like (suspect skew) |
| `glue.driver.aggregate.elapsedTime` | ETL elapsed time (excluding bootstrap). Detects runs slower than usual |
| `glue.driver.aggregate.bytesRead` / `recordsRead` | Volume read. Whether the bookmark skipped data or the same data is being read again |
| `glue.driver.aggregate.shuffleBytesWritten` | Shuffle volume. The cost of large joins, groupBy, and repartition |
| `glue.driver.jvm.heap.usage` / `glue.ALL.jvm.heap.usage` | Driver and executor heap usage (0 to 1). A precursor to OOM |
| `glue.driver.ExecutorAllocationManager.executors.numberAllExecutors` | Number of executors currently running |
| `glue.driver.ExecutorAllocationManager.executors.numberMaxNeededExecutors` | Maximum number of executors needed for the current load |

- Look at the last two metrics overlaid. If the "needed" count is consistently larger than the "running" count, DPUs are insufficient; if it is far smaller, you have provisioned too much.
- If only the driver heap spikes, suspect code that pulls data into the driver (`collect`) or listing hundreds of thousands of small files. If only a particular executor spikes, it is skew.
- **Logs**: From Glue 5.0 onward, every job writes logs in real time. On 4.0 and earlier, you must turn on **Continuous Logging** (`--enable-continuous-cloudwatch-log`) for logs to flow to CloudWatch Logs before the job ends; with it off, you can see them only after the job finishes. Exam material usually asks this as "turn on continuous logging."
- The default log groups are `/aws-glue/jobs/output` (user stdout and stderr) and `/aws-glue/jobs/error` (system and Spark logs).

```python
# Write to the driver log stream in real time from inside the job script
logger = glueContext.get_logger()
logger.info("orders partition dt=2026-06-26 loaded")
logger.error("schema mismatch: email column missing")
```

> 💡 **Related theory**: A Glue Job Bookmark is not a monitoring metric; it is state that makes a job skip data it has already processed, preventing duplicate processing on rerun. However, if the `bytesRead` metric suddenly drops close to 0 or jumps to several times its usual level, that is a clue that the bookmark has gone wrong.

## EMR Monitoring

EMR sends cluster metrics to the `AWS/ElasticMapReduce` namespace **every 5 minutes**. The interval cannot be changed, and the metrics themselves carry no charge.

| Metric | Meaning | Used for |
|------|------|------|
| `YARNMemoryAvailablePercentage` | Percentage of memory remaining in YARN | Scaling decisions, failure precursor |
| `ContainerPendingRatio` | Pending containers ÷ allocated containers (a number, not a percentage) | Signal of resource shortage |
| `AppsPending` / `AppsRunning` / `AppsFailed` | YARN application states | Progress and health |
| `HDFSUtilization` | HDFS utilization | Deciding whether to add core nodes |
| `MRUnhealthyNodes` / `MRLostNodes` | Number of nodes with full disks or lost communication | Node failures |
| `IsIdle` | 1 if there are no tasks or jobs | Detecting idle clusters |

- `IsIdle` looks only at **that instant**, every 5 minutes. A value of 1 does not mean the cluster idled for the entire 5 minutes, so set the alarm for when it is 1 several times in a row, such as for 30 minutes.
- The feature that shuts down an idle cluster by itself is the **auto-termination policy**. After the specified idle time passes, EMR terminates the cluster.
- When a cluster disappears, the nodes' logs disappear with it. You must configure step logs and Spark event logs to be kept in S3 so you can debug after termination.

## Kinesis Monitoring and Tracking Lag

In streaming, "how far behind are we right now" is the heart of the matter.

| Metric | Meaning | Direction of action |
|------|------|------|
| `GetRecords.IteratorAgeMilliseconds` | How long ago the last-read record entered the stream. 0 means fully caught up | Increase consumer throughput, check for stalls from error retries |
| `IncomingBytes` / `IncomingRecords` | Inbound volume | Basis for recalculating the shard count |
| `WriteProvisionedThroughputExceeded` | Number of write records rejected by throttling | Add shards, check partition key distribution |
| `ReadProvisionedThroughputExceeded` | Number of throttled `GetRecords` calls | Reduce the number of consumers, use enhanced fan-out |
| `PutRecords.ThrottledRecords` / `FailedRecords` | Records rejected within a batch | Check that the producer retries partial failures |
| `SubscribeToShardEvent.MillisBehindLatest` | How far an enhanced fan-out consumer is from the tip of the stream | Per-consumer lag |

- Stream-level metrics arrive every minute at no charge. **Shard-level metrics (enhanced monitoring)** must be turned on separately with `EnableEnhancedMonitoring` and are billed per shard and per metric. To see "whether only a specific shard is hot," you need to turn this on.
- Put the iterator age alarm on the **Maximum** statistic. Average hides a lagging shard behind shards that are keeping up.
- If this value exceeds half the retention period, records are at risk of expiring and being lost. This alarm takes priority over the throttle alarm.

## Finding Answers in Logs

- If you do not set a retention period on a log group, logs accumulate without expiring. Set a retention period for each job to control storage cost.
- **Logs Insights** queries log groups with a query language. You are billed for the amount of log data scanned, so narrow the time range when you run it.
- A **subscription filter** forwards logs in real time to Lambda, Kinesis, or Firehose. Use it to archive logs in S3 for the long term or to send them to OpenSearch.

```text
# Logs Insights: error count per 5-minute bin in recent runs
fields @timestamp, @message
| filter @message like /Exception|ERROR/
| stats count(*) as errors by bin(5m)
| sort errors desc
```

## Symptom → Cause → Action

| Symptom | Likely cause | Action |
|------|------|------|
| The pipeline stopped but no alarm fired | The metric stopped, so the alarm only went to `INSUFFICIENT_DATA` | `TreatMissingData=breaching`, or a lower-bound alarm on processed count |
| Dozens of alarms fire at once | One cause spreads across many metrics | Group them with a composite alarm and send notifications only from the parent alarm |
| A Glue job takes several times longer than usual, with only some executors busy | Data skew | Check shuffle metrics and per-executor heap; distribute keys |
| An EMR step just waits | Insufficient YARN memory | Check `ContainerPendingRatio` and `YARNMemoryAvailablePercentage`, then scale out |
| Iterator age keeps increasing | Consumer processing is too slow, or stalled by error retries | Check consumer logs and error rate; increase shards and parallelism |
| Custom metric charges spike | A field with many unique values is used as a dimension | Reduce dimensions to low-cardinality values |

## Question Clue → Answer Lookup Table

| Question clue | Answer |
|------|------|
| "The metric that most directly shows whether a consumer is falling behind" | `GetRecords.IteratorAgeMilliseconds` |
| "Logs in real time before the job ends" | Glue continuous logging |
| "Both the metric and its context in a single log line" | EMF |
| "Turn the error count in existing logs into a metric without changing the code" | CloudWatch Logs metric filter |
| "Combine several alarms with AND/OR to suppress notification storms" | Composite alarm |
| "Detect idle EMR clusters" | `IsIdle` (or the auto-termination policy) |
| "Check whether only a specific shard is throttled" | Shard-level enhanced monitoring |
| "Who changed the configuration" | Not CloudWatch but CloudTrail (Day 3) |

Tomorrow we cover the problem that a pipeline can run perfectly and still produce wrong content, that is, Glue Data Quality and validation gates.

## 📖 Glossary

- **Namespace**: The container that holds metrics. AWS services use their own namespaces such as `AWS/Kinesis`.
- **Dimension**: A name-value pair attached to a metric. Even with the same metric name, different dimensions make separate metrics.
- **EMF**: A format where printing a JSON log in a defined structure lets CloudWatch extract metrics automatically.
- **Metric filter**: A setting that counts lines matching a pattern in logs and turns them into a metric.
- **Datapoints to Alarm**: The value that sets how many of the evaluation periods must breach the threshold for the alarm to fire.
- **TreatMissingData**: An alarm setting that decides whether periods with no data are treated as healthy, breaching, or ignored.
- **Composite alarm**: An alarm that combines the states of other alarms with AND/OR and evaluates them as one.
- **Continuous logging**: A feature that sends logs to CloudWatch Logs in real time even before a Glue job ends.
- **Iterator age**: How long ago the record a consumer just read entered the stream. The larger it is, the further behind the consumer is.
- **Enhanced monitoring**: A paid option that delivers Kinesis metrics per shard.

## 📝 Practice Questions

**Question 1.** Which CloudWatch metric most directly indicates whether a Kinesis Data Streams consumer is failing to keep up with the incoming rate and processing delay is accumulating?

A) IncomingBytes  
B) GetRecords.IteratorAgeMilliseconds  
C) WriteProvisionedThroughputExceeded  
D) PutRecord.Success  

**Answer: B**  
Explanation: IteratorAgeMilliseconds indicates the age of the record the consumer is currently reading, and a value that keeps growing is the key signal that the consumer is falling behind. IncomingBytes is the inflow volume, WriteProvisionedThroughputExceeded is write throttling, and PutRecord.Success is the producer success rate; none of them directly indicates consumer lag.

---

**Question 2.** Which feature must be enabled to view the logs of a long-running Glue ETL job in CloudWatch Logs in real time, even before the job finishes?

A) Job Bookmark  
B) Partition Projection  
C) DynamicFrame  
D) Continuous Logging  

**Answer: D**  
Explanation: When continuous logging is enabled, driver and executor logs are sent to CloudWatch Logs in real time even before the job completes. Job Bookmark is state for preventing duplicates on reprocessing, Partition Projection is Athena partition computation, and DynamicFrame is Glue's data abstraction, so none relates to real-time logging.

---

**Question 3.** Which approach lets a Lambda or container-based pipeline write metrics and rich context together in a single log line and have CloudWatch extract the metrics automatically?

A) Call PutMetricData synchronously on every invocation  
B) X-Ray segments  
C) EMF(Embedded Metric Format)  
D) CloudTrail data events  

**Answer: C**  
Explanation: With EMF, when you output structured JSON logs, CloudWatch automatically extracts custom metrics, recording metrics and context at the same time without separate API calls. Synchronous PutMetricData calls add latency and cost, X-Ray is for tracing, and CloudTrail is for API auditing.

---

**Question 4.** Which CloudWatch feature combines alarms with AND/OR logic and evaluates them as a single higher-level state, to reduce alarm storms where many individual alarms fire at the same time?

A) Composite Alarm  
B) Metric Math  
C) Anomaly Detection  
D) Dashboard Widget  

**Answer: A**  
Explanation: A composite alarm combines the states of multiple alarms with a Boolean expression and evaluates them as a single alarm, which reduces alarm storms and lets you notify only in meaningful situations. Metric Math is for metric calculations, Anomaly Detection is for dynamic thresholds, and Dashboard is for visualization.

---

**Question 5.** Which CloudWatch metric is the most appropriate for determining whether an EMR cluster has finished its work and has nothing more to process and is only incurring cost, to help decide on automatic termination?

A) IsIdle  
B) ContainerPendingRatio  
C) AppsRunning  
D) IncomingRecords  

**Answer: A**  
Explanation: IsIdle indicates whether the cluster is idle and is used to decide on automatic termination to save cost. ContainerPendingRatio indicates a resource shortage, AppsRunning indicates the number of running applications, and IncomingRecords is a Kinesis metric unrelated to EMR.

---
