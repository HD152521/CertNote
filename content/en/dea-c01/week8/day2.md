# Day 2 - Data Quality and Validation: Glue Data Quality and Quality Gates

## 📌 Key Takeaways

- Data quality is measured along six dimensions: completeness, accuracy, consistency, validity, uniqueness, and timeliness. Place validation as close to ingestion as possible (shift-left).
- Glue Data Quality declares rules in **DQDL** and produces a quality score from the ratio of rules that pass. It runs in two places: on Data Catalog tables and in ETL jobs.
- Rule recommendation is available on the Data Catalog side, while **identifying** bad rows (row-level results) is available on the ETL job side. Which entry point to use depends on which of these the requirement needs.
- Fixed thresholds are weak against seasonality. Combine anomaly detection (`DetectAnomalies`), which learns from historical statistics, with dynamic rules (`last(k)`), which use the previous runs as the baseline.
- If the standard is not met, block downstream steps with a Step Functions Choice state, keep the data in a quarantine area, and then flow it back through idempotent reprocessing.

## Six Dimensions of Data Quality

"Garbage in, garbage out." No matter how robust the pipeline, if incoming data is wrong, results are unreliable. Today we measure and enforce quality, and look at how to filter out bad data and reprocess it.

| Dimension | What it asks | Example DQDL rules |
|------|------|------|
| Completeness | Are required values non-empty? | `IsComplete`, `Completeness` |
| Uniqueness | Are there no duplicates? | `IsUnique`, `IsPrimaryKey`, `Uniqueness` |
| Validity | Does it follow the format, range, and allowed values? | `ColumnValues`, `ColumnDataType`, `ColumnLength` |
| Consistency | Are there no contradictions between tables or systems? | `ReferentialIntegrity`, `DatasetMatch`, `RowCountMatch`, `SchemaMatch` |
| Timeliness | Is the data fresh enough? | `DataFreshness` |
| Accuracy | Does it match real facts? | `CustomSql`, `AggregateMatch` (compare against reference data) |

- Accuracy is not settled by a single rule. It can only be approximated by reconciling totals and counts against trustworthy reference data.

> 💡 **Related theory**: Place quality validation as **early in the pipeline (right after ingestion)** as possible. If bad data is discovered after it has flowed all the way to the curated zone, the blast radius and the reprocessing cost grow sharply (shift-left).

## The Two Entry Points of Glue Data Quality

Glue Data Quality is a serverless feature built on the open-source Deequ. It uses the same DQDL, but there are two places to run it, and what you can do differs.

| Item | Run on the Data Catalog | Run inside an ETL job |
|------|------|------|
| Target | Tables already registered in the catalog (S3, Redshift, JDBC, Iceberg, Hudi, Delta, etc.) | Any source Glue can read |
| Nature | Inspection of data that has accumulated (at rest) | Pre-check that filters **before** loading (in motion) |
| Rule recommendation | Supported | Not supported |
| Bad row identification | Not supported | Supported |
| Auto Scaling and Flex | Not supported | Supported |
| Incremental validation | Limit the range with a pushdown condition | Job bookmark |
| EventBridge and CloudWatch integration | Supported | Supported |
| Main users | Data stewards and analysts (no code) | Data engineers |

- "Pick out only the bad records to quarantine and load the rest" has to be the ETL side. "I don't know which rules to put on an existing table" gets you a first draft from **rule recommendation** on the Data Catalog side.
- Columns of nested structure or list type cannot be evaluated by rules. Flatten them first, then evaluate.

## A Closer Look at DQDL Syntax

A DQDL document is case-sensitive and lists rules, separated by commas, inside a list named `Rules`.

```text
Rules = [
    RowCount > 1000,
    IsComplete "order_id",
    IsUnique "order_id",
    ColumnValues "status" in ["NEW", "PAID", "SHIPPED", "CANCELLED"],
    ColumnValues "amount" between 0 and 1000000,
    Completeness "customer_email" > 0.95,
    ColumnDataType "created_at" = "TIMESTAMP",
    DataFreshness "created_at" <= 24 hours,
    ReferentialIntegrity "customer_id" "customers.customer_id" >= 0.99,
    (IsComplete "coupon_code") or (ColumnValues "discount" = 0),
    ColumnValues "country" in ["KR", "JP", "US"] with threshold > 0.98
]
```

| Syntax element | Meaning | Caution |
|------|------|------|
| `IsComplete` vs `Completeness` | Is everything filled in vs the ratio filled in | For columns where 100% cannot be required, use the ratio rule |
| `between x and y` | Range check | The endpoints are **not included** |
| `with threshold` | Pass decision based on the ratio of values meeting the condition | Only in `ColumnValues`, `ColumnDataType`, and `CustomSql` |
| `and` / `or` | Combine rules (composite rules) | Wrap each combined rule in parentheses |
| `where "..."` | Filters the target rows with a SparkSQL condition before evaluating | When there is a threshold, `where` comes before `with threshold` |
| `CustomSql` | Decides based on the result of SQL | For business rules that cannot be expressed as rules |
| `ReferentialIntegrity` | Ratio of values that exist in the reference dataset | The reference dataset must be passed along under an alias |

