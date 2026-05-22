# Day 4 - GuardDuty, Security Hub, Inspector, Macie

📅 날짜: Week 9 (Day 4)
🎯 주제: 위협 탐지·보안 통합·취약점 스캔·민감 데이터 검출
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- GuardDuty의 위협 탐지 영역과 finding 종류를 안다
- Security Hub로 보안 finding을 통합 관리한다
- Inspector로 EC2/ECR/Lambda 취약점을 스캔한다
- Macie로 S3의 민감 데이터를 식별한다

---

## 🧩 사전 지식 (CS 기초)

- **IDS / IPS**: Intrusion Detection/Prevention System
- **SIEM**: 보안 이벤트 통합 관리. Security Hub가 AWS 네이티브 SIEM 역할
- **CVE / CVSS**: 취약점 식별자 + 심각도 점수
- **PII (Personally Identifiable Information)**: 개인 식별 정보
- **Threat intelligence**: 알려진 악성 IP/도메인/패턴 DB

---

## 📖 이론 내용

### 1. Amazon GuardDuty

#### 개념
- ML + Threat Intel 기반 위협 탐지
- 데이터 소스 자동 분석 — 에이전트 불필요
- 즉시 활성화 (3개 클릭)

#### 데이터 소스
- **VPC Flow Logs**: 통신 패턴
- **CloudTrail Management Events**: API 호출
- **CloudTrail S3 Data Events**: S3 객체 접근
- **DNS Logs** (Route 53 Resolver): DNS 쿼리
- **EKS Audit Logs**: K8s API
- **Lambda Network Logs**: Lambda 트래픽
- **RDS Login Events**: DB 로그인 시도
- **EBS Volume**: 멀웨어 스캔 (별도 활성화)
- **Runtime Monitoring**: EC2/ECS/EKS 런타임 동작 (Agent 필요)

#### 자주 발생하는 Finding
- `UnauthorizedAccess:EC2/SSHBruteForce` — SSH 무차별 대입
- `Recon:EC2/PortProbeUnprotectedPort` — 포트 스캔
- `CryptoCurrency:EC2/BitcoinTool.B!DNS` — 암호화폐 채굴 도메인 통신
- `Backdoor:EC2/C&CActivity.B!DNS` — C&C 서버 통신
- `IAMUser:RootCredentialUsage` — Root 사용자 사용
- `Stealth:S3/ServerAccessLoggingDisabled` — 로그 비활성화 (회피 시도)

#### Multi-Account
- Organizations 통합 → Delegated Administrator 계정에 자동 통합
- 신규 계정 자동 활성화

#### 자동 대응 패턴
```
GuardDuty Finding
    ↓
EventBridge Rule
    ↓
Lambda / SSM Automation
    ↓
- 의심 인스턴스 격리 (SG 변경)
- IAM 키 비활성화
- SNS 알림
```

### 2. AWS Security Hub

#### 개념
- 멀티 서비스 보안 finding을 한 곳에 통합
- 보안 표준 자동 평가 (CIS, PCI-DSS, NIST 등)
- ASFF (AWS Security Finding Format)으로 표준화

#### 통합 소스
- GuardDuty
- Inspector
- Macie
- IAM Access Analyzer
- AWS Config
- Firewall Manager
- 3rd party (Palo Alto, Splunk, Trend Micro 등)

#### 보안 표준
- **AWS Foundational Security Best Practices** (FSBP)
- **CIS AWS Foundations Benchmark** v1.2/v1.4
- **PCI-DSS** v3.2.1
- **NIST 800-53** Rev 5

#### Multi-Account
- Organizations 통합 → 모든 계정 finding 통합
- Delegated Administrator (보통 Audit Account)

#### Custom Insights
- 자주 보는 finding 쿼리 저장
- "Critical 심각도 + 마지막 24시간 + Prod 계정" 등

### 3. Amazon Inspector

#### 개념
- 자동 취약점 스캔
- EC2 / ECR / Lambda 지원

#### EC2 스캔
- SSM Agent 필요 (Inventory 활용)
- CVE 데이터베이스 대조
- 네트워크 도달성 점검

#### ECR 스캔
- 이미지 푸시 시 자동 또는 주기 스캔
- CVE + 의존성 분석
- ECR Repository에 자동 통합

#### Lambda 스캔
- 함수 코드 + 레이어 의존성 취약점
- 코드 + 패키지 모두

#### 점수 체계
- CVSS Score + Inspector 가중치 = 위험 점수
- Critical / High / Medium / Low / Informational

#### Auto-Remediation
- Inspector → EventBridge → SSM Patch Manager → 패치 적용

### 4. Amazon Macie

#### 개념
- S3의 민감 데이터(PII, PHI, 신용카드) 자동 발견
- ML 기반 + 정규식 규칙

#### 탐지 항목
- 신용카드 번호 (PCI-DSS)
- 주민등록번호 (US: SSN)
- 여권 번호
- AWS Access Key (S3에 실수로 업로드)
- 이메일 / 전화번호
- 의료 정보 (HIPAA)
- 사용자 정의 패턴

