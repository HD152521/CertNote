# Day 2 - SSM Automation: Operational Procedures as Code, and People Inside the Workflow

The deepest debt in an operations organization lives not in code but in people's heads. "When restarting the production DB, first check the Read Replica lag, see whether the backup has finished, get approval from two senior engineers, drain the traffic, restart it, and once the health check passes, put the traffic back." This procedure exists only in a wiki page or in a veteran's experience. When that veteran goes on vacation or leaves the company, the same procedure gets reproduced at 3 a.m. by an on-call engineer's trembling hands, and if one step is skipped, an incident happens. A **runbook** is this procedure written down in prose, and **Runbook-as-Code** is that procedure turned into executable code. SSM Automation is the tool that implements this on AWS — you write the operational procedure as a declarative workflow and weave AWS API calls, scripts, conditional branches, and human approvals into it as steps.

Today we don't look at SSM Automation merely as a "remediation executor"; we dig into the workflow model underneath. We look at which workflow-engine lineage the Automation Document belongs to, why human-in-the-loop steps such as `aws:approve` resolve the paradox of automation, how Step Functions and Automation differ, and which fundamental problems of workflow engines idempotency and output passing address. In the DOP exam, SSM Automation is the flagship service for Operational Excellence and incident automation, and it is tested as "how do you codify a procedure," "how do you insert a human gate into an automated response," and "how do you apply the same remediation to hundreds of accounts at once."

## The History of the Runbook — From Paper on the Operations Room Wall to Code

The word "runbook" comes from mainframe-era data centers. The binder in which operators wrote down the procedures for overnight batch jobs, incident response, and system restarts was literally a "run book." When the computer stopped, the operator opened that book and followed the steps. As this paper procedure was digitized it became wikis and checklists, and together with the DevOps movement it evolved into the concept of the **executable runbook** — the idea of turning a procedure from prose that people read into code that machines execute.

This evolution has stages. First paper (human-executed), then a collection of scripts (semi-automated), then a workflow engine (fully orchestrated). SSM Automation is the last stage: each step of the procedure is written as declarative YAML/JSON, and SSM manages the state transitions. People declare only "what to do," and the engine takes care of "how to execute, retry, and branch."

```
[Paper binder in the ops room] → [Wiki checklist] → [Individual scripts] → [SSM Automation Document]
   human-executed                  semi-manual         scripted              fully orchestrated
   (depends on veterans)           (copy-paste runs)   (glue code)           (declarative workflow + audit)
```

> 💡 **Related theory**: Runbook-as-Code is the implementation of **"operations as code,"** a core principle of Operational Excellence. The Operational Excellence pillar of the AWS Well-Architected Framework says, "Defining operational procedures as code enables consistency, reproducibility, version control, and testing." It applies the same philosophy as treating infrastructure as code (IaC) to operational procedures. The key benefits: when a procedure is code, (1) it is version-controlled and reviewed in Git, (2) it is identical no matter who runs it (removing dependence on veterans), (3) every execution is audited in CloudTrail, and (4) when you improve the procedure after an incident, the next incident automatically benefits. This connects to the SRE principle that "the surest way to reduce human error is to take humans out of the procedure."

## The Automation Document — Anatomy of a Declarative Workflow

There are several kinds of SSM Document, and among them **Automation** (`schemaVersion: '0.3'`) is the one for workflows.

