# Day 1 - SageMaker Training Job: Estimator, Input Channels, Instances, Spot

## 📌 Key Takeaways

- A **Training Job** is a **batch-style task** that launches instances, trains in a container, saves `model.tar.gz` to S3, and then shuts the instances down automatically.
- The **Estimator** is the blueprint — container, IAM role, instances, hyperparameters. To run your own training script, use the framework Estimator's `entry_point`.
- **Input channels** are passed to `fit()` as a channel-to-data-location mapping. Input modes are File (download everything), Pipe (streaming), and Fast File.
- For **instances**, traditional ML = CPU, deep learning = GPU, and if one machine is not enough, raise `instance_count` to distribute. For I/O bottlenecks from repeatedly reading large data, use **FSx for Lustre**.
- **Managed Spot Training** saves up to 90%. But it can be interrupted, so it is **paired with checkpoints**, and `max_wait >= max_run` must hold.

## How a Training Job Works

The basic unit of model training in SageMaker is the **Training Job**. Instead of running `for epoch in ...` directly in a notebook, you submit a job that says "train with this data, in this container, on this instance".

```text
① Provision instances   (instance_type × instance_count)
        ▼
② Run container        (ECR image: built-in / framework / custom)
        ▼
③ Load input data      (S3 · FSx → File / Pipe / Fast File)
        ▼
④ Train  ──▶ checkpoints ──▶ s3://.../checkpoints/   (for Spot interruption)
        ▼
⑤ Upload model artifact  (model.tar.gz → output_path)
        ▼
⑥ Instances shut down automatically    (billing stops)
```

| Step | What happens | Easy to miss |
|------|-------------|----------------|
| ① Provisioning | Launches EC2 instances of the specified type and count | Billing starts from here |
| ② Container run | Pulls and runs the Docker image (ECR) containing the algorithm | Three branches: built-in, framework, custom |
| ③ Input data load | Brings the training data from S3 (or FSx) to the instance | In File mode, training does not start until everything is downloaded |
| ④ Training | The container reads the data and trains the model | Metrics must be emitted to logs for tuning and early stopping to work |
| ⑤ Artifact save | Uploads `model.tar.gz` to S3 at `output_path` | The model stays in S3 even after the instance is gone |
| ⑥ Instance shutdown | Taken down automatically when the job finishes | Billing stops. The decisive difference from an always-on endpoint |

The key point is that **the instances disappear when training ends**. They do not stay up like an inference endpoint. So training is inherently a "use briefly and discard" batch-style task, and this property fits well with Spot training, covered later.

This structure is a classic example of the cloud design principle of "separating compute and storage". Data lives in durable S3, and compute is launched only when needed and then taken down. Thanks to this, you can run many experiments on the same data by changing only the instance type, and the waste of keeping expensive GPUs on after training finishes disappears. It is the opposite of buying a GPU server on-premises, where depreciation keeps running even when you are not using it.

## Estimator: The Blueprint of a Training Job

In the Python SDK, a Training Job is defined with an **Estimator** object. The Estimator is a blueprint that holds "what, where, and how" to train.

- **What**: `image_uri` (algorithm container) or `entry_point` (my script)
- **Where**: `instance_type`·`instance_count`·`role`
- **How**: the algorithm's knobs passed via `set_hyperparameters()`
- **Where to**: `output_path` (the S3 path where the model artifact is uploaded)

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=container,          # algorithm container (ECR image)
    role=role,                    # SageMaker execution IAM role
    instance_count=1,             # number of instances
    instance_type='ml.m5.xlarge', # instance type
    output_path='s3://my-bucket/output/',  # model storage location
    sagemaker_session=session,
)

