# Day 4 - Common Traps and Keywords: The "Keyword → Service" Translation Table

Most CLF-C02 questions throw out **keywords describing a situation** and ask for the "most appropriate service." In effect, the exam is a **game of translating keywords into services**. Today we organize that translation table and compare service pairs that are easy to confuse because they're similar.

## 📌 Key Takeaways

- CLF-C02 is effectively a **keyword translation exam**. One or two words in the passage decide the correct service.
- If you memorize only service names, you get confused. Always attach **"what it is for"** next to the name when you remember it.
- Most wrong answers are **neighboring services in the same category**. That is why "pair comparison" is the most efficient way to review.
- Options containing absolute expressions ("always", "unlimited", "100%") are usually wrong.

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
| Web firewall / block SQL injection and XSS | WAF |
| Threat detection / intelligent monitoring | GuardDuty |
| API call auditing / who did what | CloudTrail |
| Resource configuration tracking / compliance status | Config |
| Metrics and log monitoring / alarms | CloudWatch |
| Dedicated network line / on-premises connection | Direct Connect |
| Cost estimate (in advance) | Pricing Calculator |
| Cost trend analysis (after the fact) | Cost Explorer |
| Budget-exceeded alert | Budgets |
| Compliance report download | Artifact |
| Best-practice checks (cost, security, performance) | Trusted Advisor |

Even if the exact service name doesn't come to you on the exam, tracing the keyword mapping above in reverse lets you quickly eliminate wrong answers. Think of each keyword as a "signal word" that decides the answer.

## Expanded Translation Tables by Category

The table above is the compressed edition. From here we look at the material split by category. **Deciding the category first and then choosing within it** is the fastest path. Even just deciding "this is a storage question" after reading the passage lets you cross out a good number of the options.

### Compute

| Keyword in the question | Answer direction |
|----------------|----------|
| Virtual server / I choose and manage the OS myself | EC2 |
| Run code only when an event happens / no servers | Lambda |
| Just upload code and the infrastructure takes care of itself (PaaS) | Elastic Beanstalk |
| Container orchestration | ECS / EKS (Kubernetes) |
| Run containers without managing servers | Fargate |
| Automatically increase or decrease the number of instances with load | EC2 Auto Scaling |

### Storage

| Keyword in the question | Answer direction |
|----------------|----------|
| Object storage / static web files / backups / endlessly growing files | S3 |
| Long-term archive that is rarely retrieved | S3 Glacier family |
| A disk attached to a single EC2 instance | EBS |
| A shared file system mounted by several EC2 instances at once | EFS |
| A bridge connecting on-premises and cloud storage | Storage Gateway |
| Data too large to move over the network, moved on a physical device | Snow family |

### Networking and Content Delivery

| Keyword in the question | Answer direction |
|----------------|----------|
| My own private virtual network / subnet isolation | VPC |
| Domain name registration and routing | Route 53 |
| Edge caching / fast delivery to users worldwide | CloudFront |
| A **dedicated line** connecting a data center and AWS | Direct Connect |
| An encrypted tunnel connection over the internet | Site-to-Site VPN |
| Instance-level firewall / subnet-level firewall | Security group / network ACL |

### Databases

| Keyword in the question | Answer direction |
|----------------|----------|
| Managed relational DB / migrating existing MySQL or PostgreSQL | RDS |
| A high-performance relational DB built by AWS | Aurora |
| Key-value / NoSQL / serverless / single-digit milliseconds | DynamoDB |
| Data warehouse / complex analysis of years of data | Redshift |
| In-memory cache / speeding up repeated lookups | ElastiCache |

### Security and Identity

| Keyword in the question | Answer direction |
|----------------|----------|
| Who can do what / users, groups, roles, policies | IAM |
| Give a service permissions without putting credentials in code | IAM role |
| Bundle multiple accounts to centrally manage policies and billing | Organizations |
| Create and manage encryption keys | KMS |
| Block web attacks such as SQL injection and XSS | WAF |
| DDoS protection against high-volume traffic | Shield |
| **Detect** suspicious activity in accounts and networks | GuardDuty |
| **Vulnerability scanning** of EC2 and containers | Inspector |
| **Discover sensitive information (personal data)** in S3 | Macie |

