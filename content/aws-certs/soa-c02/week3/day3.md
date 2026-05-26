# Day 3 - CloudWatch Agent: 내부 동작, StatsD/collectd 통합, procstat 플러그인

EC2 콘솔의 Monitoring 탭을 열면 CPU, 네트워크 I/O, 디스크 I/O가 보인다. 그런데 정작 운영자가 제일 많이 보고 싶은 메모리 사용률과 디스크 여유 공간은 없다. 이유는 간단하다. 이 메트릭들은 게스트 OS 안에서만 알 수 있고, AWS 하이퍼바이저는 게스트 OS 내부를 들여다볼 수 없기 때문이다. 공동 책임 모델의 경계가 바로 여기서 나타난다. CloudWatch Agent는 그 경계 안쪽, 즉 게스트 OS 내부에서 실행되면서 메트릭과 로그를 CloudWatch로 내보내는 소프트웨어다.

## 왜 Agent가 필요한가: 하이퍼바이저 경계와 측정 가능성

AWS EC2는 Nitro 하이퍼바이저 위에서 동작한다. Nitro는 CPU 사이클, 네트워크 패킷, 블록 I/O 같은 하드웨어 레벨 지표는 볼 수 있다. 하지만 게스트 OS가 메모리를 어떻게 쓰고 있는지, 파일시스템 마운트 포인트별로 디스크가 얼마나 찼는지, 어떤 프로세스가 CPU를 얼마나 쓰는지는 게스트 OS 커널만이 알고 있다.

이것이 EC2 기본 메트릭에 `mem_used_percent`가 없는 이유다. 이 제약은 EC2만의 것이 아니다. GCP Compute Engine도 동일하게 게스트 OS 내부 메트릭은 Ops Agent(구 Stackdriver Agent)를 설치해야 한다. Azure VM도 Azure Monitor Agent가 필요하다.

> 💡 **관련 이론**: 모니터링 방식은 크게 에이전트 기반(agent-based)과 에이전트리스(agentless)로 나뉜다. 에이전트리스는 SNMP, IPMI, 하이퍼바이저 API처럼 외부에서 관찰하는 방식이다. 에이전트 기반은 측정 대상 내부에 소프트웨어를 설치해 더 풍부한 데이터를 수집한다. 클라우드 환경에서는 보통 둘을 혼용한다. 플랫폼 레벨(CPU, 네트워크)은 에이전트리스, OS 레벨(메모리, 디스크, 프로세스)은 에이전트. 이 혼용 구조를 이해해야 "어떤 메트릭이 자동으로 오고 어떤 것은 Agent가 필요한가"를 즉각 답할 수 있다.

## CloudWatch Agent의 내부 구조

CloudWatch Agent는 Go 언어로 작성된 단일 바이너리다. 내부적으로 세 가지 역할을 동시에 수행한다.

**메트릭 수집기**: procfs(/proc), sysfs(/sys), Windows WMI/Performance Counter에서 OS 메트릭을 읽는다. Linux에서 `mem_used_percent`는 `/proc/meminfo`를 파싱한다. `disk/used_percent`는 `statfs()` 시스템 콜로 각 마운트 포인트의 블록 사용량을 계산한다.

**로그 수집기**: 지정된 파일 경로를 tail -f 방식으로 모니터링하다가 새 줄이 추가되면 CloudWatch Logs API(`PutLogEvents`)로 전송한다. 멀티라인 패턴을 지정하면 Java 스택 트레이스처럼 여러 줄이 하나의 로그 이벤트로 묶인다.

**프로토콜 서버**: StatsD(UDP 8125)와 collectd(UDP 25826) 프로토콜을 수신 대기하고, 애플리케이션이 보내는 커스텀 메트릭을 CloudWatch로 중계한다.

```
[EC2 게스트 OS]
  │
  ├─ /proc/meminfo, /proc/diskstats → [메트릭 수집기] ─┐
  ├─ /var/log/app/*.log → [로그 수집기] ────────────────┤
  └─ StatsD :8125, collectd :25826 → [프로토콜 서버] ───┘
                                                        │
                                              [CloudWatch API]
                                              PutMetricData / PutLogEvents
```

