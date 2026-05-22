# Day 1 - Systems Manager - Run Command, Patch Manager

📅 날짜: Week 9 (Day 1)
🎯 주제: 대규모 인스턴스 운영 자동화의 핵심 도구
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SSM의 핵심 5종(Run Command, Session Manager, Patch Manager, State Manager, Inventory) 역할
- SSM Agent와 IAM Instance Profile 요구사항
- Patch Baseline 설계
- Session Manager로 SSH/RDP 대체

---

## 🧩 사전 지식 (CS 기초)

- **Agent-based management**: 머신에 에이전트 설치 + 중앙 제어.
- **Compliance**: 정책 일치 여부.
- **Patch Baseline**: 패치 승인 정책 (CVE 등급, 며칠 대기 등).
- **Maintenance Window**: 정기 작업 시간대.

---

## 📖 이론 내용

### 1. SSM 서비스 지도

| 서비스 | 역할 |
|--------|------|
| **Run Command** | 원격 명령 실행 (대규모 동시) |
| **Session Manager** | 브라우저/CLI 셸 — SSH 대체 |
| **Patch Manager** | OS/앱 패치 자동화 |
| **State Manager** | 원하는 상태 유지 (cron 같은 정기 실행) |
| **Inventory** | 인스턴스 SW/HW 정보 수집 |
| **Automation** | Runbook (SSM Document로 정의) |
| **Distributor** | 패키지 배포 |
| **Parameter Store** | 구성 값 저장 (Week 9 Day 4) |
| **Change Calendar** | 변경 freeze 기간 정의 |
| **OpsCenter** | 운영 이슈 추적 |
| **Incident Manager** | 인시던트 대응 (Week 12 Day 4) |

### 2. SSM Agent + IAM 요구사항

- SSM Agent: Amazon Linux/Ubuntu/Windows AMI에 기본 포함 (2017+)
- IAM Instance Profile에 `AmazonSSMManagedInstanceCore` 정책
- 인스턴스가 SSM 엔드포인트와 통신 가능해야 함:
  - 인터넷 또는 VPC Endpoint (`ssm`, `ssmmessages`, `ec2messages`)

### 3. Run Command

```bash
aws ssm send-command \
  --document-name AWS-RunShellScript \
  --targets Key=tag:Environment,Values=prod \
  --parameters 'commands=["sudo systemctl restart nginx"]' \
  --max-concurrency 10% \
  --max-errors 5 \
  --comment "Restart nginx prod"
```

**핵심 옵션:**
- `--targets`: tag/instance-id/resource-group
- `--max-concurrency`: 동시 실행 수 (%, 절대값)
- `--max-errors`: 허용 실패 수

대규모 fleet (수천 대) 안전 운영의 표준.

### 4. Session Manager

```bash
aws ssm start-session --target i-1234567890
```

- SSH 키 불필요
- 22번 포트 안 열어도 됨
- 모든 세션 CloudTrail 기록 가능
- 키 관리/회전 부담 제거
- 콘솔 + CLI 모두 사용 가능

**SSH 위에 Session Manager 사용:**
```
~/.ssh/config
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

기존 SSH 도구를 SSM 위에 쓸 수 있음. Bastion 제거 가능.

### 5. Patch Manager

**Patch Baseline:**
- 어떤 패치를 승인할지 (CVE 등급, 출시 후 N일)
- 자동 승인 규칙 (Approval Rules)
- 미국 OS 별로 사전 제공 (Default baseline)

```bash
aws ssm create-patch-baseline \
  --name "Prod-Linux" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules '{
    "PatchRules": [{
      "PatchFilterGroup": {
        "PatchFilters": [
          {"Key":"CLASSIFICATION","Values":["Security","Bugfix","Critical"]},
          {"Key":"SEVERITY","Values":["Critical","Important"]}
        ]
      },
      "ApproveAfterDays": 7,
      "ComplianceLevel": "CRITICAL"
    }]
  }'
