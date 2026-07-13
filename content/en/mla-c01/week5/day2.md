# Day 2 - Distributed Training: Data Parallel and Model Parallel

When a model doesn't fit on one device or data is so large that one GPU takes days, you must split training across multiple devices/GPUs. This is distributed training. The core is "what do you split"—data or model—two branches.

In the MLA-C01 exam, distributed training appears in symptoms like "model doesn't fit GPU memory", "training is too slow", "train billions-parameter model". Today we cover data parallelism, model parallelism, and SageMaker's distributed training libraries.

## Data Parallel vs Model Parallel

First clarify the two distributed paradigms:

| Distinction | Data Parallel | Model Parallel |
|---|---|---|
| What splits | Data (batches) distributed per GPU | Model itself divided across GPUs |
| Each GPU has | Complete model replica | Part of model layers/parameters |
| Solves problem | Training speed (throughput) | Model doesn't fit one GPU memory |
| Synchronization | Gradients all-reduce averaged | Activations·gradients passed between stages |
| Typical use | Data large, model fits GPU | Ultra-large models (billions parameters) |

Core intuition: **Data parallel when "model fits but slow", model parallel when "model itself doesn't fit"**. Exam keywords "out of memory / model too large" → model parallel, "training takes too long / data huge" → data parallel.

> 💡 **Related Theory**: Data parallel's mathematical basis is minibatch gradient linearity. Full batch gradient equals average of partial batch gradients computed per GPU. So each GPU processes its batch slice with model replicas, then all-reduce averages gradients—mathematically equivalent to one large batch update on one device. Model parallel differs: you literally cut the computation graph so one GPU's output becomes the next GPU's input, making GPU interdependency and communication cost inherently larger.

## Data Parallel: Boost Throughput

Data parallel is the most common distributed approach. Each GPU (or device) has complete model replica, performs forward/backward on different data slices, then collects and averages gradients.

```
[GPU 0]  batch slice 0  →  gradient g0  ┐
[GPU 1]  batch slice 1  →  gradient g1  ├─ all-reduce → average ḡ → all GPU same update
[GPU 2]  batch slice 2  →  gradient g2  ┘
```

```python
from sagemaker.pytorch import PyTorch

estimator = PyTorch(
    entry_point='train.py',
    instance_type='ml.p4d.24xlarge',
    instance_count=2,                       # Multiple devices
    framework_version='2.0', py_version='py310',
    distribution={                          # Enable SageMaker data parallel
        'smdistributed': {'dataparallel': {'enabled': True}}
    }
)
```

**SageMaker Distributed Data Parallel (SMDDP)** provides all-reduce optimized for AWS networking (EFA etc.), better communication efficiency than vanilla PyTorch DDP. Scaling data parallel grows throughput nearly linearly, though not infinitely due to communication overhead.

> ⚠️ **Pitfall**: Scale GPU count by N and effective batch size also becomes N×. Leaving learning rate unchanged can hurt convergence—typically adjust learning rate alongside (e.g., linear scaling). Exams target the misconception "adding GPUs automatically trains better".

## Model Parallel: Split the Model

Model parallel when the model itself doesn't fit one GPU memory. Billions-to-hundreds-of-billions parameter LLMs exemplify this. Model parallel has two facets:

- **Tensor/Pipeline sharding**: Distribute layers across GPUs, where one GPU's output feeds next GPU's input (pipeline parallel), or split one layer's tensor ops themselves (tensor parallel).
- **Sharding**: Distribute optimizer state, gradients, parameters across GPUs to save memory (ZeRO/FSDP family).

```python
estimator = PyTorch(
    entry_point='train.py',
    instance_type='ml.p4d.24xlarge', instance_count=2,
    framework_version='2.0', py_version='py310',
    distribution={
        'smdistributed': {
            'modelparallel': {                 # SageMaker model parallel
                'enabled': True,
                'parameters': {'partitions': 4, 'tensor_parallel_degree': 2}
            }
        }
    }
)
```

**SageMaker Distributed Model Parallel (SMP)** automates model splitting, pipeline execution, sharding. Users don't manually assign layers to GPUs; the library figures out partition strategy to fit memory.

> 💡 **Related Theory**: Splitting huge models' core tradeoff is "memory savings vs communication cost". Finer splits reduce per-GPU memory but increase activation·parameter transfers between GPUs, slowing it down. So practice combines data·tensor·pipeline parallelism and sharding into "hybrid parallelism". For example, within-node uses tensor parallel (fast NVLink), across-nodes uses data parallel (relatively slow network), tuning communication pattern to topology.

## Large-Scale Training Infrastructure

Distributed performance driven not just by algorithm but infrastructure:

- **EFA (Elastic Fabric Adapter)**: Low-latency high-bandwidth inter-node network. Reduces distributed training's all-reduce communication bottleneck. Enabled on GPU instances like p4d/p5.
- **FSx for Lustre**: High-throughput parallel file system. Supplies large training data to GPUs faster than S3, reducing data loading bottleneck.
- **Instance choice**: Multi-GPU single-node (e.g., p4d.24xlarge = 8 GPUs) uses fast NVLink within-node. Multiple nodes use EFA for inter-node.

```
S3 (raw data source)
   └─ FSx for Lustre (fast cache) → rapidly supplies multiple training nodes
Training nodes ── EFA (low-latency network) ── all-reduce / model parallel comms
```

