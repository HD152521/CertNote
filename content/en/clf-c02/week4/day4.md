# Day 4 - Data Protection Basics: Encryption, Key Management, and Secret Storage

Yesterday we covered "where to put your data (the Region)." Today we look at "how to protect that data safely." The core technology is **encryption**. If you transform data into a form no one can read, then even if someone steals it, it's useless without the key.

Today we'll lay out, at the conceptual level, the two states of encryption (in transit / at rest), the services that manage encryption keys (**KMS** and **CloudHSM**), and **Secrets Manager**, which safely stores sensitive information like passwords and API keys. The CLF exam asks not about deep content such as algorithms, but about "when to use what."

## The Two States of Encryption

Data must be protected in two situations.

**1. Encryption in Transit**: Protection while data moves across a network. It ensures that even if data traveling between a browser and a server is intercepted, it can't be read. The representative technology is **TLS/SSL** (communication starting with https://).

**2. Encryption at Rest**: Protection while data sits stored on a disk or in storage. Even if someone accesses the physical disk or the stored files, they can't be read without the key. Most AWS storage services — S3, EBS, RDS, and so on — support encryption at rest.

| State | What's protected | Representative technology |
|------|-----------|-----------|
| In transit | Data moving across a network | TLS/SSL (HTTPS) |
| At rest | Data stored on disk | Storage encryption + KMS keys |

> 💡 **Related theory**: "Prevent interception in transit" → encryption in transit (TLS). "Protect stored data" → encryption at rest. Questions distinguishing the two states come up often on the exam, so keep "in transit vs at rest" clearly in mind.

## KMS: The Service That Manages Encryption Keys

To encrypt, you need a **key**. But where and how to safely store the key itself is a new problem. What solves this is **AWS KMS (Key Management Service)**.

KMS is a fully managed service that **creates, stores, manages, and rotates** encryption keys. It integrates with most AWS services — S3, EBS, RDS, and so on — so you can set "encrypt this data with a KMS key" with a single checkbox. Access to keys is controlled with IAM, and who used which key and when is recorded in CloudTrail.

KMS key management approaches:

- **AWS managed keys**: AWS manages them on your behalf.
- **Customer managed keys (CMK)**: The customer creates them directly and controls the permission and rotation policies.

> 💡 **Related theory**: When you see "easily create and manage encryption keys across AWS services," it's KMS. Delegating key management while keeping integration simple is the core value of KMS.

## CloudHSM: Dedicated Hardware Key Management

KMS runs on infrastructure shared among multiple customers (though keys are isolated). However, some regulated industries require **"keep the key in our dedicated hardware, where not even AWS can access it."** The service used in this case is **AWS CloudHSM**.

CloudHSM provides a customer-**dedicated Hardware Security Module (HSM)**. Keys are handled only inside validated dedicated hardware, and the customer has complete sole control over the keys. You choose it when you need stricter compliance (e.g., FIPS 140-2 Level 3) or full, sole control over keys.

| Item | KMS | CloudHSM |
|------|-----|----------|
| Management model | AWS managed, easy integration | Customer-dedicated HSM, sole control |
| Ease of use | Very easy (service integration) | Relatively complex |
| Target | General encryption needs | Strict regulations/sole key control |

> 💡 **Related theory**: When you see "in dedicated hardware, where even AWS can't access, control the key entirely on your own," it's CloudHSM. For all other general key management, KMS with its easy integration is the default choice.

## Secrets Manager: Safe Storage of Secret Information

Hardcoding **secrets** like database passwords, API keys, and tokens into code, or leaving them in plaintext in config files, is dangerous. A leak leads straight to a breach. **AWS Secrets Manager** safely stores this kind of secret information and lets applications retrieve it safely at runtime.

A key feature is **automatic rotation**. For example, if you configure an RDS database password to change automatically on a schedule, the secret is refreshed regularly without anyone touching it.

> 💡 **Related theory**: When you see "store DB passwords/API keys safely and rotate them automatically instead of embedding them in code," it's Secrets Manager. Distinguish "keys (for encryption)" as KMS and "secrets (credentials)" as Secrets Manager, and you won't get confused.

## One-Line Summary Table

| Service/Concept | One-line identity |
|-------------|--------------|
| Encryption in transit | Protects data moving across a network (TLS) |
| Encryption at rest | Protects data stored on disk |
| KMS | Creates/manages encryption keys (easy integration) |
| CloudHSM | Sole key control based on dedicated hardware |
| Secrets Manager | Stores passwords/API keys and rotates them automatically |

## Wrapping Up

The core of data protection is encryption, and data must be protected both in transit (TLS) and at rest. You manage encryption keys easily with KMS, and when you need sole control in dedicated hardware, you use CloudHSM. Credentials such as passwords and API keys are safely stored and automatically rotated with Secrets Manager.

In the next article, we'll comprehensively review all of Week 4 — the shared responsibility model, IAM, security services, compliance, and data protection — and, in one pass, sort out the points that are frequently confused on the exam.

---

## 📝 연습 문제

**문제 1.** Protecting data traveling between a web browser and a server from interception is which type of encryption?

A) Encryption at rest  
B) Encryption in transit  
C) Disk encryption  
D) Key rotation  

**정답: B**  
해설: Protecting data moving across a network is encryption in transit, and TLS/SSL (HTTPS) is the representative technology. Encryption at rest and disk encryption protect stored data, and key rotation is a separate task of periodically refreshing encryption keys.

---

**문제 2.** You want to easily create and centrally manage encryption keys used across multiple AWS services such as S3, EBS, and RDS. Which service is most appropriate?

A) AWS Secrets Manager  
B) AWS KMS  
C) Amazon Macie  
D) AWS Artifact  

**정답: B**  
해설: KMS is a fully managed service that integrates across AWS services to create, store, manage, and rotate encryption keys. Secrets Manager is for storing credentials such as passwords, Macie is for detecting S3 sensitive data, and Artifact is a compliance report download portal.

---

**문제 3.** Due to strict compliance requirements, you must control encryption keys solely in customer-dedicated hardware. Which service is most appropriate?

A) AWS managed keys in AWS KMS  
B) AWS CloudHSM  
C) AWS Secrets Manager  
D) Amazon Inspector  

**정답: B**  
해설: CloudHSM provides a customer-dedicated Hardware Security Module (HSM) so you can control keys entirely on your own, which fits strict compliance requirements. KMS managed keys are based on AWS-managed shared infrastructure, Secrets Manager is for credential storage, and Inspector is a vulnerability assessment tool.

---

**문제 4.** You want to safely store database passwords and API keys without hardcoding them into code, and rotate them automatically on a schedule. Which service is most appropriate?

A) AWS KMS  
B) AWS CloudHSM  
C) AWS Secrets Manager  
D) AWS WAF  

**정답: C**  
해설: Secrets Manager safely stores credentials such as passwords and API keys and supports automatic rotation. KMS and CloudHSM focus on managing encryption "keys," and WAF is a web attack filtering service.

---

**문제 5.** Which of the following statements about encryption at rest is correct?

A) It protects data being transmitted across a network  
B) It protects data stored on a disk or in storage so it can't be read without a key  
C) It refers to HTTPS communication  
D) It can only be used with EC2  

**정답: B**  
해설: Encryption at rest protects data stored on disk/in storage so it can't be read without a key. Protecting network transmission and HTTPS correspond to encryption in transit, and encryption at rest is supported across various storage services such as S3, EBS, and RDS.

---
