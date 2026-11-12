# Day 5 - Week 4 Synthesis: Security and Compliance All in One

## 📌 Key Takeaways

- When you meet a security problem, **the first question is always "is this AWS's responsibility or the customer's?"** — the shared responsibility model is the starting point of every answer.
- Permissions are **IAM** (users, groups, roles, policies), and the first step of account security is **root MFA + least privilege.**
- Security services won't be confusing if you group them into three lumps: **those that block (WAF, Shield),** **those that find (GuardDuty, Inspector, Macie),** and **those that gather and show (Security Hub).**
- Compliance has two branches: **proof (download reports from Artifact)** and **location (Region selection = data sovereignty).**
- Data protection has three pillars: **encryption (in transit / at rest) + keys (KMS, CloudHSM) + secrets (Secrets Manager).**

This week covered **security and compliance**, the domain with the largest exam weight (30%). Today we review what you learned over the four days by threading it into a single line, and sort out the comparison points that are often confused on the exam. Rather than memorizing individual services again, we concentrate on building a **matching sense** of "which one for which situation."

There are two kinds of review. **Rereading** and **retrieving.** Rereading strengthens the feeling that you know it, but it doesn't come out in the exam room. Today's page has many tables, and you shouldn't just skim them with your eyes — read them by **looking only at the left column, recalling the right column first, and then checking.** Even with the same time spent, the amount that stays is different.

## 1) The Shared Responsibility Model: The Starting Point of Every Answer

When you meet a security problem, always ask first: "Is this AWS's responsibility or the customer's?"

- **AWS (of the cloud)**: Physical security, hardware, network infrastructure, the virtualization layer, and the foundation of managed services.
- **Customer (in the cloud)**: Data, encryption settings, access permissions (IAM), OS and app patches on EC2, firewall rules.

Two key principles: ① The more managed the service, the greater AWS's responsibility. ② **Data and access permissions are always the customer's responsibility** in every case.

The same principle applies to compliance. Even if AWS has PCI/HIPAA certification, the customer's app isn't automatically compliant. The foundation is AWS's, and the configuration on top of it is the customer's.

**Responsibility judgment practice.** Look only at the left of the items below, answer for yourself, and then check the right. On the exam, this sense turns directly into points.

| Situation | Responsibility |
|-----------|----------------|
| Data center access control and guards | AWS |
| Maintenance of physical servers and network equipment | AWS |
| Security of the hypervisor (virtualization layer) | AWS |
| Safe disposal of disks at end of life | AWS |
| Patching the foundation of a managed database engine | AWS |
| Security patches for the guest OS of an EC2 instance | Customer |
| Vulnerabilities in application code running on EC2 | Customer |
| Whether to leave an S3 bucket public or private | Customer |
| IAM user/password policy and MFA settings | Customer |
| Security group (firewall) rules | Customer |
| Whether to turn on data encryption, and which key to use | Customer |
| Which Region to store data in | Customer |

> ⚠️ **Trap**: A statement like "AWS has ISO 27001 certification, so our service is compliant too" is **wrong.** AWS's certification is about **the foundation AWS provides,** and doesn't vouch for what the customer put on top of it and how. By analogy, just because a building passed its fire inspection doesn't mean the business I run inside that building automatically becomes legal.

## 2) IAM: Who Can Do What

| Component | One line |
|-----------|----------|
| User | The credentials of one person or app |
| Group | A set of users, for managing permissions in bulk |
| Role | Temporary delegation of permissions (e.g., EC2 → S3 access) |
| Policy | JSON that defines permission rules |

Best practices to remember: no everyday use of the root user + **MFA required,** permissions under the **principle of least privilege,** and use a **role** when EC2 accesses other services (no hardcoding keys). IAM is a **free global service.**

Representative matches: "EC2 accesses S3 → role," "same permissions to many people → group," "first step to strengthen account security → root MFA."

