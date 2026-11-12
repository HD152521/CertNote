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

## 📝 Practice Questions

**Question 1.** Which engine suits each of these: "finding a document containing a specific error message among hundreds of millions of log lines within milliseconds" and "plotting the p99 API error rate over the last 5 minutes"?

A) CloudWatch for both

B) The former suits an inverted index (OpenSearch), the latter a TSDB (Prometheus/AMP) — the data is fundamentally different, so the engines differ

C) OpenSearch for both

D) Prometheus for both

**Answer: B**

Explanation: Full-text search, which finds a specific document in arbitrary text, is best served by a "word → document" inverted index (OpenSearch), while time-series queries that aggregate numeric values along the time axis suit a TSDB (Prometheus/AMP) optimized for compression and range scans. The two data characteristics (arbitrary text vs regular numeric time series) are fundamentally different and use different data structures, which is why OpenSearch and Prometheus exist separately. One engine cannot be optimized for both.

---

**Question 2.** What is the standard pattern for cost-efficiently deleting logs older than 30 days in OpenSearch?

A) Remove old documents from one huge single index with individual delete queries

B) Split into daily indexes (`logs-app-2026.06.02`) and drop old indexes whole with ISM — deleting an index is as cheap as deleting a file

C) Copy to S3 and then recreate the OpenSearch cluster

D) Block access with FGAC

**Answer: B**

Explanation: Deleting individual documents is expensive, but if logs are split into daily indexes, deleting old data is done simply by dropping that day's index whole, which is very cheap. ISM (Index State Management) automates lifecycles such as "move to UltraWarm 7 days after creation, delete after 30 days." This is time partitioning, a universal pattern for time-series data (the same as RDBMS partitions, S3 date prefixes, and X-Ray's time-based trace partitioning). Individual deletion (A) is inefficient.

---

**Question 3.** What is the standard way to solve the problem in Prometheus's pull model of missing metrics from short-lived batch jobs and Lambda functions that disappear quickly?

A) FixedRate sampling

B) Pushgateway — short-lived jobs push their metrics there, and Prometheus scrapes from it

C) UltraWarm

D) BM25

**Answer: B**

Explanation: Prometheus uses a pull model that periodically scrapes the target's `/metrics`, so it misses the metrics of short-lived jobs (batch, Lambda) that are already dead by the time it comes to scrape. The Pushgateway is an intermediate store where short-lived jobs push their metrics before terminating, and Prometheus scrapes the Pushgateway to retrieve them. This is the standard workaround for handling short-lived workloads in the pull model. Sampling (A), UltraWarm (C), and BM25 (D) are unrelated.

---

**Question 4.** What is the most common operational incident that kills Prometheus/AMP?

A) Running out of disk

B) Cardinality explosion — adding a label with millions of unique values such as `user_id` explodes the time series and exhausts memory

C) PromQL syntax errors

D) SigV4 authentication expiry

**Answer: B**

Explanation: Prometheus creates a separate time series for every unique label combination of `metric{label=value}`. Adding a label with millions of distinct values such as `user_id` explodes the number of time series, exhausts memory, and kills Prometheus. This is the same principle as the CloudWatch high-cardinality trap seen on Day 1 (Week 10) — dimensions/labels are the number of time series and therefore resource consumption. High-cardinality identifiers should be sent to logs (an inverted index), not to labels. Managing label cardinality is the core of Prometheus operations.

---

**Question 5.** You want to view metrics from AWS (EKS) and on-premises Kubernetes side by side on a single dashboard. What is the key that makes this possible?

A) Merge the two environments into the same VPC

B) Both sides are Prometheus-compatible (AMP on AWS, a self-managed Prometheus on-premises), so connect both as data sources in AMG and reuse the same PromQL and dashboards

C) Migrate on-premises to AWS

D) Consolidate with CloudWatch

**Answer: B**

Explanation: The value of Grafana (AMG) is that it is a backend-neutral visualization layer. If both AMP on the AWS side and the self-managed Prometheus on-premises are connected as Grafana data sources, both are Prometheus-compatible, so the same PromQL queries and the same dashboards can be reused on both sides and viewed side by side on a single screen. Sharing a standard (PromQL) lets even heterogeneous infrastructure be unified into a single visualization. Merging VPCs (A) and migrating (C) are unnecessarily excessive.

---

**Question 6.** Why is OpenSearch's BM25 meaningful for log search?

A) It compresses the data

B) It scores relevance by combining term frequency (TF) and rarity (IDF) — lifting rare signals ("OutOfMemoryError") above common noise ("error", "the")

C) It aggregates time series

D) It deletes indexes automatically

**Answer: B**

Explanation: BM25 is a relevance-ranking algorithm from information retrieval that scores by combining how often a term appears in a document (TF) with how rare it is across all documents (IDF). Common words have a low IDF and contribute little, while rare words have a high IDF and become the key to the search. In log search, this lifts the rare patterns that are the real signal among hundreds of millions of lines above the noise — search is not simple matching but relevance ranking. Compression (A) and time-series aggregation (C) are the domain of a TSDB.

---

**Question 7.** What is the key difference between OpenSearch Serverless and Provisioned?

A) Serverless cannot perform searches

B) Provisioned requires you to manage the cluster (nodes/instances) yourself and supports storage tiering (Hot/UltraWarm/Cold), whereas Serverless is billed by OCU-hours, has no cluster management, and scales indexing and search capacity separately

C) Serverless is always more expensive

D) Provisioned cannot use a VPC

**Answer: B**

Explanation: With Provisioned, you choose the number of nodes and instance types yourself and optimize cost with Hot/UltraWarm/Cold storage tiering. With Serverless, cluster management disappears, billing is per OCU (OpenSearch Compute Unit) hour, and indexing and search capacity are separated and scale independently. Serverless suits spiky traffic or small workloads, while Provisioned suits large, stable workloads and fine-grained storage control. Serverless can also perform searches (A is wrong).

---

## 📌 Today's Summary

There are five key takeaways today. First, choosing observability storage is a question of the nature of the data: arbitrary text search is solved by an inverted index (OpenSearch), and numeric time-series aggregation by a TSDB (Prometheus/AMP) — fundamentally different engines. Second, an inverted index handles text search with a "word → document" structure and BM25 (TF-IDF) relevance, while a TSDB handles high-frequency time series with delta-of-delta and XOR compression (Gorilla), so the two cannot be merged. Third, OpenSearch manages lifecycles with daily indexes + ISM that drop old data whole, and comes as Provisioned (tiered storage) or Serverless (OCU). Fourth, AMP is managed Prometheus (remote_write, PromQL, SigV4, extended retention); short-lived jobs in the pull model go through the Pushgateway, and cardinality explosion is the biggest operational incident. Fifth, AMG is a backend-neutral visualization layer that unifies heterogeneous data sources (AMP, OpenSearch, X-Ray, CloudWatch) into a single dashboard and ties multi-cloud together through the shared PromQL standard, and the standard EKS observability stack is ADOT + AMP + AMG.
