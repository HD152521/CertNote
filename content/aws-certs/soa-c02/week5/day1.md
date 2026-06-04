# Day 1 - AWS Systems Manager: 운영자의 중앙 통제탑

새벽 2시, 보안팀으로부터 긴급 슬랙 메시지가 온다. "Log4Shell(CVE-2021-44228) 취약점 패치 지금 당장 전체 서버에 올려야 합니다." EC2 인스턴스가 300대다. SSH 키 다 찾고 Bastion 거쳐서 일일이 접속하면 날 샌다. 패치 스크립트는 있지만 어떻게 300대에 동시에 뿌릴 것인가. 이때 운영자가 꺼내는 도구가 AWS Systems Manager(SSM)다.

SSM은 2015년에 "EC2 Run Command"라는 이름으로 시작해, 지금은 Agent 기반 인스턴스 관리부터 설정 중앙화, 패치 자동화, 세션 감사, 복잡한 운영 자동화까지 아우르는 거대한 운영 플랫폼으로 진화했다. SOA-C02 시험에서 SSM은 전체 시험 문항의 15~20%를 차지한다고 봐도 과언이 아닐 만큼 비중이 크다. 오늘은 이 SSM의 전체 지형을 그리고, 운영자가 매일 확인해야 하는 Managed Instance의 조건과 트러블슈팅 방법을 파악한다.

## SSM이 탄생한 배경: 에이전트 기반 관리의 역사

SSM을 이해하려면 에이전트 기반 서버 관리(Agent-based management)의 역사를 알아야 한다. 2000년대 데이터센터에서는 Puppet(2005), Chef(2009), CFEngine이 서버 상태를 선언적으로 관리했다. 이들은 모두 에이전트가 주기적으로 중앙 서버에 체크인하는 "pull 모델"을 썼다. Ansible(2012)은 SSH 기반 "push 모델"로 에이전트 없이 동작했다.

AWS가 EC2를 대규모로 운영하면서 직면한 문제는 달랐다. SSH 키 분배 부담, 보안 그룹에 22번 포트를 열어야 하는 위험, 수천 대 서버에 동시에 명령을 보낼 때의 폭주 제어, 그리고 모든 운영 행위의 감사 가능성이었다. AWS가 2015년 내놓은 답이 SSM Agent + AWS 관리형 컨트롤 플레인의 조합이었다. 에이전트가 AWS API를 통해 heartbeat를 보내고 명령을 pull하는 구조를 택하면서, 운영자는 어떤 네트워크 환경에서도 인터넷이나 VPC Endpoint만 있으면 인스턴스를 제어할 수 있게 됐다.

> 💡 **관련 이론**: 에이전트 기반 관리는 분산 시스템의 "gossip protocol"과 유사하다. 각 에이전트가 주기적으로 중앙에 heartbeat를 보내고, 중앙은 그 상태를 집계한다. 분산 시스템 이론에서 이를 "failure detector"라고 부른다(Chandra & Toueg, 1996). SSM Agent의 heartbeat가 5분 이상 끊기면 `PingStatus=ConnectionLost`로 표시되는 것이 정확히 이 failure detector 패턴의 구현이다. 이 패턴은 AWS 내부적으로 EC2 heartbeat, ELB health check, RDS replication lag 모니터링에도 같은 원리로 적용된다.

## 다른 클라우드와 비교: SSM vs GCP OS Configuration vs Azure Arc

SSM의 위치를 정확히 이해하려면 경쟁 클라우드의 유사 서비스와 비교해야 한다.

| 기능 영역 | AWS SSM | GCP OS Config | Azure Arc | HashiCorp Boundary |
|-----------|---------|---------------|-----------|-------------------|
| 에이전트 기반 | SSM Agent (Go) | OSConfig Agent (Python) | Connected Machine Agent (.NET) | Boundary Worker |
| 명령 실행 | Run Command | VM Manager | Run Command Extension | — |
| 패치 관리 | Patch Manager | OS patch management | Update Management | — |
| 세션 접속 | Session Manager | IAP TCP Tunneling | Bastion | — |
| 설정 관리 | State Manager | Desired State Configuration | Azure Policy Guest Config | — |
| 포트 불필요 | 22/3389 불필요 | 22/3389 불필요 | 22/3389 불필요 | 불필요 |
| 온프레미스 | Hybrid Activations | Anthos | Arc-enabled servers | 모든 환경 |
| 비용 모델 | EC2 포함 (Standard Tier 무료) | 관리형 VM 요금 추가 | 서버당 월 $5 (Arc-enabled) | 오픈소스 무료 |

AWS SSM의 차별점은 **IAM과의 완전한 통합** 및 **CloudWatch, S3와의 자동 연계**다. Azure Arc는 하이브리드 환경에서 더 유연하지만 비용이 높다.

