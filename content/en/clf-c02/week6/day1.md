# Day 1 - Domain Review 1: Cloud Concepts + Cloud Technology and Services Essentials

## 📌 Key Takeaways

- The two areas we cover today (Domain 1 + Domain 3) alone make up **58%** of the whole exam.
- Domain 1 is **"why the cloud?"** and Domain 3 is **"so what do we use?"**
- The axes that most often split in concepts are three: **scalability vs elasticity**, **availability vs durability**, and **Region vs AZ vs edge**.
- For services, memorize not the name but the condition **"in what situation, this one."** Questions always describe a situation.
- Treat the storage trio (S3, EBS, EFS) and the database trio (RDS, DynamoDB, Redshift) as appearing in every sitting and prepare accordingly.
- Today's goal is not reading but **covering and saying it aloud (retrieval practice)**.

The final week has begun. This week we concentrate not on piling up new knowledge but on **organizing what you have already learned so you can pull it out on the exam**. Today we sweep through the two largest of the four CLF-C02 exam domains at once: **Domain 1 (Cloud Concepts, 24%)** and **Domain 3 (Cloud Technology and Services, 34%)**.

## Rechecking the Exam Domain Weights

| Domain | Name | Weight |
|------|------|------|
| Domain 1 | Cloud Concepts | 24% |
| Domain 2 | Security & Compliance | 30% |
| Domain 3 | Cloud Technology & Services | 34% |
| Domain 4 | Billing, Pricing & Support | 12% |

Domain 3 is the largest at 34%, and together with Domain 1 it is 58% of the total. Just solidifying these two brings you much closer to the passing line (about 700/1000).

### How to Use the Review Sessions

From now on it is not **time for new reading** but **time for pulling things out**. Skimming with your eyes easily creates the illusion of "I know it," but what you need in the exam room is the **ability to pull it out** with nothing in sight. That is why today's document has many tables. Each time you see a table, cover the right (answer) column, look only at the left and answer **aloud**, then mark only the items where you got stuck and go back to the original session.

This approach of recalling the answer first and then checking is called **retrieval practice**. Even for the same time spent, it stays in memory longer than rereading several times. Because the action the exam demands is itself "retrieval," practicing with the same action is far more effective.

## Domain 1 Essentials: Cloud Concepts

### The 6 Benefits of the Cloud (Be Sure to Memorize)

| Benefit | Core meaning |
|------|-----------|
| Trade upfront expense for variable expense | Pay for what you use instead of investing in a data center upfront |
| Benefit from massive economies of scale | Lower unit prices thanks to AWS's total usage |
| Stop guessing capacity | Scale up and down when needed (elasticity) |
| Increase speed and agility | Secure resources in a few clicks |
| Stop spending money running and maintaining data centers | Removes the burden of managing infrastructure |
| Go global in minutes | Expand globally by choosing Regions |

Why these six are "benefits" is understood right away if you think of **the days before the cloud**. In the past you had to decide before development, as a number, how many people would come, order equipment to match, and prepare delivery, installation, power, and cooling before you could even upload code. But that forecast is wrong anyway. Buy a lot and money is tied up in idle equipment; buy little and the service stops at exactly the moment people flood in. The cloud erased this dilemma by **removing "the need to guess right in advance,"** and most of the other benefits derive from here.

### Concept Pairs That Are Easy to Confuse

Where scores actually split in the concepts domain is the four pairs below. Because the names are similar it is easy to gloss over them, but questions aim at exactly this difference.

| Pair | Difference | One-line memory aid |
|----|------|--------------|
| Scalability vs Elasticity | Whether you **can** grow vs whether it grows and shrinks **automatically** with demand | Ability, or automatic? |
| High Availability vs Fault Tolerance | **Recovers quickly** after a failure vs **keeps going without interruption** despite a failure | Recover fast, or never stop? |
| Availability vs Durability | Is it **accessible now** vs does the data **not disappear** | Does it open, or does it remain? |
| Agility vs Scalability | The **speed of starting** something new vs the **ability** to grow | Try fast, or grow big? |

