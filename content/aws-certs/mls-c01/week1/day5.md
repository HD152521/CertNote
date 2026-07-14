# Day 5 - Week 1 Integrated Review: ML Overview & Data Engineering 1

This week, we laid the foundation for MLS-C01. We reviewed the ML lifecycle at Specialty depth (Day 1), explored where and how to store data (Day 2), how to collect it (Day 3), and how to label it (Day 4). Today we integrate these pieces into one data pipeline and sharpen the decision criteria that often trip up the exam.

## The Data Engineering Pipeline at a Glance

This week's content flows as follows.

```
[Source]  Click logs · IoT · Transactions  ──┐
                                             ▼
[Ingest]  Stream? → Kinesis (Firehose=deliver / KDS=multi-consumer·replay)  (Day 3)
          Batch?   → Glue ETL / EMR / Batch
                                             ▼
[Store]   S3 data lake (Parquet/RecordIO)                                   (Day 2)
                                             ▼
[Label]   SageMaker Ground Truth (workforce + active learning + consensus)  (Day 4)
                                             ▼
[Features] Glue/Processing for feature engineering → Feature Store
                                             ▼
[Train I/O] S3 (Pipe/File/FastFile) | EFS | FSx for Lustre                 (Day 2)
                                             ▼
[Model]   Train → Evaluate (link to business metrics) → Deploy → Monitor    (Day 1)
                                             └──── Drift triggers loop-back ────┘
```

> 💡 **Related Theory**: One consistent principle flows through this entire pipeline: **reproducibility** and **preventing training-serving skew**. Fix collection, cleaning, and feature logic in code; version your data; use identical transformations in training and inference. Ad-hoc features engineered in notebooks or data from unknown sources quietly break models in production.

## Core Decision Criteria Summary

Compress decisions that trip people up in exam questions.

**Storage Input Mode (Day 2)**

| Situation | Choice |
|---------|-----|
| Large data, sequential, fast startup | Pipe mode |
| Small data, random access | File mode |
| Large data but partial/random access | FastFile mode |
| Repeated, high-throughput shared access | FSx for Lustre |
| General-purpose shared filesystem | EFS |

**Data Formats (Day 2)**

| Situation | Choice |
|---------|-----|
| Structured data analytics, ETL, subset of columns | Parquet (columnar) |
| SageMaker built-in algorithm, large-scale sequential | RecordIO-protobuf |
| Millions of small files | Consolidate via sharding |

**Ingestion Services (Day 3)**

| Situation | Choice |
|---------|-----|
| No-code delivery to S3, etc. | Kinesis Data Firehose |
| Multi-consumer, reprocessing, custom handling | Kinesis Data Streams |
| Real-time aggregation, anomaly detection | Managed Service for Flink |
| Schema inference, catalog | Glue Crawler |
| Serverless Spark ETL | Glue ETL Job |

**Labeling (Day 4)**

| Situation | Choice |
|---------|-----|
| Sensitive, regulated data | Private or Vendor workforce |
| Public, large-scale, low-cost | Mechanical Turk |
| Reduce labeling cost | Active learning (automated labeling) |
| Reduce random labeler error | Consensus (multiple labelers + consolidation) |

## Quick Review: Evaluation Metrics (Day 1)

```python
# Classification metric decision tree (pseudocode)
if classes_severely_imbalanced:
    if miss_cost_high (fraud, disease):         → prioritize recall, compare via PR-AUC
    elif false_alarm_cost_high (spam, marketing): → prioritize precision
    else:                                        → PR-AUC
else:
    if threshold_undecided:                     → ROC-AUC
    else:                                       → F1 / accuracy
```

> 💡 **Related Theory**: Always guard against single-metric traps. A 99.9% accuracy on imbalanced data might be a "predict all negative" model. Offline metrics gate deployment; online business metrics (A/B tests) render the final verdict. Remembering this two-stage structure captures the essence of Day 1.

## Mini Integrated Scenario

> **Scenario**: A global e-commerce company wants to detect fraudulent transactions in real-time click streams. Historical fraud labels are very sparse, and fraud is 0.1% of transactions. Data includes PII.

Step-by-step answer flow:

1. **Ingest**: Multi-consumer and reprocessing required, so **Kinesis Data Streams** + real-time features via Flink, simultaneously Firehose to S3 (lambda architecture).
2. **Store**: S3 data lake as **Parquet**.
3. **Label**: PII present, so **Private workforce**. Labels very sparse, so use active learning for efficiency or, if seed is too small, start with unsupervised anomaly detection (Random Cut Forest).
4. **Evaluate**: 0.1% imbalance + high miss cost → **prioritize recall, compare via PR-AUC**.
5. **Deploy**: A/B with small traffic split first, then expand; monitor for drift.

