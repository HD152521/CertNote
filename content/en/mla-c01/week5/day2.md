# Day 2 - Distributed Training: Data Parallel and Model Parallel

## 📌 Key Takeaways

- Distributed training has one fork in the road — **what you split**. Split the data and it is data parallel; split the model and it is model parallel.
- **Data parallel (SMDDP)**: each GPU holds a copy of the model and processes a slice of the batch → gradients are averaged with all-reduce. It solves a **speed (throughput)** problem.
- **Model parallel/sharding (SMP)**: the model and optimizer state are divided among GPUs. It solves an **OOM (the model does not fit)** problem.
- Exam mapping: "slow, large data" → data parallel / "OOM, billions of parameters" → model parallel. **Solving OOM by adding GPUs is the wrong answer.**
- Look at the infrastructure too — inter-node communication uses **EFA**, and data supply uses **FSx for Lustre**.

## Data Parallel vs Model Parallel

When the model does not fit on one machine, or the data is so large that one GPU would take days, you split training across several machines and GPUs. First, clearly distinguish the two paradigms.

| Aspect | Data Parallel | Model Parallel |
|------|---------------------------|---------------------------|
| What is split | Data (batch) is distributed per GPU | The model itself is divided across GPUs |
| What each GPU holds | A full copy of the model | Some layers/parameters of the model |
| Problem it solves | Training speed (throughput) | The model does not fit in one GPU's memory |
| Synchronization | Gradients averaged with all-reduce | Activations and gradients passed between stages |
| Typical situation | Lots of data, and the model fits on the GPU | Very large models (billions of parameters) |

- Core intuition: **use data parallel "when the model fits but it is slow," and model parallel "when the model itself does not fit."**
- Exam keywords "out of memory / the model is too large" → model parallel. "Training takes too long / the data is large" → data parallel.

### What Fills GPU Memory

To understand "does not fit" precisely, you need to know what occupies GPU memory. Counting only the parameters leads to a wrong judgment.

| What occupies it | Description | Which parallelism reduces it |
|------------|------|---------------------|
| Parameters (weights) | The model itself | Tensor/pipeline parallel, parameter sharding |
| Gradients | Needed again at the same size as the parameters | Gradient sharding |
| Optimizer state | Adam-family optimizers hold extra state such as momentum | Optimizer state sharding |
| Activations | Grow in proportion to batch and sequence length | Smaller batch, activation checkpointing |

- **Data parallel reduces none of these** — because a full copy is loaded onto every GPU as is. That is why data parallel is powerless against OOM.
- Low-cost ways to cut memory right away: **mixed precision**, **smaller batch + gradient accumulation**, **activation checkpointing** (more computation, less memory).

> 💡 **Related theory**: The mathematical basis of data parallel is the linearity of the mini-batch gradient. The gradient of the full batch equals the average of the partial-batch gradients each GPU computes. So if each GPU processes a partial batch with its model copy and then the gradients are summed and averaged with all-reduce, the update is mathematically equivalent to processing a large batch on one machine. Model parallel is different. Because it cuts the computation graph itself, and one GPU's output (activations) becomes the next GPU's input, the dependencies and communication cost between GPUs are inherently larger.

## Data Parallel: Increase Throughput

Data parallel is the most common distribution method. Each GPU (or machine) holds a full copy of the model, performs forward/backward on a different slice of data, and then the gradients are gathered and averaged.

