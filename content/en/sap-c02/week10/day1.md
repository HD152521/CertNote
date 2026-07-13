# Day 1 - SageMaker Deep Dive: ML Lifecycle, 4 Types of Inference Endpoints, Training Cost Math

The most common trap for engineers designing ML infrastructure for the first time is thinking "can't we just deploy the model to EC2 and serve it with Flask?" It's true that deploying a model itself isn't hard. The problem comes after. When data changes, model performance silently degrades (drift). Features used during training diverge subtly from those used during inference, degrading accuracy (train-serve skew). Each time you redeploy a model, there's downtime. GPU instance costs arrive in the end-of-month bill as a shock. SageMaker is a managed platform that bundles all of this "everything after the model" into one offering. In the SAP-C02 exam, SageMaker isn't a single feature but rather architectural decision-making around "which inference pattern should we choose?", "how do we reduce training costs by 90%?", and "how do we automate retraining?"

Today, instead of listing SageMaker components, we'll deconstruct why the ML lifecycle looks the way it does, how the 4 inference endpoint types diverge from physical constraints, and how the cost math of Spot training works.

## ML Lifecycle — Why Isn't "Deploy" The End?

Traditional software reaches a fixed behavior once deployed. For input X, it always produces output Y. Machine learning systems are different. The model's behavior is **bound to the data distribution at training time**, and as the world changes, that distribution shifts. A fraud detection model trained in 2019 saw accuracy plummet in 2020 when pandemic consumption patterns shifted radically. The code never changed—but the model started "failing." This is why the ML lifecycle is a loop: Data collection → Feature engineering → Training → Evaluation → Deploy → **Monitor** → (drift detected) → Retrain → back to the start.

SageMaker components map each stage of this cycle. Data Wrangler/Processing Job (features), Training Job (training), Model Registry (versioning·approval), Endpoint (serving), Model Monitor (monitoring), Pipelines (full DAG orchestration). In the exam, understanding component names matters less than pinpointing "which stage of the lifecycle does this scenario address?"

> 💡 **Related Theory**: This cycle was formalized by Google in their 2015 NeurIPS paper "Hidden Technical Debt in Machine Learning Systems." The core argument: "ML code accounts for only 5% of the entire system; the remaining 95% is infrastructure for data collection, validation, serving, and monitoring." Managed ML platforms like SageMaker, Vertex AI, and Azure ML all attempt to productize that 95%. From a SAP perspective, the reason problems like "we built an ML model but it keeps breaking in production" almost always trace back to infrastructure (Feature Store, Model Monitor, Pipelines) is precisely this structural insight from that paper.

> 🔍 **Deep Dive**: SageMaker launched at re:Invent 2017. Before that, AWS ML meant running Spark MLlib on EMR or installing frameworks directly on EC2. SageMaker's core design decision was **abstracting training and inference into containers**. Every training job and inference endpoint runs as a Docker image in ECR. You can use AWS-provided built-in algorithm containers (XGBoost, Linear Learner, etc.), wrap your own code in a framework container like TensorFlow/PyTorch (script mode), or bring a completely custom container via BYOC (Bring Your Own Container). This container abstraction enables complete separation of training and serving resources—"training on 8 GPUs for 1 hour, serving on 1 CPU continuously"—optimizing costs dramatically.

## Inference Endpoints: 4 Types — Physical Constraints Drive the Choice

The reason SageMaker's inference options split into 4 types isn't marketing—it's **request payload size, latency requirements, and traffic patterns**, three axes of physical constraint.

**Real-Time Endpoint** keeps instances running continuously, sending synchronous requests and receiving responses in tens of milliseconds. It's used for online inference where users wait—recommendations, fraud detection. The downside: instance costs keep accruing even with zero traffic.

**Serverless Inference** spins up a container only when requests arrive, scaling to zero when done. It eliminates idle costs for bursty or unpredictable traffic. The tradeoff: **cold start** — when no requests arrive for a while and one does, it takes hundreds of milliseconds to seconds to spin up the container. This works if you tolerate occasional cold starts with variable traffic.

**Async Inference** enqueues requests, processes them, writes results to S3, and notifies via SNS. It supports **payloads up to 1GB, processing up to 15 minutes (now up to 1 hour)**. Use it for large images/videos/documents or models that take minutes to infer. It's the answer for workloads where synchronous responses are impossible. When there's no traffic, instances can scale to zero.

