# Day 3 - AI Security: Least Privilege IAM, Data Encryption, PII Protection, PrivateLink, Shared Responsibility Model

Until yesterday we've seen "responsible AI" — making AI fair and trustworthy. Today we shift to technical defense. **AI Security** — Who can access models and data, how is data protected, how is personal information guarded. As a cloud certification, AIF-C01 asks about security fundamentals. There's no separate AI-only security technology; the core is applying AWS's standard security principles in an AI/ML context.

Today's five pillars: least privilege IAM, data encryption (at-rest/in-transit), PII protection, PrivateLink, and the foundation of all security — the shared responsibility model.

## Shared Responsibility Model: Who is Responsible for What

The starting point of AWS security is the **Shared Responsibility Model**. Security responsibility is divided between AWS and the customer.

| Aspect | Responsible Party | Example |
|------|----------|------|
| Security **of the cloud** itself | **AWS** | Data centers, hardware, global infrastructure, foundation of managed services |
| Security **in the cloud** | **Customer** | Data classification·encryption, IAM permission setting, access control, network configuration |

Core one-liner: **"AWS is responsible for the security OF the cloud (infrastructure security), customers are responsible for the security IN the cloud (data and access security)."**

> 💡 **Related Theory**: The more managed services you use (Bedrock, SageMaker, etc.), the more responsibility AWS takes on. But "who can see what data (IAM)", "what data to input", and "how to manage encryption keys" always falls on the customer. In the exam, if asked "When calling a model with Bedrock, who's responsible for managing input data access permissions?", the answer is always the customer.

## IAM Least Privilege: Give Only What's Necessary

**IAM (Identity and Access Management)** controls "who can do what." In AI/ML, the core principle is the same: **Least Privilege**.

- **Least Privilege Principle**: Grant each user, role, and service **only the permissions their job requires**. The most common security mistake is granting broad permissions "just in case."
- **Role-Based Access**: Not just people but services also receive permissions through roles. Example: A SageMaker training job needs an IAM role to access S3 data.
- **Policy**: Specified in JSON which resources can have which actions allowed/denied.

For example, give data scientists read permission only to specific S3 buckets containing training data, not production model deployment permission.

> ⚠️ **Trap**: "Give admin permissions, it's easier" is the worst anti-pattern. Also, "permissions granted once, that's it" is wrong — you must periodically review and revoke unused permissions. In the exam, "to strengthen security?" with "give everyone full permissions" is always the wrong answer.

## Data Encryption: At Rest + In Transit

Data must be protected in two states.

| State | What to Prevent | AWS Means |
|------|------------|----------|
| At Rest | Data theft from disk/storage | Encrypt S3, EBS, SageMaker volumes with KMS |
| In Transit | Network interception of data | Protect all communication with TLS/HTTPS |

- **AWS KMS (Key Management Service)**: Safely create and manage encryption keys. Encrypt training data stored in S3, SageMaker notebook volumes, model artifacts, etc. with KMS keys.
- **In-Transit Encryption**: Ensure all API calls, data uploads/downloads are protected by TLS.

AI/ML pipelines pass data through multiple services (S3 → SageMaker → endpoint), so it's important to apply both at-rest and in-transit encryption at **every step**.

> 🔍 **Deeper Look**: KMS securely maintains keys and also controls with IAM "who can decrypt with this key." So encryption and access control work together. Encrypting data but giving key access permission to anyone defeats the purpose — encryption must pair with IAM least privilege to be complete.

## PII Protection: Find and Mask Personal Information

**PII (Personally Identifiable Information)** — names, ID numbers, phone numbers, card numbers, etc. — must be protected especially strictly. AWS provides tools to automatically find and protect PII.

| Service | Role |
|--------|------|
| Amazon Macie | Automatically detect and classify PII and sensitive information in S3 |
| Amazon Comprehend (PII Detection) | Identify PII in text and mask/remove it |
| Amazon Bedrock Guardrails (PII Filter) | Mask PII in generative AI input and output |

- **Amazon Macie**: Machine learning scans S3 buckets to identify things like "credit card numbers are exposed here."
- **Amazon Comprehend**: Finds PII entities in natural language text and masks or removes them. Useful for preprocessing to strip personal information from training data.

> 📚 **Case Study**: An insurance company wanted to use customer service call records as training data. Using them as-is risked personal information (names, addresses) leaking into the model (privacy violation). The team ① first scanned with Macie to see which S3 buckets had PII, ② masked personal information from text with Comprehend PII detection before training, and ③ attached Bedrock Guardrails' PII filter to the deployed chatbot so personal information wouldn't leak in output. A case of blocking PII across the entire data lifecycle.

