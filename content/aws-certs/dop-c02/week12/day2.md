# Day 2 - SSM Automation Runbook + Approval

📅 날짜: Week 12 (Day 2)
🎯 주제: 운영 절차의 코드화 — Runbook-as-Code
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- SSM Automation Document 구조와 Step 종류
- AWS 제공 Runbook 활용 + Custom Runbook 작성
- aws:approve Step으로 사람 승인 통합
- EventBridge → Automation 자동 트리거

---

## 🧩 사전 지식 (CS 기초)

- **Runbook**: 운영 절차 문서. 코드화 시 자동 실행 가능.
- **Workflow Engine**: 상태/분기/재시도. Step Functions와 유사.
- **Idempotent Step**: 재실행 안전.

---

## 📖 이론 내용

### 1. SSM Document 종류

| Document Type | 용도 |
|---------------|------|
| `Automation` | 워크플로 (이번 주제) |
| `Command` | Run Command 스크립트 |
| `Session` | Session Manager 설정 |
| `Package` | Distributor |
| `Policy` | State Manager |

### 2. Automation Document 구조

```yaml
schemaVersion: '0.3'
description: Auto-remediate unencrypted S3 buckets
assumeRole: '{{AutomationAssumeRole}}'
parameters:
  BucketName:
    type: String
  AutomationAssumeRole:
    type: String
mainSteps:
  - name: CheckBucket
    action: aws:executeAwsApi
    inputs:
      Service: s3
      Api: GetBucketEncryption
      Bucket: '{{BucketName}}'
    onFailure: 'step:EnableEncryption'
    isCritical: false

  - name: EnableEncryption
    action: aws:executeAwsApi
    inputs:
      Service: s3
      Api: PutBucketEncryption
      Bucket: '{{BucketName}}'
      ServerSideEncryptionConfiguration:
        Rules:
          - ApplyServerSideEncryptionByDefault:
              SSEAlgorithm: AES256

  - name: NotifySlack
    action: aws:invokeLambdaFunction
    inputs:
      FunctionName: SlackNotifier
      Payload: '{"text":"Encryption enabled on {{BucketName}}"}'
```

### 3. Step Action 종류

| Action | 용도 |
|--------|------|
| `aws:executeAwsApi` | AWS API 직접 호출 |
| `aws:runCommand` | Run Command 실행 |
| `aws:invokeLambdaFunction` | Lambda 호출 |
| `aws:executeStateMachine` | Step Functions 시작 |
| `aws:approve` | 사람 승인 대기 |
| `aws:branch` | 조건 분기 |
| `aws:waitForResource` | 리소스 상태 대기 (RDS available 등) |
| `aws:sleep` | 시간 대기 |
| `aws:runInstances` | EC2 시작 |
| `aws:createImage` | AMI 생성 |
| `aws:executeScript` | Python/Pwsh 스크립트 |

### 4. aws:approve

```yaml
- name: ApproveRestart
  action: aws:approve
  inputs:
    NotificationArn: arn:aws:sns:...:OncallTopic
    Message: 'Restart prod DB {{DbId}}?'
    MinRequiredApprovals: 2
    Approvers:
      - 'arn:aws:iam::...:role/SeniorOps'
```

복수 승인자 + 일정 시간 timeout. 자동화 중 사람 검토 포인트.

### 5. AWS 제공 Runbook 예

| Runbook | 용도 |
|---------|------|
| `AWSSupport-TroubleshootRDP` | EC2 RDP 문제 진단 |
| `AWS-StopEC2Instance` | EC2 중지 |
| `AWS-RestartRdsInstance` | RDS 재시작 |
| `AWSSupport-MigrateXrayLogs` | X-Ray 로그 이전 |
| `AWS-DisablePublicAccessForS3Bucket` | S3 Public 차단 |
| `AWS-EnableExploreEC2RebootAlarm` | 자동 알람 |

수백 개. 콘솔 또는 `aws ssm describe-document` 검색.

### 6. EventBridge → Automation

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{"numeric": [">=", 7]}],
    "type": [{"prefix": "UnauthorizedAccess:EC2/"}]
  }
}
```

Target: SSM Automation 문서:
```json
{
  "DocumentName": "AWS-IsolateEC2Instance",
  "Parameters": {
    "InstanceId": ["$.detail.resource.instanceDetails.instanceId"]
  }
}
```

자동 격리 + Slack 알림 + 티켓 생성.

### 7. Maintenance Window + Automation

```bash
aws ssm register-task-with-maintenance-window \
  --window-id mw-... \
  --task-arn AWS-PatchAsgInstance \
  --task-type AUTOMATION \
  --targets Key=tag:Environment,Values=prod
