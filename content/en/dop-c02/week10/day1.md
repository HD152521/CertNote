# Day 1 - CloudWatch Metrics: Time Series, Dimensions, and Alarm Evaluation Model Deep Dive

Monitoring a single server is easy. Run `top` and see CPU, `free` and see memory. But when that one server becomes hundreds, Lambda functions run thousands of times per second, and ECS tasks scale up and down, the act of "monitoring" itself becomes a different problem. Who collects these numbers? How do we order them by time? What granularity do we aggregate to? How do we decide what "abnormal" means? CloudWatch Metrics is the foundation that collects numeric time series from almost everything running on AWS, and on top of it sit alarms, autoscaling, dashboards, and anomaly detection.

Today we dig deep into this foundation. Not just "send metrics with PutMetricData," but how metrics are stored internally as data structures (why namespace·name·dimensions combine as a single identifier), why EMF is structurally superior to PutMetricData on both cost and architecture, what reliability engineering principles the three dials of `evaluation-periods`/`datapoints-to-alarm`/`treat-missing-data` encode, and what statistical model Anomaly Detection uses. In DOP-C02 exams, CloudWatch is a foundational service threading through nearly every domain (monitoring, incident response, deployment validation), so scenarios like "why didn't the alarm fire," "how do we cut costs," and "how do we handle metrics where we can't set thresholds manually" appear every exam.

## Metric Identity — What Defines "One Metric"

The most misunderstood concept in CloudWatch is "metric identity." Many people think the metric name (`CPUUtilization`) is the metric itself, but CloudWatch actually identifies a time series with the **full combination of namespace + metric name + dimensions**. If any of these three differs, it's a completely separate time series.

```bash
aws cloudwatch put-metric-data \
  --namespace MyApp/Orders \
  --metric-name OrderCount \
  --value 5 \
  --dimensions Service=checkout,Environment=prod \
  --unit Count
```

This line adds one data point to the time series with key `MyApp/Orders | OrderCount | {Service=checkout, Environment=prod}`. If you change `Environment=staging`, that's a different time series. This design matters because **dimension cardinality (the number of unique combinations) directly equals the metric count, and metric count directly equals cost**. With `Service`(10 types) × `Environment`(3 types), you have 30 time series, but add `UserId`(1 million people) as a dimension and time series explode to millions. This is the root of the high-cardinality trap we'll see later.

> 💡 **Related Theory**: CloudWatch's model is exactly the standard time series database (TSDB) structure. Prometheus expresses the same concept as `metric_name{label1="v1", label2="v2"}` and calls each unique label combination a "series." InfluxDB uses measurement + tag set, OpenTSDB uses metric + tags. The core principle is **dimension (label/tag) is both the unit of indexing and the source of cardinality explosion**. Half of TSDB operations is cardinality management—deciding which dimensions to index and which to skip. CloudWatch charging per dimension comes from the same constraint.

> 🔍 **Deeper**: CloudWatch metrics have **a constraint that once you fix dimensions at publish time, you can't arbitrarily add aggregation dimensions later**. If you publish data with `{Service, Environment}`, then later want to "ignore Service and look at Environment only," you should have published that aggregation combination (`{Environment}` alone) at publish time too. That's why EMF's pattern `Dimensions: [["Service","Environment"], ["Environment"], []]` publishes multiple dimension combinations as arrays in one log output. With PutMetricData you can only send one dimension combination per call, so to see the same data across multiple aggregation views you need multiple calls — this is one place where EMF is structurally superior.

## Custom Metrics — Three Publishing Paths and Their Cost Models

AWS services automatically emit metrics to namespaces like `AWS/EC2`, `AWS/Lambda`. But business metrics like "order count" or "payment failure rate" you must publish yourself. There are three publishing paths, and their difference isn't just API choice but **cost model and data binding strategy**.

**First, PutMetricData API.** Most intuitive. Every time you publish a batch of metrics, one API call. The problem is cost. PutMetricData charges both on call count and custom metric count, and for Lambda called thousands of times per second, calling this on every invocation adds API cost and latency (if synchronous, you wait for response).