**Batch Transform** isn't an endpoint—it's a one-time batch job. It runs inference across an entire S3 dataset and writes results back to S3. Use it for offline scoring where real-time serving isn't needed (e.g., nightly batch updating churn predictions for all customers).

> 🎯 **Scenario**: "A user uploads a 500MB satellite image; the model analyzes it with ~3 minutes inference latency. Synchronous HTTP response would timeout. Traffic is ~dozens of requests daily, irregular. What's the optimal setup?" — Answer: **Async Inference**. Why: (1) 500MB payload exceeds Real-Time/Serverless's 6MB limit but fits Async's 1GB limit, (2) 3-minute inference exceeds sync response; Async's queue-based nature handles it, (3) irregular traffic means Async can scale to zero. Batch Transform also handles large payloads but processes entire datasets, not individual request-response patterns—wrong fit here. Trap: "large payload + long inference + per-request" = Async; "full dataset batch" = Batch.

> ⚠️ **Trap**: Real-Time and Serverless payload limits are 6MB, and response timeout is 60 seconds. If you think "just send the large file to a real-time endpoint," you'll fail the exam. Anything over 6MB or exceeding 60 seconds must go to Async or Batch. Also, Serverless Inference doesn't support GPUs (as of 2024, mostly CPU/limited), so heavy deep learning inference needs Real-Time GPU endpoints.

## Multi-Model / Multi-Container — Multiple Models in One Endpoint

If you run hundreds or thousands of small models (e.g., per-customer models) on separate endpoints, instance costs explode. **Multi-Model Endpoint (MME)** puts multiple models on one endpoint (one instance), dynamically loading the requested model from S3 into memory when invoked. Infrequently used models are evicted from memory, managed like an LRU cache. Thousands of models can be served on a handful of instances, slashing costs dramatically.

**Multi-Container Endpoint** runs different framework/model containers on one endpoint, either invoking them directly or chaining them in an inference pipeline (serial).

> 🔍 **Deep Dive**: MME is efficient because of "long-tail traffic" distribution. You might have 1000 per-customer models, but only a few are actively used at any moment. The rest are called occasionally. Giving each model its own instance leaves 99% of instances idle. MME keeps active models in memory and others in S3, loading on demand—it shares instance memory like a cache. The tradeoff: cache misses (first call to a cold model) incur S3 loading latency. This mirrors exactly how CPU cache hierarchies work (L1/L2/memory/disk)—fast resources are small and expensive, so you keep frequently-used data there and keep the rest in slower tiers.

## Training Cost Math — Why Managed Spot Training Achieves 90%

ML training uses GPU instances (ml.p3, ml.p4, ml.g5), which dominate SageMaker costs. ml.p3.2xlarge costs ~$3.8/hour, ml.p4d.24xlarge ~$37/hour. Training a large model for days costs thousands of dollars.

**Managed Spot Training** uses EC2 Spot instances (AWS's spare capacity at up to 90% discount) for training. Spot's risk: AWS can reclaim the instance with 2 minutes notice. If reclaimed at 90% progress, you start over—catastrophic. SageMaker solves this with **Checkpointing**. It periodically saves training state (weights) to S3 (`checkpoint_s3_uri`), and if Spot reclaims it, a new Spot resumes from the last checkpoint. You get a 90% discount while still completing the job.

The cost math concretely: On-Demand 10-hour training = ml.p3.2xlarge × $3.8 × 10 = $38. Spot for the same training = $38 × (1 − 0.7~0.9) ≈ $4~11. But if Spot reclamations cause frequent restarts, real wall-clock time increases; you must set `max_wait` (maximum time including waiting) significantly higher than `max_run` (pure training time).

> 💡 **Related Theory**: The Spot + Checkpoint pattern is the **checkpoint-restart** fault-tolerance technique from distributed systems. High-performance computing and supercomputers have used it for decades to survive node failures during multi-day simulations. The core tradeoff is checkpoint frequency—save too often and I/O overhead hurts; save too rarely and reclamations waste more work. Training workloads typically checkpoint per epoch or every N steps. The same principle appears in Flink/Spark Streaming state checkpointing and game autosaves.

> 📚 **Case Study**: An autonomous vehicle startup was retraining dozens of vision models weekly on ml.p3.16xlarge, with monthly GPU costs exceeding $60k. Switching to Managed Spot Training and modifying training code to save S3 checkpoints per epoch, they experienced ~1-2 Spot reclamations per training run, but each resumed from the last checkpoint and completed successfully. Costs dropped ~70% (from $60k to $18k/month). Lesson: Spot training's success hinges on checkpoint implementation. Without checkpoints, long training rarely completes. In SAP exams, "90% training cost reduction + interrupt recovery" always means Managed Spot + Checkpoint.

## Distributed Training and Specialized Chips — Fast and Cheap for Large Models

Large models or datasets that don't fit on one GPU use **Distributed Training** across multiple GPUs/instances. Two patterns exist. **Data Parallelism** replicates the same model across multiple GPUs, splits data batches, processes them, then synchronizes gradients (large data, model fits one GPU). **Model Parallelism** partitions the model itself across GPUs (model exceeds one GPU's memory, e.g., LLMs).

