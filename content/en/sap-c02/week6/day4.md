# Day 4 - Migration Acceleration Tools: App2Container, MAP, Migration Hub

In migration projects, "transfer" is only half the journey. The other half is **Discovery (deciding what to migrate), TCO analysis (understanding cost), building Landing Zones (ensuring safe company-wide transfer), and dashboards (tracking transfer status)**. AWS provides specialized tools and programs for each stage.

Today, beyond the 7Rs, MGN, and DMS we've covered, we'll explore the tools that complete the migration ecosystem: App2Container (containerization), Porting Assistant (code porting), Migration Hub (unified tracking), MAP (funding program), Refactor Spaces (gradual monolith decomposition). Precisely distinguishing between similar-looking tools is key to the Pro exam.

## App2Container (A2C): Containerization Without Code

App2Container is an AWS CLI tool converting currently running Java or .NET IIS apps to Docker images without source code.

### The Problem A2C Solves

Historically, moving legacy apps from EC2 or on-premises to containers required two approaches: (1) obtain source code and write Dockerfile manually, or (2) import VM snapshots. Both were complex and time-consuming. A2C analyzes running processes, auto-extracts dependencies, environment variables, ports, and file mounts to generate a Dockerfile.

### A2C Supported Apps

| Technology Stack | Supported |
|---------|-----|
| Java + Tomcat | ✅ |
| Java + JBoss | ✅ |
| Java + WebSphere | ✅ |
| Java + WebLogic | ✅ |
| .NET Framework + IIS (Windows Container) | ✅ |
| Python Flask/Django | ❌ (not A2C, manual containerization) |
| Node.js | ❌ |

> ⚠️ **Pitfall**: A2C containerizes **apps only**. Databases (MySQL, Oracle) are not A2C targets. "Migrate Tomcat app to EKS" → use A2C for app containerization + DMS for DB separately.

> ⚠️ **Pitfall 2**: A2C containerizing .NET Framework app creates a **Windows Container**. To switch to Linux Container requires **.NET Core (current .NET 8) porting**, which Porting Assistant supports.

### A2C 5-Step Workflow

```
1. init        ─── Initialize A2C, set IAM and region

2. inventory   ─── Discover running apps, assign IDs
                   (PID, port, classpath, bind mounts)

3. analyze     ─── Deep dependency analysis
                   (external calls, environment vars, static resources)

4. extract     ─── Extract artifacts for containerization
                   (WAR/JAR, DLL, config files)

5. containerize ── Auto-generate Dockerfile + build image + push to ECR

6. generate    ── Generate ECS Task Definition / EKS Deployment YAML / App Runner config
```

### A2C Output Artifacts

- `Dockerfile`
- `docker-compose.yml` (local testing)
- `ecs-task-def.json` (ECS deployment)
- `deployment.yaml` (EKS deployment)
- `CloudFormation Template` (including infrastructure)

### A2C Can Inject Sidecars

During containerization, auto-inject these sidecars:
- **CloudWatch Agent**: collect container metrics
- **X-Ray Daemon**: distributed tracing

> 💡 **Related Theory**: Containers use Linux Namespaces (PID, Network, Mount, IPC, UTS) and cgroups (CPU/memory limits) for process isolation. A2C analyzes the running process's namespace info and environment, reproducing it in a container image. Theoretically, replicating via Docker the isolation OS provides.

## Porting Assistant for .NET: Code Porting Analysis Tool

Most confused with A2C. Critical difference:

| | App2Container | Porting Assistant |
|--|--|--|
| **Role** | Package current OS to containers | Convert .NET Framework → .NET code itself |
| **Code changes** | None | Yes (replace APIs, NuGet packages) |
| **Output** | Docker image | Code analysis report + some auto-migration |
| **Use when** | Containerize while keeping OS | Modernize to .NET Core/8 |

Porting Assistant operation:
1. Load solution file (.sln)
2. Analyze all .NET Framework API calls
3. Check .NET Core/.NET 8 compatibility (compatible/incompatible)
4. Check NuGet package compatibility
5. Auto-suggest compatible packages when available
6. Generate report (color-mark items needing manual work)

