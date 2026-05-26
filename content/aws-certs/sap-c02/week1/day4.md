# Day 4 - 컴퓨팅 4종의 깊이: Nitro, EBS, ELB, Auto Scaling을 Pro 시야로 다시 보기

EC2를 "가상 머신"이라 부르는 건 절반의 진실이다. 그 절반의 나머지를 보기 위해 오늘 우리는 2017년 11월 re:Invent로 잠깐 돌아간다. James Hamilton이 무대에 올라 "이제 우리는 더 이상 Xen을 쓰지 않습니다"라고 말한 그 순간이 EC2의 두 번째 탄생이었다. 그 전까지 EC2는 Citrix Xen 하이퍼바이저 위에 얹힌 단순한 KVM-ish 클러스터였고, dom0가 모든 I/O를 처리하느라 호스트 CPU의 7-30%가 가상화 오버헤드로 사라지고 있었다. 같은 해 Google이 Compute Engine에서 비슷한 문제를 안고 있었고, Microsoft Azure도 Hyper-V root partition의 비대화를 고민하고 있었다. 그런데 AWS는 정공법으로 갔다 — **하이퍼바이저를 카드 안에 집어넣었다**.

이게 왜 중요한가. Pro 시험에서 "왜 Graviton이 더 싼가", "왜 m5와 m5d가 다른가", "왜 Spot이 c5에서 더 자주 회수되는가" 같은 질문이 나올 때, Nitro 아키텍처를 모르면 키워드 매칭만으로 풀어야 한다. 하지만 Nitro의 카드 구조를 한 번이라도 시각적으로 그려보면, 모든 인스턴스 패밀리의 trade-off가 "그 카드에 무엇이 더 붙어 있는가"라는 한 줄로 정리된다.

오늘은 EC2·EBS·ELB·Auto Scaling 네 가지를 SAA 깊이에서 Pro 깊이로 다시 끌어올린다. 표면적으로는 같은 서비스지만, Pro 시나리오에서 묻는 깊이는 완전히 다르다.

## Nitro System: 카드 안의 하이퍼바이저

전통적인 가상화 스택은 이렇게 생겼다.

```
[Guest OS - EC2 instance]
        │
[Xen hypervisor + dom0 driver domain]   ← 호스트 CPU 점유, 7-30% 오버헤드
        │
[Host OS / Firmware]
        │
[Physical NIC / HBA / Disk Controller]
```

Nitro 이후 이 그림은 이렇게 바뀐다.

```
[Guest OS - EC2 instance]   ← bare metal에 가까운 성능
        │
[KVM-Lite (< 1% 오버헤드, 거의 패스스루)]
        │
[Nitro Cards - 별도 ASIC]   ← Network, Storage, Security, Hypervisor 분리
        │
[Physical Hardware]
```

Nitro Card는 단일 카드가 아니다. AWS는 **Nitro Card for VPC**(ENA / SR-IOV), **Nitro Card for EBS**(NVMe 컨트롤러), **Nitro Card for Instance Storage**(로컬 NVMe), **Nitro Security Chip**(부팅 무결성·하드웨어 root of trust), **Nitro Hypervisor**(KVM 변형, 거의 패스스루)로 분리했다. 즉 한 물리 서버에서 동작하던 하이퍼바이저 기능들이 **5개의 독립된 카드**로 흩어진 것이다.

> 💡 **관련 이론**: 이 설계는 1990년대 Mach 마이크로커널의 사상과 정확히 일치한다. "OS의 기능을 가능한 한 많이 사용자 공간으로 빼고, 커널은 최소한의 IPC만 담당하자"는 Mach의 비전이 30년 후 클라우드 하이퍼바이저에서 실현됐다. 학술적으로는 Heiser et al.의 "From L3 to seL4"(2014) 논문이 이런 분리가 어떻게 성능 손실 없이 보안을 강화하는지를 형식적으로 증명했다. AWS는 이걸 ASIC 레벨에서 구현해 SR-IOV(PCI-SIG 표준)와 결합했다.

> 🔍 **더 깊이**: 같은 물리 서버에서 인스턴스 두 개가 동작할 때, 전통적 하이퍼바이저는 메모리에서 vCPU를 스위칭하느라 cache line이 자주 invalidate된다. Nitro는 vCPU pinning을 적극 사용하고, NUMA 노드 단위로 인스턴스를 묶어 cache 친화성을 유지한다. 그래서 c5.metal과 c5.24xlarge의 성능 차이는 거의 없다 — 둘 다 같은 카드 구조 위에서 동작한다. 다만 `metal`은 ENA·EBS 카드를 게스트 OS가 직접 보고 자체 KVM이나 Xen을 또 올릴 수 있다(중첩 가상화). VMware Cloud on AWS가 이 위에서 ESXi를 돌린다.

