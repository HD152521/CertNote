# Day 4 - MLOps Deep Dive: Science of Drift, Feature Store, Automated Retraining Pipelines

The most common shock teams hit 6 months after pushing an ML model to production is: "the model silently started failing." The code unchanged, infrastructure healthy, error logs clean. Yet recommendation click-through drops, fraud detection misses new patterns. The cause isn't code—it's that **the world changed**. Input data distribution shifted from training time (data drift), or the outcome pattern itself changed (concept drift). Traditional software operations (DevOps) have no tools for this "silent degradation." **MLOps** addresses ML systems' unique problem—data dependency, drift, train-serve skew, automated retraining—as operational discipline. In SAP-C02, MLOps appears as "how do we monitor quality post-deployment?", "how do we auto-trigger retraining?", "how do we govern model approval/deployment?" as operational architecture.

Today, instead of listing MLOps tools, we'll deconstruct why drift occurs and how to detect it, what structural problems Feature Store solves, and how a fully-automated retraining pipeline assembles.

## Why MLOps Differs from DevOps — Beyond Code, Data Changes

DevOps's core assumption: "if code doesn't change, behavior doesn't change"—determinism. That's why CI/CD focuses on testing and deploying code changes. ML breaks this. Model behavior depends on **(1) training data, (2) production-time input data distribution**. Fixed code + changed data = changed behavior. MLOps adds to DevOps: **data/model versioning, drift monitoring, automated retraining**.

ML systems need three kinds of "versions"—code, data, models. Without tracking their combination (lineage), you can't answer "which data trained which model, running now?" and debugging becomes impossible. SageMaker bundles this: Pipelines (workflows), Model Registry (model versions), Feature Store (data), Lineage Tracking.

> 💡 **Related Theory**: Data Drift and Concept Drift are distinct phenomena. **Data Drift (covariate shift)** is when input X distribution changes—e.g., new user demographics shift age distribution. Model becomes inaccurate outside training-seen ranges. **Concept Drift** is when the relationship P(Y|X) itself changes—e.g., pandemic makes "mask purchase" shift from normal to anomalous to normal again. Data Drift detectable from inputs alone (no labels needed); Concept Drift needs actual ground truth. This maps to Model Monitor's two types: Data Quality vs Model Quality.

## Model Monitor — 4 Types of Monitoring and What Needs Labels

**Model Monitor** captures production endpoint input/output, compares against baseline (training data statistics). Four types exist; core distinction: "does actual ground truth (labels) matter?"

- **Data Quality**: Input feature distributions/statistics (mean, missing, range) deviate from baseline? **No labels needed**—inputs alone. Data Drift detection.
- **Model Quality**: Prediction accuracy/precision/recall fallen? **Needs labels**—actual answers required to compute accuracy. Concept Drift detection.
- **Bias Drift**: Model bias (unfavorable predictions to certain groups) growing over time? Clarify integration.
- **Feature Attribution Drift**: Each feature's prediction contribution (SHAP values) changing?

Results stored in S3, alerted via CloudWatch.

> 🔍 **Deep Dive**: Model Quality monitoring is hard because of **label latency**. A fraud model predicts "this transaction is normal," but knowing if it was actually fraud requires chargeback—days to weeks later. Real-time accuracy unknown. So teams monitor Model Quality where labels come quickly, Data Quality (input distribution change as early warning) where labels lag. Input distribution shifting drastically signals "model at risk" even without knowing ground truth. Exams: "detect model risk without labels" = Data Quality, "detect actual accuracy drop" = Model Quality.

> 📚 **Case Study**: An e-commerce recommendation team silently watched accuracy degrade for months before discovering it via sales drop. Root cause: new marketing campaign brought users whose behavior distribution vastly differed from training data (data drift). Enabling Model Monitor Data Quality and connecting input distribution deviation past baseline to CloudWatch Alarms, they got immediate alerts. Piping to EventBridge autostarted retraining—when distribution exceeded thresholds, alerts fired, auto-retraining kicked in. Lesson: detect drift "when inputs change," not "after it explodes." Waiting for labels is too late.

## Feature Store — Train-Serve Skew Structural Trap

ML's most elusive bug: **train-serve skew**. Training-time feature calculation code subtly differs from inference-time code, so models receive "input never seen in training" and silently fail. Example: training batched "7-day average purchase" differently than real-time code's hour-handling, values diverge. No errors, clean logs, accuracy drops alone.

**Feature Store** prevents this structurally. Define/compute features once, store centrally, ensure training and inference **read identical features from synchronized stores**.