> ⚠️ **Trap**: It is risky to choose **elasticity** unconditionally from just the sentence "add servers when demand grows." If a person adds them by hand, that is **scalability**. For the word elasticity to be the answer, expressions like "**automatically**" or "**adjusts automatically to demand**" must appear together. Conversely, choosing elasticity for the sentence "the size can be adjusted manually" is wrong.

### Cloud Computing Models / Deployment Models

| Category | Types | Core |
|------|------|------|
| Computing model | IaaS / PaaS / SaaS | Balance between control and management burden |
| Deployment model | Cloud / Hybrid / On-premises | Where data and workloads are located |

With IaaS the user manages up to the OS (EC2), with PaaS the user manages only code (Elastic Beanstalk), and with SaaS the user only uses it (a finished product available immediately). If the keyword "patches the operating system directly" appears, it is IaaS.

If the three models still do not feel graspable, think of them in terms of **preparing a meal**. Borrowing ingredients and a kitchen and cooking yourself is IaaS; handing only the recipe (code) to a kitchen that has a chef is PaaS; buying a finished dish is SaaS. The higher up you go, the more convenient, but **the range you can touch shrinks.** If a question says "want maximum control," it is the lower side (IaaS); if it says "want to minimize management burden," it is the upper side (PaaS/SaaS).

### AWS Global Infrastructure

- **Region**: A geographically separated area. Data sovereignty, latency, and pricing differ
- **Availability Zone (AZ)**: A set of physically separated data centers within a Region. **The basic unit of high availability**
- **Edge Location**: A point for caching CloudFront content

The relationship among the three is settled in one go if you view it as a containment structure.

```
 [ Region (e.g., Seoul) ]
    ├── Availability Zone A   ← a set of physically separated data centers
    ├── Availability Zone B   ← spreading across these = high availability
    └── Availability Zone C
 [ Edge Locations ]  ← outside the Region, many placed close to users
                        cache content to speed up responses (CloudFront)
```

So the answer splits like this depending on what the question asks.

| What the question requires | Answer |
|--------------------|----|
| A configuration that withstands failure within one Region | Spread across multiple **Availability Zones** |
| Disaster recovery, country-level distribution, data sovereignty | Use multiple **Regions** |
| Deliver content quickly to users worldwide | **Edge Locations** (CloudFront) |
| Data must legally stay within a specific country | Choose the **Region** |

> ⚠️ **Trap**: The single expression "want to reduce latency" does not decide the answer. If it is about delivering **static content (images, video, files) quickly worldwide**, it is Edge Locations (CloudFront), but if you **want to run the application itself close to users**, the answer is choosing the Region in that area. Also, an Edge Location is only a caching point and **not a high-availability means that substitutes for Availability Zones.**

## Domain 3 Essentials: Cloud Technology and Services

### Compute