Inference and training costs also drop via **specialized chips**. **Inferentia (Inf1/Inf2)** is an inference-only ASIC delivering the same throughput at lower cost than GPUs. **Trainium (Trn1)** is a training-only chip. Both are designed by AWS, offering better cost-performance for specific workloads than general-purpose GPUs (NVIDIA). **SageMaker Neo** compiles models for specific hardware (Inferentia, edge devices), boosting inference speed.

> 🔍 **Deep Dive**: AWS designed its own chips (Inferentia/Trainium) because of NVIDIA GPU dependency and cost. Generative AI demand surged, GPU supply tightened, and prices soared. Through Annapurna Labs (acquired 2015), AWS designed Graviton (general-purpose CPU), Inferentia (inference), and Trainium (training), achieving vertical integration. This parallels Google's TPU and Apple's M-series strategy—design chips for your core workloads to control cost and performance. In exams, "inference cost/performance chip" = Inferentia, "training-only chip" = Trainium, "general compute cost-effectiveness" = Graviton.

## Deployment Strategies — A/B, Canary, Shadow

Shifting 100% traffic to a new model in production is risky. SageMaker supports multiple strategies. **A/B Test (Production Variants)** places multiple model variants on one endpoint, splitting traffic by weight (e.g., 90:10), comparing real-world performance. **Canary/Linear deployment** gradually shifts traffic to the new version, rolling back on issues. **Shadow Endpoint** **mirrors** live production traffic to a new model without reflecting its output to users, letting you compare how the new model responds without affecting user experience.

> 🎯 **Scenario**: "We want to replace our production recommendation model with a new version, but validate how the new model behaves on real traffic without impacting user responses. Which strategy?" — Answer: **Shadow Endpoint (Shadow Testing)**. Shadow mirrors actual traffic to the new model but doesn't return its output to users, letting you compare latency, errors, and predictions against the incumbent model with zero user impact. A/B has some users actually receive new model responses, violating the "zero impact" requirement. Trap: "impact-free mirror comparison" = Shadow; "traffic split actual comparison" = A/B.

## Feature Store and No-Code Tools

**Feature Store** is a central repository ensuring training and inference use the same features. **Online Store** (DynamoDB-based, low latency) serves real-time inference; **Offline Store** (S3 + Glue) serves training and batch. If feature calculation logic differs between training and inference, **train-serve skew** emerges—the model silently gets wrong—and Feature Store prevents this. **Data Wrangler** offers no-code data prep, **Canvas** provides no-code ML for business analysts, **JumpStart** enables 1-click deployment of pretrained models, and **Ground Truth** is a data labeling tool.

## Summary

SageMaker isn't about "the model itself" but rather a managed platform bundling the **entire lifecycle around the model**. The 4 inference endpoint types diverge from physical constraints—payload size, latency requirements, traffic patterns (Real-Time = low-latency sync, Serverless = variable + cold-start-OK, Async = large payload + long inference, Batch = full-dataset batch). Training costs drop 90% via Managed Spot + Checkpointing, with specialized chips (Inferentia/Trainium) providing further optimization.

SAP exam common mappings: (1) "large payload + long inference + per-request" → Async, (2) "full dataset batch" → Batch Transform, (3) "90% training reduction + interrupt recovery" → Managed Spot + Checkpoint, (4) "thousands of models cost reduction" → Multi-Model Endpoint, (5) "inference cost chip" → Inferentia, (6) "new model validation without user impact" → Shadow, (7) "training/inference feature consistency" → Feature Store. Next day: Bedrock and generative AI architecture (RAG).

