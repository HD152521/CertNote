# Day 1 - Systems Manager 개요 (Agent, Fleet Manager, Inventory)

📅 날짜: Week 5 (Day 1)
🎯 주제: SSM 전체 그림 + 운영자가 매일 쓰는 기본 기능
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Systems Manager의 5대 카테고리와 주요 기능을 이해한다
- SSM Agent 설치·등록·트러블슈팅 방법을 안다
- Fleet Manager와 Inventory로 인스턴스 현황을 파악한다

---

## 🧩 사전 지식 (CS 기초)

- **Agent-based management**: 에이전트를 통해 원격 명령 실행, 상태 보고
- **Inventory management**: 운영 중인 자산을 카탈로그화
- **CMDB (Configuration Management Database)**: IT 자산·구성 정보 DB
- **Hybrid cloud**: 온프레미스와 클라우드 혼합 운영
- **Tag-based targeting**: 태그로 동적 대상 선정

---

## 📖 이론 내용

### 1. AWS Systems Manager 큰 그림

SSM은 다양한 운영 기능을 하나로 통합한 서비스. 5개 카테고리:

| 카테고리 | 주요 기능 |
|----------|-----------|
| **Operations Management** | OpsCenter, Incident Manager, Explorer, Application Manager |
| **Application Management** | Parameter Store, AppConfig, CloudWatch Application Insights |
| **Change Management** | Change Manager, Automation, Change Calendar, Maintenance Window |
| **Node Management** | Fleet Manager, Run Command, Session Manager, Patch Manager, State Manager, Inventory, Compliance, Distributor, Hybrid Activations |
| **Shared Resources** | Documents (SSM Documents), Quick Setup |

### 2. SSM Agent

#### 설치 상태
- **자동 설치**:
  - Amazon Linux 2/2023
  - Ubuntu (최신 AMI)
  - Windows Server 2016+
  - macOS (특정 인스턴스 유형)
- **수동 설치**: 그 외 OS, 온프레미스 서버

#### 등록 조건 (Managed Instance가 되려면)
1. SSM Agent 설치 + 실행 중
2. 인스턴스에 IAM Role: `AmazonSSMManagedInstanceCore` 부여
3. SSM 서비스 엔드포인트로 네트워크 도달 가능 (NAT/Endpoint)
4. (온프레미스) Hybrid Activation으로 등록

#### SSM 엔드포인트 (VPC Endpoint)
```
com.amazonaws.<region>.ssm
com.amazonaws.<region>.ssmmessages
com.amazonaws.<region>.ec2messages
```
→ 인터넷 없는 사설 VPC에선 이 3개 Interface Endpoint 필요.

#### Default Host Management Configuration (DHMC)
- 한 번 설정하면 모든 EC2가 Instance Profile 없이도 SSM 사용 가능
- 권장 모드 (계정 단위 활성화)

### 3. Managed Instance 확인

```bash
aws ssm describe-instance-information \
  --query 'InstanceInformationList[*].[InstanceId,PingStatus,PlatformName,IPAddress]' \
  --output table
```

`PingStatus`:
- `Online`: 정상
- `ConnectionLost`: 마지막 ping 5분 초과
- `Inactive`: 인스턴스 종료됨

### 4. Fleet Manager

#### 개념
- 모든 Managed Instance를 콘솔에서 시각화
- SSH/RDP 없이 인스턴스 내부 작업 (파일 탐색, 프로세스 관리, 사용자 관리)
- "GUI를 가진 EC2 매니지먼트 콘솔"

#### 주요 기능
- File System Browser (인스턴스 내 파일/디렉토리 탐색·다운로드)
- Process Manager (실행 중 프로세스 목록·종료)
- Users and Groups (Linux/Windows 사용자 관리)
- Performance Counters
- Registry Editor (Windows)

### 5. Inventory

#### 개념
- 인스턴스의 소프트웨어·설정·실행 정보를 정기 수집
- 보안 패치 누락, OS 버전, 라이선스 추적에 활용

#### 수집 항목 (예시)
- AWS Components: AWS CLI, CFN agent
- Applications: 설치된 모든 패키지
- Windows Updates: 적용된 KB
- Windows Roles
- Network Configuration
- Custom (사용자 정의 JSON)

#### 데이터 활용
- Resource Data Sync로 S3에 통합 저장
- Athena로 SQL 쿼리
- "MySQL 5.7 설치된 인스턴스 모두" 같은 질문 답변

### 6. Hybrid Activations (온프레미스)

#### 개념
- 온프레미스 서버나 다른 클라우드(GCP, Azure)의 VM을 SSM Managed Instance로 등록

