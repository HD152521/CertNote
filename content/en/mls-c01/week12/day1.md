# Day 1 - Domains 1 & 2 Integration: Data Engineering + EDA

Week 12: final review, four domains in integrated flow. Today, **Domains 1 (data eng) & 2 (EDA)** — data collected, stored, transformed, cleaned, featured into training-ready form. The pipeline **data → lake → transform → clean → visualize → ML-ready**.

## One-Sheet: Data Becomes Training-Ready

```text
[Raw sources]
   │
   ├─ 1) COLLECT/LOAD (Domain 1)
   │     Streaming → Kinesis (Streams/Firehose)
   │     Batch    → S3 + Glue catalog
   │     Migration → DMS, DataSync
   │
   ├─ 2) STORE (Domain 1)
   │     Lake = S3 (de facto standard)
   │     Query = Athena (serverless), Redshift (warehouse)
   │
   ├─ 3) TRANSFORM/ETL (Domain 1)
   │     Glue (serverless Spark) / EMR (clusters)
   │
   ├─ 4) CLEAN (Domain 2)
   │     Missing → impute/drop
   │     Outliers → clip, remove
   │     Dupe → dedupe
   │
   ├─ 5) FEATURE (Domain 2)
   │     Encode, scale, bin, PCA
   │
   └─ 6) VISUALIZE/EDA (Domain 2)
         Distribution, corr, anomaly → QuickSight
```

## Domain 1: Collection & Storage

| Task | Service | Signal |
|------|------|------|
| Real-time multi-consumer | Kinesis Streams | millisec, replay |
| Managed S3 load | Kinesis Firehose | serverless |
| S3 queries | Athena | adhoc, no cluster |
| Warehouse | Redshift | sized, persistent |
| ETL | Glue (serverless) or EMR (cluster) | scale |

**Kinesis trap**: Streams = control/replay, Firehose = complete-managed drop to S3.

## Domain 2: Clean → Feature → EDA

| Step | Handling |
|------|------|
| Missing | Drop (MCAR few%) or impute (KNN, model) |
| Outliers | IQR/Z-score detection, clip or remove |
| Imbalance | SMOTE, undersample, weights |
| Encoding | One-Hot (unordered), Label (ordered), target encode (high-cardinal) |
| Scale | StandardScaler (distance/gradient models), unnecessary for trees |
| Dimension | PCA if multicollinearity or too many features |
| EDA | Histogram, box, scatter, corr heatmap, time series → QuickSight |

**Scaler trap**: XGBoost scale-invariant. Not needed.

## Cross-Domain Decisions

| Signal | Domain 1 | Domain 2 | Choice |
|------|------|------|------|
| Real-time millisec multi-consumer | Streams ✓ | — | Streams |
| Serverless S3 ETL | Glue ✓ | — | Glue |
| Unordered categories | — | One-Hot ✓ | One-Hot |
| Trees model | — | No scale ✓ | Skip scaling |
| High cardinality | — | Target/freq encode ✓ | Target |

## Integration Example: End-to-End

User behavior data → analysis:

1. IoT → Kinesis Data Streams (multi-tenant consumers)
2. Lake → S3 (central storage)
3. Transform → Glue ETL (serverless)
4. Athena → Ad-hoc SQL (analyst queries)
5. Clean → Remove nulls, dupe (Domain 2)
6. Feature → One-Hot categories, PCA if > 100 features
7. QuickSight → Explore corr, distribution
8. Ready → ML training

## Summary

Domains 1 & 2 form "data pipeline foundation." Collect (Kinesis), store (S3), transform (Glue), clean (drop/impute/dupe), feature (encode/scale/dim-reduce), visualize (EDA). Each step builds on previous — garbage in → garbage out.

Tomorrow: Domain 3 (modeling) review.

## 📝 연습 문제

