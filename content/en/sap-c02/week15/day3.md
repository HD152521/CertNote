# Day 3 - Finance: Regulation, Auditing, Isolation, DR - The History of PCI DSS, the Cryptography of HSMs and Key Hierarchies, and Defense in Depth in Isolation Architecture

In 2008, the payment processor **Heartland Payment Systems** had about 130 million card records stolen - the largest ever at the time. The attackers got in with SQL injection, planted a sniffer on the network, and for months siphoned off **card data that was flowing across the network unencrypted**. This incident accelerated the tightening of PCI DSS (the Payment Card Industry Data Security Standard) and made "encryption in transit and at rest" and "isolation of the cardholder data environment (CDE)" absolute norms. This is why financial architecture is fundamentally different from other domains - **regulation governs design.** Isolation, encryption, and audit integrity come before availability and cost.

Today's scenario is a global bank. PCI DSS and SOX compliance, RTO of 15 minutes and RPO of 1 minute, 7-year WORM retention of transaction data, and all keys self-managed. For the SAA it would be "turn on encryption and take backups," but the Pro demands the whole of defense in depth: **isolating the CDE in a separate OU, controlling keys with FIPS 140-2 Level 3 HSMs, inspecting all traffic in an Inspection VPC, and making audit logs impossible to delete even for operators.** Today we take apart in depth what PCI DSS enforces, the key-hierarchy cryptography of HSM and KMS, and each layer of the isolation architecture.

## PCI DSS - The Isolation That 12 Requirements Create

**PCI DSS (Payment Card Industry Data Security Standard)** is a card data protection standard jointly established by Visa, Mastercard, and others in 2004, composed of 12 requirements. The core concept is the **CDE (Cardholder Data Environment)** - the boundary of the systems that store, process, or transmit card data. PCI DSS's most powerful strategy is **scope reduction**. The more strongly you isolate the CDE from the rest of the systems, the smaller the audit target (scope) becomes, and cost and risk fall together.

This is the combination of the **Defense in Depth** principle and **segmentation** in security. PCI DSS explicitly recognizes that isolating the CDE with network segmentation can reduce the audit scope. The canonical way to implement this on AWS is to **isolate the CDE in a separate account/OU** - since the account boundary is the strongest isolation, an SCP on the CDE account blocks, at the source, actions involving PII and card data from non-CDE accounts. This matches exactly what NIST SP 800-53's SC-7 (boundary protection) and AC-4 (information flow enforcement) require. On the exam, when you see "isolate the cardholder data environment from the rest," a separate OU + SCP is the signal for the correct answer.

PCI DSS says that when you store a **card number (PAN), you must make it unreadable with one of encryption, tokenization, or hashing**, and it states flatly that **the CVV must never be stored after authorization**. So the practical pattern is **tokenization** - replace the real card number with a meaningless token so that systems outside the CDE handle only tokens, and those systems fall out of the CDE scope (scope reduction). On AWS, you put a payment tokenization service or a separate token vault inside the CDE, and the rest of the apps see only tokens. On the exam, when you see "minimize the number of systems that handle card numbers," tokenization + CDE isolation is the key.

## HSM and KMS - The Cryptography of Key Hierarchies

"All keys self-managed" and "FIPS 140-2 Level 3" are requirements that go beyond simple encryption. To understand them you need to know AWS's **key hierarchy** and what an HSM means.

Encryption is usually done with **envelope encryption** - data is encrypted with a **data key (DEK)**, and that DEK is in turn encrypted with a **master key (CMK/KEK)** and stored. To read data, you decrypt the DEK with the CMK and then decrypt the data with the decrypted DEK. The key point is that **the CMK never leaves the HSM in plaintext**.

