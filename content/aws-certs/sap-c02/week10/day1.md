# Day 46 - SageMaker 전체 라이프사이클

📅 날짜: Week 10 (Day 1)
🎯 주제: ML 플랫폼 표준
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SageMaker의 핵심 컴포넌트(Studio·Notebook·Processing·Training·Endpoint)를 안다
- 모델 학습·배포의 표준 흐름과 비용 최적화 방법을 안다
- Multi-Model Endpoint·Serverless Inference·Async Inference의 차이
- Feature Store·Model Registry·Pipelines

---

## 🧩 사전 지식 (CS 기초)

- **ML 라이프사이클**: Data 수집 → Feature → Training → Evaluation → Deploy → Monitor → Retrain
- **Hyperparameter Tuning**: Bayesian·Random·Grid Search
- **A/B Test**: 두 모델 트래픽 분할

---

## 📖 이론 내용

### 1. SageMaker 컴포넌트

| 컴포넌트 | 역할 |
|---------|-----|
| **Studio** | 통합 IDE |
| **Notebooks (Classic·Studio Notebooks)** | Jupyter |
| **Data Wrangler** | 노코드 데이터 준비 |
| **Processing Jobs** | 전처리·후처리 |
| **Training Jobs** | 모델 학습 (Distributed·Spot) |
| **Hyperparameter Tuning** | HPO |
| **Model Registry** | 모델 버전·승인 |
| **Endpoint** | 추론 서빙 |
| **Pipelines** | MLOps DAG |
| **Model Monitor** | 데이터 드리프트 |
| **Clarify** | 편향·설명가능성 |
| **Feature Store** | 피처 중앙 저장소(온라인/오프라인) |

### 2. Endpoint 종류

| 종류 | 사용처 |
|------|--------|
| **Real-Time** | 저지연 동기 |
| **Serverless Inference** | 가변·콜드 허용 |
| **Async Inference** | 큰 페이로드·1GB·15분 |
| **Batch Transform** | 대량 일괄 추론 |
| **Multi-Model** | 한 엔드포인트에 다수 모델 |
| **Multi-Container** | 다수 컨테이너 |

### 3. Training 비용 최적화

- **Managed Spot Training** — 최대 90% 할인 + Checkpoint
- **Distributed Training** — Data Parallel·Model Parallel
- **SageMaker Training Compiler** — 학습 속도↑

### 4. Inference 최적화

- **SageMaker Neo**: 모델 컴파일·엣지/Edge Manager
- **Elastic Inference (deprecated)** → **Inf1/Inf2/Trainium**으로 대체
- **Inferentia 칩** = 추론 전용, 비용·성능↑

### 5. Pipelines (MLOps)

- DAG 형식 ML 워크플로우
- Processing → Training → Evaluation → Registry → Deploy
- EventBridge·CodePipeline 통합

### 6. Model Registry & Approval Workflow

- 등록된 모델 버전에 Approved/Rejected 상태
- 자동 배포 트리거

### 7. Feature Store

- **Online**: 저지연 추론용
- **Offline**: S3 + Glue 분석용
- 학습·추론 피처 일관성 보장

---

## 🧠 알아두면 좋은 심화 이론

### SageMaker JumpStart

- 사전 학습된 모델·솔루션 1-click 배포

### SageMaker Canvas

- 노코드 ML — 비즈니스 분석가용

### SageMaker Ground Truth

- 데이터 레이블링 (사람·자동)

### Shadow Endpoint

- 실시간 운영 트래픽을 새 모델로 미러링해 비교

---

## 🏗️ 다이어그램 — SageMaker MLOps Pipeline

```
[Data S3] → [Processing Job] → [Training (Spot)]
                                   │
                                   ▼
                          [Evaluation Step]
                                   │ Approved
                                   ▼
                          [Model Registry]
                                   │
                                   ▼
                          [Endpoint Deploy (A/B)]
                                   │
                          [Model Monitor → Drift Alert]
```

---

## ⭐ 핵심 포인트

1. ⭐ Studio = 통합 IDE / Pipelines = MLOps DAG
2. ⭐ Endpoint 4종 — Real-time / Serverless / Async / Batch
3. ⭐ **Managed Spot Training 90% 할인 + Checkpoint**
4. ⭐ Inferentia/Trainium으로 추론·학습 비용↓
5. ⭐ Feature Store Online/Offline 일관성
6. ⭐ Model Monitor + Clarify
7. ⭐ Shadow Endpoint·A/B Test

---

## 💻 실제 예시 - Spot Training

```python
from sagemaker.estimator import Estimator
est = Estimator(
    image_uri="...",
    role=role,
    instance_count=1,
    instance_type="ml.p3.2xlarge",
    use_spot_instances=True,
    max_run=3600,
    max_wait=7200,
    checkpoint_s3_uri="s3://bucket/ckpt/"
)
est.fit({"train":"s3://bucket/data/"})
```

---

## 📝 연습 문제

**문제 1.** 큰 페이로드(500MB)·긴 추론 시간.

A) Real-Time Endpoint
B) Async Inference
C) Batch Transform
D) Serverless Inference

**정답: B** (Batch도 가능하지만 동기 요청형 = Async)

---

**문제 2.** 학습 비용 90%↓ + 중단 복구.

A) Reserved
B) Managed Spot + Checkpoint
C) Savings Plans
D) Inferentia

**정답: B**

---

**문제 3.** 추론 비용·성능 최적화 칩.

A) Trainium
B) Inferentia (Inf1/Inf2)
C) Graviton
D) F1 FPGA

**정답: B**

---

**문제 4.** 학습·추론 피처 일관성.

A) S3만
B) Feature Store Online/Offline
C) DynamoDB
D) Redshift

**정답: B**

---

**문제 5.** 운영 트래픽 미러링 신모델 비교.

A) A/B
B) Shadow Endpoint
C) Canary
D) Multi-Model

**정답: B**

---

**문제 6.** 노코드 ML — 비즈니스 분석가용.

A) Canvas
B) Data Wrangler
C) Studio
D) JumpStart

**정답: A**

---

## 📌 오늘의 요약

1. Studio·Pipelines·Registry·Monitor = MLOps
2. Endpoint 4종 차이 (RT/Serverless/Async/Batch)
3. Spot Training 90%·Inferentia/Trainium
4. Feature Store 일관성
5. Shadow/Canvas/JumpStart
