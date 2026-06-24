# Day 5 - Week 3 종합 복습: EC2·스토리지·ELB·ASG를 하나의 아키텍처로 연결하기

이번 주는 AWS 컴퓨팅과 스토리지 계층의 핵심을 다뤘다. EC2 인스턴스 패밀리와 구매 옵션(Day 11), EBS·Instance Store·EFS·FSx의 스토리지 선택 원리(Day 12), ALB·NLB·GLB의 로드 밸런싱 계층(Day 13), ASG 스케일링 정책과 운영 기법(Day 14). 이 네 가지는 독립된 서비스가 아니라 하나의 아키텍처 패턴을 구성하는 부품들이다.

복습의 목표는 각각을 따로 외우는 것이 아니라, "주어진 요구사항에서 어떤 조합이 최적인가"를 판단하는 능력을 키우는 것이다. SAA 시험은 단일 서비스 지식이 아니라 트레이드오프 판단을 묻는다.

## 이번 주 핵심 개념의 연결 고리

이 네 개 영역은 어떻게 하나로 연결되는가.

EC2 인스턴스를 선택하면(패밀리와 구매 옵션), 그 인스턴스에 어떤 스토리지를 붙일지 결정한다(EBS/Instance Store/공유 파일 시스템). 여러 인스턴스에 트래픽을 분산하려면 ELB를 앞에 둔다(ALB/NLB/GLB). 그리고 트래픽에 따라 인스턴스 수를 자동 조절하는 것이 ASG다.

```
[ Week 3 개념 연결 구조 ]

요구사항 분석
    ↓
┌─────────────────────────────────────────────────────┐
│ 워크로드 특성 → 인스턴스 패밀리 (Day 11)            │
│ 비용/약정 → 구매 옵션 (Day 11)                      │
│ 데이터 영속성/공유 → 스토리지 종류 (Day 12)          │
│ 트래픽 종류 → ELB 종류 (Day 13)                     │
│ 부하 변동 패턴 → 스케일링 정책 (Day 14)              │
└─────────────────────────────────────────────────────┘
    ↓
최적 아키텍처 선택
```

## 핵심 비교표: 한눈에 정리

### 인스턴스 패밀리 선택 기준

| 병목 자원 | 패밀리 | 대표 워크로드 | 주의점 |
|----------|--------|-------------|--------|
| CPU 집약 | C | 인코딩, ML 추론, 배치 | Graviton(c7g)이 25% 저렴 |
| 범용 | M | 앱 서버, 캐시 | 첫 번째 선택지 |
| 메모리 | R | 인메모리 DB, SAP | 대용량 RAM이 핵심 |
| 메모리(극단) | X | SAP HANA 수 TB | 비용 매우 높음 |
| 로컬 NVMe | I | NoSQL, Kafka 브로커 | 데이터 손실 고려 |
| GPU 학습 | P | LLM pre-training | H100/A100 |
| GPU 추론 | G | ML 추론, 렌더링 | A10G |
| 변동 부하 | T | 개발, 마이크로서비스 | T Unlimited 비용 주의 |
| ARM 절감 | *g 접미사 | 오픈소스 스택 전반 | 상용 SW 호환 확인 |

### 구매 옵션 트레이드오프

| 옵션 | 약정 | 최대 절감 | 사용 조건 |
|------|------|---------|---------|
| On-Demand | 없음 | 0% | 단기, 예측 불가 |
| Compute SP | 1/3년 | ~66% | 패밀리·리전·OS 변경 가능 |
| EC2 Instance SP | 1/3년 | ~72% | 패밀리 고정, 크기 자유 |
| Standard RI | 1/3년 | ~72% | 타입 고정 |
| Spot | 즉시 | ~90% | Stateless, 중단 허용 |
| Dedicated Host | 1/3년 | - | BYOL 라이선스 |
| Capacity Reservation | 없음 | 0% | 용량만 확보 |

### 스토리지 결정 트리