```
[GPU 0]  batch slice 0  →  gradient g0  ┐
[GPU 1]  batch slice 1  →  gradient g1  ├─ all-reduce → average ḡ → all GPUs updated identically
[GPU 2]  batch slice 2  →  gradient g2  ┘
```

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',
    instance_type='ml.p4d.24xlarge',
    instance_count=2,                       # multiple machines
    framework_version='2.0', py_version='py310',
    distribution={                          # enable SageMaker data parallel
        'smdistributed': {'dataparallel': {'enabled': True}}
    }
)
```

**SageMaker Distributed Data Parallel (SMDDP)** provides an all-reduce optimized for the AWS network (EFA and so on), so its communication efficiency is better than standard PyTorch DDP. Increasing data parallelism raises throughput almost linearly, but because of communication overhead it is not linear forever.

### Choosing a Data Parallel Backend

Even for the same data parallelism, SageMaker lets you choose among several backends through the `distribution` argument.

| Backend | `distribution` setting | Characteristics |
|--------|--------------------|------|
| SMDDP | `{'smdistributed': {'dataparallel': {'enabled': True}}}` | All-reduce optimized for the AWS network. Excellent communication efficiency on supported instances |
| PyTorch native distributed | `{'torch_distributed': {'enabled': True}}` | Standard `torch.distributed`. Good code portability and works well with FSDP too |
| MPI (Horovod, etc.) | `{'mpi': {'enabled': True, 'processes_per_host': 8}}` | Framework neutral. When moving existing Horovod code over as is |

**Exam perspective**: if you see the phrase "a distributed training library optimized for AWS infrastructure," it is SMDDP. Conversely, "almost as is with existing code" points to native distributed/MPI.

### What Follows When the Batch Gets Bigger

| Observation | Cause | Action |
|------|------|------|
| Accuracy dropped after raising GPUs 8x | The effective batch is 8x → the learning rate is relatively too small | Learning-rate scaling (linear scaling, etc.) + warmup |
| Diverges in the first few steps | Initial instability from a large batch + large learning rate | Add a learning-rate warmup period |
| GPUs doubled but speed only 1.2x | All-reduce communication overhead dominates | EFA-capable instances, prefer GPUs per node over the number of nodes |
| Memory to spare but throughput is low | The GPU is waiting for data | Data-loading bottleneck — FSx cache, more workers |

> ⚠️ **Pitfall**: When you raise the number of GPUs N-fold with data parallel, the effective batch size also becomes N times larger. If you leave the learning rate as is, convergence may get worse, so you usually adjust the learning rate together (for example, linear scaling). The exam targets the misconception that "just adding GPUs automatically trains better."

## Model Parallel: Split the Model

Model parallel is used when the model itself does not fit in one GPU's memory. Giant language models with billions to hundreds of billions of parameters are the typical case. Model parallel has two flavors.

- **Tensor/pipeline partitioning**: place the layers across several GPUs. One GPU's output becomes the next GPU's input (pipeline parallel), or the tensor operation of a single layer itself is split (tensor parallel).
- **Sharding**: store the optimizer state, gradients, and parameters distributed among GPUs to save memory (the ZeRO/FSDP family).

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

**SageMaker Distributed Model Parallel (SMP)** automates model partitioning, pipeline execution, and sharding. Even if the user does not place layers on GPUs by hand, the library sets a partitioning strategy to fit memory.

### The Four Parallel Axes at a Glance

Large-scale training in practice combines the axes below. What each axis "splits and what it gains" is the distinguishing point on the exam.

| Parallel axis | What is split | What it gains | Communication burden |
|---------|-----------|--------|----------|
| Data parallel | Batch (data) | Throughput | Gradient all-reduce every step |
| Tensor parallel | Tensor operations of one layer | Memory per GPU ↓ | Very large → used within a node (NVLink) |
| Pipeline parallel | Groups of layers (stages) | Memory per GPU ↓ | Activations passed between stages. Bubbles (idle time) occur |
| Sharding (ZeRO/FSDP family) | Parameters, gradients, optimizer state | Memory per GPU ↓↓ | Communication to gather and scatter parameters when needed |

```text
Hybrid parallelism — match the communication cost to the topology

 Node 0 [GPU0 GPU1 GPU2 GPU3]  ← within a node: tensor/pipeline parallel (fast NVLink)
    │
   EFA  ← between nodes: data parallel (relatively slow network, all-reduce only)
    │
 Node 1 [GPU0 GPU1 GPU2 GPU3]
```

**Concept: sharding is "an exchange of memory for communication."** If you split the parameters into pieces per GPU, memory shrinks a lot in normal times, but just before computing you must gather the needed pieces, and scatter them again afterward. So the higher the sharding stage (optimizer state only → + gradients → + parameters), the more memory shrinks and the more communication grows. It is not "the strongest sharding is best" — **the weakest sharding at which the model still fits** is usually the fastest.

The core trade-off when splitting a giant model is "memory savings vs communication cost." The finer you split the model, the less memory per GPU, but the more activations and parameters are sent between GPUs, and it gets slower. So in practice "hybrid parallelism" that combines data parallel, tensor parallel, pipeline parallel, and sharding is used. For example, tensor parallel within a node (fast NVLink) and data parallel between nodes (a relatively slow network), matching the communication pattern to the topology.

## Large-Scale Training Infrastructure

Distributed training performance is determined not only by the algorithm but by the infrastructure.

- **EFA (Elastic Fabric Adapter)**: a low-latency, high-bandwidth network between nodes. It reduces the all-reduce communication bottleneck of distributed training. Enabled on GPU instances such as p4d/p5.
- **FSx for Lustre**: a high-throughput parallel file system. It supplies large training data to the GPUs faster than S3, reducing the data-loading bottleneck.
- **Instance selection**: with a multi-GPU single node (for example p4d.24xlarge = 8 GPUs), NVLink within the node is fast. If you use several nodes, communication between nodes goes over EFA.

```
S3 (source data)
   └─ FSx for Lustre (high-speed cache) → quickly supplies multiple training nodes
