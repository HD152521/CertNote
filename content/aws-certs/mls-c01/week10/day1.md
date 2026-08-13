# Day 1 - 추론 옵션: 실시간 vs 서버리스 vs 비동기 vs 배치 변환

## 📌 핵심 정리

- SageMaker는 배포 방식이 하나가 아니다. **트래픽 패턴 · 페이로드 크기 · 지연 요구 · 비용 구조**로 네 옵션 중 하나를 고른다.
- **Real-time**: 지속적 트래픽 + 밀리초 지연. 페이로드 6MB, 응답 60초. 트래픽이 없어도 상시 과금된다.
- **Serverless**: 간헐적·예측 불가 트래픽. 유휴 비용 0원이지만 **콜드 스타트**가 있고 페이로드 4MB, GPU 미지원.
- **Asynchronous**: 큰 페이로드(최대 1GB) + 긴 처리(최대 1시간). S3 큐잉 + SNS 알림, 0으로 스케일 가능.
- **Batch Transform**: 실시간 응답이 필요 없는 대량 오프라인 일괄 추론. 엔드포인트 없이 잡 실행 시간만 과금.

## 네 가지 추론 옵션 개요

MLS-C01에서 자주 나오는 "어떤 추론 방식을 골라야 하는가" 유형은, 사실 이 네 줄의 선택 기준을 외우는 문제다.

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

> ⚠️ **함정**: "p99 지연 50ms 보장" 같은 **엄격한 지연 SLO**가 지문에 있으면 Serverless는 오답이다. 콜드 스타트가 꼬리 지연을 만든다.

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

## 운영 특성 비교

| 축 | Real-time | Serverless | Asynchronous | Batch Transform |
|---|---|---|---|---|
| 지연 | 밀리초 | 초 단위 | 준실시간 | 오프라인 |
| 호출 방식 | 동기 HTTPS | 동기 HTTPS | 큐잉(입력 S3 경로) | 잡 실행 |
| 결과 전달 | 응답 본문 | 응답 본문 | S3 출력 + SNS 알림 | S3 출력 |
| 페이로드 한도 | 6MB | 4MB | 1GB | 100MB/레코드 |
| 처리 시간 한도 | 60초 | 60초 | 최대 1시간 | 대용량셋(잡 단위) |
| 콜드 스타트 | 없음(상시 가동) | **있음** | — | — |
| 0으로 축소 | 불가(인스턴스 상시) | 자동 0 | 가능(scale to zero) | 잡 종료 시 해제 |
| GPU | 지원 | **미지원** | 지원 | 지원 |
| 엔드포인트 유지 | 필요 | 필요(관리형) | 필요 | **불필요** |

## 선택표: 언제 쓰나 / 언제 쓰면 안 되나

| 옵션 | 대표 시나리오 | 언제 쓰나 | **언제 쓰면 안 되나** |
|---|---|---|---|
| **Real-time** | 추천 API, 사기 탐지, 챗봇 | 지속적·안정적 트래픽 + 엄격한 저지연 | 트래픽이 드문데 상시 켜 두어 유휴 과금이 나는 상황 / 페이로드 6MB 초과 / 60초 초과 처리 |
| **Serverless** | 하루 30회 호출되는 사내 도구 | 간헐적·예측 불가 트래픽 + 작은 페이로드 + 유휴 0원 | p99 지연 보장이 필요할 때(콜드 스타트) / GPU가 필요할 때 / 페이로드 4MB 초과 |
| **Asynchronous** | 위성 이미지·대형 문서 추론 | 큰 페이로드·긴 처리 + 완료 알림 필요 + 큐잉 허용 | 사용자가 즉답을 기다릴 때 / 데이터셋 전체 일괄 처리(→ Batch) |
| **Batch Transform** | 야간 전체 고객 이탈 점수 갱신 | 실시간 응답 불필요 + 대량 데이터 일괄 | 단건 온라인 요청 / 사용자가 결과를 기다리는 API |

