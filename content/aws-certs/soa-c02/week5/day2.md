# Day 2 - Run Command, State Manager, Maintenance Window

📅 날짜: Week 5 (Day 2)
🎯 주제: 명령 실행·상태 강제·정해진 시간에 작업하기
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Run Command로 다수 인스턴스에 일회성 명령을 안전하게 실행한다
- State Manager Association으로 지속적인 desired state를 유지한다
- Maintenance Window로 패치 등 작업을 안전한 시간대에 자동 실행한다

---

## 🧩 사전 지식 (CS 기초)

- **Push vs Pull**: 서버에 push (Ansible) vs 서버가 pull (Puppet). SSM은 pull 기반
- **Idempotency**: 여러 번 실행해도 같은 결과. 자동화의 핵심
- **Convergence**: 시스템이 desired state로 수렴하는 성질. Puppet/Chef/State Manager의 모델
- **Concurrent execution**: 동시에 N개 실행 vs 배치 처리. 폭주 방지
- **Blast radius**: 한 번 실행으로 영향받는 범위. Run Command는 dry-run 또는 일부만 먼저

---

## 📖 이론 내용

### 1. Run Command

#### 개념
- 다수 Managed Instance에 명령을 동시 또는 단계적으로 실행
- SSH/PowerShell 키 없이, IAM 권한으로 안전하게
- 실행 결과(stdout/stderr)를 S3 + CloudWatch Logs에 자동 저장

#### SSM Document
- 실행할 작업의 정의 (JSON/YAML)
- AWS 제공 (`AWS-RunShellScript`, `AWS-RunPowerShellScript`)
- 사용자 작성 가능

#### 대상 지정 방식
- **Instance IDs**: 명시적 ID 나열 (최대 50개)
- **Tags**: 태그 기반 동적 (예: `Environment=prod`)
- **Resource Groups**: 사전 정의된 그룹

#### 동시성 제어
- **Concurrency**: 동시 실행 수 (예: 10 또는 10%)
- **Error threshold**: 에러 N건 또는 N% 초과 시 중단
- 점진적 배포 (Rolling) 가능

#### 출력 저장
```bash
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["df -h","free -m"]' \
  --targets "Key=tag:Environment,Values=prod" \
  --output-s3-bucket-name "ssm-command-output" \
  --output-s3-key-prefix "$(date +%Y/%m/%d)" \
  --cloud-watch-output-config "CloudWatchLogGroupName=/ssm/run-command,CloudWatchOutputEnabled=true"
```

### 2. State Manager

#### 개념
- "이 인스턴스는 항상 이 상태여야 한다"를 강제
- Drift가 발생하면 자동 교정 (Convergence)
- Cron/Rate 스케줄로 주기 점검

#### Association
- SSM Document + Target + Schedule의 묶음
- 예: "tag:Environment=prod에 매일 CloudWatch Agent 설정 적용"

#### Convergence 동작
1. 인스턴스가 Online 되면 즉시 Association 실행
2. 스케줄에 따라 주기 실행
3. 실패 시 재시도

#### 적용 시나리오
- CloudWatch Agent 설정 동기화
- 안티바이러스 정의 업데이트
- 표준 사용자/그룹 강제
- 로그 디렉토리 권한 강제

### 3. Maintenance Window

#### 개념
- 운영에 영향 적은 시간대에 자동화 작업 실행
- 예: 매주 일요일 새벽 2시에 패치 적용

#### 구성 요소
- **Window**: 시간대 정의 (cron + duration)
- **Targets**: 작업 대상 (인스턴스/태그/리소스 그룹)
- **Tasks**: 실행할 작업 (Run Command, Automation, Lambda, Step Functions)

#### 동시성·중단 제어
- **Concurrency**: 한 번에 몇 대까지
- **Error tolerance**: 몇 대 실패 시 중단
- **Cutoff**: Window 종료 N분 전엔 새 작업 시작 X

#### 예시 시나리오
```
Window: 매주 일요일 02:00 ~ 04:00 (2시간)
Cutoff: 30분 (01:30 이후 신규 작업 X)
Concurrency: 10%
Error tolerance: 5%
Targets: tag:PatchGroup=prod-web
Tasks:
  1. Snapshot 생성 (Automation)
  2. AWS-RunPatchBaseline (Run Command)
  3. 헬스체크 (Automation)
```

### 4. Compliance

#### 개념
- Patch + Custom State 결과로 컴플라이언스 점수 산출
- 콘솔에서 NON_COMPLIANT 리소스 한눈에

#### Compliance Types
- **Patch**: 패치 베이스라인 대비 누락
- **Association**: State Manager 실행 결과
- **Custom**: 사용자 정의 (Lambda로 직접 보고)

### 5. Run Command + EventBridge

#### 패턴
- "EC2 RunInstances 후 새 인스턴스에 자동으로 표준 설정 배포"
- EventBridge Rule이 RunInstances 이벤트 매칭 → SSM Document 실행

