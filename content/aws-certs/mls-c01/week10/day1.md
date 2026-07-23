# Day 1 - 추론 옵션: 실시간 vs 서버리스 vs 비동기 vs 배치 변환

모델을 학습하고 평가까지 끝냈다면, 이제 그 모델을 실제로 호출할 수 있게 만들어야 한다. SageMaker는 한 가지 배포 방식만 제공하지 않는다. 트래픽 패턴, 페이로드 크기, 지연(latency) 요구, 비용 구조에 따라 네 가지 추론 옵션 중 하나를 골라야 한다. MLS-C01 시험에서 가장 자주 나오는 "어떤 추론 방식을 골라야 하는가" 유형의 문제는, 사실 이 네 가지의 선택 기준을 외우는 문제다. 오늘은 그 선택 기준을 시나리오 단위로 정리한다.

## 네 가지 추론 옵션 개요

SageMaker가 제공하는 추론 방식은 다음과 같다.

```text
옵션              지연      트래픽 패턴          페이로드/시간 제한        과금
─────────────────────────────────────────────────────────────────────────
Real-time         밀리초   지속적, 안정적       6MB, 60초                인스턴스 가동 시간(상시)
Serverless        초 단위  간헐적, 변동 큼      4MB, 60초                요청+지속시간(유휴 0원)
Asynchronous      준실시간 큰 페이로드, 큐잉    1GB, 최대 1시간          인스턴스 시간(0 스케일 가능)
Batch Transform   오프라인 대량 일괄 처리       100MB/레코드, 대용량셋   잡 실행 시간만
```

이 표 한 장이 오늘 학습의 핵심이며, 시험에서 마주칠 거의 모든 시나리오는 이 네 줄로 환원된다.

> 💡 **관련 이론**: 추론 옵션 선택은 "온라인이냐 오프라인이냐"를 먼저 가른 뒤, 온라인이면 "트래픽이 지속적이냐 간헐적이냐", "페이로드가 크냐 작냐"로 분기한다. 시험에서는 항상 이 세 가지 축(지연 요구, 트래픽 패턴, 페이로드 크기)을 키워드로 흘려준다.

## Real-time Endpoint: 지속적 트래픽 + 저지연

실시간 엔드포인트는 항상 켜져 있는(provisioned) 인스턴스 위에 모델을 올려 HTTPS 요청에 밀리초 단위로 응답한다.

```python
predictor = model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="fraud-rt-endpoint",
)
response = predictor.predict(payload)  # 동기 호출, 즉시 응답
```

- **언제 쓰나**: 추천 시스템, 사기 탐지, 챗봇처럼 사용자가 응답을 기다리는 온라인 서비스
- **제약**: 페이로드 6MB, 응답 60초 이내
- **비용 함정**: 트래픽이 없어도 인스턴스가 켜져 있으면 계속 과금된다. 간헐적 트래픽에는 비효율적이다.

## Serverless Inference: 간헐적/예측 불가 트래픽

서버리스 추론은 인스턴스를 직접 관리하지 않는다. 요청이 오면 컴퓨팅이 자동으로 확장되고, 없으면 0으로 축소되어 유휴 비용이 0원이다.

```python
from sagemaker.serverless import ServerlessInferenceConfig

serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=2048,
    max_concurrency=10,
)
predictor = model.deploy(serverless_inference_config=serverless_config)
```

- **언제 쓰나**: 하루 몇 번만 호출되는 내부 도구, 트래픽이 들쭉날쭉한 신규 서비스
- **트레이드오프**: 콜드 스타트가 있다. 첫 요청은 컨테이너 기동 때문에 지연이 생긴다.
- **제약**: 페이로드 4MB, GPU 미지원(CPU/메모리 기반)

## Asynchronous Inference: 큰 페이로드 + 긴 처리 시간

비동기 추론은 요청을 S3 기반 큐에 넣고, 처리가 끝나면 결과를 S3에 쓰고 알림(SNS)을 보낸다. 호출자는 즉시 응답을 기다리지 않는다.

