# Day 1 - Inference Options Overview: 4 Deployment Modes and Selection Criteria

Even a well-trained model has no value by itself. It must be **deployed** so users can call it, accumulated data gets batch-processed, or other systems invoke it—only then does it create business value. SageMaker offers 4 inference modes fitting different workload shapes, and MLA-C01 exams repeatedly ask "which mode for this scenario".

The key is not algorithm but **request pattern**. Do requests come realtime or batched, is traffic steady or sparse, are responses needed immediately or can they tolerate minute delays, are payloads small or huge. Dividing by these 4 axes solves nearly every test question. Today we compare 4 options at a glance and organize selection criteria.

## 4 Inference Options at a Glance

SageMaker's inference modes:

| Option | Response | Traffic Pattern | Payload/Duration |
|---|---|---|---|
| Real-time | Sync, immediate (ms~sec) | Steady, predictable | Small (<6MB), <60sec |
| Serverless | Sync, immediate | Sparse·unpredictable, scales to 0 | Small (<4MB), <60sec |
| Asynchronous | Async, queue-based | Variable, long processing OK | Large (max 1GB), <60min |
| Batch Transform | Async, job-based | Periodic, batch | Very large (whole dataset) |

Real-time and serverless are **synchronous**. Call → result returns on the spot. Async and batch are **request-and-fetch-later** structures.

```python
import boto3
runtime = boto3.client("sagemaker-runtime")

# Real-time endpoint call: immediate response returns
response = runtime.invoke_endpoint(
    EndpointName="my-realtime-endpoint",
    ContentType="application/json",
    Body='{"features": [5.1, 3.5, 1.4, 0.2]}',
)
result = response["Body"].read()
```

> 💡 **Related Theory**: Inference option choice fundamentally tradeoffs "always-on cost vs latency vs throughput". Real-time endpoints keep instances running 24/7, costing even idle, but lowest latency. Serverless costs 0 when traffic is 0 but incurs cold start lag. Batch cheapest per-sample for bulk but no immediacy. Exams ask which to prioritize in scenario.

## Real-time Endpoint—When Instant Response is Critical

Real-time endpoints are HTTPS endpoints where always-running instances receive requests, responding in milliseconds to seconds. Suits online services like **users waiting for results**: recommendation systems, fraud detection, chatbots.

Characteristics:
- Specified instances run 24h → cost even idle
- Lowest latency (low latency), consistent performance
- Auto-scaling adjusts instance count on traffic (minimum 1 kept)
- Payload <6MB, response <60sec limits

Steady traffic plus latency sensitivity = real-time is default choice.

## Serverless Inference—When Traffic is Erratic

Serverless inference doesn't manage instances directly; computes auto-provision on incoming requests. No traffic → **scales to 0**, no cost. Just specify memory (1~6GB) and max concurrency.

```python
# Serverless config—just memory and concurrency
serverless_config = {
    "MemorySizeInMB": 2048,
    "MaxConcurrency": 10,
}
```

Ideal for sparse, unpredictable traffic: internal tools, occasional demo calls, bursty new services. Downside: **cold start**. After idle, first request causes lag spinning up container. Inconsistent low latency needs = not suitable.

> ⚠️ **Pitfall**: Seeing only "reduce cost" and picking serverless without thinking is wrong. Steady high traffic makes serverless costlier than real-time. Serverless cost advantage happens on "mostly idle time". Also, SLA intolerant of cold start kills serverless. Correct condition: "sparse/unpredictable traffic + cold start tolerated".

## Asynchronous Inference—When Large, Long-Processing Requests

Asynchronous Inference queues requests, processes sequentially, stores results on S3, notifies via SNS. For large payloads (max 1GB) or long processing (max 60min). Examples: large image/video processing, bulk NLP document inference.

Core advantage: **can scale instances to 0 when idle** (real-time keeps minimum 1). Queued requests auto-trigger instances, empty queue scales back to 0, saving cost.

```python
# Async call: input on S3, pass location, get output location not immediate response
response = runtime.invoke_endpoint_async(
    EndpointName="my-async-endpoint",
    InputLocation="s3://my-bucket/input/large-image.png",
)
output_location = response["OutputLocation"]  # S3 path where result stores
```

> 🔍 **Deeper**: Async inference fills the gap between real-time and batch. Like real-time, endpoint alive handling individual calls; like batch, queues absorb traffic spikes, supporting large payloads and long processing. "Endpoint needed (individual calls) but >6MB payload or >60sec processing missing real-time limits" → async is the classic signal.

## Batch Transform—Whole Dataset at Once

Batch Transform doesn't use endpoints. Reads bulk input from S3, runs batch inference, writes results to S3, terminates resources when done. No permanent endpoint cost. For overnight batch scoring, customer churn prediction, log classification—**no urgency, process in bulk once**→ Batch Transform.

```python
from sagemaker.transformer import Transformer

transformer = Transformer(
    model_name="my-model",
    instance_count=4,           # Split data for parallel processing
    instance_type="ml.m5.xlarge",
    output_path="s3://my-bucket/batch-output/",
)
transformer.transform(
    data="s3://my-bucket/batch-input/",
    content_type="text/csv",
    split_type="Line",          # Split by record
)
```

> 💡 **Related Theory**: Batch Transform splits data across instances (`split_type`), each processes minibatches (`BatchStrategy`, `MaxPayloadInMB`) for horizontal scale. Job done, cluster vanishes, always-on cost is 0. "No realtime needed, large batch processing" keyword → Batch Transform is almost always the cheapest answer.

## Decision Tree for Selection

To quickly choose on exam, ask in order:

