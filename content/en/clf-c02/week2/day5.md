# Day 5 - Week 2 Wrap-Up — Core Services 1 Review

This week we made a full loop around AWS's "internal infrastructure": servers (compute), the vessels that hold data (storage), the roads that connect them (networking), and the outward-facing services that deliver to faraway users fast (edge). Today we won't add anything new — we'll tie the scattered pieces into a single big picture for review.

The heart of review isn't memorization but **"when to pick what."** The exam almost always gives you a situation (a scenario) and asks "which service is the best fit?" So today we organize around per-service comparison tables and selection criteria.

## The Core Services 1 Map at a Glance

| Category | Flagship service | One-line definition |
|------|-------------|------------|
| Compute | EC2 | A virtual server you manage directly |
| Compute | Lambda | Run just code, no servers (serverless) |
| Compute | ECS/Fargate | Run containers |
| Storage | S3 | Object storage (files, images, backups) |
| Storage | EBS | Block disk attached to EC2 |
| Storage | EFS | File system shared by multiple servers |
| Networking | VPC | My dedicated virtual network |
| Edge | CloudFront | A CDN that delivers content fast |
| Edge | Route 53 | A DNS that translates domain names into addresses |

> 💡 **Related theory**: This table's categorization is also the ladder of "responsibility boundaries." With EC2 you manage up through the OS, with ECS/Fargate you only worry about the containers, and with Lambda you just upload code. The higher you go, the more AWS takes on.

## Compute Review: EC2 vs Lambda vs ECS

All three services "run code," but the scope you manage and the billing model differ.

| Item | EC2 | Lambda | ECS/Fargate |
|------|-----|--------|-------------|
| Unit | Virtual server | Function (per event) | Container |
| Management burden | High (OS, patching) | Almost none | Medium (containers) |
| Billing | Execution time (hours/seconds) | Invocation count and time (ms) | Execution resources |
| When it fits | Always-on servers, fine-grained control | Short, intermittent work | Containerized apps |

> 🎯 **Scenario**: "A few times a day, only when a file is uploaded, I just need a quick bit of processing" → no need to keep it always on, so Lambda. "I'm putting up a legacy app that I tune at the OS level and that runs 24/7" → EC2. "I want to run an app already built as a Docker container without managing servers" → Fargate.

> 💡 **Related theory**: Lambda is called "serverless," but it's not that there are no servers — it means **I don't see the servers**. You pay only for what you use and it scales automatically. This is the decisive difference from EC2, which "costs money even during idle time."

## Storage Review: S3 vs EBS vs EFS

All three store data, but "the shape of the data" and "who attaches to it" differ.

| Item | S3 | EBS | EFS |
|------|-----|-----|-----|
| Type | Object storage | Block storage | File storage |
| Attachment target | The internet (accessible anywhere) | Attached to one EC2 | Shared by multiple EC2s |
| Analogy | An unlimited file locker | One PC's hard disk | An in-house shared folder |
| When it fits | Backups, static files, images | A server's boot disk, DB data | Shared data across many servers |

> ⚠️ **Pitfall**: EBS is by default a disk that attaches to **only one EC2**. If "multiple servers must read and write the same files simultaneously," it's EFS, not EBS. If it's "large files or backups accessed directly from the internet," it's S3. This distinction is an exam regular.

> 💡 **Related theory**: S3 stores in units of objects. That is, it handles a file together with its metadata and unique identifier as one whole. So it's unsuitable for modifying only part of a file, but it scales effectively without limit and has very high durability (99.999999999%), making it strong for backups and static hosting.

## Networking Review: VPC Basics

A VPC (Virtual Private Cloud) is **my dedicated virtual network** created inside AWS. By the house analogy, it's a single home you've leased inside the giant apartment complex that is AWS, and you divide its interior into rooms (subnets) and install doors (security groups).

| Concept | Meaning |
|------|------|
| Subnet | A zone that finely divides a VPC (public/private) |
| Public subnet | Can communicate with the internet directly (web servers, etc.) |
| Private subnet | Blocks direct internet access (protects DBs, etc.) |
| Security group | Instance-level firewall (allow rules) |
| Internet gateway | The doorway that connects a VPC to the internet |

> 🎯 **Scenario**: "The web server must be reachable from outside, but the database must never be exposed externally." → Put the web server in a public subnet and the DB in a private subnet. The DB has no route to the internet gateway, so it can't be reached directly from outside.

