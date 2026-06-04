# Day 20 - Week 4 복습: 하이브리드 클라우드 아키텍처 종합

Week 4의 주제는 "AWS의 경계를 어디까지 밀어낼 수 있는가"였다. 퍼블릭 클라우드가 해결하지 못하는 두 가지 근본적 제약 — 물리적 거리가 만드는 지연과 규제가 강제하는 데이터 위치 — 에 대해 AWS가 제시한 다섯 가지 답을 배웠다. Outposts(고객 건물 안에 AWS 랙), Local Zones(대도시 AWS 거점), Wavelength(5G 기지국 옆 AWS), Storage Gateway(온프레미스 스토리지를 클라우드로), Snow Family(물리 배송으로 인터넷을 이기는 데이터 이동). 그리고 컨테이너 오케스트레이션을 온프레미스로 확장하는 EKS/ECS Anywhere까지.

이번 주 서비스들의 공통 설계 철학은 하나다. 데이터나 컴퓨팅이 AWS 리전에 있을 수 없는 상황 — 규제, 물리적 거리, 네트워크 부재, 에어갭 — 에서도 AWS API와 운영 방식을 그대로 사용할 수 있게 한다는 것. 이 철학을 이해하면 개별 서비스를 외우지 않아도 "이 제약이 있으면 이 서비스"라는 판단이 자연스럽게 나온다. 오늘은 그 판단 능력을 시험 수준으로 끌어올린다.

---

## Week 4 핵심 의사결정 트리

SAP-C02 시험에서 하이브리드 클라우드 문제는 보통 세 가지 축으로 분해된다. 첫째, 데이터/컴퓨팅이 물리적으로 어디에 있어야 하는가. 둘째, 지연이 얼마나 낮아야 하는가. 셋째, 네트워크 연결이 가능한가. 이 세 축에 따른 의사결정 트리를 손에 익혀두면 문제의 70%는 첫 15초에 방향이 잡힌다.

```
데이터가 고객 건물 밖으로 나갈 수 없는가?
  └── YES → AWS Outposts (고객 시설 내 AWS 하드웨어)
              ├── 대규모 워크로드 + 자체 전력/냉각 가능 → Outposts Rack
              ├── 소규모 지점/매장/의원 → Outposts Servers
              ├── 온프레미스 장비와 서브밀리초 통신 필요 → LGW로 온프레미스 LAN 직접 연결
              ├── K8s 워크로드 + AWS Managed CP + 데이터 주권 → EKS on Outposts
              └── AWS 연결 항상 필요 (Service Link 끊기면 새 인스턴스/IAM 불가)

특정 도시 사용자에게 1ms 미만 지연이 필요한가?
  └── YES + 일반 인터넷/Wi-Fi 사용자 → Local Zones (도시 내 AWS 인프라)
      YES + 5G 모바일/IoT 디바이스 → AWS Wavelength (통신사 5G MEC 내 AWS)

온프레미스 스토리지를 클라우드로 확장하는가?
  ├── NFS/SMB 파일 프로토콜 + S3 백엔드 + 데이터 레이크 → S3 File Gateway
  ├── Windows AD/ACL/NTFS OpLock + SMB → FSx File Gateway
  ├── iSCSI 블록 스토리지 + 전체 데이터 로컬 보존 → Volume Gateway Stored
  ├── iSCSI 블록 스토리지 + 로컬 용량 작음 + 클라우드 대용량 → Volume Gateway Cached
  └── 기존 테이프 백업 SW(Veeam/NetBackup) 수정 없이 → Tape Gateway (VTL)

대규모 데이터를 AWS로 이전해야 하는가?
  ├── 네트워크 충분(≥1Gbps) + 증분 동기화 + 무결성 검증 → DataSync
  ├── 네트워크 부족 or 물리 격리 or 대용량 일회성 이전 → Snow Family
  │   ├── 초소형(~14TB, 배터리, 드론/차량/선박 배포) → Snowcone
  │   ├── 대용량(80TB/대, 엣지 컴퓨팅, S3-compatible) → Snowball Edge
  │   └── 엑사바이트(단종 2024) → Snowmobile
  └── 상시 하이브리드 마운트 + 파일/블록/테이프 → Storage Gateway

컨테이너를 온프레미스에서 운영해야 하는가?
  ├── 에어갭 + EKS 호환 K8s → EKS Anywhere
  ├── 기존 ECS 유지 + K8s 인력 없음 + AWS CP 관리 → ECS Anywhere
  ├── K8s + Outposts + AWS Managed CP + 리전 CP 의존 → EKS on Outposts Extended Cluster
  ├── K8s + Outposts + 리전 단절 내성(Local CP) → EKS on Outposts Local Cluster
  └── 여러 K8s 클러스터 단일 콘솔 가시화 → EKS Connector
```

> 💡 **OSI 레이어와 하이브리드 경계**: Week 4 서비스들은 서로 다른 레이어에서 "AWS 경계"를 확장한다. Outposts는 **L1-L7 전체 스택**을 고객 시설에 이식한다. Local Zones와 Wavelength는 **L1-L3(인프라)**를 도시/기지국으로 옮긴다. Storage Gateway는 **L4-L7(서비스 프로토콜)**인 NFS/SMB/iSCSI를 온프레미스에 유지하면서 백엔드를 S3/Glacier로 대체한다. Snow Family는 **물리 계층(L0)**인 데이터 운반체 자체를 대체한다. EKS/ECS Anywhere는 **제어 평면 위치**를 조정해 AWS 운영 방식을 온프레미스에 확장한다. 이 레이어별 분류를 이해하면 어떤 제약이 어떤 서비스를 필요로 하는지 직관적으로 파악된다.

