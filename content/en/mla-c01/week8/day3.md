# Day 3 - Operational Monitoring: CloudWatch Metrics/Alarms, Endpoint Latency/Errors, Logging

Days 1-2 examined "is the model correct (drift)"; today we ask "is the system healthy". Even accurate models mean nothing if endpoint response slows, instances die from overload, or calls fail with 5xx errors—to users it is broken service. **Operational monitoring**' heart is **Amazon CloudWatch**. MLA-C01 asks "how do you track operational issues via metrics, trigger alarms, and auto-respond?"

CloudWatch provides three things: **Metrics** (time-series numbers), **Logs** (text records), **Alarms** (threshold-triggered auto-response). Adding **AWS X-Ray** for distributed tracing completes the picture.

## Key Metrics SageMaker Endpoints Emit

SageMaker auto-sends endpoint calls and instance status to CloudWatch. Frequently-tested metrics:

| Metric | Meaning | Namespace |
|--------|---------|-----------|
| `ModelLatency` | Time model spends inferencing (microseconds) | AWS/SageMaker |
| `OverheadLatency` | SageMaker overhead (request handling overhead) | AWS/SageMaker |
| `Invocations` | Endpoint invocation count | AWS/SageMaker |
| `Invocation4XXErrors` / `5XXErrors` | Client/server error invocation count | AWS/SageMaker |
| `CPUUtilization` / `MemoryUtilization` / `GPUUtilization` | Instance resource usage % | /aws/sagemaker/Endpoints |

Total response latency ≈ **ModelLatency + OverheadLatency**. Sudden latency increase: pinpoint whether ModelLatency (model/instance load) or OverheadLatency (request handling/payload problem)—source found.

> 💡 **Related Theory**: 4XX and 5XX errors assign responsibility differently. **4XX (client errors)** = invalid input, bad format, auth issues—fixed by payload validation or client correction. **5XX (server errors)** = container crash, timeout, resource exhaustion—fixed by instance scaling, health checks, container debugging. Sudden 5xx spike suggests server-side problems. On exams, "narrow down error spike root cause" starts with 4XX/5XX distinction.

## CloudWatch Alarms for Auto-Response

Viewing metrics alone is useless. Crossing thresholds must auto-notify or act. **CloudWatch Alarm** changes state to ALARM when metric satisfies condition, triggering **SNS notification**, **auto-scaling**, **Lambda invocation**, etc.

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
    Period=60,                       # evaluate per 60 seconds
    EvaluationPeriods=3,             # ALARM on 3 consecutive violations
    Threshold=200000,                # 200,000 microseconds = 200ms
    ComparisonOperator="GreaterThanThreshold",
    AlarmActions=["arn:aws:sns:us-east-1:123456789012:ops-alerts"],
)
```

Key parameters: `Period` (evaluation interval), `EvaluationPeriods` (violations before ALARM), `Threshold`, `ComparisonOperator`. Raising `EvaluationPeriods` reduces false alarms from transient spikes.

> ⚠️ **Pitfall**: Traffic spikes cause latency increase. "Send alarm only" is wrong; proper practice is **auto-scaling instances automatically**. SageMaker endpoint auto-scaling typically targets metrics like `SageMakerVariantInvocationsPerInstance` (invocations per instance). On exams, "auto-respond to traffic variability" means Application Auto Scaling policies, not simple alarms.

## Logging — CloudWatch Logs

Endpoint container stdout/stderr auto-flow to **CloudWatch Logs**. Log group typically: `/aws/sagemaker/Endpoints/{endpoint-name}`. See model load failures, exception stack traces, inference warnings here.

```python
logs = boto3.client("logs")
# Filter recent errors from log group
response = logs.filter_log_events(
    logGroupName="/aws/sagemaker/Endpoints/my-endpoint",
    filterPattern="ERROR",          # only logs containing ERROR
    limit=50,
)
```

For bulk log query/aggregation via SQL-like syntax, use **CloudWatch Logs Insights**. Useful for analysis like "past hour top 5xx error causes".

## Distributed Tracing with X-Ray

When endpoints interleave with other services (preprocessing Lambda, external API, database), pinpointing latency bottleneck is hard. **AWS X-Ray** traces each segment (span) duration, visualizing bottlenecks. "Total response slow but ModelLatency normal → upstream Lambda or network is bottleneck" confirmed via X-Ray trace.

> 🔍 **Deeper**: Operational monitoring is "three pillars of observability": **Metrics** (what, how much—latency, error rate, utilization), **Logs** (what happened—events, exception details), **Traces** (where—request flow and per-segment latency). CloudWatch Metrics/Logs and X-Ray map exactly to these. Troubleshooting typically flows "metrics detect anomaly → logs reveal root cause details → traces pinpoint specific segment".

## Cost & Usage also Monitored

Operational monitoring includes cost. Always-on real-time endpoints cost even idle, so if `Invocations` near zero long-term, consider serverless/async transition. CloudWatch dashboard consolidates latency, errors, utilization, invocation count in one view for at-a-glance ops status.

## Summary

Operational monitoring centers on **CloudWatch**, three pillars: **metrics, logs, traces (X-Ray)**. SageMaker endpoints auto-emit `ModelLatency`, `OverheadLatency` (latency), `Invocations` (call count), `4XX/5XX Errors` (errors), `CPU/Memory/GPU Utilization` (resources). **4XX = client, 5XX = server** distinction starts root-cause analysis. **CloudWatch Alarm** auto-responds via SNS/auto-scaling/Lambda on threshold violation; `EvaluationPeriods` reduces false positives. Traffic changes demand **Application Auto Scaling** instance adjustment, not just alarms. Logs via CloudWatch Logs (analysis via Logs Insights); per-segment latency bottlenecks via X-Ray.

Next: What happens when monitoring detects drift or degradation—auto-retraining pipelines and A/B/shadow testing.

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
