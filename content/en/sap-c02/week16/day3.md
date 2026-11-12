# Day 3 - Domain 3 Review: Migration and Modernization (20%) — The History of the 7Rs, the Internals of Block Replication and CDC, Bandwidth Math, and the Strangler Fig Pattern

SAP-C02 Domain 3, "Migration and Modernization," carries a 20% weight, and its essence is the question of "how do you move workloads from on premises or another cloud to AWS (migration) and modernize them into cloud-native form (modernization)." AWS formalized this as the **7R framework**, and each R has a defined toolset and internal operating principles. The Pro exam asks "which R is this scenario, and which tools do you combine and how" — beyond simple tool-name mapping, you need to understand bandwidth math, replication mechanisms, and incremental decomposition strategies to solve variant questions.

Today we organize Domain 3 in depth through the 7R decision tree, tool internals, modernization patterns, and scenario mapping.

## The 7R Framework — History and Decision Tree for Migration Strategy

The roots of the 7Rs are the **5Rs** (Rehost, Refactor, Revise, Rebuild, Replace) presented in 2011 by Gartner analyst Richard Watson. AWS refined them into **6Rs** in 2016 (Retire, Retain, Rehost, Replatform, Repurchase, Refactor) and extended them to **7Rs** in 2021 by adding **Relocate**. The key is that each R is a point on a spectrum of "migration cost vs. cloud-native value."

| R | Meaning | When to use | Representative tools |
|---|---------|-------------|----------------------|
| **Retire** | Decommission | Discover systems that are not used | Application Discovery Service |
| **Retain** | Keep for now | Not suitable, low priority, license-bound | - |
| **Relocate** | Move the same environment wholesale | VMware → VMware Cloud on AWS | VMware HCX |
| **Rehost** | Lift & Shift | Fast move with minimal code change | **MGN** |
| **Replatform** | Some changes (lift-tinker-shift) | Keep the DB engine, only make the hosting managed | DMS, Beanstalk, App2Container |
| **Repurchase** | Replace with commercial SaaS | In-house ERP → Workday, CRM → Salesforce | AWS Marketplace |
| **Refactor** | Redesign as cloud-native | Monolith → microservices, serverless | DMS+SCT, Lambda, ECS, Step Functions |

Choosing a 7R is **an optimization problem of "business value ÷ migration effort."** The further left you go (Retire, Rehost), the smaller the effort but also the smaller the cloud value (you operate EC2 like a data center); the further right you go (Refactor), the greater the effort and risk but the more truly cloud-native (serverless, auto scaling, managed) you become. Models differ by cloud vendor — Microsoft Azure uses 5Rs (Rehost, Refactor, Rearchitect, Rebuild, Replace), and Google Cloud uses its own classification. AWS's 7Rs are the most granular. Key exam mappings: "Lift & Shift" = Rehost, "same DB engine + move to RDS" = Replatform, "decompose the monolith" = Refactor, "VMware as is" = Relocate.

> 🔍 **Going deeper**: The most important insight for the Pro exam is **"if there is a time constraint, Rehost first, then optimize incrementally on the cloud."** With a short deadline, attempting Refactor from the start fails because schema conversion, app changes, and testing take months. Instead, quickly Rehost with MGN to close the data center first, then after moving to the cloud, pick only the high-business-value workloads to Replatform or Refactor. This is the "lift-and-shift then modernize" pattern, and it is the standard validated by large migrations such as Capital One and GE.

**GE's cloud retreat vs. Capital One's success** (late 2010s) show the light and dark sides of 7R strategy. GE began with the ambition of moving 9,000 workloads, but migrated indiscriminately without governance or prioritization and ended up moving a substantial number back on premises. Capital One, by contrast, over eight years from 2015 to 2020, **moved most workloads quickly via Rehost at first**, then progressively evolved through Replatform (Oracle → Aurora, its own ELB → ALB) to Refactor (monolith → microservices, Lambda), and eventually closed all of its own data centers. The lesson: don't Refactor everything at once; proceed incrementally in waves.

## Tool Internals — The Mechanisms of MGN, DMS, and DRS

### MGN (Application Migration Service) — Block-Level Continuous Replication

MGN installs an **agent** on the on-premises server and **continuously replicates the disks at the block level**. The characteristic is that while the source stays live and in operation, it keeps syncing in the background to the AWS staging area, then pauses briefly only at the moment of cutover and switches over to EC2. Downtime is compressed to "the final delta sync + boot" (minutes).