```

정기 Automation 실행. ASG 패치, 백업 검증 등.

---

## 🧠 알아두면 좋은 심화 이론

### Cross-Account Automation

- Multi-Account Automation Execution: 한 Document을 여러 계정/리전 동시 실행
- TargetLocations 매개변수로 OU/계정/리전 지정

### Automation Self-Service via Service Catalog

- Service Catalog에 Automation Document 등록
- 개발자가 셀프서비스로 트리거 (예: 환경 reset)

### Output Parameters

```yaml
- name: GetSnapshot
  action: aws:executeAwsApi
  outputs:
    - Name: SnapshotId
      Selector: $.SnapshotId
      Type: String
  inputs: ...
- name: UseSnapshot
  action: ...
  inputs:
    SnapshotId: '{{GetSnapshot.SnapshotId}}'
```

Step 간 데이터 전달.

### Test Mode

`aws ssm start-automation-execution --automation-mode Interactive` — 대화형 디버깅.

### 관련 서비스 Cross-Reference

- **EventBridge** → Week 12 Day 1
- **GuardDuty** → Week 14 Day 1
- **Incident Manager** → Week 12 Day 4

---

## 🏗️ 아키텍처 다이어그램

```
SSM Automation Runbook Flow
==================================================

  Trigger (multiple sources)
   ├─ EventBridge Rule (GuardDuty, Config, CW Alarm)
   ├─ Maintenance Window
   ├─ Manual (Console/CLI)
   └─ Service Catalog (self-service)
        │
        ▼
   Automation Document
   ├─ Step 1: aws:executeAwsApi
   ├─ Step 2: aws:branch (condition)
   │      ├─ critical → aws:approve (people)
   │      └─ non-critical → continue
   ├─ Step 3: aws:invokeLambdaFunction
   └─ Step 4: aws:executeScript (Python)
        │
        ▼
   Output: results + metrics + log
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Automation Document = Step 기반 워크플로 (aws:executeAwsApi/runCommand/Lambda/branch/approve)
2. ⭐ aws:approve로 사람 승인 통합
3. ⭐ EventBridge → Automation으로 자동 인시던트 대응
4. ⭐ AWS 제공 Runbook 수백 개 — 재발명 X
5. ⭐ Multi-Account Automation으로 멀티 계정 동시 실행

---

## 💻 실제 예시

```yaml
# auto-remediate.yaml
schemaVersion: '0.3'
parameters:
  InstanceId: {type: String}
mainSteps:
  - name: Quarantine
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: '{{InstanceId}}'
      Groups: ['sg-quarantine']
  - name: NotifyOncall
    action: aws:invokeLambdaFunction
    inputs:
      FunctionName: OncallNotifier
      Payload: '{"instance":"{{InstanceId}}","reason":"GuardDuty critical"}'
  - name: ApproveTermination
    action: aws:approve
    inputs:
      NotificationArn: arn:...:OncallTopic
      Message: 'Terminate {{InstanceId}}?'
  - name: Terminate
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: TerminateInstances
      InstanceIds: ['{{InstanceId}}']
```

```bash
aws ssm create-document --name auto-remediate \
  --document-type Automation --content file://auto-remediate.yaml \
  --document-format YAML
```

---

## 📝 연습 문제

**1.** "GuardDuty Critical 발생 → EC2 자동 격리" 가장 적절한 구성?  A) EventBridge → SSM Automation Document B) Lambda 매번  **정답: A**

**2.** Automation 사람 승인 통합?  A) aws:approve Step + SNS Topic + 다중 승인자  **정답: A**

**3.** 멀티 계정 동시 Automation 실행?  A) TargetLocations로 OU/계정/리전 지정 B) Lambda 매계정 호출  **정답: A**

**4.** 단계 간 데이터 전달?  A) outputs Selector + 다음 Step의 inputs 참조  **정답: A**

**5.** Service Catalog + Automation 조합?  A) 셀프서비스로 개발자가 Runbook 트리거  **정답: A**

**6.** Maintenance Window에 Automation 등록?  A) task-type AUTOMATION으로 정기 실행  **정답: A**

**7.** "절차 코드화 + 자동 실행"이라는 운영 우수성 원칙의 구현?  A) SSM Automation B) Trusted Advisor  **정답: A**

---

## 📌 오늘의 요약

1. Automation = Step 기반 Runbook
2. aws:approve로 사람 승인 통합
3. EventBridge → Automation 자동 대응
4. AWS 제공 Runbook 활용
5. Multi-Account TargetLocations로 동시 실행
