# Day 12 - EBS vs Instance Store: 영속성과 성능의 교환, 그리고 파일 시스템의 선택

스토리지 선택 실수는 조용히 큰 대가를 치른다. EC2 인스턴스 스토어에 저장한 데이터가 인스턴스 종료와 함께 사라지거나, EBS gp2를 쓰다가 IOPS 한계에 부딪혀 데이터베이스가 멈추거나, EFS 대신 FSx for Windows를 써야 했는데 Linux 마운트를 고집하다 AD 인증이 안 되는 상황이 그 예다. 이런 선택 오류는 대부분 "어떻게 동작하는지"를 몰라서 생긴다.

이 글에서는 EBS의 볼륨 타입별 내부 설계 원리(IOPS 계산, gp3 vs gp2 차이), Instance Store의 물리적 구조와 데이터 손실 시나리오, EFS의 분산 파일 시스템 구조, FSx 4종의 각각의 존재 이유를 다룬다. 스토리지 시스템 이론부터 실제 사고 사례까지 연결해서 읽으면 시험 시나리오가 읽히는 구조가 된다.

## EBS의 역사: 네트워크 블록 스토리지가 왜 필요했나

EC2 초기에는 모든 스토리지가 인스턴스 스토어였다. 물리 서버에 붙은 로컬 디스크를 그대로 썼고, 인스턴스를 종료하면 데이터도 사라졌다. 개발자들은 중요한 데이터를 S3에 수동으로 백업해야 했다.

2008년 AWS는 EBS(Elastic Block Store)를 출시했다. 핵심 아이디어는 **블록 스토리지를 네트워크로 분리**한다는 것이었다. 인스턴스와 스토리지가 논리적으로 분리되면 인스턴스가 종료되어도 데이터가 살아있고, 한 인스턴스에서 분리해 다른 인스턴스에 재연결할 수 있다. 이것이 "Elastic"이라는 이름의 의미다.

EBS의 물리적 구조는 같은 AZ 안의 별도 스토리지 서버들로 이루어진다. 볼륨의 데이터는 여러 스토리지 서버에 분산 저장되어 단일 서버 장애를 견딘다. EC2 인스턴스는 Nitro 카드를 통해 NVMe-over-TCP 프로토콜로 EBS에 접근한다.

> 🔍 **더 깊이**: EBS와 EC2 인스턴스 간 통신은 NVMe over TCP를 사용하지만, 이 경로가 Nitro 카드에 오프로드되어 인스턴스 CPU를 소비하지 않는다. 단, 이 네트워크 경로는 인스턴스의 전체 네트워크 대역폭을 공유하지 않고 별도 최적화된 통로를 쓴다. EBS 전용 대역폭(EBS-Optimized)이 이 경로를 보장한다. m6i.xlarge 기준 최대 4750 Mbps를 EBS에 할당할 수 있다.

## EBS 볼륨 타입: 설계 원리와 숫자의 의미

### gp2 vs gp3: 왜 gp3가 더 좋은가

gp2는 2014년 출시된 1세대 SSD 타입으로, IOPS가 **볼륨 크기에 연동**된다. 1GB당 3 IOPS, 최대 16,000 IOPS. 처음에는 "더 큰 볼륨 = 더 빠름"이라는 단순한 모델이 합리적으로 보였다. 그러나 실제로는 IOPS가 필요해서 볼륨을 과도하게 크게 만들어야 하는 낭비가 발생했다. 5,000 IOPS가 필요하면 1,667GB를 사야 했다.

gp3는 2020년 출시되었고 IOPS와 볼륨 크기를 **완전히 분리**했다. 모든 gp3 볼륨은 크기와 무관하게 기본 3,000 IOPS와 125 MB/s throughput을 제공한다. 추가로 IOPS는 최대 16,000, throughput은 최대 1,000 MB/s까지 독립적으로 프로비저닝할 수 있다. 그리고 **gp2보다 20% 저렴**하다.