---

## 위치 기반 서비스 심화

### 서비스별 물리 위치와 지연 비교

| 서비스 | 물리 위치 | 목표 지연 | 데이터 주권 | AWS 연결 의존 | 주요 사용 사례 |
|--------|-----------|-----------|------------|--------------|---------------|
| 퍼블릭 리전 | AWS 데이터센터 | 100ms+ | 미충족 | 불필요(자체) | 표준 클라우드 워크로드 |
| Outposts Rack | 고객 데이터센터 | 서브밀리초(LAN) | 완전 충족 | 필수(Service Link) | 규제·데이터 주권·공장 자동화 |
| Outposts Servers | 지점/소매점/의원 | 서브밀리초(LAN) | 완전 충족 | 필수(Service Link) | 소규모 엣지 분산 배포 |
| Local Zones | AWS 운영 대도시 시설 | 1-5ms | 부분 충족 | 불필요(자체) | 게임·미디어 렌더링·실시간 ML |
| Wavelength | 통신사 5G MEC | 1-10ms | 부분 충족 | 불필요(자체) | 자율주행·5G IoT·AR/VR |

> 💡 **전파 지연의 물리적 하한**: 지연시간의 물리적 하한선은 빛의 속도로 계산된다. 광섬유에서 빛의 전파 속도는 진공 속도의 약 2/3인 200,000km/s다. 서울-버지니아(약 11,000km) 왕복 지연의 이론적 하한은 약 110ms다. 실제로는 라우팅 홉, 큐잉 지연, 처리 지연이 더해져 150~200ms가 된다. Local Zone은 도시 내 AWS 시설을 배치해 "마지막 마일" 거리를 수 km로 줄인다. 서울 강남에서 서울 Local Zone까지의 왕복 전파 지연은 0.1ms에 불과하다. Wavelength는 통신사 5G MEC 시설에 컴퓨팅을 배치해 5G 패킷이 기지국에서 처리 노드까지 이동하는 거리를 수 km 이내로 줄인다. 5G 링크 자체 지연(1-5ms)과 합산해도 총 10ms 이내를 달성할 수 있다.

### AWS Outposts 아키텍처 심화

Outposts의 핵심 구성 요소가 Service Link다. Service Link는 Outposts 랙에서 부모 AWS 리전으로 향하는 암호화된 VPN 채널이다. 이 채널을 통해 IAM 인증, KMS 키 접근, ECR 이미지 pull, CloudWatch 메트릭 전송, SSM 에이전트 통신, 새 EC2 인스턴스 시작을 위한 제어 평면 작업이 이루어진다.

```
Outposts 내부 구성:
  [온프레미스 서버/DB] ─── LGW(Local Gateway) ─── Outposts Rack
                                                      │
                                                   Service Link (암호화 VPN)
                                                      │
                                                   부모 AWS 리전
                                                      ├── EC2 제어 평면
                                                      ├── IAM
                                                      ├── EBS 스냅샷 → S3
                                                      └── CloudWatch

Outposts에서 생성 가능한 서비스 (부분):
  ├── EC2 (M, R, C 계열 일부)
  ├── EBS (gp2/gp3 로컬)
  ├── RDS (MySQL, PostgreSQL)
  ├── EKS (Extended 또는 Local Cluster)
  ├── ECS
  ├── ElastiCache
  └── EMR
```

> 🔍 **Service Link 단절 시 동작**: Service Link가 끊어지면 기존에 실행 중인 EC2 인스턴스는 하이퍼바이저 수준에서 계속 동작한다. 데이터 플레인(네트워크 패킷 전달, EBS I/O)은 정상이다. 그러나 새 인스턴스 시작(IAM 인증 불가), EBS 스냅샷 생성(부모 리전 S3 접근 불가), CloudWatch 메트릭 전송(중단, 나중에 재연결 시 전송), SSM 명령 실행, AWS Systems Manager Patch Manager 패치 작업이 모두 불가능해진다. Azure Stack Hub의 Disconnected Mode(완전 자립 운영)와 대비되는 AWS Outposts의 핵심 제약이다. 이 때문에 Outposts의 Service Link는 DX 이중화 또는 VPN 백업으로 반드시 고가용성을 확보해야 한다.

---

## Storage Gateway 심화

### 4종 게이트웨이 상세 비교