| Document Type | Purpose |
|---------------|------|
| `Automation` | Multi-step workflow (today's topic) |
| `Command` | Run Command — runs shell/PowerShell on an instance |
| `Session` | Session Manager connection settings |
| `Package` | Distributor — software distribution |
| `Policy` | State Manager — maintain a desired state |

The skeleton of an Automation Document is parameters + main steps (mainSteps).

```yaml
schemaVersion: '0.3'
description: Auto-remediate unencrypted S3 buckets
assumeRole: '{{AutomationAssumeRole}}'   # The IAM role this workflow will assume
parameters:
  BucketName: {type: String}
  AutomationAssumeRole: {type: String}
mainSteps:
  - name: CheckEncryption
    action: aws:executeAwsApi
    inputs:
      Service: s3
      Api: GetBucketEncryption
      Bucket: '{{BucketName}}'
    onFailure: 'step:EnableEncryption'   # Branch on failure
    isCritical: false
  - name: EnableEncryption
    action: aws:executeAwsApi
    inputs:
      Service: s3
      Api: PutBucketEncryption
      Bucket: '{{BucketName}}'
      ServerSideEncryptionConfiguration:
        Rules: [{ApplyServerSideEncryptionByDefault: {SSEAlgorithm: AES256}}]
```

`assumeRole` is the key — Automation operates with the permissions of the IAM role specified in the document, not the permissions of the person who ran it. Thanks to this, privilege delegation becomes possible: "an operator without permissions can perform limited tasks through an approved runbook."

> The `assumeRole` of an Automation Document is an important security pattern: **repositioning the permission boundary**. Instead of giving operators `s3:PutBucketEncryption` directly, you put that permission in the runbook's role and give operators only `ssm:StartAutomationExecution` (restricted to specific documents). Then operators can use that permission only through "this vetted procedure" and cannot wield it arbitrarily. This implements the **principle of least privilege** at the level of a procedure — the same idea as sudo allowing privilege escalation for "specific commands only." On the exam, the answer to "allow only controlled tasks without giving operators dangerous permissions directly" is often this pattern.

## Kinds of Step Actions — The Primitive Operators of the Workflow

Automation's expressiveness comes from step actions. Each step has one action type.

| Action | Purpose |
|--------|------|
| `aws:executeAwsApi` | Call an AWS API directly (the most general-purpose) |
| `aws:runCommand` | Run Run Command on an instance |
| `aws:invokeLambdaFunction` | Invoke Lambda (custom logic) |
| `aws:executeStateMachine` | Start Step Functions (delegate complex branching) |
| `aws:approve` | **Wait for human approval** |
| `aws:branch` | Conditional branch |
| `aws:waitForResource` | Wait for a resource state (such as RDS available) |
| `aws:sleep` | Wait for a period of time |
| `aws:executeScript` | Inline Python/PowerShell script |
| `aws:createImage` / `aws:runInstances` | Create an AMI / launch EC2 |

These steps can pass outputs to the next step.

```yaml
- name: GetSnapshot
  action: aws:executeAwsApi
  outputs:
    - {Name: SnapshotId, Selector: $.SnapshotId, Type: String}
  inputs: {Service: ec2, Api: CreateSnapshot, VolumeId: '{{VolId}}'}
- name: TagSnapshot
  action: aws:executeAwsApi
  inputs:
    Service: ec2
    Api: CreateTags
    Resources: ['{{GetSnapshot.SnapshotId}}']   # Reference the previous step's output
```

> Output passing between steps (`{{Step.Output}}`) and branching (`aws:branch`) make Automation not a simple script but a **stateful workflow**. This model connects to **DAG (directed acyclic graph) execution**, the classic of workflow engines — a graph in which each step is a node and output dependencies are edges. Apache Airflow's DAGs, AWS Step Functions' state machines, and GitHub Actions' job dependencies all share the same lineage. However, Automation does not provide branching, parallelism, and Map as rich as Step Functions — so when complex branching is needed, it delegates to Step Functions with `aws:executeStateMachine`. The boundary: **operational procedures that are linear to lightly branching go to Automation; complex state transitions, parallelism, and long-running execution go to Step Functions**.

## aws:approve — The Human Gate That Resolves the Paradox of Automation

The paradox of full automation is that the more dangerous the task, the scarier it is to automate. If you leave "terminate the production DB" to unattended automation, a single false positive kills a perfectly healthy DB. But if a person does everything by hand from start to finish, the benefit of automation disappears. **`aws:approve`** is the answer in between — it stops the workflow right before the dangerous step and waits for human approval.

```yaml
- name: ApproveTermination
  action: aws:approve
  timeoutSeconds: 3600
  inputs:
    NotificationArn: arn:aws:sns:...:OncallTopic
    Message: 'Terminate prod instance {{InstanceId}}? GuardDuty critical finding.'
    MinRequiredApprovals: 2
    Approvers:
      - 'arn:aws:iam::...:role/SeniorOps'
      - 'arn:aws:iam::...:user/secops-lead'
```

`MinRequiredApprovals: 2` is **multi-party authorization** — it proceeds only with approval from two or more people, not one. It is the same idea as the "two-person rule" for nuclear launch codes.

> `aws:approve` is the implementation of **human-in-the-loop (HITL)** automation. Between fully autonomous and fully manual, it is a model in which the system automates most of the work but inserts human judgment only at decisive, irreversible points. The important distinction here is **reversibility** — like Jeff Bezos's "Type 1 (irreversible) vs. Type 2 (reversible) decisions" framing, tasks that can be undone (adding a tag) are automated quickly, and tasks that cannot be undone (terminating an instance, deleting data) get a human approval gate. The multi-party approval of `MinRequiredApprovals: 2` is the security **separation of duties** and the **two-person rule**, preventing one person's mistake or malice from carrying out a destructive action alone. This is why compliance frameworks such as SOX and PCI-DSS require separation of duties.

> ⚠️ **Trap**: You must always set a **timeout** on `aws:approve`. If an approval step has no timeout, then when the approver misses the notification or is away, the workflow is stuck indefinitely — the automation freezes forever in the "waiting for approval" state in the middle of an incident. Set `timeoutSeconds`, and on timeout use `onFailure` to branch to escalation (calling the next approval group) or to a safe default action (do nothing and hand off to a person). One more thing: verify that the approval notification ARN (SNS) actually reaches people — if the topic subscription is broken, the approval request vanishes into thin air.

## AWS Managed Runbooks — Don't Reinvent the Wheel

AWS provides hundreds of prebuilt Automation Documents. For common operational tasks, the standard practice is to look for a managed document before writing your own.

| Runbook | Purpose |
|---------|------|
| `AWS-StopEC2Instance` / `AWS-StartEC2Instance` | Start/stop EC2 |
| `AWS-RestartRdsInstance` | Restart RDS |
| `AWS-DisablePublicAccessForS3Bucket` | Block S3 public access |
| `AWSSupport-TroubleshootRDP` | Diagnose EC2 RDP |
| `AWS-EnableS3BucketEncryption` | Enable S3 encryption |
| `AWSConfigRemediation-*` | Automatically remediate Config rule violations (dozens of them) |

The `AWSConfigRemediation-*` family in particular ties directly into automatically remediating AWS Config rule violations — when Config detects "this bucket is not encrypted," the corresponding remediation document fixes it automatically.

> A fintech company was told in a compliance audit that "publicly accessible S3 buckets" kept appearing periodically. Developers repeatedly left buckets open to the public by mistake. They detected it with the AWS Config rule `s3-bucket-public-read-prohibited` and connected the managed runbook `AWS-DisablePublicAccessForS3Bucket` as automatic remediation on violations. But they missed one thing at first — when they applied immediate remediation without `aws:approve`, it also closed the static website buckets that were meant to be public, and the service went down. The lesson: automatic remediation is powerful, but if you apply it across the board without a tag-based filter or approval gate that distinguishes exceptions (intentional settings), it breaks healthy resources. Afterward they narrowed the scope so that buckets tagged `Exempt=true` were excluded from remediation.

## EventBridge → Automation — From Detection to Response

If the EventBridge we saw yesterday detects "what happened," SSM Automation executes "so what will we do about it." Connecting these two is the core pattern of automated incident response.

```json
// EventBridge Rule: GuardDuty high-severity detection
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{"numeric": [">=", 7]}],
    "type": [{"prefix": "UnauthorizedAccess:EC2/"}]
  }
}
```

If you specify an SSM Automation document as the target, a GuardDuty detection immediately triggers the isolation workflow.

```json
{
  "DocumentName": "AWS-IsolateEC2Instance",
  "Parameters": {"InstanceId": ["$.detail.resource.instanceDetails.instanceId"]}
}
```

> 🎯 **Scenario**: GuardDuty detected Bitcoin mining traffic (`CryptoCurrency:EC2/BitcoinTool`) from an EC2 instance with severity 8. Target flow: (1) an EventBridge Rule catches findings with severity>=7 and triggers SSM Automation → (2) Automation moves the instance to an isolation security group (`sg-quarantine`) with `aws:executeAwsApi` (blocking inbound and outbound) → (3) creates a forensic snapshot with `aws:createImage` → (4) sends a Slack notification and Jira ticket with `aws:invokeLambdaFunction` → (5) waits for senior approval with `aws:approve` → (6) once approved, terminates the instance with `aws:executeAwsApi`. The key point is that isolation, evidence preservation, and notification run immediately and unattended (reversible, non-destructive), while termination (irreversible, destructive) comes after human approval. The reason to isolate before terminating is MTTR — contain the threat immediately to stop damage from spreading, and do the analysis and termination slowly afterward.

## Multi-Account Automation — One Procedure Across the Whole Organization

As you scale up, you have to apply the same remediation to hundreds of accounts. The **TargetLocations** parameter rolls one Automation execution out to multiple accounts and Regions at once.

```bash
aws ssm start-automation-execution \
  --document-name AWS-DisablePublicAccessForS3Bucket \
  --target-locations '[{
    "Accounts": ["ou-abcd-12345678"],
    "Regions": ["us-east-1", "ap-northeast-2"],
    "TargetLocationMaxConcurrency": "10",
    "TargetLocationMaxErrors": "5"
  }]'
```

`MaxConcurrency` (the number of concurrent executions) and `MaxErrors` (the number of tolerated errors) are the key safeguards.

> `MaxConcurrency`/`MaxErrors` provide **blast radius control** for large-scale automation. If you push a change to all accounts at once, a bug breaks the whole organization simultaneously. Limiting concurrency makes the change spread gradually, and when the error threshold (`MaxErrors`) is exceeded it stops automatically to contain the damage. This is exactly the same idea as the **canary/rolling** deployment strategies — start small, expand while checking health, and stop when problems appear. The first principle of safe operations, "every change should be gradual and reversible," applies to automation executions as well.

## Automation vs. Step Functions vs. Lambda — The Boundaries of Tool Choice

These three tools are often compared. You need clear boundaries so you don't get confused on the exam.

| | SSM Automation | Step Functions | Lambda |
|--|----------------|----------------|--------|
| Essence | Operational procedure workflow | General-purpose state machine | Single function execution |
| Strengths | AWS operational tasks, managed runbooks, `aws:approve` | Complex branching, parallelism, Map, long-running execution | Short custom logic |
| Human approval | `aws:approve` built in | Implemented with Activity/callback | Implement it yourself |
| Suited for | "RDS restart procedure," "S3 remediation" | "Order-processing saga," "ETL orchestration" | "Event transformation," "simple isolation" |

> The boundaries among the three are a **trade-off between expressiveness and simplicity**. Lambda is the simplest, but you have to write orchestration (retries, branching, state) yourself in code. Step Functions has the highest expressiveness (parallelism, Map, Choice, long waits) but comes with a learning curve and the cost of writing ASL (Amazon States Language). Automation sits in between and is **specialized for operational tasks** — AWS API calls, instance commands, managed runbooks, and human approval are first-class citizens, so it is the most natural for writing operational procedures. Anti-patterns: building a complex business workflow (order → payment → shipping) in Automation, or over-engineering a simple operational remediation with Step Functions. The tool should match the shape of the problem.

## Summary

There are five pictures from today. First, **Runbook-as-Code evolves a procedure that began as a paper binder in the ops room into executable code**, implementing the Operational Excellence principle of "operations as code." Second, **the `assumeRole` of an Automation Document repositions the permission boundary at the procedure level**, enabling controlled privilege delegation. Third, **`aws:approve` resolves the paradox of automation through human-in-the-loop**, placing a human gate according to reversibility and implementing separation of duties through multi-party approval (the two-person rule). Fourth, **EventBridge→Automation connects detection to response**, and the key is the order: isolation (reversible) immediately, termination (irreversible) after approval. Fifth, **MaxConcurrency/MaxErrors in Multi-Account is blast radius control**, following the same principle of gradual, reversible change as canary/rolling.

In the next article, we take a deep look at the **Lambda auto-healing** pattern, in which the system heals itself without even human approval, and at the safety nets that stop it from running away.

---

## 📝 Practice Questions

**Question 1.** You want operators to be able to perform `s3:PutBucketPolicy` through a vetted procedure without granting them that dangerous permission directly. Which pattern is most appropriate?

A) Grant operators the PowerUser policy

