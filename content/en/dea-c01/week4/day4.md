# Day 4 - Schema Management and Data Quality: Tolerate Evolution, Guarantee Trust

## 📌 Key Takeaways

- **Schema Registry** centrally versions the schemas of streaming records (Kafka, MSK, Kinesis, Flink) and lets only new versions that satisfy the compatibility rule be registered.
- **BACKWARD** means consumers on the new schema can read old data (deleting fields and adding optional fields allowed), **FORWARD** is the reverse (adding fields and deleting optional fields allowed), and **FULL** is both.
- **Glue Data Quality** validates the validity of values with DQDL rules. It has two entry points: against Data Catalog tables (checking stored data) and inside an ETL Job (blocking before load).
- Shape is handled by Schema Registry, content by Data Quality, and safe column changes in lake tables by a table format such as Iceberg.
- Export the quality score (the ratio of rules that passed) to CloudWatch and EventBridge and use it as an automatic gate for the pipeline.

## Schema Registry: Schema Contract for Streaming Data

The most silent yet fatal accident in data pipelines is **schema change**. Yesterday `user_id` was an integer; today someone sends it as a string. New fields are added, or existing ones vanish. Without controlling these changes, downstream Jobs break one after another, and in the worse case they **quietly produce wrong data**. Today we learn two tools that tackle these two risks — **Glue Schema Registry**, which manages schema change, and **Glue Data Quality**, which validates the quality of the data itself.

**AWS Glue Schema Registry** is a service that centrally registers, versions, and validates schemas for streaming data (Kinesis, MSK/Kafka, Managed Flink). The core idea is to **enforce a schema contract between the producer and the consumer**.

The traditional problem is this: if a producer changes the message format one day, a consumer unaware of the change either fails to parse or misinterprets it. Schema Registry prevents this.

```
[Producer]                              [Consumer]
Avro message serialization              Avro message deserialization
   ↓ Schema register/validate               ↑ Schema lookup
       [Glue Schema Registry]
   - Schema version management
   - Enforce compatibility rules (BACKWARD/FORWARD/FULL)
   - Attach only schema ID to message → save bandwidth
```

When sending a message, the producer attaches only the **schema ID**, not the full schema. The consumer looks up the schema from the Registry with that ID and deserializes. Since the whole schema isn't embedded in every message, bandwidth is saved, and the schema is always guaranteed to be a validated version. The supported formats are **Avro, JSON Schema, and Protobuf**.

```java
// Connect the Schema Registry serializer to the producer (Kafka example)
props.put(AWSSchemaRegistryConstants.DATA_FORMAT, "AVRO");
props.put(AWSSchemaRegistryConstants.SCHEMA_AUTO_REGISTRATION_SETTING, true);
props.put(AWSSchemaRegistryConstants.COMPATIBILITY_SETTING, "BACKWARD");
// The serializer automatically attaches the schema ID to the message and validates compatibility
```

> 💡 **Related Theory**: Schema Registry's compatibility rules implement the "contract-first" design of distributed systems. **BACKWARD compatibility** means "a consumer built on the new schema can read old data" (deleting fields and adding fields with defaults are allowed), **FORWARD compatibility** means "a consumer on the old schema can read new data" (adding fields is allowed), and **FULL** guarantees both directions. Thanks to these rules, you can make gradual schema changes with zero downtime (rolling deployment) without deploying producers and consumers at the same time.

## How to Handle Schema Evolution

Schemas will inevitably change. What matters is not "preventing change" but "allowing change safely." Responses by type of evolution are summarized below.

| Type of change | Safety | How to handle |
|----------------|--------|---------------|
| Add a field (with default) | Safe | BACKWARD compatible, old consumers unaffected |
| Delete a field | Caution | May violate FORWARD compatibility, check consumers |
| Change a type (int→string) | Risky | Usually incompatible, adding a new field is recommended |
| Rename a field | Risky | Treated as delete + add, use aliases |

On the batch ETL side, the **DynamicFrame's ResolveChoice** we learned yesterday is the tool that absorbs evolution. Also, formats like Parquet/Avro themselves partly support schema evolution, and **open table formats such as Apache Iceberg** handle adding, dropping, and renaming columns safely as transactions.

