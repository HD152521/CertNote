# Day 3 - Inference Optimization: Neo, Elastic Inference, Inferentia, Inference Pipelines

Operating an endpoint is different from operating it *efficiently*. Unlike training costs, inference costs persist for the entire model lifespan, so optimization directly impacts total cost. SageMaker provides multiple tools to make models faster (lower latency), cheaper (lower cost), and smaller (lighter resource footprint). Today covers SageMaker Neo, Elastic Inference, AWS Inferentia, and throughput strategies like inference pipelines and batching.

## SageMaker Neo: Train Once, Deploy Optimally Anywhere

Neo compiles and optimizes trained models for specific hardware (instances or edge devices). It analyzes the framework model, restructures the compute graph for target hardware, and converts to a lightweight runtime with dependencies removed.

```python
compiled = model.compile(
    target_instance_family="ml_c5",   # or ml_inf1, edge: jetson_nano, etc.
    input_shape={"data": [1, 3, 224, 224]},
    output_path="s3://my-bucket/neo-output/",
    framework="pytorch",
)
```

- **Effect**: Maintains accuracy while boosting inference speed by up to several multiples; reduces memory.
- **Targets**: Cloud instances through ARM-based edge devices (integrates with IoT Greengrass).
- **Frameworks**: TensorFlow, PyTorch, MXNet, XGBoost, ONNX, and major others.

> 💡 **Related Theory**: Neo's core value: "Train with familiar frameworks, deploy as hardware-optimized code." Compiler-stage optimization without model changes (no quantization/pruning) yields speed gains without accuracy loss. See "edge device deployment + latency reduction" → think Neo.

## Elastic Inference (EI): Attach Only the GPU You Need

Full GPU instances are expensive, but most inference workloads don't use 100% GPU. Elastic Inference attaches only the needed GPU acceleration (accelerator) to a CPU instance, lowering cost.

```python
predictor = model.deploy(
    initial_instance_count=1,
    instance_type="ml.m5.large",          # Cheap CPU instance
    accelerator_type="ml.eia2.medium",    # Fractional GPU acceleration attached
)
```

- **When**: Deep learning inference where full GPU instances (ml.p3 etc.) are overkill but CPU-only is too slow.
- **Effect**: Significantly lower inference cost vs. full GPU.
- **Note**: AWS has shifted new workloads toward Inferentia/Neo over EI. Exams present it as "attach partial GPU acceleration to CPU instance for cost savings."

## AWS Inferentia (Inf1/Inf2): Inference-Only Custom Silicon

Inferentia is AWS's custom accelerator designed for inference. Deployed on Inf1/Inf2 instances, targeting lower cost and latency than GPUs at comparable throughput.

```text
GPU Instance (p3)     : General training/inference, expensive
Inferentia (Inf1/Inf2): Inference-only, high throughput/cost-efficiency. Compile with AWS Neuron SDK
Trainium (Trn1)       : Custom training-only chip (NOT inference — frequently appears as distractor)
```

- **Workflow**: Compile model with Neuron SDK (or Neo) for Inferentia → deploy on Inf instances.
- **When**: Large-scale, high-throughput inference where cost/watt efficiency matters more than GPU.
- **Avoid confusion**: Trainium = training, Inferentia = inference. Exams pair them; distinguish them.

## Model-Level Optimization: Quantization, Pruning, Distillation

Before changing hardware, make models smaller.

```text
Quantization : Reduce precision (FP32 → INT8). Shrinks size↓, speeds up, minor accuracy loss possible
Pruning      : Remove low-contribution weights/neurons for lighter footprint
Distillation : Transfer knowledge from large teacher model to smaller student
```

These combine with Neo compilation for even faster, smaller models. Critical in resource-constrained environments like edge deployments.

## Inference Pipelines and Throughput Optimization

Yesterday's inference pipeline matters beyond consistency—it boosts throughput too.

```text
Inference Pipeline : Chain preprocess/predict/postprocess containers, eliminate network round trips
Batch Inference    : Group requests, process together (throughput↑, per-request latency partially sacrificed)
Model Caching (MME): Keep frequently used models resident in memory, eliminate cold-start delays
```

Reduce latency with Neo/Inferentia/EI + model compression. Boost throughput with batching, pipelines, and appropriate horizontal scaling.

> 💡 **Related Theory**: Exam scenarios demand different prescriptions: "reduce latency" vs. "reduce cost" vs. "boost throughput." Lower latency: Neo compile, faster instances. Lower cost: Elastic Inference, Inferentia, Serverless. Higher throughput: batch inference, auto-scale out, Inferentia. Match keywords to tools for points.