This single scenario embeds every concept from Week 1. If you can explain the reasoning behind each decision, you've internalized this week.

> 💡 **Related Theory**: In constraint-conflict scenarios, **constraints come first**. PII mandates workforce choice, extreme imbalance mandates metric choice, multi-consumer requirement mandates KDS. The answer isn't the fanciest technology, but the choice that **simultaneously satisfies all constraints**. Violating even one constraint (e.g., PII to public workforce) makes an answer wrong regardless of other merits.

## Next Week Preview

Week 2 dives into Data Engineering 2: large-scale processing with EMR and Spark, data transformation and cleaning deep-dive, handling missing values, outliers, imbalanced data, and the full toolkit of feature engineering techniques. It's where we zoom into the "Features" step of the pipeline.

## 📝 연습 문제

**문제 1.** 거래의 0.1%만 사기이고 미탐 비용이 큰 사기 탐지 모델의 성능을 비교한다. 가장 정직한 단일 지표는?

A) accuracy  
B) PR-AUC (precision-recall 곡선 아래 면적)  
C) 학습 손실값  
D) 처리 지연시간  

**정답: B**  
해설: 극단적 클래스 불균형에서 accuracy는 "전부 정상" 예측으로도 99.9%가 나와 무의미하고, ROC-AUC조차 낙관적으로 보일 수 있다. PR-AUC는 양성 클래스의 precision·recall 균형을 직접 반영해 불균형 데이터에서 가장 정직하다. 학습 손실·지연시간은 분별력 평가 지표가 아니다.

---

**문제 2.** 수백 GB 데이터를 여러 인스턴스로 분산 학습하며 GPU 유휴를 최소화하고 인스턴스마다 다른 데이터 조각만 읽게 하려면?

A) Pipe 모드 + ShardedByS3Key  
B) File 모드 + FullyReplicated  
C) FSx로 전체 복제  
D) FastFile + FullyReplicated  

**정답: A**  
해설: Pipe 모드는 디스크 전체 복사 없이 스트리밍해 첫 배치까지 시간을 줄여 GPU 유휴를 최소화하고, ShardedByS3Key는 각 인스턴스가 서로 다른 조각만 읽게 한다. FullyReplicated 계열은 모든 인스턴스가 전체 데이터를 받아 분산 학습에 비효율적이다.

---

**문제 3.** PII가 포함된 의료 데이터를 레이블링하면서 레이블링 인건비도 줄이고 싶다. 가장 적절한 조합은?

A) Mechanical Turk + 전수 라벨링  
B) Vendor 없이 자동만 사용  
C) 공개 크라우드소싱 + 합의  
D) Private 워크포스 + 액티브 러닝(자동 레이블링)  

**정답: D**  
해설: PII 포함 데이터는 컴플라이언스상 Private(또는 검증 Vendor) 워크포스가 필수이고, 액티브 러닝으로 모호한 샘플만 사람에게 보내 인건비를 줄인다. Mechanical Turk·공개 크라우드소싱은 민감 데이터에 부적합하고, seed 없이 자동만으로는 동작하지 않는다.

---

**문제 4.** 하나의 이벤트 스트림을 실시간 대시보드·사기 모델·추후 재처리에 독립적으로 쓰고 장애 시 재생도 필요하다. 적합한 수집 서비스는?

A) Kinesis Data Firehose  
B) Glue Crawler  
C) Kinesis Data Streams  
D) Amazon EFS  

**정답: C**  
해설: 여러 소비자가 같은 스트림을 독립 소비하고 데이터 보관·재생이 필요한 경우는 Data Streams의 핵심 용도다. Firehose는 보관·재생·다소비를 지원하지 않는 단순 적재 파이프이고, Crawler는 스키마 추론, EFS는 파일 스토리지로 스트리밍 다소비와 무관하다.

---

**문제 5.** 여러 제약(민감 데이터, 극단적 불균형, 다소비 스트림)이 동시에 걸린 시나리오 문제를 풀 때 가장 올바른 접근은?

A) 가장 최신·고성능 기술을 고른다  
B) 모든 제약 조건을 동시에 만족하는 선택지를 고른다  
C) 비용이 가장 낮은 선택지를 고른다  
D) 가장 단순한 선택지를 고른다  

**정답: B**  
해설: 제약 충돌형 시나리오에서는 PII가 워크포스를, 불균형이 지표를, 다소비 요건이 KDS를 각각 강제한다. 정답은 가장 멋지거나 싸거나 단순한 것이 아니라 모든 제약을 동시에 만족하는 선택이다. 제약을 하나라도 위반하면(예: 민감 데이터를 공개 워크포스에) 다른 장점과 무관하게 오답이다.

---