#### 흐름
1. Activation 생성 (Activation Code + ID 발급)
2. 대상 머신에 SSM Agent 설치
3. Activation Code/ID로 등록 → `mi-xxxxxxxxxx` 형식의 ID 부여
4. 이후 EC2와 동일하게 Run Command, Patch Manager 등 사용 가능

#### 가격
- 무료 (Advanced Tier로 변경 시 시간당 $0.00695/instance)
- Advanced Tier는 인스턴스 1000개 이상 또는 Session Manager IP 로깅 필요 시

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **SSM Document Types** | Automation/Command/Policy/Session 등 | Day 4에서 자세히 |
| **Compliance** | Patch + Inventory 결과로 컴플라이언스 점수 | 자동 가시화 |
| **Quick Setup** | Config/SSM/Patch 한 번에 멀티 계정 활성화 | 신규 환경 부트스트랩 |
| **Application Manager** | 애플리케이션 단위 통합 운영 뷰 | 마이크로서비스 관리 |
| **Resource Explorer 통합** | SSM 콘솔에서 리소스 검색 | 운영 효율 |

> ⚠️ **함정 1**: Managed Instance가 안 되는 원인 1순위 = IAM Role 누락(`AmazonSSMManagedInstanceCore`). 2순위 = 네트워크 도달 불가.
>
> ⚠️ **함정 2**: 사설 VPC + 인터넷 차단 환경 → SSM 3개 Interface Endpoint 필수.
>
> 💡 **암기 팁**: SSM = "운영자의 군용 다용도 칼". CloudWatch는 보는 도구, SSM은 행동하는 도구.

### 관련 서비스 Cross-Reference

- **SSM → Week 3 Day 3** (CloudWatch Agent 배포)
- **SSM → Week 4 Day 3** (Config Auto Remediation)
- **SSM → Week 7** (Image Builder)
- **SSM → Week 9** (Secrets Manager + Parameter Store 연계)

---

## 🏗️ 아키텍처 다이어그램

```
SSM Managed Instance 등록 흐름
==========================================================

   [EC2 인스턴스]                  [온프레미스 서버]
        │                                │
        │ IAM Role:                       │ Activation Code
        │ AmazonSSMManagedInstanceCore    │ + Agent 설치
        │ + SSM Agent 실행                │
        │                                │
        └───────────┬────────────────────┘
                    │
                    ▼ Heartbeat
            ┌──────────────────────┐
            │   SSM Service        │
            │                      │
            │  - Run Command       │
            │  - Patch Manager     │
            │  - Session Manager   │
            │  - State Manager     │
            │  - Inventory         │
            │  - Automation        │
            └──────────────────────┘

  사설 VPC (인터넷 차단) 시 필요:
   - com.amazonaws.<region>.ssm (Interface Endpoint)
   - com.amazonaws.<region>.ssmmessages
   - com.amazonaws.<region>.ec2messages
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Managed Instance 조건 3가지**: Agent + IAM Role + 네트워크 도달
2. ⭐ **IAM Role: AmazonSSMManagedInstanceCore** — 표준 관리형 정책
3. ⭐ **사설 VPC = 3개 Interface Endpoint** (ssm / ssmmessages / ec2messages)
4. ⭐ **온프레미스 = Hybrid Activations** — `mi-xxx` ID로 EC2처럼 사용
5. ⭐ **Fleet Manager = SSH/RDP 없이 인스턴스 관리** — 키 분배 부담 X

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Managed Instance 목록 (헬스 체크)
aws ssm describe-instance-information \
  --query 'InstanceInformationList[*].[InstanceId,PingStatus,PlatformName,LastPingDateTime]' \
  --output table

# 2. 특정 인스턴스 상세
aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=i-0123456789abcdef0"

# 3. IAM Role 확인
aws ec2 describe-iam-instance-profile-associations \
  --filters "Name=instance-id,Values=i-0123456789abcdef0"

# 4. Inventory 수집 시작 (SSM Document)
aws ssm create-association \
  --association-name "DailyInventory" \
  --name "AWS-GatherSoftwareInventory" \
  --targets "Key=InstanceIds,Values=*" \
  --schedule-expression "rate(24 hours)" \
  --parameters '{
    "applications":["Enabled"],
    "awsComponents":["Enabled"],
    "networkConfig":["Enabled"],
    "windowsUpdates":["Enabled"],
    "instanceDetailedInformation":["Enabled"]
  }'

# 5. 특정 패키지 설치된 인스턴스 찾기 (Inventory 쿼리)
aws ssm get-inventory \
  --filters "Key=AWS:Application.Name,Values=mysql-server,Type=Equal"

# 6. Hybrid Activation 생성 (온프레미스용)
aws ssm create-activation \
  --description "Onprem DC1 servers" \
  --default-instance-name "onprem-dc1" \
  --iam-role "service-role/AmazonEC2RunCommandRoleForManagedInstances" \
  --registration-limit 100 \
  --expiration-date "2026-12-31T00:00:00Z"

# 출력의 ActivationCode + ActivationId를 온프레미스 서버에서:
# sudo amazon-ssm-agent -register \
#   -code "..." -id "..." -region "ap-northeast-2"

# 7. VPC Endpoint 생성 (사설 VPC용)
for service in ssm ssmmessages ec2messages; do
  aws ec2 create-vpc-endpoint \
    --vpc-id vpc-abc \
    --vpc-endpoint-type Interface \
    --service-name com.amazonaws.ap-northeast-2.$service \
    --subnet-ids subnet-abc subnet-xyz \
    --security-group-ids sg-ssm \
    --private-dns-enabled
done

# 8. Resource Data Sync로 Inventory를 S3에 통합
aws ssm create-resource-data-sync \
  --sync-name "InventoryToS3" \
  --s3-destination "BucketName=my-inventory-bucket,Region=ap-northeast-2,SyncFormat=JsonSerDe,Prefix=inventory"
```

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 SSM 콘솔의 Managed Instances 목록에 안 나타난다. 가장 먼저 점검할 것은?

