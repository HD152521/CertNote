# Day 4 - SageMaker Overview: Studio, Training/Inference, Built-in Algorithms

## 📌 Key Takeaways

- **Studio** is an ML-specific IDE that separates compute from storage — code lives on EFS, and a kernel (instance) is attached only when you run it.
- The permission structure is **Domain (team boundary) → User Profile (individual/role)**. Permissions are divided by mapping a different IAM role to each profile.
- Training happens in an **ephemeral container** — the instance shuts down automatically when it finishes, and Spot reduces cost.
- Inference is chosen by **traffic pattern**: real-time / serverless / batch transform / asynchronous.
- About 17 built-in algorithms let you skip writing model code. **Tabular classification and regression = XGBoost** is the default.

## SageMaker Studio: An Integrated IDE for ML Work

SageMaker is not a single service but a collection of tools covering the entire ML lifecycle, and MLA-C01 questions come in the form of "which SageMaker feature do you use for this task?"

**SageMaker Studio** is a browser-based integrated development environment. You do notebooks, experiment tracking, pipelines, and model deployment on one screen. If VS Code is the IDE for general development, Studio is the IDE for ML.

The key difference between Studio and the older notebook instances is the **separation of compute and storage**.

| Category | Notebook instance | Studio |
|------|---------------|--------|
| Code storage | EBS attached to the instance | EFS (separate from the instance) |
| Execution resources | Instance type fixed | Choose and swap an instance per kernel |
| Changing type | Must restart the instance | Just swap the kernel |
| Idle cost | Keeps accruing as long as it's on | Zero compute cost when the kernel is shut down |
| Collaboration | Individual instances | Domain and shared spaces |

You can write code on a CPU and swap to a GPU kernel only when training, and shut down kernels you aren't using to save cost.

```python
# Start a SageMaker SDK session inside a Studio notebook
import sagemaker
session = sagemaker.Session()
role = sagemaker.get_execution_role()    # IAM role assigned to the notebook
bucket = session.default_bucket()        # default S3 bucket
print(region := session.boto_region_name)
```

The IAM role returned by `get_execution_role()` is important. Every SageMaker and S3 operation you do from the notebook runs with this role's permissions, so if permissions are insufficient, training or deployment fails with `AccessDenied`.

The separation of compute and storage is a core cost principle of cloud ML. Training needs a GPU for several hours, but writing code is fine on a CPU. If you tie the two together, expensive GPU cost accrues even while you are writing code. Studio separates code (EFS) from execution (on-demand kernels) so that you borrow "expensive resources only when you use them." This is Studio's cost advantage over notebook instances.

## Domains and User Profiles: SageMaker's Permission Structure

To use SageMaker Studio, you must first create a **Domain**. A domain is the top-level boundary of a Studio environment, bundling one VPC, one authentication method, and shared storage (EFS). Usually there is one domain per organization (or team).

Inside a domain are **User Profiles**. There is one per user (or persona), and each has its own IAM role, home directory, and default settings.

```
Domain (organization/team boundary, shares VPC, EFS, authentication)
 ├─ User Profile: data-scientist-kim  (Role A: training permissions)
 ├─ User Profile: ml-engineer-lee     (Role B: training + deployment permissions)
 └─ Shared Space: team-collab         (shared space for collaboration)
```

| Layer | What it bundles | What it divides |
|------|-----------|-------------|
| Domain | VPC, authentication method, EFS, default settings | Isolation per organization/team |
| User Profile | Personal IAM role, home directory | Permissions per person/role |
| Shared Space | A workspace multiple users use together | Resources for collaboration |

This hierarchy appears on the exam because of permission separation. You map a different IAM role to each user profile, for example granting only training permissions to a data scientist and deployment too to an ML engineer. When a permission problem arises, you must trace "which role of which user profile has what permissions."