| 게이트웨이 | 프로토콜 | 백엔드 | 로컬 캐시 | 핵심 구분자 |
|-----------|---------|--------|---------|-----------|
| S3 File Gateway | NFS v3/v4.1, SMB | S3 네이티브 객체 | 최근 사용 파일 캐시 | 데이터 레이크, 앱 수정 없이 S3 |
| FSx File Gateway | SMB v2/v3 | FSx for Windows | 최근 사용 파일 캐시 | **AD/ACL/NTFS OpLock 필요** |
| Volume Cached | iSCSI 블록 | S3 주 저장 + 로컬 캐시 | 자주 쓰는 데이터 캐시 | 로컬 디스크 작고 데이터 큰 경우 |
| Volume Stored | iSCSI 블록 | 로컬 주 저장 + S3 비동기 | 전체 데이터 로컬 | 최저 지연 iSCSI + DR 목적 S3 |
| Tape Gateway | iSCSI VTL | S3 VTL + Glacier Deep Archive | 없음(스트리밍) | 기존 백업 SW(Veeam/NetBackup) 수정 없이 |

> ⚠️ **다중 게이트웨이 캐시 불일치 함정**: S3 File Gateway로 여러 지사가 같은 S3 버킷을 공유할 때 한 지사가 쓴 파일이 다른 지사에서 즉시 보이지 않을 수 있다. S3는 2020년 12월부터 강력한 일관성(Strong Consistency)을 보장하지만 Storage Gateway 캐시 레이어가 이를 가린다. 각 게이트웨이가 독립 캐시를 운영하므로 게이트웨이 A가 파일을 쓰고 S3에 flush했더라도 게이트웨이 B의 캐시에는 여전히 오래된 버전이 남아 있을 수 있다. 해결책은 두 가지다: (1) S3 이벤트 알림 → Lambda → `RefreshCache` API 자동 호출, (2) FSx File Gateway로 전환(NTFS OpLock이 분산 캐시 충돌 방지). 시험에서 "동시 편집 충돌 + Windows 파일 공유"가 나오면 FSx File Gateway다.

> 📚 **글로벌 미디어 하이브리드 파이프라인**: 한 글로벌 미디어 그룹이 하이브리드 영상 편집 파이프라인을 구축했다. 원본 영상 RAW footage(4K ProRes, 수 TB/일)는 온프레미스 카메라 장비에서 NFS로 마운트된 S3 File Gateway에 기록된다. AWS 편집 클러스터(GPU EC2)가 S3 API로 직접 접근해 AI 색보정과 노이즈 제거를 처리한다. Premiere Pro 프로젝트 파일(여러 편집자 동시 접근, NTFS 파일 잠금 필수)은 FSx File Gateway를 통해 온프레미스 편집실과 클라우드 워크스테이션이 공유한다. 완성된 최종 영상은 S3 Lifecycle 정책으로 90일 후 Glacier Instant Retrieval, 1년 후 Glacier Deep Archive로 자동 아카이브된다. 이 구성으로 온프레미스 NAS 용량의 75%를 S3로 이전했고 스토리지 비용이 62% 감소했다.

---

## Snow Family vs DataSync 심화

### 선택 기준 계산식

```
DataSync 선택 기준:
  실효 대역폭 = 회선 대역폭 × 60~70% (TCP 오버헤드, 재전송)
  전송 시간 = 데이터 크기 ÷ 실효 대역폭
  → 전송 시간 < 7일이면 DataSync 우선 고려

Snow Family 선택 기준:
  → 전송 시간 > 7일
  → 네트워크 연결 없음(물리 격리)
  → 에어갭 환경(오프라인 데이터 수집)
  → 엣지 컴퓨팅이 필요한 현장(공사현장, 선박, 군부대)

실전 계산 예시:
  회선 100Mbps × 60% = 60Mbps = 7.5MB/s
  100TB ÷ 7.5MB/s = 13,653,333초 ≈ 158시간 ≈ 6.6일
  
  회선 1Gbps × 60% = 600Mbps = 75MB/s  
  100TB ÷ 75MB/s = 1,365,333초 ≈ 15.8일
  → 1Gbps에서도 100TB는 네트워크보다 Snow가 유리할 수 있음
```

> 💡 **앤드류 타넨바움의 대역폭 원칙**: "스테이션왜건에 자기테이프를 가득 싣고 고속도로를 달리는 것의 대역폭은 결코 과소평가하면 안 된다." 이 원칙의 현대적 구현이 Snow Family다. Snowball Edge 80TB를 2일 배송으로 보내면 등가 대역폭은 80TB/2일 = 80×8×1024²Mb / 172,800초 = 약 3.8Gbps다. 1Gbps DX보다 3.8배 빠른 "대역폭"이다. 10Gbps DX와 비교해야 비로소 네트워크가 물리 배송을 이긴다(10Gbps 실효 6Gbps > 3.8Gbps). 데이터가 클수록, 회선이 느릴수록, 물리 이동이 경제적이다. Snowball의 보안은 256-bit AES 암호화(KMS 관리 키) + Tamper-Evident 물리 케이스 + TPM 칩 + NIST SP 800-88 데이터 소거 프로세스로 구성된다.

| Snow 장비 | 사용 가능 스토리지 | 엣지 컴퓨팅 | 특수 기능 |
|----------|--------------------|------------|---------|
| Snowcone | 8TB(HDD) / 14TB(SSD) | 2 vCPU, 4GB RAM | 배터리 내장, 드론/차량 배포 가능 |
| Snowball Edge Storage Optimized | 80TB | 40 vCPU, 80GB RAM | S3-compatible API 온디바이스 |
| Snowball Edge Compute Optimized | 28TB | 52 vCPU, 208GB RAM + GPU | GPU ML 추론, 엣지 영상 처리 |
| Snowmobile | 100PB | N/A | 단종 2024년 |