```python
from sagemaker.async_inference import AsyncInferenceConfig

async_config = AsyncInferenceConfig(
    output_path="s3://my-bucket/async-output/",
    notification_config={"SuccessTopic": "arn:aws:sns:...:success"},
)
predictor = model.deploy(async_inference_config=async_config)
response = predictor.predict_async(input_path="s3://my-bucket/input/large.json")
```

- **언제 쓰나**: 고해상도 이미지/비디오 분석, 대형 NLP 문서 추론처럼 페이로드가 크고(최대 1GB) 처리가 오래 걸리는(최대 1시간) 작업
- **핵심 장점**: 트래픽이 없을 때 인스턴스를 0으로 축소(scale to zero)할 수 있어 비용 절감
- **준실시간**: 즉시는 아니지만 배치처럼 한참 모았다 처리하지도 않는다.

## Batch Transform: 대량 오프라인 일괄 추론

배치 변환은 엔드포인트를 띄우지 않는다. S3의 대용량 데이터셋 전체에 대해 일괄 추론을 돌리고 결과를 S3에 쓴 뒤, 잡이 끝나면 리소스를 자동 해제한다.

```python
transformer = model.transformer(
    instance_count=4,
    instance_type="ml.m5.xlarge",
    output_path="s3://my-bucket/batch-output/",
)
transformer.transform(
    data="s3://my-bucket/input-dataset/",
    content_type="text/csv",
    split_type="Line",
)
```

- **언제 쓰나**: 매일 밤 전체 고객에 대한 이탈 점수 갱신, 월간 리포트용 일괄 예측처럼 실시간 응답이 필요 없는 대량 처리
- **비용**: 잡이 도는 동안만 과금. 상시 엔드포인트 비용이 없다.
- **제약 아님**: 지연이 전혀 중요하지 않다. 응답을 기다리는 사용자가 없다.

> 💡 **관련 이론**: "실시간 응답이 필요 없다 + 대량 데이터"라는 키워드가 보이면 거의 항상 Batch Transform이 정답이다. 반대로 "사용자가 즉시 결과를 본다 + 안정적 트래픽"이면 Real-time이다. 둘 사이의 회색지대(큰 페이로드, 긴 처리, 큐잉 허용)는 Asynchronous, 트래픽이 드물고 콜드 스타트를 감수할 수 있으면 Serverless로 떨어진다.

## 선택 의사결정 흐름

시험장에서 머릿속으로 돌릴 결정 트리는 다음과 같다.

```text
1. 실시간 응답이 필요한가?
   아니오 → 대량 일괄? → Batch Transform
2. 예 (온라인 추론)
   ├ 페이로드 큼(>6MB)/처리 긺(>60초)? → Asynchronous
   ├ 트래픽 간헐적/예측 불가 + 콜드스타트 OK? → Serverless
   └ 트래픽 지속적 + 저지연 필수? → Real-time
```

이 트리는 페이로드 크기 → 트래픽 패턴 → 지연 요구 순으로 강한 제약부터 거른다. 페이로드가 1GB라면 Real-time과 Serverless는 물리적으로 불가능하므로 트래픽 패턴을 따질 필요조차 없다.

## 비용 관점 정리

```text
유휴 비용 0원      : Serverless, Asynchronous(0 스케일), Batch Transform
상시 과금          : Real-time(인스턴스가 켜져 있는 한)
예측 가능한 고정비  : Real-time(용량을 미리 잡으므로 안정적)
```

비용 최적화 문제에서 "간헐적 트래픽인데 Real-time을 쓰고 있다"는 상황이 나오면, 거의 항상 Serverless 또는 Asynchronous로의 전환이 정답이다.

## 마무리

네 가지 추론 옵션은 서로 경쟁하는 대안이 아니라, 서로 다른 트래픽·페이로드·지연 시나리오를 위한 도구다. 시험에서는 지문에 깔린 키워드(지속적/간헐적, 큰 페이로드, 즉시 응답, 대량 오프라인, 유휴 비용)를 잡아내 위 결정 트리에 대입하면 된다. 내일은 가장 운영 부담이 큰 Real-time 엔드포인트의 구성과 오토스케일링, 멀티모델 패턴을 다룬다.

