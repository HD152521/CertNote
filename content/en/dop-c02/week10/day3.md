# Day 3 - Container Insights·Lambda Insights·EMF: Workload-Specific Observability Deep Dive

Observability comes from control theory. Rudolf Kálmán (1960) defined it: "How much can you infer about system internal state just from outputs?" In software—how much can you know about what's happening inside using only logs, metrics, and traces? But different workloads have different internal states. Containers face resource contention at cluster·node·pod layers. Lambda hits cold starts and memory limits. Business logic lives in order counts and failure rates. One instrumentation can't cover all.

Today we deep-dive workload-specific observability. What does Container Insights collect and how in ECS/EKS? Why does Lambda Insights work via separate Extension/Layer? How do EMF multi-dimension combinations make multiple metrics internally? What does Powertools standardize? And shadowing all observability decisions: cardinality and cost. In DOP-C02, this domain appears as "per-pod EKS metrics," "cold start analysis," "Lambda metric cost reduction," "cardinality-driven cost explosion."

## Three Pillars and Workload Variation

Observability is often called **three pillars—Logs, Metrics, Traces**. Logs: detailed event records (high-cardinality, post-search). Metrics: numeric time series aggregates (low-cardinality, real-time alarming). Traces: request flow through services (causal linking). Three angles on one system.

By workload, these three pillars' center of gravity shifts. **Containers** emphasize metrics (cluster/node/pod CPU·memory contention). **Lambda** emphasizes metrics (cold start, init duration, memory) and traces (short functions chain). **Business logic** emphasizes domain metrics (orders, payments) and logs (per-order details). Container Insights, Lambda Insights, EMF each target this center of gravity.

> 💡 **Related Theory**: "Three pillars" is observability's starting point but has limits. Honeycomb's Charity Majors argues "three pillars create silos splitting storage," proposing instead **high-cardinality, high-dimension wide structured events** from which all three signals derive. EMF gains depth here—one log event holds metrics (`_aws` block) and detail fields (logs), reducing silos. OpenTelemetry unifying logs·metrics·traces into one SDK same direction. "Three pillars or one wide event" is core modern observability design tension.

## Container Insights — Watching Resource Contention

Container workload's core questions: "which pods starve cluster node resources," "does Task OOM die," "does service deploy enough copies." Container Insights auto-collects ECS/EKS cluster·service·Task·pod-level metrics.

```bash
# ECS — enable in cluster settings
aws ecs update-cluster-settings \
  --cluster prod --settings name=containerInsights,value=enabled
```

EKS typically deploys **ADOT (AWS Distro for OpenTelemetry) Collector** or CloudWatch Agent as DaemonSet (one per node gathering that node's pod metrics). Collected:

- **ECS**: ServiceCount, TaskCount, CPUUtilization, MemoryUtilization, NetworkRxBytes
- **EKS**: cluster_failed_node_count, pod_cpu_utilization, pod_memory_utilization, namespace aggregates

Activation location is an exam point. ECS: enable in **cluster settings** (not Task Definition or Service). EKS: **deploy collection agent to cluster** as DaemonSet.

> 🔍 **Deeper**: Enabling Container Insights on EKS actually means **deploying collection agent as DaemonSet to every node**. Why DaemonSet? Pod metrics must be read from that pod's node kubelet/cAdvisor, so collectors on every node ensure nothing misses. cAdvisor (Google's container analyzer) measures node containers' CPU, memory, network, filesystem; kubelet exposes this; agents (ADOT/CloudWatch Agent/Fluent Bit) collect and push to CloudWatch. Exact lineage with Prometheus node-exporter + kube-state-metrics + cAdvisor. "Collector per node" DaemonSet pattern is universal cluster observability structure.

> 📚 **Case Study**: A team enabled Container Insights on small EKS cluster (3 nodes), then CloudWatch costs approached compute costs. Reason: Container Insights auto-generates cluster·node·pod·container-level metrics and performance logs; as pods frequently start/stop (batch jobs), metric dimensions keep growing. Small cluster observability data can cost more than workload. Lesson: Container Insights is powerful but not free—gauge cost first on cluster size/pod lifecycle patterns, narrow scope to enhanced observability only on critical namespaces if needed.

## Lambda Insights — Cold Start and Memory Truth

Lambda base metrics (Invocations, Errors, Duration, Throttles) show "how often called and how often failed" but not "why slow." How often cold starts happen, how much memory used, how long init takes—these internals **Lambda Insights** reveals.

```
# Add Lambda Insights Extension Layer
arn:aws:lambda:<region>:580247275435:layer:LambdaInsightsExtension:<N>
# + IAM: CloudWatchLambdaInsightsExecutionRolePolicy
```

