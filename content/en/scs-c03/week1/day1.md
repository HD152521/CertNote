# Day 1 - The Shared Responsibility Model and the 6 SCS-C03 Domains: The Security Engineer's Big Picture

Half of the people preparing for a security certification for the first time think "AWS security = writing good IAM policies." Go in with that mindset and you will crumble in front of SCS-C03's scenario questions. What this exam measures is not policy syntax but a framework of thinking: **"At which layer is this threat stopped, who is responsible, and with which control?"** The two pillars of that framework are the Shared Responsibility Model and the six exam domains.

Today we won't dig deep into any single tool. Instead, we draw the map that shows where every service you will meet over the next 12 weeks belongs. GuardDuty, KMS, IAM, WAF, Macie, Config — once you internalize which "control type at which responsibility boundary" each of these names represents, the correct answers and the trap answers in scenario questions will naturally separate themselves.

## The Shared Responsibility Model: "of the cloud" vs "in the cloud"

AWS's Shared Responsibility Model can be summarized in one sentence. **AWS is responsible for the security "of the cloud"; the customer is responsible for security "in the cloud."** It sounds abstract, but the boundary is surprisingly sharp.

| Responsible party | Scope of responsibility | Examples |
|-----------|----------|------|
| **AWS (of the cloud)** | Hardware, physical facilities, network infrastructure, hypervisor, OS/patching of managed services | Data center access control, EC2 host firmware, S3 durability, RDS engine patching |
| **Customer (in the cloud)** | Data, IAM, OS/network configuration, encryption key management, applications | S3 bucket policies, EC2 guest OS patching, security group rules, KMS key rotation |

The key insight is that this boundary **moves depending on the service type**.

- **IaaS (EC2)**: The customer's responsibility is the largest. Guest OS patching, middleware, and firewalls are all on the customer.
- **PaaS (RDS, Lambda)**: AWS handles OS and runtime patching; the customer is responsible for data, access control, and encryption configuration.
- **SaaS (S3, DynamoDB)**: AWS takes on nearly all the infrastructure; the customer is responsible only for **data classification and access control**. Even so, responsibility for data never shifts to AWS.

> 💡 **Related theory**: This is called the "shifting line of responsibility." Even for the same "patching," OS patching on EC2 is the customer's responsibility, while OS patching on Fargate is AWS's responsibility. Questions on the exam that ask "whose responsibility is it" can almost always be solved by first determining **whether the service is IaaS, PaaS, or SaaS**. An answer choice like "patch the OS of the Lambda function" is a trap — the Lambda runtime OS is patched by AWS.

> ⚠️ **Pitfall**: In an S3 data breach incident, the answer choice "AWS is responsible" is always wrong. S3's durability and availability are AWS's responsibility, but **the configuration that left the bucket open to the public (access control) is 100% the customer's responsibility**. In the Capital One incident (2019), S3 itself was not breached — it was a customer-side IAM/WAF misconfiguration.

## The 3 Types of Controls: Preventive, Detective, Responsive

A security engineer should build the habit of classifying every control into three categories. The domain structure of SCS-C03 itself follows this classification.

| Type | Purpose | Question | AWS examples |
|------|------|------|----------|
| **Preventive** | Keep incidents from happening | "Can we block this action in the first place?" | IAM policies, SCPs, security groups, KMS key policies, WAF |
| **Detective** | Notice what has happened | "Will we know when something goes wrong?" | CloudTrail, GuardDuty, Config, Security Hub, Macie |
| **Responsive (response/recovery)** | Recover quickly after the fact | "How do we respond automatically when an incident occurs?" | EventBridge → Lambda/SSM automated remediation, backup restore |

> 🔍 **Going deeper**: A mature security architecture stacks the three types **in layers (defense in depth)**. If prevention is breached, detection catches it; if detection is slow, response limits the damage. When the exam asks for "the best way to stop this threat," the answer choice that combines "prevention + detection + automated response" is often correct rather than one that picks a single control. However, when the question asks what to do "first/immediately," the answer is usually a preventive control (SCP, key policy).

## The 6 Domains SCS-C03 Measures

The 2024 revision of SCS-C03 has 65 questions, 170 minutes, and a passing score of 750/1000. The exam guide specifies six domains and their weightings.

| # | Domain | Weight | One-line summary |
|---|--------|--------|-----------|
| 1 | **Threat Detection and Incident Response** | 14% | Threat detection with GuardDuty/Detective, incident response playbooks, forensics |
| 2 | **Security Logging and Monitoring** | 18% | Gaining visibility with CloudTrail, Config, CloudWatch, Security Hub |
| 3 | **Infrastructure Security** | 20% | VPC, security groups, NACLs, WAF, Shield, network perimeter defense |
| 4 | **Identity and Access Management** | 16% | IAM, STS, Identity Center, federation, policy evaluation |
| 5 | **Data Protection** | 18% | KMS, encryption, S3 protection, Secrets Manager, certificates |
| 6 | **Management and Security Governance** | 14% | Organizations, SCPs, Control Tower, compliance, multi-account governance |