**FIPS 140-2 (NIST's security standard for cryptographic modules)** grades cryptographic modules from Level 1 to 4. Level 2 requires physical tamper evidence, and **Level 3 requires automatic key erasure on tampering (tamper-response) and identity-based authentication**. KMS's shared HSMs are FIPS 140-2 Level 3 validated, and **CloudHSM provides single-tenant dedicated HSMs at Level 3**. The difference is **tenancy and control** - KMS is an AWS-managed multi-tenant HSM, and CloudHSM is an HSM the customer owns exclusively and controls completely. On the exam, when you see "FIPS 140-2 Level 3 + single tenant + full key control," it is CloudHSM, and if it is "managed + integration convenience," it is KMS.

| Option | Tenancy | Key control | FIPS | Use |
|------|--------|---------|------|------|
| **KMS (AWS managed key)** | Multi | AWS | L3 (HSM) | Default encryption |
| **KMS (Customer managed CMK)** | Multi | Customer (policy, rotation) | L3 | Most regulatory requirements |
| **KMS Custom Key Store** | Single (CloudHSM backend) | Customer | L3 | KMS convenience + HSM control |
| **CloudHSM** | Single | Customer fully | L3 | PINs, master keys, full ownership |

**KMS Custom Key Store** is the bridge between two worlds - you use KMS's convenient API and service integrations as they are, while the actual key material is kept in the customer's own CloudHSM cluster. So it satisfies the regulatory requirement "we want KMS's integration convenience, but the keys must be in our HSM" at the same time. Pure CloudHSM must be handled directly through standard interfaces such as PKCS#11 and JCE, so integration is cumbersome. On the exam, when you see "keep the keys in a dedicated HSM but use them like KMS for S3, EBS, and RDS encryption," Custom Key Store is the answer.

> ⚠️ **Pitfall**: Memorizing "self-managed keys = always CloudHSM" is over-engineering. Most regulations (including PCI and SOX) are sufficiently satisfied by a **Customer Managed Key (CMK)** - because the customer controls the key policy, rotation, and access auditing. CloudHSM is truly needed when (1) FIPS 140-2 Level 3 single tenancy is specified by contract or regulation, (2) the key can never be shared with AWS, or (3) HSM-specific features such as PINs and master keys are needed. On the exam, if it is simply "CMK required," it is a KMS CMK, and if "single-tenant HSM, full ownership" is specified, it is CloudHSM.

## Isolated Network - Inspection VPC and Central Inspection

Finance requires "inspect all traffic." The pattern that implements this is **Transit Gateway + Inspection VPC + Network Firewall**. All spoke VPC and on-premises traffic goes through the TGW and converges in a central Inspection VPC, where **AWS Network Firewall** performs IDS/IPS, domain filtering, and TLS inspection before the traffic is routed on to its destination.

Network Firewall's engine uses the rule syntax of the open-source IDS/IPS **Suricata** as is - so the existing security team's Suricata signatures can be reused. This centralized inspection model is the network design **hub-and-spoke + service insertion** pattern, forcing all east-west (VPC-to-VPC) and north-south (internet) traffic through a single inspection point. It is easier to operate, keep consistent, and audit than distributed firewalls (separate in each VPC). It implements the WA Security pillar's "apply protection at all layers" and NIST SC-7 (boundary protection) through centralization. On the exam, when you see "IDS/IPS and inspect all VPC traffic in one place," it is Inspection VPC + Network Firewall.

The mechanism by which the TGW diverts traffic to the Inspection VPC is the **intentionally asymmetric design of the TGW route tables**. The spoke VPCs' TGW route table sends all destinations (including 0.0.0.0/0) to the Inspection VPC attachment, and the Inspection VPC, after inspection, returns the traffic to the appropriate destination route table - you must turn on **appliance mode** so that both directions of packets in the same flow go to the same Network Firewall endpoint (AZ) and stateful inspection is not broken. On the exam, when you see "it is an Inspection VPC but connections drop because of asymmetric routing," a missing TGW appliance mode is the cause.

The 2017 **Equifax breach** (about 147 million people's Social Security numbers and credit information) was caused by failing to patch a known Apache Struts vulnerability (CVE-2017-5638), and after getting in, the attackers accessed **unencrypted credentials and plaintext data** and siphoned data for months without being detected. The lesson is multi-layered - (1) vulnerability management (automatic scanning with Inspector), (2) network segmentation (blocking lateral movement even after intrusion), (3) anomaly detection (spotting abnormal data exfiltration with GuardDuty), (4) audit visibility. It was not any single layer but the whole of defense in depth that collapsed. On the exam, when you see "detect lateral movement and data exfiltration after intrusion," think of the combination of Network Firewall + GuardDuty + segmentation.

## DR - A Strict RTO of 15 Minutes and RPO of 1 Minute

An RTO of 15 minutes and an RPO of 1 minute are very strict. An RPO of 1 minute (actually under 1 second) is satisfied by **Aurora Global Database** (storage-level asynchronous, usually an RPO under 1 second) or **DynamoDB Global Tables** (multi-master, effectively an RPO of about 0). An RTO of 15 minutes requires always-on operation at the Warm Standby or Active-Active level. For backups, you apply WORM with **AWS Backup Cross-Region + Vault Lock Compliance for 7 years**.

In financial DR, **verifying the RTO/RPO** is itself a regulatory requirement. **FFIEC** (the Federal Financial Institutions Examination Council in the US) guidance and the Basel operational risk framework require not merely "having" DR but **testing it periodically to prove it**. That is where **AWS Resilience Hub** (assessing actual resilience against the RTO/RPO policy) and **AWS FIS (Fault Injection Service)**-based Game Days (verifying recovery through deliberate fault injection) come in. This is **Chaos Engineering** - the field popularized by Netflix in 2011 with Chaos Monkey, which "deliberately causes failures to prove the system withstands them." On the exam, when you see "prove and regularly verify DR," it is Resilience Hub + FIS Game Day.

> 🎯 **Scenario**: "A bank has promised an RTO of 15 minutes and an RPO of 1 minute and must prove this to the regulator. It wants to make the failover decision a controlled procedure rather than human panic. What combination of services?" - Answer: **Aurora Global + Route 53 ARC (Application Recovery Controller) + FIS Game Day + Resilience Hub**. **Route 53 ARC's Routing Control** turns failover into **an explicit on/off switch (pre-verified by readiness checks)** rather than a simple health-check automatic switchover, letting the operator make a controlled decision - it prevents the situation (flapping) in which an automatic failover during a partial failure ends up killing both sides. On the exam, when you see "failover as a controlled decision, verify recovery readiness," it is Route 53 ARC.

## Audit Integrity - Logs Even Operators Cannot Delete

In financial auditing, **integrity** comes first. An intruder or insider must not be able to erase their own traces. The canonical answer is **CloudTrail Organization Trail → S3 with Object Lock in a separate Log Archive account**. The Org Trail automatically collects API calls from all accounts in the organization, putting it in a separate account makes it inaccessible to workload operators, and Object Lock seals off modification and deletion at the source.

The detection and investigation layers have different roles - **GuardDuty** is threat detection (abnormal API calls, cryptocurrency mining, data exfiltration patterns), **Macie** automatically discovers PII and card data in S3, **Security Hub** consolidates all of these findings and automatically checks against standards like PCI DSS and CIS, **Detective** traces the root cause of a discovered incident as a graph (which credential did what and when), and **Audit Manager** automatically collects evidence per framework such as PCI and SOX to produce audit reports. The exam targets this division of roles - "integrated checks, standards-compliance dashboard" = Security Hub, "visualizing and investigating an incident's root cause" = Detective, "collecting regulatory framework evidence, audit reports" = Audit Manager, "discovering sensitive data in S3" = Macie.

> ⚠️ **Pitfall**: If you store CloudTrail in an S3 bucket in the same account and the same Region, audit integrity breaks - if that account or Region is compromised, the logs can be tampered with or deleted along with it. Also, even with Object Lock turned on, **Governance mode** can be bypassed by privileged users, so for regulatory WORM it must be **Compliance mode**. On the exam, when you see "even operators and root must not be able to delete the logs," it is the combination of a separate Log Archive account + Object Lock **Compliance**.

## Wrap-Up

Financial architecture is the whole of defense in depth where **regulation governs design** - isolate the CDE with a separate OU/SCP (scope reduction), control FIPS 140-2 Level 3 keys with CMK/CloudHSM/Custom Key Store, centrally inspect traffic with an Inspection VPC + Network Firewall, meet strict RTO/RPO with Aurora/DDB Global, achieve controlled failover and proof with Route 53 ARC + FIS, and ensure audit integrity with a separate Log Archive + Object Lock Compliance. The key insights are (1) the account boundary is the strongest isolation, (2) a CMK is enough for most regulations, and CloudHSM only when single tenancy is specified, (3) DR is not something you have but something you prove, and (4) audit logs must be untouchable by whoever generates them.

SAP exam mapping: (1) "FIPS 140-2 L3, single tenant, full ownership" → **CloudHSM**, (2) "keys in a dedicated HSM but integrated like KMS" → **KMS Custom Key Store**, (3) "simple CMK required" → **KMS Customer Managed Key**, (4) "IDS/IPS and central inspection of all VPC traffic" → **Inspection VPC + Network Firewall**, (5) "Inspection VPC asymmetric routing disconnects" → **TGW appliance mode**, (6) "PCI DSS integrated check dashboard" → **Security Hub**, (7) "visualize an incident's root cause" → **Detective**, (8) "regulatory framework evidence, audit reports" → **Audit Manager**, (9) "7-year immutable backups" → **Backup Vault Lock Compliance**, (10) "controlled failover, verify recovery readiness" → **Route 53 ARC**, (11) "regularly prove DR" → **FIS Game Day + Resilience Hub**. The next day digs into a completely different load profile - global media streaming with 5 million concurrent viewers.

---

## 📝 Practice Questions

**Question 1.** A bank must fully own and control its payment keys on FIPS 140-2 Level 3-certified **single-tenant** hardware and never share them with AWS. It also needs HSM-specific features such as PINs and master keys. What is the most suitable?

A) KMS AWS managed key

B) CloudHSM

