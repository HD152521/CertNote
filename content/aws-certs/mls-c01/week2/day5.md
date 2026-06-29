# Day 5 - Week 2 종합 복습: 변환부터 분산 학습 데이터 공급까지

이번 주는 "데이터를 어떻게 가공하고, 자동화하고, 보강하고, 효율적으로 학습에 공급하는가"를 다뤘다. 데이터 엔지니어링의 두 번째 축인 **변환·파이프라인**이다. 오늘은 Day 1~4를 하나의 흐름으로 다시 엮으며, 시험에서 헷갈리기 쉬운 선택 기준을 정리한다.

## 한 장으로 보는 Week 2 흐름

```
[원시 데이터]
   │  Day1: 변환(ETL)
   ▼  Glue(서버리스 Spark) / EMR(풀컨트롤 클러스터)
[정제·가공 데이터]
   │  Day2: 파이프라인 자동화
   ▼  Step Functions(범용) / SageMaker Pipelines(ML 전용) + EventBridge 트리거
[재현 가능한 학습 데이터셋]
   │  Day3: 증강·합성·불균형 대응
   ▼  증강(반전·역번역) / 합성(GAN) / SMOTE·가중치
[충분하고 균형 잡힌 데이터셋]
   │  Day4: 저장·접근 최적화
   ▼  File/Pipe/FastFile mode / FSx for Lustre / ShardedByS3Key
[학습 작업에 효율적으로 공급] → 모델 학습
```

핵심 메시지: **데이터 준비는 변환 한 단계로 끝나지 않는다.** 가공 → 자동화 → 보강 → 효율적 공급이 모두 모델 품질과 비용에 직결된다.

## Day 1 복습 — 변환과 ETL

- **ETL** = Extract(추출) → Transform(변환) → Load(적재). ML에서 결과물은 학습 데이터셋.
- **AWS Glue**: 서버리스 Spark. Data Catalog, Crawler, ETL Job, DynamicFrame. 운영 부담 최소, 산발적·표준적 ETL에 적합. 과금은 DPU-시간.
- **Amazon EMR**: Hadoop/Spark/Hive/Presto를 EC2 클러스터에서 직접 운영. 세밀한 튜닝·다양한 프레임워크·스팟 절감이 필요한 무거운 워크로드에 적합.
- **대규모 전처리**: Parquet 컬럼형 포맷, 파티셔닝(partition pruning), 적정 파일 크기, predicate pushdown.

> 💡 **관련 이론**: Glue vs EMR의 판단 3축 — 운영 부담(최소화→Glue), 워크로드 성격(짧고 산발적→Glue, 길고 무거운 배치→EMR), 프레임워크 다양성(Spark만→Glue, 여러 엔진→EMR).

## Day 2 복습 — 파이프라인 자동화

- **Step Functions**: 범용 오케스트레이터. ASL(JSON)로 상태 머신 정의. ML+비ML 혼합, 승인·외부 시스템·복잡 분기에 강함.
- **SageMaker Pipelines**: ML 전용. Python SDK. ProcessingStep/TrainingStep/TuningStep/ConditionStep/RegisterModel. lineage·모델 레지스트리 내장.
- **선택 기준**: 순수 ML CI/CD·추적성 → SageMaker Pipelines, ML+비ML 혼합·승인 → Step Functions. 혼합 사용도 가능.
- **트리거**: EventBridge(cron/이벤트), S3 이벤트 → 파이프라인 시작.

> ⚠️ **함정**: "ML이니까 무조건 SageMaker Pipelines"는 단순화된 오답. 비-ML 단계·승인·복잡 분기가 많으면 Step Functions가 더 적합할 수 있다.

## Day 3 복습 — 증강·합성·불균형

