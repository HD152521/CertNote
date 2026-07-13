# Day 4 - SageMaker Overview: Studio, Training/Inference, Built-in Algorithms

Yesterday we saw that SageMaker is the centerpiece of the AWS ML stack. Today we go inside. SageMaker isn't a single service but a collection of tools covering the entire ML lifecycle. It's where ML engineers spend their days, and most MLA-C01 questions ask "Which SageMaker feature do you use for this task?"

Today we'll look at SageMaker's workspace (Studio) and its permission structure (domain and user profiles), how training and inference actually work, and the built-in algorithms you can use without writing model code yourself. The goal is to get the big picture — deeper details come in later weeks.

## SageMaker Studio: Unified IDE for ML Work

**SageMaker Studio** is a browser-based integrated development environment. Notebooks, experiment tracking, pipelines, and model deployment all happen on one screen. If VS Code is the IDE for general development, Studio is the IDE for ML.

The key difference from the old notebook instances is **separation of compute and storage**. Notebook code lives permanently in EFS, and you attach whatever instance (kernel) you want only when you run. You can code in CPU, switch to a GPU kernel for training, and shut down unused kernels to save costs.

```python
# Start a SageMaker SDK session inside a Studio notebook
import sagemaker
session = sagemaker.Session()
role = sagemaker.get_execution_role()    # IAM role assigned to the notebook
bucket = session.default_bucket()        # Default S3 bucket
print(region := session.boto_region_name)
```

The IAM role returned by `get_execution_role()` matters. Every SageMaker and S3 operation from the notebook runs with this role's permissions, so insufficient permissions cause training or deployment to fail with `AccessDenied`.

> 💡 **Related Theory**: Compute-storage separation is a core cost principle in cloud ML. Training needs GPU for hours but code writing needs only CPU. Bundling them means you pay expensive GPU costs while writing code. Studio separates code (EFS) from execution (on-demand kernels), letting you "rent expensive resources only when used." This is Studio's cost advantage over notebook instances.

## Domain and User Profile: SageMaker's Permission Structure

To use SageMaker Studio, you first create a **Domain**. A domain is the top-level boundary for the Studio environment, bundling one VPC, authentication method, and shared storage (EFS). Usually one domain per organization (or team).

Inside a domain are **User Profiles**. One per user (or persona), each with its own IAM role, home directory, and settings.

```
Domain (organization/team boundary, shares VPC·EFS·authentication)
 ├─ User Profile: data-scientist-kim  (Role A: training permission)
 ├─ User Profile: ml-engineer-lee     (Role B: training + deployment permission)
 └─ User Profile: shared-space        (collaboration space)
```

This hierarchy appears on the exam because of permission separation. Give data scientists training permissions only, ML engineers deployment permission too, by mapping different IAM roles to each user profile. When permission issues arise, you trace "What permissions does this user profile's role have?"

> 🔍 **Deeper Dive**: When creating a domain, choose a network mode. **VPC only** mode routes all traffic through the customer VPC, letting you block the internet and reach SageMaker APIs via PrivateLink — the standard for regulated/secure environments. **Public internet** mode uses AWS-managed networks, more convenient but less control. In finance/healthcare scenarios, when you see "data must never be exposed to the internet," VPC only is the answer.

## Training: Happens in Ephemeral Containers