```
[ gp2 IOPS 모델 ]
볼륨 크기 × 3 = IOPS (최대 16,000)
→ 5,000 IOPS 필요 시: 최소 1,667GB 구매 필요

[ gp3 IOPS 모델 ]
기본 3,000 IOPS + 추가 프로비저닝 (최대 16,000)
→ 5,000 IOPS 필요 시: 10GB 볼륨에도 가능
→ gp2 대비 20% 저렴
```

> ⚠️ **함정**: 기존에 만들어진 EBS gp2 볼륨은 자동으로 gp3로 전환되지 않는다. 콘솔이나 CLI에서 수동으로 `modify-volume`을 실행해야 하며, 변환 중에도 인스턴스는 계속 동작한다(다운타임 없음). 대규모 환경에서는 AWS Config 규칙으로 gp2 볼륨을 감지하고 Lambda로 자동 전환하는 패턴이 쓰인다.

### io1/io2와 io2 Block Express: 언제 필요한가

gp3의 최대 IOPS는 16,000이다. Oracle DB, MySQL, PostgreSQL의 OLTP 워크로드 중 대부분은 이 안에서 해결된다. 그러나 SAP HANA나 대형 금융 거래 시스템처럼 수십만 IOPS와 극단적으로 낮은 레이턴시(1ms 미만)가 필요하면 io2 Block Express가 필요하다.

| 타입 | 최대 IOPS | 최대 Throughput | 최대 크기 | latency |
|------|----------|----------------|----------|---------|
| gp3 | 16,000 | 1,000 MB/s | 16 TB | 수 ms |
| io1 | 64,000 | 1,000 MB/s | 16 TB | 1ms 미만 |
| io2 | 64,000 | 1,000 MB/s | 16 TB | 1ms 미만 |
| io2 Block Express | 256,000 | 4,000 MB/s | 64 TB | sub-ms |

io2 Block Express의 256K IOPS는 어떻게 가능한가. 기존 EBS 스택은 Amazon EBS API 레이어를 통하지만, io2 Block Express는 AWS Nitro 하이퍼바이저와 직접 통합된 새로운 스토리지 서버 아키텍처를 사용한다. NVMe-over-Fabric 개념을 AWS 내부 네트워크에 적용해 레이턴시와 처리량을 획기적으로 높였다.

**io1/io2 Multi-Attach**는 한 EBS 볼륨을 동시에 여러 EC2 인스턴스에 붙이는 기능이다. 단, 이것은 파일 시스템 레벨의 공유가 아니다. 동시에 여러 인스턴스가 같은 블록에 쓰면 데이터가 깨진다. Multi-Attach는 **Cluster-aware 파일 시스템**(GFS2, OCFS2, Oracle Cluster File System)이나 클러스터 소프트웨어가 쓰기 조율을 관리할 때만 쓴다.

> 💡 **관련 이론**: Multi-Attach에서 발생하는 동시 쓰기 문제는 분산 시스템의 **동시성 제어(Concurrency Control)**와 같은 문제다. 데이터베이스의 MVCC(Multi-Version Concurrency Control)처럼, 클러스터 파일 시스템은 각 노드가 어느 블록을 쓰고 있는지 **분산 잠금(Distributed Lock)**으로 조율한다. GFS2는 이를 위해 GDLM(Global Distributed Lock Manager)을 쓴다.

### HDD 타입: st1과 sc1

SSD가 비쌀 때 HDD 기반 EBS가 비용 효율적인 경우가 있다.

st1(Throughput Optimized HDD)은 순차적 대용량 읽기/쓰기에 최적화되어 있다. Hadoop MapReduce, 로그 집계, 데이터 웨어하우스 ETL처럼 큰 파일을 순서대로 읽는 워크로드다. 최대 500 MB/s throughput을 제공하지만 IOPS는 낮고(최대 500), 임의 접근(random access)에는 부적합하다.

sc1(Cold HDD)은 접근 빈도가 매우 낮은 데이터를 가장 저렴하게 보관하기 위한 타입이다. 월 1회 이하로 읽는 아카이브 데이터에 쓴다.

