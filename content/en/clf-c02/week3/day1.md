# Day 1 - Database Overview: The Same "DB" Serves Different Purposes

## 📌 Key Takeaways

- Almost every AWS database is **managed** — AWS handles installation, patching, backups, and recovery, and the customer focuses on the data.
- **Structured data + SQL + JOIN** → RDS (familiar engines as they are) or Aurora (cloud-native, high performance).
- **Flexible structure + unpredictable, massive traffic** → DynamoDB (NoSQL, single-digit-millisecond responses, automatic scaling).
- **Reduce DB load + ultra-low-latency lookups** → ElastiCache. It is a **front-end accelerator** that does not replace the origin DB.
- **Large-scale aggregation / BI reporting (OLAP)** → Redshift. Distinguishing it from short, frequent operational queries (OLTP) is the key to the exam.

## What Is a Managed Database?

In the Database category of the AWS console, RDS, Aurora, DynamoDB, ElastiCache, and Redshift appear one after another. They aren't things to memorize; you need to grasp **what problem each was born to solve** so that the answer becomes visible in scenarios like "customer order data," "temporary storage for a shopping cart," or "analyzing a month of sales."

- Almost every AWS database service is **managed**.
- AWS takes over the tedious operational chores like server installation, OS patching, backups, and failure recovery.
- You can install MySQL yourself on EC2, but then patching and backups are all your responsibility.

### What Happened Before Managed Services?

If you can't get a feel for why the word "managed" matters so much, just imagine once how things used to be. When a company needed a database, the person in charge did these things in order.

1. Buy or rent a server, and install the operating system and database software.
2. Edit configuration files by hand to tune performance.
3. Run a backup script every night, and occasionally check that it can actually be restored.
4. Patch through the night whenever a security vulnerability is announced.
5. Since the service stops if one server dies, build a setup yourself with one more identical server and continuous data replication.
6. Notice in advance when the disk is filling up and expand capacity.

**None of these creates "value unique to our service."** Customers pay because our app works well, not because we wrote a good backup script. A managed database hands this entire list over to AWS.

These tasks are often called **undifferentiated heavy lifting**. They are jobs you must do but that never become a competitive advantage no matter how well you do them. If you shrink the reason the cloud exists to one sentence, it is "to take on this heavy lifting for you," and managed databases are the representative example.

This is the database version of the **shared responsibility model** that repeats day after day. When you use a managed service like RDS, "infrastructure operations" such as engine patching, backups, and replication move up to AWS's responsibility, and the customer focuses on "work inside the data" such as data modeling, access permissions, and queries.

| Aspect | Self-operated (installed on EC2) | Managed (RDS, etc.) |
|------|------------------------|----------------|
| OS/engine patching | Customer | AWS |
| Backups/snapshots | Configured by the customer | Automatic by AWS |
| Failure recovery | Designed by the customer | Automatic by AWS (Multi-AZ) |
| Fine-grained OS control | Possible | Limited |

## Relational Databases: RDS and Aurora

- The most traditional data is **structured data organized into tables**. Like customers, orders, and payments, it has clear rows and columns and has relationships (JOINs) with one another.
- A relational database (RDBMS) handles this, and you query it with SQL.

If you're hearing about relational databases for the first time, it's accurate to picture **several Excel sheets linked to one another**. The `Customer` sheet holds customer number, name, and contact; the `Order` sheet holds order number, customer number, and amount. The two sheets are linked by a common column, `customer number`, so you can pull out "the names and contacts of customers who spent more than 100,000 won in March" in one go. **Joining tables to tables like this is a JOIN**, and relational databases are built to do this well.

The strength of this approach is that **the rules are strict**. An order must have a customer number and the amount column holds only numbers, so it's strong for data where "wrong values spell disaster," such as work involving money. The weakness comes from the same place — you have to decide the column structure in advance.

**Amazon RDS (Relational Database Service)**

