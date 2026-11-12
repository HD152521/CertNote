# Day 5 - Healthcare & Public Sector — HIPAA/GxP/FEDRAMP, Immutable Audit, Highly Regulated Compliance

Healthcare and government: **compliance non-negotiable**. HIPAA demands encryption, audit trails, Business Associate Agreements. GxP (FDA pharma) requires 21 CFR Part 11 electronic records. FedRAMP demands Impact Levels.

Pro design: KMS encryption all data, Secrets Manager rotation, Backup Vault Compliance Lock (immutable 7+ years), GuardDuty org-wide, AWS CloudHSM for FIPS 140-2, separate compliance account, regular FIS validation.

Core: **Audit > Availability. Security > Performance. Cost last.**

Key mappings: (1) "Patient data HIPAA compliance" → **KMS encryption + Secrets Manager + BAA**, (2) "21 CFR Part 11 audit trail" → **CloudTrail + Object Lock Compliance 7 years**, (3) "FedRAMP IL4 HSM requirement" → **CloudHSM FIPS 140-2**, (4) "Patient privacy + access control" → **IAM + ABAC + Permission Boundary**, (5) "Incident response <1 hour" → **GuardDuty + Security Hub + Incident Manager**.

[6 EXERCISES: KMS key policies, Secrets Manager auto-rotation with Lambda, HIPAA audit log retention, FedRAMP control mapping, Business Associate Agreement scope, Incident response SLA]

---

## 📝 Practice Questions

**Question 1.** HIPAA patient data encryption → **KMS encryption**

**Question 2.** Pharmaceutical audit logs under 21 CFR Part 11 → **Object Lock Compliance for 7 years**

**Question 3.** HSM required by FedRAMP signing → **CloudHSM FIPS 140-2**

**Question 4.** Detect and report a medical incident within 1 hour → **GuardDuty + Security Hub + Incident Manager**

**Question 5.** Least-privilege patient access control → **IAM ABAC Permission Boundary**

**Question 6.** Required scope of a BAA (Business Associate Agreement) → **Data processing, subprocessors, liability**

---