### 6. Distributor

- 자사 소프트웨어 패키지를 배포·버전 관리
- SSM Document와 통합되어 Run Command/State Manager로 설치
- 예: 사내 보안 에이전트, 커스텀 모니터링 툴

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Pseudo Parameters** | `{{InstanceId}}` 같은 자동 치환 | Document 동적 활용 |
| **OutputS3 with KMS** | 출력 암호화 | 컴플라이언스 |
| **Document Versions** | Document에 버전 관리 | 안전한 변경 |
| **SSM Agent 자동 업데이트** | `AWS-UpdateSSMAgent` Document 활용 | State Manager로 강제 |
| **OpsCenter 통합** | 실패 시 자동 OpsItem 생성 | 인시던트 추적 |

> ⚠️ **함정 1**: Run Command는 일회성 — 신규 인스턴스에 자동 적용은 State Manager.
>
> ⚠️ **함정 2**: Maintenance Window의 Cutoff을 짧게 두면 작업이 중간에 잘리고, 너무 길면 Window 초과로 충돌.
>
> 💡 **암기 팁**: Run Command(일회성) ↔ State Manager(지속) ↔ Maintenance Window(스케줄). 3종 세트.

### 관련 서비스 Cross-Reference

- **Run Command → Week 5 Day 3** (Patch Manager 내부적으로 활용)
- **State Manager → Week 3 Day 3** (CloudWatch Agent 동기화)
- **Maintenance Window → Week 10** (백업 작업 스케줄)
- **Distributor → Week 7** (Image Builder와 함께 Golden AMI)

---

## 🏗️ 아키텍처 다이어그램

```
Run Command vs State Manager vs Maintenance Window
==========================================================

   Run Command (일회성)
   ─────────────────
   운영자 → "지금 이 명령 실행"
            ↓
         Managed Instance
         (실행 후 끝)

   State Manager (지속)
   ────────────────────
   Association 정의
            ↓
         Managed Instance
         (자동 적용 + 주기적 점검 + drift 교정)

   Maintenance Window (스케줄)
   ──────────────────────────
   Window: 일요일 02:00~04:00
            ↓ Cutoff 시간 고려
         Task: Snapshot → Patch → 헬스체크
            ↓ Concurrency / Error tolerance
         Managed Instance
```

```
Run Command 안전 실행 패턴
==========================================================

   send-command:
    - targets: tag:Environment=prod
    - max-concurrency: 10%
    - max-errors: 5%
    - output: S3 + CloudWatch Logs
            │
            ▼
   ┌──────────────────────────────┐
   │  단계적 배포 (Rolling)        │
   │  10개씩 동시 → 다음 10개      │
   │  5% 에러 발생 시 중단          │
   └──────────────────────────────┘
            │
            ▼
   [출력] S3 + Logs 자동 저장
   [실패] OpsCenter OpsItem 생성
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Run Command = 일회성, State Manager = 지속, Maintenance Window = 스케줄**
2. ⭐ **Concurrency·Error Tolerance로 안전한 점진적 배포** — 비율(%) 또는 절대값
3. ⭐ **태그 기반 동적 대상 선정** — 신규 인스턴스도 태그 맞으면 자동 포함
4. ⭐ **출력은 S3 + CloudWatch Logs에 자동 저장** — 감사 가능
5. ⭐ **Maintenance Window Cutoff** — Window 종료 전 신규 작업 중단 시점

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Run Command - 다수 인스턴스에 안전하게 디스크 점검
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["df -h", "free -m", "uptime"]' \
  --targets "Key=tag:Environment,Values=prod" "Key=tag:Application,Values=web" \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --output-s3-bucket-name "ssm-output-bucket" \
  --output-s3-key-prefix "disk-check/$(date +%Y/%m/%d)" \
  --cloud-watch-output-config "CloudWatchLogGroupName=/ssm/disk-check,CloudWatchOutputEnabled=true" \
  --timeout-seconds 600

# 2. State Manager Association - CloudWatch Agent 설정 강제
aws ssm create-association \
  --association-name "EnforceCWAgent" \
  --name "AmazonCloudWatch-ManageAgent" \
  --targets "Key=tag:MonitoringEnabled,Values=true" \
  --parameters '{
    "action":["configure"],
    "mode":["ec2"],
    "optionalConfigurationSource":["ssm"],
    "optionalConfigurationLocation":["/cloudwatch/agent/prod-config"],
    "optionalRestart":["yes"]
  }' \
  --schedule-expression "rate(1 day)" \
  --max-concurrency "20%" \
  --max-errors "5%"

# 3. Maintenance Window - 주간 패치 작업
WINDOW_ID=$(aws ssm create-maintenance-window \
  --name "Weekly-Prod-Patch" \
  --schedule "cron(0 2 ? * SUN *)" \
  --duration 4 \
  --cutoff 1 \
  --allow-unassociated-targets \
  --query 'WindowId' --output text)

# 대상 등록
aws ssm register-target-with-maintenance-window \
  --window-id $WINDOW_ID \
  --resource-type INSTANCE \
  --targets "Key=tag:PatchGroup,Values=prod-web" \
  --owner-information "ProdWebPatchTarget"

# Task 등록 - 패치
aws ssm register-task-with-maintenance-window \
  --window-id $WINDOW_ID \
  --task-arn "AWS-RunPatchBaseline" \
  --service-role-arn "arn:aws:iam::123:role/AWSServiceRoleForMW" \
  --task-type RUN_COMMAND \
  --targets "Key=WindowTargetIds,Values=<target-id>" \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --priority 1 \
  --task-invocation-parameters '{
    "RunCommand": {
      "Parameters": {"Operation":["Install"], "RebootOption":["RebootIfNeeded"]},
      "OutputS3BucketName":"patch-output-bucket"
    }
  }'

# 4. Run Command 결과 조회
COMMAND_ID="abc-def-123"
aws ssm list-command-invocations \
  --command-id $COMMAND_ID \
  --details \
  --query 'CommandInvocations[*].[InstanceId,Status,CommandPlugins[0].Output]'

# 5. State Manager Association 강제 재실행
aws ssm start-associations-once \
  --association-ids "abc-def-123"

# 6. Compliance 요약
aws ssm list-compliance-summaries \
  --query 'ComplianceSummaryItems[*].[ComplianceType,CompliantSummary.CompliantCount,NonCompliantSummary.NonCompliantCount]'
```

