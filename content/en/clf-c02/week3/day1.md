# Day 1 - Database Overview: The Same "DB" Serves Different Purposes

Every application ends up storing its data somewhere. But open the AWS console and the database category alone lists a whole row of names — RDS, Aurora, DynamoDB, ElastiCache, Redshift. At first glance it's easy to think, "Isn't one database enough?" Yet both on the exam and in real work, the core skill is **choosing which database is right for this particular data**.

Today the goal isn't to memorize five headline database services — it's to build a mental picture of **what problem each one was born to solve**. Once that picture clicks, the answer falls out naturally in scenarios like "customer order data," "temporary shopping-cart storage," or "a month's worth of sales analysis."

## What Is a Managed Database

Let's start with the big frame. Almost every AWS database service is **managed**. That means AWS handles the tedious operational work for you — server installation, OS patching, backups, failure recovery, and so on. You could install MySQL on an EC2 instance yourself, but then patching and backups all become your responsibility.

> 💡 **Related theory**: This is the database version of the **shared responsibility model** that recurs day after day. When you use a managed service like RDS, "infrastructure operations" such as engine patching, backups, and replication move up to AWS's side, while the customer focuses on "things inside the data" like data modeling, access permissions, and queries.

| Category | Self-managed (installed on EC2) | Managed (RDS, etc.) |
|------|------------------------|----------------|
| OS/engine patching | Customer | AWS |
| Backups/snapshots | Customer configures | AWS automatic |
| Failure recovery | Customer designs | AWS automatic (Multi-AZ) |
| Fine-grained OS control | Possible | Limited |

## Relational Databases: RDS and Aurora

The most traditional data is **structured data organized into tables**. Think customers, orders, and payments — data with clear rows and columns and relationships (JOINs) between them. Relational databases (RDBMS) handle this, and you query them with SQL.

**Amazon RDS (Relational Database Service)** offers familiar engines like MySQL, PostgreSQL, MariaDB, Oracle, and SQL Server in managed form. When you want to move an existing database to the cloud as-is, this is the most natural choice.

**Amazon Aurora** is a relational database that AWS redesigned from scratch for the cloud, compatible with MySQL and PostgreSQL. It runs the same MySQL code while delivering higher performance (several times that of standard MySQL), scales storage automatically, and achieves high durability by automatically replicating data across multiple AZs.

| Item | RDS | Aurora |
|------|-----|--------|
| Engine | MySQL/PostgreSQL/Oracle/SQL Server, etc. | MySQL/PostgreSQL compatible |
| Character | Familiar engines as-is, but managed | Redesigned cloud-native |
| Performance | Standard level | Higher than standard |
| Storage | Capacity specified in advance | Auto-scaling |

> 💡 **Related theory**: "I want to move an existing Oracle DB with minimal changes" → RDS. "I want top performance and auto-scaling, and MySQL/PostgreSQL is enough" → Aurora. On the exam, these two keyword patterns ("keep the existing engine" vs. "high-performance cloud-native") come up often.

## NoSQL: DynamoDB

Plenty of data doesn't fit neatly into tables. Think user profiles, game state, or IoT sensor readings — cases where the structure is flexible and you need **millions of reads/writes per second**. That's where **Amazon DynamoDB** comes in, a fully managed NoSQL (key-value / document) database.

DynamoDB's defining trait is that "you never have to think about servers." You don't provision capacity in advance — it scales automatically with traffic (on-demand mode) — and it guarantees fast, single-digit millisecond response times at any scale.

```
[Relational RDS/Aurora]         [NoSQL DynamoDB]
 Fixed row/column schema         Flexible item structure
 Relationships via JOINs         Ultra-fast lookups by a single key
 Strong at complex queries       Strong at massive-scale traffic
```

> 💡 **Related theory**: When you see keywords like "schema changes frequently," "unpredictable massive traffic," or "without managing servers," it's DynamoDB. Conversely, "complex JOINs," "transactional consistency," or "existing SQL app" points to RDS/Aurora.

## Cache: ElastiCache

Databases are great, but if you read the same data thousands of times per second, the DB starts to strain. This is where a cache comes in — **temporarily holding frequently used data in memory so you can pull it out fast**. **Amazon ElastiCache** is an in-memory caching service that offers Redis and Memcached in managed form.

Typical uses include session storage, leaderboards, and caching frequently queried product information. Because it works from memory, it's extremely fast — microsecond to millisecond range. Note, however, that memory is volatile, so you should think of it **not as permanent storage but as a "front-end accelerator."**

> 💡 **Related theory**: When you see signals like "reduce DB load," "reduce response latency," or "sessions/leaderboards," think ElastiCache. The key point is that a cache doesn't replace the source database — it sits in front of it as a supporting layer.