1. **Immediate response needed?** No → step 2. Yes → step 3.
2. (No immediacy) **Whole dataset at once?** → Batch Transform. **Individual requests·large payload·long processing?** → Async.
3. (Immediacy needed) **Traffic steady?** Yes → Real-time. **Sparse and cold start tolerated?** → Serverless.

Remember payload/time constraints too. >6MB payload or >60sec processing disqualifies real-time/serverless; consider async (1GB/60min) or batch.

## Summary

Inference options are 4 by request pattern: ① **Real-time**: steady traffic + low latency, always-on cost. ② **Serverless**: sparse traffic, scales to 0, cold start tolerate. ③ **Async**: large payload (1GB)·long processing (60min), queue-based, scales to 0. ④ **Batch Transform**: no endpoint, whole dataset batch, cheapest, no immediacy. Underlying all choices: "always-on cost vs latency vs throughput" tradeoff.

Next deep-dives real-time endpoints—the most critical—covering setup, auto-scaling, instance selection.

---

## 📝 연습 문제

**문제 1.** 한 모바일 게임이 사용자가 아이템 구매 버튼을 누르는 순간 사기 여부를 50ms 이내에 판정해야 한다. 트래픽은 하루 종일 꾸준히 높다. 가장 적절한 추론 옵션은?

A) 배치 변환  
B) 실시간 엔드포인트  
C) 서버리스 추론  
D) 비동기 추론  

**정답: B**  
해설: "구매 순간 50ms 이내 판정 + 꾸준히 높은 트래픽"은 저지연·동기·always-on의 전형으로 실시간 엔드포인트가 정답이다. A는 즉시성이 전혀 없어 부적합하고, C는 콜드 스타트로 일관된 저지연을 보장하지 못하며, D는 큐 기반이라 즉시 응답이 불가능하다.

---

**문제 2.** 사내 분석 도구가 가끔(하루 몇 번, 시간대 불규칙) 모델을 호출한다. 호출이 없는 시간이 대부분이라 인스턴스를 항상 켜두는 비용이 아깝다. 약간의 첫 응답 지연은 허용된다. 적절한 옵션은?

A) 실시간 엔드포인트  
B) 서버리스 추론  
C) 배치 변환  
D) 인스턴스를 항상 2대 띄운 실시간 엔드포인트  

**정답: B**  
해설: "간헐적·불규칙 트래픽 + 유휴 시간 대부분 + 콜드 스타트 허용"은 서버리스 추론의 정확한 조건이다. 트래픽이 없으면 0으로 스케일되어 비용이 들지 않는다. A와 D는 유휴 시간에도 always-on 비용이 나가 낭비이고, C는 개별 호출이 아닌 일괄 처리 방식이라 사용 패턴과 맞지 않는다.

---

**문제 3.** 의료 영상 분석 모델이 한 장당 200MB의 고해상도 이미지를 받아 처리에 약 5분이 걸린다. 요청은 개별로 들어오며 결과는 처리 완료 후 받으면 된다. 적절한 옵션은?

A) 실시간 엔드포인트  
B) 서버리스 추론  
C) 비동기 추론  
D) 배치 변환  

**정답: C**  
해설: 페이로드 200MB는 실시간/서버리스의 한계(6MB/4MB)를 초과하고 처리 5분은 60초 제약을 넘는다. 비동기 추론은 최대 1GB 페이로드와 60분 처리를 지원하며 개별 요청을 큐로 처리하므로 이 시나리오에 정확히 맞는다. A·B는 페이로드·시간 제약으로 탈락하고, D는 전체 데이터셋 일괄 방식이라 "개별 요청" 패턴과 다르다.

---

**문제 4.** 매일 밤 12시에 전체 고객 1,000만 명의 이탈 확률을 계산해 데이터 웨어하우스에 적재한다. 실시간성은 전혀 필요 없다. 비용을 최소화하려면?

A) 실시간 엔드포인트를 밤에만 켠다  
B) 서버리스 추론으로 1,000만 건을 순차 호출한다  
C) 배치 변환 작업으로 전체 데이터셋을 일괄 처리한다  
D) 비동기 추론으로 1,000만 건을 큐에 넣는다  

**정답: C**  
해설: "전체 데이터셋을 정기적으로 일괄, 실시간성 불필요, 비용 최소화"는 배치 변환의 교과서적 시나리오다. 작업이 끝나면 클러스터가 종료되어 always-on 비용이 0이고, 데이터를 여러 인스턴스로 분할해 빠르게 처리한다. A·B·D는 모두 개별 호출/엔드포인트 기반이라 1,000만 건 일괄 처리에는 비효율적이고 비싸다.

---

**문제 5.** 비동기 추론이 실시간 엔드포인트와 구별되는 핵심 특징으로 가장 적절한 것은?

A) 응답을 항상 밀리초 단위로 동기 반환한다  
B) 큰 페이로드(최대 1GB)와 긴 처리(최대 60분)를 지원하고 요청이 없으면 인스턴스를 0까지 줄일 수 있다  
C) 엔드포인트 없이 전체 데이터셋을 한 번에 처리한다  
D) 인스턴스를 최소 1대 항상 유지해야 한다  

**정답: B**  
해설: 비동기 추론은 큐 기반으로 큰 페이로드(1GB)와 긴 처리시간(60분)을 허용하며, 큐가 비면 인스턴스를 0까지 스케일 다운해 비용을 절약한다. A는 비동기가 아닌 실시간/서버리스의 동기 특성이고, C는 배치 변환의 설명이며, D는 실시간 엔드포인트의 제약(최소 1대 유지)으로 비동기와 반대다.

---