## 설정 파일 구조: 전체 예시

설정 마법사(`amazon-cloudwatch-agent-config-wizard`)가 생성하는 JSON의 구조를 이해하면 수동 편집과 자동화가 쉬워진다.

```json
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "cwagent",
    "logfile": "/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log",
    "debug": false
  },
  "metrics": {
    "namespace": "MyApp/EC2",
    "append_dimensions": {
      "InstanceId": "${aws:InstanceId}",
      "AutoScalingGroupName": "${aws:AutoScalingGroupName}",
      "ImageId": "${aws:ImageId}"
    },
    "aggregation_dimensions": [["AutoScalingGroupName"]],
    "metrics_collected": {
      "mem": {
        "measurement": ["mem_used_percent", "mem_available_percent", "mem_cached"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "resources": ["/", "/var", "/home"],
        "measurement": ["used_percent", "inodes_free", "disk_free"],
        "ignore_file_system_types": ["sysfs", "devtmpfs", "tmpfs"],
        "metrics_collection_interval": 60
      },
      "cpu": {
        "totalcpu": true,
        "per_cpu": false,
        "measurement": ["usage_user", "usage_system", "usage_iowait", "usage_steal"],
        "metrics_collection_interval": 60
      },
      "procstat": [
        {
          "exe": "nginx",
          "measurement": ["cpu_usage", "memory_rss", "memory_vms",
                          "num_threads", "read_bytes", "write_bytes"],
          "metrics_collection_interval": 60
        },
        {
          "exe": "java",
          "measurement": ["cpu_usage", "memory_rss", "num_fds"],
          "metrics_collection_interval": 60
        }
      ],
      "statsd": {
        "service_address": ":8125",
        "metrics_collection_interval": 10,
        "metrics_aggregation_interval": 60
      },
      "collectd": {
        "service_address": "udp://127.0.0.1:25826",
        "name_prefix": "collectd_"
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/myapp/app.log",
            "log_group_name": "/prod/myapp/app",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC",
            "timestamp_format": "%Y-%m-%dT%H:%M:%S.%f",
            "multi_line_start_pattern": "^\\d{4}-\\d{2}-\\d{2}",
            "retention_in_days": 90
          },
          {
            "file_path": "/var/log/nginx/error.log",
            "log_group_name": "/prod/nginx/error",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 30
          }
        ]
      },
      "windows_events": {
        "collect_list": [
          {
            "event_name": "System",
            "event_levels": ["ERROR", "CRITICAL"],
            "log_group_name": "/windows/system-events",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
```

`aggregation_dimensions`는 중요한 고급 기능이다. `[["AutoScalingGroupName"]]`으로 설정하면 ASG 내 모든 인스턴스의 메트릭이 ASG 이름 Dimension으로 집계된다. 인스턴스별 메트릭 외에 "ASG 전체" 메트릭이 추가로 발행된다. 오토스케일링 환경에서 "함대 전체의 평균 메모리"를 보는 데 유용하다.

## procstat 플러그인: 프로세스 레벨 모니터링

`procstat`은 특정 프로세스를 추적하는 플러그인이다. `exe`(실행 파일 이름), `pid_file`(PID 파일 경로), `pattern`(정규표현식)으로 대상 프로세스를 지정한다.

```json
"procstat": [
  {
    "exe": "nginx",
    "measurement": ["cpu_usage", "memory_rss", "num_threads", "read_bytes", "write_bytes"]
  },
  {
    "pid_file": "/var/run/myapp.pid",
    "measurement": ["cpu_usage", "memory_rss", "num_fds", "involuntary_context_switches"]
  },
  {
    "pattern": "python.*worker",
    "measurement": ["cpu_usage", "memory_rss"]
  }
]
```

`memory_rss`는 Resident Set Size(실제 물리 메모리 점유량)이고, `memory_vms`는 Virtual Memory Size(가상 주소 공간 크기)다. 메모리 누수 탐지에는 RSS가 더 의미 있다. `num_fds`(파일 디스크립터 수)가 OS 한도에 근접하면 `Too many open files` 에러가 발생한다. 이를 procstat으로 미리 추적하는 것이 예방적 모니터링이다.

