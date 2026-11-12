# Day 1 - Multi-Account Enterprise CI/CD: Governance and Platform Engineering Principles for 50+ Accounts

As organizations grow from one account to two, then five, then dozens of AWS accounts, they reach the same inflection point. "If the platform team has to manually cut an account, architect a pipeline, and hand-code security baselines every time a developer creates a new service, the team will spend all its time on someone else's infrastructure setup. How do we enforce standards without making developers wait?" This tension — the tug-of-war between governance (control) and self-service (speed) — is the essence of multi-account enterprise CI/CD. Today, we examine a realistic organization: 50+ microservices, 60+ AWS accounts, 100 developers, 5 platform engineers. We dissect how to resolve that tension through structure — Landing Zone and Account Factory, Tooling account Hub-Spoke, Service Catalog self-service, Permission Boundary and SCP authority boundaries — alongside the distributed systems and organizational theory beneath.

In the DOP exam, this domain appears repeatedly in scenarios like "apply identical baselines to hundreds of accounts automatically", "prevent developer-created IAM Roles from exceeding company policy", "provide standard pipelines to 50 services via self-service". Each answer hinges on understanding whether to touch StackSets·AFT·Service Catalog·Permission Boundary·SCP, and recognizing which anti-patterns carry operational burden despite working.

## Why Partition Accounts — Bulkhead and Blast Radius in Organizational Theory

The starting premise of multi-account strategy is this: **AWS accounts are the strongest isolation boundaries for IAM, billing, service limits, and security.** Within one account, two workloads can be separated by IAM policy — but that separation depends on people writing policies correctly. Split into accounts, and isolation becomes **the default (default-deny by boundary)** — resources in another account are invisible unless an explicit cross-account trust exists.

This is the organizational application of the **bulkhead pattern** from distributed systems. Just as bulkheads limit a breach to one compartment of a ship, prod account breach or service limit exhaustion in one account doesn't spill into others. In security terms: **blast radius reduction**. If IAM credentials in one account leak, their reach is confined to that account alone.

> 💡 **Related theory**: Account boundaries embody the essence of **fault isolation**. The microservices resilience principles Netflix codified in the 2010s — circuit breaker, bulkhead, backpressure — filter down to the infrastructure layer in multi-account structure. From CS perspective, this mirrors **shared-nothing architecture**. Database sharding isolates one shard's failure from others; account sharding isolates one workload's security, limit, or cost blast. The trade-off: isolation demands explicit trust relationships (AssumeRole, Resource Policy) for cross-account communication, observation, and deployment. Most of multi-account CI/CD complexity flows from this "isolate, then safely reconnect" work.

> 🔍 **Deeper**: AWS's multi-account guidance first crystallized in 2018's **Landing Zone** solution, absorbed into the managed service **Control Tower** in 2019. Before that, every organization designed "how many accounts and how to split" from scratch, yielding inconsistent structures. Control Tower's standard — three core accounts (Management for billing/org, Log Archive for centralized logs, Audit for security ops), with workloads grouped by OU — became the de facto industry standard. Exam questions like "What does Log Archive do?" and "Why is Audit the GuardDuty/Security Hub delegated admin?" all presume this standard structure.

## Account Structure — OU Trees Inherit Policies

Dozens of accounts laid flat demand policy per account. Instead, **OU (Organizational Unit) trees** let SCPs inherit — like Unix directory permission inheritance.

```
Root
├─ Security OU
│   ├─ Log Archive Account      ← All CloudTrail/Config logs, central immutable storage
│   ├─ Audit Account            ← Security Hub/GuardDuty delegated admin
│   └─ Forensics Account        ← Incident isolation and investigation only
├─ Infrastructure OU
│   └─ Tooling/CICD Account     ← Pipeline Hub
├─ Workloads OU
│   ├─ Dev OU      → {service}-dev accounts
│   ├─ Staging OU  → {service}-staging accounts
│   ├─ PreProd OU
│   └─ Prod OU     → {service}-prod accounts (regulated workloads isolated)
├─ Sandbox OU                   ← Developer experimentation, strict SCP guardrails
└─ Suspended OU                 ← Accounts pending deletion, full Deny
```