Lambda Insights operates as a **Lambda Extension** (separate layer). Sidecar in same execution environment measures CPU·memory·network·disk and init duration (cold start time), sends to `/aws/lambda-insights` log group, auto-draws multi-function dashboard in CloudWatch console.

Cold start analysis is core value. **init duration** metric quantifies how much cold starts contribute to response delay and validates Provisioned Concurrency effect. "Raising memory got faster"—metric confirms if it's real (memory ∝ CPU so it could be).

> 🔍 **Deeper**: Why does Lambda Insights **operate as Extension**? Lambda execution model. After invocation ends, function is frozen (no code runs)—gathering metrics in background and periodic-sending from function code itself is impossible. Extension is separate process independent of function handler, gets init/invoke/shutdown lifecycle hooks even when function is frozen, thus measuring cold start init. Sidecar pattern for serverless—like Kubernetes sidecars beside app containers, Lambda attaches Extension beside function. ADOT, Datadog, New Relic Lambda integrations all sit on this Extension mechanism.

## EMF — Multi-Dimension Combination Internals

We've seen EMF before, but today we dig the most sophisticated part—**multiple dimension sets**. This is EMF's decisive advantage over PutMetricData.

```json
{
  "_aws": {
    "Timestamp": 1716368400000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [
        ["Service", "Environment"],
        ["Service"],
        []
      ],
      "Metrics": [
        {"Name": "OrderCount", "Unit": "Count"},
        {"Name": "OrderValue", "Unit": "None"}
      ]
    }]
  },
  "Service": "checkout",
  "Environment": "prod",
  "OrderCount": 1,
  "OrderValue": 42.5,
  "OrderId": "ord-abc-123"
}
```

`Dimensions` is array-of-arrays. **One log emit creates three separate metrics** for OrderCount:

- `[Service, Environment]` → split by `{checkout, prod}`
- `[Service]` → aggregated by checkout (environment-blind)
- `[]` → global sum across all services

Yesterday's principle—"CloudWatch offers aggregation only for publish-time dimension combos"—shines here. If you know later you want "ignore environment, show by service only," publish that combo at publish-time with `[Service]`. EMF can pack all combos in one emit; PutMetricData requires separate calls per combo.

And `OrderId` is nowhere in `Metrics` or `Dimensions`—just top-level payload. So **becomes log field only, not metric**, searchable in Logs Insights. This separation of high-cardinality identifier from metric is EMF design core.

> 💡 **Related Theory**: EMF's multi-dimension combo is like OLAP data cubes' **pre-aggregation/roll-up**. When building OLAP cubes, pre-computing all dimension combinations (`{Service,Environment}`, `{Service}`, `{Environment}`, `{}`) answers any query fast. Called "cube cells," and pre-computing all is full materialization. CloudWatch can't post-aggregate (streaming time series limit), so EMF pre-materializes needed aggregation views at publish. Trade-off clear: more combos = more flexible queries but higher metric count (=cost). "Which aggregation views actually matter" is EMF design's core decision.

## Powertools — Observability Standardization Layer

Writing EMF, structured logs, X-Ray directly creates boilerplate and team-by-team format drift. **Powertools for AWS Lambda** standardizes all three with one decorator each.

```python
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger(service="checkout")
tracer = Tracer()
metrics = Metrics(namespace="MyApp", service="checkout")

@logger.inject_lambda_context(correlation_id_path="requestContext.requestId")
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event, context):
    metrics.add_metric(name="OrderCount", unit=MetricUnit.Count, value=1)
    metrics.add_dimension(name="Region", value="ap-northeast-2")
    logger.info("Order received", extra={"order_id": event["order_id"]})
    ...
```

Three decorators auto-produce: **structured JSON logs + correlation ID** (request traceable across logs·metrics·traces), **X-Ray segments and metadata**, **EMF metrics + cold start metric** (`capture_cold_start_metric=True`). Teams needn't worry about format; shared observability standard.

> 🔍 **Deeper**: **correlation ID** Powertools enforces is distributed tracing foundation. One request spanning API Gateway → Lambda → SQS → different Lambda → DynamoDB needs a shared ID in all signals to bind them. This is W3C Trace Context standard (`traceparent` header) trace ID/span ID and Google Dapper paper (2010) popularized distributed tracing core. Logs without correlation ID in distributed systems can't answer "which request" so debugging is effectively impossible. Powertools auto-injecting via decorator enforces "observability-capable system minimum requirement" in code.

## Cardinality — Shadow of Every Observability Decision

Word repeated throughout: cardinality. Core variable in observability cost and frequent source of incidents.

```json
"Dimensions": [["UserId"]]   // ⚠️ generates metrics for each user count
```

`UserId` as dimension: 1 million users = 1 million time series. CloudWatch charges per unique dimension combo metric, cost explodes. Worse: high-cardinality metrics are useless in dashboards/alarms—1 million individual series shows no trend.

