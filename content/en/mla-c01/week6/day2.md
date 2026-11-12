# Day 2 - Real-time Endpoints: Configuration, Auto-scaling, Instance Selection

## 📌 Key Takeaways

- Real-time deployment has three layers: **Model → EndpointConfig → Endpoint**. This separation is what makes zero-downtime deployment, A/B testing, and canary releases possible.
- To deploy a new model, **create a new EndpointConfig and call `update_endpoint`** → SageMaker swaps it in with Blue/Green.
- For **Auto Scaling**, target tracking on `SageMakerVariantInvocationsPerInstance` is the standard. With a **minimum of 1 instance**, it cannot scale down to 0.
- Auto Scaling cannot keep up with a sudden spike → prepare with **scheduled scaling** or a generous `MinCapacity`.
- For instances: traditional ML = CPU (m5/c5), deep learning = GPU (g4dn/g5), deep learning cost reduction = Inferentia (inf1/inf2).

## Three-Layer Structure: Model, EndpointConfig, Endpoint

Almost every online service where users wait for results is deployed as a real-time endpoint. This endpoint is made of the following three resources.

- **Model**: A definition that bundles the model artifact in S3 (`model.tar.gz`) with the container image that holds the inference code.
- **EndpointConfig**: Defines which Model to run, on which instance type, how many instances (initial instance count), and what traffic-distribution weights to use.
- **Endpoint**: The actual entity that provisions the EndpointConfig and makes it callable over HTTPS.

```text
S3 model.tar.gz ─┐
                 ├─▶ [ Model ] ─▶ [ EndpointConfig ] ─▶ [ Endpoint ]
Container image ─┘   artifact+code  instance type/count    HTTPS address
                                    ProductionVariant       (what the caller sees)

Key point: the three are separate resources. If you leave the Endpoint address
           as it is and swap only the EndpointConfig, callers need to change nothing.
```

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
# 3) Endpoint: the actual deployment
sm.create_endpoint(EndpointName="churn-endpoint", EndpointConfigName="churn-config")
```

The real value of this three-layer separation lies in **zero-downtime updates**. When you deploy a new model, you create a new EndpointConfig and call `update_endpoint`; SageMaker first brings up new instances and has them pass health checks, then moves traffic over and takes the old instances down (Blue/Green). The endpoint stays alive throughout, so callers experience no downtime. By adjusting ProductionVariant weights you can also split traffic between two models on the same endpoint for A/B testing or a canary deployment.

## Zero-Downtime Deployment — The Blue/Green Switchover Flow

If you delete an endpoint and recreate it when putting up a new model, the address is cut off. The correct procedure is **create a new EndpointConfig → `update_endpoint`**.

```text
[Before update]  Endpoint(churn-endpoint) ──▶ Config v1 ──▶ 2 instances (old model)

update_endpoint(EndpointConfigName="config-v2")
        │
        ├─ 1) Provision new instances (green) + load the model
        ├─ 2) Wait for health checks to pass
        ├─ 3) Shift traffic to green (all at once / canary / linear)
        ├─ 4) Alarm monitoring window (baking) — automatic rollback on failure
        └─ 5) Terminate the old instances (blue)

[After update]   Endpoint(churn-endpoint) ──▶ Config v2 ──▶ 2 instances (new model)
                 ↑ The address stays the same. Callers change nothing
```

```python
# Swap in the new configuration — keep the endpoint name as it is
sm.update_endpoint(
    EndpointName="churn-endpoint",
    EndpointConfigName="churn-config-v2",
)
# Check the transition status: Updating → InService
status = sm.describe_endpoint(EndpointName="churn-endpoint")["EndpointStatus"]
```

The traffic shifting methods (deployment guardrails) differ in character.

| Shifting method | Behavior | When to use |
|-----------|------|-----------|
| All-at-once | Moves all traffic to the new version in one step | When risk is low and you want to finish quickly |
| Canary | Sends only a small share (e.g., 5%) first, then the rest after observing | When the new model is risky and you want to minimize the blast radius |
| Linear | Moves traffic in steps of a fixed proportion | When you want to watch load and error rate gradually |
| Rolling | Replaces existing capacity a portion at a time | When you cannot afford to double the full capacity |

> ⚠️ **Pitfall**: The answer to "deploy a new model without downtime" is always **a new EndpointConfig + `update_endpoint`**. ① Deleting and recreating the endpoint cuts the address and causes downtime, ② creating only a new Model resource is not automatically reflected in the existing endpoint, and ③ connecting directly to a managed instance to change files is an anti-pattern that is impossible in the first place. These three repeatedly appear as wrong-answer options.

## ProductionVariant and A/B Testing

You can place several ProductionVariants inside one EndpointConfig.

- If you give each variant an `InitialVariantWeight`, traffic is **distributed in proportion to the weights**.
- A **canary deployment** is possible: start with the new model at 10% and the old model at 90%, then raise the share.
- Each variant can have a different instance type and count (for example, run only the new model small).

```python
ProductionVariants=[
    {"VariantName": "ModelA", "ModelName": "model-a",
     "InstanceType": "ml.m5.xlarge", "InitialInstanceCount": 2,
     "InitialVariantWeight": 9},   # 90% of traffic
    {"VariantName": "ModelB", "ModelName": "model-b",
     "InstanceType": "ml.m5.xlarge", "InitialInstanceCount": 1,
     "InitialVariantWeight": 1},   # 10% of traffic
]
```

A/B testing and shadow testing are distinguished by **whether the user receives the new model's response**.

```text
[A/B test]  Request ──┬─ 90% ─▶ ModelA ─▶ Response returned to the user
                      └─ 10% ─▶ ModelB ─▶ Response returned to the user  ← some users are affected

