# Day 2 - Storage Overview: S3 (Object), EBS (Block), EFS·FSx (File)

If yesterday compute was where data gets "processed," today is about "where you put" that data. AWS storage looks like it comes in many kinds, but there are really only three ways of holding data: object, block, and file. These three lead to S3, EBS, and EFS/FSx respectively. The CLF-C02 exam repeatedly asks "which data goes on which storage."

Today we lay out how the three storage methods differ, and how S3's storage classes divide according to "how often you take the data out."

## What It Was Like Before Cloud Storage

Today "where to put the file" is a question of choosing a service, but before the cloud this was **a question of buying hardware**.

Suppose you are building a photo-sharing service. As users grow, photos grow, and as photos grow, disk runs short. So the company estimated in advance the capacity it would need six months out and bought disks ahead of time. Buy too little and one day it fills up and the service stops until new equipment arrives; buy too much and money is tied up for years in disks you are not using. On top of that, disks eventually fail, so you needed two or three copies of the same data and people to manage them.

What cloud storage changed is this whole structure. **You do not decide capacity in advance, you pay only for what you put in, and AWS handles replication for you.**

The name of this change is **elasticity**. In storage, elasticity means "you don't have to do capacity planning," and it is an item CLF-C02 repeatedly asks about as a benefit of the cloud.

## Three Ways to Store: Object · Block · File

First the big picture. The ways of holding data divide into three.

| Method | Analogy | AWS service | Access method |
|------|------|-----------|----------|
| Object | A giant locker room, each item labeled | S3 | HTTP API (look up by key) |
| Block | A hard disk attached to a computer | EBS | Mounted to a server |
| File | A shared folder (network drive) | EFS, FSx | Mounted by many servers at once |

The key difference is **"what it attaches to, and who accesses it."** Block (EBS) is a disk attached to one EC2 instance, file (EFS) is a folder shared by many EC2 instances at once, and object (S3) is a locker you retrieve from anywhere on the internet by key (name).

What makes "object storage" different from a traditional file system is that it has no folder hierarchy. S3 actually has no folders, and every object is stored in a flat space under a key (a unique name). What looks like a path such as `photos/2026/img.jpg` is not really a folder but just part of the key name.

### The Three Methods Again Through Everyday Analogies

**Object (S3) = an unmanned storage locker.** When you leave your belongings, you get a number tag. You do not need to know which shelf in the warehouse it was put on; with the number tag (key) alone you take it out whole. In exchange, "shorten just the shirt sleeve by 3 cm inside the bag" is not possible: you have to take it out, alter it, and deposit the whole thing again.

**Block (EBS) = the drawers at my desk.** It is attached to my seat and only I use it, but swapping out a single sheet of paper inside the drawer is also free. EBS likewise attaches to one EC2 instance, looks like a local disk, and lets you rewrite just part of a file quickly. That is why the OS and databases live here.

**File (EFS) = the shared cabinet in an office.** Many people open the same cabinet and take out the same folders, and when documents grow, the shelves grow automatically.

| Question | Object (S3) | Block (EBS) | File (EFS·FSx) |
|------|---------|-----------|--------------|
| Who accesses it | From anywhere on the internet | One EC2 instance | Many EC2 instances at once |
| Can you modify just part of it | Replace the whole thing | Yes | Yes |
| Capacity planning | Not needed | Specify the volume size | Not needed (auto-scaling) |
| Typical use | Photos, backups, logs | OS disk, DB data | Shared content |

> ⚠️ **Pitfall**: "Can't I just put the database on S3?" is a common misunderstanding. A database rewrites tiny parts of a file thousands of times per second, and object storage, which uploads and downloads whole objects, does not fit. **DB data goes on EBS (or a managed DB service); photos, backups, and logs go on S3.** An option that flips this pairing is wrong.

## S3: Effectively Unlimited Object Storage

S3 (Simple Storage Service) is the most widely used storage in AWS. It stores anything, such as photos, videos, backups, logs, and static website files, in units of **objects**. Objects are held in containers called **buckets**.

S3's characteristics:

