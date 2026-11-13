# Day 3 - Cost & Advanced Inference: Multi-model, Multi-container, Inference Pipeline, Inferentia

## 📌 Key Takeaways

- **MME**: The same container + hundreds to thousands of models on one endpoint. Specified with `TargetModel`, loaded dynamically from S3.
- **MCE**: Up to 15 containers of different frameworks. Specified with `TargetContainerHostname`.
- **Inference pipeline**: Preprocessing → inference → postprocessing as a **linear chain** of 2 to 15 containers. Prevents training/serving skew.
- **Inferentia (inf1/inf2)**: Reduces deep learning inference cost and latency. Requires a Neuron compilation step.
- Elastic Inference is **legacy** (fractional GPU) — the primary answer in current scenarios is Inferentia.

## Telling the Four Patterns Apart at a Glance

A real-time endpoint is powerful, but because it is always on it costs money. With hundreds of models, the moment you bring up an endpoint for each one, instance cost explodes. MLA-C01 asks about this topic with keywords such as "hundreds of models," "preprocessing + inference in one endpoint," and "reduce deep learning inference cost."

| Pattern | What it bundles | Containers | Specified at call time | Main purpose |
|------|-------------|----------|--------------|---------|
| MME | Hundreds to thousands of models | 1 identical container | `TargetModel` | Cost reduction |
| MCE | A small number of models with different frameworks | Up to 15 different containers | `TargetContainerHostname` | Endpoint consolidation |
| Inference pipeline | Preprocessing, inference, and postprocessing steps | Sequential chain of 2 to 15 | None (the whole thing is one flow) | Training/serving consistency |
| Inferentia | (Not a bundling) a hardware swap | Unchanged | — | Lower per-inference cost for deep learning |

```text
MME  : Request ─TargetModel=A─▶ [1 container] ─▶ A loaded into memory (from S3 if absent)
                                    ▲ Models A,B,C … 1000 of them wait in S3

MCE  : Request ─TargetContainerHostname=tf─▶ ┌ [TF container]  ← only one of these runs
                                             └ [PyTorch container]

Pipeline: Request ─▶ [Preprocess] ─▶ [Model] ─▶ [Postprocess] ─▶ Response  ← all pass through in sequence
```

## Multi-Model Endpoint (MME) — Many Models on One Endpoint

A multi-model endpoint serves **many models that use the same framework/container** from shared instances behind a single endpoint.

- You gather the model artifacts under one S3 path (prefix).
- When a call arrives, it **dynamically loads** that model into memory and **unloads** models that are not in use.
- It puts hundreds to thousands of models on a handful of instances, cutting cost dramatically.

![Multi-model endpoint flow: if the requested model is in the cache it runs inference immediately, otherwise it is downloaded from S3 and loaded](/diagrams/en/mme-dynamic-load.svg)

```python
# Specify which model to use with TargetModel at call time
response = runtime.invoke_endpoint(
    EndpointName="mme-endpoint",
    TargetModel="customer-segment-A.tar.gz",   # Specify a particular model in S3
    ContentType="text/csv",
    Body="5.1,3.5,1.4,0.2",
)
```

A typical case is when "models differ per customer / region / user." If 1,000 stores each have a demand forecasting model, you handle them with a single MME instead of 1,000 endpoints.

On the deployment side, all you do is create the container in **MultiModel mode** and point it at the S3 prefix where the models sit.

```python
from sagemaker.multidatamodel import MultiDataModel

mme = MultiDataModel(
    name="store-forecast-mme",
    model_data_prefix="s3://bkt/models/",   # Every .tar.gz beneath this is a serving target
    image_uri=xgboost_image_uri,            # The single container shared by all models
    role=role,
)
predictor = mme.deploy(initial_instance_count=2, instance_type="ml.m5.xlarge")

# No need to recreate the endpoint when adding a model — just upload it to S3
mme.add_model(model_data_source="s3://bkt/new/store-1501.tar.gz",
              model_data_path="store-1501.tar.gz")
```