```python
# Absorbing evolution on the batch side: preserve the type conflict as a struct, then clean up
resolved = ResolveChoice.apply(
    frame=dyf,
    choice="make_struct"   # keep both int and string in one struct
)
```

In streaming, Schema Registry gatekeeps evolution, and in data lake batch, **open table formats (Apache Iceberg, Hudi, Delta Lake)** take responsibility for evolution. Iceberg assigns each column a unique ID, so renaming a column does not break the data mapping (ID-based mapping). This is the decisive difference from a regular Parquet table, which finds columns by name or position. When the exam presents "safe evolution in a data lake where the schema changes often," think of a table format like Iceberg.

## Glue Data Quality: Verifying the Data Is "Correct"

Even if the schema is right, **the values can be wrong**. The amount is negative, 90% of a required column is null, or IDs are duplicated. Schema validation looks at "shape," while data quality validation looks at "content." **AWS Glue Data Quality** is a service that defines rules about data and validates them automatically.

Rules are written in a declarative language called **DQDL (Data Quality Definition Language)**.

```
Rules = [
    IsComplete "order_id",                       # must have no nulls
    IsUnique "order_id",                         # must have no duplicates
    ColumnValues "amount" >= 0,                  # amount must be 0 or more
    ColumnValues "status" in ["NEW","PAID","CANCELLED"],
    Completeness "email" > 0.95,                 # at least 95% populated
    RowCount between 1000 and 1000000,           # row count range
    ColumnValues "created_at" matches "\\d{4}-\\d{2}-\\d{2}"
]
```

Glue Data Quality can be used in two ways. (1) Attach rules to a **Data Catalog table** and validate periodically, or (2) put it in as a **transform node inside a Glue ETL pipeline** to "block/quarantine data that falls short of quality before loading." The second is especially powerful — it stops bad data before it flows downstream.

```python
# A quality gate in the middle of an ETL pipeline (conceptual)
# Rows that pass the rules → normal path, rows that fail → quarantine bucket
ruleset = """Rules = [ ColumnValues "amount" >= 0, IsComplete "order_id" ]"""
# The EvaluateDataQuality transform branches into pass/fail
```

> ⚠️ **Gotcha**: Glue Data Quality has a feature to **automatically generate recommended rules**. It analyzes the data and suggests rules that look appropriate, but you must not trust them as-is. Recommendations are based on the current data distribution, so they can flag normal future changes as "anomalies" and produce false positives. Use the recommendations as a starting point, but a person must review and adjust them to fit the business rules.

## Quality Score and Operational Integration

After a Data Quality Job runs, it produces a **quality score (the ratio of rules that passed)** and per-rule pass/fail details. You can send these results to CloudWatch/EventBridge to set up alerts, or build a branch in Step Functions such as "stop the pipeline if the score is below the threshold." The key is to make quality an **observable metric**.

> 🎯 **Scenario**: Daily sales data must have its quality validated automatically before being loaded into an analytics table. Architecture: (1) Insert an EvaluateDataQuality node into the Glue ETL pipeline → (2) Define rules in DQDL such as `amount >= 0`, `IsComplete "order_id"`, and `RowCount between ...` → (3) Load only passing data into the analytics table and branch failed rows to a quarantine bucket → (4) Send the quality score to CloudWatch and send an SNS alert if it is below the threshold → (5) Trigger an operations workflow through EventBridge on failure. Bad data is blocked before it reaches the dashboard.

## The Eight Compatibility Modes and Deployment Order

In the main text we saw only BACKWARD, FORWARD, and FULL, but there are actually eight modes. A compatibility mode is the rule that judges "may this new schema version be registered?", and a version that does not pass fails at the registration request itself.

| Mode | Compared against | Allowed changes | Which side to upgrade first |
|------|------------------|-----------------|-----------------------------|
| BACKWARD | The previous version | Delete fields, add optional fields | Consumers |
| BACKWARD_ALL | All previous versions | Same as above | Consumers |
| FORWARD | The previous version | Add fields, delete optional fields | Producers |
| FORWARD_ALL | All previous versions | Same as above | Producers |
| FULL | The previous version | Add and delete optional fields | Either side |
| FULL_ALL | All previous versions | Same as above | Either side |
| NONE | No check | Anything is registered | For the development stage |
| DISABLED | — | Blocks registering new versions altogether | Schema freeze |

