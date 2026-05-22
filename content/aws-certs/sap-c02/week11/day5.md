# Day 55 - Week 11 복습 + 시나리오 10문항

📅 Week 11 (Day 5)
🎯 주제: 보안 종합
⏱️ 약 90분

---

## 📌 한 페이지 요약

### KMS
- Key Policy + IAM + Grant 3중 체크
- MRK = Cross-Region DR
- BYOK = Imported (자동 로테이션 ✗)
- CloudHSM = 단일 테넌트 FIPS 140-2 L3

### 탐지 3총사
- **Macie** = S3 PII
- **GuardDuty** = 위협·트래픽 이상 (Protection 옵트인)
- **Inspector v2** = EC2·ECR·Lambda CVE

### 통합 관제
- **Security Hub** = CSPM·표준 점검·통합 Finding
- **Detective** = 그래프 사건 조사
- **Audit Manager** = 컴플라이언스 증거 자동

### 엣지·DDoS
- **WAF** = L7 (CF·ALB·APIGW)
- **Shield Advanced** = L7 DDoS + Cost Protection + SRT
- **Firewall Manager** = Org 단위 정책 통합
- **Network Firewall** = VPC L3-L7 IDS/IPS
- **DNS Firewall** = 악성 도메인

---

## 📝 시나리오 10문항

**문제 1.** 멀티 리전 RDS Snapshot 복호화·DR.

A) Cross-Region Copy + Imported Key
B) Multi-Region Key
C) AWS Managed Key
D) BYOK

**정답: B**

---

**문제 2.** S3 버킷에 카드 번호 저장 여부 자동 탐지.

A) Inspector
B) Macie
C) GuardDuty S3 Protection (의심 접근에는 GD)
D) Config

**정답: B** — 데이터 내용 탐지는 Macie

---

**문제 3.** EC2 OS 패치 누락 자동 스캔.

A) Inspector v2
B) Patch Manager
C) GuardDuty
D) Macie

**정답: A**

---

**문제 4.** EC2가 알려진 악성 IP와 통신.

A) Inspector
B) GuardDuty
C) Macie
D) WAF

**정답: B**

---

**문제 5.** 모든 계정 CIS·PCI 표준 자동 점검 + 단일 대시보드.

A) Audit Manager
B) Security Hub
C) Detective
D) Trusted Advisor

**정답: B**

---

**문제 6.** L7 DDoS·청구 비용 보호.

A) WAF
B) Shield Standard
C) Shield Advanced
D) NACL

**정답: C**

---

**문제 7.** 멀티 계정 WAF·SG 정책 자동 적용·신규 계정도 자동.

A) SCP
B) Firewall Manager
C) Control Tower
D) Config Aggregator

**정답: B**

---

**문제 8.** VPC 내 트래픽에 IDS/IPS·TLS Inspection.

A) WAF
B) Network Firewall
C) Shield
D) GuardDuty

**정답: B**

---

**문제 9.** 사용자 단말이 악성 도메인 접근하지 못하게.

A) NACL
B) WAF
C) Route 53 DNS Firewall
D) SG

**정답: C**

---

**문제 10.** HIPAA 감사 — 증거 자동 수집·보고서.

A) Security Hub
B) Audit Manager
C) Detective
D) Config

**정답: B**

---

## 📌 Week 11 한 줄 정리

> "KMS로 키, Macie·GuardDuty·Inspector로 탐지, Security Hub·Detective·Audit Manager로 운영·조사·감사, WAF·Shield·FMS·NWF·DNS Firewall로 엣지 방어."

---

## 🎯 다음 주 (Week 12) 예고

비용 최적화 심화 — Savings Plans·Compute Optimizer·Cost Explorer·S3·NAT GW 비용.
