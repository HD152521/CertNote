# Day 5 - Week 1 Review: Cloud Concepts

This week we built up, step by step, the **cloud concepts** that form the most basic foundation of AWS certification. We learned what the cloud is (Day 1), where it is laid out (Day 2), how security responsibility is divided (Day 3), and what the standards of good design are (Day 4). Today we put all of these pieces back together into one big picture and make sure they settle firmly in your head.

## 📌 Key Takeaways

- Cloud = computing that you **rent over the internet and pay for as you use**. The difference from on-premises is **capital expense → variable expense**.
- Infrastructure is a three-tier structure of **Region > Availability Zone (AZ) > data center**. On top of that, **edge locations** attach close to users.
- Security responsibility is **AWS = OF the cloud / customer = IN the cloud**. The more managed the service, the smaller the customer's share, but **data and permissions are always the customer's**.
- The standard of good design is the Well-Architected **six pillars (O-S-R-P-C-S)**.
- This week's exam point is not "memorizing definitions" but **distinguishing pairs of similar concepts**. The summary table below is the heart of today.

## How to Use This Review

If you read a review article from start to finish and close it, little stays. We recommend using it in the following order.

1. First, look only at the **"Week 1 on One Page"** table and explain each line aloud in your own words.
2. If there is a Day you get stuck on, reread only that section.
3. Cover the **"Summary of Frequently Confused Concept Pairs"** table with your hand and try to guess each cell one at a time.
4. Finally, check for gaps with the **self-check list**.

## Week 1 on One Page

| Day | Topic | One line you must remember |
|-----|------|----------------|
| 1 | What is cloud computing | Rent resources over the internet and pay for what you use + six advantages |
| 2 | AWS global infrastructure | Region > Availability Zone > data center, edge locations, global/Regional services |
| 3 | Shared responsibility model | AWS is "the cloud itself (OF)," the customer is "inside the cloud (IN)" |
| 4 | Well-Architected six pillars | O-S-R-P-C-S + the value of cloud adoption |

## Day 1 Revisited: The Cloud and the Six Advantages

Cloud computing is **a model where you rent computing resources over the internet when you need them and pay only for the amount you use**. You rent servers the way you draw electricity from an outlet.

Let's memorize again the **six advantages** AWS emphasizes.

1. Trade capital expense for variable expense (pay for what you use instead of upfront investment)
2. Benefit from massive economies of scale (unit costs fall thanks to many customers)
3. Stop guessing capacity (adjust to demand)
4. Increase speed and agility (obtain resources in minutes)
5. Stop spending money running data centers (remove the burden of power, cooling, and hardware)
6. Go global in minutes

Underlying the six advantages is "elasticity (automatically growing and shrinking with demand)." In particular, ③ no need to guess capacity and ④ speed and agility are possible thanks to elasticity.

**This is where people often go wrong.** Many people confuse ① and ②. ① is a change in the **way of paying** (in advance → as you use), while ② is a change in **unit price** (AWS buys in bulk and supplies cheaply). If the passage says "without upfront investment," it is ①; if it says "thanks to AWS's massive purchasing power," it is ②.

> ⚠️ **Pitfall**: The choice "the cloud is always cheaper" is wrong in most cases. The advantage of the cloud is not "it's cheap" but **"you pay only for what you use."** For a workload that runs at full capacity around the clock at maximum performance, on-premises can even be cheaper. The exam often uses absolute expressions such as "total cost is guaranteed to go down" as wrong answers. If you see words like **"always," "unlimited," "completely free," or "100%,"** be suspicious first.

## Day 2 Revisited: Global Infrastructure

AWS infrastructure is a three-tier structure.

```
Region                <- a geographic foothold around the world (Seoul, Tokyo, etc.)
  └ Availability Zone (AZ)  <- an independent facility within a Region (usually three or more)
      └ Data center         <- the physical building that makes up an AZ
```

On top of that come **edge locations** (caching and delivering content close to users, e.g., CloudFront).

Services fall into two kinds.