B) Put the permission in the Automation Document's assumeRole, and grant operators only ssm:StartAutomationExecution for specific documents

C) Grant operators the permission but audit afterward with CloudTrail

D) Work with the root account

**Answer: B**

Explanation: An Automation Document operates with the permissions of the document's assumeRole, not those of the person who ran it. If you put the dangerous permission in the runbook's role and give operators only the right to start that document, operators can use the permission only through the vetted procedure and cannot wield it arbitrarily. This implements the principle of least privilege at the procedure level (the same idea as sudo's per-command privilege escalation). PowerUser (A), direct granting (C), and root (D) all widen permissions excessively and violate least privilege.

---

**Question 2.** GuardDuty detected unauthorized access with severity 8 on an EC2 instance. You want isolation, evidence preservation, and notification to run immediately and automatically, and instance termination to happen after human approval. What is the correct step order and design?

A) Run termination automatically first to eliminate the threat, then analyze

B) Isolate (move to sg-quarantine) → create snapshot → notify → aws:approve (senior approval) → terminate. Reversible tasks run unattended, and only the irreversible termination gets an approval gate

C) Have a person execute every step manually

D) Send only a notification without isolation, and let a person decide

**Answer: B**

Explanation: The key is to divide the automation boundary according to reversibility. Isolation (moving the security group), the snapshot (evidence preservation), and notification are reversible and non-destructive, so they run immediately and unattended to reduce MTTR and stop damage from spreading. Termination is irreversible and destructive, so it gets a human approval gate with aws:approve. The reason to isolate before terminating is to contain the threat immediately. Terminating first (A) kills a healthy instance on a false positive and loses evidence, doing everything manually (C) lengthens MTTR, and notification without isolation (D) lets the threat keep spreading.

