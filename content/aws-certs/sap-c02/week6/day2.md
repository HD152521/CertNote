# Day 32 - AWS MGN 심화: 블록 레벨 복제의 물리학, DRS 비교, Migration Hub Orchestrator

서버 마이그레이션의 본질적 문제는 하나다. **디스크를 복사하는 동안에도 서버는 계속 쓰기를 한다.** 50TB 디스크를 복사하는 데 24시간 걸린다면, 복사가 끝난 시점에 원본과 복사본이 24시간 분량만큼 다르다. 이 "마지막 변경분"을 따라잡는 것이 Cutover의 기술적 도전이다.

AWS Application Migration Service(MGN)는 이 문제를 **블록 레벨 연속 복제(Block-Level Continuous Replication)**로 해결한다. 처음에 전체 디스크를 복사하고, 그 이후 발생하는 모든 변경을 실시간으로 추적해 AWS Staging Area에 적용한다. Cutover 순간에는 "마지막 변경분"이 사실상 초 단위가 되어 있다.

오늘은 MGN의 커널 드라이버 I/O 인터셉트 메커니즘, Test Cutover와 Cutover의 명확한 차이, DRS와의 엔진 공유 관계, 그리고 Migration Hub Orchestrator의 Wave 자동화까지 깊게 다룬다.

## MGN의 역사: SMS → CloudEndure → MGN

클라우드 마이그레이션 도구의 계보를 알아야 시험 함정을 피할 수 있다.

```
2014: AWS Server Migration Service (SMS) 출시
      VMware vCenter/Hyper-V 환경 특화
      주기적 스냅샷 기반 복제 (델타 스냅샷, 인크리멘털)
      최대 50개 VM 동시 복제

2016: CloudEndure Migration (이스라엘 스타트업 CloudEndure)
      블록 레벨 연속 복제 기술 보유
      다중 클라우드·다중 OS 지원

2019: AWS가 CloudEndure 인수 ($250M 추정)
      AWS 계정과 통합, 처음 90일 무료 정책 도입

2021: AWS Application Migration Service (MGN) 정식 출시
      CloudEndure의 기술 + AWS 네이티브 통합 + 새 UX
      SMS는 새 고객 온보딩 중단 발표

2023: SMS 서비스 공식 종료 (기존 고객 → MGN 마이그레이션 권고)

현재: MGN = AWS 단일 표준 서버 마이그레이션 도구
      DRS = 동일 엔진 기반 상시 DR 서비스
```

> ⚠️ **함정**: 시험에서 SMS(Server Migration Service)나 CloudEndure Migration이 보기에 나오면 오답이다. 현재 AWS 권장은 MGN이며, SMS는 종료됐다. "Server Migration Connector"(SMS의 온프레미스 에이전트)와 혼동하지 말 것. 또한 "CloudEndure Disaster Recovery"는 현재 AWS DRS로 리브랜딩됐다.

## MGN 동작 원리: 커널 드라이버 I/O 인터셉트의 실제

### 왜 블록 레벨인가: 파일 레벨 복제의 한계

파일 레벨 복제(rsync, robocopy)는 파일 시스템을 순회하며 변경된 파일을 식별한다.

**파일 레벨의 문제들**:
1. 복사 중 파일이 수정되면 불일관된 상태가 캡처된다
2. DB 데이터 파일은 복사 중 열린 트랜잭션이 있어 파일 자체가 불일관된 상태
3. OS에 종속적 — Windows NTFS, Linux ext4, xfs마다 다른 도구 필요
4. 파일 잠금(File Locking) 중인 파일은 복사가 불가

블록 레벨 복제는 파일 시스템을 이해하지 않는다. **디스크의 원시 섹터(512 bytes 또는 4KB 블록)**를 그대로 복제한다. OS, 파일 시스템, 앱 종류에 무관하다.

### 커널 드라이버 I/O 인터셉트: 내부 동작

MGN Replication Agent를 설치하면 OS 커널에 **I/O 인터셉트 드라이버**가 로드된다.

**Linux 환경 (Block Device I/O)**:
```
앱 → 파일 시스템(ext4/xfs) → VFS(Virtual File System) → 블록 I/O 레이어
                                                              ↑
                                                 MGN 드라이버가 여기서 인터셉트
                                                 모든 쓰기 블록을 캡처
                                                              ↓
                                                    AWS로 TLS 전송
```