The key is **policy placement**. "Prod forbids region outside ap-northeast-2" — attach once to Prod OU's SCP, and all prod accounts below inherit it. A new prod account entering the OU automatically receives the policy; no per-account oversight misses occur.

> ⚠️ **Gotcha**: SCP **does not grant permissions — it only sets a ceiling.** Write `Allow *` in SCP; if IAM policy doesn't separately allow it, nothing happens. SCP's true role is Deny guardrails — "forbid Root use", "forbid CloudTrail disable", "forbid region outside X". Exam pitfall: "We gave S3 permission via SCP but it doesn't work" — answer: "SCP doesn't grant; IAM policy must grant actual permission." The effective permission is the intersection of SCP (ceiling) and IAM policy (grant). Also: SCP doesn't apply to Management account itself — so keep that account workload-free, touching only billing and org structure.

## Landing Zone and Account Factory — Spawn Accounts from Code

100 developers, 50 services, each needing 5 environments (sandbox·dev·staging·pre-prod·prod) = hundreds of accounts. Impossible to create by hand. **Account Factory** automates account creation itself.

Control Tower's built-in Account Factory is Service Catalog-based; for stronger IaC control, use **AFT (Account Factory for Terraform)**. AFT takes account requests (e.g., ServiceNow ticket → CodeCommit `request.json`), provisions via pipeline, and automatically layers standard baselines — VPC, IAM Role, Config, CloudTrail, GuardDuty, Backup, KMS CMK — on top.

> 💡 **Related theory**: Account Factory lifts **immutable infrastructure** thinking to the account level. Just as servers are replaced, not patched, accounts become "products of a standard template". This is also the **declarative vs imperative** paradigm. Imperative ("create account, create VPC, enable Config") leaves order, failure handling, drift to humans. Declarative ("this account must match this standard") lets tooling reconcile desired vs observed state. Terraform·CloudFormation's core is exactly this reconciliation loop. AFT applies it to account creation: "account standard state" lives in Git, enabling audit, replay, rollback. The result: provisioning becomes **idempotent**.

## Tooling Account Hub-Spoke — Centralize Pipeline, Loan Permissions

50 services each running CodePipeline in their own account scatters pipeline definitions, artifacts, ECR, CodeArtifact, and standardization crumbles. **Enterprise standard: concentrate pipelines in Tooling (CICD) account; real deployments happen cross-account in Spoke workload accounts (Hub-Spoke).**

```
Tooling Account (Hub)
├─ CodePipeline × 50 (per service)
├─ CodeBuild (build/test)
├─ ECR (container images central)
├─ CodeArtifact Domain (packages central)
├─ Artifact S3 + KMS Multi-Region Key
└─ Cross-Account Deploy Roles (trust relationships to Spoke)
        │
        │ sts:AssumeRole
        ▼
Each Spoke (Workload Account)
├─ CrossAccountDeployRole   ← trusts Tooling
├─ CloudFormationExecutionRole ← owns resource creation permissions
└─ Application resources (ECS/Lambda/RDS/...)
```

Permission design here is subtle. The Tooling pipeline assumes Spoke's `CrossAccountDeployRole`, which in turn hands off to `CloudFormationExecutionRole`. This **dual-Role structure is key** — the pipeline doesn't hold powerful deploy permissions directly; it borrows a scoped Spoke Role only when needed.

