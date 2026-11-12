# Day 2 - AWS Global Infrastructure

## 📌 Key Takeaways

- The hierarchy has three tiers: **Region > Availability Zone (AZ) > data center**. A Region is not a single data center, and an AZ is not a single data center.
- **Regions** are completely independent of one another. Four selection criteria — latency, compliance, service availability, cost.
- An **AZ** is a facility with independent power, cooling, and networking. There are usually three or more per Region. **Spreading across two or more AZs = a high-availability design**.
- An **edge location** is a content delivery point close to users (hundreds of them worldwide). CloudFront and Route 53 operate there.
- Most services are **Regional services** (EC2, RDS, S3), while **IAM, Route 53, and CloudFront** are global services.

## First, Why Was This Structure Needed?

On Day 1 we said "the cloud is renting someone else's servers." But those servers **physically exist somewhere**. There is a building, electricity comes in, and internet lines are plugged in. Three practical problems arise from this.

1. **Distance is speed** — data cannot travel faster than light, either. When a user in Seoul sends a request to a server on the other side of the globe, the round trip physically takes time. This is the cause of most cases where a screen feels "slow."
2. **Every country has different laws** — there are rules such as "the personal data of our citizens must be stored domestically." Which country a server is in becomes a legal issue.
3. **Buildings suffer accidents** — power outages, fires, floods, earthquakes. If you pack your servers into one building, an accident in that building means the entire service goes down.

AWS's global infrastructure is the answer to these three problems. **Regions** address problems 1 and 2 (distance and law), **Availability Zones** address problem 3 (accidents), and **edge locations** address problem 1 (distance) again at a finer granularity. Once you grasp this correspondence, today's material is about half done.

| Problem | Infrastructure that solves it |
|------|----------------|
| It is far away and therefore slow / data must be kept in a specific country | Choose the **Region** that fits users and regulations (+ **edge locations**) |
| What if a whole building goes down? | Spread across multiple **Availability Zones (AZs)** within the same Region |
| What if an entire city or country is paralyzed? | Spread across multiple **Regions** (disaster recovery) |

## Regions: Footholds Around the World

- **Region** = a **geographic area** where AWS clusters its data centers. There are several around the world, such as Seoul, Tokyo, N. Virginia, and Frankfurt.
- When building a service, the user **chooses which Region to place it in**.
- Each Region has a **code** such as `ap-northeast-2` (Seoul) or `us-east-1` (N. Virginia). You specify the Region by this code in the console and in configuration files.

Region codes are easy to read using the `area-direction-number` rule. `ap` means Asia Pacific, `us` means the United States, `eu` means Europe, followed by a direction such as `northeast` or `west` and a sequence number. So `ap-northeast-2` means "the second Region in northeast Asia Pacific." You don't need to memorize them, but get familiar enough that you won't be thrown when a code appears in a question.

When choosing a Region, you usually weigh the following four factors.

| Factor | Meaning |
|-----------|------|
| Latency (distance) | The closer the Region is to users, the faster the response |
| Compliance | Satisfying legal requirements such as "store the data domestically" |
| Service availability | Not every service is available in every Region |
| Cost | Even the same service can be priced differently per Region |

Applying the four criteria to real situations works like this.

| Criterion | It becomes decisive in situations like this |
|------|--------------------------|
| **Compliance** | When there is a "data must stay in the country" requirement, as in finance, healthcare, or the public sector. It overrides the other criteria |
| **Latency** | A service whose users are concentrated in one country. The Region closest to the users is the answer |
| **Service availability** | A new service you want to use may not yet exist in that Region. You need to check in advance |
| **Cost** | Even for the same specification, prices differ per Region. For a batch job where latency matters less, a cheaper Region is an option |

> ⚠️ **Pitfall**: Of the four criteria, **compliance is non-negotiable**. There is no question asking "if latency increases a little, must you still obey the law, or must you be fast even if it breaks the law?" If the passage contains expressions such as "data sovereignty," "obligation to store domestically," or "must not leave a particular country," then **the cost and latency choices are all wrong** and compliance is the answer.

Regions are operated completely independently of one another. They are isolated so that a problem in one Region does not affect the others. So if you split important services across multiple Regions, you can keep serving from another area even if an entire area fails. This is the basic idea of disaster recovery (DR) design.

This independence has one important side effect. **Regions being isolated also means "nothing is copied automatically."** A virtual server or stored files you created in the Seoul Region are simply not visible in the Tokyo Region. If you want to use them in another Region as well, **the customer must explicitly set up replication**. This point is often used as a trap on the exam.