> 📚 **사례**: 2020년 한 SaaS 회사(익명)의 API 서버가 매주 토요일 새벽에 응답 불능이 됐다. EC2 CPU와 메모리는 정상이었다. 원인은 nginx의 `num_fds`가 65535(Linux 기본 ulimit)에 도달한 것이었다. procstat으로 `num_fds`를 모니터링하고 80% 임계값 알람을 걸었더라면 토요일 새벽 장애를 예방할 수 있었다. 이 사례 이후 팀은 모든 서버에 procstat의 `num_fds` + `num_threads` 모니터링을 표준으로 추가했다.

## StatsD와 collectd: 애플리케이션 커스텀 메트릭 통합

StatsD는 2011년 Etsy가 개발해 오픈소스로 공개한 경량 메트릭 집계 프로토콜이다. UDP 패킷으로 메트릭을 전송하므로 애플리케이션 성능에 거의 영향을 주지 않는다.

```
# StatsD 메트릭 포맷
order.count:1|c           # 카운터 (누적)
order.latency:45|ms       # 타이머 (ms)
cart.size:3|g             # 게이지 (현재 값)
payment.success:1|c|@0.1  # 10% 샘플링
```

CloudWatch Agent는 UDP 8125로 StatsD 패킷을 수신해 CloudWatch에 발행한다. 집계 간격(`metrics_aggregation_interval`)이 60초면 60초 동안 들어온 카운터를 합산해 `Sum` 통계로 발행한다.

```python
# Python 애플리케이션에서 StatsD 사용 예시
import statsd
c = statsd.StatsClient('localhost', 8125, prefix='payment')

def process_payment(amount):
    with c.timer('latency'):  # 처리 시간 측정
        result = do_payment(amount)
    if result.success:
        c.incr('success')       # 성공 카운터
        c.gauge('amount', amount)  # 최근 결제 금액
    else:
        c.incr('failure')
    return result
```

collectd는 2005년부터 개발된 시스템 통계 수집 데몬이다. 기존에 collectd로 모니터링하던 온프레미스 서버를 CloudWatch로 통합할 때 Agent의 collectd 지원이 유용하다. 마이그레이션 과정에서 기존 collectd 설정을 그대로 유지하면서 데이터만 CloudWatch로 보낼 수 있다.

> 🔍 **더 깊이**: Embedded Metrics Format(EMF)은 StatsD/collectd와 다른 접근이다. EMF는 CloudWatch Logs에 특별한 JSON 형식으로 메트릭 데이터를 삽입하면 CloudWatch가 이를 파싱해 자동으로 메트릭으로 변환한다. Lambda나 ECS Task처럼 에이전트를 실행하기 어려운 환경에서 유용하다. `aws-embedded-metrics` 라이브러리가 이를 추상화한다. EMF는 로그와 메트릭을 동시에 남기므로 "메트릭 발생 당시의 로그 컨텍스트"를 함께 보존할 수 있다는 장점이 있다. SOA-C02에서 EMF는 서버리스 환경의 커스텀 메트릭 표준 패턴으로 나온다.

## 다른 플랫폼과의 비교

| 항목 | CloudWatch Agent | GCP Ops Agent | Azure Monitor Agent |
|------|-----------------|---------------|---------------------|
| 언어 | Go | Go | C++ |
| 메모리 수집 | O (mem 플러그인) | O | O |
| 프로세스 추적 | O (procstat) | O (procstat) | O (프로세스 카운터) |
| StatsD 지원 | O (내장) | O (내장) | X (별도 수신기 필요) |
| 설정 방식 | JSON | YAML | JSON/XML |
| 설정 중앙 관리 | SSM Parameter Store | Secret Manager | Azure Arc |
| 자동 배포 | SSM State Manager | VM Manager | Azure Policy |
| OS | Linux, Windows | Linux, Windows | Linux, Windows |

## SSM Parameter Store 연동과 State Manager 자동화

100대 EC2에 동일한 Agent 설정을 배포하고 유지하는 것이 운영 자동화의 핵심이다. 표준 패턴은 세 단계다.

