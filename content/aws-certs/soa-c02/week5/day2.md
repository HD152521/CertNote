# Day 2 - Run Command, State Manager, Maintenance Window: 운영 자동화 3종 세트

"prod 서버 전체에 새 환경 변수 추가해야 해요. 지금 바로요." 개발팀 리더의 메시지다. EC2 인스턴스 150대, 모두 `Environment=prod` 태그가 붙어 있다. SSH로 한 대씩? 불가능한 일정이다. 이때 운영자가 꺼내는 것이 Run Command다. 명령을 정의하고, 대상을 태그로 지정하고, 동시성과 에러 한도를 설정한 뒤 실행 버튼을 누르면 150대에 동시에 배포된다. 결과는 S3와 CloudWatch Logs에 자동으로 저장되고, 실패한 인스턴스는 OpsCenter에 OpsItem으로 자동 생성된다.

오늘 다루는 Run Command, State Manager, Maintenance Window는 "SSM 운영 자동화 3종 세트"다. 이 세 도구는 각각 "지금 한 번(Run Command)", "항상 이 상태로(State Manager)", "이 시간에 이 작업(Maintenance Window)"을 담당한다. 셋의 역할을 명확히 구분하는 것이 SOA-C02 시험의 핵심 포인트 중 하나다.

## Run Command의 내부 동작 원리

Run Command는 단순해 보이지만 내부적으로 정교한 분산 시스템이다. 운영자가 `send-command`를 호출하면 어떤 일이 일어나는가.

1. **SSM API 수신**: 명령이 SSM 서비스에 등록되고 Command ID가 발급된다
2. **대상 선정**: Tags/Resource Groups/Instance IDs 기준으로 대상 목록을 계산한다
3. **Concurrency 제어**: 동시 실행 한도에 따라 첫 배치를 선발한다 (예: 10%면 150대 중 15대)
4. **Agent Poll**: 선발된 인스턴스들의 Agent가 다음 heartbeat 시 명령을 가져온다 (pull 방식)
5. **실행 및 결과 반환**: Agent가 명령을 실행하고 stdout/stderr를 `ec2messages` 채널로 SSM에 반환
6. **출력 저장**: 설정에 따라 S3 버킷과 CloudWatch Logs에 결과 저장
7. **에러 평가**: 현재까지 에러율이 Error Threshold를 초과하면 나머지 배치 실행 중단
8. **다음 배치**: 에러가 임계값 미만이면 다음 15대를 실행

> 💡 **관련 이론**: Run Command의 Concurrency 제어는 분산 시스템의 "circuit breaker pattern"과 "bulkhead pattern"을 결합한 설계다. Michael Nygard의 *Release It!*(2007)에서 circuit breaker는 장애 전파를 막는 패턴으로, Error Threshold 초과 시 나머지 실행을 중단하는 것이 정확한 구현이다. Bulkhead(격벽)는 동시 실행 수를 제한해 실패가 전체로 번지지 않도록 격리한다. 운영자가 `--max-concurrency 10%`를 설정하는 것은 이 두 패턴을 동시에 적용하는 것이다. Google SRE Book(Beyer et al., 2016) 13장 "Emergency Response"는 같은 원칙을 "rate limiting"으로 표현한다.

## Rate Control의 수학: 언제 퍼센트, 언제 절대값?

