# Day 5 - Week 9 Integrated Scenario: Configuration Management Across Fleet Scale

Across the five posts this week, we looked at tools that seem unrelated when viewed one by one: SSM Run Command, Session Manager, Patch Manager, State Manager, Inventory, AppConfig, Parameter Store, and Secrets Manager. But they are really different angles on the answer to a single question: **"How do you operate a fleet of thousands of machines, and the applications running on them, safely without humans touching them by hand?"** Today, instead of listing the individual features again, we tie them together as scenarios to see how these tools mesh into one picture in real operations. The DOP exam does not ask you to memorize a single feature; it asks "which combination fits this situation?", so training yourself to think in scenarios is exam preparation.

## Week 9 at a Glance: The Four Axes of Operations Automation

Organizing the Week 9 tools into four axes gives you the whole picture.

```
The 4 axes of operations automation
==================================================
[Command/Access]  Run Command (one-time commands) / Session Manager (shell, tunnel)
[Enforce State]   State Manager (apply desired state on a schedule) / Inventory (collection)
[App Config]      AppConfig (feature flags, dynamic config + validation + automatic rollback)
[Secrets]         Parameter Store (config, free) / Secrets Manager (rotation)
       └─ Common foundation: SSM Agent (pull model) · IAM · KMS · CloudTrail (audit)
```

Two shared principles run through all four axes. One is **declarative operations**: instead of "do this (command)", you declare "it must be in this state (goal)" and the system converges toward it on its own (State Manager, AppConfig, Patch Baseline). The other is **blast radius control**: you never apply a change to everything at once; you spread it gradually and stop on failure (max-concurrency/max-errors, AppConfig deployment strategies, Patch Maintenance Windows).

> 💡 **Related theory**: These two principles are core doctrine of reliability engineering. Declarative operations is **closed-loop control** from control theory: a feedback loop that keeps measuring the difference between the target state and the current state and works to reduce that error. The Kubernetes reconciliation loop, Terraform's desired state, and Git's declarative config all share the same root. Blast radius control is **progressive delivery** and the circuit breaker pattern, the rule of thumb that "change is risky, so split the risk into small pieces and detect problems quickly." The whole of Week 9 is the AWS implementation of these two principles.

> 📚 **Case**: The 2017 AWS S3 outage in us-east-1 is a textbook case of what happens when an operational command is thrown at everything without blast radius control. An engineer ran a debugging command meant to remove a few servers from the billing system, but because of a typo in the input, far more servers than intended were removed at once. Core subsystems of S3 went into cascading restarts, those restarts took hours, and many services across us-east-1 stopped. The lesson is clear: a fleet-scale command must have controls that apply it to only a portion at a time (max-concurrency) and stop on failure (max-errors). AWS afterward added a safety limit on how fast that tool can remove capacity. The gradual rollout of Run Command and the Maintenance Window of Patch Manager that we saw in Week 9 are exactly the mechanisms that prevent this kind of incident.

## Crossroads in Tool Selection, Seen Through Scenarios

What is easy to confuse on the exam is "which of two similar-looking tools is the right one." If you sort out the key crossroads in advance, the scenarios become easy.

**Run Command vs State Manager.** Both run commands on instances. The difference is time. Run Command is **one-time**: you fire it once, now. State Manager is **periodic and continuous**: it enforces "it must always be in this state" on a schedule and reports compliance. "One emergency patch right now" means Run Command; "the CloudWatch Agent must always be installed on every instance" means State Manager.

**AppConfig vs Parameter Store.** Both hold configuration. The difference is the safety mechanisms. Parameter Store only stores values. AppConfig is a "configuration deployment pipeline" with **a deployment strategy (gradual rollout) + a Validator (validation before deployment) + a Monitor (automatic rollback when an alarm is detected)**. If "a bad configuration must be automatically rolled back when deployed", choose AppConfig; if it is "just reading a value", choose Parameter Store.

**Secrets Manager vs Parameter Store (SecureString).** Both store secrets encrypted. The difference is rotation. If you need rotation, use Secrets Manager; if the secret is static, use Parameter Store. And the cost differs by a factor of ten.

