# Day 2 - Security Services at a Glance: What Threat Does Each Stop?

## 📌 Key Takeaways

- Each security service **stops a different threat**. Rather than memorizing names, pinning down one line for "which threat is it responsible for?" works far better on the exam.
- **WAF** blocks the *content* of requests (L7 web attacks such as SQL injection and XSS), while **Shield** blocks the *volume* of requests (DDoS).
- **GuardDuty** detects from logs whether "something suspicious is happening right now," while **Inspector** checks ahead of time whether "there are weaknesses that make you easy to attack."
- **Macie** finds and classifies sensitive data (personal information and so on) inside S3 — the only service whose target is the data itself.
- **Security Hub** is an integrated dashboard that gathers the results of the services above onto one screen. It is not a service that detects anything directly.

Yesterday we used IAM to decide "who can do what." But permission management alone can't stop every threat. Attack traffic coming in from outside, malicious activity that sneaks in unnoticed, unpatched vulnerabilities, sensitive data accidentally exposed — each of these has a dedicated security service.

Today we cover six services: WAF, Shield, GuardDuty, Inspector, Macie, and Security Hub. Their names are similar enough to be confusing at first, but if you pin down one line each for **"which threat does it deal with?"**, the answer comes to you just from reading the scenario on the exam. That's because the CLF exam doesn't ask about deep configuration — it asks for the match "for this situation, this service."

## Why Are There So Many Security Services?

When you first see the list, you might wonder, "Why not sell one integrated service instead of splitting it into six?" The reason is simple. **The things that must be stopped are completely different kinds of things.**

Think about guarding a house. You need a gatekeeper at the front gate who screens out suspicious people, and you also need crowd control for when hundreds of people arrive at once and block the gate. Inside the house there should be CCTV watching for unusual movement, and you should do regular inspections to check that the window locks haven't gone loose. You also have to check that you haven't left a copy of an ID card lying in some drawer, and you need a control monitor that gathers all these alerts on one screen.

The six AWS security services correspond exactly to these six things.

| Device for guarding the house | AWS service |
|-------------------------------|-------------|
| Gatekeeper at the front gate (screening out suspicious people) | WAF |
| Crowd control (when everyone arrives at once) | Shield |
| CCTV inside the house (unusual movement) | GuardDuty |
| Regular safety inspection (loose locks) | Inspector |
| Finding neglected personal information | Macie |
| Control monitor (integrated alerts) | Security Hub |

Security devices fall broadly into two groups: **Preventive** and **Detective.** Preventive means stopping bad things before they happen (the gatekeeper, crowd control), while detective means discovering things that have already happened or are in progress (CCTV, safety inspection). Prevention alone isn't enough — you can't know every attack in advance. So you use both groups together.

## WAF: Web Application Firewall

**AWS WAF (Web Application Firewall)** blocks attacks aimed at web applications. It filters **Layer 7 (application layer) attacks** such as SQL injection and cross-site scripting (XSS). You can define rules to block requests with certain patterns, or to block specific IPs and countries.

It is commonly attached in front of CloudFront, an Application Load Balancer, or API Gateway to inspect incoming HTTP/HTTPS requests.

### Picturing What It Blocks

If "web application attack" sounds vague, here is a brief look at two representative ones.

- **SQL injection** — an attack that types **a command meant for the database** into an ID field instead of an ID. A poorly built website may understand it as a command and hand over member information.
- **Cross-site scripting (XSS)** — an attack that plants **a secretly executed script** in a comment area instead of text. It runs in the browser of whoever reads the post, and information leaks out.

Both have in common that they **put something abnormal into a normal input box.** That's why WAF examines not the amount of traffic but **the content written inside the request.**

```
[User request] ──▶ [WAF: content inspection] ──▶ [My web service]
                      │
                      └─ Blocked here if the pattern is suspicious
```

WAF comes with pre-built bundles of rules (managed rules), so you don't have to write every rule from scratch — common attack types are filtered just by turning them on. Beyond that, you can create rules such as blocking requests from particular IPs or countries, or blocking sources that make an excessive number of requests in a short time.

