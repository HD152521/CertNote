# Day 2 - StackSets: The Deep Story of Deploying IaC to Thousands of Accounts

The moment an enterprise adopts AWS Organizations, the operational time awareness of engineers changes. Until yesterday, "deploying a CloudFormation Stack to one account takes 5 minutes," but today becomes "I need to deploy the same security baseline to 200 member accounts, which takes 1700 minutes (28 hours) via console." Within those 28 hours, someone mispells an IAM Role name in one account, someone else deploys to ap-northeast-1 instead of ap-northeast-2, and someone forgets the last 50 accounts. **Drift begins the moment people start repeating the same work.** StackSets was built precisely to reduce those 28 hours to a single command.

Today we examine why StackSets' two permission models both exist, how the Organizations Trusted Access's internal trust chain works, how you decide Operation Preferences' concurrency and failure tolerance numbers, and real-world pitfalls met operating 1000+ accounts. In exams, the boundary between StackSets and Control Tower / Account Factory / Config Conformance Pack frequently blurs, so we clarify those boundaries. DOP produces 3-5 StackSets scenario questions per test, and "deploy to OU automatically," "multi-account fan-out," "on-premise integration" are almost standard.

## The Problem StackSets Solves — The Difficulty of Fan-out

In distributed systems, fan-out means "propagating one source command to N targets simultaneously." Message queue pub/sub, Kubernetes DaemonSet, Ansible multi-host playbook all follow this pattern. StackSets is the same fan-out, but the difference is (1) targets are **AWS Accounts** (security boundaries), (2) you must pre-establish IAM trust relationships to each target, (3) policy is needed for how to handle partial failures. These three create all the complexity of StackSets.

```
StackSet (defined in Administration account)
   │ Template + Parameters + Operation Preferences
   ▼
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Stack       │ Stack       │ Stack       │ Stack       │
│ Instance    │ Instance    │ Instance    │ Instance    │
│ (account A, │ (account A, │ (account B, │ (account B, │
│  ap-ne-2)   │  us-east-1) │  ap-ne-2)   │  us-east-1) │
└─────────────┴─────────────┴─────────────┴─────────────┘
   Each Stack Instance is an ordinary CloudFormation Stack in the member account
   StackSet is the upper metadata syncing their definitions
```

It's important that Stack Instance is just an ordinary Stack. Within the member account it looks like a normal CloudFormation Stack and can be handled identically in console. **But if the member account's operator arbitrarily modifies the Stack, drift immediately occurs, and the next StackSet update overwrites that change**. StackSet is a sync tool enforcing single source of truth, not a collaboration tool.

> 💡 **Related Theory**: The combination of fan-out and single source of truth is the core principle of GitOps. Flux and ArgoCD use Git as the source of truth, reconciling manifests to N Kubernetes clusters in exactly the same model as StackSets. The difference is GitOps uses a pull model (agents pull) while StackSets uses a push model (central pushes). Push model is strong on immediacy but weak on central failure, pull model is strong on distributed resilience but has propagation delay.

## Two Permission Models — The Chicken-and-Egg Problem of Self-managed

StackSets has Self-managed and Service-managed two permission models, where the difference is **who creates IAM Roles**. Initially both look like just "permission model differences," but in real operations, Self-managed creates a chicken-and-egg problem.

| Model | IAM Role Creator | Target Specification | Auto-apply to New Accounts |
|-------|---|---|---|
| **Self-managed** | Operator creates in each account | Account ID list | Cannot (manual) |
| **Service-managed** | AWS auto (Organizations integrated) | OU ID or account filter | Possible (Auto-deployment) |

The chicken-and-egg of Self-managed: "Using StackSets to deploy IAM Roles to multiple accounts" is a first use case, but **you must pre-create IAM Roles in each account for that deployment**. Creating IAM Roles manually in 200 accounts defeats the purpose of using StackSets. So in reality, **Self-managed only makes sense in non-Organizations environments** (e.g., company policy forbids Organizations, multiple AWS accounts from acquisition).

Service-managed resolves this contradiction through AWS Organizations' trust chain. When Organizations Management Account grants "StackSets Trusted Access," AWS automatically provisions `AWSCloudFormationStackSetExecutionRole` in all member accounts. Operators don't directly touch IAM trust relationships.

```bash
# Once: Enable StackSets Trusted Access in Organizations
aws organizations enable-aws-service-access \
  --service-principal stacksets.cloudformation.amazonaws.com

# After that, all Service-managed StackSets auto-create IAM in member accounts
```