Looking at the weightings, **Domain 3 (Infrastructure, 20%) + Domain 2 (Logging, 18%) + Domain 5 (Data, 18%)** make up more than half the exam. But Domain 4 (IAM, 16%) is **the prerequisite for all the other domains**. KMS key policies operate on top of IAM evaluation logic, and cross-account logging operates on top of AssumeRole. That is why Week 1 is dedicated entirely to IAM.

> 💡 **Related theory**: The domains are not six subjects to memorize separately but **a single train of thought**. A threat comes in (D1 detection) → for it to be visible you need logs (D2) → the entry path is the network (D3) → inside, permissions are IAM (D4) → what you protect is data (D5) → and all of this is enforced at the organizational level (D6). Scenario questions usually bundle two or three domains together.

## Data Classification and Least Privilege: The Two Root Causes of Security Incidents

When you trace the root causes of security incidents in practice, they almost always come down to two things. One is **failing to classify data**, so no one knew what needed to be protected and how much; the other is **excessive permissions**.

Data classification is the starting point of protective controls. Where are the PII, payment data, and health data? This is why Amazon Macie automatically classifies sensitive data in S3 using ML. Without classification, you cannot answer the question "does this bucket need KMS encryption?"

Least privilege is the heart of Domain 4, but it permeates every domain. Least privilege in KMS key policies, least privilege in S3 bucket policies, least privilege in SCPs. **"Grant explicitly; revoke by default"** is the philosophy of the IAM evaluation logic (we cover this in depth on Day 2).

> 📚 **Case study**: In 2017, numerous companies stored PII in S3 buckets left open with public-read, leading to a string of major breaches (Verizon, Accenture, and others). To stop this pattern, AWS introduced **S3 Block Public Access** in 2018, and since 2023 it has been enabled by default on new buckets. This is a textbook example of governance (Domain 6): "enforcing a preventive control as a platform default."

## Multi-Account and Governance: Security's Blast Radius

The reason a security engineer must move beyond single-account thinking is the **blast radius**. To keep a compromise in one account from spreading to other environments, you use accounts as boundaries.

The standard multi-account security structure looks like this.

```
[ AWS Organizations security baseline structure ]

  Management account (billing + SCP administration, no workloads)
        |
   +----+----+----------------+--------------+
   |         |                |              |
 Security OU  Infrastructure  Workloads OU   Sandbox OU
   |              OU            (Prod/NonProd)
   +-- Log Archive account (immutable storage of CloudTrail/Config logs)
   +-- Audit/Security Tooling account (delegated administrator for GuardDuty/SecurityHub)
```

- **Log Archive account**: Centralizes CloudTrail and Config logs from all accounts, with S3 Object Lock for tamper protection. Humans almost never log in.
- **Security Tooling account**: The **delegated administrator** for GuardDuty, Security Hub, and Detective. All the organization's security signals are viewed in one place.
- **SCPs**: They do not grant permissions but draw an **upper bound (guardrail)** with deny. They apply even to root (with the exception of the management account root).

> 🔍 **Going deeper**: GuardDuty, Security Hub, Macie, and Config all support the "delegated administrator" pattern. The best practice is not to operate them directly from the management account but to **delegate to the Security Tooling account**. The reason is least privilege — the management account should handle only billing and organization management; if you also pile security operations permissions into it, the entire organization collapses when that account is compromised.

## Practice: Mapping Controls to Domains and Types

Let's classify the major services along the two axes we learned today (control type × responsibility boundary). With this table in your head, you can quickly filter the answer choices in scenario questions.

| Service | Domain | Control type | One-line role |
|--------|--------|----------|-----------|
| IAM / SCP | 4, 6 | Preventive | Restrict who can do what |
| KMS | 5 | Preventive | Control data access with encryption keys |
| Security groups / NACLs | 3 | Preventive | Filter network traffic |
| WAF / Shield | 3 | Preventive | Block web attacks and DDoS |
| CloudTrail | 2 | Detective | Audit log of API calls |
| GuardDuty | 1, 2 | Detective | ML-based threat detection |
| Config | 2, 6 | Detective | Evaluate resource configuration compliance |
| Macie | 5, 2 | Detective | Classify sensitive data in S3 |
| Security Hub | 2, 1 | Detective | Aggregate security findings, standards checks |
| EventBridge + SSM/Lambda | 1 | Responsive | Automated remediation |

