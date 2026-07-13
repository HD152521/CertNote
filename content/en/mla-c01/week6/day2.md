# Day 2 - Real-time Endpoints: Configuration, Auto-scaling, Instance Selection

Yesterday we surveyed 4 inference options. Most common and exam-heavy is real-time endpoints. Almost every online service where users await results deploys via real-time endpoints. Today we cover real-time endpoint setup (Model → EndpointConfig → Endpoint), auto-response to traffic (auto-scaling), and instance choices (CPU/GPU/accelerator).

Key insight: SageMaker real-time deployment is a **3-layer structure**. Model bundles artifact and inference container; EndpointConfig specifies instance type/count; Endpoint handles actual HTTPS traffic. This separation enables zero-downtime deployment and A/B testing.

## 3-Layer Structure: Model, EndpointConfig, Endpoint

Real-time endpoints are built from 3 resources:

- **Model**: Definition bundling S3 model artifact (`model.tar.gz`) and container image with inference code.
- **EndpointConfig**: Defines which Model, what instance type, how many initially (initial instance count), traffic weight distribution.
- **Endpoint**: Actualizes EndpointConfig, making it callable via HTTPS.

```python
import boto3
sm = boto3.client("sagemaker")

# 1) Model: artifact + container
sm.create_model(
    ModelName="churn-model",
    PrimaryContainer={"Image": image_uri, "ModelDataUrl": "s3://bkt/model.tar.gz"},
    ExecutionRoleArn=role,
)
# 2) EndpointConfig: instance type/count
sm.create_endpoint_config(
    EndpointConfigName="churn-config",
    ProductionVariants=[{
        "VariantName": "AllTraffic",
        "ModelName": "churn-model",
        "InstanceType": "ml.m5.xlarge",
        "InitialInstanceCount": 2,
    }],
)
# 3) Endpoint: actual deployment
sm.create_endpoint(EndpointName="churn-endpoint", EndpointConfigName="churn-config")
```

> 💡 **Related Theory**: This 3-layer split's real value is **zero-downtime updates**. Deploying new model: create new EndpointConfig, call `update_endpoint`, and SageMaker spins new instances, runs health checks, shifts traffic, shuts old instances (blue/green). Endpoint stays alive—callers experience no downtime. Adjusting ProductionVariant weights enables A/B testing or canary deployments, splitting traffic to two models on same endpoint.

## ProductionVariant and A/B Testing

EndpointConfig can hold multiple ProductionVariants. Each gets `InitialVariantWeight`; traffic distributes by weight ratio. Start new model 10%, old 90%, gradually increasing is canary deployment.

```python
ProductionVariants=[
    {"VariantName": "ModelA", "ModelName": "model-a",
     "InstanceType": "ml.m5.xlarge", "InitialInstanceCount": 2,
     "InitialVariantWeight": 9},   # 90% traffic
    {"VariantName": "ModelB", "ModelName": "model-b",
     "InstanceType": "ml.m5.xlarge", "InitialInstanceCount": 1,
     "InitialVariantWeight": 1},   # 10% traffic
]
```

> 🔍 **Deeper**: SageMaker lets `InvokeEndpoint` call force specific variant via `TargetVariant`, ignoring weights for testing one model. **Shadow testing** sends production traffic copy to new model but discards response, validating new model performance without user impact. Distinguish A/B (weight distribution) vs shadow (response discard).

## Auto-scaling—Auto-adjust Instance Count to Traffic

Real-time endpoints attach Application Auto Scaling, adjusting instance count by traffic. Most common is **target tracking**, matching specific metric to goal value.

Key metric: `SageMakerVariantInvocationsPerInstance` (calls per instance per second). Set goal "one instance handles 1,000 calls/sec", traffic grows past that → scale out; drops → scale in.