#### 사용 흐름
1. Macie 활성화 (계정·리전 단위)
2. S3 자동 스캔 (전체 또는 일부 버킷)
3. Findings 생성
4. EventBridge → 알림/자동 대응

#### 비용
- 스캔 대상 데이터량 기반
- 큰 데이터셋은 비용 주의

### 5. AWS Firewall Manager

#### 개념
- Organizations 통합 방화벽 정책 중앙 관리
- WAF, Shield Advanced, Security Group, Network Firewall, Route 53 Resolver DNS Firewall

#### 사용 사례
- 모든 계정에 표준 WAF 규칙 강제
- 신규 ALB·CloudFront에 자동 WAF 적용
- 위험 SG 자동 검증·차단

### 6. AWS WAF & Shield

#### WAF
- L7 방화벽 (HTTP/HTTPS)
- ALB / CloudFront / API Gateway에 부착
- Rule Group: AWS Managed, Custom, 3rd party
- SQL Injection, XSS, Bot 방어

#### Shield
- **Shield Standard**: 무료, 자동 DDoS 방어 (L3/L4)
- **Shield Advanced**: 유료($3,000/월), 정교한 방어 + DDoS Response Team

### 7. 보안 도구 통합 운영

```
GuardDuty (위협 탐지)
   ↓
Inspector (취약점)
   ↓
Macie (민감 데이터)
   ↓
Access Analyzer (외부 노출)
   ↓
Config (구성 변경)
   ↓
─────────────────────
Security Hub (통합 finding)
   ↓
- EventBridge → 자동 대응
- 보고서 → Audit Manager
- 보안 대시보드
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Detective** | GuardDuty finding을 시각화·심층 조사 | 보안 분석 |
| **GuardDuty Lambda Protection** | Lambda 네트워크 모니터링 | 신기능 |
| **Inspector v1 vs v2** | v2가 현재 (v1 deprecated) | 시험 v2 기준 |
| **Macie 표본 검사** | 큰 버킷의 일부만 스캔 | 비용 절감 |
| **Security Hub Cross-Region Aggregation** | 멀티 리전 통합 | 멀티 리전 거버넌스 |

> ⚠️ **함정 1**: GuardDuty는 에이전트 없이 동작 (Flow Logs/CloudTrail/DNS만 분석). Runtime Monitoring은 Agent 필요 (선택).
>
> ⚠️ **함정 2**: Macie 비용은 스캔 데이터량 비례 — 큰 데이터 lake는 사전 비용 산정 필수.
>
> 💡 **암기 팁**: GuardDuty(위협) ↔ Inspector(취약점) ↔ Macie(민감 데이터) ↔ Security Hub(통합). 4종 세트.

### 관련 서비스 Cross-Reference

- **GuardDuty → Week 5 SSM Automation** (자동 격리)
- **Security Hub → Week 4 Config** (Conformance Pack 통합)
- **Inspector → Week 5 Patch Manager** (자동 패치)
- **Macie → Week 1 Day 4** (Landing Zone Security OU)

---

## 🏗️ 아키텍처 다이어그램

```
보안 도구 통합 운영
==========================================================

   [데이터 소스]
   ───────────────
   VPC Flow Logs   CloudTrail   DNS Logs   S3 Objects
       │              │            │           │
       ▼              ▼            ▼           ▼
   ┌─────────────┐ ┌─────────┐ ┌────────────┐
   │ GuardDuty   │ │Inspector│ │ Macie      │
   │ (위협)      │ │(취약점) │ │ (민감데이터) │
   └──────┬──────┘ └────┬────┘ └─────┬──────┘
          │              │             │
          └──────────────┼─────────────┘
                         ▼
              ┌──────────────────────┐
              │  Security Hub        │
              │  (통합 finding + 표준)│
              └──────────┬───────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        [EventBridge] [Dashboard] [Audit Manager]
              │
         자동 대응:
         - 의심 인스턴스 격리
         - IAM 비활성화
         - 알림
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **GuardDuty = 에이전트 없이 ML 위협 탐지** — Flow Logs/CloudTrail/DNS 분석
2. ⭐ **Inspector = EC2/ECR/Lambda 자동 취약점 스캔** — CVE 기반
3. ⭐ **Macie = S3 민감 데이터 자동 발견** — PII/신용카드/SSN 등
4. ⭐ **Security Hub = 모든 finding 통합 + 보안 표준 평가** (CIS/PCI/NIST)
5. ⭐ **자동 대응 패턴: 보안 도구 → EventBridge → Lambda/SSM Automation**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. GuardDuty 활성화 + Organizations 통합
aws guardduty create-detector \
  --enable \
  --data-sources '{
    "S3Logs":{"Enable":true},
    "Kubernetes":{"AuditLogs":{"Enable":true}},
    "MalwareProtection":{"ScanEc2InstanceWithFindings":{"EbsVolumes":true}}
  }' \
  --finding-publishing-frequency FIFTEEN_MINUTES

DETECTOR_ID=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)

# Organizations에 Delegated Admin 지정
aws guardduty enable-organization-admin-account \
  --admin-account-id 222233334444

