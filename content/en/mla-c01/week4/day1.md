# Day 1 - SageMaker Training Job: Estimator, Input Channels, Instances, Spot

Last week we prepared data and organized it as features. Starting this week, we actually train models with that data. The basic unit of model training in SageMaker is a **Training Job**. Instead of directly running `for epoch in ...` in a notebook, you submit a job: "train this data in this container with this instance", SageMaker spins up instances, completes training, saves results to S3, and automatically terminates instances.

In the MLA-C01 exam, Training Job appears as keywords like "Estimator configuration", "input channels (S3/FSx)", "instance selection", "cost reduction via Spot training". Today we cover the structure of training jobs and four axes for managing costs.

## Training Job Flow

Once submitted, a Training Job proceeds in this order. Visualizing this flow helps anchor all other concepts on top of it.

1. **Instance provisioning**: Spin up EC2 instances of the specified type and count.
2. **Container execution**: Download and run the Docker image (ECR) containing the algorithm to the instances.
3. **Input data download**: Fetch training data from S3 (or FSx) to the instances.
4. **Training execution**: The container reads data and trains the model.
5. **Model artifact save**: Upload the trained model (`model.tar.gz`) to S3 at `output_path`.
6. **Instance termination**: After the job completes, automatically terminate instances (stop billing).

The key point is that **instances disappear after training ends**. Unlike inference endpoints, they don't stay running. So training is fundamentally a "use briefly then discard" batch job, and this property meshes well with Spot training, which we'll cover later.

> 💡 **Related Theory**: This structure exemplifies the cloud architecture principle of "separation of compute and storage". Keep data in persistent S3, and spin compute up and down as needed. This lets you run multiple experiments with the same data by just changing instance types, and eliminates the waste of keeping expensive GPUs running after training. It's the opposite of buying GPU servers on-premises, where they depreciate even when unused.

## Estimator: Training Job Specification

In the Python SDK, a Training Job is defined as an **Estimator** object. The Estimator is a specification for "what, where, and how" to train.

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=container,          # Algorithm container (ECR image)
    role=role,                    # SageMaker execution IAM role
    instance_count=1,             # Number of instances
    instance_type='ml.m5.xlarge', # Instance type
    output_path='s3://my-bucket/output/',  # Model save location
    sagemaker_session=session,
)

estimator.set_hyperparameters(
    max_depth=5,
    objective='binary:logistic',
    num_round=100,
)
```

There are roughly three types of Estimator: ① For built-in algorithms (specify container image_uri, covered tomorrow), ② Framework Estimators (`PyTorch`, `TensorFlow`, `SKLearn`, etc. — pass your training script as `entry_point`), ③ For custom containers you build. In exams, the mapping "to train my PyTorch script?" → Framework Estimator frequently appears.

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',       # My training code
    role=role,
    framework_version='2.0',
    py_version='py310',
    instance_count=1,
    instance_type='ml.g5.xlarge', # GPU instance
    hyperparameters={'epochs': 10, 'lr': 0.001},
)
```

## Input Channels: S3 and FSx, plus Input Mode

Training data is passed via **input channels**. When calling `fit()`, provide a dictionary mapping channel names to data locations. Typical names are `train`, `validation`, `test`.

```python
estimator.fit({
    'train': 's3://my-bucket/train/',
    'validation': 's3://my-bucket/validation/',
})
```

For each channel, you can specify how data reaches the instance (**input mode**), and this is a frequent exam topic.

| Input Mode | Behavior | Best For |
|---|---|---|
| **File Mode** (default) | Download all data to instance disk, then start training | Small data that fits on disk |
| **Pipe Mode** | Stream data from S3 (no download wait) | Large data, reduce startup latency and disk space |
| **Fast File Mode** | Instant file access with streaming only when needed | File convenience + streaming benefits |

Data storage has options too:

- **S3**: Most common. Starting point for most training data.
- **FSx for Lustre**: Ultra-high-performance parallel file system. When data is very large and you read the same data repeatedly across epochs, FSx is much faster than fetching from S3 each time. Choose when I/O is the bottleneck in distributed training.
- **EFS**: Mount and use when data is already on EFS.

