# Day 4 - Lake Formation, Data Governance, MSK: Fine-Grained Permissions and Real-Time Streams Under the Hood

When a data lake spreads across an organization, two problems immediately surface. First is permissions. When all data is collected into S3, the sales team must not see PII columns, the Korean branch must see only Korean region rows, and if you start manually managing permissions for every new table, governance collapses. Second is real-time ingestion. When you must handle "data streaming in by the second" instead of batch loading once daily, which streaming platform and how you operate it determines the architecture.

In SAP-C02 exams, this domain is tested with "row·column·cell-level permissions that cannot be solved with S3 bucket policies and IAM alone," "cross-account patterns where multiple AWS accounts share a single data lake," "stream platform selection when Kafka standards are required," and "minimizing operational burden for streams at tens of thousands of TPS." Today we decompose from first principles how Lake Formation's permission model differs from IAM and how MSK wraps Kafka as a managed service.

## Why IAM and Bucket Policies Alone Are Not Enough — The Granularity Problem

Governing data lake permissions with only IAM and S3 bucket policies quickly hits a wall. IAM policies express "this role can access this bucket/object" down to the **object level** at best. But analytical permissions demand "show this column of this table except PII columns, and only rows where region='KR'" — **row·column·cell level within the table**. Since one S3 file (Parquet) contains all columns and rows interleaved, file-level permissions cannot achieve this granularity.

**AWS Lake Formation** bridges this gap. A separate permission layer built atop Glue Data Catalog that grants permissions not just at database and table level but down to **column, row filter, and cell** level. When a user queries via Athena, Redshift Spectrum, or EMR, that engine asks Lake Formation "what can this principal see in this table" and returns only allowed columns and filters to allowed rows. If IAM says "can you open the door," Lake Formation determines "which drawers in the room can you see."