C) KMS Customer managed CMK (shared HSM)

D) Secrets Manager

**Answer: B**

Explanation: CloudHSM is a **single-tenant HSM owned exclusively by the customer** that provides FIPS 140-2 Level 3, lets you handle HSM-specific features such as PINs and master keys directly, and does not share keys with AWS. KMS in A and C is an AWS-managed **multi-tenant** shared HSM and falls short of the "single tenant, full ownership" requirement (even for the CMK in C, the customer controls the key policy but the HSM itself is shared). Secrets Manager in D is a secret store, not an HSM. Pitfall: if it is simply "CMK required," it is a KMS CMK, but if "single tenant, full HSM ownership" is specified, it is CloudHSM.

---

**Question 2.** A financial company wants to keep its key material in its own CloudHSM cluster while using KMS's standard integrations as they are for S3, EBS, and RDS encryption. What is the most suitable configuration?

A) Call pure CloudHSM directly via PKCS#11

B) KMS Custom Key Store (CloudHSM backend)

C) KMS AWS managed key

D) SSE-S3 on each service

**Answer: B**

Explanation: **KMS Custom Key Store** uses KMS's convenient API and service integrations as they are (KMS encryption for S3, EBS, and RDS) while keeping the actual key material in the **customer-owned CloudHSM cluster** - it satisfies "keys in our HSM, usage like KMS" at the same time. Pure CloudHSM in A must be handled directly via PKCS#11/JCE and cannot use the KMS integration convenience of S3 and RDS. In C the key is in an AWS-managed HSM. D uses AWS-owned keys, so it is not self-managed. Pitfall: "a dedicated HSM + KMS integration convenience at the same time" is Custom Key Store.

