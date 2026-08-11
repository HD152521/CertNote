# Day 2 - 실시간 엔드포인트: 구성, 오토스케일링, 인스턴스 선택

## 📌 핵심 정리

- 실시간 배포는 **Model → EndpointConfig → Endpoint** 3계층. 이 분리가 무중단 배포·A/B·카나리를 가능케 한다.
- 새 모델 배포는 **새 EndpointConfig를 만들고 `update_endpoint`** → SageMaker가 blue/green으로 갈아 끼운다.
- **오토스케일링**은 `SageMakerVariantInvocationsPerInstance` 타깃 추적이 표준. **최소 1대**라 0으로는 못 줄인다.
- 갑작스러운 스파이크는 오토스케일링이 못 따라간다 → **예약 스케일링**이나 넉넉한 `MinCapacity`로 대비.
- 인스턴스는 전통 ML=CPU(m5/c5), 딥러닝=GPU(g4dn/g5), 딥러닝 비용 절감=Inferentia(inf1/inf2).

## 3계층 구조: Model, EndpointConfig, Endpoint

사용자가 결과를 기다리는 온라인 서비스는 거의 다 실시간 엔드포인트로 배포된다. 이 엔드포인트는 다음 3개 리소스로 만들어진다.

- **Model**: S3의 모델 아티팩트(`model.tar.gz`)와 추론 코드가 담긴 컨테이너 이미지를 묶은 정의.
- **EndpointConfig**: 어떤 Model을, 어떤 인스턴스 타입으로, 몇 대(initial instance count) 띄울지, 트래픽 분배 가중치는 어떻게 둘지 정의.
- **Endpoint**: EndpointConfig를 실제로 프로비저닝해 HTTPS로 호출 가능하게 만든 실체.

```text
S3 model.tar.gz ─┐
                 ├─▶ [ Model ] ─▶ [ EndpointConfig ] ─▶ [ Endpoint ]
컨테이너 이미지  ─┘   아티팩트+코드   인스턴스 타입/수      HTTPS 주소
                                    ProductionVariant     (호출자가 보는 것)

핵심: 셋은 별개 리소스다. Endpoint 주소는 그대로 둔 채
      EndpointConfig만 갈아 끼우면 호출자는 아무것도 바꾸지 않아도 된다.
```

```python
import boto3
sm = boto3.client("sagemaker")

# 1) Model: 아티팩트 + 컨테이너
sm.create_model(
    ModelName="churn-model",
    PrimaryContainer={"Image": image_uri, "ModelDataUrl": "s3://bkt/model.tar.gz"},
    ExecutionRoleArn=role,
)
# 2) EndpointConfig: 인스턴스 타입/수
sm.create_endpoint_config(
    EndpointConfigName="churn-config",
    ProductionVariants=[{
        "VariantName": "AllTraffic",
        "ModelName": "churn-model",
        "InstanceType": "ml.m5.xlarge",
        "InitialInstanceCount": 2,
    }],
)
# 3) Endpoint: 실제 배포
sm.create_endpoint(EndpointName="churn-endpoint", EndpointConfigName="churn-config")
```

> 💡 **관련 이론**: 이 3계층 분리의 진짜 가치는 **무중단 업데이트**에 있다. 새 모델을 배포할 때 새 EndpointConfig를 만들고 `update_endpoint`를 호출하면, SageMaker가 새 인스턴스를 먼저 띄워 헬스 체크를 통과시킨 뒤 트래픽을 옮기고 옛 인스턴스를 내린다(blue/green). 엔드포인트는 그대로 살아 있어 호출자는 다운타임을 겪지 않는다. ProductionVariant의 가중치를 조절하면 같은 엔드포인트에서 두 모델로 트래픽을 나누는 A/B 테스트나 카나리 배포도 가능하다.

## 무중단 배포 — blue/green 전환 흐름

새 모델을 올릴 때 엔드포인트를 지웠다 다시 만들면 주소가 끊긴다. 올바른 절차는 **새 EndpointConfig 생성 → `update_endpoint`**다.

