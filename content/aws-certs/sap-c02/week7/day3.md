# Day 3 - Fargate의 단가 해부 — 서버리스 컨테이너의 진짜 가격표

"Fargate가 비싸다"는 말은 절반만 맞다. 단가표 위 숫자만 보면 EC2보다 vCPU당 약 2배가량 비싼 게 사실이지만, 거기엔 노드 운영비·유휴 자원·Bin Packing 비효율이 빠져 있다. 평균 노드 사용률 30%로 돌아가는 EC2 클러스터와, 100%에 가깝게 채워지는 Fargate Task를 단순 비교하면 결과가 뒤집힐 수 있다. SAP 시험은 이 미묘한 분기점을 정확히 짚어내는 시나리오를 한 도메인당 두세 문제씩 깐다. "트래픽이 가변인데 24/7 운영"·"피크가 평소의 10배"·"GPU 추론 작업"이 들어오는 순간 정답이 EC2·Fargate·Lambda 사이에서 갈린다.

이 글에서는 Fargate의 과금 구조를 초 단위로 뜯어보고, vCPU·메모리 조합이 왜 이상한 매트릭스 형태로 정해져 있는지를 본다. 그 다음 Fargate Spot·Compute Savings Plans·Graviton ARM의 세 가지 할인 레버를 어떻게 조합하면 총 단가를 절반 이하로 떨어뜨릴 수 있는지를 본다. 마지막으로 Image Pull의 콜드 스타트, SOCI lazy loading, Lambda·EC2와의 비용 분기점을 다룬다. 다음 글의 서비스 메시 주제로 넘어가기 전에 "Fargate를 언제 쓰면 안 되는가"의 감각을 만드는 게 목표다.

## Fargate 과금의 미세 구조 — 초 단위 + 1분 최소

Fargate는 vCPU·시간과 메모리·시간을 별도로 청구한다. 대략 us-east-1 기준 단가는 **vCPU 0.04048 USD/h**, **메모리 0.004445 USD/GB-h** 정도다. 청구는 초 단위로 잘리되 최소 1분이 적용된다. 즉 30초만 돌고 종료된 Task도 1분으로 잡힌다.

여기서 발생하는 첫 번째 비용 함정이 **이미지 Pull 시간이 과금에 포함된다**는 점이다. Fargate는 노드 캐시가 없어서 매 Task마다 ECR에서 이미지를 내려받는데, 큰 이미지는 30~60초가 걸린다. 트래픽이 들어와도 응답하지 못하는 시간 동안 vCPU·메모리 단가가 흘러간다. 짧은 잡(예: 배치 처리 30초)에 큰 이미지(2GB)를 쓰면 Pull 비용이 본 작업보다 크다.

```
[Task 시작]
  │ (1) micro VM 부팅 ~3초          ← 과금 시작
  │ (2) ECR 이미지 Pull 30~60초      ← 과금 흐름
  │ (3) 컨테이너 실행 + 잡 처리       ← 본업
  │ (4) graceful shutdown            ← 과금 끝
[Task 종료]
```

> 💡 **관련 이론**: 클라우드 컨테이너 서비스의 과금 모델은 **fine-grained billing**의 한 사례다. EC2는 시간 단위, Lambda는 1ms 단위, Fargate는 초 단위(1분 최소). 이 차이는 워크로드 형태에 따라 결정적이다. 1ms 단위인 Lambda는 짧고 빈번한 호출(요청당 100ms)에 압도적으로 유리하고, 시간 단위인 EC2는 장시간 일정 부하(24/7)에 유리하다. Fargate는 그 사이의 "분~시간 단위로 살아 있다가 사라지는 워크로드"에 최적화되어 있다. 이 과금 모델의 진화는 AWS의 *"Serverless Architectures with AWS Lambda"* 백서와 NSDI 2020 Firecracker 논문에서 잘 다뤄진다.

## vCPU·메모리 조합의 이상한 매트릭스

Fargate Task Definition을 처음 작성할 때 가장 헷갈리는 부분이 vCPU·메모리 조합이다. 임의의 값이 안 되고 정해진 매트릭스만 허용된다.