**Session Manager vs Bastion.** Both are ways to reach private instances. A Bastion exposes port 22 to the internet and must always be running, making it an attack target. Session Manager connects with an IAM identity without any open port and audits the entire session. Choosing a Bastion in a new design is a wrong answer.

**StackSets vs individual stacks.** When deploying the same infrastructure to multiple accounts and multiple Regions, creating a stack separately in each account makes the operational burden explode. StackSets deploys one template to many accounts and Regions at once, and when integrated with Organizations (Service-managed) it works at the OU level and even supports automatic deployment to new accounts (Auto-deployment). If the clues are "organization-wide", "all member accounts", and "automatic when a new account is added", it is StackSets.

Compressing these crossroads into a single table gives you something you can pull out instantly in the exam room.

| Confusing pair | Deciding criterion | Clue keywords |
|---|---|---|
| Run Command vs State Manager | One-time vs periodic enforcement | "always", "periodically", "also for new instances" → State Manager |
| AppConfig vs Parameter Store | Gradual deployment and automatic rollback or not | "without redeploying code", "automatic rollback", "feature flag" → AppConfig |
| Secrets Manager vs Parameter Store | Whether rotation is needed | "rotate every 30 days", "zero-downtime" → Secrets Manager |
| Session Manager vs Bastion | Port exposure and auditing | "remove SSH keys", "session auditing", "without a Bastion" → Session Manager |
| StackSets vs individual stacks | Multi-account and automatic deployment | "entire organization", "new accounts automatically" → StackSets |

> Underneath these crossroads lies a hidden grading criterion of the exam: "operational overhead." The DOP exam asks not for "an answer that works" but for "the answer with the least operational overhead that is also safe." So even when two answers produce the same result, an answer that uses a managed feature (State Manager, --manage-master-user-password, AppConfig automatic rollback) is more likely to be correct than one that has you build it directly (high overhead), such as writing a Lambda function. When the options say "write a Lambda function to...", "run a script with cron", or "provision an EC2 instance to...", first suspect that there is a more managed alternative. This is the meta-strategy for solving DOP scenarios.

> 🎯 **Scenario**: "Automatically deploy the same SSM Patch Baseline and IAM role to 50 member accounts across the organization, and it must apply automatically when a new account is added to the OU." The answer is CloudFormation StackSets with Service-managed permissions + Auto-deployment. StackSets deploys stacks per OU, and when AutoDeployment is turned on, the stack is deployed automatically whenever a new account enters the OU. An answer that uses Lambda to detect account additions and then deploy (high operational overhead), or manual deployment, is wrong. When the clue "organization-wide, automatic when an account is added" appears, think of StackSets Auto-deployment.

> 🎯 **Scenario**: "We operate a hybrid of an on-premises data center and AWS. We want to manage passwords, access, and patching in both environments with as uniform a toolset as possible." The answer is to make full use of SSM's hybrid extension. If you register on-premises servers as mi- managed instances with a Hybrid Activation, Run Command, Session Manager, Patch Manager, and Inventory work exactly as they do on EC2; for secrets, keep Secrets Manager as the single source of truth, and on-premises apps read the same secrets over VPN/Direct Connect. The key is "do not run two sets of tools": in a hybrid scenario, choosing a separate on-premises-only tool as the answer is almost always wrong.

## Wrap-Up

The way of thinking that runs through Week 9 is this. When you read a problem, first identify **which of the 4 axes it belongs to** (command/access, state enforcement, app configuration, secrets), and then work through, in order, **time (one-time vs continuous)**, **safety mechanisms (whether rollback or validation is needed)**, **operational overhead (managed first)**, and **audit requirements (CloudTrail, session logs)**. These four questions solve almost every Week 9 scenario. The 10 questions below cement that way of thinking.

---

## 📝 Practice Questions

**Question 1.** The payments team is migrating to a new payment gateway. Of the 5000 payment servers, some have already switched to the new gateway and some still use the old gateway. You must check the current gateway endpoint of each server, immediately identify the list of servers that have not yet switched, and gradually switch (10% per hour) the remaining servers. Which configuration satisfies all three requirements?

