# Day 54 - WAF·Shield·Firewall Manager (엣지 보안)

📅 Week 11 (Day 4)
🎯 주제: 엣지 보안·DDoS 방어
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- WAF의 룰 그룹·매니지드 룰·Rate 룰 차이
- Shield Standard·Advanced 차이
- Firewall Manager로 멀티 계정 보안 정책 통합
- Network Firewall vs WAF

---

## 🧩 사전 지식 (CS 기초)

- **OSI**: L3/L4 = IP·Port / L7 = HTTP
- **DDoS**: 분산 서비스 거부 공격 (Volumetric·Protocol·Application)
- **OWASP Top 10**: SQLi·XSS 등 웹 취약점

---

## 📖 이론 내용

### 1. WAF (L7)

- 적용 대상: **CloudFront, ALB, API Gateway, AppSync, App Runner, Cognito**
- Web ACL → Rule (Statement) → Action (Allow/Block/Count/CAPTCHA/Challenge)
- **Managed Rule Groups**:
  - AWS Core Rule Set, Known Bad Inputs, SQLi, Linux/Windows, IP Reputation, Bot Control
  - AWS Marketplace (F5, Imperva, Fortinet 등)
- **Rate-Based Rule**: 5분 윈도우 요청 수 제한
- **Geo Match·IP Set·Regex·Size·SQLi/XSS**

### 2. Shield

| Tier | 내용 |
|------|------|
| **Standard** | 무료, L3/L4 DDoS 자동 |
| **Advanced** | $3000/월, L7 포함·DRT 지원·Cost Protection·Global Threat Dashboard |

- Advanced = ELB·CloudFront·Global Accelerator·Route 53·EIP 대상
- **Shield Response Team (SRT)** — 24/7 지원 (Advanced)

### 3. Firewall Manager

- **Organization 단위**로 정책 통합 적용
- 대상: WAF, Shield Advanced, Security Groups, Network Firewall, DNS Firewall, Route 53 Resolver
- 신규 계정·리소스에도 **자동 적용**

### 4. Network Firewall (L3-L7)

- VPC 차원 트래픽 검사 (Suricata 룰)
- 가용 영역 단위 배치 + Route Table로 트래픽 강제
- IDS/IPS·도메인 필터링·TLS Inspection
- **vs WAF**: WAF = L7 웹 / NWF = VPC 트래픽 전반

### 5. DNS Firewall

- Route 53 Resolver 단계에서 악성 도메인 차단
- Managed 도메인 리스트 (AWS, 3rd Party)

---

## 🧠 심화 이론

### 함정 포인트

- **"비용 보호 (예상치 못한 청구 환불)"** → Shield **Advanced** Cost Protection
- **"멀티 계정 SG·WAF 정책 통합"** → Firewall Manager
- **"VPC 내부 트래픽 IDS/IPS"** → Network Firewall (WAF ✗)
- **"악성 도메인 차단"** → Route 53 DNS Firewall

### 비용 최적화

- Shield Advanced는 비싸지만 **자회사 청구도 묶음** (조직 단위 1구독)
- WAF Bot Control은 별도 과금 → 트래픽 적은 환경은 Rate-Based로 대체

---

## 🏗️ 아키텍처 — 엣지 보안 풀스택

```
[Internet]
   │
[Route 53] ←─ DNS Firewall (악성 도메인 차단)
   │
[CloudFront] ←─ WAF (L7) + Shield Advanced
   │
[ALB] ←─ WAF (Origin)
   │
[VPC] ←─ Network Firewall (L3-L7 IDS/IPS)
   │
[EC2/Container]
```

---

## ⭐ 핵심 포인트

1. ⭐ WAF = L7 (CF·ALB·APIGW·AppSync·App Runner·Cognito)
2. ⭐ Shield Advanced = L7 DDoS + Cost Protection + SRT
3. ⭐ Firewall Manager = Org 단위 보안 정책 자동
4. ⭐ Network Firewall = VPC L3-L7 IDS/IPS
5. ⭐ DNS Firewall = 악성 도메인 (Route 53 Resolver)
6. ⭐ Managed Rule Group으로 OWASP·SQLi 즉시 보호

---

## 💻 CLI 예시

```bash
# WAF Web ACL에 Rate-Based 룰
aws wafv2 create-web-acl \
  --name app-acl \
  --scope REGIONAL \
  --default-action Allow={} \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=app \
  --rules file://rate-rule.json
```

---

## 📝 연습 문제

**문제 1.** OWASP Top 10 즉시 보호. 운영 부담 최소.

A) Custom WAF 룰 모두 작성
B) AWS Managed Rule Groups (Core Rule Set·Known Bad Inputs)
C) Shield Standard
D) NACL

**정답: B**

---

**문제 2.** L7 DDoS·예상치 못한 청구 환불.

A) Shield Standard
B) Shield Advanced (Cost Protection)
C) WAF Rate-Based
D) CloudFront만

**정답: B**

---

**문제 3.** 멀티 계정 SG·WAF 정책 일괄 + 신규 계정 자동.

A) Config
B) Firewall Manager
C) SCP
D) Control Tower

**정답: B**

---

**문제 4.** VPC 내부에 IDS/IPS·TLS Inspection.

A) WAF
B) Network Firewall
C) Shield
D) SG

**정답: B**

---

**문제 5.** 사내 사용자가 악성 도메인 접근 차단.

A) WAF
B) NACL
C) Route 53 DNS Firewall
D) Network Firewall (가능하나 도메인 매니지드 리스트는 DNS Firewall)

**정답: C**

---

**문제 6.** 특정 국가만 차단.

A) NACL
B) WAF Geo Match
C) Shield
D) SG

**정답: B**

---

## 📌 오늘의 요약

1. WAF = L7 / Shield = L3-L4(+L7 Adv) / NWF = VPC IDS/IPS
2. Shield Advanced Cost Protection
3. Firewall Manager = Org 단위 통합
4. Managed Rule Group + Rate-Based
5. DNS Firewall = 악성 도메인
