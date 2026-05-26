# Day 4 - EC2·EBS·ELB·Auto Scaling: 컴퓨팅 4종의 사용 설명서

EC2를 "가상 머신"이라고 부르는 건 절반만 맞다. EC2는 **Nitro 하이퍼바이저 + KVM 변형 + 전용 ASIC**이 결합된 하드웨어 가상화 플랫폼이다. EBS는 단순 "디스크"가 아니라 **분산 블록 스토리지 + 네트워크 스토리지 프로토콜**의 합성품. ELB는 "로드 밸런서"가 아니라 **L4/L7/L7+/Gateway 4종의 별개 제품**이다. Auto Scaling은 "자동 확장"이 아니라 **6가지 스케일링 정책**의 매뉴얼이다.

오늘은 SAA에서 가볍게 본 이 네 가지를 Pro 깊이로 다시 본다. 특히 시험에 자주 나오는 트레이드오프(Spot vs On-Demand, EBS 타입 4종, ALB vs NLB, Step vs Target Tracking)에 집중한다.

## EC2의 진짜 구조: Nitro System이 바꾼 것

2017년 AWS는 **Nitro System**을 발표했다. 이전까지 EC2는 Xen 하이퍼바이저 위에서 동작했고, 하이퍼바이저가 네트워킹·스토리지 I/O를 CPU 자원으로 처리했다. Nitro 이후 이 작업은 **전용 Nitro Card(ASIC)**가 처리하고, 하이퍼바이저는 거의 사라진다.

```
[전통적 Xen]                    [Nitro]
┌─────────────────┐             ┌─────────────────┐
│ Guest OS        │             │ Guest OS        │
│ Hypervisor (Xen)│  CPU 점유   │ KVM (~1% 오버헤드) │ Nitro Card 처리
│ Host OS         │             │ (Host OS 거의 없음) │ (Network/Storage/SR-IOV)
│ Hardware        │             │ Hardware + Nitro Card│
└─────────────────┘             └─────────────────┘
```

> 🔍 **더 깊이**: Nitro Card는 5세대 ENA(Elastic Network Adapter)와 NVMe 컨트롤러를 통합한 PCIe 카드다. EC2 인스턴스가 보는 네트워크 인터페이스와 EBS 디스크는 사실 이 Nitro Card가 가상화해서 제공하는 것이다. 그 덕분에 (1) bare metal에 가까운 성능, (2) 호스트 OS 공격 표면 최소화(보안), (3) 같은 물리 서버에서 여러 인스턴스가 격리된 채 동작 가능. Nitro 이전 c4 인스턴스는 ~5-10% 오버헤드, Nitro 기반 c5는 1% 미만.

> 💡 **관련 이론**: Nitro의 설계는 **SR-IOV(Single Root I/O Virtualization, PCI-SIG 표준)**의 극단적 구현이다. 일반 클라우드에서 SR-IOV는 NIC을 가상화하지만, AWS는 NIC·스토리지·security·timer까지 모두 별도 ASIC로 분리했다. 이게 AWS Outposts·Local Zones에서도 같은 인스턴스 타입을 제공할 수 있는 이유.

### Instance Type 명명 규칙: 한 글자가 의미하는 것

`m5d.4xlarge` 같은 이름의 각 부분은:

- `m` — Family (m=General, c=Compute, r=Memory, x=Memory extreme, i=I/O, d=Dense storage, p/g=GPU, ...)
- `5` — Generation
- `d` — Additional features (`d`=Local NVMe, `n`=Network optimized, `a`=AMD, `g`=Graviton)
- `4xlarge` — Size

| Family | 대표 사용처 | vCPU:Memory 비율 |
|--------|-------------|------------------|
| t3/t4g | 버스트형 (개발·블로그) | 1:4 (CPU credit 시스템) |
| m5/m6/m7 | 균형 (웹 서버, 앱 서버) | 1:4 |
| c5/c6/c7 | CPU 최적 (배치, 게임) | 1:2 |
| r5/r6/r7 | 메모리 최적 (DB, 캐시) | 1:8 |
| x1/x2 | 메모리 극단 (SAP HANA) | 1:30+ |
| i3/i4 | I/O 최적 (NoSQL, 검색) | 1:8 + NVMe |
| p4/p5 | GPU (ML training) | A100/H100 GPU |
| g4/g5 | GPU 추론·미디어 | T4/A10G |