```bash
# 1단계: 설정을 SSM Parameter Store에 저장
aws ssm put-parameter \
  --name "/cloudwatch/agent/prod-web" \
  --type String \
  --tier Advanced \
  --value file://amazon-cloudwatch-agent.json \
  --description "Web tier CloudWatch Agent configuration"

# 2단계: 초기 설치 (Run Command)
aws ssm send-command \
  --document-name "AWS-ConfigureAWSPackage" \
  --parameters 'action=Install,name=AmazonCloudWatchAgent,version=latest' \
  --targets "Key=tag:Role,Values=web-prod" \
  --comment "Install CloudWatch Agent on web-prod"

# 3단계: 설정 적용 (Run Command)
aws ssm send-command \
  --document-name "AmazonCloudWatch-ManageAgent" \
  --parameters '{
    "action": ["configure"],
    "mode": ["ec2"],
    "optionalConfigurationSource": ["ssm"],
    "optionalConfigurationLocation": ["/cloudwatch/agent/prod-web"],
    "optionalRestart": ["yes"]
  }' \
  --targets "Key=tag:Role,Values=web-prod"

# 4단계: State Manager Association으로 drift 자동 교정
aws ssm create-association \
  --name "AmazonCloudWatch-ManageAgent" \
  --association-name "CWAgent-WebProd-Maintain" \
  --targets "Key=tag:Role,Values=web-prod" \
  --parameters '{
    "action": ["configure"],
    "mode": ["ec2"],
    "optionalConfigurationSource": ["ssm"],
    "optionalConfigurationLocation": ["/cloudwatch/agent/prod-web"],
    "optionalRestart": ["yes"]
  }' \
  --schedule-expression "rate(24 hours)" \
  --compliance-severity "MEDIUM"
```

State Manager Association의 핵심은 **주기적 강제 적용(desired state enforcement)**이다. 누군가 실수로 인스턴스에서 Agent를 중지하거나 설정을 변경해도, 24시간 이내에 원래 설정으로 자동 복구된다. 신규 인스턴스가 `Role=web-prod` 태그를 달고 시작되면 다음 Association 실행 주기에 자동으로 설정이 적용된다.

> 💡 **관련 이론**: SSM State Manager가 구현하는 개념은 **Infrastructure as Desired State**다. Puppet, Chef, Ansible의 "멱등성(idempotent) 실행" 철학과 동일하다. 원하는 상태(desired state)를 선언하면 에이전트가 현재 상태(actual state)를 계속 맞춰간다. 단순히 "한 번 배포"와 "지속적으로 유지"의 차이가 운영 안정성을 결정한다.

## IAM 권한과 트러블슈팅

Agent 실행에 필요한 IAM 정책은 두 가지다.

```bash
# EC2 IAM Role에 부여할 관리형 정책
arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
```

`CloudWatchAgentServerPolicy`가 부여하는 주요 권한:
- `cloudwatch:PutMetricData` — 메트릭 전송
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` — 로그 전송
- `ec2:DescribeTags` — InstanceId, ASG 이름 등 자동 Dimension 수집
- `ssm:GetParameter` — Parameter Store에서 설정 읽기

트러블슈팅 순서는 IAM → Agent 상태 → 로그 → 시간 동기화 → 네트워크 순이다.

```bash
# Agent 상태 확인
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status

# Agent 로그 (오류 원인의 90%가 여기에 있음)
sudo tail -f /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log

# 시간 동기화 상태 (시간이 틀리면 메트릭 거부됨)
chronyc tracking
timedatectl show

# IAM 권한 테스트 (인스턴스에서 직접 실행)
aws cloudwatch put-metric-data \
  --namespace "Test/Agent" \
  --metric-name "TestMetric" \
  --value 1 \
  --region ap-northeast-2