- **Why "which side to upgrade first" is determined**: BACKWARD guarantees that old data can be read with the new schema, so even if you move consumers to the new schema first, they can still read records that arrive in the old format. FORWARD guarantees that new data can be read with the old schema, so you may change the producers first.
- **When `_ALL` is needed**: If you replay a stream from a past point, records from several versions back come in mixed together. BACKWARD, which compares only the previous version, does not guarantee compatibility between v1 and v3. For long-retention streams or topics that are reprocessed often, the `_ALL` family is the right fit.
- **NONE and DISABLED are opposites.** NONE accepts any version without checking, while DISABLED locks the schema so no new versions can be added to it.

Assume an Avro schema consists of name (required), email (required), and phone number (optional).

| Change | BACKWARD | FORWARD | Reason |
|--------|----------|---------|--------|
| Delete required field `email` | Registers | Rejected | The new consumer can simply ignore the extra field in old records, but the old consumer cannot find the required value in new records |
| Add required field `zip_code` | Rejected | Registers | The new consumer cannot find the required value in old records, but the old consumer can simply ignore the unknown field |
| Add optional field `zip_code` | Registers | Registers | It is a field that may be absent, so both sides can read |

An incompatible schema is blocked **before it enters the stream**. A producer's serializer with auto-registration turned on registers (or looks up) the schema in the Registry before sending a record, and if the compatibility check fails, registration is rejected and it cannot send in that format. That is the difference between finding out after parsing breaks on the consumer side and having it surface right at the producer deployment stage. Schema Registry itself has no additional charge, and has limits of 100 registries and 10,000 schema versions per Region, and 170KB for a schema body.

## Schema Registry and Data Catalog Are Different Things

Both are in the Glue console and both deal with "schemas," so they often get mixed up.

| Aspect | Glue Schema Registry | Glue Data Catalog |
|--------|----------------------|-------------------|
| Target | Records flowing over a stream | Tables stored in S3, etc. |
| What it holds | Schema definitions and their versions (Avro / JSON Schema / Protobuf) | Tables, partitions, locations, formats |
| When the schema is applied | When the producer serializes, when the consumer deserializes | When the query engine reads (schema-on-read) |
| Change control | Rejects registering new versions via compatibility modes | Crawler schema change policy, manual DDL |
| Who populates it | The serializer's auto-registration or the API | Crawlers, DDL, ETL Jobs |
| Used by | Kafka/MSK and Kinesis clients, Managed Flink, Lambda | Athena, Redshift Spectrum, EMR, Glue ETL |

## DQDL in More Depth: Rule Types and Expressions

| What you want to check | Example rule types |
|------------------------|--------------------|
| Is it non-empty | `IsComplete`, `Completeness` |
| Are there no duplicates | `IsUnique`, `Uniqueness`, `IsPrimaryKey` |
| Value range, format, allowed list | `ColumnValues`, `ColumnLength`, `ColumnDataType` |
| Is the volume normal | `RowCount`, `ColumnCount` |
| Is the data fresh | `DataFreshness` |
| Does it match other datasets | `ReferentialIntegrity`, `DatasetMatch`, `RowCountMatch` |
| Does the schema match expectations | `SchemaMatch`, `ColumnExists` |
| Conditions hard to express with the types above | `CustomSql` |

```
Rules = [
    # Require "most," not all: passes if more than 95% are in the allowed list
    ColumnValues "status" in ["NEW","PAID","CANCELLED"] with threshold > 0.95,
    # Composite rule: wrap each rule in parentheses and combine with and / or
    (IsComplete "order_id") and (IsUnique "order_id"),
    # Dynamic rule: compare with recent run history instead of a fixed number
    RowCount > avg(last(3))
]
```

