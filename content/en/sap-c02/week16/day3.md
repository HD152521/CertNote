# Day 3 - Domain 3 Wrap-Up: Migration and Modernization (20%): The History of the 7Rs, Inside Block Replication and CDC, Bandwidth Math, and the Strangler Fig Pattern

SAP-C02 Domain 3, "Migration and Modernization," carries a 20% weight, and its essence is the question of "how do you move workloads from on-premises or another cloud to AWS (migration) and modernize them to be cloud-native (modernization)?" AWS formalized this as the **7R framework**, and each R has a defined toolset and internal working principles. The Pro exam asks "which R is this scenario, and how do you combine which tools?" You have to go beyond simple tool-name mapping and understand bandwidth math, replication mechanisms, and gradual decomposition strategies to solve variant questions.

Today we organize Domain 3 in depth as a 7R decision tree + the internals of the tools + modernization patterns + scenario mapping.

## The 7R Framework: History and Decision Tree of Migration Strategies

The roots of the 7Rs are the **5Rs** (Rehost, Refactor, Revise, Rebuild, Replace) presented in 2011 by Gartner analyst Richard Watson. AWS refined these into **6Rs** in 2016 (Retire, Retain, Rehost, Replatform, Repurchase, Refactor) and expanded to the **7Rs** in 2021 by adding **Relocate**. The key is that each R is one point on the spectrum of "migration cost vs. cloud-native value."

| R | Meaning | When to use | Representative tools |
|---|------|-----------|----------|
| **Retire** | Decommission | A system that is no longer used is discovered | Application Discovery Service |
| **Retain** | Keep for now | Unsuitable, low priority, or tied by licensing | - |
| **Relocate** | Move the same environment wholesale | VMware → VMware Cloud on AWS | VMware HCX |
| **Rehost** | Lift & Shift | Fast migration + minimal code changes | **MGN** |
| **Replatform** | Some changes (lift-tinker-shift) | Keep the DB engine + only the hosting becomes managed | DMS, Beanstalk, App2Container |
| **Repurchase** | Replace with commercial SaaS | Own ERP → Workday, CRM → Salesforce | AWS Marketplace |
| **Refactor** | Redesign to be cloud-native | Monolith → microservices and serverless | DMS+SCT, Lambda, ECS, Step Functions |

Choosing a 7R is an **optimization problem of "business value ÷ migration effort."** Toward the left (Retire, Rehost) the effort is smaller but the cloud value is also smaller (you run EC2 like a data center), and toward the right (Refactor) the effort and risk are larger but you gain true cloud-native benefits (serverless, autoscaling, managed). The model differs by cloud vendor: Microsoft Azure uses 5Rs (Rehost, Refactor, Rearchitect, Rebuild, Replace), and Google Cloud uses its own classification. AWS's 7Rs are the most granular. Key exam mappings: "Lift & Shift" = Rehost, "same DB engine + move to RDS" = Replatform, "decompose the monolith" = Refactor, "VMware as is" = Relocate.

> 🔍 **Going deeper**: The most important insight on the Pro exam is **"if there is a time constraint, Rehost first, then optimize incrementally on the cloud (then optimize)."** If the deadline is short, trying to Refactor from the start fails as schema conversion, app changes, and testing take months. Instead, quickly Rehost with MGN to close the data center first, and after moving to the cloud, pick only the high-business-value workloads to Replatform or Refactor. This is the "lift-and-shift then modernize" pattern, the standard approach validated by large migrations such as Capital One and GE.

**GE's retreat from the cloud vs. Capital One's success** (late 2010s) shows the light and shadow of 7R strategy. GE began with the ambition of moving 9,000 workloads, but migrated indiscriminately without governance or priorities and ended up moving a considerable number back on-prem. Capital One, by contrast, over 8 years from 2015 to 2020, **moved most things quickly by Rehost at first** and gradually evolved through Replatform (Oracle → Aurora, its own ELB → ALB) → Refactor (monolith → microservices and Lambda), eventually closing all of its own data centers. The lesson: don't Refactor everything at once; proceed gradually, dividing the work into waves.

## Tool Internals: The Mechanisms of MGN, DMS, and DRS

### MGN (Application Migration Service): Block-Level Continuous Replication