- By default, a composite rule **evaluates each rule separately against the whole table** and then combines the results. If you want the SQL-style meaning of "a row passes if A or B holds for that row," you must change the evaluation method to row level (`compositeRuleEvaluation.method = ROW`). If you do not know this, an OR rule fails unexpectedly.
- A **dynamic rule** puts results from past runs where the threshold would go. `last(k)` points to the values of the previous k runs, and when k is 2 or more you must reduce them to one number with an aggregate such as `avg`, `min`, or `max`.
- The **Analyzers** block collects statistics only, with no condition. When you do not yet know the data well enough to write rules, accumulate statistics first, and anomaly detection then uses those statistics.

```text
Rules = [
    RowCount >= min(last(7)),           # Fails if it drops below the lowest day of the last 7 runs
    DetectAnomalies "RowCount"           # Fails if it deviates from the historical trend
]
Analyzers = [
    DistinctValuesCount "customer_id",
    Completeness "customer_email"
]
```

## How the Score Is Calculated

- **Quality score = number of rules that passed ÷ total number of rules.** It is not the ratio of bad rows. If 1 of 10 rules fails, the score is 0.9 even if that rule failed because of a single row.
- So setting the gate criterion on the score alone is risky. Rules that must never break (PK duplicates, missing required columns) should stop the run immediately on failure, independent of the score, and the rest are judged by score.
- Observations generated by anomaly detection are not reflected in the score. The score is determined by rules alone.

| Limit | Value |
|------|------|
| Rules per ruleset | 2,000 |
| Ruleset size | 65KB |
| Statistics stored per account | 100,000, retained for up to 2 years |

## Statistics-Based Anomaly Detection

A fixed threshold (`RowCount > 1000`) produces false positives when data volume varies by weekday or season, and after the business grows it catches nothing at all. A rule built on 1 million records a day will still pass even if 25% goes missing once 2 million records a day have become normal.

- Each time rules and Analyzers run, statistics accumulate inside the Glue service, and anomaly detection learns the trend in these statistics to build an expected range (upper and lower bounds). If an actual value falls outside the range, it generates an observation.
- Detection needs **at least three data points**. In the first few runs nothing comes out.
- A value caught as an anomaly once is **learned as a normal value from the next run onward** unless you exclude it explicitly. If you leave values caused by an incident as they are, the same incident cannot be caught again. Excluding statistics gives feedback to the model.
- There are two detection modes. The default mode (Linear) follows trend and seasonality, and the other (Fixed) ignores time gaps and looks only at the baseline. If the run interval is irregular, the latter is the right choice.
- Billing is for the time spent on detection, and DPUs are charged per statistic. Storing the statistics itself is free.

| Approach | Basis | Strength | Weakness |
|------|------|------|------|
| Static rule | Absolute value set by a person | Clear meaning, works from the first run | Weak against growth and seasonality |
| Dynamic rule `last(k)` | Values of the previous k runs | Explainable, failure is handled as a rule | Cannot see weekday patterns |
| Anomaly detection | Learned trend and seasonality | A person need not know the threshold | Needs initial data, vulnerable to contaminated learning |

> 💡 **Related theory**: Anomaly detection catches "different from usual," not "the absolute value is wrong." CloudWatch Anomaly Detection learns the normal range of a metric with the same idea. The difference is the target: CloudWatch looks at operational metrics, while Glue Data Quality looks at statistics of the data itself.

## Evaluating Inside an ETL Job and Splitting Rows

```python
from awsgluedq.transforms import EvaluateDataQuality
from awsglue.transforms import SelectFromCollection

result = EvaluateDataQuality().process_rows(
    frame=orders_dyf,
    ruleset=ruleset,
    publishing_options={
        "dataQualityEvaluationContext": "orders_ingest",
        "enableDataQualityCloudWatchMetrics": True,
        "enableDataQualityResultsPublishing": True,
    },
)

# Per-rule results (pass/fail, failure reason)
rule_outcomes = SelectFromCollection.apply(dfc=result, key="ruleOutcomes")

# Per-row results: original columns + 4 verdict columns
rows = SelectFromCollection.apply(dfc=result, key="rowLevelOutcomes").toDF()
valid = rows.filter(rows.DataQualityEvaluationResult == "Passed")
invalid = rows.filter(rows.DataQualityEvaluationResult == "Failed")

valid.write.mode("append").parquet("s3://lake-clean/orders/")
invalid.write.mode("append").json("s3://lake-quarantine/orders/dt=2026-06-26/")
```

- Four columns are attached to the row-level result: `DataQualityRulesPass`, `DataQualityRulesFail`, `DataQualityRulesSkip`, and `DataQualityEvaluationResult`. Because the rows record which rules they failed, you can store them in the quarantine area **together with the failure reason**.
- Rules that cannot be decided from a single row, such as column existence (`ColumnExists`), are marked in the row-level result as skipped rules (`DataQualityRulesSkip`).

## Validation Gates and Notification

A validation gate is a control point that **blocks downstream progress** when quality does not meet the standard.

