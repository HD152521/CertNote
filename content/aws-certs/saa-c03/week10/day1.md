# Day 46 - 컴퓨팅 비용은 왜 약정·시장·소유권 세 축으로 갈라졌나

클라우드의 가장 큰 약속은 "쓴 만큼만 낸다"였다. 그런데 막상 운영해보면 On-Demand로만 돌린 청구서는 온프레미스 서버를 사는 것보다 비싸지는 역설이 생긴다. 24시간 켜둘 게 뻔한 데이터베이스 서버에 "필요할 때 즉시 빌리는" 프리미엄을 매달 내고 있기 때문이다. AWS의 컴퓨팅 할인 체계 — Reserved Instance, Savings Plans, Spot — 는 이 역설을 푸는 장치이고, 그 뿌리에는 **AWS가 데이터센터를 운영하며 떠안는 두 가지 리스크를 고객에게 떠넘기는 대신 할인을 주는** 경제 모델이 있다. 첫째는 수요 예측 리스크다. AWS는 미래 수요를 예측해 서버를 미리 사둬야 하는데, 고객이 "3년간 이만큼 쓰겠다"고 약정하면 AWS의 예측 부담이 줄고 그 대가로 할인을 준다. 둘째는 유휴 용량 리스크다. AWS 데이터센터에는 항상 팔리지 않은 여유 용량이 있고, 이걸 "언제든 회수할 수 있다"는 조건으로 헐값에 푸는 게 Spot이다.

이 글은 비용 옵션을 표로 나열하는 대신, "왜 Savings Plans가 RI를 대체하게 됐는지", "Spot 인스턴스가 어떻게 2분 만에 회수되는지 그 내부 신호 흐름", "Graviton이 어떻게 동일 성능에 40% 싼 가격을 만드는지"를 따라가며 SAA 비용 도메인(전체 20%)이 묻는 본질을 짚는다. 비용 문제는 암기처럼 보이지만 실제로는 "이 워크로드의 안정성·내결함성·약정 가능성"이라는 아키텍처 속성을 비용 모델에 매핑하는 설계 문제다.

## RI는 왜 Savings Plans에게 자리를 내줬나

Reserved Instance는 2009년에 나왔다. 당시 모델은 단순했다 — "특정 리전의 특정 인스턴스 타입(예: us-east-1의 m4.large)을 1년 또는 3년 쓰겠다고 약정하면 할인"이었다. 문제는 이 약정이 **인스턴스 타입에 못박혀 있었다**는 것이다. m4를 약정했는데 1년 뒤 m5가 나오면, 더 빠르고 싼 신세대로 옮기는 순간 약정이 무용지물이 됐다. 클라우드의 핵심 가치인 "유연성"과 RI의 "경직된 약정"이 정면으로 충돌한 것이다.

AWS는 이걸 두 단계로 완화했다. 먼저 **Convertible RI**(2016)를 내놨다 — 다른 RI로 교환 가능하되 동일 또는 상위 가치로만, 할인율은 낮게(~54%). 그래도 여전히 "RI라는 객체를 교환하는" 번거로움이 남았다. 그래서 2019년 **Savings Plans**가 나왔는데, 발상을 완전히 뒤집었다. SP는 "특정 인스턴스를 약정"하는 게 아니라 **"시간당 $X를 1년/3년간 컴퓨팅에 쓰겠다"는 금액 약정**이다. 약정한 $/hr 한도 안에서라면 어떤 인스턴스 타입을 쓰든, 어떤 리전이든, EC2든 Fargate든 Lambda든 자동으로 할인이 적용된다. 인스턴스라는 객체에서 "지출 흐름"으로 약정 단위를 옮긴 것이다.

> 💡 **관련 이론**: 이건 금융의 선도계약(forward contract)과 같은 구조다. 고객은 미래의 컴퓨팅 가격을 지금 고정(lock-in)하는 대가로 현물(On-Demand) 대비 할인을 받는다. AWS 입장에서 SP는 "예측 가능한 수익 흐름"을 확보하는 헤징 도구다. RI가 "특정 상품의 선물"이라면 SP는 "지출 총액의 선물"이라 훨씬 유연하다. 항공사가 연료를 헤징할 때 특정 유종이 아니라 "연료비 총액"을 헤징하는 게 더 유연한 것과 같은 원리다.