- **Regional services** (most): EC2, RDS, S3, and so on — you pick a Region and use them
- **Global services** (some): IAM, Route 53, CloudFront — operate as one worldwide

The basics of a high-availability design is "spread placement across two or more AZs." That is because even if one AZ goes down entirely, the service survives in another AZ.

**Why are Regions divided?** Summarizing it into three reasons makes it stay in memory longer.

- **Latency**: the physically closer to users, the faster the response. For users in Seoul, the Seoul Region is advantageous.
- **Compliance**: some countries and industries have decreed that "data must not cross the border." So choosing a Region is also a legal matter.
- **Disaster isolation**: even if a major disaster strikes one area, other Regions are unaffected.

Adding that **cost** can also differ per Region, and that **not every service exists in every Region**, covers almost every "criteria for choosing a Region" question.

> ⚠️ **Pitfall**: The most common mistake is **confusing an AZ with a data center**. An AZ is a **logical unit** made up of one or more data centers, physically separated from other AZs in the same Region yet connected to them by a fast network. And another thing: **an edge location is not a place that runs applications.** It is a place that delivers and caches content close to users. If it is "deliver static content to users quickly," it is the edge; if it is "where should we put the servers," it is a Region.

## Day 3 Revisited: The Shared Responsibility Model

The core in one sentence: **AWS is responsible for security "OF the cloud," and the customer is responsible for security "IN the cloud."**

| AWS responsibility | Customer responsibility |
|----------|-----------|
| Data centers, hardware | Data, data encryption |
| Virtualization (hypervisor) | IAM users and permissions |
| Global network infrastructure | Guest OS patching (EC2), firewall settings, app security |

And **the boundary moves with the service**. The further you go EC2 → RDS → Lambda (the more managed), the smaller the customer's responsibility, but **data and IAM permissions are always the customer's share**.

"As the level of abstraction rises, the customer's responsibility narrows from the top." However, data and permissions never shrink at any stage — these two sentences are the master key to shared responsibility model problems.

Comparing the shared responsibility model to an **apartment rental** gives you the feel for it. The building structure, elevators, and entrance access system are the **landlord's (AWS's)** share. But locking your own front door, not giving your password to just anyone, and managing the valuables inside your home are the **tenant's (the customer's)** share. No matter how sturdy the building, if the tenant leaves the door open, a thief gets in.

A good share of real cloud security incidents were caused not by AWS infrastructure being breached but by cases where **the customer set a storage bucket to public**, so anyone could view the data. The responsibility for such incidents lies 100% on the customer's side. When a passage like "data was leaked. Whose responsibility is it?" appears on the exam, the answer splits depending only on whether the cause lies in **configuration, permissions, or data**, or in **physical infrastructure or the hypervisor**.

Here is a quick way to judge.

| Cause in the passage | Responsible party |
|--------------|-----------|
| Set a storage bucket to public, granted excessive permissions | Customer |
| Did not patch the guest OS (EC2) | Customer |
| Did not encrypt data | Customer |
| Data center fire, physical intrusion | AWS |
| Hardware failure, hypervisor vulnerability | AWS |
| Engine patching of a managed DB | AWS |

## Day 4 Revisited: The Well-Architected Six Pillars

The six pillars of good cloud design — **O-S-R-P-C-S**.

1. **O**perational Excellence — automation, monitoring, improvement
2. **S**ecurity — least privilege, encryption
3. **R**eliability — multi-AZ, automatic recovery, backups
4. **P**erformance Efficiency — right-sized resources, efficiency
5. **C**ost Optimization — eliminating waste, usage-based
6. **S**ustainability (added in 2021) — reducing environmental impact

When solving problems, first identifying "which pillar is this scenario asking about?" makes the answer visible.

There is one more thing to keep in mind here. You must not confuse the **CAF (Cloud Adoption Framework)**, which has a similar name to Well-Architected. Well-Architected is six **Pillars** that look at whether you built **one system** well, and CAF is six **Perspectives** (business, people, governance, platform, security, operations) that look at **how the whole organization will move to the cloud**.