> 💡 **관련 이론**: "에이전트 없는 SSH 기반"(Ansible 방식)과 "에이전트 기반"(SSM 방식)의 근본적 차이는 보안 경계 설계에 있다. SSH 기반은 관리 서버가 피관리 서버에 인바운드 연결을 시작한다. 에이전트 기반은 피관리 서버가 관리 서버에 아웃바운드 연결을 시작한다. 방화벽 관점에서 아웃바운드 HTTPS(443)는 거의 어디서나 허용되지만, 인바운드 SSH(22)는 차단이 기본인 환경이 많다. 이것이 SSM이 "에이전트 pull 모델"을 선택한 보안 아키텍처 이유다. RFC 793(TCP) 기반의 SSH와 달리 SSM은 AWS SigV4 서명된 HTTPS 위에서 동작해 mTLS 수준의 인증을 제공한다.

## SSM의 5대 카테고리: 운영자의 지형도

SSM은 단일 서비스가 아니라 여러 기능의 집합이다. AWS 콘솔에서 Systems Manager에 들어가면 왼쪽 사이드바에 수십 개의 메뉴가 펼쳐진다. 이걸 5개 카테고리로 묶으면 전체 지형이 보인다.

| 카테고리 | 핵심 기능 | 운영자 일상 사용 빈도 |
|----------|-----------|----------------------|
| **Operations Management** | OpsCenter, Incident Manager, Explorer | 인시던트 추적, 운영 대시보드 |
| **Application Management** | Parameter Store, AppConfig, Application Manager | 설정 중앙화, Feature Flag |
| **Change Management** | Change Manager, Automation, Change Calendar, Maintenance Window | 변경 통제, 자동화 워크플로 |
| **Node Management** | Fleet Manager, Run Command, Session Manager, Patch Manager, State Manager, Inventory, Compliance, Distributor, Hybrid Activations | 인스턴스 상태 관리의 핵심 |
| **Shared Resources** | SSM Documents, Quick Setup | 모든 기능의 기반 레이어 |

SOA-C02 시험에서는 Node Management 카테고리(특히 Run Command, Session Manager, Patch Manager, State Manager)가 집중 출제된다. 오늘은 이 모든 기능의 전제 조건인 **Managed Instance**와 **SSM Agent** 그리고 Fleet Manager, Inventory를 깊이 파고든다.

## SSM Agent: 인스턴스와 AWS의 연결고리

SSM Agent는 Go 언어로 작성된 오픈소스 소프트웨어다(GitHub: aws/amazon-ssm-agent). Agent는 세 가지 채널을 통해 SSM 서비스와 통신한다.

- `com.amazonaws.<region>.ssm`: 제어 채널. Heartbeat, 명령 수신
- `com.amazonaws.<region>.ssmmessages`: 세션 채널. Session Manager 트래픽
- `com.amazonaws.<region>.ec2messages`: EC2 메타데이터 채널. Run Command 결과 반환

모두 HTTPS(443)를 사용한다. 즉, 포트 22(SSH)나 3389(RDP)를 열 필요가 전혀 없다.

**Agent가 자동 설치되는 OS:**

Amazon Linux 2/2023, Ubuntu 16.04 이상(최신 AMI 기준), Windows Server 2016/2019/2022, macOS(일부 인스턴스 유형). 그 외 OS(RHEL, SUSE, Debian, CentOS 등)는 패키지 매니저로 수동 설치한다.

```bash
# Amazon Linux 2 - 이미 설치됨, 버전 확인만
sudo systemctl status amazon-ssm-agent
amazon-ssm-agent --version

# Ubuntu 수동 설치
wget https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_amd64/amazon-ssm-agent.deb
sudo dpkg -i amazon-ssm-agent.deb
sudo systemctl enable amazon-ssm-agent && sudo systemctl start amazon-ssm-agent

# RHEL/CentOS
sudo yum install -y amazon-ssm-agent
sudo systemctl enable amazon-ssm-agent && sudo systemctl start amazon-ssm-agent
```

> 🔍 **더 깊이**: SSM Agent는 AWS API를 통해 Long Polling 방식으로 명령을 대기한다. AWS SQS와 유사한 메커니즘으로, Agent가 주기적으로 "나에게 실행할 명령이 있는가?"를 SSM 서비스에 묻는다. 이 방식은 Agent가 방화벽 뒤에 있어도 외부에서 인바운드 연결 없이 명령을 받을 수 있게 해준다. 2022년부터는 AWS PrivateLink를 통해 VPC 내에서만 통신하는 것도 가능해졌다. Agent가 내부적으로 사용하는 polling 간격은 5~15초이며, `amazon-ssm-agent.log`에서 `Polling for messages` 메시지로 확인할 수 있다.