MGN installs an **agent** on the on-premises server to **continuously replicate the disks at the block level**. Its characteristic is that, while the source stays live and operating, it keeps synchronizing to an AWS staging area in the background and pauses briefly only at the moment of cutover to switch to EC2. Downtime is compressed to "the last delta sync + boot" (on the order of minutes).

MGN's block-level continuous replication is in essence **asynchronous replication + CDP (Continuous Data Protection)**. In principle it uses the same engine (based on the CloudEndure acquisition) as the DR service **Elastic Disaster Recovery (DRS)**: MGN is "move once and finish," and DRS is "keep replicating and stand by for DR"; only the purpose differs, and the technology is a sibling. That is why on the exam, "minimal downtime + moving the whole OS, one-time" is MGN, and "continuous replication on standby for disasters" is DRS. Both move the whole OS, app, and data (at the server level); they don't move only files (DataSync) or DB schemas (DMS).

### DMS + SCT: Zero-Downtime DB Migration with CDC

- **Homogeneous**: Oracle → Oracle on RDS, MySQL → MySQL, with DMS alone
- **Heterogeneous**: Oracle → Aurora PostgreSQL, SQL Server → MySQL, with **schema conversion by SCT** + **data migration by DMS**
- **CDC (Change Data Capture)**: Initial full load + ongoing change capture → zero-downtime cutover

The secret of DMS's zero downtime is that **CDC reads the source DB's transaction log**: it parses MySQL's binlog, Oracle's redo log, PostgreSQL's WAL, and SQL Server's transaction log to capture changes (INSERT/UPDATE/DELETE). This is as lightweight as a read replica, so the load on the source DB is small. The sequence: (1) copy the existing data whole with Full Load, (2) cache the changes that occurred during the Full Load and apply them, (3) afterward keep applying real-time changes with CDC to keep both sides in sync, (4) at cutover, switch app traffic to the new DB and terminate DMS. Downtime is compressed to the moment of the traffic switch. Trap: **SCT is unnecessary for a homogeneous migration**: SCT is for converting SQL dialects and stored procedures, so there is no use for it between the same engine.

(Hypothetical case) A fintech migrated from Oracle Database Enterprise Edition (license costing hundreds of millions of won a year) to Aurora PostgreSQL. **PL/SQL → PL/pgSQL conversion with SCT** (70% automatic, 30% manual; SCT flags unconvertible items in an Assessment Report), **both sides synchronized for 6 months with DMS CDC**, and a cutover on a weekend. Result: zero license cost + improved performance. It is a typical Refactor case, and "heterogeneous DB + schema conversion" is always the SCT+DMS combination.

### DataSync vs. Snow Family: Bandwidth Is Time

| Tool | Capacity | Time | Used for |
|------|------|------|--------|
| DataSync | A few GB ~ tens of TB | Depends on the line | Sufficient line, online synchronization |
| Snowcone | 8TB | A week of shipping | Small volume + insufficient line, edge |
| Snowball Edge | 80TB (storage optimized) | A week of shipping | Large volume + insufficient line |
| Snowmobile | 100PB | Weeks of shipping | Exabyte/petabyte-scale bulk migration |

> ⚠️ **Trap**: The hidden variable in migration is **bandwidth math**. Time to move over the line = data volume ÷ effective bandwidth. For example, 1PB ÷ 100Mbps ≈ 1000 days (impossible), and 100TB ÷ 10Gbps ≈ 22 hours (theoretical; effective is 2 to 3 times that). So for "tens to hundreds of TB + limited bandwidth," the standard is a hybrid: **ship the initial bulk physically with Snow, then synchronize only the delta online with DataSync/DMS**. Answering "1PB + 100Mbps + 1 month" with DataSync is a trap: it is impossible over the line, so it is multiple Snowball Edges or a Snowmobile (usually Snowball under 10PB, Snowmobile above). Note: new orders for Snowmobile were halted in 2024, but conceptually for the exam it remains the symbol of petabyte-scale truck shipping.

### App2Container, AppFlow, and Migration Hub