**Windows 환경 (VSS + Block I/O)**:
```
앱 → NTFS → Windows I/O Manager
                    ↑
        MGN Filter Driver 삽입 (minifilter driver 방식)
        모든 쓰기 I/O Request Packet (IRP) 캡처
                    ↓
           AWS로 TLS 전송
```

> 💡 **관련 이론**: Windows의 Filter Driver 아키텍처는 Microsoft가 "I/O Stack"으로 설계한 계층형 드라이버 모델이다. 각 레이어 드라이버가 IRP를 다음 레이어로 전달하기 전에 수정·캡처할 수 있다. Antivirus, Encryption, DLP 솔루션도 동일한 Filter Driver 방식을 쓴다. MGN은 이 표준 확장 포인트를 이용해 커널 레벨에서 모든 I/O를 캡처하므로, 앱이나 DB 엔진을 수정하지 않아도 된다.

**블록 변경 추적 메커니즘**:
- 각 블록의 변경 여부를 비트맵(Bitmap)으로 추적
- 초기 동기화: 전체 비트맵 = "변경됨" → 모든 블록 전송
- 연속 복제: 변경된 블록만 비트맵에 표시 → 해당 블록만 전송
- 전송 데이터 압축 및 중복 제거(Deduplication)로 대역폭 최적화

> 🔍 **더 깊이**: MGN의 연속 복제는 CDP(Continuous Data Protection)와 다르다. CDP는 모든 I/O를 저널에 기록해 임의 시점(Point-in-Time)으로 복원이 가능하다. MGN은 현재 상태를 따라가는 것이지 모든 이력을 보관하지 않는다. 따라서 "MGN으로 어제 상태로 롤백"은 불가능하다. 시점 복원이 필요하면 MGN + AWS Backup을 함께 써야 한다. DRS도 마찬가지다 — "수 초 전 상태"를 복구하는 것이지 "어제 오후 3시 상태"를 복구하는 것이 아니다.

### Replication Agent 설치 요구사항

| 항목 | 상세 |
|------|------|
| 지원 Linux | RHEL 6.5+, CentOS 6.5+, Ubuntu 12.04+, Debian 8+, Amazon Linux 1/2, SUSE 11 SP3+ |
| 지원 Windows | Windows Server 2008 R2+, 2012, 2016, 2019, 2022 |
| 메모리 | 최소 2GB RAM (에이전트 실행 용) |
| 네트워크 | 포트 443 (HTTPS) 아웃바운드 → AWS Staging Area |
| IAM | Replication Agent용 IAM 사용자 (AWSApplicationMigrationAgentPolicy) |
| 대역폭 | 초기 동기화는 대역폭 집약적, 스로틀링 가능 (MB/s 제한 설정) |

```bash
# Linux에 MGN Replication Agent 설치
wget -O ./aws-replication-installer-init.py \
  https://aws-application-migration-service-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/linux/aws-replication-installer-init.py

sudo python3 aws-replication-installer-init.py \
  --region ap-northeast-2 \
  --aws-access-key-id AKIAIOSFODNN7EXAMPLE \
  --aws-secret-access-key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
  --no-prompt
```

> ⚠️ **함정**: Replication Agent는 IAM 자격증명으로 인증한다. 이 자격증명은 소스 서버에서 AWS MGN 서비스로의 초기 등록에 사용된다. 운영 환경에서는 IAM 사용자의 Access Key 대신 AWS SSM Parameter Store나 Secrets Manager에 저장하고 스크립트가 참조하는 패턴을 쓴다. 또한 Agent 설치 후에는 소스 서버의 보안 그룹 또는 방화벽에서 포트 1500(Replication Server와의 복제 데이터 전송)과 443(제어 플레인)이 허용돼야 한다.

## MGN 단계별 분해: Replication → Test Cutover → Cutover

### 단계 1: Initial Sync (초기 동기화)

Agent 등록 후 즉시 시작된다. Staging Area(t3.small EC2 + 원본 디스크 크기 EBS)가 자동 생성된다.