> 📚 **Case**: A research team tried training a 7B-parameter model on single ml.g5 instance, hit GPU OOM. Adding data parallel nodes didn't help—replicas still didn't fit one GPU. Using SMP's model parallel+sharding distributed params and optimizer state across GPUs, fitting in memory; EFA between nodes and FSx for Lustre for data supply greatly cut training time. Lesson: OOM solved by model parallel, not GPU addition (data parallel).

## How to Choose

Decision flow: ① Does model fit one GPU? Fits but slow → **data parallel** (add GPU/nodes, SMDDP). ② Doesn't fit (OOM) → **model parallel/sharding** (SMP). ③ Both → hybrid. Additionally, if data loading bottleneck → FSx for Lustre, if inter-node comms bottleneck → EFA. "Faster" maps to data parallel, "doesn't fit" to model parallel.

## Summary

Distributed training splits by "what to divide". **Data parallel** divides data per GPU, each learns with model replica, then all-reduce averages gradients, solving training speed (throughput) issues (SMDDP). **Model parallel** divides model itself across GPUs/shards, training ultra-large models that don't fit one GPU memory (SMP). Infrastructure adds EFA for inter-node comms, FSx for Lustre for data supply. Exams: "OOM/model too large" → model parallel, "slow/data large" → data parallel.

Next we see debugging and profiling—looking inside at how training runs, where it slows, where it breaks.

---

## 📝 연습 문제

**문제 1.** 학습할 모델은 단일 GPU 메모리에 충분히 들어가지만, 데이터셋이 매우 커서 한 GPU로는 학습이 며칠 걸린다. 가장 적합한 분산 전략은?

A) 모델 병렬로 모델을 여러 GPU에 분할  
B) 데이터 병렬로 여러 GPU/노드에 배치를 분배하고 그래디언트를 all-reduce  
C) 배치 크기를 1로 줄인다  
D) 학습을 CPU로 옮긴다  

**정답: B**  
해설: 모델이 GPU에 들어가는데 느린 경우는 처리량 문제이므로 데이터 병렬로 여러 장비에 데이터를 분배해 거의 선형으로 속도를 높인다. A는 모델이 안 들어갈 때 쓰는 전략이라 불필요하고, C는 오히려 느려지며, D는 GPU 가속을 버리는 잘못된 선택이다.

---

**문제 2.** 70억 파라미터 모델을 학습하려는데 단일 GPU에서 메모리 부족(OOM)이 발생한다. 데이터 병렬로 노드를 추가해도 해결되지 않는다. 근본 해결책은?

A) 데이터 병렬 GPU 수를 두 배로 늘린다  
B) SageMaker 모델 병렬(SMP)로 모델 파라미터·옵티마이저 상태를 여러 GPU에 분할·샤딩한다  
C) 학습률을 낮춘다  
D) 에폭 수를 줄인다  

**정답: B**  
해설: OOM은 모델 복제본 자체가 한 GPU에 안 들어가는 문제로, 데이터 병렬은 각 GPU에 전체 복제본을 두므로 해결되지 않는다. 모델 병렬/샤딩으로 모델을 GPU 간에 나눠야 한다. A는 같은 OOM이 반복되고, C·D는 메모리 사용량과 무관하다.

---

**문제 3.** 데이터 병렬에서 GPU 수를 늘려 유효 배치 크기가 커졌다. 이때 흔히 함께 조정해야 하는 것은?

A) 모델 아키텍처  
B) 학습률(예: 배치 증가에 맞춰 스케일링)  
C) S3 버킷 리전  
D) IAM 역할  

**정답: B**  
해설: 데이터 병렬로 유효 배치가 커지면 학습률을 그대로 두면 수렴이 나빠질 수 있어 보통 학습률을 함께 조정(linear scaling 등)한다. A는 분산 전략과 무관하게 바꿀 이유가 없고, C·D는 학습 수렴과 관계없는 설정이다.

---

**문제 4.** 다수 GPU 노드 간 all-reduce 통신이 병목이 되어 분산 학습 확장 효율이 떨어진다. AWS에서 노드 간 저지연 고대역 통신을 제공하는 것은?

A) Elastic Fabric Adapter (EFA)  
B) Amazon SQS  
C) CloudFront  
D) Route 53  

**정답: A**  
해설: EFA는 HPC·분산 학습용 저지연 고대역 네트워크 인터페이스로, p4d/p5 등에서 노드 간 all-reduce 통신 병목을 줄인다. B는 메시지 큐, C는 CDN, D는 DNS로 모두 분산 학습의 GPU 간 통신과 무관하다.

---

**문제 5.** 대용량 학습 데이터를 여러 GPU 노드에 고처리량으로 공급해 데이터 로딩 병목을 줄이려 한다. 적합한 서비스는?

A) S3에서 매 스텝마다 단건 GET  
B) FSx for Lustre 고성능 병렬 파일시스템으로 S3 데이터를 캐시·공급  
C) DynamoDB 테이블 스캔  
D) EBS 단일 볼륨을 한 노드에만 부착  

**정답: B**  
해설: FSx for Lustre는 S3와 연동되는 고처리량 병렬 파일시스템으로 대규모 학습 데이터를 여러 노드에 빠르게 공급해 로딩 병목을 줄인다. A는 단건 호출로 처리량이 낮고, C는 분석용 NoSQL로 부적합하며, D는 단일 노드 전용이라 분산 공급이 안 된다.

---