Savings Plans에는 두 종류가 있고 이 차이가 시험 단골이다. **Compute Savings Plan**은 최대 유연성(~66% 할인) — 인스턴스 패밀리·리전·OS·Tenancy를 모두 자유롭게 바꿔도 할인이 따라온다. 심지어 Fargate와 Lambda까지 커버한다. **EC2 Instance Savings Plan**은 특정 패밀리(예: m5)와 리전에 고정하는 대신 더 높은 할인(~72%)을 준다 — 패밀리 안에서 크기(large↔xlarge)와 OS는 자유롭다. 즉 "유연성을 포기한 만큼 더 깎아준다"는 교환이다.

> ⚠️ **함정**: RI/RDS의 관계를 정확히 알아야 한다. RDS·Redshift·ElastiCache·OpenSearch는 **Savings Plans가 적용되지 않는다** — 이 서비스들은 여전히 Reserved Instance로만 약정한다. 그래서 "RDS 비용을 1년 약정으로 줄여라"의 정답은 SP가 아니라 RI다. SP는 EC2/Fargate/Lambda라는 "컴퓨팅 실행 계층"만 커버하고, 매니지드 DB의 예약은 별도 RI 체계로 남아 있다. 신규 EC2 컴퓨팅은 거의 SP가 정답이지만 "RDS"라는 단어가 보이면 반사적으로 RI를 떠올려야 한다.

할인 적용 순서도 알아두면 좋다. AWS 빌링 엔진은 매시간 사용량에 할인을 적용할 때 **RI → EC2 Instance SP → Compute SP → On-Demand** 순으로 가장 구체적인 약정부터 소진시킨다. 구체적인 약정일수록 적용 범위가 좁아 "낭비될 위험"이 크므로 먼저 채우는 것이다. 이 우선순위 때문에 RI와 SP를 섞어 보유하면 RI가 먼저 소진되고 남은 사용량을 SP가 받는다.

## Spot 인스턴스가 2분 만에 회수되는 내부 메커니즘

Spot 인스턴스는 최대 90% 할인이라는 파격적인 가격을 제시하지만, 그 대가로 AWS가 **언제든 2분 예고 후 회수**할 수 있다. 이 "2분"이라는 숫자와 회수 신호의 흐름을 이해하면 Spot 설계의 본질이 보인다.

Spot의 가격은 옛날엔 경매식 입찰이었지만, 2017년부터 AWS는 모델을 바꿨다 — 이제 Spot 가격은 **각 인스턴스 타입·AZ별 장기 수요·공급에 따라 완만하게 움직이는 시장 가격**이고, 고객은 입찰가가 아니라 "On-Demand 대비 최대 얼마까지 낼 의향"만 설정한다. 회수가 일어나는 진짜 이유는 가격이 입찰가를 넘어서가 아니라, **On-Demand 수요가 늘어 AWS가 그 용량을 정가 고객에게 돌려줘야 할 때**다. 즉 Spot은 "AWS의 유휴 용량을 빌려 쓰는 것"이고, 주인이 돌아오면 비워줘야 한다.

회수 신호의 흐름은 이렇다. AWS가 특정 용량을 회수하기로 결정하면, **EC2 인스턴스 메타데이터 서비스(IMDS, 169.254.169.254)**의 특정 경로(`/latest/meta-data/spot/instance-action`)에 회수 시각이 찍힌다. 인스턴스 내부 애플리케이션이나 EventBridge가 이 신호를 감지해 2분 안에 우아하게 종료(graceful shutdown) — 진행 중인 작업을 체크포인트로 저장하거나, 로드밸런서에서 자신을 빼거나, 다른 노드에 작업을 넘긴다. 이 2분이라는 시간은 "상태를 안전하게 비울 수 있는 최소 시간"으로 설계됐고, 그래서 Spot은 **상태를 잃어도 되거나 체크포인트로 복구 가능한 워크로드**에만 맞는다.

