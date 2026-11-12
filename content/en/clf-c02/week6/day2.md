# Day 2 - Domain Review 2: Security & Compliance + Billing, Pricing, and Support Essentials

## 📌 Key Takeaways

- Today's two domains together make up **42%**. Add yesterday's 58% and you have the whole exam.
- Every question in Domain 2 ultimately returns to one question: **"Does AWS do this, or must I?"** The shared responsibility model decides the answer.
- **Data and access permissions are always the customer's responsibility**, whichever service you use. This one line solves half of the security questions.
- Do not memorize security services by name; group them by **"what do they block or find?"** They split into things that block (WAF, Shield), things that find (GuardDuty, Inspector, Macie), and things that record (CloudTrail, Config).
- Domain 4 is mostly settled once you grasp three axes: **timing (before/after)**, **actor (person/tool)**, and **purpose (analysis/alert/restriction)**.
- Today's goal is again not reading but **covering and saying it aloud**.

Yesterday we sorted out cloud concepts and technology and services. Today we wrap up the remaining two domains, **Domain 2 (Security & Compliance, 30%)** and **Domain 4 (Billing, Pricing & Support, 12%)**. Domain 2 is the second-largest by weight, so it has many questions, and Domain 4, though small, gathers easily confused points such as IAM and pricing tools.

## Domain 2 Essentials: Security & Compliance

### Shared Responsibility Model

This is the most important concept. It is divided as "security of the cloud vs security in the cloud."

| Responsible party | Area covered | Examples |
|-----------|-----------|------|
| AWS (of the Cloud) | Infrastructure security | Physical facilities, hardware, network, hypervisor |
| Customer (in the Cloud) | Data and configuration security | Data encryption, IAM settings, OS patching, security groups |

"Encrypting customer data," "managing IAM users," and "patching the EC2 guest OS" are always the **customer's responsibility**. Conversely, "physical security of the data center" and "hardware disposal" are **AWS's responsibility**. Just note that for managed services (RDS and others), AWS handles OS patching.

Why this model is needed becomes clear if you **compare with the pre-cloud era**. In the days when you bought servers yourself and kept them in a server room, there was no need to draw a boundary line. From building access control to disk disposal, backups, and firewall settings, **everything was our company's job**. Once you move to the cloud, AWS does many of those jobs for you, but the problem is that **"up to where"** is invisible. So AWS drew the boundary line clearly in documents, and that is the shared responsibility model.

It is easy if you think in terms of tenant and landlord. The building's frame, elevators, fire-safety equipment, and entrance access control are the **landlord's (AWS)** job. But **locking my own front door, deciding to whom I make copies of the key, and whether to put valuables inside the home in a safe** are the tenant's (customer's) job. No matter how safe the building is, it is useless if I leave my door open. **An accident caused by leaving an S3 bucket open to the public is exactly this case.**

The responsibility boundary moves depending on the service type. Fix this movement with a picture.

```
 Degree of management   low ───────────────────────────→ high
   EC2 (IaaS)          RDS               Lambda / S3
 OS patching = customer   OS patching = AWS   Runtime environment = AWS
 ──────────────────────────────────────────────────
 Data · access permissions · encryption settings = always the customer
```

> ⚠️ **Trap**: An option saying "if you use a managed service, AWS takes care of all security" is wrong. The more managed it gets, only **operational tasks** shift to AWS; **the data itself and who can access it** remain the customer's responsibility to the end. If a question contains "data," "permissions," "access control," or "enable encryption," the answer is almost always on the customer's side.

### IAM (Identity and Access Management)

| Element | Core |
|------|------|
| User | Credentials for an individual person/application |
| Group | A set of users, grant permissions in bulk |
| Role | Temporary permission delegation (between services, federation) |
| Policy | JSON permission document, applies the principle of least privilege |

- **Root user**: Never use it for daily work; **enable MFA** and lock it away
- **Principle of least privilege**: Grant only the permissions that are truly needed

Turning the four into company access control looks like this.

| IAM element | Everyday analogy | Decisive signal |
|----------|-----------|-------------|
| User | An **employee ID card** issued to an individual employee | One person, logging in |
| Group | The **department** printed on the ID card | The same permissions to many people in bulk |
| Role | A **visitor pass** lent out for a moment | A service accessing another service, temporary permissions |
| Policy | A **rulebook** stating which doors can be opened | A document defining allow/deny |

