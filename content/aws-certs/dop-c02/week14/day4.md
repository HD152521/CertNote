# Day 4 - Audit Manager, Macie, Inspector

📅 날짜: Week 14 (Day 4)
🎯 주제: 컴플라이언스 감사 + 데이터 분류 + 취약점 스캔
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Audit Manager로 SOC2/HIPAA/PCI 자동 증거 수집
- Macie로 S3의 PII/PHI 자동 발견
- Inspector v2의 EC2/Container/Lambda 통합 스캔
- IAM Access Analyzer로 외부 접근 발견

---

## 🧩 사전 지식 (CS 기초)

- **Continuous Compliance**: 분기/연 감사 → 상시 자동.
- **Evidence**: 컴플라이언스 증거 (스크린샷, 로그, 설정).
- **Sensitive Data**: PII/PHI/PCI 카드 정보 등.
- **CVE**: Common Vulnerabilities and Exposures DB.

---

## 📖 이론 내용

### 1. AWS Audit Manager

- 사전 정의 Framework (SOC2, HIPAA, PCI DSS, GDPR, ISO 27001, ...)
- 자동 증거 수집 (CloudTrail, Config, Security Hub)
- 사용자 정의 Framework 가능
- Assessment Report 생성 (감사용)

```bash
aws auditmanager create-assessment --name PCI-2026-Q2 \
  --framework-id <framework> \
  --assessment-reports-destination ... \
  --roles ... \
  --scope '{"awsAccounts":[...]}'
```

### 2. Amazon Macie

- S3 객체의 민감 데이터 자동 탐지
- 사전 정의 식별자: Credit Card, SSN, Passport, 의료 정보
- Custom Identifier (정규식)
- Sensitive Data Discovery Job: One-time 또는 정기
- Finding → Security Hub 자동 전송

### 3. Inspector v2 (2021+)

| 대상 | 스캔 |
|------|------|
| EC2 | OS 패키지 CVE |
| ECR Container Image | OS + 언어 의존성 CVE |
| Lambda | 코드와 의존성 CVE |

지속 모니터링 + 신규 CVE 등록 시 자동 재평가. Security Hub 통합.

### 4. IAM Access Analyzer

| 기능 | 설명 |
|------|------|
| **External Access Findings** | 외부(다른 계정/공개)에 노출된 리소스 자동 발견 |
| **Unused Access Findings** | 사용되지 않은 IAM Role/Policy 발견 (2023+) |
| **Policy Validation** | IAM 정책 작성 시 자동 검증 |
| **Policy Generation** | CloudTrail로 사용 권한 자동 정책 생성 |

### 5. Firewall Manager

- 멀티 계정 WAF/Shield/Network Firewall 정책 중앙 관리
- Organizations 통합
- 신규 계정/리소스에 자동 정책 적용

### 6. CloudTrail Lake

- CloudTrail 이벤트를 SQL로 분석
- 7년 보존
- 멀티 계정/리전 통합
- Security 사고 조사에 강력

### 7. 종합 보안 자동화 스택

```
Detection
├─ GuardDuty (위협)
├─ Inspector (취약점)
├─ Macie (민감 데이터)
└─ IAM Access Analyzer (외부 노출)

Compliance
├─ Config Rules (리소스)
├─ Conformance Pack (묶음)
└─ Audit Manager (감사 증거)

Aggregation
└─ Security Hub (ASFF 통합)

Automation
├─ EventBridge → Lambda / SSM Automation
└─ Firewall Manager (WAF/Shield 정책)

Forensics
└─ CloudTrail Lake (SQL 조사)
```

---

## 🧠 알아두면 좋은 심화 이론

### Macie 비용

- 객체당 + 스토리지 단위
- Discovery Job은 비용 발생 — 정기 자동 vs 일회성 선택
- 큰 데이터 lake에선 비용 검토 필수

### Inspector vs Trivy/Snyk

- Inspector는 네이티브 + Security Hub 통합
- Trivy/Snyk는 OSS + 개발자 친화
- 둘 다 사용 가능 (서로 보완)

### Access Analyzer Policy Generation

