# Day 2 - 실시간 엔드포인트 운영: 구성·오토스케일링·멀티모델

어제 네 가지 추론 옵션 중 가장 운영 부담이 큰 것이 Real-time Endpoint라고 했다. 상시 가동되는 인스턴스 위에서 안정적 저지연을 제공하려면, 엔드포인트를 어떻게 구성하고, 트래픽 변동에 어떻게 자동 대응하며, 모델이 수십~수천 개로 늘어날 때 비용을 어떻게 통제할지를 알아야 한다. 오늘은 SageMaker 실시간 엔드포인트의 운영 3대 축 — 엔드포인트 구성, 오토스케일링, 멀티모델/멀티컨테이너 — 를 다룬다.

## 엔드포인트의 3계층 구조

SageMaker 실시간 추론은 세 가지 리소스로 분리되어 있고, 이 분리가 무중단 업데이트와 트래픽 분할의 토대가 된다.

```text
Model              : 학습 산출물(S3 모델 아티팩트) + 추론 컨테이너 이미지
EndpointConfig     : 어떤 Model들을 어떤 인스턴스/비율로 올릴지 정의(ProductionVariant)
Endpoint           : 실제 HTTPS URL. EndpointConfig를 가리킨다.
```

핵심은 **Endpoint와 EndpointConfig가 분리**되어 있다는 점이다. 새 EndpointConfig를 만든 뒤 `UpdateEndpoint`로 바꿔 끼우면, SageMaker가 새 플릿을 띄우고 트래픽을 옮긴 다음 기존 플릿을 내리는 무중단 교체를 수행한다.

```python
from sagemaker.model import Model

model = Model(image_uri=image, model_data=s3_artifact, role=role)
model.deploy(
    initial_instance_count=2,
    instance_type="ml.m5.xlarge",
    endpoint_name="prod-endpoint",
)
```

> 💡 **관련 이론**: ProductionVariant는 하나의 EndpointConfig 안에 여러 개를 둘 수 있고, 각 Variant에 `InitialVariantWeight`로 트래픽 비율을 지정한다. 이 가중치 기반 분할이 내일 배울 A/B 테스트와 카나리 배포의 기반 메커니즘이다.

## 오토스케일링: 트래픽에 맞춰 인스턴스 조절

상시 가동의 비용 함정을 줄이려면, 트래픽에 따라 인스턴스 수를 자동으로 늘리고 줄여야 한다. SageMaker는 Application Auto Scaling으로 Variant 단위 스케일링을 지원한다.

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

- **권장 기본 지표**: `SageMakerVariantInvocationsPerInstance` — 인스턴스당 초당 호출 수를 목표값으로 추적(Target Tracking)
- **쿨다운**: ScaleOut(증설)은 짧게, ScaleIn(축소)은 길게 두어 트래픽이 출렁여도 인스턴스를 성급히 내렸다 다시 올리는 플래핑(flapping)을 막는다.
- **MinCapacity ≥ 1**: 0으로 내려가지 않는다. 완전 0 스케일이 필요하면 Serverless/Async를 써야 한다.

## 정책 유형

```text
Target Tracking : 목표 지표값을 유지하도록 자동 조절(가장 권장, 설정 단순)
Step Scaling    : CloudWatch 알람 단계별로 정해진 양만큼 가감
Scheduled       : 트래픽 패턴이 예측 가능할 때 시간표 기반(예: 업무시간만 증설)
```

대부분의 시험 시나리오에서 "특정 지연/사용률을 유지하라"는 요구는 Target Tracking이 정답이다.

## 멀티모델 엔드포인트(MME): 모델 수천 개를 한 엔드포인트에

고객별/지역별로 모델이 수백~수천 개로 늘어나면, 각각 별도 엔드포인트로 띄우는 것은 비용·관리 측면에서 불가능하다. 멀티모델 엔드포인트는 하나의 엔드포인트에서 다수 모델을 공유 인스턴스에 동적 로딩한다.

```python
from sagemaker.multidatamodel import MultiDataModel

mme = MultiDataModel(
    name="mme-endpoint",
    model_data_prefix="s3://my-bucket/models/",  # 모델 아티팩트들이 모인 prefix
    image_uri=image, role=role,
)
predictor = mme.deploy(initial_instance_count=2, instance_type="ml.m5.xlarge")
# 호출 시 TargetModel로 어떤 모델을 쓸지 지정
predictor.predict(data, target_model="customer-123.tar.gz")
```

- **동작 원리**: 요청이 오면 해당 모델을 메모리에 로드(이미 로드돼 있으면 즉시 사용), 메모리가 부족하면 오랫동안 안 쓰인 모델을 언로드(LRU)
- **장점**: 모델 수천 개를 인스턴스 몇 대로 호스팅 → 큰 비용 절감
- **트레이드오프**: 한동안 호출 안 된 모델은 첫 호출 시 로딩 지연(cold). 모든 모델은 **동일 프레임워크/컨테이너**여야 한다.

## 멀티컨테이너 엔드포인트(MCE)와 추론 파이프라인

서로 다른 프레임워크의 모델을 한 엔드포인트에 두려면 멀티모델이 아니라 멀티컨테이너를 쓴다.

```text
멀티모델 엔드포인트(MME)    : 같은 컨테이너, 다른 모델 아티팩트 N개를 동적 로딩
멀티컨테이너 엔드포인트(MCE) : 서로 다른 컨테이너 N개. Direct(개별 호출) 또는 Serial(순차) 모드
추론 파이프라인(Pipeline)   : 컨테이너를 순차로 연결(전처리→예측→후처리)해 한 요청으로 처리
```

추론 파이프라인은 예를 들어 "Scikit-learn 전처리 컨테이너 → XGBoost 예측 컨테이너"를 직렬로 묶어, 학습 때와 동일한 전처리를 추론 시에도 보장한다(학습-서빙 스큐 방지).

> 💡 **관련 이론**: "수천 개의 유사 모델, 같은 프레임워크, 비용 절감"이면 MME. "전처리와 예측을 한 요청으로 묶고 싶다"면 추론 파이프라인. "서로 다른 프레임워크 모델을 한 엔드포인트에서 따로 호출"이면 MCE의 Direct 모드. 이 세 키워드 구분이 시험 단골이다.

## 운영 모니터링 핵심 지표

```text
ModelLatency           : 모델 컨테이너가 추론에 쓴 시간
OverheadLatency        : SageMaker 오버헤드(요청/응답 처리)
Invocations            : 호출 수
Invocation4XX/5XX      : 클라이언트/서버 오류
CPU/GPU/Memory Utilization : 자원 사용률 → 스케일링/인스턴스 타입 결정 근거
```

지연이 ModelLatency에서 큰지 OverheadLatency에서 큰지에 따라 처방이 다르다. 전자는 모델 최적화/인스턴스 업그레이드, 후자는 페이로드/직렬화 문제를 의심한다.

## 마무리

실시간 엔드포인트 운영은 "구성(무중단 교체) → 오토스케일링(비용·안정성) → 멀티모델/파이프라인(규모·재현성)"의 세 축으로 이해하면 된다. 특히 멀티모델·멀티컨테이너·추론 파이프라인의 구분은 시험에서 명확한 키워드로 갈리므로 반드시 외워둔다. 내일은 이 엔드포인트가 더 빠르고 싸게 돌도록 만드는 추론 최적화 — Neo, Inferentia, 추론 파이프라인 — 를 다룬다.

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
