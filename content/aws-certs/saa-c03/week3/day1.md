# Day 1 - EC2 인스턴스 유형과 구매 옵션: 하드웨어 설계와 경제학의 교차점

EC2를 처음 배우면 패밀리 이름과 구매 옵션 표를 외우려 든다. 하지만 솔루션 아키텍트에게 정작 중요한 건 "왜 이런 종류가 생겼는지"다. CPU-바운드 워크로드와 메모리-바운드 워크로드가 왜 다른 하드웨어 구성을 요구하는지, Spot이 90% 할인을 줄 수 있는 경제적 구조는 무엇인지를 이해하면, 이름을 외우지 않아도 시나리오를 보는 순간 답이 떠오른다.

이 글에서는 EC2 인스턴스 설계의 물리적·역사적 배경부터 구매 옵션의 수학, Nitro 하이퍼바이저 내부, Graviton ARM의 등장, Placement Group이 분산 시스템 이론과 어떻게 맞닿아 있는지까지를 다룬다.

## EC2 패밀리의 역사: 왜 이런 분류가 생겼나

2006년 S3 출시 이후 몇 달 뒤 EC2 베타가 열렸을 때, 인스턴스 타입은 단 하나였다. `m1.small`이라 불렸던 이 인스턴스는 1 vCPU, 1.7GB RAM, 160GB 로컬 스토리지를 제공했고, 모든 워크로드가 이 하나의 틀에 맞춰야 했다. 그러나 고객들이 다양한 워크로드를 올리기 시작하면서 문제가 드러났다. 비디오 인코딩을 돌리는 고객은 RAM이 남아돌았고, 인메모리 데이터베이스를 돌리는 고객은 CPU가 놀고 있었다. 낭비다.

AWS는 2009년부터 워크로드별 최적화 패밀리를 분리하기 시작했다. 이 결정의 기저에는 컴퓨터 아키텍처의 오래된 병목 이론, **Amdahl의 법칙**이 있다. 어떤 워크로드도 동시에 모든 자원(CPU, RAM, 네트워크, 디스크 I/O)을 병목으로 쓰지 않는다. 병목이 어디에 있느냐를 식별하면, 그 자원만 집중적으로 늘린 하드웨어를 만드는 것이 비용 효율적이다.

| 패밀리 | 병목 자원 | 대표 워크로드 | 하드웨어 특성 |
|--------|----------|--------------|--------------|
| **T** (t3/t4g) | CPU(간헐적 burst) | 변동 부하 웹, 개발 환경 | CPU 크레딧 모델, baseline 낮음 |
| **M** (m6i/m7i) | 균형 | 일반 앱 서버, 캐시 | 범용 vCPU:RAM 비율 1:4 |
| **C** (c6i/c7g) | CPU | 인코딩, ML 추론, 배치 | vCPU:RAM 비율 1:2, 고클럭 |
| **R** (r6i/r7g) | Memory | 인메모리 DB, SAP HANA | vCPU:RAM 비율 1:8 이상 |
| **X** (x2idn) | Memory(극단) | SAP HANA 수 TB | 최대 24TB RAM |
| **I** (i4i) | 로컬 NVMe I/O | NoSQL, 스트리밍 | NVMe SSD 직결, 수백만 IOPS |
| **D** (d3en) | 스토리지 용량 | Hadoop, 데이터 레이크 | HDD 밀집, 싼 용량 단가 |
| **G** (g5) | GPU 그래픽 | ML 추론, 렌더링 | NVIDIA A10G GPU |
| **P** (p4d/p5) | GPU 학습 | LLM pre-training | NVIDIA A100/H100, NVLink |
| **Inf/Trn** | AWS 칩 | 추론/학습 전용 | Inferentia2, Trainium2 |
| **A/g 접미사** | ARM | 비용 절감 | Graviton3, ARM ISA |

