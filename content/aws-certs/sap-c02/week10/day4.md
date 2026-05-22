# Day 49 - ML 운영 (MLOps), Feature Store, Model Registry

📅 Week 10 (Day 4)
🎯 주제: ML 시스템의 운영 자동화
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- MLOps의 표준 파이프라인 구성요소를 안다
- SageMaker Pipelines·Model Registry·Feature Store의 역할
- Model Monitor·Clarify로 운영 후 품질 관리

---

## 🧩 사전 지식 (CS 기초)

- **CI/CD**: 코드 빌드·테스트·배포 자동화
- **Data Drift**: 운영 시 입력 분포가 학습 시와 달라지는 현상
- **Concept Drift**: 정답 분포 자체가 변하는 현상

---

## 📖 이론 내용

### 1. MLOps 구성요소

| 단계 | 도구 |
|------|------|
| 데이터 수집 | S3 / Kinesis / Glue |
| 피처 엔지니어링 | Processing Job / Data Wrangler |
| 피처 저장 | **Feature Store** |
| 학습·튜닝 | Training Job / HPO |
| 모델 평가 | Processing Job + Custom Metric |
| 모델 버전·승인 | **Model Registry** |
| 배포 | Endpoint / Pipelines |
| 모니터 | **Model Monitor** + Clarify |
| 재학습 트리거 | EventBridge → Pipeline |

### 2. SageMaker Pipelines

- **DAG 기반** ML 워크플로우
- 각 Step: Processing / Training / Tuning / Evaluation / Condition / RegisterModel / Lambda
- **재실행·캐싱·Lineage** 자동 관리

### 3. Model Registry

- 모델 버전 = **Model Package Group**
- 상태: PendingManualApproval / Approved / Rejected
- **EventBridge** 연동 → Approved 시 자동 배포

### 4. Feature Store

| 저장소 | 특징 |
|--------|------|
| **Online Store** | DynamoDB 기반 저지연 (추론용) |
| **Offline Store** | S3 + Glue 카탈로그 (학습·분석) |
| **자동 동기** | Online → Offline |

- 학습·추론 피처 일관성 보장 (Train-Serve Skew 방지)
- 피처 그룹 정의: Record Identifier + Event Time

### 5. Model Monitor

- **Data Quality**: 입력 분포 변화
- **Model Quality**: 예측 정확도(라벨 필요)
- **Bias Drift**: Clarify 통합
- **Feature Attribution Drift**: SHAP 값 변화
- 결과 → S3 + CloudWatch Alarm

### 6. CI/CD

- **CodePipeline** + **CodeBuild** + **CodeCommit**
- SageMaker Projects가 템플릿 제공
- Jenkins/GitHub Actions 대신 사용 가능

---

## 🧠 심화 이론

### 함정 포인트

- "학습·추론 결과 불일치" → Feature Store
- "운영 후 정확도 저하 탐지" → Model Monitor (Model Quality)
- "수동 검토 후 자동 배포" → Model Registry + EventBridge

### 암기팁

- Pipelines = DAG / Registry = 버전 / Feature Store = 피처
- Monitor = 사후 / Clarify = 편향·설명

---

## 🏗️ 아키텍처 — 완전 자동 MLOps

```
[CodeCommit] → [CodePipeline]
                    │
                    ▼
              [SageMaker Pipeline]
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
   [Processing] [Training] [Evaluation]
                              │
                         [Condition Step]
                              │ Acc > 0.9
                              ▼
                      [Model Registry: Pending]
                              │
                         [Manual Approval]
                              ▼
                       [EventBridge Rule]
                              ▼
                      [Lambda → Endpoint 배포]
                              │
                       [Model Monitor]
                              ▼
                    [Drift → 재학습 트리거]
```

---

## ⭐ 핵심 포인트

1. ⭐ Pipelines = DAG MLOps 워크플로우
2. ⭐ Model Registry = 버전 + 승인 워크플로우
3. ⭐ Feature Store = Online(DDB) / Offline(S3)
4. ⭐ Model Monitor 4종 (Data/Model/Bias/Feature Drift)
5. ⭐ EventBridge로 재학습 자동 트리거
6. ⭐ SageMaker Projects = 템플릿형 CI/CD

---

## 💻 CLI 예시

```bash
# Model Package 승인
aws sagemaker update-model-package \
  --model-package-arn arn:aws:sagemaker:... \
  --model-approval-status Approved

# Feature Group 생성
aws sagemaker create-feature-group \
  --feature-group-name customer-features \
  --record-identifier-feature-name customer_id \
  --event-time-feature-name event_time \
  --online-store-config EnableOnlineStore=true
```

---

## 📝 연습 문제

**문제 1.** 학습·추론 피처 불일치 방지.

A) S3 공유
B) SageMaker Feature Store
C) DynamoDB 직접
D) Redshift

**정답: B**

---

**문제 2.** 모델 배포 전 수동 검토.

A) CodePipeline Manual Approval만
B) Model Registry Approval Status
C) Lambda 게이트
D) Jenkins 빌드

**정답: B**

---

**문제 3.** 운영 중 입력 분포 변화 탐지.

A) CloudWatch Custom Metric만
B) Model Monitor Data Quality
C) Clarify
D) Trusted Advisor

**정답: B**

---

**문제 4.** 모델 승인되면 자동 엔드포인트 배포.

A) CodeDeploy 수동
B) EventBridge Rule + Lambda
C) Step Functions 수동
D) CFN 수동

**정답: B**

---

**문제 5.** 편향(bias) 시간 경과 변화 탐지.

A) Model Monitor + Clarify Bias Drift
B) DataBrew
C) Comprehend
D) GuardDuty

**정답: A**

---

**문제 6.** 전체 ML 파이프라인 DAG 표현 + Lineage.

A) Step Functions
B) SageMaker Pipelines
C) MWAA
D) Glue Workflow

**정답: B** — ML 전용 + Lineage 자동

---

## 📌 오늘의 요약

1. Pipelines = MLOps DAG
2. Registry = 모델 버전·승인
3. Feature Store Online/Offline
4. Model Monitor = 사후 품질
5. EventBridge로 재학습 자동