> ⚠️ **Trap**: In the situation "an application running on EC2 must access S3," choosing the option that writes the access key into the code is wrong. The answer is almost always an **IAM role (Role)**. If you put a key in the code, the moment the source leaks the account is compromised along with it, and you must redeploy every time you change the key. A role hands over and receives temporary credentials automatically, so both problems disappear.

The **principle of least privilege** is the opposite of "let's grant broadly first and narrow it later." You go in the direction of starting narrow and widening when needed. The practical reason this principle exists is that broadly granted permissions inconvenience nobody, so **an occasion to narrow them never comes**. If options contain expressions such as "administrator permissions for all users" or "allow full access," that is usually a wrong-answer signal.

### Key Security Services

| Service | Role |
|--------|------|
| IAM | Authentication and authorization |
| AWS Shield | DDoS protection |
| AWS WAF | Web application firewall (blocks SQL injection, XSS) |
| GuardDuty | Threat detection (intelligent monitoring) |
| Amazon Inspector | Automated vulnerability assessment |
| KMS | Encryption key management |
| Secrets Manager | Storing and automatically rotating passwords and keys |
| AWS Config | Tracking resource configuration, compliance |
| CloudTrail | API call audit log |

"Who did what (API auditing)" is **CloudTrail**, "tracking whether resources comply with rules" is **Config**, and "performance/metric monitoring" is **CloudWatch**. These three are an easily confused set.

#### Memorizing by Grouping Them by Role

There seem to be many names, but if you group them by **the nature of what they do**, there are only a few clusters.

| Group | What it does | Services |
|------|---------|-------------|
| Block | Cut off the chokepoints where attacks come in | WAF, Shield, security groups |
| Find | Detect anomalies, vulnerabilities, and sensitive information | GuardDuty, Inspector, Macie |
| Record | Leave a record of who did what and what changed | CloudTrail, Config, CloudWatch |
| Conceal | Store data and secrets safely | KMS, Secrets Manager |

#### Separating the Confusing Pairs

| Pair | Criterion for separating |
|----|---------------|
| WAF vs Shield | Inspects the **content** of web requests (blocks SQL injection, XSS) vs blocks the **volume** of mass-traffic attacks (DDoS) |
| GuardDuty vs Inspector | Detects **suspicious movement** in account and network activity vs checks workloads for **known vulnerabilities** |
| Inspector vs Macie | Software vulnerabilities vs detecting **sensitive information in S3** (personal data and so on) |
| CloudTrail vs Config | **Who did what** (action record) vs **what is configured how** (configuration state) |
| CloudTrail vs CloudWatch | Audit log vs **performance metrics and monitoring** |
| KMS vs Secrets Manager | Creating and managing encryption **keys** vs storing passwords and API keys and **rotating them automatically** |

The three recording services separate for certain if you compare them to building management. **CloudTrail is the CCTV at the entrance and the visitor log** (who came in when and did what), **Config is the facility inspection ledger** (is the fire extinguisher stocked as required, when did it change), and **CloudWatch is the gauge panel** (what are the current power usage and temperature).

Suppose one day one of the company's EC2 instances suddenly starts heavy external communication in the early morning. **Noticing that suspicious behavior itself** is GuardDuty. What you use in the investigation to confirm "when and with which account was that instance created, and who opened the security group" is **CloudTrail**. Continuously detecting the fact that "a port that must not be open under our company's rules was open" is **Config**, and checking whether that instance still had an old vulnerability is **Inspector**. In one incident, the four services each handle a different piece.

### Compliance Tools

- **AWS Artifact**: Download compliance reports (SOC, PCI DSS, and so on)
- **AWS Compliance Center / Programs**: Information on certification programs

In compliance questions, you only need to be certain that **Artifact is "the place to get reports."** If a situation arises in an audit response or customer due diligence where "a document proving AWS maintains a certain certification is needed," the answer is Artifact. It is better not to confuse it with checking whether our account follows the rules (Config). **Artifact is AWS-side evidence; Config is our-side checking.**

## Domain 4 Essentials: Billing, Pricing, and Support

### EC2 Pricing Models

| Model | Characteristics | Suitable cases |
|------|------|-------------|
| On-Demand | As much as you use, no commitment | Short-term, unpredictable workloads |
| Reserved Instances (RI) | 1-3 year commitment, large discount | Stable, ongoing workloads |
| Savings Plans | Discount based on a usage commitment | Flexible long-term savings |
| Spot Instances | Up to 90% discount, can be interrupted | Fault-tolerant batch jobs |