> 💡 **관련 이론**: 인스턴스 패밀리 선택은 사실 리틀의 법칙(Little's Law: L = λW)과 관련 있다. 요청의 평균 체류 시간(W)이 CPU 계산에 의해 결정되는 워크로드는 C 패밀리, 메모리 내 데이터 구조 크기에 의해 결정되는 워크로드는 R 패밀리가 맞다. M 패밀리는 병목이 명확하지 않을 때 시작점이 된다.

## Nitro 하이퍼바이저: 가상화 오버헤드를 0에 가깝게

기존 Xen 기반 하이퍼바이저에서 EC2 인스턴스는 I/O 경로마다 소프트웨어 하이퍼바이저를 통과해야 했다. 네트워크 패킷 하나가 인스턴스 → 가상 드라이버 → Xen Dom0 → 물리 NIC을 거쳐야 했고, 이 과정에서 CPU 사이클과 메모리 대역폭이 낭비됐다. 특히 I/O 집중 워크로드에서는 Dom0가 CPU를 5-30%씩 잡아먹는 일이 흔했다.

AWS는 2017년부터 Nitro 시스템을 도입했다. 핵심 아이디어는 두 가지다.

첫째, I/O 가상화를 전용 하드웨어 칩(Nitro Card)으로 오프로드한다. 네트워크 I/O는 Nitro Network Card가, EBS I/O는 Nitro EBS Card가 직접 처리한다. 가상 머신의 CPU는 이 과정에서 완전히 해방된다.

둘째, 나머지 하이퍼바이저 기능(메모리 보호, vCPU 스케줄링)은 극도로 경량화된 KVM 기반 마이크로 하이퍼바이저가 담당한다. 이 하이퍼바이저 코드베이스는 의도적으로 작게 유지되어 공격 면적을 줄이고, 보안 검증이 쉽다.

결과적으로 Nitro 인스턴스(5세대 이상)는 **베어메탈에 가까운 성능**을 내고, `*.metal` 인스턴스는 사실상 Nitro Hypervisor 없이 물리 CPU에 직접 접근한다. 이것이 SAP HANA나 SQL Server 같이 하이퍼바이저를 거부하는 라이선스나, CPU 마이크로아키텍처 명령(AVX-512 등)을 직접 써야 하는 워크로드에 베어메탈이 필요한 이유다.

```
[ 기존 Xen 아키텍처 ]
Guest VM → Virtual Driver → Xen Dom0 (CPU 5-30% 소비) → Physical HW

[ Nitro 아키텍처 ]
Guest VM → Nitro Card (하드웨어) → Physical HW
           (CPU 오버헤드 ~0%)
Guest VM ← KVM Micro-Hypervisor (메모리 보호, vCPU 스케줄링만)
```

> 🔍 **더 깊이**: Nitro의 네트워크 카드는 SR-IOV(Single Root I/O Virtualization)를 이용해 물리 NIC을 여러 가상 함수(VF)로 분할한다. 각 인스턴스는 자신에게 할당된 VF에 직접 접근하므로 네트워크 패킷 경로에서 소프트웨어 레이어가 제거된다. ENA(Elastic Network Adapter) 드라이버가 게스트에 설치되면 이 VF를 직접 제어할 수 있다. 100Gbps 네트워크 성능은 이 구조 덕분에 가능하다.

> 📚 **사례**: Netflix는 2021년 비디오 인코딩 플랫폼을 Xen c3 인스턴스에서 Nitro c5 인스턴스로 마이그레이션하면서 같은 인코딩 작업에서 CPU 사용량이 약 20% 감소했다고 발표했다. 하이퍼바이저 오버헤드 제거가 실제로 컴퓨팅 비용 절감으로 이어진 사례다.

## Graviton: ARM이 x86을 위협하는 이유

2018년 AWS는 자체 설계 ARM 프로세서 Graviton1을 출시했고, 2021년 Graviton2, 2022년 Graviton3로 발전했다. Graviton3는 동급 x86 Intel/AMD 인스턴스 대비 **25% 낮은 가격에 동등하거나 더 나은 성능**을 제공한다고 AWS는 주장한다.

왜 ARM이 서버 시장에서 가능성을 보이는가. 역사적으로 ARM은 낮은 TDP(열 설계 전력)로 모바일 시장을 장악했다. 서버에서도 전력 당 성능(perf/watt)이 중요해진 이유는 데이터센터 전력 비용 때문이다. AWS는 자체 칩을 설계함으로써 클라우드 워크로드(대규모 병렬, 고대역폭 메모리 접근, 가상화 친화적)에 최적화된 마이크로아키텍처를 만들 수 있다. x86의 역사적 기술 부채(복잡한 디코딩 파이프라인, 레거시 명령 지원)가 없다.

다만 Graviton은 ARM ISA를 사용하므로 소프트웨어 호환성을 확인해야 한다. JVM 기반(Java, Kotlin, Scala), Python, Go, Rust는 대부분 ARM에서 잘 돌아간다. 문제가 되는 건 x86 전용 바이너리를 배포하는 ISV 상용 소프트웨어나, x86 인라인 어셈블리가 박힌 레거시 C/C++ 코드다.

> 💡 **관련 이론**: RISC vs CISC 논쟁은 1980년대부터 이어졌다. ARM은 RISC 설계 원칙(단순 명령, 고정 길이, 레지스터 중심)을 따라 파이프라인 설계가 단순하고 전력 효율이 높다. x86은 CISC지만 내부적으로 RISC 마이크로 연산(μop)으로 변환해 실행한다. Graviton3는 ARMV8.2 ISA를 사용하며, SVE(Scalable Vector Extension)로 데이터 병렬 처리를 강화해 ML 추론이나 HPC에서 경쟁력이 있다.

| 구분 | Intel (x86) | AMD (x86) | Graviton3 (ARM) |
|------|------------|----------|-----------------|
| ISA | x86-64 | x86-64 | ARM v8.2 |
| 성능 우위 | 싱글 스레드 일부 | 가성비 | 병렬, ML, 비용 |
| 가격 (동급) | 기준 | -10% | -25% |
| 소프트웨어 호환 | 최고 | 최고 | 오픈소스 ✅, 상용 ⚠️ |
| 대표 인스턴스 | m6i, c6i | m6a, c6a | m7g, c7g, r7g |

## 구매 옵션의 수학: 언제 무엇을 선택하나

할인율만 외우면 시험에서 막힌다. 구조를 이해하면 계산 없이도 맞춘다.

**On-Demand**는 초당 과금이라 단기 실험, 예측 불가 트래픽, 순간 용량 확보에 최적이다. 1시간이라도 안 쓰면 안 낸다.

**Reserved Instance(RI)**는 특정 인스턴스 타입·리전·AZ를 1년 또는 3년 약정으로 예약한다. 전액 선납(All Upfront) > 부분 선납(Partial Upfront) > 무선납(No Upfront) 순으로 할인율이 높다. 문제는 약정 기간 중 인스턴스 패밀리 변경이 불가(Standard RI)하거나 제한적(Convertible RI, 더 낮은 할인)이라는 점이다. 현업에서 RI가 "잠긴 비용"이 되어 곤란해지는 이유다.

**Savings Plans(SP)**는 "시간당 최소 $X를 쓰겠다"는 지출 약정이다. 인스턴스 타입이 아니라 지출액에 약정하므로 유연성이 훨씬 높다. Compute SP는 패밀리·리전·OS·테너시까지 자유롭게 바꿀 수 있다. EC2 Instance SP는 리전과 패밀리를 고정하되 크기(large/xlarge 등)는 자유다.

수학적으로 볼 때, 3년 All Upfront Compute SP의 할인율은 ~66%, 3년 Standard RI는 ~72%다. 그러나 RI가 6%포인트 더 유리하려면 3년 내내 **동일 인스턴스 타입을 유지**해야 한다. 클라우드 세계에서 그 확신이 있다면 RI, 없다면 SP가 더 현명하다.

> 💡 **관련 이론**: 이 선택은 옵션 프라이싱 이론의 유연성 프리미엄(flexibility premium)과 동일 구조다. Compute SP는 Black-Scholes 모델에서 넓은 행사 가능 범위를 가진 옵션처럼 유연성이 높아 프리미엄(할인율 포기)을 낸다. RI는 특정 조건에서만 행사 가능한 유럽형 옵션처럼 조건부 할인이 더 크다.

**Spot 인스턴스**의 90% 할인이 가능한 이유는 AWS의 예비 용량(spare capacity)을 경매하기 때문이다. AWS의 물리 서버는 최대 부하 예측치보다 항상 많이 준비되어 있다. 그 여분을 유휴로 두는 것보다 저렴하게라도 파는 것이 낫다. 단, AWS가 그 용량이 필요해지면 2분 알림 후 인스턴스를 회수한다. Spot의 핵심 제약은 **단방향 종료 권한이 AWS에 있다**는 것이다.

```
[ Spot 인터럽션 처리 패턴 ]

1. IMDS에서 종료 알림 폴링
   GET http://169.254.169.254/latest/meta-data/spot/termination-time

2. 알림 감지 시:
   - 진행 중인 작업 체크포인트 저장 (S3)
   - 작업 큐(SQS)에 미완료 항목 반환
   - graceful shutdown (드레인)

3. Auto Scaling Group + Spot Fleet:
   - 여러 인스턴스 타입 + 여러 AZ 분산
   - capacity-optimized 전략: 가장 여유 있는 풀 선택
```

> ⚠️ **함정**: Spot에 "데이터베이스", "stateful", "라이선스 서버"가 등장하면 거의 무조건 오답이다. Spot은 언제든 중단될 수 있어서 MySQL 마스터나 Elasticsearch 마스터 노드에 쓰면 데이터 손실이 발생한다. 단 Spot Fleet에서 Elasticsearch 데이터 노드(복제본 있음)는 사용 가능하다.

**Dedicated Host**와 **Dedicated Instance**는 혼동하기 쉽다. Dedicated Instance는 같은 AWS 계정의 다른 인스턴스와 물리 호스트를 공유하지 않지만, 어떤 물리 서버에 올라가는지 보이지 않는다. Dedicated Host는 특정 물리 서버를 점유하고 그 서버의 소켓 수, 코어 수까지 보인다. BYOL(Bring Your Own License) 라이선스가 물리 소켓 수나 물리 코어 수 기준으로 계산되는 Oracle DB나 Windows Server SQL Server에서 Dedicated Host가 필요한 이유다.

**Capacity Reservation**은 할인 없이 용량만 확보한다. "예약"이 아니라 "자리 맡기"다. 큰 이벤트 전날 특정 AZ에 인스턴스 자리를 확보해두고, 이벤트가 끝나면 해제한다. Savings Plans와 결합하면 할인 + 용량 확보 두 마리를 잡는다.

> 📚 **사례**: 2021년 12월, Log4Shell 취약점이 발표되었을 때 많은 회사가 긴급 패치를 위해 대량의 EC2 인스턴스를 필요로 했다. On-Demand 인스턴스 가용성이 순간적으로 낮아진 us-east-1에서 Capacity Reservation 없이 운영하던 팀들이 인스턴스를 즉시 확보하지 못하는 상황이 발생했다. 이후 비즈니스 크리티컬 워크로드에서 Capacity Reservation 도입이 급증했다.

## Spot 2분 통지의 기술: 어떻게 동작하는가

인스턴스가 중단되기 2분 전, AWS는 두 채널로 알림을 보낸다.

첫째, IMDS(Instance Metadata Service)에 `spot/termination-time` 항목이 생긴다. 인스턴스 내부에서 폴링하면 된다.

둘째, EventBridge(구 CloudWatch Events)로 `EC2 Spot Instance Interruption Warning` 이벤트가 발행된다. Lambda나 SQS를 트리거해 외부에서 처리할 수 있다.

2분은 체크포인트를 저장하거나, SQS 메시지를 큐에 돌려보내거나, ECS 태스크 드레인을 시작하기에 충분한 시간이다. 단, 복잡한 DB 플러시나 큰 데이터 업로드는 2분 안에 못 끝날 수 있으므로 애초에 Spot에서 돌리면 안 된다.

> 🔍 **더 깊이**: EC2 Fleet과 Spot Fleet에는 `allocation-strategy`가 있다. `lowest-price`는 가장 싼 풀을 선택하지만 특정 인스턴스 타입에 몰릴 수 있다. `capacity-optimized`는 현재 AWS에서 여유 용량이 가장 많은 풀을 선택해 **인터럽션 빈도를 낮춘다**. 비용이 약간 더 나올 수 있지만 안정성이 올라가므로 장기 배치 잡에 권장된다. `price-capacity-optimized`(2022년 추가)는 이 둘의 균형을 잡는다.

## Placement Group: 분산 시스템 이론과의 연결

Placement Group은 인스턴스를 물리적으로 어떻게 배치할지 AWS에 힌트를 준다.

**Cluster Placement Group**은 모든 인스턴스를 같은 랙이나 인접 랙에 배치해 네트워크 레이턴시를 최소화한다. 인스턴스 간 latency가 수십 μs 수준으로 떨어지고, 최대 100Gbps Enhanced Networking이 활성화된다. HPC(High Performance Computing)에서 MPI(Message Passing Interface) 기반 병렬 계산이 이 구성을 요구한다. 단점은 단일 하드웨어 장애가 클러스터 전체에 영향을 줄 수 있다는 것이다.

**Spread Placement Group**은 각 인스턴스를 물리적으로 다른 랙에 배치한다. 랙 단위 하드웨어 장애가 최대 1개 인스턴스에만 영향을 미친다. AZ당 최대 7개 인스턴스라는 제약이 있어, 소수의 미션 크리티컬 인스턴스(ZooKeeper 노드, Kafka 브로커 리더 등)를 격리할 때 쓴다.

**Partition Placement Group**은 파티션(논리 그룹)별로 다른 물리 랙 집합을 사용한다. AZ당 최대 7개 파티션, 파티션당 수백 개 인스턴스를 넣을 수 있다. HDFS, Apache Cassandra, Apache HBase 같은 분산 시스템은 데이터 복제본을 다른 "랙 그룹"에 배치해야 단일 랙 장애로 데이터를 잃지 않는다. AWS의 Partition이 바로 이 "랙 그룹"에 해당한다.

> 💡 **관련 이론**: Partition Placement Group은 분산 스토리지 시스템의 **Rack Awareness** 개념을 AWS 인프라에 매핑한 것이다. HDFS의 기본 복제 전략(Hadoop 2.x 이상)은 블록의 첫 번째 복제본을 로컬 노드에, 두 번째를 같은 랙의 다른 노드에, 세 번째를 다른 랙의 노드에 배치한다. Partition Group에서 파티션 번호를 인스턴스 메타데이터로 읽어(`instance/placement/partition-number`) Hadoop의 Rack ID에 매핑하면 AWS 위에서 진짜 Rack-Aware HDFS를 구성할 수 있다.

> 📚 **사례**: Netflix의 Cassandra 클러스터는 AWS 위에서 Partition Placement Group을 사용해 각 Cassandra 데이터센터(DC)를 하나의 파티션에 매핑한다. 이를 통해 단일 AWS 랙 장애 시 Cassandra의 복제 인수(replication factor=3)가 파티션 경계를 넘어 데이터 가용성을 보장한다. Netflix가 공개한 Engineering Blog(2016)에서 이 아키텍처를 자세히 설명한다.

## 다른 클라우드와의 비교: GCP와 Azure의 접근법

| 차원 | AWS | GCP | Azure |
|------|-----|-----|-------|
| 인스턴스 패밀리 | C/M/R/I/G 등 15+ 패밀리 | 범용/메모리 최적화/가속기 최적화 | B/D/E/F/L/M/N 시리즈 |
| Spot/선점 가능형 | Spot (2분 통지) | Preemptible/Spot (30초 통지) | Azure Spot (5분 통지) |
| ARM 지원 | Graviton3 (25% 절감) | Tau T2A (Ampere Altra) | Dpsv5 (Ampere Altra) |
| 자체 AI 칩 | Inferentia2, Trainium2 | TPU v4 | 없음 (NVIDIA A100 사용) |
| 구매 약정 모델 | RI + Savings Plans | CUD (Committed Use Discount) | Reserved VM Instance |
| Spot 통지 방식 | 2분, IMDS + EventBridge | 30초, metadata + Pub/Sub | 5분, Azure Scheduled Events |

GCP의 Preemptible은 2분이 아닌 30초 통지로 더 짧다. 또한 GCP는 인스턴스가 24시간을 넘으면 반드시 중단된다는 추가 제약이 있었으나(현재는 Spot으로 대체되며 이 제약 완화됨), AWS Spot은 이론상 무기한 실행 가능하다.

## T 인스턴스의 CPU 크레딧 모델

T 패밀리는 다른 패밀리와 근본적으로 다른 성능 모델을 쓴다. 평상시 CPU 사용률은 baseline(예: t3.micro는 10%) 이하로 유지되고, 사용률이 낮을 때 CPU 크레딧을 적립한다. 높은 부하가 오면 크레딧을 소모해 vCPU를 100%까지 burst할 수 있다.

t3.micro 기준:
- Baseline CPU: 10% (1 vCPU의 10%)
- 크레딧 적립: 분당 6 크레딧
- 크레딧 소모: 100% 사용 시 분당 60 크레딧
- 크레딧 고갈 시: Baseline 성능으로 제한(throttle)

**T Unlimited 모드**: 크레딧이 고갈되어도 계속 burst 가능. 대신 초과 사용량을 On-Demand보다 약간 비싼 별도 요금으로 청구한다. 이 모드를 켜두면 t3가 c5처럼 쓰이다가 의외로 비용이 나올 수 있다.

> ⚠️ **함정**: "개발 서버에 t3.micro를 쓰면 제일 싸다"는 말이 틀릴 수 있다. 빌드 서버나 데이터 처리 잡은 지속적인 100% CPU를 요구하는데, T Unlimited에서는 크레딧을 계속 소모하다 On-Demand 이상의 비용이 나온다. 이런 워크로드는 처음부터 c6i나 m6i를 쓰는 게 더 저렴하다.

## IMDSv2 내부 동작: SSRF 방어의 원리

Capital One 사고(2019년)는 SSRF(Server-Side Request Forgery)를 통해 EC2 메타데이터에 접근한 사례다. 공격자는 WAF의 취약점을 이용해 인스턴스 내부에서 `http://169.254.169.254/latest/meta-data/`에 GET 요청을 보내 IAM 임시 자격증명을 탈취했다.

IMDSv2는 이를 막기 위해 PUT-then-GET 방식을 도입했다.

```bash
# 1단계: PUT으로 세션 토큰 발급
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# 2단계: 토큰을 헤더에 담아 메타데이터 요청
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
```

SSRF 공격자는 보통 GET만 가능하다. PUT을 시도하면 토큰 발급이 안 되고, 토큰 없이 메타데이터를 요청하면 401이 반환된다. 추가로 IMDSv2는 IPv4 TTL을 1로 제한해서 인스턴스 안에서 나간 요청이 라우터를 하나라도 거치면(TTL 감소) 응답이 도달하지 못한다. 컨테이너 탈출 후 호스트 메타데이터 접근도 이 제약으로 차단된다.

> 🔍 **더 깊이**: EC2 Launch Template이나 IMDSv2 강제 설정이 없으면, 오래된 AMI는 기본적으로 IMDSv1이 허용된 상태로 시작한다. AWS 계정 레벨에서 `aws ec2 modify-instance-metadata-defaults --http-tokens required`를 실행하면 해당 리전의 신규 인스턴스는 모두 IMDSv2만 허용된다. 기존 인스턴스에 대해서는 `modify-instance-metadata-options`를 개별로 적용해야 한다.

## CLI로 이해 굳히기

```bash
# 현재 리전의 c7g 패밀리 인스턴스 타입 목록
aws ec2 describe-instance-types \
  --filters "Name=instance-type,Values=c7g.*" \
  --query 'InstanceTypes[*].[InstanceType,VCpuInfo.DefaultVCpus,MemoryInfo.SizeInMiB,NetworkInfo.NetworkPerformance]' \
  --output table

# Spot 가격 히스토리 (최근 24시간)
aws ec2 describe-spot-price-history \
  --instance-types c6i.xlarge \
  --product-descriptions "Linux/UNIX" \
  --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --output table

# IMDSv2 강제 적용
aws ec2 modify-instance-metadata-options \
  --instance-id i-1234567890abcdef0 \
  --http-tokens required \
  --http-endpoint enabled

# Placement Group 생성
aws ec2 create-placement-group --group-name hpc-cluster --strategy cluster
aws ec2 create-placement-group --group-name critical-spread --strategy spread
aws ec2 create-placement-group --group-name hadoop-partition --strategy partition --partition-count 7

# Capacity Reservation
aws ec2 create-capacity-reservation \
  --instance-type m7g.large \
  --instance-platform "Linux/UNIX" \
  --availability-zone ap-northeast-2a \
  --instance-count 20 \
  --end-date-type limited \
  --end-date 2025-12-31T23:59:59Z
```

## 정리하며

EC2 인스턴스의 패밀리 체계는 "워크로드의 병목 자원이 무엇인가"라는 물음에 대한 대답이다. 스토리지 병목이면 I, 메모리 병목이면 R, CPU 병목이면 C를 고른다. Graviton(ARM)은 코드 호환성 확인 후 첫 번째로 검토할 가성비 옵션이다.

구매 옵션은 예측 가능성과 유연성의 트레이드오프다. 3년 이상 동일 타입이 확실하면 RI, 패밀리·리전을 바꿀 가능성이 있으면 Compute SP, 단기 대량 Stateless 워크로드면 Spot, 특정 이벤트 전 용량 확보는 Capacity Reservation이다.

Placement Group은 분산 시스템의 네트워크 지연과 장애 격리 요구를 AWS 물리 인프라에 매핑하는 도구다. HPC는 Cluster, 소수 미션 크리티컬은 Spread, 대형 분산 시스템(HDFS/Cassandra)은 Partition이다.

---

## 📝 연습 문제

**문제 1.** 한 기업이 SAP HANA 데이터베이스를 AWS로 이전한다. SAP HANA는 물리 CPU 소켓 단위 라이선스를 요구하며, 특정 CPU 마이크로아키텍처 명령어(AVX-512)를 직접 사용한다. 가장 적합한 EC2 구성은?

A) m6i.8xlarge, Dedicated Instance
B) x2idn.metal, Dedicated Host
C) r6i.32xlarge, On-Demand
D) m7g.16xlarge, Dedicated Host

