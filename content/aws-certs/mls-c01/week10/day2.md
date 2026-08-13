# Day 2 - Real-time Endpoint Operations: Configuration, Auto Scaling, Multi-Model

## 📌 핵심 정리

- 실시간 추론은 **Model → EndpointConfig → Endpoint** 세 리소스로 분리되며, 이 분리가 무중단 교체와 트래픽 분할의 토대다.
- 무중단 배포는 새 EndpointConfig를 만들고 **UpdateEndpoint**로 갈아끼우는 것. 새 플릿 기동 → 트래픽 이동 → 기존 플릿 종료.
- 오토스케일링은 Application Auto Scaling의 **변형(variant) 단위**로 걸며, 기본 지표는 `SageMakerVariantInvocationsPerInstance` + **Target Tracking**이다.
- **MinCapacity는 0이 될 수 없다.** 완전한 0 스케일이 필요하면 Serverless나 Async를 쓴다.
- **MME**(동일 컨테이너·수천 모델 동적 로딩) / **MCE**(서로 다른 컨테이너) / **추론 파이프라인**(전처리→예측 직렬)의 구분이 시험 단골이다.

## 엔드포인트의 3계층 구조

어제 확인했듯 실시간 엔드포인트는 네 가지 추론 옵션 중 운영 부담이 가장 크다. 상시 가동 인스턴스 위에서 안정적인 저지연 서비스를 하려면 구성·스케일링·비용 통제를 함께 이해해야 한다. 그 출발점이 SageMaker가 리소스를 세 겹으로 쪼개 놓았다는 사실이다.

```text
Model              : 학습 산출물(S3 모델 아티팩트) + 추론 컨테이너 이미지
EndpointConfig     : 어떤 Model을, 어떤 인스턴스/비율로 띄울지 정의 (ProductionVariant)
Endpoint           : 실제 HTTPS URL. EndpointConfig를 가리킨다
```

| 리소스 | 담는 것 | 바뀔 때 |
|---|---|---|
| Model | S3 아티팩트 + 컨테이너 이미지 + IAM 역할 | 새 모델 버전이 나왔을 때 새로 생성 |
| EndpointConfig | ProductionVariant 목록(인스턴스 타입/수/가중치) | 인스턴스 타입·모델·트래픽 비율을 바꿀 때 새로 생성 |
| Endpoint | 클라이언트가 호출하는 고정 HTTPS URL | 이름은 그대로 두고 EndpointConfig만 교체 |

```python
from sagemaker.model import Model

model = Model(image_uri=image, model_data=s3_artifact, role=role)
model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="prod-endpoint",
)
```

### 추론 요청이 흐르는 경로

```text
클라이언트
   │  InvokeEndpoint (HTTPS, 페이로드)
   ▼
[Endpoint  prod-endpoint]  ← 이름 고정. 클라이언트는 이 URL만 안다
   │  현재 가리키는 EndpointConfig 조회
   ▼
[EndpointConfig  v3]
   ├─ ProductionVariant A (ml.m5.xlarge × 2, weight 90)
   └─ ProductionVariant B (ml.m5.xlarge × 1, weight 10)
                │
                ▼
        [추론 컨테이너] ─ 모델 아티팩트 로드 → 예측
                │
                ▼
        응답 + CloudWatch 지표 기록
```

> 💡 **개념**: 핵심은 **Endpoint와 EndpointConfig가 분리되어 있다**는 점이다. 새 EndpointConfig를 만들고 UpdateEndpoint로 바꿔 끼우면 SageMaker가 새 플릿을 띄우고 트래픽을 옮긴 뒤 기존 플릿을 정리한다 — 다운타임이 없다.

> 💡 **개념**: 하나의 EndpointConfig는 여러 ProductionVariant를 담을 수 있고, 각 변형에 `InitialVariantWeight`로 트래픽 비율을 지정한다. 이 가중치 기반 분할이 A/B 테스트와 카나리 배포의 토대이며, 내일 다룬다.

> ⚠️ **함정**: "무중단 배포"를 묻는 지문에서 **엔드포인트를 삭제하고 같은 이름으로 재생성**하는 보기는 항상 오답이다. 재생성 구간에 다운타임이 생긴다. S3 아티팩트를 덮어쓰거나 인스턴스에 SSH로 접속해 파일을 바꾸는 보기도 동작하지 않는다.

