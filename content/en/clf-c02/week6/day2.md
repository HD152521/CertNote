# Day 2 - Domain Review 2: Security & Compliance + Billing, Pricing & Support Core Recap

Yesterday we organized Cloud Concepts and Technology & Services. Today we recap the remaining two domains: **Domain 2 (Security & Compliance, 30%)** and **Domain 4 (Billing, Pricing & Support, 12%)**. Domain 2 is the second largest by weight, so it shows up often, and while Domain 4 is small, it packs together easily confused points like IAM and pricing tools.

## Domain 2 Core — Security & Compliance

### Shared Responsibility Model

This is the most important concept. It's split into "security *of* the cloud vs. security *in* the cloud."

| Responsible party | Area of responsibility | Examples |
|-----------|-----------|------|
| AWS (of the Cloud) | Infrastructure security | Physical facilities, hardware, network, hypervisor |
| Customer (in the Cloud) | Data and configuration security | Data encryption, IAM setup, OS patching, security groups |

> 💡 **Related theory**: "Customer data encryption," "IAM user management," and "EC2 guest OS patching" are always **the customer's responsibility**. Conversely, "physical data center security" and "hardware disposal" are **AWS's responsibility**. Note, however, that for managed services (such as RDS), AWS handles the OS patching.

### IAM (Identity and Access Management)

| Element | Core idea |
|------|------|
| User | Credentials for an individual person/application |
| Group | A collection of users; grant permissions in bulk |
| Role | Temporary permission delegation (between services, federation) |
| Policy | A JSON permissions document; apply the principle of least privilege |

- **Root user**: Never use it for daily work; **enable MFA** and lock it away.
- **Principle of least privilege**: Grant only the permissions that are strictly necessary.

### Key Security Services

| Service | Role |
|--------|------|
| IAM | Authentication and authorization |
| AWS Shield | DDoS protection |
| AWS WAF | Web application firewall (blocks SQL injection, XSS) |
| GuardDuty | Threat detection (intelligent monitoring) |
| Amazon Inspector | Automated vulnerability assessment |
| KMS | Encryption key management |
| Secrets Manager | Stores passwords and keys and rotates them automatically |
| AWS Config | Tracks resource configuration and compliance |
| CloudTrail | API call audit logs |

> 💡 **Related theory**: "Who did what (API auditing)" is **CloudTrail**, "whether resources comply with rules" is **Config**, and "performance/metrics monitoring" is **CloudWatch**. Distinguishing these three is a perennial trap.

### Compliance Tools

- **AWS Artifact**: Download compliance reports (SOC, PCI DSS, etc.).
- **AWS Compliance Center / Programs**: Information about certification programs.

## Domain 4 Core — Billing, Pricing & Support

### EC2 Pricing Models

| Model | Characteristics | Best for |
|------|------|-------------|
| On-Demand | Pay as you go, no commitment | Short-term, unpredictable workloads |
| Reserved Instances (RI) | 1–3 year commitment, large discount | Stable, ongoing workloads |
| Savings Plans | Discount based on a usage commitment | Flexible long-term savings |
| Spot Instances | Up to 90% discount, can be interrupted | Fault-tolerant batch jobs |

### Cost Management and Billing Tools

| Tool | Purpose |
|------|------|
| AWS Pricing Calculator | Estimate costs in advance |
| AWS Cost Explorer | Visualize/analyze usage and cost trends |
| AWS Budgets | Set budgets and get alerts when exceeded |
| Cost and Usage Report (CUR) | The most detailed billing data |
| Billing Conductor | Custom billing |

> 💡 **Related theory**: "I want to be alerted when I exceed a budget" is **Budgets**, "analyze past cost trends" is **Cost Explorer**, and "estimate resources not yet created" is **Pricing Calculator**.

### AWS Organizations & Consolidated Billing

- **Organizations**: Group multiple accounts for central management.
- **Consolidated Billing**: Combine billing into one to share **volume discounts**.
- **SCP (Service Control Policy)**: Restrict the allowed actions per account.

### Support Plans

| Plan | Core idea |
|------|------|
| Basic | Free; documentation and forums |
| Developer | Email support during business hours |
| Business | 24/7 technical support, full Trusted Advisor |
| Enterprise On-Ramp / Enterprise | TAM (dedicated Technical Account Manager), fastest response |

> 💡 **Related theory**: If you need a **dedicated TAM (Technical Account Manager)**, that's the **Enterprise** plan. 24/7 phone support first appears with the **Business** plan.

## Wrapping Up

Over two days we've compressed all four domains into a review. In particular, the **Shared Responsibility Model**, the **CloudTrail/Config/CloudWatch distinction**, and the **four pricing models** are asked very frequently, so make sure you have them at your fingertips. Tomorrow we'll check our pace with a comprehensive mock exam mixing all four domains.

## 📝 연습 문제

**문제 1.** In the Shared Responsibility Model, which of the following is always the customer's responsibility?

A) Physical security of the data center  
B) Patching the hypervisor  
C) Configuring IAM users and permissions  
D) Secure disposal of hardware  

**정답: C**  
해설: Configuring IAM users and permissions is a configuration "in" the cloud and is always the customer's responsibility. Physical security, hypervisor patching, and hardware disposal all pertain to the cloud infrastructure and are therefore AWS's responsibility.

---

**문제 2.** Which service should you use to track a record of all API calls made in your account for auditing purposes?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS Config  
D) Amazon Inspector  

**정답: B**  
해설: CloudTrail is an audit log service that records who called which API and when. CloudWatch is for performance metrics and log monitoring, Config is for tracking resource configuration changes and compliance, and Inspector is for vulnerability assessment.

---

**문제 3.** Which EC2 pricing model is most appropriate to save up to 90% on a large-scale batch processing job that can tolerate interruption?

A) On-Demand Instances  
B) Reserved Instances  
C) Spot Instances  
D) Dedicated Hosts  

**정답: C**  
해설: Spot Instances offer spare capacity at up to 90% off, but AWS can reclaim it, so they suit interruption-tolerant (fault-tolerant) work. On-Demand has no discount, Reserved Instances are based on a long-term commitment, and Dedicated Hosts are for compliance and licensing purposes.

---

**문제 4.** Which AWS Support plan is most appropriate for a large enterprise that needs the support of a dedicated Technical Account Manager (TAM)?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**정답: D**  
해설: A dedicated TAM is provided with the Enterprise (and Enterprise On-Ramp) plans. Basic is free basic support, Developer offers email during business hours, and Business provides 24/7 technical support but does not include a dedicated TAM.

---

**문제 5.** Which tool should you use if you want to be alerted when your monthly costs exceed a limit you've set?

A) AWS Pricing Calculator  
B) AWS Budgets  
C) AWS Cost Explorer  
D) AWS Artifact  

**정답: B**  
해설: AWS Budgets is the tool for setting a budget limit and sending an alert when you exceed it or the forecast surpasses it. Pricing Calculator is for advance estimates, Cost Explorer is for analyzing past costs, and Artifact is the tool that provides compliance reports.

---