Run Command의 `--max-concurrency`와 `--max-errors`는 퍼센트(%）또는 절대값 중 선택 가능하다. 언제 무엇을 써야 하는가.

| 상황 | max-concurrency | max-errors | 이유 |
|------|----------------|------------|------|
| 스케일이 유동적인 ASG | 10% | 5% | 인스턴스 수 변동에도 비율 유지 |
| 인스턴스 수 고정 (100대) | 10 또는 10% | 5 또는 5% | 동일 효과 |
| 매우 작은 그룹 (5대) | 2 (절대값 권장) | 1 | 5%면 0.25대 → 반올림으로 1대 |
| 긴급 패치 (속도 우선) | 50% | 20% | 빠른 배포, 높은 허용 오차 |
| 중요 DB 서버 (안정 우선) | 1 | 0 | 한 대씩, 하나도 실패 시 중단 |

**퍼센트 계산 예시:**
- 150대, max-concurrency=10%: ceil(150 × 0.10) = 15대씩 병렬 실행
- 150대, max-errors=5%: 7대(ceil(150 × 0.05)) 이상 실패 시 중단
- 실패 7대가 첫 배치(15대)에서 발생하면, 나머지 135대는 실행되지 않는다

> 🔍 **더 깊이**: `--max-errors "0"`으로 설정하면 단 1개의 실패도 허용하지 않아 즉시 중단된다. 이는 "zero-tolerance rollout"으로, 새 크리티컬 패치가 특정 OS 버전과 호환성 문제가 있는지 모르는 상황에서 한두 대에 먼저 테스트하는 용도로 적합하다. 반면 `--max-errors "100%"`는 모든 실패를 무시하고 전체 대상에 강제 실행하는 것으로, 이미 알려진 일부 비준수 인스턴스가 있어도 전체를 업데이트해야 할 때 사용한다.

## SSM Document: 명령의 정의

Run Command의 실제 실행 내용은 SSM Document(JSON 또는 YAML)에 담긴다. Document는 SSM의 모든 자동화 기능의 기반이다.

**Document Type별 사용 용도:**

| Type | 용도 | 예시 |
|------|------|------|
| `Command` | Run Command, State Manager | AWS-RunShellScript, AWS-RunPatchBaseline |
| `Automation` | SSM Automation Runbook | AWS-RestartEC2Instance, 사용자 정의 |
| `Session` | Session Manager 세션 | SSM-SessionManagerRunShell |
| `Policy` | State Manager 정책 적용 | AWS-GatherSoftwareInventory |
| `Package` | Distributor 패키지 | 사용자 정의 패키지 |

**AWS가 제공하는 주요 Command Document:**

```
AWS-RunShellScript          - Linux 쉘 명령 실행
AWS-RunPowerShellScript     - Windows PowerShell 명령 실행
AWS-RunPatchBaseline        - 패치 적용 (Patch Manager 표준)
AWS-ConfigureAWSPackage     - Distributor 패키지 설치/제거
AWS-UpdateSSMAgent          - SSM Agent 자동 업데이트
AmazonCloudWatch-ManageAgent - CloudWatch Agent 관리
```

> 🔍 **더 깊이**: SSM Document는 버전 관리를 지원한다. Document의 특정 버전을 `$LATEST`, `$DEFAULT`, 또는 숫자(1, 2, 3...)로 지정할 수 있다. `$LATEST`는 항상 최신 버전이고, `$DEFAULT`는 운영자가 안정 버전으로 지정한 것이다. 운영 환경에서는 항상 `$DEFAULT`나 특정 버전 번호를 명시해 예상치 못한 Document 업데이트로 인한 동작 변화를 막아야 한다. AWS 관리형 Document(`AWS-*`)는 AWS가 업데이트하며 버전 고정이 중요하다. 커스텀 Document는 Git처럼 의미 있는 버전 관리를 적용하고, CI/CD 파이프라인에서 `create-document`→테스트→`update-document-default-version`으로 Blue-Green 배포하는 패턴이 표준이다.

## Run Command 실전 패턴

**기본 실행 (태그 기반 대상):**

```bash
# 150대 prod 서버에 환경변수 추가
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --parameters '{
    "commands":[
      "echo '"'"'NEW_FEATURE_FLAG=true'"'"' >> /etc/environment",
      "source /etc/environment",
      "echo \"Applied on $(hostname) at $(date)\""
    ]
  }' \
  --targets '[{"Key":"tag:Environment","Values":["prod"]}]' \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --output-s3-bucket-name "ssm-command-output" \
  --output-s3-key-prefix "env-var-deploy/$(date +%Y/%m/%d)" \
  --cloud-watch-output-config '{
    "CloudWatchLogGroupName":"/ssm/run-command",
    "CloudWatchOutputEnabled":true
  }' \
  --timeout-seconds 300

# Command ID 저장
COMMAND_ID=$(aws ssm send-command ... --query 'Command.CommandId' --output text)

# 결과 조회
aws ssm list-command-invocations \
  --command-id "$COMMAND_ID" \
  --details \
  --query 'CommandInvocations[*].[InstanceId,Status,CommandPlugins[0].ResponseCode,CommandPlugins[0].Output]' \
  --output table
```

**실패한 인스턴스만 재실행:**

```bash
# 실패 인스턴스 ID 목록 추출
FAILED_INSTANCES=$(aws ssm list-command-invocations \
  --command-id "$COMMAND_ID" \
  --filter "key=Status,value=Failed" \
  --query 'CommandInvocations[*].InstanceId' \
  --output text | tr '\t' ',')

# 실패 인스턴스에만 재실행
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --parameters '...' \
  --instance-ids $FAILED_INSTANCES \
  --max-concurrency "1" \
  --max-errors "0"
```

> ⚠️ **함정**: `--instance-ids`로 직접 지정할 때 최대 50개까지다. 50개 초과 시 Tags 또는 Resource Groups를 사용해야 한다. 또한 Run Command는 실행 시점의 태그 매칭이라 실행 후 태그가 변경돼도 이미 보낸 명령은 영향이 없다. 그리고 명령 실행 결과의 stdout/stderr는 S3에 저장 시 각 인스턴스별 별도 경로(`<prefix>/<CommandId>/<InstanceId>/awsrunshellscript/0.awsrunshellscript/stdout`)로 저장된다.

## State Manager: Desired State의 지속적 보장

Run Command가 "지금 한 번"이라면 State Manager는 "항상 이 상태"다. Association이라 불리는 설정 단위가 핵심이다.

**Association의 구성 요소:**

| 구성 요소 | 설명 | 예시 |
|-----------|------|------|
| `Document` | 적용할 SSM Document | AmazonCloudWatch-ManageAgent |
| `Targets` | 대상 (Tags, IDs, Resource Groups) | `Key=tag:MonitoringEnabled,Values=true` |
| `Parameters` | Document에 전달할 파라미터 | CW Agent 설정 경로 |
| `Schedule` | 실행 주기 | `rate(1 day)`, `cron(0 2 ? * MON *)` |
| `MaxConcurrency` | 동시 실행 수 | `20%` |
| `MaxErrors` | 허용 에러 수 | `5%` |
| `ComplianceLevel` | 실패 시 컴플라이언스 심각도 | `CRITICAL`, `HIGH` |

**State Manager의 Convergence 동작:**

```
Association 등록
      │
      ▼
[신규 인스턴스가 Managed Instance로 등록됨]
      │ (태그가 맞으면 즉시 Association 실행)
      ▼
[스케줄 주기마다 재실행]
      │ (drift가 발생했으면 자동 교정)
      ▼
[컴플라이언스 결과 기록]
```

**실용 Association 예시 - CloudWatch Agent 설정 동기화:**

```bash
aws ssm create-association \
  --association-name "EnforceCWAgentConfig" \
  --name "AmazonCloudWatch-ManageAgent" \
  --targets '[{"Key":"tag:MonitoringEnabled","Values":["true"]}]' \
  --parameters '{
    "action":["configure"],
    "mode":["ec2"],
    "optionalConfigurationSource":["ssm"],
    "optionalConfigurationLocation":["/cloudwatch/agent/prod-config"],
    "optionalRestart":["yes"]
  }' \
  --schedule-expression "rate(1 day)" \
  --max-concurrency "20%" \
  --max-errors "5%" \
  --compliance-severity "HIGH"
```

이 Association이 등록된 이후 발생하는 일:
1. 새 EC2가 `MonitoringEnabled=true` 태그와 함께 시작 → Managed Instance 등록 즉시 Association 실행 → CW Agent 설정 자동 적용
2. 누군가 CW Agent 설정을 인스턴스에서 직접 변경(drift) → 다음 스케줄 실행(최대 1일 후)에 자동 교정
3. CW Agent가 충돌로 종료 → 스케줄 실행 시 `optionalRestart: yes`로 자동 재시작

> 📚 **사례**: 2023년, 대형 이커머스 플랫폼 B사가 State Manager로 CloudWatch Agent 설정 표준화를 구현했다. 이전에는 새 인스턴스가 스케일아웃될 때마다 개발팀이 수동으로 CW Agent를 설정해 메트릭 수집이 누락되는 일이 잦았다. State Manager Association 도입 후 6개월 동안 "메트릭 수집 누락" 인시던트가 0건이었다. 또한 누군가 실수로 Agent 설정을 변경했을 때 24시간 내 자동 복구되는 것도 확인했다. 컴플라이언스 대시보드에서 Association 실패 인스턴스를 실시간으로 파악할 수 있어 운영 가시성도 높아졌다.

**Association의 즉시 실행 (ApplyOnlyAtCronInterval 제어):**

```bash
# 기본적으로 Association 생성 즉시 한 번 실행됨
# 스케줄에만 실행하고 생성 즉시 실행 방지:
aws ssm create-association \
  --association-name "WeeklyKernelUpdate" \
  --name "AWS-RunShellScript" \
  --schedule-expression "cron(0 3 ? * SUN *)" \
  --apply-only-at-cron-interval \
  --targets '[{"Key":"tag:PatchGroup","Values":["prod"]}]'

# Association을 즉시 강제 실행 (스케줄 무관)
aws ssm start-associations-once \
  --association-ids "asc-0123456789abcdef0"
```

> 💡 **관련 이론**: State Manager의 "desired state convergence" 개념은 제어 이론의 "feedback control loop"와 동일하다. 목표 상태(setpoint)와 현재 상태(process variable)의 차이(error)를 감지하고 수정 작업(control action)을 적용한다. Kubernetes의 Reconciler 패턴, Puppet의 Catalog 적용, AWS Config의 자동 교정 모두 같은 원리다. State Manager는 스케줄을 "sampling interval"로 사용해 drift를 정기적으로 감지·교정하는 discrete-time 제어 루프를 구현한다.

**Pseudo Parameters로 동적 Document:**

```yaml
# SSM Document에서 {{InstanceId}} 같은 동적 변수 사용
{
  "schemaVersion": "2.2",
  "mainSteps": [
    {
      "action": "aws:runShellScript",
      "name": "labelInstance",
      "inputs": {
        "runCommand": [
          "echo 'InstanceId: {{ssm:instanceId}}' > /etc/instance-label",
          "echo 'Region: {{global:REGION}}' >> /etc/instance-label"
        ]
      }
    }
  ]
}
```

## Maintenance Window: 안전한 시간대에 복잡한 작업 실행

Maintenance Window는 "패치 일요일 새벽 2시에 하기로 했다"는 운영 정책을 코드로 만드는 도구다. 단순한 cron 스케줄러가 아니라, 복잡한 작업 묶음을 안전하게 실행하는 완전한 워크플로 엔진이다.

**3개 구성 요소의 관계:**

```
Maintenance Window (시간대 정의)
    │
    ├── Targets (대상 그룹)
    │      tag:PatchGroup=prod-web
    │
    └── Tasks (실행할 작업, 우선순위 순서)
           1. Snapshot 생성 (Automation) - Priority 1
           2. ELB deregister (Automation)  - Priority 2
           3. Patch 적용 (Run Command)     - Priority 3
           4. Health check (Automation)   - Priority 4
           5. ELB register (Automation)   - Priority 5
```

**Window의 시간 파라미터:**

| 파라미터 | 의미 | 권장값 |
|----------|------|--------|
| `Schedule` | cron 또는 rate 표현식 | `cron(0 2 ? * SUN *)` (매주 일요일 02:00) |
| `Duration` | Window 총 지속 시간(시간) | 4 (최소 1, 최대 24) |
| `Cutoff` | 새 Task 시작 마감(시간) | 1 (Window 종료 1시간 전 차단) |

**Cutoff의 중요성:** Duration 4시간, Cutoff 1시간이면 실제 새 작업을 시작할 수 있는 시간은 3시간이다. 03:00에 이미 시작한 작업은 04:00이 되어도 계속 실행된다. Cutoff는 "Window가 끝나기 직전에 새 작업이 시작되어 미완료 상태로 끊기는" 상황을 방지한다.

> 💡 **관련 이론**: Maintenance Window의 Cutoff 개념은 운영 시스템에서 "graceful shutdown" 패턴과 동일하다. TCP 연결의 FIN/ACK 과정처럼, 새 작업 접수를 먼저 차단하고 진행 중인 작업이 완료되길 기다린다. 쿠버네티스의 `terminationGracePeriodSeconds`도 같은 원리다. 분산 시스템에서 "진행 중인 작업은 완료시키되 새 작업은 받지 않는다"는 원칙은 데이터 무결성의 기본이다. POSIX의 SIGTERM → SIGKILL 시퀀스도 같은 graceful shutdown 철학을 구현한다.

## CRON 표현식 완전 정복

Maintenance Window의 Schedule은 AWS cron 표현식을 사용한다. AWS cron은 표준 Linux cron과 일부 다르다.

```
AWS cron 형식: cron(분 시 일 월 요일 연도)
              cron(Minutes Hours Day-of-month Month Day-of-week Year)

특수 문자:
  * : 모든 값
  ? : 특정 값 없음 (Day-of-month와 Day-of-week 중 하나에만 사용)
  - : 범위 (예: 1-5)
  , : 목록 (예: MON,WED,FRI)
  / : 증분 (예: 0/15 = 0, 15, 30, 45)
  L : 마지막 (예: Day-of-month에서 L = 월의 마지막 날)
  W : 가장 가까운 평일
  # : N번째 요일 (예: 2#1 = 월의 첫 번째 화요일)

예시:
  cron(0 2 ? * SUN *)     = 매주 일요일 02:00 UTC
  cron(0 14 ? * MON-FRI *) = 평일 14:00 UTC
  cron(0 1 1 * ? *)        = 매월 1일 01:00 UTC
  cron(0 9 ? * 2#1 *)      = 매월 첫 번째 월요일 09:00 UTC
  cron(15 12 L * ? *)       = 매월 마지막 날 12:15 UTC
```

> ⚠️ **함정**: AWS cron은 **UTC 기준**이다. 서울(KST = UTC+9) 새벽 2시에 실행하려면 `cron(0 17 ? * SAT *)` (토요일 17:00 UTC = 일요일 02:00 KST)로 설정해야 한다. 또한 Day-of-month와 Day-of-week를 동시에 지정할 수 없어, 둘 중 하나는 반드시 `?`를 사용해야 한다. `cron(0 2 15 * MON *)`는 유효하지 않고 `cron(0 2 15 * ? *)`(매월 15일) 또는 `cron(0 2 ? * MON *)`(매주 월요일) 중 하나를 선택해야 한다.

**완전한 패치 Window 구성 예시:**

```bash
# 1. Maintenance Window 생성
WINDOW_ID=$(aws ssm create-maintenance-window \
  --name "ProdWebWeeklyPatch" \
  --schedule "cron(0 17 ? * SAT *)" \
  --schedule-timezone "Asia/Seoul" \
  --duration 4 \
  --cutoff 1 \
  --allow-unassociated-targets \
  --description "Weekly patch window for prod web tier (Sun 02:00 KST)" \
  --query 'WindowId' --output text)

echo "Window ID: $WINDOW_ID"

# 2. 대상 등록 (Patch Group 태그 기반)
TARGET_ID=$(aws ssm register-target-with-maintenance-window \
  --window-id "$WINDOW_ID" \
  --resource-type INSTANCE \
  --targets 'Key=tag:PatchGroup,Values=prod-web' \
  --owner-information "Production Web Tier Servers" \
  --query 'WindowTargetId' --output text)

# 3. Task 1: EBS 스냅샷 생성 (Automation, Priority 1)
aws ssm register-task-with-maintenance-window \
  --window-id "$WINDOW_ID" \
  --task-arn "AWS-CreateSnapshot" \
  --task-type AUTOMATION \
  --targets "Key=WindowTargetIds,Values=$TARGET_ID" \
  --priority 1 \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --service-role-arn "arn:aws:iam::123456789012:role/SSMMaintenanceWindowRole"

# 4. Task 2: 패치 적용 (Run Command, Priority 2)
aws ssm register-task-with-maintenance-window \
  --window-id "$WINDOW_ID" \
  --task-arn "AWS-RunPatchBaseline" \
  --task-type RUN_COMMAND \
  --targets "Key=WindowTargetIds,Values=$TARGET_ID" \
  --priority 2 \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --service-role-arn "arn:aws:iam::123456789012:role/SSMMaintenanceWindowRole" \
  --task-invocation-parameters '{
    "RunCommand": {
      "Parameters": {
        "Operation": ["Install"],
        "RebootOption": ["RebootIfNeeded"]
      },
      "OutputS3BucketName": "patch-output-bucket",
      "OutputS3KeyPrefix": "prod-web",
      "CloudWatchOutputConfig": {
        "CloudWatchLogGroupName": "/ssm/patch/prod-web",
        "CloudWatchOutputEnabled": true
      }
    }
  }'

# 5. Window 이전 실행 기록 조회
aws ssm describe-maintenance-window-executions \
  --window-id "$WINDOW_ID" \
  --query 'WindowExecutions[*].[WindowExecutionId,Status,StartTime,EndTime]' \
  --output table
```

> 📚 **사례**: 2022년 의료 SaaS 기업 C사가 HIPAA 컴플라이언스를 위한 패치 자동화를 구현했다. Maintenance Window를 월 2회(1일, 15일 KST 새벽 2시)로 설정하고 Task 순서를 EBS 스냅샷(Priority 1) → ELB Deregister(Priority 2) → 패치(Priority 3) → Health Check(Priority 4) → ELB Register(Priority 5)로 구성했다. max-concurrency=10%, max-errors=5%로 설정해 패치 실패가 연쇄되지 않도록 했다. 도입 전에는 패치 담당자가 매주 토요일 새벽에 출근했는데, 도입 후 완전 무인 자동화로 전환됐다. HIPAA 164.312(c)(2) 요구사항(패치 검증 절차)을 S3 저장 패치 로그로 충족했다.

## Compliance: 패치와 Association의 통합 대시보드

Compliance는 Patch Manager와 State Manager의 실행 결과를 종합하여 인스턴스별 컴플라이언스 점수를 산출한다.

**컴플라이언스 데이터 유형:**

| 유형 | 출처 | 핵심 지표 |
|------|------|-----------|
| `Patch` | Patch Manager | MissingCount, FailedCount, InstalledPendingRebootCount |
| `Association` | State Manager | 실행 성공/실패 여부 |
| `Custom` | Lambda/CLI로 직접 보고 | 사용자 정의 항목 |

```bash
# 컴플라이언스 요약 (전체 계정)
aws ssm list-compliance-summaries \
  --query 'ComplianceSummaryItems[*].[ComplianceType,CompliantSummary.CompliantCount,NonCompliantSummary.NonCompliantCount]' \
  --output table

# 특정 인스턴스의 비준수 항목
aws ssm list-compliance-items \
  --resource-ids i-0123456789abcdef0 \
  --resource-types ManagedInstance \
  --filters 'Key=STATUS,Values=NON_COMPLIANT,Type=EQUAL'

# 커스텀 컴플라이언스 항목 보고 (Lambda 등에서)
aws ssm put-compliance-items \
  --resource-id i-0123456789abcdef0 \
  --resource-type ManagedInstance \
  --compliance-type "Custom:AppSecurity" \
  --execution-summary '{"ExecutionTime":"2026-05-26T02:00:00Z"}' \
  --items '[{"Id":"SSL_CERT_EXPIRY","Title":"SSL cert valid","Severity":"CRITICAL","Status":"COMPLIANT","Details":{"expiry":"2027-01-01"}}]'
```

> 🔍 **더 깊이**: Compliance의 `Custom:*` 유형을 활용하면 SSM 밖의 보안 검사 결과도 중앙 대시보드에 통합할 수 있다. 예를 들어 CIS Benchmark 스캔 결과, SSL 인증서 만료 여부, 커스텀 애플리케이션 설정 검증 결과를 Lambda에서 `put-compliance-items`로 보고하면 Compliance 대시보드에 통합된다. 이 데이터는 Security Hub나 Audit Manager로도 집계 가능하다. AWS는 이 패턴을 "operational data aggregation"이라고 부르며, 멀티 계정 환경에서는 Organizations + Resource Data Sync로 중앙 계정에 모든 계정의 컴플라이언스 데이터를 집계하는 구조가 표준이다.

## Run Command vs State Manager vs Maintenance Window: 언제 무엇을?

이 세 도구의 차이를 명확히 이해하는 것이 SOA-C02에서 반복적으로 요구된다.

| 특성 | Run Command | State Manager | Maintenance Window |
|------|-------------|---------------|---------------------|
| **실행 빈도** | 일회성(one-shot) | 지속적(continuous) | 예약된 시간(scheduled) |
| **Drift 교정** | X (다시 보내야 함) | O (자동 재실행) | X (스케줄만) |
| **신규 인스턴스 자동 포함** | X (명시적 재실행 필요) | O (태그 일치 시 즉시) | 태그 기반이면 O |
| **병렬 작업 지원** | 단일 Document | 단일 Document | 복수 Task, 우선순위 |
| **전형적 사용 사례** | 긴급 일괄 명령, ad-hoc 점검 | 표준 설정 강제, CW Agent 동기화 | 패치, 백업, 유지보수 |
| **출력 저장** | S3, CW Logs | S3, CW Logs | Task 설정에 따름 |

**의사결정 흐름도:**

```
명령을 실행해야 하는가?
    │
    ├─ 지금 한 번만? → Run Command
    │
    ├─ 항상 이 상태를 유지해야 하는가? → State Manager
    │
    └─ 특정 시간대에 정기적으로? → Maintenance Window
          │
          └─ 작업이 여러 단계인가? → Maintenance Window + Automation Runbook
```

## 📝 연습 문제

**문제 1.** 운영자가 200대의 prod EC2에 즉시 긴급 보안 패치 스크립트를 실행해야 한다. 동시에 너무 많이 실행되면 서비스 부하가 우려되고, 10% 이상 실패 시 전파를 막고 싶다. 가장 적합한 구성은?

A) State Manager Association으로 rate(1 hour) 스케줄 설정
B) Run Command: `--max-concurrency "10%"`, `--max-errors "10%"`, 대상은 `Key=tag:Environment,Values=prod`
C) Maintenance Window를 지금 바로 실행하도록 수동 트리거
D) Lambda로 각 인스턴스에 순차 API 호출