---

## 컨테이너 온프레미스 확장 심화

### EKS/ECS Anywhere vs EKS on Outposts 비교

| 항목 | ECS Anywhere | EKS Anywhere | EKS on Outposts (Extended) | EKS on Outposts (Local) |
|------|-------------|-------------|---------------------------|------------------------|
| 제어 평면 위치 | AWS 리전 (완전 관리) | 고객 하드웨어 (고객 관리) | AWS 리전 (완전 관리) | Outposts 하드웨어 (AWS 관리) |
| AWS 연결 필요 | 항상 필요 | 선택적 | 항상 필요 | 연결 단절 시도 동작 |
| 에어갭 지원 | 불가 | 가능 (로컬 미러) | 불가 | 제한적 |
| 필요 하드웨어 | 고객 서버 (x86/ARM) | vSphere/베어메탈 | AWS Outposts | AWS Outposts |
| Kubernetes 버전 | 없음 (ECS 태스크) | EKS-D | AWS EKS | AWS EKS |
| 권장 팀 역량 | ECS 운영자 | K8s 전문가 | K8s 기본 지식 | K8s 기본 지식 |

> 🔍 **제어 평면 위치의 의미**: ECS Anywhere와 EKS on Outposts Extended Cluster는 제어 평면이 AWS 리전에 있다. 이 말은 Worker Node가 새 태스크/Pod를 받으려면 AWS 연결이 필요하다는 의미다. 30초의 연결 단절이라면 큰 문제가 없지만, 수분~수시간의 단절이 발생하면 장애조치가 불가능해진다. EKS Anywhere와 EKS on Outposts Local Cluster는 제어 평면(API 서버, etcd, Controller Manager, Scheduler)이 고객 하드웨어에 있다. AWS 연결 없이도 Pod 스케줄링, ReplicaSet 자동 복구, ConfigMap/Secret 관리, HPA가 모두 동작한다. AWS 연결은 ECR 이미지 pull, CloudWatch 전송, EKS Connector 가시화에만 선택적으로 사용된다.

> 🎯 **방위산업체 3-환경 시나리오**: 방위산업체가 군용 물류 시스템을 세 개의 서로 다른 환경에서 운영한다. (1) 인터넷 완전 차단 군 데이터센터 → EKS Anywhere(에어갭 모드, 로컬 Harbor 레지스트리, 온프레미스 etcd). (2) 일반 기업 사무소 + 기존 ECS 사용 + K8s 인력 없음 → ECS Anywhere(AWS ECS 콘솔/CLI 그대로, 온프레미스 서버를 External Instance로). (3) 비밀 시설 내 AWS Outposts + AWS Managed K8s + 리전 단절 내성 필요 → EKS on Outposts Local Cluster(제어 평면이 Outposts에, 연결 단절 시에도 Pod 스케줄링 유지). 세 환경에 각각 다른 서비스가 최적인 이유를 즉각 판단할 수 있어야 한다.

---

## 키워드 → 서비스 빠른 매핑표

| 시나리오 키워드 | 즉각 연상 서비스 | 근거 |
|---------------|----------------|------|
| "데이터가 건물 밖 반출 금지" | Outposts | 물리적으로 고객 건물 내 |
| "공장 LAN 장비와 서브밀리초" | Outposts + LGW | LGW가 온프레미스 LAN 직결 |
| "Service Link 끊기면?" | 기존 인스턴스 동작, 신규 불가 | 제어 플레인 = AWS 리전 |
| "대도시 1ms, 일반 인터넷" | Local Zones | 도시 내 AWS 인프라 |
| "5G 디바이스 10ms, 통신사" | Wavelength | MEC 내 AWS |
| "Windows AD 파일 공유, 동시 편집" | FSx File Gateway | NTFS OpLock, AD 통합 |
| "NetBackup/Veeam 그대로" | Tape Gateway (VTL) | iSCSI VTL 에뮬레이션 |
| "iSCSI + 로컬 작음 + 대용량 클라우드" | Volume Gateway Cached | S3 주저장 + 로컬 캐시 |
| "NFS/SMB → S3 데이터 레이크" | S3 File Gateway | NFS 마운트 + S3 네이티브 |
| "500TB, 100Mbps 회선" | Snow Family | 네트워크보다 물리 이동 빠름 |
| "5TB/일 + 10Gbps + 무결성 검증" | DataSync | 회선 충분 + 자동 체크섬 |
| "에어갭 K8s, 자체 운영" | EKS Anywhere | 에어갭 모드 지원 |
| "기존 ECS + 온프레미스 노드" | ECS Anywhere | ECS 콘솔/CLI 유지 |
| "여러 K8s 클러스터 단일 콘솔" | EKS Connector | 외부 클러스터 가시화 |
| "Outposts + K8s + 리전 단절 내성" | EKS on Outposts Local | 로컬 제어 플레인 |
| "드론/차량 배포, 14TB 미만" | Snowcone | 배터리, 초소형 |
| "현장 GPU ML 추론 + Snow" | Snowball Edge Compute Optimized | GPU 옵션 |
| "Hosted DX + 멀티 VPC" | Transit VIF 불가 → Dedicated 필요 | Hosted는 Transit VIF 미지원 |