A) Instance Profile에 `AmazonSSMManagedInstanceCore` 또는 동등 권한 부여 여부
B) AMI 종류
C) 보안 그룹의 인바운드 규칙
D) Region 설정

**정답: A**
해설: IAM 권한 누락이 1순위 원인. 그 외 Agent 미실행, 네트워크 도달 불가, 시간 동기화 문제도 가능.

---

**문제 2.** 회사가 사설 VPC에서 인터넷 차단된 EC2를 SSM으로 관리하려 한다. 필요한 것은?

A) NAT Gateway 추가
B) 3개 Interface Endpoint: ssm, ssmmessages, ec2messages
C) Public IP 부여
D) Hybrid Activation

**정답: B**
해설: 인터넷 없이 SSM 쓰려면 VPC Endpoint 필수. 세 서비스 모두 필요. NAT는 비용 증가, Public IP는 보안 위배. Hybrid Activation은 온프레미스용.

---

**문제 3.** 회사가 SSH 키 분배 부담을 없애고 안전하게 EC2 접속하려 한다. 적합한 도구는?

A) Bastion Host
B) Fleet Manager + Session Manager (Day 4에서 자세히) — 키 없이 IAM 기반 접속
C) VPN
D) AWS Direct Connect

**정답: B**
해설: Session Manager는 SSH/RDP 키 없이 IAM 권한으로 접속. Fleet Manager는 GUI로 그 위에 파일/프로세스 관리. 운영 보안 모범 사례.

---

**문제 4.** 회사가 온프레미스 서버 50대를 SSM으로 관리하려 한다. 어떤 절차?

A) 불가능 — SSM은 EC2만
B) Hybrid Activation 생성 → 서버에 Agent 설치 + Activation 등록 → `mi-xxx` ID 부여
C) Direct Connect 필요
D) Outposts 사용

**정답: B**
해설: Hybrid Activation으로 온프레미스/타 클라우드 VM도 SSM 관리 대상. 50대까지 무료 Tier, 그 이상은 Advanced Tier($0.00695/h).

---

**문제 5.** 운영팀이 "어떤 인스턴스에 MySQL 5.7이 설치돼 있나" 알고 싶다. 어떤 기능?

A) Run Command로 각 인스턴스에 쿼리
B) SSM Inventory + Resource Data Sync (S3 + Athena 또는 콘솔 쿼리)
C) CloudTrail
D) EC2 콘솔

**정답: B**
해설: Inventory가 모든 Managed Instance의 설치된 소프트웨어 수집. Resource Data Sync로 S3에 통합 후 Athena SQL. 또는 SSM 콘솔에서 직접 쿼리.

---

## 📌 오늘의 요약

1. SSM은 5대 카테고리(Operations/Application/Change/Node/Shared) — 운영자 핵심 도구
2. Managed Instance 조건: Agent 실행 + IAM Role(`AmazonSSMManagedInstanceCore`) + 네트워크 도달
3. 사설 VPC: 3개 Interface Endpoint (ssm, ssmmessages, ec2messages) 필수
4. 온프레미스/타 클라우드: Hybrid Activation으로 `mi-xxx` 등록 → EC2와 동일하게 사용
5. Fleet Manager(GUI 관리) + Inventory(SW/설정 수집) — 운영 가시화의 시작점