When you see "block web attacks like SQL injection/XSS" or "filter specific malicious request patterns," it's WAF. The key keyword is **web application layer (L7) attacks.**

A team running a small online shop noticed a pile of strange logs on its login page. When they checked, an automated program was pushing all kinds of strings into the ID field to look for vulnerabilities. Instead of tearing apart all the application code, the team first attached WAF in front of the load balancer and turned on the managed rules to block the obvious attack patterns. **They kept going with the fundamental fix of correcting the code, but WAF was the shield that bought time until then** — and that is how WAF is often used in practice.

## Shield: DDoS Protection

**AWS Shield** defends against **DDoS (Distributed Denial of Service) attacks.** It protects against attacks that paralyze a service by pouring traffic on it from many places at once.

- **Shield Standard**: **Provided free by default** to all AWS customers, and automatically defends against common network/transport layer DDoS.
- **Shield Advanced**: A paid subscription service that offers defense against more sophisticated large-scale attacks, support from an expert response team (DRT), protection against cost spikes caused by attacks, and so on.

### What Is DDoS, Anyway?

DDoS is not a technically sophisticated attack. **It simply makes far too many people show up.**

Suppose someone mobilizes 1,000 people to rush into a 20-seat restaurant at the same time, fill every seat, and order nothing. The restaurant isn't broken and the chef is perfectly fine, but **there's no room for real customers to come in.** Not hacking the server but eliminating the room for legitimate users to connect — that is DDoS.

The word "Distributed" is there because these attackers arrive from many places around the world at the same time. If they came from one place, you could just block that address, but when they come a little at a time from tens of thousands of places, it becomes hard to tell where the attack ends and the real customers begin.

| Category | Shield Standard | Shield Advanced |
|----------|----------------|-----------------|
| How it's used | Applied by default to all AWS customers | Separate paid subscription |
| Extra cost | None | Yes |
| Defense scope | Automatically defends against common network and transport layer attacks | Handles larger and more sophisticated attacks too |
| Expert support | None | AWS response team support |
| Cost-spike protection | None | Protection for usage that grew because of the attack |

> ⚠️ **Trap**: In a question like "what should you turn on to defend against DDoS," there is a trap that tries to make you pick Shield Standard. Shield Standard is **not something you turn on or sign up for — it is already applied to every customer.** So when you see the phrase "DDoS protection provided by default at no additional cost," the answer is Shield Standard, and if it says "need stronger protection and expert support," it's Shield Advanced.

When you see "stop attacks that paralyze a service with massive traffic (DDoS)," it's Shield. An easy way to tell them apart: WAF looks at the "content (request pattern)," while Shield blocks the "volume (traffic flood)."

### WAF and Shield: Use This Table When You Get Confused

Both "block bad traffic coming in from outside," so they are an easily confused pair.

| Category | WAF | Shield |
|----------|-----|--------|
| What it looks at | The **content** of requests | The **volume** of requests |
| Attacks it blocks | Web attacks such as SQL injection and XSS | DDoS (traffic flood) |
| Layer | Application layer (L7) | Mainly network and transport layers |
| Analogy | The gatekeeper checks belongings at the gate | Controlling a crowd that arrives all at once |
| Pricing | Billed by usage | Standard is free, Advanced is paid |
| Representative keywords | "malicious request patterns," "filtering" | "service paralysis," "traffic flood" |

In one sentence: **if the problem is "what was sent," it's WAF; if the problem is "how much was sent," it's Shield.**

## GuardDuty: Threat Detection

**Amazon GuardDuty** is an **intelligent threat detection** service. It analyzes CloudTrail logs, VPC Flow Logs, DNS logs, and more with machine learning to automatically find **abnormal and malicious activity.** For example, it detects API calls from an unusual location, cryptocurrency mining, communication from a compromised instance, and so on.

A distinguishing feature is that it works just by turning it on, without installing any agent.