```
EC2 한 대만?
    └─ 영속성 필요?
        ├─ NO: Instance Store (NVMe, 최고 성능)
        └─ YES: EBS
               ├─ 기본: gp3 (IOPS·Throughput 독립, gp2보다 20% 저렴)
               ├─ OLTP 고성능: io2 (최대 64K IOPS)
               └─ 미션 크리티컬: io2 Block Express (최대 256K IOPS)

여러 EC2 공유?
    ├─ Linux NFS: EFS (자동 확장, Multi-AZ)
    ├─ Windows SMB + AD: FSx for Windows
    ├─ HPC/ML 병렬 + S3 연동: FSx for Lustre
    └─ NetApp 마이그레이션 / 멀티 프로토콜: FSx for ONTAP

객체 스토리지 / HTTP API: S3
```

### ELB 3종 선택 기준

| 키워드 | 정답 | 이유 |
|--------|------|------|
| HTTP 경로/호스트/헤더 라우팅 | ALB | L7 컨텐츠 기반 |
| WAF 통합 | ALB | WAF는 ALB에 붙임 |
| gRPC, HTTP/2 | ALB | NLB는 TCP만 |
| WebSocket 세션 | ALB | Sticky 지원 |
| UDP, 게임 서버 | NLB | L4 UDP 지원 |
| 고정 IP, EIP, 파트너 화이트리스트 | NLB | AZ당 EIP |
| 초저지연 (μs) | NLB | L4 처리 |
| TCP 커스텀 프로토콜 | NLB | HTTP 아님 |
| NGFW/IPS/DPI 체이닝 | GLB | GENEVE L3 |
| 보안 어플라이언스 Auto Scaling | GLB | 어플라이언스 관리 |

### ASG 스케일링 정책 비교

| 정책 | 동작 원리 | 사용 시나리오 |
|------|---------|-------------|
| Target Tracking | 목표값 자동 추적 (PI 제어) | 권장, 대부분 상황 |
| Predictive | ML로 사전 확장 | 주기적 패턴 |
| Scheduled | 시간 기반 사전 설정 | 예측 가능한 패턴 |
| Step | 단계별 스케일링 크기 | 세밀 제어 필요 |
| Simple | 단순 +/- N | 레거시, 피할 것 |

## 빈출 함정 7가지

**함정 1. Instance Store를 DB에 쓰는 경우**
시험에서 "가장 빠른 스토리지"라는 미끼로 Instance Store를 데이터베이스에 쓰는 답을 제시한다. Instance Store는 인스턴스 중지/종료 시 데이터가 사라지므로 DB에 절대 쓰면 안 된다. 단, Cassandra·MongoDB처럼 복제(replication)로 내구성을 보장하는 분산 DB의 노드 디스크로는 사용 가능하다.

**함정 2. EFS를 Windows AD 파일 공유에 쓰는 경우**
EFS는 NFSv4.1 기반 Linux 전용이다. Windows Active Directory 통합, SMB 프로토콜, NTFS ACL이 필요하면 FSx for Windows File Server다.

**함정 3. gp2 볼륨이 이미 최대 IOPS라는 착각**
gp2의 IOPS는 크기에 비례한다(1GB = 3 IOPS). 100GB gp2는 300 IOPS가 최대다. 더 많은 IOPS가 필요하면 gp3로 전환해서 독립적으로 IOPS를 프로비저닝한다. gp3 전환은 다운타임 없이 즉시 가능하다.

**함정 4. ALB에 고정 IP를 기대하는 경우**
ALB는 DNS 이름만 있고 IP가 변한다. 파트너 방화벽 화이트리스트에 ALB IP를 등록하는 것은 불가능하다. NLB + EIP가 정답이다. Global Accelerator도 2개의 고정 Anycast IP를 제공하지만, 질문에 Global Accelerator가 명시되지 않으면 NLB + EIP가 더 단순한 답이다.

**함정 5. ASG의 EC2 헬스 체크만으로 앱 장애를 감지하는 경우**
EC2 헬스 체크는 물리/OS 상태만 본다. 앱이 크래시해도 EC2는 Running 상태이므로 교체가 안 된다. ALB 뒤에서 운영하면 반드시 ELB Health Check 타입을 ASG에 활성화해야 한다.