```

**Patch Group:** Patch Baseline 적용 대상. 인스턴스 태그 `Patch Group=Prod-Linux`.

**Patch 작업:**
- `Scan`: 패치 필요 여부만 확인
- `Install`: 실제 적용 (재부팅 필요 시 Reboot)

### 6. Maintenance Window

```bash
aws ssm create-maintenance-window \
  --name "Prod-Patching" \
  --schedule "cron(0 3 ? * SAT *)" \
  --duration 4 --cutoff 1 \
  --allow-unassociated-targets

aws ssm register-target-with-maintenance-window \
  --window-id mw-... \
  --resource-type INSTANCE \
  --targets Key=tag:Environment,Values=prod

aws ssm register-task-with-maintenance-window \
  --window-id mw-... \
  --task-arn AWS-RunPatchBaseline \
  --task-type RUN_COMMAND \
  --targets Key=WindowTargetIds,Values=mw-target-... \
  --max-concurrency 10% --max-errors 5
```

토요일 새벽 3시 시작, 4시간 윈도우, cutoff 1시간 (작업 시작 차단 시점).

### 7. State Manager Association

원하는 상태를 정기적으로 강제:
```bash
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["AmazonCloudWatchAgent"]}' \
  --schedule-expression "rate(7 days)" \
  --apply-only-at-cron-interval
```

cron job 같지만 중앙 관리 + 컴플라이언스 리포팅.

---

## 🧠 알아두면 좋은 심화 이론

### Hybrid Activation (On-Prem)

```bash
aws ssm create-activation \
  --default-instance-name onprem-1 \
  --iam-role SSMOnPremRole \
  --registration-limit 100 \
  --expiration-date "2026-12-31T00:00:00Z"

# 온프레미스 머신에서
amazon-ssm-agent -register -code ... -id ... -region ap-northeast-2
```

온프레미스 머신을 SSM에 등록. `mi-` 접두사 ID 받음. ECS Anywhere와 유사.

### Session Manager 로깅

```bash
aws ssm update-document \
  --name SSM-SessionManagerRunShell \
  --content file://session-config.json
# CloudWatch Logs 그룹 + S3 버킷 + KMS 지정
```

모든 키 입력/출력 로그 → 컴플라이언스.

### Patch 결과 가시화

- `aws ssm describe-instance-patch-states-for-patch-group`
- AWS Config rule `cloudwatch-alarm-action-check`
- Compliance Dashboard (AWS Console)
- Security Hub 통합

### Run Command vs SSH 비교

| 항목 | SSH | Run Command |
|------|-----|-------------|
| 키 관리 | 부담 | 없음 |
| 감사 | sshd 로그 | CloudTrail + S3 |
| 대규모 동시 | 어려움 | 수천 대 |
| 한 명령 결과 집계 | 어려움 | 자동 |

### 관련 서비스 Cross-Reference

- **EC2 Instance Profile** → Week 4 Day 2
- **State Manager** → Week 9 Day 2
- **Distributor** → Week 9 Day 2
- **AppConfig** → Week 9 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
SSM Fleet Operations
==================================================

  Engineer
      │ aws ssm start-session
      │ aws ssm send-command
      ▼
  SSM Service (regional)
      │
      │ via SSM endpoints (or NAT)
      ▼
  EC2 / On-Prem Instances
   ├─ SSM Agent
   ├─ IAM Instance Profile (AmazonSSMManagedInstanceCore)
   └─ Tags: {Environment: prod, Patch Group: Prod-Linux}

  Patch Manager flow:
   Maintenance Window (Sat 03:00, 4h)
      ▼
   AWS-RunPatchBaseline task
      ▼
   Patch Baseline (CVE filter, 7 day delay)
      ▼
   Scan + Install per instance
      ▼
   Compliance reported to SSM Compliance + Security Hub
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Run Command + Session Manager로 SSH/Bastion 제거
2. ⭐ Patch Baseline + Patch Group + Maintenance Window 3종 조합
3. ⭐ SSM Agent + IAM Instance Profile + 네트워크 경로(엔드포인트 또는 NAT)
4. ⭐ State Manager로 cron 대체 + 중앙 컴플라이언스
5. ⭐ Hybrid Activation으로 On-Prem 통합

---

## 💻 실제 예시 - 전체 자동 패칭

```bash
# 1) Patch Baseline 생성
aws ssm create-patch-baseline --name Prod-Linux-Baseline \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules file://baseline-rules.json