| vCPU | 허용 메모리 |
|------|-------------|
| 0.25 | 0.5, 1, 2 GB |
| 0.5  | 1~4 GB (1GB 단위) |
| 1    | 2~8 GB (1GB 단위) |
| 2    | 4~16 GB (1GB 단위) |
| 4    | 8~30 GB (1GB 단위) |
| 8    | 16~60 GB (4GB 단위) |
| 16   | 32~120 GB (8GB 단위) |

이게 왜 이렇게 정해졌느냐면, Fargate가 내부적으로 EC2 인스턴스 family 위에서 동작하기 때문이다. AWS가 m5/c5/r5 같은 family의 vCPU-메모리 비율(1:2, 1:4, 1:8)을 그대로 노출한 것이다. 8 vCPU에 64GB(1:8) 같은 메모리 우세 조합은 가능하지만, 0.25 vCPU에 32GB 같은 비현실적 조합은 거부된다.

이 매트릭스를 모르고 "32GB 메모리 + 0.5 vCPU"를 쓰려 하면 등록 자체가 실패한다. 메모리를 더 쓰려면 vCPU를 같이 늘려야 하고, 그러면 단가가 비례해서 오른다. 이게 일부 워크로드에서 Fargate가 EC2보다 비싸지는 이유 중 하나다. 메모리만 많이 필요한 워크로드(예: in-memory cache, JVM heap)에서 vCPU를 강제로 함께 사야 한다.

> 🔍 **더 깊이**: 이 매트릭스 제약을 우회하는 패턴이 **multi-container Task**다. 한 Task에 메인 컨테이너(0.25 vCPU, 0.5GB)와 사이드카(0.25 vCPU, 1.5GB)를 합쳐 Task 전체로 0.5 vCPU·2GB를 신청하고, 컨테이너 정의에서 `memoryReservation`으로 메모리만 한쪽에 몰아주는 방법. 단 EC2 Launch Type에서만 잘 동작하고, Fargate에서는 컨테이너 간 자원 격리가 더 엄격해 효과가 제한적이다. SAP 시험은 이 정도 디테일은 안 묻지만 실무에서 자주 보는 패턴이다.

## Fargate Spot — 70% 할인을 받는 대가

Fargate Spot은 표준 Fargate의 약 70% 할인이다. 대신 AWS가 용량을 회수할 권리를 가지며, 회수 시 **2분 전 SIGTERM**으로 알려준다. 이 2분 안에 graceful shutdown(in-flight 요청 마무리, 큐에 메시지 다시 넣기, 캐시 flush)을 끝내야 한다.

```
[Spot Task 정상 동작]
   │
[AWS 용량 부족 감지 → 회수 결정]
   │
[Task에 SIGTERM 전송]  ← 2분 카운트다운 시작
   │
[애플리케이션이 graceful shutdown:
  - ALB Target Group에서 deregistration
  - 진행 중 요청 응답 마무리
  - 메시지 큐 visibility timeout 해제]
   │
[2분 경과 → SIGKILL]
[Task 강제 종료]
```

Fargate Spot이 잘 맞는 워크로드:
- **무상태 백오피스 API**: 요청이 짧고 다른 Task가 즉시 대신할 수 있음
- **배치 잡**: 재시작 가능한 worker
- **개발/스테이징 환경**: 비용이 가용성보다 중요

부적합한 워크로드:
- **장시간 트랜잭션** (회수 시 롤백 비용 큼)
- **Stateful** (in-memory 세션, WebSocket 장기 연결)
- **Real-time** (SIGTERM 대응 시간 없음)

ECS Service의 Capacity Provider에서 가중치(weight)와 베이스(base)로 혼합한다. 예: base=2, FARGATE weight=1, FARGATE_SPOT weight=4 → 첫 2개 Task는 항상 On-Demand, 그 뒤로는 20:80 비율.

```bash
aws ecs put-cluster-capacity-providers \
  --cluster prod \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    'capacityProvider=FARGATE,weight=1,base=2' \
    'capacityProvider=FARGATE_SPOT,weight=4'
```