> 🔍 **더 깊이**: Nitro Security Chip은 부팅 시 measured boot를 수행한다. UEFI firmware → bootloader → kernel의 각 단계 해시를 Nitro Card 내부 secure enclave에 기록하고, 변조 흔적이 보이면 인스턴스를 격리한다. 이게 AWS Nitro Enclaves(2020 출시)의 기반이다. Enclave는 부모 EC2와 메모리·CPU는 공유하지만 네트워크·디스크는 격리된 격실로, KMS 키나 PCI 카드 데이터처럼 부모 OS의 root도 못 보게 하고 싶은 데이터를 다룬다. Fidelity Investments는 이걸로 신용카드 정보 처리를 격리한다.

> 📚 **사례**: 2018년 1월, Spectre와 Meltdown CPU 취약점이 공개됐다. 같은 물리 서버에서 동작하는 인스턴스끼리 다른 인스턴스의 메모리를 부분적으로 읽을 수 있는 사이드 채널 공격이었다. Google·Microsoft·AWS 모두 패치를 배포했지만, **AWS만이 패치 후 성능 저하가 거의 없었다**. 이유는 Nitro의 메모리 격리가 이미 카드 레벨에서 이뤄져 있어, Spectre가 노리던 speculative execution의 경계가 다른 클라우드보다 훨씬 단단했기 때문이다. 같은 사건에서 GCP는 Linux KPTI 패치로 15-25% 성능 저하를 기록했다. [AWS 공식 후기](https://aws.amazon.com/security/security-bulletins/AWS-2018-013/).

> ⚠️ **함정**: "Nitro 인스턴스에서는 OS 패치가 필요 없다"는 보기는 함정이다. Nitro는 **하이퍼바이저 측 격리**를 강화한 것이지, 게스트 OS의 커널 취약점은 여전히 고객 책임이다. SAP 시험에서 "Nitro" 단어만 보고 보안 책임이 AWS로 옮겨갔다고 착각하면 안 된다.

## Instance Family와 패밀리 명명의 정치학

`m5d.4xlarge` 같은 이름은 단순한 명명이 아니라 **AWS의 capacity planning**을 반영한다. AWS는 데이터센터별로 어떤 패밀리를 얼마나 채울지 매 분기 계획하고, Spot 가격은 그 잉여 capacity에 따라 결정된다.

- **첫 글자 (Family)**: m=General, c=Compute, r=Memory, x=Memory extreme, i=I/O, d=Dense storage, p/g=GPU, h=HDD, z=Z1d(고클럭)
- **숫자 (Generation)**: 5, 6, 7, ... 세대가 올라갈수록 Graviton·AMD·Intel 신형 CPU
- **suffix (변형)**: `d`=Local NVMe, `n`=Network optimized (25→100Gbps), `a`=AMD EPYC, `g`=Graviton (ARM), `i`=Intel 명시, `e`=Extended memory
- **크기**: nano, micro, small, medium, large, xlarge, 2xl, 4xl, ..., 96xl, metal

| Family | 대표 사용처 | vCPU:Memory | 특이점 |
|--------|-------------|-------------|--------|
| t3/t4g | 버스트형 (개발·블로그) | 1:4 | CPU Credit + Unlimited 모드 (초과 시 과금) |
| m5/m6i/m7g | 균형 (웹 서버, 앱 서버) | 1:4 | 가장 무난, Pro 정답 첫 후보 |
| c5/c6i/c7g | CPU 최적 (배치, 게임) | 1:2 | Spot 회수율 높음 (수요 많음) |
| r5/r6i/r7g | 메모리 최적 (DB, 캐시) | 1:8 | Aurora·Redis 백엔드 |
| x1/x2idn | 메모리 극단 (SAP HANA) | 1:30+ | TB급 메모리, BYOL HANA |
| i3/i4i | I/O 최적 (NoSQL) | 1:8 + NVMe | NVMe ephemeral, Cassandra·Redis |
| p4d/p5 | GPU (ML training) | A100/H100 | EFA 400Gbps |
| g4dn/g5 | GPU 추론·미디어 | T4/A10G | NVIDIA AppStream |
| inf1/inf2 | 추론 전용 ASIC | AWS Inferentia | Llama·BERT 추론, 가성비 |
| trn1 | 트레이닝 전용 ASIC | AWS Trainium | GPT-급 training |

> 🔍 **더 깊이**: Graviton(`g` suffix)은 AWS Annapurna Labs(2015년 $370M에 인수)가 설계한 ARM Neoverse N1/V1 기반 CPU다. Graviton2는 64코어 단일 die, Graviton3는 7nm + DDR5 + PCIe 5, Graviton4(2024)는 96코어 + 메모리 대역폭 75% 증가. 가격 성능 우위의 비밀은 단순히 ARM이 싸서가 아니라 **AWS가 자기 워크로드에 맞춰 die를 설계**했기 때문이다. 예를 들어 일반 CPU는 SIMD 명령에 큰 die 면적을 쓰지만, Graviton은 SIMD를 줄이고 대신 메모리 컨트롤러를 늘렸다. 웹 서버·DB·캐시 같은 메모리 bound 워크로드에 최적화된 것이다. x86 전용 바이너리는 못 돌리므로 Docker Buildx의 `--platform linux/amd64,linux/arm64` multi-arch 빌드가 필요하다.

> 💡 **관련 이론**: Graviton의 등장은 클라우드 산업의 **specialization 사이클**을 보여준다. Hennessy & Patterson은 "A New Golden Age for Computer Architecture"(CACM 2019)에서 무어의 법칙 둔화에 대응해 **도메인 특화 아키텍처(DSA)**로 회귀할 것을 예측했다. Google TPU(2016), AWS Inferentia(2019), Apple M1(2020), AWS Trainium(2022)이 모두 같은 흐름이다. SAP 시험에서 "ML 추론에서 비용을 최소화하라" 시나리오에 Inferentia(Inf1/Inf2)가 답인 이유가 여기 있다 — GPU(g4dn) 대비 추론당 가격이 70% 저렴하다.

> 🎯 **시나리오**: "한 의료 영상 회사가 EC2에서 Llama-2 70B를 추론한다. 월 GPU 비용이 $80,000. PII 데이터를 다루므로 SaaS API 사용은 불가. 비용을 60% 이상 절감하려면?" — 답: **Inf2 인스턴스로 마이그레이션 + Neuron SDK로 모델 컴파일**. inf2.48xlarge는 12개 Inferentia2 칩, 384GB HBM, $13/h. 같은 throughput을 p4d.24xlarge($32.77/h)로 내려면 비용이 2.5배. Neuron SDK가 PyTorch 모델을 자동 변환하므로 코드 변경 최소.

### Burstable의 함정과 CPU Credit

t3/t4g 인스턴스는 vCPU의 baseline performance만큼만 평소에 쓰고, 그 이상은 **CPU Credit**을 쌓아뒀다가 burst한다. t3.medium의 baseline은 20%, 1시간에 24 credit 적립 → max 576 credit. credit 다 쓰면 (1) Standard 모드에서는 baseline으로 감속, (2) Unlimited 모드(2017년 추가, 기본값)에서는 초과분에 추가 과금 (vCPU-hour당 $0.05).

> ⚠️ **함정**: t3.medium을 production 웹 서버로 쓰다가 트래픽 spike 시 CPU 100% 지속 → Unlimited 과금으로 m5.large보다 비싸진 사례가 흔하다. 안정적 워크로드에는 t 패밀리 금지가 표준 가이드라인.

## EBS: 네트워크 스토리지의 정체

EBS는 EC2에 디스크처럼 보이지만 실제로는 **EC2와 물리 디스크 사이에 AWS SAN 네트워크가 있다**. 이게 SAA에서 거의 안 다루는 EBS의 핵심.

```
[EC2 instance]
       │
[Nitro Card for EBS - NVMe protocol]
       │
[AWS 내부 SAN 네트워크 - dedicated fabric]
       │
[EBS Server Cluster - 분산 블록 스토리지]
       │
[3 replicas 동기, 같은 AZ 내]
```

EBS는 한 AZ에서 **3개 복제본**을 동기 유지하지만, AZ 경계는 못 넘는다(AZ 간 latency 때문). 따라서 EBS는 **AZ-local 리소스**이고, AZ 장애 시 그 AZ의 EBS도 함께 다운된다.

### EBS 볼륨 타입 4종의 trade-off matrix

| 타입 | 카테고리 | 최대 IOPS | 최대 처리량 | 최대 크기 | 가격 (GB·월) |
|------|----------|-----------|-------------|-----------|--------------|
| gp3 | SSD 범용 | 16,000 | 1,000 MB/s | 16 TB | $0.08 |
| gp2 | SSD 범용 (구) | 16,000 (3 IOPS/GB) | 250 MB/s | 16 TB | $0.10 |
| io2 Block Express | SSD 고성능 | 256,000 | 4,000 MB/s | 64 TB | $0.125 + IOPS |
| io1 | SSD 고성능 (구) | 64,000 | 1,000 MB/s | 16 TB | $0.125 + IOPS |
| st1 | HDD 처리량 | 500 | 500 MB/s | 16 TB | $0.045 |
| sc1 | HDD 콜드 | 250 | 250 MB/s | 16 TB | $0.015 |

> 🔍 **더 깊이**: gp3는 2020년 출시되며 게임 체인저가 됐다. gp2는 "3 IOPS/GB" 공식으로 1000 IOPS를 얻으려면 333GB를 사야 했다. gp3는 IOPS와 크기를 **독립 프로비저닝**한다. 기본 3000 IOPS·125 MB/s 무료, 그 이상은 추가 비용. 평균 20% 저렴. 단 한 가지 함정: gp3는 burst 기능이 없다. gp2의 작은 볼륨(1-1000 GB)은 일시적으로 3000 IOPS를 burst할 수 있지만, gp3는 프로비저닝한 만큼만 정확히 제공한다.

> 🔍 **더 깊이**: io2 Block Express는 2021년 출시된 새 아키텍처다. 기존 io1·io2가 EBS 서버 클러스터를 통해 동기 복제하던 것을, Block Express는 **NVMe over Fabrics(NVMe-oF)** 기반의 SR(Scalable Reliable) 프로토콜로 재설계했다. 그 결과 sub-millisecond p99 latency, 256K IOPS, 99.999% 내구성. 단점은 r5b/x2idn 같은 특정 인스턴스 패밀리에서만 지원. 또 한 가지: io2와 io2 Block Express의 가격은 같지만 성능은 4배 — io2를 쓰면서 Block Express 인스턴스 패밀리를 선택 안 하면 그냥 손해.

> 📚 **사례**: 2019년 8월 23일 도쿄 리전 AZ 장애. 한 AZ의 냉방 시스템 제어 SW 버그로 일부 EBS 서버가 과열되며 격리됐다. 그 시점에 single-AZ로 RDS를 운영하던 회사들은 DB가 동시에 죽었다 — EBS 3-replica가 모두 같은 AZ 안에 있었기 때문이다. RDS Multi-AZ로 운영하던 회사들은 standby로 자동 failover돼 살아남았다. **EBS의 AZ-local 특성을 모르면 single-AZ가 충분히 안전해 보이는 함정이 여기 있다**. [AWS 공식 회고](https://aws.amazon.com/jp/message/56489/).

> ⚠️ **함정**: "EBS는 다른 AZ로 마운트할 수 있다"는 보기는 함정이다. EBS는 AZ-local이다. 다른 AZ로 옮기려면 (1) 스냅샷 생성, (2) 다른 AZ에서 스냅샷으로 복원하는 두 단계가 필요하고, 그 사이 데이터는 정지 시점 기준이다. 진짜 실시간 다중 AZ 공유가 필요하면 EFS나 FSx for OpenZFS를 써야 한다.

### EBS Multi-Attach과 분산 파일 시스템의 의미

io1/io2(Provisioned IOPS)는 **Multi-Attach** 기능을 지원한다. 같은 EBS를 최대 16개 EC2에 동시 마운트. 단 OS·파일시스템이 **clustered filesystem**이어야 한다(GFS2, OCFS2, OracleRAC). 일반 ext4·NTFS는 데이터 손상 위험.

> 💡 **관련 이론**: clustered filesystem은 분산 락 관리자(DLM)를 사용해 같은 블록을 동시 쓰지 못하게 한다. 이는 Lamport의 mutual exclusion 알고리즘(1986)의 후예다. Red Hat GFS2는 corosync + DLM, Oracle ASM은 자체 락 관리자, OCFS2는 o2cb 클러스터 스택을 쓴다. 일반 ext4는 단일 마운트 가정이라 두 노드가 같은 inode를 쓰면 silent corruption이 발생한다. 분산 시스템 책 한 챕터가 통째로 들어가는 영역이라, Pro 시험에서 Multi-Attach 보기에 "ext4" 같은 단어가 보이면 즉시 함정.

### EBS Snapshot: incremental + S3 백엔드

스냅샷은 **incremental**이다. 첫 스냅샷은 전체, 두 번째부터 변경된 블록만 저장. 백엔드는 S3(고객 직접 접근 불가). 다른 리전·계정에 공유 가능.

```bash
# 스냅샷 생성
aws ec2 create-snapshot --volume-id vol-abc --description "Daily backup"

# 다른 리전에 복사 (DR용, 암호화 강제)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 \
  --source-snapshot-id snap-xyz \
  --region us-east-1 \
  --encrypted --kms-key-id alias/aws/ebs
```

> 🔍 **더 깊이**: **EBS Fast Snapshot Restore (FSR)**는 스냅샷 → 볼륨 복원 시 첫 read의 latency 페널티를 제거한다. 일반 스냅샷은 lazy load라 첫 read마다 S3에서 블록을 가져오므로 처음 며칠은 느리다. FSR을 활성화한 스냅샷은 즉시 full performance. DR 시나리오에서 RTO를 줄일 때 필수. 단 FSR은 AZ별·스냅샷별로 시간당 $0.75라 모든 스냅샷에 켜면 비용 폭주. **분기별 DR 테스트 직전에만 켜고 끄는 패턴**이 표준.

> 🎯 **시나리오**: "한 게임사가 DR 테스트에서 1TB EBS 스냅샷을 us-east-1에서 us-west-2로 복원했더니 첫 1시간 동안 latency가 평소의 10배. 어떻게 개선?" — 답: **DR 리전에서 Fast Snapshot Restore 활성화 + DR 테스트 전 prewarm**. 또는 AWS Backup의 cross-region copy에 FSR 자동 적용 옵션 사용. 일반 스냅샷은 lazy load 특성상 첫 read마다 S3 fetch가 발생, p99 latency가 정상의 5-10배.

## ELB의 4종: 같은 이름 다른 제품

ELB는 단일 제품이 아니다. **L4/L7/L3 세 레이어에 걸친 4종의 별개 제품**이다.

| 종류 | 레이어 | 라우팅 기준 | 적합 워크로드 | 정적 IP |
|------|--------|-------------|----------------|---------|
| Classic (CLB) | L4/L7 | 기본 (deprecated) | 사용 금지 | X |
| Application (ALB) | L7 | Host, Path, Header, Query, Method, SourceIP | HTTP/HTTPS, 마이크로서비스 | X (GA로 추가 가능) |
| Network (NLB) | L4 | TCP/UDP/TLS | 게임, IoT, 정적 IP 필요 | O (AZ당 1개) |
| Gateway (GLB) | L3 | GENEVE protocol | 보안 어플라이언스 (Palo Alto, Fortinet) | - |

> 🔍 **더 깊이**: NLB는 **클라이언트 IP를 보존**한다. 패킷이 NLB를 거쳐도 source IP가 원본 그대로 유지된다(reverse path도 NLB가 처리). 반면 ALB는 source IP를 자기 IP로 바꾸고 원본은 `X-Forwarded-For` 헤더에 넣는다. 그래서 백엔드에서 client IP로 rate limit이나 geo blocking을 하려면 (1) NLB를 쓰거나 (2) ALB에서 `X-Forwarded-For` 헤더를 신뢰해야 한다(이 경우 ALB 앞에 다른 프록시가 있으면 spoofing 가능). NLB의 정적 IP는 AZ당 하나씩 할당되고, Elastic IP를 명시적으로 부여할 수도 있다. 방화벽 화이트리스팅이 필요한 B2B 시나리오에서 NLB가 답인 이유.

> 🔍 **더 깊이**: NLB의 처리량은 **flow hash 기반 ECMP**(Equal-Cost Multi-Path)로 달성된다. NLB는 무상태 hash 함수로 source IP·port → backend를 매핑한다. 같은 connection은 같은 backend로 가지만, NLB 자체는 connection table을 유지하지 않으므로 무한 확장이 가능하다. ALB는 connection-aware라 백엔드에 가는 connection을 다중화(HTTP/2 multiplexing)하는 대신 NLB만큼 무한 확장은 어렵다. NLB의 p99 latency가 100μs 미만인 이유가 여기 있다.

> 💡 **관련 이론**: L4 vs L7 로드밸런서의 선택은 분산 시스템에서의 **상태 보유 비용**과 직결된다. L7은 HTTP 의미를 알아야 하므로 connection을 종료하고 새 connection을 백엔드에 만든다. 이때 buffer 크기, keep-alive 정책, HTTP/2 multiplexing 등 상태가 폭발한다. L4는 그냥 IP/포트 forwarding이라 상태가 없다. 게임·VoIP·IoT처럼 latency-sensitive하면 L4, REST API·SaaS처럼 L7 의미가 필요하면 L7.

> 🎯 **시나리오**: "한 글로벌 IoT 회사가 100만 디바이스로부터 MQTT(TCP 8883)를 받는다. 정적 IP 2개를 디바이스 펌웨어에 하드코딩, 리전 장애 시 페일오버, p99 latency 1ms 이내. 어느 조합?" — 답: **Global Accelerator + NLB (Multi-Region)**. GA는 BGP Anycast로 정적 IP 2개를 제공하고, 디바이스는 가장 가까운 엣지로 자동 라우팅된다. NLB는 L4·정적 IP·MQTT(TCP) 모두 만족. ALB는 HTTP만 가능해 부적합. CloudFront는 L7 HTTP only.

### ALB의 고급 기능: 코드 수정 없는 인증과 라우팅

- **Listener Rule**: Host header, Path, HTTP Method, Query String, Source IP, HTTP Header로 라우팅. priority 기반.
- **Target Group**: EC2, IP, Lambda, Container를 묶음. 가중치 기반 weighted routing 가능.
- **Sticky Session**: ALB 자체 쿠키(AWSALB) 또는 애플리케이션 쿠키 기반.
- **WAF 통합**: 직접 WAF 규칙 적용.
- **Cognito 통합**: ALB가 OIDC/Cognito 인증 직접 처리 (백엔드 코드 수정 불필요).
- **gRPC 지원**: 2020년부터 ALB는 gRPC를 1급으로 지원, HTTP/2 + Protocol Buffer.

> 📚 **사례**: 한 SaaS가 ALB의 Cognito 통합으로 인증을 처리한다. 백엔드 App은 인증 코드를 거의 안 쓰고 ALB가 JWT를 검증해 사용자 정보를 `X-Amzn-Oidc-Data` 헤더로 전달. 백엔드는 그 헤더의 JWT signature만 검증하면 끝. 단 ALB Cognito 통합은 HTTP API에만 적합하고, gRPC·WebSocket은 별도 처리 필요. 또 ALB의 OIDC 통합은 토큰 갱신을 자체적으로 처리하지 않으므로, refresh token 흐름은 백엔드 또는 Lambda@Edge로 구현.

> ⚠️ **함정**: "ALB의 Cognito 통합이 모든 인증 케이스를 해결한다"는 보기는 함정이다. ALB Cognito는 (1) HTTP 기반이어야 하고, (2) 표준 OIDC authorization code flow만 지원하며, (3) custom claim mapping이 제한적이다. 복잡한 인증 요구사항(예: 토큰에 동적 권한 삽입)은 백엔드나 Lambda Authorizer가 더 적합.

## Auto Scaling: 6가지 정책과 Cold Start의 전쟁

ASG의 스케일링 정책은 SAA에서 "Target Tracking, Step, Simple, Scheduled" 4개로 알려져 있지만, Pro에서는 더 세분화된 시나리오를 묻는다.

| 정책 | 메커니즘 | 적합 워크로드 |
|------|----------|----------------|
| **Target Tracking** | 지표를 목표값에 맞추기 (CPU 50%) | 일반 케이스 |
| **Step Scaling** | 알람 임계치별 다른 스케일 액션 | 급격한 트래픽 변화 |
| **Simple Scaling** | 알람 한 번에 한 액션 (Deprecated 추세) | 단순 |
| **Scheduled** | 정해진 시간에 capacity 조정 | 예측 가능 패턴 (블랙프라이데이) |
| **Predictive** | ML 기반 미래 예측 (2주 데이터로 학습) | 정기 패턴 + 갑작스러운 spike |
| **Warm Pool** | 미리 시작·정지된 인스턴스 풀 유지 | 빠른 스케일 아웃 |

> 🔍 **더 깊이**: **Warm Pool**(2021년 출시)은 EC2를 미리 부팅·구성 완료 후 stopped 상태로 유지한다. 스케일 아웃 시 stopped → running 전환만 하므로 OS 부팅·앱 초기화 시간을 절약한다. 콜드 스타트가 5분 이상 걸리는 워크로드(예: ML 모델 로드 30초, JVM warmup 60초, Container pull 90초)에서 효과적. 단 stopped 인스턴스도 EBS 스토리지 비용 발생 — capacity 비용 vs cold start 비용의 trade-off. 1000 instance ASG라면 Warm Pool 200개 정도가 sweet spot.

> 💡 **관련 이론**: Warm Pool의 발상은 운영체제의 **process pool**과 동일하다. Apache의 prefork MPM이나 Nginx의 worker process가 미리 fork되어 대기하는 것과 같은 원리. 또 큐잉 이론에서 보면 Little's Law(L = λW)에서 trafic spike λ의 미분값이 클 때 W를 안정시키려면 L을 미리 키워야 한다 — 그게 바로 Warm Pool이다.

> 🎯 **시나리오**: "한 e-commerce가 매일 09시 09분에 트래픽이 10배 spike한다(타임 세일). 5분 안에 스케일 아웃해야 SLA를 지킨다. 어떤 정책이 적합한가?" — 답: **Scheduled Scaling으로 09:05에 미리 스케일 아웃 + Warm Pool로 부팅 시간 단축 + Target Tracking으로 후속 조정**. Predictive도 가능하지만 단일 시간 spike에는 Scheduled가 더 확실. Warm Pool로 콜드 스타트 5분 → 30초.

### Lifecycle Hooks: 시작·종료 시 코드 실행

ASG가 인스턴스를 시작·종료할 때 **Lifecycle Hook**으로 잠시 멈춰 사용자 코드를 실행할 수 있다.

```
[ASG: scale out 결정]
       ↓
[EC2 인스턴스 시작]
       ↓
[Lifecycle Hook: Pending:Wait 상태]   ← 여기서 SQS/SNS로 메시지 전송
       ↓ (사용자 코드 완료, complete-lifecycle-action 호출)
[Pending → InService]
       ↓
[정상 트래픽 수신]
```

사용 사례: 인스턴스에 ECS 클러스터 등록, ELB에 등록 전 헬스체크, 모니터링 에이전트 설치 완료 대기. 종료 시에도 비슷하게 트래픽 드레인 후 종료 가능.

> ⚠️ **함정**: Lifecycle Hook의 default heartbeat는 1시간, max 48시간. complete-lifecycle-action을 호출 안 하면 timeout 시 자동 진행. Lambda로 hook 처리 중 에러가 나면 default ABANDON 동작으로 인스턴스가 죽어버린다. retry·dead-letter 처리 필수.

### Mixed Instances Policy + Spot allocation strategy

ASG는 한 그룹 안에 여러 인스턴스 타입과 On-Demand/Spot을 섞어 쓸 수 있다.

```yaml
MixedInstancesPolicy:
  LaunchTemplate:
    Overrides:
      - InstanceType: m5.large
      - InstanceType: m5a.large    # AMD
      - InstanceType: m5n.large    # Network
      - InstanceType: m6i.large    # Intel
      - InstanceType: m6g.large    # Graviton
  InstancesDistribution:
    OnDemandBaseCapacity: 4
    OnDemandPercentageAboveBaseCapacity: 20
    SpotAllocationStrategy: capacity-optimized
```

> 🔍 **더 깊이**: SpotAllocationStrategy 4종 — `lowest-price`는 가장 싼 풀에서 가져오고, `capacity-optimized`는 회수 위험이 가장 낮은 풀(여유 capacity 많은 풀)을 우선, `capacity-optimized-prioritized`는 사용자 우선순위 + capacity, `price-capacity-optimized`(2022 추가, 권장)는 가격과 capacity를 동시 최적화. Pro 시험에서 Spot이 보이면 거의 `price-capacity-optimized`가 정답.

## Placement Group: 인스턴스 배치 전략

| 종류 | 배치 | 적합 워크로드 |
|------|------|----------------|
| Cluster | 같은 AZ·같은 rack | HPC, 저지연 (NIC 25/100/400Gbps EFA) |
| Spread | 다른 rack | 격리, 7개/AZ 제한 |
| Partition | 7개 partition까지 | HDFS, Cassandra, Kafka |

> 📚 **사례**: 한 ML 회사가 분산 트레이닝에 Cluster Placement Group + p4d.24xlarge × 64 + EFA 사용. 400Gbps EFA(Elastic Fabric Adapter)는 OS bypass + RDMA로 GPU 간 통신이 NVLink 수준에 근접. AllReduce 시간이 PyTorch DDP에서 1초 미만. 단 Cluster PG는 같은 AZ에 묶이므로 AZ 장애에 취약하고, 단일 PG에서 capacity 부족하면 InsufficientInstanceCapacity 에러 발생 — pre-warming이 필요한 이유.

> 🔍 **더 깊이**: Partition Placement Group은 HDFS의 rack awareness와 정확히 매핑된다. HDFS는 데이터 블록을 3개 복제할 때 (1) 같은 노드, (2) 같은 rack 다른 노드, (3) 다른 rack에 두는 정책을 쓴다. Partition PG에서 partition을 7개 만들면 HDFS가 7개 rack으로 인식해 자동 분산 복제한다. Cassandra도 같은 원리로 multi-DC replication을 흉내낼 수 있다.

## 정리하며

오늘 본 네 가지는 SAA에서 익숙한 4종이지만, Pro에서는 Nitro·gp3·NLB 정적 IP·Warm Pool·Mixed Instances Policy 같은 깊이 있는 차이를 알아야 한다. 가격 모델 5종, EBS 타입 6종, ELB 4종, ASG 정책 6종 — 이 21개의 trade-off matrix를 머리에 박는 것이 오늘의 핵심이다. 시나리오 키워드를 단순 매핑이 아니라 "왜 이 답이 더 좋은가"의 한 줄로 변환할 수 있어야 Pro 수준의 풀이가 가능하다.

다음 글은 1주차 복습 + 시나리오 10문항으로 마무리한다. 한 주 동안 본 IAM·VPC·EC2를 한 시나리오에 동시에 녹여 풀어보는 연습이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 야간 ETL 배치에 c5.4xlarge 100대를 4시간 운영한다. 비용을 최대로 절감하면서 SLA(다음날 09시까지 완료)를 만족하려면? 단, 일부 인스턴스가 중간에 회수돼도 작업은 재시작 가능.

A) 100대 On-Demand
B) 100대 3-year RI
C) Spot Fleet with diverse instance families (c5/c5n/c5a/m5) + price-capacity-optimized
D) 50대 RI + 50대 Spot