> 💡 **관련 이론**: HDD의 임의 접근 성능이 SSD보다 낮은 이유는 물리적 구조에 있다. HDD는 헤드가 물리적으로 이동해야 하고(Seek Time, 평균 5-10ms), 플래터가 회전해야 한다(Rotational Latency, 평균 2-4ms for 7200 RPM). SSD는 NAND 플래시 셀에 전기 신호로 접근하므로 기계적 움직임 없이 μs 단위 접근이 가능하다. 이 차이가 IOPS 차이(HDD 수백 vs SSD 수십만)로 나타난다.

## EBS 스냅샷: 증분 백업의 작동 방식

EBS 스냅샷은 S3에 저장되지만, AWS 콘솔에서 직접 S3 버킷으로 보이지 않는다. 내부적으로 AWS가 관리하는 S3에 저장된다.

중요한 것은 **증분 백업(Incremental Backup)** 방식이다. 첫 번째 스냅샷은 전체 데이터를 복사한다. 이후 스냅샷은 이전 스냅샷과의 **차이(diff)만 저장**한다. 그러나 스냅샷 복원 시에는 어떤 스냅샷 하나만으로 완전한 복원이 가능하다. AWS 내부적으로 이전 스냅샷들을 참조해 전체 데이터를 재구성한다.

```
[ EBS 스냅샷 증분 구조 ]

snap-001: [A][B][C][D][E]  ← 전체 복사
snap-002: [A][B'][C][D][E'] ← B, E만 변경됨 → B', E'만 저장
snap-003: [A][B'][C'][D][E'] ← C만 변경됨 → C'만 저장

snap-003 복원 시: A(snap-001) + B'(snap-002) + C'(snap-003) + D(snap-001) + E'(snap-002)
→ 어느 스냅샷으로든 독립 복원 가능
```

**FSR(Fast Snapshot Restore)**은 스냅샷에서 볼륨을 복원할 때 첫 번째 읽기 성능 저하를 제거한다. 일반적으로 복원된 볼륨의 블록은 실제 접근이 있을 때 S3에서 백그라운드로 가져오는 "lazy restore" 방식이다. FSR은 이 pre-initialization을 미리 수행해두어 즉시 고성능을 낸다. 추가 비용이 발생한다.

> 📚 **사례**: 2020년 3월 코로나 초기 재택근무 전환으로 AWS 사용량이 폭증하면서, 많은 기업이 긴급하게 대규모 EBS 볼륨을 스냅샷에서 복원했다. FSR 없이 복원한 볼륨에서 처음 몇 시간 동안 정상 IOPS의 10-20%만 나오는 "스냅샷 성능 저하" 문제를 겪은 사례가 다수 보고됐다. 프로덕션 복원 시나리오에서 FSR은 비용이 추가되더라도 활성화하는 것이 권장된다.

**EBS Snapshot Archive**는 90일 이상 장기 보관이 필요한 스냅샷을 S3 Glacier로 티어링하는 기능이다. 비용이 75% 절감되지만 복원에 24~72시간이 걸린다. DR 목적으로 "1년에 한 번도 쓸까 말까"인 스냅샷에 적합하다.

## Instance Store: 빠르지만 믿을 수 없는 스토리지

Instance Store는 EC2 인스턴스가 실행되는 물리 서버에 직접 연결된 NVMe SSD다. 네트워크 경유 없이 PCIe 버스로 직접 접근하므로 수백만 IOPS와 마이크로초 단위 레이턴시를 낸다.

데이터 손실 시나리오를 정확히 알아야 한다.

| 상황 | Instance Store 데이터 |
|------|--------------------|
| 인스턴스 **재부팅(reboot)** | 유지 |
| 인스턴스 **중지(stop)** | **손실** (다른 물리 호스트로 이동 가능) |
| 인스턴스 **종료(terminate)** | **손실** |
| 물리 호스트 **장애** | **손실** |
| 인스턴스 **하이버네이션(hibernate)** | **손실** |

중지(stop) 시 데이터가 사라지는 이유는 중지 후 재시작 시 같은 물리 호스트가 보장되지 않기 때문이다. 다른 물리 서버에서 시작되면 이전 물리 디스크에 접근할 방법이 없다.

