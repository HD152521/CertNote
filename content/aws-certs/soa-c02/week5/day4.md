# Day 4 - Parameter Store, Session Manager, Automation Runbook

📅 날짜: Week 5 (Day 4)
🎯 주제: 설정 중앙화·SSH 없는 접속·자동화 워크플로
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Parameter Store로 설정·비밀을 중앙에서 관리한다
- Session Manager로 SSH/RDP 없이 안전하게 접속·감사한다
- Automation Runbook으로 복잡한 운영 작업을 자동화한다

---

## 🧩 사전 지식 (CS 기초)

- **Configuration as Data**: 코드와 설정을 분리해 외부에서 주입
- **12-factor App - Config**: 설정은 환경 변수/외부 저장소에
- **Just-in-time access**: 필요한 순간에만 접근 권한 부여. Session Manager가 표준
- **Idempotent operation**: 같은 입력에 같은 결과. Automation 핵심
- **Workflow orchestration**: 여러 단계의 작업을 조건·반복으로 묶음

---

## 📖 이론 내용

### 1. Parameter Store

#### 개념
- 설정·시크릿을 안전하게 저장·조회하는 키-값 저장소
- `/myapp/prod/db/host` 같은 계층 구조
- 무료 (Standard) 또는 유료 (Advanced)

#### 파라미터 종류
| Type | 설명 |
|------|------|
| **String** | 일반 문자열 |
| **StringList** | 콤마 구분 리스트 |
| **SecureString** | KMS 암호화 (비밀번호·API 키) |

#### Standard vs Advanced

| 항목 | Standard | Advanced |
|------|----------|----------|
| 파라미터 수 한도 | 10,000개 | 100,000개 |
| 값 크기 | 4KB | 8KB |
| Parameter Policies | 불가 | 가능 (만료, 변경 알림) |
| 비용 | 무료 | $0.05/파라미터/월 |

#### Parameter Policies (Advanced 전용)
- **Expiration**: 만료 후 자동 삭제
- **ExpirationNotification**: 만료 N일 전 EventBridge 알림
- **NoChangeNotification**: N일 변경 없으면 알림 (오래된 값 감지)

#### 사용 예시
```bash
# 값 저장 (SecureString)
aws ssm put-parameter \
  --name "/myapp/prod/db/password" \
  --value "$(openssl rand -base64 32)" \
  --type SecureString \
  --key-id "alias/myapp-secrets"

# 값 조회
aws ssm get-parameter \
  --name "/myapp/prod/db/password" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text

# 계층 일괄 조회
aws ssm get-parameters-by-path \
  --path "/myapp/prod/" \
  --recursive \
  --with-decryption
```

#### CloudFormation/EC2/Lambda 통합
- CFn 템플릿에서 `{{resolve:ssm:/myapp/prod/db/host}}` 형식으로 참조
- Lambda 환경변수로 직접 사용 가능 (Powertools 활용)

#### Parameter Store vs Secrets Manager

| 항목 | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| 가격 | 무료 / Advanced 저렴 | 시크릿당 $0.40/월 |
| 자동 회전 | 없음 | RDS/Lambda 통합 |
| 크로스 리전 복제 | 없음 | 있음 |
| 사용 사례 | 일반 설정 + 단순 시크릿 | 자동 회전 필요한 DB 자격증명 |

→ Week 9에서 Secrets Manager 자세히.

### 2. Session Manager

#### 개념
- SSH 키·RDP 비밀번호·Bastion 없이 EC2/온프레미스 접속
- IAM 권한 기반 접근 제어
- 모든 세션이 자동 감사(S3/CloudWatch Logs)

#### 장점 (운영 보안 모범 사례)
1. **포트 22/3389 닫아도 됨** — 인바운드 0개로
2. **SSH 키 분배 부담 X** — IAM 기반
3. **모든 명령 자동 로깅** — 감사 가능
4. **MFA 강제 가능** — IAM 정책 조건
5. **세션 시간 제한** — `idleSessionTimeout` 설정