MGN's block-level continuous replication is essentially **asynchronous replication + CDP (Continuous Data Protection)**. In principle it uses the same engine (based on the CloudEndure acquisition) as the DR service **Elastic Disaster Recovery (DRS)** — MGN is "move once and finish," DRS is "keep replicating and stand by for DR"; only the purpose differs, and the technology is a sibling. That is why, on the exam, "minimal downtime + moving the whole OS, one-time" is MGN, while "continuous replication, standing by for disaster" is DRS. Both move the entire OS, app, and data (at server level); they are not tools that only move files (DataSync) or DB schemas (DMS).

### DMS + SCT — Zero-Downtime DB Migration with CDC

- **Homogeneous**: Oracle → Oracle on RDS, MySQL → MySQL — DMS alone
- **Heterogeneous**: Oracle → Aurora PostgreSQL, SQL Server → MySQL — **schema conversion with SCT** + **data migration with DMS**
- **CDC (Change Data Capture)**: initial full load + ongoing change capture → zero-downtime cutover

The secret of DMS's zero downtime is that **CDC reads the source DB's transaction log** — it parses MySQL's binlog, Oracle's redo log, PostgreSQL's WAL, and SQL Server's transaction log to capture changes (INSERT/UPDATE/DELETE). This is lightweight like a read replica, so the load on the source DB is small. The sequence: (1) Full Load copies the existing data wholesale, (2) changes that occurred during the Full Load are cached and then applied, (3) afterwards CDC keeps applying real-time changes to keep both sides in sync, (4) at cutover, app traffic is switched to the new DB and DMS is terminated. Downtime is compressed to the instant of the traffic switch. Pitfall: **SCT is unnecessary for homogeneous migrations** — SCT is for converting SQL dialects and stored procedures, so there is no use for it between the same engine.

(Hypothetical case) A fintech migrated from Oracle Database Enterprise Edition (license costing hundreds of millions of KRW per year) to Aurora PostgreSQL. **SCT converted PL/SQL → PL/pgSQL** (70% automatic, 30% manual — SCT flags items it cannot convert in an Assessment Report), **DMS CDC kept both sides synced for six months**, and the cutover happened over a weekend. Result: zero license cost plus better performance. This is a typical Refactor case, and "heterogeneous DB + schema conversion" is always the SCT+DMS combination.

### DataSync vs Snow Family — Bandwidth Is Time

| Tool | Capacity | Time | Use case |
|------|----------|------|----------|
| DataSync | A few GB to tens of TB | Depends on the line | Sufficient line, online sync |
| Snowcone | 8 TB | One week of shipping | Small volume + insufficient line, edge |
| Snowball Edge | 80 TB (storage optimized) | One week of shipping | Large volume + insufficient line |
| Snowmobile | 100 PB | Several weeks of shipping | Bulk transfer at exabyte/petabyte scale |

> ⚠️ **Pitfall**: The hidden variable in migration is **bandwidth math**. Time to move over the line = data volume ÷ effective bandwidth. For example: 1 PB ÷ 100 Mbps ≈ 1000 days (impossible), 100 TB ÷ 10 Gbps ≈ 22 hours (theoretical; the effective figure is 2 to 3 times longer). So for "tens to hundreds of TB + limited bandwidth," the standard approach is a hybrid: **ship the initial bulk physically with Snow, then sync only the deltas online with DataSync/DMS**. Answering "1 PB + 100 Mbps + 1 month" with DataSync is a trap — it is impossible over the line, so the answer is multiple Snowball Edge devices or Snowmobile (generally Snowball below 10 PB, Snowmobile above). Note: new Snowmobile orders were discontinued in 2024, but conceptually for the exam it remains the symbol of petabyte-scale truck shipping.

### App2Container, AppFlow, Migration Hub

- **App2Container (A2C)**: automatically analyzes Java (Tomcat, JBoss) and .NET apps → generates Docker images → ECS/EKS deployment manifests (Replatform containerization)
- **AppFlow**: no-code data integration between SaaS (Salesforce, Slack, ServiceNow, Google Analytics) and AWS (S3, Redshift)
- **Migration Hub**: integrated tracking across Discovery → Planning → Migration → Validation, plus per-asset 7R recommendations (Strategy Recommendations)
- **Application Discovery Service (ADS)**: automatic on-premises inventory collection (agent = detailed / agentless = VMware vCenter integration) + automatic dependency graph generation

