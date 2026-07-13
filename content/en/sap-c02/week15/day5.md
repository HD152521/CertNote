# Day 5 - Healthcare & Public Sector — HIPAA/GxP/FEDRAMP, Immutable Audit, Highly Regulated Compliance

Healthcare and government: **compliance non-negotiable**. HIPAA demands encryption, audit trails, Business Associate Agreements. GxP (FDA pharma) requires 21 CFR Part 11 electronic records. FedRAMP demands Impact Levels.

Pro design: KMS encryption all data, Secrets Manager rotation, Backup Vault Compliance Lock (immutable 7+ years), GuardDuty org-wide, AWS CloudHSM for FIPS 140-2, separate compliance account, regular FIS validation.

Core: **Audit > Availability. Security > Performance. Cost last.**

Key mappings: (1) "Patient data HIPAA compliance" → **KMS encryption + Secrets Manager + BAA**, (2) "21 CFR Part 11 audit trail" → **CloudTrail + Object Lock Compliance 7 years**, (3) "FedRAMP IL4 HSM requirement" → **CloudHSM FIPS 140-2**, (4) "Patient privacy + access control" → **IAM + ABAC + Permission Boundary**, (5) "Incident response <1 hour" → **GuardDuty + Security Hub + Incident Manager**.

[6 EXERCISES: KMS key policies, Secrets Manager auto-rotation with Lambda, HIPAA audit log retention, FedRAMP control mapping, Business Associate Agreement scope, Incident response SLA]

---

## 📝 연습 문제

**문제 1.** HIPAA 환자 데이터 암호화 → **KMS encryption**

**문제 2.** 의약품 감사 로그 21 CFR 파트 11 → **Object Lock Compliance 7년**

**문제 3.** FedRAMP 서명 요구 HSM → **CloudHSM FIPS 140-2**

**문제 4.** 의료 사고 1시간 내 탐지·보고 → **GuardDuty + Security Hub + Incident Manager**

**문제 5.** 환자 접근 제어 최소권한 → **IAM ABAC Permission Boundary**

**문제 6.** BAA(Business Associate Agreement) 필수 범위 → **Data processing, subprocessors, liability**

---