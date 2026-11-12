# Day 4 - Schema Management and Data Quality: Tolerate Evolution, Guarantee Trust

The most silent yet fatal accident in data pipelines is **schema change**. Yesterday `user_id` was an integer; today someone sends it as a string. New fields appear or existing ones vanish. Without controlling these changes, downstream Jobs break one by one, and worse, they **quietly produce wrong data**. Today we tackle both risks with two tools — **Glue Schema Registry** (managing schema change) and **Glue Data Quality** (validating data itself).

## Schema Registry: Schema Contract for Streaming Data

**AWS Glue Schema Registry** is a service that centrally registers, versions, and validates schemas for streaming data (Kinesis, MSK/Kafka, Managed Flink). The core idea is to **enforce a schema contract between producer and consumer**.

The traditional problem: if a producer changes message format one day, a consumer unaware of the change either fails to parse or misinterprets. Schema Registry prevents this.

```
[Producer]                              [Consumer]
Avro message serialization              Avro message deserialization
   ↓ Schema register/validate               ↑ Schema lookup
       [Glue Schema Registry]
   - Schema version management
   - Enforce compatibility rules (BACKWARD/FORWARD/FULL)
   - Attach only schema ID to message → save bandwidth
```

When sending a message, the producer attaches only the **schema ID**, not the full schema. The consumer queries the Registry by that ID to deserialize. Since you don't embed the entire schema in every message, bandwidth is saved, and the schema is always validated. Supported formats: **Avro, JSON Schema, Protobuf**.

```java
// Attach Schema Registry serializer to producer (Kafka example)
props.put(AWSSchemaRegistryConstants.DATA_FORMAT, "AVRO");
props.put(AWSSchemaRegistryConstants.SCHEMA_AUTO_REGISTRATION_SETTING, true);
props.put(AWSSchemaRegistryConstants.COMPATIBILITY_SETTING, "BACKWARD");
// Serializer auto-attaches schema ID and validates compatibility
```

> 💡 **Related Theory**: Schema Registry's compatibility rules implement "contract-first" design in distributed systems. **BACKWARD compatibility** means "a new-schema consumer can read old data" (allows deleting fields or adding fields with defaults), **FORWARD compatibility** means "an old-schema consumer can read new data" (allows adding fields), and **FULL** guarantees both directions. These rules let you do rolling deployments — change schemas gradually without deploying producer and consumer simultaneously.

## Handling Schema Evolution

Schemas always change. The key isn't "prevent change" but "allow change safely." By evolution type:

| Change Type | Safety | How to Handle |
|-------------|--------|---------------|
| Add field (with default) | Safe | BACKWARD compatible, old consumers unaffected |
| Delete field | Caution | May violate FORWARD compatibility, verify consumers |
| Change type (int→string) | Risky | Usually incompatible, add new field recommended |
| Rename field | Risky | Treat as delete+add, use alias |

On the batch side, yesterday's **DynamicFrame's ResolveChoice** is the tool for evolution resilience. Also, formats like Parquet/Avro natively support some schema evolution, and **table formats like Lake Formation/Iceberg** safely handle column add/delete/rename as transactions.

```python
# Absorb evolution on batch side: preserve type conflicts in a struct, then resolve
resolved = ResolveChoice.apply(
    frame=dyf,
    choice="make_struct"   # Keep both int and string in one struct
)
```

> 🔍 **Deeper Dive**: Streaming uses Schema Registry as gatekeeper, and batch data lakes use **open table formats (Apache Iceberg, Hudi, Delta Lake)** to handle evolution. Iceberg assigns each column a unique ID, so renaming doesn't break data mapping (ID-based mapping). This is a critical difference from pure Parquet, which maps by position. On exams, when you see "safe schema evolution in frequently-changing data lakes," think of table formats like Iceberg.

## Glue Data Quality: Validate That Data "Makes Sense"

Even if schema is correct, **values can be wrong**. Amounts negative, 90% nulls in required columns, IDs duplicated. Schema validation checks "form"; data quality validation checks "content." **AWS Glue Data Quality** is a service to define and automatically validate rules on data.

Rules are written in **DQDL (Data Quality Definition Language)**, a declarative language.

```
Rules = [
    IsComplete "order_id",                       # No nulls
    IsUnique "order_id",                         # No duplicates
    ColumnValues "amount" >= 0,                  # Amount non-negative
    ColumnValues "status" in ["NEW","PAID","CANCELLED"],
    Completeness "email" > 0.95,                 # >95% filled
    RowCount between 1000 and 1000000,           # Row count range
    ColumnValues "created_at" matches "\\d{4}-\\d{2}-\\d{2}"
]
```

Glue Data Quality works two ways: (1) **Attach rules to Data Catalog tables** for periodic validation, (2) **Insert as a transform node in Glue ETL pipelines** to "block/quarantine data that fails quality before loading." The second is powerful — bad data gets caught before flowing downstream.

