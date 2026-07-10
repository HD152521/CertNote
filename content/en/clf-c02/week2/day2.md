# Day 2 - Storage Overview: S3 (Object), EBS (Block), EFS/FSx (File)

If compute yesterday was where data gets "processed," today is the story of "where you put it." AWS storage looks like it has a lot of varieties, but there are really only three ways to hold data — Object, Block, and File. These three map to S3, EBS, and EFS/FSx, respectively. The CLF-C02 exam asks, again and again, "which data goes in which storage."

Today we'll lay out how the three storage approaches differ, and how S3's storage classes are divided by "how often you pull the data out."

## Three Ways to Store: Object, Block, File

First, the big picture. There are three ways to hold data.

| Approach | Analogy | AWS service | Access method |
|------|------|-----------|----------|
| Object | A giant locker room, each item labeled | S3 | HTTP API (look up by key) |
| Block | A hard disk you attach to a computer | EBS | Mount to a server |
| File | A shared folder (network drive) | EFS, FSx | Multiple servers mount it simultaneously |

The key difference is **"what it attaches to, and who accesses it."** Block (EBS) is a disk attached to a single EC2, File (EFS) is a folder shared simultaneously by multiple EC2s, and Object (S3) is a locker you pull from anywhere on the internet by key (name).

> 💡 **Related theory**: What sets "object storage" apart from a traditional file system is that it has no folder hierarchy. S3 in fact has no folders — every object is stored in a flat space by a key (a unique name). Even something that looks like a path such as `photos/2026/img.jpg` is not actually a folder but merely part of the key name.

## S3: Effectively Unlimited Object Storage

S3 (Simple Storage Service) is the most widely used storage in AWS. Photos, videos, backups, logs, static website files — anything — is stored as **objects**. Objects go into containers called **buckets**.

S3's characteristics:

- **Effectively unlimited capacity**: You don't have to size it in advance. It grows as much as you put in.
- **High durability**: It targets 11 9s (99.999999999%) of durability, automatically replicating data across multiple locations.
- **Internet access**: Each object can be accessed by a unique URL (subject to permission settings).
- **No server needed**: It exists on its own without EC2 (serverless storage).

> 💡 **Related theory**: "Durability" and "Availability" are different concepts. Durability is "the probability you won't lose the data," and availability is "the probability you can access it right now." S3 boasts 11 9s of durability because it automatically replicates data across multiple Availability Zones (AZs).

> 📚 **Case study**: You can upload a static website (HTML, CSS, images) to an S3 bucket and host it right from there. You're running a website without launching a single server. Even as traffic grows, S3 handles it for you, so there's no scaling worry.

## EBS: Block Storage You Attach to EC2

EBS (Elastic Block Store) is **a hard disk you attach to an EC2 instance**. It's the same concept as plugging an SSD into a physical computer. You use it to install the OS, hold database files, or anywhere you need fast reads and writes.

EBS's key characteristics:

- **Attached to one instance**: By default, an EBS volume attaches to a single EC2 in the same Availability Zone (AZ).
- **Lifecycle can be decoupled**: You can keep the EBS volume even after terminating the EC2, so the data is preserved.
- **Snapshot backups**: You can back up a point-in-time volume to S3 as a snapshot.

> ⚠️ **Pitfall**: An EBS volume is tied to a specific Availability Zone (AZ). So you can't attach it as-is to an EC2 in a different AZ. To cross AZs, you take a snapshot and restore it as a new volume in the other AZ. This "AZ dependency" comes up on the exam fairly often.

## EFS and FSx: File Storage Shared by Multiple Servers

If EBS is a disk attached to one machine, **EFS (Elastic File System)** is a shared folder that multiple EC2s use together at the same time. Think of a network drive. You use it when multiple servers need to read and write the same files.

| Service | Use |
|--------|------|
| EFS | A file system shared by multiple Linux-based EC2s, auto-scaling |
| FSx for Windows | Shared files for Windows environments (SMB protocol) |
| FSx for Lustre | Ultra-fast file system for high-performance computing (HPC) and machine learning |

EFS differs from EBS in that it grows automatically as you add files, with no need to size capacity in advance, and it can be accessed across multiple AZs.

> 💡 **Related theory**: The decisive difference between EBS and EFS is "concurrent access." EBS is usually a disk dedicated to one EC2 (1:1), while EFS is a shared folder that multiple EC2s mount simultaneously (1:many). When the keyword "multiple servers must share the same files" shows up, it's EFS; when it's "one server's OS/DB disk," it's EBS.

## S3 Storage Classes: How Often You Pull the Data Out

Even within S3, you can choose a **storage class** with a different price depending on "how often you access" the data. The less frequently you'll pull data out, the cheaper the storage fee — but retrieval takes time or incurs extra cost.

