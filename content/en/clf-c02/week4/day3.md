# Day 3 - Compliance: Certificates, Certification Programs, and the Nationality of Data

## 📌 Key Takeaways

- **Compliance** is different from "being secure." It refers to a state in which you can **prove** your security **to a third party**.
- **AWS Artifact** is a **self-service window for downloading** the certificates and audit reports AWS has received. It is not a place that creates certifications.
- AWS follows a wide range of compliance programs, such as HIPAA, PCI DSS, ISO 27001, SOC, GDPR, and FedRAMP.
- **Compliance is also a shared responsibility.** Just because AWS has received a certification, your application is not automatically compliant.
- In which country data is physically stored is something the customer controls directly through **Region selection** (data sovereignty).

Blocking threats with security tools is a different job from "proving that we are obeying laws and regulations." Banks, hospitals, and government agencies are not satisfied with merely being secure; they must **submit evidence to auditors**. You must be able to answer questions like "Is the AWS you use ISO 27001 certified?" and "Is it an environment that can handle patient data (HIPAA)?"

Today we look at the three pillars of compliance: the tool for obtaining certificates (**AWS Artifact**), the compliance programs AWS follows, and **data sovereignty and Region selection**, which determine in which country data is stored.

## "Being Secure" and "Proving You Are Secure" Are Different

If the word compliance sounds stiff, it helps to think of a neighborhood restaurant.

Suppose a restaurant owner really does keep the kitchen spotless. They use only good ingredients and clean every day. But when a customer asks, "Is this place hygienic?", what should the owner say? They can say, "I clean every day," but the customer has no way to verify it. That is why systems like hygiene grades and regular inspections came about. **A third party comes, checks, and leaves the result as a document or a sign.**

Corporate systems are exactly the same. The statement "Our service is secure" means nothing. To deliver a system to a bank, to handle hospital data, or to join a government project, you have to present **evidence that someone has verified it**.

| Category | Security | Compliance |
|------|---------------|---------------------|
| Purpose | Actually making things secure | Proving to others that things are secure |
| Who judges | Our team | Auditors, regulators, customer companies |
| Deliverables | Firewall settings, encryption, permission policies | Certificates, audit reports, supporting evidence |
| Restaurant analogy | Actually keeping the kitchen clean | Getting a hygiene inspection and posting the grade |

The two overlap but are not the same. Even if security is excellent, without documents to prove it you cannot get the contract, and conversely, having the paperwork does not mean you are actually secure.

It helps to get a feel for how these document demands actually arrive. As a company grows, customer companies start asking, "Please send us your security assessment materials." At first it is a few pages of questions, but if the other side is in finance or the public sector, a checklist with hundreds of items arrives. A large share of them are infrastructure questions such as **"How do you control access to the data center?"**, and a company that uses the cloud cannot answer this part directly. So you need a document that AWS can answer with on your behalf — that is Artifact, coming up next.

## AWS Artifact: The Compliance Report Download Center

The first thing you need when you undergo an audit is "the various certifications and audit reports AWS has received." The place to get these is **AWS Artifact**. AWS Artifact is a portal where you can **download AWS's security and compliance documents on a self-service basis**.

Representative documents you can get here:

- **SOC reports** (SOC 1, 2, 3) — control audit reports for service organizations
- **ISO certificates** (ISO 27001 and others)
- **PCI DSS** compliance attestation (related to handling credit card data)
- Responsibility-sharing documents for various regulations

AWS Artifact is free, and you can download the reports straight from the console and submit them to auditors or regulators.

### Why Is There a Separate Window for This?

Before the cloud, getting this kind of material went like this. A staff member emailed the data center operator to say "I'd like to get your security audit report," the other company's legal and sales staff reviewed the request, nondisclosure agreements were exchanged, and the file arrived days or weeks later. Meanwhile the audit date kept getting closer.

Artifact shrank this process to **a few clicks in the console**. You pick the report you need and download it right away. Some documents are sensitive, so you receive them after agreeing to confidentiality terms, but that consent procedure itself is also completed on screen.

In addition, in Artifact you can also handle **some agreements you enter into with AWS**. For example, to handle US health information you need to conclude a related agreement, and you review and accept such things in the console.