> 🔍 **Deeper**: Why use **Multi-Region Key** for KMS? It connects to the trap of cross-account artifact sharing. If Tooling's S3 holds KMS-encrypted artifacts, Spoke's CloudFormation reading them requires (1) S3 bucket policy allowing Spoke **and** (2) **KMS key policy allowing Spoke's decryption**. Miss either and "Access Denied" bites. Beginners fix S3 and forget KMS, breaking deployments. The exam gotcha: "KMS error on cross-account deploy" → nearly always "add target account/Role decryption to KMS key policy." Multi-region DR adds another layer: Multi-Region Key lets both regions reference the same key ID, simplifying policy management.

> 📚 **Case study**: **Atlassian** (2017) and multiple fintech firms (2020s) migrating from monolithic single-account to Hub-Spoke multi-account hit a shared lesson: "Give the Tooling pipeline too much power, and if that account breaches, it becomes a super-channel deploying to every workload account." Mature orgs **explicitly restrict Tooling's deployment Role to named Spoke Roles** (only certain Spoke Roles assumable) and mirror Spoke's trust policy with `aws:PrincipalArn` conditions ("only this specific pipeline Role"). Tooling account compromise is a supply-chain attack target — SolarWinds (2020) showed build-pipeline breach's destructiveness — and Tooling Role minimization is the defense line.

## Service Catalog — Self-Service and Standardization At Once

The core tool for resolving governance-vs-speed tension is **Service Catalog**. Platform team publishes vetted pipeline templates (CDK Pipelines, language- and deployment-type variants) in a Portfolio; developers self-serve by selecting a Product to auto-generate their service's pipeline. Developers get speed, platform team keeps "only approved templates run" standard.

| Domain | Self-Service | Governance |
|--------|--------------|------------|
| New account | AFT auto-provision | SCP auto-inherit |
| New pipeline | Service Catalog Product | Template validation/signing |
| Add secret | Secrets Manager | KMS Key Policy standard |
| New IAM Role | Developer free to create | Permission Boundary enforce |
| Console Write access | Just-In-Time elevation | Default read-only |

> 💡 **Related theory**: This table is the implementation of **Platform Engineering** and **Golden Path**. Golden Path: "the path most recommended, best-trodden, where following it brings security, observability, deployment for free." Core insight: "incentive beats mandate." Don't force standards on developers; make the standard path easiest and fastest, and developers voluntarily choose it. This is behavioral economics' **nudge** theory. Service Catalog turns Golden Path into one click; Permission Boundary and SCP guardrail against deviation. "Incentive + guardrail" is self-service governance's essence.

## Permission Boundary — Safety Rail for Authority Delegation

The riskiest self-service part is allowing "developers to create their own IAM Roles". Let them, and a developer self-assigns AdministratorAccess (privilege escalation). **Permission Boundary** blocks this hole.

Permission Boundary sets "the maximum authority this Role/User may hold." Even if IAM policy says `Allow *`, Boundary overrides it — if you cross Boundary, you have no permission. SCP is the ceiling at account/OU level; Boundary is the ceiling at individual principal level.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringEquals": {"aws:RequestedRegion": ["ap-northeast-2"]}
    }
  }]
}
```

The trick: when granting "Role creation permission" to developers, add an IAM policy **Condition**: "new Roles only create-able if they attach **this Boundary**" (`iam:PermissionsBoundary` condition key). Result: every developer-created Role stays within Boundary, so self-service Role creation stays safe.

> ⚠️ **Gotcha**: **SCP, Permission Boundary, IAM policy, Resource policy, Session policy evaluation order and relationship** — miss this and the exam crumbles. Core principle: (1) Explicit Deny wins first, always. (2) Same-account effective permission = **SCP ∩ Permission Boundary ∩ Identity policy** (all three must allow). (3) Cross-account needs Resource policy too. Permission Boundary attached but still no access? Either "Boundary allows but Identity policy doesn't" or vice versa — Boundary **restricts, not grants**, so even if Boundary says `Allow *`, Identity must separately allow the action.

## Security·Compliance Baseline — Deploy Auto to All Accounts via StackSets

Hundreds of accounts get GuardDuty·Config·CloudTrail·Backup one-by-one? Impossible; compliance holes guaranteed. **CloudFormation StackSets** deploy one template to many accounts and regions simultaneously.

**Service-Managed StackSets + Auto-Deployment** is the answer. Target an OU; enable Auto-Deployment; **new accounts entering that OU auto-get baseline deployed** — erasing per-account baseline install misses.

```bash
aws cloudformation create-stack-set \
  --stack-set-name SecurityBaseline \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-body file://baseline.yaml