> ⚠️ **함정**: Asynchronous와 Batch Transform은 둘 다 "즉답 아님 + S3 결과"라 헷갈린다. 갈림길은 **요청 단위**다. 온라인으로 들어오는 **개별 요청**을 큐에 태우면 Asynchronous, S3에 이미 쌓인 **데이터셋 전체**를 한 번에 돌리면 Batch Transform이다.

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

```
[지문에서 뽑을 키워드]
        │
 ① "사용자가 결과를 기다리는가?"
        ├─ 아니오, 그리고 S3 데이터셋 전체 ──────→ Batch Transform
        └─ 예 / 개별 요청 단위 ↓
        │
 ② "페이로드·처리 시간이 6MB·60초를 넘는가?"
        ├─ 예 (최대 1GB · 1시간, 완료 알림 필요) ─→ Asynchronous
        └─ 아니오 ↓
        │
 ③ "트래픽이 간헐적이고 유휴 비용을 0으로 만들고 싶은가?"
        ├─ 예 (콜드 스타트 감수, 4MB 이내, CPU) ─→ Serverless
        └─ 아니오 ↓
        │
 ④ "지속적 트래픽 + 엄격한 저지연(p99)인가?" ───→ Real-time
```

## 비용 관점 정리

```text
유휴 비용 0원      : Serverless, Asynchronous(0 스케일), Batch Transform
상시 과금          : Real-time(인스턴스가 켜져 있는 한)
예측 가능한 고정비  : Real-time(용량을 미리 잡으므로 안정적)
```

| 옵션 | 과금 단위 | 트래픽 0일 때 | 비용이 유리한 지점 |
|---|---|---|---|
| Real-time | 인스턴스 가동 시간(상시) | **계속 과금** | 트래픽이 높고 꾸준해 인스턴스가 놀지 않을 때 |
| Serverless | 요청 수 + 지속 시간 | 0원 | 호출이 드물고 불규칙할 때 |
| Asynchronous | 인스턴스 시간(0 스케일 가능) | 0으로 축소 가능 | 큰 작업이 몰려 있다가 한동안 없을 때 |
| Batch Transform | 잡 실행 시간만 | 과금 없음(잡 종료) | 정기적으로 대량을 한 번에 처리할 때 |

비용 최적화 문제에서 "간헐적 트래픽인데 Real-time을 쓰고 있다"는 상황이 나오면, 거의 항상 Serverless 또는 Asynchronous로의 전환이 정답이다.

> ⚠️ **함정**: "Real-time에 오토스케일링을 붙이면 유휴 비용이 0이 된다"는 보기는 오답이다. 오토스케일링을 써도 **최소 인스턴스는 켜져 있어야** 하므로 완전한 0원은 어렵다. 진짜 0원이 필요하면 Serverless다.

### 잘못 고른 옵션의 증상과 교정

| 현재 상태 | 나타나는 증상 | 교정 방향 |
|---|---|---|
| 간헐적 트래픽에 Real-time 상시 운영 | 호출은 적은데 청구서는 그대로 | Serverless(작은 페이로드) 또는 Asynchronous(큰 작업) |
| 큰 이미지를 Real-time으로 호출 | 6MB·60초 한도에 걸려 실패 | Asynchronous로 전환(최대 1GB·1시간) |
| 야간 전체 데이터셋을 엔드포인트로 반복 호출 | 느리고 비싸며 엔드포인트를 계속 유지 | Batch Transform 잡으로 전환 |
| 저지연 API를 Serverless로 운영 | 첫 요청·유휴 후 요청의 꼬리 지연이 튐 | Real-time으로 전환 |
| 완료 통보 없이 비동기 결과를 폴링 | 결과 확인 로직이 복잡해짐 | Asynchronous의 SNS 알림 구성 사용 |

## 지문 단서 → 정답 매핑

