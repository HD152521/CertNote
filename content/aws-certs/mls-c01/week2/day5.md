# Day 5 - Week 2 Comprehensive Review: From Transformation to Distributed Training Data Supply

## 📌 핵심 정리

- Week 2는 데이터 엔지니어링의 두 번째 축 — **변환 → 자동화 → 증강 → 효율적 공급**을 다뤘다.
- **Glue = 서버리스·운영 최소**, **EMR = 세밀 제어·다중 프레임워크**. 판단 축은 운영 부담·워크로드 성격·프레임워크 다양성.
- **Step Functions = 범용·혼합 워크플로**, **SageMaker Pipelines = ML 전용·lineage**. 혼합 구성도 정석이다.
- 불균형은 **데이터 층(SMOTE) + 알고리즘 층(가중치·임계값) + 평가 층(PR-AUC)** 3층으로 대응한다.
- 데이터 공급의 목표는 하나다 — **비싼 GPU가 I/O를 기다리며 놀지 않게 하는 것**.

## Week 2 흐름 한눈에 보기

```
[원시 데이터]
   │  Day 1: 변환 (ETL)
   ▼  Glue (서버리스 Spark) / EMR (풀 컨트롤 클러스터)
[정제·가공된 데이터]
   │  Day 2: 파이프라인 자동화
   ▼  Step Functions (범용) / SageMaker Pipelines (ML 전용) + EventBridge 트리거
[재현 가능한 학습 데이터셋]
   │  Day 3: 증강·합성·불균형 처리
   ▼  증강(반전·역번역) / 합성(GAN) / SMOTE·클래스 가중치
[충분하고 균형 잡힌 데이터셋]
   │  Day 4: 저장·접근 최적화
   ▼  File/Pipe/FastFile 모드 / FSx for Lustre / ShardedByS3Key
[학습에 효율적으로 공급] → 모델 학습
```

핵심 메시지: **데이터 준비는 변환 한 단계로 끝나지 않는다.** 가공 → 자동화 → 증강 → 효율적 공급이 모두 모델 품질과 비용에 직접 영향을 준다.

## Day 1 복습 — 변환과 ETL

- **ETL** = Extract → Transform → Load. ML에서 산출물은 학습 데이터셋이다.
- **AWS Glue**: 서버리스 Spark. Data Catalog, Crawler, ETL Job, DynamicFrame. 운영 부담 최소, 산발적·표준적 ETL에 적합. 과금은 DPU-시간.
- **Amazon EMR**: EC2 클러스터에서 Hadoop/Spark/Hive/Presto를 직접 운영. 세밀 튜닝·다중 프레임워크·스팟 절감이 필요한 무거운 워크로드에 적합.
- **대규모 전처리**: Parquet 컬럼형 포맷, 파티셔닝(partition pruning), 적절한 파일 크기, predicate pushdown.
- **Spark 감각**: 셔플이 가장 비싸고, 스큐가 잡 시간을 지배한다. 잡 북마크로 증분 처리를 한다.

> 💡 **개념**: Glue vs EMR 판단의 세 축 — 운영 부담(최소화→Glue), 워크로드 성격(짧고 산발적→Glue, 길고 무거운 배치→EMR), 프레임워크 다양성(Spark만→Glue, 여러 엔진→EMR).

## Day 2 복습 — 파이프라인 자동화

- **Step Functions**: 범용 오케스트레이터. ASL(JSON)로 상태 머신 정의. ML+비ML 혼합, 승인, 외부 시스템, 복잡한 분기에 강하다.
- **SageMaker Pipelines**: ML 전용. Python SDK. ProcessingStep/TrainingStep/TuningStep/ConditionStep/RegisterModel. lineage와 모델 레지스트리 내장.
- **선택 기준**: 순수 ML CI/CD와 추적성 → SageMaker Pipelines, ML+비ML 혼합과 승인 → Step Functions. 혼합 사용도 가능하다.
- **트리거**: EventBridge(cron/이벤트), S3 이벤트 → 파이프라인 시작.

