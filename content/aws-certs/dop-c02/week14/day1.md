# Day 1 - GuardDuty + 자동 격리 응답 패턴

📅 날짜: Week 14 (Day 1)
🎯 주제: AWS 네이티브 위협 탐지 + 자동 대응
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- GuardDuty 데이터 소스 (CloudTrail, VPC Flow, DNS, EKS Audit, S3, Lambda, EBS Malware)
- Finding Severity와 표준 자동 대응
- Multi-Account GuardDuty (Organizations)
- 자동 격리 패턴

---

## 🧩 사전 지식 (CS 기초)

- **IDS/IPS**: 침입 탐지 / 방지 시스템.
- **Threat Intelligence**: 알려진 악성 IP/도메인 피드.
- **Behavioral Analytics**: 정상 패턴 학습 + 비정상 탐지.
- **Indicator of Compromise (IoC)**: 침해 표지.

---

## 📖 이론 내용

### 1. GuardDuty 데이터 소스

| 소스 | 탐지 |
|------|------|
| CloudTrail | API 호출 이상 (Root 사용, 비정상 region) |
| CloudTrail S3 Data Events | S3 액세스 이상 |
| VPC Flow Logs | 네트워크 흐름 이상 (마이닝 풀, C2 통신) |
| DNS | 악성 도메인 쿼리 |
| EKS Audit Logs | K8s API 이상 |
| EBS Malware Protection | EBS 스캔 (2022+) |
| Lambda Network Activity | Lambda 비정상 통신 |
| RDS Login Activity | DB 로그인 이상 |

### 2. Finding Severity

- 1.0~3.9: Low
- 4.0~6.9: Medium
- 7.0~8.9: High
- 9.0~10: Critical

**대표 Finding 타입:**
- `UnauthorizedAccess:EC2/SSHBruteForce`
- `CryptoCurrency:EC2/BitcoinTool.B!DNS`
- `Backdoor:EC2/C&CActivity.B`
- `Recon:EC2/PortProbeUnprotectedPort`
- `Trojan:EC2/DropPoint`
- `PenTest:IAMUser/...`

### 3. 자동 격리 응답 패턴

```
GuardDuty Finding (Severity >= 7)
   │
   ▼ EventBridge Rule
   │
   ▼ SSM Automation Runbook
   ├─ Snapshot EBS (포렌식)
   ├─ Modify Instance: Security Group → sg-quarantine
   ├─ Detach IAM Role
   ├─ Tag with incident ID
   ├─ Notify Slack/PagerDuty
   └─ Create Jira ticket
```

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

### 4. Multi-Account (Organizations)

- Delegated Administrator 계정 (보통 Security OU의 Audit 계정)
- 모든 멤버 계정에 GuardDuty 자동 활성
- Finding 중앙 집계 → Security Hub
- 신규 계정 자동 enrollment

```bash
aws guardduty enable-organization-admin-account --admin-account-id AUDIT-ACCT
aws guardduty update-organization-configuration \
  --detector-id ... --auto-enable
```

### 5. GuardDuty Malware Protection

- EBS 스캔 (의심 EC2 자동 또는 on-demand)
- Lambda 통신 분석
- Container Runtime Monitoring (EKS, ECS Fargate)
- 별도 과금

### 6. Suppression Rules & Trusted IP Lists

False positive 감소:
- Suppression Rule: 특정 Finding 자동 보존만 (알림 X)
- Trusted IP List: 알려진 안전 IP는 Finding 제외
- Threat IP List: 사용자 정의 차단 IP

---

## 🧠 알아두면 좋은 심화 이론

### Finding Format → Security Hub Format

GuardDuty Finding이 자동으로 ASFF(AWS Security Finding Format)로 변환되어 Security Hub로 전송. 통합 우선순위 + dedup.

### CloudTrail Lake와 통합

GuardDuty Finding을 CloudTrail Lake에 SQL로 분석 — 장기 보존 + 사후 분석.

### Detect → Respond → Recover

