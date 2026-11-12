# Day 3 - AI Security: IAM Least Privilege, Data Encryption, PII Protection, PrivateLink, the Shared Responsibility Model

## 📌 Key Takeaways

- **Shared responsibility model**: AWS is responsible for the security of the cloud itself (of the cloud), and the customer is responsible for security in the cloud (in the cloud). Data, access permissions, and configuration are always the customer's part.
- **IAM least privilege**: Give users, roles, and services only the permissions strictly needed for the job. Services also receive permissions through roles.
- **Encryption**: At rest with KMS keys, in transit with TLS. Neither can substitute for the other.
- **PII protection**: Macie for data stored in S3, Comprehend for text, Bedrock Guardrails for the input and output of generative AI.
- **PrivateLink**: Keeps traffic from a VPC to AWS services off the public internet. Encryption protects the content; PrivateLink protects the path.

## The Shared Responsibility Model: Who Is Responsible for What

Until yesterday we looked at responsible AI, which is about making AI fair and trustworthy. Today is technical defense, that is, **AI security**. There is no separate AI-only security technology; the point is applying AWS's standard security principles to the AI/ML context. The starting point is the **Shared Responsibility Model**.

| Category | Responsible party | Examples |
|------|----------|------|
| Security **of** the cloud | **AWS** | Data centers, hardware, global infrastructure, the foundation of managed services |
| Security **in** the cloud | **Customer** | Data classification and encryption, IAM permission settings, access control, network configuration |

The key one-liner: **"AWS is responsible for security of the cloud, and the customer is responsible for security in the cloud."**

The more you use managed services (Bedrock, SageMaker, and so on), the more responsibility AWS takes on. But "who the data is shown to (IAM)," "what data to put in," and "how to manage the encryption keys" are the customer's part. If the exam asks, "When calling a model with Bedrock, who is responsible for managing access permissions to the input data?", the answer is the customer.

## How Responsibility Is Divided When Using Bedrock

Applying the same principle to a single generative AI application looks like this.

| Item | AWS | Customer |
|------|------|------|
| The servers, GPUs, and data centers that run the model | Responsible | Not applicable |
| Availability and patching of the Bedrock service itself | Responsible | Not applicable |
| Who can call which model (IAM policy) | Provides the tools | **Configures it** |
| What data to put in the prompt | Not applicable | **Decides** |
| Access permissions and encryption keys for the S3 documents uploaded to a knowledge base | Provides the feature | **Configures it** |
| The Guardrails configuration that filters harmful output and personal information | Provides the feature | **Configures it** |
| Keeping and reviewing invocation records | Provides the feature | **Turns it on and reviews it** |
| The judgment on whether to trust a model response as is | Not applicable | **Responsible** |

- The line between "provides the feature" and "configures it" is the point that decides the answer on the exam. Even if AWS provides an encryption feature, whether to use a customer managed key and whom to allow to decrypt is decided by the customer.
- AWS states that in Bedrock, model providers cannot access customers' prompts and responses. This is because the model is copied into an account operated by the Bedrock service team and runs there, and the model provider cannot access that account.
- AWS explains that when you fine-tune a model, it is built on a **private copy** of the base model, and that data is neither shared with the model provider nor used to improve the base model.

## IAM Least Privilege: Only as Much as Needed

**IAM (Identity and Access Management)** controls "who can do what." In AI/ML too, the core principle is **Least Privilege**.

- **Least privilege principle**: Grant each user, role, and service **only the permissions strictly needed for the job**. Granting broadly "just in case" is the most common security mistake.
- **Role-based access**: Not only people but also services receive permissions through roles. Example: for a SageMaker training job to access S3 data, it needs an appropriate IAM role.
- **Policy**: Specifies in JSON which actions on which resources are allowed or denied.
- For example, give a data scientist only read permission on the specific S3 bucket holding the training data, and do not give permission to deploy production models.

| IAM element | One-line description | Example in an AI context |
|------|------|------|
| User | An identity corresponding to one person or application | A data scientist's individual account |
| Group | A unit that bundles users to give them the same permissions | An "ML engineers" group |
| Role | A temporary credential assumed when needed. Services can assume it too | The execution role assumed by a SageMaker training job |
| Policy | A document listing the actions and resources to allow or deny | "Allow read-only on this bucket," "Allow calling only specific models" |

