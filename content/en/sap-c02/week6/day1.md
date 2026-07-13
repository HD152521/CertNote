# Day 1 - 7R Migration Strategies: Decision Language for Cloud Migration

"Migrating to the cloud" is far less clear than it sounds. Does it mean moving servers as-is, changing the database engine, or redesigning the architecture entirely? In the early 2010s, Gartner first organized cloud migration strategies into 5 Rs, and AWS has since enhanced this with Relocate and Refactor to propose a 7R framework. Today, most enterprise migration projects use these 7Rs as their decision-making language.

The SAP-C02 Domain 3 (Migration & Modernization) is not simply about memorizing tool names. It's about the ability to judge "which R is correct?" in a scenario, and then immediately map that R to the corresponding tools. The 7Rs are a continuous spectrum, each with different levels of effort, cost, ROI, and risk.

## 7R Framework: Understanding as a Spectrum

The 7Rs are ordered by "magnitude of change."

```
No change ◄─────────────────────────────────────────► Complete redesign
Retire | Retain | Relocate | Rehost | Repurchase | Replatform | Refactor
```

| R | Definition | Change Magnitude | Effort | Representative Tool | ROI Timeline |
|---|------|---------|------|----------|------------|
| **Retire** | Decommission systems no longer needed | None | Minimal | ADS after discovery | Immediate (cost elimination) |
| **Retain** | Keep on-premises as-is | None | None | — | None |
| **Relocate** | Move hypervisor as-is | Infrastructure location only | Minimal | VMware Cloud on AWS | Fast (1-3 months) |
| **Rehost** | Lift-and-Shift, keep OS and app | Infrastructure location only | Low | AWS MGN | Fast (1-6 months) |
| **Repurchase** | Replace with SaaS solution | Complete platform replacement | Medium | SaaS purchase | Medium-term (operational savings) |
| **Replatform** | Convert some components to managed | Partial changes | Medium | MGN + DMS/SCT | Medium-term (operational efficiency) |
| **Refactor** | Cloud-native redesign | Complete changes | High | A2C, Refactor Spaces | Long-term (maximum ROI) |

> 💡 **Related Theory**: The Strangler Fig pattern (Martin Fowler, 2004) gradually wraps a legacy system with new services instead of replacing it all at once, eventually strangling it out of existence. Named after the tropical strangler fig tree that wraps around a host tree, grows, and eventually stands alone when the host dies. This pattern is a risk-mitigation approach for Refactor strategies, and Refactor Spaces provides it as a managed service.

> 📚 **Case Study**: Capital One's AWS Migration (2019). One of America's largest banks began its AWS migration in 2012 and declared complete data center closure in 2019. Over a seven-year journey, they started with simple Rehost and gradually shifted to Refactor. Result: 75% reduction in deployment cycles, 35% reduction in infrastructure costs. Lesson: 7Rs are a strategy, not a one-time choice. Different Rs apply to different systems, and you migrate across them over time.

## Detailed Analysis of Each R

### Retire: The Value of Decommissioning

The most overlooked R in migration assessment. When you look at actual usage patterns with ADS (Application Discovery Service), many enterprises find that 10-30% of their portfolio systems are actually unused or rarely used.

Criteria for identifying Retire candidates:
- Average CPU < 5%, minimal network traffic
- Last user login more than 6 months ago
- No clear owner or purpose unclear
- Identical functionality already provided by another system

> ⚠️ **Pitfall**: Retire means "decommission," not "keep on-premises without migrating." Keeping something on-premises without migrating is Retain. On the exam: "How do you handle unused systems?" → Retire. "How do you handle systems with low ROI from migration?" → Retain.

### Retain: Strategic Choice to Keep On-Premises

Retain is not a failure or concession—it's a strategic choice. It's appropriate in these cases:
- Regulatory requirement for on-premises data (some country-specific financial regulations)
- Migration cost > post-migration savings
- Recent major on-premises investment (within depreciation period)
- Technical migration path unclear (e.g., mainframe)

> 🔍 **Deeper Dive**: Retain is not a permanent strategy. Regulatory changes, contract expirations, or business shifts can move systems from Retain to another R. Best practice from the AWS MAP program is to document why each system is Retain and revisit every 12-18 months.