```
온프레 서버                            AWS Staging Area (ap-northeast-2)
[Disk Block Bitmap]                   [Replication Server t3.small]
  모든 블록 = Changed                  [EBS Volume (동일 크기)]
       │                                      │
       │ TLS 암호화 전송 (443, 1500)            │
       └──────────────────────────────────────┘
           초기 동기화: 모든 블록 전송
           대역폭 스로틀링 가능
```

초기 동기화 중에도 원본 서버는 정상 운영된다. 이 기간의 새 쓰기는 비트맵에 기록됐다가 초기 동기화 완료 후 연속 복제로 전환해 따라잡는다.

**초기 동기화 예상 시간 계산**:
```
디스크 크기 500GB, 가용 대역폭 100Mbps
= 500GB × 1024MB × 8bit / 100Mbps / 3600초
= 약 11.4시간 (오버헤드·재전송 포함 시 실제 15~20시간 예상)

대역폭 스로틀을 50Mbps로 제한하면:
= 약 22.8시간
```

### 단계 2: Continuous Replication (연속 복제)

초기 동기화 완료 후, 변경 블록만 실시간으로 Staging에 적용한다.

```
Lag 측정: 원본 쓰기 시각 vs Staging 반영 시각 차이
일반적 Lag: 수 초 미만
쓰기 폭풍 시 Lag: 수십 초 ~ 수분
```

MGN 콘솔에서 각 서버의 Replication Status:
- **Not Started**: Agent 미설치
- **Initial Sync**: 초기 동기화 진행 중
- **Healthy**: 연속 복제 정상 (Lag 정상 범위)
- **Stalled**: 복제 지연 심화 (네트워크 문제, Replication Server 이슈)
- **Disconnected**: Agent 연결 끊김

### 단계 3: Test Cutover (테스트 컷오버)

**핵심 차이**: Test Cutover는 원본 서버를 계속 운영하면서 Staging 데이터로 테스트 EC2 인스턴스를 부팅한다. 원본에 영향 없음.

```
테스트 목적:
1. OS 부팅 정상 여부 (커널, 드라이버 호환성)
2. 네트워크 설정 (VPC 서브넷, 보안 그룹)
3. 앱 실행 정상 여부 (서비스 시작 스크립트, 의존성)
4. 연결 테스트 (RDS 연결, S3 접근, 내부 API 호출)
5. 성능 베이스라인 (CPU, 메모리, 디스크 I/O)

테스트 EC2 인스턴스 수명 주기:
Launch Test Instance → 테스트 수행 → Terminate Test Instance
(Cutover와 무관, 반복 가능)
```

> 📚 **사례**: 대규모 마이그레이션 프로젝트에서 Test Launch의 중요성. 국내 한 대형 보험사가 Oracle RAC 기반 핵심 시스템을 MGN으로 이전하려 했다. Initial Sync 완료 후 Test Launch를 했을 때 Oracle RAC의 클러스터웨어(Grid Infrastructure)가 EC2 단일 인스턴스 환경에서 시작을 거부했다. RAC는 멀티 노드 클러스터 전용이라 단일 인스턴스 Oracle로 재구성이 필요했다. Test Launch가 없었다면 실제 Cutover 때 발견됐을 문제를 미리 잡을 수 있었다. MGN에서 Test Launch는 건너뛰면 안 되는 필수 단계다.

### 단계 4: Cutover (실제 컷오버)

**Cutover 이전에 필수 완료해야 할 체크리스트**:
- [ ] Test Launch에서 모든 기능 검증 완료
- [ ] 네트워크 연결 (SG, NACl, 라우팅) 검증
- [ ] Cutover 전 대역폭 사용량이 낮은 시간대 선택 (최종 동기화 시간 최소화)
- [ ] DNS TTL 사전 낮춤 (60초 이하)
- [ ] 롤백 계획 수립 (원본 서버 보존 기간 결정)
- [ ] 이해관계자 커뮤니케이션 완료

**Cutover 실행 순서**:

```
1. Finalize Cutover 요청
   └── MGN이 최종 변경 블록 동기화 수행
   └── 원본 서버에서 추가 쓰기 최소화 권장

2. EC2 인스턴스 생성
   └── Launch Template 기준 (인스턴스 타입, AMI, SG, 서브넷)
   └── Staging EBS를 새 EC2에 연결

3. EC2 부팅 및 앱 실행 확인

4. DNS 전환
   └── Route 53 / 내부 DNS 레코드를 새 EC2 IP로 변경

5. 원본 서버 트래픽 종료 확인 후 종료/폐기
```