> 💡 **관련 이론**: Instance Store 데이터 손실은 분산 시스템의 **Crash Fault**와 동일하게 취급해야 한다. 고가용성 NoSQL 데이터베이스(예: Cassandra, MongoDB)의 설계에서는 단일 노드의 스토리지 손실을 정상 운영 조건으로 가정하고, 복제(replication)로 내구성을 보장한다. i4i 인스턴스(NVMe, Instance Store)에서 Cassandra를 운영할 때, replication factor=3으로 3개 AZ에 분산해야 단일 인스턴스 손실 시 데이터를 잃지 않는다.

> 📚 **사례**: 넷플릭스는 Cassandra 클러스터의 일부를 i3 인스턴스(Instance Store) 위에서 운영하는 패턴을 사용한다. 인스턴스가 종료되더라도 Cassandra의 3-way 복제로 데이터가 보존된다. 이 구조에서 Instance Store의 극단적 I/O 성능을 활용하면서 EBS 비용을 제거할 수 있다. 단, Cassandra 복구(repair) 작업이 더 자주 필요하다는 운영 오버헤드가 있다.

## EFS: AWS의 분산 NFS

EFS(Elastic File System)는 NFSv4.1 프로토콜을 사용하는 완전 관리형 분산 파일 시스템이다. 여러 EC2 인스턴스가 동시에 마운트해서 읽고 쓸 수 있다. 용량이 자동으로 늘어나고 줄어든다(페타바이트 단위까지).

EFS의 내부 구조는 여러 AZ에 걸쳐 분산된 스토리지 서버로 이루어진다. 각 파일은 여러 서버에 분산 저장되어 가용성과 내구성을 확보한다. 클라이언트는 EFS 마운트 타겟(각 AZ에 하나씩 배치)을 통해 접근한다.

```
[ EFS 아키텍처 ]

     EC2-AZ-a        EC2-AZ-b        EC2-AZ-c
         │                │                │
    Mount Target    Mount Target    Mount Target
    (ap-ne-2a)      (ap-ne-2b)      (ap-ne-2c)
         └────────────────┴────────────────┘
                          │
              [ EFS 분산 스토리지 클러스터 ]
                  (Multi-AZ 내구성)
```

**성능 모드**:
- `generalPurpose`: 기본값. 99%의 워크로드에 적합. 메타데이터 연산이 빠르다.
- `maxIO`: 수천 개 이상 클라이언트가 동시 접근하는 고병렬 워크로드. 레이턴시가 약간 높아지지만 처리량 확장성이 뛰어나다.

**Throughput 모드**:
- `Bursting`: 데이터 크기에 비례해 버스트 가능. 기본 100 MB/s + 적립된 크레딧 소모.
- `Provisioned`: 크기와 무관하게 원하는 처리량을 지정. 적은 데이터에 높은 처리량이 필요할 때.
- `Elastic`: 실제 사용량에 따라 자동 조정. 예측 불가 트래픽에 가장 편함.

> 💡 **관련 이론**: EFS의 분산 락 구조는 NFS 4.1의 **pNFS(Parallel NFS)** 원칙과 유사하다. pNFS는 RFC 5661에서 정의되었으며, 데이터 서버를 여러 개로 분산해 병렬 읽기/쓰기를 가능하게 한다. EFS는 이를 AWS 내부 구현으로 추상화했다.

**EFS 스토리지 클래스**:
- `Standard`: 자주 접근하는 파일.
- `Standard-IA(Infrequent Access)`: 30일 이상 접근 안 한 파일. EFS Lifecycle Policy로 자동 이동.
- `One Zone`: 단일 AZ, 저렴하지만 AZ 장애 시 영향.
- `One Zone-IA`: One Zone + IA. 가장 저렴.

**EFS Access Point**는 특정 POSIX 사용자/그룹 권한과 특정 디렉토리 루트를 적용한 마운트 포인트다. 여러 애플리케이션이 같은 EFS를 공유하되 서로 다른 디렉토리와 권한으로 격리할 때 쓴다. 멀티 테넌트 파일 공유 아키텍처에 적합하다.

## FSx 4종: 각각의 존재 이유

AWS가 FSx 시리즈를 만든 이유는 단순하다. EFS는 NFSv4.1 기반 범용 파일 시스템이지만, 특정 워크로드는 특수한 파일 시스템 프로토콜이나 기능을 필요로 한다.