| Store | Backend | Traits | Use |
|-------|---------|--------|-----|
| **Online Store** | DynamoDB | Low-latency (ms) single-fetch | Real-time inference |
| **Offline Store** | S3 + Glue catalog | High-volume, historical | Training, batch, analytics |

Synced automatically. Feature groups defined by **Record Identifier** (e.g., customer_id) and **Event Time** to track point-in-time feature values.

> 💡 **Related Theory**: Feature Store's Online/Offline split mirrors OLTP vs OLAP separation (Day 42). Inference "fetches one customer's features in milliseconds" (OLTP→DynamoDB); training "scans millions of rows of historical features" (OLAP→S3). One store can't excel at both; split and sync. Point-in-time correctness—using "features knowable at that point"—prevents **data leakage** (future info bleeding into training). Event Time-based queries guarantee this. Exams: "prevent training/inference feature mismatch" always maps to Feature Store.

## Model Registry — Model Governance and Approval Workflow

Deploying which model to production isn't a casual decision. **Model Registry** manages model versions in **Model Package Groups**, assigning approval states (PendingManualApproval / Approved / Rejected) to each version. Auto pipelines train/evaluate, register to registry (Pending), humans review then approve, Approved event fires via EventBridge triggering auto-deployment. This merges "automation efficiency" with "human governance."

> 🔍 **Deep Dive**: Registry approval gates matter especially in regulated industries (finance, healthcare). If models determine credit scores or diagnoses, you must audit "what data trained this, what validation passed, who approved when?" Model Registry preserves lineage and approval history. Catching Approved state via EventBridge rule and triggering Lambda deployment creates "human approval + auto deploy" hybrid—neither fully automatic nor fully manual—governed automation. Exams: "model review before deploy + auto deploy on approval" = Model Registry + EventBridge.

## Complete Auto MLOps Pipeline — Closing the Retraining Loop

Stitching all pieces: self-healing ML systems.

```
[CodeCommit/Git] → [CodePipeline] → [SageMaker Pipeline (DAG)]
       │
       ├─▶ [Processing: feature engineering] (Feature Store load)
       ├─▶ [Training: Spot + Checkpoint]
       ├─▶ [Evaluation: metric calculation]
       │         │
       │    [Condition Step] Accuracy > 0.9?
       │         │ yes
       ├─▶ [Model Registry: register (Pending)]
       │         │
       │    [Manual Approval] (governance gate)
       │         │ Approved
       ├─▶ [EventBridge Rule → Lambda → Endpoint deploy]
       │
       └─▶ [Model Monitor: drift watch]
                 │ drift threshold exceeded
                 └─▶ [EventBridge → Pipeline re-run] ← loop closed
```

**SageMaker Pipelines** orchestrates this full DAG, auto-tracks input/output/execution via Lineage, skips unchanged steps via caching. Model Monitor detects drift, EventBridge re-runs pipeline, loop closes.

> 🎯 **Scenario**: "Production model accuracy falls over time, auto-detect, auto-retrain without human if threshold exceeded, but new model needs data scientist approval before deployment. Full architecture?" — Answer: **Model Monitor (drift detect) → CloudWatch Alarm/EventBridge (trigger) → SageMaker Pipelines (retrain DAG) → Model Registry (Pending register) → manual approval → EventBridge (Approved event) → Lambda (Endpoint deploy)**. Core: drift/retrain auto (EventBridge), deploy governed (Model Registry approval gate). "Auto trigger + human approval" is the hybrid answer. Trap: retraining auto via EventBridge+Pipelines, deployment governance via Model Registry approval.

> ⚠️ **Trap**: "Make ML pipeline as DAG" problems: Step Functions, MWAA (Airflow), Glue Workflow also do DAG orchestration, looking answerable. But if **ML-specific (experiment tracking, model lineage, training/tuning/eval steps, Model Registry link, step caching)** is needed, SageMaker Pipelines is correct. Step Functions suits general workflows (mixed ML/non-ML); MWAA for complex scheduling/existing Airflow migration; Glue Workflow for ETL. Exams: "ML workflow + Lineage/experiments/caching" = SageMaker Pipelines.

## CI/CD for ML — SageMaker Projects

You can use traditional CI/CD tools (CodePipeline, CodeBuild, CodeCommit) for ML, but **SageMaker Projects** provides MLOps CI/CD templates pre-configured. Model build (train→evaluate→register) pipeline and model deploy (approve→stage→prod) pipeline come ready-built, reducing boilerplate. Alternative/supplement to GitHub Actions, Jenkins.

