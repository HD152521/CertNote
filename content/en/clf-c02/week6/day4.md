# Day 4 - Common Traps and Keywords: The "Keyword → Service" Translation Table

Most CLF-C02 questions throw out **keywords describing a situation** and ask for the "most appropriate service." In effect, the exam is a **game of translating keywords into services**. Today we organize that translation table and compare service pairs that are easy to confuse because they're similar.

## The Core "Keyword → Service" Translation Table

| Keyword in the question | Correct service |
|----------------|-------------|
| CDN / edge caching / content delivery | CloudFront |
| Serverless function / event-driven code execution | Lambda |
| DNS / domain routing | Route 53 |
| Object storage / static files / backups | S3 |
| Long-term archive / rarely retrieved / cheap | S3 Glacier |
| Relational database / managed SQL | RDS |
| NoSQL / serverless / milliseconds | DynamoDB |
| Data warehouse / large-scale analytics | Redshift |
| In-memory cache / ultra-fast reads | ElastiCache |
| DDoS protection | Shield |
| Web firewall / block SQL injection·XSS | WAF |
| Threat detection / intelligent monitoring | GuardDuty |
| API call auditing / who did what | CloudTrail |
| Resource configuration tracking / compliance status | Config |
| Metrics·log monitoring / alarms | CloudWatch |
| Dedicated network line / on-premises connection | Direct Connect |
| Cost estimate (in advance) | Pricing Calculator |
| Cost trend analysis (after the fact) | Cost Explorer |
| Budget-exceeded alert | Budgets |
| Compliance report download | Artifact |
| Best-practice checks (cost·security·performance) | Trusted Advisor |

> 💡 **Related theory**: Even if the exact service name doesn't come to you on the exam, tracing these keyword mappings in reverse lets you quickly eliminate wrong answers. Think of each keyword as a "signal word" that decides the answer.

## Frequently Confused Pairs

### CloudTrail vs Config vs CloudWatch

| Service | The question it answers |
|--------|-------------|
| CloudTrail | "Who called which API and when?" (auditing) |
| Config | "Does the resource configuration follow the rules? How did it change?" |
| CloudWatch | "Is performance/metrics healthy? Did it cross a threshold?" (monitoring) |

### S3 vs EBS vs EFS

| Service | Type | Signal word |
|--------|------|--------|
| S3 | Object | Static files, unlimited, web |
| EBS | Block | A disk attached to EC2 (1:1) |
| EFS | File | Shared mount across multiple EC2 instances |

### Shield vs WAF vs GuardDuty

| Service | What it blocks |
|--------|---------|
| Shield | DDoS (high-volume traffic attacks) |
| WAF | Layer 7 web attacks (SQL injection, XSS) |
| GuardDuty | Detection of abnormal activity·threats (detection, not prevention) |

### IAM User vs Group vs Role

| Element | Core idea |
|------|------|
| User | Permanent credentials for one person/app |
| Group | Grant permissions in bulk to a collection of users |
| Role | **Temporary permission delegation** (EC2 accessing S3, cross-account access, federation) |

> 💡 **Related theory**: When the situation is like "an EC2 instance needs to access S3" — granting permissions to a service without storing credentials in code — the answer is almost always an **IAM role**.

## Watch Out for Trap Phrasing

- **"Most cost-effective"** → the answer usually leans toward Spot/Reserved/Glacier/Savings Plans.
- **"Least operational overhead"** → serverless (Lambda, Fargate, DynamoDB) or managed services are the answer.
- **"High availability"** → distribute across multiple AZs.
- **"Disaster recovery / guard against a regional outage"** → multiple Regions.

## Wrapping Up

The translation table and confused pairs are the parts that most quickly turn into points on exam day. Read the table over and over until seeing a keyword makes the service pop up reflexively. Tomorrow we finish with an exam-day final checklist.

## 📝 연습 문제

**문제 1.** To "securely grant an EC2 instance permission to access an S3 bucket without storing credentials in the code," what should you use?

A) Issue an access key to an IAM user  
B) An IAM role  
C) Root user credentials  
D) Store a password in the S3 bucket policy  

**정답: B**  
해설: An IAM role delegates permissions to a service through temporary credentials, so there's no need to hardcode access keys in the code. Issuing an IAM user key risks key leakage, the root user must never be used, and storing a password in a bucket policy violates security.

---

**문제 2.** "I want to track whether resource configurations continuously comply with internal rules and view their change history." Which service is most appropriate?

A) AWS CloudTrail  
B) Amazon CloudWatch  
C) AWS Config  
D) AWS WAF  

**정답: C**  
해설: AWS Config tracks the state and change history of resource configurations and evaluates compliance. CloudTrail is for API call auditing, CloudWatch is for metrics·log monitoring, and WAF is a web firewall.

---

**문제 3.** To "retain data that is rarely accessed at the lowest cost for the long term," which storage is appropriate?

A) Amazon S3 Standard  
B) Amazon EBS  
C) Amazon S3 Glacier  
D) Amazon EFS  

**정답: C**  
해설: S3 Glacier is very cheap long-term archive storage in exchange for tolerating retrieval delay. S3 Standard is for frequently accessed data and is more expensive, EBS is block storage for EC2, and EFS is shared file storage — none meant for long-term archiving.

---

**문제 4.** "I want to run code only when an event occurs, while minimizing operational overhead." Which service is most appropriate?

A) Amazon EC2  
B) AWS Lambda  
C) AWS Elastic Beanstalk  
D) Amazon EC2 Auto Scaling  

**정답: B**  
해설: Lambda is a serverless service that runs code only when an event occurs, without managing servers, so it has the least operational overhead. EC2 and Auto Scaling require server management, and even Elastic Beanstalk runs EC2 underneath, so it carries more burden than Lambda.

---

**문제 5.** Which service should you use to "protect an application from a DDoS attack that mobilizes high-volume traffic"?

A) AWS WAF  
B) AWS Shield  
C) Amazon GuardDuty  
D) AWS KMS  

**정답: B**  
해설: AWS Shield is a service specialized in defending against DDoS attacks. WAF filters Layer 7 web attacks such as SQL injection·XSS, GuardDuty is for threat detection, and KMS is encryption key management — none of which have DDoS protection as their primary purpose.

---