- A role uses **temporary credentials** instead of long-term passwords or access keys. Having a role assumed is safer than writing keys into code.
- Policies can be narrowed down per resource. Write them like "allow calling only approved models," not "allow all of Bedrock."
- Secret values that must not go into code, such as database passwords and external API keys, are kept in AWS Secrets Manager.

> ⚠️ **Trap**: "Giving administrator permissions is convenient" is the worst anti-pattern. Also, it is not "once permissions are granted, you are done"; you must review them periodically and revoke permissions that are not used. On the exam, "grant everyone full permissions" is a wrong answer to "how do you strengthen security?"

## Data Encryption: At Rest + In Transit

Data must be protected in two states.

| State | What it prevents | AWS means |
|------|------------|----------|
| At rest | Theft of data stored on disks and storage | Encrypt S3, EBS, SageMaker volumes, etc. with KMS |
| In transit | Eavesdropping on data traveling over the network | Communication encrypted with TLS/HTTPS |

- **AWS KMS (Key Management Service)**: Creates and manages encryption keys securely. Training data stored in S3, SageMaker notebook volumes, model artifacts, and so on are encrypted with KMS keys.
- **Encryption in transit**: Make sure API calls and data uploads/downloads are all protected with TLS.
- Because data in an AI/ML pipeline passes through several services (S3 → SageMaker → endpoint), it is important to apply encryption at rest and in transit **at every stage** without gaps.
- The two kinds of encryption stop different threats. With encryption at rest only, data can be eavesdropped on while in motion; with encryption in transit only, the contents are exposed if the storage is leaked wholesale.

KMS keeps the key itself securely while also controlling "who can decrypt with this key" in combination with IAM. In other words, encryption and access control work together. Even if you encrypt data, it is meaningless if you give key access to anyone. Encryption is complete only when paired with IAM least privilege.

## PII Protection: Finding and Masking Personal Information

**PII (Personally Identifiable Information)**, that is, names, national ID numbers, phone numbers, card numbers, and so on, must be protected especially strictly. AWS provides tools that automatically find and protect PII.

| Service | Role |
|--------|------|
| Amazon Macie | Automatically detects and classifies PII and sensitive information in data stored in S3 |
| Amazon Comprehend (PII detection) | Identifies PII in text and masks/removes it |
| Amazon Bedrock Guardrails (PII filter) | Masks PII in the input and output of generative AI |

- **Amazon Macie**: Scans S3 buckets with machine learning and pattern matching and warns of risks such as "a credit card number is exposed here."
- **Amazon Comprehend**: Finds PII entities in natural language text and masks or removes them. It is useful for preprocessing that removes personal information from training data.

The three tools are separated by "which data, when, and how."

| Category | Amazon Macie | Amazon Comprehend | Bedrock Guardrails |
|------|------|------|------|
| Target | Objects already stored in S3 | Text that we pass to it | Prompts and responses of generative AI |
| Timing | After storage, periodic and continuous checks | Inside the processing pipeline | The very moment the conversation passes through |
| What it does | **Finds and reports where** sensitive data is | **Finds and masks** PII in text | **Blocks or masks** PII in input and output |
| Output | Finding reports | PII locations and types, masked text | Filtered responses |
| Clue in the passage | "S3 bucket," "where the sensitive data is" | "Identify and mask in text," "preprocess training data" | "Chatbot," "prompts and responses" |

- In addition to detecting sensitive data, Macie also examines the security posture of S3 buckets. If it finds a problem such as a bucket becoming publicly accessible, it notifies you.
- Macie is a service that **finds and notifies**. It does not delete or mask the data it finds on its own.
- Macie's target is Amazon S3. If the target is a database or real-time conversation, look for another tool.

As a hypothetical case, an insurance company wanted to use customer support records as training data. Using them as they were risked leaking names and addresses into the model (a privacy violation). The team ① first scanned with Macie to see which S3 buckets held PII, ② masked personal information in the text with Comprehend PII detection before using it for training, and ③ applied the Bedrock Guardrails PII filter to the deployed chatbot so personal information would not go out in the output either. It is a case of blocking PII at every stage of the data lifecycle.