### Relocate: VMware-Specific Case

Relocate has practical meaning only in VMware environments. VMware Cloud on AWS (VMC) places the VMware vSphere/NSX/vSAN stack directly on AWS bare-metal servers. Customers continue using existing VMware tools (vCenter, vSphere, NSX) while running on AWS infrastructure.

Advantages of Relocate:
- Seamless migration with vMotion
- Retain existing VMware licenses, tools, and skills
- Integration with AWS services (S3, RDS, Lambda) possible

Limitations of Relocate:
- Complete utilization of cloud-native services is limited
- VMware licensing costs continue
- Long-term shift to Rehost or Refactor recommended

### Rehost (Lift-and-Shift): Speed First

Rehost is the fastest migration path. You move OS, middleware, and application code unchanged to EC2. Tool: **AWS Application Migration Service (MGN)**. MGN performs block-level replication to create an identical EC2 instance from the source server.

Rehost is "the first step of your cloud journey." The realistic strategy is to get to the cloud first, then gradually move to Replatform and Refactor.

> 💡 **Related Theory**: Pace-Layer strategy (Gartner). Layer systems by rate of change and apply different strategies to each. Fast-changing innovation layer (new apps) → Refactor, mid-pace business apps → Replatform, slow-changing records layer (ERP, mainframe) → Rehost or Retain. The failure of "big-bang" migrations often comes from ignoring this Pace-Layer.

### Repurchase: SaaS Conversion

Replace an application running on-premises or IaaS with a SaaS solution.

| On-Premises System | SaaS Replacement |
|------------|---------|
| In-house CRM | Salesforce |
| In-house email server | Microsoft 365, Google Workspace |
| In-house HR system | Workday |
| In-house contact center | Amazon Connect |
| In-house LMS | Cornerstone, Docebo |

Exam clues for Repurchase: "minimize operational burden," "allow IT staff to focus on core business," "eliminate legacy software licenses."

> ⚠️ **Pitfall**: Repurchase requires data migration and process change. It's easy to assume "no operational burden," but migrating existing data to SaaS and retraining staff is substantial. High short-term cost, large long-term ROI.

### Replatform: Maintain Core Architecture, Partial Optimization

Change infrastructure layer components to managed services without changing code.

Key Replatform patterns:

| Original | Target | Benefit |
|-----|------|-----|
| Oracle DB on EC2 | Aurora PostgreSQL (DMS + SCT) | License savings, managed |
| MySQL on EC2 | Amazon RDS MySQL | Automatic backups, HA, patching |
| Tomcat on EC2 | AWS Elastic Beanstalk | Automated platform management |
| Redis on EC2 | ElastiCache for Redis | Managed cluster |
| Windows Server | Windows EC2 on AWS (OS upgrade) | License optimization |

Replatform is suitable when you see these clues: "reduce DB operational burden," "automate OS patching and backup," "cut costs through engine replacement," "minimal code changes."

> 📚 **Case Study**: GE's Oracle to Aurora Migration (2018). General Electric Replatformed dozens of Oracle DB instances to Aurora PostgreSQL. Oracle Enterprise licensing alone saved millions annually. SCT automatically converted approximately 70% of PL/SQL stored procedures; the remainder required manual fixes. Lesson: Heterogeneous DB migration typically achieves 70-80% automatic schema conversion; expect to manually address the rest.

### Refactor (Re-Architect): Highest ROI, Highest Risk

Redesign monolithic apps as microservices, move from VM-based to containers/serverless. Requires code-level changes.

Refactor tool ecosystem:

| Scenario | Tool |
|---------|------|
| Java/IIS app → containers | App2Container (A2C) |
| .NET Framework → .NET Core | Porting Assistant for .NET |
| Monolith → microservices (gradual) | Refactor Spaces |
| End-of-Support Windows 2003/2008 → safe migration | End-of-Support Migration Program |
| New serverless architecture | Lambda + API Gateway + DynamoDB |

## 7R Decision Tree (For Exam Quick Answers)

