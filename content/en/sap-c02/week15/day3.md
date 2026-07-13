# Day 3 - Financial Services Compliance & Real-Time Settlement — FINRA/SOX/PCI-DSS Audit, Active-Active Multi-Region, Zero Data Loss

Financial services require **immutable audit**, **zero data loss**, **sub-second consistency**. Pro design: DynamoDB Global Tables (multi-master), Secrets Manager rotation, GuardDuty + Security Hub org-wide, Backup Vault Compliance Lock Object Lock, regular FIS chaos tests, Aurora Global + DDB Global for critical ledgers.

Core: **Compliance is non-negotiable → Security pillar first → Reliability second → Cost last.** Regulators demand 7-year WORM logs, dual ledger reconciliation, and documented DR drills.

Key mappings: (1) "Zero transaction loss + multi-region" → **DDB Global Tables**, (2) "7-year audit immutable" → **Object Lock Compliance**, (3) "Ledger + payment precision" → **Aurora Global + DDB Global hybrid**, (4) "Org-wide threat detection" → **GuardDuty + Security Hub delegated admin**, (5) "Password auto-rotate 30 days" → **Secrets Manager with RDS native integration**.

[6 EXERCISES COVERING: DDB active-active conflict, Secrets Manager rotation, GuardDuty org deployment, Backup Compliance vs Governance, SCP FX wire limits, FIS production validation]

---

## 📝 연습 문제

**문제 1.** 양 리전 동시 거래 기록 → **DDB Global Tables Last-Writer-Wins**

**문제 2.** 비밀번호 자동 30일 교체, 무중단 → **Secrets Manager RDS native**

**문제 3.** 50개 계정 위협 중앙 감시 → **GuardDuty Security Hub delegated admin**

**문제 4.** 7년 거래 로그 root 불가 → **Object Lock Compliance**

**문제 5.** SCP로 송금 리전 제한 → **DenyRegions condition**

**문제 6.** Production 복구 검증 정기 테스트 → **FIS + Stop Condition**

---