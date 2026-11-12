# Day 4 - Data Protection Basics: Encryption, Key Management, and Secret Storage

## 📌 Key Takeaways

- **Encryption** turns data into "a form that can't be read without the key." If it's stolen but the thief has no key, it's just a lump of meaningless characters.
- There are two points to protect — **in transit** uses TLS/HTTPS, and **at rest** uses storage encryption.
- The real difficulty isn't encryption but **where to keep the key**. The answers are **KMS** (a managed key vault, the default choice) and **CloudHSM** (customer-dedicated hardware, sole control).
- **Credentials** such as passwords and API keys go into **Secrets Manager**. Safe storage plus **automatic rotation** is the key point.
- When confused, pair them like this — **encryption key = KMS**, **password/API key = Secrets Manager**, **TLS certificate = ACM**.

If yesterday covered "where to put the data (Regions)," today we look at "how to protect that data safely." The core technology is **encryption.** If you convert data into an unrecognizable form, then even if someone steals it, it's useless without the key.

Today we summarize, at a conceptual level, the two states of encryption (in transit / at rest), the services that manage encryption keys (**KMS** and **CloudHSM**), and **Secrets Manager**, which safely stores sensitive information such as passwords and API keys. The CLF exam doesn't ask about deep topics like algorithms; it asks "what do you use when."

## Why Did Encryption Become Necessary?

Before the cloud, people thought about security like this: **"The servers are inside our machine room and its door is locked, so we're safe."** But this approach leaves nothing once the wall is breached. Incidents kept recurring in which a backup tape was lost in transit with a plaintext customer list inside, or old data came back to life from a discarded disk. That means **"blocking access" alone isn't enough.** So one more idea was layered on top: **make the data itself unreadable.**

There are two ways to keep others from seeing your diary. ① Lock the door of your room — **access control** (IAM, firewalls). ② Write the diary in a code only you know — **encryption.** Security uses the two **layered together.** That's because if one is breached, the other remains, and this is called **Defense in Depth.**

Let's grasp just three terms first. The original data a person can read as is, is **plaintext;** the result converted so it can't be recognized is **ciphertext;** and the secret value that lets you move between the two is the **key.** In terms of a letter, they correspond to the letter written as is / the letter rewritten in code / the decoding table.

Encryption is secure **not because the algorithm is secret but because the key is secret.** So **the security of encryption is the security of key management,** and this is exactly why KMS and CloudHSM, which come later, exist.

Don't trust the wall — lock the contents themselves. And always know where the key is.

## The Two States of Encryption

Data has to be protected in two situations.

**1. Encryption in Transit**: Protection while data moves across a network. Even if the data passing between a browser and a server is intercepted, it can't be read. The representative technology is **TLS/SSL** (communication that starts with https://).

**2. Encryption at Rest**: Protection while data is stored on a disk or in storage. Even if someone gets access to the physical disk or stored files, they can't read it without the key. Most AWS storage services, such as S3, EBS, and RDS, support encryption at rest.

| State | What it protects | Representative technology |
|-------|------------------|---------------------------|
| In transit | Data moving across the network | TLS/SSL (HTTPS) |
| At rest | Data stored on disk | Storage encryption + KMS key |

"Prevent interception while moving" → encryption in transit (TLS). "Protect stored data" → encryption at rest. Since the exam has questions that make you tell the two states apart, remember "in transit vs at rest" clearly.

### Understanding Encryption in Transit with a Picture

The easiest analogy is **a postcard versus a sealed letter.** A **postcard** has its whole message written on the outside, so the post office clerk and the delivery person can all read it — that's unencrypted communication (`http://`). A **sealed letter** can be opened only by the recipient — that's communication encrypted with TLS (`https://`).

Think about logging in to an online shop over a café's public Wi-Fi. Someone connected to the same Wi-Fi can look at the signals passing through, but if the site is `https://`, even if they write down all the signals, the ID and password appear only as scrambled characters. The **padlock icon** in the address bar is the sign that "this communication is sealed."

There was one practical headache attached to this. To use TLS you need a **certificate,** and certificates have a validity period, so they must be renewed periodically.

- **AWS Certificate Manager (ACM)**: A service that **issues, stores, and renews** TLS/SSL certificates. Renewal of public certificates issued by ACM is handled automatically, preventing "forgot it expired" incidents. Certificates are attached to front-end services such as CloudFront, load balancers, and API Gateway.

At a mid-sized retailer, the employee in charge handled the online shop's certificate renewal manually by jotting it on a calendar. The year after that employee left, the certificate expired without anyone knowing, and on Monday morning customers who visited saw a red warning screen. The cause was **entrusting to a person something a person had to remember.**

### Understanding Encryption at Rest with a Picture

