# Day 2 - Operating Real-Time Endpoints: Configuration, Auto Scaling, and Multi-Model Endpoints

## 📌 Key Takeaways

- Real-time inference is split into three resources, **Model → EndpointConfig → Endpoint**, and this separation is the foundation of zero-downtime replacement and traffic splitting.
- Zero-downtime deployment means creating a new EndpointConfig and swapping it in with **UpdateEndpoint**. Start the new fleet → shift traffic → shut down the old fleet.
- Auto Scaling is applied per **variant** through Application Auto Scaling, and the default metric is `SageMakerVariantInvocationsPerInstance` + **Target Tracking**.
- **MinCapacity cannot be 0.** If you need true scale-to-zero, use Serverless or Async.
- The distinction between **MME** (same container, thousands of dynamically loaded models), **MCE** (different containers), and an **inference pipeline** (preprocessing → prediction in series) is in scope for the exam.

## The Three-Layer Structure of an Endpoint

As we saw yesterday, the real-time endpoint carries the heaviest operational burden of the four inference options. To run a stable, low-latency service on always-on instances, you need to understand configuration, scaling, and cost control together. The starting point is the fact that SageMaker splits resources into three layers.

```text
Model              : Training output (S3 model artifact) + inference container image
EndpointConfig     : Defines which Model to run, on which instances / at what ratio (ProductionVariant)
Endpoint           : The actual HTTPS URL. It points to an EndpointConfig
```

| Resource | What it holds | When it changes |
|---|---|---|
| Model | S3 artifact + container image + IAM role | Create a new one when a new model version is available |
| EndpointConfig | List of ProductionVariants (instance type/count/weight) | Create a new one when changing instance type, model, or traffic ratio |
| Endpoint | The fixed HTTPS URL that clients call | Keep the name and replace only the EndpointConfig |

```python
from sagemaker.model import Model

model = Model(image_uri=image, model_data=s3_artifact, role=role)
model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="prod-endpoint",
)
```

### The Path an Inference Request Takes

```text
Client
   │  InvokeEndpoint (HTTPS, payload)
   ▼
[Endpoint  prod-endpoint]  ← Name is fixed. The client only knows this URL
   │  Look up the EndpointConfig it currently points to
   ▼
[EndpointConfig  v3]
   ├─ ProductionVariant A (ml.m5.xlarge × 2, weight 90)
   └─ ProductionVariant B (ml.m5.xlarge × 1, weight 10)
                │
                ▼
        [Inference container] ─ Load model artifact → predict
                │
                ▼
        Response + CloudWatch metrics recorded
```

The key point is that **the Endpoint and the EndpointConfig are separate**. When you create a new EndpointConfig and swap it in with UpdateEndpoint, SageMaker starts a new fleet, shifts traffic, and then cleans up the old fleet — there is no downtime.

A single EndpointConfig can hold multiple ProductionVariants, and you specify the traffic ratio for each variant with `InitialVariantWeight`. This weight-based split is the foundation of A/B testing and canary deployments, which we cover tomorrow.

> ⚠️ **Trap**: In a question about "zero-downtime deployment," an answer choice that **deletes the endpoint and recreates it with the same name** is wrong. Downtime occurs during the recreation. Choices that overwrite the S3 artifact or SSH into an instance to change files do not work either.

## Auto Scaling: Matching the Instance Count to Traffic

To reduce the trap of always-on cost, the instance count must move automatically with traffic. SageMaker supports scaling **per variant** through Application Auto Scaling.

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

### Comparing Policy Types

| Policy | How it works | When to use it | When not to use it |
|---|---|---|---|
| **Target Tracking** | Automatically adds/removes capacity to keep a target metric value | "Maintain a specific latency/utilization" — the answer to most exam scenarios | When you want to apply finely different step sizes |
| **Step Scaling** | When a CloudWatch alarm fires, adds/removes a predefined step | When you want different increments depending on alarm severity | When you only need to hold a target value (configuration just gets more complex) |
| **Scheduled** | Changes capacity based on a timetable | When the pattern is **predictable**, such as traffic concentrated only in business hours | When traffic is irregular and cannot be captured by a timetable |