**함정 6. Spot 인스턴스를 Stateful 워크로드에 쓰는 경우**
"최대 절감"이 요구사항에 있어도, Stateful 워크로드(DB 마스터, 세션 서버, 라이선스 서버)에 Spot은 오답이다. 2분 통지 후 언제든 사라질 수 있기 때문이다. Stateless(배치, 빅데이터, ML 학습 체크포인트)에만 Spot이 정답이다.

**함정 7. NLB Cross-Zone이 기본 ON이라는 착각**
ALB는 Cross-Zone이 기본 ON(추가 비용 없음)이지만, NLB와 GLB는 기본 OFF다. NLB에서 AZ별 타겟 수가 불균등하면 트래픽 분배가 편향된다. Cross-Zone 활성화는 추가 데이터 전송 비용이 발생한다.

## 서비스 간 상호작용 패턴

실제 아키텍처에서는 이 서비스들이 조합되어 동작한다. 대표적인 패턴들을 이해해야 시나리오 문제가 풀린다.

**패턴 A: 표준 3계층 웹 서비스**
```
인터넷 → ALB(Multi-AZ, HTTPS, WAF)
              ↓ Host/Path 라우팅
         ASG (EC2, Mixed Instances, Spot 60% + OD 40%)
              ↓
         EBS gp3 (애플리케이션 데이터)
         EFS (공유 설정, 업로드 파일)
              ↓
         RDS Multi-AZ (읽기는 Read Replica)
```

**패턴 B: ML 학습 플랫폼**
```
S3 (학습 데이터) ←→ FSx for Lustre (S3 연동)
                          ↓ (POSIX API, 수백 GB/s)
                   EC2 Spot (p4d.24xlarge, GPU)
                   [Lifecycle Hook: 체크포인트 저장]
                          ↓
                   S3 (모델 체크포인트)
```

**패턴 C: B2B API 서비스 (고정 IP 요구)**
```
파트너 → NLB (EIP 화이트리스트)
              ↓ (TCP 443)
         EC2 ASG (Target Tracking)
              ↓
         RDS + ElastiCache
```

**패턴 D: 엔터프라이즈 보안 체인**
```
인터넷 → Transit Gateway → GLB → Palo Alto NGFW (ASG)
                                       ↓ (검사 통과)
                                ALB → EC2 ASG → RDS
```

**패턴 E: HPC 클러스터**
```
EC2 c7g.metal (Cluster Placement Group)
    ├─ EFA (OS-bypass 네트워킹, 100Gbps)
    ├─ FSx for Lustre (POSIX, 초고속 병렬 I/O)
    └─ Instance Store (임시 스크래치)
```

## 비용 최적화 패턴 정리

시나리오에서 "비용 최적화"가 나오면 이 프레임워크로 분석한다.

```
1. 워크로드 분류
   - Stateless + 중단 허용 → Spot (최대 90% 절감)
   - 예측 가능한 기반 부하 → Compute SP 또는 RI
   - 단기/예측 불가 → On-Demand

2. 인스턴스 Right-sizing
   - Graviton(ARM) 가능 여부 확인 (25% 절감)
   - 실제 CPU/메모리 사용률로 패밀리 선택

3. 스토리지 최적화
   - gp2 → gp3 전환 (20% 절감)
   - EFS IA Lifecycle Policy (장기 미접근 파일 자동 티어링)
   - S3 Intelligent-Tiering 또는 Glacier

4. 사용 패턴 최적화
   - 야간 개발/테스트 ASG 스케줄 종료
   - Reserved Instance 적용 전 CloudWatch 실사용 데이터 분석
```

## 복원력(Reliability) 설계 패턴

시나리오에서 "한 AZ 장애에도 서비스 유지"가 나오면:

