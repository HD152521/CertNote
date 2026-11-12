# Day 3 - Financial Services Compliance & Real-Time Settlement — FINRA/SOX/PCI-DSS Audit, Active-Active Multi-Region, Zero Data Loss

Financial services require **immutable audit**, **zero data loss**, **sub-second consistency**. Pro design: DynamoDB Global Tables (multi-master), Secrets Manager rotation, GuardDuty + Security Hub org-wide, Backup Vault Compliance Lock Object Lock, regular FIS chaos tests, Aurora Global + DDB Global for critical ledgers.

Core: **Compliance is non-negotiable → Security pillar first → Reliability second → Cost last.** Regulators demand 7-year WORM logs, dual ledger reconciliation, and documented DR drills.

Key mappings: (1) "Zero transaction loss + multi-region" → **DDB Global Tables**, (2) "7-year audit immutable" → **Object Lock Compliance**, (3) "Ledger + payment precision" → **Aurora Global + DDB Global hybrid**, (4) "Org-wide threat detection" → **GuardDuty + Security Hub delegated admin**, (5) "Password auto-rotate 30 days" → **Secrets Manager with RDS native integration**.

[6 EXERCISES COVERING: DDB active-active conflict, Secrets Manager rotation, GuardDuty org deployment, Backup Compliance vs Governance, SCP FX wire limits, FIS production validation]

---

## 📝 Practice Questions

**Question 1.** Transactions recorded simultaneously in both Regions → **DDB Global Tables Last-Writer-Wins**

**Question 2.** Automatic password rotation every 30 days with no downtime → **Secrets Manager RDS native**

**Question 3.** Central threat monitoring of 50 accounts → **GuardDuty Security Hub delegated admin**

**Question 4.** 7-year transaction logs unmodifiable even by root → **Object Lock Compliance**

**Question 5.** Restrict remittance Regions with an SCP → **DenyRegions condition**

**Question 6.** Regular tests to verify Production recovery → **FIS + Stop Condition**

---