**Second, Embedded Metric Format (EMF).** Here the paradigm shifts. Instead of sending metrics via a separate API, **embed them in special JSON structure inside the logs you're already outputting**. When Lambda or ECS prints JSON to stdout, that goes to CloudWatch Logs, and if CloudWatch sees an `_aws` key, it **automatically extracts metrics while ingesting the log**.

```json
{
  "_aws": {
    "Timestamp": 1716368400000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [["Service"]],
      "Metrics": [{"Name": "OrderCount", "Unit": "Count"}]
    }]
  },
  "Service": "checkout",
  "OrderCount": 5,
  "OrderId": "ord-abc-123"
}
```

Zero additional metric API calls. Your code just logs, metrics come along as a side effect. Plus, high-cardinality identifiers like `OrderId` stay as **log fields** and can be searched in Logs Insights, not metrics. You cleanly separate metrics (low-cardinality aggregation) from logs (high-cardinality detail) in one output — that's the essence of EMF.

**Third, CloudWatch Agent.** Collects system metrics (memory, disk — these are outside the hypervisor so absent from EC2 base metrics) and logs on EC2 and on-premises. Compatible with StatsD/collectd protocols to accept existing instrumentation as-is.

> 💡 **Related Theory**: EMF's "embed metrics in logs" idea is the convergence of structured logging and metrics. Traditionally logs (text, high-cardinality, post-search) and metrics (numeric, low-cardinality, real-time aggregation) were separate pipelines. EMF integrates them into one event. This is the same philosophy as observability's "wide events" or "canonical log lines" (popularized by Stripe) — log one wide event per request with all context, then derive metrics, logs, and traces from it. Honeycomb's high-cardinality event model and OpenTelemetry's unified signals follow the same direction.

> 📚 **Case Study**: A fintech startup was handling thousands of payment transactions per second in a Lambda and calling PutMetricData synchronously with 5 dimensions per transaction. It hit CloudWatch API throttling (account/region TPS limit), some calls failed, and worse, the synchronous call latency added to Lambda execution time, slowing payment responses. Switching to EMF eliminated metric API calls to zero, throttling disappeared, and Lambda just logs (no latency overhead). "Never call PutMetricData synchronously in the hot path" is the anti-pattern EMF solves.

## High-Resolution Metrics — One-Second Resolution: Problem Solved and Price Paid

Standard metrics are 60-second resolution. One data point per minute. Fine for most operations, but for workloads with second-scale traffic spikes, 60-second averages hide the truth. Traffic doubles for 30 seconds then drops; it shows as barely a bump in the 60-second average. High-Resolution Metrics provide **1-second resolution** to catch these fine spikes.

```bash
aws cloudwatch put-metric-data \
  --namespace MyApp/Traffic --metric-name RequestRate \
  --value 4500 --storage-resolution 1
```

`--storage-resolution 1` enables 1-second resolution (default is 60). The cost: 60x more data points means 60x more storage cost, and 1-second data retains for only 3 hours (then automatically rolls up to coarser resolution). Alarms also: standard minimum is 60-second evaluation, but high-resolution metrics allow 10-second or 30-second evaluation for faster response.

> 🔍 **Deeper**: CloudWatch **gradually rolls up metrics to coarser resolution over time**. 1-second data retains 3 hours, 60-second data 15 days, 5-minute data 63 days, 1-hour data 15 months. So yesterday's 1-second spike, viewed today, is just a 1-minute average. This is the standard time series storage technique of **downsampling/rollup** (RRDtool's RRA, Prometheus recording rules + long-term storage, Graphite retention schema). The implication: high-resolution precision analysis must happen within 3 hours of the event. For post-incident forensics needing high-resolution originals, you must preserve separately via Metric Streams.

## Alarm Evaluation Model — Three Dials Encoding Reliability Engineering