---

## 📝 연습 문제

**문제 1.** 사용자가 800MB 의료 영상을 업로드하면 모델이 분석하는데 추론에 약 5분이 걸린다. 동기 HTTP 응답은 타임아웃이 나고, 트래픽은 하루 수십 건으로 불규칙하다. 가장 적합한 추론 옵션은?

A) Real-Time Endpoint
B) Serverless Inference
C) Async Inference
D) Multi-Model Endpoint

**정답: C**
해설: Async Inference는 큐 기반으로 요청을 받아 결과를 S3에 쓰고 SNS로 알리며, 최대 1GB 페이로드와 긴 처리 시간을 지원한다. 800MB(>6MB 한계)와 5분 추론(>60초 타임아웃)은 Real-Time(A)·Serverless(B)의 페이로드/타임아웃 한계를 모두 초과하므로 불가하다. Async는 불규칙 트래픽에서 0으로 스케일 다운도 가능. D(Multi-Model)는 여러 모델을 한 엔드포인트에 올리는 비용 최적화 기법이지 큰 페이로드/긴 추론 문제의 답이 아니다. 함정: "큰 페이로드 + 긴 추론 + 요청별 처리"는 무조건 Async.

---

**문제 2.** GPU 학습 비용을 최대 90% 절감하면서 Spot 인스턴스 회수 시에도 학습이 완료되도록 보장해야 한다. 어떻게 구성하는가?

A) Reserved Instance로 학습
B) Managed Spot Training + Checkpoint(checkpoint_s3_uri)
C) Compute Savings Plans 적용
D) On-Demand로 학습 후 결과 캐싱

**정답: B**
해설: Managed Spot Training은 Spot 인스턴스(최대 90% 할인)를 학습에 쓰고, Checkpoint(주기적 가중치를 S3에 저장)로 Spot 회수 시 마지막 체크포인트부터 재개해 작업을 완료시킨다. 이 둘은 항상 함께 쓴다 — 체크포인트 없는 Spot 학습은 긴 작업에서 거의 완료되지 못한다. A(Reserved)·C(Savings Plans)는 약정 할인이지 90%에 못 미치고 중단 복구와 무관. D는 비용 절감이 없다. 함정: "학습 90% 절감 + 중단 복구"는 항상 Spot + Checkpoint.

---

**문제 3.** 1000개 고객사별 맞춤 모델을 서빙해야 한다. 각 모델은 가끔만 호출되고, 모델마다 별도 엔드포인트를 띄우면 인스턴스 비용이 감당이 안 된다. 가장 적합한 구성은?

A) 모델마다 Serverless Inference 엔드포인트
B) Multi-Model Endpoint(MME)
C) 모델마다 Real-Time Endpoint
D) 모든 모델을 하나로 합쳐 단일 모델로 학습

**정답: B**
해설: Multi-Model Endpoint는 하나의 엔드포인트(소수 인스턴스)에 여러 모델을 올려두고, 요청 시 해당 모델을 S3에서 메모리로 동적 로딩해 추론하며 자주 안 쓰는 모델은 LRU로 내린다. 긴 꼬리 트래픽(대부분 모델이 가끔 호출)에서 인스턴스 메모리를 캐시처럼 공유해 비용을 극적으로 줄인다. A(모델당 Serverless)도 유휴 비용은 줄지만 1000개 엔드포인트 관리 부담이 크고 MME가 더 효율적. C는 비용 폭발. D는 고객사별 맞춤이 사라져 요구 위반. 함정: "다수의 가끔 쓰는 모델 비용 절감"은 MME.

---

**문제 4.** 새 추천 모델을 프로덕션에 올리기 전, 실제 운영 트래픽에서 새 모델의 지연·에러·예측을 검증하되 사용자 응답에는 전혀 영향을 주지 않아야 한다. 어떤 배포 전략인가?

A) A/B Test(Production Variants)
B) Canary 배포
C) Shadow Endpoint(Shadow Testing)
D) Blue/Green 배포