> 🔍 **Deeper**: Service-managed auto IAM Roles are made via **Service-Linked Role (SLR)** mechanism, not `AWSReservedSSO_*` pattern. SLRs can't be deleted by users (service checks dependencies), permission changes are restricted too. It's a security advantage and a constraint simultaneously — attempts to arbitrarily modify auto-created roles are blocked, and to use custom roles you must switch to Self-managed. The trust origin starts at Organizations trust relationship (`organizations.amazonaws.com`), so assuming this role outside Org is impossible.

> ⚠️ **Pitfall**: In Self-managed, the Administration Role's trust policy has "Administration account ID" hardcoded, and Execution Role's trust policy has "only trust Administration account" hardcoded. The moment a company moves the Administration account itself via M&A, you must bulk-update all member accounts' Execution Role trusts — the biggest operational burden of Self-managed. Service-managed abstracts the trust chain via Organizations, so this problem doesn't exist.

## Delegated Administrator — Why We Lock the Management Account

AWS Organizations' Management Account has absolute power over all member accounts. If this account is compromised, the entire Org is at risk, so **minimizing Management Account usage is the top priority of AWS Well-Architected Framework Security Pillar**. In practice, people don't log into this account, all daily operations are delegated to separate accounts (Tooling Account, Security Account).

```bash
# Run once in Management Account
aws organizations register-delegated-administrator \
  --account-id 222222222222 \
  --service-principal stacksets.cloudformation.amazonaws.com

# Now account 222222222222 can do Service-managed StackSets work
# Management Account no longer participates in daily StackSets operations
```

This pattern applies identically to nearly all Org-aware services like GuardDuty (Security Account), Config (Audit Account), Security Hub, IAM Access Analyzer. Ultimately operational responsibility scatters to domain-specific accounts and Management Account remains only as an "emergency key."

> 📚 **Case Study**: In 2019 a global company lost Management Account root credential keys. Fortunately there was no compromise, but root recovery stopped all StackSets operations for 2 weeks. After that, company standard became "Management Account only for SCP changes and new OU creation, everything else via Delegated Admin." AWS Control Tower enforces this pattern by default — Audit/Log Archive accounts become Delegated Admins.

## Operation Preferences — The Math of Concurrency and Failure Tolerance

`MaxConcurrentCount` and `FailureToleranceCount` are the heart of StackSets operations. They look simple but contain deep operational failure-handling policy.

```bash
aws cloudformation create-stack-instances \
  --stack-set-name BaselineGuardrails \
  --deployment-targets '{"OrganizationalUnitIds":["ou-workloads-abc"]}' \
  --regions ap-northeast-2 us-east-1 eu-west-1 \
  --operation-preferences '{
    "RegionConcurrencyType":"PARALLEL",
    "MaxConcurrentCount":20,
    "MaxConcurrentPercentage":10,
    "FailureToleranceCount":5,
    "FailureTolerancePercentage":2
  }'
```

- **MaxConcurrentCount**: How many Stack Instances to process simultaneously. Among 200 accounts × 3 regions = 600 Instances, handle 20 at a time.
- **MaxConcurrentPercentage**: Specify as ratio (%). Takes precedence over Count if used.
- **FailureToleranceCount**: Cumulative failure tolerance. When this number is reached, stop entire operation.
- **FailureTolerancePercentage**: Tolerance as ratio. 2% of 600 Instances = 12 failures allowed.
- **RegionConcurrencyType**: PARALLEL (all regions simultaneously) vs SEQUENTIAL (region by region).
- **RegionOrder**: When SEQUENTIAL, specify region order explicitly.

How to set these numbers? **Too high bursts CloudFormation API rate limits and Lambda concurrency,** **too low turns 1000-account deployment into days**. Practical guidelines:

| Environment Scale | MaxConcurrentCount | FailureTolerance | Region Strategy |
|---|---|---|---|
| Small (10-50 accounts) | 5-10 | 1-2 | PARALLEL |
| Medium (50-200 accounts) | 20-30 | 5 (1%) | PARALLEL |
| Large (200-1000 accounts) | 50-100 | 1-2% | prod region SEQUENTIAL first, rest PARALLEL |
| Very large (1000+ accounts) | 100+ | 1% | First canary region SEQUENTIAL, rest PARALLEL after validation |

> 🎯 **Scenario**: "Deploy security baseline to 500 accounts: fail immediately on first 5, then tolerate 1% failure." — Answer is two-stage deployment: Stage 1 canary 5 accounts with FailureToleranceCount=0 (immediate stop at even one failure), Stage 2 remaining 495 with FailureTolerancePercentage=1. CFN StackSets has no built-in canary stage, so you call create-stack-instances twice to construct it yourself.