> 🔍 **더 깊이**: Spot 인터럽션을 줄이는 핵심 전략은 **다양화(diversification)**다. EC2 Fleet이나 Spot Fleet에 여러 인스턴스 타입·여러 AZ를 등록하면, 한 타입의 용량이 회수돼도 다른 타입으로 빠르게 대체된다. AWS는 여기에 **Capacity-Optimized 할당 전략**을 제공하는데, 단순히 가장 싼 풀이 아니라 "지금 회수될 확률이 가장 낮은 용량 풀"을 골라 인터럽션 자체를 최소화한다. 가격 우선(lowest-price)으로 고르면 그 풀에 수요가 몰려 회수가 잦아지는 역설이 생기므로, 프로덕션 Spot은 보통 capacity-optimized를 쓴다. 또 **Capacity Rebalancing**을 켜면 회수 임박 신호(rebalance recommendation)가 2분 알림보다 먼저 와서, 회수되기 전에 미리 새 인스턴스를 띄워 작업을 옮길 시간을 번다.

> 📚 **사례**: 2019년 Lyft는 머신러닝 학습과 데이터 처리 워크로드를 대규모 Spot으로 옮겨 컴퓨팅 비용을 크게 절감했다고 공개했다. 핵심은 "인터럽션을 예외가 아니라 정상 상태로 가정하고 설계"한 것이다 — 학습 작업을 체크포인트 단위로 쪼개 회수돼도 마지막 체크포인트부터 재개하게 만들었다. 반대로 Spot 인터럽션을 무시한 채 stateful 워크로드(예: 세션을 메모리에 들고 있는 웹서버)를 Spot에 올렸다가 회수 때마다 사용자 세션이 날아가는 사고는 흔한 안티패턴이다. Spot은 "싸니까 쓰는 것"이 아니라 "내결함성을 갖춘 아키텍처에 대한 보상"으로 봐야 한다.

ASG와 Spot을 결합하는 **Mixed Instances Policy**는 이 모든 걸 한데 묶는 프로덕션 표준이다. 하나의 Auto Scaling Group 안에 "On-Demand 베이스라인 + Spot 변동분"을 비율로 섞고, Spot은 여러 타입으로 다양화하며, 회수되면 ASG가 자동으로 다른 타입의 Spot이나 On-Demand로 채운다. "안정성은 On-Demand/SP로, 비용은 Spot으로"라는 두 목표를 한 ASG가 동시에 달성한다.

## Graviton은 어떻게 동일 성능에 40% 싼 가격을 만드나

Graviton은 AWS가 직접 설계한 ARM 기반 프로세서다. Intel/AMD의 x86 대신 ARM 아키텍처를 쓰는데, 같은 성능 등급에서 최대 40% 더 나은 가격 대비 성능을 제공한다. 이게 어떻게 가능한지는 CPU 아키텍처의 근본 차이에서 나온다.

x86은 CISC(Complex Instruction Set Computing) 계열로, 복잡한 명령어를 하나의 instruction으로 처리하도록 수십 년간 누적된 레거시를 안고 있다. ARM은 RISC(Reduced Instruction Set Computing) 계열로, 단순한 명령어 집합을 빠르게 반복 실행하는 데 최적화돼 있다. RISC의 단순함은 **트랜지스터당 전력 효율**로 이어진다 — 모바일 기기(스마트폰)가 전부 ARM인 이유가 이것이다. 데이터센터에서 전력은 곧 운영비이므로, 전력당 성능이 좋으면 같은 작업을 더 싸게 처리한다. 게다가 AWS는 Graviton을 **직접 설계**하므로 Intel/AMD에 지불하던 마진이 사라지고, 자사 워크로드(Lambda·Fargate·관리형 서비스)에 맞춰 칩을 최적화할 수 있다.

> 💡 **관련 이론**: 이건 수직 통합(vertical integration)의 전형이다. Apple이 M 시리즈 칩을 직접 만들어 인텔 의존을 끊고 전력·성능·비용을 동시에 잡은 것과 같은 전략이다. 클라우드 공급자가 칩까지 내려가 통제하면, 추상화 계층(인스턴스 가격)에서 경쟁사가 따라오기 어려운 비용 우위를 만든다. Google의 TPU, Microsoft의 Cobalt도 같은 흐름이다 — 하이퍼스케일러가 실리콘을 내재화하는 거대한 산업 추세의 일부다.

Graviton의 현실적 제약은 **아키텍처 호환성**이다. x86으로 컴파일된 바이너리는 ARM에서 그대로 돌지 않으므로, 애플리케이션을 ARM용으로 재컴파일하거나 멀티아키텍처 컨테이너 이미지를 빌드해야 한다. 다행히 인터프리터/JIT 기반 언어(Java, Python, Node.js, Go, .NET)는 런타임만 ARM 버전이면 코드 변경 없이 잘 동작하고, 컨테이너 환경(EKS/ECS)에서는 멀티아키텍처 이미지로 매끄럽게 전환된다. 그래서 시험에서 "비용을 낮추되 코드 변경 최소화"라는 조건과 Graviton이 함께 나오면, 관리형 서비스나 컨테이너·인터프리터 언어 워크로드라는 신호를 같이 봐야 한다.