**문제 1.** IoT 센서 수천 대가 초당 수만 건의 이벤트를 보내고, 여러 독립 애플리케이션이 같은 스트림을 각자 다른 속도로 읽으며 과거 데이터도 재처리해야 한다. 가장 적합한 수집 서비스는?

A) Kinesis Data Firehose  
B) SQS 표준 큐  
C) Glue 배치 잡  
D) Kinesis Data Streams  

**정답: D**  
해설: 다중 소비자가 독립적으로 읽고 보존기간 내 재처리가 필요하면 샤드와 보존기간을 직접 제어하는 Data Streams가 정답이다. Firehose(A)는 완전관리 적재용으로 다중 커스텀 소비자·재처리에 부적합하고, SQS(B)는 메시지 소비 시 삭제되어 재처리·다중 소비에 약하며, Glue(C)는 배치 ETL이다.

---

**문제 2.** 운영 부담을 최소화하면서 스트리밍 데이터를 1분 버퍼링 후 S3에 적재하고, 적재 전 간단한 형식 변환만 하면 된다. 가장 적합한 것은?

A) Kinesis Data Streams + 커스텀 람다 소비자 + 직접 S3 쓰기  
B) EMR 상시 클러스터  
C) Kinesis Data Firehose  
D) Redshift COPY 스크립트를 cron으로 실행  

**정답: C**  
해설: 버퍼 크기·시간만 설정하면 S3로 자동 적재하고 변환까지 지원하는 완전관리 서비스가 Firehose다. Streams+커스텀 소비자(A)는 운영 부담을 늘리고, EMR 상시 클러스터(B)는 과한 비용·관리이며, cron COPY(D)는 관리형이 아니다.

---

**문제 3.** 결정트리 기반 XGBoost 모델을 학습하기 전 전처리를 검토 중이다. 다음 중 효과가 가장 미미하여 우선순위가 낮은 작업은?

A) 모든 수치 피처를 표준화(StandardScaler)한다  
B) 결측치를 적절히 대치한다  
C) 고카디널리티 범주형을 타깃 인코딩한다  
D) 명백한 라벨 오류 행을 정정한다  

**정답: A**  
해설: 트리 기반 모델은 분할 기준이 피처 스케일에 불변이라 표준화의 효과가 거의 없다. 결측치 처리(B)·범주형 인코딩(C)·라벨 정정(D)은 트리 모델에서도 성능에 직접 영향을 준다.

---

**문제 4.** EDA에서 두 피처의 피어슨 상관계수가 0.96으로 나타났다. 다중공선성을 줄이기 위한 적절한 대응이 아닌 것은?

A) 둘 중 정보량이 적은 피처를 제거한다  
B) PCA로 두 피처를 하나의 주성분으로 축약한다  
C) 두 피처를 모두 그대로 두고 One-Hot 인코딩한다  
D) 도메인 지식으로 더 해석 가능한 한쪽만 남긴다  

**정답: C**  
해설: One-Hot 인코딩은 범주형 변수를 다루는 기법으로 수치 피처의 다중공선성과 무관하며 문제를 해결하지 못한다. 피처 제거(A)·PCA 축약(B)·해석 기반 선택(D)은 모두 유효한 다중공선성 대응이다.

---

**문제 5.** S3 데이터 레이크에 저장된 로그를 데이터 분석가가 클러스터 프로비저닝 없이 표준 SQL로 애드혹 조회하려 한다. 가장 적합한 서비스는?

A) Amazon Redshift  
B) Amazon EMR  
C) Amazon RDS  
D) Amazon Athena  

**정답: D**  
해설: Athena는 S3 데이터를 서버리스로 표준 SQL 조회하는 서비스라 클러스터 없는 애드혹 분석에 최적이다. Redshift(A)는 사전 프로비저닝하는 웨어하우스, EMR(B)은 클러스터 기반, RDS(C)는 트랜잭션용 관계형 DB로 S3 직접 쿼리에 부적합하다.

---
