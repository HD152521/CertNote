# Day 2 - Real-time Endpoint Operations: Configuration, Auto Scaling, Multi-Model

Yesterday we identified that real-time endpoints carry the heaviest operational burden among four inference options. To provide stable low-latency service on always-on instances, you must understand endpoint configuration, traffic-responsive auto-scaling, and cost control as models multiply from tens to thousands. Today covers the three pillars of SageMaker real-time endpoint operations: endpoint configuration, auto-scaling, and multi-model/multi-container patterns.

## Endpoint's Three-Layer Architecture

SageMaker real-time inference separates three resources, providing the foundation for zero-downtime updates and traffic splitting.

```text
Model              : Training output (S3 model artifact) + inference container image
EndpointConfig     : Defines which Models, on which instances/ratios (ProductionVariant)
Endpoint           : Actual HTTPS URL. Points to EndpointConfig.
```

The key is that **Endpoint and EndpointConfig are separate**. Create a new EndpointConfig, then UpdateEndpoint swaps it in—SageMaker launches a new fleet, shifts traffic, then tears down the old one (zero downtime).

```python
from sagemaker.model import Model

model = Model(image_uri=image, model_data=s3_artifact, role=role)
model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="prod-endpoint",
)
```

> 💡 **Related Theory**: A single EndpointConfig can hold multiple ProductionVariants, each with `InitialVariantWeight` to specify traffic ratio. This weight-based splitting is the foundation for A/B testing and canary deployment, covered tomorrow.

## Auto Scaling: Instance Count Matches Traffic

To reduce always-on cost traps, instance count must scale automatically with traffic. SageMaker supports variant-level scaling via Application Auto Scaling.

```python
import boto3
client = boto3.client("application-autoscaling")

client.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId="endpoint/prod-endpoint/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=2, MaxCapacity=10,
)
client.put_scaling_policy(
    PolicyName="invocations-per-instance",
    PolicyType="TargetTrackingScaling",
    TargetTrackingScalingPolicyConfiguration={
        "TargetValue": 1000.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "SageMakerVariantInvocationsPerInstance"
        },
        "ScaleInCooldown": 300, "ScaleOutCooldown": 60,
    },
)
```

- **Recommended base metric**: `SageMakerVariantInvocationsPerInstance` — tracks invocations per instance per second against target (Target Tracking).
- **Cooldowns**: Keep ScaleOut short, ScaleIn long, to prevent flapping (repeatedly scaling down then up on traffic volatility).
- **MinCapacity ≥ 1**: Never goes to zero. Need complete zero-scaling? Use Serverless or Async instead.

## Policy Types

```text
Target Tracking : Auto-adjust to maintain target metric (most recommended, simple config)
Step Scaling    : CloudWatch alarms trigger predefined step adjustments
Scheduled       : Time-based when traffic pattern is predictable (e.g., business hours only)
```

In most exam scenarios, "maintain specific latency/utilization" → Target Tracking is the answer.

## Multi-Model Endpoint (MME): Thousands of Models on One Endpoint

When models multiply to hundreds or thousands (per customer, per region), hosting each on separate endpoints is cost-prohibitive and unmanageable. A multi-model endpoint hosts many models on shared instances, loading them dynamically.

```python
from sagemaker.multidatamodel import MultiDataModel

mme = MultiDataModel(
    name="mme-endpoint",
    model_data_prefix="s3://my-bucket/models/",  # Prefix where model artifacts live
    image_uri=image, role=role,
)
predictor = mme.deploy(initial_instance_count=2, instance_type="ml.m5.xlarge")
# On invoke, specify which model via TargetModel
predictor.predict(data, target_model="customer-123.tar.gz")
```

- **Mechanism**: Incoming request triggers model load to memory (or reuse if already loaded); when memory runs low, least-recently-used models are unloaded (LRU).
- **Benefit**: Host thousands of models on just a few instances → massive cost savings.
- **Tradeoff**: Models not invoked recently incur cold-start latency on first call. All models must **share framework/container**.

## Multi-Container Endpoint (MCE) and Inference Pipeline

For models in different frameworks on one endpoint, use multi-container, not multi-model.

```text
Multi-Model Endpoint (MME)    : Same container, N different model artifacts, dynamic loading
Multi-Container Endpoint (MCE): N different containers. Direct (individual calls) or Serial mode
Inference Pipeline            : Link containers sequentially (preprocess→predict→postprocess) into one request
```

An inference pipeline example: chain Scikit-learn preprocessing container → XGBoost prediction container to guarantee the same preprocessing at inference as at training (prevents train-serving skew).

> 💡 **Related Theory**: "Thousands similar models, same framework, cost savings" → MME. "Bundle preprocessing and prediction into one request" → Inference Pipeline. "Different framework models on one endpoint, called separately" → MCE Direct mode. Distinguishing these three is a frequent exam question.

## Key Operations Monitoring Metrics

```text
ModelLatency           : Time model container spent on inference
OverheadLatency        : SageMaker overhead (request/response handling)
Invocations            : Invocation count
Invocation4XX/5XX      : Client/server errors
CPU/GPU/Memory Utilization : Resource usage → basis for scaling/instance type decisions
```

