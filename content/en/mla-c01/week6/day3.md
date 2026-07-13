# Day 3 - Cost & Advanced Inference: Multi-model, Multi-container, Inference Pipeline, Inferentia

Real-time endpoints are powerful but always-on—they cost money. What if you have hundreds of models? Spinning separate endpoints per model explodes instance costs. Plus, what if you need preprocessing before inference and postprocessing after? How do you bundle that into one endpoint? Today we cover advanced patterns that cut costs and handle complex inference flows in a single endpoint. MLA-C01 tests this topic via keywords like "hundreds of models," "preprocessing + inference in one endpoint," and "slash deep-learning inference cost."

Distinguish 4 core concepts. **Multi-model Endpoint (MME)** swaps many models via same container dynamically. **Multi-container Endpoint (MCE)** hosts different framework containers in one endpoint. **Inference Pipeline** chains preprocessing → inference → postprocessing via sequential containers. **Inferentia/Elastic Inference** cuts deep-learning inference cost.

## Multi-model Endpoint (MME) — Many Models in One Endpoint

Multi-model endpoint serves **many models using same framework/container** behind a single endpoint, sharing instance resources. Model artifacts sit in S3; on invocation, needed model loads into memory dynamically; unused models unload. Hundreds to thousands of models run on a few instances—dramatic cost reduction.

```python
# Specify which model at invocation via TargetModel
response = runtime.invoke_endpoint(
    EndpointName="mme-endpoint",
    TargetModel="customer-segment-A.tar.gz",   # specific model from S3
    ContentType="text/csv",
    Body="5.1,3.5,1.4,0.2",
)
```

Classic case: "model differs per customer/region/user." If 1,000 stores each have demand-forecast model, handle all via one MME instead of 1,000 endpoints.

> 💡 **Related Theory**: MME caches models in memory. Frequent models stay resident—fast. First invocation of a model not in memory means S3 load (cold-start delay). So **MME maximizes cost efficiency when you have many models but low/uneven per-model call frequency**. If all models get simultaneous high-frequency calls, memory thrashing occurs—unsuitable. Also critical: all MME models **must use identical framework/container**.

## Multi-container Endpoint (MCE) — Different Frameworks in One Endpoint

Multi-container endpoint hosts **different containers (different frameworks)** in single endpoint, up to 15 max. Example: TensorFlow model and PyTorch model in same endpoint; on invocation, specify which container (direct-invoke mode). MME is "same container + many models"; MCE is "different containers + few models."

```python
# Direct-invoke mode: specify container via TargetContainerHostname
response = runtime.invoke_endpoint(
    EndpointName="mce-endpoint",
    TargetContainerHostname="tensorflow-container",
    ContentType="application/json",
    Body='{"instances": [[1.0, 2.0, 3.0]]}',
)
```

> ⚠️ **Trap**: Confusing MME and MCE flunks exams. **MME** = same container, very many (hundreds to thousands) models, `TargetModel` specification, dynamic S3 load. **MCE** = different framework containers, max 15, `TargetContainerHostname` specification. "Multiple models with different frameworks in one endpoint" → MCE. "Same kind of model hundreds of times to cut endpoint/instance cost" → MME.

## Inference Pipeline — Chain Preprocessing, Inference, Postprocessing

Inference Pipeline chains 2–15 containers in **linear sequence**. First container output feeds next container input; single `InvokeEndpoint` call executes preprocessing → model inference → postprocessing all sequentially in same instance. No network round-trips; entire flow ends in one endpoint.

Typical stack: SageMaker **SparkML/scikit-learn preprocessing container → XGBoost model container**. Preprocessing logic applied during training (scaling, encoding) applies identically during inference, preventing training-serving skew.

```python
from sagemaker.pipeline import PipelineModel

pipeline_model = PipelineModel(
    name="preprocess-predict-pipeline",
    role=role,
    models=[sklearn_preprocessor_model, xgboost_model],  # order = execution order
)
pipeline_model.deploy(initial_instance_count=1, instance_type="ml.m5.xlarge")
```

