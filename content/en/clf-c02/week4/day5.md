# Day 5 - Week 4 Synthesis: Security and Compliance All in One

This week we covered **security and compliance**, the domain with the largest weight on the exam (30%). Today we'll review the four days of material by threading it together into one line each, and sort out the comparison points that are frequently confused on the exam. Rather than re-memorizing individual services, let's focus on sharpening the **matching instinct** of "what fits which situation."

## 1) The Shared Responsibility Model: The Starting Point of Every Answer

Whenever you meet a security question, always ask first: "Is this AWS's responsibility, or the customer's?"

- **AWS (of the cloud)**: physical security, hardware, network infrastructure, the virtualization layer, the foundation of managed services.
- **Customer (in the cloud)**: data, encryption settings, access permissions (IAM), OS/app patching for EC2, firewall rules.

Two key principles: ① The more managed the service, the greater AWS's responsibility. ② **Data and access permissions are always the customer's responsibility, in every case.**

> 💡 **Related theory**: The same principle applies to compliance. Even if AWS holds PCI/HIPAA certification, the customer's app is not automatically compliant. The foundation is AWS; the configuration on top is the customer.

## 2) IAM: Who Can Do What

| Component | One line |
|----------|-------|
| User | Credential for a single person/app |
| Group | A bundle of users, for managing permissions in bulk |
| Role | Temporary permission delegation (e.g., EC2 → S3 access) |
| Policy | JSON that defines permission rules |

Best practices to remember: don't use the root user for daily work + **MFA is a must**, grant permissions by the **principle of least privilege**, and when EC2 accesses another service, use a **Role** (no hardcoding keys). IAM is a **free global service**.

> 💡 **Related theory**: "EC2 accessing S3 → Role," "the same permissions for multiple people → Group," "first step to strengthen account security → root MFA" are the standard matchings.

## 3) The Six Security Services: What Threat Does Each Stop?

| Service | One-line identity |
|--------|--------------|
| WAF | Filters web attacks (SQL injection/XSS, L7) |
| Shield | DDoS (traffic flood) defense, Standard is free |
| GuardDuty | Detects malicious activity via log analysis |
| Inspector | Checks vulnerabilities of EC2/containers/Lambda |
| Macie | Discovers/classifies sensitive data (PII) in S3 |
| Security Hub | Unified security findings dashboard |

Pairs that are easy to confuse:
- **WAF vs Shield**: WAF is "request content (web attacks)," Shield is "traffic volume (DDoS)."
- **GuardDuty vs Inspector**: GuardDuty is "malicious behavior happening right now," Inspector is "weak points that make you easy to attack (vulnerabilities)."
- **Individual detection vs aggregation**: GuardDuty/Inspector/Macie detect, and Security Hub gathers and views them.

> 💡 **Related theory**: The exam asks "which service fits this scenario." As long as each service's one-line identity is clear, most questions solve themselves.

## 4) Compliance: Proof and the Nationality of Data

- **AWS Artifact**: A portal for self-service **download** of AWS's compliance reports such as SOC, ISO, and PCI DSS.
- AWS complies with various programs including HIPAA, PCI DSS, ISO 27001, SOC, GDPR, and FedRAMP.
- **Data sovereignty**: If the law requires data to stay only in a specific region → **select the corresponding Region**. AWS does not arbitrarily move customer data outside the selected Region.

> 💡 **Related theory**: "Where do you get compliance reports? → Artifact," "keep data only in the EU? → select an EU Region" are the key matchings.

## 5) Data Protection: Encryption, Keys, Secrets

| Service/Concept | One-line identity |
|-------------|--------------|
| Encryption in transit | Protection while moving across a network (TLS/HTTPS) |
| Encryption at rest | Protects data stored on disk |
| KMS | Encryption key management (easy integration, default choice) |
| CloudHSM | Sole key control in dedicated hardware (strict regulations) |
| Secrets Manager | Stores passwords/API keys and rotates automatically |

