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

**Question 7.** A bank must fully own and control its payment keys on **single-tenant** FIPS 140-2 Level 3 certified hardware and never share them with AWS. It also needs HSM-specific functions such as PIN and master keys. Which is the most appropriate?
A) KMS AWS managed key
B) CloudHSM
C) KMS customer managed CMK (shared HSM)
D) Secrets Manager

**Answer: B**

Explanation: CloudHSM is a **customer-exclusive, single-tenant HSM** that provides FIPS 140-2 Level 3, lets you handle HSM-specific functions such as PIN and master keys directly, and does not share keys with AWS. KMS in A and C is an AWS-managed **multi-tenant** shared HSM, so it falls short of the "single-tenant, fully owned" requirement (in C, the customer controls the key policy of the CMK, but the HSM itself is shared). Secrets Manager in D is a secret store, not an HSM. Trap: if the requirement is simply "a CMK is required," it is a KMS CMK, but when "single-tenant, fully owned HSM" is stated, it is CloudHSM.

---

**Question 8.** A financial company wants to keep its key material in its own CloudHSM cluster while still using KMS's standard integration for S3, EBS, and RDS encryption. Which configuration is most appropriate?
A) Call pure CloudHSM directly through PKCS#11
B) KMS Custom Key Store (CloudHSM backend)
C) KMS AWS managed key
D) SSE-S3 for each service

**Answer: B**

Explanation: A **KMS Custom Key Store** keeps the convenient KMS API and service integration (KMS encryption for S3, EBS, and RDS) while storing the actual key material in a **customer-owned CloudHSM cluster**. It satisfies both "the key is in our HSM" and "used like KMS" at the same time. Pure CloudHSM in A must be handled directly through PKCS#11/JCE, so you cannot use the convenience of KMS integration with S3 and RDS. C keeps the key in an AWS-managed HSM. D uses an AWS-owned key, so it is not self-managed. Trap: "a dedicated HSM + KMS integration convenience at the same time" is a Custom Key Store.

---

**Question 9.** A bank wants to perform IDS/IPS, domain filtering, and TLS inspection for all spoke VPC and on-premises traffic in one place. Which is the most appropriate pattern?
A) An individual WAF on each VPC
B) Transit Gateway + Inspection VPC + AWS Network Firewall
C) NACLs on each subnet
D) Enable only GuardDuty

**Answer: B**

Explanation: **TGW + Inspection VPC + Network Firewall** is a hub-and-spoke service insertion pattern that forces all east-west and north-south traffic through a central inspection point. Network Firewall performs Suricata-based IDS/IPS, domain filtering, and TLS inspection. The WAF in A is limited to L7 HTTP protection and cannot inspect all traffic between VPCs. The NACL in C is simple allow/deny and is not IDS/IPS. GuardDuty in D is detection (analysis), not inline traffic inspection or blocking. Trap: "central IDS/IPS for all VPC traffic" is Inspection VPC + Network Firewall.

---

**Question 10.** After setting up an Inspection VPC, the request and response of the same connection go to firewall endpoints in different AZs, so state tracking breaks and connections are dropped. What is the most accurate cause and solution?
A) A Network Firewall rule error; rewrite the rules
B) Appliance mode is not enabled on the TGW; enable appliance mode
C) Security groups are not configured; add an SG
D) A Region outage; move to another Region

**Answer: B**

Explanation: By default, TGW can distribute flows across AZs, so with a stateful firewall, if the bidirectional packets of the same connection go to endpoints in different AZs, state tracking breaks. Enabling **appliance mode** on the TGW attachment pins all packets of the same flow to the same endpoint (AZ), so stateful inspection works correctly. A and C are unrelated to the symptom of asymmetric routing, and D is an excessive response. Trap: "connection drops from asymmetric routing in an Inspection VPC" is a missing appliance mode.

---

**Question 11.** You want to investigate the root cause of a discovered security incident by tracing and visualizing, as a graph, "which credential did what and when." Which service is most appropriate?
A) Security Hub
B) Amazon Detective
C) Audit Manager
D) Macie

**Answer: B**

Explanation: **Detective** connects CloudTrail, VPC Flow Logs, and GuardDuty data in a graph model and specializes in visually tracing and investigating the root cause and chain of actions of an incident (which principal did what and when). Security Hub in A consolidates findings and checks against standards (a dashboard), but it is not a root cause graph investigation. Audit Manager in C is for collecting evidence for regulatory frameworks and for audit reports. Macie in D is for discovering sensitive data in S3. Trap: "visualizing and investigating the root cause of an incident" is Detective.

---

**Question 12.** A bank promises an RTO of 15 minutes and an RPO of 1 minute, and wants to operate failover not with automatic health checks but with a **pre-validated control switch**, to prevent both sides from going down during a partial failure. Which service is most appropriate?
A) Route 53 simple Failover Routing
B) Route 53 Application Recovery Controller (ARC)
C) Auto Scaling
D) CloudWatch Alarm

**Answer: B**

Explanation: The Routing Control of **Route 53 ARC** turns failover into an explicit on/off switch, and Readiness Checks validate in advance the recovery readiness of the target Region. Operators make a controlled decision, preventing the flapping in which automatic failover takes down both sides during a partial failure. Simple Failover Routing in A is automatic switching based on health checks, so control and pre-validation are weak. C and D are not failover decision mechanisms. Trap: "controlled failover and recovery readiness validation" is Route 53 ARC.

---

**Question 13.** You want to retain transaction audit logs for 7 years so that no one (including operators and root) can modify or delete them, and also prevent workload operators from accessing the log store at all. Which design is most appropriate?
A) S3 in the same account + Versioning
B) S3 in a separate Log Archive account + Object Lock Compliance + CloudTrail Organization Trail
C) S3 in the same account + Object Lock Governance
D) CloudWatch Logs retention of 7 years

**Answer: B**

Explanation: A **CloudTrail Organization Trail** collects API calls across the whole organization, and if it is stored in S3 in a **separate Log Archive account**, workload operators have no access to that account and cannot touch the logs (account isolation). **Object Lock Compliance** mode prevents even root from modifying or deleting during the retention period. Versioning in A cannot prevent deletion itself, and Governance in C can be bypassed by a privileged user, so it falls short of the "even root cannot" requirement and, being in the same account, does not stop operator access either. D is not a WORM guarantee. Trap: "neither operators nor root" is a separate account + Object Lock Compliance.

---
---