> ⚠️ **함정**: Graviton은 "마법의 무료 할인"이 아니다. 네이티브 컴파일 언어(C/C++/Rust)로 작성된 레거시 바이너리나, x86 전용 라이브러리·드라이버에 의존하는 워크로드는 이식 비용이 들거나 아예 불가능할 수 있다. SAA 시험은 보통 "호환성이 좋은 워크로드"를 전제로 Graviton을 정답으로 내지만, 실무에서는 이식 가능성부터 검증해야 한다.

## Right-sizing과 Compute Optimizer: 가장 큰 낭비는 과대 프로비저닝

비용 옵션을 아무리 잘 골라도, 애초에 필요보다 큰 인스턴스를 쓰고 있으면 모든 할인이 무의미하다. 클라우드 낭비의 가장 흔한 형태는 **과대 프로비저닝(over-provisioning)** — "혹시 모르니까" m5.4xlarge를 띄웠는데 실제 CPU는 5%만 쓰는 경우다. 온프레미스 시절엔 서버를 한번 사면 바꾸기 어려워 넉넉하게 사는 게 합리적이었지만, 클라우드에서는 그 습관이 그대로 낭비가 된다.

**Compute Optimizer**는 이걸 ML로 푼다. 과거 14일치 CloudWatch 메트릭(CPU·메모리·네트워크·디스크)을 학습해 "이 인스턴스는 m5.4xlarge가 아니라 m5.xlarge로 충분하다, 그러면 월 $X 절감"이라는 식의 구체적 권장을 낸다. EC2뿐 아니라 EBS 볼륨, Lambda 메모리 설정, ASG, ECS on Fargate까지 커버한다. 여기서 핵심은 **메모리 메트릭**인데, 앞서 Day 41에서 봤듯이 EC2 메모리는 하이퍼바이저가 못 보는 게스트 OS 내부 정보라 CloudWatch Agent가 있어야 수집된다 — Agent를 깔아 메모리 데이터를 주면 Compute Optimizer의 권장 정확도가 크게 올라간다.

> 🔍 **더 깊이**: Compute Optimizer와 Trusted Advisor의 역할 분담을 구분해야 한다. **Trusted Advisor**는 규칙 기반으로 "유휴 EIP, 미연결 EBS, 저활용 EC2(CPU 10% 미만 등)" 같은 명백한 낭비를 단순 임계값으로 잡는다. **Compute Optimizer**는 ML 기반으로 "이 워크로드 패턴에는 정확히 어떤 타입·크기가 최적인가"라는 right-sizing 권장을 낸다. 둘은 보완 관계다 — TA로 명백한 쓰레기를 치우고, Compute Optimizer로 남은 것의 크기를 정밀 조정한다. 시험에서 "ML 기반 right-sizing 추천"이면 Compute Optimizer, "사용 안 하는 리소스 식별"이면 Trusted Advisor가 신호다.

이 모든 것을 종합한 프로덕션 비용 구조는 계층적이다. **24/7 안정 베이스라인은 Compute SP(또는 EC2 SP) 3년으로 가장 깊게 할인**받고, **예측 가능한 변동분은 SP 1년**으로 덮고, **내결함성 있는 배치·실험은 Spot**으로 90% 절감하고, **예측 불가능한 짧은 스파이크만 On-Demand**로 받는다. 여기에 Graviton으로 단가를 한 번 더 낮추고, Compute Optimizer로 각 계층의 크기를 정밀화한다. 비용 최적화는 단일 선택이 아니라 워크로드를 안정성·내결함성·예측가능성으로 분해해 각각에 맞는 가격 모델을 입히는 포트폴리오 설계다.

## 다른 클라우드와의 비교

AWS의 약정 모델을 상대화하면 설계 선택이 또렷해진다.

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| 약정 할인 | Savings Plans(금액 약정), Reserved Instances | Reserved VM Instances, Savings Plans for compute | Committed Use Discounts(CUD) |
| 자동 지속 할인 | 없음(약정 필요) | 없음 | **Sustained Use Discount** — 약정 없이 오래 쓰면 자동 할인 |
| 스팟형 | Spot Instances(2분 예고) | Spot VMs | Spot VMs / Preemptible(과거 24h 상한) |
| 자체 칩 | Graviton(ARM) | Cobalt(ARM, 신규) | Tau(ARM), TPU |