```

> ⚠️ **함정**: CloudWatch Agent가 메모리 메트릭을 발행하면 `CWAgent` 네임스페이스(또는 설정의 `namespace` 값)로 들어간다. EC2 콘솔 Monitoring 탭에는 보이지 않는다. 알람을 만들 때 네임스페이스를 `AWS/EC2`가 아닌 `CWAgent`(또는 커스텀 값)로 선택해야 한다. 이 점을 모르고 `AWS/EC2` 네임스페이스에서 `mem_used_percent`를 찾다가 없다고 혼란스러워하는 경우가 많다.

> ⚠️ **함정**: `retention_in_days`를 설정 파일에 넣으면 Agent가 Log Group의 보존 기간을 자동 설정한다. 처음 Log Group 생성 시에만 적용되며, 이미 존재하는 Log Group의 보존 기간은 변경하지 않는다. 보존 기간 관리를 Lambda나 Terraform으로 중앙화하는 것이 더 안정적이다.

## 메모리 메트릭 알람까지 완성하는 전체 흐름

```bash
# 메모리 85% 초과 3 of 5 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-Memory-High-WebProd" \
  --metric-name mem_used_percent \
  --namespace CWAgent \
  --dimensions \
    Name=InstanceId,Value=i-0123456789abcdef0 \
    Name=AutoScalingGroupName,Value=web-prod-asg \
  --period 60 \
  --statistic Average \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 5 \
  --datapoints-to-alarm 3 \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:123456789012:ops-critical