| 지문 단서 | 고를 답 | 이유 |
|---|---|---|
| "매일 자정 전체 사용자 2천만 명 점수 갱신" | Batch Transform | 실시간 불필요 + 대량 일괄, 잡 시간만 과금 |
| "500MB 이미지, 약 8분 처리, 완료 시 알림" | Asynchronous | 6MB·60초를 초과, 1GB·1시간 지원 + SNS 알림 |
| "하루 30회, 불규칙, 유휴 비용 0원" | Serverless | 간헐적 트래픽 + 작은 페이로드 + 콜드 스타트 허용 |
| "초당 수천 건, p99 50ms 이내" | Real-time | 지속적 고트래픽 + 엄격한 저지연 |
| "페이로드 6MB, 응답 60초" | Real-time의 제한 | 동기 호출의 한도 |
| "페이로드 4MB, GPU 미지원" | Serverless의 제한 | CPU/메모리 기반 |
| "페이로드 1GB, 최대 1시간" | Asynchronous의 제한 | 큰 페이로드·긴 처리를 위한 옵션 |
| "간헐적 트래픽인데 Real-time 상시 운영 중" | Serverless 또는 Asynchronous 전환 | 유휴 과금 제거가 정답 방향 |
| "오토스케일링으로 유휴 비용을 0으로" | **오답 보기** | 최소 인스턴스가 남아 완전한 0원 불가 |
| "결과를 S3에 쓰고 SNS로 통지" | Asynchronous | 큐잉 + 출력 경로 + 알림 구성 |
| "엔드포인트를 띄우지 않고 처리 후 자원 해제" | Batch Transform | 잡 종료 시 리소스 자동 해제 |

네 가지 추론 옵션은 서로 경쟁하는 대안이 아니라, 서로 다른 트래픽·페이로드·지연 시나리오를 위한 도구다. 지문에 깔린 키워드(지속적/간헐적, 큰 페이로드, 즉시 응답, 대량 오프라인, 유휴 비용)를 잡아내 위 결정 트리에 대입하면 된다.

내일은 가장 운영 부담이 큰 Real-time 엔드포인트의 구성과 오토스케일링, 멀티모델 패턴을 다룬다.

## 📖 용어

- **엔드포인트(endpoint)** : 모델을 HTTPS로 호출할 수 있게 띄워 둔 상시 서비스 주소. Batch Transform은 이것을 만들지 않는다.
- **페이로드(payload)** : 한 번의 추론 요청에 실어 보내는 입력 데이터. 크기 한도가 옵션 선택의 가장 강한 제약이다.
- **동기 호출 / 비동기 호출** : 응답이 올 때까지 기다리는 방식 / 요청만 넣고 결과는 나중에 S3·알림으로 받는 방식.
- **콜드 스타트(cold start)** : 유휴 상태에서 컨테이너를 새로 띄우느라 첫 요청이 느려지는 현상. Serverless의 대표 트레이드오프.
- **scale to zero** : 트래픽이 없을 때 인스턴스를 0개까지 줄여 비용을 0에 가깝게 만드는 것.
- **유휴 비용(idle cost)** : 요청이 없는데도 켜져 있는 인스턴스 때문에 나가는 돈. Real-time의 대표 함정.
- **큐잉(queuing)** : 요청을 대기열에 넣고 순서대로 처리하는 방식. Asynchronous의 동작 원리.
- **SNS 알림** : 처리 완료·실패를 토픽으로 통지하는 AWS 메시징. 비동기 추론의 완료 통보에 쓴다.
- **Batch Transform 잡** : 엔드포인트 없이 S3 데이터셋 전체를 일괄 추론하고 끝나면 리소스를 해제하는 실행 단위.
- **p99 지연** : 요청 100건 중 가장 느린 1건 수준의 응답 시간. 꼬리 지연 SLO를 말할 때 쓴다.

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