```text
[업데이트 전]  Endpoint(churn-endpoint) ──▶ Config v1 ──▶ 인스턴스 2대 (구모델)

update_endpoint(EndpointConfigName="config-v2")
        │
        ├─ 1) 새 인스턴스(green) 프로비저닝 + 모델 로드
        ├─ 2) 헬스 체크 통과 대기
        ├─ 3) 트래픽을 green으로 전환(전량/카나리/선형)
        ├─ 4) 알람 감시 구간(baking) — 실패 시 자동 롤백
        └─ 5) 구 인스턴스(blue) 종료

[업데이트 후]  Endpoint(churn-endpoint) ──▶ Config v2 ──▶ 인스턴스 2대 (신모델)
                 ↑ 주소는 그대로. 호출자는 아무것도 안 바꾼다
```

```python
# 새 설정으로 교체 — 엔드포인트 이름은 그대로 둔다
sm.update_endpoint(
    EndpointName="churn-endpoint",
    EndpointConfigName="churn-config-v2",
)
# 전환 상태 확인: Updating → InService
status = sm.describe_endpoint(EndpointName="churn-endpoint")["EndpointStatus"]
```

트래픽 전환 방식(deployment guardrails)은 성격이 다르다.

| 전환 방식 | 동작 | 언제 쓰나 |
|-----------|------|-----------|
| All-at-once | 트래픽을 한 번에 전량 신버전으로 | 위험이 낮고 빠르게 끝내고 싶을 때 |
| Canary | 소량(예: 5%)만 먼저 보내고 관찰 후 나머지 | 신모델 위험이 클 때, 영향 범위를 최소화 |
| Linear | 정해진 비율씩 단계적으로 이동 | 점진적으로 부하와 오류율을 지켜보고 싶을 때 |
| Rolling | 기존 용량을 일부씩 교체 | 전체 용량을 두 배로 띄울 여력이 없을 때 |

> ⚠️ **함정**: "다운타임 없이 새 모델 배포"의 정답은 항상 **새 EndpointConfig + `update_endpoint`**다. ① 엔드포인트 삭제 후 재생성은 주소가 끊겨 다운타임이 생기고, ② Model 리소스만 새로 만들어도 기존 엔드포인트에 자동 반영되지 않으며, ③ 관리형 인스턴스에 직접 접속해 파일을 바꾸는 것은 애초에 불가능한 안티패턴이다. 이 세 개가 오답 보기로 반복 출제된다.

## ProductionVariant와 A/B 테스트

EndpointConfig 안에는 여러 ProductionVariant를 둘 수 있다.

- 각 variant에 `InitialVariantWeight`를 주면 트래픽이 **가중치 비율로 분배**된다.
- 신모델 10% / 구모델 90%로 시작해 비중을 올리는 **카나리 배포**가 가능하다.
- variant마다 인스턴스 타입·개수를 다르게 둘 수 있다(신모델만 작게 띄우기).

```python
ProductionVariants=[
    {"VariantName": "ModelA", "ModelName": "model-a",
     "InstanceType": "ml.m5.xlarge", "InitialInstanceCount": 2,
     "InitialVariantWeight": 9},   # 90% 트래픽
    {"VariantName": "ModelB", "ModelName": "model-b",
     "InstanceType": "ml.m5.xlarge", "InitialInstanceCount": 1,
     "InitialVariantWeight": 1},   # 10% 트래픽
]
```

A/B 테스트와 shadow testing은 **사용자가 신모델 응답을 받느냐**로 갈린다.

```text
[A/B 테스트]  요청 ──┬─ 90% ─▶ ModelA ─▶ 응답을 사용자에게 반환
                     └─ 10% ─▶ ModelB ─▶ 응답을 사용자에게 반환  ← 일부 사용자가 영향받음

[Shadow]      요청 ────────▶ ModelA ─▶ 응답을 사용자에게 반환
                  └(사본)──▶ ModelB ─▶ 응답 폐기, 지표만 기록     ← 사용자 영향 0
```

| 구분 | A/B(가중치 분배) | Shadow testing |
|------|-----------------|----------------|
| 트래픽 | 실제 요청을 나눠 보냄 | 실제 요청의 **사본**을 보냄 |
| 신모델 응답 | 사용자에게 반환 | **폐기**(지표만 수집) |
| 사용자 영향 | 있음(일부 사용자) | 없음 |
| 목적 | 비즈니스 지표 비교 | 무위험 성능·안정성 검증 |