MME caches models in memory. Frequently used models stay in memory and are fast, and when you call a model that is not in memory for the first time, there is a delay (cold load) while it is loaded from S3. Therefore MME is most cost-efficient **when there are many models but the call frequency of each is even or low**. If all models are called at high frequency at the same time, memory thrashing occurs and it is unsuitable. Also, the key constraint is that all models in an MME must use the **same framework/container**.

Separating the conditions where MME fits well from those where it does not looks like this.

| Condition | MME fits | Reason |
|------|----------|------|
| Hundreds to thousands of models | ✅ | Consolidates endpoint and instance cost in one place |
| All models use the same framework/container | ✅ | A prerequisite of MME |
| Individual model calls are rare or evenly spread | ✅ | The cache hit rate is maintained |
| All models are called at high frequency at once | ❌ | Repeated load/unload (thrashing) makes latency soar |
| Frameworks differ | ❌ | There is only one container → you must go to MCE |
| Each model needs a different instance type | ❌ | It is a structure that shares instances, so this is not possible |

## Multi-Container Endpoint (MCE) — Different Frameworks on One Endpoint

A multi-container endpoint places up to 15 **different containers (different frameworks)** on one endpoint. For example, you put one TensorFlow model and one PyTorch model on the same endpoint and specify at call time which container to use (direct invocation mode). If MME is "the same container + many models," MCE is "different containers + few models."

```python
# Direct invocation mode: specify the container with TargetContainerHostname
response = runtime.invoke_endpoint(
    EndpointName="mce-endpoint",
    TargetContainerHostname="tensorflow-container",
    ContentType="application/json",
    Body='{"instances": [[1.0, 2.0, 3.0]]}',
)
```

> ⚠️ **Pitfall**: If you confuse MME and MCE, you will get it wrong on the exam. **MME** = a very large number (hundreds to thousands) of models with the same container, specified with `TargetModel`, loaded dynamically from S3. **MCE** = up to 15 containers of different frameworks, specified with `TargetContainerHostname`. "Several models with different frameworks on one endpoint" → MCE. "Hundreds of models of the same kind and I want to cut endpoint cost" → MME.

## Inference Pipeline — Chaining Preprocessing, Inference, and Postprocessing

An Inference Pipeline ties 2 to 15 containers together in a **linear sequence**.

- The output of the first container becomes the input of the next.
- With a single `InvokeEndpoint` call, preprocessing → inference → postprocessing run sequentially **within the same instance**.
- Communication between containers is local, so there are no network round trips.
- Typical configuration: **a SparkML/scikit-learn preprocessing container → an XGBoost model container**.
- It uses the same preprocessing from training (scaling, encoding) at inference time, preventing **training-serving skew**.

```text
What happens inside one instance

 Raw request (raw CSV)
        │
        ▼
 [ Container 1: sklearn preprocessing ]  missing-value imputation · scaling · one-hot encoding
        │  transformed features
        ▼
 [ Container 2: XGBoost model ]          runs the prediction
        │  predicted value
        ▼
 [ Container 3: postprocessing (optional) ]  threshold application · label mapping
        │
        ▼
 Final response — only a single call (InvokeEndpoint)
```

```python
from sagemaker.pipeline import PipelineModel

pipeline_model = PipelineModel(
    name="preprocess-predict-pipeline",
    role=role,
    models=[sklearn_preprocessor_model, xgboost_model],  # The order is the execution order
)
pipeline_model.deploy(initial_instance_count=1, instance_type="ml.m5.xlarge")
```

The value of an inference pipeline is **training/serving consistency**. If you implement preprocessing separately in application code, it ends up subtly different between training and inference and performance degrades silently (training-serving skew). If you package preprocessing as a pipeline container together with the model, the same code is guaranteed on both sides. Also, because all the containers run on one instance, communication between containers is local and fast. The answer to the scenario "I want to apply the preprocessing logic consistently at inference time too" is an inference pipeline.

## Inferentia — A Dedicated Chip That Lowers Deep Learning Inference Cost

AWS Inferentia (`ml.inf1`, `ml.inf2`) is an accelerator chip that AWS designed specifically for inference. For deep learning inference, it significantly lowers cost per inference and latency compared with equivalent GPUs. To run a model on Inferentia you must compile it with the **AWS Neuron SDK**, and SageMaker Neo automates this process.

