# Day 4 - Data Storage and Access Optimization: Pipe vs File Mode, FSx for Lustre, Distributed Training

Even if data is well prepared, if the training job reads that data **slowly**, the GPU sits idle waiting for data. Expensive GPU instances becoming idle due to I/O bottlenecks is one of the most common and costly wastes in practice. Therefore, "how data is streamed to the training container" directly impacts performance and cost.

Today, we cover SageMaker's **input modes (Pipe vs File vs FastFile)**, the high-performance file system **FSx for Lustre**, and the **data sharding** concept for distributed training.

## SageMaker Input Modes

SageMaker training jobs have multiple modes for bringing data from S3 to the container.

### File Mode (Default)

**S3 data is completely downloaded to the container's EBS volume before training starts**, then training begins.

- Advantages: Simple and stable. Treats data like local files. Favorable for repeated reads across multiple epochs.
- Disadvantages: If data is large, **training cannot start until download completes** (startup delay). EBS capacity must be at least the size of the dataset.

### Pipe Mode

Data is not pre-downloaded; instead, it is **streamed directly from S3** during training.

- Advantages: No download waiting, so **training starts immediately**. Free from disk capacity constraints, and datasets can be larger than disk. High throughput with large data.
- Disadvantages: Data received as sequential stream makes random access difficult, and specific formats like RecordIO/protobuf are usually required.

> 💡 **Related Theory**: File mode is "receive all then start," Pipe mode is "start while receiving." The core trade-off is **startup delay vs random access flexibility**. For datasets hundreds of GB~TB in size where startup delay and disk cost are concerns, Pipe mode is better; for small data with frequent flexible reads, File mode is better.

### FastFile Mode

A relatively newer mode that **compromises between File mode's ease of use (POSIX file-like access) and Pipe mode's immediate start**. Files are streamed on demand but handled like local files. It enables random access without waiting for full download, making it frequently recommended for large datasets.

```python
# Specifying input mode in SageMaker Estimator (conceptual example)
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
    input_mode="FastFile",   # mode can be re-specified per input
)
estimator.fit({"train": train_input})
```

> ⚠️ **Pitfall**: The simplification "Pipe mode is always faster" is risky. Pipe mode is a sequential stream, making random access and shuffling difficult, and requires specific formats. For small datasets or those needing random access, File/FastFile is actually more appropriate. Data size, access patterns, and format must all be considered.

## FSx for Lustre — Ultra-High-Performance Training File System

When wanting to further reduce S3 direct access latency in large-scale or repeated training, use **Amazon FSx for Lustre**. Lustre is a parallel file system for HPC (High Performance Computing), providing **hundreds of GB/s throughput and sub-millisecond latency**.

Key characteristics:
- **S3 integration**: Connecting FSx for Lustre to an S3 bucket automatically loads and syncs data. S3 serves as permanent storage, FSx as a high-speed cache and work space.
- **Strong for repeated training**: When reading the same data repeatedly across multiple epochs and multiple jobs, read quickly from FSx instead of fetching from S3 each time.
- **Shared storage for distributed training**: Multiple training nodes simultaneously read from the same file system at high speed.

> 💡 **Related Theory**: FSx for Lustre shines in typical situations where (1) the dataset is large, (2) it is read **repeatedly** in multiple training jobs and epochs, and (3) low latency is important. For one-time or small-scale training, direct S3 access (File/FastFile) is sufficient, and FSx's additional cost and configuration is not justified.

| Option | Characteristics | Best For |
|--------|-----------------|----------|
| File mode | Full download then start | Small data, repeated reads, simplicity priority |
| Pipe mode | S3 streaming, immediate start | Very large data, sequential processing, disk saving |
| FastFile mode | Streaming + POSIX access | Large data + random access convenience |
| FSx for Lustre | Ultra-fast parallel FS, S3 integration | Large scale + repeated + low latency + distributed |

## Data Sharding and Distributed Training

When data or models are too large for a single machine, **distributed training** is performed. The key is how to divide data among multiple nodes.

### Data Parallelism vs Model Parallelism

- **Data parallelism**: Model replicas are placed on multiple GPUs/nodes, **data is sharded**, each trains on different batches, then gradients are synchronized. Most common approach.
- **Model parallelism**: When the model itself doesn't fit in a single GPU's memory, **the model is split across multiple GPUs** (large language models, etc.).

### Sharding (ShardedByS3Key)

In data-parallel training, it's efficient for each node to read **only its own portion of the dataset**. SageMaker controls this with `S3DataDistributionType`.

- **FullyReplicated (default)**: All instances receive the entire dataset.
- **ShardedByS3Key**: S3 objects (files) are divided among instances; each instance receives **only its share**. In data-parallel training, this eliminates redundant downloads and processing, improving efficiency.