```
필수 체크리스트:
□ ALB: Multi-AZ 서브넷 (최소 2개 AZ)
□ ASG: Min=2 이상, 여러 AZ 서브넷 등록
□ RDS: Multi-AZ 배포 (synchronous replication)
□ ElastiCache: Redis Cluster Mode Enabled (Multi-AZ)
□ EFS: Multi-AZ 마운트 타겟
□ S3: 기본적으로 Multi-AZ 내구성 (별도 설정 불필요)
```

"리전 전체 장애에도 서비스 유지"가 나오면:
```
추가 필수:
□ Route 53 Health Check + Failover 레코드
□ RDS Cross-Region Read Replica (수동 promote)
  또는 Aurora Global Database (RPO < 1초)
□ S3 Cross-Region Replication
□ CloudFront (엣지 캐시로 오리진 장애 버퍼링)
□ 두 번째 리전에 ASG + EC2 예비 스택
```

---

## 📝 시나리오 연습 문제

**문제 1.** 글로벌 이커머스 플랫폼이 AWS 서울 리전에서 운영 중이다. 다음 요구사항을 모두 만족하는 아키텍처를 설계하라.
- 월-금 오전 8-18시에 트래픽이 평소의 5배
- 단일 AZ 장애 시 서비스 중단 없어야 함
- 비용을 최소화하면서 기반 용량 보장
- SQL Injection 공격 방어 필요

A) On-Demand EC2 + ALB(Single-AZ) + RDS Single-AZ + Shield Standard
B) Spot EC2 ASG(Multi-AZ) + ALB(WAF) + RDS Multi-AZ + Scheduled Scaling + Compute SP(기반 부하)
C) RI 3y(모든 EC2) + NLB(Multi-AZ) + RDS Multi-AZ + Target Tracking
D) Dedicated Host EC2 + ALB(WAF) + RDS Multi-AZ + Manual Scaling

**정답: B**
해설: 월-금 패턴은 Scheduled Scaling으로 미리 확장하고, 기반 부하는 Compute SP(약정 절감), 피크 초과분은 Spot으로 처리한다. ALB + WAF로 SQL Injection 방어. Multi-AZ ASG + RDS Multi-AZ로 단일 AZ 장애 대응. A는 Single-AZ라 장애 대응 실패. C는 NLB에 WAF 적용 불가. D는 Manual Scaling이 비용·탄력성 모두 비효율적이다.

---

**문제 2.** 한 회사가 온프레미스 NetApp ONTAP 스토리지에서 AWS로 마이그레이션한다. Linux 서버와 Windows 서버가 모두 같은 파일 시스템에 접근해야 하고, 온프레미스에서 SnapMirror로 동기화하면서 점진적으로 이전할 계획이다. 또한 이전 완료 후에는 NFS와 SMB 모두 지원해야 한다. 어떤 서비스가 적합한가?

A) EFS (NFSv4.1 기반)
B) FSx for Windows File Server (SMB 기반)
C) FSx for NetApp ONTAP
D) FSx for OpenZFS

**정답: C**
해설: FSx for NetApp ONTAP은 NFS, SMB, iSCSI 멀티 프로토콜을 동시 지원한다. 온프레미스 NetApp과 SnapMirror 복제가 가능해 점진적 마이그레이션이 자연스럽다. WAFL 파일 시스템 기반 스냅샷, 씬 프로비저닝, 중복 제거 등 NetApp 고유 기능도 그대로 사용 가능하다. EFS는 NFS만, FSx Windows는 SMB만, OpenZFS는 NFS만 지원한다.

---

**문제 3.** 금융 트레이딩 회사가 새 주문 시스템을 AWS로 이전한다. 요구사항: (1) 네트워크 레이턴시 최소화 (μs 단위), (2) 파트너 시스템의 방화벽에서 고정 IP를 화이트리스트에 등록해야 함, (3) FIX 프로토콜(TCP 기반 커스텀 프로토콜) 사용, (4) 각 주문 처리 서버 간 MPI 통신. 가장 적합한 아키텍처는?

A) ALB(Multi-AZ) + EC2 ASG(Spread Placement Group)
B) NLB(EIP) + EC2 Cluster Placement Group(EFA) + Nitro 인스턴스
C) Global Accelerator + ALB + EC2 ASG
D) GLB + NLB + EC2 ASG

