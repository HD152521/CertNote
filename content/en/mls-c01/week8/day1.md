# Day 1 - SageMaker Training Jobs: Estimator, Input Modes, Distributed Learning, Spot

Week 8 covers the latter half of Domain 3 (Modeling) — "how to train models, how to tune them, and how to generalize them." Today we dive into **SageMaker Training Jobs**, the runtime foundation of learning. After selecting an algorithm (Week 6), the next question is "on what compute, with what data transfer method, and how cheaply can we run this training?" The exam tests Estimator configuration, input modes (File/Pipe/FastFile), distributed learning strategies, and Spot training cost optimization as key indicators.

## Training Job Execution Model

The flow of a SageMaker training job is always the same.

```text
1. Define Estimator (image, instance, hyperparameters, output path)
2. Call fit() → provision training instances
3. Transfer training data from S3 to container (input mode)
4. Write data to /opt/ml/input/data/<channel>, write outputs to /opt/ml/model
5. Training completes → automatically upload /opt/ml/model to S3 (output_path) as tar.gz
6. Terminate instances (billing stops)
```

The key point: **instances exist only during the job**, and only model artifacts written to `/opt/ml/model` are uploaded to S3. Memorizing the standard training container paths makes you strong on tricky questions (checkpoint path, output path).

```text
/opt/ml/input/data/<channel_name>   ← input data channel
/opt/ml/input/config/               ← hyperparameters, resource config (JSON)
/opt/ml/model/                      ← model artifacts (auto-uploaded to S3)
/opt/ml/output/                     ← failure file on error
/opt/ml/checkpoints/                ← checkpoints (synced to S3 when configured)
```

> 💡 **Related Theory**: SageMaker training is "managed one-off batch jobs." Instances are not permanently running like EC2 — they spawn when fit() is called and disappear when complete. To preserve intermediate training state, you must explicitly export checkpoints to S3. This one-off nature is why Spot training (cheap but interruptible) naturally fits here.

## Estimator Configuration

The Python SDK's `Estimator` (or framework-specific `PyTorch`, `TensorFlow`, `XGBoost` Estimators) defines training jobs.

```python
from sagemaker.estimator import Estimator

est = Estimator(
    image_uri=xgboost_image,          # built-in or custom container image
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    output_path="s3://bucket/output", # model output location
    hyperparameters={"max_depth": 5, "num_round": 100},
)
est.fit({"train": train_s3, "validation": val_s3})
```

- **instance_count > 1** triggers distributed training (see below).
- Channel names (`train`, `validation`) become `/opt/ml/input/data/<channel>` paths inside the container.
- For custom code, use `entry_point` and `source_dir` for script mode.

## Input Modes: File vs Pipe vs FastFile

How you transfer training data from S3 to the container directly impacts startup latency, cost, and memory. This is a frequent test topic.

| Mode | Behavior | Best For |
|------|------|------|
| **File** (default) | **Downloads entire dataset to EBS** before training starts | Small/medium data that fits on instance disk |
| **Pipe** | **Streams data from S3** without download wait | Large data exceeding disk, reduce startup latency and storage cost |
| **FastFile** | Files appear local, but **lazy-load on read (streaming)** | Pipe streaming + File random access convenience |

```python
from sagemaker.inputs import TrainingInput

train = TrainingInput(
    s3_data="s3://bucket/train/",
    input_mode="Pipe",            # File | Pipe | FastFile
)
est.fit({"train": train})
```

Key discrimination:
- "Data exceeds instance disk / want to reduce download wait" → **Pipe** or **FastFile**.
- "Receive all data quickly and access randomly from disk" → **File**.
- Pipe excels at sequential streaming; FastFile is a modern option adding random access convenience.

> 💡 **Related Theory**: File mode must complete downloads before training starts, making startup latency and EBS costs high for terabyte-scale data. Pipe mode pairs with streaming-friendly formats like protobuf RecordIO to feed the first batch immediately. FastFile mounts like POSIX files but actually pulls bytes from S3 on access, letting you gain streaming benefits with minimal code changes.

## Distributed Training: Data Parallel vs Model Parallel

When you increase `instance_count` or have multiple GPUs, choose a distributed strategy.

- **Data Parallel**: Replicate the same model across multiple devices, partition data batches, then combine gradients. **Standard choice when the model fits on one device**. SageMaker Distributed Data Parallel (SMDDP) optimizes AllReduce.
- **Model Parallel**: **When the model itself cannot fit in a single device's memory** (massive models), split layers/tensors across devices. SageMaker Distributed Model Parallel (SMP).

```python
est = Estimator(
    image_uri=img, role=role,
    instance_count=4, instance_type="ml.p4d.24xlarge",
    distribution={"smdistributed": {"dataparallel": {"enabled": True}}},
)
```

Discrimination signals:
- "Training is slow, accelerate with more GPUs" + model fits in memory → **Data Parallel**.
- "Model is too large, exceeds single GPU memory (OOM)" → **Model Parallel**.