```python
# Quality gate in the middle of ETL pipeline (conceptual)
# Rules-passing rows → normal path, failing rows → quarantine bucket
ruleset = """Rules = [ ColumnValues "amount" >= 0, IsComplete "order_id" ]"""
# EvaluateDataQuality transform branches on pass/fail
```

> ⚠️ **Gotcha**: Glue Data Quality has an **auto-recommend rules** feature. It analyzes data and suggests rules that seem appropriate, but don't trust them blindly. Recommendations are based on current data distribution, so they might misclassify normal future changes as "anomalies," creating false positives. Use recommendations as a starting point but review and adjust to your business rules.

## Quality Score and Operational Integration

Data Quality Jobs output **quality score (fraction of passing rules)** and per-rule pass/fail details. You can send these results to CloudWatch/EventBridge for alerts or create branching in Step Functions like "pause pipeline if score below threshold." The key is making quality an **observable metric**.

> 🎯 **Scenario**: Before daily sales data loads into analysis tables, automatically validate quality. Architecture: (1) Insert EvaluateDataQuality node in Glue ETL pipeline → (2) Define DQDL rules: `amount >= 0`, `IsComplete "order_id"`, `RowCount between ...` → (3) Load passing data to analysis table, branch failing rows to quarantine → (4) Send quality score to CloudWatch; alert via SNS if below threshold → (5) Trigger operations workflow via EventBridge on failure. Bad data never reaches dashboards.

## Summary: Protect Form and Content

Today's two tools are the dual pillars of data reliability. Schema Registry enforces that streaming data **schemas (form)** evolve only within compatibility rules, while Glue Data Quality validates that data **values (content)** satisfy business rules. Schema evolution isn't blocked—it's safely allowed. Quality must be measurable metrics integrated as automatic gates. Tomorrow we synthesize this whole week's Glue transformations.

---

## 📝 Practice Questions

**Question 1.** Which service centrally registers schemas and enforces compatibility rules so that, in Kafka/Kinesis streaming, consumers can safely deserialize the message format sent by producers?

A) Glue Data Catalog  
B) Glue DataBrew  
C) Glue Schema Registry  
D) Glue crawler  

**Answer: C**  
Explanation: Schema Registry versions the schemas of streaming data and enforces BACKWARD/FORWARD/FULL compatibility to guarantee the producer-consumer contract. The Data Catalog is metadata for batch analytics, DataBrew is a cleansing tool, and a crawler is a metadata registration tool, so none of them relate to enforcing compatibility.

---

**Question 2.** Which Schema Registry compatibility mode guarantees that a consumer built with the new schema can read past data without problems?

A) FORWARD  
B) NONE  
C) DISABLED  
D) BACKWARD  

**Answer: D**  
Explanation: BACKWARD compatibility guarantees that "a consumer with the new schema can read old data," and allows adding fields with default values or deleting fields. FORWARD, conversely, guarantees that an old consumer can read new data. NONE/DISABLED performs no validation and therefore cannot guarantee safety.

---

**Question 3.** The data schema is correct, but the `amount` column contains negative values and `order_id` has duplicates. How can you define these as rules, validate them automatically, and block the data before loading?

A) Use the partition detection of a Glue crawler  
B) Define DQDL rules in Glue Data Quality and integrate them into the ETL pipeline as a quality gate  
C) Set the Schema Registry compatibility mode to FULL  
D) Apply Athena partition projection  

**Answer: B**  
Explanation: Value validity (no negatives, no duplicates) is a data quality issue, not a schema issue; define it with Glue Data Quality DQDL rules (ColumnValues, IsUnique, and so on) and block or quarantine data at a gate in the ETL pipeline. Schema Registry validates only the shape, and crawlers and partition projection are unrelated to value validation.

---

**Question 4.** In a data lake batch, which table format supports safe schema evolution by assigning a unique ID to each column so that the data mapping does not break even if a column is renamed?

A) Plain CSV  
B) Uncompressed JSON  
C) Apache Iceberg  
D) A single Parquet file (no table format)  

**Answer: C**  
Explanation: Apache Iceberg assigns a unique ID to each column and handles renames, additions, and deletions safely as transactions. Plain Parquet/CSV/JSON, which use position-based mapping, can break the mapping when a column is renamed and therefore cannot guarantee safe evolution.

---

**Question 5.** What is the correct attitude toward the automatically recommended rules of Glue Data Quality?

A) Recommendations are based on the current data distribution and can produce false positives for normal changes, so treat them as a starting point and have a person review and adjust them  
B) Recommended rules are always accurate, so apply them to production as they are  
C) The recommendation feature does not exist  
D) Recommended rules only check schema compatibility  

**Answer: A**  
Explanation: Recommended rules are generated from the current data distribution, so they can produce false positives by flagging normal future changes as anomalies. Therefore, use them as a starting point and have a person review and adjust them to fit business rules. The recommendation feature actually exists and covers value-based quality rules.

---
