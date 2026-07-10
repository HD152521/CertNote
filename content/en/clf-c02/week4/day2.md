# Day 2 - Security Services at a Glance: What Threat Does Each Stop?

Yesterday we used IAM to decide "who can do what." But permission management alone can't stop every threat. Incoming attack traffic, malicious activity that sneaks in unnoticed, unpatched vulnerabilities, sensitive data accidentally exposed — each of these has a dedicated security service.

Today we'll cover six services: WAF, Shield, GuardDuty, Inspector, Macie, and Security Hub. Their names are so similar that they're confusing at first, but if you pin down one line each on **"what threat does it deal with,"** the answer will jump out the moment you read a scenario on the exam. That's because the CLF exam asks not about deep configuration but about the matching of "this situation → this service."

## WAF: Web Application Firewall

**AWS WAF (Web Application Firewall)** stops attacks aimed at web applications. It filters **Layer 7 (application layer) attacks** such as SQL injection and cross-site scripting (XSS). You can define rules to block requests matching a certain pattern, or block specific IPs or countries.

It's commonly placed in front of CloudFront, an Application Load Balancer, or API Gateway to inspect incoming HTTP/HTTPS requests.

> 💡 **Related theory**: When you see "block web attacks like SQL injection/XSS" or "filter specific malicious request patterns," it's WAF. The key keyword is **web application layer (L7) attacks**.

## Shield: DDoS Protection

**AWS Shield** defends against **DDoS (Distributed Denial of Service) attacks**. It stops attacks that flood a service with traffic from countless sources simultaneously to bring it down.

- **Shield Standard**: Provided **free by default to all AWS customers**, it automatically defends against common network/transport layer DDoS.
- **Shield Advanced**: A paid subscription service that provides defense against more sophisticated, large-scale attacks, support from a specialized response team (DRT), protection against bill spikes caused by attacks, and more.

> 💡 **Related theory**: When you see "stop an attack that overwhelms a service with massive traffic (DDoS)," it's Shield. An easy distinction: WAF looks at "content (request patterns)," while Shield stops "volume (traffic floods)."

## GuardDuty: Threat Detection

**Amazon GuardDuty** is an **intelligent threat detection** service. It uses machine learning to analyze CloudTrail logs, VPC flow logs, DNS logs, and more to automatically find **abnormal and malicious activity**. For example, it detects API calls from unusual locations, cryptocurrency mining activity, communication from compromised instances, and so on.

A distinctive point is that it works simply by being turned on, with no agent installation required.

> 💡 **Related theory**: When you see "automatically detect suspicious/malicious activity in accounts and workloads," it's GuardDuty. The keywords are **threat detection** and **log-based anomaly analysis**.

## Inspector: Vulnerability Assessment

**Amazon Inspector** **automatically checks for vulnerabilities**. It scans EC2 instances, container images (ECR), and Lambda functions to find known software vulnerabilities (CVEs) or network exposure issues and reports them along with priorities.

If GuardDuty finds "malicious behavior happening right now," Inspector is on the side of proactively checking "whether there are weak points that make you easy to attack."

> 💡 **Related theory**: When you see "check software vulnerabilities of EC2/containers" or "find unpatched weaknesses," it's Inspector. The keyword is **vulnerability assessment**.

## Macie: Sensitive Data Protection

**Amazon Macie** **finds and protects sensitive data stored in S3**. It uses machine learning to scan S3 buckets and automatically discover and classify where sensitive data such as personally identifiable information (PII), credit card numbers, and credentials resides.

> 💡 **Related theory**: When you see "find personal information (PII)/sensitive data inside S3," it's Macie. The keywords are **S3 + sensitive data discovery/classification**. The key point is that it's a service focused on the data itself.

## Security Hub: Unified Security Dashboard

**AWS Security Hub** is a unified dashboard that **gathers the results of multiple security services in one place**. It collects the findings produced by GuardDuty, Inspector, Macie, and others on a single screen, and shows your security posture as a score against best practices (e.g., the CIS Benchmark).

> 💡 **Related theory**: When you see "centrally manage/monitor the results of multiple security services in one place," it's Security Hub. The keyword is not individual detection but **central visibility (a central view)**.

## One-Line Summary Table

| Service | One-line identity |
|--------|--------------|
| WAF | Filters web attacks (SQL injection/XSS, L7) |
| Shield | DDoS (traffic flood) defense (Standard is free) |
| GuardDuty | Detects malicious activity via log analysis |
| Inspector | Checks vulnerabilities of EC2/containers/Lambda |
| Macie | Discovers/classifies sensitive data (PII) in S3 |
| Security Hub | Unified security findings dashboard |

## Wrapping Up

We grouped the six services by "what threat does it deal with." WAF is web attacks, Shield is DDoS, GuardDuty is malicious activity detection, Inspector is vulnerabilities, Macie is S3 sensitive data, and Security Hub is unified visibility. As long as this one line each is clear, you'll almost never get confused in an exam scenario.

In the next article, we'll take a step beyond security to cover **compliance**. Topics include how to obtain compliance reports with AWS Artifact, and which country/Region your data is stored in (data sovereignty).

---

## 📝 연습 문제

**문제 1.** You want to protect a web app from web application layer attacks such as SQL injection and cross-site scripting (XSS). Which service is most appropriate?

A) AWS Shield  
B) AWS WAF  
C) Amazon GuardDuty  
D) Amazon Macie  

**정답: B**  
해설: WAF filters web attack patterns such as SQL injection and XSS at L7 (the application layer). Shield stops DDoS (traffic floods), GuardDuty detects malicious activity, and Macie deals with S3 sensitive data — none of which are about blocking web attacks.

---

**문제 2.** Which service is provided free by default to all AWS customers and automatically defends against common DDoS attacks?

A) AWS Shield Standard  
B) AWS WAF  
C) Amazon Inspector  
D) AWS Security Hub  

**정답: A**  
해설: Shield Standard is provided to all customers at no additional cost and automatically defends against network/transport layer DDoS. WAF is web attack filtering, Inspector is vulnerability assessment, and Security Hub is a unified dashboard — none are DDoS defense services.

---

**문제 3.** You want to automatically discover and classify sensitive data such as personally identifiable information (PII) stored in an S3 bucket. Which service is most appropriate?

A) Amazon GuardDuty  
B) Amazon Inspector  
C) Amazon Macie  
D) AWS WAF  

**정답: C**  
해설: Macie specializes in using machine learning to discover and classify sensitive data (such as PII) in S3. GuardDuty detects malicious activity, Inspector checks vulnerabilities, and WAF filters web attacks — none have S3 data classification capabilities.

---

**문제 4.** You want to automatically check for known software vulnerabilities present in EC2 instances and container images. Which service is most appropriate?

A) Amazon Inspector  
B) Amazon Macie  
C) AWS Shield  
D) AWS Security Hub  

**정답: A**  
해설: Inspector scans EC2, containers, and Lambda to check for known vulnerabilities (CVEs) and exposure issues. Macie is for S3 sensitive data, Shield is DDoS defense, and Security Hub is a findings-aggregation dashboard — none are vulnerability assessment tools.

---

**문제 5.** You want to gather and monitor, in one place, the detection findings of multiple security services such as GuardDuty, Inspector, and Macie. Which service is most appropriate?

A) AWS WAF  
B) AWS Security Hub  
C) Amazon GuardDuty  
D) AWS Shield Advanced  

**정답: B**  
해설: Security Hub is a centralized dashboard that gathers the findings of multiple security services on one screen and shows your security posture against best practices. WAF, GuardDuty, and Shield are individual services that each handle a specific threat, not tools for unified visibility.

---