The criterion for choosing among the four is in the end just one: **"how long and how certainly will you use it?"** Turned into mobile plans, On-Demand is a no-contract pay-as-you-go plan, RI is a long-term contract with conditions nailed down, Savings Plans is a long-term contract that promises only "I'll spend this much per month," and Spot is a last-minute discount on leftover seats. If RI and Savings Plans keep confusing you to the end, remember only **"what was promised?"**: RI promises a **seat**, and Savings Plans promises an **amount**. So the one whose discount follows even if you change type or Region is Savings Plans.

**Trap**: Reflexively choosing Spot after seeing only the expression "the way that cuts costs the most" is wrong. Spot can be reclaimed by AWS at any time, so it applies **only to work that can withstand interruption**. Expressions such as "fault tolerant," "batch," "restartable," and "fine if interrupted" must appear together in the options or passage for it to be a candidate answer. Choosing Spot for an always-on web server or database is wrong.

### Cost Management and Billing Tools

| Tool | Purpose |
|------|------|
| AWS Pricing Calculator | Advance cost estimates |
| AWS Cost Explorer | Visualizing/analyzing usage and cost trends |
| AWS Budgets | Setting budgets and alerting when exceeded |
| Cost and Usage Report (CUR) | The most detailed billing data |
| Billing Conductor | Custom billing |

"Want to be alerted when the budget is exceeded" is **Budgets**, "analyze past cost trends" is **Cost Explorer**, and "an estimate for resources not yet created" is **Pricing Calculator**.

These three **stand at different points in time**. This one axis splits most cost-tool questions.

```
   Past ────────────── Present ────────────── Future
 Cost Explorer        Budgets            Pricing Calculator
 CUR               (alert before exceeding)  (something not yet built)
 (money already spent)
```

Turned into a household ledger, Cost Explorer is the monthly spending graph, Budgets is the text alert that the card limit is exceeded, CUR is the original receipt with every item printed, and **cost allocation tags** are the "Food/Transport" stickers attached to the receipt.

**Trap**: Cost Explorer also has a feature that **forecasts** future costs, so people often make the mistake of choosing it after seeing only the word "forecast." That forecast is **a line drawn by extending the trend of what you are already using**. Getting the cost of a configuration **not yet built** is Pricing Calculator. If the passage has "before deployment," "new design," or "not yet created," it is not Cost Explorer.

### AWS Organizations & Consolidated Billing

- **Organizations**: Group multiple accounts for central management
- **Consolidated Billing**: Merge billing into one and share **volume discounts**
- **SCP (service control policy)**: Restrict the actions allowed per account

Picture a family bundle plan and it is exactly this. Each family member's number (account) is separate, but the charges come out as one bill (consolidated billing), and the data is shared among the family (discount sharing). A parent placing a block on a child's line is the **SCP**.

**Trap**: **An SCP is a tool that "sets a limit," not one that "grants" permissions.** Even if an SCP allows it, if the IAM policy inside the account does not allow it, it still cannot be done, and even if you gave administrator permissions in IAM, if the SCP blocks it, it cannot be done. Remember it as **handing over the key (IAM) inside the fence (SCP)**. Also, **Organizations is governance and consolidated billing is savings**, so their roles differ. Choosing consolidated billing for the sentence "restrict permissions centrally" is wrong.

### Support Plans

| Plan | Core |
|------|------|
| Basic | Free, documentation and forums |
| Developer | Business-hours email support |
| Business | 24/7 technical support, full Trusted Advisor |
| Enterprise On-Ramp / Enterprise | TAM (Technical Account Manager), fastest response |

If you need a dedicated **TAM (Technical Account Manager)**, it is the **Enterprise** plan. 24/7 phone support is first provided from the **Business** plan.

It is quicker to understand support plans as **insurance tiers**. In normal times you do not feel the difference, but when an accident happens, who comes and how fast differs. If you remember only **what newly appears** at each step up, you do not need to memorize the whole table.

```
 Basic       Docs · forums · billing inquiries   (technical cases ✕)
   └ + technical support (email, business hours)  → Developer
        └ + 24/7 technical support, full Trusted Advisor → Business
             └ + TAM (dedicated person), fastest response → Enterprise
```

**Trap**: Jumping straight to Enterprise after seeing only "24-hour support is needed" makes a wrong answer that exceeds the requirements. 24/7 is provided from **Business**. The decisive signals for Enterprise are the **TAM** or the **fastest response**. Also, **a TAM is a person; Trusted Advisor is a tool**. In a passage, "dedicated," "advisory," and "person in charge" are on the person side, and "check," "recommendation," and "automatic inspection" are on the tool side.

