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

## 📝 연습 문제

**문제 1.** 한 엔드포인트의 응답이 갑자기 느려졌다. `ModelLatency`는 평소와 같은데 전체 응답 시간만 급증했다. 다음 중 원인을 좁히는 데 가장 적절한 도구는?

A) Model Monitor 데이터 품질 베이스라인  
B) AWS X-Ray로 요청 구간별 지연 추적  
C) Clarify 편향 드리프트 모니터  
D) S3 버전 관리  

**정답: B**  
해설: ModelLatency는 정상인데 전체 지연만 늘었다면 모델 외부 구간(앞단 Lambda·네트워크·외부 API)이 병목이다. X-Ray는 요청이 거치는 각 구간의 소요 시간을 추적해 어디서 지연이 나는지 특정해준다. A·C는 모델/데이터 드리프트용이고, D는 모니터링과 무관하다.

---

**문제 2.** 엔드포인트에서 `Invocation5XXErrors`가 급증했다. 가장 가능성 높은 원인 영역은?

A) 클라이언트가 잘못된 형식의 페이로드를 보냄  
B) 엔드포인트 인스턴스 과부하·컨테이너 충돌·자원 부족  
C) 모델 아티팩트가 S3에 없음  
D) 엔드포인트 생성 시 잘못된 이름  

**정답: B**  
해설: 5XX(서버) 오류는 서버 측 문제(과부하·충돌·자원 부족)를 나타낸다. A는 4XX(클라이언트) 오류, C·D는 배포 단계 문제로 5XX 급증과는 무관하다.

---

**문제 3.** CloudWatch Alarm에서 `EvaluationPeriods=3`은 무엇을 의미하는가?

A) 3초마다 평가한다  
B) 3번 연속 임계치 위반 시 ALARM 상태로 변경  
C) 3개의 별도 알람을 만든다  
D) 3분마다 리셋된다  

**정답: B**  
해설: `EvaluationPeriods`는 몇 번 연속 조건을 만족해야 ALARM으로 전환할지를 정의한다. 3으로 설정하면 3번 연속 위반 후 알람이 발생해 일시적 스파이크에 의한 오탐을 줄인다. A는 `Period`, C는 별개 알람, D는 누적 개념과 무관하다.

---

**문제 4.** 트래픽이 급증해 응답 지연이 늘었다. CloudWatch 알람을 설정했지만 인스턴스는 여전히 부하가 높다. 가장 필요한 조치는?

A) 더 낮은 임계치로 알람을 조정  
B) Application Auto Scaling 정책으로 인스턴스를 자동 증설  
C) 모델을 재학습한다  
D) 엔드포인트를 삭제했다가 다시 만든다  

**정답: B**  
해설: 알람은 알림만 보낼 뿐 자동 대응하지 않는다. 트래픽 변동에 인스턴스를 자동으로 증감하려면 Application Auto Scaling 정책이 필요하다. A는 알림 빈도만 조정하고 대응이 없고, C·D는 상황과 무관하다.

---

**문제 5.** CloudWatch Logs에서 엔드포인트 컨테이너의 stderr 메시지를 보려 할 때, 로그 그룹 이름은?

A) /aws/lambda/inference  
B) /aws/sagemaker/Endpoints/{endpoint-name}  
C) /aws/ecs/services  
D) /aws/ec2/instances  

**정답: B**  
해설: SageMaker 엔드포인트 컨테이너의 로그는 `/aws/sagemaker/Endpoints/{endpoint-name}` 로그 그룹에 저장된다. A는 Lambda, C는 ECS, D는 EC2로 다른 서비스다.

---
