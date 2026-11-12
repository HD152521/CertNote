# Day 3 - Cost Optimization Deep Dive — Reserved Capacity, Commitment Discounts, Unit Economics

Cost pillar often **underweighted by SAA**, but Pro recognizes it competes with Reliability/Performance. Optimization requires **unit economics thinking** not just total dollar reduction.

Core strategies:
- **Savings Plans vs RI vs On-Demand**: SP most flexible (3-year Compute/DDB), RI most aggressive discount, On-Demand pay-per-use
- **Spot**: 90% off, interruption tolerance (batch, CI, rendering), blend with on-demand for durability
- **Right-sizing**: Compute Optimizer flags over-provisioned instances, CloudWatch metrics reveal utilization
- **Data transfer**: VPC Endpoint (free S3/DDB from private subnet), CloudFront (cheaper egress), same-AZ communication
- **Storage tiering**: S3 Intelligent-Tiering (auto), Glacier (archive), cold tiers after 90 days
- **Database**: On-demand vs provisioned depends on utilization; DDB on-demand pricier/scalable, provisioned cheaper/predictable

Pitfall: **Optimizing for cost alone kills reliability.** Pro balances.

Key mappings: (1) "Multi-year commitment, predictable load" → **Savings Plans (most flexible)**, (2) "Spike load, fault-tolerant" → **Spot 90% + on-demand blend**, (3) "Minimize data transfer" → **VPC Endpoint + CloudFront**, (4) "Minimize storage" → **S3 Intelligent-Tiering + Glacier**.

[6 EXERCISES: Savings Plans vs RI decision, Spot blend strategy, Right-sizing ROI, Data transfer path optimization, Reserved capacity trade-offs]

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