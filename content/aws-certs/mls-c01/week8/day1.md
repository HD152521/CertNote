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

## 📝 연습 문제

**문제 1.** 학습 데이터가 8TB로 학습 인스턴스의 EBS 볼륨보다 훨씬 크다. 다운로드 대기 없이 바로 학습을 시작하고 스토리지 비용을 줄이려 한다. 가장 적절한 입력 모드는?

A) Pipe 모드로 S3에서 스트리밍  
B) File 모드로 전체 다운로드 후 시작  
C) 데이터를 EFS로 복사 후 File 모드  
D) 데이터를 인스턴스에 수동으로 복사  

**정답: A**  
해설: Pipe 모드는 S3에서 데이터를 스트리밍해 다운로드 완료를 기다리지 않고 학습을 시작하며, 전체를 EBS에 담지 않아 스토리지도 절감한다. File 모드(B, C)는 디스크에 전체를 받아야 하므로 8TB에선 시작 지연·비용이 크고, 수동 복사(D)는 관리형 학습 흐름과 맞지 않는다.

---

**문제 2.** 한 팀이 매우 큰 트랜스포머 모델을 학습하려는데 단일 GPU 메모리를 초과해 OOM이 발생한다. 가장 적절한 분산 전략은?

A) 데이터 병렬(Data Parallel)  
B) 모델 병렬(Model Parallel)  
C) 인스턴스 수만 늘리고 배치 크기 축소  
D) CPU 인스턴스로 전환  

**정답: B**  
해설: 모델 자체가 단일 디바이스 메모리에 들어가지 않는 경우 모델을 여러 디바이스로 쪼개는 모델 병렬이 정답이다. 데이터 병렬(A)은 모델 복제본을 각 디바이스에 두므로 OOM을 해결하지 못하고, 배치 축소(C)는 근본적 모델 크기 문제를 해결하지 못하며, CPU 전환(D)은 비현실적으로 느리다.

---

**문제 3.** Managed Spot Training으로 학습 비용을 절감하려 한다. Spot 중단 후에도 학습을 처음부터 다시 하지 않고 이어서 진행하려면 반드시 필요한 설정은?

A) instance_count를 2 이상으로 설정  
B) 입력 모드를 Pipe로 변경  
C) checkpoint_s3_uri로 체크포인트를 S3에 저장  
D) max_run을 max_wait보다 크게 설정  

**정답: C**  
해설: Spot 인스턴스는 중단될 수 있으므로 체크포인트를 S3(checkpoint_s3_uri)에 저장해야 중단 후 그 지점부터 재개된다. 인스턴스 수(A)·입력 모드(B)는 재개와 무관하고, Spot에서는 오히려 max_wait가 max_run보다 크거나 같아야 하므로 D는 반대로 서술되어 틀렸다.

---

**문제 4.** SageMaker 학습 컨테이너에서 학습이 끝난 뒤 모델 산출물이 자동으로 S3(output_path)로 업로드되도록 하려면 모델 파일을 어느 경로에 기록해야 하는가?

A) /opt/ml/input/data/  
B) /tmp/output/  
C) /opt/ml/checkpoints/  
D) /opt/ml/model/  

**정답: D**  
해설: SageMaker는 학습 종료 시 `/opt/ml/model/` 디렉터리의 내용을 tar.gz로 묶어 output_path로 자동 업로드한다. 입력 채널 경로(A)·임의 경로(B)·체크포인트 경로(C)에 쓴 산출물은 모델 아티팩트로 업로드되지 않는다.

---

**문제 5.** Managed Spot Training을 설정할 때 반드시 만족해야 하는 파라미터 제약으로 옳은 것은?

A) max_wait는 max_run 이상이어야 한다  
B) max_wait는 max_run보다 작아야 한다  
C) use_spot_instances는 분산 학습에서만 가능하다  
D) Spot은 GPU 인스턴스에서만 지원된다  

**정답: A**  
해설: max_wait는 Spot 용량 확보 대기 시간까지 포함하므로 실제 학습 시간 상한인 max_run 이상으로 설정해야 한다. B는 부등호가 반대라 틀렸고, Spot은 분산 여부와 무관하게 쓸 수 있으며(C), CPU/GPU 모두에서 지원되므로(D) 틀렸다.

---
