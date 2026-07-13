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

## 📝 연습 문제

**문제 1.** 두 회사가 광고 효과를 공동 측정하려 하지만, 서로의 고객 원본 데이터는 절대 노출할 수 없다. 합의된 집계 쿼리 결과만 공유하려면?

A) AWS Data Exchange로 데이터셋 교환  
B) S3 교차 계정 버킷 정책으로 원본 공유  
C) Redshift 스냅샷 공유  
D) AWS Clean Rooms로 협업  

**정답: D**  
해설: Clean Rooms는 당사자들이 원본을 서로 노출하지 않고 사전 합의된 분석 규칙으로 집계 결과만 얻는 공동 분석 서비스입니다. Data Exchange·버킷 공유·스냅샷 공유는 모두 원본 데이터를 상대에게 전달하므로 요건에 맞지 않습니다.

---

**문제 2.** 한 매출 컬럼의 정의를 변경하기 전에, 그 컬럼이 어떤 다운스트림 리포트와 테이블에 영향을 주는지 파악하려 한다. 가장 도움이 되는 거버넌스 기능은?

A) 데이터 계보(lineage)  
B) S3 수명주기 정책  
C) KMS 키 교체  
D) 파티션 프로젝션  

**정답: A**  
해설: 데이터 계보는 소스→변환→타깃→BI의 흐름을 기록해 영향 분석(어떤 다운스트림이 깨지는지)을 가능하게 합니다. 수명주기·키 교체·파티션 프로젝션은 영향 추적과 무관합니다.

---

**문제 3.** Athena, Redshift Spectrum, EMR이 동일 S3 데이터에 대해 서로 다른 스키마를 정의해 결과가 불일치한다. 단일 진실 공급원을 제공하는 해결책은?

A) 각 엔진에 별도 스키마 유지  
B) 데이터를 CSV로 통일  
C) 버킷마다 다른 KMS 키 적용  
D) 공유 Glue Data Catalog 사용  

**정답: D**  
해설: Glue Data Catalog를 공유하면 테이블/스키마를 한 번 정의해 Athena·Spectrum·EMR·Glue가 동일 메타데이터를 사용하므로 불일치가 사라집니다. 별도 스키마 유지는 문제의 원인이고, CSV 통일·KMS는 스키마 일관성과 무관합니다.

---

**문제 4.** 감사팀이 "지난주 누가 민감 S3 버킷의 어떤 객체를 읽었는지" 알고자 한다. 그러나 CloudTrail에는 관리 이벤트만 보인다. 필요한 조치는?

A) S3 버전 관리 활성화  
B) CloudTrail 데이터 이벤트(S3 객체 수준) 로깅 활성화  
C) Macie 분류 작업 실행  
D) IAM 정책에 Deny 추가  

**정답: B**  
해설: S3 객체 수준 접근(GetObject 등)은 CloudTrail 데이터 이벤트로 기록되며 비용 때문에 기본 비활성이므로 명시적으로 켜야 추적됩니다. 버전 관리는 변경 이력, Macie는 탐지, Deny는 차단으로 접근 감사 로그를 만들지 않습니다.

---
