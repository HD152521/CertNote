# Day 3 - AWS Config (Rule, Conformance Pack, Remediation)

📅 날짜: Week 4 (Day 3)
🎯 주제: 리소스 구성 추적과 자동 컴플라이언스 검증
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Config의 Configuration Item과 변경 추적 방식을 안다
- Managed/Custom Rule로 컴플라이언스 검증을 구성한다
- Conformance Pack + 자동 Remediation으로 비준수 리소스 자동 교정한다

---

## 🧩 사전 지식 (CS 기초)

- **Configuration drift**: 의도된 상태에서 시간에 따라 벗어남. IaC와 운영 도구로 막음
- **Desired state**: 시스템이 가야 할 목표 상태. Config는 desired vs actual을 비교
- **Continuous compliance**: 정기 감사가 아닌 실시간 자동 점검
- **Idempotent remediation**: 여러 번 실행해도 같은 결과. 자동 복구 핵심 원칙
- **Snapshot vs Stream**: 시점 캡처 vs 변경 이벤트 스트림. Config은 둘 다

---

## 📖 이론 내용

### 1. AWS Config의 개념

#### 무엇을 추적하나
- AWS 리소스의 **구성(configuration)**을 시간순으로 기록
- 변경 이벤트마다 새 Configuration Item(CI) 생성
- "어제는 SG에 0.0.0.0/0이 없었는데 오늘은 있다 → 누가 추가했나" 파악

#### CloudTrail vs Config (시험 빈출 비교)

| 항목 | CloudTrail | AWS Config |
|------|-----------|------------|
| 추적 대상 | API 호출 (행위) | 리소스 구성 (상태) |
| 질문 | "누가 무엇을 했나?" | "지금 어떤 상태인가? 언제 바뀌었나?" |
| 주 사용 | 감사·보안 | 컴플라이언스·인벤토리 |
| 비용 | Management 무료, Data 유료 | CI당 $0.003 + Rule 평가당 비용 |

→ 둘은 **상호 보완**. 같이 써야 완전한 감사.

### 2. Config 핵심 구성 요소

#### Configuration Item (CI)
- 특정 시점의 리소스 상태 스냅샷 (JSON)
- 리소스 변경마다 자동 생성
- S3에 영구 저장 + Config 콘솔에서 조회

#### Configuration Recorder
- 어떤 리소스 타입을 기록할지 정의
- 계정당 1개 (계정+리전 단위)
- 종류:
  - **All supported resources** (권장)
  - **Selected resource types**
  - **Global resources** (IAM 등) 포함 여부

#### Delivery Channel
- CI와 스냅샷을 S3로 전송
- 변경 알림을 SNS로 (선택)

#### Config Rule
- 리소스가 정책을 따르는지 평가
- 두 종류:
  - **Managed Rule**: AWS 사전 제공 (200+개)
  - **Custom Rule**: Lambda 함수 직접 작성

#### 평가 트리거
- **Configuration changes**: CI 생성 시 즉시 평가
- **Periodic**: 1/3/6/12/24시간 주기

### 3. 자주 쓰는 Managed Rules

| Rule | 검사 내용 |
|------|-----------|
| `s3-bucket-public-read-prohibited` | S3 버킷이 public read 아닌가 |
| `s3-bucket-public-write-prohibited` | S3 버킷이 public write 아닌가 |
| `s3-bucket-server-side-encryption-enabled` | S3 암호화 활성 |
| `restricted-ssh` | SG에 0.0.0.0/0 SSH(22) 허용 안 함 |
| `restricted-common-ports` | RDP, MySQL 등 위험 포트 공개 차단 |
| `encrypted-volumes` | EBS 볼륨 암호화 |
| `rds-storage-encrypted` | RDS 스토리지 암호화 |
| `iam-password-policy` | IAM 비밀번호 정책 |
| `root-account-mfa-enabled` | Root에 MFA |
| `cloudtrail-enabled` | CloudTrail 활성화 |
| `ec2-instance-no-public-ip` | EC2 public IP 없음 |
| `vpc-flow-logs-enabled` | VPC Flow Logs 활성 |

### 4. Conformance Pack

#### 개념
- 여러 Config Rule + Remediation을 묶은 표준 템플릿
- 산업 컴플라이언스 프레임워크별 사전 제공
- 한 번에 수십 개 Rule 일괄 배포

#### 사전 제공 Pack 예시
- **Operational Best Practices for HIPAA**
- **Operational Best Practices for PCI-DSS**
- **Operational Best Practices for AWS Well-Architected Security**
- **Operational Best Practices for NIST 800-53**
- **CIS AWS Foundations Benchmark**
- **Korean ISMS-P** (한국)

#### Organization Conformance Pack
- 조직 전체에 일괄 배포 (Organizations 통합)
- 신규 계정 자동 적용

### 5. Auto Remediation (자동 교정)

#### 개념
- Config Rule이 NON_COMPLIANT 발견 시 **SSM Automation Runbook 자동 실행**
- 사람 개입 없이 리소스를 다시 컴플라이언트 상태로