**정답: B**
해설: FIX 프로토콜(TCP 커스텀) + 파트너 고정 IP → NLB + EIP. 서버 간 MPI 저지연 통신 → Cluster Placement Group + EFA(OS-bypass 네트워킹). Nitro 인스턴스는 I/O 오버헤드를 하드웨어로 오프로드해 레이턴시를 최소화한다. ALB는 HTTP/HTTPS만 라우팅하며 FIX 프로토콜과 호환되지 않는다. Spread는 격리 목적이라 MPI 저지연과 반대다.

---

**문제 4.** 스타트업이 새 SaaS 제품을 출시한다. 초기에는 트래픽이 매우 적지만, 성공 시 수십 배로 급증할 수 있다. 서비스 중단 없이 1년 내 아무때나 발생할 수 있는 급증을 처리하고, 비용은 최소화해야 한다. 장기적으로는 3년 이상 운영 예정이다.

A) Reserved Instance 3년 + Multi-AZ ASG
B) On-Demand만 + Manual Scaling
C) Compute Savings Plans 3년(기반) + Spot(피크 대응) + Target Tracking ASG
D) Spot 100% + Target Tracking ASG + Multi-AZ

**정답: C**
해설: 3년 운영 예정이지만 초기 트래픽 패턴이 불확실하므로 Compute SP(패밀리·리전 변경 자유)가 RI보다 적합하다. 기반 부하는 Compute SP로 절감하고, 급증 구간은 Spot으로 처리한다. Target Tracking ASG가 자동으로 스케일을 조절한다. Spot 100%는 Stateless 워크로드에만 적합한데, SaaS 서비스는 세션 상태가 있을 수 있다. B는 비용과 탄력성 모두 비효율적이다.

---

**문제 5.** 한 회사가 EC2에서 EBS gp2 볼륨(200GB)을 사용하는 PostgreSQL 데이터베이스를 운영한다. DBA가 분석하니 평균 IOPS 사용량이 800, 피크가 2,000이며, gp2의 최대 IOPS인 600(200GB × 3)을 초과하고 있어 성능 저하가 발생한다. 가장 비용 효율적인 해결책은?

A) gp2 볼륨을 1,000GB로 확장
B) gp2를 io2로 전환 (2,000 IOPS 프로비저닝)
C) gp3로 전환하고 IOPS를 3,000으로 설정
D) 인스턴스에 두 번째 gp2 볼륨을 추가해 RAID 0 구성

**정답: C**
해설: gp3는 크기와 무관하게 최대 16,000 IOPS를 독립적으로 설정할 수 있으며, gp2보다 20% 저렴하다. 피크 2,000 IOPS가 필요하므로 3,000 IOPS로 설정하면 충분하다. A(gp2 확장)는 1,000GB × 3 = 3,000 IOPS를 위해 불필요하게 큰 볼륨을 사야 한다. io2는 64K IOPS가 필요한 미션 크리티컬 환경용으로 gp3보다 훨씬 비싸다. RAID 0은 복잡도와 관리 오버헤드가 높다.

---

**문제 6.** Auto Scaling Group으로 운영되는 웹 서버가 새 인스턴스를 시작할 때마다 다음 작업이 필요하다: Parameter Store에서 DB 연결 정보를 가져오고, 설정 파일 생성 후 앱을 시작하고, 레디스 캐시를 워밍업한다. 이 전체 과정이 4분 걸린다. 4분이 완료되기 전에 ALB 트래픽이 들어오면 오류가 발생한다. 가장 적절한 설정은?

A) Health Check Grace Period = 0, Slow Start = 240초
B) Health Check Grace Period = 240초, ALB Target Group Slow Start = 120초
C) Lifecycle Hook (Pending:Wait) + complete-lifecycle-action 호출 + Slow Start = 120초
D) User Data 스크립트에 4분 sleep 추가