```python
# Specifying sharding in distributed data-parallel training (conceptual example)
train_input = TrainingInput(
    s3_data="s3://ml-train/clicks/",
    distribution="ShardedByS3Key",   # each instance receives only a portion of data
)
estimator = Estimator(
    image_uri=image, role=role,
    instance_count=4,                # distributed across 4 nodes
    instance_type="ml.p3.16xlarge",
)
estimator.fit({"train": train_input})
```

> 💡 **Related Theory**: For ShardedByS3Key to be effective, data must be **divided into multiple S3 objects (files)**. A single massive file cannot be sharded at the object level, so sharding has no effect. Therefore, for large-scale data, pre-dividing into appropriately sized multiple files (e.g., hundreds of Parquet/RecordIO shards) is distributed-training-friendly.

> 🎯 **Scenario**: "Training several TBs of data across 8 GPU nodes with data parallelism. Each node receives all data, making startup too slow." → Divide data into multiple files and use `ShardedByS3Key` so each node receives only its share; redundant downloads and processing disappear. If there's much repeated reading, attach FSx for Lustre as shared storage to further reduce latency.

## Summary

Today we learned how to efficiently supply data to training. **File mode downloads fully then starts (small data, simplicity), Pipe mode streams immediately (very large data, sequential), FastFile mode compromises (streaming + POSIX access)**. For large-scale, repeated, low-latency, distributed training, **FSx for Lustre** is powerful as a high-speed cache integrated with S3. In distributed data-parallel training, divide data into multiple files and distribute across nodes with **ShardedByS3Key** to eliminate redundancy. The key is ensuring expensive GPUs don't sit idle waiting for I/O.

Tomorrow we will review all of Week 2 (transformation, pipelines, augmentation, storage optimization) as one integrated whole.

---

## 📝 Practice Questions

**Question 1.** You are using hundreds of GB of training data and want to reduce the wait time for downloading everything before training starts and the EBS disk cost. Random access is not really needed. Which input mode is MOST appropriate?

A) Pipe mode  
B) File mode  
C) Upload from a local laptop  
D) Read directly from DynamoDB  

**Answer: A**  
Explanation: Pipe mode streams data from S3 so training starts immediately without waiting for a download and is free from disk capacity constraints, making it suitable for sequentially processing very large data. File mode (A) waits for a full download, so start-up delay and disk cost are high, and C and D are inappropriate ways to supply large-scale training data.

---

**Question 2.** Which mode is appropriate when you want a compromise between the POSIX file access convenience of File mode and the immediate start advantage of Pipe mode, streaming a large dataset while still accessing it randomly like local files?

A) File mode  
B) Pipe mode  
C) FastFile mode  
D) Batch mode  

**Answer: C**  
Explanation: FastFile mode fetches files by streaming when needed while allowing POSIX access like local files, supporting random access without waiting for a full download, so it is often recommended for large datasets. File (A) requires a full download, Pipe (B) makes random access difficult, and Batch mode (D) is not a SageMaker training input mode.

---

**Question 3.** Which is the most correct situation in which Amazon FSx for Lustre is especially advantageous for training data access?

A) Small one-off training that reads the data only once  
B) A simple function that reads one line of text  
C) Inference that reads no data at all  
D) Distributed training that repeatedly reads large-scale data across many epochs and multiple jobs and where low latency is important  

**Answer: D**  
Explanation: FSx for Lustre is a parallel file system with hundreds of GB/s of throughput and sub-millisecond latency, and it is valuable for distributed training that repeatedly reads large-scale data, is shared by multiple nodes, and requires low latency. One-off, small-scale training (A) is well served by direct S3 access, and for B and C data access itself is negligible, so FSx is not justified.

---

**Question 4.** When doing data-parallel training on 4 nodes, which distribution setting in SageMaker do you use so that each node receives only its own share rather than downloading the entire dataset redundantly?

A) FullyReplicated  
B) ShardedByS3Key  
C) FileMode only  
D) SingleRecord  

**Answer: B**  
Explanation: ShardedByS3Key divides the S3 objects by the number of instances so that each instance receives only part of the data, preventing duplicate downloads and duplicate processing in data-parallel training. With FullyReplicated (A), every instance receives the entire dataset, causing duplication, and C and D are unrelated to the data distribution method.

---

**Question 5.** What is the most correct precondition for ShardedByS3Key sharding to actually be effective?

A) The data must be a single huge file  
B) The data must be split into multiple S3 objects (files)  
C) Only model parallelism must be used  
D) The input mode must be File mode  

**Answer: B**  
Explanation: ShardedByS3Key divides by S3 object, so the data must be split into multiple files to be distributed per instance and be effective. A single huge file (A) cannot be split by object, so sharding has no effect. Sharding is used in data parallelism, so it is not exclusive to model parallelism (C), nor is it tied to a specific input mode (D).

---