**Cutover 다운타임 구성요소**:
```
총 다운타임 = 최종 동기화 시간 + EC2 부팅 시간 + 앱 시작 시간 + DNS 전파 시간
일반적으로: 2~10분 (디스크 쓰기 속도와 Lag에 따라)
```

> 💡 **관련 이론**: Cutover 전략은 데이터베이스 마이그레이션의 "Big Bang vs Trickle" 패턴과 유사하다. MGN의 Cutover는 Big Bang(특정 시점에 전체 전환)이다. Big Bang의 위험을 낮추기 위해 Test Launch + Rollback 계획 + 다운타임 최소화가 핵심이다. 반면 DMS의 CDC는 Trickle(점진적 데이터 이전 후 최소 다운타임으로 전환) 패턴이다.

## MGN vs DRS: 같은 엔진, 다른 목적

AWS Elastic Disaster Recovery(DRS)는 MGN과 동일한 블록 레벨 연속 복제 엔진을 사용하지만 목적이 근본적으로 다르다.

| 항목 | MGN | DRS |
|------|-----|-----|
| 목적 | 마이그레이션 (1회성 이전) | 재해 복구 (상시 보호) |
| 원본 위치 | 온프레, 다른 클라우드, 기존 EC2 | 온프레, 다른 클라우드, 다른 AWS 리전 |
| 대상 | 목표 AWS 리전 EC2 | DR AWS 리전 EC2 |
| 사용 빈도 | Cutover 후 종료 | 상시 운영 (DR 훈련 반복) |
| RPO | 마이그레이션 목적상 N/A | **수 초** |
| RTO | Cutover 시 수분 | **수분 (DR Drill/실제 발동)** |
| Drill 방식 | Test Launch (원본 운영 유지) | Non-Disruptive DR Drill (원본 운영 유지) |
| Failback | 개념 없음 (단방향 이전) | **지원** (DR → 원본으로 역방향 복제) |
| 비용 모델 | 처음 90일 무료 | 보호 서버당 시간당 과금 (~$0.028/시간) |

**DRS Failback 시나리오**:
```
[정상 상태]
온프레 서버 → DRS Agent → AWS DR 리전 Staging

[DR 발동]
온프레 서버 장애 → DRS가 DR 리전 EC2 부팅 (RTO 수분)
서비스 DR 리전에서 운영

[원본 복구 후 Failback]
DR 리전 EC2 → DRS Failback 복제 → 온프레 서버 (역방향)
온프레 서버 복구 완료 후 → Failback Cutover
원래 온프레 서버로 다시 서비스
```

> 🎯 **시나리오**: "온프레 데이터센터를 AWS로 마이그레이션 완료했다. 이제 동일 데이터센터를 AWS 데이터의 DR 사이트로 쓰고 싶다." → AWS EC2 → DRS Agent → 온프레 Staging. DRS는 원본이 AWS EC2이고 DR 대상이 온프레인 역방향도 지원한다. MGN은 이 시나리오에서 쓸 수 없다(마이그레이션 완료 후 관계 종료).

> ⚠️ **함정**: DRS와 MGN을 혼동하는 시나리오. "온프레 서버를 보호하기 위해 AWS를 DR로 쓰고 싶다" → DRS. "온프레 서버를 AWS로 옮기고 싶다" → MGN. 문제의 핵심 키워드: "마이그레이션(한 번)" vs "재해 복구(지속적)".

## DRS RPO/RTO 수학

**RPO 계산**:
```
DRS Replication Lag 일반 범위: 1~5초
RPO = Replication Lag ≈ 수 초

최악의 경우 (쓰기 폭풍):
Lag이 60초로 늘어나면 RPO = 60초

모니터링: CloudWatch "ReplicationLagDuration" 메트릭
알람: Lag > 30초 → SNS 알림
```

**RTO 계산**:
```
DR Drill/실제 발동 시:
1. Recovery Instance 시작: 약 1~2분 (EC2 부팅)
2. 앱 서비스 시작: 앱에 따라 1~5분
3. DNS 전환: TTL에 따라 0~300초

총 RTO: 약 5~15분
```