- **증강(augmentation)**: 레이블을 보존하는 변형으로 기존 데이터 다양화. 이미지(반전·회전·색 지터), 텍스트(동의어 치환·역번역). 도메인 의미 보존 필수.
- **합성(synthesis)**: 새로운 가상 데이터 생성. GAN, 시뮬레이션, 합성 정형 데이터(프라이버시). distribution gap 위험 → 검증은 실데이터.
- **불균형 대응**: 데이터 수준(오버/언더샘플링, **SMOTE**=보간 합성), 알고리즘 수준(클래스 가중치, 임계값), 평가 수준(정확도 금지 → **재현율·F1·PR-AUC**).

> 💡 **관련 이론**: SMOTE는 단순 복제와 달리 소수 샘플과 최근접 이웃 사이를 보간해 새 점을 만든다. 1:999 같은 불균형에서 정확도는 거짓 안심을 주므로 재현율·PR-AUC로 평가한다.

## Day 4 복습 — 저장·접근 최적화

| 옵션 | 한 줄 요약 | 적합 상황 |
|------|-----------|----------|
| File mode | 전체 다운로드 후 시작 | 작은 데이터, 반복 읽기 |
| Pipe mode | S3 스트리밍, 즉시 시작 | 매우 큰 데이터, 순차 처리 |
| FastFile mode | 스트리밍 + POSIX 접근 | 큰 데이터 + 임의 접근 |
| FSx for Lustre | 초고속 병렬 FS, S3 연동 | 대규모 + 반복 + 저지연 + 분산 |
| ShardedByS3Key | 노드별로 데이터 분할 분배 | 데이터 병렬 분산 학습 |

- 핵심 목표: **비싼 GPU가 I/O를 기다리며 놀지 않게 한다.**
- 샤딩 전제: 데이터가 여러 S3 객체로 분할되어 있어야 효과.

> 🎯 **시나리오 통합**: "수 TB 데이터, 8개 GPU 노드, 시작이 너무 느리다." → 데이터를 여러 Parquet 샤드로 분할(Day1) → 파이프라인으로 자동 생성(Day2) → 불균형이면 SMOTE/가중치(Day3) → ShardedByS3Key + FSx for Lustre로 공급(Day4).

## 자주 틀리는 비교 포인트 총정리

| 헷갈리는 쌍 | 핵심 구분 |
|------------|----------|
| Glue vs EMR | 서버리스·운영 최소화 vs 풀컨트롤·다중 프레임워크 |
| Step Functions vs SageMaker Pipelines | 범용·혼합 워크플로 vs ML 전용·lineage |
| 증강 vs 합성 | 기존 데이터 변형 vs 새 가상 데이터 생성 |
| 오버샘플링 vs SMOTE | 단순 복제 vs 보간 합성 |
| File vs Pipe vs FastFile | 전체 다운로드 vs 스트리밍 vs 절충 |
| FullyReplicated vs ShardedByS3Key | 전체 복제 vs 노드별 분할 |

> 💡 **관련 이론**: MLS-C01 데이터 엔지니어링 영역의 출제 패턴은 거의 항상 "비용/운영 부담/규모/접근 패턴"의 트레이드오프 판단이다. 정답은 단일 기술이 아니라 **상황(요구사항)에 맞는 선택**이다. 문제에서 "운영 인력 최소", "매우 큰 데이터", "임의 접근 필요", "비-ML 단계 포함" 같은 단서를 찾아 매핑하는 훈련이 핵심이다.

## 정리하며

Week 2는 데이터를 모델에 닿게 하는 전 과정 — 변환(Glue/EMR), 자동화(Step Functions/SageMaker Pipelines), 보강(증강·합성·SMOTE), 효율적 공급(입력 모드·FSx·샤딩) — 을 다뤘다. 모든 선택의 밑바탕에는 **비용·운영 부담·규모·접근 패턴의 트레이드오프**가 깔려 있다. 다음 주에는 이렇게 준비된 데이터 위에서 본격적인 **모델링과 알고리즘**으로 들어간다. 오늘 복습한 비교 표들을 시험 직전에 다시 훑어 보길 권한다.

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
