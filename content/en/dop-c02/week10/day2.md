# Day 2 - CloudWatch Logs: Groups, Streams, Subscriptions, and Insights Deep Dive

Logs are the operational black box. When something goes wrong, they're nearly the only primary evidence of "what happened." But in distributed systems, logs immediately become a problem. Hundreds of Lambda functions, thousands of containers, on-premises servers all vomiting logs — where do you collect them, how do you order them chronologically, how do you search them, how do you catch specific patterns real-time, and — most practically — how do you control exploding log costs? CloudWatch Logs is the central sink where almost every AWS service streams logs, and on top of it sit real-time routing (Subscription), metric extraction (Metric Filter), and interactive analysis (Insights).

Today we go inside this log pipeline. Not just "logs split into groups and streams," but why this two-layer hierarchy exists, how Subscription Filters stream logs nearly real-time elsewhere, how the Logs Insights query engine works and why it charges by scan volume, why logs are so expensive, and how to tame that cost. In DOP-C02 exams, logs appear every test as scenarios: "real-time OpenSearch ingestion," "alarms from external NGINX logs," "multi-account central aggregation," "controlling runaway log costs."

## Log Group and Log Stream — Why Two Layers

CloudWatch Logs' most basic structure is two tiers: **Log Group** and **Log Stream**. Many see this as just folder/file, but this two-layer split has a clear purpose.

**Log Group** is the logical unit — usually one application or service (`/aws/lambda/MyFn`, `/ecs/checkout`). Retention policy (retention), encryption key (KMS), access permissions, metric filters, and subscription filters all hang at **group level**. That is, the group is "the unit of policy."

**Log Stream** is the physical unit — a single log source (specific Lambda invocation, specific EC2, specific container). Log events are accumulated chronologically within the stream.

Why does this split matter? **The ordering boundary is the stream.** CloudWatch guarantees event time order within one stream, but not across different streams. If all sources mixed into one stream, multiple sources writing simultaneously would tangle the order and create write contention. Put sources in separate streams, each writes sequentially to its own, and the group bundles these streams under one policy umbrella.

> 💡 **Related Theory**: Log Group/Stream's two-tier structure is a universal pattern in distributed logging. Apache Kafka's topic/partition is exactly the same idea—topic is the logical unit (policy, consumer group), partition is the physical unit guaranteeing order. Kafka guarantees "order within partition only," just as CloudWatch guarantees "order within stream only." The essence is the **trade-off between parallel write throughput and ordering guarantee**. Partition per source enables parallel writes and raises throughput, while keeping causal order within each source. You give up total global order to gain scalability—classic distributed systems trade-off.

## Retention — The Cost Trap the Default Creates

Create a Log Group and the default retention policy is **Never Expire (unlimited)**. This is the most common and costliest trap. Without explicit retention, logs pile up forever and CloudWatch Logs storage costs accumulate endlessly.

```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/MyFn \
  --retention-in-days 14
```

Retention values are discrete: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653 days (or never). Only these fixed values, no arbitrary days.

> ⚠️ **Trap**: In organizations running tens to hundreds of Lambda functions, auto-created Log Groups (`/aws/lambda/<function-name>`) default to unlimited retention. Developers just deploy the function and don't set retention separately. After a year, un-viewed debug logs pile up to terabytes, and monthly storage bills become substantial. The solution is org-level automation—detect new Log Group creation via EventBridge and Lambda auto-applies retention, or AWS Config rules catch "Log Group without retention" as non-compliant and auto-remediate. "Default is cost-worst" must be remembered.

## Subscription Filter — Real-Time Log Streaming Pipe

If Logs Insights is "search stored logs post-event," Subscription Filter is the opposite: **stream logs real-time to elsewhere the instant they arrive**. This transforms CloudWatch Logs from mere storage into a real-time event source.

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name ErrorAlerts \
  --filter-pattern '?ERROR ?Exception' \
  --destination-arn arn:aws:lambda:...:function:ErrorRouter