### FSx for Windows File Server: Active Directory 통합의 가치

윈도우 환경의 파일 공유는 SMB(Server Message Block) 프로토콜과 Windows NTFS, 그리고 Active Directory 통합을 요구한다. EFS는 Linux NFS 기반이라 이것이 불가능하다.

FSx for Windows는 실제 Windows Server를 관리형으로 실행한다. AWS Managed Active Directory 또는 온프레미스 AD와 통합되어 Kerberos 인증, NTFS ACL, 쉐도우 복사본(Shadow Copies), DFS Namespaces를 지원한다. SQL Server FCI(Failover Cluster Instance)에도 쓸 수 있다.

Multi-AZ 배포 시 자동 페일오버가 30초 이내에 이루어진다. 스토리지 용량은 SSD 또는 HDD로 선택 가능하다.

> ⚠️ **함정**: "Windows 파일 서버 + Active Directory + SMB"가 보이면 EFS를 선택하면 안 된다. EFS는 Windows 클라이언트에서 NFS 클라이언트를 통해 마운트할 수 있지만, AD 통합, NTFS 권한, SMB 특성은 지원하지 않는다. 시험에서 이 구분은 자주 나온다.

### FSx for Lustre: HPC와 ML의 병렬 파일 시스템

Lustre는 1999년 Peter Braam이 설계한 고성능 병렬 파일 시스템이다(이름은 Linux + Cluster의 합성어). 세계 Top 500 슈퍼컴퓨터 중 다수가 Lustre를 사용한다. 미국 에너지부(DOE)의 Summit, Frontier 슈퍼컴퓨터도 Lustre다.

Lustre의 설계 원리는 **데이터를 여러 스토리지 서버(OST: Object Storage Target)에 스트라이핑**해서 집계 처리량을 선형으로 확장한다는 것이다. 1,000개 OST에 파일을 스트라이핑하면 1,000배의 처리량이 나온다. 메타데이터는 별도의 MDS(Metadata Server)가 관리한다.

FSx for Lustre는 최대 수백 GB/s의 처리량과 수백만 IOPS를 제공한다. 중요한 기능은 **S3 직접 연동**이다. S3 버킷을 Lustre 파일 시스템에 연결하면, S3 객체가 Lustre 파일로 투명하게 보인다. ML 학습 잡이 S3의 수십 TB 데이터를 로컬 파일처럼 접근할 수 있다.

```
[ FSx for Lustre + S3 ML 학습 패턴 ]

S3 버킷(학습 데이터) ─── lazy load ──→ FSx for Lustre ──→ EC2 ML 인스턴스들
                                         (POSIX API)          (병렬 읽기)
                    ←── export ─────────────────────────────────────────────
```

> 📚 **사례**: Amazon SageMaker는 공식적으로 FSx for Lustre를 학습 데이터 소스로 지원한다. 수십 TB의 이미지 데이터를 S3에 저장하고, FSx for Lustre를 통해 다수의 GPU 인스턴스에 병렬 제공하면, 데이터 로딩 병목 없이 GPU 활용률을 극대화할 수 있다. S3에서 직접 읽는 것보다 Lustre를 경유하면 I/O 처리량이 10배 이상 향상될 수 있다.

### FSx for NetApp ONTAP: 온프레미스 NetApp의 AWS 확장

많은 기업이 온프레미스에서 NetApp ONTAP 스토리지를 운영한다. 이 데이터를 AWS로 이전하거나 하이브리드로 운영할 때, NetApp SnapMirror(복제)와 동일한 프로토콜로 동기화할 수 있는 것이 FSx for NetApp ONTAP이다.

지원 프로토콜: NFS, SMB, iSCSI. 즉, Linux와 Windows 클라이언트가 동시에 접근할 수 있는 **멀티 프로토콜 파일 시스템**이다. 스냅샷, 복제, 씬 프로비저닝, 중복 제거, 압축 같은 NetApp 고유 기능이 그대로 제공된다.

