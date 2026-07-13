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

## 📝 연습 문제

**문제 1.** Kinesis Data Streams 컨슈머가 유입 속도를 따라가지 못해 처리 지연이 누적되고 있는지 가장 직접적으로 나타내는 CloudWatch 지표는?

A) IncomingBytes  
B) GetRecords.IteratorAgeMilliseconds  
C) WriteProvisionedThroughputExceeded  
D) PutRecord.Success  

**정답: B**  
해설: IteratorAgeMilliseconds는 컨슈머가 현재 읽고 있는 레코드의 나이를 나타내며, 값이 계속 커지면 컨슈머가 뒤처지고 있다는 핵심 신호입니다. IncomingBytes는 유입량, WriteProvisionedThroughputExceeded는 쓰기 스로틀링, PutRecord.Success는 생산자 성공률로 컨슈머 지연을 직접 나타내지 않습니다.

---

**문제 2.** Glue ETL 잡이 장시간 실행되는 동안 잡이 끝나기 전에도 실시간으로 로그를 CloudWatch Logs에서 확인하려면 어떤 기능을 활성화해야 하는가?

A) Job Bookmark  
B) Partition Projection  
C) DynamicFrame  
D) Continuous Logging(연속 로깅)  

**정답: D**  
해설: 연속 로깅을 활성화하면 잡 완료 전에도 드라이버·익스큐터 로그가 실시간으로 CloudWatch Logs로 전송됩니다. Job Bookmark는 재처리 시 중복 방지용 상태, Partition Projection은 Athena 파티션 계산, DynamicFrame은 Glue의 데이터 추상화로 실시간 로깅과 무관합니다.

---

**문제 3.** Lambda나 컨테이너 기반 파이프라인에서 로그 한 줄에 지표와 풍부한 컨텍스트를 함께 남기고 CloudWatch가 자동으로 지표를 추출하게 하는 방식은?

A) PutMetricData를 호출마다 동기 실행  
B) X-Ray 세그먼트  
C) EMF(Embedded Metric Format)  
D) CloudTrail 데이터 이벤트  

**정답: C**  
해설: EMF는 구조화된 JSON 로그를 출력하면 CloudWatch가 자동으로 커스텀 지표를 추출하는 방식으로, 별도 API 호출 없이 지표와 컨텍스트를 동시에 기록합니다. PutMetricData 동기 호출은 지연·비용 부담이 크고, X-Ray는 추적, CloudTrail은 API 감사 용도입니다.

---

**문제 4.** 여러 개의 개별 알람이 동시에 울려 알림이 폭주(alarm storm)하는 것을 줄이기 위해, 알람들을 AND/OR 논리로 묶어 하나의 상위 상태로 평가하는 CloudWatch 기능은?

A) Composite Alarm(복합 알람)  
B) Metric Math  
C) Anomaly Detection  
D) Dashboard Widget  

**정답: A**  
해설: 복합 알람은 여러 알람의 상태를 불리언 식으로 결합해 단일 알람으로 평가하므로 알람 폭주를 줄이고 의미 있는 상황에서만 통보할 수 있습니다. Metric Math는 지표 계산, Anomaly Detection은 동적 임계값, Dashboard는 시각화 용도입니다.

---

**문제 5.** EMR 클러스터가 작업을 마치고 더 이상 처리할 것이 없어 비용만 발생하는 상태인지 판단해 자동 종료 결정을 돕는 CloudWatch 지표로 가장 적절한 것은?

A) IsIdle  
B) ContainerPendingRatio  
C) AppsRunning  
D) IncomingRecords  

**정답: A**  
해설: IsIdle은 클러스터가 유휴 상태인지 나타내어 비용 절감을 위한 자동 종료 판단에 사용됩니다. ContainerPendingRatio는 리소스 부족, AppsRunning은 실행 중 앱 수를 나타내며, IncomingRecords는 Kinesis 지표로 EMR과 무관합니다.

---
