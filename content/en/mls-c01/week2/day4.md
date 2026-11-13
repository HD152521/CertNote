# Day 4 - Optimizing Training Data Storage and Access: Pipe Mode vs File Mode, FSx for Lustre, and Distributed Training

## 📌 Key Takeaways

- Even with well-prepared data, **if reads are slow the GPU sits idle**. I/O bottlenecks are the most expensive waste in practice.
- The tradeoff among **File** (download everything, then start) / **Pipe** (streaming, starts immediately) / **FastFile** (streaming + POSIX access) is **startup delay vs random-access flexibility**.
- **FSx for Lustre** pays off when the workload is large + repeatedly read + low latency + distributed. It is overkill for one-off, small jobs.
- Distributed training is split into **data parallelism** (replicate the model, split the data) and **model parallelism** (split the model itself).
- `ShardedByS3Key` only works when **the data is split across multiple S3 objects**. It has no effect on a single giant file.

## SageMaker Input Modes

There are several ways for a SageMaker training job to bring data from S3 into the container. "How do you stream the data into the training container" directly affects performance and cost.

### File Mode (Default)

**Downloads all of the S3 data to the container's EBS volume before training starts**, and only then begins training.

- Pros: Simple and stable. You handle the data like local files. Good for reading repeatedly over multiple epochs.
- Cons: If the data is large, **training does not start until the download finishes** (startup delay). The EBS capacity must be at least the size of the dataset.

### Pipe Mode

Instead of downloading in advance, it **streams directly from S3** during training.

- Pros: There is no download wait, so **training starts immediately**. It is free of disk capacity limits and can handle datasets larger than the disk. Throughput is high on large data.
- Cons: Because it is a sequential stream, random access is hard, and it usually requires a specific format such as RecordIO/protobuf.

### FastFile Mode

A relatively newer mode that is a **compromise** between File mode's ease of use (access like POSIX files) and Pipe mode's immediate start. It fetches files by streaming when needed but lets you treat them like local files. Because it allows random access without waiting for a full download, it is often recommended for large datasets.

```python
# Specify the input mode in a SageMaker Estimator (conceptual example)
from sagemaker.estimator import Estimator
from sagemaker.inputs import TrainingInput

estimator = Estimator(
    image_uri=image,
    role=role,
    instance_count=1,
    instance_type="ml.p3.2xlarge",
    input_mode="Pipe",   # "File" | "Pipe" | "FastFile"
)

train_input = TrainingInput(
    s3_data="s3://ml-train/clicks/",
    input_mode="FastFile",   # the mode can be specified again per input
)
estimator.fit({"train": train_input})
```

File mode is "download everything, then start," and Pipe mode is "start while downloading." The key tradeoff is **startup delay vs random-access flexibility**. If the data is hundreds of GB to TB and you worry about startup delay and disk cost, Pipe is better; if the data is small and read often and flexibly, File is better.

> ⚠️ **Trap**: The simplification "Pipe mode is always faster" is dangerous. Pipe is a sequential stream, so random access and shuffling are difficult and it requires a specific format. For small data or data that needs random access, File/FastFile is actually the better fit. You must weigh **data size, access pattern, and format** together.

## FSx for Lustre — An Ultra-High-Performance Training File System

When you want to cut the latency of direct S3 access even further for large-scale, repeated training, use **Amazon FSx for Lustre**. Lustre is a parallel file system for HPC (high-performance computing) that provides very high throughput and low latency.

Key features:

- **S3 integration**: When you link FSx for Lustre to an S3 bucket, the data is loaded and synchronized automatically. S3 acts as the durable store, and FSx acts as a high-speed cache and workspace.
- **Strong for repeated training**: When the same data is read repeatedly across multiple epochs and multiple jobs, it is read quickly from FSx instead of being fetched from S3 each time.
- **Shared storage for distributed training**: Multiple training nodes read the same file system at high speed at the same time.

The classic situation where FSx for Lustre shines is when (1) the dataset is large, (2) it is read **repeatedly** across multiple training jobs and epochs, and (3) low latency matters. For one-off or small training jobs, direct S3 access (File/FastFile) is enough, and FSx's extra cost and setup are not justified.

| Option | Characteristics | Good fit |
|---|---|---|
| File mode | Download everything, then start | Small scale, repeated reads, simplicity first |
| Pipe mode | S3 streaming, starts immediately | Very large data, sequential processing, saving disk |
| FastFile mode | Streaming + POSIX access | Large data + convenient random access |
| FSx for Lustre | Ultra-fast parallel FS, S3 integration | Large scale + repeated + low latency + distributed |
| EFS | Managed NFS, multiple mounts | General-purpose data shared by notebooks and jobs |

## Data Sharding and Distributed Training

When the data or the model does not fit on one machine, you use **distributed training**. The key is how you divide the work across multiple nodes.