## Summary of Frequently Confused Concept Pairs

Most of the places the exam actually targets in this week's material are **"two concepts that are similar but different."** The table below is the substance of Week 1.

| Confusing pair | Left | Right | One-line distinction |
|-------------|------|--------|-----------------|
| Region vs Availability Zone (AZ) | A geographic foothold around the world | A group of independent facilities within a Region | The Region is the **big container**, the AZ is a **partition** inside it |
| Availability Zone vs data center | A logical unit made up of one or more DCs | The physical building that makes up an AZ | The AZ is **logical**, the DC is a **building** |
| Regional service vs global service | EC2, RDS, S3, etc. — you pick a Region | IAM, Route 53, CloudFront — one worldwide | If the passage says "select a Region," it is a Regional service |
| Edge location vs Region | Delivers and caches content close to users | Actually runs the service | The edge is **delivery**, the Region is the **kitchen** |
| Scalability vs elasticity | The **ability** to add resources | **Automatically** grows and shrinks with demand | If the word "automatic" is there, it is elasticity |
| Capital expense vs variable expense | Large upfront investment that goes out in advance | Cost that goes out as you use | The cloud is **capital expense → variable expense** |
| High availability vs disaster recovery | Keeps working even when failures occur | A plan to recover after a major incident | High availability is about **not stopping**, disaster recovery is about **bringing back to life** |
| Public vs private vs hybrid | Shared by many customers | Dedicated to one organization | Connecting the two (or on-premises) is hybrid |
| IaaS vs PaaS vs SaaS | Rent only the infrastructure | Rent up to the runtime environment | Up to finished software is SaaS |
| AWS responsibility vs customer responsibility | The cloud **itself** (OF) | **Inside** the cloud (IN) | Data and permissions are **always the customer's** |
| Well-Architected vs CAF | System design review (six pillars) | Organizational transition plan (six perspectives) | If the subject is a **workload**, WA; if a **company**, CAF |
| Performance efficiency vs cost optimization | Worried about speed and latency | Worried about the bill and waste | Is the object of worry **time** or **money**? |

**Pitfall**: Scalability and elasticity are a pair easily swapped on the exam. If you see **"automatically," "according to demand," or "shrinks when not needed,"** it is elasticity. If it is just "can handle a larger scale," it is scalability. The decisive difference is that elasticity includes the **shrinking direction** too.

## Comprehensive Table: Exam Keyword → Answer Mapping

When you meet these expressions in a passage, immediately think of this direction.

| Passage keyword | Answer to think of |
|-------------|-----------|
| "without upfront investment," "without spending a large sum in advance" | Trade capital expense for variable expense |
| "it is hard to predict how much we'll need" | No need to guess capacity / elasticity |
| "unit prices are low thanks to AWS's massive purchasing power" | Economies of scale |
| "to users in other countries in minutes" | Go global in minutes / global reach |
| "removes the burden of power, cooling, and hardware replacement" | Lower data center operating costs |
| "service continues even if one AZ goes down" | Multi-AZ placement / reliability (high availability) |
| "deliver content from near the user" | Edge location / CloudFront |
| "data must not cross the border" | Region selection (compliance) |
| "whose responsibility is guest OS patching?" | Customer (for EC2) |
| "whose responsibility is data center physical security?" | AWS |
| "always the customer's responsibility regardless of service" | Data, IAM permissions |
| "least privilege, encryption, access control" | Security pillar |
| "automate repetitive tasks, monitoring, alerts" | Operational Excellence pillar |
| "reduce spending by turning off unused resources" | Cost Optimization pillar |
| "reduce carbon emissions and energy use" | Sustainability pillar |
| "organizational transition readiness, workforce skills, governance" | CAF |

## Decision Flows for When You Get Confused

In case your mind goes blank in the exam room, memorize three flows.

**Flow 1 — If it asks who is responsible**