| Service | One-line definition |
|--------|-----------|
| EC2 | Virtual server (IaaS), the user manages up to the OS |
| Lambda | Serverless function, billed for code execution time |
| Elastic Beanstalk | Infrastructure configured automatically on code upload (PaaS) |
| ECS / EKS | Container orchestration (ECS = AWS's own, EKS = Kubernetes) |
| Fargate | Serverless container execution (no EC2 management needed) |

If you view compute as a single ladder of **"how far will I manage?"**, what you must memorize shrinks sharply. From the side with the most to manage: **EC2 (I manage up to the OS) → ECS/EKS (container management) → Fargate (no servers) → Lambda (code only)**.

| Situation description | Answer |
|-----------|----|
| Need to choose and patch the OS yourself and install software | EC2 |
| Short code that runs briefly only when an event arrives | Lambda |
| Wish that just uploading code would configure the infrastructure automatically | Elastic Beanstalk |
| Want to run a containerized app across multiple machines | ECS or EKS |
| Want to use containers but not manage servers | Fargate |
| Already using Kubernetes and want to move it as is | EKS |

**Trap**: People often make the mistake of choosing Lambda unconditionally on seeing the word "serverless." On AWS, serverless is not a property of Lambda alone. **Fargate (containers), DynamoDB (database), and S3 (storage)** also have no servers for the user to manage. If the question also says **"containers,"** go to Fargate; if it says **"NoSQL database,"** go to DynamoDB.

### Storage

| Service | Type | Core keywords |
|--------|------|-------------|
| S3 | Object storage | Static files, backups, unlimited scaling |
| EBS | Block storage | A disk attached to EC2 |
| EFS | File storage | A file system shared by multiple EC2 instances |
| S3 Glacier | Archive | Long-term retention, cheap, tolerates retrieval delay |

The storage trio never gets confused if you turn it into **storage spaces in a house**.

| Service | Everyday analogy | Decisive signal |
|--------|-----------|-------------|
| S3 | A **warehouse** where you put each item with a name tag | File upload/download, static website, backup |
| EBS | An **external hard drive** plugged into one computer | A disk attached to EC2, dedicated to one instance |
| EFS | A **shared folder** that many people open at once | Multiple EC2 instances **mount it simultaneously** |
| S3 Glacier | A **box of old documents** stored in a basement warehouse | Keep for years, almost never retrieve |

Suppose you build a photo-sharing service. The photos users upload pile up without limit and must be downloadable directly from the web, so you put them in **S3**. The EC2 instances that process photos need a disk with the OS and programs installed, so **EBS** is attached. If you scale the processing servers to several and all of them must see the same working folder, you attach **EFS**. Originals that nobody looks at after three years are moved to **S3 Glacier**. The key point is that within one service, the four each hold a different seat.

**Trap**: Reflexively choosing EBS for "multiple servers must see the same data" is wrong. A requirement for multiple EC2 instances to **mount and share simultaneously** is **EFS**. Also, an **instance store** is a temporary disk attached to EC2, so when it stops the data disappears. It is a wrong answer in "permanent retention" questions.

### Networking

| Service | Core keywords |
|--------|-------------|
| VPC | Isolated virtual network |
| Route 53 | DNS service |
| CloudFront | CDN, edge caching |
| Direct Connect | Dedicated line between on-premises and AWS |
| API Gateway | Publishing and managing APIs |

It is convenient to fix networking with a city analogy too. **A VPC is a fence built around the lot I was allotted**, **Route 53 is the phone book that tells addresses**, **CloudFront is a logistics hub placed in each neighborhood**, and **Direct Connect is a dedicated road linking our company and AWS**. Because it is a separate road rather than the public road called the internet, speed and bandwidth are stable.

**ELB and Auto Scaling** also often appear together here. The names look similar but they do different jobs. **ELB is the bank-lobby guide who distributes incoming requests among several servers**, and **Auto Scaling is the branch manager who opens more counters when customers flood in**.

The two are not competitors but a **pair**. Only when Auto Scaling adjusts the number of machines and ELB distributes requests according to that number is the elasticity of "growing and shrinking automatically with demand" complete. If a question says "distribute requests evenly," it is ELB; if it says "automatically adjust the number of instances with load," read it as Auto Scaling.

### Databases

| Service | Type |
|--------|------|
| RDS | Relational DB (managed) |
| Aurora | High-performance relational (MySQL/PostgreSQL compatible) |
| DynamoDB | Serverless NoSQL |
| Redshift | Data warehouse (analytics) |
| ElastiCache | In-memory cache (Redis/Memcached) |

"Relational + managed" is RDS, "NoSQL + serverless" is DynamoDB, and "large-scale analytics/warehouse" is Redshift. Even making just these three mappings certain lets you get many DB questions right.

Splitting databases by situation description also gets you to the answer much faster.

| Situation description | Answer |
|-----------|----|
| Tables and relationships, SQL, moving an existing MySQL or PostgreSQL | RDS |
| Same relational, but **higher performance** is needed | Aurora |
| Key-value, flexible schema, no server management, large-scale traffic | DynamoDB |
| Gather years of data for reports and analytic queries | Redshift |
| The same lookups repeat and you want to make **responses faster** | ElastiCache |

**Trap**: If you memorize the distinction between relational and non-relational as "what is stored," it wobbles. The criterion is **structure**. If rows and columns are fixed and tables form relationships, it is relational (RDS, Aurora); if it is a flexible structure where the attributes held may differ per item, it is NoSQL (DynamoDB). Also, **ElastiCache does not replace a database but is a cache placed in front of it.** Choosing it for the purpose of "keeping the original data" is a wrong answer.

## Keyword → Service Translation Table

Exam questions do not name the service but **describe a situation**. In the end, what you do is translate the expression into a service name. Cover the left and guess the right, then cover the right and recall the left.

| Expression in the question | Answer to recall |
|--------------------|-----------|
| Patch the operating system directly, maximum control | EC2 (IaaS) |
| Upload only code and infrastructure is configured automatically | Elastic Beanstalk (PaaS) |
| Runs briefly on an event, billed only for run time | Lambda |
| Use containers but dislike managing servers | Fargate |
| Static files, backups, effectively unlimited scaling | S3 |
| File sharing mounted simultaneously by multiple servers | EFS |
| Keep for years, almost never retrieved, cheap | S3 Glacier |
| Deliver content quickly to users worldwide, caching | CloudFront (Edge Locations) |
| Dedicated line connecting on-premises and AWS | Direct Connect |
| Distribute requests evenly across multiple servers | ELB |
| Automatically adjust the number of instances with load | Auto Scaling |
| Withstand failure within one Region | Spread across multiple Availability Zones (AZs) |
| Key-value, serverless, flexible schema | DynamoDB |
| Large-scale data analytics, warehouse | Redshift |
| Speed up repeated lookups, in-memory | ElastiCache |

## List of Frequently Missed Traps

There is a reason for getting things wrong. You have to know the reason too, so you do not get it wrong next time.

1. **Mixing up elasticity and scalability**: Without the word "automatically," it is not elasticity.
2. **Treating Edge Locations as a high-availability means**: The edge is a caching point; the basic unit for failure preparedness is the Availability Zone.
3. **Guessing Lambda from the single word "serverless"**: Fargate, DynamoDB, and S3 also have no servers to manage.
4. **Choosing EBS for a file-sharing requirement**: Sharing used simultaneously by multiple EC2 instances is EFS.
5. **Choosing an instance store for permanent retention**: It is temporary storage that disappears when stopped.
6. **Putting ElastiCache in the database's place**: It is a cache placed in front, not the original.
7. **Memorizing IaaS/PaaS/SaaS only as service names**: The exam asks "who manages up to where."
8. **Guessing CloudFront from "latency" alone**: For content delivery it is CloudFront; for placing the app itself closer, it is choosing a Region.

## One-Line Review Cards

For covering the right side and saying it aloud.

| Card | One line |
|------|-------|
| EC2 / Lambda | I manage up to the OS / code that runs only on events |
| Beanstalk / Fargate | Give only code and infrastructure is automatic / containers without servers |
| S3 / EBS / EFS | Unlimited warehouse / external drive plugged into one machine / shared folder |
| VPC / CloudFront | Isolated fence / CDN that caches close by |
| ELB / Auto Scaling | Guide who distributes / branch manager who opens more counters |
| RDS / DynamoDB / Redshift | Relational / serverless NoSQL / warehouse for analytics |
| Region / AZ / Edge | Area / separated data centers within an area / caching point |

Use these to check whether you can state each service's one-line definition and representative keywords aloud. Repeat until the service comes to mind the moment you see the keyword.

## Self-Check Checklist

If you can explain it, you pass. If any item stalls you, go back to that session.

- [ ] I can state five or more of the cloud's 6 benefits without looking
- [ ] I can distinguish the difference between scalability and elasticity, and between high availability and fault tolerance, each in one sentence
- [ ] I can arrange IaaS, PaaS, and SaaS by **management scope**
- [ ] I can draw the containment relationship of Regions, Availability Zones, and Edge Locations
- [ ] I know what to answer to the requirement "a highly available configuration"
- [ ] I can line up EC2, Lambda, Beanstalk, and Fargate in order of management burden
- [ ] I can tell by situation when to use each of S3, EBS, and EFS
- [ ] I can describe the roles of ELB and Auto Scaling without mixing them
- [ ] I can choose among RDS, DynamoDB, Redshift, and ElastiCache by situation

Tomorrow we sort out the security and billing domains.

## 📖 Glossary

- **Scalability**: The ability itself to increase resources. It need not be automatic.
- **Elasticity**: The property of resources growing and shrinking **automatically** with demand.
- **High Availability**: The property of a service returning to normal quickly even if part of it fails.
- **Fault Tolerance**: The property of continuing to operate without stopping at all even when a failure occurs.
- **Region**: A geographically separated AWS infrastructure area. Data location, latency, and pricing differ.
- **Availability Zone (AZ)**: A set of physically separated data centers within a Region. The basic unit of high availability.
- **Edge Location**: A point that caches content close to users. Used by CloudFront.
- **IaaS, PaaS, SaaS**: Three tiers of renting out only infrastructure / up to the runtime environment / up to the finished product. The higher you go, the lower the management burden.
- **Serverless**: An approach where the user does not prepare or manage servers directly. Lambda, Fargate, DynamoDB, and others qualify.
- **Object storage**: A method of storing a file whole together with its name tag. S3 is the representative.
- **Block storage**: A storage method used by attaching it to a server like a disk. EBS is the representative.
- **ELB (Elastic Load Balancing)**: A load-balancing service that sends incoming requests across several servers.
- **Auto Scaling**: A feature that automatically increases and decreases the number of instances according to load.
- **In-memory cache**: A layer that keeps frequently used data in memory to speed up responses. ElastiCache is the representative.

## 📝 Practice Questions

**Question 1.** Which cloud computing model is most appropriate when the user wants to be directly responsible for OS patching and middleware installation?

A) SaaS  
B) IaaS  
C) PaaS  
D) FaaS  