```

Atop this: GuardDuty·Security Hub·Config each use **delegated admin** (Delegated Administrator) pattern, aggregating to Audit account — StackSets enable each account, Audit sees all Findings central. "Identical security tooling + central aggregation" standard combination.

> 🔍 **Deeper**: StackSets has two permission models. **Self-Managed** requires each target account to have `AWSCloudFormationStackSetExecutionRole` and admin account to have `AWSCloudFormationStackSetAdministrationRole`, with manual trust wiring — use when not on Organizations or deploying to external accounts. **Service-Managed** integrates Organizations; AWS auto-manages Roles, supports OU targeting and Auto-Deployment. Exam trigger: "auto-apply to new accounts in Organizations" → always Service-Managed + Auto-Deployment. Self-Managed for legacy·non-org·granular Role control only.

## Governance Gates — Control Points in the Pipeline

Standard pipelines gate code reaching prod through multiple checks. Each gate blocks a class of risk.

```
PR open
  └─ CodeGuru Reviewer + SAST(Snyk/Inspector)   ← code quality/vuln before merge
PR merged to main
  └─ CodeBuild unit/integration tests
Build artifact
  └─ Inspector container/package scan + Signer signature  ← supply chain integrity
Deploy to dev (auto)
Deploy to staging (auto + smoke test)
Deploy to pre-prod (manual approval)
  └─ SSM Change Calendar check (block freeze windows)
Deploy to prod
  └─ Canary (CodeDeploy/Lambda Alias) + auto-rollback (CloudWatch Alarm)