## Keyword → Service Translation Table

Questions do not name the service but describe a situation. Read the left and check whether the right comes to mind right away.

| Expression in the question | Answer to recall |
|--------------------|-----------|
| Physical security of data centers, hardware disposal, hypervisor | AWS's responsibility |
| Data encryption settings, access permissions, EC2's OS patching | Customer's responsibility |
| Temporary permission delegation, a service accessing another service | IAM role (Role) |
| The same permissions to many users in bulk | IAM group |
| The first step in hardening account security | Root user MFA + use IAM users |
| Blocking web requests such as SQL injection and XSS | AWS WAF |
| An attack that paralyzes a service with massive traffic | AWS Shield (DDoS) |
| Detecting suspicious activity and anomalies | GuardDuty |
| Automatic checks for known vulnerabilities | Amazon Inspector |
| Detecting sensitive data such as personal data in S3 | Amazon Macie |
| Creating and managing encryption keys | KMS |
| Storing passwords and API keys and rotating them automatically | Secrets Manager |
| Who called which API and when | CloudTrail |
| Tracking whether resource configuration matches rules | AWS Config |
| Metrics, logs, alarms, performance monitoring | CloudWatch |
| Compliance reports such as SOC and PCI DSS | AWS Artifact |
| Expected cost of a configuration not yet built | Pricing Calculator |
| Alert when a threshold is exceeded | AWS Budgets |
| Allocating costs by department or project | Cost allocation tags |
| Central control of multiple accounts, restricting permitted actions | Organizations (SCP) |
| Merged bills, shared volume discounts | Consolidated billing |
| Dedicated staff, fastest response | Enterprise plan (TAM) |

## List of Frequently Missed Traps

There is a reason for getting things wrong. You have to know the reason too, so you do not get it wrong next time.

1. **Thinking "it's managed, so security is AWS's too"**: Operations may move over, but data and permissions remain the customer's responsibility to the end.
2. **Choosing the option that puts an access key in code**: For access between services, an IAM role is always the answer.
3. **Swapping WAF and Shield in your answer**: Looking at the **content** of requests is WAF; blocking the **attack volume (DDoS)** is Shield.
4. **Mixing GuardDuty and Inspector**: Suspicious **behavior** is GuardDuty; known **vulnerabilities** is Inspector.
5. **Confusing CloudTrail and Config**: **Action records** are CloudTrail; **configuration state** is Config.
6. **Mixing Artifact and Config**: The AWS-side evidence document is Artifact; checking our own account is Config.
7. **Guessing Cost Explorer from "forecast" alone**: A configuration not yet built is Pricing Calculator.
8. **Jumping to Enterprise from "24-hour support"**: 24/7 starts at Business.
9. **Thinking an SCP grants permissions**: It only sets a ceiling; the actual permission is given by IAM.
10. **Believing the answer more expensive than the requirements is safe**: A choice that satisfies the conditions exactly is often the answer.

## One-Line Review Cards

For covering the right side and saying it aloud.

| Card | One line |
|------|-------|
| Shared responsibility model | The cloud **itself** is AWS's, what is **in** the cloud is the customer's |
| IAM user/group/role/policy | Employee ID / department / visitor pass / rulebook |
| Principle of least privilege | Start narrow and widen when needed |
| WAF / Shield | Inspects request content / blocks attack volume (DDoS) |
| GuardDuty / Inspector / Macie | Suspicious behavior / known vulnerabilities / sensitive data |
| KMS / Secrets Manager | Encryption key management / secret storage and automatic rotation |
| CloudTrail / Config / CloudWatch | Entrance log / facility inspection ledger / gauge panel |
| AWS Artifact | Where you get AWS's compliance evidence |
| On-Demand / RI / SP / Spot | Freedom / seat promise / amount promise / leftover seats |
| Pricing Calculator / Cost Explorer / Budgets | Advance estimate / after-the-fact analysis / overage alert |
| Organizations / consolidated billing | Governance (permissions) / savings (billing) |
| Four support tiers | Free → email → 24/7 → dedicated TAM |

Of the two days' worth, the shared responsibility model, the CloudTrail/Config/CloudWatch distinction, and the four pricing models are easily confused pairs, so make them second nature.

## Self-Check Checklist

If you can explain it, you pass. If any item stalls you, go back to that session.

