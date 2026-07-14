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

## 📝 연습 문제

**문제 1.** 초당 2건만 들어오는 결제 API에 FixedRate 5%만 걸었더니, 장애가 난 시점의 trace가 통째로 안 잡혔다. 저트래픽 엔드포인트의 추적 가시성을 보장하는 메커니즘은?

A) FixedRate를 100%로 올린다

B) ReservoirSize를 설정해 비율과 무관하게 초당 최소 N건을 무조건 수집하도록 보장한다

C) X-Ray Group을 만든다

D) Priority를 9000으로 올린다

**정답: B**

해설: 순수 비율 샘플링(FixedRate)만 쓰면 트래픽이 적은 엔드포인트는 표본이 거의 안 잡혀 장애 순간을 놓칠 수 있다. ReservoirSize는 "매 초 최소 N건은 비율과 무관하게 무조건 수집"을 보장해 저트래픽 구간의 가시성을 확보한다. FixedRate 100%(A)는 가능하지만 트래픽이 높아지면 비용이 폭증하므로 reservoir로 보장량만 확보하는 것이 경제적이다. Group(C)은 Service Map 슬라이싱, Priority(D)는 규칙 평가 순서로 무관하다.

---

**문제 2.** "정상 trace는 1%만, 그러나 에러가 난 trace와 p99로 느린 trace는 100% 유지"하고 싶다. X-Ray 네이티브 head-based 샘플링만으로 이게 어려운 이유와 해결은?

A) 가능하다 — FixedRate를 1%로 하면 된다

B) head-based는 요청 입구에서 결과를 모른 채 결정하므로 "에러/느린 것만 골라 유지"가 불가능하다 — ADOT Collector의 tail-based 샘플링으로 trace 완성 후 결과 기반 선택을 얹는다

C) Reservoir를 0으로 한다

D) Priority를 조정하면 된다

**정답: B**

해설: X-Ray 네이티브 샘플링은 head-based로, 요청이 들어오는 순간 수집 여부를 정하고 전파한다. 이 시점엔 그 요청이 에러를 낼지 느릴지 모르므로 "결과가 흥미로운 trace만 유지"가 구조적으로 불가능하다. tail-based 샘플링은 모든 trace를 일단 수집한 뒤 trace가 완성되는 시점에 선택하므로 "에러·고지연 100% 유지, 정상 1%"가 가능하다. ADOT Collector의 tail_sampling processor가 이를 제공한다. FixedRate 1%(A)는 에러 trace의 99%를 무작위로 버린다.

---

**문제 3.** 다음 샘플링 규칙들이 있다. `/checkout/payment` 요청에 적용되는 규칙은?

```
Priority 100: URLPath=/checkout/*  (Reservoir 100, Rate 1.0)
Priority 200: URLPath=/health      (Reservoir 0,   Rate 0.0)
Priority 9000: URLPath=*           (Reservoir 1,   Rate 0.05)
```

A) Priority 9000 (Default) — 가장 포괄적이므로

B) Priority 100 — 가장 낮은 숫자가 먼저 평가되고 `/checkout/*`에 매칭되어 적용 후 종료

C) 세 규칙이 모두 합산 적용

D) Priority 200

**정답: B**

해설: 샘플링 규칙은 Priority 오름차순(낮은 숫자 먼저)으로 평가되고, 매칭되는 첫 규칙이 적용된 뒤 종료된다. `/checkout/payment`는 Priority 100의 `/checkout/*`에 매칭되므로 Reservoir 100 + Rate 1.0(전수 추적)이 적용되고, 그 아래 규칙들은 평가되지 않는다. 구체적 규칙을 낮은 Priority로, 포괄 규칙(`*`)을 높은 Priority로 두는 것이 정석이다(ACL·라우팅의 구체적 우선 원리와 동일). 규칙은 합산(C)이 아니라 첫 매칭만 적용된다.

---

**문제 4.** ReservoirSize를 10으로 설정했는데, 같은 서비스가 100개 인스턴스에서 돈다. 실제 수집되는 reservoir trace는 초당 몇 건에 가까운가?

A) 약 1000건 (10 × 100 인스턴스)

B) 약 10건 — reservoir는 계정·리전 전체에서 분산 조율되어 인스턴스 수와 무관하게 전체 합이 reservoir 크기로 유지된다

C) 0건

D) 인스턴스당 10건씩 독립

**정답: B**