> 💡 **관련 이론**: Spot 인스턴스의 원리는 **이자율 가격 발견(price discovery)** 메커니즘이다. AWS 데이터센터에는 항상 일정 비율의 유휴 용량(buffer capacity)이 있고, 이걸 정가로 팔면 수요가 부족하다. 그래서 시장 가격(spot price)으로 할인 판매하되, 정가 수요가 갑자기 늘면 회수하는 옵션을 가진다. 회수 알림 시간(SIGTERM 2분)은 사용자가 graceful shutdown을 할 수 있는 최소 시간으로 산정된 것이다. EC2 Spot은 회수율이 평균 5% 이하지만, Fargate Spot은 capacity 풀 자체가 작아 회수율이 약간 더 높을 수 있다(공식 수치 비공개).

> 📚 **사례**: 2023년 Pinterest는 일부 백엔드 워크로드를 ECS Fargate + Fargate Spot 80% 혼합으로 전환해 컨테이너 인프라 비용을 약 40% 절감했다고 발표했다. Spot 회수에 대비해 `STOPTIMEOUT`을 120초로 설정하고 SIGTERM 핸들러로 in-flight HTTP 요청을 graceful drain, 워커는 SQS message visibility timeout을 재설정하는 패턴을 표준화했다. re:Invent 2023 CON401.

## Compute Savings Plans — Fargate에도 약정 할인을 적용

Savings Plans는 사용자가 "1년 또는 3년간 시간당 N달러어치 컴퓨트를 쓰겠다"고 약정하는 대가로 할인을 받는 제도다. 두 종류가 있고, Fargate에 적용되는 건 **Compute Savings Plans**다.

| 종류 | 적용 대상 | 할인율 | 유연성 |
|------|----------|--------|--------|
| **EC2 Instance Savings Plans** | 특정 family + region의 EC2만 | ~72% | 낮음(family·region 고정) |
| **Compute Savings Plans** | EC2 + Fargate + Lambda 모두 | ~66% | 매우 높음(family·region·서비스 자유) |

Compute Savings Plans의 핵심은 **유연성**이다. 1년 약정으로 시간당 $10 컴퓨트를 사면, 그 안에서 ECS Fargate를 쓰든 EC2를 쓰든 Lambda를 쓰든 할인 적용된다. 워크로드를 EC2에서 Fargate로 이전하는 도중에도 약정이 그대로 살아 있어서, 마이그레이션 중 비용 폭증을 막아준다.

```
[Compute Savings Plans $10/h 약정]
       │
       ├─ EC2 m5.xlarge × 2 $0.38/h → 자동 SP 적용
       ├─ Fargate Task 5개 $4.20/h → 자동 SP 적용
       └─ Lambda 호출 $5.42/h    → 자동 SP 적용
                                    합계 약정 한도 안
```

Spot과 Compute SP는 **별개의 할인 메커니즘**이라 Fargate Spot에는 SP가 추가 적용되지 않는다(Spot 자체 할인만 적용). 하지만 On-Demand 부분에는 SP가 적용된다. 그래서 위의 Capacity Provider 혼합(base=2 On-Demand + Spot 80%)을 쓰면, On-Demand 2개에는 SP 할인이 적용되고 Spot 8개에는 Spot 할인이 적용되는 **이중 할인 패턴**이 된다.

> 🔍 **더 깊이**: Reserved Instance(RI)는 SP보다 더 오래된 제도로 EC2·RDS·ElastiCache 등 별도 제도를 가진다. RI는 인스턴스 타입을 고정하는 대신 capacity reservation도 함께 제공하고, SP는 capacity reservation은 없고 청구 할인만 제공한다. AWS는 2019년 SP를 발표하며 사실상 "RI는 더 이상 권장하지 않음"이라는 신호를 보냈고, 현재 신규 워크로드의 표준은 SP다. SAP 시험에서 "유연성·다중 서비스 할인"이 강조되면 Compute SP, "EC2 인스턴스 고정·최대 할인율"이면 EC2 Instance SP, "스토리지·DB capacity 보장 필요"면 RI가 답이다.

## Graviton(ARM64) — 같은 워크로드를 20% 싸게