## Managed Instance가 되기 위한 3가지 조건

SSM이 인스턴스를 제어하려면 그 인스턴스가 "Managed Instance"로 등록돼야 한다. 조건은 세 가지이고, 세 가지 모두 충족해야 한다.

**조건 1: SSM Agent 실행 중**
Agent가 설치되어 있어도 서비스가 중단되어 있으면 연결되지 않는다.

**조건 2: IAM 권한 (Instance Profile)**
인스턴스에 부착된 IAM Role에 `AmazonSSMManagedInstanceCore` 정책이 필요하다. 이 정책이 허용하는 핵심 API는 다음과 같다.

```
ssm:RegisterManagedInstance
ssm:DescribeInstanceInformation
ssm:GetDocument
ssm:GetParameters
ssm:PutComplianceItems
ec2messages:GetMessages
ssmmessages:CreateControlChannel
ssmmessages:OpenControlChannel
```

> ⚠️ **함정**: `AmazonSSMManagedInstanceCore`는 AWS 관리형 정책이라 내용이 변경될 수 있다. 커스텀 정책으로 최소 권한을 구성할 때 위의 API 목록을 기반으로 한다. 시험에서 "Managed Instance가 안 되는 원인 1순위 = IAM Role 누락"으로 출제된다. 또 한 가지 흔한 실수: IAM Role은 있지만 EC2 **Instance Profile**에 붙이지 않은 경우다. IAM Role과 Instance Profile은 별개 개념으로, EC2가 Role을 사용하려면 Instance Profile로 감싸서 부착해야 한다.

**조건 3: SSM 서비스 엔드포인트 네트워크 도달 가능**
인스턴스가 SSM 서비스와 통신할 수 있어야 한다. 퍼블릭 서브넷 + 인터넷 게이트웨이면 자동으로 통신된다. **사설 VPC(인터넷 차단)에서는 VPC Endpoint가 필요하다.**

```
# 사설 VPC에서 필요한 3개 Interface Endpoint
com.amazonaws.<region>.ssm
com.amazonaws.<region>.ssmmessages  
com.amazonaws.<region>.ec2messages

# S3 Gateway Endpoint도 필요 (SSM Document, Output 저장용)
com.amazonaws.<region>.s3
```

> 📚 **사례**: 2021년, 금융권 A사가 보안 컴플라이언스를 위해 완전 사설 VPC(모든 인터넷 차단) 환경으로 전환했다. EC2 인스턴스 200대에 SSM Agent가 설치되어 있었지만 VPC Endpoint를 구성하지 않아 모두 `PingStatus=ConnectionLost`로 빠졌다. 운영팀이 원인을 찾는 데 4시간을 소비했는데, 단순히 3개 Interface Endpoint를 생성하고 보안 그룹에서 443 포트를 허용하자마자 해결됐다. 교훈: 사설 VPC = VPC Endpoint 3개는 무조건 구성 목록에 넣는다. VPC Endpoint 보안 그룹은 EC2 서브넷 CIDR에서 443 인바운드를 허용해야 하며, Endpoint DNS 이름이 Private DNS로 해석되도록 `PrivateDnsEnabled=true`를 확인해야 한다.

## Default Host Management Configuration (DHMC)

2022년 말에 출시된 DHMC는 게임 체인저다. 기존에는 EC2 인스턴스를 만들 때 반드시 IAM Instance Profile을 부착해야 SSM이 동작했다. DHMC를 활성화하면 Instance Profile 없이도 모든 EC2가 Managed Instance로 자동 등록된다.

```bash
# DHMC 활성화 (리전 단위)
aws ssm update-service-setting \
  --setting-id arn:aws:ssm:ap-northeast-2:123456789012:servicesetting/ssm/managed-instance/default-ec2-instance-management-role \
  --setting-value "service-role/AWSSystemsManagerDefaultEC2InstanceManagementRole"
```

내부적으로 AWS가 `AWSSystemsManagerDefaultEC2InstanceManagementRole`이라는 서비스 연결 역할을 자동 생성하고 모든 EC2에 적용한다. 운영자가 각 인스턴스마다 IAM Role을 신경 쓰지 않아도 되는 "무마찰 운영"의 시작점이다.

> 💡 **관련 이론**: DHMC는 "Convention over Configuration"(CoC) 설계 원칙의 AWS 구현이다. Ruby on Rails가 대중화한 이 원칙은 "합리적 기본값을 제공하고, 사용자가 차이점만 설정하게 하라"는 것이다. 운영자가 새 EC2를 만들 때마다 IAM Role을 명시적으로 붙여야 했던 기존 방식은 "Configuration over Convention"이었다. DHMC는 "Zero-config SSM 등록"을 가능하게 해 2023년 이후 AWS Well-Architected의 운영 효율성 모범 사례로 권장된다. 단, DHMC가 적용된 인스턴스는 커스텀 Instance Profile이 없으므로, S3 접근이나 Secrets Manager 참조 같은 추가 권한이 필요한 경우 별도 Role을 부착해야 한다.