## Managed Spot Training: Cost Savings

Using Spot instances for training can cut costs by ~90% compared to On-Demand. However, Spot can be interrupted, so **checkpoints are mandatory**.

```python
est = Estimator(
    image_uri=img, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    use_spot_instances=True,
    max_run=3600,            # total training time allowed
    max_wait=7200,           # max time including Spot wait (>= max_run)
    checkpoint_s3_uri="s3://bucket/checkpoints/",
)
```

- `use_spot_instances=True` and `max_wait >= max_run` is a required combination (includes wait time).
- On interruption, SageMaker **resumes from** the checkpoint stored in `checkpoint_s3_uri`.
- Without checkpoints, interrupted training restarts from scratch, eliminating cost savings.

Discrimination signals:
- "Cut training cost significantly, tolerate some latency" → **Managed Spot Training**.
- "Spot interrupted training restarts from scratch" → caused by missing checkpoint configuration.

## Exam Tips

- Input mode questions: "Data exceeds disk / reduce startup latency" → Pipe·FastFile; "download all then random access" → File.
- Distributed questions: keyword "model exceeds GPU memory" → model parallel; "simple acceleration" → data parallel.
- Spot questions: "cost savings" visible → Spot, and almost always **checkpoint + checkpoint_s3_uri** is the paired correct answer.
- Output path trap: models must be written to `/opt/ml/model` to upload to S3. Other paths disappear.
- Memorize `max_wait >= max_run` constraint to filter Spot configuration trap questions.

## Summary

Today we covered training's runtime infrastructure — Estimator configuration, input modes, distributed strategies, and Spot cost optimization. The core flow: **choose input mode by data scale → choose distributed strategy by model size/speed needs → add Spot + checkpoints for cost targets**. Tomorrow we tackle Automatic Model Tuning (AMT), which automatically runs training jobs multiple times to find optimal hyperparameters.

---

## 📝 Practice Questions

**Question 1.** The training data is 8 TB, far larger than the EBS volume of the training instance. You want to start training immediately without waiting for a download and reduce storage costs. Which input mode is MOST appropriate?

A) Stream from S3 in Pipe mode  
B) Download everything in File mode, then start  
C) Copy the data to EFS, then use File mode  
D) Manually copy the data to the instance  

**Answer: A**  
Explanation: Pipe mode streams data from S3 so training starts without waiting for the download to finish, and it also saves storage because the entire dataset does not have to fit on EBS. File mode (B, C) must download everything to disk, so with 8 TB the startup delay and cost are large, and manual copying (D) does not fit the managed training workflow.

---

**Question 2.** A team wants to train a very large transformer model, but it exceeds a single GPU's memory and causes OOM. Which distributed strategy is MOST appropriate?

A) Data parallel  
B) Model parallel  
C) Only increase the number of instances and reduce the batch size  
D) Switch to CPU instances  

**Answer: B**  
Explanation: When the model itself does not fit in a single device's memory, model parallelism, which splits the model across multiple devices, is the answer. Data parallelism (A) places a replica of the model on each device, so it does not solve OOM, reducing the batch size (C) does not fix the fundamental model-size problem, and switching to CPU (D) is impractically slow.

---

**Question 3.** You want to reduce training cost with Managed Spot Training. Which setting is required so that training resumes after a Spot interruption instead of restarting from the beginning?

A) Set instance_count to 2 or more  
B) Change the input mode to Pipe  
C) Save checkpoints to S3 with checkpoint_s3_uri  
D) Set max_run larger than max_wait  

**Answer: C**  
Explanation: Spot instances can be interrupted, so checkpoints must be saved to S3 (checkpoint_s3_uri) so that training resumes from that point after an interruption. The instance count (A) and input mode (B) are unrelated to resuming, and with Spot, max_wait must actually be greater than or equal to max_run, so D is stated the wrong way around and is incorrect.

---

**Question 4.** In a SageMaker training container, to which path must you write the model files so that the model artifacts are automatically uploaded to S3 (output_path) after training finishes?

A) /opt/ml/input/data/  
B) /tmp/output/  
C) /opt/ml/checkpoints/  
D) /opt/ml/model/  

**Answer: D**  
Explanation: At the end of training, SageMaker packages the contents of the `/opt/ml/model/` directory into a tar.gz and automatically uploads it to output_path. Artifacts written to an input channel path (A), an arbitrary path (B), or a checkpoint path (C) are not uploaded as model artifacts.

---

**Question 5.** Which parameter constraint must be satisfied when configuring Managed Spot Training?

A) max_wait must be greater than or equal to max_run  
B) max_wait must be less than max_run  
C) use_spot_instances is possible only in distributed training  
D) Spot is supported only on GPU instances  

**Answer: A**  
Explanation: max_wait includes the time spent waiting to obtain Spot capacity, so it must be set to at least max_run, the upper bound on actual training time. B has the inequality reversed and is wrong, Spot can be used regardless of whether training is distributed (C), and it is supported on both CPU and GPU (D), so those are wrong.

---