The easiest way not to confuse the four components is to compare them to a **company access badge.**

| IAM component | Company analogy |
|---------------|-----------------|
| User | An access badge issued to an individual employee |
| Group | Permissions bundled per department, like the "sales team badge" |
| Role | A temporary badge lent to a visitor for a short time (to be returned) |
| Policy | The rulebook saying "this badge can go up to which floor" |

Seen through this analogy, it's also natural why "you must not embed an access key in code when EC2 accesses S3." Putting an access key in code is **copying a permanent badge and leaving it lying around anywhere;** using a role is **receiving a temporary badge when needed and letting it expire automatically.**

> ⚠️ **Trap**: A statement like "a role is something with stronger permissions than a user" is wrong. A role is a difference not in the strength of permissions but in **how credentials are given.** The key point is that **there are no permanent credentials such as passwords or access keys, and it is lent out temporarily when needed.**

## 3) The Six Security Services: What Threat Does Each Stop?

| Service | One-line identity |
|---------|-------------------|
| WAF | Filtering web attacks (SQL injection, XSS; L7) |
| Shield | DDoS (traffic flood) protection, Standard is free |
| GuardDuty | Detecting malicious activity through log analysis |
| Inspector | Vulnerability checks for EC2, containers, and Lambda |
| Macie | Discovering and classifying sensitive data (PII) in S3 |
| Security Hub | Integrated dashboard for security results |

Easily confused pairs:
- **WAF vs Shield**: WAF is "request content (web attacks)," Shield is "traffic volume (DDoS)."
- **GuardDuty vs Inspector**: GuardDuty is "malicious behavior happening now," Inspector is "weaknesses that make you easy to attack (vulnerabilities)."
- **Individual detection vs integration**: GuardDuty/Inspector/Macie detect, and Security Hub gathers and views.

The exam asks for "the service that fits this scenario." If each service's one-line identity is clear, most questions are solved.

**Remembering them in three lumps.** If you memorize the six by listing them, they get mixed up in the exam room. Grouped by role, there are only three lumps.

```
[Blocks]               WAF (inspects web request content) · Shield (defends against traffic floods)
[Finds]                GuardDuty (suspicious behavior) · Inspector (weaknesses) · Macie (sensitive data)
[Gathers and shows]    Security Hub (integrated dashboard of detection results)
```

Once you have this frame, even when an unfamiliar scenario appears, you can narrow it down starting with "is this situation about blocking, finding, or gathering and viewing?"

**Situation → service quick-answer practice**

| When given this situation | Answer |
|---------------------------|--------|
| You want to stop attempts to inject a malicious script through a bulletin board input field | WAF |
| Massive traffic of unknown origin has made the service slow | Shield |
| You want to know whether unusual API calls are happening in your account | GuardDuty |
| You want to check whether known vulnerabilities remain on your EC2 | Inspector |
| You want to find out whether national ID numbers or card numbers got mixed in somewhere in S3 | Macie |
| You want to see the security alerts spat out by several tools on one screen | Security Hub |

**Trap**: **GuardDuty and Inspector** are an easily swapped pair. Distinguished by one word, GuardDuty is **behavior** and Inspector is **state.** "Someone is doing something strange right now" is GuardDuty; "our server has a hole that can be breached" is Inspector. One more: **Macie is not a blocking service.** Macie's job is not "block the leak of sensitive data" but "find where the sensitive data is."

## 4) Compliance: Proof and the Nationality of Data

- **AWS Artifact**: A portal for **downloading** AWS compliance reports such as SOC, ISO, and PCI DSS on a self-service basis.
- AWS complies with a wide range of programs including HIPAA, PCI DSS, ISO 27001, SOC, GDPR, and FedRAMP.
- **Data sovereignty**: If regulations require data to stay only in a particular area → **select the relevant Region.** AWS does not arbitrarily move customer data outside the Region you selected.