- **App2Container (A2C)**: Automatically analyzes Java (Tomcat, JBoss) and .NET apps → generates a Docker image → ECS/EKS deployment manifests (Replatform containerization)
- **AppFlow**: Codeless data integration between SaaS (Salesforce, Slack, ServiceNow, Google Analytics) ↔ AWS (S3, Redshift)
- **Migration Hub**: Integrated tracking of Discovery → Planning → Migration → Validation + a 7R recommendation per asset (Strategy Recommendations)
- **Application Discovery Service (ADS)**: Automatic collection of the on-prem inventory (agent = detailed / agentless = VMware vCenter integration) + automatic dependency graph generation

**Migration wave planning** is the core of migration governance. Instead of moving all workloads at once, you proceed gradually, dividing into wave 1, 2, 3 **based on the dependency graph**: tightly coupled systems (apps sharing the same DB) go in the same wave, and systems with no dependencies move first. ADS automatically maps the network communication between apps to build the dependency graph, and Migration Hub handles wave assignment and progress tracking. This is the standard way to reduce the risk of a "big-bang migration."

## Modernization Patterns: Safely Decomposing a Monolith

### The Strangler Fig Pattern: Gradual Strangling

Rewriting a monolith all at once (big-bang) is high-risk (Knight Capital and several failed ERP rewrites prove it). The **Strangler Fig pattern** (Martin Fowler, 2004, derived from the fig tree that wraps around its host and slowly strangles it) leaves the monolith in place and builds new functionality as microservices first, branching requests to the old monolith or the new services through an API Gateway/Proxy. Over time, functions move to new services one by one and the monolith is "strangled."

```
[Monolith EC2 + Oracle]
        ↓ Refactor (gradual)
[API Gateway branching] → Old features: monolith / New features: Lambda, Fargate
[Aurora + DynamoDB] [Step Functions workflow]
```

> 🎯 **Scenario**: "A company wants to convert a 20-year-old Java EE monolith (sharing a single Oracle DB) into microservices. Rewriting all at once carries a large risk of business interruption. How do you decompose it gradually?" Answer: **Strangler Fig pattern + API Gateway routing + microservices on Lambda/Fargate starting with new features + gradually separate the DB too with DMS (database-per-service)**. The API Gateway branches requests to the monolith or the new services, new features are peeled off first, and the DB gradually migrates the relevant domain's data to a new DB (Aurora/DynamoDB) with DMS. Since you don't move all functions at once, each step is reversible and risk is spread out. A "big-bang rewrite" is a wrong-answer signal.

The hard part of decomposing a monolith is not the code but the **shared database**. The principle of microservices is "each service has its own DB (database-per-service)," but a monolith usually shares one giant DB. When decomposing, if a transaction boundary crosses services, a **distributed transaction** problem arises: 2PC (2-phase commit) hurts availability and is avoided in the cloud, and instead the **Saga pattern** (eventually achieving consistency through compensating transactions) is implemented with Step Functions. When "distributed transactions and compensation logic across microservices" appears, Step Functions Saga is the right direction.

## Scenario Keyword → Answer Mapping

| Keyword | Answer | One-line rationale |
|--------|------|-----------|
| "200 VMs Lift & Shift + short downtime" | MGN | Block-level continuous replication |
| "On-prem + ongoing DR to AWS" | DRS | Continuous replication, standby |
| "Oracle → Aurora PostgreSQL" | DMS + SCT | Heterogeneous, schema conversion |
| "SQL Server → MySQL (heterogeneous)" | SCT + DMS | Dialect conversion + CDC |
| "MySQL → RDS MySQL (homogeneous)" | DMS only | SCT is unnecessary for homogeneous |
| "Zero-downtime DB migration" | DMS CDC | Transaction log capture |
| "1PB + 100Mbps line + 1 month" | Multiple Snowball Edges / Snowmobile | Impossible over the line by bandwidth math |
| "Tens of TB + sufficient line" | DataSync | Online synchronization |
| "Containerize a Java EE monolith" | App2Container | Automatic Dockerization |
| ".NET → Fargate" | App2Container | Automatic analysis and deployment |
| "Salesforce → S3 integration" | AppFlow | Codeless SaaS connector |
| "Integrated tracking of migration stages" | Migration Hub | Wave and progress visualization |
| "Automatic on-prem asset inventory and dependencies" | Application Discovery Service | Dependency graph |
| "Monolith → gradual microservices" | Strangler Fig + API Gateway | Avoiding big-bang |
| "Distributed transactions across microservices" | Step Functions Saga | Compensating transactions |
| "VMware → VMware on AWS" | VMware Cloud on AWS (Relocate) | Hypervisor as is |