## 오토스케일링: 트래픽에 인스턴스 수를 맞춘다

상시 가동 비용의 함정을 줄이려면 인스턴스 수가 트래픽을 따라 자동으로 움직여야 한다. SageMaker는 Application Auto Scaling을 통해 **변형(variant) 단위** 스케일링을 지원한다.

```python
import boto3
client = boto3.client("application-autoscaling")

client.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId="endpoint/prod-endpoint/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=2, MaxCapacity=10,
)
client.put_scaling_policy(
    PolicyName="invocations-per-instance",
    PolicyType="TargetTrackingScaling",
    TargetTrackingScalingPolicyConfiguration={
        "TargetValue": 1000.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "SageMakerVariantInvocationsPerInstance"
        },
        "ScaleInCooldown": 300, "ScaleOutCooldown": 60,
    },
)
```

### 정책 유형 비교

| 정책 | 동작 방식 | 언제 쓰나 | 언제 쓰면 안 되나 |
|---|---|---|---|
| **Target Tracking** | 목표 지표값을 유지하도록 자동 가감 | "특정 지연/사용률을 유지하라" — 대부분의 시험 시나리오 정답 | 단계별로 세밀히 다른 폭을 주고 싶을 때 |
| **Step Scaling** | CloudWatch 알람이 울리면 미리 정한 단계만큼 가감 | 알람 심각도에 따라 증감 폭을 달리하고 싶을 때 | 단순히 목표치만 유지하면 되는 경우(설정만 복잡해진다) |
| **Scheduled** | 시간표 기준으로 용량 변경 | 업무시간에만 트래픽이 몰리는 등 패턴이 **예측 가능**할 때 | 트래픽이 불규칙해 시간표로 못 잡을 때 |

- **권장 기본 지표**: `SageMakerVariantInvocationsPerInstance` — 인스턴스당 초당 호출 수를 목표값에 맞춰 추적한다.
- **쿨다운**: ScaleOut은 짧게, ScaleIn은 길게 둔다. 트래픽이 출렁일 때 줄였다 늘렸다를 반복하는 **플래핑(flapping)**을 막기 위해서다. 위 예시는 ScaleOut 60초 / ScaleIn 300초.
- **MinCapacity ≥ 1**: 절대 0으로 내려가지 않는다.

### 스케일링 지표 선택 기준

| 무엇을 보고 싶은가 | 볼 지표 | 판단 |
|---|---|---|
| 인스턴스가 감당하는 요청량 | `SageMakerVariantInvocationsPerInstance` | 목표 초과가 지속되면 스케일 아웃 |
| 모델 자체가 느린가 | `ModelLatency` | 높으면 모델 최적화 또는 인스턴스 타입 상향 |
| 서비스 앞단이 느린가 | `OverheadLatency` | 높으면 페이로드 크기·직렬화 방식을 의심 |
| 리소스가 포화인가 | CPU / GPU / Memory Utilization | 스케일 아웃 vs 인스턴스 타입 변경 판단 근거 |
| 오류가 어디서 나는가 | `Invocation4XX` / `Invocation5XX` | 4XX는 클라이언트 요청 문제, 5XX는 서버·모델 문제 |

> ⚠️ **함정**: "트래픽이 없을 때 비용을 0으로 만들고 싶다"는 지문에 실시간 엔드포인트 + 오토스케일링을 고르면 안 된다. MinCapacity가 0이 될 수 없으므로 **Serverless Inference**나 **Asynchronous Inference**가 답이다.

## 멀티모델 엔드포인트(MME): 한 엔드포인트에 수천 개 모델

고객별·지역별로 모델이 수백~수천 개로 불어나면 각각을 별도 엔드포인트로 띄우는 것은 비용도 관리도 감당이 안 된다. MME는 공유 인스턴스 위에 여러 모델을 올려두고 **호출 시 동적으로 로딩**한다.

```python
from sagemaker.multidatamodel import MultiDataModel

mme = MultiDataModel(
    name="mme-endpoint",
    model_data_prefix="s3://my-bucket/models/",  # 모델 아티팩트가 놓인 프리픽스
    image_uri=image, role=role,
)
predictor = mme.deploy(initial_instance_count=2, instance_type="ml.m5.xlarge")
# 호출할 때 TargetModel로 어떤 모델인지 지정
predictor.predict(data, target_model="customer-123.tar.gz")
```