If latency is high in ModelLatency, optimize model/upgrade instance. If high in OverheadLatency, suspect payload/serialization issues.

## Summary

Real-time endpoint operations follow three axes: "Configuration (zero-downtime swap) → Auto Scaling (cost and stability) → Multi-Model/Pipeline (scale and consistency)." The distinction between multi-model, multi-container, and inference pipeline is critical for exams. Next, we optimize endpoints to run faster and cheaper with Neo, Inferentia, and inference pipelines.

## 📝 연습 문제

**문제 1.** 한 회사가 고객 1만 명 각각에 대해 동일한 XGBoost 프레임워크로 학습된 개인화 모델을 운영해야 한다. 모든 모델을 개별 엔드포인트로 띄우는 비용은 감당할 수 없다. 가장 적합한 방식은?

A) 모델 1만 개에 대해 각각 Real-time Endpoint 생성  
B) 멀티모델 엔드포인트(MME)  
C) 멀티컨테이너 엔드포인트 Direct 모드  
D) Batch Transform  

**정답: B**  
해설: "수천~수만 개의 동일 프레임워크 모델 + 비용 절감"은 멀티모델 엔드포인트의 정의다. 공유 인스턴스에 모델을 동적 로딩한다. 개별 엔드포인트(A)는 비용 폭증, MCE(C)는 서로 다른 컨테이너용, Batch(D)는 온라인 개인화 추론에 부적합하다.

---

**문제 2.** 실시간 엔드포인트의 인스턴스 수를, 인스턴스당 초당 호출 수를 일정하게 유지하도록 자동 조절하고 싶다. 가장 적절한 오토스케일링 정책은?

A) Scheduled Scaling  
B) Step Scaling  
C) Target Tracking (SageMakerVariantInvocationsPerInstance)  
D) 수동으로 UpdateEndpoint 호출  

**정답: C**  
해설: 목표 지표값을 유지하도록 자동 조절하는 것은 Target Tracking이며, 인스턴스당 호출 수를 추적하는 기본 지표가 SageMakerVariantInvocationsPerInstance다. Scheduled(A)는 예측 가능한 시간표용, Step(B)은 알람 단계별 가감, 수동(D)은 자동화가 아니다.

---

**문제 3.** 학습 시 Scikit-learn으로 전처리하고 XGBoost로 예측했다. 추론 시에도 동일한 전처리를 한 번의 요청으로 보장해 학습-서빙 스큐를 막고 싶다. 적절한 구성은?

A) 추론 파이프라인(Inference Pipeline)으로 전처리 컨테이너와 예측 컨테이너를 직렬 연결  
B) 멀티모델 엔드포인트  
C) 두 개의 별도 실시간 엔드포인트를 클라이언트가 순서대로 호출  
D) Batch Transform 두 번 실행  

**정답: A**  
해설: 추론 파이프라인은 여러 컨테이너를 직렬로 묶어 전처리→예측을 한 요청으로 처리하므로 학습과 동일한 전처리를 보장한다. MME(B)는 동일 컨테이너의 다른 모델용, 별도 엔드포인트 두 개(C)는 네트워크 왕복·정합성 문제, Batch 두 번(D)은 온라인 요청에 부적합하다.

---

**문제 4.** 무중단으로 새 모델 버전을 배포하기 위한 SageMaker의 표준 메커니즘으로 옳은 것은?

A) 기존 Endpoint를 삭제하고 새 Endpoint를 동일 이름으로 재생성  
B) Model 아티팩트를 S3에서 직접 덮어쓴다  
C) 인스턴스에 SSH로 접속해 모델 파일을 교체한다  
D) 새 EndpointConfig를 만들고 UpdateEndpoint로 교체하면 SageMaker가 새 플릿을 띄운 뒤 트래픽을 옮긴다  

**정답: D**  
해설: Endpoint와 EndpointConfig가 분리되어 있어, 새 EndpointConfig를 UpdateEndpoint로 바꿔 끼우면 새 플릿 기동→트래픽 이동→기존 플릿 종료의 무중단 교체가 일어난다. 삭제 후 재생성(A)은 다운타임 발생, S3 덮어쓰기(B)·SSH 교체(C)는 동작하지 않거나 비권장이다.

---

**문제 5.** 멀티모델 엔드포인트(MME)에서 오랫동안 호출되지 않던 모델을 처음 호출할 때 지연이 발생하는 이유는?

A) 모델이 영구 삭제되었기 때문  
B) 오토스케일링이 항상 0에서 시작하기 때문  
C) 해당 모델이 메모리에 없어 S3에서 동적으로 로드해야 하기 때문  
D) MME는 GPU만 지원하기 때문  

**정답: C**  
해설: MME는 호출된 모델을 메모리에 동적 로드하고 메모리가 부족하면 LRU로 언로드하므로, 오래 안 쓰인 모델은 첫 호출 시 S3에서 로드하는 콜드 지연이 생긴다. 모델이 삭제되는 것은 아니며(A), MME의 인스턴스는 0이 아니고(B), GPU 전용도 아니다(D).

---
