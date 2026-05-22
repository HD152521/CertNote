# Day 73 - 금융: 규제·감사·격리·DR

📅 Week 15 (Day 3)
🎯 주제: 강력한 보안·격리·감사
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 금융권 컴플라이언스 (PCI DSS·FFIEC·SOX)
- 강력한 격리·암호화·감사
- DR RTO/RPO 엄격한 요구

---

## 📖 시나리오

> 글로벌 은행. PCI DSS·SOX 준수. RTO 15분·RPO 1분.
> 거래 데이터 7년 보관·WORM. 모든 키 자체 관리.

### 요구사항

- 다중 계정 격리 (Card Data Environment 분리)
- 모든 데이터 암호화·CMK 필수
- HSM (FIPS 140-2 L3)
- 감사 무결성
- DR + Game Day

---

## 📖 솔루션

### 1. 계정 격리

- **Card Data Environment (CDE)** 별도 OU
- SCP로 비CDE 계정 PII·카드 데이터 차단
- IAM Identity Center · Permission Boundary

### 2. 암호화

- **CMK** 전체 강제 (SCP로 Default Encryption 강제)
- **CloudHSM** (PIN·Master Key)
- **KMS Custom Key Store** (HSM 백엔드)

### 3. 네트워크 격리

- **Transit Gateway Inspection VPC** + **Network Firewall**
- 모든 트래픽 IDS/IPS
- **PrivateLink** — 인터넷 미경유 서비스 호출
- **DX 다중 리전 다중 회선**

### 4. 데이터·DR

- **Aurora Global Database** (RPO < 1s)
- **DynamoDB Global Tables**
- **AWS Backup Cross-Region + Vault Lock Compliance** 7년
- **S3 Object Lock Compliance**

### 5. 감사·탐지

- **CloudTrail Org Trail** (Log Archive 계정·Object Lock)
- **Config Aggregator** + Conformance Pack (PCI DSS)
- **Security Hub** (PCI DSS Standard) + GuardDuty + Macie + Inspector
- **Audit Manager** (PCI DSS·SOX 프레임워크)
- **Detective** 사건 조사

### 6. 운영

- **Resilience Hub**로 RTO/RPO 평가
- **FIS Game Day** 분기별
- **Incident Manager** 런북 자동
- **Route 53 ARC** Failover 의사결정

---

## 🧠 함정 회피

- "CMK 필수" = SCP `Deny if not aws:kms` + Default Encryption
- "WORM 7년" = Vault Lock Compliance + Object Lock Compliance
- "키 자체 관리" = CMK 또는 CloudHSM
- "사고 시각화" = Detective + Security Hub

---

## 🏗️ 아키텍처 — Inspection VPC

```
[Spoke VPC (CDE)] ──┐
[Spoke VPC (NonCDE)] ┼─▶ [TGW] ─▶ [Inspection VPC: Network Firewall]
[DX/VPN]            ─┘                       │
                                             ▼
                                       [Egress NAT/IGW]
```

---

## ⭐ 핵심 포인트

1. ⭐ CDE 격리 OU·SCP
2. ⭐ CMK + CloudHSM + KMS Custom Key Store
3. ⭐ Inspection VPC + Network Firewall
4. ⭐ Aurora/DDB Global + Vault Lock 7년
5. ⭐ Security Hub PCI Standard + Audit Manager
6. ⭐ Route 53 ARC + FIS Game Day

---

## 📝 연습 문제

**문제 1.** FIPS 140-2 L3·단일 테넌트.

A) KMS CMK
B) CloudHSM (or KMS Custom Key Store)
C) Imported Key
D) Secrets Manager

**정답: B**

---

**문제 2.** PCI DSS 자동 점검·통합 대시보드.

A) Config 단독
B) Security Hub (PCI DSS Standard)
C) Audit Manager만
D) Trusted Advisor

**정답: B** — SH가 통합 점검

---

**문제 3.** 모든 VPC 트래픽 IDS/IPS.

A) WAF
B) Network Firewall + Inspection VPC
C) SG
D) GuardDuty

**정답: B**

---

**문제 4.** 7년 변경 불가 백업.

A) Vault Governance
B) Vault Compliance Lock 7년
C) S3 Versioning
D) Glacier

**정답: B**

---

**문제 5.** SOX 감사 보고서 자동.

A) Security Hub
B) Audit Manager
C) Trusted Advisor
D) Detective

**정답: B**

---

**문제 6.** 분기별 의도적 장애 훈련.

A) Trusted Advisor
B) FIS Game Day
C) Resilience Hub
D) Backup Restore

**정답: B**

---

## 📌 오늘의 요약

1. CDE 격리·SCP·Permission Boundary
2. CMK + CloudHSM + KMS Custom Key Store
3. Inspection VPC + NWF
4. Aurora·DDB Global + Vault Lock 7년
5. PCI DSS Standard + Audit Manager + FIS