> 💡 **관련 이론**: ONTAP은 WAFL(Write Anywhere File Layout) 파일 시스템을 사용한다. WAFL은 1994년 NetApp이 개발한 특허 구조로, 모든 쓰기를 새로운 위치에 하고(in-place 덮어쓰기 없음) 스냅샷을 O(1)에 생성할 수 있다. 이것이 NetApp 스냅샷이 거의 순간적으로 이루어지는 이유다. ZFS의 COW(Copy-on-Write) 원리와 유사하다.

### FSx for OpenZFS: ZFS의 클라우드 이식

ZFS는 Sun Microsystems가 2005년 개발한 파일 시스템으로, 데이터 무결성 보장(체크섬), COW 스냅샷, 압축, 중복 제거가 내장되어 있다. OpenZFS는 Oracle이 ZFS 특허를 보유하게 된 이후 오픈소스로 분기된 버전이다.

FSx for OpenZFS는 NFS를 통해 Linux 클라이언트에서 접근한다. 데이터 무결성과 스냅샷 기능이 중요한 워크로드(금융 거래 기록, 의료 영상 데이터)나, 기존 ZFS 기반 온프레미스를 AWS로 이전하는 시나리오에 적합하다.

## 다른 클라우드와의 스토리지 비교

| AWS | GCP | Azure | 특징 |
|-----|-----|-------|------|
| EBS | Persistent Disk | Azure Disk | 블록, 단일 VM |
| Instance Store | Local SSD | Temp Disk | 휘발성 로컬 SSD |
| EFS | Filestore | Azure Files (NFS) | NFS 공유 |
| FSx for Windows | N/A | Azure Files (SMB) | SMB + AD |
| FSx for Lustre | N/A | N/A | HPC 병렬 FS |
| FSx ONTAP | Google Cloud NetApp Volumes | Azure NetApp Files | NetApp 관리형 |

GCP의 Persistent Disk는 EBS와 유사하지만, Regional PD는 두 AZ에 동기 복제된다. AWS EBS는 기본적으로 단일 AZ 내 다중 서버에 복제되며, Multi-AZ 복제는 EBS 자체 기능이 아니라 RDS 같은 상위 서비스에서 담당한다.

## Storage Gateway와 DataSync: 하이브리드 연결

**AWS Storage Gateway**는 온프레미스 서버에 설치하는 가상 어플라이언스다. 세 가지 모드:

- **File Gateway**: NFS/SMB로 로컬 파일 접근, S3에 백엔드 저장. 자주 쓰는 파일은 로컬 캐시.
- **Volume Gateway**: 온프레미스에 iSCSI 블록 볼륨 제공, EBS 스냅샷으로 백업.
- **Tape Gateway**: 물리 테이프 라이브러리처럼 보이지만 실제로는 S3/Glacier에 저장.

**AWS DataSync**는 온프레미스 또는 다른 클라우드의 파일 시스템 데이터를 AWS로 마이그레이션하거나 동기화하는 서비스다. NFS, SMB, S3, EFS, FSx를 소스/목적지로 지원한다. 병렬 전송으로 최대 10배 빠른 복사 속도를 낸다.

> ⚠️ **함정**: "온프레미스 → AWS 파일 마이그레이션"에서 두 서비스가 헷갈린다. Storage Gateway는 **지속적인 하이브리드 운영**(온프레미스에서 계속 AWS 스토리지를 쓰는 구조), DataSync는 **일회성 또는 주기적 마이그레이션/동기화** 작업에 적합하다. 또한 DataSync는 Storage Gateway보다 최대 10배 빠르다.

## CLI로 이해 굳히기