Fargate는 x86_64와 ARM64(Graviton2 기반) 모두를 지원한다. ARM64는 같은 성능에 약 20% 싸다. Task Definition의 `runtimePlatform.cpuArchitecture`만 `ARM64`로 바꾸면 적용된다.

```json
{
  "family": "myapp",
  "runtimePlatform": {
    "cpuArchitecture": "ARM64",
    "operatingSystemFamily": "LINUX"
  },
  "cpu": "1024",
  "memory": "2048",
  ...
}
```

전제 조건은 컨테이너 이미지가 **multi-architecture 빌드**여야 한다는 점이다. `docker buildx`로 amd64·arm64 둘 다 푸시해두면 Fargate가 자동으로 맞는 이미지를 받는다. 일부 native binary(C/C++)나 머신러닝 라이브러리는 ARM64 지원이 아직 부족할 수 있어서, 마이그레이션 전에 의존성 호환을 확인해야 한다.

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t myrepo/myapp:1 --push .
```

> 📚 **사례**: 2022년 Snap(Snapchat 모기업)은 백엔드 마이크로서비스 일부를 Graviton2 Fargate로 옮겨 약 22% 비용 절감을 달성했다. 가장 큰 작업은 종속성 라이브러리(특히 JNI 바인딩 가진 Java 라이브러리, native node-gyp 모듈)의 ARM64 빌드 확보였다. AWS re:Invent 2022 CMP301 발표. 핵심 교훈: Graviton 절감의 80%는 인프라 변경, 20%는 종속성 정리 작업이다.

> 💡 **관련 이론**: ARM64가 같은 성능에 단가가 낮은 이유는 두 가지다. 첫째, AWS가 직접 설계한 칩이라 Intel·AMD에 라이선스 비용을 안 낸다. 둘째, ARM 아키텍처가 RISC 계열이라 같은 트랜지스터로 더 많은 코어를 넣을 수 있다(Graviton3는 64코어/소켓). 같은 데이터센터 공간·전력에서 더 많은 컴퓨트가 나오는 게 단가 차이의 본질이다. 이 트렌드는 Apple Silicon(M1·M2·M3)과 같은 흐름이고, 향후 클라우드 컴퓨트의 기본값이 ARM으로 바뀌어갈 가능성이 높다.

## 세 가지 할인 레버를 조합한 패턴

Fargate Spot(70%) + Compute SP(66%) + Graviton(20%)는 각각 다른 축의 할인이라 조합하면 누적 효과가 매우 크다. 다만 곱연산은 아니고 가법 효과에 가깝다.

**시나리오: 백오피스 API 1년 운영, 평균 5 Task × 1 vCPU × 2GB 메모리**

| 구성 | 단가 (월) | 비고 |
|------|----------|------|
| Baseline: x86 Fargate On-Demand 100% | ~$200 | 기준 |
| + Graviton ARM | ~$160 | -20% |
| + Compute SP 1년 약정 | ~$108 | -32% (SP 할인) |
| + Capacity Provider base=2 + Spot 80% | ~$60 | Spot 부분 추가 절감 |
| 합계 절감 | **~70%** | |

여기서 흥미로운 점은 Spot과 SP는 **상호 보완적**이라는 사실이다. Spot은 회수 위험이 있고 SP는 약정 부담이 있는데, 둘을 혼합하면 안정 부분(SP + On-Demand)과 가변 부분(Spot)이 자연스럽게 갈린다.

> 🎯 **시나리오**: "한 SaaS가 ECS Fargate로 백오피스 API를 운영하는데, 평균 트래픽은 5 Task로 충분하지만 마케팅 캠페인 때 일시 30 Task까지 폭증한다. 1년 약정 가능, 회수 허용 가능. 어떤 구성이 비용 최적인가?" — 답은 **Compute SP 5 Task 약정 + Capacity Provider(base=2 On-Demand + Spot 80%)**. 평균 5 Task의 baseline을 SP로 묶고, 그 위 트래픽은 Spot으로 처리. base=2로 회수 시 가용성 최소 보장. 약정 한도 안의 자원은 SP 할인, 한도 밖은 Spot 할인. 두 레버가 자연스럽게 갈린다.

## Image Pull과 콜드 스타트 — SOCI라는 새 옵션

Fargate의 콜드 스타트가 30~60초나 걸리는 가장 큰 원인은 **이미지 Pull**이다. 노드 캐시가 없어서 매번 ECR에서 전체 이미지를 받아 압축 해제한다. 2GB 이미지면 네트워크 + 압축 해제 모두 시간이 든다.

해결책 세 가지가 있다.

**1. 이미지 자체를 줄이기.** Distroless·Alpine·multi-stage build로 200MB 이하로 만든다. 가장 효과 큼.

**2. ECR Pull Through Cache.** Docker Hub·quay.io 이미지를 ECR로 캐시. 외부 네트워크 비용·실패 위험을 줄인다.

**3. SOCI (Seekable OCI).** 이미지를 lazy 로딩한다. 컨테이너가 실제로 읽는 파일만 네트워크로 가져오고, 나머지는 백그라운드에서 받는다. 큰 머신러닝 이미지(8GB+)에서 시작 시간을 50~80% 줄일 수 있다.

```
[전통적 Pull]
ECR ────[전체 2GB]────► Task 압축해제 30초 ► 실행

