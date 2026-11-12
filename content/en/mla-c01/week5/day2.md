# Day 2 - Distributed Training: Data Parallel and Model Parallel

When a model doesn't fit on one device or data is so large that one GPU takes days, you must split training across multiple devices/GPUs. This is distributed training. The core is "what do you split"—data or model—two branches.

In the MLA-C01 exam, distributed training appears in symptoms like "model doesn't fit GPU memory", "training is too slow", "train billions-parameter model". Today we cover data parallelism, model parallelism, and SageMaker's distributed training libraries.

## Data Parallel vs Model Parallel

First clarify the two distributed paradigms:

| Distinction | Data Parallel | Model Parallel |
|---|---|---|
| What splits | Data (batches) distributed per GPU | Model itself divided across GPUs |
| Each GPU has | Complete model replica | Part of model layers/parameters |
| Solves problem | Training speed (throughput) | Model doesn't fit one GPU memory |
| Synchronization | Gradients all-reduce averaged | Activations·gradients passed between stages |
| Typical use | Data large, model fits GPU | Ultra-large models (billions parameters) |

Core intuition: **Data parallel when "model fits but slow", model parallel when "model itself doesn't fit"**. Exam keywords "out of memory / model too large" → model parallel, "training takes too long / data huge" → data parallel.

> 💡 **Related Theory**: Data parallel's mathematical basis is minibatch gradient linearity. Full batch gradient equals average of partial batch gradients computed per GPU. So each GPU processes its batch slice with model replicas, then all-reduce averages gradients—mathematically equivalent to one large batch update on one device. Model parallel differs: you literally cut the computation graph so one GPU's output becomes the next GPU's input, making GPU interdependency and communication cost inherently larger.

## Data Parallel: Boost Throughput

Data parallel is the most common distributed approach. Each GPU (or device) has complete model replica, performs forward/backward on different data slices, then collects and averages gradients.

```
[GPU 0]  batch slice 0  →  gradient g0  ┐
[GPU 1]  batch slice 1  →  gradient g1  ├─ all-reduce → average ḡ → all GPU same update
[GPU 2]  batch slice 2  →  gradient g2  ┘
```

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',
    instance_type='ml.p4d.24xlarge',
    instance_count=2,                       # Multiple devices
    framework_version='2.0', py_version='py310',
    distribution={                          # Enable SageMaker data parallel
        'smdistributed': {'dataparallel': {'enabled': True}}
    }
)
```

**SageMaker Distributed Data Parallel (SMDDP)** provides all-reduce optimized for AWS networking (EFA etc.), better communication efficiency than vanilla PyTorch DDP. Scaling data parallel grows throughput nearly linearly, though not infinitely due to communication overhead.

> ⚠️ **Pitfall**: Scale GPU count by N and effective batch size also becomes N×. Leaving learning rate unchanged can hurt convergence—typically adjust learning rate alongside (e.g., linear scaling). Exams target the misconception "adding GPUs automatically trains better".

## Model Parallel: Split the Model

Model parallel when the model itself doesn't fit one GPU memory. Billions-to-hundreds-of-billions parameter LLMs exemplify this. Model parallel has two facets:

- **Tensor/Pipeline sharding**: Distribute layers across GPUs, where one GPU's output feeds next GPU's input (pipeline parallel), or split one layer's tensor ops themselves (tensor parallel).
- **Sharding**: Distribute optimizer state, gradients, parameters across GPUs to save memory (ZeRO/FSDP family).

```python
estimator = PyTorch(
    entry_point='train.py',
    instance_type='ml.p4d.24xlarge', instance_count=2,
    framework_version='2.0', py_version='py310',
    distribution={
        'smdistributed': {
            'modelparallel': {                 # SageMaker model parallel
                'enabled': True,
                'parameters': {'partitions': 4, 'tensor_parallel_degree': 2}
            }
        }
    }
)
```

**SageMaker Distributed Model Parallel (SMP)** automates model splitting, pipeline execution, sharding. Users don't manually assign layers to GPUs; the library figures out partition strategy to fit memory.

> 💡 **Related Theory**: Splitting huge models' core tradeoff is "memory savings vs communication cost". Finer splits reduce per-GPU memory but increase activation·parameter transfers between GPUs, slowing it down. So practice combines data·tensor·pipeline parallelism and sharding into "hybrid parallelism". For example, within-node uses tensor parallel (fast NVLink), across-nodes uses data parallel (relatively slow network), tuning communication pattern to topology.

## Large-Scale Training Infrastructure

Distributed performance driven not just by algorithm but infrastructure:

- **EFA (Elastic Fabric Adapter)**: Low-latency high-bandwidth inter-node network. Reduces distributed training's all-reduce communication bottleneck. Enabled on GPU instances like p4d/p5.
- **FSx for Lustre**: High-throughput parallel file system. Supplies large training data to GPUs faster than S3, reducing data loading bottleneck.
- **Instance choice**: Multi-GPU single-node (e.g., p4d.24xlarge = 8 GPUs) uses fast NVLink within-node. Multiple nodes use EFA for inter-node.

```
S3 (raw data source)
   └─ FSx for Lustre (fast cache) → rapidly supplies multiple training nodes