For a service aimed at Korean users, you would usually choose the Seoul Region. But if the company expands into Southeast Asia, the dilemma begins — stay with Seoul alone, or add a local Region? The judgment is made with the four criteria above. Are there local privacy regulations (compliance)? Is it far enough that perceived speed becomes a problem (latency)? Does the service you were using exist in that Region (service availability)? Can you afford the cost of operating two Regions (cost)? The exam also asks you to pick "the **most important** consideration" in situations like this.

## Availability Zones (AZs): Independent Groupings Within a Region

- A single Region is divided into multiple **Availability Zones (AZs)**.
- Each AZ is **a facility made up of one or more physical data centers, with independent power, cooling, and networking**.
- Every AWS Region usually has **three or more AZs**.
- **Why they are split**: so that even if one data center suffers a power outage or fire, the other AZs are unaffected — that is, they are physically separated so that **failures do not spread**.
- Even so, AZs are connected by a **fast dedicated network**, so they exchange data in near real time.

```
        [ Region: Seoul (ap-northeast-2) ]
                     |
      +--------+--------+--------+--------+
      |        |        |        |
    AZ-a     AZ-b     AZ-c     AZ-d   <- each AZ has independent power and network
      |        |        |        |
  Data center  Data center  Data center  Data center
```

The key way to use them is simple. **Instead of placing a service in only one AZ, split it across two or more AZs**, and the service survives even if one AZ goes down entirely → a **High Availability design**.

### What Actually Happens When One AZ Goes Down?

Saying "high availability" in words alone doesn't sink in. Let's build the same service in two ways and suppose AZ-a has a power outage.

```
[ Bad design ]  Everything in AZ-a         [ Good design ]  Spread across AZ-a / AZ-b
   Web server x2 -+                           Web server x1 --+        +-- Web server x1
   DB x1         -+ AZ-a  <- power outage     DB (primary) ---+ AZ-a   | AZ-b  DB (standby)
                 -+                                           +--------+
   -> Everything stops at once.                -> Traffic moves to the surviving AZ-b,
      Recovery = wait for the AZ to recover       and the service continues
```

- **Bad design**: no matter how many servers you launch, it is useless if they are all in the same AZ. That is because the group sharing power, cooling, and networking goes down as a whole. What decides survival is not "the number of servers" but **"where you spread them."**
- **Good design**: the device that distributes traffic (a load balancer) skips the failed AZ and sends requests only to the surviving side. If the database also has a standby copy in another AZ, that one takes over the primary role.

In other words, an AZ is a **"firewall that contains failures."** This is also why AWS keeps AZs at a distance from each other — far enough apart that they won't suffer the same flood or outage together, yet close enough to exchange data in real time.

> ⚠️ **Pitfall**: The choice saying "using multiple Availability Zones also gives you disaster recovery (DR)" is wrong. Spreading across AZs is **high availability within a single Region**. If an earthquake or a wide-area power outage affects **the entire area**, the AZs in the same Region may all be at risk together. To prepare for city- or country-scale disasters, you must keep replicas in **another Region**. In questions, distinguish: "a failure of one building or facility" → spread across AZs; "a disaster across the entire area" → multi-Region.

The exam point is that "a Region is not a single data center" and "an AZ is not a single data center." A Region is a grouping of multiple AZs, and an AZ is a grouping of one or more data centers. So remember it as a three-tier structure in the order Region > AZ > data center.

## Edge Locations: Closer to the User

- A **content delivery point** that exists in far greater numbers than Regions and AZs and is scattered closer to users. There are **hundreds** of them worldwide.
- The representative use is **CloudFront (a content delivery network, CDN)**.
  - Example: when a Korean user views an image from a server in the United States, it is slow if every request travels all the way to the U.S.
  - If you copy (**cache**) that image in advance to an edge location near Korea, the user receives it quickly from a nearby place.
- Other services such as **Route 53 (DNS)** also operate at the edge.

Remember the difference in roles: Regions and AZs are "where you place data and compute," while edge locations are "where you deliver quickly to users." Caching content at the edge not only speeds up responses but also reduces the load on the origin server.

In an everyday analogy, the problem edge locations solve is a **neighborhood convenience store**. The distribution warehouses (Regions) number only a few nationwide, so getting goods takes a long time. So frequently sold goods are brought in advance to the neighborhood convenience store (the edge). Customers pick them up right away at the nearby store (fast), and the warehouse becomes quieter because orders decrease (reduced load).

- The **first request** goes all the way to the origin because the cache is empty (slow).
- From the **next request** onward, the copy remaining at the edge is served immediately (fast).
- So it is most effective **when many people repeatedly receive the same content** (images, videos, static files, software distribution).