> 💡 **Related Theory**: Row-level and column-level permissions are data lake implementations of the classic database security topics **Row-Level Security (RLS)** and **Column-Level Security (CLS)**. Traditional RDBMs (PostgreSQL's RLS policies, Oracle VPD) attach security predicates to tables, automatically injecting "WHERE tenant_id = current_user" into a user's query to filter rows. Lake Formation implements the same concept at the catalog metadata layer, showing different rows and columns per user without replicating physical files or creating separate views. In SAP exams, "exclude only PII columns / show only specific region rows" points to Lake Formation CLS·RLS (data filters).

## LF Tag — Scaling Permissions with ABAC

When tables number in thousands and columns in tens of thousands, granting permissions one-by-one becomes impossible. **LF Tag (Lake Formation Tag)-based access control (LF-TBAC)** solves this scale problem. Tag data with labels (e.g., `classification=PII`, `sensitivity=high`, `domain=finance`), and give users/roles "tag value access permissions." Then **when a new table or column is added, just tag it and the right permissions automatically apply** — no need to revisit permissions.

> 💡 **Related Theory**: LF Tag falls on the ABAC side of the **RBAC vs ABAC** debate in access control models. RBAC (Role-Based) "bundles permissions into roles and assigns roles to users," but role-permission matrices explode as resources grow (role explosion). ABAC (Attribute-Based Access Control) "dynamically judges permissions using attributes of principals, resources, and environments." NIST's SP 800-162 defines the ABAC model as the standard foundation. LF Tag assigns classification attributes to resources and attribute-matching permissions to principals, so policies grow only linearly even as resources multiply. In exams, "automatic permissions for new tables / minimize operational burden / large scale" points to LF Tag (ABAC).

> ⚠️ **Pitfall**: Turning on Lake Formation does not immediately nullify existing IAM permissions. **LF Hybrid Access Mode** exists, so IAM and Lake Formation permissions coexist for a time. During migration when both exist in parallel, confusion can arise: "I clearly blocked this in LF, yet it still accesses via the IAM path." During gradual transition, always confirm which path prevails (whether IAM allow remains active). In exams, "gradually migrating an existing IAM-based lake to LF" requires awareness of Hybrid Mode.

## Cross-Account Data Lake — RAM + Lake Formation

Large enterprises typically centralize data in one account (Producer) and share it across multiple accounts (Consumers: departments, subsidiaries). Two mechanisms work together here. **AWS RAM (Resource Access Manager)** **shares** Producer's Glue Catalog resources (databases, tables) with Consumer accounts, and **Lake Formation** applies fine-grained column·row permissions on top. Analysts in Consumer accounts query with their account's Athena/Redshift but see only columns and rows that Producer permits via LF.

```
[Producer Account]
  Glue Catalog ── RAM Share ──► [Consumer Account]
                                     │
                              Lake Formation Permissions
                              ├─ Column Filter (Exclude PII columns)
                              └─ Row Filter (Only region='KR' rows)
                                     │
                              Athena / Redshift Spectrum Query
```

> 🔍 **Deeper Dive**: This pattern connects with **AWS Organizations and multi-account strategy** (a SAP core topic). Placing a central data lake in a separate data account and having departmental accounts share only needed data via RAM+LF ("isolate blast radius with account boundaries while data stays centrally governed") is the foundation of multi-account data mesh. The combination of Control Tower provisioning accounts, SCP establishing guardrails, and Lake Formation managing data permissions centrally is enterprise data governance best practice. In exams, "multiple accounts share a central lake + fine-grained row·column permissions" points to RAM + Lake Formation.

## AWS DataZone and Glue Data Quality — Two Pillars of Governance

Where Lake Formation answers "who can see what (permissions)," **DataZone** answers "how data is discovered·subscribed·managed (data catalog experience)." DataZone catalogs data by business domain and separates data producer (publishes data) and consumer (searches, requests access) experiences. Think of it as an "internal data marketplace" — analysts search for needed datasets and request subscription; after approval workflow, access is granted. Internally it integrates with Lake Formation, Glue, Redshift, and S3, so subscription approval in DataZone translates to actual LF permission grants.

**Glue Data Quality** ensures data accuracy. Define quality rules on Glue Catalog tables using **DQDL (Data Quality Definition Language)** (e.g., "this column null < 5%", "must be email format", "value in range 0–100"), check periodically/automatically, and alert via EventBridge on violations. ML can even recommend rules. It prevents incorrect data flowing downstream to corrupt analysis and decisions.

> 💡 **Related Theory**: Data quality and lineage are cornerstones of **data governance**. Lineage tracks "where this metric originated, what transformations it underwent" — essential for debugging wrong numbers or regulatory audits (GDPR data processing traceability, financial data provenance). Industry standards like **OpenLineage** (lineage metadata collection standard) and its implementation **Marquez** exist; AWS bakes lineage into Glue and DataZone. Treating data quality as a pipeline gate (blocking downstream on validation failure) is a fundamental anti-pattern avoidance in data engineering: preventing "garbage in, garbage out."

## MSK — Apache Kafka Managed

Now we shift to real-time streams. **Amazon MSK (Managed Streaming for Apache Kafka)** is the managed version of Apache Kafka. Understanding Kafka itself comes first. Kafka, created at LinkedIn in 2011, is a distributed streaming platform with a core model:

- **Topic**: Logical channel of messages (events). Units like "order events", "click stream."
- **Partition**: Physical subdivision of a topic. Unit of parallelism and order — **within one partition, message order is guaranteed**, but across partitions it is not. Number of partitions equals the maximum number of parallel consumers.
- **Broker**: Server storing and serving partitions (EC2 in MSK). Multiple brokers own and replicate partitions.
- **Consumer Group**: Multiple consumers form a group to split reading partitions and scale throughput horizontally. One partition per group is read by only one consumer.
- **Offset**: Each consumer's position of "how far we've read." Consumers manage offsets themselves, so replay and rewind are flexible.

Kafka's defining trait is **log-based storage**. Messages, once consumed, are not immediately deleted; they remain on disk for a retention period. This lets multiple consumer groups read the same stream independently multiple times (pub/sub + replay), and new consumers can re-read past data from the beginning. This makes Kafka not just a message queue but the "source of truth of events."

> 💡 **Related Theory**: Kafka's design philosophy centers on Jay Kreps' **"The Log"** concept — if all system state changes are expressed as an ordered immutable log (append-only log), replaying that log can restore any point-in-time state and synchronize multiple systems. This shares roots with database WAL (Write-Ahead Log), event sourcing, and CDC (Change Data Capture). From CAP theorem perspective, Kafka balances consistency and availability through partition order and replication (tunable with acks, ISR). This "immutable log + offset replay" model is the common foundation of streaming architectures (including Day 42's Zero-ETL CDC).

> 🔍 **Deeper Dive**: MSK authentication/authorization has three forms. **IAM** (AWS native, policy-based topic access control), **SASL/SCRAM** (username/password, Secrets Manager integration), **mTLS** (mutual TLS certificates). Also, traditional Kafka relied on **ZooKeeper** for metadata and leader election, a source of operational complexity and scaling limits. Kafka evolves toward **KRaft (Raft consensus)** to remove ZooKeeper, and MSK follows suit. Raft is a distributed consensus algorithm that elects leaders and replicates logs to maintain consistent metadata despite node failures. While exam questions don't directly ask KRaft details, understanding "ZooKeeper operational burden" reduction is valuable context.

## MSK Serverless and MSK Connect

**MSK Serverless** (2022) eliminates cluster sizing (broker count, partition capacity planning). Create a topic, send data, and MSK auto-scales to match throughput. Suits workloads where capacity planning is hard or load varies, or you want to avoid cluster operations.

**MSK Connect** provides Kafka Connect (connector framework) as managed. Connect source/sink connectors link external systems to Kafka without code. A prime example is **Debezium connector**, which reads database change logs (binlog/WAL) and streams CDC events to Kafka. This is the standard pattern turning all changes in an operational DB into a real-time stream.

> ⚠️ **Pitfall**: MSK Serverless is not a complete superset of standard MSK. Per-topic and per-cluster throughput limits exist; some Kafka features and configurations are restricted; very high throughput or fine-tuned broker optimization may require provisioned MSK for more flexibility. In exams, "sizing-free / variable load / operational avoidance" points to Serverless; "ultra-high throughput / fine tuning / specific Kafka feature" points to provisioned.

## MSK vs Kinesis Data Streams — Portability vs Simplicity

The most frequent choice for real-time streams is between MSK and Kinesis Data Streams.

| Aspect | MSK | Kinesis Data Streams |
|--------|-----|---------------------|
| Foundation | Apache Kafka (OSS standard) | AWS proprietary |
| Portability | Excellent (migrate to on-prem/other cloud Kafka) | AWS-locked |
| Operations | Provisioned has some user responsibility (partition, broker), Serverless is managed | Fully managed |
| Scaling Unit | Partition | Shard (or On-Demand auto-scale) |
| Ecosystem | Vast Kafka connectors, tools, community | Deep AWS service integration (Firehose, Lambda, Analytics) |
| Best Fit | Existing Kafka assets, standards, complex topic topology, portability | Simple, fast start, AWS-native integration |

Decision criterion: **If you already use Kafka, need multi-cloud portability, or require vast Kafka ecosystem (connectors, stream processing), choose MSK**. **If you want quick start, simple AWS service integration (Firehose→S3, Lambda triggers), pick Kinesis**. In exams, "Kafka standard / portability / existing Kafka migration" points to MSK; "simple / AWS-native / fast start" points to Kinesis.

> 📚 **Example**: Many companies migrating self-managed Kafka from on-premises to AWS choose MSK. Their own Kafka required dedicated engineers for broker patching, ZooKeeper operations, disk management, scaling; MSK moves broker provisioning, patching, replication, monitoring to AWS, dramatically reducing operational burden. The decisive advantage: **application code barely changes**. Kafka APIs remain the same, so producer/consumer code and existing connectors (like Debezium) reuse as-is. A Kinesis migration would require rewriting SDK, partitioning model, consumption logic — a complete rewrite. This is why "existing Kafka assets → MSK" is the exam answer.

## Comparison with Other Clouds

| Role | AWS | GCP | Azure |
|------|-----|-----|-------|
| Managed Kafka | MSK | (Confluent partner) Managed Kafka | Event Hubs (Kafka-compatible API) |
| Proprietary Stream | Kinesis Data Streams | Pub/Sub | Event Hubs |
| Data Lake Permissions | Lake Formation | Dataplex / BigLake | Purview + RBAC |
| Data Governance Catalog | DataZone / Glue Catalog | Dataplex / Data Catalog | Purview |

Notably, Azure Event Hubs offers a Kafka-compatible API — as Kafka protocol became the de facto industry standard for streaming, each cloud emphasizes "Kafka-compatible" to ease portability concerns. This is why standards-based MSK excels in portability fundamentally.

## Summary

Data lake governance transcends IAM and bucket policy **object-level** access to demand **row·column·cell-level permissions**, answered by **Lake Formation** overlaid on Glue Catalog. LF Tag (ABAC) auto-applies permissions to new resources just by tagging, handling massive scale where policies grow linearly. **RAM + Lake Formation** enable multi-account data lake cross-account sharing. DataZone (data marketplace) and Glue Data Quality (DQDL rules) complete governance. For real-time streams, **MSK** wraps Kafka (immutable log, partitions, offsets, consumer groups) as managed, offering portability and ecosystem; **Kinesis** offers simplicity and AWS-native integration.

SAP exam frequent mappings: (1) "Exclude PII columns / specific rows only" → Lake Formation CLS·RLS (data filters), (2) "Auto permissions for new tables / massive scale" → LF Tag (ABAC), (3) "Multiple accounts share central lake + fine-grained permissions" → RAM + Lake Formation, (4) "Gradually migrate existing IAM lake" → LF Hybrid Mode, (5) "Data quality rules auto-check" → Glue Data Quality (DQDL), (6) "In-house data search·subscription marketplace" → DataZone, (7) "Kafka standard / portability / existing Kafka migration" → MSK, (8) "Kafka sizing-free" → MSK Serverless, (9) "Simple, AWS-native stream" → Kinesis. Next day, we review Week 9 comprehensively via synthesis scenarios.

---

## 📝 Practice Questions

**Question 1.** In one table of an S3 data lake, you want to show the analyst group all columns except the PII columns (Korean resident registration number, email). S3 bucket policies and IAM alone cannot control at the column level. What is the most appropriate choice?

A) Restrict object access with an S3 bucket policy
B) Lake Formation column-level permissions (Column-Level Security)
C) Encrypt columns with KMS
D) Separate the PII columns into another bucket and block them with IAM

