# Day 1 - Domain Review 1: Cloud Concepts + Cloud Technology & Services Core Recap

The final week begins. Rather than piling on new knowledge, this week focuses on **organizing what you've already learned so you can pull it out on the exam**. Today we sweep through the two largest of the four CLF-C02 exam domains in one pass: **Domain 1 (Cloud Concepts, 24%)** and **Domain 3 (Cloud Technology & Services, 34%)**.

## Reconfirming the Domain Weightings

| Domain | Name | Weight |
|------|------|------|
| Domain 1 | Cloud Concepts | 24% |
| Domain 2 | Security & Compliance | 30% |
| Domain 3 | Cloud Technology & Services | 34% |
| Domain 4 | Billing, Pricing & Support | 12% |

> 💡 **Related theory**: Domain 3 is the largest at 34%, and combined with Domain 1 it accounts for 58% of the whole. Being solid on just these two puts you well within reach of the passing line (roughly 700/1000).

## Domain 1 Core — Cloud Concepts

### The Six Advantages of the Cloud (memorize these)

| Advantage | Core meaning |
|------|-----------|
| Trade capital expense for variable expense | Pay for what you use instead of investing up front in a data center |
| Benefit from economies of scale | Lower unit costs thanks to AWS's aggregate usage |
| Stop guessing capacity | Scale up and down as needed (elasticity) |
| Increase speed and agility | Provision resources with a few clicks |
| Reduce data center operating and maintenance costs | Eliminate the burden of managing infrastructure |
| Go global in minutes | Expand worldwide by choosing Regions |

### Cloud Computing Models / Deployment Models

| Category | Types | Core idea |
|------|------|------|
| Computing model | IaaS / PaaS / SaaS | Balance of control ↔ management burden |
| Deployment model | Cloud / Hybrid / On-premises | Location of data and workloads |

> 💡 **Related theory**: With IaaS the user manages everything up to the OS (EC2), with PaaS you manage only the code (Elastic Beanstalk), and with SaaS you simply use it (a ready-to-use finished product). When you see the keyword "patch the operating system yourself," it's IaaS.

### AWS Global Infrastructure

- **Region**: A geographically separated area. Data sovereignty, latency, and pricing all differ.
- **Availability Zone (AZ)**: A cluster of physically separated data centers within a Region. **The basic unit of high availability.**
- **Edge Location**: A CloudFront content caching point.

## Domain 3 Core — Cloud Technology & Services

### Compute

| Service | One-line definition |
|--------|-----------|
| EC2 | Virtual servers (IaaS); the user manages everything up to the OS |
| Lambda | Serverless functions; billed for code execution time |
| Elastic Beanstalk | Automatically provisions infrastructure when you upload code (PaaS) |
| ECS / EKS | Container orchestration (ECS = AWS's own, EKS = Kubernetes) |
| Fargate | Serverless container execution (no EC2 management required) |

### Storage

| Service | Type | Core keywords |
|--------|------|-------------|
| S3 | Object storage | Static files, backups, unlimited scaling |
| EBS | Block storage | A disk attached to EC2 |
| EFS | File storage | A file system shared by multiple EC2 instances |
| S3 Glacier | Archive | Long-term retention, cheap, tolerant of retrieval delay |

### Networking

| Service | Core keywords |
|--------|-------------|
| VPC | Isolated virtual network |
| Route 53 | DNS service |
| CloudFront | CDN, edge caching |
| Direct Connect | Dedicated line between on-premises ↔ AWS |
| API Gateway | Publishing and managing APIs |

### Databases

| Service | Type |
|--------|------|
| RDS | Relational database (managed) |
| Aurora | High-performance relational (MySQL/PostgreSQL compatible) |
| DynamoDB | Serverless NoSQL |
| Redshift | Data warehouse (analytics) |
| ElastiCache | In-memory cache (Redis/Memcached) |

> 💡 **Related theory**: "Relational + managed" means RDS, "NoSQL + serverless" means DynamoDB, and "large-scale analytics/warehouse" means Redshift. Nailing just these three mappings will get you most of the database questions.

## Wrapping Up

Today we compressed the two highest-weighted domains into a single review. Check whether you can say out loud the **one-line definition and representative keyword** for each service in the tables. Tomorrow we'll organize the Security and Billing domains.

## 📝 연습 문제

**문제 1.** Which cloud computing model is most appropriate when the user wants to be directly responsible for OS patching and middleware installation?

A) SaaS  
B) IaaS  
C) PaaS  
D) FaaS  

**정답: B**  
해설: IaaS provides only the basic infrastructure such as virtual servers, and the user manages the OS and middleware, giving the greatest control. SaaS provides only finished software to use, and with PaaS you manage only the code while the provider is responsible for the OS, so there's no need to patch it yourself. FaaS is function-level serverless with infrastructure management abstracted away even further.

---

**문제 2.** What is the most basic unit for building a highly available architecture within a single Region?

A) Edge locations  
B) Distributing across multiple Availability Zones (AZs)  
C) Distributing across multiple Regions  
D) A single large instance  

**정답: B**  
해설: An Availability Zone is a cluster of physically separated data centers within a Region, and distributing across multiple AZs keeps the service running even if one fails. Edge locations are for content caching. Distributing across multiple Regions is a broader scope for disaster recovery and is not the within-a-single-Region configuration the question asks for. A single large instance becomes a single point of failure.

---

**문제 3.** Multiple EC2 instances need to mount storage simultaneously and share files. Which storage service is most appropriate?

A) Amazon EBS  
B) Amazon S3 Glacier  
C) Amazon EFS  
D) Instance store  

**정답: C**  
해설: EFS is shared file storage that multiple EC2 instances can mount simultaneously. EBS is block storage typically attached to a single instance. S3 Glacier is for long-term archiving, not immediate shared mounting. An instance store is temporary storage whose data disappears when the instance stops.

---

**문제 4.** Which of the following correctly describes what "trade capital expense for variable expense" means among the advantages of cloud computing?

A) You pay a fixed monthly fee regardless of usage  
B) Instead of building a data center up front, you pay only for what you use  
C) All services are provided free of charge  
D) You must prepay a full year's cost up front  

**정답: B**  
해설: The variable expense model means paying only for the resources you actually use, without a large up-front investment. A fixed fee or mandatory prepayment is the opposite of this concept, and the cloud is not free either.

---

**문제 5.** Which service is most appropriate as unlimited-scaling object storage for storing static website files and large backups?

A) Amazon RDS  
B) Amazon EBS  
C) Amazon S3  
D) Amazon Redshift  

**정답: C**  
해설: S3 is object storage suited to storing static files and backups, and it scales virtually without limit. RDS is a relational database, EBS is block storage for EC2, and Redshift is a data warehouse for analytics — none of which are meant for object storage.

---