A) Run grep scripts everywhere with SSM Run Command to collect the current endpoints and analyze manually
B) (1) Collect gateway-endpoint with an SSM Inventory custom attribute + Resource Data Sync → understand the status with an Athena query, (2) store the gateway endpoint in AppConfig + a Linear 10% per hour deployment strategy, (3) validate endpoint connectivity with a validator Lambda during deployment
C) SSH into every server to verify and update manually
D) Change the roles of 5000 instances with CloudFormation and reboot

**Answer: B**

Explanation: Each of the three problems needs a different tool: (1) understanding the status = Inventory (collection) + Athena (SQL analysis), (2) gradual switch = an AppConfig feature flag or endpoint configuration, (3) safety = a validator Lambda (gateway connectivity test). A only collects manually and cannot do central management or gradual rollout, and C/D are unrealistic at this scale. Answer: the combination of understanding the status with Inventory and then deploying gradually with AppConfig.

---

**Question 2.** A logging agent must be installed on all prod instances. New instances keep launching in the ASG, the agent version must stay the same across the whole fleet, and the agent must be restored automatically if it is deleted or crashes. Which design satisfies all the requirements?

A) Install with a CloudFormation user data script — new instances get it, but it is not restored if deleted, and version control is difficult
B) Define the package with SSM Distributor + declarative deployment with a State Manager association — new instances are included automatically when tags match, drift is remediated by periodic execution, and the version is the single source of truth
C) Run Run Command every hour — new instances are not included automatically, cron-based polling is inefficient
D) Include it only in the container image

**Answer: B**

Explanation: State Manager declares "this state is always true" and enforces it periodically. When Distributor defines the package and State Manager pins the version and deploys it, you get (1) automatic inclusion of new instances (tags), (2) automatic restoration on deletion (drift), and (3) version consistency (single source of truth). CloudFormation (A) guarantees only the deployment time, Run Command (C) is one-time, and containers (D) are unsuitable for host OS-level agents (security and monitoring agents).

---

**Question 3.** Patch Manager runs at 3 AM, and a specific application that integrates data with the RDS database experiences momentary connection loss due to the patch-induced reboot. How can you patch 5000 app servers within a tight downtime budget (< 30 seconds)?

A) Patch one at a time with Patch Manager `max-concurrency 1` — takes too long
B) Run 2 batches of half each with `max-concurrency 50% + max-errors 5`, implementing a graceful drain of the RDS connection pool before each batch starts patching — some disruption from the first batch is unavoidable, but the app recovers through automatic retries
C) Strengthen connection pooling + retry logic + store DB credentials in Secrets Manager + tune connection retry settings + selectively increase the retry delay with AppConfig before the patch maintenance window
D) Do not patch at all

**Answer: B** or **C** (depending on the situation)

Explanation: B is the **immediate fix** (Patch Manager settings only). After patching 50%, the apps recover through automatic reconnection, then the next batch. A takes unrealistically long, and D worsens security. 

The deeper answer is C — **gradual hardening**: first move the patch maintenance window to the application low-traffic hours, make connection pooling + retry logic the baseline, and adjust the retry backoff per situation in AppConfig. Rotating the Secrets Manager DB credentials as well increases overall operational robustness. B is the emergency measure, and C is the long-term improvement of the system.

---

**Question 4.** You are rotating the MySQL root password monthly in Secrets Manager. The rotation Lambda failed at 2 hours 30 minutes. What is the current state and the response?

A) The password is automatically rolled back to the previous one and all apps work normally
B) Rotation status = FAILED, the secret = the old password retained (AWSCURRENT), app connections are normal. The operator checks the Lambda logs, fixes the cause, and retries
C) App connections are dropped
D) The new password is forcibly applied

**Answer: B**

Explanation: When a rotation fails, the secret stays in its original state (AWSCURRENT = the old password). Apps are fine. Manual operator intervention is required. Causes: a Lambda timeout (database unreachable, network problems), validation failure, an RDS permission change, and so on. Check the CloudWatch Logs, remove the cause, and re-run the RotateSecret API. A rollback (A) is not possible automatically because the change may already have been made on the DB side, and forced application (D) does not exist.

---

**Question 5.** A feature is being deployed in AppConfig with Linear 5% per minute, and the metrics look abnormal at the 10-minute mark. How do you prevent proceeding to the next step?