GCP의 **Sustained Use Discount**가 특히 대조적이다 — 약정 없이도 한 달 내 오래 켜둘수록 자동으로 할인이 깊어진다. AWS는 이런 자동 할인이 없고 명시적 약정(SP/RI)을 요구하는 대신, 약정 시 할인 폭이 더 크고 Lambda·Fargate까지 한 약정으로 덮는 범위가 넓다. "약정의 번거로움 vs 할인 폭"의 트레이드오프를 각 클라우드가 다르게 선택한 것이다.

> 📚 **사례**: 2018년 무렵 많은 기업이 클라우드 비용 폭증을 겪으며 **FinOps**라는 운영 방법론이 부상했다. Adobe·Spotify 같은 회사들이 "엔지니어가 비용을 무시하고 리소스를 띄우는" 문화를 비용 가시화·책임·자동화로 바꾼 사례를 공유하면서 FinOps Foundation이 만들어졌다. 핵심 교훈은 "비용은 인프라팀만의 일이 아니라 리소스를 만드는 엔지니어 모두의 책임"이라는 것이고, AWS의 SP/Spot/태깅/Budgets는 이 방법론을 구현하는 도구 모음이다. 비용 최적화를 일회성 청소가 아니라 지속적 운영 규율로 보는 관점이 SAA 비용 도메인의 밑바탕이다.

## CLI로 직접 만져보기

```bash
# Savings Plans 구매 추천 (1년, 선결제 없음 기준)
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR --payment-option NO_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS

# Compute Optimizer EC2 right-sizing 권장 (향상된 메트릭 활성)
aws compute-optimizer get-ec2-instance-recommendations \
  --recommendation-preferences EnhancedInfrastructureMetrics=ACTIVE

# Spot 가격 이력 조회 (변동 작은 타입 고르기)
aws ec2 describe-spot-price-history \
  --instance-types m5.large m5a.large m6i.large \
  --product-descriptions "Linux/UNIX" \
  --start-time $(date -u +%Y-%m-%dT%H:%M:%S)

# ASG Mixed Instances (On-Demand 베이스 + Spot 다양화)
aws ec2 create-launch-template --launch-template-name mixed-base \
  --launch-template-data '{"ImageId":"ami-0abc","InstanceType":"m5.large"}'
# (ASG의 MixedInstancesPolicy로 On-Demand 비율, Spot 타입 목록,
#  capacity-optimized 할당 전략을 지정)

# Spot 회수 신호 감지 (인스턴스 내부에서 IMDS 폴링)
curl -s http://169.254.169.254/latest/meta-data/spot/instance-action
# → 회수 예정이면 {"action":"terminate","time":"2026-06-02T10:00:00Z"} 반환
```

## 정리하며

EC2 컴퓨팅 비용 최적화는 약정·시장·소유권·크기의 네 축으로 정리된다. ① **Savings Plans**는 "인스턴스가 아니라 시간당 지출"을 약정하는 선도계약형 할인이고, Compute SP(최대 유연·~66%)와 EC2 SP(패밀리 고정·~72%)로 나뉘며, RDS·Redshift·ElastiCache는 여전히 RI다. ② **Spot**은 AWS 유휴 용량을 90% 싸게 빌리되 2분 예고로 회수되며, IMDS 신호 감지·다양화·capacity-optimized 할당·Capacity Rebalancing으로 인터럽션을 길들이고, 내결함성 워크로드에만 쓴다. ③ **Graviton**은 ARM/RISC의 전력 효율과 AWS 수직 통합으로 40% 가성비를 내되 아키텍처 호환성을 확인해야 한다. ④ **Compute Optimizer**는 ML로 과대 프로비저닝을 잡고, Trusted Advisor의 규칙 기반 낭비 탐지와 보완 관계다. 프로덕션은 이들을 SP 베이스라인 + Spot 변동 + On-Demand 스파이크의 포트폴리오로 결합한다.

