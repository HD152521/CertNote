# Day 2 - Data Storage for ML: S3, EFS, FSx for Lustre, and Data Formats

The most common reason GPUs sit idle during ML training is not that the model is slow — it is that **the data does not arrive on time**. The GPUs on an ml.p4d instance can consume several GB per second, and if storage cannot keep up, the expensive accelerators idle while waiting on I/O. That is why the Specialty exam asks "which data goes where, in which format" as a cost-versus-performance trade-off.

Today we cover (1) S3 as the center of the data lake, (2) EFS and FSx for Lustre for accelerating training I/O, and (3) ML-friendly formats like RecordIO and Parquet.

## S3: The Center of the ML Data Lake

Nearly all SageMaker training data starts in S3. S3 offers virtually unlimited capacity with eleven nines of durability, and SageMaker reads from it natively. The key is choosing the input mode — **how you stream data from S3 all the way to the GPU**.

| Input mode | Behavior | Best-fit situation |
|----------|------|------------|
| **File mode** | Copies the entire dataset to instance disk (EBS) before training | Small data, random access required |
| **Pipe mode** | Streams from S3, never lands on disk | Large data, sequential access, minimal startup delay |
| **FastFile mode** | On-demand, POSIX-like access to only the files needed | Large data where only part is read, or random access |

```python
from sagemaker.inputs import TrainingInput

# Pipe mode: stream instead of downloading everything → fast start on large data
train_input = TrainingInput(
    s3_data="s3://my-lake/features/train/",
    input_mode="Pipe",                 # File | Pipe | FastFile
    distribution="ShardedByS3Key",     # split the data across multiple instances
    content_type="application/x-recordio-protobuf",
)
estimator.fit({"train": train_input})
```

`distribution="ShardedByS3Key"` makes each instance in multi-instance distributed training read only a different slice of the data, eliminating duplication. `FullyReplicated` sends the entire dataset to every instance (suitable for small data and validation sets).

> 💡 **Related theory**: In File mode, the full copy must finish before the first training step runs. For hundreds of GB, that copy alone takes tens of minutes while expensive GPUs sit idle. Pipe mode starts training as soon as the first batch arrives, so **time-to-first-batch** is short. However, Pipe is a sequential stream, which makes full shuffling per epoch difficult, and the algorithm must support Pipe. FastFile is the compromise between the two: it supports random access while avoiding the full copy.

## EFS and FSx for Lustre: Accelerating Training I/O

S3 is object storage, so it cannot do directory operations or random reads as fast as a POSIX file system. When training must **repeat the same data over many epochs** or **randomly access many small files**, file system storage wins.

| Storage | Characteristics | Fitting ML scenarios |
|---------|------|-----------------|
| **EFS** | Managed NFS, shared across instances, elastic scaling | Medium-sized datasets shared by notebooks and multiple jobs |
| **FSx for Lustre** | High-performance parallel file system, S3 integration | Large-scale distributed training, high-throughput I/O demands |

The killer feature of FSx for Lustre is its **S3 repository integration**. It uses an S3 bucket as the backend, and FSx behaves like a high-performance cache. The data stays in S3 (cheap, durable), while training reads it at Lustre's hundreds of GB/s of throughput.

```python
from sagemaker.inputs import FileSystemInput

# Mount FSx for Lustre directly as training input
fsx_input = FileSystemInput(
    file_system_id="fs-0123456789abcdef0",
    file_system_type="FSxLustre",
    directory_path="/fsx/imagenet/train",
    file_system_access_mode="ro",
)
estimator.fit({"train": fsx_input})
```

> 💡 **Related theory**: When you repeat hyperparameter tuning (HPO) dozens to hundreds of times on the same dataset, the cost of downloading from S3 every time adds up. Upload it once to FSx for Lustre and every tuning job shares high-speed access, dramatically reducing overall time and cost. EFS has lower throughput than Lustre but is simpler to set up and good for durable sharing. The core decision rule: **repeated, high-throughput = Lustre; shared, general-purpose = EFS; one-off large-scale streaming = S3 Pipe**.

## Data Formats: RecordIO and Parquet

Feeding raw CSV, JSON, or images directly into training slows I/O down with parsing overhead and the small-files problem. ML favors two formats.

**RecordIO-protobuf**: The recommended format for SageMaker built-in algorithms. It packs many records into one large binary, optimal for sequential reads and Pipe-mode streaming.

```python
import io, numpy as np
import sagemaker.amazon.common as smac

# Serialize a numpy matrix to RecordIO-protobuf and upload to S3
buf = io.BytesIO()
smac.write_numpy_to_dense_tensor(buf, X_train.astype("float32"), y_train.astype("float32"))
buf.seek(0)

import boto3
boto3.client("s3").upload_fileobj(buf, "my-lake", "features/train/data.recordio")
```