## Managed Instance 상태 확인과 트러블슈팅

```bash
# 전체 Managed Instance 목록과 PingStatus
aws ssm describe-instance-information \
  --query 'InstanceInformationList[*].[InstanceId,PingStatus,PlatformName,PlatformVersion,IPAddress,LastPingDateTime]' \
  --output table

# PingStatus 기준
# Online: 정상 (마지막 ping 5분 이내)
# ConnectionLost: 마지막 ping 5분 초과 (Agent 중단 또는 네트워크 문제)
# Inactive: 인스턴스 종료됨

# 특정 인스턴스 상세
aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=i-0123456789abcdef0"
```

**ConnectionLost 트러블슈팅 순서:**

1. EC2 인스턴스 상태 확인 (`running`인가?)
2. IAM Role 확인 (`AmazonSSMManagedInstanceCore` 포함인가?)
3. SSM Agent 서비스 상태 확인 (인스턴스에 직접 접속 필요 시 EC2 Serial Console 활용)
4. 네트워크 확인 (퍼블릭 VPC면 인터넷 게이트웨이 존재하는가, 사설 VPC면 VPC Endpoint 3개 있는가)
5. 시간 동기화 확인 (Agent는 NTP 시간 오차가 크면 API 서명 실패로 연결 불가)

> 🔍 **더 깊이**: SSM Agent가 AWS API를 호출할 때 AWS Signature Version 4(SigV4)를 사용한다. SigV4는 현재 UTC 시각을 서명에 포함시키는데, 인스턴스 시계가 5분 이상 오차가 나면 `RequestExpired` 오류로 API 요청이 거부된다. 이때 CloudWatch Logs나 `/var/log/amazon/ssm/amazon-ssm-agent.log`에 시간 오류가 찍힌다. EC2 인스턴스는 기본적으로 Amazon Time Sync Service(169.254.169.123)를 NTP 서버로 사용하므로 VPC 내에서 이 주소로 UDP 123 포트가 막혀 있지 않은지도 확인 대상이다. SigV4 알고리즘(RFC 4634 기반 HMAC-SHA256)은 타임스탬프 오차를 ±5분으로 제한하는데, 이는 replay attack을 막기 위한 표준 보안 메커니즘이다(AWS Signature Version 4 사양, 2023).

## Session Manager: SSH 없는 보안 세션의 내부 동작

Session Manager는 SSM의 핵심 기능 중 하나로, SSH/RDP 없이 인스턴스에 안전하게 접속한다. 내부 동작을 이해하면 트러블슈팅이 쉬워진다.

```
[운영자 브라우저/CLI]
      │
      │ AWS API: ssm:StartSession (IAM 인증)
      ▼
[SSM Service]
      │
      │ ssmmessages 채널 (WebSocket over HTTPS 443)
      ▼
[SSM Agent on EC2]
      │
      │ 로컬 셸 (bash, powershell)
      ▼
[인스턴스 내부 명령 실행]
      │
      │ 세션 로그 → S3 버킷 / CloudWatch Logs (암호화)
      ▼
[감사 기록 보존]
```

**Session Manager 핵심 기능: 포트 포워딩**

포트 포워딩은 보안 그룹에 포트를 열지 않고도 로컬 포트를 원격 서비스에 연결한다.

```bash
# 원격 EC2의 3306(MySQL)을 로컬 13306으로 포워딩
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'

# 이후 로컬에서: mysql -h 127.0.0.1 -P 13306 -u admin -p

# 원격 서비스 포트 포워딩 (EC2에서 접근 가능한 RDS 엔드포인트)
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["mydb.abc.ap-northeast-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}'
```

**세션 로깅 설정 (S3 + CloudWatch Logs):**

```bash
# SSM Session Manager 기본 설정
aws ssm update-document \
  --name "SSM-SessionManagerRunShell" \
  --content '{
    "schemaVersion": "1.0",
    "description": "Document to hold regional settings for Session Manager",
    "sessionType": "Standard_Stream",
    "inputs": {
      "s3BucketName": "my-session-logs",
      "s3KeyPrefix": "sessions",
      "s3EncryptionEnabled": true,
      "cloudWatchLogGroupName": "/ssm/session-manager",
      "cloudWatchEncryptionEnabled": true,
      "cloudWatchStreamingEnabled": true,
      "kmsKeyId": "arn:aws:kms:ap-northeast-2:123456789012:key/abc-123",
      "runAsEnabled": true,
      "runAsDefaultUser": ""
    }
  }' \
  --document-version "\$LATEST"
```

