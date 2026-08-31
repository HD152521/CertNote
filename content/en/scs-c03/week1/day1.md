# Day 1 - Shared Responsibility Model and SCS-C03's 6 Domains: The Big Picture for Security Engineers

Half of those starting AWS security certification for the first time think "AWS security = writing IAM policies well." If you go in with that mindset, you'll crumble facing SCS-C03's scenario questions. What this exam measures is not policy syntax, but **"at which layer does this threat lie, who is responsible, and what control blocks it?"** — a framework of thinking. The two pillars of that framework are the Shared Responsibility Model and the 6 exam domains.

Today we don't dig deep into any single tool. Instead, we draw a map to understand where every service you'll encounter over the next 12 weeks fits. GuardDuty, KMS, IAM, WAF, Macie, Config — once you grasp that each of these names represents "what kind of control at which responsibility boundary," the correct answers and trap answers in scenario questions will naturally diverge.

## Shared Responsibility Model: "of the cloud" vs "in the cloud"

AWS's Shared Responsibility Model can be summed in one sentence: **AWS is responsible for the security "of the cloud" (infrastructure), and customers are responsible for security "in the cloud" (their data and configurations).** It sounds abstract, but the boundary line is surprisingly sharp.

| Responsible Party | Scope of Responsibility | Examples |
|-----------|----------|------|
| **AWS (of the cloud)** | Hardware, physical facilities, network infrastructure, hypervisor, OS/patching of managed services | Data center access control, EC2 host firmware, S3 durability, RDS engine patching |
| **Customer (in the cloud)** | Data, IAM, OS·network configuration, encryption key management, applications | S3 bucket policies, EC2 guest OS patching, security group rules, KMS key rotation |

The key insight is that this boundary **moves depending on service type**.

- **IaaS (EC2)**: Customer responsibility is largest. Guest OS patching, middleware, firewalls — all customer's responsibility.
- **PaaS (RDS, Lambda)**: AWS owns OS·runtime patching; customer owns data, access control, and encryption configuration.
- **SaaS (S3, DynamoDB)**: AWS owns almost all infrastructure; customer owns only **data classification and access control**. Yet data responsibility never passes to AWS.

> 💡 **Related Theory**: This is called the "shifting line of responsibility." The same "patching" means EC2 OS patching is customer responsibility, but Fargate OS patching is AWS responsibility. In exam questions asking "whose responsibility," almost always the first step is to determine **whether the service is IaaS/PaaS/SaaS**. A trap answer like "patch the Lambda function's OS" — Lambda runtime OS is patched by AWS.

> ⚠️ **Trap**: In S3 data breach cases, "AWS is responsible" is always wrong. S3 durability and availability are AWS responsibility, but **setting the bucket to public (access control) is 100% customer responsibility**. The Capital One incident (2019) wasn't S3 itself being breached — it was customer-side IAM and WAF misconfiguration.

## Three Types of Controls: Preventive, Detective, Responsive

Security engineers must develop the habit of classifying all controls into three categories. SCS-C03's domain structure itself follows this classification.

| Type | Purpose | Question | AWS Example |
|------|------|------|----------|
| **Preventive** | Prevent incidents from happening | "Can we block this action from the start?" | IAM policies, SCP, security groups, KMS key policies, WAF |
| **Detective** | Detect what has happened | "Can we notice anomalies?" | CloudTrail, GuardDuty, Config, Security Hub, Macie |
| **Responsive** | Recover quickly after incidents | "How do we auto-respond to incidents?" | EventBridge → Lambda/SSM auto-remediation, backups |

> 🔍 **Deep Dive**: Mature security architecture stacks these three types **in layers (defense in depth)**. When prevention fails, detection catches it; when detection is slow, response mitigates damage. In exam scenarios asking "the best way to prevent this threat," answers combining "preventive + detective + auto-response" are often correct rather than single controls. However, when asking "first/immediate," preventive controls (SCP, key policies) are usually the answer.

## SCS-C03's 6 Domains Being Measured

The updated SCS-C03 (2024) has 65 questions, 170 minutes, and 750/1000 passing score. The exam blueprint specifies 6 domains and weightings.

| # | Domain | Weight | One-Line Summary |
|---|--------|--------|-----------|
| 1 | **Threat Detection and Incident Response** | 14% | Detect threats with GuardDuty·Detective, incident response playbooks, forensics |
| 2 | **Security Logging and Monitoring** | 18% | Gain visibility with CloudTrail·Config·CloudWatch·Security Hub |
| 3 | **Infrastructure Security** | 20% | Defend network boundaries with VPC·security groups·NACL·WAF·Shield |
| 4 | **Identity and Access Management** | 16% | IAM·STS·Identity Center·federation·policy evaluation |
| 5 | **Data Protection** | 18% | KMS·encryption·S3 protection·Secrets Manager·certificates |
| 6 | **Management and Security Governance** | 14% | Organizations·SCP·Control Tower·compliance·multi-account governance |