```text
요청(TargetModel=customer-123.tar.gz)
        │
        ▼
   메모리에 이미 로드됨?
   ├─ 예   → 즉시 추론 (지연 낮음)
   └─ 아니오 → S3에서 로드 → 추론 (첫 호출 콜드 지연)
                  │
                  └─ 메모리 부족 시 가장 오래 안 쓴 모델을 LRU 언로드
```

- **동작**: 요청이 오면 해당 모델을 메모리에 로드(이미 있으면 재사용)하고, 메모리가 부족해지면 최근에 안 쓰인 모델부터 언로드(LRU)한다.
- **이점**: 인스턴스 몇 대로 수천 개 모델을 호스팅 → 비용이 크게 준다.
- **트레이드오프**: 오래 호출되지 않은 모델은 첫 호출에서 콜드 스타트 지연이 생기고, 모든 모델이 **같은 프레임워크/컨테이너를 공유**해야 한다.

## MME · MCE · 추론 파이프라인 구분

서로 다른 프레임워크의 모델을 한 엔드포인트에 올리려면 멀티모델이 아니라 멀티컨테이너를 쓴다.

```text
Multi-Model Endpoint (MME)    : 같은 컨테이너, N개의 서로 다른 모델 아티팩트, 동적 로딩
Multi-Container Endpoint (MCE): N개의 서로 다른 컨테이너. Direct(개별 호출) 또는 Serial 모드
Inference Pipeline            : 컨테이너를 직렬 연결(전처리→예측→후처리)해 한 요청으로 처리
```

| 방식 | 컨테이너 | 대표 상황 | 언제 쓰면 안 되나 |
|---|---|---|---|
| **개별 엔드포인트 N개** | 각각 독립 | 모델 수가 적고 각각 SLA·스케일이 다를 때 | 모델이 수백~수천 개일 때(비용 폭증·관리 불가) |
| **MME** | 하나(공유) | 동일 프레임워크 모델 수천 개, 비용 절감이 목표 | 프레임워크가 서로 다를 때, 콜드 지연을 못 견디는 상시 저지연 요구 |
| **MCE (Direct)** | 여러 개 | 서로 다른 프레임워크 모델을 한 엔드포인트에서 **개별 호출** | 전처리→예측을 한 요청으로 묶어야 할 때 |
| **추론 파이프라인** | 여러 개(직렬) | 전처리+예측을 한 요청에 묶어 학습-서빙 스큐 방지 | 각 컨테이너를 독립적으로 따로 호출해야 할 때 |

> ⚠️ **함정**: MME는 "모델이 많다"는 조건만으로 정답이 되지 않는다. **모든 모델이 같은 프레임워크/컨테이너를 공유**해야 한다는 전제가 붙는다. 지문에 프레임워크가 서로 다르다는 단서가 있으면 MCE 쪽이다. 또한 MME의 인스턴스는 0이 아니며 GPU 전용도 아니다.

추론 파이프라인의 전형적인 예: Scikit-learn 전처리 컨테이너 → XGBoost 예측 컨테이너를 직렬로 묶어, 추론 시에도 학습과 **동일한 전처리**가 적용되도록 보장한다(학습-서빙 스큐 방지). 클라이언트가 별도 엔드포인트 두 개를 순서대로 호출하는 방식은 네트워크 왕복과 정합성 문제를 남긴다.

```text
어떤 호스팅 구조를 고를까?
├─ 트래픽이 없을 때 비용을 0으로? ─→ Serverless / Async (실시간 엔드포인트 아님)
├─ 전처리와 예측을 한 요청으로 묶어야 하나?
│    └─ 예 → 추론 파이프라인 (컨테이너 직렬 연결)
├─ 모델들이 같은 프레임워크/컨테이너인가?
│    ├─ 예 + 모델 수가 수백~수천 → MME (TargetModel로 지정, LRU 로딩)
│    └─ 아니오 → MCE Direct 모드 (컨테이너별 개별 호출)
└─ 모델이 소수이고 각각 다른 스케일·SLA → 개별 실시간 엔드포인트
```

> 💡 **개념**: "수천 개의 유사 모델 + 동일 프레임워크 + 비용 절감" → MME. "전처리와 예측을 한 요청으로 묶어라" → 추론 파이프라인. "서로 다른 프레임워크 모델을 한 엔드포인트에서 따로 호출" → MCE Direct 모드. 이 셋의 구분이 자주 출제된다.