> 🔍 **Deeper Dive**: Separation of .NET Framework and .NET Core (current .NET 8). .NET Framework is Windows-only; .NET Core is cross-platform (Linux/macOS/Windows). Microsoft open-sourced .NET Core in 2016, opening the path to run .NET apps on Linux containers on AWS. But some .NET Framework APIs (Windows Registry, COM, some WCF) aren't supported in .NET Core, requiring code changes. Porting Assistant identifies this gap.

## End-of-Support Migration Program (EMP)

Windows Server 2003 (EoS 2015), Windows Server 2008 (EoS 2020)—legacy apps may run on OSes no longer receiving MS security patches. Simply upgrading to EC2 Windows 2019 may not work.

EMP applies **compatibility packages (Compatibility Shim)** to legacy apps, enabling them on newer Windows versions. MGN transfer to EC2 followed by EMP package application is standard.

| Scenario | Solution |
|---------|-------|
| Win 2008 app → Win 2019 | EMP + MGN |
| Win 2008 app → Linux container | Porting Assistant (port code first) |
| Win 2008 .NET Framework app → AWS ECS | A2C (Windows Container) |

## Migration Hub: Enterprise Migration Control Tower

Migration Hub isn't a migration tool—it's a **unified tracking dashboard**. See progress from MGN, DMS, ADS, and partner tools in one console.

### Core Capabilities

**Progress tracking**: Manage server/app lifecycle "Discovery → Not Ready → Ready → Testing → Cutover Complete."

**Home Region**: Migration Hub stores all data in one region. Cannot change after initial setup. Choose one authoritative region for company-wide migration governance.

**Strategy Recommendations**: Based on server inventory and source code analysis, auto-recommend which 7R to use. Integrate with A2C, Porting Assistant, MGN, etc., recommending specific tools.

**Migration Hub Orchestrator (2022~)**: Automate migration-stage workflows. Example: "ADS discovery → Wave approval → MGN agent install → Test Launch approval → Cutover → validation" executed step-by-step by Orchestrator with approval gates.

> 📚 **Case Study**: Deutsche Bank's large-scale migration (2023). Migrating 5,000+ servers to AWS, Deutsche Bank used Migration Hub Orchestrator for wave management and approval automation. Per financial regulations, Orchestrator configured approval gates by IT risk management before each Wave Cutover. Lesson: Large migrations' Orchestrator approval workflows solve both governance and audit trails.

## Application Discovery Service (ADS): Inventory's Starting Point

ADS is migration's prerequisite. Without knowing "what's where," neither 7R decisions nor wave design are possible.

### Two Collection Modes

**Agentless Collector** (VMware vCenter):
- Deploy virtual appliance in vCenter
- Collect VM metadata and performance metrics at ESXi level
- Discover hundreds to thousands of VMs simultaneously without agents
- Limitation: app-level dependencies (TCP connections) less precise than Agent

**Discovery Agent** (Linux/Windows install):
- Install agent on each OS
- Map TCP connections to understand server-to-server dependencies (5-second snapshots)
- Capture app process info, environment variables, installed software
- More detailed than Agentless but requires agent deployment overhead

| Item | Agentless Collector | Discovery Agent |
|-----|--------------------|----|
| Installation | vCenter virtual appliance | Agent on each OS |
| Dependency map | Limited (network-level) | Detailed (TCP, process) |
| vCenter required | Yes | No |
| Physical server support | ❌ | ✅ |

Collected data stored in S3, queryable via Amazon Athena SQL. Enables analysis like "servers with specific Oracle version" or "server pairs communicating on specific port."

## Migration Evaluator: Financial Decision Tool

If ADS is technical inventory, Migration Evaluator is financial inventory.

**Key capabilities**:
- Calculate current on-premises infrastructure cost (hardware depreciation, electricity, labor, licenses)
- Calculate expected post-AWS cost (EC2, RDS, storage, support)
- Generate 5-year TCO comparison report
- Include Right-Sizing recommendations (identify over-provisioning)