**Migration Wave Planning** is the core of migration governance. Rather than moving all workloads at once, you proceed incrementally in waves 1, 2, and 3 **based on the dependency graph** — tightly coupled systems (apps sharing the same DB) go in the same wave, and systems with no dependencies move first. ADS automatically maps network communication between apps to build the dependency graph, and Migration Hub assigns waves and tracks progress. This is the standard way to reduce the risk of a "big-bang migration."

## Modernization Patterns — Safely Decomposing a Monolith

### The Strangler Fig Pattern — Gradual Strangulation

Rewriting a monolith all at once (big bang) is high-risk (as Knight Capital and several failed ERP rewrites prove). The **Strangler Fig pattern** (Martin Fowler, 2004 — named after the strangler fig tree that wraps its host and slowly strangles it) leaves the monolith in place and builds new functionality first as microservices, using an API Gateway/proxy to route requests either to the old monolith or to the new services. Over time, functions move one by one to new services and the monolith is "strangled."

```
[Monolith EC2 + Oracle]
        ↓ Refactor (incremental)
[API Gateway routing] → old features: monolith / new features: Lambda · Fargate
[Aurora + DynamoDB] [Step Functions workflow]
```

> 🎯 **Scenario**: "A company wants to convert a 20-year-old Java EE monolith (sharing a single Oracle DB) into microservices. A one-shot rewrite carries a high risk of business disruption. How do you decompose it incrementally?" — Answer: **Strangler Fig pattern + API Gateway routing + new features first as Lambda/Fargate microservices + DMS to gradually separate the DB as well (database-per-service)**. API Gateway routes requests to the monolith or the new services, new features are carved out first, and the DB is gradually migrated by DMS, domain by domain, into new databases (Aurora/DynamoDB). Because not everything moves at once, each step is rollback-able and risk is spread out. A "big-bang rewrite" is a wrong-answer signal.

The hard part of decomposing a monolith is not the code but **the shared database**. The microservices principle is "each service has its own DB (database-per-service)," but a monolith usually shares one giant DB. When a transaction boundary crosses services during decomposition, a **distributed transaction** problem arises — 2PC (2-phase commit) hurts availability and is avoided in the cloud; instead the **Saga pattern** (eventually achieving consistency through compensating transactions) is implemented with Step Functions. If you see "distributed transactions and compensation logic across microservices," Step Functions Saga is the right direction.

## Scenario Keyword → Answer Mapping

| Keyword | Answer | One-line rationale |
|---------|--------|--------------------|
| "Lift & Shift 200 VMs + short downtime" | MGN | Block-level continuous replication |
| "On premises + continuous DR on AWS" | DRS | Continuous replication, standby |
| "Oracle → Aurora PostgreSQL" | DMS + SCT | Heterogeneous, schema conversion |
| "SQL Server → MySQL (heterogeneous)" | SCT + DMS | Dialect conversion + CDC |
| "MySQL → RDS MySQL (homogeneous)" | DMS only | SCT unnecessary for homogeneous |
| "Zero-downtime DB migration" | DMS CDC | Transaction log capture |
| "1 PB + 100 Mbps line + 1 month" | Multiple Snowball Edge / Snowmobile | The line is impossible by bandwidth math |
| "Tens of TB + sufficient line" | DataSync | Online sync |
| "Containerize a Java EE monolith" | App2Container | Automatic Dockerization |
| ".NET → Fargate" | App2Container | Automatic analysis and deployment |
| "Salesforce → S3 integration" | AppFlow | No-code SaaS connector |
| "Integrated tracking of migration stages" | Migration Hub | Wave and progress visualization |
| "Automatic on-premises asset inventory and dependencies" | Application Discovery Service | Dependency graph |
| "Monolith → incremental microservices" | Strangler Fig + API Gateway | Avoid big bang |
| "Distributed transactions across microservices" | Step Functions Saga | Compensating transactions |
| "VMware → VMware on AWS" | VMware Cloud on AWS (Relocate) | Hypervisor unchanged |

## Summary