[SOCI lazy]
ECR ────[manifest + index]────► Task 즉시 실행
       │                          │
       └─[필요한 파일만 페치]──────┘ 백그라운드
                              (보통 200~500MB만 실제 사용)
```

SOCI는 ECR이 별도 인덱스를 미리 만들어두는 방식이라 사용자 측 변경이 거의 없다. Fargate Task Definition에서 자동 적용된다.

> 🔍 **더 깊이**: SOCI의 lazy loading 발상은 **demand paging**(OS 가상 메모리)에서 왔다. OS는 프로세스 메모리 전체를 한 번에 로드하지 않고 페이지 폴트가 날 때만 가져온다. 컨테이너 이미지의 파일 시스템도 마찬가지로 실제 읽히는 파일이 전체의 일부일 뿐이라는 관찰에서 출발했다. 학술적으로는 ATC 2016의 "Slacker: Fast Distribution with Lazy Docker Containers" 논문이 같은 발상을 먼저 제안했고, SOCI는 이걸 OCI 표준 위에 구현한 셈이다.

> ⚠️ **함정**: SOCI는 큰 이미지일수록 효과가 크고, 작은 이미지(100MB 이하)에서는 인덱스 오버헤드가 더 크다. "모든 이미지에 SOCI를 켜라"는 보기는 오답이다. 작은 이미지는 그냥 받는 게 빠르다.

## Lambda vs Fargate vs EC2의 비용 분기점

같은 워크로드를 세 가지 컴퓨트 옵션 중 어디에 두느냐는 SAP 단골 시나리오다. 분기점은 워크로드의 **수명**, **빈도**, **자원 크기** 세 축으로 결정된다.

| 워크로드 | Lambda | Fargate | EC2 |
|---------|--------|---------|-----|
| 100ms × 1만 회/일 (짧고 빈번) | ⭐ 최적 | 비싸짐 | 가장 비쌈 |
| 5분 × 100회/일 (중간) | 한도 가까움 | ⭐ 최적 | 인스턴스 띄우면 유휴 큼 |
| 24/7 × 4 Task (장시간 일정) | 부적합 | 비쌈 | ⭐ 최적 (RI/SP) |
| GPU 추론 | 미지원 | 제한적 | ⭐ G/P 시리즈 |
| 가변 트래픽 + spiky | 좋음 | ⭐ Capacity Provider | 오버 프로비저닝 |

**경험적 분기점**:
- 평균 노드 사용률 40% 이상 + 24/7 일정 = EC2 + Compute SP
- 가변 + Spiky + 5분 이상 = Fargate
- 100ms~5분 이벤트 처리 = Lambda (단, 메모리 10GB 이하)

Lambda는 2020년부터 메모리 10GB · 6 vCPU · 15분 실행이 가능해져 일부 Fargate 워크로드를 대체 가능해졌다. 그래도 백오피스 API처럼 connection pool을 유지해야 하는 패턴은 여전히 Fargate가 유리하다.

> 📚 **사례**: 2023년 한 로그 분석 회사가 batch 잡 일부를 Fargate에서 Lambda로 옮긴 사례. 처리 시간 평균 3분, 호출 빈도 시간당 200회, 메모리 4GB. Fargate에서는 평균 2개 Task가 항상 떠 있어 유휴 비용이 컸지만, Lambda는 실행 시간만 청구되어 월 비용이 약 60% 줄었다. 다만 Lambda 콜드 스타트(VPC 연결 시 1~2초)를 받아들일 수 있어야 했다.

## Application Auto Scaling — Fargate의 자동 스케일링 표준

ECS Service의 Task 수는 **Application Auto Scaling**으로 조정한다. EC2 ASG와 별개 서비스로, ECS·DynamoDB·Aurora·SageMaker 등 다양한 리소스의 스케일러로 쓰인다.

세 가지 정책:
- **Target Tracking**: "CPU 평균 60% 유지" 같은 목표값. 가장 흔함.
- **Step Scaling**: "CPU >70%면 +2, >85%면 +5" 같은 단계.
- **Scheduled**: "매일 9시에 min=10, 22시에 min=2" 같은 시간 기반.

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/prod/myapp \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 50

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/prod/myapp \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-target \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 60.0,
    "PredefinedMetricSpecification":
      {"PredefinedMetricType":"ECSServiceAverageCPUUtilization"}
  }'
```