**정답: C**
해설: Lifecycle Hook Pending:Wait으로 4분간의 초기화를 완료한 후 `complete-lifecycle-action SUCCESS`를 호출해 InService로 전환한다. 이 단계까지 ALB 헬스 체크 실패가 발생해도 Grace Period로 보호된다. InService 전환 후 Slow Start(120초)로 점진적 트래픽을 받아 안정화한다. Health Check Grace Period만 240초로 설정하면 이 시간이 지난 후 ALB 헬스 체크가 갑자기 많은 트래픽을 보낼 수 있다. User Data sleep은 안티패턴으로 리소스를 낭비한다.

---

**문제 7.** 회사가 온프레미스 물리 서버를 AWS로 이전한다. 이전 대상 중에는 SQL Server Enterprise 라이선스(소켓 단위 과금)와 Oracle DB(CPU 코어 단위 과금)가 있다. BYOL로 라이선스를 AWS에서 사용하려면?

A) EC2 Dedicated Instance
B) EC2 Dedicated Host
C) EC2 Spot 인스턴스 (저렴한 옵션)
D) EC2 On-Demand (일반 공유 호스트)

**정답: B**
해설: SQL Server 소켓 과금과 Oracle Core 과금은 모두 물리 CPU 소켓/코어 수를 기준으로 라이선스가 계산된다. Dedicated Host는 특정 물리 서버를 점유하고 그 서버의 소켓 수, 코어 수를 AWS가 공개한다. Dedicated Instance는 같은 계정 내 물리 호스트 격리는 하지만 어느 물리 서버인지 보이지 않아 라이선스 카운팅에 쓸 수 없다. 공유 호스트(On-Demand 일반)에서는 물리 코어 수를 알 수 없으므로 BYOL 라이선스 적용이 불가하다.

---

**문제 8.** 동영상 스트리밍 서비스가 사용자 업로드 비디오를 처리하는 파이프라인을 운영한다. 비디오 인코딩 잡은 CPU 집약적이고 30-120분 소요된다. 인코딩 잡이 중단되면 마지막 체크포인트(S3에 10분마다 저장)에서 재시작 가능하다. 비용을 최대한 줄이면서 안정적으로 운영하려면?

A) c6i.8xlarge On-Demand EC2 + SQS 메시지 큐
B) c7g.8xlarge Spot EC2 + SQS + EventBridge Spot 인터럽션 핸들러
C) c6i.8xlarge RI 1년 + SQS
D) Fargate Spot(vCPU = 8) + SQS

**정답: B**
해설: 비디오 인코딩은 CPU 집약(C 패밀리). c7g는 Graviton3 ARM으로 c6i(x86) 대비 25% 저렴하다. 체크포인트가 있으므로 Spot 인터럽션 허용 가능. EventBridge로 `EC2 Spot Instance Interruption Warning` 이벤트를 감지해 SQS 메시지를 재투입하면 다른 Spot 인스턴스가 이어서 처리한다. SQS가 작업 큐 역할을 해서 여러 인코딩 인스턴스에 잡을 분산한다. RI는 30-120분짜리 잡이 항상 켜져 있는 구조가 아니면 비효율적이다.

---

**문제 9.** 다음 중 ASG에서 Spot 인스턴스 인터럽션 시 가용성을 최대화하는 설정 조합은?

A) `lowest-price` Spot 전략 + 단일 인스턴스 타입
B) `capacity-optimized` Spot 전략 + 여러 인스턴스 타입 + Capacity Rebalancing 활성화
C) `diversified` Spot 전략 + 단일 AZ
D) `lowest-price` Spot 전략 + On-Demand 100% 기반

**정답: B**
해설: `capacity-optimized`는 AWS에서 현재 여유 용량이 가장 많은 Spot 풀을 선택해 인터럽션 확률을 최소화한다. 여러 인스턴스 타입을 허용하면 어느 타입에 Spot 압박이 와도 나머지 타입이 커버한다. Capacity Rebalancing은 인터럽션 경고 시 미리 대체 인스턴스를 시작해 수량을 유지한다. `lowest-price`는 가장 싼 풀에 몰려 인터럽션이 집중될 수 있다. 단일 AZ는 AZ 장애 또는 해당 AZ Spot 부족 시 전체 다운 위험이 있다.