**Answer: B**

Explanation: Because all columns are mixed in a single Parquet file, S3 bucket policies and IAM (object level) cannot grant column-level permissions. Lake Formation grants column-level permissions on top of the Glue Catalog, so even when the same table is queried, only the permitted columns are returned (CLS). A and D are at the object/bucket level and do not achieve column granularity, and D also separates and duplicates data, which is a heavy management burden. C (KMS) is just encryption, not column-level exposure control.

---

**Question 2.** Dozens of new tables are added to the data lake every week. The operational burden of manually granting permissions each time a table is added is growing. How can you make the appropriate permissions apply to new tables automatically?

A) Manually add an IAM policy for each table
B) Lake Formation LF Tag (tag-based access control)
C) S3 object tags
D) Run a permission script with a Glue Trigger

**Answer: B**

Explanation: LF Tag is ABAC (attribute-based access control): you attach a classification tag to data (for example, classification=PII) and grant tag permissions to users/roles, and the moment a new table or column receives that tag, the permission applies automatically. It scales because policies need not be revisited as resources grow. A leaves the manual burden unchanged. C (S3 tags) is unrelated to the Lake Formation permission mechanism. D requires writing and maintaining scripts yourself and has none of the benefits of managed ABAC.

---

**Question 3.** Multiple department accounts (Consumers) must share the Glue Catalog data in a central data account (Producer). At the same time, each department must see only its own region's rows and the PII columns must be excluded. What is the most appropriate configuration?