## Summary

MLOps solves "code and data change differently" via operational discipline. Detect drift (Data/Concept) with Model Monitor (label-dependent split: Data Quality vs Model Quality), prevent train-serve skew structurally via Feature Store, govern model versions/approvals via Model Registry, orchestrate full DAG via SageMaker Pipelines, close retraining loop via EventBridge.

SAP exam common mappings: (1) "training/inference feature mismatch" → Feature Store, (2) "detect drift without labels, fast" → Model Monitor Data Quality, (3) "detect actual accuracy drop" → Model Monitor Model Quality, (4) "human review then auto deploy" → Model Registry + EventBridge, (5) "ML workflow DAG + Lineage" → SageMaker Pipelines, (6) "group bias time-drift" → Model Monitor + Clarify Bias Drift, (7) "MLOps CI/CD template" → SageMaker Projects. Next day: Week 10 full synthesis with 12-scenario problems.

---

## 📝 연습 문제

**문제 1.** 학습 때 배치로 계산한 피처와 실시간 추론 때 계산한 피처가 미묘하게 달라 모델이 조용히 부정확해지는 train-serve skew를 구조적으로 방지하려 한다. 가장 적합한 것은?

A) S3에 피처를 저장해 양쪽이 읽게 함
B) SageMaker Feature Store(Online/Offline)
C) 학습·추론 코드를 같은 Lambda로 통합
D) 추론 결과를 DynamoDB에 캐싱

**정답: B**
해설: Feature Store는 피처를 한 번 정의·계산해 중앙 저장하고, 학습(Offline/S3)과 추론(Online/DynamoDB)이 동일하게 정의된 피처를 자동 동기화된 저장소에서 읽게 해 train-serve skew를 구조적으로 막는다. Event Time 기반 point-in-time 조회로 data leakage도 방지한다. A(S3 공유)·C·D는 피처 정의·버전·동기화를 직접 관리해야 해 skew 위험이 남는다. 함정: "학습·추론 피처 일관성"은 Feature Store.

---

**문제 2.** 사기 탐지 모델은 실제 정답(차지백)이 며칠 뒤에야 온다. 라벨을 기다리지 않고 운영 중 모델의 위험을 조기에 감지하려 한다. 어떤 모니터링인가?

A) Model Monitor Model Quality
B) Model Monitor Data Quality
C) Clarify Bias Drift
D) CloudWatch Custom Metric만

**정답: B**
해설: Data Quality 모니터링은 입력 피처의 분포·통계가 학습 기준선에서 벗어났는지를 보며 라벨이 필요 없다. 라벨 지연이 큰 도메인에서 입력 분포 변화(data drift)를 조기 경보로 활용한다. A(Model Quality)는 실제 정확도를 계산하므로 라벨이 필요해 며칠을 기다려야 한다. C(Bias Drift)는 편향 변화용. D는 ML 기준선 비교·드리프트 감지 자동화가 없다. 함정: "라벨 없이 조기 감지"는 Data Quality, "실제 정확도 하락"은 Model Quality.

---

**문제 3.** 자동 학습된 새 모델을 프로덕션에 올리기 전 데이터 과학자가 반드시 검토·승인해야 하고, 승인되면 사람 개입 없이 엔드포인트에 자동 배포되어야 한다. 어떤 구성인가?

A) CodePipeline Manual Approval만
B) Model Registry 승인 상태 + EventBridge(Approved) → Lambda 배포
C) Lambda 게이트로 직접 구현
D) Jenkins 빌드 승인

**정답: B**
해설: Model Registry는 모델 버전에 승인 상태(Pending/Approved/Rejected)를 부여해 사람 검토 게이트를 만들고, Approved 이벤트를 EventBridge로 잡아 Lambda 배포를 자동 트리거한다. "사람 승인 + 승인 후 자동 배포"의 하이브리드 거버넌스가 ML 모델 배포의 표준이다. A는 일반 파이프라인 승인이지 모델 버전·lineage 거버넌스가 아니다. C·D는 직접 구현 부담. 함정: "모델 검토 승인 + 승인 시 자동 배포"는 Model Registry + EventBridge.

---

**문제 4.** 모델 운영 중 실제 예측 정확도가 시간이 지나며 떨어지는 것(concept drift)을 자동 감지하려 한다. 실제 라벨은 확보 가능하다. 어떤 모니터링인가?

