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

## 📝 Practice Questions

**Question 1.** You want to deploy a new model version to a live real-time endpoint without callers experiencing downtime. What is the correct method?

A) Delete the existing endpoint and create a new one  
B) Create a new EndpointConfig and call update_endpoint to switch over with blue/green  
C) SSH into the instance and replace the model file  
D) Just changing the Model resource is applied automatically  

**Answer: B**  
Explanation: When you create a new EndpointConfig and call `update_endpoint`, SageMaker launches new instances, performs a health check, shifts traffic, and brings down the old instances in a blue/green switch, so there is no downtime. A breaks the endpoint URL and causes downtime, C is an anti-pattern of connecting directly to SageMaker-managed instances, and D is wrong because changing only the Model is not automatically reflected in the existing endpoint.

---

**Question 2.** You want to apply autoscaling to a real-time endpoint whose traffic varies greatly by time of day. What is the most commonly used target tracking metric?

A) CPUUtilization only  
B) SageMakerVariantInvocationsPerInstance (invocations per instance)  
C) Disk usage  
D) Number of S3 objects  

**Answer: B**  
Explanation: The standard target tracking metric for real-time endpoint autoscaling is invocations per instance per minute (`SageMakerVariantInvocationsPerInstance`), which directly reflects load and adjusts the number of instances. A's CPU can be used as a supplementary metric but is not the standard that most accurately reflects invocation-based load, and C and D are metrics unrelated to inference load.

---

**Question 3.** You deploy an XGBoost-based churn prediction model in real time. The latency requirement is typical and you want to save cost. What is the most appropriate instance choice?

A) ml.p4d high-performance GPU  
B) CPU instances such as ml.m5/ml.c5  
C) ml.inf2 Inferentia  
D) ml.g5.48xlarge, because more GPUs are always faster  

**Answer: B**  
Explanation: Tree-based traditional ML such as XGBoost gains almost nothing from GPU parallelization, so CPU instances (m5/c5) are the most reasonable for the cost. A is a high-performance training GPU and excessive cost for inference, C's Inferentia is for accelerating deep learning inference and offers no benefit for tree models, and D is a waste that unnecessarily uses an expensive large GPU.

---

**Question 4.** You want to validate a new model on production traffic while observing only the new model's performance, without affecting real users' responses. What is the appropriate feature?

A) An A/B test with ProductionVariant weights of 50:50  
B) Shadow testing (shadow variant): send a copy of the traffic to the new model and discard the responses  
C) Reprocess historical data with batch transform  
D) Split the endpoint in two and send half of the users to each  

**Answer: B**  
Explanation: Shadow testing sends a copy of production traffic to the new model but discards its responses instead of returning them to users, so you can validate the new model's performance without affecting the real user experience. A and D cause some real users to receive the new model's responses, violating the "no impact" condition, and C is not validation on real-time production traffic.

---

**Question 5.** You want to decide, based on data, which instance type and count are optimal in terms of cost, latency, and throughput. Which SageMaker tool should you use?

A) Inference Recommender  
B) Data Wrangler  
C) Feature Store  
D) Ground Truth  

**Answer: A**  
Explanation: Inference Recommender deploys the model on multiple instance types and runs load tests to provide recommended configurations comparing cost, latency, and throughput. B is a feature engineering/data preparation tool, C is a feature store, and D is a data labeling service, all unrelated to instance selection.

---
