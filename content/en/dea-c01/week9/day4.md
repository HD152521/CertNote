# Day 4 - Data Governance: Catalog, Lineage, Sharing, and Auditing

## 📌 Key Takeaways

- Governance is a cycle of "find (catalog) → trust (lineage) → collaborate (sharing) → track (auditing)." If you have only one axis, data leaks through the others.
- The Glue Data Catalog is the metadata store shared by Athena, Redshift Spectrum, EMR, and Glue. Crawlers infer schemas and register them, and for streams, the Schema Registry manages versions and compatibility.
- Lineage records the flow of source → ETL → target → BI, enabling impact analysis and root cause analysis.
- Sharing is distinguished by method. Data Exchange = hands over data (or access rights), Clean Rooms = only agreed analysis results without revealing the originals, Redshift datashare = live sharing without copying, Lake Formation = cross-account sharing of catalog resources.
- CloudTrail management events are recorded by default, but data events such as S3 object access must be turned on yourself. Redshift audit logging is also off by default.

## Data Catalog: The Starting Point for Finding Data

Data governance deals with "how to find, trust, share, and track data." The first step is the catalog. A catalog manages the metadata of data assets (schema, location, owner, tags) in one place.

```text
[S3 data] --crawler--> [Glue Data Catalog: databases/tables/partitions]
                              ↑ use the same definitions together
        [Athena] [Redshift Spectrum] [EMR] [Glue ETL]
```

- The **Glue Data Catalog** holds the metadata of databases, tables, and partitions. The data itself stays in S3 and elsewhere.
- A **crawler** scans a data store, infers the schema and partitions, and registers them as a table.
- Without a catalog, each engine defines its own schema for the same S3 data, and when only one side is fixed the results diverge. A shared catalog means "define once, use in every engine."

| Item | Technical catalog | Business catalog |
|------|------|------|
| Representative service | Glue Data Catalog | Amazon DataZone (also offered as the catalog feature of SageMaker) |
| What it holds | Schema, location, partitions, format | Business terms, owner, description, quality and lineage, subscription approval flow |
| Main users | Query engines, engineers | Analysts and business owners who want to find and use data |
| Question it answers | "What are the columns and path of this table?" | "Whose is the sales data and how do I request it?" |

- If the question says "schema consistency across engines," it is the Glue Data Catalog; if it says "search data assets and request or approve access," it is on the business catalog side.

## Who Manages the Schema: Crawler and Schema Registry

| Item | Glue crawler | Glue Schema Registry |
|------|------|------|
| Target | Stored data (S3, JDBC, etc.) | Data in motion (Kafka/MSK, Kinesis Data Streams) |
| Timing | Infers **after** the data has accumulated | Validates **before** the producer sends |
| Result | Catalog tables and partitions | Schema versions and compatibility verdicts |
| A wrong schema | Revealed only after it is registered | An incompatible new version is rejected at registration |

- Schema Registry supports the Avro, JSON (JSON Schema), and Protobuf formats and has no usage charge. It provides libraries (SerDe) so that producers and consumers serialize and deserialize with the same schema.
- The purpose is to treat the schema as a "contract between producer and consumer." Consumers no longer break on compatible changes.

| Compatibility mode | Changes allowed | Meaning |
|------|------|------|
| `BACKWARD` (recommended) | Delete fields, add optional fields | A consumer with the new schema can read data written with the **previous version** |
| `BACKWARD_ALL` | Same as above | Can read data from **all previous versions**, not just the previous one |
| `FORWARD` | Add fields, delete optional fields | A consumer with the old schema can read data written with the new version |
| `FORWARD_ALL` | Same as above | Checked against all previous versions |
| `FULL` / `FULL_ALL` | Only adding or deleting optional fields | Compatible in both directions |
| `NONE` | Any change | No compatibility check (for development) |
| `DISABLED` | None | Blocks registering a new version altogether |

- Under `BACKWARD`, **adding a required field** is rejected. This is because a new consumer cannot read old messages that do not have that field. Adding it as an optional field passes.
- The right deployment order is "deploy consumers first and producers later" for `BACKWARD`, and "producers first" for `FORWARD`.

## Data Lineage: The Basis for Trust

Lineage is the record of where data came from, what transformations it went through, and where it went.

| Use | Question | Direction |
|------|------|------|
| Impact analysis | "If I change this column definition, which tables and reports break?" | Downward (downstream) |
| Root cause analysis | "Where did the wrong value in this report come from?" | Upward (upstream) |
| Compliance | "Where is PII stored and where did it flow?" | Both directions |