---

## 📝 연습 문제

**문제 1.** 회사가 100대 EC2 인스턴스에 일회성 패치 점검 명령을 실행하려 한다. 동시 폭주를 막고 5% 에러 시 중단하려면?

A) 100대에 한 번에 전송
B) `--max-concurrency 10%` + `--max-errors 5%`로 점진 실행
C) 수동 SSH
D) CloudFormation

**정답: B**
해설: Run Command의 Concurrency·Error tolerance가 점진 배포의 핵심. 10대씩 실행하면서 5% 에러 발생 시 자동 중단 → 운영 안전.

---

**문제 2.** 회사가 모든 prod 태그 EC2에 매일 안티바이러스 정의를 업데이트하고 drift 발생 시 자동 교정하려 한다. 가장 적합한 도구는?

A) Run Command
B) State Manager Association — 태그 기반 + 스케줄 + drift 자동 교정
C) Maintenance Window만
D) Lambda 주기 실행

**정답: B**
해설: "지속적 desired state 유지"의 표준 도구. Run Command는 일회성, Maintenance Window는 스케줄만. State Manager가 정확한 답.

---

**문제 3.** 회사가 매주 일요일 새벽 2~4시에 패치 적용을 자동화하려 한다. 가장 적합한 도구는?

A) Maintenance Window (cron 스케줄 + Tasks)
B) State Manager
C) EventBridge cron + Lambda
D) Cron job on each EC2

**정답: A**
해설: 정확히 Maintenance Window의 사용 사례. 시간대 정의 + 대상 + 작업 묶음. Concurrency/Error tolerance로 안전.

---

**문제 4.** 새로 만든 EC2 인스턴스에 자동으로 표준 설정이 적용되도록 하려 한다. 가장 적합한 패턴은?

A) User Data 스크립트로 매번 작성
B) 인스턴스에 표준 태그 부여 + State Manager Association이 태그 기반 → 자동 적용
C) AMI에 미리 포함
D) Lambda 트리거

**정답: B**
해설: State Manager는 새 Managed Instance가 등록되는 순간 Association 자동 실행. 태그만 맞으면 자동 포함 → 운영 부담 없음.

---

**문제 5.** Maintenance Window Cutoff의 역할은?

A) Window 시작 시간
B) Window 종료 N분 전부터 신규 작업 시작 금지 — 진행 중 작업이 강제 중단되지 않게
C) 동시 실행 한도
D) 에러 한도

**정답: B**
해설: Cutoff는 Window 종료 시점에 새 작업이 시작돼서 미완료 상태가 되는 걸 방지. 진행 중 작업은 Cutoff와 무관하게 계속 실행.

---

## 📌 오늘의 요약

1. Run Command: 일회성 명령. Concurrency·Error tolerance로 점진 배포
2. State Manager: 지속적 desired state. Drift 발생 시 자동 교정. 신규 인스턴스 자동 포함
3. Maintenance Window: 시간대 + 대상 + 작업. cron 스케줄. Cutoff로 안전 종료
4. 태그 기반 동적 대상 선정 — 신규 인스턴스도 태그 맞으면 자동 처리
5. 출력은 S3 + CloudWatch Logs 자동 저장 — 감사·트러블슈팅