> 🔍 **Deep Dive**: Inference Pipeline's value is **training-serving consistency**. Roll preprocessing into application code separately, training and inference subtly diverge—performance quietly degrades (training-serving skew). Package preprocessing as pipeline container alongside model, same code is guaranteed both ways. All containers run in same instance, so inter-container comms are local—fast. "Apply preprocessing identically to inference as training" → Inference Pipeline is the answer.

## Inferentia — Dedicated Chip to Cut Deep-learning Inference Cost

AWS Inferentia (`ml.inf1`, `ml.inf2`) is acceleration chip AWS designed for inference-only. Deep-learning inference costs and latency per inference drop vs. equivalent GPU. To run model on Inferentia, compile with **AWS Neuron SDK**; SageMaker Neo automates.

> 💡 **Related Theory**: Inferentia is *the* answer for "run deep-learning inference at scale, low cost." Transformer and CNN inference workloads favor throughput-per-dollar vs. GPU. Caveat: model must compile to Neuron, so "just deploy" plus one step. Exam: condition says "deep-learning inference, GPU cost too high, keep throughput, drop cost" → Inferentia (inf1/inf2) is correct.

## Elastic Inference — (Legacy) Attach Partial GPU

Elastic Inference (EI) attached **fractional GPU acceleration** to CPU instance as accelerator, cheaper than full GPU instance for deep-learning inference. Bridged the gap: "full GPU overkill, CPU alone too slow."

> ⚠️ **Trap**: Elastic Inference currently not recommended for new use; AWS guides **replacement by Inferentia**. Old materials or past exams list EI as correct, but latest scenarios: "slash deep-learning inference cost" → Inferentia first. Memorize EI concept (fractional GPU), but prioritize Inferentia for real-world and current exams.

## Cost-Reduction Patterns Summary

Map advanced inference by cost in one line:

- Many models same type → **MME** (consolidated endpoint/instance cost)
- Intermittent traffic → **Serverless/Async** (scale to zero; see Day 1, 4)
- Deep-learning inference cost too high → **Inferentia(inf1/inf2)**
- Bundle preprocessing/postprocessing in one endpoint → **Inference Pipeline** (consistency/simplification over cost)
- Different frameworks in one endpoint → **MCE**

## Summary

Advanced inference clarifies by "what you bundle in one endpoint." ① **MME**: same container + hundreds to thousands models, `TargetModel`, dynamic S3 load, cost savings with many models. ② **MCE**: different framework containers, max 15, `TargetContainerHostname`. ③ **Inference Pipeline**: preprocessing → inference → postprocessing linear chain, training-serving consistency. ④ **Inferentia(inf1/inf2)**: cut deep-learning inference cost/latency, requires Neuron compile. ⑤ **Elastic Inference**: fractional GPU acceleration (legacy, replaced by Inferentia).

Next we dive deeper into batch transform and serverless inference, covering batch tuning and concurrency–cost tradeoffs.

---

## 📝 연습 문제

**문제 1.** 전국 1,500개 매장에 매장별 수요 예측 XGBoost 모델이 있다. 각 매장 모델은 가끔 호출되며, 1,500개 엔드포인트를 띄우는 비용이 부담이다. 가장 적절한 배포 방식은?

A) 멀티컨테이너 엔드포인트(MCE)  
B) 멀티모델 엔드포인트(MME)  
C) 매장마다 별도 실시간 엔드포인트  
D) 추론 파이프라인  

**정답: B**  
해설: "같은 프레임워크(XGBoost) 모델이 매우 많고 개별 호출 빈도가 낮다"는 MME의 정확한 조건으로, 모델들을 소수 인스턴스에 공유 서빙해 비용을 크게 낮춘다. A는 서로 다른 프레임워크 소수 모델용이고, C는 1,500개 엔드포인트로 비용이 폭발하며, D는 전처리·추론 체인용이라 다수 모델 서빙과 무관하다.