**정답: B**
해설: 긴급(즉시), 일회성, 동시성 제어가 필요한 상황은 Run Command의 전형적 사용 사례다. `--max-concurrency 10%`로 200대 중 20대씩 실행하고, `--max-errors 10%`로 20대 이상 실패 시 자동 중단한다. State Manager는 즉시 일회성 실행보다 지속 관리에 적합하다. A는 긴급성에 맞지 않는다.

---

**문제 2.** 회사가 모든 prod EC2에 CW Agent 설정을 동일하게 유지하려 한다. 신규 인스턴스가 Auto Scaling으로 추가돼도 자동으로 CW Agent 설정이 적용되어야 한다. 운영자가 별도로 개입할 필요가 없어야 한다. 가장 적합한 도구는?

A) Run Command를 EventBridge로 트리거 (EC2 launch 이벤트)
B) State Manager Association — 태그 기반 대상, 일일 스케줄, CW Agent 설정 Document
C) Maintenance Window — 주 1회 전체 적용
D) User Data 스크립트에 CW Agent 설정 포함

**정답: B**
해설: State Manager Association의 핵심 가치는 "신규 인스턴스가 등록되는 순간 Association이 자동 실행된다"는 것이다. Auto Scaling으로 추가된 인스턴스가 `MonitoringEnabled=true` 태그를 가지면 Managed Instance로 등록되는 즉시 Association이 실행된다. A도 동작하지만 EventBridge 규칙 설정이 추가로 필요하고, drift 교정이 안 된다. D는 AMI 업데이트 없이는 설정 변경이 어렵다.