Principle: **low-cardinality in dimensions only, high-cardinality in log fields**:

- Dimensions (metrics): Region, Service, Environment, StatusCode—limited value cardinality
- Log fields (searchable): UserId, OrderId, RequestId, SessionId—nearly infinite variety

Need per-UserId analysis? That's Logs Insights filter `user_id = "..."`, not metrics.

> ⚠️ **Trap**: Most subtle cardinality bomb: **putting error messages or URL paths as dimensions**. If dimension holds `/orders/{order_id}` with ID embedded, every order gets different path = infinite cardinality. Same if error messages contain timestamps/IDs—each message becomes unique dimension. Fix: **normalize before using as dimension**—convert `/orders/{id}` (placeholder substituting variables) to finite cardinality. Prometheus operates rule #1: "don't put IDs·emails·raw URLs in labels." Always ask: "do unique values in this dimension grow unbounded over time?"

## Cost vs Visibility — Observability's Root Trade-Off

Observability isn't free. More visibility costs more. Conscious trade-off management is operational maturity.

| Data | Cost Impact | Value | Recommendation |
|------|------------|-------|-----------------|
| EMF metrics on all requests | Metric count ↑ (by dimensions) | Instant alarms | Low-cardinality dimensions only |
| X-Ray tracing all requests | Trace count ↑ | Strong debugging | Apply sampling |
| X-Ray sampling 5% | Savings | Statistically sufficient | High-traffic standard |
| 5-minute business metrics | Low | Trend tracking | Always |

Core patterns: **sampling and aggregation**. Don't collect all traces—5% sampling still reveals statistical patterns; error-only 100% sampling catches debug needs. Tests show: sample normal traffic, collect errors fully = keep stat signal and debug coverage.

> 🎯 **Scenario**: "Traffic 10x'd, X-Ray and custom metric costs exploded. Keep debug capacity, control costs." Answer: stratified sampling + cardinality audit. (1) X-Ray: fixed-ratio sample (e.g., 5%) + error/high-latency requests high-ratio separately—normal traffic statistically sufficient, problems never miss. (2) Custom metric dimensions: audit for UserId/OrderId/raw URL high-cardinality, demote to log fields. (3) Revisit if per-second high-resolution metrics truly needed, drop to standard 60s. Key shift: "sample all" → "sample normal + capture exceptions" all.

## Summary

Today's five takeaways. First, **observability's three pillars shift center-of-gravity per workload** and EMF/OpenTelemetry converge on wide events. Second, **Container Insights uses DaemonSet collectors collecting cluster/node/pod resources**; ECS enables in cluster settings, EKS deploys agent; small clusters' observability can exceed workload cost. Third, **Lambda Insights uses Extension (sidecar) pattern** measuring cold start init even when function is frozen. Fourth, **EMF multi-dimension combo pre-aggregates like OLAP**, materializing needed views at publish, high-cardinality separated as log fields. Fifth, **cardinality is cost's core variable**—keep dimensions low-cardinality, normalize ID/URL paths, send high-cardinality as logs, balance Cost vs Visibility via sampling+aggregation.

Next: User experience measurement—Synthetics (external probe), RUM (real user), Evidently (A/B). Observability shifts from "is system healthy" to "do users actually experience quality."

---

## 📝 Practice Questions

**Question 1.** How can you publish custom metrics from a Lambda function MOST efficiently while also viewing the same data from multiple aggregation perspectives?

A) Call PutMetricData for each dimension combination
B) EMF — embed metrics in logs and publish multiple dimension combinations at once with a `Dimensions` array of arrays
C) Enable Container Insights
D) Add the Lambda Insights Layer

**Answer: B**

Explanation: EMF embeds metrics in log JSON without metric API calls, and accepts `Dimensions` as an array of arrays so that a single output publishes multiple dimension combinations (for example, `[Service,Environment]`, `[Service]`, `[]`) simultaneously. CloudWatch aggregates only by the dimension combinations specified at publish time, so these multiple combinations make it possible to view the data from various perspectives after the fact. PutMetricData (A) requires a call per combination, which is inefficient, and Container/Lambda Insights (C/D) are resource-metric collection tools, not a means of publishing custom metrics.

---

**Question 2.** How can you automatically collect per-pod CPU and memory metrics in an EKS cluster?

A) Configure it in the Task Definition
B) Enable the ECS cluster setting
C) Deploy ADOT/CloudWatch Agent as a DaemonSet on every node for Container Insights
D) Lambda Insights Layer

**Answer: C**

Explanation: In EKS, pod metrics must be read from the node on which the pod is running, so the collection agent (ADOT Collector or CloudWatch Agent) is deployed as a DaemonSet, one per node on all nodes. The agent scrapes the container resource data exposed by cAdvisor/kubelet and sends it to CloudWatch. The Task Definition (A) and the ECS cluster setting (B) are for ECS, and Lambda Insights (D) is Lambda-only.