---

**문제 2.** 학습 시 적용한 스케일링·인코딩 전처리를 추론 시에도 정확히 동일하게 적용해 training-serving skew를 막고, 한 번의 호출로 전처리와 추론을 모두 처리하고 싶다. 적절한 방식은?

A) 멀티모델 엔드포인트  
B) 추론 파이프라인(전처리 컨테이너 → 모델 컨테이너)  
C) 배치 변환  
D) 멀티컨테이너 엔드포인트  

**정답: B**  
해설: 추론 파이프라인은 전처리 컨테이너와 모델 컨테이너를 선형으로 묶어 한 호출로 전처리→추론을 같은 인스턴스에서 실행하므로, 학습과 동일한 전처리 코드를 추론에 보장해 skew를 막는다. A는 다수 모델 서빙, C는 일괄 처리, D는 서로 다른 프레임워크를 독립 호출하는 구조로 전처리-추론 체인 목적과 다르다.

---

**문제 3.** 대규모 트랜스포머 기반 NLP 모델을 실시간 추론하는데 GPU 인스턴스 비용이 너무 높다. 처리량은 유지하면서 추론당 비용을 낮추려 한다. 가장 적절한 선택은?

A) CPU 인스턴스(ml.m5)로 교체  
B) AWS Inferentia(ml.inf2) 인스턴스로 모델을 컴파일해 배포  
C) 멀티모델 엔드포인트  
D) 인스턴스 수를 절반으로 줄인다  

**정답: B**  
해설: Inferentia는 딥러닝 추론 전용 칩으로 동급 GPU 대비 추론당 비용과 지연을 낮추므로, "딥러닝 추론 비용 절감 + 처리량 유지"의 정답이다. A는 트랜스포머 추론에서 CPU가 너무 느려 처리량을 유지 못 하고, C는 단일 대형 모델엔 무관하며, D는 단순 축소로 처리량이 떨어진다.

---

**문제 4.** 한 엔드포인트에 TensorFlow 이미지 분류 모델과 PyTorch 텍스트 모델을 함께 배포하고, 호출 시 어느 컨테이너를 쓸지 직접 지정하려 한다. 적절한 방식은?

A) 멀티모델 엔드포인트(TargetModel 사용)  
B) 멀티컨테이너 엔드포인트(TargetContainerHostname 사용)  
C) 추론 파이프라인  
D) 두 개의 별도 서버리스 엔드포인트만 가능  

**정답: B**  
해설: 서로 다른 프레임워크(TensorFlow, PyTorch) 컨테이너를 한 엔드포인트에 두고 `TargetContainerHostname`으로 직접 지정하는 것은 멀티컨테이너 엔드포인트(MCE)의 기능이다. A의 MME는 동일 컨테이너 전제라 프레임워크가 다르면 부적합하고, C는 컨테이너를 순차 체인으로 실행하는 것이지 선택 호출이 아니며, D는 한 엔드포인트 통합이 불가능하다는 잘못된 주장이다.

---

**문제 5.** Elastic Inference에 관한 설명으로 가장 정확한 것은?

A) 딥러닝 추론 비용 절감의 최신 일차 권장 방식이다  
B) CPU 인스턴스에 분수 GPU 가속을 붙이는 레거시 기능이며 최신 권장은 Inferentia로의 대체다  
C) 모델을 S3에서 동적 로드하는 멀티모델 기능이다  
D) 전처리와 추론을 묶는 파이프라인 기능이다  

**정답: B**  
해설: Elastic Inference는 CPU 인스턴스에 GPU 가속의 일부(분수)를 붙여 딥러닝 추론을 가속하던 기능이지만, 현재는 신규 사용이 권장되지 않고 AWS가 Inferentia로의 전환을 안내한다. A는 최신 일차 권장이 Inferentia라는 점과 배치되고, C는 MME, D는 추론 파이프라인의 설명으로 EI와 무관하다.

---