The easiest way to understand GuardDuty is to think of a **credit card company's fraud detection.** If a card you normally only use in Seoul is charged on the opposite side of the globe at 3 a.m., the card company sends you a text message. It hasn't concluded the card was stolen; it sent a signal that **"this is different from usual."** GuardDuty does the same — if an administrator API is called from a region you don't normally use, a server starts communicating with a known malicious address, or a quiet instance suddenly makes traffic that looks like mining, it reports that as a **finding** and even assigns a severity.

There's one more feature. You don't need to install a program on each server. Because it reads and analyzes the records already accumulating inside AWS, it **works just by turning it on in the console.**

> ⚠️ **Trap**: GuardDuty is a service that **finds and reports** threats, not one that **blocks** attacks. If a description attached to GuardDuty says "automatically blocks attacks," that's a signal for a wrong answer. Blocking is the job of preventive devices such as WAF, Shield, and security groups; GuardDuty discovers and notifies, like CCTV.

When you see "automatically detect suspicious/malicious activity in the account or workloads," it's GuardDuty. The keywords are **threat detection** and **log-based anomaly analysis.**

## Inspector: Vulnerability Assessment

**Amazon Inspector** **automatically checks for vulnerabilities.** It scans EC2 instances, container images (ECR), and Lambda functions to find known software vulnerabilities (CVEs) or network exposure issues, and reports them with priorities.

If GuardDuty finds "malicious behavior happening right now," Inspector is on the side of checking ahead of time whether "there are weaknesses that make you easy to attack."

By analogy, Inspector is a **regular vehicle inspection.** It doesn't show up when an accident has happened; before an accident, it checks whether the brake pads are worn and whether the tires still have tread.

The phrase "known vulnerabilities" matters here. When a security flaw is found in software, it is assigned a number and registered in a list shared across the world, which is called a **CVE.** That this list is public means that **attackers are looking at the same list.** So you have to keep checking, "Do our servers have any outdated software that appears on that list?" — and doing that by hand is impossible. Inspector does it for you.

When you see "check EC2/containers for software vulnerabilities" or "find unpatched weaknesses," it's Inspector. The keyword is **vulnerability assessment.**

## Macie: Sensitive Data Protection

**Amazon Macie** **finds and protects sensitive data stored in S3.** It scans S3 buckets with machine learning to automatically discover and classify where sensitive data — personally identifiable information (PII), credit card numbers, credentials — is located.

The reason Macie is needed lies in a somewhat unexpected place. Most companies **don't know exactly what sensitive data they have or where it is.** The marketing team uploads a list of event entrants to a temporary folder and forgets it, a developer copies real member data into a test store to analyze an incident, and nobody knows what is inside the backup files carried over from an old system. In this state, there is no way to answer the question "is our company's personal information safe?" **Because if you don't know where it is, you can't protect it.**

Macie sweeps through S3 and shows you a list: "this file contains values shaped like national ID numbers," "this one has something that looks like card numbers." Only then can you make judgments such as "we should delete this" or "we need to encrypt this bucket and narrow its access permissions."

**Trap**: Macie's target is **S3.** Be suspicious if an option tries to attach Macie to a scenario like "find personal information in files on EC2." Conversely, if a question features **S3 and personal information (PII) together**, it is almost certainly Macie.

When you see "discover personal information (PII)/sensitive data in S3," it's Macie. The keywords are **S3 + discovering and classifying sensitive data.** The key point is that it is a service focused on the data itself.

### GuardDuty, Inspector, Macie: One Question That Separates the Three

All three are detection-type services that "find and report," so they are especially confusing. The way to tell them apart is to ask **what it looks into.**

| Category | GuardDuty | Inspector | Macie |
|----------|-----------|-----------|-------|
| What it looks into | Activity records (logs) | Software and configuration | Data contents |
| Question it answers | "Is something suspicious happening right now?" | "Are there weaknesses that make us easy to attack?" | "Is there sensitive information here?" |
| Timing | What is happening now | Preventive check before an incident | Check of stored state |
| Main target | Activity across the account | EC2, container images, Lambda | S3 |
| Analogy | CCTV inside the house | Regular safety inspection | Finding ID cards in a drawer |