# 2) Patch Group에 인스턴스 등록 (태그)
aws ec2 create-tags --resources i-... --tags Key="Patch Group",Value=Prod-Linux

# 3) Maintenance Window
aws ssm create-maintenance-window \
  --name Prod-Patching --schedule "cron(0 3 ? * SAT *)" \
  --duration 4 --cutoff 1

aws ssm register-target-with-maintenance-window \
  --window-id mw-abc --resource-type INSTANCE \
  --targets Key=tag:Patch Group,Values=Prod-Linux

aws ssm register-task-with-maintenance-window \
  --window-id mw-abc --task-arn AWS-RunPatchBaseline \
  --task-type RUN_COMMAND \
  --task-invocation-parameters '{"RunCommand":{"Parameters":{"Operation":["Install"]}}}' \
  --max-concurrency 10% --max-errors 5
```

---

## 📝 연습 문제

**문제 1.** SSH 키 관리 부담을 제거하려면?

A) IAM User
B) Session Manager + IAM 권한
C) Bastion EC2
D) VPN

**정답: B**
해설: Session Manager가 SSH 대체.

---

**문제 2.** Patch Manager의 Patch Baseline 핵심 요소는?

A) CVE 등급 필터 + 출시 후 N일 자동 승인 규칙
B) IAM 권한
C) Region
D) ASG

**정답: A**
해설: 승인 규칙이 baseline의 본질.

---

**문제 3.** SSM Agent가 통신하지 못한다. 가능 원인이 아닌 것은?

A) IAM Instance Profile 누락
B) SSM Endpoints/NAT 부재
C) Agent 미설치
D) 인스턴스 타입 t4g

**정답: D**
해설: 인스턴스 타입은 무관.

---

**문제 4.** Run Command의 `--max-concurrency 10%`의 의미는?

A) 동시 실행을 대상의 10%로 제한 — 점진적 배포
B) 10초 대기
C) 10번 재시도
D) 비용 절감

**정답: A**
해설: 점진적 변경의 표준.

---

**문제 5.** State Manager Association의 용도는?

A) 정기 작업 + 중앙 컴플라이언스 보고
B) 1회 실행
C) IAM 회전
D) Lambda 트리거

**정답: A**
해설: cron 같지만 중앙 관리.

---

**문제 6.** Session Manager 세션 로그를 영구 보관하려면?

A) CloudWatch Logs Group + S3 bucket 설정 (KMS 암호화)
B) Lambda
C) DynamoDB
D) EBS

**정답: A**
해설: 표준 감사 패턴.

---

**문제 7.** Maintenance Window의 `cutoff 1`의 의미는?

A) 1시간 전부터 새 작업 시작 차단 (이미 시작된 작업은 계속)
B) 1시간 동안 실행
C) 1시간마다 반복
D) 1분 timeout

**정답: A**
해설: cutoff = 작업 시작 차단 시점.

---

## 📌 오늘의 요약

1. SSM 5종: Run Command / Session Manager / Patch Manager / State Manager / Inventory
2. Session Manager로 SSH/Bastion 제거 + 모든 세션 감사
3. Patch Baseline + Patch Group + Maintenance Window 3종 조합
4. State Manager로 cron 대체 + 컴플라이언스
5. Hybrid Activation으로 On-Prem 통합
