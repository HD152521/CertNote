# Day 3 - Operational Monitoring: CloudWatch Metrics/Alarms, Endpoint Latency/Errors, Logging

## 📌 Key Takeaways

- If Days 1-2 asked "is the model right", today asks **"is the system healthy"** - and the center of it is **CloudWatch**.
- The three pillars of observability: **metrics (CloudWatch Metrics) · logs (CloudWatch Logs) · traces (X-Ray)**.
- Total latency ≈ **ModelLatency + OverheadLatency**. Which of the two spiked determines the cause.
- **4XX is the client's responsibility, 5XX is the server's.** This is the first branching point when investigating an error-rate surge.
- Responding to traffic swings is properly done with an **Application Auto Scaling** policy, not an alarm notification.

## The Path One Request Takes

To diagnose latency, first draw where a request travels. CloudWatch metrics correspond to each segment of this path.

```text
 [Client]
      │  ①  Network · front end (API Gateway / Lambda)   ← not visible in CloudWatch → X-Ray
      ▼
 ┌───────────────────────────────────────────┐
 │  SageMaker endpoint                          │
 │  ┌─────────────────┐     ┌───────────────────┐ │
 │  │ Request receipt·routing │ ──▶ │ Model container inference │ │
 │  └─────────────────┘     └───────────────────┘ │
 │      ② OverheadLatency      ③ ModelLatency │
 │  Resource state: CPUUtilization / MemoryUtilization / GPUUtilization
 │  Invocation results: Invocations / Invocation4XXErrors / Invocation5XXErrors
 └───────────────────────────────────────────┘
      │
      ▼  CloudWatch Metrics ──▶ Alarm ──▶ SNS · Application Auto Scaling · Lambda
         CloudWatch Logs   ──▶ Logs Insights (cause details)
```

- If the overall response is slow but ③ is normal, suspect ① or ② - it is a front-end or payload problem, not the model.
- If only ③ spikes, it is a model or instance problem - look at instance type, batch size, and instance count.

## Key Metrics a SageMaker Endpoint Emits

SageMaker automatically sends endpoint invocation and instance state to CloudWatch. These are the metrics the exam covers.

| Metric | Meaning | Where (namespace) |
|--------|---------|-------------------|
| `ModelLatency` | Time the model took to run inference (microseconds) | AWS/SageMaker |
| `OverheadLatency` | SageMaker overhead (additional request-handling time) | AWS/SageMaker |
| `Invocations` | Number of endpoint invocations | AWS/SageMaker |
| `Invocation4XXErrors` / `5XXErrors` | Number of client/server error invocations | AWS/SageMaker |
| `CPUUtilization` / `MemoryUtilization` / `GPUUtilization` | Instance resource utilization | /aws/sagemaker/Endpoints |

Total response latency is roughly **ModelLatency + OverheadLatency**. When latency suddenly rises, you have to split it into whether it is ModelLatency (a model or instance load problem) or OverheadLatency (a request-handling or payload problem) to pin down the cause.

Even for the same metric, what you suspect and what you touch first differs when it spikes.

| Metric | Meaning when it spikes | First action |
|--------|------------------------|--------------|
| `ModelLatency` | Model computation is taking long - load, model size, batch settings | Upgrade instance type, add instances, slim down the model |
| `OverheadLatency` | Request-handling overhead - large payloads, serialization, model loading | Shrink or compress the payload, simplify the request format |
| `Invocation4XXErrors` | The caller's fault - format, authentication, size exceeded | Validate the client payload, check the input schema |
| `Invocation5XXErrors` | Server-side problem - container crash, timeout, resource shortage | Check container logs, add instances, raise the timeout |
| `CPUUtilization` | Compute saturation (multi-core, so values over 100% can be reported) | Add instances or change type |
| `MemoryUtilization` | Memory pressure - tends to show up together with 5XX due to OOM | Switch to a larger-memory type, reduce batch size |
| `Invocations` | The traffic change itself | Reset the Auto Scaling target, capacity planning |