> 🔍 **더 깊이**: DRS의 Non-Disruptive DR Drill. MGN의 Test Launch와 동일하게, 원본 서버를 계속 운영하면서 DR 리전에 Recovery Instance를 부팅해 테스트한다. 테스트 후 Recovery Instance를 종료해도 원본 복제에 영향 없다. "DR 훈련 = 실제 서비스 중단"이라는 전통적 DR의 단점을 해결한 기능이다. 정기적 DR Drill(분기 1회, 연 4회)을 Non-Disruptive로 실행해 RTO/RPO를 실측 검증하는 것이 Well-Architected 안정성 Pillar의 권고다.

## Migration Hub Orchestrator: Wave 자동화

대규모 마이그레이션(수백~수천 대)에서 각 서버를 수동으로 관리하는 것은 한계가 있다. Migration Hub Orchestrator가 Wave별 자동화를 담당한다.

### Orchestrator의 역할

```
Migration Hub Orchestrator
    │
    ├── Workflow Template 선택
    │   (SAP, SQL Server, Generic Server 등)
    │
    ├── Wave 정의
    │   ├── Wave 1: 의존성 없는 Web/Cache 서버
    │   ├── Wave 2: App/API 서버 (Wave 1 완료 후 시작)
    │   └── Wave 3: DB 서버 (Wave 1+2 완료 후 시작)
    │
    ├── 각 Wave의 단계 자동화
    │   1. Pre-migration 검증 (네트워크, 권한)
    │   2. MGN Test Launch 자동 트리거
    │   3. Test 결과 자동 수집
    │   4. Cutover 자동화 (또는 수동 승인 후 자동)
    │   5. Post-migration 검증 (Health Check)
    │   6. DNS 전환 자동화 (Route 53 API 호출)
    │
    └── 전체 진행 상황 대시보드
```

**Orchestrator Workflow 구조**:
```yaml
# Migration Hub Orchestrator Workflow (개념 YAML)
name: "Wave-1-WebServers"
steps:
  - name: "Pre-Migration Check"
    plugin: "MGN"
    action: "verify-replication-healthy"
    servers: ["web-01", "web-02", "web-03"]

  - name: "Test Launch"
    plugin: "MGN"
    action: "launch-test-instance"
    servers: ["web-01", "web-02", "web-03"]

  - name: "Manual Approval Gate"
    type: "approval"
    approvers: ["migration-team@example.com"]

  - name: "Cutover"
    plugin: "MGN"
    action: "finalize-cutover"
    servers: ["web-01", "web-02", "web-03"]

  - name: "DNS Switch"
    plugin: "Route53"
    action: "update-record"
    records: [...]
```

> 📚 **사례**: SK텔레콤의 대규모 MGN 마이그레이션 (2022~2023). SKT는 온프레 데이터센터에서 500대 이상의 서버를 ap-northeast-2로 이전하면서 Migration Hub Orchestrator로 Wave를 관리했다. 서버 간 의존성을 ADS로 분석해 14개 Wave로 구성하고, 각 Wave의 Test Launch → 승인 → Cutover를 Orchestrator가 자동화했다. 이전 방식(수동 스프레드시트 추적)보다 운영 오류가 60% 감소했다.

## Launch Settings와 Post-Launch Actions

### Launch Settings (인스턴스 구성)

MGN Cutover 시 생성될 EC2 인스턴스의 스펙을 사전 정의한다.

| 설정 항목 | 설명 |
|----------|------|
| Instance Type | 원본 CPU/메모리 기반 자동 권장 또는 수동 지정 |
| Subnet | 대상 VPC의 서브넷 |
| Security Group | 앱에 맞는 SG 적용 |
| IAM Instance Profile | EC2에 붙일 IAM 역할 |
| EBS 암호화 | KMS 키 지정 |
| Public IP 할당 여부 | Private Subnet이면 False |

**Right-Sizing 전략**:
- 마이그레이션 시: 원본 사양과 같거나 유사하게 설정 (안전하게 이전)
- 이전 후 2주: Compute Optimizer가 실제 사용률 분석
- 2주 후: Compute Optimizer 권장에 따라 축소 or 변경

### Post-Launch Actions (Cutover 후 자동 실행)