---

**Question 3.** An incident automation that includes an aws:approve step froze indefinitely in the "waiting for approval" state at dawn, when the approver missed the notification. What is the fundamental preventive measure?

A) Remove the approval step and fully automate

B) Set timeoutSeconds, and on timeout use onFailure to branch to escalation (the next approval group) or a safe default action

C) Reduce the approvers to one

D) Switch from Automation to Lambda

**Answer: B**

Explanation: You must always set timeoutSeconds on aws:approve. Without a timeout, the workflow freezes forever when the approver is away, which is fatal in the middle of an incident. On timeout, use onFailure to branch to escalation to the next approval group or a safe default action such as "do nothing and hand off to a person." Removing approval (A) removes the safeguard for dangerous tasks, reducing the approvers (C) only reduces the chance of no response and doesn't prevent indefinite waiting, and switching to Lambda (D) loses the human approval feature.

---

**Question 4.** You want to apply the same S3 public-access-blocking remediation to 200 accounts, while making sure that a bug doesn't break all of them at once. What is the correct configuration?

A) Apply to all 200 accounts at once

B) Specify OUs/Regions with TargetLocations, and control the blast radius with MaxConcurrency (concurrency limit) and MaxErrors (error threshold)

C) Log in to each account and run it manually

D) Apply it to only one account and give up on the rest