- **Effectively unlimited capacity**: You do not need to set capacity in advance. It grows as much as you put in.
- **High durability**: Aiming for a durability of 11 9s (99.999999999%), it automatically replicates data to multiple places.
- **Internet access**: Each object can be accessed through its own URL (depending on permission settings).
- **No server needed**: It exists on its own, without EC2 (serverless storage).

"Durability" and "availability" are different concepts. Durability is "the probability of not losing the data," and availability is "the probability of being able to access it right now." S3 boasts durability of 11 9s, which is because it automatically replicates data across multiple Availability Zones (AZs).

You can upload a static website (HTML, CSS, images) to an S3 bucket and host it from there. You run a website without starting a single server. Even when traffic grows, S3 handles it on its own, so there is no scaling worry.

### Bucket · Key · Object: The Three Words of S3

When you first meet S3, you only need to sort out three words.

| Term | Meaning | Analogy |
|------|------|------|
| Bucket | The top-level container that holds objects | The storage locker building |
| Key | The unique name that points to an object within a bucket | The number tag |
| Object | The actual data + metadata | The belongings you left |

Taking `s3://my-company-photos/2026/07/seoul.jpg` apart, `my-company-photos` is the bucket, `2026/07/seoul.jpg` is the key, and the image file the key points to is the object. `2026/07/` is not a folder but just **slash characters contained in the key name**; it looks like a folder only to human eyes because the console displays it that way.

Bucket names have one unusual rule. **A bucket name must be globally unique.** If someone has already created a bucket named `photos`, I cannot use that name. That is why in practice names are made long, like `acme-invoice-prod-ap-northeast-2`.

### What S3 Is Actually Used For

"It stores anything" is vague, so here are four representative scenes where companies use S3.

- **Backup and archive**: Dump the database every night and upload it, and automatically move old backups down to cheaper classes.
- **Static website and image hosting**: A home for files that are "uploaded once and only read by many," such as an introduction page, profile photos, and product images. Put CloudFront (covered tomorrow) in front to distribute them worldwide.
- **Log collection point**: Even with 100 servers, the logs' final destination is a single bucket.
- **Data lake**: Accumulate raw data from many systems regardless of format, and analysis tools read it later. Near-unlimited capacity and cheap storage fees made this possible.

If you turn on **versioning**, even when you overwrite the same key with a new file, the previous version is kept too, so you can roll back if you overwrite or delete by mistake. Remember it as "versioning = a safety net for recovering from mistakes."

> ⚠️ **Pitfall**: An S3 bucket is private by default. A statement that "since I uploaded to S3, it is automatically public on the internet" is wrong. In fact, because accidents where a public setting is opened wrongly and sensitive files are exposed are frequent, AWS turns **Block Public Access** on by default.

## EBS: Block Storage Attached to EC2

EBS (Elastic Block Store) is **a hard disk you attach to an EC2 instance**. It is the same idea as plugging an SSD into a physical computer. You use it where you install the OS, keep database files, or need fast reads and writes.

EBS's key characteristics:

- **Attached to one instance**: By default one EBS volume attaches to one EC2 instance in the same Availability Zone (AZ).
- **Lifecycle can be separated**: Even if you terminate the EC2 instance, you can keep the EBS volume, so the data is preserved.
- **Snapshot backups**: You can back up a volume at a point in time to S3 as a snapshot.

**Pitfall**: An EBS volume is tied to a specific Availability Zone (AZ). So you cannot attach it as is to an EC2 instance in another AZ. To cross AZs, you take a snapshot and restore it as a new volume in the other AZ. This "AZ dependency" often appears on the exam.

### Snapshots: A Photo of a Volume

A **snapshot** is a backup that copies an EBS volume's state at a point in time to S3, close to "taking a photo of the disk at this moment." It has two uses. **Recovery**: when a volume is broken or data is deleted by mistake, you go back to a new volume. **Moving**: unlike a volume, a snapshot is not tied to an AZ, so restoring it in another AZ or Region effectively "relocates" it.

In other words, the key that unlocks EBS's AZ dependency is the snapshot. The answer to "How do you move an EBS volume to another AZ/Region?" is almost always a snapshot.