Cutover 성공 직후 SSM Automation Runbook을 자동 실행할 수 있다.

```
Cutover 완료
    │
    ▼
Post-Launch Action 1: SSM Agent 설치 확인
Post-Launch Action 2: CloudWatch Agent 설치 + 설정 (통합 로깅)
Post-Launch Action 3: Active Directory 도메인 조인
Post-Launch Action 4: NTP 서버 설정 (AWS 내부 NTP: 169.254.169.123)
Post-Launch Action 5: 앱 서비스 시작 스크립트 실행
Post-Launch Action 6: Slack 채널에 "서버 X Cutover 완료" 알림
```

> 💡 **관련 이론**: Post-Launch Actions의 자동화는 **Infrastructure as Code의 Day-2 Operations** 원칙이다. 서버가 시작된 직후의 초기 설정(Bootstrap)을 자동화하면 마이그레이션 후 일관성 있는 상태를 보장한다. 수동으로 각 서버에 SSH/RDP해 설정을 완료하는 방식은 누락이 생기고 일관성이 없다. Terraform의 `user_data`나 Ansible의 `post-migration playbook`과 동일한 철학을 SSM Automation으로 구현한다.

## MGN 비용 최적화

| 항목 | 비용 | 최적화 방법 |
|------|------|-----------|
| MGN 서비스 | 처음 90일 무료, 이후 $0.062/서버/시간 | 90일 내 Cutover 계획 |
| Staging EC2 (t3.small) | ~$15/월/서버 | 사용하지 않는 서버 Agent 제거 |
| Staging EBS | $0.10/GB/월 | 원본 디스크 크기 = EBS 크기 |
| 데이터 전송 (인바운드) | 무료 | — |
| Test Instance | EC2 실행 시간 | 테스트 후 즉시 종료 |

**100대 서버, 평균 디스크 500GB 기준 3개월 예상 비용**:
```
MGN 서비스: 90일 무료 = $0
Staging EC2 (t3.small × 100): $15 × 100 × 3 = $4,500
Staging EBS (500GB × 100): $0.10 × 500 × 100 × 3 = $15,000
합계: ~$19,500 (약 2천만 원)

* 이후 Cutover 완료 후 Staging 리소스는 자동 종료
```

---

## 📝 연습 문제

**문제 1.** MGN Replication Agent가 온프레미스 서버의 디스크 I/O를 캡처하는 방식은?

A) 파일 시스템 API를 호출해 변경 파일 목록을 조회한다
B) OS 커널 레벨 I/O 인터셉트 드라이버로 모든 블록 쓰기를 캡처한다
C) 주기적으로 전체 디스크 스냅샷을 찍어 이전 스냅샷과 비교한다
D) 앱 레벨 훅(hook)을 설치해 DB 트랜잭션을 인터셉트한다

**정답: B**
해설: MGN은 OS 커널 레벨의 I/O 인터셉트 드라이버(Linux: 블록 디바이스 레이어, Windows: Filter Driver)로 모든 블록 쓰기를 캡처한다. 파일 시스템·앱·DB 엔진에 무관하게 동작한다. 파일 레벨 복제(A)는 복사 중 불일관성 문제가 있다. 주기적 스냅샷(C)은 SMS의 방식이고 이미 종료됐다. 앱 레벨 훅(D)은 각 앱마다 다른 구현이 필요해 범용적이지 않다.

---

**문제 2.** MGN으로 500GB 디스크 서버를 마이그레이션 중이다. Initial Sync가 완료된 후 "Stalled" 상태가 됐다. 원인으로 가장 가능성 높은 것은?

A) MGN 서비스가 다운됐다
B) 네트워크 대역폭 부족 또는 Replication Server(Staging EC2)의 문제
C) 500GB는 MGN이 지원하는 최대 크기를 초과한다
D) Agent가 자동으로 업데이트 중이다

**정답: B**
해설: "Stalled" 상태는 복제 Lag이 심각하게 늘어났거나 Replication Server와의 연결에 문제가 생겼을 때 발생한다. 가장 흔한 원인은 네트워크 대역폭 포화(원본이 많은 쓰기를 하는데 전송이 따라가지 못함) 또는 Staging의 Replication Server(t3.small) 문제다. 해결: MGN 콘솔에서 Replication Server 로그 확인, 필요 시 더 큰 Replication Server 타입으로 교체. MGN은 최대 디스크 크기 제한이 없다(AWS 문서상 16TB 이상도 지원).

