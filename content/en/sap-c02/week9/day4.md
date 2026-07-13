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

## 📝 연습 문제

**문제 1.** S3 데이터 레이크의 한 테이블에서, 분석가 그룹에게는 PII 컬럼(주민번호·이메일)을 제외한 나머지 컬럼만 보여주고 싶다. S3 버킷 정책과 IAM만으로는 컬럼 단위 통제가 안 된다. 가장 적합한 것은?

A) S3 버킷 정책으로 객체 접근 제한
B) Lake Formation 컬럼 수준 권한(Column-Level Security)
C) KMS로 컬럼 암호화
D) PII 컬럼을 별도 버킷으로 분리하고 IAM으로 차단

**정답: B**

해설: 한 Parquet 파일에 모든 컬럼이 섞여 있으므로 S3 버킷 정책·IAM(객체 수준)으로는 컬럼 단위 권한을 낼 수 없다. Lake Formation은 Glue Catalog 위에서 컬럼 단위 권한을 부여해, 같은 테이블을 질의해도 허용된 컬럼만 반환한다(CLS). A·D는 객체/버킷 수준이라 컬럼 입도가 안 나오고, D는 데이터를 분리·복제해 관리 부담이 큼. C(KMS)는 암호화일 뿐 컬럼 단위 노출 제어가 아니다.

---

**문제 2.** 데이터 레이크에 매주 새 테이블이 수십 개씩 추가된다. 테이블이 추가될 때마다 수동으로 권한을 부여하는 운영 부담이 커지고 있다. 새 테이블에 자동으로 알맞은 권한이 적용되게 하려면?

A) 테이블마다 IAM 정책을 수동으로 추가
B) Lake Formation LF Tag(태그 기반 접근 제어)
C) S3 객체 태그
D) Glue Trigger로 권한 스크립트 실행

**정답: B**

해설: LF Tag는 ABAC(속성 기반 접근 제어)로, 데이터에 분류 태그(예: classification=PII)를 붙이고 사용자/역할에 태그 권한을 주면, 새 테이블·컬럼이 해당 태그를 받는 순간 권한이 자동 적용된다. 자원이 늘어도 정책을 다시 손볼 필요가 없어 스케일링된다. A는 수동 부담이 그대로. C(S3 태그)는 Lake Formation 권한 메커니즘과 무관. D는 직접 스크립트를 짜고 유지해야 해 관리형 ABAC의 이점이 없다.

---

**문제 3.** 중앙 데이터 계정(Producer)의 Glue Catalog 데이터를 여러 부서 계정(Consumer)이 공유해야 한다. 동시에 각 부서는 자기 region 행만 보고 PII 컬럼은 제외돼야 한다. 가장 적합한 구성은?

A) Producer의 IAM Role을 Consumer가 AssumeRole
B) RAM으로 Glue Catalog 공유 + Lake Formation으로 행·열 세분 권한
C) 각 Consumer 계정에 데이터를 COPY로 복제
D) S3 Cross-Account 버킷 정책

**정답: B**

해설: RAM(Resource Access Manager)이 Producer의 Glue Catalog 리소스를 Consumer 계정에 공유하고, 그 위에 Lake Formation이 컬럼 필터(PII 제외)와 행 필터(region별)를 건다. Consumer는 자기 계정의 Athena/Redshift로 질의하되 LF가 허용한 행·열만 본다. A는 광범위한 역할 위임이라 세분 권한이 안 되고, C는 데이터 복제·동기화 부담과 거버넌스 분산, D(버킷 정책)는 행·열 입도가 안 나온다. "멀티 계정 + 중앙 레이크 + 세분 권한"은 RAM + Lake Formation.

---

**문제 4.** 온프레미스에서 자체 운영하던 Apache Kafka 클러스터를 AWS로 옮기려 한다. 기존 프로듀서·컨슈머 애플리케이션 코드와 Debezium 커넥터를 거의 그대로 재사용하고, 브로커 운영 부담은 줄이고 싶다. 가장 적합한 것은?

