# Day 2 - X-Ray Sampling: Reservoir Algorithm and the Economics of Tracing at Operational Scale

The ideal of tracing is "seeing every request." But when ten thousand requests come in per second, tracing all of them produces trace data at the same scale as main service traffic. Storage cost, transmission bandwidth, and indexing load balloon to match the workload. That's why sampling, from the very first day of distributed tracing — Dapper's paper already established this — has not been optional but essential. The question is "how to sample." If you naively pick only 1%, payment endpoints with low traffic might capture one trace per hour, if at all. If you pick 100%, noise like health checks eats tracing costs. X-Ray's sampling rules handle this tension precisely with two hands: **Reservoir + FixedRate**.

Today we don't see sampling as merely "setting a ratio," but excavate the algorithm beneath it and the distributed consistency problem. What problem in statistics does Reservoir sampling solve, why does X-Ray use the two-tier structure "per-second guarantee + excess ratio," how is sampling decision made consistently across multiple distributed nodes (head-based vs tail-based), and how do we carve up and manage massive Service Maps with Groups and search expressions. In the DOP exam, scenarios like "trace payments 100%, exclude health checks, minimize cost" are exactly this sampling rule design question.

## Reservoir Sampling — Fairly Drawing N Samples From an Endless Stream

The name `ReservoirSize` in X-Ray sampling rules comes from the **Reservoir Sampling** algorithm in statistics. The problem it solves is this: "From an endless stream whose total size you don't know in advance, maintain exactly k samples such that every element has equal probability of being selected. Use only k units of memory." A classic stream processing problem.

In X-Ray's context, the reservoir is adapted — "**guarantee a minimum of N traces collected every second, regardless of ratio**." Why is this necessary? Pure ratio sampling (FixedRate) alone misses samples in low-traffic endpoints. With 5% rate on a payment API that gets 2 requests per second, you capture only 18 out of 360 per hour, and if unlucky you miss the entire failure moment. Reservoir "secures a minimum N per second regardless of ratio," guaranteeing visibility for low-traffic endpoints.

```json
{
  "RuleName": "checkout-full",
  "Priority": 100,
  "ReservoirSize": 100,
  "FixedRate": 1.0,
  "URLPath": "/checkout/*",
  "ServiceName": "checkout-api",
  "ServiceType": "*", "Host": "*", "HTTPMethod": "*",
  "ResourceARN": "*", "Version": 1
}
```

The sampling decision has two stages. ① If this second's reservoir allocation (`ReservoirSize`) hasn't been filled yet, collect unconditionally. ② After filling the reservoir, additional incoming requests are collected at `FixedRate` ratio. In other words "**baseline guarantee (reservoir) + excess ratio (rate)**" sums to the final collection volume.

> 💡 **Related theory**: Classic Reservoir Sampling (Algorithm R, Vitter 1985) accepts the i-th element with probability k/i, replacing one of the existing samples, thereby guaranteeing that every element gets selected with uniform probability k/n even without knowing stream length. The key insight is "maintaining uniform samples in a single-pass stream where passed data never reappears." X-Ray doesn't use the algorithm itself, but borrows its idea of "guaranteeing collection up to a fixed budget (reservoir) from the stream." The same family of stream sampling underlies data engineering broadly — Kafka consumer sampling, load test tools' request sampling, and database `TABLESAMPLE` all solve the same "representative sample without full processing" problem.

> 🔍 **Going deeper**: X-Ray sampling is **head-based sampling** (decision at request entry). The moment a request arrives, you decide "collect this trace or not" and propagate `Sampled=1/0` across the whole chain (Day 1 propagation). The advantage is simplicity and low overhead — traces you're going to discard never generate data. The disadvantage is **"you can't look at results and select only interesting ones"** — you decide at the gate without knowing if this request will later error or be slow, flipping a coin. Complementing this is **tail-based sampling** (collect everything initially, select at trace completion) — you can "keep 100% of error and p99-slow traces, only 1% of normal ones" with result-based selection. The downside is you must buffer every trace, creating high overhead. X-Ray native is head-based, but with a tail-sampling processor in ADOT Collector (Day 3), you can layer result-based sampling. "Never lose an error trace" demands tail-based only.