> 🎯 **Scenario**: "We found out after the fact that PII was stored unencrypted in an S3 bucket. What combination of controls prevents recurrence?" There is no single answer. **Detection** (discover sensitive data with Macie + Config rule `s3-bucket-server-side-encryption-enabled`) + **prevention** (block unencrypted PutObject with an SCP, S3 Block Public Access) + **response** (EventBridge → Lambda for automatic encryption/quarantine). Thinking of all three types at once is the SCS-C03 way of thinking.

## Wrapping Up — The Map Ahead

Engrave the three pictures we drew today. First, in the **Shared Responsibility Model**, the line of responsibility moves with the service type (IaaS/PaaS/SaaS), and data and access control are the customer's responsibility in every case. Second, every control is classified into the three types — **preventive, detective, responsive** — and a mature architecture stacks all three in layers. Third, the **six domains** are not subjects to memorize separately but a single chain of thought flowing from threat → visibility → network → identity → data → governance.

Starting tomorrow, we go into IAM, the spine of that chain. Once you dig into what users, groups, roles, and policies are, and exactly how the evaluation logic that decides whether AWS allows or denies a request works, you will start to see that every other domain is built on top of that structure.

---

## 📝 연습 문제

**문제 1.** A company is using Amazon RDS for PostgreSQL. Under the Shared Responsibility Model, which of the following falls under **AWS's responsibility**?

A) Classifying the PII stored in the database and deciding whether to enable encryption  
B) Configuring database user accounts and IAM authentication policies  
C) Applying security patches to the database engine  
D) Restricting access to the DB port with security groups  

**정답: C**  
해설: Because RDS is a managed (PaaS) service, patching the engine and OS is AWS's responsibility (the customer only manages the maintenance window). Data classification and the decision to enable encryption, DB users/IAM authentication, and security group configuration are all "in the cloud" customer responsibilities. The key point is that responsibility for data and access control never shifts to AWS under any service type.

---

**문제 2.** Which of the following is **not** a preventive control?

A) Using an SCP to deny running EC2 outside specific regions  
B) Using a KMS key policy to allow decryption only for specific accounts  
C) Using GuardDuty to detect anomalous API call patterns  
D) Using a security group to allow inbound traffic only on 443  

**정답: C**  
해설: GuardDuty is a detective control that notices threats that have already occurred (or are in progress). SCPs, KMS key policies, and security groups are all preventive controls that block an action before it happens. The core of control-type classification is that "detection" cannot prevent an incident — it can only notice it — and when the exam asks for "the first way to stop an incident," a preventive control is the answer.

---

**문제 3.** Which combination correctly pairs the highest-weighted SCS-C03 domain with a topic that domain covers?

A) Identity and Access Management — KMS key rotation policies  
B) Infrastructure Security — network perimeter defense such as VPCs, security groups, and WAF  
C) Data Protection — organizational governance with Organizations SCPs  
D) Threat Detection and Incident Response — CloudTrail log retention policies  

**정답: B**  
해설: The highest-weighted domain is Infrastructure Security (20%), which covers network perimeter defense such as VPCs, security groups, NACLs, WAF, and Shield. KMS belongs to Data Protection, SCPs to Management and Governance, and CloudTrail retention to Logging and Monitoring, so the other choices mismatch domain and topic.

---

**문제 4.** When operating GuardDuty and Security Hub in a multi-account environment, which is the most appropriate AWS best practice?

A) Operate GuardDuty and Security Hub directly from the management account  
B) Have each workload account enable GuardDuty independently and manage it individually  
C) Designate a separate Security Tooling account as the delegated administrator to aggregate the entire organization  
D) Operate GuardDuty from the Log Archive account to keep logs and detection in one place  

**정답: C**  
해설: GuardDuty, Security Hub, Macie, and Config support the delegated administrator pattern, and delegating to a dedicated Security Tooling account is the best practice. The management account should handle only billing and organization management to keep the blast radius small, and per-workload-account operation fragments visibility. The Log Archive account is dedicated to immutable log storage, so security operations tooling does not belong there.

---

**문제 5.** An incident occurs in which PII in an S3 bucket is exposed externally. The investigation finds the bucket was configured as public-read. From the Shared Responsibility Model perspective, which judgment is most accurate?

A) The S3 infrastructure was breached, so it is AWS's responsibility  
B) Bucket access control configuration is the customer's responsibility, so it is a customer misconfiguration  
C) It is a data durability issue, so AWS and the customer split responsibility equally  
D) S3 is SaaS, so all data protection responsibility lies with AWS  

**정답: B**  
해설: S3's durability, availability, and physical infrastructure are AWS's responsibility, but access control configuration such as bucket policies, ACLs, and Block Public Access is 100% the customer's responsibility. Even for a strongly SaaS-like service such as S3, responsibility for data classification and access control never shifts to AWS. To prevent this kind of incident, AWS evolved toward enforcing Block Public Access as a default control.

---