```

Destinations come in three varieties. **Lambda** (custom processing—parse errors to Slack), **Kinesis Data Streams** (high-throughput fan-out—multiple consumers parallelize log ingestion), **Kinesis Data Firehose** (managed buffer with S3·OpenSearch·Splunk·Datadog delivery). Choice of destination shapes the pipeline.

Filter Pattern is shared subscription/metric filter syntax, surprisingly powerful:

- Simple text: `"ERROR"` — lines containing this string
- Multiple OR: `?ERROR ?WARN` — ERROR or WARN
- JSON matching: `{ $.statusCode = 500 }` — specific key-value in JSON logs
- Space-delimited fields: `[ip, id, user, time, request, status_code=5*, ...]` — positional NGINX-style logs

> 🔍 **Deeper**: The destination choice reflects processing models. **Direct Lambda** simplest but risky on burst traffic—log tsunami can throttle Lambda concurrency. **Kinesis Data Streams** absorbs spikes with shard buffering and fans to multiple consumers, but requires shard management. **Kinesis Firehose** fully managed buffer, easiest for S3·OpenSearch batching, no shard overhead but batches incur minute-scale delay. General rule: simple transform/route→Lambda, high-throughput multi-consumer→Data Streams, storage/search ingestion→Firehose. Limited subscription filters per Log Group, so multi-destination typically goes through Data Streams for fan-out.

## Metric Filter — Mining Numbers from Logs

While Subscription Filter routes logs outward, Metric Filter **extracts numbers from log lines and converts them to CloudWatch metrics**, then you can alarm on those metrics.

```bash
aws logs put-metric-filter \
  --log-group-name nginx-access \
  --filter-name 5xxCount \
  --filter-pattern '[ip, id, user, time, request, status_code=5*, size, ...]' \
  --metric-transformations \
    metricName=5xxErrors,metricNamespace=NginxLogs,metricValue=1
```

This filter increments the `5xxErrors` metric by 1 for each NGINX access log line where the 6th field (status_code) starts with 5. Now alarm on this metric and you have "notify on NGINX 5xx surge."

The relationship with EMF from yesterday matters. **For brand-new code you write, EMF is the answer**—log and metric together in one emit. But for **external logs where you can't change format** (NGINX·Apache·syslog), Metric Filter is standard. EMF=my application, Metric Filter=someone else's format division of labor.

> 💡 **Related Theory**: Metric Filter is a form of **stream processing**—real-time pattern matching and windowed aggregation over infinite log streams. Apply patterns to flowing events, increment counters on match—this is stream windowed aggregation. Lineage: Logstash grok filters + metric output, Splunk search-time extraction, Fluentd/Fluent Bit filter plugins. Core idea: trade-off **schema-on-write (structure at ingest) vs. schema-on-read (structure at query)**. Metric Filter evaluates patterns at ingest (schema-on-write lean), pre-making metrics, so alarms are immediate but only for pre-defined patterns. Logs Insights (schema-on-read) is flexible but post-search.

## Logs Insights — Interactive Log Query Engine

For post-event log exploration, use Logs Insights. Not SQL but a pipe-based (`|`) query language.

```
fields @timestamp, @message
| filter level = "error"
| stats count() by service
| sort count desc
| limit 20
```

`fields`(display fields) → `filter`(WHERE clause) → `stats`(aggregation: count/sum/avg/percentile) → `sort` → `limit`, plus `parse` for regex extraction. JSON logs auto-parse keys like `level`, `service` available for filtering/aggregation.

Two core constraints. **You must specify time range** (doesn't scan all logs), and **billing is by data scanned (GB)**. Per-GB-scanned cost is charged.

> 🔍 **Deeper**: Logs Insights' "charge-by-scan" exists because the engine is fundamentally a **distributed full scan**. Unlike Elasticsearch/OpenSearch with pre-built inverted indices, Insights reads the specified time range's logs in parallel at query time, filters and aggregates (same model as Athena scanning S3, BigQuery scanning columns). Advantage: no index maintenance cost, arbitrary queries free. Downside: scan scope determines cost/latency linearly. So narrow time range and apply `filter` early—core to performance and cost. Conversely, if you need always-fast text search, stream logs to OpenSearch for inverted indexing—it's pull-now-scan (Insights) vs. pay-upfront-index (OpenSearch) trade-off.

## Live Tail — Real-Time Debugging

If Logs Insights is post-analysis, **Live Tail** is the cloud `tail -f`—stream logs as they arrive real-time. Right after deploy or mid-incident: "what's happening now?"

```bash
aws logs start-live-tail \
  --log-group-identifiers arn:aws:logs:...:log-group:/aws/lambda/MyFn