## Summary

Domain 3 hinges on **instant 7R answers + understanding tool internals + bandwidth math**. Insights: (1) with a time constraint, Rehost (MGN) first, then Refactor incrementally on the cloud, as GE's failure vs. Capital One's success proves, (2) MGN is block continuous replication (= a sibling engine of DRS), DMS CDC reads the transaction log for zero downtime, and SCT is added only for heterogeneous, (3) "tens to hundreds of TB + limited bandwidth" is a hybrid of Snow + an online delta, since PB over the line is impossible, (4) don't big-bang rewrite a monolith: strangle it gradually with the Strangler Fig, and separate the shared DB with database-per-service + Saga. Exam trap: "Is SCT needed for a homogeneous migration?" → No, DMS alone is enough.

Tomorrow (Day 79) we wrap up Domain 4, continuous improvement (observability, automation, SRE), together with SRE theory.

---

## 📝 Practice Questions

**Question 1.** You need to Lift & Shift about 200 VMware VMs from an on-premises data center to AWS within 6 months, minimizing each server's downtime to the order of minutes. The source keeps operating until cutover. What is the most suitable tool?

A) AWS DataSync

B) AWS Application Migration Service (MGN)

C) AWS Snowball only

D) AWS Database Migration Service (DMS)

**Answer: B**

Explanation: "Whole-server (OS + app + data) Lift & Shift + minimal downtime + continuous replication while the source runs" is MGN's domain. MGN continuously replicates the disks at the block level with an agent and pauses only at the moment of cutover to switch to EC2, compressing downtime to "the last delta + boot." A (DataSync) transfers files and objects, so it doesn't move whole servers. C (Snowball alone) is good for the initial bulk shipment but has no continuous replication or minimal-downtime cutover. D (DMS) is a DB engine migration tool. Trap: "whole OS + minimal downtime + one-time" is MGN (for ongoing DR, DRS).

---

**Question 2.** You are migrating an on-prem Oracle 11g database to Aurora PostgreSQL to eliminate licensing costs. Stored procedure (PL/SQL) and schema conversion is needed, and the cutover must be close to zero downtime. What is the most suitable combination?

A) Rehost the DB server with MGN

B) DMS + Schema Conversion Tool (SCT) + CDC

C) Rehost to RDS Oracle and finish

D) Ship a dump with Snowball

**Answer: B**

Explanation: Oracle → PostgreSQL is a heterogeneous conversion, so SQL dialect and PL/SQL differences must be converted. **SCT** automatically converts the schema and stored procedures to PL/pgSQL (reporting the items it can't), and **DMS CDC** synchronizes both sides with Full Load + ongoing change capture based on the transaction log, supporting a zero-downtime cutover. A (MGN) only moves the OS and is not an engine conversion. C keeps Oracle, so the license cost remains and contradicts the goal. D is a one-time dump with no ongoing sync or cutover. Trap: "heterogeneous + schema conversion + zero downtime" is SCT+DMS+CDC.

---

**Question 3.** You must move 1PB of on-prem data to S3 within 1 month. The internet line is limited to 100Mbps. What is the most suitable approach?

A) Multiple Snowball Edge devices or a Snowmobile

B) Online transfer with DataSync

C) Apply for Direct Connect and do a one-time transfer

D) Parallelize S3 Multipart Upload

**Answer: A**

Explanation: By bandwidth math, 1PB ÷ 100Mbps ≈ 1000 days, so transfer over the line is impossible. You must ship physically with **multiple Snowball Edge (80TB) devices or a Snowmobile (petabyte scale)** (1PB is about 13 to 14 Snowball Edge devices or 1 Snowmobile, decided by the cost and shipping time trade-off, and usually Snowball under 10PB). B (DataSync) and D (Multipart) both depend on the line, so they are impossible at 100Mbps. C (Direct Connect) is also just a line upgrade and can't move 1PB in 1 month, and DX provisioning takes weeks. Trap: "petabyte scale + limited bandwidth" is Snow physical shipping, not the line.

---

**Question 4.** A company wants to convert a 20-year-old Java EE monolith into microservices. It shares a single Oracle DB, and rewriting all at once carries a large risk of business interruption. What is the safest gradual strategy?