This time the analogy is **boxes stacked in a warehouse.** However sturdily you lock the warehouse door, it's over if a thief breaks through the wall or an employee walks out with a box. But what if all the documents in the box are written in code? Even if they take it whole, they gain nothing.

In AWS, encryption at rest is usually turned on with **a single checkbox.** You hardly ever need to change the application code. It locks automatically on write and unlocks automatically when an authorized request reads, so nothing changes from the user's point of view, while the actual contents on the disk have become ciphertext. S3 objects, EBS volumes and snapshots, RDS stored files and backups, EFS files, and DynamoDB items are all protected this way.

There is one more pair to tell apart. It's **who locks it.** If the AWS service locks it at the moment of storing, it's **server-side encryption;** if your application locks it before sending, it's **client-side encryption.** Server-side, with its simple setup, is the default, and client-side is used only when there is a requirement that "even AWS must not see the plaintext."

> ⚠️ **Trap**: The sentence "we turned on encryption at rest, so we're completely safe" is a signal for a wrong answer. At rest and in transit are **separate,** and even if the disk is encrypted, if you download that data over `http://`, it is exposed as is on the network segment.

> ⚠️ **Trap**: Encryption **doesn't stop permissions granted by mistake.** Even if an S3 bucket is encrypted, if you've made it public as "anyone can read," the requester receives the decrypted plaintext as is. Encryption is a device that stops "someone who stole the medium," not one that stops "a request that has been granted permission." That's why encryption and IAM always go together.

## KMS: The Service That Manages Encryption Keys

To encrypt, you need a **key.** But where and how to store the key itself safely is a new problem. The thing that solves it is **AWS KMS (Key Management Service).**

KMS is a fully managed service that **creates, stores, manages, and rotates** encryption keys. It is integrated with most AWS services such as S3, EBS, and RDS, so with one checkbox you can set "encrypt this data with a KMS key." Access to keys is controlled with IAM, and who used a key and when is recorded in CloudTrail.

How KMS manages keys:

- **AWS managed keys**: AWS manages them on your behalf.
- **Customer managed keys (CMK)**: The customer creates them and controls permissions and rotation policy.

When you see "easily create and manage encryption keys across AWS services," it's KMS. The core value of KMS is that it is easy to integrate while delegating key management.

### Why Is Key Management Such a Hard Job?

If you install a top-grade door lock on your front door and stick the password on a Post-it on the mailbox next to it, the door lock is meaningless. Encryption is the same. However sturdily you lock the data, if **the key is lying right next to it,** it's the same as never having locked it. But in practice, keeping keys properly is a hassle. You have to decide **where** to keep the key, **who** gets access, **when** to change it, and how to leave a record of **who used it and when.** With each company solving this on its own, key management often became the weakest link of security instead.

**KMS bundles the answers to these questions into a single service.** It's similar to renting a bank safe-deposit box. Instead of building and guarding a vault yourself, you rent one from a specialist institution, and you only decide "who can open this compartment." There is one important property. **The key itself never leaves KMS.** Since the structure is that you send a request into KMS and get back only the result, the chance for the key to be copied or leaked is reduced at the root.

The questions raised earlier are answered like this. **Who can use it** is controlled by IAM policies and key policies; **who used it and when** is left in CloudTrail; **periodic rotation** is handled by turning on automatic rotation for customer managed keys; and **connecting with other services** is done just by picking the key on the S3, EBS, or RDS screen.

**Trap**: Deleting a KMS key **makes data encrypted with that key permanently unreadable.** That's why KMS uses scheduled deletion with a waiting period rather than immediate deletion.

A healthcare startup handling medical data was encrypting patient records while keeping the key string in a server configuration file. As servers and developers multiplied, that key got copied to several laptops and repositories, and eventually it reached a state where "nobody could answer how many copies of this key exist in the world." The company moved the key to KMS and gave the servers, instead of the key, only **permission to call KMS (an IAM role).** The key copies disappeared, usage records were left in CloudTrail, and blocking a departing employee came down to just **revoking permissions.**

## CloudHSM: Dedicated-Hardware Key Management

KMS runs on infrastructure shared by many customers (though the keys are isolated). But some regulated industries demand **"keep the keys on hardware dedicated to us, and don't let even AWS access them."** What you use then is **AWS CloudHSM.**

CloudHSM provides a customer-**dedicated hardware security module (HSM).** Keys are handled only inside validated dedicated hardware, and the customer has complete sole control over the keys. You choose it when you need stricter compliance (for example, FIPS 140-2 Level 3) or complete sole control over keys.

| Item | KMS | CloudHSM |
|------|-----|----------|
| Management model | AWS managed, easy integration | Customer-dedicated HSM, sole control |
| Ease of use | Very easy (service integration) | Relatively complex |
| Target | General encryption needs | Strict regulation / sole key control |

