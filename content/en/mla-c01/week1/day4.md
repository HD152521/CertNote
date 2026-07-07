# Day 4 - SageMaker Overview: Studio, Training/Inference, Built-in Algorithms

Yesterday we saw that SageMaker is the center of the AWS ML stack. Today we go inside. SageMaker is not a single service but a collection of tools covering the entire ML lifecycle. It is where ML engineers spend their days, and most MLA-C01 questions ask "which SageMaker capability do you use for this task?"

Today we look at SageMaker's workspace (Studio) and its permission structure (domains and user profiles), how training and inference actually run, and the built-in algorithms that spare you from writing algorithms yourself. The goal is to grasp the big picture — the details of each capability are covered in depth in later weeks.

## SageMaker Studio: The Integrated IDE for ML Work

**SageMaker Studio** is a browser-based integrated development environment. Notebooks, experiment tracking, pipelines, and model deployment all happen on one screen. If VS Code is the IDE for general development, Studio is the IDE for ML.

The key way Studio differs from the older notebook instances is the **separation of compute and storage**. Notebook code is persisted on EFS, and you attach the instance (kernel) you want only when executing. You can write code on a CPU and swap to a GPU kernel only when training, and shut down unused kernels to save cost.

```python
# Start a SageMaker SDK session inside a Studio notebook
import sagemaker
session = sagemaker.Session()
role = sagemaker.get_execution_role()    # The IAM role attached to the notebook
bucket = session.default_bucket()        # The default S3 bucket
print(region := session.boto_region_name)
```

The IAM role returned by `get_execution_role()` matters. Every SageMaker and S3 operation performed from the notebook runs with this role's permissions, so if the permissions are insufficient, training or deployment fails with `AccessDenied`.

> 💡 **Related theory**: Compute-storage separation is a core cost principle of cloud ML. Training needs a GPU for a few hours, but writing code only needs a CPU. If the two are bundled together, you pay for the expensive GPU even while writing code. Studio separates code (EFS) from execution (on-demand kernels) so you rent "the expensive resource only when you use it." This is Studio's cost advantage over notebook instances.

## Domains and User Profiles: SageMaker's Permission Structure

To use SageMaker Studio, you must first create a **Domain**. A domain is the top-level boundary of the Studio environment, tying together one VPC, an authentication method, and shared storage (EFS). An organization (or team) typically has one domain.

Inside a domain are **User Profiles** — one per user (or persona), each with its own IAM role, home directory, and default settings.

```
Domain (org/team boundary; shared VPC, EFS, auth)
 ├─ User Profile: data-scientist-kim  (Role A: training permissions)
 ├─ User Profile: ml-engineer-lee     (Role B: training + deployment permissions)
 └─ User Profile: shared-space        (shared space for collaboration)
```

This hierarchy appears on the exam because of permission separation. You map a different IAM role to each user profile — for example, giving the data scientist only training permissions and the ML engineer deployment permissions as well. When a permission issue arises, you trace "which user profile's role has which permissions."

> 🔍 **Going deeper**: When creating a domain you choose a network mode. In **VPC only** mode, all traffic goes through the customer VPC, so you can block the internet and reach the SageMaker API via PrivateLink — the standard for regulated/secure environments. **Public internet** mode uses AWS-managed networking, which is convenient but offers weaker control. In finance/healthcare scenarios where "the data must not be exposed to the internet," VPC only is the answer.

## Training: It Happens in Ephemeral Containers