### Instance Store: A Disk That Is Attached but Disappears

EBS is not the only disk that attaches to EC2. **Instance store** is a disk attached directly to the physical server on which EC2 actually runs. Because it is physically attached it is extremely fast, but it has one decisive property: **when you stop or terminate the instance, the data disappears** (volatile).

| Category | EBS | Instance store |
|------|-----|----------------|
| Location | Separate storage connected over the network | Attached directly to the host physical server |
| When the instance terminates | Data can be retained | Data is lost |
| Suited data | The OS, DBs, everything that must be kept | Temporary cache, intermediate computation results |

**Pitfall**: You must not choose instance store just because the condition says "a fast disk is needed." If the question contains the phrase **"the data must be preserved permanently,"** the answer is EBS.

## EFS and FSx: File Storage Shared by Many Servers

If EBS is a disk attached to one instance, **EFS (Elastic File System)** is a shared folder that many EC2 instances use together at the same time. Think of a network drive. You use it when many servers must read and write the same files.

| Service | Use |
|--------|------|
| EFS | A file system shared by many Linux-based EC2 instances, auto-scaling |
| FSx for Windows | Shared files for Windows environments (SMB protocol) |
| FSx for Lustre | An ultra-fast file system for high-performance computing (HPC) and machine learning |

EFS differs from EBS in that you do not need to set capacity in advance, it grows automatically as much as you put in files, and it can be accessed across multiple AZs.

The decisive difference between EBS and EFS is "simultaneous access." EBS is usually a disk dedicated to one EC2 instance (1:1), and EFS is a shared folder mounted by many EC2 instances at once (1:many). When the keyword "many servers must share the same files" appears, it is EFS; if it is "one server's OS or DB disk," it is EBS.

Suppose you run an internal content management system (CMS) with 5 web servers. No matter which server an editor connects to, they must see the same attachment list. If you attach EBS separately to each server the files diverge, but if all 5 mount EFS together, wherever you upload, it is reflected in one shared folder. On the other hand, each server's OS disk must be separate, so that is EBS. **It is actually natural for one server to use EBS and EFS at the same time.**

FSx is "a service where AWS operates a specialized file system for you when you need one." When moving a long-used Windows shared drive as it is, use FSx for Windows File Server; for high-performance computing (HPC), where hundreds of machines read the same data at very high speed, such as genome analysis, use FSx for Lustre. For the exam, **"Windows, SMB" → FSx for Windows, "HPC, machine learning training" → FSx for Lustre** is enough.

## Services for Moving Data to AWS

So far it was "where in AWS do we put the data." But the first hurdle in practice is often **"how do we move the data that is already on the company's servers."**

| Service | Problem it solves |
|--------|----------|
| AWS Storage Gateway | A bridge that on-premises servers use like a local disk while the data is actually stored in AWS |
| AWS Snowball | When the data is too large for internet transfer to be realistic, load it onto a physical device and ship it |
| AWS DataSync | Bulk transfer and synchronization of on-premises files to AWS |

A broadcaster wants to move decades of video archives, and sending them over the line would take months. If it receives a Snowball device, fills it with data, and ships it back, physically carrying it is actually faster. **"Too large to send over the internet"** is Snowball's exam keyword.

## S3 Storage Classes: How Often Do You Take It Out

Within S3, you can choose **storage classes** priced differently according to "how often you access the data." The less often you will take the data out, the cheaper the storage fee, but taking it out costs time or extra fees.

| Class | Access frequency | Characteristics |
|--------|----------|------|
| S3 Standard | Frequent | Default, immediate access, highest storage fee |
| S3 Standard-IA | Occasional | Cheaper storage, extra charge when retrieving |
| S3 One Zone-IA | Occasional | Stored in a single AZ, cheaper (slightly lower durability) |
| S3 Glacier Instant Retrieval | Rare | Archive, retrieved instantly |
| S3 Glacier Flexible Retrieval | Rare | Archive, retrieved in minutes to hours |
| S3 Glacier Deep Archive | Almost never | Cheapest, takes hours to retrieve |
| S3 Intelligent-Tiering | Unknown | AWS moves it automatically based on access pattern |

