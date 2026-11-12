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

## 📝 Practice Questions

**Question 1.** A company must operate a personalized model for each of its 10,000 customers, all trained with the same XGBoost framework. The cost of hosting every model on its own endpoint is unaffordable. Which approach is MOST appropriate?

A) Create a separate real-time endpoint for each of the 10,000 models  
B) Multi-model endpoint (MME)  
C) Multi-container endpoint in Direct mode  
D) Batch Transform  

**Answer: B**  
Explanation: "Thousands to tens of thousands of models on the same framework + cost savings" is the definition of a multi-model endpoint. It dynamically loads models onto shared instances. Individual endpoints (A) cause costs to explode, MCE (C) is for different containers, and Batch (D) is unsuitable for online personalized inference.

---

**Question 2.** You want to automatically adjust the number of instances behind a real-time endpoint so that the number of invocations per second per instance stays constant. Which autoscaling policy is MOST appropriate?

A) Scheduled Scaling  
B) Step Scaling  
C) Target Tracking (SageMakerVariantInvocationsPerInstance)  
D) Manually call UpdateEndpoint  

**Answer: C**  
Explanation: Automatically adjusting to maintain a target metric value is Target Tracking, and the predefined metric that tracks invocations per instance is SageMakerVariantInvocationsPerInstance. Scheduled (A) is for predictable timetables, Step (B) adds or removes capacity by alarm step, and manual (D) is not automation.

---

**Question 3.** During training, data was preprocessed with Scikit-learn and predictions were made with XGBoost. You want to guarantee the same preprocessing at inference time within a single request to prevent training-serving skew. Which configuration is appropriate?

A) Use an inference pipeline that connects the preprocessing container and the prediction container in series  
B) Multi-model endpoint  
C) Have the client call two separate real-time endpoints in order  
D) Run Batch Transform twice  

**Answer: A**  
Explanation: An inference pipeline chains multiple containers in series so that preprocessing and prediction are handled in a single request, which guarantees the same preprocessing as in training. MME (B) is for different models in the same container, two separate endpoints (C) introduce network round trips and consistency problems, and running Batch twice (D) is unsuitable for online requests.

---

**Question 4.** Which of the following is the standard SageMaker mechanism for deploying a new model version with zero downtime?

A) Delete the existing endpoint and recreate a new endpoint with the same name  
B) Overwrite the model artifact directly in S3  
C) SSH into the instances and replace the model files  
D) Create a new EndpointConfig and swap it in with UpdateEndpoint; SageMaker brings up a new fleet and then shifts traffic  

**Answer: D**  
Explanation: Because Endpoint and EndpointConfig are separate, swapping in a new EndpointConfig with UpdateEndpoint performs a zero-downtime replacement: start the new fleet, shift traffic, and terminate the old fleet. Delete-and-recreate (A) causes downtime, and overwriting S3 (B) or replacing files over SSH (C) does not work or is not recommended.

---

**Question 5.** In a multi-model endpoint (MME), why does latency occur the first time a model that has not been invoked for a long time is called?

A) Because the model was permanently deleted  
B) Because autoscaling always starts from 0  
C) Because the model is not in memory and must be dynamically loaded from S3  
D) Because MME supports only GPUs  

**Answer: C**  
Explanation: MME dynamically loads an invoked model into memory and unloads models by LRU when memory runs low, so a model that has not been used for a long time incurs cold-start latency from loading from S3 on its first call. The model is not deleted (A), MME instances are not at 0 (B), and it is not GPU-only (D).

---