When creating a domain you choose a network mode. **VPC only** mode sends all traffic through the customer VPC, so you can block the internet and reach the SageMaker API through PrivateLink — it is the standard for regulated and security-sensitive environments. **Public internet** mode runs over an AWS-managed network, which is convenient but offers weaker control. If "data must not be exposed to the internet" appears in a financial or healthcare scenario, VPC only is the answer.

## Training: It Happens in an Ephemeral Container

The core mechanism of SageMaker training is the **Training Job**. When you request training, SageMaker processes it in the following order.

```
   [fit() call]
        │
        v
  ① Provision instances (the specified type and count)
        │
        v
  ② Download/stream training data from S3
        │
        v
  ③ Run the training code inside the container
        │
        v
  ④ Save the model artifact (model.tar.gz) to S3
        │
        v
  ⑤ Instances shut down automatically  ← why GPU cost is billed only for the training time
```

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", region, "1.7-1"),
    role=role,
    instance_count=2,                 # 2 or more for distributed training
    instance_type="ml.m5.xlarge",
    output_path=f"s3://{bucket}/models/",
    use_spot_instances=True,          # cut training cost by up to 90% with Spot
    max_wait=7200, max_run=3600,
)
estimator.fit({"train": f"s3://{bucket}/train/"})
```

`use_spot_instances=True` is a common technique for ML engineers to reduce training cost. Since training can resume from a checkpoint even if interrupted, it suits cheap Spot instances.

| Parameter | Meaning | Caution |
|---------|------|--------|
| `instance_count` | Number of instances used for training | 2 or more means distributed training, effective only if the data is split into multiple files |
| `use_spot_instances` | Use Spot instances | Can be interrupted — configuring checkpoints is practically mandatory |
| `max_run` | Maximum run time of the training itself | The job is stopped if exceeded |
| `max_wait` | Maximum time including the wait for Spot | Must be at least `max_run` when using Spot |
| `output_path` | S3 location of the model artifact | The reference point for reproduction and deployment |

> ⚠️ **Pitfall**: Spot is cheap, but it can be reclaimed at any time. Running a long training job on Spot without checkpoints means starting over from scratch on interruption, which is actually a loss. Choose Spot on seeing the clue "cost savings," but check whether interruption tolerance (checkpoints) is mentioned alongside it.

## Inference: Four Options

There are four ways to serve a trained model depending on the traffic pattern. This is a comparison that is easy to confuse on MLA-C01.

| Option | Suitable situation | Idle cost | Latency | Characteristics |
|------|-----------|----------|------|------|
| Real-time endpoint | Continuous low-latency requests | Yes (always running) | Milliseconds | Always on |
| Serverless inference | Intermittent, unpredictable traffic | None | Cold start present | Auto scaling |
| Batch transform | Bulk inference on large data | None (job ends) | Not applicable | No endpoint needed |
| Asynchronous inference | Large payloads, long processing | Can scale down to 0 | Includes queue wait | Queue-based, results go to S3 |

You decide by the shape of the traffic.

- "Thousands of requests per second, low latency" → **real-time endpoint**
- "Score all customers once a day" → **batch transform**
- "Comes in occasionally and idle cost is wasteful" → **serverless inference**
- "Large inputs such as images or video and processing takes long" → **asynchronous inference**

```python
# Deploy a real-time endpoint
predictor = estimator.deploy(
    initial_instance_count=1, instance_type="ml.m5.large",
    endpoint_name="churn-endpoint",
)
result = predictor.predict(payload)   # response in milliseconds
```

```
              Do requests keep coming in?
                   │
        ┌──── Yes ─┴── No ────────┐
        │                         │
  Is latency important?     Is it a large batch at once?
   │         │                │        │
  Yes        No              Yes       No
   │         │                │        │
Real-time  Async (large     Batch      Serverless
           inputs)          transform