## PrivateLink: A Connection That Does Not Pass Through the Internet

By default, AWS service APIs are accessed through public endpoints. When handling sensitive data, it is safer to keep traffic off the public internet. **AWS PrivateLink** solves this.

- PrivateLink creates a **private connection** from within a VPC (virtual private network) to AWS services (for example, Bedrock and SageMaker). The access point created inside the VPC for this is an interface VPC endpoint.
- Traffic stays only on the AWS internal network and is **not exposed to the internet**.
- It reduces the risk of data exfiltration and is often required in strictly regulated environments (finance, healthcare).

> 🔍 **Going deeper**: The answer to the scenario "I use Bedrock and want the data not to go through the internet" is PrivateLink (a VPC endpoint). Encryption (protecting the data's content) and PrivateLink (protecting the path) are defenses at different layers. Encryption makes "the content unreadable," while PrivateLink makes it "not go over a public path in the first place."

| Question | IAM | KMS | TLS | PrivateLink |
|------|------|------|------|------|
| What it protects | Who can do it | Stored content | Content in motion | The path in motion |
| What happens without it | Anyone can call and view | Content exposed if storage leaks | Content exposed if eavesdropped | Traffic goes via the public internet |
| Can they substitute for each other | No | No | No | No |

- The four are defenses at different layers. Options like "we use PrivateLink, so encryption is not needed" and "we encrypted, so permissions can be broad" are both wrong.

## New Threats Arising in Generative AI

The exam guide lists, as security and privacy considerations for AI systems, the existing security items (application security, threat detection, vulnerability management, infrastructure protection, encryption at rest and in transit) together with items unique to generative AI.

| Threat | What it is | Response |
|------|------|------|
| Prompt injection | Hiding instructions in the input to make the model ignore its original guidance | Guardrails prompt attack filter, input validation, minimizing the permissions the model can use |
| Jailbreaking | Bypassing safeguards to elicit prohibited content | Guardrails content filters, denied topics |
| Data leakage | Personal or internal information is mixed into responses | PII filter, output filtering and validation, access control on knowledge base documents |
| Harmful output (toxicity) | Generating inappropriate content such as hate and violence | Guardrails content filters |
| Untraceability | Not knowing who asked what and what went out | Audit trails and logging of AI interactions (Day 4) |

- Prompt injection is not only a case of users typing it in directly. Instructions can also be hidden in documents or web pages that the model reads. So the basic stance is "do not trust any external content the model reads."
- If a model calls tools and takes real actions, as an agent does, least privilege becomes even more important. Even if the model is deceived, the damage is small if what it can do is narrow.
- As examples of AWS features that protect AI systems, the exam guide lists IAM, encryption, Macie, PrivateLink, and the shared responsibility model, along with Amazon Bedrock Guardrails and the agent features Amazon Bedrock AgentCore Identity and Policy in AgentCore. AgentCore Identity manages an agent's identity, access, and authentication, and Policy controls with rules which tools an agent may use and under what conditions. For an introductory exam, it is enough to know that "agents also need identity and permission controls."

## Requirement → Means Decision Table

| Requirement in the passage | Answer | Options eliminated and why |
|------|------|------|
| "Let data scientists read only a specific bucket" | IAM policy (least privilege) | KMS: key management, not the main means of setting the allowed scope per user |
| "A training job needs to access S3" | IAM role | Storing access keys in code: risk of leakage |
| "Encrypt stored training data and control the keys ourselves" | AWS KMS | TLS: protection in transit |
| "So API calls cannot be eavesdropped on" | TLS (encryption in transit) | Encrypting S3 with KMS: protection at rest |
| "So traffic does not pass through the public internet" | AWS PrivateLink | Encryption: protects the content but the path stays the same |
| "We don't know which S3 buckets hold sensitive data" | Amazon Macie | Comprehend: you have to pass it the text |
| "Mask names and phone numbers in support text, then train" | Amazon Comprehend | Macie: only finds, does not mask |
| "So card numbers do not go out in chatbot responses" | Bedrock Guardrails | Macie: real-time conversation is not its target |
| "A user types 'ignore the previous instructions'" | Guardrails (prompt attack filter) | PrivateLink: unrelated to the network path |
| "We want to take the database password out of the code" | AWS Secrets Manager | Storing it in plain text in S3: that is not secret management |

## Quick Review of the Five Pillars of Security

- **Shared responsibility model**: AWS handles infrastructure; the customer handles data, access, and configuration.
- **IAM least privilege**: Only as much as needed, role-based.
- **Encryption**: Both at rest (KMS) and in transit (TLS).
- **PII protection**: Macie (detection), Comprehend (masking), Guardrails (output filter).
- **PrivateLink**: A private connection that does not pass through the internet.

The gist of today is not AI-specific magic but applying AWS's standard security principles to the ML pipeline without gaps. Tomorrow we go a step beyond security to **data governance and compliance** (data provenance and quality, model governance, CloudTrail auditing and logging, legal and ethical considerations of generative AI).

## 📖 Glossary

- **Shared responsibility model**: The principle that security responsibility is divided between AWS (the cloud itself) and the customer (in the cloud).
- **Least Privilege**: The principle of granting only the permissions strictly needed for the job.
- **IAM Role**: An identity that a person or service assumes when needed, using permissions through temporary credentials.
- **Encryption at rest**: Encrypting data sitting on disks and storage.
- **Encryption in transit**: Encrypting data moving over the network with TLS.
- **AWS KMS**: A service that creates and keeps encryption keys and controls who can use them.
- **VPC**: Your own isolated virtual network created inside AWS.
- **VPC endpoint**: An access point for private connection to AWS services from inside a VPC. PrivateLink provides it.
- **Prompt injection**: An attack that uses instructions hidden in the input to make a model violate its original guidance.
- **Masking**: Processing that hides a sensitive value with other characters so the original value cannot be known.

## 📝 Practice Questions

**Question 1.** In the AWS shared responsibility model, when calling a model with Amazon Bedrock, who is responsible for "setting IAM permissions for who can access input data"?

A) AWS  
B) Customer  
C) Bedrock's foundation model provider  
D) Internet service provider  