#### 접속 방식
```bash
# CLI에서 직접 접속 (Session Manager Plugin 필요)
aws ssm start-session --target i-0123456789abcdef0

# 명령 한 줄 실행
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartInteractiveCommand \
  --parameters '{"command":["sudo cat /var/log/messages | tail -50"]}'

# 포트 포워딩 (RDS 등에 안전 접근)
aws ssm start-session \
  --target i-0123 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["rds-cluster.xyz.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5432"]}'
```

#### Session Preferences
- 로깅 활성화 (S3/CloudWatch Logs)
- KMS 암호화
- Run As user (Linux의 경우 특정 사용자로 실행)
- idleSessionTimeout
- maxSessionDuration

#### 사설 VPC + Session Manager
- VPC Endpoint (ssm/ssmmessages/ec2messages) 필요
- 인터넷 게이트웨이/NAT 불필요

### 3. Automation Runbook

#### 개념
- 여러 단계의 작업을 묶은 워크플로
- 조건·반복·승인 단계 포함 가능
- AWS 제공 Document(`AWS-*`) + 사용자 정의

#### AWS 제공 Runbook 예시

| Runbook | 용도 |
|---------|------|
| `AWS-RestartEC2Instance` | EC2 재시작 |
| `AWS-StopEC2Instance` | EC2 중지 |
| `AWS-PatchInstanceWithRollback` | 패치 + 실패 시 롤백 |
| `AWS-UpdateAmiHybridManaged` | AMI 업데이트 |
| `AWS-DisableS3BucketPublicReadWrite` | S3 public 차단 |
| `AWS-CreateImage` | AMI 생성 |
| `AWSConfigRemediation-*` | Config Auto Remediation 표준 |

#### 사용자 정의 Runbook 구조 (YAML)
```yaml
schemaVersion: '0.3'
description: Backup EBS, patch instance, restart
assumeRole: '{{ AutomationAssumeRole }}'
parameters:
  InstanceId:
    type: String
  AutomationAssumeRole:
    type: String
mainSteps:
  - name: createSnapshot
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateSnapshot
      VolumeId: '{{ getVolumeId.VolumeId }}'
  - name: patchInstance
    action: aws:runCommand
    inputs:
      DocumentName: AWS-RunPatchBaseline
      InstanceIds: ['{{ InstanceId }}']
      Parameters:
        Operation: Install
  - name: healthCheck
    action: aws:assertAwsResourceProperty
    inputs:
      Service: ec2
      Api: DescribeInstanceStatus
      InstanceIds: ['{{ InstanceId }}']
      PropertySelector: 'InstanceStatuses[0].InstanceStatus.Status'
      DesiredValues: ['ok']
```

#### 자동 트리거 패턴
1. **EventBridge → Automation**: CloudTrail 이벤트로 자동 실행
2. **Config Auto Remediation**: 비준수 발견 시 실행
3. **CloudWatch Alarm**: Alarm 액션으로 SSM Document
4. **수동**: 콘솔/CLI

#### Change Manager 연동
- 변경 작업에 **승인 워크플로** 추가
- 운영자 → Change Request → 승인자 → 실행

### 4. AppConfig

#### 개념
- 애플리케이션 설정의 **안전한 동적 배포**
- 점진적 롤아웃 + 자동 롤백
- Feature Flag 관리

#### 사용 흐름
1. Application + Environment + Configuration Profile 생성
2. 새 설정 버전 등록 (S3, Parameter Store, Hosted)
3. Deployment Strategy 선택 (Canary, Linear, AllAtOnce)
4. Validator로 자동 검증
5. Alarm 발생 시 자동 롤백

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Parameter Store 버전 관리** | 모든 변경 이력 자동 보존 | 롤백 가능 |
| **Cross-Account Parameter** | 다른 계정에 공유 (Advanced + Resource Policy) | 멀티 계정 |
| **Session Manager Run As** | 특정 OS 사용자로 세션 | 권한 분리 |
| **Automation Approval Step** | 워크플로 중간 승인 | Change Manager |
| **Automation Loop** | foreach/while 반복 | 대량 작업 |