> 🔍 **더 깊이**: SageMaker는 `InvokeEndpoint` 호출 시 `TargetVariant` 파라미터로 특정 variant를 강제 지정할 수도 있다. 이는 가중치와 무관하게 특정 모델만 테스트하고 싶을 때 쓴다. 또 **Shadow testing(섀도 변형)** 기능을 쓰면 프로덕션 트래픽 사본을 신모델에 보내되 응답은 버려서, 실사용자에게 영향 없이 신모델 성능을 검증할 수 있다. A/B(가중치 분배)와 shadow(응답 폐기)의 차이를 구분하자.

## 오토스케일링 — 트래픽에 맞춰 인스턴스 수 조절

실시간 엔드포인트는 Application Auto Scaling을 붙여 트래픽에 따라 인스턴스 수를 자동 조절한다. 가장 흔한 정책은 **타깃 추적(target tracking)**으로, 특정 지표를 목표값에 맞추도록 인스턴스를 늘리고 줄인다.

대표 지표는 `SageMakerVariantInvocationsPerInstance`(인스턴스당 초당 호출 수)다. "인스턴스 하나가 초당 1,000건을 처리하길 원한다"고 목표를 정하면, 트래픽이 늘어 이 값을 넘으면 스케일 아웃하고 줄면 스케일 인한다.