## Instance Selection Summary

```text
ml.m5 / ml.c5      : CPU. Light inference, pairs well with Neo
ml.g4dn / ml.g5    : GPU. Standard for deep learning inference
ml.p3 / ml.p4      : High-end GPU. Mostly training, heavy inference
ml.inf1 / ml.inf2  : Inferentia. High-throughput, cost-efficient inference
+ Elastic Inference: Fractional GPU on CPU instance
```

## Summary

Inference optimization splits three ways: "change the model" (quantization, pruning, distillation, Neo), "change the hardware" (Inferentia, Elastic Inference, instance choice), and "change the structure" (inference pipelines, batching). In exams, identify whether cost/latency/throughput is the goal, then match the tool. Tomorrow covers safe deployment: A/B testing, blue/green, canary, shadow, and rollback.

## 📝 연습 문제

**문제 1.** 학습된 PyTorch 모델을 ARM 기반 엣지 디바이스에 배포하면서 추론 지연을 줄이고 메모리 사용을 낮추되 정확도는 유지하고 싶다. 가장 적합한 도구는?

A) Elastic Inference  
B) SageMaker Neo로 대상 하드웨어용 컴파일  
C) Batch Transform  
D) 멀티모델 엔드포인트  

**정답: B**  
해설: Neo는 모델을 대상 하드웨어(엣지 포함)에 맞게 컴파일해 정확도 손실 없이 속도·메모리를 개선한다. Elastic Inference(A)는 클라우드 CPU 인스턴스에 GPU 가속을 붙이는 것이고, Batch(C)는 오프라인 일괄 처리, MME(D)는 다수 모델 호스팅 기법이다.

---

**문제 2.** 대규모 딥러닝 추론 워크로드에서 GPU 인스턴스 대비 더 높은 처리량과 비용 효율을 얻기 위해 AWS가 설계한 추론 전용 칩이 탑재된 인스턴스는?

A) ml.p4 (NVIDIA GPU)  
B) ml.trn1 (Trainium)  
C) ml.inf1/ml.inf2 (Inferentia)  
D) ml.m5 (CPU)  

**정답: C**  
해설: Inferentia는 추론 전용 커스텀 칩으로 Inf1/Inf2 인스턴스에 탑재되어 고처리량·비용 효율을 제공한다. p4(A)는 범용 GPU, Trainium(B)은 학습 전용 칩, m5(D)는 일반 CPU다.

---

**문제 3.** 딥러닝 추론을 하는데 풀 GPU 인스턴스는 사용률이 낮아 비용이 과하고, CPU만으로는 느리다. 별도 칩 컴파일 없이 비용을 낮추는 전통적 방법은?

A) Elastic Inference 가속기를 CPU 인스턴스에 부착  
B) 모든 모델을 INT8로 양자화  
C) Batch Transform으로 전환  
D) Trainium 인스턴스로 이전  

**정답: A**  
해설: Elastic Inference는 저렴한 CPU 인스턴스에 필요한 만큼의 부분 GPU 가속만 붙여, 풀 GPU 대비 비용을 절감하는 방식이다. 양자화(B)는 모델 변경이 필요하고, Batch(C)는 온라인 추론 시나리오가 아니며, Trainium(D)은 학습용이다.

---

**문제 4.** 다음 중 지연(latency) 감소가 아니라 처리량(throughput) 향상을 주목적으로 하는 기법은?

A) Neo 컴파일로 모델 경량화  
B) 더 빠른 단일 인스턴스로 업그레이드  
C) 모델 양자화로 연산량 축소  
D) 여러 추론 요청을 묶는 배치 추론  

**정답: D**  
해설: 배치 추론은 여러 요청을 묶어 한 번에 처리해 단위 시간당 처리량을 높이며, 개별 요청 지연은 일부 희생될 수 있다. Neo 컴파일(A)·빠른 인스턴스(B)·양자화(C)는 주로 개별 요청 지연을 줄이는 데 초점이 있다.

---

**문제 5.** Trainium과 Inferentia를 올바르게 구분한 것은?

A) Trainium은 학습 전용, Inferentia는 추론 전용 칩이다  
B) 둘 다 학습 전용 칩이다  
C) Trainium은 추론 전용, Inferentia는 학습 전용 칩이다  
D) 둘 다 추론 전용이며 차이가 없다  

**정답: A**  
해설: AWS의 커스텀 실리콘에서 Trainium(Trn1)은 학습 전용, Inferentia(Inf1/Inf2)는 추론 전용으로 설계되었다. 둘을 뒤바꾸거나(C) 동일시하는(B, D) 보기는 틀리다.

---