**Answer: B**  
Explanation: IaaS provides only the basic infrastructure such as virtual servers, and the user manages the OS and middleware, giving the greatest control. SaaS provides only finished software to use, and with PaaS you manage only the code while the provider is responsible for the OS, so there's no need to patch it yourself. FaaS is function-level serverless with infrastructure management abstracted away even further.

---

**Question 2.** What is the most basic unit for building a highly available architecture within a single Region?

A) Edge locations  
B) Distributing across multiple Availability Zones (AZs)  
C) Distributing across multiple Regions  
D) A single large instance  

**Answer: B**  
Explanation: An Availability Zone is a cluster of physically separated data centers within a Region, and distributing across multiple AZs keeps the service running even if one fails. Edge locations are for content caching. Distributing across multiple Regions is a broader scope for disaster recovery and is not the within-a-single-Region configuration the question asks for. A single large instance becomes a single point of failure.

---

**Question 3.** Multiple EC2 instances need to mount storage simultaneously and share files. Which storage service is most appropriate?

A) Amazon EBS  
B) Amazon S3 Glacier  
C) Amazon EFS  
D) Instance store  

**Answer: C**  
Explanation: EFS is shared file storage that multiple EC2 instances can mount simultaneously. EBS is block storage typically attached to a single instance. S3 Glacier is for long-term archiving, not immediate shared mounting. An instance store is temporary storage whose data disappears when the instance stops.

---

**Question 4.** Which of the following correctly describes what "trade capital expense for variable expense" means among the advantages of cloud computing?

A) You pay a fixed monthly fee regardless of usage  
B) Instead of building a data center up front, you pay only for what you use  
C) All services are provided free of charge  
D) You must prepay a full year's cost up front  

**Answer: B**  
Explanation: The variable expense model means paying only for the resources you actually use, without a large up-front investment. A fixed fee or mandatory prepayment is the opposite of this concept, and the cloud is not free either.

---

**Question 5.** Which service is most appropriate as unlimited-scaling object storage for storing static website files and large backups?

A) Amazon RDS  
B) Amazon EBS  
C) Amazon S3  
D) Amazon Redshift  

**Answer: C**  
Explanation: S3 is object storage suited to storing static files and backups, and it scales virtually without limit. RDS is a relational database, EBS is block storage for EC2, and Redshift is a data warehouse for analytics — none of which are meant for object storage.

---
