# Day 75 - 정부·헬스케어 컴플라이언스 종합

📅 Week 15 (Day 5)
🎯 주제: HIPAA·FedRAMP·GovCloud
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 헬스케어 HIPAA·정부 FedRAMP 요구사항
- GovCloud 차이점
- PHI·PII 데이터 보호 패턴

---

## 📖 시나리오

> 미국 의료 보험사. HIPAA·HITRUST·FedRAMP Moderate.
> 환자 PHI 5억 건. 30년 보관.

### 요구사항

- BAA (Business Associate Addendum) 적용 서비스만
- 모든 데이터 암호화·CMK
- 감사 로그 보존
- PHI 비식별화

---

## 📖 솔루션

### 1. HIPAA Eligible Services

- AWS는 약 130+ 서비스가 HIPAA Eligible
- BAA 체결 필수 (AWS Artifact에서 다운로드)
- 사용 시 PHI는 HIPAA Eligible 서비스 내에서만 처리

### 2. GovCloud (US)

- 미국 시민·영주권자 운영 + 별도 리전(us-gov-west-1·us-gov-east-1)
- FedRAMP High·DoD SRG IL2-5
- 일반 AWS와 별도 계정·별도 콘솔
- 일부 서비스 미지원

### 3. 데이터 보호

- **CMK 전체 강제** (SCP)
- **Macie**로 PHI·PII 자동 탐지
- **Comprehend Medical**: PHI 추출 + 비식별화
- **HealthLake**: FHIR R4 데이터레이크
- **S3 Object Lock Compliance** 30년

### 4. 네트워크 격리

- 모든 통신 PrivateLink
- TGW + Inspection VPC + Network Firewall

### 5. 감사·컴플라이언스

- **CloudTrail Org Trail** + Object Lock
- **Config Conformance Pack** (HIPAA·NIST 800-53)
- **Security Hub** (NIST·HIPAA Foundational Best Practices)
- **Audit Manager** HIPAA 프레임워크

### 6. DR

- Aurora Global / DDB Global
- Backup Cross-Region
- 30년 보존 → Glacier Deep Archive + Vault Compliance Lock

---

## 🧠 함정 회피

- "HIPAA Eligible 아닌 서비스 사용 금지" → SCP로 차단
- "PHI 자동 탐지" → Macie / Comprehend Medical
- "FedRAMP High" → GovCloud
- "30년 WORM" → Object Lock Compliance + Vault Lock Compliance

---

## 🏗️ 아키텍처 — HIPAA + DR

```
[App] → [PrivateLink → HIPAA Eligible 서비스만]
   │
[KMS CMK 강제]
   │
[Macie + Comprehend Medical 탐지·비식별화]
   │
[HealthLake FHIR] / [Aurora Global]
   │
[CloudTrail Org → Object Lock 30년]
   │
[Backup Vault Compliance Lock 30년]
```

---

## ⭐ 핵심 포인트

1. ⭐ HIPAA Eligible 서비스 + BAA
2. ⭐ GovCloud = FedRAMP High·DoD
3. ⭐ Macie + Comprehend Medical = PHI 자동
4. ⭐ HealthLake FHIR R4
5. ⭐ Object Lock + Vault Lock 30년
6. ⭐ Conformance Pack + Audit Manager

---

## 📝 시나리오 10문항 (Week 15 통합)

**문제 1.** HIPAA Eligible 아닌 서비스 사용 차단.

A) IAM
B) SCP (Deny)
C) Config
D) NACL

**정답: B**

---

**문제 2.** 의료 텍스트에서 PHI 추출·비식별화.

A) Comprehend
B) Comprehend Medical
C) Macie
D) Textract

**정답: B**

---

**문제 3.** FedRAMP High 인증 인프라.

A) 일반 us-east-1
B) GovCloud (us-gov-west-1)
C) eu-west-1
D) Local Zone

**정답: B**

---

**문제 4.** FHIR R4 의료 데이터레이크.

A) Athena
B) HealthLake
C) Redshift
D) Lake Formation

**정답: B**

---

**문제 5.** 거래 로그 7년 변경 불가.

A) Vault Governance
B) Vault Compliance Lock 7년 + Object Lock
C) Glacier만
D) Versioning

**정답: B**

---

**문제 6.** 글로벌 라이브 스트리밍 인코딩.

A) MediaConvert
B) MediaLive
C) MediaPackage
D) MediaConnect

**정답: B**

---

**문제 7.** 시드 단계 — 비용 0·자동 확장 SQL DB.

A) RDS
B) Aurora Serverless v2
C) Redshift
D) DDB

**정답: B**

---

**문제 8.** EU 데이터 비EU 이동 차단.

A) IAM
B) SCP DenyRegions
C) NACL
D) Config Rule (탐지만)

**정답: B**

---

**문제 9.** 모든 VPC 트래픽 IDS/IPS·TLS Inspection.

A) WAF
B) Network Firewall + Inspection VPC
C) SG
D) NACL

**정답: B**

---

**문제 10.** 분기 Game Day 자동.

A) Backup Restore
B) FIS + EventBridge Schedule
C) Trusted Advisor
D) Resilience Hub

**정답: B**

---

## 📌 Week 15 한 줄 정리

> "케이스마다 핵심 키워드: 글로벌 ERP=계정/네트워크/MGN, 스타트업=서버리스, 금융=격리/HSM/감사, 미디어=Elemental/CloudFront, 헬스케어=BAA/Macie/HealthLake."

---

## 🎯 다음 주 (Week 16) 예고

도메인별 종합 + 최종 모의고사 + D-Day 전략.