> 🔍 **Deeper**: When failure reaches FailureToleranceCount, **Stack Instances already in progress continue to completion**. That is, even if the 5th failure occurs in "20 concurrent + 5 tolerance," the running 15 don't stop. Only new Instances stop starting. So actual final failures can exceed FailureToleranceCount. Operators must track operation status via SNS alerts and if needed call stop-stack-set-operation to force-stop.

## AccountFilterType — Four Set Operations

Service-managed mode specifies OU and Accounts together, performing set arithmetic.

```bash
--deployment-targets '{
  "OrganizationalUnitIds": ["ou-prod-1234"],
  "AccountFilterType": "DIFFERENCE",
  "Accounts": ["111111111111", "222222222222"]
}'
```

| Filter | Meaning | Use Case |
|--------|---------|----------|
| **NONE** (default) | All accounts in OU | Typical OU-wide deployment |
| **INTERSECTION** | OU ∩ Accounts | Specific accounts within OU |
| **DIFFERENCE** | OU - Accounts | Exclude some accounts from OU |
| **UNION** | OU ∪ Accounts | OU + additional accounts |

DIFFERENCE is particularly useful for "deploy to entire OU except 2 accounts in mid-migration." UNION is useful for "gradually migrate by including one legacy account outside OU temporarily." INTERSECTION is useful for "canary 5 specific accounts within prod OU."

> ⚠️ **Pitfall**: The Accounts list in AccountFilterType is evaluated exactly as specified regardless of OU membership. That is, specifying OU-external accounts in UNION actually deploys to those accounts. This OU-external deployment falls outside audit flow in operational standards, so better to restructure the OU itself. UNION should be "temporary"; if it becomes permanent, governance leaks.

## Auto-deployment and RetainStacksOnAccountRemoval

Service-managed's most powerful feature is Auto-deployment. The instant a new member account joins an OU, all Stack Instances defined in the StackSet are auto-created. When combined with Account Factory (Service Catalog or Control Tower), **new account provisioning → automatic baseline application → automatic security guardrail activation** proceeds entirely without human hands.

```bash
aws cloudformation create-stack-set \
  --stack-set-name BaselineGuardrails \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-url ...
```

The meaning of `RetainStacksOnAccountRemoval` is important. When a member account leaves an OU or is removed from Org, what happens to that account's Stack Instances?

- `false`: Account leaves OU → Stack auto-deleted — most common, removes stale permissions
- `true`: Account leaves OU → Stack retained — M&A account separation, leftover workload handling

The default is `false`, which is safer from security, but **Stack-included RDS/S3 data disappears with Stack deletion risk**. So stateful resource StackSets should use (1) per-resource `DeletionPolicy: Retain` setting, or (2) RetainStacksOnAccountRemoval=true.

> 📚 **Case Study**: In 2021 a fintech removed 5 subsidiary AWS accounts from Org due to subsidiary sale, and StackSets-deployed baseline Stacks auto-deleted, erasing the CloudTrail Trails inside them. Result was loss of 90 days of audit logs before the sale. After that, company standard became "Stacks containing audit/logging resources use RetainStacksOnAccountRemoval=true + resource DeletionPolicy=Retain."

## StackSets and Control Tower / Conformance Pack Boundary

This area frequently confuses on tests. All three "apply governance to multiple accounts."

| Tool | What Deploys | Auto-apply to New Accounts | Auto-fix |
|------|---|---|---|
| **CloudFormation StackSets** | Any CFN template | Auto-deployment | ❌ (Drift detection only) |
| **AWS Control Tower** | Predefined Landing Zone + Guardrails | Account Factory auto | Partial (Proactive guardrails) |
| **Config Conformance Pack** | Config Rules bundle | Org Conformance Pack | ✅ (Remediation Action) |
| **Service Catalog** | Product catalog exposed to users | Users launch | ❌ |

Selection criteria:
- Deploy arbitrary resources (IAM, VPC, alarms) → **StackSets**
- Standard multi-account environment + guardrails together → **Control Tower** (uses StackSets internally)
- Evaluation/monitoring/auto-fix rules → **Config Conformance Pack**
- Standard products for user self-service → **Service Catalog**

Control Tower internally uses StackSets, resulting in `AWSControlTower*` prefixed Stacks in member accounts. Directly modifying Stacks managed by Control Tower is immediately caught as drift and overwritten on next Landing Zone update.

