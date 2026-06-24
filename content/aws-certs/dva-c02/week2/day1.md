# Day 1 - EC2의 해부학: Nitro, 인스턴스 패밀리, AMI의 내부

EC2는 2006년 8월 25일 베타로 출시된 AWS의 가장 오래된 컴퓨트 서비스다. 처음엔 m1.small 한 종류, 단일 리전(us-east-1), 단순한 launch-and-pray 모델이었다. 20년이 지난 지금 EC2는 750개 이상의 인스턴스 타입, Nitro 하이퍼바이저, Graviton ARM 칩, EBS 직결 스토리지를 갖춘 거대한 컴퓨트 생태계가 됐다. 개발자가 이걸 다 외울 수는 없지만, 인스턴스 패밀리의 명명 규칙과 Nitro의 의미를 이해하면 시험 문제 절반은 풀린다.

오늘은 EC2를 코드가 돌아가는 컨테이너로 보지 말고 **"가상화된 OS를 실행하는 격리된 컴퓨트 단위"**로 본다. 그 격리가 어떻게 가능한지, AMI가 정확히 무엇인지, 왜 t2와 t3가 다르게 동작하는지를 파헤친다.

## EC2의 가상화 진화: Xen에서 Nitro까지

2006년 EC2가 처음 출시됐을 때 가상화 엔진은 **Xen**(2003년 케임브리지 대학에서 출발한 오픈소스 하이퍼바이저)이었다. Xen은 paravirtualization(게스트 OS가 자기가 가상화됐다는 걸 알고 협력)으로 시작했지만, 점차 hardware-assisted virtualization(Intel VT-x, AMD-V)으로 진화했다. 문제는 Xen이 무거웠다는 점이다. CPU·메모리·네트워크·스토리지 가상화가 모두 hypervisor 안에서 일어나서 약 30%의 오버헤드가 있었다.

AWS는 2013년부터 **Nitro 시스템**을 개발하기 시작해 2017년 c5에서 처음 출시했다. Nitro의 혁신은 **하이퍼바이저 기능을 전용 하드웨어 카드(Nitro Cards)에 오프로드**한 것이다. 네트워크 가상화는 Nitro Network Card, 스토리지 가상화는 Nitro EBS Card, 보안은 Nitro Security Chip이 처리한다. 호스트 OS의 KVM(Linux 커널 내장 하이퍼바이저)은 거의 thin layer로 남고, 게스트 인스턴스는 bare-metal에 가까운 성능을 낸다.

Nitro의 또 다른 효과는 **Firecracker microVM**의 탄생이다. Lambda와 Fargate가 동작하는 그 microVM은 KVM 위에서 125ms 안에 부팅 가능하고, 메모리 footprint는 5MB 미만이다. Firecracker는 Nitro 개발 과정에서 축적된 minimal hypervisor 기술이 만든 산물이며, 같은 호스트에서 수천 개 microVM을 격리 실행할 수 있게 한다. 이게 Lambda의 "함수당 격리"를 가능하게 한 핵심 인프라다. 더 자세한 내용은 Week 4에서 Lambda를 다룰 때 다시 보자.