Training nodes ── EFA (low-latency network) ── all-reduce / model parallel comms
```

> 📚 **Case**: A research team tried training a 7B-parameter model on single ml.g5 instance, hit GPU OOM. Adding data parallel nodes didn't help—replicas still didn't fit one GPU. Using SMP's model parallel+sharding distributed params and optimizer state across GPUs, fitting in memory; EFA between nodes and FSx for Lustre for data supply greatly cut training time. Lesson: OOM solved by model parallel, not GPU addition (data parallel).

## How to Choose

Decision flow: ① Does model fit one GPU? Fits but slow → **data parallel** (add GPU/nodes, SMDDP). ② Doesn't fit (OOM) → **model parallel/sharding** (SMP). ③ Both → hybrid. Additionally, if data loading bottleneck → FSx for Lustre, if inter-node comms bottleneck → EFA. "Faster" maps to data parallel, "doesn't fit" to model parallel.

## Summary

Distributed training splits by "what to divide". **Data parallel** divides data per GPU, each learns with model replica, then all-reduce averages gradients, solving training speed (throughput) issues (SMDDP). **Model parallel** divides model itself across GPUs/shards, training ultra-large models that don't fit one GPU memory (SMP). Infrastructure adds EFA for inter-node comms, FSx for Lustre for data supply. Exams: "OOM/model too large" → model parallel, "slow/data large" → data parallel.

Next we see debugging and profiling—looking inside at how training runs, where it slows, where it breaks.

---

## 📝 Practice Questions

**Question 1.** The model to train fits comfortably in single-GPU memory, but the dataset is so large that training on one GPU would take days. What is the most suitable distributed strategy?

A) Model parallelism to split the model across multiple GPUs  
B) Data parallelism to distribute batches across multiple GPUs/nodes and all-reduce the gradients  
C) Reduce the batch size to 1  
D) Move training to CPU  

**Answer: B**  
Explanation: When the model fits on the GPU but training is slow, it is a throughput problem, so data parallelism distributes data across multiple machines to increase speed almost linearly. A is a strategy for when the model does not fit and is therefore unnecessary, C actually slows things down, and D is a wrong choice that gives up GPU acceleration.

---

**Question 2.** You want to train a 7-billion-parameter model but run out of memory (OOM) on a single GPU. Adding nodes with data parallelism does not solve it. What is the fundamental solution?

A) Double the number of data-parallel GPUs  
B) Use SageMaker model parallelism (SMP) to split and shard the model parameters and optimizer state across multiple GPUs  
C) Lower the learning rate  
D) Reduce the number of epochs  

**Answer: B**  
Explanation: OOM is a problem where the model replica itself does not fit on one GPU, and data parallelism does not solve it because it places a full replica on each GPU. You must split the model across GPUs with model parallelism/sharding. A repeats the same OOM, and C and D are unrelated to memory usage.

---

**Question 3.** In data parallelism, increasing the number of GPUs has increased the effective batch size. What commonly needs to be adjusted along with it?

A) Model architecture  
B) Learning rate (for example, scaled to match the batch increase)  
C) S3 bucket Region  
D) IAM role  

**Answer: B**  
Explanation: When data parallelism enlarges the effective batch, leaving the learning rate unchanged can hurt convergence, so the learning rate is usually adjusted together (linear scaling, etc.). A has no reason to change regardless of the distributed strategy, and C and D are settings unrelated to training convergence.

---

**Question 4.** All-reduce communication between many GPU nodes has become a bottleneck, reducing the scaling efficiency of distributed training. Which AWS offering provides low-latency, high-bandwidth communication between nodes?

A) Elastic Fabric Adapter (EFA)  
B) Amazon SQS  
C) CloudFront  
D) Route 53  

**Answer: A**  
Explanation: EFA is a low-latency, high-bandwidth network interface for HPC and distributed training that reduces the all-reduce communication bottleneck between nodes on p4d/p5 and similar instances. B is a message queue, C is a CDN, and D is DNS, all unrelated to GPU-to-GPU communication in distributed training.

---

**Question 5.** You want to supply large training datasets to multiple GPU nodes with high throughput to reduce the data loading bottleneck. Which service is appropriate?

A) Single-object GET from S3 at every step  
B) FSx for Lustre high-performance parallel file system to cache and serve S3 data  
C) DynamoDB table scan  
D) A single EBS volume attached to only one node  

**Answer: B**  
Explanation: FSx for Lustre is a high-throughput parallel file system integrated with S3 that quickly supplies large training datasets to multiple nodes, reducing the loading bottleneck. A has low throughput because of single-object calls, C is an analytics-unsuitable NoSQL database, and D is for a single node only, so it cannot supply data in a distributed way.

---