# 2. GuardDuty Finding EventBridge 알림
aws events put-rule \
  --name "GuardDutyHighSeverity" \
  --event-pattern '{
    "source":["aws.guardduty"],
    "detail-type":["GuardDuty Finding"],
    "detail":{"severity":[7,7.1,7.2,7.3,7.4,7.5,7.6,7.7,7.8,7.9,8,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9,9.1,9.2,9.3,9.4,9.5,9.6,9.7,9.8,9.9]}
  }'

# 3. Security Hub 활성화
aws securityhub enable-security-hub \
  --enable-default-standards \
  --tags Environment=prod

# CIS Benchmark 추가
aws securityhub batch-enable-standards \
  --standards-subscription-requests 'StandardsArn=arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.4.0'

# 4. Inspector v2 활성화
aws inspector2 enable \
  --account-ids 111122223333 \
  --resource-types EC2 ECR LAMBDA

# Findings 조회
aws inspector2 list-findings \
  --filter-criteria '{"severity":[{"comparison":"EQUALS","value":"CRITICAL"}]}' \
  --max-results 20

# 5. Macie 활성화
aws macie2 enable-macie

# 모든 S3 자동 스캔
aws macie2 create-classification-job \
  --job-type ONE_TIME \
  --name "InitialScan" \
  --s3-job-definition '{
    "bucketDefinitions":[{"accountId":"123","buckets":["my-data-bucket"]}]
  }'

# 6. 자동 격리 - SSM Automation (GuardDuty + Lambda)
aws ssm start-automation-execution \
  --document-name "AWS-IsolateEC2InstanceFromGuardDutyFinding" \
  --parameters '{"InstanceId":["i-suspicious"],"IsolationSecurityGroupId":["sg-isolate"]}'

# 7. Security Hub 통합 finding 조회
aws securityhub get-findings \
  --filters '{"SeverityLabel":[{"Value":"CRITICAL","Comparison":"EQUALS"}],"WorkflowStatus":[{"Value":"NEW","Comparison":"EQUALS"}]}' \
  --max-results 50

# 8. Cross-Account Aggregation (Security Hub Delegated Admin)
aws securityhub create-finding-aggregator \
  --region-linking-mode ALL_REGIONS
```

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 비트코인 채굴 도메인과 통신한다. 자동 탐지하려면?

A) Config
B) GuardDuty - CryptoCurrency:EC2/BitcoinTool.B!DNS finding 자동 발행
C) Inspector
D) Macie

**정답: B**
해설: GuardDuty는 Threat Intel 기반으로 알려진 악성 도메인 감지. DNS Log 분석. 에이전트 없이 동작.

---

**문제 2.** S3 버킷에 신용카드 번호가 실수로 업로드됐는지 자동 탐지하려면?

A) GuardDuty
B) Macie - PII/신용카드 자동 발견
C) Inspector
D) WAF

**정답: B**
해설: Macie의 정확한 사용 사례. S3 객체를 ML + 정규식으로 스캔 → 신용카드/SSN/AWS Key 등 발견.

---

**문제 3.** EC2 인스턴스의 OS 취약점을 자동 스캔하려면?

A) GuardDuty
B) Inspector v2 - EC2/ECR/Lambda 자동 취약점 스캔
C) Macie
D) Config

**정답: B**
해설: Inspector v2가 정확한 도구. SSM Agent로 패키지 정보 수집 → CVE DB 대조 → 자동 알림. ECR 이미지·Lambda 코드도 지원.

---

**문제 4.** 회사가 GuardDuty/Inspector/Macie/Access Analyzer의 finding을 한 화면에서 보려 한다. 어떤 도구?

A) CloudWatch
B) Security Hub - 모든 보안 finding 통합 + ASFF 표준
C) Config
D) Audit Manager

**정답: B**
해설: Security Hub의 정확한 사용 사례. 4종 도구 + 3rd party finding 통합. ASFF 표준 포맷. CIS/PCI/NIST 표준 자동 평가.

---

**문제 5.** GuardDuty가 의심 인스턴스를 탐지하면 자동으로 격리 SG로 변경하려 한다. 흐름은?

A) Lambda 폴링
B) GuardDuty Finding → EventBridge Rule → SSM Automation Runbook (또는 Lambda)이 SG 변경
C) Config
D) Inspector

**정답: B**
해설: 자동 대응 표준 패턴. GuardDuty가 EventBridge로 finding 발행 → Rule 매칭 → SSM Runbook/Lambda가 격리 SG로 변경.

---

## 📌 오늘의 요약

1. GuardDuty: ML + Threat Intel 위협 탐지. 에이전트 없이 (Flow Logs/CloudTrail/DNS)
2. Inspector v2: EC2/ECR/Lambda 자동 취약점 스캔. CVE 기반
3. Macie: S3 민감 데이터(PII/신용카드/SSN) 자동 발견
4. Security Hub: 모든 보안 finding 통합 + 보안 표준 자동 평가
5. 자동 대응: 보안 도구 → EventBridge → SSM Automation/Lambda
