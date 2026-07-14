# Day 4 - OpenSearch · AMP · AMG: The Two Worlds of Inverted Indices and Time-Series Databases

Choosing where to store observability data is not a simple infrastructure decision. It's a question about the essence of data. "Find the payment failure log user-789 saw on June 2 at 14:23" and "graph the 99th percentile API error rate over the last 5 minutes" are completely different questions, requiring completely different data structures. The first is a **full-text search** problem (finding specific documents in arbitrary text), the second is **time-series aggregation** (aggregating numbers over time axis). The former is solved by **inverted index**, the latter by **time-series database (TSDB)** — fundamentally different engines. That's why OpenSearch and Prometheus (AMP) exist separately.

Today we excavate the difference between these two worlds. How inverted indices enable text search, why TSDB is a separate engine specialized for time-series, how their storage and query models differ, and how Grafana (AMG) above them unifies heterogeneous backends into one dashboard. In the DOP exam, this area appears as "what backend for log analysis, what for metrics," "what's the standard backend for EKS metrics," "unify multiple data sources into one dashboard" tool-selection scenarios.

## Inverted Index — The Data Structure That Made Text Search Possible

OpenSearch (Elasticsearch's fork) has **inverted index** as its heart. A normal (forward) index is "document → words in it," but inverted index flips it: "**word → list of documents containing this word**." The "index" (subject index) in the back of a book is exactly an inverted index — "distributed tracing → pages 152, 203" goes from word to location.

```
Documents:
  doc1: "payment failed for user 789"
  doc2: "payment succeeded"

Inverted index:
  payment   → [doc1, doc2]
  failed    → [doc1]
  user      → [doc1]
  succeeded → [doc2]
```

When searching "which documents contain 'failed'," instead of scanning every document, you look up `failed` in the inverted index and instantly get [doc1]. This is the magic of finding a specific word in hundreds of millions of logs in milliseconds. On top of this data structure, OpenSearch layers analysis (tokenizer, stemming), relevance scoring (TF-IDF/BM25), and aggregations.

> 💡 **Related theory**: The core algorithm determining inverted index search quality is **BM25** (Best Matching 25). Rather than "does word exist," it scores relevance by combining how often a word appears in the document (TF, term frequency) and how rare it is across all documents (IDF, inverse document frequency). Common words ("the", "error") have low IDF and contribute little score, rare words ("OutOfMemoryError") have high IDF and become the search focus. This is classic Information Retrieval (IR) theory that Lucene (Elasticsearch·OpenSearch·Solr's common engine) implements. Why BM25 matters for log search: it **surfaces the rare pattern that's real signal above hundreds of millions of lines of noise**. Search isn't simple matching but relevance ranking — that's the essence.

## OpenSearch — Provisioned and Serverless

Amazon OpenSearch Service is a managed service fork of Elasticsearch (2021, after license disputes). Two forms exist.

**Provisioned**: You choose the cluster (node count, instance type) directly. **Storage tiering** is the key cost reduction — Hot (SSD, recent data), UltraWarm (S3-based, less-viewed data), Cold (archive), moving data down by age. Supports KMS encryption, VPC isolation, **FGAC** (Fine-Grained Access Control, RBAC at index/document/field level), visualized with Kibana (now OpenSearch Dashboards).

**Serverless** (2022+): Cluster management disappears. **OCU** (OpenSearch Compute Unit) hourly billing, indexing and search capacity separated for independent scaling. Operated per Collection, suited to lumpy traffic or small log/search workloads.

```bash
# Ingest logs as daily indices, auto-rotate with ISM
# logs-app-2026.06.02 → 7 days later UltraWarm → 30 days later delete
```

> 🔍 **Going deeper**: The core operational pattern for OpenSearch is **time-based index + ISM (Index State Management)**. Dumping all logs into one giant index makes deleting old data expensive (individual document deletion is costly). Instead, **partition by date** like `logs-app-2026.06.02`, and deleting 30-day-old data is just dropping that date's index — index deletion is cheap like file deletion. ISM automates this lifecycle: "after 7 days → move to UltraWarm, after 30 days → delete." This is the universal time-series data management pattern **rolling indices/partition by time**, same as RDBMS time partitioning, S3 date prefix, Day 1's X-Ray trace time partitioning. The essence: "partition time-series by time so you can throw out old data wholesale."

## TSDB and Prometheus — A Different Engine Specialized for Time-Series

Metrics aren't text. They're streams of (time, label set, number) like `http_requests_total{status="500"} 42`. Putting such data in an inverted index is inefficient — the same metric changes in value every second, recorded millions of times over; a text search engine isn't optimized for this high-frequency numeric time-series. **TSDB** is a separate engine for this.

Prometheus became the de facto metrics standard. Key characteristics:

- **Pull model**: Prometheus periodically **scrapes** each target's `/metrics` endpoint. Applications don't push (opposite of CloudWatch).
- **Label-based dimension model**: `metric{label="value"}` — same cardinality structure as CloudWatch dimensions from Day 1 (Week 10).
- **PromQL**: Query language specialized for time-series aggregation.

```promql
# Requests per second by status
sum(rate(http_requests_total{job="api"}[5m])) by (status)
# p99 latency (quantile from histogram)
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

> 💡 **Related theory**: TSDB being separate comes from time-series data **compression** properties. Time-series has strong regularity: (1) timestamps increase roughly evenly, (2) consecutive values are similar. Facebook's **Gorilla** paper (2015) presented compression exploiting this — timestamps via **delta-of-delta encoding** (store only change in interval, nearly 0 if even), values via **XOR encoding** (XOR with previous value is mostly 0-bits), compressing time-series to ≤10% of original. Prometheus TSDB, InfluxDB, and TimescaleDB all use this family of compression. Inverted index (text's arbitrary search, optimal) and TSDB (regular numeric time-series compression·range scan, optimal) need fundamentally different data structures because data properties differ — why OpenSearch and Prometheus can't merge into one engine.

> ⚠️ **Pitfall**: Prometheus's pull model creates **"Prometheus must reach targets over the network"** constraint. Short-lived jobs (batch, Lambda, serverless) are already dead when Prometheus scrapes, losing metrics. So ephemeral jobs use **Pushgateway** (job pushes metrics there, Prometheus scrapes from there). Also, **cardinality explosion kills Prometheus** — the most common operational incident. Add labels like `user_id` with millions of unique values and time-series explode, memory dies (same high-cardinality trap as CloudWatch, Day 1). Pull/push choice and label cardinality management are Prometheus's two operational cornerstones.

## AMP — Managed Prometheus

Running Prometheus yourself means owning storage, HA, scale. **AMP** (Amazon Managed Service for Prometheus) provides this as managed service.

- Create a Workspace, receive `remote_write` endpoint URL.
- ADOT Collector or Prometheus Agent sends metrics to this endpoint via `remote_write` (Day 3).
- Metrics **retention is 150 days** (extended from shorter past — longer keeping requires external export).
- Query via PromQL, connect data source to AMG.
- Authentication is **SigV4** (IAM signature) — AWS auth layered onto Prometheus ecosystem.

```bash
aws amp create-workspace --alias prod
# → workspace ID + remote_write URL
```

AMP's value is "use PromQL and Prometheus ecosystem as-is, hand cluster operations to AWS." It's the path for organizations standardizing on Prometheus metrics to shed the burden of self-hosting.

## AMG — Unified Glass Pane Across Heterogeneous Backends

Looking at this, observability data scatters — traces in X-Ray, logs in OpenSearch, metrics in AMP/CloudWatch. Viewing each via separate console means no "single pane of glass." **AMG** (Amazon Managed Grafana) binds these fragments into one dashboard.

- **Data sources**: CloudWatch, AMP (PromQL), OpenSearch, X-Ray, Athena, Redshift, Timestream, etc. connect simultaneously to one dashboard.
- **Auth**: IAM Identity Center, SAML for operator SSO.
- **Permissions**: SERVICE_MANAGED mode auto-maps IAM permissions, plugin auto-manages.

```bash
aws grafana create-workspace --account-access-type CURRENT_ACCOUNT \
  --authentication-providers AWS_SSO \
  --permission-type SERVICE_MANAGED \
  --workspace-data-sources PROMETHEUS CLOUDWATCH XRAY OPENSEARCH
```

Grafana's value is being a **backend-neutral visualization layer**. Regardless of where data lives (AWS or on-premises Prometheus), it draws with the same dashboard language. It's the key to multi-cloud organizations having a unified observability screen, also providing Grafana's own alarming (single multi-cloud alarm without AWS dependency).

> 📚 **Case study**: A company ran AWS (EKS) and on-premises Kubernetes together, watching their metrics separately and switching screens during incidents. Deploying AMG, connecting both AWS AMP and on-premises Prometheus as Grafana data sources, they viewed both environments side-by-side in one dashboard — both Prometheus-compatible, same PromQL queries and dashboards reused. Lesson: **sharing a standard (PromQL) integrates even heterogeneous infrastructure into one visualization**. Grafana's value is not data storage but backend-neutral visualization.

## Tool Selection Decision — What to Choose When

| Workload | Recommended combo | Reason |
|----------|-----------|------|
| AWS-native simple | CloudWatch (+ X-Ray) | Integrated, minimal ops burden |
| EKS rich metrics | ADOT + AMP + AMG | Prometheus ecosystem standard |
| Log analysis, full-text search, BI | OpenSearch + Dashboards | Inverted index optimal for text search |
| Multi-cloud | ADOT + Prometheus/AMP + Grafana | Share standard for integration |
| Lowest cost, simple | CloudWatch only | No extra backend to operate |

The core decision branch is data essence — **search arbitrary text** → OpenSearch (inverted index), **aggregate numeric time-series** → Prometheus/AMP (TSDB), **AWS only, keep simple** → CloudWatch, **view multiple backends in one screen** → Grafana/AMG.

> 🎯 **Scenario**: "Collect Pod metrics (Prometheus format) from EKS cluster, query via PromQL, simultaneously do full-text application log search, see all in single dashboard, operators login via company SSO. Design?" — Answer: ADOT + AMP + OpenSearch + AMG combo. ① ADOT Collector (DaemonSet) Prometheus-scrapes Pod `/metrics`, receives traces via OTLP, sends metrics via `remote_write` to AMP (metrics), X-Ray (traces). ② Logs: CloudWatch Logs Subscription → Firehose → OpenSearch for inverted-index full-text search. ③ Create AMG connecting AMP (PromQL metrics), OpenSearch (logs), X-Ray (traces), CloudWatch all as data sources in single dashboard. ④ AMG auth via IAM Identity Center (SSO). Essence: "use optimal backend per data nature (TSDB for metrics, inverted-index for logs), Grafana unifies visualization."

## Log Ingestion Path — CloudWatch Logs to OpenSearch

Standard path for real-time application log ingestion to OpenSearch:

```
App logs → CloudWatch Logs
   │ Subscription Filter
   ▼
 Firehose (buffering·transform·retry)
   ▼
 OpenSearch index (inverted-index searchable)
```

Subscription Filter extracts logs real-time to Firehose, Firehose buffers·batches·retries and ingests to OpenSearch. Fluent Bit/Fluentd paths to OpenSearch directly also exist, but Firehose has lower operational burden and auto-handles retry·backpressure.

## Wrapping Up

Today we covered five things. First, **observability storage choice is a data nature question** — arbitrary text search solved by inverted index (OpenSearch), numeric time-series aggregation solved by TSDB (Prometheus/AMP), fundamentally different engines can't merge. Second, **inverted index is "word→document" + BM25 relevance**, **TSDB is delta-of-delta·XOR compression** — that's why they're separate; can't combine. Third, **OpenSearch uses time-based indices + ISM** for lifecycle management (bulk drop old data), splits into Provisioned (layered storage) / Serverless (OCU). Fourth, **AMP is managed Prometheus** (remote_write·PromQL·SigV4), where pull model·cardinality are operational keys. Fifth, **AMG is backend-neutral visualization layer** unifying heterogeneous data sources in single dashboard, EKS standard stack is ADOT + AMP + AMG.

The next article wraps Week 11 entirely in scenario problems — X-Ray tracing, sampling, ADOT, and today's backend choice woven into real decision-making.

---

## 📝 연습 문제

**문제 1.** "수억 줄 로그에서 특정 에러 메시지가 포함된 문서를 밀리초 안에 찾기"와 "지난 5분 API 에러율 p99 그리기"는 각각 어떤 엔진이 적합한가?

A) 둘 다 CloudWatch

B) 전자는 역인덱스(OpenSearch), 후자는 TSDB(Prometheus/AMP) — 데이터 본질이 달라 다른 엔진

C) 둘 다 OpenSearch

D) 둘 다 Prometheus

**정답: B**

해설: 임의 텍스트에서 특정 문서를 찾는 전문 검색은 "단어→문서" 역인덱스(OpenSearch)에 최적이고, 시간축 위 수치를 집계하는 시계열 쿼리는 압축·범위 스캔에 최적화된 TSDB(Prometheus/AMP)에 적합하다. 두 데이터 특성(임의 텍스트 vs 규칙적 수치 시계열)이 근본적으로 달라 다른 자료구조를 쓰며, 그래서 OpenSearch와 Prometheus가 따로 존재한다. 한 엔진으로 둘 다 최적화할 수 없다.

---

**문제 2.** OpenSearch에서 30일 지난 로그를 비용 효율적으로 삭제하는 표준 패턴은?

A) 거대한 단일 인덱스에서 오래된 문서를 개별 삭제 쿼리로 제거

B) 날짜별 인덱스(`logs-app-2026.06.02`)로 분리하고 ISM으로 오래된 인덱스를 통째로 drop — 인덱스 삭제는 파일 삭제 수준으로 싸다

C) S3로 복사 후 OpenSearch 클러스터를 재생성

D) FGAC로 접근을 막는다

**정답: B**

해설: 개별 문서 삭제는 비싸지만, 로그를 날짜별 인덱스로 분리하면 오래된 데이터 삭제가 그 날짜 인덱스를 통째로 drop하는 것으로 끝나 매우 싸다. ISM(Index State Management)이 "생성 7일 후 UltraWarm, 30일 후 삭제" 같은 생명주기를 자동화한다. 이는 시계열 데이터의 보편 패턴인 시간 파티셔닝(RDBMS 파티션, S3 날짜 prefix, X-Ray trace 시각 파티셔닝과 동일)이다. 개별 삭제(A)는 비효율적이다.

---

**문제 3.** Prometheus의 pull 모델에서 짧게 살다 사라지는 배치 작업·Lambda의 메트릭을 놓치는 문제를 푸는 표준 방법은?

A) FixedRate 샘플링

B) Pushgateway — 단명 작업이 메트릭을 push해두면 Prometheus가 거기서 scrape

C) UltraWarm

D) BM25

**정답: B**

해설: Prometheus는 타깃의 `/metrics`를 주기적으로 scrape하는 pull 모델이라, scrape하러 갔을 때 이미 죽은 단명 작업(배치·Lambda)의 메트릭을 놓친다. Pushgateway는 단명 작업이 종료 전 메트릭을 push해두는 중간 저장소로, Prometheus가 Pushgateway를 scrape해 메트릭을 회수한다. 이것이 pull 모델에서 단명 워크로드를 다루는 표준 우회다. 샘플링(A)·UltraWarm(C)·BM25(D)는 무관하다.

---

**문제 4.** Prometheus/AMP를 죽이는 가장 흔한 운영 사고는?

A) 디스크 부족

B) 카디널리티 폭발 — `user_id`처럼 고유값이 수백만인 레이블을 넣으면 시계열이 폭발해 메모리가 터진다

C) PromQL 문법 오류

D) SigV4 인증 만료

**정답: B**

해설: Prometheus는 `metric{label=value}`의 고유 레이블 조합마다 별도 시계열을 만든다. `user_id`처럼 카디널리티가 수백만인 레이블을 넣으면 시계열이 폭발해 메모리가 고갈되고 Prometheus가 죽는다. 이는 Day 1(Week 10)에서 본 CloudWatch high-cardinality 함정과 동일한 원리다 — 차원/레이블이 곧 시계열 수이자 자원 소비다. 고카디널리티 식별자는 레이블이 아니라 로그(역인덱스)로 보내야 한다. 레이블 카디널리티 관리가 Prometheus 운영의 핵심이다.

---

**문제 5.** AWS(EKS)와 온프레미스 Kubernetes의 메트릭을 하나의 대시보드에서 나란히 보려 한다. 이를 가능하게 한 핵심은?

A) 두 환경을 같은 VPC로 합친다

B) 양쪽 모두 Prometheus 호환(AWS는 AMP, 온프레미스는 자체 Prometheus)이라 AMG에 둘 다 데이터 소스로 연결하고 같은 PromQL·대시보드를 재사용

C) 온프레미스를 AWS로 마이그레이션

D) CloudWatch로 통합

**정답: B**

해설: Grafana(AMG)의 가치는 백엔드 중립 시각화 계층이라는 점이다. AWS 쪽 AMP와 온프레미스 자체 Prometheus를 둘 다 Grafana 데이터 소스로 연결하면, 둘 다 Prometheus 호환이라 같은 PromQL 쿼리·같은 대시보드를 양쪽에 재사용해 하나의 화면에서 나란히 본다. 표준(PromQL)을 공유하면 이질적 인프라도 단일 시각화로 통합된다. VPC 합병(A)·마이그레이션(C)은 불필요하게 과하다.

---

**문제 6.** OpenSearch의 BM25가 로그 검색에서 의미 있는 이유는?

A) 데이터를 압축한다

B) 단어 빈도(TF)와 희귀도(IDF)를 결합해 관련도를 점수화 — 흔한 노이즈("error", "the")보다 희귀한 신호("OutOfMemoryError")를 위로 끌어올린다

C) 시계열을 집계한다

D) 인덱스를 자동 삭제한다

**정답: B**

해설: BM25는 정보 검색의 관련도 순위 알고리즘으로, 단어가 문서에 자주 나오는지(TF)와 전체 문서 중 얼마나 희귀한지(IDF)를 결합해 점수를 매긴다. 흔한 단어는 IDF가 낮아 기여가 작고, 희귀한 단어는 IDF가 높아 검색의 핵심이 된다. 로그 검색에서 이는 수억 줄 중 진짜 신호가 되는 희귀 패턴을 노이즈 위로 끌어올린다 — 검색은 단순 매칭이 아니라 관련도 순위화다. 압축(A)·시계열 집계(C)는 TSDB의 영역이다.

---

**문제 7.** OpenSearch Serverless와 Provisioned의 핵심 차이는?

A) Serverless는 검색이 불가능

B) Provisioned는 클러스터(노드·인스턴스)를 직접 관리하고 스토리지 계층화(Hot/UltraWarm/Cold)가 가능, Serverless는 OCU 시간 과금으로 클러스터 관리가 없고 indexing/search 용량이 분리 스케일

C) Serverless가 항상 더 비싸다

D) Provisioned는 VPC를 못 쓴다

**정답: B**

해설: Provisioned는 노드 수·인스턴스 타입을 직접 정하고 Hot/UltraWarm/Cold 스토리지 계층화로 비용을 최적화한다. Serverless는 클러스터 관리가 사라지고 OCU(OpenSearch Compute Unit) 시간당 과금이며 indexing과 search 용량이 분리되어 독립 스케일한다. 트래픽이 들쭉날쭉하거나 작은 워크로드엔 Serverless, 큰 안정 워크로드와 세밀한 스토리지 제어엔 Provisioned가 맞는다. Serverless도 검색 가능(A 틀림)하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 옵저버빌리티 저장소 선택은 데이터 본질의 문제로, 임의 텍스트 검색은 역인덱스(OpenSearch), 수치 시계열 집계는 TSDB(Prometheus/AMP)라는 근본적으로 다른 엔진이 푼다. 둘째, 역인덱스는 "단어→문서" 구조와 BM25(TF-IDF) 관련도로 텍스트 검색을, TSDB는 delta-of-delta·XOR 압축(Gorilla)으로 고빈도 시계열을 처리해 합칠 수 없다. 셋째, OpenSearch는 날짜별 인덱스 + ISM으로 오래된 데이터를 통째로 drop해 생명주기를 관리하며 Provisioned(계층 스토리지)/Serverless(OCU)로 나뉜다. 넷째, AMP는 관리형 Prometheus(remote_write·PromQL·SigV4·보존 확장)이고 pull 모델의 단명 작업은 Pushgateway로, 카디널리티 폭발이 최대 운영 사고다. 다섯째, AMG는 백엔드 중립 시각화 계층으로 이질적 데이터 소스(AMP·OpenSearch·X-Ray·CloudWatch)를 단일 대시보드로 통합하고 PromQL 표준 공유로 멀티 클라우드도 묶으며, EKS 관찰성 표준 스택은 ADOT + AMP + AMG다.