### Monitoring, Management, and Governance

| Keyword in the question | Answer direction |
|----------------|----------|
| Metrics, logs, alarms / alert when a threshold is exceeded | CloudWatch |
| Who called which API and when (auditing) | CloudTrail |
| Do resource settings follow the rules / change history | Config |
| Best-practice checks for cost, security, and performance | Trusted Advisor |

### Cost, Pricing, and Support

| Keyword in the question | Answer direction |
|----------------|----------|
| **Calculate the expected cost** of a configuration not yet used | Pricing Calculator |
| Trend and breakdown analysis of cost **already incurred** | Cost Explorer |
| **Alert** when a set amount is exceeded | Budgets |
| Combine billing across multiple accounts into one + aggregate usage | Organizations consolidated billing |
| 24/7 technical support / dedicated TAM | Support plans (Business / Enterprise) |

### Migration, Analytics, and Integration

| Keyword in the question | Answer direction |
|----------------|----------|
| Migrate a DB with minimal downtime | DMS |
| Query data in S3 directly with SQL | Athena |
| Send notifications (email, text, subscription style) | SNS |
| Put jobs in a queue to connect components loosely | SQS |

"We have been keeping backup tapes in a warehouse and want to move to the cloud. However, we want to keep using our existing backup software." The category is **storage**, and the signal phrase "keep the existing software as is" calls for a **bridge** that lets an on-premises device see cloud storage as if it were local storage, so it narrows to Storage Gateway. Conversely, if it had been "move tens of terabytes in one go and be done", it would be the Snow family. **Even with the same "backup", the condition attached afterward changes the answer.**

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
| GuardDuty | Detection of abnormal activity and threats (detection, not prevention) |

### IAM User vs Group vs Role

| Element | Core idea |
|------|------|
| User | Permanent credentials for one person/app |
| Group | Grant permissions in bulk to a collection of users |
| Role | **Temporary permission delegation** (EC2 accessing S3, cross-account access, federation) |

When the situation is like "an EC2 instance needs to access S3", granting permissions to a service without storing credentials in code, the answer is almost always an **IAM role**.

### RDS vs DynamoDB vs Redshift vs ElastiCache

| Service | One-line identity | Signal word |
|--------|-----------|--------|
| RDS | Managed relational (SQL) database | Tables and joins, migrating existing MySQL/PostgreSQL |
| DynamoDB | Serverless NoSQL key-value store | Milliseconds, key-value, no server management, huge scale |
| Redshift | Data warehouse for analytics | Years of data, reports, complex aggregation queries |
| ElastiCache | In-memory cache | The same lookup repeats, make responses faster |

Memory aid: **"Transaction processing is RDS/DynamoDB, analytics is Redshift, speed assist is ElastiCache."**

### EC2 vs Elastic Beanstalk vs Fargate vs Lambda

Lining them up in order of management burden shows the relationship at a glance.

```
   More for me to manage ←──────────────────→ Less
   EC2  >  Elastic Beanstalk  >  Fargate  >  Lambda
   (down to the OS)  (just upload the app)  (containers only)  (function code only)
```

- "Complete control", "specific OS required" → **EC2**
- "Just upload the code", "deploy quickly" → **Elastic Beanstalk**
- "Containers, but no server management" → **Fargate**
- "Only when an event occurs", "minimal operational overhead" → **Lambda**

### ELB vs Auto Scaling: "Dividing" and "Growing"

The two are not rivals but **partners**.

| Aspect | Elastic Load Balancing | EC2 Auto Scaling |
|------|------------------------|------------------|
| What it does | **Distributes** incoming traffic across multiple servers | **Increases and decreases** the number of servers |
| What happens without it | Traffic piles up on a single server | The number of servers stays the same even if traffic grows |
| Corresponding concept | High availability (sends only to live targets) | Elasticity (increase and decrease to match demand) |