**Answer: B**  
Explanation: IAM permission setting and data access control are "security IN the cloud," which is customer responsibility. AWS is responsible for the cloud's foundation security like data centers and hardware. C and D are not parties in the shared responsibility model.

---

**Question 2.** When granting data scientists access to a training S3 bucket, what's the safest approach?

A) Give all users administrator permissions  
B) Grant read permission only to the specific bucket needed (least privilege)  
C) Open the bucket publicly without IAM  
D) Grant permissions once and never review again  

**Answer: B**  
Explanation: The least privilege principle means granting only necessary permissions — the safest approach. A's full admin access and C's public bucket are excessive exposure. D violates the principle that permissions must be periodically reviewed and revoked.

---

**Question 3.** Which statement correctly describes "encryption at rest" and "encryption in transit"?

A) At-rest encryption with KMS protects stored data, in-transit encryption with TLS protects network communication; both are necessary  
B) They're the same thing, only one is needed  
C) In-transit encryption protects S3 stored data  
D) At-rest encryption prevents network eavesdropping  

**Answer: A**  
Explanation: At-rest encryption (KMS) protects storage data, in-transit encryption (TLS) protects communication, and both are needed. B wrongly treats them as identical. C and D swap the roles of the two concepts.

---

**Question 4.** Training data contains customer support text with names and ID numbers. You want to automatically identify and mask this personal information (PII). What service is most appropriate?

A) AWS PrivateLink  
B) Amazon Comprehend (PII Detection)  
C) AWS KMS  
D) Amazon EC2  

**Answer: B**  
Explanation: Amazon Comprehend can identify PII entities in text and mask or remove them. A's PrivateLink is network path protection, C's KMS is encryption key management, D's EC2 is computing, not PII text detection.

---

**Question 5.** A heavily regulated financial company wants to use Amazon Bedrock while keeping traffic from going through the public internet and only within AWS's internal network. What's the most appropriate approach?

A) Configure AWS PrivateLink (VPC endpoint) for private connectivity  
B) Transmit data in plain text  
C) Remove all IAM permissions  
D) Scan for PII with Amazon Macie  

**Answer: A**  
Explanation: PrivateLink creates a private connection within the VPC so traffic doesn't go through the internet. B weakens security, C prevents normal operation, and D's Macie is a PII detection tool unrelated to network path protection.

---