## Sampling Rule Priority — The Evaluation Order of Policy

When multiple sampling rules exist, which applies is determined by **Priority**. Lower numbers evaluate first, and the first matching rule applies. AWS's default rule (`Default`) is Priority 9000, the fallback evaluated last.

```
Request → evaluate rules in Priority ascending order
  Priority 100: /checkout/* match? → yes → apply Reservoir 100, Rate 100% (done)
  Priority 200: /health match?    → (not checked, stopped above)
  Priority 9000: Default *       → (unreached)
```

Typical rule set:

| Rule | Priority | Reservoir | FixedRate | Match | Intent |
|------|----------|-----------|-----------|-------|--------|
| checkout | 100 | 100 | 1.0 (100%) | `/checkout/*` | Full trace for payments |
| health | 200 | 0 | 0.0 (0%) | `/health` | Completely exclude health checks |
| Default | 9000 | 1 | 0.05 (5%) | `*` | Remaining 5% |

The essence of this design is "**expensive, important paths captured early with low Priority for full trace, noise at 0%, rest at base ratio**." Since Priority determines evaluation order, the rule is: specific rules (certain paths) get low numbers, blanket rules (`*`) get high numbers — the same "specific rule first, blanket rule last" principle as firewall ACLs or routing tables.

> ⚠️ **Pitfall**: Sampling rules are **managed centrally by X-Ray, fetched by SDK polling**. The SDK fetches rules from X-Ray about every 10 seconds (`GetSamplingRules`), reporting and requesting its share of reservoir allocation (`GetSamplingTargets`). So even when you change rules, there's a few-second delay before all instances reflect it. Also, reservoir is **orchestrated distributed across account and region** — each SDK instance requests its allocated reservoir share from X-Ray, so even with 100 instances, the total reservoir stays 100, not 100×100. Not understanding this distributed coordination causes confusion like "I set Reservoir to 10 but hundreds of traces per second" (misunderstanding multi-instance summation) or "I changed the rule but it didn't change instantly" (polling delay).

## Group — Slicing a Massive Service Map

In large organizations with hundreds of services running, the Service Map becomes an spider web that doesn't fit on one screen. **X-Ray Group** is a filtered view that cuts a subset of the entire Service Map using filter expressions.

```bash
aws xray create-group \
  --group-name PaymentService \
  --filter-expression 'service("payment-api") OR service("billing")'
```

When you select this Group in the console, only payment-related services appear. Large organizations split Service Maps team-by-team or domain-by-domain, so each team focuses on their area of responsibility. Groups also become **CloudWatch metric dimensions**, letting you alarm on "average response time/error rate of this Group."

## Search Expressions — A DSL for Querying Traces

X-Ray provides its own expression language for searching traces. It targets indexed fields (http status, response time, annotations, etc.).

```
service("checkout-api") AND http.status = 500
annotation.OrderId = "abc123"
duration > 1
responsetime > 0.5 AND http.url CONTAINS "/api/v2/"
fault = true
```

Operators: `AND/OR/NOT`, `=`, `!=`, `CONTAINS`, `>`, `<`. Common patterns in operations:

| Question | Expression |
|----------|-----------|
| Payment API 500 errors | `service("checkout") AND http.status = 500` |
| p99 slow requests (>2s) | `duration > 2` |
| Track specific user | `annotation.UserId = "u-123"` |
| DynamoDB throttle | `service("dynamodb") AND error.cause CONTAINS "ProvisionedThroughputExceeded"` |

Here **only fields added as annotations can be searched**, echoing Day 1's principle. Because you added `OrderId` as an annotation, you can find it with `annotation.OrderId = ...`. If you'd added it as metadata, this search wouldn't be possible — it's not indexed.