```

메모리 메트릭은 EC2가 종료되면 당연히 들어오지 않는다. `notBreaching`을 쓰면 종료된 인스턴스의 알람이 ALARM으로 전이되지 않고 OK를 유지한다. 가용성 모니터링(인스턴스가 살아 있어야 함)이 목적이라면 별도로 `StatusCheckFailed_System` 알람을 추가한다.

## 마무리

CloudWatch Agent는 단순한 설치 후 망각하는 도구가 아니다. procstat으로 프로세스 레벨을 추적하고, StatsD/collectd로 애플리케이션 커스텀 메트릭을 통합하고, State Manager로 설정 드리프트를 방지하는 완전한 운영 자동화 파이프라인의 핵심이다. 시험에서는 "메모리가 필요하면 Agent", "IAM 권한이 먼저", "Parameter Store + State Manager가 대규모 배포 표준"이 빈출 패턴이다.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스에서 메모리 사용률을 CloudWatch 알람으로 모니터링하려 한다. 가장 먼저 해야 할 작업은?

A) CloudWatch 콘솔에서 `AWS/EC2` 네임스페이스의 `MemoryUtilization` 메트릭으로 알람 생성
B) EC2 Detailed Monitoring 활성화
C) CloudWatch Agent 설치 및 `mem` 플러그인 설정 후 Custom Namespace로 메트릭 발행
D) CloudFormation으로 인스턴스를 재생성

**정답: C**
해설: 메모리는 EC2 기본 메트릭에 없다. 하이퍼바이저가 게스트 OS 내부 메모리 상태를 볼 수 없기 때문이다. CloudWatch Agent를 설치하고 설정 파일에 `mem` 섹션을 추가해야 `CWAgent`(또는 커스텀) 네임스페이스에 `mem_used_percent` 메트릭이 발행된다. Detailed Monitoring은 CPU 등 기본 메트릭의 수집 간격을 5분에서 1분으로 줄일 뿐이다.

---

**문제 2.** 200대 EC2 인스턴스에 동일한 CloudWatch Agent 설정을 배포하고, 이후 신규 인스턴스에도 자동 적용하며, 누군가 Agent를 중지해도 자동 복구되게 하려면?

A) 각 인스턴스에 SSH로 수동 설치
B) User Data 스크립트에 설치 명령 포함
C) SSM Parameter Store에 설정 저장 + State Manager Association (태그 기반 대상 + 24시간 주기)
D) CloudFormation으로 인스턴스를 모두 재배포

**정답: C**
해설: State Manager Association이 "지속적 desired state enforcement"를 구현한다. 태그 기반 대상이므로 신규 인스턴스가 해당 태그를 달면 자동 포함된다. 주기적 실행(24시간 rate)으로 누군가 설정을 변경하거나 Agent를 중지해도 다음 실행 시 자동 교정된다. User Data는 인스턴스 최초 시작 시 1회만 실행되므로 drift 교정이 불가능하다.

---

**문제 3.** Node.js 애플리케이션의 커스텀 비즈니스 메트릭(주문 수, 처리 시간)을 CloudWatch에 발행하는 가장 간단한 방법은?

A) AWS SDK PutMetricData를 코드에 직접 호출
B) CloudWatch Agent의 StatsD 수신 기능을 사용해 UDP 8125로 메트릭 전송
C) CloudWatch Logs에 로그를 쓰고 Metric Filter로 추출
D) Lambda를 통해 CloudWatch에 중계

**정답: B**
해설: StatsD는 UDP로 메트릭을 보내는 경량 프로토콜이다. `statsd` npm 패키지로 `c.incr('orders.created')` 한 줄이면 된다. CloudWatch Agent가 8125 포트에서 수신 대기하다가 CloudWatch로 발행한다. AWS SDK PutMetricData도 가능하지만 HTTP API 호출이므로 오버헤드가 있고 에러 처리를 별도로 해야 한다. StatsD는 UDP이므로 실패해도 애플리케이션에 영향 없다.

---

**문제 4.** CloudWatch Agent가 설치됐는데 메트릭이 CloudWatch에 보이지 않는다. 트러블슈팅 첫 번째 확인 사항은?

A) Agent 버전이 최신인지 확인
B) EC2 인스턴스 Role에 `CloudWatchAgentServerPolicy`가 부여됐는지 확인
C) 인스턴스 OS 종류 확인
D) CloudWatch 서비스 상태 확인

**정답: B**
해설: IAM 권한 누락이 가장 흔한 원인이다. Agent가 `cloudwatch:PutMetricData`를 호출하려면 Role에 `CloudWatchAgentServerPolicy`가 필요하다. 권한이 없으면 Agent 로그에 `AccessDeniedException`이 남는다. 트러블슈팅 순서: IAM → Agent 상태(`agent-ctl -a status`) → Agent 로그(`/opt/aws/amazon-cloudwatch-agent/logs/`) → 시간 동기화 → 네트워크(VPC Endpoint 또는 NAT GW).

---

**문제 5.** procstat 플러그인으로 nginx 프로세스를 모니터링하고 파일 디스크립터 한도 초과를 예방하려면?

A) EC2 기본 메트릭의 `DiskReadOps`를 모니터링
B) procstat에 `exe: nginx`로 설정하고 `num_fds` 측정값을 추가해 알람 임계값 설정
C) CloudTrail로 nginx 프로세스 호출 추적
D) X-Ray로 nginx 요청 추적

**정답: B**
해설: `num_fds`(열린 파일 디스크립터 수)는 procstat으로만 수집 가능한 OS 레벨 메트릭이다. Linux 기본 ulimit는 1024~65535 범위이며 이를 초과하면 `Too many open files` 에러가 발생한다. procstat 설정에 `exe: nginx`와 `measurement: ["num_fds"]`를 추가하고 한도의 80% 시점에 알람을 거는 것이 예방적 모니터링 표준이다. CloudTrail은 AWS API 호출을 추적하며 프로세스 내부 상태는 볼 수 없다.

---

**문제 6.** CloudWatch Agent 설정의 `retention_in_days: 30`을 설정했는데, 이미 존재하는 Log Group의 보존 기간이 변경되지 않았다. 이유는?

A) 권한 부족
B) `retention_in_days`는 Log Group 최초 생성 시에만 적용되며 기존 Log Group은 변경하지 않는다
C) Agent 재시작이 필요하다
D) CloudFormation으로만 변경 가능하다

**정답: B**
해설: Agent의 `retention_in_days` 설정은 해당 Log Group이 존재하지 않을 때 새로 생성하면서 보존 기간을 설정한다. 이미 존재하는 Log Group의 보존 기간은 변경하지 않는다. 기존 Log Group의 보존 기간을 변경하려면 콘솔, CLI(`aws logs put-retention-policy`), 또는 Terraform/CloudFormation으로 별도로 업데이트해야 한다. 운영 표준으로는 Log Group 보존 기간을 Terraform에서 중앙 관리하고 Agent는 메트릭/로그 수집에만 집중시키는 것이 권장된다.
