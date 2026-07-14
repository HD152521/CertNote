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

## 📝 연습 문제

**문제 1.** Lambda 함수에 사용자 정의 메트릭을 가장 효율적으로 게시하면서 같은 데이터를 여러 집계 관점으로도 보려면?

A) PutMetricData를 차원 조합마다 호출
B) EMF — 로그에 메트릭을 임베드하고 `Dimensions` 배열의 배열로 다중 차원 조합을 한 번에 게시
C) Container Insights 활성화
D) Lambda Insights Layer 추가

**정답: B**

해설: EMF는 메트릭 API 호출 없이 로그 JSON에 메트릭을 임베드하고, `Dimensions`를 배열의 배열로 받아 한 번의 출력으로 여러 차원 조합(예: `[Service,Environment]`, `[Service]`, `[]`)을 동시에 게시한다. CloudWatch는 publish 시점 차원 조합으로만 집계하므로 이 다중 조합이 사후 다양한 관점 조회를 가능하게 한다. PutMetricData(A)는 조합마다 호출이 필요해 비효율적이고, Container/Lambda Insights(C/D)는 자원 메트릭 수집 도구로 커스텀 메트릭 게시 수단이 아니다.

---

**문제 2.** EKS 클러스터에서 파드별 CPU·메모리 메트릭을 자동 수집하려면?

A) Task Definition에 설정
B) ECS 클러스터 설정 활성화
C) Container Insights를 위해 ADOT/CloudWatch Agent를 DaemonSet으로 노드마다 배포
D) Lambda Insights Layer

**정답: C**

해설: EKS는 파드 메트릭을 그 파드가 떠 있는 노드에서 읽어야 하므로 수집 에이전트(ADOT Collector 또는 CloudWatch Agent)를 DaemonSet으로 모든 노드에 하나씩 배포한다. cAdvisor/kubelet이 노출하는 컨테이너 자원 데이터를 에이전트가 긁어 CloudWatch로 보낸다. Task Definition(A)·ECS 클러스터 설정(B)은 ECS용이고, Lambda Insights(D)는 Lambda 전용이다.

---

**문제 3.** Lambda 콜드 스타트가 응답 지연에 얼마나 기여하는지, Provisioned Concurrency 효과를 검증하려면?

A) Container Insights
B) Lambda Insights — init duration 메트릭으로 콜드 스타트 정량화
C) Synthetics
D) CloudTrail

**정답: B**

해설: Lambda Insights는 Extension으로 동작해 함수가 동결돼도 init·invoke 라이프사이클을 측정하며, init duration 메트릭으로 콜드 스타트 시간을 정량화한다. 이를 통해 콜드 스타트의 지연 기여도와 Provisioned Concurrency 적용 효과를 검증한다. Container Insights(A)는 컨테이너용, Synthetics(C)는 외부 프로브, CloudTrail(D)은 API 감사 로그라 콜드 스타트 내부 측정과 무관하다.

---

**문제 4.** EMF 페이로드에서 `OrderId`를 `Dimensions`나 `Metrics`에 넣지 않고 최상위 필드로만 두는 이유는?

A) 실수다 — 차원에 넣어야 한다
B) 고카디널리티 식별자를 메트릭에서 빼 로그 필드로만 남겨 Logs Insights에서 검색 — 메트릭 카디널리티 폭발 방지
C) 보안상 숨기려고
D) 단위가 없어서

**정답: B**

해설: OrderId는 주문마다 고유한 고카디널리티 값이라 차원으로 넣으면 시계열이 무한정 늘어 비용이 폭발한다. EMF는 메트릭(저카디널리티 집계)과 로그(고카디널리티 상세)를 분리하는 설계라, OrderId를 최상위 필드로만 두어 메트릭은 만들지 않고 로그 필드로 보존해 Logs Insights에서 검색한다. 이것이 EMF 설계의 핵심 의도다.

---