```
What is the cause of the incident in the passage?
  ├ configuration, permissions, data, app code -> customer responsibility (IN the cloud)
  └ buildings, hardware, virtualization layer  -> AWS responsibility (OF the cloud)
        * If ambiguous: "Can the customer change it in the console?"
          If they can change it, it is the customer's responsibility.
```

**Flow 2 — If it asks which pillar**

```
What does the passage worry about most?
  ├ stopping                 -> Reliability
  ├ being breached           -> Security
  ├ being slow               -> Performance Efficiency
  ├ money                    -> Cost Optimization
  ├ too much manual effort   -> Operational Excellence
  └ environmental impact     -> Sustainability
```

**Flow 3 — If it asks about infrastructure concepts**

```
"Where do we put it"                 -> Region (latency, compliance, cost, service availability)
"To keep it from stopping"           -> spread across multiple AZs
"To deliver quickly"                 -> edge location
"Does it operate as one worldwide"   -> global service (IAM, Route 53, CloudFront)
```

Consider a passage: "A financial company that cannot keep data overseas because of domestic regulations wants to build a system where service interruption is not allowed." Taking the pieces apart one by one, the answer comes out by itself. **"Data cannot be kept overseas" → choose a domestic Region**, **"interruption is not allowed" → spread across multiple AZs within that Region**, and the pillar that this whole design asks about is **reliability**. Even if the passage is long, when split into pieces, each piece is one thing you learned this week.

## Self-Check List

If you can answer the following questions **without hesitation in your own words**, you have passed Week 1.

- [ ] Can you state the difference between the cloud and on-premises from a cost perspective in one sentence?
- [ ] Can you recall all six advantages of the cloud even without order?
- [ ] Can you distinguish public, private, and hybrid in one line each?
- [ ] Can you distinguish IaaS, PaaS, and SaaS with examples?
- [ ] Can you draw the containment relationship of Regions, AZs, data centers, and edge locations as a diagram?
- [ ] Can you name the four criteria for choosing a Region (latency, compliance, cost, service availability)?
- [ ] Can you name three global services?
- [ ] Can you explain "OF the cloud" and "IN the cloud" with examples?
- [ ] Can you state the two things that remain the customer's share regardless of which service you use?
- [ ] Can you name all six pillars and attach to each "what happens if you don't follow it"?
- [ ] Can you pinpoint the difference between scalability and elasticity in one word?
- [ ] Can you tell Well-Architected and CAF apart without confusing them?

## Patterns That Easily Lead to Wrong Answers

CLF-C02 is often decided by **avoiding traps** rather than by knowledge. The wrong-answer types that recur in this week's scope are as follows.

| Wrong-answer pattern | Why it is wrong |
|-----------|-----------|
| "The cloud is always cheaper" | The essence of the cloud is not cheapness but **usage-based billing** |
| "AWS is responsible for all of the customer's data security" | Data and permissions are **always** the customer's share |
| "A Region is inside an Availability Zone" | The containment is reversed. AZs are inside a Region |
| "Applications run at edge locations" | The edge's role is **delivery and caching** |
| "Compliance is one of the six pillars" | It is not a pillar. It is handled within the security pillar |
| "Scalability = automatically growing and shrinking" | That is **elasticity** |
| "Hybrid = using multiple public clouds together" | Hybrid is a **public + private/on-premises** connection |

**Pitfall**: Among the choices, those containing absolute expressions such as **"all," "always," "never," "unlimited," or "fully automatic"** are often wrong. Conversely, those with conditional expressions such as **"is suitable when ~" or "can reduce ~"** are often the correct answer. Of course there are exceptions where an absolute expression is the correct answer — as in "data is **always** the customer's responsibility." Use it not as a rule but as a **warning sign**.

## The Big Picture That Runs Through Week 1

This week's four pieces connect into one.

```
[What is it]       Cloud = rented computing + six advantages               (Day 1)
     ↓
[Where is it]      Global infrastructure laid out in Regions, AZs, edges    (Day 2)
     ↓
[Who is responsible] Shared responsibility model: AWS (OF) vs customer (IN) (Day 3)
     ↓
[How to do it well]  Good design through the Well-Architected six pillars   (Day 4)
```