> 🔍 **더 깊이**: Graviton(`g` suffix)은 AWS가 직접 설계한 ARM Neoverse 기반 CPU다. Graviton3(c7g, m7g, r7g)는 x86 동급 대비 20-40% 가격 성능 우위. 단 ARM 호환 컨테이너 이미지가 필요하고, x86 전용 바이너리는 동작 안 함. Docker Buildx로 multi-arch 이미지를 빌드하면 같은 이미지가 양쪽에서 동작.

### Pricing Model 5종: 시나리오별 선택

| 모델 | 할인 | 약정 | 적합 워크로드 |
|------|------|------|----------------|
| On-Demand | 0% | 없음 | 단기 테스트, 예측 불가 트래픽 |
| Reserved Instance | 최대 72% | 1년/3년 | 기준 트래픽 |
| Savings Plans | 최대 72% | 1년/3년 | 유연한 기준 트래픽 |
| Spot | 최대 90% | 없음 (2분 경고) | Stateless, fault-tolerant |
| Dedicated Host | + | 없음/약정 | BYOL 라이선스, 컴플라이언스 |

> 🎯 **시나리오**: "한 빅데이터 분석 회사가 야간 배치 ETL을 운영한다. 비용을 최소화하면서 작업 완료 SLA(다음날 09시까지)를 지키려면?" — 답: **Spot Fleet with capacity-optimized allocation strategy + 다양한 인스턴스 패밀리**. 단일 패밀리만 쓰면 그 패밀리 전체가 부족해질 때 Spot 회수가 한꺼번에 발생. 다양화하면 capacity 부족 위험 분산. SLA에 여유가 있으므로 Spot 적합.

## EBS: 분산 블록 스토리지의 실체

EBS는 EC2에 "디스크처럼 보이지만" 실제로는 **물리 디스크와 EC2 사이에 네트워크가 있다**. 이게 SAA에서 거의 안 다루는 EBS의 핵심.

```
[EC2]  ← Nitro Card (NVMe)  ← AWS 내부 SAN 네트워크 ← [EBS 서버 클러스터]
```

EBS는 한 AZ에서 **3개의 복제본**을 동기 유지하지만, AZ 경계는 못 넘는다(AZ 간 latency 때문). 따라서 **EBS는 AZ-local 리소스**이고, AZ 장애 시 그 AZ의 EBS도 함께 다운된다.

### EBS 볼륨 타입 4종

| 타입 | 카테고리 | 최대 IOPS | 최대 처리량 | 적합 워크로드 |
|------|----------|-----------|-------------|----------------|
| gp3 | SSD 범용 | 16,000 (조정 가능) | 1,000 MB/s | 대부분의 일반 워크로드 |
| gp2 | SSD 범용 (구) | 16,000 (크기 종속) | 250 MB/s | 레거시, 점차 gp3로 교체 |
| io2 Block Express | SSD 고성능 | 256,000 | 4,000 MB/s | 미션 크리티컬 DB |
| st1 | HDD 처리량 | 500 | 500 MB/s | 빅데이터, 로그 처리 |
| sc1 | HDD 콜드 | 250 | 250 MB/s | 거의 안 쓰는 백업 |

> 🔍 **더 깊이**: gp3는 2020년 출시되며 게임 체인저가 됐다. gp2는 크기에 IOPS가 묶여 있어 "3 IOPS/GB" 공식으로 1000 IOPS를 얻으려면 333GB를 사야 했다. gp3는 IOPS와 크기를 **독립적으로 프로비저닝**한다. 기본 3000 IOPS·125 MB/s를 무료 제공하고, 그 이상은 추가 비용. 평균 20% 저렴.

> 📚 **사례**: 한 핀테크가 RDS를 io1에서 io2 Block Express로 이전했다. 같은 IOPS에서 비용 30% 절감 + latency 60% 감소. io2 Block Express는 NVMe over Fabrics 기반의 새 백엔드라 sub-millisecond latency를 보장.

### EBS Multi-Attach과 io2 Block Express