estimator.set_hyperparameters(
    max_depth=5,
    objective='binary:logistic',
    num_round=100,
)
```

There are three broad kinds of Estimator, and which one you pick is where exam answers diverge.

| Estimator Type | How specified | When to choose |
|----------------|-----------|-------------|
| **For built-in algorithms** | AWS-provided container URI in `Estimator(image_uri=...)` | Train directly with XGBoost etc. without code (covered tomorrow) |
| **Framework Estimator** | `PyTorch`/`TensorFlow`/`SKLearn` + `entry_point='train.py'` | When running a training script you wrote yourself |
| **Custom container** | Build your own image, push it to ECR, and specify it as `image_uri` | When you need unusual libraries or an in-house runtime |

> ⚠️ **Pitfall**: The answer to "How do you train my own PyTorch script on SageMaker?" is **framework Estimator + `entry_point`**. The option of pushing a script into a built-in container often appears as a wrong answer. Conversely, you fall back to a custom container only for "special dependencies that are neither in a built-in nor packageable in a framework container".

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',       # my training code
    role=role,
    framework_version='2.0',
    py_version='py310',
    instance_count=1,
    instance_type='ml.g5.xlarge', # GPU instance
    hyperparameters={'epochs': 10, 'lr': 0.001},
)
```

## Input Channels: S3 and FSx, and Input Modes

Training data is passed through **input channels**. When calling `fit()`, you give a dictionary mapping channel name to data location. Names such as `train`, `validation`, and `test` are typically used.

```python
estimator.fit({
    'train': 's3://my-bucket/train/',
    'validation': 's3://my-bucket/validation/',
})
```

For each channel you can decide how the data enters the instance (the **input mode**), and this is within the exam scope.

| Input Mode | Behavior | Suitable when |
|-----------|------|-------------|
| **File mode** (default) | Downloads all data to the instance disk before training starts | Data is small enough to fit on disk |
| **Pipe mode** | Streams data from S3 (no download wait) | Large data; reduces startup delay and saves disk |
| **Fast File mode** | Files are accessible immediately, but only what is needed is streamed | File-mode convenience + streaming benefits |

There are also choices for the data store.

| Store | Nature | When to choose |
|--------|------|-------------|
| **S3** | The most common. The starting point for most training data | The default. When data size is moderate or repeated reads are few |
| **FSx for Lustre** | Ultra-high-performance parallel file system. Once loaded, low-latency repeated access | When data is very large and the same data is read repeatedly across epochs, making I/O the bottleneck |
| **EFS** | Mount and use a shared file system | When the data is already on EFS |

> ⚠️ **Pitfall**: When a scenario says "in large-scale distributed training that repeatedly reads several TB of data every epoch, data loading is the bottleneck", the answer is **FSx for Lustre**. S3 File mode is slow because it downloads everything at the start, and Pipe mode streams again every epoch. Once loaded, FSx provides low-latency parallel access, so it is strong for repeated reads. Conversely, if the data is small, there is no need for FSx — S3 File mode is simple and sufficient.

## Instance Selection: CPU vs GPU, Single vs Distributed

Instance selection affects both cost and speed. The basic principle is to match the nature of the algorithm.

| Instance Family | Nature | Suitable training |
|---------------|------|-------------|
| **ml.m5 (general-purpose CPU)** | Balanced CPU and memory | The default for traditional ML such as XGBoost and Linear Learner |
| **ml.c5 (compute-optimized CPU)** | Focused on compute performance | Light training dominated by CPU computation |
| **ml.g5 (GPU)** | Mid-range single/multi GPU | Small-to-medium deep learning, fine-tuning pre-trained models |
| **ml.p4 (GPU)** | Large multi-GPU nodes | Large neural networks, full-scale distributed training |

**Distributed training** starts when you set `instance_count` to 2 or more. The two methods differ by what is split.

| Distribution Method | What is split | When to use |
|-----------|---------------|-----------|
| **Data parallel** | Split the data; each instance trains the same model | The model fits on one GPU but the data is large and training is slow |
| **Model parallel** | Split the model itself across multiple GPUs | The model does not fit in the memory of one GPU |

```python
estimator = PyTorch(
    entry_point='train.py',
    role=role,
    instance_count=4,             # distributed training on 4 instances
    instance_type='ml.p4d.24xlarge',
    distribution={'torch_distributed': {'enabled': True}},
    ...
)
```

GPUs are fast for deep learning because the core of neural network training is huge matrix multiplication, and a GPU processes such parallel operations simultaneously with thousands of cores. Conversely, tree-based algorithms (XGBoost) make branching decisions sequentially, so the GPU benefit is limited (though XGBoost also has a GPU acceleration option). Memorize it in this order: "deep learning means GPU, traditional ML means CPU" is the default, and consider distribution when the data or model size exceeds one machine.