---

**Question 3.** A bank wants to perform IDS/IPS, domain filtering, and TLS inspection on all spoke VPC and on-premises traffic in one place. What is the most suitable pattern?

A) An individual WAF on each VPC

B) Transit Gateway + Inspection VPC + AWS Network Firewall

C) A NACL on each subnet

D) Enable only GuardDuty

**Answer: B**

Explanation: **TGW + Inspection VPC + Network Firewall** is a hub-and-spoke service insertion pattern that forces all east-west and north-south traffic through a central inspection point. Network Firewall performs Suricata-based IDS/IPS, domain filtering, and TLS inspection. The WAF in A is limited to L7 HTTP protection and cannot inspect all VPC-to-VPC traffic. The NACL in C is simple allow/deny and is not IDS/IPS. GuardDuty in D is detection (analysis), not inline traffic inspection or blocking. Pitfall: "central IDS/IPS for all VPC traffic" is Inspection VPC + Network Firewall.

---

**Question 4.** You built an Inspection VPC, but the request and response of the same connection go to firewall endpoints in different AZs, breaking state tracking and dropping the connection. What is the most accurate cause and fix?

A) A Network Firewall rule error - rewrite the rules

B) TGW appliance mode is not enabled - turn on appliance mode

C) Security groups are not set - add an SG

