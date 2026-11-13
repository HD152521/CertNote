# Day 4 - Data Governance: Catalog, Lineage, Sharing, and Auditing

## 📌 Key Takeaways

- Governance is a cycle of "find (catalog) → trust (lineage) → collaborate (sharing) → track (auditing)." If you have only one axis, the others leak.
- The Glue Data Catalog is the metadata store shared by Athena, Redshift Spectrum, EMR, and Glue. Crawlers infer schemas and register them, and for streams the Schema Registry manages versions and compatibility.
- Lineage records the flow from source → ETL → target → BI, enabling impact analysis and root cause analysis.
- Sharing is distinguished by method. Data Exchange = hands over data (or access rights), Clean Rooms = only agreed-upon analysis results without exposing the raw data, Redshift datashare = live sharing without copying, Lake Formation = cross-account sharing of catalog resources.
- CloudTrail management events are recorded by default, but data events such as S3 object access must be turned on explicitly. Redshift audit logging is also off by default.

## Data Catalog: The Starting Point for Finding Data

Data governance deals with "how do we find, trust, share, and track data?" The first step is the catalog. A catalog manages the metadata of data assets (schema, location, owner, tags) in one place.

```text
[S3 data] --crawler--> [Glue Data Catalog: databases/tables/partitions]
                              ↑ share the same definitions
        [Athena] [Redshift Spectrum] [EMR] [Glue ETL]
```

- The **Glue Data Catalog** holds the metadata of databases, tables, and partitions. The data itself stays where it is, in S3 and elsewhere.
- A **crawler** scans a data store, infers the schema and partitions, and registers them as tables.
- Without a catalog, each engine ends up defining its own schema for the same S3 data, and when only one side gets fixed the results diverge. A shared catalog means "define once, use in every engine."

| Category | Technical catalog | Business catalog |
|------|------|------|
| Representative service | Glue Data Catalog | Amazon DataZone (also offered as the catalog capability of SageMaker) |
| What it holds | Schema, location, partitions, format | Business terms, owner, description, quality and lineage, subscription approval flow |
| Main users | Query engines, engineers | Analysts and business staff who want to find and use data |
| Question it answers | "What are the columns and path of this table?" | "Who owns the sales data and how do I request it?" |

- If the question says "schema consistency across engines," it's the Glue Data Catalog; if it says "search data assets and request/approve access," it points to the business catalog.

## Who Manages the Schema: Crawlers and Schema Registry

| Item | Glue crawler | Glue Schema Registry |
|------|------|------|
| Target | Stored data (S3, JDBC, etc.) | Data in motion (Kafka/MSK, Kinesis Data Streams) |
| Timing | Infers **after** data has accumulated | Validates **before** the producer sends |
| Result | Catalog tables and partitions | Schema versions and compatibility verdicts |
| Wrong schema | Only shows up after registration | Incompatible new versions are rejected at registration |

- Schema Registry supports Avro, JSON (JSON Schema), and Protobuf formats, and has no usage charge. It provides libraries (SerDe) so producers and consumers serialize and deserialize with the same schema.
- The purpose is to treat the schema as a "contract between producer and consumer." Consumers are no longer broken by compatible changes.

| Compatibility mode | Changes allowed | Meaning |
|------|------|------|
| `BACKWARD` (recommended) | Delete fields, add optional fields | A consumer with the new schema can read data written with the **previous version** |
| `BACKWARD_ALL` | Same as above | Can read data from **all previous versions**, not just the previous one |
| `FORWARD` | Add fields, delete optional fields | A consumer with the old schema can read data written with the new version |
| `FORWARD_ALL` | Same as above | Checked against all previous versions |
| `FULL` / `FULL_ALL` | Only adding/deleting optional fields | Compatible in both directions |
| `NONE` | Any change | No compatibility check (for development) |
| `DISABLED` | None | Blocks registering new versions altogether |

- Under `BACKWARD`, **adding a required field** is rejected. That's because a new consumer can't read old messages that lack that field. Adding it as an optional field passes.
- "Deploy consumers first and producers later" is the deployment order that fits `BACKWARD`; "producers first" fits `FORWARD`.

## Data Lineage: The Basis of Trust

Lineage is a record of where data came from, what transformations it went through, and where it went.