> 📚 **사례**: 2022년, 핀테크 스타트업 B사가 PCI-DSS Level 1 감사를 준비하면서 "모든 서버 접속 세션이 감사 가능해야 한다"는 요구사항을 받았다. 기존 Bastion + SSH 방식으로는 세션 내용 로깅이 어려웠다. Session Manager로 전환하고 KMS 암호화 S3 세션 로그 + CloudWatch Logs를 설정했다. 감사관은 "특정 날짜 특정 운영자가 어떤 명령을 실행했는가"를 S3에서 즉시 조회할 수 있었고, PCI-DSS 10.2.1 요구사항(감사 로그)을 충족했다. 포트 22는 전사 보안 그룹 정책으로 완전 차단됐다.

## Fleet Manager: SSH/RDP 없는 GUI 관리

Fleet Manager는 모든 Managed Instance를 콘솔에서 시각적으로 관리하는 도구다. 핵심은 **SSH나 RDP 연결 없이 인스턴스 내부를 볼 수 있다**는 것이다.

Fleet Manager가 제공하는 기능:

| 기능 | 설명 | 기존 방식 대비 |
|------|------|----------------|
| **File System Browser** | 인스턴스 내 파일/디렉토리 탐색, 다운로드, 업로드 | scp, sftp 없이 |
| **Process Manager** | 실행 중 프로세스 목록, 강제 종료 | top, kill 없이 |
| **Users and Groups** | Linux/Windows 사용자·그룹 관리 | useradd, usermod 없이 |
| **Performance Counters** | CPU, 메모리, 디스크 IO 실시간 | CloudWatch 보조 |
| **Registry Editor** | Windows 레지스트리 편집 | regedit 없이 |
| **Patch Management** | 패치 상태 확인 및 즉시 적용 | — |

> ⚠️ **함정**: Fleet Manager의 File System Browser는 SSM Agent를 통해 동작한다. 따라서 Managed Instance 조건이 충족되어야만 사용 가능하다. "SSH 없이 파일을 볼 수 있어?" 라는 질문에 "Fleet Manager"가 정답이지만, 전제 조건인 Managed Instance 등록이 먼저다. 또한 Fleet Manager Node Detail 페이지의 "Remote Desktop" 기능은 Session Manager RDP 세션을 브라우저로 열어주는 것으로, RDP 클라이언트 없이도 Windows 인스턴스에 그래픽 접속이 가능하다 — 단, RDP(3389) 포트는 여전히 보안 그룹에서 열 필요가 없다(SSM 터널 경유).

## Inventory: 자산 인벤토리의 중앙화

Inventory는 모든 Managed Instance의 소프트웨어·설정 정보를 정기적으로 수집해 SSM 데이터베이스에 저장한다. "MySQL 5.7이 설치된 인스턴스가 몇 대인가?", "Python 2.7을 아직 쓰는 서버가 있는가?", "어떤 서버가 Log4j 1.x를 쓰는가?" 같은 질문에 즉시 답할 수 있다.

**수집 가능한 데이터 유형:**

| 유형 | 내용 |
|------|------|
| `AWS:Application` | 설치된 모든 애플리케이션 (이름, 버전, 제조사) |
| `AWS:AWSComponent` | AWS CLI, CloudFormation Agent 등 AWS 컴포넌트 |
| `AWS:WindowsUpdate` | 적용된 Windows KB 번호 |
| `AWS:WindowsRole` | IIS, DHCP Server 등 Windows 역할 |
| `AWS:Network` | 네트워크 어댑터, IP, MAC 주소 |
| `AWS:InstanceInformation` | OS, 커널 버전, SSM Agent 버전 |
| `AWS:Services` | Windows 서비스 목록 |
| `AWS:File` | 특정 경로 파일 수집 (Custom) |
| `Custom:*` | 사용자 정의 JSON (운영자가 원하는 모든 데이터) |

**Inventory 활성화 (State Manager Association):**

```bash
aws ssm create-association \
  --association-name "DailyInventory" \
  --name "AWS-GatherSoftwareInventory" \
  --targets '[{"Key":"InstanceIds","Values":["*"]}]' \
  --schedule-expression "rate(24 hours)" \
  --parameters '{
    "applications":["Enabled"],
    "awsComponents":["Enabled"],
    "networkConfig":["Enabled"],
    "windowsUpdates":["Enabled"],
    "instanceDetailedInformation":["Enabled"],
    "services":["Enabled"],
    "windowsRoles":["Enabled"]
  }'
```

**Resource Data Sync로 S3에 통합 후 Athena 분석:**