A) Model Monitor Data Quality
B) Model Monitor Model Quality
C) Feature Attribution Drift
D) Trusted Advisor

**정답: B**
해설: Model Quality 모니터링은 실제 정답(라벨)과 예측을 비교해 정확도·정밀도·재현율의 하락을 감지하며, 이것이 concept drift(입력-정답 관계 변화) 감지에 해당한다. 라벨이 확보 가능하다는 조건이 Model Quality를 가능하게 한다. A(Data Quality)는 입력 분포만 보고 실제 정확도는 모른다. C는 피처 기여도 변화, D는 ML 모니터가 아니다. 함정: "실제 정확도 하락 + 라벨 있음"은 Model Quality.

---

**문제 5.** 모델의 예측이 특정 인구 집단에 불리해지는 편향(bias)이 시간 경과에 따라 커지는지 감지해야 한다. 어떤 조합인가?

A) Model Monitor + Clarify Bias Drift
B) DataBrew
C) Comprehend
D) GuardDuty

**정답: A**
해설: Model Monitor의 Bias Drift는 SageMaker Clarify와 통합되어 모델 예측의 편향 지표가 기준선 대비 시간에 따라 변하는지를 감지한다. B(DataBrew)는 데이터 준비 도구, C(Comprehend)는 NLP, D(GuardDuty)는 위협 탐지로 모델 편향과 무관. 함정: "편향 시간 변화 감지"는 Model Monitor + Clarify Bias Drift.

---

**문제 6.** 전처리·학습·튜닝·평가·등록·배포로 이어지는 ML 워크플로우를 DAG로 표현하고, 각 스텝의 입출력 lineage와 실험을 자동 추적하며, 변경 없는 스텝은 캐싱하려 한다. 가장 적합한 것은?

A) AWS Step Functions
B) SageMaker Pipelines
C) Amazon MWAA(Airflow)
D) Glue Workflow

**정답: B**
해설: SageMaker Pipelines는 ML 전용 DAG 오케스트레이터로 학습/튜닝/평가/등록 스텝, Model Registry 연동, Lineage 자동 추적, 스텝 캐싱을 기본 제공한다. A(Step Functions)는 범용 워크플로우(ML 외 작업 혼합)에, C(MWAA)는 복잡 스케줄링·기존 Airflow 마이그레이션에, D(Glue Workflow)는 ETL에 적합하지만 ML lineage·실험 추적이 없다. 함정: "ML 워크플로우 + Lineage/실험/캐싱"은 SageMaker Pipelines.

---

**문제 7.** 운영 중 모델의 입력 분포가 임계치를 넘게 변하면 사람 개입 없이 재학습 파이프라인을 자동 실행하고 싶다. 어떤 연결인가?

A) CloudWatch Alarm → 수동 재학습
B) Model Monitor 드리프트 → EventBridge → SageMaker Pipeline 재실행
C) Lambda 크론으로 매일 무조건 재학습
D) Config 규칙 → SNS

**정답: B**
해설: Model Monitor가 드리프트를 감지하면 CloudWatch/EventBridge로 이벤트를 발생시키고, EventBridge 규칙이 SageMaker Pipeline 재실행을 트리거해 재학습 루프를 자동으로 닫는다. A는 수동이라 자동화가 아니다. C(무조건 매일 재학습)는 드리프트와 무관하게 비용·자원 낭비. D는 구성 규정 준수용으로 ML 재학습과 무관. 함정: "드리프트 감지 → 자동 재학습"은 Model Monitor + EventBridge + Pipelines.

---

## 📌 Today's Summary

1. **MLOps ≠ DevOps** — Code, data, models all change. Three-type versioning + lineage tracking critical
2. **Data Drift vs Concept Drift** — Input distribution change (no labels) vs input-output relationship change (labels needed)
3. **Model Monitor 4 types** — Data Quality (label-free, early warning), Model Quality (labels, accuracy), Bias Drift, Feature Attribution Drift
4. **Feature Store** — Online (DDB low-latency inference) / Offline (S3 training/analytics) auto-synced. Prevents train-serve skew and data leakage
5. **Model Registry** — Model versioning, approval gates (Pending/Approved/Rejected). Approved → EventBridge → auto-deploy
6. **SageMaker Pipelines** — ML-specific DAG, Lineage/experiments/caching. Step Functions/MWAA general-purpose
7. **Retraining loop** — Model Monitor drift → EventBridge → Pipeline re-run. SageMaker Projects = MLOps CI/CD template
