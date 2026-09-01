# Day 2 - AWS Global Infrastructure

Yesterday we learned that the cloud is "computing resources rented over the internet." But those resources are real servers sitting in a building somewhere. Today we look at how AWS lays out that infrastructure across the world — **Regions, Availability Zones (AZs), and edge locations** — and clarify how "global services" differ from "regional services." Once you have this map in your head, every service you learn afterward makes far more sense.

## Regions: Footholds Around the World

A Region is **a geographic area where AWS clusters its data centers**. They exist in many places around the world, such as Seoul, Tokyo, Northern Virginia, and Frankfurt. When you build a service, you choose which Region to place it in.

When choosing a Region, you typically weigh these four factors.

| Factor | Meaning |
|-----------|------|
| Latency (distance) | The closer the Region is to your users, the faster the response |
| Compliance | Meeting legal requirements such as "data must stay in the country" |
| Service availability | Not every service is available in every Region |
| Cost | The same service can be priced differently per Region |

> 💡 **Related theory**: Regions operate completely independently of one another. They are isolated so that a problem in one Region does not affect the others. That's why, if you spread a critical service across multiple Regions, it can keep running from another region even if an entire area goes down. This is the basic idea behind disaster recovery (DR) design.

## Availability Zones (AZs): Independent Groupings Within a Region

A single Region is further divided into multiple **Availability Zones (AZs)**. Each AZ is **a facility made up of one or more physical data centers, with independent power, cooling, and networking**. Every AWS Region typically has **three or more AZs**.

Why divide things this way? So that even if one data center suffers a power outage or fire, the other AZs remain intact — in other words, they are physically separated so that **failures don't spread**. At the same time, AZs are connected to each other by fast dedicated networks, so they can exchange data almost in real time.

```
        [ Region: Seoul (ap-northeast-2) ]
                     |
      +--------+--------+--------+--------+
      |        |        |        |
    AZ-a     AZ-b     AZ-c     AZ-d   ← each AZ has independent power and networking
      |        |        |        |
   Data center  Data center  Data center  Data center
```

The key takeaway is simple. **Instead of placing your service in only one AZ, spread it across two or more AZs** — then even if an entire AZ goes down, your service survives. This is called "high availability (HA) design."

> 💡 **Related theory**: An exam point to remember: "a Region ≠ a single data center" and "an AZ ≠ a single data center." A Region is a group of multiple AZs, and an AZ is a group of one or more data centers. In other words, remember the three-tier structure: Region > AZ > data center.

## Edge Locations: Closer to the User

Edge locations far outnumber Regions and AZs, and they are scattered in places closer to users as **content-delivery footholds**. There are hundreds of them worldwide.

Their flagship use is **CloudFront (a content delivery network, CDN)**. For example, when a user in Korea views an image hosted on a server in the U.S., fetching it from the U.S. every time is slow. Instead, if that image is pre-copied (cached) to an edge location near Korea, the user receives it quickly from a nearby site. Beyond that, services such as Route 53 (DNS) also operate at the edge.

> 💡 **Related theory**: Remember the difference in roles: Regions and AZs are "where data and compute live," while edge locations are "where content is delivered quickly to users." Caching content at the edge not only speeds up responses but also reduces load on the origin server.

## Global Services vs. Regional Services

AWS services fall into two broad categories. This distinction appears frequently on the exam.

| Category | Meaning | Examples |
|------|------|------|
| **Regional services** | Tied to a specific Region; you pick a Region and use them there | EC2 (virtual servers), RDS (databases), S3, and most other services |
| **Global services** | Operate as a single worldwide entity, independent of Regions | IAM (users and permissions), Route 53 (DNS), CloudFront (CDN) |

Put simply, most services are **regional services** where you must choose "which Region to put them in." In contrast, things that inherently need to operate across the entire world — such as IAM (account and permission management), Route 53 (domain DNS), and CloudFront (edge caching) — are **global services**.

> 💡 **Related theory**: S3 is an easy one to get confused about. An S3 **bucket name** must be unique worldwide (a global namespace), but the actual **data is stored in a specific Region**. In other words, the name is global, but the data is regional. Be sure to distinguish this: "just because bucket names are global does not mean the data is replicated worldwide."

## Wrapping Up

Today we drew the map of AWS infrastructure. We covered the three-tier structure of **Region (worldwide foothold) > Availability Zone (independent facility within a Region) > data center**, the **edge locations** that deliver content quickly to users, and the distinction that while most services are regional, some — such as IAM, Route 53, and CloudFront — are **global services**. In the next article, we look at the **Shared Responsibility Model**, which defines whether AWS or the customer is responsible for security and operations on top of this infrastructure.

---

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
