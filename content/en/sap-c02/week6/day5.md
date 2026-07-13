# Day 5 - Week 6 Review: Integrated Migration Strategy Scenarios

Week 6 covered the entire cloud migration process: the decision-making framework 7R (Day 1), standard server transfer tools MGN and DRS (Day 2), the science of DB migration with DMS+SCT (Day 3), and acceleration tools completing the ecosystem (Day 4). These four days form the core of SAP-C02 Domain 3 (Migration & Modernization, 20%).

Common Domain 3 patterns: "Long scenarios with multiple tools appearing, requiring precise tool role distinction to choose the correct answer." Today we compress core concepts into decision trees and solidify real-world skills through 12 complex scenarios.

## 7R Decision Tree: Choosing R from Scenarios

7R is not memorization but scenario classification. Understanding each R's "entry conditions" via decision tree is essential.

```
Question 1: Is there reason to continue using this system?
  NO → Retire (decommission)
  YES → Next

Question 2: Does migration lack ROI or is on-premises mandatory per regulation?
  YES → Retain (keep as-is)
  NO → Next

Question 3: Must VMware vCenter be maintained as-is?
  YES → Relocate (VMware Cloud on AWS)
  NO → Next

Question 4: Is quick transfer without code changes top priority?
  YES → Rehost (lift-and-shift, MGN)
  NO → Next

Question 5: DB engine or OS change with minimal code fixes?
  YES → Replatform (DMS+SCT, MGN)
  NO → Next

Question 6: Is SaaS product conversion more sensible?
  YES → Repurchase (Salesforce, ServiceNow, etc.)
  NO → Next

Question 7: Redesign architecture to microservices/serverless?
  YES → Refactor/Re-architect (A2C, Refactor Spaces, Lambda redevelopment)
```

> ⚠️ **Critical Distinction**: Replatform vs Refactor boundary.
> - Replatform: **code unchanged**, replace infrastructure layer only. "Oracle → Aurora (code unmodified)", "EC2-based app → ECS (Docker only)"
> - Refactor: **code also changes**, architecture redesigned. "Monolith → Lambda+DynamoDB", "REST API → event-driven architecture"
> Edge case: "Oracle → Aurora PostgreSQL with PL/SQL converted to PostgreSQL functions" → Even if SCT auto-converts, code transformation occurs, so technically Replatform (infra + some code). SAP exam primarily distinguishes by code change presence.

## Final Tool Mapping Table

| Scenario | Tool Combination | Reason |
|---------|---------|------|
| Rapid entire server transfer | **MGN** | Block-level replication, Cutover minutes |
| Homogeneous DB transfer (MySQL→Aurora MySQL) | **DMS only** | No schema conversion needed |
| Heterogeneous DB transfer (Oracle→Aurora PG) | **DMS + SCT** | Schema and code conversion required |
| SQL Server T-SQL minimal changes | **Babelfish** + MGN | Use T-SQL as-is |
| .NET Framework → .NET Core porting | **Porting Assistant** | Code compatibility analysis and conversion |
| Java/.NET app → containerization | **App2Container (A2C)** | Auto-generate Dockerfile, ECS task def |
| VMware vCenter as-is to AWS | **VMware Cloud on AWS** | vCenter API retained, Relocate |
| On-premises servers protected by AWS DR | **DRS** | Continuous replication + Failback |
| Post-migration DR reverse | **DRS** | DR region EC2 → on-premises replication |
| Monolith → microservices gradual transition | **Refactor Spaces** | Strangler Fig traffic routing |
| EoS Windows 2003/2008 app compatibility | **EMP** | Compatibility package wrapping |
| Windows Server App → modern Windows | **EMP + MGN** | Compatibility + transfer |
| Large data offline transfer | **Snow Family** | Internet bandwidth insufficient |
| File/object storage transfer | **DataSync** | NFS, SMB, S3, EFS |

> 💡 **Related Theory**: In migration, data consistency (Consistency) is mandatory, not optional. ACID (Atomicity, Consistency, Isolation, Durability) properties in OLTP DBs mean how open transactions are handled during migration is critical. DMS reads DB engines' transaction logs (Oracle Redo Log, MySQL binlog, SQL Server CDC, PostgreSQL WAL) to capture changes per transaction. MGN's block-level replication doesn't recognize transaction boundaries, so DB migration via DMS is Best Practice.

## Homogeneous vs Heterogeneous Migration Decision Basis