io1·io2는 **Multi-Attach** 기능을 지원한다. 같은 EBS를 최대 16개 EC2에 동시 마운트 가능. 단 OS·파일시스템이 clustered filesystem이어야 함(GFS2, OCFS2, OracleRAC). 일반 ext4·NTFS는 데이터 손상 위험.

### EBS Snapshot: incremental + S3 저장

스냅샷은 **incremental**이다. 첫 스냅샷은 전체, 두 번째부터는 변경된 블록만 저장. 백엔드는 S3(고객은 직접 접근 불가). 다른 리전·계정에 공유 가능.

```bash
# 스냅샷 생성
aws ec2 create-snapshot --volume-id vol-abc --description "Daily backup"

# 다른 리전에 복사 (DR용)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 \
  --source-snapshot-id snap-xyz \
  --region us-east-1 \
  --encrypted --kms-key-id alias/aws/ebs
```

> 💡 **암기 팁**: **EBS Fast Snapshot Restore (FSR)**는 스냅샷 → 볼륨 복원 시 첫 read의 latency 페널티를 제거한다. 일반 스냅샷은 lazy load라 첫 read마다 S3에서 블록을 가져오므로 처음 며칠은 느리다. FSR을 활성화한 스냅샷은 즉시 full performance. DR 시나리오에서 RTO를 줄일 때 필수.

## ELB의 4종: 같은 이름 다른 제품

| 종류 | 레이어 | 라우팅 기준 | 적합 워크로드 |
|------|--------|-------------|----------------|
| Classic (CLB) | L4/L7 | 기본 (deprecated) | 사용 금지 |
| Application (ALB) | L7 | Host, Path, Header, Query | HTTP/HTTPS, 마이크로서비스 |
| Network (NLB) | L4 | TCP/UDP/TLS | 게임, IoT, 정적 IP 필요 |
| Gateway (GLB) | L3 | GENEVE protocol | 보안 어플라이언스 (Palo Alto, Fortinet) |

> 🔍 **더 깊이**: NLB는 **클라이언트 IP를 보존**한다. 반면 ALB는 X-Forwarded-For 헤더로만 전달. NLB는 또한 **정적 IP**(AZ당 하나)를 제공해 방화벽 화이트리스팅에 적합. 처리량은 NLB가 압도적(초당 수백만 패킷)이고 latency도 더 낮다(p99 < 100us). 단 NLB는 L4라 HTTP 헤더 기반 라우팅 불가.

> 🎯 **시나리오**: "한 게임사가 WebSocket 기반 매치메이킹을 운영한다. SSL termination을 거치고 정적 IP를 외부에 노출해야 한다. ALB와 NLB 중 무엇이 적합한가?" — 답: 단일 답이 없다. **WebSocket은 둘 다 지원**. SSL termination도 둘 다. 결정 요인은 (1) HTTP-level 라우팅 필요? → ALB, (2) 정적 IP 또는 초저지연 → NLB. WebSocket 매치메이킹은 보통 NLB가 정공.

### ALB의 고급 기능

- **Listener Rule**: Host header, Path, HTTP Method, Query String, Source IP, HTTP Header로 라우팅
- **Target Group**: EC2, IP, Lambda, Container를 묶음
- **Sticky Session**: ALB 자체 쿠키 또는 애플리케이션 쿠키 기반
- **WAF 통합**: 직접 WAF 규칙 적용
- **Cognito 통합**: ALB가 OIDC/Cognito 인증 직접 처리 (백엔드 코드 수정 불필요)

> 📚 **사례**: 한 SaaS가 ALB의 Cognito 통합으로 인증을 처리한다. 백엔드 App은 인증 코드를 거의 안 쓰고 ALB가 JWT를 검증해 사용자 정보를 X-Amzn-Oidc-Data 헤더로 전달. 단 ALB Cognito 통합은 HTTP API에만 적합하고, gRPC·WebSocket은 별도 처리 필요.

## Auto Scaling: 6가지 정책의 매뉴얼

ASG의 스케일링 정책은 SAA에서 "Target Tracking, Step, Simple, Scheduled" 4개로 알려져 있지만, Pro에서는 더 세분화된 시나리오를 묻는다.

