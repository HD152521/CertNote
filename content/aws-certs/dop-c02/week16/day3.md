# Day 3 - 도메인 5·6 복습 (인시던트 + 보안·컴플라이언스)

📅 날짜: Week 16 (Day 3)
🎯 주제: 시험 도메인 5(14%) + 6(17%) 총 31% 핵심 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 도메인 5(인시던트/이벤트 대응) 자동화 패턴 정리
- 도메인 6(보안·컴플라이언스) GuardDuty/Config/Security Hub/Audit Manager 정리
- 자동 수정(Auto-Remediation) 표준 흐름 암기

---

## 🧩 사전 지식 (CS 기초)

- **Detective Control**: 이미 일어난 일을 탐지 (CloudTrail, GuardDuty)
- **Preventive Control**: 사전 차단 (SCP, IAM, WAF)
- **Responsive Control**: 일어난 후 대응 (Lambda, SSM, EventBridge)

---

## 📖 이론 내용

### 1. 도메인 5: 인시던트 자동 대응 표준

```
원천 (CloudWatch Alarm / GuardDuty / Security Hub / Config / Health)
        │
        ▼
   EventBridge Rule (필터 패턴)
        │
        ▼
   Target (Step Functions / SSM Automation / Lambda)
        │
        ▼
   Notification (SNS / Chatbot / Incident Manager)
```

### 2. 핵심 서비스

| 서비스 | 역할 |
|--------|------|
| EventBridge | 이벤트 라우팅 (버스, Pipes, Schedule) |
| SSM Automation | 사전 정의/커스텀 Runbook |
| Step Functions | 멀티 단계 워크플로 |
| Incident Manager | Response Plan + 페이저 + Post-Incident |
| Chatbot | Slack/Teams + 제한된 CLI |
| Health Dashboard | AWS 측 이벤트 |

### 3. 도메인 6: 보안 서비스 지도

| 서비스 | 목적 |
|--------|------|
| **GuardDuty** | 위협 탐지 (CloudTrail/VPC/DNS/EKS Audit) |
| **Security Hub** | Findings 집계 + 표준(CIS/PCI/Foundational) |
| **AWS Config** | 리소스 구성 + 규칙 + 자동 수정 |
| **Audit Manager** | 컴플라이언스 증거 자동 수집 |
| **Macie** | S3 PII/민감 데이터 탐지 |
| **Inspector** | EC2/Lambda/ECR 취약점 스캔 |
| **IAM Access Analyzer** | 외부 공개 리소스 탐지 + 정책 검증 |
| **Detective** | 보안 사고 인과 분석 |
| **WAF / Shield / Firewall Manager** | L7/L3-L4 보호 |
| **KMS / CloudHSM** | 키 관리 |
| **Secrets Manager** | 자격 회전 |

### 4. Config 자동 수정 흐름

```
Config Rule (예: s3-bucket-public-read-prohibited)
        │ Non-Compliant 발견
        ▼
Remediation Action (SSM Document)
        │
        ▼
리소스 자동 수정 (예: 버킷 정책 차단)
```

- Auto-remediation 활성화 시 즉시 수정
- 수동 모드: 콘솔에서 승인 후

### 5. 멀티 계정 보안 베이스라인

- **Delegated Admin** 모델 (GuardDuty/Security Hub/Config/Macie/Inspector 모두 지원)
- Org Auto-Enable로 신규 계정 자동 적용
- Findings는 Audit Account에 집계 (Security Hub Region Aggregator)
- Log Archive Account에 CloudTrail Org Trail 집중

### 6. Audit Manager

- AWS Best Practices Framework / SOC 2 / HIPAA 등 사전 정의
- 증거(CloudTrail/Config 이벤트/Security Hub Findings)를 자동 수집
- Assessment Report PDF로 감사자 제출

### 7. Compliance 핵심 단서 매핑

| 단서 | 정답 |
|------|------|
| "PII in S3" | Macie |
| "EC2 CVE" | Inspector |
| "외부 공개 리소스" | IAM Access Analyzer |
| "감사 증거 자동 수집" | Audit Manager |
| "공격자 인과 분석" | Detective |
| "비표준 구성 자동 수정" | Config Rule + SSM Document |