```
Are engines the same?
  MySQL → Aurora MySQL → DMS only
  PostgreSQL → Aurora PostgreSQL → DMS only
  Oracle → RDS Oracle → DMS only

Are engines different?
  Oracle → Aurora PostgreSQL → SCT (schema) + DMS (data)
  SQL Server → Aurora PostgreSQL → SCT + DMS
  MongoDB → DynamoDB → DMS (NoSQL→NoSQL, SCT unnecessary)
  SQL Server → Aurora MySQL Babelfish → Babelfish (T-SQL compatibility layer)

Same engine but significantly different versions?
  MySQL 5.6 → Aurora MySQL 3.x (MySQL 8.0 compatible) →
  DMS transfer only, but pre-test string functions and system variable changes
```

### Understanding SCT Conversion Quality

SCT (Schema Conversion Tool) auto-converts schemas between heterogeneous engines, but conversion rate isn't complete.

```
SCT Assessment Report example:
  Auto-convertible: 75%
  Manual fixes needed: 20% (complex PL/SQL functions, package dependencies)
  Unsupported: 5% (DB-specific features, custom C extensions)

Practical lessons:
- Lower SCT conversion rate → higher Refactor cost
- Many Oracle-specific hints, DB links, partitioning → difficult conversion
- Run SCT Assessment upfront to predict effort
```

> 🔍 **Deeper Dive**: DMS CDC minimal-downtime migration pattern. Full Load alone prolongs downtime on large DBs. Full Load + CDC combination: (1) Full Load transfers existing data (source still operating), (2) After Full Load, CDC continuously applies changes, (3) When lag shrinks to seconds → brief app shutdown → final CDC reflection → switch. This pattern enables multi-TB DB transfer within minutes downtime. On SAP exam, "minimal-downtime DB migration" always means DMS Full Load + CDC pattern.

## MGN vs DMS Selection Final Summary

```
Transfer target is "entire server (OS + app + middleware)"?
  YES → MGN

Transfer target is "DB data"?
  YES → DMS (homogeneous) or DMS+SCT (heterogeneous)

Can DB server be transferred via MGN?
  Technically possible but not Best Practice.
  Reason: Open transactions during replication → potential data inconsistency
  Recommended: App servers → MGN, DB → DMS

Both needed?
  700 app servers → MGN (parallel)
  100 Oracle DBs → SCT+DMS (parallel)
  → Coordinate with Migration Hub Orchestrator
```

## A2C (App2Container) Advanced: Containerization Automation

A2C analyzes Java, .NET (IIS) based apps to auto-generate Docker images and ECS/EKS deployment artifacts.

**A2C operation sequence**:
```
1. Discover (analyze app)
   $ app2container discover --target-container-id app-001
   └── Analyze running app process, port, dependencies, environment vars

2. Extract (extract)
   $ app2container extract --application-id java-app:1234
   └── Extract app files, config, runtime to tar package

3. Containerize (containerization)
   $ app2container containerize --application-id java-app:1234
   └── Generate Dockerfile, build Docker image, push to ECR
   └── Generate ECS Task Definition or EKS Helm Chart

4. Generate Pipeline (CI/CD pipeline)
   $ app2container generate app-deployment \
     --application-id java-app:1234 \
     --deploy-target ecs
   └── Generate CodePipeline + CodeBuild CloudFormation
```

> 📚 **Case Study**: A2C's limitations. A Korean SI company containerized a legacy Java EE app (JBoss 4.2 based) via A2C. Specific JBoss 4.2 JMX configuration and EJB remote calls didn't work in container environment. A2C puts the app "as-is" in containers but doesn't make it container-friendly. Legacy apps storing server state in files, JVM heap configs conflicting with container memory are typical A2C post-work targets.

## EKS Anywhere vs AWS Outposts: Hybrid Kubernetes

After containerization covered in Day 4's migration tools, comes "where to deploy?" choice.

| Item | EKS Anywhere | AWS Outposts |
|------|-------------|-------------|
| Hardware | Customer-owned servers (VMware, Bare Metal) | AWS-designed and shipped racks |
| Control Plane | Direct on-premises operation | AWS managed |
| AWS service integration | Limited (EKS Connector partial) | Most integrated (EC2, EBS, S3, RDS, etc.) |
| Suitable situation | Reuse existing on-premises infra, minimize AWS dependency | AWS managed services needed on-premises |
| Data sovereignty | ✅ Data processed on-premises | ✅ Data processed at customer site |
| Pricing | EKS license cost | Outposts hardware lease (millions monthly) |