The core of Domain 3 is **instant 7R recall + understanding tool internals + bandwidth math**. Insights: (1) under a time constraint, Rehost (MGN) first and Refactor incrementally on the cloud — GE's failure vs. Capital One's success proves it, (2) MGN is continuous block replication (a sibling engine of DRS), DMS CDC reads the transaction log for zero downtime, and SCT is added only for heterogeneous migrations, (3) "tens to hundreds of TB + limited bandwidth" calls for a hybrid of Snow plus online deltas — petabytes are impossible over a line, (4) never big-bang rewrite a monolith — strangle it gradually with Strangler Fig, and separate the shared DB with database-per-service + Saga. Exam trap: "Is SCT needed for a homogeneous migration?" → No, DMS alone is enough.

Tomorrow (Day 79) we will review Domain 4, continuous improvement (observability, automation, SRE), together with SRE theory.

---

## 📝 Practice Questions

**Question 1.** Stable load predicted over 3 years → **Savings Plans (Compute/DDB)**

**Question 2.** 10x traffic spikes → **Spot 90% + On-Demand for stability**

**Question 3.** High NAT Gateway data processing cost → **VPC Endpoint S3/DDB**

**Question 4.** 100 TB initially → selective access after 90 days → **S3 Intelligent-Tiering → Glacier**

**Question 5.** Minimize DynamoDB charges → **On-Demand or Provisioned depending on the load pattern**

**Question 6.** Reserved Instance over-usage → **Swap provisioned type or downgrade**

---

**Question 7.** A company must lift and shift about 200 VMware VMs from an on-premises data center to AWS within 6 months, minimizing the downtime of each server to minutes. The source continues to operate until cutover. Which tool is most appropriate?
A) AWS DataSync
B) AWS Application Migration Service (MGN)
C) AWS Snowball only
D) AWS Database Migration Service (DMS)

**Answer: B**

Explanation: "Lift and shift of the whole server (OS + app + data) + minimal downtime + continuous replication while the source is running" is MGN's domain. MGN continuously replicates the disks at the block level with an agent and stops only at the moment of cutover to switch over to EC2, compressing downtime to "the last delta + boot." A (DataSync) transfers files and objects and does not move a whole server. C (Snowball alone) is good for bulk initial shipment but has no continuous replication or minimal-downtime cutover. D (DMS) is a DB engine migration tool. Trap: "whole OS + minimal downtime + one-time" is MGN (for ongoing DR, it is DRS).

---

**Question 8.** A company is migrating an on-premises Oracle 11g database to Aurora PostgreSQL to eliminate licensing costs. Stored procedures (PL/SQL) and the schema must be converted, and cutover must be close to zero downtime. Which combination is most appropriate?
A) Rehost the DB server with MGN
B) DMS + Schema Conversion Tool (SCT) + CDC
C) Rehost to RDS Oracle and then shut down
D) Ship a dump with Snowball

**Answer: B**

Explanation: Oracle to PostgreSQL is a heterogeneous conversion, so differences in SQL dialect and PL/SQL must be converted. **SCT** automatically converts the schema and stored procedures to PL/pgSQL (items that cannot be converted are reported), and **DMS CDC** synchronizes both sides with a Full Load plus ongoing change capture based on transaction logs, supporting a near-zero-downtime cutover. A (MGN) only moves the OS and does not change the engine. C keeps Oracle, so the licensing cost remains, which goes against the goal. D is a one-time dump with no continuous synchronization or cutover. Trap: "heterogeneous + schema conversion + zero downtime" is SCT + DMS + CDC.

---

**Question 9.** 1 PB of on-premises data must be moved to S3 within 1 month. The internet connection is limited to 100 Mbps. Which approach is most appropriate?
A) Multiple Snowball Edge devices or Snowmobile
B) Online transfer with DataSync
C) Order Direct Connect and then do a one-time transfer
D) Parallelize S3 Multipart Upload

**Answer: A**

Explanation: By bandwidth math, 1 PB / 100 Mbps is about 1000 days, so a line transfer is impossible. You must ship physically with **multiple Snowball Edge devices (80 TB) or Snowmobile (petabyte scale)** (1 PB is about 13 to 14 Snowball Edge devices or 1 Snowmobile, decided by the cost and shipping time trade-off, and usually anything under 10 PB uses Snowball). B (DataSync) and D (Multipart) both depend on the line, so they are impossible at 100 Mbps. C (Direct Connect) is also just a line upgrade, cannot move 1 PB in 1 month, and DX provisioning takes weeks. Trap: "petabyte scale + limited bandwidth" is Snow physical shipment, not the line.

---