> ⚠️ **함정 1**: Parameter Store는 자동 회전 X. DB 자격증명은 Secrets Manager 권장.
>
> ⚠️ **함정 2**: Session Manager의 idle timeout 기본은 무한 (`-1`)이 아님 — 권장 20분.
>
> 💡 **암기 팁**: Parameter Store(설정) ↔ Secrets Manager(자동회전 시크릿) ↔ AppConfig(동적 배포). 세 도구의 역할 분담.

### 관련 서비스 Cross-Reference

- **Parameter Store → Week 9 Secrets Manager** (비교)
- **Session Manager → Week 1 Day 2** (IAM 정책으로 접근 제어)
- **Automation → Week 4 Day 3** (Config Auto Remediation)
- **AppConfig → Week 6** (CloudFormation과 함께)

---

## 🏗️ 아키텍처 다이어그램

```
SSM 자동화의 3대 무기
==========================================================

   [Parameter Store]
   ────────────────
   /myapp/prod/db/host
   /myapp/prod/db/password (SecureString)
   /cloudwatch/agent/config
        │
        ▼ (CFn, Lambda, EC2 User Data 등에서 참조)

   [Session Manager]
   ─────────────────
   IAM 사용자 → aws ssm start-session --target i-xyz
        ↓ (SSH/RDP 키, Bastion 불필요)
   EC2 인스턴스 (포트 22 닫혀 있어도 OK)
        ↓
   세션 로그 → S3 / CloudWatch Logs (감사)

   [Automation Runbook]
   ────────────────────
   Step 1: Snapshot 생성
   Step 2: ELB deregister
   Step 3: Patch 적용
   Step 4: 헬스체크
   Step 5: ELB register
        ↓ (조건 분기, 실패 롤백)
   여러 인스턴스에 안전한 multi-step 자동화
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Parameter Store SecureString = KMS 암호화** — DB 자격증명도 가능 (단, 자동 회전 X)
2. ⭐ **Session Manager로 SSH/RDP 키 없이 접속** — 포트 22 닫아도 됨, 모든 세션 자동 감사
3. ⭐ **Automation Runbook = SSM Document Type "Automation"** — 멀티 스텝 워크플로
4. ⭐ **EventBridge → Automation으로 자동 복구** — CloudTrail 이벤트로 트리거
5. ⭐ **Parameter Store Advanced** = 8KB 값, Policy(만료/알림), 시간당 $0.05/파라미터

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Parameter Store 사용
aws ssm put-parameter \
  --name "/myapp/prod/db/connection-string" \
  --value "postgres://user:pass@db.local:5432/myapp" \
  --type SecureString \
  --key-id alias/myapp-key \
  --tier Advanced \
  --policies '[{"Type":"Expiration","Version":"1.0","Attributes":{"Timestamp":"2027-01-01T00:00:00Z"}},{"Type":"NoChangeNotification","Version":"1.0","Attributes":{"After":"90","Unit":"days"}}]'

# 2. 계층적 일괄 조회
aws ssm get-parameters-by-path \
  --path "/myapp/prod/" \
  --recursive \
  --with-decryption \
  --query 'Parameters[*].[Name,Value]'

# 3. Session Manager 접속
aws ssm start-session --target i-0123456789abcdef0

# 4. Session Preferences 설정 (계정 단위)
aws ssm update-document \
  --name "SSM-SessionManagerRunShell" \
  --content '{
    "schemaVersion":"1.0",
    "description":"Default SSM session preferences",
    "sessionType":"Standard_Stream",
    "inputs":{
      "s3BucketName":"session-logs-bucket",
      "s3EncryptionEnabled":true,
      "cloudWatchLogGroupName":"/ssm/sessions",
      "cloudWatchEncryptionEnabled":true,
      "kmsKeyId":"alias/ssm-sessions",
      "idleSessionTimeout":"20",
      "maxSessionDuration":"120",
      "runAsEnabled":true,
      "runAsDefaultUser":"ssm-user"
    }
  }' \
  --document-version '$LATEST'

# 5. Automation 실행 (S3 Public 차단)
aws ssm start-automation-execution \
  --document-name "AWS-DisableS3BucketPublicReadWrite" \
  --parameters "S3BucketName=my-leaked-bucket,AutomationAssumeRole=arn:aws:iam::123:role/AutomationRole"

# 6. Custom Automation Runbook 등록
aws ssm create-document \
  --name "MyApp-SafePatchSequence" \
  --document-type Automation \
  --document-format YAML \
  --content file://safe-patch-runbook.yaml

# 7. Change Manager 변경 요청
aws ssm start-change-request-execution \
  --change-request-name "patch-prod-2026-05-22" \
  --document-name "MyApp-SafePatchSequence" \
  --parameters '{"InstanceId":["i-abc"]}' \
  --scheduled-time "2026-05-25T02:00:00Z" \
  --runbooks '[{"DocumentName":"MyApp-SafePatchSequence","DocumentVersion":"$LATEST"}]'
```

