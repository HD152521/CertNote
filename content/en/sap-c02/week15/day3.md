# Day 3 - Financial Services: Regulation, Audit, Isolation, DR — The History of PCI DSS, the Cryptography of HSMs and Key Hierarchies, and Defense in Depth in Isolation Architecture

In 2008, the payment processor **Heartland Payment Systems** had roughly 130 million card records stolen — the largest breach in history at the time. The attackers got in through SQL injection, planted a sniffer on the network, and spent months siphoning off **card data that was flowing across the network unencrypted**. The incident accelerated the tightening of PCI DSS (the Payment Card Industry Data Security Standard) and made "encryption in transit and at rest" and "isolation of the cardholder data environment (CDE)" absolute norms. That is why financial architecture is fundamentally different from other domains — **regulation governs the design.** Isolation, encryption, and audit integrity come before availability and cost.

Today's scenario is a global bank: PCI DSS and SOX compliance, RTO 15 minutes and RPO 1 minute, 7-year WORM retention of transaction data, and every key self-managed. At the SAA level the answer is "turn on encryption and take backups," but Pro demands the full picture of defense in depth: **isolate the CDE in a separate OU, control keys with FIPS 140-2 Level 3 HSMs, inspect all traffic in an Inspection VPC, and make audit logs impossible to delete even for operators.** Today we break down what PCI DSS actually enforces, the cryptography of HSM and KMS key hierarchies, and each layer of the isolation architecture in depth.

## PCI DSS — Isolation Created by 12 Requirements

**PCI DSS (Payment Card Industry Data Security Standard)** is a card data protection standard jointly established in 2004 by Visa, Mastercard, and others, made up of 12 requirements. The core concept is the **CDE (Cardholder Data Environment)** — the boundary of the systems that store, process, or transmit card data. The most powerful strategy in PCI DSS is **scope reduction**. The more strongly you isolate the CDE from the rest of your systems, the smaller the audit target (the scope) becomes, and cost and risk fall together.

This is the combination of the **Defense in Depth** principle and **segmentation**. PCI DSS explicitly recognizes that separating the CDE with network segmentation can reduce the audit scope. The canonical way to implement this on AWS is to **isolate the CDE in a separate account/OU** — an account boundary is the strongest isolation, so SCPs on the CDE account fundamentally block actions involving PII and card data from non-CDE accounts. This matches exactly what NIST SP 800-53 SC-7 (boundary protection) and AC-4 (information flow enforcement) require. When the exam shows "isolate the cardholder data environment from everything else," a separate OU + SCP is the signal for the correct answer.

PCI DSS requires that **a card number (PAN) be rendered unreadable when stored — by encryption, tokenization, or hashing** — and states flatly that **the CVV must never be stored after authorization**. That is why the practical pattern is **tokenization**: replace the real card number with a meaningless token so that systems outside the CDE handle only tokens, and those systems drop out of the CDE scope (scope reduction). On AWS, you place a payment tokenization service or a dedicated token vault inside the CDE, and the rest of the applications see only tokens. When the exam shows "minimize the number of systems that handle card numbers," tokenization + CDE isolation is the key.

## HSM and KMS — The Cryptography of Key Hierarchies

"Every key self-managed" and "FIPS 140-2 Level 3" are requirements that go beyond simple encryption. To understand them, you need to know AWS's **key hierarchy** and what an HSM means.

Encryption is usually done with **envelope encryption** — data is encrypted with a **data key (DEK)**, and that DEK is in turn encrypted with a **master key (CMK/KEK)** and stored. To read data, you decrypt the DEK with the CMK, then decrypt the data with the decrypted DEK. The essential point is that **the CMK never leaves the HSM in plaintext.**

