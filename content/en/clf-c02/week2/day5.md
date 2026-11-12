# Day 5 - Week 2 Wrap-Up — Core Services 1 Review

This week we made a full lap around AWS's "internal infrastructure." Servers (compute), the containers that hold data (storage), the roads that connect them (networking), and finally the outward-facing services that deliver quickly to faraway users (edge). Today we add nothing new; we bind the scattered pieces into one big picture and review.

The heart of review isn't memorization but **"when to choose what."** The exam almost always gives a situation (scenario) and asks "which service is the most suitable?" So today we organize around per-service comparison tables and selection criteria.

The most common misconception among people learning the cloud for the first time is that "you have to memorize every service name." If you dissect actual questions, the structure is almost identical. Inside a two- or three-line situation description, **one or two words that point to the answer** are hidden — phrases like "multiple servers at the same time," "no cost during idle time," or "must never be exposed externally." Training yourself to notice those words is itself exam study.

We can call this study method **keyword anchoring**. Instead of memorizing whole service descriptions, you build many short links of the form "when you see this word, it's this service." Human memory holds on to short pairs far longer than long sentences. Every table that appears today is a tool for building those pairs.

If you compress this week's content into four big boxes, it looks like this. **Compute is "where the work gets done," storage is "where data is kept," networking is "the roads that connect and guard them," and edge is "how to reach faraway users quickly."** Every service from this week fits inside these four boxes. When you can't remember a service, first ask "which of the four boxes does this belong to?" That alone filters out half the answer choices.

## The Core Services 1 Map at a Glance

| Category | Representative service | One-line definition |
|------|-------------|------------|
| Compute | EC2 | A virtual server you manage yourself |
| Compute | Lambda | Run only code, with no servers (serverless) |
| Compute | ECS/Fargate | Run containers |
| Storage | S3 | Object storage (files, images, backups) |
| Storage | EBS | A block disk attached to EC2 |
| Storage | EFS | A file system shared by multiple servers |
| Networking | VPC | Your own dedicated virtual network |
| Edge | CloudFront | A CDN that delivers content quickly |
| Edge | Route 53 | DNS that converts domain names into addresses |

The categories in this table are also the stages of the "responsibility boundary." With EC2, you manage everything up to the OS; with ECS/Fargate, you only care about containers; with Lambda, you just upload code. The higher you go, the more AWS takes on.

Adding this week's supporting cast tightens the map. On the storage side there were S3 **storage classes**, **Glacier** (long-term archiving), and **lifecycle rules**; on the networking side, **NACLs** (subnet firewalls) and **NAT gateways**; on the edge side, **Shield** (DDoS protection) and **WAF** (web request filtering). Supporting players are never forgotten if you memorize them paired with the leads.

## Compute Review: EC2 vs Lambda vs ECS

All three services "run code," but the scope you manage and the billing method differ.

| Aspect | EC2 | Lambda | ECS/Fargate |
|------|-----|--------|-------------|
| Unit | Virtual server | Function (per event) | Container |
| Management burden | High (OS, patching) | Almost none | Medium (containers) |
| Billing | Run time (per hour/second) | Number of executions and duration (ms) | Resources used while running |
| Suited for | Always-on servers, fine-grained control | Short, intermittent jobs | Containerized apps |

> 🎯 **Scenario**: "A few times a day, it only needs to process briefly when a file is uploaded" → there's no need to keep it running all the time, so Lambda. "We're deploying a legacy app that runs 24 hours a day with hand-tuned OS settings" → EC2. "We want to run an app already built as a Docker container without managing servers" → Fargate.

Lambda is called "serverless," but that doesn't mean there are no servers; it means **you don't see the servers**. You pay only for what you use and it scales automatically. This is the decisive difference from EC2, where "money goes out even during idle time."

### Revisiting EC2 Purchase Options

Another axis the exam covers in compute is "how do you buy the same server." This isn't about performance but about **contract terms**. Think of mobile phone plans. Without a commitment it's expensive but you can quit anytime, and with a 2-year commitment it's cheaper but you can't change midway.