```python
aas = boto3.client("application-autoscaling")
resource_id = "endpoint/churn-endpoint/variant/AllTraffic"

aas.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId=resource_id,
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=2, MaxCapacity=10,
)
aas.put_scaling_policy(
    PolicyName="invocations-tracking",
    ServiceNamespace="sagemaker", ResourceId=resource_id,
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
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

`MinCapacity` ≥1, so real-time doesn't scale to 0 (0 needs serverless/async). Cooldown is wait between scale actions; scale-in slow (traffic re-spike defense), scale-out fast, standard practice.

> ⚠️ **Pitfall**: Auto-scaling isn't magic. Spinning new instance, loading model, passing health check takes minutes—can't instantly handle **traffic spikes**. Black Friday-predictable surges need **scheduled scaling** (pre-increase capacity) or sufficient `MinCapacity`. "Auto-scaling on but spike caused delay"—answer: scheduled scaling or higher minimum.

## Instance Selection—CPU vs GPU vs Accelerators

Instance family choice divides by model type and latency needs:

- **ml.m5/ml.c5 (CPU)**: Tree models (XGBoost), linear, small neural nets—most traditional ML. c5 compute-optimized, m5 general. Cheapest.
- **ml.g4dn/ml.g5 (GPU)**: Deep learning inference, medium-large image/NLP models. GPU parallelizes matrix ops, lowering latency.
- **ml.p3/ml.p4 (high-performance GPU)**: Very large models, high throughput deep learning. Expensive, common for training not inference.
- **ml.inf1/ml.inf2 (AWS Inferentia)**: AWS proprietary inference chip. Deep learning inference cost per sample much lower than GPU.

> 💡 **Related Theory**: Inference instance choice balances "latency goal × throughput × cost". Traditional ML (XGBoost) fine on CPU; GPU adds little. Transformer/CNN deep learning see dramatic latency drop on GPU or Inferentia. Exam: "deep learning model, GPU cost concern"→Inferentia (inf1/inf2) is the signal. Conversely "XGBoost, use GPU to lower cost"—wrong choice often tested.

## Inference Recommender—Which Instance is Optimal?

Picking instance type and count directly is hard. SageMaker **Inference Recommender** auto-runs load tests, recommending optimal config by cost, latency, throughput. Deploys model on multiple instance types, runs traffic, compares.

```python
sm.create_inference_recommendations_job(
    JobName="rec-job-1",
    JobType="Default",
    RoleArn=role,
    InputConfig={"ModelPackageVersionArn": model_package_arn},
)
```

> 🔍 **Deeper**: Inference Recommender has two modes. **Default** quickly deploys multiple types, broad comparison; **Advanced** takes custom traffic pattern (requests/sec, latency SLA), precise load test. "Don't know instance type, want data-driven decision"—Inference Recommender.

## Summary

Real-time endpoints split 3 ways: ① **3-layer structure**: Model (artifact+container) → EndpointConfig (instance type/count, ProductionVariant) → Endpoint (actual HTTPS). Enables zero-downtime, A/B, canary. ② **Auto-scaling**: `InvocationsPerInstance` target tracking standard, minimum 1 (no 0), spikes need scheduled scaling. ③ **Instance choice**: Traditional ML=CPU (m5/c5), deep learning=GPU (g4dn/g5) or Inferentia (inf1/inf2) for cost; hard decisions→ Inference Recommender.

Next: multi-model/multi-container to cut cost, inference pipelines, Inferentia/Elastic Inference depth.

---

## 📝 연습 문제

**문제 1.** 운영 중인 실시간 엔드포인트에 새 모델 버전을 배포하되 호출자가 다운타임을 겪지 않게 하려 한다. 올바른 방법은?

A) 기존 엔드포인트를 삭제하고 새 엔드포인트를 만든다  
B) 새 EndpointConfig를 만들고 update_endpoint를 호출해 blue/green으로 전환한다  
C) 인스턴스에 SSH로 접속해 모델 파일을 교체한다  
D) Model 리소스만 바꾸면 자동 반영된다  

**정답: B**  
해설: 새 EndpointConfig를 만들어 `update_endpoint`를 호출하면 SageMaker가 새 인스턴스를 띄워 헬스 체크 후 트래픽을 옮기고 옛 인스턴스를 내리는 blue/green 전환을 수행해 다운타임이 없다. A는 엔드포인트 URL이 끊겨 다운타임이 생기고, C는 SageMaker 관리형 인스턴스에 직접 접속하는 안티패턴이며, D는 Model만 바꿔도 기존 엔드포인트에 자동 반영되지 않는다.

---

**문제 2.** 트래픽이 시간대별로 크게 변하는 실시간 엔드포인트에 오토스케일링을 적용하려 한다. 가장 일반적으로 쓰는 타깃 추적 지표는?

A) CPUUtilization만  
B) SageMakerVariantInvocationsPerInstance(인스턴스당 호출 수)  
C) 디스크 사용량  
D) S3 객체 수  

**정답: B**  
해설: 실시간 엔드포인트 오토스케일링의 표준 타깃 추적 지표는 인스턴스당 초당 호출 수(`SageMakerVariantInvocationsPerInstance`)로, 부하를 직접 반영해 인스턴스 수를 조절한다. A의 CPU는 보조 지표로 쓸 수 있으나 호출 기반 부하를 가장 정확히 반영하는 표준은 아니고, C·D는 추론 부하와 무관한 지표다.

---

**문제 3.** XGBoost 기반 이탈 예측 모델을 실시간 배포한다. 지연 요구는 일반적이고 비용을 아끼고 싶다. 인스턴스 선택으로 가장 적절한 것은?

A) ml.p4d 고성능 GPU  
B) ml.m5/ml.c5 같은 CPU 인스턴스  
C) ml.inf2 Inferentia  
D) GPU가 많을수록 항상 빠르므로 ml.g5.48xlarge  

**정답: B**  
해설: XGBoost 같은 트리 기반 전통 ML은 GPU 병렬화 이득이 거의 없어 CPU 인스턴스(m5/c5)가 비용 대비 가장 합리적이다. A는 학습용 고성능 GPU로 추론에 과도한 비용이고, C의 Inferentia는 딥러닝 추론 가속용이라 트리 모델엔 이점이 없으며, D는 비싼 대형 GPU를 불필요하게 쓰는 낭비다.

---

**문제 4.** 신규 모델을 프로덕션 트래픽에서 검증하되, 실사용자 응답에는 영향을 주지 않고 신모델의 성능만 관찰하고 싶다. 적절한 기능은?

A) ProductionVariant 가중치를 50:50으로 둔 A/B 테스트  
B) Shadow testing(섀도 변형)으로 트래픽 사본을 신모델에 보내고 응답은 폐기  
C) 배치 변환으로 과거 데이터를 재처리  
D) 엔드포인트를 둘로 나눠 사용자를 절반씩 보낸다  

**정답: B**  
해설: Shadow testing은 프로덕션 트래픽의 사본을 신모델로 보내되 그 응답을 사용자에게 반환하지 않고 폐기하므로, 실사용자 경험에 영향 없이 신모델 성능을 검증할 수 있다. A·D는 실제 사용자 일부가 신모델 응답을 받게 되어 "영향 없음" 조건을 위반하고, C는 실시간 프로덕션 트래픽 검증이 아니다.

---

**문제 5.** 어떤 인스턴스 타입과 개수가 비용·지연·처리량 기준으로 최적인지 데이터에 근거해 결정하고 싶다. SageMaker에서 쓸 도구는?

A) Inference Recommender  
B) Data Wrangler  
C) Feature Store  
D) Ground Truth  

**정답: A**  
해설: Inference Recommender는 여러 인스턴스 타입에 모델을 배포하고 부하 테스트를 수행해 비용·지연·처리량을 비교한 추천 구성을 제공한다. B는 특성 공학/데이터 준비 도구, C는 특성 저장소, D는 데이터 라벨링 서비스로 모두 인스턴스 선택과 무관하다.

---