A) Rewrite everything in Lambda in a big-bang

B) Strangler Fig pattern + API Gateway routing + microservices starting with new features + gradually separate the DB with DMS

C) Put the monolith as is into a single container with App2Container

D) Rehost the monolith as is to EC2 and finish

**Answer: B**

Explanation: The safe standard for decomposing a monolith is the **Strangler Fig pattern**. The API Gateway branches requests to the old monolith or the new services, new features are peeled off first, and the shared DB gradually migrates the relevant domain's data to a new DB with DMS (database-per-service). Each step is reversible, so risk is spread out. A (big-bang rewrite) is high-risk and always a wrong-answer signal. C (wholesale containerization with A2C) is simple containerization (Replatform), not microservice decomposition, so it falls short of the "microservice conversion" goal. D (Rehost) is not modernization. Trap: "gradual decomposition + avoiding big-bang risk" is Strangler Fig.

---

**Question 5.** You want to automatically import Salesforce CRM data into S3 every day for analysis. To implement it with minimal code, what should you use?

A) DMS

B) AppFlow

C) AWS Glue custom script

D) DataSync

**Answer: B**

Explanation: AppFlow is a codeless SaaS ↔ AWS data integration tool that provides native connectors for Salesforce, ServiceNow, Slack, and more, with schedules, filters, and transformations configured in the console (it supports a "daily automatic" schedule). A (DMS) is DB migration, not SaaS API integration. C (Glue) is ETL, but connecting to Salesforce needs custom code, so it falls short of "minimal code." D (DataSync) is a file and object synchronization tool. Trap: "SaaS → AWS codeless integration" is AppFlow.

---

**Question 6.** In a multi-wave migration, you want to automatically collect and map the on-prem asset inventory and the dependencies between applications. What is the most suitable tool?

A) Migration Hub

B) Application Discovery Service

C) CloudFormation

D) Systems Manager Inventory

**Answer: B**

Explanation: ADS automatically collects on-prem assets with an agent (detailed performance and processes) or agentless (VMware vCenter integration), and **maps the network communication between applications to automatically generate a dependency graph**, and this graph becomes the input to wave planning. A (Migration Hub) is a higher-level console that receives ADS data and tracks stages, waves, and progress, and is not the inventory and dependency collector itself. C and D are not primarily for automatically collecting migration assets and mapping dependencies. Trap: "automatic on-prem asset inventory + dependency graph" is ADS, and "integrated tracking of stages" is Migration Hub.

---

**Question 7.** You want to migrate an on-prem MySQL 5.7 DB to RDS MySQL 8.0 (homogeneous) with near-zero downtime. What is the most suitable approach?

A) Use DMS CDC only

B) SCT + DMS

C) Ship a dump with Snowball

D) Manual restore with mysqldump

**Answer: A**

Explanation: A homogeneous migration (MySQL → MySQL) needs no schema or dialect conversion, so **DMS alone without SCT** is enough. DMS copies the existing data with Full Load and captures ongoing changes with CDC (binlog-based) to synchronize both sides up to cutover, compressing downtime to the moment of the traffic switch. B (adding SCT) is a trap wrong answer that adds an unnecessary tool to a homogeneous migration. C (Snowball) and D (mysqldump) are one-time copies with no ongoing sync or zero-downtime cutover. Trap: "Is SCT needed for a homogeneous migration?" → No, DMS only.

---

**Question 8.** You want to move an on-premises VMware virtualization environment to AWS with minimal changes while keeping the existing VMware operational tools and vSphere workflows as they are. Which R and service is this?

A) Rehost: MGN

B) Relocate: VMware Cloud on AWS

C) Refactor: ECS

D) Replatform: Elastic Beanstalk

**Answer: B**

Explanation: "Keep the VMware hypervisor and vSphere tools as they are + move wholesale" is the **Relocate** strategy, and **VMware Cloud on AWS** is the answer: it runs the VMware SDDC (vSphere, vSAN, NSX) as is on AWS bare metal, moving without changing existing operating methods (migrating with HCX). A (MGN Rehost) converts to EC2 and loses the VMware operational tools. C and D require app changes, which contradicts "minimal changes + keep VMware." Trap: "keep VMware as is" is Relocate (VMware Cloud on AWS).

---