| Purchase option | One-line character | If you see this keyword |
|-----------|-----------|-------------------|
| On-Demand | Pay for what you use, no commitment | "Unpredictable," "short-term," "testing" |
| Reserved Instances / Savings Plans | Commit for 1–3 years for a discount | "Steady all year," "stable workload," "long-term cost savings" |
| Spot | Spare capacity at a very low price, can be reclaimed | "Fine if interrupted," "batch," "cheapest" |
| Dedicated Host | Occupy a whole physical server | "Licensing," "compliance," "physical server isolation" |

Imagine a single online shop. The order web server that runs 24 hours is tied down with **Reserved Instances or Savings Plans** for a discount, the sales-aggregation batch that runs once every dawn can be shut down midway so it saves money with **Spot**, and the thumbnail conversion that runs briefly only when photos are uploaded brings idle cost to zero with **Lambda**. This split of answers by workload character, even within one company, is exactly what the exam aims at. That's why you can't just see "what's the cheapest option?" and always pick Spot — if conditions like "must not be interrupted" or "always-on operation" come with it, Spot is a wrong answer.

## Storage Review: S3 vs EBS vs EFS

All three store data, but "the shape of the data" and "who attaches" differ.

| Aspect | S3 | EBS | EFS |
|------|-----|-----|-----|
| Type | Object storage | Block storage | File storage |
| Connected to | The internet (accessible from anywhere) | Attached to one EC2 | Shared by multiple EC2s |
| Analogy | An infinite file locker | One PC's hard disk | A company shared folder |
| Suited for | Backups, static files, images | A server's boot disk, DB data | Shared data for many servers |

> ⚠️ **Pitfall**: EBS is by default a disk that attaches to **only one EC2**. If "multiple servers must read and write the same files at the same time," it's EFS, not EBS. If it's "large files and backups accessed directly from the internet," it's S3. This distinction is easy to get mixed up in the answer choices.

S3 stores in units of objects. That is, it handles a file together with its metadata and unique identifier as a whole. So it's unsuitable for modifying just part of a file, but it scales practically without limit and has extremely high durability (99.999999999%), making it strong for backups and static hosting.

Moving it to an office makes it clearer. **EBS is the hard disk plugged into my laptop** (only I use it), **EFS is the office's shared network drive** (many use it at the same time), and **S3 is an infinite warehouse open to the internet** (accessed by address, not attached to a server).

### Cheaper for Rarely Used Data: Storage Classes and Lifecycle

Another exam point for S3 is that **"even for the same file, you can place it in a different storage tier depending on how often you retrieve it."** There's no reason to store product images viewed every day and accounting records kept for years only because of a legal obligation at the same price. So there are several classes, from tiers for frequently used data to the **Glacier** family for long-term archiving, and if you attach a **lifecycle rule** to them, it all runs without human hands: "move old files to a cheaper tier automatically, and delete them when older still."

> ⚠️ **Pitfall**: Archive tiers come with the trade-off that "it's cheap, but retrieval takes time." So **an answer choice that puts data that must be queried frequently and immediately into an archive tier is wrong.** If a question says "immediate retrieval" or "millisecond access," it isn't an archive.

## Networking Review: VPC Basics

A VPC (Virtual Private Cloud) is **your own dedicated virtual network** that you create inside AWS. If we compare it to a house, it's a single home you've rented within the huge apartment complex called AWS, and inside it you divide the space into rooms (subnets) and install doors (security groups).

| Concept | Meaning |
|------|------|
| Subnet | A section into which a VPC is divided (public/private) |
| Public subnet | Can communicate directly with the internet (web servers, etc.) |
| Private subnet | Direct internet access blocked (protects DBs, etc.) |
| Security group | An instance-level firewall (allow rules) |
| Internet gateway | The entrance that connects the VPC to the internet |

> 🎯 **Scenario**: "The web server must be reachable from outside, but the database must never be exposed externally." → Put the web server in a public subnet and the DB in a private subnet. The DB has no route to the internet gateway, so it can't be reached directly from outside.