D) A Region failure - move to another Region

**Answer: B**

Explanation: A TGW can by default distribute AZs per flow, so with a stateful firewall, if the two directions of packets of the same connection go to endpoints in different AZs, state tracking breaks. Turning on **appliance mode** on the TGW attachment pins all packets of the same flow to the same endpoint (AZ), so stateful inspection works correctly. A and C are unrelated to the symptom of asymmetric routing, and D is an excessive response. Pitfall: "Inspection VPC asymmetric routing disconnects" is a missing appliance mode.

---

**Question 5.** You want to investigate a discovered security incident by tracing and visualizing its root cause as a graph of "which credential did what and when." What is the most suitable service?

A) Security Hub

B) Amazon Detective

C) Audit Manager

D) Macie

**Answer: B**

Explanation: **Detective** connects CloudTrail, VPC Flow Logs, and GuardDuty data into a graph model and specializes in visually tracing and investigating an incident's root cause and chain of actions (which principal did what and when). Security Hub in A consolidates findings and checks them against standards (a dashboard) but is not a root-cause graph investigation. Audit Manager in C is for collecting regulatory framework evidence and audit reports. Macie in D is for discovering sensitive data in S3. Pitfall: "visualize and investigate an incident's root cause" is Detective.

---

**Question 6.** A bank has promised an RTO of 15 minutes and an RPO of 1 minute, and wants to run failover not as an automatic health check but as a **pre-verified control switch** to prevent both sides from dying during a partial failure. What is the most suitable service?

A) Simple Route 53 Failover Routing

B) Route 53 Application Recovery Controller (ARC)

C) Auto Scaling

D) CloudWatch Alarm

**Answer: B**

Explanation: **Route 53 ARC's** Routing Control turns failover into an explicit on/off switch and pre-verifies the recovery readiness of the target Region with Readiness Checks - the operator makes a controlled decision, preventing the flapping in which an automatic failover kills both sides during a partial failure. Simple Failover Routing in A is a health-check-based automatic switchover, so control and pre-verification are weak. C and D are not failover decision mechanisms. Pitfall: "controlled failover, verify recovery readiness" is Route 53 ARC.

---

**Question 7.** You want to retain transaction audit logs for 7 years so that no one (including operators and root) can modify or delete them, and so that workload operators cannot access the log store at all. What is the most suitable design?

A) S3 in the same account + Versioning

B) S3 in a separate Log Archive account + Object Lock Compliance + CloudTrail Org Trail

C) S3 in the same account + Object Lock Governance

D) CloudWatch Logs retention of 7 years

**Answer: B**

Explanation: The **CloudTrail Organization Trail** collects API calls from the whole organization, and putting it in S3 in a **separate Log Archive account** means workload operators have no access to that account and cannot touch the logs (account isolation). **Object Lock Compliance** mode prevents even root from modifying or deleting within the retention period. Versioning in A cannot prevent deletion itself, and Governance in C can be bypassed by privileged users, falling short of the "not even root" requirement, and since it is the same account it also fails to block operator access. D is not a WORM guarantee. Pitfall: "not possible for operators or root" is a separate account + Object Lock Compliance.

---