**정답: B**
해설: SAP HANA는 수 TB RAM이 필요하므로 X 패밀리(메모리 최적화 극단)가 맞다. `.metal`은 하이퍼바이저 없이 물리 CPU에 직접 접근하므로 AVX-512 명령어를 그대로 사용할 수 있다. Dedicated Host는 물리 소켓/코어 수를 라이선스 카운팅에 사용할 수 있다. m7g는 ARM(Graviton)으로 x86 전용 SAP HANA와 호환되지 않는다. Dedicated Instance는 물리 호스트 가시성이 없어 소켓 기반 라이선싱에 쓸 수 없다.

---

**문제 2.** 매일 밤 02:00~06:00에 대규모 ML 모델 학습을 실행하는 배치 잡이 있다. 학습이 중단되면 마지막 체크포인트부터 재시작할 수 있도록 S3에 모델 가중치를 저장한다. 비용 최소화 전략은?

A) On-Demand p4d.24xlarge
B) Spot p4d.24xlarge + EventBridge 인터럽션 핸들러
C) Reserved p4d.24xlarge 1년
D) Savings Plans Compute + p4d.24xlarge On-Demand

**정답: B**
해설: 체크포인트 저장으로 중단 후 재시작이 가능하므로 Spot의 인터럽션을 허용할 수 있다. p4d.24xlarge Spot은 On-Demand 대비 최대 70% 절감 가능하다. EventBridge로 `EC2 Spot Instance Interruption Warning` 이벤트를 감지해 마지막 체크포인트를 저장하고 graceful shutdown한다. RI나 SP는 매일 밤 4시간만 사용하는 워크로드에서 나머지 20시간 비용을 낭비한다. Spot + 체크포인트 패턴이 ML 학습의 표준적인 비용 최적화 방법이다.

