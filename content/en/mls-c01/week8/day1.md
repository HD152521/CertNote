# Day 1 - SageMaker Training Jobs: Estimator, Input Modes, Distributed Training, Spot

## 📌 Key Takeaways

- A SageMaker Training Job is a **one-off batch job that starts at `fit()` and disappears when it ends**. Only what you write to `/opt/ml/model` is automatically uploaded to S3.
- Choose the input mode by **data size** — File if it fits on disk; Pipe (sequential streaming) or FastFile (streaming + random access) if it is larger than the disk or you want to cut startup delay.
- Choose the distribution strategy by **model size** — data parallel (SMDDP) if the model fits on one device, model parallel (SMP) if you get OOM.
- **Managed Spot Training** saves up to ~90% versus on-demand. Because it can be interrupted, a `checkpoint_s3_uri` checkpoint almost always accompanies the correct answer.
- The Spot parameter constraint is **`max_wait >= max_run`**. An option with the inequality flipped is wrong.

## How a Training Job Works

Week 8 is the second half of Domain 3 (Modeling) — it covers "on what compute, with what data delivery method, and how cheaply do we run it." The flow of a SageMaker training job is always the same.

```text
1. Define the Estimator (image, instance, hyperparameters, output path)
2. Call fit() → provision training instances
3. Deliver training data from S3 to the container (input mode)
4. Data in /opt/ml/input/data/<channel>, artifacts written to /opt/ml/model
5. Training ends → /opt/ml/model is automatically uploaded to S3 (output_path) as tar.gz
6. Instances terminate (billing stops)
```

- The instance **lives only for the duration of the job**. It disappears when training ends, so intermediate state survives only if exported to S3.
- Only what you write to `/opt/ml/model` is uploaded as the model artifact. Other paths disappear with the instance.

### Standard Paths in the Training Container

```text
/opt/ml/input/data/<channel_name>   ← input data channels
/opt/ml/input/config/               ← hyperparameters, resource settings (JSON)
/opt/ml/model/                      ← model artifacts (auto-uploaded to S3)
/opt/ml/output/                     ← failure file on failure
/opt/ml/checkpoints/                ← checkpoints (synced with S3 when configured)
```

| Path | What goes there | Exam trap |
|---|---|---|
| `/opt/ml/input/data/<channel>` | Per-channel data passed to `fit()` | The channel name becomes the directory name |
| `/opt/ml/input/config/` | Hyperparameter and resource settings JSON | Your code reads from here; it is not where you write |
| `/opt/ml/model/` | The final model artifact | **Anything not here is not uploaded to S3** |
| `/opt/ml/output/` | Failure reason (failure file) | Gets confused with the model artifact path |
| `/opt/ml/checkpoints/` | Intermediate training checkpoints | What you write here is for resuming, not an artifact |

SageMaker training is a "managed one-off batch job." It is not an EC2 instance that stays up permanently; it starts at `fit()` and disappears when the job ends. So to preserve intermediate training state, you must export checkpoints to S3. This one-off nature is exactly why Spot training (cheap but interruptible), covered later, fits so naturally.

## Estimator Configuration

The Python SDK's `Estimator` (or the framework-specific `PyTorch`, `TensorFlow`, and `XGBoost` Estimators) defines the training job.

```python
from sagemaker.estimator import Estimator

est = Estimator(
    image_uri=xgboost_image,          # built-in/custom container image
    role=role,
    instance_count=1,
    instance_type="ml.m5.xlarge",
    output_path="s3://bucket/output", # location of model artifacts
    hyperparameters={"max_depth": 5, "num_round": 100},
)
est.fit({"train": train_s3, "validation": val_s3})
```

| Argument | Role | What happens if you miss it |
|---|---|---|
| `image_uri` | Training container image | The point where you choose a built-in/custom algorithm |
| `instance_count` | Number of training instances | **2 or more means distributed training** |
| `instance_type` | Type of compute | Determines whether you need a GPU and the cost |
| `output_path` | S3 location of artifacts | The contents of `/opt/ml/model` are uploaded here |
| `hyperparameters` | Algorithm settings | Passed as config JSON inside the container |
| `entry_point` / `source_dir` | Script mode entry point | Required to use custom code |

- A channel name (`train`, `validation`) becomes the path `/opt/ml/input/data/<channel>` inside the container.
- To use custom code, use script mode with `entry_point` and `source_dir`.

The `hyperparameters` you pass to the Estimator land as JSON in `/opt/ml/input/config/` inside the container, and the training script reads those values to behave accordingly. In other words, it is a structure where you "change only the settings and rerun without modifying code," which is why tomorrow's automatic tuning (AMT) can run the same Estimator repeatedly while varying only the hyperparameters.

