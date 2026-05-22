# Day 2 - Security Hub - Findings 집계, 자동 수정

📅 날짜: Week 14 (Day 2)
🎯 주제: 보안 상태의 단일 진실 출처 + 자동 수정
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Security Hub의 ASFF + 표준 (CIS, PCI, AWS Foundational)
- 멀티 계정 집계 (Organizations)
- Custom Actions로 EventBridge → Lambda 자동 수정
- Insights, Suppression

---

## 🧩 사전 지식 (CS 기초)

- **SIEM**: Security Information & Event Management. 통합 보안 운영.
- **Compliance Standard**: CIS, PCI DSS, NIST 등.
- **Severity Normalization**: 여러 소스의 심각도를 표준화.

---

## 📖 이론 내용

### 1. Security Hub의 위치

```
GuardDuty / Inspector / Macie / IAM Access Analyzer / Config / Firewall Manager / Health
                ↓ (자동 ASFF 전송)
         Security Hub (Findings 통합)
                ↓ EventBridge / Custom Actions
         Lambda / SSM Automation / SOC 도구
```

### 2. ASFF (AWS Security Finding Format)

표준 JSON 스키마:
```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "...",
  "ProductArn": "arn:aws:securityhub:...:product/aws/guardduty",
  "GeneratorId": "guardduty/finding-id",
  "AwsAccountId": "111",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:EC2-SSHBruteForce"],
  "Severity": {"Label":"HIGH","Normalized":70},
  "Resources": [...],
  "Compliance": {"Status":"FAILED"},
  ...
}
```

### 3. 보안 표준 (Security Standards)

활성화 가능한 사전 정의 컨트롤:
- **AWS Foundational Security Best Practices (FSBP)**
- **CIS AWS Foundations Benchmark**
- **PCI DSS**
- **NIST 800-53**

각 컨트롤마다 PASS/FAIL/NOT_AVAILABLE 평가.

### 4. 자동 수정 (Auto-Remediation)

**Custom Action 패턴:**
```bash
aws securityhub create-action-target \
  --name "Quarantine EC2" \
  --description "Move EC2 to quarantine SG" \
  --id quarantine-ec2

# EventBridge Rule
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "resources": ["arn:aws:securityhub:...:action/custom/quarantine-ec2"]
}
```

운영자가 콘솔에서 Finding 선택 → Custom Action → EventBridge → Lambda.

**자동 (스케일):**
```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": {"Label": ["CRITICAL", "HIGH"]},
      "Compliance": {"Status": ["FAILED"]},
      "GeneratorId": [{"prefix": "aws-foundational-security-best-practices/v/1.0.0/S3"}]
    }
  }
}
```

→ Lambda가 S3 정책 자동 수정.

### 5. Multi-Account (Organizations)

- Delegated Administrator (보통 Audit 계정)
- 모든 멤버 Finding이 중앙 집계
- 표준 자동 활성
- 통합 대시보드

### 6. Insights

```bash
aws securityhub create-insight --name "Critical S3 Findings" \
  --filters '{"ResourceType":[{"Value":"AwsS3Bucket","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"CRITICAL","Comparison":"EQUALS"}]}' \
  --group-by-attribute ResourceId
```

저장된 Finding 쿼리 — 자주 보는 패턴.

### 7. Finding Suppression

운영자가 의도된 Risk를 "WORKFLOWS=SUPPRESSED"로 표시 → 대시보드에서 제외.

---

## 🧠 알아두면 좋은 심화 이론

### Automation Rules (2023+)

Security Hub 자체 자동화:
```bash
aws securityhub create-automation-rule \
  --rule-name "Auto-suppress dev Findings" \
  --criteria '{"AwsAccountId":[{"Value":"DEV-ACCT","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"LOW","Comparison":"EQUALS"}]}' \
  --actions '[{"Type":"FINDING_FIELDS_UPDATE","FindingFieldsUpdate":{"Workflow":{"Status":"SUPPRESSED"}}}]'
```

Lambda 없이 규칙 기반 라벨링/억제.

### Cross-Region 집계

- Security Hub는 region별 — 통합 위해 region간 aggregation 활성
- Linked Region: aggregator region에 모든 region Finding 통합