- **Amazon DataZone data lineage** is compatible with OpenLineage. For Glue tables and Redshift added to the catalog, you can configure lineage to be collected automatically, and Spark jobs on Glue 5.0 or later can be configured to send lineage events at run time. For other systems, you push lineage events in directly through the API.
- Lineage nodes are datasets (tables, views) and jobs (runs), and you can also see column-level lineage. A version is kept for every event, so you can compare "what the path was last month."
- On the machine learning side there is a separate **SageMaker ML Lineage Tracking**. It records lineage for ML workflow steps that run dataset → training → model → endpoint. If the question asks "which data was the model trained on," it is this one.
- This connects to yesterday's GDPR deletion. When you must delete one customer's data, lineage tells you which tables and extract files hold copies.

> 💡 **Related theory**: Without lineage, a schema change becomes "change it and wait to see what breaks." The failure case in Week 8 (a downstream job failing because of a renamed upstream column) could have been prevented by checking the blast radius with lineage before the change.

## Four Ways to Share Data

| Item | AWS Data Exchange | AWS Clean Rooms | Redshift data sharing | Lake Formation cross-account sharing |
|------|------|------|------|------|
| Purpose | Subscribing to and providing third-party data | Joint analysis without exposing originals | Live sharing between warehouses | Sharing data lake tables |
| Does the other party see the original rows? | Yes | **No** (only agreed results) | Yes (granted objects) | Yes (within the filter scope) |
| Data movement | Files are copied by export; S3 and Redshift types are accessed in place | None. Each party's data is read where it sits | None | None |
| Control means | Subscription agreement, data grants | Analysis rules, differential privacy, cryptographic computing | Objects added to the datashare and GRANTs | Column and row filters, LF-Tags |
| Clue for choosing | "Receive a third-party dataset regularly" | "Neither side's raw customer data may be exposed" | "The latest data in another cluster without copying" | "Share tables with another account with fine-grained control" |

### AWS Data Exchange

- It is a service for subscribing to datasets created by data providers, or publishing your own data as a product. Besides data products in AWS Marketplace, there are also **data grants**, which give access to a specific account without the marketplace.
- The delivery method differs by dataset type. With the **files** type, the subscriber exports to their own S3 and keeps a copy. The **Amazon S3 data access** type reads the provider's bucket directly, the **Amazon Redshift** type queries read-only without ETL, and the **API** type receives data by calling it. The Lake Formation data permission type is a preview according to the documentation.
- "Data Exchange always copies the data for you" is an old description. It applies only to the files type.

### AWS Clean Rooms

- Multiple parties analyze jointly **without exposing their originals to each other.** The data is neither moved out of AWS nor gathered in one place; each is read where it sits.
- You create a collaboration and invite members, then each member links a **configured table** and applies an **analysis rule** to that table. The analysis rule decides which SQL is allowed and the output constraints (for example, allow aggregates only).

| Control | What it does |
|------|------|
| Analysis rules | Restrict the allowed query shapes and outputs |
| Analysis templates | Agree in advance on the queries themselves that will run |
| Differential privacy | Mathematically defends against attempts to identify individuals in the results |
| Cryptographic Computing (C3R) | Keeps data encrypted even while queries are being processed |
| Analysis logs | Record executed queries to support auditing |

- The collaboration creator also decides who pays for query costs. The member who queries and the member who pays can be different.

```text
Party A data ┐
             ├──> [Clean Rooms collaboration: only agreed aggregate queries] ──> returns only results
Party B data ┘     (neither can see the other's originals)
```

### Redshift Data Sharing (datashare)

- It shares live data **without copying** across clusters, serverless workgroups, accounts, and Regions. Changes committed on the producer are visible immediately in a new transaction on the consumer (transactional consistency).
- The units of sharing are schemas, tables, views (regular, late-binding, and materialized views), and SQL UDFs. You can grant not only read but also write permissions.
- The typical use is a structure where an ETL-only cluster distributes data to several BI clusters. Workloads are isolated, and costs are seen separately per workload.

```sql
-- Producer
CREATE DATASHARE sales_share;
ALTER DATASHARE sales_share ADD SCHEMA sales;
ALTER DATASHARE sales_share ADD TABLE sales.orders;
GRANT USAGE ON DATASHARE sales_share TO ACCOUNT '444455556666';

-- Consumer (another account): attach the share as a database, then query
CREATE DATABASE sales_from_prod FROM DATASHARE sales_share
  OF ACCOUNT '111122223333' NAMESPACE 'a1b2c3d4-5678-90ab-cdef-111122223333';
SELECT COUNT(*) FROM sales_from_prod.sales.orders;
```