A) Automatically stop the deployment in AppConfig
B) Stop automatically from the AppConfig validator Lambda
C) Watch deployment events with EventBridge → SNS notification → the operator calls the StopDeployment API, or trigger an automatic rollback Lambda based on CloudWatch metrics
D) AppConfig has no automatic stop feature

**Answer: C**

Explanation: An AppConfig deployment strategy keeps proceeding until a validator failure (there is no way to stop it manually). Metric-based automatic stopping must be implemented externally with EventBridge + Lambda. For example: a CloudWatch alarm (error rate spike) → EventBridge → Lambda calls StopDeployment. Or notify the operator through SNS and have them decide manually. Answer: external automation is needed.

---

**Question 6.** A database endpoint stored in Parameter Store is referenced dynamically from CloudFormation. What happens when the endpoint changes?

A) CloudFormation detects it automatically and updates the stack
B) The dynamic reference is resolved only at deployment time — even if the parameter changes, CloudFormation does not know until it runs again. The stack must be redeployed to see the new endpoint
C) CloudFormation is never changed
D) EventBridge detects the Parameter Store change and updates the stack automatically

**Answer: B**

Explanation: `{{resolve:ssm:/db/endpoint:1}}` is resolved only at **CloudFormation deployment/update execution time**. It does not track runtime changes. For an endpoint change to be reflected in resources immediately, you must (1) have the application poll Parameter Store directly at runtime, (2) use an intermediate layer such as RDS Proxy, or (3) update the stack every time. In most cases (1) is the recommended pattern.

---

**Question 7.** The audit team of a financial company asks: "Submit as evidence the records of system changes executed on all prod instances over the past 90 days." What should you prepare?

A) Collect SSH logs (highly tamperable, incomplete)
B) (1) Run Command execution records are all logged in CloudTrail, (2) Session Manager session logs are recorded tamper-proof in CloudWatch Logs + S3 (KMS), (3) track configuration changes with State Manager compliance reports, (4) all SSM operations are recorded in CloudTrail. This combination of four is the audit trail
C) Monitor with a CloudWatch dashboard
D) Impossible, ignoring financial regulatory requirements

**Answer: B**

Explanation: Audit evidence needs multiple layers. CloudTrail (who, when), Session Manager logs (what), and compliance reports (state changes). Each is recorded tamper-proof at the AWS managed account level, so it satisfies SOC 2/PCI/financial supervisory requirements. SSH logs are at the instance level, so operators are likely to erase them. The CloudTrail + Session Manager combination is the standard answer for regulatory requirements.

---

**Question 8.** You want to deploy a new CloudWatch agent configuration to 5000 instances across the fleet. If the configuration is faulty, only a few instances should be affected and recovery must be quick. What is the deployment procedure?

A) Deploy to all instances at the same time
B) Like SSM Patch Manager, `max-concurrency 10% (500 instances) + max-errors 5` → deploy to only 500 first, stop immediately when 5 failures are reached, protecting the remaining 4500
C) Deployment is not possible
D) Manually over SSH, one at a time

**Answer: B**

Explanation: Run Command has the same blast radius control (max-concurrency/max-errors). Detect a problem in the first batch (10% = 500 instances) and stop immediately → protecting 4500. It is the same pattern as Patch Manager. A blows everything away, and C/D are not possible at scale.

---

**Question 9.** A developer accidentally pushed a Secrets Manager API key to GitHub. What action should be taken immediately?

A) Only delete the commit from GitHub — the pushed key can already be scraped from the internet
B) (1) Immediately create a new version in Secrets Manager (trigger an automatic rotation), (2) audit who has already used this key (CloudTrail records), (3) revoke the key at the external API service (Datadog and so on), (4) deploy so the app code reads the new key
C) Ignore it — once it is on GitHub, it is already exposed
D) Only draft a long-term avoidance strategy

**Answer: B**

Explanation: Exposure of sensitive information requires a direct response. (1) Rotate the key (create a new version), (2) audit (who used it), (3) external revoke (invalidate it at the API service), (4) deploy the app. It must be completed within an hour or two to prevent widespread abuse. Deleting from GitHub (A) is already too late, and ignoring (C) / postponing (D) is dangerous.

---

**Question 10.** You want to enforce an operating standard company-wide. How do you codify "every application database endpoint must be fetched only from Parameter Store, and every instance must have the CloudWatch agent installed"?