### Trusted Advisor와 차이

- Trusted Advisor: AWS 자체 권고 (비용/성능/보안/내결함성/한도)
- Security Hub: 보안 finding 통합 + 자동화
- Trusted Advisor 일부 결과도 Security Hub로 전송 가능

### 관련 서비스 Cross-Reference

- **GuardDuty** → Week 14 Day 1
- **Inspector** → Week 14 Day 4
- **Config** → Week 14 Day 3
- **EventBridge** → Week 12 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
Security Hub Hub
==================================================

  Sources (auto-integrated)
   ├─ GuardDuty / Inspector / Macie
   ├─ IAM Access Analyzer
   ├─ Config (Conformance Pack)
   ├─ Firewall Manager / Health
   └─ Partner (PagerDuty/Splunk/Datadog/Snyk)
        │ all in ASFF
        ▼
  Security Hub (regional, with aggregator)
   ├─ Standards: FSBP / CIS / PCI / NIST
   ├─ Insights / Custom Actions / Automation Rules
   └─ Multi-account via Delegated Admin

         ▼
  EventBridge Rule
         ▼
  Auto-Remediation
   ├─ Lambda → IAM / S3 / SG fix
   ├─ SSM Automation Runbook
   └─ Slack / Jira / SOC SOAR
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ 모든 Finding을 ASFF로 표준화 + dedup + 우선순위화
2. ⭐ 보안 표준 4종 (FSBP/CIS/PCI/NIST)
3. ⭐ Custom Action(수동) vs Automation Rule(2023+, 자동)
4. ⭐ Delegated Administrator + region aggregator로 멀티 계정/리전 통합
5. ⭐ 자동 수정 = EventBridge → Lambda/SSM Automation

---

## 💻 실제 예시

```bash
# Standards 활성
aws securityhub batch-enable-standards \
  --standards-subscription-requests StandardsArn=arn:aws:securityhub:::ruleset/finding-format/aws-foundational-security-best-practices/v/1.0.0

# Delegated Admin
aws securityhub enable-organization-admin-account --admin-account-id AUDIT-ACCT

# Automation Rule
aws securityhub create-automation-rule \
  --rule-name "Suppress dev low" \
  --criteria '{"AwsAccountId":[{"Value":"DEV","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"LOW","Comparison":"EQUALS"}]}' \
  --actions '[{"Type":"FINDING_FIELDS_UPDATE","FindingFieldsUpdate":{"Workflow":{"Status":"SUPPRESSED"}}}]'

# EventBridge → Lambda 자동 수정 (S3 public 차단)
aws events put-rule --name SecHubS3Public \
  --event-pattern '{"source":["aws.securityhub"],"detail-type":["Security Hub Findings - Imported"],"detail":{"findings":{"Compliance":{"Status":["FAILED"]},"GeneratorId":[{"prefix":"aws-foundational-security-best-practices/v/1.0.0/S3.1"}]}}}'
```

---

## 📝 연습 문제

**1.** 모든 보안 Finding 표준 형식?  A) ASFF (AWS Security Finding Format)  **정답: A**

**2.** 사전 정의 보안 표준이 아닌 것은?  A) FSBP B) CIS C) PCI D) ISO 9001  **정답: D**

**3.** 멀티 계정 Security Hub?  A) Delegated Admin + Auto-enable  **정답: A**

**4.** 사람 없는 자동 라벨링/억제?  A) Automation Rule (2023+)  **정답: A**

**5.** EventBridge로 자동 수정 표준?  A) Security Hub Findings - Imported 이벤트 + Lambda/SSM Automation  **정답: A**

**6.** Custom Action 용도?  A) 운영자 콘솔에서 Finding 선택 → 수동 트리거  **정답: A**

**7.** 멀티 리전 집계?  A) Region Aggregator 설정 (Linked Regions)  **정답: A**

---

## 📌 오늘의 요약

1. Security Hub = ASFF 통합 + 보안 표준 + 자동화 허브
2. Standards 4종 (FSBP/CIS/PCI/NIST)
3. Custom Action(수동) + Automation Rule(자동)
4. Delegated Admin + Region Aggregator 멀티 계정/리전
5. EventBridge → Lambda/SSM 자동 수정