When you see "on dedicated hardware, with even AWS unable to access it, with complete sole control of the keys," it's CloudHSM. Otherwise, for general key management, KMS, with its easy integration, is the default choice.

Earlier we compared KMS to a **bank safe-deposit box.** Then CloudHSM is **a dedicated vault you install yourself in your home basement.** In return for the hassle of managing it, you can prove on your own that "nobody but me can touch what's in here." Only certain industries that have to submit that proof to auditors build a dedicated vault.

**Trap**: "Security matters more, so always CloudHSM" is a distractor option on the exam. If it says only "I want to manage encryption keys" with no special clue, the answer is **KMS.** For CloudHSM to be the answer, the question will necessarily contain clues such as **dedicated hardware,** **sole control,** **even AWS cannot access,** or **strict regulatory requirements (FIPS and so on).**

A company that handles card payment processing was told in an audit: "Identify the physical equipment where the keys used for payment authorization are stored and used, and submit a list of people who can access it." That was a question a managed service could not answer. The company moved only the payment authorization keys to CloudHSM and kept using KMS for the rest of the log and backup encryption. In reality, it is often like this: **"CloudHSM only for the part the regulation covers."**

## Secrets Manager: Safe Storage of Secret Information

Hardcoding **secrets** such as database passwords, API keys, and tokens in code, or leaving them as plaintext in configuration files, is dangerous. If they leak, it leads straight to a breach. **AWS Secrets Manager** stores such secret information safely and lets applications retrieve and use it safely at runtime.

The key feature is **automatic rotation.** For example, if you configure the password of an RDS database to be changed automatically on a schedule, the secret is refreshed regularly without anyone touching it.

When you see "store DB passwords/API keys safely and rotate them automatically, without embedding them in code," it's Secrets Manager. If you separate "keys (for encryption)" as KMS and "secrets (credentials)" as Secrets Manager, you won't get confused.

### Why This Service Came to Exist

When you start developing, everyone at some point writes the database address and password straight into the source code. The problem is that the code **isn't something only you look at.** The code is copied onto every team member's laptop, and it **remains in the past history of the version control repository even after you delete it.** Above all, to change the password you have to fix the code and redeploy, so **in the end nobody changes it.**

Secrets Manager flips this structure. You **put the password in a vault, not in the code, and write in the code only the name "which compartment of that vault."**

```
[Before] Code ──► "The password is p@ssw0rd!"   (as is, inside the code)
[Now]    Code ──► "Give me prod/orders-db/credentials"
                  ▼ (IAM permission check)
           [Secrets Manager] ──► Returns the currently valid value + periodic automatic rotation
```

Only when you change it this way does **automatic rotation** finally become possible. Since the value isn't embedded in the code, even if the vault swaps the password, the application simply receives the new value the next time it asks. For databases such as RDS, this rotation is integrated and updates both sides' values together.

### Secrets Manager vs Parameter Store

A pair that often appears together is **AWS Systems Manager Parameter Store.** Both store values safely, but their centers of gravity differ.

| Item | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| Main use | **Credentials** such as passwords and API keys | Configuration values and environment configuration parameters |
| Automatic rotation | **Supported as a built-in feature** | Not provided by default |
| Encryption | Encrypted with KMS | The secure string type is encrypted with KMS |
| Nature | Vault dedicated to secrets | General-purpose configuration store |

At the exam level, this one line is enough. **If the word "automatic rotation" is in the question, it's Secrets Manager.**

The services that appeared today have similar roles and often get mixed up, but if you divide them by **"what it stores,"** it's clean. Keys are KMS (CloudHSM if it's dedicated hardware), passwords and API keys are Secrets Manager, and TLS certificates are ACM.

**Trap**: The option "store API keys in KMS" looks plausible but is wrong. KMS is a place that **creates keys and lets you use them,** not a warehouse for putting arbitrary secret strings. Conversely, "create the key to encrypt the database in Secrets Manager" is also wrong. **Keys that you create and use are KMS; secret values that you put in and take out are Secrets Manager.**

## How This Appears on the Exam

Data protection questions in CLF-C02 are mostly simple **"clue in the sentence → service"** matching. When you see the expression on the left of the table below, recall the one on the right.

| Expression in the question | Answer direction |
|----------------------------|------------------|
| While moving across the network, interception, HTTPS, communication segment | Encryption in transit (TLS) |
| Stored on disk, kept in storage, loss of media | Encryption at rest |
| Issuing and renewing SSL/TLS certificates, expiration management | ACM |
| Centrally managing encryption keys for multiple AWS services | KMS |
| Dedicated hardware, sole control, even AWS cannot access, strict regulation | CloudHSM |
| DB password, API key, no hardcoding, **automatic rotation** | Secrets Manager |
| Tracking who used a key and when | CloudTrail (the key itself is KMS) |