A) Consumers AssumeRole into the Producer's IAM Role
B) Share the Glue Catalog with RAM + fine-grained row and column permissions with Lake Formation
C) Replicate the data into each Consumer account with COPY
D) S3 cross-account bucket policy

**Answer: B**

Explanation: RAM (Resource Access Manager) shares the Producer's Glue Catalog resources with the Consumer accounts, and Lake Formation applies column filters (excluding PII) and row filters (per region) on top. Consumers query with their own account's Athena/Redshift but see only the rows and columns that LF permits. A is a broad role delegation that does not allow fine-grained permissions, C adds the burden of data replication and synchronization and scatters governance, and D (bucket policy) does not achieve row or column granularity. "Multi-account + central lake + fine-grained permissions" is RAM + Lake Formation.

---

**Question 4.** You want to move an Apache Kafka cluster that you operated yourself on premises to AWS. You want to reuse the existing producer and consumer application code and the Debezium connector almost as is, while reducing the broker operations burden. What is the most appropriate choice?

A) Migrate to Kinesis Data Streams
B) Amazon MSK
C) SQS
D) Amazon MQ

**Answer: B**

Explanation: MSK provides Apache Kafka as a managed service, so the Kafka API stays the same, letting you reuse existing producer and consumer code and connectors (such as Debezium) with almost no changes, while AWS takes on broker provisioning, patching, replication, and monitoring, reducing the operations burden. A (Kinesis) is an AWS-proprietary technology, so the SDK, partitioning, and consumption model would all have to be rewritten. C (SQS) is a message queue with a different stream replay and consumer group model. D (MQ) is managed ActiveMQ/RabbitMQ and is not Kafka. "Reusing existing Kafka assets + lower operations burden" is MSK.