## 운영 모니터링 핵심 지표

```text
ModelLatency           : 모델 컨테이너가 추론에 쓴 시간
OverheadLatency        : SageMaker 오버헤드(요청/응답 처리)
Invocations            : 호출 수
Invocation4XX/5XX      : 클라이언트/서버 오류
CPU/GPU/Memory Utilization : 리소스 사용률 → 스케일링·인스턴스 타입 결정 근거
```

지연이 `ModelLatency`에서 크면 모델을 최적화하거나 인스턴스를 상향한다. `OverheadLatency`에서 크면 페이로드·직렬화 문제를 의심한다.

## 지문 단서 → 정답 매핑

| 지문 단서 | 고를 답 | 이유 |
|---|---|---|
| "고객 1만 명 각각의 모델, 동일 XGBoost, 비용 감당 불가" | MME | 공유 인스턴스에 동적 로딩, 개별 엔드포인트는 비용 폭증 |
| "인스턴스당 초당 호출 수를 일정하게 유지" | Target Tracking + `SageMakerVariantInvocationsPerInstance` | 목표 지표 유지가 곧 Target Tracking |
| "업무시간에만 트래픽이 몰리고 패턴이 예측 가능" | Scheduled Scaling | 시간표 기반 용량 변경 |
| "무중단으로 새 모델 버전 배포" | 새 EndpointConfig + UpdateEndpoint | 새 플릿 기동 → 트래픽 이동 → 구 플릿 종료 |
| "엔드포인트 삭제 후 같은 이름으로 재생성" | **오답 보기** | 재생성 구간에 다운타임 발생 |
| "학습과 동일한 전처리를 한 요청으로 보장" | 추론 파이프라인 | 컨테이너 직렬 연결로 학습-서빙 스큐 차단 |
| "MME에서 오래 안 쓴 모델 첫 호출이 느리다" | 메모리에 없어 S3에서 동적 로드 | LRU 언로드 후의 콜드 로딩 |
| "트래픽 없을 때 비용 0" | Serverless / Async | 실시간 엔드포인트는 MinCapacity가 0이 안 된다 |
| "트래픽 비율을 90:10으로 나눈다" | ProductionVariant + `InitialVariantWeight` | 가중치 기반 트래픽 분할 |

다음 글에서는 Neo, Inferentia, 추론 파이프라인으로 엔드포인트를 **더 빠르고 더 싸게** 만드는 추론 최적화를 다룬다.

## 📖 용어

- **ProductionVariant** : EndpointConfig 안에서 "어떤 모델을 어떤 인스턴스로 몇 대, 트래픽 몇 %로" 띄울지 정의한 한 덩어리.
- **InitialVariantWeight** : 여러 변형 사이에 트래픽을 나누는 가중치. A/B 테스트·카나리 배포의 기반이 된다.
- **UpdateEndpoint** : 엔드포인트 이름은 그대로 두고 가리키는 EndpointConfig만 바꿔 끼우는 API. 무중단 교체의 표준 방법.
- **Application Auto Scaling** : SageMaker 변형의 인스턴스 수를 자동 조절하는 AWS 공용 스케일링 서비스.
- **Target Tracking** : "이 지표를 이 값으로 유지해줘"라고만 정하면 알아서 늘리고 줄이는 스케일링 정책.
- **SageMakerVariantInvocationsPerInstance** : 인스턴스 한 대가 초당 처리하는 호출 수. 실시간 엔드포인트 스케일링의 기본 지표.
- **쿨다운(cooldown)** : 스케일 조정 후 다음 조정까지 기다리는 시간. ScaleIn을 길게 둬 플래핑을 막는다.
- **플래핑(flapping)** : 트래픽이 출렁일 때 인스턴스를 줄였다 늘렸다 반복하며 불안정해지는 현상.
- **멀티모델 엔드포인트(MME)** : 같은 컨테이너를 공유하는 다수 모델을 한 엔드포인트에 올리고 호출 시 메모리로 로딩하는 방식.
- **LRU 언로드** : 메모리가 부족할 때 가장 오래 쓰이지 않은 모델부터 내려 자리를 비우는 방식.

## 📝 연습 문제

**문제 1.** 한 회사가 고객 1만 명 각각에 대해 동일한 XGBoost 프레임워크로 학습된 개인화 모델을 운영해야 한다. 모든 모델을 개별 엔드포인트로 띄우는 비용은 감당할 수 없다. 가장 적합한 방식은?