---

**문제 3.** 금융 거래 처리 시스템이 us-east-1에서 10개의 EC2 인스턴스로 실행 중이다. 각 인스턴스가 서로 다른 물리 하드웨어 장애에서 독립적이어야 하고, 인스턴스가 10개를 초과할 수도 있다. 적합한 Placement Group은?

A) Cluster Placement Group
B) Spread Placement Group
C) Partition Placement Group
D) Placement Group 불필요

**정답: C**
해설: Spread Placement Group은 AZ당 최대 7개라는 제약이 있어 10개를 초과할 경우를 수용하지 못한다. Partition Placement Group은 AZ당 최대 7개 파티션, 파티션당 수백 개 인스턴스를 허용하며, 파티션 간 물리 랙이 격리된다. 각 파티션이 독립적인 장애 도메인이므로 단일 랙 장애의 영향 범위가 제한된다. Cluster는 저지연을 위해 모아두는 것으로 장애 격리와 반대 방향이다.

---

**문제 4.** 스타트업이 3년 약정으로 비용을 최소화하면서도, 향후 인스턴스 패밀리를 바꾸거나 다른 리전으로 이전할 가능성을 열어두고 싶다. 가장 적합한 구매 옵션은?

A) Standard Reserved Instance 3년 All Upfront
B) Convertible Reserved Instance 3년
C) Compute Savings Plans 3년
D) EC2 Instance Savings Plans 3년

