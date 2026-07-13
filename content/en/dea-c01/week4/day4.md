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

## 📝 연습 문제

**문제 1.** Kafka/Kinesis 스트리밍에서 생산자가 보낸 메시지 형식을 소비자가 안전하게 역직렬화하도록, 스키마를 중앙 등록하고 호환성 규칙을 강제하는 서비스는?

A) Glue Data Catalog  
B) Glue DataBrew  
C) Glue Schema Registry  
D) Glue 크롤러  

**정답: C**  
해설: Schema Registry는 스트리밍 데이터의 스키마를 버전 관리하고 BACKWARD/FORWARD/FULL 호환성을 강제해 생산자-소비자 계약을 보장한다. Data Catalog는 배치 분석용 메타데이터, DataBrew는 정제 도구, 크롤러는 메타데이터 등록 도구로 호환성 강제와 무관하다.

---

**문제 2.** 새 스키마로 만든 소비자가 과거 데이터를 문제없이 읽을 수 있도록 보장하는 Schema Registry의 호환성 모드는?

A) FORWARD  
B) NONE  
C) DISABLED  
D) BACKWARD  

**정답: D**  
해설: BACKWARD 호환은 "새 스키마 소비자가 옛 데이터를 읽을 수 있음"을 보장하며, 기본값 있는 필드 추가나 필드 삭제를 허용한다. FORWARD는 반대로 옛 소비자가 새 데이터를 읽는 경우를 보장한다. NONE/DISABLED는 검증을 하지 않아 안전성을 보장하지 못한다.

---

**문제 3.** 데이터의 스키마는 올바르지만 `amount` 컬럼에 음수 값이 섞여 있고 `order_id`에 중복이 있다. 이를 규칙으로 정의해 자동 검증하고 적재 전 차단하려면?

A) Glue 크롤러의 파티션 탐지를 사용  
B) Glue Data Quality에 DQDL 규칙을 정의하고 ETL 파이프라인에 품질 게이트로 통합  
C) Schema Registry의 호환성 모드를 FULL로 설정  
D) Athena 파티션 프로젝션을 적용  

**정답: B**  
해설: 값의 유효성(음수 금지, 중복 금지)은 스키마가 아니라 데이터 품질의 문제이며, Glue Data Quality의 DQDL 규칙(ColumnValues, IsUnique 등)으로 정의해 ETL 파이프라인 게이트로 차단·격리한다. Schema Registry는 형태만 검증하고, 크롤러·파티션 프로젝션은 값 검증과 무관하다.

---

**문제 4.** 데이터 레이크 배치에서 컬럼 이름을 바꿔도 데이터 매핑이 깨지지 않도록 컬럼에 고유 ID를 부여해 안전한 스키마 진화를 지원하는 테이블 포맷은?

A) 순수 CSV  
B) 압축되지 않은 JSON  
C) Apache Iceberg  
D) 단일 Parquet 파일(테이블 포맷 없음)  

**정답: C**  
해설: Apache Iceberg는 컬럼에 고유 ID를 부여해 이름 변경·추가·삭제를 트랜잭션으로 안전하게 처리한다. 위치 기반 매핑인 순수 Parquet/CSV/JSON은 컬럼 이름 변경 시 매핑이 깨질 수 있어 안전한 진화를 보장하지 못한다.

---

**문제 5.** Glue Data Quality의 자동 추천 규칙에 대한 올바른 태도는?

A) 추천은 현재 데이터 분포 기반이라 정상적 변화를 오탐할 수 있으므로 출발점으로 삼되 사람이 검토·조정한다  
B) 추천 규칙은 항상 정확하므로 그대로 운영에 적용한다  
C) 추천 기능은 존재하지 않는다  
D) 추천 규칙은 스키마 호환성만 검사한다  

**정답: A**  
해설: 추천 규칙은 현재 데이터 분포를 기반으로 생성되므로 미래의 정상적 변화를 이상으로 판정하는 오탐을 낼 수 있다. 따라서 출발점으로 활용하되 비즈니스 규칙에 맞게 사람이 검토·조정해야 한다. 추천 기능은 실제로 존재하며 값 기반 품질 규칙을 다룬다.

---