> ⚠️ **Pitfall**: The scenario "large-scale distributed training with multi-TB data read repeatedly each epoch, data loading is the bottleneck" → answer is **FSx for Lustre**. S3 File mode is slow because it downloads everything at startup; Pipe mode also re-streams each epoch. FSx, once uploaded, provides low-latency parallel access—strong for repeated reads. Conversely, small data doesn't need FSx; S3 File mode is simple and sufficient.

## Instance Selection: CPU vs GPU, Single vs Distributed

Instance choice affects both cost and speed. The basic principle is to match the algorithm type.

- **CPU instances (ml.m5, ml.c5)**: Traditional ML like XGBoost, Linear Learner, light training.
- **GPU instances (ml.g5, ml.p4)**: Deep learning (images, text, large neural networks). Massive benefit from parallelized matrix operations.
- **Distributed training**: Set `instance_count` to 2 or higher to split the job across instances. Data parallelism (split data; each instance trains same model) or model parallelism (split model itself; model too large for one GPU).

```python
estimator = PyTorch(
    entry_point='train.py',
    role=role,
    instance_count=4,             # Distributed training across 4 instances
    instance_type='ml.p4d.24xlarge',
    distribution={'torch_distributed': {'enabled': True}},
    ...
)
```

> 💡 **Related Theory**: GPUs accelerate deep learning because the core of neural network training is massive matrix multiplication, and GPUs process such parallel operations across thousands of cores simultaneously. Conversely, tree-based algorithms (XGBoost) make sequential branching decisions, so GPU benefit is limited (though XGBoost does have GPU acceleration options). The starting point is "deep learning → GPU, traditional ML → CPU", and when data or model size exceeds single instances, consider distribution.

## Managed Spot Training: Cut Training Costs by Up to 90%

We said training is a use-once, discard-it batch job. **Managed Spot Training** best exploits this property. Spot instances use AWS spare capacity at steep discounts—up to 90% off on-demand.

The downside is AWS can reclaim capacity, potentially terminating instances mid-training. SageMaker handles this via **checkpoints**. Periodically save mid-training state to S3; if instances are reclaimed and restart, training resumes from the last checkpoint.

```python
estimator = Estimator(
    image_uri=container,
    role=role,
    instance_count=1,
    instance_type='ml.m5.xlarge',
    use_spot_instances=True,          # Enable Spot training
    max_run=3600,                     # Max training time (seconds)
    max_wait=7200,                    # Max wait time including Spot availability (seconds)
    checkpoint_s3_uri='s3://my-bucket/checkpoints/',  # Checkpoint save location
)
```

Here, `max_wait` must be at least `max_run`. Spot requires additional time waiting for available capacity. Also, without `checkpoint_s3_uri`, termination means starting over—potentially worse cost.

> ⚠️ **Pitfall**: "Reduce cost but resume without loss if interrupted" → answer is **Spot + checkpoints**. Spot alone without checkpoints loses progress when terminated. Conversely, "training must not be interrupted, deadline is tight" → use on-demand. Spot suits training with time margin and restart tolerance.

## Summary

Remember Training Job by four axes: ① **Estimator**: Training specification (container, role, instance, hyperparameters). For your script, use Framework Estimator (`entry_point`). ② **Input channels**: Pass channel-data mappings to `fit()`. Input modes are File (download all), Pipe (stream), Fast File. Multi-TB repeated reads → FSx for Lustre. ③ **Instances**: Traditional ML → CPU, deep learning → GPU, if single instance insufficient → distributed (`instance_count` higher). ④ **Spot training**: Up to 90% savings but can interrupt → resume via checkpoints, `max_wait >= max_run`. Key exam mappings: "reduce cost + resume" → Spot+checkpoints, "huge repeated I/O" → FSx.

Next, we look at the actual built-in algorithms for this Training Job and their input formats.

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