> 🔍 **더 깊이**: Nitro Security Chip은 부팅 시점에 펌웨어 무결성을 검증하고, host kernel이 게스트 메모리에 직접 접근하지 못하게 막는다. 이게 2018년 Spectre·Meltdown 사이드채널 공격에서 AWS가 대부분의 인스턴스 타입을 빠르게 패치할 수 있었던 이유 중 하나다. KVM 기반 Nitro 인스턴스는 호스트와 게스트 간 메모리 격리가 하드웨어 수준에서 강제된다. 자세한 아키텍처는 [The Security Design of the AWS Nitro System](https://docs.aws.amazon.com/whitepapers/latest/security-design-of-aws-nitro-system/security-design-of-aws-nitro-system.html) 백서에 정리돼 있다.

> 💡 **관련 이론**: 하이퍼바이저는 Type 1(bare-metal, 호스트 OS 없음 — VMware ESXi, Xen)과 Type 2(host OS 위에서 동작 — VirtualBox, VMware Workstation)로 나뉜다(Popek & Goldberg, 1974). Nitro는 KVM이 Linux 커널의 일부이므로 형식적으로는 Type 2지만, hypervisor 기능 대부분이 별도 하드웨어에 위치하므로 실질적으로는 Type 1에 가깝다. 이 하이브리드 접근이 "성능은 bare-metal, 격리는 가상화"라는 두 요구를 동시에 충족한다. Popek-Goldberg의 가상화 정리(1974)는 가상화 가능한 ISA의 조건을 정의했고, x86이 본격적으로 그 조건을 만족하기 시작한 건 2005년 Intel VT-x 출시 이후다.

> 📚 **사례**: 다른 클라우드도 비슷한 길을 갔다. GCP는 KVM 기반 자체 하이퍼바이저(Borg → gVisor)를, Azure는 Hyper-V 기반 Hypervisor와 Catapult FPGA(SmartNIC)를 쓴다. 셋 다 결국 "하이퍼바이저를 가볍게, 하드웨어 가속을 많이"라는 동일한 방향으로 수렴하고 있다. 차이는 오프로드 칩을 자체 ASIC(AWS Nitro)으로 가는가, FPGA(Azure Catapult)로 가는가, SmartNIC 표준 제품(GCP, 일부 Azure)을 쓰는가다.

## 인스턴스 패밀리: 한 글자가 알려주는 워크로드 적합도

EC2 인스턴스 타입은 `m5.xlarge`처럼 **패밀리 + 세대 + 크기**로 명명된다. 패밀리 한 글자가 핵심.

| 패밀리 | 의미 | 적합한 워크로드 | 대표 |
|------|------|------|------|
| **t** | Burstable | 변동 부하, 개발 환경 | t3, t4g |
| **m** | General Purpose | 균형 워크로드 | m5, m6i, m7g |
| **c** | Compute optimized | CPU 집약 | c5, c6i, c7g |
| **r** | Memory optimized | 메모리 집약 (Redis, ElasticSearch) | r5, r6i |
| **x** | Extreme memory | 인메모리 DB (SAP HANA) | x1, x2idn |
| **i** | Storage I/O | NoSQL, 인메모리 분석 | i3, i4i |
| **d** | Dense HDD storage | 대용량 데이터웨어하우스 | d2, d3 |
| **p** | GPU (high-performance) | 딥러닝 학습 | p4, p5 |
| **g** | GPU (graphics) | 게임, 렌더링 | g4, g5 |
| **inf** | AWS Inferentia | ML 추론 | inf1, inf2 |
| **trn** | AWS Trainium | ML 학습 (저비용) | trn1 |

세대 숫자(5, 6, 7)는 차세대 칩 + 더 빠른 네트워크. 접미사도 의미가 있다.

| 접미사 | 의미 |
|------|------|
| (없음) | Intel Xeon |
| `a` | AMD EPYC |
| `g` | AWS Graviton (ARM) |
| `i` | Intel (명시적 표기) |
| `n` | enhanced networking |
| `d` | NVMe instance store 포함 |
| `e` | extra memory or storage |

> 💡 **암기 팁**: m6g.large는 "범용(m) 6세대 Graviton(g) ARM 칩에 large 크기". 시험에서 비용 최적화 시나리오는 거의 항상 Graviton(g) 답을 유도한다(같은 성능에 약 20% 저렴).

> 🔍 **더 깊이**: Graviton의 가격 우위가 가능한 이유는 AWS가 칩을 직접 설계하기 때문이다. 2018년 Graviton1(A1 인스턴스, ARM Neoverse-N1 기반)을 시작으로, 2020년 Graviton2(Arm Neoverse-N1 64코어)는 c6g·m6g·r6g, 2021년 Graviton3는 c7g·m7g·r7g에 들어갔다. 2023년 발표된 Graviton4는 c8g·m8g 시리즈에 96 vCPU로 확장됐다. Intel/AMD 칩을 사 오는 대신 직접 설계해 마진을 절약하고, 그 일부를 고객에 돌려준다. ARM 인스트럭션 세트는 RISC라 같은 와트당 성능이 x86보다 높은 경향이 있다.

## t 시리즈의 비밀: CPU credit 메커니즘

t 시리즈(burstable)는 다른 패밀리와 완전히 다른 과금 모델을 쓴다. **baseline CPU 사용률** 이하로 쓰면 CPU credit을 쌓고, baseline을 초과하면 credit을 소비한다.

| 타입 | vCPU | baseline | 시간당 credit 적립 |
|------|------|------|------|
| t3.nano | 2 | 5% / vCPU | 6 |
| t3.micro | 2 | 10% / vCPU | 12 |
| t3.small | 2 | 20% / vCPU | 24 |
| t3.medium | 2 | 20% / vCPU | 24 |
| t3.large | 2 | 30% / vCPU | 36 |

> 🔍 **더 깊이**: t2와 t3의 가장 큰 차이는 **credit 소진 시 동작**이다. t2는 standard 모드만 있어서 credit이 떨어지면 baseline CPU로 제한된다(스로틀링). t3는 기본이 unlimited 모드로, credit이 떨어져도 추가 비용을 내고 burst를 유지한다. CloudWatch에서 `CPUSurplusCreditBalance` 지표가 0보다 크면 추가 과금이 일어나고 있다는 뜻. 비용 예측이 중요한 워크로드에선 t3를 standard 모드로 명시적 전환하거나 m 시리즈를 쓰는 게 안전하다.

> ⚠️ **함정**: t3.medium을 "프로덕션 API 서버"로 쓰는 건 시험에서 거의 항상 오답이다. 트래픽이 baseline 30%를 자주 넘으면 credit이 빠르게 소진되고, unlimited 비용이 m5보다 비싸지는 경계점이 있다. AWS Compute Optimizer가 이를 분석해 패밀리 변경을 추천한다.

> 💡 **관련 이론**: t 시리즈의 credit 모델은 token bucket 알고리즘의 변형이다. 토큰(=credit)이 일정 속도로 채워지고, 사용 시 토큰을 소비한다. 토큰이 비면 throttle 또는 추가 과금. TCP traffic shaping, API Gateway throttling, DynamoDB provisioned throughput까지 모두 같은 패턴이다. AWS는 이 알고리즘을 "burstable capacity"라는 이름으로 여러 곳에 재사용한다.

## AMI: 디스크 이미지 + 메타데이터

AMI(Amazon Machine Image)는 EC2를 시작할 때 사용하는 디스크 이미지다. 정확히는 **EBS 스냅샷(또는 instance-store 매니페스트) + 부팅 메타데이터(커널, ramdisk, 블록 디바이스 매핑)** 의 묶음이다.

```
AMI 구성:
├─ Root EBS Snapshot     (OS + 사전 설치 SW)
├─ Additional EBS Snapshots (선택적 추가 볼륨)
├─ Block Device Mapping  (디스크 → /dev/xvda 등 매핑)
├─ Kernel/RamDisk ID     (PV-AMI인 경우)
└─ Launch Permissions    (어느 계정이 이 AMI로 시작 가능한가)
```

AMI 종류는 3가지다.

| 종류 | 출처 | 특징 |
|------|------|------|
| AWS-provided | Amazon Linux, Ubuntu, Windows | 정기 패치 |
| Marketplace | 벤더 (Bitnami, OracleEnt 등) | 라이선스 포함, 시간당 추가 비용 |
| Community | 다른 AWS 사용자 | 검증되지 않음, 위험 |

AMI는 **리전 단위**로 존재한다. us-east-1에서 만든 AMI를 ap-northeast-2에서 쓰려면 `CopyImage` API로 복사해야 한다. 복사 시 ID가 바뀌고, EBS 스냅샷도 같이 복사된다(별도 비용).

> 📚 **사례**: 2018년 Twitter 직원이 실수로 internal AMI를 public으로 공유했다. 이 AMI에는 회사의 root CA 인증서와 SSH 키가 포함돼 있어 신속히 비공개 처리됐다. AWS는 이 사건 이후 `EC2 Image Builder`(2019년 출시)를 통해 AMI 빌드 자동화와 보안 스캐닝, **Image Builder의 자동 패치/감사** 등을 강조하기 시작했다.

> 📚 **사례**: 2023년 보안 연구자들이 AWS Marketplace에 등록된 일부 third-party AMI에 SSH backdoor와 unauthorized cron job이 포함된 사실을 발견했다. AWS는 자동 스캔 정책을 강화했지만, 사용자가 직접 AMI fingerprint를 확인하는 게 안전하다. 실무에서는 신뢰할 수 있는 AMI ID를 SSM Parameter Store(`/aws/service/ami-amazon-linux-latest/...`)에서 가져오는 패턴이 표준이다.

## EC2 시작 시퀀스: User Data와 IAM Role

EC2 인스턴스를 시작하면 다음 순서로 부팅된다.

```
1. Nitro hypervisor가 인스턴스 할당, EBS 볼륨 attach
2. ENI(Elastic Network Interface) attach
3. AMI에서 부팅 (BIOS/UEFI → bootloader → kernel)
4. cloud-init이 IMDS에서 메타데이터 조회
   - hostname, security groups, IAM role 등
5. cloud-init이 user-data 실행 (#!/bin/bash 또는 cloud-config YAML)
6. SSH/RDP 서비스 시작
```

User data는 인스턴스 시작 시 한 번만(기본) 실행되는 부트스트랩 스크립트다. 흔한 패턴은 SSM Agent 설치, 애플리케이션 코드 다운로드, 시크릿 주입.

```bash
#!/bin/bash
yum update -y
yum install -y httpd
echo "<h1>Hello from $(hostname)</h1>" > /var/www/html/index.html
systemctl enable --now httpd
```

> 🔍 **더 깊이**: user-data는 IMDS의 `http://169.254.169.254/latest/user-data`에서 읽을 수 있다. 그래서 **user-data에 비밀번호나 API key를 박으면 인스턴스 내부 모든 프로세스가 그것을 읽을 수 있다**. IMDSv2 강제, SSM Parameter Store/Secrets Manager 사용, IAM Role 활용이 표준 패턴이다. 시험에 "user-data에 DB 비밀번호를 박았다"는 시나리오가 나오면 거의 항상 오답이고, "Secrets Manager에서 부팅 시 가져오기"가 답이다.

> 💡 **관련 이론**: cloud-init은 RHEL/Ubuntu가 공통으로 사용하는 cloud OS 초기화 프레임워크다. 2009년 Canonical(Ubuntu)이 EC2 부팅을 자동화하기 위해 만들었고, 지금은 AWS, GCP, Azure, OpenStack, 로컬 KVM 등 거의 모든 환경에서 동작한다. user-data를 cloud-config YAML로 쓰면 YAML 선언적 명세로 패키지 설치·사용자 생성·파일 작성을 할 수 있다.

## Placement Group: 인스턴스를 어디에 둘지

인스턴스가 같은 AZ 안에서 **어떻게 분산되는지**를 제어하는 옵션이다.

| 종류 | 배치 전략 | 사용처 |
|------|------|------|
| Cluster | 같은 랙·같은 네트워크 스파인 | HPC, 저지연 노드 간 통신 (MPI) |
| Spread | 서로 다른 랙 (최대 7개/AZ) | 작은 critical 워크로드 |
| Partition | 여러 파티션으로 분리, 각 파티션 = 다른 랙 그룹 | Cassandra, HDFS (대규모 분산 시스템) |

Cluster placement는 인스턴스 간 10 Gbps full-bisection bandwidth를 제공해 MPI(Message Passing Interface) 같은 워크로드에서 latency를 최소화한다. 단점은 하드웨어 장애 시 모든 인스턴스가 같이 죽을 수 있다는 것.

> 🔍 **더 깊이**: Partition placement는 Cassandra·HBase 같은 분산 시스템의 rack awareness와 동일한 발상이다. 각 파티션은 서로 다른 랙·전원·네트워크 스위치에 매핑된다. 데이터 복제본을 다른 파티션에 두면 한 파티션이 죽어도 데이터가 살아남는다. AWS는 AZ당 최대 7개 파티션을 지원하므로, 7개 복제본까지 자연스럽게 격리할 수 있다.

## 가격 모델 4가지

| 모델 | 비용 | 보장 | 적합한 용도 |
|------|------|------|------|
| On-Demand | 정가 | 즉시 시작 | 변동성 큰 워크로드 |
| Reserved Instance (1/3년) | 최대 72% 할인 | 약정 | 안정적 baseline |
| Savings Plan | 최대 72% 할인 | 시간당 commit | 유연한 약정 |
| Spot | 최대 90% 할인 | 2분 사전 통보 후 회수 가능 | fault-tolerant 배치 작업 |
| Dedicated Host | 고가 | 물리 서버 전용 | BYOL 라이선스, 규제 |

> 💡 **암기 팁**: Spot은 "**아무 때나 죽어도 되는**" 워크로드만. CI 빌드, 배치 분석, fault-tolerant 작업. 시험에 "stateless and can be interrupted"가 보이면 Spot 답.

> 🔍 **더 깊이**: Spot 가격은 AWS 내부 수요에 따라 동적으로 결정된다. 예전엔 명시적 입찰(maximum bid price)이 필요했지만, 2018년 이후 단순화돼 max price를 명시 안 하면 On-Demand 가격을 상한선으로 자동 적용한다. Spot 회수는 항상 2분 사전 통보(spot interruption notice via IMDS의 `latest/meta-data/spot/instance-action`)와 함께 오므로, 워크로드가 이 신호를 듣고 graceful shutdown 하도록 만든다. Spot Fleet과 EC2 Fleet은 여러 인스턴스 타입·AZ를 혼합해 회수율을 분산시킨다.

## CLI로 EC2 시작

```bash
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.micro \
  --key-name MyKeyPair \
  --security-group-ids sg-0123456 \
  --subnet-id subnet-0abc123 \
  --iam-instance-profile Name=MyInstanceProfile \
  --user-data file://bootstrap.sh \
  --metadata-options "HttpTokens=required" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-1}]'
```

`HttpTokens=required`로 IMDSv2 강제, IAM 인스턴스 프로파일로 자격증명 자동 주입, 태그로 식별. 이 7가지 옵션을 기억하면 실무에서 거의 모든 EC2 시작 시나리오를 다룰 수 있다.

## 정리하며

EC2의 핵심은 **Nitro 하이퍼바이저 + 인스턴스 패밀리의 워크로드 적합도 + AMI 라이프사이클**이다. 패밀리 한 글자(t/m/c/r/x/i/d/p/g)로 적합한 워크로드를 식별하고, Graviton(g 접미사)으로 비용을 줄이고, t 시리즈의 credit 모델을 이해하면 시험에서 EC2 관련 문제 대부분이 풀린다.

다음 글에서는 EC2의 네트워크 통제 — 보안 그룹, 키 페어, user-data 보안 — 를 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 c5.xlarge(Intel)에서 c6g.xlarge(Graviton)로 전환을 검토 중이다. 같은 성능을 유지하려면?

A) 코드 변경 없이 그대로 전환 가능
B) ARM64 아키텍처용으로 재컴파일이 필요 (또는 Java/Python처럼 멀티 아키텍처 지원 런타임 사용)
C) 추가 라이선스 비용 발생
D) EBS 볼륨도 ARM으로 변환 필요 (불가능)