> 💡 **Related theory**: A security group is a **stateful** firewall. If you allow an incoming request, the response to it goes back out automatically without a separate rule. Also remember that it "defines allow rules only, with everything else blocked by default."

## Edge Review: CloudFront + Route 53

The two services are a pair that solves the distance problem. CloudFront is "fast delivery," Route 53 is "name resolution."

| Item | CloudFront | Route 53 |
|------|------------|----------|
| Identity | CDN (content delivery network) | DNS (domain name translation) |
| What it does | Caches content at the edge for fast delivery | Connects domain names to IPs/resources |
| Key keywords | Caching, latency reduction, origin protection | Routing policies, health checks, domain registration |

> ⚠️ **Pitfall**: "Caching content to reduce latency" = CloudFront, "routing a domain to the nearest region" = Route 53. Both use edge infrastructure, but don't get confused that they do different jobs.

## Wrapping Up

Re-etching Core Services 1 one line at a time: **compute** climbs the responsibility boundary upward through EC2 (a server you manage directly), Lambda (serverless), and ECS (containers); **storage** differs in data shape across S3 (object), EBS (single-server block), and EFS (shared file); **networking** has VPC create a dedicated network, divided and guarded by subnets and security groups; and at the **edge**, CloudFront delivers and Route 53 directs.

Remember that the exam always asks in the form of "situation → the best-fit service." Next week we'll learn Core Services 2, such as databases, messaging, management tools, and IaC.

---

## 📝 연습 문제

**문제 1.** You want to run a light processing job that runs briefly only when a file is uploaded, a few times a day. To avoid incurring cost during idle time, which compute service is the best fit?

A) Amazon EC2  
B) AWS Lambda  
C) Amazon EBS  
D) Amazon VPC  

**정답: B**  
해설: Lambda is a serverless service that runs only when an event fires and bills only for what you use, making it a good fit for intermittent, short jobs. EC2 keeps billing while it's on, incurring idle cost; EBS is block storage; and VPC is a network — none of which is the agent that runs code.

---

**문제 2.** You need a shared file system where multiple EC2 instances can read and write the same files simultaneously. Which storage is the best fit?

A) Amazon S3  
B) Amazon EBS  
C) Amazon EFS  
D) Amazon CloudFront  

**정답: C**  
해설: EFS is file storage that multiple EC2s can mount and share simultaneously. EBS is by default a block disk that attaches to only one instance, unsuitable for concurrent sharing; S3 is object storage; and CloudFront is a content delivery network — so neither is meant for a shared file system.

---

**문제 3.** You want to protect a database server so it can't be accessed directly from the internet, while allowing the web server to accept external connections. What is the most appropriate configuration in a VPC?

A) Put both the web server and the DB in a public subnet  
B) Put the web server in a public subnet and the DB in a private subnet  
C) Put both the web server and the DB in a private subnet  
D) Don't divide subnets and don't use security groups  

**정답: B**  
해설: The standard configuration is to put the web server that needs external connections in a public subnet, and the DB that needs protection in a private subnet with no internet route. Putting both in public exposes the DB, putting both in private means the web server can't accept external connections, and not using subnets or security groups makes protection impossible in the first place.

---

**문제 4.** Which most accurately distinguishes S3, EBS, and EFS?

A) S3 is block, EBS is object, EFS is file storage  
B) S3 is object, EBS is single-server block, EFS is shared file storage  
C) All three are disks that attach to only one EC2  
D) All three are object storage accessed directly from the internet  

**정답: B**  
해설: S3 is object storage, EBS is block storage usually attached to one EC2, and EFS is file storage shared by multiple servers. Descriptions with the types swapped, or claims that all three are single-server disks or all three are object storage, are contrary to fact.

---

**문제 5.** To deliver static content to users worldwide with low latency, you want to cache content at outposts close to users. Which service is the best fit?

A) Amazon Route 53  
B) Amazon CloudFront  
C) Amazon EFS  
D) Amazon EC2  

**정답: B**  
해설: CloudFront is a CDN that caches content at edge locations worldwide to deliver it quickly from a location near the user. Route 53 is a DNS that turns a domain name into an address, EFS is shared file storage, and EC2 is a virtual server — so none plays the role of content caching and delivery.

---