> 💡 **Related Theory**: StackSets(generic) → Control Tower(landing zone specialized) → AWS Organizations(governance) hierarchy is the canonical 3-layer cloud governance structure. NIST SP 800-204C and CIS AWS Foundations Benchmark recommend multi-account strategy, and this is its concrete form. Typical company flow: quickly establish landing zone with Control Tower, then reinforce with domain-specialized resources via StackSets, separate evaluation/audit with Config Conformance Pack.

## Drift Detection at Scale — Handling 1000+ Instances

`detect-stack-set-drift` triggers drift detection against all Stack Instances simultaneously. With 1000 Instances, the task itself takes 30 minutes to hours, and results must be queried per Instance separately.

```bash
# Trigger
aws cloudformation detect-stack-set-drift \
  --stack-set-name BaselineGuardrails \
  --operation-preferences MaxConcurrentCount=10

# Track operation status
aws cloudformation describe-stack-set-operation \
  --stack-set-name BaselineGuardrails \
  --operation-id ...

# Results (per Instance)
aws cloudformation list-stack-instances \
  --stack-set-name BaselineGuardrails \
  --filters Name=DRIFT_STATUS,Values=DRIFTED
```

At scale, run this automatically on EventBridge schedule daily and send results to Security Hub or Slack. **Drift detects but doesn't auto-fix, so operators must judge whether unintended changes are intentional patches or mistakes**. Auto-fix needs Config Rules + SSM Automation Document combination.

> 🎯 **Scenario**: "Baseline Stack in 500 accounts — GuardDuty is off in one account. Detect automatically and alert." — Answer is (1) run StackSets Drift Detection daily via EventBridge → send DRIFTED list to SNS (detection side), (2) deploy Config Rule `guardduty-enabled-centralized` to Conformance Pack for all accounts → aggregate to Security Hub (real-time side), (3) for auto-fix register SSM Automation Document as Config Remediation to re-enable GuardDuty (fix side). Three-tool role separation.

## Summary

Today's picture has five parts. First, **StackSets = fan-out + single source of truth** and is a GitOps push model variant. Second, **Self-managed's chicken-and-egg problem** means Service-managed + Organizations is standard in reality. Third, **Delegated Administrator blocks Management Account from daily use** — AWS Well-Architected's top security recommendation. Fourth, **Operation Preferences concurrency/failure tolerance tunes by scale**, and canary stage requires operators calling twice. Fifth, **StackSets and Control Tower / Config Conformance Pack boundary** — tests frequently blur this, so arbitrary resources/landing zone/evaluation rules distinction is key.

Next we'll see Custom Resource and Module/Hook expanding CloudFormation's expressiveness. If SAM added abstraction via Transform Macro, Custom Resource is a more general mechanism to embed arbitrary Lambda into CFN's lifecycle.

---

## 📝 Practice Questions

**Question 1.** What is the most appropriate configuration so that a security baseline is automatically applied when a new member account is added to an OU, without operators having to touch it each time?

A) Self-managed StackSets + manual create-stack-instances
B) Service-managed StackSets + AutoDeployment Enabled + Organizations Trusted Access
C) Invoke Lambda from EventBridge
D) Pre-create an IAM role in each account and then invoke it stage by stage

**Answer: B**

Explanation: With service-managed, AWS automatically provisions the execution role (service-linked role) in member accounts through Org trusted access. When AutoDeployment Enabled is on, all stack instances are created automatically the moment a new account joins the OU. Self-managed (A, D) requires IAM roles in advance, which is a chicken-and-egg problem. Invoking Lambda directly (C) means you must implement idempotency, failure handling, and concurrency policy yourself, which is inefficient.

---

**Question 2.** You are deploying a security guardrail update to 200 accounts with a StackSet and need "stop everything immediately if a failure occurs in the first 5 accounts, and after that tolerate failures up to 1%." What is the most appropriate way to operate?

A) FailureToleranceCount=0, deploy to everything at once
B) FailureTolerancePercentage=1, deploy to everything at once
C) Stage 1: canary with FailureToleranceCount=0 on 5 accounts → after validation, stage 2: FailureTolerancePercentage=1 on the remaining 195 accounts
D) One account at a time from the console without any automation script

**Answer: C**

Explanation: StackSets has no built-in canary stage, so the operator composes the stages by calling create-stack-instances twice. Select only the stage 1 canary accounts with INTERSECTION or by specifying Accounts, and after validation apply to the remaining accounts with DIFFERENCE. A stops everything at the first failure, B has no canary stage, and D is unrealistic. It is frequently tested on the exam with the keyword "phased deployment."