**정답: B**
해설: Graviton은 ARM64 아키텍처라 x86-64 바이너리를 직접 실행할 수 없다. C/C++/Go/Rust 같은 컴파일 언어는 재컴파일이 필요하고, Java/Python/Node.js 같은 인터프리트/JIT 언어는 그대로 동작한다. 컨테이너 이미지도 `linux/arm64` 태그로 multi-arch 빌드가 필요하다. AWS는 Graviton 전환을 위한 [Porting Advisor](https://github.com/aws/porting-advisor-for-graviton)를 제공한다. 같은 성능에 약 20% 저렴해 비용 최적화 시나리오에서 답으로 자주 나온다.

---

**문제 2.** t3.medium 인스턴스에서 CPU 사용률이 항상 50%를 넘는다. 비용이 예상보다 훨씬 비싸게 청구되는 원인은?

A) AWS 청구 시스템 버그
B) t3는 기본 unlimited 모드라 baseline(20%) 초과 사용 시 추가 비용 발생
C) 다른 리전의 인스턴스가 잘못 청구됨
D) EBS 볼륨 비용

**정답: B**
해설: t3는 기본적으로 unlimited 모드라 baseline CPU(t3.medium은 20%)를 초과하면 surplus credit을 사용하고, surplus credit balance가 0이 되면 추가 비용이 청구된다. baseline을 항상 초과하는 워크로드는 m5나 c5처럼 fixed-performance 패밀리로 전환하는 게 비용 효율적. CloudWatch의 `CPUSurplusCreditBalance`와 `CPUSurplusCreditsCharged` 지표로 추적할 수 있다.