- It differs from snapshot sharing. A snapshot restores a **copy** at a specific point in time, so it is not the latest data and it also incurs storage cost.

> 💡 **Related theory**: Data Exchange is a model that "hands over data (or access rights)," while Clean Rooms is a model that "does not hand over data and gets only aggregated results." If a question says "neither side may see the other's originals," bucket sharing, datashare, and Data Exchange are all eliminated, because the other party ends up reading the original rows.

## Auditing: Who Did What and When

| Log | What it records | Default state | Delivery | Notes |
|------|------|------|------|------|
| CloudTrail management events | API calls that change configuration, such as policies, keys, and tables | Recorded | About every 15 minutes | The first copy is free |
| CloudTrail data events | Object-level S3 GET/PUT and so on | Off | About every 5 minutes | Billed per event. You can narrow the scope by prefix |
| S3 server access logs | Requests made to the bucket | Off | Within a few hours | Also records authentication failures and lifecycle transitions and expirations. No integrity validation feature |
| Redshift audit logs | Connections, user changes, executed queries | Off | S3 or CloudWatch Logs | See below |
| Lake Formation access | Credential vending requests and so on | Recorded in CloudTrail | - | Cross-account access is also tracked through CloudTrail |

```text
{
  "eventName": "GetObject",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/RegionAnalyst/alice" },
  "requestParameters": { "bucketName": "lake-curated", "key": "sales/dt=2026-06-25/part-0.parquet" },
  "eventTime": "2026-06-25T09:14:02Z"
}
```

- With a data event like the one above, you can prove "which role read which object and when." Management events alone answer only up to "who changed the bucket policy."
- Data events are voluminous. Do not turn them on for every bucket; narrow them to sensitive buckets and prefixes.
- **Redshift audit logging** produces three logs: the connection log (authentication attempts, connections, disconnections), the user log (changes to user definitions), and the user activity log (query statements before execution). Turning on audit logging alone produces only the first two, and to also record the query statements you must separately turn on the parameter `enable_user_activity_logging`. This is the cause of "I turned on audit logging but queries are not recorded."
- Redshift API calls (creating or modifying a cluster) are recorded in CloudTrail, while SQL activity **inside** the database is recorded in the audit logs. They are at different layers.
- **CloudTrail Lake** stores events so you can query them with SQL, and **Security Hub** gathers findings from multiple security services in one place. Gather audit logs in a bucket in an account separate from the operations account and keep them tamper-proof.

CloudTrail management events are recorded by default, but S3 object-level access (data events) is off by default because of volume and cost. If you turn it on after an incident, there are no records from the time of the incident. Turn it on in advance for sensitive buckets.

## Integrating Governance

```text
[Catalog] find → [Lineage] trust → [Sharing] collaborate → [Auditing] track
   Glue            DataZone          Clean Rooms             CloudTrail
   Catalog         Lineage           Data Exchange           audit logs
                                     datashare
```

| Missing axis | Resulting problem |
|------|------|
| Catalog | Multiple schemas for the same data, and nobody knows what exists |
| Lineage | You do not know the blast radius of a change, and cannot find copies when a deletion request comes |
| Sharing control | Copies spread through file copying and email forwarding |
| Auditing | You cannot prove who viewed the data, which is a compliance violation |

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Athena and EMR give different results | Each engine defines its own schema | Share the Glue Data Catalog |
| A consumer fails to deserialize after a producer deployment | A schema change without a compatibility check | Schema Registry + compatibility mode |
| Reports broke after changing a column | Changed without impact analysis | Check downstream with lineage |
| No object access records in CloudTrail | Data events not enabled | Data events on sensitive buckets |
| No query statements in the Redshift audit log | `enable_user_activity_logging` is off | Enable it in the parameter group |
| An extract file given to a partner is out of control | Copy-based sharing | Clean Rooms or in-place sharing |

## Question Clue → Correct Answer Table