- Detect: GuardDuty
- Respond: SSM Automation / Lambda
- Recover: Snapshot 복구 + 새 인스턴스

### Cost 통제

- 모든 데이터 소스 활성 시 비용 큼
- 작은 워크로드는 일부만 활성 (EBS Malware, Lambda Activity 등은 옵션)

### 관련 서비스 Cross-Reference

- **Security Hub** → Week 14 Day 2
- **Config** → Week 14 Day 3
- **EventBridge** → Week 12 Day 1
- **SSM Automation** → Week 12 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
GuardDuty Multi-Account Auto-Response
==================================================

  Organizations
   ├─ Audit Account (Delegated Admin)
   │   └─ GuardDuty central findings
   ├─ Workloads Accounts
   │   └─ GuardDuty detector (auto-enabled)
   └─ Other accounts

  Finding (severity 7+) in any account
   │ EventBridge (default + custom bus)
   │
   ▼
  Audit Account or Source Account
   ├─ Security Hub aggregates ASFF
   ├─ SSM Automation Runbook
   │   ├─ Snapshot EBS
   │   ├─ Quarantine SG
   │   ├─ Detach IAM Role
   │   └─ Notify Slack
   └─ Lambda → Jira
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ GuardDuty 데이터 소스 8종 + Severity 4단계
2. ⭐ EventBridge → SSM Automation 자동 격리 패턴
3. ⭐ Delegated Administrator + Auto-enroll로 멀티 계정
4. ⭐ Suppression / Trusted IP / Threat IP로 noise 통제
5. ⭐ Finding은 ASFF로 Security Hub에 자동 전송

---

## 💻 실제 예시

```bash
# Organizations 통합
aws organizations enable-aws-service-access --service-principal guardduty.amazonaws.com
aws guardduty enable-organization-admin-account --admin-account-id AUDIT-ACCT

# 모든 계정 auto-enroll
aws guardduty update-organization-configuration \
  --detector-id ... --auto-enable \
  --data-sources '{"S3Logs":{"AutoEnable":true},"Kubernetes":{"AuditLogs":{"AutoEnable":true}},"MalwareProtection":{"ScanEc2InstanceWithFindings":{"EbsVolumes":{"AutoEnable":true}}}}'

# EventBridge Rule
aws events put-rule --name GuardDutyCriticalEC2 \
  --event-pattern '{"source":["aws.guardduty"],"detail":{"severity":[{"numeric":[">=",7]}],"type":[{"prefix":"UnauthorizedAccess:EC2/"}]}}'

aws events put-targets --rule GuardDutyCriticalEC2 \
  --targets 'Id=1,Arn=arn:aws:ssm:...:automation-definition/AWS-IsolateEC2Instance:$DEFAULT,RoleArn=...,InputTransformer={...}'
```

---

## 📝 연습 문제

**1.** GuardDuty의 데이터 소스가 아닌 것은?  A) CloudTrail B) VPC Flow C) DNS D) S3 객체 내용 직접 검사  **정답: D**

**2.** Severity 7 이상 자동 격리 표준?  A) EventBridge → SSM Automation Runbook B) Lambda 매번  **정답: A**

**3.** 멀티 계정 GuardDuty?  A) Delegated Admin + Auto-enable B) 각 계정 수동 활성  **정답: A**

**4.** False positive 통제?  A) Suppression Rule + Trusted IP List  **정답: A**

**5.** Finding → Security Hub 통합?  A) ASFF로 자동 전송  **정답: A**

**6.** EBS Malware Protection?  A) 의심 EC2 EBS 자동 스캔 (별도 과금)  **정답: A**

**7.** GuardDuty + CloudTrail Lake?  A) Finding을 SQL로 장기 분석  **정답: A**

---

## 📌 오늘의 요약

1. GuardDuty 8 데이터 소스 + 4 Severity
2. EventBridge → SSM Automation 자동 격리
3. Delegated Admin + Auto-enable 멀티 계정
4. Suppression / Trusted / Threat List
5. Finding → ASFF → Security Hub