#### 예시
| 비준수 상황 | Auto Remediation |
|-------------|------------------|
| S3 버킷이 public | `AWS-DisableS3BucketPublicReadWrite` |
| SG에 0.0.0.0/0 SSH | `AWS-DisablePublicAccessForSecurityGroup` |
| EBS 미암호화 | `AWS-EnableEbsEncryptionByDefault` |
| IAM Access Key 90일+ | `AWSConfigRemediation-DisableIamAccessKey` |

#### 설정
```bash
aws configservice put-remediation-configurations \
  --remediation-configurations '[
    {
      "ConfigRuleName": "s3-bucket-public-read-prohibited",
      "TargetType": "SSM_DOCUMENT",
      "TargetId": "AWS-DisableS3BucketPublicReadWrite",
      "Parameters": {
        "AutomationAssumeRole": {"StaticValue": {"Values": ["arn:aws:iam::123:role/RemediationRole"]}},
        "S3BucketName": {"ResourceValue": {"Value": "RESOURCE_ID"}}
      },
      "Automatic": true,
      "MaximumAutomaticAttempts": 5,
      "RetryAttemptSeconds": 60
    }
  ]'
```

### 6. Multi-Account / Multi-Region Aggregator

- 한 계정 한 리전에 **모든 계정·리전의 Config 데이터 통합**
- "조직 전체에서 비준수 리소스 한눈에 보기"
- Aggregator는 보통 Audit Account에 둠

```bash
aws configservice put-configuration-aggregator \
  --configuration-aggregator-name org-aggregator \
  --organization-aggregation-source RoleArn=arn:aws:iam::123:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig,AllAwsRegions=true
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Resource Timeline** | 리소스의 시간순 변경 이력 시각화 | 사후 분석 |
| **Compliance Score** | Conformance Pack의 점수 | 거버넌스 KPI |
| **Custom Rule via Lambda** | Lambda로 임의 검증 | 회사 전용 정책 |
| **Custom Rule via Guard** | CloudFormation Guard DSL | YAML 정책 |
| **Periodic vs Change-triggered** | 1시간 주기 vs 즉시 평가 | 비용·반응 trade-off |
| **Config Rule 비용** | 평가 1000개당 $0.001 | 대규모 환경 주의 |

> ⚠️ **함정 1**: Config Recorder는 계정+리전당 1개. 비활성하면 CloudTrail보다 데이터 손실 크다.
>
> ⚠️ **함정 2**: Auto Remediation은 IAM Role 필요. Runbook이 리소스 수정 권한 있어야 동작.
>
> 💡 **암기 팁**: CloudTrail = 행위 로그, Config = 상태 스냅샷 + 검증. 둘 다 필요.

### 관련 서비스 Cross-Reference

- **Config → Week 5 SSM Automation** (Remediation Runbook)
- **Config → Week 6 CFn drift** (Stack drift는 Config로도 추적 가능)
- **Config → Week 9 Security Hub** (Config 결과가 Security Hub finding으로)
- **Config → Week 11 비용 거버넌스** (잘못 태깅된 리소스 추적)

---

## 🏗️ 아키텍처 다이어그램

```
AWS Config 컴플라이언스 자동화 흐름
==========================================================

   [리소스 변경]
       │
       ▼
   ┌────────────────┐
   │ Config         │
   │ Recorder       │  ← 모든 리소스 타입 추적
   └───┬────────────┘
       │
       ▼ Configuration Item 생성
   ┌────────────────┐
   │ Delivery Ch.   │ → S3 (영구 보관)
   └───┬────────────┘
       │                              SNS Topic
       │                              (변경 알림)
       ▼
   ┌────────────────┐
   │ Config Rules   │ ← Managed + Custom + Pack
   │  COMPLIANT? ── 평가
   └───┬────────────┘
       │ NON_COMPLIANT
       ▼
   ┌────────────────┐
   │  Auto          │
   │ Remediation    │ → SSM Automation Runbook
   └───┬────────────┘
       │ 자동 교정 후 재평가
       ▼
   ┌────────────────┐
   │ Aggregator     │ ← Audit Account에 모든 계정·리전 통합
   │ (Multi-Acct)   │
   └────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **CloudTrail = 행위, Config = 상태** — 둘 다 활성화가 표준
2. ⭐ **Managed Rule 200+개** — 직접 만들기 전에 검색
3. ⭐ **Auto Remediation = SSM Runbook 자동 실행** — IAM Role 필요
4. ⭐ **Conformance Pack로 산업 컴플라이언스 일괄 배포** — HIPAA, PCI, NIST 등
5. ⭐ **Aggregator로 멀티 계정·리전 통합 뷰** — Audit Account에 위치

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Config Recorder + Delivery Channel 설정
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::123:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig,recordingGroup='{allSupported=true,includeGlobalResourceTypes=true}'

aws configservice put-delivery-channel \
  --delivery-channel name=default,s3BucketName=my-config-bucket,configSnapshotDeliveryProperties='{deliveryFrequency=One_Hour}'

aws configservice start-configuration-recorder \
  --configuration-recorder-name default