---

**Question 3.** What is the most accurate characteristic of the IAM role that AWS automatically creates in member accounts for service-managed StackSets?

A) Users can freely delete it
B) It is created through the service-linked role mechanism, so arbitrary deletion is blocked by a dependency check, and the trust origin is the Organizations trust relationship
C) The IAM administrator of each account must write the trust policy directly
D) It is based on cross-account access keys

**Answer: B**

Explanation: A service-linked role (SLR) is an AWS managed role that can be deleted only when it passes the service dependency check, and permission modification is also restricted. The trust relationship starts from `organizations.amazonaws.com`, so impersonation from outside the organization is impossible — the key to security isolation. Unlike self-managed, operators do not touch the trust directly, so the operational burden is small when the company account structure changes.

---

**Question 4.** What is the key reason to register a delegated administrator?

A) Cost savings
B) Minimize everyday use of the management account to shrink the blast radius in a compromise — the top recommendation of the AWS Well-Architected Security Pillar
C) Region expansion becomes possible
D) Enables automatic IAM rotation

**Answer: B**

Explanation: The management account is a single point of risk with absolute authority over all member accounts. The standard is to minimize human logins and delegate everyday operations to the tooling/security accounts. The same pattern applies to GuardDuty, Config, Security Hub, and Access Analyzer. Control Tower enforces this pattern by automatically setting the Audit/Log Archive accounts as delegated administrators. It prevents cases like the 2019 root credential loss incident.

---

**Question 5.** One stack instance of a StackSet contains stateful resources (RDS, S3 with data). How do you protect the data when that account leaves the OU because a subsidiary is sold?

A) Only set AutoDeployment Enabled
B) RetainStacksOnAccountRemoval=true + DeletionPolicy=Retain on each resource (both policies)
C) Delete and recreate the StackSet
D) Exclude the account with AccountFilterType=DIFFERENCE

**Answer: B**

Explanation: With RetainStacksOnAccountRemoval=false (the default), the stack is deleted automatically when the account leaves the OU, and the RDS/S3 inside disappear with it. Setting it to true keeps the stack itself, and additionally DeletionPolicy=Retain on the resources preserves the data regardless of how the stack is deleted. A lesson from the 2021 fintech CloudTrail loss case. A is unrelated, C risks data loss, and D excludes the account from future deployments but does not protect data.

---

**Question 6.** What is the most appropriate use case for AccountFilterType=DIFFERENCE?

A) Including additional accounts outside the OU
B) Temporarily excluding two accounts in the middle of a migration within the OU from the deployment targets
C) All accounts in the OU
D) Only specific Regions

**Answer: B**

Explanation: DIFFERENCE = OU - Accounts. It is useful when you target the entire OU but temporarily exclude some. Use it for migrations, outages, and exceptional situations. UNION (A) includes additional accounts outside the OU on top of the OU, NONE (C) is the entire OU, and the Region filter (D) is a separate --regions option. The exam asks about the meaning of the four set operations themselves.

---

**Question 7.** In a 500-account environment, what is the most appropriate combination to evaluate in real time whether GuardDuty is enabled and even restore it automatically?

A) StackSets drift detection only
B) Deploy GuardDuty with StackSets + evaluate the Config rule `guardduty-enabled-centralized` as a conformance pack + automatically restore with an SSM Automation document as a Config remediation
C) Check directly with a single Lambda
D) Check manually every day in the console

**Answer: B**

Explanation: The three tools have separate roles — StackSets for resource deployment (prevention), Config rules for evaluation (detection), and SSM Automation for automatic restoration (remediation). StackSets drift detection is aperiodic/manually triggered and does not remediate automatically → it is not a standalone real-time solution. A conformance pack is a bundle that deploys Config rules consistently across the whole organization, so it is the standard for multi-account evaluation. The standard three-tier setup extends to aggregating in Security Hub for visibility.

---

## 📌 Today's Summary

The five key takeaways from today are as follows. First, StackSets combine fan-out and a single source of truth, and are the AWS version of the GitOps push model. Second, because of the chicken-and-egg problem of self-managed, service-managed + Organizations is the standard. Third, blocking everyday use of the management account with a delegated administrator is the top security recommendation of Well-Architected. Fourth, tune operation preferences by scale, and compose the canary yourself with two calls. Fifth, the boundaries between StackSets, Control Tower, and Config conformance packs — distinguished by arbitrary resources / landing zone / evaluation rules.