> ⚠️ **Pitfall**: What Artifact gives you is **evidence about AWS itself**. If you choose Artifact as the answer to a demand such as "create a report showing that our company's system complies with the regulations," you will be wrong. Gathering evidence for my own system is the job of another service (Audit Manager), and tracking whether my resource settings match the rules is Config. Do not lose sight of the fact that Artifact is a **download window**.

If a question asks, "Where do I get AWS's compliance reports or certificates (SOC, ISO, PCI DSS, and so on)?", the answer is **AWS Artifact**. The key is that it is not a place that "creates" certifications but a place that **downloads the evidence** of certifications already received.

### Telling Apart Four Easily Confused Services

When compliance comes up, a few services show up together. Their names all look similar, so we separate them in a table.

| Service | One-line identity | Target |
|--------|-------------|------|
| **Artifact** | A window for downloading AWS's certificates and audit reports | AWS itself |
| **Audit Manager** | A tool that gathers audit evidence for my AWS usage | My account |
| **Config** | Records configuration changes to my resources and finds rule violations | My resources |
| **Trusted Advisor** | Provides check results against best practices for cost, performance, security, and more | My account overall |

The pair that is easiest to confuse is **Artifact and Audit Manager**. It is easy if you remember that the directions are opposite — Artifact is evidence **AWS gives to me**, and Audit Manager is a tool that gathers evidence **I will hand over to others**.

## Compliance Programs: The Standards AWS Follows

AWS has **obtained certification for or complies with (including voluntary compliance)** a great many regulations and standards around the world. Customers build their own workloads on top of this foundation.

| Program | Area covered |
|----------|-----------|
| HIPAA | US health information protection |
| PCI DSS | Credit card payment data |
| ISO 27001 | Information security management system |
| SOC 1/2/3 | Service organization control audits |
| GDPR | EU personal data protection regulation |
| FedRAMP | US federal government cloud security |

From the names alone they sound like another country's business, but **depending on what business you run, they become your own business right away.** Attaching to each the moment it becomes a problem makes it stay in memory longer.

| Program | Shows up in this kind of situation |
|----------|----------------------|
| HIPAA | When building a service that handles US patients' health information |
| PCI DSS | When adding a payment feature that receives and processes card numbers directly |
| ISO 27001 | When an enterprise customer asks, "Do you have an information security management certification?" |
| SOC 1/2/3 | When a customer company's audit team requests a control audit report |
| GDPR | When you will handle the personal data of EU residents |
| FedRAMP | When providing services to US federal government agencies |

Each country also has its own national schemes. There are things required in domestic business, such as Korea's information security management system certification, and since the list of AWS compliance programs keeps growing, the real list should be checked on the AWS compliance page. For the exam, knowing at the level of the table above — "this name belongs to this field" — is enough.

The most practical benefit from the customer's point of view is **inherited controls**. Items such as data center access control, server disposal procedures, and redundant power and cooling cannot be proven directly by the customer no matter how hard they try. When you use the cloud, these items are already audited by AWS, and the customer can paste those results straight into their own audit materials. It is like **building a house on land where the groundwork has already been done**, and it is one of the big reasons companies in regulated industries move to the cloud.

Here the **shared responsibility model** appears once again. Just because AWS has received a compliance certification, the customer's application does **not** automatically comply with the regulations. AWS is responsible for compliance on the infrastructure side (of the cloud), and the customer is responsible for configuring their own data, applications, and access controls (in the cloud) so that they follow the regulations.

Returning to the building analogy, it goes like this. **Moving into a building fully equipped with fire safety systems does not mean you may pile boxes in the hallway of your own office.** The building having passed the safety standards and our office being safe are separate matters.

| Item | Whose responsibility is it? |
|------|--------------|
| Proving that the data center passed its audit | AWS |
| Adequacy of the server hardware disposal procedures | AWS |
| Whether we encrypted our database | Customer |
| Whether we limited who can access personal data | Customer |
| Whether we keep records of who viewed data and when | Customer |

> ⚠️ **Pitfall**: An option such as "AWS complies with HIPAA, so just by putting it on AWS you may handle medical data" is wrong. What AWS provides is **an environment on top of which you can comply with the regulations**, not compliance itself. When a question carries expressions like "automatically" or "even if the customer does nothing," it is mostly a wrong-answer signal.