```text
Inferentia deployment has one extra step

Regular GPU deployment :  Trained model ─────────────────────▶ Endpoint (ml.g5)
Inferentia deployment  :  Trained model ─▶ Neuron compile ─▶ Endpoint (ml.inf1/inf2)
                                          (automated by SageMaker Neo)
```

| Acceleration choice | Character | Extra work | Current recommendation |
|-------------|------|-----------|-------------|
| CPU (m5/c5) | The default for traditional ML | None | Enough for tabular-data models |
| GPU (g4dn/g5) | General-purpose deep learning inference acceleration | None | A safe default |
| Inferentia (inf1/inf2) | Inference-dedicated chip, minimizes unit cost | **Neuron compilation** | The primary answer for large-scale deep learning inference |
| Elastic Inference | Attaches a fractional GPU to a CPU | Accelerator attachment setup | Legacy — replaced by Inferentia |

Inferentia is the right answer when running "deep learning inference at large scale and at low cost." For transformer and CNN inference workloads, cost per throughput is better than GPUs. However, there is a step of compiling the model for Neuron, so it goes through one more step than "just deploy." If the exam says "it is deep learning inference, GPU cost is too high, and I want to cut cost while maintaining throughput," Inferentia (inf1/inf2) is the answer.

## Elastic Inference — (Legacy) Attaching Only Part of a GPU

Elastic Inference (EI) was a feature that attached only a **fraction of GPU acceleration** to a CPU instance as an accelerator, speeding up deep learning inference more cheaply than a full GPU instance. It filled the middle ground of "a full GPU is overkill but CPU alone is slow."

> ⚠️ **Pitfall**: New use of Elastic Inference is no longer recommended, and AWS advises **replacing it with Inferentia**. In older study materials and past exam questions EI appears as the correct answer, but in current scenarios the primary answer for "reduce deep learning inference cost" is Inferentia. Know EI only as a concept (fractional GPU acceleration), and in practice and the latest exams consider Inferentia first.

## Summary of Cost-Saving Patterns

Mapping advanced inference to cost in one line each gives the following.

- There are very many models of the same kind → **MME** (consolidates endpoint and instance cost)
- Traffic is intermittent → **serverless/asynchronous** (scale to 0, see Day 1 and 4)
- Deep learning inference cost is high → **Inferentia (inf1/inf2)**
- You want to bundle preprocessing/postprocessing into one endpoint → **inference pipeline** (the goal is consistency and simplification rather than cost)
- Different frameworks on one endpoint → **MCE**

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| Only the first call to a specific model on MME is especially slow | Not in the cache, so a cold load from S3 | Warm frequently used models; move up to an instance with more memory |
| MME latency is erratic and unstable overall | All models are high-frequency, causing cache thrashing | Split the models into groups and separate the endpoints; add instances |
| You added a model but it isn't reflected | Uploaded outside the S3 prefix or the path doesn't match | Check that it was uploaded beneath `model_data_prefix` |
| MME deployment fails because the frameworks differ | MME has only one container | Switch to MCE (`TargetContainerHostname`) |
| Training performance is good but production accuracy is low | Preprocessing differs from training, causing skew | Package the preprocessing together as an inference pipeline container |
| Inferentia deployment fails at the load stage | A model that was not compiled with Neuron | Compile with Neuron/SageMaker Neo and redeploy |

The next article digs deeper into batch transform and serverless inference to look at large-volume processing tuning and the concurrency and cost trade-offs.

## 📖 Glossary

- **Multi-model endpoint (MME)**: A method that shares one container and serves hundreds to thousands of models stored in S3 from one address.
- **Multi-container endpoint (MCE)**: A method that places several containers with different frameworks together on one endpoint.
- **Inference pipeline**: A structure that chains preprocessing → inference → postprocessing containers in order and handles them in a single call.
- **Dynamic load/unload**: The behavior of loading only the needed models into memory as they are required and unloading unused ones to free space.
- **Cache thrashing**: A phenomenon where memory is short, so loading and unloading repeat and everything becomes slower.
- **training-serving skew**: A problem where preprocessing differs between training and inference, silently degrading performance.
- **AWS Inferentia**: A chip AWS built specifically for inference. It has a better cost per inference than GPUs for deep learning inference.
- **AWS Neuron SDK**: A set of development tools that compiles and runs models so they can run on Inferentia.
- **SageMaker Neo**: A feature that automatically compiles and optimizes a model for the target hardware.
- **Elastic Inference**: An old feature that attached only part of a GPU's performance to a CPU instance. Now replaced by Inferentia.