## Managed Spot Training: Cut Training Cost by Up to 90%

We said training is a batch job that is used briefly and discarded. **Managed Spot Training** makes the best use of this property. Spot instances use AWS's spare capacity at a large discount, up to 90% cheaper than On-Demand.

The downside is that when AWS reclaims the capacity, the instance can be terminated midway (interruption). SageMaker solves this with **checkpoints**. If you periodically save the intermediate training state to S3, then even if the instance is reclaimed and restarted, training continues from the last checkpoint.

```python
estimator = Estimator(
    image_uri=container,
    role=role,
    instance_count=1,
    instance_type='ml.m5.xlarge',
    use_spot_instances=True,          # enable Spot training
    max_run=3600,                     # max training time (seconds)
    max_wait=7200,                    # max wait time including Spot waiting (seconds)
    checkpoint_s3_uri='s3://my-bucket/checkpoints/',  # checkpoint storage
)
```

- `max_wait` must be **greater than or equal to** `max_run`. This is because Spot needs additional time to wait for available capacity.
- If you do not specify `checkpoint_s3_uri`, an interruption means retraining from scratch, which can actually be a loss.
- Checkpoints do not end with saving. The training script must be written to **read that path on restart and resume from it** for training to actually resume.

You check how much was actually saved in the job description (describe). With boto3 you can directly query the training job status and billable time.

```python
import boto3

sm = boto3.client('sagemaker')
desc = sm.describe_training_job(TrainingJobName='my-training-job')

print(desc['TrainingJobStatus'])                    # InProgress / Completed / Failed
print(desc['ModelArtifacts']['S3ModelArtifacts'])   # model.tar.gz location
print(desc['TrainingTimeInSeconds'])                # time spent training
print(desc['BillableTimeInSeconds'])                # actually billed time
```

With Spot enabled, `BillableTimeInSeconds` becomes much smaller than `TrainingTimeInSeconds`. The difference between these two values is the savings.

The answer to the scenario "reduce cost, but training must resume without loss even if interrupted" is **Spot + checkpoints**. If you turn on Spot without checkpoints, progress is lost on interruption. Conversely, if "training must never be interrupted and the deadline is tight", use On-Demand. The decision criterion is that Spot suits training with time to spare and where restarts are allowed.

## When Training Goes Wrong: Symptom → Cause → Action

The exam often presents a situation like "training is going wrong in this way" and asks for the action. The four axes learned today serve directly as a diagnostic table.

| Symptom | Common cause | Action |
|------|-----------|------|
| A long wait before training starts | Downloading all of the large data in File mode | Switch to Pipe / Fast File mode; FSx for Lustre if repeated reads are heavy |
| Spot training restarts from scratch every time | `checkpoint_s3_uri` not specified, or the script does not read the checkpoint | Specify the checkpoint path + implement resume logic |
| A Spot job terminates without even starting | `max_wait` is smaller than `max_run` or shorter than the capacity wait time | Raise to `max_wait >= max_run`, widen the instance type candidates |
| Training never ends and keeps running | Hyperparameter misconfiguration prevents convergence | Cap it with `max_run` to block runaway cost |
| S3 data access is denied | The execution IAM role lacks read permission on that bucket | Grant the `role` permissions on the input and output S3 paths |
| Switched to GPU but it is not faster | A tree-based algorithm gains little from GPU, or the bottleneck is I/O rather than compute | Go back to CPU, or first improve data loading via input mode or FSx |

For training speed problems, the order is to first separate **compute bottlenecks** from **I/O bottlenecks**. If GPU utilization is low and training is slow, nine times out of ten the data is arriving late, and switching to a more expensive GPU only spends money without effect. An instance upgrade is the answer only when compute is the real bottleneck.

In the next post, we look at the built-in algorithms you can actually run in this Training Job and their input formats.

## 📖 Glossary

