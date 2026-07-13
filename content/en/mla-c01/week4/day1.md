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

## 📝 연습 문제

**문제 1.** 학습 비용을 최대한 줄이고 싶지만, 인스턴스가 중간에 회수되어 학습이 중단되어도 진행 상황을 잃지 않고 재개되어야 한다. 가장 적합한 구성은?

A) 온디맨드 인스턴스로 학습하고 인스턴스 수를 늘린다  
B) Managed Spot Training을 켜고 checkpoint_s3_uri로 체크포인트를 저장한다  
C) Spot 인스턴스만 켜고 체크포인트는 설정하지 않는다  
D) 학습을 여러 번 반복 실행한다  

**정답: B**  
해설: Spot은 최대 90% 비용을 절감하지만 회수로 중단될 수 있어, 체크포인트를 S3에 저장하면 마지막 지점부터 재개해 진행분을 잃지 않는다. A는 비용 절감 효과가 없고, C는 중단 시 처음부터 다시 학습해 손실이 발생하며, D는 매번 처음부터 시작하는 비효율적 방식이다.

---

**문제 2.** 수 TB 규모의 학습 데이터를 여러 epoch에 걸쳐 반복적으로 읽는 대규모 분산 학습에서, 매 epoch마다 S3에서 데이터를 다시 받느라 I/O가 병목이다. 가장 적합한 데이터 소스는?

A) S3 File 모드  
B) FSx for Lustre  
C) 로컬 노트북 디스크  
D) DynamoDB  

**정답: B**  
해설: FSx for Lustre는 고성능 병렬 파일시스템으로, 한 번 올려두면 저지연으로 반복 접근할 수 있어 대용량 데이터를 여러 epoch 반복 읽는 학습의 I/O 병목을 해소한다. A는 매 시작 시 전체 다운로드가 필요하고, C는 학습 규모에 맞지 않으며, D는 key-value 저장소로 대량 학습 데이터 스트리밍에 부적합하다.

---

**문제 3.** 직접 작성한 PyTorch 학습 스크립트(train.py)를 SageMaker Training Job으로 실행하려 한다. 올바른 접근은?

A) 빌트인 XGBoost 컨테이너에 스크립트를 넣는다  
B) PyTorch 프레임워크 Estimator의 entry_point에 train.py를 지정한다  
C) 추론 엔드포인트를 먼저 생성한다  
D) Feature Store에 스크립트를 적재한다  

**정답: B**  
해설: 프레임워크 Estimator(PyTorch 등)는 entry_point로 사용자 학습 스크립트를 받아 해당 프레임워크 컨테이너에서 실행하므로 커스텀 PyTorch 코드 학습에 적합하다. A는 무관한 알고리즘 컨테이너이고, C는 추론용이라 학습 단계와 맞지 않으며, D는 특성 저장소로 학습 코드 실행과 무관하다.

---

**문제 4.** SageMaker Training Job이 정상 완료된 직후의 동작으로 옳은 것은?

A) 학습 인스턴스가 계속 떠 있으면서 추론 요청을 처리한다  
B) 모델 아티팩트를 output_path의 S3에 저장하고 학습 인스턴스를 자동 종료한다  
C) 인스턴스가 종료되며 모델도 함께 삭제된다  
D) 데이터를 자동으로 Feature Store에 적재한다  

**정답: B**  
해설: Training Job은 학습 완료 후 model.tar.gz를 지정한 S3에 업로드하고 인스턴스를 자동으로 내려 과금을 멈춘다. A는 추론 엔드포인트의 동작이고, C는 모델이 S3에 보존되므로 틀리며, D는 학습 작업이 자동으로 수행하지 않는다.

---

**문제 5.** Managed Spot Training을 설정할 때 max_run과 max_wait의 관계로 올바른 것은?

A) max_wait는 항상 max_run보다 작아야 한다  
B) max_wait는 max_run보다 크거나 같아야 한다(Spot 용량 대기 시간 포함)  
C) 둘은 항상 같아야 한다  
D) max_wait는 Spot에서 의미가 없다  

**정답: B**  
해설: Spot은 가용 용량을 기다리는 시간이 추가로 필요하므로 대기 포함 총 시간인 max_wait가 실제 학습 시간 상한인 max_run보다 크거나 같아야 한다. A는 반대로 설정한 것이고, C는 대기 시간을 고려하지 못하며, D는 Spot 학습에서 max_wait가 필수 파라미터라는 점과 어긋난다.

---