---

## 📝 연습 문제

**문제 1.** Lambda 함수가 DB 자격증명을 안전하게 사용하려 한다. 자동 회전이 필요하다면?

A) Parameter Store SecureString
B) Secrets Manager — RDS 자동 회전 통합
C) S3에 암호화
D) DynamoDB

**정답: B**
해설: Parameter Store는 자동 회전 X. 자동 회전 필요한 DB 자격증명은 Secrets Manager. 단순 설정·정적 비밀번호는 Parameter Store로 충분(비용 절약).

---

**문제 2.** 보안팀이 EC2 SSH 키 분배 부담을 없애고 모든 접속을 감사하고 싶다. 가장 적합한 도구는?

A) Bastion Host + SSH 키
B) Session Manager - IAM 기반 + 자동 감사(S3/CW Logs) + 포트 22 불필요
C) VPN
D) Direct Connect

**정답: B**
해설: Session Manager는 SSH 키·Bastion 없이 IAM 권한으로 접속. 세션 로깅 자동. 인바운드 22 포트 닫아도 됨. 운영 보안 모범 사례.

---

**문제 3.** Config Rule이 S3 public 발견 시 자동 차단하려 한다. 어떤 도구?

A) Lambda
B) Automation Runbook (AWS-DisableS3BucketPublicReadWrite) - Config Auto Remediation의 표적
C) Run Command
D) Maintenance Window

**정답: B**
해설: Config Auto Remediation의 표적은 Automation Runbook. AWS 제공 표준 Runbook이 다수. IAM Role에 리소스 수정 권한 필요.

---

**문제 4.** Parameter Store 파라미터의 자동 만료를 설정하려면?

A) 불가능
B) Advanced Tier + Expiration Policy
C) Lambda 주기 삭제
D) S3 라이프사이클

**정답: B**
해설: Parameter Policy(만료/알림)는 Advanced Tier 전용. 시간당 $0.05/파라미터 추가 비용. Expiration·ExpirationNotification·NoChangeNotification.

---

**문제 5.** 운영자가 Automation Runbook에 "운영자 승인" 단계를 추가하고 싶다. 어떻게?

A) Lambda
B) `aws:approve` action 단계 추가 (또는 Change Manager 사용)
C) SNS만
D) 불가능

**정답: B**
해설: Automation에 `aws:approve` 단계로 승인자 명시 + Notification(SNS)으로 통지 → 콘솔에서 승인 후 다음 단계 진행. Change Manager가 더 정교한 승인 워크플로 제공.

---

## 📌 오늘의 요약

1. Parameter Store: 설정·시크릿 중앙화. SecureString은 KMS 암호화. 자동 회전 X (그건 Secrets Manager)
2. Session Manager: SSH/RDP 키 없이 IAM 기반 접속. 포트 22 닫아도 OK. 자동 감사
3. Automation Runbook: 멀티 스텝 워크플로. AWS 제공 + Custom. EventBridge·Config Auto Remediation 표적
4. AppConfig: 애플리케이션 설정 동적 배포 + Feature Flag. 점진적 롤아웃 + 자동 롤백
5. Change Manager: Automation에 승인 워크플로 추가. 운영 거버넌스