다음 글에서는 컴퓨팅에서 스토리지로 넘어가, S3 스토리지 클래스와 Lifecycle·Intelligent-Tiering이 "접근 패턴을 모르는 데이터"의 비용을 어떻게 자동으로 최적화하는지 — 그리고 최소 보관 기간이라는 숨은 함정을 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 24/7로 돌아가는 웹 애플리케이션을 운영하는데, 향후 신세대 인스턴스로 자유롭게 옮기고 OS나 리전도 바꿀 가능성이 있다. 최대한의 비용 할인을 받으면서 이 유연성을 유지하려면?

A) Standard Reserved Instance 3년
B) Compute Savings Plan
C) EC2 Instance Savings Plan
D) Spot Instances

**정답: B**

해설: Compute Savings Plan은 "시간당 $X 지출"을 약정하므로 인스턴스 패밀리·리전·OS·Tenancy를 모두 자유롭게 바꿔도 할인이 따라오고 Fargate·Lambda까지 커버한다(~66%). Standard RI(A)는 특정 타입에 못박혀 신세대 이전 시 약정이 무용지물이 된다. EC2 Instance SP(C)는 할인은 더 깊지만(~72%) 패밀리·리전이 고정돼 "자유로운 이전"이라는 요구에 맞지 않는다. Spot(D)은 24/7 안정 워크로드에 부적합하다 — 언제든 회수될 수 있기 때문이다.

---

**문제 2.** 한 팀이 야간에 도는 머신러닝 학습 배치 작업을 운영한다. 작업은 체크포인트로 중단·재개가 가능하고, 비용을 최대한 낮추는 게 최우선이다. 가장 적합한 옵션은?

A) On-Demand
B) Reserved Instance 3년
C) Spot Instances + Capacity Rebalancing
D) Convertible RI

**정답: C**

해설: 체크포인트로 중단·재개 가능한 내결함성 배치는 Spot의 이상적 사용처로, 최대 90% 할인을 받는다. Capacity Rebalancing을 켜면 회수 임박 신호가 2분 알림보다 먼저 와 작업을 미리 옮길 시간을 번다. On-Demand(A)는 가장 비싸고, RI(B)/Convertible RI(D)는 24/7 안정 워크로드용 약정이라 "야간에만 도는 배치"에는 약정 시간 대부분이 낭비된다. 핵심 신호는 "체크포인트로 중단·재개 가능"이라는 내결함성 언급이다.

---

**문제 3.** 한 회사가 RDS PostgreSQL 인스턴스를 24/7로 운영하며 비용을 1년 약정으로 줄이려 한다. 어떤 옵션을 써야 하는가?

A) Compute Savings Plan
B) EC2 Instance Savings Plan
C) Reserved Instance (RDS)
D) Spot Instances

**정답: C**

해설: Savings Plans는 EC2·Fargate·Lambda라는 컴퓨팅 실행 계층만 커버하며, RDS·Redshift·ElastiCache·OpenSearch는 여전히 Reserved Instance로만 약정한다. 따라서 정답은 RDS RI다. A·B는 SP가 RDS에 적용되지 않으므로 오답이고, D는 RDS가 Spot을 지원하지 않을뿐더러 데이터베이스를 회수 가능한 인스턴스에 올리는 것 자체가 부적절하다. "RDS"라는 단어가 보이면 SP가 아니라 RI를 떠올려야 한다.

---

**문제 4.** 한 팀이 Java와 Node.js 기반 컨테이너 워크로드를 ECS에서 운영 중이며, 코드 변경을 최소화하면서 컴퓨팅 단가를 낮추고 싶다. 가장 적합한 접근은?

A) 인스턴스를 더 큰 타입으로 교체
B) Graviton(ARM) 기반 인스턴스/Fargate로 전환
C) 모든 워크로드를 Lambda로 재작성
D) Dedicated Host로 전환

**정답: B**

해설: Graviton은 ARM/RISC 아키텍처의 전력 효율과 AWS 수직 통합으로 최대 40% 가성비를 제공한다. Java·Node.js 같은 런타임 기반 언어는 ARM 버전 런타임만 쓰면 코드 변경 없이 동작하고, 컨테이너는 멀티아키텍처 이미지로 매끄럽게 전환되므로 "코드 변경 최소화" 조건에 부합한다. A는 비용을 오히려 늘리고, C는 대규모 재작성이라 "최소 변경"에 반하며, D는 라이선스 BYOL 용도이지 비용 절감 수단이 아니다.

---