In one sentence: **if it looks at behavior, it's GuardDuty; if it looks at weaknesses, Inspector; if it looks at data, Macie.**

## Security Hub: Integrated Security Dashboard

**AWS Security Hub** is an integrated dashboard that **gathers and displays in one place** the results of multiple security services. It collects the findings from GuardDuty, Inspector, Macie, and others onto one screen, and shows your security posture as a score against best practices (for example, the CIS benchmark).

Why such a service is needed on its own becomes clear if you imagine a company that has turned on all of the previous five. GuardDuty sends alerts, Inspector builds a vulnerability list, and Macie discovers sensitive data. But **these results pile up separately on different screens.** The person in charge has to open five screens every morning, and if there are several accounts, that number is multiplied. Realistically, within a few days nobody is looking anymore.

Security Hub **gathers these results onto one screen** and lines them up in order of severity. On top of that, it automatically checks "how well does our account follow the security best practices AWS recommends" and shows it in the form of a score.

**Trap**: Security Hub **does not detect threats by itself.** Its role is to gather and display results found by other services. Security Hub is never the answer to a question like "how do you discover sensitive data in S3?" Questions where Security Hub is the answer almost always contain words like **"multiple," "integrated," "in one place," or "central."**

When you see "manage/monitor the results of multiple security services in one place," it's Security Hub. The keyword is not individual detection but a **centralized view.**

## One-Line Identity per Service

| Service | One-line identity |
|---------|-------------------|
| WAF | Filtering web attacks (SQL injection, XSS; L7) |
| Shield | DDoS (traffic flood) protection (Standard is free) |
| GuardDuty | Detecting malicious activity through log analysis |
| Inspector | Vulnerability checks for EC2, containers, and Lambda |
| Macie | Discovering and classifying sensitive data (PII) in S3 |
| Security Hub | Integrated dashboard for security results |

## Services That Block and Services That Find

Let's group the six once more from a different angle. It helps when the exam has questions that make you distinguish "preventive control or detective control."

| Nature | Service | What it does |
|--------|---------|--------------|
| Preventive (blocks) | WAF, Shield | Blocks bad traffic before it comes in |
| Detective (finds) | GuardDuty, Inspector, Macie | Discovers threats, weaknesses, and sensitive data that already exist |
| Integrating (gathers) | Security Hub | Gathers detection results in one place and displays them |

Add the IAM you learned yesterday and the picture is complete. **IAM limits who can come in,** WAF and Shield **block what comes in from outside,** and the remaining three **find what was missed.**

The six services can be shortened and remembered as gatekeeper (WAF), crowd control (Shield), CCTV (GuardDuty), safety inspection (Inspector), drawer cleanup (Macie), and control monitor (Security Hub). If each service's one-line identity is clear, it's easy to tell it apart from its neighbors in a scenario.

## How This Appears on the Exam

When the expressions below appear in a question, the answer is almost settled. Pinning down just this table finishes your exam preparation for today's portion.

| Expression in the question | Answer |
|----------------------------|--------|
| SQL injection, XSS, filtering malicious request patterns | WAF |
| Blocking web requests from specific IPs or countries | WAF |
| DDoS, paralyzing a service with massive traffic | Shield |
| "DDoS protection provided by default at no additional cost" | Shield Standard |
| "Stronger DDoS protection + expert support" | Shield Advanced |
| Detecting suspicious activity or abnormal API calls, no agent required | GuardDuty |
| CVE, checking known vulnerabilities, scanning EC2, containers, and Lambda | Inspector |
| S3 + personal information (PII), discovering and classifying sensitive data | Macie |
| "Results of multiple security services in one place," best-practice score | Security Hub |

In the next article, we go one step beyond security and cover **Compliance.** Topics include how to get compliance reports with AWS Artifact, and in which country/Region data is stored (data sovereignty).

## 📖 Glossary