- Provides familiar engines such as MySQL, PostgreSQL, MariaDB, Oracle, and SQL Server as managed services.
- It's the most natural choice when you want to move a DB you already use to the cloud as it is.

**Amazon Aurora**

- A relational DB newly designed by AWS for the cloud, compatible with MySQL and PostgreSQL.
- It delivers higher performance while using the same MySQL code (several times that of standard MySQL).
- Storage grows automatically.
- Data is automatically replicated across multiple AZs, giving high durability.

| Aspect | RDS | Aurora |
|------|-----|--------|
| Engines | MySQL/PostgreSQL/Oracle/SQL Server, etc. | MySQL- and PostgreSQL-compatible |
| Character | Familiar engines as is, but managed | Redesigned as cloud-native |
| Performance | Standard level | Higher than standard |
| Storage | Capacity specified in advance | Scales automatically |

"I want to move an existing Oracle DB with minimal changes" → RDS. "I want top performance and automatic scaling, and MySQL/PostgreSQL is enough" → Aurora. These two keywords ("keep the existing engine" vs "high-performance cloud-native") are the fork in the road.

> 📚 **Case study**: Suppose a company wants to move a 15-year-old internal accounting system. It runs on Oracle and is tangled with thousands of lines of stored procedures, so if someone says "performance is better, so let's go with Aurora," the application would have to be rewritten entirely. The correct answer is **RDS for Oracle** — keep the engine you were using and hand over only the operational burden. Conversely, for a service you're building from scratch, **Aurora** is better from the start. **"Is it an existing system, or something new?"** is the fork in the road.

### An Easily Confused Pair: Multi-AZ vs Read Replica

RDS has two features that look similar in that "you keep one more replica" but have **completely different purposes**. This is a passage the CLF exam loves.

**Multi-AZ deployment** is for **high availability (preparing for failure)**. You keep a standby replica in a different Availability Zone (a physically separate data center) and continuously synchronize data to it. If the primary database dies, AWS automatically switches over to the standby replica (failover). This standby replica sits idle normally and does not accept read requests — it is purely insurance.

A **Read Replica** is for **improving read performance**. You keep a copy of the original and send query traffic there to relieve the original's burden. You can create several, but it is not a mechanism for automatic failover.

| Aspect | Multi-AZ | Read Replica |
|------|---------|-----------------|
| Purpose | High availability / failure preparedness | Scaling read performance |
| Normal role | Standby (accepts no read requests) | Shares query traffic |
| On failure | Switches over automatically | Not meant for automatic switchover |
| Signal keywords | "Availability," "failover," "minimize downtime" | "Distribute read load," "too many queries, so it's slow" |

> ⚠️ **Pitfall**: It's easy to make the mistake of choosing a Read Replica when the question says **"I want to increase availability,"** or choosing Multi-AZ when it says **"too much query traffic makes it slow."** That's because both use the same word, "replica." Ask **"why do we keep the replica?"** — if it's insurance, Multi-AZ; if it's sharing the workload, Read Replica.

## NoSQL: DynamoDB

- Much data doesn't fit neatly into tables — data with a flexible structure, like user profiles, game state, and IoT sensor values.
- Cases that need **millions of reads/writes per second** fall here too.
- What you use in these cases is **Amazon DynamoDB**, a fully managed NoSQL (key-value / document) database.
- Its defining feature is that **"you don't need to worry about servers."**
  - It scales automatically with traffic without your reserving capacity in advance (on-demand mode).
  - It guarantees fast, single-digit-millisecond responses at any scale.

```
[Relational RDS/Aurora]          [NoSQL DynamoDB]
 Fixed row/column schema          Flexible item structure
 Relationships via JOIN           Ultra-fast lookup by a single key
 Strong at complex queries        Strong at massive traffic
```

The easiest picture for understanding DynamoDB is **a giant locker bank**. Each compartment has a **claim tag (key)** attached, and if you present the tag, it hands you the contents of that compartment immediately. What's inside can differ from compartment to compartment — one might contain only a name and email, another a name, email, birthday, and hobby. In return, it's **not good at digging through contents without a tag**, such as "find everyone whose hobby is hiking."