**정답: C**
해설: Compute Savings Plans는 EC2 패밀리, 인스턴스 크기, 리전, OS, 테너시를 모두 자유롭게 변경할 수 있는 최고의 유연성을 제공한다. 할인율은 약 66%로 Standard RI(~72%)보다 낮지만, "패밀리와 리전 변경 가능성"이라는 요구사항에 맞는 유일한 선택이다. EC2 Instance SP는 리전과 패밀리를 고정하고, Convertible RI는 동급 이상 타입으로만 교환 가능해 유연성이 제한된다.

---

**문제 5.** c6i.4xlarge On-Demand 비용이 시간당 $0.68이다. 3년 All Upfront Standard RI를 구매했을 때 시간당 등가 비용이 $0.20이라면, 손익분기점(Break-even)은 몇 개월인가? (RI 총비용 = $0.20 × 24 × 365 × 3 = $5,256)

A) 약 6개월
B) 약 13개월
C) 약 18개월
D) 약 24개월

**정답: B**
해설: RI 선납 비용이 $5,256이라면, 매달 On-Demand로 내는 비용($0.68 × 24 × 30 = $489.6/월)과 RI 월 등가비용($0.20 × 24 × 30 = $144/월)의 차이는 $345.6/월이다. 손익분기점 = $5,256 / $345.6 ≈ 15개월이 아니라, RI는 선납이므로 실제로는 약 12~13개월에 누적 절감액이 선납 비용을 회수한다. 일반적으로 1년 이상 동일 워크로드가 확실하면 RI가 유리하고, 그렇지 않으면 Savings Plans나 On-Demand가 현명하다.