| Class | Access frequency | Characteristics |
|--------|----------|------|
| S3 Standard | Frequent | Default, instant access, highest storage fee |
| S3 Standard-IA | Occasional | Cheaper storage, extra charge on retrieval |
| S3 One Zone-IA | Occasional | Stored in a single AZ, cheaper (slightly lower durability) |
| S3 Glacier Instant Retrieval | Rare | Archive, instant retrieval |
| S3 Glacier Flexible Retrieval | Rare | Archive, retrieval in minutes to hours |
| S3 Glacier Deep Archive | Almost never | Cheapest, retrieval takes several hours |
| S3 Intelligent-Tiering | Unknown | AWS moves it automatically based on access patterns |

> 💡 **Related theory**: The principle behind choosing a storage class is "trading storage fee against retrieval cost." Pull it out often and Standard is cheaper; barely pull it out and Glacier Deep Archive is cheaper. If you don't know the access pattern, Intelligent-Tiering moves it for you. And what automates this movement is a **Lifecycle Policy** — e.g., "objects older than 90 days go to Glacier, and after 1 year they're deleted."

> 🎯 **Scenario**: Where do you put "audit logs you must retain for 7 years due to a legal obligation but almost never need to pull out"? → S3 Glacier Deep Archive. Its storage fee is the cheapest, and even though retrieval takes several hours, that fits the "almost never retrieved" condition, so it's cost-optimal.

## Wrapping Up

Today's core has three strands. First, there are only three storage approaches — **Object (S3), Block (EBS), File (EFS/FSx)** — and you can remember them as "locker, attached disk, shared folder." Second, the criteria that separate EBS from EFS are that EBS is dedicated to one EC2 + AZ-bound, while EFS is shared by multiple EC2s. Third, S3 storage classes are a menu that trades storage fee against retrieval cost based on "how often you pull the data out," and when in doubt use Intelligent-Tiering, with a Lifecycle Policy for automation.

Tomorrow we move to the neighborhood where these servers and storage live together — the basics of VPC and networking.

---

## 📝 연습 문제

**문제 1.** You have a Linux-based workload where multiple EC2 instances must simultaneously access, read, and write the same files. Which storage is the best fit?

A) EBS  
B) EFS  
C) S3 Glacier Deep Archive  
D) Instance Store  

**정답: B**  
해설: EFS is a file system that multiple EC2s can mount and share simultaneously, precisely matching the condition "multiple servers share the same files." EBS is by default a disk dedicated to one instance, and Glacier is for archives that aren't accessed often, unrelated to concurrent file sharing.

---

**문제 2.** You want to store large-volume audit logs that a legal obligation requires you to keep for 7 years but that you almost never need to retrieve, as cheaply as possible. Which S3 storage class fits?

A) S3 Standard  
B) S3 Standard-IA  
C) S3 Glacier Deep Archive  
D) S3 Intelligent-Tiering  

**정답: C**  
해설: Glacier Deep Archive is the cheapest storage class in S3; retrieval takes several hours, but for "long-term retention that is almost never accessed" it's the most cost-effective. Standard is for frequently accessed data, so it's expensive; Standard-IA is for occasional access; and Intelligent-Tiering is the auto-tiering option for when you don't know the access pattern.

---

**문제 3.** Which most accurately captures what S3's "durability of 11 9s (99.999999999%)" means?

A) The probability you can always access the data instantly  
B) The probability you won't lose the stored data  
C) Data transfer speed  
D) The proportion of a month with no downtime  

**정답: B**  
해설: Durability means "the probability you won't lose the data," and S3 achieves this target by automatically replicating data across multiple Availability Zones. Accessibility is a separate concept called availability, so A and D are not the definition of durability, and it has nothing to do with transfer speed (C).

---

**문제 4.** Which statement about EBS volumes is correct?

A) It can be freely attached simultaneously to EC2s across multiple Availability Zones (AZs)  
B) It is tied to a specific Availability Zone (AZ) and attaches to EC2s in that AZ  
C) It is object storage accessed directly over HTTP without a server  
D) Its capacity can't be sized in advance and it auto-scales infinitely  

**정답: B**  
해설: An EBS volume is bound to a specific AZ and attaches to EC2s in the same AZ; to move it to another AZ you take a snapshot and restore it. A, "freely attached simultaneously across multiple AZs," is wrong; object storage accessed over HTTP is a characteristic of S3 (C); and infinite auto-scaling is a characteristic of S3/EFS, not EBS.

---

**문제 5.** In S3, when an object's access frequency drops over time, which mechanism automatically moves it to a cheaper storage class to save cost?

A) Lifecycle Policy  
B) Security Group  
C) EBS Snapshot  
D) Reserved Instance  

**정답: A**  
해설: A Lifecycle Policy automatically moves objects to a cheaper class or deletes them based on rules like "after N days move to a certain class, and after N more days delete." A Security Group controls network traffic, an EBS Snapshot is a block-volume backup, and a Reserved Instance is an EC2 purchase option — all unrelated.

---