---

## 🧠 자주 헷갈리는 함정

1. **Security Hub vs GuardDuty**: GuardDuty는 탐지, Security Hub는 집계+표준
2. **Config Aggregator vs Security Hub Region Aggregator**: 둘 다 모은다 — Config는 구성/규칙, SH는 Findings
3. **EventBridge Default Bus vs Custom Bus**: AWS 서비스 이벤트는 default
4. **SSM Automation의 Approval**: aws:approve 단계 — 사람 승인 후 진행
5. **Audit Manager는 Config/CloudTrail/Security Hub 활성 전제**

---

## 🏗️ 아키텍처 다이어그램

```
보안 + 인시던트 자동화 통합
==================================================

  멀티 계정 → Audit Account (Delegated Admin)
        ├─ GuardDuty
        ├─ Security Hub (Region Aggregator)
        ├─ Config Aggregator
        ├─ Macie / Inspector
        └─ Audit Manager (증거 자동 수집)

  Finding/Alarm/Health
        │
        ▼
  EventBridge Bus (Cross-Account)
        │
        ▼
  Step Functions / SSM Automation
        │
        ├─ Lambda 수정
        ├─ Config Remediation
        ├─ IAM Key 비활성화
        └─ WAF Rule 추가
        │
        ▼
  Incident Manager + Chatbot (Slack)
```

---

## ⭐ 핵심 포인트

1. ⭐ EventBridge가 모든 자동 대응의 진입점
2. ⭐ Delegated Admin + Auto-Enable로 신규 계정 자동 보안 베이스라인
3. ⭐ Config Rule + SSM Document = 자동 수정 표준
4. ⭐ Audit Manager가 컴플라이언스 증거 자동 수집
5. ⭐ Macie(S3 PII) / Inspector(EC2/Lambda CVE) / Access Analyzer(외부 공개) 단서 매핑

---

## 💻 빠른 CLI 점검

```bash
# GuardDuty Delegated Admin
aws organizations enable-aws-service-access --service-principal guardduty.amazonaws.com
aws guardduty enable-organization-admin-account --admin-account-id 222222222222

# Security Hub Region Aggregator
aws securityhub create-finding-aggregator --region-linking-mode ALL_REGIONS

# Config Auto-Remediation
aws configservice put-remediation-configurations --remediation-configurations file://remediation.json

# Audit Manager Assessment
aws auditmanager create-assessment --name SOC2 --framework-id ... --scope ...

# SSM Automation with Approval
aws ssm start-automation-execution --document-name MyRunbook --parameters file://params.json
```

---

## 📝 연습 문제 (Pro 시나리오형 6문항)

**1.** 60개 계정에 GuardDuty 자동 활성화 + 신규 계정 자동 포함?
A) StackSets만 B) **Delegated Admin + Auto-Enable**
C) Lambda 매일 활성화 D) Config Rule
**정답: B**

**2.** 모든 리전 Security Hub Findings를 단일 리전에 집계?
A) Lambda B) **Security Hub Region Aggregator**
C) EventBridge fan-in D) S3 export
**정답: B**

**3.** S3 버킷이 공개 설정되면 자동으로 차단?
A) Lambda 매일 검사 B) **AWS Config Rule + Auto-Remediation(SSM Document)**
C) S3 Lifecycle D) GuardDuty
**정답: B**

**4.** SOC 2 감사 증거를 매일 자동 수집?
A) CloudTrail Lake B) **AWS Audit Manager**
C) Config + Athena D) Macie
**정답: B**

**5.** EC2 OS/패키지 CVE 자동 스캔 + 우선순위?
A) GuardDuty B) **Amazon Inspector**
C) Macie D) Security Hub
**정답: B**

**6.** S3에 PII가 있는지 자동 탐지하고 보고?
A) Athena 정규식 B) **Amazon Macie**
C) Inspector D) GuardDuty
**정답: B**

---

## 📌 오늘의 요약

1. EventBridge가 자동 대응 표준 진입점
2. Delegated Admin이 멀티 계정 보안 표준
3. Config + SSM Document로 자동 수정
4. Audit Manager가 컴플라이언스 증거 자동화
5. Macie/Inspector/Access Analyzer 단서별 즉답