The principle of choosing a storage class is "trading storage fees against retrieval fees." If you retrieve often, Standard; if you almost never retrieve, Glacier Deep Archive is cheaper. If you do not know the access pattern, Intelligent-Tiering moves it for you. And what automates this movement is the **lifecycle policy**: for example, "objects older than 90 days go to Glacier, and after 1 year they are deleted."

> 🎯 **Scenario**: Where should you put "audit logs that must be kept for 7 years under a legal retention obligation but will almost never be looked at"? → S3 Glacier Deep Archive. The storage fee is the cheapest, and even if retrieval takes hours, it meets the "almost never retrieved" condition, so it is cost-optimal.

### Two Questions for Choosing a Class

With seven rows in the table, trying to memorize it is daunting. Instead, if you narrow it with two questions, **"how often do you retrieve it"** and **"how fast do you need it when you retrieve it,"** the answer almost always falls to one.

```
  Retrieve often?              → Standard        | Rare but needed instantly → Glacier Instant
  Occasionally (1-2x a month)? → Standard-IA     | Fine to wait hours → Glacier Flexible
  A copy, one AZ is enough     → One Zone-IA     | Almost never, lowest price → Deep Archive
  Don't know the access pattern → Intelligent-Tiering
```

Let us pin down **the problem Intelligent-Tiering solves**. The questions above rest on the premise that "I know how often it is retrieved." But among files users upload, some are opened every day and some are seen once and forgotten. A person cannot classify these. Intelligent-Tiering has **AWS observe each object's access pattern and move the tier automatically.** When you see the phrase "the access pattern is unpredictable," this is the answer.

A **lifecycle policy**, by contrast, is automation for "when the rules are clear." For data whose pattern is obvious, like logs, you set a rule such as `Standard-IA after 30 days, Glacier after 90 days, delete after 1 year`.

The two are not competitors but **options divided by "do you know the pattern."** If the pattern is obvious, nail it down with a lifecycle policy; if you don't know it, leave it to Intelligent-Tiering. The purpose is one: make cost fall on its own without anyone touching it.

**Pitfall**: The "One Zone" in **One Zone-IA** means the copy exists in only one Availability Zone (AZ). It is cheaper, but if that AZ is damaged you lose the data. It is fine for thumbnails you can recreate, but **you must not use it for "the only original."**

## How This Shows Up on the Exam: Keyword → Answer Mapping

Most storage questions take the form "scenario description → pick the right service." Make sure the answer comes to mind reflexively when you see the keywords below.

| Phrase in the question | Answer candidate |
|-------------------|----------|
| Many EC2 instances share the same files at once | EFS |
| One EC2 instance's OS or database disk | EBS |
| Data must remain even if the instance is terminated | EBS (not instance store) |
| Moving an EBS volume to another AZ or Region | Snapshot |
| Large-scale storage of photos, backups, logs; static website hosting | S3 |
| Accumulating raw data in any format, to analyze later | S3 (data lake) |
| Long-term retention almost never retrieved, lowest cost | S3 Glacier Deep Archive |
| Retrieved occasionally but needed instantly when so | S3 Standard-IA |
| An archive but needing instant lookup | S3 Glacier Instant Retrieval |
| Access pattern cannot be predicted | S3 Intelligent-Tiering |
| A recreatable copy, minimize cost | S3 One Zone-IA |
| Automatically move to cheaper classes as time passes | Lifecycle policy |
| Recover objects overwritten or deleted by mistake | Versioning |
| Bring a Windows file share (SMB) to the cloud as is | FSx for Windows File Server |
| Ultra-fast file system for HPC and machine learning | FSx for Lustre |
| Connect on-premises and cloud storage | Storage Gateway |
| Data so large that internet transfer is unrealistic | Snowball |

**Pitfall**: Always check whether the modifier **"most cost-effective"** is attached to the option. Even in the same situation, if performance is the top priority the answer is Standard, and if cost is the top priority a lower tier becomes the answer. The habit of first finding what the question demands you optimize greatly raises your accuracy.

## Wrapping Up