---

**문제 10.** 한 회사가 10TB 규모의 데이터 분석을 매주 일요일 새벽 2시에 실행한다. 분석에는 대용량 RAM(256GB)이 필요하고, 분석 결과는 S3에 저장한다. 분석 잡은 중단 불가이며, 완료 후 인스턴스는 종료해도 된다. 가장 비용 효율적인 방법은?

A) r6i.16xlarge(256GB RAM) On-Demand, 매주 수동 시작/종료
B) r6i.16xlarge Spot + 체크포인트, Scheduled Scaling
C) r7g.16xlarge On-Demand, Scheduled Scaling으로 자동 시작/종료
D) r6i.16xlarge Reserved Instance 1년 + Scheduled Scaling

**정답: C**
해설: 분석 잡이 중단 불가이므로 Spot은 부적합하다. r7g는 Graviton3 ARM으로 r6i(Intel x86)보다 약 25% 저렴하다. Scheduled Scaling으로 매주 일요일 새벽 2시에 Desired를 1로 올리고, 완료 후 0으로 줄이면(ASG는 0이 불가하므로 Min=0으로 설정 또는 EventBridge + Lambda로 종료) 사용 시간만큼만 비용을 낸다. RI 1년은 주당 몇 시간만 사용하는 패턴에서 나머지 시간을 낭비한다(주당 4시간 사용 시 사용률 2.4%). Graviton 호환 여부는 Python/Java 기반 분석 도구라면 대부분 문제없다.

---

**문제 11.** 다중 계정 환경에서 두 팀이 같은 `ap-northeast-2a` AZ에 리소스를 배치해서 Cross-AZ 비용 없이 VPC 피어링을 활용하려 한다. 그런데 실제 물리 AZ가 다를 수 있다는 우려가 있다. 어떻게 확인해야 하는가?

A) AZ 이름(`ap-northeast-2a`)이 같으면 같은 물리 AZ이다
B) AZ ID(`apne2-az1` 같은 형식)가 같으면 같은 물리 AZ이다
C) 두 계정에서 같은 서브넷 CIDR을 사용하면 같은 AZ이다
D) AWS Support에 문의해야만 확인 가능하다

**정답: B**
해설: AWS는 계정별로 AZ 이름과 실제 물리 AZ의 매핑을 의도적으로 셔플한다. 계정 A의 `ap-northeast-2a`와 계정 B의 `ap-northeast-2a`는 다른 물리 AZ일 수 있다. AZ ID(예: `apne2-az1`)는 모든 계정에서 동일한 물리 AZ를 가리킨다. CLI로 `aws ec2 describe-availability-zones --query 'AvailabilityZones[*].[ZoneName,ZoneId]'`를 실행해 AZ ID를 비교해야 한다. 같은 AZ ID면 같은 물리 AZ이므로 피어링 트래픽에 Cross-AZ 요금이 부과되지 않는다.

---

**문제 12.** 다음 중 SAA 시험에서 잘못된 선택의 대표적 패턴을 모두 고르시오.

A) DB 마스터 서버에 Spot 인스턴스 사용
B) Windows AD 파일 공유에 EFS 사용
C) 고정 IP가 필요한 파트너 API에 NLB + EIP 사용
D) HPC MPI 클러스터에 Cluster Placement Group + EFA 사용
E) gp2를 gp3로 전환해 IOPS와 비용 동시 최적화
F) 새 인스턴스 시작 시 Lifecycle Hook으로 초기화 완료 후 InService

**정답: A, B (잘못된 선택)**
해설: A - Spot은 Stateful 워크로드(DB 마스터)에 부적합. 2분 통지 후 인스턴스가 사라지면 DB 데이터와 세션이 손실된다. B - EFS는 NFSv4.1 Linux 전용이다. Windows AD 통합, SMB, NTFS ACL을 위해서는 FSx for Windows File Server가 필요하다. C, D, E, F는 모두 올바른 선택이다.