> 💡 **Related theory**: 4XX and 5XX errors differ in who is responsible. **4XX (client errors)** come from the caller's wrong input, wrong format, or authentication problems, and are solved by payload validation or fixing the client. **5XX (server errors)** are server-side problems such as model container crashes, timeouts, or resource shortage. If 5XX surges, you need to add instances, check health, and debug the container. When the exam asks "to narrow down the cause of an error-rate surge", the 4XX/5XX split is the first step.

## Automatic Response with CloudWatch Alarms

Just looking at metrics is meaningless. When a threshold is crossed, you must notify or act automatically. A **CloudWatch Alarm** changes its state to ALARM when a metric meets the condition and triggers an **SNS notification**, **Auto Scaling**, a **Lambda trigger**, and so on.

```python
import boto3
cw = boto3.client("cloudwatch")

cw.put_metric_alarm(
    AlarmName="HighModelLatency",
    Namespace="AWS/SageMaker",
    MetricName="ModelLatency",
    Dimensions=[{"Name": "EndpointName", "Value": "my-endpoint"},
                {"Name": "VariantName", "Value": "AllTraffic"}],
    Statistic="Average",
    Period=60,                       # evaluate in 60-second units
    EvaluationPeriods=3,             # ALARM after 3 consecutive breaches
    Threshold=200000,                # 200,000 microseconds = 200ms
    ComparisonOperator="GreaterThanThreshold",
    AlarmActions=["arn:aws:sns:us-east-1:123456789012:ops-alerts"],
    TreatMissingData="notBreaching", # do not treat missing data (zero traffic) as a breach
)
```

The key parameters are `Period` (evaluation interval), `EvaluationPeriods` (how many consecutive breaches before ALARM), `Threshold`, and `ComparisonOperator`. Increasing `EvaluationPeriods` reduces false positives from momentary spikes.

| Alarm parameter | What it adjusts | If set wrong |
|-----------------|-----------------|--------------|
| `Period` | How many seconds the metric is bundled for evaluation | Too short is noise, too long delays detection |
| `EvaluationPeriods` | How many consecutive periods must breach for ALARM | At 1, every spike is a false positive |
| `Statistic` | Average / Sum / Maximum / p99, etc. | Looking only at the average for latency misses tail latency |
| `TreatMissingData` | Interpretation of intervals with no data | False alarms can fire at night when traffic is zero |
| `AlarmActions` | What to do when it fires | If you only attach a notification, it is neglected until a person wakes up |

For latency, the **tail (p90, p99)** is closer to what users feel than the average. If the average is 80ms but p99 is 3 seconds, 1 in 100 people effectively experiences a failure. Setting a single average alarm and concluding "latency is normal" is the most common illusion in operations.

> ⚠️ **Trap**: When latency rises due to a traffic surge, the standard is not "send an alarm and stop" but **Auto Scaling** to add instances automatically. SageMaker endpoint Auto Scaling usually attaches a policy targeting a metric such as `SageMakerVariantInvocationsPerInstance` (invocations per instance). On the exam, "automatically respond to traffic swings" should make you think of an Application Auto Scaling policy, not a simple alarm.

```python
aas = boto3.client("application-autoscaling")

# ① Register the scalable target - adjust the variant's instance count between 1 and 8
aas.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId="endpoint/my-endpoint/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=1, MaxCapacity=8,
)

# ② Target tracking policy - keep invocations per instance near the target value
aas.put_scaling_policy(
    PolicyName="invocations-target-tracking",
    ServiceNamespace="sagemaker",
    ResourceId="endpoint/my-endpoint/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    PolicyType="TargetTrackingScaling",
    TargetTrackingScalingPolicyConfiguration={
        "TargetValue": 1000.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "SageMakerVariantInvocationsPerInstance"},
        "ScaleInCooldown": 300, "ScaleOutCooldown": 60,
    },
)
```

- **Short ScaleOut cooldown, long ScaleIn cooldown** - the basic instinct is to scale up quickly and scale down carefully.
- Adding instances takes provisioning time. Allow for the fact that scale-out is not instant and set the threshold with some headroom.

## Logging - CloudWatch Logs