**Wrong-answer traps**: ① A statement that lumps in-transit and at-rest together (they are separate) ② Choosing CloudHSM with no clue (the default is KMS) ③ A statement that encryption also solves permission problems (permissions are IAM's job) ④ Swapping Secrets Manager and KMS (**is it a secret value or a key?**).

## One-Line Identity of Each Encryption and Key Management Service

| Service/concept | One-line identity |
|-----------------|-------------------|
| Encryption in transit | Protects data moving across the network (TLS) |
| Encryption at rest | Protects data stored on disk |
| KMS | Creating and managing encryption keys (easy integration) |
| CloudHSM | Sole key control based on dedicated hardware |
| Secrets Manager | Storing passwords and API keys and rotating them automatically |

In the next article, we do a comprehensive review of all of Week 4 — the shared responsibility model, IAM, security services, compliance, and data protection — and sort out the points that are often confused on the exam all at once.

## 📖 Glossary

- **Encryption**: Turning data into a form that can't be read without the key. A device that makes theft pointless.
- **Plaintext / ciphertext / key**: The original that can be read as is / the result converted so it can't be recognized / the secret value that lets you move between the two.
- **Encryption in transit**: Protection while moving across the network. TLS in `https://` is the representative.
- **Encryption at rest**: Protection while sitting on disk or in storage. Usually turned on with a checkbox.
- **TLS/SSL**: A standard technology that seals the communication segment so it can't be read midway. What the browser padlock icon really is.
- **ACM (Certificate Manager)**: A service that issues, stores, and automatically renews TLS certificates. Prevents expiration incidents.
- **KMS**: A managed service that creates, stores, controls, and rotates encryption keys. The default choice for key management.
- **CloudHSM**: A customer-dedicated hardware security module. Used when you need sole key control that even AWS cannot access.
- **Secrets Manager**: A vault that stores credentials such as passwords and API keys and rotates them automatically on a schedule.
- **Parameter Store**: A general-purpose store for configuration values and parameters. Automatic rotation is Secrets Manager's job.
- **Defense in Depth**: A way of thinking that layers access control, encryption, and detection so that the system holds even if one is breached.

---

## 📝 Practice Questions

**Question 1.** Protecting data traveling between a web browser and a server from interception is which type of encryption?

A) Encryption at rest  
B) Encryption in transit  
C) Disk encryption  
D) Key rotation  

**Answer: B**  
Explanation: Protecting data moving across a network is encryption in transit, and TLS/SSL (HTTPS) is the representative technology. Encryption at rest and disk encryption protect stored data, and key rotation is a separate task of periodically refreshing encryption keys.

---

**Question 2.** You want to easily create and centrally manage encryption keys used across multiple AWS services such as S3, EBS, and RDS. Which service is most appropriate?

A) AWS Secrets Manager  
B) AWS KMS  
C) Amazon Macie  
D) AWS Artifact  

**Answer: B**  
Explanation: KMS is a fully managed service that integrates across AWS services to create, store, manage, and rotate encryption keys. Secrets Manager is for storing credentials such as passwords, Macie is for detecting S3 sensitive data, and Artifact is a compliance report download portal.

---

**Question 3.** Due to strict compliance requirements, you must control encryption keys solely in customer-dedicated hardware. Which service is most appropriate?

A) AWS managed keys in AWS KMS  
B) AWS CloudHSM  
C) AWS Secrets Manager  
D) Amazon Inspector  

**Answer: B**  
Explanation: CloudHSM provides a customer-dedicated Hardware Security Module (HSM) so you can control keys entirely on your own, which fits strict compliance requirements. KMS managed keys are based on AWS-managed shared infrastructure, Secrets Manager is for credential storage, and Inspector is a vulnerability assessment tool.

---

**Question 4.** You want to safely store database passwords and API keys without hardcoding them into code, and rotate them automatically on a schedule. Which service is most appropriate?

A) AWS KMS  
B) AWS CloudHSM  
C) AWS Secrets Manager  
D) AWS WAF  

**Answer: C**  
Explanation: Secrets Manager safely stores credentials such as passwords and API keys and supports automatic rotation. KMS and CloudHSM focus on managing encryption "keys," and WAF is a web attack filtering service.

---

**Question 5.** Which of the following statements about encryption at rest is correct?

A) It protects data being transmitted across a network  
B) It protects data stored on a disk or in storage so it can't be read without a key  
C) It refers to HTTPS communication  
D) It can only be used with EC2  

**Answer: B**  
Explanation: Encryption at rest protects data stored on disk/in storage so it can't be read without a key. Protecting network transmission and HTTPS correspond to encryption in transit, and encryption at rest is supported across various storage services such as S3, EBS, and RDS.

---
