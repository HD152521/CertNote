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

## 📝 연습 문제

**문제 1.** 수백 GB의 학습 데이터를 사용하는데, 학습 시작 전 전체 다운로드 대기 시간과 EBS 디스크 비용을 줄이고 싶다. 임의 접근은 크게 필요 없다. 가장 적합한 입력 모드는?

A) Pipe mode  
B) File mode  
C) 로컬 노트북 업로드  
D) DynamoDB 직접 읽기  

**정답: A**  
해설: Pipe mode는 S3에서 데이터를 스트리밍으로 흘려보내 다운로드 대기 없이 즉시 학습을 시작하고 디스크 용량 제약에서 자유로우므로, 매우 큰 데이터를 순차 처리할 때 적합하다. File mode(A)는 전체 다운로드를 기다려 시작 지연·디스크 비용이 크고, C·D는 대규모 학습 데이터 공급 방식으로 부적절하다.

---

**문제 2.** File mode의 POSIX 파일 접근 편의성과 Pipe mode의 즉시 시작 장점을 절충하여, 큰 데이터셋을 스트리밍하면서도 로컬 파일처럼 임의 접근하려는 경우 적합한 모드는?

A) File mode  
B) Pipe mode  
C) FastFile mode  
D) Batch mode  

**정답: C**  
해설: FastFile mode는 파일을 필요할 때 스트리밍으로 가져오되 로컬 파일처럼 POSIX 접근이 가능해, 전체 다운로드를 기다리지 않으면서 임의 접근도 지원하므로 큰 데이터셋에 자주 권장된다. File(A)은 전체 다운로드가 필요하고 Pipe(B)는 임의 접근이 어려우며, Batch mode(D)는 SageMaker 학습 입력 모드가 아니다.

---

**문제 3.** Amazon FSx for Lustre가 학습 데이터 접근에 특히 유리한 상황으로 가장 옳은 것은?

A) 한 번만 읽는 소규모 단발성 학습  
B) 텍스트 한 줄을 읽는 단순 함수  
C) 데이터를 전혀 읽지 않는 추론  
D) 대규모 데이터를 여러 epoch·여러 작업에서 반복 읽으며 저지연이 중요한 분산 학습  

**정답: D**  
해설: FSx for Lustre는 수백 GB/s급 처리량과 밀리초 이하 지연의 병렬 파일 시스템으로, 대규모 데이터를 반복적으로 읽고 여러 노드가 공유하며 저지연이 중요한 분산 학습에서 가치를 발한다. 단발성·소규모 학습(A)은 S3 직접 접근으로 충분하고, C·D는 데이터 접근 자체가 미미해 FSx가 정당화되지 않는다.

---

**문제 4.** 4개 노드로 데이터 병렬 학습을 하면서 각 노드가 전체 데이터를 중복 다운로드하지 않고 자기 몫만 받게 하려면 SageMaker에서 사용하는 분배 설정은?

A) FullyReplicated  
B) ShardedByS3Key  
C) FileMode only  
D) SingleRecord  

**정답: B**  
해설: ShardedByS3Key는 S3 객체들을 인스턴스 수만큼 나눠 각 인스턴스가 데이터의 일부만 받게 하므로, 데이터 병렬 학습에서 중복 다운로드·중복 처리를 막는다. FullyReplicated(A)는 모든 인스턴스가 전체 데이터를 받아 중복이 발생하고, C·D는 데이터 분배 방식과 무관하다.

---

**문제 5.** ShardedByS3Key 샤딩이 실제로 효과를 내기 위한 전제 조건으로 가장 옳은 것은?

A) 데이터가 하나의 거대한 단일 파일이어야 한다  
B) 데이터가 여러 개의 S3 객체(파일)로 분할되어 있어야 한다  
C) 모델 병렬만 사용해야 한다  
D) 입력 모드가 반드시 File mode여야 한다  

**정답: B**  
해설: ShardedByS3Key는 S3 객체 단위로 나누므로, 데이터가 여러 파일로 분할되어 있어야 인스턴스별로 분배되어 효과를 낸다. 단일 거대 파일(A)은 객체 단위로 쪼갤 수 없어 샤딩 효과가 없다. 샤딩은 데이터 병렬에서 쓰이므로 모델 병렬 전용(C)이 아니고, 특정 입력 모드(D)에 종속되지도 않는다.

---