Training nodes ── EFA (low-latency network) ── all-reduce / model-parallel communication
```

Where you intervene differs depending on where the bottleneck is.

| Bottleneck symptom | Real cause | Where to intervene |
|-----------|----------|--------|
| GPU utilization is high but it does not scale | All-reduce communication between nodes | EFA-capable instances, increase GPUs per node instead of the node count |
| GPU utilization is low and uneven | Data supply cannot keep up | FSx for Lustre cache, more loader workers, prefetch |
| Tens of minutes of waiting at every training start | File mode copies all the large data | FastFile/Pipe mode or FSx |
| Long training is lost entirely midway | Node failure, Spot interruption | Checkpoints periodically to S3, resume logic |

**Concept: scaling efficiency.** If throughput becomes N times when you raise the GPUs N-fold, the efficiency is 100%. In reality, because of communication and synchronization it is always below 100%, and it drops as you add nodes. That is why "one node with 8 GPUs" is generally faster than "four nodes with 2 GPUs each" — even with the same GPU count, communication within a node (NVLink) is much faster than communication between nodes. The order is **first make the node bigger, then add more nodes**.

A research team tried to train a 7-billion-parameter model on a single ml.g5 instance and hit GPU OOM. Adding nodes with data parallel was no use, because each replica still did not fit on one GPU. When they used SMP's model parallel plus sharding to distribute the parameters and optimizer state across the GPUs, it fit in memory, and by adding EFA between nodes and FSx for Lustre for data supply they cut the training time substantially. Lesson: OOM is solved with model parallel, not with adding GPUs (data parallel).

## Survivability of Long-Running Training

Because distributed training runs for a long time, "what happens if it dies midway" governs the cost in practice.

```python
estimator = PyTorch(
    entry_point='train.py', source_dir='src', role=role,
    framework_version='2.0', py_version='py310',
    instance_type='ml.p4d.24xlarge', instance_count=4,
    distribution={'torch_distributed': {'enabled': True}},
    checkpoint_s3_uri='s3://my-bucket/ckpt/',   # sync the container's checkpoint path with S3
    use_spot_instances=True,
    max_run=86400,
    max_wait=172800,
)
```

- Make **only rank 0 (the representative process)** save the checkpoint so that the files do not overwrite each other.
- If the save interval is too frequent, that itself becomes a bottleneck — decide it by looking at the training time and the loss you can tolerate.
- If you repeat long-term training on tens of machines, consider a persistent cluster option such as **SageMaker HyperPod** (aimed at automatic node replacement and resumption on node failure).

## How to Choose

```text
Does one model replica fit on 1 GPU?
 ├─ It fits
 │    ├─ But it is slow / the data is large   → data parallel (SMDDP, torch_distributed)
 │    └─ Data supply cannot keep up           → FSx for Lustre + loader workers, prefetch
 └─ It does not fit (OOM)
      ├─ Slightly short                      → mixed precision · smaller batch + gradient accumulation · activation checkpointing
      ├─ Very short                          → sharding (ZeRO/FSDP) → tensor/pipeline parallel (SMP)
      └─ Not covered even with several nodes → hybrid parallel + EFA
```

- "Faster" → data parallel. "Does not fit" → model parallel. This one line is the key to answering on the exam.
- A choice that adds GPUs for OOM, and a choice that turns on model parallel for slow training, are both wrong-answer patterns.

In the next lesson we look at debugging and profiling, which examine whether training is running well and where it slows down or breaks.

## 📖 Glossary

- **Distributed training**: Splitting training that one machine cannot handle across several GPUs and machines.
- **Data parallel**: A way of splitting the data and training the same model replica on each GPU. It gets faster, but memory does not shrink.
- **Model parallel**: A way of placing the model itself across several GPUs. Used to train a model that does not fit on one GPU.
- **all-reduce**: A communication operation in which the values each GPU computed are exchanged and combined into one (usually averaged), so that everyone ends up with the same result.
- **Sharding**: Splitting parameters, gradients, and optimizer state into pieces and keeping them across GPUs. Memory shrinks and communication grows.
- **Effective batch size**: Batch per GPU × number of GPUs. The total number of samples actually used for one update.
- **Gradient accumulation**: A technique that gathers the gradients of several small batches and updates once. It gives the effect of a large batch without increasing memory.
- **Activation checkpointing**: A technique that discards intermediate forward-pass results and recomputes them during backpropagation. It spends more computation and saves memory.
- **EFA / FSx for Lustre**: EFA is a low-latency, high-bandwidth network interface between nodes that reduces the communication bottleneck of distributed training. FSx for Lustre is a high-performance parallel file system that quickly supplies S3 data to multiple training nodes.
- **Scaling efficiency**: The ratio of how many times the real throughput becomes when you raise the GPUs N-fold. Because of communication it always falls short of N times.

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