The stdout/stderr of the endpoint container flows automatically to **CloudWatch Logs**. The log group is usually of the form `/aws/sagemaker/Endpoints/{endpoint-name}`. Model loading failures, exception stack traces, warnings during inference, and so on are seen here.

```python
logs = boto3.client("logs")
# Filter recent errors from a specific log group
response = logs.filter_log_events(
    logGroupName="/aws/sagemaker/Endpoints/my-endpoint",
    filterPattern="ERROR",          # only logs containing ERROR
    limit=50,
)
```

To query and aggregate large volumes of logs with SQL-like syntax, use **CloudWatch Logs Insights**. It is useful for analyses such as "top causes of 5xx errors in the last hour".

```text
fields @timestamp, @message
| filter @message like /ERROR|Exception|Timeout/
| stats count() as hits by bin(5m)
| sort @timestamp desc
```

| What do you want to know | Tool |
|--------------------------|------|
| Are latency and error rate normal right now | CloudWatch Metrics + Alarm |
| The specific exception and stack trace of that error | CloudWatch Logs |
| In which time window and pattern the errors clustered | Logs Insights aggregation query |
| Whether the slow segment is the model or the front end | X-Ray trace |

## Distributed Tracing with X-Ray

When the endpoint is entangled with other services (a preprocessing Lambda, external APIs, a database), it is hard to see at a glance which segment is causing latency. **AWS X-Ray** tracks the time taken in each segment the request passes through and visualizes the bottleneck. "The overall response is slow but ModelLatency is normal → the front-end Lambda or network is the bottleneck" can be confirmed with an X-Ray trace.

Operational monitoring is organized as the "three pillars of observability". **Metrics** (what and how much - latency, error rate, utilization), **logs** (what happened - event and exception details), **traces** (where - request flow and per-segment latency). CloudWatch Metrics, Logs, and X-Ray correspond exactly to these three pillars. The troubleshooting order usually flows "detect an anomaly with metrics → confirm cause details with logs → pinpoint which segment with traces".

## Cost and Usage Are Also Monitoring Targets

Operational monitoring includes cost as well. An always-on real-time endpoint incurs cost even when idle, so if `Invocations` stays near 0 for a long time, consider switching to serverless or asynchronous. Gather latency, errors, utilization, and invocation volume on a CloudWatch dashboard to see the operational state at a glance.

## When Operations Get Tangled: Symptom → Cause → Action

| Symptom | Common cause | Action |
|---------|--------------|--------|
| Total latency rose but `ModelLatency` is normal | The front end (Lambda, API Gateway, network) is the bottleneck | Pinpoint the segment with an X-Ray trace, then improve that segment |
| Only `ModelLatency` spikes | Instance load, heavy model | Upgrade instance type or add instances, slim down the model |
| Only `OverheadLatency` spikes | Large payload, serialization cost, frequent cold loading | Shrink request size, simplify the format |
| `Invocation5XXErrors` surge | Container crash, OOM, inference timeout | Check container logs, larger-memory type, raise timeout and instance count |
| `Invocation4XXErrors` surge | Wrong input format, authentication, payload size exceeded | Strengthen client validation, document the input schema |
| Latency spikes every time traffic grows | Auto Scaling not set or target value too high | Register Application Auto Scaling + lower the target value |
| False alarms keep firing at night | Missing-data handling for zero-traffic intervals | `TreatMissingData="notBreaching"`, adjust the evaluation period |
| Average latency is normal but users complain | Tail latency (p99) is large | Add a p99-based alarm, secure instance headroom |
| Logs are not visible | The execution role lacks CloudWatch Logs write permission | Grant log permissions to the endpoint execution IAM role |
| Few invocations but costs keep accruing | A real-time endpoint is running continuously while idle | Consider switching to serverless or asynchronous inference, delete unused endpoints |

In the next post, we look at the responses that follow when monitoring detects drift or performance degradation - automated retraining pipelines and A/B and shadow testing.

## 📖 Glossary