Today's key points are three-pronged. First, there are only three storage methods, **object (S3), block (EBS), and file (EFS·FSx)**, each remembered as "locker, attached disk, shared folder." Second, EBS being dedicated to one EC2 instance plus AZ-bound and EFS being shared by many EC2 instances is the criterion that separates the two. Third, S3 storage classes are a menu that trades storage fees against retrieval fees depending on "how often you retrieve," and if you don't know, Intelligent-Tiering, and for automation, the lifecycle policy.

On top of that, here is what we added today. The three words of S3 are **bucket (container), key (name), and object (data)**, and a bucket is **private by default**. The key to EBS's AZ dependency is the **snapshot**, and **instance store disappears when the instance shuts off**, which is where it parts from EBS.

Finally, remember just one thing. Storage questions ask not whether you memorized service names but whether you read **"what is the nature of this data."** Does it change often, do many view it together, is it okay to lose, when will it be retrieved again? Answer these four questions and the service settles by itself.

Tomorrow we move on to the neighborhood where these servers and storage live together: the basics of VPC and networking.

---

## 📝 Practice Questions

**Question 1.** You have a Linux-based workload where multiple EC2 instances must simultaneously access, read, and write the same files. Which storage is the best fit?

A) EBS  
B) EFS  
C) S3 Glacier Deep Archive  
D) Instance Store  

**Answer: B**  
Explanation: EFS is a file system that multiple EC2s can mount and share simultaneously, precisely matching the condition "multiple servers share the same files." EBS is by default a disk dedicated to one instance, and Glacier is for archives that aren't accessed often, unrelated to concurrent file sharing.

---

**Question 2.** You want to store large-volume audit logs that a legal obligation requires you to keep for 7 years but that you almost never need to retrieve, as cheaply as possible. Which S3 storage class fits?

A) S3 Standard  
B) S3 Standard-IA  
C) S3 Glacier Deep Archive  
D) S3 Intelligent-Tiering  

**Answer: C**  
Explanation: Glacier Deep Archive is the cheapest storage class in S3; retrieval takes several hours, but for "long-term retention that is almost never accessed" it's the most cost-effective. Standard is for frequently accessed data, so it's expensive; Standard-IA is for occasional access; and Intelligent-Tiering is the auto-tiering option for when you don't know the access pattern.

---

**Question 3.** Which most accurately captures what S3's "durability of 11 9s (99.999999999%)" means?

A) The probability you can always access the data instantly  
B) The probability you won't lose the stored data  
C) Data transfer speed  
D) The proportion of a month with no downtime  

**Answer: B**  
Explanation: Durability means "the probability you won't lose the data," and S3 achieves this target by automatically replicating data across multiple Availability Zones. Accessibility is a separate concept called availability, so A and D are not the definition of durability, and it has nothing to do with transfer speed (C).

---

**Question 4.** Which statement about EBS volumes is correct?

A) It can be freely attached simultaneously to EC2s across multiple Availability Zones (AZs)  
B) It is tied to a specific Availability Zone (AZ) and attaches to EC2s in that AZ  
C) It is object storage accessed directly over HTTP without a server  
D) Its capacity can't be sized in advance and it auto-scales infinitely  

**Answer: B**  
Explanation: An EBS volume is bound to a specific AZ and attaches to EC2s in the same AZ; to move it to another AZ you take a snapshot and restore it. A, "freely attached simultaneously across multiple AZs," is wrong; object storage accessed over HTTP is a characteristic of S3 (C); and infinite auto-scaling is a characteristic of S3/EFS, not EBS.

---

**Question 5.** In S3, when an object's access frequency drops over time, which mechanism automatically moves it to a cheaper storage class to save cost?

A) Lifecycle Policy  
B) Security Group  
C) EBS Snapshot  
D) Reserved Instance  

**Answer: A**  
Explanation: A Lifecycle Policy automatically moves objects to a cheaper class or deletes them based on rules like "after N days move to a certain class, and after N more days delete." A Security Group controls network traffic, an EBS Snapshot is a block-volume backup, and a Reserved Instance is an EC2 purchase option — all unrelated.

---