| 정책 | 메커니즘 | 적합 워크로드 |
|------|----------|----------------|
| **Target Tracking** | 지표를 목표값에 맞추기 (CPU 50%) | 일반적 케이스 |
| **Step Scaling** | 알람 임계치별 다른 스케일 액션 | 급격한 트래픽 변화 |
| **Simple Scaling** | 알람 한 번에 한 액션 (Deprecated 추세) | 단순 |
| **Scheduled** | 정해진 시간에 capacity 조정 | 예측 가능한 패턴 (블랙프라이데이) |
| **Predictive** | ML 기반 미래 예측 | 정기 패턴 + 갑작스러운 spike |
| **Warm Pool** | 미리 시작·정지된 인스턴스 풀 유지 | 빠른 스케일 아웃 필요 |

> 🔍 **더 깊이**: **Warm Pool**(2021년 출시)은 EC2를 미리 부팅·구성 완료 후 stopped 상태로 유지한다. 스케일 아웃 시 stopped → running으로 시작하므로 OS 부팅·앱 초기화 시간을 절약한다. 콜드 스타트가 5분 이상 걸리는 워크로드(예: ML 모델 로드)에서 효과적. 단 stopped 인스턴스도 EBS 스토리지 비용 발생.

> 🎯 **시나리오**: "한 e-commerce가 매일 09시 09분에 트래픽이 10배 spike한다(타임 세일). 5분 안에 스케일 아웃해야 SLA를 지킨다. 어떤 정책이 적합한가?" — 답: **Scheduled Scaling으로 09:05에 미리 스케일 아웃 + Target Tracking으로 후속 조정**. Predictive도 가능하지만 단일 시간 spike에는 Scheduled가 더 확실. Warm Pool 추가로 부팅 시간 단축.

### Lifecycle Hooks: 시작·종료 시 코드 실행

ASG가 인스턴스를 시작·종료할 때 **Lifecycle Hook**으로 잠시 멈춰 사용자 코드를 실행할 수 있다.

```
[ASG: scale out 결정]
       ↓
[EC2 인스턴스 시작]
       ↓
[Lifecycle Hook: Pending:Wait 상태]   ← 여기서 SQS/SNS로 메시지 전송
       ↓ (사용자 코드 완료)
[Pending → InService]
       ↓
[정상 트래픽 수신]
```

사용 사례: 인스턴스에 ECS 클러스터 등록, ELB에 등록 전 헬스체크, 모니터링 에이전트 설치 완료 대기. 종료 시에도 비슷하게 트래픽 드레인 후 종료 가능.

## Placement Group: 인스턴스 배치 전략

| 종류 | 배치 | 적합 워크로드 |
|------|------|----------------|
| Cluster | 같은 AZ·같은 rack | HPC, 저지연 (NIC 25/100Gbps) |
| Spread | 다른 rack | 격리, 7개/AZ 제한 |
| Partition | 7개 partition까지 | HDFS, Cassandra |

> 📚 **사례**: 한 ML 회사가 분산 트레이닝에 Cluster Placement Group + p4d 인스턴스를 사용. 400Gbps EFA(Elastic Fabric Adapter) 네트워크로 multi-node training에서 GPU 간 통신이 NVLink 수준에 근접. 단 Cluster PG는 같은 AZ에 묶이므로 AZ 장애에 취약하고, 단일 PG에서 capacity 부족하면 spot 없음.

## 정리하며

EC2·EBS·ELB·Auto Scaling은 SAA에서 익숙한 4종이지만, Pro에서는 Nitro·gp3·NLB 정적 IP·Warm Pool 같은 깊이 있는 차이를 알아야 한다. 가격 모델 5종, EBS 타입 4종, ELB 4종, ASG 정책 6종 — 이 19개의 trade-off matrix를 머리에 박는 것이 오늘의 핵심이다.

다음 글은 1주차 복습 + 시나리오 10문항으로 마무리한다. 한 주 동안 본 IAM·VPC·EC2를 한 시나리오에 동시에 녹여 풀어보는 연습이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 야간 ETL 배치에 c5.4xlarge 100대를 4시간 운영한다. 비용을 최대로 절감하면서 SLA(다음날 09시까지 완료)를 만족하려면?

A) 100대 On-Demand
B) 100대 3-year RI
C) Spot Fleet with diverse instance families
D) 50대 RI + 50대 Spot