```python
aas = boto3.client("application-autoscaling")
resource_id = "endpoint/churn-endpoint/variant/AllTraffic"

aas.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId=resource_id,
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=2, MaxCapacity=10,
)
aas.put_scaling_policy(
    PolicyName="invocations-tracking",
    ServiceNamespace="sagemaker", ResourceId=resource_id,
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
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

- `MinCapacity`를 1 이상으로 둬야 하므로 실시간 엔드포인트는 **0으로 줄지 않는다**(0이 필요하면 서버리스/비동기).
- **쿨다운(cooldown)**은 스케일 동작 후 다음 동작까지의 대기 시간이다.
  - `ScaleOutCooldown`은 짧게 → 부하 증가에 빠르게 반응
  - `ScaleInCooldown`은 길게 → 트래픽이 다시 튈 때 성급히 줄여 놓고 후회하지 않도록

스케일링 정책 유형은 목적에 따라 갈린다.

| 정책 유형 | 동작 | 적합한 상황 |
|-----------|------|-------------|
| 타깃 추적(Target tracking) | 지표를 목표값에 맞추도록 자동 증감 | 기본 선택. 부하 비례로 조절 |
| 단계(Step) 스케일링 | 알람 임계 구간별로 정해진 만큼 증감 | 구간별로 다른 증감 폭이 필요할 때 |
| 예약(Scheduled) 스케일링 | 정해진 시각에 용량을 미리 변경 | 세일·이벤트처럼 **예측 가능한** 급증 |

> ⚠️ **함정**: 오토스케일링은 만능이 아니다. 새 인스턴스를 띄우고 모델을 로드해 헬스 체크를 통과하기까지 몇 분이 걸리므로, **갑작스러운 트래픽 스파이크**에는 즉각 대응하지 못한다. 블랙프라이데이처럼 예측 가능한 급증에는 **예약 스케일링(scheduled scaling)**으로 미리 용량을 늘려두거나 충분한 `MinCapacity`를 확보해야 한다. "오토스케일링을 켰는데도 스파이크 때 지연이 튀었다"는 시나리오의 답은 보통 예약 스케일링 또는 더 높은 최소 용량이다.

## 엔드포인트 모니터링 지표

무엇을 보고 스케일·튜닝을 판단하는지 알아야 한다. 엔드포인트 지표는 CloudWatch로 나간다.

| 지표 | 의미 | 이 값이 튀면 |
|------|------|-------------|
| `Invocations` | 엔드포인트가 받은 총 호출 수 | 트래픽 자체의 증감 |
| `InvocationsPerInstance` | 인스턴스 1대당 호출 수 | 타깃 추적 스케일링의 기준 지표 |
| `ModelLatency` | 모델 컨테이너가 응답하는 데 걸린 시간 | 모델·인스턴스가 부족하다는 신호 |
| `OverheadLatency` | SageMaker 쪽 처리에 더해진 시간 | 페이로드 직렬화·네트워크 쪽 문제 |
| `Invocation4XXErrors` | 잘못된 요청(형식·페이로드) | 호출 측 입력 스키마 문제 |
| `Invocation5XXErrors` | 모델·컨테이너 오류 | 추론 코드 예외, OOM 등 |
| `CPUUtilization` / `MemoryUtilization` | 인스턴스 자원 사용률 | 인스턴스 타입 상향/스케일 아웃 검토 |

> 💡 **개념**: 지연 문제를 볼 때는 `ModelLatency`와 `OverheadLatency`를 **분리해서** 봐야 한다. `ModelLatency`가 높으면 모델 자체가 무겁거나 인스턴스가 부족한 것이라 인스턴스 상향·스케일 아웃·모델 최적화가 답이다. 반면 `OverheadLatency`가 높으면 큰 페이로드 직렬화나 네트워크 구간이 원인일 가능성이 크다. 두 값을 뭉뚱그려 "느리다"로 보면 엉뚱한 조치를 하게 된다.

## 인스턴스 선택 — CPU vs GPU vs 가속기

인스턴스 패밀리 선택은 모델 종류와 지연 요구에 따라 갈린다.

| 패밀리 | 성격 | 적합한 모델 | 비고 |
|--------|------|-------------|------|
| `ml.m5` / `ml.c5` (CPU) | 범용 / 컴퓨팅 최적화 | XGBoost·선형 모델·작은 신경망 등 전통 ML | 가장 저렴. 대부분의 표 데이터 모델의 기본값 |
| `ml.g4dn` / `ml.g5` (GPU) | 추론용 GPU | 중대형 이미지·NLP 딥러닝 | 행렬 연산 병렬화로 지연을 크게 낮춘다 |
| `ml.p3` / `ml.p4` (고성능 GPU) | 대형 학습용 GPU | 매우 큰 모델, 초고처리량 | 비싸다. 추론보다 **학습**에 흔히 쓴다 |
| `ml.inf1` / `ml.inf2` (Inferentia) | AWS 추론 전용 칩 | 딥러닝 추론(트랜스포머·CNN) | 추론당 비용 절감. **Neuron 컴파일** 단계 필요 |

> 💡 **관련 이론**: 추론 인스턴스 선택은 "지연 목표 × 처리량 × 비용"의 균형이다. 전통 ML(XGBoost)은 CPU로 충분하고 GPU를 붙여도 효과가 미미하다. 반면 트랜스포머·CNN 같은 딥러닝은 GPU나 Inferentia에서 지연이 극적으로 줄어든다. 시험에서 "딥러닝 모델인데 GPU 비용이 부담"이라는 조건이 나오면 Inferentia(inf1/inf2)가 정답 신호다. 반대로 "XGBoost인데 GPU를 써서 비용을 낮추자"는 잘못된 선택지로 자주 출제된다.

## Inference Recommender — 어떤 인스턴스가 최적인가

인스턴스 타입과 개수를 직접 고르기 어렵다면 SageMaker **Inference Recommender**가 부하 테스트를 자동 수행해 비용·지연·처리량 기준으로 최적 구성을 추천한다. 여러 인스턴스 타입에 모델을 배포해 트래픽을 흘려보고 결과를 비교해준다.

| 잡 타입 | 하는 일 | 언제 쓰나 |
|---------|---------|-----------|
| Default(기본) | 여러 인스턴스 타입에 빠르게 배포해 광범위 비교 | 후보를 좁히는 1차 탐색 |
| Advanced(커스텀) | 요청률·지연 SLA 등 트래픽 패턴을 직접 정의해 정밀 부하 테스트 | 실제 SLA를 만족하는지 확인할 때 |

```python
sm.create_inference_recommendations_job(
    JobName="rec-job-1",
    JobType="Default",
    RoleArn=role,
    InputConfig={"ModelPackageVersionArn": model_package_arn},
)
```

> 🔍 **더 깊이**: Inference Recommender는 두 모드가 있다. **Default(기본)** 잡은 여러 인스턴스 타입에 빠르게 배포해 광범위하게 비교하고, **Advanced(커스텀)** 잡은 원하는 트래픽 패턴(초당 요청 수, 지연 SLA)을 직접 정의해 정밀 부하 테스트를 한다. "인스턴스 타입을 어떻게 정할지 모르겠다, 데이터로 결정하고 싶다"는 시나리오의 답이 Inference Recommender다.

## 증상 → 원인 → 조치

| 증상 | 원인 | 조치 |
|------|------|------|
| 평시엔 괜찮은데 스파이크 때만 지연이 튄다 | 새 인스턴스 기동·모델 로드에 수 분 소요 | 예약 스케일링으로 사전 확보, `MinCapacity` 상향 |
| `ModelLatency`가 계속 높다 | 모델이 무겁거나 인스턴스가 부족 | 인스턴스 상향/스케일 아웃, GPU·Inferentia 검토 |
| `Invocation5XXErrors` 증가 | 추론 코드 예외, 메모리 부족(OOM) | 컨테이너 로그 확인, 메모리 큰 인스턴스로 교체 |
| 인스턴스 수가 계속 늘었다 줄었다 반복 | 스케일 인 쿨다운이 너무 짧음 | `ScaleInCooldown`을 늘려 진동(flapping) 억제 |
| 트래픽이 없는 밤에도 비용이 나간다 | 실시간은 최소 1대 상시 유지 | 간헐 트래픽이면 서버리스·비동기로 이전 |
| 배포 후 오류율이 올라 되돌리고 싶다 | 신모델 회귀 | CloudWatch 알람 + 카나리/선형 전환으로 자동 롤백 구성 |

다음 글에서는 한 엔드포인트에 여러 모델을 얹어 비용을 줄이는 멀티모델/멀티컨테이너와 추론 파이프라인, 그리고 Inferentia/Elastic Inference를 깊이 본다.

## 📖 용어

- **모델 아티팩트** : 학습이 끝난 모델의 가중치·구조를 담아 S3에 올려 둔 압축 파일(`model.tar.gz`).
- **EndpointConfig** : 어떤 모델을 어떤 인스턴스로 몇 대 띄울지 적어 둔 설계도. 엔드포인트와 별개 리소스다.
- **ProductionVariant** : 한 엔드포인트 안에서 트래픽을 나눠 받는 모델 묶음 하나. 가중치를 줄 수 있다.
- **blue/green 배포** : 새 버전을 따로 띄워 정상 확인 후 트래픽을 옮기고 옛 버전을 내리는 무중단 교체 방식.
- **카나리(Canary) 배포** : 아주 적은 비율의 트래픽만 신버전에 먼저 보내 보고 이상 없으면 넓히는 방식.
- **Shadow testing** : 실제 요청의 사본을 신모델에 보내되 응답은 버려서, 사용자 영향 없이 성능만 재는 검증.
- **타깃 추적(Target tracking)** : 지표를 목표값에 맞추도록 인스턴스 수를 자동으로 늘리고 줄이는 정책.
- **쿨다운(Cooldown)** : 한 번 스케일한 뒤 다음 스케일까지 기다리는 시간. 너무 짧으면 증감이 요동친다.
- **ModelLatency** : 모델 컨테이너가 요청을 처리해 응답하기까지 걸린 시간.
- **Inference Recommender** : 여러 인스턴스 타입에 실제로 부하를 걸어 최적 구성을 데이터로 골라 주는 기능.

## 📝 연습 문제

**문제 1.** 운영 중인 실시간 엔드포인트에 새 모델 버전을 배포하되 호출자가 다운타임을 겪지 않게 하려 한다. 올바른 방법은?

A) 기존 엔드포인트를 삭제하고 새 엔드포인트를 만든다  
B) 새 EndpointConfig를 만들고 update_endpoint를 호출해 blue/green으로 전환한다  
C) 인스턴스에 SSH로 접속해 모델 파일을 교체한다  
D) Model 리소스만 바꾸면 자동 반영된다  

**정답: B**  
해설: 새 EndpointConfig를 만들어 `update_endpoint`를 호출하면 SageMaker가 새 인스턴스를 띄워 헬스 체크 후 트래픽을 옮기고 옛 인스턴스를 내리는 blue/green 전환을 수행해 다운타임이 없다. A는 엔드포인트 URL이 끊겨 다운타임이 생기고, C는 SageMaker 관리형 인스턴스에 직접 접속하는 안티패턴이며, D는 Model만 바꿔도 기존 엔드포인트에 자동 반영되지 않는다.

---

**문제 2.** 트래픽이 시간대별로 크게 변하는 실시간 엔드포인트에 오토스케일링을 적용하려 한다. 가장 일반적으로 쓰는 타깃 추적 지표는?

A) CPUUtilization만  
B) SageMakerVariantInvocationsPerInstance(인스턴스당 호출 수)  
C) 디스크 사용량  
D) S3 객체 수  

**정답: B**  
해설: 실시간 엔드포인트 오토스케일링의 표준 타깃 추적 지표는 인스턴스당 초당 호출 수(`SageMakerVariantInvocationsPerInstance`)로, 부하를 직접 반영해 인스턴스 수를 조절한다. A의 CPU는 보조 지표로 쓸 수 있으나 호출 기반 부하를 가장 정확히 반영하는 표준은 아니고, C·D는 추론 부하와 무관한 지표다.

---

**문제 3.** XGBoost 기반 이탈 예측 모델을 실시간 배포한다. 지연 요구는 일반적이고 비용을 아끼고 싶다. 인스턴스 선택으로 가장 적절한 것은?

A) ml.p4d 고성능 GPU  
B) ml.m5/ml.c5 같은 CPU 인스턴스  
C) ml.inf2 Inferentia  
D) GPU가 많을수록 항상 빠르므로 ml.g5.48xlarge  

**정답: B**  
해설: XGBoost 같은 트리 기반 전통 ML은 GPU 병렬화 이득이 거의 없어 CPU 인스턴스(m5/c5)가 비용 대비 가장 합리적이다. A는 학습용 고성능 GPU로 추론에 과도한 비용이고, C의 Inferentia는 딥러닝 추론 가속용이라 트리 모델엔 이점이 없으며, D는 비싼 대형 GPU를 불필요하게 쓰는 낭비다.

---

**문제 4.** 신규 모델을 프로덕션 트래픽에서 검증하되, 실사용자 응답에는 영향을 주지 않고 신모델의 성능만 관찰하고 싶다. 적절한 기능은?

A) ProductionVariant 가중치를 50:50으로 둔 A/B 테스트  
B) Shadow testing(섀도 변형)으로 트래픽 사본을 신모델에 보내고 응답은 폐기  
C) 배치 변환으로 과거 데이터를 재처리  
D) 엔드포인트를 둘로 나눠 사용자를 절반씩 보낸다  

**정답: B**  
해설: Shadow testing은 프로덕션 트래픽의 사본을 신모델로 보내되 그 응답을 사용자에게 반환하지 않고 폐기하므로, 실사용자 경험에 영향 없이 신모델 성능을 검증할 수 있다. A·D는 실제 사용자 일부가 신모델 응답을 받게 되어 "영향 없음" 조건을 위반하고, C는 실시간 프로덕션 트래픽 검증이 아니다.

---

**문제 5.** 어떤 인스턴스 타입과 개수가 비용·지연·처리량 기준으로 최적인지 데이터에 근거해 결정하고 싶다. SageMaker에서 쓸 도구는?

A) Inference Recommender  
B) Data Wrangler  
C) Feature Store  
D) Ground Truth  

**정답: A**  
해설: Inference Recommender는 여러 인스턴스 타입에 모델을 배포하고 부하 테스트를 수행해 비용·지연·처리량을 비교한 추천 구성을 제공한다. B는 특성 공학/데이터 준비 도구, C는 특성 저장소, D는 데이터 라벨링 서비스로 모두 인스턴스 선택과 무관하다.

---
