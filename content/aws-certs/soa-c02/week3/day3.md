# Day 3 - CloudWatch Agent (메모리/디스크 + 통합 로그 수집)

📅 날짜: Week 3 (Day 3)
🎯 주제: CloudWatch Agent 설치·설정·트러블슈팅
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Agent의 역할(EC2/온프레미스 메트릭·로그 수집)을 이해한다
- Agent 설정 파일(JSON) 구조와 SSM Parameter Store 연동을 익힌다
- Agent 배포 자동화(SSM Run Command, State Manager) 패턴을 안다

---

## 🧩 사전 지식 (CS 기초)

- **Agent 기반 vs Agentless 모니터링**: 에이전트 = 더 풍부한 데이터, 관리 부담. 클라우드는 둘 다 혼용
- **collectd / StatsD**: 유닉스 메트릭 수집 표준. CloudWatch Agent도 지원
- **systemd 서비스**: 리눅스 데몬 관리. Agent도 systemd로 실행
- **WMI / Performance Counter**: Windows 메트릭 수집 방식. Agent가 추상화

---

## 📖 이론 내용

### 1. CloudWatch Agent란

#### 왜 필요한가
- EC2 기본 메트릭은 CPU, 네트워크, 디스크 I/O까지 → **메모리·디스크 사용률(여유)·프로세스는 자동 수집 X**
- 게스트 OS 내부 로그 파일을 CloudWatch Logs로 보내고 싶을 때
- 온프레미스 서버도 CloudWatch에 통합 모니터링

#### 지원 환경
- EC2 (Linux/Windows)
- ECS / EKS (사이드카로)
- 온프레미스 서버
- Lambda는 자체 통합되어 있음 (Agent 불필요)

### 2. 수집 가능한 데이터

#### 메트릭
- **CPU**: idle, user, system, iowait 등 세분화
- **메모리**: used_percent, available, swap
- **디스크**: used_percent (파일시스템별), inodes
- **네트워크**: 인터페이스별 in/out
- **프로세스**: 실행 중 프로세스 수, 상태별 분류
- **사용자 지정**: collectd, StatsD 형식
- **NVIDIA GPU**: GPU 메트릭

#### 로그
- 임의의 로그 파일 (path 지정)
- Windows Event Log (Application, System, Security)
- 멀티라인 로그 (stack trace 등)
- syslog, journald (Linux)

### 3. 설치 방법

#### 방법 1: SSM Run Command (권장)
```bash
aws ssm send-command \
  --document-name "AWS-ConfigureAWSPackage" \
  --parameters action=Install,name=AmazonCloudWatchAgent \
  --targets "Key=instanceids,Values=i-abc"
```

#### 방법 2: User Data 스크립트 (인스턴스 부팅 시)
```bash
#!/bin/bash
yum install -y amazon-cloudwatch-agent
```

#### 방법 3: AMI에 미리 포함 (Golden AMI)
- EC2 Image Builder로 Agent 포함 AMI 빌드

### 4. 설정 파일 구조

#### 설정 마법사 실행
```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```
→ 대화형으로 설정 JSON 생성, `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`에 저장.

#### 예시 설정 (Linux)
```json
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "cwagent"
  },
  "metrics": {
    "namespace": "MyApp/EC2",
    "append_dimensions": {
      "InstanceId": "${aws:InstanceId}",
      "AutoScalingGroupName": "${aws:AutoScalingGroupName}"
    },
    "metrics_collected": {
      "mem": {
        "measurement": ["mem_used_percent", "mem_available_percent"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "resources": ["/", "/var"],
        "measurement": ["used_percent", "inodes_free"],
        "metrics_collection_interval": 60
      },
      "cpu": {
        "totalcpu": true,
        "measurement": ["usage_user", "usage_system", "usage_iowait"]
      },
      "procstat": [
        { "exe": "nginx", "measurement": ["cpu_usage", "memory_rss"] }
      ]
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/myapp/app.log",
            "log_group_name": "/myapp/app",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC",
            "timestamp_format": "%Y-%m-%dT%H:%M:%S",
            "multi_line_start_pattern": "^\\d{4}-\\d{2}-\\d{2}",
            "retention_in_days": 30
          },
          {
            "file_path": "/var/log/nginx/access.log",
            "log_group_name": "/nginx/access",
            "log_stream_name": "{instance_id}-access"
          }
        ]
      }
    }
  }
}
```

### 5. SSM Parameter Store 연동

Agent 설정을 Parameter Store에 저장하면 여러 인스턴스에 동일 설정 배포 가능.

```bash
# 1. 설정을 Parameter Store에 저장
aws ssm put-parameter \
  --name "AmazonCloudWatch-myapp-prod" \
  --type String \
  --value file://amazon-cloudwatch-agent.json

# 2. 모든 EC2에 SSM Run Command로 적용
aws ssm send-command \
  --document-name "AmazonCloudWatch-ManageAgent" \
  --parameters '{"action":["configure"],"mode":["ec2"],"optionalConfigurationSource":["ssm"],"optionalConfigurationLocation":["AmazonCloudWatch-myapp-prod"],"optionalRestart":["yes"]}' \
  --targets "Key=tag:Application,Values=myapp-prod"
```

