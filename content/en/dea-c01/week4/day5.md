# Day 5 - Week 4 Synthesis: The Big Picture of AWS Glue Transformation

This week, we navigated the heart of data engineering — **transformation** — through the AWS Glue ecosystem. We captured metadata with Data Catalog, ran Spark transformations with ETL Job, built no-code transforms with Studio/DataBrew, and guaranteed reliability with Schema Registry and Data Quality. Today we stitch these pieces into one picture, clarify service selection criteria, and review exam traps.

## Glue Data Flow in One Chart

See how all Glue components fit together in a complete pipeline.

```
[Source Data]                S3 raw / Kinesis / MSK / JDBC
     │
     ├─(streaming)→ [Schema Registry] Schema contract, compatibility validation
     │
[Crawler] ──→ [Data Catalog] Register schema, partition metadata
     │              │
     │      (shared by all engines: Athena / Redshift Spectrum / EMR)
     ▼
[Transform Layer]
  ├─ Glue ETL Job (PySpark, DynamicFrame)   ← Engineers, code-based
  ├─ Glue Studio (visual ETL → code gen)    ← Engineers, no-code start
  └─ Glue DataBrew (cleaning·profiling)     ← Analysts, fully no-code
     │
[Quality Gate] Glue Data Quality (DQDL) — Load only passed, isolate failed
     │
     ▼
[Clean Data]  S3 Parquet/Iceberg → Update Catalog → Athena/Redshift/QuickSight

[Orchestration]  Glue Workflow/Trigger · Step Functions · MWAA(Airflow)
[Incremental]    Job Bookmark (transformation_ctx + job.commit())
```

The core insight: **Data Catalog is the center of everything**. Crawlers fill it, transformation tools read and write to it, analysis engines share it.

> 💡 **Related Theory**: This structure maps exactly to the **medallion architecture** (Bronze→Silver→Gold), the standard modern data platform. Crawlers log raw (Bronze), ETL/DataBrew clean it into Silver, further aggregation builds Gold (analysis marts). Glue Data Quality acts as a gate at each layer transition. Don't get lost in AWS service names; understand the universal pattern: "raw → cleaned → aggregated, with quality gates at each step," and it works on any cloud.

## Service Selection Decision Matrix

Exams relentlessly ask "what tool for this situation." Here's this week's criteria.

| Situation | Answer | Why |
|-----------|--------|-----|
| Auto-register S3 data schema/partitions | Glue Crawler → Data Catalog | Auto-infer metadata |
| Large-scale distributed ETL, code available | Glue ETL Job (Spark) | DynamicFrame, powerful transforms |
| Lightweight work <100MB, orchestration | Python Shell Job | Avoid distributed overhead, cheaper |
| Visual ETL, code conversion when needed | Glue Studio | Auto-generate code + edit |
| Analyst's no-code cleaning/profiling | Glue DataBrew | Preview, PII detection, recipes |
| Force streaming schema compatibility | Schema Registry | BACKWARD/FORWARD/FULL |
| Validate and block invalid data values | Glue Data Quality | DQDL rules, quality gates |
| Avoid full reprocessing every run | Job Bookmark | Incremental processing |
| Simple format conversion then S3 load | Firehose + Lambda | Glue is overkill |

Especially remember the last line. **Knowing when Glue isn't the answer** is true mastery. Simple format conversion is cheaper with Firehose+Lambda; complex cluster tuning or non-standard frameworks demand EMR.

## Common Traps Collected

We've emphasized gotchas each day this week. Here they are in one place.

```
[Day1] Non-Hive paths (2026/06/25/) fail auto-partition detection
       → Use key=value (year=2026/...) paths from the start

[Day2] Job Bookmark needs BOTH job.commit() AND transformation_ctx
       → Missing either, incremental processing breaks
       → Modified (overwritten) files are skipped by bookmark

[Day3] Studio = Engineer/production ETL, DataBrew = Analyst/exploratory cleaning
       → Both are "Glue visual" so easy to confuse, DataBrew also costs

[Day4] Schema Registry = form (schema), Data Quality = content (values)
       → Negatives/duplicates/nulls are quality issues, not schema issues
       → DQ auto-recommendations can false-positive, need human review
```

> ⚠️ **Gotcha**: The most common trap is **confusing Glue Crawler with Glue ETL Job**. Crawlers only "register metadata"—they don't transform or copy data. ETL Jobs actually read data, transform it, and write new versions. "Find the schema" = Crawler, "change the data" = ETL Job. Losing this distinction means you'll blow scenario questions.

## Cost Perspective Once More

Data engineers view cost as part of design. Glue transformation cost levers:

| Lever | Save How |
|-------|----------|
| DPU time | Right-size DPU, optimize Jobs, use Python Shell |
| Crawler scans | Incremental crawlers, partition projection to skip crawling |
| Reprocessing | Job Bookmark to process only new data |
| Output format | Parquet/ORC + partitioning cuts downstream scans |
| Over-engineering | Downgrade simple transforms to Firehose+Lambda |