---

**문제 3.** Maintenance Window를 Duration 4시간, Cutoff 1시간으로 설정했다. 03:45에 새 Task 실행을 시작하려 한다. 어떻게 되는가? (Window 시작: 02:00, 종료: 06:00)

A) 정상 실행된다
B) Cutoff 시간(05:00) 이전이므로 실행 가능하나, Window 종료(06:00) 후에도 진행 중 Task는 계속된다
C) Cutoff 시간(05:00)이 지났으므로 새 Task 시작이 거부된다
D) Duration을 초과했으므로 모든 Task가 중단된다

**정답: B**
해설: Duration 4시간, Cutoff 1시간이면 Window가 02:00에 시작해 06:00에 종료된다. Cutoff는 종료 1시간 전인 05:00부터 새 Task 시작을 막는다. 03:45는 Cutoff 이전이므로 새 Task를 시작할 수 있다. 이미 시작된 Task는 Window 종료 시각(06:00)이 넘어도 완료될 때까지 계속 실행된다. Window가 끝나면 "진행 중인 작업은 완료, 새 작업은 차단"이 Cutoff의 의도다.

---

**문제 4.** 다음 중 State Manager Association과 Run Command의 차이를 올바르게 설명한 것은?

A) State Manager는 Windows 인스턴스에만, Run Command는 Linux에만 작동한다
B) State Manager Association은 태그가 일치하는 신규 인스턴스에 자동 적용되지만, Run Command는 명시적으로 재실행해야 한다
C) Run Command가 더 많은 Document Type을 지원한다
D) State Manager는 온프레미스 서버에 사용할 수 없다