---

## SAP-C02 시나리오 분해 방법론 (Week 4 적용)

```
5단계 분석:
1. WHO: 데이터/컴퓨팅의 주체가 누구인가?
   (고객 시설 내 장비, 도시 사용자, 5G 디바이스, 온프레미스 서버)

2. WHAT: 무엇이 필요한가?
   (스토리지 확장, 대용량 데이터 이전, K8s 워크로드, 초저지연 컴퓨팅)

3. WHY: 왜 AWS 리전을 못 쓰는가?
   (데이터 주권 규제, 물리 거리, 네트워크 부재, 에어갭)

4. CONSTRAINTS: 결정적 제약은?
   (전송 시간, 지연 요건, 에어갭 여부, K8s 인력 여부, 기존 SW 수정 가능 여부)

5. KEYWORD 매핑:
   "건물 밖 반출 금지" → Outposts
   "1ms + 일반 인터넷" → Local Zones
   "10ms + 5G" → Wavelength
   "에어갭 K8s" → EKS Anywhere
   "기존 NetBackup" → Tape Gateway
   "네트워크보다 물리 이동 빠름" → Snow Family
   "회선 충분 + 증분 + 검증" → DataSync
```

---

## 📝 연습 문제

**문제 1.** 한국 의료법으로 환자 영상 데이터(CT, MRI)가 병원 건물 밖으로 반출되면 안 된다. AWS AI 진단 모델을 실시간으로 영상에 적용해야 하며, 의료 장비(PACS 서버)와 서브밀리초 수준의 낮은 지연으로 통신해야 한다. 가장 적합한 서비스는?

A) Local Zones (서울 확장) + PACS 서버 DX 연결  
B) AWS Outposts (병원 서버실) + Local Gateway로 PACS 연결  
C) AWS Wavelength (SK Telecom 5G MEC)  
D) AWS Lambda (서울 리전) + DX Private VIF  

**정답: B**

해설: 두 가지 조건이 정답을 결정한다. (1) "건물 밖 반출 금지" = Outposts만이 AWS 하드웨어를 고객 건물 내에 배치해 데이터가 물리적으로 건물 안에 유지된다. (2) "PACS 서버와 서브밀리초 통신" = Local Gateway(LGW)로 Outposts가 온프레미스 LAN에 직접 연결되어 서브밀리초 지연을 달성한다. Local Zones(A)는 AWS가 운영하는 별도 시설이므로 "건물 밖"이다. Wavelength(C)는 통신사 시설이다. Lambda(D)는 서울 리전 데이터센터에서 실행된다. 세 서비스 모두 병원 건물 밖에 있어 의료법을 충족하지 못한다.

---

**문제 2.** 뉴욕 금융 트레이딩 회사가 알고리즘 트레이더에게 1ms 미만 지연의 실시간 시세 대시보드를 제공해야 한다. 트레이더는 사무실 유선 이더넷 네트워크를 사용한다. 5G는 사용하지 않는다. 데이터 주권 규제는 없다. 가장 적합한 서비스는?

A) AWS Outposts (사무실 서버실)  
B) AWS Local Zones (us-east-1-nyc-1a)  
C) AWS Wavelength (Verizon 뉴욕)  
D) Global Accelerator + us-east-1 EC2  

**정답: B**

해설: 유선 인터넷 환경 + 1ms 미만 지연 + 데이터 주권 규제 없음 = Local Zones가 정답이다. 뉴욕 Local Zone(us-east-1-nyc-1a)은 뉴욕 도심에 AWS 인프라를 배치해 1ms 미만 왕복 지연을 제공한다. Outposts(A)는 데이터 주권 요건이 없는 상황에서 하드웨어 구매/운영 비용과 복잡성이 과하다. Wavelength(C)는 5G 모바일 디바이스가 클라이언트일 때 최적이며 유선 사무실 환경에서는 이점이 없다(5G RAN을 경유하지 않으므로 Wavelength 배치의 지연 감소 효과가 없다). Global Accelerator + us-east-1(D)은 뉴욕-버지니아 물리 거리(약 350km)로 인해 최소 3-5ms 지연이 불가피해 1ms 요건을 충족할 수 없다.

---

**문제 3.** 자율주행 배달 로봇이 도심에서 5G로 경로 재계산 요청을 보낸다. 응답 지연이 15ms를 초과하면 장애물 회피 알고리즘이 실패한다. 도시에 SK Telecom 5G 인프라가 있다. 가장 적합한 서비스는?

A) AWS Outposts (로봇 유지보수 센터)  
B) Local Zones (서울)  
C) AWS Wavelength (SK Telecom 파트너십)  
D) 서울 리전 EC2 + Global Accelerator  

**정답: C**

해설: "5G 연결 디바이스 + 15ms 이내 응답" = Wavelength의 정확한 사용 사례다. 5G 패킷이 기지국에서 5G 코어 네트워크를 거치지 않고 바로 인접한 Wavelength Zone EC2에서 처리된다. 기지국-컴퓨팅 거리가 수 km 이내이므로 총 왕복 지연 10ms 이내를 달성한다. Local Zones(B)는 일반 인터넷 연결 사용자에게 도시 수준 지연을 제공하지만, 5G 디바이스가 5G 코어를 통해 인터넷으로 나와 Local Zone에 접근하면 추가 홉이 생겨 15ms 달성이 불안정하다. 서울 리전 + GA(D)는 5G 코어 → 인터넷 → 서울 리전 경로로 20-30ms가 예상된다.