> 🎯 **Comprehensive Scenario**: A company receives raw JSON logs (tens of GB daily) and must turn them into analysis-ready cleaned tables. Full production setup: (1) Land logs to S3 with `dt=` Hive path → (2) **Incremental crawler** registers new partitions in Data Catalog → (3) **Glue Studio**-designed ETL Job reads via `from_catalog`, cleans with ApplyMapping/ResolveChoice, **Job Bookmark** processes only yesterday's new data → (4) **Glue Data Quality** node validates `amount>=0`, `IsComplete`, `RowCount`; load passing data as Parquet, isolate failures → (5) Follow-up crawler updates clean table → (6) **Workflow trigger** auto-runs at dawn daily, monitor quality score on CloudWatch. Athena queries the clean table instantly. This single flow contains this entire week.

## Summary: Transformation Must Be Trustworthy

This week's core lesson is simple: **Transformation isn't just changing data—it's building data you can trust**. Share consistent schemas via Catalog, transform with the right tool (code or no-code), handle increments efficiently with bookmarks, and defend form and content reliability with Schema Registry and Data Quality. Next week escalates transformed data further with Transformation Part 2 — entering the Amazon EMR and Spark universe.

---

## 📝 연습 문제

**문제 1.** 다음 중 Glue 크롤러와 Glue ETL Job의 역할을 가장 정확히 구분한 것은?

A) 크롤러는 메타데이터(스키마·파티션)를 등록하고, ETL Job은 실제 데이터를 읽어 변환·기록한다  
B) 크롤러가 데이터를 변환하고, ETL Job은 메타데이터만 등록한다  
C) 둘 다 동일하며 이름만 다르다  
D) 크롤러는 데이터를 삭제하고, ETL Job은 백업한다  

**정답: A**  
해설: 크롤러는 데이터를 변환하지 않고 스키마·파티션 메타데이터만 Catalog에 등록한다. 반면 ETL Job이 소스를 읽어 실제로 변환하고 새 위치에 기록한다. "스키마 알아내기 = 크롤러, 데이터 바꾸기 = ETL Job"이 핵심 구분이다.

---

**문제 2.** 다음 요구사항에 가장 비용 효율적인 선택은? "들어오는 JSON을 단순히 형식만 바꿔 S3에 적재하면 되고, 윈도우 집계나 복잡한 분산 변환은 필요 없다."

A) Glue ETL Spark Job에 DPU 최대 설정  
B) EMR 상시 클러스터  
C) Kinesis Data Firehose + Lambda 변환  
D) Glue DataBrew 대화식 세션 상시 유지  

**정답: C**  
해설: 단순 형식 변환 후 S3 적재라면 Firehose + Lambda가 가장 단순하고 저렴하다. Glue Spark Job이나 EMR은 복잡한 분산 변환에 적합하며 이 경우 과한 설계다. DataBrew 세션 상시 유지는 비용만 늘린다. "Glue가 정답이 아닌 경우"의 대표 사례다.

---

**문제 3.** Glue Job 북마크가 동작하지 않아 매번 전체 데이터를 재처리한다. 점검할 항목으로 옳지 않은 것은?

A) Job 속성에서 북마크가 Enable되어 있는지  
B) 소스/싱크에 transformation_ctx가 지정되어 있는지  
C) 스크립트 끝에 job.commit()이 호출되는지  
D) Schema Registry 호환성 모드가 FULL인지  

**정답: D**  
해설: Job 북마크 동작에는 북마크 Enable, transformation_ctx 지정, job.commit() 호출이 필요하다. Schema Registry 호환성 모드는 스트리밍 스키마 검증과 관련될 뿐 배치 Job 북마크와 무관하므로 점검 대상이 아니다.

---

**문제 4.** 데이터의 스키마(형태)와 값(내용) 검증을 담당하는 서비스를 올바르게 짝지은 것은?

A) 스키마 호환성 = Glue Data Quality / 값 유효성 = Schema Registry  
B) 스키마 호환성 = Schema Registry / 값 유효성(음수·중복·null) = Glue Data Quality  
C) 둘 다 Glue 크롤러가 담당  
D) 둘 다 Athena가 담당  

**정답: B**  
해설: Schema Registry는 스트리밍 데이터의 스키마 호환성(형태)을 강제하고, Glue Data Quality는 DQDL로 값의 유효성(음수 금지, 중복 금지, null 비율 등 내용)을 검증한다. 크롤러는 메타데이터 등록, Athena는 쿼리 엔진으로 둘 다 이 역할을 하지 않는다.

---

**문제 5.** 코드를 모르는 분석가가 데이터를 빠르게 프로파일링하고 정제하려 한다. 반면 데이터 엔지니어는 복잡한 조인을 포함한 프로덕션 ETL을 비주얼로 설계하되 일부는 코드로 제어하려 한다. 각각에 맞는 도구는?

A) 분석가 = Glue Studio / 엔지니어 = DataBrew  
B) 분석가 = 크롤러 / 엔지니어 = Schema Registry  
C) 분석가 = Glue DataBrew / 엔지니어 = Glue Studio  
D) 분석가 = Athena / 엔지니어 = QuickSight  

**정답: C**  
해설: 노코드 정제·프로파일링은 분석가용 DataBrew, 비주얼로 프로덕션 ETL을 짜면서 코드 전환이 가능한 것은 엔지니어용 Studio다. A는 둘을 뒤바꿨고, 크롤러·Schema Registry·Athena·QuickSight는 정제/ETL 설계 도구가 아니다.

---
