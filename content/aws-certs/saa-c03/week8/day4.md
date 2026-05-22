# Day 39 - WAF, Shield, GuardDuty, Inspector, Macie

📅 날짜: Week 8 (Day 4)
🎯 주제: 보안 탐지·방어 서비스
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- WAF / Shield Standard·Advanced를 구분한다
- GuardDuty / Inspector / Macie / Detective의 역할을 안다
- Security Hub로 통합 관제 패턴을 안다

---

## 🧩 사전 지식 (CS 기초)

- **WAF(Web Application Firewall) vs 일반 방화벽**: WAF는 L7. SQL 주입·XSS·봇 차단.
- **DDoS**: 분산 서비스 거부. 네트워크/L7.
- **취약점 스캔 vs 위협 탐지**: 정적 분석 vs 행동 분석.

---

## 📖 이론 내용

### 1. AWS WAF

- **L7** (HTTP/HTTPS).
- 통합: **CloudFront / ALB / API Gateway / AppSync / Cognito**.
- **Web ACL** → Rules → Statements.
- **Managed Rules** (AWS / Marketplace) + 커스텀.
- **Rate-based Rule** (IP당 5분 ↑).
- **Bot Control / Account Takeover Prevention** 추가 기능.

### 2. AWS Shield

| 단계 | 보호 | 비용 |
|------|------|-----|
| **Standard** | L3/L4 DDoS 기본 (CloudFront/Route53/ALB) | 무료 |
| **Advanced** | 더 큰 공격, 대응 팀, 비용 보호, 24/7 SRT | 월 ~$3,000 |

### 3. GuardDuty

- **위협 탐지** (CloudTrail / VPC Flow Logs / DNS Logs / EKS Audit / S3 / Malware Scan 분석).
- ML 기반 이상 탐지.
- EventBridge로 자동 대응.
- 멀티 계정 Org 단위 가능.

### 4. Inspector

- **취약점 스캔**. EC2 / Lambda / ECR 이미지.
- **CVE / 패키지 취약점 + 네트워크 경로 노출**.
- 자동 지속 스캔.

### 5. Macie

- **S3 PII 탐지** (개인정보, 카드 번호 등).
- 분류 ML.
- 멀티 계정 가능.

### 6. Detective

- 보안 사고 **근본 원인 분석** (그래프).
- GuardDuty / VPC Flow / CloudTrail 통합 시각화.

### 7. Security Hub

- AWS 보안 서비스 + 3rd party 결과 통합.
- **CIS / PCI DSS / AWS Foundational Best Practices** 스코어카드.
- 다중 계정 + Organizations 통합.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **WAF + CloudFront vs ALB** | 글로벌 vs 리전 | 글로벌 보호 |
| **Shield Advanced + WAF** | 비용 보호 무료 | 결합 권장 |
| **Firewall Manager** | 조직 단위 WAF/Shield/SG 일괄 | 멀티 계정 |
| **Network Firewall** | L3-L7 IPS/IDS (VPC) | 깊은 검사 |
| **GuardDuty Findings → EventBridge → Lambda** | 자동 대응 | 표준 패턴 |

> ⚠️ **함정**: "S3에 들어있는 신용카드/주민번호 자동 탐지" → **Macie**.

> 💡 **암기 팁**: 차단 = WAF·Shield / 탐지 = GuardDuty·Inspector·Macie / 통합 = Security Hub·Detective.

### 관련 서비스 Cross-Reference

- CloudFront / ALB → Week 3/4
- Organizations → Week 1
- CloudTrail / Config → Week 9

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 웹 보안 ]

  Internet
     │ DDoS L3/L4
   Shield (Standard 무료)
     │
   CloudFront ─ WAF (Bot/SQLi/Rate)
     │
   ALB ─ WAF
     │
   ECS / EC2

[ 멀티 계정 보안 관제 ]

  GuardDuty/Inspector/Macie/Config → Security Hub (조직 통합)
       │
       └─ EventBridge → SNS / Lambda 자동 대응 → Detective 분석
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **WAF는 L7 / Shield는 L3-L4 DDoS**.
2. ⭐ Shield Standard 무료, Advanced는 SLA + 비용 보호.
3. ⭐ **위협 탐지 = GuardDuty / 취약점 = Inspector / PII = Macie**.
4. ⭐ Security Hub로 다중 계정 통합 점수.
5. ⭐ Firewall Manager로 조직 가드레일.

---

## 💻 실제 예시 - AWS CLI

```bash
# WAFv2 Web ACL (CloudFront scope)
aws wafv2 create-web-acl --name saa-acl --scope CLOUDFRONT \
  --default-action Allow={} \
  --visibility-config 'SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=acl'

# GuardDuty 활성화
aws guardduty create-detector --enable

# Macie 시작
aws macie2 enable-macie

# Security Hub 활성화
aws securityhub enable-security-hub --enable-default-standards
```

---

## 📝 연습 문제

**문제 1.** SQL 주입 / XSS 차단:

A) Shield B) WAF C) GuardDuty D) NACL

**정답: B**.

---

**문제 2.** 대규모 DDoS 대비 + 비용 보호:

A) Shield Standard B) Shield Advanced C) WAF Rate-based D) Network Firewall

**정답: B**.

---

**문제 3.** EC2 OS 패키지 CVE 자동 스캔:

A) Inspector B) GuardDuty C) Macie D) Security Hub

**정답: A**.

---

**문제 4.** S3에 있는 PII 자동 탐지:

A) GuardDuty B) Macie C) Inspector D) Config

**정답: B**.

---

**문제 5.** 다중 계정 보안 점수 통합:

A) Detective B) Security Hub C) GuardDuty D) Trusted Advisor

**정답: B**.

---

## 📌 오늘의 요약

1. WAF는 L7, Shield는 DDoS.
2. GuardDuty(위협)·Inspector(취약점)·Macie(PII).
3. Detective는 근본 원인 분석.
4. Security Hub로 멀티 계정 통합.
5. Firewall Manager로 조직 가드레일.
