# Day 1 - Pipeline Monitoring: CloudWatch Metrics, Logs, and Alarms

"Keeping data pipelines running" is harder than "making them run in the first place." Today we cover monitoring pipelines via CloudWatch, tracking Glue, EMR, Kinesis services, and tracing latency.

## Three Pillars of Observability and CloudWatch

Operational visibility typically consists of **metrics**, **logs**, and **traces**. In AWS these map to CloudWatch Metrics, CloudWatch Logs, and AWS X-Ray respectively. Data pipeline monitoring almost always starts with CloudWatch; most AWS services auto-publish operational metrics to CloudWatch namespaces without configuration.

- **CloudWatch Metrics**: Time-series numbers (job count, processed records, latency). Organized by namespace/dimensions.
- **CloudWatch Logs**: Text log streams (job stdout, driver/executor logs, Lambda output).
- **CloudWatch Alarms**: Trigger SNS notifications or auto-actions when metrics exceed thresholds.

> 💡 **Related Theory**: CloudWatch metrics have standard resolution (1-min) and high resolution (1-sec). Capture fast-changing streaming latency via high-resolution custom metrics; standard for typical batch jobs.

## Custom Metrics and EMF

When service-provided metrics suffice, applications publish custom metrics directly. Use `PutMetricData` API, or more efficiently, **EMF (Embedded Metric Format)** logs; CloudWatch auto-extracts metrics.

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

EMF logs metric and context simultaneously, preferred for Lambda/container-based pipelines.

## Glue Monitoring

Glue jobs auto-publish core metrics:

- `glue.driver.aggregate.numCompletedTasks` / `numFailedTasks`: Task success/failure counts.
- `glue.driver.aggregate.elapsedTime`: Job elapsed time.
- `glue.driver.ExecutorAllocationManager.executors`: Active executors (observe scaling).
- `glue.driver.aggregate.shuffleBytesWritten`: Shuffle volume (hint at data skew, join costs).

```python
# Enable Job Bookmark + Continuous Logging in Glue job
job = Job(glueContext)
job.init(args['JOB_NAME'], args)
# Specify --enable-continuous-cloudwatch-log, --enable-metrics as job params
```

Continuous Logging streams real-time logs to CloudWatch Logs before job completion, tracking long-running job progress.

> 💡 **Related Theory**: Glue Job Bookmark isn't a monitoring metric, but state enabling reprocessing to skip already-processed data, ensuring idempotency on restart failure.

## EMR Monitoring

EMR publishes cluster, node, YARN-level metrics to CloudWatch:

- `YARNMemoryAvailablePercentage`, `MemoryAvailableMB`: Memory available (scaling/failure hints).
- `ContainerPendingRatio`: Pending container ratio → resource shortage signal.
- `AppsRunning`, `AppsFailed`: Application status.
- `IsIdle`: Idle status (for auto-termination to cut costs).

Configure Spark UI and EMR step logs saved to S3 for post-termination debugging.

## Kinesis Monitoring and Latency Tracking

In streaming, "how far behind are we now" is critical:

- **`GetRecords.IteratorAgeMilliseconds`**: Age of records consumer is reading. Continuously rising means consumer can't keep up (core latency indicator).
- `IncomingRecords` / `IncomingBytes`: Ingestion volume.
- `WriteProvisionedThroughputExceeded` / `ReadProvisionedThroughputExceeded`: Shard throughput exceeded (throttling) → signal to add shards or switch On-Demand.

```text
Alarm example: IteratorAgeMilliseconds > 60000 (1 min) sustained 5 min → SNS notify
Meaning: Consumer lag accumulating, check shard/parallelism/processing logic
```

## Alarm Design Principles

- **Symptom-based alarms**: Alert on user-impacting symptoms (increasing latency, rising failure rate), use dashboards for basic resource metrics.
- **Composite Alarms**: Combine multiple alarms with AND/OR to reduce alarm storms.
- **`TreatMissingData`**: Specify whether missing data means `breaching` or `notBreaching`. When job doesn't run and metric doesn't emit, treating as breaching is safer for many cases.

## Key Takeaways

- Observability = Metrics + Logs + X-Ray; CloudWatch is data pipeline's starting point.
- Glue: Continuous logging + `--enable-metrics` for real-time tracking, observe task failures and shuffle metrics.
- EMR: YARN memory, container pending, IsIdle for resource/cost, save logs to S3.
- Kinesis latency core metric: `IteratorAgeMilliseconds`; throttling: ProvisionedThroughputExceeded.

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