This property explains both its strength and its weakness. Finding by tag is equally fast whether there are 100 records or 100 million, but complex queries that join several tables or free-form condition searches fall short of relational databases.

> 📚 **Case study**: Suppose a mobile game company stores the game state (level, items, last-login time) of players worldwide. Lookups are almost always the simple form "fetch the data for this user ID," yet hundreds of thousands arrive per second, traffic jumps several-fold when an event opens, and the items to store grow with every update. **Simple key lookup + massive scale + flexible structure** — this is exactly where DynamoDB was born.

If you see keywords like "the schema changes often," "unpredictable large-scale traffic," or "without server management," it's DynamoDB. Conversely, "complex JOINs," "transactional consistency," or "existing SQL app" points to RDS/Aurora.

> ⚠️ **Pitfall**: It's a problem to understand "NoSQL as a more advanced, newer technology than relational." The two are **not above and below each other but options standing side by side**. For work where accuracy is absolute, like a bank account transfer, relational is still right, and for large-scale simple lookups, NoSQL is right. The exam also asks not "which is better" but "which fits this situation."

## Cache: ElastiCache

- DBs are great, but if the same data is read thousands of times per second, the DB struggles.
- A cache is what **keeps frequently used data briefly in memory and pulls it out quickly** in such cases.
- **Amazon ElastiCache** is an in-memory cache service that provides Redis and Memcached as managed services.
- Representative uses: session storage, leaderboards, caching frequently queried product information, etc.
- Because it processes in memory, it is very fast, at the microsecond-to-millisecond level.
- However, memory is volatile, so you must understand it as **a "front-end accelerator," not a permanent store**.

The problem a cache solves fits in one sentence — **"we keep asking the same question over and over."** The popular-products list on a shopping mall's front page changes at most once every five minutes, but if there are thousands of visitors a second, the database recomputes the same answer thousands of times. It's like a librarian walking to the stacks every single time to fetch the same book. **You can just put that book on the counter**, and that's a cache.

If you see signals like "reduce DB load," "reduce response latency," or "session/leaderboard," it's ElastiCache. The key point is that a cache doesn't replace the origin DB but is an auxiliary layer placed in front of it.

> ⚠️ **Pitfall**: A cache is **not a permanent store.** Memory loses its contents when power goes out, and when space runs short, older data is pushed out first. So a choice like "store customer order records in ElastiCache" is wrong. Data in a cache must be something that can be recreated from the origin no matter when it disappears.

## Analytics / Data Warehouse: Redshift

- The last is data of a completely different character — **gathering and analyzing large amounts of data**, such as "total up the last three years of sales by region and product."
- If you throw this kind of analytical query at an operational DB like RDS, it's slow and gets in the way of operations.
- **Amazon Redshift** is a **data warehouse** dedicated to this kind of analysis.
- It is built to aggregate and analyze petabyte-scale data quickly using columnar storage.
- The key distinction is OLTP vs OLAP.

| Aspect | OLTP (operational) | OLAP (analytical) |
|------|-------------|-------------|
| Representative services | RDS, Aurora, DynamoDB | Redshift |
| Query character | Short, frequent reads/writes | Aggregation of large data |
| Examples | Order processing, payments | Sales reports, BI dashboards |

In supermarket terms, **OLTP is the checkout counter** (a few items for one customer, quickly, repeated all day), and **OLAP is the headquarters meeting room** (skimming hundreds of millions of records at once and summarizing them, like "branch-by-branch sales trends for the past three years"). If you run that analysis at the checkout counter, all the customers lined up behind stop. That's why a separate window dedicated to analysis is set up, and that's Redshift.

If you see "data warehouse," "BI," "large-scale data analysis/aggregation," or "reporting," it's Redshift. Conversely, "real-time transaction/order processing" is OLTP (RDS/Aurora/DynamoDB).

## Other Database Services (Briefly)