---

**Question 3.** How can you verify how much Lambda cold starts contribute to response latency and the effect of Provisioned Concurrency?

A) Container Insights
B) Lambda Insights — quantify cold starts with the init duration metric
C) Synthetics
D) CloudTrail

**Answer: B**

Explanation: Lambda Insights runs as an Extension and measures the init and invoke lifecycle even while the function is frozen, quantifying cold-start time with the init duration metric. This verifies the cold start's contribution to latency and the effect of applying Provisioned Concurrency. Container Insights (A) is for containers, Synthetics (C) is an external probe, and CloudTrail (D) is an API audit log, so none of them measure cold starts internally.

---

**Question 4.** Why is `OrderId` left only as a top-level field in the EMF payload, rather than being placed in `Dimensions` or `Metrics`?

A) It is a mistake — it should be in the dimensions
B) To keep the high-cardinality identifier out of the metrics and leave it only as a log field to search in Logs Insights — preventing metric cardinality explosion
C) To hide it for security reasons
D) Because it has no unit

**Answer: B**

Explanation: OrderId is a high-cardinality value that is unique per order, so using it as a dimension would grow the time series without bound and make costs explode. EMF is designed to separate metrics (low-cardinality aggregates) from logs (high-cardinality detail), so by leaving OrderId only as a top-level field, no metric is created for it and it is preserved as a log field to search in Logs Insights. This is the core intent of the EMF design.

---

**Question 5.** After adding the URL `path` as a metric dimension, IDs were embedded as in `/orders/{order_id}`, causing a cardinality explosion. What is the MOST appropriate solution?

A) Add more dimensions
B) Normalize the path — replace the variable part with a `/orders/{id}` placeholder so that cardinality becomes finite
C) Switch to a High-Resolution Metric
D) Shorten retention

**Answer: B**

Explanation: When IDs are embedded in the path, every request becomes a different dimension value, resulting in effectively infinite cardinality. If you normalize the variable part (order_id) into a placeholder such as `{id}` before using it as a dimension, the number of path patterns becomes finite and cardinality is controlled. This is the same as the core rule of Prometheus label management. Adding dimensions (A) makes it worse, and resolution (C) and retention (D) are unrelated to cardinality.

---

**Question 6.** After traffic increased 10x, X-Ray and custom metric costs surged. How can you control costs while maintaining debugging capability?

A) Stop all tracing and metric collection
B) X-Ray fixed-rate sampling (for example, 5%) + collect errors/high-latency requests at a higher rate under separate rules, and demote high-cardinality dimensions to log fields
C) Change Regions
D) Reduce Lambda memory

**Answer: B**

Explanation: The key is "from collecting everything → to a representative sample + all exceptions." Sampling 5% of normal traffic captures statistical patterns, while error and high-latency requests are collected at a higher rate under a separate rule so that nothing needed for debugging is missed. At the same time, demoting high-cardinality dimensions such as UserId, OrderId, and the raw URL to log fields reduces metric cost. Stopping collection (A) loses visibility, and Region (C) and memory (D) are unrelated to observability cost.

---

**Question 7.** Which of the following does Powertools for AWS Lambda NOT provide automatically through decorators?

A) Structured JSON logs + correlation ID
B) X-Ray segments and metadata
C) EMF metrics + cold start metrics
D) Automatic IAM Role creation

**Answer: D**

Explanation: Powertools automates, through decorators, `@logger.inject_lambda_context` (structured logs + correlation ID), `@tracer.capture_lambda_handler` (X-Ray segments), and `@metrics.log_metrics` (EMF metrics + cold start). However, IAM Roles/policies are infrastructure permissions that must be configured separately with IaC (CloudFormation/CDK/Terraform), and Powertools does not create them.

---

## 📌 Today's Summary

There are five key takeaways today. First, the three pillars of observability (logs, metrics, and traces) have different centers of gravity per workload, and EMF/OpenTelemetry reflect a trend toward unifying them into wide events. Second, Container Insights views cluster/node/pod resources through a DaemonSet collector (cAdvisor/kubelet); ECS enables it via a cluster setting and EKS by deploying an agent, and in small clusters the observability cost can exceed that of the workload. Third, Lambda Insights uses the Extension sidecar pattern to measure cold-start init duration even while the function is frozen. Fourth, EMF's multiple dimension combinations materialize the needed aggregation views at publish time, like OLAP pre-aggregation, and separate high-cardinality identifiers into log fields. Fifth, cardinality is the key variable in cost, so use only low-cardinality values for dimensions, normalize IDs and URLs, and handle Cost vs Visibility through sampling (5% of normal + all exceptions) and aggregation.