- **The difference between `IsComplete` and `Completeness`**: The former passes only if there is not a single null, while the latter compares the populated ratio to an expression (`Completeness "email" > 0.95`).
- **`between` does not include the endpoint values.** `RowCount between 1000 and 1000000` fails if there are exactly 1,000 rows. To include the boundary values, write `>=` and `<=`.
- **The default evaluation unit of a composite rule is the dataset, not the row.** Each rule is first evaluated against the whole table, and then the results are combined with and/or. To make it mean "A or B for each row," a separate setting that switches the evaluation to row level is needed.
- A **dynamic rule** expresses a relative criterion such as "did it drop sharply compared with yesterday." If there is no history yet to compare against, `last()` returns 0, so know that the first run passes easily when you use it.
- Columns with nested structures or list types cannot be evaluated by rules and must be flattened first. A single ruleset can hold up to 2,000 rules.

## The Difference Between the Two Entry Points: Checking Stored Data and Blocking Before Load

| Feature | Against Data Catalog tables | Inside an ETL Job |
|---------|-----------------------------|-------------------|
| Nature | Periodically checks data already stored | Pre-validation that filters before loading |
| Primary user | Data stewards and analysts who don't write code | Engineers building pipelines |
| Rule recommendation | Supported | Not supported |
| Identifying records that failed the quality check | Not supported | Supported |
| Validating only new data | Pushdown predicate | Job bookmark |
| CloudWatch/EventBridge integration | Supported | Supported |

A requirement of "only the bad rows to a quarantine bucket" can be implemented only on the ETL side, where failed records can be identified. Conversely, the flow that starts from recommended rules begins on the Catalog side.

```python
# An example of splitting pass/fail by row-level results inside an ETL Job (conceptual)
from awsgluedq.transforms import EvaluateDataQuality
from awsglue.transforms import SelectFromCollection

dq = EvaluateDataQuality().process_rows(
    frame=orders,
    ruleset=ruleset,
    publishing_options={
        "dataQualityEvaluationContext": "orders_dq",
        "enableDataQualityCloudWatchMetrics": True,
        "enableDataQualityResultsPublishing": True,
    },
)
rows = SelectFromCollection.apply(dfc=dq, key="rowLevelOutcomes").toDF()
good = rows.filter(rows.DataQualityEvaluationResult == "Passed")  # to the analytics table
bad = rows.filter(rows.DataQualityEvaluationResult == "Failed")   # to the quarantine bucket
```

What can be split row by row are rules like `ColumnValues`, where each row is determined to be true or false. A rule about the whole dataset such as `RowCount` has no "which row is wrong," so use it not for quarantine but as a gate that stops the entire Job.

## Schema Problem or Quality Problem: A Discrimination Table

| Symptom | Kind of problem | Owner |
|---------|-----------------|-------|
| The producer changed a field type and the consumer's deserialization breaks | Schema contract on a stream | Schema Registry compatibility mode |
| Negative amounts, duplicate IDs, nulls in required columns | Quality of values | Glue Data Quality |
| The row count is half of yesterday's | Volume anomaly | Data Quality `RowCount` (dynamic rule) |
| After renaming a column in a lake table, past data looks empty | Table schema evolution | A table format such as Iceberg |
| One column mixes integers and strings and the ETL dies | Type conflict in batch | DynamicFrame `ResolveChoice` |
| A crawler changes the table definition | Catalog schema change | The crawler's schema change policy |

Tomorrow we do a comprehensive review of this week's Glue transformations.

## 📖 Glossary

- **Schema evolution**: The schema changing over time, such as adding or deleting fields or changing types, and the way of accepting those changes without breaking existing data or consumers.
- **Compatibility mode**: Schema Registry's rule that judges whether a new schema version may be registered. If it does not pass, registration is rejected.
- **BACKWARD compatibility**: The property that a consumer using the new schema can read data written with the previous schema.
- **FORWARD compatibility**: The property that a consumer using the previous schema can read data written with the new schema.
- **Serialization / deserialization**: Converting an object into bytes for transmission and converting those bytes back into an object. Both sides must know the same schema.
- **DQDL**: The declarative language for writing Glue Data Quality rules. Rules are listed inside `Rules = [ ... ]`.
- **Quality score**: The ratio of rules in a ruleset that passed.
- **Quality gate**: A checkpoint in a pipeline that prevents data failing the quality criteria from moving to the next stage.
- **Quarantine**: Collecting records that failed the rules in a separate location instead of discarding them.
- **Open table format**: A format such as Iceberg, Hudi, or Delta Lake that layers schema, snapshot, and transaction metadata on top of a set of files so they can be treated as a table.

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