- [ ] I can split the shared responsibility model into "of the cloud / in the cloud" and give two examples of each
- [ ] I can explain how responsibility shifts when moving to managed services
- [ ] I can name two things that are **always the customer's responsibility** whichever service is used
- [ ] I can distinguish when to use IAM users, groups, roles, and policies
- [ ] I know what to answer as the first step in hardening account security
- [ ] I can state what WAF and Shield each block
- [ ] I can distinguish GuardDuty, Inspector, and Macie in one sentence each
- [ ] I can choose among CloudTrail, Config, and CloudWatch by situation
- [ ] I can line up the four pricing models on the axis of "duration and certainty"
- [ ] I can distinguish Pricing Calculator, Cost Explorer, and Budgets by timing
- [ ] I can state the difference in roles between Organizations and consolidated billing
- [ ] I can explain the four support plans centered on what newly appears at each step

Tomorrow we check our pace with a comprehensive mock set that mixes all four domains.

## 📖 Glossary

- **Shared responsibility model**: A way of splitting cloud security between AWS and the customer. The cloud itself is AWS's; what you put in it is the customer's share.
- **Hypervisor**: The virtualization layer that runs several virtual servers on one physical server. AWS is responsible for it.
- **IAM role (Role)**: Credentials that lend permissions temporarily without a password. Used for access between services.
- **Principle of least privilege**: The principle of granting only as much permission as the work truly needs. Start narrow and widen when needed.
- **MFA (multi-factor authentication)**: A login method that requires a second means of verification in addition to the password.
- **AWS WAF**: A firewall that inspects the content of web requests and filters out attacks such as SQL injection and XSS.
- **AWS Shield**: A service that blocks DDoS attacks that paralyze a service with massive traffic.
- **GuardDuty**: A service that watches account and network activity and detects suspicious movement.
- **Amazon Inspector**: A service that automatically checks whether known vulnerabilities remain in a workload.
- **Amazon Macie**: A service that finds sensitive information stored in S3.
- **KMS**: A service that creates and manages encryption keys.
- **CloudTrail / AWS Config**: An audit record of who did what / tracking whether resource configuration matches rules.
- **AWS Artifact**: The place to download AWS's compliance reports.
- **SCP (service control policy)**: A policy that sets the ceiling on what an account can do. It sets a limit, not a grant of permissions.

## 📝 Practice Questions

**Question 1.** In the Shared Responsibility Model, which of the following is always the customer's responsibility?

A) Physical security of the data center  
B) Patching the hypervisor  
C) Configuring IAM users and permissions  
D) Secure disposal of hardware  

**Answer: C**  
Explanation: Configuring IAM users and permissions is a configuration "in" the cloud and is always the customer's responsibility. Physical security, hypervisor patching, and hardware disposal all pertain to the cloud infrastructure and are therefore AWS's responsibility.

---

**Question 2.** Which service should you use to track a record of all API calls made in your account for auditing purposes?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS Config  
D) Amazon Inspector  

**Answer: B**  
Explanation: CloudTrail is an audit log service that records who called which API and when. CloudWatch is for performance metrics and log monitoring, Config is for tracking resource configuration changes and compliance, and Inspector is for vulnerability assessment.

---

**Question 3.** Which EC2 pricing model is most appropriate to save up to 90% on a large-scale batch processing job that can tolerate interruption?

A) On-Demand Instances  
B) Reserved Instances  
C) Spot Instances  
D) Dedicated Hosts  

**Answer: C**  
Explanation: Spot Instances offer spare capacity at up to 90% off, but AWS can reclaim it, so they suit interruption-tolerant (fault-tolerant) work. On-Demand has no discount, Reserved Instances are based on a long-term commitment, and Dedicated Hosts are for compliance and licensing purposes.

---

**Question 4.** Which AWS Support plan is most appropriate for a large enterprise that needs the support of a dedicated Technical Account Manager (TAM)?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**Answer: D**  
Explanation: A dedicated TAM is provided with the Enterprise (and Enterprise On-Ramp) plans. Basic is free basic support, Developer offers email during business hours, and Business provides 24/7 technical support but does not include a dedicated TAM.

---

**Question 5.** Which tool should you use if you want to be alerted when your monthly costs exceed a limit you've set?

A) AWS Pricing Calculator  
B) AWS Budgets  
C) AWS Cost Explorer  
D) AWS Artifact  

**Answer: B**  
Explanation: AWS Budgets is the tool for setting a budget limit and sending an alert when you exceed it or the forecast surpasses it. Pricing Calculator is for advance estimates, Cost Explorer is for analyzing past costs, and Artifact is the tool that provides compliance reports.

---