**Parquet**: A columnar storage format. Storing by column rather than by row means (1) you read only the columns you need (projection pushdown), (2) per-column compression ratios are high, and (3) Athena, Glue, and Spark read it natively. It is the de facto standard for structured feature data.

```python
import pandas as pd
# Compared to CSV, Parquet gives column-selective reads + high compression → less ETL/analytics I/O
df.to_parquet("s3://my-lake/features/train.parquet", engine="pyarrow", compression="snappy")
# If training needs only some columns, scan just those → massive I/O reduction
cols = pd.read_parquet("s3://my-lake/features/train.parquet", columns=["age", "amount", "label"])
```

> 💡 **Related theory**: A row-based format (CSV) must read each row in its entirety, so even if you need only 3 of 50 columns, you scan them all. A columnar format (Parquet) stores each column separately, so you read only the 3 you need. Moreover, values in the same column share similar types and distributions, so they compress well. That is why Parquet is the frequent right answer for structured data analytics and ETL, and RecordIO-protobuf for large-scale sequential training with SageMaker built-in algorithms.

## The Small-Files Problem and Consolidation

Leaving millions of small images or JSON files as-is in S3 slows training due to per-object request overhead. The fix is **sharding**: merging small files into large bundles such as RecordIO, TFRecord, or tar. Make each bundle a few hundred MB so sequential I/O is efficient and it pairs well with Pipe mode.

## 📝 Practice Questions

**Question 1.** You are training 800GB of data across 4 ml.p3 instances in a distributed setup. To minimize the time GPUs sit idle waiting for data copies while having each instance read only a different slice of the data, what should you use?

A) Pipe mode + ShardedByS3Key  
B) File mode + FullyReplicated  
C) File mode + ShardedByS3Key  
D) FastFile mode + FullyReplicated  

**Answer: A**  
Explanation: Pipe mode streams without copying everything to disk, reducing time-to-first-batch and thus minimizing GPU idle time, while ShardedByS3Key has each instance read only a distinct slice, reducing duplication and memory. FullyReplicated sends the whole dataset to every instance and is inefficient, and File mode has a long initial copy for large data.

---

**Question 2.** You run 200 rounds of hyperparameter tuning on the same ImageNet dataset, and the repeated S3 download time is accumulating into significant cost. What is the most appropriate storage strategy?

A) Re-download every time in File mode  
B) Load it once into FSx for Lustre so all tuning jobs share high-speed access  
C) Shrink the dataset  
D) Increase the EBS volume size  

**Answer: B**  
Explanation: A high-throughput scenario where many jobs repeatedly use the same data is the flagship use case for FSx for Lustre. With S3 as the backend, Lustre acts like a high-speed cache and eliminates the repeated download cost. Re-downloading every time is the very cause of the problem, shrinking the data hurts quality, and expanding EBS does not solve the sharing/throughput problem.

---

**Question 3.** In a structured feature table with 50 columns, analytics and ETL read only 3-5 columns each time. Which format reduces both I/O and storage cost at once?

A) CSV  
B) Uncompressed JSON  
C) Parquet (columnar)  
D) Plain text  

**Answer: C**  
Explanation: Parquet is columnar, so it scans only the needed columns (projection pushdown), and similar values within a column give high compression ratios. CSV, JSON, and plain text are row-based, requiring reads of entire rows, and compress poorly.

---

**Question 4.** What is the recommended serialization format when training a SageMaker built-in algorithm on large data with Pipe-mode sequential streaming?

A) Millions of individual PNG image files  
B) A separate CSV file per row  
C) A compressed ZIP archive  
D) RecordIO-protobuf  

**Answer: D**  
Explanation: RecordIO-protobuf packs many records into one large binary, optimized for sequential reads and Pipe streaming, which is why SageMaker built-in algorithms recommend it. Millions of small files incur heavy object request overhead, one CSV per row is even worse, and ZIP is unsuitable for streaming training.

---

**Question 5.** Multiple data scientists' notebooks and multiple processing jobs need to simultaneously share and modify the same medium-sized dataset as a POSIX file system. Which choice is simple to set up and scales elastically?

A) Separate copies on each user's EBS volume  
B) Amazon EFS  
C) S3 Glacier  
D) Local instance store  

**Answer: B**  
Explanation: EFS is managed NFS that multiple instances mount and share concurrently, with elastic capacity and simple setup, making it well suited to general-purpose data shared by notebooks and jobs. EBS is single-instance only, Glacier is cold archive storage, and instance store is ephemeral and unsuitable for sharing.

---