---

**문제 4.** 석유화학 회사가 250TB 데이터를 인터넷 연결이 없는 오프쇼어 플랫폼에서 AWS S3로 수집해야 한다. 플랫폼에서 데이터를 전처리하는 ML 추론 워크로드도 실행해야 한다. 가장 적합한 솔루션은?

A) 위성 인터넷(Starlink) 설치 + DataSync  
B) Snowball Edge Compute Optimized (GPU 옵션) + 주기적 배송 회수  
C) Snowcone + 해저케이블 연결  
D) Storage Gateway S3 File + 위성 연결  

**정답: B**

해설: 두 요건이 동시에 필요하다: (1) 네트워크 없는 환경의 대용량 데이터 수집, (2) 현장 ML 추론. Snowball Edge Compute Optimized는 28TB 스토리지 + 52 vCPU + 208GB RAM + NVIDIA V100 GPU를 내장해 현장에서 ML 추론을 실행하고 데이터를 수집한 뒤 플랫폼 공급선 편에 AWS로 배송한다. S3-compatible API가 온디바이스에서 동작해 기존 애플리케이션 수정이 최소화된다. Snowcone(C)은 14TB 이하 소규모이므로 250TB 수집에 부적합하다. 위성 인터넷(A, D)는 오프쇼어 플랫폼에서 250TB를 전송하기에 대역폭이 턱없이 부족하다(Starlink 100Mbps × 60% × 전송 시간 = 수 주).

---

**문제 5.** 컨설팅 회사 20개 지사가 Windows 파일 서버를 운영한다. 본사와 지사에서 동일한 파일을 동시 편집하며 Active Directory 그룹 정책으로 접근을 제어한다. 지사 로컬 캐시로 응답 속도를 유지하면서 중앙 관리로 전환하려 한다. 적합한 솔루션은?

A) S3 File Gateway (각 지사에 배포) + S3 + S3 이벤트 알림으로 RefreshCache  
B) FSx File Gateway (각 지사) + 중앙 FSx for Windows File Server  
C) Volume Gateway Cached Mode + EFS Multi-AZ  
D) DataSync로 매일 동기화 + 로컬 파일 서버 유지  

**정답: B**

해설: Windows AD ACL + 동시 편집 충돌 방지(NTFS OpLock/파일 잠금) + 로컬 캐시가 모두 필요하다. FSx File Gateway가 이 세 가지를 모두 충족한다. 각 지사 FSx File Gateway가 자주 쓰는 파일을 로컬 캐시에 유지하고, 실제 저장은 중앙 FSx for Windows File Server에 한다. 도메인 조인으로 기존 AD 정책이 그대로 적용된다. S3 File Gateway(A)는 NTFS OpLock을 완전히 지원하지 않아 동시 편집 중 파일 잠금이 제대로 동작하지 않아 데이터 충돌이 발생할 수 있다. RefreshCache 자동화로 일관성은 개선할 수 있지만 파일 잠금은 해결되지 않는다. Volume Gateway(C)는 iSCSI 블록 스토리지로 SMB 파일 공유가 아니다. DataSync(D)는 배치 동기화로 실시간 파일 공유에 부적합하다.

---

**문제 6.** 방송사가 물리 LTO 테이프 4만 개에 30년치 아카이브를 보관한다. Veritas NetBackup 소프트웨어를 수정 없이 유지하면서 클라우드로 이전하고 복원 시간을 물리 테이프 운반 없이 단축하려 한다. 적합한 솔루션은?

A) S3 File Gateway + S3 Glacier Deep Archive  
B) Tape Gateway (iSCSI VTL) + S3 Glacier Deep Archive  
C) DataSync + S3 Glacier  
D) Snowball Edge로 물리 테이프 데이터 일괄 이전 + S3  

**정답: B**

해설: "기존 NetBackup 소프트웨어 수정 없이"가 핵심이다. Tape Gateway는 iSCSI VTL(Virtual Tape Library) 인터페이스를 에뮬레이션해 NetBackup이 물리 테이프 장비처럼 인식한다. 백업 job이 그대로 실행되고 데이터가 S3 VTL에 저장된다. "Archive" 명령 실행 시 Glacier Deep Archive로 이동한다. 복원 시 물리 테이프 운반 없이 Glacier 복원 요청만으로 처리된다(표준 복원 3-5시간, Bulk 복원 12시간). S3 File Gateway(A)는 NFS/SMB 인터페이스이지 VTL이 없어 NetBackup이 테이프 장비로 인식하지 못한다. DataSync(C)는 파일 복사 도구로 백업 소프트웨어 VTL 통합이 없다. Snowball(D)은 일회성 물리 이전으로 지속적 백업에 부적합하다.

---

**문제 7.** 방위산업체가 완전히 격리된 군용 네트워크(에어갭)에서 Kubernetes 기반 물류 시스템을 운영해야 한다. 자체 K8s 운영팀이 있으며 EKS 호환 Kubernetes가 필요하다. AWS 연결이 완전히 차단된다. 적합한 서비스는?