> 💡 **Related theory**: Finding slow traces with `duration > 2` is the starting point of **outlier analysis** in observability. Average response time lies — if p50 is 100ms but p99 is 5 seconds, 1% of users have a terrible experience. A distributed system's **tail latency** never shows in simple averages. Jeff Dean's "The Tail at Scale" (2013) nailed the insight: if a service calls 100 components in parallel, even if each component's p99 is good, the whole request almost always hits someone's p99, slowing down (99%^100 ≈ 37% are fast). So trace search is fundamentally "grab individual slow traces and see which subsegment creates the tail." Metrics (aggregated) tell you "it's slow," traces (individual) tell you "why it's slow."

## X-Ray Insights — Anomaly Detection From Learned Baseline

Operators can't watch traces and Service Maps 24/7. **X-Ray Insights** (2020+) learns the normal pattern of the Service Map (fault rate baseline), automatically detects anomalies, and generates Insights. An Insight bundles the affected root-cause service, impact scope, and time progression, and publishes an event to EventBridge for automatic remediation.

```json
{ "source": ["aws.xray"], "detail-type": ["AWS X-Ray Insight Update"] }
```

Wire this event through EventBridge rules to Lambda·SNS·SSM Automation, and you get a pipeline of "anomaly detection → automatic alert/automatic diagnosis." X-Ray Insights pairs with CloudWatch Anomaly Detection from Week 10 — where Anomaly Detection watches metric deviation, X-Ray Insights watches service topology health deviation.

> 📚 **Case study**: A SaaS company deployed at night, and a downstream's fault rate slowly rose from its normal 0.1%, but the absolute value stayed below the alarm threshold (fixed 5%), so CloudWatch didn't alert. However, X-Ray Insights caught it as "baseline relative abnormal rise" and immediately generated an Insight. The EventBridge alert went to Slack, and the team rolled back in 30 minutes. Lesson: fixed thresholds miss "absolute value low but abnormal relative to normal" early degradation. Baseline-learned detection (Insights) fills this blind spot. They're complementary, not competing.

## Cost Optimization in Practice — The Economics of Reservoir and Rate

Sampling design is cost design. X-Ray charges by recorded traces and searched traces, so "how many you collect" becomes a direct invoice line.

- **1000 req/s × 100%** = 1000 trace/s → full cost. Overkill for most workloads.
- **Reservoir 1 + FixedRate 1%** → roughly 1 (guarantee) + 10 (1% of excess) ≈ 11 trace/s. Cost drops by two orders of magnitude while maintaining visibility in low-traffic periods (reservoir 1).
- **100% for business-critical path only, lower ratio for rest** → see all the important stuff, sample the noise.

Additionally, Powertools Tracer can use `POWERTOOLS_TRACER_CAPTURE_RESPONSE=false` to skip storing response payloads in metadata, reducing the cost inflation from large responses. This is the cost angle of Day 1's principle "don't store large data you won't search."

> 🎯 **Scenario**: "Payment API must never lose a single trace if there's a failure, completely exclude health checks (`/health`) from tracing, and for other traffic trace only 5% for cost. How do you configure it?" — The answer is three rules separated by Priority. ① Set `/checkout/*` rule to Priority 100 (low=first evaluation), large Reservoir (e.g., 100) + FixedRate 1.0, making payments effectively full-trace. ② Set `/health` rule to Priority 200, Reservoir 0 + FixedRate 0.0, completely excluding health checks. ③ Set Default rule (Priority 9000) to FixedRate 0.05 for remaining 5%. The key is **having evaluation order with specific rules at low Priority first and blanket rules last**. If "never lose failure trace" is an even stricter demand, layer ADOT's tail-based sampling on top to "keep error·high-latency traces 100%."

## Wrapping Up