해설: X-Ray의 reservoir는 인스턴스마다 독립적이지 않다. 각 SDK 인스턴스가 `GetSamplingTargets`로 X-Ray에 자기 몫의 reservoir 할당량을 요청하고, X-Ray가 전체 reservoir(10)를 인스턴스들에 분배한다. 따라서 100대가 돌아도 전체 reservoir 수집은 약 10건/초로 유지되지 10×100=1000이 되지 않는다. 이 분산 조율을 모르면 "왜 예상보다 적게/많이 잡히나"를 오해하게 된다.

---

**문제 5.** 평균 응답시간(p50)은 100ms로 정상인데 일부 사용자가 "느리다"고 호소한다. 어느 subsegment가 꼬리 지연을 만드는지 찾으려면?

A) 평균 메트릭에 알람을 더 건다

B) 검색 표현식 `duration > 2`로 느린 trace를 골라 개별 trace의 subsegment 타임라인을 분석한다

C) Reservoir를 늘린다

D) Group을 만든다

**정답: B**

해설: 평균은 tail latency를 숨긴다 — p50이 좋아도 p99가 나쁘면 일부 사용자는 끔찍한 경험을 한다("The Tail at Scale", Jeff Dean 2013). 메트릭(집계)은 "느리다"를 알려주지만 "왜 느린지"는 개별 trace를 봐야 안다. `duration > 2` 같은 검색으로 느린 trace를 골라내고, 그 trace의 subsegment 타임라인에서 어느 다운스트림 호출이 시간을 잡아먹었는지 본다. 평균 알람 추가(A)는 꼬리를 못 보고, Reservoir·Group은 무관하다.

---

**문제 6.** 한 다운스트림 서비스의 fault rate가 평소 0.1%에서 서서히 올랐지만 고정 임계값(5%) 아래라 CloudWatch 알람이 안 울렸다. 이 "절대값은 낮지만 평소 대비 비정상"인 초기 열화를 잡는 도구는?

A) 고정 임계값을 1%로 낮춘다

B) X-Ray Insights — baseline(평소 fault rate)을 학습해 비정상 상승을 탐지하고 EventBridge로 알림

C) Reservoir 증설

D) Service Map을 더 자주 새로고침

**정답: B**

해설: 고정 임계값 알람은 "절대값은 낮지만 평소 대비 비정상"인 초기 열화를 놓친다. X-Ray Insights는 서비스별 정상 baseline(fault rate)을 학습해 baseline 대비 이상 상승을 탐지하고 Insight를 생성, EventBridge로 발행해 자동 알림·대응을 연결한다. 임계값을 무작정 낮추면(A) 정상 변동에도 거짓 알람이 폭증한다. baseline 학습 탐지가 고정 임계값의 사각지대를 보완하며, 둘은 보완 관계다.

---

**문제 7.** Powertools Tracer에서 `POWERTOOLS_TRACER_CAPTURE_RESPONSE=false`로 설정하는 주된 이유는?

A) 추적을 완전히 끈다

B) 큰 응답 페이로드를 metadata로 캡처하지 않아 trace 크기와 비용을 줄인다

C) annotation 검색을 빠르게 한다

D) 샘플링 비율을 높인다

**정답: B**

해설: 기본적으로 Powertools Tracer는 함수 응답을 metadata로 캡처하는데, 응답 페이로드가 크면 trace 크기가 부풀어 저장·전송 비용이 는다. `CAPTURE_RESPONSE=false`는 이 캡처를 꺼서 비용을 줄인다. "검색하지 않을 큰 데이터는 굳이 trace에 싣지 마라"는 원리의 비용 측면이다. 추적을 끄는 것(A)이 아니라 응답 캡처만 끄며, annotation 검색(C)·샘플링(D)과는 무관하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 샘플링은 추적의 필수 전제이고 X-Ray는 Reservoir(초당 최소 보장, 통계학의 reservoir sampling에서 유래) + FixedRate(초과분 비율)로 저트래픽 가시성과 비용을 동시에 잡는다. 둘째, X-Ray는 head-based 샘플링(입구에서 결정·전파)이라 단순·저오버헤드지만 결과 기반 선택이 불가능하며, "에러·느린 trace만 100% 유지"는 ADOT의 tail-based 샘플링으로 보완한다. 셋째, Priority는 규칙 평가 순서(낮은 숫자 먼저, 구체적 규칙 우선, Default 9000은 마지막)이고 reservoir는 계정·리전 전체에서 분산 조율되어 인스턴스 수와 무관하게 총합이 유지된다. 넷째, Group으로 거대한 Service Map을 슬라이스하고 검색 표현식으로 outlier(tail latency·에러 trace)를 질의하되 annotation으로 넣은 필드만 검색된다. 다섯째, X-Ray Insights는 baseline 학습으로 "절대값은 낮지만 비정상"인 초기 열화를 탐지해 고정 임계값의 사각지대를 메운다.