A) 모델 1만 개에 대해 각각 Real-time Endpoint 생성  
B) 멀티모델 엔드포인트(MME)  
C) 멀티컨테이너 엔드포인트 Direct 모드  
D) Batch Transform  

**정답: B**  
해설: "수천~수만 개의 동일 프레임워크 모델 + 비용 절감"은 멀티모델 엔드포인트의 정의다. 공유 인스턴스에 모델을 동적 로딩한다. 개별 엔드포인트(A)는 비용 폭증, MCE(C)는 서로 다른 컨테이너용, Batch(D)는 온라인 개인화 추론에 부적합하다.

---

**문제 2.** 실시간 엔드포인트의 인스턴스 수를, 인스턴스당 초당 호출 수를 일정하게 유지하도록 자동 조절하고 싶다. 가장 적절한 오토스케일링 정책은?

A) Scheduled Scaling  
B) Step Scaling  
C) Target Tracking (SageMakerVariantInvocationsPerInstance)  
D) 수동으로 UpdateEndpoint 호출  

**정답: C**  
해설: 목표 지표값을 유지하도록 자동 조절하는 것은 Target Tracking이며, 인스턴스당 호출 수를 추적하는 기본 지표가 SageMakerVariantInvocationsPerInstance다. Scheduled(A)는 예측 가능한 시간표용, Step(B)은 알람 단계별 가감, 수동(D)은 자동화가 아니다.

---

**문제 3.** 학습 시 Scikit-learn으로 전처리하고 XGBoost로 예측했다. 추론 시에도 동일한 전처리를 한 번의 요청으로 보장해 학습-서빙 스큐를 막고 싶다. 적절한 구성은?

A) 추론 파이프라인(Inference Pipeline)으로 전처리 컨테이너와 예측 컨테이너를 직렬 연결  
B) 멀티모델 엔드포인트  
C) 두 개의 별도 실시간 엔드포인트를 클라이언트가 순서대로 호출  
D) Batch Transform 두 번 실행  

**정답: A**  
해설: 추론 파이프라인은 여러 컨테이너를 직렬로 묶어 전처리→예측을 한 요청으로 처리하므로 학습과 동일한 전처리를 보장한다. MME(B)는 동일 컨테이너의 다른 모델용, 별도 엔드포인트 두 개(C)는 네트워크 왕복·정합성 문제, Batch 두 번(D)은 온라인 요청에 부적합하다.

---

**문제 4.** 무중단으로 새 모델 버전을 배포하기 위한 SageMaker의 표준 메커니즘으로 옳은 것은?

A) 기존 Endpoint를 삭제하고 새 Endpoint를 동일 이름으로 재생성  
B) Model 아티팩트를 S3에서 직접 덮어쓴다  
C) 인스턴스에 SSH로 접속해 모델 파일을 교체한다  
D) 새 EndpointConfig를 만들고 UpdateEndpoint로 교체하면 SageMaker가 새 플릿을 띄운 뒤 트래픽을 옮긴다  

**정답: D**  
해설: Endpoint와 EndpointConfig가 분리되어 있어, 새 EndpointConfig를 UpdateEndpoint로 바꿔 끼우면 새 플릿 기동→트래픽 이동→기존 플릿 종료의 무중단 교체가 일어난다. 삭제 후 재생성(A)은 다운타임 발생, S3 덮어쓰기(B)·SSH 교체(C)는 동작하지 않거나 비권장이다.

---

**문제 5.** 멀티모델 엔드포인트(MME)에서 오랫동안 호출되지 않던 모델을 처음 호출할 때 지연이 발생하는 이유는?

A) 모델이 영구 삭제되었기 때문  
B) 오토스케일링이 항상 0에서 시작하기 때문  
C) 해당 모델이 메모리에 없어 S3에서 동적으로 로드해야 하기 때문  
D) MME는 GPU만 지원하기 때문  

**정답: C**  
해설: MME는 호출된 모델을 메모리에 동적 로드하고 메모리가 부족하면 LRU로 언로드하므로, 오래 안 쓰인 모델은 첫 호출 시 S3에서 로드하는 콜드 지연이 생긴다. 모델이 삭제되는 것은 아니며(A), MME의 인스턴스는 0이 아니고(B), GPU 전용도 아니다(D).

---