AWS also has databases built for just one particular data shape. At the CLF level, it's enough to **know only the name and a one-line purpose** and move on. There's no need to dig deeper at all.

| Service | One-line purpose |
|--------|-----------|
| Amazon DocumentDB | A document database compatible with MongoDB |
| Amazon Neptune | A graph database that handles networks of relationships between people and things (recommendations, social relationships, fraud detection) |
| Amazon Timestream | A time-series database that handles values accumulating over time (IoT sensors, metrics) |
| AWS Database Migration Service (DMS) | A migration tool that moves an existing database to AWS |

It used to be common sense that a company has "one database," but now the **purpose-built database** strategy — choosing whatever fits each kind of data best — is the standard. This is why AWS has so many databases.

## Summary of Confusing Pairs

This collects only the combinations that are often answered wrongly because the names are similar or the roles look overlapping.

| Confusing pair | Decisive difference |
|-------------|------------|
| RDS vs DynamoDB | The world of tables, JOINs, and SQL vs key lookup, flexible structure, and massive scale |
| RDS vs Aurora | Familiar engines as they are vs newly designed for the cloud (high performance, automatic scaling) |
| RDS vs Redshift | Short, frequent operational queries (OLTP) vs large-scale aggregation analysis (OLAP) |
| Multi-AZ vs Read Replica | Failure preparedness (insurance) vs distributing read load (extra hands) |
| ElastiCache vs DynamoDB | A volatile acceleration layer vs a store that holds the original |
| DynamoDB vs DocumentDB | Centered on key-value vs centered on MongoDB-compatible documents |

## DB Selection Keyword Mapping Table

When the following phrases appear in a question, suspect the right-hand side first.

| Keyword in the question | Service it points to |
|---------------|----------------|
| Migrate an existing MySQL/Oracle/SQL Server with minimal changes | RDS |
| MySQL-compatible, high performance, automatic storage scaling | Aurora |
| Improve availability, automatic failover, minimize downtime | RDS Multi-AZ |
| Too many queries making it slow, distribute read load | Read Replica |
| Flexible schema, millions of requests per second, single-digit milliseconds | DynamoDB |
| Session storage, leaderboard, speeding up repeated lookups, reducing DB load | ElastiCache |
| Data warehouse, BI dashboard, multi-year aggregate reports | Redshift |
| MongoDB-compatible / relationship networks, recommendations / time series | DocumentDB / Neptune / Timestream |
| Migrate an on-premises DB to AWS | DMS |

## DB Selection Criteria by Data Character

```
Structured + SQL + JOIN             → RDS / Aurora
Flexible structure + massive scale  → DynamoDB
Fast cache + reduced DB load        → ElastiCache
Large-scale analysis + reporting    → Redshift
```

- The CLF exam asks not about deep tuning but about **"the ability to choose the service that fits this scenario."**
- The most effective thing is to remember each service's one-line identity clearly.
- Rather than trying to memorize, build the habit of first asking **"what is the character of this data?"**

Database questions first ask, "what is the character of this data?" If you work out whether it's structured or not, whether it's pulled out often or viewed all at once, and whether it's the original or a copy, two of the four choices are crossed out immediately. RDS is the familiar engine moved into a managed form, and Aurora is the same world newly redesigned for the cloud so that it's faster and scales automatically. Redshift is closer to a meeting room than a checkout counter. It's dedicated to large-scale aggregation and reporting.

In the next post, we'll look at the messaging services that **loosely connect** these services to one another — SQS, SNS, and EventBridge. How messages are exchanged between systems is as central to cloud design as where the data is stored.

## 📖 Glossary

