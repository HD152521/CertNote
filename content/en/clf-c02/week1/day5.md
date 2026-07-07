# Day 5 - Week 1 Wrap-Up: Cloud Concepts Review

This week we built up the most fundamental layer of the AWS certification: **cloud concepts**, step by step. We learned what the cloud is (Day 1), where it's laid out (Day 2), how security responsibility is divided (Day 3), and what the standard for good design is (Day 4). Today we fit all these pieces back into one big picture so they settle firmly in your mind.

## Week 1 on One Page

| Day | Topic | The one line to remember |
|-----|------|----------------|
| 1 | What is cloud computing | Rent resources over the internet and pay for what you use + the six advantages |
| 2 | AWS global infrastructure | Region > Availability Zone > data center, edge locations, global/regional services |
| 3 | Shared Responsibility Model | AWS handles "OF the cloud," the customer handles "IN the cloud" |
| 4 | The six Well-Architected pillars | O-S-R-P-C-S + the value of cloud adoption |

## Day 1 Revisited: The Cloud and the Six Advantages

Cloud computing is **a model where you rent computing resources over the internet when you need them and pay only for what you use**. You rent servers the way you draw electricity from an outlet.

Let's memorize the **six advantages** AWS emphasizes once more.

1. Trade capital expense for variable expense (pay as you go instead of investing up front)
2. Massive economies of scale (unit costs drop thanks to many customers)
3. Stop guessing capacity (adjust to demand)
4. Increase speed and agility (provision resources in minutes)
5. Stop spending on data center operations (no more power, cooling, or hardware burden)
6. Go global in minutes

> 💡 **Related theory**: Underlying the six advantages is "elasticity (automatically growing and shrinking with demand)." In particular, ③ no capacity guessing and ④ speed and agility are possible because of elasticity.

## Day 2 Revisited: Global Infrastructure

AWS infrastructure has a three-tier structure.

```
Region                ← geographic footholds around the world (Seoul, Tokyo, etc.)
  └ Availability Zone (AZ)  ← independent facilities within a Region (usually 3 or more)
      └ Data center    ← the physical buildings that make up an AZ
```

On top of this come **edge locations** (caching and delivering content close to users; CloudFront, etc.).

Services fall into two kinds.

- **Regional services** (most): EC2, RDS, S3, etc. — pick a Region and use them there
- **Global services** (a few): IAM, Route 53, CloudFront — operate as a single worldwide entity

> 💡 **Related theory**: The basic move in high-availability design is "distribute across two or more AZs." Even if an entire AZ goes down, the service survives in another AZ.

## Day 3 Revisited: The Shared Responsibility Model

The one core sentence: **AWS is responsible for security "OF the cloud"; the customer is responsible for security "IN the cloud."**

| AWS responsibility | Customer responsibility |
|----------|-----------|
| Data centers, hardware | Data, data encryption |
| Virtualization (hypervisor) | IAM users and permissions |
| Global network infrastructure | Guest OS patching (EC2), firewall configuration, app security |

And **the boundary moves depending on the service**. Moving from EC2 → RDS → Lambda (more managed) reduces customer responsibility, but **data and IAM permissions are always the customer's job**.

> 💡 **Related theory**: "The higher the level of abstraction, the narrower the customer's responsibility becomes." But data and permissions never shrink at any level — these two sentences are the master key to Shared Responsibility Model questions.

## Day 4 Revisited: The Six Well-Architected Pillars

The six pillars of good cloud design — **O-S-R-P-C-S**.

1. **O**perational Excellence — automation, monitoring, improvement
2. **S**ecurity — least privilege, encryption
3. **R**eliability — multi-AZ, automatic recovery, backups
4. **P**erformance Efficiency — right-sized resources, efficiency
5. **C**ost Optimization — eliminate waste, usage-based
6. **S**ustainability (added 2021) — reduce environmental impact

When solving questions, first pin down "which pillar is this scenario asking about?" and the answer becomes visible.

## The Big Picture Running Through Week 1

This week's four pieces connect into one.

```
[What]      Cloud = rented computing + six advantages          (Day 1)
     ↓
[Where]     Global infrastructure spread across Regions, AZs, and edge  (Day 2)
     ↓
[Who's responsible]  AWS (OF) vs. customer (IN) — the Shared Responsibility Model  (Day 3)
     ↓
[How to do it well]  Good design via the six Well-Architected pillars  (Day 4)
```

That is: know what the cloud is → draw the map of the infrastructure it runs on → understand how responsibility is divided on top of it → and finally acquire the "standard for building it well" — then the foundation of cloud concepts is complete. Starting next week, we place actual AWS services one by one on top of this foundation.

---

## 📝 연습 문제

**문제 1.** Which of the following is the most appropriate definition of the cloud as learned in Week 1?

A) A model of directly owning and operating all resources inside the company  
B) A model of renting computing resources over the internet and paying according to usage  
C) A model that provides unlimited resources for free, forever  
D) A standalone system that operates without the internet  

**정답: B**  
해설: The cloud is a model where resources are rented on demand over the internet and paid for according to usage. Owning them directly inside the company is on-premises; the cloud is neither free nor unlimited, and it is accessed via the internet.

---

**문제 2.** Which of the following correctly describes the structure of AWS global infrastructure?

A) Multiple Regions are contained within an Availability Zone  
B) A Region contains multiple Availability Zones, and an Availability Zone consists of one or more data centers  
C) Regions are contained within edge locations  
D) Multiple Regions exist within a data center  

**정답: B**  
해설: A Region is a group of multiple Availability Zones, and each Availability Zone consists of one or more data centers. The other choices have the containment relationships reversed and are therefore wrong.

---

**문제 3.** In the Shared Responsibility Model, which area is always the customer's responsibility no matter which service is used?

A) Physical security of data centers  
B) Security of the virtualization layer  
C) Data and access permissions (IAM)  
D) Server hardware maintenance  

**정답: C**  
해설: Data and who can access it (IAM) are always the customer's responsibility regardless of the type of service. Data center physical security, the virtualization layer, and hardware maintenance are all infrastructure areas AWS is responsible for.

---

**문제 4.** The activity of "protecting the system through least-privilege grants and data encryption" corresponds to which Well-Architected pillar?

A) Security  
B) Cost Optimization  
C) Performance Efficiency  
D) Sustainability  

**정답: A**  
해설: Protecting systems and data through least privilege and data encryption is the core of the Security pillar. Cost Optimization is about reducing spend, Performance Efficiency is about the efficient use of resources, and Sustainability is about reducing environmental impact.

---

**문제 5.** Which of the following is NOT one of the six advantages of the cloud?

A) Trade capital expense for variable expense  
B) No need to guess capacity in advance  
C) Permanent free storage of all data  
D) Go global in minutes  

**정답: C**  
해설: The six advantages are trading capital expense for variable expense, economies of scale, no capacity guessing, speed and agility, lower operating costs, and global deployment. "Permanent free storage of all data" is not a real item — the cloud incurs costs based on usage.

---