```bash
aws accessanalyzer start-policy-generation \
  --policy-generation-details principalArn=arn:aws:iam::...:role/Analyst,cloudTrailDetails={accessRole=...,trails=[...],startTime=...}
```

CloudTrail 기록 → 실제 사용된 권한만의 정책 자동 생성. 최소 권한 운영.

### Audit Manager + 외부 도구

생성된 Assessment Report를 감사인에게 직접 제공. 매년 수동 수집 작업 제거.

### 관련 서비스 Cross-Reference

- **Security Hub** → Week 14 Day 2
- **GuardDuty** → Week 14 Day 1
- **Config** → Week 14 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
Comprehensive Security Stack
==================================================

  Detection Layer
  ┌─────────────────────────────────────┐
  │ GuardDuty / Inspector / Macie       │
  │ IAM Access Analyzer / Firewall Mgr  │
  └─────────────────────────────────────┘
              │ ASFF
              ▼
  ┌─────────────────────────────────────┐
  │ Security Hub (aggregation)          │
  └────────┬────────────────────────────┘
           │ EventBridge
           ▼
  ┌─────────────────────────────────────┐
  │ Auto-Remediation                    │
  │  Lambda / SSM Automation            │
  └─────────────────────────────────────┘

  Compliance Layer
  ┌─────────────────────────────────────┐
  │ Config Rules + Conformance Pack     │
  │ Audit Manager (evidence collection) │
  └─────────────────────────────────────┘

  Forensics
  ┌─────────────────────────────────────┐
  │ CloudTrail Lake (7y, SQL)           │
  └─────────────────────────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Audit Manager로 SOC2/HIPAA 감사 증거 자동 수집
2. ⭐ Macie는 S3 민감 데이터, Inspector는 EC2/Container/Lambda CVE
3. ⭐ Access Analyzer External(노출) + Unused(미사용) + Policy Gen
4. ⭐ Firewall Manager로 멀티 계정 WAF/Shield 중앙 관리
5. ⭐ CloudTrail Lake로 7년 보존 + SQL 조사

---

## 💻 실제 예시

```bash
# Macie
aws macie2 enable-macie
aws macie2 create-classification-job --job-type ONE_TIME \
  --name pii-scan-prod --s3-job-definition '{"bucketDefinitions":[{"accountId":"111","buckets":["prod-data"]}]}'

# Inspector
aws inspector2 enable --resource-types EC2 ECR LAMBDA

# Access Analyzer
aws accessanalyzer create-analyzer --analyzer-name org-analyzer --type ORGANIZATION

# Audit Manager
aws auditmanager create-assessment --name SOC2-2026 \
  --framework-id soc2-framework-id \
  --assessment-reports-destination destinationType=S3,destination=s3://audit-reports/ \
  --roles roleType=PROCESS_OWNER,roleArn=arn:aws:iam::...:role/AuditOwner \
  --scope '{"awsAccounts":[{"id":"PROD-ACCT"}]}'
```

---

## 📝 연습 문제

**1.** S3의 PII 자동 탐지?  A) Macie + Sensitive Data Discovery Job  **정답: A**

**2.** EC2/Container/Lambda 통합 CVE 스캔?  A) Inspector v2  **정답: A**

**3.** "외부 계정에 공유된 리소스 자동 발견"?  A) IAM Access Analyzer External Findings  **정답: A**

**4.** CloudTrail 기반 최소 권한 IAM 정책 자동 생성?  A) Access Analyzer Policy Generation  **정답: A**

**5.** SOC2 감사 증거 자동 수집?  A) Audit Manager + Framework  **정답: A**

**6.** 멀티 계정 WAF 정책 중앙 관리?  A) Firewall Manager  **정답: A**

**7.** 7년 보존 + SQL 보안 조사?  A) CloudTrail Lake  **정답: A**

---

## 📌 오늘의 요약

1. Macie(S3 민감 데이터), Inspector(EC2/Container/Lambda CVE)
2. Access Analyzer External + Unused + Policy Gen
3. Audit Manager 자동 증거 수집
4. Firewall Manager 중앙 정책
5. CloudTrail Lake 7년 + SQL 조사