> ⚠️ **함정**: "ML이니까 무조건 SageMaker Pipelines"는 단순화된 오답이다. 비-ML 단계·승인·복잡한 분기가 많으면 Step Functions가 더 적합하다.

## Day 3 복습 — 증강·합성·불균형 처리

- **증강**: 레이블을 보존하는 변형으로 기존 데이터를 다양화. 이미지(반전·회전·컬러 지터), 텍스트(동의어 치환·역번역). 도메인 의미 보존이 필수다.
- **합성**: 새로운 가상 데이터를 생성. GAN, 시뮬레이션, 합성 정형 데이터(프라이버시). 분포 갭 위험 → 검증은 실데이터로.
- **불균형 처리**: 데이터 층(오버/언더샘플링, **SMOTE**=보간 합성), 알고리즘 층(클래스 가중치, 임계값), 평가 층(accuracy 금지 → **recall, F1, PR-AUC**).

> 💡 **개념**: SMOTE는 단순 복제와 달리 소수 샘플과 최근접 이웃 사이를 보간해 새 점을 만든다. 1:999 같은 불균형에서 accuracy는 거짓 안심을 주므로 평가는 recall과 PR-AUC로 해야 한다.

## Day 4 복습 — 저장·접근 최적화

| 옵션 | 한 줄 요약 | 적합한 경우 |
|---|---|---|
| File 모드 | 전체 다운로드 후 시작 | 소규모, 반복 읽기 |
| Pipe 모드 | S3 스트리밍, 즉시 시작 | 매우 큰 데이터, 순차 처리 |
| FastFile 모드 | 스트리밍 + POSIX 접근 | 큰 데이터 + 랜덤 접근 |
| FSx for Lustre | 초고속 병렬 FS, S3 연동 | 대규모 + 반복 + 저지연 + 분산 |
| EFS | 관리형 NFS, 다중 마운트 | 여러 잡·노트북이 공유 |
| ShardedByS3Key | 노드별로 데이터 분할 배분 | 데이터 병렬 분산 학습 |

- 핵심 목표: **비싼 GPU가 I/O를 기다리며 놀지 않게 하는 것.**
- 샤딩 전제 조건: 데이터가 여러 S3 객체로 나뉘어 있어야 효과가 난다.
- 분산 학습은 데이터 병렬(모델 복제 + 데이터 분할)이 기본이고, 모델이 GPU에 안 들어갈 때만 모델 병렬을 쓴다.

> 🎯 **통합 시나리오**: "수 TB 데이터, 8개 GPU 노드, 시작이 너무 느리다." → 데이터를 여러 Parquet 샤드로 분할(Day 1) → 파이프라인으로 자동 생성(Day 2) → 불균형이면 SMOTE/가중치(Day 3) → ShardedByS3Key + FSx for Lustre로 공급(Day 4).

## Week 2 서비스·기법 지도

| 역할 | 도구·기법 | 한 줄 |
|---|---|---|
| 서버리스 ETL | AWS Glue | Spark 변환을 클러스터 관리 없이 |
| 메타데이터 | Glue Data Catalog | 스키마·위치·파티션 중앙 저장소 |
| 노코드 정제 | Glue DataBrew | 시각적 정제 레시피 |
| 빅데이터 클러스터 | Amazon EMR | Hadoop·Spark·Hive·Presto 직접 운영 |
| 중간 옵션 | EMR Serverless | 클러스터 없이 Spark 잡만 실행 |
| 범용 오케스트레이션 | AWS Step Functions | 상태 머신으로 이질적 서비스 연결 |
| ML 파이프라인 | SageMaker Pipelines | ML 전용 CI/CD, lineage 내장 |
| 트리거 | Amazon EventBridge | cron·이벤트로 파이프라인 시작 |
| 전처리 실행 | SageMaker Processing | 관리형 분산 전처리·평가 잡 |
| 불균형 보정 | SMOTE, 클래스 가중치 | 데이터 층·알고리즘 층 대응 |
| 데이터 공급 | File / Pipe / FastFile | 시작 지연 vs 랜덤 접근 |
| 고속 스토리지 | FSx for Lustre | 반복·고처리량 학습 I/O |
| 분산 배분 | ShardedByS3Key | 노드별 데이터 조각 배분 |