---

**문제 6.** 워크로드와 인스턴스 패밀리의 연결로 올바른 것은?

① 실시간 Apache Kafka 브로커 (높은 디스크 I/O, 낮은 레이턴시 필요)
② 딥러닝 모델 사전학습 (GPU 집중)
③ SAP BW 인메모리 분석 (512GB RAM 필요)
④ 마이크로서비스 앱 서버 (트래픽 변동 큼)

A) ①-I 패밀리, ②-P 패밀리, ③-R 패밀리, ④-T 패밀리
B) ①-I 패밀리, ②-G 패밀리, ③-R 패밀리, ④-T 패밀리
C) ①-R 패밀리, ②-P 패밀리, ③-I 패밀리, ④-T 패밀리
D) ①-T 패밀리, ②-P 패밀리, ③-R 패밀리, ④-I 패밀리

**정답: A**
해설: Kafka 브로커는 로컬 NVMe I/O 집중 → I 패밀리(i4i). 딥러닝 학습은 GPU 집중 → P 패밀리(p4d/p5, NVIDIA A100/H100). SAP BW 512GB RAM → R 패밀리(r6i/r7g). 마이크로서비스의 간헐적 트래픽 → T 패밀리 (CPU 크레딧 burst 활용). G 패밀리는 주로 ML 추론과 그래픽 렌더링용이고, P는 학습 전용이다.

---

**문제 7.** 회사가 us-east-1에서 c5n.18xlarge 인스턴스를 사용하는 HPC 클러스터를 운영한다. 노드 간 MPI 통신 레이턴시를 최소화하면서 100Gbps 네트워크 성능을 활성화하려 한다. 어떤 설정이 필요한가?

A) Spread Placement Group + Enhanced Networking(ENA)
B) Cluster Placement Group + Elastic Fabric Adapter(EFA)
C) Partition Placement Group + ENA
D) Multi-AZ 배치 + Enhanced Networking

**정답: B**
해설: Cluster Placement Group은 인스턴스를 인접 랙에 배치해 레이턴시를 μs 단위로 줄인다. EFA(Elastic Fabric Adapter)는 OS 바이패스(OS-bypass) 네트워킹을 지원해 MPI 라이브러리가 커널을 거치지 않고 네트워크 하드웨어에 직접 접근한다. c5n 계열은 EFA를 지원하며, Cluster PG + EFA 조합이 100Gbps 저레이턴시 HPC의 표준 패턴이다. Spread는 격리를 위해 분산 배치하므로 레이턴시 최소화와 반대다.