As a restaurant analogy, **ELB is the staff member who guides guests to empty tables**, and **Auto Scaling is the decision to put out more tables when guests increase**. If a question says "distribute traffic", it is ELB; if it says "adjust the number of servers", it is Auto Scaling.

### Scalability vs Elasticity

| Concept | Meaning | Point of distinction |
|------|----|------------|
| Scalability | **The ability to increase** resources when needed | Need not be automatic; the emphasis is on "can increase" |
| Elasticity | The property of **automatically growing and shrinking** with demand | Includes shrinking; automatic is the key |

**Vertical scaling** is making a single machine bigger, and **horizontal scaling** is increasing the number of machines.

### High Availability vs Fault Tolerance vs Disaster Recovery

All three are "preparing for failure", but they differ in **what scale of failure they withstand**.

| Concept | Failure prepared for | Typical answer |
|------|--------------|---------|
| High Availability | The service continues even if one server or one AZ fails | Distribute across multiple **AZs** |
| Fault Tolerance | Keeps operating as is, without performance degradation, even when failures occur | Redundant, duplicated configuration |
| Disaster Recovery | Recovering after a major incident such as an entire region going down | Multiple **Regions** |

> ⚠️ **Pitfall**: The most common mistake is choosing multiple Regions for "high availability" and multiple AZs for "disaster recovery." The test is **whether the passage contains an expression indicating a geographic range**. "Even if one data center loses power" → AZ; "prepare for a failure of an entire area" → Region.

### Region vs Availability Zone (AZ) vs Edge Location

| Aspect | What it is | Why you choose it |
|------|---------|----------|
| Region | A large geographic area unit, geographically apart from others | Legal and regulatory compliance, distance to users, disaster recovery |
| Availability Zone (AZ) | A group of physically separated data centers within one Region | High availability, keeps going even if one location dies |
| Edge Location | A cache point close to users | Reduces content delivery latency |

Memory aid: **A Region is "which country", an AZ is "a building inside it", and an edge is "the neighborhood convenience store."**

### GuardDuty vs Inspector vs Macie

| Service | What it looks at | One word |
|--------|-----------|--------|
| GuardDuty | Suspicious **activity** in accounts and networks | Threat detection |
| Inspector | **Vulnerabilities** in EC2 and containers | Vulnerability scanning |
| Macie | **Sensitive information** stored in S3 | Data discovery |

Memorize it as **"Behavior is GuardDuty, holes are Inspector, personal data is Macie."**

### WAF vs Shield: Both Block, but at Different Layers

| Service | What it blocks | Analogy |
|--------|--------|------|
| Shield | DDoS that pushes with high-volume traffic | A barrier holding back a crowd gathered at the door |
| WAF | Web attacks where the request content itself is malicious | A security guard inspecting the bags of people coming in |

### Artifact vs Config vs Trusted Advisor

- **Artifact**: "Where do I get the certification reports AWS has received?" (document download)
- **Config**: "Do my resource settings follow the rules?"
- **Trusted Advisor**: "What can be improved in terms of cost, security, and performance?"

### Pricing Models: On-Demand vs Reserved Instances vs Savings Plans vs Spot

| Model | When to choose it | Situation where you must never choose it |
|------|------------|------------------------|
| On-Demand | Unpredictable usage, short-term or experiments, avoiding commitment burden | "Steady long-term use for maximum savings" |
| Reserved Instances (RI) | Certain to use steadily for 1-3 years | "A short-term job with an unknown end" |
| Savings Plans | Long-term commitment but also need flexibility to change the configuration | "Short-term or one-off jobs" |
| Spot | Batch, analytics, and rendering jobs that can be interrupted | "Core services that must not be interrupted" |

> ⚠️ **Pitfall**: If you see only the words "most cost-effective" and choose Spot every time, you will be wrong. Spot is cheap in return for accepting that it **can be interrupted**, so if the passage has an expression such as "must always be running" or "must not be interrupted", it drops out of the candidates.