**문제 5.** 메트릭 차원에 URL `path`를 넣었더니 `/orders/{order_id}`처럼 ID가 박혀 카디널리티가 폭발했다. 가장 적절한 해법은?

A) 차원을 더 추가
B) path를 정규화 — 변수 부분을 `/orders/{id}` 플레이스홀더로 치환해 카디널리티를 유한하게
C) High-Resolution Metric으로 전환
D) retention 단축

**정답: B**

해설: 경로에 ID가 박히면 요청마다 다른 차원값이 되어 사실상 무한 카디널리티가 된다. 차원으로 쓰기 전에 변수 부분(order_id)을 `{id}` 같은 플레이스홀더로 정규화하면 경로 패턴 수가 유한해져 카디널리티가 통제된다. Prometheus 레이블 운영의 핵심 규칙과 동일하다. 차원 추가(A)는 악화시키고, 해상도(C)·retention(D)은 카디널리티와 무관하다.

---

**문제 6.** 트래픽 10배 증가로 X-Ray·커스텀 메트릭 비용이 폭증했다. 디버깅 능력을 유지하며 비용을 잡으려면?

A) 모든 추적·메트릭 수집 중단
B) X-Ray 고정 비율 샘플링(예: 5%) + 에러/고지연은 높은 비율로 별도 수집, 고카디널리티 차원을 로그 필드로 강등
C) 리전 변경
D) Lambda 메모리 축소

**정답: B**

해설: "전수 수집 → 대표 표본 + 예외 전수"가 핵심이다. 정상 트래픽은 5% 샘플링으로 통계적 패턴을 잡고, 에러·고지연 요청은 별도 규칙으로 높은 비율 수집해 디버깅에 필요한 것을 놓치지 않는다. 동시에 UserId·OrderId·원본 URL 같은 고카디널리티 차원을 로그 필드로 강등해 메트릭 비용을 줄인다. 수집 중단(A)은 가시성을 잃고, 리전(C)·메모리(D)는 관찰성 비용과 무관하다.

---

**문제 7.** Powertools for AWS Lambda가 데코레이터로 자동 제공하지 않는 것은?

A) 구조화 JSON 로그 + correlation ID
B) X-Ray 세그먼트와 메타데이터
C) EMF 메트릭 + 콜드 스타트 메트릭
D) IAM Role 자동 생성

**정답: D**

해설: Powertools는 `@logger.inject_lambda_context`(구조화 로그 + correlation ID), `@tracer.capture_lambda_handler`(X-Ray 세그먼트), `@metrics.log_metrics`(EMF 메트릭 + 콜드 스타트)를 데코레이터로 자동화한다. 그러나 IAM Role/정책은 인프라 권한이라 IaC(CloudFormation/CDK/Terraform)로 별도 설정해야 하며 Powertools가 만들어주지 않는다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 관찰성의 세 기둥(로그·메트릭·추적)은 워크로드별 무게중심이 다르고 EMF/OpenTelemetry는 넓은 이벤트로 통합하려는 흐름이다. 둘째, Container Insights는 DaemonSet 수집기(cAdvisor/kubelet)로 클러스터/노드/파드 자원을 보며 ECS는 클러스터 설정, EKS는 에이전트 배포로 켜고 작은 클러스터에선 관찰성 비용이 워크로드를 넘을 수 있다. 셋째, Lambda Insights는 Extension 사이드카 패턴으로 함수 동결 중에도 콜드 스타트 init duration을 측정한다. 넷째, EMF의 다중 차원 조합은 OLAP 사전 집계처럼 필요한 집계 관점을 publish 시점에 materialize하고 고카디널리티 식별자는 로그 필드로 분리한다. 다섯째, 카디널리티는 비용의 핵심 변수라 차원에는 저카디널리티만, ID·URL은 정규화하며, Cost vs Visibility는 샘플링(정상 5% + 예외 전수)과 집계로 다룬다.