```

Serverless inference is the classic trade-off of "zero idle cost vs cold-start latency." When there is no traffic, it scales instances down to zero and charges nothing, but on the next request a cold start occurs as a new container is brought up. For a service whose latency must be consistently low, choose a real-time endpoint (always running); if it is cost-sensitive and intermittent, choose serverless. This is the same structure as Lambda's cold-start trade-off.

## Built-in Algorithms: 17 You Don't Have to Write Yourself

SageMaker provides about 17 proven algorithms as containers. You don't need to write model code; you only pass the data and hyperparameters. If you remember a representative one for each problem type, you can choose quickly on the exam.

| Problem type | Built-in algorithm | Scenario keyword |
|----------|---------------|----------------|
| Classification/regression (tabular) | XGBoost, Linear Learner | "Predict from structured data" |
| Clustering | K-Means | "Group without labels" |
| Dimensionality reduction | PCA | "There are too many features" |
| Anomaly detection | Random Cut Forest (RCF) | "Detect abnormal patterns" |
| Recommendation | Factorization Machines | "Sparse user-item matrix" |
| Image classification | Image Classification | "What the photo is" |
| Object detection | Object Detection | "What is where in the photo" |
| Time-series forecasting | DeepAR | "Forecast future demand/values" |
| Topic modeling | LDA, NTM | "Automatically extract document topics" |

**What if the built-in algorithms don't fit?** — The options widen in three steps.

| Approach | What it provides | When |
|------|---------------|------|
| Built-in algorithm | Algorithm + container, all by AWS | A standard problem type applies |
| Script mode | AWS-managed framework container + my training script | A model I wrote with TensorFlow, PyTorch, etc. |
| Custom container | A Docker image I built | Special libraries or runtimes are needed |

For "tabular data classification/regression," XGBoost is almost always the default answer.

> ⚠️ **Pitfall**: Built-in algorithms have input format requirements. Several algorithms support RecordIO-protobuf in addition to CSV, and the latter is advantageous for large-scale sequential training. In a scenario where "a built-in algorithm is used but fails because the data isn't ready," you can suspect a format or content-type mismatch.

## Running an Endpoint with Multiple Models

When models grow to dozens or hundreds, it is inefficient to have an endpoint per model. SageMaker offers a way to host multiple models on a single endpoint.

| Approach | Structure | Suitable situation |
|------|------|------------|
| Single-model endpoint | 1 endpoint = 1 model | A small number of main models with steady traffic |
| Multi-model endpoint | Load many models onto 1 endpoint and load them on request | Dozens to hundreds of models per customer or region |
| Production variant | Multiple versions on one endpoint, traffic split by weight | A/B testing, canary deployment |

- Multi-model eliminates the waste of keeping instances always allocated even for rarely used models.
- In exchange, a model that hasn't been invoked for a long time may incur a load delay on its first request.
- Adjusting variant weights is the means of carrying out the canary deployment we saw on Day 1.

## Model Artifacts and the Registry

When a training job finishes, the artifact is saved to `output_path` in the form of `model.tar.gz`. This file is the material for deployment.

```
[Training Job] ──> s3://bucket/models/<job-name>/output/model.tar.gz
                          │
                          ├──> create [Model] (image + artifact + role)
                          │        │
                          │        ├──> real-time endpoint
                          │        └──> batch transform job
                          │
                          └──> [Model Registry] register versions, manage approval status