Today we covered five things. First, **sampling is a prerequisite of tracing**, and X-Ray uses Reservoir (per-second minimum guarantee) + FixedRate (excess ratio) to simultaneously handle low-traffic visibility and cost. Second, **X-Ray is head-based sampling** (decision at entry·propagated) so simple·low-overhead but can't choose based on results, complemented by ADOT's tail-based. Third, **Priority determines evaluation order** (low number first, specific rules first, Default 9000 last), and reservoir is orchestrated distributed across account·region to stay constant regardless of instance count. Fourth, **slice massive Service Maps with Groups, and query outliers (tail latency·error traces) with search expressions**, but only fields added as annotations are searchable. Fifth, **X-Ray Insights detects baseline-learned "low absolute but abnormal" early degradation**, filling the blind spot of fixed thresholds.

The next article examines **X-Ray's sampling and cost tuning at operational scale**. We'll explore why Reservoir sampling has this structure, how sampling decisions consistently propagate in distributed environments, and how to wield massive Service Maps with Groups and search expressions.

---

## 📝 Practice Questions

**Question 1.** After applying only FixedRate 5% to a payment API receiving just 2 requests per second, the traces from the time of an outage were not captured at all. What mechanism guarantees tracing visibility for low-traffic endpoints?

A) Raise FixedRate to 100%

B) Set ReservoirSize to guarantee that at least N requests per second are always collected regardless of the rate

C) Create an X-Ray Group

D) Raise Priority to 9000

**Answer: B**

Explanation: With pure rate sampling (FixedRate) alone, a low-traffic endpoint gets almost no samples and may miss the moment of an outage. ReservoirSize guarantees "at least N requests every second are always collected regardless of the rate," securing visibility in low-traffic periods. FixedRate 100% (A) is possible but costs explode as traffic grows, so securing only the guaranteed amount with a reservoir is economical. A Group (C) slices the Service Map and Priority (D) is the rule evaluation order, so both are unrelated.

---

**Question 2.** You want to keep only 1% of normal traces, but keep 100% of traces with errors and traces that are slow at p99. Why is this difficult with X-Ray's native head-based sampling alone, and what is the solution?

A) It is possible — just set FixedRate to 1%

B) Head-based sampling decides at the request entry point without knowing the outcome, so "selecting and keeping only errors/slow ones" is impossible — layer outcome-based selection on top with tail-based sampling in the ADOT Collector after the trace is complete

C) Set Reservoir to 0

D) Just adjust Priority

**Answer: B**

Explanation: X-Ray's native sampling is head-based: it decides whether to collect at the moment the request arrives and propagates that decision. At that point it is not known whether the request will produce an error or be slow, so "keeping only traces whose outcome is interesting" is structurally impossible. Tail-based sampling collects all traces first and then makes the selection when the trace is complete, so "keep 100% of errors and high latency, 1% of normal" becomes possible. The tail_sampling processor of the ADOT Collector provides this. FixedRate 1% (A) randomly discards 99% of error traces.

---

**Question 3.** The following sampling rules exist. Which rule applies to a `/checkout/payment` request?

```
Priority 100: URLPath=/checkout/*  (Reservoir 100, Rate 1.0)
Priority 200: URLPath=/health      (Reservoir 0,   Rate 0.0)
Priority 9000: URLPath=*           (Reservoir 1,   Rate 0.05)
```

A) Priority 9000 (Default) — because it is the most comprehensive

B) Priority 100 — the lowest number is evaluated first, matches `/checkout/*`, is applied, and evaluation ends

C) All three rules are applied in combination

D) Priority 200

**Answer: B**

Explanation: Sampling rules are evaluated in ascending Priority order (lowest number first), and the first matching rule is applied and evaluation ends. `/checkout/payment` matches `/checkout/*` at Priority 100, so Reservoir 100 + Rate 1.0 (trace everything) is applied, and the rules below it are not evaluated. The standard practice is to give specific rules a low Priority and the catch-all rule (`*`) a high Priority (the same principle as specific-first precedence in ACLs and routing). Rules are not combined (C); only the first match is applied.

---

**Question 4.** ReservoirSize is set to 10, and the same service runs on 100 instances. About how many reservoir traces per second are actually collected?

A) About 1000 (10 × 100 instances)

B) About 10 — the reservoir is coordinated in a distributed manner across the whole account and Region, so the overall total stays at the reservoir size regardless of the number of instances