**정답: B**
해설: 가장 핵심적인 차이점이다. State Manager Association은 새 Managed Instance가 등록될 때 태그가 일치하면 즉시 실행된다. Run Command는 실행 시점의 스냅샷으로 한 번만 동작하고 이후 변경에 반응하지 않는다. 두 도구 모두 Linux/Windows/온프레미스를 지원한다.

---

**문제 5.** 운영팀이 매주 일요일 새벽 2~6시에 prod 서버 패치를 자동화하려 한다. 패치 전 EBS 스냅샷을 먼저 생성하고, 그 다음에 패치를 적용하는 순서가 보장되어야 한다. 가장 적합한 구성은?

A) State Manager Association — cron 스케줄, AWS-RunPatchBaseline Document
B) EventBridge cron → Lambda → Run Command 순차 호출
C) Maintenance Window — Duration/Cutoff 설정, Task 우선순위(Priority)로 스냅샷(1) → 패치(2) 순서 보장
D) Run Command를 일요일 새벽에 수동 실행

**정답: C**
해설: Maintenance Window의 Task Priority가 실행 순서를 보장한다. Priority 1이 완료된 후 Priority 2가 실행된다. 같은 Priority 번호의 Task들은 병렬로 실행된다. Automation Task로 스냅샷을 생성하고 Run Command Task로 패치를 적용하는 것이 표준 패턴이다. State Manager(A)는 스케줄 지원이 있지만 복수 Task의 순서 보장 기능이 없다.