**정답: C**
해설: 키워드는 "야간만 4시간" + "최대 절감" + "SLA에 여유" + "재시작 가능". RI(B)는 24시간 가동 가정이라 야간만 사용 시 손해. Spot Fleet에 다양한 패밀리를 섞으면 한 패밀리 capacity 부족 시 다른 것으로 대체되어 회수율 낮음. `price-capacity-optimized`는 가격과 capacity를 동시 최적화. 단일 패밀리만 쓰면 그 패밀리 전체가 부족해질 때 Spot 회수가 한꺼번에 발생, SLA 위협. Trade-off: Spot은 평균 70% 할인이지만 2분 경고 후 회수 가능, stateful 워크로드 부적합.

---

**문제 2.** 한 핀테크 production DB가 RDS io1으로 운영되고 있다. 비용을 줄이면서 latency를 개선하려면?

A) gp3로 다운그레이드
B) io2 Block Express로 전환 (r5b 인스턴스 패밀리)
C) Aurora로 마이그레이션
D) gp2로 전환

**정답: B**
해설: io2 Block Express는 같은 IOPS에서 io1보다 약 30% 저렴 + sub-millisecond latency. NVMe over Fabrics 기반의 새 백엔드. 단 r5b/x2idn 같은 특정 인스턴스 패밀리에서만 활성화되므로 인스턴스 패밀리도 같이 변경 필요. A·D는 IOPS 한계로 production DB에 부적합. C는 큰 변경.