A) AWS ECS Anywhere  
B) AWS EKS Anywhere  
C) EKS on Outposts Extended Cluster  
D) AWS Fargate  

**정답: B**

해설: 에어갭 + 자체 K8s CP 운영 + EKS 호환 = EKS Anywhere. EKS Anywhere는 EKS-D(EKS Distro)를 기반으로 고객 하드웨어(vSphere, 베어메탈 등)에 배포되며, 에어갭 모드에서 로컬 Harbor 레지스트리와 온프레미스 미러 저장소를 사용해 AWS 연결 없이 완전 자립적으로 운영된다. Kubernetes API 서버, etcd, Controller Manager가 모두 고객 하드웨어에 있으므로 Pod 스케줄링, 자동 복구, ConfigMap 관리가 에어갭에서 동작한다. ECS Anywhere(A)는 제어 평면이 AWS 리전에 있어 항상 AWS 연결이 필요하다. EKS on Outposts Extended Cluster(C)도 제어 평면이 AWS 리전에 있어 연결이 필요하고 Outposts 하드웨어가 있어야 한다. Fargate(D)는 AWS 리전 전용이다.

---

**문제 8.** 유통 기업이 AWS ECS로 마이크로서비스를 운영한다. 개인정보보호법으로 일부 데이터 처리가 온프레미스에서만 실행되어야 한다. Kubernetes 전문 인력이 없으며 기존 ECS Task Definition, CLI, 콘솔 운영 방식을 그대로 유지하고 싶다. 적합한 솔루션은?

A) EKS Anywhere (온프레미스 K8s 클러스터 구축)  
B) ECS Anywhere (온프레미스 서버를 External Instance로 등록)  
C) EKS on Outposts Local Cluster  
D) AWS Fargate + VPC Endpoint (프라이빗 서브넷에서만 처리)  

**정답: B**

해설: "기존 ECS 방식 유지 + K8s 인력 없음 + 온프레미스 실행"이 모두 충족되어야 한다. ECS Anywhere는 제어 평면이 AWS ECS 완전 관리형이고, 온프레미스 서버를 SSM Agent와 ECS Agent를 통해 External Instance로 ECS 클러스터에 등록한다. 기존 ECS Task Definition, `aws ecs run-task` CLI, ECS 콘솔이 그대로 동작한다. 온프레미스 External Instance에서 실행되는 태스크는 데이터가 온프레미스에 유지된다. K8s 지식이 없어도 된다. EKS Anywhere(A)는 K8s 제어 평면을 직접 운영해야 해 K8s 전문 인력이 필수다. EKS on Outposts(C)는 Outposts 하드웨어 구매가 필요하다. Fargate(D)는 AWS 리전에서 실행되므로 온프레미스 처리 요건을 충족하지 못한다.

---

**문제 9.** 영화 제작사가 매일 촬영 원본 5TB를 온프레미스 NAS에서 S3로 전송한다. 10Gbps Dedicated DX 회선이 있다. S3와 NAS 파일 내용이 정확히 일치하는지 자동 체크섬 검증이 필요하고, 매일 야간 특정 시간에 자동 실행되어야 한다. 가장 적합한 솔루션은?

A) Snowball Edge 매일 발송  
B) AWS DataSync (야간 스케줄 + 체크섬 검증 활성화)  
C) S3 File Gateway + S3 Lifecycle  
D) S3 REST API 직접 업로드 스크립트 (멀티파트 + MD5 수동 비교)  

**정답: B**

해설: 10Gbps DX + 5TB/일은 DataSync로 충분히 처리 가능하다(10Gbps 실효 6Gbps기준 약 1.9시간 소요). DataSync는 전송 전후 체크섬(SHA-256)을 자동으로 계산해 소스와 목적지의 데이터 무결성을 검증하며, 불일치 발견 시 자동 재전송한다. 스케줄 기능으로 매일 야간 cron 자동화도 지원한다. Snowball 매일 발송(A)은 10Gbps DX 환경에서 완전히 비경제적이고 운영 부담이 크다. S3 File Gateway(C)는 상시 마운트 도구로 스케줄 전송과 체크섬 비교 기능이 DataSync만큼 강력하지 않다. 직접 스크립트(D)는 병렬 처리 최적화, 자동 재시도, 무결성 검증을 모두 직접 구현해야 하고 운영 부담이 크다.

---

**문제 10.** AWS Outposts Rack이 설치된 공장에서 Service Link 연결이 45분간 완전히 끊어졌다. 이 기간 동안 공장 제어 시스템(Outposts EC2에서 실행 중)과 새로 배포해야 하는 EC2 인스턴스의 상태는?

A) 모든 기존 인스턴스가 5분 후 자동 종료된다  
B) 기존 실행 중인 인스턴스는 계속 동작하지만 새 인스턴스 시작, IAM 인증, EBS 스냅샷 생성이 불가능하다  
C) Outposts가 자동으로 Disconnected Mode로 전환되어 모든 기능이 정상 동작한다  
D) 인스턴스는 동작하지만 EBS 볼륨 I/O가 즉시 중단된다  

**정답: B**