## 📝 연습 문제

**문제 1.** 한 팀이 매일 자정에 전체 사용자 2천만 명의 이탈 점수를 일괄 계산해 데이터 웨어하우스에 적재하려 한다. 사용자가 실시간으로 결과를 기다리지 않는다. 가장 비용 효율적인 추론 방식은?

A) Real-time Endpoint를 2대 상시 운영  
B) Serverless Inference  
C) Batch Transform  
D) Asynchronous Inference  

**정답: C**  
해설: "실시간 응답 불필요 + 대량 일괄 처리" 키워드는 Batch Transform이다. 잡이 도는 동안만 과금되어 상시 엔드포인트 비용이 없다. Real-time(A)은 유휴 과금으로 낭비, Serverless(B)는 페이로드/소량 호출용, Asynchronous(D)는 온라인 큐잉용으로 일괄 데이터셋 전체 처리에는 Batch가 적합하다.

---

**문제 2.** 어떤 모델이 500MB짜리 고해상도 위성 이미지를 입력받아 약 8분간 추론한다. 결과는 즉시가 아니어도 되며, 처리 완료 시 알림을 받고 싶다. 적절한 옵션은?

A) Real-time Endpoint  
B) Asynchronous Inference  
C) Serverless Inference  
D) Batch Transform  

**정답: B**  
해설: 페이로드가 6MB/60초 제한을 크게 초과(500MB, 8분)하므로 Real-time(A)과 Serverless(C, 4MB)는 불가능하다. Asynchronous는 최대 1GB·1시간을 지원하고 SNS 알림으로 완료를 통지한다. Batch(D)는 단건 온라인 요청이 아니라 대량 데이터셋 일괄 처리에 쓴다.

---

**문제 3.** 사내 분석가들이 사용하는 도구가 하루 평균 30회, 불규칙한 시간대에 호출된다. 페이로드는 작고, 첫 요청의 약간의 지연은 허용 가능하다. 유휴 비용을 0으로 만들고 싶다. 무엇을 선택해야 하는가?

A) Serverless Inference  
B) Real-time Endpoint with 오토스케일링  
C) Batch Transform  
D) 멀티모델 엔드포인트  

**정답: A**  
해설: 간헐적·예측 불가 트래픽 + 작은 페이로드 + 콜드 스타트 허용 + 유휴 비용 0원은 Serverless의 전형적 시나리오다. Real-time(B)은 오토스케일링을 써도 최소 인스턴스가 켜져 있어 완전한 0원이 어렵다. Batch(C)는 온라인 요청용이 아니고, 멀티모델(D)은 비용 패턴이 아니라 모델 다수 호스팅 기법이다.

---

**문제 4.** 전자상거래 사이트의 실시간 추천 API가 초당 수천 건의 안정적 트래픽을 받으며, p99 지연 50ms 이내로 응답해야 한다. 가장 적합한 추론 방식은?

A) Asynchronous Inference  
B) Batch Transform  
C) Serverless Inference  
D) Real-time Endpoint  

**정답: D**  
해설: 지속적인 고트래픽 + 엄격한 저지연 요구는 상시 가동되는 Real-time Endpoint의 정의 그대로다. Asynchronous(A)는 큐잉 기반 준실시간, Batch(B)는 오프라인, Serverless(C)는 콜드 스타트 때문에 엄격한 p99 지연 보장이 어렵다.

---

**문제 5.** Real-time Endpoint의 페이로드/응답 제한으로 옳은 것은?

A) 페이로드 1GB, 최대 1시간 처리  
B) 페이로드 6MB, 응답 60초 이내  
C) 페이로드 100MB, 무제한 시간  
D) 페이로드 4MB, GPU 필수  

**정답: B**  
해설: 동기식 Real-time 호출은 페이로드 6MB·응답 60초 제한을 가진다. 1GB·1시간(A)은 Asynchronous, 대용량 무제한(C)은 Batch Transform의 특성에 가깝고, 4MB(D)는 Serverless의 페이로드 한도이며 GPU 필수도 아니다.

---
