# Day 4 - Data Governance: Catalog, Lineage, Sharing, Auditing

Data governance covers "how to find, trust, share, and track data." Today: data catalog and lineage, safe data sharing (Data Exchange/Clean Rooms), and audit tracking (CloudTrail).

## 1. Data Catalog

Central single source of truth for data asset metadata (schema, location, owner, tags).

- **AWS Glue Data Catalog**: Store database/table/partition metadata. Shared by Athena, Redshift Spectrum, EMR, Glue.
- **Crawlers**: Scan S3 etc., auto-infer and register schemas.
- **Glue Schema Registry**: Manage streaming (Kafka/Kinesis) schema versions and compatibility.
- **Search/discovery**: Analysts find needed data starting here.

```text
[S3 data] --crawler--> [Glue Data Catalog: tables/schemas/partitions]
                              ↑ shared
        [Athena] [Redshift Spectrum] [EMR] [Glue ETL]
```

> 💡 **Related Theory**: Without catalog, each engine defines different schemas for same data, causing mismatches. Shared Glue Data Catalog ensures "define once, use everywhere" consistency.

## 2. Data Lineage

Track data source → transformations → destination.

- **Purpose**: Impact analysis (changing this column breaks which reports?), root cause (where did this value come from?), compliance audit.
- **AWS implementation**: Glue ETL job metadata, SparkUI/logs, governance catalogs (DataZone/SageMaker Catalog) visualize asset relationships.
- **Capture lineage**: Source → ETL → target table → BI dashboard flow.

Maintain lineage to prove "this sales figure's source table and transform steps," establishing trustworthiness.

## 3. Data Sharing: Data Exchange and Clean Rooms

Two flagship services for internal/external data sharing:

### AWS Data Exchange
- Subscribe to third-party datasets or publish yours as license. Transfer data (files/API/Redshift/S3) to subscriber account.

### AWS Clean Rooms
- Multiple parties analyze **without exposing original data to each other**.
- Pre-agree analysis rules (allowed queries, aggregates, differential privacy).
- Fits sensitive sharing (ad measurement, financial collab).

### Lake Formation / Redshift Data Sharing
- **Lake Formation cross-account sharing** (RAM-based) shares catalog resources.
- **Redshift datashare** live cluster-to-cluster sharing (no copy).

```text
Party A data ┐
             ├──> [Clean Rooms collab: agreed-aggregate-query-only] ──> results only
Party B data ┘     (originals invisible to each other)
```

> 💡 **Related Theory**: Data Exchange "hands over data"; Clean Rooms "keeps originals, returns aggregate result." Original-unexposed collab → Clean Rooms.

## 4. Audit: CloudTrail and Logging

Audit tracks "who, when, what" for security/compliance proof.

- **AWS CloudTrail**: Log all AWS API calls (management events). Track who changed S3 policy, who used KMS key.
- **CloudTrail data events**: Fine-grained S3 GetObject/PutObject tracking (optional).
- **S3 access logs / Lake Formation audit**: Data access records.
- **CloudTrail Lake**: Store events, SQL analyze.
- **Security Hub**: Aggregate findings.

```text
{
  "eventName": "GetObject",
  "userIdentity": { "arn": "arn:aws:iam::111122223333:role/RegionAnalyst" },
  "requestParameters": { "bucketName": "lake-curated", "key": "sales/dt=2026-06-25/part-0.parquet" },
  "eventTime": "2026-06-25T09:14:02Z"
}
```

CloudTrail data event shows which role read which object when.

> 💡 **Related Theory**: Management events logged by default; S3 object-level (data events) disabled by default due to cost. Sensitive buckets need explicit data-event enablement.

## 5. Integrated Governance

Solid governance interlock all four.

```text
[Catalog] find → [Lineage] trust → [Sharing] collab → [Audit] track
  Glue        Lineage      Clean Rooms     CloudTrail
  Catalog                  /Data Exchange
```

Single-pillar gaps (good sharing, no audit) risk compliance, trust loss.

## Exam Points Summary

- Glue Data Catalog: shared engine metadata, crawlers auto-register, Schema Registry for streaming.
- Lineage: impact/root-cause analysis, audit. Track source→ETL→target→BI.
- Data Exchange (hand over) vs Clean Rooms (original-hidden collab).
- Lake Formation cross-account (RAM), Redshift datashare (live, no copy).
- CloudTrail: management events (default) vs data events (S3 objects, optional/billable). Enable for sensitive buckets.

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