The key matches are "Where do I get compliance reports? → Artifact" and "Data only in the EU? → select an EU Region."

In this domain, people get it wrong not because the concepts are hard but because they **get confused with tools that have similar names.** Let's separate the three below.

| Tool | What it does | One-sentence distinction |
|------|--------------|--------------------------|
| Artifact | **Downloading** AWS compliance reports and certificates | "Fetch the evidence documents" |
| CloudTrail | Records **who did what** in my account | "Our own audit log" |
| Config | Tracks and evaluates whether my resources' **configuration matches the rules** | "Our own configuration inspection" |

A Korean software company that had begun taking European customers received two demands at the same time during its first overseas contract. One was "Submit documents showing that the cloud you use meets international security standards," and the other was "Our citizens' data must not leave Europe." The first person in charge treated the two demands as the same problem and floundered for a while, but the actual solutions were completely different. The former was paperwork that finished once they **downloaded the reports from AWS Artifact and attached them;** the latter was a design decision to **create resources in an EU Region and keep the data only there.** On the exam too, these two always appear side by side in one question, so separate them as **proof is Artifact, location is Region.**

## 5) Data Protection: Encryption, Keys, and Secrets

| Service/concept | One-line identity |
|-----------------|-------------------|
| Encryption in transit | Protection while moving across the network (TLS/HTTPS) |
| Encryption at rest | Protects data stored on disk |
| KMS | Encryption key management (easy integration, default choice) |
| CloudHSM | Sole key control on dedicated hardware (strict regulation) |
| Secrets Manager | Storing passwords and API keys, automatic rotation |

Easily confused pairs:
- **in transit vs at rest**: Protection while moving vs protection while stored.
- **KMS vs CloudHSM**: Easy integration (default) vs sole control on dedicated hardware (strict).
- **KMS vs Secrets Manager**: Managing encryption "keys" vs storing "credentials (secrets)."

## The Whole Picture on One Flowchart

```
[Who can do what?]         IAM (users/groups/roles/policies, MFA, least privilege)
[Whose responsibility?]    Shared responsibility model (AWS = of / customer = in)
[Block external threats]   WAF (web) · Shield (DDoS)
[Detect internal threats]  GuardDuty · Inspector · Macie → Security Hub
[Compliance proof/location] Artifact (reports) · Region selection (data sovereignty)
[Data protection]          Encryption (in transit/at rest) · KMS/CloudHSM · Secrets Manager
```

Week 4 is the domain where security is a shared responsibility and you choose the customer-side tools appropriately. If you pin down each service's one-line identity and the differences between the confusing pairs, you can prepare for the security domain.

## How This Appears on the Exam: A Keyword → Answer Roundup

In security domain questions, mostly **one or two words in the sentence decide the answer.** The goal of this week's review is to reach a state where, on seeing the expression on the left of the table below, the right comes to mind immediately.

| Expression in the question | Answer direction |
|----------------------------|------------------|
| Data center, physical security, hardware, virtualization layer | AWS responsibility |
| Guest OS patches, applications, access permissions, encryption settings | Customer responsibility |
| Same permissions to many users at once | IAM group |
| EC2 accesses other services, without putting keys in code | IAM role |
| First step to strengthen account security | Enable MFA on the root user |
| Only as much as needed, broad permissions are risky | Principle of least privilege |
| SQL injection, XSS, filtering malicious web requests | WAF |
| Traffic flood, service paralysis, provided by default for free | Shield (Standard) |
| Detecting malicious activity, log-based threat alerts | GuardDuty |
| Vulnerability checks, scanning for known flaws | Inspector |
| Discovering and classifying personal information (PII) in S3 | Macie |
| Viewing security alerts gathered in one place | Security Hub |
| Need to obtain SOC, ISO, PCI reports | Artifact |
| Data must not leave a particular country or area | Select the relevant Region (data sovereignty) |
| Who called which API and when | CloudTrail |
| Continuously checking whether resource configuration meets standards | Config |
| Preventing interception, HTTPS, protecting the communication segment | Encryption in transit (TLS) |
| Protecting data stored on disk or in storage | Encryption at rest |
| Centrally managing encryption keys for multiple services | KMS |
| Dedicated hardware, sole control, even AWS cannot access | CloudHSM |
| Storing DB passwords and API keys, **automatic rotation** | Secrets Manager |