Target Tracking은 내부적으로 CloudWatch 알람을 자동 생성해 desired count를 조정한다. 동작 원리는 PID controller에 가깝지만 AWS 측 구현은 단순한 비례 제어다. 빠르게 늘리고 느리게 줄이는 패턴이 기본값이라 트래픽 변동에 안정적이다.

> 💡 **관련 이론**: Auto Scaling의 동작은 **제어 이론(control theory)**의 응용이다. 측정값(CPU%)과 목표값(60%)의 차이(error)를 보고 액추에이터(Task count)를 조정한다. 정확한 PID 제어는 적분·미분 항까지 쓰지만 AWS의 Target Tracking은 단순 P 제어에 가깝다. 단순한 만큼 oscillation(진동) 위험이 있어서, scale-in cooldown을 길게 잡는 게 표준이다. Netflix는 이 한계 때문에 **Scryer**라는 predictive auto-scaler를 만들어 트래픽 패턴을 ML로 예측한다.

## 정리하며

Fargate는 단가표 위 숫자만으로 비싸 보이지만, Fargate Spot(70%) + Compute SP(66%) + Graviton(20%)을 조합하면 같은 워크로드를 70% 가까이 싸게 돌릴 수 있다. 단가 비교에서 가장 중요한 변수는 **평균 노드 사용률**과 **트래픽 가변성**이다. 사용률 40% 이상으로 일정 24/7이면 EC2 + SP가 우위고, 그 외엔 Fargate가 운영 부담까지 포함해 우위다.

내일은 서비스 메시·서비스 디스커버리를 본다. ECS Service Connect·AWS Cloud Map·App Mesh의 차이가 무엇이고, mTLS·카나리·서킷 브레이커 같은 메시 기능이 어떻게 구현되는지를 다룬다. Fargate 위에 마이크로서비스 10개를 띄우면 그들 간 통신을 어떻게 안전·관찰 가능하게 만드는가의 이야기다.

---

## 📝 연습 문제

**문제 1.** 한 SaaS가 ECS Fargate로 백오피스 API를 운영한다. 평균 트래픽은 5 Task로 충분하지만 마케팅 캠페인 때 30 Task까지 폭증한다. 1년 약정 가능, 일부 회수 허용. 비용 최적 구성은?

A) FARGATE On-Demand 100%, EC2 Instance Savings Plans
B) FARGATE_SPOT 100%
C) Compute Savings Plans 5 Task 약정 + Capacity Provider(base=2 FARGATE + FARGATE_SPOT 80%)
D) EC2 Launch Type + Reserved Instance

