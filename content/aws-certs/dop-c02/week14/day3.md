# Day 3 - AWS Config - Rules, Conformance Pack, Remediation

📅 날짜: Week 14 (Day 3)
🎯 주제: 리소스 컴플라이언스 평가 + 자동 수정
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Config Rule 종류 (Managed, Custom Lambda, Custom Policy)
- Conformance Pack으로 묶음 배포
- Auto-Remediation (SSM Automation Document)
- Aggregator로 멀티 계정/리전 집계

---

## 🧩 사전 지식 (CS 기초)

- **Configuration Item**: 리소스의 시점 상태 스냅샷.
- **Compliance**: 정책 일치 여부.
- **Drift**: 실제 상태와 정책의 차이.

---

## 📖 이론 내용

### 1. Config 동작

- 모든 리소스 변경을 자동 기록 (Configuration History)
- S3 + SNS에 변경 알림
- Rules로 정책 평가
- Non-Compliant 발견 시 Remediation 자동 실행

### 2. Rule 종류

| 종류 | 정의 |
|------|------|
| **AWS Managed** | AWS 제공 (수백 개) |
| **Custom Lambda** | Lambda 함수로 평가 로직 |
| **Custom Policy** | Guard DSL로 정책 표현 |

대표 Managed Rules:
- `s3-bucket-public-read-prohibited`
- `s3-bucket-public-write-prohibited`
- `encrypted-volumes`
- `iam-password-policy`
- `restricted-ssh`
- `root-account-mfa-enabled`

### 3. Conformance Pack

여러 Rule을 묶어 배포:
- 사전 정의 (PCI DSS, NIST 800-53, FedRAMP, HIPAA, AWS Well-Architected 등)
- 사용자 정의 YAML

```yaml
Resources:
  S3PublicProhibitedRead:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-public-read
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      Scope:
        ComplianceResourceTypes: [AWS::S3::Bucket]
```

```bash
aws configservice put-conformance-pack --conformance-pack-name security-baseline \
  --template-s3-uri s3://conformance-packs/security-baseline.yaml
```

OU 전체에 StackSets처럼 배포 가능.

### 4. Auto-Remediation

Rule의 Remediation 액션 등록 (SSM Automation Document 호출):
```bash
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName":"s3-bucket-public-read-prohibited",
    "TargetType":"SSM_DOCUMENT",
    "TargetId":"AWS-DisableS3BucketPublicReadWrite",
    "Parameters":{
      "AutomationAssumeRole":{"StaticValue":{"Values":["arn:aws:iam::...:role/RemediationRole"]}},
      "S3BucketName":{"ResourceValue":{"Value":"RESOURCE_ID"}}
    },
    "Automatic":true,
    "MaximumAutomaticAttempts":5,
    "RetryAttemptSeconds":60
  }]'
```

`Automatic: true` — Non-Compliant 발견 즉시 수정.

### 5. Aggregator (멀티 계정/리전)

```bash
aws configservice put-configuration-aggregator --configuration-aggregator-name org-aggregator \
  --organization-aggregation-source RoleArn=arn:aws:iam::...:role/AWSConfigOrgRole,AllAwsRegions=true
```

Audit 계정에서 모든 멤버 계정의 Compliance 통합 조회.

### 6. Advanced Queries

CloudWatch Logs Insights 같은 SQL DSL:
```sql
SELECT
  configuration.targetResource.resourceType,
  COUNT(*) as count
WHERE configuration.complianceType = 'NON_COMPLIANT'
GROUP BY configuration.targetResource.resourceType
```

Aggregator를 통한 cross-account 쿼리.

### 7. Config + EventBridge

```json
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {"newEvaluationResult": {"complianceType": ["NON_COMPLIANT"]}}
}
```

→ Lambda / SSM Automation / Slack 알림.

---

## 🧠 알아두면 좋은 심화 이론

### Custom Policy Rule (Guard)