In other words, once you know what the cloud is → draw the map of the infrastructure it is spread across → understand how responsibility is divided on top of it → and finally have the standard of "how to build well," the foundation of cloud concepts is complete. From next week, we will place actual AWS services on this foundation one by one.

Also look at how these four pieces support one another. **If you don't know the infrastructure (Day 2), you cannot understand reliability design (Day 4)**, and **if you don't know the responsibility boundary (Day 3), the security pillar (Day 4) becomes hollow.** Services like EC2 and S3 that you will learn next week also come back, in the end, to three questions: "which Region is this service in, how far is my responsibility, and which pillar does it satisfy?" That is why this week's material is not just one piece of the exam scope but **a lens for reading everything else**.

## 📖 Glossary

- **On-premises**: the traditional approach of buying servers yourself and running them in your own facility.
- **Region**: AWS's geographic footholds around the world. A grouping of multiple AZs.
- **Availability Zone (AZ)**: an independent facility unit within a Region. Made up of one or more data centers.
- **Edge location**: a point that caches and delivers content close to users.
- **High availability (HA)**: the property of making a service keep working even when failures occur.
- **Shared responsibility model**: the principle that AWS is responsible for security of the cloud **itself** (OF) and the customer for security **inside** the cloud (IN).
- **Elasticity / scalability**: **automatically** growing and shrinking to match demand / the ability itself to add resources.
- **Well-Architected / CAF**: reviewing system design through six **Pillars** / preparing an organizational transition through six **Perspectives**.

---

## 📝 Practice Questions

**Question 1.** Which of the following is the most appropriate definition of the cloud as learned in Week 1?

A) A model of directly owning and operating all resources inside the company  
B) A model of renting computing resources over the internet and paying according to usage  
C) A model that provides unlimited resources for free, forever  
D) A standalone system that operates without the internet  

**Answer: B**  
Explanation: The cloud is a model where resources are rented on demand over the internet and paid for according to usage. Owning them directly inside the company is on-premises; the cloud is neither free nor unlimited, and it is accessed via the internet.

---

**Question 2.** Which of the following correctly describes the structure of AWS global infrastructure?

A) Multiple Regions are contained within an Availability Zone  
B) A Region contains multiple Availability Zones, and an Availability Zone consists of one or more data centers  
C) Regions are contained within edge locations  
D) Multiple Regions exist within a data center  

**Answer: B**  
Explanation: A Region is a group of multiple Availability Zones, and each Availability Zone consists of one or more data centers. The other choices have the containment relationships reversed and are therefore wrong.

---

**Question 3.** In the Shared Responsibility Model, which area is always the customer's responsibility no matter which service is used?

A) Physical security of data centers  
B) Security of the virtualization layer  
C) Data and access permissions (IAM)  
D) Server hardware maintenance  

**Answer: C**  
Explanation: Data and who can access it (IAM) are always the customer's responsibility regardless of the type of service. Data center physical security, the virtualization layer, and hardware maintenance are all infrastructure areas AWS is responsible for.

---

**Question 4.** The activity of "protecting the system through least-privilege grants and data encryption" corresponds to which Well-Architected pillar?

A) Security  
B) Cost Optimization  
C) Performance Efficiency  
D) Sustainability  

**Answer: A**  
Explanation: Protecting systems and data through least privilege and data encryption is the core of the Security pillar. Cost Optimization is about reducing spend, Performance Efficiency is about the efficient use of resources, and Sustainability is about reducing environmental impact.

---

**Question 5.** Which of the following is NOT one of the six advantages of the cloud?

A) Trade capital expense for variable expense  
B) No need to guess capacity in advance  
C) Permanent free storage of all data  
D) Go global in minutes  

**Answer: C**  
Explanation: The six advantages are trading capital expense for variable expense, economies of scale, no capacity guessing, speed and agility, lower operating costs, and global deployment. "Permanent free storage of all data" is not a real item — the cloud incurs costs based on usage.

---