- **Training Job**: The basic unit for running model training in SageMaker. It launches instances and takes them down by itself when finished.
- **Estimator**: A blueprint object holding what, where, and how to train. The way to define a training job in the Python SDK.
- **entry_point**: The file name of my training script passed to a framework Estimator. If present, it is custom-code training.
- **Input channel**: A "name → data location" pair passed to `fit()`. Names such as `train` and `validation` are typically used.
- **Input mode (File / Pipe / Fast File)**: How data is brought into the instance. File downloads everything first, Pipe streams from S3 while training, and Fast File gives immediate access to files but streams only the needed parts.
- **FSx for Lustre**: An ultra-high-performance parallel file system. Much faster than S3 when reading large data many times.
- **Model artifact**: The `model.tar.gz` file that is the training result. It is stored in S3 at `output_path` and remains after the instance is gone.
- **Managed Spot Training**: Training by borrowing AWS's spare capacity cheaply. Up to 90% cheaper, but it can be reclaimed midway.
- **Checkpoint**: The intermediate training state saved to S3. It lets training continue from the last point even after an interruption.
- **Data parallel / Model parallel**: Splitting the data so several machines train the same model / splitting the model itself and loading the pieces onto several GPUs.

---

## 📝 Practice Questions

**Question 1.** You want to cut training costs as much as possible, but even if an instance is reclaimed and training is interrupted, training must resume without losing progress. What is the most suitable configuration?

A) Train on On-Demand Instances and increase the number of instances  
B) Enable Managed Spot Training and save checkpoints with checkpoint_s3_uri  
C) Enable only Spot Instances and do not configure checkpoints  
D) Run the training repeatedly multiple times  

**Answer: B**  
Explanation: Spot saves up to 90% of cost but can be interrupted by reclamation, so saving checkpoints to S3 lets training resume from the last point without losing progress. A has no cost-saving effect, C retrains from scratch on interruption and incurs losses, and D is an inefficient approach that starts from the beginning every time.

---

**Question 2.** In large-scale distributed training that repeatedly reads several TB of training data across many epochs, I/O is a bottleneck because the data is re-downloaded from S3 every epoch. What is the most suitable data source?

A) S3 File mode  
B) FSx for Lustre  
C) Local notebook disk  
D) DynamoDB  

**Answer: B**  
Explanation: FSx for Lustre is a high-performance parallel file system that, once loaded, allows low-latency repeated access, resolving the I/O bottleneck of training that repeatedly reads large datasets over multiple epochs. A requires downloading everything at each start, C does not fit the training scale, and D is a key-value store unsuitable for streaming large volumes of training data.

---

**Question 3.** You want to run your own PyTorch training script (train.py) as a SageMaker Training Job. What is the correct approach?

A) Put the script in the built-in XGBoost container  
B) Specify train.py as the entry_point of the PyTorch framework Estimator  
C) Create an inference endpoint first  
D) Load the script into Feature Store  

**Answer: B**  
Explanation: A framework Estimator (such as PyTorch) takes the user's training script via entry_point and runs it in the corresponding framework container, so it suits training custom PyTorch code. A is an unrelated algorithm container, C is for inference and does not fit the training stage, and D is a feature store unrelated to running training code.

---

**Question 4.** Which of the following is correct about the behavior immediately after a SageMaker Training Job completes successfully?

A) The training instance stays up and handles inference requests  
B) The model artifact is saved to S3 at output_path and the training instance is terminated automatically  
C) The instance terminates and the model is deleted along with it  
D) The data is loaded into Feature Store automatically  

**Answer: B**  
Explanation: After training completes, a Training Job uploads model.tar.gz to the specified S3 location and automatically brings down the instance, stopping billing. A describes the behavior of an inference endpoint, C is wrong because the model is preserved in S3, and D is not something a training job does automatically.

---

**Question 5.** When configuring Managed Spot Training, which is the correct relationship between max_run and max_wait?

A) max_wait must always be less than max_run  
B) max_wait must be greater than or equal to max_run (including time waiting for Spot capacity)  
C) The two must always be equal  
D) max_wait is meaningless for Spot  

**Answer: B**  
Explanation: Spot requires additional time waiting for available capacity, so max_wait, the total time including waiting, must be greater than or equal to max_run, the upper limit on actual training time. A sets it the other way around, C fails to account for waiting time, and D conflicts with the fact that max_wait is a required parameter for Spot training.

---