The core mechanism of SageMaker training is the **Training Job**. When you request training, SageMaker ① spins up the specified instances, ② pulls data from S3, ③ runs your training code inside a container, ④ stores the model artifacts to S3, and ⑤ automatically terminates the instances. Since the instances disappear when training ends, GPU cost is billed only for the training duration.

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", region, "1.7-1"),
    role=role,
    instance_count=2,                 # 2 or more instances for distributed training
    instance_type="ml.m5.xlarge",
    output_path=f"s3://{bucket}/models/",
    use_spot_instances=True,          # Cut training cost by up to 90% with Spot
    max_wait=7200, max_run=3600,
)
estimator.fit({"train": f"s3://{bucket}/train/"})
```

`use_spot_instances=True` is a common technique ML engineers use to reduce training cost. Training can resume from checkpoints even if interrupted, making it well suited to cheap Spot Instances.

## Inference: Four Options

There are four ways to serve a trained model, depending on the traffic pattern. This is a key comparison that MLA-C01 asks about frequently.

| Option | Suited to | Characteristics |
|------|-----------|------|
| Real-time endpoint | Continuous low-latency requests | Always on (constant cost), ms responses |
| Serverless inference | Intermittent, unpredictable traffic | Auto-scaling, has cold starts, zero idle cost |
| Batch transform | Bulk inference over large datasets | No endpoint needed, terminates when done |
| Asynchronous inference | Large payloads, long processing | Queue-based, for large/long-running jobs |

You decide by the shape of the traffic. "Thousands of requests per second, low latency" → real-time. "Score all customers once a day" → batch transform. "Occasional traffic, idle cost is a waste" → serverless. "Large inputs like images/video with long processing" → asynchronous.

```python
# Deploy a real-time endpoint
predictor = estimator.deploy(
    initial_instance_count=1, instance_type="ml.m5.large",
    endpoint_name="churn-endpoint",
)
result = predictor.predict(payload)   # Millisecond-level responses
```

> 💡 **Related theory**: Serverless inference is the classic trade-off of "zero idle cost vs. cold-start latency." When there is no traffic, instances scale to zero so you pay nothing, but the next request incurs a cold start (hundreds of ms to several seconds) while a new container spins up. Services requiring consistently low latency choose a real-time endpoint (always on); cost-sensitive, intermittent workloads choose serverless. This is the same structure as Lambda's cold-start trade-off.

## Built-in Algorithms: 17 You Don't Have to Write Yourself

SageMaker provides about 17 proven algorithms as containers. There is no need to write model code yourself — you only pass data and hyperparameters. Memorizing the representative algorithm per problem type lets you choose quickly on the exam.

| Problem type | Built-in algorithm |
|----------|---------------|
| Classification/regression (tabular) | XGBoost, Linear Learner |
| Clustering | K-Means |
| Dimensionality reduction | PCA |
| Anomaly detection | Random Cut Forest (RCF) |
| Recommendation | Factorization Machines |
| Image classification | Image Classification |
| Object detection | Object Detection |
| Time-series forecasting | DeepAR |
| Topic modeling | LDA, NTM |

If the built-ins do not fit, you move to a **custom container** (a Docker image you build yourself) or **script mode** (your own training script + an AWS-managed framework container). For "tabular data classification/regression," XGBoost is almost always the default answer.

## Wrapping Up

Three key takeaways today. First, Studio is the IDE that unifies ML work through **compute-storage separation**, and it divides permissions through the domain–user profile hierarchy. Second, training happens in **ephemeral containers** — the instances disappear when it ends — and Spot Instances reduce cost. Third, for inference you choose among **real-time/serverless/batch/asynchronous** based on the traffic pattern, and built-in algorithms let you skip writing model code.

In the next article, we wrap up Week 1 with a comprehensive review of the ML fundamentals and the AWS stack we learned this week.

---

## 📝 연습 문제

**문제 1.** What is the key reason SageMaker Studio is more cost-efficient than the older notebook instances?

A) Because it is provided for free  
B) Because compute and storage are separated — code is stored on EFS and you attach the desired kernel (instance) only when executing  
C) Because it always provides unlimited GPUs  
D) Because training runs on your local PC  

**정답: B**  
해설: Studio separates code (persisted on EFS) from execution (on-demand kernels), so you rent expensive GPUs only when you use them. You can write code on a CPU and switch to a GPU kernel only for training. It is not free, does not provide unlimited GPUs, and training runs on SageMaker-managed instances, not locally.

---

**문제 2.** In SageMaker Studio, you want to grant the data scientist only training permissions and the ML engineer deployment permissions as well. Which structure implements this?

A) Create two domains  
B) Within the same domain, map a different IAM role to each user profile  
C) Grant every user the same administrator role  
D) Separate the VPCs  

**정답: B**  
해설: Within a single domain, you separate permissions by mapping a different IAM role to each user profile. A domain is typically one per team, and there is no need to multiply domains for permission separation. Giving everyone the same administrator role violates the principle of least privilege, and VPC separation is network isolation, not a means of per-user permission separation.

---

**문제 3.** In a SageMaker Training Job, why is the training cost billed only for the duration of training?

A) Because the training instances are always on  
B) Because SageMaker automatically terminates the instances when training finishes  
C) Because training is free  
D) Because training runs directly inside the user profile  

**정답: B**  
해설: A training job spins up instances, runs the training, stores the artifacts to S3, and then automatically terminates the instances, so GPU cost is billed only for the training duration. Being always on is a characteristic of real-time inference endpoints, training is not free, and a user profile does not itself execute compute.

---

**문제 4.** Which inference option best suits the workload "once a day, compute churn scores for the entire customer base in one batch"?

A) Real-time endpoint  
B) Batch Transform  
C) Asynchronous inference  
D) An always-on GPU server  

**정답: B**  
해설: Batch Transform, which runs bulk inference over large datasets and terminates when done, is the right fit. It needs no standing endpoint, making it cost-efficient. A real-time endpoint is for continuous low-latency requests and incurs constant cost, asynchronous inference is for large payloads and long single-request processing, and an always-on GPU server wastes idle cost.

---

**문제 5.** For a binary classification problem on structured (tabular) data using SageMaker built-in algorithms, what is the most common default choice?

A) K-Means  
B) XGBoost  
C) PCA  
D) DeepAR  

**정답: B**  
해설: For classification and regression on tabular data, XGBoost is the standard default choice among the built-in algorithms. K-Means is for clustering (unsupervised), PCA is for dimensionality reduction, and DeepAR is for time-series forecasting — all serving different purposes than tabular classification.

---
