# Day 4 - CloudWatch Advanced: Containers, Synthetic Monitoring, and ML Anomaly Detection

Basic metrics and alarms tell you problems *after* they happen. When CPU hits 90%, the alarm rings, but users have already experienced slowness. Monitoring's next evolution splits two directions. One goes **deeper** — from VM-level to per-container, to application SLO. The other goes **ahead** — detecting with synthetic traffic *before* users hit it, and using ML's learned baseline instead of static thresholds to catch subtle anomalies. CloudWatch's advanced features — Container Insights, Synthetics, Anomaly Detection, Dashboards — stand exactly on these "deeper, ahead" axes.

In DVA-C02, this domain answers "when basic CloudWatch isn't enough" scenarios: container monitoring, endpoint availability proactively, ML-based auto-thresholds, multi-account unified views. Why container monitoring differs from EC2, synthetic monitoring's philosophy shift, what Anomaly Detection statistically does — these are frequent topics. This article examines why containers need separate monitoring, how synthetic monitoring reverses passive observation, and why Anomaly Detection learns seasonality instead of fixed thresholds.

## Why Containers Need Separate Monitoring: Added Abstraction Layer

Monitoring one EC2 is straightforward — one instance, one set of metrics. ECS/EKS differs: multiple containers run on one EC2 (or Fargate capacity), grouped into tasks, tasks into services, services into clusters. Just "CPU is high" isn't enough — *whose* CPU? Are other containers on the same host fine? Ignoring this layering and watching only host-level metrics misses "host average 30% but one container hitting 100% repeatedly dying."

**Container Insights** collects and aggregates per the container hierarchy: cluster → service → task → container levels show CPU, memory, network, disk; plus orchestration metrics like desired vs. running task counts.

```bash
aws ecs update-cluster-settings \
    --cluster my-cluster \
    --settings name=containerInsights,value=enabled
```

> 💡 **Related theory**: Container monitoring is hard fundamentally because containers are **ephemeral and dynamic**. EC2 lives days to months; containers live minutes. Day 1's "polling model doesn't fit cloud" problem magnifies with containers — monitoring targets constantly change. Kubernetes ecosystem evolved label-based identification (not by container name but "all payment service containers" via labels) combined with service discovery. Container Insights adapts to this by aggregating not by individual container ID but by service/task definition level, so "container replacement, trend continuity."

> 🔍 **Going deeper**: Container Insights vs. Managed Prometheus (AMP) choice extends Day 1's push vs. pull divide. Container Insights is CloudWatch Agent (or Fargate's AWS-managed collector) *pushing* metrics to CloudWatch, integrated view. AMP is Kubernetes-standard Prometheus *scraping* container `/metrics` endpoints, visualized via Grafana (AMG) — CNCF ecosystem standard path. "Simple in AWS" → Container Insights; "existing Prometheus/Grafana or Kubernetes standard adoption" → AMP — the decision hinges on push vs. pull.

## Synthetic Monitoring: Proactively Knocking Before Users Do

Traditional monitoring is **passive** — data arrives only when real traffic flows. At 3 AM with no traffic, if endpoints are down, nobody knows. First user hits the error at morning login. **CloudWatch Synthetics** reverses this — synthetic users (canaries) periodically probe endpoints *proactively*, confirming availability before real users discover failures.

```javascript
const synthetics = require('Synthetics');
const apiCanaryBlueprint = async function () {
    const response = await synthetics.executeHttpStep('Health Check', {
        hostname: 'api.myapp.com', method: 'GET',
        path: '/health', port: 443, protocol: 'https:'
    });
    if (response.statusCode !== 200) {
        throw new Error(`Health check failed: ${response.statusCode}`);
    }
};
exports.handler = async () => await apiCanaryBlueprint();
```

> 💡 **Related theory**: "Canary" naming comes from coal miners' canaries. Miners brought canaries into mines (sensitive to toxic gas); if the bird collapsed, they evacuated before they collapsed — *early warning*, sensing danger before humans. Synthetic monitoring's canaries act likewise. Synthetic users encounter failure *before* real users, triggering alarms. This is black-box monitoring (verifying external behavior, not internals) — complementary to white-box (internal metrics). Internal metrics answer "why broke?"; synthetic answers "broke from user perspective?"