**문제 5.** 한 회사가 EC2 인스턴스들이 과대 프로비저닝됐는지 의심한다. 과거 사용 패턴을 ML로 분석해 각 인스턴스의 최적 타입·크기를 구체적으로 추천받으려면?

A) Trusted Advisor
B) Compute Optimizer
C) Cost Explorer
D) CloudWatch Alarm

**정답: B**

해설: Compute Optimizer는 과거 CloudWatch 메트릭을 ML로 분석해 인스턴스별 최적 타입·크기와 예상 절감액을 구체적으로 권장한다(EC2·EBS·Lambda·ASG·ECS). Trusted Advisor(A)는 규칙 기반으로 "저활용 EC2" 같은 명백한 낭비만 임계값으로 잡고 정밀 right-sizing은 못 한다 — 둘은 보완 관계다. Cost Explorer(C)는 비용 가시화·예측 도구이고, CloudWatch Alarm(D)은 임계값 알림이지 right-sizing 추천 도구가 아니다. 메모리까지 정확히 보려면 CloudWatch Agent로 메모리 메트릭을 줘야 권장 정확도가 올라간다.

---

**문제 6.** Spot 인스턴스로 프로덕션 워크로드를 운영하는데 잦은 인터럽션으로 가용성이 떨어진다. 인터럽션 자체를 가장 효과적으로 줄이는 할당 전략은?

A) lowest-price 할당으로 가장 싼 풀만 사용
B) capacity-optimized 할당 + 여러 인스턴스 타입/AZ 다양화
C) 단일 인스턴스 타입으로 통일
D) On-Demand 입찰가를 최대로 설정

**정답: B**

해설: capacity-optimized 할당은 "지금 회수될 확률이 가장 낮은 용량 풀"을 골라 인터럽션 자체를 최소화하고, 여러 타입·AZ로 다양화하면 한 풀이 회수돼도 빠르게 대체된다. lowest-price(A)는 가장 싼 풀에 수요가 몰려 오히려 회수가 잦아지는 역설을 부른다. 단일 타입(C)은 다양화의 반대로 회수 시 대체 풀이 없어 위험하다. D는 현재 Spot이 입찰가 경매가 아니므로 회수 빈도와 무관하다 — 회수는 가격이 아니라 On-Demand 수요 회복으로 일어난다.

---

**문제 7.** 한 아키텍트가 안정적 베이스라인 트래픽과 예측 불가능한 스파이크가 섞인 워크로드의 비용을 최적화하려 한다. 가장 적절한 결합 전략은?

A) 전부 On-Demand로 통일
B) 전부 3년 RI로 약정
C) 베이스라인은 Savings Plan, 변동·스파이크는 On-Demand(+내결함 부분은 Spot)를 혼합
D) 전부 Spot으로 운영

**정답: C**

해설: 비용 최적화는 워크로드를 안정성·예측가능성으로 분해해 각각에 맞는 가격 모델을 입히는 포트폴리오 설계다. 24/7 베이스라인은 SP로 깊게 할인받고, 예측 불가능한 스파이크는 On-Demand로 유연하게 받으며, 내결함성 있는 부분은 Spot으로 절감한다. A는 베이스라인까지 비싼 On-Demand로 둬 낭비이고, B는 변동·스파이크까지 약정해 사용하지 않는 약정이 낭비되며, D는 안정성이 필요한 베이스라인을 회수 가능한 Spot에 올려 가용성을 해친다.

---

## 📌 핵심 요약

컴퓨팅 비용은 약정(SP/RI)·시장(Spot)·소유권(Dedicated)·크기(right-sizing) 네 축으로 갈린다. Savings Plans는 인스턴스가 아닌 시간당 지출을 약정하는 선도계약형 할인이고 Compute SP(유연)와 EC2 SP(고정·더 깊은 할인)로 나뉘며, RDS·Redshift·ElastiCache는 RI로 남는다. Spot은 유휴 용량을 90% 싸게 빌리되 2분 예고로 회수되므로 내결함성 워크로드에 capacity-optimized·다양화·Capacity Rebalancing과 함께 쓴다. Graviton은 ARM 효율로 40% 가성비를 내고, Compute Optimizer는 과대 프로비저닝을 ML로 잡는다. 시험은 워크로드의 안정성·내결함성·약정 가능성을 가격 모델에 매핑하는 능력을 반복해서 묻는다.