```
rule s3_bucket_must_be_encrypted {
  Resources.*[ Type == "AWS::S3::Bucket" ] {
    Properties.BucketEncryption EXISTS
  }
}
```

Lambda 없이 DSL로 정책 표현.

### Cost 통제

- Config는 리소스 변경당 과금
- 모든 리소스 기록 vs 선택적 기록 (`recordingMode`)
- 자주 변경되는 리소스(예: EC2 metadata)는 비용 영향

### Config vs Security Hub Standards

- Security Hub Standards가 내부적으로 Config Rules 활용
- 단독 Config Rule도 가능 (Security Hub 비활성 시)

### Conformance Pack vs StackSets

- Conformance Pack: Config Rule 묶음 배포 + 멀티 계정 자동
- StackSets: 임의 CFN 리소스 묶음
- Conformance Pack도 내부적으로 CFN StackSets 사용

### 관련 서비스 Cross-Reference

- **Security Hub** → Week 14 Day 2
- **SSM Automation** → Week 12 Day 2
- **StackSets** → Week 8 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
Config Compliance Loop
==================================================

  Any resource change in any member account
        │
        ▼
   Config Recorder → Configuration Item (S3 + SNS)
        │
        ▼
   Rules evaluate
   ├─ Managed (e.g., s3-bucket-public-read-prohibited)
   ├─ Custom Lambda
   └─ Custom Policy (Guard DSL)
        │
        ├─ COMPLIANT → log
        └─ NON_COMPLIANT
                │
                ▼ Auto-Remediation
              SSM Automation Document
                │
                ▼ EventBridge
              Lambda / Slack / Jira

  Aggregator (Audit Account)
   └─ Cross-account/region compliance dashboard

  Conformance Pack
   └─ N rules + remediation deployed via StackSets-like flow
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Rule 3종: Managed / Custom Lambda / Custom Policy (Guard DSL)
2. ⭐ Auto-Remediation은 SSM Automation Document 호출
3. ⭐ Conformance Pack으로 PCI/NIST/HIPAA 묶음 배포
4. ⭐ Aggregator로 멀티 계정/리전 통합 조회
5. ⭐ EventBridge로 NON_COMPLIANT 자동 알림/대응

---

## 💻 실제 예시

```bash
# Config 활성화 (모든 리소스)
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::...:role/AWSConfigServiceRole,recordingGroup='{"allSupported":true,"includeGlobalResourceTypes":true}'

aws configservice start-configuration-recorder --configuration-recorder-name default

# Conformance Pack
aws configservice put-conformance-pack --conformance-pack-name pci-dss-baseline \
  --template-s3-uri s3://aws-config-conformance-packs/PCI-DSS-3.2.1.yaml

# Aggregator
aws configservice put-configuration-aggregator --configuration-aggregator-name org \
  --organization-aggregation-source RoleArn=arn:aws:iam::...:role/AWSConfigOrgRole,AllAwsRegions=true
```

---

## 📝 연습 문제

**1.** Rule 3종?  A) Managed / Custom Lambda / Custom Policy (Guard DSL)  **정답: A**

**2.** Non-Compliant 자동 수정?  A) Remediation Configuration + SSM Automation Document + Automatic=true  **정답: A**

**3.** PCI/NIST 묶음 배포?  A) Conformance Pack  **정답: A**

**4.** 멀티 계정 Compliance 단일 대시보드?  A) Aggregator + Organization source  **정답: A**

**5.** Config 변경 이벤트 라우팅?  A) EventBridge (Config Rules Compliance Change)  **정답: A**

**6.** Lambda 없이 정책 표현?  A) Custom Policy Rule (Guard DSL)  **정답: A**

**7.** 비용 통제?  A) recordingMode + 선택적 리소스 타입  **정답: A**

---

## 📌 오늘의 요약

1. Rule 3종 + 수백 Managed
2. Remediation은 SSM Automation Document
3. Conformance Pack 묶음 배포
4. Aggregator 멀티 계정/리전 통합
5. EventBridge로 자동 대응
