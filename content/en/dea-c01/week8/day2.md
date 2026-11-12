# Day 2 - Data Quality and Validation: Glue Data Quality and Quality Gates

"Garbage in, garbage out." No matter how robust the pipeline, if incoming data is wrong, results are unreliable. Today we measure and enforce data quality, filter bad data, and prepare for reprocessing.

## Six Dimensions of Data Quality

Data quality typically spans six dimensions:

- **Completeness**: Required values not empty (NULL ratio).
- **Accuracy**: Match actual fact.
- **Consistency**: No contradictions across systems/columns.
- **Validity**: Follow defined format, range, domain.
- **Uniqueness**: No duplicates (PK duplicates).
- **Timeliness**: Data sufficiently fresh.

> 💡 **Related Theory**: Place quality validation as far **upstream** (right after collection) as possible. Discovering bad data after flowing to curated zone multiplies impact and reprocessing cost exponentially (shift-left).

## AWS Glue Data Quality

Glue Data Quality defines data quality rules in declarative **DQDL (Data Quality Definition Language)** and scores compliance. Run on Glue Data Catalog tables or within ETL jobs.

```text
Rules = [
    RowCount > 1000,
    IsComplete "order_id",
    IsUnique "order_id",
    ColumnValues "status" in ["NEW", "PAID", "SHIPPED", "CANCELLED"],
    ColumnValues "amount" between 0 and 1000000,
    Completeness "customer_email" > 0.95,
    ColumnDataType "created_at" = "TIMESTAMP"
]
```

Overall quality score computed from pass ratio of each rule; results sent to CloudWatch and EventBridge.

### Recommendation Feature

Harder to write rules from scratch, Glue Data Quality analyzes data and **auto-recommends** rule drafts. Review and modify recommendations for baseline.

## Statistics-Based Anomaly Detection

Fixed thresholds (e.g., RowCount > 1000) false-alarm when data volume changes seasonally. Glue Data Quality's **anomaly detection** learns past trends dynamically detecting abnormal.

```text
# Static rule: absolute threshold — vulnerable to traffic swings
RowCount > 1000

# Dynamic rule: anomalous vs. past trend — reflects seasonality, growth
DetectAnomalies "RowCount"
```

CloudWatch Anomaly Detection similarly learns normal metric band(s); alarm when outside. Combine static and dynamic detection for safety.

> 💡 **Related Theory**: Anomaly detection catches "different from normal," not "absolute value wrong." Better false-alarm rate than static thresholds on variable pipelines.

## Quality Gates (Validation Gates)

Quality gates **block downstream progression** when quality score misses threshold. Step Functions branching typical:

```text
[Glue DQ eval] → Choice state
   ├─ score >= 0.95  → [curated load continue]
   └─ score <  0.95  → [quarantine + SNS notify + pipeline stop]
```

Data failing gate not dropped or overwritten; sent to **quarantine bucket** for root cause analysis and reprocessing prep.

## Bad Record Separation: Dead Letter/Quarantine Pattern

Rather than block entire batch, often partition records into valid/invalid:

```python
# Separate valid/invalid via validation (concept example)
valid = records.filter(is_valid)
invalid = records.filter(lambda r: not is_valid(r))

valid.write.parquet("s3://lake-clean/orders/...")
invalid.write.json("s3://lake-quarantine/orders/dt=2026-06-26/")
```

- Valid records proceed normally.
- Bad records saved to quarantine with original and failure reason.
- Quarantined data undergoes **reprocessing** pipeline after fix.

## Reprocessing Design Principles

- **Idempotency**: Same input processed twice yields same result. Use upsert (MERGE) or deterministic partition overwrite.
- **Original preservation**: Keep raw zone immutable; always reprocess from beginning if needed.
- **Partition-level reprocessing**: Reprocess only problem date partition to minimize cost and impact.

## Key Takeaways

- Data quality 6 dimensions: completeness, accuracy, consistency, validity, uniqueness, timeliness.
- Glue Data Quality declares rules in DQDL, recommendation feature generates draft, provides scoring and anomaly detection.
- Static threshold + dynamic anomaly detection together robust against traffic variation.
- Quality gate (Step Functions Choice) blocks downstream on misses, quarantine then idempotent reprocess.

## 📝 Practice Questions

**Question 1.** In AWS Glue Data Quality, which language is used to declaratively define the quality rules of a dataset?

A) HiveQL  
B) PartiQL  
C) JSONPath  
D) DQDL(Data Quality Definition Language)  

**Answer: D**  
Explanation: Glue Data Quality defines rules such as RowCount, IsComplete, and IsUnique declaratively with DQDL. HiveQL/PartiQL are query languages and JSONPath is a JSON path expression, and none is used to define quality rules.

---

**Question 2.** In a pipeline where the data volume varies greatly by day of the week and season, which approach is most appropriate for detecting anomalies with fewer false positives than a fixed threshold?

A) Use only absolute thresholds such as RowCount > 1000  
B) Anomaly detection that learns past trends  
C) Apply IsUnique to every record  
D) Disable quality validation  

**Answer: B**  
Explanation: Anomaly detection learns the historical trend and normal range of a metric to catch values that are "different from usual," so it is robust to variation caused by seasonality and growth. A fixed threshold produces many false positives when traffic varies, IsUnique is only a duplicate check, and disabling validation gives up on quality assurance.

---

**Question 3.** What is the recommended action for data whose score falls below the standard at a data quality validation gate?

A) Load it into the curated zone as is and correct it later  
B) Ignore and delete it  
C) Keep it in a quarantine area and block downstream progress  
D) Automatically lower the threshold so that it passes  

**Answer: C**  
Explanation: Data that fails is stored in a quarantine area along with the original and the failure reason, and downstream progress is blocked to prepare for root cause analysis and reprocessing. Overwriting curated or deleting corrupts or loses data, and lowering the threshold defeats the purpose of the quality gate.

---

**Question 4.** When reprocessing quarantined bad data after fixing it, which property guarantees that processing the same input multiple times produces the same result?

A) Idempotency  
B) Volatility  
C) Cardinality  
D) Serializability  

**Answer: A**  
Explanation: Idempotency is the property that repeatedly processing the same input does not change the result, and it is implemented with upserts (MERGE) or deterministic partition-level overwrites to prevent duplicates on reprocessing. The others are not concepts directly related to preventing duplicates on reprocessing.

---

**Question 5.** What is the main reason it is recommended to place data quality validation early in the pipeline (right after ingestion)?

A) Because storage cost is reduced  
B) Because query performance improves  
C) Because IAM permissions become simpler  
D) Because if bad data flows through to curated before being discovered, the impact and reprocessing cost explode  

**Answer: D**  
Explanation: Under the shift-left principle, placing validation at the front blocks bad data before it propagates downstream, minimizing the scope of impact and reprocessing cost. Cost, performance, and permissions may also incidentally improve, but the core reason is stopping the spread of contamination.

---