---

**문제 3.** 한 개발자가 user-data에 DB 비밀번호를 박았다. 보안 감사에서 지적당한 후 가장 적절한 대안은?

A) user-data를 암호화
B) AWS Secrets Manager에 비밀번호를 저장하고, 인스턴스의 IAM Role에 `secretsmanager:GetSecretValue` 권한 부여, user-data는 부팅 시 Secrets Manager에서 가져오기
C) user-data를 짧게 사용 후 삭제
D) AMI에 비밀번호를 박기

**정답: B**
해설: user-data는 IMDS에서 누구나 읽을 수 있으므로 비밀번호 저장에 부적합하다. Secrets Manager + IAM Role 패턴이 표준이다. user-data 안에는 "aws secretsmanager get-secret-value ..." 명령만 두고 실제 비밀번호는 Secrets Manager에 저장. Parameter Store의 SecureString도 가능하지만 Secrets Manager의 자동 회전 기능이 더 강력. D는 AMI도 user-data와 같은 문제(AMI 공유 시 비밀번호 유출).

---

**문제 4.** MPI 기반 HPC 워크로드를 EC2에서 돌리려고 한다. 인스턴스 간 latency를 최소화하려면?

A) Spread placement group
B) Cluster placement group + Enhanced Networking + Elastic Fabric Adapter
C) Multi-AZ 분산 배치
D) 다른 리전으로 분산

