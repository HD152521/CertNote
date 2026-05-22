# Day 53 - Security Hub, Detective, Audit Manager 통합

📅 Week 11 (Day 3)
🎯 주제: 보안 운영 통합 플랫폼
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Security Hub의 통합·표준화 기능을 안다
- Detective·Audit Manager의 차별점
- Config·CloudTrail과의 관계

---

## 🧩 사전 지식 (CS 기초)

- **ASFF**: AWS Security Finding Format — 표준화 스키마
- **PCI DSS·HIPAA·NIST**: 컴플라이언스 표준
- **SIEM**: Security Information & Event Management

---

## 📖 이론 내용

### 1. Security Hub

- **CSPM (Cloud Security Posture Management)** — 보안 자세 평가
- **표준 자동 점검**: AWS Foundational Best Practices·CIS·PCI DSS·NIST 800-53
- **Finding 통합**: GuardDuty·Inspector·Macie·IAM Access Analyzer·Firewall Manager + 파트너
- **ASFF 표준화** → SIEM으로 보내기 용이
- **Org 통합**: 위임 관리자에서 일괄 활성

### 2. Detective

- **그래프 분석** — 보안 사건 root cause
- **자동 데이터**: VPC FL·CloudTrail·GuardDuty Finding·EKS Audit
- **시간축 기반** 행동 시각화
- **30일 무료 평가**

### 3. Audit Manager

- **컴플라이언스 자동 증거 수집**
- **프레임워크**: PCI DSS·HIPAA·SOC 2·GDPR·NIST 등
- **CloudTrail·Config·Security Hub** 데이터를 증거로 수집
- 감사자 제출용 보고서 생성

### 4. 비교

| 항목 | Security Hub | Detective | Audit Manager |
|------|--------------|-----------|---------------|
| 목적 | 보안 자세·통합 | 사건 조사 | 컴플라이언스 증거 |
| 데이터 | Finding 집계 | 그래프 데이터 | 다중 소스 증거 |
| 출력 | 점수·콘솔 | 시각화 | 감사 보고서 |
| 사용자 | SecOps | SecOps 조사자 | Auditor·Compliance |

### 5. Config의 위치

- **Config Rule** = 리소스 컴플라이언스 평가
- Security Hub의 자동 점검 다수가 Config Rule 기반
- Audit Manager 증거 수집 소스

### 6. CloudTrail Lake

- CloudTrail 이벤트를 **SQL 쿼리** 가능한 데이터 저장소
- 사건 조사·감사용
- Detective와 보완 (Lake = 쿼리, Detective = 시각화)

---

## 🧠 심화 이론

### 함정 매핑

| 시나리오 | 답 |
|----------|-----|
| "모든 계정 보안 결과 + CIS·PCI 점검" | Security Hub |
| "특정 IAM 사용자 활동 시계열로 시각화" | Detective |
| "PCI DSS 감사 보고서 자동 생성" | Audit Manager |
| "리소스 비준수 자동 평가" | Config Rule |
| "CloudTrail 이벤트 SQL 쿼리" | CloudTrail Lake |

### 트레이드오프

- Security Hub만으로는 사건 분석 한계 → Detective 보완
- Audit Manager 보고서는 Config·CloudTrail 데이터 정확해야 의미

---

## 🏗️ 아키텍처 — 통합 SOC

```
[GuardDuty]      [Inspector]      [Macie]
     │               │               │
     └───────────────┴───────────────┘
                     │
                     ▼
            [Security Hub (ASFF)]
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  [Detective]   [EventBridge]  [Audit Manager]
   (조사)         (자동 대응)     (감사 보고서)
                     │
                  [Lambda·SNS·Slack]
```

---

## ⭐ 핵심 포인트

1. ⭐ Security Hub = 통합 + CSPM 점검(CIS·PCI·NIST)
2. ⭐ Detective = 그래프 기반 사건 조사
3. ⭐ Audit Manager = 컴플라이언스 자동 증거
4. ⭐ Config Rule이 자동 평가의 근간
5. ⭐ CloudTrail Lake = 이벤트 SQL 쿼리

---

## 💻 CLI 예시

```bash
# Security Hub 활성화 + 표준
aws securityhub enable-security-hub
aws securityhub batch-enable-standards \
  --standards-subscription-requests \
  StandardsArn=arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0
```

---

## 📝 연습 문제

**문제 1.** 멀티 계정 CIS·PCI 표준 자동 점검 + 통합 대시보드.

A) Trusted Advisor
B) Security Hub
C) Audit Manager
D) Detective

**정답: B**

---

**문제 2.** 의심 IAM 사용자 활동 — 시계열 그래프로 사건 추적.

A) CloudTrail 콘솔
B) Detective
C) X-Ray
D) Macie

**정답: B**

---

**문제 3.** HIPAA 감사 — 증거 자동 수집·보고서 생성.

A) Security Hub
B) Audit Manager
C) Config
D) Inspector

**정답: B**

---

**문제 4.** S3 버킷 퍼블릭 차단 활성화 여부 평가.

A) Inspector
B) Config Rule (s3-bucket-public-read-prohibited)
C) Macie
D) Trusted Advisor

**정답: B**

---

**문제 5.** CloudTrail 이벤트 SQL로 조회.

A) Athena over S3
B) CloudTrail Lake
C) CloudWatch Logs Insights
D) Detective

**정답: B** — Lake가 가장 직접적

---

**문제 6.** Security Hub Finding을 외부 SIEM으로 보내기.

A) S3 Export 후 ETL
B) EventBridge Rule → Kinesis/Lambda → SIEM
C) Config Snapshot
D) CloudWatch Metric

**정답: B**

---

## 📌 오늘의 요약

1. Security Hub = 통합·표준 점검·ASFF
2. Detective = 그래프 사건 조사
3. Audit Manager = 컴플라이언스 자동 증거
4. Config Rule = 평가 근간
5. CloudTrail Lake = 이벤트 SQL
