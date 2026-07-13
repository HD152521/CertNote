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

## 📝 연습 문제

**문제 1.** AWS Glue Data Quality에서 데이터셋의 품질 규칙을 선언형으로 정의하는 데 사용하는 언어는?

A) HiveQL  
B) PartiQL  
C) JSONPath  
D) DQDL(Data Quality Definition Language)  

**정답: D**  
해설: Glue Data Quality는 DQDL로 RowCount, IsComplete, IsUnique 등 규칙을 선언형으로 정의합니다. HiveQL/PartiQL은 쿼리 언어, JSONPath는 JSON 경로 표현식으로 품질 규칙 정의 용도가 아닙니다.

---

**문제 2.** 데이터 양이 요일·계절에 따라 크게 변하는 파이프라인에서, 고정 임계값보다 오탐이 적게 비정상을 탐지하려면 어떤 방식이 가장 적절한가?

A) RowCount > 1000 같은 절대 임계값만 사용  
B) 과거 추세를 학습하는 이상 탐지(anomaly detection)  
C) 모든 레코드에 IsUnique 적용  
D) 품질 검증을 비활성화  

**정답: B**  
해설: 이상 탐지는 지표의 과거 추세·정상 범위를 학습해 "평소와 다른" 값을 잡으므로 계절성·성장에 따른 변동에 강합니다. 고정 임계값은 트래픽 변동 시 오탐이 많고, IsUnique는 중복 검사일 뿐이며, 검증 비활성화는 품질 보장을 포기하는 것입니다.

---

**문제 3.** 데이터 품질 검증 게이트에서 점수가 기준에 미달한 데이터를 처리할 때 권장되는 동작은?

A) curated 존에 그대로 적재하고 나중에 정정  
B) 무시하고 삭제한다  
C) 격리(quarantine) 영역에 보관하고 다운스트림 진행을 막는다  
D) 임계값을 자동으로 낮춰 통과시킨다  

**정답: C**  
해설: 미달 데이터는 격리 영역에 원본·실패 사유와 함께 보관하고 다운스트림 진행을 차단해, 원인 분석과 재처리에 대비합니다. curated 덮어쓰기·삭제는 데이터를 오염·소실시키고, 임계값을 낮추는 것은 품질 게이트의 목적을 무력화합니다.

---

**문제 4.** 격리된 불량 데이터를 수정 후 다시 처리할 때, 같은 입력을 여러 번 처리해도 결과가 동일하도록 보장하는 속성은?

A) 멱등성(Idempotency)  
B) 휘발성(Volatility)  
C) 카디널리티(Cardinality)  
D) 직렬화 가능성(Serializability)  

**정답: A**  
해설: 멱등성은 동일 입력을 반복 처리해도 결과가 변하지 않는 속성으로, 업서트(MERGE)나 파티션 단위 결정적 덮어쓰기로 구현해 재처리 시 중복을 방지합니다. 나머지는 재처리 중복 방지와 직접 관련된 개념이 아닙니다.

---

**문제 5.** 데이터 품질 검증을 파이프라인의 앞쪽(수집 직후)에 두는 것이 권장되는 주된 이유는?

A) 스토리지 비용이 절감되기 때문  
B) 쿼리 성능이 향상되기 때문  
C) IAM 권한이 단순해지기 때문  
D) 불량 데이터가 curated까지 흘러간 뒤 발견 시 영향·재처리 비용이 폭증하기 때문  

**정답: D**  
해설: shift-left 원칙에 따라 검증을 앞단에 두면 불량 데이터가 하류로 전파되기 전에 차단해 영향 범위와 재처리 비용을 최소화합니다. 비용·성능·권한도 부수적으로 좋아질 수 있지만 핵심 이유는 오염 전파 차단입니다.

---