Pairs that are easy to confuse:
- **In transit vs at rest**: protection while moving vs protection while stored.
- **KMS vs CloudHSM**: easy integration (default) vs sole control in dedicated hardware (strict).
- **KMS vs Secrets Manager**: managing encryption "keys" vs storing "credentials (secrets)."

## Whole-Picture One-Page Flow

```
[Who does what?]        IAM (user/group/role/policy, MFA, least privilege)
[Whose responsibility?] Shared Responsibility Model (AWS=of / customer=in)
[Block external threats] WAF (web) · Shield (DDoS)
[Detect internal threats] GuardDuty · Inspector · Macie → Security Hub
[Compliance proof/location] Artifact (reports) · Region selection (data sovereignty)
[Data protection]         Encryption (transit/rest) · KMS/CloudHSM · Secrets Manager
```

## Wrapping Up

The core of Week 4 is that "security is a shared responsibility, and the point is to choose the right tools for the customer's portion." Permissions are IAM, external threats are WAF/Shield, internal threat detection is GuardDuty/Inspector/Macie (aggregation is Security Hub), compliance proof is Artifact, and data protection is encryption plus KMS/CloudHSM/Secrets Manager. As long as you clearly grasp each service's one-line identity and the differences between the confusing pairs, you're well prepared for the security domain.

Next week we move on to the domain of cost management and support (pricing, billing, support plans), sorting out the cloud's "money story."

---

## 📝 연습 문제

**문제 1.** According to the shared responsibility model, who is responsible for security patching of the operating system running on an EC2 instance?

A) AWS  
B) The customer  
C) AWS and the customer perform it jointly and directly  
D) There is no responsible party  

**정답: B**  
해설: With EC2 (IaaS), patching the guest operating system and applications is the customer's responsibility ("in the cloud"). AWS is responsible for the "of the cloud" area such as the physical infrastructure and the virtualization layer. Patching responsibility shifts to AWS as you move toward managed services, but the OS of EC2 is the customer's portion.

---

**문제 2.** Which service defends against attacks that flood a service with massive traffic simultaneously (DDoS) and is provided free by default to all customers?

A) AWS WAF  
B) AWS Shield Standard  
C) Amazon GuardDuty  
D) Amazon Macie  

**정답: B**  
해설: Shield Standard is provided free to all customers and automatically defends against DDoS (traffic floods). WAF is web attack (SQL injection/XSS) filtering, GuardDuty is malicious activity detection, and Macie is S3 sensitive data detection — none are DDoS defense services.

---

**문제 3.** A company wants to easily manage encryption keys to use across AWS services. What is the most appropriate default choice for general needs?

A) AWS CloudHSM  
B) AWS KMS  
C) AWS Secrets Manager  
D) AWS Artifact  

**정답: B**  
해설: KMS is the default choice that integrates with AWS services to easily create and manage encryption keys. CloudHSM is used in strict cases requiring sole key control in dedicated hardware, Secrets Manager is for credential storage, and Artifact is the compliance report portal.

---

**문제 4.** For an audit, you need to obtain AWS's ISO 27001 certificate and SOC reports. Separately, you must store data only within the EU. What is the correct combination of actions for each?

A) Download reports from Artifact / Select an EU Region  
B) Generate reports with Inspector / Replicate to all Regions  
C) Download reports with Trusted Advisor / Change the instance type  
D) Issue certificates with Security Hub / Configure IAM groups  

**정답: A**  
해설: Compliance reports are downloaded self-service from AWS Artifact, and the data sovereignty requirement is met by selecting an EU Region. Inspector, Trusted Advisor, and Security Hub are not report-issuing portals, and replicating to all Regions, changing the instance type, and IAM groups are unrelated to the data storage location requirement.

---

**문제 5.** You want to safely store a database password without hardcoding it into code and rotate it automatically on a schedule. Which service is most appropriate?

A) AWS Secrets Manager  
B) Amazon Inspector  
C) AWS WAF  
D) Amazon Macie  

**정답: A**  
해설: Secrets Manager safely stores credentials such as passwords and API keys and supports automatic rotation. Inspector is for vulnerability assessment, WAF is for web attack filtering, and Macie is for S3 sensitive data detection — none provide credential storage and rotation.

---