**Migration Evaluator vs AWS Pricing Calculator**:
- Migration Evaluator: migration-specific TCO comparing on-premises vs AWS post-migration
- Pricing Calculator: general tool estimating cost for specific AWS configuration

## Refactor Spaces: Managed Strangler Fig Implementation

Refactor Spaces provides the Strangler Fig pattern for gradual monolith-to-microservices conversion as an AWS managed service.

### Why Strangler Fig?

"Big-bang Refactor" converting monolith to microservices at once takes years and high risk. Strangler Fig keeps the existing monolith running, develops new features as microservices, and gradually replaces existing functionality.

### Refactor Spaces Operation

Refactor Spaces auto-configures API Gateway, VPC Link, Route 53 resources to create a routing layer.

```
Client
    │
    ▼
API Gateway (Refactor Spaces managed)
    ├── /api/orders/* → new microservice (Lambda + DynamoDB)
    ├── /api/products/* → new microservice (ECS)
    └── /* → existing monolith (ALB → EC2)
```

Develop new features as microservices, then add routing rules to Refactor Spaces. Gradually monolith's endpoints are replaced, and when no traffic reaches the monolith, decommission it.

**Refactor Spaces vs manual API Gateway setup**:
- Manual: configure API Gateway + VPC Link + Route 53 + ALB separately; routing rule management across teams complex
- Refactor Spaces: abstraction layer provides UI/API for adding/modifying routing rules; independent service management per team

> 💡 **Related Theory**: Martin Fowler's Strangler Fig Application (2004). When replacing legacy system functions with new services one-by-one, the original system still runs but handles diminishing functionality. The name "Strangler" (uncomfortable-sounding) comes from the tropical strangler fig tree wrapping and eventually replacing its host tree. It's become widely adopted as the most realistic and safe modern strategy for software modernization.

## Complete Tool Selection Map

Judge every exam scenario with this map:

| Scenario | Tool | Rationale |
|---------|------|-----|
| Auto-collect server inventory | ADS | Technical inventory |
| Agentless VMware vCenter discovery | ADS Agentless Collector | vCenter integration |
| 5-year TCO comparison report | Migration Evaluator | Financial analysis |
| VM → EC2 Rehost (lift-and-shift) | MGN | Block-level replication |
| Oracle/SQL Server → Aurora | DMS + SCT | Heterogeneous DB migration |
| MySQL → RDS MySQL | DMS only | Homogeneous DB migration |
| SQL Server → Aurora (minimal code) | Babelfish | TDS compatibility |
| Java (Tomcat/JBoss) → ECS/EKS container | App2Container | Java containerization |
| .NET IIS → ECS/EKS container | App2Container | .NET IIS containerization |
| .NET Framework → .NET Core porting | Porting Assistant | Code porting analysis |
| Win 2003/2008 EoS → AWS | EMP + MGN | Compatibility package |
| Monolith → microservices gradual replacement | Refactor Spaces | Strangler Fig |
| Enterprise-wide migration unified dashboard | Migration Hub | Progress tracking |
| Auto-recommend 7R | Migration Hub Strategy Recommendations | AI-driven recommendation |
| Migration stage automation and approval | Migration Hub Orchestrator | Workflow |
| Enterprise funding, consulting, partner program | MAP | 3-stage program |

> 🎯 **Scenario**: "On-premises data center has 3,000 servers. IT team doesn't know which apps run where. Need server inventory and DB complexity assessment, submit 5-year TCO report to executives, then secure enterprise migration funding." → ADS (inventory) + Fleet Advisor (DB complexity) + Migration Evaluator (TCO) + MAP (funding and program).

## 📝 연습 문제

**문제 1.** A JBoss Java EE app is running on-premises. You want to migrate to EKS without modifying code, auto-generating container image and EKS manifest. Most suitable tool?

A) AWS MGN (transfer entire server to EC2)
B) AWS App2Container
C) AWS Porting Assistant for .NET
D) AWS Copilot CLI (ECS/EKS deployment tool)