```bash
# S3로 Inventory 데이터 동기화
aws ssm create-resource-data-sync \
  --sync-name "InventoryToS3" \
  --s3-destination '{
    "BucketName":"my-inventory-bucket",
    "Region":"ap-northeast-2",
    "SyncFormat":"JsonSerDe",
    "Prefix":"inventory"
  }'

# Athena에서 Log4j 설치 인스턴스 쿼리 (예시)
# SELECT resourceid, name, version
# FROM "ssm_inventory"."aws_application"
# WHERE name LIKE 'log4j%' AND version < '2.15.0'
```

> 📚 **사례**: 2021년 12월 Log4Shell(CVE-2021-44228) 취약점 발표 직후, SSM Inventory를 운영하던 회사들은 30분 만에 "Log4j 1.x 또는 2.0~2.14를 쓰는 서버 목록"을 뽑아냈다. Inventory가 없던 회사들은 수동 점검에 며칠이 걸렸다. 이 사건 이후 "Inventory + Resource Data Sync"는 보안 컴플라이언스 필수 도구로 자리 잡았다. NIST SP 800-171(CUI 보호)의 3.4.1 요구사항("베이스라인 구성 수립 및 유지")이 정확히 이 Inventory 데이터로 증빙 가능하다.

> 🔍 **더 깊이**: Inventory의 `Custom:*` 유형은 운영자가 SSM Document를 직접 작성해 임의의 JSON을 수집할 수 있게 한다. 예를 들어 "현재 실행 중인 Docker 컨테이너 목록"이나 "crontab 항목"을 수집하는 커스텀 인벤토리 스크립트를 작성할 수 있다. 수집된 데이터는 `Custom:<타입명>` 형태로 SSM 데이터베이스에 저장된다. Resource Data Sync로 S3에 모으면 AWS Glue + Athena로 SQL 분석, QuickSight로 시각화까지 연결된다. 이 패턴은 CMDB(Configuration Management Database)를 AWS 네이티브로 구현하는 방법이다.

## Hybrid Activations: 온프레미스도 동일하게

클라우드로 전환 중인 회사는 온프레미스 서버와 EC2를 동시에 운영한다. Hybrid Activations는 온프레미스 서버나 다른 클라우드(GCP, Azure)의 VM을 SSM Managed Instance로 등록해 EC2와 동일한 도구로 관리할 수 있게 한다.

**등록 과정:**

```bash
# 1단계: 관리 계정에서 Activation 생성
aws ssm create-activation \
  --description "온프레미스 DC1 서버군" \
  --default-instance-name "onprem-dc1" \
  --iam-role "service-role/AmazonEC2RunCommandRoleForManagedInstances" \
  --registration-limit 100 \
  --expiration-date "2026-12-31T00:00:00Z"

# 출력 예시:
# {
#   "ActivationId": "aact-0f1a2b3c4d5e6f7a8",
#   "ActivationCode": "ABCdef123456GHIjkl"
# }

# 2단계: 온프레미스 서버에서 Agent 설치 후 등록
sudo amazon-ssm-agent -register \
  -code "ABCdef123456GHIjkl" \
  -id "aact-0f1a2b3c4d5e6f7a8" \
  -region "ap-northeast-2"

# 등록 완료 후 mi-xxxxxxxxxxxxxxxxx 형식의 ID 부여
# 이후 EC2와 완전히 동일하게 Run Command, Patch Manager, Session Manager 사용 가능
```

**비용 구조:**

- Standard Tier: 월 1,000개 인스턴스까지 무료
- Advanced Tier: 시간당 $0.00695/인스턴스 (대규모 온프레미스 관리 또는 Session Manager 세션 로깅 필요 시)

> 💡 **관련 이론**: Hybrid Activations의 아이디어는 "unified control plane" 아키텍처에서 나온다. Google의 Anthos(GKE + 온프레미스), Azure Arc(모든 환경 통합 관리)가 같은 개념을 구현했다. 어떤 환경의 워크로드든 단일 컨트롤 플레인으로 관리하는 것은 멀티클라우드·하이브리드 시대의 핵심 운영 패턴이다. CNCF(Cloud Native Computing Foundation)에서 이 패턴을 "Crossplane"이라는 오픈소스로 구현하고 있다. SOA-C02 시험에서 "온프레미스 서버도 SSM으로 관리하려면?"이라는 질문의 정답은 항상 Hybrid Activations다.

## SSM vs 경쟁 도구 비교

| 기능 영역 | SSM | Ansible | Chef/Puppet | 물리적 Bastion+SSH |
|-----------|-----|---------|-------------|-------------------|
| 에이전트 | 있음 (pull 기반) | 없음 (push, SSH) | 있음 (pull 기반) | 없음 |
| 클라우드 통합 | Native (IAM, CloudWatch, S3) | 플러그인 | 플러그인 | 없음 |
| 감사(Audit) | 내장 (CloudWatch, S3) | 별도 구성 | 별도 구성 | 없음 |
| 멀티 OS | O | O | O | O |
| 온프레미스 | Hybrid Activations | O | O | O |
| 비용 | 포함 (EC2에) | 오픈소스 | 유료 라이선스 | EC2 비용 |
| 포트 요구 | HTTPS 443만 | SSH 22 | Agent 8140 | SSH 22 |