**정답: C**
해설: 키워드는 "야간만 4시간" + "최대 절감" + "SLA에 여유". RI(B)는 24시간 가동을 가정해 야간만 4시간 사용 시 손해. Spot Fleet에 다양한 패밀리(c5, c5n, c5a, m5)를 섞으면 한 패밀리 capacity 부족 시 다른 것으로 대체되어 회수율 낮음. 워크로드가 stateless·재시작 가능하면 Spot이 압도적.

---

**문제 2.** 한 핀테크 production DB가 RDS io1으로 운영되고 있다. 비용을 줄이면서 latency를 개선하려면?

A) gp3로 다운그레이드
B) io2 Block Express로 전환
C) Aurora로 마이그레이션
D) gp2로 전환

**정답: B**
해설: io2 Block Express는 같은 IOPS에서 io1보다 약 30% 저렴 + sub-millisecond latency. NVMe over Fabrics 기반의 새 백엔드. A·D는 IOPS 한계로 production DB에 부적합. C는 큰 변경.

---

**문제 3.** 한 게임사가 WebSocket 매치메이킹을 운영한다. 정적 IP 2개를 외부에 노출, SSL termination 처리, 초당 100만 패킷 처리. 적합한 로드 밸런서는?

A) ALB
B) NLB
C) CLB
D) ALB + Global Accelerator

**정답: B**
해설: 키워드는 "정적 IP" + "초당 100만 패킷" + "WebSocket". NLB는 AZ당 정적 IP 제공, L4라 패킷 처리량 압도적. WebSocket은 L4·L7 둘 다 가능하지만 NLB가 latency 우위. ALB도 WebSocket 지원하나 정적 IP 없음. D는 ALB의 정적 IP를 GA가 제공하지만 NLB 단독보다 비용 큼.

---

**문제 4.** 한 회사가 매일 10시 정각에 트래픽이 5배 spike한다. ASG의 스케일 아웃이 5분 걸려 처음 5분은 응답 지연. 어떻게 개선하는가?

A) Target Tracking을 더 공격적으로 설정
B) Scheduled Scaling으로 09:55에 미리 스케일 아웃 + Warm Pool
C) Step Scaling
D) Predictive Scaling만 활성화

**정답: B**
해설: 예측 가능한 시간 spike → Scheduled + Warm Pool 조합. Warm Pool은 stopped 인스턴스를 미리 부팅 완료 상태로 유지해 시작 시간을 수십 초로 단축. Predictive는 정기 패턴 학습이라 단일 spike에는 Scheduled가 더 확실.

---

**문제 5.** 한 회사가 HPC 워크로드에서 인스턴스 간 latency를 최소화하려고 한다. 어떻게 배치하는가?

A) Spread Placement Group
B) Cluster Placement Group + EFA enabled instances
C) Partition Placement Group
D) Multi-AZ ASG

**정답: B**
해설: 같은 AZ·같은 rack에 묶어 latency 최소화. EFA(Elastic Fabric Adapter)는 OS bypass로 RDMA 수준의 통신 가능. 단 같은 AZ라 가용성은 떨어짐(HPC는 보통 stateless·재실행 가능).

---

**문제 6.** EBS Multi-Attach의 제약은?

A) gp3만 지원
B) io1/io2만 지원 + clustered filesystem 필요
C) 무제한 인스턴스 동시 마운트
D) 다른 AZ에도 마운트 가능

**정답: B**
해설: io1/io2 Provisioned IOPS만 지원. 최대 16개 EC2 동시 마운트. 일반 ext4·NTFS는 데이터 손상 위험, GFS2·OCFS2·OracleRAC 같은 clustered filesystem 필요. 같은 AZ 내에서만.

---

**문제 7.** 한 회사가 ALB 뒤에 인증을 적용하려 한다. 백엔드 코드 수정을 최소화하려면?

A) 백엔드에 Cognito SDK 직접 통합
B) ALB의 Cognito 통합 활성화 (Listener Rule)
C) 별도 API Gateway로 인증
D) Lambda Authorizer

**정답: B**
해설: ALB가 직접 OIDC/Cognito 인증을 처리하고 사용자 정보를 X-Amzn-Oidc-Data 헤더로 백엔드에 전달. 백엔드 코드 거의 수정 불필요. 단 HTTP 기반에만 적합, gRPC·WebSocket은 별도.
