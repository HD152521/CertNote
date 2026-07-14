# Day 2 - ML Data Storage: S3·EFS·FSx for Lustre·Data Formats

In GPU-intensive ML training, the most common reason GPUs sit idle isn't that the model is slow—it's that **data doesn't arrive on time**. An ml.p4d instance's GPU can handle hundreds of gigabytes per second, but if storage can't keep pace, expensive accelerators wait for I/O. That's why Specialty asks: "Where and in what format should you store which data?" as a cost-performance trade-off.

Today we cover: ① S3, the data lake backbone, ② EFS and FSx for Lustre, which accelerate training I/O, and ③ RecordIO and Parquet, ML-friendly formats.

## S3: The Heart of the ML Data Lake

Nearly all SageMaker training data originates in S3. S3 offers virtually unlimited capacity, 11 nines of durability, and SageMaker reads it natively. The key is **how to stream data from S3 to GPU efficiently**—this is the choice of input mode.

| Input Mode | Behavior | Best For |
|-----|------|------|
| **File Mode** | Copy entire dataset to instance disk (EBS) before training starts | Small data, random access required |
| **Pipe Mode** | Stream from S3 without storing on disk | Large data, sequential access, minimize startup delay |
| **FastFile Mode** | Load only required files on-demand, POSIX-like access | Large data with partial reads or random access needed |

```python
from sagemaker.inputs import TrainingInput

# Pipe mode: stream without downloading fully → fast startup on large data
train_input = TrainingInput(
    s3_data="s3://my-lake/features/train/",
    input_mode="Pipe",                 # File | Pipe | FastFile
    distribution="ShardedByS3Key",     # Split data across multiple instances
    content_type="application/x-recordio-protobuf",
)
estimator.fit({"train": train_input})
```

`distribution="ShardedByS3Key"` means each instance in distributed training reads a different data shard, eliminating duplication. `FullyReplicated` means all instances receive the entire dataset (good for small data and validation sets).

> 💡 **Related Theory**: File mode requires the full copy to complete before the first training step. Hundreds of GB can take tens of minutes just to copy, during which expensive GPUs idle. Pipe mode starts training as soon as the first batch arrives, minimizing **time-to-first-batch**. Pipe only streams sequentially, so full shuffles per epoch are harder and the algorithm must support Pipe. FastFile is a compromise: it supports random access while avoiding full copy.

## EFS and FSx for Lustre: Accelerating Training I/O

S3 is object storage and can't serve POSIX directory operations or random reads as fast as a file system. If training **repeats over the same data across multiple epochs** or **needs random access to many small files**, file system storage wins.

| Storage | Characteristics | ML-Suitable Scenario |
|---------|---|-----|
| **EFS** | Managed NFS, multi-instance shared, elastic scaling | Medium datasets shared by notebooks and multiple jobs |
| **FSx for Lustre** | High-performance parallel file system, S3 integration | Large-scale distributed training, high-throughput I/O |

FSx for Lustre's killer feature is **S3 repository linkage**. Put the S3 bucket as the backend; Lustre acts like a high-performance cache. Data lives in S3 (cheap, durable) but training reads via Lustre's hundreds of GB/s throughput.

```python
from sagemaker.inputs import FileSystemInput

# Mount FSx for Lustre directly to training job
fsx_input = FileSystemInput(
    file_system_id="fs-0123456789abcdef0",
    file_system_type="FSxLustre",
    directory_path="/fsx/imagenet/train",
    file_system_access_mode="ro",
)
estimator.fit({"train": fsx_input})
```

> 💡 **Related Theory**: Repeating hyperparameter tuning (HPO) hundreds of times on the same dataset accumulates download costs each time you pull from S3. Loading once into FSx for Lustre lets all tuning jobs share high-speed access, drastically cutting total time and cost. EFS has lower throughput than Lustre but simpler setup and is better for permanent sharing. Key decision rule: **repeated + high-throughput = Lustre; shared + general-purpose = EFS; one-off large streaming = S3 Pipe**.

## Data Formats: RecordIO and Parquet

Using raw CSV, JSON, or images directly in training suffers from parsing overhead and small-file problems that slow I/O. ML prefers two formats.

**RecordIO-protobuf**: SageMaker's built-in algorithm's preferred format. Multiple records bundled into one large binary, optimized for sequential reads and Pipe mode streaming.

```python
import io, numpy as np
import sagemaker.amazon.common as smac

# Serialize numpy array to RecordIO-protobuf, upload to S3
buf = io.BytesIO()
smac.write_numpy_to_dense_tensor(buf, X_train.astype("float32"), y_train.astype("float32"))
buf.seek(0)

import boto3
boto3.client("s3").upload_fileobj(buf, "my-lake", "features/train/data.recordio")
```

**Parquet**: Columnar storage format. Stores by column instead of by row, enabling: ① read only needed columns (projection pushdown), ② high compression per column (similar-valued columns compress better), ③ native support from Athena, Glue, Spark. It's the de-facto standard for structured feature tables.