SSM의 최대 장점은 AWS 생태계 내 완전한 통합이다. IAM으로 접근 제어, CloudWatch로 로그 수집, S3로 결과 저장, EventBridge로 자동화 트리거까지 별도 도구 없이 연결된다.

## 전체 아키텍처 그림

```
SSM Managed Instance 등록 흐름
============================================================

  [퍼블릭 EC2]               [사설 EC2]              [온프레미스]
      │                          │                        │
      │ IAM Role(Core)           │ IAM Role(Core)         │ Activation
      │ + Agent 실행             │ + Agent 실행           │ Code/ID
      │                          │ + VPC Endpoint 3개     │ + Agent 설치
      └─────────────┬────────────┘                        │
                    │                                      │
                    │ Heartbeat (HTTPS 443)                │
                    ▼                                      │
           ┌─────────────────────────────────────────────────┐
           │           SSM Service (Regional)                 │
           │                                                  │
           │  Fleet Manager   Inventory    Hybrid Activations │
           │  Run Command     State Manager                   │
           │  Session Manager Patch Manager                   │
           │  Automation      Compliance                      │
           └─────────────────────────────────────────────────┘
                    │
                    ▼ (결과 저장)
           ┌──────────────────┐
           │  S3  CloudWatch  │
           │  Logs / Metrics  │
           └──────────────────┘

사설 VPC 필수 VPC Endpoints:
  • com.amazonaws.ap-northeast-2.ssm         (Interface)
  • com.amazonaws.ap-northeast-2.ssmmessages  (Interface)
  • com.amazonaws.ap-northeast-2.ec2messages  (Interface)
  • com.amazonaws.ap-northeast-2.s3           (Gateway - 무료)
```

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 SSM Managed Instances 목록에 나타나지 않는다. 인스턴스는 실행 중이며, Amazon Linux 2 최신 AMI를 사용한다. 가장 먼저 확인해야 할 항목은?

A) AMI에 SSM Agent가 포함되어 있는지 확인한다
B) Instance Profile에 `AmazonSSMManagedInstanceCore` 정책이 포함된 IAM Role이 부착되어 있는지 확인한다
C) 보안 그룹에 포트 22 인바운드가 허용되어 있는지 확인한다
D) 인스턴스가 퍼블릭 서브넷에 있는지 확인한다

**정답: B**
해설: Amazon Linux 2 최신 AMI에는 SSM Agent가 기본 설치되어 있으므로 A는 이미 충족됐을 가능성이 높다. SSM은 포트 22를 사용하지 않으므로 C는 관계없다. 퍼블릭/프라이빗 서브넷은 추가 조건(VPC Endpoint)에 영향을 주지만 가장 먼저 확인해야 할 것은 IAM Role 누락이다. Managed Instance가 안 되는 원인 1순위가 IAM 권한 누락이다. 확인 명령: `aws ec2 describe-iam-instance-profile-associations --filters "Name=instance-id,Values=i-xxx"`

---

**문제 2.** 회사가 완전한 사설 VPC(인터넷 게이트웨이 없음)에서 EC2 인스턴스를 SSM으로 관리하려 한다. IAM Role은 이미 올바르게 설정되어 있다. 추가로 필요한 것은?

A) NAT Gateway 생성
B) 인터넷 게이트웨이 추가
C) 세 개의 VPC Interface Endpoint 생성: ssm, ssmmessages, ec2messages
D) Bastion Host 설정

**정답: C**
해설: SSM Agent는 HTTPS(443)를 통해 SSM 서비스 엔드포인트에 연결한다. 인터넷이 없는 사설 VPC에서는 VPC Interface Endpoint로 AWS 내부 백본을 통해 통신한다. NAT Gateway는 인터넷 경유이고, Bastion은 SSH 기반으로 SSM의 목적과 무관하다. S3 Gateway Endpoint도 함께 생성하는 것이 표준(Document 다운로드, 결과 저장용). 각 Endpoint의 보안 그룹은 EC2 서브넷에서 443 인바운드를 허용해야 한다.

---

**문제 3.** 운영팀이 "현재 우리 인프라에서 Python 2.7이 설치된 EC2가 몇 대인가?"를 알고 싶다. 가장 적합한 도구와 방법은?

A) 각 EC2에 Run Command로 `python --version`을 실행한다
B) CloudTrail에서 Python 관련 이벤트를 검색한다
C) SSM Inventory를 활성화하고 `AWS:Application` 데이터에서 Python 2.7을 필터링한다
D) Config Rules를 통해 Python 버전을 확인한다