---

**Question 5.** You want to use Kafka but do not want to do cluster sizing such as planning the number of brokers and partition capacity, and you want it to scale automatically with throughput. What is the most appropriate choice?

A) Configure a large provisioned MSK cluster
B) MSK Serverless
C) Kinesis Data Streams provisioned mode
D) Build your own Kafka on EC2

**Answer: B**

Explanation: MSK Serverless lets you create topics and send data without planning broker counts or partition capacity, and it scales automatically with throughput. It is optimal for workloads where sizing is difficult or variable and for avoiding cluster operations. A requires you to do sizing yourself. C is not Kafka, and provisioned mode needs shard planning. D has the largest operational burden. However, also remember the limitation that provisioned MSK is more flexible when ultra-high throughput or fine-grained tuning is needed.

---

**Question 6.** For a table in the Glue Data Catalog, you want to define quality rules such as "this column must have under 5% NULLs and be in email format," have them checked automatically on a regular schedule, and be notified of violations. What is the most appropriate choice?

A) Check manually with WHERE in Athena
B) Glue Data Quality(DQDL)
C) Run a DataBrew profile just once
D) Write your own validation code with Lambda

**Answer: B**

Explanation: Glue Data Quality declares quality rules on catalog tables using DQDL (Data Quality Definition Language), checks them periodically and automatically, and notifies through EventBridge on violations (it also supports ML-based rule recommendations). A is manual and one-off. C (DataBrew profile) is statistical profiling, not a continuous rule validation and notification system. D requires writing and maintaining the code yourself and has none of the benefits of a managed quality framework.

---

**Question 7.** A large organization wants a "data marketplace" experience in which analysts search for the datasets they need within the company and request subscriptions, and access is granted after an approval workflow. It must separate the producer/consumer experiences and integrate with Lake Formation and Redshift. What is the most appropriate choice?

A) Lake Formation alone
B) AWS DataZone
C) Glue Crawler
D) QuickSight dashboards

**Answer: B**

Explanation: DataZone is a governance service that provides a business-domain-level data catalog, search, subscription, and approval workflows; it separates the data producer (publishing) and consumer (search and subscription) experiences and integrates with Lake Formation, Glue, Redshift, and S3. Subscription approval leads to actual LF permission grants. A (Lake Formation) is a permission mechanism, not a search and subscription marketplace experience. C is a schema inference tool. D is BI visualization, so its purpose is different.

---

## 📌 Today's Summary

1. **Granularity Problem** — IAM and bucket policies to object level. Rows, columns, cells require Lake Formation (permission layer above Glue Catalog)
2. **RLS/CLS** — Lake Formation implements row filters and column filters at catalog layer. Different rows/columns per user without data replication or views
3. **LF Tag (ABAC)** — Tag-based auto-applied permissions; new resources just need tagging. NIST SP 800-162 ABAC. Massive scale
4. **Cross-Account** — RAM (catalog share) + Lake Formation (fine-grained permissions). Foundation of multi-account data mesh
5. **Governance** — DataZone (data marketplace, subscription), Glue Data Quality (DQDL rules, auto-check, alerts), lineage (OpenLineage)
6. **Kafka Model** — Topic, Partition (order/parallelism unit), Broker, Consumer Group, Offset. Immutable log + offset replay
7. **MSK** — Kafka managed. IAM/SASL-SCRAM/mTLS authentication. ZooKeeper → KRaft (Raft consensus)
8. **MSK Serverless/Connect** — Serverless sizing-free, Kafka Connect managed (Debezium CDC)
9. **MSK vs Kinesis** — Kafka standard, portability, ecosystem vs simplicity, AWS-native. "Existing Kafka" → MSK