**Answer: B**

Explanation: TargetLocations in Multi-Account Automation rolls one execution out to multiple accounts and Regions, while MaxConcurrency limits the number of concurrent executions and MaxErrors automatically stops execution when errors exceed the threshold, containing the blast radius. This is the same idea as canary/rolling deployment, making the change gradual and reversible. Applying everything at once (A) lets a bug break all 200 accounts together, manual work (C) is unrealistic at scale, and applying to only some (D) fails to achieve the goal.

---

**Question 5.** You want to codify the "standard operating procedure for restarting an RDS instance." If AWS already provides something, what is the standard approach?

A) Write an Automation Document from scratch

B) Look for a managed runbook first (such as AWS-RestartRdsInstance), use it, and customize only what is needed

C) Write code that calls the RDS API directly with Lambda

D) Restart manually from the console

**Answer: B**

Explanation: AWS provides hundreds of managed Automation Documents, and for common operational tasks (EC2 start/stop, RDS restart, S3 public access blocking, Config violation remediation, and so on), the standard practice is to look for a managed document before writing your own. By not reinventing the wheel, you can use a vetted procedure immediately and shed the maintenance burden. Writing from scratch (A) and coding Lambda directly (C) duplicate what already exists, and a manual restart (D) throws away the benefits of codification and reproducibility.