> 🎯 **Scenario classification**:
> - "Deploy Kubernetes to existing on-premises servers and manage unified from AWS console" → EKS Anywhere
> - "Hospital internal patient data must never leave site but need RDS" → Outposts
> - "Finance regulations require data processing in domestic data center only" → Outposts or EKS Anywhere (depends on regulation details)

## Entire Migration Pipeline Flow

Organize enterprise migration end-to-end pipeline:

```
[Phase 1: Discover & Assess]
  ADS (Application Discovery Service)
  └── Agentless Collector (VMware environment)
  └── Discovery Agent (physical servers, other clouds)
  └── Inventory: CPU, memory, disk, network dependencies

  DMS Fleet Advisor
  └── DB server specialized inventory
  └── Schema complexity, conversion feasibility assessment

  Migration Evaluator
  └── On-Demand vs Savings Plans comparison
  └── 5-year TCO savings projection

  Migration Hub Strategy Recommendations
  └── Per-server 7R auto-recommendation (Refactor/Replatform/Rehost...)

[Phase 2: Plan & Mobilize]
  MAP (Migration Acceleration Program)
  └── AWS partners + funding support + training
  └── Assess → Mobilize → Migrate 3-stage

  Migration Hub
  └── Unified tracking of all migration progress

[Phase 3: Migrate]
  Server transfer:
  MGN (Rehost → EC2) + DRS (continuous DR)

  DB transfer:
  DMS + SCT (heterogeneous) or DMS (homogeneous)
  DataSync (file/object storage)
  Snow Family (large offline)

  Containerization:
  App2Container (Java, .NET)
  Porting Assistant (.NET Core porting)
  EMP (EoS Windows)

[Phase 4: Modernize]
  Refactor Spaces (gradual microservices separation)
  EKS / ECS (container orchestration)
  Lambda / EventBridge (serverless event-driven)
  Serverless Application Model (SAM)

[Phase 5: Optimize]
  Compute Optimizer (Right-Sizing)
  Savings Plans / Reserved Instances (cost commitment)
  Trusted Advisor (overall recommendations)
  Well-Architected Tool (6 Pillar review)
```

## Key Comparison Table: Pre-Exam Check

| Comparison | A | B | Difference Basis |
|--------|---|---|---------|
| MGN vs DMS | Entire server (OS+app) | DB data only | Transfer unit |
| MGN vs DRS | One-time migration | Continuous DR + Failback | Purpose |
| Homogeneous DMS vs Heterogeneous SCT+DMS | No schema conversion | SCT converts | Engine compatibility |
| A2C vs Porting Assistant | OS as-is to container | Code ported to .NET Core | Code change presence |
| ADS vs Migration Evaluator | Technical inventory | Financial TCO | Analysis dimension |
| ADS Agentless vs Agent | VMware-only, agentless | All OS, install needed | Environment |
| Migration Hub vs MAP | Tracking tool | Funding and consulting program | Tool vs program |
| Relocate vs Rehost | VMware as-is | OS and app as-is to EC2 | Hypervisor retained |
| Refactor vs Replatform | Code and architecture redesigned | Code unchanged, infra replaced | Code change presence |
| DRS vs MGN | Continuous DR (RPO seconds) | One-time migration | Migration vs continuous DR |
| Babelfish vs SCT+DMS | T-SQL compatibility layer | Complete conversion post-portability | Minimal change vs complete portability |
| EKS Anywhere vs Outposts | Reuse customer hardware | AWS managed hardware | Hardware ownership |

---

## 📝 12 Scenario Practice Questions

**문제 1.** Large retailer must migrate 800 physical servers (700 app + 100 Oracle DB) to AWS within 6 months. Replace Oracle with Aurora PostgreSQL; quickly migrate app servers to EC2. Best tool combination?

A) MGN (all) + RDS Oracle (DB)
B) MGN (700 apps) + DMS+SCT (100 Oracle DB → Aurora PG)
C) App2Container (all) + DMS (DB)
D) Refactor Spaces (all) + Babelfish (DB)

**정답: B**
700 app servers = Rehost → MGN (block-level replication, no code change). 100 Oracle DB → Aurora PG = Replatform → DMS (data replication) + SCT (heterogeneous schema and PL/SQL conversion). A: Oracle license cost continues, no TCO improvement. C: A2C targets apps only, DB servers unsuitable. D: Refactor Spaces is monolith→microservices tool; Babelfish is SQL Server compatible (Oracle unsupported).