해설: AWS Outposts는 공식적인 Disconnected Mode를 지원하지 않는다. Service Link가 끊어지면 두 가지 카테고리로 나뉜다. 계속 동작하는 것: 하이퍼바이저가 이미 기동한 EC2 인스턴스, EBS 볼륨 로컬 I/O, Outposts 내부 VPC 네트워크(서브넷 간 통신), 온프레미스 LAN과의 LGW 통신. 중단되는 것: 새 EC2 인스턴스 시작(IAM 인증을 위해 AWS STS 접근 불가), EBS 스냅샷 생성(부모 리전 S3 연결 불가), CloudWatch 메트릭/로그 전송(단절 후 재연결 시 일부 버퍼 전송), SSM Run Command, AWS 콘솔/CLI를 통한 대부분의 관리 작업. 이 때문에 공장 자동화처럼 Outposts에 중요 워크로드를 올릴 때는 Service Link를 DX 이중화(Maximum Resiliency)로 보호해야 한다. C는 존재하지 않는 기능(Azure Stack Hub는 Disconnected Mode 있지만 Outposts는 없음).

---

**문제 11.** 다음 중 AWS DataSync와 Storage Gateway의 사용 사례를 올바르게 구분한 것은?

A) DataSync는 상시 마운트가 필요할 때 사용하고, Storage Gateway는 일회성 대량 이전에 사용한다  
B) DataSync는 일회성 또는 정기 배치 전송 + 무결성 검증에 사용하고, Storage Gateway는 상시 하이브리드 스토리지 마운트에 사용한다  
C) DataSync는 블록 스토리지만 지원하고, Storage Gateway는 파일 스토리지만 지원한다  
D) 둘 다 온프레미스 파일 서버를 S3로 마이그레이션할 때 동등하게 사용할 수 있으므로 비용으로만 선택한다  

**정답: B**

해설: DataSync와 Storage Gateway는 목적이 다르다. DataSync는 "데이터를 A에서 B로 옮기는" 마이그레이션/동기화 도구다. 소스(NFS, SMB, S3, HDFS, EFS 등)와 목적지 사이에 스케줄 또는 일회성으로 전송하고, 각 파일의 체크섬을 검증해 무결성을 보장한다. 전송 후 DataSync 작업은 완료된다. Storage Gateway는 "온프레미스 애플리케이션이 AWS 스토리지를 로컬 스토리지처럼 계속 사용하는" 하이브리드 통합 도구다. 게이트웨이가 항상 실행 중이어야 하고 애플리케이션이 NFS/SMB/iSCSI를 통해 지속적으로 접근한다. A는 설명이 반대다. C는 틀렸다(DataSync는 파일/객체/블록 다양, Storage Gateway는 파일/블록/테이프). D는 틀렸다(사용 목적이 근본적으로 다름).

---

**문제 12.** 회사가 6개 대륙의 5G 파트너 통신사 MEC 시설에서 AR(증강현실) 원격 의료 상담 서비스를 제공하려 한다. 외과 의사가 스마트폰으로 5G 연결을 통해 수천 km 떨어진 환자를 실시간으로 보조한다. 지연 요건은 편도 20ms 이내다. AWS 글로벌 인프라를 활용해 이 서비스를 배포하는 가장 적합한 접근은?

A) 각 대륙의 AWS 리전에 EC2를 배포 + Global Accelerator  
B) 6개 대륙의 통신사 파트너 5G MEC에 AWS Wavelength Zone 배포  
C) 6개 대륙의 주요 도시에 Local Zones 배포  
D) AWS 엣지 캐시(CloudFront) + Lambda@Edge  

**정답: B**

해설: 5G 디바이스(스마트폰) + 편도 20ms = Wavelength가 정확한 사용 사례다. Wavelength는 통신사 5G MEC 시설 내에 EC2를 배치해 5G 패킷이 기지국에서 Wavelength Zone까지의 거리를 최소화한다. 편도 5-10ms 이내를 달성하므로 20ms 요건을 여유 있게 충족한다. Global Accelerator + 리전(A)은 5G 코어 → 인터넷 → AWS Pop → 리전 경로를 거치므로 편도 30-100ms가 예상된다. Local Zones(C)는 도시 수준의 일반 인터넷 접근에 최적이며 5G 코어 우회 기능이 없어 5G 디바이스에서는 Wavelength만큼 지연을 줄이지 못한다. CloudFront + Lambda@Edge(D)는 HTTP 요청-응답 패턴이고 실시간 양방향 AR 스트리밍의 지연 요건을 충족하기 어렵다.

---

## 다음 주 예고: Week 5 글로벌 아키텍처

Week 5는 AWS 글로벌 아키텍처의 핵심 서비스를 다룬다. Multi-Region 패턴, Route 53 라우팅 7종(단순/가중치/지연/장애조치/지리위치/지리근접/다중값), CloudFront 심화(OAC, Origin Failover, Lambda@Edge vs CloudFront Functions 선택 기준), Global Accelerator vs CloudFront의 선택이 주제다. 공통 키워드는 "글로벌 사용자에게 낮은 지연으로 서비스를 제공하면서 장애 복원력을 갖추는 방법"이다. Route 53의 7가지 라우팅 정책을 시나리오에 매핑하는 연습이 핵심이 될 것이다.