C) 0

D) 10 per instance, independently

**Answer: B**

Explanation: X-Ray's reservoir is not independent per instance. Each SDK instance requests its share of the reservoir quota from X-Ray through `GetSamplingTargets`, and X-Ray distributes the overall reservoir (10) among the instances. Therefore, even with 100 instances running, the total reservoir collection stays at about 10 per second and does not become 10×100=1000. Without understanding this distributed coordination, you would misunderstand "why fewer/more are captured than expected."

---

**Question 5.** The average response time (p50) is a healthy 100 ms, but some users complain that the service is "slow." How can you find which subsegment creates the tail latency?

A) Add more alarms on the average metric

B) Pick out slow traces with the search expression `duration > 2` and analyze the subsegment timeline of individual traces

C) Increase the Reservoir

D) Create a Group

**Answer: B**

Explanation: The average hides tail latency — even if p50 is good, if p99 is bad some users have a terrible experience ("The Tail at Scale", Jeff Dean, 2013). Metrics (aggregates) tell you "it is slow," but to know "why it is slow" you must look at individual traces. Use a search such as `duration > 2` to pick out the slow traces, and in their subsegment timelines see which downstream call consumed the time. Adding average alarms (A) cannot see the tail, and Reservoir and Group are unrelated.

---

**Question 6.** The fault rate of a downstream service slowly rose from the usual 0.1%, but it stayed below the fixed threshold (5%), so no CloudWatch alarm fired. Which tool catches this early degradation that is "low in absolute terms but abnormal compared with normal"?

A) Lower the fixed threshold to 1%

B) X-Ray Insights — learns a baseline (the usual fault rate), detects abnormal increases, and notifies through EventBridge

C) Increase the Reservoir

D) Refresh the Service Map more often

**Answer: B**

Explanation: A fixed-threshold alarm misses early degradation that is "low in absolute terms but abnormal compared with normal." X-Ray Insights learns each service's normal baseline (fault rate), detects anomalous increases relative to the baseline, generates an Insight, and publishes it to EventBridge to connect automated notification and response. Lowering the threshold indiscriminately (A) causes a surge of false alarms from normal fluctuations. Baseline-learning detection complements the blind spots of fixed thresholds, and the two are complementary.

---

**Question 7.** What is the main reason for setting `POWERTOOLS_TRACER_CAPTURE_RESPONSE=false` in the Powertools Tracer?

A) To turn tracing off completely

B) To avoid capturing large response payloads as metadata, reducing trace size and cost

C) To make annotation search faster

D) To raise the sampling rate

**Answer: B**

Explanation: By default, the Powertools Tracer captures the function response as metadata, and if the response payload is large, the trace size balloons and storage and transmission costs increase. `CAPTURE_RESPONSE=false` turns this capture off to reduce cost. This is the cost aspect of the principle "do not put large data you will not search into the trace." It does not turn tracing off (A); it turns off only response capture, and it is unrelated to annotation search (C) and sampling (D).

---

## 📌 Today's Summary

There are five key takeaways today. First, sampling is a prerequisite of tracing, and X-Ray secures low-traffic visibility and cost at the same time with Reservoir (a guaranteed minimum per second, derived from reservoir sampling in statistics) + FixedRate (a rate for the excess). Second, X-Ray uses head-based sampling (decided and propagated at the entry point), which is simple and low-overhead but cannot select by outcome, and "keep 100% of only error/slow traces" is supplemented by ADOT's tail-based sampling. Third, Priority is the rule evaluation order (lowest number first, specific rules first, Default 9000 last), and the reservoir is coordinated in a distributed manner across the whole account and Region so the total is maintained regardless of the number of instances. Fourth, use Groups to slice a huge Service Map and search expressions to query outliers (tail-latency and error traces), but only fields put in as annotations are searchable. Fifth, X-Ray Insights learns a baseline to detect early degradation that is "low in absolute terms but abnormal," filling the blind spot of fixed thresholds.