A security group is a **stateful** firewall. If you allow an incoming request, the response to it goes out automatically without a separate rule. Also remember that it's "define only allow rules, and everything else is blocked by default."

### Telling the Two Gatekeepers Apart: Security Group vs NACL

There are gatekeepers standing at two layers in a VPC. In apartment terms, **a NACL is the guard post at the complex entrance (per subnet)** and **a security group is the front door of each household (per instance)**. Passing the complex entrance doesn't mean you can walk into any home, and even if you know a front-door code, you can't get in if you're stopped at the complex entrance. The kinds of rules differ too — a security group uses **only allow rules** and remembers state (Stateful), while a NACL can use **both allow and deny** and does not remember state (Stateless).

### Telling the Two Ways Out Apart: Internet Gateway vs NAT Gateway

- **Internet Gateway (IGW)**: The VPC's main gate. It's a two-way passage. Connections coming in from outside and connections going out from inside both pass through this gate.
- **NAT Gateway**: A **one-way exit** exclusively for private subnets. A server inside can go out to fetch software updates, but nothing from outside can come in to that server first.

Suppose an internal payment server is in a private subnet. The security team has stipulated that "this server must never be directly accessible from the internet." But the development team says "it has to receive security patches." The answer that satisfies both requirements at once is the NAT gateway. The server can go out and fetch patches, but there is no path for anyone on the internet side to find and enter that server. On the exam, when the phrase **"an instance in a private subnet must reach out to the internet, but inbound must be blocked"** appears, the NAT gateway is almost always the answer.

## Edge Review: CloudFront + Route 53

The two services are a pair that solves the distance problem. CloudFront is "fast delivery," and Route 53 is "name resolution."

| Aspect | CloudFront | Route 53 |
|------|------------|----------|
| Identity | CDN (content delivery network) | DNS (domain name translation) |
| What it does | Caches content at the edge and delivers it quickly | Connects domain names to IPs and resources |
| Key keywords | Caching, reduced latency, origin protection | Routing policies, health checks, domain registration |

> ⚠️ **Pitfall**: "Caching content to reduce latency" = CloudFront; "routing the domain to the nearest Region" = Route 53. Both use edge infrastructure, but you must not confuse the fact that their roles differ.

In restaurant terms, **Route 53 is the directions (navigation)** and **CloudFront is the branch stores opened in each neighborhood**. Without directions you can't find the place, and without branches you'd have to travel far, so real services use both together. Security services attach at the edge too — **Shield** blocks DDoS attacks, and **WAF** inspects the content of web requests and filters out malicious ones (SQL injection, etc.).

## Master List of Confusing Concept Pairs

This collects only the **pairs from this week that look similar and keep getting answered wrong**. Even just skimming this table right before the exam changes your felt accuracy.

| Confusing pair | One-line decisive difference |
|-------------|------------------|
| EC2 vs Lambda | An always-on server vs running only when an event occurs |
| Lambda vs Fargate | Function-level serverless vs container-level serverless |
| ECS on EC2 vs ECS on Fargate | I manage the servers that run containers vs AWS manages them |
| Reserved Instances vs Spot | Always-running workload vs workload that can tolerate interruption |
| S3 vs EBS | An object store accessed by URL vs a disk attached to one EC2 |
| EBS vs EFS | A disk dedicated to one instance vs shared files used by many at once |
| S3 Standard vs Glacier family | Retrieved often vs long-term archive that's rarely retrieved |
| Public subnet vs private subnet | Has a path to the internet vs does not |
| Security group vs NACL | Instance-level, stateful vs subnet-level, stateless |
| Internet gateway vs NAT gateway | A two-way main gate vs a one-way street that only goes out |
| CloudFront vs Route 53 | Caching content nearby vs guiding names to addresses |
| Shield vs WAF | DDoS protection vs filtering web request content |