| Use | Question | Direction |
|------|------|------|
| Impact analysis | "If I change this column's definition, which tables and reports break?" | Downward (downstream) |
| Root cause analysis | "Where did the wrong value in this report come from?" | Upward (upstream) |
| Compliance | "Where is PII stored and where has it flowed?" | Both directions |

- **Amazon DataZone data lineage** is compatible with OpenLineage. For Glue tables and Redshift added to the catalog, lineage can be set up to be collected automatically, and Spark jobs on Glue 5.0 or later can be configured to send lineage events at run time. For other systems, you push lineage events in directly through the API.
- Lineage nodes are datasets (tables, views) and jobs (runs), and column-level lineage is also available. Every event is versioned, so you can compare "what the path was last month."
- On the machine learning side there is a separate **SageMaker ML Lineage Tracking**. It records the lineage of ML workflow steps: dataset → training → model → endpoint. If the question asks "what data was the model trained on," this is the one.
- It connects to yesterday's GDPR deletion. When you have to erase one customer's data, lineage tells you which tables and extract files hold copies.

> 💡 **Related theory**: Without lineage, a schema change becomes "change it and wait to see what breaks." The Week 8 incident (a downstream job failed because an upstream column name changed) could have been prevented by checking the blast radius with lineage before the change.

## Four Ways to Share Data

| Category | AWS Data Exchange | AWS Clean Rooms | Redshift data sharing | Lake Formation cross-account sharing |
|------|------|------|------|------|
| Purpose | Subscribe to / provide third-party data | Joint analysis without exposing raw data | Live sharing between warehouses | Sharing data lake tables |
| Does the other party see raw rows? | Yes | **No** (only agreed-upon results) | Yes (the granted objects) | Yes (within the filter scope) |
| Data movement | Files are copied via export; S3 and Redshift types are accessed in place | None. Each reads from its own location | None | None |
| Control mechanism | Subscription agreement, data grants | Analysis rules, differential privacy, cryptographic computing | Objects added to the datashare and GRANTs | Column/row filters, LF-Tags |
| Clue for choosing | "Regularly receive a third-party dataset" | "Each other's raw customer data must not be exposed" | "Latest data from another cluster without copying" | "Share tables to another account with fine granularity" |

### AWS Data Exchange

- A service for subscribing to datasets created by data providers, or publishing your own data as a product. Besides data products on AWS Marketplace, there is also a **data grant** that gives a specific account access without going through the marketplace.
- Delivery differs by dataset type. With the **Files** type, the subscriber exports to their own S3 and holds a copy. With the **Amazon S3 data access** type, they read the provider's bucket directly; with the **Amazon Redshift** type, they query read-only without ETL; with the **API** type, they call it to receive data. The Lake Formation data permission type is a preview according to the documentation.
- "Data Exchange always copies the data to you" is the old explanation. It applies only to the Files type.

### AWS Clean Rooms

- Multiple parties analyze jointly **without exposing raw data to each other**. The data is neither moved out of AWS nor pooled in one place; it is read from where each party keeps it.
- You create a collaboration and invite members, then each member associates its own **configured table** and applies an **analysis rule** to that table. The analysis rule decides which SQL is allowed and the output constraints (for example, aggregations only).

| Control | What it does |
|------|------|
| Analysis rule | Restricts the allowed query shapes and output |
| Analysis template | Agrees on the query to be run in advance |
| Differential privacy | Mathematically defends against attempts to identify individuals from results |
| Cryptographic Computing (C3R) | Keeps data encrypted even while queries are processed |
| Analysis logs | Records queries that were run to support auditing |

- The collaboration creator also decides who pays the query costs. The member who queries and the member who pays can be different.

```text
Party A data ┐
             ├──> [Clean Rooms collaboration: only agreed aggregate queries] ──> only results returned
Party B data ┘     (neither can see the other's raw data)
```

### Redshift Data Sharing (datashare)

- Shares live data **without copying** across clusters, serverless workgroups, accounts, and Regions. Changes committed on the producer are immediately visible in a new transaction on the consumer (transactional consistency).
- Shareable units are schemas, tables, views (regular, late-binding, and materialized views), and SQL UDFs. You can grant write permission as well as read.
- The typical use is an ETL-dedicated cluster distributing data to several BI clusters. Workloads are isolated and costs are tracked separately per workload.

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