Alarms are the most often misconfigured part of CloudWatch. Not the simple model "fire if threshold exceeded," but **how often you report (period), how many reports (evaluation-periods), how many breaches trigger fire (datapoints-to-alarm), and how you treat missing data (treat-missing-data)** — four dials controlling behavior.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name High5xxRate \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc \
  --statistic Sum --period 60 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:...:AlertTopic
```

The evaluation rule is **"M out of N"**. This config says "if 2 out of the last 3 evaluation periods (`evaluation-periods 3`) exceed threshold 10, ALARM." Why so complex? **To filter out single-spike noise**. Set `datapoints-to-alarm` to 1 and every bounce fires it—alarm fatigue. Set to 3 of 3 and "sustained abnormal" is all you catch. For metrics needing fast response, keep N small; for metrics needing noise reduction, increase M/N ratio. This is **sensitivity vs. specificity trade-off dialed in**.

`treat-missing-data` is more subtle. How do you interpret periods with zero data points?

| Value | Meaning | Use Case |
|-------|---------|----------|
| `notBreaching` (default) | No data = normal | Sparse metrics (rare events) |
| `breaching` | No data = breach | "Heartbeat gone = disaster" |
| `missing` | Excluded from evaluation | Withhold judgment |
| `ignore` | Keep current state | Prevent state flapping |

> 💡 **Related Theory**: Alarm "M out of N" + missing data handling is like signal processing's **debouncing/hysteresis**. An electric switch, if it receives noisy bounce signals from contact chatter, will toggle on/off dozens of times, so we apply debounce to accept only states stable for a time. Alarm's `datapoints-to-alarm` is temporal debounce; comparison operator + separate OK threshold is hysteresis. Statistically: balancing false positives (Type I error) and false negatives (Type II error). Too sensitive = noise, too dull = missed anomalies. Good alarm design picks the right point on that spectrum for your SLO.

> ⚠️ **Trap**: For sparse metrics (like payment failures — normally 0 so no data points), set `treat-missing-data: breaching` and the alarm gets stuck in perpetual ALARM. No failures = no data, but missing data = breach in that setting. Conversely, for heartbeat metrics (reports 1 per minute when alive), use `notBreaching` and a dead instance stops heartbeat, but you interpret missing data as normal—missing the outage. **Your metric semantics (is missing data good or bad?) must drive opposite choices.** Getting these two backward is the most common cause of alarm misconfiguration.

## Composite Alarm — Boolean Algebra of Alarms

When alarms multiply, a new problem emerges. One incident ("checkout service down") fires multiple alarms (5xx surge, latency spike, throughput drop) so on-call gets three pages. Composite Alarm **combines child alarms with Boolean logic (AND/OR/NOT)** into one higher alarm.

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name AppDegraded \
  --alarm-rule "ALARM('High5xx') AND (ALARM('HighLatency') OR ALARM('LowThroughput'))" \
  --alarm-actions arn:aws:sns:...:AppOncall
```

Now you only wake someone when "5xx is high AND (latency OR throughput is bad)." Individual alarms stay as signals with no notification; only Composite pages. Alarm noise drops dramatically, and you can define "what is a real incident" as a formula.

> 🔍 **Deeper**: Composite Alarm provides **Boolean algebra over alarm states** to express "symptom correlation." A single metric is just one symptom; real incidents are specific patterns of multiple symptoms. This is part of the path to **symptom-based alerting** maturity — what Google SRE emphasizes: "alert on user-facing symptoms, not root causes." By defining "5xx AND elevated latency = user actually impacted" with Composite, you cut the noise of cause-based alerting that wakes you for every internal component hiccup. AND reduces false positives; OR encompasses multiple failure paths as one incident.

## Anomaly Detection and Metric Math — Learn Thresholds and Derive Metrics

Some metrics can't have static thresholds. Order count is high on weekday afternoons, low at night, different pattern on weekends. Set "order count < 100 alarm" and you get false alarms every night. **Anomaly Detection uses machine learning to learn the time-of-day and day-of-week patterns**, dynamically drawing "normal range for this time/day."