**정답: C**
해설: 두 가지 트래픽 특성(안정 5 Task baseline + 가변 spike)을 두 가지 할인 레버로 매칭하는 게 핵심. SP로 baseline의 안정 부분을 묶어 약정 할인, 그 위 가변 부분은 Spot으로 처리. base=2 On-Demand로 Spot 회수 시 최소 가용성 보장. A는 EC2 SP가 Fargate에 적용 안 됨. B는 모든 Task가 Spot이라 동시 회수 위험. D는 가변 spike에 EC2 RI가 비효율. 함정: "Spot과 SP를 같이 쓰면 안 된다"는 오해. 둘은 다른 자원에 적용되므로 자연스럽게 공존한다.

---

**문제 2.** Fargate Task Definition에 cpu=512(0.5 vCPU), memory=8192(8GB)를 설정하니 등록 실패. 원인은?

A) 메모리는 8192 대신 8GB로 입력해야 함
B) 0.5 vCPU에 허용되는 메모리는 최대 4GB
C) Fargate는 8GB 이상 메모리 미지원
D) Task Role 미설정

**정답: B**
해설: Fargate vCPU·메모리 조합 매트릭스에서 0.5 vCPU는 1~4GB까지만 허용된다. 8GB가 필요하면 vCPU도 1로 올려야 한다(1 vCPU + 2~8GB). 이 매트릭스가 정해진 이유는 Fargate 내부적으로 EC2 family의 vCPU-메모리 비율(1:2, 1:4, 1:8)을 그대로 노출하기 때문. A는 단위 표기 차이로 등록 실패와 무관. C는 16GB까지 가능하므로 오답. D는 Task Definition 등록과 무관. 함정: 메모리만 늘리려고 vCPU를 그대로 두는 오답 패턴.

---

**문제 3.** Fargate 콜드 스타트가 평균 60초나 걸린다. 이미지 크기는 4GB이고, 머신러닝 추론용이다. 시작 시간을 가장 효과적으로 줄이는 방법은?

A) ECS Service의 desired count를 미리 늘려두기
B) SOCI(Seekable OCI) 인덱스 생성 후 Fargate에서 lazy 로딩 활용
C) ECR Replication으로 다른 리전에 복제
D) Compute Savings Plans 적용

**정답: B**
해설: SOCI는 큰 이미지의 lazy loading을 표준화한 OCI 확장이다. 컨테이너가 실제 읽는 파일만 네트워크로 가져오고 나머지는 백그라운드에서 받아 시작 시간을 50~80% 줄인다. 4GB 머신러닝 이미지는 SOCI의 효과가 가장 큰 사례. A는 콜드 스타트 자체를 해결하지 못함(워밍업이지 콜드 회피가 아님). C는 같은 리전 내 Pull 속도와 무관. D는 비용 할인이지 시간 단축 아님. 함정: "이미지 크기 자체를 줄여라"는 정답이긴 하지만 머신러닝 모델·라이브러리는 줄이기 어려운 경우가 많아 SOCI가 더 현실적.

---

**문제 4.** 한 회사가 EC2와 Fargate를 동시에 쓴다. 1년 약정 할인을 받되 EC2와 Fargate에 모두 적용되어야 하고, 마이그레이션 중 워크로드를 EC2에서 Fargate로 이동해도 할인이 유지되어야 한다. 어떤 약정을 쓰는가?

A) EC2 Instance Savings Plans
B) Compute Savings Plans
C) Standard Reserved Instance
D) Convertible Reserved Instance

**정답: B**
해설: Compute SP만 EC2 + Fargate + Lambda에 동시 적용되고, 마이그레이션 중에도 약정 한도 안에서 자동으로 따라간다. A는 EC2 family·region 고정이라 Fargate 적용 불가. C·D는 RI로 EC2 전용이며 캐퍼시티 보장 vs 청구 할인 모델이 SP와 다르다. 추가: Compute SP의 할인율은 EC2 Instance SP보다 약간 낮지만 유연성 prêmium이다. 추가 학습 포인트: SP는 자동 적용이라 별도 인스턴스 지정·수정이 필요 없다.

---

**문제 5.** 머신러닝 추론 워크로드. 평균 100ms 처리, 시간당 5만 회 호출, 메모리 3GB. 가장 비용 효율적인 컴퓨트는?