## Input Modes: File vs Pipe vs FastFile

How training data is delivered from S3 to the container directly affects startup delay, cost, and memory. It is an in-scope exam topic.

| Mode | Behavior | When to use | When not to use |
|---|---|---|---|
| **File** (default) | **Finishes downloading** all data to EBS before training starts | Small-to-medium data that fits on the instance disk, repeated random access | When data is larger than the disk, or when you must reduce startup delay and EBS cost |
| **Pipe** | **Streams** data from S3 (no waiting for download) | Large data bigger than the disk, sequential reads, streaming-friendly formats | When the code must jump around files with random access |
| **FastFile** | Makes files look local but **lazily loads (streams) on read** | When you need streaming benefits plus random access without code changes | When everything already fits on disk and repeatedly scans it all, so File is simpler |

```python
from sagemaker.inputs import TrainingInput

train = TrainingInput(
    s3_data="s3://bucket/train/",
    input_mode="Pipe",            # File | Pipe | FastFile
)
est.fit({"train": train})
```

Key discriminators:

- "The data is larger than the instance disk / we want to reduce download waiting" → **Pipe** or **FastFile**.
- "Quickly receive all the data and randomly access it on disk" → **File**.
- Pipe is strong at sequential streaming, and FastFile is the newer option that is also comfortable with random access.

File mode cannot start training until the download finishes, so with terabyte-scale data the startup delay and EBS cost grow. Pipe mode, combined with streaming-friendly formats such as protobuf RecordIO, flows the first batch immediately. FastFile is mounted like a POSIX file, but the actual bytes are pulled from S3 at access time, so you get the streaming benefits with almost no code changes.

```text
[File mode]   S3 → full download to EBS ████████████ → training starts ▶▶▶▶▶
              (The first batch only runs after the download ends. At TB scale: delay and EBS cost ↑)

[Pipe/FastFile] training starts ▶▶▶▶▶  (pulled from S3 as it reads)
              └ No download wait, the full data is not held on disk
```

> ⚠️ **Trap**: Options such as "copy the data to EFS and then use File mode" or "copy it manually to the instance" are wrong patterns that bypass the managed training flow. In large-data questions, the answer is almost always Pipe or FastFile.

## Distributed Training: Data Parallel vs Model Parallel

When you increase `instance_count` or have several GPUs, you choose a distribution strategy.

| Strategy | What it splits | When to use | When not to use |
|---|---|---|---|
| **Data parallel** (SMDDP) | Splits the data batches and replicates the model | The model **fits on one device**, but training is slow and needs acceleration | When the model itself exceeds memory and causes OOM — replicating does not fix it |
| **Model parallel** (SMP) | Splits the model's layers and tensors across devices | A huge model **exceeds a single GPU's memory** | When the model already fits and you just want more speed (needless complexity) |

- **Data parallel**: place replicas of the same model on several devices, process split data batches, then combine the gradients. SageMaker Distributed Data Parallel (SMDDP) optimizes AllReduce.
- **Model parallel**: when the model itself does not fit in one device's memory, split the layers/tensors across several devices. SageMaker Distributed Model Parallel (SMP).

```python
est = Estimator(
    image_uri=img, role=role,
    instance_count=4, instance_type="ml.p4d.24xlarge",
    distribution={"smdistributed": {"dataparallel": {"enabled": True}}},
)
```

Discriminating signals:

- "Training is slow, so accelerate with more GPUs" + the model fits in memory → **data parallel**.
- "The model is too big and exceeds single-GPU memory (OOM)" → **model parallel**.

> ⚠️ **Trap**: In OOM questions, "just reduce the batch size," "just add more instances," and "switch to a CPU instance" are wrong answers that do not touch the root cause (model size).

## Managed Spot Training: Cost Savings

Using Spot instances for training can save up to ~90% versus on-demand. However, Spot can be interrupted, so **checkpoints** are essential.

```python
est = Estimator(
    image_uri=img, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    use_spot_instances=True,
    max_run=3600,            # total allowed training time
    max_wait=7200,           # max time including Spot waiting (>= max_run)
    checkpoint_s3_uri="s3://bucket/checkpoints/",
)
```

| Parameter | Meaning | Constraint / caution |
|---|---|---|
| `use_spot_instances` | Enables Spot training | Usable regardless of distribution or CPU/GPU |
| `max_run` | Upper bound on actual training time | The job ends if exceeded |
| `max_wait` | Total upper bound including waiting for Spot capacity | **`max_wait >= max_run`** is required |
| `checkpoint_s3_uri` | S3 location of checkpoints | Without it, an interruption means retraining from scratch |