[Shadow]    Request ────────▶ ModelA ─▶ Response returned to the user
                  └(copy)──▶ ModelB ─▶ Response discarded, only metrics recorded  ← zero user impact
```

| Aspect | A/B (weighted distribution) | Shadow testing |
|------|-----------------|----------------|
| Traffic | Splits the real requests | Sends a **copy** of the real requests |
| New model response | Returned to the user | **Discarded** (only metrics collected) |
| User impact | Yes (some users) | None |
| Purpose | Compare business metrics | Risk-free performance and stability validation |

SageMaker can also force a specific variant with the `TargetVariant` parameter when calling `InvokeEndpoint`. This is used when you want to test only a particular model regardless of the weights. In addition, the **shadow testing (shadow variant)** feature sends a copy of production traffic to the new model but throws away the response, so you can validate the new model's performance without affecting real users. Tell A/B (weighted distribution) and shadow (response discarded) apart by that difference.

## Auto Scaling — Adjusting Instance Count to Traffic

A real-time endpoint attaches Application Auto Scaling to adjust the instance count automatically with traffic. The most common policy is **target tracking**, which scales instances out and in to hold a given metric at a target value.

The representative metric is `SageMakerVariantInvocationsPerInstance` (invocations per second per instance). If you set a target such as "I want each instance to handle 1,000 requests per second," it scales out when traffic grows and exceeds this value, and scales in when it falls.

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

- `MinCapacity` must be 1 or more, so a real-time endpoint **does not shrink to 0** (if you need 0, use serverless/asynchronous).
- A **cooldown** is the wait time after one scaling action before the next one.
  - Keep `ScaleOutCooldown` short → react quickly to rising load
  - Keep `ScaleInCooldown` long → so you don't scale in too hastily and regret it when traffic spikes again

Scaling policy types differ by purpose.

| Policy type | Behavior | Suitable situation |
|-----------|------|-------------|
| Target tracking | Automatically adds or removes capacity to hold a metric at the target | The default choice. Adjusts in proportion to load |
| Step scaling | Adds or removes a set amount per alarm-threshold band | When different adjustment sizes are needed per band |
| Scheduled scaling | Changes capacity in advance at set times | **Predictable** surges such as sales or events |

> ⚠️ **Pitfall**: Auto Scaling is not a cure-all. It takes several minutes to bring up a new instance, load the model, and pass the health check, so it cannot respond instantly to a **sudden traffic spike**. For predictable surges such as Black Friday, you must increase capacity ahead of time with **scheduled scaling** or secure a sufficient `MinCapacity`. The answer to the scenario "we turned Auto Scaling on, yet latency jumped during the spike" is usually scheduled scaling or a higher minimum capacity.

## Endpoint Monitoring Metrics

You need to know what to look at when deciding on scaling and tuning. Endpoint metrics are emitted to CloudWatch.

| Metric | Meaning | If this value jumps |
|------|------|-------------|
| `Invocations` | Total number of invocations the endpoint received | A rise or fall in traffic itself |
| `InvocationsPerInstance` | Invocations per instance | The reference metric for target tracking scaling |
| `ModelLatency` | Time the model container took to respond | A sign that the model or instances are insufficient |
| `OverheadLatency` | Time added by SageMaker-side processing | A problem in payload serialization or the network |
| `Invocation4XXErrors` | Bad requests (format, payload) | A caller-side input schema problem |
| `Invocation5XXErrors` | Model or container errors | An inference code exception, OOM, etc. |
| `CPUUtilization` / `MemoryUtilization` | Instance resource utilization | Consider a larger instance type or scaling out |

When looking at latency problems, you must look at `ModelLatency` and `OverheadLatency` **separately**. If `ModelLatency` is high, the model itself is heavy or the instances are insufficient, so the answer is a bigger instance, scaling out, or model optimization. If `OverheadLatency` is high, large-payload serialization or the network segment is the likely cause. If you lump the two together as "it's slow," you will take the wrong action.

## Instance Selection — CPU vs GPU vs Accelerator

The choice of instance family depends on the model type and the latency requirement.

| Family | Character | Suitable models | Notes |
|--------|------|-------------|------|
| `ml.m5` / `ml.c5` (CPU) | General-purpose / compute-optimized | Traditional ML such as XGBoost, linear models, small neural networks | Cheapest. The default for most tabular-data models |
| `ml.g4dn` / `ml.g5` (GPU) | Inference GPUs | Medium and large image/NLP deep learning | Parallelizes matrix operations to cut latency significantly |
| `ml.p3` / `ml.p4` (high-performance GPU) | Large training GPUs | Very large models, ultra-high throughput | Expensive. Commonly used for **training** rather than inference |
| `ml.inf1` / `ml.inf2` (Inferentia) | AWS inference-dedicated chips | Deep learning inference (transformers, CNNs) | Lower cost per inference. Requires a **Neuron compilation** step |

Choosing an inference instance is a balance of "latency target × throughput × cost." Traditional ML (XGBoost) is fine on CPU, and attaching a GPU brings little benefit. Deep learning such as transformers and CNNs, on the other hand, sees latency drop dramatically on GPU or Inferentia. If the exam gives the condition "a deep learning model, but GPU cost is a burden," that is the signal for Inferentia (inf1/inf2). Conversely, "it's XGBoost, so let's cut cost by using a GPU" is easily used as a wrong option.

## Inference Recommender — Which Instance Is Optimal?

If it is hard to choose the instance type and count yourself, SageMaker **Inference Recommender** automatically runs load tests and recommends the optimal configuration based on cost, latency, and throughput. It deploys the model to several instance types, sends traffic through them, and compares the results.

| Job type | What it does | When to use |
|---------|---------|-----------|
| Default | Quickly deploys to several instance types for a broad comparison | A first-pass exploration to narrow the candidates |
| Advanced (custom) | You define the traffic pattern (request rate, latency SLA, etc.) for a precise load test | When you need to confirm that the real SLA is met |

```python
sm.create_inference_recommendations_job(
    JobName="rec-job-1",
    JobType="Default",
    RoleArn=role,
    InputConfig={"ModelPackageVersionArn": model_package_arn},
)
```

Inference Recommender has two modes. A **Default** job deploys quickly to several instance types and compares them broadly, while an **Advanced (custom)** job lets you define the traffic pattern you want (requests per second, latency SLA) for a precise load test. The answer to the scenario "I don't know how to choose the instance type, and I want to decide with data" is Inference Recommender.

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Fine in normal times, but latency jumps only during spikes | New instance startup and model load take several minutes | Secure capacity in advance with scheduled scaling; raise `MinCapacity` |
| `ModelLatency` stays high | The model is heavy or instances are insufficient | Larger instance / scale out; consider GPU or Inferentia |
| `Invocation5XXErrors` increase | Inference code exception, out of memory (OOM) | Check container logs; switch to an instance with more memory |
| The instance count keeps going up and down | Scale-in cooldown is too short | Increase `ScaleInCooldown` to suppress flapping |
| Costs are incurred even at night with no traffic | Real-time always keeps at least 1 instance | For intermittent traffic, move to serverless or asynchronous |
| Error rate rose after deployment and you want to roll back | New-model regression | Configure automatic rollback with CloudWatch alarms + canary/linear shifting |

The next article takes a deep look at multi-model/multi-container endpoints that put several models on one endpoint to cut cost, plus inference pipelines and Inferentia/Elastic Inference.

## 📖 Glossary

- **Model artifact**: A compressed file (`model.tar.gz`) holding the trained model's weights and structure, uploaded to S3.
- **EndpointConfig**: A blueprint that states which model to run on which instances and how many. A resource separate from the endpoint.
- **ProductionVariant**: One bundle of a model within an endpoint that receives a share of traffic. It can be given a weight.
- **Blue/Green deployment**: A zero-downtime replacement method that brings up the new version separately, moves traffic after confirming it is healthy, and then takes down the old version.
- **Canary deployment**: A method that first sends only a very small share of traffic to the new version and widens it if nothing is wrong.
- **Shadow testing**: Validation that sends a copy of real requests to the new model but discards the responses, measuring performance without affecting users.
- **Target tracking**: A policy that automatically increases and decreases the instance count to hold a metric at a target value.
- **Cooldown**: The time to wait after one scaling action until the next. If too short, the count oscillates.
- **ModelLatency**: The time the model container took to process a request and respond.
- **Inference Recommender**: A feature that actually load-tests several instance types and picks the optimal configuration based on data.

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
