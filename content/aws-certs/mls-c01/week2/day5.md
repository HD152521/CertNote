# Day 5 - Week 2 Comprehensive Review: From Transformation to Distributed Training Data Supply

This week covered "how to process, automate, augment, and efficiently supply data for training." This is the second axis of data engineering: **transformation and pipelines**. Today, we reconnect Days 1-4 in a single flow and clarify choice criteria that are easily confused in exams.

## Week 2 Flow at a Glance

```
[Raw Data]
   │  Day 1: Transformation (ETL)
   ▼  Glue (serverless Spark) / EMR (full-control cluster)
[Cleaned and Processed Data]
   │  Day 2: Pipeline Automation
   ▼  Step Functions (general-purpose) / SageMaker Pipelines (ML-specific) + EventBridge trigger
[Reproducible Training Dataset]
   │  Day 3: Augmentation, Synthesis, Imbalance Handling
   ▼  Augmentation (flip, back-translation) / Synthesis (GAN) / SMOTE, weights
[Sufficient and Balanced Dataset]
   │  Day 4: Storage and Access Optimization
   ▼  File/Pipe/FastFile mode / FSx for Lustre / ShardedByS3Key
[Efficiently Supplied to Training] → Model Training
```

Core message: **Data preparation doesn't end with a single transformation step.** Processing → automation → augmentation → efficient supply all directly affect model quality and cost.

## Day 1 Review — Transformation and ETL

- **ETL** = Extract → Transform → Load. In ML, the output is a training dataset.
- **AWS Glue**: Serverless Spark. Data Catalog, Crawler, ETL Job, DynamicFrame. Minimal operational burden, suitable for sporadic and standard ETL. Billing is DPU-hours.
- **Amazon EMR**: Directly operate Hadoop/Spark/Hive/Presto on EC2 clusters. Suitable for heavy workloads requiring fine-tuning, multiple frameworks, and spot savings.
- **Large-scale preprocessing**: Parquet columnar format, partitioning (partition pruning), appropriate file sizes, predicate pushdown.

> 💡 **Related Theory**: Three axes for Glue vs EMR decision—operational burden (minimize→Glue), workload type (short and sporadic→Glue, long and heavy batch→EMR), framework variety (Spark only→Glue, multiple engines→EMR).

## Day 2 Review — Pipeline Automation

- **Step Functions**: General-purpose orchestrator. Define state machines with ASL (JSON). Strong for ML+non-ML mixing, approvals, external systems, and complex branching.
- **SageMaker Pipelines**: ML-specific. Python SDK. ProcessingStep/TrainingStep/TuningStep/ConditionStep/RegisterModel. Built-in lineage and model registry.
- **Selection criteria**: Pure ML CI/CD and traceability → SageMaker Pipelines; ML+non-ML mixing and approvals → Step Functions. Mixed usage is also possible.
- **Triggers**: EventBridge (cron/events), S3 events → start pipeline.

> ⚠️ **Pitfall**: "It's ML, so definitely SageMaker Pipelines" is oversimplified and incorrect. If there are many non-ML steps, approvals, or complex branching, Step Functions may be more suitable.

## Day 3 Review — Augmentation, Synthesis, Imbalance Handling

- **Augmentation**: Diversify existing data through label-preserving transformations. Images (flip, rotate, color jitter), text (synonym replacement, back-translation). Domain meaning preservation is essential.
- **Synthesis**: Generate new virtual data. GAN, simulation, synthetic tabular data (privacy). Risk of distribution gap → validation must use real data.
- **Imbalance handling**: Data level (over/undersampling, **SMOTE**=interpolated synthesis), algorithm level (class weights, thresholds), evaluation level (ban accuracy → **recall, F1, PR-AUC**).

> 💡 **Related Theory**: SMOTE, unlike simple duplication, interpolates between minority samples and nearest neighbors to create new points. In imbalance like 1:999, accuracy gives false reassurance, so evaluation should use recall and PR-AUC.

## Day 4 Review — Storage and Access Optimization

| Option | One-line Summary | Best For |
|--------|-----------------|----------|
| File mode | Full download then start | Small data, repeated reads |
| Pipe mode | S3 streaming, immediate start | Very large data, sequential processing |
| FastFile mode | Streaming + POSIX access | Large data + random access |
| FSx for Lustre | Ultra-fast parallel FS, S3 integration | Large scale + repeated + low latency + distributed |
| ShardedByS3Key | Data split and distributed per node | Data-parallel distributed training |

- Core goal: **Ensure expensive GPUs don't sit idle waiting for I/O.**
- Sharding prerequisite: Data must be divided into multiple S3 objects to be effective.

> 🎯 **Integrated Scenario**: "Multiple TBs of data, 8 GPU nodes, startup is too slow." → Divide data into multiple Parquet shards (Day 1) → auto-generate through pipeline (Day 2) → if imbalanced, use SMOTE/weights (Day 3) → supply with ShardedByS3Key + FSx for Lustre (Day 4).

## Complete Summary of Commonly Confused Comparison Points

| Confusing Pair | Core Distinction |
|---|---|
| Glue vs EMR | Serverless, minimal operations vs full control, multiple frameworks |
| Step Functions vs SageMaker Pipelines | General-purpose, mixed workflows vs ML-specific, lineage |
| Augmentation vs Synthesis | Transform existing data vs generate new virtual data |
| Oversampling vs SMOTE | Simple duplication vs interpolated synthesis |
| File vs Pipe vs FastFile | Full download vs streaming vs compromise |
| FullyReplicated vs ShardedByS3Key | Full replication vs per-node splitting |