```bash
# gp2에서 gp3로 볼륨 전환 (다운타임 없음)
aws ec2 modify-volume \
  --volume-id vol-1234567890abcdef0 \
  --volume-type gp3 \
  --iops 3000 \
  --throughput 125

# EBS 스냅샷 생성 후 다른 리전으로 복사
SNAP_ID=$(aws ec2 create-snapshot --volume-id vol-xxx --query 'SnapshotId' --output text)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 \
  --source-snapshot-id $SNAP_ID \
  --destination-region us-east-1 \
  --description "DR copy"

# EFS 생성 (Elastic throughput, GeneralPurpose)
aws efs create-file-system \
  --performance-mode generalPurpose \
  --throughput-mode elastic \
  --encrypted \
  --tags Key=Name,Value=shared-efs

# EFS Lifecycle Policy 설정 (30일 미접근 → IA로 이동)
aws efs put-lifecycle-configuration \
  --file-system-id fs-12345678 \
  --lifecycle-policies TransitionToIA=AFTER_30_DAYS

# FSx for Lustre 생성 (S3 연동)
aws fsx create-file-system \
  --file-system-type LUSTRE \
  --storage-capacity 1200 \
  --subnet-ids subnet-xxx \
  --lustre-configuration \
    DeploymentType=PERSISTENT_2,\
    PerUnitStorageThroughput=250,\
    ImportPath=s3://my-ml-data/training/,\
    ExportPath=s3://my-ml-data/checkpoints/

# EBS 전체 암호화 기본값 설정 (계정·리전 수준)
aws ec2 enable-ebs-encryption-by-default --region ap-northeast-2
```

## 정리하며

스토리지 선택의 핵심은 두 가지 차원이다. 첫째, **접근 패턴**: 단일 EC2인가 다수인가, 블록인가 파일인가. 둘째, **영속성**: 데이터가 인스턴스 수명과 독립적이어야 하는가.

EBS는 대부분의 단일 EC2 워크로드에 맞고, gp3가 기본 선택이다. Instance Store는 캐시와 분산 DB 노드 디스크처럼 데이터 손실을 복제로 감내할 수 있을 때 극한 성능이 필요한 경우다. EFS는 Linux 멀티 클라이언트 공유 파일 시스템의 답이고, FSx는 특수 프로토콜이나 기능이 필요한 경우다(Windows SMB+AD, HPC 병렬 처리, NetApp 마이그레이션, ZFS 무결성).

---

## 📝 연습 문제

**문제 1.** 현재 gp2 EBS 볼륨(500GB)을 사용하는 데이터베이스 서버가 있다. IOPS 성능을 높이면서 비용도 절감하고 싶다. 가장 적합한 조치는?

A) 볼륨 크기를 1TB로 늘려 IOPS를 3,000으로 높인다
B) gp3로 전환하고 IOPS를 독립적으로 6,000으로 설정한다
C) io2로 전환한다
D) Instance Store로 마이그레이션한다

**정답: B**
해설: gp2는 크기×3 IOPS 모델이라 1TB에서도 최대 3,000 IOPS다. gp3는 크기와 무관하게 IOPS를 최대 16,000까지 독립 설정하며, gp2보다 20% 저렴하다. io2는 불필요하게 비싸고 gp3로 충분히 해결된다. Instance Store는 영속성 보장이 안 된다. 정답은 B.

---

**문제 2.** 멀티 AZ에서 실행 중인 여러 Linux EC2 인스턴스가 공통 설정 파일과 로그를 공유해야 한다. 인스턴스 수는 예측 불가로 늘어날 수 있다. 가장 적합한 스토리지는?

A) EBS gp3, Multi-Attach 활성화
B) EFS Standard, Elastic throughput
C) FSx for Windows File Server
D) S3 + S3 FUSE 마운트

**정답: B**
해설: EBS Multi-Attach는 io1/io2 타입만 가능하고, 클러스터 파일 시스템 없이 여러 인스턴스가 동시 쓰기를 하면 데이터가 깨진다. EFS는 NFSv4.1로 여러 Linux 인스턴스가 Multi-AZ에서 동시 마운트 가능하며 자동 확장된다. FSx for Windows는 SMB 프로토콜이라 Linux 기본 마운트에 부적합하다. S3 FUSE는 POSIX 파일 시스템 시맨틱을 완전히 지원하지 않아 로그 쓰기 같은 임의 쓰기에 문제가 발생한다.

---

**문제 3.** 온프레미스 NetApp ONTAP 스토리지에서 운영 중인 데이터를 AWS로 마이그레이션한다. Linux와 Windows 서버 모두 같은 파일 시스템에 접근해야 하며, 온프레미스 NetApp의 SnapMirror 복제를 그대로 유지하고 싶다. 가장 적합한 서비스는?

