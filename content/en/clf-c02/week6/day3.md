# Day 3 - Full Mock Exam Pace: All Four Domains Combined

Today we solve problems the way the real exam does — mixing all four domains together. The goal is to build a **sense of pace**, choosing an answer within about a minute per question. Practice the habit of just flagging questions you don't know, moving on, and coming back later. There are eight questions today, more than usual.

## Mock Exam Solving Strategy

| Situation | Action |
|------|------|
| Answer is immediately obvious | Select it right away and move on |
| Uncertain | Eliminate the two clearly wrong options first |
| No idea at all | Flag it, move on, and return if time remains |
| "Most appropriate / most cost-effective" questions | Narrow it down to a single core keyword |

> 💡 **Related theory**: CLF-C02 requires answering 65 questions in 90 minutes, which is an average of about 1 minute 23 seconds per question. Handling easy questions quickly to bank time for the hard ones is the key to a passing pace.

## One-Line Recap of Perennial Keywords by Domain

- **Domain 1**: Elasticity, economies of scale, high availability via AZs, IaaS/PaaS/SaaS
- **Domain 2**: Shared responsibility, least-privilege IAM, CloudTrail (audit) / Config (configuration)
- **Domain 3**: EC2/Lambda, S3/EBS/EFS, RDS/DynamoDB/Redshift, CloudFront (CDN)
- **Domain 4**: On-Demand/RI/Spot, Budgets/Cost Explorer, Support plans

Now solve them as if it were the real thing.

## 📝 연습 문제

**문제 1.** What is the cloud characteristic called that automatically adds EC2 instances when traffic spikes and removes them when it drops?

A) Durability  
B) Elasticity  
C) Failover  
D) Multi-tenancy  

**정답: B**  
해설: Elasticity is the ability to automatically scale resources up and down in response to changing demand, with Auto Scaling as the prime example. Durability is the degree of protection against data loss, failover is switching to a standby during a failure, and multi-tenancy is the concept of multiple customers sharing infrastructure.

---

**문제 2.** Which service should you use to protect a web application from SQL injection and cross-site scripting (XSS) attacks?

A) AWS Shield  
B) Amazon GuardDuty  
C) AWS WAF  
D) AWS KMS  

**정답: C**  
해설: AWS WAF is a web application firewall that filters Layer 7 attacks such as SQL injection and XSS. Shield is for DDoS protection, GuardDuty is for threat detection, and KMS is an encryption key management service.

---

**문제 3.** Which is most appropriate as a serverless NoSQL database that needs fast, single-digit-millisecond responses?

A) Amazon RDS  
B) Amazon DynamoDB  
C) Amazon Redshift  
D) Amazon Aurora  

**정답: B**  
해설: DynamoDB is a fully managed serverless NoSQL database that delivers consistent single-digit-millisecond performance. RDS and Aurora are relational databases, and Redshift is an analytics data warehouse — all serving different purposes.

---

**문제 4.** Which service should you use to cache content at edge locations to deliver videos and images to users worldwide with low latency?

A) Amazon Route 53  
B) AWS Direct Connect  
C) Amazon CloudFront  
D) Amazon VPC  

**정답: C**  
해설: CloudFront is a content delivery network (CDN) that caches content at edge locations to reduce latency. Route 53 is DNS, Direct Connect is a dedicated line, and VPC is an isolated virtual network.

---

**문제 5.** What should you use to combine the billing of multiple AWS accounts into one and share volume discount benefits?

A) Consolidated Billing in AWS Organizations  
B) AWS Budgets  
C) Savings Plans  
D) AWS Cost Explorer  

**정답: A**  
해설: Consolidated Billing in AWS Organizations aggregates usage across multiple accounts into a single bill and shares volume-based discounts. Budgets is for budget alerts, Savings Plans is a usage-commitment discount, and Cost Explorer is a cost analysis tool.

---

**문제 6.** Which PaaS-style service automatically handles capacity provisioning, load balancing, and scaling when you upload your code?

A) Amazon EC2  
B) AWS Lambda  
C) AWS Elastic Beanstalk  
D) Amazon ECS  

**정답: C**  
해설: Elastic Beanstalk is a PaaS service that automatically handles infrastructure configuration and scaling when you upload your code. EC2 is IaaS that you manage yourself, Lambda is function-level serverless, and ECS is container orchestration.

---

**문제 7.** Which service do you use to directly download the compliance reports (SOC, PCI DSS, etc.) that AWS provides?

A) AWS Config  
B) AWS Artifact  
C) AWS Trusted Advisor  
D) AWS CloudTrail  

**정답: B**  
해설: AWS Artifact is a portal that provides AWS compliance reports such as SOC and PCI DSS on demand. Config tracks resource configuration, Trusted Advisor checks best practices, and CloudTrail is an API audit log service.

---

**문제 8.** For a stable, continuously running workload, which EC2 pricing model is most appropriate if you want the maximum discount in exchange for a 1–3 year commitment?

A) On-Demand Instances  
B) Spot Instances  
C) Reserved Instances  
D) Dedicated Instances  

**정답: C**  
해설: Reserved Instances (or Savings Plans) provide a large discount in exchange for committing to 1–3 years of usage, making them suitable for continuous, predictable workloads. On-Demand has no commitment or discount, Spot is for interruptible work, and Dedicated Instances are for isolation requirements.

---