> 💡 **Related Theory**: The question pattern in MLS-C01's data engineering section is almost always trade-off judgment of "cost/operational burden/scale/access pattern." The answer is not a single technology but **a choice matching the situation (requirements)**. The key is training to find clues like "minimal operations," "very large data," "random access needed," "non-ML steps included" in the problem and map them.

## Summary

Week 2 covered the entire process of getting data to models—transformation (Glue/EMR), automation (Step Functions/SageMaker Pipelines), augmentation (augmentation, synthesis, SMOTE), efficient supply (input modes, FSx, sharding). Underlying all choices are **trade-offs of cost, operational burden, scale, and access pattern**. Next week, we move into serious **modeling and algorithms** on top of this prepared data. I recommend reviewing the comparison tables we covered today right before the exam.

---

## 📝 연습 문제

**문제 1.** 운영 인력이 적은 팀이 매일 표준 Spark 변환을 돌리고, 그 결과로 모델을 재학습하는 ML CI/CD를 lineage 추적과 함께 구성하려 한다. 가장 자연스러운 조합은?

A) EMR 상시 클러스터 + 수동 학습  
B) Glue 서버리스 ETL + SageMaker Pipelines  
C) Lambda 단일 함수로 전부 처리  
D) Athena 쿼리만으로 학습까지 수행  

**정답: B**  
해설: 운영 부담을 최소화하는 Glue 서버리스 ETL로 변환을 처리하고, ML 전용이며 lineage·모델 레지스트리가 내장된 SageMaker Pipelines로 재학습 CI/CD를 구성하는 것이 요구사항(운영 최소·추적성)에 가장 부합한다. 상시 EMR+수동(A)은 운영 부담이 크고, Lambda 단일 함수(C)·Athena만으로(D)는 Spark 변환과 모델 학습을 감당하기 어렵다.

---

**문제 2.** 1:999로 극히 불균형한 데이터에서 소수 클래스를 단순 복제 대신 보간으로 합성해 늘리고, 평가는 거짓 안심을 피하려 한다. 알맞은 조합은?

A) SMOTE 오버샘플링 + PR-AUC 평가  
B) 언더샘플링 + 정확도 평가  
C) 데이터 복제 + 정확도 평가  
D) 합성 데이터로만 검증  

**정답: A**  
해설: SMOTE는 소수 샘플과 최근접 이웃 사이를 보간해 새 샘플을 합성하므로 단순 복제의 과적합 위험을 줄이고, 불균형에서 정확도는 거짓 안심을 주므로 PR-AUC로 평가하는 것이 옳다. 정확도 평가(B·C)는 불균형에서 부적절하고, 검증은 실데이터로 해야 하므로 D도 틀렸다.

---

**문제 3.** 수 TB 데이터를 8개 노드로 데이터 병렬 학습할 때 각 노드의 중복 다운로드를 없애고 시작 지연을 줄이려 한다. 가장 적절한 설계는?

A) 단일 거대 파일 + FullyReplicated + File mode  
B) DynamoDB에서 직접 읽기  
C) 여러 파일로 분할 + ShardedByS3Key + (반복 읽기 시) FSx for Lustre  
D) 모든 노드가 전체 데이터를 다운로드  

**정답: C**  
해설: 데이터를 여러 S3 객체로 분할해야 ShardedByS3Key가 노드별 분배 효과를 내며, 반복 읽기가 많으면 FSx for Lustre를 공유 고속 스토리지로 붙여 지연을 줄인다. 단일 거대 파일+FullyReplicated(A)와 전체 다운로드(D)는 중복과 시작 지연을 키우고, DynamoDB 직접 읽기(C)는 대규모 분산 학습 데이터 공급에 부적합하다.

---

**문제 4.** 데이터 변환 워크플로에 비-ML 단계(외부 승인 대기, Lambda 후처리)와 SageMaker 학습이 함께 섞여 있고 복잡한 분기·재시도가 필요하다. 상위 오케스트레이터로 가장 적합한 것은?

A) SageMaker Pipelines 단독  
B) FSx for Lustre  
C) Glue Crawler  
D) AWS Step Functions  

**정답: D**  
해설: Step Functions는 Glue·Lambda·SageMaker·승인 대기 등 이질적 서비스를 상태 머신으로 묶고 Choice·Retry·Catch로 분기·재시도를 선언적으로 처리하는 범용 오케스트레이터라 ML+비ML 혼합 워크플로에 적합하다. SageMaker Pipelines 단독(A)은 비-ML·승인 통합이 제한적이고, Glue Crawler(C)·FSx(D)는 오케스트레이션 도구가 아니다.

---

**문제 5.** MLS-C01 데이터 엔지니어링 영역에서 도구 선택형 문제를 풀 때 가장 핵심이 되는 판단 기준은?

A) 항상 가장 최신에 출시된 서비스를 고른다  
B) 비용·운영 부담·규모·접근 패턴 등 요구사항 단서에 맞는 선택을 한다  
C) 무조건 가장 강력한(비싼) 옵션을 고른다  
D) 모든 문제에서 EMR을 정답으로 본다  

**정답: B**  
해설: 이 영역의 출제 패턴은 거의 항상 비용·운영 부담·규모·접근 패턴의 트레이드오프 판단이며, 정답은 단일 기술이 아니라 문제의 요구사항 단서("운영 최소", "매우 큰 데이터", "임의 접근 필요" 등)에 맞는 선택이다. 최신·최강·특정 도구를 무조건 고르는 A·C·D는 상황 적합성을 무시한 잘못된 접근이다.

---