## PrivateLink: Connection Without the Internet

By default, AWS service APIs are accessed via public endpoints. With sensitive data, it's safer to keep traffic off the public internet. **AWS PrivateLink** solves this.

- PrivateLink creates a **private connection** to AWS services (e.g., Bedrock, SageMaker) **within a VPC** (virtual private network).
- Traffic stays within AWS's internal network and **is not exposed to the internet**.
- Reduces data breach risk; often required in heavily regulated environments (finance, healthcare).

> 🔍 **Deeper Look**: The scenario "I'm using Bedrock but don't want data going over the internet" answered with PrivateLink (VPC endpoint). Encryption (protects data content) and PrivateLink (protects the path) are different defensive layers. Encryption says "can't read it", PrivateLink says "it doesn't go the public route in the first place."

## Security Five Pillars: Quick Review

- **Shared Responsibility Model**: AWS handles infrastructure, customers handle data·access·configuration.
- **IAM Least Privilege**: Grant only what's necessary, role-based.
- **Encryption**: Both at-rest (KMS) + in-transit (TLS).
- **PII Protection**: Macie (detection)·Comprehend (masking)·Guardrails (output filter).
- **PrivateLink**: Private connection that doesn't go through the internet.

## Summary

Today we organized AI security into five pillars. AI has no magic separate security; the core is applying AWS's standard security principles without gaps to the ML pipeline. Everything's foundation is the shared responsibility model — "customers are responsible for security IN the cloud" — and within that, IAM, encryption, PII protection, and PrivateLink form layers of defense.

Tomorrow we move AI security further forward to **Data Governance and Compliance** — data origin·quality, model governance, CloudTrail audit·logging, legal and ethical considerations for generative AI.

---

## 📝 Practice Questions

**문제 1.** In the AWS shared responsibility model, when calling a model with Amazon Bedrock, who is responsible for "setting IAM permissions for who can access input data"?

A) AWS  
B) Customer  
C) Bedrock's foundation model provider  
D) Internet service provider  

**정답: B**  
해설: IAM permission setting and data access control are "security IN the cloud," which is customer responsibility. AWS is responsible for the cloud's foundation security like data centers and hardware. C and D are not parties in the shared responsibility model.

---

**문제 2.** When granting data scientists access to a training S3 bucket, what's the safest approach?

A) Give all users administrator permissions  
B) Grant read permission only to the specific bucket needed (least privilege)  
C) Open the bucket publicly without IAM  
D) Grant permissions once and never review again  

**정답: B**  
해설: The least privilege principle means granting only necessary permissions — the safest approach. A's full admin access and C's public bucket are excessive exposure. D violates the principle that permissions must be periodically reviewed and revoked.

---

**문제 3.** Which statement correctly describes "encryption at rest" and "encryption in transit"?

A) At-rest encryption with KMS protects stored data, in-transit encryption with TLS protects network communication; both are necessary  
B) They're the same thing, only one is needed  
C) In-transit encryption protects S3 stored data  
D) At-rest encryption prevents network eavesdropping  

**정답: A**  
해설: At-rest encryption (KMS) protects storage data, in-transit encryption (TLS) protects communication, and both are needed. B wrongly treats them as identical. C and D swap the roles of the two concepts.

---

**문제 4.** Training data contains customer support text with names and ID numbers. You want to automatically identify and mask this personal information (PII). What service is most appropriate?

A) AWS PrivateLink  
B) Amazon Comprehend (PII Detection)  
C) AWS KMS  
D) Amazon EC2  

**정답: B**  
해설: Amazon Comprehend can identify PII entities in text and mask or remove them. A's PrivateLink is network path protection, C's KMS is encryption key management, D's EC2 is computing, not PII text detection.

---

**문제 5.** A heavily regulated financial company wants to use Amazon Bedrock while keeping traffic from going through the public internet and only within AWS's internal network. What's the most appropriate approach?

A) Configure AWS PrivateLink (VPC endpoint) for private connectivity  
B) Transmit data in plain text  
C) Remove all IAM permissions  
D) Scan for PII with Amazon Macie  

**정답: A**  
해설: PrivateLink creates a private connection within the VPC so traffic doesn't go through the internet. B weakens security, C prevents normal operation, and D's Macie is a PII detection tool unrelated to network path protection.

---