## 📝 Practice Questions

**Question 1.** A nationwide retailer has an XGBoost demand forecasting model for each of its 1,500 stores. Each store model is invoked occasionally, and the cost of running 1,500 endpoints is a burden. What is the most appropriate deployment approach?

A) Multi-container endpoint (MCE)  
B) Multi-model endpoint (MME)  
C) A separate real-time endpoint for each store  
D) Inference pipeline  

**Answer: B**  
Explanation: "Very many models on the same framework (XGBoost) with a low invocation frequency per model" is exactly the condition for MME, which serves the models on a small number of shared instances to greatly lower cost. A is for a small number of models on different frameworks, C makes costs explode with 1,500 endpoints, and D is for a preprocessing-inference chain and has nothing to do with serving many models.

---

**Question 2.** You want to apply exactly the same scaling and encoding preprocessing used during training at inference time to prevent training-serving skew, and handle both preprocessing and inference in a single call. What is the appropriate approach?

A) Multi-model endpoint  
B) Inference pipeline (preprocessing container → model container)  
C) Batch transform  
D) Multi-container endpoint  

**Answer: B**  
Explanation: An inference pipeline chains a preprocessing container and a model container linearly so that preprocessing followed by inference runs on the same instance in a single call, guaranteeing the same preprocessing code as training at inference and preventing skew. A is for serving many models, C is bulk processing, and D is a structure that invokes different frameworks independently, which differs from the purpose of a preprocessing-inference chain.

---

**Question 3.** You run real-time inference on a large transformer-based NLP model, but GPU instance costs are too high. You want to lower cost per inference while maintaining throughput. What is the most appropriate choice?

A) Replace with CPU instances (ml.m5)  
B) Compile the model and deploy it on AWS Inferentia (ml.inf2) instances  
C) Multi-model endpoint  
D) Cut the number of instances in half  

**Answer: B**  
Explanation: Inferentia is a chip dedicated to deep learning inference that lowers cost per inference and latency compared with equivalent GPUs, making it the answer for "reduce deep learning inference cost + maintain throughput." A is too slow on CPU for transformer inference to maintain throughput, C is irrelevant for a single large model, and D is a simple reduction that lowers throughput.

---

**Question 4.** You want to deploy a TensorFlow image classification model and a PyTorch text model together on one endpoint and explicitly specify which container to use at invocation. What is the appropriate approach?

A) Multi-model endpoint (using TargetModel)  
B) Multi-container endpoint (using TargetContainerHostname)  
C) Inference pipeline  
D) Only two separate serverless endpoints are possible  

**Answer: B**  
Explanation: Placing containers of different frameworks (TensorFlow, PyTorch) on one endpoint and directly specifying one with `TargetContainerHostname` is a feature of the multi-container endpoint (MCE). A's MME assumes the same container and is unsuitable when the frameworks differ, C runs containers as a sequential chain rather than selective invocation, and D is a wrong claim that consolidating into one endpoint is impossible.

---

**Question 5.** Which statement about Elastic Inference is most accurate?

A) It is the latest primary recommended way to reduce deep learning inference cost  
B) It is a legacy feature that attaches fractional GPU acceleration to CPU instances, and the latest recommendation is to replace it with Inferentia  
C) It is a multi-model feature that dynamically loads models from S3  
D) It is a pipeline feature that bundles preprocessing and inference  

**Answer: B**  
Explanation: Elastic Inference was a feature that accelerated deep learning inference by attaching a fraction of GPU acceleration to CPU instances, but new use is no longer recommended and AWS guides customers to move to Inferentia. A conflicts with the fact that the latest primary recommendation is Inferentia, and C describes MME and D describes an inference pipeline, both unrelated to EI.

---