## 헷갈리는 비교 지점 총정리

| 헷갈리는 짝 | 결정적 차이 |
|---|---|
| Glue vs EMR | 서버리스·운영 최소 vs 풀 컨트롤·다중 프레임워크 |
| Glue Crawler vs Glue ETL Job | 스키마 추론·등록 vs 실제 데이터 변환 |
| Step Functions vs SageMaker Pipelines | 범용·혼합 워크플로 vs ML 전용·lineage |
| 증강 vs 합성 | 기존 데이터 변형 vs 새로운 가상 데이터 생성 |
| 오버샘플링 vs SMOTE | 단순 복제 vs 보간 합성 |
| 언더샘플링 vs 클래스 가중치 | 데이터를 버림 vs 손실에서 벌점을 조정 |
| File vs Pipe vs FastFile | 전체 다운로드 vs 스트리밍 vs 절충 |
| FullyReplicated vs ShardedByS3Key | 전체 복제 vs 노드별 분할 |
| 데이터 병렬 vs 모델 병렬 | 데이터를 쪼갬 vs 모델을 쪼갬 |
| accuracy vs PR-AUC | 균형 데이터용 vs 극단 불균형용 |

> 💡 **개념**: MLS-C01 데이터 엔지니어링 영역의 출제 패턴은 거의 항상 "비용/운영 부담/규모/접근 패턴"의 트레이드오프 판단이다. 정답은 단일 기술이 아니라 **상황(요구사항)에 맞는 선택**이다. 문제에서 "운영 최소", "매우 큰 데이터", "임의 접근 필요", "비-ML 단계 포함" 같은 단서를 찾아 매핑하는 훈련이 핵심이다.

## 지문 단서 → 정답 매핑

| 지문의 표현 | 즉시 떠올릴 것 |
|---|---|
| "운영 인력이 적다", "클러스터 관리를 원치 않는다" | Glue 또는 EMR Serverless |
| "Hive와 Presto도 함께", "세밀한 튜닝" | Amazon EMR |
| "스팟으로 비용 절감" | EMR 태스크 노드 |
| "승인 대기", "외부 시스템 연동" | Step Functions |
| "lineage", "모델 레지스트리", "순수 ML CI/CD" | SageMaker Pipelines |
| "새 데이터가 도착하면 자동 실행" | S3 이벤트 / EventBridge |
| "양성이 0.2%", "사기를 못 잡는다" | SMOTE·클래스 가중치 + recall/PR-AUC |
| "프라이버시 때문에 실데이터를 못 쓴다" | 합성 데이터 |
| "레이블이 바뀌면 안 된다" | 도메인 의미 보존 증강 |
| "GPU가 다운로드를 기다린다" | Pipe/FastFile 모드 |
| "같은 데이터로 반복 학습" | FSx for Lustre |
| "노드마다 전체를 받는다" | ShardedByS3Key |
| "모델이 GPU 메모리에 안 들어간다" | 모델 병렬 |

## Week 2 오답 노트

- **데이터가 크다는 이유만으로 EMR 상시 클러스터** — 산발적 워크로드면 서버리스가 맞다.
- **파티션을 잘게 쪼갤수록 좋다** — 작은 파일이 폭증해 오히려 느려진다.
- **ML이니까 SageMaker Pipelines** — 비-ML 단계가 많으면 Step Functions.
- **재시도 횟수를 늘려 실패를 해결** — 권한·경로·데이터 문제는 재시도로 안 풀린다.
- **검증셋에도 SMOTE 적용** — 리샘플링은 학습셋에만. 검증은 실제 분포를 유지해야 한다.
- **합성 데이터로 검증** — 검증은 반드시 실데이터로.
- **단일 거대 파일 + ShardedByS3Key** — 객체 단위로 못 쪼개 효과가 없다.
- **검증 채널까지 샤딩** — 노드마다 다른 검증셋을 보게 되어 지표가 어긋난다.