> ⚠️ **Pitfall**: Exam answer choices are filled not with "completely wrong answers" but with **"answers that are similar but with one condition off."** For example, choosing EBS when the condition says "shared by multiple servers," or choosing Spot when it says "must not be interrupted," are classic cases. Before looking for the right answer, it's far safer to follow the order of **first crossing out the choices that conflict with the conditions in the question.**

## Master Table: Exam Keyword → Service Mapping

When the words below appear in a question, they almost always point to that service. Rather than memorizing it whole, use it by reading it aloud two or three times to get "this phrase points to this" into your body.

| Keyword in the question | Service it points to |
|---------------------|----------------|
| Zero idle-time cost, only when events occur, no server management | Lambda |
| OS-level control, migrating a legacy app, specific kernel settings | EC2 |
| Containers, Docker image, without provisioning servers | ECS on Fargate |
| Batch that's fine if interrupted, cheapest | Spot Instances |
| Static website hosting, backup files, unlimited scaling, high durability | S3 |
| Archive, almost never accessed, lowest cost for long-term retention | Glacier family |
| EC2's boot disk, single-instance block volume | EBS |
| A shared file system that multiple EC2s read and write at the same time | EFS |
| Isolated dedicated network, designing your own IP range | VPC |
| Isolate the DB from the internet | Private subnet |
| Instance-level firewall, allow rules only | Security group |
| Subnet-level firewall, deny rules needed | Network ACL (NACL) |
| Low latency for users worldwide, caching, reduced origin load | CloudFront |
| Domain registration, DNS, routing policies, health checks | Route 53 |
| Defend against DDoS attacks | AWS Shield |

## For This Situation, This Service: Scenario Collection

If the table above is "word → service," the one below is "situation → service." It takes the form closest to actual questions, so cover the right-hand side with your hand and try to think of the answer first.

| Situation | Answer |
|------|-----|
| Moving an internal legacy app that needs specific OS kernel settings to the cloud | EC2 |
| Running an app already built with Docker without touching servers | ECS on Fargate |
| A large overnight rendering job, as cheaply as possible | Spot Instances |
| Cutting costs for an internal ERP server that will stay on for 3 years | Reserved Instances / Savings Plans |
| Hosting a company promotional static website without servers | S3 |
| Automatically moving logs older than 90 days to a cheaper tier | S3 lifecycle rule |
| 10 web servers must share the same upload folder | EFS |
| Web servers public, database inaccessible from outside | Separate public/private subnets |
| Want a private DB server to fetch only security patches | NAT gateway |
| Overseas users complain that images load slowly | CloudFront |
| Want to automatically shift traffic to another Region on failure | Route 53 health checks + routing policy |
| SQL injection attempts coming in on the login form | AWS WAF |

## A 3-Step Decision Flow for When You're Stuck

When your mind goes blank even after reading a scenario, following the order below as is will produce an answer most of the time.

1. **Which of the four boxes is it?** Is it getting work done (compute) / keeping data (storage) / connecting and guarding (networking) / sending far and fast (edge)?
2. **Within that box, ask "who manages it and who attaches?"** For compute, "do I manage up to the OS? Or AWS?"; for storage, "does only one attach? Do many attach? Is it accessed from the internet?"
3. **Settle it with the remaining constraints.** "Can it be interrupted?" "Is immediate retrieval needed?" "Is external exposure forbidden?" "Minimize cost?"

Let's try the situation "the internal document site used by employees at branches worldwide is slow and the origin server load is also high." Step 1 — it's a problem of faraway users, so **edge**. Step 2 — it's content delivery, not name guidance. Step 3 — the condition "reduce origin load" is attached too. **CloudFront**, which absorbs origin requests through caching, is the answer.

## Self-Check List

If you can answer the questions below in a single sentence without hesitation, you've passed this week. If any one catches you, go back to that Day.

- [ ] Can you place EC2, Lambda, and Fargate in order along the single axis of "management responsibility"?
- [ ] Can you name one situation where you must not use Spot Instances?
- [ ] Can you explain the differences among S3, EBS, and EFS with analogies?
- [ ] Do you know what the decisive factor separating a public subnet from a private subnet is?
- [ ] Can you distinguish the unit of application and statefulness of security groups and NACLs?
- [ ] Can you explain the difference in direction between an internet gateway and a NAT gateway?
- [ ] Can you say in one line what problem each of CloudFront and Route 53 solves?