```

> 🎯 **Scenario**: "Regulated fintech runs 50 microservices. Needs: ①developers create new service pipelines directly but can't deviate from company standard ②all accounts auto-get GuardDuty/Config, including new accounts ③developer-created IAM Roles can't exceed policy ceiling ④prod deploys block during freeze windows." → ① Service Catalog Portfolio + CDK Pipelines template, self-service + validated. ② Service-Managed StackSets (Auto-Deployment Enabled) on Workloads OU + GuardDuty/Security Hub/Config delegated admin on Audit account. ③ Role create permission with `iam:PermissionsBoundary` condition force-attach Boundary. ④ SSM Change Calendar gate on prod stage. Plus: Prod OU SCP for region/Root guardrails, Tooling cross-account deploy Role target only named Spoke Roles.

## Cost Visibility — Tags Are Accounting Units

60 accounts, no visibility on who spends what → cost control fails. **Core chain: tag enforcement → Cost Allocation Tag → Cost Categories.** Config Rule flags non-compliant (missing required tags: `team`, `service`, `env`) resources; Auto-Remediation blocks or alerts. Tags guaranteed, Cost Explorer + Cost Categories sort spend by team/service; Cost Anomaly Detection ML-catches sudden spikes.

## Summary

Today we covered five. First, **splitting accounts into bulkhead/blast radius reduction** is organizational distributed-systems resilience, OU trees inherit SCP policy one-shot. Second, **Landing Zone/AFT spawn accounts from code**, lifting immutable-infra and declarative thinking to account level. Third, **Tooling Hub-Spoke centralizes pipelines, lending permissions cross-account AssumeRole; KMS key policy omission is gotcha #1.** Fourth, **Service Catalog (Golden Path) + Permission Boundary + SCP simultaneously satisfy self-service and governance** — incentive and guardrail. Fifth, **Service-Managed StackSets + Auto-Deployment + delegated admin auto-apply security baseline to all and new accounts** — the answer.

Next: expanding this standard to on-prem datacenters, **hybrid CI/CD** at depth.

---

## 📝 Practice Questions

**Question 1.** What is the most fundamental security and operational reason for an organization to split from a single account into dozens of accounts?

A) The more accounts, the higher the AWS discount rate

B) An AWS account is the strongest isolation boundary for IAM, billing, service limits, and security, so splitting accounts makes bulkheads and blast-radius reduction the default, keeping a compromise or limit exhaustion in one workload from spreading to others

C) To force each account to use a different Region

D) A single account cannot use CloudFormation

**Answer: B**

Explanation: Separation within a single account depends on people writing IAM policies correctly, but splitting accounts makes separation the default — resources in another account are not even visible without explicit cross-account trust. This is an organizational-level application of the bulkhead pattern and shared-nothing philosophy from distributed systems, confining the blast radius to one account. Discount rate (A), forcing Regions (C), and CloudFormation (D) have no basis.

---

**Question 2.** Which statement about SCPs (Service Control Policies) is MOST accurate?

A) An SCP grants permissions directly to an account

B) An SCP does not grant permissions but sets only a ceiling on permissions as a Deny guardrail, effective permissions are the intersection of SCP ∩ Permission Boundary ∩ Identity policy, and it does not apply to the Management account

C) An SCP replaces IAM policies

D) An SCP is applied first to the Management account

**Answer: B**

Explanation: An SCP cannot grant permissions and only sets a ceiling — even if you write `Allow *`, no permissions arise unless an IAM policy separately allows them. Its real role is as a Deny guardrail, such as prohibiting Root use or prohibiting disabling CloudTrail. Effective permissions within an account are the intersection that requires all three of the SCP, Permission Boundary, and Identity policy to Allow, and since SCPs do not apply to the Management account, that account should handle only billing and the organization structure. Granting permissions directly (A), replacing IAM (C), and applying to Management first (D) are all wrong.

---

**Question 3.** In an environment where 100 developers need hundreds of accounts, how can you automatically provision new accounts together with a standard baseline (VPC/Config/CloudTrail/GuardDuty)?

A) The platform team manually creates each account in the console

B) Receive requests with Landing Zone/Control Tower + Account Factory (AFT), and have a pipeline provision accounts declaratively and attach the standard baseline automatically

C) Each developer signs up for an account with their own credit card

D) Create accounts randomly every day with Lambda

**Answer: B**

Explanation: Account Factory (especially AFT) receives an account-creation request, provisions the account through a pipeline, and automatically installs the standard baseline on top of it. This lifts the immutable infrastructure and declarative paradigm to the account level: the "standard state of an account" remains as code in Git, enabling auditing, reproduction, and rollback. Manual creation (A) leads to omissions and cannot scale, and individual developer sign-ups (C) and random creation (D) mean the collapse of governance.

---

**Question 4.** In a Tooling-account Hub-Spoke structure, a cross-account pipeline deployment fails with an "Access Denied (KMS)" error. What are the most common cause and fix?

A) Just modify the S3 bucket policy

B) The artifact is encrypted with KMS, but the KMS key policy lacks decrypt permission for the target (Spoke) account/Role — both the S3 bucket policy and the KMS key policy must allow the Spoke

C) Restarting the pipeline fixes it

D) Disabling ECR fixes it

**Answer: B**

Explanation: For the Spoke's CloudFormation to read the encrypted S3 artifacts in the Tooling account, both the S3 bucket policy and the KMS key policy must allow the Spoke's access/decryption. Beginners fix only S3 and forget KMS, so the deployment breaks. Considering multi-Region DR as well, using a Multi-Region Key lets both Regions reference the same key ID and simplifies the policies. Modifying only S3 (A), restarting (C), and disabling ECR (D) do not identify the root cause.

---

**Question 5.** You want to delegate IAM Role creation to developers as self-service while safely enforcing that the Roles they create cannot exceed the company policy ceiling (for example, specific Regions only). How?

A) Give developers AdministratorAccess

B) Define a Permission Boundary policy and enforce, with the `iam:PermissionsBoundary` condition on the Role-creation permission, that a new Role can be created only if that Boundary is attached to it

C) Prohibit all Role creation

D) Control individual Roles with SCPs alone

**Answer: B**

Explanation: A Permission Boundary is a permission ceiling at the principal level. If you enforce Boundary attachment on new Roles with the `iam:PermissionsBoundary` condition when granting Role-creation permission, every Role a developer creates cannot exceed the Boundary, so privilege escalation is blocked — making self-service delegation safe. Granting Admin (A) is a privilege-escalation hole, a blanket prohibition (C) gives up self-service, and SCPs (D) are an account/OU ceiling, not an enforcement mechanism at the moment of creating an individual Role.

---

**Question 6.** In an Organizations environment, how can you deploy the GuardDuty and Config baselines to all accounts and have them applied automatically to accounts that join the OU in the future?

A) Manually create Roles in each account with Self-Managed StackSets

B) Deploy Service-Managed StackSets + Auto-Deployment (Enabled) targeting the OU, which applies automatically to new accounts too, with GuardDuty/Security Hub/Config aggregated by a delegated administrator (the Audit account)

C) Scan for new accounts daily with a Lambda script

D) Each account administrator turns them on manually in the console

**Answer: B**

Explanation: Service-Managed StackSets integrate with Organizations so that AWS manages the execution Role, and they support OU targeting and Auto-Deployment — when a new account joins the OU, the baseline is deployed automatically. "Automatically applied to new accounts too" is always Service-Managed + Auto-Deployment. Self-Managed (A) requires manual Role setup, and scripts (C) and manual operation (D) are anti-patterns with the risk of omissions.

---

**Question 7.** Which statement MOST accurately describes the relationship between the Platform Engineering concept of the "Golden Path" and Service Catalog?

A) The Golden Path is a blocking mechanism that forces standards on developers

B) The Golden Path is the "easiest and fastest recommended route" — a nudge that makes security, observability, and deployment come for free when followed, so developers voluntarily choose the standard; Service Catalog provides that route with a single click, and Permission Boundaries and SCPs put guardrails on deviations

C) The Golden Path is a feature solely for cost optimization

D) The Golden Path cannot exist without Service Catalog

**Answer: B**

Explanation: The key insight of the Golden Path is that "incentives are stronger than enforcement" — if the standard route is the easiest and fastest, developers choose it voluntarily (a nudge from behavioral economics). Service Catalog implements the Golden Path by providing validated pipeline templates as self-service, and Permission Boundaries and SCPs put guardrails on attempts to leave the path. "Incentives + guardrails" is the essence of self-service governance. Forced blocking (A), cost-only (C), and dependence on Service Catalog (D) are narrow misunderstandings of the concept.

---

## 📌 Today's Summary

There are five key takeaways today. First, account separation is the organizational application of the distributed-systems resilience principles of bulkheads and blast-radius reduction, and SCPs (permission ceilings and Deny guardrails) are inherited through the OU tree. Second, Landing Zone/Account Factory (AFT) stamps out accounts as code, lifting the declarative and immutable infrastructure philosophy to the account level and automatically attaching the standard baseline. Third, a Tooling-account Hub-Spoke centralizes pipelines and lends only permissions through cross-account AssumeRole, and a missing KMS key policy (along with SolarWinds-style supply chain risk) is the key pitfall. Fourth, Service Catalog (Golden Path), Permission Boundaries (enforcing `iam:PermissionsBoundary`), and SCPs satisfy both self-service and governance. Fifth, Service-Managed StackSets + Auto-Deployment + a delegated administrator is the right answer for automatically applying the security baseline to "all accounts + new accounts."