#### State Manager로 지속 적용
- State Manager Association으로 "이 태그가 붙은 인스턴스는 항상 이 설정 유지" 정책
- 신규 인스턴스 자동 적용 + drift 자동 교정

### 6. 필수 IAM 권한

Agent를 실행하는 인스턴스의 IAM Role에 필요:

```bash
# AWS 관리형 정책 사용
arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore  # SSM 사용 시
```

`CloudWatchAgentServerPolicy` 권한:
- `cloudwatch:PutMetricData`
- `ec2:DescribeTags`
- `logs:CreateLogStream`, `logs:PutLogEvents`, `logs:DescribeLogStreams`
- `logs:DescribeLogGroups`, `logs:CreateLogGroup`
- `ssm:GetParameter` (Parameter Store 사용 시)

### 7. 트러블슈팅

#### Agent가 메트릭 안 보냄
1. IAM Role 확인 (`CloudWatchAgentServerPolicy` attached?)
2. Agent 상태 확인
   ```bash
   sudo systemctl status amazon-cloudwatch-agent
   sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status
   ```
3. 로그 확인: `/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log`
4. 시간 동기화 (chrony/ntp) - 시간이 안 맞으면 메트릭 거부

#### Agent가 로그 안 보냄
1. 파일 경로 권한 (Agent 실행 사용자가 읽을 수 있는가)
2. Log Group이 존재하는가 (자동 생성 권한 있는가)
3. 타임스탬프 포맷 일치

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Procstat plugin** | 특정 프로세스의 CPU/메모리/handle 수 추적 | nginx, mysql 등 |
| **StatsD / collectd 통합** | 표준 프로토콜로 앱 메트릭 푸시 | 마이크로서비스 |
| **HighResolution from Agent** | `metrics_collection_interval: 1` 설정 | 1초 해상도 |
| **AppendDimensions** | InstanceId, ASG, AMI, ImageId 자동 부착 | 자동 태깅 |
| **Aggregation Dimensions** | 여러 Dimension을 묶어 집계 (예: ASG 단위) | 메트릭 차원 정리 |
| **Container Insights vs Agent** | EKS/ECS는 별도 통합 솔루션 | 컨테이너 환경 분리 |

> ⚠️ **함정 1**: Agent는 별도 설치·설정 필요. AWS Managed가 아님. 새 인스턴스마다 적용 누락 위험.
>
> ⚠️ **함정 2**: 메모리/디스크 메트릭은 CloudWatch에 가지만, EC2 콘솔의 "Monitoring" 탭엔 안 보임 (Custom Namespace로 발행).
>
> 💡 **암기 팁**: "메모리·디스크가 필요하면 Agent". 콘솔에 없으면 Custom Namespace에서 찾자.

### 관련 서비스 Cross-Reference

- **Agent → Week 5 SSM** (Run Command/State Manager로 배포·설정 관리)
- **Agent → Week 7 Image Builder** (Golden AMI에 포함)
- **Container Insights → Week 8** (ECS/EKS 메트릭 통합)
- **Agent → Week 11 Compute Optimizer** (메모리 데이터를 활용한 right-sizing)

---

## 🏗️ 아키텍처 다이어그램

```
CloudWatch Agent 배포 + 운영 패턴
==========================================================

   [SSM Parameter Store]
    "AmazonCloudWatch-myapp-prod"
    (Agent 설정 JSON)
            │
            ▼
   [SSM State Manager Association]
    Targets: tag:Application=myapp-prod
    Schedule: every 24h
            │
            ▼ Run Command
   ┌──────────────────────────────────────┐
   │  각 EC2 인스턴스                      │
   │  ┌────────────────────────────────┐  │
   │  │  CloudWatch Agent              │  │
   │  │  - 메모리/디스크/프로세스 메트릭│  │
   │  │  - /var/log/myapp/*.log 수집   │  │
   │  └────┬───────────────┬───────────┘  │
   └───────┼───────────────┼──────────────┘
           ▼               ▼
   [CloudWatch Metrics]  [CloudWatch Logs]
   Custom Namespace      Log Groups
   "MyApp/EC2"           /myapp/app
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EC2 메모리·디스크 메트릭은 Agent 없으면 안 들어옴** — 표준 메트릭에 없음
2. ⭐ **Agent IAM Role: CloudWatchAgentServerPolicy + AmazonSSMManagedInstanceCore**
3. ⭐ **Parameter Store에 설정 저장 → 여러 인스턴스 동일 적용** — 운영 표준 패턴
4. ⭐ **State Manager로 drift 자동 교정** — 신규 인스턴스에도 자동 적용
5. ⭐ **Agent는 metric + log 동시 수집** — 통합 에이전트 (구 awslogs 별도)

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. SSM Run Command로 Agent 설치
aws ssm send-command \
  --document-name "AWS-ConfigureAWSPackage" \
  --parameters action=Install,name=AmazonCloudWatchAgent \
  --targets "Key=tag:Application,Values=web-prod" \
  --comment "Install CloudWatch Agent"

# 2. Agent 설정 JSON을 Parameter Store에 저장
aws ssm put-parameter \
  --name "/cloudwatch/agent/web-prod" \
  --type String \
  --tier Advanced \
  --value file://amazon-cloudwatch-agent.json

# 3. Agent 설정 + 시작
aws ssm send-command \
  --document-name "AmazonCloudWatch-ManageAgent" \
  --parameters '{
    "action": ["configure"],
    "mode": ["ec2"],
    "optionalConfigurationSource": ["ssm"],
    "optionalConfigurationLocation": ["/cloudwatch/agent/web-prod"],
    "optionalRestart": ["yes"]
  }' \
  --targets "Key=tag:Application,Values=web-prod"

# 4. State Manager Association으로 지속 적용
aws ssm create-association \
  --name "AmazonCloudWatch-ManageAgent" \
  --association-name "CWAgent-WebProd" \
  --targets "Key=tag:Application,Values=web-prod" \
  --parameters '{
    "action": ["configure"],
    "mode": ["ec2"],
    "optionalConfigurationSource": ["ssm"],
    "optionalConfigurationLocation": ["/cloudwatch/agent/web-prod"],
    "optionalRestart": ["yes"]
  }' \
  --schedule-expression "rate(1 day)"

# 5. Agent 상태 확인 (EC2 내부에서)
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status

# 6. 메모리 메트릭 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-Memory-High" \
  --metric-name mem_used_percent \
  --namespace MyApp/EC2 \
  --dimensions Name=InstanceId,Value=i-abc \
  --period 60 \
  --statistic Average \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 5 \
  --datapoints-to-alarm 3
```