**정답: B**
JBoss Java app containerization → A2C. A2C supports JBoss including Java application servers, auto-generates Dockerfile + EKS Deployment YAML by analyzing running processes without source code. MGN transfers OS wholesale to EC2 (not containerization); Porting Assistant is .NET-only; Copilot deploys already-containerized apps to ECS.

---

**문제 2.** Company wants to run .NET Framework 4.7 IIS app on Linux ECS. Currently Windows-only. What's first?

A) A2C directly containerize (run Windows Container on ECS)
B) Porting Assistant for .NET analyze .NET Core compatibility, then port
C) MGN migrate to Windows EC2, then containerize
D) Refactor Spaces separate into microservices

**정답: B**
Linux ECS requires .NET Core (cross-platform). .NET Framework is Windows-only, so first use Porting Assistant to analyze .NET 8 compatibility and port. A2C can only create Windows Containers from .NET Framework IIS (not Linux). After porting, use A2C or write Dockerfile for Linux Container.

---

**문제 3.** Company's migration team simultaneously runs MGN (EC2 transfer), DMS (DB transfer), partner tool (file server transfer). Executive wants "entire progress on one screen." Which service?

A) CloudWatch Dashboards
B) AWS Migration Hub
C) AWS Systems Manager OpsCenter
D) AWS Service Catalog

**정답: B**
Multi-tool migration progress unified tracking → Migration Hub. After home region setup, MGN, DMS, partner tool progress aggregates in Migration Hub. CloudWatch is operational monitoring; OpsCenter is operational incident management.

---

**문题 4.** Large monolithic Java app → microservices transition. Full redesign is too risky. Keep monolith while developing new features as microservices, gradually replacing. Which service manages this routing?

A) AWS App Mesh (service mesh)
B) AWS Migration Hub Refactor Spaces
C) AWS API Gateway (manual config)
D) AWS Cloud Map (service discovery)

**정답: B**
Strangler Fig pattern managed implementation → Refactor Spaces. Auto-configures API Gateway, VPC Link, Route 53; easily add routing rules for new microservices. App Mesh manages service-to-service communication for existing microservices; Cloud Map provides service registration/discovery.

---

**문제 5.** 1,500 VMware vCenter servers' CPU, memory, network dependencies without agents. Suitable tool?

A) ADS Discovery Agent (install on each OS)
B) ADS Agentless Collector (vCenter virtual appliance)
C) DMS Fleet Advisor
D) Migration Hub Strategy Recommendations

**정답: B**
vCenter environment + agentless → ADS Agentless Collector. Deploy virtual appliance in vCenter to collect all VMware VM metrics without agents. Discovery Agent requires OS installation; Fleet Advisor DB-specialized; Strategy Recommendations analyzes then recommends.

---

**문제 6.** Executives want "AWS saves how much over 5 years?" Need report comparing current on-premises cost (hardware, electricity, labor, licenses) with expected AWS post-migration cost. Which tool?

A) AWS Pricing Calculator
B) AWS Cost Explorer
C) AWS Migration Evaluator
D) AWS Budgets

**정답: C**
On-premises vs AWS post-migration 5-year TCO comparison → Migration Evaluator (formerly TSO Logic). Input on-premises cost items, returns Right-Sized AWS configuration and cost, generating business case report. Pricing Calculator estimates specific AWS config (no current-state comparison); Cost Explorer analyzes already-deployed AWS spending.

---

**문제 7.** Company starting 24-month project transferring 2,000 servers. Wants AWS partner expert support, AWS migration credits, Mobilize-stage Landing Zone setup support. What provides all?

A) AWS Professional Services contract
B) AWS Migration Acceleration Program (MAP)
C) AWS Migration Hub
D) AWS Activate (startup program)

**정답: B**
Large migration + partner expert + AWS credits + Landing Zone support → MAP. MAP provides Assess/Mobilize/Migrate 3-stage package with funding incentives, partners, and tools. AWS Activate is startup-only; Professional Services is MAP-separate contract; Migration Hub is tracking tool.

---