- **WAF**: A firewall that inspects the content of web requests and filters out web attacks such as SQL injection and XSS.
- **Layer 7 (L7)**: The layer corresponding to the content that applications exchange. This is the area WAF deals with.
- **SQL injection**: An attack that types a database command instead of data into an input box to extract information.
- **XSS (cross-site scripting)**: An attack that secretly plants a script in a post or similar content and makes it run in other users' browsers.
- **DDoS**: An attack that pours traffic from multiple places at the same time so that legitimate users cannot connect.
- **Shield Standard / Advanced**: Basic DDoS protection applied to all customers at no additional cost / a paid subscription that offers stronger protection and expert support.
- **GuardDuty**: A threat detection service that analyzes activity records of accounts and workloads to find suspicious behavior.
- **Inspector**: A service that scans EC2, container images, and Lambda to check for known vulnerabilities.
- **CVE**: A public list, shared across the world, in which discovered software security flaws are assigned numbers.
- **Macie**: A service that finds and classifies sensitive data, such as personal information, stored in S3.
- **PII (personally identifiable information)**: Information that makes it possible to identify a specific individual, such as name and contact details.
- **Security Hub**: An integrated dashboard that gathers the detection results of multiple security services onto one screen and shows compliance with best practices.
- **Preventive control / detective control**: A device that stops incidents in advance / a device that discovers problems that have already occurred.

---

## 📝 Practice Questions

**Question 1.** You want to protect a web app from web application layer attacks such as SQL injection and cross-site scripting (XSS). Which service is most appropriate?

A) AWS Shield  
B) AWS WAF  
C) Amazon GuardDuty  
D) Amazon Macie  

**Answer: B**  
Explanation: WAF filters web attack patterns such as SQL injection and XSS at L7 (the application layer). Shield stops DDoS (traffic floods), GuardDuty detects malicious activity, and Macie deals with S3 sensitive data — none of which are about blocking web attacks.

---

**Question 2.** Which service is provided free by default to all AWS customers and automatically defends against common DDoS attacks?

A) AWS Shield Standard  
B) AWS WAF  
C) Amazon Inspector  
D) AWS Security Hub  

**Answer: A**  
Explanation: Shield Standard is provided to all customers at no additional cost and automatically defends against network/transport layer DDoS. WAF is web attack filtering, Inspector is vulnerability assessment, and Security Hub is a unified dashboard — none are DDoS defense services.

---

**Question 3.** You want to automatically discover and classify sensitive data such as personally identifiable information (PII) stored in an S3 bucket. Which service is most appropriate?

A) Amazon GuardDuty  
B) Amazon Inspector  
C) Amazon Macie  
D) AWS WAF  

**Answer: C**  
Explanation: Macie specializes in using machine learning to discover and classify sensitive data (such as PII) in S3. GuardDuty detects malicious activity, Inspector checks vulnerabilities, and WAF filters web attacks — none have S3 data classification capabilities.

---

**Question 4.** You want to automatically check for known software vulnerabilities present in EC2 instances and container images. Which service is most appropriate?

A) Amazon Inspector  
B) Amazon Macie  
C) AWS Shield  
D) AWS Security Hub  

**Answer: A**  
Explanation: Inspector scans EC2, containers, and Lambda to check for known vulnerabilities (CVEs) and exposure issues. Macie is for S3 sensitive data, Shield is DDoS defense, and Security Hub is a findings-aggregation dashboard — none are vulnerability assessment tools.

---

**Question 5.** You want to gather and monitor, in one place, the detection findings of multiple security services such as GuardDuty, Inspector, and Macie. Which service is most appropriate?

A) AWS WAF  
B) AWS Security Hub  
C) Amazon GuardDuty  
D) AWS Shield Advanced  

**Answer: B**  
Explanation: Security Hub is a centralized dashboard that gathers the findings of multiple security services on one screen and shows your security posture against best practices. WAF, GuardDuty, and Shield are individual services that each handle a specific threat, not tools for unified visibility.

---