**정답: C**
해설: Inventory는 모든 Managed Instance의 설치된 소프트웨어를 주기적으로 수집한다. `AWS:Application` 유형에 이름과 버전이 포함된다. Resource Data Sync로 S3에 모으면 Athena SQL로 대규모 분석이 가능하다. Run Command(A)도 동작하지만 일회성이고 결과를 집계하기 어렵다. Inventory는 한 번 설정하면 모든 인스턴스의 소프트웨어 현황을 지속적으로 추적한다.

---

**문제 4.** 온프레미스 데이터센터에 서버 80대가 있고, 이 서버들에 SSM을 통해 Run Command와 Patch Manager를 적용하려 한다. 가장 적합한 접근 방법은?

A) SSM은 EC2만 지원하므로 불가능하다
B) 온프레미스 서버에 Direct Connect를 통해 VPN을 구성한다
C) Hybrid Activations를 생성하고 각 서버에 SSM Agent를 설치 후 Activation Code/ID로 등록한다
D) AWS Outposts를 데이터센터에 설치한다

**정답: C**
해설: Hybrid Activations는 정확히 이 목적을 위해 만들어진 기능이다. Activation 생성 후 서버에 Agent 설치 + 등록 과정을 거치면 `mi-xxxxxxxxx` 형식의 ID가 부여된다. 이후 EC2와 완전히 동일하게 Run Command, Patch Manager, Session Manager를 사용할 수 있다. 80대까지는 Standard Tier(무료) 범위 내이므로 추가 비용 없이 사용 가능하다.

---

**문제 5.** 회사가 EC2 접속 시 SSH 키 분배 부담을 없애고, 모든 접속 세션을 자동으로 감사 로그로 남기려 한다. 동시에 포트 22를 보안 그룹에서 완전히 닫고 싶다. 가장 적합한 도구는?

A) Bastion Host를 통한 SSH 접속
B) AWS VPN + SSH 키 관리
C) Session Manager (SSM) - IAM 기반 접속, 자동 세션 로깅, 포트 22 불필요
D) EC2 Instance Connect

**정답: C**
해설: Session Manager는 IAM 권한으로 접속하며 포트 22가 전혀 필요 없다. 모든 세션 내용이 S3 또는 CloudWatch Logs에 자동으로 저장된다. EC2 Instance Connect(D)는 일시적인 SSH 키를 푸시하는 방식으로 포트 22가 필요하다. Session Manager는 운영 보안 모범 사례로, PCI-DSS, HIPAA 환경에서 특히 권장된다. 포트 포워딩 기능으로 RDS, Redis 등 내부 서비스에도 SSH 없이 직접 접근 가능하다.

---

**문제 6.** Default Host Management Configuration(DHMC)에 대한 설명으로 옳은 것은?

A) 모든 EC2 인스턴스에 자동으로 SSM Agent를 설치한다
B) Instance Profile(IAM Role) 없이도 EC2가 SSM Managed Instance로 등록될 수 있게 한다
C) Hybrid Activations 없이 온프레미스 서버를 등록할 수 있다
D) Session Manager의 로깅을 자동으로 활성화한다

**정답: B**
해설: DHMC는 계정 레벨에서 활성화하면 AWS가 서비스 연결 역할을 생성해 모든 EC2에 자동 적용한다. 이로 인해 개별 인스턴스마다 IAM Role을 부착하는 번거로움이 사라진다. 단, Agent 설치는 별도이고 네트워크 조건도 여전히 필요하다. DHMC는 Instance Profile 부재로 인한 Managed Instance 등록 실패를 근본적으로 방지한다.

---

**문제 7.** Session Manager 세션 로그를 S3에 저장할 때 보안을 강화하려 한다. 어떤 구성이 필요한가?

A) S3 버킷 공개 접근 차단만 설정한다
B) Session Manager 기본 설정에서 `s3EncryptionEnabled: true` + KMS 키 지정 + S3 버킷 서버 측 암호화 활성화
C) CloudWatch Logs에만 저장한다
D) 세션 로그는 암호화할 수 없다

**정답: B**
해설: Session Manager 세션 로그의 완전한 보안을 위해서는 (1) Session Manager 설정에서 `s3EncryptionEnabled: true`, (2) KMS CMK 지정(`kmsKeyId`), (3) S3 버킷 자체에 SSE-KMS 활성화, 세 가지가 모두 필요하다. CloudWatch Logs에도 `cloudWatchEncryptionEnabled: true`로 설정해야 한다. 이렇게 하면 세션 중 타이핑한 모든 명령과 출력이 암호화되어 저장된다. PCI-DSS 3.4와 HIPAA Security Rule이 요구하는 저장 데이터 암호화를 충족한다.

---