- **Recommended default metric**: `SageMakerVariantInvocationsPerInstance` — tracks the number of invocations per second per instance against the target value.
- **Cooldown**: Keep ScaleOut short and ScaleIn long. This prevents **flapping**, where capacity is repeatedly reduced and increased as traffic fluctuates. The example above uses ScaleOut 60 seconds / ScaleIn 300 seconds.
- **MinCapacity ≥ 1**: It never drops to 0.

### Criteria for Choosing a Scaling Metric

| What you want to see | Metric to look at | Judgment |
|---|---|---|
| Request volume an instance handles | `SageMakerVariantInvocationsPerInstance` | Scale out if it keeps exceeding the target |
| Is the model itself slow | `ModelLatency` | If high, optimize the model or move up an instance type |
| Is the front of the service slow | `OverheadLatency` | If high, suspect payload size or serialization method |
| Are resources saturated | CPU / GPU / Memory Utilization | Basis for deciding between scaling out and changing the instance type |
| Where do errors come from | `Invocation4XX` / `Invocation5XX` | 4XX is a client request problem, 5XX is a server/model problem |

> ⚠️ **Trap**: For a question saying "I want cost to be 0 when there is no traffic," you must not choose a real-time endpoint + Auto Scaling. Since MinCapacity cannot be 0, **Serverless Inference** or **Asynchronous Inference** is the answer.

## Multi-Model Endpoint (MME): Thousands of Models on One Endpoint

When models balloon into the hundreds or thousands per customer or per region, running each on a separate endpoint is unmanageable in both cost and operations. An MME loads multiple models onto shared instances and **loads them dynamically at invocation time**.

```python
from sagemaker.multidatamodel import MultiDataModel

mme = MultiDataModel(
    name="mme-endpoint",
    model_data_prefix="s3://my-bucket/models/",  # Prefix where model artifacts are placed
    image_uri=image, role=role,
)
predictor = mme.deploy(initial_instance_count=2, instance_type="ml.m5.xlarge")
# At invocation time, specify which model with TargetModel
predictor.predict(data, target_model="customer-123.tar.gz")
```

```text
Request (TargetModel=customer-123.tar.gz)
        │
        ▼
   Already loaded in memory?
   ├─ Yes → Infer immediately (low latency)
   └─ No  → Load from S3 → infer (cold latency on first call)
                  │
                  └─ When memory runs short, unload the least recently used model (LRU)
```

- **Behavior**: When a request arrives, the model is loaded into memory (reused if already there), and when memory runs short, the least recently used models are unloaded first (LRU).
- **Benefit**: A handful of instances host thousands of models → cost drops significantly.
- **Trade-off**: A model that has not been invoked for a long time incurs cold-start latency on its first call, and all models must **share the same framework/container**.

## Distinguishing MME, MCE, and Inference Pipelines

To put models from different frameworks on one endpoint, you use multi-container, not multi-model.

```text
Multi-Model Endpoint (MME)    : Same container, N different model artifacts, dynamic loading
Multi-Container Endpoint (MCE): N different containers. Direct (individual invocation) or Serial mode
Inference Pipeline            : Containers chained in series (preprocessing → prediction → postprocessing), handled in one request
```

| Approach | Containers | Typical situation | When not to use it |
|---|---|---|---|
| **N individual endpoints** | Each independent | Few models, each with different SLA and scale | When there are hundreds to thousands of models (cost explosion, unmanageable) |
| **MME** | One (shared) | Thousands of models in the same framework, cost reduction is the goal | When frameworks differ, or when an always-on low-latency requirement cannot tolerate cold latency |
| **MCE (Direct)** | Several | Models from different frameworks on one endpoint, **invoked individually** | When preprocessing → prediction must be bundled in one request |
| **Inference pipeline** | Several (in series) | Bundle preprocessing + prediction in one request to prevent training-serving skew | When each container must be invoked independently and separately |

"There are many models" alone does not make MME the answer. It comes with the premise that **all models share the same framework/container**. If the passage hints that the frameworks differ, it points to MCE. Also, an MME's instances are not 0 and are not GPU-only.