The answer to "AWS has HIPAA/PCI certification, so is our app automatically compliant too?" is **no**. Compliance is also a shared responsibility. AWS is responsible for the foundation, and the customer is responsible for their own configuration on top of it.

Compliance is a shared responsibility too. Even if AWS has been certified, the compliance of the workloads you put on top of it remains the customer's share.

## Data Sovereignty and Region Selection

"Our data must never leave the EU." This kind of requirement is called **data sovereignty** or data residency. The laws of some countries and regions stipulate that their citizens' data must be stored within their territory (for example, GDPR).

On AWS, **the customer controls where data is physically stored by choosing the Region**. For example, if data must stay only in the EU, you choose an EU Region such as Frankfurt (eu-central-1) or Ireland (eu-west-1).

An important principle: **unless the customer explicitly moves it, AWS does not move customer data outside the Region the customer chose.** In other words, which Region to put data in is entirely the customer's decision.

```
[Data sovereignty requirement]   "Keep data only inside the EU"
        │
        ▼
[Region selection]               Use an EU Region (Frankfurt/Ireland, etc.)
        │
        ▼
[Result]                         Data is physically stored in the chosen Region
```

### Why Do Countries Care About Where Data Is?

"Whether data is in Seoul or Tokyo, isn't it the same once connected through the internet?" Technically, almost. The problem is not technology but **law**.

When data is physically located in a country's territory, that country's laws reach that data. That country's investigative agencies may demand access through set procedures, and if a dispute arises, which country's court it is fought in also differs. That is why countries try to control the location of their citizens' sensitive information — medical records, financial transactions, public data.

The strength of regulation differs from country to country. There are strong requirements such as **"it must be kept only inside the country,"** and there are forms such as **"to send it abroad, meet additional conditions."** Either way, the answer is the same from the standpoint of a company using the cloud — you have to decide consciously which Region to put the data in.

**Pitfall**: An explanation such as "AWS automatically replicates data to the nearest Region for you" is wrong. Cross-Region replication happens only when **the customer explicitly sets it up**; it does not happen automatically. In a situation with a data sovereignty requirement, turning on such replication would actually violate the regulations, so be suspicious when an expression like "automatic replication across multiple Regions" appears as the answer.

A Korean software company preparing to expand into Europe received an unexpected question at the very end of a contract negotiation. The legal team of the local customer company demanded, "Please state the physical location where our employees' data will be stored." The company's system was running only in the Seoul Region, and in the end the design had to be changed so that data for European customers was kept separately in a European Region. It was not technically difficult work, but **what would have taken a few days if considered from the start became a job of several weeks right before the contract.** This is why Region selection is not a "setting you can change later" but an early design decision.

When you see "because of the laws of a specific country/region, data must be kept only inside it," the answer is to **choose that Region**. Region selection is a key decision not only for latency and cost but also for **compliance (data sovereignty)**.

AWS fetches the building's safety inspection report card for you, but whether our office is safe is something we must prove ourselves. Which country's building that office sits in is settled the moment you choose a Region.

## Four Factors in Choosing a Region (Review)

When choosing a Region, you usually look at the following four things. Compliance is one of them, and it is treated as especially important in the security domain.

| Factor | Description |
|-----------|------|
| Compliance/data sovereignty | Is it a location where you are legally allowed to put the data? |
| Latency | Is it close to the users? |
| Service availability | Does that Region have the services you need? |
| Cost | Prices differ by Region |

The four look equal, but in practice there is an order. **Compliance is not up for negotiation.** If the law says no, no matter how cheap, fast, or rich in services a Region is, it drops out of the candidates. The other three can be traded against each other — for example choosing a Region closer to users even if it costs a bit more, or choosing a Region that has the needed services even if it is a bit farther.

```
① Keep only the Regions that are permitted by regulation   ← if blocked here, it is over
② Among the remaining candidates, the one close to users
③ Check whether the needed services are available
④ Compare costs and decide
```

## How It Shows Up on the Exam

Compliance questions are formulaic in wording, so catching just the table below solves most of them.

| Phrase in the question | Answer direction |
|-------------------|----------|
| I want to get SOC, ISO, or PCI DSS reports | AWS Artifact |
| I need AWS certification evidence to submit to auditors | AWS Artifact |
| I want to automatically collect audit evidence for my system | AWS Audit Manager |
| I want to track whether my resource settings match the rules | AWS Config |
| Data must be kept only inside a specific country | Choose that Region |
| "AWS is certified, so are we automatically compliant too?" | No, shared responsibility |
| Factors to consider when choosing a Region | Compliance, latency, service availability, cost |
| "Does AWS move data to another Region?" | Not unless the customer moves it |