A) Kinesis Data Streams로 마이그레이션
B) Amazon MSK
C) SQS
D) Amazon MQ

**정답: B**

해설: MSK는 Apache Kafka를 매니지드로 제공하므로 Kafka API가 그대로여서 기존 프로듀서·컨슈머 코드와 커넥터(Debezium 등)를 거의 수정 없이 재사용하고, 브로커 프로비저닝·패치·복제·모니터링은 AWS가 맡아 운영 부담이 준다. A(Kinesis)는 AWS 독자 기술이라 SDK·파티셔닝·소비 모델을 전부 다시 짜야 함. C(SQS)는 메시지 큐로 스트림 재생·컨슈머 그룹 모델이 다름. D(MQ)는 ActiveMQ/RabbitMQ 매니지드로 Kafka가 아니다. "기존 Kafka 자산 재사용 + 운영 부담↓"은 MSK.

---

**문제 5.** Kafka를 쓰고 싶지만 브로커 수·파티션 용량 계획 같은 클러스터 사이징을 하고 싶지 않고, 처리량에 따라 자동으로 확장되기를 원한다. 가장 적합한 것은?

A) 프로비저닝드 MSK 클러스터를 크게 구성
B) MSK Serverless
C) Kinesis Data Streams 프로비저닝드 모드
D) 자체 Kafka를 EC2에 구축

**정답: B**

해설: MSK Serverless는 브로커 수·파티션 용량 계획 없이 토픽을 만들고 데이터를 보내면 처리량에 맞춰 자동 확장한다. 사이징이 어렵거나 가변적인 워크로드, 클러스터 운영 회피에 최적이다. A는 사이징을 직접 해야 함. C는 Kafka가 아니고 프로비저닝드는 샤드 계획이 필요. D는 운영 부담이 가장 큼. 단, 초고처리량·세밀한 튜닝이 필요하면 프로비저닝드 MSK가 더 유연하다는 한계도 기억할 것.

---

**문제 6.** Glue Data Catalog의 테이블에 대해 "이 컬럼은 NULL 5% 미만, 이메일 형식이어야 함" 같은 품질 규칙을 정의하고 주기적으로 자동 검사하며 위반 시 알림을 받고 싶다. 가장 적합한 것은?

A) Athena에서 WHERE로 수동 확인
B) Glue Data Quality(DQDL)
C) DataBrew 프로파일만 1회 실행
D) Lambda로 직접 검증 코드 작성

**정답: B**

해설: Glue Data Quality는 DQDL(Data Quality Definition Language)로 카탈로그 테이블에 품질 규칙을 선언하고, 주기적·자동으로 검사해 위반 시 EventBridge로 알린다(규칙 ML 추천도 지원). A는 수동·일회성. C(DataBrew 프로파일)는 통계 프로파일링이지 지속적 규칙 검증·알림 체계가 아님. D는 직접 코드를 짜고 유지해야 해 관리형 품질 프레임워크의 이점이 없다.

---

**문제 7.** 대규모 조직에서 분석가들이 필요한 데이터셋을 사내에서 검색하고 구독을 요청하면 승인 워크플로우를 거쳐 접근권이 부여되는 "데이터 마켓플레이스" 경험을 원한다. 프로듀서/컨슈머 경험을 분리하고 Lake Formation·Redshift와 통합돼야 한다. 가장 적합한 것은?

A) Lake Formation 단독
B) AWS DataZone
C) Glue Crawler
D) QuickSight 대시보드

**정답: B**

해설: DataZone은 비즈니스 도메인 단위 데이터 카탈로그·검색·구독·승인 워크플로우를 제공하는 거버넌스 서비스로, 데이터 프로듀서(게시)와 컨슈머(검색·구독) 경험을 분리하고 Lake Formation·Glue·Redshift·S3와 통합된다. 구독 승인이 실제 LF 권한 부여로 이어진다. A(Lake Formation)는 권한 메커니즘이지 검색·구독 마켓플레이스 경험이 아님. C는 스키마 추론 도구. D는 BI 시각화로 목적이 다르다.

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