```bash
aws cloudwatch put-anomaly-detector \
  --namespace AWS/ApplicationELB --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc --stat p99
```

Set alarm to "fire if outside learned normal band" with `LessThanLowerOrGreaterThanUpperThreshold`. Humans don't pick thresholds; the model draws the band.

**Metric Math combines multiple metrics with formulas to create derived metrics.** The classic example is ratios.

```
e1: (errors / invocations) * 100   # error rate (%)
```

Raw `Errors` and `Invocations` are absolute counts varying with traffic, but error rate has consistent meaning regardless of traffic volume. You can't create an "error rate > 1%" alarm without Metric Math.

> 💡 **Related Theory**: CloudWatch Anomaly Detection uses **seasonal decomposition** models internally. It splits a time series into trend + seasonal (daily/weekly cycles) + residual, like classical STL decomposition or Holt-Winters exponential smoothing. The model learns "expected value and normal variance for this time/day," draws a band around it, and marks observations outside the band as anomalies. It's like statistical process control (SPC) control charts where ±3σ management limits mark anomalies, except σ isn't fixed—it's learned per time-of-day. Seasonality-bearing business metrics that you can't threshold manually are exactly where this tool applies.

## Exporting Metrics — Metric Streams and Cross-Account

Two paths export metrics out of CloudWatch. **Metric Streams** sends metrics nearly real-time via Kinesis Data Firehose to S3, Datadog, Splunk, New Relic, etc. Lower latency than the polling `GetMetricData` approach, no missed data points, and no API throttling at scale. It's the standard path for integrating AWS metrics into multi-cloud observability tools.

**Cross-Account Observability** (2023+) aggregates metrics, logs, and traces from multiple accounts into one monitoring account. When source accounts trust the sink ARN, the monitoring account sees that data one-way (source can't see monitoring account data). For multi-account organizations, central SRE teams see everything on one screen.

> 🎯 **Scenario**: "Our org standardizes on Datadog. We want to integrate AWS metrics into Datadog but our current polling approach (Datadog calls GetMetricData/ListMetrics periodically) hits CloudWatch API throttling on hundreds of thousands of metrics." The answer is Metric Streams. Existing integrations usually have Datadog polling GetMetricData/ListMetrics periodically, and at high metric counts API throttling and latency pile up. Metric Streams has CloudWatch push to Firehose, so polling vanishes, latency drops from minutes to seconds, and API limits are fundamentally gone. The shift from "polling → push streaming" is the key.

## Summary

Today we covered five points. First, **metric identity is the full namespace+name+dimensions combination**, and dimension cardinality equals metric count equals cost. Second, **among three publishing paths (PutMetricData·EMF·Agent), EMF is structurally superior for Lambda/ECS** — zero metric API calls, log/metric integration, simultaneous multi-dimension publication. Third, **alarms are not just thresholds but "M out of N" + missing data handling**, a debouncing model where you must choose opposite missing-data handling based on metric semantics. Fourth, **Composite Alarm is Boolean algebra of alarms**, expressing symptom correlation to reduce noise. Fifth, **Anomaly Detection learns thresholds via seasonal decomposition**, Metric Math creates derived metrics like ratios, and Metric Streams converts polling to push for external integration.

Next we deep-dive CloudWatch Logs: how logs organize into groups and streams, how Subscription Filters stream logs real-time elsewhere, what drives the Logs Insights query engine and why logs are so expensive, and how to control log costs — inside the log pipeline.

---

## 📝 연습 문제

**문제 1.** Lambda가 초당 수천 번 호출되는 핫 패스에서 사용자 정의 메트릭을 게시한다. PutMetricData를 매 호출마다 동기로 부르자 API throttling과 응답 지연이 발생했다. 가장 적절한 개선은?

A) 메트릭 차원 수를 줄인다
B) EMF로 전환 — 로그에 메트릭을 임베드해 메트릭 API 호출을 0으로 만든다
C) High-Resolution Metric으로 전환한다
D) PutMetricData 호출을 비동기 스레드로 옮긴다