A) Amazon EFS
B) FSx for Lustre
C) FSx for NetApp ONTAP
D) FSx for OpenZFS

**정답: C**
해설: FSx for NetApp ONTAP은 NFS(Linux), SMB(Windows), iSCSI 멀티 프로토콜을 지원한다. 온프레미스 NetApp과 SnapMirror로 동기화가 가능해 마이그레이션과 하이브리드 운영이 자연스럽다. EFS는 NFS만 지원하고 Windows SMB가 안 된다. FSx for Lustre는 HPC 병렬 파일 시스템이다. FSx for OpenZFS는 NFS만 지원하며 NetApp 호환 기능이 없다.

---

**문제 4.** ML 학습 팀이 S3에 저장된 50TB 이미지 데이터셋으로 다수의 GPU 인스턴스에서 학습을 진행한다. 데이터 로딩이 GPU 활용률의 병목이 되고 있다. 어떤 스토리지 구성을 추가해야 하는가?

A) EFS Max I/O 모드로 전환
B) FSx for Lustre를 생성하고 S3 ImportPath로 연결
C) EBS gp3 볼륨을 각 GPU 인스턴스에 붙여서 데이터 복사
D) S3 Transfer Acceleration 활성화

**정답: B**
해설: FSx for Lustre는 S3 버킷을 ImportPath로 연결하면 S3 객체가 POSIX 파일처럼 보인다. 병렬 파일 시스템 구조로 수백 GB/s 처리량을 여러 GPU 인스턴스에 동시 제공한다. EFS Max I/O는 처리량이 있지만 Lustre보다 ML 학습 데이터 로딩에 훨씬 낮다. EBS는 인스턴스당 독립적이라 공유가 안 되고 초기 복사 시간이 소요된다. S3 Transfer Acceleration은 인터넷을 통한 S3 업로드 가속용이다.

---

**문제 5.** 인스턴스가 예기치 않게 종료되거나 재배치되어도 데이터가 보존되어야 하는 단일 EC2 기반 PostgreSQL 데이터베이스의 부팅 볼륨과 데이터 볼륨으로 적합한 스토리지는?

A) Instance Store (부팅) + Instance Store (데이터)
B) EBS gp3 (부팅) + EBS io2 (데이터)
C) EBS gp3 (부팅) + Instance Store (데이터)
D) EFS (부팅 + 데이터)

**정답: B**
해설: 인스턴스 종료/재배치 시에도 데이터를 보존하려면 EBS가 필요하다. 부팅 볼륨은 gp3가 비용·성능 균형상 최적이다. 데이터베이스 데이터 볼륨은 일관된 저레이턴시가 필요하므로 io2가 적합하다. Instance Store를 데이터 볼륨으로 쓰면 인스턴스 중지 시 데이터가 사라진다. EFS는 블록 스토리지가 아닌 파일 시스템이라 PostgreSQL의 부팅 볼륨이나 데이터 디렉토리로 사용하기에 적합하지 않다.

---

**문제 6.** 한 회사가 온프레미스 파일 서버의 데이터를 AWS S3로 마이그레이션하려 한다. 100TB의 데이터를 가능한 빠르게 이전하고, 이전 중에도 온프레미스 서버에서 새로운 파일이 계속 추가된다. 어떤 서비스를 사용해야 하는가?

A) AWS Storage Gateway File Gateway
B) AWS DataSync
C) AWS Direct Connect + 수동 rsync
D) S3 Multi-Part Upload 스크립트

**정답: B**
해설: DataSync는 병렬 전송으로 대량 데이터를 빠르게 이전하며, 증분 동기화를 지원해 이전 중 추가되는 파일도 처리할 수 있다. NFS/SMB 소스에서 S3, EFS, FSx를 목적지로 지원한다. Storage Gateway File Gateway는 지속적인 하이브리드 운영 구조이지 일회성 마이그레이션 도구가 아니다. Direct Connect + rsync는 네트워크 설정 비용과 수동 관리 부담이 크다. S3 Multi-Part Upload 스크립트는 병렬화가 제한적이고 증분 동기화를 직접 구현해야 한다.