```

The Model Registry manages "which model versions are approved and can go to production." This is the point where an automated retraining pipeline places an approval step.

## Common Mistakes in Training and Inference Operations

| Mistake | Symptom | Fix |
|------|------|------|
| Missing S3 permissions in the execution role | `AccessDenied` right after training starts | Add permissions for the target bucket to the role policy |
| Using Spot without configuring checkpoints | Retrain from scratch on interruption | Specify a checkpoint path |
| Setting `max_run` too short | Training is stopped before completion | Leave a margin over the expected training time |
| Running a real-time endpoint around the clock for intermittent traffic | Wasted idle cost | Consider serverless inference |
| Using an endpoint for bulk batch scoring | Unnecessary always-on cost | Switch to batch transform |
| Data is a single huge file | Not distributed in distributed training | Shard into multiple objects |

In the next post, we wrap up Week 1 with a comprehensive review of the ML fundamentals and the AWS stack learned this week.

## 📖 Glossary

- **SageMaker Studio** : A browser-based IDE specialized for ML that handles notebooks, experiments, pipelines, and deployment on one screen.
- **Compute-storage separation** : A structure that keeps code in persistent storage and attaches execution resources only when needed. It eliminates idle cost.
- **Kernel** : The instance that actually runs the notebook code. It can be swapped between CPU/GPU.
- **Domain** : The top-level boundary of a Studio environment. A team-level fence bundling VPC, authentication, and shared storage.
- **User Profile** : An individual account within a domain. Each has its own IAM role and home directory.
- **VPC only mode** : A network setting that makes Studio traffic flow only through the customer VPC, preventing internet exposure.
- **Training Job** : A one-off job that launches instances, trains, leaves the artifact in S3, and then shuts itself down.
- **Spot instance** : An instance that uses spare capacity cheaply but can be reclaimed at any time. Used together with checkpoints.
- **Cold start** : The initial delay when the first request arrives from an idle state because a container must be brought up anew.
- **Batch Transform** : An inference method that scores large data in one go without an always-on endpoint and then finishes.

## 📝 Practice Questions

**Question 1.** SageMaker Studio's core cost advantage over traditional notebook instances is?

A) It's free  
B) Compute and storage are separated — code stored in EFS permanently, instances attached only at runtime  
C) Unlimited GPU is always provided  
D) Training runs on your local PC  

**Answer: B**  
Explanation: Studio separates code (permanently on EFS) from execution (on-demand kernels), so you only rent expensive GPU when actually computing. Code in CPU, switch to GPU kernel for training, shut down unused kernels. Not free, not unlimited GPU, and training runs on SageMaker-managed instances, not locally.

---

**Question 2.** You want data scientists to have only training permission and ML engineers to have deployment permission in SageMaker Studio. How to implement this?

A) Create two separate domains  
B) Map different IAM roles to different user profiles within the same domain  
C) Grant all users the same admin role  
D) Separate VPCs  

**Answer: B**  
Explanation: Within one domain, map different IAM roles to different user profiles to separate permissions. One domain per team usually suffices; no need to multiply domains for permission separation. Identical admin roles violate least-privilege. VPC separation is network isolation, not user-level permission separation.

---

**Question 3.** Why are SageMaker Training Job costs charged only for training time?

A) Training instances are always on  
B) SageMaker automatically terminates instances when training ends  
C) Training is free  
D) Training runs directly in user profiles  

**Answer: B**  
Explanation: Training jobs spin up instances, run training, save artifacts to S3, then auto-terminate — so GPU costs are charged only for training time. Always-on is characteristic of real-time inference endpoints, not training. Training isn't free, and user profiles don't execute compute themselves.

---

**Question 4.** "Once a day, batch-score all customers on churn prediction" — which inference option fits best?

A) Real-time endpoint  
B) Batch Transform  
C) Asynchronous inference  
D) Always-on GPU server  

**Answer: B**  
Explanation: Batch-scoring bulk data with termination after completion is Batch Transform — no persistent endpoint needed, cost-efficient. Real-time endpoints need constant availability and ongoing costs. Asynchronous inference is for single large jobs with long processing. Always-on GPU servers waste idle costs.

---

**Question 5.** To solve a binary classification problem on tabular data with SageMaker built-in algorithms, the most standard default choice is?

A) K-Means  
B) XGBoost  
C) PCA  
D) DeepAR  

**Answer: B**  
Explanation: For tabular classification·regression, XGBoost is the standard built-in baseline. K-Means is clustering (unsupervised), PCA is dimensionality reduction, DeepAR is time-series forecasting — all different purposes than tabular classification.

---