A typical inference pipeline example: chain a Scikit-learn preprocessing container → an XGBoost prediction container in series, guaranteeing that the **same preprocessing** as training is applied at inference time (preventing training-serving skew). Having the client call two separate endpoints in order leaves network round trips and consistency problems.

```text
Which hosting structure should I choose?
├─ Cost 0 when there is no traffic? ─→ Serverless / Async (not a real-time endpoint)
├─ Must preprocessing and prediction be bundled in one request?
│    └─ Yes → Inference pipeline (containers chained in series)
├─ Are the models in the same framework/container?
│    ├─ Yes + hundreds to thousands of models → MME (specify with TargetModel, LRU loading)
│    └─ No → MCE Direct mode (invoke each container individually)
└─ Few models, each with a different scale/SLA → individual real-time endpoints
```

"Thousands of similar models + same framework + cost reduction" → MME. "Bundle preprocessing and prediction into one request" → inference pipeline. "Models from different frameworks on one endpoint, called separately" → MCE Direct mode. You must be able to tell these three apart.

## Key Operational Monitoring Metrics

```text
ModelLatency           : Time the model container spent on inference
OverheadLatency        : SageMaker overhead (request/response handling)
Invocations            : Number of invocations
Invocation4XX/5XX      : Client/server errors
CPU/GPU/Memory Utilization : Resource utilization → basis for deciding scaling and instance type
```

If latency is large in `ModelLatency`, optimize the model or move up an instance. If it is large in `OverheadLatency`, suspect payload and serialization problems.

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Reason |
|---|---|---|
| "A model for each of 10,000 customers, same XGBoost, cost is unaffordable" | MME | Dynamic loading on shared instances; individual endpoints cause a cost explosion |
| "Keep the number of invocations per second per instance constant" | Target Tracking + `SageMakerVariantInvocationsPerInstance` | Maintaining a target metric is exactly Target Tracking |
| "Traffic concentrates only in business hours and the pattern is predictable" | Scheduled Scaling | Timetable-based capacity changes |
| "Deploy a new model version with zero downtime" | New EndpointConfig + UpdateEndpoint | Start new fleet → shift traffic → shut down old fleet |
| "Delete the endpoint and recreate it with the same name" | **Wrong choice** | Downtime occurs during the recreation |
| "Guarantee the same preprocessing as training in one request" | Inference pipeline | Serial container chaining blocks training-serving skew |
| "On an MME, the first call to a model not used for a long time is slow" | Not in memory, so dynamically loaded from S3 | Cold loading after an LRU unload |
| "Cost 0 when there is no traffic" | Serverless / Async | A real-time endpoint's MinCapacity cannot be 0 |
| "Split the traffic 90:10" | ProductionVariant + `InitialVariantWeight` | Weight-based traffic splitting |

In the next post, we cover inference optimization with Neo, Inferentia, and inference pipelines to make endpoints **faster and cheaper**.

## 📖 Glossary

- **ProductionVariant** : One unit inside an EndpointConfig that defines "which model, on how many of which instances, with what percent of traffic."
- **InitialVariantWeight** : The weight that splits traffic among multiple variants. It is the basis of A/B testing and canary deployments.
- **UpdateEndpoint** : The API that keeps the endpoint name and swaps only the EndpointConfig it points to. The standard method for zero-downtime replacement.
- **Application Auto Scaling** : The shared AWS scaling service that automatically adjusts the instance count of SageMaker variants.
- **Target Tracking** : A scaling policy where you just state "keep this metric at this value" and it scales out and in on its own.
- **SageMakerVariantInvocationsPerInstance** : The number of invocations one instance handles per second. The default metric for scaling real-time endpoints.
- **Cooldown** : The time to wait after a scaling adjustment before the next one. Keeping ScaleIn long prevents flapping.
- **Flapping** : The instability of repeatedly reducing and increasing instances as traffic fluctuates.
- **Multi-model endpoint (MME)** : A way of hosting many models that share the same container on one endpoint and loading them into memory at invocation time.
- **LRU unload** : A way of freeing space when memory runs short by taking down the model that has gone unused the longest.

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