Looking at weights, **Domain 3 (infrastructure 20%) + Domain 2 (logging 18%) + Domain 5 (data 18%)** make up more than half the exam. But Domain 4 (IAM 16%) is **the prerequisite for all other domains**. KMS key policies operate on top of IAM evaluation logic, and cross-account logging works on top of AssumeRole. That's why Week 1 is entirely dedicated to IAM.

> 💡 **Related Theory**: The domains aren't 6 separate subjects to memorize — they're **one flow of thinking**. A threat arrives (D1 detect) → to see it, logs must exist (D2) → the entry point is the network (D3) → authorization inside is IAM (D4) → the protected asset is data (D5) → enforce all of this at organizational level (D6). Scenario questions usually bundle 2-3 domains together.

## Data Classification and Least Privilege: Two Starting Points of Security Incidents

In real operations, when you trace root causes of security incidents, they almost always come down to two things. One is **data that was never classified** — not knowing what or how much needs protection. The other is **excessive permissions**.

Data classification is the starting point of protective controls. Where are PII, payment information, health data? That's why Amazon Macie automatically classifies sensitive S3 data using ML. Without classification, you can't answer "does this bucket need KMS encryption?"

Least privilege is the heart of Domain 4 but permeates all domains. Least privilege in KMS key policies, S3 bucket policies, SCP. **"Grant permissions explicitly, revoke by default"** is the philosophy of IAM evaluation logic (we'll explore this deeply on Day 2).

> 📚 **Case Study**: In 2017, multiple companies storing PII in public-read S3 buckets led to large breaches (Verizon, Accenture, etc.). AWS introduced **S3 Block Public Access** in 2018 to stop this pattern, and since 2023 it's enabled by default on new buckets. This exemplifies "enforcement of preventive controls as platform defaults" in governance (Domain 6).

## Multi-Account and Governance: Blast Radius of Security

Why security engineers must move beyond single-account thinking is **blast radius**. If one account is compromised, you want it not to spread to other environments — accounts themselves become a boundary.

Standard multi-account security structure looks like this:

```
[ AWS Organizations Security Foundation ]

  Management Account (billing + SCP management, workload forbidden)
        |
   +----+----+----------------+--------------+
   |         |                |              |
 Security OU  Infrastructure  Workloads OU   Sandbox OU
   |              OU            (Prod/NonProd)
   +-- Log Archive Account (CloudTrail/Config logs immutable storage)
   +-- Audit/Security Tooling Account (GuardDuty·SecurityHub delegated administrator)
```

- **Log Archive Account**: Centralize CloudTrail·Config logs from all accounts; S3 Object Lock prevents tampering. Almost no one logs in here.
- **Security Tooling Account**: **Delegated administrator** for GuardDuty·Security Hub·Detective. See all organization security signals in one place.
- **SCP**: Doesn't grant permissions but **draws upper guardrails with deny**. Applies even to root (except management account root).

> 🔍 **Deep Dive**: GuardDuty, Security Hub, Macie, Config all support "delegated administrator" pattern. Don't operate directly from the management account — **delegate to Security Tooling Account**. This is best practice for least privilege — management account only does billing and org management; adding security operations authority there means when that account is compromised, the entire organization falls.

## Mapping Controls to Domain and Type

Practice classifying key services by the two axes you learned today (control type × responsibility boundary). When you have this table in mind, you can quickly filter trap answers in scenario questions.

| Service | Domain | Control Type | One-Line Role |
|--------|--------|----------|-----------|
| IAM / SCP | 4, 6 | Preventive | Restrict who can do what |
| KMS | 5 | Preventive | Control data access with encryption keys |
| Security Groups / NACL | 3 | Preventive | Filter network traffic |
| WAF / Shield | 3 | Preventive | Block web attacks·DDoS |
| CloudTrail | 2 | Detective | Audit log of API calls |
| GuardDuty | 1, 2 | Detective | ML-based threat detection |
| Config | 2, 6 | Detective | Assess resource compliance |
| Macie | 5, 2 | Detective | Classify sensitive S3 data |
| Security Hub | 2, 1 | Detective | Aggregate findings·run standard checks |
| EventBridge + SSM/Lambda | 1 | Responsive | Auto-remediation |

> 🎯 **Scenario**: "PII in S3 bucket found stored without encryption. What control combination prevents recurrence?" Not a single answer. **Detective** (Macie finds sensitive data + Config rule `s3-bucket-server-side-encryption-enabled`) + **Preventive** (SCP blocks unencrypted PutObject, S3 Block Public Access) + **Responsive** (EventBridge → Lambda auto-encrypt/quarantine). Thinking of all three types at once is how SCS-C03 thinks.

## Summary — The Map Ahead

Remember three pictures we drew today. First, **the Shared Responsibility Model** has a moving boundary depending on service type (IaaS/PaaS/SaaS), but data and access control are always customer responsibility. Second, all controls fall into **three types — preventive, detective, responsive** — and mature architecture stacks them in layers. Third, **the 6 domains** aren't separate subjects to memorize but flow from threat → visibility → network → identity → data → governance — one chain of thinking.

Starting tomorrow, we enter IAM, the spine of that chain. Once you understand what users, groups, roles, and policies are, and exactly how AWS's evaluation logic decides whether to allow or deny a request, you'll start seeing how every other domain rests on top of that foundation.

---

## 📝 Practice Questions

**Question 1.** A company is using Amazon RDS for PostgreSQL. Under the shared responsibility model, which of the following is **AWS's responsibility**?

A) Classifying the PII stored in the database and deciding whether to enable encryption  
B) Configuring database user accounts and IAM authentication policies  
C) Applying security patches to the database engine  
D) Restricting access to the DB port with a security group  