- **Three pillars of observability**: Metrics (numeric time series), logs (event details), traces (per-segment flow). CloudWatch Metrics, Logs, and X-Ray correspond to each.
- **ModelLatency**: Time the model container spent on inference. If this spikes, it is a model or instance problem.
- **OverheadLatency**: SageMaker-side additional time such as request receipt and routing. It grows when the payload is large or the format is heavy.
- **Invocation4XXErrors / 5XXErrors**: Number of invocations that failed due to the client's fault / number that failed due to server-side problems.
- **CloudWatch Alarm**: A watch rule that switches to the ALARM state when a metric meets a condition and fires SNS, Auto Scaling, or Lambda.
- **EvaluationPeriods**: How many consecutive periods must breach before the alarm sounds. Increasing it reduces false positives from momentary spikes.
- **TreatMissingData**: An option that decides whether intervals with no metric data count as a breach. Used to prevent false alarms during zero-traffic hours.
- **Application Auto Scaling**: A service that automatically increases or decreases the instance count of an endpoint variant based on a metric. The typical target metric is invocations per instance (`SageMakerVariantInvocationsPerInstance`).
- **CloudWatch Logs Insights**: An analysis tool that filters, aggregates, and sorts large volumes of logs with a query syntax.
- **AWS X-Ray**: A distributed tracing service that tracks the time taken in each segment a request passes through and visualizes where it slows down.

---

## 📝 Practice Questions

**Question 1.** An endpoint's responses suddenly became slow. `ModelLatency` is the same as usual, but only the overall response time spiked. Which of the following is the most appropriate tool for narrowing down the cause?

A) Model Monitor Data Quality baseline  
B) Trace per-segment request latency with AWS X-Ray  
C) Clarify Bias Drift monitor  
D) S3 versioning  

**Answer: B**  
Explanation: If ModelLatency is normal but only overall latency increased, the bottleneck is in a segment outside the model (upstream Lambda, network, external API). X-Ray traces the time taken in each segment a request passes through and pinpoints where the delay occurs. A and C are for model/data drift, and D is unrelated to monitoring.

---

**Question 2.** `Invocation5XXErrors` spiked on an endpoint. What is the most likely cause area?

A) The client sent a payload in the wrong format  
B) Endpoint instance overload, container crashes, or resource exhaustion  
C) The model artifact is missing from S3  
D) A wrong name was used when creating the endpoint  

**Answer: B**  
Explanation: 5XX (server) errors indicate server-side problems (overload, crashes, resource exhaustion). A is a 4XX (client) error, and C and D are deployment-stage problems unrelated to a 5XX spike.

---

**Question 3.** In a CloudWatch Alarm, what does `EvaluationPeriods=3` mean?

A) Evaluate every 3 seconds  
B) Change to the ALARM state after 3 consecutive threshold violations  
C) Create 3 separate alarms  
D) Reset every 3 minutes  

**Answer: B**  
Explanation: `EvaluationPeriods` defines how many consecutive times the condition must be met before transitioning to ALARM. Setting it to 3 raises the alarm after 3 consecutive violations, reducing false positives caused by momentary spikes. A describes `Period`, C is separate alarms, and D has nothing to do with the accumulation concept.

---

**Question 4.** Traffic surged and response latency increased. You set up a CloudWatch alarm, but the instances are still under heavy load. What action is most needed?

A) Adjust the alarm to a lower threshold  
B) Automatically scale out instances with an Application Auto Scaling policy  
C) Retrain the model  
D) Delete the endpoint and recreate it  

**Answer: B**  
Explanation: An alarm only sends notifications and does not respond automatically. To automatically add or remove instances as traffic fluctuates, you need an Application Auto Scaling policy. A only adjusts the notification frequency with no response, and C and D are unrelated to the situation.

---

**Question 5.** When you want to view the stderr messages of an endpoint container in CloudWatch Logs, what is the log group name?

A) /aws/lambda/inference  
B) /aws/sagemaker/Endpoints/{endpoint-name}  
C) /aws/ecs/services  
D) /aws/ec2/instances  

**Answer: B**  
Explanation: The logs of a SageMaker endpoint container are stored in the `/aws/sagemaker/Endpoints/{endpoint-name}` log group. A is Lambda, C is ECS, and D is EC2, all different services.

---