**정답: B**

해설: PutMetricData를 핫 패스에서 동기 호출하면 API throttling(계정·리전 TPS 한도)과 호출 지연이 누적된다. EMF는 메트릭을 별도 API로 보내지 않고 이미 출력하는 로그 JSON에 `_aws` 구조로 끼워 넣어 CloudWatch가 적재 시 자동 추출하므로, 메트릭 API 호출이 0이 되어 throttling과 지연이 동시에 사라진다. 차원 축소(A)는 부분 완화일 뿐 근본 해결이 아니고, High-Resolution(C)은 비용을 오히려 늘리며, 비동기 스레드(D)는 throttling 자체를 없애지 못한다.

---

**문제 2.** 같은 데이터를 `{Service, Environment}`로도, `{Environment}`만으로도, 전체 합산으로도 보고 싶다. PutMetricData로는 번거롭다. 가장 효율적인 방법은?

A) 세 번 PutMetricData 호출
B) EMF의 `Dimensions: [["Service","Environment"], ["Environment"], []]`로 한 번에 다중 차원 조합 게시
C) Metric Math로 사후 집계
D) Anomaly Detection 활성화

**정답: B**

해설: CloudWatch는 publish 시점에 정한 차원 조합으로만 집계를 제공하므로, 여러 집계 관점이 필요하면 그 조합들을 모두 게시해야 한다. EMF는 `Dimensions`를 배열의 배열로 받아 한 번의 로그 출력으로 여러 차원 조합(둘 다 / Environment만 / 전체 합산 `[]`)을 동시에 게시한다. PutMetricData(A)는 조합마다 별도 호출이 필요해 비효율적이고, Metric Math(C)는 이미 publish된 시계열을 결합할 뿐 없는 집계 차원을 사후 생성하지 못한다.

---

**문제 3.** ALB 5xx 알람이 단발성 스파이크에도 울려 온콜 피로가 심하다. 지속적 이상만 잡되 일시적 튐은 무시하려면?

A) `datapoints-to-alarm`을 1로, `evaluation-periods`를 1로
B) `evaluation-periods 3`, `datapoints-to-alarm 2`로 "3 중 2" 평가
C) period를 1초로 줄인다
D) threshold를 0으로 낮춘다

**정답: B**

해설: "M out of N"(여기서 3 중 2)은 시간축 디바운싱이다. 최근 3개 평가 기간 중 2개가 위반이어야 ALARM이 되므로 단발성 스파이크는 걸러지고 지속적 이상만 잡힌다. A는 한 번만 튀어도 울려 노이즈가 최대가 되고, period 단축(C)은 오히려 더 민감해지며, threshold 0(D)은 상시 ALARM을 만든다.

---

**문제 4.** 결제 실패 메트릭은 평소 0이라 데이터포인트 자체가 없다(sparse). 실패가 임계 이상일 때만 울리려면 `treat-missing-data`를?

A) `breaching`
B) `notBreaching` — 데이터 없음을 정상으로 간주
C) `missing`만으로 충분
D) high-resolution으로 전환

**정답: B**

해설: sparse 메트릭은 평소 데이터가 없는 것이 정상 상태다. `notBreaching`으로 두어야 데이터 없음을 정상으로 보고, 실제 실패가 임계를 넘을 때만 ALARM이 된다. `breaching`(A)을 걸면 실패가 없어 데이터가 없는데도 영구 ALARM에 갇힌다. 반대로 하트비트처럼 "데이터 없음 = 장애"인 지표에는 `breaching`을 써야 하므로, 지표 의미에 따라 missing 처리를 정반대로 골라야 한다.

---

**문제 5.** 하나의 인시던트("체크아웃 장애")가 5xx·지연·처리량 세 알람을 동시에 울려 온콜이 세 통의 페이지를 받는다. 노이즈를 줄이면서 "진짜 인시던트"를 정의하려면?