- **Managed service**: A model in which AWS takes over operational chores such as server installation, patching, and backups.
- **Relational database (RDBMS)**: A database that organizes data into tables of rows and columns and handles it with SQL.
- **JOIN**: Joining data divided across multiple tables into one along their relationships to query it.
- **NoSQL**: A database that doesn't use a fixed table structure. Fields may differ from item to item.
- **Key-value store**: A simple structure that "returns the value when you present the name tag (key)." Lookups are very fast.
- **In-memory cache**: A temporary layer that keeps frequently used data briefly in memory and pulls it out quickly. It is not the original store.
- **Data warehouse**: A store that gathers data from many places in one spot and dedicates itself to analysis and reporting.
- **OLTP**: Operational work that handles short, frequent reads/writes such as orders and payments.
- **OLAP**: Work that gathers and aggregates/analyzes large amounts of data. Reports and BI dashboards belong here.
- **Schema**: A structure that decides in advance what slots (columns) to hold data in. Strict for relational, loose for NoSQL.
- **Availability Zone (AZ)**: A group of physically separate data centers within a Region. It's divided this way so that if one place stops, the others stay alive.
- **Multi-AZ**: A high-availability configuration that keeps a standby replica in a different Availability Zone and automatically takes over if the original dies.
- **Read Replica**: A read-only copy made to take a share of query traffic. It is not for failover.
- **Failover**: When the primary system stops, the standby system takes over its role.
- **Columnar storage**: A method of storing data grouped by column rather than by row. It's much faster when aggregating large amounts of just certain columns.

---

## 📝 Practice Questions

**Question 1.** A company wants to migrate its existing on-premises Oracle database to AWS with minimal changes. Which service is most appropriate?

A) Amazon RDS  
B) Amazon DynamoDB  
C) Amazon Redshift  
D) Amazon ElastiCache  

**Answer: A**  
Explanation: RDS offers familiar relational engines, including Oracle, in managed form, making it a good fit for migrating an existing DB with minimal changes. DynamoDB is NoSQL and would require redesigning the schema/queries, Redshift is an analytical data warehouse, and ElastiCache is a cache — none of which can replace the operational database itself.

---

**Question 2.** Which NoSQL database handles flexible data structures and unpredictable, massive-scale traffic while requiring no server management?

A) Amazon Aurora  
B) Amazon RDS  
C) Amazon DynamoDB  
D) Amazon Redshift  

**Answer: C**  
Explanation: DynamoDB is a fully managed NoSQL database that provides flexible item structures, automatic scaling, and single-digit millisecond responses. Aurora and RDS are relational (fixed schema), and Redshift is a warehouse for large-scale data analysis, so it's not suited to handling operational traffic.

---

**Question 3.** You want to reduce the read load on a database and speed up response times for frequently queried data. Which service is most appropriate?

A) Amazon Redshift  
B) Amazon ElastiCache  
C) Amazon RDS  
D) Amazon DynamoDB  

**Answer: B**  
Explanation: ElastiCache is an in-memory cache based on Redis/Memcached that keeps frequently used data in memory, reducing DB load and accelerating responses. Redshift is for analytics, and RDS/DynamoDB are source data stores, not caching layers.

---

**Question 4.** A company wants to gather several years of sales data to build large-scale aggregate analysis and BI reports. Which service is most appropriate?

A) Amazon Redshift  
B) Amazon DynamoDB  
C) Amazon ElastiCache  
D) Amazon RDS  

**Answer: A**  
Explanation: Redshift is a data warehouse optimized for aggregation and analysis (OLAP) of large data volumes. DynamoDB and RDS suit short, frequent operational queries (OLTP), and ElastiCache is a caching layer, so none are appropriate for large-scale analytical queries.

---

**Question 5.** Which relational database, redesigned by AWS for the cloud, is compatible with MySQL/PostgreSQL while offering higher-than-standard performance and automatic storage scaling?

A) Amazon RDS for MySQL  
B) Amazon Aurora  
C) Amazon DynamoDB  
D) Amazon ElastiCache  

**Answer: B**  
Explanation: Aurora is a cloud-native relational DB compatible with MySQL and PostgreSQL, characterized by high performance and auto-scaling storage. RDS for MySQL merely provides the standard engine in managed form, DynamoDB is NoSQL, and ElastiCache is a cache.

---