**FIPS 140-2 (NIST's security standard for cryptographic modules)** grades cryptographic modules from Level 1 to 4. Level 2 requires physical tamper evidence, and **Level 3 requires automatic key deletion on tampering (tamper-response) and identity-based authentication**. KMS's shared HSMs are validated at FIPS 140-2 Level 3, and **CloudHSM provides a single-tenant dedicated HSM at Level 3**. The difference is **tenancy and control** — KMS is an AWS-managed multi-tenant HSM, while CloudHSM is an HSM the customer solely owns and fully controls. When the exam shows "FIPS 140-2 Level 3 + single tenant + full key control," think CloudHSM; "managed + integration convenience" means KMS.

| Option | Tenancy | Key control | FIPS | Use |
|------|--------|---------|------|------|
| **KMS (AWS managed key)** | Multi | AWS | L3 (HSM) | Default encryption |
| **KMS (Customer managed CMK)** | Multi | Customer (policy, rotation) | L3 | Most regulatory requirements |
| **KMS Custom Key Store** | Single (CloudHSM backend) | Customer | L3 | KMS convenience + HSM control |
| **CloudHSM** | Single | Customer, full | L3 | PINs, master keys, full ownership |

**KMS Custom Key Store** is a bridge between two worlds — you keep using KMS's convenient APIs and service integrations, while the actual key material lives in a CloudHSM cluster that you own. It therefore satisfies both at once the regulatory demand that "we want KMS's integration convenience, but the keys must be in our HSM." Pure CloudHSM must be handled directly through standard interfaces such as PKCS#11 and JCE, which makes integration cumbersome. When the exam shows "keep keys in a dedicated HSM but use them like KMS for S3, EBS, and RDS encryption," Custom Key Store is the correct answer.

> ⚠️ **Trap**: Memorizing "self-managed keys = always CloudHSM" leads to over-engineering. Most regulations (including PCI and SOX) are satisfied well enough by a **Customer Managed Key (CMK)** — because the customer controls the key policy, rotation, and access auditing. CloudHSM is truly needed when (1) FIPS 140-2 Level 3 single tenancy is specified by contract or regulation, (2) the keys must never be shared with AWS, or (3) HSM-specific functions such as PINs and master keys are required. In the exam, a plain "CMK required" means a KMS CMK, and an explicit "single-tenant HSM, full ownership" means CloudHSM.

## Isolated Network — Inspection VPC and Central Inspection

Finance demands "inspect all traffic." The pattern that implements this is **Transit Gateway + Inspection VPC + Network Firewall**. Traffic from every spoke VPC and from on-premises passes through the TGW and converges on a central Inspection VPC, where **AWS Network Firewall** performs IDS/IPS, domain filtering, and TLS inspection before the traffic is routed on to its destination.

Network Firewall's engine uses the rule syntax of **Suricata**, the open-source IDS/IPS, as is — so an existing security team's Suricata signatures can be reused. This centralized inspection model is the **hub-and-spoke + service insertion** pattern of network design, forcing all east-west (VPC-to-VPC) and north-south (internet) traffic through a single inspection point. It is easier to operate, keep consistent, and audit than distributed firewalls (a separate one in each VPC). It implements the WA Security pillar's "apply protection at all layers" and NIST SC-7 (boundary protection) through centralization. When the exam shows "IDS/IPS and inspection of all VPC traffic in one place," the answer is Inspection VPC + Network Firewall.

The mechanism by which the TGW diverts traffic to the Inspection VPC is a **deliberately asymmetric design of the TGW route tables**. The TGW route table for the spoke VPCs sends every destination (including 0.0.0.0/0) to the Inspection VPC attachment, and after inspection the Inspection VPC returns the traffic to the appropriate destination route table — and you must turn on **appliance mode** so that both directions of the same flow go to the same Network Firewall endpoint (AZ), so stateful inspection does not break. When the exam shows "we have an Inspection VPC but connections drop because of asymmetric routing," a missing TGW appliance mode is the cause.

The 2017 **Equifax breach** (Social Security numbers and credit data of about 147 million people) occurred because a known Apache Struts vulnerability (CVE-2017-5638) was not patched, and after getting in, the attackers reached **unencrypted credentials and plaintext data** and exfiltrated data undetected for months. The lesson is multi-layered — (1) vulnerability management (automatic scanning with Inspector), (2) network segmentation (blocking lateral movement even after an intrusion), (3) anomaly detection (detecting abnormal data exfiltration with GuardDuty), and (4) audit visibility. It was not a single layer but the entire defense in depth that collapsed. When the exam shows "detect lateral movement and data exfiltration after an intrusion," think of the combination of Network Firewall + GuardDuty + segmentation.

## DR — A Strict RTO of 15 Minutes and RPO of 1 Minute

An RTO of 15 minutes and an RPO of 1 minute are very strict. An RPO of 1 minute (in practice under 1 second) is met by **Aurora Global Database** (storage-level asynchronous replication, typically an RPO under 1 second) or **DynamoDB Global Tables** (multi-master, effectively RPO≈0). An RTO of 15 minutes requires an always-running footprint at the Warm Standby or Active-Active level. For backups, **AWS Backup Cross-Region + Vault Lock Compliance for 7 years** applies WORM.

In financial DR, **verifying the RTO/RPO** is itself a regulatory requirement. The **FFIEC** (Federal Financial Institutions Examination Council, US) guidance and the Basel operational risk framework require not merely "having" DR but **testing it periodically and proving it**. That is where **AWS Resilience Hub** (assessing actual resilience against RTO/RPO policy) and **AWS FIS (Fault Injection Service)** based Game Days (verifying recovery by deliberately injecting failures) come in. This is **Chaos Engineering** — the discipline popularized by Netflix's Chaos Monkey in 2011, of "causing failures on purpose to prove the system withstands them." When the exam shows "prove and regularly verify DR," it is Resilience Hub + FIS Game Day.

> 🎯 **Scenario**: "A bank has promised an RTO of 15 minutes and an RPO of 1 minute and must prove it to regulators. It wants failover to be a controlled procedure rather than a decision made in human panic. Which combination of services?" — Answer: **Aurora Global + Route 53 ARC (Application Recovery Controller) + FIS Game Day + Resilience Hub**. **Route 53 ARC's Routing Controls** turn failover from a simple health-check automatic switch into an **explicit on/off switch (pre-validated by readiness checks)**, so operators make a controlled decision — preventing the situation (flapping) where, during a partial failure, automatic failover ends up killing both sides. When the exam shows "failover as a controlled decision, verifying recovery readiness," it is Route 53 ARC.

## Audit Integrity — Logs Even Operators Cannot Delete

In financial audits, **integrity** comes first. Neither an attacker nor an insider must be able to erase their own tracks. The canonical design is **CloudTrail Organization Trail → S3 in a separate Log Archive account + Object Lock**. The Org Trail automatically collects API calls from all accounts in the organization, placing it in a separate account keeps workload operators from accessing it, and Object Lock fundamentally blocks modification and deletion.

The detection and investigation layers have different roles — **GuardDuty** is threat detection (abnormal API calls, cryptocurrency mining, data exfiltration patterns), **Macie** automatically discovers PII and card data in S3, **Security Hub** consolidates all these findings and automatically checks them against standards such as PCI DSS and CIS, **Detective** traces the root cause of a discovered incident as a graph (which credential did what, and when), and **Audit Manager** automatically collects evidence per PCI and SOX framework to produce audit reports. The exam targets this division of roles — "consolidated checks and standards-compliance dashboard" = Security Hub, "visualizing and investigating an incident's root cause" = Detective, "collecting regulatory framework evidence and audit reports" = Audit Manager, "discovering sensitive data in S3" = Macie.

> ⚠️ **Trap**: Storing CloudTrail in an S3 bucket in the same account and the same Region breaks audit integrity — if that account or Region is compromised, the logs can be tampered with or deleted along with everything else. Also, even with Object Lock turned on, **Governance mode** can be bypassed by privileged users, so regulatory WORM must use **Compliance mode**. When the exam shows "even operators and root must not be able to delete logs," the answer is the combination of a separate Log Archive account + Object Lock **Compliance**.

## Summary

Financial architecture is the full embodiment of defense in depth, where **regulation governs the design** — isolate the CDE with a separate OU/SCP (scope reduction), control FIPS 140-2 Level 3 keys with CMK/CloudHSM/Custom Key Store, inspect traffic centrally with an Inspection VPC + Network Firewall, meet strict RTO/RPO with Aurora/DDB Global, achieve controlled failover and proof with Route 53 ARC + FIS, and ensure audit integrity with a separate Log Archive + Object Lock Compliance. The key insights are (1) the account boundary is the strongest isolation, (2) a CMK is enough for most regulations, and CloudHSM only when single tenancy is explicitly specified, (3) DR is not something you have but something you prove, and (4) audit logs must be untouchable by whoever generates them.

SAP exam mapping: (1) "FIPS 140-2 L3, single tenant, full ownership" → **CloudHSM**, (2) "keys in a dedicated HSM but integrated like KMS" → **KMS Custom Key Store**, (3) "plain CMK required" → **KMS Customer Managed Key**, (4) "IDS/IPS and central inspection of all VPC traffic" → **Inspection VPC + Network Firewall**, (5) "Inspection VPC dropped by asymmetric routing" → **TGW appliance mode**, (6) "PCI DSS consolidated check dashboard" → **Security Hub**, (7) "visualize an incident's root cause" → **Detective**, (8) "regulatory framework evidence and audit reports" → **Audit Manager**, (9) "7-year immutable backup" → **Backup Vault Lock Compliance**, (10) "controlled failover and recovery readiness verification" → **Route 53 ARC**, (11) "regular DR proof" → **FIS Game Day + Resilience Hub**. The next day digs into a completely different load profile — global media streaming with 5 million concurrent viewers.

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