A) 세 알람을 모두 삭제하고 5xx만 남긴다
B) Composite Alarm으로 `ALARM('High5xx') AND (ALARM('HighLatency') OR ALARM('LowThroughput'))`을 정의하고 통보는 Composite에만 건다
C) 세 알람의 threshold를 모두 높인다
D) SNS 구독을 줄인다

**정답: B**

해설: Composite Alarm은 자식 알람을 부울 식으로 결합해 "증상의 특정 조합 = 인시던트"를 정의한다. 개별 알람은 통보 없이 신호로 두고 Composite만 페이지를 보내면, 한 인시던트당 한 번만 깨우면서도 "5xx면서 (지연 또는 처리량 이상)"이라는 정밀한 조건으로 거짓 양성을 줄인다. 알람 삭제(A)는 가시성을 잃고, threshold 상향(C)은 실제 이상도 놓치며, 구독 축소(D)는 근본 문제를 안 푼다.

---

**문제 6.** 주문 수가 평일 낮엔 높고 새벽엔 낮으며 주말 패턴이 또 다르다. 정적 임계값으로는 새벽마다 거짓 알람이 난다. 가장 적절한 도구는?

A) High-Resolution Metric
B) Anomaly Detection — 시간대·요일별 정상 밴드를 학습해 이탈만 탐지
C) Composite Alarm
D) Metric Filter

**정답: B**

해설: 계절성(일·주 주기)이 있는 지표는 단일 정적 임계값으로 다룰 수 없다. Anomaly Detection은 시계열을 추세·계절·잔차로 분해해 "이 시각·이 요일의 정상 범위"를 동적으로 학습하고, 관측값이 그 밴드를 벗어날 때만 알람한다. High-Resolution(A)은 해상도 문제일 뿐 계절성을 다루지 못하고, Composite(C)는 알람 결합, Metric Filter(D)는 로그에서 메트릭을 추출하는 별개 기능이다.

---

**문제 7.** 절대 수치인 `Errors`와 `Invocations`로는 "에러율 1% 초과" 알람을 만들 수 없다. 트래픽과 무관한 비율 알람을 만들려면?

A) Errors에만 threshold를 건다
B) Metric Math로 `(errors / invocations) * 100`을 계산하고 그 결과에 알람을 건다
C) Anomaly Detection
D) Composite Alarm

**정답: B**

해설: Metric Math는 여러 메트릭을 수식으로 결합해 파생 지표를 만든다. 에러율 = (errors / invocations) × 100은 트래픽 규모와 무관하게 의미가 일정하므로, 이 수식 결과에 알람을 걸면 트래픽이 늘어도 비율 기준이 유지된다. Errors 절대값(A)에 거는 임계는 트래픽이 늘면 같이 늘어 의미가 흔들리고, Anomaly Detection(C)·Composite(D)는 비율 계산 자체를 제공하지 않는다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 메트릭의 정체성은 namespace+name+dimensions 전체 조합이며 차원 카디널리티가 곧 메트릭 수이자 비용이다(Prometheus/InfluxDB의 시리즈 개념과 동일). 둘째, 게시 경로 중 Lambda/ECS에서는 EMF가 구조적으로 우월하다 — 메트릭 API 호출 0, 로그/메트릭 통합, 다중 차원 조합 동시 게시, 고카디널리티 식별자는 로그 필드로 분리. 셋째, 알람은 "M out of N" + treat-missing-data라는 디바운싱 모델이고, sparse 지표는 notBreaching, 하트비트는 breaching처럼 지표 의미에 따라 missing 처리를 정반대로 골라야 한다. 넷째, Composite Alarm은 알람의 부울 대수로 증상 상관(symptom-based)을 표현해 노이즈를 줄인다. 다섯째, Anomaly Detection은 계절성 분해로 임계값을 학습하고, Metric Math는 비율 같은 파생 지표를, Metric Streams는 폴링→푸시 전환으로 외부 통합을 해결한다.