Suppose an online shop with servers only in Korea starts selling overseas. Overseas customers must make a round trip to Korea every time they view one product image, so the page is noticeably slow. If you move the Region, domestic customers become slow this time. In this case the answer is a **CDN**. Leave the origin in the Seoul Region as is, and cache only the static content such as images, CSS, and videos at edges worldwide, and both sides get faster. If a passage says "improve the perceived speed for overseas users without moving the server," the answer is almost always CloudFront.

## Telling Regions, AZs, and Edges Apart at a Glance

The three have similar names and keep getting mixed up. The safest approach is to remember them by **"what they exist for."**

| Category | What it is | Reason for existing | Sense of count | What the customer does |
|------|------|----------|----------|--------------|
| **Region** | A geographic area containing groups of data centers | Distance, regulation, disaster distribution | Several, at country or city level | **Choose** which Region to build in |
| **Availability Zone (AZ)** | A group of facilities within a Region with independent power, cooling, and networking | So that a failure in one facility doesn't spread | Usually three or more per Region | **Spread placement** across multiple AZs |
| **Data center** | The actual building | Physical substance | One or more per AZ | Not handled directly |
| **Edge location** | A content delivery point near users | Reduce delivery latency and origin load | Hundreds worldwide | **Use** CDN and DNS |

There is one more thing whose name may appear on the exam.

- **Local Zone**: an extension of part of a Region to a large city near many users. The goal of "being close" is the same as with the edge, but whereas the edge is where **content is cached**, a Local Zone is where **compute and storage actually run**. It is used in special cases that need very low latency.

**Pitfall**: treat the choice "deploy the application to edge locations" as basically wrong. The edge's original role is **content delivery and caching**, not a platform for running services. Applications and databases run in **AZs within a Region**.

## Global Services vs. Regional Services

AWS services fall broadly into two kinds. This distinction is within the scope of the exam.

| Category | Meaning | Examples |
|------|------|------|
| **Regional service** | Operates tied to a specific Region. You pick a Region and use it | EC2 (virtual servers), RDS (databases), S3, and most other services |
| **Global service** | Operates as a single worldwide service regardless of Region | IAM (users and permissions), Route 53 (DNS), CloudFront (CDN) |

- Most services are **Regional services**, where you must choose "which Region to place them in."
- By contrast, those that inherently must operate across the whole world, such as IAM (account and permission management), Route 53 (domain DNS), and CloudFront (edge caching), are **global services**.

When you are unsure whether something is global or regional, asking yourself **"Would it make sense for this to exist only once worldwide?"** is generally right.

- What if user accounts and permissions (IAM) existed separately in each Region? That would mean you are an administrator in Seoul but not in Tokyo — it makes no sense. → **Global**
- What if domain names (Route 53) differed per Region? A different site would appear depending on where you connect from — it makes no sense. → **Global**
- Edge caching (CloudFront) exists in the first place to distribute across the world. → **Global**
- By contrast, for virtual servers (EC2) or databases (RDS), "where you place them" is itself a matter of latency and compliance. → **Regional**

| Service | Category | Reason |
|--------|------|------|
| EC2 · RDS · EBS | Regional (more precisely, placed in an AZ) | Actual compute and storage happen at a specific location |
| S3 | Regional (only the bucket name is global) | Data is stored in the Region you specify |
| IAM | Global | Must apply as one across the entire account |
| Route 53 | Global | The same domain name no matter where you connect from |
| CloudFront | Global (edge) | Its purpose is to distribute content to edges worldwide |
| WAF | Operates alongside a global distribution | Filters requests in front of CloudFront |

S3 is an easily confused example. The S3 **bucket name** must be unique worldwide (a global namespace), but the actual **data is stored in a specific Region**. In other words, the name is global and the data is regional. Be sure to distinguish: "just because the bucket name is global does not mean the data is replicated worldwide."

## How It Appears on the Exam

In global infrastructure questions, the passage contains almost exactly the hint for the answer. Just getting used to the correspondences below solves most of them.

| If the question contains this wording | The answer is this |
|--------------------------|----------|
| "data cannot leave a specific country," "data sovereignty" | Compliance → choose a **Region** in that country |
| "close to users so responses are fast," "minimize latency" | Choose a **Region** close to users |
| "service continues even if one data center/facility fails" | Spread across **multiple AZs** (high availability) |
| "prepare for a disaster across the entire area, a wide-area failure" | Replicate across **multiple Regions** (disaster recovery) |
| "deliver images and videos quickly to users worldwide" | **Edge locations** / CloudFront (CDN) |
| "improve delivery speed while reducing origin server load" | **Caching** / CloudFront |
| "domain name registration, DNS routing" | **Route 53** (global) |
| "manage users and permissions as one across the whole account" | **IAM** (global) |
| "this service is not yet available in this Region" | Service availability (a Region selection criterion) |
| "same specification but the price differs per Region" | Cost (a Region selection criterion) |