### Spot Interruption → Resume Flow

```text
[Training starts] ── periodic saves ──→ /opt/ml/checkpoints ──sync──→ s3://.../checkpoints/
     │
     ├─ Spot interruption occurs
     │        │
     │        ├─ checkpoint_s3_uri set → after capacity is secured, resume from the last checkpoint
     │        │                          (waits within max_wait)
     │        └─ not set → retrain from scratch → the savings disappear
     │
     └─ Completes normally → /opt/ml/model → output_path (tar.gz)
```

Discriminating signals:

- "Cut training cost significantly but a little time delay is acceptable" → **Managed Spot Training**.
- "It is Spot, but when interrupted it starts over from scratch" → the cause is that no checkpoint is configured.

### Training Compute Operations Comparison

| Item | On-demand training | Managed Spot training |
|---|---|---|
| Cost | Baseline | Up to ~90% savings |
| Interruption risk | None | Yes (capacity reclaimed) |
| Total elapsed time | Predictable | May grow due to waiting (`max_wait`) |
| Required settings | None | Checkpoint + `max_wait >= max_run` |
| Suitable situation | Retraining with a tight deadline | Cost first, time delay acceptable |

## Training Job Design Decision Tree

```text
Run training on SageMaker
├─ Does the data fit on the instance disk?
│    ├─ Yes  → File mode (full download, then random access)
│    └─ No ↓
│         ├─ Sequential streaming is enough → Pipe
│         └─ Need random access / minimal code changes → FastFile
├─ Is training slow / does the model not fit?
│    ├─ Only slow (the model fits) → data parallel (SMDDP), raise instance_count
│    └─ Exceeds single-GPU memory (OOM) → model parallel (SMP)
├─ Do we need to cut cost?
│    ├─ Yes → use_spot_instances=True + checkpoint_s3_uri + max_wait >= max_run
│    └─ No  → on-demand
└─ Artifacts? → always write to /opt/ml/model → auto-uploaded to output_path
```

## Question Clue → Answer Mapping

| Question clue | Answer to pick | Why |
|---|---|---|
| "8 TB of data, larger than EBS, and we want to remove the download wait" | Pipe mode | Starts immediately by streaming, saves EBS storage |
| "Use it like local files with no code changes, while streaming" | FastFile mode | POSIX mount + lazy loading |
| "Copy data to EFS, then File mode" | **Wrong option** | With large data, the download/copy itself is the bottleneck |
| "Exceeds single-GPU memory (OOM)" | Model parallel (SMP) | Splits the model across devices |
| "Training is slow, so add GPUs to accelerate" | Data parallel (SMDDP) | Splits batches and AllReduces gradients |
| "Cut training cost significantly and tolerate delay" | Managed Spot Training | Up to ~90% savings versus on-demand |
| "Continue training after a Spot interruption" | Set `checkpoint_s3_uri` | Resumes from the last checkpoint |
| "`max_run` larger than `max_wait`" | **Wrong option** | The inequality is reversed — `max_wait >= max_run` |
| "The model is not in S3 after training" | Not written to `/opt/ml/model` | Only that path's contents are uploaded as tar.gz |

The next post covers **Automatic Model Tuning (AMT)**, which automatically runs this training job many times to find the best hyperparameters.

## 📖 Glossary

- **Training Job**: a managed one-off job where SageMaker launches instances, runs training, and cleans up automatically when it ends.
- **Estimator**: the blueprint of a training job. It holds the container image, instances, hyperparameters, and output path, and runs with `fit()`.
- **Channel**: the name of a data bundle passed to `fit()` (`train`, `validation`). It becomes the directory name as-is inside the container.
- **Script mode**: a way to run your own training code (`entry_point`, `source_dir`) on top of a managed framework container.
- **Input mode**: how S3 data is delivered to the container. Three kinds: File (full download), Pipe (streaming), FastFile (lazy loading).
- **Model artifact**: the result of packing `/opt/ml/model` into tar.gz and uploading to S3 after training ends. It is the input to inference deployment.
- **Data parallel (SMDDP)**: a method that replicates the model, splits data batches, trains simultaneously on several devices, and then combines the gradients.
- **Model parallel (SMP)**: a method that splits layers and tensors across several devices when the model is too big for one device.
- **Managed Spot Training**: an option that uses spare capacity (Spot) to cut training cost significantly. It can be interrupted, so checkpoints are its partner.
- **Checkpoint**: a saved copy of intermediate training state. If synced to S3, training continues from that point after an interruption.

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