### Organizations vs Consolidated Billing

These two are not equal, separate services. **Consolidated billing is one of the features that Organizations provides.**

| Item | Description |
|------|------|
| Organizations | The umbrella concept for bundling multiple AWS accounts and managing them centrally |
| Consolidated Billing | The feature within it that merges billing into one and aggregates usage |
| SCP (Service Control Policy) | The feature that limits the range of actions allowed at the account or organization level |

"One invoice" means consolidated billing; "I want to block use of a specific service" means an SCP.

### Cost Tools: Pricing Calculator vs Cost Explorer vs Budgets

The simplest distinction is the **time axis**, and you memorize it as **"the calculator is the future, the explorer is the past, the budget is the present."**

| Tool | Point in time | Description |
|------|------|------|
| Pricing Calculator | **Before** you use | Calculate the expected cost of a configuration not yet built |
| Cost Explorer | **After** you use | Analyze the trend and composition of cost already incurred |
| Budgets | **While** you use | Alert when a set amount or usage is exceeded |

### Direct Connect vs Site-to-Site VPN

**Direct Connect** is a dedicated line that does not pass through the internet ("consistent performance"), and **Site-to-Site VPN** is an encrypted tunnel over the internet.

## Watch Out for Trap Phrasing

- **"Most cost-effective"** → the answer usually leans toward Spot/Reserved/Glacier/Savings Plans
- **"Least operational overhead"** → serverless (Lambda, Fargate, DynamoDB) or managed services are the answer
- **"High availability"** → distribute across multiple AZs
- **"Disaster recovery / guard against a regional outage"** → multiple Regions

- **"Complete control is needed"** → the side you manage directly, like EC2
- **"Latency must be reduced"** → edge/CDN or a Region close to users
- **"Without storing credentials"** → IAM role
- **"Must not be interrupted"** → rule out Spot

It helps to think of such modifiers as **constraints**. Each additional constraint cuts the candidates in half. That is why a long passage with many conditions can actually make it easier to narrow the answer, so don't be intimidated by a long passage; just **count the conditions one by one.**

## Wrong-Answer Trap List: Including Why You Fall for Them

Only if you know "why it attracts you" will it stop attracting you next time.

| Trap | Why it attracts you | How to actually tell |
|------|------------|------------|
| Choosing WAF for a DDoS question | Both are "attack blocking" | If it pushes by volume, Shield; if the request content is malicious, WAF |
| Choosing CloudWatch for an audit question | Both are "logs" | If it is "who did what", CloudTrail |
| Choosing S3 Standard for an archive question | S3 feels familiar | If it is "rarely retrieved", the Glacier family |
| Choosing EBS for a shared file question | Because of the word "disk" | If it is "multiple EC2 instances at once", EFS |
| Choosing RDS for an analytics question | Because of the word "SQL" | If it is "aggregation and reports over years of data", Redshift |
| Choosing Beanstalk for a serverless question | Because of the words "automatic management" | Beanstalk also has EC2 underneath |
| Choosing Cost Explorer for an estimate question | It is a cost tool | If it is something not yet used, Pricing Calculator |
| Choosing OS patching of a managed DB as the customer's responsibility | Memorized only "OS = customer" | For managed services, AWS handles the underlying OS |
| Choosing "unlimited" or "always free" options | They sound attractive | Absolute expressions are a wrong-answer signal |

**Pitfall**: If you memorize similarly named services **by name only**, you waver in the exam room. A guess like "Inspector is an inspector, so it must inspect logs" is exactly the spot question writers aim for. Remember a service not by its name but by **"which question it is the tool for answering"**.

The translation table and the confused pairs are the part that turns straight into points in the exam room. Read the tables repeatedly until the service comes to mind reflexively when you see a keyword.

## Today's Self-Check Checklist