---

**문제 3.** 한 글로벌 IoT 회사가 100만 디바이스로부터 MQTT(TCP 8883)를 받는다. 정적 IP 2개를 디바이스 펌웨어에 하드코딩, 리전 장애 시 수 초 내 페일오버, p99 latency 1ms 이내, 초당 100만 패킷 처리.

A) ALB + Route 53 Failover
B) NLB + Route 53 Health Check
C) Global Accelerator + NLB (Multi-Region)
D) CloudFront + Lambda@Edge

**정답: C**
해설: 키워드는 "정적 IP" + "MQTT(L4)" + "수 초 내 페일오버" + "초당 100만 패킷". GA는 BGP Anycast로 정적 IP 2개 제공, 리전 장애 시 DNS 캐시 우회 수 초 내 페일오버. NLB는 L4·초당 수백만 패킷·정적 IP·MQTT 모두 만족. A·B는 DNS TTL 캐시로 페일오버 분 단위. D는 L7 HTTP only.

---

**문제 4.** 한 회사가 매일 10시 정각에 트래픽이 5배 spike한다. ASG의 스케일 아웃이 5분 걸려 처음 5분은 응답 지연. 어떻게 개선하는가?

A) Target Tracking을 더 공격적으로 설정
B) Scheduled Scaling으로 09:55에 미리 스케일 아웃 + Warm Pool 200대 유지
C) Step Scaling만 적용
D) Predictive Scaling만 활성화