A) Lambda
B) Fargate On-Demand
C) Fargate Spot
D) EC2 + Reserved Instance

**정답: A**
해설: 1ms 단위 청구의 Lambda가 짧고 빈번한 호출에 가장 효율적. 100ms × 5만 = 5,000초/시간 = 1.4시간 분량만 청구. Fargate(B, C)는 최소 1분 청구 + 미사용 시간도 Task가 떠 있으면 비용 발생. EC2(D)는 인스턴스 1대 24시간 = 24시간 청구로 가장 비쌈. 함정: 메모리 3GB가 Lambda 한도(10GB) 안. 한도 초과나 cold start 민감 워크로드면 Fargate가 답이 된다. 추가: Lambda는 Provisioned Concurrency로 cold start도 거의 제거 가능.

---

**문제 6.** Fargate Spot Task가 SIGTERM을 받았다. 2분 안에 graceful shutdown을 보장하기 위한 표준 패턴은?

A) `stopTimeout`을 기본값 30초로 두고 SIGTERM은 무시
B) `stopTimeout`을 120초로 늘리고 애플리케이션에 SIGTERM 핸들러 구현 (in-flight 요청 마무리, ALB deregister, 큐 visibility 해제)
C) 애플리케이션을 그대로 두고 ALB Health Check만 짧게 설정
D) Fargate Spot 대신 Lambda로 대체

**정답: B**
해설: 표준 패턴은 두 가지 동시 구성. `stopTimeout`(기본 30초, 최대 120초)을 늘려 ECS가 SIGKILL까지 충분히 대기하고, 애플리케이션 코드는 SIGTERM 핸들러로 ① 새 요청 수신 거부 ② in-flight 응답 완료 ③ ALB Target Group deregistration ④ SQS message visibility timeout 해제 ⑤ DB connection close를 순서대로 처리. A는 graceful shutdown 자체를 안 함. C는 ALB만으로 in-flight 요청을 보장 못 함. D는 워크로드 자체 교체로 과한 대응. Pinterest 사례와 동일 패턴.

---

**문제 7.** Fargate Task가 평균 노드 사용률 60%로 24/7 운영된다. 평균 8 Task가 항상 떠 있다. 1년 약정 가능. 비용 면에서 가장 유리한 선택은?

A) Fargate On-Demand + Compute SP 1년
B) Fargate Spot 100%
C) EC2 Launch Type + Compute SP 1년 + Bin Packing
D) Lambda 변환

**정답: C**
해설: 평균 사용률 60% + 24/7 + 일정 부하는 EC2의 영역이다. EC2는 Bin Packing으로 여러 Task를 한 노드에 채워 단가가 분산되고, Compute SP로 1년 약정 할인까지 받는다. A는 Fargate가 EC2보다 vCPU당 약 2배 비싸므로 같은 SP 적용이라도 EC2가 유리. B는 24/7 안정 부하에 Spot 회수 위험. D는 24/7 + 8 Task = Lambda로 변환 시 호출 빈도가 낮아 효율 떨어짐. 함정: 단가표만 보고 "Fargate + SP가 좋다" 고르지 말 것. 24/7 + 사용률 높음 = EC2 우위.

---

## 📌 오늘의 요약

1. **Fargate 과금 = vCPU·시간 + 메모리·시간**, 초 단위 1분 최소, **이미지 Pull 시간도 과금**
2. **vCPU·메모리 매트릭스**: 0.5 vCPU = 1~4GB, 1 vCPU = 2~8GB 등 EC2 family 비율 그대로
3. **Fargate Spot 70% 할인** + 2분 SIGTERM, base=2 + Spot 80% Capacity Provider 표준 패턴
4. **Compute Savings Plans만 Fargate·EC2·Lambda 모두 적용**, EC2 Instance SP는 EC2 전용
5. **Graviton ARM64로 추가 20% 절감**, multi-arch 이미지 빌드 전제
6. **SOCI lazy loading**으로 큰 이미지 콜드 스타트 50~80% 단축
7. **사용률 40%↑ + 24/7 = EC2 + SP**, 그 외 가변/spiky = Fargate, 짧고 빈번 = Lambda