- [ ] When I see a keyword in the compressed translation table, the service comes to mind within 3 seconds
- [ ] I have formed the habit of reading the passage and deciding the category (compute, storage, network, DB, security, cost) first
- [ ] Even with the confused-pairs tables covered, I can state the difference in each pair in one line

Tomorrow we finish with an exam-day wrap-up checklist.

## 📖 Glossary

- **Signal word**: A decisive word in the passage that points to the correct service, such as "milliseconds" or "long-term retention".
- **Constraint**: A condition in the passage that narrows the candidates, such as "minimum cost" or "cannot be interrupted". The more there are, the more the answer narrows.
- **Narrow the category first**: A solving method of deciding the classification, such as compute or storage, before recalling service names.
- **Object storage**: A way of storing files as whole objects. S3 is the representative and it grows without limit.
- **Block storage**: A storage style attached to a server like a disk. EBS is the representative.
- **File storage**: A storage style mounted and used by several servers at once. EFS is the representative.
- **Serverless**: A way where you do not prepare or operate servers yourself. Lambda, Fargate, and DynamoDB are representative.
- **Managed service**: A service where AWS takes over a substantial part of the operations on your behalf.
- **Vertical scaling / horizontal scaling**: Making one machine bigger / increasing the number of machines.
- **Archive tier**: A storage class with low retention cost in exchange for slower retrieval.
- **Consolidated billing**: The Organizations feature that merges the billing of multiple accounts into one and aggregates usage.
- **Absolute expression**: Words such as "always", "unlimited", and "100% guaranteed". Treat them as a wrong-answer signal when they appear in an option.

## 📝 Practice Questions

**Question 1.** To "securely grant an EC2 instance permission to access an S3 bucket without storing credentials in the code," what should you use?

A) Issue an access key to an IAM user  
B) An IAM role  
C) Root user credentials  
D) Store a password in the S3 bucket policy  

**Answer: B**  
Explanation: An IAM role delegates permissions to a service through temporary credentials, so there's no need to hardcode access keys in the code. Issuing an IAM user key risks key leakage, the root user must never be used, and storing a password in a bucket policy violates security.

---

**Question 2.** "I want to track whether resource configurations continuously comply with internal rules and view their change history." Which service is most appropriate?

A) AWS CloudTrail  
B) Amazon CloudWatch  
C) AWS Config  
D) AWS WAF  

**Answer: C**  
Explanation: AWS Config tracks the state and change history of resource configurations and evaluates compliance. CloudTrail is for API call auditing, CloudWatch is for metrics·log monitoring, and WAF is a web firewall.

---

**Question 3.** To "retain data that is rarely accessed at the lowest cost for the long term," which storage is appropriate?

A) Amazon S3 Standard  
B) Amazon EBS  
C) Amazon S3 Glacier  
D) Amazon EFS  

**Answer: C**  
Explanation: S3 Glacier is very cheap long-term archive storage in exchange for tolerating retrieval delay. S3 Standard is for frequently accessed data and is more expensive, EBS is block storage for EC2, and EFS is shared file storage — none meant for long-term archiving.

---

**Question 4.** "I want to run code only when an event occurs, while minimizing operational overhead." Which service is most appropriate?

A) Amazon EC2  
B) AWS Lambda  
C) AWS Elastic Beanstalk  
D) Amazon EC2 Auto Scaling  

**Answer: B**  
Explanation: Lambda is a serverless service that runs code only when an event occurs, without managing servers, so it has the least operational overhead. EC2 and Auto Scaling require server management, and even Elastic Beanstalk runs EC2 underneath, so it carries more burden than Lambda.

---

**Question 5.** Which service should you use to "protect an application from a DDoS attack that mobilizes high-volume traffic"?

A) AWS WAF  
B) AWS Shield  
C) Amazon GuardDuty  
D) AWS KMS  

**Answer: B**  
Explanation: AWS Shield is a service specialized in defending against DDoS attacks. WAF filters Layer 7 web attacks such as SQL injection·XSS, GuardDuty is for threat detection, and KMS is encryption key management — none of which have DDoS protection as their primary purpose.

---