**정답: B**
해설: 예측 가능한 시간 spike → Scheduled + Warm Pool 조합. Warm Pool은 stopped 인스턴스를 미리 부팅 완료 상태로 유지해 시작 시간을 수십 초로 단축. Predictive는 정기 패턴 학습이라 단일 spike에는 Scheduled가 더 확실. Trade-off: Warm Pool 200대도 EBS 스토리지 비용 발생, sweet spot은 ASG 크기의 10-20%.

---

**문제 5.** 한 회사가 HPC 워크로드(분산 ML training)에서 인스턴스 간 latency를 최소화하려고 한다. 어떻게 배치하는가?

A) Spread Placement Group + 멀티 AZ
B) Cluster Placement Group + EFA enabled p4d/p5
C) Partition Placement Group
D) Multi-AZ ASG

**정답: B**
해설: 같은 AZ·같은 rack에 묶어 latency 최소화. EFA(Elastic Fabric Adapter)는 OS bypass로 RDMA 수준의 통신 가능. 400Gbps NIC. 단 같은 AZ라 가용성은 떨어짐(HPC는 보통 stateless·재실행 가능). Trade-off: Spread는 격리·가용성을 위해 7개/AZ 제한, Partition은 HDFS·Cassandra처럼 rack-aware 분산 시스템용.