### Data Parallelism vs Model Parallelism

| Type | What is split | When to use | Communication between nodes |
|---|---|---|---|
| **Data parallelism** | Split the data and replicate the model | Most cases, when the data is large | Gradient synchronization |
| **Model parallelism** | Split the model itself | When the model does not fit in GPU memory (large language models, etc.) | Passing activations between layers |

```
[Data parallelism]
 Data    ┌── Shard 1 ──▶ GPU1 (model replica) ─┐
        ├── Shard 2 ──▶ GPU2 (model replica) ─┼─▶ Gradient sync ─▶ Weight update
        ├── Shard 3 ──▶ GPU3 (model replica) ─┤
        └── Shard 4 ──▶ GPU4 (model replica) ─┘

[Model parallelism]
 Batch ──▶ GPU1(layers 1-4) ──▶ GPU2(layers 5-8) ──▶ GPU3(layers 9-12) ──▶ Output
```

### Sharding (ShardedByS3Key)

In data-parallel training, it is efficient for each node to read **only its own share** of the data. SageMaker controls this with `S3DataDistributionType`.

- **FullyReplicated (default)**: Every instance receives the entire dataset.
- **ShardedByS3Key**: Splits the S3 objects (files) across instances so each gets **only its own share**. In data-parallel training this removes duplicate downloads and duplicate processing, improving efficiency.

```python
# Specify sharding in distributed data-parallel training (conceptual example)
train_input = TrainingInput(
    s3_data="s3://ml-train/clicks/",
    distribution="ShardedByS3Key",   # each instance receives only part of the data
)
estimator = Estimator(
    image_uri=image, role=role,
    instance_count=4,                # distributed across 4 nodes
    instance_type="ml.p3.16xlarge",
)
estimator.fit({"train": train_input})
```

For ShardedByS3Key to be effective, the data must be **split into multiple S3 objects (files)**. A single giant file cannot be split at the object level, so sharding has no effect at all. Therefore, for large data it is distributed-training friendly to pre-split it into multiple moderately sized files (for example, hundreds of Parquet/RecordIO shards).

> ⚠️ **Trap**: If you also split the validation set with `ShardedByS3Key`, each node sees different validation data and the metrics become inconsistent. The validation channel is usually correct with `FullyReplicated`.

## When You Actually Turn On Distributed Training

Distribution is not free. Adding nodes adds communication cost, and speed does not increase linearly with the number of nodes.

- **SageMaker distributed libraries**: Separate libraries are provided for data parallelism and model parallelism, so you can turn on distribution without changing the framework code much.
- **Batch size and learning rate**: If you increase nodes by N times, the effective batch size also becomes N times. If you do not adjust the learning rate along with it, convergence gets worse.
- **Communication bottleneck**: Gradient synchronization happens at every step, so network bandwidth between nodes matters. If adding nodes actually makes training slower, suspect communication.
- **Checkpoints**: Long training runs must save intermediate checkpoints to S3. In particular, with managed Spot training you can resume from the checkpoint after an interruption.

| Situation | Choice |
|---|---|
| The data is so large that one epoch takes too long | Data parallelism + sharding |
| The model does not fit in a single GPU's memory | Model parallelism |
| Training is long and you want to cut cost | Managed Spot training + checkpoints |
| Adding nodes does not make it faster | Check for communication/I/O bottlenecks |

A setup that runs long training on Spot instances without checkpoints starts over from the beginning when interrupted. Remember "cost savings" and "checkpoints" as a pair.

## The Order for Diagnosing an I/O Bottleneck

When a scenario says "training is slow," suspect the supply side first, not the computation.

1. **Is GPU utilization low?** → If it is low, the bottleneck is the data supply, not the computation.
2. **Does it take long to start?** → Likely the wait for the full download in File mode. Consider Pipe/FastFile.
3. **Is the same data read repeatedly?** → Get the caching benefit with FSx for Lustre.
4. **Are there too many small files?** → Consolidate them into shards to reduce request overhead.
5. **Is each node receiving everything?** → Distribute with `ShardedByS3Key`.

> 🎯 **Scenario**: "We train data-parallel on several TB of data across 8 GPU nodes, but each node receives the entire dataset, so startup is too slow." → Split the data into multiple files and use `ShardedByS3Key` so each node receives only its own share. Duplicate downloads and duplicate processing disappear. If there are many repeated reads, attach FSx for Lustre as shared storage to cut latency further.

## Instance Choice Is Also Part of Data Supply

The same data strategy gives different results depending on the instance type.