## The 10 Most Commonly Missed Wrong-Answer Traps

Across the whole week, these are only the points where people actually trip the most. It helps to remember each item in the form "if it's written like this, it's wrong."

1. **"AWS has certification, so our service is compliant too"** — The foundation and the configuration on top of it are separate.
2. **"AWS takes care of data security on its own"** — Data and access permissions are always the customer's share in any service.
3. **"Create root access keys and use them for automation"** — The principle is not to create root keys.
4. **"For convenience, give admin permissions first and reduce them later"** — The exact opposite of least privilege.
5. **"Put an access key on EC2 to access S3"** — The answer is always an IAM role.
6. **"Block DDoS with WAF" / "Block SQL injection with Shield"** — The two have been swapped. Content is WAF, volume is Shield.
7. **"Use Inspector to detect an intrusion happening now"** — That's GuardDuty. Inspector is a weakness check.
8. **"Macie blocks leaks of sensitive data"** — Macie is on the side of finding and notifying.
9. **"Get compliance reports from Trusted Advisor / Security Hub"** — The report portal is Artifact alone.
10. **"Turning on encryption alone makes a mistaken public setting safe"** — Encryption doesn't stop permission mistakes.

**Trap**: Among the list, items 6 and 7 are by far the most commonly missed pairs. If you get confused in the exam room, chant this: **"WAF reads the contents of the letter, Shield counts the number of letters. GuardDuty catches the criminal in the act, Inspector finds the open window."**

## Self-Check Checklist

If you can answer "yes" to every item below, Week 4 is done. If you get stuck on even one, go back to that day's article.

**Shared responsibility model (Day 1)**

- [ ] You can explain "of the cloud" and "in the cloud" in one sentence each.
- [ ] When handed an arbitrary item, you can immediately judge whether it is AWS's or the customer's responsibility.
- [ ] You know which way the responsibility boundary moves as you go toward managed services.

**IAM (Day 1)**

- [ ] You can tell and explain the differences among user, group, role, and policy without analogies.
- [ ] You can explain why a role is the answer when EC2 needs to access S3.
- [ ] You can name three best practices for the root user.

**Security services (Day 2)**

- [ ] You can classify the six services as "block / find / gather and view."
- [ ] You can state the difference between WAF and Shield, and between GuardDuty and Inspector, in one sentence each.

**Compliance (Day 3)**

- [ ] You know where to get compliance reports.
- [ ] You know what to adjust when a data sovereignty requirement comes up.

**Data protection (Day 4)**

- [ ] You can tell encryption in transit from encryption at rest, and you know they are separate.
- [ ] You can explain why KMS is the default choice and CloudHSM is the exception.
- [ ] You can tell which service is in charge of "keys" and which of "secret values."

Next week we move on to the cost management and support (pricing, billing, support plans) domain and sort out the "money talk" of the cloud.

## 📖 Glossary