**정답: B**
해설: Cluster placement group은 같은 랙/스파인에 인스턴스를 배치해 인스턴스 간 latency를 < 50μs로 줄인다. Enhanced Networking(SR-IOV로 가상 NIC를 호스트 NIC에 직접 연결)과 EFA(Elastic Fabric Adapter, OS bypass로 RDMA-like 통신)를 같이 쓰면 MPI 워크로드에 최적. 단 단일 랙 장애 시 모두 죽으므로 fault tolerance가 약하다(HPC는 보통 checkpoint로 대응).

---

**문제 5.** 다음 중 Spot Instance를 사용하기에 가장 부적합한 워크로드는?

A) CI/CD 빌드 작업
B) ML 모델 학습 (체크포인트 저장)
C) RDBMS 프라이머리 DB
D) 배치 데이터 변환 (Spark)

**정답: C**
해설: Spot은 2분 사전 통보 후 회수 가능하므로 stateful primary DB 같은 항상 켜져 있어야 하는 워크로드엔 부적합. A·B·D는 모두 fault-tolerant(checkpoint로 재시작 가능)하거나 idempotent해서 회수돼도 별 영향 없음. RDBMS는 RDS Multi-AZ 같은 managed service를 쓰거나, self-managed라면 Reserved Instance/On-Demand가 표준. Spot 회수 시 추가 비용 없이 stop만 되므로 데이터 보존이 가능한 EBS root 볼륨 설정도 핵심.