A) Distribute a document to each team and rely on voluntary compliance — no enforcement
B) (1) Database endpoint = Parameter Store → enforce the SSM parameter reference rule with a cdk-nag rule + validate at deployment time with Hooks, (2) CloudWatch agent = State Manager + Inventory collection to generate compliance reports automatically, (3) non-compliant services are automatically shown on CloudWatch alarms + dashboards
C) Audit with Lambda every time
D) Manual monitoring

**Answer: B**

Explanation: Enforcing a standard = codification + automated verification + auditing. A three-tier defense of the development stage (cdk-nag), the deployment stage (Hooks), and the operation stage (Inventory + Compliance). Documentation (A) does not guarantee compliance, Lambda auditing (C) only detects and does not enforce, and manual (D) cannot monitor thousands of resources.

---

**Question 11.** You must apply a common security baseline (GuardDuty, CloudTrail, Config) to all of the company's AWS accounts (200) at once, and it must be applied automatically when a new account is added. How do you implement it while minimizing direct contact with the management account?

A) Self-managed StackSets, manually adding each account ID and IAM execution role — unrealistic for 200 accounts plus new ones every week, and requires periodic contact with the management account
B) Service-managed StackSets + delegated administrator + AutoDeployment Enabled + OU targeting — deploys automatically when a new account is added to the OU
C) Detect account creation events with Lambda and deploy to each account — idempotency, failure retries, and rollback must be implemented yourself
D) Deploy manually to each account

**Answer: B**

Explanation: Three requirements: (1) 200 accounts = service-managed, (2) automatic for new = AutoDeployment, (3) protecting the management account = delegated administrator. B is the only combination. The chicken-and-egg problem of self-managed (A) (IAM needed in advance), the state management complexity of Lambda (C), and the impossibility of manual (D) at scale.

---

**Question 12.** Policy change: how do you enforce "all logs must be KMS encrypted" on 100 existing resources (CloudTrail, VPC Flow Logs, ALB logs, and so on) at once?

A) Update manually one by one
B) Detect non-compliance with an AWS Config custom rule → start automatic remediation with EventBridge + Systems Manager Automation (or a custom runbook) → feedback loop (automatic retries, failure notifications)
C) Build a Lambda and poll periodically
D) Impossible

**Answer: B**

Explanation: The detect-assess-remediate closed loop. A Config rule detects, an Automation runbook remediates, and the Config rule verifies again. It guarantees scale and consistency. Manual (A) is unrealistic for 100 resources, and Lambda polling (C) is heavy on state management and not a standard.

---

## 📌 Week 9 Complete

Week 9 covered **configuration and compliance at scale**. Unlike the shape of infrastructure (Week 8), it is the part about how to manage the configuration, secrets, and state that infrastructure needs in order to operate. The key is to understand that the boundaries between SSM, AppConfig, Parameter Store, and Secrets Manager are clear, and that each implements the same mechanisms (declarative, versioned, audit-enabled) along a different dimension.

Combining Week 8 and Week 9 gives a **complete operating paradigm**: 
- Codify the shape of infrastructure with IaC (Week 8)
- Maintain the operating state declaratively with configuration management (Week 9)
- Both follow the principles of gradual rollout + audit

The next two weeks (Weeks 10-11) move on to **monitoring, logging, and failure analysis**. Only with a solid foundation can you take the next step.

---

## 📌 Final Summary

**Day 1**: SSM agent pull model → blast radius control of Run Command → ZTNA of Session Manager → bake time of Patch Manager

**Day 2**: State Manager declarative state + Inventory asset collection + Compliance → Security Hub integrated monitoring

**Day 3**: AppConfig feature flag dynamic control + deployment strategy gradual rollout + validator pre-validation

**Day 4**: Parameter Store configuration storage (cheap and simple) versus Secrets Manager secret management (expensive but with rotation)

**Day 5**: 12 integrated scenarios — one problem = a combination of 3-4 tools; the criteria for choosing a tool = abstraction dimension + scale + change timing

Exam preparation: if you repeatedly work through the 12 scenarios of Week 9, most real exam questions will not stray far from these patterns. Understanding each tool on its own is important, but the ability to combine them is more important.