---

**문제 3.** Test Cutover와 실제 Cutover의 가장 중요한 차이는?

A) Test Cutover는 더 작은 인스턴스 타입을 사용한다
B) Test Cutover는 원본 서버를 계속 운영하면서 테스트 EC2를 부팅하고, Cutover는 원본을 종료하고 프로덕션 전환을 완료한다
C) Test Cutover는 암호화를 적용하지 않는다
D) Test Cutover는 단 한 번만 실행할 수 있다

**정답: B**
해설: Test Cutover는 원본 서버를 중단하지 않고 Staging 데이터로 테스트 EC2를 부팅한다. 원본은 계속 운영되므로 테스트 EC2와 원본이 동시에 실행된다. 테스트 후 문제 발견 시 테스트 EC2를 종료하고 수정 후 재시도 가능하다. 실제 Cutover는 마지막 동기화 → 프로덕션 EC2 부팅 → DNS 전환 → 원본 종료로 이루어지며 원본으로 돌아갈 수 없다(단, 원본을 보존했다면 롤백 가능). Test Cutover는 반복 실행 가능(D 오답).

---

**문제 4.** DRS와 MGN 중 "온프레미스 서버 장애 시 AWS에서 신속하게 복구하고, 원본이 복구되면 다시 온프레미스로 서비스를 돌리는" 요구사항에 맞는 서비스는?

A) MGN (마이그레이션 도구)
B) DRS (Elastic Disaster Recovery, Failback 지원)
C) AWS Backup + Cross-Region Copy
D) CloudEndure Migration

**정답: B**
해설: 핵심 키워드는 "Failback" — 장애 후 AWS에서 서비스하다가 원본이 복구되면 다시 온프레미스로 돌아오는 것. DRS는 Failback을 네이티브로 지원한다. DR 발동 → AWS에서 운영 → 원본 복구 → DRS Failback 복제(AWS→온프레) → Failback Cutover → 온프레에서 재운영. MGN은 단방향 마이그레이션이라 Failback 개념이 없다. CloudEndure Migration은 MGN으로 대체됐다.

---

**문제 5.** 대규모 마이그레이션(800대 서버)에서 Wave 간 의존성 순서를 자동으로 관리하고, 각 Wave의 Test Launch → 수동 승인 → Cutover를 자동화하려 한다. 어떤 서비스를 쓰는가?

A) AWS Step Functions
B) AWS Migration Hub Orchestrator
C) AWS EventBridge Scheduler
D) AWS Systems Manager State Manager

**정답: B**
해설: Migration Hub Orchestrator는 마이그레이션 특화 워크플로우 자동화 서비스다. Wave 정의, MGN Test Launch/Cutover API 호출, 수동 승인 게이트, Post-migration 검증, DNS 전환까지 워크플로우를 구성할 수 있다. Step Functions로도 구현 가능하지만 마이그레이션 플러그인 통합(MGN, DMS, ADS 연동)이 없어 모든 API 호출을 직접 코딩해야 한다. Orchestrator는 마이그레이션에 특화된 플러그인과 대시보드를 포함한다.

---

**문제 6.** MGN Post-Launch Actions로 가장 많이 구성하는 자동화 작업은? (여러 개 해당)

A) S3 버킷 자동 생성
B) CloudWatch Agent 설치 및 로그 설정 자동화
C) Active Directory 도메인 조인 자동화
D) VPC Peering 설정 자동화
E) SSM Agent 상태 확인 및 재시작

**정답: B, C, E**
해설: Post-Launch Actions는 SSM Automation Runbook을 이용해 Cutover 후 즉시 실행할 작업을 자동화한다. CloudWatch Agent 설치(B), AD 도메인 조인(C), SSM Agent 상태 확인(E)은 모든 마이그레이션에서 공통으로 구성하는 Day-1 자동화다. S3 버킷 생성(A)은 마이그레이션과 무관, VPC Peering(D)은 네트워크 레벨 설정으로 서버 부팅 후 자동화보다는 사전 설정이 적합하다.