| Clue in the question | Correct answer |
|------|------|
| "Schema mismatch across engines, single source of truth" | Shared Glue Data Catalog |
| "Manage versions and compatibility of a streaming schema" | Glue Schema Registry |
| "Which reports does a column change affect" | Data lineage |
| "Joint analysis without exposing each other's originals" | AWS Clean Rooms |
| "Subscribe to a third-party dataset and receive it regularly" | AWS Data Exchange |
| "The latest data in another Redshift cluster without copying" | Redshift datashare |
| "Who read which object in a sensitive bucket" | CloudTrail data events |
| "Who ran which query in Redshift" | Audit logging + user activity log |

Tomorrow we review this week's four axes (access control, encryption, sensitive data protection, and governance) by tying them into one end-to-end scenario.

## 📖 Glossary

- **Data catalog**: A metadata store that records where data lives and in what structure.
- **Crawler**: A Glue feature that scans a data store, infers the schema, and registers it as a table in the catalog.
- **Schema Registry**: A Glue feature that stores the schemas of streaming data by version and blocks incompatible changes.
- **Compatibility mode**: A rule that decides in which direction a new schema version must be compatible with previous versions for registration to be allowed.
- **Lineage**: A record of where data came from, what transformations it went through, and where it went.
- **Impact analysis**: Checking, with lineage, the downstream that a change touches before changing anything.
- **datashare**: A bundle of objects in Redshift shared with another cluster or account without copying.
- **Analysis rule**: A constraint in Clean Rooms that decides which queries and outputs are allowed on a table.
- **Differential privacy**: A technique that adds mathematically calibrated noise to results so that individuals cannot be identified.
- **Data event**: A record of access to the data itself, such as reading or writing an object. It is recorded only if you turn it on directly in CloudTrail.

## 📝 Practice Questions

**Question 1.** Two companies want to jointly measure ad effectiveness, but must never expose each other's raw customer data. How can they share only the results of agreed-upon aggregate queries?

A) Exchange datasets with AWS Data Exchange  
B) Share the raw data with an S3 cross-account bucket policy  
C) Share a Redshift snapshot  
D) Collaborate with AWS Clean Rooms  

**Answer: D**  
Explanation: Clean Rooms is a joint analysis service in which the parties obtain only aggregated results under pre-agreed analysis rules without exposing raw data to each other. Data Exchange, bucket sharing, and snapshot sharing all hand the raw data over to the other party, so they do not meet the requirement.

---

**Question 2.** Before changing the definition of a revenue column, you want to understand which downstream reports and tables it affects. Which governance feature helps the most?

A) Data lineage  
B) S3 lifecycle policy  
C) KMS key rotation  
D) Partition projection  

**Answer: A**  
Explanation: Data lineage records the flow from source to transformation to target to BI, enabling impact analysis (which downstream assets would break). Lifecycle, key rotation, and partition projection are unrelated to impact tracing.

---

**Question 3.** Athena, Redshift Spectrum, and EMR define different schemas for the same S3 data, so results are inconsistent. Which solution provides a single source of truth?

A) Maintain separate schemas for each engine  
B) Standardize the data to CSV  
C) Apply a different KMS key to each bucket  
D) Use a shared Glue Data Catalog  

**Answer: D**  
Explanation: If you share the Glue Data Catalog, tables/schemas are defined once and Athena, Spectrum, EMR, and Glue use the same metadata, so the inconsistency disappears. Maintaining separate schemas is the cause of the problem, and standardizing to CSV and KMS are unrelated to schema consistency.

---

**Question 4.** An audit team wants to know "who read which objects in a sensitive S3 bucket last week." However, only management events are visible in CloudTrail. What action is needed?

A) Enable S3 versioning  
B) Enable CloudTrail data event (S3 object-level) logging  
C) Run a Macie classification job  
D) Add a Deny to the IAM policy  

**Answer: B**  
Explanation: S3 object-level access (GetObject and so on) is recorded as CloudTrail data events, which are disabled by default because of cost, so they must be explicitly enabled to be tracked. Versioning is a change history, Macie is detection, and Deny is blocking; none of them creates access audit logs.

---

**Question 5.** You want to regularly receive third-party market research datasets and integrate them into your analytics pipeline. Which AWS service is the most appropriate?

A) AWS Clean Rooms  
B) AWS Glue Schema Registry  
C) AWS Data Exchange  
D) AWS CloudTrail Lake  

**Answer: C**  
Explanation: AWS Data Exchange is a data marketplace where you can subscribe to third-party datasets and receive them regularly through S3/API/Redshift. Clean Rooms is for joint analysis without exposing raw data, Schema Registry is for streaming schemas, and CloudTrail Lake is for analyzing audit events.

---