```
System assessment begins
│
├─ System no longer used? → YES → Retire (decommission)
│
├─ No migration ROI, technical constraints? → YES → Retain (keep on-premises)
│
├─ VMware vCenter environment, migrate as-is? → YES → Relocate (VMC)
│
├─ Fast cloud entry, minimal changes? → YES → Rehost (MGN)
│
├─ SaaS more suitable for this function? → YES → Repurchase
│
├─ DB/OS changes improve cost and operations? → YES → Replatform (DMS+SCT)
│
└─ Maximize cloud-native benefits? → YES → Refactor (A2C, Serverless)
```

## Migration Process: Five-Stage Journey

Cloud migration is a process, not a tool execution. AWS presents a standard five-stage model.

```
1. Discovery (Assess current state)
   └── ADS, Migration Evaluator, manual interviews
   └── Collect server inventory, dependencies, TCO data

2. Assess (Evaluate and plan)
   └── 7R decisions, prioritization, dependency analysis
   └── MRA (Migration Readiness Assessment)

3. Mobilize (Prepare infrastructure)
   └── Landing Zone (AWS Control Tower)
   └── Network (VPC, Direct Connect, VPN)
   └── Security & governance (SCP, IAM Identity Center)
   └── Pilot migration

4. Migrate (Execute transfer)
   └── Wave planning (batch based on dependencies)
   └── MGN, DMS, A2C, DataSync, Snow Family
   └── Validation & cutover

5. Optimize (Right-size and cost-optimize)
   └── Right-Sizing (Compute Optimizer)
   └── Reserved Instances, Savings Plans
   └── Monitoring and cost optimization
```

> 🔍 **Deeper Dive**: The importance of wave planning. Migrating 1,000 servers in a "big bang" has high failure risk. Create waves based on dependency maps. Wave 1: standalone web servers (minimal dependencies). Wave 2: app servers that depend on Wave 1. Wave 3: database servers. If this order reverses, app servers complete migration before databases, causing massive latency spikes. ADS's network dependency data (TCP connection analysis) forms the basis for wave design.

## Migration Acceleration Tools Map

| Purpose | Tool | Keyword |
|-----|------|-------|
| Server inventory, dependency discovery | **ADS** (Application Discovery Service) | "Auto-collect on-premises inventory" |
| Financial TCO analysis | **Migration Evaluator** | "5-year TCO report," "executive reporting" |
| Server Rehost | **MGN** (Application Migration Service) | "lift-and-shift," "VM to EC2" |
| Database migration | **DMS + SCT** | "Oracle to Aurora," "heterogeneous engines" |
| Containerization | **App2Container** | "Tomcat/IIS → containers" |
| Enterprise-wide program | **MAP** | "AWS funding," "partner support" |
| Unified progress dashboard | **Migration Hub** | "Unified tracking," "home region" |

## AWS MAP (Migration Acceleration Program)

MAP is not a tool—it's a **program**. It targets large-scale migrations (1,000+ servers or $100K+ expected AWS spend) and packages AWS funding, expertise, and tools.

| Stage | Name | Activities | Incentive |
|-----|------|-----|--------|
| 1 | **Assess** | MRA, business case | Partner funding |
| 2 | **Mobilize** | Landing Zone, pilot | AWS migration credits |
| 3 | **Migrate & Modernize** | Actual transfer, optimization | Usage credits (Migration Credits) |

> 🎯 **Scenario**: "Migrate 1,500 servers in 18 months, need TCO report for executives, want AWS expert support and funding incentives" → Answer: MAP + Migration Evaluator. MAP is the funding/consulting/tool package program; Migration Evaluator is the TCO reporting tool.

## Comparison: Replatform vs Refactor (Exam Boundary)

The most confusing distinction on the exam.

| Criterion | Replatform | Refactor |
|-----|-----------|---------|
| Code changes | None or minimal | Yes (sometimes complete rewrite) |
| Architecture changes | None | Yes (monolith → MSA, etc.) |
| Example | EC2 Oracle → Aurora (DMS) | Monolith → Lambda + DynamoDB |
| Duration | Weeks to months | Months to years |
| Risk | Medium | High |

Blurry boundary case: "Migrate a Java app from Tomcat to EKS via App2Container." Code unchanged, but containerization applied → **Replatform leaning Refactor**, or classified as Refactor. On the exam, since App2Container's primary purpose is "containerize without code changes," it's classified as a Refactor tool.