## Analytics / Data Warehouse: Redshift

Last is data of an entirely different nature. Work like "aggregate the last three years of sales by region and product" — **gathering large volumes of data for analysis**. Throwing analytical queries like this at an operational database such as RDS is slow and disrupts operations.

**Amazon Redshift** is a **data warehouse** built specifically for this kind of analysis. It's designed to aggregate and analyze petabyte-scale data quickly using columnar storage. The key distinction here is OLTP vs. OLAP.

| Category | OLTP (operational) | OLAP (analytical) |
|------|-------------|-------------|
| Representative services | RDS, Aurora, DynamoDB | Redshift |
| Query character | Short, frequent reads/writes | Aggregation over large data |
| Examples | Order processing, payments | Sales reports, BI dashboards |

> 💡 **Related theory**: When you see "data warehouse," "BI," "large-scale data analysis/aggregation," or "reporting," it's Redshift. Conversely, "real-time transaction/order processing" is OLTP (RDS/Aurora/DynamoDB).

## One-Page Summary: Which DB for Which Data

```
Structured + SQL + JOIN        → RDS / Aurora
Flexible structure + huge scale → DynamoDB
Fast cache + reduce DB load     → ElastiCache
Large-scale analytics + reporting → Redshift
```

The CLF exam doesn't ask about deep tuning — it asks about **the ability to choose the right service for a scenario**. So the most effective approach is to remember each service's one-line identity clearly.

## Wrapping Up

Today we distinguished five database services by their **purpose**. Relational is RDS/Aurora, NoSQL is DynamoDB, caching is ElastiCache, and analytics is Redshift. Rather than trying to memorize, build the habit of first asking, "What is the nature of this data?"

In the next article, we'll look at the messaging services that **loosely connect** these services to one another — SQS, SNS, and EventBridge. Just as important as where data is stored is how systems exchange messages with each other — a core part of cloud design.

---

## 📝 연습 문제

**문제 1.** A company wants to migrate its existing on-premises Oracle database to AWS with minimal changes. Which service is most appropriate?

A) Amazon RDS  
B) Amazon DynamoDB  
C) Amazon Redshift  
D) Amazon ElastiCache  

**정답: A**  
해설: RDS offers familiar relational engines, including Oracle, in managed form, making it a good fit for migrating an existing DB with minimal changes. DynamoDB is NoSQL and would require redesigning the schema/queries, Redshift is an analytical data warehouse, and ElastiCache is a cache — none of which can replace the operational database itself.

---

**문제 2.** Which NoSQL database handles flexible data structures and unpredictable, massive-scale traffic while requiring no server management?

A) Amazon Aurora  
B) Amazon RDS  
C) Amazon DynamoDB  
D) Amazon Redshift  

**정답: C**  
해설: DynamoDB is a fully managed NoSQL database that provides flexible item structures, automatic scaling, and single-digit millisecond responses. Aurora and RDS are relational (fixed schema), and Redshift is a warehouse for large-scale data analysis, so it's not suited to handling operational traffic.

---

**문제 3.** You want to reduce the read load on a database and speed up response times for frequently queried data. Which service is most appropriate?

A) Amazon Redshift  
B) Amazon ElastiCache  
C) Amazon RDS  
D) Amazon DynamoDB  

**정답: B**  
해설: ElastiCache is an in-memory cache based on Redis/Memcached that keeps frequently used data in memory, reducing DB load and accelerating responses. Redshift is for analytics, and RDS/DynamoDB are source data stores, not caching layers.

---

**문제 4.** A company wants to gather several years of sales data to build large-scale aggregate analysis and BI reports. Which service is most appropriate?

A) Amazon Redshift  
B) Amazon DynamoDB  
C) Amazon ElastiCache  
D) Amazon RDS  

**정답: A**  
해설: Redshift is a data warehouse optimized for aggregation and analysis (OLAP) of large data volumes. DynamoDB and RDS suit short, frequent operational queries (OLTP), and ElastiCache is a caching layer, so none are appropriate for large-scale analytical queries.

---

**문제 5.** Which relational database, redesigned by AWS for the cloud, is compatible with MySQL/PostgreSQL while offering higher-than-standard performance and automatic storage scaling?

A) Amazon RDS for MySQL  
B) Amazon Aurora  
C) Amazon DynamoDB  
D) Amazon ElastiCache  

**정답: B**  
해설: Aurora is a cloud-native relational DB compatible with MySQL and PostgreSQL, characterized by high performance and auto-scaling storage. RDS for MySQL merely provides the standard engine in managed form, DynamoDB is NoSQL, and ElastiCache is a cache.

---