- If an answer choice contains the expression **"automatically replicated to all Regions,"** it is usually wrong. Replication between Regions must be configured by the customer.
- Choices like **"an AZ is a single data center"** and **"a Region is a single data center"** are also wrong. Both are groupings.

In the next article, we look at the **shared responsibility model**, which determines "who is responsible for security and operations, AWS or the customer" on top of this infrastructure.

## 📖 Glossary

- **Region**: a geographic area where AWS clusters its data centers. They exist at country or city level, such as Seoul and Tokyo.
- **Availability Zone (AZ)**: a group of facilities within a Region whose power, cooling, and networking are independent of one another. It consists of one or more data centers.
- **Edge location**: a small point that places content in advance close to users. There are far more of them than Regions.
- **Caching**: copying frequently used data in advance to a nearby place and retrieving it quickly.
- **CDN (content delivery network)**: a structure that distributes content to edges worldwide and delivers it quickly to users. In AWS, this is CloudFront.
- **High availability**: a design that keeps a service from stopping even when part of it fails. Splitting across two or more AZs is the basic approach.
- **Disaster recovery (DR)**: preparing so that a service can continue from another area even if an entire area is paralyzed.
- **Regional service vs. global service**: whether it operates tied to a specific Region (EC2, RDS, S3) or as a single worldwide service regardless of Region (IAM, Route 53, CloudFront).
- **Global namespace**: the rule that a name must be exactly one in the whole world. S3 bucket names work this way (the data itself is stored in a specific Region).
- **Latency**: the time from sending a request until the response arrives. It grows with distance.
- **Region code**: an identifier that points to a Region, such as `ap-northeast-2` (Seoul). Read it in the area-direction-number form.
- **Load balancer**: a device that distributes incoming requests across multiple servers. It skips a failed AZ and sends requests to the surviving side.
- **Local Zone**: an extension of part of a Region to near a large city. Unlike the edge, it actually performs compute and storage.
- **Data sovereignty**: the question of which country's laws apply to data. An "obligation to store domestically" is the typical example.
- **Multi-AZ / multi-Region**: spreading across multiple AZs (high availability) / spreading across multiple Regions (disaster recovery). The scale of the incident being prepared for differs.
- **Origin**: the place holding the original that a CDN caches from. Usually a server or storage within a Region.

## 📝 Practice Questions

**Question 1.** Which of the following correctly lists the building blocks of AWS infrastructure from largest to smallest?

A) Availability Zone > Region > data center  
B) Region > Availability Zone > data center  
C) Data center > Region > Availability Zone  
D) Edge location > Region > Availability Zone  

**Answer: B**  
Explanation: A Region is a group of multiple Availability Zones, and an Availability Zone consists of one or more data centers. Therefore Region > Availability Zone > data center is the correct order. Edge locations sit outside this hierarchy and serve as footholds for content delivery.

---

**Question 2.** What is the most appropriate way to keep a service running even if a failure occurs in one AZ?

A) Concentrate all resources in a single AZ  
B) Distribute the service across two or more AZs  
C) Place the service only in edge locations  
D) Change Regions frequently  

**Answer: B**  
Explanation: Availability Zones are independent of one another, so spreading across two or more AZs keeps the service running in another AZ even if one AZ goes down. Concentrating in one AZ means a failure there takes everything down, edge locations are for content delivery rather than a platform for running services, and changing Regions is not a failure-response method.

---

**Question 3.** Which infrastructure component is used to cache content close to users in order to deliver images from a U.S. server to users in Korea more quickly?

A) Availability Zone  
B) Region  
C) Edge location  
D) Data center  

**Answer: C**  
Explanation: The foothold that pre-caches content near users for fast delivery is the edge location, and CDNs like CloudFront make use of it. Regions and Availability Zones are where data and compute live, and a data center is the physical facility that makes up an Availability Zone.

---

**Question 4.** Which of the following is a global service that operates as a single worldwide entity, independent of Regions?

A) EC2  
B) RDS  
C) IAM  
D) EBS  

**Answer: C**  
Explanation: IAM (user and permission management) is a global service that operates as one entity worldwide across the entire account. EC2 (virtual servers), RDS (databases), and EBS (block storage) are all regional services tied to a specific Region.

---

**Question 5.** Which of the following is NOT a factor to consider when selecting a Region?

A) Latency based on distance to users  
B) Compliance requirements to keep data within the country  
C) Availability of services offered in that Region  
D) The color of the Availability Zone  

**Answer: D**  
Explanation: Region selection is usually based on latency (distance), compliance, service availability, and cost. Something like "the color of the Availability Zone" is not a real concept and cannot be a criterion for choosing a Region.

---