## 📝 연습 문제

**문제 1.** A company has 1,200 physical servers and 500 VMware VMs. They want to quickly migrate physical servers to the cloud, and they want to keep using their existing vCenter and vMotion for the VMware environment. Which R is most suitable for each?

A) Physical servers: Rehost, VMware: Rehost
B) Physical servers: Rehost (MGN), VMware: Relocate (VMware Cloud on AWS)
C) Physical servers: Refactor, VMware: Retain
D) Both Repurchase

**정답: B**
Physical servers to EC2 without code changes = Rehost (MGN). VMware environment transfer with vCenter/vMotion as-is = Relocate (VMware Cloud on AWS). Relocate is specific to VMware vSphere environments.

---

**문제 2.** Of 200 servers discovered by ADS, 50 are found to have average CPU 2%, no traffic, and last login 1 year ago. Which R should apply to these servers?

A) Retain (low migration ROI)
B) Retire (decommission)
C) Rehost (get to cloud quickly)
D) Repurchase (SaaS replacement)

**정답: B**
Unused systems = Retire. Retain means "intentionally keeping on-premises for a reason." Keeping unused systems on-premises is unnecessary cost. Decommissioning is the most direct cost saving.

---

**문제 3.** A manufacturer wants to migrate a 100TB Oracle DB to AWS. They want to eliminate Oracle Enterprise licensing costs, keep application code unchanged, and want automatic stored procedure conversion. Which R and tools fit best?

A) Rehost (MGN), Oracle on EC2
B) Replatform (SCT + DMS → Aurora PostgreSQL)
C) Refactor (complete redesign)
D) Retain (keep Oracle licensing)

**정답: B**
Database engine change (Oracle → Aurora PG) + no code changes = Replatform. SCT converts schema and PL/SQL, DMS Full Load + CDC for seamless migration. Rehost keeps running Oracle on EC2, maintaining licensing costs.

---

**문제 4.** A company's in-house CRM system has legacy code with high maintenance costs. Its functionality is identical to commercial CRM SaaS. Which R is most suitable?

A) Rehost
B) Replatform
C) Repurchase (e.g., Salesforce)
D) Refactor

**정답: C**
Functionality replaceable by commercial SaaS = Repurchase. CRM has mature SaaS solutions like Salesforce and HubSpot. Repurchase eliminates IT maintenance burden by transferring it to the vendor.

---

**문제 5.** You need to complete a company-wide 5,000-server migration in 18 months. You want to leverage AWS funding support, expert consulting, and partner ecosystem. What should you use?

A) AWS Trusted Advisor
B) AWS Migration Acceleration Program (MAP)
C) AWS Control Tower alone
D) AWS Personal Health Dashboard

**정답: B**
Large-scale migration + AWS funding + partner consulting = MAP. MAP is a three-stage program (Assess/Mobilize/Migrate) providing funding incentives, credits, and tools as a package. Trusted Advisor and Control Tower are individual tools, not programs.

---

**문제 6.** Based on ADS-collected data, you need to submit an "on-premises vs AWS 5-year cost comparison report" to executives. Which tool do you use?

A) AWS Cost Explorer
B) AWS Migration Evaluator (formerly TSO Logic)
C) AWS Pricing Calculator
D) AWS Compute Optimizer

**정답: B**
Migration financial business case = Migration Evaluator. Compares current on-premises costs vs 5-year AWS TCO after migration. Cost Explorer analyzes already-deployed AWS spending; Pricing Calculator estimates new workload costs.

---

**문제 7.** A company wants to migrate a Tomcat Java web app to EKS. They want to generate container images and EKS manifests automatically without touching source code. Which tool is suitable?

A) AWS MGN (Application Migration Service)
B) AWS App2Container
C) AWS Porting Assistant for .NET
D) AWS Copilot CLI

**정답: B**
Containerize running Java (Tomcat) app without source code → App2Container. A2C analyzes running processes and auto-generates Dockerfile + ECS/EKS manifests. MGN does Rehost of entire VMs to EC2; Porting Assistant converts .NET Framework to .NET Core.

---