- **Shared responsibility model**: A way of splitting cloud security between AWS and the customer. The foundation is AWS's; what is put on top of it is the customer's.
- **of the cloud / in the cloud**: Security "of the cloud itself" (AWS) / security of "what is put in the cloud" (customer).
- **IAM**: A service that decides who can do what. It is free and has no Region distinction.
- **Role**: A way of lending permissions temporarily without permanent credentials. Attached to services such as EC2.
- **Least privilege principle**: The principle of granting only as many permissions as the work absolutely needs, starting narrow and widening when necessary.
- **MFA (multi-factor authentication)**: A sign-in method that requires a second means of verification in addition to the password. Required for the root user.
- **WAF / Shield**: Inspecting and blocking the **content** of web requests / blocking **volume** attacks on traffic (DDoS).
- **GuardDuty / Inspector**: Detecting **suspicious behavior** happening now / checking for **weaknesses (vulnerabilities)** left in the system.
- **Macie**: A service that finds and classifies sensitive data such as personal information stored in S3 and reports it.
- **Security Hub**: An integrated dashboard that gathers the detection results of multiple security services onto one screen.
- **AWS Artifact**: A portal for downloading AWS compliance reports and certificates yourself.
- **Data sovereignty**: The legal requirement that data be kept only within a particular country or area. Addressed by selecting a Region.
- **KMS / CloudHSM**: A managed vault for encryption keys (default choice) / sole control on customer-dedicated hardware (exceptional cases).
- **Secrets Manager**: A vault that stores credentials such as passwords and API keys and rotates them automatically.

---

## 📝 Practice Questions

**Question 1.** According to the shared responsibility model, who is responsible for security patching of the operating system running on an EC2 instance?

A) AWS  
B) The customer  
C) AWS and the customer perform it jointly and directly  
D) There is no responsible party  

**Answer: B**  
Explanation: With EC2 (IaaS), patching the guest operating system and applications is the customer's responsibility ("in the cloud"). AWS is responsible for the "of the cloud" area such as the physical infrastructure and the virtualization layer. Patching responsibility shifts to AWS as you move toward managed services, but the OS of EC2 is the customer's portion.

---

**Question 2.** Which service defends against attacks that flood a service with massive traffic simultaneously (DDoS) and is provided free by default to all customers?

A) AWS WAF  
B) AWS Shield Standard  
C) Amazon GuardDuty  
D) Amazon Macie  

**Answer: B**  
Explanation: Shield Standard is provided free to all customers and automatically defends against DDoS (traffic floods). WAF is web attack (SQL injection/XSS) filtering, GuardDuty is malicious activity detection, and Macie is S3 sensitive data detection — none are DDoS defense services.

---

**Question 3.** A company wants to easily manage encryption keys to use across AWS services. What is the most appropriate default choice for general needs?

A) AWS CloudHSM  
B) AWS KMS  
C) AWS Secrets Manager  
D) AWS Artifact  

**Answer: B**  
Explanation: KMS is the default choice that integrates with AWS services to easily create and manage encryption keys. CloudHSM is used in strict cases requiring sole key control in dedicated hardware, Secrets Manager is for credential storage, and Artifact is the compliance report portal.

---

**Question 4.** For an audit, you need to obtain AWS's ISO 27001 certificate and SOC reports. Separately, you must store data only within the EU. What is the correct combination of actions for each?

A) Download reports from Artifact / Select an EU Region  
B) Generate reports with Inspector / Replicate to all Regions  
C) Download reports with Trusted Advisor / Change the instance type  
D) Issue certificates with Security Hub / Configure IAM groups  

**Answer: A**  
Explanation: Compliance reports are downloaded self-service from AWS Artifact, and the data sovereignty requirement is met by selecting an EU Region. Inspector, Trusted Advisor, and Security Hub are not report-issuing portals, and replicating to all Regions, changing the instance type, and IAM groups are unrelated to the data storage location requirement.

---

**Question 5.** You want to safely store a database password without hardcoding it into code and rotate it automatically on a schedule. Which service is most appropriate?

A) AWS Secrets Manager  
B) Amazon Inspector  
C) AWS WAF  
D) Amazon Macie  

**Answer: A**  
Explanation: Secrets Manager safely stores credentials such as passwords and API keys and supports automatic rotation. Inspector is for vulnerability assessment, WAF is for web attack filtering, and Macie is for S3 sensitive data detection — none provide credential storage and rotation.

---