---

**문제 6.** EBS Multi-Attach의 제약은? (2개 선택)

A) gp3도 지원
B) io1/io2(io2 Block Express 포함)만 지원
C) 무제한 인스턴스 동시 마운트
D) 같은 AZ 내에서만 + clustered filesystem(GFS2, OCFS2, OracleRAC) 필요
E) 다른 리전에도 마운트 가능

**정답: B, D**
해설: io1/io2 Provisioned IOPS만 지원. 최대 16개 EC2 동시 마운트. 일반 ext4·NTFS는 데이터 손상 위험, clustered filesystem 필요. 같은 AZ 내에서만(EBS는 AZ-local). 분산 락 관리자가 동기화 처리.

---

**문제 7.** 한 회사가 ALB 뒤에 인증을 적용하려 한다. 백엔드(Node.js HTTP API) 코드 수정을 최소화하려면?

A) 백엔드에 Passport.js + JWT 검증 직접 구현
B) ALB의 Cognito 통합 활성화 + X-Amzn-Oidc-Data 헤더 수신
C) API Gateway + Lambda Authorizer
D) Lambda@Edge로 JWT 검증

**정답: B**
해설: ALB가 직접 OIDC/Cognito 인증을 처리하고 사용자 정보를 X-Amzn-Oidc-Data 헤더로 백엔드에 전달. 백엔드 코드 거의 수정 불필요(JWT signature만 검증). 단 HTTP 기반에만 적합, gRPC·WebSocket은 별도 처리. Trade-off: complex custom claim mapping이 필요하면 Lambda Authorizer가 더 유연.

---

**문제 8.** 한 의료 영상 회사가 EC2에서 Llama-2 70B 추론에 월 GPU 비용 $80,000. PII 데이터로 SaaS API 불가. 비용 60% 절감 목표.

A) p5.48xlarge × On-Demand
B) p4d.24xlarge × 3-year RI
C) Inf2.48xlarge + Neuron SDK로 모델 컴파일
D) SageMaker Endpoint

**정답: C**
해설: Inferentia2는 LLM 추론에 특화된 ASIC. inf2.48xlarge는 12개 Inferentia2 칩, 384GB HBM, $13/h. p4d.24xlarge($32.77/h) 대비 throughput 동일에 가격 60%+ 절감. Neuron SDK가 PyTorch 모델을 자동 변환. PII 데이터도 자기 VPC 안에서 처리. Trade-off: Inferentia는 모델 컴파일 시간이 필요하고 일부 연산(custom CUDA kernel)은 미지원.