# 2. Managed Rule 활성화
aws configservice put-config-rule \
  --config-rule '{
    "ConfigRuleName": "s3-bucket-public-read-prohibited",
    "Source": {
      "Owner": "AWS",
      "SourceIdentifier": "S3_BUCKET_PUBLIC_READ_PROHIBITED"
    }
  }'

# 3. Auto Remediation 연결
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName": "s3-bucket-public-read-prohibited",
    "TargetType": "SSM_DOCUMENT",
    "TargetId": "AWS-DisableS3BucketPublicReadWrite",
    "TargetVersion": "1",
    "Parameters": {
      "AutomationAssumeRole": {"StaticValue":{"Values":["arn:aws:iam::123:role/RemediationRole"]}},
      "S3BucketName": {"ResourceValue":{"Value":"RESOURCE_ID"}}
    },
    "Automatic": true,
    "MaximumAutomaticAttempts": 5,
    "RetryAttemptSeconds": 60
  }]'

# 4. Conformance Pack 배포 (CIS AWS Benchmark)
aws configservice put-conformance-pack \
  --conformance-pack-name CIS-AWS-Foundations \
  --template-s3-uri s3://my-conformance-templates/cis-aws-foundations.yaml \
  --delivery-s3-bucket my-config-bucket

# 5. 비준수 리소스 목록
aws configservice describe-compliance-by-config-rule \
  --compliance-types NON_COMPLIANT

aws configservice get-compliance-details-by-config-rule \
  --config-rule-name s3-bucket-public-read-prohibited \
  --compliance-types NON_COMPLIANT

# 6. 리소스 변경 이력 조회 (Resource Timeline)
aws configservice get-resource-config-history \
  --resource-type AWS::S3::Bucket \
  --resource-id my-bucket \
  --later-time 2026-05-22T00:00:00Z

# 7. Aggregator로 멀티 계정 비준수 한눈에
aws configservice describe-aggregate-compliance-by-config-rules \
  --configuration-aggregator-name org-aggregator \
  --filters ComplianceType=NON_COMPLIANT
```

---

## 📝 연습 문제

**문제 1.** 회사가 "S3 버킷이 의도치 않게 public 노출되면 자동으로 차단되게" 하려 한다. 어떤 도구 조합?

A) CloudTrail Insights
B) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation `AWS-DisableS3BucketPublicReadWrite`
C) Lambda 주기 스캔
D) GuardDuty

**정답: B**
해설: Config Rule이 비준수 감지 → SSM Automation Runbook이 자동 교정. Continuous compliance + auto remediation의 표준 패턴.

---

**문제 2.** CloudTrail과 Config의 차이는?

A) 같은 서비스
B) CloudTrail = API 호출 행위 로그, Config = 리소스 구성 상태 추적 + 컴플라이언스 평가
C) Config는 EC2만
D) CloudTrail은 무료, Config은 유료

**정답: B**
해설: 둘은 보완 관계. CloudTrail은 "누가 무엇을 했나(행위)", Config는 "지금 상태가 어떤가, 정책 준수하나(상태)". 둘 다 활성화가 표준.

---

**문제 3.** 회사가 HIPAA 컴플라이언스를 충족해야 한다. 가장 빠른 방법은?

A) 모든 Rule을 직접 작성
B) AWS Managed Conformance Pack "Operational Best Practices for HIPAA" 배포
C) 수동 점검
D) CloudFormation

**정답: B**
해설: Conformance Pack은 산업 컴플라이언스 프레임워크별 Rule 묶음. HIPAA, PCI-DSS, NIST, CIS 등 사전 제공. 한 번에 수십 개 Rule + Remediation 배포.

---

**문제 4.** Aggregator를 어느 계정에 두는 게 표준 모범 사례인가?

A) Management Account
B) Audit Account (또는 Security Account)
C) 각 계정에 따로
D) Sandbox 계정

**정답: B**
해설: Landing Zone 표준. Aggregator는 Audit Account에 두고, 다른 계정들의 Config 데이터를 통합 뷰. Management Account는 SCP 미적용 + 워크로드 분리 원칙으로 비추천.

---

**문제 5.** Auto Remediation이 동작 안 한다. 가장 흔한 원인은?

A) Config Rule 비활성
B) Remediation에 지정한 SSM Runbook의 AutomationAssumeRole이 리소스 수정 권한 없음
C) S3 버킷 권한
D) KMS

**정답: B**
해설: Auto Remediation은 SSM Runbook이 실행되며, 그 Runbook이 IAM Role의 권한으로 동작. Role에 대상 리소스 수정 권한이 없으면 실패. 흔한 운영 실수.

---

## 📌 오늘의 요약

1. AWS Config = 리소스 구성 추적 + 컴플라이언스 평가. CloudTrail과 보완 관계
2. Managed Rule 200+개 / Conformance Pack로 산업 컴플라이언스 일괄 배포
3. Auto Remediation = SSM Automation Runbook 자동 실행. IAM Role 필요
4. Aggregator로 멀티 계정·리전 통합 뷰. Audit Account에 위치
5. 평가 트리거: Configuration Change(즉시) 또는 Periodic(1~24h). 비용 vs 반응 trade-off