> ⚠️ **Trap**: Synthetics vs. Route 53 Health Check confusion. R53 Health Check is simple ping/HTTP status (endpoint alive?), mainly for DNS failover. Synthetics runs *scripts* on Lambda (Node.js/Python), validating multi-step user flows (login → search → purchase) and screenshots (broken links, layout corruption). "Simple availability ping" → R53; "user transaction, multi-step flow validation" → Synthetics. Synthetics canary itself runs on Lambda.

> 📚 **Case study**: Synthetics blueprints mirror real scenarios — Heartbeat (single URL availability), API canary (REST response check), Broken link checker (dead links in pages), Visual monitoring (screenshot pixel difference for layout breaks), Canary Recorder (record browser actions, generate code). Visual monitoring especially handles "API returns 200 but CSS broke, screen is garbage" — technically working but user-broken. This exemplifies synthetic's purpose: "technically operational ≠ user-normal."

## Anomaly Detection: Beyond Static Thresholds into Statistical Normality

"Alert if CPU > 80%" is simple but flawed. First, traffic varies by hour/day/week — 70% afternoon is normal, 30% at 3 AM is abnormal. Second, "80% not exceeded but anomalously high" goes undetected. **CloudWatch Anomaly Detection** learns metric patterns via ML, creates not fixed lines but "expected range bands," alarming when breached.

```bash
aws cloudwatch put-anomaly-detector \
    --namespace AWS/Lambda --metric-name Duration \
    --dimensions Name=FunctionName,Value=my-function --stat Average
```

> 🔍 **Going deeper**: Anomaly Detection learns **seasonality** and **trend**. Time-series decompose into trend (long-term up/down), seasonality (daily/weekly repeats), residual (noise). Anomaly Detection studies past data to find daily/weekly patterns, creates "if this hour/weekday, values should be ~this range." So 3 AM low traffic and noon high traffic are each normal; same 50% reads differently by time. This is classic time-series forecasting (Holt-Winters, SARIMA family). But patterns must be consistent; random-spiking metrics develop wide bands, reducing usefulness.

## Combining Metrics and Flowing Outward: Metric Math and Metric Stream

Raw metrics sometimes need composition. "What's success rate?" isn't single metric but `successes / total × 100`. **Metric Math** combines metrics into formulas, creating derived metrics.

```
m1 = SuccessCount
m2 = TotalRequests
expression: m1 / m2 * 100   # Success rate (%)
```

Conversely, metrics pooled in CloudWatch sometimes must flow *outward*. **Metric Stream** streams metrics near-real-time via Kinesis Data Firehose to S3, Datadog, Splunk, other external tools.

> 💡 **Related theory**: Metric Math matters for alarms because **ratio-based alarms are more robust than absolute**. "Errors > 100" as absolute threshold breaks when traffic 10x — normal state exceeds it. "Error rate > 1%" stays meaningful regardless of scale. SRE defines SLOs in ratios (99.9% availability, 0.1% error rate), implements via Metric Math, gates with alarms. "Normalized metrics more stable than absolutes" is universal monitoring principle.

> 📚 **Case study**: Metric Stream solved "use our org's standard monitoring tool (Datadog)." Previously, pulling CloudWatch metrics required periodic `GetMetricData` polling — latency, cost, API limits issues. Metric Stream push-feeds as data arrives, near-real-time to external tools. Logs similarly flow via Subscription Filter (Day 1) — two separate pipelines (metrics vs. logs).

## Dashboards and Integration: Scattered Signals on One Screen

Final axis: integration. **CloudWatch Dashboards** assemble multiple services, metrics, alarm statuses into one screen via widgets. Further, **cross-account, cross-region dashboards** merge metrics from multiple AWS accounts and regions — essential when organizations split accounts by environment (prod/staging) or team.

> 🔍 **Going deeper**: Unified signal summation peaks at **CloudWatch ServiceLens** (X-Ray traces + metrics + logs on service map) and **Application Signals** (2024, application SLO and golden signals monitoring). "Golden Signals" are four key metrics Google SRE defined — latency, traffic, errors, saturation. Monitor these four and you understand most service health. Application Signals auto-collects these via OpenTelemetry, unifying "scattered metrics/traces/logs" under SLO focus. Monitoring evolution direction: "individual metrics listed" → "service-level objectives centered."

## Wrapping Up

CloudWatch advanced divides "deeper, ahead." Container Insights layers to match dynamic, short-lived container hierarchy; Synthetics proactively detects via synthetic canaries before user experience breaks. Anomaly Detection transcends static thresholds using ML-learned seasonality, making time-varying metrics interpretable. Metric Math enables ratio-based alarms (more stable than absolutes). Metric Stream flows metrics outward, Dashboards and ServiceLens unify scattered signals around SLO — all targeting one goal: "know earlier, more accurately, before users feel pain."