**정답: C**
해설: Shadow Endpoint는 실시간 운영 트래픽을 새 모델에 복제(미러링)하지만 그 출력을 사용자에게 반환하지 않으므로, 사용자 경험에 0 영향으로 새 모델을 기존 모델과 비교한다. A(A/B)·B(Canary)·D(Blue/Green)는 모두 일부 사용자가 실제로 새 모델의 응답을 받으므로 "사용자 응답에 영향 없이"라는 조건에 어긋난다. 함정: "영향 없이 트래픽 미러링 비교"는 Shadow, "실제 트래픽 분할 비교"는 A/B.

---

**문제 5.** 모델이 학습 때 쓴 피처와 실시간 추론 때 계산한 피처가 미묘하게 달라 정확도가 떨어지는 train-serve skew가 발생한다. 어떻게 방지하는가?

A) S3에 피처를 저장해 양쪽이 읽게 함
B) SageMaker Feature Store(Online/Offline)
C) DynamoDB에 피처를 직접 저장
D) 학습과 추론 코드를 같은 함수로 작성

**정답: B**
해설: SageMaker Feature Store는 학습용 Offline Store(S3+Glue)와 추론용 Online Store(DynamoDB 저지연)를 자동 동기화해, 양쪽이 동일하게 정의·계산된 피처를 쓰도록 보장한다. 이것이 train-serve skew를 막는 표준 해법이다. A(S3 공유)·C(DDB 직접)는 피처 정의·버전·동기화를 직접 관리해야 해 skew 위험이 남는다. D는 코드 일관성은 돕지만 피처 저장·서빙 인프라가 아니다. 함정: "학습·추론 피처 일관성"은 Feature Store.

---

**문제 6.** 매일 밤 전체 고객 5천만 명의 이탈 점수를 일괄로 다시 계산해 S3에 저장해야 한다. 상시 엔드포인트는 필요 없다. 가장 적합하고 경제적인 방법은?

A) Real-Time Endpoint를 밤에만 띄움
B) Batch Transform
C) Async Inference
D) Serverless Inference로 5천만 건 호출

**정답: B**
해설: Batch Transform은 엔드포인트가 아니라 일회성 배치 작업으로, S3의 대량 데이터셋 전체에 추론을 돌리고 결과를 S3에 쓴 뒤 인스턴스를 종료한다. 상시 서빙이 필요 없는 야간 일괄 스코어링의 정석이다. A는 엔드포인트 관리·기동 부담. C(Async)는 요청-응답형 개별 추론용이지 데이터셋 전체 일괄용이 아니다. D는 5천만 건을 개별 호출하면 비효율적이고 비싸다. 함정: "데이터셋 전체 일괄 추론"은 Batch Transform, "개별 요청 비동기"는 Async.

---

**문제 7.** 추론 비용과 성능을 최적화하기 위해 NVIDIA GPU 대신 AWS 자체 설계 추론 전용 칩을 쓰려 한다. 어떤 칩인가?

A) Trainium(Trn1)
B) Inferentia(Inf1/Inf2)
C) Graviton
D) F1 FPGA

**정답: B**
해설: Inferentia(Inf1/Inf2)는 AWS가 설계한 추론 전용 ASIC으로, 같은 처리량을 GPU보다 낮은 비용으로 낸다. A(Trainium)는 학습 전용 칩이고, C(Graviton)는 범용 ARM CPU(추론 전용이 아님), D(F1 FPGA)는 커스텀 하드웨어 가속용이지 ML 추론 전용 칩이 아니다. 함정: 추론=Inferentia, 학습=Trainium, 범용 CPU=Graviton.

---

## 📌 Today's Summary

1. **ML lifecycle is circular** — Deploy isn't the end; Monitor→drift→Retrain. "Breaks in production" problems are answered by infrastructure (Feature Store/Monitor/Pipelines)
2. **4 inference endpoint types** — Real-Time (low-latency sync), Serverless (variable + cold-start OK), Async (1GB+ payload + long inference), Batch (full-dataset)
3. **Payload/timeout limits** — Real-Time/Serverless cap at 6MB·60s. Exceeding these requires Async/Batch
4. **Multi-Model Endpoint** — Multiple infrequently-used models share instance memory like cache, cutting costs (long-tail traffic)
5. **Managed Spot + Checkpoint** — 90% training reduction; reclaimed instances resume from last checkpoint. Checkpoint is essential
6. **Specialized chips** — Inferentia (inference), Trainium (training), Graviton (general CPU). Neo provides compilation optimization
7. **Deployment strategies** — Shadow (impact-free mirror comparison), A/B (actual traffic split). Feature Store prevents train-serve skew