---

**문제 2.** ADS discovered 3,000 servers, 500 showing avg CPU < 3%, no traffic, last login 2 years ago. Remaining 2,500 active. 7R strategy for 500?

A) Retain (on-premises, regulatory)
B) Rehost (EC2 transfer, monitor)
C) Retire (decommission)
D) Repurchase (SaaS conversion)

**정답: C**
"Unused systems" = Retire. ADS found CPU < 3% + no traffic + 2-year no login means systems effectively abandoned. Transferring unused systems to cloud wastes cost. Retain needs explicit reasons (regulation, dependency, no migration ROI). Simple abandonment = Retire. Pre-migration Retire judgment reduces transfer targets to 2,500—itself cost optimization.

---

**문제 3.** Financial company with SQL Server hosting .NET Framework 4.6 app wants AWS transfer + SQL Server license removal with minimal code change. Limited dev resources, no large rewrites possible. Most realistic combination?

A) Porting Assistant for .NET Core porting + RDS PostgreSQL
B) App2Container containerization + RDS SQL Server
C) Aurora PostgreSQL Babelfish (DB) + MGN (app EC2)
D) DMS+SCT (DB) + Refactor Spaces (app)

**정답: C**
Minimal code change + SQL Server license removal = Babelfish. .NET app connecting via SQL Server driver to Babelfish runs T-SQL as-is. App servers → MGN for EC2 Rehost (no code change). A: Porting Assistant → .NET Core porting requires code modification (low dev resource condition unmet). B: SQL Server license continues (goal unmet). D: SCT conversion effort + Refactor Spaces development cost incurred.

---

**문제 4.** Enterprise migration kickoff. Executives ask "5-year TCO savings?" Teams ask "Which 7R per server?" AWS services satisfying both?

A) Cost Explorer + Trusted Advisor
B) Migration Evaluator (TCO) + Migration Hub Strategy Recommendations (7R recommendation)
C) AWS Pricing Calculator + Compute Optimizer
D) AWS Budgets + AWS Config

**정답: B**
5-year TCO comparison = Migration Evaluator. Analyzes current on-premises cost, calculates expected AWS post-migration cost, presents 5-year savings. Per-server 7R auto-recommendation = Migration Hub Strategy Recommendations. Based on ADS data, auto-recommends Retire/Retain/Rehost/Replatform per server. Cost Explorer analyzes already-AWS spending; Trusted Advisor recommends operating environments—both differ from migration Assess phase.

---

**문제 5.** 500 VMs migrated to VMware Cloud on AWS (Relocate). After 6 months, VMware licensing costs remain high. Next step?

A) Renegotiate VMware/AWS VMC subscription license unit price (architecture unchanged)
B) MGN transfer VMC VMs to EC2 native (Relocate → Rehost)
C) Immediately Refactor all 500 VMs to Lambda + DynamoDB serverless redesign
D) Keep VMC, only Compute Optimizer Right-Sizing to review cost

**정답: B**
Relocate → Rehost is natural cloud journey next step. VMC is intermediate stage for rapid on-premises VMware transfer to AWS. EC2 native transfer removes VMware license. MGN installs agents on VMs running atop VMC and operates. C: Immediate Refactor requires massive development cost/time, unsuitable as "next step."

---

**문제 6.** Large monolithic Java app (2M lines) in microservices transition. Operate existing monolith while developing new order management module first as microservice, then gradually transition order API traffic from monolith to new service. Which service manages routing automation?

A) AWS App Mesh
B) AWS Migration Hub Refactor Spaces
C) Amazon API Gateway (manual setup)
D) AWS Cloud Map

**정답: B**
Strangler Fig pattern + gradual monolith-to-microservice traffic transition = Refactor Spaces. Register new order service URL in Refactor Spaces, auto-configures API Gateway and VPC links. Adjust traffic ratio (e.g., 10% → 50% → 100%) from console. App Mesh: microservices environment service-to-service traffic management; Cloud Map: service registration/discovery.

---

**문제 7.** 1,000 VMware VM CPU/memory usage and TCP dependency collection without agents to design Waves. vCenter environment, no agent install desired. Suitable tool?

A) DMS Fleet Advisor
B) ADS Agentless Collector (vCenter virtual appliance)
C) ADS Discovery Agent (install per VM)
D) AWS Systems Manager Inventory