Next we synthesize Week 10's four services — CloudWatch, X-Ray, CloudTrail, EventBridge — against comprehensive scenarios.

---

## 📝 연습 문제

**문제 1.** ECS cluster: "host average CPU 30% but one container hits 100%, restarts repeatedly." To detect this, appropriate choice:

A) EC2 basic metrics alone sufficient

B) Container Insights enables cluster/service/task/container-level metrics

C) Enable CloudTrail

D) Add X-Ray Annotation

**정답: B**

해설: Host average metrics hide specific container spikes. **Container Insights** aggregates cluster → service → task → container levels, showing which container peaks and task restart metrics, pinpointing the problem. Containers are dynamic/short-lived; host-only monitoring is insufficient.

---

**문제 2.** Payment API endpoint down at 3 AM (no traffic) — nobody aware until morning user gets error. Proactively confirm availability without real users:

A) CloudWatch basic metric alarm

B) CloudWatch Synthetics canary periodic synthetic requests

C) CloudTrail Data Events

D) Container Insights

**정답: B**

해설: Traditional monitoring is passive (traffic triggers data). **Synthetics** canary (synthetic user) periodically probes, confirming availability proactively (coal miner's canary — senses danger before human). Lambda-based, scripts multi-step flows, screenshots for layout breaks. A) Basic metrics rely on traffic existing.

---

**문제 3.** Traffic fluctuates hour/day/week. Single static CPU threshold fails: oversensitive early morning, under-sensitive afternoons. Without manually swapping thresholds, alert only to "this hour's normal range" deviation:

A) Multiple static thresholds

B) CloudWatch Anomaly Detection (ML forecast bands)

C) Metric Filter

D) Composite Alarm

**정답: B**

해설: **Anomaly Detection** learns seasonality (daily/weekly patterns), creates "if this hour/weekday, expected range," alarming on band breach. Statistically captures calendar-based normal variance. Static thresholds can't adapt; multiple thresholds are manual burden. Short-pattern metrics handle best; chaotic metrics develop wide bands.

---

**문제 4.** Implement "alert if success rate < 99%," have SuccessCount and TotalRequests metrics. Appropriate method:

A) Alarm on each separately

B) Metric Math: `SuccessCount / TotalRequests * 100`, alarm on result

C) Anomaly Detection

D) Logs Insights query

**정答: B**

해説: Success rate needs ratio calculation. **Metric Math** combines into derived metric, alarm on ratio. Ratio alarms are stable — "100 errors" breaks at traffic scale, but "1% error rate" stays meaningful. SRE defines SLOs in ratios (99.9% uptime), implements via Metric Math.

---

**문제 5.** Org runs prod/staging/dev in separate AWS accounts. View core metrics from all three in one dashboard:

A) Check each account separately, manual combine

B) CloudWatch cross-account dashboard

C) Impossible, per-account isolation

D) Export all to S3, combine manually

**정答: B**

해説: CloudWatch supports **cross-account, cross-region dashboards**, merging metrics from multiple accounts/regions into unified view. Essential for distributed org setups. A·D manual, C false.

---

**문제 6.** Stream CloudWatch metrics to company standard tool (Datadog) near-real-time:

A) Periodic `GetMetricData` polling

B) Metric Stream via Kinesis Data Firehose push

C) Logs Subscription Filter

D) CloudTrail

**정답: B**

해설: **Metric Stream** push-feeds metrics via Firehose to external tools (real-time). Old `GetMetricData` polling (A) has latency/cost/rate-limit issues. C) Subscription Filter for *logs*, not metrics — separate pipelines.

---

**问题 7.** EKS team has existing Prometheus/Grafana ops and assets. Container monitoring standard choice, vs. Container Insights:

A) Container Insights always best

B) Amazon Managed Prometheus (AMP) + Grafana (AMG) — follows Kubernetes standard (scrape/pull), reuses assets

C) X-Ray alternative

D) CloudTrail monitors containers

**정答: B**

해説: Container Insights is AWS-native (CloudWatch push/integrated). **AMP+AMG** follows CNCF standard (Prometheus scrapes, Grafana displays), compatible with existing Prometheus/Grafana experience. "Simple in AWS" → Container Insights; "Kubernetes standard, existing assets" → AMP — push vs. pull choice.