The core mechanism of SageMaker training is the **Training Job**. Request training and SageMaker will: ① spin up the specified instance, ② fetch data from S3, ③ run your training code inside a container, ④ save model artifacts to S3, then ⑤ auto-terminate the instance. When training ends, the instance disappears, so GPU costs are charged only for training time.

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", region, "1.7-1"),
    role=role,
    instance_count=2,                 # 2+ instances for distributed training
    instance_type="ml.m5.xlarge",
    output_path=f"s3://{bucket}/models/",
    use_spot_instances=True,          # Cut training costs up to 90% with spot
    max_wait=7200, max_run=3600,
)
estimator.fit({"train": f"s3://{bucket}/train/"})
```

`use_spot_instances=True` is a common ML engineering technique to reduce training costs. Training can resume from checkpoints if interrupted, making it suitable for cheap spot instances.

## Inference: Four Options

Serving a trained model comes down to four options depending on traffic pattern. This is a frequent comparison on MLA-C01.

| Option | Suitable When | Characteristics |
|--------|---------------|-----------------|
| Real-time endpoint | Continuous low-latency requests | Always on (ongoing cost), ms response |
| Serverless inference | Sporadic, unpredictable traffic | Auto-scales, cold start exists, no idle cost |
| Batch transform | Bulk inference on large data | No endpoint needed, terminates when done |
| Asynchronous inference | Large payloads, long processing | Queue-based, large/long-running jobs |

Pick by traffic shape. "Thousands of requests/second, low latency" → Real-time. "Score entire customer base once a day" → Batch transform. "Requests come sporadically, don't want idle costs" → Serverless. "Large inputs like images/video, long processing" → Asynchronous.

```python
# Deploy a real-time endpoint
predictor = estimator.deploy(
    initial_instance_count=1, instance_type="ml.m5.large",
    endpoint_name="churn-endpoint",
)
result = predictor.predict(payload)   # ms-scale response
```

> 💡 **Related Theory**: Serverless inference is the classic tradeoff: "zero idle cost vs cold-start latency." With no traffic, instances scale to zero so you pay nothing. But the next request triggers a cold start (hundreds of ms to seconds) spinning up a new container. Services needing consistent low latency pick real-time endpoints (always running); cost-sensitive with sporadic traffic pick serverless. This mirrors Lambda's cold-start tradeoff.

## Built-in Algorithms: 17 Types You Don't Write Yourself

SageMaker provides about 17 validated algorithms as containers. No need to write model code — just pass data and hyperparameters. Remember the key ones by problem type to choose quickly on the exam.

| Problem Type | Built-in Algorithm |
|--------------|-------------------|
| Classification·Regression (tabular) | XGBoost, Linear Learner |
| Clustering | K-Means |
| Dimensionality reduction | PCA |
| Anomaly detection | Random Cut Forest (RCF) |
| Recommendation | Factorization Machines |
| Image classification | Image Classification |
| Object detection | Object Detection |
| Time series forecasting | DeepAR |
| Topic modeling | LDA, NTM |

If built-in doesn't fit, go to **custom containers** (your own Docker image) or **script mode** (your training script + AWS-managed framework container). For "tabular data classification/regression," XGBoost is almost always the default answer.

## Summary

Three key takeaways for today. First, Studio is an integrated IDE for ML work with **compute-storage separation**, and the domain-user profile hierarchy manages permissions. Second, training happens in **ephemeral containers** that disappear when done, and you can cut costs with spot instances. Third, inference comes in **real-time/serverless/batch/asynchronous** options depending on traffic, and built-in algorithms let you skip model code.

Next we'll review the ML fundamentals and AWS stack from this week, wrapping up Week 1.

---

## 📝 연습 문제

**문제 1.** SageMaker Studio's core cost advantage over traditional notebook instances is?

A) It's free  
B) Compute and storage are separated — code stored in EFS permanently, instances attached only at runtime  
C) Unlimited GPU is always provided  
D) Training runs on your local PC  

**정답: B**  
해설: Studio separates code (permanently on EFS) from execution (on-demand kernels), so you only rent expensive GPU when actually computing. Code in CPU, switch to GPU kernel for training, shut down unused kernels. Not free, not unlimited GPU, and training runs on SageMaker-managed instances, not locally.

---

**문제 2.** You want data scientists to have only training permission and ML engineers to have deployment permission in SageMaker Studio. How to implement this?

A) Create two separate domains  
B) Map different IAM roles to different user profiles within the same domain  
C) Grant all users the same admin role  
D) Separate VPCs  

**정답: B**  
해설: Within one domain, map different IAM roles to different user profiles to separate permissions. One domain per team usually suffices; no need to multiply domains for permission separation. Identical admin roles violate least-privilege. VPC separation is network isolation, not user-level permission separation.

---

**문제 3.** Why are SageMaker Training Job costs charged only for training time?

A) Training instances are always on  
B) SageMaker automatically terminates instances when training ends  
C) Training is free  
D) Training runs directly in user profiles  

**정답: B**  
해설: Training jobs spin up instances, run training, save artifacts to S3, then auto-terminate — so GPU costs are charged only for training time. Always-on is characteristic of real-time inference endpoints, not training. Training isn't free, and user profiles don't execute compute themselves.

---

**문제 4.** "Once a day, batch-score all customers on churn prediction" — which inference option fits best?

A) Real-time endpoint  
B) Batch Transform  
C) Asynchronous inference  
D) Always-on GPU server  

**정답: B**  
해설: Batch-scoring bulk data with termination after completion is Batch Transform — no persistent endpoint needed, cost-efficient. Real-time endpoints need constant availability and ongoing costs. Asynchronous inference is for single large jobs with long processing. Always-on GPU servers waste idle costs.

---

**문제 5.** To solve a binary classification problem on tabular data with SageMaker built-in algorithms, the most standard default choice is?

A) K-Means  
B) XGBoost  
C) PCA  
D) DeepAR  

**정답: B**  
해설: For tabular classification·regression, XGBoost is the standard built-in baseline. K-Means is clustering (unsupervised), PCA is dimensionality reduction, DeepAR is time-series forecasting — all different purposes than tabular classification.

---