**Answer: C**  
Explanation: RDS is a managed (PaaS) service, so AWS is responsible for patching the engine and the OS (the customer only manages the maintenance window). Data classification, whether encryption is enabled, DB users and IAM authentication, and security group settings are all customer responsibilities "in the cloud." The key point is that responsibility for data and access control never transfers to AWS, no matter the service type.

---

**Question 2.** Which of the following is **not** a preventive control?

A) Using an SCP to deny EC2 launches outside a specific Region  
B) Using a KMS key policy to allow decryption only from specific accounts  
C) Using GuardDuty to detect anomalous API call patterns  
D) Using a security group to allow inbound traffic on 443 only  

**Answer: C**  
Explanation: GuardDuty is a detective control that notices threats that have already happened (or are in progress). SCPs, KMS key policies, and security groups are all preventive controls that block an action before it occurs. The distinction — detection does not stop an incident, it only notices one — is the heart of control-type classification, and when the exam asks for "the way to stop the incident first," the answer is a preventive control.

---

**Question 3.** Which combination correctly pairs the highest-weighted SCS-C03 domain with the topics it covers?

A) Identity and Access Management — KMS key rotation policies  
B) Infrastructure Security — network perimeter defense such as VPC, security groups, and WAF  
C) Data Protection — organizational governance with Organizations SCPs  
D) Threat Detection and Incident Response — CloudTrail log retention policies  

**Answer: B**  
Explanation: The highest-weighted domain is Infrastructure Security (20%), and it covers network perimeter defense such as VPC, security groups, NACLs, WAF, and Shield. KMS belongs to Data Protection, SCPs to Management and Governance, and CloudTrail retention to Logging and Monitoring — so in every other option the domain and the topic are mismatched.

---

**Question 4.** When operating GuardDuty and Security Hub in a multi-account environment, which is the most appropriate AWS best practice?

A) Operate GuardDuty and Security Hub directly from the management account  
B) Have each workload account enable and manage GuardDuty independently  
C) Designate a separate Security Tooling account as the delegated administrator and aggregate across the whole organization  
D) Operate GuardDuty from the Log Archive account so that logs and detection live in one place  

**Answer: C**  
Explanation: GuardDuty, Security Hub, Macie, and Config all support the delegated administrator pattern, and delegating to a dedicated Security Tooling account is the best practice. The management account should handle only billing and organization management so that the blast radius stays small, and running detection per workload account fragments visibility. The Log Archive account is reserved for immutable log storage, so security operations tooling does not belong there.

---

**Question 5.** PII in an S3 bucket was leaked externally. The investigation found that the bucket had been set to public-read. From the perspective of the shared responsibility model, which judgment is most accurate?

A) The S3 infrastructure was breached, so this is AWS's responsibility  
B) Bucket access control settings are the customer's responsibility, so this is a customer misconfiguration  
C) This is a data durability problem, so AWS and the customer share responsibility equally  
D) S3 is SaaS, so all data protection responsibility lies with AWS  

**Answer: B**  
Explanation: Durability, availability, and physical infrastructure for S3 are AWS's responsibility, but access control settings such as bucket policies, ACLs, and Block Public Access are 100% the customer's. Even for S3, which has strong SaaS characteristics, responsibility for data classification and access control never transfers to AWS. To prevent exactly this kind of incident, AWS evolved toward enforcing Block Public Access as a default control.

---