---

**문제 6.** 회사가 SSM Inventory를 통해 수집한 데이터를 장기간 보관하고 SQL로 분석하고 싶다. 어떤 구성이 필요한가?

A) Inventory 데이터는 SSM 콘솔에서만 조회 가능하므로 외부 내보내기 불가
B) Resource Data Sync를 설정해 S3 버킷으로 Inventory 데이터를 동기화한 후 Amazon Athena로 SQL 쿼리
C) CloudWatch Logs로 Inventory 데이터를 전송 후 Insights로 분석
D) DynamoDB로 동기화 후 PartiQL 사용

**정답: B**
해설: SSM Resource Data Sync는 Inventory 데이터를 S3 버킷에 JsonSerDe 형식으로 동기화한다. 이후 AWS Glue 크롤러나 직접 Athena DDL로 테이블을 정의하면 SQL로 "어떤 서버에 어떤 소프트웨어가 있는가"를 분석할 수 있다. 대규모 환경에서 보안 취약점 대응, 라이선스 관리, 소프트웨어 표준 준수 확인에 활용된다.

---

**문제 7.** Run Command를 150대 인스턴스에 실행했는데 3대에서 실패했다. `--max-errors "5%"`로 설정되어 있었다. 나머지 147대는 어떻게 됐는가?

A) 3대 실패로 전체 실행이 즉시 중단됐다
B) 5% 임계값(7대) 이하이므로 나머지 배치가 계속 실행됐다
C) 실패한 3대에 자동으로 재실행됐다
D) 모든 인스턴스가 롤백됐다

**정답: B**
해설: 150대의 5%는 7.5 → ceil하면 7대가 허용 오차다. 3대 실패는 7대 미만이므로 circuit breaker가 트리거되지 않는다. 나머지 배치(다음 15대씩)가 계속 실행된다. 자동 재실행이나 롤백 기능은 없으므로 실패한 3대는 별도로 재실행해야 한다. 이 점이 State Manager(drift 자동 교정)와 Run Command의 가장 큰 차이다.

---