- This differs from snapshot sharing. A snapshot restores a **copy** as of a particular point in time, so it isn't the latest data and it also incurs storage cost.

> 💡 **Related theory**: Data Exchange is the model that "hands over data (or access rights)"; Clean Rooms is the model that "doesn't hand over data and gets only the aggregated result." If a question says "neither party may see the other's raw data," bucket sharing, datashare, and Data Exchange are all eliminated, because the other party ends up reading the raw rows.

## Auditing: Who, When, What

| Log | What it records | Default state | Delivery | Notes |
|------|------|------|------|------|
| CloudTrail management events | Configuration-change APIs for policies, keys, tables, etc. | Recorded | About every 15 minutes | First copy is free |
| CloudTrail data events | Object-level S3 GET/PUT, etc. | Off | About every 5 minutes | Billed per event count. Scope can be narrowed by prefix |
| S3 server access logs | Requests made to a bucket | Off | Within a few hours | Also records authentication failures and lifecycle transitions/expirations. No integrity validation feature |
| Redshift audit logs | Connections, user changes, executed queries | Off | S3 or CloudWatch Logs | See below |
| Lake Formation access | Credential vending requests, etc. | Recorded in CloudTrail | - | Cross-account access is also tracked via CloudTrail |

```text
{
  "eventName": "GetObject",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/RegionAnalyst/alice" },
  "requestParameters": { "bucketName": "lake-curated", "key": "sales/dt=2026-06-25/part-0.parquet" },
  "eventTime": "2026-06-25T09:14:02Z"
}
```

- You need data events like the one above to prove "which role read which object and when." Management events alone only answer as far as "who changed the bucket policy."
- Data events are high in volume. Don't turn them on for every bucket; narrow them to sensitive buckets and prefixes.
- **Redshift audit logging** produces three logs. The connection log (authentication attempts, connections, disconnections), the user log (changes to user definitions), and the user activity log (query text before execution). Turning on audit logging alone gives only the first two; to also keep the query text, you must separately turn on the parameter `enable_user_activity_logging`. This is the cause of "I turned on audit logging but queries aren't recorded."
- Redshift API calls (creating or modifying a cluster) are recorded in CloudTrail, while SQL activity **inside** the database is recorded in the audit logs. They are different layers.
- **CloudTrail Lake** stores events so you can query them with SQL, and **Security Hub** gathers findings from multiple security services in one place. Collect audit logs in a bucket in an account separate from the operations account and keep them immutable.

CloudTrail management events are recorded by default, but S3 object-level access (data events) is off by default because of volume and cost. If you turn it on after an incident, there is no record from the time of the incident. Sensitive buckets must be enabled in advance.

## Integrating Governance

```text
[Catalog] find → [Lineage] trust → [Sharing] collaborate → [Audit] track
   Glue         DataZone       Clean Rooms       CloudTrail
   Catalog      Lineage        Data Exchange     audit logs
                               datashare
```

| Missing axis | Resulting problem |
|------|------|
| Catalog | Multiple schemas for the same data; nobody knows what exists |
| Lineage | Unknown blast radius of changes; can't find copies on a deletion request |
| Sharing control | Copies spread through file copies and email forwarding |
| Auditing | Can't prove who viewed what, resulting in a compliance violation |

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Athena and EMR results differ | Each engine defines its own schema | Share the Glue Data Catalog |
| Consumer fails to deserialize after a producer deployment | Schema change without a compatibility check | Schema Registry + compatibility mode |
| Reports broke after changing a column | Change made without impact analysis | Check downstream with lineage |
| No object access records in CloudTrail | Data events not enabled | Data events on sensitive buckets |
| No query text in Redshift audit logs | `enable_user_activity_logging` is off | Enable it in the parameter group |
| Extract file given to a partner escaped control | Copy-based sharing | Clean Rooms or in-place access sharing |

## Clue → Answer Lookup Table

| Clue in the question | Answer |
|------|------|
| "Schema mismatch across engines, single source of truth" | Shared Glue Data Catalog |
| "Version and compatibility management for streaming schemas" | Glue Schema Registry |
| "Which reports a column change affects" | Data lineage |
| "Joint analysis without exposing each other's raw data" | AWS Clean Rooms |
| "Subscribe to a third-party dataset and receive it regularly" | AWS Data Exchange |
| "Latest data to another Redshift cluster without copying" | Redshift datashare |
| "Who read which object in a sensitive bucket" | CloudTrail data events |
| "Who ran which query in Redshift" | Audit logging + user activity log |