---

**문제 6.** AMI를 us-east-1에서 ap-northeast-2로 옮기려고 한다. 가장 정확한 방법은?

A) AMI는 글로벌이라 자동으로 사용 가능
B) `aws ec2 copy-image --source-region us-east-1 --source-image-id ami-... --region ap-northeast-2`로 복사
C) 인스턴스를 다시 만들어 새 AMI를 ap-northeast-2에서 만들기
D) AMI ID를 그대로 사용

**정답: B**
해설: AMI는 리전 단위로 존재한다. `CopyImage` API로 다른 리전에 복사할 수 있고, 이때 새 AMI ID가 생성되며 EBS 스냅샷도 함께 복사된다(데이터 전송 비용 발생). 암호화된 AMI는 대상 리전의 KMS 키로 재암호화된다. 시험에 자주 나오는 함정: "다른 리전에서 같은 AMI ID를 사용하려 함" → 항상 오답. 리전마다 다른 ID.

---

**문제 7.** EC2 인스턴스의 IMDS endpoint(169.254.169.254)에서 가져올 수 있는 정보가 아닌 것은?

A) IAM Role의 임시 자격증명
B) 인스턴스 ID, AMI ID, AZ
C) 인스턴스의 시간당 청구 금액
D) user-data

**정답: C**
해설: IMDS는 인스턴스 자체 메타데이터(ID, AZ, instance type, SG, IAM role 자격증명, user-data 등)를 제공하지만 청구 정보는 노출하지 않는다. 청구는 AWS Cost Explorer나 Cost and Usage Report로 별도 조회. IMDS의 모든 경로는 `aws ec2-instance-connect describe-instance-metadata`나 인스턴스 안에서 `curl http://169.254.169.254/latest/meta-data/`로 확인 가능. IMDSv2 사용 시 PUT으로 토큰을 먼저 받아야 한다.

---

**문제 8.** EC2 Spot 인스턴스가 2분 사전 통보를 받았다. 가장 적절한 대응은?

A) 인스턴스를 종료시키지 않고 새 인스턴스를 다른 리전에서 시작
B) IMDS의 `spot/instance-action` 신호를 monitoring하고, 받으면 in-flight 요청을 drain한 뒤 graceful shutdown
C) 무시하고 워크로드 계속 실행
D) IAM Role을 회수

**정답: B**
해설: Spot interruption notice는 IMDS endpoint `http://169.254.169.254/latest/meta-data/spot/instance-action`에 도착한다. 워크로드는 이 신호를 polling 또는 EventBridge로 받아 (1) 새 요청 수신 중단, (2) 진행 중 요청 완료, (3) 상태 체크포인트 저장, (4) 종료 시퀀스 실행을 해야 한다. ALB Target Group의 deregistration delay와 결합하면 사용자 영향 없이 회수를 처리할 수 있다.
