# Day 3 - Compliance: Certificates, Compliance Programs, and the Nationality of Data

Stopping threats with security tools is one thing; "proving that we're following the laws and regulations" is another. Banks, hospitals, and government agencies can't just be safe — they have to **submit evidence to auditors**. They need to be able to answer questions like "Is the AWS you use certified to ISO 27001?" and "Is this an environment that can handle patient data (HIPAA)?"

Today we'll look at the three pillars of compliance: the tool for obtaining certificates (**AWS Artifact**), the compliance programs AWS adheres to, and **data sovereignty and Region selection**, which determine which country your data is stored in.

## AWS Artifact: The Compliance Report Download Center

The first thing you need when being audited is "the various certification and audit reports AWS has obtained." The place to get these is **AWS Artifact**. AWS Artifact is a portal where you can **download** AWS's security and compliance documents **on a self-service basis**.

Representative documents you can obtain here:

- **SOC reports** (SOC 1, 2, 3) — audit reports on a service organization's controls
- **ISO certificates** (ISO 27001, etc.)
- **PCI DSS** compliance attestation (related to handling credit card data)
- Documents on AWS's responsibility allocation for various regulations

AWS Artifact is free, and you can download reports right from the console to submit to auditors or regulatory bodies.

> 💡 **Related theory**: If a question asks "Where do you get AWS's compliance reports or certificates (SOC, ISO, PCI DSS, etc.)?", the answer is **AWS Artifact**. The key point is that it's not where you "create" certifications, but where you **download the evidence** of certifications already obtained.

## Compliance Programs: The Standards AWS Adheres To

AWS is **certified for or compliant with (including self-attested compliance)** countless regulations and standards around the world. Customers build their own workloads on top of this foundation.

| Program | Target area |
|----------|-----------|
| HIPAA | U.S. healthcare information protection |
| PCI DSS | Credit card payment data |
| ISO 27001 | Information security management system |
| SOC 1/2/3 | Service organization control audits |
| GDPR | EU personal data protection regulation |
| FedRAMP | U.S. federal government cloud security |

Here the **shared responsibility model** shows up once again. Just because AWS holds a compliance certification does **not** mean the customer's application is automatically compliant. AWS is responsible for compliance on the infrastructure side (of the cloud), while the customer is responsible for configuring their own data, applications, and access controls (in the cloud) to meet the regulations.

> 💡 **Related theory**: The answer to "AWS is HIPAA/PCI certified, so is our app automatically compliant too?" is **no**. Compliance is also a shared responsibility. AWS is responsible for the foundation; the customer is responsible for their own configuration on top of it.

## Data Sovereignty and Region Selection

"Our data must never leave the EU." A requirement like this is called **data sovereignty** or data residency. The laws of certain countries/regions require that their citizens' data be stored within their own territory (e.g., GDPR).

In AWS, the customer controls where data is physically stored **by selecting a Region**. For example, if data must stay only in the EU, you choose an EU Region such as Frankfurt (eu-central-1) or Ireland (eu-west-1).

An important principle: **unless the customer explicitly moves it, AWS does not move customer data outside the selected Region.** In other words, which Region to store data in is entirely the customer's decision.

```
[Data sovereignty requirement]   "Keep data only within the EU"
        │
        ▼
[Region selection]         Use an EU Region (Frankfurt/Ireland, etc.)
        │
        ▼
[Result]             Data is physically stored in the selected Region
```

> 💡 **Related theory**: When you see "data must be kept only within a certain country/region because of that jurisdiction's laws," the answer is to **select the corresponding Region**. Region selection is a key decision not only for latency and cost but also for **compliance (data sovereignty)**.

## The Four Considerations for Region Selection (Review)

When choosing a Region, you typically look at the following four factors. Compliance is one of them, and it's treated as especially important in the security domain.

| Consideration | Description |
|-----------|------|
| Compliance/data sovereignty | Is this a legally permitted location to store data? |
| Latency | Is it close to users? |
| Service availability | Are the services you need available in that Region? |
| Cost | Prices differ by Region |

## Wrapping Up

We laid out the three pillars of compliance. You obtain evidence documents from **AWS Artifact** on a self-service basis, and AWS adheres to various compliance programs like HIPAA, PCI DSS, and ISO. However, since compliance is also a shared responsibility, the customer's portion remains. And you control which country your data resides in directly through **Region selection** (data sovereignty).

In the next article, we'll cover **data protection**, which is directly tied to compliance — encryption in transit and at rest, KMS and CloudHSM, and Secrets Manager. It's about how to solve the requirement "keep data safe" with technology.

---

## 📝 연습 문제

**문제 1.** For an audit, you want to download AWS's SOC 2, ISO 27001, and PCI DSS compliance reports. Which service should you use?

A) AWS Artifact  
B) AWS Trusted Advisor  
C) Amazon Inspector  
D) AWS Config  

**정답: A**  
해설: AWS Artifact is a portal for self-service downloading of AWS's compliance reports and certificates such as SOC, ISO, and PCI DSS. Trusted Advisor is for best-practice checks, Inspector is for vulnerability assessment, and Config is for resource configuration tracking — none provide compliance report downloads.

---

**문제 2.** An EU company must store customer data only within Europe due to legal requirements. How can this be ensured in AWS?

A) Automatically replicate the data to all Regions  
B) Select an EU Region as the Region to store the data  
C) Enable Amazon Macie  
D) Subscribe to AWS Shield Advanced  

**정답: B**  
해설: AWS does not arbitrarily move data outside the customer's selected Region, so choosing an EU Region keeps data physically stored within Europe (data sovereignty). Replicating to all Regions would instead send data outside the EU, and Macie and Shield are not features for deciding data location.

---

**문제 3.** What is the correct understanding of the fact that AWS is PCI DSS certified?

A) Customer applications automatically become PCI DSS compliant too  
B) AWS is responsible for compliance on the infrastructure side, while the customer remains responsible for compliance of their own configuration  
C) The customer no longer needs to configure any security settings  
D) PCI DSS applies only to AWS and is unrelated to the customer  

**정답: B**  
해설: Compliance is also a shared responsibility. AWS is responsible for compliance of the cloud infrastructure (of the cloud), but the customer is responsible for configuring their own data, access controls, and configuration (in the cloud) to meet the regulations. AWS certification does not mean the customer's app is automatically compliant.

---

**문제 4.** What is the most direct means a customer can control to meet a data sovereignty requirement?

A) Choosing the instance type  
B) Configuring IAM groups  
C) Selecting the AWS Region where data is stored  
D) Configuring Auto Scaling  

**정답: C**  
해설: Where data is physically stored is determined by Region selection, and this is the direct means of meeting data sovereignty. Instance type, IAM groups, and Auto Scaling do not determine the geographic storage location of data.

---

**문제 5.** Which of the following is least relevant as a factor to consider when selecting a Region?

A) Compliance and data sovereignty requirements  
B) Latency to users  
C) Service availability in that Region  
D) The password length of IAM users  

**정답: D**  
해설: Region selection is based on compliance/data sovereignty, latency, service availability, and cost. The password length of IAM users is merely an account security policy setting and is unrelated to Region selection.

---