Tomorrow we'll review this week's four axes (access control, encryption, sensitive data protection, governance) by tying them together in one end-to-end scenario.

## 📖 Glossary

- **Data catalog**: A metadata store that records where data is and what structure it has.
- **Crawler**: A Glue feature that scans a data store, infers the schema, and registers it in the catalog as tables.
- **Schema Registry**: A Glue feature that stores the schemas of streaming data by version and blocks incompatible changes.
- **Compatibility mode**: A rule that decides in which direction a new schema version must be compatible with previous versions for registration to be allowed.
- **Lineage**: A record of where data came from, what transformations it went through, and where it went.
- **Impact analysis**: Using lineage to check the downstream that a change would reach before changing anything.
- **datashare**: A bundle of objects in Redshift shared with other clusters and accounts without copying.
- **Analysis rule**: A constraint in Clean Rooms that defines which queries and outputs are allowed on a table.
- **Differential privacy**: A technique that adds mathematically calibrated noise to results so individuals can't be identified.
- **Data event**: A record of access to the data itself, such as reading or writing an object. It is only recorded if you turn it on explicitly in CloudTrail.

## 📝 Practice Questions

**Question 1.** Two companies want to jointly measure ad effectiveness, but they must never expose each other's raw customer data. What should they use to share only the results of agreed-upon aggregate queries?

A) Exchange datasets with AWS Data Exchange  
B) Share the raw data with an S3 cross-account bucket policy  
C) Redshift snapshot sharing  
D) Collaborate with AWS Clean Rooms  

**Answer: D**  
Explanation: Clean Rooms is a joint analysis service where the parties get only aggregate results through pre-agreed analysis rules without exposing raw data to each other. Data Exchange, bucket sharing, and snapshot sharing all pass the raw data to the other party, so they don't meet the requirement.

---

**Question 2.** Before changing the definition of a sales column, you want to know which downstream reports and tables it affects. Which governance feature helps most?

A) Data lineage  
B) S3 lifecycle policy  
C) KMS key rotation  
D) Partition projection  

**Answer: A**  
Explanation: Data lineage records the flow from source → transformation → target → BI, enabling impact analysis (which downstream assets would break). Lifecycle, key rotation, and partition projection are unrelated to impact tracking.

---

**Question 3.** Athena, Redshift Spectrum, and EMR define different schemas for the same S3 data, so their results are inconsistent. Which solution provides a single source of truth?

A) Maintain a separate schema in each engine  
B) Standardize the data to CSV  
C) Apply a different KMS key to each bucket  
D) Use a shared Glue Data Catalog  

**Answer: D**  
Explanation: Sharing the Glue Data Catalog lets you define tables/schemas once, and Athena, Spectrum, EMR, and Glue all use the same metadata, so the inconsistency disappears. Maintaining separate schemas is the cause of the problem, and standardizing on CSV or using KMS has nothing to do with schema consistency.

---

**Question 4.** The audit team wants to know "who read which objects in the sensitive S3 bucket last week." However, CloudTrail shows only management events. What action is needed?

A) Enable S3 versioning  
B) Enable CloudTrail data event (S3 object-level) logging  
C) Run a Macie classification job  
D) Add a Deny to the IAM policy  

**Answer: B**  
Explanation: S3 object-level access (GetObject, etc.) is recorded as CloudTrail data events, and because of cost it is disabled by default, so it is only tracked once you explicitly enable it. Versioning is a change history, Macie is detection, and Deny is blocking, so none of them produces an access audit log.

---

**Question 5.** You want to regularly receive a third-party market research dataset and integrate it into your analytics pipeline. Which AWS service is most appropriate?

A) AWS Clean Rooms  
B) AWS Glue Schema Registry  
C) AWS Data Exchange  
D) AWS CloudTrail Lake  

**Answer: C**  
Explanation: AWS Data Exchange is a data marketplace where you can subscribe to third-party datasets and receive them regularly via S3/API/Redshift. Clean Rooms is for joint analysis without exposing raw data, Schema Registry is for streaming schemas, and CloudTrail Lake is for analyzing audit events.

---