## 📌 Summary

Engraving Core Services 1 one line at a time again looks like this. For **compute**, the responsibility boundary moves upward through EC2 (a server you manage), Lambda (serverless), and ECS (containers); for **storage**, the shape of the data differs among S3 (object), EBS (single-server block), and EFS (shared files); for **networking**, the VPC creates a dedicated network and you divide and guard it with subnets and security groups; and for **edge**, CloudFront delivers and Route 53 guides.

Remember that the exam always asks in the form "situation → most suitable service." Next week we'll learn Core Services 2: databases, messaging, management tools, IaC, and so on.

There's no need to worry if this week's content isn't perfectly memorized. CLF-C02 isn't an exam that asks about detailed settings; it's an exam that checks **"have you gotten a feel for what working with the cloud is like."** Even if a service name is fuzzy, as long as the big boxes — "this is a server story, that's a storage story" — don't waver, the direction of the answer is set. Today's tables are a summary to unfold again right before the exam, so come back and skim them now and then.

---

## 📝 Practice Questions

**Question 1.** You want to run a light processing job that runs briefly only when a file is uploaded, a few times a day. To avoid incurring cost during idle time, which compute service is the best fit?

A) Amazon EC2  
B) AWS Lambda  
C) Amazon EBS  
D) Amazon VPC  

**Answer: B**  
Explanation: Lambda is a serverless service that runs only when an event fires and bills only for what you use, making it a good fit for intermittent, short jobs. EC2 keeps billing while it's on, incurring idle cost; EBS is block storage; and VPC is a network — none of which is the agent that runs code.

---

**Question 2.** You need a shared file system where multiple EC2 instances can read and write the same files simultaneously. Which storage is the best fit?

A) Amazon S3  
B) Amazon EBS  
C) Amazon EFS  
D) Amazon CloudFront  

**Answer: C**  
Explanation: EFS is file storage that multiple EC2s can mount and share simultaneously. EBS is by default a block disk that attaches to only one instance, unsuitable for concurrent sharing; S3 is object storage; and CloudFront is a content delivery network — so neither is meant for a shared file system.

---

**Question 3.** You want to protect a database server so it can't be accessed directly from the internet, while allowing the web server to accept external connections. What is the most appropriate configuration in a VPC?

A) Put both the web server and the DB in a public subnet  
B) Put the web server in a public subnet and the DB in a private subnet  
C) Put both the web server and the DB in a private subnet  
D) Don't divide subnets and don't use security groups  

**Answer: B**  
Explanation: The standard configuration is to put the web server that needs external connections in a public subnet, and the DB that needs protection in a private subnet with no internet route. Putting both in public exposes the DB, putting both in private means the web server can't accept external connections, and not using subnets or security groups makes protection impossible in the first place.

---

**Question 4.** Which most accurately distinguishes S3, EBS, and EFS?

A) S3 is block, EBS is object, EFS is file storage  
B) S3 is object, EBS is single-server block, EFS is shared file storage  
C) All three are disks that attach to only one EC2  
D) All three are object storage accessed directly from the internet  

**Answer: B**  
Explanation: S3 is object storage, EBS is block storage usually attached to one EC2, and EFS is file storage shared by multiple servers. Descriptions with the types swapped, or claims that all three are single-server disks or all three are object storage, are contrary to fact.

---

**Question 5.** To deliver static content to users worldwide with low latency, you want to cache content at outposts close to users. Which service is the best fit?

A) Amazon Route 53  
B) Amazon CloudFront  
C) Amazon EFS  
D) Amazon EC2  

**Answer: B**  
Explanation: CloudFront is a CDN that caches content at edge locations worldwide to deliver it quickly from a location near the user. Route 53 is a DNS that turns a domain name into an address, EFS is shared file storage, and EC2 is a virtual server — so none plays the role of content caching and delivery.

---