| Instance family | Nature | Typical use |
|---|---|---|
| `ml.m5` / `ml.c5` | General-purpose / compute-optimized CPU | Preprocessing, light training, batch transform |
| `ml.r5` | Memory-optimized | Preprocessing large DataFrames, memory-intensive work |
| `ml.p3` / `ml.p4d` | GPU | Deep learning training, large-scale distributed |
| `ml.g5` | Inference-friendly GPU | Inference, light training |
| `ml.inf` family | Inference-only accelerator | Cost optimization for high-volume inference |

- GPU instances have a high hourly cost, so **idle time is a direct loss**. That is why I/O optimization is cost optimization.
- The standard approach is to separate them: run preprocessing as a separate job on CPU instances and use GPU instances only for training.

"Training is slow, so let's switch to a bigger GPU" is only right when GPU utilization is already high. If utilization is low and you only enlarge the GPU, the idle time just gets more expensive.

Tomorrow we tie all of Week 2 (transformation, pipelines, augmentation, storage optimization) together in a comprehensive review.

## 📖 Glossary

- **Input mode**: The way S3 data is brought into the training container. File, Pipe, FastFile.
- **Startup delay**: The time a training job spends preparing data before it actually begins computing.
- **POSIX access**: An access style where, as with a normal file system, you open by path and read at arbitrary positions.
- **FSx for Lustre**: A parallel file system for HPC. It uses S3 as the backend and behaves like a high-speed cache.
- **Data parallelism**: A method that replicates the model, splits the data for training, and then synchronizes the gradients.
- **Model parallelism**: A method that splits the model itself across multiple GPUs. Used for large models.
- **Gradient synchronization**: The process of combining the gradients each node computed so that all nodes have the same weights. It incurs communication cost.
- **ShardedByS3Key**: A distribution setting that splits S3 objects across instances so each receives only a different piece.
- **FullyReplicated**: The default distribution setting where every instance receives the entire data identically.
- **Checkpoint**: A saved snapshot of the model state during training. It lets you resume training after an interruption.

## 📝 Practice Questions

**Question 1.** You are using hundreds of GB of training data and want to reduce the wait for the full download before training starts and the EBS disk cost. You do not need much random access. Which input mode is most suitable?

A) Pipe mode  
B) File mode  
C) Upload from a local notebook  
D) Read directly from DynamoDB  

**Answer: A**  
Explanation: Pipe mode streams data from S3, so training starts immediately without a download wait and is free of disk capacity limits, making it suitable for processing very large data sequentially. File mode (B) waits for the full download, which means a large startup delay and disk cost, and C and D are inappropriate ways to supply large-scale training data.

---

**Question 2.** Which mode is suitable when you want a compromise between File mode's POSIX file access convenience and Pipe mode's immediate-start advantage, so that you stream a large dataset yet still access it randomly like local files?

A) File mode  
B) Pipe mode  
C) FastFile mode  
D) Batch mode  

**Answer: C**  
Explanation: FastFile mode fetches files by streaming when needed but allows POSIX access like local files, so it supports random access without waiting for a full download and is often recommended for large datasets. File (A) requires a full download, Pipe (B) makes random access difficult, and Batch mode (D) is not a SageMaker training input mode.

---

**Question 3.** Which is the most correct situation in which Amazon FSx for Lustre is especially advantageous for accessing training data?

A) A small, one-off training job that reads the data only once  
B) A simple function that reads one line of text  
C) Inference that reads no data at all  
D) Distributed training that repeatedly reads large data across multiple epochs and multiple jobs, where low latency matters  

**Answer: D**  
Explanation: FSx for Lustre is a parallel file system with throughput on the order of hundreds of GB/s and sub-millisecond latency, and it delivers value in distributed training that repeatedly reads large data, is shared by multiple nodes, and cares about low latency. One-off, small training (A) is fine with direct S3 access, and for B and C the data access itself is negligible, so FSx is not justified.

---

**Question 4.** When doing data-parallel training on 4 nodes, which distribution setting in SageMaker makes each node receive only its own share instead of downloading the entire data redundantly?

A) FullyReplicated  
B) ShardedByS3Key  
C) FileMode only  
D) SingleRecord  

**Answer: B**  
Explanation: ShardedByS3Key divides the S3 objects by the number of instances so each instance receives only part of the data, which prevents duplicate downloads and duplicate processing in data-parallel training. FullyReplicated (A) gives every instance the entire data, causing duplication, and C and D have nothing to do with how data is distributed.

---

**Question 5.** What is the most correct precondition for ShardedByS3Key sharding to actually be effective?

A) The data must be one giant single file  
B) The data must be split into multiple S3 objects (files)  
C) You must use only model parallelism  
D) The input mode must be File mode  

**Answer: B**  
Explanation: ShardedByS3Key splits at the S3 object level, so the data must be split into multiple files for it to be distributed across instances and take effect. A single giant file (A) cannot be split at the object level, so sharding has no effect. Sharding is used in data parallelism, so it is not exclusive to model parallelism (C), and it is not tied to a particular input mode (D).

---