```text
[Glue job: ingest + DQ evaluation] → Choice state
   ├─ Critical rules pass AND score >= 0.95 → [load to curated]
   └─ Otherwise → [quarantine] → [SNS notification] → [terminate as failed]
```

- When an evaluation finishes, an event goes out to EventBridge. Create a rule that picks up only failed evaluations and forwards them to SNS or Lambda. In CloudWatch, the number of passed and failed rules appears as metrics (`glue.data.quality.rules.passed` / `failed`).
- EventBridge publishing works only if the "publish metrics to CloudWatch" option is on. If you turn off metric publishing, events stop too.

```json
{
  "source": ["aws.glue-dataquality"],
  "detail-type": ["Data Quality Evaluation Results Available"],
  "detail": { "state": ["FAILED"] }
}
```

- Data that does not pass the gate is sent to the **quarantine area** rather than discarded or overwritten. Lowering the threshold to let it through is the same as removing the gate.

## Designing Quarantine and Reprocessing

| Principle | Content |
|------|------|
| Block the whole batch vs split by row | If the schema is broken or the count drops sharply, block the entire batch. If only some rows have format errors, let the normal rows through and quarantine only the bad rows |
| Preserve the original | Keeping the raw zone immutable lets you reprocess from scratch at any time |
| Idempotency | Processing the same input twice must give the same result. Implement with upsert (MERGE) or partition-level overwrite |
| Partition-level reprocessing | Reprocess only the affected date partition to reduce cost and impact |
| Record failure reasons | Leave in the quarantined data which rule failed and why. A quarantine bucket without reasons becomes a graveyard no one opens |

- The reprocessing path must pass through **the same validation** as the normal path. The shortcut of fixing quarantined data by hand and inserting it directly into curated bypasses the gate.
- Append-style loading creates duplicates on reprocessing. Design tables that are meant to be reprocessed with overwrite or MERGE from the start.

## Distinguishing Similar Tools

| Tool | What it does | Clue for choosing it |
|------|------|------|
| Glue Data Quality | DQDL rules, scores, anomaly detection | "Measure and enforce quality with rules," "block inside the pipeline" |
| Glue DataBrew | No-code profiling and cleansing | "An analyst visually explores and cleanses data" |
| Glue Schema Registry | Versioning and compatibility checks for stream schemas | "Prevent producers from sending incompatible schemas" |
| CloudWatch Anomaly Detection | Learns the normal range of operational metrics | "Dynamic thresholds for metrics such as lag and error rate" |
| Athena SQL validation query | Manual, ad hoc checks after loading | "One-time check"; no rule management features |

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| One row is wrong but the score drops sharply | The score is a rule-level ratio | Express the tolerance with ratio rules (`Completeness`, `with threshold`) |
| A rule combined with OR always fails | Each rule is evaluated over everything, then combined | Change composite rule evaluation to row level |
| Anomaly detection catches nothing | Fewer than 3 data points, or anomalous values were included in learning | Accumulate enough runs, exclude anomalous statistics |
| No notification arrives on failure | CloudWatch metric publishing is off | Keep the publishing option on |
| Count doubles after reprocessing | Append-style load | Partition overwrite or MERGE |
| A rule on a nested column is not evaluated | Nested and list types unsupported | Flatten, then evaluate |

## Question Clue → Answer Lookup Table

| Question clue | Answer |
|------|------|
| "A language for defining quality rules declaratively" | DQDL |
| "It is hard to write rules from scratch; generate a draft automatically" | Rule recommendation (Data Catalog) |
| "Identify only the bad records and quarantine them" | Row-level results in an ETL job |
| "Volume changes by weekday and season; reduce false positives" | Anomaly detection / dynamic rules |
| "Keep data that fails the standard from reaching downstream" | Step Functions Choice gate + quarantine |
| "Automatic notification on failure" | EventBridge rule → SNS |
| "No duplicates even when reprocessed" | Idempotency (MERGE, partition overwrite) |
| "Control schema changes from streaming producers" | Glue Schema Registry |

Tomorrow we cover how to reconstruct what happened when a pipeline fails: CloudTrail auditing, retries, and DLQs.

## 📖 Glossary

- **DQDL**: The declarative language for writing Glue Data Quality rules. You write only what must be satisfied.
- **Ruleset**: A bundle of quality rules. Evaluating it produces per-rule results and a score.
- **Quality score**: The ratio of rules that passed in a ruleset. It is not the ratio of bad rows.
- **Analyzer**: A DQDL statement that collects statistics only, with no pass or fail verdict.
- **Dynamic rule**: A rule that compares against values from previous runs (`last(k)`) instead of fixing the threshold.
- **Anomaly detection**: A feature that learns the trend of accumulated statistics and finds values that differ from usual.
- **Validation gate**: A point that blocks progress to the next stage when quality falls short of the standard.
- **Quarantine**: An area where bad data is collected separately rather than deleted.
- **Idempotency**: The property that doing the same operation many times gives the same result as doing it once.
- **shift-left**: The principle of moving validation to the front of the pipeline to stop contamination before it spreads.

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