**Question 10.** A company wants to convert a 20-year-old Java EE monolith into microservices. It shares a single Oracle DB, and rewriting everything at once carries a high risk of business interruption. What is the safest incremental strategy?
A) Rewrite everything to Lambda in a big bang
B) Strangler Fig pattern + API Gateway routing + microservices starting with new features + gradual DB separation with DMS
C) Put the monolith as is into a single container with App2Container
D) Rehost the monolith as is to EC2 and stop

**Answer: B**

Explanation: The safe standard approach for decomposing a monolith is the **Strangler Fig pattern**. API Gateway routes requests to the old monolith or the new services, new features are peeled off first, and for the shared DB, the data of each domain is gradually migrated to a new DB with DMS (database-per-service). Each step is reversible, so the risk is distributed. A (big-bang rewrite) is high risk and is always a wrong-answer signal. C (containerizing the whole thing with A2C) is simple containerization (Replatform) rather than decomposition into microservices, so it falls short of the "microservice transition" goal. D (Rehost) is not modernization. Trap: "incremental decomposition + avoiding big-bang risk" is Strangler Fig.

---

**Question 11.** A company wants to automatically import Salesforce CRM data into S3 every day for analysis. What is the way to implement this with minimal code?
A) DMS
B) AppFlow
C) AWS Glue custom script
D) DataSync

**Answer: B**

Explanation: AppFlow is a codeless data integration tool between SaaS and AWS that provides native connectors for Salesforce, ServiceNow, Slack, and others, and lets you configure schedules, filters, and transformations in the console (it supports a "daily automatic" schedule). A (DMS) is DB migration, not SaaS API integration. C (Glue) is ETL, but integrating with Salesforce requires custom code, so it falls short of "minimal code." D (DataSync) is a file and object synchronization tool. Trap: "SaaS to AWS codeless integration" is AppFlow.

---

**Question 12.** In a multi-wave migration, you want to automatically collect and map the inventory of on-premises assets and the dependencies between applications. Which tool is most appropriate?
A) Migration Hub
B) Application Discovery Service
C) CloudFormation
D) Systems Manager Inventory

**Answer: B**

Explanation: ADS automatically collects on-premises assets with an agent (detailed performance and processes) or agentless (VMware vCenter integration), and **maps network communication between applications to automatically generate a dependency graph**, which becomes the input for wave planning. A (Migration Hub) is the higher-level console that receives ADS data and tracks stages, waves, and progress; it is not the inventory and dependency collector itself. C and D are not primarily for automatic collection of migration assets and dependency mapping. Trap: "automatic on-premises asset inventory + dependency graph" is ADS, and "integrated stage tracking" is Migration Hub.

---

**Question 13.** A company wants to migrate an on-premises MySQL 5.7 DB to RDS MySQL 8.0 (homogeneous) with near-zero downtime. Which approach is most appropriate?
A) Use DMS CDC only
B) SCT + DMS
C) Ship a dump with Snowball
D) Manual restore with mysqldump

**Answer: A**

Explanation: A homogeneous migration (MySQL to MySQL) needs no schema or dialect conversion, so **DMS alone without SCT** is sufficient. DMS copies the existing data with a Full Load and captures ongoing changes with CDC (binlog-based), synchronizing both sides until cutover, which compresses downtime to the moment of traffic switchover. B (adding SCT) is a wrong-answer trap that adds an unnecessary tool to a homogeneous migration. C (Snowball) and D (mysqldump) are one-time copies with no continuous synchronization or zero-downtime cutover. Trap: "Is SCT needed for a homogeneous migration?" No, DMS only.

---

**Question 14.** A company wants to move an on-premises VMware virtualization environment to AWS with minimal change while keeping its existing VMware operations tools and vSphere workflows as they are. Which R and service is it?
A) Rehost: MGN
B) Relocate: VMware Cloud on AWS
C) Refactor: ECS
D) Replatform: Elastic Beanstalk

**Answer: B**

Explanation: "Keep the VMware hypervisor and vSphere tools as they are + move everything" is the **Relocate** strategy, and **VMware Cloud on AWS** is the answer. It runs the VMware SDDC (vSphere, vSAN, NSX) as is on AWS bare metal, so the move happens without changing existing operating practices (migration with HCX). A (MGN Rehost) converts to EC2 and loses the VMware operations tools. C and D require application changes, which goes against "minimal change + keep VMware." Trap: "keep VMware as is" is Relocate (VMware Cloud on AWS).

---