```

Session has time limits, can filter specific patterns. Insights (post-stats) and Live Tail (real-time watch) are two interfaces to same log data—one asks "what happened," the other "what's happening now."

## Cross-Account Logs — Two Eras of Multi-Account Aggregation

Large orgs have tens of accounts. Logs must go to one place; AWS solved this in two generations.

**1st Gen — Subscription Destination.** Central account makes a receive endpoint (usually Kinesis Data Stream) with `put-destination`, grants source account access with `put-destination-policy`. Source accounts attach subscription filters to their Log Groups pointing to that destination ARN.

```bash
# Central (receive) account
aws logs put-destination \
  --destination-name CrossAcctDest \
  --target-arn arn:aws:kinesis:...:stream/CentralLogStream \
  --role-arn arn:aws:iam::...:role/CWLogsToKinesisRole
aws logs put-destination-policy \
  --destination-name CrossAcctDest \
  --access-policy '{...source account allow...}'

# Source account
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/MyFn \
  --filter-name CentralizeLogs --filter-pattern '' \
  --destination-arn arn:aws:logs:...:destination:CrossAcctDest
```

**2nd Gen — Cross-Account Observability (2023+).** Much simpler. Monitoring account creates a Sink, source accounts trust it, then monitoring account console sees source logs/metrics/traces aggregated. No separate Kinesis pipeline—direct console view. One-way: sources can't see monitoring account data.

The purposes differ. 1st gen for **physically moving/processing/re-ingesting logs** (e.g., central data lake S3, central OpenSearch). 2nd gen for **viewing/searching without moving**.

## Log Costs — Why So Much and How to Tame

Behind every log decision: cost. CloudWatch Logs cost has three axes: **ingestion (GB), storage (GB-month), Insights queries (scanned GB)**. Ingestion and storage dominate and cost more than S3-like cheap storage.

Standard cost-control patterns are three. First, **keep retention short**—CloudWatch holds recent logs, old ones expire. Second, **long-term logs flow via Firehose subscription to S3 (cheap)**, search via Athena if needed. Third, **structured logs cut volume**—one JSON line with all context is smaller than multiline debug dumps and searches better.

> 📚 **Case Study**: A SaaS company poured DEBUG-level logs from all microservices into CloudWatch with unlimited retention. Traffic grew, log cost exceeded compute cost—yet nobody queried 6-month-old DEBUG logs. Fix: three steps. (1) Production log level raised to INFO (less ingestion). (2) Log Group retention unified to 14 days. (3) Compliance-required long storage routed Firehose → S3 → Glacier. After: log costs dropped to 1/5. Lesson: **most log cost is "keeping logs no one views in expensive places too long,"** fix is level shift (volume) + short retention (time) + S3 cold (storage) combo.

> 🎯 **Scenario**: "Security wants all VPC Flow Log + app logs 7 years (compliance), ops queries only last 2 weeks." CloudWatch 7-year unlimited retention is unaffordable. Answer: tier split. CloudWatch Logs retention 14 days (ops queries), simultaneously Subscription Filter (empty pattern `''` for all) → Kinesis Firehose → S3 for 7-year storage. S3 Lifecycle converts to Glacier/Deep Archive after time, minimizing storage cost. Rare long queries go to Athena directly on S3. "Hot recent in CloudWatch, cold archive in S3"—hot/cold tiering is key.

## Summary

Today's five takeaways. First, **Log Group (policy unit) / Log Stream (order-guarantee unit) two-tier** mirrors Kafka topic/partition as a parallel-write-vs-order compromise. Second, **default retention is unlimited—a cost trap**; org-level auto-retention enforcement is standard. Third, **Subscription Filter routes logs real-time to Lambda/Kinesis/Firehose**; destination choice shapes processing model. Fourth, **Metric Filter extracts metrics from external logs** (NGINX etc), schema-on-write tool dividing labor with EMF. Fifth, **Logs Insights is full-scan engine** (charges by scan data) so time range + early filter are key, cost control is log level (volume) + short retention (time) + S3 cold (storage) combo.

Next we deep-dive Container Insights and Lambda Insights, and EMF. How observability differs by workload type, how EMF multi-dimension combinations work, how cardinality becomes a cost bomb.

---

## 📝 연습 문제

**문제 1.** 여러 출처(컨테이너 인스턴스)가 같은 서비스의 로그를 보낸다. CloudWatch가 시간 순서를 보장하는 경계는?

A) Log Group 전체
B) Log Stream 내부 — 한 스트림 안에서만 순서 보장
C) 리전 전체
D) 계정 전체

**정답: B**

해설: CloudWatch Logs는 한 Log Stream 내부에서만 이벤트의 시간 순서를 보장하고, 서로 다른 스트림 사이에는 보장하지 않는다. Kafka가 파티션 안에서만 순서를 보장하는 것과 같은 모델로, 출처마다 스트림을 분리해 병렬 쓰기 처리량을 얻으면서 각 출처 내부의 인과 순서를 유지한다. Log Group(A)은 정책·권한·필터의 단위일 뿐 순서 보장 단위가 아니다.

---

**문제 2.** 수백 개 Lambda 함수의 Log Group이 자동 생성되며 로그 비용이 누적된다. 근본 원인과 해법은?

A) Lambda 메모리 과다 — 메모리 축소
B) 기본 retention이 무제한 — EventBridge로 새 Log Group 생성을 감지해 자동 retention 적용 또는 Config 규칙으로 비준수 교정
C) 리전이 비쌈 — 리전 변경
D) IAM 권한 과다

**정답: B**

해설: Lambda가 자동 생성하는 Log Group의 기본 retention은 Never Expire(무제한)라 로그가 영원히 쌓인다. 조직 차원의 해법은 새 Log Group 생성 이벤트를 EventBridge로 잡아 Lambda가 자동으로 retention을 걸거나, AWS Config 규칙으로 "retention 없는 Log Group"을 비준수로 탐지해 자동 교정하는 것이다. 메모리(A)·리전(C)·IAM(D)은 로그 보존 비용과 무관하다.

---

**문제 3.** 로그를 실시간으로 OpenSearch에 적재하려 한다. 가장 적절한 경로는?

A) Subscription Filter → Kinesis Data Firehose → OpenSearch
B) 매시간 export task로 S3에 내린 뒤 수동 색인
C) Lambda가 Log Group을 1분마다 폴링
D) S3 동기화

**정답: A**

해설: Subscription Filter는 로그 도착 즉시 실시간으로 라우팅하고, Kinesis Firehose는 완전관리형 버퍼로 OpenSearch에 배치 적재하기 가장 단순한 경로다. 샤드 관리가 없고 버퍼링·재시도를 자동 처리한다. export task(B)는 일회성 배치라 실시간이 아니고, 폴링(C)은 지연·비용·throttling 문제가 있으며, S3 동기화(D)는 OpenSearch로 직접 가지 않는다.

---

**문제 4.** 형식을 바꿀 수 없는 외부 NGINX 액세스 로그에서 5xx만 메트릭으로 만들어 알람을 걸려면?

A) EMF로 NGINX 로그를 재작성
B) Metric Filter `[..., status_code=5*, ...]` + 그 메트릭에 CloudWatch Alarm
C) Logs Insights를 5분마다 수동 실행
D) X-Ray

**정답: B**

해설: EMF는 내가 짜는 애플리케이션 코드에 적용하는 것이라 형식을 바꿀 수 없는 외부 로그(NGINX·Apache·syslog)에는 못 쓴다. Metric Filter는 공백 구분 위치 기반 패턴으로 status_code 필드가 5로 시작하는 라인을 매칭해 메트릭을 추출하고, 그 메트릭에 알람을 건다. Insights 수동 실행(C)은 실시간 알람이 아니고, X-Ray(D)는 분산 추적으로 로그 메트릭 추출과 무관하다.

---

**문제 5.** Logs Insights 쿼리 비용이 높다. 비용·성능을 개선하는 가장 직접적 방법은?

A) Log Group을 더 많이 만든다
B) 쿼리의 시간 범위를 좁히고 `filter`를 일찍 걸어 스캔 데이터량을 줄인다
C) retention을 늘린다
D) Live Tail로 대체

**정답: B**

해설: Logs Insights는 역색인 없이 쿼리 시점에 지정 시간 범위를 풀스캔하는 엔진이라 과금이 스캔 데이터량 기준이다. 시간 범위를 좁히고 파이프 초반에 `filter`를 걸어 스캔·처리할 데이터를 줄이면 비용과 지연이 함께 준다. retention 증가(C)는 오히려 비용을 늘리고, Live Tail(D)은 실시간 관찰용이라 사후 통계 쿼리를 대체하지 못한다.

---

**문제 6.** 모든 로그를 7년 컴플라이언스 보관하되 운영 조회는 최근 2주만 필요하다. 비용 최적 설계는?

A) CloudWatch에 7년 무제한 보존
B) CloudWatch retention 14일 + Subscription Filter(전량) → Firehose → S3, S3 라이프사이클로 Glacier 전환, 장기 조회는 Athena
C) 모든 로그를 매일 수동 다운로드
D) OpenSearch에 7년 보관

**정답: B**

해설: 핫/콜드 계층화가 정답이다. CloudWatch Logs는 retention 14일로 운영 조회만 담당하고, 동시에 빈 패턴 구독 필터로 전량을 Firehose → S3로 흘려 7년 보관한다. S3는 라이프사이클로 Glacier/Deep Archive 전환해 보관 비용을 최소화하고, 드문 장기 조회는 Athena로 직접 쿼리한다. CloudWatch 7년 보존(A)·OpenSearch 7년(D)은 저장 비용이 과도하고, 수동 다운로드(C)는 비현실적이다.

---

**문제 7.** 멀티계정 조직에서 로그를 물리적으로 이동·가공하지 않고 중앙 모니터링 계정에서 통합 조회만 하려면(2023+ 모던 방식)?

A) Subscription Destination + Kinesis(1세대)
B) Cross-Account Observability — 모니터링 계정 Sink + 출처 계정 연결로 콘솔 통합 조회
C) 각 계정 로그를 S3로 복사
D) 계정마다 별도 대시보드 수동 운영

**정답: B**

해설: Cross-Account Observability(2023+)는 모니터링 계정이 Sink를 만들고 출처 계정이 이를 신뢰하도록 연결하면, 별도 Kinesis 파이프라인 없이 모니터링 계정 콘솔에서 출처 계정의 로그·메트릭·추적을 통합 조회한다(단방향). 1세대 Subscription Destination(A)은 로그를 물리적으로 중앙으로 이동·재적재할 때 쓰는 방식이고, 이동 없는 통합 조회에는 2세대가 단순하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Log Group(정책·권한·필터의 단위)/Log Stream(순서 보장의 단위)의 2단 구조는 Kafka 토픽/파티션과 같은 병렬 쓰기 대 순서 보장의 절충이다. 둘째, 기본 retention은 무제한이라 비용 함정이며 EventBridge/Config로 자동 retention 강제가 표준이다. 셋째, Subscription Filter는 로그를 실시간으로 Lambda(단순 처리)/Kinesis Data Streams(고처리량 팬아웃)/Firehose(저장소 적재)로 라우팅한다. 넷째, Metric Filter는 형식을 못 바꾸는 외부 로그에서 메트릭을 추출하는 schema-on-write 도구로 EMF와 역할을 나눈다. 다섯째, Logs Insights는 역색인 없는 풀스캔 엔진(스캔량 과금)이라 시간 범위·조기 필터가 핵심이고, 로그 비용 통제는 로그 레벨 조정(양) + 짧은 retention(시간) + S3 cold(저장소)의 조합이다.