---

## 📝 연습 문제

**문제 1.** EC2 메모리 사용률을 모니터링하고 알람을 보내려 한다. 가장 먼저 해야 할 일은?

A) CloudWatch 콘솔에서 알람 생성
B) CloudWatch Agent 설치 + 설정 (메모리는 표준 메트릭에 없음)
C) Detailed Monitoring 활성화
D) EC2 콘솔에서 활성화

**정답: B**
해설: 메모리는 표준 메트릭에 없음. Agent 설치 → 메트릭 발행 → 그 다음 알람. Detailed Monitoring은 CPU 등 표준 메트릭의 간격을 1분으로 줄일 뿐.

---

**문제 2.** 100대 EC2 인스턴스에 CloudWatch Agent를 동일 설정으로 배포하고, 신규 인스턴스에도 자동 적용하려 한다. 가장 적합한 패턴은?

A) 각 인스턴스에 SSH로 수동 설치
B) SSM Parameter Store에 설정 저장 + State Manager Association으로 태그 기반 자동 배포
C) User Data로 매번 설치
D) CloudFormation 한 번에 배포

**정답: B**
해설: 운영 자동화 표준. State Manager는 태그 기반 대상 + 주기적 점검 → drift 자동 교정. 신규 인스턴스도 태그만 맞으면 자동 적용.

---

**문제 3.** Agent를 실행 중인 EC2 인스턴스에서 메트릭이 안 보낸다. 가장 먼저 확인할 것은?

A) Agent 버전
B) 인스턴스 Role에 `CloudWatchAgentServerPolicy` 부여 여부
C) 인스턴스 OS 종류
D) Region 설정

**정답: B**
해설: IAM 권한 누락이 가장 흔한 원인. Agent가 PutMetricData/PutLogEvents 호출하려면 권한 필요. 표준 관리형 정책 부여하면 한 번에 해결.

---

**문제 4.** Lambda 함수의 메트릭을 추적하려는데 어떤 Agent가 필요한가?

A) CloudWatch Agent 설치 필요
B) Lambda는 자체 통합되어 있어 Agent 불필요 — 콜드/웜 스타트, 실행시간, 에러 등 자동 발행
C) Container Insights
D) X-Ray Agent

**정답: B**
해설: Lambda는 자체 모니터링 통합. Invocations, Duration, Errors, Throttles 등 자동. 추가 메트릭은 EMF나 PutMetricData.

---

**문제 5.** Agent가 로그 파일은 잘 수집하는데 Log Group이 7일 후 사라진다고 한다. 원인은?

A) Log Stream이 자동 만료
B) Agent 설정의 `retention_in_days`가 7로 설정됨 (또는 Log Group의 retention)
C) IAM 권한 부족
D) S3 라이프사이클

**정답: B**
해설: Agent 설정에 `retention_in_days` 지정 시 Log Group의 retention이 그 값으로 설정됨. 점검 후 적절한 값(예: 30~90)으로 조정.

---

## 📌 오늘의 요약

1. CloudWatch Agent로 메모리·디스크·프로세스·임의 로그 수집 — EC2/온프레미스
2. IAM Role: `CloudWatchAgentServerPolicy` + `AmazonSSMManagedInstanceCore`
3. 설정은 Parameter Store에 저장 → State Manager로 자동 배포·drift 교정
4. Agent는 단일 통합 (구 awslogs와 collectd 통합) — metric + log 동시
5. 트러블슈팅 순서: IAM → Agent 상태 → 로그 → 시간 동기화 → 권한