## 스스로 점검하기

머릿속으로 답해 보자.

1. 운영 인력이 적고 하루 몇 번 표준 Spark 변환을 돌린다면? → **Glue 서버리스 ETL**
2. Spark·Hive·Presto를 함께 쓰고 인스턴스를 세밀 튜닝해야 한다면? → **Amazon EMR**
3. Spark 잡에서 가장 비싼 연산은? → **셔플**
4. 이미 처리한 데이터를 건너뛰고 새 데이터만 처리하려면? → **Glue 잡 북마크**
5. 승인 대기와 Lambda 후처리가 섞인 워크플로의 상위 오케스트레이터는? → **Step Functions**
6. "정확도 0.85 이상일 때만 모델 등록"을 표현하는 단계는? → **ConditionStep**
7. 소수 클래스를 단순 복제 대신 보간으로 늘리는 기법은? → **SMOTE**
8. 리샘플링은 어느 데이터셋에만 적용하나? → **학습셋만**
9. 합성 데이터로 학습한 모델의 검증은 무엇으로? → **실데이터**
10. 수백 GB를 즉시 학습 시작하고 싶다면? → **Pipe(또는 FastFile) 모드**
11. 같은 데이터셋으로 튜닝을 수백 번 반복한다면? → **FSx for Lustre**
12. `ShardedByS3Key`가 효과를 내는 전제는? → **데이터가 여러 S3 객체로 분할**
13. 모델이 단일 GPU 메모리에 안 들어가면? → **모델 병렬**
14. 스팟으로 장시간 학습할 때 반드시 함께 가는 것은? → **체크포인트**

## 마무리

Week 2는 데이터를 모델까지 보내는 전 과정 — 변환(Glue/EMR), 자동화(Step Functions/SageMaker Pipelines), 증강(augmentation·합성·SMOTE), 효율적 공급(입력 모드·FSx·샤딩)을 다뤘다. 모든 선택의 밑바닥에는 **비용·운영 부담·규모·접근 패턴의 트레이드오프**가 깔려 있다. 다음 주에는 이렇게 준비한 데이터 위에서 본격적인 **모델링과 알고리즘**으로 들어간다. 시험 직전에는 오늘 정리한 비교표를 다시 훑어보길 권한다.

## 📖 용어

- **ETL** : 추출·변환·적재. ML에서는 그 결과물이 곧 학습 데이터셋이다.
- **DPU** : Glue의 처리 용량 단위. 약 4 vCPU + 16GB 메모리.
- **셔플(shuffle)** : 키 기준으로 노드 간 데이터를 재분배하는 Spark 연산. 가장 비싸다.
- **오케스트레이션** : 여러 단계의 실행 순서·조건·재시도를 선언적으로 관리하는 것.
- **lineage(계보)** : 모델이 어떤 데이터·코드·파라미터에서 나왔는지 추적할 수 있는 기록.
- **SMOTE** : 소수 클래스 샘플과 최근접 이웃 사이를 보간해 새 샘플을 만드는 오버샘플링.
- **분포 갭** : 합성·증강 데이터의 분포가 실제와 어긋나 실세계 성능이 떨어지는 위험.
- **입력 모드** : S3 데이터를 학습 컨테이너로 가져오는 방식. File·Pipe·FastFile.
- **ShardedByS3Key** : S3 객체를 인스턴스별로 나눠 각자 다른 조각만 받게 하는 설정.
- **데이터 병렬 / 모델 병렬** : 데이터를 쪼개 모델을 복제하는 방식 / 모델 자체를 여러 GPU에 쪼개는 방식.

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