---

**Question 6.** You are deciding between SSM Automation and Step Functions. If "each step is an AWS operations API call, human approval is needed in the middle, and the procedure is mostly linear," which should you choose?

A) Step Functions — because it is always more powerful

B) SSM Automation — AWS operational tasks, managed runbooks, and aws:approve are first-class citizens, making it the most natural for operational procedures

C) Handle everything with a single Lambda

D) Both are unsuitable; use EventBridge

**Answer: B**

Explanation: SSM Automation is specialized for operational tasks, and AWS API calls (aws:executeAwsApi), instance commands, managed runbooks, and human approval (aws:approve) are all first-class citizens. When human approval is part of an operational procedure that is linear to lightly branching, Automation is the most natural. Step Functions (A) is strong at complex branching, parallelism, Map, and long-running execution, but it is overkill for a simple operational procedure and requires you to implement human approval yourself with callbacks. Lambda (C) requires you to write the orchestration and approval yourself, and EventBridge (D) is routing, not a workflow executor.

---

**Question 7.** You want to use a snapshot ID created in one Automation step to tag it in the next step. What is the method for passing data between steps?

A) Store it in a global variable

B) Define outputs in the earlier step (extracting the value with a Selector), and reference it in the next step as {{StepName.OutputName}}

C) Store it temporarily in DynamoDB

D) Impossible — each step is independent

**Answer: B**

Explanation: An Automation step extracts a value from the result with a Selector (JSONPath) in outputs and gives it a name, and the next step references it with the {{StepName.OutputName}} syntax. This output passing makes Automation not a simple script but a stateful workflow (DAG execution). Global variables (A) and external storage (C) are unnecessary detours, and since passing between steps is clearly possible, D is wrong.

---

## 📌 Today's Summary

There are five key points from today. First, Runbook-as-Code is the implementation of "operations as code," evolved from the paper binder in a mainframe operations room into executable code, giving consistency, reproducibility, auditing, and removal of dependence on veterans. Second, the assumeRole of an Automation Document repositions the permission boundary at the procedure level, implementing least-privilege delegation in which operators use dangerous permissions only through a vetted runbook instead of being given them directly. Third, aws:approve resolves the paradox of automation through human-in-the-loop, placing a human gate only on irreversible tasks according to reversibility (Type 1/Type 2 decisions) and implementing separation of duties with MinRequiredApprovals (the two-person rule), with a timeout being mandatory. Fourth, EventBridge→Automation connects detection (what happened) to response (what to do), the key being the order — isolation and evidence preservation immediately and automatically, termination after approval — and managed runbooks mean you don't reinvent the wheel. Fifth, TargetLocations and MaxConcurrency/MaxErrors in Multi-Account provide blast radius control, applying the gradual, reversible change principle of canary/rolling to automation executions.