```python
import pandas as pd
# Parquet vs CSV: columnar selection + high compression → ETL/analytics I/O savings
df.to_parquet("s3://my-lake/features/train.parquet", engine="pyarrow", compression="snappy")
# During training, if you only need 3 of 50 columns, scan only those → I/O drops sharply
cols = pd.read_parquet("s3://my-lake/features/train.parquet", columns=["age", "amount", "label"])
```

> 💡 **Related Theory**: Row-based formats (CSV) must read an entire row even if you need only 3 of 50 columns. Columnar formats (Parquet) store each column separately so you read only the 3 you need. Plus, values within the same column have similar types and distributions, so compression is much better. Structured data analytics and ETL = Parquet; SageMaker built-in algorithms + large sequential training = RecordIO-protobuf.

## The Small-File Problem and Consolidation

Millions of small images or JSON files left as-is in S3 suffer from per-object request overhead, slowing training. The fix is **sharding**: bundle small files into larger groups like RecordIO, TFRecord, or tar. Aim for hundreds of MB per bundle so sequential I/O is efficient and Pipe mode works well.

## 📝 연습 문제

**문제 1.** 800GB 학습 데이터를 ml.p3 인스턴스 4대로 분산 학습하려 한다. GPU가 데이터 복사를 기다리며 노는 시간을 최소화하면서 각 인스턴스가 데이터의 다른 조각만 읽게 하려면?

A) Pipe 모드 + ShardedByS3Key  
B) File 모드 + FullyReplicated  
C) File 모드 + ShardedByS3Key  
D) FastFile 모드 + FullyReplicated  

**정답: A**  
해설: Pipe 모드는 전체를 디스크에 복사하지 않고 스트리밍해 time-to-first-batch를 줄이므로 GPU 유휴를 최소화하고, ShardedByS3Key는 각 인스턴스가 서로 다른 데이터 조각만 읽게 해 중복과 메모리를 줄인다. FullyReplicated는 모든 인스턴스가 전체를 받아 비효율적이고, File 모드는 대용량에서 시작 복사가 길다.

---

**문제 2.** 같은 ImageNet 데이터셋으로 하이퍼파라미터 튜닝을 200회 반복하는데, 매번 S3에서 다운로드하는 시간이 누적되어 비용이 크다. 가장 적절한 스토리지 전략은?

A) 매번 File 모드로 다시 다운로드한다  
B) FSx for Lustre에 한 번 올려 모든 튜닝 잡이 고속 공유 접근하게 한다  
C) 데이터를 더 작게 줄인다  
D) EBS 볼륨 크기를 늘린다  

**정답: B**  
해설: 동일 데이터를 다수의 잡이 반복 사용하는 고처리량 시나리오는 FSx for Lustre의 대표 사용처다. S3를 백엔드로 두고 Lustre가 고속 캐시처럼 동작해 반복 다운로드 비용을 없앤다. 매번 다운로드는 문제의 원인 그 자체이고, 데이터 축소는 품질을 해치며 EBS 확장은 공유·처리량 문제를 풀지 못한다.

---

**문제 3.** 50개 컬럼의 정형 피처 테이블에서 분석·ETL 시 매번 3~5개 컬럼만 읽는다. I/O와 저장 비용을 동시에 줄이는 포맷은?

A) CSV  
B) 압축하지 않은 JSON  
C) Parquet (컬럼형)  
D) 일반 텍스트  

**정답: C**  
해설: Parquet은 컬럼형 저장이라 필요한 컬럼만 스캔(projection pushdown)하고, 같은 컬럼의 유사한 값 덕에 압축률도 높다. CSV·JSON·텍스트는 행 기반이라 한 행 전체를 읽어야 하고 압축 효율도 낮다.

---

**문제 4.** SageMaker 내장 알고리즘으로 대용량 데이터를 Pipe 모드 순차 스트리밍 학습할 때 권장되는 직렬화 포맷은?

A) 개별 PNG 이미지 파일 수백만 개  
B) 행마다 별도 CSV 파일  
C) 압축된 ZIP 아카이브  
D) RecordIO-protobuf  

**정답: D**  
해설: RecordIO-protobuf는 여러 레코드를 하나의 큰 바이너리로 묶어 순차 읽기와 Pipe 스트리밍에 최적화돼 있어 SageMaker 내장 알고리즘이 권장한다. 수백만 개의 작은 파일은 객체 요청 오버헤드가 크고, 행마다 별도 CSV는 더 심하며, ZIP은 스트리밍 학습에 부적합하다.

---

**문제 5.** 여러 데이터 사이언티스트의 노트북과 여러 처리 잡이 동일한 중간 규모 데이터셋을 POSIX 파일 시스템처럼 동시에 공유·수정해야 한다. 설정이 단순하고 탄력적으로 확장되는 선택은?

A) 각자 EBS 볼륨에 따로 복사  
B) Amazon EFS  
C) S3 Glacier  
D) 로컬 인스턴스 스토어  

**정답: B**  
해설: EFS는 관리형 NFS로 다중 인스턴스가 동시에 마운트·공유하고 용량이 탄력적으로 늘어나며 설정이 단순해, 노트북·잡이 공유하는 범용 데이터에 적합하다. EBS는 단일 인스턴스 전용이고, Glacier는 아카이브용 콜드 스토리지이며, 인스턴스 스토어는 휘발성이라 공유에 부적합하다.

---