In the next article, we cover **data protection**, which is directly tied to compliance — encryption in transit and at rest, KMS and CloudHSM, and Secrets Manager. It is about how to solve the requirement "keep data safe" with technology.

## 📖 Glossary

- **Compliance** : A state in which you can prove to a third party that you are obeying laws, regulations, and standards.
- **Audit** : A procedure in which an outside expert or regulator checks whether the rules were actually followed.
- **AWS Artifact** : A free portal where you download the certificates and audit reports AWS has received, on a self-service basis.
- **AWS Audit Manager** : A service that automatically gathers audit evidence for my AWS usage. Its direction is opposite to Artifact.
- **SOC report** : A report auditing whether a service organization's internal controls operate properly (SOC 1/2/3).
- **ISO 27001** : An international standard certification for information security management systems.
- **PCI DSS** : A security standard that organizations handling credit card data must follow.
- **HIPAA** : US regulations on the protection of health information.
- **GDPR** : The EU's personal data protection regulation.
- **FedRAMP** : The security certification framework the US federal government requires of cloud services.
- **Data sovereignty** : The principle that the laws of the country where data is stored apply to that data, and the location regulation that results from it.
- **Data residency** : The requirement that data be kept inside a specific region.
- **Inherited controls** : A customer making use, in their own audit materials, of items AWS has already had audited, such as data center physical security.

---

## 📝 Practice Questions

**Question 1.** For an audit, you want to download AWS's SOC 2, ISO 27001, and PCI DSS compliance reports. Which service should you use?

A) AWS Artifact  
B) AWS Trusted Advisor  
C) Amazon Inspector  
D) AWS Config  

**Answer: A**  
Explanation: AWS Artifact is a portal for self-service downloading of AWS's compliance reports and certificates such as SOC, ISO, and PCI DSS. Trusted Advisor is for best-practice checks, Inspector is for vulnerability assessment, and Config is for resource configuration tracking — none provide compliance report downloads.

---

**Question 2.** An EU company must store customer data only within Europe due to legal requirements. How can this be ensured in AWS?

A) Automatically replicate the data to all Regions  
B) Select an EU Region as the Region to store the data  
C) Enable Amazon Macie  
D) Subscribe to AWS Shield Advanced  

**Answer: B**  
Explanation: AWS does not arbitrarily move data outside the customer's selected Region, so choosing an EU Region keeps data physically stored within Europe (data sovereignty). Replicating to all Regions would instead send data outside the EU, and Macie and Shield are not features for deciding data location.

---

**Question 3.** What is the correct understanding of the fact that AWS is PCI DSS certified?

A) Customer applications automatically become PCI DSS compliant too  
B) AWS is responsible for compliance on the infrastructure side, while the customer remains responsible for compliance of their own configuration  
C) The customer no longer needs to configure any security settings  
D) PCI DSS applies only to AWS and is unrelated to the customer  

**Answer: B**  
Explanation: Compliance is also a shared responsibility. AWS is responsible for compliance of the cloud infrastructure (of the cloud), but the customer is responsible for configuring their own data, access controls, and configuration (in the cloud) to meet the regulations. AWS certification does not mean the customer's app is automatically compliant.

---

**Question 4.** What is the most direct means a customer can control to meet a data sovereignty requirement?

A) Choosing the instance type  
B) Configuring IAM groups  
C) Selecting the AWS Region where data is stored  
D) Configuring Auto Scaling  

**Answer: C**  
Explanation: Where data is physically stored is determined by Region selection, and this is the direct means of meeting data sovereignty. Instance type, IAM groups, and Auto Scaling do not determine the geographic storage location of data.

---

**Question 5.** Which of the following is least relevant as a factor to consider when selecting a Region?

A) Compliance and data sovereignty requirements  
B) Latency to users  
C) Service availability in that Region  
D) The password length of IAM users  

**Answer: D**  
Explanation: Region selection is based on compliance/data sovereignty, latency, service availability, and cost. The password length of IAM users is merely an account security policy setting and is unrelated to Region selection.

---