**정답: B**
VMware vCenter + agentless + CPU/memory/network dependency = ADS Agentless Collector. Deploy virtual appliance in vCenter, collects all VMware VM metrics and TCP connections without agents at ESXi level. Fleet Advisor: DB specialized; Discovery Agent: per-VM install (agentless condition unmet); SSM Inventory: AWS EC2 only.

---

**문제 8.** MySQL 5.7 → Aurora MySQL 2.x (MySQL 5.7 compatible) migration with 100 stored procedures. Which between DMS and SCT needed?

A) DMS + SCT both (MySQL also heterogeneous)
B) DMS only (homogeneous engine, no schema conversion)
C) SCT only (stored procedure conversion)
D) MGN server-as-is

**정답: B**
MySQL → Aurora MySQL = homogeneous engine (MySQL compatible). SCT is heterogeneous engine schema and code conversion tool. Aurora MySQL compatible with MySQL 5.7/8.0, so MySQL stored procedures, triggers, views run mostly as-is. DMS Full Load + CDC only needed. D: MGN technically possible but DMS is DB migration Best Practice (transaction consistency guaranteed).

---

**문제 9.** Migration manager running MGN 150, DMS 30, partner tool 20 simultaneously. Manage each server "Discovery → Ready → Testing → Cutover Complete" state and Wave-by-Wave progress in one console, including wave dependency automation. Which service?

A) CloudWatch Dashboards
B) AWS Migration Hub + Migration Hub Orchestrator
C) AWS Service Catalog
D) AWS Config + Systems Manager

**정답: B**
Unified migration progress tracking = Migration Hub. Wave-by-wave state management and stage workflow automation (Test Launch → manual approval → Cutover → validation) = Migration Hub Orchestrator. CloudWatch: operational metric monitoring; Service Catalog: product catalog; Config+SSM: compliance and operations.

---

**문제 10.** Post-migration EC2 instances over-provisioned per source server specs. CPU avg 15%, memory 40%. Want instance type downsizing recommendations. Which service?

A) AWS Cost Explorer
B) AWS Compute Optimizer
C) AWS Trusted Advisor (cost category)
D) AWS Pricing Calculator

**정답: B**
Actual CPU/memory/network usage pattern based instance Right-Sizing recommendation = Compute Optimizer. Analyzes CloudWatch metrics for min 2 weeks, provides specific recommendations (e.g., m5.2xlarge → m5.large). Cost Explorer: cost trend analysis, not instance type recommendation. Trusted Advisor cost category: finds idle instances but Compute Optimizer more detailed type recommendation.

---

**문题 11.** Company completed on-premises to AWS migration. Remaining on-premises data center to be used as AWS service DR site. Possible configuration?

A) Reinstall MGN in reverse—AWS EC2 source, on-premises block-level continuous replication
B) Configure DRS with AWS EC2 source, on-premises DR target (reverse replication)
C) AWS doesn't support on-premises as DR target; use different AWS region
D) AWS DataSync copy EC2 EBS volume data to on-premises NFS, schedule-based periodic

**정답: B**
DRS supports not only on-premises source case but also AWS EC2 source, on-premises (or different AWS region) as DR target reverse direction. "AWS to On-Prem DR" pattern. MGN: one-way migration tool, unsuitable for continuous DR replication. DataSync: file/object storage transfer tool, not server DR replication.

---

**문제 12.** Company received Well-Architected migration review. "Domain 3: Migration and Modernization missing minimal-downtime DB migration design." 10TB Oracle DB → Aurora PostgreSQL within 2-hour downtime. Best Practice design?

A) Oracle Dump → S3 → Aurora import (Full Load only)
B) Oracle Data Pump initial transfer + DMS CDC change sync → cutover at seconds lag, brief downtime
C) Install Aurora on same server as Oracle for real-time replication
D) Snowball Edge offline transfer, then switch

**정답: B**
Minimal-downtime DB migration standard pattern: (1) SCT schema conversion, (2) DMS Full Load transfers 10TB (source continues), (3) Post-Full Load, DMS CDC continuously applies changes, (4) When lag shrinks to seconds → brief app stop → final CDC reflection → Aurora connection switch. Total downtime: minutes to tens of minutes. A: Full Load only, all source writes during 10TB transfer lost → downtime entire transfer duration (tens of hours). D: Snowball for S3 data transfer; DB unsupported.

---
